import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { familyOf, modelForTier, vocabularyIdentity } from "./vocabulary.ts";

/**
 * THE MODEL-RESOLUTION WRITER (kernel plan M4, M4-P7;
 * delivery/plan/kernel-plan-m4.md:1018, discharging M4-D-06 at
 * delivery/plan/m4-intake.md:732).
 *
 * WRITTEN AT TURN END, NEVER AT LAUNCH, AND THE REASON IS ONE SENTENCE. A
 * launch-time record can only carry what was REQUESTED, so it is a restatement
 * of the request wearing the word `resolved`. A harness that asks for one
 * model and serves another under load resolves MID-TURN, and a record written
 * before the payload started cannot see it. The kernel-side schema makes that
 * unrepresentable rather than merely discouraged: `turnEnd` is required, and a
 * record written at launch has no turn-end file to echo.
 *
 * `observed` IS REACHABLE AND M4-P1 IS WHY. The intake's appendix said no
 * plugin hook can read the resolved model after the fact; the probe measured
 * that FALSE (delivery/verification/m4-prototype-probes.md:209). No hook field
 * carries a model, and every hook payload carries `transcript_path`, and the
 * transcript is harness-written with `message.model` on every assistant row.
 * So `observeServedModel` below is the resolver for that channel, and it takes
 * the transcript path as an ARGUMENT rather than discovering one.
 *
 * WHY IT IS INJECTED AND NOT DISCOVERED, stated here because the discovery
 * route exists and was deliberately not taken. M4-P6's observer already writes
 * every hook payload verbatim to an append-only log in the task directory, and
 * those payloads carry `transcript_path`, so a first draft of this module read
 * that log. Two rules say not to. Plan constraint C-1 forbids reading current
 * state from the tail of an append-only log, and M4-P6 asserts by test that
 * exactly ONE module names that log, because the single owner is what keeps
 * the append-only discipline checkable. A value taken from the tail of a log
 * by a second module is the shape both of those exist against, whatever the
 * value happens to be. So the caller that HAS a hook payload passes the path
 * in; nothing here goes looking for one.
 *
 * THE CONSEQUENCE, AND IT IS NOT HIDDEN: the adapter has no hook payload, so
 * the record it writes today ranks itself `self-reported`. That is the state
 * M4-D-06 was designed to survive, and it is recorded rather than dressed up.
 *
 * AND THE PROBE MEASURED THE CHANNEL'S TWO FAILURE MODES, which is why the
 * resolver below is more suspicious than a first draft would be
 * (delivery/verification/m4-prototype-probes.md:410):
 *
 *   - THERE IS A WRITE RACE. In two of twelve concurrent resolutions the
 *     transcript had ZERO assistant rows at hook time and the correct model
 *     twenty seconds later. "A resolver that falls back to the self-report on
 *     an empty transcript is green whenever the race does not fire and
 *     silently accepts a forgeable value when it does." So an empty transcript
 *     is UNRESOLVED and loud, never a quiet fallback.
 *   - THE TRANSCRIPT IS AGENT-REACHABLE. A process at the agent's own uid
 *     appends to it with exit 0. An APPENDED forged row makes the resolver see
 *     TWO models for one agent, which is anomalous and catchable; a REWRITE in
 *     place is byte-shaped exactly like the truth and is not catchable here.
 *     So more than one distinct model is UNRESOLVED, and nothing in this
 *     module's vocabulary implies attestation.
 */

/** The record's file name inside the task directory, matching the kernel's. */
export const MODEL_RESOLUTION_RECORD_NAME = "model-resolution.json";

/** The contract version this writer writes. */
export const CONTRACT_VERSION = "1";

/** The turn-end record the generated kernel hook wrote (src/hooks.ts:38). */
export interface TurnEnd {
  endedAt: string;
  exitCode: number;
}

/** What was read to decide whether a charter overrides the role's tier. */
export interface TierPolicy {
  /** The document the permission was read from. */
  configPath: string;
  /** The role's `charter-override` value, VERBATIM from that document. */
  charterOverride: string;
  /** The charter that carries a tier for this role, when one does. */
  charter?: { path: string; tier: string };
}

/** What one attempt to observe the served model produced. */
export type ObservationOutcome =
  | { kind: "observed"; source: string; model: string; detail: string }
  | { kind: "unresolved"; reason: string };

export interface ModelResolutionInputs {
  writer: string;
  taskId: string;
  role: string;
  requestedTier: string;
  turnEnd: TurnEnd;
  policy?: TierPolicy;
  observation?: ObservationOutcome;
  writtenAt: Date;
}

/** One line of a caught error, so a reason never spans a log line. */
function singleLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * RESOLVE THE TIER, WHICH IS R-075's CHARTER OVERRIDE (criterion 7).
 *
 * `role-model-config.yaml` ships a tier and a `charter-override` permission per
 * role and resolves neither: its own header says binding is done by the harness
 * adapter and that the charter override is L4, landing at M4. This function is
 * that resolver, and it is PURE so that both directions of criterion 7 can be
 * driven without a filesystem.
 *
 * BOTH DIRECTIONS ARE HERE AND THE SECOND IS THE ONE THAT GETS DROPPED. A
 * resolver written from the happy path applies the charter's tier whenever the
 * charter names one, because nothing about a role whose permission is
 * `forbidden` looks like a failure: the record still validates, the tier is
 * still a legal tier, and the only thing wrong is that a document was allowed
 * to override a role that forbids it.
 *
 * NOTHING IS ASSERTED THAT WAS NOT READ. When no policy document was consulted
 * the observation says `consulted: false` and cites no path, rather than
 * reporting a permission nobody looked at.
 */
export function resolveTier(inputs: {
  role: string;
  requestedTier: string;
  policy?: TierPolicy;
}): Record<string, unknown> {
  const base = {
    role: inputs.role,
    provenance: "observed",
  };
  const policy = inputs.policy;
  if (policy === undefined) {
    return {
      ...base,
      tier: inputs.requestedTier,
      overrideApplied: false,
      observation: {
        consulted: false,
        detail:
          `no tier-policy document was consulted for task role ${inputs.role}, ` +
          `so the requested tier stands unchanged`,
      },
    };
  }
  /* The configuration's enum is exactly `allowed` and `forbidden`
     (schemas/role-model-config.schema.json), and anything else is treated as
     NOT permission, with the value it actually carried kept verbatim in the
     detail. Coercing an unknown value to `allowed` would be the fail-open
     direction on the one field that gates an override. */
  const permitted = policy.charterOverride === "allowed";
  const observation = {
    consulted: true,
    configPath: policy.configPath,
    configPermission: permitted ? "allowed" : "forbidden",
    detail:
      `${policy.configPath} declares charter-override ${policy.charterOverride} ` +
      `for role ${inputs.role}`,
  };
  if (!permitted || policy.charter === undefined) {
    return {
      ...base,
      tier: inputs.requestedTier,
      overrideApplied: false,
      observation,
    };
  }
  return {
    ...base,
    tier: policy.charter.tier,
    overrideApplied: true,
    charterPath: policy.charter.path,
    charterTier: policy.charter.tier,
    observation,
  };
}

/**
 * Build the `resolved` block from whatever the observation channel answered.
 *
 * THREE ARMS AND THEY ARE NOT THE SAME ARM WEARING DIFFERENT WORDS.
 * `self-reported` says nobody looked; `unresolved` says somebody looked and
 * saw nothing usable; `observed` says somebody looked and this is what was
 * there. Collapsing the middle one into the first is precisely the failure
 * M4-P1 measured, and it is invisible whenever the race does not fire.
 */
export function resolvedBlock(inputs: {
  taskId: string;
  tier: string;
  observation?: ObservationOutcome;
}): Record<string, unknown> {
  const vocabulary = vocabularyIdentity();
  const observation = inputs.observation;
  if (observation !== undefined && observation.kind === "unresolved") {
    return { vocabulary, provenance: "unresolved", reason: observation.reason };
  }
  if (observation !== undefined && observation.kind === "observed") {
    const family = familyOf(observation.model);
    if (family === undefined) {
      return {
        vocabulary,
        provenance: "unresolved",
        reason:
          `the served model ${observation.model} was observed and vocabulary ` +
          `${vocabulary.id} names no family for it, so no family token can be ` +
          `reported for this turn`,
      };
    }
    return {
      vocabulary,
      family,
      model: observation.model,
      provenance: "observed",
      observation: {
        source: observation.source,
        taskId: inputs.taskId,
        model: observation.model,
        detail: observation.detail,
      },
    };
  }
  const model = modelForTier(inputs.tier);
  if (model === undefined) {
    return {
      vocabulary,
      provenance: "unresolved",
      reason:
        `vocabulary ${vocabulary.id} has no model for tier ${inputs.tier}, so ` +
        `not even the requested identity could be named`,
    };
  }
  const family = familyOf(model);
  if (family === undefined) {
    return {
      vocabulary,
      provenance: "unresolved",
      reason:
        `vocabulary ${vocabulary.id} maps tier ${inputs.tier} to ${model} and ` +
        `names no family for it, which is an inconsistency in the vocabulary ` +
        `itself`,
    };
  }
  return { vocabulary, family, model, provenance: "self-reported" };
}

/** Assemble the whole record. Pure, so a test can read every field of it. */
export function buildModelResolutionRecord(
  inputs: ModelResolutionInputs,
): Record<string, unknown> {
  const resolution = resolveTier({
    role: inputs.role,
    requestedTier: inputs.requestedTier,
    ...(inputs.policy === undefined ? {} : { policy: inputs.policy }),
  });
  return {
    kind: "model-resolution",
    contractVersion: CONTRACT_VERSION,
    writer: inputs.writer,
    writtenAt: inputs.writtenAt.toISOString(),
    turnEnd: { endedAt: inputs.turnEnd.endedAt, exitCode: inputs.turnEnd.exitCode },
    subject: {
      taskId: inputs.taskId,
      role: inputs.role,
      requestedTier: inputs.requestedTier,
    },
    resolution,
    resolved: resolvedBlock({
      taskId: inputs.taskId,
      tier: String(resolution["tier"]),
      ...(inputs.observation === undefined ? {} : { observation: inputs.observation }),
    }),
  };
}

/** The record's path, a sibling of the launch record the kernel named. */
export function modelResolutionPathBeside(recordPath: string): string {
  return join(dirname(recordPath), MODEL_RESOLUTION_RECORD_NAME);
}

/**
 * Read the turn-end record the generated hook just wrote.
 *
 * THE RECORD IS NOT WRITTEN AT ALL WITHOUT THIS FILE, which is criterion 2 as
 * code. There is no arm here that invents an `endedAt`: an unreadable turn-end
 * record means the turn's end was not observed, and a model-resolution record
 * claiming to have been written after an end nobody saw would be exactly the
 * launch-time record this phase exists to prevent.
 */
export function readTurnEnd(path: string): TurnEnd | undefined {
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const endedAt = record["endedAt"];
  const exitCode = record["exitCode"];
  if (typeof endedAt !== "string" || typeof exitCode !== "number") {
    return undefined;
  }
  return { endedAt, exitCode };
}

/**
 * The DISTINCT models named on the transcript's assistant rows.
 *
 * THE SHAPE IS M4-P1's RESOLVER, not a reimplementation of it. That probe read
 * `row.type === "assistant"` and `row.message.model`, reported the distinct set
 * and put its outcome in one field; the same shape is used here so the arms
 * this module distinguishes are the arms that were actually measured
 * (test/fixtures/harness-probe/q3-transcript-model-resolution/plugin-hook-resolve.mjs.txt:1).
 */
export function modelsInTranscript(path: string): string[] | undefined {
  let body: string;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
  const seen = new Set<string>();
  for (const line of body.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const typed = row as { type?: unknown; message?: { model?: unknown } };
    if (typed.type !== "assistant") {
      continue;
    }
    const model = typed.message?.model;
    if (typeof model === "string" && model !== "") {
      seen.add(model);
    }
  }
  return [...seen].sort();
}

/**
 * Observe the served model from a transcript the caller names.
 *
 * EVERY NEGATIVE ARM IS NAMED AND NONE OF THEM FALLS BACK TO THE SELF-REPORT.
 * "Nobody looked" is expressed by not calling this function at all, and every
 * outcome it can return means somebody looked. That distinction is the whole
 * value of the three-armed provenance vocabulary: an empty transcript
 * correlates with load, so it is rarest exactly where it is tested, and a
 * resolver that answered it with the requested identity would be green
 * whenever the race did not fire.
 */
export function observeServedModel(transcriptPath: string): ObservationOutcome {
  const models = modelsInTranscript(transcriptPath);
  if (models === undefined) {
    return {
      kind: "unresolved",
      reason:
        `transcript ${transcriptPath} could not be read, so the observation ` +
        `channel was consulted and answered nothing`,
    };
  }
  if (models.length === 0) {
    return {
      kind: "unresolved",
      reason:
        `transcript ${transcriptPath} carries no assistant row naming a model ` +
        `at turn end; M4-P1 measured this write race in two of twelve ` +
        `resolutions, and an empty transcript is unresolved rather than a ` +
        `fallback to the self-report`,
    };
  }
  if (models.length > 1) {
    return {
      kind: "unresolved",
      reason:
        `transcript ${transcriptPath} names more than one model for one turn ` +
        `(${models.join(", ")}), which is the appended-row anomaly M4-P1 ` +
        `measured and is not a resolution`,
    };
  }
  return {
    kind: "observed",
    source: `transcript:${transcriptPath}`,
    model: models[0] as string,
    detail:
      `one distinct model across the assistant rows of ${transcriptPath}, ` +
      `read from the transcript path the caller's hook payload named`,
  };
}

export type WriteOutcome =
  | { written: true; path: string }
  | { written: false; reason: string };

/**
 * Write the record beside the launch record.
 *
 * A FAILURE HERE IS REPORTED TO THE CALLER AND NEVER ESCALATED, and the reason
 * is that the turn is already over: the worktree may hold real work, so
 * nothing this function does may change the launch outcome. The guard against
 * a record silently not existing is on the CONSUMER side, where an absent
 * record is an ERROR and never green and never not-applicable
 * (src/model-resolution.ts, mirroring src/gates/release.ts:609).
 */
export function writeModelResolutionRecord(
  path: string,
  record: Record<string, unknown>,
): WriteOutcome {
  try {
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    return {
      written: false,
      reason: `the model-resolution record ${path} could not be written: ${singleLine(error)}`,
    };
  }
  return { written: true, path };
}
