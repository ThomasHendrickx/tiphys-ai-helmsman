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
 * 2. ADMISSION (the merge gates). The gates DO NOT READ THE STAMP. Every rule
 *    they apply is applied to every verdict, stamped or not. That is what
 *    keeps the stamp from ever relaxing admission: a writer cannot escape a
 *    current rule with an old stamp, because nothing on the admission path
 *    looks at it. It also means a verdict written under 0.2.0, which has a
 *    head and no stamp, keeps counting when its project upgrades mid-phase.
 *    A first 0.2.1 draft required a current stamp for admission, and that
 *    excluded exactly those in-flight reviews; the orchestrator withdrew it.
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

/**
 * The kernel's own version for STAMPING an artifact it writes, or undefined
 * when no package.json can be found above the running module (a partial
 * kernel staged by a test). A writer then omits the stamp rather than invent
 * one: an absent stamp reads as history everywhere, which is the safe
 * direction, and a made-up value would be a false claim about which rules
 * applied.
 */
export function ownVersionForStamp(): string | undefined {
  try {
    const own = readOwnVersion();
    return parseKernelVersion(own) === undefined ? undefined : own;
  } catch {
    return undefined;
  }
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
 * COULD FAIL. A schema rule is named by the SCHEMA location of its keyword
 * (`schemaPath`, a JSON pointer into the schema document); a derived check by
 * its registered id.
 *
 * WHY THE SCHEMA LOCATION AND NOT THE INSTANCE POINTER. A first version named
 * a schema rule by the instance pointer its diagnostics carry (`#/head`) and
 * dropped every diagnostic there. A pointer names a PLACE in the document, not
 * a rule, so that dropped every rule at the place: re-adding `head` to
 * `required` produced `#/head required property head is missing`, and history
 * swallowed it. The red-witness gate found it (the head-required patch stopped
 * reddening the pulse test). A keyword's schema location names exactly one
 * rule, and removing exactly that keyword leaves every other rule in force.
 *
 * WHAT IS DELIBERATELY NOT HERE, so an absence is not read as an oversight:
 * - A NEW OPTIONAL FIELD is not a rule an older document can fail, so the
 *   fields added since 0.1.0 are not listed; only their constraints are.
 * - `verdict.head` REQUIRED and the MEDIUM escalation are not rules any more
 *   (0.2.1 moved them to the merge gates), so they have no shape row.
 * - `dual-review-decorrelation` existed in 0.1.0 and is not gated as a whole.
 */
export interface RuleSince {
  id: string;
  type: string;
  since: string;
  /**
   * A schema rule: the JSON pointer, into the schema document, of the ONE
   * keyword that is the rule. `tiphys validate` removes exactly that keyword
   * for a document the rule does not apply to, and refuses to run when the
   * pointer does not resolve, so the table cannot drift from the schema
   * silently.
   */
  schemaPath?: string;
  /**
   * When `schemaPath` names an ARRAY keyword (`required`), the one entry of it
   * that is the rule. Only that entry is removed; the rest of the array, which
   * holds rules that existed at 0.1.0, stays in force.
   */
  entry?: string;
  /** A derived check, by registered id. */
  check?: string;
  statement: string;
}

export const RULES_SINCE: readonly RuleSince[] = [
  {
    id: "verdict-head-full-sha",
    type: "verdict",
    since: "0.2.0",
    schemaPath: "/properties/head/pattern",
    statement: "a present head is the full forty-character lowercase sha (M4-P10)",
  },
  {
    id: "verdict-pair-approves",
    type: "verdict",
    since: "0.2.0",
    check: "verdict-pair-approves",
    statement: "the committed pair for the head both approve with no blocking finding (M4-P10)",
  },
  {
    /* M5-P2 (#207) landed before the 0.2.0 bump (#208), so the rule is 0.2.0's.
       A final report is read by no admission gate, so gating it by stamp lets
       no old stamp buy a merge; the orchestrator's ruling on the 0.2.1 round.
       New work is still held to it: the shipped template is stamped with the
       package version (templates/final-report.example.yaml). */
    id: "final-report-delivered-outcome-required",
    type: "final-report",
    since: "0.2.0",
    schemaPath: "/required",
    entry: "delivered-outcome",
    statement: "a final report carries a delivered-outcome answering the phase intent (M5-P2)",
  },
];

/** Whether a rule introduced at `since` applies to a document with this stamp. */
export function ruleApplies(rule: RuleSince, stamp: StampReading): boolean {
  const since = parseKernelVersion(rule.since);
  if (since === undefined) {
    /* An authoring defect in RULES_SINCE, never consumer input. Fail loudly
       and name the row, for EVERY document and not only a stamped one,
       rather than crash on an undefined inside the comparison (the 0.2.1
       hazard review, CR-KH-002). */
    throw new Error(
      `internal defect: RULES_SINCE entry ${rule.id} has since ${JSON.stringify(rule.since)}, which is not a kernel version (major.minor.patch)`,
    );
  }
  if (stamp.kind !== "stamped") {
    /* Unstamped is pre-stamp history, held to 0.1.0 only. A MALFORMED stamp
       is refused by the schema itself, so treating it as history here does
       not let it pass: the document is already INVALID on its stamp. */
    return false;
  }
  return compareKernelVersions(stamp.version, since) >= 0;
}

/** How `tiphys validate` names a document's stamp in a NOT IN FORCE line. */
export function describeStamp(stamp: StampReading): string {
  return stamp.kind === "stamped"
    ? `${STAMP_FIELD} ${stamp.version.text}`
    : stamp.kind === "malformed"
      ? `${STAMP_FIELD} ${String(stamp.value)} (not a version)`
      : `no ${STAMP_FIELD}`;
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
