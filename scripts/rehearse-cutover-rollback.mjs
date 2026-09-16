#!/usr/bin/env node
/**
 * Rehearse the cutover rollback procedure (kernel plan M4, M4-P26).
 *
 * usage:
 *   node scripts/rehearse-cutover-rollback.mjs --trigger drain-reversal
 *   node scripts/rehearse-cutover-rollback.mjs --trigger retirement-unmet [--port]
 *   node scripts/rehearse-cutover-rollback.mjs --trigger freeze-point-restore
 *
 * exit codes:
 *   0  the rehearsal ran and every asserted observation held
 *   1  the rehearsal ran and an observation did not hold
 *   2  usage error
 *   3  REFUSED: this trigger has a step that cannot be rehearsed
 *   4  the script's own assertion helper does not discriminate (see selfCheck)
 *
 * WHY 3 IS ITS OWN CODE. A rehearsal that silently skipped an unrehearsable
 * step, and exited 0 on the steps around it, would be the exact shape
 * delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:42
 * records: four dry runs exited 0 and the real publish was refused, because
 * the dry run does not perform the registry-side comparison. A distinct code
 * makes "we did not rehearse this" impossible to read as "we rehearsed this
 * and it passed".
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL("../", import.meta.url);
const cutover = await import(new URL("src/cutover.ts", here).href);
const command = await import(new URL("src/commands/cutover.ts", here).href);

const FLEET_DIRS = ["charter", "decisions", "state", "tasks", "worktrees", "projects"];

function fail(message) {
  process.stderr.write(`rehearse-cutover-rollback: ${message}\n`);
  return 1;
}

function observe(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  process.stdout.write(
    `${ok ? "OBSERVED" : "MISMATCH"} ${label}: got ${JSON.stringify(actual)}` +
      (ok ? "" : `, wanted ${JSON.stringify(expected)}`) +
      "\n",
  );
  return ok;
}

/**
 * THE GUARD ON THE GUARD, and it exists because the gap was MEASURED rather
 * than imagined.
 *
 * Every arm below decides what it decides through `observe`. An `observe` that
 * agrees with everything makes every `OBSERVED` line in this script
 * meaningless, and the script still exits 0. That was measured on 2026-09-16:
 * with `const ok = true` substituted into `observe`, ALL FOUR rehearsal tests
 * stayed green and the suite noticed nothing. That is the shape T-008's
 * postscript names, a guard that cannot go red, inside the rehearsal this
 * phase ships.
 *
 * So the first thing every run does is put a pair that DISAGREES through
 * `observe` itself, and read what comes back. It goes through `observe` and
 * not through a private comparator on purpose: a check that bypassed `observe`
 * would be green against exactly the substitution that was measured.
 *
 * The two probe lines are captured rather than printed, so an arm's output
 * stays clean and a reader cannot mistake the deliberate MISMATCH for a real
 * one.
 */
function selfCheck() {
  const captured = [];
  const realWrite = process.stdout.write.bind(process.stdout);
  let disagreed;
  let agreed;
  process.stdout.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  try {
    disagreed = observe("probe with a deliberately wrong pair", 1, 2);
    agreed = observe("probe with a matching pair", 1, 1);
  } finally {
    process.stdout.write = realWrite;
  }
  const text = captured.join("");
  if (disagreed !== false || agreed !== true || !text.includes("MISMATCH")) {
    process.stderr.write(
      "SELF-CHECK FAILED: observe() does not discriminate, so every OBSERVED " +
        "line this script would print is meaningless\n",
    );
    return 4;
  }
  process.stdout.write(
    "SELF-CHECK OK: observe() discriminates, so the OBSERVED lines below mean something\n",
  );
  return 0;
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "rehearsal",
      GIT_AUTHOR_EMAIL: "rehearsal@localhost",
      GIT_COMMITTER_NAME: "rehearsal",
      GIT_COMMITTER_EMAIL: "rehearsal@localhost",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/* -------------------------------------------------------------------- */
/* Trigger 1: drain reversal, rehearsed FULLY                            */
/* -------------------------------------------------------------------- */

function frozenState(flippedAt) {
  const switches = {};
  for (const name of cutover.CUTOVER_SWITCHES) {
    switches[name] = {
      state: "kernel",
      flippedAt,
      flippedBy: "rehearsal fixture",
      reason: "cutover entered",
      restoreTo: "current",
    };
  }
  return { switches };
}

/**
 * Build a scratch fleet carrying TWO STRUCTURALLY DIFFERENT in-flight items
 * plus three items that must NOT count. The negatives are the half that makes
 * this a witness rather than a demonstration: a predicate that returns "in
 * flight" for everything is green on the positives alone.
 */
function buildScratchFleet() {
  const root = mkdtempSync(join(tmpdir(), "tiphys-rollback-rehearsal-"));
  const fleetRoot = join(root, "fleet");
  const bare = join(root, "fleet.git");
  mkdirSync(fleetRoot, { recursive: true });
  for (const dir of FLEET_DIRS) {
    mkdirSync(join(fleetRoot, dir), { recursive: true });
  }
  writeFileSync(join(fleetRoot, "backlog.md"), "# backlog\n");
  writeFileSync(join(fleetRoot, "package.json"), '{ "name": "scratch-fleet" }\n');
  /* state/, worktrees/ and projects/ are gitignored in a real fleet home, and
     the rehearsal keeps that so the push carries what a push really carries. */
  writeFileSync(join(fleetRoot, ".gitignore"), "state/\nworktrees/\nprojects/\n");
  writeFileSync(join(fleetRoot, "cutover.json"), `${JSON.stringify(frozenState("2026-09-15T09:00:00.000Z"), null, 2)}\n`);

  /* IN FLIGHT, member A: a live worktree. A DIRECTORY on disk, never a pid. */
  mkdirSync(join(fleetRoot, "worktrees", "wt-alpha"), { recursive: true });
  writeFileSync(join(fleetRoot, "worktrees", "wt-alpha", "notes.txt"), "half-done work\n");

  /* IN FLIGHT, member B: an open task with no turn-end. A FILE STATE. */
  mkdirSync(join(fleetRoot, "tasks", "task-beta"), { recursive: true });
  writeFileSync(
    join(fleetRoot, "tasks", "task-beta", "meta.json"),
    `${JSON.stringify({ id: "task-beta", shape: "ship", status: "open" }, null, 2)}\n`,
  );

  /* NOT in flight: open but finished (turn-end present). */
  mkdirSync(join(fleetRoot, "tasks", "task-done"), { recursive: true });
  writeFileSync(
    join(fleetRoot, "tasks", "task-done", "meta.json"),
    `${JSON.stringify({ id: "task-done", shape: "ship", status: "open" }, null, 2)}\n`,
  );
  writeFileSync(join(fleetRoot, "tasks", "task-done", "turn-end"), '{"exitCode":0}\n');

  /* NOT in flight: closed. */
  mkdirSync(join(fleetRoot, "tasks", "task-closed"), { recursive: true });
  writeFileSync(
    join(fleetRoot, "tasks", "task-closed", "meta.json"),
    `${JSON.stringify({ id: "task-closed", shape: "ship", status: "closed" }, null, 2)}\n`,
  );

  git(root, ["init", "-q", "--bare", bare]);
  git(fleetRoot, ["init", "-q", "-b", "main"]);
  git(fleetRoot, ["add", "-A"]);
  git(fleetRoot, ["commit", "-q", "-m", "scratch fleet"]);
  git(fleetRoot, ["remote", "add", "origin", bare]);
  git(fleetRoot, ["push", "-q", "origin", "HEAD:refs/heads/main"]);

  /* NOT in flight, and this is the one the definition turns on: PUSHED
     UNMERGED BRANCHES. Drain must stay clean over these, because this
     container cannot delete a remote ref and a delete dry-run exits 0 either
     way, so counting branches makes cutover wait on an owner action forever. */
  for (const branch of ["stale-one", "stale-two", "stale-three"]) {
    git(fleetRoot, ["push", "-q", "origin", `HEAD:refs/heads/${branch}`]);
  }
  return { root, fleetRoot, bare };
}

function loadFleetAccessors(fleetRoot) {
  return {
    root: fleetRoot,
    charterDir: join(fleetRoot, "charter"),
    decisionsDir: join(fleetRoot, "decisions"),
    stateDir: join(fleetRoot, "state"),
    tasksDir: join(fleetRoot, "tasks"),
    worktreesDir: join(fleetRoot, "worktrees"),
    projectsDir: join(fleetRoot, "projects"),
    backlogPath: join(fleetRoot, "backlog.md"),
    packageJsonPath: join(fleetRoot, "package.json"),
    gitignorePath: join(fleetRoot, ".gitignore"),
    lockPath: join(fleetRoot, "state", "orchestrator.lock"),
    beaconPath: join(fleetRoot, "state", "watcher.beacon"),
  };
}

function rehearseDrainReversal(keep) {
  const { root, fleetRoot, bare } = buildScratchFleet();
  const fleet = loadFleetAccessors(fleetRoot);
  let ok = true;
  try {
    process.stdout.write("TRIGGER 1: drain reversal, rehearsed FULLY\n");

    /* STEP 2's enumeration, taken BEFORE the flip so the list survives a
       failure of step 1. Observation: exactly the two structurally different
       members, and none of the three negatives. */
    const before = cutover.inFlightItems(fleet);
    ok = observe("step 2 in-flight ids", before.map((item) => `${item.kind}/${item.id}`), [
      "task/task-beta",
      "worktree/wt-alpha",
    ]) && ok;

    const branches = git(fleetRoot, ["ls-remote", "--heads", bare]).stdout
      .split("\n")
      .filter((line) => line.trim().length > 0).length;
    ok = observe("pushed branches present and NOT counted as drain", branches, 4) && ok;

    /* STEP 1: the atomic flip plus the push. */
    const status = command.cmdCutover([
      "rollback",
      "--trigger",
      "drain-reversal",
      "--fleet",
      fleetRoot,
      "--reason",
      "rehearsal",
    ]);
    ok = observe("step 1 exit code", status, 0) && ok;
    const afterFlip = cutover.readCutoverState(fleet);
    ok = observe("step 1 read kind", afterFlip.kind, "read") && ok;
    if (afterFlip.kind === "read") {
      ok =
        observe(
          "step 1 switch states",
          cutover.CUTOVER_SWITCHES.map((name) => afterFlip.state.switches[name].state),
          ["current", "current", "current", "current", "current"],
        ) && ok;
    }
    const remoteHead = git(fleetRoot, ["rev-parse", "origin/main"]).stdout.trim();
    const localHead = git(fleetRoot, ["rev-parse", "HEAD"]).stdout.trim();
    ok = observe("step 1 push landed", remoteHead === localHead, true) && ok;

    /* STEPS 3 and 4, in the only form this rehearsal can honestly perform.
       The real step 3 is `tiphys teardown --task <id> --salvage` and the real
       step 4 is the agent-salvage procedure; neither is invoked here, and the
       reason is printed rather than left to be inferred. What IS exercised is
       the property both steps exist to produce: the leavings become
       recoverable and the item stops being in flight. */
    process.stdout.write(
      "NOT-INVOKED step 3 tiphys teardown --task <id> --salvage: the pool record it " +
        "consumes belongs to another phase, so this rehearsal performs the salvage " +
        "EFFECT (commit the leavings, then remove the worktree) and not the command\n",
    );
    process.stdout.write(
      "NOT-INVOKED step 4 agent-salvage: it is a process artifact executed by a human " +
        "or an agent, not a command this script can call\n",
    );
    mkdirSync(join(fleetRoot, "tasks", "task-beta", "salvage"), { recursive: true });
    writeFileSync(
      join(fleetRoot, "tasks", "task-beta", "salvage", "notes.txt"),
      "half-done work\n",
    );
    rmSync(join(fleetRoot, "worktrees", "wt-alpha"), { recursive: true, force: true });
    writeFileSync(
      join(fleetRoot, "tasks", "task-beta", "turn-end"),
      '{"exitCode":null,"note":"salvaged under drain reversal"}\n',
    );
    git(fleetRoot, ["add", "-A"]);
    git(fleetRoot, ["commit", "-q", "-m", "salvage under drain reversal"]);
    const push = git(fleetRoot, ["push", "-q", "origin", "HEAD:refs/heads/main"]);
    ok = observe("steps 3 and 4 salvage push exit code", push.status, 0) && ok;

    /* STEP 5: the rolled-back state is five `current` switches and a clean
       DRAIN line. */
    const finalState = cutover.readCutoverState(fleet);
    const finalInFlight = cutover.inFlightItems(fleet);
    ok =
      observe(
        "step 5 switches",
        finalState.kind === "read"
          ? cutover.CUTOVER_SWITCHES.map((name) => finalState.state.switches[name].state)
          : finalState.kind,
        ["current", "current", "current", "current", "current"],
      ) && ok;
    ok = observe("step 5 drain", finalInFlight.length, 0) && ok;
    for (const line of cutover.CANNOT_SEE) {
      process.stdout.write(`CANNOT-SEE ${line}\n`);
    }
  } finally {
    if (keep) {
      process.stdout.write(`KEPT ${root}\n`);
    } else {
      rmSync(root, { recursive: true, force: true });
    }
  }
  return ok ? 0 : 1;
}

/* -------------------------------------------------------------------- */
/* Trigger 3: retirement criteria unmet, steps 1 to 3                    */
/* -------------------------------------------------------------------- */

/**
 * Both checkers are REAL programs run against a REAL violating fixture. The
 * weak one does not catch the violation and exits 0; the strong one catches it
 * and exits 1. Nothing here is a stub exiting with a chosen constant, because
 * a witness whose verdict is written into the witness proves nothing.
 */
const WEAK_CHECKER = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
const body = readFileSync(process.argv[2], "utf8");
/* Checks only that the file is non-empty. A violation slips straight past. */
process.exit(body.length > 0 ? 0 : 1);
`;

const STRONG_CHECKER = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
const body = readFileSync(process.argv[2], "utf8");
/* Catches the thing the retired rule caught: a bare path with no line number. */
const bare = body.match(/(?<![\`:\\w])[\\w./-]+\\.md(?![:\\w])/g) ?? [];
if (bare.length > 0) {
  process.stderr.write("bare path with no line number: " + bare.join(", ") + "\\n");
  process.exit(1);
}
process.exit(0);
`;

function buildRetirementFixture(ported) {
  const root = mkdtempSync(join(tmpdir(), "tiphys-retirement-fixture-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "fixtures"), { recursive: true });
  writeFileSync(
    join(root, "fixtures", "violating.md"),
    "see delivery/plan/kernel-plan-v1.md for the rule\n",
  );
  writeFileSync(join(root, "scripts", "check-citations.mjs"), ported ? STRONG_CHECKER : WEAK_CHECKER);
  chmodSync(join(root, "scripts", "check-citations.mjs"), 0o755);
  writeFileSync(join(root, "scripts", "check-shape.mjs"), STRONG_CHECKER);
  chmodSync(join(root, "scripts", "check-shape.mjs"), 0o755);
  const inventory = {
    rows: [
      {
        id: "R-CIT",
        disposition: "PORT",
        destination: "scripts/check-citations.mjs",
        negativeWitness: [process.execPath, "scripts/check-citations.mjs", "fixtures/violating.md"],
      },
      {
        id: "R-SHAPE",
        disposition: "PORT",
        destination: "scripts/check-shape.mjs",
        negativeWitness: [process.execPath, "scripts/check-shape.mjs", "fixtures/violating.md"],
      },
      { id: "R-KEEP", disposition: "KEEP" },
      { id: "R-GONE", disposition: "DELETE" },
      /* R-MISSING is the OTHER half of trigger 3 step 2. In the failing arm it
         is a PORT row whose destination was never written, which is an absent
         destination rather than a weak one: two structurally different ways to
         be unported. In the repaired arm the choice taken is the second one
         step 2 offers, REVERT THE RETIREMENT, so the row becomes a KEEP and
         the source artifact stays. It is not quietly dropped. */
      ported
        ? {
            id: "R-MISSING",
            disposition: "KEEP",
            reason: "retirement reverted under trigger 3 step 2; the source artifact stays",
          }
        : {
            id: "R-MISSING",
            disposition: "PORT",
            destination: "scripts/check-absent.mjs",
            negativeWitness: [
              process.execPath,
              "scripts/check-absent.mjs",
              "fixtures/violating.md",
            ],
          },
    ],
  };
  writeFileSync(join(root, "retirement-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  return root;
}

function rehearseRetirement(ported, keep) {
  const root = buildRetirementFixture(ported);
  let ok = true;
  let exitCode = 0;
  try {
    process.stdout.write(
      `TRIGGER 3: retirement criteria unmet, steps 1 to 3, ported=${String(ported)}\n`,
    );
    const read = cutover.readRetirementInventory(join(root, "retirement-inventory.json"));
    if (read.kind !== "read") {
      return fail(`fixture inventory unreadable: ${read.kind}`);
    }
    /* STEP 1: list the failing rows by id. */
    const results = read.rows.map((row) => cutover.evaluatePortRow(row, root));
    for (const result of results) {
      process.stdout.write(`PORT ${result.id} ${result.verdict} ${result.reason}\n`);
    }
    const unported = results.filter((result) => result.verdict === "unported").map((r) => r.id);
    /* STEP 3 is what decides R-CIT: its destination EXISTS in both arms, and
       only the negative witness separates them. A verdict derived from the
       file existing would call both arms ported. */
    if (ported) {
      ok = observe("step 1 unported ids", unported, []) && ok;
      ok =
        observe(
          "step 3 R-CIT verdict once the destination is no longer weaker",
          results.find((r) => r.id === "R-CIT").verdict,
          "ported",
        ) && ok;
      ok =
        observe(
          "step 2 R-MISSING disposition after the retirement was reverted",
          read.rows.find((r) => r.id === "R-MISSING").disposition,
          "KEEP",
        ) && ok;
      exitCode = 0;
    } else {
      ok = observe("step 1 unported ids", unported.sort(), ["R-CIT", "R-MISSING"]) && ok;
      ok =
        observe(
          "step 3 weaker destination exists as a file",
          results.find((r) => r.id === "R-CIT").reason.includes("WEAKER"),
          true,
        ) && ok;
      /* Step 1 exits NONZERO while any row is unported, and that nonzero is
         the point of the arm. */
      exitCode = 1;
      process.stdout.write(
        `STEP 1 EXITS NONZERO: ${String(unported.length)} row(s) unported\n`,
      );
    }
  } finally {
    if (keep) {
      process.stdout.write(`KEPT ${root}\n`);
    } else {
      rmSync(root, { recursive: true, force: true });
    }
  }
  if (!ok) {
    return 1;
  }
  return exitCode;
}

/* -------------------------------------------------------------------- */
/* Trigger 2: the refusal                                                */
/* -------------------------------------------------------------------- */

function refuseFreezePointRestore() {
  process.stdout.write(
    `REFUSED trigger 2 step 3 is NOT rehearsable: ${cutover.UNREHEARSABLE_REASON}\n`,
  );
  process.stdout.write(
    "REHEARSABLE INSTEAD: its INPUT. --trigger freeze-point-restore-input asserts " +
      "that the generated owner request is complete. That asserts the REQUEST, " +
      "never the OUTCOME.\n",
  );
  return 3;
}

/**
 * The rehearsable half of trigger 2 step 3: the PREPARATION.
 *
 * Three fixtures, and the last two are the class. A complete capture
 * generates a request. A capture with one key REMOVED is refused. A capture
 * with every key present and one value EMPTIED is refused as well, which is
 * the arm a presence check is green on.
 */
function rehearseRestoreRequestInput() {
  const complete = {
    capturedAt: "2026-09-15T08:00:00.000Z",
    repository: "owner/kernel",
    rulesetName: "main-protection",
    rules: [
      { id: "required-reviews", preFlipValue: 1 },
      { id: "required-status-checks", preFlipValue: ["gates"] },
    ],
    credentialGrants: [{ name: "contents", preFlipValue: "write" }],
  };
  let ok = true;
  process.stdout.write("TRIGGER 2 step 3 INPUT: rehearsed; the execution is NOT\n");

  const good = cutover.generateRestoreRequest(complete);
  ok = observe("complete capture generates a request", good.ok, true) && ok;
  if (good.ok) {
    ok = observe("every pre-flip field appears in the request", good.fields, 3) && ok;
    for (const needle of ["required-reviews", "required-status-checks", "contents"]) {
      ok =
        observe(`request names ${needle}`, good.text.includes(needle), true) && ok;
    }
    ok =
      observe(
        "request states the unrehearsable property",
        good.text.includes(cutover.UNREHEARSABLE_REASON),
        true,
      ) && ok;
  }

  /* MEMBER A: an absent key. */
  const missing = structuredClone(complete);
  delete missing.rulesetName;
  const memberA = cutover.generateRestoreRequest(missing);
  ok = observe("member A absent key refused", memberA.ok, false) && ok;
  if (!memberA.ok) {
    ok =
      observe(
        "member A names the field",
        memberA.reasons.some((reason) => reason.includes("rulesetName")),
        true,
      ) && ok;
  }

  /* MEMBER B, structurally different: every key present, one value empty. */
  const emptied = structuredClone(complete);
  emptied.rules[0].preFlipValue = "   ";
  const memberB = cutover.generateRestoreRequest(emptied);
  ok = observe("member B present-but-empty value refused", memberB.ok, false) && ok;
  if (!memberB.ok) {
    ok =
      observe(
        "member B names the field",
        memberB.reasons.some((reason) => reason.includes("required-reviews")),
        true,
      ) && ok;
  }
  return ok ? 0 : 1;
}

/* -------------------------------------------------------------------- */

function main(argv) {
  let trigger;
  let ported = false;
  let keep = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--trigger") {
      trigger = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--port") {
      ported = true;
      continue;
    }
    if (argument === "--keep") {
      keep = true;
      continue;
    }
    process.stderr.write(`rehearse-cutover-rollback: unknown argument ${argument}\n`);
    return 2;
  }
  if (trigger === undefined) {
    process.stderr.write(
      "usage: node scripts/rehearse-cutover-rollback.mjs --trigger <drain-reversal|freeze-point-restore|freeze-point-restore-input|retirement-unmet> [--port] [--keep]\n",
    );
    return 2;
  }
  /* Before any arm, and on every arm. A rehearsal whose assertion helper has
     stopped discriminating must not be able to report a green. */
  const self = selfCheck();
  if (self !== 0) {
    return self;
  }
  if (trigger === "drain-reversal") {
    return rehearseDrainReversal(keep);
  }
  if (trigger === "retirement-unmet") {
    return rehearseRetirement(ported, keep);
  }
  if (trigger === "freeze-point-restore") {
    return refuseFreezePointRestore();
  }
  if (trigger === "freeze-point-restore-input") {
    return rehearseRestoreRequestInput();
  }
  process.stderr.write(`rehearse-cutover-rollback: unknown trigger ${trigger}\n`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
