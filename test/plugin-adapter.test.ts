import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * THE ADAPTER HALF OF M4-P5 (kernel plan M4, criteria 7, 8 and 9).
 *
 * THE ONE THING A NEW ADAPTER IS MOST LIKELY TO GET WRONG is the pair of
 * outcome arms, and it is the one thing that deletes work when it is wrong.
 * `launch-failed` asserts the payload NEVER STARTED and is the only outcome
 * that authorises the kernel to roll a worktree back (src/spawn.ts:922);
 * `incomplete` asserts the payload may have run and nothing is rolled back.
 * Transposed, a launch that never happened authorises nothing and a launch
 * that did authorises a rollback over a worktree that may hold real work,
 * which is M1-P3's V-1 data-loss defect reached through a new door.
 *
 * SO THE ARM TESTS BELOW ALWAYS ASSERT TWO THINGS: the arm, and whether the
 * payload ran. An arm assertion alone is green under a transposition that
 * also got the payload wrong, and the payload sentinel is what makes the
 * claim "the payload never started" a measurement rather than a restatement
 * of the arm's name.
 *
 * THE SEAM IS EXERCISED FROM THE CLI, NOT ONLY FROM THE INTERFACE (criterion
 * 9). The measured defect M4 exists to close is that the executor seam was
 * unreachable from `tiphys spawn` at all, so a unit test against `launch`
 * does not discharge it: the end-to-end test runs the real command against a
 * real scratch fleet with the real package installed where the loader looks.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceEntry = join(repoRoot, "bin", "tiphys.ts");
const pluginRoot = join(repoRoot, "plugin");
const pluginDistEntry = join(pluginRoot, "dist", "src", "index.js");

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
interface Adapter {
  name: string;
  requires: readonly string[];
  launch(request: LaunchRequest): Promise<Outcome>;
}

const pluginModule = (await import(
  new URL("../plugin/src/index.ts", import.meta.url).href
)) as { default: Adapter; claudeCodeAdapter: Adapter; ADAPTER_NAME: string };

const { BUILT_IN_ADAPTER_NAME, checkAdapterShape } = (await import(
  new URL("../src/adapters/load.ts", import.meta.url).href
)) as {
  BUILT_IN_ADAPTER_NAME: string;
  checkAdapterShape(
    module: unknown,
    specifier: string,
    origin: string,
    resolved: string,
  ): { ok: true; adapter: Adapter } | { ok: false; reason: string };
};

const { checkAdapterContract, requirableRequestFields } = (await import(
  new URL("../src/spawn.ts", import.meta.url).href
)) as {
  checkAdapterContract(adapter: Adapter): { ok: true } | { ok: false; reason: string };
  requirableRequestFields(): readonly string[];
};

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Plugin Adapter Test",
  GIT_AUTHOR_EMAIL: "plugin-adapter-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Plugin Adapter Test",
  GIT_COMMITTER_EMAIL: "plugin-adapter-test@tiphys.invalid",
};

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

function runCli(args: string[], opts: { cwd?: string } = {}): CliResult {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: baseEnv(),
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(dir: string, args: string[]): CliResult {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gitOk(dir: string, args: string[]): void {
  const result = git(dir, args);
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

/* CANONICAL, not merely absolute: git canonicalises every worktree path it
   records, so a composed path and a path git printed are two spellings of one
   directory on any platform whose temp directory is a symlink
   (test/spawn.test.ts:84's reasoning, inherited rather than rediscovered). */
function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tiphys-p5-plugin-")));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/* -------------------------------------------------------------------- */
/* Criterion 7: the adapter implements the interface and nothing else     */
/* -------------------------------------------------------------------- */

test("the plugin's default export is an adapter the kernel's own loader accepts", () => {
  // THE KERNEL'S OWN CHECK, not a second implementation of it. `checkAdapterShape`
  // is the function the loader runs on every adapter it evaluates, so running it
  // here asserts acceptance by the real consumer rather than by a restatement
  // of what the consumer is believed to want.
  const checked = checkAdapterShape(
    pluginModule,
    "@tiphys/claude-code-plugin",
    "the test",
    "plugin/src/index.ts",
  );
  assert.equal(checked.ok, true, checked.ok ? "" : checked.reason);

  const adapter = pluginModule.default;
  assert.equal(adapter, pluginModule.claudeCodeAdapter, "the default and named exports differ");
  assert.equal(typeof adapter.launch, "function");

  // CRITERION 7, THE NAME. Compared against the kernel's exported constant
  // rather than against a second copy of the string "subprocess": a refusal
  // compared against a literal spelled out in another file goes quiet the day
  // one of the two is edited (src/adapters/load.ts:44).
  assert.equal(typeof adapter.name, "string");
  assert.notEqual(adapter.name, BUILT_IN_ADAPTER_NAME);
  assert.equal(adapter.name, pluginModule.ADAPTER_NAME);

  // CRITERION 7, THE REQUIREMENTS (M4-P3 criterion 2). `requires` is declared,
  // it is not the empty statement the built-in adapter makes, and every name in
  // it is in the kernel's closed set, which is the check the kernel performs
  // before it creates anything.
  assert.ok(Array.isArray(adapter.requires), "requires is not an array");
  assert.ok(adapter.requires.length > 0, "requires is empty, which is a different statement");
  const known = new Set(requirableRequestFields());
  for (const name of adapter.requires) {
    assert.ok(known.has(name), `${name} is not a field of ExecutorRequest: ${[...known].join(", ")}`);
  }
  const contract = checkAdapterContract(adapter);
  assert.equal(contract.ok, true, contract.ok ? "" : contract.reason);
});

/* -------------------------------------------------------------------- */
/* Criterion 8: the record goes down before the payload, and the arms     */
/*              are not transposed                                        */
/* -------------------------------------------------------------------- */

interface Lab {
  dir: string;
  worktree: string;
  recordPath: string;
  hookPath: string;
  briefPath: string;
  sentinel: string;
  observed: string;
}

/**
 * A launch lab: a worktree, a hook that records what it was called with, and a
 * payload that reports what it could SEE when it ran.
 *
 * THE PAYLOAD IS THE INSTRUMENT. Ordering claims about two writes cannot be
 * made from the outside once both have happened, so the payload reads the
 * launch record itself and writes down what was there. That turns "the record
 * is written before the payload starts" into an observation made from inside
 * the window, which is the only place it is observable at all.
 */
function makeLab(t: { after(fn: () => void): void }): Lab {
  const dir = makeTempDir(t);
  const worktree = join(dir, "worktree");
  mkdirSync(worktree, { recursive: true });
  const lab: Lab = {
    dir,
    worktree,
    recordPath: join(dir, "executor.json"),
    hookPath: join(dir, "turn-end-hook.mjs"),
    briefPath: join(dir, "brief.md"),
    sentinel: join(dir, "payload-ran"),
    observed: join(dir, "payload-saw.txt"),
  };
  writeFileSync(lab.briefPath, "# Brief\n");
  writeFileSync(
    lab.hookPath,
    "import { writeFileSync } from 'node:fs';\n" +
      `writeFileSync(${JSON.stringify(join(dir, "turn-end"))}, JSON.stringify({ endedAt: new Date().toISOString(), exitCode: Number(process.argv[2]) }) + "\\n");\n`,
  );
  return lab;
}

/** A payload script that records that it ran and what the launch record held. */
function writePayload(lab: Lab, exitCode: number): string {
  const path = join(lab.dir, "payload.sh");
  writeFileSync(
    path,
    "#!/bin/sh\n" +
      `printf 'ran\\n' > ${JSON.stringify(lab.sentinel)}\n` +
      `if [ -f ${JSON.stringify(lab.recordPath)} ]; then cat ${JSON.stringify(lab.recordPath)} > ${JSON.stringify(lab.observed)}; else printf 'ABSENT\\n' > ${JSON.stringify(lab.observed)}; fi\n` +
      `exit ${String(exitCode)}\n`,
    { mode: 0o755 },
  );
  return path;
}

function requestFor(lab: Lab, command: string[]): LaunchRequest {
  return {
    taskId: "t-lab",
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

test("the launch record is on disk before the payload starts, and the payload says so", async (t) => {
  const lab = makeLab(t);
  const payload = writePayload(lab, 0);
  const outcome = await pluginModule.default.launch(requestFor(lab, [payload]));

  assert.deepEqual(outcome, { kind: "completed", exitCode: 0 });
  assert.equal(existsSync(lab.sentinel), true, "the payload did not run at all");

  // REAL CAPTURED OUTPUT FROM THE PROGRAM UNDER TEST: what the payload read
  // out of the launch record while it was running, not a string chosen to
  // match the implementation.
  const seen = readFileSync(lab.observed, "utf8");
  assert.notEqual(seen.trim(), "ABSENT", "the payload ran before the launch record existed");
  const record = JSON.parse(seen) as { adapter: string; launchedAt: string };
  assert.equal(record.adapter, pluginModule.ADAPTER_NAME);
  assert.equal(Number.isNaN(Date.parse(record.launchedAt)), false, record.launchedAt);

  // The record the payload saw is the record that is still on disk afterwards.
  assert.equal(readFileSync(lab.recordPath, "utf8"), seen);
});

test("a launch record that cannot be written is launch-failed and the payload never ran", async (t) => {
  const lab = makeLab(t);
  const payload = writePayload(lab, 0);
  // THE DANGEROUS STATE IS A DIRECTORY WHERE THE RECORD GOES: writeFileSync
  // raises EISDIR, which is a failure BEFORE the payload, so the only correct
  // arm is launch-failed. Reported as `incomplete` the kernel would leave a
  // worktree behind that nothing ever wrote to; reported as `completed` it
  // would delete the scrub root under a child that never existed.
  mkdirSync(lab.recordPath, { recursive: true });

  const outcome = await pluginModule.default.launch(requestFor(lab, [payload]));

  assert.equal(outcome.kind, "launch-failed", JSON.stringify(outcome));
  assert.equal(
    existsSync(lab.sentinel),
    false,
    "the payload ran, so launch-failed was a false claim that it never started",
  );
  assert.match(
    outcome.kind === "launch-failed" ? outcome.reason : "",
    /never started/,
    JSON.stringify(outcome),
  );
});

test("a payload binary that does not exist is launch-failed, not a payload that ran and failed", async (t) => {
  const lab = makeLab(t);
  // THE SECOND STRUCTURALLY DIFFERENT MEMBER of the same class. The first is a
  // write that raised before the launch; this is a SPAWN that never produced a
  // process. Under a shell this arrives as exit code 127, indistinguishable
  // from a payload that ran and failed, and the rollback rule turns on exactly
  // that distinction, so the adapter runs without a shell and reads
  // spawnSync's own error.
  const outcome = await pluginModule.default.launch(
    requestFor(lab, [join(lab.dir, "no-such-payload")]),
  );

  assert.equal(outcome.kind, "launch-failed", JSON.stringify(outcome));
  assert.equal(existsSync(lab.sentinel), false, "something ran");
  assert.match(
    outcome.kind === "launch-failed" ? outcome.reason : "",
    /could not launch/,
    JSON.stringify(outcome),
  );
  // The record was written first, so it is there even though the launch failed.
  assert.equal(existsSync(lab.recordPath), true, "the launch record was not written");
});

test("a turn-end hook that fails after the payload ran is incomplete, never launch-failed", async (t) => {
  const lab = makeLab(t);
  const payload = writePayload(lab, 0);
  // THE OTHER DIRECTION OF THE TRANSPOSITION, and it is the direction that
  // destroys work. Everything after the payload has started is `incomplete`
  // whatever went wrong, because the worktree may hold real work by then.
  //
  // The hook is replaced by one that exits nonzero IN SILENCE rather than
  // deleted. Deleting it works too and was the first form of this test, but a
  // missing module makes Node print a stack trace on the inherited stderr of
  // the test runner itself, and stray child output in a suite the `suite`
  // gate parses is a cost with no assertion behind it.
  writeFileSync(lab.hookPath, "process.exit(3);\n");

  const outcome = await pluginModule.default.launch(requestFor(lab, [payload]));

  assert.equal(outcome.kind, "incomplete", JSON.stringify(outcome));
  assert.equal(existsSync(lab.sentinel), true, "the payload did not run, so this arm proves nothing");
  assert.match(
    outcome.kind === "incomplete" ? outcome.reason : "",
    /left in place/,
    JSON.stringify(outcome),
  );
});

/* -------------------------------------------------------------------- */
/* Criterion 9: the seam is reachable from the CLI, both exit codes       */
/* -------------------------------------------------------------------- */

interface Scratch {
  tmp: string;
  fleet: string;
  clone: string;
  briefFile: string;
}

function makeScratch(t: { after(fn: () => void): void }): Scratch {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const upstream = join(tmp, "upstream");
  gitOk(tmp, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  gitOk(upstream, ["add", "-A"]);
  gitOk(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  gitOk(tmp, ["clone", "--quiet", upstream, clone]);
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  return { tmp, fleet, clone, briefFile };
}

/**
 * Install THIS repository's plugin where the kernel's loader looks: the FLEET
 * HOME, and nowhere else.
 *
 * A symlink to the real package directory rather than a copied stub, because
 * the property under test is that the REAL published shape resolves. The
 * loader resolves with `require.resolve` rooted at the fleet home's
 * package.json, so it reads the plugin's own `exports` map under the `require`
 * condition; a stub would witness nothing about that map.
 */
function installPluginInFleet(scratch: Scratch): void {
  const scope = join(scratch.fleet, "node_modules", "@tiphys");
  mkdirSync(scope, { recursive: true });
  symlinkSync(pluginRoot, join(scope, "claude-code-plugin"), "dir");
}

test(
  "tiphys spawn through the plugin adapter writes turn-end for a zero and a nonzero payload exit code",
  {
    skip: existsSync(pluginDistEntry)
      ? false
      : "plugin/dist/src/index.js is absent; run npm run build first (CI builds before it tests)",
  },
  (t) => {
    const scratch = makeScratch(t);
    installPluginInFleet(scratch);

    // BOTH EXIT CODES, and the nonzero one is the member that matters: a
    // nonzero payload is a COMPLETED task with a failing payload, and an
    // adapter that treated it as a failure would lose the code the watcher
    // wakes on. The turn-end record is the only artifact that carries it.
    for (const exitCode of [0, 7]) {
      const taskId = `t-plugin-${String(exitCode)}`;
      const payload = join(scratch.tmp, `payload-${String(exitCode)}.sh`);
      writeFileSync(payload, `#!/bin/sh\nexit ${String(exitCode)}\n`, { mode: 0o755 });

      const result = runCli(
        [
          "spawn",
          "--task",
          taskId,
          "--project",
          scratch.clone,
          "--brief",
          scratch.briefFile,
          "--shape",
          "ship",
          "--exec",
          payload,
          "--adapter",
          "@tiphys/claude-code-plugin",
        ],
        { cwd: scratch.fleet },
      );
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

      const taskDir = join(scratch.fleet, "tasks", taskId);
      const turnEnd = JSON.parse(readFileSync(join(taskDir, "turn-end"), "utf8")) as {
        endedAt: string;
        exitCode: number;
      };
      assert.equal(turnEnd.exitCode, exitCode);
      assert.equal(Number.isNaN(Date.parse(turnEnd.endedAt)), false, turnEnd.endedAt);

      // THE LAUNCH RECORD IS THE ONLY ARTIFACT THAT SAYS WHAT RAN. Without
      // this the test is green when the BUILT-IN adapter did the work and the
      // plugin was never loaded at all, which is the same spawn by exit code.
      const record = JSON.parse(readFileSync(join(taskDir, "executor.json"), "utf8")) as {
        adapter: string;
      };
      assert.equal(record.adapter, pluginModule.ADAPTER_NAME);
      assert.notEqual(record.adapter, BUILT_IN_ADAPTER_NAME);
    }
  },
);
