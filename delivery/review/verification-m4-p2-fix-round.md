# Delta verification of the M4-P2 fix round

Subject: phase M4-P2, branch claude/m4-p2-async-launch.
Reviews under verification were produced against b12dc98.
Head under verification: 3b6739da98489fc6c6f34df3837b41c512fb2c15.
Delta: git diff b12dc98..3b6739d.

Status: COMPLETE. This file was appended as work proceeded; its mtime was
the beacon for this agent.

## Plan

1. Read CLAUDE.md, the M4-P2 plan section, the work history, all three
   prior reviews.
2. FIRST CHECK: does the work history state what its derivation did NOT
   cover? Run the derivation, then widen it in an excluded direction.
3. Per original finding: name the mechanism, check other call sites,
   reproduce against b12dc98 and show gone at 3b6739d.
4. Attack the round: red witnesses, guards that cannot go red, counts
   pinned over append-only registries, the claim grep in both forms, the
   four-part suite sentence, C-1/C-2/C-3.
5. Verdict under DR-0027: reachability decides blocking, not severity.

## Progress log

- Clone at 3b6739d. `npm ci` exit 0, `npm run build` exit 0 (log captured).
- Read: CLAUDE.md, the M4-P2 plan section, all three prior reviews, the whole
  work history including the 785-line fix-round section.
- RED-WITNESS GATE RUN BY ME AT THIS HEAD: green, 6 witnesses, 13 members.
- Widened derivation (c) into the excluded direction (the round's OTHER
  authored files): 21 distinct citation tokens across the two captures, the
  five witness specs and the declaration, all resolve and all land on what the
  adjacent sentence claims. No finding.

Next: reproduce the b12dc98 red; run the rest of the gate bundle; attack the
new red witnesses by defanging; claim greps over the round's new authored
files; suite.

## Session 2 (resumed after the first agent stopped)

The first verifier session stopped after the entry above. This session resumes
in the same clone at the same head and RE-RUNS rather than inherits: every
claim in the progress log above is treated as a lead to confirm, not as a
result. Anything below this line was measured in session 2.

### S2-1. The delta contains NO shipped source change

Measured in session 2:

```
$ git diff --stat b12dc98..3b6739d
 delivery/plan/phase-declarations/m4-p2.json        |   5 +
 delivery/review/clean-room-M4-P2-both-structured.md     | 176 +++++
 delivery/review/clean-room-M4-P2-fable-cr.md       |  89 +++
 delivery/review/clean-room-M4-P2-opus5-correctness.md   | 344 +++++++++
 delivery/work-history/m4-p2.md                     | 833 ++++++++++++++++++++-
 test/spawn.test.ts                                 | 149 +++-
 witness/captures/spawn-launch-failure-vs-payload-exit.txt   |  46 ++
 witness/captures/spawn-turn-end-hook-record.txt    |  64 ++
 witness/spawn-async-launch-awaited.json            |  31 +
 witness/spawn-completed-without-turn-end-is-incomplete.json |  16 +-
 witness/spawn-rejected-launch-rolls-nothing-back.json       |  19 +-
 witness/spawn-returns-after-payload-sentinel.json  |  31 +
 witness/spawn-unparseable-turn-end-is-incomplete.json       |  31 +
 13 files changed, 1810 insertions(+), 24 deletions(-)
```

`src/spawn.ts`, `src/task.ts` and `src/watcher.ts` are IDENTICAL at b12dc98 and
at this head. That bounds what this round can have broken in a shipped
artifact: under DR-0027 nothing in this delta reaches src/, bin/, schemas/,
roles/ or tuition/, because the delta touches none of them. It does NOT bound
what it can have broken in the evidence, which is where I concentrated.

### S2-2. Original finding 1 (HIGH, blocking): REPRODUCED at b12dc98, GONE at head

Both runs by me, same clone, same interpreter (node v26.6.0 at
/home/user/n26/node-v26.6.0-linux-x64/bin/node), same base 6961186.

At b12dc98, in a worktree cut from this clone:

```
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: red-witness: red: 3 witness(es) evaluated (3 own, 0 stored re-evaluated in 0ms);
  witness spawn-completed-without-turn-end-is-incomplete: red: rule (f): the phase diff
  touches src/spawn.ts, which the spawn/parse derivation (JS:
  child_process|execFile|spawnSync|execSync; shell *.sh: spawn-and-parse) matched, so
  consumesExternalOutput is required and this witness omits it;
  witness spawn-rejected-launch-rolls-nothing-back: red: rule (f): ... omits it
GATE_EXIT=1
```

At 3b6739d:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 6 witness(es) evaluated (6 own, 0 stored re-evaluated in 0ms);
  every witness red against every declared dangerous state and green at head
GATE_EXIT=0
```

The green is NOT vacuous, and that was checked rather than assumed. From my own
run's witness-records.json: six specs, THIRTEEN members, and every member has
three recorded runs, two red (deterministic, repeats 2) then one green at head.
Member counts per spec: spawn-async-launch-awaited 2,
spawn-completed-without-turn-end-is-incomplete 2,
spawn-rejected-launch-rolls-nothing-back 3, spawn-returns-after-payload-sentinel
2, spawn-unparseable-turn-end-is-incomplete 2, watcher-signal-surfaced-once 2.
At b12dc98 the two refused specs recorded ZERO members, so the refusal
short-circuited before anything ran. The round moved 0 executed members to 13.

### S2-3. The mechanism behind finding 1, and the other call sites

The work history names the mechanism as "a verdict or a declared scope
published wider or narrower than the evidence behind it, where the authority
that would settle the difference was available and was not run". That is the
right mechanism, and the other call sites of it are THE OTHER GATES this phase
claimed a verdict about. I did not take the document's enumerator for that; I
ran the WHOLE BUNDLE, which is the authority itself.

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <scratch> --base 6961186 --head HEAD --phase m4-p2
gates: declared 16 applicable 11 verdict 10 green 9 red 1 not-applicable 5 error 1 vacuous 0
gates: manifest-self-check: green: validated 8 schema document(s) ...
gates: coverage: green: 115 inventory id(s) checked ...
gates: credential-scrub: green: no pull-request-capable credential resolvable from any of the 7 probed sources
gates: credential-token: not-applicable: precondition implementer-token-present-owner-action-a-3 ... unmet
gates: suite: red: 1 finding(s): failing test: "a precondition command exiting nonzero
  is error, not a skip, whenever a path-shaped argv element cannot be opened: unreadable,
  after an option, or carrying whitespace" (test/gates.test.ts)
gates: citations: not-applicable: no changed path under the configured documents globs
gates: scope: error: merge base 6961186 ... is not an ancestor of the configured trunk origin/main
gates: deploy: not-applicable ... ; migrations: not-applicable ...
gates: clause-map: green: 74 rows checked, 0 pending a phase not yet in force
gates: red-witness: green: 6 witness(es) evaluated ...
gates: agent-rules-drift: green: ... (3 preflight step(s), 18 gate(s))
gates: brief-drift: green: ... (18 row(s) compared)
gates: check-agents-references: green: 21 references resolved ...
gates: check-dual-review: not-applicable: precondition dual-review-verdicts-present ... unmet
gates: license: green: 10 production package(s) inventoried ...
GATE_EXIT=21
```

So of the four gates the document makes a claim about, `red-witness` is green,
`coverage` is green, `scope` errors for the reason the document and CR fable
finding 1 both predicted (the declaration is created BY the phase and so is
absent at the merge base), and `suite` is red for a reason I show below is not
this delta's. No OTHER deduced verdict turned out wrong. The mechanism is
closed as far as this bundle can close it.

### S2-4. FIRST CHECK: the derivation, run and then widened

The work history states what its derivation did not cover, at
`delivery/work-history/m4-p2.md` section 3, before any row. Seven items. I ran
the derivations and then widened them in three excluded directions.

**Derivation (a), reproduced exactly.** The gate defines seven lettered rules
and the document at b12dc98 named five:

```
$ grep -oE 'rule \([a-z]\)' src/witness/run.ts | sort -u | tr '\n' ' '
rule (a) rule (b) rule (c) rule (d) rule (e) rule (f) rule (g)
$ git show b12dc98:delivery/work-history/m4-p2.md | grep -oE '\([a-g]\)' | sort | uniq -c
      1 (a)
      2 (b)
      9 (d)
      2 (e)
      3 (g)
$ grep -oE '\([a-g]\)' delivery/work-history/m4-p2.md | sort | uniq -c   # at this head
      9 (a)  9 (b)  9 (c)  16 (d)  5 (e)  14 (f)  8 (g)
```

The gap was {c, f} and at this head all seven are named. Reproduced.

**WIDENING 1, excluded direction: enumerator (a)'s vocabulary is "a
parenthesised letter", and the gate has red conditions that carry no letter.**
The not-covered statement names ONE gap in that vocabulary (rule (f)'s shell
half). It does not name the general one. Measured by reading
`evaluateWitness` rather than `evaluateRefusalRules`, there are four red
conditions with no letter at all:

```
src/witness/run.ts:1492  named test(s) not found in any test file at the audited head
src/witness/run.ts:1540  member N: no named test reaches this arm
src/witness/run.ts:1547  member N: red in X of Y repetitions
src/witness/run.ts:1560  member N: the named tests are not green at the audited head
```

plus six more reason sites in src/gates/red-witness.ts (lines 258, 265, 364,
395, 422, 427), including the coverage rule.

This is not a hypothetical gap: **the second of those four IS the round's own
defect B**, the one the round found by EXECUTING the gate rather than by
running enumerator (a). So the enumerator the round published as the fix for
"a scope derived from a person's enumeration" is itself narrower than the thing
it measures, and its not-covered statement does not say so. The substance was
caught anyway, by execution. Recorded as finding DV-3 below.

**WIDENING 2, excluded direction: "enumerator (c) reads the work history only.
The other authored files this round touches carry citations too, and those were
checked by reading them, not by the resolver."** I ran the resolver over those
files. Twenty-one distinct tokens across the five witness specs, the two
captures and the declaration: `src/spawn.ts` at 155, 179, 220, 232, 299 and
612, and the two capture files at line 1. All twenty-one resolve, and I read
each target line against the sentence beside it. All twenty-one land on what is
claimed (for instance `src/spawn.ts:220` is `if (result.error !== undefined) {`,
which is what the capture says it is, and `src/spawn.ts:612` is
`return rollback(...)`). **No finding in this direction.**

**WIDENING 3, excluded direction: "I did not restage a clone to reproduce the
[scope gate's] green half a second time."** I restaged it. A clone whose trunk
is 6961186 with the head declaration committed onto it, `origin/main` pointed
at that trunk, the branch merged:

```
gates: scope: green: 18 changed path(s) audited against declaration
  delivery/plan/phase-declarations/m4-p2.json at merge base abe6d13
  (2 declared path(s) not touched: delivery/plan/phase-declarations/m4-p2.json,
   test/watcher.test.ts)
```

This matters more than a repetition, because the round LANDED THREE NEW FILES
after the work history's own scope check was captured. The work history says
"Sixteen paths"; at the final head there are NINETEEN, the three extra being
the clean-room reviews landed by the last commit. None of the three is on
`filesToTouch` or `declaredExtras`. I checked whether that is a problem and it
is NOT: `isPhaseOwnEvidence` at src/gates/scope.ts:568 makes a file directly
under `delivery/review/` whose basename is `clean-room-` followed by the phase
id and a boundary a standing extra, and the staged run above audits all of them
green. The same rule covers this document, and I confirmed that by staging it
too: `scope: green: 19 changed path(s) audited`.

### S2-5. Original findings, one by one

| # | mechanism | fixed at the mechanism? | closed at head? |
|---|---|---|---|
| opus5 1 (HIGH) | a required gate's verdict DEDUCED, not executed | YES, and wider: I ran the whole bundle, not the one gate | YES, reproduced red at b12dc98 and green here |
| opus5 2 / fable 2 (MED/LOW) | a line number typed rather than derived | PARTLY: see DV-1 | the two named citations, yes |
| opus5 3 (MED, tracked) | a destructive arm resting on an adapter's unverified word | NOT FIXED, declared, plan-scoped | still open, unchanged, unreachable today |
| opus5 4 (LOW, tracked) | evidence written where the party it guards can write | NOT FIXED, declared | still open, unchanged |
| opus5 5 (LOW, tracked) | rule (g)'s distinctness test is syntactic | NOT FIXED, declared | still open; see DV-2, which is the stronger form |
| fable 1 (MED, tracked) | declaration absent at the merge base | ORCHESTRATOR, unchanged | still open; green when staged |
| fable 3 (LOW, tracked) | the spec carried no rollback-shaped member | YES, member 2, and I watched it redden 2/2 | YES |
| fable 4 (LOW, tracked) | the precondition accepts any record of the right shape | NOT FIXED, declared, plan-scoped | still open |
| fable 5 (LOW) | shared scratchpad | environment | n/a |

Three of the nine were closed; six were declared not-fixed WITH a reason, and
each reason I checked is accurate rather than a dismissal. opus5 3 in particular
is refused on binding convention 2 (the plan authorises the `completed` check
only) and the disposition restates the reviewer's own reachability sentence as a
statement about the search rather than about the arm, which is the correct form.

### S2-6. Attacking the round: what I tried to break

#### DV-2 (MEDIUM, TRACKED): two of the round's five witnesses have two members that are THE SAME DANGEROUS STATE, and I measured it rather than read it

`witness/spawn-async-launch-awaited.json` and
`witness/spawn-returns-after-payload-sentinel.json` are NEW in this round and
their `dangerousStates` arrays are BYTE-IDENTICAL: member 0 swaps the async
helper for the synchronous one at the call site in `src/spawn.ts`, member 1
drops the `await` inside the helper in `src/task.ts`. I hashed every member of
every spec in my own gate run's records to find it:

```
member (file, find, replace) sha256, first 10:
  spawn-async-launch-awaited          0 src/spawn.ts e62d4d2b9f   1 src/task.ts b06172ab23
  spawn-returns-after-payload-sentinel 0 src/spawn.ts e62d4d2b9f  1 src/task.ts b06172ab23
  spawn-rejected-launch-rolls-nothing-back 0 src/spawn.ts e62d4d2b9f (shared with both above)
```

CLAUDE.md's "One witness is not a class" requires two STRUCTURALLY DIFFERENT
members. Different FILES is not the same as a different state, so I applied each
member separately in a clean lab and compared what the named test reported.

```
member 0 (src/spawn.ts, runStep for await runStepAsync):
  AssertionError: the deferred-test-adapter adapter reported the payload completed
  with exit code undefined, but the turn-end record .../t-deferred/turn-end was never
  written, so the kernel does not accept that the payload ended; ... false !== true

member 1 (src/task.ts, value: step() as unknown as T):
  AssertionError: the deferred-test-adapter adapter reported the payload completed
  with exit code undefined, but the turn-end record .../t-deferred/turn-end was never
  written, so the kernel does not accept that the payload ended; ... false !== true
```

The two failures are IDENTICAL, character for character, apart from the random
scratch directory name. Both leave `launched.value` a pending promise; they are
one dangerous state reached by two edits, not two members of a class. Under the
repository's own rule that is one member, and these two specs each have one.

**Why the gate did not catch it, and this is the part worth carrying.** Rule (g)
is the distinctness rule, and it does not run here at all: it is gated on
`spec.class === "classification" || derivation.textAsserting`
(src/witness/run.ts:1345) and these specs are `destructive` with
`textAsserting` false in my own records. Even if it did run, its distinctness
test is `first.file === second.file && first.find === second.find`
(src/witness/run.ts:1368), a syntactic comparison that two members in
DIFFERENT files pass by construction whatever they do at run time. So this is a
guard that cannot go red for the property it names, which is the shape CLAUDE.md
records six variants of. The opus5 reviewer saw the weaker substring form of
this on the watcher witness; the measured identical-failure form is stronger.

**In the round's favour, and it is not a small point: the round DISCLOSES this.**
The table at section 4.2 of the work history says of
spawn-returns-after-payload-sentinel, in bold in its own words, "the same pair,
for the C-3 consequence", and both specs' `provenance` argues the case openly
("one missing await has several consequences, and each consequence is a separate
registered behavior with its own named test"). That argument is reasonable for
why two BEHAVIORS exist. It is not an argument that either SPEC has two
different members, and the document does not claim it is.

REACHABILITY (DR-0027): `witness/` is not a shipped surface. Confirmed rather
than assumed: `package.json`'s `files` array is dist, LICENSE, AGENTS.md,
gate-registry.yaml, gates.manifest.json, assurance-modes.yaml, checklists,
role-model-config.yaml, roles, schemas, templates, tuition. No `witness`. The
defect reaches a future editor of these two specs and nothing else. **TRACKED,
NOT BLOCKING.** It is also not a regression: at b12dc98 both specs were refused
under rule (f) with `"members": []`, so ZERO members ran. Thirteen executed
members with two duplicated pairs is strictly more assurance than none.

#### DV-1 (MEDIUM, TRACKED): the round's own claim-grep section names twelve line numbers, and none of them has ever been right

This is the mechanism the round declared it was closing, recurring inside the
section the round wrote to close it. Findings C and D of the round's own
mechanism statement are "a line number typed rather than derived, which resolves
silently into the wrong place". The fix mechanised `path.ext:LINE` citations
with a resolver. It did not mechanise BARE line numbers, and the claim-grep
disposition uses those.

The COUNTS are correct and I verified all six of them:

```
$ S=$(grep -n "^Three greps, over the FINAL text" delivery/work-history/m4-p2.md | cut -d: -f1)   # 1692
$ grep -nEi '<binding alternation>' ... | awk -F: -v s="$S" '$1<s' | wc -l      -> 12   (document claims 12)
$ grep -nEi '<extended alternation>' ... | awk -F: -v s="$S" '$1<s' | wc -l     -> 18   (document claims 18)
$ head -n $((S-1)) ... | tr '\n' ' ' | grep -oEi '<binding>' | wc -l            -> 12   (document claims 12)
$ whole file, line-based / wrap-insensitive occurrences                          -> 32 / 61 (document claims 32 / 61)
```

No wrap miss anywhere: 12 lines against 12 occurrences outside the section, 61
against 61 over the whole file. The self-referentiality is handled honestly and
both sides of it are given. That half is right.

The LINE NUMBERS are not. The document's capture lists hits at 220, 329, 612,
658, 1184, 1295, 1335, 1439, 1441 and 1506; the real hits at this head are at
223, 332, 615, 661, 1187, 1298, 1338, 1458, 1460 and 1525. Two of the published
numbers land on a BLANK LINE (329 and 1335). The disposition beneath is prose in
the author's own voice and it keys on those numbers, so it misfiles hits:

| document says | what that line actually is at this head |
|---|---|
| "a NEGATION ...: 220" | "`childEnv === undefined`. This arm has NO test..." |
| "a quoted test title or gate comment: ... 329" | a blank line |
| "a claim with its evidence adjacent: ... 1335" | a blank line |
| "captured output, unaltered: ... 1439, 1441" | two lines of ordinary prose |

I checked whether the capture was simply taken at an earlier commit and declared
as such. It was not declared, and it was already wrong at 30515a2, the commit
that introduced it: line 220 there is the same wrong line. The heading says the
greps are "over the FINAL text of this file".

A SECOND INSTANCE OF THE SAME CLASS, so this is not one slip. Section 10's
changed-paths block says "Sixteen paths, which is the same sixteen the citations
gate counted" and lists sixteen. At the head under review there are NINETEEN:

```
$ git diff --name-only 6961186...HEAD | wc -l
19
```

The three extra are the clean-room reviews, added by the LAST commit 3b6739d,
after the work history's own check was captured at 30515a2. My full-bundle run
independently reports "19 changed path(s) total" in the citations line. So the
round's evidence about its own scope describes a commit that is not the head
being reviewed, in two separate places.

REACHABILITY (DR-0027): `delivery/work-history/m4-p2.md` only. It reaches no
shipped file and no user-visible command, and the `citations` gate is not even
applicable to it (my run: "not-applicable: no changed path under the configured
documents globs"). **TRACKED, NOT BLOCKING.** The cost is real but bounded: a
later reviewer following the disposition list cannot check the disposal, which
is exactly what this round paid a round trip to fix one level up.

#### DV-3 (LOW, TRACKED): enumerator (a) measures lettered rules and is described as measuring "the rules the gate defines"

Covered in S2-4 above. The gate has at least four red conditions in
`evaluateWitness` and six reason sites in `src/gates/red-witness.ts` that carry
no letter, so a regex over `rule \([a-z]\)` cannot see them. The round's own
defect B is one of them, found by EXECUTION rather than by the enumerator, which
is the right outcome reached by the other route. The not-covered statement names
one gap in that vocabulary (the shell half of rule (f)) and not the general one.
REACHABILITY: the work history. TRACKED, NOT BLOCKING.

#### DV-4 (LOW, TRACKED): one new assertion block cannot go red for the property its comment claims

The round added two lines to the unparseable-turn-end test:

```
const shapeCaptured = readCapture(HOOK_CAPTURE);
assert.match(shapeCaptured, /"endedAt": "[0-9]{4}-[0-9]{2}-[0-9]{2}T/, HOOK_CAPTURE);
assert.match(shapeCaptured, /"exitCode": [0-9]+/, HOOK_CAPTURE);
```

with the comment "so a later change to the hook's record makes this test wrong
loudly rather than quietly". Both assertions read the STATIC capture file, and
nothing in that test reproduces the hook live, so a change to the hook cannot
reach them. I defanged the shipped generator to check rather than reason:
`src/hooks.ts` `renderTurnEndHook` changed to write `endedAt: "not-a-date"`,
which `src/spawn.ts` still accepts because it only checks `typeof ... ===
"string"`. Then `node --test test/spawn.test.ts`:

```
FAIL: the turn-end record carries the payload exit code and a parseable timestamp
FAIL: spawnTask returns only after a payload the adapter awaited has written its sentinel
FAIL: a launch outcome resolved on a later event-loop turn is read as an outcome, not as a pending promise
```

Three tests redden, and the test the comment is attached to, "a turn-end record
that is present but does not parse is refused just as an absent one is", stays
GREEN. So the claim in the comment is false. The three that do redden all go
through `assertTurnEndMatchesCapture`, which pairs the capture assertions with a
read of the record a real hook child wrote; that helper is the correct
construction and it works. Only the unpaired copy is inert.

REACHABILITY: `test/spawn.test.ts` and a comment in it. The test's own behaviour
is separately guarded by
`witness/spawn-unparseable-turn-end-is-incomplete.json`, whose two members
(skip the parse; skip the shape check) I watched redden 2/2 each in my own gate
run, so the BEHAVIOUR is witnessed and only the added anchor is inert. **TRACKED,
NOT BLOCKING.**

#### DV-5 (MEDIUM, TRACKED): fable finding 3 is closed at the INSTANCE and not at the MECHANISM, and this is the shape the fix-round contract exists to catch

CR fable finding 3 said the rejection witness carried no rollback-shaped
dangerous state, and its recommendation named the member precisely: "Add a third
member replacing `return {ok:false, reason: ...}` in the rejection arm with THE
UNLINK LOOP, so the gate guards the residue assertions' non-vacuity rather than
a hand lab."

The round added a third member. It replaces that same return with
`return rollback(...)`, which is a different edit: it runs the whole rollback,
and the whole rollback CHANGES THE REFUSAL MESSAGE as well as unlinking the
records. So the named test reddens on the message, several assertions before it
reaches the residue loop.

Measured. Member 2 applied alone, in a clean lab at this head:

```
AssertionError: launching the payload through the rejecting-test-adapter adapter failed:
  the session died after the agent had been working for an hour; the rejecting-test-adapter
  adapter did not report whether the payload started; rollback of the worktree did not
  complete: worktree .../t-rejected has uncommitted changes or untracked files; ...
    at TestContext.<anonymous> (.../test/spawn.test.ts:1120:12)
```

Line 1120 is `assert.match(reason, /nothing was rolled back/, reason)`. The
residue loop over `meta.json`, `brief.md` and `turn-end-hook.mjs` is twenty-five
lines further down and is never reached.

So I ran the experiment that settles it: DELETE the residue loop from the test,
then apply member 2.

```
residue assertions DELETED and member 2 applied
EXIT=1
AssertionError: ... at TestContext.<anonymous> (.../test/spawn.test.ts:1120:12)
```

**The member still reddens with the assertions it was added to protect removed
from the file.** The gate would be green over a test that no longer makes the
check. That is precisely the property fable finding 3 asked the member to
guarantee, and it does not hold. The work history's disposition table records
fable 3 as "FIXED ... and the gate reddens it 2/2", which is a true sentence
about the member and not about the property.

The reviewer's own recommendation would have worked: replacing the return with
the UNLINK LOOP ALONE leaves the refusal message intact, so the four message
assertions stay green and only the residue loop reddens. That is the member
that makes the residue assertions non-vacuous under the gate.

REACHABILITY (DR-0027): `witness/spawn-rejected-launch-rolls-nothing-back.json`
and `test/spawn.test.ts`. Neither is shipped (`witness` and `test` are absent
from `package.json`'s `files`). No user-visible command and no file under
`src/`, `bin/`, `schemas/`, `roles/` or `tuition/` is reached. **TRACKED, NOT
BLOCKING.** The BEHAVIOUR under test is correct and is separately witnessed;
what is unguarded is one assertion block's non-vacuity against a future edit.

#### What I tried to break and could NOT

- **Did the split lose a witnessed test?** No. Six tests were named by a spawn
  witness at b12dc98; all six are still named by some spec at this head, and the
  five that moved each went to a new one-test spec. Checked by parsing every
  `witness/*.json` at both shas and diffing the name sets.
- **Is the green gate vacuous?** No. Thirteen members, each with two red
  repetitions and one green, recorded in my own run's `witness-records.json`.
  `uncoveredSources` is `[]`, so no changed source lacks a covering spec.
- **Did the round weaken an assertion it rewrote?** No. The deferred test's
  inline checks (`turnEnd.exitCode === 7`, `Date.parse(endedAt)` not NaN) were
  replaced by `assertTurnEndMatchesCapture`, which asserts both of those AND
  `typeof endedAt === "string"` AND two regexes over the capture. Strictly more.
- **Criterion 5, the one whose evidence range was wrong.** Re-derived range
  1182-1225: `grep -cE 'Date\.now|performance\.|setTimeout|hrtime'` returns 0,
  and the test asserts on `existsSync(sentinel)` at the moment spawnTask
  returns. C-3 is witnessed on a file, not on a clock.
- **Finding 2's two bad citations.** The criteria walk now cites 904, 1009,
  1063, 1182 and 1271, and every one of those lines is the `test(` that opens
  the named test. The two stale tokens survive only inside a correction table
  and are QUOTED in backticks there, which is the correct handling under
  CLAUDE.md rule 3b; commit 92df609 exists for exactly that.
- **C-1, C-2, C-3 over the delta.** Greps over every added line in `test/` and
  `witness/`: no `pid`, `/proc/`, `process.kill` or signal name; no `unref`,
  `detached` or async `spawn(`; no log-tail read. The new child processes all
  use `spawnSync`, which blocks and is not auto-backgrounding.
- **A count pinned over an append-only registry.** None. The resolution test at
  `test/spawn.test.ts:1271` derives its owned set at run time by matching
  registry descriptions against the file's own source and asserts
  `owned.length > 0` as the anti-vacuity guard, with no number pinned. No added
  line asserts a length against a literal.
- **Authored bytes.** `node scripts/check-authored-bytes.mjs` exit 0, no output.

### S2-7. The suite sentence, and the load the gates ran under

**My run, all four qualifiers plus the head.** Interpreter node **v26.6.0**
(`/home/user/n26/node-v26.6.0-linux-x64/bin/node`, a home-directory prefix, so
the standing-warning-1 interpreter traversal trap does not apply and
`namei -m` shows every component `drwxr-xr-x`); `dist/` **BUILT** (`npm ci`
exit 0, `npm run build` exit 0, `git status --porcelain` shows only my own
untracked report); invocation **`npm test`**; tree a **real non-shallow git
clone** (`git rev-parse --is-shallow-repository` returns false), not a
`git archive` copy; head **3b6739d**.

```
tests 855
suites 0
pass 854
fail 1
cancelled 0
skipped 0
todo 0
duration_ms 363954.63645
SUITE_EXIT=1
```

Load average was 12.90 at the start and 9.20 at the end, on a four-cpu
container. TRANSLITERATION DECLARED: the seven summary lines above had U+2139
(INFORMATION SOURCE) stripped from the head of each line, 7 occurrences, and
nothing else in any captured output in this document was changed. U+2716 (HEAVY
MULTIPLICATION X) occurs 0 times in pasted output here and U+2714 0 times;
where I name a failing test I write `FAIL:` in my own voice instead of pasting
the glyph.

**855 is the same total the work history and both clean-room reviewers
measured**, which is the expected result because this round adds no `test(`
call: it adds helper functions and assertions inside existing tests. Zero
SKIPPED.

**The one failure and why it is not this delta's.** It is
"a precondition command exiting nonzero is error, not a skip, whenever a
path-shaped argv element cannot be opened: unreadable, after an option, or
carrying whitespace", in `test/gates.test.ts`. Three reasons, and the first two
are measurements rather than arguments:

1. It PASSES in isolation at this head: `node --test --test-name-pattern
   '<that title>' test/gates.test.ts` gives 1 test, 1 pass, 0 fail, and it
   passes in isolation at the phase base 6961186 in a sibling worktree of the
   same clone under the same interpreter. So it is not a property of the head.
2. Neither the delta (b12dc98..3b6739d) nor the whole branch against
   `origin/main` touches `test/gates.test.ts` or anything under `src/gates/`.
   The branch's changed set is `src/spawn.ts`, `src/task.ts`, `src/watcher.ts`,
   `test/behaviors.json`, `test/credentials-gate.test.ts`, `test/spawn.test.ts`,
   `witness/**` and `delivery/**`.
3. The opus5 clean-room reviewer hit THE SAME TEST at b12dc98 in their own
   clone, before this round existed.

I ran the full suite at the phase base as a control rather than stopping at
those three. Result in S2-8.

**Load matters here and it is quoted rather than assumed.** `/proc/loadavg` was
0.37 before my `red-witness` run and 2.27 after; 6.77 before the full bundle and
14.06 after. The `coverage` gate, which CLAUDE.md and the work history both
record as the wall-clock false-red signature at
`src/gates/coverage.ts` REGEX_EXEC_TIMEOUT_MS, was GREEN in my bundle (115
inventory ids) despite finishing at load 14. So the flake did not fire for me,
which corroborates the work history's own observation that it is not
deterministic in load either.

### S2-8. The one suite failure, controlled and then DIAGNOSED

I did not stop at "it looks environmental". Four full `npm test` runs, same
clone, same interpreter, same build state, same invocation:

| run | head | tests | pass | fail | SKIPPED | exit | load at start |
|---|---|---|---|---|---|---|---|
| head 1 | 3b6739d | 855 | 854 | 1 | 0 | 1 | 12.90 |
| head 2 | 3b6739d | 855 | 854 | 1 | 0 | 1 | 6.94 |
| base 1 | 6961186 | 849 | 849 | 0 | 0 | 0 | 5.10 |
| base 2 | 6961186 | 849 | 847 | **2** | 0 | 1 | 6.71 |

**Base run 2 reproduces the SAME failing test at the phase base**, plus the
`test/coverage-gate.test.ts` "deleting an appendix row is red naming the orphan
id" wall-clock false red that CLAUDE.md and the work history both document. So
the failure occurs at a head that does not contain this branch at all. It is not
branch-attributable, and that is now a control result rather than an inference.
Base run 1 being clean is what made the second control necessary: one green
control would have let me attribute the head's red to the branch, wrongly.

**The mechanism, measured.** The failing assertion is

```
AssertionError: gate p11-attr wrote no record at /tmp/tiphys-gates-.../result.json;
  the run itself did not reach a verdict, which is an env...
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module
    '<clone>/src/cli.ts' imported from <clone>/bin/tiphys.ts
  at readGateRecord (<clone>/test/gates.test.ts:3558:12)
```

`src/cli.ts` EXISTS, at this head, at the base and on `origin/main`
(`git ls-tree` returns one entry for each). The child that cannot see it is the
unprivileged one `runCliUnprivileged` spawns, and it cannot see it because it
cannot traverse `/tmp/claude-0`, which is `drwx------`. The test's own helper
`grantTraversalWhenUnderTmp` chmods every directory from the repository root up
to `/tmp` with `| 0o055` to fix exactly that, and I watched it work: sampling
`stat -c %A /tmp/claude-0` in a loop during a run, the mode flipped from
`drwx------` to `drwxr-xr-x` at sample 17.

**And then I found what takes it away again.** At the END of that sampling call
the mode was `drwxr-xr-x`. At the START of my very next Bash tool call it was
`drwx------`:

```
(end of one tool call)    final: drwxr-xr-x
(start of the next)       at start of this bash call: drwx------
```

So the agent harness resets `/tmp/claude-0` to 0700 on each tool invocation, and
a reviewer polling a background suite REVOKES, once per poll, the traversal that
suite granted itself. Any `runCliUnprivileged` child spawned in the window
between a reset and the next grant fails this way. That is why the opus5
reviewer hit the same family at b12dc98 before this round existed, why it is
intermittent, and why it has nothing to do with the branch.

**This sharpens standing warning 1 rather than merely re-applying it.** The
warning says the trap is a property of the INTERPRETER'S path; my interpreter is
under `/home/user` and `namei -m` shows every component `drwxr-xr-x`, so by the
warning as written I should have been immune. The property that actually bit is
the REPOSITORY's path plus a concurrent writer to the directory mode. Recorded
for the orchestrator: **a suite result measured in a `/tmp/claude-0` worktree is
only sound if nothing else touches the session scratch root while it runs**,
which for an agent polling its own background job is not the default. Running
from a `/home/user` clone avoids it.

### S2-9. Verdict

**APPROVE.**

The one blocking finding from the prior round, opus5 finding 1, is CLOSED, and
closed at the mechanism rather than at the instance: the round did not just add
`consumesExternalOutput` to two files, it ran the authority, found a second
defect the refusal had been hiding (a member must redden EVERY test its spec
names, `src/witness/run.ts:932`), and restructured five specs so each names one
test. I reproduced the red at b12dc98 and the green here, and I checked that the
green is not vacuous: thirteen members, each red twice and green once. I then
went wider than the round did and ran the whole gate bundle; no other deduced
verdict turned out wrong.

Five findings are mine and **every one is TRACKED, none blocking**, because the
delta touches no shipped path at all. `src/spawn.ts`, `src/task.ts` and
`src/watcher.ts` are byte-identical at b12dc98 and at this head, and the delta's
thirteen files are the phase declaration, three clean-room reviews, the work
history, `test/spawn.test.ts` and seven files under `witness/`. Under DR-0027,
shipped means `src/`, `bin/`, `schemas/`, `roles/`, `tuition/`; `test/` and
`witness/` are in neither the shipped set nor `package.json`'s `files` array.

| id | severity | reaches | blocking |
|---|---|---|---|
| DV-1 | MEDIUM | `delivery/work-history/m4-p2.md` only | NO |
| DV-2 | MEDIUM | `witness/*.json`, a future editor of two specs | NO |
| DV-3 | LOW | the work history's derivation (a) | NO |
| DV-4 | LOW | a comment and two lines in `test/spawn.test.ts` | NO |
| DV-5 | MEDIUM | one spec and one assertion block's non-vacuity | NO |

DV-1 and DV-5 are the two worth acting on before the next round, and both are
cheap: re-run the claim grep after the final commit and paste THAT, and change
the rejection witness's third member to the unlink loop alone, which is what the
reviewer asked for and which leaves the message assertions green so the residue
loop is the thing that reddens.

**What I tried hardest to break and could not.** The green `red-witness` gate is
real: I defanged the shipped hook generator and watched three tests redden; I
applied every witness member by hand and watched each one redden its named test;
I deleted a test's assertions to see whether its witness still guarded them
(DV-5 is the one case where it did not). The suite total, 855 with zero skipped,
agrees with the work history and with both prior reviewers to the test. The
claim greps agree with the document to the occurrence, in both forms, with no
wrap miss. The scope gate is green when the declaration is staged at the merge
base, including over the three review files and over this document. No count is
pinned over any append-only registry. C-1, C-2 and C-3 hold over every added
line.

The work history remains, as the opus5 reviewer said of the previous round, an
unusually honest document: it publishes the enumerator that was WRONG before the
one that was right, it discards three suite runs and says why, it names the
commit its suite actually measured rather than rounding up to the head, and it
declares its transliteration with codepoints and counts. DV-1 is the one place
where that standard slipped, and it slipped in the section about slipping.

---

## Round 2 delta verification (reviews at 2157389, head bef47e4)

Everything below this line is a SECOND delta verification, of a SECOND fix
round. The sections above verified the delta b12dc98..3b6739d and are left
untouched. This one verifies `git diff 2157389..bef47e4`, which is the round
that answers the macOS-only rollback failure on pull request #155.

Working copy: a clone of the repository, detached at bef47e4.
Interpreter node v26.6.0 at `/tmp/claude-0/n26/bin/node` (the declared floor).
`npm ci` exit 0 with no EBADENGINE line, `npm run build` exit 0,
`git status --porcelain` empty afterwards.

**This delta DOES touch shipped source**, which the previous one did not, so
DR-0027 reachability is live rather than moot:

```
$ git diff --stat 2157389..bef47e4
 delivery/plan/phase-declarations/m4-p2.json        |  21 +-
 delivery/work-history/m4-p2.md                     | 976 ++++++++++++++++++++-
 scripts/check-agents-references.mjs                |  23 +-
 scripts/check-authored-bytes.mjs                   |  24 +-
 scripts/check-clause-map.mjs                       |  23 +-
 scripts/check-dual-review.mjs                      |  23 +-
 scripts/license-gate.mjs                           |  21 +-
 src/gates/citations.ts                             |   8 +-
 src/gates/coverage.ts                              |  13 +-
 src/gates/red-witness.ts                           |  13 +-
 src/gates/suite.ts                                 |  17 +-
 src/path-identity.ts                               |  39 +
 src/pool.ts                                        |  15 +-
 test/behaviors.json                                |   4 +-
 test/coverage-gate.test.ts                         |  51 ++
 test/spawn.test.ts                                 | 144 +++
 witness/... (5 new artifacts)
 21 files changed, 1532 insertions(+), 24 deletions(-)
```

### R2-1. FIRST CHECK: the derivation, run here, then widened

The work history states what its derivation did not cover BEFORE any row, at
section 1 of the fix-round part, and it is a real not-covered statement rather
than a gesture: no Mac was available, so the platform difference was
reconstructed and not observed; macOS case-insensitivity is named as a possible
second cause that was not forced; four of the five files the macOS job runs were
not investigated; and the derivation is declared to cover COMPARISONS and not
USES. Two of those seven items are the ones I attacked.

**Derivation 3a, re-run here at bef47e4 verbatim from the document.** It returns
77 lines at this head against the 61 the document reports at the pre-fix head,
which the fix itself accounts for. I read all 77 and checked the document's
disposition of the ones it did not table.

- `.claude/orchestrator-next.mjs:105` parses the SAME `git worktree list
  --porcelain` output the fixed defect parses. It is NOT a member, and the
  document's stated rule is what settles it: the path is USED (walked for
  mtimes). I read the whole function and its one caller and found no
  comparison of that value against a kernel-composed path. The command that
  enumerates every mention of the map, and its full output, so a reader can
  check the scope rather than trust the sentence:

  ```
  $ grep -nE "worktreesByBranch|WORKTREES" .claude/orchestrator-next.mjs
  87:/* WORKTREES ARE FOUND, NOT PREDICTED.
  99:function worktreesByBranch() {
  229:const WORKTREES = worktreesByBranch();
  268:  const wt = localBranch === undefined ? undefined : WORKTREES.get(localBranch);
  ```

  Line 268 is the only read of the map, and .claude/orchestrator-next.mjs:270
  hands its value straight to existsSync and the mtime walk. The document's
  stated rule, comparisons and not uses, earns its keep here.
- `test/pin.test.ts:105` compares `f.path` against a composed `join(root,...)`.
  Both sides are the CALLER's spelling by construction: src/gates/pin.ts:74
  documents `path` as "`join(root, ...)` for the root exactly as the caller
  supplied it". Not a member.
- `test/license-gate.test.ts:1165` compares `resolvedPackagePath` (produced by a
  CHILD node process) against a test-composed prefix, which is the member shape
  exactly. It is NOT a member, and only because of an implementation detail I
  had to read to find: `probe_installed` at scripts/release-verify.sh:218 builds
  the path with `join(process.argv[1], ...)` from `$PREFIX`, the caller's
  spelling, instead of resolving the module. Had it used `require.resolve`, this
  would be a live member. Worth recording as a thing that is right by accident.

So the dispositions hold. The document's SUMMARISING sentence does not: "every
other hit is a comparison of repository-RELATIVE paths ... or is an
`=== undefined` guard" is a universal, and the three hits above are neither.
That is a scope over-claim rather than a defect, and it is the shape item 3 of
the fix-round contract exists to catch. Recorded as DV2-3.

**THE WIDENING THAT PAID: the derivation's regex requires `===`, `!==` or
`.startsWith(`, so a path comparison written as SET MEMBERSHIP is invisible to
it.** Widened command, shipped code only:

```
$ git ls-files 'src/*' 'bin/*' 'scripts/*' | grep -E '\.(ts|mjs|js)$' \
  | xargs grep -nE 'new Set\(|\.has\(|\.includes\(|Map\(' \
  | grep -iE 'path|file|dir|root|worktree|entry|target|clone'
```

Thirty-one hits. All but one key on repository-RELATIVE paths out of
`git diff --name-only` (the scope gate, the red-witness gate) or on the caller's
own spelling on both sides (src/gates/pin.ts:213). The exception is
`src/gates/suite.ts:1028`, and it is a live member of the round's own class,
reproduced below as DV2-1.

A second widening, `.startsWith(<identifier>)` in shipped code (the document's
pattern only catches `.startsWith(resolve(`, `.startsWith(join(`,
`.startsWith(realpathSync(` or a receiver whose name matches
`Path|Dir|Root|Worktree`), returned eight hits, all over repository-relative
paths or ref names. No finding in that direction.

### R2-2. DV2-1 (MEDIUM): a member of the round's own class, in the SAME FILE as one of the two sites it fixed, reproduced here

**Mechanism, in the round's own words**: the kernel decides whether two paths
name the same filesystem object by comparing the two strings, when one of the
two strings was produced by another program that does not preserve the caller's
spelling.

**The site**: the suite gate's discovery-parity check. `discoveredFiles` is
composed by the gate's own walk; `reportedFiles` is `point.file` out of NODE'S
reporter, which is canonical whatever spelling node was invoked with. They are
compared by `Set.has`, which is string identity:

```
  const discoveredSet = new Set(discoveredFiles);
  const reportedSet = new Set(reportedFiles);
  for (const file of discoveredFiles) {
    if (!reportedSet.has(file)) { ... }
  }
  for (const file of reportedFiles) {
    if (!discoveredSet.has(file)) { ... }
  }
```

That is byte-identical at 2157389 and at bef47e4, so it is a MISSED member, not
a break. `src/gates/suite.ts` is the same file whose `isFileWrapperPhantom` the
round DID fix, 600 lines up, for the same reason (node reports the canonical
path). The published derivation could not see it because its regex requires
`===`, `!==` or `.startsWith(`.

**REPRODUCED, one variable changed.** A fixture repository under a directory
with a symlinked ancestor, one test file, one behavior, suffix `.test.js`, the
gate run twice with only the spelling of `--test-root` different:

```
=== ARM A: relative --test-root (resolves against a canonical process.cwd()) ===
suite: green (1 tests reported)
suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 1 test(s)
from 1 file(s) (pass 1, fail 0, skipped 0, todo 0, did-not-run 0); discovered 1
file(s) walking test for .test.js; 1 behavior(s) resolve; merge base 75d2ab5f49b1

=== ARM B: absolute --test-root through a symlinked ancestor ===
suite: red (1 tests reported)
2 finding(s): test file discovered by the walk but absent from the reporter:
../../link/repo/test/a.test.js; test file reported but outside the declared
roots and suffix: test/a.test.js
```

One file, discovered once and reported once, and the gate says it is two
different files that each fail the other's parity check.

**And the round's own primitive closes it.** With
`reportedSet.has(file)` / `discoveredSet.has(file)` replaced by
`reportedFiles.some((other) => pathsNameSameObject(other, file))` and its mirror,
arm B is GREEN and arm A stays green:

```
=== ARM B with identity comparison at the discovery-parity site ===
suite: green (1 tests reported)
... discovered 1 file(s) walking <lab>/link/repo/test for .test.js; 1 behavior(s)
resolve; merge base 75d2ab5f49b1
=== ARM A (control, unchanged) ===
suite: green (1 tests reported)
```

**REACHABILITY (DR-0027).** Shipped file `src/gates/suite.ts`, reached by the
user-visible command `node src/gates/suite.ts --test-root <path>` (the flag is
in the gate's own usage string at `src/gates/suite.ts:555`, quoted because this
branch changes that file) and therefore by
`tiphys gates run` for any consumer whose registry declares an absolute test
root. It is NOT reachable through this repository's own registry, which declares
no `--test-root` at all (gate-registry.yaml:99 passes only `--pin-root src`,
`--pin-root bin`, `--pin-root test`) and so takes the relative default, which
`resolve(cwd, root)` makes canonical. The direction of failure is a FALSE RED,
not a false green: it blocks a correct build rather than passing a defective
one, which is the milder half of this class.

**Why it is raised as blocking anyway.** The fix-round contract's first item is
"name the MECHANISM, not the finding", and its third is "state what the
derivation did NOT cover". This round did both well and still left a demonstrated
member of its own declared class, in a shipped gate, in the same file as one of
its two fixes, with no mention in the not-covered statement of the shape that
hides it (a path comparison written as set membership). The remedy is two lines
and one sentence, and the alternative is the next round paying for it, which is
the measured pattern this contract exists to break.

### R2-3. DV2-2 (LOW, TRACKED): the round registers a new behavior and leaves it out of the roster that guards behavior names, so the roster guard cannot go red for it

`test/behaviors.json` gains `spawn-launch-failed-rolls-back-through-a-symlink`
and its test lives in `test/spawn.test.ts`. The guard in that file,
"every spawn behavior resolves by name to a test in this file", iterates
`M4_P2_BEHAVIORS`, a hand-written roster that the round did NOT extend:

```
const M4_P2_BEHAVIORS = [
  "spawn-async-launch-awaited",
  "spawn-completed-without-turn-end-is-incomplete",
  "spawn-unparseable-turn-end-is-incomplete",
  "spawn-rejected-launch-rolls-nothing-back",
  "spawn-returns-after-payload-sentinel",
];
```

Measured rather than reasoned. I renamed the new test's title in
`test/spawn.test.ts` and ran the roster guard alone:

```
RENAMED the new test title
--- the roster guard, with the new behaviour orphaned ---
i pass 1
i fail 0
```

Green. The guard the round relies on for "a rename breaks this loudly" does not
cover the row the round added. The `suite` gate's global resolver still would
(it checks every registry description against every reported test name), so the
behavior is not unguarded, only unguarded HERE. The roster is correctly BY NAME
and pins no count, so binding convention 5 is satisfied.

REACHABILITY: `test/spawn.test.ts` only. TRACKED, NOT BLOCKING.

### R2-4. The reported defect, reproduced closed, and the eight latent guards, reproduced closed

**The macOS rollback defect, at the mechanism.** I applied each declared
dangerous state of the new witness myself, in this clone, and ran the named test
alone. Control first:

```
$ node --test --test-name-pattern "rolls the worktree back through a symlinked" test/spawn.test.ts
ok a launch-failed rolls the worktree back through a symlinked fleet root and
   through a symlinked worktrees directory (1158.555498ms)
i tests 1
i pass 1
i fail 0
i skipped 0
```

Member 0, the string comparison restored at the call site:

```
  AssertionError [ERR_ASSERTION]: executor launch failed: the program is not on
  PATH; rollback of the worktree did not complete: cannot delete branch
  task/t-linkedroot: it is checked out at
  /tmp/tiphys-p4-spawn-s9412k/fleet/worktrees/t-linkedroot; remove that worktree first
      at TestContext.<anonymous> (.../test/spawn.test.ts:1399:12)
```

Member 1, the plausible alternative fix (canonicalize the caller's argument
inside `loadFleet`, keep the string comparison):

```
  AssertionError [ERR_ASSERTION]: executor launch failed: the program is not on
  PATH; rollback of the worktree did not complete: cannot delete branch
  task/t-linkedworktrees: it is checked out at
  /tmp/tiphys-p4-spawn-qdXW34/worktrees-somewhere-else/t-linkedworktrees; remove
  that worktree first
      at TestContext.<anonymous> (.../test/spawn.test.ts:1438:12)
```

**The two members are genuinely different and I checked it the way the previous
round's verification said to check it: by the ASSERTION LINE, not by the prose.**
Member 0 dies at 1399, which is arm A. Member 1 gets past arm A entirely and dies
at 1438, which is arm B. So member 1 SURVIVES the repair that closes member 0,
which is what makes this a class and not a line. This is the standard the earlier
DV-2 finding asked for, and this witness meets it.

**The eight latent main-module guards, all five script ones driven by me.**
This is the half with no automated test at all, so I drove it by hand. One
symlink to the repository root, the same invocation twice, guard at head and
guard reverted to its pre-round string form:

```
=== AT HEAD, through a symlinked directory ===
check-agents-references    exit=0 first-line=check-agents-references: green (21 references resolved)
check-authored-bytes       exit=0 first-line=check-authored-bytes: tracked working tree differs from the index; ...
check-clause-map           exit=0 first-line=clause-map: green (74 clause-map rows checked)
check-dual-review          exit=0 first-line=tiphys check-dual-review: a directory argument is required
license-gate               exit=0 first-line=license: green (10 production packages licensed)

=== GUARD REVERTED to the pre-round string form, same invocation ===
check-agents-references    <NO OUTPUT, EXIT 0: THE GUARD DID NOT RECOGNISE ITS OWN FILE>
check-clause-map           <NO OUTPUT, EXIT 0>
check-dual-review          <NO OUTPUT, EXIT 0>
license-gate               <NO OUTPUT, EXIT 0>
check-authored-bytes       <NO OUTPUT, EXIT 0>
```

Five for five, silent and green before, running after. The round's claim about
these is true and I did not take it on the document's word.

**And the CI half of the round's claim checks out.** The document says CI invokes
all of these relatively from the repository root, so no CI run has been silently
skipping a gate through this. Verified against the workflows: .github/workflows/gates.yml:169,
.github/workflows/gates.yml:192, .github/workflows/gates.yml:224 and
.github/workflows/macos-smoke.yml:23 all spell `node scripts/<name>.mjs`, and a
relative `argv[1]` resolves against a canonical `process.cwd()`.

### R2-5. DV2-3 (LOW, TRACKED): eight guards changed, one test written, and the gate that would have asked for the other seven cannot see five of them

The round added exactly one automated witness for the main-module class, on
`src/gates/coverage.ts`, and it added it because the `red-witness` gate demanded
it, which the work history records honestly as a finding against its own round.
The other seven changed guards have no test for the property that changed:

| guard | symlink direct-entry test at this head |
|---|---|
| `src/gates/scope.ts` | yes, test/scope-gate.test.ts:173 (pre-existing) |
| `src/gates/credentials.ts` | yes, `test/credentials-gate.test.ts:583` (pre-existing, quoted: changed here) |
| `src/gates/suite.ts` | yes, test/suite-gate.test.ts:761 (pre-existing) |
| `src/gates/coverage.ts` | yes, added by this round |
| `src/gates/citations.ts` | **no** |
| `src/gates/red-witness.ts` | **no** |
| the five `scripts/*.mjs` | **no** |

The gate cannot close the last row by construction: its own audited-source
predicate is `path.startsWith("src/") || path.startsWith("bin/")`, so a change
to a `scripts/*.mjs` gate entry point never asks for a witness. That predicate
is in a file this branch changes, so it is quoted: `src/gates/red-witness.ts:149`.

REACHABILITY (DR-0027): the five scripts are not in `package.json`'s `files`
array and are not under `src/`, `bin/`, `schemas/`, `roles/` or `tuition/`, so
they are not a shipped artifact; they are CI entry points. The gap reaches a
FUTURE editor of these guards, which is the definition of tracked rather than
blocking. Raised because the class it belongs to is "a guard that cannot go
red", the class this round exists to close, and because it is enumerable: two
files under `src/` and five under `scripts/`.

### R2-6. DV2-4 (LOW, TRACKED): the coverage witness's two members produce the SAME failure, character for character

The previous round's verification raised DV-2 against two specs whose members
were one dangerous state reached by two edits. The new spawn witness answers
that standard properly (R2-4 above). The new coverage witness does not, and I
measured it rather than reading the provenance:

```
MEMBER 0 (bare ===):
  AssertionError [ERR_ASSERTION]: invoked through a symlinked directory the gate
  produced exit 0 and output ""; exit 0 with no output is the guard refusing to
  recognise its own file
  0 !== 64
      at TestContext.<anonymous> (.../test/coverage-gate.test.ts:915:12)

MEMBER 1 (resolve, then still compare strings):
  AssertionError [ERR_ASSERTION]: invoked through a symlinked directory the gate
  produced exit 0 and output ""; exit 0 with no output is the guard refusing to
  recognise its own file
  0 !== 64
      at TestContext.<anonymous> (.../test/coverage-gate.test.ts:915:12)
```

Identical text, identical assertion line, identical state (the gate exits 0
having done nothing). They ARE different by the other test that matters here:
member 1 survives the obvious repair of member 0, which is adding `resolve`. So
the pair is defensible, and the objection is narrower than DV-2's was: the
witness ASSERTS the difference in its spec and the round did not demonstrate it,
having demonstrated exactly that for its sibling witness forty lines away. Two
standards in one round.

REACHABILITY: `witness/*.json`, which is not in `package.json`'s `files` array.
TRACKED, NOT BLOCKING.

### R2-7. DV2-5 (LOW, TRACKED): two claims in the not-covered statement that the claim grep's vocabulary cannot see, one of which I believe is wrong

The not-covered statement's item 2 says, of macOS case-insensitivity:

> The fix I made covers that case too, because `realpathSync` returns the
> on-disk spelling for either input, but I have not WITNESSED it covering it.

The second half is the correct form and the round deserves credit for it. The
first half is a claim about the system, asserted as fact, and it is the one I
would bet against. `fs.realpathSync` in node is the JS walk, not the platform
`realpath(3)`: it resolves SYMLINK components and copies every non-symlink
component through from the input. A wrongly-cased directory name on a
case-insensitive filesystem is not a symlink, so it would pass through unchanged
and the two spellings would stay two strings. `fs.realpathSync.native` is the
variant that calls the platform function, and the code calls neither `.native`
nor anything else that would correct case.

**I could not force it here and I say so rather than asserting the negative.** I
tried to build a case-insensitive filesystem to settle it: `mkfs.vfat` is absent,
and `mkfs.ext4 -O casefold` produced an image that this container refused to
mount (no loop mount available). So this is an OPEN QUESTION, not a finding of
fact, and the way to settle it is one line on a Mac or on any casefold directory:
compare `realpathSync` against `realpathSync.native` for two spellings that
differ only in case.

**A second-order observation worth more than the claim itself.** The binding
claim grep's alternation contains `is covered` and not `covers`, so the sentence
above is INVISIBLE to both forms of the grep. The round ran both forms correctly
and got 44 matching lines and 44 occurrences, and this claim is in neither
count. The passive-only vocabulary is a real gap in the guard, in the same
family as the hard-wrap gap CLAUDE.md already records.

REACHABILITY: `delivery/work-history/m4-p2.md` for the claim; if the underlying
behaviour is as I describe, it would reach `src/pool.ts` on a case-insensitive
filesystem, which is a thing to MEASURE on the runner rather than to assert in
either direction. TRACKED, NOT BLOCKING.

### R2-8. The original findings this round was answering, one by one

| finding | mechanism | fixed at the mechanism? | closed at bef47e4? |
|---|---|---|---|
| macOS smoke failure on #155 | path identity decided by string comparison where the other side came from another program | YES, and wider than the report: two comparison sites plus eight main-module guards | YES at the code level, reproduced open and closed by me; NO at the runner level, see R2-9 |
| DV-1, twelve stale claim-grep line numbers | a line number typed rather than derived against the final text | YES, re-derived and the general rule stated | YES, verified: all twelve corrected numbers land on real hits at this head |
| the "sixteen paths" sentence | a count quoted as a property of the phase when it is a property of a head | YES, corrected in place and measured at three heads | YES, verified: 37 changed paths at this head, which the bundle also reports |
| DV-2, two specs with byte-identical dangerous states | one dangerous state reached by two edits, presented as a class | not attempted | still open, unchanged, ruled TRACKED by the previous round and still TRACKED |
| DV-4, an inert capture-only anchor | an assertion that cannot reach the thing its comment names | not attempted | still open, unchanged, TRACKED |
| DV-5, rejection witness member 2 | closed at the instance, reddening on the message before the residue loop | not attempted | still open, unchanged, TRACKED |

Leaving the last three is legitimate: every one was ruled TRACKED and not
blocking by the previous verification, and DR-0027 says the same at this head,
since `witness/` and `test/` are neither shipped nor in `package.json`'s `files`
array. What the round does NOT do is say so. The fix round's own section 7 says
"Two, both mechanical" and names DV-1 and the sixteen-paths sentence; the other
three findings from the same document are not mentioned, accepted or refused
anywhere in it. That is a paperwork gap, not a defect, and it is why a reviewer
has to re-open the previous document to find out that nothing was dropped.

**I reproduced the primary finding open and closed rather than taking the
document's word.** Open at the pre-fix state: applying the witness's member 0 to
`src/pool.ts` at this head restores the exact refusal text the macOS runner
printed, and the named test dies at arm A. Closed at this head: the control run
above is green, and the whole suite is green. See R2-4.

### R2-9. The suite, and the four things a complete sentence names

Run by me, in this clone, at bef47e4, with the working tree clean:

- **Interpreter**: node v26.6.0 at /tmp/claude-0/n26/bin/node, npm 11.18.0, the
  declared floor. `npm ci` exit 0 with no EBADENGINE line.
- **Build state**: `npm run build` exit 0 immediately before, `dist/` present,
  `git status --porcelain` empty afterwards.
- **Invocation**: `npm test`, which is `node --test "test/**/*.test.ts"` and is
  what the `suite` gate runs. Not the bare `node --test`, which per standing
  warning 12 would add the tracked sandbox fixture.
- **Result**: 857 tests, 857 pass, 0 fail, 0 cancelled, **0 SKIPPED**, 0 todo,
  exit 0, duration 207881ms.

```
LOADAVG BEFORE: 0.15 1.38 2.63 1/148 11917
i tests 857
i suites 0
i pass 857
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 207881.486359
NPM TEST EXIT: 0
LOADAVG AFTER: 3.33 2.71 2.95 1/203 17218
```

Zero skipped, which matters because a bare exit 0 does not distinguish a skipped
test from a passing one. This agrees with the work history's 857/857/0 exactly.

**The bundle instability the work history records did NOT reproduce here**, and
that is one observation, not a refutation. My run was on a quiet box (load 0.15
at the start) and the work history's reds were seen inside the full bundle,
where `test/coverage-gate.test.ts` starts a second nested bundle. I did not run
the full bundle four times to settle it, and the work history is right that it
is already recorded on `main` as predating this branch. It stays an open
repository-level question, unchanged by this round in either direction.

**The one gate whose verdict this round turns on, run by me:**

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --phase m4-p2 --evidence <scratch> --base origin/main --head HEAD
LOADAVG: 2.51 2.57 2.89 1/204 17244
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 22 witness(es) evaluated (8 own, 14 stored re-evaluated
  in 177181ms); every witness red against every declared dangerous state and green at head
GATE_EXIT=0
```

**And the green is not vacuous, checked rather than assumed.** From my own run's
`witness-records.json`: 22 evaluations, `uncoveredSources: []`, and **45 executed
members**, none of the specs carrying zero. The two new specs carry two members
each and both were executed, which is what R2-4 shows from the other side.

### R2-10. THE MERGE PRECONDITION THAT IS NOT MET: there is no CI run on this head at all

The work history's section 14 raises this as an open item and it is still open,
so I measured it fresh rather than repeating the document. Read from the GitHub
REST API through this container's proxy on 2026-09-16:

```
$ GET /repos/.../actions/runs?branch=claude/m4-p2-async-launch
total_count 2
  35098416926  macOS smoke  2157389  pull_request  completed  failure  12:52:52Z
  35098417462  gates        2157389  pull_request  completed  success  12:52:52Z

$ GET /repos/.../pulls?head=...:claude/m4-p2-async-launch
PR#155 open draft=false head=bef47e4 updated 16:03:43Z

$ git ls-remote origin refs/heads/claude/m4-p2-async-launch
bef47e44d862e009597aa35eb32c32df3a56cc36
```

So the remote branch IS at bef47e4, the pull request IS open at bef47e4, and
BOTH workflows have run only at 2157389, where macOS smoke FAILED. The three
heads this fix round pushed produced no run of either workflow.

It is not Actions being down. In the same window the macOS smoke workflow
produced runs for five other refs:

```
$ GET /actions/workflows/macos-smoke.yml/runs        (newest, all branches)
35117648416  main                                 b4dd6ff  push          success  15:47:02Z
35115484408  claude/orchestrator-harness-and-...  c1225a5  pull_request  success  15:27:40Z
35114541418  main                                 e7342f0  push          success  15:19:23Z
35112043662  claude/m4-p19-pool-record-...        0202069  pull_request  success  14:57:23Z
35108339335  main                                 22701e5  push          success  14:24:44Z
```

Consequences, stated as facts rather than as a diagnosis, because the cause is
not established:

1. **The one runner that can confirm this round's central claim has not run on
   it.** The Linux reproduction is real and I re-ran it, but the round itself
   says the macOS job is what closes item 1 of its not-covered statement, and
   that evidence does not exist.
2. **The only macOS evidence this branch has is a FAILURE**, at the pre-fix head.
   A reader glancing at the checks sees red.
3. **DR-0012 condition "CI green on that exact head" is not satisfiable today.**
   Under T-009 a gate result is evidence only for the configuration it ran under,
   and there is no run under this configuration at all.

This is not something a fix round repairs by editing code. It needs the workflow
re-triggered on bef47e4 and observed to completion, and it is an orchestrator
action rather than an implementer one.

### R2-11. What I tried to break and could not

- **Binding convention 5, counts over append-only registries.** The round adds
  two rows to `test/behaviors.json` and pins no count anywhere. The roster guard
  derives its `owned` set at run time from the registry against the file's own
  source and asserts BY NAME. I looked for a count in every added test and in the
  declaration and found none. (Its one gap is DV2-2, which is an omission from a
  roster, not a pinned count.)
- **C-1, C-2, C-3 over the whole delta.** No added line reads current state from
  a log tail, and greps over the added lines for `process.pid`, `/proc/`,
  `kill(`, `SIGKILL`, `SIGTERM`, `signal`, `detached` and `unref` return nothing.
  Identity in the new code is filesystem identity via `realpathSync`, which is
  the opposite of the thing C-2 forbids. The new tests use `spawnSync`.
- **The widening of `pathsNameSameObject`, in the dangerous direction.** It says
  "same" strictly more often than the comparison it replaces, and in `src/pool.ts`
  saying "same" means NOT recording a foreign worktree and NOT refusing the
  destroy. So a false "same" would delete a branch another worktree holds. I
  looked for a pair it calls the same that the filesystem calls different and
  there is none: equal canonical paths are one object, and where either side does
  not exist `realpathSync` raises and the function answers false, which is the
  refusing direction. Two hard links to one file have different canonical paths
  and answer false, which is conservative in the same direction.
- **Scope.** Every path in the delta is on `filesToTouch` or `declaredExtras` of
  the phase declaration, except `delivery/work-history/m4-p2.md`, which CLAUDE.md
  names as a standing pre-authorized extra.
- **The claim grep, both forms, reproduced to the occurrence.** Raw 44 matching
  lines and 98 occurrences; with the document's own filter removing its pasted
  patterns, 39 matching lines, 44 wrap-insensitive occurrences and 44
  occurrences-on-matching-lines, per phrase `anyway` 6, `cannot be` 2, `catches`
  6, `is covered` 7, `never` 23, and the twelve in-section hit lines exactly as
  published: 1864, 1879, 1884, 2018, 2299, 2300, 2338, 2533, 2540, 2551, 2572,
  2637. Equal occurrence counts with and without line structure means no hit
  straddles a wrap, which is what the document claims and what the number proves.
  I read all twelve hits; each has adjacent captured evidence or is a quotation.
  The one claim the grep cannot see is DV2-5.

### R2-12. Verdict

**FIX-ROUND-NEEDED**, on ONE blocking finding, and it is a small one.

The round is otherwise strong and I say that having tried hard to break it. It
named a mechanism rather than the failing assertion, it published a derivation
that found nine sites where one was reported, it reproduced a macOS-only failure
on Linux by constructing the platform's condition by hand, its new witness meets
the "one witness is not a class" standard by a demonstrated difference in which
repair each member survives, its suite sentence names all four axes, its claim
grep reproduces to the occurrence, it declares its transliteration with
codepoints and counts, and it records a gate finding against its own round rather
than smoothing it away. The two corrections owed from the previous verification
are both landed and both verified here.

| id | severity | reaches | blocking |
|---|---|---|---|
| DV2-1 | MEDIUM | `src/gates/suite.ts`, via the shipped `--test-root` flag | **YES** |
| DV2-2 | LOW | `test/spawn.test.ts` roster guard | no |
| DV2-3 | LOW | a future editor of seven guards | no |
| DV2-4 | LOW | `witness/*.json` | no |
| DV2-5 | LOW | the work history, and possibly `src/pool.ts` on a case-insensitive filesystem, unmeasured | no |

DV2-1 blocks because DR-0027's test is reachability and it reaches a shipped
file through a user-visible flag, and because it is a demonstrated member of the
class this very round declared it was closing at the mechanism, in the same file
as one of its two fixes. The remedy is two lines and one sentence in the
not-covered statement.

**Separately from the findings, and not repairable by a fix round: there is no
CI run on this head** (R2-10). The macOS runner, which the round itself names as
the only thing that can confirm its central claim, has not run on any head this
round pushed, and the only macOS result this branch carries is the pre-fix
failure. That must be resolved before merge whatever happens to DV2-1.

### R2-13. What was altered in the captured output of this document, declared

Node's test reporter prints U+2139 at the head of each summary line and U+2714
at the head of each passing test line. Both fail the authored-bytes check, and
hand-writing the output to avoid them is the fabrication the red-witness rule
exists to prevent. So they are transliterated and declared:

- U+2139 rendered as `i`: 14 occurrences.
- U+2714 rendered as `ok`: 1 occurrence.
- U+2716 rendered as `x`: 0 occurrences.

Absolute scratch and container path prefixes are elided to `...` or `<scratch>`
inside captured blocks, and long gate rows are truncated with a trailing
ellipsis; the verdict word, the units and every count are verbatim. Nothing else
in any captured block in this document was changed.

### R2-14. The claim grep over THIS document's own round-2 section

Both forms, over the text from the round-2 heading to the end:

```
MY SECTION: matching-lines 6 ; occurrences-on-matching-lines 9 ; wrap-insensitive 9
110: pattern only catches `.startsWith(resolve(`, `.startsWith(join(`,
191: **Why it is raised as blocking anyway.** The fix-round contract's first item
330: to a `scripts/*.mjs` gate entry point never asks for a witness.
401: claim grep's alternation contains `is covered` and not `covers`,
574: occurrences-on-matching-lines, per phrase `anyway` 6, `cannot be` 2, `catches`
575: 6, `is covered` 7, `never` 23, and the twelve in-section hit lines
```

Occurrences counted with line structure intact equal occurrences counted with it
removed, so no hit in my own text straddles a wrap. Dispositions: 110 describes
the round's derivation regex, which is quoted in full above it; 191 states a
motivation rather than a property of the system; 330 carries the audited-source
predicate quoted directly beneath it; 401 is a quotation of the grep's own
vocabulary; 574 and 575 are this document's tally lines, which hold the
vocabulary by construction.

One earlier sentence of mine failed this check and was rewritten rather than
kept: it said the orchestrator script's worktree path is "never compared against
a kernel-composed path", which is an assertion about every line of a file. It is
now the command that enumerates every mention of that map, with its full output,
and a sentence about what I read.

### R2-15. A note on sequencing, so the blocking finding costs nothing extra

R2-10 establishes that this branch must be pushed again anyway: there is no CI
run on bef47e4 at all, and the macOS runner is what closes the round's own
open item 1. DV2-1's remedy is two lines in `src/gates/suite.ts` plus one
sentence in the not-covered statement. Landing it on the same push costs no
additional CI cycle, which is the consideration DR-0031 exists to protect.
