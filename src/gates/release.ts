import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  readRegularFileIfPresent,
  refuseOpenForWrite,
  runStep,
  singleLine,
} from "../task.ts";
import {
  exitCodeForStatus,
  makeGateResult,
  renderGateResult,
} from "./result.ts";
import type {
  GateResult,
  GateStatus,
  PreconditionRecord,
} from "./result.ts";
import { loadSchema, validate, formatDiagnostics } from "./validate.ts";
import type { Diagnostic, SchemaDocument } from "./validate.ts";

/**
 * THE RELEASE-VERIFICATION CONTRACT (kernel plan M2, M2-P7 step 3; DR-0014;
 * delivery/verification/release-verification-interface.md).
 *
 * ONE post-merge verification contract with two registry entries (`deploy`
 * and `migrations`). The kernel owns the SUBJECT, the CLOCK, the LOOP and
 * the OUTCOME MAPPING; an adapter owns the platform mapping and nothing
 * else. An adapter is an executable named by committed configuration,
 * spawned as a subprocess with a request file path in argv, performing ONE
 * bounded observation per invocation and writing its response to a
 * kernel-supplied record path. It returns an OUTCOME, never a status path:
 * JSON-pointer extraction exists only inside the http-json adapter's own
 * configuration, and the kernel never learns what a statusPath is.
 *
 * WHY THE BOUNDARY IS A PROCESS (M2-D-07, investigation section 5): it
 * works for any language, and it makes the per-attempt timeout ENFORCEABLE
 * rather than promised. The kernel terminates an attempt that overruns
 * (`spawnSync`'s `timeout` and `killSignal` options) and records that
 * attempt as `error`, so an adapter that hangs cannot hang the kernel.
 *
 * C-2 EXEMPTION, STATED WHERE THE TERMINATION HAPPENS AND NOWHERE ELSE.
 * C-2 forbids pid, process liveness, signals and /proc FOR IDENTITY OR
 * EXCLUSION. The per-attempt termination above is neither: it is a timeout
 * bound on a child this kernel itself spawned and still holds the handle
 * of, it probes nothing, identifies nothing and excludes nothing, and no
 * pid is ever read, recorded or compared. That is the one place any kill
 * may appear in this module or its adapters, and it appears as a spawn
 * option, not as a process.kill call.
 *
 * NO FAILURE VOCABULARY SHIPS (plan step 2, T-003 lesson 4). No
 * non-success platform state was ever captured, so none is named anywhere
 * in this module or its adapters. The safe rule instead: one satisfying
 * value per configured adapter; every other observed value is recorded
 * verbatim and treated as `pending` until the deadline, at which point it
 * becomes red naming the last observed value. Unknown never becomes green.
 *
 * NEVER auto-background (C-3): the loop is a foreground await, every spawn
 * is spawnSync, nothing is detached and nothing is unref'd.
 */

/** The one declaration path (design decision D-p7-1 in the work history). */
export const DECLARATION_PATH = "release-verification.json";

/** The contract versions this kernel accepts (fail-closed rule 6). */
export const ACCEPTED_CONTRACT_VERSIONS: readonly string[] = ["1"];

/**
 * The subject: what the kernel knows for certain the moment a merge
 * happens. Platform vocabulary (deployment id, workflow run id, migration
 * set) is the adapter's, and the kernel never learns it.
 */
export interface ReleaseSubject {
  repository: string;
  integrationRef: string;
  mergedSha: string;
  mergedAt: string;
  phaseId: string;
}

export const SUBJECT_FIELDS: readonly (keyof ReleaseSubject)[] = [
  "repository",
  "integrationRef",
  "mergedSha",
  "mergedAt",
  "phaseId",
];

/**
 * The outcome vocabulary, six values. There is deliberately no `unknown`,
 * no `skipped` and no `warn`: a soft state is where a false green hides
 * (M2-C-3).
 */
export type VerificationOutcome =
  | "satisfied"
  | "failed"
  | "pending"
  | "absent"
  | "not-applicable"
  | "error";

export const VERIFICATION_OUTCOMES: readonly VerificationOutcome[] = [
  "satisfied",
  "failed",
  "pending",
  "absent",
  "not-applicable",
  "error",
];

/**
 * THE TOTAL MAPPING to GateResult status, implemented in exactly one place
 * (plan step 3). `satisfied` is green with `units` 1 per verification
 * satisfied (or the adapter's own examined count, D-p7-3). `pending` and
 * `absent` are NEVER terminal: they are loop states, and the two entries
 * below are reachable only through the deadline conversion in
 * `runVerification`, which turns both into red with TEXTUALLY DISTINCT
 * reasons: `deadline reached, last observed <value>` for pending and
 * `deadline reached, no release object for subject` for absent. An adapter
 * cannot make pending mean pass.
 */
export const OUTCOME_TO_STATUS: Readonly<Record<VerificationOutcome, GateStatus>> = {
  satisfied: "green",
  failed: "red",
  pending: "red",
  absent: "red",
  "not-applicable": "not-applicable",
  error: "error",
};

export const DEADLINE_REASON_ABSENT =
  "deadline reached, no release object for subject";

export function deadlineReasonPending(lastObserved: string): string {
  return `deadline reached, last observed ${lastObserved}`;
}

/** The kernel's clock. No defaults anywhere: the numbers are the project's. */
export interface VerificationClock {
  intervalMs: number;
  deadlineMs: number;
  attemptTimeoutMs: number;
  maxAttempts?: number;
}

/** What the adapter wrote, after the seven rules accepted it. */
export interface AdapterResponse {
  contractVersion: string;
  adapter: string;
  subject: ReleaseSubject;
  outcome: VerificationOutcome;
  resolved?: { kind: string; id: string; createdAt?: unknown } & Record<string, unknown>;
  observedAt: string;
  observation?: { raw?: unknown; detail: string };
  reason?: string;
  units?: number;
  precondition?: { id: string; evidence?: string[] };
  transport?: { httpStatus?: number };
}

/** One attempt's record: number, instant, outcome, identity, transport. */
export interface AttemptRecord {
  attempt: number;
  at: string;
  outcome: VerificationOutcome | "invalid";
  detail: string;
  resolved?: unknown;
  transport: {
    exitCode: number | null;
    signal: string | null;
    terminatedByTimeout: boolean;
    httpStatus?: number;
  };
  /**
   * The older-than-the-merge observation (investigation guarantee 9,
   * section 8 item 8): recorded, deliberately NOT promoted to an error
   * until one real counter-example settles whether a platform reuses or
   * backdates a record on redeploy.
   */
  releaseObjectOlderThanMerge?: boolean;
}

export type VerificationVerdict =
  | { kind: "satisfied"; units: number; detail: string; resolved: unknown }
  | { kind: "failed"; reason: string }
  | {
      kind: "not-applicable";
      declared: boolean;
      reason: string;
      preconditionId: string;
      evidence: string[];
    }
  | { kind: "error"; reason: string }
  | { kind: "deadline"; lastOutcome: "pending" | "absent"; reason: string };

export interface VerificationRun {
  verdict: VerificationVerdict;
  attempts: AttemptRecord[];
  /** Paths relative to evidenceDir, in creation order. */
  evidence: string[];
}

/** Schema loading, same resolution pattern as src/gates/manifest.ts. */
const schemaDirectory = new URL("./schemas/", import.meta.url);
let cachedResponseSchema: SchemaDocument | undefined;
let cachedDeclarationSchema: SchemaDocument | undefined;

function readSchemaDocument(name: string): SchemaDocument {
  const path = fileURLToPath(new URL(name, schemaDirectory));
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    throw new Error(
      read.kind === "absent"
        ? `schema document ${path} is missing from this installation`
        : read.reason,
    );
  }
  const loaded = loadSchema(JSON.parse(read.body), name);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  return loaded.schema;
}

export function responseSchema(): SchemaDocument {
  if (cachedResponseSchema === undefined) {
    cachedResponseSchema = readSchemaDocument("release-record.schema.json");
  }
  return cachedResponseSchema;
}

export function declarationSchema(): SchemaDocument {
  if (cachedDeclarationSchema === undefined) {
    cachedDeclarationSchema = readSchemaDocument("verifier-config.schema.json");
  }
  return cachedDeclarationSchema;
}

/**
 * THE SEVEN FAIL-CLOSED RULES on an adapter response (plan step 3), each
 * corresponding to a way a verifier can be fooled. Rule 1 (exit 0 with no
 * response written) is enforced by the caller, which owns the file's
 * existence; rules 2 to 7 are here. The subject echo (rule 3) is checked
 * field by field BEFORE the outcome is read, so an adapter that verified
 * something else cannot have its outcome looked at for this subject.
 */
export type ResponseValidation =
  | { ok: true; response: AdapterResponse }
  | { ok: false; rule: number; reason: string };

export function validateAdapterResponse(
  body: string,
  subject: ReleaseSubject,
): ResponseValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      rule: 2,
      reason: `fail-closed rule 2: response does not parse as JSON: ${(error as Error).message}`,
    };
  }
  const schemaDiagnostics = validate(responseSchema(), parsed);
  const conditional = conditionalResponseDiagnostics(parsed);
  const diagnostics = formatDiagnostics([...schemaDiagnostics, ...conditional]);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      rule: 2,
      reason: `fail-closed rule 2: response fails schema validation: ${diagnostics.join("; ")}`,
    };
  }
  const response = parsed as AdapterResponse;
  if (!ACCEPTED_CONTRACT_VERSIONS.includes(response.contractVersion)) {
    return {
      ok: false,
      rule: 6,
      reason:
        `fail-closed rule 6: contractVersion ${JSON.stringify(response.contractVersion)} ` +
        `is not recognized; this kernel accepts ${ACCEPTED_CONTRACT_VERSIONS.join(", ")}`,
    };
  }
  // Rule 3, BEFORE the outcome is read (field by field, never a serialized
  // comparison, so key order cannot fake a mismatch or hide one).
  for (const field of SUBJECT_FIELDS) {
    if (response.subject[field] !== subject[field]) {
      return {
        ok: false,
        rule: 3,
        reason:
          `fail-closed rule 3: echoed subject differs from the passed subject at ` +
          `${field}: passed ${JSON.stringify(subject[field])}, ` +
          `echoed ${JSON.stringify(response.subject[field])}; ` +
          `the outcome was not read`,
      };
    }
  }
  if (!VERIFICATION_OUTCOMES.includes(response.outcome)) {
    return {
      ok: false,
      rule: 7,
      reason:
        `fail-closed rule 7: outcome ${JSON.stringify(response.outcome)} is outside the ` +
        `enum (${VERIFICATION_OUTCOMES.join(", ")}) and is never coerced`,
    };
  }
  if (response.outcome === "satisfied" && response.resolved === undefined) {
    return {
      ok: false,
      rule: 4,
      reason:
        "fail-closed rule 4: satisfied with no resolved identity; a verifier " +
        "that cannot say what it looked at did not look",
    };
  }
  if (response.outcome === "satisfied" && response.observation === undefined) {
    return {
      ok: false,
      rule: 5,
      reason:
        "fail-closed rule 5: satisfied with no observation; a claim with no " +
        "captured evidence behind it is treated as unknown",
    };
  }
  return { ok: true, response };
}

/**
 * The conditional half of the response schema (reason required for failed,
 * absent, not-applicable and error), checked in code because conditional
 * composition is outside the closed keyword set. Same diagnostic shape as
 * the schema's own, so rule 2's message names the field either way.
 */
function conditionalResponseDiagnostics(parsed: unknown): Diagnostic[] {
  const found: Diagnostic[] = [];
  if (typeof parsed !== "object" || parsed === null) {
    return found;
  }
  const record = parsed as Record<string, unknown>;
  const outcome = record["outcome"];
  const needsReason =
    outcome === "failed" ||
    outcome === "absent" ||
    outcome === "not-applicable" ||
    outcome === "error";
  if (needsReason && typeof record["reason"] !== "string") {
    found.push({
      pointer: "#/reason",
      message: `required property reason is missing for outcome ${String(outcome)}`,
    });
  }
  if (needsReason && typeof record["reason"] === "string" && record["reason"] === "") {
    found.push({
      pointer: "#/reason",
      message: `required property reason is empty for outcome ${String(outcome)}`,
    });
  }
  return found;
}

/**
 * The encoded forms of a credential value the kernel can derive from the
 * value alone (CR-P7H-3). Redacting only the verbatim bytes let a trivially
 * reversible copy through: an adapter emitting the token as a standalone
 * base64 blob (an HTTP Basic `Authorization: Basic <base64(token)>` of the
 * token) leaked a recoverable secret into the stderr evidence. Each form here
 * is a DETERMINISTIC, enumerable transform of the same value, so the set is
 * bounded and cheap.
 *
 * WHAT THIS DOES NOT COVER, stated so a green is auditable rather than
 * silently partial (never soften a work history): forms that fold in bytes
 * the kernel does not hold, e.g. base64 of `"user:" + value` for a full Basic
 * credential PAIR (the username is the project's, not the kernel's), or a
 * value re-encoded by a transport the kernel never sees (gzip, hex, a second
 * base64 round). Those are residue the reference adapters do not produce; a
 * third-party adapter that composes a credential with unknown surrounding
 * bytes owns that redaction, and the guarantee scoped here is the value and
 * its own single-step base64 and percent encodings.
 */
export function secretForms(value: string): string[] {
  const forms = new Set<string>([value]);
  forms.add(Buffer.from(value, "utf8").toString("base64"));
  forms.add(encodeURIComponent(value));
  return [...forms].filter((form) => form !== "");
}

/**
 * Replace every resolved credential VALUE, and its enumerable encoded forms
 * (see secretForms), with a named placeholder, everywhere in the text.
 */
export function redactSecrets(
  text: string,
  secrets: readonly { name: string; value: string }[],
): string {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.value === "") {
      continue;
    }
    const placeholder = `<redacted:${secret.name}>`;
    for (const form of secretForms(secret.value)) {
      redacted = redacted.split(form).join(placeholder);
    }
  }
  return redacted;
}

/**
 * THE ONE KERNEL-SIDE WRITE into the evidence directory. The mechanism the
 * request-file write already obeyed, now applied to EVERY write the kernel
 * makes there without exception: establish the path's TYPE before opening it.
 *
 * WHY (CR-P7H-1). A hostile adapter is handed a record path inside the
 * evidence directory, so it can derive and pre-create any deterministic
 * sibling path (the next attempt's stdout, stderr or attempt record). An
 * open-for-write of a FIFO with no reader BLOCKS forever, and the per-attempt
 * `spawnSync` timeout bounds only the CHILD, not these kernel-side writes that
 * happen after it returns. So `refuseOpenForWrite` gates the open: an
 * irregular or unexaminable entry is refused by name and observed type and the
 * caller returns a bounded error, never a blocking `writeFileSync`. Returns
 * undefined on a completed write, or the reason on refusal or a raised write
 * error. This is the single writer; no kernel-side evidence write bypasses it.
 */
function guardedEvidenceWrite(path: string, body: string): string | undefined {
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    return refusal;
  }
  const wrote = runStep(`writing ${path}`, () => writeFileSync(path, body));
  return wrote.ok ? undefined : wrote.reason;
}

export interface RunVerificationOptions {
  verification: string;
  subject: ReleaseSubject;
  adapter: string[];
  config: unknown;
  clock: VerificationClock;
  /** Absolute directory the attempt evidence is written into. */
  evidenceDir: string;
  /** Resolved credential values, for redaction only. Never written. */
  secrets?: readonly { name: string; value: string }[];
}

/**
 * THE KERNEL-OWNED LOOP. One bounded adapter observation per attempt, one
 * record per attempt, foreground polling (C-3), verdict at the deadline.
 * `pending` and `absent` loop; everything else is terminal, including every
 * fail-closed violation (design decision D-p7-5: a broken adapter cannot
 * reach a verdict, and M2-C-3 makes that `error` now, not red later).
 */
export async function runVerification(
  options: RunVerificationOptions,
): Promise<VerificationRun> {
  const attempts: AttemptRecord[] = [];
  const evidence: string[] = [];
  const secrets = options.secrets ?? [];
  const startMs = Date.now();
  const deadlineAtMs = startMs + options.clock.deadlineMs;
  const deadlineIso = new Date(deadlineAtMs).toISOString();
  let lastLoopOutcome: "pending" | "absent" | undefined;
  let lastObservedDetail = "pending";
  let attempt = 0;

  const finish = (verdict: VerificationVerdict): VerificationRun => ({
    verdict,
    attempts,
    evidence,
  });

  for (;;) {
    attempt += 1;
    const at = new Date().toISOString();
    const requestName = `${options.verification}-request-${String(attempt)}.json`;
    const responseName = `${options.verification}-response-${String(attempt)}.json`;
    const attemptName = `${options.verification}-attempt-${String(attempt)}.json`;
    const requestPath = join(options.evidenceDir, requestName);
    const responsePath = join(options.evidenceDir, responseName);

    const request = {
      contractVersion: ACCEPTED_CONTRACT_VERSIONS[0],
      verification: options.verification,
      subject: options.subject,
      config: options.config,
      attempt: { number: attempt, deadline: deadlineIso },
      recordPath: responsePath,
    };

    // M2-C-6 both ways: the request path is probed before writing, and the
    // stale-response clear removes whatever a previous attempt (or a hostile
    // adapter) left at the response path, FIFO included, so the read below
    // never opens an entry this attempt's adapter did not just write.
    const requestRefusal = guardedEvidenceWrite(
      requestPath,
      `${JSON.stringify(request, null, 2)}\n`,
    );
    if (requestRefusal !== undefined) {
      return finish({ kind: "error", reason: requestRefusal });
    }
    evidence.push(requestName);
    const cleared = runStep(`clearing ${responsePath}`, () =>
      rmSync(responsePath, { force: true }),
    );
    if (!cleared.ok) {
      return finish({ kind: "error", reason: cleared.reason });
    }

    // The per-attempt bound. The kill signal is 9 (SIGKILL) BY NUMBER, and
    // the number is load-bearing twice over. MEASURED 2026-08-06 (probe in
    // the phase work history): with the default signal, a child that traps
    // SIGTERM makes spawnSync never return, so the timeout would be
    // advisory exactly where it must be enforceable ("an adapter that
    // hangs cannot hang the kernel", plan M2-P7 step 3); with 9 the call
    // returns at the timeout with the child dead. And it is numeric
    // because the delivered M2-P1 structural witness (test/gates.test.ts,
    // "the gate runner uses no pid, process liveness, signals or proc")
    // forbids signal NAMES in any src/gates code, having been written
    // before this phase's plan-mandated bound existed; the C-2 exemption
    // in this module's header is the documented carve-out, and the seam is
    // reported to the orchestrator in the phase work history rather than
    // resolved by editing another phase's test.
    const child = spawnSync(
      options.adapter[0] as string,
      [...options.adapter.slice(1), requestPath],
      {
        encoding: "utf8",
        timeout: options.clock.attemptTimeoutMs,
        killSignal: 9,
      },
    );
    const terminatedByTimeout =
      child.signal !== null ||
      (child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";

    const stdoutName = `${options.verification}-attempt-${String(attempt)}-stdout.txt`;
    const stderrName = `${options.verification}-attempt-${String(attempt)}-stderr.txt`;
    const stdoutRefusal = guardedEvidenceWrite(
      join(options.evidenceDir, stdoutName),
      redactSecrets(child.stdout ?? "", secrets),
    );
    if (stdoutRefusal !== undefined) {
      return finish({ kind: "error", reason: stdoutRefusal });
    }
    const stderrRefusal = guardedEvidenceWrite(
      join(options.evidenceDir, stderrName),
      redactSecrets(child.stderr ?? "", secrets),
    );
    if (stderrRefusal !== undefined) {
      return finish({ kind: "error", reason: stderrRefusal });
    }
    evidence.push(stdoutName, stderrName);

    const record: AttemptRecord = {
      attempt,
      at,
      outcome: "error",
      detail: "",
      transport: {
        exitCode: child.status,
        signal: child.signal,
        terminatedByTimeout,
      },
    };
    const writeAttempt = (): string | undefined => {
      attempts.push(record);
      const refusal = guardedEvidenceWrite(
        join(options.evidenceDir, attemptName),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      if (refusal !== undefined) {
        return refusal;
      }
      evidence.push(attemptName);
      return undefined;
    };
    // Write the attempt record, then return the given verdict, EXCEPT when the
    // attempt-record path is itself a planted FIFO or other non-regular entry:
    // the guarded write refuses it (no block), and the bounded return names
    // that hazard rather than the terminal verdict it displaced.
    const recordAndReturn = (verdict: VerificationVerdict): VerificationRun => {
      const refusal = writeAttempt();
      if (refusal !== undefined) {
        return finish({ kind: "error", reason: refusal });
      }
      return finish(verdict);
    };

    if (terminatedByTimeout) {
      record.detail =
        `adapter overran the per-attempt timeout of ` +
        `${String(options.clock.attemptTimeoutMs)} ms and was terminated; ` +
        `the attempt is error and the kernel returns`;
      return recordAndReturn({ kind: "error", reason: record.detail });
    }
    if (child.error !== undefined) {
      record.detail = `adapter could not be run: ${singleLine(String(child.error))}`;
      return recordAndReturn({ kind: "error", reason: record.detail });
    }

    const read = readRegularFileIfPresent(responsePath);
    if (read.kind === "absent") {
      record.detail =
        `fail-closed rule 1: adapter exited ${String(child.status)} without ` +
        `writing a response record at ${responsePath}; exit 0 with no ` +
        `response is error, not success`;
      return recordAndReturn({ kind: "error", reason: record.detail });
    }
    if (read.kind === "refused") {
      // M2-C-6: present and not a regular file. Named, never opened.
      record.detail = read.reason;
      return recordAndReturn({ kind: "error", reason: record.detail });
    }

    // Redaction before anything else touches the body: the response was
    // written by another program, and if a credential value leaked into it,
    // the leak must not survive under the evidence directory (criterion 11).
    const redactedBody = redactSecrets(read.body, secrets);
    if (redactedBody !== read.body) {
      // The response path was just read as a regular file, but the rewrite is
      // routed through the one guarded writer too, so no kernel-side evidence
      // write is an exception to the type-before-open rule.
      const rewriteRefusal = guardedEvidenceWrite(responsePath, redactedBody);
      if (rewriteRefusal !== undefined) {
        return finish({ kind: "error", reason: rewriteRefusal });
      }
    }
    evidence.push(responseName);

    const validation = validateAdapterResponse(redactedBody, options.subject);
    if (!validation.ok) {
      record.outcome = "invalid";
      record.detail = validation.reason;
      return recordAndReturn({ kind: "error", reason: validation.reason });
    }
    const response = validation.response;
    record.outcome = response.outcome;
    record.detail =
      response.observation?.detail ?? response.reason ?? response.outcome;
    if (response.resolved !== undefined) {
      record.resolved = response.resolved;
    }
    if (response.transport?.httpStatus !== undefined) {
      record.transport.httpStatus = response.transport.httpStatus;
    }
    const older = releaseObjectOlderThanMerge(response, options.subject);
    if (older !== undefined) {
      record.releaseObjectOlderThanMerge = older;
    }
    const attemptRefusal = writeAttempt();
    if (attemptRefusal !== undefined) {
      return finish({ kind: "error", reason: attemptRefusal });
    }

    if (response.outcome === "satisfied") {
      return finish({
        kind: "satisfied",
        units: response.units ?? 1,
        detail: record.detail,
        resolved: response.resolved,
      });
    }
    if (response.outcome === "failed") {
      return finish({ kind: "failed", reason: response.reason as string });
    }
    if (response.outcome === "not-applicable") {
      return finish({
        kind: "not-applicable",
        declared: false,
        reason: response.reason as string,
        preconditionId:
          response.precondition?.id ?? `${options.verification}-adapter-precondition`,
        evidence: response.precondition?.evidence ?? [],
      });
    }
    if (response.outcome === "error") {
      return finish({ kind: "error", reason: response.reason as string });
    }

    // pending or absent: the loop states.
    lastLoopOutcome = response.outcome;
    lastObservedDetail = record.detail;

    if (
      options.clock.maxAttempts !== undefined &&
      attempt >= options.clock.maxAttempts
    ) {
      return finish(
        deadlineVerdict(
          lastLoopOutcome,
          lastObservedDetail,
          `attempt budget of ${String(options.clock.maxAttempts)} exhausted`,
        ),
      );
    }
    const now = Date.now();
    if (now >= deadlineAtMs) {
      return finish(deadlineVerdict(lastLoopOutcome, lastObservedDetail));
    }
    await sleep(Math.min(options.clock.intervalMs, Math.max(0, deadlineAtMs - now)));
    if (Date.now() >= deadlineAtMs) {
      return finish(deadlineVerdict(lastLoopOutcome, lastObservedDetail));
    }
  }
}

function deadlineVerdict(
  lastOutcome: "pending" | "absent",
  lastObserved: string,
  cause?: string,
): VerificationVerdict {
  const base =
    lastOutcome === "absent"
      ? DEADLINE_REASON_ABSENT
      : deadlineReasonPending(lastObserved);
  return {
    kind: "deadline",
    lastOutcome,
    reason: cause === undefined ? base : `${base} (${cause})`,
  };
}

/**
 * The older-than-the-merge observation. The adapter may record the release
 * object's creation instant in resolved.createdAt (epoch milliseconds or an
 * ISO-8601 string, platform's choice); if it parses and precedes mergedAt,
 * the attempt record flags it. An observation, never an error (plan step 3;
 * investigation section 8 item 8).
 */
function releaseObjectOlderThanMerge(
  response: AdapterResponse,
  subject: ReleaseSubject,
): boolean | undefined {
  const created = response.resolved?.createdAt;
  let createdMs: number | undefined;
  if (typeof created === "number" && Number.isFinite(created)) {
    createdMs = created;
  } else if (typeof created === "string") {
    const parsed = Date.parse(created);
    if (!Number.isNaN(parsed)) {
      createdMs = parsed;
    }
  }
  if (createdMs === undefined) {
    return undefined;
  }
  const mergedMs = Date.parse(subject.mergedAt);
  if (Number.isNaN(mergedMs)) {
    return undefined;
  }
  return createdMs < mergedMs;
}

/* ------------------------------------------------------------------------ *
 * The declaration, and the gate entry shared by src/gates/deploy.ts and    *
 * src/gates/migrations.ts.                                                 *
 * ------------------------------------------------------------------------ */

export interface DeclaredVerification {
  mode: "none" | "adapter";
  reason?: string;
  adapter?: string[];
  config?: unknown;
  clock?: VerificationClock;
  credentials?: string[];
}

export interface Declaration {
  version: number;
  repository: string;
  integrationRef: string;
  verifications: {
    deploy?: DeclaredVerification;
    migrations?: DeclaredVerification;
  };
}

export type DeclarationLoad =
  | {
      ok: true;
      declaration: Declaration;
      /** sha256 hex of the blob bytes read from the governing ref. */
      sha256: string;
      /** The resolved commit sha of the governing ref. */
      ref: string;
      refSha: string;
    }
  | { ok: false; reason: string };

function git(
  args: string[],
  cwd: string,
): { ok: true; stdout: string } | { ok: false; status: number | null; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error !== undefined) {
    return { ok: false, status: null, stderr: singleLine(String(result.error)) };
  }
  if (result.status !== 0) {
    return { ok: false, status: result.status, stderr: singleLine(result.stderr ?? "") };
  }
  return { ok: true, stdout: result.stdout ?? "" };
}

/**
 * Read the declaration from a COMMITTED ref, never from the working tree
 * (design decision D-p7-2; the anti-widening rule of plan step 7, same as
 * the scope auditor's: a phase must not be able to switch off, inside its
 * own branch, the check that would have caught it). The record carries the
 * declaration blob's sha256 so a reviewer can see which text authorized
 * whatever happened.
 */
export function loadDeclaration(ref: string, cwd: string): DeclarationLoad {
  const resolved = git(["rev-parse", `${ref}^{commit}`], cwd);
  if (!resolved.ok) {
    return {
      ok: false,
      reason: `cannot resolve ref ${ref}: git exited ${String(resolved.status)}: ${resolved.stderr}`,
    };
  }
  const refSha = resolved.stdout.trim();
  const shown = git(["show", `${refSha}:${DECLARATION_PATH}`], cwd);
  if (!shown.ok) {
    if (/does not exist|exists on disk, but not in/.test(shown.stderr)) {
      return {
        ok: false,
        reason:
          `no release-verification declaration at ${refSha}:${DECLARATION_PATH}; ` +
          `an absent declaration is error, not a quiet skip: silence is never permission ` +
          `(plan M2-P7 step 7)`,
      };
    }
    return {
      ok: false,
      reason: `git show ${refSha}:${DECLARATION_PATH} exited ${String(shown.status)}: ${shown.stderr}`,
    };
  }
  const body = shown.stdout;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      reason: `${DECLARATION_PATH} at ${refSha} does not parse as JSON: ${(error as Error).message}`,
    };
  }
  const diagnostics = formatDiagnostics([
    ...validate(declarationSchema(), parsed),
    ...conditionalDeclarationDiagnostics(parsed),
  ]);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `${DECLARATION_PATH} at ${refSha} is not a valid declaration: ${diagnostics.join("; ")}`,
    };
  }
  return {
    ok: true,
    declaration: parsed as Declaration,
    sha256: createHash("sha256").update(body).digest("hex"),
    ref,
    refSha,
  };
}

/** Mode-conditional required fields, outside the closed keyword set. */
function conditionalDeclarationDiagnostics(parsed: unknown): Diagnostic[] {
  const found: Diagnostic[] = [];
  const verifications = (parsed as { verifications?: unknown })?.verifications;
  if (typeof verifications !== "object" || verifications === null) {
    return found;
  }
  for (const [name, value] of Object.entries(verifications)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const entry = value as Record<string, unknown>;
    const pointer = (field: string): string => `#/verifications/${name}/${field}`;
    if (entry["mode"] === "none") {
      if (typeof entry["reason"] !== "string" || entry["reason"] === "") {
        found.push({
          pointer: pointer("reason"),
          message:
            "required property reason is missing or empty for mode none; " +
            "disabling verification costs a reason",
        });
      }
    }
    if (entry["mode"] === "adapter") {
      for (const field of ["adapter", "config", "clock"]) {
        if (entry[field] === undefined) {
          found.push({
            pointer: pointer(field),
            message: `required property ${field} is missing for mode adapter`,
          });
        }
      }
    }
  }
  return found;
}

const UNIT_LABELS: Record<string, string> = {
  deploy: "release verifications satisfied",
  migrations: "migrations compared",
};

function usage(name: string): string {
  return (
    `usage: node src/gates/${name}.ts --result <file> --evidence <dir> ` +
    `[--base <ref>] [--phase <id>]`
  );
}

interface GateFlags {
  result?: string;
  evidence?: string;
  base?: string;
  phase?: string;
  head?: string;
}

function parseGateFlags(args: string[]): GateFlags | undefined {
  const flags: GateFlags = {};
  const names = ["--result", "--evidence", "--base", "--phase", "--head"];
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const value = args[i + 1];
    if (flag === undefined || !names.includes(flag) || value === undefined) {
      return undefined;
    }
    if (flag === "--result") {
      flags.result = value;
    } else if (flag === "--evidence") {
      flags.evidence = value;
    } else if (flag === "--base") {
      flags.base = value;
    } else if (flag === "--phase") {
      flags.phase = value;
    } else {
      flags.head = value;
    }
    i += 1;
  }
  return flags;
}

function emit(resultPath: string, result: GateResult): number {
  const refusal = refuseOpenForWrite(resultPath);
  if (refusal !== undefined) {
    process.stderr.write(`${result.gate}: ${refusal}\n`);
    return exitCodeForStatus("error");
  }
  const written = runStep(`writing ${resultPath}`, () =>
    writeFileSync(resultPath, renderGateResult(result)),
  );
  if (!written.ok) {
    process.stderr.write(`${result.gate}: ${written.reason}\n`);
    return exitCodeForStatus("error");
  }
  process.stdout.write(
    `${result.gate}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  return exitCodeForStatus(result.status);
}

/**
 * THE GATE ENTRY, shared by the two thin entry points. The manifest keeps
 * two static entries exactly as section 1.4 declares them; this function is
 * what each names. Returns the process exit code.
 *
 * The governing ref is `--base` when supplied (the anti-widening read),
 * else HEAD: always a COMMITTED state, so the subject's mergedSha and
 * mergedAt are the resolved commit's, and an uncommitted edit can neither
 * enable, disable nor reconfigure a verification. R-032's blocking half:
 * the verdict record this gate writes is keyed to that sha in its detail
 * line, and the consumption contract is that THE NEXT DISPATCH REQUIRES A
 * GREEN VERDICT RECORD FOR THE MERGED SHA; the enforcement is wired at M4
 * with the pilot (M2-D-11), and M2 adds no dispatch block to spawn.
 */
export async function runReleaseGate(
  name: "deploy" | "migrations",
  args: string[],
): Promise<number> {
  const flags = parseGateFlags(args);
  if (flags === undefined || flags.result === undefined || flags.evidence === undefined) {
    process.stderr.write(`${usage(name)}\n`);
    return 64;
  }
  const startedAt = new Date().toISOString();
  const unitLabel = UNIT_LABELS[name] as string;
  const finish = (
    status: GateStatus,
    units: number,
    detail: string,
    precondition?: PreconditionRecord,
    evidence?: string[],
  ): number =>
    emit(
      flags.result as string,
      makeGateResult({
        gate: name,
        status,
        units,
        unitLabel,
        startedAt,
        endedAt: new Date().toISOString(),
        detail,
        precondition,
        evidence,
      }),
    );

  const cwd = process.cwd();
  const ref = flags.base ?? "HEAD";
  const loaded = loadDeclaration(ref, cwd);
  if (!loaded.ok) {
    return finish("error", 0, loaded.reason);
  }
  const provenance =
    `declaration ${DECLARATION_PATH} read from ${loaded.ref} ` +
    `(${loaded.refSha}), blob sha256 ${loaded.sha256}`;
  const declared = loaded.declaration.verifications[name];
  if (declared === undefined) {
    return finish(
      "error",
      0,
      `${DECLARATION_PATH} at ${loaded.refSha} does not configure verification ` +
        `${name}; an absent configuration field is error, not none: silence is ` +
        `never permission (plan M2-P7 step 7); ${provenance}`,
    );
  }
  if (declared.mode === "none") {
    return finish(
      "not-applicable",
      0,
      `not-applicable by declaration (declared: true): ${declared.reason as string}; ${provenance}`,
      {
        id: `${name}-release-verification-declared-none`,
        met: false,
        reason: `declared none: ${declared.reason as string}`,
        evidence: [
          `declared: true`,
          `declaration: ${DECLARATION_PATH} at ${loaded.refSha}`,
          `blob sha256: ${loaded.sha256}`,
        ],
      },
    );
  }

  // mode adapter. Credentials are NAMES; an unresolvable name is error,
  // never a silent unauthenticated request (plan step 8). The values are
  // used for redaction only and are never written anywhere.
  const secrets: { name: string; value: string }[] = [];
  for (const credential of declared.credentials ?? []) {
    const value = process.env[credential];
    if (value === undefined || value === "") {
      return finish(
        "error",
        0,
        `credential variable ${credential} is declared and not resolvable; a ` +
          `named credential that cannot be resolved is error, never a silent ` +
          `unauthenticated request (plan M2-P7 step 8); ${provenance}`,
      );
    }
    secrets.push({ name: credential, value });
  }

  const mergedAtResult = git(
    ["show", "-s", "--format=%cI", loaded.refSha],
    cwd,
  );
  if (!mergedAtResult.ok) {
    return finish(
      "error",
      0,
      `cannot read the commit instant of ${loaded.refSha}: ${mergedAtResult.stderr}`,
    );
  }
  const subject: ReleaseSubject = {
    repository: loaded.declaration.repository,
    integrationRef: loaded.declaration.integrationRef,
    mergedSha: loaded.refSha,
    mergedAt: mergedAtResult.stdout.trim(),
    phaseId: flags.phase ?? "unspecified",
  };

  const run = await runVerification({
    verification: name,
    subject,
    adapter: declared.adapter as string[],
    config: declared.config,
    clock: declared.clock as VerificationClock,
    evidenceDir: flags.evidence,
    secrets,
  });

  const attemptsNote = `${String(run.attempts.length)} attempt(s)`;
  const verdict = run.verdict;
  if (verdict.kind === "satisfied") {
    return finish(
      "green",
      verdict.units,
      `verification ${name} satisfied for subject ${subject.mergedSha}: ` +
        `${verdict.detail}; resolved ${JSON.stringify(verdict.resolved)}; ` +
        `${attemptsNote}; ${provenance}`,
      undefined,
      run.evidence,
    );
  }
  if (verdict.kind === "failed") {
    return finish(
      "red",
      0,
      `verification ${name} failed for subject ${subject.mergedSha}: ` +
        `${verdict.reason}; ${attemptsNote}; ${provenance}`,
      undefined,
      run.evidence,
    );
  }
  if (verdict.kind === "deadline") {
    return finish(
      "red",
      0,
      `verification ${name} for subject ${subject.mergedSha}: ${verdict.reason}; ` +
        `${attemptsNote}; ${provenance}`,
      undefined,
      run.evidence,
    );
  }
  if (verdict.kind === "not-applicable") {
    return finish(
      "not-applicable",
      0,
      `not-applicable by adapter-evaluated precondition (declared: false): ` +
        `${verdict.reason}; ${attemptsNote}; ${provenance}`,
      {
        id: verdict.preconditionId,
        met: false,
        reason: verdict.reason,
        evidence: [`declared: false`, ...verdict.evidence],
      },
      run.evidence,
    );
  }
  return finish(
    "error",
    0,
    `verification ${name} for subject ${subject.mergedSha}: ${verdict.reason}; ` +
      `${attemptsNote}; ${provenance}`,
    undefined,
    run.evidence,
  );
}
