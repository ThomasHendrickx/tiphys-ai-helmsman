# Clean-room review: M3-P9, acceptance criteria as contract

Reviewer: independent clean-room agent, lens = ACCEPTANCE CRITERIA AS A CONTRACT.
Head under review: `claude/m3-p9-agents-policy` at d9d5a1d, PR #131.
Review branch cut from `main` at 12f84f9 (T-019: never cut evidence from the branch under review).
Started 2026-08-13. This file is written incrementally; an incomplete file means the
reviewer died, not that the review passed.

Toolchain for every command below unless stated otherwise: node v26.6.0 from the
scratch prefix, confirmed by `node --version`.

## VERDICT: REQUEST CHANGES

One HIGH (CR-001, the decorrelation check reports "distinct" on a dimension one
verdict does not carry and exits green on the merge-authority path) and one
MEDIUM (CR-002, `AGENTS.md` ships instructing the reader to run two files the
package does not contain). Reasoning at the foot of this document.

## WHAT I DID NOT COVER

Read this before any finding below.

1. **The hazard lens.** A second reviewer holds it concurrently. I did not
   attempt destructive-path, concurrency, symlink, named-pipe or
   resource-exhaustion probes against anything in this phase.
2. **CI.** I read no workflow run, no check conclusion and no job log. `gh` is
   unusable in this container and `GH_TOKEN` returns 401 against REST, so
   anything I wrote that polled GitHub would have failed silently. Every result
   in this document is a local execution. Nothing here discharges T-009's
   requirement that the post-merge `push` run on the new tip be observed to
   completion; that is the orchestrator's.
3. **`scripts/`, `test/`, `.github/`, the gate registry, and `delivery/`, as
   subjects.** Per DR-0027 I did not review these for their own sake. I read
   into them only where a shipped artifact's correctness depended on it: the
   registry entries because `roles/implementer.md`'s rendered rows must match
   them, the two scripts because they are the runners around the shipped check,
   and the tests because the criteria name them as the guards. I did not audit
   `.github/workflows/gates.yml`'s 47 added lines at all.
4. **The work history.** I read `delivery/work-history/m3-p9.md` only for the
   four claims I was pointed at, and I re-derived each rather than accepting it.
   I did not run the claim grep over it, did not check its citations, and did
   not verify its 1192 lines against anything else. It is out of the shipped
   surface and it is not evidence I relied on anywhere.
5. **The scope audit and the phase declaration.** I did not check whether every
   changed path is on `delivery/plan/phase-declarations/m3-p9.json`, nor whether
   the two `declaredExtras` grants the head's merge commit mentions are correct.
   That is the orchestrator's gate, not a criteria question.
6. **Wider sweeps I identified but did not run.** CR-001's mechanism is a
   present-versus-absent collapse in a document-loading shape that
   `src/checks.ts` uses in more places than this check. I did not enumerate the
   other users of that shape. This is named in CR-001's not-covered paragraph
   with the specific variants I skipped.
7. **The M3-P7 verdict tests, individually.** Attack point 1 claims the first
   version of this check reddened eight of them. I did not reconstruct that
   first version or re-run those eight in isolation. What I DID do is verify the
   present state: the whole suite is green at this head with zero skipped, and I
   independently re-derived that the fail-closed property those eight were in
   tension with is genuinely preserved on the merge path, under three different
   broken-regime states.
8. **`tiphys init` and the consumer bootstrap.** CR-001's user path assumes a
   consumer with `charter.yaml` and `assurance-modes.yaml` at the directory the
   gate is pointed at, which is what the gate's own `command` implies. I did not
   verify that `tiphys init` produces that layout.

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

## Attack point 3: is `check-dual-review` unwitnessed on every real head?

MEASURED, and the implementer's account is accurate.

- `node scripts/check-dual-review.mjs --precondition .` at this head prints
  `check-dual-review: 0 verdict document(s) under delivery/review` and exits 1,
  so the gate is NOT-APPLICABLE.
- `delivery/review/` at this head holds 176 `.md` files and one subdirectory.
  Zero structured verdict documents.
- `git log --all --diff-filter=A` over `delivery/review/*.{yaml,yml,json}`
  returns only files under `delivery/review/evidence/`, and the loader reads
  `delivery/review` NON-recursively, so even those were never candidates. No
  `kind: verdict` document has ever existed in this repository.

WHAT THAT MEANS, and the two halves are different. The GATE contributes nothing
on any head this repository has ever had, and will not until a phase starts
committing structured verdicts. That is DECLARED in the registry entry's own
comment and is the correct design: `applicability: conditional` plus a
precondition, so it reports not-applicable-with-a-reason rather than a vacuous
green, which is the M2-C-3 shape.

The CHECK, however, is NOT unwitnessed. I exercised it directly over six
fixtures and three broken-regime states and it answered correctly in every case
I gave it except the one filed as CR-001 below. And a package consumer can reach
it without `scripts/` at all: `tiphys validate --type verdict --context <dir>
<verdict>` runs it out of the shipped `dist/`, which I confirmed by running that
exact command and watching it name the duplicated `produced-by`.

So its PASS does mean something to a consumer. What its NOT-APPLICABLE means in
this repository is "no verdict documents exist here", which the command says in
those words.

---

# FINDINGS

## CR-001 (HIGH): the decorrelation check reports "distinct" on a dimension one verdict does not carry, and exits GREEN on the merge-authority path

**Shipped artifact reached:** `src/checks.ts`, shipped as `dist/src/checks.js`
in the npm tarball, the Kind B derived check `dual-review-decorrelation`.
**User path reached:** a consumer under a mode whose `merge-authority` is
`delegated-under-conditions` runs either the shipped `check-dual-review` gate
from `gate-registry.yaml` or `tiphys validate --type verdict --context <dir>`
from the shipped CLI, and is told the two reviews are decorrelated when one of
them declares no model family, no framing, or no review contract at all.

**THE MECHANISM, not the instance.** A dimension value is read off a
sibling document with `?? ""` and compared for distinctness WITHOUT first
establishing that the value was PRESENT. "Absent" and "a value that differs"
therefore collapse into the same comparison, and absent silently satisfies
distinctness. The two lines are in `src/checks.ts` (quoted, not cited, because
the branch changes that file): the value read at the line
`const value = String(candidate.record[dimension] ?? "");` and the grouping test
`if (paths.length < 2) { continue; }` immediately below it.

**THE DERIVATION.** The comparison is ONE loop over the exported constant
`DECORRELATION_DIMENSIONS`, whose members are `produced-by`, `framing` and
`review-contract`. So the mechanism reaches all three by construction, and I
demonstrated all three rather than arguing it:

| pair staged (mode `full`, `delegated-under-conditions`) | expected | MEASURED |
|---|---|---|
| shared `produced-by`, one side's `produced-by` REMOVED | red | **exit 0, green**, "distinct on produced-by, framing, review-contract" |
| shared `review-contract`, one side's `review-contract` REMOVED | red | **exit 0, green**, same false line |
| shared `framing`, one side's `framing` REMOVED | red | **exit 0, green**, same false line |
| control: BOTH sides omit `produced-by` | red | exit 1, red (both empty, so they collide) |

Three structurally different members, so this is a CLASS and not one instance.
The control shows precisely where the hole is: symmetric absence collides and
reddens, ASYMMETRIC absence passes. Each of the first three pairs is the exact
fixture that reddens correctly when the field is present, so the ONLY delta is
the missing field.

**Reproduced through the shipped CLI**, which is the purest consumer path:
`tiphys validate --type verdict --context <dir> <well-formed-verdict>` prints
`REPORT dual-review-decorrelation 2 verdict(s) for phase M3-P9 are distinct on
produced-by, framing, review-contract` while the sibling in that directory has
no `produced-by` line.

**THE DIVISION OF LABOUR THE SOURCE RELIES ON IS NEVER COMPOSED.** The comment
above the check argues that the schema buys absence-freedom and that this check
only has to decide difference. The schema really does refuse it: validating the
malformed sibling directly prints `INVALID #/produced-by required property
produced-by is missing`, and `produced-by`, `framing` and `review-contract` are
all in the schema's `required` list at schemas/verdict.schema.json:13. But
NOTHING ON THE SHIPPED PATH EVER RUNS THAT VALIDATION OVER THE SIBLINGS. The
loader skips a file only when it fails to decode or when `kind !== "verdict"`;
a document with `kind: verdict` and a missing required field is loaded and
compared. I enumerated every `command:` in `gate-registry.yaml` (20 of them) and
none validates documents under `delivery/review/`, and no module outside
`src/checks.ts` references that directory. So the composition is asserted in a
comment and implemented nowhere.

**WHY THIS IS HIGH RATHER THAN MEDIUM.** It fails OPEN, on the merge-authority
path, and it prints a positively FALSE sentence rather than a hedge. This is the
project's own SC-011 rule ("could not look" must never print as "looked and
fine") violated in the one check written to enforce decorrelation, and the
implementer applied that exact rule to the CHARTER case in the same function
while leaving it unapplied one field along. It is also the failure class the
check's own header names: a run that cannot be shown to have used two families
is reported as one that did.

**WHAT MY DERIVATION DID NOT COVER.** (a) I did not test a dimension present but
set to YAML `null` or to an empty string on one side only; by inspection both
render as `""` through the same `?? ""` and would behave as the symmetric case
against another empty, but I did not run it. (b) I did not test a dimension
whose value is a non-string (a list, a map); `String()` would stringify it and I
do not know what that yields for distinctness. (c) I did not audit the M3-P7
checks that share the `readOperatorPath` plus `decodeDocument` plus
`asRecord` loading shape for the same present-versus-absent collapse; that
loading shape is used elsewhere in `src/checks.ts` and a wider sweep is
warranted but is outside the criteria lens and outside this phase's diff.
(d) I did not check whether `decorrelationTriple`, which uses the same `?? ""`
for the membership test, admits a document it should not; two documents each
missing the same field would produce equal triples, which is membership passing,
but membership passing is not itself a wrong verdict.

**Smallest fix that addresses the mechanism rather than the instance:** in the
per-dimension loop, treat a dimension that is absent, non-string, or empty on
ANY verdict in the group as a violation naming the file and the field, before
the distinctness comparison runs. That is one guard covering all three
dimensions, and its witness is any one of the three pairs above.

## CR-002 (MEDIUM): `AGENTS.md` ships in the package and instructs the reader to run two files the package does not contain, and the reference checker is blind to exactly those two

**Shipped artifact reached:** `AGENTS.md`, which `package.json`'s `files` adds
to the tarball (confirmed present, 31.4kB, by `npm pack --dry-run`).
**User path reached:** a consumer of the published package opens
`node_modules/<pkg>/AGENTS.md`, reads the `decorrelated-review` clause's
sentence "THE VERIFICATION IS A COMMAND, not a habit: `scripts/check-dual-review.mjs`
reads the verdict files and exits nonzero naming the duplicated value", and
there is no `scripts/` directory in the package.

**THE DERIVATION, run against the real tarball rather than reasoned about.** I
extracted every backticked repository path token from `AGENTS.md`, anchored or
not, and cross-checked each against `npm pack --dry-run --json`:

- 14 distinct paths named.
- 12 carry a `#anchor`; ALL 12 exist on disk and ALL 12 are in the tarball.
- 2 carry NO anchor: `scripts/check-agents-references.mjs` and
  `scripts/check-dual-review.mjs`. Both exist on disk. **NEITHER is in the
  tarball.**

The two sets are IDENTICAL. The only paths the checker cannot see are exactly
the only paths that are missing from the package.

**The mechanism:** `check-agents-references.mjs`'s reference pattern requires a
backticked `path#anchor`. A backticked path with NO anchor matches nothing and
is therefore never resolved, never counted, and never reported. Criterion 2 as
the plan writes it says "every path referenced by `AGENTS.md` must exist"; the
implementation covers "every path-plus-anchor". I confirmed the count: the
checker reports 21 references, which is the 21 anchored TOKENS across those 12
paths, and the two anchorless paths are absent from that census.

**I checked the frontmatter half separately and it is CLEAN.** All ten
`mandated-reading` entries exist on disk and all ten are in the tarball.

**Not counted as HIGH, and the reasons are stated rather than assumed.** The
class is PRE-EXISTING on `main`: `gates.manifest.json` already names
`scripts/check-clause-map.mjs` and `gate-registry.yaml` already names
`scripts/render-agent-rules-gates.mjs`, both shipped, both pointing outside the
tarball. This phase adds two more instances of a gap it did not create, and
package completeness is explicitly M3-P10's charter. The check itself remains
reachable by a consumer through `tiphys validate --type verdict --context`,
which I ran successfully out of the shipped CLI, so the consumer is not without
a route, only without the one the brief names.

**Two independent fixes, either sufficient:** add `scripts` to `package.json`'s
`files`, or make the anchorless mentions resolve by naming the CLI route the
package actually ships. The reference checker's blindness to anchorless paths is
worth closing in the same edit, because it is what let this reach a shipped
document unnoticed.

## CR-003 (LOW): both witness specs share the same second member, and it is a "the check does not run" mutation rather than a member of the class

`witness/dual-review-distinct-model-families.json` and
`witness/dual-review-requires-two-verdicts.json` each declare two
`dangerousStates`. Their SECOND member is byte-identical in both:
`if (authority !== DELEGATED_MERGE_AUTHORITY) {` to `if (true) {`. That mutation
forces the applicability arm for every mode, so the check reports rather than
compares, and it would redden essentially any test of this check. It is not a
member of the class "the decorrelation comparison stops discriminating"; it is
"the check is disabled".

Each spec still satisfies the letter of the two-member rule, because its FIRST
member is specific and structurally different from the second, and I measured
all four members red. But the effective strength is one specific member per
behaviour. Filed LOW because nothing shipped is wrong; a stronger second member
would be a different way to break the comparison, for example comparing the
dimension case-insensitively or grouping on the wrong key.

## CR-004 (LOW): criterion 5b's weakening test asserts over a hand-written string

Detailed under criterion 5b above. Member 1 is the literal
`"Confirm CI is green on main after merging."` and the assertion is that the
element patterns do not match it, which is a statement about the patterns rather
than about the document. The red-witness rule's own words are that assertions
must use real captured output rather than hand-written strings chosen to match
the implementation. Filed LOW rather than higher because I MEASURED that the
real weakening reddens: I performed both weakenings on the real `AGENTS.md` and
both turned the neighbouring test red. The property is guarded; the test that
claims to be the two-member witness is not the thing guarding it.

## CR-005 (TRACKED): the `git archive HEAD` staging overlays only `AGENTS.md`

`test/agents-policy.test.ts`'s staging tars HEAD and copies the WORKING TREE's
`AGENTS.md` over it, but not working-tree versions of the reference TARGETS.
This phase edits `roles/implementer.md`, which is a reference target. With
everything committed the two agree, and I confirmed it by reproducing the head's
exact baseline (`green (21 references resolved)`) from my own identical staging.
A future round with uncommitted edits to a target would test HEAD's target
against the working tree's document. Harness-only, no shipped artifact,
therefore tracked and not a blocker.

---

# CRITERIA LEDGER

| criterion | executed or read | verdict |
|---|---|---|
| 1 validate role-brief | EXECUTED | MET |
| 2 references resolve, both directions | EXECUTED on my own staging | MET as implemented; see CR-002 for the gap between the criterion's words and the implementation |
| 2b anchor resolution, two members, both directions | EXECUTED, both members | MET |
| 3 anti-duplication, three detectors, both directions | EXECUTED, all three | MET |
| 4 clause map and clause round trip | EXECUTED | MET |
| 5 no liveness vocabulary, both directions | EXECUTED with a broader grep than the phase's | MET |
| 5b merge-completion clause, four elements, two members | EXECUTED by really weakening the document | MET; test construction filed CR-004 |
| 6 four plan-assigned duties with citations | EXECUTED, clause-scoped | MET |
| 7 dual-review, five directions | EXECUTED, all five | MET for the fixtures the criterion names; **CR-001 is a sixth direction the criterion does not name and the check answers wrongly** |
| 7b contract distinctness, both directions | EXECUTED | MET, with the same CR-001 caveat |
| 7c supervision clauses, both directions | EXECUTED | MET |
| 8 six ids in their owning clauses | EXECUTED | MET |
| 9 suite exits 0, nothing unaccounted | EXECUTED, both invocations | MET |

Criterion 7's last direction, the Kind B witness by deregistration, I did not
run as a separate experiment; it is a registered test in `test/dual-review.test.ts`
and the whole suite is green. I state that as READ rather than executed. What I
did execute independently is the underlying property, by mutating the check's
comparison arms directly and watching the named tests turn red.

# VERDICT: REQUEST CHANGES

**This is a good phase and the verdict is not close.** Twelve of thirteen
criteria are MET and I executed rather than read every one of them. The
fail-closed repair the implementer flagged is genuine and I re-derived it under
three broken-regime states. The witness contract repair is correct and I
re-derived all four members by hand. The document is internally consistent, its
anti-duplication guard works in all three detectors, and its anchor checking
works in both structurally different members. The suite is 761/761 with zero
skipped and zero failing, and I quoted the toolchain, the build state and the
invocation for both numbers.

**What blocks it is CR-001, and it blocks on its own merits rather than on
ceremony.** The one thing this phase ships that a consumer RUNS gives a WRONG
ANSWER on a reachable input: a pair of verdicts where one omits a decorrelation
dimension is reported GREEN with the sentence "distinct on produced-by, framing,
review-contract". It fails open, it is on the merge-authority path, and it
states as a fact something it did not establish. I demonstrated it on all three
dimensions, so it is a class and not an instance, and I reproduced it through
the shipped CLI as well as through the gate's own runner. The division of labour
the code's comment relies on (the schema forbids absence, this check decides
difference) is asserted in prose and composed nowhere: I enumerated all twenty
`command:` entries in the registry and none validates the verdict siblings.

CR-002 is a MEDIUM I would not block on alone, and I want that separation on the
record: it is an instance of a package-completeness class that already exists on
`main` and that M3-P10 owns. It is reported here because the derivation that
found it also found that the reference checker's blind spot coincides exactly
with it, and closing them together is one edit.

CR-003, CR-004 and CR-005 are LOW or TRACKED and none should hold a merge.

**What a fix round owes, given the fix-round contract:** name the mechanism
(a value read with `?? ""` and compared for distinctness without establishing
presence), publish the derivation that enumerates every site of it, and state
what the derivation did not cover. CR-001's not-covered paragraph lists four
things I could not reach, and the third of them, whether the same
present-versus-absent collapse exists in the other users of the
`readOperatorPath` plus `decodeDocument` plus `asRecord` loading shape in
`src/checks.ts`, is the one I would most want the fix round to settle rather
than repair one field at a time.
