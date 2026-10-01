# Milestone M6 final report: review and rule economy

Measured at 25aca6b (main 568b9f3 plus M6-P7 and paperwork); updated at the
close, `main` 4411d74 plus the close-out pull request. The machine-readable
form is delivery/evidence/m6-final-report.yaml.

## In short

- Gates: 21 registry entries became 8. Each names what it prevents.
- Sizes: all four are under target (table below).
- Owner decisions owed: none. DR-0061 to DR-0066 are decided and in force.
- Not-testable: 5 of 47 criteria.
- All eight phases are merged. M6-P7's `$comment` was replaced by a one-line
  `description` before it merged (p4-diet holds).
- The first full stored-witness sweep on push found two witnesses that never
  guarded anything; the close-out removes them (see "Found at the close").
- Known limit: a Codex review cannot count yet; Codex 0.159.2 prints no served model.

Phases, in landing order: P1 #227 cd2dafe, P2 #228 a726478, P3 #229 65d4ca5,
P8 #230 3fa602c, P4 #231 a8ddf62, P6 #232 b0ed202, P5 #233 568b9f3,
P7 #234 (open; code head 1b8de3e, measured as `git diff 568b9f3 25aca6b`).

## M6-P1: decisions and plan (#227, cd2dafe)

Deleted: nothing (`git diff --diff-filter=D --name-only cd2dafe^1 cd2dafe` is empty).
Kept or added: DR-0061 to DR-0064 and the M6 plan. No gate change.
Owner decision owed: none.
Not-testable: 1 of 2 (p1-faithful: a record says what the owner decided is a reading).

## M6-P2: review tier follows the diff (#228, a726478)

Deleted:
- `verdict-criteria-complete`, its two tests, behavior row and witness
  `verdict-criteria-completeness-guard.json` (089294b): DR-0064 drops the criteria contract it checked.
- The `none` review tier, DR-0027's path table (`REVIEW_BUDGET_ROWS`, `tierOfPath`, `TIER_RANK`):
  replaced by the charter's `runtime-set` (DR-0063).
- Merge-gate condition 3 (criteria walked, `judgeCriteriaWalked`): DR-0064.
- The criteria review contract: `REVIEW_CONTRACTS = ["hazard"]`, verdict schema no longer requires
  `criteria`/`review-contract`, full mode `review-contracts: [hazard]`, criteria framing and two
  criteria-walk probes in `checklists/clean-room.yaml`, criteria clauses in the clean-room role and AGENTS.md: DR-0064.
- Framing and review-contract distinctness in decorrelation (`DECORRELATION_DIMENSIONS = ["produced-by"]`)
  and four tests asserting them (e05c782): DR-0064 drops those comparisons.
- Two retirement-register tests (e05c782): DR-0061 (a) ends the register (a stated deviation: plan put it in P3).
- The `suite` gate's refusal of a behavior deleted since the merge base: a register of removals, DR-0061 (a).
Kept, with its reason:
- Old verdicts still validate (`criteria` stays in the enum, fields optional): history loads (DR-0054); 25 committed verdicts checked, 0 INVALID.
- `merge-preconditions` gate, now per tier (`pair` 2 verdicts, `single` 1): prevents "a merge without the reviews its tier owes, or without green CI on the merged head".
Owner decision owed: none.
Not-testable: 0 of 11.

## M6-P3: removal and admission, one gate list (#229, 65d4ca5)

Gate list went from 21 entries (30,047 bytes) to 8 (4,953 bytes).
Deleted (one line per removal commit, its own reason):
- 908c5b9 retirement inventory (.json, .md), its checker and test, cutover-entry checker and test,
  `probe-pilot-readonly.mjs`, the cutover retirement screen, 4 witnesses: DR-0061 (a) ends the register; the cutover happened (DR-0060).
- be74cec `gates.manifest.json`, `scripts/m2-exit-test.sh` and its test, `tiphys gates self-check`,
  `--manifest`, `manifest-self-check`, duplicate workflow steps: one gate list, CI runs the registry on both events.
- d2fd21e `agent-rules-drift` and `render-agent-rules-gates.mjs`: kept a registry copy in CLAUDE.md aligned (process document).
- 0b0ab26 `brief-drift` and `check-brief-drift.mjs`, 1 witness: kept a registry copy in the implementer brief aligned; compose now renders it.
- 80324a8 `check-agents-references` and its script, 1 witness: checks AGENTS.md prose links (process document).
- 0bf328d `check-dual-review` gate entry: duplicate of `merge-preconditions` (script stayed until P5).
- a3e91a1 `gate-classes` gate and code, 5 witnesses, 2 captures: checks a phase declaration (process document).
- a9d78b0 `citations`, `src/gates/citations.ts`, config schema, test, 2 witnesses, CLAUDE.md rule 3b: checks citation tokens in process documents.
- a4bac23 `clause-map`, its script, `delivery/requirements/clause-map.json`: checks a plan appendix against a register.
- cac1985 `coverage`, `src/gates/coverage.ts`, config schema, test, 2 witnesses, 1 patch: checks a requirements table against a plan.
- 0d05dad `credential-token` and its arm in `src/gates/credentials.ts`: could never be green.
- e3b7d3a the two `clean-room-checklist` entries, `verifies-gate` links, `gate-probes-resolve`, 2 witnesses: never executed.
- 4f2d6d8 `deploy`, `migrations` from this registry only: never applicable here (code stays for projects).
- caff246 the id-collision CI step: reads process-document ids (script kept).
- c1eb752 20 derived checks in `src/checks.ts` and 26 witnesses: read only process documents.
- bdef2cc per-mode `gate-sets` lists in `assurance-modes.yaml`, and full mode's condition 3: derived from the registry's `modes`; DR-0064.
- 3037433 every `$comment` keyword in the gate-registry and assurance-modes schemas: token diet.
- d584639 (merge of main) witness `m6-p2-hazard-check-no-contract` and its capture: guarded a check deleted above.
- 129 `test/behaviors.json` rows whose test no longer exists.
Kept, with its `prevents` (M6-P3 decided the list; see the gate table below):
- `authored-bytes` (promoted from a workflow step): a control or non-ASCII byte in a tracked authored file.
- `credential-scrub`: an executor child inheriting a credential that can open or merge a pull request.
- `typecheck` (gained `push`): a type error in src/, test/ or plugin/.
- `license`: a production dependency with a missing or non-allowlisted license in the shipped package.
- `scope` (now conditional): a phase branch changing a file outside its phase declaration.
Considered and kept:
- The M1 exit test workflow step: the suite does not run that harness end to end.
- `verdict-pair-approves`, `dual-review-decorrelation`, `model-resolution-subject-echo`: the merge gate runs them by id (P5 decided the last two).
- `evaluatePortRow`, `readRetirementInventory`, `pre-freeze-ruleset.json`: `tiphys cutover status` and the rollback rehearsal read them.
- `gate-sets` as an optional, ignored schema property, and the `$comment` data PROPERTY: old documents still validate.
- `deploy` and `migrations` code and tests: they ship for projects.
Owner decision owed: none. Residues left to the orchestrator: duplicate mode ids, role rows and probe ids are no longer refused (their checks read only process documents).
Not-testable: 1 of 8 (p3-ci-green: the PR and post-merge push runs).

## M6-P8: pull-request CI runs each check once (#230, 3fa602c)

Deleted (no whole file; inside `.github/workflows/gates.yml`, commit bbe5133):
- The separate `npm test` step: the `suite` gate runs the same suite (DR-0066).
- The M1 exit test on `pull_request`: it now runs on `push` only (DR-0066).
- On a pull request, re-evaluating every stored witness: a stored spec runs only when the diff touches a file it mutates or a test it runs; skips are counted in the detail line.
Kept or changed, with its `prevents`:
- `red-witness` gained `push` and an `event` parameter (the full sweep moves after the merge): a src/, bin/ or plugin/ change whose tests stay green when the change is mutated away.
Owner decision owed: none. Note for the orchestrator (work history, "Not done"): the full push sweep is estimated at about an hour, and `cancel-in-progress` cancels it when the next merge lands sooner (an estimate, not measured).
Not-testable: 1 of 4 (p8-time: this PR's own CI duration; STATE.md records 7.5 minutes, was about 45).

## M6-P4: acceptance criteria are tests (#231, a8ddf62)

Deleted:
- c258ff1 test "the release-verification field's $comment cites DR-0014 ..." and its behavior: asserted comment text only.
- 450764e the comment-text rows of the closed-vocabulary test and witness member 2: the schema diet removes that text.
- bcb792f every `$comment` keyword in the other 18 schemas, and descriptions cut to one line (78, longest 158 chars): token diet.
- bcb792f the `$comment` data PROPERTY in the gate-registry and assurance-modes schemas: no committed document used it.
- bcb792f the schemas/README.md section "`$comment` carries clause ids": P3 deleted the clause map it described.
- The suite gate's `--plan`/`--phase` both-or-neither usage error: a gate may now declare an optional `phase?` parameter.
Kept or changed, with its `prevents`:
- `suite` now also proves a phase's criteria when given `--plan` (replaces `verdict-criteria-complete`): a change that breaks a test, a registered behavior whose test no longer runs, or (given --plan) a criterion reported met with nothing proving it.
Considered and kept:
- The guard "no numeric field anywhere in the final report": the per-phase not-testable count is carried as a list of criterion ids.
Owner decision owed: none. Note: this repository's `suite` entry passes no `--plan` (its plans are markdown), so here the criteria proof does not run in CI; it runs for projects with YAML or JSON plans.
Not-testable: 0 of 5.

## M6-P6: environment script, CLAUDE.md rewrite, token diet (#232, b0ed202)

Deleted (no whole file):
- 60a9d20 CLAUDE.md cut from 62,601 to 24,409 bytes: incident narratives, dated stories and measured tables; history stays in git, tuition and decision records.
- 60a9d20 CLAUDE.md standing warning 1 (Node versions, floor, fetching Node, build before suite): moved into `scripts/setup-env.sh`; the number is retired.
- 60a9d20 the CLAUDE.md "dual cross-model review" rule in its unconditional form: superseded by DR-0062 and DR-0063.
- 1c95cfe `roles/implementer.md` 22,008 to 11,488 bytes and `roles/_shared-dispatch-contract.md` 5,175 to 2,432: cut to what an implementer needs.
- 1c95cfe three mechanism rules shortened in their tuition entries (T-005, T-008, T-018), index regenerated; T-018 lost an evidence item about the deleted CLAUDE.md gate-block renderer.
Added or kept, with the reason:
- `scripts/setup-env.sh` and a cloud-only SessionStart hook: the environment is made deterministic by a script, not prose.
- `charter.yaml` `review-families` (single vendor, anthropic): P5 reads it at the merge base (DR-0038).
- CLAUDE.md warnings keep their original numbers (10 and 11 restored as one-liners): 59 references cite them by number.
- The mandated-reading list unchanged: each entry is required by a clause or a diagnostic.
No gate added, changed or removed.
Owner decision owed: none.
Not-testable: 0 of 4.

## M6-P5: the kernel launches reviewers (#233, 568b9f3)

Deleted:
- d3ec9d2 `producedByFromRecord`, its test, behavior row and 1 witness: a verdict no longer carries the family (DR-0062).
- 5ed6eac `dual-review-decorrelation` (the produced-by, framing and review-contract comparison, `producedByCaveat`,
  `DECORRELATION_DIMENSIONS`, `firstDeclarationCommit`), `budgetPrecondition`, `scripts/check-dual-review.mjs`,
  2 test files and a test helper, 53 behavior rows, 19 witness specs: the kernel observes the family when it launches the reviewer (DR-0062).
- e6e11bf `runRegisteredCheck` and the test and witness `merge-preconditions-composed-check-absence-is-error`: the mechanism it tested no longer exists.
- bfd941b witness `mechanism-index-claim-file-rule`: P6 rewrote its text; a re-anchor cannot pass rule (d).
- 82ba61f `produced-by` no longer required in the verdict schema (still accepted, so history validates).
- 71c2945 `review-model-family: must-differ-from-sibling-review` and `tier-by-review-tier` in `role-model-config.yaml` and its schema: no reader; the family rule is the charter's and dispatch takes `--tier`.
- 28b0592 comment diet of `gate-registry.yaml`, `assurance-modes.yaml`, `role-model-config.yaml`.
Kept or changed, with its `prevents`:
- `merge-preconditions` now counts reviews, reviewed head and family from kernel review records (a verdict with no record does not count); its precondition moved off the deleted script: a merge without the reviews its tier owes, or without green CI on the merged head.
Considered and kept:
- `verdict-pair-approves`: still reachable through `tiphys validate --type verdict --context`; the merge gate shares its per-verdict half.
- `model-resolution-subject-echo` (P3 deferred it to P5): still registered in `src/checks.ts:2636`.
Owner decision owed: none (DR-0065 decided the reviewer grant). Known limits recorded: records are unsigned; the grant bounds an honest reviewer, not a hostile one (DR-0065).
Not-testable: 1 of 7 (p5-live: one real model call, recorded in the work history).

## M6-P7: a Codex harness can run a review (#234, 4411d74, code head d879764)

Deleted: no whole file (`git diff --diff-filter=D --name-only 568b9f3 25aca6b` is empty).
- `DEFAULT_REVIEW_EXECUTOR` in `src/review.ts`: `src/` names no harness package; the default executor is now `review-executor` in `charter.yaml`.
Kept or added (no gate change; `gate-registry.yaml` identical at 568b9f3 and 25aca6b):
- `adapters/codex/review.ts`, a second `ReviewExecutor`; families from two vocabularies compare only when both are in `review-families.available`.
- `review-families.available` stays `[anthropic]`: Codex 0.159.2 prints no served model, so a Codex review cannot count yet.
Not met as written: p7-observe first half (a served model from the real Codex capture); the second half holds. Codex cost in USD not measured (tokens only).
Owner decision owed: none. The plan gives `review-families.available` to the orchestrator, and the known limit is already reported to the owner (delivery/review/arbitration-m6-p7.md).
CI fix before merge: pull-request run 36793799175 was red on `red-witness`
rule (g) (a classification witness with one member); a second member was
added, and the charter schema's `$comment` became a one-line `description`.
Checks E and F approved at d879764; PR run 36797496893 green at 976e66f.
Not-testable: 1 of 6 (p7-live: needs an OpenAI key; recorded in the work history).

## The gate list now: 8 gates, each with its `prevents`, under the phase that decided it

Source: `gate-registry.yaml` at 25aca6b (5,522 bytes; `grep -c '^  - id:'` 8, `grep -c '^    prevents: '` 8).

| gate | decided by | prevents |
|---|---|---|
| authored-bytes | M6-P3 (added, from a workflow step) | a control or non-ASCII byte in a tracked authored file, which turns a source file into binary no diff can review (T-010) |
| credential-scrub | M6-P3 (kept) | an executor child process inheriting a credential that can open or merge a pull request |
| typecheck | M6-P3 (kept, gained push) | a type error in src/, test/ or plugin/ |
| license | M6-P3 (kept) | a production dependency with a missing or non-allowlisted license in the shipped package |
| scope | M6-P3 (kept, now conditional) | a phase branch changing a file outside its phase declaration |
| red-witness | M6-P3 kept; M6-P8 changed (push, `event`) | a src/, bin/ or plugin/ change whose tests stay green when the change is mutated away |
| suite | M6-P3 kept; M6-P4 changed (criteria proof) | a change that breaks a test, a registered behavior whose test no longer runs, or (given --plan) a criterion reported met with nothing proving it |
| merge-preconditions | M6-P2 changed (per tier); M6-P5 changed (kernel records) | a merge without the reviews its tier owes, or without green CI on the merged head |

## Owner decisions

In force (all DECIDED by the owner):
- DR-0061: removal is one commit; a check gets in only if it names its failure and runs on the result.
- DR-0062: the kernel launches reviewers and records what it observed.
- DR-0063: the review tier follows the diff.
- DR-0064: acceptance criteria are tests.
- DR-0065: what a kernel-launched reviewer may do (option 1, harness-neutral).
- DR-0066: pull-request CI runs each check once.
Owed: none. `delivery/decisions/` ends at DR-0066, and each of DR-0061 to DR-0066 is DECIDED. STATE.md's M6 section names no open decision; its only "Owner decisions open" list (M5 section) reads "None."

## Not-testable, per phase (5 of 47)

Command: `awk '/^## M6-P[0-9]/{ph=$2} /^  - p[0-9]-[a-z0-9-]+: not-testable/{print ph, $2}' delivery/plan/m6-review-and-rule-economy.md`
Output: `M6-P1: p1-faithful:` / `M6-P3: p3-ci-green:` / `M6-P5: p5-live:` / `M6-P7: p7-live:` / `M6-P8: p8-time:`.
Totals from the same pattern without `not-testable`: 47 criteria.

| phase | not-testable | criteria | ids |
|---|---|---|---|
| M6-P1 | 1 | 2 | p1-faithful |
| M6-P2 | 0 | 11 | |
| M6-P3 | 1 | 8 | p3-ci-green |
| M6-P4 | 0 | 5 | |
| M6-P5 | 1 | 7 | p5-live |
| M6-P6 | 0 | 4 | |
| M6-P7 | 1 | 6 | p7-live |
| M6-P8 | 1 | 4 | p8-time |

## Blueprint outcomes, measured at 25aca6b

Where run: greps and `wc -c` in /home/user/wt/m6-report; tests in a scratch clone of the same commit
(`git checkout --detach 25aca6b`, not shallow, node v26.6.0, `npm run build` exit 0, `dist/` built,
node_modules linked from the M6-P7 worktree, whose package-lock.json blob is identical, 40e474a).

### Sizes

| file | bytes now | target | status |
|---|---|---|---|
| CLAUDE.md | 24,983 | <= 25,000 | met (was 62,601 before M6-P6) |
| implementer mandated reading | 35,035 | <= 48,000 | met (was 61,448 before M6-P6) |
| gate-registry.yaml | 5,522 | <= 10,000 | met (was 30,047 before M6-P3) |
| assurance-modes.yaml | 4,562 | <= 6,000 | met |

How the reading set is measured (as the M6-P6 work history defines it): the brief `roles/implementer.md`,
each file it `$include`s, and each `mandated-reading` entry in its frontmatter, each counted once.
`wc -c`: roles/implementer.md 11,488; roles/_shared-dispatch-contract.md 2,432; schemas/work-history.schema.json 5,427;
tuition/mechanism-index.yaml 10,166; gate-registry.yaml 5,522; total 35,035. The test that sums them
(test/implementer-brief.test.ts:868) passes (below). The schema shrank from 17,037 in M6-P4's diet.

### Blueprint acceptance criteria

Named tests run at 25aca6b in the clone (two runs, `--test-name-pattern` before the path):
run A over test/merge-preconditions.test.ts: tests 8, pass 8, fail 0, skipped 0;
run B over test/criteria.test.ts, test/gate-registry.test.ts, test/implementer-brief.test.ts: tests 6, pass 6, fail 0, skipped 0.

| criterion | proved by | status |
|---|---|---|
| version-only bump of package.json, package-lock.json, plugin/package.json is single | test/merge-preconditions.test.ts:1628 "the real 0.2.2 version bump ... classifies single ..." | pass (run A) |
| adding a dependency is pair | :1652 "adding a dependency to package.json and the lockfile classifies pair ..." | pass (run A) |
| a diff touching src/ is pair | :1859 "a diff touching src/ classifies pair ..." | pass (run A) |
| a delivery/-only diff is single | :1872 "a delivery-only diff classifies single ..." | pass (run A) |
| no runtime declaration is pair | :1888 "a project with no runtime-set declaration classifies a delivery-only diff pair ..." | pass (run A) |
| merge gate green: single, one approving hazard verdict, no arbitration | :2407 "a single change with one approving hazard verdict and no arbitration document is green ..." | pass (run A) |
| merge gate red: pair with one verdict | :2458 "a pair change with one approving verdict is red naming 1 of 2 ..." | pass (run A) |
| merge gate red: two verdicts, same kernel-recorded family, no exception | :2586 "two approving verdicts whose kernel-recorded families match ... are red at condition-1" | pass (run A) |
| plan schema rejects a criterion with neither check nor not-testable | test/criteria.test.ts:166 "a plan criterion with neither check nor not-testable, or with both, is rejected ..." | pass (run B) |
| gate registry schema rejects a gate without prevents | test/gate-registry.test.ts:1846 "the registry schema rejects a gate without prevents ..."; `node bin/tiphys.ts validate --type gate-registry gate-registry.yaml` exit 0, no output | pass (run B) |
| no gate reads produced-by | `grep -rn "produced-by\|producedBy" src scripts plugin/src`: no output, exit 1 | met |
| retirement inventory files, their test, gates.manifest.json absent | `test ! -e` on retirement-inventory.json, retirement-inventory.md, test/retirement-inventory.test.ts, scripts/check-retirement-inventory.mjs, gates.manifest.json: exit 0 each | met |
| CI green on pull request | `gates` check run concluded success on the exact merged head of P2 (901e041), P3 (34feb90), P8 (8dd5e68), P4 (b4e93ce), P6 (e42a4bb), P5 (c9792a5): condition-4 row of each delivery/review/m6-p*-merge-preconditions-*.txt. P7 (976e66f, delivery/review/m6-p7-merge-preconditions-976e66f.txt). P1: no merge record in the tree | met for 7 of 8 phases (observed in those records) |
| CI green on push | STATE.md: push runs green for P1, P2, P3 (36762915815), P6 (36777401327); P8 and P4 runs cancelled by the next merge (T-009); P5 run 36792621178 red on two stale `scripts/` witnesses (removed in the close-out) | see "Push runs at the close" below |
| sizes | the table above | met |
| npm run build and npm test green | `npm run build` exit 0; `npm test` 1246 tests, 1245 pass, 1 fail, 0 skipped (see "Suite at 25aca6b") | build met; suite NOT established here (the one fail is consistent with the clone location) |
| red-witness green on every src change | deduced: every merged head's `gates` pull_request run concluded success, and the runner exits nonzero on a red required gate (test/gate-registry.test.ts:1563, pass in run B). Observed gate lines in work histories: P3 at b7a5f02 (182 evaluated), P8 at e10f56b (419), P5 at acc09b0 (451), P2 at 6414c51 before its fix round (108); P6 not applicable (no src/ change) | met, partly deduced |

Plan criterion p4-diet (`grep -rl '\$comment' schemas/` finds nothing): MET on main (568b9f3: 0 hits in
schemas/charter.schema.json). FAILS at 25aca6b: `schemas/charter.schema.json:162` carries a `$comment`
added by M6-P7 commit 53e0bf3. Fixed before M6-P7 merged: `e42a1ba`
replaces it with a one-line `description`; `grep -rl '\$comment' schemas/`
prints nothing at d879764.

Push runs at the close: 568b9f3 (M6-P5), run 36792621178, RED on
`red-witness` only (408 stored evaluated in 57 minutes; two witnesses for
`scripts/release-verify.sh`, see "Found at the close"); suite 1240 pass, 0
fail, 0 skipped, and every other gate green. The close-out pull request
removes the two witnesses; the push run on its merge is the last CI evidence
and is reported to the owner after this file merges.

### Suite at 25aca6b

`npm run build`: exit 0, `git status --short` empty after. `npm test` in the scratch clone (node v26.6.0, `dist/` built,
invocation `npm test`, 2026-10-01T00:04:16Z to 00:10:58Z): exit 1.

```
i tests 1246
i pass 1245
i fail 1
i cancelled 0
i skipped 0
x a precondition command exiting nonzero is error, not a skip, whenever a path-shaped argv element cannot be opened: unreadable, after an option, or carrying whitespace
  stderr=tiphys gates run: the gate-registry schema could not be loaded: the shipped schemas/ directory was not found above this module; the installation is incomplete
```

TRANSLITERATED: U+2139 rendered `i` 5 times, U+2716 rendered `x` 1 time, and the test's duration suffix dropped; nothing else changed.

The one failure is consistent with where the clone sits, not with the branch: the test runs its child as
uid 65534 (test/gates.test.ts:3326, :3376), and the clone is under /tmp/claude-0, which is mode 700
(`ls -ld /tmp/claude-0`: `drwx------ root root`), so that uid cannot reach `schemas/` (CLAUDE.md warning 15).
Not re-run from a traversable path: this task may write only under its own scratch directory. Not established
here: the suite green at 25aca6b. Last recorded results: M6-P7 work history at e77ff1d, 1244 pass, 0 fail, 0 skipped;
arbitration-m6-p7.md fix round 1 at f99b8d7, 1245 pass, 0 fail, 0 skipped.

CI settles the suite: pull-request run 36797496893 at 976e66f (M6-P7's
landing head, same code as 4411d74), `suite: green ... reported 1246
test(s) ... (pass 1246, fail 0, skipped 0, todo 0, did-not-run 0)`.

## Found at the close

The `red-witness` precondition covers only `src/`, `bin/` and `plugin/`. A
pull request that changes only a file a stored witness mutates or runs never
evaluates it (delivery/tuition/T-049). It happened twice:

- M6-P6 rewrapped tuition text a witness mutates; the witness surfaced red on
  M6-P5's pull request and was removed.
- PR #211 (2026-09-23) added two witnesses for `scripts/release-verify.sh`
  and touched no `src/`, so they were never evaluated. The first full sweep
  found one collapsing under rule (g) and the other's members 1 to 4 staying
  green. Removed in the close-out (3749abf, DR-0061); their tests and
  behavior rows stay.

Proposed for a later milestone, not done here: widen the precondition to the
files stored witnesses mutate or run.

A second gap surfaced on the close-out pull request itself (#235). Its title
names no phase, so the pull-request step passed the branch name,
`claude/upbeat-gates-w3cm5m`, as `--phase`. `tiphys review dispatch` refuses a
phase with `/` (src/review.ts:505), so no review could be recorded for it and
`merge-preconditions` stayed red for any such pull request. The fix rides
in the close-out before it merges: the step turns a non-phase branch name
into a phase id the kernel accepts (`claude-upbeat-gates-w3cm5m`) and fails
loudly when it cannot (delivery/work-history/m6-close-fix.md).

## final-report.yaml

delivery/evidence/m6-final-report.yaml, validated at the close with
`node bin/tiphys.ts validate --type final-report`: no output, exit 0. Red
check of the validator: a copy with `not-testable` removed printed
`INVALID #/not-testable required property not-testable is missing`, exit 1.

## Not established here

- PR CI for M6-P1 (no merge record in the tree).
- red-witness per merged head from CI's own `summary.json` rows; only the bundles' success and local gate lines are quoted.
- The push run on the close-out merge (observed after this file merges).
