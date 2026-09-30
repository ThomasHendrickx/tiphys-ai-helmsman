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
}

function dispatch(
  repo: string,
  root: string,
  options: { stream: string; verdictPath: string; head?: string; tier?: string; exit?: number; echo?: string },
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
      },
    },
  );
  const recordPath = /^record: (.+)$/m.exec(run.stdout ?? "")?.[1];
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    recordPath,
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
    assert.equal(git(seen["cwd"] as string, ["rev-parse", "HEAD"]), head);
    assert.notEqual(realpathSync(seen["cwd"] as string), realpathSync(repo));

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
    git(repo, ["add", "charter.yaml", "assurance-modes.yaml"]);
    git(repo, ["commit", "-q", "-m", "base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "src", "feature.ts"), "export const feature = 1;\n");
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
      const worktree = join(dirname(run.recordPath as string), record["taskId"] as string, "worktree");
      copyFileSync(join(worktree, verdictPath), join(repo, verdictPath));
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
