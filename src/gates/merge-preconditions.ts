import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  BLOCKING_SEVERITIES,
  loadCommittedVerdicts,
  missingRegimeDocument,
  readReviewFamilies,
  resolveCorpusSource,
  verdictApprovalFaults,
} from "../checks.ts";
import type { ReviewFamiliesReading } from "../checks.ts";
import { countKernelReviews, judgeFamilies, loadReviewRecords } from "../review.ts";
import type { LoadedReviewRecord, ReviewCount } from "../review.ts";
import { readRegularFileIfPresent, refuseOpenForWrite, runStep, singleLine } from "../task.ts";
import { decodeDocument } from "../validate.ts";
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
 *                                        exactly TWO places since M6-P2, and
 *                                        neither is an API failure. Each
 *                                        carries its own evaluated precondition
 *                                        record (SC-011): the M4-P12
 *                                        NO-VERDICT-AT-THIS-HEAD arm (only
 *                                        without `--base`), and a run inside
 *                                        the unconcluded CI of this head with
 *                                        every review row green
 *                                        (CI_CONCLUDED_PRECONDITION_ID).
 *   an unreviewed change called N/A    -> with `--base`, a change with fewer
 *                                        admitted verdicts than its DR-0063
 *                                        tier owes (two for pair, one for
 *                                        single) is RED, decided before any
 *                                        network request (M5-P3, M6-P2).
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
 * CONDITIONS 1 AND 2 READ KERNEL RECORDS (M6-P5, DR-0062). A verdict counts
 * only when a committed review record written by `tiphys review dispatch`
 * names its path and its sha256 (src/review.ts). The count, the head and the
 * family come from the records; APPROVE and the findings come from the
 * verdict, judged by `verdictApprovalFaults`, which `verdict-pair-approves`
 * shares. The regime and the DR-0038 declaration are read with
 * `missingRegimeDocument` and `readReviewFamilies`.
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
const REQUIRED_CHECK_CONTEXT = "gates";

/**
 * The id of the one precondition this gate can report unmet.
 *
 * SC-011: `not-applicable` ASSERTS that a precondition was evaluated. The
 * precondition here is "a merge is being proposed at this head", evidenced by
 * a counted kernel review of it or by a committed verdict that refuses it
 * (M6-P5). A head with neither is not a merge waiting on six conditions; it is
 * a branch nobody has reviewed yet, and reporting red for that would make the
 * gate unusable on every push while making it say something false.
 */
const PRECONDITION_ID = "merge-preconditions-verdict-names-this-head";

const USAGE =
  "usage: node src/gates/merge-preconditions.ts --result <file> --head <sha> --phase <id> " +
  "[--base <ref>] [--evidence <dir>] [--context <dir>] [--repo <owner/name>] [--api-base <url>] " +
  "[--scope-record <file>] [--arbitrations <dir>] [--token-env <NAME>]";

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
  "token-env"?: string;
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
  "--token-env",
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
 *
 * M5-P3: THAT DECLARED FLAG NOW EXISTS, AND THE COST ABOVE WAS MEASURED REAL.
 * On 2026-09-23 from this container, Node's `fetch` (which does NOT go through
 * the agent proxy) answered the unauthenticated `GET /repos/{slug}` with HTTP
 * 403 "API rate limit exceeded for <ip>", and the same request with an
 * Authorization header answered 200. Until M5-P3 the gate never reached the
 * network in CI, because no verdict was ever committed; from M5-P3 on it does,
 * on every reviewed shipped-code head, from a shared runner address. So
 * `--token-env <NAME>` names the environment variable that holds the token,
 * the registry command declares the name, and the value is sent as a bearer
 * token and never written to any record, line or evidence file. Absent or
 * empty, no header is sent, which is the M4-P12 behaviour.
 */
export async function requestJson(url: string, token?: string): Promise<ApiResponse> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "tiphys-merge-preconditions",
  };
  if (token !== undefined && token !== "") {
    headers["authorization"] = `Bearer ${token}`;
  }
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
 * gives a verdict no id of its own. The existing arbitration documents in `delivery/review/`
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
/* Conditions 1 and 2: the review evidence                               */
/* -------------------------------------------------------------------- */

export interface VerdictForHead {
  path: string;
  record: Record<string, unknown>;
}

/**
 * The `single` tier's approval row (DR-0063): every counted review of this
 * head reads APPROVE.
 *
 * THE VERDICT WORD IS THE WHOLE TEST, AND THAT IS DR-0063's RULE RATHER THAN A
 * SHORTCUT. Under `single` "a finding blocks only if it makes a shipped
 * artefact wrong", which is the reviewer's judgement and is carried by the one
 * word the reviewer chooses, so severities are reported and not gated here. The
 * RAW spelling is compared, for the reason `verdict-pair-approves` gives: a
 * sibling reading `Approve` is not an authorisation however it canonicalises.
 * How many reviews exist is the selection row's question, decided before this.
 */
export function judgeSingleApproves(verdicts: readonly VerdictForHead[]): {
  ok: boolean;
  sentence: string;
} {
  const faults: string[] = [];
  const seen: string[] = [];
  for (const verdict of verdicts) {
    const word = verdict.record["verdict"];
    if (word !== "APPROVE") {
      faults.push(
        `${verdict.path} reads ${typeof word === "string" ? word : "no verdict word"}, and the single tier's review must read APPROVE`,
      );
      continue;
    }
    const findings = Array.isArray(verdict.record["findings"]) ? verdict.record["findings"].length : 0;
    seen.push(`${basename(verdict.path)} APPROVE with ${String(findings)} finding(s)`);
  }
  if (verdicts.length === 0) {
    faults.push("no review is counted for this head, so nothing approves it");
  }
  if (faults.length > 0) {
    return { ok: false, sentence: faults.join("; ") };
  }
  return {
    ok: true,
    sentence:
      `every counted review of this head approves (${seen.join(", ")}); under DR-0063's single tier a ` +
      "finding blocks through the reviewer's verdict word, so severities are reported and not gated",
  };
}

/* -------------------------------------------------------------------- */
/* The review tier (M6-P2; DR-0063, DR-0035, T-040, T-041)               */
/* -------------------------------------------------------------------- */

/**
 * How much review a change is REQUIRED to carry before it merges.
 *
 * WHY THIS EXISTS, in one measured sentence: until M5-P3 both review gates were
 * conditional on "is there any verdict document at all", so a branch carrying
 * shipped code and NO review was not-applicable, and T-041 counts sixteen such
 * phases merged. The DIFF decides how much review is owed, and the verdicts are
 * then measured against what is owed.
 *
 * DR-0063 IS THE RULE (delivery/decisions/DR-0063-review-tier-follows-the-diff.md:1).
 * Two tiers and no third. `pair`: the diff touches the project's declared
 * runtime set, and two hazard reviews are owed. `single`: everything else, and
 * one hazard review is owed. The kernel ships the mechanism and the PROJECT
 * declares the set, in its charter's `runtime-set` block (DR-0029: the project
 * owns the predicate). DR-0027's hardcoded three-row table is gone.
 *
 * FAIL CLOSED WHEREVER THE ANSWER IS NOT ESTABLISHED. No declaration, one that
 * does not decode or does not validate, a manifest that does not parse at
 * either side, a path outside the project, and a change to the declaration
 * itself are all `pair`, each with its reason printed. An unreadable
 * declaration read as "no runtime paths" would make every change `single`,
 * which is the fail-open direction this section exists against.
 */
export type ReviewTier = "pair" | "single";

/** How many approving verdicts each tier requires (DR-0063). */
export const REQUIRED_VERDICTS: Readonly<Record<ReviewTier, number>> = { pair: 2, single: 1 };

/** The charter key the declaration lives under. */
export const RUNTIME_SET_FIELD = "runtime-set";

/** The one charter a project's review gates read, at the context directory. */
const RUNTIME_SET_CHARTER = "charter.yaml";

/** A project's declared runtime set, as `schemas/charter.schema.json` shapes it. */
export interface RuntimeSet {
  /** A trailing `/` is a directory prefix; anything else is an exact path. */
  paths: string[];
  /** JSON manifests that count only when a key other than a version field changes. */
  manifests: string[];
  /** Package names whose dependency pin counts as a version field. */
  versionPins: string[];
}

export type RuntimeSetReading =
  | { kind: "declared"; set: RuntimeSet }
  | { kind: "undeclared"; reason: string }
  | { kind: "invalid"; reason: string };

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A list of non-empty strings, or the reason the value is not one. */
function stringList(
  value: unknown,
  where: string,
): { ok: true; list: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    return { ok: false, reason: `${where} is not a list` };
  }
  const list: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    if (typeof entry !== "string" || entry.trim() === "") {
      return { ok: false, reason: `${where}[${String(index)}] is not a non-empty string` };
    }
    list.push(entry);
  }
  return { ok: true, list };
}

/**
 * Why one declared `paths` or `manifests` entry is refused for its SHAPE, or
 * undefined (M6-P2 fix round 1, CR-M6P2B-02 and CR-M6P2A-02). THE MECHANISM: an entry that matches nothing was a valid
 * declaration, so the set was silently empty and every change was `single`.
 * git prints project-relative paths with no leading `./` or `/`, no `.` or
 * `..` segment and no empty segment, so those shapes match nothing. The
 * classifier compares entries literally, so a glob character matches only a
 * file whose name carries that character, which is not what a glob means. A
 * manifest is one file, so it may not end in `/` either. M6-P5 (CR-M6P2A-07,
 * CR-M6P2B-08): git separates segments with `/` and prints no path that starts
 * or ends with whitespace, so a backslash or a leading or trailing space
 * matches nothing too. schemas/charter.schema.json carries the same rule as a
 * pattern; this is the reader's copy, because the gate reads a blob and never
 * runs the schema validator.
 */
function entryShapeFault(entry: string, isManifest: boolean): string | undefined {
  if (/[*?[]/.test(entry)) {
    return "carries a glob character (*, ? or [), and entries are literal paths";
  }
  if (entry.includes("\\")) {
    return "carries a backslash, and git separates path segments with /";
  }
  if (/^\s|\s$/.test(entry)) {
    return "starts or ends with whitespace, and git prints no such path";
  }
  if (entry.startsWith("/")) {
    return "starts with /, and entries are relative to the project";
  }
  if (entry.startsWith("./")) {
    return "starts with ./, and git prints no such prefix";
  }
  const segments = (entry.endsWith("/") ? entry.slice(0, -1) : entry).split("/");
  if (segments.some((segment) => segment === "")) {
    return "has an empty segment";
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return "has a . or .. segment";
  }
  if (isManifest && entry.endsWith("/")) {
    return "ends in /, and a manifest is one file";
  }
  return undefined;
}

/**
 * The first declared entry that matches nothing git prints, judged by what it
 * names at `rev`, as a sentence, or undefined. An EXACT entry (a `paths` entry
 * with no trailing `/`, or any `manifests` entry) is compared with `===`, and
 * git never prints a directory as a changed path, so `paths: [src]` over a
 * directory `src/` matches nothing under it (CR-M6P2B-02). A PREFIX entry (a
 * `paths` entry ending in `/`) matches only paths under a directory, so one
 * that names a FILE at `rev`, or names nothing there, matches nothing either
 * (M6-P5, CR-M6P2A-07 and CR-M6P2B-08). A listing git could not produce is a
 * sentence too, so the caller fails closed on it.
 */
function entryLookupFault(contextDirectory: string, rev: string, set: RuntimeSet): string | undefined {
  const entries: [string, string, boolean][] = [
    ...set.paths.map((entry): [string, string, boolean] => ["paths", entry, entry.endsWith("/")]),
    ...set.manifests.map((entry): [string, string, boolean] => ["manifests", entry, false]),
  ];
  for (const [field, entry, prefix] of entries) {
    const name = prefix ? entry.slice(0, -1) : entry;
    const listed = spawnSync("git", ["--literal-pathspecs", "ls-tree", "-z", rev, "--", name], {
      cwd: contextDirectory,
      encoding: "utf8",
    });
    if (listed.error !== undefined || listed.status !== 0) {
      return (
        `${RUNTIME_SET_FIELD}.${field} entry ${JSON.stringify(entry)} could not be looked up at ${rev} ` +
        `(git ls-tree failed: ${singleLine(String(listed.error ?? listed.stderr ?? ""))})`
      );
    }
    const first = (listed.stdout ?? "").split("\0")[0] ?? "";
    if (prefix) {
      if (first === "") {
        return (
          `${RUNTIME_SET_FIELD}.${field} entry ${JSON.stringify(entry)} names nothing at ${rev}, so no path ` +
          `git prints lies under it (a prefix entry names an existing directory)`
        );
      }
      if (!/^\d{6} tree /.test(first)) {
        return (
          `${RUNTIME_SET_FIELD}.${field} entry ${JSON.stringify(entry)} names a FILE at ${rev}, and a prefix ` +
          `entry matches only paths under a directory (a file entry has no trailing /)`
        );
      }
      continue;
    }
    if (/^\d{6} tree /.test(first)) {
      return (
        `${RUNTIME_SET_FIELD}.${field} entry ${JSON.stringify(entry)} names a DIRECTORY at ${rev}, and an exact ` +
        `entry is compared with ===, so no path under it matches (a directory entry ends in /)`
      );
    }
  }
  return undefined;
}

/**
 * Read the `runtime-set` block out of one charter's TEXT. Pure.
 *
 * `undefined` text means the charter does not exist at that revision. Every
 * shape the schema refuses is `invalid` here too, checked in code rather than
 * by the schema validator because this runs inside a merge gate over a blob,
 * and the three readings must stay three: no declaration, a declaration, and a
 * declaration that could not be read. The caller turns the first and the third
 * into `pair`, never into "no runtime paths".
 */
export function readRuntimeSet(text: string | undefined, label: string): RuntimeSetReading {
  if (text === undefined) {
    return { kind: "undeclared", reason: `${label} does not exist, so no runtime set is declared` };
  }
  const decoded = decodeDocument(text, label);
  if (!decoded.ok) {
    return { kind: "invalid", reason: decoded.reason };
  }
  if (!isMapping(decoded.value)) {
    return { kind: "invalid", reason: `${label} is not a mapping, so no runtime set can be read from it` };
  }
  if (!(RUNTIME_SET_FIELD in decoded.value)) {
    return { kind: "undeclared", reason: `${label} carries no ${RUNTIME_SET_FIELD} block` };
  }
  const block = decoded.value[RUNTIME_SET_FIELD];
  if (!isMapping(block)) {
    return { kind: "invalid", reason: `${label} ${RUNTIME_SET_FIELD} is not a mapping` };
  }
  const known = new Set(["paths", "manifests", "version-pins"]);
  const unknown = Object.keys(block).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    return { kind: "invalid", reason: `${label} ${RUNTIME_SET_FIELD} carries unknown key(s) ${unknown.join(", ")}` };
  }
  const paths = stringList(block["paths"], `${label} ${RUNTIME_SET_FIELD}.paths`);
  if (!paths.ok) {
    return { kind: "invalid", reason: paths.reason };
  }
  if (paths.list.length === 0) {
    return { kind: "invalid", reason: `${label} ${RUNTIME_SET_FIELD}.paths is empty` };
  }
  const manifests =
    block["manifests"] === undefined
      ? ({ ok: true, list: [] } as const)
      : stringList(block["manifests"], `${label} ${RUNTIME_SET_FIELD}.manifests`);
  if (!manifests.ok) {
    return { kind: "invalid", reason: manifests.reason };
  }
  const pins =
    block["version-pins"] === undefined
      ? ({ ok: true, list: [] } as const)
      : stringList(block["version-pins"], `${label} ${RUNTIME_SET_FIELD}.version-pins`);
  if (!pins.ok) {
    return { kind: "invalid", reason: pins.reason };
  }
  for (const [field, list] of [
    ["paths", paths.list],
    ["manifests", manifests.list],
  ] as const) {
    for (const entry of list) {
      const fault = entryShapeFault(entry, field === "manifests");
      if (fault !== undefined) {
        return {
          kind: "invalid",
          reason:
            `${label} ${RUNTIME_SET_FIELD}.${field} entry ${JSON.stringify(entry)} ${fault}, ` +
            "so it does not name the paths it looks like it names, and the declaration is refused (fail closed)",
        };
      }
    }
  }
  return {
    kind: "declared",
    set: { paths: [...paths.list], manifests: [...manifests.list], versionPins: [...pins.list] },
  };
}

/** The raw `runtime-set` value of one charter text, key-sorted, or why not. */
function runtimeSetBlockText(text: string, label: string): { ok: true; value: string } | { ok: false; reason: string } {
  const decoded = decodeDocument(text, label);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  if (!isMapping(decoded.value)) {
    return { ok: false, reason: `${label} is not a mapping` };
  }
  return { ok: true, value: canonicalJson(decoded.value[RUNTIME_SET_FIELD]) };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isMapping(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * The dependency fields in which a pinned name's value is a version field.
 * NOT peerDependencies: a peer range is the package's compatibility contract
 * with its host, not which release it installs, so changing it is `pair`
 * (fix round 1, CR-M6P2B-05).
 */
const PIN_FIELDS = new Set(["dependencies", "devDependencies", "optionalDependencies"]);

/** A version as a manifest spells it: exact, or a caret or tilde range of one. */
const VERSION_VALUE = /^[~^]?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

function pointerOf(segments: readonly string[]): string {
  return `/${segments.map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

/**
 * Is a lockfile `packages` key a workspace entry, the root entry `""` included?
 * Only when NO segment of it is `node_modules`: npm writes a workspace's own
 * nested installs as `<workspace>/node_modules/<name>`, and those are
 * dependencies exactly as `node_modules/<name>` is (fix round 1, CR-M6P2A-03
 * and CR-M6P2B-05; the rule before it tested only the key's START).
 */
function isWorkspaceKey(key: string): boolean {
  return !key.split("/").includes("node_modules");
}

/**
 * Is the leaf at `segments` a version field (DR-0063)? Three shapes, and only
 * these: the top-level `version`; the `version` of a lockfile workspace entry
 * (`packages[""]` or a `packages` key with no `node_modules` segment); and a
 * pin of a name declared in `version-pins`, in `dependencies`,
 * `devDependencies` or `optionalDependencies` of the document's root or of a
 * lockfile workspace entry. A pin anywhere else (inside a `node_modules` entry,
 * in `peerDependencies`, at any other depth) is not a version field.
 */
function isVersionField(segments: readonly string[], pins: readonly string[]): boolean {
  if (segments.length === 1 && segments[0] === "version") {
    return true;
  }
  if (
    segments.length === 3 &&
    segments[0] === "packages" &&
    segments[2] === "version" &&
    isWorkspaceKey(segments[1] as string)
  ) {
    return true;
  }
  if (segments.length === 2) {
    return PIN_FIELDS.has(segments[0] as string) && pins.includes(segments[1] as string);
  }
  if (segments.length === 4 && segments[0] === "packages" && isWorkspaceKey(segments[1] as string)) {
    return PIN_FIELDS.has(segments[2] as string) && pins.includes(segments[3] as string);
  }
  return false;
}

/**
 * Every difference between two parsed manifests, split into version-field
 * changes and everything else. Pure.
 *
 * A VERSION FIELD COUNTS ONLY WHEN BOTH SIDES ARE VERSIONS. A pin rewritten
 * from `0.2.1` to `file:../elsewhere` or to an object changes WHAT is
 * installed, not which release, so it is reported as a non-version change.
 * An added or removed key is always non-version, wherever it is.
 */
export function manifestDifferences(
  base: unknown,
  head: unknown,
  pins: readonly string[],
): { version: string[]; other: string[] } {
  const version: string[] = [];
  const other: string[] = [];
  const walk = (left: unknown, right: unknown, segments: string[]): void => {
    if (isMapping(left) && isMapping(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        if (!(key in left)) {
          other.push(`${pointerOf([...segments, key])} added`);
        } else if (!(key in right)) {
          other.push(`${pointerOf([...segments, key])} removed`);
        } else {
          walk(left[key], right[key], [...segments, key]);
        }
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) {
        other.push(`${pointerOf(segments)} changed length`);
        return;
      }
      for (let index = 0; index < left.length; index += 1) {
        walk(left[index], right[index], [...segments, String(index)]);
      }
      return;
    }
    if (canonicalJson(left) === canonicalJson(right)) {
      return;
    }
    const where = pointerOf(segments);
    if (
      isVersionField(segments, pins) &&
      typeof left === "string" &&
      typeof right === "string" &&
      VERSION_VALUE.test(left) &&
      VERSION_VALUE.test(right)
    ) {
      version.push(`${where} ${left} -> ${right}`);
      return;
    }
    other.push(`${where} changed`);
  };
  walk(base, head, []);
  return { version, other };
}

/** One changed path as the classifier sees it. */
export interface ChangedPath {
  /** As git printed it, relative to the repository root. */
  path: string;
  /** Relative to the project, or undefined when the path is outside it. */
  projectPath: string | undefined;
}

/** Bytes of one project path at the merge base and at the head; undefined = absent there. */
export interface PathSides {
  base: string | undefined;
  head: string | undefined;
}

export interface ClassifiedPath {
  path: string;
  tier: ReviewTier;
  reason: string;
}

export interface TierInput {
  /** The declaration read at the MERGE BASE, never at the head. */
  declaration: RuntimeSetReading;
  changed: readonly ChangedPath[];
  /**
   * Both sides of every changed path a rule reads (the charter and each
   * declared manifest), keyed by project path. A path a rule needs and this
   * map lacks is `pair`: content that was not supplied was not shown to be a
   * version bump.
   */
  sides: ReadonlyMap<string, PathSides>;
}

/**
 * Classify a change `pair | single` (DR-0063). PURE: no git, no filesystem.
 *
 * Per path, in this order, and the order is part of the rule:
 *   1. outside the project: `pair`;
 *   2. no usable declaration at the merge base: `pair`, naming why;
 *   3. the charter, when its `runtime-set` block differs between the two
 *      sides: `pair` (a change to the set that judges it is judged by pair);
 *   4. a declared manifest: `single` when every difference is a version field,
 *      else `pair`. BEFORE the path prefixes, so `plugin/package.json` under a
 *      declared `plugin/` is judged by the manifest rule, which is the only way
 *      DR-0063's version-only bump (PR #224) is `single`;
 *   5. a declared path (trailing `/` a prefix, else exact): `pair`;
 *   6. everything else: `single`.
 * The change's tier is `pair` when any path is. An empty change is `single`.
 */
export function classifyTier(input: TierInput): { tier: ReviewTier; paths: ClassifiedPath[] } {
  const paths: ClassifiedPath[] = [];
  for (const entry of input.changed) {
    paths.push({ path: entry.path, ...classifyOne(entry, input) });
  }
  return { tier: paths.some((entry) => entry.tier === "pair") ? "pair" : "single", paths };
}

function classifyOne(entry: ChangedPath, input: TierInput): { tier: ReviewTier; reason: string } {
  const projectPath = entry.projectPath;
  if (projectPath === undefined) {
    return { tier: "pair", reason: "outside the project, fail closed" };
  }
  if (input.declaration.kind !== "declared") {
    return {
      tier: "pair",
      reason: `no usable runtime-set declaration at the merge base (${input.declaration.reason}), fail closed`,
    };
  }
  const set = input.declaration.set;
  if (projectPath === RUNTIME_SET_CHARTER) {
    /* CR-M6P2A-08, CR-M6P2B-09: each arm that could not compare the two blocks
       is pair. test/merge-preconditions.test.ts stages every one through git. */
    const sides = input.sides.get(projectPath);
    if (sides === undefined) {
      /* A side git could not show as one regular file (a symlink, a submodule). */
      return { tier: "pair", reason: "the charter changed and its two sides were not read, fail closed" };
    }
    if (sides.base === undefined || sides.head === undefined) {
      /* Absent at the merge base or deleted at the head. */
      return {
        tier: "pair",
        reason: `the charter is ${sides.base === undefined ? "absent at the merge base" : "deleted at the head"}, so the runtime-set declaration changed`,
      };
    }
    const before = runtimeSetBlockText(sides.base, `${RUNTIME_SET_CHARTER} at the merge base`);
    const after = runtimeSetBlockText(sides.head, `${RUNTIME_SET_CHARTER} at the head`);
    if (!before.ok || !after.ok) {
      /* A side that does not parse. */
      return {
        tier: "pair",
        reason: `the charter could not be read on both sides (${before.ok ? "" : before.reason}${!before.ok && !after.ok ? "; " : ""}${after.ok ? "" : after.reason}), fail closed`,
      };
    }
    if (before.value !== after.value) {
      return { tier: "pair", reason: `the ${RUNTIME_SET_FIELD} declaration itself changed` };
    }
  }
  if (set.manifests.includes(projectPath)) {
    const sides = input.sides.get(projectPath);
    if (sides === undefined) {
      /* Unreadable at the merge base or the head (CR-M6P2A-08, CR-M6P2B-09). */
      return { tier: "pair", reason: "a declared manifest whose two sides were not read, fail closed" };
    }
    if (sides.base === undefined || sides.head === undefined) {
      return {
        tier: "pair",
        reason: `a declared manifest ${sides.base === undefined ? "added" : "deleted"} by the change`,
      };
    }
    let before: unknown;
    let after: unknown;
    try {
      before = JSON.parse(sides.base);
      after = JSON.parse(sides.head);
    } catch (error) {
      return {
        tier: "pair",
        reason: `a declared manifest that does not parse as JSON on both sides (${singleLine((error as Error).message)}), fail closed`,
      };
    }
    const differences = manifestDifferences(before, after, set.versionPins);
    if (differences.other.length > 0) {
      return {
        tier: "pair",
        reason: `a declared manifest changing more than version fields: ${differences.other.slice(0, 5).join(", ")}${differences.other.length > 5 ? ` and ${String(differences.other.length - 5)} more` : ""}`,
      };
    }
    return {
      tier: "single",
      reason:
        differences.version.length === 0
          ? "a declared manifest with no parsed difference"
          : `a declared manifest changing version fields only: ${differences.version.join(", ")}`,
    };
  }
  const named = set.paths.find((declared) =>
    declared.endsWith("/") ? projectPath.startsWith(declared) : projectPath === declared,
  );
  if (named !== undefined) {
    return { tier: "pair", reason: `in the declared runtime set (${named})` };
  }
  return { tier: "single", reason: "outside the declared runtime set" };
}

export interface ReviewBudget {
  base: string;
  head: string;
  /** The merge base the diff and the declaration were read at. */
  mergeBase: string;
  tier: ReviewTier;
  /** Where the runtime set was read from and what it declared, one sentence. */
  declaration: string;
  /** Every changed path with its tier and the rule that decided it. */
  paths: ClassifiedPath[];
  /** The changed paths that put the change in the pair tier. */
  pair: string[];
}

/** How many paths to name in a sentence before it stops being readable. */
const NAMED_PATHS = 8;

export function describeBudget(budget: ReviewBudget): string {
  const named = (list: readonly string[]): string =>
    list.slice(0, NAMED_PATHS).join(", ") +
    (list.length > NAMED_PATHS ? ` and ${String(list.length - NAMED_PATHS)} more` : "");
  if (budget.paths.length === 0) {
    return `the diff ${budget.base}...${budget.head} changes no path, so its DR-0063 tier is single; ${budget.declaration}`;
  }
  if (budget.tier === "pair") {
    return (
      `the diff ${budget.base}...${budget.head} changes ${String(budget.paths.length)} path(s), ` +
      `${String(budget.pair.length)} of them in the DR-0063 pair tier ` +
      `(${named(budget.paths.filter((entry) => entry.tier === "pair").map((entry) => `${entry.path}: ${entry.reason}`))}); ` +
      budget.declaration
    );
  }
  return (
    `the diff ${budget.base}...${budget.head} changes ${String(budget.paths.length)} path(s) and ` +
    `every one is in the DR-0063 single tier (${named(budget.paths.map((entry) => `${entry.path}: ${entry.reason}`))}); ` +
    budget.declaration
  );
}

type Blob = { kind: "absent" } | { kind: "read"; body: string } | { kind: "error"; reason: string };

/**
 * One project path's bytes at one revision, through git, with ABSENT kept
 * apart from COULD-NOT-READ. `ls-tree` answers presence (an empty listing is
 * absence, a nonzero exit is an error), and only a regular-file blob is read:
 * a symlink, a directory or a submodule at a declared path is an error here,
 * which the caller turns into `pair`.
 */
function blobAt(contextDirectory: string, rev: string, projectPath: string): Blob {
  const listed = spawnSync(
    "git",
    ["--literal-pathspecs", "ls-tree", "-z", rev, "--", projectPath],
    { cwd: contextDirectory, encoding: "utf8" },
  );
  if (listed.error !== undefined || listed.status !== 0) {
    return {
      kind: "error",
      reason: `git ls-tree ${rev} -- ${projectPath} failed (${singleLine(String(listed.error ?? listed.stderr ?? ""))})`,
    };
  }
  const entries = (listed.stdout ?? "").split("\0").filter((line) => line !== "");
  if (entries.length === 0) {
    return { kind: "absent" };
  }
  const match = /^(\d{6}) (\w+) ([0-9a-f]+)\t/.exec(entries[0] as string);
  if (entries.length !== 1 || match === null || match[2] !== "blob" || !["100644", "100755"].includes(match[1] as string)) {
    return {
      kind: "error",
      reason: `${projectPath} at ${rev} is not one regular file (${singleLine(entries.join(" | "))})`,
    };
  }
  const shown = spawnSync("git", ["cat-file", "blob", match[3] as string], {
    cwd: contextDirectory,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (shown.error !== undefined || shown.status !== 0) {
    return {
      kind: "error",
      reason: `git cat-file blob ${match[3] as string} failed (${singleLine(String(shown.error ?? shown.stderr ?? ""))})`,
    };
  }
  return { kind: "read", body: shown.stdout ?? "" };
}

/**
 * Classify the change `base...head` by the review it owes (DR-0063).
 *
 * THREE DOTS, the merge base, which is what `scope` and the `diff-touches`
 * precondition already compare: a branch is charged for what IT changed, never
 * for what `main` gained after it was cut.
 *
 * THE DECLARATION IS READ AT THE MERGE BASE, from the committed charter, so a
 * change cannot shrink the set that judges it: a head that drops `src/` from
 * its own declaration while touching `src/` is still judged by the set it
 * started from, and the declaration change is itself `pair`.
 *
 * `-z` AND `--no-renames` FOR THE REASONS src/checks.ts gives at its own diff:
 * without `--no-renames` a move from `src/a.ts` to `delivery/a.md` prints only
 * the destination and the change would read as paperwork; without `-z` a
 * non-ASCII paperwork name arrives quoted and is misread.
 *
 * A PATH OUTSIDE THE CONTEXT DIRECTORY IS `pair`, fail closed. git prints paths
 * relative to the repository root and the project may be nested; a change
 * outside the project is still unreviewed content in the commit under audit.
 *
 * EVERY git FAILURE IS AN ERROR RETURN, never an empty diff. An empty diff is a
 * real answer (tier `single`), so a diff that could not be computed must never be
 * able to produce it. A blob that could not be read is `pair` rather than an
 * error, because it is one path's content and the rule for it fails closed.
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
  const mergeBaseRun = spawnSync("git", ["merge-base", base, head], {
    cwd: contextDirectory,
    encoding: "utf8",
  });
  const mergeBase = (mergeBaseRun.stdout ?? "").trim();
  if (mergeBaseRun.error !== undefined || mergeBaseRun.status !== 0 || mergeBase === "") {
    return {
      ok: false,
      reason:
        `the review budget could not be established: git merge-base ${base} ${head} failed ` +
        `(${singleLine(String(mergeBaseRun.error ?? mergeBaseRun.stderr ?? ""))}), so the runtime-set ` +
        "declaration that judges this change could not be read",
    };
  }
  const changed: ChangedPath[] = (diff.stdout ?? "")
    .split("\0")
    .filter((line) => line !== "")
    .map((path) => ({
      path,
      projectPath: path.startsWith(prefix) ? path.slice(prefix.length) : undefined,
    }));

  const charterLabel = `${mergeBase}:${prefix}${RUNTIME_SET_CHARTER}`;
  const charterBlob = blobAt(contextDirectory, mergeBase, RUNTIME_SET_CHARTER);
  /* A charter git cannot show as one regular file is an INVALID declaration,
     never an empty one (CR-M6P2A-08). */
  const charterReading: RuntimeSetReading =
    charterBlob.kind === "error"
      ? { kind: "invalid", reason: charterBlob.reason }
      : readRuntimeSet(charterBlob.kind === "read" ? charterBlob.body : undefined, charterLabel);
  /* An entry that matches nothing git prints makes the declaration invalid, so
     the change is pair, named: an exact entry that is a DIRECTORY at the merge
     base (M6-P2 fix round 1, CR-M6P2B-02), a prefix entry that is a FILE or
     nothing there (M6-P5, CR-M6P2A-07, CR-M6P2B-08). */
  const directoryFault =
    charterReading.kind === "declared" ? entryLookupFault(contextDirectory, mergeBase, charterReading.set) : undefined;
  const declaration: RuntimeSetReading =
    directoryFault === undefined ? charterReading : { kind: "invalid", reason: `${charterLabel} ${directoryFault}` };

  const wanted = new Set<string>();
  for (const entry of changed) {
    if (entry.projectPath === undefined) {
      continue;
    }
    if (
      entry.projectPath === RUNTIME_SET_CHARTER ||
      (declaration.kind === "declared" && declaration.set.manifests.includes(entry.projectPath))
    ) {
      wanted.add(entry.projectPath);
    }
  }
  const sides = new Map<string, PathSides>();
  const unread: string[] = [];
  for (const projectPath of wanted) {
    const before = blobAt(contextDirectory, mergeBase, projectPath);
    const after = blobAt(contextDirectory, head, projectPath);
    if (before.kind === "error" || after.kind === "error") {
      /* Left out of `sides`, so the pure rule reads it as not shown to be a
         version bump, which is `pair`. The reason is kept for the sentence. */
      unread.push(`${projectPath}: ${before.kind === "error" ? before.reason : ""}${after.kind === "error" ? after.reason : ""}`);
      continue;
    }
    sides.set(projectPath, {
      base: before.kind === "read" ? before.body : undefined,
      head: after.kind === "read" ? after.body : undefined,
    });
  }
  const classified = classifyTier({ declaration, changed, sides });
  const declared =
    declaration.kind === "declared"
      ? `the runtime set declared at ${charterLabel} is paths [${declaration.set.paths.join(", ")}], ` +
        `manifests [${declaration.set.manifests.join(", ")}], version-pins [${declaration.set.versionPins.join(", ")}]`
      : `${declaration.kind === "undeclared" ? "NO runtime set is declared" : "the runtime-set declaration is INVALID"} ` +
        `at the merge base (${declaration.reason}), so every changed path is pair (DR-0063 fail closed)`;
  return {
    ok: true,
    budget: {
      base,
      head,
      mergeBase,
      tier: classified.tier,
      declaration: declared + (unread.length === 0 ? "" : `; unreadable, so pair: ${unread.join("; ")}`),
      paths: classified.paths,
      pair: classified.paths.filter((entry) => entry.tier === "pair").map((entry) => entry.path),
    },
  };
}

/**
 * The sentence a change with too few admitted verdicts for its tier is red with.
 *
 * THE MISSING COUNT IS IN THE SENTENCE, because criterion p3-missing-is-red asks
 * for it and because "red" alone does not tell an operator how many reviews
 * are owed.
 */
export function missingReviewsSentence(
  budget: ReviewBudget,
  admitted: number,
  auditedHead: string,
): string {
  const required = REQUIRED_VERDICTS[budget.tier];
  const missing = Math.max(0, required - admitted);
  return (
    `${describeBudget(budget)}, so DR-0063 requires ${String(required)} approving hazard ` +
    `${budget.tier === "pair" ? "reviews, launched by the kernel on distinct observed families or under the declared exception," : "review, launched by the kernel,"} for the commit under audit ` +
    `${auditedHead}; ${String(admitted)} of ${String(required)} are counted and ${String(missing)} missing. ` +
    "A missing review is RED, never not-applicable (M5-P3)"
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
  token: string | undefined,
): Promise<{ ok: true; rulesets: RulesetReading[] } | { ok: false; reason: string }> {
  const listUrl = `${apiBase}/repos/${slug}/rulesets?includes_parents=true`;
  const listed = readJsonBody(listUrl, await requestJson(listUrl, token));
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
      const detail = readJsonBody(detailUrl, await requestJson(detailUrl, token));
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
 * The review evidence for one phase at one head (M6-P5, DR-0062).
 *
 * The verdicts are loaded from `delivery/review/` and the kernel's review
 * records from `delivery/review/records/`, both through the one corpus source.
 * A verdict COUNTS only through a record (`countKernelReviews`): the head, the
 * phase and the family come from the record, and only APPROVE and the findings
 * from the verdict. With `--base` the review evidence is read BEFORE the
 * network, because "this change carries no counted review" is decidable from
 * the repository alone.
 *
 * Every refusal below is `error` rather than red: a merge gate that cannot
 * establish the regime, cannot read the DR-0038 declaration, or cannot examine
 * a document that looks like a verdict has NOT reached a verdict (M2-C-3).
 */
type ReviewCorpus =
  | { ok: false; reason: string }
  | {
      ok: true;
      read: number;
      count: ReviewCount;
      families: ReviewFamiliesReading;
      records: LoadedReviewRecord[];
      invalidRecords: { path: string; reason: string }[];
      forHead: VerdictForHead[];
    };

function readReviewCorpus(contextDirectory: string, head: string, phase: string, mergeBase?: string): ReviewCorpus {
  const source = resolveCorpusSource(contextDirectory);
  const regime = missingRegimeDocument(contextDirectory, source);
  if (regime !== undefined) {
    return { ok: false, reason: regime.reason };
  }
  /* At the merge base when there is one, like the runtime set (M6-P5 fix round
     1, CR-M6P5A-03): a change must not declare the exception that admits its
     own correlated pair. Without `--base` there is no base, and HEAD is read. */
  const families = mergeBase === undefined ? readReviewFamilies(contextDirectory) : readReviewFamilies(contextDirectory, mergeBase);
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
  const loaded = loadReviewRecords(contextDirectory, source);
  if (!loaded.ok) {
    return { ok: false, reason: loaded.reason };
  }
  const counted = countKernelReviews({
    contextDirectory,
    source,
    records: loaded.records,
    verdicts: corpus.verdicts,
    auditedHead: head,
    phase,
    mergeBase,
  });
  if (!counted.ok) {
    return { ok: false, reason: counted.reason };
  }
  return {
    ok: true,
    read: corpus.verdicts.length,
    count: counted.count,
    families,
    records: loaded.records,
    invalidRecords: loaded.invalid,
    forHead: counted.count.counted.map((review) => ({
      path: join(contextDirectory, review.verdictPath),
      record: review.verdict,
    })),
  };
}

/** What the selection row and a not-applicable precondition print about the records. */
function describeCount(review: Extract<ReviewCorpus, { ok: true }>, head: string): string[] {
  const lines: string[] = [];
  for (const entry of review.count.counted) {
    lines.push(
      `COUNTED ${entry.verdictPath} through ${entry.recordPath} (task ${entry.record.taskId}, observed ` +
        `${entry.record.observation.model ?? "none"}, family ${entry.record.family}, head ${entry.record.head}` +
        (entry.relation.kind === "same" ? ", the commit under audit)" : `, a paperwork-only ancestor of ${head})`),
    );
  }
  for (const entry of review.count.excluded) {
    lines.push(`NOT COUNTED ${entry.path} ${entry.reason}`);
  }
  for (const entry of review.invalidRecords) {
    lines.push(`NOT COUNTED ${entry.path} ${entry.reason}`);
  }
  for (const path of review.count.unclaimed) {
    lines.push(`NOT COUNTED ${path}: no kernel review record names it with its sha256, so the kernel did not launch it (DR-0062)`);
  }
  return lines;
}

/**
 * The committed refusals no counted record names (M6-P5 fix round 1,
 * CR-M6P5A-04). Each blocks the merge in either tier: a refusal is read from
 * the committed verdict whether or not the kernel launched the review.
 */
function unclaimedRefusalFaults(review: Extract<ReviewCorpus, { ok: true }>, head: string): string[] {
  return review.count.refusing.map(
    (refusal) =>
      `${refusal.path} reads ${refusal.word} for ${refusal.relation.kind === "same" ? `this head ${head}` : `head ${refusal.head}, a paperwork-only ancestor of ${head}`}, ` +
      "and no counted kernel record names it; a committed refusal blocks the merge whether or not the kernel launched it",
  );
}

/** The verdict-selection row, which says what every other row is ABOUT. */
function selectionRow(
  review: Extract<ReviewCorpus, { ok: true }>,
  head: string,
  budget: ReviewBudget | undefined,
): ConditionRow {
  /* With `--base` the row is RED below the tier's required count (DR-0063:
     two for pair, one for single), with the missing count in the sentence.
     Without it the row is green because selection succeeded; a selection that
     counted nothing reaches the not-applicable arm instead. */
  const short = budget !== undefined && review.forHead.length < REQUIRED_VERDICTS[budget.tier];
  const owed = short ? budget : undefined;
  const lines = describeCount(review, head);
  return {
    id: "verdict-selection",
    clause: "DR-0062 the verdicts counted are the kernel-recorded reviews of THIS head and phase",
    status: owed === undefined ? "green" : "red",
    head,
    sentence:
      (owed === undefined ? "" : `${missingReviewsSentence(owed, review.forHead.length, head)} | `) +
      `${String(review.count.counted.length)} review(s) counted from ${String(review.records.length + review.invalidRecords.length)} ` +
      `record(s) and ${String(review.read)} verdict document(s)` +
      (lines.length === 0 ? "" : `; ${lines.join(" | ")}`),
  };
}

/**
 * The review rows, PER TIER (DR-0063). `pair`: condition 1 is the family rule
 * over the counted reviews' kernel records, and condition 2 is that every
 * counted verdict approves with no blocking finding. `single`: one row, the
 * counted review approves; one review has nothing to be distinct from.
 */
function reviewRows(
  review: Extract<ReviewCorpus, { ok: true }>,
  head: string,
  tier: ReviewTier,
  phase: string,
): ConditionRow[] {
  const rows: ConditionRow[] = [];
  const refusals = unclaimedRefusalFaults(review, head);
  if (tier === "single") {
    const single = judgeSingleApproves(review.forHead);
    rows.push({
      id: "condition-2",
      clause: "DR-0063 single: the one hazard review of this head approves",
      status: single.ok && refusals.length === 0 ? "green" : "red",
      head,
      sentence: [...(single.ok ? [] : [single.sentence]), ...refusals].join("; ") || single.sentence,
    });
    return rows;
  }
  const families = judgeFamilies(review.count.counted, review.families, review.records);
  rows.push({
    id: "condition-1",
    clause: "DR-0062 pair: two kernel-launched reviews of this head on distinct observed families, or the declared single-family exception",
    status: families.ok ? "green" : "red",
    head,
    sentence: families.sentence,
  });
  const faults = [
    ...review.count.counted.flatMap((entry) =>
      verdictApprovalFaults({ path: entry.verdictPath, record: entry.verdict }, phase, entry.record.head).map(
        (fault) => `${fault.pointer} ${fault.message}`,
      ),
    ),
    ...refusals,
  ];
  rows.push({
    id: "condition-2",
    clause: "DR-0012:23 no unresolved finding at medium or above",
    status: faults.length === 0 && review.count.counted.length > 0 ? "green" : "red",
    head,
    sentence:
      faults.length > 0
        ? faults.join(" | ")
        : review.count.counted.length === 0
          ? "no review is counted for this head, so nothing approves it"
          : `the ${String(review.count.counted.length)} counted verdict(s) read APPROVE and carry no finding at ${BLOCKING_SEVERITIES.join(", ")}`,
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

/** `--head` as a full lowercase sha when it names a commit here, else as given. */
function resolveHeadFlag(contextDirectory: string, value: string): string {
  if (/^[0-9a-fA-F]{40}$/.test(value)) {
    return value.toLowerCase();
  }
  const resolved = spawnSync("git", ["rev-parse", "--verify", "--quiet", "--end-of-options", `${value}^{commit}`], {
    cwd: contextDirectory,
    encoding: "utf8",
  });
  if (resolved.error === undefined && resolved.status === 0) {
    const sha = (resolved.stdout ?? "").trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(sha)) {
      return sha;
    }
  }
  return value.toLowerCase();
}

export async function runGate(flags: Flags): Promise<number> {
  const startedAt = now();
  const resultPath = flags.result as string;
  const contextDirectory = absolute(flags.context ?? process.cwd());
  /* M5-P3: A SYMBOLIC --head IS RESOLVED BEFORE IT IS LOWERCASED. The M4-P12
     line lowercased the flag outright, which is right for the forty-hex sha CI
     passes and wrong for `HEAD`, which became `head` and named nothing, so the
     runner's own documented invocation (`--head HEAD`) reported the diff as a
     bad revision. A value that resolves to a commit here is replaced by that
     commit's full sha; one that does not is kept as given, because the M4-P12
     comment below is still true that `--head` need not be an object in this
     checkout. */
  const head = resolveHeadFlag(contextDirectory, flags.head as string);
  const phase = (flags.phase as string).toLowerCase();
  const apiBase = (flags["api-base"] ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const shared = { gate: GATE_ID, unitLabel: UNIT_LABEL, startedAt };
  /* M5-P3: the token is read from the variable the COMMAND names, never from a
     name this module chooses (see requestJson). */
  const tokenVariable = flags["token-env"];
  const token = tokenVariable === undefined ? undefined : process.env[tokenVariable];

  /* M5-P3: THE BUDGET, AND THE REVIEW EVIDENCE, BEFORE THE NETWORK. With
     `--base` (which the registry now declares, so every runner invocation
     supplies it) the diff decides what review is owed (DR-0063 since M6-P2):
     `pair` owes two approving hazard reviews, `single` owes one, and there is
     no tier that owes none. Fewer admitted verdicts than the tier requires is
     RED with the missing count, and that is decided from the repository alone:
     whether an API answers must not decide whether an unreviewed change can
     merge (criterion p3-missing-is-red). Without `--base` the tier is unknown
     and is taken as `pair`, fail closed, in the M4-P12 order, which is what
     keeps a hand run by the old command meaning what it meant. */
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
    const read = readReviewCorpus(contextDirectory, head, phase, budget.mergeBase);
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
            `DR-0063 ${budget.tier} at head ${head}, phase ${phase}: ${missingReviewsSentence(budget, review.forHead.length, head)}; ` +
            "the review rows, CI, scope, arbitration and the branch-protection encoding were NOT evaluated, " +
            "because a change without the review its tier owes is refused whatever they would say",
        },
        rows,
      );
    }
    rows.push(...reviewRows(review, head, budget.tier, phase));
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
            `DR-0063 ${budget.tier} at head ${head}, phase ${phase}: ` +
            rows.map((row) => `${row.id}=${row.status}`).join(" ") +
            "; the review evidence already refuses this merge, so CI, scope, arbitration and the " +
            "branch-protection encoding were NOT evaluated and nothing about them is asserted",
        },
        rows,
      );
    }
  }

  /* The tier the rest of the run is judged by. Without `--base` no diff was
     classified, so it is `pair`, fail closed. */
  const tier: ReviewTier = budget === undefined ? "pair" : budget.tier;

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
  const probe = readJsonBody(probeUrl, await requestJson(probeUrl, token));
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
    const read = readReviewCorpus(contextDirectory, head, phase);
    if (!read.ok) {
      return emit(
        resultPath,
        { ...shared, status: "error", units: 0, endedAt: now(), detail: read.reason },
        [],
      );
    }
    review = read;

    if (review.forHead.length === 0) {
      /* THE REFUSALS ARE READ BEFORE THIS ARM IS DECIDED (M6-P5 fix round 5,
         CR-M6P5A-10). A committed verdict that refuses this head, which no
         counted record names, says a merge was proposed here and refused, so
         "no merge is being proposed" would be false. It is red, with a
         condition-2 row naming each refusal in the sentences the `--base`
         arm prints. */
      const refusals = unclaimedRefusalFaults(review, head);
      if (refusals.length > 0) {
        rows.push(selectionRow(review, head, budget));
        rows.push({
          id: "condition-2",
          clause: "DR-0012:23 no unresolved finding at medium or above",
          status: "red",
          head,
          sentence: refusals.join(" | "),
        });
        return emit(
          resultPath,
          {
            ...shared,
            status: "red",
            units: rows.length,
            endedAt: now(),
            detail:
              `DR-0063 ${tier} at head ${head}, phase ${phase}: no kernel review record counts a verdict at this head, ` +
              `and ${String(refusals.length)} committed verdict(s) refuse it: ${refusals.join(" | ")}; ` +
              "CI, scope, arbitration and the branch-protection encoding were NOT evaluated, because the " +
              "committed review evidence already refuses this merge",
          },
          rows,
        );
      }
      /* SC-011: the not-applicable arm of the M4-P12 order, and it carries an
         EVALUATED precondition rather than a silence. A head with no counted
         review and no committed refusal is not a merge waiting on six
         conditions. REACHABLE ONLY WITHOUT `--base` since M5-P3: with it, a
         change of either DR-0063 tier and no counted review is red above
         (M6-P2). */
      const precondition: PreconditionRecord = {
        id: PRECONDITION_ID,
        met: false,
        reason:
          `no committed kernel review record counts a verdict for phase ${phase} at head ${head}, and no ` +
          "committed verdict refuses that head, so no merge is being proposed at this head and DR-0012's " +
          "conditions have no subject",
        evidence: [
          `${String(review.read)} committed verdict document(s) and ` +
            `${String(review.records.length + review.invalidRecords.length)} review record(s) were read and examined`,
          `head under evaluation: ${head}`,
          /* Every record and verdict that did not count is named with its reason. */
          ...describeCount(review, head),
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
    rows.push(...reviewRows(review, head, tier, phase));
  }

  const checkRunsUrl = `${apiBase}/repos/${slug}/commits/${head}/check-runs`;
  const checkRuns = readJsonBody(checkRunsUrl, await requestJson(checkRunsUrl, token));
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

  /* ARBITRATION IS THE PAIR TIER'S ALONE (DR-0063): one review has nothing to
     arbitrate between, so a `single` change carries no condition-6 row. */
  if (tier === "pair") {
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
      clause: "DR-0063 pair: a recorded arbitration over BOTH verdicts at this head",
      status: arbitration.ok ? "green" : "red",
      head,
      sentence: arbitration.sentence,
    });
  }

  const rulesets = await readRulesets(apiBase, slug, token);
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
        `DR-0063 ${tier} at head ${head}, phase ${phase}: ` +
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

/**
 * `--precondition [--context <dir>]`: the registry's `command-exit-zero`
 * precondition for this gate (M6-P5). Exit 0 when the context resolves a commit,
 * because then the gate, given `--base` and `--head`, decides from the diff what
 * review is owed; exit 1 when there is no commit to audit.
 */
export function preconditionMain(argv: string[]): number {
  const context = argv.length === 2 && argv[0] === "--context" ? argv[1] : argv.length === 0 ? "." : undefined;
  if (context === undefined) {
    return usageError("--precondition takes only an optional --context <dir>");
  }
  const source = resolveCorpusSource(context);
  if (source.kind !== "commit") {
    process.stdout.write(`${GATE_ID}: no commit resolves in ${context}, so there is no change to audit: ${source.reason}\n`);
    return 1;
  }
  process.stdout.write(`${GATE_ID}: ${context} resolves ${source.ref} to ${source.refSha}\n`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--precondition") {
    return preconditionMain(argv.slice(1));
  }
  const flags = parseFlags(argv);
  if (flags === undefined) {
    return usageError();
  }
  const missing = (["result", "head", "phase"] as const).filter((name) => flags[name] === undefined);
  if (missing.length > 0) {
    return usageError(`${GATE_ID} requires ${missing.map((name) => `--${name}`).join(" ")}`);
  }
  if (flags["token-env"] !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(flags["token-env"])) {
    return usageError(`--token-env takes an environment variable NAME, and ${flags["token-env"]} is not one`);
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
