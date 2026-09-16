# The scope gate clears for every M4 phase once PR #150 lands, and that was
# CHECKED rather than assumed

Measured 2026-09-16, before PR #150 merged, without mutating any worktree.

## What was in doubt

Every one of the twelve M4 phase branches was RED on the `scope` gate for the
same reason: `delivery/plan/phase-declarations/<phase>.json` sits on the branch
and not in the MERGE BASE, and the gate reads it from there. PR #150 lands the
twelve declarations on `main`.

Two things had to be true for that to be sufficient, and neither was obvious:

1. that merging the new `main` forward moves each branch's merge base past the
   commit carrying its declaration, and
2. that what then remains in each branch's diff is COVERED, either by the
   declaration's own list or by a standing extra.

The second is the one that could have bitten. Every phase branch was cut from
`plan/pstack-borrow-review` and inherits 26 to 28 paperwork paths from it. The
M4-P1 reviewer measured exactly this and filed it as a HIGH: with the
declaration placed on a simulated trunk, the gate reddened on TWENTY-SEVEN
undeclared paths.

## Method

`git merge-tree --write-tree` and `git commit-tree`, so nothing was checked out
and no real branch gained a merge commit. An earlier simulation in this delivery
ran its merges inside REAL worktrees and gave three phase branches unwanted
merge commits; that is why this one is done in memory.

A synthetic `main`-after-#150 was built as the merge of `origin/main` and
`origin/plan/pstack-borrow-review`, then merged forward into each branch, and
the remaining difference read off.

## Result

| phase | paths differing from future main | declaration in the new merge base |
|---|---|---|
| m4-p1 | 48 | YES |
| m4-p13 | 7 | YES |
| m4-p16 | 16 | YES |
| m4-p20 | 8 | YES |

The inherited paperwork is GONE from all four, which is the structural
resolution of the M4-P1 HIGH: those 27 paths become part of `main` rather than
part of the branch's diff. Nothing was fixed; the base moved.

Every remaining path is covered, and the coverage was traced to its source
rather than eyeballed:

- the declaration's own `filesToTouch`, where `witness/` and
  `test/fixtures/harness-probe/` are directory prefixes and cover their whole
  trees;
- the two standing pre-authorized extras, `test/behaviors.json` and
  `delivery/work-history/<phase>.md`;
- the phase's OWN evidence, which M3-P11 made a standing extra at
  src/gates/scope.ts:565 and following.

## The one that needed reading rather than trusting

The evidence exemption matches on a LOWERCASED basename
(src/gates/scope.ts:581), so `clean-room-M4-P13-opus5-cleanroom.md` qualifies
despite the uppercase phase id in its name. Had that comparison been
case-sensitive, every clean-room review in M4 would have reddened the gate,
because all of them are named with the uppercase form.

The boundary check at src/gates/scope.ts:591 is what stops `m4-p1` from owning
`m4-p11`'s evidence, and it is why `delivery/verification/m4-prototype-probes.md`
does NOT qualify as M4-P1's own evidence: the character after `m4-p` is `r`, not
`1`. M4-P1 declares that file explicitly, so it is covered anyway, but it is
covered by the declaration and not by the exemption, and those are different
facts.

## What this does NOT establish

It does not establish that any gate other than `scope` is green, and it is not
a CI result: the `pull_request` bundle tests the union with the base as of the
run, and this is a local tree computation. It says nothing about the seven
phases whose delta verifications were still outstanding when it was written, nor
about m4-p2, m4-p10, m4-p11, m4-p19, m4-p23, m4-p26 or m4-p27, which were not
simulated here because their review debt blocks them for an unrelated reason.

## Re-run over all twelve, and a correction to the run above

The four-phase run was extended to all twelve. Two things came out of it, and
the first is an error of mine rather than a defect in anything.

### My own derivation was scoped wrong, and it produced a false red

The first pass read only `filesToTouch` from each declaration. It reported NINE
uncovered paths on M4-P2: `test/credentials-gate.test.ts` and eight files under
`witness/`. Every one of them is in that declaration's `declaredExtras`, which
the gate reads as part of the allowed set at src/gates/scope.ts:987.

So the finding was entirely an artefact of a search that did not cover the field
it needed to cover. That is the mechanism the fix-round contract's item 3 exists
to catch, and it is worth recording that it was hit here by the orchestrator, in
a check written specifically to avoid surprises. It is the second time in this
milestone that a derivation of mine returned a confident result from the wrong
scope.

The corrected pass reads the UNION of both sides, `filesToTouch` plus
`declaredExtras` from the merge-base declaration AND the head's, which is what
the gate itself computes at src/gates/scope.ts:984.

### Corrected result

| phase | paths after merging future main forward | uncovered |
|---|---|---|
| m4-p1 | 48 | 0 |
| m4-p2 | 18 | 0 |
| m4-p13 | 7 | 0 |
| m4-p15 | 5 | 0 |
| m4-p16 | 16 | 0 |
| m4-p20 | 8 | 0 |
| m4-p23 | 9 | 0 |
| m4-p26 | 32 | 0 |
| m4-p27 | 8 | 0 |

ZERO uncovered paths anywhere. Three phases are absent from the table because
they do not reach it, which is the second finding.

### Three phases conflict against the new main, in ONE mechanical shape

M4-P10, M4-P11 and M4-P19 each hit an add/add conflict on exactly one path,
their OWN phase declaration. Nothing else conflicts in any of them.

The cause is benign. `plan/pstack-borrow-review` carries a copy of every
declaration taken before the phase branches extended theirs, so both sides add
the same path with different content. Read as a diff, all three branch versions
are a pure SUPERSET:

- M4-P10 adds four `witness/dual-review-*.json` entries.
- M4-P11 adds `src/witness/run.ts` and `test/witness.test.ts`, and reorders
  `src/checks.ts`.
- M4-P19 adds nine `witness/` entries and three `witness/captures/` entries.

Resolving to the branch side is therefore correct AND safe, and safe for a
reason worth stating rather than assuming: the gate refuses a REMOVAL from the
merge-base declaration and merely NAMES an addition, so the failure mode of this
resolution would be dropping an entry main carries. The resolution is scripted
with that check as a hard refusal, not as a comment.

### What this still does not establish

Nothing here is a CI result and nothing here says any gate other than `scope`
is green. The three conflicts were read from `git merge-tree` against a
SYNTHETIC main built in memory; the real merge base moves when PR #150 actually
lands, and the shape should be re-confirmed then rather than carried forward on
this measurement.

## The end-to-end sequence found a THIRD conflict shape, and it is the common one

Simulating the whole twelve-phase merge sequence, rather than each branch
against the same fixed main, changed the answer. The per-branch check above
merges each branch against a main that never moves. The real sequence moves it
after every merge, and that is what surfaced this:

**After TWO phases have merged, every remaining phase conflicts on
`test/behaviors.json`, and on nothing else.** Nine of the twelve hit it.

That is not a defect and it needs no fix. Binding convention 5 already says so:
the shared registries are append-only and are resolved as a UNION against the
merge base, and they never re-serialise phases. What was missing is that
nobody had ever written the union down as a command. It has been done by hand
every time, and ten hand resolutions of a 775-key object is ten chances to drop
a row silently.

### The resolver, and why it is a guard rather than a convenience

`union-registry.mjs` takes the three index stages git writes for the conflict
and produces the union. Two things make a union UNSOUND, and each is a hard
refusal rather than a warning:

1. a key at the merge base ABSENT from either side, which is a removal and
   which a union cannot represent;
2. a key both sides carry with DIFFERENT values, which is an edit collision
   where a union would pick one arbitrarily.

A key both sides added with the SAME value is not a conflict. That is two
phases registering the same behavior, and it resolves to that value.

### It was demonstrated red against the dangerous state, not merely green

The red-witness rule applies to a guard the orchestrator writes for itself, and
"one witness is not a class" asks for two structurally different members. Four
arms were built in a scratch repository and run:

| arm | construction | result |
|---|---|---|
| both sides append | ours adds one key, theirs adds another | exit 0, union of 4 keys |
| a side REMOVES a base key | theirs drops `b` | **exit 68, refused** |
| same key, DIFFERENT values | both add `same-id`, different text | **exit 69, refused** |
| same key, SAME value | both add `same-id` identically | exit 0, not a conflict |

The two refusals are structurally different members of the class, which is what
the rule asks for. The fourth arm exists because "both sides touched the same
key" is the obvious over-refusal, and it is wrong: it would refuse the ordinary
case of one behavior registered by two phases.

### One check was WRONG and is recorded rather than quietly deleted

`forward.sh` originally carried a pre-flight `git merge-tree` that refused any
branch which did not merge cleanly. That would have refused TEN of the twelve
healthy phases, because their conflict is the expected append-only one. The
question the pre-flight asked was "does it merge cleanly", and the question that
belongs there is "is every conflict one of the shapes we know how to resolve".
A guard asking the wrong question is this repository's most-recorded failure,
and this one was written after reading that rule.

### Serialisation is byte-stable, which is why the diff stays small

`JSON.parse` then `JSON.stringify(.., null, 2)` plus a trailing newline
round-trips `test/behaviors.json` at its current head BYTE-IDENTICALLY. So a
union resolution shows only the rows it added, not a whole-file reformat. That
was measured rather than assumed, because a resolver that silently re-indents
775 rows would make every subsequent review unreadable.
