/**
 * THE DERIVED-CHECK REGISTRY (kernel plan M3, section 2.3 Kind B; step 8).
 *
 * JSON Schema expresses properties of ONE document reachable by one keyword.
 * A property that compares array elements to each other, resolves a reference
 * into another document, computes arithmetic over sibling fields or touches
 * the filesystem is not expressible by any keyword under any DR-0013 option,
 * and this module is where the plan stopped pretending otherwise (M3R-002).
 *
 * Each check runs AFTER schema validation succeeds and reports through the
 * same contract with its own id attached:
 *
 *   INVALID <json-pointer> <message> (check: <check-id>)
 *
 * A check that needs a CONTEXT it was not given reports
 * `SKIPPED <check-id> no context` and the command exits nonzero. That is the
 * whole point of the mechanism: a cross-document rule must never be able to
 * pass BY NOT RUNNING, which is the vacuous-pass shape SC-011 and M2-C-2 both
 * exist to prevent, one layer up.
 *
 * DR-0013 clause 8: Kind B rules stay HERE and are never encoded as Ajv
 * extensions. The Kind A / Kind B boundary is binding.
 *
 * D-M3-22: a check that belongs in section 2.3's table and is not in it is a
 * PLAN DEFECT to escalate, not a script to add quietly.
 */

import type { Diagnostic } from "./validate.ts";

/** What one derived check produced. */
export interface CheckOutcome {
  /** Violations, each of which makes the command exit nonzero. */
  violations: Diagnostic[];
  /**
   * Lines the check REPORTS rather than fails on. `plan-dispatchable` is the
   * instance: a phase whose `fill-in` is present and unfilled is valid for
   * REVIEW and invalid for DISPATCH, so the validator computes and reports
   * it instead of rejecting the document.
   */
  reports: string[];
}

export interface DerivedCheck {
  id: string;
  /** The artifact type this check is registered for. */
  type: string;
  /**
   * True when the check resolves references into documents OTHER than the
   * instance, so `--context <dir>` is required and its absence is a SKIP
   * with a nonzero exit rather than a silent pass.
   */
  requiresContext: boolean;
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome;
}

const EMPTY: CheckOutcome = { violations: [], reports: [] };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------ */
/* plan-verification-first-present (R-012, M3R-002)                     */
/* ------------------------------------------------------------------ */

/**
 * A `report-code-disagreement` entry with `verified: false` names a claim
 * that has NOT been confirmed against the code. R-012 says such a claim
 * becomes a verification-first step: step 1 is confirm, write down, then
 * build. So the owning phase must carry a step with `kind:
 * verification-first`.
 *
 * No schema keyword reaches this: it matches an element of ONE array against
 * a step nested inside an element of ANOTHER array, selected by phase id. A
 * foreign-key lookup across arrays is not a keyword property.
 */
export const planVerificationFirstPresent: DerivedCheck = {
  id: "plan-verification-first-present",
  type: "plan",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const plan = asRecord(instance);
    if (plan === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const phases = asArray(plan["phases"]);
    const disagreements = asArray(plan["report-code-disagreement"]);
    for (let index = 0; index < disagreements.length; index += 1) {
      const entry = asRecord(disagreements[index]);
      if (entry === undefined || entry["verified"] !== false) {
        continue;
      }
      const phaseId = entry["phase"];
      const owning = phases.find(
        (candidate) => asRecord(candidate)?.["id"] === phaseId,
      );
      const pointer = `#/report-code-disagreement/${String(index)}`;
      if (owning === undefined) {
        violations.push({
          pointer,
          message: `unverified claim names phase ${String(phaseId)}, which this plan does not contain`,
        });
        continue;
      }
      const steps = asArray(asRecord(owning)?.["steps"]);
      const hasVerificationFirst = steps.some(
        (step) => asRecord(step)?.["kind"] === "verification-first",
      );
      if (!hasVerificationFirst) {
        violations.push({
          pointer,
          message: `unverified claim is owned by phase ${String(phaseId)}, which declares no verification-first step`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* plan-dispatchable (R-014)                                            */
/* ------------------------------------------------------------------ */

/**
 * A phase whose `fill-in` is present and unfilled is VALID FOR REVIEW and
 * INVALID FOR DISPATCH. That is a derived boolean over the slots rather than
 * a property of any one field, so the validator computes and REPORTS it. A
 * schema cannot express it, and rejecting the document would be wrong: the
 * plan is legitimately reviewable in that state.
 */
export const planDispatchable: DerivedCheck = {
  id: "plan-dispatchable",
  type: "plan",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const plan = asRecord(instance);
    if (plan === undefined) {
      return EMPTY;
    }
    const unfilled: string[] = [];
    for (const phase of asArray(plan["phases"])) {
      const record = asRecord(phase);
      const fillIn = asRecord(record?.["fill-in"]);
      if (fillIn === undefined) {
        continue;
      }
      if (fillIn["filled"] !== true) {
        unfilled.push(String(record?.["id"]));
      }
    }
    const dispatchable = unfilled.length === 0;
    const reports = [`dispatchable: ${dispatchable ? "true" : "false"}`];
    if (!dispatchable) {
      reports.push(
        `not dispatchable because these phases carry an unfilled fill-in: ${unfilled.sort().join(", ")}`,
      );
    }
    return { violations: [], reports };
  },
};

/* ------------------------------------------------------------------ */
/* plan-hazard-classes-addressed-by-resolves (section 2.6, D-M3-35)     */
/* ------------------------------------------------------------------ */

/**
 * Every `hazard-classes[].addressed-by` must RESOLVE. Its two arms resolve
 * against DIFFERENT things, which is why one witness is not a class here:
 *
 *   `criterion <id>`     resolves into the SAME phase's `acceptance[]` ids;
 *   `later-phase: <id>`  resolves into the PLAN's `phases[]` ids.
 *
 * `enum` cannot express either, because the admissible values are computed
 * per phase rather than fixed. The schema's `pattern` is the Kind A half and
 * checks only the SHAPE of the string; a shape that resolves to nothing is
 * precisely the defect section 2.6 was written after finding: a hazard class
 * that names a criterion which does not exist has documented an obligation
 * instead of creating one.
 */
export const planHazardClassesAddressedByResolves: DerivedCheck = {
  id: "plan-hazard-classes-addressed-by-resolves",
  type: "plan",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const plan = asRecord(instance);
    if (plan === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const phases = asArray(plan["phases"]);
    const phaseIds = new Set(
      phases
        .map((phase) => asRecord(phase)?.["id"])
        .filter((id): id is string => typeof id === "string"),
    );
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const phase = asRecord(phases[phaseIndex]);
      if (phase === undefined) {
        continue;
      }
      const criterionIds = new Set(
        asArray(phase["acceptance"])
          .map((entry) => asRecord(entry)?.["id"])
          .filter((id): id is string => typeof id === "string"),
      );
      const hazards = asArray(phase["hazard-classes"]);
      for (let hazardIndex = 0; hazardIndex < hazards.length; hazardIndex += 1) {
        const hazard = asRecord(hazards[hazardIndex]);
        const addressedBy = hazard?.["addressed-by"];
        if (typeof addressedBy !== "string") {
          continue;
        }
        const pointer = `#/phases/${String(phaseIndex)}/hazard-classes/${String(hazardIndex)}/addressed-by`;
        if (addressedBy.startsWith("criterion ")) {
          const criterionId = addressedBy.slice("criterion ".length).trim();
          if (!criterionIds.has(criterionId)) {
            violations.push({
              pointer,
              message: `criterion ${criterionId} is not an acceptance criterion of phase ${String(phase["id"])}`,
            });
          }
          continue;
        }
        if (addressedBy.startsWith("later-phase: ")) {
          const target = addressedBy.slice("later-phase: ".length).trim();
          if (!phaseIds.has(target)) {
            violations.push({
              pointer,
              message: `deferred to phase ${target}, which this plan does not contain`,
            });
          }
        }
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

const registry: DerivedCheck[] = [
  planDispatchable,
  planHazardClassesAddressedByResolves,
  planVerificationFirstPresent,
];

/** Register a check. Later phases append their own (section 2.3's table). */
export function registerCheck(check: DerivedCheck): void {
  registry.push(check);
}

/** Remove a check by id. Returns whether one was removed. */
export function deregisterCheck(id: string): boolean {
  const index = registry.findIndex((check) => check.id === id);
  if (index === -1) {
    return false;
  }
  registry.splice(index, 1);
  return true;
}

/** Every check registered for an artifact type, in stable id order. */
export function checksFor(type: string): DerivedCheck[] {
  return registry
    .filter((check) => check.type === type)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The outcome of running every check registered for a type. */
export interface ChecksRun {
  /** Lines to print, in the order they should appear. */
  lines: string[];
  /** True when at least one check violated or was skipped for want of context. */
  failed: boolean;
}

/**
 * Run every registered check for `type`.
 *
 * A check whose `requiresContext` is true and which was given none is
 * SKIPPED and the run FAILS. It is deliberately not an ordinary violation:
 * "this rule did not run" and "this rule found a problem" are different
 * facts and a reader must be able to tell them apart, but both are reasons
 * not to trust a green.
 */
export function runChecks(
  type: string,
  instance: unknown,
  contextDirectory: string | undefined,
): ChecksRun {
  const violationLines: string[] = [];
  const reportLines: string[] = [];
  const skippedLines: string[] = [];
  for (const check of checksFor(type)) {
    if (check.requiresContext && contextDirectory === undefined) {
      skippedLines.push(`SKIPPED ${check.id} no context`);
      continue;
    }
    const outcome = check.run(instance, contextDirectory);
    for (const violation of outcome.violations) {
      violationLines.push(
        `INVALID ${violation.pointer} ${violation.message} (check: ${check.id})`,
      );
    }
    reportLines.push(...outcome.reports);
  }
  violationLines.sort();
  return {
    lines: [...skippedLines, ...violationLines, ...reportLines],
    failed: violationLines.length > 0 || skippedLines.length > 0,
  };
}
