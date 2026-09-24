# Clean-room review M5-P3, criteria contract

- Date: 2026-09-23
- PR: #213, branch claude/m5-p3-live-review-evidence
- Head reviewed: c4727e555cda76d2bee4ddb376a1e8f2f9fda6e1 (base origin/main 28d1c68)
- Contract: criteria (clause review-contract-criteria of roles/clean-room-reviewer.md at H)
- Model family: Anthropic Claude Opus (produced-by `anthropic-claude-opus`, framing `criteria-contract`)
- Method: re-executed every criterion through the real runner (`tiphys gates run --registry gate-registry.yaml --mode full`)
  on the REAL repository at H, with verdict JSONs committed on top of H in a scratch lab worktree. Ran mutation
  tests in the same lab. Read live CI for PR #213. Toolchain node v26.6.0 (scratch prefix, checked in each shell).
- Machine verdict: `delivery/review/m5-p3-criteria.json`.

## Verdict: APPROVE

Findings: 0 high, 0 medium, 3 low (CR-001 to CR-003). None blocks merge.

## Validator

`node bin/tiphys.ts validate --type verdict delivery/review/m5-p3-criteria.json` (no `--context`): **exit 1**. It
prints five `SKIPPED ... no context` lines and no `INVALID` line. That is the passing condition the role states
("reports no INVALID line"). The nonzero exit comes from the context checks being skipped.

## Criteria walk

### p3-output-contract: MET

> tiphys brief compose for both review contracts names a distinct top-level JSON path under delivery/review, and
> both produced documents validate as verdicts.

- `brief compose --role clean-room-reviewer --phase templates/plan.example.yaml --phase-id M9-P1 --review-contract criteria`
  exit 0. It contains exactly one "Your verdict file is `delivery/review/<phase-id>-criteria.json`". The hazard
  contract: exit 0, exactly one `...-hazard.json`. Distinct, top level. See CR-003 on the placeholder.
- This document's JSON sibling was written at the path the criteria brief names and validates (above).
- In the real-repository lab (arm A4 below), two role-shaped verdict JSONs were admitted by the real gate.

### p3-missing-is-red: MET, both directions

> The real full-mode gate command against a fixture branch changing src/ with zero or one admitted verdict exits
> nonzero with status red and names the missing count.

Lab on the real repository. Command per arm:
`node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only <gate> --base <base> --head HEAD --phase m5-p3 --evidence <scratch>`

| arm | check-dual-review | merge-preconditions |
|---|---|---|
| A0 H itself, no verdict | exit 1, red, "0 of 2 are admitted and 2 missing" | exit 1, red, same count |
| A1 one verdict | exit 1, red, "1 of 2 are admitted and 1 missing" | exit 1, red, same count |

Live CI confirms the enforcing arm. PR #213, run 35873885121, job 107224684456, head c4727e5:
`gates: merge-preconditions: red: ... 0 of 2 are admitted and 2 missing. A missing review is RED, never not-applicable (M5-P3)`,
then `m2-exit-test: FAILED ... (assertion exit 1)`. It was the only red gate. So CI now fails on a shipped change
with no review, which is the phase intent.

Mutations, one at a time, in the lab. Each was run through the named real-runner tests, then restored:

| mutation | result |
|---|---|
| control | 2 tests, 2 pass |
| `tierOfPath` fallback `dual` to `none` (fail open) | 2 of 2 fail (missing-review tests, both gates) |
| `check-dual-review` `admittedCount < REQUIRED_VERDICTS` to `false` | 2 of 2 fail |
| registry precondition reverted to `--precondition .` (verdict presence) | 2 of 2 fail |
| ONLY `gates.manifest.json` precondition reverted (what CI's `--manifest` reads) | test/gate-registry.test.ts reds, 1 fail of 151 |

The last row matters. The registry and the manifest cannot drift apart silently, and the manifest is what CI runs.

### p3-pair-arms: MET

> The same command is red for a FIX-ROUND-NEEDED pair and for a correlated pair, and green only for two APPROVE
> verdicts with distinct contracts, framings and declared families over the reviewed shipped tree.

| arm | check-dual-review | merge-preconditions |
|---|---|---|
| A2 FIX-ROUND-NEEDED + APPROVE | exit 1 red, verdict-pair-approves | exit 1 red, condition-2=red, network not evaluated |
| A3 shared produced-by | exit 1 red, "not decorrelated on produced-by" | exit 1 red, condition-1=red |
| A3b shared review-contract | exit 1 red, "not decorrelated on review-contract" | exit 1 red, condition-1=red |
| A4 approving decorrelated pair | **exit 0 green**, "2 of 2 ... admitted by ANCESTRY" | review rows green; proceeds to network conditions, error at condition 4 for a local-only commit (correct) |
| A5 approving pair then a src/ commit (review of old code) | exit 1 red, 0 of 2 admitted, verdicts named NOT evidence | exit 1 red, EXCLUDED line names "1 path(s) outside delivery/" |
| A6 approving pair then a delivery-only commit | exit 0 green (ancestry admits) | review rows green |

Shared framing is not in my lab. It is covered by the passing test "a refusing pair, a shared family, a shared
framing and a shared contract are each red through the real runner".

In-flight arms, by mutation: removing the head filter in `inFlightCheckRuns` reds "an in-flight gates run for a
different head is not counted as this head's CI in flight". Removing the "every review row green" guard reds "a
refusing pair inside the unconcluded CI of its own head stays red". So D-2 cannot soften a refusal without a red.

### p3-paperwork-budget: MET

> A fixture branch changing only delivery/ follows its declared review budget and is not forced through the
> shipped-code two-verdict rule.

| arm (commit on top of H, base H, so H's gate code runs) | both gates |
|---|---|
| A7 `delivery/STATE.md` only | exit 21, not-applicable, precondition `review-budget-requires-dual-review`, "delivery/STATE.md: none" |
| A8 `scripts/check-id-collisions.mjs` only | exit 21, not-applicable, tier `single` (D-5) |
| A9 `witness/zz-probe.json` only (control) | exit 1, red, 2 missing: `witness/` is not on DR-0027's table and is dual, fail closed (open question 5) |

### p3-scope-unchanged: MET

> src/gates/scope.ts is byte-identical to the baseline and its existing phase-own-evidence tests accept
> delivery/review/m5-p3-criteria.json while refusing another phase's filename.

- `git diff --quiet origin/main HEAD -- src/gates/scope.ts` exit 0. The blob is 679c9c9b at origin/main, at H and at
  the cut point 5662d74. The additive-grant rule it enforces is described at src/gates/scope.ts:110.
- The test "the scope gate's phase-own-evidence rule accepts this phase's verdict file names and refuses another
  phase's" passes. It accepts m5-p3-{criteria,hazard}.json in either case. It refuses m5-p2, m5-p30 and one
  directory down.
- The scope gate is green at H. I ran it on a scratch clone with the phase branch name, and it is also green in CI
  run 35873885121. It reports 32 paths, 20 entries ADDED at head and printed by name, and 2 declared paths not
  touched. I sign off all 20 (see D-1).

### p3-suite: MET

> npm run build and node --test both exit 0 with a nonzero test count.

node v26.6.0, dist built. `npm ci` exit 0. `npm run build` exit 0, and `git status` was clean apart from this
review's untracked files. `npm test` exit 0: 1439 tests, 1439 pass, 0 fail, **0 skipped**. The CI suite gate
reports the same 1439 / 0 skipped, with 1314 behaviors resolved. Invocation: `npm test`, not bare `node --test`
(standing warning 12). All 17 new `m5-p3-*` behaviors in test/behaviors.json resolve to exactly one `test("...")`
title each (counted by script).

## Deviations

- D-1 additive grants: SOUND. Every one of the 20 added entries is used or plainly needed. None is removed.
- D-2 in-flight rule: SOUND and necessary. Without it, condition 4 is red on every reviewed head forever. It is
  narrow (head-scoped, needs green review rows), and both properties are mutation-witnessed. The stated cost is real:
  CI can never turn merge-preconditions green. The orchestrator's pre-merge run after CI concludes is the one that
  decides conditions 4 to 6, and DR-0012 needs green, not not-applicable.
- D-3 token: SOUND. It is a declared flag and the value is never written. Token scope is unproven (CR-001).
- D-4 manual pair-arm witness: SOUND. I independently reproduced each arm end to end on the real repository.
- D-5 row 2 not enforced: SOUND for this phase. It matches the plan's "declared lower review budget". The owner
  question stays open.
- D-6 retirement inventory: SOUND. `node scripts/check-retirement-inventory.mjs --repo . --json delivery/plan/cutover/retirement-inventory.json`
  reports "323 row(s) against 323 derived rule anchor(s), 2 retired", exit 0.

## Open questions

1. Condition 6 and the out-of-tree arbitration: a real tension with DR-0031. It does not block, because the
   in-flight arm returns before condition 6 in CI. A later phase is the right place.
2. Row 2 single verdict: an owner or plan question. It does not block.
3. Job-token scope: see CR-001. Observe it on the verdict-commit run before merging. It does not block, because that
   run happens before merge by construction.
4. Squash-merged verdicts on main: PROBED and benign. I simulated main after a squash (the tree of H plus two
   verdicts naming H, where H is not an ancestor; `git merge-base --is-ancestor` exit 1). I ran the legacy workflow
   step exactly as written, on that main and on a next-phase branch changing `src/`. Both times the precondition is
   unmet and the step takes its echo branch with exit 0. On the next-phase branch, merge-preconditions through the
   runner is red with 2 missing. So the stale m5-p3 verdicts neither break CI nor count for a later phase.
5. `witness/` in the dual tier: confirmed by arm A9. Fail closed is the direction the plan asks for. Moving it to
   row 2 is an owner call. It does not block.

## Findings

- **CR-001 (low)**: the job token's `checks` read scope is unestablished. `.github/workflows/gates.yml` at H has no
  `permissions:` block. The repository default cannot be read from here: the proxy answers HTTP 403 for
  `actions/permissions/workflow`. If the default is restricted, the check-runs read 403s. The in-flight rule then
  cannot fire, and the gate goes on to red conditions 5 and 6 on every reviewed head. Fix: read the merge-preconditions
  line on the verdict-commit run. If it shows a 403, add `permissions: {contents: read, checks: read}` at job level
  and re-run.
- **CR-002 (low)**: the declaration's `gateClasses.review` names only `check-dual-review`. The runner never runs that
  gate in CI; the CI gate-classes line itself says "satisfied ONLY BY NAMING a gate". The enforcing gate is
  merge-preconditions (harness row scripts/m2-exit-test.sh:226). Fix: add `merge-preconditions` to the review class
  as an additive entry.
- **CR-003 (low)**: the composed briefs name `delivery/review/<phase-id>-<contract>.json` as a template, even though
  compose is given `--phase-id`. The placeholder is defined in the same brief, so the criterion is met. Optional fix:
  substitute the lower-cased phase id at compose time.

## Probes run (including those that found nothing)

- Two-dot versus three-dot: all diffs were `origin/main...H` (three dot). The merge-tree was not needed.
- Real-repo arms A0 to A9 above, 18 gate invocations, all through the real runner and the shipped registry.
- Mutations M1 to M5 and the manifest-only mutation. Every mutant was killed.
- The CI checkout uses the head branch by name (`ref: github.head_ref`). So HEAD in CI is the branch tip and not a
  merge commit, and ancestry admission is computed against the reviewed branch. No finding.
- `requiredParameters` in src/gates/run.ts:671 takes `base` from the gate's declared parameters. The PR step passes
  `--base pull_request.base.sha`. No finding.
- Authored bytes (`node scripts/check-authored-bytes.mjs`) exit 0. Agent-rules drift `--check` exit 0, 21 gates.
- red-witness at H: green, 22 witnesses (12 own, 10 stored). clause-map green, 74 rows. citations not-applicable.
- Claim grep on the work history, both forms: 5 line hits and 9 wrap-insensitive occurrences. The extra ones are
  inside the history's own description of the grep. Each hit is an id, captured output, or asserted by a named test.
  No R-087 finding.
- The work-history gate table is at 754458b, not H. H is the merge of main into the branch. My runs and CI run
  35873885121 at H supersede it. No finding.

## What this contract did not reach (honest failure)

- The job token's real scopes and the in-flight arm inside a real Actions run. Neither can be observed until the
  verdicts are committed (CR-001). The proxy refuses the Actions permissions endpoint here.
- An end-to-end green of merge-preconditions. It needs the scope record, the arbitration and check runs at a pushed
  head, and it cannot be green inside CI by D-2's design.
- The hazard contract's questions are left to the hazard reviewer. Meeting every criterion is one input and is not a
  completeness claim. I checked only the arms and properties listed above.
