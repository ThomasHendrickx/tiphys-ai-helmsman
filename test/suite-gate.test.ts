import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Tests for the suite gate (kernel plan M2, M2-P3), against fixture suites
 * in scratch git repositories with command-scoped git identity (CLAUDE.md
 * warning 5).
 *
 * EVERY child spawned here gets a SCRUBBED environment: NODE_OPTIONS and
 * NODE_TEST_* are removed. Two measured reasons, either of which corrupts
 * evidence silently:
 *
 *   1. When the suite gate runs THIS suite (criterion 1 on the kernel), it
 *      injects `--test-reporter-destination=<its own stream file>` through
 *      NODE_OPTIONS. A bare `node --test` spawned by a test below with an
 *      inherited environment would write its OWN stream over the OUTER
 *      gate's destination, clobbering the outer run's evidence mid-run.
 *   2. A nested `node --test` inheriting NODE_TEST_CONTEXT switches to its
 *      child-of-a-runner protocol (measured by M1-P6; see
 *      test/exit-test-local.test.ts).
 *
 * The gate itself performs the same scrub for its own child, for the same
 * reasons; the scrub here protects the BARE runner spawns the criteria
 * require and keeps the gate spawns uniform.
 *
 * Fixture streams for the format and truncation tests are REAL captured
 * output (CLAUDE.md red-witness rule, strong form; warning 10): they are
 * captured at test runtime from real runs of the pinned Node on this
 * machine, never hand-written to match the parser.
 */

const gatePath = fileURLToPath(
  new URL("../src/gates/suite.ts", import.meta.url),
);

interface GateRecord {
  gate: string;
  status: string;
  units: number;
  unitLabel: string;
  detail: string;
  evidence: string[];
  pin?: {
    start: { fileCount: number; files: { path: string; sha256: string; mtimeMs: number }[] };
    end: { fileCount: number; files: { path: string; sha256: string; mtimeMs: number }[] };
  };
}

function scrubbedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "NODE_OPTIONS" && !key.startsWith("NODE_TEST")) {
      env[key] = value;
    }
  }
  return env;
}

function gitEnv(): Record<string, string> {
  return {
    ...scrubbedEnv(),
    GIT_AUTHOR_NAME: "tiphys-test",
    GIT_AUTHOR_EMAIL: "tiphys-test@invalid",
    GIT_COMMITTER_NAME: "tiphys-test",
    GIT_COMMITTER_EMAIL: "tiphys-test@invalid",
  };
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv() });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr ?? ""}`,
  );
  return (result.stdout ?? "").trim();
}

const GREEN_SCRIPT = 'node --test "test/**/*.test.ts"';

interface FixtureOptions {
  script?: string;
  /**
   * Computed once `dir` (the fixture's own scratch path) is known, for a
   * script that must name test files by an ABSOLUTE path (CR-1410-1): the
   * path cannot be written until the scratch directory exists. Ignored if
   * `script` is also given.
   */
  scriptForDir?: (dir: string) => string;
  files: Record<string, string>;
  registry: Record<string, string>;
  /** Applied and committed as a second commit; --base stays the first. */
  headEdit?: (dir: string) => void;
}

/** A scratch git repository: base commit, optional head commit. */
function makeFixture(options: FixtureOptions): { dir: string; base: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-suite-"));
  git(dir, ["init", "-q", "-b", "main", "."]);
  const script =
    options.script ??
    (options.scriptForDir !== undefined ? options.scriptForDir(dir) : GREEN_SCRIPT);
  const packageJson = {
    name: "fixture",
    private: true,
    type: "module",
    scripts: { test: script },
  };
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "lib.ts"), "export const one = 1;\n");
  for (const [name, body] of Object.entries(options.files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(
    join(dir, "test", "behaviors.json"),
    `${JSON.stringify(options.registry, null, 2)}\n`,
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  const base = git(dir, ["rev-parse", "HEAD"]);
  if (options.headEdit !== undefined) {
    options.headEdit(dir);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "head"]);
  }
  return { dir, base };
}

interface GateRun {
  status: number | null;
  stdout: string;
  stderr: string;
  record: GateRecord;
  evidenceDir: string;
  counts?: {
    counts: Record<string, number>;
    requestedReporter: string;
    childNode: string;
    mapping: string;
    discovered: string[];
    reported: string[];
    findings: string[];
  };
}

function runGate(dir: string, base?: string, extraArgs: string[] = []): GateRun {
  const evidenceDir = mkdtempSync(join(tmpdir(), "tiphys-suite-ev-"));
  const resultPath = join(evidenceDir, "result.json");
  const args = [gatePath, "--result", resultPath, "--evidence", evidenceDir];
  if (base !== undefined) {
    args.push("--base", base);
  }
  args.push(...extraArgs);
  // The timeout is a harness bound, not a wait: a gate that hangs (the
  // M2-C-6 dangerous state) is killed and fails these tests with a signal
  // and no record, rather than stalling the suite forever.
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: "utf8",
    env: scrubbedEnv(),
    timeout: 120000,
  });
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as GateRecord;
  const run: GateRun = {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    record,
    evidenceDir,
  };
  if (record.evidence.includes("counts.json")) {
    run.counts = JSON.parse(
      readFileSync(join(evidenceDir, "counts.json"), "utf8"),
    ) as NonNullable<GateRun["counts"]>;
  }
  return run;
}

/** The bare runner, exactly as configured, with the scrubbed environment. */
function bareRunner(dir: string): number | null {
  const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    scripts: { test: string };
  };
  const result = spawnSync("/bin/sh", ["-c", packageJson.scripts.test], {
    cwd: dir,
    encoding: "utf8",
    env: scrubbedEnv(),
  });
  return result.status;
}

const ALPHA_TEST =
  'import { test } from "node:test";\n' +
  'test("alpha passes", () => {});\n' +
  'test("beta skipped", { skip: "floor-gated fixture reason" }, () => {});\n';

const SUB_TEST =
  'import { test } from "node:test";\ntest("sub x passes", () => {});\n';

const GREEN_REGISTRY = {
  alpha: "alpha passes",
  beta: "beta skipped",
  subx: "sub x passes",
};

function greenFixture(overrides: Partial<FixtureOptions> = {}): {
  dir: string;
  base: string;
} {
  return makeFixture({
    files: { "test/a.test.ts": ALPHA_TEST, "test/sub/x.test.ts": SUB_TEST },
    registry: GREEN_REGISTRY,
    ...overrides,
  });
}

test("suite gate on a healthy fixture is green with parity counts and equal pins", () => {
  const { dir, base } = greenFixture();
  const run = runGate(dir, base);
  assert.equal(run.status, 0, run.record.detail);
  assert.equal(run.record.status, "green");
  assert.equal(run.record.unitLabel, "tests reported");
  assert.equal(run.record.units, 3);
  assert.ok(run.counts !== undefined);
  const counts = run.counts.counts;
  assert.equal(counts["reported"], 3);
  assert.equal(counts["pass"], 2);
  assert.equal(counts["skipped"], 1);
  assert.equal(counts["fail"], 0);
  assert.equal(counts["todo"], 0);
  assert.equal(counts["didNotRun"], 0);
  // The recorded arithmetic satisfies the step 6 mapping, with discovered
  // taken from the independent walk (criterion 1).
  assert.equal(
    (counts["pass"] ?? 0) +
      (counts["fail"] ?? 0) +
      (counts["skipped"] ?? 0) +
      (counts["todo"] ?? 0) +
      (counts["didNotRun"] ?? 0),
    counts["reported"],
  );
  assert.equal(counts["discoveredFiles"], 2);
  assert.deepEqual(run.counts.discovered, ["test/a.test.ts", "test/sub/x.test.ts"]);
  assert.deepEqual(run.counts.discovered, run.counts.reported);
  assert.equal(run.counts.requestedReporter, "tiphys-suite-events-v1");
  assert.match(run.record.detail, /tiphys-suite-events-v1/);
  // Equal pins, recorded (criterion 8, green direction).
  assert.ok(run.record.pin !== undefined);
  assert.ok(run.record.pin.start.fileCount > 0);
  assert.deepEqual(run.record.pin.start.files, run.record.pin.end.files);
});

test("suite gate names a test file the configured pattern missed and passes once the pattern is corrected", () => {
  // The PR-106 shape (section 1.5 row 6): a selection pattern that stops
  // matching once subdirectories exist. The walk cannot share the defect
  // because it enumerates the declared roots, not the pattern.
  const narrow = greenFixture({ script: 'node --test "test/*.test.ts"' });
  assert.equal(bareRunner(narrow.dir), 0, "the bare runner must be green at exit 0");
  const red = runGate(narrow.dir, narrow.base);
  assert.equal(red.status, 1);
  assert.equal(red.record.status, "red");
  assert.match(
    red.record.detail,
    /discovered by the walk but absent from the reporter: test\/sub\/x\.test\.ts/,
  );
  // Direction 2: correcting the pattern returns exit 0.
  const wide = greenFixture();
  const green = runGate(wide.dir, wide.base);
  assert.equal(green.status, 0, green.record.detail);
});

test("suite gate names a reported test file outside the declared roots", () => {
  // The second structurally different parity member (one witness is not a
  // class): the runner selected MORE than the declaration, not less.
  const { dir, base } = makeFixture({
    script: 'node --test "test/**/*.test.ts" "extra/**/*.test.ts"',
    files: {
      "test/a.test.ts": ALPHA_TEST,
      "test/sub/x.test.ts": SUB_TEST,
      "extra/y.test.ts": 'import { test } from "node:test";\ntest("extra y passes", () => {});\n',
    },
    registry: GREEN_REGISTRY,
  });
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.match(
    run.record.detail,
    /reported but outside the declared roots and suffix: extra\/y\.test\.ts/,
  );
});

test("suite gate names a behavior whose test was renamed and passes when the name is restored", () => {
  // The CR-002 shape (section 1.5 row 5): the registry rots silently while
  // the bare runner stays green.
  const renamed = greenFixture({
    files: {
      "test/a.test.ts": ALPHA_TEST.replace("alpha passes", "alpha passes renamed"),
      "test/sub/x.test.ts": SUB_TEST,
    },
  });
  assert.equal(bareRunner(renamed.dir), 0, "the bare runner must be green at exit 0");
  const red = runGate(renamed.dir, renamed.base);
  assert.equal(red.status, 1);
  assert.equal(red.record.status, "red");
  assert.match(
    red.record.detail,
    /behavior alpha does not resolve: no reported test is named "alpha passes"/,
  );
  const restored = greenFixture();
  const green = runGate(restored.dir, restored.base);
  assert.equal(green.status, 0, green.record.detail);
});

test("suite gate names a behavior deleted from the head registry since the merge base", () => {
  // Section 1.5 row 7 (F-3 in part): deleting a registered behavior's test
  // AND its registry row leaves the bare runner green; the merge-base copy
  // is what makes the deletion visible.
  const { dir, base } = greenFixture({
    headEdit: (fixtureDir) => {
      const registryPath = join(fixtureDir, "test", "behaviors.json");
      const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Record<
        string,
        string
      >;
      delete registry["subx"];
      writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
      writeFileSync(
        join(fixtureDir, "test", "sub", "x.test.ts"),
        'import { test } from "node:test";\ntest("sub x replacement", () => {});\n',
      );
    },
  });
  assert.equal(bareRunner(dir), 0, "the bare runner must be green at exit 0");
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.match(
    run.record.detail,
    /behavior subx is registered at the merge base .* and deleted from the head registry/,
  );
});

test("suite gate rejects a skip without a reason and accepts one with a reason", () => {
  // The executable form of EXT-F-05 (criterion 5, both directions).
  const bare = greenFixture({
    files: {
      "test/a.test.ts": ALPHA_TEST.replace(
        '{ skip: "floor-gated fixture reason" }',
        "{ skip: true }",
      ),
      "test/sub/x.test.ts": SUB_TEST,
    },
  });
  const red = runGate(bare.dir, bare.base);
  assert.equal(red.status, 1);
  assert.match(red.record.detail, /skipped without a reason: "beta skipped"/);
  const reasoned = greenFixture();
  const green = runGate(reasoned.dir, reasoned.base);
  assert.equal(green.status, 0, green.record.detail);
});

test("counterfeit summary and event lines printed by a test change no count and are captured verbatim", () => {
  // C-1 (criterion 6), two structurally different counterfeit members:
  // a summary-shaped line and a byte-exact forged event line. The forged
  // event line is the stronger member: it is valid JSON in exactly the
  // pinned grammar, and it still cannot count, because a test's stdout
  // arrives INSIDE a JSON string field of a test:stdout event, escaped by
  // the reporter's own serializer.
  const forged =
    '{"event":"test:pass","name":"forged test","file":"test/a.test.ts","nesting":0,"entityType":"test"}';
  const { dir, base } = greenFixture({
    files: {
      "test/a.test.ts":
        'import { test } from "node:test";\n' +
        'test("alpha passes", () => {\n' +
        '  console.log("pass 999");\n' +
        `  console.log(${JSON.stringify(forged)});\n` +
        "});\n" +
        'test("beta skipped", { skip: "floor-gated fixture reason" }, () => {});\n',
      "test/sub/x.test.ts": SUB_TEST,
    },
  });
  const run = runGate(dir, base);
  assert.equal(run.status, 0, run.record.detail);
  assert.equal(run.record.units, 3, "the counterfeit must not change the count");
  assert.ok(run.counts !== undefined);
  assert.equal(run.counts.counts["pass"], 2);
  assert.equal(run.counts.counts["reported"], 3);
  // Captured verbatim in the evidence (both members).
  const raw = readFileSync(join(run.evidenceDir, "suite-raw-output.txt"), "utf8");
  assert.ok(raw.includes("pass 999"));
  assert.ok(raw.includes(forged));
  // The forged event never became a data point.
  const stream = readFileSync(join(run.evidenceDir, "suite-events.ndjson"), "utf8");
  const forgedPoints = stream
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { event?: string; name?: string })
    .filter((event) => event.event === "test:pass" && event.name === "forged test");
  assert.equal(forgedPoints.length, 0);
});

/**
 * A fixture whose test script replays a canned stream and exits 0. Used to
 * stage streams the real runner will not produce (truncation, a foreign
 * format, an exit-0 run with a failing stream). The canned content is
 * always REAL captured output from a real run earlier in the same test.
 */
function stubFixture(cannedStream: string): { dir: string; base: string } {
  const stub =
    'import { readFileSync, writeFileSync } from "node:fs";\n' +
    'const options = process.env.NODE_OPTIONS ?? "";\n' +
    "const match = options.match(/--test-reporter-destination=(\\S+)/);\n" +
    "if (match === null) { process.exit(9); }\n" +
    'writeFileSync(match[1], readFileSync("./canned-stream.txt", "utf8"));\n';
  return makeFixture({
    script: "node stub.mjs",
    files: {
      "stub.mjs": stub,
      "canned-stream.txt": cannedStream,
      "test/a.test.ts": ALPHA_TEST,
      "test/sub/x.test.ts": SUB_TEST,
    },
    registry: GREEN_REGISTRY,
  });
}

test("a test command that produces no reporter stream is error naming the request", () => {
  // The fail-loud path for a script that does not run node --test at all
  // (a lifecycle-dependent or foreign runner): the requested stream never
  // appears, and that is error, never green and never a guess.
  const { dir, base } = makeFixture({
    script: 'node -e "process.exit(0)"',
    files: { "test/a.test.ts": ALPHA_TEST, "test/sub/x.test.ts": SUB_TEST },
    registry: GREEN_REGISTRY,
  });
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /without producing the requested tiphys-suite-events-v1 reporter stream/);
});

test("a truncated reporter stream is error, not green", () => {
  // Criterion 7: the runner exits 0 and the stream stops mid-run. The
  // truncated stream is a REAL stream from a real green run, minus its
  // stream-end trailer, so the missing-trailer shape is the real one.
  const healthy = greenFixture();
  const healthyRun = runGate(healthy.dir, healthy.base);
  assert.equal(healthyRun.status, 0, healthyRun.record.detail);
  const realStream = readFileSync(
    join(healthyRun.evidenceDir, "suite-events.ndjson"),
    "utf8",
  );
  const lines = realStream.split("\n").filter((line) => line !== "");
  assert.match(lines[lines.length - 1] as string, /stream-end/);
  const truncated = `${lines.slice(0, -1).join("\n")}\n`;
  const { dir, base } = stubFixture(truncated);
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /truncated/);
  assert.match(run.record.detail, /stream-end/);
});

test("a stream in a different but valid reporter format is error naming expected and observed", () => {
  // Criterion 11, first direction. The foreign stream is REAL tap output
  // captured from the pinned Node against the same fixture suite, never a
  // hand-written string (CLAUDE.md warning 10).
  const source = greenFixture();
  const tapPath = join(source.dir, "captured.tap");
  const tapRun = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      `--test-reporter-destination=${tapPath}`,
      "test/**/*.test.ts",
    ],
    { cwd: source.dir, encoding: "utf8", env: scrubbedEnv() },
  );
  assert.equal(tapRun.status, 0, tapRun.stderr);
  const realTap = readFileSync(tapPath, "utf8");
  assert.match(realTap, /^TAP version 13\n/);
  const { dir, base } = stubFixture(realTap);
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /tiphys-suite-events-v1/);
  assert.match(run.record.detail, /TAP version 13/);
});

test("a runner exit of zero with a failing stream is error because the authorities disagree", () => {
  // C-1's cross-check: counts come from the structured stream PLUS the
  // exit code, and the two disagreeing is error, never a pick-one. The
  // failing stream is REAL captured output from a real failing run.
  const failing = makeFixture({
    files: {
      "test/a.test.ts":
        'import { test } from "node:test";\n' +
        'test("alpha passes", () => {});\n' +
        'test("gamma fails", () => { throw new Error("boom"); });\n',
    },
    registry: { alpha: "alpha passes", gamma: "gamma fails" },
  });
  const failingRun = runGate(failing.dir, failing.base);
  assert.equal(failingRun.status, 1);
  assert.match(failingRun.record.detail, /failing test: "gamma fails"/);
  const realFailingStream = readFileSync(
    join(failingRun.evidenceDir, "suite-events.ndjson"),
    "utf8",
  );
  const { dir, base } = stubFixture(realFailingStream);
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /exited 0 while the stream reports/);
});

test("a byte-identical rewrite of a pinned source during the run is error naming the path and mtimeMs", () => {
  // M2-C-5 (criterion 8, red direction; the green direction is the equal
  // pins asserted on the healthy fixture). The rewrite is the T-004 shape:
  // same bytes, new timestamps, performed DURING the run by the suite
  // itself.
  const { dir, base } = greenFixture({
    files: {
      "test/a.test.ts":
        'import { test } from "node:test";\n' +
        'import { readFileSync, writeFileSync, utimesSync } from "node:fs";\n' +
        'test("alpha passes", () => {\n' +
        '  const body = readFileSync("src/lib.ts");\n' +
        '  writeFileSync("src/lib.ts", body);\n' +
        "  const later = Date.now() / 1000 + 5;\n" +
        '  utimesSync("src/lib.ts", later, later);\n' +
        "});\n" +
        'test("beta skipped", { skip: "floor-gated fixture reason" }, () => {});\n',
      "test/sub/x.test.ts": SUB_TEST,
    },
  });
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /src\/lib\.ts changed during the run/);
  assert.match(run.record.detail, /mtimeMs/);
});

test("suite gate without --base is error, not not-applicable", () => {
  // Criterion 9, M2-C-3: the merge-base registry comparison cannot be
  // performed, so nothing was measured, and that is never not-applicable.
  const { dir } = greenFixture();
  const run = runGate(dir, undefined);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /--base was not supplied/);
  assert.match(run.record.detail, /merge-base registry comparison/);
});

test("a failing test makes the suite gate red naming it", () => {
  // Exit-code truth (step 8): child exit 1 plus a failing point is red,
  // with the failure named from the stream, not from any summary text.
  const { dir, base } = makeFixture({
    files: {
      "test/a.test.ts":
        'import { test } from "node:test";\n' +
        'test("alpha passes", () => {});\n' +
        'test("gamma fails", () => { throw new Error("boom"); });\n',
    },
    registry: { alpha: "alpha passes", gamma: "gamma fails" },
  });
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.equal(run.record.status, "red");
  assert.equal(run.record.units, 2);
  assert.match(run.record.detail, /failing test: "gamma fails" \(test\/a\.test\.ts\)/);
});

test("a named pipe inside a declared test root is error naming the path and type", () => {
  // M2-C-6: the walk reads paths it did not create, so a FIFO inside a
  // declared root must be a refusal naming the path and observed type,
  // never a hang. The gate returns before the assertion runs, which is
  // itself the no-hang witness under the harness timeout. The pin root is
  // narrowed to src so the WALK's own guard is the one witnessed here:
  // with test/ pinned, takePin's identical refusal would mask a defanged
  // walk, and a witness that reddens under no member of its class guards
  // nothing.
  const { dir, base } = greenFixture();
  const fifoPath = join(dir, "test", "fifo.test.ts");
  const made = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const run = runGate(dir, base, ["--pin-root", "src"]);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /fifo\.test\.ts is a named pipe/);
});

test("a named pipe at the registry path is error, not a hang", () => {
  // The second structurally different M2-C-6 member (one witness is not a
  // class): the first stages the pipe under a walked root, this one at a
  // path the gate itself OPENS. A bare readFileSync here blocks in the
  // kernel forever; the delivered probe-then-open refuses it by name.
  const { dir, base } = greenFixture();
  const registryPath = join(dir, "test", "behaviors.json");
  spawnSync("rm", [registryPath]);
  const made = spawnSync("mkfifo", [registryPath], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const run = runGate(dir, base);
  assert.equal(run.status, 21);
  assert.equal(run.record.status, "error");
  assert.match(run.record.detail, /behaviors\.json is a named pipe/);
});

test("a file that defines zero tests is named, not counted as a passing test (CR-1306, mixed)", () => {
  // The dangerous state, first structurally different member: ONE file
  // among several defines zero tests. Node itself still emits a nesting-0
  // test:pass for that file, entityType "test", named after the file's own
  // path (measured directly against the pinned node, see
  // isFileWrapperPhantom's derivation in src/gates/suite.ts). Before the
  // fix that point satisfied BOTH discovery parity (its file matches the
  // walk) and, being an ordinary entityType "test" point, inflated
  // `reported`; the bare runner is silently green over a file that ran no
  // real test.
  const { dir, base } = makeFixture({
    files: { "test/a.test.ts": ALPHA_TEST, "test/empty.test.ts": "" },
    registry: { alpha: "alpha passes", beta: "beta skipped" },
  });
  assert.equal(bareRunner(dir), 0, "the bare runner must be green at exit 0");
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.equal(run.record.status, "red");
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty\.test\.ts/,
  );
  // The phantom point is not counted: only the two real points (alpha,
  // beta) land in `reported`, never three.
  assert.equal(run.record.units, 2);
  assert.ok(run.counts !== undefined);
  assert.equal(run.counts.counts["reported"], 2);
  assert.deepEqual(run.counts.reported, ["test/a.test.ts"]);
});

test("a suite of only empty test files is red naming every one, never a counted green (CR-1306, total)", () => {
  // The second structurally different member: EVERY file is empty and the
  // registry is empty too, reproducing exactly the arbitration's captured
  // shape ("three empty .test.ts files plus an empty registry -> GREEN,
  // units 3"). Without the fix this is a silent, fully vacuous green
  // (findings.length === 0, because walk and phantom-reporter file sets
  // still match each other) that M2-C-2's green+units-0 rewrite cannot
  // catch either, because units is nonzero (one per emptied file).
  const { dir, base } = makeFixture({
    files: { "test/empty1.test.ts": "", "test/empty2.test.ts": "" },
    registry: {},
  });
  assert.equal(bareRunner(dir), 0, "the bare runner must be green at exit 0");
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.equal(run.record.status, "red");
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty1\.test\.ts/,
  );
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty2\.test\.ts/,
  );
  // Never a counted green: units is 0 (no real test ran) and status is
  // "red", never "green" and never a smuggled "error" masking a green.
  assert.equal(run.record.units, 0);
  assert.notEqual(run.record.status, "green");
  assert.ok(run.counts !== undefined);
  assert.deepEqual(run.counts.reported, []);
});

test("CR-1410-1: a zero-test file invoked by an ABSOLUTE path is not silently counted (mixed)", () => {
  // The dangerous state is a DIFFERENT SPELLING of the exact same CR-1306
  // defect (arbitration-m2-p3-round2.md, hazard-lens finding CR-1410-1).
  // Round one's filter compared `point.name === relative(cwd, point.file)`,
  // which only matches when the invoked path is spelled relative to cwd.
  // Here the fixture's own scripts.test (read VERBATIM by the gate, never
  // rewritten or reconstructed) names every file by its ABSOLUTE path, so
  // node names the phantom absolutely too (measured directly against both
  // installed toolchains; see isFileWrapperPhantom's derivation in
  // src/gates/suite.ts and delivery/work-history/m2-p3.md fix round two).
  // Structurally different from the relative CR-1306 "mixed" test above
  // only in HOW the files are spelled in the invocation, holding the
  // mixed-vs-total shape identical, per the "one witness is not a class"
  // rule: this and the next test are two structurally different members of
  // the ABSOLUTE-spelling class, paralleling the two members CR-1306
  // already covers for the relative spelling.
  const { dir, base } = makeFixture({
    scriptForDir: (fixtureDir) =>
      `node --test "${join(fixtureDir, "test", "a.test.ts")}" "${join(fixtureDir, "test", "empty.test.ts")}"`,
    files: { "test/a.test.ts": ALPHA_TEST, "test/empty.test.ts": "" },
    registry: { alpha: "alpha passes", beta: "beta skipped" },
  });
  assert.equal(bareRunner(dir), 0, "the bare runner must be green at exit 0");
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.equal(run.record.status, "red");
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty\.test\.ts/,
  );
  // The phantom point is not counted: only the two real points (alpha,
  // beta) land in `reported`, never three, exactly as the relative-spelling
  // "mixed" test above asserts for its own spelling.
  assert.equal(run.record.units, 2);
  assert.ok(run.counts !== undefined);
  assert.equal(run.counts.counts["reported"], 2);
  assert.deepEqual(run.counts.reported, ["test/a.test.ts"]);
});

test("CR-1410-1: a suite of only empty test files invoked by ABSOLUTE paths is red, never a counted green (total)", () => {
  // Second structurally different member of the ABSOLUTE-spelling class:
  // EVERY file is empty and the registry is empty too, reproducing the
  // arbitration's own captured dangerous shape but spelled absolutely.
  // Under round one's relative-only filter this reports a fully vacuous
  // GREEN with units 2 (one phantom point per emptied file, each named by
  // its own absolute path so `relative(cwd, file)` never matches `name`),
  // which M2-C-2's green+units-0 rewrite cannot catch either, because units
  // is nonzero. Confirmed by sha256-restoring the pre-round-two suite.ts
  // (see delivery/work-history/m2-p3.md fix round two, defang section).
  const { dir, base } = makeFixture({
    scriptForDir: (fixtureDir) =>
      `node --test "${join(fixtureDir, "test", "empty1.test.ts")}" "${join(fixtureDir, "test", "empty2.test.ts")}"`,
    files: { "test/empty1.test.ts": "", "test/empty2.test.ts": "" },
    registry: {},
  });
  assert.equal(bareRunner(dir), 0, "the bare runner must be green at exit 0");
  const run = runGate(dir, base);
  assert.equal(run.status, 1);
  assert.equal(run.record.status, "red");
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty1\.test\.ts/,
  );
  assert.match(
    run.record.detail,
    /discovered by the walk but absent from the reporter: test\/empty2\.test\.ts/,
  );
  // Never a counted green: units is 0 (no real test ran) and status is
  // "red", never "green" and never a smuggled "error" masking a green.
  assert.equal(run.record.units, 0);
  assert.notEqual(run.record.status, "green");
  assert.ok(run.counts !== undefined);
  assert.deepEqual(run.counts.reported, []);
});

test("suite direct entry runs through an aliased path and writes its result", () => {
  const { dir, base } = makeFixture({
    files: { "test/a.test.ts": "import { test } from 'node:test'; test('alias suite witness', () => {});\n" },
    registry: { alias: "alias suite witness" },
  });
  const evidenceDir = mkdtempSync(join(tmpdir(), "tiphys-suite-alias-"));
  const alias = join(evidenceDir, "suite-alias.ts");
  symlinkSync(gatePath, alias);
  const resultPath = join(evidenceDir, "result.json");
  const result = spawnSync(process.execPath, [alias, "--result", resultPath, "--evidence", evidenceDir, "--base", base], {
    cwd: dir,
    encoding: "utf8",
    env: scrubbedEnv(),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(resultPath, "utf8")).status, "green");
});
