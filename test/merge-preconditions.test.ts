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
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

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
      FIXTURE_HEAD,
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
    const match = /^(condition-[1-6]|branch-protection) \(([^)]*)\) at ([0-9a-f]{40}): (green|red|error) -- (.*)$/.exec(
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

test("the merge-preconditions gate reports one row per DR-0012 condition plus the branch-protection encoding, each carrying the head sha", async () => {
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
          ],
          `expected seven rows, saw: ${run.stdout}`,
        );
        for (const [id, value] of printed) {
          assert.equal(
            value.split("|")[1],
            FIXTURE_HEAD,
            `${id} does not carry the head sha it was evaluated against`,
          );
        }
        assert.equal(run.record["status"], "green", `expected green, saw ${run.stdout}${run.stderr}`);
        assert.equal(run.record["units"], 7);
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
