import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  describeAdmittedVerdicts,
  describeOffHeadVerdicts,
  loadCommittedVerdicts,
  missingRegimeDocument,
  readReviewFamilies,
  registeredChecks,
  relateDeclaredHead,
  resolveCorpusSource,
} from "../checks.ts";
import type { AdmittedVerdict, DerivedCheck, OffHeadVerdict } from "../checks.ts";
import { readRegularFileIfPresent, refuseOpenForWrite, runStep, singleLine } from "../task.ts";
import {
  EXIT_GATE_ERROR,
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type { GateResultFields, GateStatus, PreconditionRecord } from "./result.ts";

/**
 * THE MERGE PRECONDITION READER (kernel plan M4, M4-P12; DR-0012, DR-0036,
 * T-009, R-064, R-065a).
 *
 * WHAT THIS IS NOT. It is not a merge command. M4-D-09 puts the merge
 * capability in the plugin at cutover and DR-0036 keeps merge authority with
 * the current process for the whole of M4. What is missing today is not the
 * ability to merge; it is any ARTIFACT saying the six conditions of
 * delivery/decisions/DR-0012-delegated-merge-authority.md:22 to :27 held at the
 * head that was merged. So this gate produces one ROW PER CONDITION, each
 * carrying the head sha it was evaluated against, and the orchestrator reads it
 * before merging, by hand.
 *
 * THE HAZARD CLASS, in the plan's words: A MERGE PRECONDITION CHECK THAT IS
 * GREEN BECAUSE IT COULD NOT LOOK. Every arm below is written against one of
 * its members, and each member is named where it is refused rather than in a
 * list nobody rereads:
 *
 *   a 401 piped into a `|| true`      -> `probeApi` runs FIRST and an
 *                                        unreachable or refusing API is
 *                                        `error` with units 0. CLAUDE.md
 *                                        standing warning 6 records this shape
 *                                        costing a whole watcher.
 *   an API failure called N/A          -> `not-applicable` is reachable from
 *                                        exactly THREE places since M5-P3, and
 *                                        none of them is an API failure. Each
 *                                        carries its own evaluated precondition
 *                                        record (SC-011): the M4-P12
 *                                        NO-VERDICT-AT-THIS-HEAD arm (only
 *                                        without `--base`), a change below the
 *                                        dual-review tier (BUDGET_PRECONDITION_ID),
 *                                        and a run inside the unconcluded CI of
 *                                        this head with every review row green
 *                                        (CI_CONCLUDED_PRECONDITION_ID).
 *   an unreviewed shipped change called N/A -> with `--base`, a dual-tier
 *                                        change with fewer than two admitted
 *                                        verdicts is RED, decided before any
 *                                        network request (M5-P3).
 *   CI-green read off the BRANCH       -> condition 4 compares
 *                                        `check_run.head_sha` against the head
 *                                        under evaluation and reddens when they
 *                                        differ, which is T-009 one scope down.
 *   scope satisfied by a record EXISTING -> condition 5 reads the record's
 *                                        STATUS word.
 *   arbitration satisfied by a file EXISTING -> condition 6 requires the
 *                                        document to name BOTH verdicts and the
 *                                        SAME head.
 *   a ruleset read as a default        -> an empty body from the ruleset API is
 *                                        `error`, never an assumed shape.
 *
 * WHY CONDITIONS 1 AND 2 ARE COMPOSED AND NOT REIMPLEMENTED (plan step 6).
 * M4-P10 shipped `dual-review-decorrelation` (DR-0012 condition 1) and
 * `verdict-pair-approves` (condition 2) as derived checks in `src/checks.ts`,
 * and `scripts/check-dual-review.mjs` is the runner around them. This gate is a
 * SECOND CALLER of the same exported primitives rather than a second copy of
 * the rules: it resolves the corpus with `resolveCorpusSource`, refuses a
 * context whose delivery regime is undeterminable with `missingRegimeDocument`,
 * reads the DR-0038 declaration with `readReviewFamilies`, and then runs the
 * two checks BY ID out of `registeredChecks()`.
 *
 * BY ID, AND A MISSING REGISTRATION IS `error`. `scripts/check-dual-review.mjs`
 * prints `0 registered check(s) named X` beside its own verdict, which is the
 * Kind B witness that deregistering the check is visible. On the MERGE path a
 * condition with no check behind it is a condition nobody evaluated, so here it
 * is `error` and never a green with the comparison quietly skipped.
 *
 * WHY THE ROW STATUS AND THE GATE STATUS ARE NOT THE SAME WORD, and this is the
 * one place the plan and the criteria say different things, so the reconciliation
 * is written down rather than left to a reader. Plan step 4
 * (delivery/plan/kernel-plan-m4.md:1911) says an ABSENT scope record is `error`;
 * criterion 4 (delivery/plan/kernel-plan-m4.md:1938) says condition 5 is RED when
 * no record exists. Both hold at once because they speak about different objects:
 * the CONDITION is unsatisfied either way and its row reads `red` with a reason
 * naming which arm it was, while the GATE could not reach a verdict about an
 * instrument that is not there, so the gate's own status is `error`. Everything a
 * reader needs is printed: the row, its reason, and the gate word.
 */

/* -------------------------------------------------------------------- */
/* Plumbing                                                              */
/* -------------------------------------------------------------------- */

const GATE_ID = "merge-preconditions";
const UNIT_LABEL = "merge preconditions evaluated";
const DEFAULT_API_BASE = "https://api.github.com";
const DECORRELATION_CHECK_ID = "dual-review-decorrelation";
const PAIR_CHECK_ID = "verdict-pair-approves";
const REQUIRED_CHECK_CONTEXT = "gates";

/**
 * The id of the one precondition this gate can report unmet.
 *
 * SC-011: `not-applicable` ASSERTS that a precondition was evaluated. The
 * precondition here is "a merge is being proposed at this head", evidenced by
 * at least one committed verdict document naming it. A head with no such
 * document is not a merge waiting on six conditions; it is a branch nobody has
 * reviewed yet, and reporting red for that would make the gate unusable on
 * every push while making it say something false.
 */
const PRECONDITION_ID = "merge-preconditions-verdict-names-this-head";

const USAGE =
  "usage: node src/gates/merge-preconditions.ts --result <file> --head <sha> --phase <id> " +
  "[--base <ref>] [--evidence <dir>] [--context <dir>] [--repo <owner/name>] [--api-base <url>] " +
  "[--scope-record <file>] [--arbitrations <dir>]";

interface Flags {
  result?: string;
  base?: string;
  evidence?: string;
  head?: string;
  phase?: string;
  context?: string;
  repo?: string;
  "api-base"?: string;
  "scope-record"?: string;
  arbitrations?: string;
}

const SINGLE_VALUE_FLAGS = [
  "--result",
  "--base",
  "--evidence",
  "--head",
  "--phase",
  "--context",
  "--repo",
  "--api-base",
  "--scope-record",
  "--arbitrations",
] as const;

function parseFlags(args: string[]): Flags | undefined {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined) {
      return undefined;
    }
    if (!(SINGLE_VALUE_FLAGS as readonly string[]).includes(flag)) {
      return undefined;
    }
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }
    flags[flag.slice(2) as keyof Flags] = value;
    index += 1;
  }
  return flags;
}

function usageError(message?: string): number {
  if (message !== undefined) {
    process.stderr.write(`tiphys gates ${GATE_ID}: ${message}\n`);
  }
  process.stderr.write(`${USAGE}\n`);
  return EX_USAGE;
}

function now(): string {
  return new Date().toISOString();
}

function absolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

/* -------------------------------------------------------------------- */
/* The per-condition row, which IS the deliverable                        */
/* -------------------------------------------------------------------- */

/**
 * ROW STATUS IS THE SAME FOUR-WORD VOCABULARY MINUS `not-applicable`.
 * A row cannot be not-applicable: the gate as a whole is, or every condition
 * was evaluated. Keeping the words identical to `GateStatus` is deliberate, so
 * a reader does not have to learn a second vocabulary for the thing the gate
 * exists to print.
 */
export type RowStatus = "green" | "red" | "error";

export interface ConditionRow {
  /** `condition-1` .. `condition-6`, or `branch-protection`. */
  id: string;
  /** The DR-0012 clause, or the requirement id, this row is about. */
  clause: string;
  status: RowStatus;
  /** The head sha this row was evaluated against. Criterion 8 wants it here. */
  head: string;
  /** One sentence, printed on EVERY arm including green. */
  sentence: string;
}

export function renderRow(row: ConditionRow): string {
  return `${row.id} (${row.clause}) at ${row.head}: ${row.status} -- ${row.sentence}`;
}

/**
 * The gate word for a set of rows.
 *
 * `error` DOMINATES `red`, which is M2-C-3's direction: a run that could not
 * look at one condition has not reached a verdict about the merge, and a red
 * would be a verdict. A red that is also accompanied by an error still reports
 * error, and both rows print either way, so nothing is hidden by the ordering.
 */
export function gateStatusForRows(rows: readonly ConditionRow[]): GateStatus {
  if (rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.status === "red")) {
    return "red";
  }
  return "green";
}

/* -------------------------------------------------------------------- */
/* The API client                                                        */
/* -------------------------------------------------------------------- */

export type ApiResponse =
  | { ok: true; status: number; body: string }
  | { ok: false; reason: string };

/**
 * ONE REQUEST, AND THE FAILURE ARM IS WRITTEN FIRST.
 *
 * CLAUDE.md standing warning 6 records the exact defect this shape exists
 * against: a watcher whose failure arm was a `.catch(() => {})` emitted nothing
 * and was indistinguishable from a run still in progress. There is no catch
 * here that returns a value the caller can mistake for data: a transport
 * failure becomes `{ok: false, reason}` and every caller turns that into
 * `error`.
 *
 * NO CREDENTIAL IS READ, AND THAT IS A RULE RATHER THAN AN OVERSIGHT.
 * test/m2-exit-test.test.ts:425 asserts, by grepping every file under
 * `src/gates/`, that no production gate reads a LITERAL-NAMED environment
 * variable, because such a read is an ambient switch that changes a gate's
 * reported status with nothing in the record to say so. An earlier draft of
 * this module read `GH_TOKEN` and that test caught it, which is the guard
 * working. Measured 2026-09-17 from this container, with NO Authorization
 * header at all: `GET /repos/{slug}`, `GET /repos/{slug}/rulesets` and
 * `GET /repos/{slug}/commits/{sha}/check-runs` each answered HTTP 200, because
 * the agent proxy substitutes credentials on the way out and the value in
 * `GH_TOKEN` is irrelevant (CLAUDE.md standing warning 6's invalid-token
 * control measures the same thing). WHAT THIS COSTS, recorded rather than left
 * to be found: in a deployment where the API genuinely requires a credential,
 * every request here answers 401 or 404 and the gate reports `error`. That is
 * the fail-closed direction and never a silent pass, and supplying a token
 * would have to be a DECLARED FLAG in the registry command rather than an
 * ambient environment read.
 */
export async function requestJson(url: string): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "tiphys-merge-preconditions",
  };
  try {
    const response = await fetch(url, { headers });
    const body = await response.text();
    return { ok: true, status: response.status, body };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    const cause = (error as { cause?: { message?: string; code?: string } }).cause;
    const detail =
      cause === undefined
        ? message
        : `${message} (${String(cause.code ?? "")}${cause.message === undefined ? "" : ` ${cause.message}`})`;
    return { ok: false, reason: `GET ${url} could not be performed: ${singleLine(detail)}` };
  }
}

export type JsonReading =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * PARSE A RESPONSE BODY, AND AN EMPTY ONE IS A FAILURE RATHER THAN A DEFAULT.
 *
 * Criterion 6 is the whole reason this is a named function: the ruleset API
 * answering with a zero-length body must produce `error`, because a default
 * here is the silent pass this phase exists against. `JSON.parse("")` throws,
 * so the empty case would reach the same place anyway; it is separated out so
 * the REASON a reader is given names the emptiness rather than a parser
 * message that says nothing about what happened.
 */
export function readJsonBody(url: string, response: ApiResponse): JsonReading {
  if (!response.ok) {
    return { ok: false, reason: response.reason };
  }
  if (response.status < 200 || response.status > 299) {
    return {
      ok: false,
      reason: `GET ${url} answered HTTP ${String(response.status)}, so nothing was read from it`,
    };
  }
  if (response.body.trim() === "") {
    return {
      ok: false,
      reason:
        `GET ${url} answered HTTP ${String(response.status)} with an EMPTY BODY; a merge ` +
        "precondition assumed from an empty answer is the silent pass this gate exists against",
    };
  }
  try {
    return { ok: true, value: JSON.parse(response.body) };
  } catch (error) {
    return {
      ok: false,
      reason: `GET ${url} answered a body that is not JSON: ${singleLine((error as Error).message)}`,
    };
  }
}

/**
 * `owner/name` out of a git remote URL, or undefined when the URL is not one.
 *
 * DERIVED RATHER THAN WRITTEN INTO THE REGISTRY, and the reason is DR-0029: the
 * kernel is just another project under the scheme, so a registry entry naming
 * ONE repository would be the kernel's registry claiming to be everybody's. The
 * remote is the fact this gate is actually about.
 */
export function slugFromRemote(url: string): string | undefined {
  const trimmed = url.trim().replace(/\.git$/, "");
  const match = /(?:[:/])([^/:]+)\/([^/]+)$/.exec(trimmed);
  if (match === null) {
    return undefined;
  }
  return `${match[1] as string}/${match[2] as string}`;
}

function slugFromGit(contextDirectory: string): string | undefined {
  const run = spawnSync("git", ["-C", contextDirectory, "remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (run.status !== 0) {
    return undefined;
  }
  return slugFromRemote(run.stdout ?? "");
}

/* -------------------------------------------------------------------- */
/* Condition 4: CI green on the EXACT head                               */
/* -------------------------------------------------------------------- */

interface CheckRun {
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
  head_sha?: unknown;
}

/**
 * Condition 4, and the comparison that makes it worth having.
 *
 * T-009 ONE SCOPE DOWN. "CI is green" is never a complete sentence: the
 * complete one names the event and the HEAD SHA. A check that asked the API for
 * the newest run on the BRANCH would report green off a run for an earlier
 * head, which is exactly the state this repository spent four hours and
 * twenty-one minutes in. So every check run the API returns is compared on
 * `head_sha` and one that names a different commit is reported as the different
 * commit it is, never counted.
 */
export function judgeCheckRuns(
  head: string,
  runs: readonly CheckRun[],
  context: string,
): { ok: boolean; sentence: string } {
  const named = runs.filter((run) => String(run.name ?? "") === context);
  if (named.length === 0) {
    return {
      ok: false,
      sentence:
        `the API returned ${String(runs.length)} check run(s) and none is named ${context}, ` +
        "so nothing asserts this head was built",
    };
  }
  const forThisHead = named.filter(
    (run) => String(run.head_sha ?? "").toLowerCase() === head.toLowerCase(),
  );
  if (forThisHead.length === 0) {
    const others = [...new Set(named.map((run) => String(run.head_sha ?? "(no head_sha)")))];
    return {
      ok: false,
      sentence:
        `every ${context} check run the API returned names a DIFFERENT head (${others.join(", ")}); ` +
        `a green run for an earlier head is not evidence about ${head}`,
    };
  }
  const succeeded = forThisHead.filter(
    (run) =>
      String(run.status ?? "") === "completed" && String(run.conclusion ?? "") === "success",
  );
  if (succeeded.length === 0) {
    const seen = forThisHead.map(
      (run) => `${String(run.status ?? "(no status)")}/${String(run.conclusion ?? "(no conclusion)")}`,
    );
    return {
      ok: false,
      sentence:
        `${String(forThisHead.length)} ${context} check run(s) name this head and none concluded ` +
        `success (${seen.join(", ")})`,
    };
  }
  return {
    ok: true,
    sentence:
      `${String(succeeded.length)} ${context} check run(s) concluded success with head_sha equal ` +
      "to the head under evaluation",
  };
}

/**
 * The required check runs for THIS head that have not completed, one line each.
 *
 * M5-P3. Only runs whose `head_sha` IS the head under evaluation count, so an
 * in-progress run for another commit cannot make this head's condition 4
 * undecidable, and a completed run of ANY conclusion is not in flight. A
 * re-run of a failed attempt is a second check run with the same name and
 * head, so a failed first attempt beside an in-progress second one is still
 * in flight, which is the case a naive "is any run completed" test gets wrong.
 */
export function inFlightCheckRuns(
  head: string,
  runs: readonly CheckRun[],
  context: string,
): string[] {
  return runs
    .filter(
      (run) =>
        String(run.name ?? "") === context &&
        String(run.head_sha ?? "").toLowerCase() === head.toLowerCase() &&
        String(run.status ?? "") !== "completed",
    )
    .map(
      (run) =>
        `IN FLIGHT ${context} check run at head ${head}: status ${String(run.status ?? "(no status)")}, ` +
        `conclusion ${String(run.conclusion ?? "(none yet)")}`,
    );
}

/* -------------------------------------------------------------------- */
/* Condition 5: the scope gate's own record                              */
/* -------------------------------------------------------------------- */

/**
 * Condition 5, and the distinction the plan's hazard list names: the condition
 * is satisfied by the record's STATUS, never by the record's EXISTENCE.
 *
 * The absent arm and the red arm are DIFFERENT REASONS on purpose (criterion
 * 4). `instrument` is what the caller turns into the gate's own word: an absent
 * record means the gate could not look, which is `error` at gate level while
 * the condition itself is unsatisfied.
 */
export function judgeScopeRecord(
  path: string,
  read: { kind: "read"; body: string } | { kind: "absent" } | { kind: "refused"; reason: string },
): { ok: boolean; sentence: string; instrument: "present" | "missing" } {
  if (read.kind === "absent") {
    return {
      ok: false,
      instrument: "missing",
      sentence:
        `no scope gate record exists at ${path}, so whether the change is the change that was ` +
        "promised is UNKNOWN; an absent record is not a passing one",
    };
  }
  if (read.kind === "refused") {
    return { ok: false, instrument: "missing", sentence: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      instrument: "missing",
      sentence: `the scope gate record at ${path} does not parse as JSON: ${singleLine((error as Error).message)}`,
    };
  }
  const record = parsed as { status?: unknown; units?: unknown } | null;
  const status = String(record?.status ?? "");
  if (status === "") {
    return {
      ok: false,
      instrument: "missing",
      sentence: `the scope gate record at ${path} carries no status, so it asserts nothing`,
    };
  }
  if (status !== "green") {
    return {
      ok: false,
      instrument: "present",
      sentence: `the scope gate record at ${path} reads ${status}, not green`,
    };
  }
  return {
    ok: true,
    instrument: "present",
    sentence: `the scope gate record at ${path} reads green over ${String(record?.units ?? 0)} unit(s)`,
  };
}

/* -------------------------------------------------------------------- */
/* Condition 6: the arbitration document                                 */
/* -------------------------------------------------------------------- */

const HEX_TOKEN = /\b[0-9a-f]{7,40}\b/gi;

/**
 * Condition 6, and EXISTENCE IS NOT THE TEST.
 *
 * Criterion 5 asks for two structurally different members of that class, and
 * they are structurally different because they fail on different halves of the
 * same document: one that names only ONE of the two verdicts has read half the
 * evidence, and one that names a DIFFERENT HEAD has read the right number of
 * documents about the wrong commit. A check that tested for the file's presence
 * passes both.
 *
 * VERDICTS ARE IDENTIFIED BY FILE NAME because `schemas/verdict.schema.json`
 * gives a verdict no id of its own; its required keys are kind, phase, head,
 * verdict, produced-by, framing, review-contract, findings, criteria and
 * deviations-judged. The existing arbitration documents in `delivery/review/`
 * already cite their reviews by path, so the convention that exists is read
 * rather than a field invented.
 *
 * THE FILE NAME AND NOT THE FULL PATH, and that is a measured correction rather
 * than a preference. `loadCommittedVerdicts` returns ABSOLUTE paths when it
 * falls back to the worktree and repository-relative ones when it reads a
 * commit, so comparing whole paths made the same document resolve or not
 * resolve depending on which corpus source happened to be chosen. The file name
 * is the part that is stable across both, and it is the part an arbitration
 * document's `- reviews:` line contains either way.
 */
export function judgeArbitration(
  path: string,
  head: string,
  verdictPaths: readonly string[],
  read: { kind: "read"; body: string } | { kind: "absent" } | { kind: "refused"; reason: string },
): { ok: boolean; sentence: string } {
  if (read.kind === "absent") {
    return {
      ok: false,
      sentence: `no arbitration document exists at ${path}, so no recorded ruling covers this head`,
    };
  }
  if (read.kind === "refused") {
    return { ok: false, sentence: read.reason };
  }
  const body = read.body;
  const missing = verdictPaths.filter((verdictPath) => !body.includes(basename(verdictPath)));
  if (missing.length > 0) {
    return {
      ok: false,
      sentence:
        `the arbitration document ${path} EXISTS and names ${String(verdictPaths.length - missing.length)} ` +
        `of the ${String(verdictPaths.length)} verdict(s) for this head; it does not name ` +
        `${missing.map((verdictPath) => basename(verdictPath)).join(", ")}, so it did not arbitrate between them`,
    };
  }
  const tokens = [...new Set((body.match(HEX_TOKEN) ?? []).map((token) => token.toLowerCase()))];
  const matching = tokens.filter((token) => head.toLowerCase().startsWith(token));
  if (matching.length === 0) {
    return {
      ok: false,
      sentence:
        `the arbitration document ${path} EXISTS and names ${String(verdictPaths.length)} verdict(s) ` +
        `but no commit-shaped token in it is a prefix of ${head}` +
        (tokens.length === 0
          ? "; it names no head at all"
          : `; it names ${tokens.join(", ")}, which is a ruling about a different head`),
    };
  }
  return {
    ok: true,
    sentence:
      `the arbitration document ${path} names all ${String(verdictPaths.length)} verdict(s) for ` +
      `this head and carries ${matching.join(", ")}, a prefix of the head under evaluation`,
  };
}

/* -------------------------------------------------------------------- */
/* The branch-protection encoding (R-064, R-065a)                        */
/* -------------------------------------------------------------------- */

interface RulesetRule {
  type?: unknown;
  parameters?: Record<string, unknown>;
}

export interface RulesetReading {
  id: string;
  name: string;
  enforcement: string;
  rules: RulesetRule[];
}

/**
 * The ruleset encoding, and the TWO members of criterion 7.
 *
 * `enforcement: disabled` is PRESENT-BUT-TOOTHLESS and a
 * `required_status_checks` rule that does not name `gates` is
 * PRESENT-BUT-WRONG. They are different failures and they are reported with
 * different sentences, because a reader told only "the ruleset is wrong" has to
 * go and find out which.
 *
 * R-065a IS DATA, NOT A VERDICT. Squash-only is an OWNER action the owner has
 * deferred; the plan (step 7) says report its state and do not judge it, so
 * `allowed_merge_methods` is printed and never turns this row red.
 */
export function judgeRulesets(rulesets: readonly RulesetReading[]): {
  ok: boolean;
  sentence: string;
} {
  if (rulesets.length === 0) {
    return {
      ok: false,
      sentence: "the API returned no branch ruleset at all, so nothing protects the default branch",
    };
  }
  const active = rulesets.filter((ruleset) => ruleset.enforcement === "active");
  if (active.length === 0) {
    const seen = rulesets.map((ruleset) => `${ruleset.name}: ${ruleset.enforcement}`);
    return {
      ok: false,
      sentence:
        `${String(rulesets.length)} ruleset(s) exist and NONE is enforcement active (${seen.join(", ")}); ` +
        "a ruleset that is present and disabled protects nothing",
    };
  }
  const withGates = active.filter((ruleset) =>
    ruleset.rules.some(
      (rule) =>
        String(rule.type ?? "") === "required_status_checks" &&
        (
          (rule.parameters?.["required_status_checks"] as { context?: unknown }[] | undefined) ?? []
        ).some((check) => String(check?.context ?? "") === REQUIRED_CHECK_CONTEXT),
    ),
  );
  if (withGates.length === 0) {
    const named = active.flatMap((ruleset) =>
      ruleset.rules
        .filter((rule) => String(rule.type ?? "") === "required_status_checks")
        .flatMap((rule) =>
          (
            (rule.parameters?.["required_status_checks"] as { context?: unknown }[] | undefined) ??
            []
          ).map((check) => String(check?.context ?? "")),
        ),
    );
    return {
      ok: false,
      sentence:
        `${String(active.length)} active ruleset(s) exist and none requires the status check ` +
        `${REQUIRED_CHECK_CONTEXT}` +
        (named.length === 0
          ? "; none carries a required_status_checks rule at all"
          : `; the contexts they require are ${named.join(", ")}`),
    };
  }
  const merge = active.flatMap((ruleset) =>
    ruleset.rules
      .filter((rule) => String(rule.type ?? "") === "pull_request")
      .flatMap(
        (rule) => (rule.parameters?.["allowed_merge_methods"] as string[] | undefined) ?? [],
      ),
  );
  const methods = [...new Set(merge)];
  return {
    ok: true,
    sentence:
      `${withGates.map((ruleset) => ruleset.name).join(", ")} is enforcement active and requires ` +
      `the status check ${REQUIRED_CHECK_CONTEXT} (R-064). R-065a DATA, not a verdict: ` +
      `allowed_merge_methods = ${methods.length === 0 ? "(none reported)" : methods.join(", ")}`,
  };
}

/* -------------------------------------------------------------------- */
/* Conditions 1, 2 and 3: the review evidence                            */
/* -------------------------------------------------------------------- */

export interface VerdictForHead {
  path: string;
  record: Record<string, unknown>;
}

/**
 * Condition 3, and what it DOES and DOES NOT establish.
 *
 * DR-0012 condition 3 (delivery/decisions/DR-0012-delegated-merge-authority.md:24)
 * says both reviewers were given the phase's acceptance criteria as their
 * contract and both WALKED OR EXECUTED them. What is reachable from the verdict
 * documents alone is that each one declares a `review-contract` and carries a
 * non-empty `criteria[]` whose entries each record `met`. Whether that walk
 * COVERS every acceptance criterion the plan declares is a comparison against a
 * different document and it is the shipped Kind B check
 * `verdict-criteria-complete`, which resolves a `plan.yaml` out of its context.
 * This repository has no such document, so running it here would make this row
 * permanently error about the instrument rather than about the merge. The row's
 * sentence therefore says which half it established, and the other half is
 * recorded as residue in delivery/work-history/m4-p12.md rather than implied.
 */
export function judgeCriteriaWalked(verdicts: readonly VerdictForHead[]): {
  ok: boolean;
  sentence: string;
} {
  const faults: string[] = [];
  for (const verdict of verdicts) {
    const contract = String(verdict.record["review-contract"] ?? "");
    if (contract === "") {
      faults.push(`${verdict.path} declares no review-contract`);
    }
    const criteria = verdict.record["criteria"];
    if (!Array.isArray(criteria) || criteria.length === 0) {
      faults.push(`${verdict.path} walks no acceptance criterion`);
      continue;
    }
    const unwalked = criteria.filter(
      (entry) => (entry as { met?: unknown } | null)?.met === undefined,
    );
    if (unwalked.length > 0) {
      faults.push(
        `${verdict.path} carries ${String(unwalked.length)} criterion entr(ies) with no met field`,
      );
    }
  }
  if (faults.length > 0) {
    return { ok: false, sentence: faults.join("; ") };
  }
  const contracts = verdicts.map((verdict) => String(verdict.record["review-contract"] ?? ""));
  return {
    ok: true,
    sentence:
      `all ${String(verdicts.length)} verdict(s) declare a review-contract (${contracts.join(", ")}) ` +
      "and walk at least one acceptance criterion with a recorded met; COMPLETENESS against the " +
      "plan's acceptance list is the separate check verdict-criteria-complete and is NOT asserted here",
  };
}

/**
 * Run ONE registered check over the verdicts for this head.
 *
 * A check that is NOT REGISTERED is `error`, never a green with the comparison
 * skipped, which is the whole of the "green because it could not look" class
 * applied to this gate's own instrument.
 */
function runRegisteredCheck(
  id: string,
  verdicts: readonly VerdictForHead[],
  contextDirectory: string,
): { status: RowStatus; sentence: string } {
  const selected: DerivedCheck[] = registeredChecks().filter((check) => check.id === id);
  if (selected.length === 0) {
    return {
      status: "error",
      sentence:
        `0 registered check(s) named ${id}, so nothing evaluated this condition; a condition with ` +
        "no check behind it is a condition nobody looked at",
    };
  }
  const messages = new Set<string>();
  for (const verdict of verdicts) {
    for (const check of selected) {
      const outcome = check.run(verdict.record, contextDirectory);
      for (const violation of outcome.violations) {
        messages.add(`${violation.pointer} ${violation.message}`);
      }
    }
  }
  if (messages.size > 0) {
    return { status: "red", sentence: [...messages].sort().join(" | ") };
  }
  return {
    status: "green",
    sentence:
      `${id} reported no violation over the ${String(verdicts.length)} verdict(s) committed for ` +
      "this head",
  };
}

/* -------------------------------------------------------------------- */
/* The review budget (M5-P3; DR-0027, DR-0035, T-040, T-041)             */
/* -------------------------------------------------------------------- */

/**
 * How much review a change is REQUIRED to carry before it merges.
 *
 * WHY THIS EXISTS, in one measured sentence: until M5-P3 both review gates were
 * conditional on "is there any verdict document at all", so a branch carrying
 * shipped code and NO review was not-applicable, and T-041 counts sixteen such
 * phases merged. Absence of evidence was read as absence of a subject. The
 * budget turns the question round: the DIFF decides how much review is owed,
 * and the verdicts are then measured against what is owed.
 *
 * THE TABLE IS DR-0027's, READ LITERALLY, and it is not re-derived here.
 * delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:38
 * declares three rows. Row 3 (`delivery/**`, `CLAUDE.md`, `.claude/**`) gets no
 * review round. Row 2 (`scripts/`, `test/`, `.github/`, `gate-registry.yaml`,
 * `gates.manifest.json`) gets ONE round whose findings do not block. Row 1 (the
 * npm package) gets the full contract, which is DR-0012's two decorrelated
 * approving reviews. DR-0035 later made "every change is reviewed" the owner's
 * rule; it tiers the FIX-ROUND count and leaves DR-0012's pair where it was, so
 * nothing here contradicts it: the two lower rows are not EXEMPT from review,
 * they are exempt from the MACHINE-ENFORCED PAIR, which is the only thing a gate
 * can count.
 *
 * FAIL CLOSED ON EVERY PATH THE TABLE DOES NOT NAME. Row 1's own list (`src/`,
 * `bin/`, `schemas/`, `roles/`, `tuition/`) is narrower than what ships today:
 * `plugin/src/` shipped sixteen unreviewed changes (T-041), and `templates/`,
 * `checklists/`, `AGENTS.md` and `package.json` are all in the package's
 * `files`. So the two LOWER rows are listed and everything else is held to the
 * dual tier. A table that listed the dual tier instead would read a new
 * top-level directory as paperwork, which is the fail-open direction.
 *
 * `gate-registry.yaml` AND `gates.manifest.json` ARE IN THE PACKAGE'S `files`
 * AND IN ROW 2 AT ONCE. That is a real disagreement between two declarations
 * and it is NOT resolved here: DR-0027 is the owner's explicit classification,
 * so it wins, and the disagreement is recorded in delivery/work-history/m5-p3.md
 * as an open question rather than silently decided.
 */
export type ReviewTier = "dual" | "single" | "none";

interface BudgetRow {
  tier: Exclude<ReviewTier, "dual">;
  source: string;
  /** A trailing `/` is a directory prefix; anything else is an exact path. */
  paths: readonly string[];
}

export const REVIEW_BUDGET_ROWS: readonly BudgetRow[] = [
  {
    tier: "none",
    source: "DR-0027 row 3 (no review round)",
    paths: ["delivery/", "CLAUDE.md", ".claude/"],
  },
  {
    tier: "single",
    source: "DR-0027 row 2 (one review round, findings do not block)",
    paths: ["scripts/", "test/", ".github/", "gate-registry.yaml", "gates.manifest.json"],
  },
];

/** How many approving, decorrelated verdicts the dual tier requires. */
export const REQUIRED_VERDICTS = 2;

/** Which tier one project-relative path belongs to, and which row said so. */
export function tierOfPath(path: string): { tier: ReviewTier; source: string } {
  for (const row of REVIEW_BUDGET_ROWS) {
    const named = row.paths.some((entry) =>
      entry.endsWith("/") ? path.startsWith(entry) : path === entry,
    );
    if (named) {
      return { tier: row.tier, source: row.source };
    }
  }
  return {
    tier: "dual",
    source: "DR-0027 row 1 (the shipped tree, and every path the table does not name, fail closed)",
  };
}

const TIER_RANK: Record<ReviewTier, number> = { none: 0, single: 1, dual: 2 };

export interface ReviewBudget {
  base: string;
  head: string;
  tier: ReviewTier;
  /** Every changed path with the tier it was classified into. */
  paths: { path: string; tier: ReviewTier }[];
  /** The changed paths that put the change in the dual tier. */
  dual: string[];
}

/** How many paths to name in a sentence before it stops being readable. */
const NAMED_PATHS = 8;

export function describeBudget(budget: ReviewBudget): string {
  const named = (list: readonly string[]): string =>
    list.slice(0, NAMED_PATHS).join(", ") +
    (list.length > NAMED_PATHS ? ` and ${String(list.length - NAMED_PATHS)} more` : "");
  if (budget.paths.length === 0) {
    return `the diff ${budget.base}...${budget.head} changes no path`;
  }
  if (budget.tier === "dual") {
    return (
      `the diff ${budget.base}...${budget.head} changes ${String(budget.paths.length)} path(s), ` +
      `${String(budget.dual.length)} of them in the dual-review tier (${named(budget.dual)})`
    );
  }
  return (
    `the diff ${budget.base}...${budget.head} changes ${String(budget.paths.length)} path(s) and ` +
    `every one is below the dual-review tier (${named(budget.paths.map((entry) => `${entry.path}: ${entry.tier}`))})`
  );
}

/**
 * Classify the change `base...head` by the review it owes.
 *
 * THREE DOTS, the merge base, which is what `scope` and the `diff-touches`
 * precondition already compare: a branch is charged for what IT changed, never
 * for what `main` gained after it was cut.
 *
 * `-z` AND `--no-renames` FOR THE REASONS src/checks.ts gives at its own diff:
 * without `--no-renames` a move from `src/a.ts` to `delivery/a.md` prints only
 * the destination and the change would read as paperwork; without `-z` a
 * non-ASCII paperwork name arrives quoted and is misread as shipped.
 *
 * A PATH OUTSIDE THE CONTEXT DIRECTORY IS DUAL, fail closed. git prints paths
 * relative to the repository root and the project may be nested; a change
 * outside the project is still unreviewed content in the commit under audit.
 *
 * EVERY git FAILURE IS AN ERROR RETURN, never an empty diff. An empty diff is a
 * real answer (tier `none`), so a diff that could not be computed must never be
 * able to produce it.
 */
export function classifyReviewBudget(
  contextDirectory: string,
  base: string,
  head: string,
): { ok: true; budget: ReviewBudget } | { ok: false; reason: string } {
  const prefixRun = spawnSync("git", ["rev-parse", "--show-prefix"], {
    cwd: contextDirectory,
    encoding: "utf8",
  });
  if (prefixRun.error !== undefined || prefixRun.status !== 0) {
    return {
      ok: false,
      reason:
        `the review budget could not be established: git rev-parse --show-prefix in ${contextDirectory} ` +
        `failed (${singleLine(String(prefixRun.error ?? prefixRun.stderr ?? ""))})`,
    };
  }
  const prefix = (prefixRun.stdout ?? "").trim();
  const diff = spawnSync(
    "git",
    ["diff", "-z", "--no-renames", "--name-only", `${base}...${head}`, "--"],
    { cwd: contextDirectory, encoding: "utf8" },
  );
  if (diff.error !== undefined || diff.status !== 0) {
    return {
      ok: false,
      reason:
        `the review budget could not be established: git diff ${base}...${head} failed ` +
        `(${singleLine(String(diff.error ?? diff.stderr ?? ""))}), so which review this change owes is ` +
        "unknown and no review verdict can be reached",
    };
  }
  const changed = (diff.stdout ?? "")
    .split("\0")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const paths = changed.map((path) => ({
    path,
    tier: path.startsWith(prefix) ? tierOfPath(path.slice(prefix.length)).tier : ("dual" as ReviewTier),
  }));
  const tier = paths.reduce<ReviewTier>(
    (worst, entry) => (TIER_RANK[entry.tier] > TIER_RANK[worst] ? entry.tier : worst),
    "none",
  );
  return {
    ok: true,
    budget: {
      base,
      head,
      tier,
      paths,
      dual: paths.filter((entry) => entry.tier === "dual").map((entry) => entry.path),
    },
  };
}

/**
 * The id of the precondition a below-dual change reports unmet.
 *
 * SHARED by both review gates, so "this change is below the dual-review tier"
 * is one fact with one name wherever it is reported.
 */
export const BUDGET_PRECONDITION_ID = "review-budget-requires-dual-review";

/** The evaluated, unmet precondition a below-dual change carries. */
export function budgetPrecondition(budget: ReviewBudget): PreconditionRecord {
  return {
    id: BUDGET_PRECONDITION_ID,
    met: false,
    reason:
      `${describeBudget(budget)}, so DR-0027 does not require the ${String(REQUIRED_VERDICTS)}-verdict ` +
      "shipped-code review for it and this gate does not force it through that rule",
    evidence: [
      `tier: ${budget.tier}`,
      "verdict documents: not read, because the pair rule does not apply to this tier",
      ...budget.paths.slice(0, 50).map((entry) => `${entry.tier}: ${entry.path}`),
      ...(budget.paths.length > 50 ? [`and ${String(budget.paths.length - 50)} more path(s)`] : []),
    ],
  };
}

/**
 * The sentence a dual-tier change with too few admitted verdicts is red with.
 *
 * THE MISSING COUNT IS IN THE SENTENCE, because criterion p3-missing-is-red asks
 * for it and because "red" alone does not tell an operator whether one review or
 * both are owed.
 */
export function missingReviewsSentence(
  budget: ReviewBudget,
  admitted: number,
  auditedHead: string,
): string {
  const missing = Math.max(0, REQUIRED_VERDICTS - admitted);
  return (
    `${describeBudget(budget)}, so DR-0012 requires ${String(REQUIRED_VERDICTS)} approving, decorrelated ` +
    `verdicts for the commit under audit ${auditedHead}; ${String(admitted)} of ${String(REQUIRED_VERDICTS)} ` +
    `are admitted and ${String(missing)} missing. A missing review is RED, never not-applicable (M5-P3)`
  );
}

/* -------------------------------------------------------------------- */
/* The gate                                                              */
/* -------------------------------------------------------------------- */

function emit(resultPath: string, fields: GateResultFields, rows: readonly ConditionRow[]): number {
  const result = makeGateResult(fields);
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys gates ${GATE_ID}: ${refusal}\n`);
    return EXIT_GATE_ERROR;
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`tiphys gates ${GATE_ID}: ${written.reason}\n`);
    return EXIT_GATE_ERROR;
  }
  process.stdout.write(
    `${result.gate}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  for (const row of rows) {
    process.stdout.write(`${renderRow(row)}\n`);
  }
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(result.status);
}

type Read =
  | { kind: "read"; body: string }
  | { kind: "absent" }
  | { kind: "refused"; reason: string };

function read(path: string): Read {
  const result = readRegularFileIfPresent(path);
  if (result.kind === "read") {
    return { kind: "read", body: result.body };
  }
  if (result.kind === "absent") {
    return { kind: "absent" };
  }
  return { kind: "refused", reason: result.reason };
}

/** Every branch ruleset, with its rules, or the reason none could be read. */
async function readRulesets(
  apiBase: string,
  slug: string,
): Promise<{ ok: true; rulesets: RulesetReading[] } | { ok: false; reason: string }> {
  const listUrl = `${apiBase}/repos/${slug}/rulesets?includes_parents=true`;
  const listed = readJsonBody(listUrl, await requestJson(listUrl));
  if (!listed.ok) {
    return { ok: false, reason: listed.reason };
  }
  if (!Array.isArray(listed.value)) {
    return { ok: false, reason: `GET ${listUrl} answered a body that is not an array of rulesets` };
  }
  const rulesets: RulesetReading[] = [];
  for (const entry of listed.value as Record<string, unknown>[]) {
    if (String(entry["target"] ?? "branch") !== "branch") {
      continue;
    }
    /* THE DETAIL DOCUMENT IS AUTHORITATIVE WHEN IT IS FETCHED, AND THAT IS NOT
       TIDINESS. The real list endpoint answers with SUMMARIES carrying no
       `rules`, so the rules always come from the detail; reading `enforcement`
       off the summary while reading the rules off the detail would be one
       verdict assembled from two documents that can disagree. Whichever
       document supplied the rules supplies the enforcement word too. */
    let source = entry;
    if (!Array.isArray(entry["rules"])) {
      const detailUrl = `${apiBase}/repos/${slug}/rulesets/${String(entry["id"] ?? "")}`;
      const detail = readJsonBody(detailUrl, await requestJson(detailUrl));
      if (!detail.ok) {
        return { ok: false, reason: detail.reason };
      }
      source = detail.value as Record<string, unknown>;
      if (!Array.isArray(source["rules"])) {
        return {
          ok: false,
          reason: `GET ${detailUrl} answered a ruleset carrying no rules array, so what it enforces is unknown`,
        };
      }
    }
    rulesets.push({
      id: String(source["id"] ?? entry["id"] ?? ""),
      name: String(source["name"] ?? entry["name"] ?? "(unnamed)"),
      enforcement: String(source["enforcement"] ?? "(none reported)"),
      rules: source["rules"] as RulesetRule[],
    });
  }
  return { ok: true, rulesets };
}

/**
 * The review corpus for one head, read through the shipped primitives.
 *
 * EXTRACTED IN M5-P3 so the two orders the gate now has read it through ONE
 * function. With `--base` the review evidence is read BEFORE the network,
 * because "this shipped change carries no review" is decidable from the
 * repository alone and must not depend on whether an API answers; without it
 * the order is the M4-P12 one, unchanged.
 */
type ReviewCorpus =
  | { ok: false; reason: string }
  | {
      ok: true;
      read: number;
      admitted: AdmittedVerdict[];
      excluded: OffHeadVerdict[];
      forHead: VerdictForHead[];
    };

function readReviewCorpus(contextDirectory: string, head: string): ReviewCorpus {
  /* THE CORPUS, READ THROUGH THE SHIPPED PRIMITIVES (plan step 6). Every
     refusal below is `error` rather than red, and each is the one
     `scripts/check-dual-review.mjs` already makes at the same layer: a merge
     gate that cannot establish the regime, cannot read the DR-0038 declaration,
     or cannot examine a document that looks like a verdict has NOT reached a
     verdict (M2-C-3). */
  const source = resolveCorpusSource(contextDirectory);
  const regime = missingRegimeDocument(contextDirectory, source);
  if (regime !== undefined) {
    return { ok: false, reason: regime.reason };
  }
  const families = readReviewFamilies(contextDirectory);
  if (families.kind === "error") {
    return { ok: false, reason: families.reason };
  }
  const corpus = loadCommittedVerdicts(contextDirectory, source);
  if (!corpus.ok) {
    return { ok: false, reason: corpus.reason };
  }
  if (corpus.unexaminable.length > 0) {
    return {
      ok: false,
      reason:
        `${String(corpus.unexaminable.length)} document(s) could not be examined, so whether a ` +
        `review refusing this head is among them is unknown: ` +
        corpus.unexaminable.map((diagnostic) => diagnostic.message).join("; "),
    };
  }

  /* THE SECOND CALL SITE OF THE EQUALITY MECHANISM, FOUND BY DERIVATION AND
     NOT BY A REVIEW (DR-0047 sweep round 2).
     `scripts/check-dual-review.mjs` selected its corpus by comparing the
     DECLARED head to the RUN head with `===`, and no real flow satisfies that:
     reviewers read commit X, committing their verdicts produces X+1, and CI
     audits X+1. This line was the same comparison, spelled once more, so this
     gate's precondition ("a merge is being proposed at this head, evidenced by
     a committed verdict naming it") could never be met either and every run
     reported not-applicable.

     The relation is now ancestry constrained to a paperwork-only gap, which is
     the same rule and the same function both gates read it from, so the two
     cannot drift into two answers about one question. An EQUAL head still
     passes and touches git not at all (`relateDeclaredHead` answers that case
     before any spawn), which matters here because `--head` comes from the CI
     event and need not be an object in this checkout.

     AND IT IS THE REVIEW-OF-OLD-CODE GUARD (M5-P3's hazard class). A verdict
     for an ancestor is admitted only when every path between it and the
     audited commit is under `delivery/`, so shipped bytes added after a review
     leave that verdict EXCLUDED, and on a dual-tier change the admitted count
     then falls below two and the gate is red. */
  const admitted: AdmittedVerdict[] = [];
  const excluded: OffHeadVerdict[] = [];
  const forHead: VerdictForHead[] = [];
  for (const entry of corpus.verdicts) {
    const declared = String(entry.record["head"] ?? "").toLowerCase();
    const relation = relateDeclaredHead(contextDirectory, declared, head);
    if (relation.kind === "same" || relation.kind === "evidence-only-ancestor") {
      admitted.push({ path: entry.path, declared, relation });
      forHead.push({ path: entry.path, record: entry.record });
      continue;
    }
    excluded.push({ path: entry.path, declared, relation });
  }
  return { ok: true, read: corpus.verdicts.length, admitted, excluded, forHead };
}

/** The verdict-selection row, which says what every other row is ABOUT. */
function selectionRow(
  review: Extract<ReviewCorpus, { ok: true }>,
  head: string,
  budget: ReviewBudget | undefined,
): ConditionRow {
  /* THE ADMISSION ROUTE IS A ROW, NOT A FOOTNOTE. Every other condition here
     gets a row because a reader has to be able to see what was asserted; the
     corpus SELECTION decides what all six conditions are about, so a run whose
     verdicts were admitted by ANCESTRY rather than by naming this commit must
     say so in the same place.

     ITS STATUS IS DERIVED FROM THE BUDGET SINCE M5-P3. Without `--base` it is
     green because selection succeeded (a selection that found nothing reaches
     the not-applicable arm instead). With `--base` on a dual-tier change it is
     RED below two admitted verdicts, and the missing count is in the sentence. */
  const short = budget !== undefined && budget.tier === "dual" && review.forHead.length < REQUIRED_VERDICTS;
  const owed = short ? budget : undefined;
  return {
    id: "verdict-selection",
    clause: "DR-0047 the verdicts selected are evidence about THIS head",
    status: owed === undefined ? "green" : "red",
    head,
    sentence:
      (owed === undefined ? "" : `${missingReviewsSentence(owed, review.forHead.length, head)} | `) +
      `${String(review.admitted.length)} verdict(s) admitted and ${String(review.excluded.length)} excluded` +
      (review.admitted.length === 0 ? "" : `; ${describeAdmittedVerdicts(review.admitted, head).join(" | ")}`) +
      (review.excluded.length === 0
        ? ""
        : ` | EXCLUDED: ${describeOffHeadVerdicts(review.excluded, head).join(" | ")}`),
  };
}

/** Conditions 1, 2 and 3, which need nothing but the committed verdicts. */
function reviewRows(
  review: Extract<ReviewCorpus, { ok: true }>,
  head: string,
  contextDirectory: string,
): ConditionRow[] {
  const rows: ConditionRow[] = [];
  const condition1 = runRegisteredCheck(DECORRELATION_CHECK_ID, review.forHead, contextDirectory);
  rows.push({
    id: "condition-1",
    clause: "DR-0012:22 two decorrelated clean-room reviews of this head",
    status: condition1.status,
    head,
    sentence: condition1.sentence,
  });

  const condition2 = runRegisteredCheck(PAIR_CHECK_ID, review.forHead, contextDirectory);
  rows.push({
    id: "condition-2",
    clause: "DR-0012:23 no unresolved finding at medium or above",
    status: condition2.status,
    head,
    sentence: condition2.sentence,
  });

  const condition3 = judgeCriteriaWalked(review.forHead);
  rows.push({
    id: "condition-3",
    clause: "DR-0012:24 the acceptance criteria were the reviewers' contract",
    status: condition3.ok ? "green" : "red",
    head,
    sentence: condition3.sentence,
  });
  return rows;
}

/**
 * The id of the precondition a run INSIDE the CI it would judge reports unmet.
 *
 * M5-P3. Condition 4 is "CI green on the EXACT head", and this gate is itself a
 * step of that CI. Measured by reading the harness rather than guessed: the
 * pull-request bundle runs the whole manifest, `merge-preconditions` is in it,
 * and its row in scripts/m2-exit-test.sh accepts only green or not-applicable.
 * While no verdict was ever committed the gate never ran, so the loop was
 * invisible; M5-P3 makes the orchestrator commit verdicts on the phase branch,
 * and from that head on the gate runs inside the very run condition 4 asks
 * about, sees that run in progress, and would report red forever. So a `gates`
 * check run for this head that has NOT COMPLETED makes the gate not-applicable
 * with this evaluated precondition, and ONLY when every review row is already
 * green: a refusing or incomplete review is still red, in CI and out of it.
 */
export const CI_CONCLUDED_PRECONDITION_ID = "merge-preconditions-ci-concluded-for-this-head";

export async function runGate(flags: Flags): Promise<number> {
  const startedAt = now();
  const resultPath = flags.result as string;
  const head = (flags.head as string).toLowerCase();
  const phase = (flags.phase as string).toLowerCase();
  const contextDirectory = absolute(flags.context ?? process.cwd());
  const apiBase = (flags["api-base"] ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const shared = { gate: GATE_ID, unitLabel: UNIT_LABEL, startedAt };

  /* M5-P3: THE BUDGET, AND THE REVIEW EVIDENCE, BEFORE THE NETWORK. With
     `--base` (which the registry now declares, so every runner invocation
     supplies it) the diff decides what review is owed. A change below the
     dual-review tier is not-applicable with an evaluated precondition naming
     its tier and paths (criterion p3-paperwork-budget). A dual-tier change with
     fewer than two admitted verdicts is RED with the missing count, and that is
     decided from the repository alone: whether an API answers must not decide
     whether an unreviewed shipped change can merge (criterion
     p3-missing-is-red). Without `--base` nothing here runs and the M4-P12 order
     is unchanged, which is what keeps a hand run by the old command meaning
     what it meant. */
  let budget: ReviewBudget | undefined;
  let review: Extract<ReviewCorpus, { ok: true }> | undefined;
  const rows: ConditionRow[] = [];
  if (flags.base !== undefined) {
    const classified = classifyReviewBudget(contextDirectory, flags.base, head);
    if (!classified.ok) {
      return emit(
        resultPath,
        { ...shared, status: "error", units: 0, endedAt: now(), detail: classified.reason },
        [],
      );
    }
    budget = classified.budget;
    if (budget.tier !== "dual") {
      const precondition = budgetPrecondition(budget);
      return emit(
        resultPath,
        {
          ...shared,
          status: "not-applicable",
          units: 0,
          endedAt: now(),
          precondition,
          detail: precondition.reason,
        },
        [],
      );
    }
    const read = readReviewCorpus(contextDirectory, head);
    if (!read.ok) {
      return emit(
        resultPath,
        { ...shared, status: "error", units: 0, endedAt: now(), detail: read.reason },
        [],
      );
    }
    review = read;
    const selection = selectionRow(review, head, budget);
    rows.push(selection);
    if (selection.status !== "green") {
      return emit(
        resultPath,
        {
          ...shared,
          status: "red",
          units: rows.length,
          endedAt: now(),
          detail:
            `DR-0012 at head ${head}, phase ${phase}: ${missingReviewsSentence(budget, review.forHead.length, head)}; ` +
            "conditions 1 to 6 and the branch-protection encoding were NOT evaluated, because a shipped " +
            "change without its two reviews is refused whatever they would say",
        },
        rows,
      );
    }
    rows.push(...reviewRows(review, head, contextDirectory));
    const reviewStatus = gateStatusForRows(rows);
    if (reviewStatus !== "green") {
      return emit(
        resultPath,
        {
          ...shared,
          status: reviewStatus,
          units: rows.length,
          endedAt: now(),
          detail:
            `DR-0012 at head ${head}, phase ${phase}: ` +
            rows.map((row) => `${row.id}=${row.status}`).join(" ") +
            "; the review evidence already refuses this merge, so conditions 4 to 6 and the " +
            "branch-protection encoding were NOT evaluated and nothing about them is asserted",
        },
        rows,
      );
    }
  }

  const slug = flags.repo ?? slugFromGit(contextDirectory) ?? "";
  if (slug === "") {
    return emit(
      resultPath,
      {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          "no repository could be established: `git -C <context> remote get-url origin` named none " +
          "and --repo <owner/name> was not supplied. Without one, condition 4 and the " +
          "branch-protection encoding have nothing to ask about",
      },
      [],
    );
  }

  /* THE PROBE COMES FIRST AMONG THE NETWORK STEPS (plan step 1 and criterion
     2). An unreachable API is `error` with units 0 and a reason naming the
     failure, and the test asserts the STATUS WORD rather than the detail
     string, because the mutant this arm exists against is a request wrapped in
     a catch that returns "unknown" and reports green. CLAUDE.md standing
     warning 6 says REST reachability here is a thing to PROBE at the start of a
     run that depends on it, in either direction, so this is the probe and not
     an assumption. */
  const probeUrl = `${apiBase}/repos/${slug}`;
  const probe = readJsonBody(probeUrl, await requestJson(probeUrl));
  if (!probe.ok) {
    return emit(
      resultPath,
      {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `the GitHub REST API could not be reached, so DR-0012 condition 4 and the ` +
          `branch-protection encoding were not evaluated and no merge verdict was reached: ${probe.reason}`,
      },
      [],
    );
  }

  if (review === undefined) {
    const read = readReviewCorpus(contextDirectory, head);
    if (!read.ok) {
      return emit(
        resultPath,
        { ...shared, status: "error", units: 0, endedAt: now(), detail: read.reason },
        [],
      );
    }
    review = read;

    if (review.forHead.length === 0) {
      /* SC-011: the not-applicable arm of the M4-P12 order, and it carries an
         EVALUATED precondition rather than a silence. A head with no verdict
         naming it is not a merge waiting on six conditions. REACHABLE ONLY
         WITHOUT `--base` since M5-P3: with it, a dual-tier change and no
         verdict is red above, and a below-dual change never reads the corpus. */
      const precondition: PreconditionRecord = {
        id: PRECONDITION_ID,
        met: false,
        reason:
          `no committed verdict document names head ${head}, so no merge is being proposed at this ` +
          "head and DR-0012's conditions have no subject",
        evidence: [
          `${String(review.read)} committed verdict document(s) were read and examined`,
          `head under evaluation: ${head}`,
          /* EVERY EXCLUDED DOCUMENT IS NAMED WITH THE ROUTE THAT EXCLUDED IT.
             "There is no verdict here" and "there are two approving verdicts
             and each reviewed something else" are different facts, and printing
             the first for both is the fail-open direction
             `describeOffHeadVerdicts` exists to close one gate along. */
          ...describeOffHeadVerdicts(review.excluded, head).map((line) => `EXCLUDED ${line}`),
        ],
      };
      return emit(
        resultPath,
        {
          ...shared,
          status: "not-applicable",
          units: 0,
          endedAt: now(),
          precondition,
          detail: precondition.reason,
        },
        [],
      );
    }
    rows.push(selectionRow(review, head, budget));
    rows.push(...reviewRows(review, head, contextDirectory));
  }

  const checkRunsUrl = `${apiBase}/repos/${slug}/commits/${head}/check-runs`;
  const checkRuns = readJsonBody(checkRunsUrl, await requestJson(checkRunsUrl));
  if (!checkRuns.ok) {
    rows.push({
      id: "condition-4",
      clause: "DR-0012:25 CI green on the EXACT head",
      status: "error",
      head,
      sentence: checkRuns.reason,
    });
  } else {
    const listed = (checkRuns.value as { check_runs?: unknown }).check_runs;
    const runs = Array.isArray(listed) ? (listed as CheckRun[]) : [];
    const inFlight = inFlightCheckRuns(head, runs, REQUIRED_CHECK_CONTEXT);
    if (inFlight.length > 0 && gateStatusForRows(rows) === "green") {
      /* THE RUN IS INSIDE THE CI IT WOULD JUDGE (M5-P3). See
         CI_CONCLUDED_PRECONDITION_ID above. Not green, and not red: the
         condition is not decidable until the run it is about has concluded,
         and the orchestrator's pre-merge run, made after CI concludes, is the
         one that decides it. The review rows already evaluated travel in the
         evidence, so the not-applicable says what WAS established. */
      const precondition: PreconditionRecord = {
        id: CI_CONCLUDED_PRECONDITION_ID,
        met: false,
        reason:
          `${String(inFlight.length)} ${REQUIRED_CHECK_CONTEXT} check run(s) for head ${head} have not ` +
          "completed, so this is a run inside the CI that DR-0012 condition 4 asks about and condition 4 " +
          "cannot be decided yet; re-run this gate after that CI concludes, before merging",
        evidence: [
          ...inFlight,
          ...rows.map((row) => `ESTABLISHED ${renderRow(row)}`),
        ],
      };
      return emit(
        resultPath,
        {
          ...shared,
          status: "not-applicable",
          units: 0,
          endedAt: now(),
          precondition,
          detail: precondition.reason,
        },
        rows,
      );
    }
    const judged = judgeCheckRuns(head, runs, REQUIRED_CHECK_CONTEXT);
    rows.push({
      id: "condition-4",
      clause: "DR-0012:25 CI green on the EXACT head",
      status: judged.ok ? "green" : "red",
      head,
      sentence: judged.sentence,
    });
  }

  const scopeRecordPath = absolute(
    flags["scope-record"] ??
      (flags.evidence === undefined
        ? join(contextDirectory, "scope", "result.json")
        : join(dirname(absolute(flags.evidence)), "scope", "result.json")),
  );
  const scope = judgeScopeRecord(scopeRecordPath, read(scopeRecordPath));
  rows.push({
    id: "condition-5",
    clause: "DR-0012:26 the scope audit passes",
    status: scope.ok ? "green" : "red",
    head,
    sentence: scope.sentence,
  });

  const arbitrationDirectory = absolute(
    flags.arbitrations ?? join(contextDirectory, "delivery", "review"),
  );
  const arbitrationPath = join(arbitrationDirectory, `arbitration-${phase}.md`);
  const arbitration = judgeArbitration(
    arbitrationPath,
    head,
    review.forHead.map((verdict) => verdict.path),
    read(arbitrationPath),
  );
  rows.push({
    id: "condition-6",
    clause: "DR-0012:27 a recorded arbitration over BOTH verdicts at this head",
    status: arbitration.ok ? "green" : "red",
    head,
    sentence: arbitration.sentence,
  });

  const rulesets = await readRulesets(apiBase, slug);
  if (!rulesets.ok) {
    rows.push({
      id: "branch-protection",
      clause: "R-064 the ruleset encoding, R-065a reported as DATA",
      status: "error",
      head,
      sentence: rulesets.reason,
    });
  } else {
    const judged = judgeRulesets(rulesets.rulesets);
    rows.push({
      id: "branch-protection",
      clause: "R-064 the ruleset encoding, R-065a reported as DATA",
      status: judged.ok ? "green" : "red",
      head,
      sentence: judged.sentence,
    });
  }

  /* THE GATE WORD, AND THE ONE PLACE A ROW AND THE GATE DELIBERATELY DIFFER.
     An absent scope record leaves condition 5's row RED (criterion 4) while the
     gate itself is ERROR (plan step 4), because the instrument was not there to
     read. Both facts are printed. */
  const scopeInstrumentMissing = scope.instrument === "missing";
  const status: GateStatus = scopeInstrumentMissing ? "error" : gateStatusForRows(rows);

  return emit(
    resultPath,
    {
      ...shared,
      status,
      units: rows.length,
      endedAt: now(),
      detail:
        `DR-0012 at head ${head}, phase ${phase}: ` +
        rows.map((row) => `${row.id}=${row.status}`).join(" ") +
        (scopeInstrumentMissing
          ? "; the gate word is error rather than red because the scope gate record was ABSENT, " +
            "so condition 5 could not be looked at (plan step 4); the row stays red because the " +
            "condition is not satisfied either way (criterion 4)"
          : ""),
    },
    rows,
  );
}

export async function main(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  if (flags === undefined) {
    return usageError();
  }
  const missing = (["result", "head", "phase"] as const).filter((name) => flags[name] === undefined);
  if (missing.length > 0) {
    return usageError(`${GATE_ID} requires ${missing.map((name) => `--${name}`).join(" ")}`);
  }
  return runGate(flags);
}

const entry = process.argv[1];
if (entry !== undefined && pathsIdentifySameObject(fileURLToPath(import.meta.url), entry)) {
  /* The same second layer src/gates/scope.ts and src/gates/gate-classes.ts
     carry: an uncaught throw would exit 1, which is EXIT_RED, and a crash
     reported as a red verdict is indistinguishable from a real one to a
     consumer reading the exit code. */
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys gates ${GATE_ID}: ${singleLine((error as Error).message ?? String(error))}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}

export { GATE_ID, PRECONDITION_ID, UNIT_LABEL };
export type { Flags };
