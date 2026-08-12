# DR-0027: reviews target shipped value, not ceremony

- status: **DECIDED by the owner, 2026-08-12**
- supersedes nothing; it NARROWS the scope of DR-0012's condition 2 rather than
  reopening it

## The owner's decision, in their words

> The reviews should focus on value parts of the repository and not on semantics
> and philosophical stances on ceremony files. The review rounds are there to
> maximise value, not give room for reviewers to lose themselves in zero value
> work. Focus is the value this whole harness will deliver in the end state. The
> semantics and ceremony to get there is of the lowest value.

## What it cost to learn this

Measured over 24 hours: 29 merges to `main`, of which **2** touched `src/` or
`bin/`. Roughly 1.66 million subagent tokens, spent almost entirely on
`scripts/m2-exit-test.sh` and `test/watcher.test.ts`, neither of which ships.
M3 phase count unchanged at 5 of 10.

Five fix rounds and four delta verifications ran on one non-shipping harness.
Each verification was individually correct. Each produced a finding labelled
MEDIUM, and DR-0012 condition 2 blocks a merge on any MEDIUM, so the loop had no
floor: round 3 found a gap in round 2's guard, round 4 in round 3's, round 5's
finding was a gap in an auxiliary check covering a region of a freeze covering a
region of a check, reachable only by a future editor writing a specific mutation
inside a closure.

The aggravating fact: rounds 1 and 2 of that harness were ALREADY on `main`
(tuition T-019), green and doing their job. Rounds 3 to 5 perfected a guard whose
predecessor was already in production and harming nothing.

## The rule

**1. Verification depth follows shipped value.**

| tree | treatment |
|---|---|
| `src/`, `bin/`, `schemas/`, `roles/`, `tuition/` (the npm package) | full contract: dual clean-room review, delta verification, MEDIUM blocks merge |
| `scripts/`, `test/`, `.github/`, `gate-registry.yaml`, `gates.manifest.json` | ONE review round. Findings are recorded and tracked. They do NOT block a merge unless they make a SHIPPED artifact wrong |
| `delivery/**`, `CLAUDE.md`, `.claude/**` | no review round. Land it |

**2. A MEDIUM blocks only if it can reach a shipped artifact or a real user
path.** A gap reachable solely by a future editor of the guard itself is a
TRACKED ITEM, not a blocker. The severity label is not the test; reachability is.

**3. Two fix rounds per branch, hard.** After the second, the branch merges with
its open findings recorded, or it is abandoned. There is no third round.

**4. The reviewer's brief must name the shipped behaviour at risk.** A review
that cannot say which user-visible or package-visible thing breaks has found
nothing worth a round.

## What this does not change

- The gates still run and still have to be green. This is about REVIEW rounds
  and merge blocking, not about CI.
- `src/` and `bin/` keep the full contract. The cost above was not caused by
  verifying the product; it was caused by verifying the scaffolding.
- Recording a finding stays cheap and stays required. What changes is that
  recording it is now usually the END of the matter rather than the start of a
  round.
