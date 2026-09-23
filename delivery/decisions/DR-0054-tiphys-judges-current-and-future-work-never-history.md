# DR-0054: Tiphys judges current and future work, never history

- id: DR-0054
- status: DECIDED
- decided-by: owner, 2026-09-23
- date: 2026-09-23
- supersedes: the whole-corpus scope of DR-0038's two falsifiers (the rest of DR-0038 stands)
- relates-to: DR-0012, DR-0038, DR-0053

## The decision

The owner's words: "For me current and future work should be looked at by
tiphys, you can't change history."

A consumer's committed history is a fixed fact. No kernel rule may reject a
project because of records made before that rule applied to it. Kernel rules
judge the work in front of them and the work that follows.

## What this changes

1. **Verdict schema (DR-0053).** Already consistent: 0.2.1 makes the schema
   describe documents, and the gates judge admission of current work only.
2. **review-families falsifiers (DR-0038).** Their scope was the whole
   committed corpus, on purpose (src/checks.ts:4924). That is withdrawn. The
   falsifiers now read only verdicts committed AT OR AFTER the commit that
   first added the `review-families` declaration to `charter.yaml`. Before
   that commit a project had made no claim, so nothing it did then can
   contradict one.
3. **The protection that stays.** Once a project declares one family, any
   later verdict naming a second one still reddens the declaration. So the
   declaration is still falsifiable, for everything it can honestly be held
   to.

## What this gives up, stated

A project whose past shows two families can now declare one. DR-0038 scoped
the check wide to stop exactly that. The owner has chosen that history is not
evidence against a new claim. The provenance record (the declaration's commit
and blob hash) keeps the claim dated and attributable.

## Applies to

Every future kernel rule: a new strictness applies from the point a project
adopts it, never backwards. A reviewer of any kernel change checks this.
