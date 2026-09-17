import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Unit import of doctor's exported range evaluator. Loaded through a
 * computed URL because a literal relative import from test/ into src/
 * crosses the project-reference boundary and fails the build under
 * rewriteRelativeImportExtensions (TS2878); the runtime module is the
 * same source file either way (Node type stripping).
 */
interface NodeCheckResult {
  status: string;
  detail: string;
}
const { nodeCheckFor, runChecks } = (await import(
  new URL("../src/commands/doctor.ts", import.meta.url).href
)) as {
  nodeCheckFor: (range: string, version: string) => NodeCheckResult;
  runChecks: (root: string) => { name: string }[];
};

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The kernel floor is Node >= 26 (DR-0002). On a runner below the floor,
 * doctor's node check legitimately FAILs, so the exit-0 criteria are
 * witnessed only where the floor holds (CI runs on Node 26, the authority);
 * those tests skip below the floor with the reason recorded here.
 */
const nodeMajor = Number(process.version.slice(1).split(".")[0]);
const nodeFloorMet = nodeMajor >= 26;
const floorSkip = nodeFloorMet
  ? false
  : `local Node ${process.version} is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)`;

/**
 * The checks this repository has committed to shipping. It is a FLOOR,
 * not the whole set.
 *
 * IT USED TO BE THE WHOLE SET, compared for equality against doctor's
 * output, and that made it a COUNT-LIKE ASSERTION OVER AN APPEND-ONLY
 * THING: true of today's check list and false of every future phase that
 * adds one. Binding convention 5 names exactly that shape and says to
 * derive at run time instead. M4-P19 is where it came due: adding
 * `CHECK worktrees` reddened this test in a file M4-P19 does not own.
 *
 * The property the equality comparison was PROTECTING is real and is kept,
 * split into the two halves it was conflating:
 *
 *   - a check SILENTLY DROPPED is still red, because every name below must
 *     appear in doctor's output (the floor, asserted by containment);
 *   - a check that RUNS BUT DOES NOT PRINT, or prints without running, is
 *     still red, because doctor's printed names are compared for EQUALITY
 *     against the names `runChecks` returns, in order.
 *
 * A phase adding a check appends its name here and changes nothing else.
 */
const CHECK_NAMES = [
  "node",
  "git",
  "gh",
  "layout",
  "remote",
  "lock",
  "beacon",
  "identity",
  /* M3-P8 step 7 (R-098). */
  "retention",
  /* M3-P13, the M3 exit test's subject change. */
  "kernel-artifacts",
  /* M4-P19: post-reclaim pool entries, reported by id. */
  "worktrees",
  /* M4-P17: the two checks AGENTS.md:310 required and the kernel lacked. */
  "tasks",
  "branches",
];

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
) {
  return spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    ...opts,
  });
}

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p2-doctor-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function initFleet(t: { after(fn: () => void): void }): string {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  return fleet;
}

function resolveOnPath(cmd: string): string {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir === "") {
      continue;
    }
    const candidate = join(dir, cmd);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`${cmd} not found on PATH`);
}

/** A PATH containing git but deterministically no gh (criterion 8). */
function pathWithoutGh(t: { after(fn: () => void): void }): string {
  const bin = mkdtempSync(join(tmpdir(), "tiphys-p2-bin-"));
  t.after(() => {
    rmSync(bin, { recursive: true, force: true });
  });
  symlinkSync(resolveOnPath("git"), join(bin, "git"));
  return bin;
}

function checkLines(stdout: string): Map<string, { status: string; detail: string }> {
  const lines = stdout.trim() === "" ? [] : stdout.trim().split("\n");
  const parsed = new Map<string, { status: string; detail: string }>();
  for (const line of lines) {
    const match = /^CHECK (\S+) (PASS|WARN|FAIL) (.+)$/.exec(line);
    assert.ok(match !== null, `malformed check line: ${line}`);
    parsed.set(match[1] as string, {
      status: match[2] as string,
      detail: match[3] as string,
    });
  }
  return parsed;
}

test("doctor in a healthy fleet prints one line per check with no unexpected FAIL", (t) => {
  const fleet = initFleet(t);
  const result = runCli(["doctor"], { cwd: fleet });
  const checks = checkLines(result.stdout);
  // One line per check, in order, DERIVED rather than pinned: this is the
  // half that catches a check which runs without printing or prints
  // without running.
  assert.deepEqual(
    [...checks.keys()],
    runChecks(fleet).map((check) => check.name),
    "doctor printed a different set of checks than runChecks computed",
  );
  // And the floor: every check this repository has committed to is still
  // there. This is the half that catches a silent deletion.
  for (const name of CHECK_NAMES) {
    assert.ok(checks.has(name), `check ${name} disappeared from doctor's output`);
  }
  for (const name of CHECK_NAMES) {
    if (name === "node") {
      continue;
    }
    assert.notEqual(
      checks.get(name)?.status,
      "FAIL",
      `unexpected FAIL for ${name}: ${checks.get(name)?.detail ?? ""}`,
    );
  }
  const nodeCheck = checks.get("node");
  assert.equal(nodeCheck?.status, nodeFloorMet ? "PASS" : "FAIL");
  assert.equal(result.status, nodeFloorMet ? 0 : 1);
});

test("doctor in a healthy fleet exits 0", { skip: floorSkip }, (t) => {
  const fleet = initFleet(t);
  const result = runCli(["doctor"], { cwd: fleet });
  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(result.stdout, /^CHECK \S+ FAIL /m);
});

test("doctor after deleting decisions reports CHECK layout FAIL naming the missing entry", (t) => {
  const fleet = initFleet(t);
  rmSync(join(fleet, "decisions"), { recursive: true });
  const result = runCli(["doctor"], { cwd: fleet });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^CHECK layout FAIL .*decisions/m);
});

test("doctor outside a fleet home exits nonzero", (t) => {
  const notAFleet = makeTempDir(t);
  const result = runCli(["doctor"], { cwd: notAFleet });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^CHECK layout FAIL /m);
});

test("doctor reports CHECK gh WARN when gh is absent from PATH", (t) => {
  const fleet = initFleet(t);
  const env = { ...process.env, PATH: pathWithoutGh(t) };
  const result = runCli(["doctor"], { cwd: fleet, env });
  assert.match(result.stdout, /^CHECK gh WARN /m);
  assert.doesNotMatch(result.stdout, /^CHECK gh FAIL /m);
  assert.equal(result.status, nodeFloorMet ? 0 : 1);
});

test("doctor with gh absent exits 0 under the generic profile", { skip: floorSkip }, (t) => {
  const fleet = initFleet(t);
  const env = { ...process.env, PATH: pathWithoutGh(t) };
  const result = runCli(["doctor"], { cwd: fleet, env });
  assert.equal(result.status, 0, result.stdout);
});

test("doctor --for full promotes gh-missing to FAIL", (t) => {
  const fleet = initFleet(t);
  const env = { ...process.env, PATH: pathWithoutGh(t) };
  const result = runCli(["doctor", "--for", "full"], { cwd: fleet, env });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^CHECK gh FAIL /m);
});

test("doctor --for full promotes remote-missing to FAIL", (t) => {
  const fleet = initFleet(t);
  const generic = runCli(["doctor"], { cwd: fleet });
  assert.match(generic.stdout, /^CHECK remote WARN /m);
  const full = runCli(["doctor", "--for", "full"], { cwd: fleet });
  assert.notEqual(full.status, 0);
  assert.match(full.stdout, /^CHECK remote FAIL /m);
});

test("doctor --for watch promotes beacon-absent to FAIL", (t) => {
  const fleet = initFleet(t);
  const generic = runCli(["doctor"], { cwd: fleet });
  assert.match(generic.stdout, /^CHECK beacon WARN watcher not running or not scheduled/m);
  const watch = runCli(["doctor", "--for", "watch"], { cwd: fleet });
  assert.notEqual(watch.status, 0);
  assert.match(watch.stdout, /^CHECK beacon FAIL /m);
});

test("doctor reports CHECK lock FAIL on a corrupt lease file", (t) => {
  const fleet = initFleet(t);
  writeFileSync(join(fleet, "state", "orchestrator.lock"), "not json {");
  const result = runCli(["doctor"], { cwd: fleet });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^CHECK lock FAIL /m);
});

test("doctor reports CHECK lock FAIL when the lease expiresAt does not parse", (t) => {
  const fleet = initFleet(t);
  writeFileSync(
    join(fleet, "state", "orchestrator.lock"),
    `${JSON.stringify({ holderId: "h1", expiresAt: "banana" })}\n`,
  );
  const result = runCli(["doctor"], { cwd: fleet });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^CHECK lock FAIL .*not a parseable timestamp/m);
});

test("node range evaluation compares full versions and fails closed on uninterpretable ranges", () => {
  assert.equal(nodeCheckFor(">=26.1.0", "v26.0.0").status, "FAIL");
  assert.equal(nodeCheckFor(">=26.1.0", "v26.1.0").status, "PASS");
  assert.equal(nodeCheckFor(">=26.1.0", "v27.0.0").status, "PASS");
  assert.equal(nodeCheckFor(">=26", "v26.6.0").status, "PASS");
  assert.equal(nodeCheckFor(">=26", "v22.22.2").status, "FAIL");
  const caret = nodeCheckFor("^26.0.0", "v26.0.0");
  assert.equal(caret.status, "FAIL");
  assert.match(caret.detail, /cannot interpret/);
  const wildcard = nodeCheckFor(">=26.x", "v26.0.0");
  assert.equal(wildcard.status, "FAIL");
  assert.match(wildcard.detail, /cannot interpret/);
});

test("doctor reports holder and expiry for a readable lease", (t) => {
  const fleet = initFleet(t);
  const lease = {
    holderId: "holder-p2-test",
    hostname: "test-host",
    acquiredAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  writeFileSync(
    join(fleet, "state", "orchestrator.lock"),
    `${JSON.stringify(lease)}\n`,
  );
  const result = runCli(["doctor"], { cwd: fleet });
  const lockLine = /^CHECK lock (\S+) (.+)$/m.exec(result.stdout);
  assert.ok(lockLine !== null, "no lock line");
  assert.equal(lockLine[1], "PASS");
  assert.match(lockLine[2] as string, /holder-p2-test/);
  assert.match(lockLine[2] as string, /2099-01-01T00:00:00\.000Z/);
});

test("doctor --for with an unknown profile exits 64", (t) => {
  const fleet = initFleet(t);
  const result = runCli(["doctor", "--for", "no-such-profile"], { cwd: fleet });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /unknown profile/);
});

/* ------------------------------------------------------------------ */
/* M3-P8 criterion 8: the retention check (R-098)                       */
/* ------------------------------------------------------------------ */

/**
 * Write a charter into the fleet declaring three retention paths, and create
 * them. The paths are the ones an ordinary project declares: where its work
 * histories, its evidence and its tuition live.
 */
function charterWithRetention(fleet: string): string[] {
  const paths = ["notes/work-history", "notes/evidence", "notes/tuition"];
  for (const path of paths) {
    mkdirSync(join(fleet, path), { recursive: true });
    writeFileSync(join(fleet, path, "keep.md"), "# kept\n");
  }
  writeFileSync(
    join(fleet, "charter", "charter.yaml"),
    [
      "kind: charter",
      "identity:",
      "  name: example-service",
      "retention:",
      ...paths.map((path, index) => `  ${["work-history", "evidence", "tuition"][index] as string}: ${path}`),
      "",
    ].join("\n"),
  );
  return paths;
}

test("doctor reports CHECK retention PASS for declared paths that exist and are not ignored, and FAIL naming the path once it is git-ignored", (t) => {
  /* ANCHOR THE CHECK TO REAL EXTERNAL-PROGRAM OUTPUT FIRST (red-witness rule
     (f), CLAUDE.md warning 10). `isGitIgnored` in src/commands/doctor.ts
     spawns `git check-ignore -q` and reads ONLY its exit code, so the exit
     code is the entire contract and a hand-written expectation for it would
     be indistinguishable from a fabricated one. The capture records the three
     real codes; a live scratch repository must reproduce them before the
     assertions below mean anything. */
  const captureName = "doctor-git-check-ignore-resolution.txt";
  const captured = readFileSync(
    join(repoRoot, "witness", "captures", captureName),
    "utf8",
  );
  assert.match(captured, /ignored-path: git check-ignore -q -- \S+\n\s*exit 0/);
  assert.match(captured, /unignored-path: git check-ignore -q -- \S+\n\s*exit 1/);
  assert.match(captured, /not-a-repository: .*\n\s*exit 128/);
  {
    const probe = makeTempDir(t);
    mkdirSync(join(probe, "notes", "evidence"), { recursive: true });
    mkdirSync(join(probe, "notes", "tuition"), { recursive: true });
    writeFileSync(join(probe, "notes", "evidence", "keep.md"), "# kept\n");
    writeFileSync(join(probe, "notes", "tuition", "keep.md"), "# kept\n");
    writeFileSync(join(probe, ".gitignore"), "notes/evidence/\n");
    assert.equal(
      spawnSync("git", ["-C", probe, "init", "-q"], { encoding: "utf8" }).status,
      0,
      "the probe repository could not be created",
    );
    const ignored = spawnSync(
      "git",
      ["-C", probe, "check-ignore", "-q", "--", "notes/evidence"],
      { encoding: "utf8" },
    );
    assert.equal(ignored.status, 0, `captured contract: an ignored path exits 0, live git said ${String(ignored.status)}`);
    const unignored = spawnSync(
      "git",
      ["-C", probe, "check-ignore", "-q", "--", "notes/tuition"],
      { encoding: "utf8" },
    );
    assert.equal(
      unignored.status,
      1,
      `captured contract: an unignored path exits 1, live git said ${String(unignored.status)}`,
    );
  }

  const fleet = initFleet(t);
  const paths = charterWithRetention(fleet);

  const passing = runCli(["doctor"], { cwd: fleet });
  const green = /^CHECK retention (\S+) (.+)$/m.exec(passing.stdout);
  assert.ok(green !== null, `no retention line: ${passing.stdout}`);
  assert.equal(green[1], "PASS", green[2]);
  assert.match(green[2] as string, new RegExp(`${String(paths.length)} declared retention path`));

  /* THE DANGEROUS STATE: the path still EXISTS, so an existence-only check
     would stay green, and it is git-ignored, so it does not survive a clone.
     That is exactly the loss R-098 exists to prevent. */
  appendFileSync(join(fleet, ".gitignore"), `${paths[1] as string}/\n`);
  const failing = runCli(["doctor"], { cwd: fleet });
  const red = /^CHECK retention (\S+) (.+)$/m.exec(failing.stdout);
  assert.ok(red !== null, failing.stdout);
  assert.equal(red[1], "FAIL", red[2]);
  assert.match(red[2] as string, new RegExp(paths[1] as string));
  assert.equal(failing.status, 1);

  /* BOTH DIRECTIONS: removing the ignore returns the check to PASS and the
     command to its previous exit code. */
  writeFileSync(
    join(fleet, ".gitignore"),
    ["state/", "worktrees/", "projects/", ""].join("\n"),
  );
  const restored = runCli(["doctor"], { cwd: fleet });
  assert.match(restored.stdout, /^CHECK retention PASS /m);
  assert.equal(restored.status, nodeFloorMet ? 0 : 1);
});

test("doctor FAILs naming a declared retention path that does not exist, and --for full promotes an undeclared retention to FAIL", (t) => {
  const fleet = initFleet(t);
  charterWithRetention(fleet);
  rmSync(join(fleet, "notes", "tuition"), { recursive: true, force: true });
  const absent = runCli(["doctor"], { cwd: fleet });
  assert.match(absent.stdout, /^CHECK retention FAIL .*notes\/tuition.*does not exist$/m);
  assert.equal(absent.status, 1);

  /* THE VACUOUS PASS THIS CHECK MUST NOT HAVE (SC-011), AND THE STATE THE
     PLAN'S HAZARD ROW NAMES VERBATIM: "a charter with NO `retention` path".
     The charter EXISTS here, so someone has realized a project and omitted the
     duty. That is a WARN under the generic profile, never a silent PASS, and
     `--for full` promotes it.
     Fix round 2 changed this fixture. It used to be a BARE fleet with no
     charter at all, which is a different state (nothing authored yet, nothing
     to retain) and is now `retention-not-applicable`; the sibling test below
     owns it. A charter that exists and omits retention is the stronger witness
     of the hazard, because it is the one an omission can actually reach. */
  const omitted = initFleet(t);
  writeFileSync(
    join(omitted, "charter", "charter.yaml"),
    ["kind: charter", "identity:", "  name: example-service", ""].join("\n"),
  );
  const generic = runCli(["doctor"], { cwd: omitted });
  assert.match(generic.stdout, /^CHECK retention WARN .*declares no retention paths$/m);
  assert.equal(generic.status, nodeFloorMet ? 0 : 1);

  const full = runCli(["doctor", "--for", "full"], { cwd: omitted });
  assert.match(full.stdout, /^CHECK retention FAIL .*required for profile full/m);
  assert.equal(full.status, 1);
});

/*
 * THE CHARTERLESS FLEET UNDER `full` (M4-P30 criteria 5 and 6).
 *
 * THIS TEST IS THE REVERSE OF THE ONE IT REPLACES, and the reversal is the
 * phase. What stood here asserted that `--for full` must NEVER promote a
 * not-applicable retention, because M3-P8 fix round 1 had folded "no charter"
 * into `retention-undeclared` and thereby failed step A2 of
 * scripts/m1-exit-test.sh on every freshly initialized fleet. Fix round 2 split
 * the condition in two and left BOTH unpromoted under `full`.
 *
 * WHAT THAT COST, MEASURED ON THE KERNEL'S OWN FLEET HOME RATHER THAN ARGUED:
 * a fleet with a configured remote, a cloned project and NO charter document
 * printed thirteen CHECK lines, ZERO FAIL lines and exited 0 under
 * `--for full` (delivery/evidence/m4-fleet-bringup/bringup.md:1, record
 * `C5.1-arm5-before-charter-emptied`). `tiphys doctor --for full` exiting 0 was
 * therefore not evidence that a charter existed, which is a guard that cannot
 * go red against the one state it is read for.
 *
 * THE SPLIT SURVIVES THE PROMOTION, and that is what the sibling test below
 * asserts: `retention-not-applicable` and `retention-undeclared` keep separate
 * ids and separate detail lines, so promoting both does not make "nobody has
 * written a charter yet" and "somebody put the wrong YAML in charter/" print
 * one sentence.
 *
 * WHY THIS CAPTURE IS CITED HERE (red-witness rule (f)). The harness derives
 * the capture obligation per FILE: this witness mutates
 * src/commands/doctor.ts, and that file spawns `git check-ignore -q` to reach
 * its other retention verdicts. The arms THIS test guards must return BEFORE
 * that spawn, and the captured contract is what makes that a checkable
 * statement rather than an assumption: the three verdicts downstream of it
 * ("git-ignored", "does not exist", "present and tracked") are asserted absent
 * below, and the capture is where a reader learns those are the verdicts the
 * git-consulting loop produces.
 */
function gitCheckIgnoreCapture(): string {
  return readFileSync(
    join(repoRoot, "witness", "captures", "doctor-git-check-ignore-resolution.txt"),
    "utf8",
  );
}

test("doctor promotes a not-applicable retention to FAIL under --for full and leaves it a WARN under every profile below, in a fleet that tiphys init just created", (t) => {
  const captured = gitCheckIgnoreCapture();
  assert.match(captured, /unignored-path: git check-ignore -q -- \S+\n\s*exit 1/);
  assert.match(captured, /ignored-path: git check-ignore -q -- \S+\n\s*exit 0/);

  const fresh = initFleet(t);
  assert.ok(
    existsSync(join(fresh, "charter", ".gitkeep")),
    "init is expected to leave charter/ holding only a keep file",
  );
  assert.deepEqual(
    readdirSync(join(fresh, "charter")).sort(),
    [".gitkeep"],
    "init is expected to write no charter document",
  );

  /* THE PROMOTED ARM. The detail must still NAME the reason, so the FAIL is
     actionable rather than a bare refusal: an operator reading it learns that
     the remedy is to write a charter, which is the property that makes this
     promotion different from a check whose remedy the operator cannot reach. */
  const full = runCli(["doctor", "--for", "full"], { cwd: fresh });
  const fullLine = /^CHECK retention (\S+) (.+)$/m.exec(full.stdout);
  assert.ok(fullLine !== null, full.stdout);
  assert.equal(
    fullLine[1],
    "FAIL",
    `--for full left a charterless fleet unpromoted: ${fullLine[2] as string}`,
  );
  assert.match(
    fullLine[2] as string,
    /no charter document in .*retention is not applicable \(required for profile full\)$/,
  );
  assert.equal(full.status, 1);

  /* EVERY PROFILE BELOW `full` IS WALKED, not just the generic one, because
     the half this phase must not break is that a fresh `tiphys init` fleet
     stays usable outside full mode. Below `full` nothing resolves roles,
     checklists or retention duties out of a charter, so a fleet that has none
     is not broken there. A profile added later that promotes this condition
     reddens here.
     THE ASSERTION IS ON THE RETENTION LINE, NOT ON THE EXIT CODE, for every
     profile but the generic one. `direct-pr` promotes `gh-missing`, so its
     exit code depends on whether `gh` is on the PATH of whoever runs the
     suite, and this repository's own toolchain has it absent locally and
     present in CI (CLAUDE.md standing warning 6). Pinning the exit code here
     would make the test measure the runner rather than the promotion. The
     generic profile promotes NOTHING, so its exit code is a fact about the
     fleet, and that is the one asserted. */
  const unpromotedLines: string[] = [];
  for (const profile of [[], ["--for", "local-only"], ["--for", "direct-pr"]]) {
    const label = profile.length === 0 ? "generic" : (profile[1] as string);
    const run = runCli(["doctor", ...profile], { cwd: fresh });
    const line = /^CHECK retention (\S+) (.+)$/m.exec(run.stdout);
    assert.ok(line !== null, `${label}: no retention line in ${run.stdout}`);
    assert.equal(line[1], "WARN", `${label} promoted a not-applicable retention: ${line[2] as string}`);
    assert.match(line[2] as string, /no charter document in .*retention is not applicable$/);
    assert.doesNotMatch(line[2] as string, /required for profile/);
    unpromotedLines.push(line[2] as string);
  }

  const generic = runCli(["doctor"], { cwd: fresh });
  assert.equal(
    generic.status,
    nodeFloorMet ? 0 : 1,
    `the generic profile promotes nothing, so a fresh fleet must still exit 0: ${generic.stdout}`,
  );

  /* IT IS NEVER A SILENT PASS UNDER ANY PROFILE, which is the SC-011 half the
     promotion must not be mistaken for. WARN with a reason below `full`, FAIL
     with the same reason under it; PASS appears nowhere. */
  assert.doesNotMatch(full.stdout, /^CHECK retention PASS /m);

  /* THE CHECK RETURNED BEFORE THE GIT-CONSULTING LOOP: none of the three
     verdicts that loop can produce appears, so nothing was reported about
     paths nobody declared. */
  for (const line of [...unpromotedLines, fullLine[2] as string]) {
    assert.doesNotMatch(line, /git-ignored|does not exist|present and tracked/);
  }
});

test("doctor keeps a charterless fleet and a charter directory holding the wrong YAML distinct under --for full, in one fleet with one variable changed", (t) => {
  /* CRITERION 6, and it is the reason this phase is two tests rather than one.
     Both states now FAIL under `full`, so the cheapest wrong fix is to make
     them one condition with one message. The measurement that makes the two
     worth separating: "nobody has written a charter yet" is a fleet waiting on
     an owner duty, and "there is YAML in charter/ that is not a charter" is a
     fleet somebody has configured wrongly. The remedies differ, so the lines
     must.
     ONE FLEET, ONE VARIABLE. Two fleets would print two different absolute
     paths and the two detail strings would differ for a reason that has
     nothing to do with the conditions; here the only thing that changes
     between the two runs is the presence of one file. */
  const captured = gitCheckIgnoreCapture();
  assert.match(captured, /not-a-repository: git -C \/tmp check-ignore -q -- foo\n\s*exit 128/);

  const fleet = initFleet(t);

  const charterless = runCli(["doctor", "--for", "full"], { cwd: fleet });
  const charterlessLine = /^CHECK retention (\S+) (.+)$/m.exec(charterless.stdout);
  assert.ok(charterlessLine !== null, charterless.stdout);
  assert.equal(charterlessLine[1], "FAIL", charterlessLine[2]);
  assert.equal(charterless.status, 1);

  writeFileSync(
    join(fleet, "charter", "notes.yaml"),
    ["kind: decision-record", ""].join("\n"),
  );
  const misconfigured = runCli(["doctor", "--for", "full"], { cwd: fleet });
  const misconfiguredLine = /^CHECK retention (\S+) (.+)$/m.exec(misconfigured.stdout);
  assert.ok(misconfiguredLine !== null, misconfigured.stdout);
  assert.equal(misconfiguredLine[1], "FAIL", misconfiguredLine[2]);
  assert.equal(misconfigured.status, 1);

  const charterlessDetail = charterlessLine[2] as string;
  const misconfiguredDetail = misconfiguredLine[2] as string;

  /* THE LOAD-BEARING ASSERTION: not that each matches its own pattern, which a
     collapse could still satisfy if one pattern were a substring of the other,
     but that each names its own reason AND NOT the other's, and that the two
     lines are not the same string. */
  assert.match(
    charterlessDetail,
    /no charter document in .*so no project is realized here yet and retention is not applicable \(required for profile full\)$/,
  );
  assert.doesNotMatch(charterlessDetail, /kind: charter/);

  assert.match(
    misconfiguredDetail,
    /^1 YAML document\(s\) in .*none with kind: charter, so no retention paths are declared \(required for profile full\)$/,
  );
  assert.doesNotMatch(misconfiguredDetail, /retention is not applicable/);

  assert.notEqual(
    charterlessDetail,
    misconfiguredDetail,
    "the two conditions collapsed into one detail string",
  );
});

/**
 * THE VACUOUS-PASS FAMILY (CR-1 and HRB-6, M3-P8 fix round 3).
 *
 * Round 2 recorded `retention: {}` as one open item. Two clean-room reviews
 * measured it as a FAMILY, and the boundary is what makes it worth a test: an
 * ABSENT `retention` key correctly FAILs under `full` (the test above owns
 * that), so a charter author defeated the promoted condition with TWO
 * CHARACTERS and got `PASS 0 declared retention path(s) present and tracked`,
 * the same word a charter with three present, tracked paths prints.
 *
 * ONE WITNESS IS NOT A CLASS, so this asserts five structurally different
 * members against BOTH profiles. They fall into two mechanisms and the fix has
 * two arms accordingly: `{}` and `[]` are objects that yield no path (the
 * verdict must come from the COUNT, not from `typeof`), and nested-map,
 * empty-string and number values are values the old filter DISCARDED with no
 * diagnostic (a non-string value is its own FAIL naming its key).
 *
 * THE POSITIVE CONTROL IS PART OF THE TEST. A fix that reddened everything
 * would satisfy every assertion above and destroy the check, so the last row
 * asserts a real declared, present, tracked path still PASSes with its count.
 */
test("doctor never prints PASS for a charter whose retention declares no usable path, under either profile, for any of five shapes", (t) => {
  const shapes: { name: string; lines: string[]; expect: RegExp }[] = [
    {
      name: "empty map",
      lines: ["retention: {}"],
      expect: /declares no retention paths/,
    },
    {
      name: "empty list",
      lines: ["retention: []"],
      expect: /declares no retention paths/,
    },
    {
      name: "nested map value",
      lines: ["retention:", "  work-history: {path: notes/keep}"],
      expect: /declares retention key work-history as a map, which names no path/,
    },
    {
      name: "empty string value",
      lines: ["retention:", '  work-history: ""'],
      expect: /declares retention key work-history as an empty string, which names no path/,
    },
    {
      name: "number value",
      lines: ["retention:", "  work-history: 12"],
      expect: /declares retention key work-history as a number, which names no path/,
    },
  ];

  for (const shape of shapes) {
    const fleet = initFleet(t);
    writeFileSync(
      join(fleet, "charter", "charter.yaml"),
      ["kind: charter", "identity:", "  name: example-service", ...shape.lines, ""].join("\n"),
    );
    for (const profile of [[], ["--for", "full"]]) {
      const run = runCli(["doctor", ...profile], { cwd: fleet });
      const line = /^CHECK retention (\S+) (.+)$/m.exec(run.stdout);
      assert.ok(line !== null, `${shape.name}: no retention line in ${run.stdout}`);
      /* THE LOAD-BEARING ASSERTION. Not "it is FAIL": the shapes divide
         between WARN-promoted and FAIL, and pinning each to one status would
         make this test a restatement of the implementation. What the plan's
         hazard row at delivery/plan/kernel-plan-m3.md:4042 forbids is the
         SILENT PASS, so PASS is what must never appear. */
      assert.notEqual(
        line[1],
        "PASS",
        `${shape.name} (profile ${profile.length === 0 ? "generic" : "full"}) printed PASS: ${line[2] as string}`,
      );
      assert.match(line[2] as string, shape.expect, `${shape.name}: ${line[2] as string}`);
      assert.doesNotMatch(
        line[2] as string,
        /present and tracked/,
        `${shape.name} reported the tracked-path verdict for a charter that declares none`,
      );
    }
    /* THE PROMOTION STILL BITES, which is the half a count-blind fix loses:
       under `full` every one of these shapes must exit nonzero. */
    assert.equal(
      runCli(["doctor", "--for", "full"], { cwd: fleet }).status,
      1,
      `${shape.name} did not fail --for full`,
    );
  }

  /* POSITIVE CONTROL: a declared, present, tracked path still PASSes, and the
     count is derived rather than pinned. */
  const healthy = initFleet(t);
  const paths = charterWithRetention(healthy);
  const green = runCli(["doctor"], { cwd: healthy });
  const greenLine = /^CHECK retention (\S+) (.+)$/m.exec(green.stdout);
  assert.ok(greenLine !== null, green.stdout);
  assert.equal(greenLine[1], "PASS", greenLine[2]);
  assert.match(
    greenLine[2] as string,
    new RegExp(`^${String(paths.length)} declared retention path\\(s\\) present and tracked$`),
  );
});

/* ------------------------------------------------------------------ */
/* M3-P13: the kernel-artifacts check (M3 exit test, stage E1.6)        */
/* ------------------------------------------------------------------ */

/**
 * A STAGED INSTALL is the subject of every test below, never this checkout.
 * The check's whole claim is about the RESOLVED install, so exercising it
 * against the development tree would be hazard H2 of the phase plan: green for
 * every developer and silent about any user's environment.
 *
 * The staging copies the four artifacts plus a package.json and the compiled
 * module path the published package uses, and then removes exactly one thing
 * per case. `dist/src/commands/doctor.js` is where the published package puts
 * this module (measured from the pack listing on this head), so a staged
 * install reproduces the published layout rather than the checkout's.
 */
/**
 * The member each directory must carry for its CONSUMER to resolve anything,
 * which is the suffix that consumer already filters on (src/roles.ts:335,
 * src/commands/validate.ts:156, src/checklists.ts:91). Round 0 staged
 * `placeholder.md` into all three, which is not a member `schemas/` or
 * `checklists/` resolves; that it passed is the proxy CR-001 names.
 */
const STAGED_MEMBERS: Record<string, string> = {
  roles: "placeholder.md",
  schemas: "placeholder.schema.json",
  checklists: "placeholder.yaml",
};

function stageInstall(
  t: { after(fn: () => void): void },
  options: {
    omit?: string;
    empty?: string;
    fifo?: string;
    noPackageJson?: boolean;
    /** Stage this directory with one member no consumer would select. */
    unresolvable?: string;
    /** Stage this directory with its one member truncated to zero bytes. */
    hollow?: string;
    /** Stage this directory with only a subdirectory inside it. */
    subdirOnly?: string;
    /** Truncate this file to zero bytes rather than omitting it. */
    emptyFile?: string;
  } = {},
): string {
  const root = join(makeTempDir(t), "install");
  mkdirSync(join(root, "dist", "src", "commands"), { recursive: true });
  if (options.noPackageJson !== true) {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "@tiphys/kernel", version: "0.0.0-staged" }),
    );
  }
  for (const name of ["roles", "schemas", "checklists"]) {
    if (options.omit === name) {
      continue;
    }
    mkdirSync(join(root, name), { recursive: true });
    if (options.empty === name) {
      continue;
    }
    if (options.subdirOnly === name) {
      mkdirSync(join(root, name, "nested"), { recursive: true });
      continue;
    }
    if (options.unresolvable === name) {
      writeFileSync(join(root, name, "NOTES.txt"), "not a member any consumer selects\n");
      continue;
    }
    writeFileSync(
      join(root, name, STAGED_MEMBERS[name] as string),
      options.hollow === name ? "" : "staged\n",
    );
  }
  if (options.omit !== "AGENTS.md") {
    if (options.fifo === "AGENTS.md") {
      const made = spawnSync("mkfifo", [join(root, "AGENTS.md")]);
      assert.equal(made.status, 0, "mkfifo failed while staging the FIFO case");
    } else {
      writeFileSync(join(root, "AGENTS.md"), options.emptyFile === "AGENTS.md" ? "" : "staged\n");
    }
  }
  return root;
}

const { checkKernelArtifacts, resolveInstalledKernelRoot } = (await import(
  new URL("../src/commands/doctor.ts", import.meta.url).href
)) as {
  checkKernelArtifacts: (resolution?: { ok: true; root: string } | { ok: false; reason: string }) => {
    name: string;
    status: string;
    detail: string;
    condition?: string;
  };
  resolveInstalledKernelRoot: (
    from?: string,
  ) => { ok: true; root: string } | { ok: false; reason: string };
};

/** The check against a staged install, as doctor itself would call it. */
function checkStaged(root: string) {
  return checkKernelArtifacts(resolveInstalledKernelRoot(join(root, "dist", "src", "commands")));
}

/* RENAMED in fix round 1 under hazard finding CR-003 (R-087). The old name
   was "a staged install missing roles/ is a FAIL naming roles/" and the body
   asserts WARN: the check returns the CONDITION and the printer promotes it
   under full, so the old name was a true sentence about the CLI and a false
   one about this test. The promotion itself is asserted by
   "kernel-artifacts is promoted to FAIL under full and stays a WARN below it"
   and by the live capture reproduction, both of which go through the CLI. */
test("a staged install missing roles/ carries kernel-artifacts-incomplete, which full promotes to FAIL", (t) => {
  const result = checkStaged(stageInstall(t, { omit: "roles" }));
  assert.equal(result.status, "WARN");
  assert.equal(result.condition, "kernel-artifacts-incomplete");
  assert.match(result.detail, /roles\/ \(absent\)/);
});

test("a staged install missing AGENTS.md is caught, which is the FILE member of the class", (t) => {
  const result = checkStaged(stageInstall(t, { omit: "AGENTS.md" }));
  assert.equal(result.condition, "kernel-artifacts-incomplete");
  assert.match(result.detail, /AGENTS\.md \(absent\)/);
  assert.doesNotMatch(result.detail, /roles\//, "no directory should be reported missing here");
});

test("a staged install whose roles/ exists but is EMPTY is missing it", (t) => {
  const result = checkStaged(stageInstall(t, { empty: "roles" }));
  assert.equal(result.condition, "kernel-artifacts-incomplete");
  assert.match(result.detail, /roles\/ \(present but empty/);
});

/**
 * FIX ROUND 1, hazard finding CR-001. The four shapes the reviewer forced
 * against a real staged install of the built package, every one of them PASS
 * with FAIL count zero before this round. They are asserted TOGETHER because
 * the defect is one mechanism (presence standing in for resolvability) and a
 * mutation that defangs either half of the predicate must redden this test,
 * which is what witness/doctor-kernel-artifacts-resolvability.json declares.
 */
test("presence is not resolvability: the four shapes that used to PASS are each named", (t) => {
  const unresolvable = checkStaged(stageInstall(t, { unresolvable: "checklists" }));
  assert.equal(unresolvable.condition, "kernel-artifacts-incomplete");
  assert.match(
    unresolvable.detail,
    /checklists\/ \(present, but no \.yaml member resolves\)/,
    "a directory carrying one unrelated file resolves nothing",
  );

  const subdirOnly = checkStaged(stageInstall(t, { subdirOnly: "roles" }));
  assert.match(
    subdirOnly.detail,
    /roles\/ \(present, but no \.md member resolves\)/,
    "a directory carrying only a subdirectory resolves nothing",
  );

  const hollow = checkStaged(stageInstall(t, { hollow: "roles" }));
  assert.match(
    hollow.detail,
    /roles\/ \(present, but no \.md member resolves\)/,
    "a directory whose members are all zero bytes resolves nothing",
  );

  const emptyFile = checkStaged(stageInstall(t, { emptyFile: "AGENTS.md" }));
  assert.equal(emptyFile.condition, "kernel-artifacts-incomplete");
  assert.match(
    emptyFile.detail,
    /AGENTS\.md \(present but empty, so it states nothing\)/,
    "the FILE member of the class, which the emptiness reasoning had never been applied to",
  );
});

test("the resolvability capture records the four shapes as the CLI reports them", () => {
  const captured = readFileSync(
    join(repoRoot, "witness", "captures", "doctor-kernel-artifacts-resolvability.txt"),
    "utf8",
  );
  for (const expected of [
    /checklists\/ \(present, but no \.yaml member resolves\)/,
    /roles\/ \(present, but no \.md member resolves\)/,
    /AGENTS\.md \(present but empty, so it states nothing\)/,
  ]) {
    assert.match(captured, expected);
  }
  const exits = [...captured.matchAll(/^exit=(\d+)$/gm)].map((m) => m[1]);
  assert.deepEqual(exits, ["1", "1", "1", "1"], "every shape must fail under --for full");
});

test("a complete staged install PASSes with no condition", (t) => {
  const result = checkStaged(stageInstall(t));
  assert.equal(result.status, "PASS");
  assert.equal(result.condition, undefined);
  assert.match(result.detail, /carries roles\/, schemas\/, checklists\/ and AGENTS\.md/);
});

test("every missing artifact is named, not the first one found", (t) => {
  const root = stageInstall(t, { omit: "roles" });
  rmSync(join(root, "AGENTS.md"));
  rmSync(join(root, "checklists"), { recursive: true });
  const result = checkStaged(root);
  for (const expected of [/roles\//, /checklists\//, /AGENTS\.md/]) {
    assert.match(result.detail, expected);
  }
});

test("resolution never walks past an install that has lost roles/", (t) => {
  /* THE ARM AN UPWARD-WALKING RESOLVER REPORTS PASS ON (finding PR-1,
     criterion 9). The staged install sits inside a parent that DOES carry a
     roles/ directory with a .md file, which is exactly what src/roles.ts's
     kernelRoot walks up to find. */
  const parent = makeTempDir(t);
  mkdirSync(join(parent, "roles"), { recursive: true });
  writeFileSync(join(parent, "roles", "implementer.md"), "decoy\n");
  const root = join(parent, "install");
  mkdirSync(join(root, "dist", "src", "commands"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "staged" }));
  for (const name of ["schemas", "checklists"]) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, "placeholder.md"), "staged\n");
  }
  writeFileSync(join(root, "AGENTS.md"), "staged\n");
  const resolution = resolveInstalledKernelRoot(join(root, "dist", "src", "commands"));
  assert.equal(resolution.ok, true);
  assert.equal((resolution as { root: string }).root, root, "resolved past the install");
  const result = checkKernelArtifacts(resolution);
  assert.equal(result.condition, "kernel-artifacts-incomplete");
  assert.match(result.detail, /roles\/ \(absent\)/);
});

test("an unresolvable install root is a FAIL rather than a thrown error", () => {
  /* Criterion 10. The success path is total: the resolver returns its reason
     and the check turns it into a verdict, so removing the explicit failure
     would be visible rather than being covered by a crash.

     WITNESSED AT THE UNIT LEVEL ONLY, and that is recorded rather than left
     to be discovered (fix round 1, hazard finding CR-004). The arm is DEAD in
     the CLI path: an install whose root cannot be resolved has no package.json
     above it either, so readOwnVersion refuses at src/version.ts:20 and the
     process exits 1 before any command runs. The criterion's letter is met by
     that exit 1; the arm this test asserts is never the one that produces it.
     Deliberately NOT made reachable here: doing so would mean moving or
     duplicating the startup version read, which is outside this phase's
     files-to-touch and is the same walk CR-002 tracks. */
  const resolution = resolveInstalledKernelRoot("/");
  assert.equal(resolution.ok, false);
  const result = checkKernelArtifacts(resolution);
  assert.equal(result.status, "FAIL");
  assert.equal(result.condition, undefined);
  assert.match(result.detail, /cannot be resolved/);
});

test("a FIFO at AGENTS.md is refused in bounded time rather than opened", (t) => {
  /* Criterion 11. The timeout is the assertion: a check that opened the FIFO
     would block here forever with no reader. */
  const root = stageInstall(t, { fifo: "AGENTS.md" });
  const startedAt = Date.now();
  const result = checkStaged(root);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 5000, `took ${String(elapsed)}ms`);
  assert.equal(result.condition, "kernel-artifacts-incomplete");
  assert.match(result.detail, /AGENTS\.md \(irregular/);
});

const { PROFILES: doctorProfiles } = (await import(
  new URL("../src/commands/doctor.ts", import.meta.url).href
)) as { PROFILES: Record<string, readonly string[]> };

test("kernel-artifacts is promoted to FAIL under full and stays a WARN below it", (t) => {
  /* Through the CLI rather than the unit, because the promotion lives in the
     profile table and the exit code is the thing an operator sees. The fleet's
     own install is complete, so the promotion is asserted on the TABLE, which
     is what decides the arm. */
  const fleet = initFleet(t);
  const result = runCli(["doctor", "--for", "full"], { cwd: fleet });
  const line = /^CHECK kernel-artifacts (\S+) /m.exec(result.stdout);
  assert.ok(line !== null, result.stdout);
  assert.equal(line[1], "PASS", "this checkout's own install is complete");
  assert.ok(
    doctorProfiles["full"]?.includes("kernel-artifacts-incomplete"),
    "full does not promote kernel-artifacts-incomplete",
  );
  for (const profile of ["generic", "local-only", "direct-pr"]) {
    assert.equal(
      doctorProfiles[profile]?.includes("kernel-artifacts-incomplete"),
      false,
      `${profile} promotes kernel-artifacts-incomplete and should not`,
    );
  }
});

test("this phase's new behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "doctor-kernel-artifacts-missing-directory",
    "doctor-kernel-artifacts-missing-file",
    "doctor-kernel-artifacts-empty-directory",
    "doctor-kernel-artifacts-complete-passes",
    "doctor-kernel-artifacts-names-every-missing",
    "doctor-kernel-artifacts-resolution-does-not-walk-past",
    "doctor-kernel-artifacts-unresolvable-root-fails",
    "doctor-kernel-artifacts-fifo-refused",
    "doctor-kernel-artifacts-promoted-under-full-only",
    "doctor-kernel-artifacts-capture-contract",
    "doctor-kernel-artifacts-capture-reproduced",
    "doctor-kernel-artifacts-presence-is-not-resolvability",
    "doctor-kernel-artifacts-resolvability-capture",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

/**
 * THE CAPTURED CONTRACT, and the live reproduction beside it.
 *
 * red-witness rule (f) binds this behavior's witness to a real capture because
 * the changed module spawns subprocesses, and the honest capture for THIS
 * behavior is the output of the program the check actually reports through:
 * the built CLI of a STAGED INSTALL. The capture at
 * witness/captures/doctor-kernel-artifacts-staged-install.txt was taken on
 * 2026-08-15 against node v26.6.0 and records three cases with their exit
 * codes: a complete install under `--for full` (PASS, exit 0), the same
 * install with roles/ removed under `--for full` (FAIL, exit 1), and that same
 * broken install with no profile (WARN, exit 0).
 *
 * The test asserts the recorded contract AND reproduces it live, so the
 * assertion is anchored to real captured output rather than to a hand-written
 * string chosen to match the implementation (CLAUDE.md warning 10).
 */
const capturePath = join(
  repoRoot,
  "witness",
  "captures",
  "doctor-kernel-artifacts-staged-install.txt",
);

test("the staged-install capture records the three-case contract this check ships", () => {
  const captured = readFileSync(capturePath, "utf8");
  assert.match(captured, /CHECK kernel-artifacts PASS .* carries roles\/, schemas\/, checklists\/ and AGENTS\.md/);
  assert.match(captured, /CHECK kernel-artifacts FAIL .* is missing roles\/ \(absent\) \(required for profile full\)/);
  assert.match(captured, /CHECK kernel-artifacts WARN .* is missing roles\/ \(absent\)/);
  const exits = [...captured.matchAll(/^exit=(\d+)$/gm)].map((m) => m[1]);
  assert.deepEqual(exits, ["0", "1", "0"], "the captured exit codes are the contract");
});

test("a staged install of the built package reproduces the captured contract live", {
  skip: existsSync(join(repoRoot, "dist", "bin", "tiphys.js"))
    ? false
    : "dist/ is absent; run npm run build first (CI builds before it tests)",
}, (t) => {
  const lab = makeTempDir(t);
  const install = join(lab, "install");
  mkdirSync(install, { recursive: true });
  for (const entry of ["dist", "package.json", "roles", "schemas", "checklists", "AGENTS.md"]) {
    cpSync(join(repoRoot, entry), join(install, entry), { recursive: true });
  }
  const fleet = join(lab, "fleet");
  const staged = join(install, "dist", "bin", "tiphys.js");
  assert.equal(spawnSync(process.execPath, [staged, "init", fleet]).status, 0);

  const run = (args: string[]) =>
    spawnSync(process.execPath, [staged, ...args], { cwd: fleet, encoding: "utf8" });

  const complete = run(["doctor"]);
  assert.match(complete.stdout, /^CHECK kernel-artifacts PASS /m, complete.stdout);

  rmSync(join(install, "roles"), { recursive: true });
  const brokenFull = run(["doctor", "--for", "full"]);
  assert.match(
    brokenFull.stdout,
    /^CHECK kernel-artifacts FAIL .* is missing roles\/ \(absent\) \(required for profile full\)$/m,
    brokenFull.stdout,
  );
  assert.equal(brokenFull.status, 1);

  const brokenGeneric = run(["doctor"]);
  assert.match(
    brokenGeneric.stdout,
    /^CHECK kernel-artifacts WARN .* is missing roles\/ \(absent\)$/m,
    brokenGeneric.stdout,
  );
  assert.equal(brokenGeneric.status, 0, "the unpromoted arm must not fail the fleet");
});

/* ------------------------------------------------------------------ */
/* M4-P17: the post-reclaim checks, and the lock verdict that was wrong */
/* ------------------------------------------------------------------ */

/**
 * The two modules this phase makes agree with each other, imported through
 * computed URLs for the reason recorded at the head of this file (TS2878
 * across the project reference).
 */
interface LeaseShape {
  holderId: string;
  hostname: string;
  acquiredAt: string;
  expiresAt: string;
  durationSeconds: number;
  token: string;
}
const { lockCheckFor, PROFILES, checkBranches } = (await import(
  new URL("../src/commands/doctor.ts", import.meta.url).href
)) as {
  lockCheckFor: (
    holderId: string,
    expiresAt: string,
    nowMs: number,
  ) => { name: string; status: string; detail: string; condition?: string };
  PROFILES: Record<string, readonly string[]>;
  checkBranches: (
    root: string,
  ) => { name: string; status: string; detail: string; condition?: string };
};
const { isExpired } = (await import(
  new URL("../src/lock.ts", import.meta.url).href
)) as { isExpired: (lease: LeaseShape, nowMs: number) => boolean };

const P17_IDENTITY = {
  GIT_AUTHOR_NAME: "Doctor Test",
  GIT_AUTHOR_EMAIL: "doctor-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Doctor Test",
  GIT_COMMITTER_EMAIL: "doctor-test@tiphys.invalid",
};

/**
 * git in a scratch repository, with a command-scoped identity (warning 5),
 * stdout UNTRIMMED.
 *
 * The trimming sibling below is the one nearly every caller wants. This one
 * exists because `--format=%(refname)%09%(symref)` ends every non-symbolic row
 * with a TAB and an empty field, and trimming would delete exactly the byte a
 * capture comparison is there to check.
 */
function gitRaw(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...P17_IDENTITY },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout ?? "";
}

/** git in a scratch repository, with a command-scoped identity (warning 5). */
function git(cwd: string, args: string[]): string {
  return gitRaw(cwd, args).trim();
}

/** A fleet home with a file:// remote it has been pushed to, in sync. */
function fleetWithRemote(t: { after(fn: () => void): void }): {
  fleet: string;
  remote: string;
} {
  const lab = makeTempDir(t);
  const fleet = join(lab, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const remote = join(lab, "fleet-remote.git");
  git(lab, ["init", "--bare", "--quiet", "--initial-branch=main", remote]);
  git(fleet, ["remote", "add", "origin", `file://${remote}`]);
  git(fleet, ["push", "--quiet", "-u", "origin", "HEAD"]);
  return { fleet, remote };
}

/** One CHECK line by name, or undefined when doctor did not print it. */
function checkLine(stdout: string, name: string): string | undefined {
  return stdout.split("\n").find((line) => line.startsWith(`CHECK ${name} `));
}

/** Every remote-tracking ref in a repository, by full refname, sorted. */
function remoteRefNames(repo: string): string[] {
  return git(repo, ["for-each-ref", "--format=%(refname)", "refs/remotes"])
    .split("\n")
    .filter((line) => line !== "")
    .sort();
}

/**
 * A `CHECK branches` line with its pushed-branch TOTAL rendered `<total>`.
 *
 * THE TOTAL IS THE ONE TOKEN IN THAT LINE THIS FIXTURE DOES NOT OWN, and
 * pinning it is how this test failed in CI while passing locally at the same
 * commit (M4-P17 fix round 1). The total counts the refs under refs/remotes,
 * and git maintains that set on its own account: since git 2.48.0 `git fetch`
 * writes refs/remotes/origin/HEAD when the remote advertises one and the local
 * side has none, which `remote.<name>.followRemoteHEAD` documents as its
 * default `create`. CI ran git 2.55.0 and this container runs 2.43.0, so one
 * honest run saw two refs and the other saw one. Binding convention 5 states
 * the rule this breaks: an exact count is assertable only over a set the test
 * itself fully controls.
 *
 * Everything else in the line stays compared BYTE FOR BYTE against the
 * recorded capture, including the count of UNMERGED branches and their names,
 * which this fixture does create and therefore does own. The same transform is
 * applied to both sides, so no expectation here is hand-written.
 *
 * The `notEqual` is the guard on the guard: if the line's wording ever stops
 * carrying a total in this shape, the replace becomes an identity and this
 * helper would quietly go back to pinning a moving number, which is a check
 * that cannot go red (CLAUDE.md, T-008's postscript).
 */
function branchLineWithoutTotal(line: string): string {
  const relaxed = line.replace(
    /(^CHECK branches (?:PASS|WARN) (?:\d+ of )?)\d+( pushed branch\(es\))/,
    "$1<total>$2",
  );
  assert.notEqual(relaxed, line, `no pushed-branch total to relax in: ${line}`);
  return relaxed;
}

/** An expired lease record, written at the lease path. */
function writeLease(fleet: string, holderId: string, expiresAt: string): void {
  writeFileSync(
    join(fleet, "state", "orchestrator.lock"),
    `${JSON.stringify(
      {
        holderId,
        hostname: "doctor-test-host",
        acquiredAt: new Date(Date.parse(expiresAt) - 60_000).toISOString(),
        expiresAt,
        durationSeconds: 60,
        token: "doctor-test-token",
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * THE TWO CAPTURES THIS PHASE'S ASSERTIONS ARE ANCHORED TO.
 *
 * Every check added or corrected here reports over ANOTHER PROGRAM'S output:
 * `CHECK remote` parses `git rev-list --left-right --count` and reads `git
 * fetch`'s exit code, `CHECK branches` reads `git merge-base --is-ancestor`'s
 * exit code, and all of them are printed by the tiphys CLI itself. The
 * red-witness rule's clause (f) binds here for exactly that reason, so the
 * expected strings below are not written by hand: they are read out of real
 * recorded runs and the live run is compared against them.
 *
 * The rev-list counts are TAB separated, which is the kind of byte a
 * hand-written expectation loses; recording it is most of the point.
 *
 * Both captures were taken on 2026-09-17, node v26.6.0, git 2.43.0, by
 * a script kept with the phase's work history. The only alteration in either
 * is that the lab's absolute path is rendered `<LAB>` in the two lines that
 * carried it, which the capture says in its own text.
 */
const P17_CLI_CAPTURE = readFileSync(
  join(repoRoot, "witness", "captures", "m4-p17-doctor-cli.txt"),
  "utf8",
);
const P17_GIT_CAPTURE = readFileSync(
  join(repoRoot, "witness", "captures", "m4-p17-git-remote-comparison.txt"),
  "utf8",
);

/** The lines a capture recorded under one `== heading ==`. */
function capturedBlock(capture: string, heading: string): string[] {
  const lines = capture.split("\n");
  const at = lines.indexOf(`== ${heading} ==`);
  assert.ok(at >= 0, `the capture no longer records "${heading}"`);
  /* A BLOCK ENDS AT THE NEXT HEADING, NOT AT THE NEXT BLANK LINE. git's own
     failure message carries a blank line in the middle of it, so a
     blank-terminated reader truncates exactly the block whose exit code
     matters most. Empty lines are dropped rather than ending the block. */
  const block: string[] = [];
  for (let index = at + 1; index < lines.length; index += 1) {
    const line = lines[index] as string;
    if (line.startsWith("== ") && line.endsWith(" ==")) {
      break;
    }
    if (line !== "") {
      block.push(line);
    }
  }
  assert.ok(block.length > 0, `the capture records "${heading}" with nothing under it`);
  return block;
}

/** The single CHECK line a doctor-CLI capture block recorded, and its exit. */
function capturedCheck(heading: string): { line: string; exit: number } {
  const block = capturedBlock(P17_CLI_CAPTURE, heading);
  const line = block.find((entry) => entry.startsWith("CHECK "));
  const exit = block.find((entry) => entry.startsWith("exit="));
  assert.ok(line !== undefined, `no CHECK line recorded under "${heading}"`);
  assert.ok(exit !== undefined, `no exit code recorded under "${heading}"`);
  return { line, exit: Number(exit.slice("exit=".length)) };
}

/*
 * CRITERION 1. THE DANGEROUS STATE IS THE EXPIRED LEASE ITSELF, not an
 * absent feature: before this phase this exact input printed
 * `CHECK lock PASS lease held by ... (expired)` and doctor exited 0, so a
 * fleet whose orchestrator had died holding the lease read as healthy to
 * anyone scanning for FAIL lines.
 *
 * THE ASSERTION IS THE STATUS TOKEN AND THE EXIT CODE. The plan says in
 * terms that a test asserting only that the detail contains the word
 * `expired` is green against the old code and is refused at review, and it
 * is right: the old detail contained that word.
 */
test("doctor reports CHECK lock FAIL and exits 1 for a lease that expired one second ago", (t) => {
  const fleet = initFleet(t);
  const expiresAt = new Date(Date.now() - 1000).toISOString();
  writeLease(fleet, "orchestrator-p17", expiresAt);

  const result = runCli(["doctor"], { cwd: fleet });
  const line = checkLine(result.stdout, "lock");
  assert.ok(line !== undefined, result.stdout);
  const parsed = /^CHECK lock (PASS|WARN|FAIL) (.+)$/.exec(line);
  assert.ok(parsed !== null, line);
  assert.equal(parsed[1], "FAIL", line);
  assert.equal(result.status, 1, result.stdout);
  // The detail names the holder and the expiry, because the remedy needs
  // both: who to ask before breaking the lease, and when it lapsed.
  assert.ok((parsed[2] as string).includes("orchestrator-p17"), line);
  assert.ok((parsed[2] as string).includes(expiresAt), line);

  // AND THE SAME VERDICT, ANCHORED TO A REAL RECORDED RUN. A fixed past
  // instant makes the line reproducible byte for byte, so this arm compares
  // against captured output of the CLI rather than against a sentence
  // written here to match the implementation.
  const recorded = capturedCheck("lock: a lease that expired at a fixed past instant");
  writeLease(fleet, "orchestrator-p17", "2026-01-01T00:00:00.000Z");
  const replayed = runCli(["doctor"], { cwd: fleet });
  assert.equal(checkLine(replayed.stdout, "lock"), recorded.line, replayed.stdout);
  assert.equal(replayed.status, recorded.exit, replayed.stdout);
});

/*
 * CRITERION 2, the second member of the class and structurally different
 * from the first: the INCLUSIVE BOUNDARY rather than the interior.
 *
 * `Date.now()` cannot be driven to a chosen millisecond from outside a
 * process, so this member is unreachable through the CLI: by the time the
 * child runs, "exactly now" has become "a moment ago" and the case under
 * test is criterion 1's again. `lockCheckFor` takes the clock as a
 * parameter for exactly this reason.
 *
 * AND IT IS AN AGREEMENT TEST, not a second opinion. The property the plan
 * asks for is that doctor "agree with the lock module rather than carry a
 * second comparison", so the verdict is compared against `isExpired` at
 * every offset including zero. A doctor carrying its own `<` agrees at
 * every other offset and disagrees at exactly one millisecond, which is a
 * gap no reviewer finds by reading.
 */
test("the lock check and the lock module agree at the inclusive expiry boundary", () => {
  const expiresAt = "2026-06-01T12:00:00.000Z";
  const expiryMs = Date.parse(expiresAt);
  const lease: LeaseShape = {
    holderId: "boundary-holder",
    hostname: "boundary-host",
    acquiredAt: "2026-06-01T11:59:00.000Z",
    expiresAt,
    durationSeconds: 60,
    token: "boundary-token",
  };
  const disagreements: string[] = [];
  for (const offset of [-60_000, -1, 0, 1, 60_000]) {
    const nowMs = expiryMs + offset;
    const doctorSaysExpired = lockCheckFor(lease.holderId, expiresAt, nowMs).status === "FAIL";
    const moduleSaysExpired = isExpired(lease, nowMs);
    if (doctorSaysExpired !== moduleSaysExpired) {
      disagreements.push(
        `offset ${String(offset)}ms: doctor ${String(doctorSaysExpired)}, isExpired ${String(moduleSaysExpired)}`,
      );
    }
  }
  assert.deepEqual(disagreements, [], disagreements.join("; "));
  // And the boundary itself, stated rather than left implicit in the loop:
  // `<=` makes expiry inclusive, so "exactly now" is expired.
  assert.equal(lockCheckFor(lease.holderId, expiresAt, expiryMs).status, "FAIL");
  assert.equal(lockCheckFor(lease.holderId, expiresAt, expiryMs - 1).status, "PASS");
});

/*
 * CRITERION 3. Three tasks, one of them open, and the line the plan
 * specifies verbatim.
 */
test("doctor CHECK tasks names the open task and counts it against the total", (t) => {
  const fleet = initFleet(t);
  for (const id of ["t-closed-a", "t-closed-b", "t-open"]) {
    mkdirSync(join(fleet, "tasks", id), { recursive: true });
    writeFileSync(join(fleet, "tasks", id, "meta.json"), `{"taskId":"${id}"}\n`);
  }
  writeFileSync(join(fleet, "tasks", "t-closed-a", "turn-end"), "0\n");
  writeFileSync(join(fleet, "tasks", "t-closed-b", "turn-end"), "0\n");

  const recorded = capturedCheck("tasks: three tasks, one of them open");
  // The plan's line, verbatim, and the same line a real run produced.
  assert.equal(recorded.line, "CHECK tasks WARN 1 open of 3 (t-open)", recorded.line);
  const result = runCli(["doctor"], { cwd: fleet });
  assert.equal(checkLine(result.stdout, "tasks"), recorded.line, result.stdout);
  // WARN, so the exit code does not move: an open task is the ordinary
  // state of a working fleet, not a defect.
  assert.equal(result.status, nodeFloorMet ? 0 : 1, result.stdout);
});

/*
 * CRITERION 3, the half that makes the check worth having: ESTABLISHED,
 * ABSENT and UNUSABLE never print the same word.
 *
 * THE DANGEROUS STATE IS A CHECK THAT SKIPS WHAT IT CANNOT READ. The kernel
 * carries a live instance of exactly that (the retention check's raw `kind`
 * read, tracked at delivery/verification/tracked-doctor-charter-selection.md:1),
 * where an unreadable document is skipped and the command then reports PASS
 * over a fleet it could not examine. A tasks check written the same way
 * would report `0 open of 0` over the fixture below.
 *
 * THREE STRUCTURALLY DIFFERENT MEMBERS, because one is not a class: a task
 * directory with no meta.json at all, a meta.json that is a DIRECTORY (so
 * the path exists and is not readable as a record), and a turn-end that is
 * a directory (so whether the turn ended cannot be established even though
 * the task record is fine).
 */
test("a task whose state cannot be established is named, never silently skipped", (t) => {
  const fleet = initFleet(t);
  // An ordinary open task, so the count has something true to say.
  mkdirSync(join(fleet, "tasks", "t-real"), { recursive: true });
  writeFileSync(join(fleet, "tasks", "t-real", "meta.json"), '{"taskId":"t-real"}\n');
  // Member 1: no meta.json.
  mkdirSync(join(fleet, "tasks", "t-nometa"), { recursive: true });
  // Member 2: meta.json is a directory.
  mkdirSync(join(fleet, "tasks", "t-dirmeta", "meta.json"), { recursive: true });
  // Member 3: the record is fine and turn-end is a directory.
  mkdirSync(join(fleet, "tasks", "t-dirturn"), { recursive: true });
  writeFileSync(join(fleet, "tasks", "t-dirturn", "meta.json"), '{"taskId":"t-dirturn"}\n');
  mkdirSync(join(fleet, "tasks", "t-dirturn", "turn-end"), { recursive: true });

  const recorded = capturedCheck("tasks: one open, three whose state cannot be established");
  const result = runCli(["doctor"], { cwd: fleet });
  const line = checkLine(result.stdout, "tasks");
  assert.ok(line !== undefined, result.stdout);
  assert.equal(line, recorded.line, result.stdout);
  assert.match(line, /^CHECK tasks WARN /, line);
  // The total counts all four candidates, so none of them was dropped.
  assert.match(line, /1 open of 4 \(t-real\)/, line);
  assert.match(line, /3 not established/, line);
  for (const id of ["t-nometa", "t-dirmeta", "t-dirturn"]) {
    assert.ok(line.includes(id), `${id} was not named: ${line}`);
  }
  // And it is not a PASS, which is the whole point.
  assert.doesNotMatch(line, /^CHECK tasks PASS /, line);
});

/*
 * CRITERION 3's constraint half. C-1 and C-2 are asserted over the SOURCE
 * of the check, because a violation of either is invisible in the output:
 * a check that shelled out to `ps` would print the same line.
 */
test("the tasks check reads meta.json and turn-end only, never a log tail or a process", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/commands/doctor.ts", import.meta.url)),
    "utf8",
  );
  const start = source.indexOf("export function checkTasks(");
  const end = source.indexOf("export function checkBranches(");
  assert.ok(start > 0 && end > start, "checkTasks could not be located");
  const body = source.slice(start, end);
  for (const forbidden of ["/proc", "process.kill", "pid", "stream.jsonl"]) {
    assert.equal(body.includes(forbidden), false, `checkTasks mentions ${forbidden}`);
  }
  // The scan must be looking at the right thing, or it is green and empty
  // whatever the body says (T-008's postscript).
  for (const required of ["meta.json", "turn-end", "classifyEntry"]) {
    assert.ok(body.includes(required), `checkTasks no longer mentions ${required}`);
  }
});

/*
 * CRITERION 5. A branch that is pushed and not merged is reported by name,
 * and the exit code does not move.
 */
test("doctor CHECK branches names a pushed branch that is not merged", (t) => {
  const { fleet } = fleetWithRemote(t);
  const mergedRecorded = capturedCheck("branches: one pushed branch, merged");
  const merged = runCli(["doctor"], { cwd: fleet });
  const mergedLine = checkLine(merged.stdout, "branches");
  assert.ok(mergedLine !== undefined, merged.stdout);
  assert.equal(
    branchLineWithoutTotal(mergedLine),
    branchLineWithoutTotal(mergedRecorded.line),
    merged.stdout,
  );

  git(fleet, ["checkout", "--quiet", "-b", "task/t-unmerged"]);
  writeFileSync(join(fleet, "backlog.md"), "an unmerged change\n");
  git(fleet, ["commit", "--quiet", "-am", "unmerged work"]);
  git(fleet, ["push", "--quiet", "origin", "task/t-unmerged"]);
  git(fleet, ["checkout", "--quiet", "main"]);

  /* THE CHECK'S INPUT IS ANOTHER PROGRAM'S EXIT CODE, so the contract is
     read out of a real capture and reproduced live before the verdict is
     believed. `--is-ancestor` answers 0 for merged and 1 for unmerged, and a
     check that read those the other way round, or that treated any nonzero
     as unmerged, would be wrong in a way no output shows. */
  const ancestorArms = [
    { heading: "git merge-base --is-ancestor origin/task/t-unmerged origin/main", args: ["origin/task/t-unmerged", "origin/main"] },
    { heading: "git merge-base --is-ancestor origin/main origin/main", args: ["origin/main", "origin/main"] },
  ];
  for (const arm of ancestorArms) {
    const recordedExit = Number(
      (capturedBlock(P17_GIT_CAPTURE, arm.heading).find((entry) => entry.startsWith("exit: ")) ?? "")
        .slice("exit: ".length),
    );
    const live = spawnSync("git", ["-C", fleet, "merge-base", "--is-ancestor", ...arm.args], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    assert.equal(live.status, recordedExit, `${arm.heading} no longer exits ${String(recordedExit)}`);
  }

  const recorded = capturedCheck("branches: a pushed branch that is not merged");
  const result = runCli(["doctor"], { cwd: fleet });
  const line = checkLine(result.stdout, "branches");
  assert.ok(line !== undefined, result.stdout);
  assert.equal(
    branchLineWithoutTotal(line),
    branchLineWithoutTotal(recorded.line),
    result.stdout,
  );
  /* THE PROPERTY THIS TEST IS NAMED FOR, asserted on its own rather than left
     to fall out of a whole-line comparison: the unmerged branch is NAMED, and
     the count of unmerged branches is 1 because this fixture pushed exactly
     one. Both are things the test owns, unlike the total above. */
  assert.ok(line.includes("origin/task/t-unmerged"), line);
  assert.match(line, /^CHECK branches WARN 1 of /, line);
  assert.equal(result.status, merged.status, "the branches check moved doctor's exit code");
  assert.equal(result.status, recorded.exit, result.stdout);
});

/*
 * CRITERION 5's COUNT, and the defect a CI-only failure exposed (fix round 1).
 *
 * `CHECK branches` counted refs/remotes/origin/HEAD as a pushed branch. The
 * filter meant to drop it read `endsWith("/HEAD")` over `%(refname:short)`,
 * and git renders refs/remotes/origin/HEAD short as `origin`, never
 * `origin/HEAD`, so the filter was dead on exactly the ref it was written for.
 * Measured on git 2.43.0 over this fixture, `git for-each-ref
 * --format=%(refname:short) refs/remotes` prints `origin` and `origin/main`.
 *
 * THE DANGEROUS STATE IS THE REF BEING PRESENT, not a feature being absent:
 * since git 2.48.0 `git fetch` creates it unaided (`remote.<name>.followRemoteHEAD`,
 * documented default `create`), so on a current git every operator read a branch
 * total one too high per remote, and doctor ran `merge-base --is-ancestor` over
 * an alias as though it were a branch.
 *
 * THREE STRUCTURALLY DIFFERENT MEMBERS, because one is not a class, and they
 * are chosen so that neither half of the fix is left unwitnessed. The fix
 * drops a row when the FULL refname ends in `/HEAD` or when the row carries a
 * symref target, and the members are: refs/remotes/origin/HEAD as the symbolic
 * ref git writes (both halves catch it), the same path written as an ORDINARY
 * ref (only the name half catches it), and a symbolic remote-tracking ref
 * under another name (only the symref half catches it). Every member is red
 * against the shipped filter, and each half alone leaves one member counted.
 *
 * THE COUNT IS PINNED HERE AND RELAXED IN THE TEST ABOVE, deliberately. This
 * test calls checkBranches directly rather than running the CLI, so nothing
 * fetches and no git version can add a ref behind its back; the ref set is
 * asserted before every call and is exactly what this test wrote. A fully
 * controlled set is the condition binding convention 5 names for an exact
 * count being assertable at all.
 */
test("a remote-tracking ref that is not a branch is not counted as one", (t) => {
  const { fleet } = fleetWithRemote(t);
  /* THE FIXTURE OWNS ITS REF SET, and it says so rather than assuming it. The
     push and fetch that built this fleet may already have written
     refs/remotes/origin/HEAD on a git that does that, and an exact count is
     assertable only over a set the test itself controls, so anything the test
     did not write is removed before the baseline is taken. */
  for (const ref of remoteRefNames(fleet)) {
    if (ref !== "refs/remotes/origin/main") {
      git(fleet, ["update-ref", "--no-deref", "-d", ref]);
    }
  }
  const expected = "1 pushed branch(es), none unmerged into origin/main";
  const REF_FORMAT = "%(refname)%09%(symref)";
  const liveRows = (format: string): string[] =>
    gitRaw(fleet, ["for-each-ref", `--format=${format}`, "refs/remotes"])
      .split("\n")
      .filter((row) => row !== "");
  const recordedRows = (heading: string): string[] =>
    capturedBlock(P17_GIT_CAPTURE, heading).filter((entry) => !entry.startsWith("exit: "));

  assert.deepEqual(
    liveRows(REF_FORMAT),
    recordedRows(
      "git for-each-ref --format=%(refname)%09%(symref) refs/remotes, one pushed branch",
    ),
    "the baseline fixture no longer matches the recorded one",
  );
  assert.equal(checkBranches(fleet).detail, expected, "the baseline fixture");

  /* THE DEFECT IN ONE LINE, read out of a real capture and reproduced live
     rather than asserted from the implementation: the rendering the shipped
     filter tested `/HEAD` against does not contain `/HEAD`. */
  git(fleet, ["remote", "set-head", "origin", "-a"]);
  assert.deepEqual(
    liveRows("%(refname:short)"),
    recordedRows(
      "git for-each-ref --format=%(refname:short) refs/remotes, with a remote HEAD present",
    ),
    "git no longer shortens refs/remotes/origin/HEAD to origin",
  );
  git(fleet, ["update-ref", "--no-deref", "-d", "refs/remotes/origin/HEAD"]);

  const members = [
    {
      name: "the symbolic ref git 2.48.0 and later write on fetch",
      extra: "refs/remotes/origin/HEAD",
      heading: `git for-each-ref --format=${REF_FORMAT} refs/remotes, a symbolic remote HEAD`,
      stage: (): void => {
        git(fleet, ["remote", "set-head", "origin", "-a"]);
      },
    },
    {
      name: "the same path written as an ordinary ref",
      extra: "refs/remotes/origin/HEAD",
      heading: `git for-each-ref --format=${REF_FORMAT} refs/remotes, an ordinary remote HEAD`,
      stage: (): void => {
        git(fleet, [
          "update-ref",
          "--no-deref",
          "refs/remotes/origin/HEAD",
          git(fleet, ["rev-parse", "origin/main"]),
        ]);
      },
    },
    {
      name: "a symbolic remote-tracking ref under another name",
      extra: "refs/remotes/origin/trunk",
      heading: `git for-each-ref --format=${REF_FORMAT} refs/remotes, a symbolic ref under another name`,
      stage: (): void => {
        git(fleet, ["symbolic-ref", "refs/remotes/origin/trunk", "refs/remotes/origin/main"]);
      },
    },
  ];
  for (const member of members) {
    member.stage();
    /* THE FIXTURE REALLY CARRIES THE EXTRA REF, and what git wrote is compared
       against the recorded capture rather than described, so this arm cannot
       be green over a state that never occurred. */
    assert.deepEqual(liveRows(REF_FORMAT), recordedRows(member.heading), member.name);
    const result = checkBranches(fleet);
    assert.equal(result.status, "PASS", `${member.name}: ${result.detail}`);
    assert.equal(result.detail, expected, member.name);
    // Back to the baseline, so the next member is staged on its own.
    git(fleet, ["update-ref", "--no-deref", "-d", member.extra]);
    assert.deepEqual(remoteRefNames(fleet), ["refs/remotes/origin/main"], member.name);
  }
});

/*
 * CRITERION 5's binding half, and the reason it is a test rather than a
 * comment. Remote branch deletion is REFUSED in the container this kernel
 * is built in, and `git push --dry-run --delete` exits 0 whether it is
 * allowed or not (CLAUDE.md standing warning 14), so a promotable branch
 * check would make `--for full` unpassable on the kernel's own fleet with
 * no remedy its operator could reach. The assertion walks every profile
 * rather than naming `full`, so a profile added later cannot promote these
 * by accident.
 */
test("no profile promotes this phase's new conditions to FAIL", () => {
  const introduced = [
    "tasks-open",
    "tasks-not-established",
    "branches-unmerged",
    "branches-not-established",
    "remote-diverged",
    "remote-untracked",
    "remote-not-a-fleet",
  ];
  const promoted: string[] = [];
  for (const [profile, conditions] of Object.entries(PROFILES)) {
    for (const condition of conditions) {
      if (introduced.includes(condition)) {
        promoted.push(`${profile} promotes ${condition}`);
      }
    }
  }
  assert.deepEqual(promoted, [], promoted.join("; "));
  // The walk must see something, or it is green over an empty table.
  assert.ok(
    Object.values(PROFILES).some((conditions) => conditions.length > 0),
    "no profile promotes anything, so this assertion is vacuous",
  );
});

/*
 * CRITERION 6, MEMBER A. The dangerous state is a fleet whose work is only
 * on this disk. Before this phase that fleet printed
 * `CHECK remote PASS remote configured (origin)`, because the old check
 * read a config file and never touched the remote.
 */
test("doctor CHECK remote reports unpushed commits where it used to name the configured remote", (t) => {
  const { fleet } = fleetWithRemote(t);
  const synced = runCli(["doctor"], { cwd: fleet });
  assert.equal(
    checkLine(synced.stdout, "remote"),
    capturedCheck("remote: pushed and in sync").line,
    synced.stdout,
  );

  for (const name of ["one", "two"]) {
    writeFileSync(join(fleet, `${name}.md`), `${name}\n`);
    git(fleet, ["add", "-A"]);
    git(fleet, ["commit", "--quiet", "-m", name]);
  }

  /* THE SEPARATOR IS A TAB, and that is why this is read out of a capture
     rather than written here. A hand-written expectation of "0 2" is the
     shape CLAUDE.md warning 10 exists for: it would agree with a parser
     splitting on a single space and disagree with git. */
  const liveCounts = spawnSync(
    "git",
    ["-C", fleet, "rev-list", "--left-right", "--count", "origin/main...HEAD"],
    { encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" } },
  );
  assert.equal(liveCounts.status, 0, liveCounts.stderr);
  const countsLine = (liveCounts.stdout ?? "").split("\n")[0] as string;
  assert.ok(
    countsLine.includes("\t"),
    `git separated the counts with ${JSON.stringify(countsLine)}, not a tab`,
  );
  assert.deepEqual(
    capturedBlock(
      P17_GIT_CAPTURE,
      "git rev-list --left-right --count origin/main...HEAD, two commits ahead",
    ).slice(0, 1),
    [countsLine],
    "the live rev-list output is not the one the capture recorded",
  );

  const recorded = capturedCheck("remote: two commits that have never been pushed");
  assert.equal(recorded.line, "CHECK remote WARN 2 unpushed, 0 behind origin/main", recorded.line);
  const result = runCli(["doctor"], { cwd: fleet });
  const line = checkLine(result.stdout, "remote");
  assert.ok(line !== undefined, result.stdout);
  assert.equal(line, recorded.line, result.stdout);
  assert.doesNotMatch(line, /^CHECK remote PASS /, line);
});

/*
 * CRITERION 6, MEMBER B, structurally different: the fetch itself fails.
 *
 * THE IMPLEMENTATION THE PLAN NAMES AS WRONG is one that swallows the
 * fetch failure and falls back to the old non-empty-list test. That
 * implementation is GREEN in member A as well as here, which is why
 * member B exists: it is the arm that separates "the check asked the
 * remote" from "the check read a config file".
 */
test("a fetch that fails is its own verdict and never PASS", (t) => {
  const { fleet } = fleetWithRemote(t);
  const absent = join(makeTempDir(t), "not-a-repository.git");
  assert.equal(existsSync(absent), false, "precondition: the remote must not exist");
  git(fleet, ["remote", "set-url", "origin", `file://${absent}`]);

  const result = runCli(["doctor"], { cwd: fleet });
  const line = checkLine(result.stdout, "remote");
  assert.ok(line !== undefined, result.stdout);
  assert.doesNotMatch(line, /^CHECK remote PASS /, line);
  assert.match(line, /^CHECK remote FAIL /, line);
  // git's own words, not a sentence written here to match the code.
  const real = spawnSync("git", ["-C", fleet, "fetch", "--quiet", "origin"], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
  });
  /* THE RECORDED CONTRACT: a fetch of a remote that is there exits 0, and a
     fetch of one that is not exits 128. Both arms are read out of the capture
     and reproduced live, so "the fetch failed" is a measured fact about git
     rather than an assumption about what nonzero means. */
  const recordedGood = capturedBlock(P17_GIT_CAPTURE, "git fetch --quiet origin, a remote that is there");
  const recordedBad = capturedBlock(P17_GIT_CAPTURE, "git fetch --quiet origin, a remote that is not there");
  assert.ok(recordedGood.includes("exit: 0"), recordedGood.join("\n"));
  assert.ok(recordedBad.includes("exit: 128"), recordedBad.join("\n"));
  assert.equal(real.status, 128, `the control fetch exited ${String(real.status)}: ${real.stderr}`);
  assert.notEqual(real.status, 0, "the control fetch succeeded, so this fixture is not dangerous");
  const captured = (real.stderr ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry !== "");
  assert.ok(captured !== undefined && captured !== "", "the control fetch printed no stderr");
  assert.ok(
    line.includes(captured),
    `doctor's detail does not carry git's own first stderr line.\n` +
      `captured: ${captured}\nline: ${line}`,
  );
  assert.equal(result.status, 1, result.stdout);
});

/**
 * A TCP listener that accepts a connection and then says nothing, ever.
 * A CLOSED port fails fast and would leave the test below green against
 * the dangerous state, which is why the listener is real. The same shape
 * is used in test/pool.test.ts for the same reason.
 */
async function silentListener(t: {
  after(fn: () => void | Promise<void>): void;
}): Promise<number> {
  const net = await import("node:net");
  const sockets: Array<{ destroy(): void }> = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
  });
  await new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => {
      done();
    });
  });
  t.after(
    () =>
      new Promise<void>((done) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => {
          done();
        });
      }),
  );
  const address = server.address();
  assert.ok(address !== null && typeof address === "object", "the listener reported no address");
  return address.port;
}

/*
 * CRITERION 6's third member, and the one that pays for the bound. doctor
 * is the command an operator runs when a fleet is ALREADY misbehaving, so
 * a fetch that never returns costs the entire diagnosis rather than one
 * line. M4-P19 measured this exact shape against `pool list` and `doctor`
 * and found both still running at 25 seconds.
 *
 * The child carries a spawn timeout so that a FAILURE of the bound under
 * test shows up as a killed child rather than as a test run that never
 * ends: a witness that hangs when its behaviour is absent is a guard that
 * cannot go red, in the most literal way available.
 */
test("doctor returns against a remote that accepts and never answers", async (t) => {
  const { fleet } = fleetWithRemote(t);
  const port = await silentListener(t);
  git(fleet, ["remote", "set-url", "origin", `git://127.0.0.1:${String(port)}/nope.git`]);

  const started = Date.now();
  const result = runCli(["doctor"], {
    cwd: fleet,
    env: { ...process.env, TIPHYS_GIT_NETWORK_TIMEOUT_MS: "3000" },
    timeout: 15_000,
  });
  const elapsed = Date.now() - started;
  assert.notEqual(
    result.status,
    null,
    `doctor did not return against a silent remote and was killed after ${String(elapsed)}ms`,
  );
  const line = checkLine(result.stdout, "remote");
  assert.ok(line !== undefined, result.stdout);
  assert.match(line, /^CHECK remote FAIL /, line);
  assert.match(line, /did not answer within 3000ms and was killed/, line);
  // The rest of the diagnosis survived the failed probe.
  assert.ok(checkLine(result.stdout, "layout") !== undefined, result.stdout);
  assert.ok(checkLine(result.stdout, "kernel-artifacts") !== undefined, result.stdout);
});

/*
 * CRITERION 7. Adding checks did not change what doctor is: one line per
 * check, the exit code decided by FAIL alone, and the advisory after the
 * diagnosis rather than in front of it (CR-523).
 */
test("a FAILing check still leaves the whole diagnosis printed and the advisory last", (t) => {
  const fleet = initFleet(t);
  // An open task, so the watcher advisory has something to say.
  mkdirSync(join(fleet, "tasks", "t-advisory"), { recursive: true });
  writeFileSync(join(fleet, "tasks", "t-advisory", "meta.json"), '{"taskId":"t-advisory"}\n');
  writeLease(fleet, "orchestrator-p17", new Date(Date.now() - 1000).toISOString());

  const result = runCli(["doctor"], { cwd: fleet });
  const printed = [...checkLines(result.stdout).keys()];
  assert.deepEqual(
    printed,
    runChecks(fleet).map((check) => check.name),
    "doctor printed a different set of checks than runChecks computed",
  );
  assert.equal(result.status, 1, result.stdout);
  // Exactly one FAIL, so the new checks did not join the lock in failing.
  assert.deepEqual(
    [...checkLines(result.stdout).entries()]
      .filter(([, value]) => value.status === "FAIL")
      .map(([name]) => name),
    ["lock"],
    result.stdout,
  );
  // The advisory is on stderr and the diagnosis is whole, which is the
  // property CR-523 bought: a defect in an advisory must not cost the
  // diagnosis.
  assert.match(result.stderr, /watcher stale:/, result.stderr);
});

test("this phase's new doctor behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "doctor-lock-expired-is-fail",
    "doctor-lock-expiry-boundary-agrees-with-the-module",
    "doctor-tasks-open-count",
    "doctor-tasks-unestablished-is-not-a-pass",
    "doctor-tasks-no-log-tail-or-process-probe",
    "doctor-branches-unmerged-named",
    /* M4-P17 fix round 1. */
    "doctor-branches-remote-head-is-not-a-branch",
    "doctor-new-conditions-are-never-promoted",
    "doctor-remote-reports-unpushed",
    "doctor-remote-fetch-failure-is-not-a-pass",
    "doctor-remote-returns-against-a-silent-remote",
    "doctor-diagnosis-survives-a-failing-check",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});

test("M4-P30's doctor behaviors are registered in test/behaviors.json", () => {
  /* BY NAME, NEVER BY COUNT (binding convention 5). The registry is
     append-only, so a count here would be a claim about every later phase. */
  const behaviors = JSON.parse(
    readFileSync(join(repoRoot, "test", "behaviors.json"), "utf8"),
  ) as Record<string, string>;
  for (const id of [
    "doctor-retention-not-applicable-without-a-charter",
    "doctor-retention-not-applicable-and-undeclared-stay-distinct",
  ]) {
    assert.ok(
      Object.hasOwn(behaviors, id),
      `behavior ${id} does not resolve in test/behaviors.json`,
    );
  }
});
