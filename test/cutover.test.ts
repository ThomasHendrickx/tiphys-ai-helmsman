import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

test("cutover rollback refuses freeze-point-restore as a single command", () => {
  const scratch = scratchFleet();
  try {
    const status = commandModule.cmdCutover([
      "rollback",
      "--trigger",
      "freeze-point-restore",
      "--fleet",
      scratch.fleetRoot,
    ]);
    assert.equal(status, 1);
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
    "cutover-document-carries-three-triggers",
    "cutover-document-every-step-has-command-and-observation",
    "cutover-document-names-unrehearsable-steps",
    "cutover-document-states-what-is-not-covered",
    "cutover-document-file-half-cheap-authority-half-owner",
    "cutover-document-five-switches-flip-and-verify",
    "cutover-document-pilot-as-second-subject",
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
