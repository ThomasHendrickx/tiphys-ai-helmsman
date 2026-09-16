# M4-P15 independent verification: the charter was already delivered, and I re-measured it

- date: 2026-09-16
- produced by: a SECOND implementer dispatched for M4-P15 into worktree
  `wf_e69ee73f-df2-1`, after the unit had already been delivered by a first
  implementer in worktree `wf_325aa631-d2d-1`.
- what this document is: not a work history. It is an independent
  re-measurement of a delivered branch, written because the second dispatch
  produced no new code and the alternative was to report it only in chat.

## Why this exists: a DUPLICATE DISPATCH, not a fix round

I was dispatched as the implementer of M4-P15 with a brief that describes the
unit as unstarted. It was not. Measured before touching anything:

```
$ git log --oneline -1 claude/m4-p15-kernel-charter
d3a173d Make each behaviour row resolve to its test title, and record the two red gates
$ git ls-remote origin 'refs/heads/claude/m4-p15*'
d3a173d62160f788ae1ffec069c998b02c848884	refs/heads/claude/m4-p15-kernel-charter
```

The branch exists, is pushed, and carries five files. Its worktree's newest
write was 02:47 UTC and I was dispatched at 04:40 UTC, so the first implementer
was finished rather than in flight.

**I did not re-implement the unit and I did not touch its branch.** Creating a
second branch for one phase would violate the one-phase-one-branch rule, and
committing onto a branch another agent owns is not an implementer's call. What
follows is verification instead.

There are no review documents for this phase, so this is not a fix round and
there were no findings to address:

```
$ git log --all --oneline --diff-filter=A --name-only | grep -i 'p15'
81ff466 M4-P15: start the work history beacon
delivery/plan/phase-declarations/m4-p15.json
delivery/work-history/m4-p15.md
```

## The acceptance criterion, reproduced with MY OWN fixtures

The dispatch's criterion is that with two verdict documents present under
`delivery/review/`, `node scripts/check-dual-review.mjs .` must reach a verdict
rather than erroring on a missing charter. The first implementer demonstrated
this with the two SHIPPED fixtures under `witness/fixtures/dual-review/`. I
wrote two fresh verdict documents from
schemas/verdict.schema.json:1 instead, so that the witness does not depend on
the same inputs, and ran the arms twice: once in a bare lab context and once
against the real repository root with its 199 existing markdown reviews in
place.

Exit codes were captured from the command itself, never from the tail of a
pipe.

### Arm set 1, a bare lab context

| arm | context | exit | reported |
|---|---|---|---|
| A | `assurance-modes.yaml` + two conforming verdicts, NO charter | **21** | `charter.yaml does not exist, so the declared mode's merge-authority is unknown` |
| B | the same, plus the branch's `charter.yaml` | **0** | `green (2 review verdicts examined for decorrelation)` |

### Arm set 2, the REAL repository root of the branch's tree

Stronger, because `delivery/review/` there holds 199 files and the selection
rule has to skip all of them.

| arm | exit | reported |
|---|---|---|
| B-real, charter present | **0** | `2 verdict(s) for phase M4-P15 are distinct on produced-by, framing, review-contract` then `green` |
| A-real, SAME tree and SAME fixtures, charter moved aside | **21** | the regime-unknown sentence |

The charter was restored afterwards and `cmp -s` reports it byte-identical, and
`git status --porcelain` printed nothing.

**So the dangerous state is the CI error and it reproduces, and the charter is
what clears it.** The refusal itself is written at scripts/check-dual-review.mjs:198
(the two regime documents) and scripts/check-dual-review.mjs:208 (the message).

## The second witness class, reproduced with two structurally different members

A charter that is PRESENT but unusable must fail loudly rather than be ignored.
Two members, both against the same context, one variable each:

| member | charter content | exit | reported |
|---|---|---|---|
| 1, never decodes | `kind: charter` then `delivery-mode: [unclosed` | **1**, red | `the charter is present and could not be read ... is not valid YAML` |
| 2, decodes and declares no mode | `kind: charter` plus an `identity` block only | **1**, red | `declares no delivery-mode, so no mode's merge-authority can be looked up` |

The two print DIFFERENT sentences, which is the property that matters: a reader
can tell which state they are in. The first implementer ran a third member (a
mode name the mode document does not define) and I did not repeat it.

## THE FINDING I REPRODUCED, and it is the one worth carrying

**A charter that is present, decodes, and declares a valid `delivery-mode`, but
is SCHEMA-INVALID, is accepted SILENTLY by the merge check.**

Measured. The whole charter was replaced by three lines that violate the schema
in two independent ways: ten of the eleven required top-level fields are
missing, and `this-field-is-forbidden` is present under
`additionalProperties: false`.

```
kind: charter
delivery-mode: full
this-field-is-forbidden: yes
```

Result: `check-dual-review` exit **0**, `green (2 review verdicts examined for
decorrelation)`. The gate reads exactly two things out of the charter, that it
decodes and its `delivery-mode` (src/checks.ts:3330 is the presence test,
src/checks.ts:3342 is the read), and in the arms I ran it never reached the
charter schema at all.

**The scope of that last sentence, stated rather than left as a universal.** I
measured two mutations and read the two source sites above; I did not
exhaustively enumerate every path through the check. The derivation that would
close it is the one the first implementer published and I did not repeat:
a search of `.github/workflows/`, the gate registry, the gate manifest and
`scripts/` for a `validate --type charter` invocation, which exits 1 with no
hits. That search does not cover `src/`, `.claude/`, the M3 exit-test shell
scripts, or any call site that composes the filename at run time.

This is the same finding the first implementer recorded, reached independently
and by a different mutation (they deleted the `retention` block; I added a
forbidden key and deleted ten required ones). Two different mutations reaching
one behaviour is what makes it a class rather than an instance.

The phase closes it with a test rather than with a gate, which is the right
call and is stated as such in its work history. The `suite` gate runs the suite,
so the check is on the CI path.

## Claims in the delivered work history that I checked, and how they came out

| claim | my measurement | agrees |
|---|---|---|
| `node bin/tiphys.ts validate --type charter charter.yaml` exit 0 | exit 0 | yes |
| `node scripts/check-authored-bytes.mjs` exit 0 | exit 0 | yes |
| `git status` clean after `npm run build` | `git status --porcelain` printed nothing | yes |
| the citations gate is green | `citations: green: linted 23 changed document(s) at d3a173d: 518 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external`, exit 0 | yes, same number |
| the six behaviour rows resolve to test titles | TAP reporter printed all six titles, character for character equal to the values in the registry; 7 tests, 7 pass, 0 fail, 0 skipped | yes |
| the `scope` gate is red because the declaration is not in the merge base | reproduced verbatim, exit 1 | yes |

## What the first implementer left open and I CLOSED: what the scope gate says

Its work history lists as not done: "It did not establish what the scope gate
will say." I established it, in both directions, in a fresh clone so that the
branch itself was never touched.

**Red today**, against the real trunk:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only scope --base origin/main --head HEAD --phase m4-p15
exit=1
gates: scope: red: branch claude/m4-p15-kernel-charter (phase m4-p15) matches the
phase pattern but no phase declaration exists at
delivery/plan/phase-declarations/m4-p15.json in the merge base 3b40118... ;
the declaration must be committed to main before the phase branch is created
```

**Green under the fix**, simulated faithfully rather than argued. The
simulation is: the `plan/pstack-borrow-review` branch has landed on `main`, and
the phase branch has merged it forward. Both halves are needed. I did the whole
simulation in a FRESH CLONE, so the delivered branch was not modified; the
clone was made with `git clone --no-local` into my scratchpad and every merge
and ref update below happened only there. I merged the
plan branch into the clone's phase branch, pointed the clone's `origin/main` at
the plan branch tip `6b42d67`, and re-ran the same command:

```
exit=0
gates: scope: green: 4 changed path(s) audited against declaration
delivery/plan/phase-declarations/m4-p15.json at merge base 6b42d67...
(1 declared path(s) not touched: delivery/plan/phase-declarations/m4-p15.json)
```

The four audited paths are `charter.yaml`, `test/kernel-charter.test.ts`,
`test/behaviors.json` and `delivery/work-history/m4-p15.md`, and every one is on
the declaration's `filesToTouch` or `declaredExtras`.

**So M4-P15 owes the scope gate no code change.** What it owes is sequencing:
the declarations land on `main`, then the branch merges forward. That is an
orchestrator action.

A third measurement is worth keeping because it rules out a shortcut somebody
will otherwise try. Running the gate with `--base origin/plan/pstack-borrow-review`
does NOT work around this:

```
exit=21
gates: scope: error: merge base ba1c26c... (of --base origin/plan/pstack-borrow-review
and --head HEAD) is not an ancestor of the configured trunk origin/main (3b40118...);
this is the shape of a merge base forked onto the branch under audit rather than
the true fork point with main
```

The gate pins the trunk itself, so pointing `--base` at the plan branch is
refused rather than obeyed.

## The branch has fallen BEHIND its base, and the merge is clean

The work history records merging the base forward to `d0f245d`. The base has
moved again since:

```
$ git log --oneline claude/m4-p15-kernel-charter..plan/pstack-borrow-review | wc -l
19
```

Nineteen commits, including two tuition entries, the T-028 correction, and the
eleven phase declarations. Per CLAUDE.md standing warning 13 I did NOT read the
two-dot diff, which shows those nineteen commits as deletions BY the branch and
is the misleading artefact. I asked git for the merge result instead:

```
$ git merge-tree --write-tree plan/pstack-borrow-review claude/m4-p15-kernel-charter
afab24d7c2aeedf6ec5e989917bad838a5a58872
exit=0
```

Exit 0, so the merge is clean and there is no conflict to resolve. The branch is
simply behind, and DR-0031's local-green rule wants it merged forward before a
pull request is opened.

## The suite, the complete sentence, and the six failures

- interpreter: **node v22.22.2** at `/opt/node22/bin`, the container default,
  which is BELOW the declared floor of `>=26`.
- build state: `dist/` BUILT (`npm run build` exit 0).
- invocation: `npm test`.
- tree: a real git checkout, a detached worktree of `d3a173d` under
  `/tmp/claude-0`, with `node_modules` symlinked from the phase's own worktree.
- result: **856 tests, 848 pass, 6 fail, 0 cancelled, 2 skipped, exit 1.**

That is NOT the delivered work history's number, which is 855 pass, 0 fail,
0 skipped, exit 0 on node v26.6.0. The two runs differ in interpreter and I did
not average them. Six failures, each run down:

| failing test | in isolation at this head | verdict |
|---|---|---|
| the coverage gate ... reports units 115 | pass | load |
| deleting an appendix row is red naming the orphan id | pass | load |
| the coverage CLI entry writes a schema-valid result record | pass | load |
| a row deleted from both real documents is red against the expected-units floor | pass | load |
| a precondition command exiting nonzero is error, not a skip | pass | load |
| a staged install of the built package reproduces the captured contract live | **fails** | the interpreter |

The first four are `test/coverage-gate.test.ts`, and that whole file run alone at
this head reports 17 tests, 17 pass, 0 fail, 0 skipped, exit 0, at
`load average: 21.37`. The fifth is `test/gates.test.ts` and passes alone, exit 0.
The load-dependence of the coverage gate is already recorded on the base branch.

**The sixth is the interpreter and it is measured, not inferred.** One head, one
test, one variable:

| interpreter | result |
|---|---|
| `/opt/node22/bin/node`, v22.22.2 | 1 test, 0 pass, **1 fail**, `the unpromoted arm must not fail the fleet, 1 !== 0` |
| `/home/user/node26-scratch/node-v26.6.0-linux-x64/bin/node`, v26.6.0 | 1 test, **1 pass**, 0 fail, exit 0 |

The test is at test/doctor.test.ts:934, which is exactly the floor-DEPENDENT
and not floor-GATED test CLAUDE.md's standing warning 12 names by line number.
So this failure is a property of the interpreter and not of this branch.

### The base is RED TOO, measured rather than inferred

I ran the full suite at the base as well, because CLAUDE.md's standing warning
12 says to establish the base's result before attributing any failure to a
change. Base is `plan/pstack-borrow-review` at `6b42d67`, in a second worktree
in the same lab, same interpreter v22.22.2, same build state, same `npm test`.

- base: **849 tests, 843 pass, 4 fail, 0 cancelled, 2 skipped, exit 1.**
- head: **856 tests, 848 pass, 6 fail, 0 cancelled, 2 skipped, exit 1.**

**The test-count delta is exactly 7, which is the number of tests this phase
adds**, and `test/kernel-charter.test.ts` reports 7 tests, 7 pass, 0 fail,
0 skipped when run alone. So the phase contributes seven tests and all seven
pass. The 2 skipped are identical on both sides and are the floor-gated pair.

The failing sets, by test number in each run:

| failing test | base | head |
|---|---|---|
| a row deleted from both real documents is red against the expected-units floor | 190, FAIL | 190, FAIL |
| a staged install of the built package reproduces the captured contract live | 258, FAIL | 258, FAIL |
| a precondition command exiting nonzero is error, not a skip | 361, FAIL | 361, FAIL |
| a zero-width-only note or outcome is empty on both sides of the shared predicate | 191, **FAIL** | PASS |
| the coverage gate ... reports units 115 | PASS | 180, **FAIL** |
| deleting an appendix row is red naming the orphan id | PASS | 182, **FAIL** |
| the coverage CLI entry writes a schema-valid result record | PASS | 188, **FAIL** |

Three of the head's six fail at the base as well. One test fails at the BASE and
passes at the head, which is the row that settles the question: a failure set
that moves in BOTH directions between two runs is not being caused by the diff
between them. The three head-only failures are all in
`test/coverage-gate.test.ts`, the same file as the base's own failure 190, and
that file alone at the head reports 17 tests, 17 pass, 0 fail, exit 0.

**So a red suite on the container default interpreter is the BASE's condition
here, not this branch's.** Load was 19.08 during the head run and 28.79 during
the base run, so the two are not a clean one-variable control on load, and I am
not claiming the sets would be identical under equal load. The claim is the
weaker and sufficient one: the base is already red on this toolchain, the
membership of the failing set is unstable between runs, and every test the
phase adds passes.

## What this verification did NOT cover

1. **The `check-dual-review` gate in CI.** Every capture here is local. The gate
   runs on `pull_request` only and stays not-applicable on this branch, which
   commits no verdict document, so I did not find any run in which the green arm
   was witnessed in CI. I did not search the CI history to establish that none
   exists; what I measured is that this branch cannot produce one, because the
   precondition counts verdict documents and this branch commits zero.
2. **The other conditional gates.** The sweep that
   `delivery/plan/m4-charter-blocks-every-merge.md` asks for has still not been
   run. I followed the same one finding.
3. **Whether the charter's PROSE is right.** I checked that it validates, that
   its two mode fields resolve by name, and that the gate accepts it. Whether
   `full` is the correct declared mode, whether the DR-0036 constraint is
   quoted faithfully, and whether `release-verification: reserved` is the right
   disposition are judgement calls for a clean-room reviewer, and I did not
   substitute for one.
4. **`assurance-modes.yaml` still carries `max-fix-rounds-after-review: 2`**,
   which the work history flags as disagreeing with DR-0035. I did not
   enumerate what reads that value either, so the open item stays open with no
   new information.
5. **The full gate bundle at this head.** I ran `citations` and `scope` only.
   The work history's bundle numbers (declared 16, 9 green, 2 red, 5
   not-applicable) are its own measurement and I did not re-run them.

## Two content checks a reviewer will want, and one small observation

Both are cheap and neither is a finding against the phase.

**The DR-0036 constraint is quoted faithfully, word for word.** The charter says
it quotes rather than paraphrases, so I checked the source. DR-0036's own
section "The condition, and it is not optional" reads "The current process
retains planning, review, credentials, pull request, merge, recovery and
closeout authority for every kernel phase delivered this way, until the cutover
workstream says otherwise. Tiphys owns the bounded local lifecycle and nothing
else." That is character for character what the charter carries.

**Every decision record the charter cites exists.** DR-0035 through DR-0043 are
all present under `delivery/decisions/` on the plan branch, and the titles of
DR-0039, DR-0040, DR-0041 and DR-0043 match the use the charter makes of each.
`identity.kernel-version-pin: 0.1.0` matches `package.json` on the branch.

**The observation, at LOW and recorded rather than raised.** The charter's
`identity.repo` is the SSH form, `git@github.com:ThomasHendrickx/tiphys-ai-helmsman.git`,
while this clone's actual remote is the HTTPS form,
`https://github.com/ThomasHendrickx/tiphys-ai-helmsman`. They name the same
repository and the schema requires only a non-empty string, so nothing is
invalid. It is inert today: a search of `src/` and `scripts/` for a reader of
`identity` found no consumer of this field, so no code chooses a transport from
it. It is worth knowing because M5 onboards a project from its charter alone,
and this container pushes over HTTPS through a proxy rather than over SSH, so
the day something does read the field the two forms stop being equivalent.

## The claim grep, both forms

Run against this file as CLAUDE.md binds. Occurrences rather than matching
lines, so the two numbers are comparable:

| form | occurrences |
|---|---|
| the line-based binding command | 8 |
| the wrap-insensitive `tr` form | 8 |

Zero missed by hard wrapping. Eight is the whole-file number and FOUR of the
eight are the rows of the table just below, which quote each hit in order to
dispose of it. That is arithmetic rather than a second claim, and it is stated
before the table rather than after so a re-runner is not surprised by it. The
four substantive hits, keyed by section rather than by line number, because a
line number in this table goes stale the moment anything above it is edited:

| hit | section | settled by |
|---|---|---|
| "never from the tail of a pipe" | the acceptance criterion | a statement about my own method, and the arm tables immediately below print exit codes taken directly from each command |
| "never decodes" | the second witness class | the adjacent captured output, which is the YAML parser's own refusal |
| "never reached the charter schema" | the finding | the measured pair in that section, a green exit 0 on a file `validate` rejects, plus the paragraph immediately after it that bounds the claim and names what the derivation excludes |
| "the branch itself was never touched" | the scope gate | the sentence two paragraphs down naming `git clone --no-local` as where the simulation happened, and `git status --porcelain` printing nothing in the branch's own worktree |

A re-run therefore returns 8 and not 4, and the four rows above are the
difference. Subtract this table.

## The process finding, which is the reason to read this at all

Two implementers were dispatched for one phase, and the brief I was given
carried nothing that would have told me so. I did not find a way to learn it
from the dispatch alone; what settled it was running these two commands before
writing anything, and they are cheap and mechanical:

```
git log --oneline -1 <the phase branch>
git ls-remote origin 'refs/heads/<the phase branch>'
```

A dispatch that does not carry the phase branch's current head leaves the
implementer to discover an occupied branch by colliding with it. The cost here
was small because the first implementer had finished; had it been mid-flight,
two agents would have been writing the same five files.
