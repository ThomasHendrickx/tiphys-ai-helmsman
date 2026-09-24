# Delta verification, M5-P3 fix round 1, criteria contract

- Date: 2026-09-23
- PR: #213, branch claude/m5-p3-live-review-evidence
- Previous head reviewed: c4727e555cda76d2bee4ddb376a1e8f2f9fda6e1 (APPROVE, 3 low)
- Head verified: H2 = 3f78dce2ee965672ea55423c3fc9a33dddca1145
- Contract: criteria. Model family: Anthropic Claude Opus (produced-by `anthropic-claude-opus`, kept)
- Method: the real runner on the real repository at H2, with verdict JSONs committed on top of H2 in a scratch lab
  worktree. Each witness mutation was applied byte-for-byte from its spec. Full suite on node v26.6.0.
- Machine verdict: `delivery/review/m5-p3-criteria.json` (head = H2).

## Verdict: APPROVE

One low finding: CR-001, carried from the first review. It is still CI-deferred and does not block. There are no
regressions.

Validator: `node bin/tiphys.ts validate --type verdict delivery/review/m5-p3-criteria.json` gives **exit 1**. It
prints five `SKIPPED ... no context` lines and no `INVALID` line, which is the passing condition the role states.

## What the round changed

`git diff c4727e5..3f78dce --stat` lists 9 files, 443 insertions and 7 deletions:
- `.github/workflows/gates.yml`
- the declaration
- the work history
- `test/behaviors.json`
- `test/dual-review.test.ts`
- `test/merge-preconditions.test.ts`
- one capture and two witness specs

**No shipped code changed.** `git diff --stat c4727e5..3f78dce -- src/ bin/ schemas/ roles/ tuition/` prints
nothing. `src/gates/scope.ts` at H2 is blob 679c9c9b, byte-identical to origin/main.

## The fix-round findings

- Sonnet CR-002 (medium), `resolveHeadFlag` untested: **CLOSED.** There are two new real-CLI tests.
  - Their witnesses are `witness/m5-p3-symbolic-head-resolved.json` and
    `witness/m5-p3-dual-review-symbolic-head-resolved.json`.
  - I applied each dangerous state exactly as its spec states it; each `find` occurs exactly once. The named test
    went red every time:

| mutation | named test |
|---|---|
| control, H2 unmodified | 1 test, 1 pass (each file) |
| merge-preconditions state 0: `const head = (flags.head as string).toLowerCase();` | 1 test, 0 pass, 1 fail |
| merge-preconditions state 1: resolve in `process.cwd()` rather than the context | 1 test, 0 pass, 1 fail |
| check-dual-review state 0: `options.head?.toLowerCase()` into `evaluate` | 1 test, 0 pass, 1 fail |
| check-dual-review state 1: budget head lowercased | 1 test, 0 pass, 1 fail |
| extra, mine: `resolveHeadFlag` made to return `value.toLowerCase()` outright | 1 test, 0 pass, 1 fail |

  The last failure was an assertion, not a crash: "HEAD: merge-preconditions: error (0 merge preconditions
  evaluated)". The red-witness gate at H2 independently reports green, "24 witness(es) evaluated (14 own, 10
  stored)", where c4727e5 had 22 (12 own). The gate re-derives the red itself.
  - The two witnesses are structurally different: one skips resolution, the other resolves in the wrong directory.
    Their spellings, `HEAD` and a mixed-case branch, fail in different ways. That meets "one witness is not a class".
- Sonnet CR-001 (low), workflow step text: **CLOSED.** The informational step is now named "Dual-review
  decorrelation, informational only (M3-P9; the enforcing review gate is merge-preconditions)". Its not-applicable
  message says it is not the review requirement. The command logic is unchanged.
- Sonnet CR-003 (low), declaration entries: left as they are. No objection from this contract. The two declared
  entries that are never touched are harmless, and the scope gate prints them.
- My CR-002 (low), review class: **CLOSED.** `gateClasses.review` is now `[check-dual-review,
  merge-preconditions]`, and the gate-classes gate is green at H2 naming both.
- My CR-001 (low), job-token scope: **still open, and correctly left open.** Only a CI run on a verdict commit can
  answer it. It is carried into the H2 verdict.
- My CR-003 (low), placeholder path: not addressed. It was optional. No objection.

## Criteria re-walk at H2 (all MET, no regression)

Every arm below went through the real runner: `tiphys gates run --registry gate-registry.yaml --mode full --only
<gate> --base <base> --head HEAD --phase m5-p3`.

| arm | check-dual-review | merge-preconditions |
|---|---|---|
| A0 H2, no verdict | exit 1 red, 0 of 2, 2 missing | exit 1 red, 0 of 2, 2 missing |
| A1 one verdict | exit 1 red, 1 of 2, 1 missing | exit 1 red, 1 missing |
| A2 FIX-ROUND-NEEDED + APPROVE | exit 1 red | exit 1 red, condition-2 |
| A3 shared produced-by | exit 1 red | exit 1 red, condition-1 |
| A3b shared review-contract | exit 1 red | exit 1 red, condition-1 |
| A4 approving decorrelated pair | exit 0 green | review checks green; reaches network, error at condition 4 (local-only commit) |
| A5 approving pair then src/ commit | exit 1 red, verdicts EXCLUDED | exit 1 red, EXCLUDED line present |
| A6 approving pair then delivery-only commit | exit 0 green | review checks green |
| A7 delivery-only, base H2 | exit 21 not-applicable, tier none | same |
| A8 scripts-only, base H2 | exit 21 not-applicable, tier single | same |
| A9 witness-only, base H2 | exit 1 red, 2 missing (fail closed) | same |

Every row matches the c4727e5 result.

- p3-output-contract: the role and brief sources did not change in this round, so compose output is unchanged. The
  H2 verdict validates (above).
- p3-scope-unchanged: byte-identical (above). The scope gate is green on a phase-named clone branch at H2: 35 paths,
  the 3 new witness entries ADDED at head and printed by name, the same 2 declared-but-untouched paths. I sign off
  the three additions.
- p3-suite: node v26.6.0, `dist/` built. `npm ci` exit 0 and `npm run build` exit 0. `git status` afterwards shows
  only this review's three untracked files. `npm test` exit 0: **1441 tests, 1441 pass, 0 fail, 0 skipped**. That is
  1439 plus the 2 new tests. clause-map is green with 74 rows.
- Both new behaviors (`m5-p3-symbolic-head-resolved`, `m5-p3-dual-review-symbolic-head-resolved`) resolve. Their
  titles match their tests, and the suite gate's behavior check passes inside `npm test`.

## The produced-by question

**Confirmed.** The shipped code compares produced-by as a canonicalised string, not as a model family.

- The compared dimensions are declared at src/checks.ts:2898: `produced-by`, `framing`, `review-contract`.
- Each value is canonicalised by `canonicalScalar` at src/checks.ts:3738. That means NFKC fold, a refusal of any
  character outside 0x20 to 0x7E, whitespace collapse and trim, and ASCII lowercase (src/checks.ts:3755).
- Two verdicts are correlated only when the canonical strings are EQUAL. The message is built at
  src/checks.ts:5352.
- The green REPORT line states the limit itself, at src/checks.ts:2940: "not a cross-family assertion".

Measured through the real runner at H2, with approving pairs committed on top of H2:

| produced-by pair | check-dual-review |
|---|---|
| `anthropic-claude-opus` vs `claude-sonnet-5` (the two real values) | exit 0 green; REPORT "... produced-by was compared as a canonicalised STRING and not as a model FAMILY ... not a cross-family assertion" |
| `Claude-Sonnet-5` vs ` claude-sonnet-5 ` | exit 1 red, "produced-by value claude-sonnet-5 occurs in 2 of the 2 verdicts" |

So the two reviews of this PR count as distinct. Whether Opus and Sonnet are "different model families" in DR-0012's
sense is a policy question, and the record answers it. DR-0012's own instruction says the two reviewers run "on
different models (one Opus, one Sonnet)"
(delivery/decisions/DR-0012-delegated-merge-authority.md:14). So this pairing is the one the owner asked for, and
DR-0038's single-family exception is not needed.

The two reviewers spell the field in different styles, one with the vendor prefix and one without. That is
harmless today, because the charter declares no `review-families`. It would matter if DR-0038 families were ever
declared.

## Probes run

- The three-dot and two-dot diffs agree here, because H2 descends from c4727e5 and there is no merge in the round.
- The live CI run for PR #213 at the new head was `in_progress` when this was written. It is expected to be red on
  merge-preconditions with 2 missing, by design, until the verdicts are committed. I did not wait for it.

## Honest failure

- The job-token scope (CR-001) and the in-flight rule inside a real Actions run are still unobservable until the
  verdicts are committed.
- I did not re-run brief compose at H2. I relied on the fact that none of its inputs changed.
