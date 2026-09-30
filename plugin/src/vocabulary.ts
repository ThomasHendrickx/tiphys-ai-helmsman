/**
 * THE FAMILY VOCABULARY, AND THIS FILE IS WHERE A VENDOR NAME IS ALLOWED TO BE
 * (kernel plan M4, M4-P7; M6-P5, DR-0062).
 *
 * No vendor model name appears in the kernel's shipped surface
 * (`test/schemas.test.ts` walks it), so the tier-to-model and model-to-family
 * mappings live here, in the harness's own package, and the kernel reads a
 * vocabulary's IDENTITY and never its CONTENT (src/model-resolution.ts).
 *
 * M6-P5 (DR-0062): A FAMILY IS THE VENDOR. Until M6-P5 a family was a model
 * line of one vendor (three tokens), so two models of one vendor read as two
 * families. Every model id this harness serves is one vendor's, so there is one
 * family token. The meaning of a token changed, so the vocabulary id changed
 * too: a record minted under the old id is not comparable with one minted under
 * this one (src/model-resolution.ts refuses a cross-vocabulary compare).
 *
 * THE IDS ARE MEASURED, NOT CHOSEN: `claude-haiku-4-5-20251001` and
 * `claude-sonnet-5-5` in the real stream at
 * test/fixtures/review-dispatch/haiku-with-sonnet-subagent.stream.jsonl:1, and
 * `claude-opus-5` in the M4-P1 capture at
 * test/fixtures/harness-probe/q3-transcript-model-resolution/three-concurrent.summary.txt:1.
 */

/** This vocabulary's identity, which is all the kernel ever reads of it. */
export const VOCABULARY_ID = "claude-code-model-vendors";

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
 * MODEL ID PREFIX to FAMILY TOKEN. A prefix table rather than a pattern: an id
 * no row names returns `undefined`, which the caller records as `unknown`
 * rather than as a confident wrong answer.
 */
export const FAMILY_PREFIXES: readonly (readonly [string, string])[] = [["claude-", "anthropic"]];

/** The family token for a served model id, or `undefined` when no row names it. */
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
