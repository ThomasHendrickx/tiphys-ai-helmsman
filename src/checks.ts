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
 * `SKIPPED <check-id> no context`. Until kernel 0.2.1 the command then exited
 * nonzero (M3 criterion 4c, delivery/plan/kernel-plan-m3.md:1809), so a
 * cross-document rule could not pass BY NOT RUNNING. Since 0.2.1, by the
 * orchestrator's ruling on the owner's report that consumer history "returns
 * false", `tiphys validate` exits 0 when SKIPPED lines are the only non-pass
 * results: the skip is still PRINTED, so a reader can tell "did not run" from
 * "passed", and `ChecksRun.failed` still reports it, but only
 * `ChecksRun.violated` decides the exit.
 *
 * DR-0013 clause 8: Kind B rules stay HERE and are never encoded as Ajv
 * extensions. The Kind A / Kind B boundary is binding.
 *
 * D-M3-22: a check that belongs in section 2.3's table and is not in it is a
 * PLAN DEFECT to escalate, not a script to add quietly.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

/**
 * SAY WHAT `produced-by` ACTUALLY COMPARED, ON THE GREEN LINE (CR-VS-003).
 *
 * The comparison is `canonicalScalar`: NFKC, whitespace collapse, lowercase,
 * then `!==`. Reproduced at the swept head with one variable changed: two
 * `produced-by` strings naming two different MODELS of one vendor, in the
 * vendor-plus-model-plus-organisation form this project's own reviews use, are
 * certified "distinct on produced-by", green, exit 0. Two models of ONE family
 * pass as decorrelated, which is T-001's own property failing inside the
 * kernel's decorrelation check. The two strings are quoted verbatim in the
 * sweep evidence rather than here, because no vendor model name may appear in
 * the kernel's shipped surface (test/schemas.test.ts:800).
 *
 * WHY THIS IS A SENTENCE AND NOT A FAMILY VOCABULARY, and the reason is a
 * settled one rather than an omission. M4-P10 deferred the family comparison to
 * M4-P11 (delivery/work-history/m4-p10.md:654); M4-P11 DECLINED the mechanism in
 * its own words, "a closed enum of family names was rejected: no such vocabulary
 * can be kept current" (delivery/work-history/m4-p11.md:142). That reason holds
 * and shipping the enum that phase rejected would be reopening it by the back
 * door. What was never done is the OTHER half of the reviewer's own proposal:
 * stop the green line reading as a cross-family assertion. A bundle-level green
 * saying "distinct on produced-by" is read as "two families reviewed this", and
 * nothing here establishes that. So the line now says what it measured.
 *
 * WHAT WOULD CLOSE IT, named rather than left open: a `produced-by-family`
 * field in `schemas/verdict.schema.json`, required, compared instead of the free
 * string, with the vocabulary OPEN (any two distinct values decorrelate) so no
 * list has to be kept current. That is a schema change and a decision record,
 * both outside this fix round's declared files.
 */
export function producedByCaveat(compared: readonly string[]): string {
  return compared.includes("produced-by")
    ? "; produced-by was compared as a canonicalised STRING and not as a model FAMILY, so two models of one " +
        "family are distinct here and this line is not a cross-family assertion"
    : "";
}

export interface LoadedVerdict {
  path: string;
  record: Record<string, unknown>;
}

/**
 * What reading a candidate document's own `kind` produced, in the THREE
 * outcomes that fix round 2 exists to keep apart.
 *
 * THE MECHANISM FIX ROUND 2 CLOSES: `establishField` already separates ABSENT
 * from UNUSABLE from UNCANONICAL, and both selection sites consumed it with a
 * single `!== "established"`, which folds those outcomes back into one silent
 * skip. So "this document declares no type" and "this document declares a type
 * nobody could read" printed as the same fact, and that fact is the determinate
 * negative "not a verdict". Measured at the round-1 head: a third review
 * reading `verdict: FIX-ROUND-NEEDED` whose `kind:` was a one-element YAML list
 * was dropped and `scripts/check-dual-review.mjs` reported that the pair
 * approves. Eight deformations of one refusing document reached that same
 * green, and the table is in delivery/work-history/m4-p10.md's section 13.
 *
 * WHERE THE LINE IS DRAWN, and it is drawn at the PRESENCE OF THE KEY rather
 * than at the validity of its value:
 *
 *   `verdict`     the key is there and canonicalises to the word. A member.
 *   `other`       the document ANSWERED and the answer is not `verdict`. That
 *                 is a mapping carrying no `kind` key at all, a document that
 *                 is not a mapping (a list, a scalar, an empty file), and a
 *                 `kind` that reads as some other word. Each is a determinate
 *                 negative: nothing here claims to be a typed document, or it
 *                 claims to be a different one.
 *   `unreadable`  the key IS there and its reading failed: a list, a map, a
 *                 number, a boolean, null, an empty or whitespace-only string,
 *                 or a string carrying a character outside printable ASCII.
 *                 Writing a `kind` key is the claim to be a typed document, so
 *                 a failed reading of it is a failed claim, not an absent one.
 *
 * WHY NOT REFUSE EVERY DOCUMENT THAT IS NOT A VERDICT. Because a project is
 * entitled to keep other YAML beside its reviews, and a check that errored on
 * it would be unusable. The property is not that every file is a verdict; it is
 * that a file which LOOKS LIKE a verdict and could not be read as one is NAMED.
 *
 * EXPORTED, and that is the other half of the fix. `scripts/check-dual-review.mjs`
 * had its OWN selection rule, a raw `value["kind"] !== "verdict"`, which is a
 * second reader of one fact: it dropped `kind: Verdict` and `kind: "  verdict  "`
 * that this file's canonicalisation admits. Two readers of one fact is the shape
 * this repository's fix-round contract calls fixing the INSTANCE rather than the
 * MECHANISM, and the sibling `establishDelegatedRegime` one screen down was
 * lifted for exactly that reason. There is now one reader.
 */
export type VerdictKindReading =
  | { kind: "verdict"; record: Record<string, unknown> }
  | { kind: "other" }
  | { kind: "unreadable"; found: string };

export function readVerdictKind(value: unknown): VerdictKindReading {
  const record = asRecord(value);
  if (record === undefined) {
    return { kind: "other" };
  }
  const reading = establishField(record, "kind");
  if (reading.kind === "absent") {
    return { kind: "other" };
  }
  if (reading.kind === "unusable" || reading.kind === "uncanonical") {
    /* The vocabulary is the DOCUMENT's, as it is at `establishField`: a reader
       looking at their own YAML is helped by "a list" and by the codepoint and
       position of the character they cannot see, and not by "unestablished". */
    return { kind: "unreadable", found: reading.found };
  }
  if (reading.value !== "verdict") {
    return { kind: "other" };
  }
  return { kind: "verdict", record };
}

/**
 * WHERE A CORPUS WAS READ FROM, carried WITH the corpus and never assumed.
 *
 * THE MECHANISM THIS TYPE EXISTS TO CLOSE (M4-P11 fix round 1, CR-M4P11-001
 * and CR-M4P11-002). One decision was assembled out of TWO SOURCES OF TRUTH:
 * the declaration was read from the git object database by
 * `readReviewFamilies`, and the corpus that is supposed to refute it was read
 * from the WORKING TREE. Two sources means the two halves can be made to
 * disagree, and the actor the check exists to guard against controls the half
 * that is not committed.
 *
 * Measured by the reviewer at ONE commit, three arms, only the working tree
 * changing: all verdicts present gave red exit 1; an UNCOMMITTED `rm` of the
 * contradicting verdict gave not-applicable exit 20 with the exception
 * GRANTED; copying the file back gave red again. `git ls-tree` listed the file
 * throughout and `git show` still read `produced-by: family-b` from it. The
 * declaration was tamper-EVIDENT and the evidence that refutes it was not.
 *
 * So the source is decided ONCE per load and travels with the result, and
 * every sentence a check prints about a corpus ends with the source it was
 * actually read from. A reader can tell a claim about a commit from a claim
 * about somebody's working tree, which is SC-011 applied to the CORPUS rather
 * than to a single check's verdict.
 */
export type VerdictCorpusSource =
  | { kind: "commit"; ref: string; refSha: string; scope: string }
  | { kind: "worktree"; reason: string; scope: string };

/**
 * The corpus, plus the source it was read from. Never one without the other.
 *
 * `unexaminable` IS M4-P10 FIX ROUND 2's CHANNEL, CARRIED ACROSS M4-P11's
 * RESTRUCTURE RATHER THAN DROPPED. M4-P10 added it to the single filesystem
 * loop this phase replaced with a commit arm and a worktree arm, and every
 * caller seeds its violation list from it. A candidate that passed the
 * extension filter and could not be read, did not decode, or declares a `kind`
 * whose reading failed is NOT the determinate answer "not a verdict": it is
 * "nobody knows whether this is a verdict", and dropping it SHRINKS the set the
 * merge predicates reason over, which is the fail-open direction for a
 * predicate that approves when the set is clean.
 */
export interface LoadedVerdictCorpus {
  verdicts: LoadedVerdict[];
  unexaminable: Diagnostic[];
  source: VerdictCorpusSource;
}

/** A verdict document is committed under one of these extensions. */
const VERDICT_FILE_PATTERN = /\.(ya?ml|json)$/i;

/**
 * The project's own paperwork root, and the widest set the FALSIFIERS look at.
 *
 * WHY THIS IS THE BOUNDARY AND NOT THE WHOLE TREE (CR-M4P11-002, and the
 * measurement that decided it). Falsifier 1 asks a question about A PROJECT'S
 * OWN RECORD, so scoping it to `delivery/review/` was defeated by FILE
 * PLACEMENT ALONE: the reviewer committed two `family-b` verdicts under
 * `delivery/evidence/`, which is where this repository actually keeps its only
 * two real verdicts, and the exception was granted anyway.
 *
 * The obvious repair, the whole tree, was tried and MEASURED WRONG. At
 * `122472b` a whole-subtree enumeration finds SEVEN verdict documents here and
 * FIVE of them are `witness/fixtures/dual-review/*.yaml`, deliberately
 * carrying `family-a` and `family-b` because they are the inputs to this very
 * check's own tests. A corpus that counts a test fixture as a project's record
 * would make the exception permanently unusable for any project that vendors
 * fixtures, and would say something false while doing it.
 *
 * `delivery/` is the kernel's OWN declared paperwork root, not a boundary
 * invented here: `REVIEW_DIRECTORY` is under it, `loadDeclaration`
 * (src/gates/release.ts:817) reads phase declarations from under it, and
 * src/gates/scope.ts:565 already treats `delivery/review/` and
 * `delivery/verification/` as the phase-evidence directories. Using it keeps
 * the rule mechanical and placement-based rather than a judgment about which
 * documents look real.
 *
 * WHAT IT STILL DOES NOT REACH, named rather than left to be found: a verdict
 * committed OUTSIDE `delivery/` is invisible to the falsifiers. That residue
 * is smaller than the one it replaces and it is stated here, in the file, so
 * the next reader does not have to re-derive it.
 */
const PAPERWORK_ROOT = "delivery";

/**
 * How to name the set a check just looked at, in the check's own output.
 *
 * SC-011 one scope out: "every verdict this project has committed" and "every
 * file that happens to be sitting in one directory right now" are different
 * claims and must not print the same sentence. This renders a TRAILING
 * parenthetical rather than a clause in the middle of one, so a sentence that
 * already names its subject keeps its shape and gains a provenance tail.
 */
export function describeVerdictCorpusSource(source: VerdictCorpusSource): string {
  return source.kind === "commit"
    ? `(corpus: ${source.scope} read from commit ${source.refSha}, resolved from ${source.ref})`
    : `(corpus: ${source.scope} read from the WORKING TREE because this context has no resolvable git ref: ${source.reason})`;
}

/**
 * How to name the source ONE context document was looked for in.
 *
 * FIX ROUND 2, DV-001. The regime report line used to say "no charter.yaml"
 * about a directory with a `charter.yaml` sitting in it, because the probe had
 * moved to the commit and the sentence had not. A record that names a document
 * and not the SOURCE it was looked for in is unfalsifiable by the person
 * reading it, which is the same SC-011 property `describeVerdictCorpusSource`
 * exists for one scope out.
 */
export function describeContextDocumentSource(source: VerdictCorpusSource): string {
  return source.kind === "commit"
    ? `in commit ${source.refSha}, resolved from ${source.ref}`
    : `in the WORKING TREE, because this context has no resolvable git ref: ${source.reason}`;
}

/**
 * The verdict documents a PAIR decision is made over: `delivery/review/`.
 *
 * TWO ARMS, AND WHICH ONE RAN IS REPORTED RATHER THAN INFERRED.
 *
 * THE COMMIT ARM is taken whenever `<context>` resolves `ref`, and it reads
 * the directory's entries out of the git object database. The filesystem is
 * not consulted at all, so an uncommitted addition, deletion or edit cannot
 * change what this returns. That is the anti-widening rule
 * `readReviewFamilies` and `loadDeclaration` (src/gates/release.ts:817)
 * already apply to a DECLARATION, now applied to the evidence beside it. It
 * closes both directions of the same hole: an uncommitted DELETION can no
 * longer remove a verdict that contradicts a declaration, and an uncommitted
 * ADDITION can no longer manufacture the pair DR-0012 condition 2 requires.
 *
 * THE WORKTREE ARM is taken only when there is no resolvable ref, which is the
 * pre-existing behaviour for a context that is not a git repository at all,
 * and it SAYS SO in every sentence it produces. No exception can be granted on
 * this arm, because `readReviewFamilies` resolves the same ref and returns
 * absent or error when it cannot: with no git there is one source of truth and
 * nothing to disagree.
 *
 * THE SCOPE STAYS `delivery/review/` HERE, and widening it was measured wrong.
 * `headGroupFor` turns this set into the reviews of one `(phase, head)`, and
 * five of the seven verdict documents in this repository's tree are fixtures
 * for this check's own tests. See `PAPERWORK_ROOT` above; the widest set is
 * what the FALSIFIERS use, and it is a different question.
 *
 * A file that does not carry `kind: verdict` is SKIPPED rather than reported,
 * because that directory also holds this project's prose reviews and a check
 * that reddened on a markdown file would be unusable. What is NOT skipped is
 * the directory being unreadable, which the caller turns into a violation:
 * "nothing to compare" and "could not look" are different facts.
 *
 * AND A CANDIDATE THAT COULD NOT BE LOOKED AT IS THE SECOND HALF OF THAT SAME
 * SENTENCE, WHICH THE FIRST ROUND WROTE AND APPLIED AT ONE SITE ONLY. A
 * `.yaml`, `.yml` or `.json` file here has passed the only filter that
 * separates a candidate verdict from a prose review, so bytes that cannot be
 * READ and bytes that do not DECODE are not "this is not a verdict", they are
 * "nobody knows whether this is a verdict". Dropping such a file SHRINKS the
 * set the merge predicates reason over, which is the fail-open direction for a
 * predicate that approves when the set is clean: measured at the reviewed head,
 * a third review reading FIX-ROUND-NEEDED with one malformed line left
 * `verdict-pair-approves` printing that the pair approves. So they are returned
 * as diagnostics and every caller seeds its violation list with them, exactly
 * as `headGroupFor` already does for a sibling with no usable head.
 */
export function loadCommittedVerdicts(
  contextDirectory: string,
  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  if (source.kind !== "commit") {
    return loadVerdictsFromWorktree(contextDirectory, source.reason);
  }
  const refSha = source.refSha;
  /* RECURSIVE SINCE THE DR-0047 SWEEP (CR-VS-002), AND THE ARGUMENT THAT USED
     TO SIT AT `loadPaperworkVerdicts` FOR WHY THIS ONE WAS FLAT IS WITHDRAWN.
     One function had two callers at two depths, so a committed document could
     be INSIDE the corpus that can contradict a single-family declaration and
     OUTSIDE the corpus that can refuse a merge. Measured before the change: two
     APPROVE verdicts at this directory's top level plus a committed THIRD
     verdict for the same phase and head reading FIX-ROUND-NEEDED one directory
     down gave `check-dual-review: green`, exit 0, with the refusal neither
     counted nor mentioned; and with BOTH verdicts one directory down the gate
     reported `0 verdict document(s)` and not-applicable while `git ls-files`
     listed them. `ls-tree` without `-r` yields the SUBTREE'S NAME, which
     `VERDICT_FILE_PATTERN` discards, so the drop was silent by construction,
     which is the fail-open direction for a predicate that approves when the set
     is clean. Depth is now a property of the LISTING FUNCTION's one contract
     rather than of which caller reached it. */
  const listed = listCommittedTree(contextDirectory, refSha, REVIEW_DIRECTORY, true);
  if (!listed.ok) {
    return { ok: false, reason: listed.reason };
  }
  return readCommittedVerdicts(contextDirectory, refSha, listed.paths, source);
}

/**
 * Every verdict document committed anywhere under `delivery/` at one commit.
 *
 * THE FALSIFIERS' CORPUS, AND A DIFFERENT QUESTION FROM THE PAIR'S. See
 * `PAPERWORK_ROOT` for why the boundary is the paperwork root rather than one
 * directory or the whole tree.
 *
 * COMMIT ONLY, WITH NO WORKTREE FALLBACK, and that is not an omission. This is
 * reached only from `singleFamilyException`, which is reached only when a
 * declaration was successfully read out of a commit. There is no arm where a
 * declaration exists and a commit does not, so a worktree fallback here would
 * be code that cannot run, which is the dead-arm shape this file already
 * refused once at `classifyEntry`.
 */
function loadPaperworkVerdicts(
  contextDirectory: string,
  ref: string,
  refSha: string,
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  const source: VerdictCorpusSource = {
    kind: "commit",
    ref,
    refSha,
    scope: `every verdict document under ${PAPERWORK_ROOT}/`,
  };
  /* `recursive` HERE AND, SINCE THE DR-0047 SWEEP, ON THE PAIR CORPUS TOO. The
     paragraph that stood here said the pair's directory is flat by convention
     and that recursing it would be a silent behaviour change on the arm that
     already worked. CR-VS-002 measured what the asymmetry cost instead: a
     verdict one directory down was inside THIS corpus and outside that one, so
     a committed review refusing the head under audit could contradict a
     declaration and could not refuse a merge. Both corpora now read the same
     depth; the boundaries still differ, and that difference is the real one.
     THE LISTING
     ITSELF IS THE SAME FUNCTION the pair corpus uses (FIX ROUND 2, DV-002):
     two listing idioms maintained side by side is what let one of them be
     wrong in a nested context while the other was right. */
  const listed = listCommittedTree(contextDirectory, refSha, PAPERWORK_ROOT, true);
  if (!listed.ok) {
    return {
      ok: false,
      reason:
        `the verdict documents under ${PAPERWORK_ROOT}/ in ${refSha} could not be enumerated, so the ` +
        `record that would refute a single-family declaration could not be established: ${listed.reason}`,
    };
  }
  return readCommittedVerdicts(contextDirectory, refSha, listed.paths, source);
}

/**
 * List one committed directory, as paths relative to the CONTEXT DIRECTORY.
 *
 * ONE LISTING IDIOM FOR BOTH CORPORA (FIX ROUND 2, DV-002), AND THE PATHSPEC
 * FORM IS THE LOAD-BEARING HALF. Fix round 1 replaced one `readdirSync` with
 * TWO different git idioms: the falsifiers' corpus listed
 * `<sha> -- ./<dir>/` and the pair corpus listed the tree-ish `<sha>:./<dir>`.
 * Those are not two spellings of one question. `git ls-tree` applies the
 * CURRENT DIRECTORY as an implicit pathspec, so a tree-ish listing run from a
 * context directory that is a SUBDIRECTORY of its repository is filtered
 * against a prefix the named tree's own entries do not carry, and it returns
 * NOTHING with exit 0. Measured, one commit, cwd = a context directory nested
 * one level inside its repository, `delivery/review/` holding two committed
 * verdicts:
 *
 *   git cat-file -t $S:./delivery/review              -> tree, exit 0
 *   git ls-tree -z --name-only $S:./delivery/review   -> EMPTY, exit 0
 *   git ls-tree -z --name-only $S -- ./delivery/review/
 *                                                     -> both names, exit 0
 *
 * An empty listing is then indistinguishable from an absent directory, so
 * "could not enumerate" became "there are none", the pair corpus came back
 * empty, and a committed pair sharing one `produced-by` reported
 * NOT-APPLICABLE on a conditional gate instead of red. The kernel's own
 * repository could not see it, because the registry command runs the script
 * with `.` at the repository root; every consumer whose tiphys context is not
 * its repository root does see it.
 *
 * The pathspec form's output is relative to the current directory, which is
 * the context directory, which is what `readCommittedVerdicts` then hands to
 * `git show ${refSha}:./${path}`. The listing and the read therefore resolve
 * against the SAME base, which is the property that broke.
 *
 * ABSENT, REGULAR AND UNLISTABLE ARE THREE ANSWERS, exactly as `classifyEntry`
 * gives three on the worktree arm. `git cat-file -t` is what separates them:
 * a missing path is an empty corpus, a `blob` where a directory was expected
 * is the same fact the worktree arm reports as "is a regular file, not a
 * directory", and a listing that fails for any other reason has not reached a
 * verdict and must not report one (M2-C-3).
 */
function listCommittedTree(
  contextDirectory: string,
  refSha: string,
  directory: string,
  recursive: boolean,
): { ok: true; paths: string[] } | { ok: false; reason: string } {
  const typed = gitIn(["cat-file", "-t", `${refSha}:./${directory}`], contextDirectory);
  if (!typed.ok) {
    /* ABSENT, OR COULD NOT LOOK, AND THEY ARE NOT THE SAME ANSWER. Until this
       round a `cat-file -t` that failed for ANY reason returned an empty
       corpus, so an object database that could not be read reported the same
       thing as a project that keeps no `delivery/` at all, which is the
       "could not look" reported as "looked and found nothing" shape the
       sibling loader's comment already named. Absence is established by a
       SECOND probe that does not mention the path: if the commit object
       itself is readable, the only thing the first probe can have been
       reporting is that the path is not in it. This is the same fail-closed
       rule `readCommittedVerdicts` twenty lines down already applies to a
       blob it was told about and cannot read. */
    const commitReadable = gitIn(["cat-file", "-t", refSha], contextDirectory);
    if (!commitReadable.ok) {
      return {
        ok: false,
        reason:
          `${refSha} could not be read in ${contextDirectory}, so whether ${directory}/ is committed there ` +
          `was not established and an empty corpus must not be reported: ${commitReadable.reason}`,
      };
    }
    return { ok: true, paths: [] };
  }
  const type = typed.stdout.trim();
  if (type !== "tree") {
    return {
      ok: false,
      reason:
        `${refSha}:./${directory} is a ${type}, not a directory, so the committed verdicts cannot be enumerated`,
    };
  }
  const listed = gitIn(
    [
      "ls-tree",
      ...(recursive ? ["-r"] : []),
      "-z",
      "--name-only",
      refSha,
      "--",
      `./${directory}/`,
    ],
    contextDirectory,
  );
  if (!listed.ok) {
    return {
      ok: false,
      reason: `${refSha}:./${directory} could not be listed: ${listed.reason}`,
    };
  }
  return { ok: true, paths: listed.stdout.split("\0").filter((name) => name !== "") };
}

/**
 * Read a list of committed paths and keep the ones that are verdicts.
 *
 * `-z` ON EVERY LISTING THAT FEEDS THIS IS LOAD-BEARING. Without it git QUOTES
 * a path carrying a quote, a backslash or a non-ASCII byte, and the quoted
 * spelling is not the path `git show` wants, so exactly the documents whose
 * names are unusual would drop out of the corpus. Dropping a document from the
 * corpus is the fail-open direction.
 *
 * `${refSha}:./${path}` AND NOT `${refSha}:${path}`, for the reason
 * `readReviewFamilies` already gives further down: without the leading `./`
 * git resolves the path against the REPOSITORY ROOT, so a context directory
 * nested inside a larger repository would silently read the outer
 * repository's documents. With `./` the listing and the read are both relative
 * to the directory the caller named, so they cannot disagree about which tree
 * they are describing.
 */
function readCommittedVerdicts(
  contextDirectory: string,
  refSha: string,
  paths: readonly string[],
  source: VerdictCorpusSource,
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  const documents: CorpusDocument[] = [];
  for (const path of [...paths].sort()) {
    if (!VERDICT_FILE_PATTERN.test(path)) {
      continue;
    }
    const shown = gitIn(["show", `${refSha}:./${path}`], contextDirectory);
    if (!shown.ok) {
      /* A path the same commit's own listing named and the same commit cannot
         produce is not a document to skip, it is a corpus that could not be
         read. M2-C-3: this has not reached a verdict, so it must not report
         one. */
      return {
        ok: false,
        reason:
          `${refSha}:./${path} is listed in ${refSha} and could not be read, so the committed verdict corpus is ` +
          `incomplete and no merge precondition can be decided over it: ${shown.reason}`,
      };
    }
    documents.push({ path: join(contextDirectory, path), body: shown.stdout });
  }
  const selected = selectVerdicts(documents);
  return { ok: true, verdicts: selected.verdicts, unexaminable: selected.unexaminable, source };
}

/**
 * Read a context document AT THE SOURCE THE DECISION IS BEING MADE FROM.
 *
 * FIX ROUND 1, AND IT IS THE FOURTH SITE OF THE MECHANISM the reviewers found
 * at the first. Their finding was that the CORPUS was read from disk while the
 * declaration was read from a commit. The derivation for it (D2 and D3 in the
 * work history) turned up the same split one document further out and WORSE:
 * `establishDelegatedRegime` decides whether a delegated merge grant is in
 * force at all, and it read `charter.yaml` and `assurance-modes.yaml` off
 * DISK, while `readReviewFamilies` read THE SAME `charter.yaml` out of the
 * object database.
 *
 * Measured, one commit, one working-tree edit of one word:
 *
 *   committed `delivery-mode: full` (merge-authority delegated-under-conditions)
 *   with a pair sharing produced-by         -> red, exit 1
 *   the SAME commit, `delivery-mode: direct-pr` written into the working tree
 *   and never committed                     -> GREEN, exit 0, and the record
 *                                              prints "mode direct-pr declares
 *                                              merge-authority owner, which is
 *                                              not a delegated grant"
 *
 * That is not the exception being bought, it is the ENTIRE decorrelation
 * requirement being switched off, by an edit no commit records and no diff
 * shows. It is the same mechanism as CR-M4P11-001 and it is why this round
 * fixes the mechanism rather than the corpus.
 *
 * The worktree arm is the pre-existing behaviour and is unchanged: with no
 * resolvable ref there is one source of truth and nothing to disagree.
 */
function readContextDocumentAt(
  contextDirectory: string,
  relativePath: string,
  source: VerdictCorpusSource,
): { ok: true; value: unknown; path: string } | { ok: false; reason: string } {
  if (source.kind !== "commit") {
    return readContextDocument(contextDirectory, relativePath);
  }
  const path = join(contextDirectory, relativePath);
  const shown = gitIn(["show", `${source.refSha}:./${relativePath}`], contextDirectory);
  if (!shown.ok) {
    return {
      ok: false,
      reason: `${source.refSha}:./${relativePath} could not be read: ${shown.reason}`,
    };
  }
  const decoded = decodeDocument(shown.stdout, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  return { ok: true, value: decoded.value, path };
}

/**
 * Is a context document present AT THE SOURCE the decision is read from?
 *
 * SEPARATE FROM READING IT, because "absent" and "present and unreadable" are
 * different facts with different verdicts one screen down, exactly as
 * `classifyEntry` keeps them apart on the worktree arm.
 */
function contextDocumentPresentAt(
  contextDirectory: string,
  relativePath: string,
  source: VerdictCorpusSource,
): boolean {
  if (source.kind !== "commit") {
    return classifyEntry(join(contextDirectory, relativePath)).kind !== "absent";
  }
  const typed = gitIn(
    ["cat-file", "-t", `${source.refSha}:./${relativePath}`],
    contextDirectory,
  );
  return typed.ok && typed.stdout.trim() === "blob";
}

/**
 * Resolve, ONCE, the source every document of one decision is read from.
 *
 * EXPORTED because the two merge-precondition checks each resolve it at the
 * top of their own run and hand the SAME value to the regime reader, the
 * declaration reader and both corpus loaders. One resolution is what makes
 * "the halves disagree" unrepresentable rather than merely unlikely.
 */
export function resolveCorpusSource(
  contextDirectory: string,
  ref = "HEAD",
): VerdictCorpusSource {
  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
  return resolved.ok
    ? { kind: "commit", ref, refSha: resolved.stdout.trim(), scope: REVIEW_DIRECTORY }
    : { kind: "worktree", reason: resolved.reason, scope: REVIEW_DIRECTORY };
}

/**
 * One document read out of a corpus, however it was obtained.
 *
 * THE TWO ARMS CONVERGE HERE AND NOT LATER. Reading is what differs between a
 * commit and a working tree; SELECTING what counts as a verdict is one rule,
 * and two copies of a selection rule is how the halves of one decision drift
 * apart, which is the mechanism this whole section exists to remove. A third
 * copy lived in `scripts/check-dual-review.mjs` and has been deleted in favour
 * of calling `loadCommittedVerdicts` itself.
 */
interface CorpusDocument {
  path: string;
  body: string;
}

/**
 * The one selection rule, applied to every document an arm produced.
 *
 * MATERIALISED RATHER THAN STREAMED, and the bound is stated rather than left
 * to be discovered: the widest corpus is the candidate `.yaml`, `.yml` and
 * `.json` blobs under `delivery/`, measured at 103 files and 8953667 bytes in
 * this repository at `79ce63b`, and it is read only when a single-family
 * declaration has already been established.
 */
function selectVerdicts(
  documents: readonly CorpusDocument[],
): { verdicts: LoadedVerdict[]; unexaminable: Diagnostic[] } {
  const verdicts: LoadedVerdict[] = [];
  const unexaminable: Diagnostic[] = [];
  for (const { path, body } of documents) {
    const decoded = decodeDocument(body, path);
    if (!decoded.ok) {
      unexaminable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and did not decode, so whether it is a verdict refusing this head could not be established, and a merge check that could not look at one document must not report the rest of them clean: ${decoded.reason}`,
      });
      continue;
    }
    /* CANONICAL HERE TOO, AND THE REASON IS THE SAME ONE ONE LAYER OUT. This
       `===` decides MEMBERSHIP OF THE GROUP the decorrelation decision is made
       over, so a lookalike character in `kind` does not produce a wrong
       comparison, it silently removes a document from the comparison. With
       three verdicts, two of them sharing a model family, dropping one of the
       correlated pair leaves two distinct ones and a green run. That is the
       same fail-open outcome as the reported finding, reached by making the
       check look at less rather than by making it compare wrongly.

       Canonicalising ADMITS more documents, which is the fail-closed direction
       here: more verdicts in the group means more chances to find a shared
       value, never fewer. A file that is not a verdict at all still fails this
       test, because no canonical form turns a prose review into `verdict`. */
    /* THE ONE READER, AND FIX ROUND 2 IS THAT IT IS ONE READER WITH THREE
       OUTCOMES RATHER THAN A BOOLEAN. `readVerdictKind` is documented at its
       own definition; what matters here is that `unreadable` is a DIAGNOSTIC
       and `other` is a skip, because a document whose `kind` key is present and
       whose reading FAILED has not said it is not a verdict, it has said
       nothing that could be read. The skip below is now reached only by a
       document that answered. */
    const kindReading = readVerdictKind(decoded.value);
    if (kindReading.kind === "unreadable") {
      unexaminable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and declares a kind field that could not be read as a word (it is ${kindReading.found}), so whether it is a verdict refusing this head could not be established, and a merge check that could not read one document's own type must not report the rest of them clean`,
      });
      continue;
    }
    if (kindReading.kind !== "verdict") {
      continue;
    }
    verdicts.push({ path, record: kindReading.record });
  }
  return { verdicts, unexaminable };
}

/** The pre-existing arm, for a context that is not a git repository. */
function loadVerdictsFromWorktree(
  contextDirectory: string,
  why: string,
): ({ ok: true } & LoadedVerdictCorpus) | { ok: false; reason: string } {
  const source: VerdictCorpusSource = {
    kind: "worktree",
    reason: why,
    scope: REVIEW_DIRECTORY,
  };
  const directory = join(contextDirectory, REVIEW_DIRECTORY);
  /* `classifyEntry` HAS NO `directory` KIND: a directory lands in `irregular`,
     which is the kind that means "present and not safe to OPEN AS A FILE". So
     the shape here is the one `listWitnessSpecFiles` already uses: classify to
     rule out absent and unexaminable, then LIST, and read the classification
     again only to explain a listing failure. Testing for a kind that does not
     exist would have been dead code that always took the error arm. */
  const entry = classifyEntry(directory);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, verdicts: [], unexaminable: [], source };
  }
  if (entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  let names: string[];
  try {
    /* `recursive` SO THE TWO ARMS READ THE SAME DEPTH (CR-VS-002). The commit
       arm lists the whole subtree, and an arm that read one level would make
       WHICH ARM RAN decide whether a refusing verdict one directory down is
       part of the corpus. That is the same one-rule-two-readings shape this
       section already removed for the selection rule. `recursive` yields paths
       relative to `directory`, which is what `join` below already expects, and
       a nested name still has to pass `VERDICT_FILE_PATTERN`. */
    names = readdirSync(directory, { recursive: true }).map((name) => String(name));
  } catch (error) {
    if (entry.kind === "regular") {
      return {
        ok: false,
        reason: `${directory} is a regular file, not a directory, so the committed verdicts cannot be enumerated`,
      };
    }
    return { ok: false, reason: `${directory} could not be listed: ${String(error)}` };
  }
  const documents: CorpusDocument[] = [];
  const unreadable: Diagnostic[] = [];
  for (const name of names.sort()) {
    if (!VERDICT_FILE_PATTERN.test(name)) {
      continue;
    }
    const path = join(directory, name);
    const read = readOperatorPath(path);
    if (!read.ok) {
      /* M4-P10 FIX ROUND 2, REAPPLIED ON THIS ARM. The commit arm one screen up
         refuses the whole corpus when a path its own listing named cannot be
         produced, which is stricter than a diagnostic and is right there: the
         same commit named it. Here the directory was listed from a working tree
         that can change under the read, so the fail-closed form is the one
         M4-P10 wrote, a named candidate carried out to every caller's violation
         list rather than a silent `continue`. */
      unreadable.push({
        pointer: "#/kind",
        message: `${path} sits under ${REVIEW_DIRECTORY} and could not be read, so whether it is a verdict refusing this head could not be established, and a merge check that could not look at one document must not report the rest of them clean: ${read.reason}`,
      });
      continue;
    }
    documents.push({ path, body: read.body });
  }
  const selected = selectVerdicts(documents);
  return {
    ok: true,
    verdicts: selected.verdicts,
    unexaminable: [...unreadable, ...selected.unexaminable],
    source,
  };
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

/* ------------------------------------------------------------------ */
/* The head, and what it is allowed to be (M4-P10)                      */
/* ------------------------------------------------------------------ */

/**
 * A commit sha as `schemas/verdict.schema.json` spells it.
 *
 * RESTATED HERE RATHER THAN BORROWED FROM THE SCHEMA, and that is not
 * duplication by accident. Nothing on the shipped path validates the SIBLING
 * documents this check loads, which is recorded at `dualReviewDecorrelation`
 * below, so a sibling carrying an abbreviated `head` reaches the grouping code
 * whatever the schema says. A check that trusted the schema for this would put
 * a short sha in its own group of one and never compare it to anything, which
 * is the fail-open direction.
 */
const FULL_SHA = /^[0-9a-f]{40}$/;

/** One verdict's group key, or the reason it does not have one. */
type HeadKey = { ok: true; value: string } | { ok: false; message: string };

/**
 * Establish the head a verdict claims to review.
 *
 * TWO REFUSALS, AND THEY ARE DIFFERENT FACTS. An UNESTABLISHED `head` is the
 * ordinary absent-or-unusable-or-uncanonical reading every other dimension in
 * this file gets, with its own sentence from `unestablishedReason`. A head that
 * IS established and is not forty hex digits is a SECOND SPELLING of a fact
 * some other document may state in full, and it is refused on its own terms,
 * because no canonical form reconciles an abbreviation with the forty-character
 * sha it abbreviates without resolving both against a repository this check is
 * never given.
 *
 * Case never reaches the pattern as a problem: `establishField` folds it, so an
 * upper-case sha and a lower-case one are already ONE key by the time the test
 * runs. That is the direction the hazard row asks for, two spellings of one
 * head becoming one group rather than two.
 */
function headKeyOf(record: Record<string, unknown> | undefined, where: string): HeadKey {
  const reading = establishField(record, "head");
  if (reading.kind !== "established") {
    return {
      ok: false,
      message: `${where} ${unestablishedReason(reading, "head") as string}, so the reviews cannot be grouped by the head they reviewed, and a delegated grant is not satisfied by a review that does not say what it reviewed`,
    };
  }
  if (!FULL_SHA.test(reading.value)) {
    return {
      ok: false,
      message: `${where} declares head ${reading.value}, which is not forty lowercase hexadecimal digits; an abbreviated sha is a second spelling of one head and would form its own group of one, which is never compared to anything`,
    };
  }
  return { ok: true, value: reading.value };
}

/** The committed verdicts for one (phase, head), plus every sibling refused a key. */
interface HeadGroup {
  members: LoadedVerdict[];
  unkeyed: Diagnostic[];
}

/**
 * Select the verdicts for one `(phase, head)` out of a directory's committed set.
 *
 * WHY A SIBLING WITH NO USABLE HEAD BECOMES A VIOLATION RATHER THAN BEING
 * SKIPPED, which is the whole reason this is a function and not a `filter`.
 * Dropping such a sibling silently SHRINKS the group, and a shrinking group is
 * exactly the fail-open shape this file has already been bitten by twice, at
 * `loadCommittedVerdicts` and at the `phase` canonicalisation. With three
 * verdicts, two of them sharing a model family, giving the third an unreadable
 * head would leave a compared pair of two and a green run. So every same-phase
 * sibling that cannot be keyed is REPORTED as a violation and the remaining
 * members are still compared: a reader is owed both facts.
 */
function headGroupFor(
  verdicts: readonly LoadedVerdict[],
  phaseKey: string,
  headKey: string,
): HeadGroup {
  const members: LoadedVerdict[] = [];
  const unkeyed: Diagnostic[] = [];
  for (const candidate of verdicts) {
    /* BOTH SIDES CANONICAL. `phaseKey` is already canonical; the sibling's is
       read through the same function so the two are compared in one form
       rather than one canonical value against one raw one.

       AND THE TWO ARMS ARE SPLIT, WHICH THE FIRST ROUND LEFT JOINED. `phase` is
       half of the join key, so a sibling whose phase cannot be ESTABLISHED is
       unkeyable for exactly the reason a sibling with no usable head is, and
       the paragraph above says what that costs. It was folded into one `||`
       with the determinate case, so a verdict declaring no phase fell out
       silently while one declaring a DIFFERENT phase fell out correctly.
       Measured at the reviewed head through the shipped CLI: a refusing third
       review with its `phase:` line deleted left both merge checks printing
       their affirmative REPORT lines over the remaining two. */
    const phaseReading = establishField(candidate.record, "phase");
    if (phaseReading.kind !== "established") {
      unkeyed.push({
        pointer: "#/phase",
        message: `${candidate.path} ${unestablishedReason(phaseReading, "phase") as string}, so it cannot be placed in or out of the group for phase ${phaseKey}, and a sibling that cannot be keyed must not shrink the set the delegated grant is read off`,
      });
      continue;
    }
    if (phaseReading.value !== phaseKey) {
      continue;
    }
    const key = headKeyOf(candidate.record, candidate.path);
    if (!key.ok) {
      unkeyed.push({ pointer: "#/head", message: key.message });
      continue;
    }
    if (key.value === headKey) {
      members.push(candidate);
    }
  }
  return { members, unkeyed };
}

/* ------------------------------------------------------------------ */
/* ANCHORING THE CORPUS TO THE COMMIT UNDER AUDIT (CR-VS-001)           */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THIS SECTION CLOSES, STATED ONE LEVEL UP FROM THE FINDING:
 * a gate whose verdict is about EVIDENCE THE CALLER SUPPLIED, with no check
 * that the evidence is about the thing being audited.
 *
 * `headGroupFor` above groups by the head THE VERDICT DOCUMENTS THEMSELVES
 * DECLARE. Before this section nothing compared that value to the commit the
 * gate was running against, and nothing established that it named a commit at
 * all. Both arms were reproduced end to end through the shipped script:
 *
 *   ARM A  two decorrelated APPROVE verdicts naming
 *          deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, which
 *          `git cat-file -t` reports as not an object, in a repository whose
 *          HEAD is a real commit          -> GREEN, 2 units, exit 0
 *   ARM B  the same verdicts plus a further commit of work no verdict
 *          mentions                       -> GREEN, exit 0
 *
 * So ONE committed approving pair turned this gate green for that phase at
 * every later head, indefinitely, on evidence about one old commit. That is
 * T-009's own rule ("a gate result is evidence only for the configuration it
 * ran under") failing inside the gate that carries DR-0012's merge grant.
 *
 * THE ASYMMETRY THAT MAKES THE FIX SOUND, and it is the whole of the design.
 * The AUDITED head comes from the CALLER: the gate runner passes `--head` from
 * the pull-request event (the registry entry now declares `parameters: [head]`,
 * the same mechanism `scope` has always used), and with no `--head` it is the
 * commit the context's own `HEAD` resolves to, which is what the checkout put
 * there. The DECLARED head comes from a document an agent under review wrote.
 * One of those two is a fact about the run and the other is a claim in the
 * evidence, and the claim must be measured against the fact rather than
 * replacing it.
 */

/** Resolve one ref to a full commit sha inside a context directory. */
export function resolveCommitIn(
  contextDirectory: string,
  ref: string,
): { ok: true; sha: string } | { ok: false; reason: string } {
  /* `^{commit}` AND NOT A BARE `rev-parse`. A bare `rev-parse` of a forty-hex
     string that is in no object database ECHOES IT BACK and exits 0, so it
     cannot tell a commit from a sha somebody typed. The peel is what makes
     this a question about the object database rather than about the syntax of
     the argument, and it also refuses a tag or a tree that is not a commit.
     `--end-of-options` keeps a ref that begins with `-` from being read as a
     flag. */
  const resolved = gitIn(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    contextDirectory,
  );
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  const sha = resolved.stdout.trim();
  if (!FULL_SHA.test(sha)) {
    return {
      ok: false,
      reason: `git rev-parse ${ref}^{commit} in ${contextDirectory} produced ${sha}, which is not a full commit sha`,
    };
  }
  return { ok: true, sha };
}

/**
 * The commit a merge gate's verdict is ABOUT.
 *
 * THREE OUTCOMES AND NOT TWO, for the same reason `RegimeOutcome` has three:
 * "there is no commit to anchor to" and "the anchor could not be established"
 * are different facts. `unanchored` is reached only on the WORKTREE arm with
 * no `--head`, which is a context that is not a git repository at all, and
 * every sentence built from it says so rather than implying an anchor that was
 * never taken.
 */
export type AuditedHead =
  | { kind: "anchored"; head: string; how: string }
  | { kind: "unanchored"; reason: string }
  | { kind: "error"; reason: string };

export function resolveAuditedHead(
  contextDirectory: string,
  requested: string | undefined,
  source: VerdictCorpusSource,
): AuditedHead {
  if (requested !== undefined) {
    const resolved = resolveCommitIn(contextDirectory, requested);
    if (!resolved.ok) {
      /* M2-C-3. A caller that named a head this repository cannot produce has
         not told the gate which commit to judge, and a gate that carried on
         would be judging whatever the documents felt like naming, which is the
         state this whole section exists to end. `error`, never green and never
         not-applicable: nothing has been evaluated. */
      return {
        kind: "error",
        reason:
          `--head ${requested} does not resolve to a commit in ${contextDirectory}, so the commit under audit ` +
          `was not established and no merge verdict can be reached over evidence that names its own subject: ${resolved.reason}`,
      };
    }
    return { kind: "anchored", head: resolved.sha, how: `--head ${requested}` };
  }
  if (source.kind === "commit") {
    return { kind: "anchored", head: source.refSha, how: `${source.ref}, resolved in ${contextDirectory}` };
  }
  return { kind: "unanchored", reason: source.reason };
}

/* ------------------------------------------------------------------ */
/* ANCESTRY, BECAUSE A VERDICT CANNOT NAME THE COMMIT THAT CARRIES IT   */
/* ------------------------------------------------------------------ */

/**
 * THE MECHANISM THIS SECTION CLOSES, and it is the anchor above written one
 * relation too narrow: AN ANCHOR EXPRESSED AS EQUALITY WHERE THE RELATION THAT
 * CAN ACTUALLY HOLD IS ANCESTRY PLUS A CONSTRAINT ON WHAT CHANGED IN BETWEEN.
 *
 * `partitionByAuditedHead` compared the declared head to the audited one with
 * `===`, and no real flow can satisfy that. A reviewer reads commit X and
 * writes a verdict naming X; COMMITTING that verdict produces X+1; CI audits
 * X+1, or a merge commit above it. The declared head is therefore ALWAYS a
 * strict ancestor of the audited one, so under equality every real run reported
 * not-applicable. Measured on the branch that introduced the anchor, at
 * 5867a918cda809f7c5d4bc366fc7940458c140c0: the verdicts declared that commit,
 * the gate audited its DIRECT CHILD 0ddd06a73d49c1910449d01303bc9c2579f5f492,
 * and the record read not-applicable, exit 21, "is a review of other work and
 * is not evidence about this head".
 *
 * That is the same cannot-do-its-job shape one status along from the defect the
 * anchor fixed: "green forever once fed" became "never green", and a gate that
 * cannot go green is as uninformative as one that cannot go red (T-008's own
 * rule, applied to the other pole).
 *
 * WHAT MAKES THE RELAXATION SAFE, AND IT IS THE WHOLE DESIGN. Ancestry ALONE
 * would restore the original defect wearing a different hat: an approving pair
 * lands, and every later descendant carries it, including descendants full of
 * unreviewed source. So ancestry is admitted only when the TREES agree
 * everywhere except the project's own paperwork root. A verdict is evidence
 * about the SHIPPED CONTENT it read, and if that content is byte-identical in
 * the audited commit then the audited commit is the thing the reviewer
 * approved, whatever paperwork was committed on top of it.
 *
 * IT IS A CLAIM ABOUT THE TWO TREES, NOT ABOUT EACH INTERVENING COMMIT, and
 * the difference is stated rather than left to be discovered. `git diff
 * --name-only <declared>..<audited>` compares the endpoints, so a commit that
 * adds `src/x.ts` and a later one that removes it leave no entry and are
 * admitted, where a per-commit enumeration would refuse them. That case is
 * admitted DELIBERATELY: the audited tree's shipped content is then exactly
 * what the reviewers read, which is the property the gate is protecting. A
 * per-commit walk would refuse an ordinary revert-before-merge and buy nothing,
 * because there is no shipped byte in the audited tree that no verdict covers.
 *
 * `--no-renames` IS LOAD-BEARING. With rename detection on (git's default for
 * `git diff` since 2.9) a rename from `src/a.ts` to `delivery/b.md` prints the
 * DESTINATION ONLY, so the deletion of a source file would be invisible and the
 * gap would read as paperwork. Disabling it prints both sides.
 */

/** How a verdict's declared head stands to the commit under audit. */
export type HeadRelation =
  /** The verdict names the audited commit itself. */
  | { kind: "same" }
  /** A strict ancestor whose gap to the audited commit is paperwork only. */
  | { kind: "evidence-only-ancestor"; changed: string[] }
  /** A strict ancestor, but shipped content changed in between. */
  | { kind: "shipped-change"; shipped: string[] }
  /** A real commit here that the audited commit is an ancestor OF. */
  | { kind: "descendant" }
  /** A real commit here on neither side of the audited one. */
  | { kind: "unrelated" }
  /** Forty hex digits naming no commit in this repository. */
  | { kind: "unresolvable"; reason: string }
  /** git could not answer, so the relation is not known. Never admitted. */
  | { kind: "undetermined"; reason: string }
  /**
   * The verdict carries no `head` key at all. KERNEL 0.2.1 (DR-0053): the
   * schema no longer requires the field, because it judged every verdict a
   * consumer wrote before the field existed, so absence is now a well-formed
   * document and the ADMISSION rule lives here. Never admitted.
   */
  | { kind: "no-head" };

/**
 * Does this verdict declare no head AT ALL?
 *
 * KERNEL 0.2.1 (DR-0053, DR-0054). ABSENCE ONLY, and the narrowness is the
 * point. A document with no `head` key is the shape every verdict written
 * before M4-P10 has, so it is HISTORY: it is excluded from every merge corpus
 * by name and is never admitted, and it no longer reddens a gate by merely
 * existing. A document whose `head` is PRESENT and unusable (null, empty, an
 * abbreviation, a list) is a document that tried to state its head and stated
 * it wrongly, which the schema still refuses, so it keeps the M4-P10 treatment
 * in `partitionByAuditedHead` and `headGroupFor`: kept, refused, red.
 */
export function declaresNoHead(record: Record<string, unknown> | undefined): boolean {
  return record === undefined || !("head" in record);
}

/**
 * Ask git whether `candidate` is an ancestor of `descendant`.
 *
 * `merge-base --is-ancestor` ANSWERS WITH AN EXIT CODE, and 1 is an ANSWER
 * while anything else is a FAILURE. `gitIn` folds every nonzero status into
 * `ok: false`, which would make "no" indistinguishable from "git could not
 * run", and that collapse is the fail-open direction here: an unanswerable
 * question read as "not an ancestor" is merely noisy, but read as "ancestor"
 * it would admit anything. Three outcomes, never two.
 */
function isAncestorIn(
  contextDirectory: string,
  candidate: string,
  descendant: string,
): { kind: "yes" } | { kind: "no" } | { kind: "undetermined"; reason: string } {
  const run = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", "--end-of-options", candidate, descendant],
    { cwd: contextDirectory, encoding: "utf8" },
  );
  if (run.error !== undefined) {
    return {
      kind: "undetermined",
      reason: `git merge-base --is-ancestor ${candidate} ${descendant} could not be run: ${String(run.error)}`,
    };
  }
  if (run.status === 0) {
    return { kind: "yes" };
  }
  if (run.status === 1) {
    return { kind: "no" };
  }
  return {
    kind: "undetermined",
    reason:
      `git merge-base --is-ancestor ${candidate} ${descendant} exited ${String(run.status)}: ` +
      `${(run.stderr ?? "").replace(/\s+/g, " ").trim()}`,
  };
}

/**
 * The paperwork prefix a changed path must carry to count as evidence, spelled
 * for THIS context directory rather than for the repository root.
 *
 * `git diff --name-only` prints paths relative to the REPOSITORY ROOT, and the
 * context directory need not be that root. Reading `delivery/` out of a nested
 * context would then classify the repository root's `delivery/` as this
 * project's paperwork and a nested `sub/delivery/` as shipped content, which is
 * backwards. `rev-parse --show-prefix` gives the offset, so the comparison is
 * made in the repository's own spelling. The diff is deliberately NOT narrowed
 * to the context directory: a change outside it is still unreviewed content in
 * the audited commit, and narrowing would hide it.
 */
function evidencePrefixIn(
  contextDirectory: string,
): { ok: true; prefix: string } | { ok: false; reason: string } {
  const shown = gitIn(["rev-parse", "--show-prefix"], contextDirectory);
  if (!shown.ok) {
    return { ok: false, reason: shown.reason };
  }
  return { ok: true, prefix: `${shown.stdout.trim()}${PAPERWORK_ROOT}/` };
}

/**
 * Place one declared head against the commit under audit.
 *
 * EQUAL PASSES, unchanged, and it is checked first so a context git cannot be
 * questioned about still answers the one relation that needs no git at all.
 *
 * A DESCENDANT IS REFUSED, and it has its own sentence rather than being folded
 * into "not an ancestor". A verdict naming a commit BELOW the audited one is a
 * review of work the audited commit does not contain, which is the fail-open
 * direction stated backwards: the reviewers saw more than is being merged, and
 * nothing here establishes that what they approved about the extra work says
 * anything about the tree without it.
 */
export function relateDeclaredHead(
  contextDirectory: string,
  declared: string,
  auditedHead: string,
): HeadRelation {
  if (declared === auditedHead) {
    return { kind: "same" };
  }
  const resolved = resolveCommitIn(contextDirectory, declared);
  if (!resolved.ok) {
    return { kind: "unresolvable", reason: resolved.reason };
  }
  const ancestor = isAncestorIn(contextDirectory, declared, auditedHead);
  if (ancestor.kind === "undetermined") {
    return { kind: "undetermined", reason: ancestor.reason };
  }
  if (ancestor.kind === "no") {
    const other = isAncestorIn(contextDirectory, auditedHead, declared);
    if (other.kind === "undetermined") {
      return { kind: "undetermined", reason: other.reason };
    }
    return other.kind === "yes" ? { kind: "descendant" } : { kind: "unrelated" };
  }
  const prefix = evidencePrefixIn(contextDirectory);
  if (!prefix.ok) {
    return { kind: "undetermined", reason: prefix.reason };
  }
  /* `-z` IS LOAD-BEARING FOR THE SAME REASON `--no-renames` IS, and it was
     measured rather than reasoned. Without it git QUOTES any path outside the
     printable ASCII set, so a paperwork file whose name carries one non-ASCII
     character arrives wrapped in double quotes with octal escapes, which does
     not start with `delivery/` and is classified as shipped content. Measured
     on git 2.43.0, one repository, one commit, one flag changed: the default
     form printed the quoted spelling and the `-z` form printed the real path.

     The failure that would cause is fail-CLOSED, so it admits nothing it should
     not; it is fixed anyway because refusing a green a project is entitled to is
     the cannot-go-green shape this whole section exists to end, one filename
     narrower. `-z` also makes the separator NUL rather than newline, which is
     why the split changed with it: a newline split over `-z` output would read
     the whole list as one path. */
  const diff = gitIn(
    ["diff", "-z", "--no-renames", "--name-only", `${declared}..${auditedHead}`, "--"],
    contextDirectory,
  );
  if (!diff.ok) {
    return { kind: "undetermined", reason: diff.reason };
  }
  const changed = diff.stdout.split("\0").map((line) => line.trim()).filter((line) => line !== "");
  const shipped = changed.filter((path) => !path.startsWith(prefix.prefix));
  return shipped.length === 0
    ? { kind: "evidence-only-ancestor", changed }
    : { kind: "shipped-change", shipped };
}

/** A verdict admitted to the audited corpus, and the relation that admitted it. */
export interface AdmittedVerdict {
  path: string;
  declared: string;
  relation: HeadRelation;
}

/** One verdict that is not about the audited commit, and why it is not. */
export interface OffHeadVerdict {
  path: string;
  declared: string;
  /** Which route refused it. Printed, never summarised to a boolean. */
  relation: HeadRelation;
}

/** The corpus split by the commit under audit. */
export interface HeadPartition {
  onHead: LoadedVerdict[];
  /**
   * The same verdicts, with the relation that admitted each one.
   *
   * CARRIED SEPARATELY RATHER THAN ATTACHED TO `onHead`, because `onHead` is
   * the set the checks are RUN OVER and its element type is what every other
   * caller of the loader consumes. This is the DISCLOSURE half: a green reached
   * through ancestry and a green reached through equality are different facts,
   * and a gate that printed one sentence for both would be the unfalsifiable
   * record `describeVerdictCorpusSource` exists to stop, one relation along.
   */
  admitted: AdmittedVerdict[];
  offHead: OffHeadVerdict[];
  /**
   * Verdicts whose own `head` could not be established at all, as DOCUMENTS
   * and as the sentences that name them.
   *
   * BOTH SHAPES, because the two callers need different halves and deriving one
   * from the other by matching on a message prefix is the string-parsing shape
   * this file refuses everywhere else. A caller that keeps them in the corpus
   * needs the documents; a caller that reports them needs the sentences.
   */
  unkeyed: Diagnostic[];
  unkeyedVerdicts: LoadedVerdict[];
}

/**
 * Split a loaded corpus into the verdicts that are about the audited commit
 * and the ones that are not.
 *
 * FIVE REFUSAL ROUTES, AND THEY ARE STRUCTURALLY DIFFERENT RATHER THAN ONE
 * SHAPE FIVE TIMES, which is what makes them members of a class instead of
 * instances of a finding:
 *
 *   RESOLUTION   the declared head is not a commit in this repository. The
 *                document is evidence about an object nobody can produce.
 *   SHIPPED GAP  the declared head IS an ancestor, and shipped content changed
 *                between it and the audited commit. Unreviewed work is riding
 *                in on a review of something else.
 *   DESCENDANT   the declared head is BELOW the audited commit. The reviewers
 *                read a tree the audited commit does not contain.
 *   UNRELATED    a real commit on neither side. A review of another line.
 *   UNDETERMINED git could not place it. Never admitted, because a relation
 *                nobody established must not read as the one that passes.
 *
 * ADMISSION IS TWO ROUTES AND THEY ARE ALSO PRINTED: the declared head IS the
 * audited commit, or it is an ancestor whose whole gap is paperwork. See
 * `relateDeclaredHead` for why the second is safe and for what it deliberately
 * does not refuse.
 *
 * Every refusal leaves the verdict out of the audited group and IS PRINTED with
 * the route it took, because a document silently dropped from a merge
 * corpus is the fail-open direction this file has already been bitten by at
 * `loadCommittedVerdicts`, at the `phase` canonicalisation and at
 * `headGroupFor`. A reader is owed the fact that the corpus holds two
 * approving reviews of something else.
 */
export function partitionByAuditedHead(
  contextDirectory: string,
  verdicts: readonly LoadedVerdict[],
  auditedHead: string,
): HeadPartition {
  const onHead: LoadedVerdict[] = [];
  const admitted: AdmittedVerdict[] = [];
  const offHead: OffHeadVerdict[] = [];
  const unkeyed: Diagnostic[] = [];
  const unkeyedVerdicts: LoadedVerdict[] = [];
  for (const candidate of verdicts) {
    /* KERNEL 0.2.1 (DR-0053, DR-0054). A verdict with NO head key is EXCLUDED
       BY NAME, never kept to be refused. Until 0.2.1 it was kept in the corpus
       so the derived check would redden on it, which was right while the schema
       required the field and wrong once measured against a real consumer: all
       49 of pulse's committed verdicts predate the field, so every later run of
       this gate would have been red on history it cannot change. Excluded is
       still never admitted: under a review budget (`--base`, which the gate
       runner always supplies) a dual-tier change whose reviews carry no head
       has fewer than two admitted verdicts and is red, and the exclusion line
       names each document. Without `--base` (the bare workflow step) a corpus
       holding ONLY head-less verdicts is not-applicable with each one named,
       which is the treatment a corpus of reviews of other commits already
       gets (CR-VS-001); that arm is weaker than 0.2.0 and is stated, not
       hidden. A same-phase sibling with no head still reddens the group
       through `headGroupFor`, which is deliberately unchanged. */
    if (declaresNoHead(candidate.record)) {
      offHead.push({ path: candidate.path, declared: "", relation: { kind: "no-head" } });
      continue;
    }
    /* KERNEL 0.2.1 (DR-0055, as the orchestrator ruled after pulse was found
       mid-phase on 0.2.0): ADMISSION DOES NOT READ THE STAMP. Every rule this
       gate applies is applied to every verdict, stamped or not, so an old or
       missing stamp can neither exclude a verdict nor excuse one from a rule.
       A 0.2.0 verdict, which carries a head and no stamp, is admitted exactly
       when it meets the rules. The stamp decides only which schema rules
       `tiphys validate` holds a document to, for history. */
    const key = headKeyOf(candidate.record, candidate.path);
    if (!key.ok) {
      unkeyed.push({ pointer: "#/head", message: key.message });
      unkeyedVerdicts.push(candidate);
      continue;
    }
    const relation = relateDeclaredHead(contextDirectory, key.value, auditedHead);
    if (relation.kind === "same" || relation.kind === "evidence-only-ancestor") {
      onHead.push(candidate);
      admitted.push({ path: candidate.path, declared: key.value, relation });
      continue;
    }
    offHead.push({ path: candidate.path, declared: key.value, relation });
  }
  return { onHead, admitted, offHead, unkeyed, unkeyedVerdicts };
}

/** How many shipped paths to name before the sentence stops being readable. */
const NAMED_SHIPPED_PATHS = 5;

/** One operator-facing line per verdict the audit excluded, naming its route. */
export function describeOffHeadVerdicts(
  offHead: readonly OffHeadVerdict[],
  auditedHead: string,
): string[] {
  return [...offHead]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) => {
      const tail = `it is not evidence about the commit under audit ${auditedHead}`;
      if (entry.relation.kind === "no-head") {
        return (
          `${entry.path} declares no head, so it does not say which commit it reviewed and is never admitted ` +
          `toward a merge; a verdict written before the field existed is history (DR-0054) and ${tail}`
        );
      }
      const head = `${entry.path} declares head ${entry.declared}, which`;
      if (entry.relation.kind === "unresolvable") {
        return `${head} does not resolve to a commit in this repository at all, so it is evidence about an object nobody can produce and ${tail}`;
      }
      if (entry.relation.kind === "shipped-change") {
        const shipped = entry.relation.shipped;
        const named = shipped.slice(0, NAMED_SHIPPED_PATHS).join(", ");
        const more =
          shipped.length > NAMED_SHIPPED_PATHS
            ? ` and ${String(shipped.length - NAMED_SHIPPED_PATHS)} more`
            : "";
        return (
          `${head} is an ancestor of the commit under audit ${auditedHead}, but ${String(shipped.length)} path(s) ` +
          `outside ${PAPERWORK_ROOT}/ differ between them (${named}${more}), so shipped work no verdict reviewed ` +
          `is riding in on a review of something else and ${tail}`
        );
      }
      if (entry.relation.kind === "descendant") {
        return `${head} is a DESCENDANT of the commit under audit ${auditedHead}, so the reviewers read a tree this commit does not contain and ${tail}`;
      }
      if (entry.relation.kind === "undetermined") {
        return `${head} could not be placed relative to the commit under audit ${auditedHead}, so whether it reviews this work is unknown and ${tail}: ${entry.relation.reason}`;
      }
      return `${head} is a commit in this repository and is neither the commit under audit ${auditedHead} nor an ancestor of it, so it is a review of other work and ${tail}`;
    });
}

/** One operator-facing line per verdict the audit ADMITTED, naming its route. */
export function describeAdmittedVerdicts(
  admitted: readonly AdmittedVerdict[],
  auditedHead: string,
): string[] {
  return [...admitted]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((entry) =>
      entry.relation.kind === "evidence-only-ancestor"
        ? `${entry.path} declares head ${entry.declared}, an ancestor of the commit under audit ${auditedHead} whose ` +
          `${String(entry.relation.changed.length)} differing path(s) are all under ${PAPERWORK_ROOT}/, so the shipped ` +
          `content it reviewed is the shipped content of this commit`
        : `${entry.path} declares head ${entry.declared}, which IS the commit under audit`,
    );
}

/* ------------------------------------------------------------------ */
/* The merge regime, read once and shared by both merge-precondition checks */
/* ------------------------------------------------------------------ */

/**
 * What reading the declared merge regime produced.
 *
 * THREE OUTCOMES, NOT TWO, AND THAT IS THE WHOLE REASON THIS EXISTS AS A TYPE.
 * "The regime is not a delegated grant" and "the regime could not be
 * established" are different facts with different consequences: the first is a
 * REPORT, because there is genuinely no precondition to satisfy, and the second
 * is a VIOLATION, because a merge check that cannot determine the regime must
 * never report that nothing was required (SC-011).
 */
type RegimeOutcome =
  | { kind: "delegated" }
  | { kind: "report"; lines: string[] }
  | { kind: "violation"; pointer: string; message: string };

/**
 * Read the declared delivery mode's merge authority out of a context directory.
 *
 * LIFTED OUT OF `dual-review-decorrelation` BY M4-P10, AND THE LIFT IS THE
 * POINT RATHER THAN A TIDY-UP. M4-P10 adds a SECOND check that applies exactly
 * where DR-0012's delegated grant applies (`verdict-pair-approves`, condition
 * 2). Copying the regime reading into it would have produced two readers of one
 * fact, which is the shape this repository's fix-round contract calls fixing the
 * INSTANCE rather than the MECHANISM: a later correction to one reader would
 * leave the other fail-open, and the three sites already repaired inside this
 * block (recorded in the comments below) are the evidence that such corrections
 * happen.
 *
 * Every message below is the one `dual-review-decorrelation` shipped, byte for
 * byte, except that the two REPORT lines now name the CALLING check. That is
 * deliberate: a reader who sees `REPORT verdict-pair-approves ... declares no
 * delivery mode` must be able to tell which guard declined to run.
 */
function establishDelegatedRegime(
  checkId: string,
  contextDirectory: string,
  phase: string,
  source: VerdictCorpusSource,
): RegimeOutcome {
  const charterPresent = contextDocumentPresentAt(contextDirectory, CHARTER_DOCUMENT, source);
  if (!charterPresent) {
    /* THE SENTENCE NAMES THE SOURCE, AND THE CLAIM ABOUT THE MERGE GATE NAMES
       THE READER BOTH SIDES SHARE (FIX ROUND 2, DV-001). Fix round 1 moved
       this PRESENCE probe to the commit and left the merge gate's refusal on
       disk, so a `charter.yaml` written into a working tree and committed
       nowhere passed the gate's refusal, reached this arm, and was reported as
       "no charter.yaml" while the file sat in the directory the same line
       names. The gate now refuses through `missingRegimeDocument` below,
       which is this same probe, so the second half of this sentence is a
       property of one shared function rather than a claim about another
       program that has to be maintained by hand. */
    return {
      kind: "report",
      lines: [
        `REPORT ${checkId} ${contextDirectory} declares no delivery mode ` +
          `(no ${CHARTER_DOCUMENT} ${describeContextDocumentSource(source)}), so the verdicts for phase ` +
          `${phase} were NOT evaluated against a merge-authority regime; the merge gate ` +
          `scripts/check-dual-review.mjs refuses such a directory outright, through the same presence ` +
          `reader and therefore against the same source`,
      ],
    };
  }
  const charter = readContextDocumentAt(contextDirectory, CHARTER_DOCUMENT, source);
  if (!charter.ok) {
    return {
      kind: "violation",
      pointer: "#/produced-by",
      message: `the charter is present and could not be read, so the declared mode's merge-authority is unknown and decorrelation could not be evaluated: ${charter.reason}`,
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
      kind: "violation",
      pointer: "#/produced-by",
      message: `${charter.path} ${unestablishedReason(modeReading, "delivery-mode") as string}, so no mode's merge-authority can be looked up and whether the delegated grant applies to phase ${phase} could not be established`,
    };
  }
  const modeId = modeReading.value;
  const modesDocument = readContextDocumentAt(contextDirectory, MODES_DOCUMENT, source);
  if (!modesDocument.ok) {
    return {
      kind: "violation",
      pointer: "#/produced-by",
      message: `${charter.path} declares delivery mode ${String(modeId)} and ${MODES_DOCUMENT} could not be read, so that mode's merge-authority is unknown and decorrelation could not be evaluated: ${modesDocument.reason}`,
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
      kind: "violation",
      pointer: "#/produced-by",
      message: `${charter.path} declares delivery mode ${String(modeId)}, which ${modesDocument.path} does not define, so its merge-authority is unknown`,
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
      kind: "violation",
      pointer: "#/produced-by",
      message: `${modesDocument.path} ${unestablishedReason(authorityReading, "merge-authority") as string} for mode ${modeId}, so whether the delegated grant applies to phase ${phase} could not be established, and a merge check that cannot determine the regime must not report that no decorrelation is required`,
    };
  }
  const authority = authorityReading.value;
  if (authority !== DELEGATED_MERGE_AUTHORITY) {
    return {
      kind: "report",
      lines: [
        `REPORT ${checkId} mode ${String(modeId)} declares merge-authority ${authority}, ` +
          `which is not a delegated grant, so no decorrelation is required of the reviews of phase ${phase}`,
      ],
    };
  }

  return { kind: "delegated" };
}

/* ------------------------------------------------------------------ */
/* review-families: DR-0038's declared single-family exception (M4-P11) */
/* ------------------------------------------------------------------ */

/** The charter field DR-0038's declaration lives in (M4-D-28). */
export const REVIEW_FAMILIES_FIELD = "review-families";

/** The document that carries it. */
export const CHARTER_DOCUMENT = "charter.yaml";

/**
 * The documents that say WHICH merge-authority regime is in force.
 *
 * MOVED HERE FROM `scripts/check-dual-review.mjs` (FIX ROUND 2, DV-001). The
 * script held its own copy of this list AND its own presence probe, and the
 * probe read the WORKING TREE while `establishDelegatedRegime` read the
 * COMMIT. Two probes of one fact against two sources is the mechanism this
 * phase has now paid for twice: each answered correctly about its own source,
 * so nothing ever reported a disagreement, and an uncommitted `charter.yaml`
 * took the gate from error to GREEN on a correlated committed pair.
 */
export const REGIME_DOCUMENTS = [CHARTER_DOCUMENT, MODES_DOCUMENT];

/**
 * The first regime document that is NOT present at the source a decision over
 * this context would be made from, or `undefined` when both are.
 *
 * WHY THE REFUSAL LIVES AT THE MERGE GATE AND THE REPORT LIVES IN THE CHECK,
 * unchanged from M3-P9 and restated because this round moved the probe: the
 * derived check runs on ANY verdict with ANY context, and M3-P7's verdict
 * contexts carry a plan and a work history and no charter, so a check that
 * reddened on an absent charter reddened eight of that phase's tests. The
 * check therefore REPORTS, and `scripts/check-dual-review.mjs`, which is the
 * command DR-0012's grant runs through, refuses. What changed is that the
 * refusal and the report are now ONE probe with two callers, so they cannot
 * answer about different sources.
 *
 * THE SOURCE IS A PARAMETER, not resolved here, so a caller that has already
 * resolved one (the gate script resolves it when it loads the corpus) refuses
 * against the SAME commit it read the verdicts from rather than a second
 * `rev-parse` that could land elsewhere.
 */
export function missingRegimeDocument(
  contextDirectory: string,
  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
): { document: string; source: VerdictCorpusSource; reason: string } | undefined {
  for (const document of REGIME_DOCUMENTS) {
    if (!contextDocumentPresentAt(contextDirectory, document, source)) {
      return {
        document,
        source,
        reason:
          `${join(contextDirectory, document)} does not exist ${describeContextDocumentSource(source)}, so ` +
          `the declared mode's merge-authority is unknown and no decorrelation verdict can be reached; a ` +
          `merge check that cannot determine the regime reports error, never green`,
      };
    }
  }
  return undefined;
}

/**
 * Where a declaration was read from, so a claim nobody can refute is at least
 * ATTRIBUTABLE AND DATED.
 *
 * This is the honest half of DR-0038's third constraint. Two falsifiers below
 * catch a project whose own record contradicts the declaration. NEITHER of
 * them catches a project that HAS a second family available and has simply
 * never used it, and nothing inside the record can: the record holds what was
 * used, not what was reachable. So the countermeasure for that residue is
 * provenance rather than detection, on the src/gates/release.ts:1028 pattern,
 * and the gap is stated here rather than left to be found.
 */
export interface ReviewFamiliesProvenance {
  /** The path inside the commit, as `git show` was asked for it. */
  path: string;
  /** The ref the declaration was read from, as the caller spelled it. */
  ref: string;
  /** That ref resolved to a commit sha. */
  refSha: string;
  /** sha256 of the exact blob bytes the declaration was decoded from. */
  sha256: string;
}

/**
 * What reading `review-families` produced.
 *
 * THREE OUTCOMES AND NOT TWO, for the reason `RegimeOutcome` gives one screen
 * up: "no declaration" and "a declaration that could not be established" are
 * different facts. The first leaves DR-0012 condition 1 applying unchanged,
 * which is a REPORT-nothing. The second is an ERROR, because a check that
 * cannot establish whether an exception applies must never decide that it does
 * not apply and carry on (M2-C-3).
 */
export type ReviewFamiliesReading =
  | { kind: "absent" }
  | { kind: "error"; reason: string }
  | {
      kind: "declared";
      /** Canonicalised, deduplicated by construction, sorted. Compared. */
      families: string[];
      /** The operator's own spelling, in document order. Printed. */
      declaredAs: string[];
      reason: string;
      provenance: ReviewFamiliesProvenance;
    };

function gitIn(
  args: string[],
  cwd: string,
): { ok: true; stdout: string } | { ok: false; reason: string } {
  /* The buffer is raised because a charter is an operator document with no
     declared size bound, and a truncated read would decode as a DIFFERENT
     document rather than as a failure. */
  const run = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.error !== undefined) {
    return { ok: false, reason: `git ${args.join(" ")} could not be run: ${String(run.error)}` };
  }
  if (run.status !== 0) {
    return {
      ok: false,
      reason: `git ${args.join(" ")} exited ${String(run.status)}: ${(run.stderr ?? "").replace(/\s+/g, " ").trim()}`,
    };
  }
  return { ok: true, stdout: run.stdout ?? "" };
}

/**
 * Is a `review-families` key present in the WORKING TREE's charter?
 *
 * Asked for exactly one purpose: to tell "this project makes no declaration"
 * apart from "this project makes a declaration that is not committed". The
 * first is absence and changes nothing. The second is an ERROR, because the
 * whole value of the exception over a silent one is that a reader can check
 * it, and an uncommitted claim is one nothing can be checked against.
 */
function treeDeclaresReviewFamilies(contextDirectory: string): boolean {
  const tree = readContextDocument(contextDirectory, CHARTER_DOCUMENT);
  if (!tree.ok) {
    return false;
  }
  const record = asRecord(tree.value);
  return record !== undefined && REVIEW_FAMILIES_FIELD in record;
}

/**
 * Read DR-0038's declaration OUT OF THE GIT OBJECT DATABASE, never out of the
 * working tree.
 *
 * WHY THE COMMITTED BLOB IS THE ONLY ONE THAT COUNTS. This is the anti-widening
 * rule the scope auditor and `loadDeclaration` (src/gates/release.ts:817) both
 * already apply, one condition along: a phase must not be able to switch off,
 * inside its own working tree, the condition that would otherwise have refused
 * its merge. A declaration read from disk is one an implementer can add,
 * merge under, and delete, leaving a merged head whose record says the
 * cross-family requirement was met.
 *
 * `HEAD:./charter.yaml` AND NOT `HEAD:charter.yaml`, and the difference is not
 * cosmetic. A path without the leading `./` is resolved against the repository
 * ROOT, so a context directory that happens to sit inside a larger repository
 * (which every fixture staged under a checkout does) would silently read that
 * repository's charter instead of its own. With `./` git resolves relative to
 * the directory it was run in, which is the one the caller named.
 */
export function readReviewFamilies(
  contextDirectory: string,
  ref = "HEAD",
): ReviewFamiliesReading {
  const resolved = gitIn(["rev-parse", `${ref}^{commit}`], contextDirectory);
  const relativePath = `./${CHARTER_DOCUMENT}`;
  if (!resolved.ok) {
    if (treeDeclaresReviewFamilies(contextDirectory)) {
      return {
        kind: "error",
        reason:
          `${join(contextDirectory, CHARTER_DOCUMENT)} declares ${REVIEW_FAMILIES_FIELD} in the working tree and ` +
          `${contextDirectory} has no resolvable git ref ${ref}, so the declaration cannot be attributed to a ` +
          `commit; an exception read from an uncommitted file is error, never permission (${resolved.reason})`,
      };
    }
    return { kind: "absent" };
  }
  const refSha = resolved.stdout.trim();
  const shown = gitIn(["show", `${refSha}:${relativePath}`], contextDirectory);
  if (!shown.ok) {
    if (treeDeclaresReviewFamilies(contextDirectory)) {
      return {
        kind: "error",
        reason:
          `${join(contextDirectory, CHARTER_DOCUMENT)} declares ${REVIEW_FAMILIES_FIELD} in the working tree and ` +
          `${refSha}:${relativePath} could not be read, so the declaration is not committed and cannot be ` +
          `attributed; an exception read from an uncommitted file is error, never permission (${shown.reason})`,
      };
    }
    return { kind: "absent" };
  }
  const body = shown.stdout;
  const sha256 = createHash("sha256").update(body).digest("hex");
  const provenance: ReviewFamiliesProvenance = {
    path: CHARTER_DOCUMENT,
    ref,
    refSha,
    sha256,
  };
  const decoded = decodeDocument(body, join(contextDirectory, CHARTER_DOCUMENT));
  if (!decoded.ok) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} does not decode, so whether it declares ${REVIEW_FAMILIES_FIELD} could not be established: ${decoded.reason}`,
    };
  }
  const charter = asRecord(decoded.value);
  if (charter === undefined || !(REVIEW_FAMILIES_FIELD in charter)) {
    return { kind: "absent" };
  }
  const declaration = asRecord(charter[REVIEW_FAMILIES_FIELD]);
  if (declaration === undefined) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} carries ${REVIEW_FAMILIES_FIELD} and it is not a map, so no declared family set can be read from it`,
    };
  }
  const reasonReading = establishField(declaration, "reason");
  if (reasonReading.kind !== "established") {
    return {
      kind: "error",
      reason:
        `${refSha}:${relativePath} ${unestablishedReason(reasonReading, `${REVIEW_FAMILIES_FIELD}.reason`) as string}; ` +
        `narrowing an owner-reserved merge condition costs a stated reason, so a declaration without one is error`,
    };
  }
  const available = declaration["available"];
  if (!Array.isArray(available) || available.length === 0) {
    return {
      kind: "error",
      reason: `${refSha}:${relativePath} declares ${REVIEW_FAMILIES_FIELD}.available as ${Array.isArray(available) ? "an empty list" : "not a list"}, so no family set can be read from it`,
    };
  }
  const families: string[] = [];
  const declaredAs: string[] = [];
  for (let index = 0; index < available.length; index += 1) {
    const entry = available[index];
    /* Each entry goes through the SAME canonical form a verdict's
       `produced-by` goes through, because the two are compared to each other
       below. A declaration canonicalised one way and an observation
       canonicalised another is the fix-round-2 mechanism with two documents
       instead of one. */
    const reading = establishField({ entry }, "entry");
    if (reading.kind !== "established") {
      return {
        kind: "error",
        reason: `${refSha}:${relativePath} ${unestablishedReason(reading, `${REVIEW_FAMILIES_FIELD}.available[${String(index)}]`) as string}, so the declared family set cannot be compared with what the verdicts carry`,
      };
    }
    if (families.includes(reading.value)) {
      /* REFUSED RATHER THAN DEDUPLICATED, and the direction is why. The
         exception applies when exactly ONE family is declared, so collapsing
         `[Anthropic, anthropic]` to one entry would turn a document that reads
         as two families into a single-family declaration. That is the only
         canonicalisation in this file that would be fail-OPEN, so it is a
         refusal instead. */
      return {
        kind: "error",
        reason: `${refSha}:${relativePath} lists ${String(entry)} in ${REVIEW_FAMILIES_FIELD}.available more than once once canonicalised, so how many families it declares cannot be established`,
      };
    }
    families.push(reading.value);
    declaredAs.push(String(entry));
  }
  return {
    kind: "declared",
    families: [...families].sort(),
    declaredAs,
    reason: declaration["reason"] as string,
    provenance,
  };
}

/** One line naming where a declaration came from, for a detail or a report. */
export function reviewFamiliesProvenanceLine(provenance: ReviewFamiliesProvenance): string {
  return (
    `declaration ${provenance.path} read from ${provenance.ref} ` +
    `(${provenance.refSha}), blob sha256 ${provenance.sha256}`
  );
}

/**
 * The commit that FIRST added `review-families` to the charter, in the history
 * of `refSha`, with its parents.
 *
 * KERNEL 0.2.1 (DR-0054). "First" is the earliest commit, in topological order
 * over the FULL history of `./charter.yaml`, whose charter carries the key. A
 * declaration that was added, removed and added again is therefore dated from
 * its FIRST appearance, which is the WIDER scope and so the stricter one: more
 * verdicts are read, never fewer. The key is detected by DECODING each blob,
 * never by a textual search, because a comment or a quoted string mentioning
 * the word is not a declaration.
 *
 * A SHALLOW HISTORY IS THE FAIL-CLOSED DIRECTION, and it is stated because it
 * is the case a CI checkout produces. At a shallow boundary git reports no
 * parents, so the boundary commit reads as the declaration's origin with
 * nothing before it, and EVERY verdict in the tree is read, which is 0.2.0's
 * whole-corpus behaviour. A shallow clone can make this check stricter than
 * DR-0054 asks; it cannot make it more permissive.
 */
function firstDeclarationCommit(
  contextDirectory: string,
  refSha: string,
): { ok: true; sha: string; parents: string[] } | { ok: false; reason: string } {
  const logged = gitIn(
    [
      "log",
      "--reverse",
      "--topo-order",
      "--full-history",
      "--format=%H %P",
      refSha,
      "--",
      `./${CHARTER_DOCUMENT}`,
    ],
    contextDirectory,
  );
  if (!logged.ok) {
    return {
      ok: false,
      reason:
        `the history of ${CHARTER_DOCUMENT} in ${refSha} could not be read, so the commit that first declared ` +
        `${REVIEW_FAMILIES_FIELD} is unknown and which verdicts the declaration can be held to cannot be decided: ${logged.reason}`,
    };
  }
  for (const line of logged.stdout.split("\n")) {
    const [sha, ...parents] = line.trim().split(/\s+/).filter((word) => word !== "");
    if (sha === undefined) {
      continue;
    }
    const shown = gitIn(["show", `${sha}:./${CHARTER_DOCUMENT}`], contextDirectory);
    if (!shown.ok) {
      /* The commit that DELETED the charter is in this log too, and it carries
         no charter to read. That is an answer about that commit, not a failure
         to read the history. */
      continue;
    }
    const decoded = decodeDocument(shown.stdout, join(contextDirectory, CHARTER_DOCUMENT));
    if (!decoded.ok) {
      continue;
    }
    const record = asRecord(decoded.value);
    if (record !== undefined && REVIEW_FAMILIES_FIELD in record) {
      return { ok: true, sha, parents };
    }
  }
  return {
    ok: false,
    reason:
      `${CHARTER_DOCUMENT} declares ${REVIEW_FAMILIES_FIELD} at ${refSha} and no commit in its history was found ` +
      `whose ${CHARTER_DOCUMENT} carries it, so the declaration cannot be dated and which verdicts it can be held ` +
      `to cannot be decided`,
  };
}

/** Every blob id committed under `delivery/` at one commit, keyed by context-relative path. */
function paperworkBlobIds(
  contextDirectory: string,
  sha: string,
): { ok: true; ids: Map<string, string> } | { ok: false; reason: string } {
  const ids = new Map<string, string>();
  const typed = gitIn(["cat-file", "-t", `${sha}:./${PAPERWORK_ROOT}`], contextDirectory);
  if (!typed.ok) {
    /* Absent, or could not look: the same two answers `listCommittedTree`
       separates, separated the same way. */
    const readable = gitIn(["cat-file", "-t", sha], contextDirectory);
    return readable.ok
      ? { ok: true, ids }
      : { ok: false, reason: `${sha} could not be read in ${contextDirectory}: ${readable.reason}` };
  }
  const listed = gitIn(["ls-tree", "-r", "-z", sha, "--", `./${PAPERWORK_ROOT}/`], contextDirectory);
  if (!listed.ok) {
    return { ok: false, reason: `${sha}:./${PAPERWORK_ROOT} could not be listed: ${listed.reason}` };
  }
  for (const entry of listed.stdout.split("\0")) {
    /* `<mode> SP <type> SP <object> TAB <path>`, and the path is relative to
       the directory git ran in, which is the context directory, exactly as
       `listCommittedTree` relies on. */
    const tab = entry.indexOf("\t");
    if (tab < 0) {
      continue;
    }
    const [, type, object] = entry.slice(0, tab).split(" ");
    if (type === "blob" && object !== undefined) {
      ids.set(join(contextDirectory, entry.slice(tab + 1)), object);
    }
  }
  return { ok: true, ids };
}

/**
 * Keep only the verdicts committed AT OR AFTER the commit that first declared
 * `review-families` (DR-0054).
 *
 * "COMMITTED BEFORE" IS DECIDED BY CONTENT, NOT BY PATH OR DATE. A verdict is
 * history exactly when its blob, byte for byte, was already committed under
 * `delivery/` in a parent of the declaration commit. So a document edited after
 * the declaration is read (its bytes are new), a document renamed without an
 * edit is not (its bytes are old), and a document added IN the declaration
 * commit is read, because "at or after" includes the commit itself. Dates are
 * not used at all: author and committer dates are writable by the author and a
 * scope decided by them would be decided by the party being checked.
 */
function scopeToDeclaration(
  contextDirectory: string,
  refSha: string,
  verdicts: readonly LoadedVerdict[],
): { ok: true; verdicts: LoadedVerdict[]; sentence: string } | { ok: false; reason: string } {
  const declaration = firstDeclarationCommit(contextDirectory, refSha);
  if (!declaration.ok) {
    return declaration;
  }
  const current = paperworkBlobIds(contextDirectory, refSha);
  if (!current.ok) {
    return { ok: false, reason: current.reason };
  }
  const history = new Set<string>();
  for (const parent of declaration.parents) {
    const before = paperworkBlobIds(contextDirectory, parent);
    if (!before.ok) {
      return {
        ok: false,
        reason:
          `the tree before the declaration (${parent}, parent of ${declaration.sha}) could not be read, so which ` +
          `verdicts are history cannot be decided: ${before.reason}`,
      };
    }
    for (const id of before.ids.values()) {
      history.add(id);
    }
  }
  const kept: LoadedVerdict[] = [];
  let historical = 0;
  for (const candidate of verdicts) {
    const id = current.ids.get(candidate.path);
    /* An id this listing cannot produce for a document the same commit's
       loader just read is kept, not dropped: dropping is the fail-open
       direction for a falsifier. */
    if (id !== undefined && history.has(id)) {
      historical += 1;
      continue;
    }
    kept.push(candidate);
  }
  return {
    ok: true,
    verdicts: kept,
    sentence:
      `(scope, DR-0054: the ${String(kept.length)} verdict document(s) committed at or after ${declaration.sha}, ` +
      `the commit that first declared ${REVIEW_FAMILIES_FIELD}; ${String(historical)} committed before it are ` +
      `history and were not read)`,
  };
}

/** What the single-family arm concluded about one committed corpus. */
export type SingleFamilyOutcome =
  | { kind: "not-declared" }
  | { kind: "error"; reason: string }
  | { kind: "refused"; violations: Diagnostic[] }
  | {
      kind: "exempt";
      family: string;
      reading: Extract<ReviewFamiliesReading, { kind: "declared" }>;
      reports: string[];
    };

/**
 * DR-0038's exception, and its two falsifiers, over one committed corpus.
 *
 * THE EXCEPTION NARROWS EXACTLY ONE DIMENSION. `produced-by` stops being
 * required to differ. `framing` and `review-contract` are untouched, because
 * T-007's whole finding is that model decorrelation and CONTRACT decorrelation
 * are different properties: a single-family environment still has two framings
 * and two contracts available to it, so relaxing those would be relaxing
 * something the environment does not force.
 *
 * FALSIFIER 1, CONTRADICTION BY THE CORPUS. If the project's own committed
 * verdicts carry two or more distinct canonicalised `produced-by` values, the
 * declaration is contradicted by the project's own record and this is RED. A
 * project that has demonstrably used two cannot claim one.
 *
 * FALSIFIER 2, THE NAME MUST MATCH. A verdict whose `produced-by` canonicalises
 * to anything other than the declared family is RED. Without this, a
 * declaration could name a family nothing in the record uses and still buy the
 * relaxation.
 *
 * THE SCOPE IS THE COMMITTED CORPUS FROM THE DECLARATION ONWARD, NOT THE ONE
 * (phase, head) GROUP. "This project has one family available" is a claim
 * about the project, so the widest set of its own verdicts the claim can
 * honestly be held to is what can refute it. Scoping the falsifiers to the
 * group under review would let a project declare one family while its current
 * work used three, provided the two reviews in front of the check agreed.
 *
 * KERNEL 0.2.1 WITHDREW THE WHOLE-HISTORY HALF OF THAT SCOPE (DR-0054, owner
 * decision): "Tiphys judges current and future work, never history." A verdict
 * committed before the commit that first added the declaration was written
 * when no claim existed, so it cannot contradict one, and a project whose past
 * shows two families may now declare one. `scopeToDeclaration` is the whole
 * change. What DR-0054 keeps: any verdict committed at or after that commit and
 * naming a second family still reddens.
 *
 * WHAT IT DOES NOT CATCH, said here and not only in the plan: a project with a
 * second family AVAILABLE that has simply never used it. Nothing in a record of
 * what WAS used reaches what COULD have been used. `readReviewFamilies` answers
 * that with provenance rather than detection: the claim is attributable to a
 * commit and a blob, so it is dated and signed even where it is not refutable.
 */
export function singleFamilyException(
  contextDirectory: string,
  loaded: LoadedVerdictCorpus,
): SingleFamilyOutcome {
  /* ONE RESOLUTION, THREADED THROUGH, AND THAT IS THE STRUCTURAL HALF OF THE
     FIX (M4-P11 fix round 1). The declaration is no longer read at whatever
     `HEAD` happens to mean when `readReviewFamilies` is called: it is read at
     the EXACT commit sha the pair corpus was enumerated from, and the
     falsifiers' own corpus is then read from that same sha. A declaration and
     the evidence that refutes it come out of ONE TREE by construction, so
     "they disagree about what exists" is not a state this function can be put
     into rather than a state it checks for and hopes to catch.

     On the worktree arm there is no commit to pin to, so `HEAD` is passed and
     `readReviewFamilies` performs the same `rev-parse` that just failed: it
     returns `absent`, or `error` if the working tree declares anyway. Either
     way no exception is granted, which is why one source of truth with no git
     is safe and two sources with git was not. */
  const declarationRef = loaded.source.kind === "commit" ? loaded.source.refSha : "HEAD";
  const reading = readReviewFamilies(contextDirectory, declarationRef);
  if (reading.kind === "error") {
    return { kind: "error", reason: reading.reason };
  }
  if (reading.kind === "absent") {
    /* AN ABSENT DECLARATION IS NOT PERMISSION. src/gates/release.ts:1037 states
       the rule for the sibling case; here it means the cross-family requirement
       applies unchanged, so a same-family pair stays red. */
    return { kind: "not-declared" };
  }
  if (reading.families.length !== 1) {
    /* A declaration of TWO OR MORE families is a valid declaration and it is
       not this exception. The environment says it has more than one, so
       DR-0012 condition 1 is satisfiable honestly and nothing is narrowed. */
    return { kind: "not-declared" };
  }
  /* THE FALSIFIERS' CORPUS IS READ HERE AND NOT BY THE CALLER, for two
     reasons that both matter. It is a WIDER set than the pair corpus, because
     the claim being falsified is about the project rather than about the two
     reviews in front of the check (CR-M4P11-002). And reading it only after a
     single-family declaration has been established means the wider read is
     paid for only by the runs that claim the exception, instead of by every
     verdict validated anywhere. */
  const paperwork =
    loaded.source.kind === "commit"
      ? loadPaperworkVerdicts(contextDirectory, loaded.source.ref, loaded.source.refSha)
      : /* UNREACHABLE BY CONSTRUCTION AND NOT LEFT TO CHANCE: `reading` is
           `declared` only when `readReviewFamilies` resolved a commit, and it
           resolves the same ref this corpus failed to resolve. It is written
           as a refusal rather than an assertion because M2-C-3 says a check
           that cannot establish its subject reports error, never a verdict. */
        ({
          ok: false,
          reason:
            `${CHARTER_DOCUMENT} declares ${REVIEW_FAMILIES_FIELD} at ${declarationRef} and ${contextDirectory} ` +
            `has no resolvable commit to read the refuting record from, so the exception could not be evaluated`,
        } as const);
  if (!paperwork.ok) {
    return { kind: "error", reason: paperwork.reason };
  }
  /* KERNEL 0.2.1 (DR-0054): THE FALSIFIERS READ ONLY WHAT WAS COMMITTED AT OR
     AFTER THE DECLARATION. Before the commit that first added the declaration
     the project had made no claim, so nothing it did then can contradict one;
     the owner's rule is that Tiphys judges current and future work and never
     history. What stays: once declared, any LATER verdict naming a second
     family, or naming none, still reddens. `paperwork.source.kind` is always
     "commit" here, for the reason the unreachable arm above states. */
  const scoped =
    paperwork.source.kind === "commit"
      ? scopeToDeclaration(contextDirectory, paperwork.source.refSha, paperwork.verdicts)
      : ({ ok: false, reason: "the falsifiers' corpus was not read from a commit" } as const);
  if (!scoped.ok) {
    return { kind: "error", reason: scoped.reason };
  }
  const corpus = scoped.verdicts;
  const corpusScope = `${describeVerdictCorpusSource(paperwork.source)} ${scoped.sentence}`;
  const declared = reading.families[0] as string;
  const provenance = reviewFamiliesProvenanceLine(reading.provenance);
  const violations: Diagnostic[] = [];
  const observed = new Map<string, string[]>();
  for (const candidate of corpus) {
    const value = establishField(candidate.record, "produced-by");
    if (value.kind !== "established") {
      violations.push({
        pointer: "#/produced-by",
        message: `${candidate.path} ${unestablishedReason(value, "produced-by") as string}, so it cannot be compared with the single family ${REVIEW_FAMILIES_FIELD} declares, and an exception cannot rest on a verdict that does not say what produced it; ${provenance}`,
      });
      continue;
    }
    observed.set(value.value, [...(observed.get(value.value) ?? []), candidate.path]);
  }
  const distinct = [...observed.keys()].sort();
  if (distinct.length > 1) {
    violations.push({
      pointer: "#/produced-by",
      message:
        `${CHARTER_DOCUMENT} declares the single review family ${reading.declaredAs.join(", ")} and the ` +
        `${String(corpus.length)} verdict document(s) committed under ${PAPERWORK_ROOT}/ carry ` +
        `${String(distinct.length)} distinct produced-by value(s) (${distinct.join(", ")}), so the declaration ` +
        `is contradicted by this project's own record and the exception does not apply; ${provenance} ` +
        corpusScope,
    });
  }
  for (const value of distinct) {
    if (value === declared) {
      continue;
    }
    violations.push({
      pointer: "#/produced-by",
      /* BOTH SPELLINGS OF THE DECLARED NAME, for the reason the `phase` label
         one screen down already gives: the canonical form is what was
         COMPARED and the operator's form is what is in the file they are
         holding. Printing only the canonical form tells someone whose charter
         says `Family-A` about a family called `family-a`. */
      message:
        `${CHARTER_DOCUMENT} declares the single review family ${reading.declaredAs.join(", ")} ` +
        `(canonically ${declared}) and ` +
        `${(observed.get(value) as string[]).sort().join(", ")} carr${(observed.get(value) as string[]).length === 1 ? "ies" : "y"} ` +
        `produced-by ${value}, which is not the declared family, so the exception does not apply to it; ${provenance}`,
    });
  }
  if (violations.length > 0) {
    return { kind: "refused", violations };
  }
  return {
    kind: "exempt",
    family: declared,
    reading,
    reports: [
      `REPORT single-family-declared ${CHARTER_DOCUMENT} declares exactly one review family ` +
        `(${reading.declaredAs.join(", ")}) and all ${String(corpus.length)} verdict document(s) committed ` +
        `under ${PAPERWORK_ROOT}/ carry it, so produced-by is NOT required to differ; framing and ` +
        `review-contract still are; reason: ${reading.reason}; ${provenance} ` +
        corpusScope,
    ],
  };
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
 * WHAT IT DOES NOT REACH, named rather than left to be found, AND BOTH ITEMS
 * THIS PARAGRAPH USED TO NAME HAVE BEEN CLOSED BY M4-P10. The first was
 * condition (d) of step 3b, that neither verdict carries an unresolved high or
 * medium finding; that is now the sibling check `verdict-pair-approves`, and
 * the schema's own root `if`/`then` was widened from [high, critical] to
 * [medium, high, critical] at the same time, because it had been one severity
 * narrower than DR-0012 condition 2 ever since it shipped. The second was that
 * nothing decided whether two verdicts describe the same HEAD; the schema now
 * requires `head` and this check groups by `(phase, head)`.
 *
 * WHAT IS STILL NOT REACHED, so the paragraph does not read as complete. This
 * check compares `produced-by` as a canonicalised STRING, never as a model
 * FAMILY, so two values naming one vendor pass as decorrelated; that was
 * measured twice against this repository's own reviews and recorded at
 * delivery/verification/m4-prototype-probes.md:1. THE DEFERRAL CHAIN FOR IT
 * TERMINATED WITH NO OWNER, which is what CR-VS-003 found and what this
 * paragraph used to hide: it said "closing it is M4-P11's declared scope", and
 * M4-P11 declined the mechanism (delivery/work-history/m4-p11.md:142) and
 * shipped the single-family EXCEPTION instead, which is a different question.
 * No later phase picked it up. The string comparison therefore STANDS, and what
 * the DR-0047 sweep changed is that the green line now says so: see
 * `producedByCaveat`, which also names what would close it. And a
 * `produced-by` line is written BY the reviewing agent, so it is forgeable; an
 * observed alternative exists and is M4-D-06's business, not this check's.
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
    /* ONE RESOLUTION FOR THE WHOLE DECISION (M4-P11 fix round 1). The regime,
       the declaration and both corpora are read from THIS value, so no two of
       them can describe different trees. Resolved before the regime rather
       than after it because the regime is the first thing that can end the
       run, and a regime read from an uncommitted charter was measured turning
       a red correlated pair green at exit 0. */
    const source = resolveCorpusSource(contextDirectory);
    const regime = establishDelegatedRegime(
      "dual-review-decorrelation",
      contextDirectory,
      phase,
      source,
    );
    if (regime.kind === "report") {
      return { violations: [], reports: regime.lines };
    }
    if (regime.kind === "violation") {
      return {
        violations: [{ pointer: regime.pointer, message: regime.message }],
        reports: [],
      };
    }
    const committed = loadCommittedVerdicts(contextDirectory, source);
    if (!committed.ok) {
      return {
        violations: [{ pointer: "#/produced-by", message: committed.reason }],
        reports: [],
      };
    }
    /* DR-0038's EXCEPTION IS DECIDED HERE, BEFORE THE GROUP IS ASSEMBLED, AND
       THE POSITION IS LOAD-BEARING (M4-P11). Both falsifiers are claims about
       the project's WHOLE committed corpus, not about the pair in front of the
       check, so they are answerable without a head and they are answered first.
       Putting them after the head resolution would have made a contradicted
       declaration invisible on exactly the corpus that contradicts it: this
       repository's own two real review verdicts predate M4-P10's required
       `head` field, so the head arm returns before any of this would run.

       A CONTRADICTED DECLARATION RETURNS IMMEDIATELY. It is red either way, so
       nothing is authorised by the early return, and what a reader needs first
       is that the project's declaration is false rather than a list of
       downstream consequences of believing it. */
    const exception = singleFamilyException(contextDirectory, committed);
    if (exception.kind === "error") {
      /* M2-C-3. A check that cannot establish whether an exception applies must
         not decide that it does not and carry on: that would silently impose
         the strict rule on a project that may have declared honestly, and,
         worse, would report a normal red that hides an unreadable declaration. */
      return {
        violations: [{ pointer: "#/produced-by", message: exception.reason }],
        reports: [],
      };
    }
    if (exception.kind === "refused") {
      return { violations: exception.violations, reports: [] };
    }
    const exemptDimensions =
      exception.kind === "exempt" ? new Set<string>(["produced-by"]) : new Set<string>();
    const exceptionReports = exception.kind === "exempt" ? exception.reports : [];

    /* THE JOIN KEY IS NOW (phase, head), WHICH IS M4-P10's FIRST CHANGE. Until
       this line the key was `phase` alone and the DIRECTORY was what scoped a
       set of verdicts to one head, a convention declared in
       delivery/work-history/m3-p9.md and enforced by nothing. Under that
       convention two reviews of two DIFFERENT heads sitting in one directory
       were compared as a pair and the grant read as satisfied, which is
       DR-0012 condition 1's head clause
       (delivery/decisions/DR-0012-delegated-merge-authority.md:22) asserted by
       an operator rather than checked. The instance's OWN head is established
       first, so a verdict that does not say what it reviewed cannot select a
       group at all. */
    const ownHead = headKeyOf(verdict, "this verdict");
    if (!ownHead.ok) {
      return {
        violations: [{ pointer: "#/head", message: ownHead.message }],
        reports: [],
      };
    }
    const headKey = ownHead.value;
    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
    const group = grouped.members;

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
            message: `this verdict is not among the ${String(group.length)} verdict document(s) committed under ${REVIEW_DIRECTORY} for phase ${phase} at head ${headKey}, so it is not a review the delegated grant can be satisfied by ${describeVerdictCorpusSource(committed.source)}`,
          },
        ],
        reports: [],
      };
    }

    /* THE SIBLINGS THAT COULD NOT BE LOOKED AT OR COULD NOT BE KEYED ARE
       CARRIED IN, NOT DROPPED. See `loadCommittedVerdicts` and `headGroupFor`:
       a candidate whose bytes do not read or decode, and a same-phase verdict
       with an unusable phase or head, each shrink the group silently
       otherwise, and a shrinking group is the fail-open shape. */
    const violations: Diagnostic[] = [...committed.unexaminable, ...grouped.unkeyed];
    if (group.length < 2) {
      violations.push({
        pointer: "#/phase",
        message: `only ${String(group.length)} verdict document(s) exist under ${REVIEW_DIRECTORY} for phase ${phase} at head ${headKey}, and a delegated grant requires two independent clean-room reviews of the exact head ${describeVerdictCorpusSource(committed.source)}`,
      });
    }

    for (const dimension of DECORRELATION_DIMENSIONS) {
      if (exemptDimensions.has(dimension)) {
        /* THE ONE NARROWED DIMENSION (DR-0038, M4-P11). `continue` skips the
           DISTINCTNESS requirement only, and it is reached only after both
           falsifiers passed, which means every committed verdict has already
           been read and found to carry the one declared family. So this is not
           a dimension that stopped being looked at: it is one that was looked
           at against a different rule. The two dimensions below are untouched,
           which is what stops the exception relaxing the whole check. */
        continue;
      }
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

    /* THE REPORT NAMES THE DIMENSIONS ACTUALLY COMPARED, never the constant.
       Printing the full triple while one of its members was exempt is the
       sentence DR-0038 exists to stop being written: "distinct on produced-by"
       about a pair that was not required to be. */
    const compared = DECORRELATION_DIMENSIONS.filter(
      (dimension) => !exemptDimensions.has(dimension),
    );
    return {
      violations,
      reports:
        violations.length > 0
          ? /* THE EXCEPTION IS PRINTED EVEN ON A RED, because the owner's whole
               requirement is that nobody can hide it. A red run whose reader
               cannot see that produced-by was exempt is one where the exception
               is invisible exactly when the record is being read most closely. */
            [...exceptionReports]
          : [
              ...exceptionReports,
              `REPORT dual-review-decorrelation ${String(group.length)} verdict(s) for phase ${phase} at head ${headKey} are distinct on ${compared.join(", ")}${producedByCaveat(compared)}`,
            ],
    };
  },
};


/* ------------------------------------------------------------------ */
/* verdict-pair-approves (M4-P10 step 5, DR-0012 condition 2)           */
/* ------------------------------------------------------------------ */

/**
 * The severities DR-0012 condition 2 bars an APPROVE from sitting beside.
 *
 * `low` is absent DELIBERATELY and the record says why:
 * delivery/decisions/DR-0012-delegated-merge-authority.md:23 permits merging
 * with a low finding provided it is fixed or tracked with a reason. The same
 * three words are the escalation enum in `schemas/verdict.schema.json`, and the
 * two must agree; M4-P10 widened both together, because the shipped pair had
 * the schema stopping at `high` while the decision said `medium`.
 */
export const BLOCKING_SEVERITIES: readonly string[] = ["medium", "high", "critical"];

/**
 * The whole severity vocabulary, canonicalised, and the reason it exists BESIDE
 * the blocking list rather than being inferred from it.
 *
 * WITHOUT IT, AN UNRECOGNISED SEVERITY IS SILENTLY NON-BLOCKING. `includes` over
 * the blocking three answers "is this one of the three", and a review ranking a
 * defect `blocker`, `sev1` or `showstopper` gets `false` from that question and
 * sails through. The verdict schema forbids those words, and nothing on this
 * gate's path validates the committed siblings, so the schema is not the guard
 * here. Under a delegated grant an unrecognised severity has not been shown
 * non-blocking, and unshown must be refused; the four words are the ones
 * `schemas/verdict.schema.json` and `schemas/finding.schema.json` share.
 */
const SEVERITY_VOCABULARY: readonly string[] = ["low", "medium", "high", "critical"];

/**
 * The closed verdict vocabulary, exactly as `schemas/verdict.schema.json` spells
 * it, and the one word in it that authorises a merge.
 *
 * WHY THE RAW SPELLING IS CHECKED HERE AND CANONICALISATION IS NOT ENOUGH, which
 * is the opposite of the rule the decorrelation check follows one screen up and
 * is opposite for a reason that is worth stating rather than looking like an
 * inconsistency. THAT check REFUSES when two values are the same, so collapsing
 * more spellings onto one value produces MORE refusals and is fail-CLOSED. THIS
 * check APPROVES when a value equals one particular word, so collapsing produces
 * more APPROVALS and is fail-OPEN: a sibling reading `Approve`, which
 * `schemas/verdict.schema.json` forbids and which nothing on this path
 * validates, would canonicalise to `approve` and be read as an authorisation.
 * The direction of the comparison decides the direction of the collapse.
 *
 * So the canonical reading is still used to ESTABLISH that a value is there and
 * is comparable, and the RAW string then has to be one of the two words.
 */
const VERDICT_VOCABULARY: readonly string[] = ["APPROVE", "FIX-ROUND-NEEDED"];
const APPROVING_VERDICT = "APPROVE";

/**
 * DR-0012 CONDITION 2, MADE INTO A PREDICATE
 * (delivery/decisions/DR-0012-delegated-merge-authority.md:23).
 *
 * WHAT WAS MISSING, stated as the gap rather than as a feature. Before this
 * check, `scripts/check-dual-review.mjs` could not see a verdict's VALUE at
 * all: measured against the whole of that script, `grep -c` returned 0 for
 * `APPROVE`, 0 for `severity` and 0 for `findings`. So two properly
 * decorrelated reviews that both REFUSED the merge passed the gate green, and
 * so did an APPROVE sitting beside a finding the review itself ranked medium.
 * Condition 1 looked checked and condition 2 was asserted by a human, which is
 * the worse of the two states because it reads as progress.
 *
 * WHY IT IS A SEPARATE CHECK RATHER THAN MORE OF `dual-review-decorrelation`.
 * They are different predicates over the same set, and section 2.3 rule 3's
 * Kind B falsification is per-check: DEREGISTERING this one must make a
 * refusing pair pass, which is only a witness if there is one id to deregister.
 * Folding condition 2 into the decorrelation check would have made that
 * witness unavailable and would have made one red indistinguishable from the
 * other in the gate's output.
 *
 * WHY IT EVALUATES THE COMMITTED GROUP AND NEVER THE INSTANCE'S OWN FIELDS,
 * which is the one place its shape differs from its sibling's. DR-0012
 * condition 2 is a property of the two reviews WRITTEN TO `delivery/review/`
 * AND COMMITTED. A document handed to this check that is not among them is not
 * a review the grant can be satisfied by, and it also cannot break the
 * predicate: what is asserted is about the committed set, which the stray
 * document is not a member of. So there is no membership test here, and the
 * empty case is not a hole: a `(phase, head)` selecting fewer than two
 * committed verdicts is refused by the pair-size rule below.
 *
 * WHAT IT DOES NOT REACH, named rather than left to be found. "Unresolved" is
 * a state of the review THREAD, and this check reads documents: a finding that
 * was raised, fixed in a later round and left in the file still reddens here.
 * That is the fail-closed direction and it is a real cost, paid deliberately,
 * because the alternative is a resolution field an author sets on their own
 * finding. Nothing here decides whether a `severity` was ranked honestly
 * either; a review that calls a critical defect `low` passes, and no keyword
 * reaches that.
 */
export const verdictPairApproves: DerivedCheck = {
  id: "verdict-pair-approves",
  type: "verdict",
  requiresContext: true,
  run(instance: unknown, contextDirectory: string | undefined): CheckOutcome {
    if (contextDirectory === undefined) {
      /* Unreachable through `runChecks`, which SKIPS first. Fail closed rather
         than trusting a caller that reaches the check directly. */
      return {
        violations: [{ pointer: "#/verdict", message: "no context directory was supplied" }],
        reports: [],
      };
    }
    const verdict = asRecord(instance);
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
    const phaseKey = phaseReading.value;
    const phase = verdict?.["phase"] as string;

    const source = resolveCorpusSource(contextDirectory);
    const regime = establishDelegatedRegime(
      "verdict-pair-approves",
      contextDirectory,
      phase,
      source,
    );
    if (regime.kind === "report") {
      return { violations: [], reports: regime.lines };
    }
    if (regime.kind === "violation") {
      return {
        violations: [{ pointer: regime.pointer, message: regime.message }],
        reports: [],
      };
    }

    const ownHead = headKeyOf(verdict, "this verdict");
    if (!ownHead.ok) {
      return {
        violations: [{ pointer: "#/head", message: ownHead.message }],
        reports: [],
      };
    }
    const headKey = ownHead.value;

    const committed = loadCommittedVerdicts(contextDirectory, source);
    if (!committed.ok) {
      return {
        violations: [{ pointer: "#/verdict", message: committed.reason }],
        reports: [],
      };
    }
    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
    const group = grouped.members;

    /* SAME TWO SOURCES AS THE SIBLING CHECK, AND THE REASON IS SHARPER HERE.
       This predicate says the pair APPROVES, so every document that could not
       be examined is a document that could have been the refusal. */
    const violations: Diagnostic[] = [...committed.unexaminable, ...grouped.unkeyed];
    if (group.length < 2) {
      violations.push({
        pointer: "#/verdict",
        message: `only ${String(group.length)} verdict document(s) exist under ${REVIEW_DIRECTORY} for phase ${phase} at head ${headKey}, and DR-0012 condition 2 is a property of the PAIR, so it cannot be satisfied by fewer than two ${describeVerdictCorpusSource(committed.source)}`,
      });
    }

    for (const candidate of group) {
      const reading = establishField(candidate.record, "verdict");
      if (reading.kind !== "established") {
        violations.push({
          pointer: "#/verdict",
          message: `${candidate.path} ${unestablishedReason(reading, "verdict") as string}, so whether this review approves the merge could not be established, and a merge check that cannot read a verdict must not report the pair clean`,
        });
      } else {
        const raw = candidate.record["verdict"] as string;
        if (!VERDICT_VOCABULARY.includes(raw)) {
          violations.push({
            pointer: "#/verdict",
            message: `${candidate.path} declares verdict ${raw}, which is not one of the two words the closed vocabulary admits (${VERDICT_VOCABULARY.join(", ")}), so it cannot be read as an authorisation however it is spelled`,
          });
        } else if (raw !== APPROVING_VERDICT) {
          violations.push({
            pointer: "#/verdict",
            message: `${candidate.path} reads ${raw} for phase ${phase} at head ${headKey}, so the pair does not approve this head and the delegated grant's condition 2 is not met`,
          });
        }
      }
      violations.push(...blockingFindings(candidate, phase, headKey));
    }

    return {
      violations,
      reports:
        violations.length > 0
          ? []
          : [
              `REPORT verdict-pair-approves ${String(group.length)} verdict(s) for phase ${phase} at head ${headKey} read APPROVE and carry no finding at ${BLOCKING_SEVERITIES.join(", ")}`,
            ],
    };
  },
};

/**
 * Every finding in one verdict that DR-0012 condition 2 bars a merge over.
 *
 * SEPARATE FROM THE CHECK BODY because the shapes it has to refuse are the
 * interesting part and they are easy to lose in a loop. `findings` that is not
 * a list, an entry that is not a map, and a `severity` that cannot be
 * established are all REFUSALS rather than skips, for the reason the whole of
 * this section follows: a value that has not been established is not a value
 * that has been shown safe, and under a grant unshown must be refused.
 */
function blockingFindings(
  candidate: LoadedVerdict,
  phase: string,
  headKey: string,
): Diagnostic[] {
  const raw = candidate.record["findings"];
  if (raw === undefined) {
    return [
      {
        pointer: "#/findings",
        message: `${candidate.path} declares no findings, so whether it carries a blocking one could not be established for phase ${phase} at head ${headKey}`,
      },
    ];
  }
  if (!Array.isArray(raw)) {
    return [
      {
        pointer: "#/findings",
        message: `${candidate.path} declares findings as ${raw === null ? "null" : typeof raw === "object" ? "a map" : `a ${typeof raw}`}, which is not a list of findings, so whether it carries a blocking one could not be established`,
      },
    ];
  }
  const out: Diagnostic[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const finding = asRecord(raw[index]);
    if (finding === undefined) {
      out.push({
        pointer: `#/findings/${String(index)}`,
        message: `${candidate.path} finding ${String(index)} is not a map, so its severity could not be established`,
      });
      continue;
    }
    const severity = establishField(finding, "severity");
    if (severity.kind !== "established") {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} finding ${String(index)} ${unestablishedReason(severity, "severity") as string}, so whether it blocks the merge could not be established`,
      });
      continue;
    }
    const id = establishField(finding, "id");
    const named = id.kind === "established" ? (finding["id"] as string) : `at index ${String(index)}`;
    if (!SEVERITY_VOCABULARY.includes(severity.value)) {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} ranks finding ${named} ${severity.value}, which is not one of the four severities the kernel's vocabulary admits (${SEVERITY_VOCABULARY.join(", ")}), so whether it blocks the merge could not be established`,
      });
      continue;
    }
    if (BLOCKING_SEVERITIES.includes(severity.value)) {
      out.push({
        pointer: `#/findings/${String(index)}/severity`,
        message: `${candidate.path} carries finding ${named} at severity ${severity.value} for phase ${phase} at head ${headKey}, and a delegated grant is not satisfied while a review carries an unresolved finding at ${BLOCKING_SEVERITIES.join(", ")}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* model-resolution-subject-echo (M4-P7 criteria 1, 2 and 7)            */
/* ------------------------------------------------------------------ */

/**
 * THE SUBJECT ECHO AGREES WITH THE RESOLUTION IT SITS BESIDE, THE RECORD WAS
 * WRITTEN AFTER THE TURN ENDED, AND AN OVERRIDE WAS PERMITTED BEFORE IT WAS
 * APPLIED.
 *
 * All three compare SIBLING FIELDS of one document, so all three are Kind B
 * and none of them is reachable from a keyword (schemas/README.md's Kind A and
 * Kind B section, DR-0013 clause 8). The schema next door can require that
 * `subject`, `turnEnd` and `resolution` are all PRESENT, which is what makes a
 * launch-time record unrepresentable, and it stops exactly there: it cannot
 * say that two present values agree.
 *
 * WHY THE ECHO MATTERS AT ALL, since a record that echoes itself sounds
 * circular. It is not the record checking itself against itself. `subject` is
 * a VERBATIM copy of the launch request the adapter was handed and
 * `resolution` is what the adapter's resolver actually consumed, and the
 * hazard is that those two diverge silently: a resolver that read the wrong
 * role's row produces a perfectly well-formed record whose family token is
 * then attributed to a task it was never about. That is the misattribution
 * guard src/gates/schemas/release-record.schema.json:26 exists for, one seam
 * along, and the kernel-side half of it is in src/model-resolution.ts where
 * the request is compared against a copy the kernel itself holds.
 *
 * THE OVERRIDE DIRECTION IS THE ONE MOST LIKELY TO BE GOT WRONG. M4-P7
 * criterion 7 wants BOTH directions: a role whose `charter-override` is
 * `allowed` takes the charter's tier, and a role whose permission is anything
 * else does not. The second direction is the one a resolver written from the
 * happy path silently drops, because nothing about it looks like a failure.
 */
export const modelResolutionSubjectEcho: DerivedCheck = {
  id: "model-resolution-subject-echo",
  type: "model-resolution",
  requiresContext: false,
  run(instance: unknown): CheckOutcome {
    const document = asRecord(instance);
    if (document === undefined) {
      return EMPTY;
    }
    const subject = asRecord(document["subject"]);
    const resolution = asRecord(document["resolution"]);
    if (subject === undefined || resolution === undefined) {
      /* The schema requires both and runs first in `cmdValidate`, so this arm
         is not reached through the command. It is kept fail-open rather than
         inventing a second diagnostic for a missing field the schema already
         names, which would print the same defect twice under two wordings. */
      return EMPTY;
    }
    const violations: Diagnostic[] = [];

    const echoedRole = subject["role"];
    const resolvedRole = resolution["role"];
    if (echoedRole !== resolvedRole) {
      violations.push({
        pointer: "#/resolution/role",
        message: `the resolution is for role ${String(resolvedRole)} and the subject echo says the launch request named role ${String(echoedRole)}, so this record resolves a different subject than it claims`,
      });
    }

    const overrideApplied = resolution["overrideApplied"];
    const resolvedTier = resolution["tier"];
    if (overrideApplied === false && resolvedTier !== subject["requestedTier"]) {
      violations.push({
        pointer: "#/resolution/tier",
        message: `no charter override was applied and the resolved tier ${String(resolvedTier)} is not the requested tier ${String(subject["requestedTier"])}, so the tier changed with nothing recorded as having changed it`,
      });
    }
    if (overrideApplied === true) {
      if (resolvedTier !== resolution["charterTier"]) {
        violations.push({
          pointer: "#/resolution/tier",
          message: `a charter override was applied and the resolved tier ${String(resolvedTier)} is not the charter tier ${String(resolution["charterTier"])}, so the record cites a charter it did not follow`,
        });
      }
      const permission = asRecord(resolution["observation"])?.["configPermission"];
      if (permission !== "allowed") {
        violations.push({
          pointer: "#/resolution/observation/configPermission",
          message: `a charter override was applied while the role's charter-override permission was observed to be ${String(permission)}, so the override was taken where the role forbids it`,
        });
      }
    }

    const writtenAt = document["writtenAt"];
    const endedAt = asRecord(document["turnEnd"])?.["endedAt"];
    if (typeof writtenAt === "string" && typeof endedAt === "string") {
      const written = Date.parse(writtenAt);
      const ended = Date.parse(endedAt);
      if (Number.isFinite(written) && Number.isFinite(ended) && written < ended) {
        violations.push({
          pointer: "#/writtenAt",
          message: `the record says it was written at ${writtenAt}, before the turn ended at ${endedAt}, so it cannot carry what the turn resolved and is a restatement of the request`,
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
  /* M4-P10 step 5. Appended rather than inserted, for the reason recorded on
     the M3-P7 block above: `checksFor` filters by declared type and sorts by
     id, so this array's position carries no meaning any check reads. */
  verdictPairApproves,
  /* M4-P7. Appended rather than inserted, for the reason recorded on the
     M3-P7 block above: `checksFor` filters by declared type and sorts by id,
     so this array's position carries no meaning any check reads. */
  modelResolutionSubjectEcho,
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
  /**
   * True when at least one check VIOLATED. A skip alone leaves it false. This
   * is what `tiphys validate` exits on (kernel 0.2.1).
   */
  violated: boolean;
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
  /**
   * KERNEL 0.2.1 (DR-0055): checks not in force for this document's stamp,
   * decided by src/stamp.ts's RULES_SINCE. They are not run and not counted
   * as skipped; the caller prints why.
   */
  notInForce: ReadonlySet<string> = new Set<string>(),
): ChecksRun {
  const violationLines: string[] = [];
  const reportLines: string[] = [];
  const skippedLines: string[] = [];
  for (const check of checksFor(type)) {
    if (notInForce.has(check.id)) {
      continue;
    }
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
    violated: violationLines.length > 0,
  };
}
