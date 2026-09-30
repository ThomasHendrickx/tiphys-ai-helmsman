/**
 * `tiphys review dispatch` and the observation it records (kernel plan M6,
 * M6-P5; DR-0062).
 *
 * NO TEST CALLS THE HARNESS. The executor is test/fixtures/review-dispatch/
 * stub-executor.mjs: the Claude Code plugin's own review executor with its
 * command swapped for replay.mjs, which prints a REAL captured stream
 * (test/fixtures/review-dispatch/haiku-with-sonnet-subagent.stream.jsonl, whose
 * provenance is in the README beside it) and writes the verdict the prompt
 * names. So the vocabulary, the stream reading and the kernel's dispatch are
 * all the shipped code, and the input is the harness's real output.
 *
 * `src` is imported through the computed-URL dynamic import pattern (CLAUDE.md
 * standing warning 4).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
const gateEntry = join(repoRoot, "src", "gates", "merge-preconditions.ts");
const fixtures = join(repoRoot, "test", "fixtures", "review-dispatch");
const STREAM = join(fixtures, "haiku-with-sonnet-subagent.stream.jsonl");
const STUB = join(fixtures, "stub-executor.mjs");
const VERDICT_FIXTURE = join(repoRoot, "witness", "fixtures", "dual-review", "decorrelated-hazard.yaml");

const plugin = (await import(new URL("../plugin/src/review.ts", import.meta.url).href)) as {
  readReviewStream: (path: string) => {
    observed: { model: string | null; reason?: string };
    topLevelModels: string[];
    subagentModels: string[];
    totalCostUsd: number | null;
    usage: Record<string, unknown> | null;
  };
};

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

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The captured stream's rows, parsed. */
function streamRows(): Record<string, unknown>[] {
  return readFileSync(STREAM, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function isTopLevelAssistant(row: Record<string, unknown>): boolean {
  return row["type"] === "assistant" && (row["parent_tool_use_id"] === null || row["parent_tool_use_id"] === undefined);
}

/** A project repository with one commit, plus a scratch area outside it. */
function project(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "tiphys-review-dispatch-"));
  const repo = join(root, "project");
  mkdirSync(repo);
  git(repo, ["init", "-q", "."]);
  writeFileSync(join(repo, "README.md"), "a project under review\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "the commit under review"]);
  return { root, repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

interface Dispatch {
  status: number | null;
  stdout: string;
  stderr: string;
  record: Record<string, unknown> | undefined;
  recordPath: string | undefined;
  /** The verdict copy the dispatch leaves next to the record. */
  verdictCopyPath: string | undefined;
}

function dispatch(
  repo: string,
  root: string,
  options: {
    stream: string;
    verdictPath: string;
    head?: string;
    tier?: string;
    exit?: number;
    echo?: string;
    /** Extra variables in the kernel's own environment. */
    env?: Record<string, string>;
  },
): Dispatch {
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
      options.tier ?? "strongest",
      "--head",
      options.head ?? "HEAD",
      "--phase",
      "m3-p9",
      "--brief",
      brief,
      "--verdict",
      options.verdictPath,
      "--out",
      join(root, "out"),
      "--executor",
      STUB,
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        TIPHYS_STUB_STREAM: options.stream,
        TIPHYS_STUB_VERDICT: VERDICT_FIXTURE,
        TIPHYS_STUB_EXIT: String(options.exit ?? 0),
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
    recordPath,
    verdictCopyPath: /^verdict: (.+)$/m.exec(run.stdout ?? "")?.[1],
    record: recordPath === undefined ? undefined : (JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>),
  };
}

test("a dispatch with a stub executor replaying a real captured stream writes a record with the head, the observed model, family anthropic, cost and token usage", () => {
  const { root, repo, head } = project();
  try {
    const echo = join(root, "echo.json");
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml", echo });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const record = run.record as Record<string, unknown>;
    const result = streamRows().find((row) => row["type"] === "result") as Record<string, unknown>;
    const usage = result["usage"] as Record<string, unknown>;

    assert.equal(record["head"], head);
    const observation = record["observation"] as Record<string, unknown>;
    assert.equal(observation["model"], "claude-haiku-4-5-20251001");
    assert.deepEqual(observation["topLevelModels"], ["claude-haiku-4-5-20251001"]);
    assert.deepEqual(observation["subagentModels"], ["claude-sonnet-5-5"]);
    assert.equal(record["family"], "anthropic");
    /* Requested and observed differ here, so the record cannot be an echo of the request. */
    assert.equal(record["requestedModel"], "claude-opus-5");
    assert.equal(record["totalCostUsd"], result["total_cost_usd"]);
    assert.equal((record["usage"] as Record<string, unknown>)["input_tokens"], usage["input_tokens"]);
    assert.equal((record["usage"] as Record<string, unknown>)["output_tokens"], usage["output_tokens"]);
    assert.deepEqual(Object.keys(record["modelUsage"] as object).sort(), ["claude-haiku-4-5-20251001", "claude-sonnet-5-5"]);
    assert.deepEqual(record["verdict"], {
      path: "delivery/review/m3-p9-hazard.yaml",
      sha256: sha256(readFileSync(VERDICT_FIXTURE)),
      reason: "sha256 of the bytes the reviewer wrote, read after the executor exited",
    });
    assert.equal(record["executorExitCode"], 0);
    assert.equal(record["phase"], "m3-p9");
    assert.equal(record["role"], "clean-room-reviewer");

    /* The executor ran in a detached worktree at the head, with the brief on stdin. */
    const seen = JSON.parse(readFileSync(echo, "utf8")) as Record<string, string>;
    assert.equal(seen["stdin"], "BRIEF: review the change at the head you are standing on.\n");
    assert.equal(seen["model"], "claude-opus-5");
    assert.equal(seen["head"], head);
    assert.notEqual(seen["cwd"], repo);
    assert.notEqual(seen["cwd"], realpathSync(repo));

    /* And the record is valid against the shipped schema through the shipped CLI. */
    const validated = spawnSync(process.execPath, [cliEntry, "validate", "--type", "review-record", run.recordPath as string], {
      encoding: "utf8",
    });
    assert.equal(validated.status, 0, `${validated.stdout}${validated.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the observation counts top-level assistant rows only, measured against a real stream whose subagent ran on another model", () => {
  const reading = plugin.readReviewStream(STREAM);
  const rows = streamRows().filter((row) => row["type"] === "assistant");
  const subagent = rows.filter((row) => !isTopLevelAssistant(row));
  assert.ok(subagent.length > 0, "the capture carries no subagent assistant row, so it witnesses nothing");
  assert.ok(
    subagent.every((row) => (row["message"] as Record<string, unknown>)["model"] === "claude-sonnet-5-5"),
    "the capture's subagent rows are not on the other model",
  );
  assert.deepEqual(reading.observed, { model: "claude-haiku-4-5-20251001" });
  assert.deepEqual(reading.topLevelModels, ["claude-haiku-4-5-20251001"]);
  assert.deepEqual(reading.subagentModels, ["claude-sonnet-5-5"]);
});

test("a stream with zero or two distinct top-level assistant models yields a record with no observed model, and the merge gate does not count it", () => {
  const { root, repo } = project();
  try {
    /* A real pair-tier branch: the regime documents and a runtime set at the base, a change under src/. */
    copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(repo, "assurance-modes.yaml"));
    const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8").replace(
      /^delivery-mode: .*$/m,
      "delivery-mode: full",
    );
    writeFileSync(join(repo, "charter.yaml"), `${charter}\nruntime-set:\n  paths: [src/]\n`);
    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "src", "feature.ts"), "export const feature = 1;\n");
    git(repo, ["add", "charter.yaml", "assurance-modes.yaml", "src"]);
    git(repo, ["commit", "-q", "-m", "base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    writeFileSync(join(repo, "src", "feature.ts"), "export const feature = 2;\n");
    git(repo, ["add", "src"]);
    git(repo, ["commit", "-q", "-m", "the change under review"]);
    const reviewed = git(repo, ["rev-parse", "HEAD"]);

    /* Both failing streams are DERIVED from the real capture, one edit each. */
    const rows = streamRows();
    const zero = join(root, "zero.jsonl");
    writeFileSync(zero, rows.filter((row) => row["type"] !== "assistant").map((row) => JSON.stringify(row)).join("\n") + "\n");
    const firstTop = rows.findIndex(isTopLevelAssistant);
    const two = join(root, "two.jsonl");
    writeFileSync(
      two,
      rows
        .map((row, index) =>
          index === firstTop
            ? JSON.stringify({ ...row, message: { ...(row["message"] as object), model: "claude-opus-5" } })
            : JSON.stringify(row),
        )
        .join("\n") + "\n",
    );

    const good = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-a.yaml" });
    assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);
    const failed: Dispatch[] = [];
    for (const [stream, name, topLevel] of [
      [zero, "m3-p9-b.yaml", []],
      [two, "m3-p9-c.yaml", ["claude-haiku-4-5-20251001", "claude-opus-5"]],
    ] as [string, string, string[]][]) {
      const run = dispatch(repo, root, { stream, verdictPath: `delivery/review/${name}` });
      assert.equal(run.status, 1, `${name}: ${run.stdout}${run.stderr}`);
      assert.match(run.stderr, /no served model was observed/);
      const observation = (run.record as Record<string, unknown>)["observation"] as Record<string, unknown>;
      assert.equal(observation["model"], null, name);
      assert.deepEqual(observation["topLevelModels"], topLevel, name);
      assert.equal((run.record as Record<string, unknown>)["family"], "unknown", name);
      /* Never a fallback to the requested model. */
      assert.notEqual(observation["model"], (run.record as Record<string, unknown>)["requestedModel"]);
      failed.push(run);
    }

    /* The orchestrator's copy step: each verdict at its path, each record under records/. */
    mkdirSync(join(repo, "delivery", "review", "records"), { recursive: true });
    for (const run of [good, ...failed]) {
      const record = run.record as Record<string, unknown>;
      const verdictPath = (record["verdict"] as Record<string, string>)["path"] as string;
      copyFileSync(run.verdictCopyPath as string, join(repo, verdictPath));
      copyFileSync(run.recordPath as string, join(repo, "delivery", "review", "records", `${record["taskId"] as string}.json`));
    }
    git(repo, ["add", "delivery"]);
    git(repo, ["commit", "-q", "-m", "the reviews"]);
    const audited = git(repo, ["rev-parse", "HEAD"]);
    assert.notEqual(audited, reviewed);

    const evidence = join(root, "evidence");
    mkdirSync(evidence);
    const gate = spawnSync(
      process.execPath,
      [
        gateEntry,
        "--result",
        join(evidence, "result.json"),
        "--head",
        audited,
        "--phase",
        "m3-p9",
        "--context",
        repo,
        "--repo",
        "example/project",
        "--api-base",
        "http://127.0.0.1:9",
        "--base",
        base,
      ],
      { encoding: "utf8" },
    );
    const result = JSON.parse(readFileSync(join(evidence, "result.json"), "utf8")) as Record<string, unknown>;
    assert.equal(result["status"], "red", gate.stdout);
    assert.match(String(result["detail"]), /1 of 2 are counted and 1 missing/);
    for (const run of failed) {
      const taskId = (run.record as Record<string, unknown>)["taskId"] as string;
      assert.match(gate.stdout, new RegExp(`NOT COUNTED delivery/review/records/${taskId}\\.json observed no served model`));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dispatch is refused before launch for a verdict path outside delivery/review, a head that is not a commit, and a verdict already committed at the head", () => {
  const { root, repo } = project();
  try {
    mkdirSync(join(repo, "delivery", "review"), { recursive: true });
    writeFileSync(join(repo, "delivery", "review", "old.yaml"), "kind: verdict\n");
    git(repo, ["add", "delivery"]);
    git(repo, ["commit", "-q", "-m", "an old verdict"]);
    for (const [options, reason] of [
      [{ verdictPath: "src/verdict.yaml" }, /--verdict src\/verdict\.yaml must lie under delivery\/review\//],
      [{ verdictPath: "delivery/review/records/x.json" }, /must lie under delivery\/review\/ and outside delivery\/review\/records\//],
      [{ verdictPath: "delivery/review/../x.yaml" }, /has an empty, \. or \.\. segment/],
      [{ verdictPath: "delivery/review/new.yaml", head: "no-such-ref" }, /--head no-such-ref does not name a commit/],
      [{ verdictPath: "delivery/review/old.yaml" }, /already exists at [0-9a-f]{40}; a review writes a new verdict/],
    ] as [{ verdictPath: string; head?: string }, RegExp][]) {
      const run = dispatch(repo, root, { stream: STREAM, ...options });
      assert.equal(run.status, 1, `${options.verdictPath}: ${run.stdout}${run.stderr}`);
      assert.match(run.stderr, reason);
      assert.equal(run.recordPath, undefined, "a refused dispatch writes no record");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* M6-P5 fix round 1                                                    */
/* ------------------------------------------------------------------ */

const envModule = (await import(new URL("../src/exec/env.ts", import.meta.url).href)) as {
  permittedChildEnvNames: () => Set<string>;
  SCRUB_DIR_NAME: string;
};

/** Names the kernel's scrub must keep out of a reviewer, each set in the kernel's own environment. */
const SCRUBBED: Record<string, string> = {
  GH_TOKEN: "gh-token-for-the-probe",
  GITHUB_TOKEN: "github-token-for-the-probe",
  GH_ENTERPRISE_TOKEN: "enterprise-token-for-the-probe",
  HTTPS_PROXY: "http://127.0.0.1:9",
  https_proxy: "http://127.0.0.1:9",
  SSH_AUTH_SOCK: "/nonexistent/agent.sock",
  TIPHYS_UNRELATED_SECRET: "an-unrelated-secret",
};

test("the reviewer runs in the kernel's scrubbed environment, so no pull-request credential, proxy or unrelated secret the kernel holds reaches it, and its HOME is the task's empty scrub directory", () => {
  const { root, repo } = project();
  try {
    const echo = join(root, "echo.json");
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml", echo, env: SCRUBBED });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const seen = JSON.parse(readFileSync(echo, "utf8")) as { envNames: string[]; home: string | null };
    for (const name of Object.keys(SCRUBBED)) {
      assert.ok(!seen.envNames.includes(name), `${name} reached the reviewer: [${seen.envNames.join(", ")}]`);
    }
    const permitted = envModule.permittedChildEnvNames();
    const extra = seen.envNames.filter((name) => !permitted.has(name));
    assert.deepEqual(extra, [], `names outside the kernel's child allowlist reached the reviewer: [${extra.join(", ")}]`);
    const taskId = (run.record as Record<string, unknown>)["taskId"] as string;
    assert.equal(seen.home, join(dirname(run.recordPath as string), taskId, envModule.SCRUB_DIR_NAME, "home"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("after hashing, the dispatch copies the verdict next to its record and removes the review worktree it created, registration included", () => {
  const { root, repo } = project();
  try {
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml" });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const record = run.record as Record<string, unknown>;
    const taskId = record["taskId"] as string;
    const out = dirname(run.recordPath as string);
    assert.equal(run.verdictCopyPath, join(out, `${taskId}.verdict.yaml`));
    assert.equal(sha256(readFileSync(run.verdictCopyPath as string)), (record["verdict"] as Record<string, string>)["sha256"]);
    const worktree = join(out, taskId, "worktree");
    assert.equal(spawnSync("test", ["-e", worktree]).status, 1, `${worktree} still exists`);
    const listed = git(repo, ["worktree", "list", "--porcelain"]);
    assert.ok(!listed.includes(taskId), `the review worktree is still registered:\n${listed}`);
    assert.equal(listed.split("\n").filter((line) => line.startsWith("worktree ")).length, 1, listed);
    /* The capture and the scrubbed HOME stay with the task. */
    assert.equal(spawnSync("test", ["-f", join(out, taskId, "stream.jsonl")]).status, 0);
    assert.equal(spawnSync("test", ["-d", join(out, taskId, envModule.SCRUB_DIR_NAME, "home")]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const reviewModule = (await import(new URL("../src/review.ts", import.meta.url).href)) as {
  REVIEWER_GRANT: unknown;
};

test("the dispatch passes the executor exactly the kernel's reviewer grant, and that grant is DR-0065's: read the repository, write only in the review worktree, run node, npm run build and read-only git, no push and no network tools", () => {
  const { root, repo } = project();
  try {
    const echo = join(root, "echo.json");
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml", echo });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const seen = JSON.parse(readFileSync(echo, "utf8")) as { extra: unknown };
    /* One argument after the prompt, and it is the kernel's own constant. */
    assert.deepEqual(seen.extra, [JSON.parse(JSON.stringify(reviewModule.REVIEWER_GRANT))]);
    /* And the constant is the decided grant, word for word. */
    assert.deepEqual(seen.extra, [
      {
        readRepository: true,
        writeReviewWorktree: true,
        commands: [
          ["node"],
          ["npm", "run", "build"],
          ["git", "diff"],
          ["git", "log"],
          ["git", "show"],
          ["git", "grep"],
          ["git", "status"],
          ["git", "checkout", "--"],
        ],
        push: false,
        networkTools: false,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The Claude Code executor maps the grant (DR-0065, fix round 2)      */
/* ------------------------------------------------------------------ */

const executorArgv = (await import(new URL("../plugin/src/review.ts", import.meta.url).href)) as {
  reviewArgv: (model: string, prompt: string, grant: unknown) => string[];
};

/** The real stream of the fix-round-2 live dispatch, run with the grant's flags. */
const GRANT_SMOKE = join(fixtures, "grant-smoke.stream.jsonl");

/** The values that follow `flag` in `argv`, up to the next flag. */
function flagValues(argv: string[], flag: string): string[] {
  const at = argv.indexOf(flag);
  if (at === -1) {
    return [];
  }
  const rest = argv.slice(at + 1);
  const end = rest.findIndex((part) => part.startsWith("--"));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The `system/init` row of a captured stream. */
function initRow(path: string): Record<string, unknown> {
  const row = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((candidate) => candidate["type"] === "system" && candidate["subtype"] === "init");
  assert.ok(row !== undefined, `${path} has no system/init row`);
  return row;
}

test("the Claude Code executor maps the reviewer grant to exactly its permission flags: acceptEdits, an allow-list anchored at the review directory with one Bash rule per granted command, and a deny-list for push and network tools; a grant it cannot map throws", () => {
  const prompt = "Review according to the brief on standard input.";
  assert.deepEqual(executorArgv.reviewArgv("some-model", prompt, reviewModule.REVIEWER_GRANT), [
    "claude",
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    "some-model",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    "Read(./**)",
    "Edit(./**)",
    "Bash(node *)",
    "Bash(npm run build *)",
    "Bash(git diff *)",
    "Bash(git log *)",
    "Bash(git show *)",
    "Bash(git grep *)",
    "Bash(git status *)",
    "Bash(git checkout -- *)",
    "--disallowedTools",
    "WebFetch",
    "WebSearch",
    "Bash(git push *)",
  ]);
  /* The flags follow the grant's data, not a fixed list: a grant with no
     writes and one command maps to no edit rule, one Bash rule, and a mode
     that denies anything else. */
  const readOnly = { readRepository: true, writeReviewWorktree: false, commands: [["git", "diff"]], push: false, networkTools: false };
  assert.deepEqual(executorArgv.reviewArgv("some-model", prompt, readOnly).slice(8), [
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Read(./**)",
    "Bash(git diff *)",
    "--disallowedTools",
    "WebFetch",
    "WebSearch",
    "Bash(git push *)",
  ]);
  /* A grant this executor cannot express faithfully refuses, naming why. */
  assert.throws(() => executorArgv.reviewArgv("m", prompt, { ...readOnly, push: true }), /allows a push/);
  assert.throws(() => executorArgv.reviewArgv("m", prompt, { ...readOnly, networkTools: true }), /allows network tools/);
  assert.throws(() => executorArgv.reviewArgv("m", prompt, { ...readOnly, readRepository: false }), /withholds reads/);
  assert.throws(() => executorArgv.reviewArgv("m", prompt, { ...readOnly, commands: [["git", "*"]] }), /not a list of plain words/);
});

test("the real CLI, given the executor's argv for the kernel's grant, ran in acceptEdits without WebFetch or WebSearch, ran node --version and wrote the verdict with no permission denial", () => {
  const argv = executorArgv.reviewArgv("some-model", "a prompt", reviewModule.REVIEWER_GRANT);
  const granted = initRow(GRANT_SMOKE);
  const ungranted = initRow(STREAM);
  /* The mode the argv asks for is the mode the CLI reported running in; the
     capture without the flags ran in the default mode. */
  assert.deepEqual(flagValues(argv, "--permission-mode"), [granted["permissionMode"]]);
  assert.equal(granted["permissionMode"], "acceptEdits");
  assert.equal(ungranted["permissionMode"], "default");
  /* Each network tool the argv denies is listed without the flags and gone
     with them. */
  const denied = flagValues(argv, "--disallowedTools");
  for (const tool of ["WebFetch", "WebSearch"]) {
    assert.ok(denied.includes(tool), `the argv does not deny ${tool}: [${denied.join(", ")}]`);
    assert.ok((ungranted["tools"] as string[]).includes(tool), `the capture without the flags does not list ${tool}`);
    assert.ok(!(granted["tools"] as string[]).includes(tool), `the capture with the flags still lists ${tool}`);
  }
  /* And the reviewer could run and write: its Bash call ran node --version,
     its Write succeeded, and nothing was denied. */
  const rows = readFileSync(GRANT_SMOKE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const calls = rows
    .filter(isTopLevelAssistant)
    .flatMap((row) => ((row["message"] as Record<string, unknown>)["content"] as Record<string, unknown>[]) ?? [])
    .filter((part) => part["type"] === "tool_use");
  assert.ok(
    calls.some((call) => call["name"] === "Bash" && (call["input"] as Record<string, unknown>)["command"] === "node --version"),
    "no Bash call ran node --version",
  );
  assert.ok(calls.some((call) => call["name"] === "Write"), "no Write call");
  const result = rows.find((row) => row["type"] === "result") as Record<string, unknown>;
  assert.equal(result["subtype"], "success");
  assert.deepEqual(result["permission_denials"], []);
});

/* ------------------------------------------------------------------ */
/* The kernel prepares the worktree, and maps the grant first          */
/* (M6-P5 fix round 3)                                                */
/* ------------------------------------------------------------------ */

/**
 * A project whose head carries a package-lock.json with one dependency, a
 * local directory, so `npm ci` needs no network. With `inSync` false the lock
 * omits the dependency the package.json names, which `npm ci` refuses.
 */
function npmProject(inSync: boolean): { root: string; repo: string; head: string } {
  const made = project();
  mkdirSync(join(made.repo, "local-dep"));
  writeFileSync(join(made.repo, "local-dep", "package.json"), '{ "name": "local-dep", "version": "1.0.0" }\n');
  writeFileSync(
    join(made.repo, "package.json"),
    `${JSON.stringify(
      { name: "reviewed-project", version: "1.0.0", private: true, dependencies: { "local-dep": "file:./local-dep" } },
      null,
      2,
    )}\n`,
  );
  const packages: Record<string, unknown> = { "": { name: "reviewed-project", version: "1.0.0" } };
  if (inSync) {
    packages[""] = { name: "reviewed-project", version: "1.0.0", dependencies: { "local-dep": "file:./local-dep" } };
    packages["local-dep"] = { version: "1.0.0" };
    packages["node_modules/local-dep"] = { resolved: "local-dep", link: true };
  }
  writeFileSync(
    join(made.repo, "package-lock.json"),
    `${JSON.stringify({ name: "reviewed-project", version: "1.0.0", lockfileVersion: 3, requires: true, packages }, null, 2)}\n`,
  );
  git(made.repo, ["add", "."]);
  git(made.repo, ["commit", "-q", "-m", "a head with a lockfile"]);
  return { ...made, head: git(made.repo, ["rev-parse", "HEAD"]) };
}

function registeredWorktrees(repo: string): string[] {
  return git(repo, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
}

test("before launch the kernel runs npm ci in the review worktree of a head with a package-lock.json, so the reviewer finds node_modules in its working directory, and the project checkout gets none", () => {
  const { root, repo } = npmProject(true);
  try {
    const echo = join(root, "echo.json");
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml", echo });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    const seen = JSON.parse(readFileSync(echo, "utf8")) as { cwd: string; nodeModules: string[] | null };
    const taskId = (run.record as Record<string, unknown>)["taskId"] as string;
    const taskDirectory = join(dirname(run.recordPath as string), taskId);
    assert.equal(realpathSync(dirname(seen.cwd)), realpathSync(taskDirectory), `the reviewer stood in ${seen.cwd}`);
    assert.ok(seen.nodeModules?.includes("local-dep"), `node_modules in the reviewer's directory: ${JSON.stringify(seen.nodeModules)}`);
    assert.equal(spawnSync("test", ["-e", join(repo, "node_modules")]).status, 1, "npm ci ran in the project checkout");
    assert.equal(spawnSync("test", ["-s", join(taskDirectory, "npm-ci.txt")]).status, 0, "no npm ci output was kept");
    assert.equal(registeredWorktrees(repo).length, 1, "the review worktree is still registered");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failing dependency install refuses before launch with exit 1 and one line naming npm ci, writes no record, and leaves no review worktree registered", () => {
  const { root, repo } = npmProject(false);
  try {
    const echo = join(root, "echo.json");
    const run = dispatch(repo, root, { stream: STREAM, verdictPath: "delivery/review/m3-p9-hazard.yaml", echo });
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
    const lines = run.stderr.split("\n").filter((line) => line.startsWith("tiphys review: "));
    assert.equal(lines.length, 1, run.stderr);
    assert.match(
      lines[0] as string,
      /dependencies could not be installed, so nothing was launched: npm ci exited 1 in .* \(output in .*npm-ci\.txt\); the review worktree was removed$/,
    );
    assert.equal(run.recordPath, undefined, run.stdout);
    assert.equal(spawnSync("test", ["-e", echo]).status, 1, "the executor ran");
    assert.deepEqual(registeredWorktrees(repo).length, 1, git(repo, ["worktree", "list"]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an executor that cannot map the grant refuses before anything is created: no task directory and no review worktree registered", () => {
  const { root, repo } = project();
  try {
    const run = dispatch(repo, root, {
      stream: STREAM,
      verdictPath: "delivery/review/m3-p9-hazard.yaml",
      env: { TIPHYS_STUB_COMMAND_THROWS: "1" },
    });
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /could not build its command: the stub executor was told to refuse the grant/);
    assert.equal(registeredWorktrees(repo).length, 1, git(repo, ["worktree", "list"]));
    const out = join(root, "out");
    const left = spawnSync("find", [out, "-mindepth", "1"], { encoding: "utf8" });
    assert.equal(left.status === 0 ? left.stdout.trim() : "", "", `the refusal left ${left.stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
