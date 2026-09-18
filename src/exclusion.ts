import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LOCK_FILE,
  readRegularPathIfPresent,
  refuseOpenPathForWrite,
} from "./fleet.ts";

/**
 * THE SHARED EXCLUSION REGISTER (kernel plan M4, M4-P21).
 *
 * `src/lock.ts` states its own exclusion domain honestly at src/lock.ts:63:
 * the lease excludes within ONE filesystem and ONE clock. Two environments
 * that clone one fleet remote each get their own `state/orchestrator.lock`
 * and BOTH acquire it, because `state/` is gitignored (src/fleet.ts:28) so
 * the lease artifact never travels. M4-P20 measured that dangerous state and
 * committed the captures; this module is the second exclusion layer that
 * closes it.
 *
 * WHAT THE REGISTER IS. A compare-and-swap register on a dedicated git ref
 * of the fleet's shared remote. The ref's value is a commit whose only file
 * is `lease.json`; a write is `git push --force-with-lease=<ref>:<exact sha>`
 * and the remote decides the race. M4-D-11 was PROTOTYPE-BLOCKED and M4-P20's
 * probe closed it (delivery/verification/cross-environment-exclusion-probe.md:1).
 * Three of that probe's findings are load-bearing here and are implemented
 * rather than remembered:
 *
 *   1. ONLY `refs/heads/*` IS PUSHABLE. Tags, notes and custom namespaces are
 *      refused with HTTP 403 (CLAUDE.md standing warning 14, re-measured for
 *      this phase). So the "dedicated ref" is a dedicated BRANCH and the
 *      default is `refs/heads/tiphys/lease`, which is visible in branch
 *      listings and subject to any `refs/heads/**` ruleset.
 *   2. THE EXPECTATION MUST BE AN EXPLICIT SHA. The bare `--force-with-lease`
 *      form takes its expectation from the remote-tracking ref, so a routine
 *      fetch re-arms it; the probe measured it CLOBBERING a live holder with
 *      exit 0. `casWrite` below never emits the bare form.
 *   3. NONZERO DOES NOT MEAN "I LOST". A transport failure exits 1 too, so
 *      the result has THREE states and the indeterminate one is resolved by
 *      re-reading the register rather than assumed either way.
 *
 * WHY THE STALENESS SIGNAL IS A COUNTER AND NOT A CLOCK (M4-P21 criterion 6).
 * Two environments bring two clocks and `isExpired` compares a lease
 * timestamp against the local one (src/lock.ts:171). Comparing one
 * environment's wall clock against another's is exactly the measurement this
 * layer must not make. So the register carries a MONOTONIC FENCING COUNTER
 * that every write increments, and a holder is judged stale only when that
 * counter has not moved across a duration measured entirely on the OBSERVING
 * environment's own clock (two readings of one clock, never one reading of
 * two). Where the register is reachable the counter decides and the command
 * says `signal=counter`. Where it is not reachable there is no counter to
 * read, only the local clock, and a clock is not a cross-environment signal:
 * the command says `signal=clock` and REFUSES rather than falling back to
 * local-only exclusion, which is the vacuous green this layer exists to
 * prevent (criterion 7).
 *
 * C-2 (binding): nothing here reads a run identifier of a running program,
 * probes liveness, sends a signal, or reads the kernel's virtual filesystem.
 * Environment identity is a random id written once to a TRACKED fleet file
 * (criterion 3), so it survives a reclaim and travels with a clone of the
 * fleet; exclusion is decided by the register's counter and by git's own
 * compare-and-swap verdict, never by anything about a machine.
 *
 * DECLARATION, NOT INFERENCE (criterion 1). The layer is entered only when
 * the fleet home's own `package.json` declares it. With the field absent
 * every function here returns "absent" before any subprocess is spawned, so
 * a fleet that cannot reach a remote is not forced to switch the layer off
 * globally and today's behaviour is unchanged for everyone else.
 */

/** The dotted path of the opt-in field inside the fleet home's package.json. */
export const SHARED_EXCLUSION_FIELD = "tiphys.sharedExclusion";

/** The remote a declaration defaults to. */
export const DEFAULT_SHARED_REMOTE = "origin";

/**
 * The register ref a declaration defaults to. A BRANCH, deliberately: see
 * finding 1 in this file's header. The plan's prose names `refs/tiphys/lease`
 * and that namespace is refused by the shared remote this kernel is built
 * against, so the default is the pushable form and the ref stays
 * configurable for a remote with different rules.
 */
export const DEFAULT_SHARED_REF = "refs/heads/tiphys/lease";

/** The file inside the register commit that carries the lease document. */
export const REGISTER_DOCUMENT_NAME = "lease.json";

/**
 * The TRACKED fleet file carrying this environment's identity (criterion 3).
 * It sits at the fleet root, outside the gitignored set at src/fleet.ts:28,
 * so an environment that commits it keeps its identity across a reclaim and
 * a clone of that commit reads the same id.
 */
export const ENVIRONMENT_ID_FILE = "tiphys-environment.json";

/**
 * Where this environment records what it last saw in the register. It lives
 * under the gitignored `state/` prefix ON PURPOSE: it is a measurement taken
 * on THIS environment's clock and it must never travel, or the duration it
 * carries would be compared against a clock that did not produce it.
 */
export const OBSERVATION_FILE = join("state", "shared-lease.observed.json");

/** How long the counter must stand still before a holder is judged stale. */
export const DEFAULT_STALE_WINDOW_SECONDS = 900;

export interface SharedExclusionConfig {
  remote: string;
  ref: string;
  staleWindowSeconds: number;
}

export type SharedExclusionDeclaration =
  | { kind: "absent" }
  | { kind: "declared"; config: SharedExclusionConfig }
  | { kind: "invalid"; reason: string };

/** The register's value: one lease document per register commit. */
export interface SharedLeaseDocument {
  state: "held" | "free";
  envId: string;
  counter: number;
  acquiredAt: string;
  expiresAt: string;
  durationSeconds: number;
  ref: string;
}

export type RegisterRead =
  | { kind: "absent" }
  | { kind: "present"; sha: string; document: SharedLeaseDocument }
  | { kind: "corrupt"; sha: string; reason: string }
  | { kind: "unreachable"; reason: string };

export type CasOutcome =
  | { kind: "won"; sha: string }
  | { kind: "lost"; reason: string }
  | { kind: "indeterminate"; reason: string };

/** What this environment last saw, timed on this environment's own clock. */
export interface RegisterObservation {
  sha: string;
  counter: number;
  firstSeenMs: number;
}

/** Which of the two signals decided a shared-exclusion verdict. */
export type ExclusionSignal = "counter" | "clock";

export type SharedPreflight =
  | {
      kind: "proceed";
      signal: ExclusionSignal;
      expectedSha: string;
      nextCounter: number;
      takingOver: boolean;
      line: string;
      /** The document the register currently holds, when it holds one. */
      current?: SharedLeaseDocument;
    }
  | { kind: "refused"; signal: ExclusionSignal; line: string };

/* ------------------------------------------------------------------ */
/* Declaration                                                         */
/* ------------------------------------------------------------------ */

/**
 * THE ENTRY TYPE IS ESTABLISHED BEFORE THE OPEN. This function reads the
 * fleet `package.json` and `tiphys-environment.json`, both of them paths
 * this module did not create, and a bare `readFileSync` on a named pipe at
 * either blocked every lock subcommand forever with zero output. A
 * non-regular entry is now a REFUSAL naming the observed type, in the same
 * words doctor already uses, and it is NOT `absent`: reading "this cannot be
 * opened" as "the layer is off here" is exactly the shape that makes a guard
 * green everywhere and protective nowhere.
 */
function readJsonFile(path: string): { ok: true; value: unknown } | { ok: false; absent: boolean; reason: string } {
  const read = readRegularPathIfPresent(path);
  if (read.kind === "absent") {
    return { ok: false, absent: true, reason: `${path} is absent` };
  }
  if (read.kind === "refused") {
    return { ok: false, absent: false, reason: read.reason };
  }
  try {
    return { ok: true, value: JSON.parse(read.body) as unknown };
  } catch (error) {
    return { ok: false, absent: false, reason: `${path} does not parse as JSON: ${String(error)}` };
  }
}

function positiveNumber(value: unknown, fallback: number): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function nonEmptyString(value: unknown, fallback: string): string | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value;
}

/**
 * Read the fleet home's declaration. Absent means the layer is off and no
 * subprocess is spawned anywhere below; `false` is the same answer written
 * explicitly. A field that is present and unreadable is INVALID rather than
 * absent, because silently treating a typo as "off" is the shape that makes
 * a guard green everywhere and protective nowhere.
 */
export function readSharedExclusion(fleetRoot: string): SharedExclusionDeclaration {
  const read = readJsonFile(join(fleetRoot, "package.json"));
  if (!read.ok) {
    if (read.absent) {
      return { kind: "absent" };
    }
    return { kind: "invalid", reason: read.reason };
  }
  const root = read.value as Record<string, unknown> | null;
  if (root === null || typeof root !== "object") {
    return { kind: "absent" };
  }
  const section = root["tiphys"];
  if (section === undefined) {
    return { kind: "absent" };
  }
  if (section === null || typeof section !== "object" || Array.isArray(section)) {
    return { kind: "invalid", reason: `${SHARED_EXCLUSION_FIELD}: the "tiphys" section must be an object` };
  }
  const declared = (section as Record<string, unknown>)["sharedExclusion"];
  if (declared === undefined || declared === false) {
    return { kind: "absent" };
  }
  const raw: Record<string, unknown> =
    declared === true ? {} : (declared as Record<string, unknown>);
  if (declared !== true && (raw === null || typeof raw !== "object" || Array.isArray(raw))) {
    return {
      kind: "invalid",
      reason: `${SHARED_EXCLUSION_FIELD} must be true or an object, not ${JSON.stringify(declared)}`,
    };
  }
  const remote = nonEmptyString(raw["remote"], DEFAULT_SHARED_REMOTE);
  const ref = nonEmptyString(raw["ref"], DEFAULT_SHARED_REF);
  const staleWindowSeconds = positiveNumber(
    raw["staleWindowSeconds"],
    DEFAULT_STALE_WINDOW_SECONDS,
  );
  if (remote === undefined || ref === undefined || staleWindowSeconds === undefined) {
    return {
      kind: "invalid",
      reason:
        `${SHARED_EXCLUSION_FIELD} carries an unusable remote, ref or ` +
        `staleWindowSeconds: ${JSON.stringify(declared)}`,
    };
  }
  if (!ref.startsWith("refs/")) {
    return {
      kind: "invalid",
      reason: `${SHARED_EXCLUSION_FIELD}.ref must be a full ref name, got ${ref}`,
    };
  }
  return { kind: "declared", config: { remote, ref, staleWindowSeconds } };
}

/** The fleet root a lock path belongs to: <root>/state/orchestrator.lock. */
export function fleetRootForLockPath(lockPath: string): string {
  return dirname(dirname(lockPath));
}

/* ------------------------------------------------------------------ */
/* Environment identity (criterion 3)                                  */
/* ------------------------------------------------------------------ */

export interface EnvironmentIdentity {
  envId: string;
  /** True when this call generated the id rather than reading one. */
  generated: boolean;
  path: string;
}

/**
 * Read the environment id, or generate one and write it. The id is random
 * and is generated EXACTLY ONCE per fleet home: every later call reads the
 * file. Nothing about the machine enters it.
 */
export function ensureEnvironmentId(fleetRoot: string): EnvironmentIdentity {
  const path = join(fleetRoot, ENVIRONMENT_ID_FILE);
  const read = readJsonFile(path);
  if (read.ok) {
    const value = read.value as Record<string, unknown> | null;
    const existing = value === null ? undefined : value["envId"];
    if (typeof existing === "string" && existing !== "") {
      return { envId: existing, generated: false, path };
    }
  }
  const envId = randomUUID();
  const document = {
    envId,
    purpose:
      "Tiphys environment identity for the shared exclusion register. Random, " +
      "generated once, and tracked so it survives a reclaim. It says nothing " +
      "about any machine.",
  };
  const refusal = refuseOpenPathForWrite(path);
  if (refusal !== undefined) {
    throw new Error(refusal);
  }
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return { envId, generated: true, path };
}

/* ------------------------------------------------------------------ */
/* git plumbing                                                        */
/* ------------------------------------------------------------------ */

/**
 * THE COMMAND-SCOPED IDENTITY THE REGISTER COMMIT IS WRITTEN UNDER.
 *
 * `git commit-tree` REFUSES without an author, and CI runners carry no git
 * identity (CLAUDE.md standing warning 5), so a register write that relied
 * on ambient configuration would work on a developer's machine and fail on
 * every runner. These are the same two strings `tiphys init` already uses
 * for the fleet bootstrap commit (EXT-F-02 option B): set as command-scoped
 * environment variables on the invocation only, never written to user or
 * global git configuration. They are repeated here rather than imported
 * because `src/commands/init.ts` imports THIS module for the opt-in field,
 * and a test pins the two copies equal so a drift reddens instead of
 * surfacing as a runner-only failure.
 */
export const REGISTER_IDENTITY_NAME = "Tiphys Fleet";
export const REGISTER_IDENTITY_EMAIL = "fleet@tiphys.invalid";

interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[], input?: string): GitResult {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: REGISTER_IDENTITY_NAME,
      GIT_AUTHOR_EMAIL: REGISTER_IDENTITY_EMAIL,
      GIT_COMMITTER_NAME: REGISTER_IDENTITY_NAME,
      GIT_COMMITTER_EMAIL: REGISTER_IDENTITY_EMAIL,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * The line of a git stderr block carrying git's OWN rejection marker.
 *
 * NOT "the first line", and M4-P20 paid for the difference: with
 * `push.negotiate` true, git 2.43.0 emits a negotiation warning as the first
 * stderr line of EVERY file-transport push, accepted and refused alike, so a
 * signature taken from the first line cannot tell accept from refuse. The
 * marker below is git's own text, never this module's, so the refusal
 * signature stays captured rather than hand-written (T-003).
 */
export function rejectionLine(stderr: string): string | undefined {
  const lines = stderr.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.startsWith("! [rejected]"));
}

function firstLine(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines[0] ?? "git printed nothing";
}

/* ------------------------------------------------------------------ */
/* Reading the register                                                */
/* ------------------------------------------------------------------ */

function parseRegisterDocument(raw: string): SharedLeaseDocument | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const candidate = parsed as Partial<SharedLeaseDocument>;
  if (
    (candidate.state !== "held" && candidate.state !== "free") ||
    typeof candidate.envId !== "string" ||
    candidate.envId === "" ||
    typeof candidate.counter !== "number" ||
    !Number.isInteger(candidate.counter) ||
    candidate.counter < 1 ||
    typeof candidate.acquiredAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.durationSeconds !== "number" ||
    typeof candidate.ref !== "string"
  ) {
    return undefined;
  }
  return candidate as SharedLeaseDocument;
}

export function renderRegisterDocument(document: SharedLeaseDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Read the register. `ls-remote` establishes the value the compare-and-swap
 * will be armed against, then the object is fetched so the document can be
 * read. A failure at either step is UNREACHABLE, never "absent": the two
 * must not be conflated, because "absent" means "nobody holds the lease" and
 * would license an acquire.
 */
export function readRegister(fleetRoot: string, config: SharedExclusionConfig): RegisterRead {
  const listed = git(fleetRoot, ["ls-remote", config.remote, config.ref]);
  if (listed.status !== 0) {
    return { kind: "unreachable", reason: firstLine(listed.stderr) };
  }
  const line = listed.stdout.split("\n").map((entry) => entry.trim()).find(Boolean);
  if (line === undefined) {
    return { kind: "absent" };
  }
  const sha = line.split(/\s+/)[0] ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return { kind: "unreachable", reason: `ls-remote returned an unreadable line: ${line}` };
  }
  const fetched = git(fleetRoot, ["fetch", "--quiet", config.remote, config.ref]);
  if (fetched.status !== 0) {
    return { kind: "unreachable", reason: firstLine(fetched.stderr) };
  }
  const shown = git(fleetRoot, ["cat-file", "-p", `${sha}:${REGISTER_DOCUMENT_NAME}`]);
  if (shown.status !== 0) {
    return {
      kind: "corrupt",
      sha,
      reason: `${config.ref} at ${sha} carries no ${REGISTER_DOCUMENT_NAME}: ${firstLine(shown.stderr)}`,
    };
  }
  const document = parseRegisterDocument(shown.stdout);
  if (document === undefined) {
    return { kind: "corrupt", sha, reason: `${config.ref} at ${sha} does not parse as a lease document` };
  }
  return { kind: "present", sha, document };
}

/**
 * One compare-and-swap write. `expectedSha` is the value the caller read;
 * the empty string means "I expect the register to be absent". The EXACT-SHA
 * form is the only form emitted (finding 2 in this file's header).
 */
export function casWrite(
  fleetRoot: string,
  config: SharedExclusionConfig,
  expectedSha: string,
  document: SharedLeaseDocument,
): CasOutcome {
  const blob = git(fleetRoot, ["hash-object", "-w", "--stdin"], renderRegisterDocument(document));
  if (blob.status !== 0) {
    return { kind: "indeterminate", reason: `could not write the lease blob: ${firstLine(blob.stderr)}` };
  }
  const tree = git(
    fleetRoot,
    ["mktree"],
    `100644 blob ${blob.stdout.trim()}\t${REGISTER_DOCUMENT_NAME}\n`,
  );
  if (tree.status !== 0) {
    return { kind: "indeterminate", reason: `could not write the lease tree: ${firstLine(tree.stderr)}` };
  }
  const commit = git(fleetRoot, [
    "commit-tree",
    tree.stdout.trim(),
    "-m",
    `tiphys shared lease ${document.state} ${document.envId} counter ${String(document.counter)}`,
  ]);
  if (commit.status !== 0) {
    return { kind: "indeterminate", reason: `could not write the lease commit: ${firstLine(commit.stderr)}` };
  }
  const sha = commit.stdout.trim();
  const pushed = git(fleetRoot, [
    "push",
    `--force-with-lease=${config.ref}:${expectedSha}`,
    config.remote,
    `${sha}:${config.ref}`,
  ]);
  if (pushed.status === 0) {
    return { kind: "won", sha };
  }
  const rejected = rejectionLine(pushed.stderr);
  if (rejected !== undefined) {
    return { kind: "lost", reason: rejected };
  }
  /* NONZERO DOES NOT MEAN "I LOST" (finding 3). A transport failure exits 1
     with no rejection marker, so the register is re-read: a value that is no
     longer the expected one settles it as a loss, and anything else is
     reported as INDETERMINATE rather than guessed in either direction. */
  const after = readRegister(fleetRoot, config);
  if (after.kind === "present" && after.sha !== expectedSha && after.sha !== sha) {
    return { kind: "lost", reason: `${config.ref} moved to ${after.sha} while this write was in flight` };
  }
  if (after.kind === "present" && after.sha === sha) {
    return { kind: "won", sha };
  }
  return {
    kind: "indeterminate",
    reason: `push failed without a rejection marker: ${firstLine(pushed.stderr)}`,
  };
}

/* ------------------------------------------------------------------ */
/* The counter signal                                                  */
/* ------------------------------------------------------------------ */

export function readObservation(fleetRoot: string): RegisterObservation | undefined {
  const read = readJsonFile(join(fleetRoot, OBSERVATION_FILE));
  if (!read.ok) {
    return undefined;
  }
  const value = read.value as Partial<RegisterObservation> | null;
  if (
    value === null ||
    typeof value.sha !== "string" ||
    typeof value.counter !== "number" ||
    typeof value.firstSeenMs !== "number"
  ) {
    return undefined;
  }
  return { sha: value.sha, counter: value.counter, firstSeenMs: value.firstSeenMs };
}

export function writeObservation(fleetRoot: string, observation: RegisterObservation): void {
  const path = join(fleetRoot, OBSERVATION_FILE);
  mkdirSync(dirname(path), { recursive: true });
  const refusal = refuseOpenPathForWrite(path);
  if (refusal !== undefined) {
    throw new Error(refusal);
  }
  writeFileSync(path, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
}

export interface CounterJudgement {
  stale: boolean;
  /** How long the counter has stood still, on THIS environment's clock. */
  unchangedForMs: number;
  observation: RegisterObservation;
}

/**
 * Judge a holder by the FENCING COUNTER, using two readings of ONE clock.
 *
 * A holder is stale only when the register's sha and counter are the same
 * ones this environment first saw at `firstSeenMs` and that much of ITS OWN
 * time has passed. Any advance of the counter resets the measurement, which
 * is what makes a renewing holder safe no matter how far its clock is from
 * this one: the renewal is visible as an increment, and an increment is not
 * a timestamp.
 */
export function judgeByCounter(
  previous: RegisterObservation | undefined,
  sha: string,
  counter: number,
  nowMs: number,
  staleWindowMs: number,
): CounterJudgement {
  if (previous !== undefined && previous.sha === sha && previous.counter === counter) {
    const unchangedForMs = Math.max(0, nowMs - previous.firstSeenMs);
    return { stale: unchangedForMs >= staleWindowMs, unchangedForMs, observation: previous };
  }
  return {
    stale: false,
    unchangedForMs: 0,
    observation: { sha, counter, firstSeenMs: nowMs },
  };
}

/* ------------------------------------------------------------------ */
/* The decisions the lock layer asks for                               */
/* ------------------------------------------------------------------ */

export type SharedIntent = "acquire" | "renew" | "release";

export interface SharedPreflightInput {
  fleetRoot: string;
  config: SharedExclusionConfig;
  envId: string;
  intent: SharedIntent;
  takeover: boolean;
  nowMs: number;
}

function unreachableLine(config: SharedExclusionConfig, reason: string, intent: SharedIntent): string {
  return (
    `shared exclusion refused ${intent}: register ${config.ref} on ${config.remote} is ` +
    `unreachable (${reason}); signal=clock, because no fencing counter could be read and ` +
    `a local clock is not a cross-environment signal, so this refuses instead of falling ` +
    `back to local-only exclusion`
  );
}

/**
 * Decide whether the caller may proceed, WITHOUT touching anything. Every
 * refusal here happens before the local lease file is created, which is what
 * makes criterion 7's fail-closed assertion observable: an unreachable
 * register leaves no local lock behind.
 */
export function preflightShared(input: SharedPreflightInput): SharedPreflight {
  const { config, envId, intent, nowMs } = input;
  const read = readRegister(input.fleetRoot, config);
  if (read.kind === "unreachable") {
    return { kind: "refused", signal: "clock", line: unreachableLine(config, read.reason, intent) };
  }
  if (read.kind === "corrupt") {
    return {
      kind: "refused",
      signal: "counter",
      line:
        `shared exclusion refused ${intent}: register ${config.ref} at ${read.sha} is not a ` +
        `lease document (${read.reason}); signal=counter, no counter could be established, ` +
        `inspect the ref manually`,
    };
  }
  if (read.kind === "absent") {
    if (intent !== "acquire") {
      return {
        kind: "refused",
        signal: "counter",
        line:
          `shared exclusion refused ${intent}: register ${config.ref} on ${config.remote} ` +
          `holds no lease, so there is nothing for environment ${envId} to ${intent}; ` +
          `signal=counter`,
      };
    }
    return {
      kind: "proceed",
      signal: "counter",
      expectedSha: "",
      nextCounter: 1,
      takingOver: false,
      line:
        `shared exclusion: register ${config.ref} on ${config.remote} was absent, claiming ` +
        `it for environment ${envId} at counter 1; signal=counter`,
    };
  }

  const document = read.document;
  const judged = judgeByCounter(
    readObservation(input.fleetRoot),
    read.sha,
    document.counter,
    nowMs,
    config.staleWindowSeconds * 1000,
  );
  writeObservation(input.fleetRoot, judged.observation);
  const nextCounter = document.counter + 1;
  const held = document.state === "held";

  if (intent === "renew" || intent === "release") {
    if (!held || document.envId !== envId) {
      return {
        kind: "refused",
        signal: "counter",
        line:
          `shared exclusion refused ${intent}: register ${config.ref} is ${document.state} by ` +
          `environment ${document.envId} at counter ${String(document.counter)}, not by ${envId}; ` +
          `signal=counter, the register sha ${read.sha} is left unchanged`,
      };
    }
    return {
      kind: "proceed",
      signal: "counter",
      expectedSha: read.sha,
      nextCounter,
      takingOver: false,
      current: document,
      line:
        `shared exclusion: ${intent} by environment ${envId} advances ${config.ref} to counter ` +
        `${String(nextCounter)}; signal=counter`,
    };
  }

  if (!held) {
    return {
      kind: "proceed",
      signal: "counter",
      expectedSha: read.sha,
      nextCounter,
      takingOver: false,
      current: document,
      line:
        `shared exclusion: register ${config.ref} was released by environment ${document.envId}, ` +
        `claiming it for ${envId} at counter ${String(nextCounter)}; signal=counter`,
    };
  }

  if (!judged.stale) {
    return {
      kind: "refused",
      signal: "counter",
      line:
        `shared exclusion refused acquire: register ${config.ref} is held by environment ` +
        `${document.envId} until ${document.expiresAt}; signal=counter, fencing counter ` +
        `${String(document.counter)} has stood still for ${String(judged.unchangedForMs)}ms of the ` +
        `${String(config.staleWindowSeconds * 1000)}ms this environment requires, and no clock ` +
        `comparison was made`,
    };
  }

  if (!input.takeover) {
    return {
      kind: "refused",
      signal: "counter",
      line:
        `shared exclusion refused acquire: register ${config.ref} is held by environment ` +
        `${document.envId} and its fencing counter ${String(document.counter)} has stood still for ` +
        `${String(judged.unchangedForMs)}ms, which is stale; signal=counter, takeover is explicit: ` +
        `lock acquire --take-over`,
    };
  }

  return {
    kind: "proceed",
    signal: "counter",
    expectedSha: read.sha,
    nextCounter,
    takingOver: true,
    current: document,
    line:
      `shared exclusion: taking over ${config.ref} from environment ${document.envId}, whose ` +
      `fencing counter ${String(document.counter)} stood still for ${String(judged.unchangedForMs)}ms; ` +
      `environment ${envId} advances it to ${String(nextCounter)}; signal=counter`,
  };
}

/**
 * The one line a register write that was NOT won reports. It lives here
 * rather than at the call site in `src/lock.ts` because it names the
 * staleness basis, and the C-2 structural inspection over that file
 * (test/lock.test.ts:534) forbids that vocabulary there; keeping the
 * sentence in one place also means a reader sees the same wording whichever
 * mutation lost.
 */
export function casFailureLine(ref: string, outcome: CasOutcome): string {
  if (outcome.kind === "won") {
    return `the compare-and-swap on ${ref} was won`;
  }
  return (
    `the compare-and-swap on ${ref} was ${outcome.kind}: ${outcome.reason}; ` +
    `signal=counter`
  );
}

/** Build the document a won preflight should publish. */
export function buildRegisterDocument(input: {
  state: "held" | "free";
  envId: string;
  counter: number;
  nowMs: number;
  durationSeconds: number;
  ref: string;
  acquiredAt?: string;
}): SharedLeaseDocument {
  return {
    state: input.state,
    envId: input.envId,
    counter: input.counter,
    acquiredAt: input.acquiredAt ?? new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + input.durationSeconds * 1000).toISOString(),
    durationSeconds: input.durationSeconds,
    ref: input.ref,
  };
}

/* ------------------------------------------------------------------ */
/* What the rest of the kernel asks the register (M4-P22)              */
/* ------------------------------------------------------------------ */

/**
 * THE FOUR STATUSES, AS A CLOSED SET (M4-P22 criterion 1).
 *
 * `doctor` prints exactly one of them and a test compares the printed
 * leading token against this array, so a fifth status cannot be added by
 * writing a new sentence somewhere: it has to be added here, where the
 * comparison sees it.
 *
 * THE FOURTH IS NEVER PASS. That is the DR-0038 shape reused rather than
 * reinvented: a check whose question could not be asked reports a third
 * state instead of being forced into a binary, because an unreachable
 * register reported as `free` would license exactly the second live
 * orchestrator this layer exists to refuse
 * (delivery/decisions/DR-0038-the-declared-single-family-review-exception.md:1).
 */
export const SHARED_LOCK_STATUS_TOKENS = [
  "not-declared",
  "free",
  "held",
  "unreachable",
] as const;

export type SharedLockStatusToken = (typeof SHARED_LOCK_STATUS_TOKENS)[number];

export type SharedLockStatus =
  | { token: "not-declared"; text: string }
  | { token: "free"; text: string }
  | { token: "held"; envId: string; expiresAt: string; text: string }
  | { token: "unreachable"; reason: string; text: string };

function unreachableStatus(reason: string): SharedLockStatus {
  return { token: "unreachable", reason, text: `unreachable ${reason}` };
}

/**
 * A PURE READ of this environment's identity: it never generates one.
 *
 * `ensureEnvironmentId` above writes a file when none is there, which is
 * right for `lock acquire`, the command that legitimately enters the layer
 * and is about to publish a register document. It is wrong for a GUARD: a
 * refusal must create nothing, and `doctor` must diagnose a fleet without
 * changing it. An absent identity file therefore reads as "this environment
 * is not the one the register names", which is the fail-closed answer.
 */
export function readEnvironmentId(fleetRoot: string): string | undefined {
  const read = readJsonFile(join(fleetRoot, ENVIRONMENT_ID_FILE));
  if (!read.ok) {
    return undefined;
  }
  const value = read.value as Record<string, unknown> | null;
  const existing = value === null ? undefined : value["envId"];
  return typeof existing === "string" && existing !== "" ? existing : undefined;
}

/**
 * The register's state as one of the four statuses, WITHOUT writing an
 * observation and WITHOUT generating an identity.
 *
 * `preflightShared` is deliberately not used here even though it answers a
 * similar question, because it WRITES `state/shared-lease.observed.json` as
 * part of judging staleness. A diagnosis that moves the thing it diagnoses
 * is not a diagnosis, and the staleness judgement is not wanted here anyway:
 * see `guardSharedRegister` below for why a stale holder still refuses.
 *
 * It DOES fetch, because `readRegister` fetches: the register object has to
 * be local before its document can be read. That touches `.git/FETCH_HEAD`
 * in the fleet home and nothing else, and it is stated here rather than left
 * for a reader to discover.
 *
 * TWO CONDITIONS COLLAPSE INTO `unreachable` AND BOTH ARE NAMED IN THE
 * REASON. A declaration that is present and unusable, and a register whose
 * document does not parse, are not `free` and cannot be rendered as
 * `held <envId> until <t>` because neither yields an envId or an expiry. The
 * criterion's set is closed at four, so they take the one status that means
 * "this question could not be answered", and the reason says which of them
 * it was.
 */
export function sharedLockStatus(fleetRoot: string): SharedLockStatus {
  const declaration = readSharedExclusion(fleetRoot);
  if (declaration.kind === "absent") {
    return {
      token: "not-declared",
      text:
        `not-declared (${SHARED_EXCLUSION_FIELD} is absent from this fleet ` +
        `home's package.json, so the cross-environment layer is off here)`,
    };
  }
  if (declaration.kind === "invalid") {
    return unreachableStatus(
      `the declaration naming the register is unusable: ${declaration.reason}`,
    );
  }
  const config = declaration.config;
  const where = `register ${config.ref} on ${config.remote}`;
  const read = readRegister(fleetRoot, config);
  if (read.kind === "unreachable") {
    return unreachableStatus(`${where} could not be read: ${read.reason}`);
  }
  if (read.kind === "corrupt") {
    return unreachableStatus(`${where} is not a lease document: ${read.reason}`);
  }
  if (read.kind === "absent") {
    return { token: "free", text: `free (${where} holds no lease yet)` };
  }
  const document = read.document;
  if (document.state === "free") {
    return {
      token: "free",
      text:
        `free (${where} was released by environment ${document.envId} at ` +
        `fencing counter ${String(document.counter)})`,
    };
  }
  return {
    token: "held",
    envId: document.envId,
    expiresAt: document.expiresAt,
    text:
      `held ${document.envId} until ${document.expiresAt} (${where}, fencing ` +
      `counter ${String(document.counter)})`,
  };
}

/**
 * What a task-mutating command is allowed to do, given the register.
 *
 * `off` is the fleet that never opted in, and it is returned before any
 * subprocess is spawned, so nothing about today's behaviour changes for a
 * fleet home with no declaration.
 */
export type SharedMutationVerdict =
  | { kind: "off" }
  | { kind: "allowed"; status: SharedLockStatus }
  | { kind: "refused"; reason: string };

/**
 * THE CROSS-ENVIRONMENT HALF OF THE HOLDERSHIP GUARD (M4-P22 criteria 2
 * and 3).
 *
 * `checkHoldership` (src/task.ts:439) answers "does THIS process hold THIS
 * filesystem's lease". That question is answered entirely inside one fleet
 * home, and src/lock.ts:63 says so: the local lease excludes within one
 * filesystem and one clock. So in the state this function exists for, the
 * local lease held by THIS environment and the shared register naming
 * ANOTHER one, the old guard is GREEN and the fleet has two orchestrators
 * mutating one set of tasks. That is the dangerous state, and a test that
 * holds neither lease is green without this function and proves nothing.
 *
 * WHY A STALE HOLDER STILL REFUSES. `judgeByCounter` exists so that a lease
 * whose fencing counter has stood still can be taken over, and that takeover
 * is a LEASE operation: `tiphys lock acquire --take-over` advances the
 * counter under the taking-over environment's id, and only then does the
 * register name this environment. Reading staleness here instead would give
 * `spawn` and `teardown` their own opinion about who holds the fleet, which
 * is a second verdict about one lease from a second place, and it would have
 * to write the observation file to reach it. The refusal names the command
 * that resolves it, so the remedy is reachable rather than merely correct.
 *
 * THE REASON IS ONE LINE, and the callers hand it straight to the same
 * single-reason path every other refusal uses.
 */
export function guardSharedRegister(
  fleetRoot: string,
  command: string,
): SharedMutationVerdict {
  const status = sharedLockStatus(fleetRoot);
  if (status.token === "not-declared") {
    return { kind: "off" };
  }
  if (status.token === "unreachable") {
    return {
      kind: "refused",
      reason:
        `shared exclusion refused ${command}: ${status.text}; a register that ` +
        `cannot be read cannot show whether another environment is running this ` +
        `fleet, so this refuses rather than falling back to local-only ` +
        `exclusion; signal=clock, because no fencing counter could be read`,
    };
  }
  if (status.token === "free") {
    return { kind: "allowed", status };
  }
  const mine = readEnvironmentId(fleetRoot);
  if (mine !== undefined && mine === status.envId) {
    /* THE IDENTITY IS NOT ENOUGH, AND THE PLAN SAYS WHY IN BOTH DIRECTIONS.
       M4-P21 criterion 3 requires `tiphys-environment.json` to be TRACKED so
       it survives a reclaim and TRAVELS WITH THE CLONE, and
       test/cross-environment-lock.test.ts:328 asserts exactly that. M4-P22
       criteria 2 and 3 require a clone to be refused as a different
       environment. Both are delivered, and composed they cancel: `tiphys
       sync` commits and pushes that file (it is not under any prefix in
       FLEET_IGNORED), so every clone of a synced fleet reads the SAME id and
       this comparison is TRUE in a place that holds nothing.

       WHAT DOES NOT TRAVEL is `state/`, which IS in FLEET_IGNORED, so the
       lease artifact is per environment BY CONSTRUCTION rather than by a
       rule someone has to remember. Requiring it here breaks no criterion's
       letter: the tracked file is unchanged and still travels, and nothing
       in `src/` or `bin/` consumed the travels-with-the-clone property for
       anything but this comparison.

       THE COST, stated rather than discovered: an environment whose `state/`
       is lost while its container continues is refused here until the stale
       window lets it take the register over, which is the smoothing
       criterion 3's tracking was meant to provide. That is a deliberate
       trade of convenience after a reclaim for a guard that a clone cannot
       walk through.

       EXPIRY IS DELIBERATELY NOT JUDGED HERE. `checkHoldership`
       (src/task.ts:518) runs BEFORE this guard in both callers
       (src/spawn.ts:1005 and src/teardown.ts:438) and refuses an expired or
       wrongly-held lease already. A second expiry comparison in a second
       place is the drift src/lock.ts:217 exists to prevent, and this guard
       does not need it: the question it asks is whether this filesystem
       carries the lease artifact the register entry stands on. */
    const local = localLeaseArtifact(fleetRoot);
    if (local.kind === "present") {
      return { kind: "allowed", status };
    }
    return {
      kind: "refused",
      reason:
        `shared exclusion refused ${command}: the shared register names ` +
        `environment ${status.envId} as holding this fleet until ` +
        `${status.expiresAt}, and this fleet home carries that environment's ` +
        `tracked identity but not its lease (${local.reason}); ` +
        `${ENVIRONMENT_ID_FILE} is tracked and travels with a clone, so it ` +
        `names the FLEET's environment and not THIS one, while ${LOCK_FILE} ` +
        `is gitignored and cannot travel; acquire the fleet here with: ` +
        `tiphys lock acquire, or take it over with: ` +
        `tiphys lock acquire --take-over; signal=counter`,
    };
  }
  return {
    kind: "refused",
    reason:
      `shared exclusion refused ${command}: the shared register names ` +
      `environment ${status.envId} as holding this fleet until ` +
      `${status.expiresAt}, and this environment is ` +
      `${mine ?? "not identified: " + ENVIRONMENT_ID_FILE + " is absent"}; ` +
      `the local lease is evidence about this filesystem only, so mutating ` +
      `tasks here would run a second orchestrator over one fleet; take the ` +
      `fleet over with: tiphys lock acquire --take-over; signal=counter`,
  };
}

/**
 * IS THE LEASE ARTIFACT THE REGISTER ENTRY STANDS ON PRESENT ON THIS
 * FILESYSTEM?
 *
 * Deliberately NOT `leaseStatus` from src/lock.ts. That module imports this
 * one, and the `src/` import graph is a strict DAG at this head; importing it
 * back would make the first cycle in the kernel to answer a question that
 * needs one field. So this reads the lease file through the same guarded
 * read every other path in this module now uses, and asks only whether a
 * parsed lease with a holder is there.
 */
function localLeaseArtifact(
  fleetRoot: string,
): { kind: "present"; holderId: string } | { kind: "absent"; reason: string } {
  const path = join(fleetRoot, LOCK_FILE);
  const read = readRegularPathIfPresent(path);
  if (read.kind === "absent") {
    return { kind: "absent", reason: `${LOCK_FILE} is absent here` };
  }
  if (read.kind === "refused") {
    return { kind: "absent", reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch {
    return { kind: "absent", reason: `${LOCK_FILE} does not parse as a lease` };
  }
  const holderId = (parsed as { holderId?: unknown } | null)?.holderId;
  if (typeof holderId !== "string" || holderId === "") {
    return { kind: "absent", reason: `${LOCK_FILE} names no holder` };
  }
  return { kind: "present", holderId };
}
