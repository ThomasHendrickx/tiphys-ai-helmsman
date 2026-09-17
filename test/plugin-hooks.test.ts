import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { constants, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P6: THE TURN-END HOOK, THE TOOL-CALL OBSERVER, AND STATUS DELIVERY.
 *
 * THREE PROGRAMS' REAL OUTPUT IS CONSUMED HERE AND NONE OF IT IS TYPED BY
 * HAND, which is what the red-witness rule asks for when a behaviour consumes
 * another program's output (CLAUDE.md:398):
 *
 *   1. The turn-end hook the KERNEL generates. `renderTurnEndHook`
 *      (src/hooks.ts:38) is called and its text is written to the lab
 *      unmodified, so the exit-64 refusal these tests turn on is the shipped
 *      refusal and not a restatement of it.
 *   2. Claude Code's own `PreToolUse` payloads, captured by M4-P1 and
 *      committed. See test/fixtures/plugin-hook-payloads/PROVENANCE.md:1 for
 *      the derivation, which is re-run below so the fixture cannot drift.
 *   3. The kernel's `tiphys status emit` and `tiphys status show`, run as real
 *      subprocesses against a real fleet home.
 *
 * NOTHING HERE NEEDS `dist/`. Every test runs from source, on purpose: the
 * red-witness harness evaluates a member in a scratch CLONE with `dist/`
 * absent, and a test that skips there is a test that cannot go red, which is
 * the same failure as a guard watching the wrong place.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const pluginRoot = join(repoRoot, "plugin");
const observerEntry = join(pluginRoot, "src", "hooks", "tool-call-observer.ts");
const probeDir = join(repoRoot, "test", "fixtures", "harness-probe");
const payloadDir = join(repoRoot, "test", "fixtures", "plugin-hook-payloads");

/* The computed-URL dynamic import pattern of standing warning 4: a literal
   relative path into `src` or into `plugin/src` fails the build with TS2878
   under rewriteRelativeImportExtensions across the project reference. */
interface LaunchRequest {
  taskId: string;
  worktree: string;
  command: string[];
  hookPath: string;
  recordPath: string;
  deadlineSeconds: number | undefined;
  env: Record<string, string> | undefined;
  briefPath: string;
  role: string | undefined;
  declaredTier: string | undefined;
  phaseId: string | undefined;
}
type Outcome =
  | { kind: "completed"; exitCode: number }
  | { kind: "launch-failed"; reason: string }
  | { kind: "incomplete"; reason: string };

const adapterModule = (await import(
  new URL("../plugin/src/adapter.ts", import.meta.url).href
)) as {
  ADAPTER_NAME: string;
  claudeCodeAdapter: { launch(request: LaunchRequest): Promise<Outcome> };
};

const turnEnd = (await import(
  new URL("../plugin/src/hooks/turn-end.ts", import.meta.url).href
)) as {
  payloadExitCode(status: number | null, signal: NodeJS.Signals | null): number;
  turnEndInvocation(termination: {
    status: number | null;
    signal: NodeJS.Signals | null;
  }): { exitCode: number; argument: string };
};

const observer = (await import(
  new URL("../plugin/src/hooks/tool-call-observer.ts", import.meta.url).href
)) as {
  TOOL_CALL_LOG_BASENAME: string;
  makeToolCallRecord(raw: string, at: string): {
    receivedAt: string;
    payloadSha256: string;
    payload: unknown;
  };
  resolveToolCallLog(cwd: unknown): { ok: true; path: string } | { ok: false; reason: string };
};

const pluginStatus = (await import(
  new URL("../plugin/src/status.ts", import.meta.url).href
)) as {
  resolveKernelCli(): { ok: true; path: string } | { ok: false; reason: string };
  stateForExitCode(exitCode: number): string;
  fleetRootFromTaskPath(taskPath: string): string;
  showStatus(cliPath: string, fleetRoot: string): { ok: true; line: string } | { ok: false; reason: string };
};

const kernelHooks = (await import(new URL("../src/hooks.ts", import.meta.url).href)) as {
  renderTurnEndHook(turnEndFile: string): string;
};

/* THE STATUS PATHS COME FROM THE KERNEL, NEVER FROM THIS FILE. M4-D-13 moves
   the current document out of the gitignored `state/` prefix while this phase
   is being written, so a literal "state/status/current.json" here would be a
   second copy of a decision this phase does not own, and it would be wrong
   silently. */
const kernelStatus = (await import(new URL("../src/status.ts", import.meta.url).href)) as {
  CURRENT_FILE: string;
  STREAM_FILE: string;
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], opts: { cwd?: string } = {}): CliResult {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/* CANONICAL, not merely absolute: git canonicalises every worktree path it
   records, and the observer derives a task directory from the payload's cwd,
   so a temp directory that is a symlink would make two spellings of one
   directory look like two directories. */
function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-p6-hooks-")));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface TurnLab {
  tmp: string;
  fleet: string;
  taskId: string;
  taskDir: string;
  worktree: string;
  hookPath: string;
  turnEndPath: string;
  recordPath: string;
  briefPath: string;
  invocations: string;
}

/**
 * A real fleet home with a task directory laid out where the kernel puts one.
 *
 * THE FLEET IS REAL BECAUSE THE STATUS DELIVERY IS. `tiphys status emit` runs
 * in a fleet home and refuses anything else, and the adapter derives the fleet
 * root from `recordPath` (three levels up from `tasks/<id>/executor.json`), so
 * a lab that put the record anywhere else would exercise a path production
 * never takes.
 */
function makeTurnLab(t: { after(fn: () => void): void }, taskId: string): TurnLab {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  const init = runCli(["init", fleet]);
  assert.equal(init.status, 0, `${init.stdout}${init.stderr}`);
  const taskDir = join(fleet, "tasks", taskId);
  const worktree = join(fleet, "worktrees", taskId);
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  const lab: TurnLab = {
    tmp,
    fleet,
    taskId,
    taskDir,
    worktree,
    hookPath: join(taskDir, "turn-end-hook.mjs"),
    turnEndPath: join(taskDir, "turn-end"),
    recordPath: join(taskDir, "executor.json"),
    briefPath: join(tmp, "brief.md"),
    invocations: join(tmp, "invocations.jsonl"),
  };
  writeFileSync(lab.briefPath, "# Brief\n");
  // THE KERNEL'S OWN GENERATED HOOK, VERBATIM. Its exit-64 refusal of a
  // non-integer argument (src/hooks.ts:47) is the dangerous state criterion 1
  // turns on, so it has to be the shipped text and not a stand-in.
  writeFileSync(lab.hookPath, kernelHooks.renderTurnEndHook(lab.turnEndPath), { mode: 0o755 });
  return lab;
}

/** The generated hook plus a record of WHO invoked it and with what. */
function instrumentHook(lab: TurnLab): void {
  const generated = kernelHooks.renderTurnEndHook(lab.turnEndPath);
  const probe =
    "\nimport { appendFileSync as tiphysAppend } from 'node:fs';\n" +
    `tiphysAppend(${JSON.stringify(lab.invocations)}, JSON.stringify({ ` +
    "ppid: process.ppid, argv: process.argv.slice(1) }) + '\\n');\n";
  writeFileSync(lab.hookPath, `${generated}${probe}`, { mode: 0o755 });
}

function writePayload(lab: TurnLab, body: string): string {
  const path = join(lab.tmp, `payload-${String(readdirSync(lab.tmp).length)}.sh`);
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}

function requestFor(lab: TurnLab, command: string[]): LaunchRequest {
  return {
    taskId: lab.taskId,
    worktree: lab.worktree,
    command,
    hookPath: lab.hookPath,
    recordPath: lab.recordPath,
    deadlineSeconds: undefined,
    env: undefined,
    briefPath: lab.briefPath,
    role: undefined,
    declaredTier: undefined,
    phaseId: undefined,
  };
}

function readTurnEnd(lab: TurnLab): { endedAt: string; exitCode: unknown } {
  return JSON.parse(readFileSync(lab.turnEndPath, "utf8")) as {
    endedAt: string;
    exitCode: unknown;
  };
}

/* -------------------------------------------------------------------- */
/* Criterion 1: the turn-end exit code is always an integer               */
/* -------------------------------------------------------------------- */

test("a turn that ends with no exit code still hands the generated turn-end hook an integer", async (t) => {
  // THE DEGENERATE TERMINATION FIRST. `SpawnSyncReturns` types `status` and
  // `signal` as independently nullable, so both-null is expressible at this
  // seam even though no real spawn on this platform produces it, and it is
  // the only input for which "128 plus nothing" has to be decided rather than
  // computed. A conversion that let `undefined` through would produce NaN,
  // which is precisely what makes the generated hook exit 64.
  assert.equal(turnEnd.payloadExitCode(null, null), 128);
  assert.equal(Number.isInteger(turnEnd.payloadExitCode(null, null)), true);
  assert.equal(turnEnd.turnEndInvocation({ status: null, signal: null }).argument, "128");

  // AND NOW A REAL TURN THAT ENDS WITHOUT AN EXIT CODE. The payload kills
  // itself outright, so `spawnSync` reports `status: null`.
  const lab = makeTurnLab(t, "t-no-exit-code");
  const payload = writePayload(lab, "#!/bin/sh\nkill -KILL $$\n");
  const outcome = await adapterModule.claudeCodeAdapter.launch(requestFor(lab, [payload]));

  // THE DANGEROUS STATE IS `incomplete`, NOT A MISSING FILE. A non-integer
  // argument makes the generated hook exit 64, the adapter reports the turn as
  // `incomplete` with a plumbing reason, and the payload's real outcome is
  // nowhere. So the arm is the assertion.
  assert.equal(
    outcome.kind,
    "completed",
    `the turn-end hook refused the argument it was handed: ${JSON.stringify(outcome)}`,
  );
  assert.equal(existsSync(lab.turnEndPath), true, "no turn-end record was written");
  const record = readTurnEnd(lab);
  assert.equal(
    Number.isInteger(record.exitCode),
    true,
    `turn-end exitCode is not an integer: ${JSON.stringify(record.exitCode)}`,
  );
  assert.equal(Number.isNaN(Date.parse(record.endedAt)), false, record.endedAt);
});

/* -------------------------------------------------------------------- */
/* Criterion 2: the second member, and it is a different shape            */
/* -------------------------------------------------------------------- */

/**
 * The signals M4-P1 actually abandoned an agent with, read out of its own
 * captures rather than chosen here.
 *
 * WHY THIS IS NOT DECORATION. A hand-written `137` would be a number invented
 * to match the implementation, and a hand-written signal list would be a guess
 * about how a turn ends in this harness. M4-P1 measured both: it terminated
 * real `claude` runs with `timeout -s KILL` and `timeout -s TERM` and
 * committed the summaries.
 */
function abandonmentSignalsFromM4P1(): string[] {
  const captures = [
    join(probeDir, "q2-launch-failed-vs-incomplete", "D-abandon-sigkill.summary.txt"),
    join(probeDir, "q2-launch-failed-vs-incomplete", "E-abandon-sigterm.summary.txt"),
  ];
  const names: string[] = [];
  for (const capture of captures) {
    const body = readFileSync(capture, "utf8");
    const line = body.split("\n").find((row) => row.startsWith("command: "));
    assert.notEqual(line, undefined, `${capture} has no command line`);
    const matched = /timeout -s ([A-Z]+) /.exec(line as string);
    assert.notEqual(matched, null, `${capture} does not record a signal: ${String(line)}`);
    names.push((matched as RegExpExecArray)[1] as string);
  }
  return names;
}

test("a turn that ends by signal reports 128 plus that signal and never reports success", async (t) => {
  const names = abandonmentSignalsFromM4P1();
  assert.deepEqual(
    names,
    ["KILL", "TERM"],
    "the M4-P1 abandonment captures no longer record the two signals this test derives from them",
  );

  const table = constants.signals as unknown as Record<string, number | undefined>;
  for (const name of names) {
    const number = table[`SIG${name}`];
    assert.equal(typeof number, "number", `SIG${name} is not in os.constants.signals`);

    const lab = makeTurnLab(t, `t-signal-${name.toLowerCase()}`);
    const payload = writePayload(lab, `#!/bin/sh\nkill -${name} $$\n`);
    const outcome = await adapterModule.claudeCodeAdapter.launch(requestFor(lab, [payload]));

    assert.equal(outcome.kind, "completed", JSON.stringify(outcome));
    const record = readTurnEnd(lab);
    // THE VALUE, NOT MERELY ITS TYPE. `status ?? 0` returns an integer for
    // this input too, so criterion 1 stays green under it; what it returns is
    // ZERO, which says a killed agent finished cleanly. This is the assertion
    // that refuses that, and the number it compares against is read out of the
    // platform rather than written down.
    assert.equal(
      record.exitCode,
      128 + (number as number),
      `SIG${name}: the turn-end record says ${JSON.stringify(record.exitCode)}`,
    );
    assert.notEqual(record.exitCode, 0, `SIG${name} was reported as a clean exit`);
    assert.equal(
      outcome.kind === "completed" ? outcome.exitCode : -1,
      128 + (number as number),
    );
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 3: the ADAPTER invokes the hook, and no Stop hook exists     */
/* -------------------------------------------------------------------- */

test("the turn-end record is written by a process the adapter spawned, and no Stop hook is declared", async (t) => {
  const lab = makeTurnLab(t, "t-invoked-by-adapter");
  instrumentHook(lab);
  const payload = writePayload(lab, "#!/bin/sh\nexit 5\n");
  const outcome = await adapterModule.claudeCodeAdapter.launch(requestFor(lab, [payload]));
  assert.deepEqual(outcome, { kind: "completed", exitCode: 5 });

  // THE INVOCATION LOG IS THE MEASUREMENT. The adapter runs inside THIS
  // process and invokes the hook with `spawnSync`, so the hook is a direct
  // child and its `ppid` is this process's `pid`. Nothing else in the system
  // could have written this record.
  const lines = readFileSync(lab.invocations, "utf8").split("\n").filter((row) => row !== "");
  assert.equal(lines.length, 1, `the hook ran ${String(lines.length)} times: ${lines.join(" | ")}`);
  const invocation = JSON.parse(lines[0] as string) as { ppid: number; argv: string[] };
  assert.equal(
    invocation.ppid,
    process.pid,
    "the process that wrote the turn-end record was not spawned by the adapter",
  );
  assert.deepEqual(invocation.argv, [lab.hookPath, "5"]);
  assert.equal(readTurnEnd(lab).exitCode, 5);

  // THE OTHER HALF OF THE CRITERION, AND IT IS A DESIGN CLAIM RATHER THAN A
  // RUNTIME ONE. A `Stop` hook receives static JSON and has no exit code to
  // carry, so an exit code routed through one would have nothing to route.
  // The manifest is where that would be visible, so the manifest is where it
  // is checked.
  const manifest = JSON.parse(
    readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"),
  ) as { hooks?: Record<string, unknown> };
  assert.notEqual(manifest.hooks, undefined, "the plugin manifest declares no hooks at all");
  const events = Object.keys(manifest.hooks as Record<string, unknown>).sort();
  assert.deepEqual(events, ["PreToolUse"], `the manifest declares ${events.join(", ")}`);
  const declared = JSON.stringify(manifest.hooks);
  assert.equal(declared.includes("tool-call-observer"), true, declared);
});

/* -------------------------------------------------------------------- */
/* Criteria 4 and 5: the observer blocks nothing and summarises nothing   */
/* -------------------------------------------------------------------- */

/** One `name: value` field of an M4-P1 summary capture. */
function summaryField(capture: string, field: string): string {
  const body = readFileSync(capture, "utf8");
  const line = body.split("\n").find((row) => row.startsWith(`${field}:`));
  assert.notEqual(line, undefined, `${capture} has no ${field} line`);
  return (line as string).slice(field.length + 1).trim();
}

/** The marker line M4-P1's hook wrote, from the summary that carries it. */
function markerLine(capture: string): string {
  const body = readFileSync(capture, "utf8");
  const marker = "--- marker.jsonl ---\n";
  const at = body.indexOf(marker);
  assert.notEqual(at, -1, `${capture} carries no marker section`);
  const line = body
    .slice(at + marker.length)
    .split("\n")
    .find((row) => row.trim() !== "");
  assert.notEqual(line, undefined, `${capture} carries an empty marker section`);
  return line as string;
}

/** The five payload fields M4-P1's marker recorded, in the order it wrote
 *  them. PROVENANCE.md carries the derivation this mirrors. */
const PAYLOAD_KEYS = ["hook_event_name", "permission_mode", "tool_name", "cwd", "tool_input"];

function projectPayload(capture: string): Record<string, unknown> {
  const marker = JSON.parse(markerLine(capture)) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of PAYLOAD_KEYS) {
    payload[key] = marker[key];
  }
  return payload;
}

const ARMS = [
  {
    fixture: "pretooluse-write-bypasspermissions.json",
    capture: join(probeDir, "q1-bypass-permission-mode", "bypass-exit0.summary.txt"),
  },
  {
    fixture: "pretooluse-write-acceptedits.json",
    capture: join(probeDir, "q1-bypass-permission-mode", "control-acceptEdits-exit2.summary.txt"),
  },
];

interface ToolCallOutcome {
  blocked: boolean;
  exit: number | null;
  stdout: string;
  stderr: string;
  wrote: boolean;
}

/**
 * Play one tool call past a `PreToolUse` hook, by the rule M4-P1 MEASURED.
 *
 * TWO SIGNALS, BOTH FROM THE HARNESS ITSELF. The exit-code half was measured
 * from the outside: M4-P1 configured the hook to exit 0 and the file CHANGED,
 * configured it to exit 2 and the file did not
 * (delivery/work-history/m4-p1.md:236). The stdout half is the harness's own
 * documented protocol, captured verbatim at
 * test/fixtures/plugin-hook-payloads/hook-json-output-contract.txt:1: a
 * decision travels as `decision`, `continue` or
 * `hookSpecificOutput.permissionDecision`, all of them on stdout. A hook that
 * exits 0 and writes nothing to stdout has expressed no decision at all.
 *
 * `hookArgv` EMPTY IS THE OBSERVER REMOVED, which is the second direction
 * criterion 4 requires: the same tool call, the same rule, no hook.
 */
function playToolCall(
  hookArgv: string[],
  payload: Record<string, unknown>,
  target: string,
  content: string,
): ToolCallOutcome {
  let exit: number | null = 0;
  let stdout = "";
  let stderr = "";
  if (hookArgv.length > 0) {
    const ran = spawnSync(hookArgv[0] as string, hookArgv.slice(1), {
      input: JSON.stringify(payload),
      encoding: "utf8",
    });
    exit = ran.status;
    stdout = ran.stdout ?? "";
    stderr = ran.stderr ?? "";
  }
  const decided =
    stdout.includes("\"decision\"") ||
    stdout.includes("\"continue\"") ||
    stdout.includes("permissionDecision");
  const blocked = exit === 2 || decided;
  if (!blocked) {
    writeFileSync(target, content);
  }
  return { blocked, exit, stdout, stderr, wrote: !blocked };
}

test("the observer lets a tool call through and records it, and removing it changes only the record", (t) => {
  // THE SIMULATOR IS CHECKED AGAINST THE MEASUREMENT BEFORE IT IS TRUSTED.
  // Both arms below are real `claude -p` runs M4-P1 committed, and the rule
  // `playToolCall` applies has to agree with what they recorded or this test
  // is measuring a fiction.
  for (const [capture, configured, changed] of [
    [ARMS[0]?.capture as string, "0", "YES"],
    [ARMS[1]?.capture as string, "2", "NO"],
  ] as Array<[string, string, string]>) {
    assert.equal(summaryField(capture, "hook-exit-configured"), configured, capture);
    assert.equal(summaryField(capture, "app.txt changed"), changed, capture);
    const simulatedBlock = configured === "2";
    assert.equal(
      simulatedBlock,
      changed === "NO",
      `the exit-code rule this test applies disagrees with ${capture}`,
    );
  }

  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  const taskId = "t-observed";
  const taskDir = join(fleet, "tasks", taskId);
  const worktree = join(fleet, "worktrees", taskId);
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(worktree, { recursive: true });
  const logPath = join(taskDir, observer.TOOL_CALL_LOG_BASENAME);

  // THE PAYLOAD IS THE REAL CAPTURE WITH EXACTLY TWO PATHS RELOCATED, and the
  // relocation is declared rather than quiet: M4-P1's own scratch directory is
  // gone, so `cwd` and the written file are moved into this lab and every
  // other field crosses untouched.
  const captured = projectPayload(ARMS[0]?.capture as string);
  const target = join(worktree, "app.txt");
  const payload = {
    ...captured,
    cwd: worktree,
    tool_input: { ...(captured["tool_input"] as Record<string, unknown>), file_path: target },
  };

  writeFileSync(target, "ORIGINAL\n");
  const withObserver = playToolCall(
    [process.execPath, observerEntry],
    payload,
    target,
    "HOTFIX\n",
  );

  // DIRECTION ONE: THE TOOL CALL SUCCEEDS. The dangerous state is an observer
  // that accidentally blocks, which would refuse the orchestrator's own merge
  // path and be switched off in the first hour (hazard H-D).
  assert.equal(withObserver.exit, 0, `the observer exited ${String(withObserver.exit)}`);
  assert.equal(withObserver.stdout, "", `the observer wrote a decision: ${withObserver.stdout}`);
  assert.equal(withObserver.blocked, false, "the observer blocked the tool call");
  assert.equal(readFileSync(target, "utf8"), "HOTFIX\n", "the write did not happen");

  // AND THE LINE IS THERE, naming the tool and the target path.
  const lines = readFileSync(logPath, "utf8").split("\n").filter((row) => row !== "");
  assert.equal(lines.length, 1, `the log holds ${String(lines.length)} lines`);
  const recorded = JSON.parse(lines[0] as string) as { payload: Record<string, unknown> };
  assert.equal(recorded.payload["tool_name"], "Write");
  assert.equal(
    (recorded.payload["tool_input"] as Record<string, unknown>)["file_path"],
    target,
  );

  // DIRECTION TWO: THE OBSERVER REMOVED. The same tool call, the same rule,
  // no hook. Without this the test is green for an observer that is the only
  // thing letting the write happen, which is a different system.
  writeFileSync(target, "ORIGINAL\n");
  rmSync(logPath);
  const without = playToolCall([], payload, target, "HOTFIX\n");
  assert.equal(without.blocked, false);
  assert.equal(readFileSync(target, "utf8"), "HOTFIX\n");
  assert.equal(existsSync(logPath), false, "a line was appended with no observer installed");
});

test("the observer's line round-trips the captured hook payload and adds only a receipt", () => {
  for (const arm of ARMS) {
    // THE FIXTURE IS A DERIVATION, AND THE DERIVATION IS RE-RUN HERE. Editing
    // either the fixture or the M4-P1 capture by hand reddens, which is what
    // makes "real captured payload" a property rather than a claim.
    const fixturePath = join(payloadDir, arm.fixture);
    const raw = readFileSync(fixturePath, "utf8");
    assert.deepEqual(
      JSON.parse(raw) as Record<string, unknown>,
      projectPayload(arm.capture),
      `${arm.fixture} is not the projection of ${arm.capture}`,
    );

    // ROUND TRIP: what comes out of the record is what went in, field for
    // field and value for value. A record that kept `tool_name` and a path,
    // which is what a summary would keep, fails on `tool_input.content` and on
    // `permission_mode`.
    const at = "2026-09-17T00:00:00.000Z";
    const record = observer.makeToolCallRecord(raw, at);
    assert.deepEqual(record.payload, JSON.parse(raw) as unknown);
    assert.equal(record.receivedAt, at);
    assert.equal(
      record.payloadSha256,
      createHash("sha256").update(raw, "utf8").digest("hex"),
      "the receipt hash is not over the bytes that arrived",
    );
    assert.deepEqual(Object.keys(record).sort(), ["payload", "payloadSha256", "receivedAt"]);
  }

  // AND THE DERIVATION REFUSES A PATH IT CANNOT ESTABLISH, which is why the
  // captures' own `cwd` values do not scatter logs through this machine.
  const refused = observer.resolveToolCallLog(
    (JSON.parse(readFileSync(join(payloadDir, ARMS[0]?.fixture as string), "utf8")) as {
      cwd: string;
    }).cwd,
  );
  assert.equal(refused.ok, false, "a vanished capture path resolved to a task directory");
});

/* -------------------------------------------------------------------- */
/* Criterion 6: nothing reads state from the log (C-1)                    */
/* -------------------------------------------------------------------- */

/** Every read-family call a module could use to take the log's tail. */
const READ_TOKENS = ["readFileSync", "readFile", "createReadStream", "openSync", "readSync"];

function listFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(path, suffix));
    } else if (entry.name.endsWith(suffix)) {
      found.push(path);
    }
  }
  return found;
}

test("the compiled plugin appends to the tool-call log and never reads it", (t) => {
  // COMPILED OUTPUT, NOT A GREP OVER SOURCES, because the criterion says so
  // and because a source-level grep says nothing about what ships. The
  // compile is done here rather than reused from `dist/` so this test runs
  // in the red-witness harness's scratch clone, which builds nothing.
  const outDir = join(makeTempDir(t), "emit");
  const sources = listFiles(join(pluginRoot, "src"), ".ts");
  assert.ok(sources.length >= 4, `only ${String(sources.length)} plugin sources found`);
  const compiled = spawnSync(
    process.execPath,
    [
      join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "--noCheck",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "--target",
      "es2024",
      "--rewriteRelativeImportExtensions",
      "--verbatimModuleSyntax",
      "--rootDir",
      join(pluginRoot, "src"),
      "--outDir",
      outDir,
      ...sources,
    ],
    { encoding: "utf8" },
  );
  assert.equal(compiled.status, 0, `${compiled.stdout ?? ""}${compiled.stderr ?? ""}`);

  const emitted = listFiles(outDir, ".js");
  assert.ok(emitted.length >= 4, `only ${String(emitted.length)} modules were emitted`);
  const naming = emitted.filter((path) => readFileSync(path, "utf8").includes("tool-calls"));
  assert.equal(
    naming.length,
    1,
    `${String(naming.length)} compiled modules name the log: ${naming.join(", ")}`,
  );
  const owner = naming[0] as string;
  assert.equal(owner.endsWith(join("hooks", "tool-call-observer.js")), true, owner);

  // THE APPEND SITE IS THERE AND NO READ SITE IS. The token list is the read
  // family, so an implementation that took the tail through any of them
  // reddens, whether or not it also declared the import.
  const body = readFileSync(owner, "utf8");
  assert.equal(body.includes("appendFileSync"), true, "the append site is gone");
  for (const token of READ_TOKENS) {
    assert.equal(
      body.includes(token),
      false,
      `the compiled observer carries ${token}, which is a read of the append-only log`,
    );
  }

  // AND THE KERNEL DOES NOT KNOW THE FILE EXISTS, which is the other half of
  // the plan's grep over `src/` and `plugin/src/`.
  const kernelNaming = listFiles(join(repoRoot, "src"), ".ts").filter((path) =>
    readFileSync(path, "utf8").includes("tool-calls"),
  );
  assert.deepEqual(kernelNaming, [], `the kernel names the log at ${kernelNaming.join(", ")}`);
});

/* -------------------------------------------------------------------- */
/* Criteria 7 and 8: status delivery, and its failure is not the turn's   */
/* -------------------------------------------------------------------- */

function statusLines(fleet: string): string[] {
  return readFileSync(join(fleet, kernelStatus.STREAM_FILE), "utf8")
    .split("\n")
    .filter((row) => row !== "");
}

function currentRecord(fleet: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fleet, kernelStatus.CURRENT_FILE), "utf8")) as Record<
    string,
    unknown
  >;
}

test("an agent turn delivers a status record that validates, and the current document is the read path", async (t) => {
  const lab = makeTurnLab(t, "t-status");
  const cli = pluginStatus.resolveKernelCli();
  assert.equal(cli.ok, true, cli.ok ? "" : cli.reason);

  const payload = writePayload(lab, "#!/bin/sh\nexit 0\n");
  const outcome = await adapterModule.claudeCodeAdapter.launch(requestFor(lab, [payload]));
  assert.deepEqual(outcome, { kind: "completed", exitCode: 0 });

  // AT LEAST ONE RECORD WENT OUT, and it says what the turn did.
  const stream = statusLines(lab.fleet);
  assert.ok(stream.length >= 1, "the turn emitted no status record");
  const current = currentRecord(lab.fleet);
  assert.equal(current["run"], lab.taskId);
  assert.equal(current["state"], pluginStatus.stateForExitCode(0));
  assert.deepEqual(JSON.parse(stream[stream.length - 1] as string) as unknown, current);

  // IT VALIDATES UNDER THE SHIPPED SCHEMA, through the shipped validator.
  const validated = runCli([
    "validate",
    "--type",
    "status-line",
    join(lab.fleet, kernelStatus.CURRENT_FILE),
  ]);
  assert.equal(validated.status, 0, `${validated.stdout}${validated.stderr}`);

  // C-1, BOTH DIRECTIONS. The stream is history and nothing reads state from
  // its tail, so corrupting it must not move what a supervisor is told; the
  // current document IS the read path, so changing it must.
  const before = pluginStatus.showStatus(cli.ok ? cli.path : "", lab.fleet);
  assert.equal(before.ok, true, before.ok ? "" : before.reason);
  appendFileSync(join(lab.fleet, kernelStatus.STREAM_FILE), "{not json at all\n", "utf8");
  const afterCorruptStream = pluginStatus.showStatus(cli.ok ? cli.path : "", lab.fleet);
  assert.deepEqual(
    afterCorruptStream,
    before,
    "a corrupt stream changed what the current status reports",
  );

  const moved = { ...current, state: "blocked", detail: "rewritten by the test" };
  writeFileSync(
    join(lab.fleet, kernelStatus.CURRENT_FILE),
    `${JSON.stringify(moved, undefined, 2)}\n`,
    "utf8",
  );
  const afterRewrite = pluginStatus.showStatus(cli.ok ? cli.path : "", lab.fleet);
  assert.equal(afterRewrite.ok, true, afterRewrite.ok ? "" : afterRewrite.reason);
  assert.notDeepEqual(
    afterRewrite,
    before,
    "rewriting the current document did not change what is reported, so it is not the read path",
  );
});

test("a status emit that fails leaves the turn outcome unchanged and the turn-end record written", async (t) => {
  // DIRECTION ONE, THE CONTROL: the same turn with the status target intact.
  const control = makeTurnLab(t, "t-status-control");
  const controlPayload = writePayload(control, "#!/bin/sh\nexit 3\n");
  const controlOutcome = await adapterModule.claudeCodeAdapter.launch(
    requestFor(control, [controlPayload]),
  );
  assert.deepEqual(controlOutcome, { kind: "completed", exitCode: 3 });
  assert.equal(existsSync(join(control.fleet, kernelStatus.CURRENT_FILE)), true);
  assert.equal(readTurnEnd(control).exitCode, 3);

  // DIRECTION TWO: THE TARGET DIRECTORY IS GONE, replaced by a regular file so
  // the emitter's own `mkdirSync(..., { recursive: true })` cannot quietly put
  // it back. This is the dangerous state: telemetry that can fail a delivery.
  const broken = makeTurnLab(t, "t-status-broken");
  const stateDir = join(broken.fleet, "state");
  rmSync(stateDir, { recursive: true, force: true });
  writeFileSync(stateDir, "this is not a directory\n");
  assert.equal(statSync(stateDir).isFile(), true);

  const brokenPayload = writePayload(broken, "#!/bin/sh\nexit 3\n");
  const brokenOutcome = await adapterModule.claudeCodeAdapter.launch(
    requestFor(broken, [brokenPayload]),
  );

  // THE OUTCOME IS UNCHANGED, byte for byte with the control's.
  assert.deepEqual(brokenOutcome, controlOutcome);
  // AND THE TURN-END RECORD IS STILL THERE, which is the artifact the watcher
  // wakes on. A status emit that threw would have taken this with it.
  assert.equal(existsSync(broken.turnEndPath), true, "the turn-end record was not written");
  assert.equal(readTurnEnd(broken).exitCode, 3);
  // The emit genuinely failed, so this is not a vacuous pass.
  assert.equal(
    existsSync(join(broken.fleet, kernelStatus.CURRENT_FILE)),
    false,
    "the status emit succeeded, so this arm asserts nothing",
  );
});
