import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M2-P2 red-witness harness tests.
 *
 * Fixtures are scratch git repositories built at runtime with
 * command-scoped git identity (CLAUDE.md warning 5). The dangerous states
 * are staged as the REAL M1 defect shapes the plan names: V-1 (a destroy
 * guarded by a test that destroys nothing), V-2 (a retry signature narrowed
 * away from real captured contention stderr), the CR-661 guard-asserts-text
 * shape (exit 1 changed to exit 0 with every asserted string preserved),
 * the 3-of-5 stage-path collision of clean-room-m1-p5-round4-criteria.md,
 * and the N-401 stored witness that silently went green.
 *
 * Source modules are imported through computed URLs (warning 4).
 */

const runModule = (await import(
  new URL("../src/witness/run.ts", import.meta.url).href
)) as typeof import("../src/witness/run.ts");
const specModule = (await import(
  new URL("../src/witness/spec.ts", import.meta.url).href
)) as typeof import("../src/witness/spec.ts");
const gateModule = (await import(
  new URL("../src/gates/red-witness.ts", import.meta.url).href
)) as typeof import("../src/gates/red-witness.ts");

const { deriveTextAssertions, parseTapStream } = runModule;
const { validateWitnessSpecDocument } = specModule;
const { runRedWitnessGate } = gateModule;

const gateEntryPath = fileURLToPath(
  new URL("../src/gates/red-witness.ts", import.meta.url),
);
const kernelRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The REAL captured git contention stderr recorded in
 * delivery/review/verification-m1-p3-fix-round.md (finding V-2; the
 * orchestrator re-performance names these exact shas). Not a hand-written
 * example (CLAUDE.md warning 10, T-003 lesson 4).
 */
const REAL_CONTENTION_STDERR =
  "error: cannot lock ref 'refs/remotes/origin/main': is at a0e80f0 but expected a0d1254\n";

const TAP_CAPTURE_RELATIVE = "witness/captures/node-test-tap-real.txt";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  LC_ALL: "C",
  LANG: "C",
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} in ${cwd}: ${result.stderr}`,
  );
  return (result.stdout ?? "").trim();
}

function writeTree(root: string, files: Record<string, string>): void {
  for (const [path, body] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

interface Fixture {
  dir: string;
  base: string;
  head: string;
}

function makeFixture(
  baseFiles: Record<string, string>,
  headFiles: Record<string, string>,
): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "wfx-"));
  git(dir, "init", "-q", "-b", "main");
  writeTree(dir, baseFiles);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  const base = git(dir, "rev-parse", "HEAD");
  writeTree(dir, headFiles);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "head");
  const head = git(dir, "rev-parse", "HEAD");
  return { dir, base, head };
}

/** M2-C-4: after any gate run the caller's repository is byte-clean. */
function assertCallerClean(fixture: Fixture): void {
  assert.equal(git(fixture.dir, "status", "--porcelain"), "");
  assert.equal(git(fixture.dir, "rev-parse", "HEAD"), fixture.head);
}

function fixtureManifest(destructive: string[]): string {
  return `${JSON.stringify(
    { version: 1, gates: [], destructiveCommands: destructive },
    null,
    2,
  )}\n`;
}

function fixtureBehaviors(entries: Record<string, string>): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

function fixtureSpec(spec: Record<string, unknown>): string {
  return `${JSON.stringify(spec, null, 2)}\n`;
}

/**
 * Restore the contiguous read call inside fixture sources. The templates
 * carry placeholder tokens instead of the real callee so that THIS file's own
 * source never contains a document read the text-assertion derivation would
 * see; the self-guard test below holds that property red-green.
 *
 * READ_DOC (bare sync) and READ_DOC_ASYNC (bare async, node:fs/promises named
 * import) are the round-one tokens; READ_DOC_ASYNC is replaced FIRST because
 * READ_DOC is a prefix of it. The NSREAD_* tokens (fix round two, CR-1500) are
 * the NAMESPACE-QUALIFIED reads: NSREAD_SYNC -> `fs.readFileSync`,
 * NSREAD_ASYNC -> `await fs.promises.readFile`, NSREAD_ALIAS -> `fsp.readFile`
 * (an aliased namespace, `const fsp = fs.promises`). None of the NSREAD tokens
 * contains `READ_DOC` as a substring, so the two families do not interfere;
 * NSREAD_ALIAS and NSREAD_ASYNC precede NSREAD_SYNC only for readability.
 */
function fixRead(template: string): string {
  return template
    .replaceAll("READ_DOC_ASYNC", "await readFile")
    .replaceAll("READ_DOC", "readFileSync")
    .replaceAll("NSREAD_ALIAS", "fsp.readFile")
    .replaceAll("NSREAD_ASYNC", "await fs.promises.readFile")
    .replaceAll("NSREAD_SYNC", "fs.readFileSync");
}

function runGate(
  fixture: Fixture,
  extra?: Partial<Parameters<typeof runRedWitnessGate>[0]>,
): ReturnType<typeof runRedWitnessGate> {
  const outcome = runRedWitnessGate({
    repoRoot: fixture.dir,
    base: fixture.base,
    head: fixture.head,
    ...extra,
  });
  assertCallerClean(fixture);
  return outcome;
}

function reasonsOf(outcome: ReturnType<typeof runRedWitnessGate>): string {
  return outcome.result.detail;
}

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

const ADDER_SRC_HEAD = [
  "export function add(a, b) {",
  "  return a + b;",
  "}",
  "",
].join("\n");

const ADDER_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { add } from "../src/adder.ts";',
  "",
  'test("adder adds two numbers", () => {',
  "  assert.equal(add(2, 2), 4);",
  "});",
  "",
].join("\n");

function adderSpec(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "adder-guard",
    behavior: "adder-adds",
    tests: ["adder adds two numbers"],
    class: "additive",
    dangerousStates: [
      {
        kind: "mutation",
        file: "src/adder.ts",
        find: "return a + b;",
        replace: "return a - b;",
      },
    ],
    deterministic: true,
    repeats: 1,
    ...overrides,
  };
}

function adderFixture(spec?: Record<string, unknown>, omitSpec = false): Fixture {
  const baseFiles: Record<string, string> = {
    "gates.manifest.json": fixtureManifest([]),
    "test/behaviors.json": fixtureBehaviors({
      "adder-adds": "adder adds two numbers",
    }),
    "src/legacy.ts": 'export const legacy = "untouched";\n',
  };
  const headFiles: Record<string, string> = {
    "src/adder.ts": ADDER_SRC_HEAD,
    "test/adder.test.ts": ADDER_TEST,
  };
  if (!omitSpec) {
    headFiles["witness/adder-guard.json"] = fixtureSpec(spec ?? adderSpec({}));
  }
  return makeFixture(baseFiles, headFiles);
}

// ---------------------------------------------------------------------------
// Kernel-corpus unit behaviors (these tests are the named tests of the
// witness specs shipped under witness/ in this repository)
// ---------------------------------------------------------------------------

test("the tap parser accepts the pinned reporter stream and refuses a foreign format", () => {
  const capturePath = join(kernelRoot, TAP_CAPTURE_RELATIVE);
  const body = readFileSync(capturePath, "utf8");
  const parsed = parseTapStream(body);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const byName = new Map(parsed.tests.map((point) => [point.name, point.ok]));
    assert.equal(byName.get("a passing sample assertion"), true);
    assert.equal(byName.get("a failing sample assertion"), false);
  }
  const foreign = body.replace("TAP version 13", "node spec reporter output");
  const refused = parseTapStream(foreign);
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.match(refused.reason, /expected the pinned reporter format tap/);
    assert.match(refused.reason, /node spec reporter output/);
  }
});

test("a mutation member missing its replace field is rejected naming the field", () => {
  const lines = validateWitnessSpecDocument({
    id: "x",
    behavior: "x",
    tests: ["t"],
    class: "additive",
    dangerousStates: [{ kind: "mutation", file: "src/x.ts", find: "y" }],
    deterministic: true,
  });
  assert.equal(
    lines.some((line) =>
      line.startsWith("INVALID #/dangerousStates/0/replace"),
    ),
    true,
    lines.join("\n"),
  );
});

test("a witness spec missing deterministic is rejected naming the field", () => {
  const lines = validateWitnessSpecDocument({
    id: "x",
    behavior: "x",
    tests: ["t"],
    class: "additive",
    dangerousStates: [
      { kind: "mutation", file: "src/x.ts", find: "y", replace: "z" },
    ],
  });
  assert.equal(
    lines.some((line) => line.startsWith("INVALID #/deterministic")),
    true,
    lines.join("\n"),
  );
});

test("the red-witness gate without base writes an error record naming the missing base", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-nobase-"));
  const resultPath = join(dir, "result.json");
  const child = spawnSync(
    process.execPath,
    [gateEntryPath, "--result", resultPath],
    { cwd: dir, encoding: "utf8" },
  );
  assert.equal(child.status, 21, child.stderr);
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    status: string;
    detail: string;
  };
  assert.equal(record.status, "error");
  assert.match(record.detail, /--base was not supplied/);
  assert.match(record.detail, /M2-C-3/);
  rmSync(dir, { recursive: true, force: true });
});

test("the kernel witness test file is not text-asserting by the derived detection", () => {
  const own = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const derived = deriveTextAssertions([own]);
  assert.equal(
    derived.textAsserting,
    false,
    `documents seen: ${derived.documents.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// Criterion 1 and 8: green end to end through the gate CLI
// ---------------------------------------------------------------------------

test("a witness red at its dangerous state and green at head makes the gate exit 0 with pins equal and the diff verbatim", () => {
  const fixture = adderFixture();
  const out = mkdtempSync(join(tmpdir(), "wout-"));
  const resultPath = join(out, "result.json");
  const evidenceDir = join(out, "evidence");
  const child = spawnSync(
    process.execPath,
    [
      gateEntryPath,
      "--result",
      resultPath,
      "--evidence",
      evidenceDir,
      "--base",
      fixture.base,
      "--head",
      fixture.head,
    ],
    { cwd: fixture.dir, encoding: "utf8" },
  );
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    status: string;
    units: number;
    unitLabel: string;
  };
  assert.equal(record.status, "green");
  assert.equal(record.units, 1);
  assert.equal(record.unitLabel, "witnesses evaluated");
  const recordsName = "witness-records.json";
  const records = JSON.parse(
    readFileSync(join(evidenceDir, recordsName), "utf8"),
  ) as {
    evaluations: Array<{
      status: string;
      members: Array<{
        appliedDiff: string;
        redPins: { equal: boolean };
        greenPins: { equal: boolean };
        rate: { red: number; total: number };
      }>;
    }>;
  };
  assert.equal(records.evaluations.length, 1);
  const member = records.evaluations[0]?.members[0];
  assert.notEqual(member, undefined);
  assert.equal(member?.redPins.equal, true);
  assert.equal(member?.greenPins.equal, true);
  assert.match(member?.appliedDiff ?? "", /-\s*return a \+ b;/);
  assert.match(member?.appliedDiff ?? "", /\+\s*return a - b;/);
  assert.equal(member?.rate.red, 1);
  assertCallerClean(fixture);
  rmSync(out, { recursive: true, force: true });
});

test("a nested test run does not inherit the suite gate reporter NODE_OPTIONS", () => {
  // The suite gate (src/gates/suite.ts) requests its pinned reporter for the
  // top-level `npm test` run by setting a child-scoped NODE_OPTIONS
  // (--test-reporter=... --test-reporter-destination=...). Everything that
  // runs BELOW that inherits it, including the nested `node --test` the
  // red-witness harness spawns per member. That nested run already carries
  // `--test-reporter tap` in its argv, so an inherited reporter makes two
  // reporters against one destination, which node rejects at startup
  // (ERR_INVALID_ARG_VALUE), the child exits 1 with no tap stream, and the
  // member evaluation errors. This reproduces that exact ambient condition
  // and asserts the harness scrubs the reporter so the gate still greens.
  const fixture = adderFixture();
  const out = mkdtempSync(join(tmpdir(), "wopt-"));
  const resultPath = join(out, "result.json");
  const evidenceDir = join(out, "evidence");
  const leakedDestination = join(out, "leaked-reporter-stream");
  const child = spawnSync(
    process.execPath,
    [
      gateEntryPath,
      "--result",
      resultPath,
      "--evidence",
      evidenceDir,
      "--base",
      fixture.base,
      "--head",
      fixture.head,
    ],
    {
      cwd: fixture.dir,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_OPTIONS: `--test-reporter=tap --test-reporter-destination=${leakedDestination}`,
      },
    },
  );
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    status: string;
    units: number;
  };
  assert.equal(record.status, "green", child.stdout);
  assert.equal(record.units, 1);
  assertCallerClean(fixture);
  rmSync(out, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Criteria 2, 3, 3a: the V-1 shape and the derived destructive class
// ---------------------------------------------------------------------------

const DISMANTLE_SCRIPT = [
  "#!/bin/sh",
  'repo="$1"; branch="$2"',
  'tip=$(git -C "$repo" rev-parse --verify "refs/heads/$branch") || exit 2',
  'base=$(git -C "$repo" rev-parse --verify refs/heads/main) || exit 2',
  'if [ "$tip" != "$base" ]; then',
  '  echo "branch $branch carries commits beyond its base" >&2',
  "  exit 1",
  "fi",
  'git -C "$repo" branch -D "$branch" >/dev/null',
  "",
].join("\n");

const DISMANTLE_GUARD_FIND = [
  'if [ "$tip" != "$base" ]; then',
  '  echo "branch $branch carries commits beyond its base" >&2',
  "  exit 1",
  "fi",
  "",
].join("\n");

const DISMANTLE_TEST_HELPERS = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { spawnSync } from "node:child_process";',
  'import { mkdtempSync, writeFileSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  "",
  "const env = {",
  "  ...process.env,",
  '  GIT_AUTHOR_NAME: "fx",',
  '  GIT_AUTHOR_EMAIL: "fx@example.invalid",',
  '  GIT_COMMITTER_NAME: "fx",',
  '  GIT_COMMITTER_EMAIL: "fx@example.invalid",',
  "};",
  "function git(cwd, ...args) {",
  '  const r = spawnSync("git", args, { cwd, encoding: "utf8", env });',
  "  if (r.status !== 0) { throw new Error(r.stderr); }",
  "  return (r.stdout || '').trim();",
  "}",
  "function makeLab(withCommitOnBranch) {",
  '  const lab = mkdtempSync(join(tmpdir(), "lab-"));',
  '  git(lab, "init", "-q", "-b", "main");',
  '  writeFileSync(join(lab, "a.txt"), "a");',
  '  git(lab, "add", "-A");',
  '  git(lab, "commit", "-q", "-m", "c0");',
  '  git(lab, "branch", "task1");',
  "  if (withCommitOnBranch) {",
  '    git(lab, "checkout", "-q", "task1");',
  '    writeFileSync(join(lab, "b.txt"), "b");',
  '    git(lab, "add", "-A");',
  '    git(lab, "commit", "-q", "-m", "c1");',
  '    git(lab, "checkout", "-q", "main");',
  "  }",
  "  return lab;",
  "}",
  "function branchExists(lab) {",
  '  const r = spawnSync("git", ["-C", lab, "rev-parse", "--verify", "refs/heads/task1"], { encoding: "utf8", env });',
  "  return r.status === 0;",
  "}",
  "",
].join("\n");

const DISMANTLE_TEST_BAD =
  DISMANTLE_TEST_HELPERS +
  [
    'test("dismantle refuses a branch carrying commits", () => {',
    "  const lab = makeLab(false);",
    '  const r = spawnSync("sh", ["bin/dismantle", lab, "task1"], { encoding: "utf8", env });',
    "  assert.equal(r.status, 0);",
    "  assert.equal(branchExists(lab), false);",
    "});",
    "",
  ].join("\n");

const DISMANTLE_TEST_GOOD =
  DISMANTLE_TEST_HELPERS +
  [
    'test("dismantle refuses a branch carrying commits", () => {',
    "  const lab = makeLab(true);",
    '  const r = spawnSync("sh", ["bin/dismantle", lab, "task1"], { encoding: "utf8", env });',
    "  assert.notEqual(r.status, 0);",
    "  assert.equal(branchExists(lab), true);",
    "});",
    "",
  ].join("\n");

function dismantleFixture(
  goodTest: boolean,
  witnessClass: string,
): Fixture {
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest(["bin/dismantle"]),
      "test/behaviors.json": fixtureBehaviors({
        "dismantle-refuses-carried-commits":
          "dismantle refuses a branch carrying commits",
      }),
    },
    {
      "bin/dismantle": DISMANTLE_SCRIPT,
      "test/dismantle.test.ts": goodTest ? DISMANTLE_TEST_GOOD : DISMANTLE_TEST_BAD,
      "witness/dismantle.json": fixtureSpec({
        id: "dismantle-guard",
        behavior: "dismantle-refuses-carried-commits",
        tests: ["dismantle refuses a branch carrying commits"],
        class: witnessClass,
        dangerousStates: [
          {
            kind: "mutation",
            file: "bin/dismantle",
            find: DISMANTLE_GUARD_FIND,
            replace: "",
          },
        ],
        deterministic: true,
        repeats: 1,
      }),
    },
  );
}

test("a witness green against its declared dangerous state is red naming the witness", () => {
  const fixture = dismantleFixture(false, "destructive");
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /dismantle-guard/);
  assert.match(outcome.result.detail, /red in 0 of 1|no named test reaches/);
});

test("correcting the fixture so the branch carries a commit makes the same spec green", () => {
  const fixture = dismantleFixture(true, "destructive");
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  assert.equal(outcome.result.units, 1);
});

test("a destructive witness whose only member is a baseline ref is refused citing T-003", () => {
  const fixture = makeFixture(
    {
      "gates.manifest.json": fixtureManifest(["bin/dismantle"]),
      "test/behaviors.json": fixtureBehaviors({
        "dismantle-refuses-carried-commits":
          "dismantle refuses a branch carrying commits",
      }),
    },
    {
      "bin/dismantle": DISMANTLE_SCRIPT,
      "test/dismantle.test.ts": DISMANTLE_TEST_GOOD,
      "witness/dismantle.json": fixtureSpec({
        id: "dismantle-guard",
        behavior: "dismantle-refuses-carried-commits",
        tests: ["dismantle refuses a branch carrying commits"],
        class: "destructive",
        dangerousStates: [{ kind: "baseline-ref", ref: "main" }],
        deterministic: true,
        repeats: 1,
      }),
    },
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /T-003/);
  assert.match(outcome.result.detail, /baseline-ref/);
});

test("a witness invoking a destructive command with class additive is red naming the derived class", () => {
  const weak = dismantleFixture(true, "additive");
  const weakOutcome = runGate(weak);
  assert.equal(weakOutcome.result.status, "red", reasonsOf(weakOutcome));
  assert.match(weakOutcome.result.detail, /derived class is destructive/);
  assert.match(weakOutcome.result.detail, /bin\/dismantle/);
  const strong = dismantleFixture(true, "destructive");
  const strongOutcome = runGate(strong);
  assert.equal(strongOutcome.result.status, "green", reasonsOf(strongOutcome));
});

// ---------------------------------------------------------------------------
// Criterion 3b: the CR-661 guard-that-asserts-text shape (rule (g))
// ---------------------------------------------------------------------------

const GUARD_WORKFLOW_PATH = ".github/workflows/guard.yml";

const GUARD_STEP = [
  "      - name: falsifiability guard",
  "        run: |",
  "          if scripts/harness.sh; then",
  '            echo "FALSIFIABILITY GUARD BROKEN: the harness exited 0" >&2',
  "            exit 1",
  "          fi",
  '          echo "guard witnessed a failing harness"',
  "",
].join("\n");

const GUARD_WORKFLOW =
  ["name: guard", "jobs:", "  guard:", "    steps:"].join("\n") + "\n" + GUARD_STEP;

const GUARD_TEXT_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    "",
    'test("the falsifiability guard step is wired", () => {',
    '  const body = READ_DOC(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    '  assert.ok(body.includes("scripts/harness.sh"));',
    "});",
    "",
  ].join("\n"),
);

const GUARD_BEHAVIOR_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";',
    'import { tmpdir } from "node:os";',
    'import { join } from "node:path";',
    'import { spawnSync } from "node:child_process";',
    "",
    'test("the falsifiability guard step fails the job when the harness exits 0", () => {',
    '  const body = READ_DOC(".github/workflows/guard.yml", "utf8");',
    '  const lines = body.split("\\n");',
    '  const start = lines.findIndex((l) => l.indexOf("run: |") >= 0);',
    "  if (start < 0) {",
    '    assert.fail("guard step missing from the workflow");',
    "  }",
    '  const script = lines.slice(start + 1).map((l) => l.slice(10)).join("\\n");',
    '  const dir = mkdtempSync(join(tmpdir(), "guard-"));',
    '  writeFileSync(join(dir, "step.sh"), script);',
    '  mkdirSync(join(dir, "scripts"), { recursive: true });',
    '  writeFileSync(join(dir, "scripts/harness.sh"), "#!/bin/sh\\nexit 0\\n");',
    '  chmodSync(join(dir, "scripts/harness.sh"), 0o755);',
    '  const res = spawnSync("bash", [join(dir, "step.sh")], { cwd: dir, encoding: "utf8" });',
    "  assert.equal(res.status === 0, false);",
    "});",
    "",
  ].join("\n"),
);

const GUARD_MEMBER_DELETE = {
  kind: "mutation",
  file: GUARD_WORKFLOW_PATH,
  find: GUARD_STEP,
  replace: "",
};

const GUARD_MEMBER_EXIT_FLIP = {
  kind: "mutation",
  file: GUARD_WORKFLOW_PATH,
  find: "            exit 1",
  replace: "            exit 0",
};

function guardFixture(
  testBody: string,
  testName: string,
  members: Array<Record<string, unknown>>,
): Fixture {
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "guard-wired": testName,
      }),
    },
    {
      [GUARD_WORKFLOW_PATH]: GUARD_WORKFLOW,
      "scripts/harness.sh": "#!/bin/sh\nexit 1\n",
      "test/guard.test.ts": testBody,
      "witness/guard.json": fixtureSpec({
        id: "guard-wired",
        behavior: "guard-wired",
        tests: [testName],
        class: "additive",
        dangerousStates: members,
        deterministic: true,
        repeats: 1,
      }),
    },
  );
}

test("a text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_TEXT_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.match(outcome.result.detail, /one witness is not a class/);
});

test("a member preserving every asserted string that stays green makes the witness red", () => {
  const fixture = guardFixture(
    GUARD_TEXT_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE, GUARD_MEMBER_EXIT_FLIP],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  // The harness verified mechanically that the exit-flip member preserves
  // every asserted string, ran it, and found the named test green under it
  // (the CR-661 reproduction's measured shape: exit=0 pass 1 fail 0 with
  // ONLY exit 1 changed to exit 0).
  const flip = outcome.evaluations[0]?.members.find(
    (member) => member.index === 1,
  );
  assert.equal(flip?.preservesAssertedText, true);
  assert.equal(flip?.rate?.red, 0);
  const deleted = outcome.evaluations[0]?.members.find(
    (member) => member.index === 0,
  );
  assert.equal(deleted?.rate?.red, 1);
});

test("a behavior-executing test red under both members makes the witness green", () => {
  const fixture = guardFixture(
    GUARD_BEHAVIOR_TEST,
    "the falsifiability guard step fails the job when the harness exits 0",
    [GUARD_MEMBER_DELETE, GUARD_MEMBER_EXIT_FLIP],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  assert.equal(outcome.result.units, 1);
  for (const member of outcome.evaluations[0]?.members ?? []) {
    assert.equal(member.rate?.red, 1, member.description);
  }
});

test("two members mutating the same line are red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_TEXT_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_EXIT_FLIP, GUARD_MEMBER_EXIT_FLIP],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /count as one member/);
});

// ---------------------------------------------------------------------------
// CR-H1 (fix round 1): rule (g) detection must not be bypassed by the
// standard read/assert idioms the plan names. Each idiom below is a member of
// the "detection escape" class; the detection must redden under at least two
// structurally different members (async read; a variable pattern; a variable
// path), each as a single-member collapse (green under the narrow detection,
// red once broadened) and, where the pattern is extractable, under a
// text-preserving meaning-inverting member.
// ---------------------------------------------------------------------------

// Idiom 1: an async read (node:fs/promises), with LITERAL regex assertions so
// the preservation arm is exercised too.
const GUARD_ASYNC_TEXT_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFile } from "node:fs/promises";',
    "",
    'test("the falsifiability guard step is wired", async () => {',
    '  const body = READ_DOC_ASYNC(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    '  assert.ok(body.includes("scripts/harness.sh"));',
    "});",
    "",
  ].join("\n"),
);

// Idiom 2: a sync read but a VARIABLE regex (assert.match(body, wanted)), so
// no pattern is statically extractable and the detector must fail
// conservatively on the read+assert signal.
const GUARD_VAR_REGEX_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    "",
    "const wanted = /falsifiability guard/;",
    "const alsoWanted = /FALSIFIABILITY GUARD BROKEN/;",
    'test("the falsifiability guard step is wired", () => {',
    '  const body = READ_DOC(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, wanted);",
    "  assert.match(body, alsoWanted);",
    "});",
    "",
  ].join("\n"),
);

// Idiom 3: a sync read whose PATH is held in a variable (readFileSync(P) with
// const P = "....yml"), so the document literal is not inside the read call.
const GUARD_VAR_PATH_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    "",
    'const guardDoc = ".github/workflows/guard.yml";',
    'test("the falsifiability guard step is wired", () => {',
    '  const body = READ_DOC(guardDoc, "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    "});",
    "",
  ].join("\n"),
);

test("an async-read text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_ASYNC_TEXT_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

test("an async-read text-asserting witness is red when its text-preserving member leaves the test green", () => {
  const fixture = guardFixture(
    GUARD_ASYNC_TEXT_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE, GUARD_MEMBER_EXIT_FLIP],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  // The exit-flip member preserves every asserted string (the async read is
  // now detected, so the preservation arm runs) yet the text test stays green
  // under it: hazard #3, caught.
  const flip = outcome.evaluations[0]?.members.find(
    (member) => member.index === 1,
  );
  assert.equal(flip?.preservesAssertedText, true);
  assert.equal(flip?.rate?.red, 0);
});

test("a variable-regex text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_VAR_REGEX_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

test("a variable-path text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_VAR_PATH_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

// ---------------------------------------------------------------------------
// CR-1500 (fix round 2): rule (g) detection must not be bypassed by the
// NAMESPACE-QUALIFIED read, the DOMINANT real-world idiom. Round one broadened
// recognition to the bare async named-import and variable forms but still saw
// only a bare `readFile`/`readFileSync` callee, so `fs.readFileSync(...)`,
// `await fs.promises.readFile(...)` and an aliased `fsp.readFile(...)` shipped
// a single deleting text-asserting witness GREEN. These are structurally
// different members of the "namespace read escape" class (a one-hop namespace,
// a two-hop `fs.promises` chain, an aliased namespace), each demonstrated
// green under the pre-fix detector and red once the callee is recognised, and
// one also under a text-preserving meaning-inverting member.
// ---------------------------------------------------------------------------

// Member G: a one-hop namespace sync read, fs.readFileSync, LITERAL regexes so
// the preservation arm runs too.
const GUARD_NS_SYNC_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import fs from "node:fs";',
    "",
    'test("the falsifiability guard step is wired", () => {',
    '  const body = NSREAD_SYNC(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    "});",
    "",
  ].join("\n"),
);

// Member A: a two-hop namespace async read, await fs.promises.readFile.
const GUARD_NS_ASYNC_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import fs from "node:fs";',
    "",
    'test("the falsifiability guard step is wired", async () => {',
    '  const body = NSREAD_ASYNC(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    "});",
    "",
  ].join("\n"),
);

// Member A2: an ALIASED namespace read, `const fsp = fs.promises; fsp.readFile`.
const GUARD_NS_ALIAS_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import fs from "node:fs";',
    "",
    "const fsp = fs.promises;",
    'test("the falsifiability guard step is wired", async () => {',
    '  const body = await NSREAD_ALIAS(".github/workflows/guard.yml", "utf8");',
    "  assert.match(body, /falsifiability guard/);",
    "  assert.match(body, /FALSIFIABILITY GUARD BROKEN/);",
    "});",
    "",
  ].join("\n"),
);

test("a namespace sync-read text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_NS_SYNC_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

test("a namespace async-read text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_NS_ASYNC_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

test("an aliased-namespace read text-asserting witness with a single member is red naming the collapse", () => {
  const fixture = guardFixture(
    GUARD_NS_ALIAS_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /single-member collapse/);
  assert.equal(outcome.evaluations[0]?.textAsserting, true);
});

test("a namespace sync-read text-asserting witness is red when its text-preserving member leaves the test green", () => {
  const fixture = guardFixture(
    GUARD_NS_SYNC_TEST,
    "the falsifiability guard step is wired",
    [GUARD_MEMBER_DELETE, GUARD_MEMBER_EXIT_FLIP],
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  // The exit-flip member preserves every asserted string (the namespace read
  // is now detected, so the preservation arm runs) yet the text test stays
  // green under it: hazard #3 for the dominant idiom, caught.
  const flip = outcome.evaluations[0]?.members.find(
    (member) => member.index === 1,
  );
  assert.equal(flip?.preservesAssertedText, true);
  assert.equal(flip?.rate?.red, 0);
});

// CR-1501 (fix round 2, folded): an extension-less root document (a path with
// neither "/" nor ".") read and text-asserted is exercised in the detection
// matrix below (Makefile via a namespace read, LICENSE via a bare read: two
// structurally different recognised members), not as a separate gate-level
// collapse fixture. The gate machinery downstream of detection is already
// demonstrated red-green by the namespace collapse fixtures above; once
// isDocumentPathLiteral returns true the identical single-member-collapse path
// applies, so the CR-1501 delta is purely a DETECTION change and is witnessed
// where the detection lives.

// The detection matrix and its NAMED residue, asserted directly against the
// exported derivation so the boundary is pinned. Sources are built through
// fixRead so this file's own source carries only placeholders (the self-guard
// test above stays green). Recognised: namespace sync/async/alias reads and
// recognised extension-less root docs. Residue (must stay not-text, matching
// the aliased-callee residue already named): a callee bound to another
// variable, callback-style reads, two-hop variable rebinding, and an
// extension-less name outside the recognised set.
test("deriveTextAssertions recognises the namespace and root-doc reads and leaves the named residue not-text", () => {
  const DOC = ".github/workflows/guard.yml";
  const A = "  assert.match(body, /falsifiability guard/);";
  const recognised: Array<[string, string]> = [
    ["namespace sync", `const body = NSREAD_SYNC("${DOC}", "utf8");\n${A}`],
    ["namespace async", `const body = NSREAD_ASYNC("${DOC}", "utf8");\n${A}`],
    [
      "aliased namespace",
      `const fsp = f.promises;\nconst body = await NSREAD_ALIAS("${DOC}", "utf8");\n${A}`,
    ],
    ["root doc Makefile", `const body = NSREAD_SYNC("Makefile", "utf8");\n${A}`],
    ["root doc LICENSE", `const body = READ_DOC("LICENSE", "utf8");\n${A}`],
  ];
  for (const [label, source] of recognised) {
    assert.equal(
      deriveTextAssertions([fixRead(source)]).textAsserting,
      true,
      `expected ${label} to be recognised as text-asserting`,
    );
  }
  const residue: Array<[string, string]> = [
    [
      "callee bound to another variable",
      `const rf = NSREAD_SYNC;\nconst body = rf("${DOC}", "utf8");\n${A}`,
    ],
    [
      "callback-style read",
      `READ_DOC(("${DOC}"), (e, data) => { assert.match(data, /falsifiability guard/); });`,
    ],
    [
      "two-hop variable rebinding",
      `const raw = NSREAD_SYNC("${DOC}", "utf8");\n  const body = raw;\n${A}`,
    ],
    [
      "extension-less name outside the set",
      `const body = NSREAD_SYNC("randomtoken", "utf8");\n${A}`,
    ],
  ];
  for (const [label, source] of residue) {
    assert.equal(
      deriveTextAssertions([fixRead(source)]).textAsserting,
      false,
      `expected residue ${label} to stay not-text (named, not chased)`,
    );
  }
});

// Over-reach guard (the round-one property, lifted to the namespace form): a
// namespace read whose RESULT is consumed as a derived value, not text-asserted
// directly, must stay behaviour. The fix gives the namespace read exactly the
// classification the bare read already had; it does not falsely redden these.
test("deriveTextAssertions does not falsely redden a namespace derived-value behaviour witness", () => {
  const DOC = ".github/workflows/guard.yml";
  const overReach: Array<[string, string]> = [
    [
      "namespace read passed to a project function",
      `const body = NSREAD_SYNC("${DOC}", "utf8");\n  assert.ok(isTransient(body));`,
    ],
    [
      "namespace read parsed then asserted on a derived field",
      `const body = NSREAD_ASYNC("${DOC}", "utf8");\n  const n = JSON.parse(body).count;\n  assert.equal(n, 3);`,
    ],
    [
      "namespace read of a runtime path held in a variable",
      `const p = jn(cwd(), "run-counter.txt");\n  const body = NSREAD_SYNC(p, "utf8");\n  assert.match(body, /x/);`,
    ],
  ];
  for (const [label, source] of overReach) {
    assert.equal(
      deriveTextAssertions([fixRead(source)]).textAsserting,
      false,
      `expected over-reach case ${label} to stay behaviour (not-text)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Criterion 4: the measured 3-of-5 stage-path collision shape (row 16)
// ---------------------------------------------------------------------------

const ATOMIC_SRC = [
  'import { writeFileSync, renameSync } from "node:fs";',
  'import { randomUUID } from "node:crypto";',
  "",
  "export function beginWrite(path) {",
  '  const stage = path + "." + randomUUID() + ".stage";',
  "  return {",
  "    stage(body) { writeFileSync(stage, body); },",
  "    commit() { renameSync(stage, path); },",
  "  };",
  "}",
  "",
].join("\n");

const ATOMIC_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";',
    'import { tmpdir } from "node:os";',
    'import { join } from "node:path";',
    'import { beginWrite } from "../src/atomic.ts";',
    "",
    "// The interleave schedule is keyed on a per-clone run counter so the",
    "// collision is forced on runs 1 to 3 of every 5 and serialised on runs",
    "// 4 and 5: the REAL mechanism (a fixed stage path shared by two",
    "// concurrent passes, the loser dying on rename ENOENT) at the REAL",
    "// measured rate (3 of 5, clean-room-m1-p5-round4-criteria.md).",
    'test("two concurrent passes both surface their turn end", () => {',
    '  const counterPath = join(process.cwd(), "run-counter.txt");',
    "  let count = 1;",
    "  if (existsSync(counterPath)) {",
    '    count = Number(READ_DOC(counterPath, "utf8")) + 1;',
    "  }",
    "  writeFileSync(counterPath, String(count));",
    "  const phase = ((count - 1) % 5) + 1;",
    "  const interleave = phase <= 3;",
    '  const dest = join(mkdtempSync(join(tmpdir(), "atomic-")), "state.json");',
    "  const a = beginWrite(dest);",
    "  const b = beginWrite(dest);",
    "  if (interleave) {",
    '    a.stage("A");',
    '    b.stage("B");',
    "    a.commit();",
    "    b.commit();",
    "  } else {",
    '    a.stage("A");',
    "    a.commit();",
    '    b.stage("B");',
    "    b.commit();",
    "  }",
    '  assert.equal(READ_DOC(dest, "utf8"), "B");',
    "});",
    "",
  ].join("\n"),
);

function atomicFixture(deterministic: boolean): Fixture {
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "atomic-two-passes": "two concurrent passes both surface their turn end",
      }),
    },
    {
      "src/atomic.ts": ATOMIC_SRC,
      "test/atomic.test.ts": ATOMIC_TEST,
      "witness/atomic.json": fixtureSpec({
        id: "atomic-stage-unique",
        behavior: "atomic-two-passes",
        tests: ["two concurrent passes both surface their turn end"],
        class: "additive",
        dangerousStates: [
          {
            kind: "mutation",
            file: "src/atomic.ts",
            find: 'path + "." + randomUUID() + ".stage"',
            replace: 'path + ".stage"',
          },
        ],
        deterministic,
        repeats: 5,
      }),
    },
  );
}

test("a deterministic witness red in three of five repetitions is red carrying the rate", () => {
  const fixture = atomicFixture(true);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /red in 3 of 5 repetitions/);
  const member = outcome.evaluations[0]?.members[0];
  assert.equal(member?.rate?.red, 3);
  assert.equal(member?.rate?.total, 5);
});

test("the same rate declared nondeterministic is green with the rate recorded", () => {
  const fixture = atomicFixture(false);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  const member = outcome.evaluations[0]?.members[0];
  assert.equal(member?.rate?.red, 3);
  assert.equal(member?.rate?.total, 5);
});

// ---------------------------------------------------------------------------
// Criterion 4a: the unreached classifier arm (T-006)
// ---------------------------------------------------------------------------

const CLASSIFY_SRC = [
  "export function classify(msg) {",
  '  if (msg.indexOf("cannot lock ref") >= 0) {',
  '    return "transient";',
  "  }",
  '  return "permanent";',
  "}",
  "",
].join("\n");

const CLASSIFY_TEST_UNREACHING = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { classify } from "../src/classify.ts";',
  "",
  'test("classifier calls a plain failure permanent", () => {',
  '  assert.equal(classify("fatal: boom"), "permanent");',
  "});",
  "",
].join("\n");

const CLASSIFY_TEST_REACHING =
  CLASSIFY_TEST_UNREACHING +
  [
    'test("classifier calls the contention shape transient", () => {',
    '  assert.equal(classify("error: cannot lock ref x"), "transient");',
    "});",
    "",
  ].join("\n");

function classifierFixture(reaching: boolean): Fixture {
  // Direction two of criterion 4a ADDS a test that reaches the arm and
  // names it; a member requires EVERY named test to fail, so the witness
  // names the reaching test once it exists.
  const tests = reaching
    ? ["classifier calls the contention shape transient"]
    : ["classifier calls a plain failure permanent"];
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "classifier-arms": "classifier calls a plain failure permanent",
      }),
    },
    {
      "src/classify.ts": CLASSIFY_SRC,
      "test/classify.test.ts": reaching
        ? CLASSIFY_TEST_REACHING
        : CLASSIFY_TEST_UNREACHING,
      "witness/classify.json": fixtureSpec({
        id: "classifier-arm-guard",
        behavior: "classifier-arms",
        tests,
        class: "additive",
        dangerousStates: [
          {
            kind: "mutation",
            file: "src/classify.ts",
            find: 'return "transient";',
            replace: 'return "permanent";',
          },
        ],
        deterministic: true,
        repeats: 1,
      }),
    },
  );
}

test("a mutation no named test reaches is red naming the file line and green tests", () => {
  const fixture = classifierFixture(false);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /no named test reaches this arm/);
  assert.match(outcome.result.detail, /src\/classify\.ts/);
  const member = outcome.evaluations[0]?.members[0];
  assert.notEqual(member?.unreachedArm, undefined);
  assert.equal(member?.unreachedArm?.file, "src/classify.ts");
  assert.equal((member?.unreachedArm?.lines.length ?? 0) > 0, true);
  assert.deepEqual(member?.unreachedArm?.greenTests, [
    "classifier calls a plain failure permanent",
  ]);
});

test("adding a test that reaches the arm makes the same witness green", () => {
  const fixture = classifierFixture(true);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  const member = outcome.evaluations[0]?.members[0];
  assert.equal(member?.rate?.red, 1);
  assert.equal(member?.unreachedArm, undefined);
});

// ---------------------------------------------------------------------------
// Criteria 5 and 5a: captures, real contention stderr, derived obligation
// ---------------------------------------------------------------------------

const RETRY_SRC = [
  'import { spawnSync } from "node:child_process";',
  "",
  "export const LOCK_CONTENTION = /index\\.lock|Unable to create '[^']*\\.lock'|cannot lock ref '[^']*': is at [0-9a-f]+ but expected/;",
  "",
  "export function isTransient(stderr) {",
  "  return LOCK_CONTENTION.test(stderr);",
  "}",
  "",
  "export function runGitOnce(cwd, args) {",
  '  return spawnSync("git", args, { cwd, encoding: "utf8" });',
  "}",
  "",
].join("\n");

const RETRY_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    'import { isTransient } from "../src/retry.ts";',
    "",
    'test("the real contention stderr is classified transient", () => {',
    '  const line = READ_DOC("captures/git-contention-stderr.txt", "utf8").trim();',
    "  assert.equal(isTransient(line), true);",
    "});",
    "",
  ].join("\n"),
);

function retryFixture(consumes: Record<string, unknown> | undefined): Fixture {
  const spec: Record<string, unknown> = {
    id: "retry-transient-guard",
    behavior: "retry-transient",
    tests: ["the real contention stderr is classified transient"],
    class: "additive",
    dangerousStates: [
      {
        kind: "mutation",
        file: "src/retry.ts",
        find: "|cannot lock ref '[^']*': is at [0-9a-f]+ but expected",
        replace: "",
      },
    ],
    deterministic: true,
    repeats: 1,
  };
  if (consumes !== undefined) {
    spec["consumesExternalOutput"] = consumes;
  }
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "retry-transient": "the real contention stderr is classified transient",
      }),
    },
    {
      "src/retry.ts": RETRY_SRC,
      "test/retry.test.ts": RETRY_TEST,
      "captures/git-contention-stderr.txt": REAL_CONTENTION_STDERR,
      "witness/retry.json": fixtureSpec(spec),
    },
  );
}

const RETRY_CONSUMES = {
  program: "git fetch under forced remote-tracking ref contention",
  captures: ["captures/git-contention-stderr.txt"],
  provenance:
    "delivery/review/verification-m1-p3-fix-round.md finding V-2: 312 real " +
    "captured contention failures, every one of this shape; the exact line " +
    "is the orchestrator re-performance (is at a0e80f0 but expected a0d1254)",
};

test("a diff touching a spawning module without the capture field is red naming the derivation", () => {
  const fixture = retryFixture(undefined);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /rule \(f\)/);
  assert.match(outcome.result.detail, /src\/retry\.ts/);
  assert.match(outcome.result.detail, /consumesExternalOutput/);
});

test("a witness citing a real capture is evaluable and records its sha and provenance", () => {
  const fixture = retryFixture(RETRY_CONSUMES);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  const captures = outcome.evaluations[0]?.captures;
  assert.equal(captures?.length, 1);
  assert.match(captures?.[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.match(captures?.[0]?.provenance ?? "", /verification-m1-p3-fix-round/);
});

test("a cited capture missing from the repository is red naming it", () => {
  const fixture = retryFixture({
    ...RETRY_CONSUMES,
    captures: ["captures/absent.txt"],
  });
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /captures\/absent\.txt is missing/);
});

// ---------------------------------------------------------------------------
// CR-H2 (fix round 1): rule (f)'s capture obligation must also see a shell
// script that spawns and parses another program's output. M1's V-2 lived in
// bin/fm-*.sh scripts classifying git contention output; the four-JS-token
// grep is blind to them, so a bin/*.sh guarded by a hand-written string
// shipped green with no consumesExternalOutput required.
// ---------------------------------------------------------------------------

// A shell script that captures a program's output (pipe into grep) and
// classifies it: the V-2 shape, in shell.
const CLASSIFY_SH = [
  "#!/bin/sh",
  "# classify a git failure line as transient or permanent",
  'line="$1"',
  'if printf "%s" "$line" | grep -q "cannot lock ref"; then',
  "  echo transient",
  "else",
  "  echo permanent",
  "fi",
  "",
].join("\n");

const CLASSIFY_MEMBER = {
  kind: "mutation",
  file: "bin/classify.sh",
  find: "cannot lock ref",
  replace: "cannot bogus ref",
};

// The dangerous guard: a test that hand-writes the git output rather than
// feeding a real capture (CLAUDE.md warning 10, the exact V-2 anti-pattern).
const CLASSIFY_HANDWRITTEN_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { spawnSync } from "node:child_process";',
  "",
  'test("classify calls a contention line transient", () => {',
  '  const res = spawnSync("sh", ["bin/classify.sh", "fatal: cannot lock ref whatever"], { encoding: "utf8" });',
  '  assert.equal(res.stdout.trim(), "transient");',
  "});",
  "",
].join("\n");

// The corrected guard: it feeds the REAL captured contention stderr, and the
// spec cites that capture.
const CLASSIFY_CAPTURE_TEST = fixRead(
  [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    'import { spawnSync } from "node:child_process";',
    "",
    'test("classify calls the real contention line transient", () => {',
    '  const line = READ_DOC("captures/git-contention-stderr.txt", "utf8").trim();',
    '  const res = spawnSync("sh", ["bin/classify.sh", line], { encoding: "utf8" });',
    '  assert.equal(res.stdout.trim(), "transient");',
    "});",
    "",
  ].join("\n"),
);

const CLASSIFY_CONSUMES = {
  program: "git fetch under forced remote-tracking ref contention",
  captures: ["captures/git-contention-stderr.txt"],
  provenance:
    "delivery/review/verification-m1-p3-fix-round.md finding V-2: the exact " +
    "line is the orchestrator re-performance (is at a0e80f0 but expected a0d1254)",
};

function classifyFixture(
  consumes: Record<string, unknown> | undefined,
  testBody: string,
  testName: string,
): Fixture {
  const spec: Record<string, unknown> = {
    id: "classify-transient-guard",
    behavior: "classify-transient",
    tests: [testName],
    class: "additive",
    dangerousStates: [CLASSIFY_MEMBER],
    deterministic: true,
    repeats: 1,
  };
  if (consumes !== undefined) {
    spec["consumesExternalOutput"] = consumes;
  }
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "classify-transient": testName,
      }),
    },
    {
      "bin/classify.sh": CLASSIFY_SH,
      "test/classify.test.ts": testBody,
      "captures/git-contention-stderr.txt": REAL_CONTENTION_STDERR,
      "witness/classify.json": fixtureSpec(spec),
    },
  );
}

test("a diff touching a spawning shell script without the capture field is red naming the derivation", () => {
  const fixture = classifyFixture(
    undefined,
    CLASSIFY_HANDWRITTEN_TEST,
    "classify calls a contention line transient",
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /rule \(f\)/);
  assert.match(outcome.result.detail, /bin\/classify\.sh/);
  assert.match(outcome.result.detail, /consumesExternalOutput/);
});

test("a spawning shell script witness citing the real capture is green", () => {
  const fixture = classifyFixture(
    CLASSIFY_CONSUMES,
    CLASSIFY_CAPTURE_TEST,
    "classify calls the real contention line transient",
  );
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  const captures = outcome.evaluations[0]?.captures;
  assert.equal(captures?.length, 1);
  assert.match(captures?.[0]?.provenance ?? "", /verification-m1-p3-fix-round/);
});

// ---------------------------------------------------------------------------
// Criterion 6: diff intersection (rule (d))
// ---------------------------------------------------------------------------

test("a mutation member outside the phase diff is red naming the member and moving it in is evaluable", () => {
  const outside = adderFixture(
    adderSpec({
      dangerousStates: [
        {
          kind: "mutation",
          file: "src/legacy.ts",
          find: '"untouched"',
          replace: '"broken"',
        },
      ],
    }),
  );
  const outsideOutcome = runGate(outside);
  assert.equal(outsideOutcome.result.status, "red", reasonsOf(outsideOutcome));
  assert.match(
    outsideOutcome.result.detail,
    /declared dangerous state does not intersect the phase diff/,
  );
  assert.match(outsideOutcome.result.detail, /member 0/);

  const inside = adderFixture();
  const insideOutcome = runGate(inside);
  assert.equal(insideOutcome.result.status, "green", reasonsOf(insideOutcome));
});

// ---------------------------------------------------------------------------
// Criterion 7: the pin witness (five fields; mtimeMs named)
// ---------------------------------------------------------------------------

test("a byte-identical rewrite between the pins is an error naming the path and mtimeMs", () => {
  const fixture = adderFixture();
  const outcome = runGate(fixture, {
    hooks: {
      betweenPins: (cloneDir: string) => {
        const target = join(cloneDir, "src/adder.ts");
        const body = readFileSync(target, "utf8");
        writeFileSync(target, body);
      },
    },
  });
  assert.equal(outcome.result.status, "error", reasonsOf(outcome));
  assert.match(outcome.result.detail, /adder\.ts changed during the run/);
  assert.match(outcome.result.detail, /mtimeMs/);
});

// ---------------------------------------------------------------------------
// Criterion 9: stored-witness re-evaluation (the N-401 shape)
// ---------------------------------------------------------------------------

const THING_SRC_BASE = [
  "export function classify(x) {",
  "  if (x > 10) {",
  '    return "big";',
  "  }",
  '  return "small";',
  "}",
  "",
].join("\n");

const THING_SRC_BROKEN = [
  "export function classify(x) {",
  "  if (x > 10) {",
  "    return early(x);",
  "  }",
  "  if (x > 10) {",
  '    return "big";',
  "  }",
  '  return "small";',
  "}",
  "",
  "function early(x) {",
  '  return "b" + "ig";',
  "}",
  "",
].join("\n");

const THING_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { classify } from "../src/thing.ts";',
  "",
  'test("thing classifies big inputs", () => {',
  '  assert.equal(classify(20), "big");',
  "});",
  "",
].join("\n");

const UTIL_SRC_BASE = [
  "export function double(x) {",
  "  return x * 2;",
  "}",
  "",
].join("\n");

const UTIL_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { double } from "../src/util.ts";',
  "",
  'test("util doubles its input", () => {',
  "  assert.equal(double(4), 8);",
  "});",
  "",
].join("\n");

const THING_MEMBER_FIND = ['  if (x > 10) {', '    return "big";', "  }"].join(
  "\n",
);

function storedFixture(broken: boolean): Fixture {
  const headFiles: Record<string, string> = {
    "src/util.ts": UTIL_SRC_BASE + "// audited\n",
  };
  if (broken) {
    headFiles["src/thing.ts"] = THING_SRC_BROKEN;
  }
  return makeFixture(
    {
      "gates.manifest.json": fixtureManifest([]),
      "test/behaviors.json": fixtureBehaviors({
        "thing-big": "thing classifies big inputs",
        "util-doubles": "util doubles its input",
      }),
      "src/thing.ts": THING_SRC_BASE,
      "src/util.ts": UTIL_SRC_BASE,
      "test/thing.test.ts": THING_TEST,
      "test/util.test.ts": UTIL_TEST,
      "witness/thing.json": fixtureSpec({
        id: "thing-guard",
        behavior: "thing-big",
        tests: ["thing classifies big inputs"],
        class: "additive",
        dangerousStates: [
          {
            kind: "mutation",
            file: "src/thing.ts",
            find: THING_MEMBER_FIND,
            replace: THING_MEMBER_FIND.replace('"big"', '"small"'),
          },
        ],
        deterministic: true,
        repeats: 1,
      }),
      "witness/util.json": fixtureSpec({
        id: "util-guard",
        behavior: "util-doubles",
        tests: ["util doubles its input"],
        class: "additive",
        dangerousStates: [
          {
            kind: "mutation",
            file: "src/util.ts",
            find: "return x * 2;",
            replace: "return x * 3;",
          },
        ],
        deterministic: true,
        repeats: 1,
      }),
    },
    headFiles,
  );
}

test("a stored witness gone green under the diff is red naming it with its rate", () => {
  const fixture = storedFixture(true);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(outcome.result.detail, /thing-guard no longer guards its behavior/);
  assert.match(outcome.result.detail, /red 0\/1/);
});

test("reverting the change that broke a stored witness returns exit zero", () => {
  const fixture = storedFixture(false);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.result.units, 1);
});

// ---------------------------------------------------------------------------
// Criterion 10: baseline resolved from the FETCHED remote
// ---------------------------------------------------------------------------

const GREETER_BASE = [
  "export function greet() {",
  '  return "hello";',
  "}",
  "",
].join("\n");

const GREETER_HEAD = [
  "export function greet() {",
  '  return "hello, world";',
  "}",
  "",
].join("\n");

const GREETER_TEST = [
  'import test from "node:test";',
  'import assert from "node:assert/strict";',
  'import { greet } from "../src/greeter.ts";',
  "",
  'test("greeter greets the world", () => {',
  '  assert.equal(greet(), "hello, world");',
  "});",
  "",
].join("\n");

test("the recorded baseline sha equals the fetched remote head not the local ref", () => {
  const upstream = mkdtempSync(join(tmpdir(), "wup-"));
  git(upstream, "init", "-q", "-b", "main");
  writeTree(upstream, {
    "gates.manifest.json": fixtureManifest([]),
    "test/behaviors.json": fixtureBehaviors({
      "greeter-world": "greeter greets the world",
    }),
    "src/greeter.ts": GREETER_BASE,
  });
  git(upstream, "add", "-A");
  git(upstream, "commit", "-q", "-m", "c1");
  const c1 = git(upstream, "rev-parse", "HEAD");

  const local = mkdtempSync(join(tmpdir(), "wloc-"));
  const localRepo = join(local, "repo");
  git(local, "clone", "-q", upstream, localRepo);

  // The upstream advances AFTER the clone, so the local origin/main is
  // stale by construction.
  writeTree(upstream, { "README.md": "moved on\n" });
  git(upstream, "add", "-A");
  git(upstream, "commit", "-q", "-m", "c3");
  const c3 = git(upstream, "rev-parse", "HEAD");

  writeTree(localRepo, {
    "src/greeter.ts": GREETER_HEAD,
    "test/greeter.test.ts": GREETER_TEST,
    "witness/greeter.json": fixtureSpec({
      id: "greeter-guard",
      behavior: "greeter-world",
      tests: ["greeter greets the world"],
      class: "additive",
      dangerousStates: [
        { kind: "baseline-ref", ref: "main" },
        {
          kind: "mutation",
          file: "src/greeter.ts",
          find: '"hello, world"',
          replace: '"hello"',
        },
      ],
      deterministic: true,
      repeats: 1,
    }),
  });
  git(localRepo, "add", "-A");
  git(localRepo, "commit", "-q", "-m", "c2");
  const head = git(localRepo, "rev-parse", "HEAD");
  const staleLocal = git(localRepo, "rev-parse", "refs/remotes/origin/main");
  assert.equal(staleLocal, c1);

  const fixture: Fixture = { dir: localRepo, base: c1, head };
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "green", reasonsOf(outcome));
  const baselineMember = outcome.evaluations[0]?.members[0];
  assert.equal(baselineMember?.baselineSha, c3);
  assert.notEqual(baselineMember?.baselineSha, c1);
});

// ---------------------------------------------------------------------------
// Step 7 remainders: coverage red, shallow refusal
// ---------------------------------------------------------------------------

test("source changed with no witness spec covering it is red naming the file", () => {
  const fixture = adderFixture(undefined, true);
  const outcome = runGate(fixture);
  assert.equal(outcome.result.status, "red", reasonsOf(outcome));
  assert.match(
    outcome.result.detail,
    /source changed with no witness spec covering it: src\/adder\.ts/,
  );
});

test("a shallow repository is an error naming the fetch depth requirement", () => {
  const fixture = adderFixture();
  const shallowParent = mkdtempSync(join(tmpdir(), "wshal-"));
  const shallowDir = join(shallowParent, "repo");
  git(
    shallowParent,
    "clone",
    "-q",
    "--depth",
    "1",
    `file://${fixture.dir}`,
    shallowDir,
  );
  const outcome = runRedWitnessGate({
    repoRoot: shallowDir,
    base: fixture.base,
  });
  assert.equal(outcome.result.status, "error");
  assert.match(outcome.result.detail, /shallow/);
  assert.match(outcome.result.detail, /fetch-depth: 0/);
  assertCallerClean(fixture);
});
