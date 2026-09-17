import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import { readRegularFileIfPresent, taskDir } from "./task.ts";

/**
 * THE MODEL-RESOLUTION RECORD, KERNEL SIDE (kernel plan M4, M4-P7;
 * delivery/plan/kernel-plan-m4.md:1018, discharging M4-D-06's four parts at
 * delivery/plan/m4-intake.md:732).
 *
 * WHAT THIS MODULE IS AND, MORE IMPORTANTLY, WHAT IT IS NOT. It READS a
 * record a harness adapter wrote. It holds NO vocabulary: no tier-to-model
 * table, no model-to-family table, and no vendor name of any kind. The whole
 * vocabulary lives in the plugin (plugin/src/vocabulary.ts) and this module
 * dereferences a vocabulary's IDENTITY and never its CONTENT. That single
 * property is what makes a second harness plugin possible at all: a mapping
 * here would close off every harness that is not the one it names
 * (delivery/plan/m4-intake.md:377), and `test/schemas.test.ts` already asserts
 * the absence over the whole shipped surface rather than trusting this
 * paragraph.
 *
 * THE ORDER OF THE CHECKS IS PART OF THE CONTRACT, and it is the release
 * record's order (src/gates/release.ts): the SUBJECT ECHO is compared field by
 * field BEFORE anything reads the resolved identity. A record about another
 * task is not a record with a wrong answer, it is a record about something
 * else, and reading its answer first is how a misattributed family token
 * reaches a decorrelation check as though it belonged there.
 *
 * WHY `observed` IS NOT `attested`, stated here because the vocabulary is the
 * thing most likely to be widened later by someone who did not read M4-P1.
 * The probe measured that the observation channel is harness-written, that it
 * can be EMPTY at hook time under load, and that a process at the agent's own
 * uid can rewrite it in place so the result is byte-shaped exactly like the
 * truth (delivery/verification/m4-prototype-probes.md:410). So `observed`
 * ranks above `self-reported`, which costs nothing to forge, and below any
 * notion of attestation, which would need a signer this environment has not
 * been shown to have.
 */

/** The record's file name inside the task directory. */
export const MODEL_RESOLUTION_RECORD_NAME = "model-resolution.json";

/** The contract versions this kernel accepts. */
export const MODEL_RESOLUTION_CONTRACT_VERSIONS: readonly string[] = ["1"];

/**
 * Where the record lives: `tasks/<id>/model-resolution.json`, NEVER inside the
 * worktree (M4-P7 criterion 5, src/task.ts:31 and FM-059). The task directory
 * sits outside the worktree precisely so the pool's dirty check needs no
 * exemption list for the kernel's own injected files, and a record written
 * into the worktree would be indistinguishable from the agent's own work.
 */
export function modelResolutionPath(fleet: Fleet, taskId: string): string {
  return join(taskDir(fleet, taskId), MODEL_RESOLUTION_RECORD_NAME);
}

/** The launch request fields the record's subject echo is compared against. */
export interface ModelResolutionSubject {
  taskId: string;
  role: string;
  requestedTier: string;
}

export interface VocabularyIdentity {
  id: string;
  version: number;
}

/** What one read of the record produced. */
export type ModelResolutionRead =
  | { kind: "read"; record: Record<string, unknown> }
  | { kind: "error"; reason: string };

/** What one acceptance decision produced. */
export type ModelResolutionAcceptance =
  | { kind: "accepted"; family: string | undefined; provenance: string }
  | { kind: "refused"; reason: string };

/** What one cross-record family comparison produced. */
export type FamilyComparison =
  | { kind: "compared"; differ: boolean; families: [string, string] }
  | { kind: "refused"; reason: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringAt(
  container: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const value = container?.[field];
  return typeof value === "string" ? value : undefined;
}

/**
 * Read the record for a task.
 *
 * AN ABSENT RECORD IS AN ERROR AND IS NEVER GREEN AND NEVER NOT-APPLICABLE
 * (M4-P7 criterion 5). This is not a new rule and deliberately not a second
 * implementation of one: src/gates/release.ts:609 already produces the
 * sentence for the same hazard on the release seam, and the wording is kept
 * in the same shape so that a reader who has met one meets the other.
 * `test/model-resolution.test.ts` drives the real release gate to capture that
 * sentence and derives its assertion from the capture, rather than pinning a
 * hand-written copy of it.
 *
 * THE READ GOES THROUGH `readRegularFileIfPresent`, which is M2-C-6 and the
 * mechanism-index row `reading-a-path-whose-type-is-not-established`: a named
 * pipe at this path is a REPORTED refusal, never a blocked open.
 */
export function readModelResolutionRecord(
  path: string,
  writerExitCode: number,
): ModelResolutionRead {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return {
      kind: "error",
      reason:
        `fail-closed rule 1: adapter exited ${String(writerExitCode)} without ` +
        `writing a model-resolution record at ${path}; exit 0 with no ` +
        `record is error, not success`,
    };
  }
  if (read.kind === "refused") {
    return { kind: "error", reason: read.reason };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      kind: "error",
      reason: `${path} is not readable as JSON: ${String(error).replace(/\s+/g, " ").trim()}`,
    };
  }
  const record = asRecord(parsed);
  if (record === undefined) {
    return { kind: "error", reason: `${path} does not hold a JSON object` };
  }
  return { kind: "read", record };
}

/**
 * The vocabulary IDENTITY of a record, and nothing else about the vocabulary.
 *
 * TWO FIELDS ARE READ AND THEY ARE NAMED HERE RATHER THAN SPREAD, which is
 * the whole of criterion 4's mechanical half. A spread, an `Object.keys`, a
 * `JSON.stringify` or a `structuredClone` of the vocabulary object would
 * ENUMERATE it, and enumeration is dereferencing the content whatever the
 * intent. `test/model-resolution.test.ts` hands this function a Proxy that
 * records every property read and asserts the recorded set against these two
 * names, so a later edit that reaches for a third reddens.
 */
export function vocabularyIdentity(
  record: Record<string, unknown>,
): VocabularyIdentity | undefined {
  const resolved = asRecord(record["resolved"]);
  const vocabulary = asRecord(resolved?.["vocabulary"]);
  if (vocabulary === undefined) {
    return undefined;
  }
  const id = vocabulary["id"];
  const version = vocabulary["version"];
  if (typeof id !== "string" || typeof version !== "number") {
    return undefined;
  }
  return { id, version };
}

/**
 * Accept or refuse one record against the launch request the kernel holds.
 *
 * FOUR REFUSALS, IN THIS ORDER, and the order is the point.
 *
 * 1. THE CONTRACT VERSION, because a record written to a contract this kernel
 *    does not know is not a record this kernel can read fields out of.
 * 2. THE SUBJECT ECHO, FIELD BY FIELD, BEFORE THE OUTCOME IS READ. This is
 *    src/gates/schemas/release-record.schema.json:26's misattribution guard.
 * 3. THE VOCABULARY IDENTITY, because a family token with no vocabulary is a
 *    token nobody can say the meaning of.
 * 4. THE PROVENANCE, which is M4-P7 criterion 6 member TWO. Member one (a
 *    record claiming `observed` with no observation at all) is the schema's
 *    and is a missing field. THIS is the present-but-inconsistent half, and a
 *    schema-only guard passes it green: an observation about another task, or
 *    naming a model other than the one the record claims, is a self-report
 *    with a decoration on it.
 */
export function acceptModelResolution(
  record: Record<string, unknown>,
  subject: ModelResolutionSubject,
): ModelResolutionAcceptance {
  const contractVersion = stringAt(record, "contractVersion");
  if (contractVersion === undefined || !MODEL_RESOLUTION_CONTRACT_VERSIONS.includes(contractVersion)) {
    return {
      kind: "refused",
      reason:
        `the record declares contract version ${String(contractVersion)}, and this ` +
        `kernel accepts ${MODEL_RESOLUTION_CONTRACT_VERSIONS.join(", ")}`,
    };
  }

  const echo = asRecord(record["subject"]);
  if (echo === undefined) {
    return {
      kind: "refused",
      reason: "the record carries no subject echo, so what it is about could not be established",
    };
  }
  const echoed: [keyof ModelResolutionSubject, string | undefined][] = [
    ["taskId", stringAt(echo, "taskId")],
    ["role", stringAt(echo, "role")],
    ["requestedTier", stringAt(echo, "requestedTier")],
  ];
  for (const [field, value] of echoed) {
    if (value !== subject[field]) {
      return {
        kind: "refused",
        reason:
          `the record's subject echo says ${field} is ${String(value)} and the ` +
          `launch request says ${subject[field]}, so this record is about a ` +
          `different subject`,
      };
    }
  }

  const identity = vocabularyIdentity(record);
  if (identity === undefined) {
    return {
      kind: "refused",
      reason:
        "the record carries no resolved.vocabulary identity, so its family token " +
        "belongs to no stated vocabulary and cannot be compared with any other",
    };
  }

  const resolved = asRecord(record["resolved"]);
  const provenance = stringAt(resolved, "provenance");
  const family = stringAt(resolved, "family");
  const model = stringAt(resolved, "model");
  if (provenance === "observed") {
    const observation = asRecord(resolved?.["observation"]);
    if (observation === undefined) {
      return {
        kind: "refused",
        reason:
          "the record claims provenance observed and carries no observation, so " +
          "the claim is a self-report wearing the word observed",
      };
    }
    const observedTask = stringAt(observation, "taskId");
    if (observedTask !== subject.taskId) {
      return {
        kind: "refused",
        reason:
          `the record claims provenance observed and its observation is about ` +
          `task ${String(observedTask)}, while the echoed request is about task ` +
          `${subject.taskId}, so the observation contradicts the subject it is ` +
          `offered as evidence for`,
      };
    }
    const observedModel = stringAt(observation, "model");
    if (observedModel !== model) {
      return {
        kind: "refused",
        reason:
          `the record claims model ${String(model)} with provenance observed and ` +
          `its observation saw ${String(observedModel)}, so the claimed identity ` +
          `is not the observed one`,
      };
    }
  } else if (provenance === "self-reported") {
    if (resolved?.["observation"] !== undefined) {
      return {
        kind: "refused",
        reason:
          "the record ranks itself self-reported and carries an observation, so " +
          "it claims evidence it also says it does not have",
      };
    }
  } else if (provenance === "unresolved") {
    if (family !== undefined || model !== undefined) {
      return {
        kind: "refused",
        reason:
          "the record reports the identity unresolved and still names a family " +
          "or a model, which is the quiet fallback to the forgeable value that " +
          "an unresolved observation exists to prevent",
      };
    }
  } else {
    return {
      kind: "refused",
      reason: `the record declares provenance ${String(provenance)}, which this kernel has no rule for`,
    };
  }

  return { kind: "accepted", family, provenance: provenance };
}

/**
 * Compare two accepted records' family tokens (M4-P7 criterion 3).
 *
 * TWO VOCABULARIES ARE NOT COMPARABLE AND THE REFUSAL NAMES BOTH IDS. A family
 * token means whatever the vocabulary that minted it says it means, so
 * comparing a token from one against a token from another is comparing two
 * strings and calling the result a fact about models. That comparison is what
 * `check-dual-review`'s decorrelation assertion rests on, and DR-0038 exists
 * for exactly the environment where the two reviews come from different
 * places, so a silent cross-vocabulary compare would make the assertion
 * meaningless precisely where it is load-bearing.
 *
 * ONLY `id` IS READ HERE. The version is part of the identity a reader may
 * print and is deliberately NOT part of the comparison: a vocabulary that
 * added a family in v2 did not change what its v1 tokens mean, and refusing
 * on version would turn a routine vocabulary revision into an outage.
 */
export function compareResolvedFamilies(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): FamilyComparison {
  const leftIdentity = vocabularyIdentity(left);
  const rightIdentity = vocabularyIdentity(right);
  if (leftIdentity === undefined || rightIdentity === undefined) {
    return {
      kind: "refused",
      reason:
        "one of the two records carries no resolved.vocabulary identity, so the " +
        "two family tokens belong to no stated common vocabulary",
    };
  }
  if (leftIdentity.id !== rightIdentity.id) {
    return {
      kind: "refused",
      reason:
        `the two records name different vocabularies, ${leftIdentity.id} and ` +
        `${rightIdentity.id}, so their family tokens are not comparable and no ` +
        `decorrelation claim can be made from them`,
    };
  }
  const leftFamily = stringAt(asRecord(left["resolved"]), "family");
  const rightFamily = stringAt(asRecord(right["resolved"]), "family");
  if (leftFamily === undefined || rightFamily === undefined) {
    return {
      kind: "refused",
      reason:
        "one of the two records names no resolved family, so there is nothing to " +
        "compare; an unresolved identity is not a difference and not a match",
    };
  }
  return {
    kind: "compared",
    differ: leftFamily !== rightFamily,
    families: [leftFamily, rightFamily],
  };
}

/**
 * The value closeout copies into a verdict's `produced-by` (M4-P7 criterion 8).
 *
 * VERBATIM, AND THE FUNCTION EXISTS SO THAT "VERBATIM" IS TESTABLE. DR-0031
 * requires a pull request to carry all its own evidence, so the family token
 * has to reach the verdict document rather than being left in a task
 * directory that no reviewer of the pull request can see. A copy that
 * normalised, lowercased or prefixed the token would satisfy every reading of
 * that sentence and would break the one comparison the token exists for.
 */
export function producedByFromRecord(
  record: Record<string, unknown>,
): string | undefined {
  return stringAt(asRecord(record["resolved"]), "family");
}
