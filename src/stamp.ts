/**
 * THE KERNEL VERSION STAMP, AND THE ONE TABLE OF WHEN EACH RULE BEGAN
 * (kernel 0.2.1, DR-0053, DR-0054, DR-0055).
 *
 * The owner's rule is "Tiphys judges current and future work, never history",
 * and DR-0055 makes the boundary between the two a FIELD rather than a guess:
 * a document written under a Tiphys brief carries `tiphys-version`, the kernel
 * version whose rules it was written to. Two uses, and they must not be
 * confused, because one relaxes and the other never does:
 *
 * 1. SHAPE (`tiphys validate`). A rule introduced in version V applies to a
 *    document only when the document is stamped V or later. An UNSTAMPED
 *    document is pre-stamp history and is held to the 0.1.0 rules only, which
 *    is what the owner asked for. `RULES_SINCE` below is the only place a
 *    rule's starting version is written; the validate command reads it and
 *    nothing else does.
 *
 * 2. ADMISSION (the merge gates). NOT relaxed by the stamp, ever. A verdict is
 *    admitted toward a merge only when its stamp is the RUNNING kernel's
 *    major.minor or newer (`admissionStampProblem`). Otherwise a writer could
 *    write an old stamp to escape a new rule: the stamp would buy the document
 *    a lighter shape check AND a merge. Excluded verdicts are named, exactly as
 *    a head-less or off-head verdict is.
 *
 * WHY major.minor AND NOT THE FULL VERSION. A patch release fixes defects and
 * adds no rule a reviewer must learn, so a verdict written under 0.2.0 is still
 * admissible under 0.2.1. A minor release is where rules are added. If a patch
 * release ever does add a rule, its `RULES_SINCE` entry still gates SHAPE by the
 * full version; only admission is coarser.
 */

import { readOwnVersion } from "./version.ts";

/** The field a stamped document carries. */
export const STAMP_FIELD = "tiphys-version";

/** A parsed `major.minor.patch`, pre-release tags ignored for ordering. */
export interface KernelVersion {
  major: number;
  minor: number;
  patch: number;
  text: string;
}

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;

/** Parse a version string, or undefined when it is not one. */
export function parseKernelVersion(text: unknown): KernelVersion | undefined {
  if (typeof text !== "string") {
    return undefined;
  }
  const match = VERSION_PATTERN.exec(text);
  if (match === null) {
    return undefined;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), text };
}

/** Negative, zero or positive, as `left` is older than, equal to or newer than `right`. */
export function compareKernelVersions(left: KernelVersion, right: KernelVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/** The running kernel's own version, from its package.json. */
export function runningKernelVersion(): KernelVersion {
  const own = readOwnVersion();
  const parsed = parseKernelVersion(own);
  if (parsed === undefined) {
    throw new Error(`the kernel's own package.json version ${own} is not major.minor.patch`);
  }
  return parsed;
}

/**
 * What a document says about its stamp. `absent` is pre-stamp history.
 * `malformed` is a stamp that is present and not a version: the schema refuses
 * it, and every reader here treats it as no evidence of any version.
 */
export type StampReading =
  | { kind: "absent" }
  | { kind: "malformed"; value: string }
  | { kind: "stamped"; version: KernelVersion };

export function readStamp(record: unknown): StampReading {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return { kind: "absent" };
  }
  if (!(STAMP_FIELD in record)) {
    return { kind: "absent" };
  }
  const value = (record as Record<string, unknown>)[STAMP_FIELD];
  const parsed = parseKernelVersion(value);
  return parsed === undefined ? { kind: "malformed", value: String(value) } : { kind: "stamped", version: parsed };
}

/**
 * ONE ROW PER RULE ADDED AFTER 0.1.0 THAT A DOCUMENT OF AN EARLIER VERSION
 * COULD FAIL. A schema rule is named by the instance pointer its diagnostics
 * carry; a derived check by its registered id.
 *
 * WHAT IS DELIBERATELY NOT HERE, so an absence is not read as an oversight:
 * - A NEW OPTIONAL FIELD is not a rule an older document can fail, so the
 *   fields added since 0.1.0 are not listed; only their constraints are.
 * - `verdict.head` REQUIRED and the MEDIUM escalation are not rules any more
 *   (0.2.1 moved them to the merge gates), so they have no shape row.
 * - `final-report.delivered-outcome` (M5-P2) is not gated: a final report has
 *   no admission gate behind it, so an unstamped report would escape the rule
 *   with nothing to catch it. Kept as a plan decision; see the 0.2.1 work
 *   history's open questions.
 * - `dual-review-decorrelation` existed in 0.1.0 and is not gated as a whole.
 */
export interface RuleSince {
  id: string;
  type: string;
  since: string;
  /** A schema rule: diagnostics at this pointer, or below it. */
  pointer?: string;
  /** A derived check, by registered id. */
  check?: string;
  statement: string;
}

export const RULES_SINCE: readonly RuleSince[] = [
  {
    id: "verdict-head-full-sha",
    type: "verdict",
    since: "0.2.0",
    pointer: "#/head",
    statement: "a present head is the full forty-character lowercase sha (M4-P10)",
  },
  {
    id: "verdict-pair-approves",
    type: "verdict",
    since: "0.2.0",
    check: "verdict-pair-approves",
    statement: "the committed pair for the head both approve with no blocking finding (M4-P10)",
  },
];

/** Whether a rule introduced at `since` applies to a document with this stamp. */
export function ruleApplies(rule: RuleSince, stamp: StampReading): boolean {
  if (stamp.kind !== "stamped") {
    /* Unstamped is pre-stamp history, held to 0.1.0 only. A MALFORMED stamp
       is refused by the schema itself, so treating it as history here does
       not let it pass: the document is already INVALID on its stamp. */
    return false;
  }
  const since = parseKernelVersion(rule.since) as KernelVersion;
  return compareKernelVersions(stamp.version, since) >= 0;
}

/** The rules of `type` that do NOT apply to a document with this stamp. */
export function rulesNotYetInForce(type: string, stamp: StampReading): RuleSince[] {
  return RULES_SINCE.filter((rule) => rule.type === type && !ruleApplies(rule, stamp));
}

/** The line `tiphys validate` prints for a rule it did not apply, so it is never silent. */
export function describeRuleNotInForce(rule: RuleSince, stamp: StampReading): string {
  const document =
    stamp.kind === "stamped"
      ? `this document is stamped ${STAMP_FIELD} ${stamp.version.text}`
      : stamp.kind === "malformed"
        ? `this document's ${STAMP_FIELD} ${stamp.value} is not a version`
        : `this document carries no ${STAMP_FIELD}, so it is pre-stamp history held to the 0.1.0 rules`;
  return `HISTORY ${rule.id} applies from ${STAMP_FIELD} ${rule.since} (${rule.statement}); ${document}`;
}

/**
 * Why a verdict may NOT be admitted toward a merge on its stamp, or undefined
 * when it may. Admission is never relaxed by the stamp: the stamp must be the
 * running kernel's major.minor or newer.
 */
export function admissionStampProblem(record: unknown, running: KernelVersion = runningKernelVersion()): string | undefined {
  const stamp = readStamp(record);
  const floor = `${String(running.major)}.${String(running.minor)}`;
  if (stamp.kind === "absent") {
    return (
      `carries no ${STAMP_FIELD}, so it does not say which kernel's rules it was written to; a verdict is ` +
      `admitted toward a merge only when stamped ${floor} or newer, the running kernel ${running.text} (DR-0055)`
    );
  }
  if (stamp.kind === "malformed") {
    return `carries ${STAMP_FIELD} ${stamp.value}, which is not a version, so it is not admitted toward a merge (DR-0055)`;
  }
  const version = stamp.version;
  if (version.major < running.major || (version.major === running.major && version.minor < running.minor)) {
    return (
      `is stamped ${STAMP_FIELD} ${version.text}, older than ${floor}, the running kernel ${running.text}; an ` +
      `old stamp would escape the rules added since, so it is history and not admitted toward a merge (DR-0055)`
    );
  }
  return undefined;
}
