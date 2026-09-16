/**
 * THE CUTOVER-ENTRY TRIGGER TESTS (kernel plan M4, M4-P27 criteria 2, 3 and 4).
 *
 * THE DANGEROUS STATE EVERY WITNESS HERE REDDENS AGAINST is a trigger that
 * reports READY when it is not. The red-witness rule's stronger form is what
 * shapes this file: a test that is merely red against an absent feature is
 * worthless, so each witness names a state in which acting on the trigger's
 * answer would cause harm.
 *
 * The four shapes of that state, and where each is witnessed:
 *
 *   1. AN ARM GREENS BECAUSE IT COULD NOT REACH THE THING IT CHECKS. The CLI
 *      is absent, so the drain question was never asked. A two-state checker
 *      answers "false" and a careless one answers "true"; both are wrong, and
 *      the exit code must distinguish them.
 *   2. AN ARM GREENS ON AN EMPTY RESULT. A retirement report naming zero rows
 *      is not a report naming zero unported rows. A freshness comparison with
 *      nothing to compare against is a guard that cannot go red. An exclusion
 *      suite that runs zero tests exits 0.
 *   3. THE OWNER STEP IS TREATED AS DONE. The all-satisfied fixture is the
 *      dangerous one here: every computed arm holds, and a naive
 *      implementation prints a green light. It must halt.
 *   4. THE PROBE WRITES. Not "is intended not to write": the chokepoint is
 *      exercised against a scratch repository with a real pending commit and a
 *      real uncommitted edit, and against a stub server that counts requests.
 *
 * NOTHING HERE TOUCHES A SHIPPED FILE. Every fixture is built under a fresh
 * `mkdtempSync` root and removed afterwards, so no test mutates the repository
 * it is running inside. `git checkout --` in a tree holding uncommitted work is
 * destructive with no safe narrow form (CLAUDE.md standing warning 8), which is
 * also why the scratch repository below is the only place that verb appears.
 *
 * REGISTRY DISCIPLINE. The behaviors assertion at the end checks PRESENCE BY
 * NAME of this phase's rows and asserts no count over `test/behaviors.json`,
 * which is append-only and union-resolved (CLAUDE.md binding convention 5).
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const checkerPath = join(repoRoot, "scripts", "check-cutover-entry.mjs");
const probePath = join(repoRoot, "scripts", "probe-pilot-readonly.mjs");

interface ArmRecord {
  id: string;
  name: string;
  verdict: string;
  reason: string;
}

const checker = (await import(
  new URL("../scripts/check-cutover-entry.mjs", import.meta.url).href
)) as {
  ARM_VERDICTS: string[];
  OVERALL_VERDICTS: string[];
  REQUIRED_EXCLUSION_BEHAVIORS: string[];
  countRetirementRows: (text: string) => { ported: number; unported: number; rows: number };
  overallFor: (arms: ArmRecord[]) => string;
};

const probe = (await import(
  new URL("../scripts/probe-pilot-readonly.mjs", import.meta.url).href
)) as {
  ReadOnlyViolation: new (message: string) => Error;
  assertReadOnlyGit: (args: unknown) => void;
  readOnlyGit: (args: string[], options?: { cwd?: string; timeoutMs?: number }) => {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
  readOnlyHttp: (url: string, options?: Record<string, unknown>) => Promise<Response>;
  overallVerdict: (results: { verdict: string }[]) => string;
  verdictForStatus: (status: number) => string;
  TARGET_VERDICTS: string[];
};

/* ------------------------------------------------------------------ */
/* Fixture construction                                                */
/* ------------------------------------------------------------------ */

const scratchRoots: string[] = [];

function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of scratchRoots) rmSync(dir, { recursive: true, force: true });
});

interface RootSpec {
  /** Text the stub CLI prints for `cutover status`. `null` omits the CLI. */
  statusText?: string | null;
  statusExit?: number;
  /** Text the stub CLI prints for `cutover status --retirement`. */
  retirementText?: string;
  retirementExit?: number;
  /** Behavior names to register. Defaults to the checker's required list. */
  behaviors?: string[];
  /** Body of the stub exclusion test file. */
  exclusionTestBody?: string;
  /** Write the pre-freeze ruleset. */
  ruleset?: boolean;
  /** Write a retirement inventory. */
  inventory?: boolean;
  /** Make the ruleset older than the inventory. */
  rulesetStale?: boolean;
}

const PASSING_TEST_BODY =
  'import test from "node:test";\n' +
  'test("a cross-environment exclusion witness", () => {});\n';

const VACUOUS_TEST_BODY = "// a file that registers no tests at all\n";

function stubCli(spec: RootSpec): string {
  const statusText = spec.statusText ?? "SWITCH planning-and-scope kernel\nDRAIN clean\n";
  const statusExit = spec.statusExit ?? 0;
  const retirementText = spec.retirementText ?? "PORT claude-md ported\nPORT skills ported\n";
  const retirementExit = spec.retirementExit ?? 0;
  return [
    "const args = process.argv.slice(2);",
    'if (args[0] !== "cutover" || args[1] !== "status") {',
    '  process.stderr.write("unknown subcommand\\n");',
    "  process.exit(64);",
    "}",
    'if (args.includes("--retirement")) {',
    `  process.stdout.write(${JSON.stringify(retirementText)});`,
    `  process.exit(${retirementExit});`,
    "}",
    `process.stdout.write(${JSON.stringify(statusText)});`,
    `process.exit(${statusExit});`,
    "",
  ].join("\n");
}

function makeRoot(spec: RootSpec = {}): string {
  const root = scratch("tiphys-cutover-entry-");
  if (spec.statusText !== null) {
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(join(root, "bin", "tiphys.ts"), stubCli(spec), "utf8");
  }

  mkdirSync(join(root, "test"), { recursive: true });
  const names = spec.behaviors ?? checker.REQUIRED_EXCLUSION_BEHAVIORS;
  const behaviors: Record<string, string> = {};
  for (const name of names) behaviors[name] = `fixture row for ${name}`;
  writeFileSync(join(root, "test", "behaviors.json"), JSON.stringify(behaviors, null, 2), "utf8");
  writeFileSync(
    join(root, "test", "cross-environment.test.ts"),
    spec.exclusionTestBody ?? PASSING_TEST_BODY,
    "utf8",
  );

  const cutoverDir = join(root, "delivery", "plan", "cutover");
  mkdirSync(cutoverDir, { recursive: true });
  if (spec.inventory !== false) {
    writeFileSync(
      join(cutoverDir, "retirement-inventory.json"),
      JSON.stringify({ rows: [{ id: "PORT-1" }] }, null, 2),
      "utf8",
    );
  }
  if (spec.ruleset !== false) {
    const rulesetPath = join(cutoverDir, "pre-freeze-ruleset.json");
    writeFileSync(rulesetPath, JSON.stringify({ capturedAt: "fixture" }, null, 2), "utf8");
    if (spec.rulesetStale === true) {
      const old = new Date(Date.now() - 86400000);
      utimesSync(rulesetPath, old, old);
    }
  }
  return root;
}

interface RunResult {
  status: number | null;
  text: string;
}

function runChecker(root: string, extra: string[] = []): RunResult {
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--root", root, "--exclusion-test", "test/cross-environment.test.ts", ...extra],
    { encoding: "utf8", timeout: 300000 },
  );
  return { status: result.status, text: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function armOf(text: string, id: string): string {
  const match = new RegExp(`^ARM ${id} \\S+ (\\S+) -- (.*)$`, "m").exec(text);
  assert.ok(match !== null, `no ARM ${id} line in:\n${text}`);
  return `${match[1]}|${match[2]}`;
}

/* ------------------------------------------------------------------ */
/* The checker                                                         */
/* ------------------------------------------------------------------ */

test("all four arms satisfied exits 0 and still halts at the owner action", () => {
  const root = makeRoot();
  const run = runChecker(root);
  assert.equal(run.status, 0, run.text);
  for (const id of ["a", "b", "c", "d"]) {
    assert.match(armOf(run.text, id), /^satisfied\|/, `arm ${id} in:\n${run.text}`);
  }
  assert.match(run.text, /STEP 1 preconditions: preconditions-satisfied-owner-action-pending/);

  // THE DANGEROUS STATE. Every computed arm holds. This is exactly the input
  // on which a trigger reports READY, and it must not.
  assert.match(run.text, /STEP 3 owner reboot of the pilot session: HALT, OWNER ACTION\./);
  assert.match(run.text, /never reports it done/);
  assert.match(run.text, /STEP 4[\s\S]*blocked by step 3/);
  for (const forbidden of [/\bREADY\b/, /\bGO\b/, /\bPROCEED\b/, /cutover may (begin|proceed)/i]) {
    assert.doesNotMatch(run.text, forbidden, `a ready-token reached the output:\n${run.text}`);
  }
});

test("the drain arm reddens when cutover status does not report DRAIN clean", () => {
  const root = makeRoot({ statusText: "SWITCH planning-and-scope kernel\nDRAIN 3 in flight\n" });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "a"), /^not-yet\|.*DRAIN 3 in flight/);
});

test("the exclusion arm reddens when a required behavior name does not resolve", () => {
  const required = checker.REQUIRED_EXCLUSION_BEHAVIORS;
  const root = makeRoot({ behaviors: required.slice(1) });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), new RegExp(`^not-yet\\|.*${required[0]}`));
});

test("the retirement arm reddens while any row is unported", () => {
  const root = makeRoot({
    retirementText: "PORT claude-md ported\nPORT skills unported\nPORT next-mjs unported\n",
    retirementExit: 1,
  });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "c"), /^not-yet\|2 of 3 retirement row\(s\) are unported/);
});

test("the ruleset arm reddens when the pre-freeze ruleset is stale", () => {
  const root = makeRoot({ rulesetStale: true });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is older than/);
});

test("every arm is evaluated: four simultaneous failures are all reported", () => {
  // A checker that returns on its first failing arm is green on the other
  // three, which is the shape M4-P27 criterion 2 names when it asks for four
  // independently forced-false witnesses rather than two.
  const root = makeRoot({
    statusText: "DRAIN 9 in flight\n",
    behaviors: [],
    retirementText: "PORT claude-md unported\n",
    ruleset: false,
  });
  const run = runChecker(root);
  assert.notEqual(run.status, 0, run.text);
  assert.match(armOf(run.text, "a"), /^not-yet\|.*DRAIN 9 in flight/);
  assert.match(armOf(run.text, "b"), /^not-yet\|/);
  assert.match(armOf(run.text, "c"), /^not-yet\|1 of 1 retirement row/);
  assert.match(armOf(run.text, "d"), /^not-yet\|.*is absent/);
});

test("an unreachable CLI is unreachable, never satisfied, and exits 3 rather than 1", () => {
  // THE DANGEROUS STATE: the drain question was never asked. A two-state
  // classifier reports "false" and loses the distinction that matters, and the
  // measured reason it matters is that a transport failure exits nonzero too
  // (delivery/verification/m4-prototype-probes.md:1).
  const root = makeRoot({ statusText: null });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*no CLI entry at/);
  assert.match(armOf(run.text, "c"), /^unreachable\|/);
  assert.match(run.text, /STEP 1 preconditions: preconditions-indeterminate/);
});

test("a retirement report naming zero rows is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: zero rows reads as zero bad rows. The command exits 0
  // and says nothing, and the arm must not turn that into a pass.
  const root = makeRoot({ retirementText: "RETIREMENT report\n", retirementExit: 0 });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "c"), /^unreachable\|.*zero rows is not zero unported rows/);
});

test("a freshness comparison with no inventory present is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: "newer than the most recent inventory change" is
  // vacuously true when there is no inventory, so the arm would be green for
  // every ruleset file that exists at all.
  const root = makeRoot({ inventory: false });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "d"), /^unreachable\|.*cannot go red/);
});

test("an exclusion suite that runs zero tests is not-yet, because exit 0 asserts nothing", () => {
  const root = makeRoot({ exclusionTestBody: VACUOUS_TEST_BODY });
  const run = runChecker(root);
  // THE DANGEROUS STATE, and it bit this very arm. Measured 2026-09-16 on node
  // v22.22.2: a file registering no tests reports `ok 1 - <file path>` and
  // `# pass 1`, so "pass count above zero" is itself a guard that cannot go
  // red. The arm must require a passing subtest whose NAME is not the file's.
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), /^not-yet\|.*registered no named test/);
});

test("a cutover status that prints no DRAIN line is unreachable, never satisfied", () => {
  // THE DANGEROUS STATE: the command RAN and exited 0, and said nothing about
  // drain. A checker reading "exit 0" as "drain is clean" is green on a command
  // that never answered the question.
  const root = makeRoot({ statusText: "SWITCH planning-and-scope kernel\n", statusExit: 0 });
  const run = runChecker(root);
  assert.equal(run.status, 3, run.text);
  assert.match(armOf(run.text, "a"), /^unreachable\|.*printed no DRAIN line/);
});

test("an exclusion suite with a failing test is not-yet", () => {
  const root = makeRoot({
    exclusionTestBody:
      'import test from "node:test";\n' +
      'test("ok", () => {});\n' +
      'test("broken", () => { throw new Error("forced"); });\n',
  });
  const run = runChecker(root);
  assert.equal(run.status, 1, run.text);
  assert.match(armOf(run.text, "b"), /^not-yet\|.*1 failing test/);
});

test("the checker's overall vocabulary is closed and no member means ready", () => {
  assert.deepEqual(checker.ARM_VERDICTS, ["satisfied", "not-yet", "unreachable", "refused"]);
  assert.equal(checker.OVERALL_VERDICTS.length, 3);
  for (const word of checker.OVERALL_VERDICTS) {
    assert.doesNotMatch(word, /\b(ready|go|green|proceed|clear)\b/i, word);
  }
  // Indeterminate dominates a real negative: "I could not tell" is not "no".
  const indeterminate = checker.overallFor([
    { id: "a", name: "drain", verdict: "not-yet", reason: "" },
    { id: "b", name: "exclusion", verdict: "unreachable", reason: "" },
  ]);
  assert.equal(indeterminate, "preconditions-indeterminate");
});

test("countRetirementRows never counts an unported row as ported", () => {
  const counts = checker.countRetirementRows("PORT a ported\nPORT b unported\nPORT c unported\n");
  assert.deepEqual(counts, { ported: 1, unported: 2, rows: 3 });
});

test("the checker exits 64 on an unknown argument", () => {
  const result = spawnSync(process.execPath, [checkerPath, "--nope"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 64);
  assert.match(`${result.stderr}`, /unknown argument: --nope/);
});

/* ------------------------------------------------------------------ */
/* The probe: the read-only boundary                                   */
/* ------------------------------------------------------------------ */

const gitEnv = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "tiphys@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "tiphys@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, args: string[]): { status: number | null; text: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, ...gitEnv },
  });
  return { status: result.status, text: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function digestOf(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A repository with a commit, and an uncommitted edit on top of it. */
function scratchRepoWithPendingWork(): { dir: string; file: string } {
  const dir = scratch("tiphys-probe-repo-");
  assert.equal(git(dir, ["init", "--quiet", "--initial-branch", "main"]).status, 0);
  const file = join(dir, "tracked.txt");
  writeFileSync(file, "committed content\n", "utf8");
  assert.equal(git(dir, ["add", "tracked.txt"]).status, 0);
  assert.equal(git(dir, ["commit", "--quiet", "-m", "base"]).status, 0);
  writeFileSync(file, "uncommitted edit that a wipe would destroy\n", "utf8");
  return { dir, file };
}

test("the git chokepoint refuses a mutating operation and the repository is unchanged", () => {
  // THE DANGEROUS STATE, and it is real rather than notional: the repository
  // has a stageable change that `commit -a` WOULD commit, and an uncommitted
  // edit that `checkout --` WOULD destroy. Both verbs are handed to the
  // chokepoint. Member A creates history; member B destroys working-tree
  // content. They are structurally different limbs of one class.
  const { dir, file } = scratchRepoWithPendingWork();
  const headBefore = git(dir, ["rev-parse", "HEAD"]).text.trim();
  const statusBefore = git(dir, ["status", "--porcelain"]).text;
  const digestBefore = digestOf(file);

  // Both calls are made and their outcomes COLLECTED rather than asserted
  // inline, so that the assertions below run in the order that matters. The
  // STATE assertions come first on purpose: with the allowlist removed, the
  // first thing that fails must be "the repository changed", not "no exception
  // was thrown". A witness whose first failure is the absent guard is red
  // against the absent feature; this one is red against the harm.
  const outcomes: { operation: string; threw: string | null }[] = [];
  for (const argv of [
    ["commit", "-a", "-m", "this must never land"],
    ["checkout", "--", "tracked.txt"],
  ]) {
    let threw: string | null = null;
    try {
      probe.readOnlyGit(argv, { cwd: dir });
    } catch (error) {
      threw = (error as Error).name;
    }
    outcomes.push({ operation: argv[0], threw });
  }

  assert.equal(
    git(dir, ["rev-parse", "HEAD"]).text.trim(),
    headBefore,
    "the probe created a commit in the scratch repository",
  );
  assert.equal(
    digestOf(file),
    digestBefore,
    "the probe altered the uncommitted edit in the scratch repository",
  );
  assert.equal(git(dir, ["status", "--porcelain"]).text, statusBefore);
  assert.deepEqual(outcomes, [
    { operation: "commit", threw: "ReadOnlyViolation" },
    { operation: "checkout", threw: "ReadOnlyViolation" },
  ]);
});

test("the git chokepoint refuses a clone that does not carry a depth of one", () => {
  assert.throws(
    () => probe.assertReadOnlyGit(["clone", "https://example.invalid/x.git", "/tmp/nope"]),
    (error: Error) => /--depth 1/.test(error.message),
  );
  assert.doesNotThrow(() =>
    probe.assertReadOnlyGit(["clone", "--depth", "1", "https://example.invalid/x.git", "/tmp/ok"]),
  );
  assert.doesNotThrow(() => probe.assertReadOnlyGit(["ls-remote", "https://example.invalid/x.git"]));
});

test("the git chokepoint refuses an empty and a non-string argument list", () => {
  assert.throws(() => probe.assertReadOnlyGit([]), /empty argument list/);
  assert.throws(() => probe.assertReadOnlyGit([{}]), /non-string argument/);
});

test("the http chokepoint refuses a request-shaping option and issues nothing", async () => {
  // THE DANGEROUS STATE: a caller steering the request into a write. The
  // assertion is not only that the call throws, but that the server RECEIVED
  // NOTHING, which is what distinguishes "refused before issuing" from
  // "issued and then complained".
  const received: string[] = [];
  const server = createServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    // Outcomes collected, then the SERVER's record asserted first, for the
    // same reason as the git witness above: the first failure under a defanged
    // chokepoint must be "the request reached the server".
    const outcomes: (string | null)[] = [];
    for (const shaping of [{ method: "PATCH" }, { body: "x" }, { redirect: "follow" }]) {
      try {
        const response = await probe.readOnlyHttp(`${base}/anything`, shaping);
        await response.text();
        outcomes.push(null);
      } catch (error) {
        outcomes.push((error as Error).name);
      }
    }
    assert.deepEqual(received, [], `requests reached the server: ${received.join(", ")}`);
    assert.deepEqual(outcomes, ["ReadOnlyViolation", "ReadOnlyViolation", "ReadOnlyViolation"]);

    // The control: the permitted shape DOES reach the server, so the zero
    // above is the refusal working and not a broken fixture.
    const response = await probe.readOnlyHttp(`${base}/allowed`, { timeoutMs: 5000 });
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(received, ["GET /allowed"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the probe source carries zero occurrences of every write verb", () => {
  const source = readFileSync(probePath, "utf8");
  const forbidden: [string, RegExp][] = [
    ["POST", /\bPOST\b/g],
    ["PATCH", /\bPATCH\b/g],
    ["PUT", /\bPUT\b/g],
    ["DELETE", /\bDELETE\b/g],
    ["post", /\bpost\b/gi],
    ["patch", /\bpatch\b/gi],
    ["put", /\bput\b/gi],
    ["delete", /\bdelete\b/gi],
    ["push", /\bpush\b/gi],
    ["gh pr", /\bgh\s+pr\b/gi],
    ["gh issue", /\bgh\s+issue\b/gi],
  ];
  for (const [label, pattern] of forbidden) {
    const hits = source.match(pattern) ?? [];
    assert.equal(hits.length, 0, `${label} occurs ${hits.length} time(s) in ${probePath}`);
  }
  // The control that keeps this test honest: the same patterns DO fire on a
  // string that contains the verbs, so a zero above is the source being clean
  // and not the regexes being broken.
  const control = "POST PATCH PUT DELETE items.push(1) gh pr create gh issue list";
  for (const [label, pattern] of forbidden) {
    assert.ok((control.match(pattern) ?? []).length > 0, `${label} pattern never fires`);
  }
});

test("the probe has exactly one child-process call site and one request call site", () => {
  // A grep over verbs and an allowlist over operations fail differently
  // (M4-P27 criterion 3), and both are defeated by a SECOND call site that
  // bypasses the chokepoint. This counts them.
  const source = readFileSync(probePath, "utf8");
  assert.equal((source.match(/spawnSync\(/g) ?? []).length, 1);
  assert.equal((source.match(/(?<![.\w])fetch\(/g) ?? []).length, 1);
  // The import line is the other half: a second way to start a child process
  // would have to be imported, and only one binding is.
  const imports = /import\s*\{([^}]*)\}\s*from\s*"node:child_process";/.exec(source);
  assert.ok(imports !== null, "no node:child_process import found");
  assert.deepEqual(
    imports[1].split(",").map((name) => name.trim()).filter((name) => name.length > 0),
    ["spawnSync"],
  );
  assert.equal((source.match(/node:child_process/g) ?? []).length, 1);
});

/* ------------------------------------------------------------------ */
/* The probe: the failure arm                                          */
/* ------------------------------------------------------------------ */

interface StubRoute {
  status: number;
  body: string;
}

async function withStubApi(
  routes: Record<string, StubRoute>,
  body: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    const route = routes[request.url ?? ""] ?? { status: 404, body: '{"message":"Not Found"}' };
    response.writeHead(route.status, { "content-type": "application/json" });
    response.end(route.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  try {
    await body(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A bare repository with one commit, reachable by `git ls-remote`. */
function bareRemote(owner: string, name: string): string {
  const base = scratch("tiphys-probe-remote-");
  const seed = join(base, "seed");
  mkdirSync(seed, { recursive: true });
  assert.equal(git(seed, ["init", "--quiet", "--initial-branch", "main"]).status, 0);
  writeFileSync(join(seed, "a.txt"), "seed\n", "utf8");
  assert.equal(git(seed, ["add", "a.txt"]).status, 0);
  assert.equal(git(seed, ["commit", "--quiet", "-m", "seed"]).status, 0);
  const bare = join(base, owner, name);
  mkdirSync(dirname(bare), { recursive: true });
  assert.equal(git(base, ["clone", "--bare", "--quiet", seed, bare]).status, 0);
  return base;
}

/**
 * ASYNCHRONOUS ON PURPOSE. `spawnSync` here would block the test process's own
 * event loop, so the stub server below could never accept a connection and
 * every arm would fail for a reason that has nothing to do with the subject.
 * That exact harness defect is on the record at
 * delivery/verification/m4-prototype-probes.md:286, and it was reproduced here
 * before being fixed: the first version of this helper used `spawnSync` and
 * every stub-server test failed with a fetch timeout.
 */
function runProbe(args: string[]): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [probePath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      text += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      text += chunk;
    });
    child.on("close", (status) => resolveRun({ status, text }));
  });
}

function probeOut(): string {
  return join(scratch("tiphys-probe-out-"), "pulse-re-probe.md");
}

const REPO_BODY = JSON.stringify({
  full_name: "owner/name",
  default_branch: "main",
  visibility: "public",
  updated_at: "2026-09-16T00:00:00Z",
});

test("a 200 carrying an empty body is unreachable, never a clean probe", async () => {
  // THE DANGEROUS STATE: the remote answers, so a status-only classifier calls
  // it a read. The body establishes nothing. This repository has been bitten
  // three times by an empty result indistinguishable from an absence.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: "{}" },
      "/repos/owner/name/commits?per_page=1": { status: 200, body: "[]" },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(run.text, /TARGET owner\/name unreachable/);
      const document = readFileSync(out, "utf8");
      assert.match(document, /no full_name/);
      assert.match(document, /an empty answer is not a clean one/);
      assert.match(document, /### What was NOT established/);
      assert.doesNotMatch(document, /OVERALL satisfied/);
    },
  );
});

test("an absent repository is a real negative and is not reported as clean", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi({}, async (base) => {
    const run = await runProbe([
      "--api-base", base, "--git-base", remote, "--repo", "owner/name",
      "--out", out, "--timeout-ms", "10000",
    ]);
    assert.equal(run.status, 1, run.text);
    assert.match(run.text, /TARGET owner\/name not-yet/);
    assert.match(readFileSync(out, "utf8"), /answered HTTP 404/);
  });
});

test("a refusal is classified apart from a real negative", async () => {
  // 403 and 404 are both nonzero and they mean opposite things. Collapsing
  // them is how "the pilot is not there" gets reported for "this session may
  // not read the pilot", which is a measured state of this container.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    { "/repos/owner/name": { status: 403, body: '{"message":"not enabled for this session"}' } },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(run.text, /TARGET owner\/name refused/);
      assert.equal(probe.verdictForStatus(403), "refused");
      assert.equal(probe.verdictForStatus(404), "not-yet");
      assert.equal(probe.verdictForStatus(500), "unreachable");
      assert.equal(probe.verdictForStatus(418), "unreachable");
    },
  );
});

test("an unreachable api exits 3 and the evidence document records the reason", async () => {
  // The beacon half of criterion 4: the document exists and carries the reason
  // even though nothing was read.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  const run = await runProbe([
    "--api-base", "http://127.0.0.1:1", "--git-base", remote, "--repo", "owner/name",
    "--out", out, "--timeout-ms", "5000",
  ]);
  assert.equal(run.status, 3, run.text);
  const document = readFileSync(out, "utf8");
  assert.match(document, /transport failure reading/);
  assert.match(document, /OVERALL unreachable/);
  assert.match(document, /is NOT a clean probe/);
});

test("all three sources read exits 0 and the document records both heads", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  const head = git(join(remote, "owner", "name"), ["rev-parse", "HEAD"]).text.trim();
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: REPO_BODY },
      "/repos/owner/name/commits?per_page=1": { status: 200, body: JSON.stringify([{ sha: head }]) },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 0, run.text);
      const document = readFileSync(out, "utf8");
      assert.match(document, new RegExp(`head \`${head.slice(0, 7)}\``));
      assert.match(document, new RegExp(`git ref \`${head.slice(0, 7)}\``));
      assert.match(document, /OVERALL satisfied/);
    },
  );
});

test("a refused transport does not discard a working one from the breakdown", async () => {
  // Measured against the real pilot on 2026-09-16: the REST path answered
  // HTTP 403 while `git ls-remote` answered the head sha with exit 0. A probe
  // that returns on its first non-satisfied source throws away the source that
  // worked, which is the same defect as a checker short-circuiting on its
  // first failing arm.
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    { "/repos/owner/name": { status: 403, body: '{"message":"refused"}' } },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      const document = readFileSync(out, "utf8");
      assert.match(document, /gitRef=satisfied/);
      assert.match(document, /record=refused/);
    },
  );
});

test("a head disagreement between the two transports establishes neither", async () => {
  const out = probeOut();
  const remote = bareRemote("owner", "name");
  await withStubApi(
    {
      "/repos/owner/name": { status: 200, body: REPO_BODY },
      "/repos/owner/name/commits?per_page=1": {
        status: 200,
        body: JSON.stringify([{ sha: "0000000000000000000000000000000000000000" }]),
      },
    },
    async (base) => {
      const run = await runProbe([
        "--api-base", base, "--git-base", remote, "--repo", "owner/name",
        "--out", out, "--timeout-ms", "10000",
      ]);
      assert.equal(run.status, 3, run.text);
      assert.match(readFileSync(out, "utf8"), /the two transports disagree/);
    },
  );
});

test("zero targets probed is a failure, not a clean sweep", () => {
  assert.equal(probe.overallVerdict([]), "unreachable");
  assert.deepEqual(probe.TARGET_VERDICTS, ["satisfied", "not-yet", "unreachable", "refused"]);
  assert.equal(probe.overallVerdict([{ verdict: "satisfied" }, { verdict: "refused" }]), "refused");
  assert.equal(
    probe.overallVerdict([{ verdict: "not-yet" }, { verdict: "unreachable" }]),
    "unreachable",
  );
});

test("the probe exits 64 on an unknown argument", async () => {
  const run = await runProbe(["--nope"]);
  assert.equal(run.status, 64);
  assert.match(run.text, /unknown argument: --nope/);
});

/* ------------------------------------------------------------------ */
/* The entry-trigger document                                          */
/* ------------------------------------------------------------------ */

test("the entry-trigger document states the four steps, the reserve and the residual", () => {
  const document = readFileSync(
    join(repoRoot, "delivery", "plan", "cutover", "entry-trigger.md"),
    "utf8",
  );
  for (const step of ["## Step 1", "## Step 2", "## Step 3", "## Step 4"]) {
    assert.ok(document.includes(step), `missing ${step}`);
  }
  assert.ok(document.includes("node scripts/check-cutover-entry.mjs"));
  assert.ok(document.includes("node scripts/probe-pilot-readonly.mjs"));
  // Criterion 5: the amendment option is in reserve with a raised bar, cited.
  assert.match(document, /amendment option[\s\S]{0,400}reserve/i);
  assert.ok(document.includes("DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:69"));
  // Criterion 6: the residual is named rather than implied.
  assert.match(document, /## What this trigger does NOT settle/);
  assert.ok(document.includes("DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:93"));
});

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  // BY NAME, never by count: `test/behaviors.json` is append-only and resolved
  // as a union against the merge base, so a count is a claim about every
  // future phase and is false the moment the next one appends.
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  const ids = [
    "cutover-entry-all-arms-satisfied-halts-at-owner-action",
    "cutover-entry-drain-arm-reddens",
    "cutover-entry-exclusion-arm-reddens",
    "cutover-entry-retirement-arm-reddens",
    "cutover-entry-ruleset-arm-reddens",
    "cutover-entry-evaluates-every-arm",
    "cutover-entry-unreachable-is-not-satisfied",
    "cutover-entry-zero-retirement-rows-is-unreachable",
    "cutover-entry-vacuous-freshness-is-unreachable",
    "cutover-entry-vacuous-exclusion-suite-is-not-yet",
    "cutover-entry-absent-drain-line-is-unreachable",
    "cutover-entry-failing-exclusion-suite-is-not-yet",
    "cutover-entry-overall-vocabulary-has-no-ready",
    "cutover-entry-unported-never-counted-as-ported",
    "cutover-entry-usage-error",
    "pilot-probe-git-chokepoint-refuses-mutation",
    "pilot-probe-git-chokepoint-requires-shallow-clone",
    "pilot-probe-git-chokepoint-refuses-malformed-argv",
    "pilot-probe-http-chokepoint-refuses-request-shaping",
    "pilot-probe-source-has-no-write-verbs",
    "pilot-probe-single-child-and-request-call-sites",
    "pilot-probe-empty-body-is-not-clean",
    "pilot-probe-absent-repository-is-a-real-negative",
    "pilot-probe-refused-is-distinct-from-not-yet",
    "pilot-probe-unreachable-records-the-reason",
    "pilot-probe-reads-all-three-sources",
    "pilot-probe-keeps-the-working-transport-in-the-breakdown",
    "pilot-probe-head-disagreement-establishes-neither",
    "pilot-probe-zero-targets-is-a-failure",
    "pilot-probe-usage-error",
    "cutover-entry-document-states-the-four-steps",
  ];
  for (const id of ids) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(behaviors, id),
      `behaviors.json does not register ${id}`,
    );
  }
});
