/**
 * The Codex review executor and what the kernel does with it (kernel plan M6,
 * M6-P7; DR-0065).
 *
 * NO TEST CALLS THE HARNESS. The argv is compared with the installed CLI's own
 * `codex exec --help`, committed as test/fixtures/review-dispatch/
 * codex-exec-help.txt, and the observer reads two REAL captures of that CLI
 * (provenance in the README beside them). A dispatch runs
 * test/fixtures/review-dispatch/stub-codex-executor.mjs: the adapter with its
 * command swapped for replay.mjs, which prints the real capture.
 *
 * `src` is imported through the computed-URL dynamic import pattern (CLAUDE.md
 * standing warning 4).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const GIT_CEILING = [realpathSync(tmpdir()), tmpdir(), process.env["GIT_CEILING_DIRECTORIES"] ?? ""]
  .filter((entry) => entry !== "")
  .join(delimiter);
process.env["GIT_CEILING_DIRECTORIES"] = GIT_CEILING;
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY"]) {
  delete process.env[name];
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliEntry = join(repoRoot, "bin", "tiphys.ts");
const fixtures = join(repoRoot, "test", "fixtures", "review-dispatch");
const CAPTURE = join(fixtures, "codex-luna.stream.jsonl");
const FAILED_CAPTURE = join(fixtures, "codex-without-key.stream.jsonl");
const HELP = join(fixtures, "codex-exec-help.txt");
const STUB = join(fixtures, "stub-codex-executor.mjs");
const VERDICT_FIXTURE = join(repoRoot, "witness", "fixtures", "dual-review", "decorrelated-hazard.yaml");

type Grant = {
  readRepository: boolean;
  writeReviewWorktree: boolean;
  commands: string[][];
  push: boolean;
  networkTools: boolean;
};

const codex = (await import(new URL("../adapters/codex/review.ts", import.meta.url).href)) as {
  reviewArgv: (model: string, prompt: string, grant: unknown) => string[];
  readReviewStream: (path: string) => {
    observed: { model: string | null; reason?: string };
    topLevelModels: string[];
    subagentModels: string[];
    totalCostUsd: number | null;
    usage: Record<string, unknown> | null;
    modelUsage: Record<string, unknown> | null;
  };
  familyOf: (model: string) => string | undefined;
  modelForTier: (tier: string) => string | undefined;
};

const review = (await import(new URL("../src/review.ts", import.meta.url).href)) as {
  REVIEWER_GRANT: Grant;
  reviewChildEnv: (
    parentEnv: Record<string, string | undefined>,
    taskDirectory: string,
  ) => { ok: true; env: Record<string, string> } | { ok: false; reason: string };
  applyHarnessEnvironment: (
    env: Record<string, string>,
    entries: { name: string; reason: string }[],
    parentEnv: Record<string, string | undefined>,
  ) => Record<string, string>;
  judgeFamilies: (
    counted: unknown[],
    declaration: unknown,
    allRecords: unknown[],
  ) => { ok: boolean; exceptionUsed: boolean; sentence: string };
};

function rows(path: string): Record<string, unknown>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Every key anywhere in a JSON value, so "no row names a model" is checked at any depth. */
function keysIn(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysIn);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysIn(inner)]);
  }
  return [];
}

test("the Codex executor maps the reviewer grant to exactly its sandbox and approval settings, every flag quoted from the installed CLI's own codex exec --help; a grant it cannot map throws", () => {
  const prompt = "Review according to the brief on standard input.";
  const argv = codex.reviewArgv("some-model", prompt, review.REVIEWER_GRANT);
  assert.deepEqual(argv, [
    "codex",
    "exec",
    "--json",
    "--model",
    "some-model",
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "-c",
    'approval_policy="never"',
    "-c",
    "sandbox_workspace_write.network_access=false",
    "-c",
    "sandbox_workspace_write.exclude_slash_tmp=true",
    "-c",
    "sandbox_workspace_write.exclude_tmpdir_env_var=true",
    "-c",
    'web_search="disabled"',
    "-c",
    'shell_environment_policy.inherit="all"',
    "-c",
    'shell_environment_policy.exclude=["CODEX_API_KEY"]',
    prompt,
  ]);
  /* Every flag is in the installed CLI's own help, and so is the sandbox value. */
  const help = readFileSync(HELP, "utf8");
  for (const flag of argv.filter((part) => /^-/.test(part))) {
    assert.match(help, new RegExp(`(^|[ ,])${flag.replace(/[-]/g, "\\-")}[ ,<\\n]`, "m"), `${flag} is not in codex exec --help`);
  }
  assert.match(help, /\[possible values: read-only, workspace-write, danger-full-access\]/);
  /* The settings follow the grant's data: with no writes the sandbox is read-only. */
  const readOnly: Grant = { readRepository: true, writeReviewWorktree: false, commands: [["git", "diff"]], push: false, networkTools: false };
  assert.deepEqual(codex.reviewArgv("m", prompt, readOnly).slice(5, 7), ["--sandbox", "read-only"]);
  /* A grant this executor cannot express faithfully refuses, naming why. */
  assert.throws(() => codex.reviewArgv("m", prompt, { ...readOnly, push: true }), /allows a push/);
  assert.throws(() => codex.reviewArgv("m", prompt, { ...readOnly, networkTools: true }), /allows network tools/);
  assert.throws(() => codex.reviewArgv("m", prompt, { ...readOnly, readRepository: false }), /withholds reads/);
  assert.throws(() => codex.reviewArgv("m", prompt, { ...readOnly, commands: [["git", "*"]] }), /not a list of plain words/);
  /* The vocabulary: both tier models are one vendor's. */
  assert.equal(codex.familyOf(codex.modelForTier("strongest") as string), "openai");
  assert.equal(codex.familyOf(codex.modelForTier("cheaper") as string), "openai");
  assert.equal(codex.familyOf("claude-opus-5"), undefined);
});

test("the Codex observer reads token usage from the real capture's turn.completed row and observes no served model, since no row of the real capture names one; the real failed capture reads as not observed with no usage", () => {
  const captured = rows(CAPTURE);
  const completed = captured.filter((row) => row["type"] === "turn.completed");
  assert.equal(completed.length, 1, "the capture does not hold one turn.completed row");
  /* The measured property the reading rests on: no row, at any depth, has a model key. */
  assert.ok(!captured.some((row) => keysIn(row).includes("model")), "a row of the real capture names a model");

  const reading = codex.readReviewStream(CAPTURE);
  assert.equal(reading.observed.model, null);
  assert.match(reading.observed.reason ?? "", /names no served model on any event/);
  assert.deepEqual(reading.topLevelModels, []);
  assert.deepEqual(reading.subagentModels, []);
  assert.deepEqual(reading.usage, (completed[0] as Record<string, unknown>)["usage"]);
  assert.equal(reading.totalCostUsd, null);

  const failed = codex.readReviewStream(FAILED_CAPTURE);
  assert.ok(rows(FAILED_CAPTURE).some((row) => row["type"] === "turn.failed"), "the failed capture has no turn.failed row");
  assert.equal(failed.observed.model, null);
  assert.match(failed.observed.reason ?? "", /the run failed/);
  assert.equal(failed.usage, null);
});

function counted(taskId: string, family: string, vocabulary: string): unknown {
  return { record: { taskId, family, vocabulary: { id: vocabulary, version: 1 } } };
}

function declared(families: string[]): unknown {
  return { kind: "declared", families, declaredAs: families, reason: "a test declares them", provenance: {} };
}

test("families from two vocabularies are comparable only when both tokens are in charter.yaml review-families.available: a Claude and a Codex review both declared are green, and a token outside the list is red naming it", () => {
  const pair = [counted("review-a", "anthropic", "claude-code-model-vendors"), counted("review-b", "openai", "codex-model-vendors")];
  const green = review.judgeFamilies(pair, declared(["anthropic", "openai"]), []);
  assert.equal(green.ok, true, green.sentence);
  assert.match(green.sentence, /observed on 2 distinct families/);

  const red = review.judgeFamilies(pair, declared(["anthropic"]), []);
  assert.equal(red.ok, false, red.sentence);
  assert.match(red.sentence, /\[openai\] outside charter\.yaml review-families\.available \[anthropic\]/);

  const undeclared = review.judgeFamilies(pair, { kind: "absent" }, []);
  assert.equal(undeclared.ok, false, undeclared.sentence);
  assert.match(undeclared.sentence, /not comparable/);
});

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(dir: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...GIT_IDENTITY } });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return (run.stdout ?? "").trim();
}

function project(charter?: string): { root: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), "tiphys-codex-review-"));
  const repo = join(root, "project");
  mkdirSync(repo);
  git(repo, ["init", "-q", "."]);
  writeFileSync(join(repo, "README.md"), "a project under review\n");
  if (charter !== undefined) {
    writeFileSync(join(repo, "charter.yaml"), charter);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "the commit under review"]);
  return { root, repo };
}

function dispatch(
  repo: string,
  root: string,
  options: { executor?: string; env?: Record<string, string>; echo?: string },
): { status: number | null; stdout: string; stderr: string; record: Record<string, unknown> | undefined } {
  const brief = join(root, "brief.md");
  writeFileSync(brief, "BRIEF: review the change at the head you are standing on.\n");
  const run = spawnSync(
    process.execPath,
    [
      cliEntry,
      "review",
      "dispatch",
      "--role",
      "clean-room-reviewer",
      "--tier",
      "cheaper",
      "--head",
      "HEAD",
      "--phase",
      "m6-p7",
      "--brief",
      brief,
      "--verdict",
      "delivery/review/m6-p7-hazard.yaml",
      "--out",
      join(root, "out"),
      ...(options.executor === undefined ? [] : ["--executor", options.executor]),
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        TIPHYS_STUB_STREAM: CAPTURE,
        TIPHYS_STUB_VERDICT: VERDICT_FIXTURE,
        ...(options.echo === undefined ? {} : { TIPHYS_STUB_ECHO: options.echo }),
        ...options.env,
      },
    },
  );
  const recordPath = /^record: (.+)$/m.exec(run.stdout ?? "")?.[1];
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    record: recordPath === undefined ? undefined : (JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>),
  };
}

test("a dispatch through the Codex executor gives the reviewer the harness variable it declares and no pull-request credential, records no observed model from the real capture, and a declared pull-request credential refuses the dispatch before anything is created", () => {
  const { root, repo } = project();
  try {
    const echo = join(root, "echo.json");
    const env = { CODEX_API_KEY: "codex-key-for-the-probe", GH_TOKEN: "gh-token-for-the-probe", OPENAI_API_KEY: "undeclared-key" };
    const run = dispatch(repo, root, { executor: STUB, env, echo });
    /* Exit 1: the record was written and observes no served model. */
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /no served model was observed: codex exec --json names no served model/);
    const seen = JSON.parse(readFileSync(echo, "utf8")) as { envNames: string[] };
    assert.ok(seen.envNames.includes("CODEX_API_KEY"), `the declared variable did not reach the reviewer: [${seen.envNames.join(", ")}]`);
    assert.ok(!seen.envNames.includes("GH_TOKEN"), "GH_TOKEN reached the reviewer");
    assert.ok(!seen.envNames.includes("OPENAI_API_KEY"), "an undeclared variable reached the reviewer");
    const record = run.record as Record<string, unknown>;
    assert.equal((record["observation"] as Record<string, unknown>)["model"], null);
    assert.equal(record["family"], "unknown");
    assert.equal(record["requestedModel"], "gpt-6-luna");
    assert.deepEqual(record["vocabulary"], { id: "codex-model-vendors", version: 1 });
    assert.deepEqual(record["usage"], (rows(CAPTURE).find((row) => row["type"] === "turn.completed") as Record<string, unknown>)["usage"]);

    mkdirSync(join(root, "second"));
    const refused = dispatch(repo, join(root, "second"), { executor: STUB, env: { ...env, TIPHYS_STUB_DECLARE: "GH_TOKEN" } });
    assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /declares an environment the kernel refuses: the allowlist extension entry GH_TOKEN/);
    assert.equal(refused.record, undefined, "a refused dispatch wrote a record");
    assert.equal(spawnSync("test", ["-e", join(root, "second", "out")]).status, 1, "the refusal created the out directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* The five names src/exec/env.ts CREDENTIAL_STORE_REDIRECTIONS redirects, written out so a name dropped there is noticed here. */
const CREDENTIAL_STORE_POINTERS = ["HOME", "XDG_CONFIG_HOME", "GH_CONFIG_DIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"];

test("an executor declaring a credential-store pointer never gives the reviewer the kernel's HOME or its credentials: the dispatch is refused before anything is created, and the harness join sets every pointer back to its harness-owned target", () => {
  const { root, repo } = project();
  try {
    /* The kernel's own HOME, holding a credential the reviewer must not reach. */
    const kernelHome = join(root, "kernel-home");
    mkdirSync(kernelHome);
    const secret = "https://x:SECRET-TOKEN@github.com\n";
    writeFileSync(join(kernelHome, ".git-credentials"), secret);

    /* Arm 1, the dispatch: an executor declaring HOME, with the kernel's HOME set. The safety property is checked
       before the refusal, so a dispatch that runs reports what the reviewer was handed. */
    const echo = join(root, "echo.json");
    const home = dispatch(repo, root, {
      executor: STUB,
      echo,
      env: { CODEX_API_KEY: "codex-key-for-the-probe", HOME: kernelHome, TIPHYS_STUB_DECLARE: "HOME" },
    });
    if (spawnSync("test", ["-e", echo]).status === 0) {
      const seen = JSON.parse(readFileSync(echo, "utf8")) as { home: string | null };
      let readable: string | null = null;
      try {
        readable = readFileSync(join(seen.home ?? "", ".git-credentials"), "utf8");
      } catch {
        readable = null;
      }
      assert.deepEqual(
        { reviewerHomeIsKernelHome: seen.home === kernelHome, reviewerHomeGitCredentials: readable },
        { reviewerHomeIsKernelHome: false, reviewerHomeGitCredentials: null },
        `the reviewer was handed HOME ${String(seen.home)} (the kernel's real HOME is ${kernelHome}) and HOME/.git-credentials reads ${JSON.stringify(readable)}`,
      );
    }
    assert.equal(home.status, 1, `${home.stdout}${home.stderr}`);
    assert.match(
      home.stderr,
      /declares an environment the kernel refuses: the allowlist extension entry HOME is a credential-store pointer/,
    );
    assert.equal(home.record, undefined, "a refused dispatch wrote a record");
    assert.equal(spawnSync("test", ["-e", join(root, "out")]).status, 1, "the refusal created the out directory");
    for (const name of CREDENTIAL_STORE_POINTERS.slice(1)) {
      const where = join(root, name);
      mkdirSync(where);
      const refused = dispatch(repo, where, { executor: STUB, env: { [name]: join(root, "real"), TIPHYS_STUB_DECLARE: name } });
      assert.equal(refused.status, 1, `${name}: ${refused.stdout}${refused.stderr}`);
      assert.match(
        refused.stderr,
        new RegExp(`declares an environment the kernel refuses: the allowlist extension entry ${name} is a credential-store pointer`),
      );
      assert.equal(spawnSync("test", ["-e", join(where, "out")]).status, 1, `${name}: the refusal created the out directory`);
    }

    /* Arm 2, the join: every pointer declared, with the kernel's real values set, and a child run in the result. */
    const kernelGitconfig = join(root, "kernel-gitconfig");
    writeFileSync(kernelGitconfig, "[credential]\n\thelper = store\n");
    const parentEnv: Record<string, string> = {
      PATH: process.env["PATH"] ?? "",
      HOME: kernelHome,
      XDG_CONFIG_HOME: join(kernelHome, ".config"),
      GH_CONFIG_DIR: join(kernelHome, ".config", "gh"),
      GIT_CONFIG_GLOBAL: kernelGitconfig,
      GIT_CONFIG_SYSTEM: kernelGitconfig,
      CODEX_API_KEY: "codex-key-for-the-probe",
    };
    const taskDirectory = join(root, "task");
    mkdirSync(taskDirectory);
    const built = review.reviewChildEnv(parentEnv, taskDirectory);
    assert.ok(built.ok, built.ok ? "" : built.reason);
    const targets = Object.fromEntries(CREDENTIAL_STORE_POINTERS.map((name) => [name, built.env[name]]));
    const joined = review.applyHarnessEnvironment(
      { ...built.env },
      [...CREDENTIAL_STORE_POINTERS, "CODEX_API_KEY"].map((name) => ({ name, reason: "a test declares it" })),
      parentEnv,
    );
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "const fs = require('node:fs'); const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }; " +
          "process.stdout.write(JSON.stringify({ env: process.env, credentials: read(require('node:path').join(process.env.HOME, '.git-credentials')), gitconfig: read(process.env.GIT_CONFIG_GLOBAL) }));",
      ],
      { env: joined, encoding: "utf8" },
    );
    assert.equal(child.status, 0, child.stderr);
    const reviewer = JSON.parse(child.stdout) as { env: Record<string, string>; credentials: string | null; gitconfig: string | null };
    assert.deepEqual(
      { reviewerHomeIsKernelHome: reviewer.env["HOME"] === kernelHome, reviewerHomeGitCredentials: reviewer.credentials, reviewerGitConfigGlobal: reviewer.gitconfig },
      { reviewerHomeIsKernelHome: false, reviewerHomeGitCredentials: null, reviewerGitConfigGlobal: "" },
      `the reviewer was handed HOME ${String(reviewer.env["HOME"])} and GIT_CONFIG_GLOBAL ${String(reviewer.env["GIT_CONFIG_GLOBAL"])}`,
    );
    for (const name of CREDENTIAL_STORE_POINTERS) {
      assert.equal(reviewer.env[name], targets[name], `${name} is not the harness-owned target`);
      assert.ok((targets[name] ?? "").startsWith(join(taskDirectory, "scrub-env")), `${name} target ${targets[name]} is not under the task's scrub-env`);
    }
    assert.equal(reviewer.env["CODEX_API_KEY"], "codex-key-for-the-probe", "the declared harness variable did not reach the reviewer");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("without --executor the dispatch loads the executor the project's charter.yaml names in review-executor, and with neither it is refused before launch naming both", () => {
  const configured = project(`review-executor: ${JSON.stringify(STUB)}\n`);
  const bare = project();
  try {
    const run = dispatch(configured.repo, configured.root, {});
    assert.match(run.stdout, /^record: /m, `${run.stdout}${run.stderr}`);
    assert.deepEqual((run.record as Record<string, unknown>)["vocabulary"], { id: "codex-model-vendors", version: 1 });

    const refused = dispatch(bare.repo, bare.root, {});
    assert.equal(refused.status, 1, `${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /no --executor was given and .*charter\.yaml could not be read/);
    assert.equal(refused.record, undefined);
  } finally {
    rmSync(configured.root, { recursive: true, force: true });
    rmSync(bare.root, { recursive: true, force: true });
  }
});
