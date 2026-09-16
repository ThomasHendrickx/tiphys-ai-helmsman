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
