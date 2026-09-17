/**
 * THE FAMILY VOCABULARY, AND THIS FILE IS WHERE A VENDOR NAME IS ALLOWED TO BE
 * (kernel plan M4, M4-P7 criterion 4; delivery/plan/kernel-plan-m4.md:1018).
 *
 * THE PROPERTY THIS FILE EXISTS TO PROTECT IS ABOUT THE OTHER PACKAGE. No
 * vendor model name appears anywhere in the kernel's shipped surface, and
 * `test/schemas.test.ts` walks `src/`, `bin/`, `schemas/`, `roles/` and the
 * root configuration at run time asserting it rather than promising it. A
 * tier-to-model or model-to-family mapping over there would close off every
 * harness that is not the one it names (delivery/plan/m4-intake.md:377), which
 * is the whole reason the executor seam exists. So the mapping lives here, in
 * the harness's own package, and the kernel dereferences this vocabulary's
 * IDENTITY and never its CONTENT (src/model-resolution.ts).
 *
 * THE IDS ARE MEASURED, NOT CHOSEN. Every model id below was read out of a
 * real harness-written transcript by M4-P1's probe and is committed as a
 * capture: `claude-sonnet-5` and `claude-opus-5` at
 * test/fixtures/harness-probe/q3-transcript-model-resolution/three-concurrent.summary.txt:1,
 * and the dated `claude-haiku-4-5-20251001` in the earlier subagent
 * resolution recorded at delivery/verification/m4-prototype-probes.md:209.
 * That matters because the family derivation below is a PREFIX table, and a
 * prefix table invented from what ids look like would have missed that a
 * served id may or may not carry a date suffix.
 *
 * THE VERSION IS PART OF THE IDENTITY AND THE ID IS NOT THE PACKAGE NAME. Two
 * records are comparable when their vocabulary ids match; a vocabulary that
 * adds a family in a later version has not changed what its existing tokens
 * mean, which is why the kernel's comparison turns on the id alone.
 */

/** This vocabulary's identity, which is all the kernel ever reads of it. */
export const VOCABULARY_ID = "claude-code-model-families";

/** Bumped when a token's MEANING changes, never when a family is added. */
export const VOCABULARY_VERSION = 1;

export interface VocabularyIdentity {
  id: string;
  version: number;
}

/** The identity a record carries, built fresh so a caller cannot mutate it. */
export function vocabularyIdentity(): VocabularyIdentity {
  return { id: VOCABULARY_ID, version: VOCABULARY_VERSION };
}

/**
 * MODEL ID PREFIX to FAMILY TOKEN, in declaration order.
 *
 * A PREFIX TABLE RATHER THAN A PATTERN, and the difference is not cosmetic. A
 * regular expression over a served id would decide a family for ids nobody has
 * ever seen, and would keep deciding one after the vendor changes its naming.
 * A table decides only for the shapes that have been observed and returns
 * `undefined` for everything else, which the writer turns into an UNRESOLVED
 * record rather than into a confident wrong answer.
 */
export const FAMILY_PREFIXES: readonly (readonly [string, string])[] = [
  ["claude-opus-", "opus"],
  ["claude-sonnet-", "sonnet"],
  ["claude-haiku-", "haiku"],
];

/**
 * The family token for a served model id, or `undefined` when this vocabulary
 * has nothing to say about it.
 *
 * `undefined` IS A REAL ANSWER AND IT IS THE SAFE ONE. An id this table does
 * not recognise is a model this vocabulary cannot name the family of, and the
 * record that follows says so with `provenance: unresolved`. Guessing would
 * put a token into a decorrelation comparison that means nothing.
 */
export function familyOf(modelId: string): string | undefined {
  for (const [prefix, family] of FAMILY_PREFIXES) {
    if (modelId.startsWith(prefix)) {
      return family;
    }
  }
  return undefined;
}

/**
 * TIER to MODEL, which is R-075's mapping and the one the kernel must not hold.
 *
 * The two tiers are role-model-config.yaml's own (`strongest`, `cheaper`) and
 * they cross the executor seam verbatim as `declaredTier`. A tier this table
 * does not know returns `undefined`, for the same reason `familyOf` does.
 */
export const TIER_MODELS: readonly (readonly [string, string])[] = [
  ["strongest", "claude-opus-5"],
  ["cheaper", "claude-haiku-4-5-20251001"],
];

/** The model this vocabulary would ask for at a tier, or `undefined`. */
export function modelForTier(tier: string): string | undefined {
  for (const [name, model] of TIER_MODELS) {
    if (name === tier) {
      return model;
    }
  }
  return undefined;
}
