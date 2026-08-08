import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEntry,
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
/* M3-P2 step 4. The registry is validated by the M3-P1 Ajv engine, not by
   M2's closed-keyword validator, because `schemas/gate-registry.schema.json`
   uses `if`/`then`. `loadTypeSchema` is imported from the validate COMMAND
   rather than re-deriving the shipped `schemas/` location here, because that
   walk is already written, already tested, and already correct in both the
   source and the dist layouts; a second copy would be a second thing to keep
   right. */
import { loadTypeSchema } from "../commands/validate.ts";
import { decodeDocument, formatDiagnostics, validateInstance } from "../validate.ts";
import type { SchemaDocument } from "../validate.ts";
import { loadManifest, validateManifestDocument, validateResultDocument } from "./manifest.ts";
import { comparePins, describePinDifference } from "./pin.ts";
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
 * WHAT "APPLICABLE" MEANS, fixed in round 1 (CR-800). It used to mean "the
 * runner spawned this gate", which is not the same thing and differed from it
 * on the one path that matters: a gate that decides its OWN applicability and
 * exits 20 with a `not-applicable` record was spawned, so it counted as
 * applicable, so the aggregate anti-vacuity rule never fired, so a bundle in
 * which zero gates were green exited 0 with the reason "every applicable gate
 * is green". The two routes to `not-applicable`, runner-evaluated and
 * gate-declared, were guarded differently, and the gate subprocess contract
 * documented above is what tells every gate author the second route exists.
 *
 * So there are now two counts and they answer two different questions:
 *
 *   applicable  the gate was reached AND did not report `not-applicable`,
 *               whichever side decided that. It is the denominator of "how
 *               much of this manifest was in play".
 *   verdict     the gate reached a GREEN OR RED verdict. It is the only
 *               count the anti-vacuity rule consults, because it is the only
 *               one that means work was actually done.
 *
 * The exit-0 success path is then structurally unable to describe an empty
 * green bucket: it is guarded by `verdict > 0` and asserted again before the
 * summary is written, so an internal inconsistency reports `error` rather
 * than a green nobody measured (SC-011, M2-C-2, M2R-012).
 *
 * ONE RUN OWNS ITS EVIDENCE DIRECTORY (CR-803). Two runners pointed at one
 * `--evidence` directory used to interleave on fixed per-gate paths: the
 * later runner ingested the earlier one's records as its own, and a genuine
 * red was converted to `error` while the surviving bundle was the other run's
 * green. That is the declared hazard "a runner that writes a record for a
 * gate it did not execute", and seven phases run this concurrently.
 *
 * The evidence directory is therefore CLAIMED with an O_EXCL create, the
 * pattern src/lock.ts already carries and which MECHANISMS.md requires a
 * third user to read first. Per that row's rule, a claim that cannot be taken
 * fails LOUDLY and NAMES THE STUCK FILE; there is no steal, no age heuristic
 * and no bounded wait, because an evidence directory is not a contended
 * resource by design and a silent wait would be indistinguishable from an
 * absence of contention. Every run also stamps a `runId` into its summary, so
 * a bundle is attributable, and the summary is replaced atomically through a
 * stage name carrying that runId, which no other run can collide with
 * (MECHANISMS.md, "Atomic file replacement").
 *
 * THE RUNNER OBEYS ITS OWN CRASH DISCIPLINE (CR-801). It used to enforce on
 * its gates the rule that Node's uncaught-exception exit code 1 collides with
 * this phase's own RED code, while itself exiting 1 on an escaping throw,
 * with no summary and, mid-bundle, a gate-authored green record left on disk.
 * `runGates` now folds any escaping throw into `EXIT_GATE_ERROR` AND writes a
 * summary marked aborted, so a consumer can always tell "a gate reported red"
 * from "the runner died before it could report".
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
  /**
   * M3-P2 step 4. When true, `manifestPath` names a canonical GATE REGISTRY
   * (`gate-registry.yaml`, `schemas/gate-registry.schema.json`) rather than an
   * M2-P1 gate manifest. The registry is a SUPERSET of the manifest, so it is
   * projected down to one and every line below this point is the M2 runner
   * unchanged: the same `runOneGate`, the same `ingestGateRun`, the same
   * `makeGateResult`. That is deliberate and it is what makes M2-C-2 and
   * M2-C-3 survive the promotion instead of being re-implemented beside it.
   */
  registry?: boolean;
  /**
   * Registry mode only: the assurance mode selecting entries, matched against
   * each entry's `modes[]`. Defaults to `full`.
   */
  mode?: string;
  /** Working directory for gate subprocesses and git. Defaults to cwd. */
  cwd?: string;
}

/**
 * A registry entry that declares a gate the runner CANNOT execute, because
 * D-11 settles that it is verified by a clean-room checklist probe rather
 * than by a script (R-043, R-044). It is reported rather than dropped, so
 * that "the report accounts for every gate in the registry" is a property a
 * reader can check from the run's own output instead of taking on trust.
 */
export interface DeclaredChecklistGate {
  id: string;
  probe: string;
  applicability: "required" | "conditional";
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
  /** Identity of THIS run. A bundle nobody can attribute is not evidence. */
  runId: string;
  manifest: string;
  /** M3-P2: true when `manifest` above named a gate registry, not a manifest. */
  registry?: boolean;
  /** M3-P2: the assurance mode that selected these gates. Registry runs only. */
  mode?: string;
  /**
   * M3-P2: registry entries selected by `mode` that the runner did not
   * execute because they are `verified-by: clean-room-checklist`. Empty for a
   * manifest run. `declared` in `counts` plus this array's length is the
   * number of registry entries the mode selected, which is how a reader
   * checks that the report accounts for every gate.
   */
  declaredByChecklist?: DeclaredChecklistGate[];
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
    /** green + red: gates that reached a verdict. The anti-vacuity count. */
    verdict: number;
    green: number;
    red: number;
    "not-applicable": number;
    error: number;
    vacuous: number;
  };
  /** Named here as well as in the rows, because the reason line is one line. */
  requiredNotApplicable: string[];
  /** True when a throw escaped the run and this summary is a partial record. */
  aborted: boolean;
  exitCode: number;
  reason: string;
}

export interface RunOutcome {
  /**
   * THIS run's identity, on every outcome including a refusal (CR-861). The
   * runId used to live only inside `summary.json`, so a caller had no way to
   * tell whether the summary it was reading was its own: after a refusal the
   * previous run's green summary sat there, `aborted: false`, exit 0, with
   * nothing to mark it stale. Attribution needs the caller to know the id it
   * should expect, and this is where it gets it.
   */
  runId: string;
  exitCode: number;
  summary?: RunSummary;
  /** Set when the run could not start at all (no summary to write). */
  reason?: string;
  // CR-903. A `refused?: boolean` used to sit here with one producer and zero
  // readers: `src/commands/gates.ts` is the only caller of `runGates` and it
  // consumes `runId`, `exitCode`, `summary` and `reason`. It is removed rather
  // than wired, because the discriminator a consumer actually needs already
  // exists and is stronger: CR-861 put THIS run's id on every outcome, so a
  // caller compares the id it was given with the one inside `summary.json` and
  // learns whether the bundle is its own. A boolean saying "somebody else owns
  // that directory" adds nothing that comparison does not already give, and an
  // unread field on an exported interface is a promise seven concurrent phases
  // would build against with nothing testing it. If M2-P9 wants a typed
  // discriminator it should add one together with the code that reads it.
}

export const NO_APPLICABLE_GATE = "no applicable gate";

/** The default assurance mode when `--registry` is given without `--mode`. */
export const DEFAULT_MODE = "full";

interface RegistryGateEntry {
  id: string;
  command?: string[];
  unitLabel: string;
  applicability: "required" | "conditional";
  "verified-by": "script" | "clean-room-checklist";
  probe?: string;
  modes: string[];
  events: string[];
  parameters?: RunParameter[];
  precondition?: PreconditionSpec;
}

export type RegistryLoad =
  | {
      ok: true;
      manifest: GateManifest;
      sha256: string;
      body: string;
      declaredByChecklist: DeclaredChecklistGate[];
    }
  | { ok: false; reason: string; diagnostics: string[] };

/**
 * LOAD A CANONICAL GATE REGISTRY AND PROJECT IT ONTO AN M2 GATE MANIFEST
 * (kernel plan M3, M3-P2 steps 2 and 4; R-094).
 *
 * The registry is a SUPERSET of the M2-P1 manifest, so the promotion is a
 * projection and not a rewrite, and this function is the whole of it. Four
 * things happen here and each one is load-bearing:
 *
 *   1. The path is operator-supplied, so it is READ through the delivered
 *      `readRegularFileIfPresent` (M2-C-6). A named pipe reports the observed
 *      type and never blocks.
 *   2. The document is DECODED (YAML or JSON, `decodeDocument`) and then
 *      VALIDATED against `schemas/gate-registry.schema.json` through the
 *      M3-P1 Ajv engine. Decoding and validation are separate stages and
 *      produce distinguishable diagnostics (DR-0013 YAML clause 3). The
 *      registry schema is NOT validated by `src/gates/validate.ts`: it uses
 *      `if`/`then`, which is outside M2-D-04's closed keyword set, which is
 *      exactly why it lives in the shipped `schemas/` directory.
 *   3. Entries are selected by MODE and by `verified-by`. A
 *      `clean-room-checklist` entry has no process to run (D-11: R-043 and
 *      R-044 are not computable from a diff), so it is reported as declared
 *      rather than silently dropped.
 *   4. The projected manifest is validated AGAIN, against the M2 manifest
 *      schema, by `validateManifestDocument`. That second validation is the
 *      superset claim turned into a check: if a projection is not a valid M2
 *      manifest then the registry is not a superset of the manifest, and the
 *      run refuses rather than proceeding on a document the M2 contract does
 *      not recognise.
 *
 * Everything after this function is the M2 runner untouched, so M2-C-2 (never
 * green by omission) and M2-C-3 (fail closed) apply to registry runs by
 * CONSTRUCTION rather than by being remembered. A `--registry` path that
 * built `GateResult` literals of its own would be the realistic way those two
 * constraints get dropped by a promotion, and there is no such path.
 */
export function loadRegistry(path: string, mode: string): RegistryLoad {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, reason: `registry ${path} does not exist`, diagnostics: [] };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason, diagnostics: [] };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason, diagnostics: [] };
  }
  let schema: SchemaDocument;
  try {
    schema = loadTypeSchema("gate-registry");
  } catch (error) {
    return {
      ok: false,
      reason: `the gate-registry schema could not be loaded: ${singleLine((error as Error).message)}`,
      diagnostics: [],
    };
  }
  const diagnostics = formatDiagnostics(validateInstance(schema, decoded.value));
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `registry ${path} is not a valid gate registry`,
      diagnostics,
    };
  }

  const document = decoded.value as {
    gates: RegistryGateEntry[];
    destructiveCommands: string[];
    version: number;
  };
  const declaredModes = new Set<string>();
  for (const entry of document.gates) {
    for (const name of entry.modes) {
      declaredModes.add(name);
    }
  }
  if (!declaredModes.has(mode)) {
    // FAIL CLOSED (M2-C-3). A mode no entry declares selects nothing, and a
    // run of nothing that exited 0 would be the vacuous pass this registry
    // exists to prevent. The known modes are named so the operator can see
    // the typo rather than guess at an empty bundle.
    return {
      ok: false,
      reason:
        `registry ${path} declares no gate for mode ${mode}; declared mode(s): ` +
        `${[...declaredModes].sort().join(", ")}`,
      diagnostics: [],
    };
  }

  const inMode = document.gates.filter((entry) => entry.modes.includes(mode));
  const declaredByChecklist: DeclaredChecklistGate[] = inMode
    .filter((entry) => entry["verified-by"] === "clean-room-checklist")
    .map((entry) => ({
      id: entry.id,
      probe: entry.probe as string,
      applicability: entry.applicability,
    }));

  const gates: GateEntry[] = inMode
    .filter((entry) => entry["verified-by"] === "script")
    .map((entry) => {
      const projected: GateEntry = {
        id: entry.id,
        command: entry.command as string[],
        unitLabel: entry.unitLabel,
        applicability: entry.applicability,
        modes: entry.modes,
      };
      if (entry.parameters !== undefined) {
        projected.parameters = entry.parameters;
      }
      if (entry.precondition !== undefined) {
        projected.precondition = entry.precondition;
      }
      return projected;
    });

  const manifest: GateManifest = {
    version: document.version,
    gates,
    destructiveCommands: document.destructiveCommands,
  };
  const projectionDiagnostics = validateManifestDocument(manifest);
  if (projectionDiagnostics.length > 0) {
    return {
      ok: false,
      reason:
        `registry ${path} projected onto an M2 gate manifest that the M2 schema refuses, ` +
        "so this registry is not a superset of the manifest it promotes",
      diagnostics: projectionDiagnostics,
    };
  }
  return {
    ok: true,
    manifest,
    sha256: createHash("sha256").update(read.body).digest("hex"),
    body: read.body,
    declaredByChecklist,
  };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Escape a value being substituted into regex SOURCE. The set is the one
 * MDN documents for this purpose; `-` is included because it is special
 * inside a character class and a substituted value can land in one.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\\-]/g, "\\$&");
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

/**
 * MUTATE ONLY WHILE THIS RUN HOLDS THE CLAIM (CR-860, then CR-900).
 *
 * The finding's mechanism is *a mutation of evidence-directory state
 * performed from a frame that does not know whether the claim is held*.
 *
 * CR-900 is the correction of ONE WORD in that sentence. Round two read the
 * mechanism as being about WRITES, built `writeInsideClaim` around
 * `writeFileSync`, derived its coverage by grepping for the name of its own
 * new wrapper, and concluded that every write into the directory verified the
 * claim. That sentence was true and it was not the property that mattered,
 * because a directory's state is mutated by six operations and not by one:
 *
 *   CREATE, CONTENT-WRITE, DELETE, RENAME, MKDIR, and SUBPROCESS DISPATCH
 *   that will write there.
 *
 * A two-gate construction defeated the total claim in one run: the runner
 * `rmSync`ed a foreign holder's `result.json` and then spawned a gate into a
 * directory whose claim it had lost, neither of which is a `writeFileSync`.
 *
 * So the predicate is separated from the operation. THIS function answers
 * "may this run mutate that directory right now", and every one of the six
 * operations asks it, rather than one of them owning the rule. The wrappers
 * below (`writeInsideClaim`, `mkdirInsideClaim`) and the four inline checks in
 * `runOneGate`, `runClaimedBundle` and `writeSummaryAtomically` are its
 * callers; the work history's CR-900 section carries the full inventory that
 * fixes what "every" ranges over, derived from the closure's `node:fs` and
 * `node:child_process` imports rather than from the names of these wrappers.
 *
 * Guarding the mutation rather than the call site also makes the ordering
 * OBSERVABLE, which it was not: a release moved back in front of a mutation is
 * now a refusal with a reason, rather than an identical end state reachable
 * two ways. That is what let the ordering be red-witnessed at all (G2b).
 *
 * NOT COVERED, and stated rather than implied: a gate subprocess's own write
 * to the record path it was handed. This runner cannot guard another
 * process's write. What it CAN do, and now does, is decline to dispatch that
 * process at all when it does not hold the claim, and decline to certify a
 * run in which that happened.
 */
function refuseUnlessHolder(
  evidenceDir: string,
  runId: string,
  what: string,
): string | undefined {
  const holder = claimHolder(evidenceDir);
  if (holder !== runId) {
    return (
      `refusing to ${what}: this run (${runId}) does not hold the claim ` +
      `on ${evidenceDir} (held by ${holder ?? "nobody"})`
    );
  }
  return undefined;
}

/** Content write, row 2 of the CR-900 inventory. */
function writeInsideClaim(
  evidenceDir: string,
  runId: string,
  path: string,
  body: string,
): string | undefined {
  return (
    refuseUnlessHolder(evidenceDir, runId, `write ${path}`) ??
    guardedWrite(path, body)
  );
}

/**
 * Mkdir, rows 1a and 1b of the CR-900 inventory. Creating a directory inside
 * an evidence tree this run no longer owns is a smaller harm than deleting a
 * record, and it is the same mechanism: it leaves a directory the real holder
 * never made, in a bundle attributed to the real holder.
 *
 * Row 1c, the creation of the evidence directory ITSELF at the top of
 * `runGatesInner`, deliberately does NOT go through here and must not: the
 * directory has to exist before a claim file can be created inside it, so a
 * holdership test there would be unsatisfiable by construction. That single
 * mkdir is the only mutation in this module that legitimately precedes the
 * claim, and it creates a directory rather than touching any content.
 */
function mkdirInsideClaim(
  evidenceDir: string,
  runId: string,
  path: string,
): string | undefined {
  return (
    refuseUnlessHolder(evidenceDir, runId, `create ${path}`) ??
    ensureDirectory(path)
  );
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
    // CR-805, two faults in one line. `{phase}` is documented as a TOKEN
    // substitution, and substituting a value into regex SOURCE without
    // escaping silently changes the pattern's meaning: a phase id containing
    // `.` matched any character. And the compiled expression was unanchored,
    // so `claude/m2-p4-` matched the decoy branch
    // `evil/claude/m2-p4-scope-auditor-DECOY`. A precondition whose job is to
    // decide "am I on the branch this phase governs" was deciding it on a
    // strictly weaker predicate than it appeared to.
    const source = pattern.split("{phase}").join(escapeRegExp(options.phase));
    let expression: RegExp;
    try {
      expression = new RegExp(`^(?:${source})$`);
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
      reason: `branch ${name} ${met ? "matches" : "does not match"} ^(?:${source})$`,
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
  runId: string,
): GateOutcome {
  const startedAt = now();
  const gateDir = join(evidenceDir, entry.id);
  // CR-900 row 1a. Every mutation below is inside `evidenceDir`, and the claim
  // can be lost between gates (a previous gate steals it) or DURING one (this
  // gate's own precondition command steals it), so the question is asked at
  // each operation and not once at the top of this function.
  const dirRefusal = mkdirInsideClaim(evidenceDir, runId, gateDir);
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
    // CR-900 row 4, which the review's table did not list. Evaluating a
    // precondition DISPATCHES a subprocess: `git` for `branch-matches` and
    // `diff-touches`, and for kind `command` an ARBITRARY program named by the
    // manifest. Dispatching a program is a mutation of this directory by
    // proxy, so it asks the same question the delete and the gate spawn ask.
    const preconditionRefusal = refuseUnlessHolder(
      evidenceDir,
      runId,
      `evaluate precondition ${entry.precondition.id} for gate ${entry.id}`,
    );
    if (preconditionRefusal !== undefined) {
      return {
        result: errorResult(entry, startedAt, preconditionRefusal),
        applicable: false,
      };
    }
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
  // CR-900 rows 5 and 6, the two the finding named. The DELETE below removes a
  // record that, under a stolen claim, belongs to another run; the DISPATCH
  // after it hands that other run's directory to a program of this manifest's
  // choosing. One question covers both because nothing between them can change
  // the claim: the argv construction is pure string work. Splitting it into two
  // identical checks would add a line no test could redden independently.
  //
  // This check is what makes the fix COMPLETE rather than the review's sketch
  // of one check at the top of `runOneGate`. By here the precondition command
  // has already run, and it can have stolen the claim after that top check
  // passed (witness W3).
  const mutateRefusal = refuseUnlessHolder(
    evidenceDir,
    runId,
    `clear ${recordPath} and run gate ${entry.id}`,
  );
  if (mutateRefusal !== undefined) {
    return {
      result: errorResult(entry, startedAt, mutateRefusal),
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
  // Through writeInsideClaim like every other write into this directory: the
  // rule is a property of writing here, not of one call site (CR-860).
  const stdoutRefusal = writeInsideClaim(
    evidenceDir,
    runId,
    stdoutPath,
    child.stdout ?? "",
  );
  const stderrRefusal = writeInsideClaim(
    evidenceDir,
    runId,
    stderrPath,
    child.stderr ?? "",
  );
  const captureRefusal = stdoutRefusal ?? stderrRefusal;

  const ingested = ingestGateRun(entry, startedAt, recordPath, child, captureRefusal);
  return {
    result: ingested,
    // CR-800: "applicable" is read off the RESULT, never off the fact that a
    // child was started. A gate that decides its own applicability and says
    // `not-applicable` is not applicable, and it used to be counted as one.
    applicable: ingested.status !== "not-applicable",
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
  // CR-806. `vacuous` exists to be set by the two rewrite points and by
  // nothing else (deviation D2). A gate that writes it itself was being
  // believed, so a green record could be counted in the `vacuous` bucket and
  // break step 8's "vacuous is a strict subset of error". The runner is
  // documented as adversarial towards its own gates; here it was trusting one.
  const claimed: GateResult = { ...record };
  delete claimed.vacuous;

  if (claimed.status === "green" && claimed.units === 0) {
    // The constructor cannot produce this, but a gate that does not use the
    // constructor can, and that is exactly the party this rule is aimed at.
    return {
      ...claimed,
      status: "error",
      vacuous: true,
      detail:
        claimed.detail === ""
          ? M2_C_2_DETAIL
          : `${M2_C_2_DETAIL}; the gate reported: ${claimed.detail}`,
    };
  }

  // CR-804 part two: M2-C-5, enforced by the runner rather than left to each
  // gate's own honesty. The runner holds both the record's pins and the
  // module that compares them, two lines from where it applies the
  // structurally identical M2-C-2 rewrite, and was doing nothing with either.
  const pinFailure = pinRefusal(claimed);
  if (pinFailure !== undefined && claimed.status === "green") {
    return {
      ...claimed,
      status: "error",
      detail:
        claimed.detail === ""
          ? pinFailure
          : `${pinFailure}; the gate reported: ${claimed.detail}`,
    };
  }
  return claimed;
}

export const M2_C_5_DETAIL =
  "M2-C-5 (a run that cannot name what it executed is not evidence)";

/**
 * Why a record's pins refuse it, or undefined when they do not. A gate that
 * declares no pin is not bound by M2-C-5 and is not touched here; the
 * constraint binds the gates that execute a test suite, and each of those
 * declares its pins.
 */
function pinRefusal(record: GateResult): string | undefined {
  if (record.pin === undefined) {
    return undefined;
  }
  if (record.pin.start.fileCount === 0 || record.pin.end.fileCount === 0) {
    return `${M2_C_5_DETAIL}: a pin over ${record.pin.start.roots.join(", ")} measured no files`;
  }
  const differences = comparePins(record.pin.start, record.pin.end);
  if (differences.length === 0) {
    return undefined;
  }
  return (
    `${M2_C_5_DETAIL}: the tree changed during the run: ` +
    differences.map(describePinDifference).join("; ")
  );
}

/**
 * Run the manifest's gates. Returns the aggregate exit code and, when the
 * run got far enough to have one, the summary that was written.
 */
export interface AggregateCounts {
  declared: number;
  applicable: number;
  verdict: number;
  green: number;
  red: number;
  "not-applicable": number;
  error: number;
  vacuous: number;
}

/**
 * THE ONE AGGREGATE DECISION, extracted so it can be EXERCISED rather than
 * read (CR-800's fix round). CR-800 was a reading of these branch conditions
 * that turned out not to hold, and the first test written for the fix
 * asserted on the TEXT of this function, which is the guard-that-asserts-text
 * class MECHANISMS.md records six instances of. A pure function over a counts
 * object can be handed states the runner cannot currently produce, including
 * the internally inconsistent ones the invariants below exist for, so the
 * invariants are witnessed instead of quoted.
 *
 * AGGREGATE PRECEDENCE, fixed here so it is one rule and not a reading. A
 * concrete failure outranks the vacuity check, because "3 gates reported
 * error" tells the operator more than "no applicable gate" and both exit 21
 * anyway. The vacuity check outranks a required not-applicable gate, because
 * a bundle that examined nothing is not a report about any one gate (M2-C-2
 * at the aggregate level, M2R-012).
 */
export function decideAggregate(
  counts: AggregateCounts,
  requiredNotApplicable: string[],
  rows: { id: string; status: GateStatus }[],
): { exitCode: number; reason: string } {
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
  } else if (counts.verdict === 0) {
    // CR-800. This used to read `counts.applicable === 0`, and `applicable`
    // used to mean "was spawned", so a bundle of gates that each declared
    // their own not-applicable slipped past it and exited 0. The count
    // consulted here is now the only one that means work was done.
    exitCode = EXIT_GATE_ERROR;
    reason = NO_APPLICABLE_GATE;
  } else if (requiredNotApplicable.length > 0) {
    exitCode = EXIT_NOT_APPLICABLE;
    reason = `required gate(s) not applicable: ${requiredNotApplicable.join(", ")}`;
  }

  // TOTAL OVER GARBAGE, not just over zero (CR-862). The first version of
  // this check was `counts.green === 0`, which is FALSE for NaN, for
  // undefined, for a missing key and for a negative number, so all four
  // reached exit 0 with "every applicable gate is green". None is reachable
  // through the runner today, where `counts` is built from integer literals
  // and `+= 1`. That is exactly the argument this function exists to refuse
  // to rely on: its stated contract is to be handed states the runner cannot
  // currently produce, and a guard that only rejects the value it was written
  // against is the same shape as the defect it was written for.
  //
  // So every count is checked for being a non-negative safe integer FIRST,
  // and the success-path assertion is written as `!(green > 0)`, which is
  // true for every non-number as well as for zero.
  const badCounts = Object.entries(counts)
    .filter(([, value]) => !Number.isSafeInteger(value) || (value as number) < 0)
    .map(([name]) => name)
    .sort();
  if (badCounts.length > 0) {
    return {
      exitCode: EXIT_GATE_ERROR,
      reason:
        "internal inconsistency: count(s) that are not non-negative integers: " +
        `${badCounts.join(", ")} (${JSON.stringify(counts)})`,
    };
  }
  for (const name of [
    "declared",
    "applicable",
    "verdict",
    "green",
    "red",
    "not-applicable",
    "error",
    "vacuous",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(counts, name)) {
      return {
        exitCode: EXIT_GATE_ERROR,
        reason: `internal inconsistency: the count ${name} is missing (${JSON.stringify(counts)})`,
      };
    }
  }

  // THE SUCCESS PATH CANNOT DESCRIBE AN EMPTY GREEN BUCKET. The branches
  // above already make exit 0 unreachable with a zero green bucket, and this
  // asserts it rather than trusting the reading, because CR-800 was exactly a
  // reading of the branch conditions that turned out not to hold.
  //
  // `!(green > 0)` rather than `green === 0` is WITNESSED, not belt and braces
  // (CR-901). Round two recorded it as "unwitnessable: no input distinguishes
  // the two forms", which was an impossibility claim of exactly the shape
  // tuition T-006 is about, and it is false. The two screens above do not
  // screen the same set of properties: the bad-count screen enumerates with
  // `Object.entries`, which sees own ENUMERABLE properties, while the presence
  // screen uses `hasOwnProperty`, which sees own properties enumerable or not.
  // A count defined as
  //
  //     Object.defineProperty(counts, "green", { value: NaN, enumerable: false })
  //
  // is invisible to the first screen and present to the second, so it arrives
  // here unexamined. `!(NaN > 0)` is true and reports the inconsistency;
  // `NaN === 0` is false and would certify "every applicable gate is green"
  // with green equal to NaN. Registered as
  // `gate-aggregate-nonenumerable-nan-green`.
  if (exitCode === EXIT_GREEN && !(counts.green > 0)) {
    exitCode = EXIT_GATE_ERROR;
    reason =
      "internal inconsistency: the run reached the success path with zero " +
      `green gates (${JSON.stringify(counts)})`;
  }
  // Step 8's stated relation, asserted rather than assumed (CR-806).
  if (counts.vacuous > counts.error) {
    exitCode = EXIT_GATE_ERROR;
    reason =
      `internal inconsistency: vacuous ${String(counts.vacuous)} exceeds ` +
      `error ${String(counts.error)}, and vacuous is a strict subset of error`;
  }
  return { exitCode, reason };
}

export const RUN_CLAIM_FILE = ".tiphys-gate-run.json";

/**
 * Claim the evidence directory with an O_EXCL create, the pattern
 * `src/lock.ts` already carries (MECHANISMS.md, "Claim file (mutual exclusion
 * by O_EXCL)", which requires a third user to read that module first: done,
 * and this follows its rule rather than inventing a second one).
 *
 * No steal, no age heuristic, no bounded wait. A claim that cannot be taken
 * fails LOUDLY and NAMES THE STUCK FILE, because a silent wait is
 * indistinguishable from an absence of contention, and because an evidence
 * directory is not a contended resource by design: two runs sharing one is
 * an operator error, not a queue.
 */
function claimEvidenceDirectory(
  evidenceDir: string,
  runId: string,
  manifestPath: string,
): string | undefined {
  const claimPath = join(evidenceDir, RUN_CLAIM_FILE);
  const refusal = refuseOpenForWrite(claimPath);
  if (refusal !== undefined) {
    return refusal;
  }
  const body = `${JSON.stringify(
    { runId, manifest: manifestPath, startedAt: now() },
    null,
    2,
  )}\n`;
  try {
    writeFileSync(claimPath, body, { flag: "wx" });
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      return `evidence directory ${evidenceDir} could not be claimed: ${singleLine(String(error))}`;
    }
    const holder = claimHolder(evidenceDir);
    const held = readRegularFileIfPresent(claimPath);
    const who = held.kind === "read" ? singleLine(held.body) : "unreadable";
    // CR-861. The refused run writes NOTHING here, which is correct, and that
    // used to mean the only statement in the directory about what happened
    // was a DIFFERENT run's: the previous summary sat there saying exit 0,
    // aborted false, "every applicable gate is green". So the refusal itself
    // carries both ids and says, in words, that anything in the directory
    // belongs to the other run.
    return (
      `evidence directory ${evidenceDir} is already claimed by another run; ` +
      `claim file ${claimPath} holds ${who}. ` +
      `This run is ${runId} and it wrote NOTHING: any summary.json in ` +
      `${evidenceDir} belongs to run ${holder ?? "unknown"}, not to this run, ` +
      "and is not a report about this invocation. " +
      "Two runs sharing one evidence directory produce a bundle attributable " +
      "to neither. Use a different --evidence directory, or delete that file " +
      "if no run holds it."
    );
  }
}

/**
 * Replace `summary.json` atomically, staging under a name that carries this
 * run's id. MECHANISMS.md's "Atomic file replacement" row is explicit that a
 * FIXED stage name lets two concurrent passes share one temporary and the
 * loser dies on ENOENT, so the runId is in the stage name and no other run
 * can collide with it. The claim above already excludes a second runner from
 * this directory; this is the second lock on the same door, and it costs one
 * rename.
 */
function writeSummaryAtomically(
  evidenceDir: string,
  summaryPath: string,
  runId: string,
  summary: RunSummary,
): string | undefined {
  const stagePath = `${summaryPath}.${runId}.stage`;
  const staged = writeInsideClaim(
    evidenceDir,
    runId,
    stagePath,
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  if (staged !== undefined) {
    return staged;
  }
  const refusal = refuseOpenForWrite(summaryPath);
  if (refusal !== undefined) {
    return refusal;
  }
  // CR-900 row 8. A rename is a mutation of two entries in this directory, and
  // it was guarded only by the READING that the staged write above must have
  // succeeded first. That reading happens to be sound today; this phase is on
  // its third round because a reading of control flow was wrong twice, and the
  // rule this module now states is that the mutation asks, not its caller.
  const renameRefusal = refuseUnlessHolder(
    evidenceDir,
    runId,
    `replace ${summaryPath}`,
  );
  if (renameRefusal !== undefined) {
    return renameRefusal;
  }
  const renamed = runStep(`replacing ${summaryPath}`, () =>
    renameSync(stagePath, summaryPath),
  );
  return renamed.ok ? undefined : renamed.reason;
}

/** The runId recorded in a claim file, or undefined if it cannot be read. */
function claimHolder(evidenceDir: string): string | undefined {
  const read = readRegularFileIfPresent(join(evidenceDir, RUN_CLAIM_FILE));
  if (read.kind !== "read") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(read.body) as { runId?: unknown };
    return typeof parsed.runId === "string" ? parsed.runId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * RELEASE ONLY WHAT THIS RUN HOLDS (CR-860).
 *
 * The mechanism the finding names is: *cleanup that is valid only while the
 * claim is held, performed from a frame that does not know whether the claim
 * is held*. The instance was a release in an inner `finally` followed by a
 * second, unconditional release in an outer `catch`, so a crashed run could
 * unlink a claim that by then belonged to a DIFFERENT run, revoking a live
 * run's exclusion. That is "release a lock you no longer hold", the classic
 * claim-file defect.
 *
 * Two things close it, and both are here because the line deletion alone is
 * the instance fix and this project fixes the mechanism:
 *
 *   1. THIS function reads the claim and unlinks ONLY when the runId is its
 *      own, which is what `src/lock.ts` does when it verifies holdership
 *      before mutating. A release from a frame that no longer holds the claim
 *      is then a no-op rather than a revocation, whatever the call graph does.
 *   2. The call graph is also fixed, in `runGates`: exactly one release, in
 *      one `finally`, after every write into the directory. Depending on the
 *      guard alone would leave the writes happening outside the claimed
 *      region, which is the other half of the same finding.
 *
 * A claim this run does not hold is deliberately LEFT IN PLACE. Deleting
 * another run's claim is the harm; leaving a stranded one costs a human one
 * `rm`, and the refusal text says which file and why.
 */
export function releaseEvidenceDirectory(evidenceDir: string, runId: string): boolean {
  const holder = claimHolder(evidenceDir);
  if (holder !== runId) {
    return false;
  }
  try {
    unlinkSync(join(evidenceDir, RUN_CLAIM_FILE));
    return true;
  } catch {
    // Releasing a claim that is already gone is not a failure.
    return false;
  }
}

/**
 * The public entry. It exists so that NO throw can escape the runner and be
 * read as this phase's RED exit code by whatever consumes it (CR-801). The
 * runner enforces exactly this rule on its gates; it now obeys it itself.
 */
export function runGates(options: RunOptions): RunOutcome {
  const runId = randomBytes(12).toString("hex");
  try {
    return runGatesInner(options, runId);
  } catch (error) {
    // Reached only for a throw BEFORE the claim was taken, because every
    // path after it is wrapped inside the claimed region below. Nothing is
    // written here: without the claim this run does not own the directory.
    return {
      runId,
      exitCode: EXIT_GATE_ERROR,
      reason: `the gate runner failed: ${singleLine((error as Error).message ?? String(error))}`,
    };
  }
}

function writeAbortedSummary(
  options: RunOptions,
  runId: string,
  reason: string,
): void {
  if (!isRealDirectory(options.evidenceDir)) {
    return;
  }
  const summary: RunSummary = {
    runId,
    manifest: options.manifestPath,
    manifestSha256: "",
    startedAt: now(),
    endedAt: now(),
    parameters: {},
    only: options.only ?? [],
    manifestGates: 0,
    gates: [],
    counts: {
      declared: 0,
      applicable: 0,
      verdict: 0,
      green: 0,
      red: 0,
      "not-applicable": 0,
      error: 0,
      vacuous: 0,
    },
    requiredNotApplicable: [],
    aborted: true,
    exitCode: EXIT_GATE_ERROR,
    reason,
  };
  writeInsideClaim(
    options.evidenceDir,
    runId,
    join(options.evidenceDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

function runGatesInner(options: RunOptions, runId: string): RunOutcome {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = now();

  // The evidence directory is created and CLAIMED before the manifest is
  // loaded, so that every failure from here on leaves a summary a consumer
  // can read. CR-801 member 1 (a throw during the manifest load) otherwise
  // left no directory, no summary and only an exit code, and M2-P9's harness
  // is a programmatic consumer of the bundle.
  const dirRefusal = ensureDirectory(options.evidenceDir);
  if (dirRefusal !== undefined) {
    return { runId, exitCode: EXIT_GATE_ERROR, reason: dirRefusal };
  }
  const claimRefusal = claimEvidenceDirectory(
    options.evidenceDir,
    runId,
    options.manifestPath,
  );
  if (claimRefusal !== undefined) {
    // Deliberately no write and no release: the directory belongs to the run
    // that holds the claim, and writing into it is the very thing this
    // refusal exists to prevent. What the refusal DOES carry is both run
    // ids, so a caller can tell that any summary.json there is not its own
    // (CR-861).
    return { runId, exitCode: EXIT_GATE_ERROR, reason: claimRefusal };
  }

  // EVERY WRITE INTO THE DIRECTORY HAPPENS INSIDE THIS BLOCK, and the single
  // release is its `finally` (CR-860). The aborted summary used to be written
  // by an OUTER catch, after an inner `finally` had already released, so for
  // a measured 2.13ms the run wrote into a directory it no longer owned.
  try {
    try {
      /* One load, two document shapes. A registry is projected onto a
         manifest by `loadRegistry` and everything downstream is identical,
         which is the property the promotion depends on. */
      const loaded =
        options.registry === true
          ? loadRegistry(options.manifestPath, options.mode ?? DEFAULT_MODE)
          : loadManifest(options.manifestPath);
      if (!loaded.ok) {
        const reason = [loaded.reason, ...loaded.diagnostics].join("\n");
        writeAbortedSummary(options, runId, reason);
        return { runId, exitCode: EXIT_GATE_ERROR, reason };
      }
      return runClaimedBundle(options, cwd, startedAt, runId, loaded);
    } catch (error) {
      const reason =
        `the gate runner failed: ${singleLine((error as Error).message ?? String(error))}`;
      // A failure to record must not itself throw out of the catch.
      try {
        writeAbortedSummary(options, runId, reason);
      } catch {
        // Nothing further can be recorded; the exit code and stderr remain.
      }
      return { runId, exitCode: EXIT_GATE_ERROR, reason };
    }
  } finally {
    releaseEvidenceDirectory(options.evidenceDir, runId);
  }
}

function runClaimedBundle(
  options: RunOptions,
  cwd: string,
  startedAt: string,
  runId: string,
  loaded: { manifest: GateManifest; sha256: string; declaredByChecklist?: DeclaredChecklistGate[] },
): RunOutcome {
  const manifest = loaded.manifest;
  const only = options.only ?? [];
  if (only.length > 0) {
    const known = new Set(manifest.gates.map((gate) => gate.id));
    const unknown = only.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return {
        runId,
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
    verdict: 0,
    green: 0,
    red: 0,
    "not-applicable": 0,
    error: 0,
    vacuous: 0,
  };
  const requiredNotApplicable: string[] = [];

  for (const entry of selected) {
    const outcome = runOneGate(entry, options, cwd, options.evidenceDir, runId);
    const result = outcome.result;
    if (outcome.applicable) {
      counts.applicable += 1;
    }
    counts[result.status] += 1;
    if (result.status === "green" || result.status === "red") {
      counts.verdict += 1;
    }
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
    // CR-900 row 1b. Same mutation, second call site.
    const dirRefusalForGate = mkdirInsideClaim(
      options.evidenceDir,
      runId,
      join(options.evidenceDir, entry.id),
    );
    if (dirRefusalForGate === undefined) {
      writeInsideClaim(
        options.evidenceDir,
        runId,
        recordPath,
        renderGateResult(result),
      );
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

  const decided = decideAggregate(counts, requiredNotApplicable, rows);
  const exitCode = decided.exitCode;
  const reason = decided.reason;

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
    runId,
    manifest: options.manifestPath,
    ...(options.registry === true
      ? {
          registry: true,
          mode: options.mode ?? DEFAULT_MODE,
          declaredByChecklist: loaded.declaredByChecklist ?? [],
        }
      : {}),
    manifestSha256: loaded.sha256,
    startedAt,
    endedAt: now(),
    parameters,
    only,
    manifestGates: manifest.gates.length,
    gates: rows,
    counts,
    requiredNotApplicable,
    aborted: false,
    exitCode,
    reason,
  };
  const summaryPath = join(options.evidenceDir, "summary.json");
  const summaryRefusal = writeSummaryAtomically(
    options.evidenceDir,
    summaryPath,
    runId,
    summary,
  );
  if (summaryRefusal !== undefined) {
    return { runId, exitCode: EXIT_GATE_ERROR, summary, reason: summaryRefusal };
  }
  return { runId, exitCode, summary, reason };
}
