/**
 * THE MERGE PRECONDITION READER (kernel plan M4, M4-P12; DR-0012, T-009,
 * R-064, R-065a).
 *
 * ONE HAZARD CLASS, and every test here is a member of it: A MERGE PRECONDITION
 * CHECK THAT IS GREEN BECAUSE IT COULD NOT LOOK.
 *
 * HOW THE RED WITNESSES ARE BUILT, because it is the half most easily faked.
 * The dangerous state for this phase is NOT "the gate is absent"; a gate that
 * does not exist reddens everything and proves nothing. It is "the gate is
 * PRESENT AND WRONG in one of the named ways", so every witness below applies a
 * declared MUTATION to the shipped gate and asserts the mutant reports the
 * WRONG WORD on the same fixture:
 *
 *   criterion 2   a request wrapped in a catch that returns "unknown"
 *   criterion 3   the head_sha comparison dropped, so the newest run on the
 *                 BRANCH is read as evidence about THIS head
 *   criterion 4   the scope record satisfied by its EXISTENCE
 *   criterion 5   the arbitration satisfied by the file's EXISTENCE
 *   criterion 6   an empty ruleset body defaulted to "protected"
 *   criterion 7   the enforcement word and the required context not compared
 *
 * THE API IS A REAL SERVER, NOT A STUB INSIDE THE GATE. Every test that needs
 * the GitHub API starts a `node:http` server on a loopback port and points the
 * gate at it with `--api-base`, so the gate's own fetch, its status handling
 * and its body parsing are all exercised. The CLOSED-PORT arm binds a server,
 * reads its port and closes it, so the port is genuinely closed rather than one
 * Node refuses for being on its blocked list (port 1 answers `bad port`, which
 * is a different failure and would not exercise a refused connection).
 *
 * THE VERDICT DOCUMENTS ARE THE SHIPPED FIXTURES under
 * `witness/fixtures/dual-review/`, never hand-written: a hand-written "verdict"
 * is a document no reviewer could have produced.
 *
 * `src` is imported through the computed-URL dynamic import pattern (CLAUDE.md
 * standing warning 4).
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { realpathSync as ceilingRealpath } from "node:fs";
import { tmpdir as ceilingTmpdir } from "node:os";
import { delimiter as ceilingDelimiter } from "node:path";

/*
 * NO REPOSITORY ABOVE THE SCRATCH ROOT (kernel 0.2.1 fix round 3). Tests in
 * this file stage context directories under os.tmpdir() that are NOT git
 * repositories (or whose `.git` is removed) and assert what the code does
 * when no repository is found. Git DISCOVERS a repository in any ancestor, so
 * a repository at or above os.tmpdir() turns every such arm into a read of
 * THAT repository's HEAD. Measured: the whole suite with os.tmpdir() inside a
 * real repository failed 64 tests across six files, this one among them, and
 * CI run 35946757118 failed one of them the same way. The ceiling stops
 * discovery from climbing out of os.tmpdir(); repositories a test stages
 * INSIDE it (and contexts nested in them) are still found. Every child
 * process inherits it from here.
 */
const GIT_CEILING = [ceilingRealpath(ceilingTmpdir()), ceilingTmpdir(), process.env["GIT_CEILING_DIRECTORIES"] ?? ""]
  .filter((entry) => entry !== "")
  .join(ceilingDelimiter);
process.env["GIT_CEILING_DIRECTORIES"] = GIT_CEILING;
/*
 * AND NO REPOSITORY BY THE ENVIRONMENT (kernel 0.2.1 fix round 3, the
 * orchestrator's decision on open question 13). The ceiling above stops
 * DISCOVERY; it does not stop an inherited GIT_DIR, which names a repository
 * outright and was the only shape measured to reproduce CI's exact message.
 * So the names that relocate the repository, its objects or its index are
 * removed for this file and every child it spawns.
 */
const INHERITED_REPOSITORY_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
for (const name of INHERITED_REPOSITORY_ENV) {
  delete process.env[name];
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const gateSource = join(repoRoot, "src", "gates", "merge-preconditions.ts");
const fixturesDir = join(repoRoot, "witness", "fixtures", "dual-review");

const gateModule = (await import(new URL("../src/gates/merge-preconditions.ts", import.meta.url).href)) as {
  judgeCheckRuns: (
    head: string,
    runs: readonly Record<string, unknown>[],
    context: string,
  ) => { ok: boolean; sentence: string };
  judgeRulesets: (
    rulesets: readonly { id: string; name: string; enforcement: string; rules: unknown[] }[],
  ) => { ok: boolean; sentence: string };
  gateStatusForRows: (
    rows: readonly { id: string; clause: string; status: string; head: string; sentence: string }[],
  ) => string;
  readJsonBody: (
    url: string,
    response: { ok: true; status: number; body: string } | { ok: false; reason: string },
  ) => { ok: true; value: unknown } | { ok: false; reason: string };
  PRECONDITION_ID: string;
  UNIT_LABEL: string;
};

/* ------------------------------------------------------------------ */
/* The head the shipped fixtures claim to review                        */
/* ------------------------------------------------------------------ */

/**
 * READ OUT OF A FIXTURE RATHER THAN WRITTEN HERE, so this file cannot drift
 * from `witness/fixtures/dual-review/` the way a second copy of a constant
 * always eventually does.
 */
const FIXTURE_HEAD = (() => {
  const body = readFileSync(join(fixturesDir, "decorrelated-criteria.yaml"), "utf8");
  const match = /^head: ([0-9a-f]{40})$/m.exec(body);
  assert.ok(match !== null, "the decorrelated-criteria fixture carries no forty-hex head");
  return (match as RegExpExecArray)[1] as string;
})();

/** A DIFFERENT forty-character sha, used wherever "an earlier head" is needed. */
const EARLIER_HEAD = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";

const FIXTURE_PHASE = "m3-p9";
const SLUG = "ThomasHendrickx/tiphys-ai-helmsman";

/* ------------------------------------------------------------------ */
/* The fixture API                                                      */
/* ------------------------------------------------------------------ */

interface ApiShape {
  /** `/repos/<slug>` probe. */
  repo?: { status: number; body: string };
  checkRuns?: { status: number; body: string };
  rulesets?: { status: number; body: string };
  rulesetDetail?: { status: number; body: string };
}

const OK_REPO = { status: 200, body: JSON.stringify({ full_name: SLUG }) };

/* ------------------------------------------------------------------ */
/* REAL CAPTURED OUTPUT FROM THE PROGRAM UNDER CONSUMPTION             */
/* ------------------------------------------------------------------ */

/**
 * Every API body below is a REAL CAPTURE, edited only by declared substitution.
 *
 * The red-witness rule's stronger form: where the behaviour under test consumes
 * another program's output, the assertions must include real captured output
 * from that program and not hand-written strings chosen to match the
 * implementation. The program here is the GitHub REST API, and a hand-invented
 * body would let this gate pass against a shape GitHub never sends. The three
 * captures, their endpoints and their provenance are recorded in the witness
 * specs' `consumesExternalOutput` blocks, which is where rule (f) requires
 * them.
 *
 * The LIST capture carries no `rules` key, which is not an omission: the real
 * `GET /repos/{slug}/rulesets` answers with summaries and the rules come from
 * the per-ruleset detail endpoint. The gate therefore makes two requests, and
 * serving these two captures unedited is what exercises that path.
 */
const CAPTURES = join(repoRoot, "witness", "captures");

function capture(name: string): string {
  return readFileSync(join(CAPTURES, name), "utf8");
}

const CHECK_RUNS_CAPTURE = "m4-p12-github-check-runs.json";
const RULESETS_LIST_CAPTURE = "m4-p12-github-rulesets-list.json";
const RULESET_DETAIL_CAPTURE = "m4-p12-github-ruleset-detail.json";

/** The head the captured check-runs response is really about. */
const CAPTURED_CHECK_RUN_HEAD = (() => {
  const parsed = JSON.parse(capture(CHECK_RUNS_CAPTURE)) as {
    check_runs: { head_sha: string }[];
  };
  const sha = parsed.check_runs[0]?.head_sha;
  assert.match(String(sha), /^[0-9a-f]{40}$/, "the check-runs capture names no forty-hex head");
  return String(sha);
})();

/** A declared substitution over a capture. Every `from` must occur. */
function edited(name: string, edits: [string, string][]): string {
  let body = capture(name);
  for (const [from, to] of edits) {
    assert.ok(
      body.includes(from),
      `capture ${name}: ${from} is not present, so this edit is stale`,
    );
    body = body.split(from).join(to);
  }
  return body;
}

/**
 * The captured check-runs response, re-pointed at the head under test.
 *
 * ONE VARIABLE. `head` is the only thing that changes between the green arm and
 * the "newest green run is for an earlier head" arm: both are the same real,
 * SUCCEEDING `gates` run.
 */
function checkRunsFor(head: string): { status: number; body: string } {
  return {
    status: 200,
    body: edited(CHECK_RUNS_CAPTURE, [[CAPTURED_CHECK_RUN_HEAD, head]]),
  };
}

/** The captured check-runs response with the `gates` run renamed away. */
function checkRunsWithoutGates(): { status: number; body: string } {
  return {
    status: 200,
    body: edited(CHECK_RUNS_CAPTURE, [
      [CAPTURED_CHECK_RUN_HEAD, FIXTURE_HEAD],
      ['"name": "gates"', '"name": "some-other-job"'],
    ]),
  };
}

/** The captured ruleset LIST, unedited. */
function rulesetsList(): { status: number; body: string } {
  return { status: 200, body: capture(RULESETS_LIST_CAPTURE) };
}

/**
 * The captured ruleset DETAIL, with a declared edit for each member of
 * criterion 7's class.
 */
function rulesetDetail(edits: [string, string][] = []): { status: number; body: string } {
  return { status: 200, body: edited(RULESET_DETAIL_CAPTURE, edits) };
}

const DISABLE_ENFORCEMENT: [string, string] = [
  '"enforcement": "active"',
  '"enforcement": "disabled"',
];
const REQUIRE_THE_WRONG_CONTEXT: [string, string] = [
  '"context": "gates"',
  '"context": "build"',
];

/** The API shape a fully green run needs. */
function greenApi(head: string = FIXTURE_HEAD): ApiShape {
  return {
    repo: OK_REPO,
    checkRuns: checkRunsFor(head),
    rulesets: rulesetsList(),
    rulesetDetail: rulesetDetail(),
  };
}

async function withApi<T>(shape: ApiShape, body: (base: string) => Promise<T>): Promise<T> {
  const routes = (request: IncomingMessage, response: ServerResponse): void => {
    const url = request.url ?? "";
    const pick = (): { status: number; body: string } | undefined => {
      if (url.includes("/check-runs")) {
        return shape.checkRuns;
      }
      if (/\/rulesets\/[0-9]+/.test(url)) {
        return shape.rulesetDetail;
      }
      if (url.includes("/rulesets")) {
        return shape.rulesets;
      }
      return shape.repo;
    };
    const chosen = pick();
    if (chosen === undefined) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not staged" }));
      return;
    }
    response.writeHead(chosen.status, { "content-type": "application/json" });
    response.end(chosen.body);
  };
  const server: Server = createServer(routes);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  try {
    return await body(`http://127.0.0.1:${String(port)}`);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
}

/** A port nothing is listening on, obtained by binding one and closing it. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

/* ------------------------------------------------------------------ */
/* Staging a context                                                    */
/* ------------------------------------------------------------------ */

function fixture(name: string, edits: [string, string][] = []): string {
  let body = readFileSync(join(fixturesDir, name), "utf8");
  for (const [from, to] of edits) {
    assert.ok(body.includes(from), `${name}: ${from} is not present, so the edit is stale`);
    body = body.replace(from, to);
  }
  return body;
}

interface StageOptions {
  /** Verdict documents under `delivery/review/`. */
  verdicts?: Record<string, string>;
  /** The arbitration document body, or absent for no document at all. */
  arbitration?: string;
  /** The `scope` gate record body, or absent for no record at all. */
  scopeRecord?: string;
}

/**
 * Stage a context directory carrying the real mode document and a charter.
 *
 * The same shape `test/verdict-head.test.ts` and `test/dual-review.test.ts`
 * stage, and for the same reason recorded there: the composed check reads the
 * declared mode's `merge-authority` rather than assuming one, so a two-line
 * stand-in charter would stop testing the thing under test.
 */
function stage(options: StageOptions): { dir: string; evidence: string } {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-merge-preconditions-"));
  mkdirSync(join(dir, "delivery", "review"), { recursive: true });
  copyFileSync(join(repoRoot, "assurance-modes.yaml"), join(dir, "assurance-modes.yaml"));
  const charter = readFileSync(join(repoRoot, "templates", "charter.example.yaml"), "utf8");
  assert.match(charter, /^delivery-mode: .*$/m, "the charter template has no delivery-mode line");
  writeFileSync(join(dir, "charter.yaml"), charter.replace(/^delivery-mode: .*$/m, "delivery-mode: full"));
  const verdicts = options.verdicts ?? {
    "clean-room-criteria.yaml": fixture("decorrelated-criteria.yaml"),
    "clean-room-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  for (const [name, body] of Object.entries(verdicts)) {
    writeFileSync(join(dir, "delivery", "review", name), body);
  }
  if (options.arbitration !== undefined) {
    writeFileSync(
      join(dir, "delivery", "review", `arbitration-${FIXTURE_PHASE}.md`),
      options.arbitration,
    );
  }
  const evidence = join(dir, "evidence", "merge-preconditions");
  mkdirSync(evidence, { recursive: true });
  if (options.scopeRecord !== undefined) {
    mkdirSync(join(dir, "evidence", "scope"), { recursive: true });
    writeFileSync(join(dir, "evidence", "scope", "result.json"), options.scopeRecord);
  }
  return { dir, evidence };
}

/** The arbitration document a green run needs: both verdicts, and this head. */
function goodArbitration(): string {
  return [
    "# Arbitration, M3-P9",
    "",
    `- head: ${FIXTURE_HEAD}`,
    "- reviews: delivery/review/clean-room-criteria.yaml,",
    "  delivery/review/clean-room-hazard.yaml",
    "- outcome: MERGES",
    "",
  ].join("\n");
}

function scopeRecord(status: string): string {
  return `${JSON.stringify(
    {
      gate: "scope",
      status,
      units: 7,
      unitLabel: "changed paths audited",
      startedAt: "2026-09-17T00:00:00.000Z",
      endedAt: "2026-09-17T00:00:01.000Z",
      detail: "staged for this test",
      evidence: [],
    },
    null,
    2,
  )}\n`;
}

/* ------------------------------------------------------------------ */
/* Running the gate, shipped and mutated                                */
/* ------------------------------------------------------------------ */

interface GateRun {
  exit: number;
  stdout: string;
  stderr: string;
  record: Record<string, unknown>;
}

/**
 * Run the gate out of `entry`, which is either the shipped source or a MUTANT
 * copy of it. The mutant is written beside the shipped file so its relative
 * imports resolve, which is what makes an in-place mutation witness possible at
 * all.
 */
/**
 * Run the gate out of `entry`, which is either the shipped source or a MUTANT
 * copy of it.
 *
 * ASYNCHRONOUS, AND THE REASON IS MEASURED RATHER THAN STYLISTIC. The fixture
 * API server runs in THIS process, so a `spawnSync` here blocks the event loop
 * that would answer the child's request: the first version of this file used
 * `spawnSync` and the suite hung with no output at all, because the gate was
 * waiting on a server that could not run. Anything that spawns a child which
 * talks back to the test process has to await it.
 */
async function runGate(
  entry: string,
  staged: { dir: string; evidence: string },
  apiBase: string,
  extra: string[] = [],
  /* THE COMMIT UNDER EVALUATION, overridable because one witness needs a head
     that is a REAL OBJECT of a staged repository rather than the fixed literal
     every other test here uses. Passing it through `extra` would have put
     `--head` in the argv twice and made the test depend on which occurrence the
     flag parser keeps, which is a fact about the parser and not about the gate. */
  head?: string,
): Promise<GateRun> {
  const resultPath = join(staged.evidence, "result.json");
  rmSync(resultPath, { force: true });
  const child = spawn(
    process.execPath,
    [
      entry,
      "--result",
      resultPath,
      "--evidence",
      staged.evidence,
      "--head",
      head ?? FIXTURE_HEAD,
      "--phase",
      FIXTURE_PHASE,
      "--context",
      staged.dir,
      "--repo",
      SLUG,
      "--api-base",
      apiBase,
      ...extra,
    ],
    { cwd: repoRoot },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  const exit = await new Promise<number>((done) => {
    child.on("close", (code) => done(code ?? -1));
  });
  let record: Record<string, unknown> = {};
  try {
    record = JSON.parse(readFileSync(resultPath, "utf8")) as Record<string, unknown>;
  } catch {
    record = {};
  }
  return { exit, stdout, stderr, record };
}

/**
 * Write a MUTANT copy of the gate into a scratch directory and return its path.
 *
 * DECLARED SUBSTITUTIONS, and each must MATCH or the witness is stale. A
 * mutation whose `find` no longer occurs would silently test the shipped gate
 * against itself, which is the green-and-worthless shape the red-witness rule
 * exists against.
 *
 * WHY THE COPY DOES NOT LIVE BESIDE THE SHIPPED FILE, which is the obvious
 * place to put it. A file written into `src/gates/` is inside the project the
 * `typecheck` gate compiles and inside the tree `git status` reports, so a run
 * killed between the write and the cleanup would leave the repository dirty and
 * a build red, and "a clean git status after build" is an acceptance criterion
 * of every phase here. The relative specifiers are rewritten to ABSOLUTE paths
 * instead, which resolve identically under Node ESM and keep the mutant outside
 * every tree the gates walk.
 */
function mutant(name: string, edits: [string, string][]): string {
  let body = readFileSync(gateSource, "utf8");
  for (const [from, to] of edits) {
    assert.ok(
      body.includes(from),
      `mutation ${name}: the text to replace is not present in the shipped gate, so this witness is stale: ${from}`,
    );
    body = body.replace(from, to);
  }
  const srcDir = join(repoRoot, "src");
  const gatesDir = join(srcDir, "gates");
  body = body
    .replace(/from "\.\.\//g, `from "${srcDir}/`)
    .replace(/from "\.\//g, `from "${gatesDir}/`);
  const dir = mkdtempSync(join(tmpdir(), `tiphys-mutant-${name}-`));
  const path = join(dir, "merge-preconditions.ts");
  writeFileSync(path, body);
  return path;
}

async function withMutant<T>(
  name: string,
  edits: [string, string][],
  body: (entry: string) => Promise<T>,
): Promise<T> {
  const path = mutant(name, edits);
  try {
    return await body(path);
  } finally {
    rmSync(dirname(path), { recursive: true, force: true });
  }
}

function cleanup(staged: { dir: string }): void {
  rmSync(staged.dir, { recursive: true, force: true });
}

/** Every condition row the gate printed, keyed by its row id. */
function rows(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const match = /^(condition-[1-6]|branch-protection|verdict-selection) \(([^)]*)\) at ([0-9a-f]{40}): (green|red|error) -- (.*)$/.exec(
      line,
    );
    if (match !== null) {
      out.set(match[1] as string, `${match[4] as string}|${match[3] as string}|${match[5] as string}`);
    }
  }
  return out;
}

function status(row: string | undefined): string {
  return (row ?? "|||").split("|")[0] as string;
}

/* ================================================================== */
/* Criterion 1: the suite runs                                        */
/* ================================================================== */

test("the merge-preconditions gate reports one row per DR-0012 condition plus the branch-protection encoding and the verdict selection, each carrying the head sha", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    await withApi(
      greenApi(),
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        const printed = rows(run.stdout);
        assert.deepEqual(
          [...printed.keys()].sort(),
          [
            "branch-protection",
            "condition-1",
            "condition-2",
            "condition-3",
            "condition-4",
            "condition-5",
            "condition-6",
            /* ADDED BY THE DR-0047 SWEEP, ROUND 2, and it is a ROW rather than
               a footnote for the reason `branch-protection` is one: this gate's
               contract is that every fact the orchestrator reads is a row
               carrying the head it was evaluated against. `verdict-selection`
               names which committed verdicts were admitted as evidence about
               this head and which were excluded, which is what all six
               conditions are then about. Before round 2 the selection was
               `declared === head`, which no real flow satisfies, so this gate
               reported not-applicable on every real run and the row would have
               had nothing to say. */
            "verdict-selection",
          ],
          `expected eight rows, saw: ${run.stdout}`,
        );
        for (const [id, value] of printed) {
          assert.equal(
            value.split("|")[1],
            FIXTURE_HEAD,
            `${id} does not carry the head sha it was evaluated against`,
          );
        }
        assert.equal(run.record["status"], "green", `expected green, saw ${run.stdout}${run.stderr}`);
        assert.equal(run.record["units"], 8);
        assert.equal(run.record["unitLabel"], gateModule.UNIT_LABEL);
        assert.equal(run.exit, 0);
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* Criterion 2: an unreachable API is error, with units 0             */
/* ================================================================== */

test("an unreachable API makes the gate report error with units zero and a reason naming the failure, where a catch-and-continue mutant reports green", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    const port = await closedPort();
    const base = `http://127.0.0.1:${String(port)}`;

    /* THE ASSERTION IS THE STATUS WORD, not the detail string. The plan is
       explicit about this: a mutant whose request is wrapped in a catch that
       returns "unknown" still produces a plausible detail sentence, so a test
       matching on prose would pass against it. */
    const shipped = await runGate(gateSource, staged, base);
    assert.equal(shipped.record["status"], "error", `saw ${shipped.stdout}${shipped.stderr}`);
    assert.equal(shipped.record["units"], 0);
    assert.match(String(shipped.record["detail"]), /could not be reached/);
    assert.equal(shipped.exit, 21);

    /* THE DANGEROUS STATE: the request wrapped in a catch that returns a
       plausible-looking answer. The probe then "succeeds", the check-run and
       ruleset reads answer with nothing, and the gate reports a word that is
       not error. This is the exact mutant the plan names, and it is the shape
       CLAUDE.md standing warning 6 records a real watcher shipping. */
    await withMutant(
      "catch-returns-unknown",
      [
        /* THE FABRICATED ANSWER IS URL-AWARE, because a catch that returns one
           fixed shape would redden the endpoints it does not fit and the
           mutant would report `red` rather than the GREEN the plan names. This
           is the faithful form of the defect: a request that failed, answered
           with the shape the caller was expecting. */
        [
          "    return { ok: false, reason: `GET ${url} could not be performed: ${singleLine(detail)}` };",
          "    const assumedHead = /\\/commits\\/([0-9a-f]+)\\//.exec(url)?.[1] ?? \"\";\n" +
            "    return { ok: true, status: 200, body: url.includes(\"/check-runs\")\n" +
            "      ? JSON.stringify({ check_runs: [{ name: \"gates\", status: \"completed\", conclusion: \"success\", head_sha: assumedHead }] })\n" +
            "      : url.includes(\"/rulesets\")\n" +
            "      ? JSON.stringify([{ id: 0, name: \"assumed\", target: \"branch\", enforcement: \"active\", rules: [{ type: \"required_status_checks\", parameters: { required_status_checks: [{ context: \"gates\" }] } }] }])\n" +
            "      : \"{}\" };",
        ],
      ],
      async (entry) => {
        const mutated = await runGate(entry, staged, base);
        assert.equal(
          mutated.record["status"],
          "green",
          "the catch-and-continue mutant does not report GREEN against a closed port, so this " +
            `witness does not discriminate and criterion 2 is unwitnessed: ${mutated.stdout}${mutated.stderr}`,
        );
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* Criterion 3: CI green on the EXACT head, both directions           */
/* ================================================================== */

test("condition 4 is green only when the check run's head sha equals the head under evaluation and red when the newest green run names an earlier head", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    /* ONE FIXTURE PAIR, ONE VARIABLE. Both responses are a SUCCEEDING `gates`
       check run; the only difference is the head sha the run names. That is
       what makes this a test of the comparison rather than of success. */
    await withApi(
      greenApi(),
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("condition-4")), "green", run.stdout);
      },
    );
    await withApi(
      greenApi(EARLIER_HEAD),
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("condition-4")), "red", run.stdout);
        assert.match(String(rows(run.stdout).get("condition-4")), new RegExp(EARLIER_HEAD));
        assert.equal(run.record["status"], "red");

        /* THE DANGEROUS STATE: the head_sha comparison dropped, which is the
           gate reading the newest green run on the BRANCH. T-009 one scope
           down. */
        await withMutant(
          "check-run-head-not-compared",
          [
            [
              '    (run) => String(run.head_sha ?? "").toLowerCase() === head.toLowerCase(),',
              "    () => true,",
            ],
          ],
          async (entry) => {
            const mutated = await runGate(entry, staged, base);
            assert.equal(
              status(rows(mutated.stdout).get("condition-4")),
              "green",
              "dropping the head_sha comparison did not turn this fixture green, so the fixture " +
                `does not exercise the comparison: ${mutated.stdout}`,
            );
          },
        );
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* Criterion 4: the scope condition, two arms, two reasons            */
/* ================================================================== */

test("condition 5 is red when the scope record reads red and red with a different reason when no record exists, and the gate word is error on the absent arm", async () => {
  await withApi(
    greenApi(),
    async (base) => {
      const red = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("red") });
      const absent = stage({ arbitration: goodArbitration() });
      try {
        const redRun = await runGate(gateSource, red, base);
        const absentRun = await runGate(gateSource, absent, base);
        const redRow = rows(redRun.stdout).get("condition-5");
        const absentRow = rows(absentRun.stdout).get("condition-5");
        assert.equal(status(redRow), "red", redRun.stdout);
        assert.equal(status(absentRow), "red", absentRun.stdout);
        assert.notEqual(
          redRow,
          absentRow,
          "the two arms print the SAME reason, so a reader cannot tell a failed audit from an " +
            "audit that never ran",
        );
        assert.match(String(redRow), /reads red, not green/);
        assert.match(String(absentRow), /no scope gate record exists/);
        /* Plan step 4: an absent record is `error` at GATE level, because the
           instrument was not there to read (M2-C-3). */
        assert.equal(absentRun.record["status"], "error", absentRun.stdout);
        assert.equal(redRun.record["status"], "red", redRun.stdout);

        /* THE DANGEROUS STATE: the condition satisfied by the record's
           EXISTENCE rather than by its status word. */
        await withMutant(
          "scope-record-existence-is-the-test",
          [['  if (status !== "green") {', "  if (false) {"]],
          async (entry) => {
            const mutated = await runGate(entry, red, base);
            assert.equal(
              status(rows(mutated.stdout).get("condition-5")),
              "green",
              "reading the record's existence instead of its status did not turn a RED scope " +
                `record green, so this fixture does not exercise the status read: ${mutated.stdout}`,
            );
          },
        );
      } finally {
        cleanup(red);
        cleanup(absent);
      }
    },
  );
});

/* ================================================================== */
/* Criterion 5: existence is not the test, TWO members                */
/* ================================================================== */

test("condition 6 is red for an arbitration document that names only one verdict and red for one naming a different head, and a presence-only check passes both", async () => {
  await withApi(
    greenApi(),
    async (base) => {
      /* MEMBER ONE: the document EXISTS and names ONE of the two verdicts. */
      const oneVerdict = stage({
        arbitration: [
          "# Arbitration, M3-P9",
          "",
          `- head: ${FIXTURE_HEAD}`,
          "- reviews: delivery/review/clean-room-criteria.yaml",
          "- outcome: MERGES",
          "",
        ].join("\n"),
        scopeRecord: scopeRecord("green"),
      });
      /* MEMBER TWO: the document EXISTS, names BOTH verdicts, and rules about a
         DIFFERENT head. Structurally different from member one: it has read the
         right number of documents about the wrong commit. */
      const otherHead = stage({
        arbitration: [
          "# Arbitration, M3-P9",
          "",
          `- head: ${EARLIER_HEAD}`,
          "- reviews: delivery/review/clean-room-criteria.yaml,",
          "  delivery/review/clean-room-hazard.yaml",
          "- outcome: MERGES",
          "",
        ].join("\n"),
        scopeRecord: scopeRecord("green"),
      });
      try {
        const oneRun = await runGate(gateSource, oneVerdict, base);
        const otherRun = await runGate(gateSource, otherHead, base);
        assert.equal(status(rows(oneRun.stdout).get("condition-6")), "red", oneRun.stdout);
        assert.equal(status(rows(otherRun.stdout).get("condition-6")), "red", otherRun.stdout);
        assert.match(String(rows(oneRun.stdout).get("condition-6")), /does not name/);
        assert.match(String(rows(otherRun.stdout).get("condition-6")), /different head/);

        /* THE DANGEROUS STATE, and it must redden under BOTH members or one
           witness is being passed off as a class. A check that tests only for
           the file's presence passes both fixtures. */
        await withMutant(
          "arbitration-existence-is-the-test",
          [
            [
              "  const missing = verdictPaths.filter((verdictPath) => !body.includes(basename(verdictPath)));",
              "  const missing: string[] = [];",
            ],
            [
              "  const matching = tokens.filter((token) => head.toLowerCase().startsWith(token));",
              "  const matching = tokens;",
            ],
          ],
          async (entry) => {
            for (const [label, staged] of [
              ["names one verdict", oneVerdict],
              ["names a different head", otherHead],
            ] as [string, { dir: string; evidence: string }][]) {
              const mutated = await runGate(entry, staged, base);
              assert.equal(
                status(rows(mutated.stdout).get("condition-6")),
                "green",
                `the presence-only mutant did not pass the member "${label}", so that member does ` +
                  `not witness the class: ${mutated.stdout}`,
              );
            }
          },
        );
      } finally {
        cleanup(oneVerdict);
        cleanup(otherHead);
      }
    },
  );
});

/* ================================================================== */
/* Criterion 6: an empty ruleset body is error, not a default         */
/* ================================================================== */

test("an empty body from the ruleset API makes the gate report error rather than a default, where a mutant that defaults to protected reports green", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    await withApi(
      { ...greenApi(), rulesets: { status: 200, body: "" } },
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("branch-protection")), "error", run.stdout);
        assert.equal(run.record["status"], "error", run.stdout);
        assert.match(String(rows(run.stdout).get("branch-protection")), /EMPTY BODY/);

        /* THE DANGEROUS STATE: an empty answer read as a DEFAULT. The mutant
           does exactly what a reasonable-looking implementation does when it
           reaches an empty body and wants to keep going: it assumes the shape
           it expected. This is the silent pass the whole phase exists against. */
        await withMutant(
          "empty-body-defaults-to-protected",
          [
            [
              '  if (response.body.trim() === "") {\n    return {\n      ok: false,',
              '  if (response.body.trim() === "") {\n'
                + '    return { ok: true, value: [{ id: 0, name: "assumed", target: "branch", enforcement: "active", rules: [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "gates" }] } }] }] };\n'
                + "    return {\n      ok: false,",
            ],
          ],
          async (entry) => {
            const mutated = await runGate(entry, staged, base);
            assert.equal(
              status(rows(mutated.stdout).get("branch-protection")),
              "green",
              "defaulting on an empty body did not turn this fixture green, so the fixture does " +
                `not exercise the empty-body arm: ${mutated.stdout}`,
            );
          },
        );
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* Criterion 7: the ruleset encoding, TWO members                     */
/* ================================================================== */

test("the branch-protection row is red against a disabled ruleset and red against one whose required status checks do not name gates, and a mutant that compares neither is green on both", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    /* MEMBER ONE: present but TOOTHLESS. */
    await withApi(
      { ...greenApi(), rulesetDetail: rulesetDetail([DISABLE_ENFORCEMENT]) },
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("branch-protection")), "red", run.stdout);
        assert.match(String(rows(run.stdout).get("branch-protection")), /present and disabled/);
      },
    );
    /* MEMBER TWO: present, active, and WRONG. Structurally different: the
       ruleset has teeth and requires the wrong thing. */
    await withApi(
      { ...greenApi(), rulesetDetail: rulesetDetail([REQUIRE_THE_WRONG_CONTEXT]) },
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("branch-protection")), "red", run.stdout);
        assert.match(String(rows(run.stdout).get("branch-protection")), /none requires the status check gates/);
      },
    );

    /* THE DANGEROUS STATE, reddening under BOTH members: the gate stops
       comparing the enforcement word and the required context and reports on
       the ruleset's mere presence. */
    const mutantPath = mutant("ruleset-presence-is-the-test", [
      [
        '  const active = rulesets.filter((ruleset) => ruleset.enforcement === "active");',
        "  const active = rulesets;",
      ],
      [
        "  const withGates = active.filter((ruleset) =>",
        "  const withGates = active.length > 0 ? active : active.filter((ruleset) =>",
      ],
    ]);
    try {
      for (const [label, detail] of [
        ["disabled", rulesetDetail([DISABLE_ENFORCEMENT])],
        ["wrong context", rulesetDetail([REQUIRE_THE_WRONG_CONTEXT])],
      ] as [string, { status: number; body: string }][]) {
        await withApi(
          { ...greenApi(), rulesetDetail: detail },
          async (base) => {
            const mutated = await runGate(mutantPath, staged, base);
            assert.equal(
              status(rows(mutated.stdout).get("branch-protection")),
              "green",
              `the presence-only mutant did not pass the member "${label}", so that member does ` +
                `not witness the class: ${mutated.stdout}`,
            );
          },
        );
      }
    } finally {
      rmSync(mutantPath, { force: true });
    }
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* R-065a is DATA, never a verdict                                    */
/* ================================================================== */

test("R-065a is reported as data on the green arm and never turns the branch-protection row red", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    await withApi(
      /* THE CAPTURE IS THE MEASURED STATE OF THIS REPOSITORY ON 2026-09-17:
         `allowed_merge_methods` carries all three, so R-065a is NOT done. The
         row must still be green, because squash-only is an owner action the
         owner deferred, and the plan says report its state rather than judge
         it. Nothing is edited here; that is the point. */
      greenApi(),
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        const row = String(rows(run.stdout).get("branch-protection"));
        assert.equal(status(row), "green", run.stdout);
        assert.match(row, /R-065a DATA, not a verdict/);
        assert.match(row, /allowed_merge_methods = merge, squash, rebase/);
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* The one not-applicable arm carries an EVALUATED precondition       */
/* ================================================================== */

test("a head no committed verdict names is not-applicable with an evaluated unmet precondition rather than green", async () => {
  const staged = stage({
    verdicts: {
      "clean-room-criteria.yaml": fixture("decorrelated-criteria.yaml", [
        [`head: ${FIXTURE_HEAD}`, `head: ${EARLIER_HEAD}`],
      ]),
      "clean-room-hazard.yaml": fixture("decorrelated-hazard.yaml", [
        [`head: ${FIXTURE_HEAD}`, `head: ${EARLIER_HEAD}`],
      ]),
    },
    arbitration: goodArbitration(),
    scopeRecord: scopeRecord("green"),
  });
  try {
    await withApi({ repo: OK_REPO }, async (base) => {
      const run = await runGate(gateSource, staged, base);
      assert.equal(run.record["status"], "not-applicable", run.stdout);
      assert.equal(run.record["units"], 0);
      const precondition = run.record["precondition"] as
        | { id?: unknown; met?: unknown; reason?: unknown }
        | undefined;
      assert.equal(precondition?.id, gateModule.PRECONDITION_ID);
      assert.equal(precondition?.met, false);
      assert.notEqual(String(precondition?.reason ?? ""), "");
      assert.equal(run.exit, 20);
    });
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* Conditions 1 and 2 are COMPOSED, and a missing check is error      */
/* ================================================================== */

test("deregistering the composed dual-review check makes its condition error rather than green, so a condition with no check behind it is never a pass", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    await withApi(
      greenApi(),
      async (base) => {
        const shipped = await runGate(gateSource, staged, base);
        assert.equal(status(rows(shipped.stdout).get("condition-1")), "green", shipped.stdout);
        assert.equal(status(rows(shipped.stdout).get("condition-2")), "green", shipped.stdout);

        /* THE KIND B WITNESS. Deregistering the check is the dangerous state
           this repository's section 2.3 rule 3 asks a composed predicate to be
           falsified by, and the composed gate must not read the absence as a
           pass. */
        await withMutant(
          "decorrelation-check-deregistered",
          [
            [
              '  const selected: DerivedCheck[] = registeredChecks().filter((check) => check.id === id);',
              '  const selected: DerivedCheck[] = registeredChecks().filter((check) => check.id === id && id !== "dual-review-decorrelation");',
            ],
          ],
          async (entry) => {
            const mutated = await runGate(entry, staged, base);
            assert.equal(status(rows(mutated.stdout).get("condition-1")), "error", mutated.stdout);
            assert.equal(mutated.record["status"], "error");
          },
        );
      },
    );
  } finally {
    cleanup(staged);
  }
});

test("a pair of verdicts in which one refuses the merge reddens condition 2 while condition 1 stays green", async () => {
  const staged = stage({
    verdicts: {
      "clean-room-criteria.yaml": fixture("decorrelated-criteria.yaml"),
      "clean-room-hazard.yaml": fixture("decorrelated-hazard.yaml", [
        ["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"],
      ]),
    },
    arbitration: goodArbitration(),
    scopeRecord: scopeRecord("green"),
  });
  try {
    await withApi(
      greenApi(),
      async (base) => {
        const run = await runGate(gateSource, staged, base);
        assert.equal(status(rows(run.stdout).get("condition-1")), "green", run.stdout);
        assert.equal(status(rows(run.stdout).get("condition-2")), "red", run.stdout);
        assert.equal(run.record["status"], "red");
      },
    );
  } finally {
    cleanup(staged);
  }
});

/* ================================================================== */
/* The pure judgements, exercised directly                            */
/* ================================================================== */

test("error dominates red in the gate word, so a run that could not look at one condition never reports a verdict about the merge", () => {
  const row = (id: string, rowStatus: string) => ({
    id,
    clause: "c",
    status: rowStatus,
    head: FIXTURE_HEAD,
    sentence: "s",
  });
  assert.equal(gateModule.gateStatusForRows([row("a", "green"), row("b", "green")]), "green");
  assert.equal(gateModule.gateStatusForRows([row("a", "green"), row("b", "red")]), "red");
  assert.equal(
    gateModule.gateStatusForRows([row("a", "red"), row("b", "error")]),
    "error",
    "a red beside an error reported red, so a run that could not look would be read as a verdict",
  );
});

test("a zero-length response body is a failure with a reason naming the emptiness, never a parsed default", () => {
  const empty = gateModule.readJsonBody("http://x/rulesets", { ok: true, status: 200, body: "" });
  assert.equal(empty.ok, false);
  assert.match(String((empty as { reason: string }).reason), /EMPTY BODY/);
  const whitespace = gateModule.readJsonBody("http://x/rulesets", {
    ok: true,
    status: 200,
    body: "   \n  ",
  });
  assert.equal(whitespace.ok, false);
  const refused = gateModule.readJsonBody("http://x/rulesets", { ok: true, status: 403, body: "{}" });
  assert.equal(refused.ok, false);
  assert.match(String((refused as { reason: string }).reason), /HTTP 403/);
});

test("condition 4 is red when the API returns real check runs for this head and none of them is the required status check", async () => {
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    await withApi({ ...greenApi(), checkRuns: checkRunsWithoutGates() }, async (base) => {
      const run = await runGate(gateSource, staged, base);
      assert.equal(status(rows(run.stdout).get("condition-4")), "red", run.stdout);
      assert.match(String(rows(run.stdout).get("condition-4")), /none is named gates/);
    });
  } finally {
    cleanup(staged);
  }
});

test("a check run with no head sha is not counted as evidence about the head under evaluation", () => {
  const judged = gateModule.judgeCheckRuns(
    FIXTURE_HEAD,
    [{ name: "gates", status: "completed", conclusion: "success" }],
    "gates",
  );
  assert.equal(judged.ok, false);
  assert.match(judged.sentence, /DIFFERENT head/);
});

/* ================================================================== */
/* DR-0047 round 2: the corpus is selected by ANCESTRY, not equality  */
/* ================================================================== */

/** A git identity supplied PER COMMAND (CLAUDE.md standing warning 5). */
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "tiphys test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "tiphys test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function git(dir: string, args: string[]): string {
  const run = spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...GIT_IDENTITY },
  });
  assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  return (run.stdout ?? "").trim();
}

test("verdicts naming the commit their own landing produced are selected, where the equality mutant this round replaced finds none", async () => {
  /* THE SECOND CALL SITE OF THE MECHANISM, AND IT WAS FOUND BY DERIVATION
     RATHER THAN BY A REVIEWER. `scripts/check-dual-review.mjs` selected its
     corpus with `declared === audited`; this gate carried the same comparison
     at src/gates/merge-preconditions.ts:958 and nobody had looked. A verdict
     cannot name the commit that carries it, so under equality this gate's
     precondition ("a merge is being proposed at this head, evidenced by a
     committed verdict naming it") could never be met and every real run
     reported not-applicable.

     THE STAGING IS A REAL GIT REPOSITORY, in the two-commit shape the real flow
     has: the reviews read commit one, and committing them makes commit two. The
     evidence directory is deliberately left UNTRACKED, so the gap between the
     two commits is `delivery/` and nothing else, which is what the rule admits.

     This test does not assert a GREEN gate. The arbitration document names the
     fixture head rather than a sha that does not exist when it is written, so
     condition 6 is red. What is under test is the SELECTION, and a selection
     that finds nothing never reaches a row at all. */
  const staged = stage({ arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  try {
    git(staged.dir, ["init", "-q", "."]);
    git(staged.dir, ["add", "charter.yaml", "assurance-modes.yaml"]);
    git(staged.dir, ["commit", "-q", "-m", "the commit the reviews read"]);
    const reviewed = git(staged.dir, ["rev-parse", "HEAD"]);
    for (const name of ["clean-room-criteria.yaml", "clean-room-hazard.yaml"]) {
      const path = join(staged.dir, "delivery", "review", name);
      const body = readFileSync(path, "utf8");
      const anchored = body.replace(/^head: .*$/m, `head: ${reviewed}`);
      assert.notEqual(anchored, body, `${name} has no single-line head to rewrite`);
      writeFileSync(path, anchored);
    }
    git(staged.dir, ["add", "delivery"]);
    git(staged.dir, ["commit", "-q", "-m", "the reviews, and therefore a different commit"]);
    const audited = git(staged.dir, ["rev-parse", "HEAD"]);
    assert.notEqual(audited, reviewed, "the two commits must differ or this test asserts nothing");
    /* THE GAP IS PAPERWORK ONLY, read from git rather than assumed from the
       staging, so a staging change that started tracking the evidence directory
       would fail here rather than quietly weaken the witness. */
    const gap = git(staged.dir, ["diff", "--name-only", `${reviewed}..${audited}`])
      .split("\n")
      .filter((line) => line !== "");
    assert.deepEqual(gap.filter((path) => !path.startsWith("delivery/")), [], gap.join(" , "));

    await withApi(greenApi(audited), async (base) => {
      const run = await runGate(gateSource, staged, base, [], audited);
      assert.notEqual(run.record["status"], "not-applicable", run.stdout);
      const printed = rows(run.stdout);
      const selection = printed.get("verdict-selection");
      assert.ok(selection !== undefined, `no verdict-selection row: ${run.stdout}`);
      assert.equal(status(selection), "green", selection);
      assert.match(selection, /2 verdict\(s\) admitted and 0 excluded/, selection);
      assert.match(selection, /an ancestor of the commit under audit/, selection);
      /* AND THE CONDITIONS THE SELECTION FEEDS ACTUALLY RAN. A row printed over
         an empty corpus would be the vacuous pass, one scope in. */
      assert.equal(status(printed.get("condition-1")), "green", run.stdout);
      assert.equal(status(printed.get("condition-2")), "green", run.stdout);

      /* THE DANGEROUS STATE, AND IT IS THE CODE THIS ROUND REPLACED rather than
         an invented defect: admit only a verdict whose declared head EQUALS the
         audited one. The corpus empties, the gate reports not-applicable, and
         DR-0012's six conditions are never evaluated at all. */
      await withMutant(
        "selection-by-equality",
        [
          [
            'if (relation.kind === "same" || relation.kind === "evidence-only-ancestor") {',
            'if (relation.kind === "same") {',
          ],
        ],
        async (entry) => {
          const mutated = await runGate(entry, staged, base, [], audited);
          assert.equal(mutated.record["status"], "not-applicable", mutated.stdout);
          assert.equal(mutated.record["units"], 0);
          assert.equal(rows(mutated.stdout).size, 0, mutated.stdout);
        },
      );
    });
  } finally {
    cleanup(staged);
  }
});

/* ------------------------------------------------------------------ */
/* M5-P3: a run inside the CI it would judge                            */
/* ------------------------------------------------------------------ */

/**
 * THE SELF-REFERENCE M5-P3 EXPOSED. Before M5-P3 no verdict was ever committed
 * (T-040), so this gate never ran in CI and condition 4 was only ever asked by a
 * hand run after CI had concluded. Once a phase branch carries its two verdicts,
 * the `pull_request` run evaluates this gate INSIDE the `gates` check run for
 * the very head condition 4 asks about, and that check run is `in_progress`
 * because it is this run. Judged as before, condition 4 is red on every such
 * head forever, and a phase that did everything right could never go green.
 *
 * THE CAPTURE IS REAL: `GET /repos/{slug}/commits/{sha}/check-runs` taken while
 * the `gates` run for 5662d740 was in progress, stored unedited at
 * witness/captures/m5-p3-github-check-runs-in-flight.json. The one declared
 * substitution is the head sha, re-pointed at the staged commit, exactly as
 * `checkRunsFor` does for the M4-P12 capture.
 */
const IN_FLIGHT_CAPTURE = "m5-p3-github-check-runs-in-flight.json";

const IN_FLIGHT_CAPTURED_HEAD = (() => {
  const parsed = JSON.parse(capture(IN_FLIGHT_CAPTURE)) as {
    check_runs: { name: string; head_sha: string; status: string }[];
  };
  const gates = parsed.check_runs.find((run) => run.name === "gates");
  assert.ok(gates !== undefined, "the in-flight capture carries no gates check run");
  assert.equal(gates.status, "in_progress", "the in-flight capture's gates run is not in progress");
  assert.match(gates.head_sha, /^[0-9a-f]{40}$/);
  return gates.head_sha;
})();

function inFlightApi(head: string | undefined): ApiShape {
  return {
    repo: OK_REPO,
    checkRuns: {
      status: 200,
      body:
        head === undefined
          ? capture(IN_FLIGHT_CAPTURE)
          : edited(IN_FLIGHT_CAPTURE, [[IN_FLIGHT_CAPTURED_HEAD, head]]),
    },
    rulesets: rulesetsList(),
    rulesetDetail: rulesetDetail(),
  };
}

/**
 * Stage a git repository in the shape a real phase branch has: a base, a
 * shipped change under `src/`, and a commit adding verdicts that name the
 * shipped change. Returns the base and the audited head.
 */
function stageShippedBranch(verdicts: Record<string, string>): {
  staged: { dir: string; evidence: string };
  base: string;
  head: string;
} {
  const staged = stage({ verdicts, arbitration: goodArbitration(), scopeRecord: scopeRecord("green") });
  git(staged.dir, ["init", "-q", "."]);
  git(staged.dir, ["add", "charter.yaml", "assurance-modes.yaml"]);
  git(staged.dir, ["commit", "-q", "-m", "base"]);
  const base = git(staged.dir, ["rev-parse", "HEAD"]);
  mkdirSync(join(staged.dir, "src"), { recursive: true });
  writeFileSync(join(staged.dir, "src", "feature.ts"), "export const feature = 2;\n");
  git(staged.dir, ["add", "src"]);
  git(staged.dir, ["commit", "-q", "-m", "the shipped change under review"]);
  const reviewed = git(staged.dir, ["rev-parse", "HEAD"]);
  for (const name of Object.keys(verdicts)) {
    const path = join(staged.dir, "delivery", "review", name);
    const body = readFileSync(path, "utf8");
    const anchored = body.replace(/^head: .*$/m, `head: ${reviewed}`);
    assert.notEqual(anchored, body, `${name} has no single-line head to rewrite`);
    writeFileSync(path, anchored);
  }
  git(staged.dir, ["add", "delivery"]);
  git(staged.dir, ["commit", "-q", "--allow-empty", "-m", "the reviews"]);
  const head = git(staged.dir, ["rev-parse", "HEAD"]);
  return { staged, base, head };
}

const APPROVING_VERDICTS = (): Record<string, string> => ({
  "m3-p9-criteria.yaml": fixture("decorrelated-criteria.yaml"),
  "m3-p9-hazard.yaml": fixture("decorrelated-hazard.yaml"),
});

test("an approving pair evaluated inside the unconcluded CI of its own head is not-applicable naming the in-flight run and the rows it established", async () => {
  const { staged, base, head } = stageShippedBranch(APPROVING_VERDICTS());
  try {
    await withApi(inFlightApi(head), async (apiBase) => {
      const run = await runGate(gateSource, staged, apiBase, ["--base", base], head);
      assert.equal(run.record["status"], "not-applicable", run.stdout);
      assert.equal(run.exit, 20, run.stdout);
      const precondition = run.record["precondition"] as {
        id: string;
        met: boolean;
        reason: string;
        evidence: string[];
      };
      assert.equal(precondition.id, "merge-preconditions-ci-concluded-for-this-head");
      assert.equal(precondition.met, false);
      assert.match(precondition.reason, /1 gates check run\(s\) for head [0-9a-f]{40} have not completed/);
      assert.ok(
        precondition.evidence.some((line) => /^IN FLIGHT .*in_progress/.test(line)),
        precondition.evidence.join("\n"),
      );
      /* WHAT WAS ESTABLISHED TRAVELS WITH IT: the selection and conditions 1 to
         3 were evaluated and green, and a not-applicable that dropped them
         would read exactly like one that never looked at the reviews. */
      for (const id of ["verdict-selection", "condition-1", "condition-2", "condition-3"]) {
        assert.ok(
          precondition.evidence.some((line) => line.startsWith(`ESTABLISHED ${id}`) && /green/.test(line)),
          `${id}: ${precondition.evidence.join("\n")}`,
        );
      }
    });
  } finally {
    cleanup(staged);
  }
});

test("a refusing pair inside the unconcluded CI of its own head stays red, so the in-flight rule never softens a refusal", async () => {
  const verdicts = {
    "m3-p9-criteria.yaml": fixture("decorrelated-criteria.yaml", [["verdict: APPROVE", "verdict: FIX-ROUND-NEEDED"]]),
    "m3-p9-hazard.yaml": fixture("decorrelated-hazard.yaml"),
  };
  const { staged, base, head } = stageShippedBranch(verdicts);
  try {
    await withApi(inFlightApi(head), async (apiBase) => {
      /* BOTH INVOCATIONS: with `--base` the refusal is decided before the
         network, and WITHOUT it (the M4-P12 order) the in-flight check runs
         after the review rows, which is the arm the guard exists for. */
      for (const extra of [["--base", base], []]) {
        const run = await runGate(gateSource, staged, apiBase, extra, head);
        assert.equal(run.record["status"], "red", `${extra.join(" ")}: ${run.stdout}`);
        assert.notEqual(run.record["status"], "not-applicable");
        assert.match(String(run.record["detail"]), /condition-2=red/, String(run.record["detail"]));
      }
    });
  } finally {
    cleanup(staged);
  }
});

test("an in-flight gates run for a different head is not counted as this head's CI in flight", async () => {
  const { staged, base, head } = stageShippedBranch(APPROVING_VERDICTS());
  try {
    assert.notEqual(head, IN_FLIGHT_CAPTURED_HEAD);
    /* THE CAPTURE UNEDITED, so its in-progress `gates` run is about 5662d740
       and not about the staged head. Reading it as this head's run would make
       any in-progress run anywhere on the repository a not-applicable here. */
    await withApi(inFlightApi(undefined), async (apiBase) => {
      const run = await runGate(gateSource, staged, apiBase, ["--base", base], head);
      assert.notEqual(run.record["status"], "not-applicable", run.stdout);
      assert.equal(run.record["status"], "red", run.stdout);
      assert.equal(status(rows(run.stdout).get("condition-4")), "red", run.stdout);
    });
  } finally {
    cleanup(staged);
  }
});

test("with --base, a shipped change with fewer than two committed reviews is red before any network request", async () => {
  /* THE PORT IS CLOSED, so a gate that asked the API before deciding the
     review evidence would report `error` for the unreachable API. Red here
     is the proof that the evidence was decided from the repository alone. */
  const port = await closedPort();
  for (const [verdicts, missing] of [
    [{}, 2],
    [{ "m3-p9-criteria.yaml": fixture("decorrelated-criteria.yaml") }, 1],
  ] as [Record<string, string>, number][]) {
    const { staged, base, head } = stageShippedBranch(verdicts);
    try {
      const run = await runGate(gateSource, staged, `http://127.0.0.1:${String(port)}`, ["--base", base], head);
      assert.equal(run.record["status"], "red", run.stdout);
      assert.match(
        String(run.record["detail"]),
        new RegExp(`${String(2 - missing)} of 2 are admitted and ${String(missing)} missing`),
      );
      assert.match(String(run.record["detail"]), /were NOT evaluated/);
    } finally {
      cleanup(staged);
    }
  }
});

const REV_PARSE_CAPTURE = join(repoRoot, "witness", "captures", "m5-p3-git-rev-parse-symbolic-head.json");

test("a symbolic --head reaches merge-preconditions resolved to the staged repository's forty-character sha", async () => {
  /* FIX ROUND 1, hazard CR-002. THE MECHANISM is a symbolic ref reaching the
     gate unresolved. The runner's own invocation passes `--head HEAD`, and the
     code before resolveHeadFlag lowercased it into `head`, which names no
     commit. Two spellings, because they fail differently: `HEAD` is the
     runner's, and a mixed-case branch name is the one lowercasing destroys even
     where a case-folding filesystem would forgive `head`. The expected sha is
     the STAGED repository's, so a resolution run in the wrong directory (the
     kernel checkout) is red too. The port is closed, so the red below is
     decided before any network request. */
  const port = await closedPort();
  const { staged, base, head } = stageShippedBranch({});
  try {
    git(staged.dir, ["branch", "Review-Head", head]);
    assert.match(head, /^[0-9a-f]{40}$/);
    /* THE GATE CONSUMES git's OUTPUT, so the red-witness rule's stronger form
       applies. witness/captures/m5-p3-git-rev-parse-symbolic-head.json is the
       real output of the command resolveHeadFlag runs, for both spellings and
       for their lowercased forms. Each is re-run here, in the staged
       repository, and must agree on exit code and on stdout shape before the
       gate is trusted with it. */
    const recorded = JSON.parse(readFileSync(REV_PARSE_CAPTURE, "utf8")) as {
      commands: { argv: string[]; exit: number; stdout: string }[];
    };
    assert.equal(recorded.commands.length, 4);
    for (const command of recorded.commands) {
      const live = spawnSync("git", command.argv.slice(1), { cwd: staged.dir, encoding: "utf8" });
      assert.equal(live.status, command.exit, command.argv.join(" "));
      if (command.exit === 0) {
        assert.match(command.stdout, /^[0-9a-f]{40}\n$/);
        assert.equal(live.stdout, `${head}\n`, command.argv.join(" "));
      } else {
        assert.equal(command.stdout, "");
        assert.equal(live.stdout, "", command.argv.join(" "));
      }
    }
    for (const symbolic of ["HEAD", "Review-Head"]) {
      const run = await runGate(gateSource, staged, `http://127.0.0.1:${String(port)}`, ["--base", base], symbolic);
      const detail = String(run.record["detail"]);
      assert.equal(run.record["status"], "red", `${symbolic}: ${run.stdout}${run.stderr}`);
      assert.ok(detail.includes(`at head ${head}`), `${symbolic}: the emitted head is not ${head}: ${detail}`);
      assert.ok(detail.includes(`${base}...${head}`), `${symbolic}: the budget diff is not about ${head}: ${detail}`);
      assert.equal(detail.includes(`at head ${symbolic.toLowerCase()}`), false, detail);
    }
  } finally {
    cleanup(staged);
  }
});

test("--token-env sends the named variable's value as a bearer token on every API request and writes it nowhere, and without the flag no credential is sent", async () => {
  /* THE CREDENTIAL IS DECLARED, NOT AMBIENT: the registry command names the
     variable, and a run without the flag sends no header even when the same
     variable is set in its environment. Measured before this flag existed:
     the unauthenticated request from this container answered 403 "API rate
     limit exceeded" (delivery/work-history/m5-p3.md), and from a shared CI
     address it is the same request. */
  const secret = "m5p3-token-value-that-must-never-be-printed";
  const variable = "M5P3_TEST_API_TOKEN";
  const { staged, base, head } = stageShippedBranch(APPROVING_VERDICTS());
  const seen: (string | undefined)[] = [];
  const shape = inFlightApi(head);
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    seen.push(request.headers["authorization"]);
    const url = request.url ?? "";
    const chosen = url.includes("/check-runs") ? shape.checkRuns : shape.repo;
    response.writeHead(chosen?.status ?? 404, { "content-type": "application/json" });
    response.end(chosen?.body ?? "{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const apiBase = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  process.env[variable] = secret;
  try {
    const flagged = await runGate(gateSource, staged, apiBase, ["--base", base, "--token-env", variable], head);
    assert.equal(flagged.record["status"], "not-applicable", flagged.stdout);
    assert.ok(seen.length >= 2, `only ${String(seen.length)} request(s) reached the fixture API`);
    for (const header of seen) {
      assert.equal(header, `Bearer ${secret}`);
    }
    const written = [
      flagged.stdout,
      flagged.stderr,
      JSON.stringify(flagged.record),
      ...readdirSync(staged.evidence).map((name) => readFileSync(join(staged.evidence, name), "utf8")),
    ].join("\n");
    assert.equal(written.includes(secret), false, "the token value was written to an output");

    seen.length = 0;
    const unflagged = await runGate(gateSource, staged, apiBase, ["--base", base], head);
    assert.equal(unflagged.record["status"], "not-applicable", unflagged.stdout);
    assert.ok(seen.length >= 2);
    for (const header of seen) {
      assert.equal(header, undefined, "a credential was sent without --token-env");
    }

    /* A VALUE THAT IS NOT A VARIABLE NAME is a usage error, so a token pasted
       into the command line by mistake is refused rather than looked up. */
    const pasted = await runGate(gateSource, staged, apiBase, ["--base", base, "--token-env", "ghp not a name"], head);
    assert.equal(pasted.exit, 64, pasted.stderr);
    assert.match(pasted.stderr, /--token-env takes an environment variable NAME/);
  } finally {
    delete process.env[variable];
    await new Promise<void>((done) => server.close(() => done()));
    cleanup(staged);
  }
});

test("the registry and the manifest both declare the token variable in merge-preconditions' command, and the pull-request step sets it", () => {
  const registry = readFileSync(join(repoRoot, "gate-registry.yaml"), "utf8");
  assert.match(registry, /command: \[node, src\/gates\/merge-preconditions\.ts, --token-env, GH_TOKEN\]/);
  const manifest = JSON.parse(readFileSync(join(repoRoot, "gates.manifest.json"), "utf8")) as {
    gates: { id: string; command: string[] }[];
  };
  const entry = manifest.gates.find((gate) => gate.id === "merge-preconditions");
  assert.deepEqual(entry?.command, ["node", "src/gates/merge-preconditions.ts", "--token-env", "GH_TOKEN"]);
  const workflow = readFileSync(join(repoRoot, ".github", "workflows", "gates.yml"), "utf8");
  const step = /- name: M2 exit test \(pull request\)\n((?: {8}.*\n)+)/.exec(workflow);
  assert.ok(step !== null, "no pull-request M2 exit step in gates.yml");
  assert.match(step[1] as string, /env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n/);
});
