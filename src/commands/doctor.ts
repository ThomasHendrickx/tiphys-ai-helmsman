import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EX_USAGE } from "../cli.ts";
import { BEACON_FILE, LOCK_FILE, loadFleet, missingLayoutEntries } from "../fleet.ts";
import { judgeBeacon, warnIfWatcherStale } from "../liveness.ts";
import { expiryHasPassed } from "../lock.ts";
import { poolList, resolveNetworkTimeoutMs } from "../pool.ts";
import { classifyEntry, readRegularFileIfPresent } from "../task.ts";
import { sharedLockStatus } from "../exclusion.ts";
import { decodeDocument } from "../validate.ts";
import {
  MACHINE_IDENTITY_EMAIL,
  MACHINE_IDENTITY_NAME,
} from "./init.ts";

/**
 * tiphys doctor: deterministic health checks over the current directory as
 * a fleet home (kernel plan v1, M1-P2 step 3). One line per check, format
 * "CHECK <name> PASS|WARN|FAIL <detail>", exit 0 only if no check FAILs.
 * Every check is file-based (substrate-neutral, DR-0007): no process is
 * ever probed (plan constraint C-2), and no currency is ever read off a
 * log tail (plan constraint C-1; this phase's checks read no task state,
 * and any later task-currency check must read tasks/<id>/meta.json and the
 * turn-end file only).
 */

export type CheckStatus = "PASS" | "WARN" | "FAIL";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Names the WARN condition a profile may promote to FAIL (EXT-F-08). */
  condition?: string;
}

/**
 * Readiness profiles (EXT-F-08): a profile promotes its required WARN
 * conditions to FAIL, so exit 0 under a profile means ready for that mode
 * (SC-011: never green by omission). The M1 table is deliberately small
 * and grows at M2/M3 with the gate registry.
 */
export const PROFILES: Record<string, readonly string[]> = {
  /* THESE THREE PROMOTE NOTHING ABOUT A CHARTER, and M4-P30 left that alone
     while changing `full`. Nothing below `full` resolves roles, checklists or
     retention duties out of a charter, so a fleet that has none is not broken
     in these modes and must keep exiting 0 there; `tiphys init` writes no
     charter, so the first thing a new user does would otherwise fail. A later
     profile that adds a retention condition here reddens a test that walks all
     three. */
  generic: [],
  "local-only": [],
  "direct-pr": ["gh-missing"],
  /* M3-P8 step 7 (R-098): `retention-undeclared` is promoted here, so a fleet
     whose charter declares no retention paths is not ready for full mode. The
     generic profile leaves it a WARN, which is the state a fleet legitimately
     sits in before its charter is written.
     M4-P30 PROMOTES `retention-not-applicable` HERE TOO, REVERSING THE LINE
     THAT STOOD ABOVE IT UNTIL THIS PHASE. What that line said was that a fleet
     with NO charter document at all is left a WARN under `full` as well, and
     the reason given was the sentence immediately above: the generic profile
     leaves it a WARN because that is the state a fleet legitimately sits in
     before its charter is written. THAT REASON IS ABOUT THE GENERIC PROFILE.
     Carried into `full` it makes `tiphys doctor --for full` exit 0 on a fleet
     that has no charter, which is a guard that cannot go red against the state
     it exists to detect: the fleet bring-up measured it on the kernel's own
     fleet home, fully configured, and got exit 0 with ZERO FAIL lines and one
     WARN line about retention (delivery/evidence/m4-fleet-bringup/bringup.md:1,
     record `C5.1-arm5-before-charter-emptied`). `full` is the mode whose
     pipeline resolves roles, checklists and retention duties out of a charter,
     so a fleet with no charter is not ready for it, and unlike the branch check
     the remedy IS reachable by the operator: write the charter.
     THE TWO CONDITIONS STAY SEPARATE, which is the half a one-line fix loses.
     `retention-not-applicable` (no charter document) and `retention-undeclared`
     (a charter, or YAML in charter/, that declares no retention paths) keep
     their own ids AND their own detail strings, so promoting both does not make
     "nobody has written a charter yet" and "somebody configured this wrongly"
     print the same sentence. See checkRetention's header. */
  /* M3-P13: `kernel-artifacts-incomplete` is promoted here, so a fleet whose
     installed kernel has lost roles/, schemas/, checklists/ or AGENTS.md is not
     ready for full mode. It is NOT promoted below full, deliberately: the
     commands that resolve those artifacts are full mode's, and promoting
     everywhere is how a check fails a fleet that never needed it. */
  /* M4-P17: `branches-unmerged`, `tasks-open`, `tasks-not-established`,
     `branches-not-established`, `remote-diverged`, `remote-untracked` and
     `remote-not-a-fleet` are NOT promoted here, and the branch one is the
     case the plan argues at length (criterion 5). Deleting a remote ref is
     refused in the container this kernel is built in, and the delete dry run
     exits 0 either way (CLAUDE.md standing warning 14), so a promoted branch
     check would make this profile unpassable on the kernel's own fleet with
     no remedy its operator could reach, and an unpassable check is one that
     gets switched off. The others are states a fleet legitimately sits in
     between a spawn and a teardown, or immediately after a reclaim. A test
     walks every profile and asserts none of them promotes any of these. */
  /* M4-P22: `shared-lock-unreachable` is promoted here and nowhere else. A
     fleet that has DECLARED the shared exclusion register and cannot read it
     refuses every lease operation, every spawn and every teardown, so it is
     not ready for full mode by any reading; and unlike the branch check the
     remedy is reachable by the operator, who either repairs the remote or
     removes the declaration. It is not promoted below `full` because the
     layer is opt-in per fleet home (M4-P21 criterion 1) and a fleet using
     `local-only` has nothing to reach. The other three statuses cannot be
     promoted at all: `not-declared`, `free` and `held` are PASS and carry no
     condition, deliberately, because a register held by another environment
     is the layer WORKING and not a fault of this fleet. */
  full: [
    "gh-missing",
    "remote-missing",
    "retention-undeclared",
    "retention-not-applicable",
    "kernel-artifacts-incomplete",
    "shared-lock-unreachable",
  ],
  watch: ["beacon-absent", "beacon-stale"],
};

/**
 * Locate the kernel's own package.json (same walk as src/version.ts).
 *
 * `classifyEntry`, not `existsSync`: this is the second of the three call
 * sites of the mechanism `reading-a-path-whose-type-is-not-established`, and
 * it is the one inside this phase's files-to-touch. The derivation over all
 * three, and the one left open, is published in this phase's work history.
 */
function readKernelEnginesNode(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (classifyEntry(candidate).kind === "regular") {
      const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
      const engines = (parsed as { engines?: { node?: unknown } }).engines;
      if (engines === undefined || typeof engines.node !== "string") {
        throw new Error(`no engines.node string in ${candidate}`);
      }
      return engines.node;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("package.json not found above " + import.meta.url);
    }
    dir = parent;
  }
}

/**
 * Evaluate a running node version against the kernel's engines.node range.
 * Fails closed (CR-102): only the exact ">=<major>[.<minor>[.<patch>]]"
 * form is interpreted, compared over the full version tuple; any other
 * range shape, and any unparseable version, is FAIL with a reason line,
 * never a silent truncation.
 */
export function nodeCheckFor(range: string, version: string): CheckResult {
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
  if (match === null) {
    return {
      name: "node",
      status: "FAIL",
      detail: `cannot interpret kernel engines.node range "${range}"`,
    };
  }
  const floor = [
    Number(match[1]),
    Number(match[2] ?? "0"),
    Number(match[3] ?? "0"),
  ];
  const parts = version.replace(/^v/, "").split(".").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return {
      name: "node",
      status: "FAIL",
      detail: `cannot interpret running node version "${version}"`,
    };
  }
  let satisfied = true;
  for (let i = 0; i < 3; i += 1) {
    const have = parts[i] as number;
    const need = floor[i] as number;
    if (have > need) {
      break;
    }
    if (have < need) {
      satisfied = false;
      break;
    }
  }
  if (satisfied) {
    return {
      name: "node",
      status: "PASS",
      detail: `${version} satisfies kernel engines "${range}"`,
    };
  }
  return {
    name: "node",
    status: "FAIL",
    detail: `${version} does not satisfy kernel engines "${range}"`,
  };
}

function checkNode(): CheckResult {
  return nodeCheckFor(readKernelEnginesNode(), process.version);
}

function toolVersion(cmd: string): string | undefined {
  const result = spawnSync(cmd, ["--version"], { encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  const firstLine = (result.stdout ?? "").split("\n")[0] ?? "";
  return firstLine.trim();
}

function checkGit(): CheckResult {
  const version = toolVersion("git");
  if (version === undefined) {
    return { name: "git", status: "FAIL", detail: "git not found on PATH" };
  }
  return { name: "git", status: "PASS", detail: version };
}

function checkGh(): CheckResult {
  const version = toolVersion("gh");
  if (version === undefined) {
    return {
      name: "gh",
      status: "WARN",
      detail: "gh not found on PATH, PR modes unavailable",
      condition: "gh-missing",
    };
  }
  return { name: "gh", status: "PASS", detail: version };
}

function checkLayout(root: string): CheckResult {
  const missing = missingLayoutEntries(root);
  if (missing.length > 0) {
    return {
      name: "layout",
      status: "FAIL",
      detail: `missing ${missing.join(", ")}`,
    };
  }
  return { name: "layout", status: "PASS", detail: "all layout entries present" };
}

/**
 * A git invocation for the reporting paths in this file, with the two
 * properties a REPORT needs and a write does not.
 *
 * `LC_ALL`/`LANG` are pinned so a translated git cannot change what this
 * module reads back, the same reason src/pool.ts:143 pins them.
 * `GIT_TERMINAL_PROMPT=0` turns a credential prompt into an error: doctor is
 * run non-interactively (by a watcher, by an exit test, by CI), and a git that
 * stops to ask for a password is a command that never returns.
 */
function runGitHere(
  root: string,
  args: string[],
  timeoutMs?: number,
): { status: number | null; stdout: string; stderr: string; timedOut: boolean } {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C", GIT_TERMINAL_PROMPT: "0" },
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
  });
  if (result.error !== undefined) {
    const timedOut =
      timeoutMs !== undefined &&
      (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
    return {
      status: null,
      stdout: "",
      stderr: timedOut
        ? `git ${args.join(" ")} did not answer within ${String(timeoutMs)}ms and was killed`
        : String(result.error),
      timedOut,
    };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut: false,
  };
}

/** The first non-empty line of git's own stderr, for a one-line detail. */
function firstStderrLine(stderr: string): string {
  const line = stderr
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry !== "");
  return line ?? "no stderr";
}

/** git's answer, or undefined when it did not answer. */
function gitValue(root: string, args: string[]): string | undefined {
  const run = runGitHere(root, args);
  if (run.status !== 0) {
    return undefined;
  }
  const value = run.stdout.trim();
  return value === "" ? undefined : value;
}

/**
 * CHECK remote (M4-P17 criterion 6): FETCH, then COMPARE.
 *
 * WHAT IT USED TO DO, and why that was the H-B shape. It listed the
 * configured remotes and printed `PASS remote configured (origin)` whenever
 * the list was non-empty. That condition is TRUE OF THE DANGEROUS STATE in
 * two separate ways, and both are ordinary rather than exotic: a fleet whose
 * whole history has never been pushed, and a fleet whose remote URL points at
 * something that is not there. Both printed PASS. Nothing the check did could
 * have told them from a healthy fleet, because `git remote` reads a config
 * file and never touches the remote.
 *
 * SO THE FETCH IS THE CHECK. Without it, "is the fleet's work somewhere other
 * than this disk" is answered by reading a string the operator typed. With it,
 * the answer is ahead/behind counts against a ref the remote actually
 * advertised.
 *
 * THE FETCH IS BOUNDED, AND THIS IS A DELIBERATE DEPARTURE FROM THE
 * CLASSIFICATION M4-P19 WROTE (test/pool.test.ts's
 * `pool-network-calls-are-classified`). That classification leaves object
 * transfers (`clone`, `fetch`, `pull`, `push`) unbounded, on the reasoning
 * that a legitimate transfer's duration is set by how much data there is, so a
 * wall-clock bound would kill real work. That reasoning is right where it was
 * written, and it does not reach here: this fetch moves no work an operator
 * asked for, it is a PROBE inside a REPORT. Killing it costs one diagnostic
 * line; not killing it costs the whole diagnosis, because doctor is the
 * command someone runs when a fleet is already misbehaving and a remote that
 * accepts and never answers would hang it with zero output. The bound reads
 * the same `TIPHYS_GIT_NETWORK_TIMEOUT_MS` override as the pool's ref probe,
 * so a witness can shorten it instead of waiting out the shipped twenty
 * seconds; a bound no test can drive is a bound no test will guard.
 *
 * A FETCH THAT DID NOT RUN IS NOT A PASS AND IS NOT A WARN. It is FAIL,
 * naming git's own first stderr line. The alternative a reviewer should look
 * for, and which this code deliberately does not do, is to swallow the failure
 * and fall back to the old non-empty-list test: that is green in exactly the
 * state the check exists to catch, which is the guard-that-cannot-go-red shape.
 * FAIL is also what this command already does everywhere else an input could
 * not be established (an unreadable lease, an undecodable charter), so the
 * three states a reader might confuse (in sync, diverged, could not ask) never
 * print the same word.
 *
 * OUTSIDE A FLEET HOME THERE IS NOTHING TO FETCH FOR. The subject of this
 * check is the FLEET's push target (SC-002), so in a git repository that is
 * not a fleet home it reports that and stops, exactly as CHECK worktrees does.
 * That is a verdict with its reason, not a silent pass, and it means doctor
 * run inside some unrelated checkout never reaches for that checkout's remote.
 */
function checkRemote(root: string): CheckResult {
  if (!existsSync(join(root, ".git"))) {
    return {
      name: "remote",
      status: "WARN",
      detail: "fleet home is not a git repository",
      condition: "remote-missing",
    };
  }
  const listed = runGitHere(root, ["remote"]);
  const remotes =
    listed.status === 0
      ? listed.stdout.split("\n").filter((line) => line !== "")
      : [];
  if (remotes.length === 0) {
    return {
      name: "remote",
      status: "WARN",
      detail: "no remote configured, fleet state has no push target (SC-002)",
      condition: "remote-missing",
    };
  }
  try {
    loadFleet(root);
  } catch {
    return {
      name: "remote",
      status: "WARN",
      detail:
        `${root} is a git repository with a remote (${remotes.join(", ")}) but it is not a ` +
        "fleet home, so there is no fleet state to compare against it",
      condition: "remote-not-a-fleet",
    };
  }
  const branch = gitValue(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const remote =
    (branch === undefined || branch === "HEAD"
      ? undefined
      : gitValue(root, ["config", "--get", `branch.${branch}.remote`])) ??
    (remotes.includes("origin") ? "origin" : (remotes[0] as string));

  const fetched = runGitHere(
    root,
    ["fetch", "--quiet", remote],
    resolveNetworkTimeoutMs(process.env["TIPHYS_GIT_NETWORK_TIMEOUT_MS"]),
  );
  if (fetched.status !== 0) {
    return {
      name: "remote",
      status: "FAIL",
      detail:
        `git fetch ${remote} did not succeed, so this fleet's push target could not be ` +
        `reached and nothing about it is established: ${firstStderrLine(fetched.stderr)}`,
    };
  }

  if (branch === undefined || branch === "HEAD") {
    return {
      name: "remote",
      status: "WARN",
      detail:
        `fetched ${remote}, but HEAD is detached, so there is no tracked remote ` +
        "ref to compare it against",
      condition: "remote-untracked",
    };
  }
  const tracked =
    gitValue(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]) ??
    (gitValue(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${branch}`]) ===
    undefined
      ? undefined
      : `${remote}/${branch}`);
  if (tracked === undefined) {
    return {
      name: "remote",
      status: "WARN",
      detail:
        `fetched ${remote}, which carries no ref for branch ${branch}, so the whole of ` +
        "this branch is unpushed",
      condition: "remote-untracked",
    };
  }
  const counted = runGitHere(root, ["rev-list", "--left-right", "--count", `${tracked}...HEAD`]);
  if (counted.status !== 0) {
    return {
      name: "remote",
      status: "FAIL",
      detail:
        `git rev-list could not count HEAD against ${tracked}, so the ahead and behind ` +
        `counts are not established: ${firstStderrLine(counted.stderr)}`,
    };
  }
  const fields = counted.stdout.trim().split(/\s+/);
  const behind = Number(fields[0]);
  const ahead = Number(fields[1]);
  if (fields.length !== 2 || !Number.isInteger(behind) || !Number.isInteger(ahead)) {
    return {
      name: "remote",
      status: "FAIL",
      detail:
        `git rev-list answered ${JSON.stringify(counted.stdout.trim())} for ` +
        `${tracked}...HEAD, which is not two counts`,
    };
  }
  if (ahead === 0 && behind === 0) {
    return {
      name: "remote",
      status: "PASS",
      detail: `in sync with ${tracked} (0 ahead, 0 behind) after fetching ${remote}`,
    };
  }
  return {
    name: "remote",
    status: "WARN",
    detail: `${String(ahead)} unpushed, ${String(behind)} behind ${tracked}`,
    condition: "remote-diverged",
  };
}

/**
 * Lease presence and shape. The read is guarded (fix round 4, CR-520's
 * class): doctor is the command an operator runs when a fleet is
 * misbehaving, and a named pipe at state/orchestrator.lock blocked this
 * check in the kernel, so doctor produced no diagnosis at all. This check
 * now classifies such an entry instead of opening it.
 */
function checkLock(root: string): CheckResult {
  const lockPath = join(root, LOCK_FILE);
  const read = readRegularFileIfPresent(lockPath);
  if (read.kind === "absent") {
    return { name: "lock", status: "PASS", detail: "no lease present" };
  }
  if (read.kind === "refused") {
    return { name: "lock", status: "FAIL", detail: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      name: "lock",
      status: "FAIL",
      detail: `lease file is not valid JSON (${String(error)})`,
    };
  }
  const lease = parsed as { holderId?: unknown; expiresAt?: unknown };
  if (
    typeof lease.holderId !== "string" ||
    lease.holderId === "" ||
    typeof lease.expiresAt !== "string"
  ) {
    return {
      name: "lock",
      status: "FAIL",
      detail: "lease file is missing holderId or expiresAt",
    };
  }
  return lockCheckFor(lease.holderId, lease.expiresAt, Date.now());
}

/**
 * THE VERDICT OVER A LEASE THAT HAS BEEN READ (M4-P17 criteria 1 and 2).
 *
 * AN EXPIRED LEASE IS A FAIL. Until this phase it was a PASS carrying the
 * word `(expired)` inside the detail, and that is the H-B shape this
 * repository keeps paying for: the check's condition was TRUE OF THE
 * DANGEROUS STATE, so a fleet whose orchestrator died holding the lease
 * reported `CHECK lock PASS` and doctor exited 0. AGENTS.md's resume clause
 * says doctor reports "which leases are expired and who last held them"; a
 * green line with a parenthesis in it is not that report, and an operator
 * scanning for FAIL lines never saw it.
 *
 * The holder id and the expiry are both in the detail because the remedy
 * needs both: WHO to ask before breaking the lease, and WHEN it lapsed.
 *
 * `nowMs` IS A PARAMETER, and that is what makes criterion 2's boundary
 * member testable at all. `Date.now()` cannot be driven to a chosen
 * millisecond from outside the process, so a lease whose expiry is exactly
 * the current instant is unreachable through the CLI: by the time doctor
 * runs, the instant has passed and the case under test is the interior one
 * again. The caller above passes the clock; the witness passes an instant.
 *
 * THE COMPARISON IS NOT MADE HERE. `expiryHasPassed` (src/lock.ts) owns it,
 * so doctor and the lock module cannot return two verdicts about one lease.
 * That is the same rule checkBeacon follows for `judgeBeacon`, and it was
 * written down there after a delta review found doctor carrying its own copy
 * of the beacon comparison and missing a floor the module had.
 */
export function lockCheckFor(
  holderId: string,
  expiresAt: string,
  nowMs: number,
): CheckResult {
  if (Number.isNaN(Date.parse(expiresAt))) {
    return {
      name: "lock",
      status: "FAIL",
      detail: `lease expiresAt "${expiresAt}" is not a parseable timestamp`,
    };
  }
  if (expiryHasPassed(expiresAt, nowMs)) {
    return {
      name: "lock",
      status: "FAIL",
      detail:
        `lease held by ${holderId} EXPIRED at ${expiresAt}; a lease that has ` +
        "lapsed is no longer holding anything, so whatever it was protecting " +
        "is unprotected",
    };
  }
  return {
    name: "lock",
    status: "PASS",
    detail: `lease held by ${holderId}, expires ${expiresAt}`,
  };
}

/**
 * Beacon freshness (R-095, completed by M1-P5). THE JUDGEMENT IS NOT MADE
 * HERE: judgeBeacon in src/liveness.ts decides what the beacon is
 * evidence of, and this check only decides how to present it. That is
 * why doctor and the liveness guard can never return two verdicts about
 * one file in one run, which they did while this check carried its own
 * copy of the comparison and missed the declared-cadence floor (delta
 * review CR-508).
 *
 * This check is about the beacon alone. The separate "watcher stale"
 * warning line this command also emits is the GUARD, whose predicate
 * additionally requires work in flight: a fleet with nothing in flight
 * and no watcher is untidy, not dangerous.
 */
function checkBeacon(root: string): CheckResult {
  const beaconPath = join(root, BEACON_FILE);
  const verdict = judgeBeacon(beaconPath);
  if (verdict.kind === "absent") {
    return {
      name: "beacon",
      status: "WARN",
      detail: "watcher not running or not scheduled",
      condition: "beacon-absent",
    };
  }
  if (verdict.kind === "unreadable") {
    return {
      name: "beacon",
      status: "FAIL",
      detail: `beacon file ${beaconPath} does not parse as a beacon record`,
    };
  }
  const thresholdSeconds = String(Math.round(verdict.thresholdMs / 1000));
  if (verdict.kind === "ahead") {
    return {
      name: "beacon",
      status: "WARN",
      detail:
        `beacon present but dated ${String(Math.round(verdict.aheadMs / 1000))}s in ` +
        `the future, so it is no evidence that supervision ran`,
      condition: "beacon-stale",
    };
  }
  const rounded = String(Math.max(0, Math.round(verdict.ageMs / 1000)));
  if (verdict.kind === "stale") {
    return {
      name: "beacon",
      status: "WARN",
      detail:
        `beacon present but ${rounded}s old, past the ${thresholdSeconds}s ` +
        `freshness threshold`,
      condition: "beacon-stale",
    };
  }
  return {
    name: "beacon",
    status: "PASS",
    detail: `beacon present, age ${rounded}s (freshness threshold ${thresholdSeconds}s)`,
  };
}

function gitConfigGet(root: string, key: string): string | undefined {
  const result = spawnSync("git", ["-C", root, "config", "--get", key], {
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  const value = (result.stdout ?? "").trim();
  return value === "" ? undefined : value;
}

function checkIdentity(root: string): CheckResult {
  const name = gitConfigGet(root, "user.name");
  const email = gitConfigGet(root, "user.email");
  if (name === undefined || email === undefined) {
    return {
      name: "identity",
      status: "WARN",
      detail: `git user.name or user.email unset; fleet-scoped commits use init's machine identity (${MACHINE_IDENTITY_NAME} <${MACHINE_IDENTITY_EMAIL}>) and do not require it`,
      condition: "identity-unset",
    };
  }
  return {
    name: "identity",
    status: "PASS",
    detail: `git commit identity configured (${name} <${email}>)`,
  };
}

/**
 * THE RETENTION CHECK (M3-P8 step 7, R-098).
 *
 * A charter declares `retention` paths for its work histories, its evidence
 * and its tuition. This check reads them and FAILs when a declared path is
 * absent, or is git-ignored in the repository it lives in, because evidence
 * that is ignored is evidence that does not survive the next clone. That is
 * the duty made checkable rather than stated.
 *
 * A CHARTER THAT DECLARES NOTHING IS NOT A PASS. It is a WARN carrying the
 * condition `retention-undeclared`, promoted to FAIL under the `full` profile.
 * A check that is vacuously satisfied by an absent declaration is the SC-011
 * shape this milestone exists to police, so the two states a reader might
 * confuse (nothing declared, everything declared and present) never print the
 * same word.
 *
 * "DECLARES NOTHING" IS DECIDED BY THE COUNT OF PATHS, NOT BY THE TYPE OF THE
 * FIELD (CR-1 and HRB-6, fix round 3). Until then the sentence above was a
 * promise the code did not keep: the guard tested `typeof retention !==
 * "object"`, and `{}` and `[]` are objects, so both printed `PASS 0 declared
 * retention path(s) present and tracked` under BOTH profiles. Round 2 recorded
 * `{}` as an open item; measured on a real `tiphys init` fleet it is a family of
 * five, `{}`, `[]`, nested-map values, empty-string values and non-string
 * values, and an ABSENT key correctly FAILs, so two characters defeated the
 * promotion. Two arms now close it and they close different halves: a value that
 * is not a non-empty string is its own FAIL naming the key, and a charter that
 * yields zero paths by any route takes `retention-undeclared`.
 *
 * THIS CHECK DOES NOT VALIDATE THE CHARTER AGAINST ITS SCHEMA, and that is why
 * the above is reachable by a real user rather than only by a fixture.
 * `schemas/charter.schema.json` does forbid every shape above, but nothing makes
 * anyone run `tiphys validate --type charter` before `tiphys doctor --for full`,
 * and charters are owner-authored by design, so a hand-written charter that does
 * not match its schema is the ordinary case. Wiring schema validation in here is
 * a larger change than this round is scoped for; the two arms make doctor's own
 * verdict correct without it.
 *
 * TWO ROOTS, because a retention path is written from the PROJECT's point of
 * view. `delivery/work-history/` lives in the project repository, and the
 * charter that names it lives in the fleet home, so each path is resolved
 * against the fleet root and against `projects/<identity name>` when that
 * clone is present. A path found unignored under either is satisfied.
 *
 * NO CHARTER AT ALL IS A THIRD STATE, AND IT IS NOT THE ONE ABOVE (fix round
 * 2). `tiphys init` writes `charter/.gitkeep` and no charter document, because
 * the charter is owner-authored (delivery/intake/orchestrated-delivery-v1.md:224
 * lists charter authorship among the owner's standing duties) and its required
 * fields are project facts init does not hold. Folding that state into
 * `retention-undeclared` made `tiphys doctor --for full` exit nonzero on every
 * freshly initialized fleet, which is the first thing a new user does. So it
 * gets its own condition, `retention-not-applicable`. It is still a WARN and
 * still names its reason, so it never prints the same word as "declared,
 * present and tracked": the plan's hazard row for this check permits exactly
 * "FAIL or not-applicable-with-a-reason, never a silent pass". The SC-011 arm
 * the row is aimed at, a charter that EXISTS and declares no retention paths,
 * keeps `retention-undeclared` and keeps its promotion.
 *
 * WHAT M4-P30 CHANGED, AND WHAT IT DID NOT. Until this phase the paragraph
 * above ended "which the `full` profile does NOT promote", and that is now
 * false: `full` promotes BOTH conditions (see the PROFILES table's own note).
 * What survives unchanged is the separation the paragraph was written to
 * protect. The two states keep separate condition ids and separate detail
 * strings, so a reader of a FAIL line can still tell "nobody has written a
 * charter here yet" from "somebody put YAML in charter/ that is not a
 * charter", and the promotion is what M3-P8 fix round 2 could not have: a
 * state is only promoted where the operator's remedy exists. Below `full`
 * nothing resolves anything out of a charter, so nothing below `full`
 * promotes it and a fresh `tiphys init` fleet still exits 0 under the
 * generic profile.
 */
function checkRetention(root: string): CheckResult {
  const charterDir = join(root, "charter");
  let names: string[];
  try {
    names = readdirSync(charterDir).sort();
  } catch {
    /* The `layout` check owns a missing charter/ and FAILs on it (FLEET_DIRS in
       src/fleet.ts), so this arm never has to carry that verdict itself. */
    return {
      name: "retention",
      status: "WARN",
      detail: `no charter/ directory under ${root}, so retention is not applicable; the layout check owns that condition`,
      condition: "retention-not-applicable",
    };
  }
  const declarations: { charter: string; paths: string[]; projectRoot?: string }[] = [];
  let candidates = 0;
  for (const name of names) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) {
      continue;
    }
    candidates += 1;
    const path = join(charterDir, name);
    const read = readRegularFileIfPresent(path);
    if (read.kind === "refused") {
      return { name: "retention", status: "FAIL", detail: read.reason };
    }
    if (read.kind === "absent") {
      continue;
    }
    let document: Record<string, unknown>;
    try {
      const decoded = decodeDocument(read.body, path);
      if (!decoded.ok) {
        return { name: "retention", status: "FAIL", detail: decoded.reason };
      }
      document = (decoded.value ?? {}) as Record<string, unknown>;
    } catch (error) {
      return {
        name: "retention",
        status: "FAIL",
        detail: `${path} could not be decoded: ${String(error)}`,
      };
    }
    if (document["kind"] !== "charter") {
      continue;
    }
    const retention = document["retention"];
    if (typeof retention !== "object" || retention === null) {
      return {
        name: "retention",
        status: "WARN",
        detail: `${path} declares no retention paths`,
        condition: "retention-undeclared",
      };
    }
    /* A NON-STRING VALUE IS ITS OWN FAIL, NEVER A SILENT DROP (CR-1, HRB-6, fix
       round 3). The earlier form filtered them away, so a charter declaring
       three retention paths with the wrong types reported the same green as one
       declaring none. Naming the key is what makes the verdict actionable. */
    const paths: string[] = [];
    for (const [key, value] of Object.entries(retention as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "") {
        paths.push(value);
        continue;
      }
      return {
        name: "retention",
        status: "FAIL",
        detail:
          `${path} declares retention key ${key} as ` +
          `${value === "" ? "an empty string" : describeRetentionValue(value)}, ` +
          `which names no path`,
      };
    }
    const identity = document["identity"];
    const projectName =
      typeof identity === "object" && identity !== null
        ? (identity as Record<string, unknown>)["name"]
        : undefined;
    const projectRoot =
      typeof projectName === "string"
        ? join(root, "projects", projectName)
        : undefined;
    declarations.push(
      projectRoot !== undefined && existsSync(projectRoot)
        ? { charter: path, paths, projectRoot }
        : { charter: path, paths },
    );
  }
  if (declarations.length === 0) {
    /* NOT APPLICABLE versus UNDECLARED, and the difference is whether anyone
       has written a charter yet. An empty charter/ is a fleet before
       realization; YAML that is present but carries no `kind: charter` is a
       fleet someone has configured wrongly.
       SINCE M4-P30 THE `full` PROFILE PROMOTES BOTH, AND THE SPLIT IS WHAT
       SURVIVES THAT. It would be one line shorter to return one condition with
       one sentence now that both arms exit nonzero under the same profile, and
       that is the edit this comment exists to refuse: the two states have
       DIFFERENT REMEDIES. The first is an owner writing the charter the fleet
       has been waiting for; the second is somebody removing or fixing a
       document that is in charter/ and is not a charter. A FAIL line that
       cannot tell a reader which of those to do is a diagnosis that has lost
       the thing it was for. The condition ids and the detail strings are both
       kept distinct, and a test asserts it on one fleet with one variable
       changed. */
    if (candidates === 0) {
      /* NO YAML AT ALL in charter/, which is what `tiphys init` leaves. WARN
         below `full`, promoted there. */
      return {
        name: "retention",
        status: "WARN",
        detail: `no charter document in ${charterDir}, so no project is realized here yet and retention is not applicable`,
        condition: "retention-not-applicable",
      };
    }
    /* YAML IS PRESENT AND NONE OF IT IS A CHARTER. The count is in the detail
       because it is the difference between one stray file and a directory
       somebody filled with the wrong documents. */
    return {
      name: "retention",
      status: "WARN",
      detail: `${String(candidates)} YAML document(s) in ${charterDir}, none with kind: charter, so no retention paths are declared`,
      condition: "retention-undeclared",
    };
  }
  /* THE VERDICT COMES FROM THE COUNT, NOT FROM THE TYPE (CR-1, HRB-6, fix
     round 3). The type test above decides PRESENCE OF AN OBJECT, and `{}` and
     `[]` are both objects, so two characters in a charter defeated the promoted
     `retention-undeclared` condition and printed `PASS 0 declared retention
     path(s) present and tracked`: the same word as a charter with three paths
     present and tracked, which is the exact thing this check's header forbids
     and the plan's hazard row at delivery/plan/kernel-plan-m3.md:4042 polices.
     Whatever shape `retention` had, a charter that yields NO path has declared
     nothing, and that is one condition rather than a family of them. */
  const empty = declarations.filter((declaration) => declaration.paths.length === 0);
  if (empty.length > 0) {
    return {
      name: "retention",
      status: "WARN",
      detail: `${(empty[0] as { charter: string }).charter} declares no retention paths`,
      condition: "retention-undeclared",
    };
  }
  let checked = 0;
  for (const declaration of declarations) {
    const roots = [root, ...(declaration.projectRoot === undefined ? [] : [declaration.projectRoot])];
    for (const relative of declaration.paths) {
      checked += 1;
      const present = roots.filter((base) => existsSync(join(base, relative)));
      if (present.length === 0) {
        return {
          name: "retention",
          status: "FAIL",
          detail: `${declaration.charter} declares retention path ${relative}, which does not exist`,
        };
      }
      const kept = present.filter((base) => !isGitIgnored(base, relative));
      if (kept.length === 0) {
        return {
          name: "retention",
          status: "FAIL",
          detail: `${declaration.charter} declares retention path ${relative}, which is git-ignored and will not survive a clone`,
        };
      }
    }
  }
  return {
    name: "retention",
    status: "PASS",
    detail: `${String(checked)} declared retention path(s) present and tracked`,
  };
}

/** Name a non-string retention value in a diagnostic, without printing it. */
function describeRetentionValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  if (typeof value === "object") {
    return "a map";
  }
  return `a ${typeof value}`;
}

/** True when git reports the path ignored in that repository. */
function isGitIgnored(repository: string, relative: string): boolean {
  const result = spawnSync(
    "git",
    ["-C", repository, "check-ignore", "-q", "--", relative],
    { encoding: "utf8" },
  );
  return result.error === undefined && result.status === 0;
}

/**
 * THE KERNEL ARTIFACTS THIS CHECK REQUIRES, pinned HERE and never read out of
 * the install being audited.
 *
 * The mechanism index's `checking-a-generated-artifact-against-its-own-generator`
 * row is about a check whose SUBJECT is selected by a value read from the
 * artifact it audits: that check can be silently narrowed by editing the
 * artifact. Reading this list out of the install's own `package.json` files
 * array would be exactly that shape, because an install that dropped `roles/`
 * from both the tree and the files list would report itself complete. So the
 * list is a constant in the source, and `package.json` is consulted only to
 * locate the package root, never to decide what must be in it.
 *
 * A DIRECTORY MUST BE NON-EMPTY, which is decision D-1 of the phase plan. The
 * check's subject is whether the install can resolve a role, a schema or a
 * checklist, and an empty `roles/` resolves none. An `existsSync` on a
 * directory the packer created empty is the vacuous pass hazard H1 names.
 */
/**
 * WHAT "RESOLVES" MEANS, PER ARTIFACT, TAKEN FROM THE CONSUMER (fix round 1,
 * clean-room finding CR-001 of the hazard contract).
 *
 * Round 0 tested that a required path was PRESENT and reported success as
 * `carries roles/, schemas/, checklists/ and AGENTS.md`, which is a claim
 * about RESOLVABILITY. Presence is a PROXY for it, and the proxy was reachable
 * in four measured shapes, every one of them PASS with FAIL count zero: a
 * directory holding one unrelated file, a directory holding only a
 * subdirectory, a directory whose members are all zero bytes, and a zero-byte
 * `AGENTS.md`.
 *
 * The suffix below is not invented here. It is the filter the CONSUMING
 * command already applies, so the check cannot claim more than the consumer
 * will deliver:
 *
 *   roles/       src/roles.ts:335              `.md`
 *   schemas/     src/commands/validate.ts:156  `.schema.json`
 *   checklists/  src/checklists.ts:91          `.yaml`
 *
 * WHAT THE PREDICATE DOES NOT COVER, stated rather than left to be found. It
 * asks whether at least ONE member would be selected and carries bytes. It
 * does not PARSE a member, so a `.yaml` that does not decode, a `.schema.json`
 * that is not a schema and a `.md` with no frontmatter all resolve. It does
 * not ask WHICH members are present, so an install carrying one role resolves
 * `roles/` even if the role a brief names is the missing one. Both are
 * deliberate: doctor answers "is this install fit to run", and a per-document
 * decode is the consuming command's own failure, reported by it, with the path
 * it could not use.
 */
const REQUIRED_KERNEL_DIRECTORIES = [
  { name: "roles", suffix: ".md" },
  { name: "schemas", suffix: ".schema.json" },
  { name: "checklists", suffix: ".yaml" },
] as const;
const REQUIRED_KERNEL_FILES = ["AGENTS.md"] as const;

/**
 * A path that is a regular file AND carries bytes.
 *
 * `classifyEntry` first, `statSync` second: the type is established before the
 * size is asked for, so a FIFO here is `false` in bounded time rather than a
 * blocked open (mechanism index,
 * `reading-a-path-whose-type-is-not-established`). The `statSync` cannot be
 * folded into `classifyEntry`, which returns a kind and no size; it is a
 * second stat of a path already established as a regular file, never an open.
 */
function carriesContent(path: string): boolean {
  if (classifyEntry(path).kind !== "regular") {
    return false;
  }
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

/**
 * The installed kernel's own package root: the first ancestor of THIS MODULE
 * carrying a `package.json`.
 *
 * **This is deliberately NOT `kernelRoot()` from src/roles.ts, and the reason
 * is the whole point of the check.** That function walks upward looking for a
 * `roles/` directory containing a `.md` file, which is the very artifact this
 * check exists to find missing: against an install with `roles/` removed it
 * walks PAST the install and answers about an ancestor, and where no ancestor
 * carries one it throws. A check built on it reports on the wrong tree or
 * crashes on precisely the state its own criteria describe.
 *
 * Walking for `package.json` does not have that property. `package.json` is
 * the package BOUNDARY rather than a member of the set under test, and it is
 * present in both shipped layouts. Measured on this head: the published
 * package puts this module at `dist/src/commands/doctor.js` with the artifacts
 * three levels up at the package root, and the development checkout puts it at
 * `src/commands/doctor.ts` with the artifacts two levels up, while
 * `dist/package.json` does not exist in the pack listing. So a FIXED DEPTH
 * from `import.meta.url` is wrong in one of the two layouts and the first
 * `package.json` above the module is right in both.
 *
 * Returns the reason rather than throwing, because a guard whose correctness
 * depends on a crash is not a guard (mechanism index,
 * `a-guard-s-own-failure-path`).
 */
export function resolveInstalledKernelRoot(
  from: string = dirname(fileURLToPath(import.meta.url)),
): { ok: true; root: string } | { ok: false; reason: string } {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "package.json");
    if (classifyEntry(candidate).kind === "regular") {
      return { ok: true, root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return {
        ok: false,
        reason: `no package.json above ${from}, so the installed kernel root cannot be resolved`,
      };
    }
    dir = parent;
  }
}

/**
 * `kernel-artifacts`: the resolved kernel install carries every artifact M3
 * made load-bearing (kernel plan M3 section 4, stage E0.4's designated subject;
 * phase M3-P13).
 *
 * WHAT THIS CHECK IS FOR. The brief composer resolves `roles/`, the validator
 * loads `schemas/`, the checklist command resolves `checklists/`, and
 * `AGENTS.md` is the policy document every role brief points at. Until now an
 * install that lost one of them reported nothing wrong: the loss surfaced later
 * as one command's resolution failure, whose message names the path it could
 * not open rather than the state of the install. doctor is the command whose
 * whole job is answering "is this environment fit to run", and the kernel's own
 * artifacts were the one input none of its checks looked at.
 *
 * EVERY missing artifact is named, not the first (decision D-2): a check that
 * names one sends its reader round the loop once per missing item, and the loop
 * here is a reinstall.
 *
 * The condition is `kernel-artifacts-incomplete`, promoted to FAIL under the
 * `full` profile and left a WARN below it. Below `full` no command that needs
 * these artifacts is necessarily in the pipeline, and promoting everywhere is
 * how a check like this ends up failing a fleet that never needed it.
 */
export function checkKernelArtifacts(
  resolution: ReturnType<typeof resolveInstalledKernelRoot> = resolveInstalledKernelRoot(),
): CheckResult {
  if (!resolution.ok) {
    return {
      name: "kernel-artifacts",
      status: "FAIL",
      detail: resolution.reason,
    };
  }
  const root = resolution.root;
  const missing: string[] = [];
  for (const { name, suffix } of REQUIRED_KERNEL_DIRECTORIES) {
    const path = join(root, name);
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      missing.push(
        code === "ENOENT"
          ? `${name}/ (absent)`
          : `${name}/ (${code ?? "unreadable"})`,
      );
      continue;
    }
    if (entries.length === 0) {
      missing.push(`${name}/ (present but empty, so it resolves nothing)`);
      continue;
    }
    if (
      !entries.some((entry) => entry.endsWith(suffix) && carriesContent(join(path, entry)))
    ) {
      missing.push(`${name}/ (present, but no ${suffix} member resolves)`);
    }
  }
  for (const name of REQUIRED_KERNEL_FILES) {
    /* classifyEntry, not existsSync: it lstats the link, stats what it
       resolves to, and opens only a regular file, so a FIFO at this path is a
       reported refusal in bounded time rather than a doctor that hangs
       (mechanism index, `reading-a-path-whose-type-is-not-established`). */
    const path = join(root, name);
    const entry = classifyEntry(path);
    if (entry.kind !== "regular") {
      missing.push(
        entry.kind === "absent"
          ? `${name} (absent)`
          : `${name} (${entry.kind}${entry.kind === "dangling" ? "" : `: ${entry.reason}`})`,
      );
      continue;
    }
    /* The FILE member of the class the emptiness reasoning was written for.
       The plan's words for the directory member, "an install that carries an
       empty roles/ resolves no role", are true word for word of a zero-byte
       AGENTS.md: it is the policy document every role brief points at, and an
       empty one states no policy. */
    if (!carriesContent(path)) {
      missing.push(`${name} (present but empty, so it states nothing)`);
    }
  }
  if (missing.length > 0) {
    return {
      name: "kernel-artifacts",
      status: "WARN",
      detail: `the kernel install at ${root} is missing ${missing.join(", ")}`,
      condition: "kernel-artifacts-incomplete",
    };
  }
  return {
    name: "kernel-artifacts",
    status: "PASS",
    detail: `the kernel install at ${root} carries roles/, schemas/, checklists/ and AGENTS.md`,
  };
}

/**
 * CHECK tasks (M4-P17 criterion 3): how many tasks are OPEN, and which.
 *
 * THE DEFINITION IS THE PLAN'S AND IT IS DELIBERATELY NARROW. A task is open
 * when `tasks/<id>/meta.json` is there and `tasks/<id>/turn-end` is not. Two
 * file existences, both under `tasks/`, and nothing else. No log is read
 * (constraint C-1: currency never comes off the tail of an append-only
 * stream), and nothing is probed for being alive (constraint C-2: liveness is
 * lease freshness, never a process). A test in test/doctor.test.ts greps this
 * function's own source for the four tokens that would mean either constraint
 * had been broken, because a violation of either is invisible in the output.
 *
 * ESTABLISHED, ABSENT, UNUSABLE, AND THEY NEVER PRINT THE SAME WORD. This is
 * the one thing this check must not get wrong. The kernel already carries a
 * live instance of the opposite, tracked at
 * delivery/verification/tracked-doctor-charter-selection.md:1: the retention
 * check selects charter documents by a raw `kind` read, so a document whose
 * `kind` cannot be read is SKIPPED, and skipping is indistinguishable from
 * absence, so the command reports PASS over a fleet it could not examine. A
 * fourth check with that shape would be worse than no check.
 *
 * So every candidate under `tasks/` lands in exactly one of three buckets and
 * the third is reported by name:
 *
 *   - open      meta.json is a regular file, turn-end is absent
 *   - closed    meta.json is a regular file, turn-end is a regular file
 *   - UNUSABLE  anything else: no meta.json at all, a meta.json or a turn-end
 *               that is a directory, a named pipe, a dangling link, or a path
 *               `lstat` itself could not answer about
 *
 * An UNUSABLE candidate is a WARN carrying its own condition, never folded
 * into "closed" and never dropped from the total. A directory under `tasks/`
 * with no `meta.json` is the common real shape of it, a task half created or
 * half removed, and the honest report is that the check could not establish
 * what it is.
 *
 * NO PATH HERE IS OPENED. `classifyEntry` (src/task.ts) lstats, stats and
 * answers a kind; a named pipe at `tasks/<id>/meta.json` is therefore a named
 * WARN in bounded time rather than a doctor that hangs with no output, which
 * is the defect CR-520 recorded at the lease path and which this check would
 * otherwise reintroduce one directory along.
 */
export function checkTasks(root: string): CheckResult {
  const tasksDir = join(root, "tasks");
  let entries: Dirent[];
  try {
    entries = readdirSync(tasksDir, { withFileTypes: true });
  } catch (error) {
    /* CHECK layout owns a missing tasks/ and FAILs on it (FLEET_DIRS in
       src/fleet.ts), so this arm names the condition and leaves the verdict
       to the check that owns it. */
    return {
      name: "tasks",
      status: "WARN",
      detail: `tasks/ under ${root} could not be listed (${String(error)}), so no task is established`,
      condition: "tasks-not-established",
    };
  }
  const open: string[] = [];
  const unusable: string[] = [];
  let total = 0;
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isFile()) {
      /* `tasks/.gitkeep` and anything else a plain file: a task is a
         DIRECTORY, so this is not a candidate rather than a broken one. */
      continue;
    }
    total += 1;
    if (!entry.isDirectory()) {
      unusable.push(`${entry.name} (not a directory)`);
      continue;
    }
    const metaFile = join(tasksDir, entry.name, "meta.json");
    const meta = classifyEntry(metaFile);
    if (meta.kind !== "regular") {
      unusable.push(`${entry.name} (meta.json ${unestablishedBecause(metaFile, meta)})`);
      continue;
    }
    const turnEndFile = join(tasksDir, entry.name, "turn-end");
    const turnEnd = classifyEntry(turnEndFile);
    if (turnEnd.kind === "absent") {
      open.push(entry.name);
      continue;
    }
    if (turnEnd.kind !== "regular") {
      unusable.push(
        `${entry.name} (turn-end ${unestablishedBecause(turnEndFile, turnEnd)})`,
      );
    }
  }
  const counted =
    `${String(open.length)} open of ${String(total)}` +
    (open.length === 0 ? "" : ` (${open.join(", ")})`);
  if (unusable.length > 0) {
    return {
      name: "tasks",
      status: "WARN",
      detail: `${counted}; ${String(unusable.length)} not established: ${unusable.join(", ")}`,
      condition: "tasks-not-established",
    };
  }
  if (open.length > 0) {
    return { name: "tasks", status: "WARN", detail: counted, condition: "tasks-open" };
  }
  return { name: "tasks", status: "PASS", detail: counted };
}

/**
 * Why a path under `tasks/` could not be established, WITHOUT the absolute
 * path in it.
 *
 * `classifyEntry` prefixes its reason with the path it examined, which is
 * right for a diagnostic naming one file and wrong inside a line that has
 * already named the task. Stripping it also makes the line reproducible: a
 * detail carrying a temporary directory differs on every run, so no capture
 * could record it and no test could compare against one.
 */
function unestablishedBecause(
  path: string,
  entry: ReturnType<typeof classifyEntry>,
): string {
  if (entry.kind === "absent") {
    return "is absent";
  }
  if (entry.kind === "dangling" || entry.kind === "regular") {
    return entry.kind === "dangling"
      ? "is a link that resolves to nothing"
      : "is a regular file";
  }
  const reason = entry.reason;
  return reason.startsWith(`${path} `) ? reason.slice(path.length + 1) : reason;
}

/**
 * CHECK branches (M4-P17 criterion 5): which branches are PUSHED and NOT YET
 * MERGED. AGENTS.md's resume clause names this as one of the three things
 * doctor reports after a reclaim, and it was the one with no implementation.
 *
 * PUSHED means a remote-tracking ref exists for it, which is the only
 * evidence available locally that the branch is somewhere other than this
 * disk. UNMERGED means the trunk does not already contain it.
 *
 * IT REPORTS EVERY PUSHED REF RATHER THAN FILTERING TO A NAMING PATTERN, and
 * that is a decision rather than an omission. At least two branch spellings
 * are in use across the repositories this kernel runs over: the pool names
 * task branches `task/<id>` (src/pool.ts:54), and a delivery process running
 * on this kernel names phase branches with its own harness prefix followed by
 * a milestone and phase segment. A filter written for either is blind to the
 * other, and a check that is blind to a branch is worse than one that names a
 * branch the reader already knew about. A superset prints rows a reader can
 * skip; a filter that misses a branch prints nothing at all, and nothing is
 * what a healthy fleet prints too.
 *
 * NO BRANCH PREFIX IS SPELLED OUT HERE, and that is not a style choice.
 * test/schemas.test.ts:800 asserts by name which shipped files carry the
 * harness-derived branch prefix and exists to stop that set GROWING; writing
 * the literal prefix into this comment added src/commands/doctor.ts to it and
 * reddened that test. The spelling belongs in the delivery process that uses
 * it, not in the kernel that reports over any of them.
 *
 * WARN, AND NO PROFILE PROMOTES IT TO FAIL. The reason is measured and is not
 * a preference. Deleting a remote ref is REFUSED in the container this kernel
 * is built in, and `git push --dry-run --delete` exits 0 whether deletion is
 * allowed or not, so the dry run cannot tell an operator whether the remedy is
 * even available (CLAUDE.md standing warning 14). A promotable branch check
 * would therefore make `tiphys doctor --for full` unpassable on the kernel's
 * own fleet, with no action its operator could take, and an unpassable check
 * is a check that gets switched off. The count is printed; the exit code does
 * not move. A test walks every profile in PROFILES and asserts that, so a
 * later profile cannot promote it by accident.
 *
 * AND IT NEVER PRINTS PASS FOR A QUESTION IT COULD NOT ASK. If git refuses to
 * list the refs, or the trunk cannot be resolved, the check says so under its
 * own condition instead of reporting an empty list as a clean bill of health.
 * An empty result from a query that failed is indistinguishable from an empty
 * result from a query that succeeded, which is the third way this repository
 * has shipped a guard that could not go red.
 */
export function checkBranches(root: string): CheckResult {
  if (!existsSync(join(root, ".git"))) {
    return {
      name: "branches",
      status: "WARN",
      detail: "fleet home is not a git repository, so no branch can be reported",
      condition: "branches-not-established",
    };
  }
  /* THE FORMAT ASKS FOR THE FULL REFNAME, AND THAT IS THE WHOLE POINT OF THIS
     LINE. `%(refname:short)` renders refs/remotes/origin/HEAD as `origin`, not
     as `origin/HEAD`, because git shortens a remote's HEAD to the remote's own
     name. A filter written as `endsWith("/HEAD")` over the SHORT name is
     therefore dead on exactly the ref it exists to drop, which is the shape
     this repository keeps paying for: a guard whose condition does not test
     the property that matters. The short name is recovered below by stripping
     the prefix, which is what `:short` does for every ref that is not a HEAD.

     `%(symref)` is the second half and is not redundant. Since git 2.48.0,
     `git fetch` creates refs/remotes/<name>/HEAD when the remote advertises one
     and the local side has none: `remote.<name>.followRemoteHEAD` documents
     `create` as its default. It creates it as a SYMBOLIC ref, so dropping
     symbolic refs is the direct statement of "an alias is not a branch". A HEAD
     written as an ordinary ref carries no symref target and is caught by the
     name test instead; both members occur and each half catches one of them. */
  const listed = runGitHere(root, [
    "for-each-ref",
    "--format=%(refname)%09%(symref)",
    "refs/remotes",
  ]);
  if (listed.status !== 0) {
    return {
      name: "branches",
      status: "WARN",
      detail:
        "git could not list the remote-tracking refs, so no branch is established: " +
        firstStderrLine(listed.stderr),
      condition: "branches-not-established",
    };
  }
  const REMOTES_PREFIX = "refs/remotes/";
  const refs: string[] = [];
  for (const row of listed.stdout.split("\n")) {
    const [refname = "", symref = ""] = row.split("\t");
    if (!refname.startsWith(REMOTES_PREFIX)) {
      continue;
    }
    /* TWO TESTS, TWO STATEMENTS. They are not one condition with an `||`
       because they are two different properties with two different witnesses,
       and a witness member that defangs one of them must be distinguishable
       from one that defangs the other. */
    if (symref !== "") {
      continue;
    }
    if (refname.endsWith("/HEAD")) {
      continue;
    }
    refs.push(refname.slice(REMOTES_PREFIX.length));
  }
  if (refs.length === 0) {
    return { name: "branches", status: "PASS", detail: "no pushed branches" };
  }
  /* The trunk, in the order the evidence is strongest: what the remote
     itself advertises as its default, then what this branch tracks, and
     only then this checkout's own HEAD. */
  const trunk =
    gitValue(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]) ??
    gitValue(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]) ??
    "HEAD";
  if (gitValue(root, ["rev-parse", "--verify", "--quiet", `${trunk}^{commit}`]) === undefined) {
    return {
      name: "branches",
      status: "WARN",
      detail: `${trunk} does not resolve to a commit, so no branch can be compared against it`,
      condition: "branches-not-established",
    };
  }
  const unmerged: string[] = [];
  for (const ref of refs) {
    if (ref === trunk) {
      continue;
    }
    const ancestor = runGitHere(root, ["merge-base", "--is-ancestor", ref, trunk]);
    if (ancestor.status === 0) {
      continue;
    }
    if (ancestor.status !== 1) {
      return {
        name: "branches",
        status: "WARN",
        detail:
          `git merge-base --is-ancestor ${ref} ${trunk} exited ` +
          `${String(ancestor.status)}, so whether ${ref} is merged is not established: ` +
          firstStderrLine(ancestor.stderr),
        condition: "branches-not-established",
      };
    }
    unmerged.push(ref);
  }
  if (unmerged.length === 0) {
    return {
      name: "branches",
      status: "PASS",
      detail: `${String(refs.length)} pushed branch(es), none unmerged into ${trunk}`,
    };
  }
  return {
    name: "branches",
    status: "WARN",
    detail:
      `${String(unmerged.length)} of ${String(refs.length)} pushed branch(es) unmerged ` +
      `into ${trunk}: ${unmerged.join(", ")}`,
    condition: "branches-unmerged",
  };
}

/**
 * CHECK worktrees (M4-P19): every entry in the worktree pool, and whether a
 * pool record still exists beside it.
 *
 * THE STATE THIS REPORTS IS THE POST-RECLAIM ONE. `worktrees/` is
 * gitignored (src/fleet.ts:28) and `tasks/` is tracked, so a reclaim takes
 * every worktrees/<id>.pool.json with it and leaves the task records
 * standing. Before this check, nothing in the kernel said so: `pool list`
 * enumerated records, and a task whose record was gone was invisible to
 * every reporting path.
 *
 * WARN AND NEVER FAIL, AND NOT PROMOTED BY ANY PROFILE. The condition is
 * named (`worktree-record-missing`) so a later profile CAN promote it, and
 * none does, deliberately: a fleet that has just been rehydrated from its
 * remote is EXPECTED to be in exactly this state, so promoting it would
 * make `doctor --for full` unpassable on the one fleet the remedy exists
 * for, and an unpassable check is a check that gets switched off (hazard
 * H-D). The number is printed; the exit code does not move.
 *
 * It reads tasks/<id>/meta.json and git, never a log tail (C-1), and
 * probes no process (C-2).
 */
export function checkWorktrees(root: string): CheckResult {
  let fleet;
  try {
    fleet = loadFleet(root);
  } catch {
    // Not a fleet home. CHECK layout is what reports that, and an
    // advisory must not be the thing that says so.
    return {
      name: "worktrees",
      status: "WARN",
      detail: `${root} is not a fleet home, so there is no worktree pool to report`,
    };
  }
  const entries = poolList(fleet);
  if (entries.length === 0) {
    return {
      name: "worktrees",
      status: "PASS",
      detail: "no pool worktrees",
    };
  }
  const withoutRecord = entries.filter((entry) => entry.origin !== "record");
  if (withoutRecord.length === 0) {
    return {
      name: "worktrees",
      status: "PASS",
      detail: `${String(entries.length)} pool entr(ies), each with a pool record beside it`,
    };
  }
  // BY ID, because "1 of 3" tells an operator nothing they can act on.
  const named = withoutRecord
    .map((entry) =>
      entry.origin === "reconstructed"
        ? `${entry.taskId} (reconstructed)`
        : `${entry.taskId} (unreconstructable: ${(entry.unresolved ?? []).join(", ")})`,
    )
    .join(", ");
  return {
    name: "worktrees",
    status: "WARN",
    detail:
      `${String(withoutRecord.length)} of ${String(entries.length)} pool ` +
      `entr(ies) have no pool record beside them: ${named}`,
    condition: "worktree-record-missing",
  };
}

/**
 * CHECK shared-lock (M4-P22 criterion 1): who holds this fleet ACROSS
 * environments, in exactly one of four statuses.
 *
 * CHECK lock above reports the lease on THIS filesystem, which is the only
 * thing it can report: src/lock.ts:63 states that domain honestly, and
 * M4-P20 measured two clones of one fleet remote both holding their own
 * lease at once. This check reports the second layer M4-P21 built, and the
 * two are separate lines on purpose, because they answer different questions
 * and an operator reading one of them is entitled to know the other was not
 * merged into it.
 *
 * THE VERDICT IS NOT MADE HERE. `sharedLockStatus` (src/exclusion.ts) owns
 * it, exactly as `expiryHasPassed` owns CHECK lock's comparison and
 * `judgeBeacon` owns CHECK beacon's. This check only decides how to present
 * a status, so doctor and the exclusion layer cannot return two verdicts
 * about one register.
 *
 * THE FOURTH STATUS IS NEVER PASS, which is this check's whole reason for
 * having four. An unreachable register absorbed into a green line is the
 * H-C shape: the bundle says fine and the one question that mattered was
 * never asked. It is a WARN under its own condition so an operator sees it
 * without doctor exiting nonzero on a fleet that never opted in, and `full`
 * promotes it (see the PROFILES table).
 *
 * IT SPAWNS NOTHING FOR A FLEET THAT HAS NOT OPTED IN. `sharedLockStatus`
 * reads the fleet home's own package.json first and returns `not-declared`
 * before any git call, so the cost of this check on every existing fleet is
 * one file read.
 */
export function checkSharedLock(root: string): CheckResult {
  const status = sharedLockStatus(root);
  if (status.token === "unreachable") {
    return {
      name: "shared-lock",
      status: "WARN",
      detail: status.text,
      condition: "shared-lock-unreachable",
    };
  }
  return { name: "shared-lock", status: "PASS", detail: status.text };
}

export function runChecks(root: string): CheckResult[] {
  return [
    checkNode(),
    checkGit(),
    checkGh(),
    checkLayout(root),
    checkRemote(root),
    checkLock(root),
    checkSharedLock(root),
    checkBeacon(root),
    checkIdentity(root),
    checkRetention(root),
    checkTasks(root),
    checkBranches(root),
    checkWorktrees(root),
    checkKernelArtifacts(),
  ];
}

export function cmdDoctor(args: string[]): number {
  let profile = "generic";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--for" && i + 1 < args.length) {
      profile = args[i + 1] as string;
      i += 1;
    } else {
      process.stderr.write("usage: tiphys doctor [--for <profile>]\n");
      return EX_USAGE;
    }
  }
  const promoted = PROFILES[profile];
  if (promoted === undefined) {
    process.stderr.write(
      `tiphys doctor: unknown profile "${profile}" (profiles: ${Object.keys(PROFILES).join(", ")})\n`,
    );
    return EX_USAGE;
  }

  let failed = false;
  for (const result of runChecks(process.cwd())) {
    let status: CheckStatus = result.status;
    let detail = result.detail;
    if (
      status === "WARN" &&
      result.condition !== undefined &&
      promoted.includes(result.condition)
    ) {
      status = "FAIL";
      detail = `${detail} (required for profile ${profile})`;
    }
    if (status === "FAIL") {
      failed = true;
    }
    process.stdout.write(`CHECK ${result.name} ${status} ${detail}\n`);
  }

  // Liveness guard (M1-P5 step 2). It warns and never blocks: doctor's
  // exit code is decided by its checks exactly as before. Outside a fleet
  // home there is no guard to run, and the layout check is what reports
  // that; an advisory must not be the thing that says so.
  //
  // THE ADVISORY RUNS LAST, AFTER THE DIAGNOSIS IS PRINTED (CR-523). It
  // used to run first, so anything wrong with the guard silenced the whole
  // command: with a named pipe at the beacon, the one tool an operator
  // runs on a misbehaving fleet produced zero CHECK lines. The guard is
  // now safe on that path, but the ordering is what made a single defect
  // in an advisory cost the entire diagnosis, and an advisory belongs
  // beside a diagnosis rather than in front of it.
  try {
    warnIfWatcherStale(loadFleet(process.cwd()));
  } catch {
    // Not a fleet home: reported by CHECK layout above.
  }

  return failed ? 1 : 0;
}
