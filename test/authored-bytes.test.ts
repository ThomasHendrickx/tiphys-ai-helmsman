import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../scripts/check-authored-bytes.mjs", import.meta.url));

function repository(files: Record<string, Buffer | string>): string {
  const root = mkdtempSync(join(tmpdir(), "tiphys-authored-bytes-"));
  assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
}

function writeBlob(root: string, contents: string): string {
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: root,
    input: contents,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("authored-byte checker rejects NUL SOH and non-ASCII tracked bytes", () => {
  const root = repository({
    "nul.txt": Buffer.from([0x61, 0x00, 0x62]),
    "soh.txt": Buffer.from([0x01]),
    "unicode.txt": Buffer.from([0xc3, 0xa9]),
  });
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /nul\.txt:1: control byte 0x00/);
  assert.match(result.stderr, /soh\.txt:0: control byte 0x01/);
  assert.match(result.stderr, /unicode\.txt:0: non-ASCII byte 0xc3/);
});

test("authored-byte checker accepts ordinary tracked ASCII", () => {
  const result = run(repository({ "ordinary.txt": "plain ASCII\n" }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

test("authored-byte checker exempts only the owner input and vendored fixture paths", () => {
  const exempt = repository({
    "delivery/intake/orchestrated-delivery-process.md": Buffer.from([0x00, 0xc3]),
    "test/fixtures/json-schema-test-suite/example.json": Buffer.from([0x01, 0xff]),
  });
  assert.equal(run(exempt).status, 0);

  const nearMiss = repository({
    "delivery/intake/other.md": Buffer.from([0x00]),
    "test/fixtures/json-schema-test-suite-near/example.json": Buffer.from([0x01]),
  });
  const result = run(nearMiss);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /delivery\/intake\/other\.md/);
  assert.match(result.stderr, /json-schema-test-suite-near/);
});

test("authored-byte checker reads tracked symlink text without following its target", () => {
  const root = repository({});
  const outside = join(dirname(root), "tiphys-authored-bytes-outside");
  writeFileSync(outside, Buffer.from([0x00]));
  symlinkSync(outside, join(root, "outside-link"));
  symlinkSync("missing-\u00e9", join(root, "broken-link"));
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);

  const result = run(root);
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /outside-link/);
  assert.match(result.stderr, /broken-link:8: non-ASCII byte 0xc3/);
});

test("authored-byte checker fails closed on an unmerged index", () => {
  const root = repository({});
  const base = writeBlob(root, "base\n");
  const ours = writeBlob(root, "ours\n");
  const theirs = writeBlob(root, "theirs\n");
  const index = [
    `100644 ${base} 1\tconflicted.txt`,
    `100644 ${ours} 2\tconflicted.txt`,
    `100644 ${theirs} 3\tconflicted.txt`,
    "",
  ].join("\n");
  const update = spawnSync("git", ["update-index", "--index-info"], {
    cwd: root,
    input: index,
    encoding: "utf8",
  });
  assert.equal(update.status, 0, update.stderr);

  const result = run(root);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /unsupported index entry/);
});

test("authored-byte checker refuses tracked worktree bytes that differ from the index", () => {
  const root = repository({ "tracked.txt": "plain ASCII\n" });
  writeFileSync(join(root, "tracked.txt"), Buffer.from([0x00]));

  const result = run(root);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /tracked working tree differs from the index/);
});

/* ------------------------------------------------------------------ */
/* M5-P4 criterion p4-ci-steps: the two checks can fail the `gates` job */
/* ------------------------------------------------------------------ */

/*
 * WHY THIS IS A HARNESS AND NOT A GREP. The plan names the hazard
 * `workflow-text-guard`: CI appears wired because a string exists while the
 * step cannot fail the job. A test that searched gates.yml for the script name
 * would be green against `run: node scripts/check-authored-bytes.mjs || true`,
 * against `continue-on-error: true`, and against an `if:` that runs the step on
 * one event only. So the step's `run:` text is EXTRACTED from the parsed
 * workflow and EXECUTED by bash in a fixture repository, once clean and once
 * carrying the deliberate violation, and the job-level properties that decide
 * whether a nonzero exit reddens the job are evaluated per CI event.
 *
 * The shell is the one GitHub Actions uses for a `run:` step on an Ubuntu
 * runner when no `shell:` is given: `bash --noprofile --norc -eo pipefail`.
 */

const gatesWorkflowPath = fileURLToPath(new URL("../.github/workflows/gates.yml", import.meta.url));
const collisionChecker = fileURLToPath(new URL("../scripts/check-id-collisions.mjs", import.meta.url));

const workflowYaml = (await import("yaml")) as unknown as { parse: (text: string) => unknown };

interface CiStep {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  shell?: string;
  "continue-on-error"?: unknown;
}

interface CiJob {
  steps?: CiStep[];
  "continue-on-error"?: unknown;
  strategy?: { matrix?: unknown };
}

const CI_EVENTS = ["pull_request", "push"] as const;

/**
 * Whether a step's `if:` lets it run on `event`. Deliberately small and FAIL
 * CLOSED: status functions are accepted, `github.event_name ==` and `!=` a
 * quoted literal are evaluated, and any other term throws, so an expression
 * this evaluator does not understand is a red test rather than a guess.
 */
function stepRunsOn(condition: string | undefined, event: string): boolean {
  if (condition === undefined) return true;
  const body = condition.trim().replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
  return body.split("&&").every((raw) => {
    const term = raw.trim();
    if (term === "!cancelled()" || term === "always()" || term === "success()") return true;
    const compared = /^github\.event_name\s*(==|!=)\s*'([^']*)'$/.exec(term);
    if (compared === null) {
      throw new Error(`the step condition term ${JSON.stringify(term)} is not one this harness evaluates`);
    }
    return compared[1] === "==" ? event === compared[2] : event !== compared[2];
  });
}

function continueOnError(value: unknown): boolean {
  return value !== undefined && value !== false && value !== "false";
}

/** The one step in the `gates` job whose `run:` invokes `script`. */
function gatesJobStep(workflowText: string, script: string): { job: CiJob; step: CiStep } {
  const document = workflowYaml.parse(workflowText) as { jobs: Record<string, CiJob> };
  const job = document.jobs["gates"];
  assert.ok(job !== undefined, "the workflow has no job named `gates`, the required status context");
  const matching = (job.steps ?? []).filter(
    (step) => typeof step.run === "string" && step.run.includes(script),
  );
  assert.equal(
    matching.length,
    1,
    `expected exactly one step in the \`gates\` job running ${script}, found ${String(matching.length)}`,
  );
  return { job, step: matching[0] as CiStep };
}

/** Execute a step's extracted `run:` text the way the runner does. */
function executeStep(step: CiStep, cwd: string): number | null {
  assert.equal(step.shell, undefined, "the step declares a shell, which this harness does not emulate");
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", "-c", step.run as string],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env["PATH"] ?? ""}` },
    },
  );
  return result.status;
}

/**
 * Does a violation in `violating` fail the `gates` job on every CI event,
 * while `clean` passes? Returns the reasons it does NOT, so an empty list is
 * the wired state and every defang produces a named reason.
 */
function ciStepDefects(
  workflowText: string,
  script: string,
  clean: string,
  violating: string,
): string[] {
  const { job, step } = gatesJobStep(workflowText, script);
  const defects: string[] = [];
  if (job.strategy?.matrix !== undefined) {
    defects.push("the gates job has a matrix, which renames the required context");
  }
  if (continueOnError(job["continue-on-error"])) defects.push("the gates job is continue-on-error");
  if (continueOnError(step["continue-on-error"])) defects.push(`the ${script} step is continue-on-error`);
  for (const event of CI_EVENTS) {
    if (!stepRunsOn(step.if, event)) defects.push(`the ${script} step does not run on ${event}`);
  }
  const cleanExit = executeStep(step, clean);
  if (cleanExit !== 0) defects.push(`the ${script} step exited ${String(cleanExit)} on the clean tree`);
  const violatingExit = executeStep(step, violating);
  if (violatingExit === 0) defects.push(`the ${script} step exited 0 on the deliberate violation`);
  return defects;
}

const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

/** A committed fixture repository carrying both scripts where the step's `run:` expects them. */
function ciFixture(extra: Record<string, Buffer | string> = {}): string {
  const root = repository({
    "scripts/check-authored-bytes.mjs": readFileSync(checker),
    "scripts/check-id-collisions.mjs": readFileSync(collisionChecker),
    "delivery/tuition/T-001-a-first-entry.md": "first\n",
    "delivery/decisions/DR-0001-a-first-decision.md": "first\n",
    "README.md": "plain ASCII\n",
  });
  const commit = spawnSync("git", ["commit", "-q", "-m", "fixture"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...FIXTURE_GIT_ENV },
  });
  assert.equal(commit.status, 0, commit.stderr);
  for (const [path, bytes] of Object.entries(extra)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), bytes);
  }
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: root }).status, 0);
  return root;
}

const CI_STEP_CASES: { script: string; violation: Record<string, Buffer | string> }[] = [
  {
    script: "scripts/check-authored-bytes.mjs",
    violation: { "delivery/notes.md": Buffer.from([0x61, 0x00, 0x62, 0x0a]) },
  },
  {
    script: "scripts/check-id-collisions.mjs",
    violation: { "delivery/tuition/T-001-a-different-subject.md": "second\n" },
  },
];

test("the authored-bytes and id-collision steps extracted from the gates job fail it on a deliberate violation on both CI events and pass a clean tree", () => {
  const workflow = readFileSync(gatesWorkflowPath, "utf8");
  const clean = ciFixture();
  for (const { script, violation } of CI_STEP_CASES) {
    const violating = ciFixture(violation);
    assert.deepEqual(ciStepDefects(workflow, script, clean, violating), [], script);

    /* THE VIOLATIONS ARE INDEPENDENT: the other step passes on this
       violation, so each step is reddened by its own property and not by a
       fixture that happens to break both. */
    for (const other of CI_STEP_CASES) {
      if (other.script === script) continue;
      assert.equal(
        executeStep(gatesJobStep(workflow, other.script).step, violating),
        0,
        `${other.script} on the ${script} violation`,
      );
    }

    /* THREE STRUCTURALLY DIFFERENT DEFANGS, each applied to the workflow
       TEXT and each run through the same harness: the command's exit is
       swallowed, the step is allowed to fail, and the step is narrowed to one
       CI event. A harness that stayed empty under any of them could not tell
       a wired step from a decorative one, which is the hazard itself. */
    const runLine = `run: node ${script}`;
    assert.ok(workflow.includes(runLine), `the workflow no longer carries ${runLine}`);
    const stepIndent = "        ";

    const orTrue = workflow.replace(runLine, `${runLine} || true`);
    assert.match(
      ciStepDefects(orTrue, script, clean, violating).join("\n"),
      /exited 0 on the deliberate violation/,
    );

    const softFail = workflow.replace(runLine, `continue-on-error: true\n${stepIndent}${runLine}`);
    assert.notEqual(softFail, workflow);
    assert.match(ciStepDefects(softFail, script, clean, violating).join("\n"), /is continue-on-error/);

    const oneArm = workflow.replace(
      runLine,
      `if: github.event_name == 'pull_request'\n${stepIndent}${runLine}`,
    );
    assert.notEqual(oneArm, workflow);
    assert.match(ciStepDefects(oneArm, script, clean, violating).join("\n"), /does not run on push/);
  }
});
