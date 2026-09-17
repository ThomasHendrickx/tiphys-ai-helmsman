import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P18: `tiphys sync` commits the durable half of a fleet home and pushes
 * it.
 *
 * WHAT THESE TESTS ARE FOR, and it is not "sync exists". The uninteresting
 * failure is a missing command. The DANGEROUS failures are the ones a naive
 * implementation is green on:
 *
 *   - a lease or a scratch file that is TRACKED under an ignored prefix gets
 *     committed and pushed, and a fleet's lease then travels through the
 *     remote to an environment that must REBUILD it rather than restore it
 *     (AGENTS.md clause fleet-resume-specification);
 *   - the operator staged it first, so `git commit` commits it however
 *     carefully the command chose its pathspec;
 *   - the push fails and the command reports a clean sync anyway, which is
 *     the half of the discipline AGENTS.md says gets dropped.
 *
 * Every fixture below builds one of those states and asserts it was built,
 * because a witness against a state that did not occur is green, registered
 * and worthless (CLAUDE.md's red-witness rule, T-003).
 *
 * THE TRACKED EPHEMERAL FILE IS THE SPINE OF THIS FILE AND IT IS NOT
 * CONTRIVED. `.gitignore` governs UNTRACKED paths only, so any path that was
 * committed before its prefix was ignored, or force-added once, stays tracked
 * for ever and is picked up by every `git add -A` after it. That is exactly
 * what criterion 2's fourth ignored prefix produces: the prefix arrives
 * AFTER the file.
 */

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");

/* The exclusion set is read from the kernel rather than restated, the same
   discipline test/resume.test.ts uses: a second list here would be the very
   defect criterion 2 is about, one layer up (CLAUDE.md warning 4 makes the
   computed-URL dynamic import the only form that survives the project
   reference). */
const { FLEET_IGNORED } = (await import(
  new URL("../src/fleet.ts", import.meta.url).href
)) as { FLEET_IGNORED: readonly string[] };

const syncModule = (await import(new URL("../src/commands/sync.ts", import.meta.url).href)) as {
  DEFAULT_REMOTE: string;
  syncCommitMessage: (count: number) => string;
  parsePorcelainStatus: (
    payload: string,
  ) => { path: string; index: string; worktree: string }[];
  parseCheckIgnore: (
    payload: string,
  ) => Map<string, { source: string; line: string; pattern: string }>;
};

/**
 * THE DENY LIST (criterion 6), with TWO members so the assertion is over a
 * CLASS of AI model and tool names and not over one string. They are
 * structurally different on purpose: one names a model family and one names
 * a harness, and a commit message can acquire either by the same route, which
 * is a path it was composed from.
 */
const AI_NAME_DENY_LIST: readonly string[] = ["claude", "copilot"];

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * A git identity supplied per command, never read from user or global config
 * (CLAUDE.md standing warning 5: CI runners have no git identity).
 */
const GIT_IDENTITY: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Tiphys Test",
  GIT_AUTHOR_EMAIL: "test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Tiphys Test",
  GIT_COMMITTER_EMAIL: "test@tiphys.invalid",
};

function runCli(args: string[], cwd: string): Run {
  const run = spawnSync(process.execPath, [cliEntry, ...args], {
    encoding: "utf8",
    cwd,
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function gitIn(root: string, args: string[]): Run {
  const run = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: GIT_IDENTITY,
  });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-m4p18-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

interface Fixture {
  /** The fleet home, created by the delivered `tiphys init`. */
  root: string;
  /** An absolute path to the bare repository it pushes to. */
  remote: string;
}

/**
 * A real fleet home with a real remote. The remote is a bare repository at an
 * ABSOLUTE path (CLAUDE.md standing warning 9: git resolves a relative path
 * against the repository, not the shell), so the push arm of every test below
 * is a real push and not a skipped step.
 */
function fleetWithRemote(t: { after(fn: () => void): void }): Fixture {
  const dir = makeTempDir(t);
  const root = join(dir, "fleet");
  const remote = join(dir, "origin.git");
  const created = spawnSync(process.execPath, [cliEntry, "init", root], {
    encoding: "utf8",
  });
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const bare = spawnSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", remote], {
    encoding: "utf8",
    env: GIT_IDENTITY,
  });
  assert.equal(bare.status, 0, bare.stderr);
  assert.equal(gitIn(root, ["remote", "add", "origin", remote]).status, 0);
  const pushed = gitIn(root, ["push", "--quiet", "origin", "HEAD"]);
  assert.equal(pushed.status, 0, pushed.stderr);
  return { root, remote };
}

/**
 * Make `relative` a TRACKED file under an already-ignored prefix, the state
 * a `git add -f` or a pre-ignore commit leaves behind, and ASSERT it: the
 * whole point of the fixture is that `.gitignore` no longer protects this
 * path, and a fixture that quietly failed to track it would leave every test
 * below green for the wrong reason.
 */
function trackUnderIgnoredPrefix(root: string, relative: string, body: string): void {
  mkdirSync(join(root, dirname(relative)), { recursive: true });
  writeFileSync(join(root, relative), body);
  const forced = gitIn(root, ["add", "-f", "--", relative]);
  assert.equal(forced.status, 0, forced.stderr);
  const committed = gitIn(root, ["commit", "--quiet", "-m", "a path that got tracked once"]);
  assert.equal(committed.status, 0, committed.stderr);
  const listed = gitIn(root, ["ls-files", "--", relative]);
  assert.equal(
    listed.stdout.trim(),
    relative,
    `fixture violated: ${relative} is not tracked, so .gitignore still protects it`,
  );
  /* And git agrees it is ignored BY THE RULES, which is the property that
     makes it dangerous rather than ordinary. */
  const byRules = gitIn(root, ["check-ignore", "--no-index", "-q", "--", relative]);
  assert.equal(byRules.status, 0, `fixture violated: ${relative} matches no ignore rule`);
}

/** The paths one commit names, which is what "did it commit the lease" asks. */
function pathsInHead(root: string): string[] {
  const shown = gitIn(root, ["show", "--name-only", "--format=", "HEAD"]);
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout.split("\n").filter((line) => line !== "");
}

function headSha(root: string): string {
  const shown = gitIn(root, ["rev-parse", "HEAD"]);
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout.trim();
}

function porcelain(root: string): string[] {
  const shown = gitIn(root, ["status", "--porcelain"]);
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout.split("\n").filter((line) => line !== "");
}

/* ------------------------------------------------------------------ */
/* Criterion 1: the durable change lands, the ephemeral one does not    */
/* ------------------------------------------------------------------ */

test("sync commits the modified durable file, leaves the modified ephemeral file, and afterwards only the ephemeral path is dirty", (t) => {
  const { root } = fleetWithRemote(t);
  trackUnderIgnoredPrefix(root, join("state", "orchestrator.lock"), "held\n");

  writeFileSync(join(root, "decisions", "DR-0001-a-decision.md"), "decided\n");
  appendFileSync(join(root, "state", "orchestrator.lock"), "renewed\n");

  const before = headSha(root);
  const run = runCli(["sync"], root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.notEqual(headSha(root), before, "sync committed nothing");

  const committed = pathsInHead(root);
  assert.deepEqual(committed, ["decisions/DR-0001-a-decision.md"]);
  assert.match(run.stdout, /^COMMITTED decisions\/DR-0001-a-decision\.md$/m);
  assert.match(run.stdout, /^PUSHED origin$/m);

  /* THE CRITERION'S OWN SENTENCE: exactly the ephemeral path and nothing
     else. A deepEqual rather than a match, because "the durable file is
     clean" and "nothing else was left behind" are both part of it. */
  assert.deepEqual(porcelain(root), [" M state/orchestrator.lock"]);
});

/* ------------------------------------------------------------------ */
/* Criterion 2: the exclusion set is DERIVED from the fleet .gitignore  */
/* ------------------------------------------------------------------ */

test("a fourth prefix added to the fleet gitignore excludes its tracked file with no source change, and sync holds no prefix list of its own", (t) => {
  const { root } = fleetWithRemote(t);

  /* The file is tracked FIRST and the prefix arrives AFTER, which is the
     ordinary way a tracked ephemeral path comes about. */
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, "scratch", "notes.txt"), "working\n");
  assert.equal(gitIn(root, ["add", "-A"]).status, 0);
  assert.equal(gitIn(root, ["commit", "--quiet", "-m", "notes"]).status, 0);

  const ignoreFile = join(root, ".gitignore");
  const beforeRules = readFileSync(ignoreFile, "utf8");
  assert.equal(
    beforeRules.includes("scratch/"),
    false,
    "fixture violated: the fourth prefix was already there",
  );
  appendFileSync(ignoreFile, "scratch/\n");
  appendFileSync(join(root, "scratch", "notes.txt"), "more\n");
  writeFileSync(join(root, "decisions", "DR-0002-a-decision.md"), "decided\n");

  const run = runCli(["sync"], root);
  assert.equal(run.status, 0, run.stdout + run.stderr);

  /* The fourth prefix is honoured by the same derivation as the first three,
     and the line PRINTS the rule that excluded it, which is what makes the
     derivation observable rather than asserted. */
  assert.match(run.stdout, /^EXCLUDED scratch\/notes\.txt \.gitignore:4 scratch\/$/m);
  const committed = pathsInHead(root);
  assert.deepEqual(committed, [".gitignore", "decisions/DR-0002-a-decision.md"]);
  assert.equal(
    committed.includes("scratch/notes.txt"),
    false,
    "the fourth ignored prefix was not honoured",
  );

  /* AND THE SOURCE HOLDS NO SECOND LIST. This is the half that makes the
     behaviour above a derivation rather than a coincidence: a command
     carrying its own copy of the prefixes would pass every assertion above
     for the three it knew about and silently drift on the fourth. */
  const source = readFileSync(join(repoRoot, "src", "commands", "sync.ts"), "utf8");
  for (const prefix of FLEET_IGNORED) {
    assert.equal(
      source.includes(prefix),
      false,
      `src/commands/sync.ts names the ignored prefix ${prefix}, so the exclusion set is listed and not derived`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Criteria 3 and 4: the class, and member B is the point               */
/* ------------------------------------------------------------------ */

test("member A: an unstaged tracked lease is not committed, and the commit names no path under the ephemeral prefix", (t) => {
  const { root } = fleetWithRemote(t);
  trackUnderIgnoredPrefix(root, join("state", "orchestrator.lock"), "held\n");

  /* The status document is emitted so the commit has something to carry from
     the RELOCATED durable path, which is the one exception criterion 3's
     sentence makes: zero paths under state/ other than the status document,
     and the document is no longer under state/ at all. */
  const emitted = runCli(
    ["status", "emit", "--run", "r1", "--state", "phase-change"],
    root,
  );
  assert.equal(emitted.status, 0, emitted.stdout + emitted.stderr);
  appendFileSync(join(root, "state", "orchestrator.lock"), "renewed\n");

  /* PRECONDITION: the lease is modified and UNSTAGED, which is what makes
     this member A rather than member B. */
  assert.deepEqual(
    porcelain(root).filter((line) => line.endsWith("state/orchestrator.lock")),
    [" M state/orchestrator.lock"],
  );

  const run = runCli(["sync"], root);
  assert.equal(run.status, 0, run.stdout + run.stderr);

  const committed = pathsInHead(root);
  assert.deepEqual(
    committed.filter((path) => path.startsWith("state/")),
    [],
    "sync committed a path under the ephemeral prefix",
  );
  assert.equal(
    committed.includes("status/current.json"),
    true,
    "the relocated status document was not committed",
  );
  /* The lease is still there and still dirty: not committed is not the same
     as cleaned up, and this command never removes anything. */
  assert.deepEqual(
    porcelain(root).filter((line) => line.endsWith("state/orchestrator.lock")),
    [" M state/orchestrator.lock"],
  );
});

test("member B: with the lease already staged by git add -A, sync refuses in one line naming it and commits nothing", (t) => {
  const { root } = fleetWithRemote(t);
  trackUnderIgnoredPrefix(root, join("state", "orchestrator.lock"), "held\n");

  writeFileSync(join(root, "decisions", "DR-0003-a-decision.md"), "decided\n");
  appendFileSync(join(root, "state", "orchestrator.lock"), "renewed\n");

  /* THE OPERATOR RAN git add -A FIRST. This is the member a path-list
     implementation cannot see: it chooses a careful pathspec and then calls
     `git commit`, which commits the INDEX. */
  assert.equal(gitIn(root, ["add", "-A"]).status, 0);
  const staged = porcelain(root);
  assert.equal(
    staged.includes("M  state/orchestrator.lock"),
    true,
    `fixture violated: the lease is not staged, got ${JSON.stringify(staged)}`,
  );

  const before = headSha(root);
  const run = runCli(["sync"], root);
  assert.notEqual(run.status, 0, run.stdout);
  assert.equal(headSha(root), before, "sync committed while refusing");

  const lines = run.stderr.split("\n").filter((line) => line !== "");
  assert.equal(lines.length, 1, `expected one reason line, got ${JSON.stringify(lines)}`);
  assert.match(lines[0] as string, /state\/orchestrator\.lock/);
  assert.match(lines[0] as string, /\.gitignore:1 state\//);
  assert.match(lines[0] as string, /nothing was committed/);

  /* AND IT DID NOT UNSTAGE ANYTHING ON THE OPERATOR'S BEHALF: the index is
     exactly as they left it, because rewriting someone else's index is a
     destructive act this command has no mandate for. */
  assert.deepEqual(porcelain(root), staged);
});

/* ------------------------------------------------------------------ */
/* Criterion 5: the push failure arm, against git's own stderr          */
/* ------------------------------------------------------------------ */

const CONTRACT_CAPTURE = join(repoRoot, "witness", "captures", "m4-p18-git-contracts.txt");

test("a push to a remote URL that does not exist exits nonzero and carries git's own first stderr line", (t) => {
  const { root } = fleetWithRemote(t);
  const absent = join(root, "..", "no-such-remote.git");
  assert.equal(gitIn(root, ["remote", "set-url", "origin", absent]).status, 0);

  /* THE SIGNATURE IS TAKEN FROM A REAL FAILING RUN, here, now, of the same
     push this command makes. A hand-written expectation is the failure T-003
     and CLAUDE.md standing warning 10 both record: the retry signature that
     was derived from an example and did not match reality. */
  const control = gitIn(root, ["push", "origin", "HEAD"]);
  assert.notEqual(control.status, 0, "the control push succeeded, so the arm was never reached");
  const firstLine = (control.stderr.split("\n")[0] ?? "").trim();
  assert.notEqual(firstLine, "", "the control push produced no stderr to compare against");

  /* The recorded contract is anchored to that live run rather than trusted:
     the capture states the stable substring and the live run must carry it,
     so a git whose wording changed shows up here rather than silently
     weakening the assertion below. */
  const capture = readFileSync(CONTRACT_CAPTURE, "utf8");
  const stable = "does not appear to be a git repository";
  assert.equal(capture.includes(stable), true, "the capture no longer records the push contract");
  assert.equal(
    firstLine.includes(stable),
    true,
    `git's wording changed: ${firstLine}`,
  );

  writeFileSync(join(root, "decisions", "DR-0004-a-decision.md"), "decided\n");
  const before = headSha(root);
  const run = runCli(["sync"], root);
  assert.notEqual(run.status, 0, run.stdout);
  assert.equal(
    run.stderr.includes(firstLine),
    true,
    `sync's stderr does not carry git's first line.\ngit: ${firstLine}\nsync: ${run.stderr}`,
  );

  /* AND THE COMMIT IS REPORTED AS LOCAL, which is the honest half: the work
     is committed and the push is what failed, so the operator is told which
     of the two halves they still owe. */
  assert.notEqual(headSha(root), before, "sync did not commit before attempting the push");
  assert.match(run.stderr, /NOT pushed/);
});

test("sync in a fleet home with no remote refuses before committing anything", (t) => {
  const dir = makeTempDir(t);
  const root = join(dir, "fleet");
  const created = spawnSync(process.execPath, [cliEntry, "init", root], { encoding: "utf8" });
  assert.equal(created.status, 0, created.stderr);
  writeFileSync(join(root, "decisions", "DR-0005-a-decision.md"), "decided\n");

  const before = headSha(root);
  const run = runCli(["sync"], root);
  assert.notEqual(run.status, 0, run.stdout);
  assert.match(run.stderr, /has no remote named origin/);
  assert.equal(headSha(root), before, "sync committed although there was nowhere to push");
  /* The discipline is commit AND push. A command that committed here would
     have done the half that gets dropped and reported the half that does
     not (AGENTS.md clause fleet-state-commit-discipline). */
  assert.deepEqual(porcelain(root), ["?? decisions/DR-0005-a-decision.md"]);
});

/* ------------------------------------------------------------------ */
/* Criterion 6: the commit message carries no AI model or tool name     */
/* ------------------------------------------------------------------ */

test("the commit message carries no AI model or tool name even when the committed paths do", (t) => {
  const { root } = fleetWithRemote(t);

  /* THE DANGEROUS STATE IS THE PATHS, not the template. A message composed
     from the paths it commits inherits whatever they are named, and a fleet's
     decision records are named after what they decide. Each deny-list member
     gets its own file, so the assertion is over the class. */
  for (const [index, member] of AI_NAME_DENY_LIST.entries()) {
    writeFileSync(
      join(root, "decisions", `DR-000${String(index + 6)}-${member}-adapter.md`),
      "decided\n",
    );
  }

  const run = runCli(["sync"], root);
  assert.equal(run.status, 0, run.stdout + run.stderr);

  const committed = pathsInHead(root);
  for (const member of AI_NAME_DENY_LIST) {
    assert.equal(
      committed.some((path) => path.includes(member)),
      true,
      `fixture violated: no committed path carries ${member}`,
    );
  }

  const message = gitIn(root, ["log", "-1", "--format=%B"]).stdout;
  const hits = AI_NAME_DENY_LIST.filter((member) =>
    message.toLowerCase().includes(member),
  );
  assert.deepEqual(hits, [], `the commit message carries ${hits.join(", ")}: ${message}`);

  /* THE NON-VACUITY CONTROL. An empty result and a broken matcher are the
     same observation, so the same predicate is run against a message that
     DOES carry each member and must find it. */
  for (const member of AI_NAME_DENY_LIST) {
    const planted = `tiphys sync: decisions/DR-0001-${member.toUpperCase()}-adapter.md`;
    assert.equal(
      AI_NAME_DENY_LIST.filter((other) => planted.toLowerCase().includes(other)).length,
      1,
      `the deny-list predicate does not detect ${member}`,
    );
  }

  /* The author is the documented machine identity, command-scoped, exactly
     as the bootstrap commit sets it (CLAUDE.md standing warning 5). */
  assert.equal(
    gitIn(root, ["log", "-1", "--format=%an|%ae"]).stdout.trim(),
    "Tiphys Fleet|fleet@tiphys.invalid",
  );
});

/* ------------------------------------------------------------------ */
/* The command is reachable, and the parsers read git's real output     */
/* ------------------------------------------------------------------ */

test("sync is registered in the command table and its own handler is what runs", (t) => {
  const usage = runCli([], repoRoot);
  assert.equal(usage.status, 64);
  assert.match(usage.stderr, /\bsync\b/);

  /* REACHING THE HANDLER, not just the name. The usage line is built from
     the table's keys, so a row removed from the table and a handler wired to
     the wrong function are indistinguishable there; running the command in a
     directory that is not a fleet home is not. */
  const outside = runCli(["sync"], makeTempDir(t));
  assert.equal(outside.status, 1, outside.stdout + outside.stderr);
  assert.match(outside.stderr, /not a fleet home/);
});

test("sync usage errors exit 64 and name the option", (t) => {
  const { root } = fleetWithRemote(t);
  const unknown = runCli(["sync", "--all"], root);
  assert.equal(unknown.status, 64, unknown.stderr);
  assert.match(unknown.stderr, /unknown option --all/);
  const missing = runCli(["sync", "--remote"], root);
  assert.equal(missing.status, 64, missing.stderr);
  assert.match(missing.stderr, /--remote requires a value/);
  assert.equal(headSha(root), headSha(root));
});

test("the two porcelain parsers read git's real captured output rather than a hand-written shape", (t) => {
  const { root } = fleetWithRemote(t);
  trackUnderIgnoredPrefix(root, join("state", "orchestrator.lock"), "held\n");
  appendFileSync(join(root, "state", "orchestrator.lock"), "renewed\n");
  writeFileSync(join(root, "decisions", "DR-0009-a-decision.md"), "decided\n");

  /* The payloads are produced by git in this fixture, with the NUL
     separators intact, because a parser tested against a string typed here
     is a parser tested against its author's belief about git. */
  const status = spawnSync(
    "git",
    ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { encoding: "utf8", env: GIT_IDENTITY },
  );
  assert.equal(status.status, 0, status.stderr);
  const changed = syncModule.parsePorcelainStatus(status.stdout);
  const byPath = new Map(changed.map((entry) => [entry.path, entry]));
  assert.equal(byPath.get("state/orchestrator.lock")?.index, " ");
  assert.equal(byPath.get("state/orchestrator.lock")?.worktree, "M");
  assert.equal(byPath.get("decisions/DR-0009-a-decision.md")?.index, "?");

  const ignore = spawnSync(
    "git",
    ["-C", root, "check-ignore", "--no-index", "-v", "-z", "--stdin"],
    {
      encoding: "utf8",
      env: GIT_IDENTITY,
      input: "state/orchestrator.lock\0decisions/DR-0009-a-decision.md\0",
    },
  );
  assert.equal(ignore.status, 0, ignore.stderr);
  const rules = syncModule.parseCheckIgnore(ignore.stdout);
  assert.deepEqual(rules.get("state/orchestrator.lock"), {
    source: ".gitignore",
    line: "1",
    pattern: "state/",
  });
  assert.equal(
    rules.has("decisions/DR-0009-a-decision.md"),
    false,
    "a path matching no rule was reported as ephemeral",
  );

  /* AND THE CAPTURE RECORDS THE SAME CONTRACT, so the committed evidence is
     anchored to a live run rather than standing on its own. */
  const capture = readFileSync(CONTRACT_CAPTURE, "utf8");
  assert.match(capture, /git check-ignore --no-index -v -z --stdin/);
  assert.match(capture, /exit 128/);
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (CLAUDE.md binding convention 5). The registry is
     append-only, so a count here would be a claim about every future phase. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "sync-commits-durable-leaves-ephemeral",
    "sync-exclusion-derived-from-gitignore",
    "sync-unstaged-lease-not-committed",
    "sync-staged-lease-refused",
    "sync-push-failure-carries-git-stderr",
    "sync-no-remote-refuses-before-committing",
    "sync-commit-message-carries-no-ai-name",
    "sync-command-registered",
    "sync-usage-errors",
    "sync-parsers-read-real-git-output",
    "status-durable-document-tracked",
    "init-tracks-durable-status-directory",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});
