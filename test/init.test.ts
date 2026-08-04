import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
