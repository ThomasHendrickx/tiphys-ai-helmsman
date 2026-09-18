import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/* Standing warning 4: a literal relative import of a src module from test/
   fails the build with TS2878 across the project reference. */
const cutover = (await import(new URL("../src/cutover.ts", import.meta.url).href)) as typeof import("../src/cutover.ts");
const commandModule = (await import(
  new URL("../src/commands/cutover.ts", import.meta.url).href
)) as typeof import("../src/commands/cutover.ts");
const fleetModule = (await import(new URL("../src/fleet.ts", import.meta.url).href)) as typeof import("../src/fleet.ts");
/* M4-P25. The shipped validation engine, reached the same way: a literal
   relative import of a src module from test/ fails the build with TS2878. */
const validateModule = (await import(
  new URL("../src/validate.ts", import.meta.url).href
)) as typeof import("../src/validate.ts");

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const rehearsal = fileURLToPath(
  new URL("../scripts/rehearse-cutover-rollback.mjs", import.meta.url),
);
const rollbackDocumentPath = fileURLToPath(
  new URL("../delivery/plan/cutover/rollback.md", import.meta.url),
);

const FLEET_DIRS = ["charter", "decisions", "state", "tasks", "worktrees", "projects"];

/* Standing warning 5: CI runners carry no git identity, so every scratch
   repository sets the author and committer per command and never touches user
   or global configuration. */
function git(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@localhost",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@localhost",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function frozenState(): unknown {
  const switches: Record<string, unknown> = {};
  for (const name of cutover.CUTOVER_SWITCHES) {
    switches[name] = {
      state: "kernel",
      flippedAt: "2026-09-15T09:00:00.000Z",
      flippedBy: "fixture",
      reason: "cutover entered",
      restoreTo: "current",
    };
  }
  return { switches };
}

interface Scratch {
  root: string;
  fleetRoot: string;
  fleet: ReturnType<typeof fleetModule.loadFleet>;
}

function scratchFleet(options: { state?: unknown; withRemote?: boolean } = {}): Scratch {
  const root = mkdtempSync(join(tmpdir(), "tiphys-cutover-test-"));
  const fleetRoot = join(root, "fleet");
  for (const dir of FLEET_DIRS) {
    mkdirSync(join(fleetRoot, dir), { recursive: true });
  }
  writeFileSync(join(fleetRoot, "backlog.md"), "# backlog\n");
  writeFileSync(join(fleetRoot, "package.json"), '{ "name": "scratch-fleet" }\n');
  writeFileSync(join(fleetRoot, ".gitignore"), "state/\nworktrees/\nprojects/\n");
  const state = options.state ?? frozenState();
  writeFileSync(join(fleetRoot, "cutover.json"), `${JSON.stringify(state, null, 2)}\n`);
  git(fleetRoot, ["init", "-q", "-b", "main"]);
  git(fleetRoot, ["add", "-A"]);
  git(fleetRoot, ["commit", "-q", "-m", "scratch fleet"]);
  if (options.withRemote === true) {
    const bare = join(root, "fleet.git");
    git(root, ["init", "-q", "--bare", bare]);
    git(fleetRoot, ["remote", "add", "origin", bare]);
    git(fleetRoot, ["push", "-q", "origin", "HEAD:refs/heads/main"]);
  }
  return { root, fleetRoot, fleet: fleetModule.loadFleet(fleetRoot) };
}

function runRehearsal(args: string[]) {
  return spawnSync(process.execPath, [rehearsal, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

/**
 * Every arm of the rehearsal must PROVE its own assertion helper discriminates
 * before its OBSERVED lines are worth anything, and that is asserted here
 * rather than trusted. Measured 2026-09-16: with `observe` substituted to
 * return true unconditionally, all four rehearsal tests stayed green. This
 * assertion is what makes that substitution red.
 */
function assertSelfChecked(result: { stdout: string; stderr: string }): void {
  assert.match(
    result.stdout,
    /^SELF-CHECK OK: observe\(\) discriminates/m,
    result.stdout + result.stderr,
  );
}

/** A MISMATCH line, anchored, so a label merely containing the word is not one. */
function hasMismatch(stdout: string): boolean {
  return /^MISMATCH /m.test(stdout);
}

/**
 * THE GIT CONTRACT THIS MODULE PARSES, ANCHORED TO REAL CAPTURED OUTPUT.
 *
 * `src/cutover.ts` spawns git and reads what it prints: `git remote` to decide
 * whether a fleet has an origin, `git status --porcelain` to decide whether a
 * tree is dirty, and `git push` to decide whether the rolled-back state
 * landed. Red-witness rule (f) binds every witness over that file for exactly
 * that reason, and the assertions below are against
 * `witness/captures/cutover-git-contracts.txt`, which holds a real run rather
 * than a hand-written string.
 *
 * The test does not merely READ the capture. It reproduces each contract in a
 * live scratch repository and requires the live result to match what was
 * captured, so a git whose output has moved reddens here rather than silently
 * changing what the rollback believes.
 */
const gitCapturePath = fileURLToPath(
  new URL("../witness/captures/cutover-git-contracts.txt", import.meta.url),
);

test("the captured git contract this module parses is reproduced live", () => {
  const captured = readFileSync(gitCapturePath, "utf8");
  assert.match(captured, /git version /, "the capture must name the git it was taken with");

  const root = mkdtempSync(join(tmpdir(), "tiphys-git-contract-"));
  try {
    mkdirSync(join(root, "retired"), { recursive: true });
    writeFileSync(join(root, "retired", "rule.md"), "the original rule\n");
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "one"]);

    /* `git remote` with nothing configured: exit 0 and EMPTY stdout. That pair
       is what makes "no origin" decidable, and the capture records both. */
    assert.match(captured, /## git remote, in a repository with no remote configured\nexit=0\nstdout-bytes=0/);
    const remote = git(root, ["remote"]);
    assert.equal(remote.status, 0);
    assert.equal(remote.stdout, "");

    /* A clean tree: exit 0 and empty stdout, so emptiness is the signal. */
    assert.match(captured, /## git status --porcelain, clean tree\nexit=0\nstdout-bytes=0/);
    const clean = git(root, ["status", "--porcelain"]);
    assert.equal(clean.status, 0);
    assert.equal(clean.stdout, "");

    /* A modified tracked file: the line is " M <path>", leading space and all. */
    assert.match(captured, /\n M retired\/rule\.md\n/);
    writeFileSync(join(root, "retired", "rule.md"), "UNCOMMITTED WORK\n");
    const modified = git(root, ["status", "--porcelain"]);
    assert.equal(modified.status, 0);
    assert.equal(modified.stdout, " M retired/rule.md\n");

    /* An untracked file also shows, which is why the guard counts LINES and
       not modifications. */
    assert.match(captured, /\n\?\? untracked\.txt\n/);
    writeFileSync(join(root, "untracked.txt"), "x\n");
    assert.equal(
      git(root, ["status", "--porcelain"]).stdout,
      " M retired/rule.md\n?? untracked.txt\n",
    );

    /* A push to a path that is not a repository FAILS, and the capture records
       that the exit code is 128 rather than 1. `syncFleetState` tests for
       non-zero rather than for 1, and this is why. */
    assert.match(captured, /does not appear to be a git repository/);
    assert.match(captured, /## git push to a path that is not a repository\n[\s\S]*?\nexit=128\n/);
    git(root, ["remote", "add", "origin", join(root, "absent.git")]);
    const push = git(root, ["push", "origin", "HEAD"]);
    assert.notEqual(push.status, 0);
    assert.match(push.stderr, /does not appear to be a git repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Acceptance criterion 2: the rewrite is atomic, or nothing moves       */
/* -------------------------------------------------------------------- */

/**
 * MEMBER A of the atomicity class: a failure part way through the APPLY.
 *
 * The dangerous state this is red against is not "a crash". It is a rollback
 * that WRITES PER SWITCH WHILE ITERATING, which leaves a file that is
 * internally valid and factually wrong: two switches saying `current` and
 * three saying `kernel`. Demonstrated red against exactly that implementation,
 * captured in delivery/work-history/m4-p26.md:1.
 */
test("a failure part way through the rollback leaves cutover.json byte-identical", () => {
  const scratch = scratchFleet();
  try {
    const path = cutover.cutoverStatePath(scratch.fleet);
    const before = readFileSync(path);
    const outcome = cutover.applyRollback(scratch.fleet, "drain-reversal", {
      now: "2026-09-15T10:00:00.000Z",
      by: "test",
      reason: "injected failure after the second switch",
      onSwitch: (_change, index) => {
        if (index === 2) {
          throw new Error("injected failure after the second switch");
        }
      },
    });
    assert.equal(outcome.ok, false);
    assert.match(
      (outcome as { reason: string }).reason,
      /before any write/,
      "the refusal must say the failure preceded the write",
    );
    const after = readFileSync(path);
    assert.ok(before.equals(after), "cutover.json must be byte-identical after the failure");
    const read = cutover.readCutoverState(scratch.fleet);
    assert.equal(read.kind, "read");
    if (read.kind === "read") {
      const states = cutover.CUTOVER_SWITCHES.map((name) => read.state.switches[name].state);
      assert.deepEqual(states, ["kernel", "kernel", "kernel", "kernel", "kernel"]);
    }
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * MEMBER B, structurally different: the input is refused BEFORE the apply.
 *
 * Member A is a fault during assembly. This one never reaches assembly: the
 * third switch carries no `restore-to`, so the read refuses. It is the arm a
 * try/catch around the write is green on, and it is what makes the guarantee a
 * property of the ORDER of operations rather than of one rescued exception.
 */
test("a switch record with no restore-to is refused and nothing is written", () => {
  const broken = frozenState() as { switches: Record<string, Record<string, unknown>> };
  delete broken.switches["credentials-and-refs"]["restoreTo"];
  const scratch = scratchFleet({ state: broken });
  try {
    const path = cutover.cutoverStatePath(scratch.fleet);
    const before = readFileSync(path);
    const outcome = cutover.applyRollback(scratch.fleet, "freeze-point-restore", {
      now: "2026-09-15T10:00:00.000Z",
      by: "test",
      reason: "restore",
    });
    assert.equal(outcome.ok, false);
    assert.match(
      (outcome as { reason: string }).reason,
      /credentials-and-refs has no restoreTo/,
      "the refusal must name the switch and the field",
    );
    assert.ok(readFileSync(path).equals(before), "nothing may be written on a refusal");
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

test("a complete rollback moves all five switches and records the value to return to", () => {
  const scratch = scratchFleet();
  try {
    const outcome = cutover.applyRollback(scratch.fleet, "drain-reversal", {
      now: "2026-09-15T10:00:00.000Z",
      by: "test",
      reason: "drain reversal",
    });
    assert.equal(outcome.ok, true);
    const read = cutover.readCutoverState(scratch.fleet);
    assert.equal(read.kind, "read");
    if (read.kind === "read") {
      for (const name of cutover.CUTOVER_SWITCHES) {
        assert.equal(read.state.switches[name].state, "current", name);
        assert.equal(read.state.switches[name].restoreTo, "kernel", name);
      }
    }
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Drain is a computed predicate over IN-FLIGHT work only                */
/* -------------------------------------------------------------------- */

test("drain counts a live worktree and an open task with no turn-end, and nothing else", () => {
  const scratch = scratchFleet({ withRemote: true });
  try {
    mkdirSync(join(scratch.fleetRoot, "worktrees", "wt-alpha"), { recursive: true });
    writeFileSync(join(scratch.fleetRoot, "worktrees", "wt-alpha", "work.txt"), "x\n");
    mkdirSync(join(scratch.fleetRoot, "tasks", "open-no-turn-end"), { recursive: true });
    writeFileSync(
      join(scratch.fleetRoot, "tasks", "open-no-turn-end", "meta.json"),
      '{"id":"open-no-turn-end","status":"open"}\n',
    );
    mkdirSync(join(scratch.fleetRoot, "tasks", "open-with-turn-end"), { recursive: true });
    writeFileSync(
      join(scratch.fleetRoot, "tasks", "open-with-turn-end", "meta.json"),
      '{"id":"open-with-turn-end","status":"open"}\n',
    );
    writeFileSync(
      join(scratch.fleetRoot, "tasks", "open-with-turn-end", "turn-end"),
      '{"exitCode":0}\n',
    );
    mkdirSync(join(scratch.fleetRoot, "tasks", "closed"), { recursive: true });
    writeFileSync(
      join(scratch.fleetRoot, "tasks", "closed", "meta.json"),
      '{"id":"closed","status":"closed"}\n',
    );
    /* The DANGEROUS definition this is red against is "no unmerged branches".
       Three pushed unmerged branches exist here, and they must not move the
       count: this container cannot delete a remote ref, so a branch-counting
       predicate never reads clean. */
    for (const branch of ["stale-one", "stale-two", "stale-three"]) {
      assert.equal(
        git(scratch.fleetRoot, ["push", "-q", "origin", `HEAD:refs/heads/${branch}`]).status,
        0,
      );
    }
    const remoteBranches = git(scratch.fleetRoot, ["ls-remote", "--heads", "origin"])
      .stdout.split("\n")
      .filter((line) => line.trim().length > 0);
    assert.equal(remoteBranches.length, 4, "the fixture must really carry unmerged branches");

    const items = cutover.inFlightItems(scratch.fleet);
    assert.deepEqual(
      items.map((item) => `${item.kind}/${item.id}`),
      ["task/open-no-turn-end", "worktree/wt-alpha"],
    );
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

test("the cannot-see list is printed in full and names the pilot", () => {
  assert.ok(cutover.CANNOT_SEE.includes("open pull requests"));
  assert.ok(cutover.CANNOT_SEE.includes("CI conclusions"));
  assert.ok(cutover.CANNOT_SEE.includes("post-merge push runs"));
  assert.ok(
    cutover.CANNOT_SEE.some((line) => line.includes("pilot")),
    "the pilot's drain is not visible from this side and the list must say so",
  );
});

/* -------------------------------------------------------------------- */
/* Criterion 6: the owner request is complete, or it is not generated    */
/* -------------------------------------------------------------------- */

function completeCapture(): Record<string, unknown> {
  return {
    capturedAt: "2026-09-15T08:00:00.000Z",
    repository: "owner/kernel",
    rulesetName: "main-protection",
    rules: [
      { id: "required-reviews", preFlipValue: 1 },
      { id: "required-status-checks", preFlipValue: ["gates"] },
    ],
    credentialGrants: [{ name: "contents", preFlipValue: "write" }],
  };
}

test("the owner restore request carries every captured field with its pre-flip value", () => {
  const outcome = cutover.generateRestoreRequest(completeCapture());
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.fields, 3);
    for (const needle of ["required-reviews", "required-status-checks", "contents"]) {
      assert.ok(outcome.text.includes(needle), needle);
    }
    assert.ok(
      outcome.text.includes(cutover.UNREHEARSABLE_REASON),
      "the request must carry the property that makes its execution unrehearsable",
    );
  }
});

/** MEMBER A of the completeness class: an ABSENT key. */
test("the owner restore request is refused when a captured field is absent", () => {
  const capture = completeCapture();
  delete capture["rulesetName"];
  const outcome = cutover.generateRestoreRequest(capture);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.ok(
      outcome.reasons.some((reason) => reason.includes("rulesetName")),
      outcome.reasons.join("; "),
    );
  }
});

/**
 * MEMBER B, structurally different: every key PRESENT, one value EMPTY.
 *
 * This is the arm a presence check is green on, and it is the dangerous one,
 * because the request it would produce carries a blank where a pre-flip value
 * belongs and therefore LOOKS complete.
 */
test("the owner restore request is refused when a captured field is present but empty", () => {
  const capture = completeCapture();
  (capture["rules"] as Array<Record<string, unknown>>)[0]["preFlipValue"] = "   ";
  const outcome = cutover.generateRestoreRequest(capture);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.ok(
      outcome.reasons.some(
        (reason) => reason.includes("required-reviews") && reason.includes("empty"),
      ),
      outcome.reasons.join("; "),
    );
  }
  /* A second member of the SAME shape one level up: an empty LIST. */
  const emptyList = completeCapture();
  emptyList["credentialGrants"] = [];
  const second = cutover.generateRestoreRequest(emptyList);
  assert.equal(second.ok, false);
});

/* -------------------------------------------------------------------- */
/* Criterion 7: the file restore refuses a dirty tree                    */
/* -------------------------------------------------------------------- */

test("restoring retirement roots refuses a dirty tree and leaves the modified file byte-identical", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-restore-test-"));
  try {
    mkdirSync(join(root, "retired"), { recursive: true });
    writeFileSync(join(root, "retired", "rule.md"), "the original rule\n");
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "pre-freeze"]);
    const preFreeze = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    writeFileSync(join(root, "retired", "rule.md"), "the ported rule\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "retire"]);

    /* The DANGEROUS state: uncommitted work sitting in the tree, under the
       very root the restore names. `git checkout <sha> -- retired` would
       silently destroy it. */
    writeFileSync(join(root, "retired", "rule.md"), "FOUR ROUNDS OF UNCOMMITTED WORK\n");
    const dirty = readFileSync(join(root, "retired", "rule.md"));

    const outcome = cutover.restoreRetirementRoots(root, preFreeze, ["retired"]);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.match(outcome.reason, /uncommitted change/);
      assert.match(outcome.reason, /nothing was touched/);
    }
    assert.ok(
      readFileSync(join(root, "retired", "rule.md")).equals(dirty),
      "the dirty file must be byte-identical after the refusal",
    );

    /* Control: with the tree clean the same call restores, so the refusal is
       the guard working and not the command being broken. */
    git(root, ["checkout", "-q", "--", "retired"]);
    const restored = cutover.restoreRetirementRoots(root, preFreeze, ["retired"]);
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(readFileSync(join(root, "retired", "rule.md"), "utf8"), "the original rule\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* The retirement verdict is decided by the witness, not by existence    */
/* -------------------------------------------------------------------- */

test("a PORT row whose destination exists but whose negative witness exits 0 is unported", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-port-test-"));
  try {
    writeFileSync(join(root, "weak.mjs"), "process.exit(0);\n");
    writeFileSync(join(root, "strong.mjs"), "process.exit(1);\n");
    const weak = cutover.evaluatePortRow(
      {
        id: "R-WEAK",
        disposition: "PORT",
        destination: "weak.mjs",
        negativeWitness: [process.execPath, "weak.mjs"],
      },
      root,
    );
    assert.equal(weak.verdict, "unported");
    assert.match(weak.reason, /WEAKER/);
    const strong = cutover.evaluatePortRow(
      {
        id: "R-STRONG",
        disposition: "PORT",
        destination: "strong.mjs",
        negativeWitness: [process.execPath, "strong.mjs"],
      },
      root,
    );
    assert.equal(strong.verdict, "ported");
    /* Structurally different member of the unported class: the destination is
       absent, which a witness check alone would report as a run failure. */
    const absent = cutover.evaluatePortRow(
      {
        id: "R-ABSENT",
        disposition: "PORT",
        destination: "nowhere.mjs",
        negativeWitness: [process.execPath, "nowhere.mjs"],
      },
      root,
    );
    assert.equal(absent.verdict, "unported");
    assert.match(absent.reason, /does not exist as a file/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* The command surface                                                   */
/* -------------------------------------------------------------------- */

test("cutover rollback exits nonzero when the fleet state cannot be published", () => {
  const scratch = scratchFleet({ withRemote: true });
  try {
    /* A real push failure: origin points at a path that is not a repository. */
    git(scratch.fleetRoot, ["remote", "set-url", "origin", join(scratch.root, "absent.git")]);
    const status = commandModule.cmdCutover([
      "rollback",
      "--trigger",
      "drain-reversal",
      "--fleet",
      scratch.fleetRoot,
    ]);
    assert.notEqual(status, 0, "a push that did not land must not exit 0");
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * A fleet with no remote is a REFUSAL by default, and the escape hatch is
 * LOUD.
 *
 * The dangerous state is not "the push failed". It is a local-only write being
 * indistinguishable from a published one, which is what leaves every other
 * environment believing the switches are still `kernel`. So the default is
 * nonzero, and `--allow-no-remote` still prints the reason on a `SYNC
 * not-pushed` line rather than falling silent.
 */
test("a fleet with no remote refuses by default and says so out loud when allowed", () => {
  const scratch = scratchFleet();
  try {
    const refused = commandModule.cmdCutover([
      "rollback",
      "--trigger",
      "drain-reversal",
      "--fleet",
      scratch.fleetRoot,
    ]);
    assert.notEqual(refused, 0, "a fleet with no remote must not exit 0 by default");

    const outcome = cutover.syncFleetState(scratch.fleetRoot, {
      allowNoRemote: true,
      message: "test",
      paths: ["cutover.json"],
    });
    assert.equal(outcome.ok, true);
    if (outcome.ok) {
      assert.equal(outcome.pushed, false);
      assert.match(
        (outcome as { reason: string }).reason,
        /has no origin remote, so the rollback is committed locally and NOT published/,
      );
    }
    const strict = cutover.syncFleetState(scratch.fleetRoot, {
      message: "test",
      paths: ["cutover.json"],
    });
    assert.equal(strict.ok, false, "without the flag the same fleet is a refusal");
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * Trigger 2 is not one command, and the refusal has to be a REFUSAL rather
 * than a nonzero exit reached by accident.
 *
 * So this asserts BOTH halves: exit 1, and `cutover.json` byte-identical. A
 * command that fell through the refusal and rolled the switches back would
 * still exit nonzero on a fleet with no remote, which is a green nobody
 * earned; the byte comparison is what separates the two.
 */
test("cutover rollback refuses freeze-point-restore as a single command", () => {
  const scratch = scratchFleet();
  try {
    const before = readFileSync(cutover.cutoverStatePath(scratch.fleet));
    const status = commandModule.cmdCutover([
      "rollback",
      "--trigger",
      "freeze-point-restore",
      "--fleet",
      scratch.fleetRoot,
    ]);
    assert.equal(status, 1);
    assert.ok(
      readFileSync(cutover.cutoverStatePath(scratch.fleet)).equals(before),
      "the refusal must not move a switch",
    );
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

test("cutover usage errors exit 64", () => {
  assert.equal(commandModule.cmdCutover([]), commandModule.EX_USAGE);
  assert.equal(commandModule.cmdCutover(["nonsense"]), commandModule.EX_USAGE);
  assert.equal(commandModule.cmdCutover(["rollback"]), commandModule.EX_USAGE);
  assert.equal(
    commandModule.cmdCutover(["rollback", "--trigger", "not-a-trigger"]),
    commandModule.EX_USAGE,
  );
});

/* -------------------------------------------------------------------- */
/* Criteria 3, 4 and 5: the rehearsal script                             */
/* -------------------------------------------------------------------- */

test("the rehearsal runs trigger 1 end to end against a scratch fleet and exits 0", () => {
  const result = runRehearsal(["--trigger", "drain-reversal"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assertSelfChecked(result);
  assert.match(result.stdout, /OBSERVED step 5 drain: got 0/);
  assert.ok(!hasMismatch(result.stdout), result.stdout);
});

test("the rehearsal exits nonzero on a weaker destination and 0 once the row is disposed of", () => {
  const failing = runRehearsal(["--trigger", "retirement-unmet"]);
  assert.equal(failing.status, 1, failing.stdout + failing.stderr);
  assertSelfChecked(failing);
  assert.match(failing.stdout, /PORT R-CIT unported/);
  assert.match(failing.stdout, /WEAKER/);
  const repaired = runRehearsal(["--trigger", "retirement-unmet", "--port"]);
  assert.equal(repaired.status, 0, repaired.stdout + repaired.stderr);
  assertSelfChecked(repaired);
  assert.match(repaired.stdout, /PORT R-CIT ported/);
  assert.ok(!hasMismatch(repaired.stdout), repaired.stdout);
});

/**
 * Criterion 5. The refusal is ASSERTED rather than trusted, because a
 * rehearsal script that silently skipped an unrehearsable step, and exited 0
 * on the steps around it, is the shape T-025 records one level up.
 */
test("the rehearsal REFUSES trigger 2 step 3 and names the property in one line", () => {
  const result = runRehearsal(["--trigger", "freeze-point-restore"]);
  assert.equal(result.status, 3, "a refusal must not share an exit code with success or failure");
  assertSelfChecked(result);
  const refusalLines = result.stdout.split("\n").filter((line) => line.startsWith("REFUSED "));
  assert.equal(refusalLines.length, 1, result.stdout);
  assert.ok(
    (refusalLines[0] as string).includes(cutover.UNREHEARSABLE_REASON),
    refusalLines[0],
  );
});

test("the rehearsal DOES rehearse the input to trigger 2 step 3 and exits 0", () => {
  const result = runRehearsal(["--trigger", "freeze-point-restore-input"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assertSelfChecked(result);
  assert.match(result.stdout, /member A absent key refused/);
  assert.match(result.stdout, /member B present-but-empty value refused/);
  assert.ok(!hasMismatch(result.stdout), result.stdout);
});

/* -------------------------------------------------------------------- */
/* Criteria 1 and 8: the document itself                                 */
/* -------------------------------------------------------------------- */

function rollbackDocument(): string {
  return readFileSync(rollbackDocumentPath, "utf8");
}

test("the rollback document carries all three triggers", () => {
  const document = rollbackDocument();
  const headings = document
    .split("\n")
    .filter((line) => line.startsWith("## TRIGGER "))
    .map((line) => line.replace(/^## /, "").trim());
  assert.deepEqual(headings, [
    "TRIGGER 1: DRAIN REVERSAL",
    "TRIGGER 2: FREEZE-POINT RESTORE",
    "TRIGGER 3: RETIREMENT CRITERIA UNMET",
  ]);
});

/**
 * Criterion 1's falsifiable half: a trigger without an observation per step
 * fails review, so the check is a command and not a reading.
 */
test("every numbered step in the rollback document names a command and an observation", () => {
  const lines = rollbackDocument().split("\n");
  const steps: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | undefined;
  for (const line of lines) {
    if (line.startsWith("#### Step ")) {
      current = { heading: line.trim(), body: [] };
      steps.push(current);
      continue;
    }
    if (line.startsWith("#### ") || line.startsWith("## ")) {
      current = undefined;
      continue;
    }
    current?.body.push(line);
  }
  assert.ok(steps.length >= 12, `expected the three triggers' steps, found ${String(steps.length)}`);
  for (const step of steps) {
    const body = step.body.join("\n");
    assert.match(body, /^- command:/m, `${step.heading} names no command`);
    assert.match(body, /^- observation:/m, `${step.heading} names no observation`);
    assert.match(body, /rehearsable:/, `${step.heading} does not say whether it is rehearsable`);
  }
  /* Each trigger must contribute steps, not just the first one. */
  for (const prefix of ["#### Step 1.", "#### Step 2.", "#### Step 3."]) {
    assert.ok(
      steps.some((step) => step.heading.startsWith(prefix)),
      `no steps for ${prefix}`,
    );
  }
});

test("the rollback document names the steps that cannot be rehearsed with the property", () => {
  const document = rollbackDocument();
  assert.match(document, /## The steps that CANNOT be rehearsed/);
  assert.ok(
    document.includes(cutover.UNREHEARSABLE_REASON),
    "the document and the code must print the same sentence",
  );
  assert.match(document, /2\.3, restore the AUTHORITY/);
});

test("the rollback document states what the procedure does NOT cover", () => {
  const document = rollbackDocument();
  const section = document.slice(document.indexOf("## What this procedure does NOT cover"));
  assert.ok(section.length > 0);
  assert.match(section, /only in its own session/);
  assert.match(section, /npm publish/);
  assert.match(section, /delete a remote ref/i);
  assert.match(section, /pilot/i);
});

test("the rollback document treats the file half as cheap and the authority half as owner latency", () => {
  const document = rollbackDocument();
  assert.match(document, /The FILES are cheap/);
  assert.match(document, /The AUTHORITY is the expensive half/);
  assert.match(document, /owner latency/);
});

test("the rollback document flips and verifies each of the five switches by name", () => {
  const document = rollbackDocument();
  for (const name of cutover.CUTOVER_SWITCHES) {
    assert.ok(document.includes(name), `the document does not name the switch ${name}`);
  }
  assert.match(document, /flipped back by/);
  assert.match(document, /verified flipped by/);
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). The registry is
     append-only, so a count here would be a claim about every future phase. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "cutover-rollback-atomic-on-mid-apply-failure",
    "cutover-rollback-refuses-switch-without-restore-to",
    "cutover-rollback-moves-five-switches-and-records-return-value",
    "cutover-drain-counts-in-flight-not-branches",
    "cutover-cannot-see-list-names-the-pilot",
    "cutover-restore-request-carries-every-pre-flip-value",
    "cutover-restore-request-refuses-absent-field",
    "cutover-restore-request-refuses-present-but-empty-field",
    "cutover-restore-files-refuses-dirty-tree",
    "cutover-port-verdict-needs-a-red-negative-witness",
    "cutover-rollback-nonzero-when-fleet-state-not-published",
    "cutover-rollback-refuses-freeze-point-restore-as-one-command",
    "cutover-usage-errors",
    "cutover-rehearsal-drain-reversal-end-to-end",
    "cutover-rehearsal-retirement-both-arms",
    "cutover-rehearsal-refuses-unrehearsable-step",
    "cutover-rehearsal-covers-the-restore-request-input",
    "cutover-rehearsal-self-check-discriminates",
    "cutover-no-remote-refuses-by-default",
    "cutover-git-contract-reproduced-live",
    "cutover-document-carries-three-triggers",
    "cutover-document-every-step-has-command-and-observation",
    "cutover-document-names-unrehearsable-steps",
    "cutover-document-states-what-is-not-covered",
    "cutover-document-file-half-cheap-authority-half-owner",
    "cutover-document-five-switches-flip-and-verify",
    "cutover-document-pilot-as-second-subject",
    "cutover-rollback-is-monotone-and-idempotent",
    "cutover-rollback-leaves-an-unmoved-switch-byte-identical",
    "cutover-rollback-preserves-document-keys-it-does-not-own",
    "cutover-publish-replaces-the-destination",
    "cutover-drain-counts-the-undecidable",
    "cutover-rollback-commit-is-scoped-to-the-switch-file",
    "cutover-restore-removes-post-freeze-additions-and-verifies",
    "cutover-port-verdict-refuses-an-unreadable-row-or-a-killed-witness",
    "cutover-restore-request-refuses-a-present-non-list",
    "cutover-restore-request-out-refuses-a-non-regular-path",
    "cutover-inventory-refuses-the-malformed",
    "cutover-port-witness-command-is-a-string-list",
    "cutover-behaviors-resolve-by-name",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

test("the rollback document carries the pilot as a second subject with read-only steps", () => {
  const document = rollbackDocument();
  assert.match(document, /## Two subjects, not one/);
  for (const prefix of ["#### Step 1.P", "#### Step 2.P", "#### Step 3.P"]) {
    assert.ok(document.includes(prefix), `the document has no ${prefix}`);
  }
  assert.match(document, /read-only/);
});

/* ==================================================================== */
/* FIX ROUND 1. ONE MECHANISM, NINE SITES.                              */
/*                                                                      */
/* The defect both clean-room reviews found, in one sentence: A BENIGN   */
/* OUTCOME (a positive verdict, or a write) WAS PRODUCED BY AN ARM       */
/* REACHED BY FALLING THROUGH A TEST RATHER THAN BY A POSITIVE FACT      */
/* BEING ESTABLISHED, so the outcome's extent was wider or narrower than */
/* the sentence describing it, and nothing tested the difference.        */
/*                                                                      */
/* The tests below are that difference. Each names the DANGEROUS STATE   */
/* it was demonstrated red against, and each class carries at least two  */
/* structurally different members, because one member is not a class.    */
/* ==================================================================== */

/**
 * CLASS: a rollback never hands authority forward, and never rewrites a
 * switch it does not move.
 *
 * MEMBER A, the target computed from state the action rewrote. `restoreTo` is
 * the value a switch held before its last flip, and a rollback sets it to the
 * value the switch is leaving. So after one `retirement-unmet` rollback every
 * switch reads `current` with `restoreTo: "kernel"`, and a target read
 * straight off `restoreTo` moves all five FORWARD on the second run. That is
 * not a hypothetical run: trigger 1 step 1 exits nonzero when the push does
 * not land, after the local write, and the documented response is to run the
 * command again.
 *
 * Demonstrated red against the shipped implementation: the second run
 * reported five changes and wrote five `kernel` values, and the module header
 * says "does not write switches to `kernel`".
 */
test("a second rollback is a no-op and never moves a switch forward to kernel", () => {
  const scratch = scratchFleet();
  try {
    const first = cutover.applyRollback(scratch.fleet, "retirement-unmet", {
      now: "2026-09-16T10:00:00.000Z",
      by: "test",
      reason: "retirement criteria unmet",
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal((first as { changes: unknown[] }).changes.length, 5);

    const second = cutover.applyRollback(scratch.fleet, "retirement-unmet", {
      now: "2026-09-16T11:00:00.000Z",
      by: "test",
      reason: "retry after a push that did not land",
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.deepEqual(
      (second as { changes: unknown[] }).changes,
      [],
      "the second run must report no change at all",
    );
    const read = cutover.readCutoverState(scratch.fleet);
    assert.equal(read.kind, "read");
    if (read.kind === "read") {
      for (const name of cutover.CUTOVER_SWITCHES) {
        assert.equal(read.state.switches[name].state, "current", name);
      }
    }
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * MEMBER B of the same class, structurally different: the WRITE rather than
 * the target. A switch this rollback does not move must come out of it
 * byte-identical, `flippedAt`, `flippedBy`, `reason` and `restoreTo` included.
 *
 * The dangerous state is a half-rolled-back fleet: one switch already at
 * `current` carrying `restoreTo: "kernel"` and the record of when it left,
 * beside four still at `kernel`. The shipped implementation rebuilt every
 * record unconditionally, so a rollback that reported four changes silently
 * rewrote a fifth, destroying the one fact a later freeze-point restore reads.
 */
test("a switch the rollback does not move is left byte-identical", () => {
  const mixed = frozenState() as { switches: Record<string, Record<string, unknown>> };
  mixed["switches"]["closeout"] = {
    state: "current",
    flippedAt: "2026-09-14T08:00:00.000Z",
    flippedBy: "an earlier rollback",
    reason: "closeout was handed back first",
    restoreTo: "kernel",
  };
  const untouched = JSON.parse(JSON.stringify(mixed["switches"]["closeout"])) as unknown;
  const scratch = scratchFleet({ state: mixed });
  try {
    const outcome = cutover.applyRollback(scratch.fleet, "freeze-point-restore", {
      now: "2026-09-16T10:00:00.000Z",
      by: "test",
      reason: "freeze-point restore",
    });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.deepEqual(
      (outcome as { changes: { name: string }[] }).changes.map((change) => change.name),
      ["planning-and-scope", "review-and-arbitration", "credentials-and-refs", "salvage-and-recovery"],
      "closeout was already current and must not appear as a change",
    );
    const read = cutover.readCutoverState(scratch.fleet);
    assert.equal(read.kind, "read");
    if (read.kind === "read") {
      assert.deepEqual(
        JSON.parse(JSON.stringify(read.state.switches["closeout"])) as unknown,
        untouched,
        "an unmoved switch must come out of the rollback exactly as it went in",
      );
    }
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * CLASS: the rollback writes the SWITCHES, and the file keeps everything else.
 *
 * `CutoverState` names `switches` and nothing else, so serialising the typed
 * view deletes every other key the document held. M4-P25 owns the schema and
 * may add top-level keys; this phase must not delete them and must not refuse
 * them either, because refusing would be deciding M4-P25's schema from here.
 *
 * MEMBER A: an unknown TOP-LEVEL key. MEMBER B, structurally different: an
 * unknown key inside a switch RECORD that the rollback does move, which the
 * top-level carry does not reach and which only the record spread preserves.
 */
test("a rollback preserves document keys it does not own, top level and per record", () => {
  const document = frozenState() as {
    switches: Record<string, Record<string, unknown>>;
  } & Record<string, unknown>;
  document["schemaVersion"] = 3;
  document["pilot"] = { fleet: "tiphys-ai-helmsman-fleet", note: "DR-0037" };
  document["switches"]["planning-and-scope"]["ticket"] = "A-9";
  const scratch = scratchFleet({ state: document });
  try {
    const outcome = cutover.applyRollback(scratch.fleet, "drain-reversal", {
      now: "2026-09-16T10:00:00.000Z",
      by: "test",
      reason: "drain reversal",
    });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    const onDisk = JSON.parse(
      readFileSync(cutover.cutoverStatePath(scratch.fleet), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(onDisk["schemaVersion"], 3, "an unknown top-level key must survive");
    assert.deepEqual(
      onDisk["pilot"],
      { fleet: "tiphys-ai-helmsman-fleet", note: "DR-0037" },
      "an unknown top-level object must survive",
    );
    const moved = (onDisk["switches"] as Record<string, Record<string, unknown>>)[
      "planning-and-scope"
    ];
    assert.equal(moved["state"], "current", "the switch must still have moved");
    assert.equal(moved["ticket"], "A-9", "an unknown key inside a MOVED record must survive");
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * CLASS: the atomic publish REPLACES the destination and never writes through
 * it.
 *
 * This is the guard that could not go red. The shipped
 * `cutover-rollback-atomic` witness injects a throw in the in-memory observer,
 * which is red against a per-switch publish and against a missing try/catch,
 * and says nothing about the rename. Measured by a clean-room reviewer:
 * `publishCutoverState` replaced by `mkdirSync` plus a plain
 * `writeFileSync(path, body)` left `node --test test/cutover.test.ts` at 27
 * tests, 27 pass, 0 fail, exit 0. The ATOMIC claim was carried by prose.
 *
 * MEMBER A below is a symlink at the destination: an in-place write follows it
 * and clobbers the target, a rename replaces it. MEMBER B is the destination's
 * inode plus the absence of a leftover temporary, which is red against a
 * copy-over publish that a symlink test alone would also catch but for a
 * different reason. Neither depends on file modes, because the suite runs as a
 * uid that ignores them.
 */
test("publishing the cutover state replaces the destination rather than writing through it", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-atomic-test-"));
  /* Declared out here so the finally can release it whether or not an assertion
     throws; see the comment at the open below for why it is held at all. */
  let holdOriginalInode: number | undefined;
  try {
    const decoy = join(root, "decoy.json");
    writeFileSync(decoy, "DECOY, MUST NOT BE WRITTEN THROUGH\n");
    const decoyBefore = readFileSync(decoy);
    const destination = join(root, "cutover.json");
    writeFileSync(destination, "{}\n");
    const inodeBefore = statSync(destination).ino;
    /* HOLD A DESCRIPTOR ON THE ORIGINAL ACROSS THE DELETE, OR THE INODE
       ASSERTION BELOW IS A CLAIM ABOUT THE ALLOCATOR AND NOT ABOUT THE CODE.
       `rmSync` drops the last link and frees the inode, after which the number
       is the filesystem's to hand out again; a correct replace that happens to
       receive it back then fails the test. That is not hypothetical: it
       reddened CI on pull request #160, a phase touching none of this, with
       actual and expected both 9182995, while the SAME commit on the SAME
       runner passed the identical suite minutes earlier. A POSIX inode is not
       freed while any descriptor still refers to it, so holding one makes the
       number un-recyclable and the assertion sound. Measured in-container, 200
       trials per arm: reused 200/200 without a held descriptor and 0/200 with
       one. Recorded in full at
       delivery/tuition/T-035-an-assertion-on-an-inode-number-depends-on-the-allocator.md. */
    holdOriginalInode = openSync(destination, "r");
    rmSync(destination);
    symlinkSync(decoy, destination);

    cutover.publishCutoverState(destination, frozenState() as Record<string, unknown>);

    assert.equal(
      lstatSync(destination).isSymbolicLink(),
      false,
      "the destination must be replaced, not written through",
    );
    assert.ok(
      readFileSync(decoy).equals(decoyBefore),
      "the symlink target must be byte-identical: an in-place write would have clobbered it",
    );
    assert.notEqual(
      statSync(destination).ino,
      inodeBefore,
      "the destination must be a new inode, which an in-place write does not produce",
    );
    assert.deepEqual(
      (JSON.parse(readFileSync(destination, "utf8")) as { switches: Record<string, unknown> })
        .switches["closeout"],
      (frozenState() as { switches: Record<string, unknown> }).switches["closeout"],
      "and the published content must be the state that was handed in",
    );
    assert.deepEqual(
      readdirSync(root).filter((name) => name.startsWith(".cutover.")),
      [],
      "no temporary file may be left beside the destination",
    );
  } finally {
    /* In the finally, not after the assertions: it still runs only once every
       assertion above has, which is what keeps `inodeBefore` from naming
       something else by then, AND it runs when one of them throws, so a
       failing run does not also leak a descriptor. */
    if (holdOriginalInode !== undefined) {
      closeSync(holdOriginalInode);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * CLASS: drain counts what it cannot decide.
 *
 * A drain predicate answers "is it safe to enter cutover". Every arm that
 * treats an undecidable entry as finished reports a clean drain over work that
 * may still be running, and a predicate that reads quiet at full speed is the
 * guard that cannot go red.
 *
 * FOUR structurally different members, three of which the shipped code read as
 * finished:
 *   A. the turn-end file is a NAMED PIPE, so `classifyEntry` calls it
 *      irregular. The shipped arm counted only `absent` and `dangling`, so a
 *      task whose turn-end is the T-003 hazard shape read as finished.
 *   B. meta.json is a NAMED PIPE, so the read is refused. The shipped arm was
 *      `if (metaRead.kind !== "read") continue`, so present-and-unreadable
 *      read as finished, while the neighbouring arm for unparseable JSON got
 *      the rule right in its own comment.
 *   C. meta.json parses and carries a status outside the closed vocabulary.
 *      The shipped test was `status !== "open"`, so a typo, a number and a
 *      missing field all read as finished.
 *   D. the tasks directory cannot be enumerated at all. The shipped
 *      `listDirectoryNames` returned `[]` for both "empty" and "could not be
 *      read", so an unreadable `tasks/` reported a CLEAN DRAIN over an unknown
 *      number of open tasks. No reviewer named this one; it came out of the
 *      derivation.
 */
test("drain counts the entries it cannot decide rather than reading them as finished", () => {
  const scratch = scratchFleet();
  try {
    const tasks = join(scratch.fleetRoot, "tasks");
    /* A: turn-end is a named pipe. */
    mkdirSync(join(tasks, "pipe-turn-end"), { recursive: true });
    writeFileSync(join(tasks, "pipe-turn-end", "meta.json"), '{"id":"pipe-turn-end","status":"open"}\n');
    assert.equal(
      spawnSync("mkfifo", [join(tasks, "pipe-turn-end", "turn-end")]).status,
      0,
      "the fixture needs a real named pipe",
    );
    /* B: meta.json is a named pipe. */
    mkdirSync(join(tasks, "pipe-meta"), { recursive: true });
    assert.equal(spawnSync("mkfifo", [join(tasks, "pipe-meta", "meta.json")]).status, 0);
    /* C: a status outside the closed vocabulary. */
    mkdirSync(join(tasks, "odd-status"), { recursive: true });
    writeFileSync(join(tasks, "odd-status", "meta.json"), '{"id":"odd-status","status":"finished"}\n');
    /* Control, so the test is not green by counting everything: a genuinely
       closed task and an open one with a regular turn-end are NOT counted. */
    mkdirSync(join(tasks, "really-closed"), { recursive: true });
    writeFileSync(join(tasks, "really-closed", "meta.json"), '{"id":"really-closed","status":"closed"}\n');
    mkdirSync(join(tasks, "really-done"), { recursive: true });
    writeFileSync(join(tasks, "really-done", "meta.json"), '{"id":"really-done","status":"open"}\n');
    writeFileSync(join(tasks, "really-done", "turn-end"), '{"exitCode":0}\n');

    const items = cutover.inFlightItems(scratch.fleet);
    assert.deepEqual(
      items.map((item) => `${item.kind}/${item.id}`),
      ["task/odd-status", "task/pipe-meta", "task/pipe-turn-end"],
      JSON.stringify(items, null, 2),
    );
    assert.match(
      items.find((item) => item.id === "pipe-turn-end")?.detail ?? "",
      /turn-end could not be examined/,
    );
    assert.match(
      items.find((item) => item.id === "pipe-meta")?.detail ?? "",
      /meta.json could not be examined/,
    );
    assert.match(
      items.find((item) => item.id === "odd-status")?.detail ?? "",
      /is not one of open or closed/,
    );

    /* D: the whole directory stops being enumerable. Done by replacing it with
       a regular file, which does not depend on the uid the suite runs as. */
    rmSync(tasks, { recursive: true, force: true });
    writeFileSync(tasks, "not a directory\n");
    const blind = cutover.inFlightItems(scratch.fleet);
    assert.equal(
      blind.some((item) => item.kind === "unexaminable"),
      true,
      "an unenumerable tasks directory must never read as a clean drain",
    );
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * CLASS: the rollback commit carries the file the rollback changed, and
 * nothing else.
 *
 * Trigger 1 fires precisely when in-flight work exists, so the fleet is dirty
 * BY CONSTRUCTION when this command runs. Staging everything at the fleet root
 * therefore commits and pushes somebody else's half-written work under the
 * message "cutover rollback", which is a write whose extent is wider than the
 * sentence describing it.
 *
 * MEMBER A: an unrelated tracked file is modified and an untracked scratch
 * file exists; both must survive the rollback untouched and out of the commit.
 * MEMBER B, structurally different: the index already holds a staged path that
 * this rollback did not stage, which a scoped staging does not remove, so the
 * whole sync is refused and nothing is committed.
 */
test("the rollback commit carries cutover.json and nothing else", () => {
  const scratch = scratchFleet({ withRemote: true });
  try {
    writeFileSync(join(scratch.fleetRoot, "backlog.md"), "# backlog\nhalf-written line\n");
    writeFileSync(join(scratch.fleetRoot, "operator-scratch.txt"), "not mine to publish\n");
    const status = commandModule.cmdCutover([
      "rollback",
      "--trigger",
      "drain-reversal",
      "--fleet",
      scratch.fleetRoot,
    ]);
    assert.equal(status, 0, "the rollback itself must succeed");
    const committed = git(scratch.fleetRoot, ["show", "--name-only", "--format=", "HEAD"])
      .stdout.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    assert.deepEqual(committed, ["cutover.json"], "the commit must name one file");
    const dirty = git(scratch.fleetRoot, ["status", "--porcelain"])
      .stdout.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .sort();
    assert.deepEqual(
      dirty,
      ["?? operator-scratch.txt", "M backlog.md"],
      "the operator's work must still be exactly as dirty as it was",
    );

    /* MEMBER B: a pre-existing index is a refusal, not something to absorb. */
    assert.equal(git(scratch.fleetRoot, ["add", "--", "backlog.md"]).status, 0);
    const headBefore = git(scratch.fleetRoot, ["rev-parse", "HEAD"]).stdout.trim();
    const refused = cutover.syncFleetState(scratch.fleetRoot, {
      message: "cutover rollback: drain-reversal",
      paths: ["cutover.json"],
    });
    assert.equal(refused.ok, false, JSON.stringify(refused));
    if (!refused.ok) {
      assert.match(refused.reason, /already holds 1 staged path/);
      assert.match(refused.reason, /nothing was committed/);
      assert.match(refused.reason, /backlog\.md/);
    }
    assert.equal(
      git(scratch.fleetRoot, ["rev-parse", "HEAD"]).stdout.trim(),
      headBefore,
      "the refusal must leave HEAD where it was",
    );
  } finally {
    rmSync(scratch.root, { recursive: true, force: true });
  }
});

/**
 * CLASS: RESTORED is a claim about the whole root, and it is measured.
 *
 * Checking a tree out over a path writes what the sha held and removes
 * NOTHING, so every file added under the root after the freeze survives. The
 * shipped command printed `RESTORED` over that hybrid tree.
 *
 * MEMBER A: a file added after the freeze. MEMBER B, structurally different: a
 * file RENAMED after the freeze, where the checkout brings the old name back
 * and leaves the new one, so the root ends up carrying BOTH. The assertion
 * that settles both is the same one the code now makes for itself: the root
 * is byte-for-byte the sha's version of it.
 */
test("restoring a retirement root removes what was added after the freeze and verifies the result", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-restore-verify-"));
  try {
    mkdirSync(join(root, "retired"), { recursive: true });
    writeFileSync(join(root, "retired", "rule.md"), "the original rule\n");
    writeFileSync(join(root, "retired", "moved.md"), "a rule that will be renamed\n");
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "pre-freeze"]);
    const preFreeze = git(root, ["rev-parse", "HEAD"]).stdout.trim();

    /* MEMBER A: a file that did not exist at the freeze. */
    mkdirSync(join(root, "retired", "kernel"), { recursive: true });
    writeFileSync(join(root, "retired", "kernel", "ported.md"), "the kernel rule\n");
    /* MEMBER B: a rename, which is an addition and a deletion at once. */
    git(root, ["mv", join("retired", "moved.md"), join("retired", "renamed.md")]);
    writeFileSync(join(root, "retired", "rule.md"), "the ported rule\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "retire"]);

    const restored = cutover.restoreRetirementRoots(root, preFreeze, ["retired"]);
    assert.equal(restored.ok, true, JSON.stringify(restored));
    if (restored.ok) {
      assert.deepEqual(
        [...restored.removed].sort(),
        ["retired/kernel/ported.md", "retired/renamed.md"],
        "both post-freeze additions must be named as removed",
      );
    }
    assert.equal(readFileSync(join(root, "retired", "rule.md"), "utf8"), "the original rule\n");
    assert.equal(readFileSync(join(root, "retired", "moved.md"), "utf8"), "a rule that will be renamed\n");
    assert.equal(existsSync(join(root, "retired", "renamed.md")), false, "the renamed copy must be gone");
    assert.equal(existsSync(join(root, "retired", "kernel", "ported.md")), false, "the added file must be gone");
    /* THE VERDICT, MEASURED RATHER THAN ASSUMED. This is the assertion the
       shipped implementation failed while returning ok and printing RESTORED. */
    const residue = git(root, ["diff", "--name-only", preFreeze, "--", "retired"]).stdout.trim();
    assert.equal(residue, "", `the root must match ${preFreeze} exactly, and it differs in: ${residue}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * CLASS: `ported` is reached from a positive test, never from a fallthrough.
 *
 * `readRetirementInventory` casts whatever the fixture's `rows` array holds,
 * and the shipped first line asked only whether the disposition was NOT the
 * word `PORT`. So every unreadable row - a string, a number, a misspelt
 * disposition, a row with no id - returned `ported`, which is the verdict "this
 * retirement is complete" over a row nobody could read. Trigger 3 is the
 * trigger that exists to catch a cutover completed on paperwork.
 *
 * THREE structurally different members: a misspelt disposition, a row that is
 * not an object at all, and a witness that was KILLED BY A SIGNAL, where
 * `status` is null, null is not 0, and the shipped nonzero arm therefore
 * accepted a dead witness as a red one.
 */
test("an unreadable retirement row is unported, and a witness killed by a signal is not a red witness", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-port-closed-"));
  try {
    writeFileSync(join(root, "strong.mjs"), "process.exit(1);\n");
    writeFileSync(join(root, "suicide.mjs"), 'process.kill(process.pid, "SIGKILL");\n');

    const misspelt = cutover.evaluatePortRow(
      { id: "R-CASE", disposition: "port" as unknown as "PORT", destination: "strong.mjs" },
      root,
    );
    assert.equal(misspelt.verdict, "unported");
    assert.match(misspelt.reason, /is not one of PORT, DELETE, KEEP/);

    const notAnObject = cutover.evaluatePortRow(
      "R-JUST-A-STRING" as unknown as Parameters<typeof cutover.evaluatePortRow>[0],
      root,
    );
    assert.equal(notAnObject.verdict, "unported");
    assert.match(notAnObject.reason, /not an object/);

    const killed = cutover.evaluatePortRow(
      {
        id: "R-KILLED",
        disposition: "PORT",
        destination: "suicide.mjs",
        negativeWitness: [process.execPath, "suicide.mjs"],
      },
      root,
    );
    assert.equal(killed.verdict, "unported", JSON.stringify(killed));
    assert.match(killed.reason, /killed by SIGKILL/);

    /* Control: the ported arm is still reachable, so this is the guard working
       and not the verdict being nailed to `unported`. */
    const ported = cutover.evaluatePortRow(
      {
        id: "R-STRONG",
        disposition: "PORT",
        destination: "strong.mjs",
        negativeWitness: [process.execPath, "strong.mjs"],
      },
      root,
    );
    assert.equal(ported.verdict, "ported", JSON.stringify(ported));
    const keep = cutover.evaluatePortRow({ id: "R-KEEP", disposition: "KEEP" }, root);
    assert.equal(keep.verdict, "ported");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * CLASS: the owner request is refused when a captured list is present but
 * unreadable.
 *
 * Criterion 6 asks for an absent key and a present-but-empty value. There is a
 * third arm one level up that neither member reaches: a key that is present,
 * NOT empty, and not a list. `isEmptyValue` passes a non-empty string, and the
 * shipped loop then did `if (!Array.isArray(list)) continue`, so the request
 * was generated with zero fields read from that key and reported as complete.
 * An owner request with a hole in it is worse than no request: it looks
 * complete. No reviewer named this one; it came out of the derivation.
 *
 * MEMBER A is a string where a list belongs, MEMBER B a non-empty object.
 */
test("the owner restore request is refused when a captured list is present but is not a list", () => {
  const asString = completeCapture();
  asString["rules"] = "see the wiki";
  const stringOutcome = cutover.generateRestoreRequest(asString);
  assert.equal(stringOutcome.ok, false, JSON.stringify(stringOutcome));
  if (!stringOutcome.ok) {
    assert.ok(
      stringOutcome.reasons.some((reason) => /field rules is present but is not a list/.test(reason)),
      stringOutcome.reasons.join("; "),
    );
  }

  const asObject = completeCapture();
  asObject["credentialGrants"] = { "npm-publish": "still granted" };
  const objectOutcome = cutover.generateRestoreRequest(asObject);
  assert.equal(objectOutcome.ok, false, JSON.stringify(objectOutcome));
  if (!objectOutcome.ok) {
    assert.ok(
      objectOutcome.reasons.some((reason) =>
        /field credentialGrants is present but is not a list/.test(reason),
      ),
      objectOutcome.reasons.join("; "),
    );
  }
});

/**
 * CLASS: every write in this phase goes to a path whose type was established.
 *
 * `--out` was the one write that did not. Opening a named pipe for writing
 * blocks exactly as reading one does, which is why src/task.ts holds ONE
 * answer to "may this path be opened" and every other reader and writer in the
 * kernel goes through it. This site did not, and the derivation found it
 * rather than a reviewer.
 *
 * The named pipe below has no reader, so the assertion that matters is that
 * this test RETURNS: a plain write would hang here and the suite would hit its
 * own timeout rather than fail.
 */
test("the owner restore request refuses to write to a path that is not a regular file", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-request-out-"));
  try {
    const capturePath = join(root, "pre-freeze-ruleset.json");
    writeFileSync(capturePath, `${JSON.stringify(completeCapture(), null, 2)}\n`);
    /* ORDER IS DELIBERATE. The directory member is asserted FIRST because a
       write to the named pipe below has no reader: with the guard removed the
       run HANGS rather than failing, measured at 180 seconds with no exit, and
       a witness member that hangs is a gate that never finishes rather than
       one that goes red. The directory arm fails fast against exactly the same
       missing guard. */
    const directory = join(root, "a-directory");
    mkdirSync(directory, { recursive: true });
    assert.notEqual(
      commandModule.cmdCutover(["restore-request", "--ruleset", capturePath, "--out", directory]),
      0,
      "a write to a directory must be refused rather than thrown out of the command",
    );

    const fifo = join(root, "request.txt");
    assert.equal(spawnSync("mkfifo", [fifo]).status, 0, "the fixture needs a real named pipe");

    const status = commandModule.cmdCutover([
      "restore-request",
      "--ruleset",
      capturePath,
      "--out",
      fifo,
    ]);
    assert.notEqual(status, 0, "a write to a named pipe must be refused, not attempted");

    /* Control: the same command writes a regular path and exits 0, so the
       refusal is the guard and not the command being broken. */
    const regular = join(root, "request-regular.txt");
    assert.equal(
      commandModule.cmdCutover(["restore-request", "--ruleset", capturePath, "--out", regular]),
      0,
    );
    assert.match(readFileSync(regular, "utf8"), /OWNER ACTION/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * CLASS: a malformed retirement inventory is REFUSED with a reason, never
 * thrown out of the reader and never read.
 *
 * FOUND BY FIX ROUND 2, AND IT IS THE ROUND'S OWN MECHANISM. The fix round's
 * not-covered statement said "a malformed inventory is refused by its own code
 * path and that path is unwitnessed". Measuring that sentence instead of
 * trusting it found it false for one member: `JSON.parse("null")` succeeds and
 * returns null, and `(parsed as { rows?: unknown }).rows` then threw
 * `TypeError: Cannot read properties of null (reading 'rows')` out of a
 * function whose entire interface is read / absent / refused. A reader that
 * throws carries no reason, so the caller cannot say what was wrong with the
 * file. That is a verdict arm narrower than the sentence describing it, which
 * is the family this round exists for.
 *
 * MEMBER A is the null document: the type is not established before a property
 * is read off it. MEMBER B is a `rows` value that is present and not a list,
 * which is a different line and a different failure (a silent read of a
 * non-array rather than a throw). The two mutations touch different text, so
 * red-witness rule (g) does not collapse them.
 */
test("a malformed retirement inventory is refused with a reason rather than thrown", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-inventory-"));
  try {
    const cases: Array<[string, string]> = [
      ["null.json", "null"],
      ["number.json", "7"],
      ["string.json", '"R-1"'],
      ["array.json", "[]"],
      ["no-rows.json", '{"note":"nothing here"}'],
      ["rows-object.json", '{"rows":{"a":1}}'],
      ["rows-string.json", '{"rows":"R-1"}'],
      ["not-json.json", "{ this is not json"],
    ];
    for (const [name, body] of cases) {
      const path = join(root, name);
      writeFileSync(path, body);
      let outcome: ReturnType<typeof cutover.readRetirementInventory>;
      try {
        outcome = cutover.readRetirementInventory(path);
      } catch (error) {
        assert.fail(
          `${name}: readRetirementInventory threw instead of refusing: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      assert.equal(outcome.kind, "refused", `${name} must be refused`);
      assert.ok(
        outcome.kind === "refused" && outcome.reason.length > 0,
        `${name}: a refusal must carry a reason naming what was wrong`,
      );
    }

    /* Control: a well-formed inventory still reads, so the refusals above are
       the guard and not the reader being broken. */
    const good = join(root, "good.json");
    writeFileSync(good, '{"rows":[{"id":"R-1","disposition":"KEEP"}]}');
    const read = cutover.readRetirementInventory(good);
    assert.equal(read.kind, "read");
    assert.equal(read.kind === "read" ? read.rows.length : -1, 1);

    /* Control: an absent file is `absent`, which is not a refusal. */
    assert.equal(cutover.readRetirementInventory(join(root, "gone.json")).kind, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * CLASS: a PORT row's negative-witness command is a LIST OF NON-EMPTY STRINGS
 * before it is destructured or spawned, and any other shape is a verdict rather
 * than a throw.
 *
 * SECOND DEFECT FOUND BY FIX ROUND 2, AND IT IS THE SAME MECHANISM AS THE
 * INVENTORY READER. `destination` one line above is tested with
 * `nonEmptyString`; `negativeWitness` was tested with `.length`, which is a
 * property read off a value nobody typed. Measured at the fix-round-1 head,
 * with `evaluatePortRow`'s interface being a `PortResult`:
 *
 *   negativeWitness number                  -> THREW TypeError: number 42 is not iterable
 *   negativeWitness object                  -> THREW TypeError: object is not iterable
 *   negativeWitness null                    -> THREW TypeError: Cannot read properties of null (reading 'length')
 *   negativeWitness array of one non-string -> THREW TypeError: The "file" argument must be of type string
 *
 * Four throws where a verdict was owed. A retirement inventory is another
 * phase's file, so its fields are unknown in exactly the way a parsed
 * document's are, and a throw carries no reason a caller can print.
 *
 * MEMBER A is the type test on the command itself (the not-iterable throws).
 * MEMBER B is the per-element test (the array that is a list, but of the wrong
 * thing, which reaches spawnSync and throws there instead). Different lines,
 * different failure, different arm.
 */
test("a PORT row whose negative-witness command is not a list of strings is unported, not a throw", () => {
  const root = mkdtempSync(join(tmpdir(), "tiphys-port-witness-"));
  try {
    writeFileSync(join(root, "dest.md"), "the new artifact\n");
    const shapes: Array<[string, unknown]> = [
      ["a number", 42],
      ["an object", { cmd: "true" }],
      ["null", null],
      ["a bare string", "true"],
      ["an empty string", ""],
      ["an empty list", []],
      ["a list holding a number", [42]],
      ["a list whose program is null", [null]],
      ["a list holding an empty string", ["", "-c", "exit 3"]],
    ];
    for (const [label, witness] of shapes) {
      const row = {
        id: "R-1",
        disposition: "PORT",
        destination: "dest.md",
        negativeWitness: witness,
      } as unknown as Parameters<typeof cutover.evaluatePortRow>[0];
      let result: ReturnType<typeof cutover.evaluatePortRow>;
      try {
        result = cutover.evaluatePortRow(row, root);
      } catch (error) {
        assert.fail(
          `negativeWitness ${label}: evaluatePortRow threw instead of returning a verdict: ${
            error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          }`,
        );
      }
      assert.equal(
        result.verdict,
        "unported",
        `negativeWitness ${label} must be unported`,
      );
      assert.ok(
        result.reason.length > 0,
        `negativeWitness ${label}: the refusal must carry a reason`,
      );
    }

    /* Control: a real list of strings still runs and still decides, so the
       refusals above are the type test and not the function being broken. */
    const good = {
      id: "R-2",
      disposition: "PORT",
      destination: "dest.md",
      negativeWitness: ["/bin/sh", "-c", "exit 3"],
    } as unknown as Parameters<typeof cutover.evaluatePortRow>[0];
    const ported = cutover.evaluatePortRow(good, root);
    assert.equal(ported.verdict, "ported");
    assert.match(ported.reason, /exits 3/);

    /* Control: the same real list exiting 0 is still the WEAKER verdict, so the
       new guard has not swallowed the check it sits in front of. */
    const weaker = {
      id: "R-3",
      disposition: "PORT",
      destination: "dest.md",
      negativeWitness: ["/bin/sh", "-c", "exit 0"],
    } as unknown as Parameters<typeof cutover.evaluatePortRow>[0];
    assert.equal(cutover.evaluatePortRow(weaker, root).verdict, "unported");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ==================================================================== */
/* FIX ROUND 2. THE REGISTRY SAID REGISTERED AND MEANT PRESENT.         */
/* ==================================================================== */

/**
 * CLASS: every behavior this phase registers RESOLVES BY NAME to a test that
 * actually runs.
 *
 * THE GUARD THAT COULD NOT GO RED, AND IT GUARDED THIS PHASE'S OWN REGISTRY.
 * The registration test above asserts `Object.hasOwn(behaviors, id)` and
 * nothing else, so it is green whenever the KEY exists, whatever its VALUE
 * says. Measured by running the required `suite` gate, which nobody had run on
 * this branch: at the reviewed head `7dcce83`, 23 of 27 cutover behaviors did
 * not resolve; at fix round 1's head, 35 of 39. The registration test was green
 * throughout, and so was every full `node --test` run in this work history.
 *
 * `test/behaviors.json` maps an id to the EXACT NAME of the test that guards
 * it. A near-miss ("a failure part way through A rollback ... with no partial
 * switch state" against the real "a failure part way through THE rollback ...")
 * reads as registered to a human and resolves to nothing for the gate.
 *
 * This test asserts the property the registration test only appeared to: every
 * cutover behavior's registered name is a test() name somewhere under `test/`.
 * It reads the sources rather than the running suite because a test cannot
 * enumerate its own run, and the suite gate does the runtime half.
 *
 * MEMBER A of the class is a behavior whose name matches no test. MEMBER B is
 * the weaker predicate itself: an assertion over ids rather than over names.
 */
test("every cutover behavior resolves by name to a test that exists", () => {
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;

  const testNames = new Set<string>();
  const testDir = join(repoRoot, "test");
  for (const entry of readdirSync(testDir)) {
    if (!entry.endsWith(".test.ts")) continue;
    const body = readFileSync(join(testDir, entry), "utf8");
    for (const match of body.matchAll(/\btest\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      testNames.add(match[2] as string);
    }
  }
  assert.ok(
    testNames.size > 100,
    `the test-name scan found only ${testNames.size} names, so it is not reading the suite`,
  );

  const unresolved: string[] = [];
  let checked = 0;
  for (const [id, name] of Object.entries(behaviors)) {
    if (!id.startsWith("cutover-")) continue;
    checked += 1;
    if (!testNames.has(name)) unresolved.push(`${id} -> ${JSON.stringify(name)}`);
  }
  assert.ok(checked > 0, "no cutover behavior was checked, so this test proves nothing");
  assert.deepEqual(
    unresolved,
    [],
    `${unresolved.length} of ${checked} cutover behaviors name no test:\n  ${unresolved.join("\n  ")}`,
  );
});

/**
 * Criterion 7's helper, given its own test rather than riding on four others.
 *
 * `cutover-rehearsal-self-check-discriminates` was registered against a
 * sentence that was nobody's test name, because the property is asserted by
 * `assertSelfChecked` INSIDE the four rehearsal tests. A behavior with no test
 * of its own is how it came to name nothing, so it gets one here: all four arms
 * in one place, and the self-check line required BEFORE any OBSERVED line, so
 * a script that printed its verdict first and its self-check afterwards is red.
 */
test("every rehearsal arm prints its own self-check before any OBSERVED line", () => {
  const arms: Array<[string, string[]]> = [
    ["drain-reversal", ["--trigger", "drain-reversal"]],
    ["retirement-unmet", ["--trigger", "retirement-unmet"]],
    ["retirement-unmet --port", ["--trigger", "retirement-unmet", "--port"]],
    ["freeze-point-restore", ["--trigger", "freeze-point-restore"]],
    ["freeze-point-restore-input", ["--trigger", "freeze-point-restore-input"]],
  ];
  for (const [label, args] of arms) {
    const result = runRehearsal(args);
    const lines = result.stdout.split("\n");
    const selfCheck = lines.findIndex((line) => line.startsWith("SELF-CHECK OK: observe() discriminates"));
    assert.notEqual(selfCheck, -1, `${label}: no self-check line\n${result.stdout}${result.stderr}`);
    const firstObserved = lines.findIndex((line) => line.startsWith("OBSERVED "));
    if (firstObserved !== -1) {
      assert.ok(
        selfCheck < firstObserved,
        `${label}: the self-check must be printed before the first OBSERVED line`,
      );
    }
  }
});

/* ====================================================================== */
/* M4-P25: `tiphys cutover status`, drain, the schema, the precondition   */
/* and the retirement criteria                                            */
/* ====================================================================== */

const cliEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const schemaPath = join(repoRoot, "schemas", "cutover-state.schema.json");
const shippedInventory = join(repoRoot, "delivery", "plan", "cutover", "retirement-inventory.json");

/**
 * Drive the REAL command line rather than the exported handler.
 *
 * The handler was reachable by import before this phase and the verb was not
 * registered, so a test that only imports proves nothing about whether
 * `tiphys cutover status` runs at all. Spawning `bin/tiphys.ts` is what makes
 * the registration part of the assertion instead of part of the prose.
 */
function runCli(args: string[], cwd: string = repoRoot) {
  return spawnSync(process.execPath, [cliEntry, ...args], { cwd, encoding: "utf8" });
}

/**
 * A sha256 over a whole tree: every path, its entry type, and the bytes of
 * every regular file.
 *
 * CRITERION 7 IS ASSERTED WITH THIS BEFORE AND AFTER EVERY INVOCATION, not
 * once at the end. A single end-of-suite comparison cannot tell which
 * invocation moved something, and a command that wrote and then restored a
 * file would pass it.
 *
 * `.git` IS INCLUDED. The command shells out to `git for-each-ref`, and a
 * digest that excluded the directory git writes into would be blind to
 * precisely the side effect this fixture exists to detect. Measured: stable
 * across repeated invocations, so the inclusion costs no flake.
 */
function treeDigest(root: string): string {
  const hash = createHash("sha256");
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolute = join(directory, entry.name);
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        hash.update(`D ${relative}\n`);
        walk(absolute, `${relative}/`);
        continue;
      }
      if (entry.isSymbolicLink()) {
        hash.update(`L ${relative}\n`);
        continue;
      }
      hash.update(`F ${relative} `);
      hash.update(readFileSync(absolute));
      hash.update("\n");
    }
  };
  walk(root, "");
  return hash.digest("hex");
}

interface TaskFixture {
  id: string;
  status: string;
  turnEnd: boolean;
}

interface StatusFixtureOptions {
  state?: unknown;
  /** How many pushed, unmerged branches the fleet's remote carries. */
  branches?: number;
  /** Live worktree directory names. */
  worktrees?: string[];
  tasks?: TaskFixture[];
  /** The pre-freeze capture: fresh, stale by a year, or absent. */
  ruleset?: "fresh" | "stale" | "absent";
}

interface StatusFixture {
  root: string;
  fleetRoot: string;
  repo: string;
}

const FIXTURE_FLIPPED_AT = "2026-09-15T09:00:00.000Z";

function statusFixture(options: StatusFixtureOptions = {}): StatusFixture {
  const scratch = scratchFleet({ state: options.state, withRemote: true });
  for (let index = 0; index < (options.branches ?? 0); index += 1) {
    const branch = `feature-${String(index)}`;
    git(scratch.fleetRoot, ["checkout", "-q", "-b", branch]);
    writeFileSync(join(scratch.fleetRoot, `${branch}.md`), `# ${branch}\n`);
    git(scratch.fleetRoot, ["add", "-A"]);
    git(scratch.fleetRoot, ["commit", "-q", "-m", branch]);
    git(scratch.fleetRoot, ["push", "-q", "origin", branch]);
    git(scratch.fleetRoot, ["checkout", "-q", "main"]);
  }
  for (const name of options.worktrees ?? []) {
    mkdirSync(join(scratch.fleetRoot, "worktrees", name), { recursive: true });
  }
  for (const task of options.tasks ?? []) {
    const directory = join(scratch.fleetRoot, "tasks", task.id);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "meta.json"), `${JSON.stringify({ status: task.status })}\n`);
    if (task.turnEnd) {
      writeFileSync(join(directory, "turn-end"), "done\n");
    }
  }
  const repo = join(scratch.root, "repo");
  mkdirSync(join(repo, "delivery", "plan", "cutover"), { recursive: true });
  const ruleset = options.ruleset ?? "fresh";
  if (ruleset !== "absent") {
    /* FRESH is after the fixture's flips; STALE is a year before them. The two
       arms differ only in this instant, so nothing else can account for the
       difference in verdict. */
    const capturedAt = ruleset === "fresh" ? "2026-09-16T09:00:00.000Z" : "2025-09-15T09:00:00.000Z";
    writeFileSync(
      join(repo, "delivery", "plan", "cutover", "pre-freeze-ruleset.json"),
      `${JSON.stringify({ kind: "pre-freeze-ruleset", "captured-at": capturedAt, captures: [] }, null, 2)}\n`,
    );
  }
  return { root: scratch.root, fleetRoot: scratch.fleetRoot, repo };
}

/** Run the status command and assert criterion 7 around it in one place. */
function statusRun(fixture: StatusFixture, extra: string[] = []) {
  const before = treeDigest(fixture.fleetRoot);
  const result = runCli(
    ["cutover", "status", "--fleet", fixture.fleetRoot, "--repo", fixture.repo, ...extra],
    fixture.root,
  );
  assert.equal(
    treeDigest(fixture.fleetRoot),
    before,
    `criterion 7: the fleet tree changed across ${["status", ...extra].join(" ")}`,
  );
  return result;
}

function linesOf(text: string): string[] {
  return text.split("\n").filter((line) => line.length > 0);
}

/* -------------------------------------------------------------------- */
/* Criterion 1: the output shape                                         */
/* -------------------------------------------------------------------- */

/**
 * The shape is pinned by the CRITERION, not chosen here: exactly five
 * `SWITCH <name> current|kernel` lines with the five names of plan section
 * 4.3, plus one `DRAIN clean|<n> in flight` line.
 *
 * ASSERTED AS AN EQUALITY, NOT AS A SUBSET. `at least five` would stay green
 * if a sixth appeared, and the five names are a closed list precisely because
 * every rollback trigger enumerates them.
 */
test("cutover status prints exactly five SWITCH lines with the closed name list and one DRAIN line", () => {
  const fixture = statusFixture();
  try {
    const run = statusRun(fixture);
    const lines = linesOf(run.stdout);
    const switches = lines.filter((line) => line.startsWith("SWITCH "));
    assert.deepEqual(
      switches,
      cutover.CUTOVER_SWITCHES.map((name) => `SWITCH ${name} kernel`),
      run.stdout + run.stderr,
    );
    const drain = lines.filter((line) => line.startsWith("DRAIN "));
    assert.deepEqual(drain, ["DRAIN clean"], run.stdout);
    for (const line of switches) {
      assert.match(line, /^SWITCH [a-z-]+ (current|kernel)$/, line);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * Exit 0 needs BOTH halves, and this reddens against the half that is easy to
 * drop. One switch reading `current` with a clean drain must NOT be 0.
 */
test("cutover status exits nonzero while any switch still reads current", () => {
  const partial = frozenState() as { switches: Record<string, Record<string, unknown>> };
  partial.switches["closeout"]["state"] = "current";
  const fixture = statusFixture({ state: partial });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.ok(
      linesOf(run.stdout).includes("SWITCH closeout current"),
      run.stdout,
    );
    assert.ok(linesOf(run.stdout).includes("DRAIN clean"), run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * A fleet with no `cutover.json` at all is the ORIGINAL state, not an error
 * and not an undecidable one: nothing creates the file at init, so its absence
 * means no switch has ever been written.
 */
test("cutover status on a fleet with no cutover.json reports five current switches and exits nonzero", () => {
  const fixture = statusFixture();
  try {
    rmSync(join(fixture.fleetRoot, "cutover.json"));
    const run = statusRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.deepEqual(
      linesOf(run.stdout).filter((line) => line.startsWith("SWITCH ")),
      cutover.CUTOVER_SWITCHES.map((name) => `SWITCH ${name} current`),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------- */
/* Criteria 2 and 3: drain is over IN-FLIGHT WORK, and it is a CLASS     */
/* -------------------------------------------------------------------- */

/**
 * MEMBER A OF THE DANGEROUS STATE, and it is the one that is easy to get
 * backwards. Many pushed unmerged branches, ZERO in-flight items: this must
 * exit 0 and print the branch count on an INFORMATIONAL line.
 *
 * A drain predicate that counted branches would fail exactly here, and that
 * failure is the whole point of the criterion: remote ref deletion is refused
 * in this container and `git push --dry-run` does not probe push
 * authorization at all, so a drain over branches waits forever on an owner
 * action with no local pre-check (M4-D-15).
 */
test("a fleet with many pushed unmerged branches and no in-flight work drains clean and exits 0", () => {
  const fixture = statusFixture({ branches: 7 });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const lines = linesOf(run.stdout);
    assert.ok(lines.includes("DRAIN clean"), run.stdout);
    const branchLines = lines.filter((line) => line.startsWith("BRANCHES "));
    assert.deepEqual(
      branchLines,
      [
        "BRANCHES 7 pushed and unmerged, informational: drain does not count branches (M4-D-15)",
      ],
      run.stdout,
    );
    assert.equal(
      lines.filter((line) => line.startsWith("IN-FLIGHT ")).length,
      0,
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * MEMBER B: one LIVE WORKTREE, zero open tasks. Structurally different from
 * member C below, which is a FILE STATE under `tasks/` and not a directory
 * under `worktrees/`, so the predicate is over a class rather than over one
 * directory.
 */
test("a fleet with one live worktree and no open tasks does not drain and exits nonzero", () => {
  const fixture = statusFixture({ branches: 3, worktrees: ["m4-p99-live"] });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    const lines = linesOf(run.stdout);
    assert.ok(lines.includes("DRAIN 1 in flight"), run.stdout);
    assert.equal(
      lines.filter((line) => line.startsWith("IN-FLIGHT worktree m4-p99-live ")).length,
      1,
      run.stdout,
    );
    /* The branch count is still printed, and still does not vote. */
    assert.ok(
      lines.some((line) => line.startsWith("BRANCHES 3 ")),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * MEMBER C: one OPEN TASK, meta.json present and turn-end absent, zero
 * worktrees. Same verdict as member B, reached through a different kind of
 * evidence.
 */
test("a fleet with one open task and no worktrees does not drain and exits nonzero", () => {
  const fixture = statusFixture({
    tasks: [{ id: "t-open", status: "open", turnEnd: false }],
  });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    const lines = linesOf(run.stdout);
    assert.ok(lines.includes("DRAIN 1 in flight"), run.stdout);
    assert.ok(
      lines.some((line) => line.startsWith("IN-FLIGHT task t-open open with no turn-end")),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE CONTROL ARM for members B and C. The same task with a turn-end file
 * drains clean, so the two tests above redden against the presence of
 * in-flight work rather than against the presence of a `tasks/` entry.
 */
test("a closed task with a turn-end file does not count against drain", () => {
  const fixture = statusFixture({
    tasks: [{ id: "t-done", status: "closed", turnEnd: true }],
  });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.ok(linesOf(run.stdout).includes("DRAIN clean"), run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * The cannot-see block is printed WHATEVER the answer is, including the short
 * one. A command that prints less when it has less to say is
 * indistinguishable from one reporting a quiet system.
 */
test("cutover status prints the cannot-see block on both the clean and the in-flight arm", () => {
  for (const options of [{}, { worktrees: ["live"] }] as StatusFixtureOptions[]) {
    const fixture = statusFixture(options);
    try {
      const run = statusRun(fixture);
      assert.deepEqual(
        linesOf(run.stdout).filter((line) => line.startsWith("CANNOT-SEE ")),
        cutover.CANNOT_SEE.map((entry) => `CANNOT-SEE ${entry}`),
        run.stdout,
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 4: the shipped schema is what refuses the write             */
/* -------------------------------------------------------------------- */

/**
 * The four fields are REQUIRED BY THE SHIPPED DOCUMENT, read off disk rather
 * than restated here.
 *
 * The plan spells them `flipped-at`, `flipped-by`, `reason` and `restore-to`;
 * the document M4-P26 already writes spells them in camelCase, and the schema
 * pins WHAT THE DOCUMENT USES. This test states both spellings so a later
 * reader meets the discrepancy here rather than discovering it.
 */
test("the shipped cutover-state schema requires the four switch-write fields", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const defs = schema["$defs"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(
    [...(defs["switchRecord"]["required"] as string[])].sort(),
    ["flippedAt", "flippedBy", "reason", "restoreTo", "state"],
    "the plan's flipped-at, flipped-by, reason and restore-to, in the spelling the document uses",
  );
  const switches = (schema["properties"] as Record<string, Record<string, unknown>>)["switches"];
  assert.deepEqual(
    [...(switches["required"] as string[])],
    [...cutover.CUTOVER_SWITCHES],
    "the five switch names are the closed list",
  );
  assert.equal(switches["additionalProperties"], false, "a sixth switch name is refused");
});

/**
 * A WRITE MISSING `restoreTo` IS REFUSED AND NOTHING IS WRITTEN, and the
 * refusal comes from the SCHEMA.
 *
 * The second half is what the criterion is really about. A check written into
 * the command binds that command and nothing else, and the writer rollback
 * depends on is a LATER one: `targetFor` reads the recorded value rather than
 * reconstructing an intent, so a record written without one is a switch that
 * can never be rolled back. The witness spec for this behaviour reddens it by
 * deleting `restoreTo` from the schema's own `required` array, which is the
 * mutation that distinguishes the two.
 */
test("a switch write missing restoreTo is refused and the destination is byte-identical", () => {
  const directory = mkdtempSync(join(tmpdir(), "tiphys-cutover-schema-"));
  try {
    const destination = join(directory, "cutover.json");
    const good = frozenState() as Record<string, unknown>;
    cutover.publishCutoverState(destination, good);
    const before = readFileSync(destination);

    const bad = frozenState() as { switches: Record<string, Record<string, unknown>> };
    delete bad.switches["closeout"]["restoreTo"];
    assert.throws(
      () => {
        cutover.publishCutoverState(destination, bad as unknown as Record<string, unknown>);
      },
      /NOTHING was written[\s\S]*restoreTo/,
      "the refusal must name the field and say that nothing was written",
    );
    assert.ok(
      readFileSync(destination).equals(before),
      "criterion 4: the destination must be byte-identical after a refused write",
    );
    /* And no temporary file was left behind, so a refusal leaves the directory
       as it was and not merely the destination. */
    assert.deepEqual(readdirSync(directory).sort(), ["cutover.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * The refusal is the SCHEMA's, demonstrated by defanging the schema rather
 * than by reading the code. With `restoreTo` removed from `required`, the same
 * document validates; with it present, it does not.
 */
test("the cutover-state schema is what rejects a record missing restoreTo", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const bad = frozenState() as { switches: Record<string, Record<string, unknown>> };
  delete bad.switches["closeout"]["restoreTo"];
  assert.deepEqual(
    validateModule.validateToLines(schema, bad),
    ["INVALID #/switches/closeout/restoreTo required property restoreTo is missing"],
  );
  const defanged = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const defs = defanged["$defs"] as Record<string, Record<string, unknown>>;
  defs["switchRecord"]["required"] = (defs["switchRecord"]["required"] as string[]).filter(
    (name) => name !== "restoreTo",
  );
  assert.deepEqual(
    validateModule.validateToLines(defanged, bad),
    [],
    "with the requirement removed the document is accepted, so the requirement is what refused it",
  );
});

/**
 * The document stays EXTENSIBLE, which is not a detail: M4-P26 registered a
 * rollback that carries keys it does not own, at the document level and inside
 * a switch record, and a schema that closed either level would make the
 * shipped writer refuse its own preserved keys.
 */
test("the cutover-state schema accepts carried keys at the document and record levels", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const document = frozenState() as {
    switches: Record<string, Record<string, unknown>>;
  } & Record<string, unknown>;
  document["schemaVersion"] = 3;
  document["switches"]["planning-and-scope"]["ticket"] = "A-9";
  assert.deepEqual(validateModule.validateToLines(schema, document), []);
  const sixth = frozenState() as { switches: Record<string, unknown> };
  sixth.switches["a-sixth-switch"] = { state: "kernel" };
  assert.deepEqual(
    validateModule.validateToLines(schema, sixth),
    ["INVALID #/switches/a-sixth-switch property a-sixth-switch is not permitted here"],
    "the switch NAME list is the half that is closed",
  );
});

/* -------------------------------------------------------------------- */
/* Criterion 5: the pre-freeze precondition, two arms                    */
/* -------------------------------------------------------------------- */

/**
 * ARM ONE, ABSENT. Delete the capture and every switch reading `kernel`
 * reports a refusal naming itself.
 */
test("no switch may report kernel while the pre-freeze ruleset is absent", () => {
  const fixture = statusFixture({ ruleset: "absent" });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const refusals = linesOf(run.stdout).filter((line) => line.startsWith("REFUSED "));
    assert.deepEqual(
      refusals.map((line) => line.split(" ")[1]),
      [...cutover.CUTOVER_SWITCHES],
      "one refusal per switch that reports kernel",
    );
    for (const line of refusals) {
      assert.match(line, /reports kernel but delivery\/plan\/cutover\/pre-freeze-ruleset\.json is absent/, line);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * ARM TWO, STALE, and it is structurally different: the file is PRESENT and
 * readable, and the fault is a comparison rather than an absence. An
 * existence check passes this arm, which is why both are witnessed.
 */
test("no switch may report kernel while the pre-freeze ruleset is older than the newest switch write", () => {
  const fixture = statusFixture({ ruleset: "stale" });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const refusals = linesOf(run.stdout).filter((line) => line.startsWith("REFUSED "));
    assert.equal(refusals.length, cutover.CUTOVER_SWITCHES.length, run.stdout);
    for (const line of refusals) {
      assert.match(line, /is older than the most recent switch write/, line);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE CONTROL ARM. A capture newer than the newest switch write satisfies the
 * precondition, so the two refusals above redden against the comparison and
 * not against the guard being unconditional.
 */
test("a pre-freeze capture newer than every switch write satisfies the precondition", () => {
  const fixture = statusFixture({ ruleset: "fresh" });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(
      linesOf(run.stdout).filter((line) => line.startsWith("REFUSED ")).length,
      0,
      run.stdout,
    );
    assert.ok(
      linesOf(run.stdout).some((line) => line.startsWith("PRE-FREEZE captured 2026-09-16T09:00:00.000Z ")),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * With no switch reading `kernel` there is no freeze to have captured, so the
 * precondition is NOT-REQUIRED rather than satisfied or refused. The three
 * states are distinguishable in the output, which is what stops a reader
 * treating an unfrozen fleet as a verified one.
 */
test("the pre-freeze precondition is not-required while every switch reads current", () => {
  const unflipped = frozenState() as { switches: Record<string, Record<string, unknown>> };
  for (const name of cutover.CUTOVER_SWITCHES) {
    unflipped.switches[name]["state"] = "current";
  }
  const fixture = statusFixture({ state: unflipped, ruleset: "absent" });
  try {
    const run = statusRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.equal(
      linesOf(run.stdout).filter((line) => line.startsWith("REFUSED ")).length,
      0,
      run.stdout,
    );
    assert.ok(
      linesOf(run.stdout).some((line) => line.startsWith("PRE-FREEZE not-required ")),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * FAIL CLOSED ON AN UNREADABLE CAPTURE. A document with no `captured-at`
 * cannot be compared with anything, and treating it as satisfied would make a
 * malformed capture indistinguishable from a good one.
 */
test("a pre-freeze capture with no captured-at refuses rather than passing", () => {
  const fixture = statusFixture({ ruleset: "fresh" });
  try {
    writeFileSync(
      join(fixture.repo, "delivery", "plan", "cutover", "pre-freeze-ruleset.json"),
      `${JSON.stringify({ kind: "pre-freeze-ruleset", captures: [] }, null, 2)}\n`,
    );
    const run = statusRun(fixture);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.ok(
      linesOf(run.stdout).some((line) => line.includes("records no captured-at")),
      run.stdout,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE SHIPPED CAPTURE IS REAL, and this asserts the properties that make it
 * usable rather than its contents: it parses, it carries a `captured-at` the
 * guard can read, it records at least one response that SUCCEEDED, and it
 * names what it could NOT capture. The last is the honest half: three
 * endpoints were refused and the file says so.
 */
test("the shipped pre-freeze capture parses, dates itself, and names what it could not capture", () => {
  const path = join(repoRoot, cutover.PRE_FREEZE_RULESET_PATH);
  const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  assert.ok(
    !Number.isNaN(Date.parse(document["captured-at"] as string)),
    "captured-at must parse as an instant, because the guard compares it",
  );
  const captures = document["captures"] as { endpoint: string; status: number }[];
  assert.ok(captures.length > 0, "a capture with no successful response captures nothing");
  for (const capture of captures) {
    assert.equal(capture.status, 200, capture.endpoint);
  }
  const notCaptured = document["not-captured"] as { endpoint: string; status: number }[];
  assert.ok(
    notCaptured.length > 0,
    "an empty not-captured list would claim complete coverage of an API this container cannot fully read",
  );
  for (const refused of notCaptured) {
    assert.notEqual(refused.status, 200, refused.endpoint);
  }
});

/* -------------------------------------------------------------------- */
/* Criterion 6: the retirement verdict, and the vacuous one it refuses   */
/* -------------------------------------------------------------------- */

interface InventoryRowFixture {
  id: string;
  disposition: string;
  destination?: string;
  command?: string;
  exit?: number;
}

function inventoryFixture(rows: InventoryRowFixture[]): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "tiphys-retire-"));
  writeFileSync(join(root, "present.md"), "the rule, ported\n");
  const document = {
    rows: rows.map((row) => {
      const out: Record<string, unknown> = { id: row.id, disposition: row.disposition };
      if (row.destination !== undefined) out["destination"] = row.destination;
      if (row.command !== undefined) {
        out["negative-witness"] = { kind: "sibling", command: row.command, exit: row.exit ?? 1 };
      }
      return out;
    }),
  };
  const path = join(root, "inventory.json");
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return { root, path };
}

function retirementRun(fixture: { root: string; path: string }) {
  const before = treeDigest(fixture.root);
  const run = runCli(
    ["cutover", "status", "--retirement", "--repo", fixture.root, "--inventory", fixture.path],
    fixture.root,
  );
  assert.equal(treeDigest(fixture.root), before, "criterion 7: --retirement changed the tree");
  return run;
}

/**
 * THE VACUOUS VERDICT, WHICH IS WHAT THIS CRITERION EXISTS AGAINST. The named
 * kernel artifact EXISTS, so a verdict derived from existence alone reports
 * `ported`. Its negative witness exits 0, which means the probe discriminates
 * nothing under the new artifact, so the real verdict is `unported`.
 */
test("a PORT row whose destination exists but whose negative witness exits 0 is unported", () => {
  const fixture = inventoryFixture([
    { id: "vacuous", disposition: "PORT", destination: "present.md", command: "test -f present.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.match(run.stdout, /^PORT vacuous unported .*WEAKER/m, run.stdout);
    assert.match(run.stdout, /^RETIREMENT 1 of 1 PORT row\(s\) unported$/m, run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE CONTROL. The same row with a witness that is genuinely RED under the new
 * artifact is `ported` and exits 0, so the test above reddens against the
 * witness's verdict and not against the row being present.
 */
test("a PORT row whose destination exists and whose negative witness is red is ported", () => {
  const fixture = inventoryFixture([
    { id: "real", disposition: "PORT", destination: "present.md", command: "grep -c absent-token present.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /^PORT real ported /m, run.stdout);
    assert.match(run.stdout, /^RETIREMENT complete 1 PORT row\(s\)$/m, run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * MEMBER B of the same class, structurally different: the witness is red and
 * the ARTIFACT is missing. Both halves are required, so failing either is
 * `unported`, and the two members fail different halves.
 */
test("a PORT row whose destination does not exist is unported however red its witness", () => {
  const fixture = inventoryFixture([
    { id: "no-artifact", disposition: "PORT", destination: "gone.md", command: "grep -c absent-token present.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.match(run.stdout, /^PORT no-artifact unported destination gone\.md does not exist as a file$/m, run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE VACUOUS RED, one level below the vacuous green. A `grep` against a file
 * that is not there exits 2 because it could not search, not because it
 * searched and found nothing. Accepting any nonzero status reports the row as
 * ported on the strength of an error message, so the row's own recorded exit
 * is required to match.
 */
test("a negative witness that errors instead of searching is unported even though it exits nonzero", () => {
  const fixture = inventoryFixture([
    { id: "errored", disposition: "PORT", destination: "present.md", command: "grep -c token absent-file.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.match(run.stdout, /^PORT errored unported negative witness exits 2 .*recorded 1/m, run.stdout);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * The rows are DATA FROM A FILE and the command must not run whatever they
 * say. A command whose executable position is not on the allowlist is refused
 * and NOT SPAWNED, which is asserted by the side effect the command would have
 * had if it had run.
 */
test("a retirement row whose command is not on the allowlist is refused without being run", () => {
  const fixture = inventoryFixture([
    { id: "unscreened", disposition: "PORT", destination: "present.md", command: "rm -rf present.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 3, run.stdout + run.stderr);
    assert.match(run.stdout, /^PORT unscreened unported .*not on the allowlist/m, run.stdout);
    assert.ok(existsSync(join(fixture.root, "present.md")), "the refused command must not have run");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * KEEP and DELETE rows are not retirements that can be incomplete, so they
 * are not printed; a row whose disposition is OUTSIDE the closed vocabulary is
 * not silently treated as one of them.
 */
test("retirement prints one line per PORT row and refuses a row with an unreadable disposition", () => {
  const fixture = inventoryFixture([
    { id: "kept", disposition: "KEEP" },
    { id: "dropped", disposition: "DELETE" },
    { id: "typo", disposition: "PROT" },
    { id: "real", disposition: "PORT", destination: "present.md", command: "grep -c absent-token present.md", exit: 1 },
  ]);
  try {
    const run = retirementRun(fixture);
    const rows = linesOf(run.stdout).filter((line) => line.startsWith("PORT "));
    assert.deepEqual(
      rows.map((line) => line.split(" ")[1]),
      ["typo", "real"],
      run.stdout,
    );
    assert.match(run.stdout, /^PORT typo unported disposition "PROT" is not one of/m, run.stdout);
    assert.equal(run.status, 3, run.stdout + run.stderr);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * An inventory with no PORT rows is not a complete retirement. `unported === 0`
 * over an empty list is the vacuous green one level up from the row verdict.
 */
test("an inventory with no PORT rows refuses rather than reporting a complete retirement", () => {
  const fixture = inventoryFixture([{ id: "kept", disposition: "KEEP" }]);
  try {
    const run = retirementRun(fixture);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stderr, /holds no PORT rows/, run.stderr);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

/**
 * THE ADAPTER IS LOAD-BEARING AND THIS IS WHY IT EXISTS. `RetirementRow`
 * declares `negativeWitness` as an argv array; the shipped inventory writes
 * `negative-witness` as an object carrying a shell string. Handing the shipped
 * row STRAIGHT to `evaluatePortRow` returns `unported` for a row that is in
 * fact ported, which is a finding about a key spelling wearing the costume of
 * a finding about the kernel.
 */
test("a shipped inventory row is unported without the adapter and ported with it", () => {
  const raw = (
    JSON.parse(readFileSync(shippedInventory, "utf8")) as { rows: Record<string, unknown>[] }
  ).rows.find((row) => row["disposition"] === "PORT");
  assert.ok(raw !== undefined, "the shipped inventory must carry at least one PORT row");
  const direct = cutover.evaluatePortRow(raw as never, repoRoot);
  assert.equal(direct.verdict, "unported", JSON.stringify(direct));
  assert.match(direct.reason, /carries no negative-witness command/);
  const adapted = cutover.retirementRowFromDocument(raw);
  assert.equal(adapted.kind, "row", JSON.stringify(adapted));
  const viaAdapter = cutover.evaluatePortRow(
    (adapted as { kind: "row"; row: never }).row,
    repoRoot,
  );
  assert.equal(viaAdapter.verdict, "ported", JSON.stringify(viaAdapter));
});

/**
 * THE ALLOWLIST MUST NOT DRIFT from the one the inventory's own checker
 * applies to the same rows. The kernel cannot import that script (it is this
 * project's own predicate and is KEPT rather than shipped, DR-0029), so the
 * two lists are compared here instead of being assumed equal.
 */
test("the retirement command allowlist is no wider than the inventory checker's", () => {
  const checker = readFileSync(
    join(repoRoot, "scripts", "check-retirement-inventory.mjs"),
    "utf8",
  );
  const block = /export const ALLOWED_FIRST_TOKENS = new Set\(\[([\s\S]*?)\]\)/.exec(checker);
  assert.ok(block !== null, "the checker's allowlist could not be located");
  const theirs = new Set(
    [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1] as string),
  );
  const ours = [...cutover.RETIREMENT_COMMAND_TOKENS];
  assert.deepEqual(
    ours.filter((token) => !theirs.has(token)),
    [],
    "a token the kernel allows and the checker does not is a screen that drifted open",
  );
  assert.ok(ours.length > 0, "an empty allowlist screens nothing");
});

/**
 * THE REAL INVENTORY, not a fixture. Criterion 6 is about the M4-P23 rows, and
 * a command exercised only against fixtures is a command nobody has pointed at
 * the document it exists for.
 */
test("the shipped retirement inventory evaluates every PORT row and reports a verdict for each", () => {
  const rows = (
    JSON.parse(readFileSync(shippedInventory, "utf8")) as { rows: Record<string, unknown>[] }
  ).rows.filter((row) => row["disposition"] === "PORT");
  const read = cutover.evaluateRetirementInventory(shippedInventory, repoRoot);
  assert.equal(read.kind, "read", JSON.stringify(read));
  const report = (read as { kind: "read"; report: { results: unknown[]; unported: number } }).report;
  /* DERIVED FROM THE DOCUMENT, NEVER PINNED. The inventory is append-only and a
     literal count here would be a claim about every later phase. */
  assert.equal(report.results.length, rows.length, "one verdict per PORT row");
  assert.ok(rows.length > 0, "the shipped inventory must carry PORT rows");
});

/* -------------------------------------------------------------------- */
/* Registration, usage and criterion 8                                   */
/* -------------------------------------------------------------------- */

test("the cutover verb is registered in the CLI and its usage names status", () => {
  const usage = runCli(["cutover"]);
  assert.equal(usage.status, 64, usage.stdout + usage.stderr);
  assert.match(usage.stderr, /tiphys cutover status --fleet/, usage.stderr);
  const top = runCli(["nonsense-verb"]);
  assert.match(top.stderr, /cutover/, "the top-level usage line must list the verb");
});

test("cutover status without --fleet is a usage error and not a refusal", () => {
  const run = runCli(["cutover", "status"]);
  assert.equal(run.status, 64, run.stdout + run.stderr);
  assert.match(run.stderr, /--fleet is required/, run.stderr);
});

/**
 * THE TYPE ROW, NOT ONLY THE SCHEMA FILE. M3R-001 says a phase that ships a
 * schema registers its `--type` row in the same step, so that a type whose
 * schema ships but which `--type` cannot name is not a state this command can
 * be in. This asserts the row by USING it, and asserts both arms so that a row
 * pointing at the wrong document is red rather than merely unexercised.
 */
test("tiphys validate --type cutover-state accepts a good state and names a missing restoreTo", () => {
  const directory = mkdtempSync(join(tmpdir(), "tiphys-cutover-validate-"));
  try {
    const good = join(directory, "good.json");
    writeFileSync(good, `${JSON.stringify(frozenState(), null, 2)}\n`);
    const accepted = runCli(["validate", "--type", "cutover-state", good]);
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);

    const document = frozenState() as { switches: Record<string, Record<string, unknown>> };
    delete document.switches["closeout"]["restoreTo"];
    const bad = join(directory, "bad.json");
    writeFileSync(bad, `${JSON.stringify(document, null, 2)}\n`);
    const refused = runCli(["validate", "--type", "cutover-state", bad]);
    assert.equal(refused.status, 1, refused.stdout + refused.stderr);
    assert.match(
      refused.stdout + refused.stderr,
      /INVALID #\/switches\/closeout\/restoreTo required property restoreTo is missing/,
      refused.stdout + refused.stderr,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
