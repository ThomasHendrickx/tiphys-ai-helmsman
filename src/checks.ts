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

import { join } from "node:path";
import { decodeDocument, readOperatorPath } from "./validate.ts";
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
      /* COUNTED, not just collected. B-003 (fix round 1): a phase with two
         acceptance entries sharing an id lets `addressed-by: "criterion 3"`
         resolve to a DECOY, so the hazard class points at a criterion that
         exists and does not redden against it. T-007's completeness
         guarantee then fails one level INSIDE the mechanism built to enforce
         it, and the resolution still reports success. An ambiguous resolution
         is therefore a violation of THIS check rather than a new one: what
         the check promises is that `addressed-by` resolves to A criterion,
         and it cannot promise that when it resolves to two. */
      const criterionCounts = new Map<string, number>();
      for (const entry of asArray(phase["acceptance"])) {
        const id = asRecord(entry)?.["id"];
        if (typeof id === "string") {
          criterionCounts.set(id, (criterionCounts.get(id) ?? 0) + 1);
        }
      }
      const criterionIds = new Set(criterionCounts.keys());
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
            continue;
          }
          const occurrences = criterionCounts.get(criterionId) ?? 0;
          if (occurrences > 1) {
            violations.push({
              pointer,
              message: `criterion ${criterionId} is declared ${String(occurrences)} times in phase ${String(phase["id"])}, so this hazard class resolves ambiguously`,
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

/* ================================================================== */
/* M3-P3: the assurance-mode checks                                    */
/* ================================================================== */

/** The mode whose pipeline every other mode's downgrades are measured against. */
const REFERENCE_MODE_ID = "full";

/** The document name these checks report against when naming the instance. */
const MODES_DOCUMENT = "assurance-modes.yaml";

/** Every string in an array field, in order, with non-strings dropped. */
function stringsAt(record: Record<string, unknown> | undefined, key: string): string[] {
  return asArray(record?.[key]).filter(
    (value): value is string => typeof value === "string",
  );
}

/** `{index, record, id}` for every element of `modes[]` that is an object. */
function eachMode(
  instance: unknown,
): { index: number; mode: Record<string, unknown>; id: string }[] {
  const document = asRecord(instance);
  const modes = asArray(document?.["modes"]);
  const rows: { index: number; mode: Record<string, unknown>; id: string }[] = [];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = asRecord(modes[index]);
    if (mode === undefined) {
      continue;
    }
    rows.push({ index, mode, id: String(mode["id"] ?? "") });
  }
  return rows;
}

/**
 * Read and decode a document from the CONTEXT directory, or say why not.
 *
 * FAIL CLOSED. A cross-document rule whose other document is missing must not
 * become a pass: that is the vacuous shape this whole module exists to
 * prevent, one level down from `SKIPPED <id> no context`. The path is not one
 * this program created, so it is classified before it is opened
 * (`readOperatorPath`, D-M3-27) rather than opened and hoped about.
 */
function readContextDocument(
  contextDirectory: string,
  relativePath: string,
): { ok: true; value: unknown; path: string } | { ok: false; reason: string } {
  const path = join(contextDirectory, relativePath);
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  return { ok: true, value: decoded.value, path };
}

/* ------------------------------------------------------------------ */
/* mode-no-undeclared-downgrade (blueprint section 8, M3-P3 criterion 3a) */
/* ------------------------------------------------------------------ */

/**
 * "Downgrades are declared, never improvised" (blueprint section 8), made
 * falsifiable: every stage the reference mode `full` runs and this mode does
 * not must appear in this mode's `skips[]`.
 *
 * NO SCHEMA KEYWORD REACHES THIS. It is a set difference between the
 * `pipeline` of ONE array element and the `pipeline` of a SIBLING element,
 * selected by id, compared against a third field of the first (M3R-002). The
 * schema's whole share is that `skips` exists and holds stage ids.
 *
 * TWO STRUCTURALLY DIFFERENT WAYS TO EVADE IT, and both are violations here
 * rather than one being left implied:
 *
 *   1. a mode omits a stage and declares NOTHING (`skips: []`);
 *   2. a mode omits two stages and declares ONE of them, so the document reads
 *      as a mode that has accounted for itself while one downgrade is silent.
 *
 * AND A THIRD, WHICH IS WHY THE MISSING REFERENCE IS A VIOLATION AND NOT A
 * QUIET RETURN: deleting the `full` mode from the document disables the
 * comparison for every remaining mode at once, so a document with one
 * `direct-pr` mode, an empty `skips[]` and no `clean-room-review` would pass a
 * check that returned early. That is the same defect one level up, so the
 * absent reference fails closed.
 */
export const modeNoUndeclaredDowngrade: DerivedCheck = {
  id: "mode-no-undeclared-downgrade",
  type: "assurance-modes",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const rows = eachMode(instance);
    if (rows.length === 0) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const reference = rows.find((row) => row.id === REFERENCE_MODE_ID);
    if (reference === undefined) {
      violations.push({
        pointer: "#/modes",
        message: `no mode declares id ${REFERENCE_MODE_ID}, so no mode's omitted stages can be measured against the reference pipeline`,
      });
      return { violations, reports: [] };
    }
    const referenceStages = stringsAt(reference.mode, "pipeline");
    for (const row of rows) {
      if (row.index === reference.index) {
        continue;
      }
      const own = new Set(stringsAt(row.mode, "pipeline"));
      const declared = new Set(stringsAt(row.mode, "skips"));
      const undeclared = referenceStages.filter(
        (stage) => !own.has(stage) && !declared.has(stage),
      );
      for (const stage of undeclared) {
        violations.push({
          pointer: `#/modes/${String(row.index)}/skips`,
          message: `mode ${row.id} omits stage ${stage}, which mode ${REFERENCE_MODE_ID} runs, and does not declare it in skips`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* mode-stage-order (R-024, M3-P3 criterion 3b)                         */
/* ------------------------------------------------------------------ */

/**
 * R-024: an adversarial plan review happens before anyone builds.
 *
 * THE RELATIVE POSITION OF TWO VALUES IN A VARIABLE-LENGTH ARRAY IS NOT A
 * KEYWORD PROPERTY (M3R-002). `contains` can say both are present and nothing
 * in the vocabulary can say which comes first.
 *
 * The rule has TWO ARMS because there are two ways to build before a review,
 * and the plan states both: reorder them, or delete the review. So a mode
 * whose pipeline contains `implement` and NOT `adversarial-plan-review` must
 * list the review in `skips[]`, which is the same declared-downgrade
 * discipline applied to the one stage R-024 is about.
 */
export const modeStageOrder: DerivedCheck = {
  id: "mode-stage-order",
  type: "assurance-modes",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const violations: Diagnostic[] = [];
    for (const row of eachMode(instance)) {
      const pipeline = stringsAt(row.mode, "pipeline");
      const review = pipeline.indexOf("adversarial-plan-review");
      const implement = pipeline.indexOf("implement");
      if (implement === -1) {
        continue;
      }
      if (review === -1) {
        if (!stringsAt(row.mode, "skips").includes("adversarial-plan-review")) {
          violations.push({
            pointer: `#/modes/${String(row.index)}/skips`,
            message: `mode ${row.id} runs implement without adversarial-plan-review and does not declare that stage in skips (R-024)`,
          });
        }
        continue;
      }
      if (review > implement) {
        violations.push({
          pointer: `#/modes/${String(row.index)}/pipeline`,
          message: `mode ${row.id} places implement at position ${String(implement)} and adversarial-plan-review at position ${String(review)}, so building starts before the review (R-024)`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* mode-gate-sets-resolve (M3-P3 criterion 3d)                          */
/* ------------------------------------------------------------------ */

/**
 * Every `gate-sets[]` entry RESOLVES against `gate-registry.yaml`.
 *
 * WHAT "RESOLVES" MEANS HERE, stated because a checker whose promise is vague
 * is a checker nobody can falsify: the entry names a gate the registry
 * declares, AND that gate's own `modes` list names this mode. Both halves are
 * needed, because a reference that resolves to a gate which never runs in this
 * mode is a mode whose assurance is a name with no gates behind it, which is
 * the hazard exactly as the plan words it.
 *
 * `requiresContext` is TRUE, so invoking the validator without `--context`
 * prints `SKIPPED mode-gate-sets-resolve no context` and exits nonzero. That
 * is the point of the mechanism (M3-P1 criterion 4c): a cross-document rule
 * must never be able to pass BY NOT RUNNING.
 */
export const modeGateSetsResolve: DerivedCheck = {
  id: "mode-gate-sets-resolve",
  type: "assurance-modes",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Kept fail-closed
         rather than trusting a caller that reaches the check directly. */
      return {
        violations: [
          { pointer: "#/modes", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const registryDocument = readContextDocument(contextDirectory, "gate-registry.yaml");
    if (!registryDocument.ok) {
      return {
        violations: [
          {
            pointer: "#/modes",
            message: `the gate registry could not be read, so no gate set reference could be resolved: ${registryDocument.reason}`,
          },
        ],
        reports: [],
      };
    }
    const declared = new Map<string, Set<string>>();
    for (const gate of asArray(asRecord(registryDocument.value)?.["gates"])) {
      const record = asRecord(gate);
      const id = record?.["id"];
      if (typeof id === "string") {
        declared.set(id, new Set(stringsAt(record, "modes")));
      }
    }
    const violations: Diagnostic[] = [];
    for (const row of eachMode(instance)) {
      const references = stringsAt(row.mode, "gate-sets");
      for (let position = 0; position < references.length; position += 1) {
        const reference = references[position] as string;
        const pointer = `#/modes/${String(row.index)}/gate-sets/${String(position)}`;
        const modesOfGate = declared.get(reference);
        if (modesOfGate === undefined) {
          violations.push({
            pointer,
            message: `gate set ${reference} is not declared in ${registryDocument.path}`,
          });
          continue;
        }
        if (!modesOfGate.has(row.id)) {
          violations.push({
            pointer,
            message: `gate set ${reference} is declared in ${registryDocument.path} and its modes list does not name ${row.id}, so it never runs in this mode`,
          });
        }
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* charter-mode-enum-matches-modes (M3-P3 step 4, criterion 4)          */
/* ------------------------------------------------------------------ */

/**
 * The charter schema's mode enums equal the ids declared here.
 *
 * `schemas/charter.schema.json` declares the mode vocabulary a project charter
 * may use, and this document declares what those modes ARE. Two lists, one
 * fact. Without this check they are a duplication that drifts silently the
 * first time a mode is added, which is the same drift hole M3-P2 closed for
 * the gate list.
 *
 * BOTH FIELDS, not one. The charter carries `delivery-mode` AND
 * `assurance-tier`, M3-P1 shipped the identical placeholder enum on both, and
 * step 4 names both ("Add `mode` and `assurance-tier` validation to the
 * charter schema's enum"). A check that watched only one would leave the other
 * free to drift, which is the hazard rather than a smaller version of it.
 */
export const charterModeEnumMatchesModes: DerivedCheck = {
  id: "charter-mode-enum-matches-modes",
  type: "assurance-modes",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      return {
        violations: [
          { pointer: "#/modes", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const charter = readContextDocument(
      contextDirectory,
      join("schemas", "charter.schema.json"),
    );
    if (!charter.ok) {
      return {
        violations: [
          {
            pointer: "#/modes",
            message: `the charter schema could not be read, so its mode enum could not be compared with ${MODES_DOCUMENT}: ${charter.reason}`,
          },
        ],
        reports: [],
      };
    }
    const declaredIds = eachMode(instance)
      .map((row) => row.id)
      .sort();
    const properties = asRecord(asRecord(charter.value)?.["properties"]);
    const violations: Diagnostic[] = [];
    for (const field of ["delivery-mode", "assurance-tier"]) {
      const definition = asRecord(properties?.[field]);
      if (definition === undefined) {
        violations.push({
          pointer: "#/modes",
          message: `${charter.path} declares no ${field} property, so the mode ids in ${MODES_DOCUMENT} have nothing to agree with`,
        });
        continue;
      }
      const enumerated = stringsAt(definition, "enum").slice().sort();
      if (enumerated.join(" ") !== declaredIds.join(" ")) {
        violations.push({
          pointer: "#/modes",
          message: `${MODES_DOCUMENT} declares mode ids [${declaredIds.join(", ")}] and the ${field} enum in ${charter.path} is [${enumerated.join(", ")}]; the two must be equal`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

const registry: DerivedCheck[] = [
  charterModeEnumMatchesModes,
  modeGateSetsResolve,
  modeNoUndeclaredDowngrade,
  modeStageOrder,
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
