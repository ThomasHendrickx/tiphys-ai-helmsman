/**
 * scripts/setup-env.sh, run against scratch repositories and fully offline:
 * npm is forced offline and the Node download base URL is a local directory.
 *
 * None of these tests depends on the Node floor. The fixtures declare a floor
 * the running interpreter meets, or put a fake interpreter on PATH, so they
 * run on the default toolchain and on CI alike.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const script = join(repoRoot, "scripts", "setup-env.sh");
const realBin = dirname(process.execPath);
const PINNED = "26.6.0";
const TOOLCHAIN = `node-v${PINNED}-linux-x64`;
const TARBALL = `${TOOLCHAIN}.tar.xz`;
const SUMMARY = /^setup-env: full clone, node v[0-9]+\.[0-9]+\.[0-9]+, dist built$/;
const OK_BUILD =
  "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/built.txt','built')\"";

/* A build that trusts its own record of what it emitted, as `tsc -b` trusts
   its .tsbuildinfo: while build.tsbuildinfo exists it writes nothing. Measured
   on this repository: after `rm dist/src/exec/env.js`, `npm run build` exits 0
   and does not re-emit the file. */
const INCREMENTAL_BUILD =
  "node -e \"const fs=require('fs');if(fs.existsSync('build.tsbuildinfo'))process.exit(0);fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/built.txt','built');fs.writeFileSync('build.tsbuildinfo','emitted')\"";

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "setup-env test",
  GIT_AUTHOR_EMAIL: "setup-env-test@example.invalid",
  GIT_COMMITTER_NAME: "setup-env test",
  GIT_COMMITTER_EMAIL: "setup-env-test@example.invalid",
};

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-setup-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd: string, args: string[]): string {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

/** A source repository with two commits carrying the real script. */
function sourceRepo(root: string, floor: string, build = OK_BUILD): string {
  const source = join(root, "source");
  mkdirSync(join(source, "scripts"), { recursive: true });
  git(root, ["init", "-q", "-b", "main", source]);
  writeFileSync(
    join(source, "package.json"),
    `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true, engines: { node: floor }, scripts: { build } }, null, 2)}\n`,
  );
  writeFileSync(
    join(source, "package-lock.json"),
    `${JSON.stringify({ name: "fixture", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "fixture", version: "1.0.0", engines: { node: floor } } } }, null, 2)}\n`,
  );
  writeFileSync(join(source, ".gitignore"), "dist/\nnode_modules/\n*.tsbuildinfo\n");
  cpSync(script, join(source, "scripts", "setup-env.sh"));
  git(source, ["add", "-A"]);
  git(source, ["commit", "-q", "-m", "one"]);
  writeFileSync(join(source, "README"), "two\n");
  git(source, ["add", "-A"]);
  git(source, ["commit", "-q", "-m", "two"]);
  return source;
}

function shallowClone(root: string, source: string): string {
  const clone = join(root, "clone");
  git(root, ["clone", "-q", "--depth", "1", pathToFileURL(source).href, clone]);
  return clone;
}

/** The environment every run gets: offline npm, a scratch HOME, no inherited hook state. */
function baseEnv(home: string, path: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...GIT_IDENTITY };
  for (const key of ["CLAUDE_ENV_FILE", "TIPHYS_NODE_DIST_URL", "TIPHYS_TOOLCHAINS_DIR"]) {
    delete env[key];
  }
  const empty = join(home, "no-dist");
  mkdirSync(empty, { recursive: true });
  return {
    ...env,
    HOME: home,
    PATH: path,
    npm_config_offline: "true",
    TIPHYS_NODE_DIST_URL: pathToFileURL(empty).href,
  };
}

function runScript(repo: string, env: NodeJS.ProcessEnv) {
  return spawnSync("bash", [join(repo, "scripts", "setup-env.sh")], {
    cwd: repo,
    encoding: "utf8",
    env,
    timeout: 120_000,
  });
}

function lastLine(text: string): string {
  const lines = text.trim().split("\n");
  return lines[lines.length - 1] ?? "";
}

function writeExecutable(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

/**
 * The offline Node floor fixture: a fake node below the floor, and a local
 * "dist" directory holding a fake toolchain tarball and its SHASUMS256.txt.
 * The fake toolchain's node reports the pinned version, logs each use to
 * $HOME/toolchain-node.log and hands everything else to the real interpreter;
 * its npm hands off to the real npm.
 */
function floorFixture(root: string, checksumOk: boolean) {
  const home = join(root, "home");
  mkdirSync(home);
  const low = join(root, "low-bin");
  writeExecutable(
    join(low, "node"),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v20.0.0; exit 0; fi\necho "the below-floor node was used" >&2\nexit 97\n',
  );
  const realNpm = join(realBin, "npm");
  assert.ok(existsSync(realNpm), `no npm beside the running interpreter at ${realNpm}`);
  const pkg = join(root, "pkg");
  writeExecutable(
    join(pkg, TOOLCHAIN, "bin", "node"),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo v${PINNED}; exit 0; fi\necho "$*" >> "$HOME/toolchain-node.log"\nexec "${process.execPath}" "$@"\n`,
  );
  writeExecutable(join(pkg, TOOLCHAIN, "bin", "npm"), `#!/bin/sh\nexec "${realNpm}" "$@"\n`);
  const dist = join(root, "node-dist");
  mkdirSync(dist);
  const tar = spawnSync("tar", ["-cJf", join(dist, TARBALL), "-C", pkg, TOOLCHAIN], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
  const sha = createHash("sha256").update(readFileSync(join(dist, TARBALL))).digest("hex");
  const listed = checksumOk ? sha : createHash("sha256").update("not the tarball").digest("hex");
  writeFileSync(
    join(dist, "SHASUMS256.txt"),
    `${"0".repeat(64)}  node-v${PINNED}-darwin-arm64.tar.xz\n${listed}  ${TARBALL}\n`,
  );
  const envFile = join(home, "claude-env");
  const env = {
    ...baseEnv(home, `${low}:${process.env["PATH"] ?? ""}`),
    TIPHYS_NODE_DIST_URL: pathToFileURL(dist).href,
    CLAUDE_ENV_FILE: envFile,
  };
  return { home, env, envFile, toolchain: join(home, ".toolchains", TOOLCHAIN) };
}

const major = process.versions.node.split(".")[0] as string;

test("setup-env turns a shallow clone into a full clone and builds dist", (t) => {
  const root = scratch(t);
  const source = sourceRepo(root, `>=${major}`);
  const clone = shallowClone(root, source);
  /* The dangerous state is really present before the run. */
  assert.equal(git(clone, ["rev-parse", "--is-shallow-repository"]), "true");
  assert.equal(git(clone, ["rev-list", "--count", "HEAD"]), "1");

  const home = join(root, "home");
  mkdirSync(home);
  const run = runScript(clone, baseEnv(home, `${realBin}:${process.env["PATH"] ?? ""}`));
  assert.equal(run.status, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(lastLine(run.stdout), SUMMARY);
  assert.equal(git(clone, ["rev-parse", "--is-shallow-repository"]), "false");
  assert.equal(git(clone, ["rev-list", "--count", "HEAD"]), "2");
  assert.ok(existsSync(join(clone, "dist", "built.txt")), "dist/ was not built");
});

test("setup-env below the Node floor installs the pinned toolchain from a verified tarball, uses it, and writes the PATH line to CLAUDE_ENV_FILE", (t) => {
  const root = scratch(t);
  const source = sourceRepo(root, ">=26");
  const { home, env, envFile, toolchain } = floorFixture(root, true);

  const run = runScript(source, env);
  assert.equal(run.status, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.equal(lastLine(run.stdout), `setup-env: full clone, node v${PINNED}, dist built`);
  assert.ok(existsSync(join(toolchain, "bin", "node")), "the toolchain was not installed");
  assert.deepEqual(readdirSync(join(home, ".toolchains")), [TOOLCHAIN], "a staging directory was left behind");
  assert.equal(readFileSync(envFile, "utf8"), `export PATH="${toolchain}/bin:$PATH"\n`);
  /* Used, not merely installed: the build ran node from the toolchain. */
  const log = join(home, "toolchain-node.log");
  assert.ok(
    existsSync(log) && readFileSync(log, "utf8").includes("dist/built.txt"),
    "the build never ran the installed node",
  );
  assert.ok(existsSync(join(source, "dist", "built.txt")), "dist/ was not built");

  /* A second run downloads nothing (the base URL now points at an empty
     directory) and does not repeat the PATH line. */
  const again = runScript(source, { ...env, TIPHYS_NODE_DIST_URL: pathToFileURL(join(home, "no-dist")).href });
  assert.equal(again.status, 0, `stdout=${again.stdout} stderr=${again.stderr}`);
  assert.equal(lastLine(again.stdout), `setup-env: full clone, node v${PINNED}, dist built`);
  assert.equal(readFileSync(envFile, "utf8"), `export PATH="${toolchain}/bin:$PATH"\n`);
});

test("setup-env with a tarball whose sha256 does not match SHASUMS256.txt exits nonzero and installs nothing", (t) => {
  const root = scratch(t);
  const source = sourceRepo(root, ">=26");
  const { home, env, envFile, toolchain } = floorFixture(root, false);

  const run = runScript(source, env);
  assert.notEqual(run.status, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /^setup-env: node checksum: /m);
  assert.doesNotMatch(run.stdout, /dist built/);
  assert.equal(existsSync(toolchain), false, "a toolchain was installed from an unverified tarball");
  assert.deepEqual(readdirSync(join(home, ".toolchains")), [], "the staging directory was left behind");
  assert.equal(existsSync(envFile), false, "CLAUDE_ENV_FILE was written for a refused toolchain");
});

test("setup-env exits nonzero naming the build step when npm run build fails or leaves no dist, and prints no summary", (t) => {
  const root = scratch(t);
  const home = join(root, "home");
  mkdirSync(home);
  const env = baseEnv(home, `${realBin}:${process.env["PATH"] ?? ""}`);
  const arms = [
    { build: 'node -e "process.exit(3)"', reason: /^setup-env: build: npm run build failed$/m },
    { build: 'node -e "0"', reason: /^setup-env: build: npm run build exited 0 and left no dist\/$/m },
  ];
  for (const [index, arm] of arms.entries()) {
    const armRoot = join(root, `arm-${String(index)}`);
    mkdirSync(armRoot);
    const source = sourceRepo(armRoot, `>=${major}`, arm.build);
    const run = runScript(source, env);
    assert.notEqual(run.status, 0, `${arm.build}: stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stderr, arm.reason);
    assert.doesNotMatch(run.stdout, /dist built/);
  }
});

test("setup-env exits nonzero naming the full-clone step when the clone cannot be unshallowed", (t) => {
  const root = scratch(t);
  const source = sourceRepo(root, `>=${major}`);
  const clone = shallowClone(root, source);
  git(clone, ["remote", "set-url", "origin", pathToFileURL(join(root, "gone")).href]);
  const home = join(root, "home");
  mkdirSync(home);

  const run = runScript(clone, baseEnv(home, `${realBin}:${process.env["PATH"] ?? ""}`));
  assert.notEqual(run.status, 0, `stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /^setup-env: full clone: /m);
  assert.doesNotMatch(run.stdout, /dist built/);
  assert.equal(git(clone, ["rev-parse", "--is-shallow-repository"]), "true");
});

test("setup-env builds from clean, so an output deleted or edited since the last build is rebuilt even when the incremental build would skip it", (t) => {
  const root = scratch(t);
  const home = join(root, "home");
  mkdirSync(home);
  const env = baseEnv(home, `${realBin}:${process.env["PATH"] ?? ""}`);
  const source = sourceRepo(root, `>=${major}`, INCREMENTAL_BUILD);
  const built = join(source, "dist", "built.txt");
  const first = runScript(source, env);
  assert.equal(first.status, 0, `stdout=${first.stdout} stderr=${first.stderr}`);
  assert.equal(readFileSync(built, "utf8"), "built");
  /* The dangerous state: the build's record says everything is emitted. */
  assert.ok(existsSync(join(source, "build.tsbuildinfo")));

  const arms: Array<{ name: string; stale: () => void }> = [
    { name: "deleted output", stale: () => rmSync(built) },
    { name: "edited output", stale: () => writeFileSync(built, "stale") },
  ];
  for (const arm of arms) {
    arm.stale();
    const run = runScript(source, env);
    assert.equal(run.status, 0, `${arm.name}: stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(lastLine(run.stdout), SUMMARY);
    assert.ok(existsSync(built), `${arm.name}: the script reported dist built and dist/built.txt is absent`);
    assert.equal(readFileSync(built, "utf8"), "built", `${arm.name}: dist/built.txt is stale after the script`);
  }
});

test("the SessionStart hook in .claude/settings.json runs setup-env only when CLAUDE_CODE_REMOTE is true, with TIPHYS_TOOLCHAINS_DIR=/opt/tiphys-toolchains, on startup and resume, with a 600 second timeout", (t) => {
  const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8")) as {
    hooks?: { SessionStart?: Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> }> };
  };
  const entries = settings.hooks?.SessionStart ?? [];
  assert.equal(entries.length, 1, "expected exactly one SessionStart entry");
  const entry = entries[0] as NonNullable<typeof entries[number]>;
  assert.equal(entry.matcher, "startup|resume");
  assert.equal(entry.hooks?.length, 1, "expected exactly one hook in the SessionStart entry");
  const hook = entry.hooks?.[0] as { type?: string; command?: string; timeout?: number };
  assert.equal(hook.type, "command");
  assert.equal(hook.timeout, 600);
  assert.equal(typeof hook.command, "string");

  /* Run the hook's own command against a project whose setup-env.sh only
     leaves a marker recording the toolchain directory it was given, under
     each value an owner's local session can carry. The directory matters:
     the default $HOME/.toolchains is /root/.toolchains in a cloud session,
     and /root is drwx------, so the unprivileged-uid tests could not run a
     Node installed there. */
  const project = scratch(t);
  writeExecutable(
    join(project, "scripts", "setup-env.sh"),
    '#!/bin/sh\necho "ran TIPHYS_TOOLCHAINS_DIR=${TIPHYS_TOOLCHAINS_DIR-unset}" > "$CLAUDE_PROJECT_DIR/ran"\n',
  );
  const marker = join(project, "ran");
  const arms: Array<{ remote: string | undefined; runs: boolean }> = [
    { remote: undefined, runs: false },
    { remote: "", runs: false },
    { remote: "false", runs: false },
    { remote: "true", runs: true },
  ];
  for (const arm of arms) {
    rmSync(marker, { force: true });
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: project };
    delete env["CLAUDE_CODE_REMOTE"];
    delete env["TIPHYS_TOOLCHAINS_DIR"];
    if (arm.remote !== undefined) {
      env["CLAUDE_CODE_REMOTE"] = arm.remote;
    }
    const run = spawnSync("bash", ["-c", hook.command as string], { cwd: project, encoding: "utf8", env, timeout: 30_000 });
    const label = `CLAUDE_CODE_REMOTE=${arm.remote === undefined ? "(unset)" : JSON.stringify(arm.remote)}`;
    assert.equal(run.status, 0, `${label}: stdout=${run.stdout} stderr=${run.stderr}`);
    assert.equal(existsSync(marker), arm.runs, `${label}: setup-env ${arm.runs ? "did not run" : "ran"}`);
    if (arm.runs) {
      assert.equal(
        readFileSync(marker, "utf8"),
        "ran TIPHYS_TOOLCHAINS_DIR=/opt/tiphys-toolchains\n",
        `${label}: the hook did not give setup-env TIPHYS_TOOLCHAINS_DIR=/opt/tiphys-toolchains`,
      );
    }
  }
});
