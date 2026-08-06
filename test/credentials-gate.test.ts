import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
 * M2-P8 credential scoping tests: the allowlisted child environment, the
 * redirected credential-store pointers, and the two credential gates.
 *
 * Import discipline: src modules are imported through the computed-URL
 * dynamic import pattern (environment warning 4; the pattern of
 * test/doctor.test.ts).
 *
 * gh discipline: every probe path here runs under a DETERMINISTIC gh-free
 * PATH (a bin directory holding only git and node), because gh is absent
 * locally and present in CI (environment warning 6) and these assertions
 * must not depend on which machine they run on.
 */

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const credentialsGateEntry = fileURLToPath(
  new URL("../src/gates/credentials.ts", import.meta.url),
);

interface ChildEnvModule {
  DEFAULT_CHILD_ENV_ALLOWLIST: readonly string[];
  CREDENTIAL_STORE_REDIRECTIONS: readonly {
    name: string;
    kind: "directory" | "file";
    relativePath: string;
  }[];
  SCRUB_DIR_NAME: string;
  scrubRoot: (taskDir: string) => string;
  permittedChildEnvNames: (extra?: readonly string[]) => Set<string>;
  buildChildEnv: (spec: {
    parentEnv: Record<string, string | undefined>;
    scrubDir: string;
    extraAllowlist?: readonly string[];
  }) =>
    | { ok: true; env: Record<string, string> }
    | { ok: false; reason: string };
}

interface SourceProbe {
  source: string;
  outcome: "clean" | "resolvable" | "error";
  detail: string;
}

interface CredentialsModule {
  GH_TOKEN_VARIABLES: readonly string[];
  CREDENTIAL_SOURCES: readonly string[];
  probeCredentialSources: (
    env: Record<string, string | undefined>,
    options?: { permittedNames?: ReadonlySet<string> },
  ) => SourceProbe[];
  verdictFromProbes: (probes: SourceProbe[]) => {
    status: string;
    detail: string;
  };
}

interface SpawnModule {
  subprocessAdapter: {
    name: string;
    launch: (request: {
      taskId: string;
      worktree: string;
      command: string[];
      hookPath: string;
      recordPath: string;
      deadlineSeconds: number | undefined;
      env: Record<string, string> | undefined;
    }) =>
      | { kind: "completed"; exitCode: number }
      | { kind: "launch-failed"; reason: string }
      | { kind: "incomplete"; reason: string };
  };
  spawnTask: (
    fleet: unknown,
    options: {
      taskId: string;
      project: string;
      briefFile: string;
      shape: "ship" | "scout";
      exec: string;
      deadlineSeconds: number | undefined;
      offline: boolean;
      allowPrCredentials?: boolean;
    },
  ) => Promise<
    | { ok: true; value: { meta: unknown; exitCode: number } }
    | { ok: false; reason: string }
  >;
}

const envModule = (await import(
  new URL("../src/exec/env.ts", import.meta.url).href
)) as ChildEnvModule;
const credentialsModule = (await import(
  new URL("../src/gates/credentials.ts", import.meta.url).href
)) as CredentialsModule;
const spawnModule = (await import(
  new URL("../src/spawn.ts", import.meta.url).href
)) as SpawnModule;
const fleetModule = (await import(
  new URL("../src/fleet.ts", import.meta.url).href
)) as { loadFleet: (cwd: string) => unknown };

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "Credentials Test",
  GIT_AUTHOR_EMAIL: "credentials-test@tiphys.invalid",
  GIT_COMMITTER_NAME: "Credentials Test",
  GIT_COMMITTER_EMAIL: "credentials-test@tiphys.invalid",
};

function makeTempDir(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-p8-credentials-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** The CLI's environment, with any ambient holder identity removed. */
function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TIPHYS_HOLDER_ID;
  return env;
}

function runCli(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env ?? baseEnv(),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function git(dir: string, args: string[]): void {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

interface Scratch {
  tmp: string;
  fleet: string;
  clone: string;
  briefFile: string;
}

/** Fleet home plus an upstream repo and a clone of it under projects/. */
function makeScratch(t: { after(fn: () => void): void }): Scratch {
  const tmp = makeTempDir(t);
  const fleet = join(tmp, "fleet");
  assert.equal(runCli(["init", fleet]).status, 0);
  const upstream = join(tmp, "upstream");
  git(tmp, ["init", "--initial-branch=main", upstream]);
  writeFileSync(join(upstream, "readme.md"), "upstream\n");
  git(upstream, ["add", "-A"]);
  git(upstream, ["commit", "-m", "commit one"]);
  const clone = join(fleet, "projects", "demo");
  git(tmp, ["clone", "--quiet", upstream, clone]);
  const briefFile = join(tmp, "brief.md");
  writeFileSync(briefFile, "# Brief\n\nDo the thing.\n");
  return { tmp, fleet, clone, briefFile };
}

/** A payload that dumps its entire environment as JSON to a baked path. */
function writeEnvDumpPayload(dir: string, dumpPath: string): string {
  const path = join(dir, "dump-env.mjs");
  writeFileSync(
    path,
    `#!/usr/bin/env node\n` +
      `import { writeFileSync } from "node:fs";\n` +
      `writeFileSync(${JSON.stringify(dumpPath)}, JSON.stringify(process.env));\n`,
    { mode: 0o755 },
  );
  return path;
}

function readDump(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
}

/**
 * A deterministic gh-free PATH: one directory holding symlinks to the
 * real git and node and NOTHING else, so no probe can find a gh binary
 * regardless of the machine (warning 6).
 */
function ghFreeBinDir(t: { after(fn: () => void): void }): string {
  const dir = join(makeTempDir(t), "bin");
  mkdirSync(dir);
  const realGit = spawnSync("sh", ["-c", "command -v git"], {
    encoding: "utf8",
  }).stdout.trim();
  assert.notEqual(realGit, "", "a real git must exist to stage the gh-free PATH");
  symlinkSync(realGit, join(dir, "git"));
  symlinkSync(process.execPath, join(dir, "node"));
  return dir;
}

/** Stage a fake HOME whose gh store holds a token-shaped hosts.yml. */
function stageFakeHomeWithGhToken(root: string): string {
  const home = join(root, "fake-home");
  mkdirSync(join(home, ".config", "gh"), { recursive: true });
  writeFileSync(
    join(home, ".config", "gh", "hosts.yml"),
    "github.com:\n    oauth_token: ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE1234\n    user: someone\n",
  );
  return home;
}

/** Stage a fake global git config declaring a credential helper. */
function stageFakeGlobalGitConfig(root: string): string {
  const path = join(root, "fake-gitconfig-global");
  writeFileSync(path, "[credential]\n\thelper = store\n");
  return path;
}

// ---------------------------------------------------------------------------
// The spawn seam (criteria 1, 2, 4)
// ---------------------------------------------------------------------------

test("spawn scrubs the payload child environment and redirects the credential-store pointers into the task directory", (t) => {
  const scratch = makeScratch(t);
  const dumpPath = join(scratch.tmp, "payload-env.json");
  const payload = writeEnvDumpPayload(scratch.tmp, dumpPath);

  const env = baseEnv();
  env.GH_TOKEN = "ghp_parent_credential_canary";
  env.SOME_PARENT_SECRET = "leak-canary";
  const result = runCli(
    [
      "spawn",
      "--task",
      "scrub-one",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
      "--exec",
      payload,
    ],
    { cwd: scratch.fleet, env },
  );
  assert.equal(result.status, 0, result.stderr);

  const dump = readDump(dumpPath);
  // None of the credential variables the parent had set.
  assert.equal(dump.GH_TOKEN, undefined);
  assert.equal(dump.SOME_PARENT_SECRET, undefined);
  // Every pointer redirected to a harness-owned path INSIDE the task
  // directory, never the parent's value.
  const taskDir = join(scratch.fleet, "tasks", "scrub-one");
  const scrub = envModule.scrubRoot(taskDir);
  assert.equal(dump.HOME, join(scrub, "home"));
  assert.equal(dump.XDG_CONFIG_HOME, join(scrub, "xdg-config"));
  assert.equal(dump.GH_CONFIG_DIR, join(scrub, "gh-config"));
  assert.equal(dump.GIT_CONFIG_GLOBAL, join(scrub, "gitconfig-global"));
  assert.equal(dump.GIT_CONFIG_SYSTEM, join(scrub, "gitconfig-system"));
  assert.notEqual(dump.HOME, env.HOME);
  // PATH crossed (the payload could not have run otherwise, but the
  // record should say so explicitly).
  assert.equal(dump.PATH, env.PATH);
});

test("the child environment is an allowlist: an unlisted TIPHYS variable does not cross and an allowlisted one does", (t) => {
  const scratch = makeScratch(t);
  const dumpPath = join(scratch.tmp, "allowlist-env.json");
  const payload = writeEnvDumpPayload(scratch.tmp, dumpPath);

  const env = baseEnv();
  // Same prefix, opposite fates: a denylist implementation keyed on known
  // credential names would pass BOTH of these through and fail here.
  env.TIPHYS_UNRELATED_SECRET = "must-not-cross";
  env.TIPHYS_EXIT_TEST_TASK = "must-cross";
  const result = runCli(
    [
      "spawn",
      "--task",
      "scrub-two",
      "--project",
      scratch.clone,
      "--brief",
      scratch.briefFile,
      "--shape",
      "ship",
      "--exec",
      payload,
    ],
    { cwd: scratch.fleet, env },
  );
  assert.equal(result.status, 0, result.stderr);

  const dump = readDump(dumpPath);
  assert.equal(dump.TIPHYS_UNRELATED_SECRET, undefined);
  assert.equal(dump.TIPHYS_EXIT_TEST_TASK, "must-cross");
});

test("spawn --allow-pr-credentials passes the parent environment through unchanged", async (t) => {
  const scratch = makeScratch(t);
  const dumpPath = join(scratch.tmp, "allow-env.json");
  const payload = writeEnvDumpPayload(scratch.tmp, dumpPath);

  // In-process spawnTask (computed-URL import): the declared escape hatch
  // is a SpawnOptions field on the library seam.
  process.env.TIPHYS_TEST_PR_TOKEN_CANARY = "canary-value";
  try {
    const fleet = fleetModule.loadFleet(scratch.fleet);
    const result = await spawnModule.spawnTask(fleet, {
      taskId: "allow-one",
      project: scratch.clone,
      briefFile: scratch.briefFile,
      shape: "ship",
      exec: payload,
      deadlineSeconds: undefined,
      offline: false,
      allowPrCredentials: true,
    });
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
  } finally {
    delete process.env.TIPHYS_TEST_PR_TOKEN_CANARY;
  }

  const dump = readDump(dumpPath);
  // The parent's values are present: the canary crossed and HOME is the
  // parent's, not a redirected path.
  assert.equal(dump.TIPHYS_TEST_PR_TOKEN_CANARY, "canary-value");
  assert.equal(dump.HOME, process.env.HOME);
  // And no scrub root was staged for this task.
  const taskDir = join(scratch.fleet, "tasks", "allow-one");
  assert.equal(existsSync(envModule.scrubRoot(taskDir)), false);
});

test("the turn-end hook child receives the same scrubbed environment as the payload", (t) => {
  const tmp = makeTempDir(t);
  const worktree = join(tmp, "worktree");
  mkdirSync(worktree);
  const hookDump = join(tmp, "hook-env.json");
  const hookPath = join(tmp, "hook.mjs");
  writeFileSync(
    hookPath,
    `import { writeFileSync } from "node:fs";\n` +
      `writeFileSync(${JSON.stringify(hookDump)}, JSON.stringify(process.env));\n`,
    { mode: 0o755 },
  );

  const built = envModule.buildChildEnv({
    parentEnv: process.env,
    scrubDir: join(tmp, "scrub-env"),
  });
  assert.equal(built.ok, true, built.ok ? "" : built.reason);
  const childEnv = built.ok ? built.env : {};

  process.env.TIPHYS_TEST_HOOK_CANARY = "hook-canary";
  try {
    // Scrubbed direction: the SECOND spawnSync (the hook child) gets
    // request.env, witnessed separately from the payload (criterion 4).
    const outcome = spawnModule.subprocessAdapter.launch({
      taskId: "hook-scrub",
      worktree,
      command: [process.execPath, "-e", "process.exit(0)"],
      hookPath,
      recordPath: join(tmp, "executor.json"),
      deadlineSeconds: undefined,
      env: childEnv,
    });
    assert.equal(outcome.kind, "completed");
    const dump = readDump(hookDump);
    assert.equal(dump.TIPHYS_TEST_HOOK_CANARY, undefined);
    assert.equal(dump.HOME, join(tmp, "scrub-env", "home"));
    assert.equal(dump.GIT_CONFIG_GLOBAL, join(tmp, "scrub-env", "gitconfig-global"));

    // Inherit direction: env undefined is the documented escape hatch and
    // the hook child then sees the parent environment.
    rmSync(hookDump, { force: true });
    const inherited = spawnModule.subprocessAdapter.launch({
      taskId: "hook-inherit",
      worktree,
      command: [process.execPath, "-e", "process.exit(0)"],
      hookPath,
      recordPath: join(tmp, "executor2.json"),
      deadlineSeconds: undefined,
      env: undefined,
    });
    assert.equal(inherited.kind, "completed");
    const inheritedDump = readDump(hookDump);
    assert.equal(inheritedDump.TIPHYS_TEST_HOOK_CANARY, "hook-canary");
  } finally {
    delete process.env.TIPHYS_TEST_HOOK_CANARY;
  }
});

// ---------------------------------------------------------------------------
// credential-scrub (criterion 3, plus the metric contract)
// ---------------------------------------------------------------------------

test("credential-scrub is green with units equal to sources probed while staged credential stores are redirected away", (t) => {
  const tmp = makeTempDir(t);
  const bin = ghFreeBinDir(t);
  const fakeHome = stageFakeHomeWithGhToken(tmp);
  const fakeGlobal = stageFakeGlobalGitConfig(tmp);
  const evidence = join(tmp, "evidence");
  mkdirSync(evidence);
  const resultPath = join(tmp, "result.json");

  // The DANGEROUS STATE IS STAGED IN THE GATE'S OWN PARENT ENVIRONMENT
  // (M2R-004 edit 3): a token-shaped hosts.yml reachable through HOME, a
  // credential helper reachable through GIT_CONFIG_GLOBAL, and a token
  // variable. Only the redirection and the allowlist stand between them
  // and the probes, so this test cannot pass while the scrub is broken.
  const gate = spawnSync(
    process.execPath,
    [
      credentialsGateEntry,
      "credential-scrub",
      "--result",
      resultPath,
      "--evidence",
      evidence,
    ],
    {
      encoding: "utf8",
      env: {
        PATH: bin,
        HOME: fakeHome,
        GIT_CONFIG_GLOBAL: fakeGlobal,
        GH_TOKEN: "ghp_parent_token_that_must_not_reach_the_child",
      },
    },
  );
  assert.equal(gate.status, 0, `${gate.stdout}\n${gate.stderr}`);

  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    gate: string;
    status: string;
    units: number;
    unitLabel: string;
    evidence: string[];
  };
  assert.equal(record.gate, "credential-scrub");
  assert.equal(record.status, "green");
  assert.equal(record.unitLabel, "credential sources probed");
  // Units are SOURCES PROBED, never names checked (M2R-004): exactly the
  // declared source list, independent of how many variable names exist.
  assert.equal(record.units, credentialsModule.CREDENTIAL_SOURCES.length);

  const probes = JSON.parse(
    readFileSync(join(evidence, "probes.json"), "utf8"),
  ) as SourceProbe[];
  assert.deepEqual(
    probes.map((probe) => probe.source),
    [...credentialsModule.CREDENTIAL_SOURCES],
  );
  for (const probe of probes) {
    assert.equal(probe.outcome, "clean", `${probe.source}: ${probe.detail}`);
  }
});

test("credential-scrub probes report resolvable sources when the redirection is absent", (t) => {
  const tmp = makeTempDir(t);
  const bin = ghFreeBinDir(t);
  const emptyHome = join(tmp, "empty-home");
  mkdirSync(emptyHome);

  // Member 1 of the class: the child sees the fake HOME (the redirection
  // is gone), so the gh store resolves.
  const fakeHome = stageFakeHomeWithGhToken(tmp);
  const probesHome = credentialsModule.probeCredentialSources({
    PATH: bin,
    HOME: fakeHome,
  });
  const ghProbe = probesHome.find((probe) => probe.source === "gh-configuration");
  assert.ok(ghProbe !== undefined);
  assert.equal(ghProbe.outcome, "resolvable", ghProbe.detail);
  const verdictHome = credentialsModule.verdictFromProbes(probesHome);
  assert.equal(verdictHome.status, "red");
  assert.match(verdictHome.detail, /gh-configuration/);
  assert.match(verdictHome.detail, /hosts\.yml/);

  // Member 2, structurally different (a helper in git configuration, not
  // a store file under HOME): the child sees the fake global git config.
  const fakeGlobal = stageFakeGlobalGitConfig(tmp);
  const probesGit = credentialsModule.probeCredentialSources({
    PATH: bin,
    HOME: emptyHome,
    GIT_CONFIG_GLOBAL: fakeGlobal,
  });
  const gitProbe = probesGit.find((probe) => probe.source === "git-global-config");
  assert.ok(gitProbe !== undefined);
  assert.equal(gitProbe.outcome, "resolvable", gitProbe.detail);
  const verdictGit = credentialsModule.verdictFromProbes(probesGit);
  assert.equal(verdictGit.status, "red");
  assert.match(verdictGit.detail, /git-global-config/);

  // Member 3, structurally different again (a token VARIABLE rather than
  // a store): the derived gh vocabulary tripwire, which is what makes a
  // widened allowlist cost a red (the declared hazard).
  const probesToken = credentialsModule.probeCredentialSources({
    PATH: bin,
    HOME: emptyHome,
    GH_TOKEN: "ghp_leaked",
  });
  const envProbe = probesToken.find((probe) => probe.source === "environment");
  assert.ok(envProbe !== undefined);
  assert.equal(envProbe.outcome, "resolvable", envProbe.detail);
  assert.match(envProbe.detail, /GH_TOKEN/);
  assert.equal(credentialsModule.verdictFromProbes(probesToken).status, "red");

  // Member 4, the declared hazard itself: an allowlist WIDENED to admit a
  // token variable. The name is now permitted, so the stray-name arm
  // cannot catch it; only the derived gh-vocabulary tripwire can, which
  // is what makes widening the list cost a red instead of succeeding.
  const widened = envModule.permittedChildEnvNames(["GH_TOKEN"]);
  const probesWidened = credentialsModule.probeCredentialSources(
    { PATH: bin, HOME: emptyHome, GH_TOKEN: "ghp_leaked" },
    { permittedNames: widened },
  );
  const widenedProbe = probesWidened.find(
    (probe) => probe.source === "environment",
  );
  assert.ok(widenedProbe !== undefined);
  assert.equal(widenedProbe.outcome, "resolvable", widenedProbe.detail);
  assert.match(widenedProbe.detail, /token variable/);
  assert.equal(credentialsModule.verdictFromProbes(probesWidened).status, "red");
});

// ---------------------------------------------------------------------------
// credential-token (criterion 6, and the fail-closed token-present arm)
// ---------------------------------------------------------------------------

test("credential-token without an implementer token is not-applicable naming owner action A-3", (t) => {
  const tmp = makeTempDir(t);
  const bin = ghFreeBinDir(t);
  const resultPath = join(tmp, "result.json");
  const evidence = join(tmp, "evidence");
  mkdirSync(evidence);
  const gate = spawnSync(
    process.execPath,
    [
      credentialsGateEntry,
      "credential-token",
      "--result",
      resultPath,
      "--evidence",
      evidence,
    ],
    // TIPHYS_IMPLEMENTER_TOKEN deliberately absent from this environment.
    { encoding: "utf8", env: { PATH: bin } },
  );
  assert.equal(gate.status, 20, `${gate.stdout}\n${gate.stderr}`);
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    status: string;
    detail: string;
  };
  assert.equal(record.status, "not-applicable");
  assert.notEqual(record.status, "green");
  assert.match(record.detail, /A-3/);
  assert.match(record.detail, /TIPHYS_IMPLEMENTER_TOKEN/);
});

test("credential-token with a token present fails closed until the capture-derived probe exists", (t) => {
  const tmp = makeTempDir(t);
  const bin = ghFreeBinDir(t);
  const resultPath = join(tmp, "result.json");
  const evidence = join(tmp, "evidence");
  mkdirSync(evidence);
  const gate = spawnSync(
    process.execPath,
    [
      credentialsGateEntry,
      "credential-token",
      "--result",
      resultPath,
      "--evidence",
      evidence,
    ],
    {
      encoding: "utf8",
      env: { PATH: bin, TIPHYS_IMPLEMENTER_TOKEN: "tiphys-test-token" },
    },
  );
  // Fail closed (M2-C-3): error, never a green derived from an invented
  // response shape (T-003 lesson 4), and exit 21 per the contract table.
  assert.equal(gate.status, 21, `${gate.stdout}\n${gate.stderr}`);
  const record = JSON.parse(readFileSync(resultPath, "utf8")) as {
    status: string;
    detail: string;
  };
  assert.equal(record.status, "error");
  assert.match(record.detail, /A-3/);
  assert.match(record.detail, /captured/);
});

// ---------------------------------------------------------------------------
// Registration and usage
// ---------------------------------------------------------------------------

test("the gate manifest registers credential-scrub and credential-token per the section 1.4 table", () => {
  const manifest = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../gates.manifest.json", import.meta.url)),
      "utf8",
    ),
  ) as {
    gates: {
      id: string;
      command: string[];
      unitLabel: string;
      applicability: string;
      precondition?: { id: string; kind: string; command?: string[] };
    }[];
  };
  const scrub = manifest.gates.find((gate) => gate.id === "credential-scrub");
  assert.ok(scrub !== undefined);
  assert.equal(scrub.applicability, "required");
  assert.equal(scrub.unitLabel, "credential sources probed");
  assert.equal(scrub.precondition, undefined);

  const token = manifest.gates.find((gate) => gate.id === "credential-token");
  assert.ok(token !== undefined);
  assert.equal(token.applicability, "conditional");
  assert.equal(token.unitLabel, "tokens probed");
  assert.ok(token.precondition !== undefined);
  // No `env` precondition kind exists (STATE.md, carried forward from
  // M2-P1): the presence check is a command, and its id names A-3.
  assert.equal(token.precondition.kind, "command-exit-zero");
  assert.match(token.precondition.id, /a-3/);
  assert.match(
    (token.precondition.command ?? []).join(" "),
    /TIPHYS_IMPLEMENTER_TOKEN/,
  );
});

test("credentials gate usage errors exit 64", (t) => {
  const tmp = makeTempDir(t);
  const bin = ghFreeBinDir(t);
  const noGate = spawnSync(process.execPath, [credentialsGateEntry], {
    encoding: "utf8",
    env: { PATH: bin },
  });
  assert.equal(noGate.status, 64);
  assert.match(noGate.stderr, /usage/);
  const noResult = spawnSync(
    process.execPath,
    [credentialsGateEntry, "credential-scrub", "--evidence", tmp],
    { encoding: "utf8", env: { PATH: bin } },
  );
  assert.equal(noResult.status, 64);
  const unknownFlag = spawnSync(
    process.execPath,
    [credentialsGateEntry, "credential-scrub", "--frob", "x"],
    { encoding: "utf8", env: { PATH: bin } },
  );
  assert.equal(unknownFlag.status, 64);
});
