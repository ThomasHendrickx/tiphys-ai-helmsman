# M6-P4 arbitration, round 0 (head 41e886a)

Review A (hazard-criteria-first, fable): m6-p4-hazard-a-round0.json, APPROVE, four
lows (CR-M6P4A-01 suite-point exclusion unwitnessed; 02 --plan with an
undeclared phase is not-applicable; 03 check.command escape through `env`;
04 the final report's not-testable list is not compared with `plan count`).
Review B (hazard-author-adversary-first, opus) in progress at the same head.

Review B (hazard-author-adversary-first, opus): m6-p4-hazard-b-round0.json,
FIX-ROUND-NEEDED, three mediums (CR-M6P4B-01 an expectFailure test proves
its criterion; 02 brief compose does not validate the plan and reports an
invalid plan's criteria as none; 03 the template's command check exits 0
with every test skipped) and five lows.

Fix round 1: B-01, B-02, B-03; cheap lows A-01 = B-04 (two unwitnessed
guards) and A-03 = B-08 (`env sh -c` bypass). No change, recorded:
A-02 = B-05, A-04, B-06 (release notes), B-07.

Under the owner's proven-stays-proven rule, fixes proven red-then-green by
their named tests close without a reviewer re-check.

## Fix round 1 (head 07122be)

Fixed, each proven red-then-green by its named test (six tests red at
6decf65: 6 tests, 2 pass, 4 fail; green at 59e2954; suite 1258 pass, 0 fail,
0 skipped on node v26.6.0 with dist built, `npm test`): CR-M6P4B-01
(expectFailure and replayed points never prove a criterion), CR-M6P4B-02
(`brief compose` validates the plan), CR-M6P4B-03 (template criterion 1 names
tests; a `command` check proves only exit 0), CR-M6P4A-01 = CR-M6P4B-04
(ambiguous phase id, describe title with all inner tests skipped),
CR-M6P4A-03 = CR-M6P4B-08 (env-wrapped inline shells refused). Six witness
specs, 16 members, each red by hand. No reviewer re-check (owner rule).

Open items from the fixer, ruled:

1. `tiphys plan project` (src/commands/plan.ts:150) projects an invalid plan
   and exits 0. Same mechanism as B-02 (a command reads a plan without
   validating it). The command is M6-P3's, so it exists on `main` only after
   M6-P3 lands. Fixed in step 4, after the merge of `main`, with a named
   test; `src/commands/plan.ts` is granted on the declaration (additive,
   printed by name).
2. Refusing every `--test-rerun-failures` run as proof: no. Real reruns are
   legitimate; a state file without `passed_on_attempt` needs a hand edit,
   which is outside what the gate guards (an honest implementer). Low, no
   change.
3. 70 branch lines no witness member mutates: recorded, no change. The rule
   is a witness per named guard, not per branch line.
4. Ambiguous-phase member 1 is red by a crash, not a wrong verdict: low,
   recorded, no change.
5. Suite pass counts include expectFailure and replayed points, as Node's do;
   only criteria refuse them. No change.

Landing: after M6-P3 lands, merge `main`, fix item 1, build, `npm test`,
then a short final-head check (two, pair tier) like M6-P3's D and E.

## Final-head checks (code head 0d64d68)

- reviews: delivery/review/m6-p4-hazard-a.json, delivery/review/m6-p4-hazard-b.json

Step 4 merged `main` at M6-P3 (64c5e1c) and fixed item 1 (442c50f, named
test test/criteria.test.ts:841). Step 5 merged M6-P8 (b4149eb). Both checks
APPROVE at 0d64d68: every medium and item 1 has a named test and witness,
both merges kept both sides, nothing unreviewed rides in, suite 1271 pass,
0 fail, 0 skipped (node v26.6.0, dist built). One low, no change:
CR-M6P4A-01 (the behaviors row release-verification-comment-cites-dr-0014
was removed with its test at c258ff1, before 41e886a, and declared).
