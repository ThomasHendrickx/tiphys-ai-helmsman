import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
const { nodeCheckFor } = (await import(
  new URL("../src/commands/doctor.ts", import.meta.url).href
)) as { nodeCheckFor: (range: string, version: string) => NodeCheckResult };

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

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

const CHECK_NAMES = [
  "node",
  "git",
  "gh",
  "layout",
  "remote",
  "lock",
  "beacon",
  "identity",
  /* M3-P8 step 7 (R-098). Appended, and the list is compared for EQUALITY
     rather than containment, so a check silently dropped is as red as one
     silently added. */
  "retention",
];

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
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
  assert.deepEqual([...checks.keys()], CHECK_NAMES, "one line per check, in order");
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

  /* THE VACUOUS PASS THIS CHECK MUST NOT HAVE (SC-011): a fleet whose charter
     declares NO retention is a WARN under the generic profile, never a silent
     PASS, and `--for full` promotes it. A check satisfied by an absent
     declaration is the shape this milestone exists to police. */
  const bare = initFleet(t);
  const generic = runCli(["doctor"], { cwd: bare });
  assert.match(generic.stdout, /^CHECK retention WARN /m);
  assert.equal(generic.status, nodeFloorMet ? 0 : 1);

  const full = runCli(["doctor", "--for", "full"], { cwd: bare });
  assert.match(full.stdout, /^CHECK retention FAIL .*required for profile full/m);
  assert.equal(full.status, 1);
});
