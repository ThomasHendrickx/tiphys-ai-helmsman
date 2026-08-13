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

import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { decodeDocument, readOperatorPath } from "./validate.ts";
import type { Diagnostic } from "./validate.ts";
/* M3-P8. The two tuition checks resolve operator-supplied paths against the
   tree, so they classify an entry before deciding anything about it rather
   than opening it (D-M3-27, the mechanism index's row
   `reading-a-path-whose-type-is-not-established`). */
import { classifyEntry } from "./task.ts";

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
   * THE OTHER artifact types this check must ALSO run on. Added by M3-P4 fix
   * round 2 for CR-001, whose MECHANISM is worth stating at the field rather
   * than at the one check that tripped over it:
   *
   *   A DERIVED CHECK IS REGISTERED PER TYPE AND READS A TYPE-SPECIFIC KEY,
   *   WHILE THE `$defs` IT GUARDS ARE SHARED ACROSS TYPES BY `$ref`.
   *   SHARING A DEFINITION THEREFORE DOES NOT SHARE ITS CHECK.
   *
   * Keywords travel through a `$ref` and derived checks do not, so a schema
   * author who moves a rule into a shared definition gets the keyword half of
   * the sharing for free and the Kind B half not at all. That asymmetry is
   * invisible at the definition site, which is why `schemas/report.schema.json`
   * could carry a comment saying a check applied where it did not.
   *
   * `guards` below names the shared definitions this check enforces, and
   * `test/report-contract.test.ts` walks the TRANSITIVE closure of `$ref` in
   * `schemas/`, failing when a guarded definition is reachable from a type
   * this check does not list, or when a `guards` pointer resolves to nothing.
   * REACHABLE was false of the ONE-HOP walk shipped before M3-P4 round 3.
   */
  alsoTypes?: readonly string[];
  /**
   * The shared `$def`s this check enforces, written as the pointer a
   * cross-document `$ref` uses (`report.schema.json#/$defs/gateResult`).
   * Absent means the check enforces nothing shared, which is the ordinary
   * case: `plan-dispatchable` reads properties that exist in one document
   * type only.
   */
  guards?: readonly string[];
  /**
   * True when the check resolves references into documents OTHER than the
   * instance, so `--context <dir>` is required and its absence is a SKIP
   * with a nonzero exit rather than a silent pass.
   */
  requiresContext: boolean;
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome;
}

/** Every artifact type one check runs on, `type` first and then `alsoTypes`. */
export function typesOf(check: DerivedCheck): readonly string[] {
  return [check.type, ...(check.alsoTypes ?? [])];
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

/**
 * Do two string lists hold the same values in the same order?
 *
 * ELEMENT-WISE, WITH NO SEPARATOR (M3-P3 fix round 1, finding A-001/B-001).
 * This comparison was written as `a.join(sep) !== b.join(sep)`, and the
 * separator in the source was two LITERAL NUL BYTES. Two things were wrong and
 * only one of them was the bytes.
 *
 *   The bytes: `src/checks.ts` is the file every later M3 phase extends, and a
 *   NUL past git's sniff window is worse than an unreviewable diff, because
 *   `git diff --stat` reports no `Bin` and the hunk renders as `join("")`,
 *   which LOOKS CORRECT. CLAUDE.md's prescribed control-character grep could
 *   not see it either, for the reason T-010 records.
 *
 *   The mechanism: a separator join answers "are these lists equal" with a
 *   PROXY, and the proxy is only faithful for separators the values cannot
 *   contain. That is the same shape as the two findings this fix round is
 *   mostly about, one layer down. Replacing NUL with a space would have been
 *   the instance fix and would have made `["a b"]` compare equal to
 *   `["a", "b"]`.
 *
 * SO THE SEMANTICS DID CHANGE, and it is stated rather than slipped in: this
 * is now exact list equality for every input, where `join(NUL)` was exact list
 * equality for every input that contains no NUL. No caller can produce one
 * today (both lists come from YAML/JSON decoding of documents whose values are
 * enum-constrained), so no behaviour observable from any test moved. The
 * registered test `charter-mode-enum-drift-detected` covers both arms and a
 * new arm covers the separator class directly.
 */
function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

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
 *
 * SOUNDNESS, THE CONVERSE DIRECTION, ADDED IN ROUND 9 (CR-002). Everything
 * above asks ONE question: is every stage this mode omits DECLARED? It never
 * asked the converse: is every stage this mode DECLARES actually omitted? A
 * set checked in one direction only is a set nothing constrains, and `skips[]`
 * is shipped DATA that any edit can change. The measured consequence was not
 * hypothetical: `full` keeping its complete twelve-stage pipeline and gaining
 * ONE bogus `skips[]` entry validated at exit 0, and `tiphys mode show --mode
 * full` then printed that no phase of the tiphys project had ever been
 * delivered under the mode this project has delivered every phase under
 * (delivery/review/clean-room-m3-p3-r8-criteria.md:217).
 *
 * SOUNDNESS HAS TWO DIRECTIONS AND ROUND 9 SHIPPED ONE (round 10, V-1).
 * `skips[]` is defined by the document itself as every stage in `full`'s
 * pipeline that this mode's pipeline omits AND NOTHING ELSE, so "actually
 * omitted" is measured against the REFERENCE and an entry can fail it two
 * ways: (A) this mode's own pipeline runs the stage, and (B) NOTHING runs it,
 * that is, it is absent from this mode's pipeline and from `full`'s as well.
 * Round 9 implemented the predicate the reviewer wrote down (A) rather than
 * the property the same reviewer described thirteen lines earlier, and then
 * recorded in two shipped documents that the check ran in both directions.
 * B was reachable on the shipped data with a one-line edit, because the stage
 * vocabulary has thirteen ids and `full`'s pipeline has twelve: `direct-pr`
 * gaining `orchestrator-diff-review` validated at exit 0 and `tiphys mode
 * show` then reported a skipped-stage count one too high with a `skips:` row
 * naming a stage that is no downgrade at all.
 *
 * WHICH SIDE OF THE COMPARISON IS EDITED DOES NOT MATTER, and that is why B is
 * not merely "a typo in skips". Shrinking `full`'s PIPELINE, touching no
 * `skips[]` anywhere, turns every other mode's previously correct entry for
 * that stage into a phantom. The reference is one half of the relation and
 * either half moving breaks it.
 *
 * THE DIRECTION-A PREDICATE RUNS OVER EVERY MODE INCLUDING THE REFERENCE, and
 * that is load-bearing rather than a detail. The completeness loop `continue`s
 * past `full` because a mode cannot omit a stage relative to itself; the
 * soundness question is well posed for `full` too, and `full` is precisely the
 * mode the sharpest member targeted. A soundness loop that inherited the
 * completeness loop's skip would have been green against the finding that
 * caused it to be written.
 *
 * DIRECTION A NEEDS NO REFERENCE MODE, so it runs BEFORE the reference is
 * resolved and its violations survive an absent `full`. A document that both
 * deletes `full` and carries a contradictory `skips[]` reports both facts
 * rather than the first one only. DIRECTION B cannot: it is defined by the
 * reference pipeline, so it runs after the resolution and an absent `full` is
 * already a violation in its own right.
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
    for (const row of rows) {
      const running = new Set(stringsAt(row.mode, "pipeline"));
      for (const stage of stringsAt(row.mode, "skips")) {
        if (running.has(stage)) {
          violations.push({
            pointer: `#/modes/${String(row.index)}/skips`,
            message: `mode ${row.id} declares stage ${stage} in skips while its own pipeline runs it, so skips does not describe what this mode omits`,
          });
        }
      }
    }
    const reference = rows.find((row) => row.id === REFERENCE_MODE_ID);
    if (reference === undefined) {
      violations.push({
        pointer: "#/modes",
        message: `no mode declares id ${REFERENCE_MODE_ID}, so no mode's omitted stages can be measured against the reference pipeline`,
      });
      return { violations, reports: [] };
    }
    const referenceStages = stringsAt(reference.mode, "pipeline");
    /* SOUNDNESS, DIRECTION B (round 10, V-1 and CRB9-02). "Omitted" is
       measured RELATIVE TO THE REFERENCE, so an entry is unsound either
       because this mode runs it (direction A, above) or because NOTHING runs
       it. This loop is the second case and it needs `referenceStages`, which
       is why it sits after the resolution rather than beside direction A.

       IT RUNS OVER EVERY ROW INCLUDING THE REFERENCE, and on the reference the
       two directions together say `full.skips` must be EMPTY: an entry is
       either in `full`'s own pipeline (direction A rejects it) or outside it
       (this loop rejects it). That is not a side effect, it is CRB9-02's fix.
       `executionStatus` keys the un-downgraded sentence off `mode.id`, and
       that is honest only while the reference really declares no downgrade;
       before this loop a `full` whose stage had MOVED from `pipeline` into
       `skips` validated at exit 0 and `tiphys mode show --mode full` printed
       "the un-downgraded process" fifteen lines above a `skips: deploy-verify`
       row. A registered test asserted the shipped document was clean, which
       guards THIS repository's document and not the check, so any other
       document carrying a downgraded reference was served that contradiction.
       A property asserted in one place and not enforced where it is consumed
       is the CR-002 mechanism itself, one level up. */
    const referenceRunning = new Set(referenceStages);
    for (const row of rows) {
      for (const stage of stringsAt(row.mode, "skips")) {
        if (!referenceRunning.has(stage)) {
          violations.push({
            pointer: `#/modes/${String(row.index)}/skips`,
            message: `mode ${row.id} declares stage ${stage} in skips, but mode ${REFERENCE_MODE_ID} does not run it, so it is not a downgrade relative to the reference pipeline`,
          });
        }
      }
    }
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
      if (!sameStringList(enumerated, declaredIds)) {
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
/* IDENTITY UNIQUENESS (M3-P3 fix round 1, findings B-002 and B-004)    */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM, named before the instances: A UNIQUENESS CONSTRAINT ASSERTED
 * BY A PREDICATE THAT DOES NOT TEST IDENTITY.
 *
 * `uniqueItems` is DEEP-OBJECT equality. On an array of records keyed by an id
 * field it says "no two entries are identical", which is not the property
 * anything relies on: two entries may share an `id` and differ anywhere else
 * and the array is `uniqueItems`-clean. Every consumer that looks an entry up
 * BY ID then silently takes one of them, and which one depends on document
 * order.
 *
 * Measured on `assurance-modes.yaml` with a crippled duplicate placed FIRST:
 * `tiphys mode show --mode full` printed eleven stages with
 * `clean-room-review` absent and `skips` empty, exit 0. That is the invisible
 * downgrade this whole phase exists to prevent, on the path a brief uses.
 *
 * IT IS A RECURRENCE. M3-P1's B-003 was the same predicate on
 * `acceptance[].id`, fixed at the instance (that check counts occurrences).
 * The class was not swept, so it came back one phase later in a different
 * document. The sweep is published in delivery/work-history/m3-p3.md.
 *
 * `charter-mode-enum-matches-modes` DOES currently reject a duplicate id, and
 * that is not a defence: it compares the declared id LIST against the charter
 * enum, so it is multiplicity-sensitive BY ACCIDENT. The accident disappears
 * the moment that comparison is rewritten to compare sets, and
 * `role-model-config.yaml` never had it at all.
 */
function makeIdUniquenessCheck(
  id: string,
  type: string,
  arrayField: string,
  idField: string,
  noun: string,
): DerivedCheck {
  return {
    id,
    type,
    requiresContext: false,
    run(instance: unknown): CheckOutcome {
      const document = asRecord(instance);
      const entries = asArray(document?.[arrayField]);
      const seen = new Map<string, number[]>();
      for (let index = 0; index < entries.length; index += 1) {
        const value = asRecord(entries[index])?.[idField];
        if (typeof value !== "string") {
          continue;
        }
        const at = seen.get(value);
        if (at === undefined) {
          seen.set(value, [index]);
        } else {
          at.push(index);
        }
      }
      const violations: Diagnostic[] = [];
      for (const [value, indexes] of [...seen.entries()].sort()) {
        if (indexes.length < 2) {
          continue;
        }
        /* Reported at the SECOND occurrence and later, so the pointer names an
           entry a reader can delete, and the message names every index so the
           first one is findable too. */
        for (const index of indexes.slice(1)) {
          violations.push({
            pointer: `#/${arrayField}/${String(index)}/${idField}`,
            message: `${noun} ${value} is declared ${String(indexes.length)} times, at ${arrayField} ${indexes.map(String).join(", ")}; an id selects one entry and these select ${String(indexes.length)}`,
          });
        }
      }
      return { violations, reports: [] };
    },
  };
}

/** `modes[].id` selects exactly one mode. */
export const modeIdsAreUnique: DerivedCheck = makeIdUniquenessCheck(
  "mode-ids-are-unique",
  "assurance-modes",
  "modes",
  "id",
  "mode id",
);

/**
 * `roles[].role` selects exactly one binding. B-004: the SAME defect, in the
 * document nothing consumes yet, which is why it was latent rather than
 * demonstrable. It is fixed in the same act because the mechanism is one thing.
 */
export const roleIdsAreUnique: DerivedCheck = makeIdUniquenessCheck(
  "role-ids-are-unique",
  "role-model-config",
  "roles",
  "role",
  "role id",
);

/* ------------------------------------------------------------------ */
/* mode-conditions-quote-granted-by (fix round 1, finding B-003)        */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM: A CONSTRAINT VERIFIED BY CARDINALITY INSTEAD OF CONTENT.
 *
 * `merge-authority: delegated-under-conditions` requires `conditions[]` and a
 * `granted-by` decision-record reference. Until this round, the only thing
 * anyone compared was HOW MANY conditions there were: the schema required a
 * non-empty array of non-empty strings, `granted-by` had to match a pattern,
 * and one registered test asserted `length === 6`. So all six sentences could
 * be replaced with fabrications, keeping the count, and the schema, every
 * derived check and the test all stayed green. The document that says who may
 * merge could be rewritten to say something else.
 *
 * THIS CHECK BINDS THE CONDITIONS TO THEIR SOURCE. `granted-by` already names
 * the record, so the record is resolved and every condition must OCCUR in it,
 * compared on whitespace-normalized text because YAML folded scalars re-wrap
 * lines and markdown wraps them differently again. A condition that is not in
 * the record it cites is a violation naming the index and quoting the opening
 * of the offending text.
 *
 * WHAT THIS DOES NOT DO, stated here and not only in the work history: it is
 * the NO-FABRICATION direction only. It cannot see an OMISSION, because
 * "which paragraphs of a prose decision record are its conditions" is not
 * derivable without assuming that record's internal structure, and a kernel
 * check that hard-coded one project's heading text would be a check that
 * reddens on formatting. The omission direction is covered one layer up, by a
 * registered test that parses THIS repository's DR-0012 and requires every
 * condition it declares to be present; that test may know the record's shape
 * because it ships with the record.
 *
 * FAIL CLOSED at every step: no decisions directory, no matching record, or
 * more than one matching record are all violations, never a quiet pass.
 */
const DECISION_DIRECTORIES = [join("delivery", "decisions"), "decisions"];

function normalizeProse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A CommonMark source position: `[[startLine, startColumn], [endLine, endColumn]]`,
 * every component ONE-BASED and INCLUSIVE, and the columns are CHARACTER offsets
 * into the raw line rather than display columns.
 *
 * That last sentence is load-bearing and was measured, not assumed, because the
 * library's own documentation says "column" and a display column would make every
 * tab-indented slice below wrong by three characters. Measured against
 * `commonmark` 0.31.2 on 2026-08-09, four shapes whose answers differ between the
 * two readings:
 *
 *   "- item\n\n\tcontinuation with tab\n"  paragraph [[3,2],[3,22]]  -> slice(1)
 *   "  - a\n\n\t  b\n"                      paragraph [[3,4],[3,4]]   -> slice(3)
 *   "-\tTab after the marker and more.\n"  paragraph [[1,3],[1,32]]  -> slice(2)
 *   ">\tquoted after tab\n"                paragraph [[1,3],[1,18]]  -> slice(2)
 *
 * Every one lands exactly on the first content character, which only a character
 * offset does. The captures are in `delivery/work-history/m3-p3.md`.
 */
type SourcePosition = [[number, number], [number, number]];

/**
 * The part of `commonmark`'s AST this module reads, declared locally so that
 * `@types/commonmark` is not a dependency. Six members, all of them structure:
 * this module never reads `literal`, and that is the whole of DR-0022's A2
 * versus A distinction (see `quotableUnits`).
 */
interface CommonMarkNode {
  readonly type: string;
  readonly sourcepos: SourcePosition;
  readonly firstChild: CommonMarkNode | null;
  readonly next: CommonMarkNode | null;
}

interface CommonMarkModule {
  Parser: new () => { parse(input: string): CommonMarkNode };
}

/**
 * `commonmark` IS LOADED LAZILY, FOR THE REASON `src/validate.ts` STATES AT
 * LENGTH FOR `ajv` AND `yaml`, and it is not a style choice here either.
 *
 * `copyInstallation` in `test/scope-gate.test.ts` copies `src/` to a scratch
 * location outside the repository and runs it there, where no `node_modules`
 * sits above the copy. A top-level `import ... from "commonmark"` in this
 * module makes that test fail with `ERR_MODULE_NOT_FOUND` at module load,
 * before the condition it exists to exercise can happen. `createRequire` defers
 * the resolution to the first record actually parsed.
 */
const requireDependency = createRequire(import.meta.url);

function commonMarkModule(): CommonMarkModule {
  return requireDependency("commonmark") as CommonMarkModule;
}

/**
 * The block types whose own text belongs to NO quotable unit: DECLARED INTENT,
 * NOT THE MECHANISM THAT PERFORMS THE EXCLUSION. Read the next paragraph before
 * relying on this set for anything.
 *
 * Headings (ATX and setext are one node type here, which is the point), code
 * blocks (fenced and indented, likewise), HTML blocks and thematic breaks.
 * A link reference definition produces no node at all, so it needs no entry:
 * the parser removes it before this walk ever sees the document.
 *
 * WHAT THIS SET ACTUALLY DOES TODAY, corrected after a clean-room review found
 * the docstring claiming more than the code performs (CR-003, round 7). Under
 * `commonmark` 0.31.2 EMPTYING THIS SET CHANGES NO ANSWER, and the reason is
 * structural rather than "no test covers it": all four types are LEAF blocks in
 * that parser's AST. `code_block`, `html_block` and `thematic_break` have no
 * children at all, and a `heading`'s children are INLINE nodes, never
 * `paragraph`. Both walkers below emit a unit only for a `paragraph` child, so
 * descending into any of these four reaches nothing that can produce a unit.
 * Measured, `commonmark` 0.31.2, node v26.6.0:
 *
 *   heading         children: ["text","code","text","strong"]
 *   code_block      children: []
 *   html_block      children: []
 *   thematic_break  children: []
 *
 * The true sentence is therefore: these types cannot contribute a unit under
 * `commonmark` 0.31.2 whether or not they appear here; THE SET EXISTS SO THAT A
 * PARSER CHANGE CANNOT MAKE THEM CONTRIBUTE ONE. Keeping it is what makes the
 * exclusion intentional rather than incidental to one parser version, and a
 * release that gave `html_block` block children, or a Markdown extension in a
 * consuming project, is exactly the event it is here for.
 *
 * The registered tests named "code block content ... is not a quotable unit"
 * and "heading text ... is not a quotable unit" therefore guard the shared
 * `paragraph`-versus-`else` branches, not this set; their witness specs mutate
 * those branches for that reason.
 */
const NOT_QUOTABLE = new Set(["code_block", "heading", "html_block", "thematic_break"]);

/**
 * Whether a paragraph node still carries prose, asked STRUCTURALLY.
 *
 * A paragraph with NO inline children is a paragraph the parser emptied, and it
 * is not a curiosity: `commonmark` 0.31.2 leaves exactly one behind, WITH ITS
 * ORIGINAL `sourcepos` STILL SPANNING THE TEXT IT REMOVED. The shape is a link
 * reference definition immediately followed by a setext underline of `-`:
 *
 *   "[zeta]: https://example.invalid/delta\n---\n"
 *   renders <p></p><hr />, and the AST is
 *     paragraph [[1,1],[1,37]] firstChild=null
 *     thematic_break [[2,1],[2,3]]
 *
 * The setext-heading start rule strips leading reference definitions from the
 * paragraph and then DECLINES to make a heading because nothing is left, so the
 * document's own reference sweep never sees them (they are already gone) and
 * never advances the start line the way it does in every other case. Slicing
 * that paragraph's source yields the reference definition as a quotable unit,
 * which is the fail-open direction.
 *
 * FOUND BY THE DIFFERENTIAL FUZZ, NOT BY READING: 13 divergences in 4,973
 * adjudicated documents at seed 20260809, every one this shape. Both oracles
 * agreed the correct answer is no unit at all. Recorded in
 * `delivery/work-history/m3-p3.md` with the captures.
 *
 * This is a structure question and is answered with a structure test. Reading
 * the inline text to decide would settle the same case and would be the first
 * step back towards option A, which is the thing DR-0022 rules out.
 */
function carriesProse(paragraph: CommonMarkNode): boolean {
  return paragraph.firstChild !== null;
}

/**
 * The RAW SOURCE spanned by a node, as written, markup and all.
 *
 * `quoteDepth` is how many block quotes enclose the node. `sourcepos` gives the
 * FIRST line a column past the `>` markers and says nothing about the node's
 * CONTINUATION lines, which still carry theirs, so each continuation has up to
 * that many markers stripped. Without it a two-line quoted paragraph comes back
 * carrying a `>` in the middle of the unit. Measured on `commonmark` 0.31.2:
 *
 *   "> 1. an item in a quote\n>    continued here\n"
 *   paragraph [[1,6],[2,19]], sliced naively: "an item in a quote >    continued here"
 *
 * A LAZY continuation line carries no marker at all, so the strip is written to
 * be a no-op when the marker is absent rather than to assume it is present.
 */
const SPACE = 0x20;
const TAB = 0x09;
const GREATER_THAN = 0x3e;
const HYPHEN = 0x2d;
const ASTERISK = 0x2a;
const PLUS = 0x2b;
const PERIOD = 0x2e;
const RIGHT_PAREN = 0x29;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

/** A space or a tab, the only two characters CommonMark counts as indentation
 *  inside a container prefix. `charCodeAt` past the end is NaN, which compares
 *  false against both, so no caller needs a separate bounds test. */
function isIndent(code: number): boolean {
  return code === SPACE || code === TAB;
}

/**
 * ONE BLOCK-QUOTE MARKER at `from`, with the indentation in front of it, as a
 * LENGTH: how many characters it occupies, or 0 when there is no marker there.
 * Declared once because THREE places consume exactly this (the prefix scan
 * below and BOTH recovery strips) and a second copy of a grammar is how the
 * three models described under `isSkippablePrefix` came to disagree in the
 * first place. It is deliberately NARROWER than the prefix scan: see
 * `startOffset`.
 *
 * NOTE THE ZERO CASE. Indentation with no `>` after it is NOT a quote marker
 * and returns 0, not the indentation's length, which is what the regex this
 * replaced did (it matched as a whole or not at all).
 *
 * ROUND 8 MADE THIS A SCAN RATHER THAN A SHARED REGEX OBJECT, and that is
 * verification finding V-6 rather than a style preference. Round 7 shared one
 * regex OBJECT between an `.exec` and a `.replace`. That was correct, but only
 * because the literal carried no `g` flag: `lastIndex` lives on the OBJECT, so
 * adding `g` would have made the `.exec` in `startOffset` stateful across
 * calls and silently stopped the second iteration of its loop. A function has
 * no `lastIndex`, so that hazard cannot be written here at all. Removing a
 * class beats guarding an instance of it, and here it also costs nothing,
 * because the V-1 fix below needs to consume this same grammar and would
 * otherwise have introduced a FOURTH copy of it.
 */
function quoteMarkerLength(text: string, from: number): number {
  let at = from;
  while (isIndent(text.charCodeAt(at))) {
    at += 1;
  }
  if (text.charCodeAt(at) !== GREATER_THAN) {
    return 0;
  }
  at += 1;
  if (isIndent(text.charCodeAt(at))) {
    at += 1;
  }
  return at - from;
}

/**
 * ONE LIST MARKER at `from`, bullet or ordered, with the indentation in front
 * of it and the indentation after it, as a LENGTH, or 0 when there is none.
 *
 * The ordered form is MAX MUNCH capped at nine digits, which is CommonMark's
 * own limit and is exactly what `[0-9]{1,9}[.)]` accepted. A run of ten or
 * more digits therefore matches NOTHING rather than matching its first nine:
 * every shorter prefix of the run is followed by another digit, so no shorter
 * reading can find the `.` or `)` either. That equivalence is not asserted
 * here, it is measured by exhaustive enumeration (see the work history).
 */
function listMarkerLength(text: string, from: number): number {
  let at = from;
  while (isIndent(text.charCodeAt(at))) {
    at += 1;
  }
  const opener = text.charCodeAt(at);
  if (opener === HYPHEN || opener === ASTERISK || opener === PLUS) {
    at += 1;
  } else {
    let digits = 0;
    while (digits < 9) {
      const code = text.charCodeAt(at + digits);
      if (code < DIGIT_ZERO || code > DIGIT_NINE) {
        break;
      }
      digits += 1;
    }
    if (digits === 0) {
      return 0;
    }
    const delimiter = text.charCodeAt(at + digits);
    if (delimiter !== PERIOD && delimiter !== RIGHT_PAREN) {
      return 0;
    }
    at += digits + 1;
  }
  while (isIndent(text.charCodeAt(at))) {
    at += 1;
  }
  return at - from;
}

/**
 * Is `span` ENTIRELY skippable before a node's content: ANY NUMBER of
 * block-opening markers (quote, bullet or ordered), in ANY ORDER, plus
 * indentation, and NOTHING ELSE. A test of the WHOLE span and not a prefix
 * match, which is what the two anchors of the regex this replaced provided.
 *
 * THE WIDENING TO THE FULL CONTAINER GRAMMAR IS ROUND 7's CR-001 FIX, and the
 * mechanism it closes is not "the regex was incomplete". The module carried
 * THREE models of one grammar and they disagreed: this predicate allowed quote
 * markers plus AT MOST ONE list marker (its own previous comment said so in
 * those words), while the two recovery strips allow a quote marker only.
 * CommonMark lets a container prefix open ANY NUMBER of blocks on one line, in
 * any order (`- - x`, `- 1. x`, `1. - x`, `- > x`, `- - - x`), so a CORRECT
 * column whose prefix this predicate could not spell was sent down the recovery
 * path, which strips no list marker at all and returned offset 0: the raw
 * markers became part of the unit. Fail-open (a fabricated condition equal to
 * `- - x` is accepted) and fail-closed (the real unit `x` is rejected) at the
 * same time.
 *
 * TESTING THE WHOLE SPAN IS WHAT MAKES WIDENING SAFE, and this is the argument
 * the fix rests on rather than a table of examples. Acceptance means EVERY
 * character of the span is marker-or-indentation, so the span can contain no
 * content, and skipping it is right whichever line the column came from. What
 * markers may repeat does not touch that. The four column-is-lying spans this
 * guard exists to reject ("ep", "re", "alp", "sil") are still rejected, because
 * a prose fragment contains characters no branch here can consume.
 *
 * REPETITION IS UNBOUNDED ON PURPOSE. A model allowing two markers would move
 * the boundary to three and leave the same defect standing there, which is the
 * shape this project keeps paying for. A model allowing THREE is not
 * hypothetical: round 7 shipped a witness whose deepest fixture member was
 * three, so a `{0,3}` bound restored CR-001 verbatim at depth four with the
 * whole suite green (verification finding V-2). The fixture now carries a
 * five-marker member for that reason.
 *
 * ROUND 8 MADE THIS A SCAN RATHER THAN AN ANCHORED REGEX, and that is
 * verification finding V-1, a HIGH. The pattern round 7 shipped was
 *
 *   /^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)]|[-*+])[ \t]*))*[ \t]*$/
 *
 * and it BACKTRACKS EXPONENTIALLY. The leading `[ \t]*` of an iteration and the
 * trailing `[ \t]*` inside two of its three branches can consume the same run
 * of whitespace, so every gap between two markers is an ambiguity the engine
 * must try both ways, and the choices MULTIPLY. Acceptance is still fast, but
 * on a subject that ultimately FAILS the engine must exhaust the whole product
 * before it can say so, and FAILING is precisely the arm `startOffset` exists
 * to take. Measured at `986f58a`, node v26.6.0: a 119-byte two-line document
 * cost 45 ms through `quotableUnits` and each further marker DOUBLED it, so a
 * 269-byte record cost 73 seconds and the same document through the shipped
 * CLI cost 88. A gate that never returns is worse than a red gate.
 *
 * A SCAN CANNOT BACKTRACK, which is why this is a scan and not a cleverer
 * pattern. Each iteration consumes at least one character and never revisits
 * one, so the cost is linear in the span and the same for acceptance and
 * rejection. That removes the CLASS (no ambiguity can be reintroduced by a
 * later widening of the grammar) rather than the one instance of it that a
 * disambiguated pattern would remove. The language is UNCHANGED, which is
 * measured by exhaustive differential enumeration against the round-7 pattern
 * rather than argued: see `delivery/work-history/m3-p3.md`, fix round 8.
 */
function isSkippablePrefix(span: string): boolean {
  let at = 0;
  for (;;) {
    const quote = quoteMarkerLength(span, at);
    if (quote > 0) {
      at += quote;
      continue;
    }
    const list = listMarkerLength(span, at);
    if (list > 0) {
      at += list;
      continue;
    }
    while (isIndent(span.charCodeAt(at))) {
      at += 1;
    }
    return at === span.length;
  }
}

/**
 * Where a node's content starts on its FIRST line, WITH THE START COLUMN
 * VERIFIED RATHER THAN TRUSTED.
 *
 * `sourcepos[0][0]` is advanced past leading link reference definitions but
 * `sourcepos[0][1]` IS NOT, so after that advance the column describes a line
 * the node no longer starts on, and the two lines need not share a prefix. The
 * measured shape is a reference definition inside a block quote followed by a
 * LAZY continuation:
 *
 *   "> [eta]: https://example.invalid/theta\nepsilon eta.\n"
 *   paragraph [[2,3],[2,12]]; line 2 is "epsilon eta.", 12 characters long.
 *
 * Column 3 came from `"> "` on line 1. Line 2 has no marker, so slicing from
 * index 2 yields "silon eta." and the unit is CORRUPT, not merely wrong: it is
 * a truncated string that no condition can ever equal, and the same defect one
 * character further along would silently make a fragment quotable.
 *
 * FOUND BY THE DIFFERENTIAL FUZZ, and only after the empty-paragraph defect
 * above was fixed, which is why one fuzz run is not a clearance. The list form
 * ("- [a]: ...\nreal text here\n", paragraph [[2,3],[2,14]]) is a second,
 * structurally different member: a list marker rather than a quote marker.
 *
 * The test is the invariant, not the symptom: whatever the column skips on the
 * start line must BE a block prefix. When it is not, the column is describing
 * some other line and this line's own quote markers are stripped instead,
 * exactly as a continuation line's are.
 *
 * WHY THE FALLBACK IS DELIBERATELY NARROWER THAN THE VERIFIER, corrected in
 * round 7 (CR-001). Before that round the guard had TWO causes it could not
 * tell apart: (1) the column is lying, which is the hazard above, and (2) the
 * column is CORRECT and merely describes a prefix richer than the verifier
 * could spell. It took this fallback on both, and on a line opening with a LIST
 * marker `quoteDepth` is 0, so the fallback returned 0 and the slice was the
 * ENTIRE RAW LINE. Widening the verifier (`isSkippablePrefix`) to the full
 * container grammar removes cause (2) from the conflation, which is what made
 * the fallback dangerous; it is now reached only for cause (1).
 *
 * The fallback still consumes QUOTE MARKERS ONLY, bounded by `quoteDepth`, and
 * that is a choice rather than an oversight. `quoteDepth` is KNOWN STRUCTURE
 * (the walk counted the enclosing block quotes), so the strip cannot eat prose;
 * an unbounded grammar-shaped strip here would have no such bound. A cause-(1)
 * line is a paragraph CONTINUATION line, and a continuation line cannot carry a
 * list marker without ending the paragraph it continues, so there should be
 * nothing else on it to strip.
 *
 * MEASURED rather than asserted, round 7, `commonmark` 0.31.2, node v26.6.0: an
 * instrumented copy over a 6,000-document differential fuzz (seed 20260809)
 * entered this fallback 1,463 times, and in ZERO of them did the line carry a
 * leading block marker. I did not find a way to force this arm with a
 * marker-carrying line; that is a statement about my search and not a proof
 * that none exists, and the derivation is in
 * `delivery/work-history/m3-p3.md`. Because no probe I could build reddens a
 * wider strip here, widening it would be code no witness could guard, which is
 * exactly what CR-002 was raised about.
 */
function startOffset(text: string, startColumn: number, quoteDepth: number): number {
  const offset = startColumn - 1;
  if (offset <= text.length && isSkippablePrefix(text.slice(0, offset))) {
    return offset;
  }
  let consumed = 0;
  for (let level = 0; level < quoteDepth; level += 1) {
    const marker = quoteMarkerLength(text, consumed);
    if (marker === 0) {
      break;
    }
    consumed += marker;
  }
  return consumed;
}

function sourceSlice(
  lines: readonly string[],
  position: SourcePosition,
  quoteDepth: number,
): string {
  const [[startLine, startColumn], [endLine, endColumn]] = position;
  const pieces: string[] = [];
  for (let line = startLine; line <= endLine; line += 1) {
    const text = lines[line - 1] ?? "";
    const from = line === startLine ? startOffset(text, startColumn, quoteDepth) : 0;
    const to = line === endLine ? endColumn : text.length;
    let piece = text.slice(from, to);
    if (line !== startLine) {
      for (let level = 0; level < quoteDepth; level += 1) {
        piece = piece.slice(quoteMarkerLength(piece, 0));
      }
    }
    pieces.push(piece);
  }
  return pieces.join(" ");
}

/**
 * Every paragraph beneath `container`, in document order, joined into one
 * string. This is what makes a LIST ITEM'S UNIT THE WHOLE ITEM: its
 * continuation paragraphs and its nested sub-items are descendants, so they
 * join the item rather than standing alone, and its headings, fences, indented
 * code and rules contribute nothing while ending nothing. That last part is
 * what makes an interrupter inside an item not split the item; the walk simply
 * never emits for a non-`paragraph` child. `NOT_QUOTABLE` states the intent and
 * would stop a future parser handing those types block children, but under
 * `commonmark` 0.31.2 it is not what performs the exclusion (CR-003, round 7).
 *
 * Nested lists are deliberately NOT in `NOT_QUOTABLE`: the walk descends into
 * them, which is what glues a sub-item into the item that encloses it.
 */
function paragraphsBeneath(
  container: CommonMarkNode,
  lines: readonly string[],
  quoteDepth: number,
): string {
  const parts: string[] = [];
  const visit = (node: CommonMarkNode, depth: number): void => {
    for (let child = node.firstChild; child !== null; child = child.next) {
      if (child.type === "paragraph") {
        if (carriesProse(child)) {
          parts.push(sourceSlice(lines, child.sourcepos, depth));
        }
      } else if (!NOT_QUOTABLE.has(child.type)) {
        visit(child, child.type === "block_quote" ? depth + 1 : depth);
      }
    }
  };
  visit(container, quoteDepth);
  return normalizeProse(parts.join(" "));
}

/**
 * Walk one container's CHILDREN and add the units they carry.
 *
 * A paragraph is a unit. A list contributes one unit per OUTERMOST item. A
 * block quote's contents are treated exactly like the document's, which is a
 * DECLARED POLICY CHOICE and not a derivation: "nothing inside a block quote is
 * quotable" is equally defensible, and both are defensible where the behaviour
 * this replaces was neither, because it admitted the marker-carrying string
 * `> A quoted sentence` while rejecting the same sentence without its marker.
 * Flipping the policy is this one branch.
 */
function collectUnits(
  node: CommonMarkNode,
  lines: readonly string[],
  units: Set<string>,
  quoteDepth: number,
): void {
  for (let child = node.firstChild; child !== null; child = child.next) {
    if (child.type === "paragraph") {
      const unit = carriesProse(child)
        ? normalizeProse(sourceSlice(lines, child.sourcepos, quoteDepth))
        : "";
      if (unit !== "") {
        units.add(unit);
      }
    } else if (child.type === "list") {
      for (let item = child.firstChild; item !== null; item = item.next) {
        const unit = paragraphsBeneath(item, lines, quoteDepth);
        if (unit !== "") {
          units.add(unit);
        }
      }
    } else if (child.type === "block_quote") {
      collectUnits(child, lines, units, quoteDepth + 1);
    } else if (!NOT_QUOTABLE.has(child.type)) {
      collectUnits(child, lines, units, quoteDepth);
    }
  }
}

/**
 * The QUOTABLE UNITS of a prose record: every top-level PARAGRAPH and every
 * OUTERMOST LIST ITEM, each with its marker stripped and its whitespace
 * normalized.
 *
 * WHY THIS EXISTS, and it is the whole of fix round 2. The first version of
 * this check asked whether each condition OCCURRED ANYWHERE in the record, as
 * one normalized blob. That is a CONTAINMENT predicate standing in for an
 * EQUALITY predicate, and containment is trivially satisfiable by short
 * strings: `conditions: ["a", "the", "review", "merge", "is", "of"]` replaced
 * every one of DR-0012's six merge-authority conditions with junk and the
 * check exited 0. Every one of those words occurs in the record.
 *
 * The signal was already in this phase's own evidence and was read past: an
 * earlier probe fabricated `"one"` through `"six"` and got findings for
 * indices 3, 4 and 5 ONLY, because "one", "two" and "three" occur inside the
 * record's prose. Three of six caught looked like the check working.
 *
 * Comparing against UNITS rather than against the blob makes the predicate an
 * equality: a condition matches only if it is a WHOLE quoted item of the
 * record. Both halves matter. Whole, so a fragment cannot match; item rather
 * than whole document, so a record may carry other prose around the conditions
 * without anyone having to say which section holds them, which is the
 * structure assumption that would have made this check project-specific.
 *
 * THE COST, stated because it is a real constraint on a consuming project: a
 * condition must be quoted as a complete list item or paragraph of the record.
 * A condition that paraphrases, or that quotes half of a longer item, is now
 * a violation. That is what "quoted from the decision record rather than
 * summarized" already claimed to mean, and it is now enforced rather than
 * asserted.
 *
 * A LIST ITEM'S UNIT IS THE WHOLE ITEM. An item's continuation paragraphs and
 * its nested sub-items are CONTENT OF THE ITEM in CommonMark, so emitting them
 * as units of their own would leave the item's FIRST PARAGRAPH standing as a
 * whole unit while the item itself carried more, which is a fragment passing as
 * a whole quote: the defect this check exists to prevent, arriving through the
 * extractor. It is live in this repository:
 * `delivery/decisions/DR-0004-elevated-permissions.md` has the shape (an item,
 * a blank, then its commands indented under it) and
 * `delivery/decisions/DR-0013-schema-validator-implementation.md` has the
 * nested-list form. THE COST, stated because it is real: a nested sub-item is
 * not separately quotable, so a record whose conditions are sub-bullets must
 * quote the enclosing item whole.
 *
 * ------------------------------------------------------------------
 * THE BLOCK STRUCTURE IS READ FROM A COMMONMARK PARSER (DR-0022, owner
 * decision, option A2). THE TEXT IS SLICED FROM THE ORIGINAL SOURCE.
 * ------------------------------------------------------------------
 *
 * What stood here until 2026-08-09 was a HAND-ROLLED CommonMark block parser:
 * a line loop carrying fence state, indented-code state, a list content column
 * and a deferred-blank flag, with six sites that could end a unit. It took FIVE
 * fix rounds and produced FIVE defects, the fifth a regression of a shape the
 * fourth had correct. The owner's decision records the measurement that ended
 * it: against two independent conformant parsers over 15,000 generated
 * documents, the hand-rolled loop agreed on about 35 per cent of them.
 *
 * The reason the rounds could not converge is worth keeping, because it is a
 * property of the problem and not of the agents. Whether a line is prose
 * depends on which block encloses it, and which block encloses it depends on
 * lines above and sometimes below (a setext underline retroactively makes the
 * block above it a heading). A loop that decides one line at a time is
 * reconstructing a parser, and every reconstruction has to be kept in agreement
 * with the reference BY HAND, with no mechanism that detects divergence. That
 * is the "guard narrower than the property" family, and this repository has now
 * recorded it five times in this one function.
 *
 * TWO OF THE ELEVEN FINDINGS ACROSS THOSE ROUNDS WERE NOT DEFECTS AT ALL. V-3
 * ("adjacent paragraphs merge") and the fifth member of V-5 (a nested sub-item
 * followed by a dedented line) were both cases where a hand-reading of markdown
 * disagreed with CommonMark and the HAND-READING WAS WRONG: lazy continuation
 * makes both fusions correct. A round can only find defects it already believes
 * in, which is the other half of the cost.
 *
 * WHY `sourcepos` SLICING AND NOT THE PARSER'S INLINE TEXT, which is the whole
 * of A2 versus A and is the single most expensive detail here. Walking the AST
 * and reading each paragraph's inline text is the obvious implementation and it
 * SILENTLY CHANGES THE SHIPPED CONTRACT, because inline text drops markup:
 * `` `delivery/review/` `` becomes `delivery/review/`. DR-0012's first
 * merge-authority condition contains exactly that, so `assurance-modes.yaml`
 * stops resolving, and 11 of this repository's 19 decision records produce
 * different unit sets. Slicing the ORIGINAL SOURCE by the parser's own
 * `sourcepos` offsets keeps the bytes as written, which is what every existing
 * record and every existing condition relies on.
 *
 * SO: this function reads the parser for STRUCTURE ONLY. It never reads
 * `literal` and never concatenates inline nodes, and a change that starts doing
 * either is option A, which is a defect. `CommonMarkNode` above declares six
 * members and none of them is inline text, so the type is the guard.
 *
 * WHAT THE FOUR PREVIOUSLY UNMODELLED BLOCK FORMS DO NOW, since the old
 * docstring listed them as latent hazards:
 *   - block quote: its contents are treated like the document's, so the quoted
 *     paragraph is a unit and the `>` marker is NOT part of it. This is a
 *     DECLARED POLICY CHOICE (see `collectUnits`), not a derivation.
 *   - HTML block: contributes no unit. Corrected in round 7 (CR-003): it is
 *     listed in `NOT_QUOTABLE`, but under `commonmark` 0.31.2 that listing is
 *     not what excludes it. An `html_block` is an AST LEAF, and a unit is only
 *     ever emitted for a `paragraph` child, so it could contribute nothing even
 *     if the set were empty. Read `NOT_QUOTABLE`'s own docstring for what the
 *     set is really for.
 *   - link reference definition: excluded, and by construction rather than by a
 *     rule, because the parser removes it before this walk sees the document.
 *   - pipe table: never was a hazard. CommonMark core has no tables, so a table
 *     IS a paragraph and treating its lines as prose is correct.
 *
 * WHERE THIS IS STILL NOT AN ORACLE: it is right in the sense of "agrees with
 * `commonmark` 0.31.2". Two conformant CommonMark implementations disagree on
 * roughly half a per cent of generated documents (an indented line immediately
 * after a link reference definition is the measured instance), and any
 * structure-reading option inherits that.
 */
export function quotableUnits(text: string): Set<string> {
  /* SPLIT ON THE SAME LINE ENDINGS THE PARSER DOES. `sourcepos` line numbers
     index the parser's own line array, so splitting on "\n" alone would put
     every slice on the wrong line in a document using lone CR. */
  const lines = text.split(/\r\n|\n|\r/);
  const { Parser } = commonMarkModule();
  const units = new Set<string>();
  collectUnits(new Parser().parse(text), lines, units, 0);
  return units;
}

export const modeConditionsQuoteGrantedBy: DerivedCheck = {
  id: "mode-conditions-quote-granted-by",
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
    const violations: Diagnostic[] = [];
    const cache = new Map<
      string,
      { ok: true; units: Set<string> } | { ok: false; reason: string }
    >();

    const resolveRecord = (
      record: string,
    ): { ok: true; units: Set<string> } | { ok: false; reason: string } => {
      const cached = cache.get(record);
      if (cached !== undefined) {
        return cached;
      }
      const matches: string[] = [];
      const searched: string[] = [];
      for (const directory of DECISION_DIRECTORIES) {
        const path = join(contextDirectory, directory);
        searched.push(directory);
        let entries: string[];
        try {
          entries = readdirSync(path);
        } catch {
          continue;
        }
        for (const name of entries.sort()) {
          if (name === `${record}.md` || name.startsWith(`${record}-`)) {
            matches.push(join(path, name));
          }
        }
      }
      let outcome: { ok: true; units: Set<string> } | { ok: false; reason: string };
      if (matches.length === 0) {
        outcome = {
          ok: false,
          reason: `no decision record ${record} was found under ${searched.join(" or ")} of the context, so the grant it names cannot be checked`,
        };
      } else if (matches.length > 1) {
        outcome = {
          ok: false,
          reason: `${String(matches.length)} files match decision record ${record} (${matches.join(", ")}), so the grant it names resolves ambiguously`,
        };
      } else {
        const read = readOperatorPath(matches[0] as string);
        outcome = read.ok
          ? { ok: true, units: quotableUnits(read.body) }
          : { ok: false, reason: read.reason };
      }
      cache.set(record, outcome);
      return outcome;
    };

    for (const row of eachMode(instance)) {
      const conditions = stringsAt(row.mode, "conditions");
      if (conditions.length === 0) {
        continue;
      }
      const grantedBy = row.mode["granted-by"];
      if (typeof grantedBy !== "string") {
        violations.push({
          pointer: `#/modes/${String(row.index)}/conditions`,
          message: `mode ${row.id} declares ${String(conditions.length)} condition(s) and names no granted-by record, so nothing can be compared against them`,
        });
        continue;
      }
      const resolved = resolveRecord(grantedBy);
      if (!resolved.ok) {
        violations.push({
          pointer: `#/modes/${String(row.index)}/granted-by`,
          message: resolved.reason,
        });
        continue;
      }
      for (let position = 0; position < conditions.length; position += 1) {
        /* EQUALITY AGAINST A WHOLE UNIT, never containment in the blob. An
           EMPTY condition is a violation here rather than a skip: the schema
           already forbids it, and a check that quietly accepted one would be
           accepting the shortest fabrication of all. */
        const condition = normalizeProse(conditions[position] as string);
        if (!resolved.units.has(condition)) {
          const opening = condition.length > 60 ? `${condition.slice(0, 60)}...` : condition;
          violations.push({
            pointer: `#/modes/${String(row.index)}/conditions/${String(position)}`,
            message: `mode ${row.id} cites ${grantedBy} for a condition that is not a whole quoted item of that record: "${opening}"`,
          });
        }
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* report-parity-arithmetic (M3-P4, R-048, R-049, R-086)                */
/* ------------------------------------------------------------------ */

/**
 * The FIVE buckets whose sum must equal `discovered`.
 *
 * `todo` is the sixth count and was added by M3-P4 fix round 2, on the
 * orchestrator's arbitration of round 1 rather than on an implementer's
 * initiative. The M2-P3 wrapper's own identity is
 * `pass + fail + skipped + todo + did-not-run == reported`
 * (src/gates/suite.ts:350), and the plan's field list named five counts, so a
 * run reporting `todo > 0` could not be recorded at all without breaking
 * parity. A contract that REFUSES A LEGITIMATE RUN is worse than a missing
 * field, which is why the arbitration amended the plan rather than leaving
 * the gap disclosed.
 */
const PARITY_BUCKETS = ["passed", "failed", "skipped", "todo", "did-not-run"] as const;

/** Every count field a gate result may carry, `discovered` first. */
const COUNT_FIELDS = ["discovered", ...PARITY_BUCKETS] as const;

/**
 * WHERE THE SHARED `gateResult` DEFINITION IS REACHED FROM, one row per
 * artifact type, naming the KEY that type stores its gate results under.
 *
 * This table is the concrete form of CR-001's mechanism. The definition is
 * one object reached by `$ref` from two documents; the PROPERTY NAME differs
 * between them (`gate-results` in a report, `gate-evidence` in a work
 * history), so a check that hard-codes one key is blind on the other type
 * even after it is registered for it. Both halves are needed and only one of
 * them is visible from the `$ref`.
 */
export const GATE_RESULT_SITES: readonly { readonly type: string; readonly key: string }[] =
  [
    { type: "report", key: "gate-results" },
    { type: "work-history", key: "gate-evidence" },
  ];

/**
 * `discovered == passed + failed + skipped + did-not-run`, over one gate
 * result's sibling fields.
 *
 * NO SCHEMA KEYWORD COMPUTES ARITHMETIC over sibling fields, which is what
 * makes this Kind B rather than a keyword (M3R-002 corrected revision 0's
 * classification of exactly this check). The property it guards is R-048's:
 * a suite that reports fewer tests than it discovered is the
 * silently-dropped-tests case, and it adds up to a green everywhere else.
 *
 * THREE THINGS THIS CHECKS, and the second and third are the CONVERSES the
 * criterion's letter does not name. The plan's criterion 2b(a) names only
 * `discovered` EXCEEDING the sum. A check that tested only that direction
 * would pass a record whose sum exceeds `discovered`, which is a different
 * lie with the same shape, so the test here is EQUALITY. And a count field
 * that is NEGATIVE is arithmetic nonsense that equality alone can satisfy
 * (`discovered: 0` with `passed: 1` and `failed: -1` adds up); negativity is
 * not reachable by any keyword in the declared authoring vocabulary, which
 * has no `minimum`, so it is checked here beside the sum rather than left to
 * a keyword that does not exist.
 *
 * WHAT IT DOES NOT REACH, stated rather than implied: a gate result carrying
 * NO count field at all is not examined, because the schema requires the six
 * counts only of a `green`, and a `red` result that records none of them is a
 * legitimate record rather than a false one. So this check cannot see a
 * dropped test in a run nobody counted; it sees one in a run that claims a
 * count. Nor does it reach a BALANCED loss: an author who drops the same row
 * from `discovered` and from a bucket satisfies the identity, because nothing
 * here anchors `discovered` to what the wrapper actually discovered.
 *
 * WHERE IT RUNS, and this is CR-001's whole content. It runs on EVERY type
 * that reaches the shared `gateResult` definition, enumerated by
 * `GATE_RESULT_SITES` rather than by one hard-coded key. Until M3-P4 fix
 * round 2 it was registered for `report` alone and read `gate-results` alone,
 * so a work history recording 9999 discovered and 1 passed exited 0 while the
 * identical counts in a report exited 1, and the shared definition's own
 * comment said the check applied.
 */
export const reportParityArithmetic: DerivedCheck = {
  id: "report-parity-arithmetic",
  type: "report",
  alsoTypes: ["work-history"],
  guards: ["report.schema.json#/$defs/gateResult"],
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const record = asRecord(instance);
    if (record === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    /* EVERY site key, not the one belonging to the type this run was
       dispatched for. A document carries exactly one of these keys
       (`additionalProperties: false` at the top level of both schemas), so
       the loop visits one array in practice and cannot be defeated by a
       caller that passes the wrong type name. */
    for (const site of GATE_RESULT_SITES) {
      const results = asArray(record[site.key]);
      results.forEach((entry, index) => {
        const result = asRecord(entry);
        if (result === undefined) {
          return;
        }
        const present = COUNT_FIELDS.filter((field) => result[field] !== undefined);
        if (present.length === 0) {
          return;
        }
        const pointer = `#/${site.key}/${String(index)}`;
        const missing = COUNT_FIELDS.filter((field) => result[field] === undefined);
        if (missing.length > 0) {
          violations.push({
            pointer,
            message: `gate result records ${String(present.length)} of the ${String(COUNT_FIELDS.length)} counts and omits ${missing.join(", ")}, so parity cannot be computed`,
          });
          return;
        }
        const values = new Map<string, number>();
        for (const field of COUNT_FIELDS) {
          const value = result[field];
          if (typeof value !== "number" || !Number.isInteger(value)) {
            /* The schema already rejects a non-integer here; this is the
               belt that stops the arithmetic below producing NaN if this
               check is ever run on an instance that skipped validation. */
            return;
          }
          values.set(field, value);
        }
        const negative = COUNT_FIELDS.filter((field) => (values.get(field) as number) < 0);
        if (negative.length > 0) {
          violations.push({
            pointer,
            message: `count(s) ${negative.join(", ")} are negative, which no run can produce`,
          });
          return;
        }
        const sum = PARITY_BUCKETS.reduce(
          (total, field) => total + (values.get(field) as number),
          0,
        );
        const discovered = values.get("discovered") as number;
        if (discovered !== sum) {
          violations.push({
            pointer,
            message: `discovered ${String(discovered)} does not equal ${PARITY_BUCKETS.join(" + ")} = ${String(sum)}`,
          });
        }
      });
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* final-report-finding-parity (M3-P4, R-089a)                          */
/* ------------------------------------------------------------------ */

/**
 * Every id in `inputs[]` appears in `input-findings[]`, exactly once, and no
 * `input-findings[]` row names an id `inputs[]` does not carry.
 *
 * A CROSS-ARRAY COMPLETENESS PROPERTY, which no keyword reaches: `contains`
 * asks about a fixed shape, not about a value computed from a sibling array.
 * Revision 0 of the plan listed this once as a schema witness, which was
 * wrong (M3R-002).
 *
 * THREE DIRECTIONS, and only the first is in the criterion's letter. The
 * criterion names the ORPHAN: an id in `inputs[]` with no row. The PHANTOM
 * (a row whose id is not an input) and the DUPLICATE (two rows for one id)
 * are the converses, and they are here because M2-P6 paid for both by
 * measurement rather than by argument: CR-988 records that its parity mode
 * scanned inventory ids only, so a row for a renumbered id was silently
 * accepted, and CR-985 records that a duplicated id defeated the orphan and
 * phantom checks TOGETHER while inflating every count. A guard narrower than
 * its own description is what this project keeps re-buying, so the check is
 * as wide as the relation.
 *
 * WHAT IT DOES NOT REACH: a finding dropped from BOTH arrays. The two
 * documents then agree with each other, and no comparison between them can
 * see it. That is the same residue `src/gates/coverage.ts` answers with a
 * config-stated `expectedUnits` anchor, and this schema has no such anchor
 * because nothing in the plan states one.
 */
export const finalReportFindingParity: DerivedCheck = {
  id: "final-report-finding-parity",
  type: "final-report",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const record = asRecord(instance);
    if (record === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const inputs = asArray(record["inputs"]).filter(
      (value): value is string => typeof value === "string",
    );
    const rows = asArray(record["input-findings"]);
    const rowIds: string[] = [];
    for (const row of rows) {
      const entry = asRecord(row);
      const id = entry?.["id"];
      rowIds.push(typeof id === "string" ? id : "");
    }
    const counts = new Map<string, number>();
    for (const id of rowIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    inputs.forEach((id, index) => {
      const seen = counts.get(id) ?? 0;
      if (seen === 0) {
        violations.push({
          pointer: `#/inputs/${String(index)}`,
          message: `finding ${id} has no row in input-findings, so the table has a hole`,
        });
        return;
      }
      if (seen > 1) {
        violations.push({
          pointer: `#/inputs/${String(index)}`,
          message: `finding ${id} has ${String(seen)} rows in input-findings and must have exactly one`,
        });
      }
    });
    const inputSet = new Set(inputs);
    rowIds.forEach((id, index) => {
      if (!inputSet.has(id)) {
        violations.push({
          pointer: `#/input-findings/${String(index)}`,
          message: `input-findings names ${id === "" ? "an id-less row" : id}, which is not in inputs, so the coverage is phantom`,
        });
      }
    });
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* report-no-findings-statement (M3-P4 fix round 2, hazard 1)           */
/* ------------------------------------------------------------------ */

/**
 * A report with an EMPTY `findings` array carries a `no-findings-statement`,
 * and a report that files findings does NOT carry one.
 *
 * KIND B BY NECESSITY, AND THE NECESSITY IS MEASURED RATHER THAN ASSERTED.
 * The natural keyword shape is `if findings has maxItems 0 then require
 * no-findings-statement`, and `maxItems` is ABSENT from the sixteen keywords
 * of `AUTHORING_VOCABULARY` (src/validate.ts:111). No other permitted keyword
 * says "this array is empty": `minItems` says the opposite, `contains` asks
 * about a member that exists, and `const: []` is not reachable because `const`
 * is used on scalars here and an array `const` would pin the CONTENTS. So the
 * emptiness of a sibling array is not a keyword property, which is the same
 * boundary `report-parity-arithmetic` sits on one field over.
 *
 * WHY IT IS HERE AT ALL. `no-findings-statement` exists to price silence: a
 * report claiming nothing was found must say WHY nothing was found. Optional,
 * it is absent in exactly the situation it exists for, and the shipped schema
 * disclosed that as a residue rather than closing it. The orchestrator's
 * arbitration of M3-P4 round 1 amended section 2.3's table to three rows for
 * this phase and directed the check to be written; D-M3-22 is satisfied by
 * that amendment, not by this comment.
 *
 * BOTH DIRECTIONS, because the phase's own converse discipline demands it.
 * The requirement's letter names only the empty-with-no-statement case. A
 * report that files three findings and ALSO carries "no findings were found"
 * is the opposite misdeclaration and is equally a false record, so it is a
 * violation too.
 *
 * WHAT IT DOES NOT REACH: whether the statement SAYS anything. The schema
 * makes an empty or whitespace-only one impossible; a statement reading "n/a"
 * satisfies both this check and those keywords, and that is M3-P7's
 * `contract-avoidance` probe rather than anything a schema or a check can see.
 * It also does not reach a report with NO `findings` key at all, because
 * `findings` is `required` and the schema rejects that before any check runs.
 */
export const reportNoFindingsStatement: DerivedCheck = {
  id: "report-no-findings-statement",
  type: "report",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const record = asRecord(instance);
    if (record === undefined || !Array.isArray(record["findings"])) {
      return EMPTY;
    }
    const empty = (record["findings"] as unknown[]).length === 0;
    const stated = record["no-findings-statement"] !== undefined;
    if (empty && !stated) {
      return {
        violations: [
          {
            pointer: "#/no-findings-statement",
            message:
              "findings is empty and no-findings-statement is missing, so the report claims nothing was found without saying why",
          },
        ],
        reports: [],
      };
    }
    if (!empty && stated) {
      return {
        violations: [
          {
            pointer: "#/no-findings-statement",
            message: `no-findings-statement is present beside ${String((record["findings"] as unknown[]).length)} finding(s), so the report contradicts itself`,
          },
        ],
        reports: [],
      };
    }
    return EMPTY;
  },
};

/* ------------------------------------------------------------------ */
/* checklist-probe-ids-unique (M3-P7 step 6b, criterion 1)              */
/* ------------------------------------------------------------------ */

/**
 * No two probes in one checklist share an `id`.
 *
 * KIND B, AND THE REASON IS A KEYWORD'S SEMANTICS RATHER THAN A DOCUMENT
 * BOUNDARY. `uniqueItems` compares WHOLE array items, so two probes sharing
 * an id and differing in any other field are already unique to it, and the
 * pair that shares an id is exactly the dangerous instance: `checklist
 * resolve` looks a probe up by id, so a duplicate makes the resolved list
 * depend on which one the lookup reached. Uniqueness of a NESTED PROPERTY
 * across array items is not a keyword property under any DR-0013 option,
 * which is why the review did not name it and why it lands here.
 *
 * `requiresContext` is FALSE: the whole comparison is inside one document.
 */
export const checklistProbeIdsUnique: DerivedCheck = {
  id: "checklist-probe-ids-unique",
  type: "checklist",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const probes = asArray(asRecord(instance)?.["probes"]);
    const firstIndexById = new Map<string, number>();
    const violations: Diagnostic[] = [];
    for (let index = 0; index < probes.length; index += 1) {
      const id = asRecord(probes[index])?.["id"];
      if (typeof id !== "string") {
        continue;
      }
      const first = firstIndexById.get(id);
      if (first === undefined) {
        firstIndexById.set(id, index);
        continue;
      }
      /* NAMES BOTH POSITIONS. An author told only that an id is duplicated
         has to find the other one; the two pointers are what make the
         message a diagnosis. */
      violations.push({
        pointer: `#/probes/${String(index)}/id`,
        message: `probe id ${id} is already declared at #/probes/${String(first)}/id, and checklist resolve looks probes up by id`,
      });
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* checklist-framing-ids-unique (M3-P7 fix round 2, H-2 member 1)       */
/* ------------------------------------------------------------------ */

/**
 * No two framings in one checklist share an `id`.
 *
 * THE SAME SHAPE AND THE SAME KEYWORD LIMITATION AS THE PROBE CHECK ABOVE,
 * one array along. `uniqueItems` on `framings` compares WHOLE items, so two
 * framings sharing an id and differing in their entry point or their scope
 * order are already unique to it, and that pair is exactly the dangerous
 * instance: `resolveChecklist` looks a framing up with `.find()`, first match
 * wins, so which of two declared entry points a reviewer is handed depends on
 * FILE POSITION and nothing says so.
 *
 * WHY IT MATTERS MORE HERE THAN THE PROBE CASE LOOKS LIKE IT WOULD. A
 * framing IS the entry point, and T-001's lesson that decorrelation comes
 * from the starting question is the whole reason `--framing` exists. A
 * duplicate id means the reviewer's starting question is decided by which
 * copy sat first in the file, which is the phase's own hazard class ("a
 * framing that reorders the list without changing the entry point") reached
 * from the other side.
 *
 * `requiresContext` is FALSE: the whole comparison is inside one document.
 */
export const checklistFramingIdsUnique: DerivedCheck = {
  id: "checklist-framing-ids-unique",
  type: "checklist",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const framings = asArray(asRecord(instance)?.["framings"]);
    const firstIndexById = new Map<string, number>();
    const violations: Diagnostic[] = [];
    for (let index = 0; index < framings.length; index += 1) {
      const id = asRecord(framings[index])?.["id"];
      if (typeof id !== "string") {
        continue;
      }
      const first = firstIndexById.get(id);
      if (first === undefined) {
        firstIndexById.set(id, index);
        continue;
      }
      /* NAMES BOTH POSITIONS, for the reason the probe check records. */
      violations.push({
        pointer: `#/framings/${String(index)}/id`,
        message: `framing id ${id} is already declared at #/framings/${String(first)}/id, and checklist resolve looks framings up by id`,
      });
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* gate-probes-resolve (M3-P7 step 6b, criteria 3 and 3c)               */
/* ------------------------------------------------------------------ */

/**
 * The join M3-P2 deliberately left open, closed in BOTH DIRECTIONS.
 *
 * `gate-registry.yaml` carries entries whose `verified-by` is
 * `clean-room-checklist` and whose `probe` names a probe id this phase
 * supplies. Nothing on the registry side can check that the probe exists,
 * because the checklist did not exist when the registry shipped.
 *
 * DIRECTION 1, REGISTRY TO CHECKLIST (criterion 3). Every registry entry
 * verified by a checklist names a probe that RESOLVES in that checklist, and
 * that probe carries the `verifies-gate` back-reference to the entry. WHICH
 * checklist is derived from the registry's own vocabulary rather than
 * hardcoded: `verified-by: clean-room-checklist` names the checklist whose id
 * is `clean-room`, so an entry is only asserted against the document it
 * actually names, and running this check on `plan-review.yaml` does not
 * demand the clean-room probes there.
 *
 * DIRECTION 2, CHECKLIST TO REGISTRY (criterion 3c). Every probe carrying
 * `verifies-gate` names a gate id present in the registry. THE ASYMMETRY IS
 * THE WHOLE POINT: direction 1 starts from the registry and therefore cannot
 * see a probe pointing at a gate that no longer exists, which is what the
 * phase's own hazard class calls an orphan invisible by construction. The two
 * ways a registry edit orphans a probe fail through DIFFERENT lookups: a gate
 * id RENAMED leaves the probe pointing at a name that never existed, and a
 * gate entry DELETED leaves it pointing at a name that used to. Both land
 * here; neither is reachable from direction 1.
 *
 * `requiresContext` is TRUE, so invoking the validator without `--context`
 * prints `SKIPPED gate-probes-resolve no context` and exits nonzero. A
 * cross-document rule must never be able to pass BY NOT RUNNING.
 */
export const gateProbesResolve: DerivedCheck = {
  id: "gate-probes-resolve",
  type: "checklist",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Kept fail-closed
         rather than trusting a caller that reaches the check directly. */
      return {
        violations: [
          { pointer: "#/probes", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const registryDocument = readContextDocument(contextDirectory, "gate-registry.yaml");
    if (!registryDocument.ok) {
      return {
        violations: [
          {
            pointer: "#/probes",
            message: `the gate registry could not be read, so no probe reference could be resolved in either direction: ${registryDocument.reason}`,
          },
        ],
        reports: [],
      };
    }
    const document = asRecord(instance);
    const checklistId = typeof document?.["id"] === "string" ? document["id"] : "";
    const probes = asArray(document?.["probes"]);
    const probeIndexById = new Map<string, number>();
    const verifiesGateByProbe = new Map<string, string>();
    for (let index = 0; index < probes.length; index += 1) {
      const probe = asRecord(probes[index]);
      const id = probe?.["id"];
      if (typeof id !== "string") {
        continue;
      }
      if (!probeIndexById.has(id)) {
        probeIndexById.set(id, index);
      }
      if (typeof probe?.["verifies-gate"] === "string") {
        verifiesGateByProbe.set(id, probe["verifies-gate"]);
      }
    }

    const gateIds = new Set<string>();
    const registryEntries: { id: string; probe: string; checklist: string }[] = [];
    for (const gate of asArray(asRecord(registryDocument.value)?.["gates"])) {
      const record = asRecord(gate);
      const id = record?.["id"];
      if (record === undefined || typeof id !== "string") {
        continue;
      }
      gateIds.add(id);
      const verifiedBy = record["verified-by"];
      const probe = record["probe"];
      if (
        typeof verifiedBy === "string" &&
        verifiedBy.endsWith("-checklist") &&
        typeof probe === "string"
      ) {
        registryEntries.push({
          id,
          probe,
          checklist: verifiedBy.slice(0, -"-checklist".length),
        });
      }
    }

    const violations: Diagnostic[] = [];
    /* DIRECTION 1. */
    for (const entry of registryEntries) {
      if (entry.checklist !== checklistId) {
        continue;
      }
      const index = probeIndexById.get(entry.probe);
      if (index === undefined) {
        violations.push({
          pointer: "#/probes",
          message: `gate ${entry.id} in ${registryDocument.path} names probe ${entry.probe}, which no probe in this checklist declares`,
        });
        continue;
      }
      const backReference = verifiesGateByProbe.get(entry.probe);
      if (backReference !== entry.id) {
        violations.push({
          pointer: `#/probes/${String(index)}/verifies-gate`,
          message:
            backReference === undefined
              ? `probe ${entry.probe} is named by gate ${entry.id} in ${registryDocument.path} and carries no verifies-gate, so the checklist-to-registry direction cannot see it`
              : `probe ${entry.probe} is named by gate ${entry.id} in ${registryDocument.path} and its verifies-gate says ${backReference}`,
        });
      }
    }
    /* DIRECTION 2. */
    for (const [probeId, gateId] of verifiesGateByProbe) {
      if (gateIds.has(gateId)) {
        continue;
      }
      const index = probeIndexById.get(probeId) ?? 0;
      violations.push({
        pointer: `#/probes/${String(index)}/verifies-gate`,
        message: `probe ${probeId} verifies gate ${gateId}, which ${registryDocument.path} does not declare`,
      });
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* The verdict's three cross-document completeness checks               */
/* ------------------------------------------------------------------ */

/**
 * Read the plan phase a verdict names, or say why not.
 *
 * THE JOIN KEY IS THE VERDICT'S `phase`, and the plan is read from a FIXED
 * relative path in the context directory, which is the shape
 * `mode-gate-sets-resolve` already uses for `gate-registry.yaml`. Fail closed
 * at every step: an unreadable plan, a plan declaring no such phase and a
 * plan whose phases are not a list are all violations, never silent passes,
 * because a completeness rule that cannot find its other document has not
 * been satisfied, it has not run.
 */
function readVerdictPlanPhase(
  instance: unknown,
  contextDirectory: string,
  pointer: string,
):
  | { ok: true; phase: Record<string, unknown>; path: string }
  | { ok: false; violation: Diagnostic } {
  const verdict = asRecord(instance);
  const phaseId = verdict?.["phase"];
  if (typeof phaseId !== "string") {
    return {
      ok: false,
      violation: {
        pointer: "#/phase",
        message: "the verdict names no phase, so no plan phase can be resolved",
      },
    };
  }
  const planDocument = readContextDocument(contextDirectory, "plan.yaml");
  if (!planDocument.ok) {
    return {
      ok: false,
      violation: {
        pointer,
        message: `the plan could not be read, so completeness against phase ${phaseId} could not be checked: ${planDocument.reason}`,
      },
    };
  }
  for (const candidate of asArray(asRecord(planDocument.value)?.["phases"])) {
    const record = asRecord(candidate);
    if (record?.["id"] === phaseId) {
      return { ok: true, phase: record, path: planDocument.path };
    }
  }
  return {
    ok: false,
    violation: {
      pointer: "#/phase",
      message: `${planDocument.path} declares no phase ${phaseId}, so this verdict reviews a phase the plan does not have`,
    },
  };
}

/** The `id` of every element of one array-of-objects field, in order. */
function idsOf(record: Record<string, unknown> | undefined, key: string, idKey: string): string[] {
  const ids: string[] = [];
  for (const entry of asArray(record?.[key])) {
    const value = asRecord(entry)?.[idKey];
    if (typeof value === "string") {
      ids.push(value);
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* verdict-criteria-complete (M3-P7 step 6b, criterion 4b(a))           */
/* ------------------------------------------------------------------ */

/**
 * A verdict's `criteria[]` carries one entry per acceptance criterion of the
 * plan phase it reviews.
 *
 * THE DANGEROUS INSTANCE is a review that quietly skipped a criterion: every
 * entry present is well formed, the schema is satisfied, and the one
 * criterion nobody walked is invisible. R-053 says each criterion is quoted
 * with evidence and a verdict, and "each" is a comparison against a DIFFERENT
 * document, which no keyword reaches.
 *
 * BOTH DIRECTIONS, because they are different mistakes. A criterion the
 * verdict omits is an unwalked criterion; a verdict entry naming a criterion
 * the phase does not declare is a review walking something that is not in the
 * contract, usually a criterion id left behind by a plan revision.
 */
export const verdictCriteriaComplete: DerivedCheck = {
  id: "verdict-criteria-complete",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      return {
        violations: [
          { pointer: "#/criteria", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const resolved = readVerdictPlanPhase(instance, contextDirectory, "#/criteria");
    if (!resolved.ok) {
      return { violations: [resolved.violation], reports: [] };
    }
    const declared = idsOf(resolved.phase, "acceptance", "id");
    const walked = new Set(idsOf(asRecord(instance), "criteria", "id"));
    const violations: Diagnostic[] = [];
    for (const id of declared) {
      if (!walked.has(id)) {
        violations.push({
          pointer: "#/criteria",
          message: `acceptance criterion ${id} of phase ${String(asRecord(instance)?.["phase"])} in ${resolved.path} has no entry, so this review did not walk it`,
        });
      }
    }
    const declaredSet = new Set(declared);
    const walkedIds = idsOf(asRecord(instance), "criteria", "id");
    for (let index = 0; index < walkedIds.length; index += 1) {
      const id = walkedIds[index] as string;
      if (!declaredSet.has(id)) {
        violations.push({
          pointer: `#/criteria/${String(index)}/id`,
          message: `criterion ${id} is walked here and ${resolved.path} declares no such acceptance criterion on this phase`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* verdict-deviations-judged (M3-P7 step 6b, criterion 4b(b), M3R-005)  */
/* ------------------------------------------------------------------ */

/**
 * A verdict's `deviations-judged[]` carries one entry per deviation declared
 * in the phase's work history.
 *
 * M3R-005 IS WHY THIS IS A CHECK AND NOT A PROBE. R-057b's "judged, never
 * assumed by the implementer" has exactly the same completeness shape as
 * criteria coverage, and revision 0 had left it as a bare probe question for
 * no stated reason, so a reviewer could silently skip judging one of three
 * declared deviations and every criterion still passed.
 *
 * THE OTHER DOCUMENT IS `work-history.yaml` in the context directory, and it
 * must be the work history OF THE PHASE THIS VERDICT NAMES: a work history
 * for another phase would let the check pass by comparing against the wrong
 * deviation list, which is a vacuous pass wearing a cross-document check's
 * clothes.
 */
export const verdictDeviationsJudged: DerivedCheck = {
  id: "verdict-deviations-judged",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      return {
        violations: [
          { pointer: "#/deviations-judged", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const verdict = asRecord(instance);
    const phaseId = verdict?.["phase"];
    if (typeof phaseId !== "string") {
      return {
        violations: [
          {
            pointer: "#/phase",
            message: "the verdict names no phase, so no work history can be resolved",
          },
        ],
        reports: [],
      };
    }
    const history = readContextDocument(contextDirectory, "work-history.yaml");
    if (!history.ok) {
      return {
        violations: [
          {
            pointer: "#/deviations-judged",
            message: `the work history could not be read, so the declared deviations could not be compared: ${history.reason}`,
          },
        ],
        reports: [],
      };
    }
    const historyRecord = asRecord(history.value);
    if (historyRecord?.["phase"] !== phaseId) {
      return {
        violations: [
          {
            pointer: "#/deviations-judged",
            message: `${history.path} is the work history of phase ${String(historyRecord?.["phase"])} and this verdict reviews ${phaseId}, so the deviations compared would be the wrong ones`,
          },
        ],
        reports: [],
      };
    }
    const declared = idsOf(historyRecord, "deviations", "plan-clause");
    const judged = idsOf(verdict, "deviations-judged", "deviation");
    const judgedSet = new Set(judged);
    const violations: Diagnostic[] = [];
    for (const clause of declared) {
      if (!judgedSet.has(clause)) {
        violations.push({
          pointer: "#/deviations-judged",
          message: `deviation ${clause} is declared in ${history.path} and this review did not judge it`,
        });
      }
    }
    const declaredSet = new Set(declared);
    for (let index = 0; index < judged.length; index += 1) {
      const clause = judged[index] as string;
      if (!declaredSet.has(clause)) {
        violations.push({
          pointer: `#/deviations-judged/${String(index)}/deviation`,
          message: `deviation ${clause} is judged here and ${history.path} declares no such deviation`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* verdict-hazard-classes-addressed (M3-P7 step 6b, criterion 4e)       */
/* ------------------------------------------------------------------ */

/**
 * A HAZARD verdict's `hazard-classes-addressed[]` carries one entry per
 * hazard class declared by the plan phase it reviews.
 *
 * T-007 IS THE INPUT AND M3R-005 IS THE SHAPE. This has exactly the shape
 * `verdict-criteria-complete` has for criteria, one field along, and for
 * exactly the same reason: a reviewer could otherwise silently skip one of
 * three declared hazard classes while every other criterion still passed.
 * T-007's measured case is a phase meeting fifteen of fifteen executed
 * criteria while live-locking every supervision command.
 *
 * IT APPLIES EXACTLY WHERE THE CONTRACT APPLIES. A verdict whose
 * `review-contract` is `criteria` is not asserted against, because the
 * criteria contract is not the one that owes hazard statements, and a check
 * that reddened on it would push reviewers to fill the array with nothing.
 * That the criteria arm is unaffected is asserted by a test rather than left
 * as an implication.
 */
export const verdictHazardClassesAddressed: DerivedCheck = {
  id: "verdict-hazard-classes-addressed",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      return {
        violations: [
          {
            pointer: "#/hazard-classes-addressed",
            message: "no context directory was supplied",
          },
        ],
        reports: [],
      };
    }
    const verdict = asRecord(instance);
    if (verdict?.["review-contract"] !== "hazard") {
      return EMPTY;
    }
    const resolved = readVerdictPlanPhase(
      instance,
      contextDirectory,
      "#/hazard-classes-addressed",
    );
    if (!resolved.ok) {
      return { violations: [resolved.violation], reports: [] };
    }
    const declared = idsOf(resolved.phase, "hazard-classes", "id");
    const addressed = idsOf(verdict, "hazard-classes-addressed", "class-id");
    const addressedSet = new Set(addressed);
    const violations: Diagnostic[] = [];
    for (const id of declared) {
      if (!addressedSet.has(id)) {
        violations.push({
          pointer: "#/hazard-classes-addressed",
          message: `hazard class ${id} of phase ${String(verdict["phase"])} in ${resolved.path} has no entry, so this hazard review did not address it`,
        });
      }
    }
    const declaredSet = new Set(declared);
    for (let index = 0; index < addressed.length; index += 1) {
      const id = addressed[index] as string;
      if (!declaredSet.has(id)) {
        violations.push({
          pointer: `#/hazard-classes-addressed/${String(index)}/class-id`,
          message: `hazard class ${id} is addressed here and ${resolved.path} declares no such class on this phase`,
        });
      }
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* verdict-finding-references-resolve (M3-P7 fix round 2, H-1)          */
/* ------------------------------------------------------------------ */

/**
 * Every `hazard-classes-addressed[].finding` names a `findings[].id` that
 * exists in the SAME verdict.
 *
 * KIND B FOR THE SAME REASON `checklist-probe-ids-unique` IS, AND IT IS THE
 * ONLY INTRA-DOCUMENT ID REFERENCE THE SHIPPED SCHEMAS DECLARE. The
 * verdict schema's own `$comment` on `finding` calls it "the `findings[].id`
 * this class produced", so the join is DECLARED; nothing resolved it, so it
 * was a bare string with `minLength: 1`. Resolving one array's entry against
 * another array's ids is not a keyword property under any DR-0013 option,
 * which is why it lands here and not in the schema.
 *
 * WHAT IT PROTECTS, and it is not merely tidiness. The verdict schema ships
 * exactly ONE rule that can force a verdict off APPROVE: a `findings[]` set
 * containing a `high` or `critical` entry must carry FIX-ROUND-NEEDED. That
 * rule reads `findings[]` and nothing else. So a hazard reviewer who records
 * a class as having produced a finding, and leaves that finding out of
 * `findings[]`, gets a schema-valid APPROVE with an empty findings array and
 * the escalation rule never sees the finding it would have fired on. Measured
 * at 4bfa790 before this check: such a document validated at exit 0, and the
 * same document with the finding moved into `findings[]` at `severity: high`
 * exited 1.
 *
 * A DANGLING REFERENCE IS ITSELF THE ERROR, not only one that lets the
 * escalation be evaded, and the reason is that the narrower rule is not
 * computable. A finding absent from `findings[]` has NO severity, so nothing
 * can decide whether it would have escalated; the narrower reading would have
 * to guess, and would clear exactly the document that withheld the most.
 * Requiring the reference to resolve is decidable, and it puts the severity
 * back under the escalation rule where the reader can see it.
 *
 * `requiresContext` is FALSE: the whole comparison is inside one document.
 */
export const verdictFindingReferencesResolve: DerivedCheck = {
  id: "verdict-finding-references-resolve",
  type: "verdict",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const verdict = asRecord(instance);
    const findingIds = new Set<string>();
    for (const entry of asArray(verdict?.["findings"])) {
      const id = asRecord(entry)?.["id"];
      if (typeof id === "string") {
        findingIds.add(id);
      }
    }
    const addressed = asArray(verdict?.["hazard-classes-addressed"]);
    const violations: Diagnostic[] = [];
    for (let index = 0; index < addressed.length; index += 1) {
      const reference = asRecord(addressed[index])?.["finding"];
      if (typeof reference !== "string" || findingIds.has(reference)) {
        continue;
      }
      /* NAMES THE CONSEQUENCE, not just the dangling id. An author told only
         that a reference does not resolve reads it as a typo; the sentence
         that matters is that the escalation rule reads `findings[]` alone. */
      violations.push({
        pointer: `#/hazard-classes-addressed/${String(index)}/finding`,
        message: `finding ${reference} is named by hazard class ${String(asRecord(addressed[index])?.["class-id"] ?? "(unnamed)")} and no findings[] entry declares that id, so the verdict's escalation rule cannot see it`,
      });
    }
    return { violations, reports: [] };
  },
};

/* ------------------------------------------------------------------ */
/* tuition-target-exists (M3-P8 criterion 3a)                           */
/* ------------------------------------------------------------------ */

/**
 * A `structural-consequence` marked `applied` names a target path that EXISTS.
 *
 * KIND B BY NECESSITY: it resolves a string against the filesystem, which no
 * keyword under any DR-0013 option reaches. `requiresContext` is TRUE, so
 * running the validator without `--context` prints `SKIPPED
 * tuition-target-exists no context` and exits nonzero rather than passing by
 * not running.
 *
 * ONLY `applied` IS CHECKED, and that is the point rather than a limitation.
 * `proposed` names a change nobody has made and `ticketed` names one carried
 * by a record, so neither claims anything about the tree; `applied` claims the
 * change is IN the tree, and T-003 is the entry recording that a document can
 * carry exactly that claim falsely.
 *
 * WHAT IT DOES NOT REACH, named here because criterion 3 reads at a glance as
 * though it covered the whole hazard: whether the file CONTAINS the change
 * claimed. That is a semantic relation between a prose sentence and a file,
 * and the plan's own hazard table assigns it to review rather than to a check
 * (section 2.6 reason 1). The two halves are exactly what this project has
 * repeatedly found to differ, so the check states which half it is.
 */
export const tuitionTargetExists: DerivedCheck = {
  id: "tuition-target-exists",
  type: "tuition",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Fail closed rather
         than trusting a caller that reaches the check directly. */
      return {
        violations: [
          {
            pointer: "#/structural-consequence",
            message: "no context directory was supplied",
          },
        ],
        reports: [],
      };
    }
    const record = asRecord(instance);
    if (record === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const consequences = asArray(record["structural-consequence"]);
    let resolved = 0;
    let unresolvable = 0;
    const trees = new Set<string>();
    for (let index = 0; index < consequences.length; index += 1) {
      const consequence = asRecord(consequences[index]);
      if (consequence === undefined || consequence["status"] !== "applied") {
        continue;
      }
      const target = consequence["target"];
      if (typeof target !== "string") {
        continue;
      }
      /* HRB-8's mechanism reaches THIS check too, and neither review named it.
         A target is a kernel-artifact path relative to the repository the entry
         came from; four of them name `src/` and one names `test/`, neither of
         which ships. See unresolvableCitationTree. */
      const absentTree = unresolvableCitationTree(contextDirectory, target);
      if (absentTree !== undefined) {
        unresolvable += 1;
        trees.add(`${absentTree}/`);
        continue;
      }
      resolved += 1;
      if (classifyEntry(join(contextDirectory, target)).kind === "absent") {
        violations.push({
          pointer: `#/structural-consequence/${String(index)}/target`,
          message: `structural consequence is marked applied and its target ${target} does not exist`,
        });
      }
    }
    return {
      violations,
      reports: [
        ...(resolved === 0
          ? []
          : [`REPORT tuition-target-exists ${String(resolved)} applied target(s) resolved`]),
        ...unresolvedTreeReport("tuition-target-exists", unresolvable, trees),
      ],
    };
  },
};

/* ------------------------------------------------------------------ */
/* mechanism-rule-evidence-resolves (M3-P8 criteria 3b and 4b)          */
/* ------------------------------------------------------------------ */

/**
 * A PATH REFERENCE inside a `mechanisms[]` entry resolves against the tree,
 * and a `machine-readable-form` resolves to a real document AND a real key
 * inside it.
 *
 * T-005's checkability rule has two halves and they need two instruments. The
 * SCHEMA half is `evidence` with `minItems: 1`: a rule with no citation is not
 * a rule. THIS half is that a citation naming a file which does not exist is
 * not a citation, which is a filesystem question and therefore Kind B.
 *
 * WHAT COUNTS AS A PATH REFERENCE, stated mechanically because a checker whose
 * subject is vague cannot be falsified: a whitespace-delimited token holding at
 * least one `/` and ending in a short extension, with surrounding backticks,
 * brackets and trailing punctuation stripped. Real evidence in this feed reads
 * `delivery/review/verification-m1-p3-fix-round.md V-1 and V-3`, so the
 * reference is a token inside a sentence rather than the whole string.
 *
 * A `path.ext:LINE` CITATION IS A PATH REFERENCE (HRB-1, fix round 3). It is the
 * form CLAUDE.md:155 mandates, and the earlier token test silently dropped every
 * one of them; see `pathReferencesIn` for the measurement and the grammar.
 *
 * WHAT IT DOES NOT REACH, and these are real holes rather than tidy ones.
 *
 * PROSE-ONLY evidence. `M1-P5 round 4, verified pre-existing against a pristine
 * build` names no path, so nothing about it is resolvable and this check says
 * nothing about it. Requiring every citation to be a path would redden entries
 * whose evidence is a measurement rather than a document, which is a real form
 * of evidence this project uses. The residue is therefore deliberate: the check
 * establishes that the paths cited EXIST, never that a rule is supported.
 *
 * A CITATION INTO A TREE THIS CONTEXT DOES NOT HAVE (HRB-8, fix round 3). The
 * feed ships and `delivery/` does not, so in a consumer's install most citations
 * name a repository that is not there. Those are REPORTED, with their count and
 * the trees involved, and never counted as violations; see
 * `unresolvableCitationTree` for why that is the correct answer rather than a
 * softening, and for the reason it is not a silent pass.
 *
 * REGISTERED FOR BOTH TYPES. `mechanisms[]` appears in a tuition entry (where
 * a rule is authored) and in the mechanism index (where it is projected). A
 * check registered only for the first would leave the shipped index unchecked,
 * which is the shared-definition asymmetry `alsoTypes` exists for.
 */
export const mechanismRuleEvidenceResolves: DerivedCheck = {
  id: "mechanism-rule-evidence-resolves",
  type: "tuition",
  alsoTypes: ["mechanism-index"],
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      return {
        violations: [
          { pointer: "#/mechanisms", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const record = asRecord(instance);
    if (record === undefined) {
      return EMPTY;
    }
    const violations: Diagnostic[] = [];
    const mechanisms = asArray(record["mechanisms"]);
    let resolved = 0;
    let unresolvable = 0;
    const trees = new Set<string>();
    for (let index = 0; index < mechanisms.length; index += 1) {
      const mechanism = asRecord(mechanisms[index]);
      if (mechanism === undefined) {
        continue;
      }
      const evidence = asArray(mechanism["evidence"]);
      for (let position = 0; position < evidence.length; position += 1) {
        const reference = evidence[position];
        if (typeof reference !== "string") {
          continue;
        }
        for (const path of pathReferencesIn(reference)) {
          const absentTree = unresolvableCitationTree(contextDirectory, path);
          if (absentTree !== undefined) {
            unresolvable += 1;
            trees.add(`${absentTree}/`);
            continue;
          }
          resolved += 1;
          if (classifyEntry(join(contextDirectory, path)).kind === "absent") {
            violations.push({
              pointer: `#/mechanisms/${String(index)}/evidence/${String(position)}`,
              message: `evidence names ${path}, which does not exist`,
            });
          }
        }
      }
      const machine = asRecord(mechanism["machine-readable-form"]);
      if (machine === undefined) {
        continue;
      }
      const pointer = `#/mechanisms/${String(index)}/machine-readable-form`;
      const path = machine["path"];
      const key = machine["key"];
      if (typeof path !== "string" || typeof key !== "string") {
        continue;
      }
      /* The same predicate on the third site the derivation found. The one real
         `machine-readable-form` names `gates.manifest.json`, which SHIPS and
         still resolves; a future one naming a non-shipping tree would otherwise
         redden every consumer's install for a fact they cannot check. */
      const absentTree = unresolvableCitationTree(contextDirectory, path);
      if (absentTree !== undefined) {
        unresolvable += 1;
        trees.add(`${absentTree}/`);
        continue;
      }
      resolved += 1;
      const document = readContextDocument(contextDirectory, path);
      if (!document.ok) {
        violations.push({
          pointer: `${pointer}/path`,
          message: `machine-readable form names ${path}, which could not be read: ${document.reason}`,
        });
        continue;
      }
      /* THE KEY IS RESOLVED, NOT THE PATH ALONE (D-M3-26, criterion 4b). A
         document that still exists under a key M2 renamed is exactly the drift
         this coupling exists to catch, and a path-only check would call it
         green. */
      if (asRecord(document.value)?.[key] === undefined) {
        violations.push({
          pointer: `${pointer}/key`,
          message: `machine-readable form names key ${key}, which ${path} does not carry`,
        });
      }
    }
    return {
      violations,
      reports: [
        ...(resolved === 0
          ? []
          : [
              `REPORT mechanism-rule-evidence-resolves ${String(resolved)} citation(s) resolved`,
            ]),
        ...unresolvedTreeReport("mechanism-rule-evidence-resolves", unresolvable, trees),
      ],
    };
  },
};

/**
 * Every path-like token in one prose reference. See the check's header for the
 * definition and for what it deliberately does not treat as a path.
 *
 * THE `:LINE` SUFFIX IS STRIPPED BEFORE THE EXTENSION TEST (HRB-1, M3-P8 fix
 * round 3). CLAUDE.md:155 makes `path.ext:LINE` THE citation form in this
 * project ("a bare path is not a citation at all") and src/gates/citations.ts
 * is the gate that enforces it. The earlier form tested the extension at
 * end-of-string, and a line number sits after it, so every citation written the
 * way this repository REQUIRES resolved to nothing: an entry whose paths were
 * entirely fabricated validated at exit 0, and the byte-identical entry with
 * the suffixes removed went red. A check that passes exactly the mandated form
 * is not a check.
 *
 * The suffix grammar is the citations gate's own, narrowed to what a suffix can
 * be rather than re-derived: `:<line>`, an optional `-<line>` range, and an
 * optional `@sha256:<hex>` content pin (src/gates/citations.ts:453). Stripping
 * is deliberately conservative: a token that does not match keeps its colon and
 * is then judged by the extension test as before, so `http://x/y.md` and
 * `a/b.md:notaline` are unchanged.
 */
export function pathReferencesIn(reference: string): string[] {
  const found: string[] = [];
  for (const raw of reference.split(/\s+/)) {
    const trimmed = raw.replace(/^[`("'[]+/, "").replace(/[`)"'\].,;]+$/, "");
    const token = trimmed
      .replace(/:\d+(?:-\d+)?(?:@sha256:[0-9a-zA-Z]+)?$/, "")
      .replace(/[`)"'\].,;:]+$/, "");
    if (token.includes("/") && /\.[A-Za-z0-9]{1,6}$/.test(token) && !token.startsWith("/")) {
      found.push(token);
    }
  }
  return found;
}

/**
 * THE TREE A CITATION IS ROOTED IN, when this context does not contain it.
 * Returns that top-level name, or undefined when the citation IS resolvable
 * here and absence would therefore be a real defect.
 *
 * WHY (HRB-8, M3-P8 fix round 3). A citation is relative to the repository that
 * AUTHORED it. The tuition feed and its index ship in the npm package;
 * `delivery/`, `src/`, `scripts/` and `test/` do not (package.json's `files`).
 * So the checks that resolve a document-supplied path were asking a consumer's
 * install a question only the kernel repository can answer, and answering it
 * INVALID. Measured at 26ee653: the shipped index produced 16 INVALID lines
 * from a pristine `npm pack` extraction, and eight of the fifteen shipped
 * entries produced more. CI never saw it because this repository has
 * `delivery/`, which is T-009's shape one scope out.
 *
 * schemas/mechanism-index.schema.json:5 already stated the governing fact
 * before this round: resolution "is not computable from an installed package".
 * This is that sentence made operative rather than decorative.
 *
 * THE PREDICATE IS THE TOP-LEVEL SEGMENT, and it is the coarsest one that still
 * catches everything the kernel repository could catch before. A citation into a
 * tree that IS present must still resolve, so a fabricated
 * `delivery/review/invented.md` is as red here as it ever was; only a citation
 * into a tree that is wholly absent is excused. A path with no directory
 * component is NEVER excused, because the context root always exists: measured
 * against the real feed, every `applied` root-level target ships, and the one
 * root-level absentee (`AGENTS.md`) is `ticketed`, which the check does not read.
 *
 * THIS IS NOT A LICENCE TO GO QUIET. Every caller REPORTS what it declined to
 * resolve and why. "Nothing to check here" and "everything checked and fine"
 * must never print the same line, which is the SC-011 shape the plan's hazard
 * row at delivery/plan/kernel-plan-m3.md:4042 polices.
 */
export function unresolvableCitationTree(
  contextDirectory: string,
  path: string,
): string | undefined {
  const slash = path.indexOf("/");
  if (slash <= 0) {
    return undefined;
  }
  const tree = path.slice(0, slash);
  return classifyEntry(join(contextDirectory, tree)).kind === "absent" ? tree : undefined;
}

/** One report line naming the trees a check declined to resolve into. */
function unresolvedTreeReport(check: string, count: number, trees: Set<string>): string[] {
  if (count === 0) {
    return [];
  }
  const named = [...trees].sort().join(", ");
  return [
    `REPORT ${check} ${String(count)} citation(s) not resolvable in this context: ` +
      `no ${named} tree here, so they name a repository this is not`,
  ];
}

/* ------------------------------------------------------------------ */
/* dual-review-decorrelation (M3-P9 step 3b, criteria 7 and 7b)         */
/* ------------------------------------------------------------------ */

/** Where a project's committed review verdicts live (DR-0012 condition 1). */
const REVIEW_DIRECTORY = join("delivery", "review");

/** The three dimensions two verdicts of one head must differ on. */
export const DECORRELATION_DIMENSIONS: readonly string[] = [
  "produced-by",
  "framing",
  "review-contract",
];

/** The merge-authority value that makes decorrelation a precondition of merge. */
export const DELEGATED_MERGE_AUTHORITY = "delegated-under-conditions";

interface LoadedVerdict {
  path: string;
  record: Record<string, unknown>;
}

/**
 * Every verdict document committed under `<context>/delivery/review/`.
 *
 * A file that is not a regular file, does not decode, or does not carry
 * `kind: verdict` is SKIPPED rather than reported, because that directory also
 * holds this project's prose reviews and a check that reddened on a markdown
 * file would be unusable. What is NOT skipped is the directory being
 * unreadable, which the caller turns into a violation: "nothing to compare" and
 * "could not look" are different facts.
 */
function loadCommittedVerdicts(
  contextDirectory: string,
): { ok: true; verdicts: LoadedVerdict[] } | { ok: false; reason: string } {
  const directory = join(contextDirectory, REVIEW_DIRECTORY);
  /* `classifyEntry` HAS NO `directory` KIND: a directory lands in `irregular`,
     which is the kind that means "present and not safe to OPEN AS A FILE". So
     the shape here is the one `listWitnessSpecFiles` already uses: classify to
     rule out absent and unexaminable, then LIST, and read the classification
     again only to explain a listing failure. Testing for a kind that does not
     exist would have been dead code that always took the error arm. */
  const entry = classifyEntry(directory);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, verdicts: [] };
  }
  if (entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    if (entry.kind === "regular") {
      return {
        ok: false,
        reason: `${directory} is a regular file, not a directory, so the committed verdicts cannot be enumerated`,
      };
    }
    return { ok: false, reason: `${directory} could not be listed: ${String(error)}` };
  }
  const verdicts: LoadedVerdict[] = [];
  for (const name of names.sort()) {
    if (!/\.(ya?ml|json)$/i.test(name)) {
      continue;
    }
    const path = join(directory, name);
    const read = readOperatorPath(path);
    if (!read.ok) {
      continue;
    }
    const decoded = decodeDocument(read.body, path);
    if (!decoded.ok) {
      continue;
    }
    const record = asRecord(decoded.value);
    if (record?.["kind"] !== "verdict") {
      continue;
    }
    verdicts.push({ path, record });
  }
  return { ok: true, verdicts };
}

/**
 * A field read WITH ITS PRESENCE ESTABLISHED. This is the whole of CR-001's
 * repair, and it is stated as a mechanism rather than as three field names.
 *
 * THE MECHANISM CR-001 NAMES: a value read with a DEFAULT and then compared
 * makes ABSENT and PRESENT-AND-DIFFERENT into the same fact. `?? ""` turned a
 * missing `produced-by` into the empty string, the empty string differs from
 * every real family name, and "differs" is what this check reads as
 * decorrelated. So a pair that could NOT be shown decorrelated was reported as
 * one that was, and that is the direction which authorises a merge.
 *
 * The repair is not a fourth comparison. It is that a value is not COMPARABLE
 * until it has been established, and the three outcomes are kept apart:
 * ESTABLISHED (a non-empty string), ABSENT (the key is not there at all), and
 * UNUSABLE (the key is there carrying null, whitespace, a number, a list or a
 * map). Only the first is ever handed to a comparison. The other two get their
 * own verdict in their own words, because "could not look" must never print as
 * "looked and fine" (SC-011), which is the rule this function already applied
 * to the charter one screen above and did not apply here.
 *
 * `field in record` is why this is not merely a `typeof` test, and the
 * distinction is not academic: `produced-by:` with nothing after it decodes to
 * `null`, which is present-and-unusable rather than missing, and the reader who
 * fixes one is not fixing the other.
 *
 * WHY THE SCHEMA DOES NOT DISCHARGE THIS. `schemas/verdict.schema.json` really
 * does put all three dimensions in `required`, and the previous version of this
 * code relied on that. Nothing on the shipped path ever runs that validation
 * over the SIBLING documents: `loadCommittedVerdicts` skips a file only when it
 * fails to decode or is not `kind: verdict`, so a verdict missing a required
 * field is loaded and compared. The composition was asserted in a comment and
 * implemented nowhere. A check does not get to assume its inputs were validated
 * by a step that does not exist.
 */
type EstablishedField =
  | { kind: "established"; value: string }
  | { kind: "absent" }
  | { kind: "unusable"; found: string }
  | { kind: "uncanonical"; found: string };

/**
 * THE CANONICAL FORM OF A GOVERNANCE SCALAR, DECLARED HERE BECAUSE A
 * COMPARISON WITHOUT A DECLARED CANONICAL FORM IS THE FIX-ROUND-2 MECHANISM.
 *
 * THE MECHANISM: two strings are compared for EQUALITY or DISTINCTNESS without
 * a declared canonical form, so two REPRESENTATIONS of one value read as two
 * different values. Round 1 closed "absent versus present-and-differing". This
 * closes "differently represented versus different", which is the same check
 * one layer down.
 *
 * WHY IT IS SAFE TO COLLAPSE HARD HERE, which is the argument that decides
 * every choice below. This check REFUSES when two reviews are NOT distinct, so
 * any rule that makes MORE strings compare as equal produces MORE refusals.
 * Aggressive canonicalisation is the FAIL-CLOSED direction; timid
 * canonicalisation is what leaves the hole. The one call site where collapsing
 * is instead mildly permissive is named at `decorrelationTriple` below rather
 * than left to be found.
 *
 * THE FORM, in order, and the order is load-bearing:
 *
 *   1. NFKC. Folds compatibility variants onto their ordinary forms, so
 *      FULLWIDTH LATIN SMALL LETTER A (U+FF41) becomes `a` and NO-BREAK SPACE
 *      (U+00A0) becomes a space. Measured: of the five lookalike substitutions
 *      that defeated the previous code, NFKC folds exactly ONE. That
 *      measurement is why step 2 exists and is not decoration.
 *   2. PRINTABLE ASCII ONLY (U+0020 to U+007E). Anything else is REFUSED, not
 *      repaired. This is what actually closes the class: NFKC leaves CYRILLIC
 *      SMALL LETTER A (U+0430), EN DASH (U+2013), ZERO WIDTH SPACE (U+200B)
 *      and SOFT HYPHEN (U+00AD) exactly as they were, all four measured, and
 *      no Unicode normalisation form folds a cross-script homoglyph onto its
 *      lookalike. Closing those by normalisation would need a confusables
 *      table this package does not carry and which goes stale; refusing the
 *      character set needs no table and cannot go stale.
 *   3. Whitespace runs collapse to one space, then trim. Whitespace carries no
 *      information in a scalar identifier (round 1's argument, kept).
 *   4. ASCII case fold. See the CR-003 note at `establishField`.
 *
 * WHY REFUSE AN INVISIBLE CHARACTER RATHER THAN STRIP IT. Stripping is also
 * fail-closed and was the other real option. Refusing is chosen because a
 * document carrying a zero-width space in a model-family id is a document that
 * reads one way to a human and another way to the program, and silently
 * repairing it would hand back a green having never said so. That is SC-011's
 * rule, which this file already applies one screen up: "could not look" must
 * never print as "looked and fine", and "looked, and what I found was built to
 * deceive the reader" is the same fact. A refusal names the codepoint and its
 * position, so the person holding the file can see what they cannot see.
 */
const CANONICAL_MAX_CODE = 0x7e;
const CANONICAL_MIN_CODE = 0x20;

function canonicalScalar(raw: string): { ok: true; value: string } | { ok: false; found: string } {
  const folded = raw.normalize("NFKC");
  for (const character of folded) {
    const code = character.codePointAt(0) as number;
    if (code < CANONICAL_MIN_CODE || code > CANONICAL_MAX_CODE) {
      /* The POSITION is in the NFKC-folded string, and it is reported because
         the whole point of this arm is characters a reader cannot see. A
         codepoint alone does not tell them WHERE to look. */
      const at = [...folded].indexOf(character);
      const point = `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
      return { ok: false, found: `${point} at position ${String(at + 1)}` };
    }
  }
  const collapsed = folded.replace(/\s+/g, " ").trim();
  if (collapsed === "") {
    return { ok: false, found: "no printable characters" };
  }
  return { ok: true, value: collapsed.toLowerCase() };
}

function establishField(
  record: Record<string, unknown> | undefined,
  field: string,
): EstablishedField {
  if (record === undefined || !(field in record)) {
    return { kind: "absent" };
  }
  const raw = record[field];
  if (typeof raw !== "string") {
    /* The vocabulary is the DOCUMENT's, not JavaScript's: a reader looking at
       their own YAML is helped by "a list" and "a map" and not by "an object". */
    const found =
      raw === null
        ? "null"
        : Array.isArray(raw)
          ? "a list"
          : typeof raw === "object"
            ? "a map"
            : `a ${typeof raw}`;
    return { kind: "unusable", found };
  }
  if (raw.trim() === "") {
    return { kind: "unusable", found: raw === "" ? "an empty string" : "only whitespace" };
  }
  /* CANONICALISED, AND THAT IS THE WHOLE OF FIX ROUND 2. An established value is
     what the document MEANS, and neither surrounding whitespace nor the choice
     of codepoint used to draw a letter is part of a model family's name. The
     form itself, and the argument for its aggressiveness, is at
     `canonicalScalar` one screen up.

     CASE IS NOW FOLDED, REVERSING ROUND 1, AND THE CITATION ROUND 1 INHERITED
     WAS CHECKED RATHER THAN CARRIED FORWARD. Round 1 declined to fold case on
     the grounds that "the review that found CR-001 names case-insensitive
     comparison as an example of a WEAKENING of this check". CR-003 is a LOW
     finding about WITNESS SPEC CONSTRUCTION, not about this comparison. Its
     words, at delivery/review/clean-room-m3-p9-criteria.md:527, are that "a
     stronger second member would be a different way to break the comparison,
     for example comparing the dimension case-insensitively or grouping on the
     wrong key". That is a suggestion for a MUTATION to put in a witness spec's
     `dangerousStates`, which is a deliberate defect a test must redden against.
     It is not a ruling that the shipped comparison should be case-sensitive.

     And the direction settles it independently of what the reviewer meant: this
     check refuses when values are NOT distinct, so folding case makes more
     values compare as equal, which produces MORE refusals. A case-insensitive
     comparison here cannot be a weakening, because there is no input it lets
     through that a case-sensitive one refuses. Measured before this line
     existed: `produced-by: Family-A` against `produced-by: family-a` on a pair
     sharing one model family exited 0 GREEN, and `merge-authority:
     Delegated-Under-Conditions` disabled the check entirely. Both now redden. */
  const canonical = canonicalScalar(raw);
  if (!canonical.ok) {
    return { kind: "uncanonical", found: canonical.found };
  }
  return { kind: "established", value: canonical.value };
}

/**
 * The sentence for a reading that is NOT established, so absence and
 * unusability never share a message with each other or with a comparison.
 * Returns `undefined` for an established reading, which no caller asks about.
 */
function unestablishedReason(reading: EstablishedField, field: string): string | undefined {
  if (reading.kind === "established") {
    return undefined;
  }
  if (reading.kind === "absent") {
    return `declares no ${field}`;
  }
  if (reading.kind === "uncanonical") {
    /* ITS OWN SENTENCE, because it is its own fact. "Names no value" is false
       here: the field names a value perfectly well, and the value is drawn in
       characters that no reader can tell from another value's. Printing that as
       "names no value" would send the reader looking for a missing field. */
    return (
      `declares ${field} using the character ${reading.found}, which is outside the printable ASCII ` +
      `a governance identifier is compared as, so it cannot be told apart from a value drawn in ordinary characters`
    );
  }
  return `declares ${field} as ${reading.found}, which names no value`;
}

/**
 * The triple that identifies one review's decorrelation position.
 *
 * BUILT FROM ESTABLISHED READINGS rather than from `?? ""`, for the same reason
 * as everything else in this section: the old form mapped an ABSENT field and a
 * field carrying the empty string onto the same token, so two documents that
 * were merely both incomplete compared as the same review.
 *
 * WHAT IT STILL DOES NOT SEPARATE, said here rather than left to be found: two
 * documents each missing the SAME dimension still produce the same token for it,
 * because identity-by-triple cannot distinguish two absences. That is not a way
 * to a wrong decorrelation verdict any more, because the per-dimension loop now
 * refuses an unestablished dimension outright; it can still let a verdict that
 * is not the committed one pass the membership test when both are incomplete in
 * the same way.
 *
 * THIS IS THE ONE SITE WHERE FIX ROUND 2's CANONICALISATION IS PERMISSIVE
 * RATHER THAN REFUSING, AND IT IS DECLARED HERE RATHER THAN DISCOVERED. Every
 * other comparison in this check refuses more inputs once values are collapsed
 * onto one form. This one accepts more: a verdict differing from a committed
 * one only in case or in a compatibility variant now passes the membership test
 * where it previously did not. That is accepted deliberately, on the ground
 * that it wins an attacker nothing: membership only decides whether this check
 * proceeds, and what it proceeds to compare is the COMMITTED group, which the
 * non-committed document is not a member of and does not change. An attacker
 * who wants the comparison to run can always submit the committed file itself.
 */
function decorrelationTriple(record: Record<string, unknown> | undefined): string {
  return DECORRELATION_DIMENSIONS.map((dimension) => {
    const reading = establishField(record, dimension);
    return reading.kind === "established" ? `=${reading.value}` : `<${reading.kind}>`;
  }).join(" | ");
}

/**
 * DR-0012's merge precondition, made into a comparison a command can make
 * against the verdict FILES rather than against a session's memory (M3R-004).
 *
 * WHY THIS IS KIND B AND COULD NOT BE A KEYWORD. Every dimension it compares
 * lives in a DIFFERENT DOCUMENT from the instance: distinctness is a property
 * of a PAIR of verdicts, and no keyword under any DR-0013 option can see the
 * sibling.
 *
 * IT ESTABLISHES PRESENCE ITSELF AND DOES NOT BORROW IT FROM THE SCHEMA. An
 * earlier version of this comment said the verdict schema's `required` buys
 * absence-freedom, so this check only had to decide difference. That division of
 * labour was never composed: nothing on the shipped path validates the SIBLING
 * documents, so a document with `kind: verdict` and a missing required field is
 * loaded here and compared. The rule the whole section now follows is
 * `establishField`, one screen up: a value is not comparable until it has been
 * established, and absence, unusability and difference are three verdicts, not
 * one.
 *
 * IT APPLIES EXACTLY WHERE THE GRANT APPLIES. The regime is read from the
 * declared mode, not assumed: `charter.yaml` names the delivery mode and
 * `assurance-modes.yaml` says what that mode's `merge-authority` is. A mode
 * whose authority is not a delegated grant has no decorrelation precondition to
 * satisfy, and this check REPORTS that rather than passing silently, because
 * "nothing to check here" and "everything checked and fine" must never print
 * the same line (SC-011).
 *
 * FIVE DIMENSIONS, AND (e) IS NOT A REFINEMENT OF (b). T-007's whole finding is
 * that model decorrelation and CONTRACT decorrelation are different properties
 * and this project had the second by accident: two reviewers on different model
 * families walked all fifteen criteria of one phase, agreed on every mechanical
 * fact, and one missed a high-severity defect because both had been given the
 * criteria contract. So `review-contract` is compared separately and is
 * witnessed separately (criterion 7b).
 *
 * WHAT IT DOES NOT REACH, named rather than left to be found. Condition (d) of
 * step 3b, that neither verdict carries an unresolved high or medium finding,
 * is NOT checked here: the verdict schema's own root `if`/`then` already
 * forbids APPROVE beside a high or critical finding, and "unresolved" is a
 * state of the review thread rather than of the document. Nothing here decides
 * whether the two verdicts describe the same HEAD either: the verdict schema
 * carries no head field, so `phase` is the join key and the DIRECTORY is what
 * scopes a set of verdicts to one head. Both are stated in
 * delivery/work-history/m3-p9.md as declared readings rather than absorbed.
 */
export const dualReviewDecorrelation: DerivedCheck = {
  id: "dual-review-decorrelation",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Fail closed rather
         than trusting a caller that reaches the check directly. */
      return {
        violations: [
          { pointer: "#/produced-by", message: "no context directory was supplied" },
        ],
        reports: [],
      };
    }
    const verdict = asRecord(instance);
    /* THE JOIN KEY IS CANONICALISED TOO, AND IT IS NOT AN AFTERTHOUGHT. `phase`
       selects the GROUP the distinctness comparison runs over, so a lookalike
       character here shrinks the group instead of changing a dimension. With
       three verdicts, two of them sharing a family, drawing one sibling's
       `phase` with a homoglyph drops it from the group and leaves two distinct
       ones behind, which is the same fail-open outcome by a different route.
       Canonicalising GROWS the group, which is the fail-closed direction: more
       verdicts compared means more chances to find a shared value. */
    const phaseReading = establishField(verdict, "phase");
    if (phaseReading.kind !== "established") {
      return {
        violations: [
          {
            pointer: "#/phase",
            message: `the verdict ${unestablishedReason(phaseReading, "phase") as string}, so the other reviews of the same work cannot be selected`,
          },
        ],
        reports: [],
      };
    }
    /* TWO JOBS, TWO VALUES, AND CONFLATING THEM IS ITS OWN SMALL DEFECT. The
       phase is a JOIN KEY, which must be canonical so the group is assembled
       correctly, and it is also a LABEL printed back at a reader, which must be
       the reader's OWN spelling so the sentence matches the file they are
       holding. Printing the canonical form would tell someone whose charter says
       `M3-P9` about a phase called `m3-p9`, which is a document they do not
       have. Only `phaseKey` is ever compared; only `phase` is ever printed. */
    const phaseKey = phaseReading.value;
    const phase = verdict?.["phase"] as string;

    /* THE REGIME IS READ, NEVER ASSUMED, AND "ABSENT" IS NOT THE SAME FACT AS
       "PRESENT AND BROKEN". This distinction was NOT in the first version of
       this check and it cost eight red tests belonging to M3-P7, one of them
       that phase's own acceptance criterion.

       The mechanism behind those eight, stated at the field rather than at the
       failure: an applicability determination that needs a PROJECT WORKSPACE
       was being made inside a check that runs on ANY verdict with ANY context,
       and a verdict context built to exercise criteria completeness carries a
       plan and a work history and no charter, because a charter is not what
       those rules are about.

       So: a charter that is ABSENT means this context declares no delivery
       mode, which is REPORTED rather than failed. A charter that is THERE and
       unreadable, or that names a mode nothing defines, or a mode document
       absent while a charter names a mode, is a VIOLATION, because a document
       that exists and is wrong is a different fact from one that does not.

       THE FAIL-CLOSED TEETH DID NOT DISAPPEAR, THEY MOVED TO THE CALLER THAT
       MAKES THE MERGE DECISION. `scripts/check-dual-review.mjs` refuses a
       directory carrying no charter or no mode document, with gate status
       `error`. That is the path DR-0012's grant runs through, and it must never
       report green without knowing the regime. Imposing the same refusal here
       imposed it on a path the grant has nothing to do with. */
    const charterPresent =
      classifyEntry(join(contextDirectory, "charter.yaml")).kind !== "absent";
    if (!charterPresent) {
      return {
        violations: [],
        reports: [
          `REPORT dual-review-decorrelation ${contextDirectory} declares no delivery mode ` +
            `(no charter.yaml), so the verdicts for phase ${phase} were NOT evaluated against a ` +
            `merge-authority regime; scripts/check-dual-review.mjs refuses such a directory outright`,
        ],
      };
    }
    const charter = readContextDocument(contextDirectory, "charter.yaml");
    if (!charter.ok) {
      return {
        violations: [
          {
            pointer: "#/produced-by",
            message: `the charter is present and could not be read, so the declared mode's merge-authority is unknown and decorrelation could not be evaluated: ${charter.reason}`,
          },
        ],
        reports: [],
      };
    }
    /* SITE TWO OF THE SAME MECHANISM. `asRecord(charter.value)?.["delivery-mode"]`
       used to flow into `String(modeId)` and into an `===` against every mode's
       id, so a charter declaring NO delivery mode reddened with the sentence
       "declares delivery mode undefined, which ... does not define". The verdict
       was right by luck and the sentence was false: the charter declares no mode
       rather than one called "undefined". Establishing it first gives absence its
       own sentence, and gives the `===` below a non-empty string, which is also
       what stops an id-less mode row (`eachMode` defaults a missing id to "")
       from matching a charter whose delivery-mode is the empty string. */
    const modeReading = establishField(asRecord(charter.value), "delivery-mode");
    if (modeReading.kind !== "established") {
      return {
        violations: [
          {
            pointer: "#/produced-by",
            message: `${charter.path} ${unestablishedReason(modeReading, "delivery-mode") as string}, so no mode's merge-authority can be looked up and whether the delegated grant applies to phase ${phase} could not be established`,
          },
        ],
        reports: [],
      };
    }
    const modeId = modeReading.value;
    const modesDocument = readContextDocument(contextDirectory, MODES_DOCUMENT);
    if (!modesDocument.ok) {
      return {
        violations: [
          {
            pointer: "#/produced-by",
            message: `${charter.path} declares delivery mode ${String(modeId)} and ${MODES_DOCUMENT} could not be read, so that mode's merge-authority is unknown and decorrelation could not be evaluated: ${modesDocument.reason}`,
          },
        ],
        reports: [],
      };
    }
    /* BOTH SIDES CANONICAL, and the direction here is worth stating because it
       is the one place in this function where collapsing makes a lookup SUCCEED
       more often rather than fail. `eachMode` builds `row.id` with its own
       `String(... ?? "")` and is shared with six other consumers, so it is left
       alone and its output is canonicalised at THIS use site. Finding the mode
       a charter actually names is the correct reading; the security-relevant
       comparison is the `merge-authority` one below, and THAT one is fail-closed
       under collapsing, because more values matching the delegated constant
       means the decorrelation requirement applies more often, never less. */
    const mode = eachMode(modesDocument.value).find((row) => {
      const reading = canonicalScalar(row.id);
      return reading.ok && reading.value === modeId;
    });
    if (mode === undefined) {
      return {
        violations: [
          {
            pointer: "#/produced-by",
            message: `${charter.path} declares delivery mode ${String(modeId)}, which ${modesDocument.path} does not define, so its merge-authority is unknown`,
          },
        ],
        reports: [],
      };
    }
    /* SITE THREE, AND IT IS THE WORST OF THE FOUR BECAUSE IT DISABLES THE WHOLE
       CHECK RATHER THAN ONE DIMENSION. `String(mode.mode["merge-authority"] ?? "")`
       made a mode that declares NO merge-authority indistinguishable from one
       declaring some other authority, and the not-a-delegated-grant arm below is
       a REPORT rather than a violation. Measured on the shipped script before
       this repair (probe P1 in delivery/work-history/m3-p9.md): a pair sharing
       one model family, under a mode with its `merge-authority` line deleted,
       exited 0 GREEN printing "mode full declares merge-authority , which is not
       a delegated grant". That sentence is false and the exit code authorises
       the merge the check exists to refuse. The reviewer did not find this one;
       the derivation did. */
    const authorityReading = establishField(mode.mode, "merge-authority");
    if (authorityReading.kind !== "established") {
      return {
        violations: [
          {
            pointer: "#/produced-by",
            message: `${modesDocument.path} ${unestablishedReason(authorityReading, "merge-authority") as string} for mode ${modeId}, so whether the delegated grant applies to phase ${phase} could not be established, and a merge check that cannot determine the regime must not report that no decorrelation is required`,
          },
        ],
        reports: [],
      };
    }
    const authority = authorityReading.value;
    if (authority !== DELEGATED_MERGE_AUTHORITY) {
      return {
        violations: [],
        reports: [
          `REPORT dual-review-decorrelation mode ${String(modeId)} declares merge-authority ${authority}, ` +
            `which is not a delegated grant, so no decorrelation is required of the reviews of phase ${phase}`,
        ],
      };
    }

    const committed = loadCommittedVerdicts(contextDirectory);
    if (!committed.ok) {
      return {
        violations: [{ pointer: "#/produced-by", message: committed.reason }],
        reports: [],
      };
    }
    const group = committed.verdicts.filter(
      /* BOTH SIDES CANONICAL. `phase` above is already canonical; the sibling's
         is read through the same function so the two are compared in one form
         rather than one canonical value against one raw one. */
      (candidate) => {
        const reading = establishField(candidate.record, "phase");
        return reading.kind === "established" && reading.value === phaseKey;
      },
    );

    /* MEMBERSHIP FIRST. DR-0012 condition 1 says the two reviews are WRITTEN TO
       `delivery/review/` AND COMMITTED, so a verdict that is not among them is
       not a review this rule can be satisfied by, however well decorrelated the
       committed pair happens to be. Without this the check would pass on a
       document that had nothing to do with the directory it was given. */
    const wanted = decorrelationTriple(verdict);
    if (!group.some((candidate) => decorrelationTriple(candidate.record) === wanted)) {
      return {
        violations: [
          {
            pointer: "#/phase",
            message: `this verdict is not among the ${String(group.length)} verdict document(s) committed under ${REVIEW_DIRECTORY} for phase ${phase}, so it is not a review the delegated grant can be satisfied by`,
          },
        ],
        reports: [],
      };
    }

    const violations: Diagnostic[] = [];
    if (group.length < 2) {
      violations.push({
        pointer: "#/phase",
        message: `only ${String(group.length)} verdict document(s) exist under ${REVIEW_DIRECTORY} for phase ${phase}, and a delegated grant requires two independent clean-room reviews of the exact head`,
      });
    }

    for (const dimension of DECORRELATION_DIMENSIONS) {
      /* SITE ONE, THE ONE CR-001 REPORTS. ABSENCE IS ITS OWN VERDICT AND IT IS A
         FAIL, and the choice was deliberate rather than inherited.

         The alternative the plan permits elsewhere, a not-applicable carrying a
         reason, is the RIGHT answer where the check has established that the
         regime does not apply: that is why an absent charter above REPORTS. It
         is the WRONG answer here, because by this line the regime HAS been
         established as a delegated grant, these documents ARE the ones the grant
         rests on, and a dimension no verdict states is a precondition that has
         not been shown. Under a grant, unshown must be refused; anything else is
         the fail-open direction this finding is about.

         The message is deliberately UNLIKE the correlation message below, so
         "could not be shown decorrelated" and "was shown correlated" never print
         the same line. Note also that an unestablished dimension does not
         suppress the comparison over the rest of the group: with three verdicts,
         one absent and two sharing a family, a reader is owed both facts. */
      const counts = new Map<string, string[]>();
      for (const candidate of group) {
        const reading = establishField(candidate.record, dimension);
        if (reading.kind !== "established") {
          violations.push({
            pointer: `#/${dimension}`,
            message: `${candidate.path} ${unestablishedReason(reading, dimension) as string}, so the ${String(group.length)} verdicts for phase ${phase} cannot be shown decorrelated on ${dimension}, and a delegated grant is not satisfied by a dimension a verdict does not state`,
          });
          continue;
        }
        counts.set(reading.value, [...(counts.get(reading.value) ?? []), candidate.path]);
      }
      for (const value of [...counts.keys()].sort()) {
        const paths = counts.get(value) as string[];
        if (paths.length < 2) {
          continue;
        }
        violations.push({
          pointer: `#/${dimension}`,
          message: `${dimension} value ${value} occurs in ${String(paths.length)} of the ${String(group.length)} verdicts for phase ${phase} (${paths.sort().join(", ")}), so the reviews are not decorrelated on ${dimension}`,
        });
      }
    }

    return {
      violations,
      reports:
        violations.length > 0
          ? []
          : [
              `REPORT dual-review-decorrelation ${String(group.length)} verdict(s) for phase ${phase} are distinct on ${DECORRELATION_DIMENSIONS.join(", ")}`,
            ],
    };
  },
};

/* ------------------------------------------------------------------ */
/* The registry                                                         */
/* ------------------------------------------------------------------ */

const registry: DerivedCheck[] = [
  charterModeEnumMatchesModes,
  finalReportFindingParity,
  modeConditionsQuoteGrantedBy,
  modeGateSetsResolve,
  modeIdsAreUnique,
  modeNoUndeclaredDowngrade,
  modeStageOrder,
  planDispatchable,
  planHazardClassesAddressedByResolves,
  planVerificationFirstPresent,
  reportNoFindingsStatement,
  reportParityArithmetic,
  roleIdsAreUnique,
  /* M3-P7 step 6b. Appended, never inserted: `checksFor` filters by declared
     type and sorts by id, and `registeredChecks` returns a copy, so the
     array's position carries no meaning any check reads. That is the property
     the M3-P7 beside M3-P8 pre-pass asks whoever resolves a both-sides-add
     conflict at this tail to confirm before keeping both entries. */
  checklistProbeIdsUnique,
  gateProbesResolve,
  verdictCriteriaComplete,
  verdictDeviationsJudged,
  verdictHazardClassesAddressed,
  /* M3-P7 FIX ROUND 2. Appended for the reason recorded above the M3-P7
     block: position carries no meaning any check reads. */
  checklistFramingIdsUnique,
  verdictFindingReferencesResolve,
  /* M3-P8 step 8. Appended rather than inserted: `checksFor` filters by
     declared type and sorts by id, so this array's order carries no meaning
     any check reads. */
  tuitionTargetExists,
  mechanismRuleEvidenceResolves,
  /* M3-P9 step 3b. Appended rather than inserted, for the reason recorded on
     the M3-P7 block above: `checksFor` filters by declared type and sorts by
     id, and `registeredChecks` returns a copy, so this array's position carries
     no meaning any check reads. */
  dualReviewDecorrelation,
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
    .filter((check) => typesOf(check).includes(type))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every registered check, in registration order. Read by the enumeration. */
export function registeredChecks(): readonly DerivedCheck[] {
  return [...registry];
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
