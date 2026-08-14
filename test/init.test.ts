import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));

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
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p2-init-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function gitIn(dir: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env });
}

const FLEET_DIRS = ["charter", "decisions", "state", "tasks", "worktrees", "projects"];
const FLEET_FILES = ["backlog.md", "package.json", ".gitignore"];

test("init creates the fleet layout and a git repo with a bootstrap commit", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  const result = runCli(["init", fleet]);
  assert.equal(result.status, 0, result.stderr);
  for (const name of FLEET_DIRS) {
    assert.ok(statSync(join(fleet, name)).isDirectory(), `${name}/ missing`);
  }
  for (const name of FLEET_FILES) {
    assert.ok(statSync(join(fleet, name)).isFile(), `${name} missing`);
  }
  assert.ok(existsSync(join(fleet, ".git")), ".git missing");
  const revList = gitIn(fleet, ["rev-list", "--count", "HEAD"]);
  assert.equal(revList.status, 0, revList.stderr);
  assert.ok(Number(revList.stdout.trim()) >= 1, "no bootstrap commit");
});

test("init on an initialized fleet exits nonzero and reports already initialized", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const second = runCli(["init", fleet]);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /already initialized/);
});

test("init refuses a non-empty directory that is not a fleet home", (t) => {
  const dir = join(makeTempDir(t), "occupied");
  mkdirSync(dir);
  writeFileSync(join(dir, "unrelated.txt"), "content\n");
  const result = runCli(["init", dir]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not empty/);
  assert.ok(!existsSync(join(dir, "backlog.md")), "init wrote into a refused dir");
});

test("init on a path that is an existing file exits 1 with a single reason line", (t) => {
  const filePath = join(makeTempDir(t), "occupied-file");
  writeFileSync(filePath, "content\n");
  const result = runCli(["init", filePath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exists and is not a directory/);
  assert.equal(
    result.stderr.trim().split("\n").length,
    1,
    `expected a single reason line, got: ${result.stderr}`,
  );
});

test("init gitignore tracks durable areas and ignores ephemera", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  for (const ignored of ["state/anything", "worktrees/anything", "projects/anything"]) {
    const result = gitIn(fleet, ["check-ignore", ignored]);
    assert.equal(result.status, 0, `${ignored} should be ignored`);
  }
  for (const tracked of ["decisions/anything", "charter/anything"]) {
    const result = gitIn(fleet, ["check-ignore", tracked]);
    assert.equal(result.status, 1, `${tracked} should not be ignored`);
  }
});

test("init bootstrap commit uses the machine identity without global git config", (t) => {
  const tmp = makeTempDir(t);
  const home = join(tmp, "home");
  mkdirSync(home);
  const fleet = join(tmp, "fleet");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    GIT_CONFIG_GLOBAL: join(home, "no-such-gitconfig"),
    GIT_CONFIG_SYSTEM: join(home, "no-such-system-gitconfig"),
  };
  delete env.GIT_AUTHOR_NAME;
  delete env.GIT_AUTHOR_EMAIL;
  delete env.GIT_COMMITTER_NAME;
  delete env.GIT_COMMITTER_EMAIL;
  const result = runCli(["init", fleet], { env });
  assert.equal(result.status, 0, result.stderr);
  const log = gitIn(fleet, ["log", "--format=%an|%ae|%cn|%ce", "-1"], env);
  assert.equal(log.status, 0, log.stderr);
  assert.equal(
    log.stdout.trim(),
    "Tiphys Fleet|fleet@tiphys.invalid|Tiphys Fleet|fleet@tiphys.invalid",
  );
  assert.ok(
    !existsSync(join(home, "no-such-gitconfig")),
    "a global git config file was created",
  );
  assert.deepEqual(
    readdirSync(home),
    [],
    "HOME gained files during init (global config touched)",
  );
});

test("init without a directory argument exits 64", () => {
  const result = runCli(["init"]);
  assert.equal(result.status, 64);
  assert.match(result.stderr, /usage: tiphys init/);
});

/**
 * M3-P10 step 3: the fleet-home kernel pin, replacing the M1-P2 placeholder.
 *
 * The placeholder was a DESCRIPTION field saying the pin "is added at M3 first
 * publish (kernel plan v1, M1-P2 step 2)", and its exact shape was verified
 * before it was replaced, which is what step 3 asks for.
 */
test("init writes a fleet package.json depending on the published kernel at an exact pin", (t) => {
  const fleet = join(makeTempDir(t), "fleet");
  /* THE EXIT CODE THIS ASSERTS IS GIT'S, ONE LAYER DOWN, which is why the
     witness for this behavior declares consumesExternalOutput and cites
     witness/captures/init-git-bootstrap-exit-codes.txt. `tiphys init` spawns
     `git init`, `git add -A` and `git commit`, reads ONLY their `status`, and
     returns 1 on any nonzero, so a 0 here is a claim about real git exit codes
     and not about this test's own arithmetic. The capture is real output from
     git 2.43.0 in a scratch tree and is read below rather than described, so an
     expectation that drifted from git's behaviour would redden (red-witness
     rule (f), and CLAUDE.md warning 10 on never deriving a signature from
     hand-written examples). */
  const capture = readFileSync(
    fileURLToPath(new URL("../witness/captures/init-git-bootstrap-exit-codes.txt", import.meta.url)),
    "utf8",
  );
  assert.match(capture, /git version 2\.\d+/);
  assert.equal((capture.match(/^EXIT=0$/gm) ?? []).length, 3, "the capture no longer shows three successful git commands");
  assert.match(capture, /^EXIT=1$/m);
  assert.equal(runCli(["init", fleet]).status, 0);
  const manifest = JSON.parse(readFileSync(join(fleet, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    description?: string;
  };

  const kernel = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  ) as { name: string; version: string };

  /* THE NAME IS DR-0008's, and it is read from the kernel's own manifest rather
     than typed here, so a rename would redden this test in the same act. */
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [kernel.name]);

  /* THE VERSION IS THE RUNNING KERNEL'S, not a number in the source. A fleet
     home is pinned to the kernel that initialized it. Comparing against the
     manifest rather than against a literal is what keeps this test from having
     to be edited on every release, which is the same reason CLAUDE.md gives for
     deriving counts at run time instead of pinning them. */
  assert.equal(manifest.dependencies?.[kernel.name], kernel.version);

  /* EXACT, WITH NO RANGE PREFIX. Blueprint section 3 makes the pin the upgrade
     mechanism, so a caret or a tilde here would mean a fleet home silently
     changed kernel between two `npm install` runs. `0.1.0` and `^0.1.0` both
     satisfy a naive equality against a version string only if the prefix is
     never added, so the prefix is asserted absent in its own right. */
  assert.match(manifest.dependencies?.[kernel.name] ?? "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

  /* THE PLACEHOLDER IS GONE. Its own text named the moment it was to be
     replaced, so a description still promising the pin later, beside a pin that
     is already there, is the drift this leg catches. */
  assert.equal(
    /placeholder|is added at M3/.test(manifest.description ?? ""),
    false,
    `the M1-P2 placeholder text survives beside the pin: ${String(manifest.description)}`,
  );
});
