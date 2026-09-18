import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { pathsIdentifySameObject } from "../path-identity.ts";
import {
  loadCommittedVerdicts,
  missingRegimeDocument,
  readReviewFamilies,
  registeredChecks,
  resolveCorpusSource,
} from "../checks.ts";
import type { DerivedCheck } from "../checks.ts";
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
 *                                        exactly one place here, the
 *                                        NO-VERDICT-AT-THIS-HEAD arm, and it
 *                                        carries an evaluated precondition
 *                                        record (SC-011).
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
  "[--evidence <dir>] [--context <dir>] [--repo <owner/name>] [--api-base <url>] " +
  "[--scope-record <file>] [--arbitrations <dir>]";

interface Flags {
  result?: string;
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

export async function runGate(flags: Flags): Promise<number> {
  const startedAt = now();
  const resultPath = flags.result as string;
  const head = (flags.head as string).toLowerCase();
  const phase = (flags.phase as string).toLowerCase();
  const contextDirectory = absolute(flags.context ?? process.cwd());
  const apiBase = (flags["api-base"] ?? DEFAULT_API_BASE).replace(/\/+$/, "");
  const slug = flags.repo ?? slugFromGit(contextDirectory) ?? "";
  const shared = { gate: GATE_ID, unitLabel: UNIT_LABEL, startedAt };

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

  /* THE PROBE COMES FIRST (plan step 1 and criterion 2). An unreachable API is
     `error` with units 0 and a reason naming the failure, and the test asserts
     the STATUS WORD rather than the detail string, because the mutant this arm
     exists against is a request wrapped in a catch that returns "unknown" and
     reports green. CLAUDE.md standing warning 6 says REST reachability here is
     a thing to PROBE at the start of a run that depends on it, in either
     direction, so this is the probe and not an assumption. */
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

  /* THE CORPUS, READ THROUGH THE SHIPPED PRIMITIVES (plan step 6). Every
     refusal below is `error` rather than red, and each is the one
     `scripts/check-dual-review.mjs` already makes at the same layer: a merge
     gate that cannot establish the regime, cannot read the DR-0038 declaration,
     or cannot examine a document that looks like a verdict has NOT reached a
     verdict (M2-C-3). */
  const source = resolveCorpusSource(contextDirectory);
  const regime = missingRegimeDocument(contextDirectory, source);
  if (regime !== undefined) {
    return emit(
      resultPath,
      { ...shared, status: "error", units: 0, endedAt: now(), detail: regime.reason },
      [],
    );
  }
  const families = readReviewFamilies(contextDirectory);
  if (families.kind === "error") {
    return emit(
      resultPath,
      { ...shared, status: "error", units: 0, endedAt: now(), detail: families.reason },
      [],
    );
  }
  const corpus = loadCommittedVerdicts(contextDirectory, source);
  if (!corpus.ok) {
    return emit(
      resultPath,
      { ...shared, status: "error", units: 0, endedAt: now(), detail: corpus.reason },
      [],
    );
  }
  if (corpus.unexaminable.length > 0) {
    return emit(
      resultPath,
      {
        ...shared,
        status: "error",
        units: 0,
        endedAt: now(),
        detail:
          `${String(corpus.unexaminable.length)} document(s) could not be examined, so whether a ` +
          `review refusing this head is among them is unknown: ` +
          corpus.unexaminable.map((diagnostic) => diagnostic.message).join("; "),
      },
      [],
    );
  }

  const forHead: VerdictForHead[] = corpus.verdicts
    .filter((entry) => String(entry.record["head"] ?? "").toLowerCase() === head)
    .map((entry) => ({ path: entry.path, record: entry.record }));

  if (forHead.length === 0) {
    /* SC-011: the ONE not-applicable arm, and it carries an EVALUATED
       precondition rather than a silence. A head with no verdict naming it is
       not a merge waiting on six conditions. */
    const precondition: PreconditionRecord = {
      id: PRECONDITION_ID,
      met: false,
      reason:
        `no committed verdict document names head ${head}, so no merge is being proposed at this ` +
        "head and DR-0012's conditions have no subject",
      evidence: [
        `${String(corpus.verdicts.length)} committed verdict document(s) were read and examined`,
        `head under evaluation: ${head}`,
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

  const rows: ConditionRow[] = [];

  const condition1 = runRegisteredCheck(DECORRELATION_CHECK_ID, forHead, contextDirectory);
  rows.push({
    id: "condition-1",
    clause: "DR-0012:22 two decorrelated clean-room reviews of this head",
    status: condition1.status,
    head,
    sentence: condition1.sentence,
  });

  const condition2 = runRegisteredCheck(PAIR_CHECK_ID, forHead, contextDirectory);
  rows.push({
    id: "condition-2",
    clause: "DR-0012:23 no unresolved finding at medium or above",
    status: condition2.status,
    head,
    sentence: condition2.sentence,
  });

  const condition3 = judgeCriteriaWalked(forHead);
  rows.push({
    id: "condition-3",
    clause: "DR-0012:24 the acceptance criteria were the reviewers' contract",
    status: condition3.ok ? "green" : "red",
    head,
    sentence: condition3.sentence,
  });

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
    const judged = judgeCheckRuns(
      head,
      Array.isArray(listed) ? (listed as CheckRun[]) : [],
      REQUIRED_CHECK_CONTEXT,
    );
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
    forHead.map((verdict) => verdict.path),
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
