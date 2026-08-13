# Clean-room review: M3-P9, acceptance criteria as contract

Reviewer: independent clean-room agent, lens = ACCEPTANCE CRITERIA AS A CONTRACT.
Head under review: `claude/m3-p9-agents-policy` at d9d5a1d, PR #131.
Review branch cut from `main` at 12f84f9 (T-019: never cut evidence from the branch under review).
Started 2026-08-13. This file is written incrementally; an incomplete file means the
reviewer died, not that the review passed.

Toolchain for every command below unless stated otherwise: node v26.6.0 from the
scratch prefix, confirmed by `node --version`.

## STATUS: IN PROGRESS

(sections appended as work proceeds)

## Environment established

- `node --version` prints `v26.6.0` in every shell below.
- Worktree of d9d5a1d cut with `git worktree add --detach` under an absolute
  scratch path. `npm ci` exit 0, `npm run build` exit 0, `git status --short`
  EMPTY after the build (the clean-tree acceptance criterion of the standing
  gate list).
- `origin/main` is 12f84f9 and d9d5a1d is a merge of it, so `origin/main...HEAD`
  is the branch's own change set: 24 files, 5128 insertions.

## Criterion 1: `tiphys validate --type role-brief AGENTS.md`

EXECUTED. Exit 0. The command prints NOTHING on success, which I checked is
this command's normal behaviour rather than a swallow: the same command against
`roles/implementer.md` on the same head is also silent and also exit 0, and both
stdout and stderr are empty. The `role: orchestrator` half of the criterion is
satisfied by the frontmatter's first field, read directly. MET, with the note
that "exits 0 with role: orchestrator" is discharged by validation passing over
a document whose declared role is orchestrator, not by any printed line.

## Criterion 2: `node scripts/check-agents-references.mjs`

EXECUTED at head. Exit 0, printing
`check-agents-references: green (21 references resolved)`.

## Criterion 7 and 7b: dual-review decorrelation, ALL SIX DIRECTIONS

EXECUTED INDEPENDENTLY. I did not run the phase's own test; I built my own
staging lab, copying the head's `assurance-modes.yaml`, writing my own
`charter.yaml`, and dropping the phase's verdict fixtures into
`delivery/review/`. Measured exit codes:

| direction | mode | verdicts | exit | verdict line |
|---|---|---|---|---|
| decorrelated pair | full (delegated-under-conditions) | criteria + hazard | **0** | green, "distinct on produced-by, framing, review-contract" |
| shared `produced-by` | full | both family-a | **1** | red, names `family-a` |
| shared `framing` | full | both criteria-contract | **1** | red, names `criteria-contract` |
| only one verdict | full | one | **1** | red, "only 1 verdict document(s) exist" |
| shared `review-contract` (7b) | full | both `criteria` | **1** | red, names `criteria` |
| owner authority | direct-pr (merge-authority `owner`) | shared-family pair | **0** | green, REPORT names the mode and the authority |

The owner arm is the one worth stating carefully: it exits 0 on a pair that the
delegated arm reddens, which is exactly what criterion 7 asks for, and it does
NOT print the same line as the green pair. It prints a REPORT naming the mode
and the authority, so "nothing to check here" and "checked and fine" are
distinguishable at the terminal, which is SC-011.

## Attack point 1: was the fail-closed property preserved or deleted?

PRESERVED, and I verified it three ways rather than reading the claim. The
derived check now REPORTS on an absent charter (so an M3-P7 verdict context
carrying no charter is not reddened), and the refusal moved to
`scripts/check-dual-review.mjs`, which is the path DR-0012's grant runs
through. Measured, each with a SHARED-FAMILY pair staged so that a green would
be a wrong merge authorisation:

| broken regime state | exit | status |
|---|---|---|
| `charter.yaml` absent | **21** | error, "a merge check that cannot determine the regime reports error, never green" |
| `assurance-modes.yaml` absent | **21** | error, same shape |
| charter names a mode nothing defines | **1** | red, names the mode and both verdict files |

Three structurally different broken-regime states, none of them green. The
teeth are real and they are on the merge path.


## Attack point 2: the witness contract, re-derived BY HAND

The implementer's account of the harness rule is CORRECT. `src/witness/run.ts`
computes a member's redness as `red: exitCode !== 0 && failed.length ===
tests.length`, so a spec naming two tests is red only when BOTH fail, and two
members each reddening a different named test can never produce a red member.
The repair is two specs with one test each.

I did not take the hand-verification on trust. I re-derived it: copied
`src/checks.ts` aside, applied each declared mutation myself with a script that
REFUSES unless the find text occurs exactly once, ran ONLY the named test with
`--test-name-pattern` placed BEFORE the positional path, and restored by `cp`
(never `git checkout --`). Captured counts:

| spec | member | exit | tests | pass | fail |
|---|---|---|---|---|---|
| distinct-model-families | control, unmutated | 0 | 1 | 1 | 0 |
| distinct-model-families | `paths.length < 2` to `true` | 1 | 1 | 0 | 1 |
| distinct-model-families | authority gate to `true` | 1 | 1 | 0 | 1 |
| requires-two-verdicts | control, unmutated | 0 | 1 | 1 | 0 |
| requires-two-verdicts | `group.length < 2` to `false` | 1 | 1 | 0 | 1 |
| requires-two-verdicts | authority gate to `true` | 1 | 1 | 0 | 1 |

Every mutated member reports `fail 1` of `tests 1`, so `failed.length ===
tests.length` holds and the harness reads each member as red. `cmp` confirmed
`src/checks.ts` byte-identical to the pristine copy afterwards and
`git status --short` was empty.

TRANSLITERATION DECLARED. Node's reporter prefixes its summary lines with
U+2139 and its pass and fail marks with U+2714 and U+2716. In the capture the
table above was read from, U+2139 was replaced with `i` (24 occurrences),
U+2714 with `ok` (0 occurrences in the filtered capture), and U+2716 with `x`
(0 occurrences in the filtered capture). Nothing else in any captured output
was changed.

## Criteria 2 and 2b: BOTH directions, on MY staging not the phase's

I built my own `git archive HEAD | tar -x` staging and overlaid the working
tree's `AGENTS.md`, then drove the shipped checker with `--root`. Baseline
green, 21 references.

| direction | exit | line the checker printed |
|---|---|---|
| baseline | 0 | green (21 references resolved) |
| C2: `roles/investigator.md` moved away | 1 | names the reference AND the path: "...names roles/investigator.md, which is not a readable file under..." |
| C2: restored | 0 | green |
| C2b member A: heading `## clause fix-round-mechanism:` RENAMED, file present | 1 | "names heading anchor clause-fix-round-mechanism, which no heading in roles/implementer.md carries" |
| C2b member A: restored | 0 | green |
| C2b member B: YAML key `pipeline:` renamed to `stage-sequence:` | 1 | "names field pointer modes.full.pipeline, which stops resolving at pipeline" |
| C2b member B: restored | 0 | green |

The two 2b members ARE structurally different in the sense the plan asks: one
is located by scanning heading text and slugging it, the other by DECODING YAML
and walking a dotted pointer, and the diagnostics name different failure modes.

## Attack point 4: is the `git archive` staging unlike the real tree?

NO. Answered by inspection of what the staging contains and what the checker
reads. The staging is a tar of the ENTIRE tracked tree at HEAD, so every
artifact the checker touches is present in its real form: `roles/`,
`assurance-modes.yaml`, `gate-registry.yaml`, `role-model-config.yaml`,
`checklists/`, `schemas/`, `tuition/`. The only deltas from the working tree
are untracked files (which the checker never reads) and the deliberate
`AGENTS.md` overlay. My own staging reproduced the head's exact baseline,
`green (21 references resolved)`, which is the same number the checker prints
against the real repository root. The witness is not proving something about a
toy.

ONE RESIDUE, LOW. The overlay is `AGENTS.md` ALONE. In a round where the
implementer also has UNCOMMITTED edits to a reference TARGET (this phase edits
`roles/implementer.md`), the staged tree would carry HEAD's target against the
working tree's document. At this head everything is committed so the two agree,
and I confirmed that by getting the identical baseline. It is a property of the
harness, not a defect in the shipped surface.

## Criterion 3: all three anti-duplication detectors, both directions

EXECUTED on my staging. Reverting returned exit 0 in all three cases.

| pasted into `AGENTS.md` | exit | what the checker named |
|---|---|---|
| four gate ids as a bullet list | 1 | "4 distinct gate ids occur in list or table rows (citations, coverage, migrations, suite)" |
| a two-row mode table | 1 | "2 distinct mode ids occur in list or table rows (direct-pr, full)" |
| a two-row role/tier table | 1 | "2 roles occur in a list or table row carrying a model tier (implementer, investigator)" |

## Criterion 9: the suite

`npm test`, node v26.6.0, `dist/` BUILT (`npm run build` run first, exit 0):
**761 tests, 761 pass, 0 fail, 0 SKIPPED, exit 0.** All three axes named, per
standing warning 12. Zero failing, zero skipped, so no test is unaccounted.


## Criterion 4: clause map and the clause round trip

EXECUTED. `node scripts/check-clause-map.mjs` exits 0,
`clause-map: green (74 clause-map rows checked)`, `74 rows checked, 0 pending a
phase not yet in force`. Eleven rows carry phase M3-P9 (R-001b, R-002, R-013,
R-030, R-061, R-062, R-065b, R-067, R-073, R-076, R-077), all discharging into
`AGENTS.md`, which is the count the plan asks for.

THE ROUND TRIP NEEDED A SECOND LOOK AND CAME OUT CLEAN. My first derivation
read the raw body and reported TWO frontmatter clause ids with no body heading,
`incremental-output` and `beacon-is-not-a-claim`. That reading was WRONG and I
am recording it because the correction is the interesting part: the document
carries a `$include:` directive naming the shared dispatch contract, and the
round trip is computed over the INCLUDE-EXPANDED body. The two ids are headings
in `roles/_shared-dispatch-contract.md`. I then checked the four ALREADY-MERGED
role briefs and every one of them shows the identical pattern, so `AGENTS.md`
follows the established convention rather than deviating from it. The anchor
grammar is deliberate and explicit at src/roles.ts:77.

Both refusal directions are witnessed by the phase's own test against a real
staged tree and a real `tiphys validate` invocation (orphaned clause, stray
anchor), which is the strongest shape of witness used anywhere in this phase.

## Criterion 5: no process-liveness vocabulary

EXECUTED with MY OWN, BROADER grep, not the phase's token list: I searched for
`pid`, `/proc`, `signal(s)`, `SIGKILL`, `SIGTERM`, `process liveness`, `kill -`,
`background/backgrounding/backgrounded`, `nohup`, and a trailing bare `&`. ZERO
hits in the shipped file. The positive half is present: the supervision section
states LIVENESS IS LEASE FRESHNESS and the beacon clause is a body heading.

The phase's test is stronger than the criterion asks: it scans BOTH the raw file
and the include-expanded body, and it drives the other direction once per token,
six members rather than the two the class rule requires.

## Criteria 6, 7c, 8: text assertions, verified against the shipped file

EXECUTED by my own extraction of each clause's text from the include-expanded
body, then asserting the tokens INSIDE the owning clause rather than anywhere in
the document.

Criterion 6, four duties, each citing its source inside its own clause:
`fleet-state-commit-discipline` carries D-4 and PR-012; `merge-authority`
carries D-6 and SC-008; `projects-read-only` carries D-8 and SC-010;
`fleet-resume-specification` carries PR-201. All four present.

Criterion 7c: all three supervision clauses exist as body headings and are
declared in frontmatter. The `dispatch-requires-a-guard` clause contains
FRESHNESS and "newest mtime". It DOES contain the word "completion", and that is
CORRECT rather than a miss: the criterion forbids those words AS THE WATCHED
CONDITION, and the occurrence is in the sentence "IT TESTS FRESHNESS. Never
existence, and never completion." The phase's test scopes its two
`doesNotMatch` assertions to the sentence containing "watches", and records
that a line-based split failed on first run for exactly this reason. That is a
correctly built guard, not a loophole.

Criterion 8: DR-0012 and T-001 inside `decorrelated-review`; DR-0015 inside
`merge-authority`; DR-0016 inside BOTH `escalation-threshold` and
`stalled-phase-response`; T-007 inside `two-review-contracts`; T-008 in the
supervision section. Six for six.

## Criterion 5b: I did not accept the weakening test as written, and measured instead

The registered weakening test does NOT mutate the document. Member 1 is a
HAND-WRITTEN string, `"Confirm CI is green on main after merging."`, and the
assertion is that the four element patterns do not match it. That is an
assertion about the patterns and a string chosen to fail them, which is the
construction the red-witness rule warns about. Member 2 is derived from the real
clause by regex, which is better, but still only asserts which patterns stop
matching.

SO I RAN THE REAL EXPERIMENT. I replaced the actual clause in the actual
`AGENTS.md` in my worktree (restoring by `cp` from a pristine copy, never
`git checkout --`), for both members, and ran the criterion 5b tests:

| state of the document | "clause states the event..." test | "weakening is caught" test |
|---|---|---|
| control, unmodified | exit 0, tests 1 pass 1 fail 0 | exit 0, tests 1 pass 1 fail 0 |
| MEMBER 1, clause replaced by the vague sentence | **exit 1, tests 1 pass 0 fail 1** | **exit 1, fail 1** |
| MEMBER 2, event name dropped, tip kept | **exit 1, tests 1 pass 0 fail 1** | **exit 1, fail 1** |

`cmp` confirmed `AGENTS.md` byte-identical to the pristine copy afterwards and
`git status --short` was empty.

CONCLUSION: the criterion IS genuinely guarded, and by two structurally
different real weakenings, because the FIRST test reads the real clause out of
the real document. The criticism of the second test's construction stands and is
filed LOW; the property it is supposed to protect is protected by its neighbour.

TRANSLITERATION DECLARED for this capture: U+2139 replaced with `i`
(18 occurrences, three summary lines across six runs). U+2714 and U+2716 do not
appear in the filtered capture (0 occurrences each). Nothing else was changed.

## The three shipped artifacts, checked as shipped

`npm pack --dry-run` on the head: 181 files. `AGENTS.md` (31.4kB) is in the
tarball, as are `roles/implementer.md`, `roles/_shared-dispatch-contract.md`,
`assurance-modes.yaml`, `gate-registry.yaml`, `role-model-config.yaml`,
`checklists/`, `schemas/` and `tuition/`.

`roles/implementer.md` gains exactly two rendered gate rows, and both drift
guards are green at this head: `agent-rules-drift: green (20 rendered gate rows
compared)` and `check-brief-drift.mjs --check` exit 0. The rendered rows agree
with the registry entries row for row, including the `conditional` flag and the
unit label on `check-dual-review`.

`node scripts/check-authored-bytes.mjs` exits 0.

Suite, all three axes: `npm test`, node v26.6.0, `dist/` built: 761 tests, 761
pass, 0 fail, **0 skipped**, exit 0. Bare `node --test` from the repository
root, same toolchain and build state: **763** tests, 763 pass, 0 skipped,
exit 0. The two-test gap is the tracked `sandbox/test/greet.test.js` pair that
`package.json`'s test glob excludes, which is the known and explained
difference, not a new discrepancy.
