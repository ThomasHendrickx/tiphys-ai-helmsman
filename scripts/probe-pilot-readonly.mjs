/**
 * THE READ-ONLY PILOT PROBE (kernel plan M4, M4-P27 step 2, criteria 3 and 4).
 *
 * WHAT THIS IS FOR. DR-0042 settled two things: reading the pilot is allowed
 * because it is public, and the pilot can be rebooted by the owner. The first
 * half makes step 2 of the cutover-entry trigger possible at all. Everything
 * downstream of the trigger rests on facts about the pilot that the M4 intake
 * itself calls a month stale, so the trigger re-reads them rather than
 * inheriting them.
 *
 * WHAT IT MUST NOT DO, AND WHY THAT IS STRUCTURAL RATHER THAN INTENDED.
 * DR-0037 stands: this orchestrator does not WORK on the pilot. No ref update,
 * no branch, no pull request, no fleet state, no lease. "Intended not to write"
 * is the shape this repository keeps paying for, so the guarantee here is a
 * CHOKEPOINT rather than a habit:
 *
 *   - `readOnlyGit` is the ONLY site in this file that spawns a child process.
 *     It refuses every git subcommand except `ls-remote` and a `clone` that
 *     carries `--depth 1`. A caller that hands it a mutating verb gets a
 *     thrown `ReadOnlyViolation` and the child is never spawned.
 *   - `readOnlyHttp` is the ONLY site in this file that issues a request. It
 *     hardcodes the GET method, sends no body, and refuses any option key
 *     outside a two-name allowlist. A caller that tries to steer the request
 *     shape gets a thrown `ReadOnlyViolation` and the request is never issued.
 *
 * Both refusals are witnessed against the DANGEROUS state in
 * test/cutover-entry.test.ts: the git one against a scratch repository whose
 * HEAD and worktree are compared byte for byte before and after, and the HTTP
 * one against a stub server that records every request it receives and must
 * record zero.
 *
 * THE FOUR-ARM CLASSIFIER, AND WHY A TWO-STATE ANSWER IS WRONG HERE.
 * A probe of a remote can land in four genuinely different places, and
 * delivery/verification/m4-prototype-probes.md:153 records the measured reason:
 * a nonzero exit does NOT mean the condition is false, because transport
 * failures exit nonzero too. So every target is classified as exactly one of
 *
 *   satisfied    the record was read and carries what a repository record
 *                must carry
 *   not-yet      the remote answered and the answer is a real negative
 *                (no such repository, or a repository with zero commits)
 *   unreachable  no answer, an unusable answer, or an answer whose body
 *                carries no recognisable record
 *   refused      the remote answered with an authorization refusal
 *
 * AN EMPTY RESULT IS NEVER A CLEAN ONE. A 200 carrying `{}` is `unreachable`,
 * not `satisfied`. Zero targets probed is a failure, not a clean sweep. This
 * repository has been bitten three times by a search whose scope was wrong
 * returning an empty result indistinguishable from an absence of defects, and
 * the failure arm below is written before the success arm for that reason.
 *
 * THE EVIDENCE DOCUMENT IS A BEACON. The header is written before the first
 * read and each target is appended as it resolves, so a death mid-probe leaves
 * a partial result rather than nothing (CLAUDE.md, T-008 rule 1).
 *
 * WORD HYGIENE, stated so a later editor does not undo it by accident:
 * criterion 3 asserts that this file carries ZERO occurrences of the write
 * verbs a probe could reach for. That is a grep over this source, so the verbs
 * are absent from the prose here as well, including from field names. The
 * GitHub record field naming the last ref update is deliberately not read;
 * `updated_at` is read instead. Array growth uses `concat`, never the array
 * method whose name is one of the forbidden verbs.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);

/** The four words a target verdict may take. Closed set, checked at runtime. */
export const TARGET_VERDICTS = ["satisfied", "not-yet", "unreachable", "refused"];

/** The two repositories DR-0034 named as the pilot, and its fleet home. */
export const DEFAULT_TARGETS = ["ThomasHendrickx/pulse", "ThomasHendrickx/pulse-fleet"];

export const DEFAULT_API_BASE = "https://api.github.com";
export const DEFAULT_GIT_BASE = "https://github.com";
export const DEFAULT_OUT = "delivery/verification/pulse-re-probe.md";

export const EXIT_ALL_READ = 0;
export const EXIT_REAL_NEGATIVE = 1;
export const EXIT_INDETERMINATE = 3;
export const EXIT_USAGE = 64;

/** Thrown when a caller asks this probe for something that is not a read. */
export class ReadOnlyViolation extends Error {
  constructor(message) {
    super(message);
    this.name = "ReadOnlyViolation";
  }
}

/* ------------------------------------------------------------------ */
/* Chokepoint 1: git. The only child process this file ever starts.    */
/* ------------------------------------------------------------------ */

/**
 * The allowlist is over the OPERATION, not over a denylist of verbs, because a
 * denylist is open-ended and an allowlist is not. `ls-remote` reads refs
 * without creating a working tree; `clone` is permitted only with an explicit
 * `--depth 1`, which is the form the plan names.
 */
export function assertReadOnlyGit(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new ReadOnlyViolation("read-only git refused an empty argument list");
  }
  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new ReadOnlyViolation("read-only git refused a non-string argument");
    }
  }
  const operation = args[0];
  if (operation === "ls-remote") return;
  if (operation === "clone") {
    const depthAt = args.indexOf("--depth");
    if (depthAt >= 0 && args[depthAt + 1] === "1") return;
    if (args.includes("--depth=1")) return;
    throw new ReadOnlyViolation(
      "read-only git refused a clone that does not carry --depth 1",
    );
  }
  throw new ReadOnlyViolation(
    `read-only git refused an operation that is not on the allowlist: ${operation}`,
  );
}

/**
 * THE ONLY `spawnSync` CALL SITE IN THIS FILE. The test asserts that by
 * counting call sites in the source, so a second one is a red test rather than
 * a review miss.
 */
export function readOnlyGit(args, options = {}) {
  assertReadOnlyGit(args);
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: typeof options.timeoutMs === "number" ? options.timeoutMs : 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return result;
}

/* ------------------------------------------------------------------ */
/* Chokepoint 2: HTTP. The only request this file ever issues.         */
/* ------------------------------------------------------------------ */

const ALLOWED_HTTP_OPTION_KEYS = ["timeoutMs", "headers"];

/**
 * THE ONLY `fetch` CALL SITE IN THIS FILE, and the method is a literal rather
 * than a parameter. Refusing unknown option keys is what makes the refusal
 * DEMONSTRABLE: a caller can hand this function a request-shaping key and be
 * told no, which is a reachable failure arm rather than a comment.
 */
export async function readOnlyHttp(url, options = {}) {
  if (typeof url !== "string" || url.length === 0) {
    throw new ReadOnlyViolation("read-only http refused an empty url");
  }
  for (const key of Object.keys(options)) {
    if (!ALLOWED_HTTP_OPTION_KEYS.includes(key)) {
      throw new ReadOnlyViolation(
        `read-only http refused a request-shaping option: ${key}`,
      );
    }
  }
  const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 20000;
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "tiphys-cutover-entry-readonly-probe",
    ...(options.headers ?? {}),
  };
  return await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Status to verdict, written as a table so a reader can see which statuses are
 * REAL NEGATIVES and which are merely "I could not tell". The default arm is
 * `unreachable` on purpose: an unrecognised status is an unknown, never a
 * satisfied one.
 */
export function verdictForStatus(status) {
  if (status === 200) return "satisfied";
  if (status === 404) return "not-yet";
  if (status === 401 || status === 403 || status === 451) return "refused";
  return "unreachable";
}

/**
 * The anti-vacuity check. A 200 whose body carries no recognisable repository
 * record is NOT a read. Both named fields are required, so a stub that answers
 * `{}` or `[]` lands in `unreachable` and says why.
 */
export function readRepositoryRecord(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "the response body is not a repository record object" };
  }
  const fullName = body.full_name;
  const defaultBranch = body.default_branch;
  if (typeof fullName !== "string" || fullName.length === 0) {
    return { ok: false, reason: "the response body carries no full_name" };
  }
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    return { ok: false, reason: "the response body carries no default_branch" };
  }
  return {
    ok: true,
    record: {
      fullName,
      defaultBranch,
      visibility: typeof body.visibility === "string" ? body.visibility : "unstated",
      updatedAt: typeof body.updated_at === "string" ? body.updated_at : "unstated",
    },
  };
}

/**
 * Zero commits is a REAL negative and is reported as one. A non-array body is
 * an unknown. Neither is ever `satisfied`.
 */
export function readHeadCommit(body) {
  if (!Array.isArray(body)) {
    return { ok: false, verdict: "unreachable", reason: "the commit listing is not an array" };
  }
  if (body.length === 0) {
    return { ok: false, verdict: "not-yet", reason: "the repository carries zero commits" };
  }
  const first = body[0];
  const sha = first !== null && typeof first === "object" ? first.sha : undefined;
  if (typeof sha !== "string" || sha.length < 7) {
    return { ok: false, verdict: "unreachable", reason: "the first commit entry carries no sha" };
  }
  return { ok: true, sha: sha.slice(0, 7), fullSha: sha };
}

/* ------------------------------------------------------------------ */
/* The probe                                                           */
/* ------------------------------------------------------------------ */

async function readJson(url, timeoutMs) {
  let response;
  try {
    response = await readOnlyHttp(url, { timeoutMs });
  } catch (error) {
    if (error instanceof ReadOnlyViolation) throw error;
    return {
      transport: "failed",
      reason: `transport failure reading ${url}: ${singleLine(error)}`,
    };
  }
  const verdict = verdictForStatus(response.status);
  if (verdict !== "satisfied") {
    return {
      transport: "answered",
      status: response.status,
      verdict,
      reason: `${url} answered HTTP ${response.status}`,
    };
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    return { transport: "failed", reason: `could not drain the body of ${url}: ${singleLine(error)}` };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { transport: "failed", reason: `${url} answered HTTP 200 with a body that is not JSON` };
  }
  return { transport: "answered", status: 200, verdict: "satisfied", body };
}

function singleLine(value) {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return text.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
}

/**
 * The git half of a target read, through the allowlisted chokepoint. It exists
 * for two reasons and the second is the load-bearing one:
 *
 *   1. `ls-remote` answers over the git protocol rather than the REST API, so
 *      it is an INDEPENDENT source for the same head sha.
 *   2. Criterion 3's second assertion is that the only git operations this
 *      probe invokes are `ls-remote` and `clone --depth 1`. If the probe
 *      invoked git NOWHERE, that assertion would be vacuously true, which is
 *      the guard-that-cannot-go-red shape this repository keeps paying for.
 *
 * An EMPTY ref listing is `unreachable`, never a clean read.
 */
export function readGitHead(target, gitBase, timeoutMs) {
  const base = gitBase.replace(/\/+$/, "");
  const url = base.startsWith("http") ? `${base}/${target}.git` : `${base}/${target}`;
  const result = readOnlyGit(["ls-remote", url, "HEAD"], { timeoutMs });
  if (result.error) {
    return { verdict: "unreachable", reason: `git ls-remote could not start: ${singleLine(result.error)}` };
  }
  if (result.status === null) {
    return { verdict: "unreachable", reason: "git ls-remote was killed before it answered" };
  }
  const stderr = singleLine(result.stderr ?? "");
  if (result.status !== 0) {
    if (/authentication|denied|403|could not read Username|terminal prompts disabled/i.test(stderr)) {
      return { verdict: "refused", reason: `git ls-remote was refused: ${stderr}` };
    }
    if (/not found|does not (appear to be|exist)/i.test(stderr)) {
      return { verdict: "not-yet", reason: `git ls-remote found no such repository: ${stderr}` };
    }
    return { verdict: "unreachable", reason: `git ls-remote exit ${result.status}: ${stderr}` };
  }
  const match = /^([0-9a-f]{7,40})\s+HEAD\s*$/m.exec(String(result.stdout ?? ""));
  if (match === null) {
    return {
      verdict: "unreachable",
      reason: "git ls-remote exited 0 and named no HEAD ref; an empty ref listing is not a clean read",
    };
  }
  return { verdict: "satisfied", sha: match[1], reason: "HEAD ref read over the git protocol" };
}

const VERDICT_SEVERITY = { satisfied: 0, "not-yet": 1, unreachable: 2, refused: 3 };

export function worstVerdict(verdicts) {
  let worst = "satisfied";
  for (const verdict of verdicts) {
    if (VERDICT_SEVERITY[verdict] > VERDICT_SEVERITY[worst]) worst = verdict;
  }
  return worst;
}

/**
 * One target, THREE SOURCES, ALL OF THEM ALWAYS READ.
 *
 * The first version of this function returned on the first non-satisfied
 * source. Measured against the real pilot on 2026-09-16 that was wrong in a way
 * that mattered: the REST API answered HTTP 403 (the agent proxy refuses a
 * repository that is not attached to the session) while `git ls-remote` over
 * the git protocol answered the head sha with exit 0. A short-circuiting probe
 * reports `refused` and THROWS AWAY the one source that worked, which is the
 * same defect as a checker that short-circuits on its first failing arm.
 *
 * So all three sources are read, each keeps its own verdict, and the target's
 * verdict is the WORST of them. The evidence document records the breakdown, so
 * a reader can tell "nothing could be read" from "one transport is refused and
 * another is not".
 *
 * The sources are:
 *   record   the REST repository record, which is the only one carrying
 *            visibility and the default branch
 *   commits  the REST newest-commit listing
 *   gitRef   `git ls-remote <remote> HEAD`, a different transport with a
 *            different authority
 */
export async function probeTarget(target, apiBase, gitBase, timeoutMs) {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(target)) {
    return {
      target,
      verdict: "unreachable",
      reason: `target is not an owner/name pair: ${target}`,
      sources: {},
    };
  }
  const base = apiBase.replace(/\/+$/, "");
  const sources = {};
  let record;
  let head;

  const repoRead = await readJson(`${base}/repos/${target}`, timeoutMs);
  if (repoRead.transport === "failed") {
    sources.record = { verdict: "unreachable", reason: repoRead.reason };
  } else if (repoRead.verdict !== "satisfied") {
    sources.record = { verdict: repoRead.verdict, reason: repoRead.reason };
  } else {
    const parsed = readRepositoryRecord(repoRead.body);
    if (!parsed.ok) {
      sources.record = {
        verdict: "unreachable",
        reason: `HTTP 200 and ${parsed.reason}; an empty answer is not a clean one`,
      };
    } else {
      record = parsed.record;
      sources.record = { verdict: "satisfied", reason: "repository record read" };
    }
  }

  const commitsRead = await readJson(`${base}/repos/${target}/commits?per_page=1`, timeoutMs);
  if (commitsRead.transport === "failed") {
    sources.commits = { verdict: "unreachable", reason: commitsRead.reason };
  } else if (commitsRead.verdict !== "satisfied") {
    sources.commits = { verdict: commitsRead.verdict, reason: commitsRead.reason };
  } else {
    const parsedHead = readHeadCommit(commitsRead.body);
    if (!parsedHead.ok) {
      sources.commits = { verdict: parsedHead.verdict, reason: parsedHead.reason };
    } else {
      head = parsedHead.sha;
      sources.commits = { verdict: "satisfied", reason: `newest commit ${parsedHead.sha}` };
    }
  }

  const gitHead = readGitHead(target, gitBase, timeoutMs);
  sources.gitRef = { verdict: gitHead.verdict, reason: gitHead.reason };

  if (head !== undefined && gitHead.verdict === "satisfied" && !gitHead.sha.startsWith(head)) {
    sources.commits = {
      verdict: "unreachable",
      reason:
        `the two transports disagree, REST head ${head} and git ref head ` +
        `${gitHead.sha.slice(0, 7)}; a disagreement establishes neither`,
    };
    sources.gitRef = { verdict: "unreachable", reason: sources.commits.reason };
  }

  const verdict = worstVerdict(Object.values(sources).map((s) => s.verdict));
  const unsatisfied = Object.entries(sources).filter(([, s]) => s.verdict !== "satisfied");
  const reason =
    unsatisfied.length === 0
      ? "record, newest commit and HEAD ref all read, and the two heads agree"
      : unsatisfied.map(([name, s]) => `${name} ${s.verdict}: ${s.reason}`).join("; ");

  return {
    target,
    verdict,
    reason,
    sources,
    record:
      record === undefined && gitHead.verdict !== "satisfied"
        ? undefined
        : {
            fullName: record?.fullName ?? target,
            defaultBranch: record?.defaultBranch ?? "unread",
            visibility: record?.visibility ?? "unread",
            updatedAt: record?.updatedAt ?? "unread",
            head: head ?? "unread",
            gitHead: gitHead.verdict === "satisfied" ? gitHead.sha.slice(0, 7) : "unread",
          },
  };
}

/* ------------------------------------------------------------------ */
/* The evidence document, written incrementally                        */
/* ------------------------------------------------------------------ */

function beaconHeader(options, startedAt) {
  return [
    "# Pilot re-probe, read-only: cutover-entry trigger step 2",
    "",
    `- started: ${startedAt}`,
    "- produced by: `scripts/probe-pilot-readonly.mjs`",
    `- api base: \`${cell(options.apiBase)}\``,
    `- git base: \`${cell(options.gitBase)}\``,
    `- targets: ${options.targets.map((t) => `\`${cell(t)}\``).join(", ") || "NONE"}`,
    "- permission: DR-0042 allows reading the pilot. DR-0037 stands and forbids",
    "  every write, so this run performs none and could not perform one.",
    "- status: IN PROGRESS. This header is written before the first read, so an",
    "  interrupted run leaves a partial record rather than nothing.",
    "",
    "## Targets",
    "",
    "| target | verdict | detail |",
    "|---|---|---|",
    "",
  ].join("\n");
}

/**
 * EVERY STRING THAT REACHES THE EVIDENCE DOCUMENT GOES THROUGH HERE, and the
 * rule is "every", not "the ones that looked risky". The first version escaped
 * `detail` and interpolated `result.target` raw two expressions later. A
 * clean-room reviewer measured one `--repo` value carrying a pipe and a newline
 * producing an extra table row whose verdict column read `satisfied`, in a run
 * whose real verdict was `unreachable`. The escaped call and the raw one were
 * on the same LINE, which is what a per-site judgment gets you.
 */
function cell(text) {
  return String(text).replace(/\|/g, "/").replace(/[\r\n]+/g, " ");
}

/**
 * The row carries the verdict, whatever WAS read, and the per-source
 * breakdown. The breakdown is the part that distinguishes "nothing could be
 * read" from "one transport is refused and another is not", which is a real
 * measured state and not a hypothetical.
 */
function targetRow(result) {
  const readPart = result.record
    ? `head \`${result.record.head}\` (git ref \`${result.record.gitHead}\`), ` +
      `default branch \`${result.record.defaultBranch}\`, ` +
      `visibility \`${result.record.visibility}\`, updated \`${result.record.updatedAt}\``
    : "nothing was read";
  const sourceParts = Object.entries(result.sources ?? {}).map(
    ([name, source]) => `${name}=${source.verdict}`,
  );
  const detail =
    result.verdict === "satisfied"
      ? readPart
      : `${readPart}. sources: ${sourceParts.join(", ") || "none"}. ${result.reason}`;
  return `| \`${cell(result.target)}\` | ${cell(result.verdict)} | ${cell(detail)} |\n`;
}

function tail(overall, results, finishedAt) {
  const lines = [
    "",
    "## Overall",
    "",
    `OVERALL ${overall}`,
    "",
    `- finished: ${finishedAt}`,
    `- targets probed: ${results.length}`,
  ];
  const unsatisfied = results.filter((r) => r.verdict !== "satisfied");
  if (unsatisfied.length === 0) {
    return lines
      .concat([
        "- every target was read. This is a statement about the two repositories",
        "  named above and about nothing else.",
        "",
      ])
      .join("\n");
  }
  return lines
    .concat([
      "",
      "### What was NOT established",
      "",
    ])
    .concat(
      unsatisfied.map(
        (r) => `- \`${cell(r.target)}\`: ${cell(r.verdict)}. ${cell(r.reason)}`,
      ),
    )
    .concat([
      "",
      "An unreachable or refused target is NOT a clean probe and is NOT an",
      "absence of the thing looked for. The trigger does not advance on this run.",
      "",
    ])
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const options = {
    apiBase: DEFAULT_API_BASE,
    gitBase: DEFAULT_GIT_BASE,
    targets: [],
    out: resolve(repoRoot, DEFAULT_OUT),
    timeoutMs: 20000,
    force: false,
  };
  // EVERY VALUE-TAKING FLAG VALIDATES ITS VALUE POSITION, and that word is
  // "every" because the first version validated three of five. `--out` with
  // nothing after it resolved to the current DIRECTORY, and the EISDIR throw
  // from opening it exited 1, which is this script's own EXIT_REAL_NEGATIVE:
  // a crash was indistinguishable from "the remote answered and the answer is
  // no". Measured by a clean-room reviewer, 2026-09-16.
  const needsValue = (flag) => ({ usage: `${flag} needs a value` });
  const valueAt = (index) =>
    typeof argv[index] === "string" && argv[index].length > 0 ? argv[index] : null;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--api-base") {
      if (valueAt(i + 1) === null) return needsValue("--api-base");
      options.apiBase = argv[i + 1];
      i += 2;
    } else if (arg === "--git-base") {
      if (valueAt(i + 1) === null) return needsValue("--git-base");
      options.gitBase = argv[i + 1];
      i += 2;
    } else if (arg === "--repo") {
      if (valueAt(i + 1) === null) return needsValue("--repo");
      options.targets = options.targets.concat([argv[i + 1]]);
      i += 2;
    } else if (arg === "--out") {
      if (valueAt(i + 1) === null) return needsValue("--out");
      options.out = resolve(process.cwd(), argv[i + 1]);
      i += 2;
    } else if (arg === "--timeout-ms") {
      if (valueAt(i + 1) === null) return needsValue("--timeout-ms");
      options.timeoutMs = Number(argv[i + 1]);
      i += 2;
    } else if (arg === "--force") {
      options.force = true;
      i += 1;
    } else {
      return { usage: `unknown argument: ${arg}` };
    }
  }
  if (options.targets.length === 0) options.targets = DEFAULT_TARGETS.slice();
  if (typeof options.apiBase !== "string" || options.apiBase.length === 0) {
    return { usage: "--api-base needs a value" };
  }
  if (typeof options.gitBase !== "string" || options.gitBase.length === 0) {
    return { usage: "--git-base needs a value" };
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    return { usage: "--timeout-ms needs a positive number" };
  }
  return { options };
}

export async function run(argv, streams = {}) {
  const out = streams.stdout ?? process.stdout;
  const err = streams.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.usage) {
    err.write(`probe-pilot-readonly: ${parsed.usage}\n`);
    return EXIT_USAGE;
  }
  const options = parsed.options;

  // THE BEACON IS WRITTEN EARLY. IT IS NOT WRITTEN OVER SOMETHING ELSE.
  // T-008 rule 1 requires the artifact to exist within the first minutes so a
  // death leaves salvage rather than nothing. It does not require destroying
  // the previous run, and the first version did: `writeFileSync` ran before the
  // first read, unconditionally, with no existence check. A clean-room reviewer
  // measured a 37-byte file of prior evidence gone after a run that then
  // REFUSED, exit 3. At the DEFAULT path that is
  // delivery/verification/pulse-re-probe.md, so a second run that establishes
  // nothing destroys a first run that established everything, and destroys it
  // before it knows it will fail.
  if (!options.force && existsSync(options.out)) {
    err.write(
      `probe-pilot-readonly: ${options.out} already exists and this run would ` +
        "truncate it before its first read. Pass --force to overwrite it, or " +
        "--out <path> to write elsewhere. Nothing was probed and nothing was written.\n",
    );
    return EXIT_USAGE;
  }
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, beaconHeader(options, new Date().toISOString()), "utf8");

  let results = [];
  for (const target of options.targets) {
    const result = await probeTarget(target, options.apiBase, options.gitBase, options.timeoutMs);
    results = results.concat([result]);
    appendFileSync(options.out, targetRow(result), "utf8");
    out.write(`TARGET ${target} ${result.verdict} -- ${result.reason}\n`);
  }

  const overall = overallVerdict(results);
  appendFileSync(options.out, tail(overall, results, new Date().toISOString()), "utf8");
  out.write(`OVERALL ${overall}\n`);
  out.write(`EVIDENCE ${options.out}\n`);
  return exitCodeFor(overall);
}

/**
 * ZERO TARGETS IS A FAILURE. A sweep that looked at nothing is not a clean
 * sweep, and reporting it as one is the exact shape the fix-round contract's
 * third item exists against.
 */
export function overallVerdict(results) {
  if (results.length === 0) return "unreachable";
  if (results.some((r) => r.verdict === "refused")) return "refused";
  if (results.some((r) => r.verdict === "unreachable")) return "unreachable";
  if (results.some((r) => r.verdict === "not-yet")) return "not-yet";
  return "satisfied";
}

export function exitCodeFor(overall) {
  if (overall === "satisfied") return EXIT_ALL_READ;
  if (overall === "not-yet") return EXIT_REAL_NEGATIVE;
  return EXIT_INDETERMINATE;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  // AN UNEXPECTED THROW IS AN UNKNOWN, NOT A REAL NEGATIVE. Node exits 1 on an
  // uncaught error and 1 is EXIT_REAL_NEGATIVE here, so a crash read as "the
  // remote answered and the answer is no". The sibling site in
  // scripts/check-cutover-entry.mjs carries the identical guard.
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`probe-pilot-readonly: unexpected failure: ${singleLine(error)}\n`);
    process.exitCode = EXIT_INDETERMINATE;
  }
}
