import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import { loadManifest, validateResultDocument } from "./manifest.ts";
import {
  EXIT_GATE_ERROR,
  EXIT_GREEN,
  EXIT_NOT_APPLICABLE,
  EXIT_RED,
  M2_C_2_DETAIL,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
  statusForExitCode,
} from "./result.ts";
import type { GateEntry, GateManifest, PreconditionSpec, RunParameter } from "./manifest.ts";
import type { GateResult, GateStatus, PreconditionRecord } from "./result.ts";

/**
 * THE GATE RUNNER (kernel plan M2, M2-P1 step 7 and step 8).
 *
 * Runs the manifest's gates sequentially in the foreground as subprocesses,
 * captures each one's stdout and stderr into the evidence directory,
 * ingests each one's result record, and writes `summary.json`.
 *
 * C-3, STRUCTURALLY: `spawnSync` only, no `detached`, no `unref`, no flag
 * anywhere that lets a gate outlive this process. C-2, STRUCTURALLY: nothing
 * here reads a pid, probes a process, sends a signal or touches /proc; a
 * gate's outcome is its RECORD plus its exit code, never its liveness.
 *
 * THE GATE SUBPROCESS CONTRACT, stated once because eight phases build
 * against it:
 *
 *   invocation  <command...> --result <abs path> --evidence <abs dir>
 *               plus one --<name> <value> for each parameter the gate
 *               DECLARES in the manifest (base, head, phase)
 *   cwd         the runner's working directory
 *   output      exactly one GateResult JSON document at --result
 *   exit codes  0 green, 1 red, 20 not-applicable, 21 error, 64 usage
 *
 * WHY PARAMETERS ARE DECLARED AND NOT INFERRED. Step 7 requires a gate
 * "whose command requires --phase" to report `error` when `--phase` is
 * absent. The runner can only know that from a declaration or by
 * pattern-matching the gate's command line, and MECHANISMS.md's row
 * "Deciding what another program will do by pattern-matching the text of a
 * file it consumes" records four fix rounds paid for the second option. So
 * the manifest declares it, the schema validates it, and the runner reads
 * it. This adds one field to the plan's manifest field list and is declared
 * as a deviation in the work history.
 *
 * INGEST IS ADVERSARIAL TOWARDS ITS OWN GATES. A gate is another program:
 * it can exit 0 having written nothing, exit nonzero because Node threw,
 * write a record for a different gate, write a record whose status
 * contradicts its exit code, or write a green record having examined
 * nothing. Every one of those is `error`, because `error` is what "I cannot
 * tell you whether the property holds" is called (M2-C-3), and because
 * every one of them otherwise reads as a pass.
 *
 * M2-C-6 IS WIRED AT FOUR PLACES, all of them paths from outside: the
 * manifest path (in `loadManifest`), the evidence directory, every
 * `file-exists` and `file-absent` precondition target, and every gate's
 * record file, which is probed BEFORE the gate is spawned as well as after
 * it returns. Probing before the spawn is the load-bearing half: a gate
 * handed a named pipe to write its record into would block in the kernel
 * forever and the runner would wait on it forever, so the run has to be
 * refused before the child exists.
 */

export interface RunOptions {
  manifestPath: string;
  evidenceDir: string;
  base?: string;
  head?: string;
  phase?: string;
  only?: string[];
  /** Working directory for gate subprocesses and git. Defaults to cwd. */
  cwd?: string;
}

export interface GateSummaryRow {
  id: string;
  status: GateStatus;
  units: number;
  unitLabel: string;
  vacuous: boolean;
  applicable: boolean;
  detail: string;
  record?: string;
  stdout?: string;
  stderr?: string;
}

export interface RunSummary {
  manifest: string;
  manifestSha256: string;
  startedAt: string;
  endedAt: string;
  parameters: { base?: string; head?: string; phase?: string };
  only: string[];
  manifestGates: number;
  gates: GateSummaryRow[];
  counts: {
    declared: number;
    applicable: number;
    green: number;
    red: number;
    "not-applicable": number;
    error: number;
    vacuous: number;
  };
  exitCode: number;
  reason: string;
}

export interface RunOutcome {
  exitCode: number;
  summary?: RunSummary;
  /** Set when the run could not start at all (no summary to write). */
  reason?: string;
}

export const NO_APPLICABLE_GATE = "no applicable gate";

function now(): string {
  return new Date().toISOString();
}

function isRealDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Create a directory, refusing a path that exists and is not a real
 * directory. Never opens anything, so a named pipe here reports rather than
 * blocking.
 */
function ensureDirectory(path: string): string | undefined {
  const entry = classifyEntry(path);
  if (entry.kind === "regular") {
    return `${path} is a regular file, not a directory`;
  }
  if (entry.kind === "unexaminable") {
    return entry.reason;
  }
  if (entry.kind === "irregular" && !isRealDirectory(path)) {
    return entry.reason;
  }
  const made = runStep(`creating ${path}`, () =>
    mkdirSync(path, { recursive: true }),
  );
  return made.ok ? undefined : made.reason;
}

/** Write a file, refusing any path that is not safe to open for writing. */
function guardedWrite(path: string, body: string): string | undefined {
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    return refusal;
  }
  const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
  return written.ok ? undefined : written.reason;
}

/**
 * Which run parameters a gate cannot be evaluated without.
 *
 * Derived from two places and nowhere else: the gate's own `parameters`
 * declaration, and the precondition kind, whose needs are a property of the
 * kind rather than of the gate. `branch-matches` requires `--phase`
 * unconditionally rather than only when the pattern happens to interpolate
 * it, which is stricter than necessary and deliberately so: M2-C-3 says a
 * check that cannot reach a verdict fails closed, and the cost of the strict
 * reading is one flag on an invocation that already carries three.
 */
export function requiredParameters(entry: GateEntry): RunParameter[] {
  const required = new Set<RunParameter>(entry.parameters ?? []);
  const kind = entry.precondition?.kind;
  if (kind === "diff-touches") {
    required.add("base");
  }
  if (kind === "branch-matches") {
    required.add("phase");
  }
  return [...required].sort();
}

type PreconditionOutcome =
  | { kind: "met"; record: PreconditionRecord }
  | { kind: "unmet"; record: PreconditionRecord }
  | { kind: "error"; reason: string };

function gitLines(
  cwd: string,
  args: string[],
): { ok: true; lines: string[] } | { ok: false; reason: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} exited ${String(result.status)}: ${singleLine(result.stderr ?? "")}`,
    };
  }
  return {
    ok: true,
    lines: (result.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  };
}

function evaluatePrecondition(
  precondition: PreconditionSpec,
  options: RunOptions,
  cwd: string,
): PreconditionOutcome {
  const id = precondition.id;
  if (precondition.kind === "file-exists" || precondition.kind === "file-absent") {
    const path = precondition.path;
    if (path === undefined) {
      return { kind: "error", reason: `precondition ${id} declares no path` };
    }
    const entry = classifyEntry(path);
    if (entry.kind === "irregular" || entry.kind === "unexaminable") {
      // M2-C-6: present, and not a thing this gate may open. Reporting the
      // observed type is the whole point; guessing "unmet" would be a
      // verdict about a path nobody examined.
      return { kind: "error", reason: entry.reason };
    }
    const present = entry.kind === "regular";
    const wanted = precondition.kind === "file-exists";
    const met = present === wanted;
    const record: PreconditionRecord = {
      id,
      met,
      reason: present
        ? `${path} is a regular file`
        : `${path} does not exist`,
      evidence: [path],
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  if (precondition.kind === "branch-matches") {
    const pattern = precondition.pattern;
    if (pattern === undefined) {
      return { kind: "error", reason: `precondition ${id} declares no pattern` };
    }
    if (options.phase === undefined) {
      return {
        kind: "error",
        reason: `precondition ${id} is kind branch-matches and --phase was not supplied`,
      };
    }
    const branch = gitLines(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch.ok) {
      return { kind: "error", reason: branch.reason };
    }
    const name = branch.lines[0] ?? "";
    const source = pattern.split("{phase}").join(options.phase);
    let expression: RegExp;
    try {
      expression = new RegExp(source);
    } catch (error) {
      return {
        kind: "error",
        reason: `precondition ${id} pattern ${source} is not a valid expression: ${(error as Error).message}`,
      };
    }
    const met = expression.test(name);
    const record: PreconditionRecord = {
      id,
      met,
      reason: `branch ${name} ${met ? "matches" : "does not match"} ${source}`,
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  if (precondition.kind === "diff-touches") {
    const paths = precondition.paths;
    if (paths === undefined || paths.length === 0) {
      return { kind: "error", reason: `precondition ${id} declares no paths` };
    }
    if (options.base === undefined) {
      return {
        kind: "error",
        reason: `precondition ${id} is kind diff-touches and --base was not supplied`,
      };
    }
    const head = options.head ?? "HEAD";
    const changed = gitLines(cwd, [
      "diff",
      "--name-only",
      `${options.base}...${head}`,
    ]);
    if (!changed.ok) {
      return { kind: "error", reason: changed.reason };
    }
    const touched = changed.lines.filter((line) =>
      paths.some((prefix) => line === prefix || line.startsWith(prefix)),
    );
    const met = touched.length > 0;
    const record: PreconditionRecord = {
      id,
      met,
      reason: met
        ? `${String(touched.length)} changed path(s) under ${paths.join(", ")}`
        : `no changed path under ${paths.join(", ")}`,
      evidence: touched,
    };
    return met ? { kind: "met", record } : { kind: "unmet", record };
  }

  const command = precondition.command;
  if (command === undefined || command.length === 0) {
    return { kind: "error", reason: `precondition ${id} declares no command` };
  }
  const result = spawnSync(command[0] as string, command.slice(1), {
    cwd,
    encoding: "utf8",
  });
  if (result.error !== undefined) {
    // The command does not exist, or could not be executed. That is not
    // "the precondition is unmet": nothing was evaluated (M2-C-3).
    return {
      kind: "error",
      reason: `precondition ${id} command ${command.join(" ")} could not be run: ${singleLine(String(result.error))}`,
    };
  }
  if (result.signal !== null && result.signal !== undefined) {
    return {
      kind: "error",
      reason: `precondition ${id} command ${command.join(" ")} was terminated by ${result.signal}`,
    };
  }
  const met = result.status === 0;
  const record: PreconditionRecord = {
    id,
    met,
    reason: `${command.join(" ")} exited ${String(result.status)}`,
  };
  return met ? { kind: "met", record } : { kind: "unmet", record };
}

function errorResult(
  entry: GateEntry,
  startedAt: string,
  detail: string,
  precondition?: PreconditionRecord,
): GateResult {
  return makeGateResult({
    gate: entry.id,
    status: "error",
    units: 0,
    unitLabel: entry.unitLabel,
    startedAt,
    endedAt: now(),
    detail,
    precondition,
  });
}

interface GateOutcome {
  result: GateResult;
  applicable: boolean;
  recordPath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

function runOneGate(
  entry: GateEntry,
  options: RunOptions,
  cwd: string,
  evidenceDir: string,
): GateOutcome {
  const startedAt = now();
  const gateDir = join(evidenceDir, entry.id);
  const dirRefusal = ensureDirectory(gateDir);
  if (dirRefusal !== undefined) {
    return {
      result: errorResult(entry, startedAt, dirRefusal),
      applicable: false,
    };
  }
  const recordPath = join(gateDir, "result.json");
  const stdoutPath = join(gateDir, "stdout.txt");
  const stderrPath = join(gateDir, "stderr.txt");

  // Parameters first: a gate invoked without something it needs measured
  // nothing, and that is `error`, never `not-applicable` (M2-C-3, M2R-003).
  const missing = requiredParameters(entry).filter(
    (name) => options[name] === undefined,
  );
  if (missing.length > 0) {
    return {
      result: errorResult(
        entry,
        startedAt,
        `gate ${entry.id} requires ${missing.map((name) => `--${name}`).join(" ")}, which was not supplied`,
      ),
      applicable: false,
    };
  }

  if (entry.precondition !== undefined) {
    const outcome = evaluatePrecondition(entry.precondition, options, cwd);
    if (outcome.kind === "error") {
      return {
        result: errorResult(entry, startedAt, outcome.reason),
        applicable: false,
      };
    }
    if (outcome.kind === "unmet") {
      return {
        result: makeGateResult({
          gate: entry.id,
          status: "not-applicable",
          units: 0,
          unitLabel: entry.unitLabel,
          startedAt,
          endedAt: now(),
          detail: `precondition ${outcome.record.id} evaluated and unmet: ${outcome.record.reason}`,
          precondition: outcome.record,
        }),
        applicable: false,
      };
    }
  }

  // The record path is probed BEFORE the child exists. A named pipe here
  // would block the gate in the kernel forever and the runner behind it.
  const recordRefusal = refuseOpenForWrite(recordPath);
  if (recordRefusal !== undefined) {
    return {
      result: errorResult(
        entry,
        startedAt,
        `${recordRefusal}; refusing to run gate ${entry.id}`,
      ),
      applicable: false,
    };
  }
  const cleared = runStep(`clearing ${recordPath}`, () =>
    rmSync(recordPath, { force: true }),
  );
  if (!cleared.ok) {
    return {
      result: errorResult(entry, startedAt, cleared.reason),
      applicable: false,
    };
  }

  const argv = [...entry.command.slice(1), "--result", recordPath, "--evidence", gateDir];
  for (const name of requiredParameters(entry)) {
    argv.push(`--${name}`, options[name] as string);
  }
  const child = spawnSync(entry.command[0] as string, argv, {
    cwd,
    encoding: "utf8",
  });
  const stdoutRefusal = guardedWrite(stdoutPath, child.stdout ?? "");
  const stderrRefusal = guardedWrite(stderrPath, child.stderr ?? "");
  const captureRefusal = stdoutRefusal ?? stderrRefusal;

  const ingested = ingestGateRun(entry, startedAt, recordPath, child, captureRefusal);
  return {
    result: ingested,
    applicable: true,
    recordPath,
    stdoutPath,
    stderrPath,
  };
}

/**
 * Turn one gate subprocess's exit code plus whatever it left at the record
 * path into a GateResult. Every path that is not "the gate said what it
 * meant" ends at `error`.
 */
function ingestGateRun(
  entry: GateEntry,
  startedAt: string,
  recordPath: string,
  child: ReturnType<typeof spawnSync>,
  captureRefusal: string | undefined,
): GateResult {
  if (captureRefusal !== undefined) {
    return errorResult(entry, startedAt, captureRefusal);
  }
  if (child.error !== undefined) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} could not be run: ${singleLine(String(child.error))}`,
    );
  }
  if (child.signal !== null && child.signal !== undefined) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} was terminated by ${child.signal}`,
    );
  }
  const exitCode = child.status ?? -1;

  const entryClass = classifyEntry(recordPath);
  if (entryClass.kind === "irregular" || entryClass.kind === "unexaminable") {
    return errorResult(entry, startedAt, entryClass.reason);
  }
  if (entryClass.kind !== "regular") {
    // No record. A nonzero exit here is NOT red: Node exits 1 on an uncaught
    // exception, which collides exactly with the red code, so a crash and a
    // refutation would be indistinguishable (step 7).
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} exited ${String(exitCode)} without writing a result record at ${recordPath}`,
    );
  }
  const read = readRegularFileIfPresent(recordPath);
  if (read.kind !== "read") {
    return errorResult(
      entry,
      startedAt,
      read.kind === "refused"
        ? read.reason
        : `gate ${entry.id} result record vanished at ${recordPath}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} result record does not parse: ${(error as Error).message}`,
    );
  }
  const diagnostics = validateResultDocument(parsed);
  if (diagnostics.length > 0) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} result record is invalid: ${diagnostics.join("; ")}`,
    );
  }
  const record = parsed as GateResult;
  if (record.gate !== entry.id) {
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} wrote a record for ${record.gate}`,
    );
  }
  const expected = exitCodeForStatus(record.status);
  if (exitCode !== expected) {
    const named = statusForExitCode(exitCode);
    return errorResult(
      entry,
      startedAt,
      `gate ${entry.id} recorded status ${record.status} (exit ${String(expected)}) but exited ${String(exitCode)}` +
        (named === undefined ? "" : ` (${named})`),
    );
  }
  if (record.status === "green" && record.units === 0) {
    // The constructor cannot produce this, but a gate that does not use the
    // constructor can, and that is exactly the party this rule is aimed at.
    return {
      ...record,
      status: "error",
      vacuous: true,
      detail:
        record.detail === ""
          ? M2_C_2_DETAIL
          : `${M2_C_2_DETAIL}; the gate reported: ${record.detail}`,
    };
  }
  return record;
}

/**
 * Run the manifest's gates. Returns the aggregate exit code and, when the
 * run got far enough to have one, the summary that was written.
 */
export function runGates(options: RunOptions): RunOutcome {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = now();

  const loaded = loadManifest(options.manifestPath);
  if (!loaded.ok) {
    return {
      exitCode: EXIT_GATE_ERROR,
      reason: [loaded.reason, ...loaded.diagnostics].join("\n"),
    };
  }
  const manifest: GateManifest = loaded.manifest;

  const dirRefusal = ensureDirectory(options.evidenceDir);
  if (dirRefusal !== undefined) {
    return { exitCode: EXIT_GATE_ERROR, reason: dirRefusal };
  }

  const only = options.only ?? [];
  if (only.length > 0) {
    const known = new Set(manifest.gates.map((gate) => gate.id));
    const unknown = only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return {
        exitCode: EXIT_GATE_ERROR,
        reason: `--only names no such gate: ${unknown.join(", ")}`,
      };
    }
  }
  const selected =
    only.length > 0
      ? manifest.gates.filter((gate) => only.includes(gate.id))
      : manifest.gates;

  const rows: GateSummaryRow[] = [];
  const counts = {
    declared: selected.length,
    applicable: 0,
    green: 0,
    red: 0,
    "not-applicable": 0,
    error: 0,
    vacuous: 0,
  };
  const requiredNotApplicable: string[] = [];

  for (const entry of selected) {
    const outcome = runOneGate(entry, options, cwd, options.evidenceDir);
    const result = outcome.result;
    if (outcome.applicable) {
      counts.applicable += 1;
    }
    counts[result.status] += 1;
    if (result.vacuous === true) {
      counts.vacuous += 1;
    }
    if (result.status === "not-applicable" && entry.applicability === "required") {
      requiredNotApplicable.push(entry.id);
    }
    // The runner owns the record on disk whenever it produced or changed
    // one: a not-applicable gate never ran and wrote nothing, and a rewritten
    // vacuous green must not stay green in the evidence (criterion 4).
    const recordPath = outcome.recordPath ?? join(options.evidenceDir, entry.id, "result.json");
    const dirRefusalForGate = ensureDirectory(join(options.evidenceDir, entry.id));
    if (dirRefusalForGate === undefined) {
      guardedWrite(recordPath, renderGateResult(result));
    }
    rows.push({
      id: entry.id,
      status: result.status,
      units: result.units,
      unitLabel: result.unitLabel,
      vacuous: result.vacuous === true,
      applicable: outcome.applicable,
      detail: result.detail,
      record: dirRefusalForGate === undefined ? recordPath : undefined,
      stdout: outcome.stdoutPath,
      stderr: outcome.stderrPath,
    });
  }

  // AGGREGATE PRECEDENCE, fixed here so it is one rule and not a reading.
  // A concrete failure outranks the vacuity check, because "3 gates reported
  // error" tells the operator more than "no applicable gate" and both exit
  // 21 anyway. The vacuity check outranks a required not-applicable gate,
  // because a bundle that examined nothing is not a report about any one
  // gate (M2-C-2 at the aggregate level, M2R-012).
  let exitCode = EXIT_GREEN;
  let reason = "every applicable gate is green";
  if (counts.error > 0) {
    exitCode = EXIT_GATE_ERROR;
    reason = `${String(counts.error)} gate(s) reported error: ${rows
      .filter((row) => row.status === "error")
      .map((row) => row.id)
      .join(", ")}`;
  } else if (counts.red > 0) {
    exitCode = EXIT_RED;
    reason = `${String(counts.red)} gate(s) reported red: ${rows
      .filter((row) => row.status === "red")
      .map((row) => row.id)
      .join(", ")}`;
  } else if (counts.applicable === 0) {
    exitCode = EXIT_GATE_ERROR;
    reason = NO_APPLICABLE_GATE;
  } else if (requiredNotApplicable.length > 0) {
    exitCode = EXIT_NOT_APPLICABLE;
    reason = `required gate(s) not applicable: ${requiredNotApplicable.join(", ")}`;
  }

  const parameters: RunSummary["parameters"] = {};
  if (options.base !== undefined) {
    parameters.base = options.base;
  }
  if (options.head !== undefined) {
    parameters.head = options.head;
  }
  if (options.phase !== undefined) {
    parameters.phase = options.phase;
  }

  const summary: RunSummary = {
    manifest: options.manifestPath,
    manifestSha256: loaded.sha256,
    startedAt,
    endedAt: now(),
    parameters,
    only,
    manifestGates: manifest.gates.length,
    gates: rows,
    counts,
    exitCode,
    reason,
  };
  const summaryPath = join(options.evidenceDir, "summary.json");
  const summaryRefusal = guardedWrite(
    summaryPath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  if (summaryRefusal !== undefined) {
    return { exitCode: EXIT_GATE_ERROR, summary, reason: summaryRefusal };
  }
  return { exitCode, summary, reason };
}
