import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  boundAtMergeBase,
  declaresNoHead,
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
 * gives a verdict no id of its own; its required keys are kind, phase, head,
 * verdict, produced-by, framing, findings and deviations-judged (M6-P2 dropped
 * criteria and review-contract). The existing arbitration documents in `delivery/review/`
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
 * The `single` tier's approval row (DR-0063): every admitted review of this
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
    faults.push("no review is admitted for this head, so nothing approves it");
  }
  if (faults.length > 0) {
    return { ok: false, sentence: faults.join("; ") };
  }
  return {
    ok: true,
    sentence:
      `every admitted review of this head approves (${seen.join(", ")}); under DR-0063's single tier a ` +
      "finding blocks through the reviewer's verdict word, so severities are reported and not gated",
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
  base: string | undefined,
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
      /* The base goes in so a head-less sibling is judged on its provenance
         (kernel 0.2.1 fix round 2): history only if it is on the base. */
      const outcome = check.run(verdict.record, contextDirectory, { base });
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
    const sides = input.sides.get(projectPath);
    if (sides === undefined) {
      return { tier: "pair", reason: "the charter changed and its two sides were not read, fail closed" };
    }
    if (sides.base === undefined || sides.head === undefined) {
      return {
        tier: "pair",
        reason: `the charter is ${sides.base === undefined ? "absent at the merge base" : "deleted at the head"}, so the runtime-set declaration changed`,
      };
    }
    const before = runtimeSetBlockText(sides.base, `${RUNTIME_SET_CHARTER} at the merge base`);
    const after = runtimeSetBlockText(sides.head, `${RUNTIME_SET_CHARTER} at the head`);
    if (!before.ok || !after.ok) {
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
  const declaration: RuntimeSetReading =
    charterBlob.kind === "error"
      ? { kind: "invalid", reason: charterBlob.reason }
      : readRuntimeSet(charterBlob.kind === "read" ? charterBlob.body : undefined, charterLabel);

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
 * The id of the precondition a `single` change reports unmet at
 * `check-dual-review`, whose question (two decorrelated reviews) is the pair
 * tier's. merge-preconditions checks the single tier's one review itself.
 */
export const BUDGET_PRECONDITION_ID = "review-budget-requires-pair-review";

/** The evaluated, unmet precondition a `single` change carries at the pair check. */
export function budgetPrecondition(budget: ReviewBudget): PreconditionRecord {
  return {
    id: BUDGET_PRECONDITION_ID,
    met: false,
    reason:
      `${describeBudget(budget)}, so DR-0063 owes it ${String(REQUIRED_VERDICTS.single)} hazard review and ` +
      "not the pair this gate compares; merge-preconditions requires the single review",
    evidence: [
      `tier: ${budget.tier}`,
      "verdict documents: not read here, because the pair rule does not apply to this tier",
      ...budget.paths.slice(0, 50).map((entry) => `${entry.tier}: ${entry.path} (${entry.reason})`),
      ...(budget.paths.length > 50 ? [`and ${String(budget.paths.length - 50)} more path(s)`] : []),
    ],
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
    `${budget.tier === "pair" ? "reviews, distinct on produced-by," : "review"} for the commit under audit ` +
    `${auditedHead}; ${String(admitted)} of ${String(required)} are admitted and ${String(missing)} missing. ` +
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

function readReviewCorpus(contextDirectory: string, head: string, mergeBase?: string): ReviewCorpus {
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
    /* KERNEL 0.2.1 (DR-0053, DR-0054). A verdict with NO head key is excluded
       BY NAME before any relation is computed. Until 0.2.1 it reached
       `relateDeclaredHead` with the empty string, failed to resolve, and was
       excluded with the sentence "declares head , which does not resolve",
       which named the wrong fact. The schema no longer requires the field, so
       absence is now a well-formed document written before the field existed
       and the ADMISSION rule is here: it is never admitted, so on a dual-tier
       change it cannot count toward the two reviews condition 1 needs. */
    if (declaresNoHead(entry.record)) {
      excluded.push({ path: entry.path, declared: "", relation: { kind: "no-head" } });
      continue;
    }
    /* KERNEL 0.2.1 (DR-0055): admission does not read the stamp, exactly as
       in `partitionByAuditedHead`, so the two gates cannot disagree about a
       stamp. Every rule here applies to every verdict, stamped or not. */
    const declared = String(entry.record["head"] ?? "").toLowerCase();
    /* M6-P2 FIX ROUND 1 (CR-M6P2A-01, CR-M6P2B-01): ANCESTRY IS BOUNDED AT THE
       MERGE BASE. With `--base`, a verdict whose declared head the merge base
       already contains reviewed content on the base, not this change, and is
       excluded by name as `on-the-base`. No phase match (M6-P5). */
    const relation = boundAtMergeBase(contextDirectory, declared, mergeBase, relateDeclaredHead(contextDirectory, declared, head));
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
     the not-applicable arm instead). With `--base` it is RED below the tier's
     required count (DR-0063: two for pair, one for single), and the missing
     count is in the sentence. */
  const short = budget !== undefined && review.forHead.length < REQUIRED_VERDICTS[budget.tier];
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

/**
 * The review rows, which need nothing but the committed verdicts, PER TIER
 * (DR-0063). `pair`: condition 1 is the decorrelation check (distinct
 * `produced-by` only; the framing and contract comparisons were dropped with the
 * criteria contract, DR-0064) and condition 2 is the pair-approves check.
 * `single`: one row, the single review approves; no decorrelation row, because
 * one review has nothing to be decorrelated from. The criteria-walked row that
 * stood here (DR-0012 condition 3) is gone: DR-0064 supersedes it.
 */
function reviewRows(
  review: Extract<ReviewCorpus, { ok: true }>,
  head: string,
  contextDirectory: string,
  base: string | undefined,
  tier: ReviewTier,
): ConditionRow[] {
  const rows: ConditionRow[] = [];
  if (tier === "single") {
    const single = judgeSingleApproves(review.forHead);
    rows.push({
      id: "condition-2",
      clause: "DR-0063 single: the one hazard review of this head approves",
      status: single.ok ? "green" : "red",
      head,
      sentence: single.sentence,
    });
    return rows;
  }
  const condition1 = runRegisteredCheck(DECORRELATION_CHECK_ID, review.forHead, contextDirectory, base);
  rows.push({
    id: "condition-1",
    clause: "DR-0063 pair: two hazard reviews of this head, distinct on produced-by",
    status: condition1.status,
    head,
    sentence: condition1.sentence,
  });

  const condition2 = runRegisteredCheck(PAIR_CHECK_ID, review.forHead, contextDirectory, base);
  rows.push({
    id: "condition-2",
    clause: "DR-0012:23 no unresolved finding at medium or above",
    status: condition2.status,
    head,
    sentence: condition2.sentence,
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
    const read = readReviewCorpus(contextDirectory, head, budget.mergeBase);
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
    rows.push(...reviewRows(review, head, contextDirectory, flags.base, budget.tier));
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
         WITHOUT `--base` since M5-P3: with it, a change of either DR-0063
         tier and no verdict is red above (M6-P2). */
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
    rows.push(...reviewRows(review, head, contextDirectory, flags.base, tier));
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

export async function main(argv: string[]): Promise<number> {
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
