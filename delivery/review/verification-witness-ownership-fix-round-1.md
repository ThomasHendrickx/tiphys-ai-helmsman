# Delta verification: witness ownership scoping, fix round 1 (deea501..e722f65)

Status: IN PROGRESS. Written incrementally per T-008.

Scope: the fix round only, deea501..e722f65 on claude/witness-ownership-scoping.
Not a re-review of the whole branch.

## Setup log
2026-08-15T14:52:46Z started

## Environment

- Toolchain: node v26.6.0 confirmed via `node --version` in the invoking shell,
  from the scratch prefix on PATH.
- Free space at start: `df -h /tmp` (mounted on `/`) showed 19G available,
  50% used, 5954 entries under `/tmp`. Not the ENOSPC condition the brief
  warned about; re-checked periodically during the run.
- Two detached worktrees created for exact A/B comparison:
  - `.../scratchpad/dv-wos/tree-pre`  at `deea501`
  - `.../scratchpad/dv-wos/tree-post` at `e722f65`
  `node_modules` symlinked into both from the main clone (ajv etc. needed by
  `src/gates/validate.ts`); no package install performed, no lockfile touched.
- Read the round's own work history in full:
  `delivery/work-history/witness-ownership-scoping.md` (at e722f65, 1172
  lines) before designing probes, per the brief's "treat every argument as a
  claim to attack".
- `src/witness/run.ts` is BYTE-IDENTICAL between deea501 and e722f65
  (`git diff deea501..e722f65 -- src/witness/run.ts` produced no output), so
  `mergeBaseSha` computation, the git merge-base fallback, and rules (a),(b),
  (c),(e),(f),(g) themselves are OUT OF SCOPE for this round and were not
  re-audited beyond confirming they are unchanged. Round scope is
  `src/witness/spec.ts` and `src/gates/red-witness.ts`.

## Finding 1 (candidate): extending a spec's `tests[]` falsely reddens every
untouched sibling member — MEDIUM, reachable, reproduced end to end

**Priority-2 question** ("false reds the round introduces that no test
names, particularly around the claim comparison owning every member").

**The mechanism.** `specClaim` is `[behavior, sortedTests]`
(src/witness/spec.ts:340-341). `phaseOwnedMemberIndices` treats ANY
difference in that pair as "claim changed" and owns every member
(src/witness/spec.ts:397-399). The round's own justification for including
`tests` in the claim (11.4 of the work history) is framed entirely as
RE-POINTING: "Re-point a spec at a behavior this phase introduced" / "the
same move spelled through the named tests". Extending the array (adding a
new guarding test while keeping every existing test and touching no
`dangerousStates` member) is not a re-point, but the code cannot tell the
difference: the sorted-tests string differs either way, so it is treated
identically to a full re-point.

**Reproduced end to end, both trees, real git repos, the actual gate
entrypoint (`runRedWitnessGate`), not the pure function in isolation.**
Fixture: a two-member spec (`member 0` mutates `src/adder.ts`, `member 1`
mutates `src/legacy.ts`). The phase's diff touches only `src/adder.ts` and
`test/combo.test.ts` (adding ONE new guarding test, `"combo works extra"`,
which itself exercises both `add` and `twice` so rule (b)/execution is not a
confound). `src/legacy.ts` and member 1's dangerous state are completely
untouched.

```
[tree-pre  deea501] status: green
  detail: 1 witness(es) evaluated (1 own, 0 stored ...); every witness red
  against every declared dangerous state and green at head

[tree-post e722f65] status: red
  detail: 1 witness(es) evaluated (1 own, 0 stored ...); witness own-guard:
  red: rule (d): declared dangerous state does not intersect the phase diff
  (member 1, mutation of src/legacy.ts)
```

Same fixture, same command shape, differing only in which tree's
`src/gates/red-witness.ts` / `src/witness/spec.ts` ran. Probe:
`.../scratchpad/dv-wos/probe-e2e.mjs`, scenario `extend-tests`, run against
both `tree-pre` and `tree-post`.

**No existing test in `test/witness.test.ts` covers this shape.** The
round's own claim test
(`"rewriting a witness spec's claim imposes rule (d) on every member..."`,
test/witness.test.ts:1980) sets `tests: ["combo still works"]`, REPLACING the
single entry, never extending it while preserving the old one. Verified by
reading that test in the post-tree file; grepped for any other construction
that appends to an existing `tests` array under `ownershipFixture` and found
none.

**Reachability (DR-0027).** `src/gates/red-witness.ts` and
`src/witness/spec.ts` are shipped `src/`, and this is the gate every phase's
CI runs. The triggering action is ordinary and encouraged: a phase
strengthens an existing multi-member witness spec's coverage by adding one
more guarding test without touching an unrelated sibling dangerous state.
That phase gets a false CI red requiring it to either manufacture a touch of
unrelated legacy code to satisfy rule (d), or split the spec — the exact
cost the work history states is "intended" for a `behavior` re-point, but
which the code now also applies to plain extension.

**Severity.** MEDIUM. This is an over-strict (safe-direction) defect, not a
hole that lets a bad witness through — it blocks legitimate work rather than
admitting bad coverage. Per DR-0027, reachability is the test and it reaches
a real user path (every future phase touching an existing multi-member
witness spec), so it blocks this round under the stated policy. Whether the
orchestrator judges this "intended pressure" (as 11.4 frames re-pointing) or
an unintended over-broad consequence (as I judge it, given 11.4's own
justification never argues for the extend case) is a call for the
orchestrator/owner; I report it as reachable and reproduced, not resolved.

## Finding 2 (checked, NOT a defect): directory- or symlink-shaped `patch`
paths do not create an exploitable divergence

**Priority-4 question** ("What happens when the patch file is absent at one
revision and present at the other, is unreadable, or is a directory or
symlink?").

`git show <rev>:<path>` does NOT fail (exit 0) when `<path>` resolves to a
tree (directory) or to a symlink blob — it returns the tree listing text or
the symlink's target-path text, respectively. Measured directly:

```
$ git show HEAD:patches/subdir       # a directory
tree HEAD:patches/subdir

file.txt
$ git show HEAD:patches/link.patch   # a symlink
patches/subdir/file.txt
```
(both exit 0)

So `canonicalMember`'s "unreadable body yields `undefined`" contract is
never actually exercised by these two shapes: `readPatchBody` succeeds and
returns tree-listing or symlink-target text as the "body". This looked, on
first reading, like it might let a phase point a `patch` member at a
directory whose file NAMES are stable across revisions while the named
files' CONTENT changes underneath (the tree listing shown by `git show`
carries names only, no hashes) — which would defeat the whole point of
hashing the body.

**Reproduced end to end on both trees and found NOT exploitable, because the
real evaluation path (`src/witness/run.ts:718`,
`git show ${headSha}:${member.patch}`) reads a patch member's body through
the exact same mechanism ownership does.** A directory or symlink patch
member can therefore never function as a real witness: `git apply` rejects
the tree-listing or symlink-target text as an invalid patch, and the gate
reports `status: error`, identically on both trees:

```
[tree-pre  deea501] patch-directory: status: error, "... does not apply:
  ... error: No valid patches in input (allow with --allow-empty)"
[tree-post e722f65] patch-directory: status: error, IDENTICAL reason string

[tree-pre  deea501] patch-symlink:   status: error, same shape
[tree-post e722f65] patch-symlink:   status: error, IDENTICAL reason string
```

Probes: `.../scratchpad/dv-wos/probe-e2e.mjs`, scenarios `patch-directory`
and `patch-symlink`. No delta between trees, so this is a checked NULL
result, not a finding. Caveat: in both fixtures the spec document itself was
unchanged between base and head, so the spec landed in the STORED bucket,
not `own` (0 own, 1 stored in the detail line) — `ownedMembersOf` was not
exercised for these two specific probes. It does not matter for the
conclusion: whatever ownership verdict `canonicalMember` would compute for a
directory/symlink path, the spec still cannot pass evaluation (status
`error`, not `green`), so there is no route to a silently-accepted witness
through this shape regardless of ownership. Not separately isolated with an
`own` spec; judged unnecessary given the above.

## Priority 1: is the relaxation still wider than claimed? (a third escape)

**Attacked, not found**, and here is why I stopped rather than kept
guessing.

The per-member canonical form is schema-complete for every kind by
construction, not merely by argument: `MEMBER_FIELDS_FOR_KIND` at
src/witness/spec.ts:101 is `{ "baseline-ref": ["ref"], patch: ["patch"],
mutation: ["file","find","replace"] }`, and `canonicalMember` encodes
exactly those fields for `mutation` and `baseline-ref`, plus the patch
body's hash for `patch` (the one field that is a pointer). I could not find
a kind-specific field that determines the dangerous state and is left out of
the canonical form, because there isn't one: the schema's own
`additionalProperties: false` plus this fixed table close the set.

Structurally confirmed (not merely read) that `phaseOwnedMemberIndices` and
its two helpers are the ONLY thing gated by ownership:
`grep -rn "phaseOwnedMembers" src/` (post-tree) shows exactly one consumer,
src/witness/run.ts:1291, which is rule (d). `specClaim` reads only
`spec.behavior` and `spec.tests`; `canonicalMember` reads only the kind's
own fields. `class`, `id`, `deterministic`, `repeats`, and
`consumesExternalOutput` are not read anywhere in the ownership computation
at all (not merely deemed irrelevant by argument in 11.1's table — I
re-derived this from the function bodies directly). So a value in any of
those five fields cannot influence which member indices are matched or
owned, which forecloses the shape of escape both prior reviews found (some
field determines what is asserted and ownership does not see it): every
field of every kind is now either inside the canonical form or provably
never touches the ownership computation.

I tried the multiset-matching mechanism itself for a hole (swap two
members' positions, duplicate an existing member while editing a different
one, craft a new member whose canonical form re-creates an old one to "free
up" a match for something else) and in every case the multiset consumes by
CONTENT identity, so a genuine content change to any member always produces
a canonical string with no baseline counterpart and is owned; nothing about
array position or count games this, by construction of a multiset (a
count-map keyed on content, not a positional list).

**I did not find a third escape.** That is a negative result from
structural review plus the two probes in Finding 2, not from an exhaustive
search; see "what I did not cover" below for the boundary of this claim.

## Priority 3: the four deliberate exclusions

- **`baseline-ref` as a pointer, left unresolved.** Verified directly, not
  assumed: rule (d)'s loop checks `phaseOwnedMembers.has(index)` first and
  `member.kind === "baseline-ref"` second (src/witness/run.ts:1291-1297), so
  either check alone is sufficient to skip a baseline-ref member, and the
  "moot" argument (ownership has one consumer and it discards this kind)
  holds regardless of check order. `baseline-ref` never appears in
  `specClaim` or `canonicalMember`'s output for any other kind, so it cannot
  interact with them either. Confirmed correct, not a finding.
- **`class`, `id`, `deterministic`, `repeats`, `consumesExternalOutput`
  excluded from the claim.** Same structural check as priority 1 above:
  none of the five is read by `specClaim`, `canonicalMember`, or
  `phaseOwnedMemberIndices`. I looked for a scenario where excluding one of
  them lets a phase change something load-bearing while appearing unowned,
  and could not construct one, because rule (d) is the only ownership
  consumer and none of the rules that DO read these five fields (a, c, e,
  f, g, and the execution loop) are gated on ownership — they run in full
  on every evaluated spec, owned or not. This matches the work history's
  own table and I did not find a counter-example.

## What attacks FAILED (bound what a later reader must re-check)

1. Tried to defeat the multiset consume via position/duplicate games
   (swap, duplicate-plus-edit, re-add). All failed: matching is by
   canonical-string content, not index, so no arrangement lets an edited
   member borrow an unrelated match.
2. Tried `class`, `id`, `repeats`, `deterministic`,
   `consumesExternalOutput` as a side channel for evading rule (d).
   Structurally impossible: none is read by the ownership computation at
   all, confirmed by reading the three functions' bodies rather than
   trusting the round's own table.
3. Tried directory- and symlink-shaped `patch` paths as a way to make
   `canonicalMember` silently accept unhashed or misleading content.
   Reproduced end to end (Finding 2): both trees error identically because
   `git apply` rejects the resulting text, so this shape can never be a
   working witness regardless of ownership.
4. Tried to find a second consumer of `phaseOwnedMembers` / `specClaim` /
   `canonicalMember` beyond rule (d) that might apply the projection
   inconsistently. `grep -rn` shows exactly one consumer of each; no
   second site exists in `src/`.

## What I did NOT cover

1. **`scripts/` and `.github/`.** Confirmed unchanged by this round
   (`git diff --stat deea501..e722f65 -- scripts/ .github/` is empty), so I
   did not re-audit them; the prior rounds' coverage of that surface stands.
2. **`src/witness/run.ts`.** Confirmed byte-identical between deea501 and
   e722f65. Rules (a), (b), (c), (e), (f), (g), `mergeBaseSha` computation,
   and the `git merge-base` fallback are therefore out of this round's
   scope and were not re-verified; I relied on the two prior clean-room
   reviews and the original round's own section 10 for those.
3. **`consumesExternalOutput.captures` as a pointer.** The work history
   itself flags this (11.3 item 3) as the same pointer shape as CR-001, one
   rule over (rule c, not rule d), unaudited and not fixed in this round. I
   did not audit it either, since it is out of rule (d)'s scope and the
   round does not claim to have touched it.
4. **Rule (g)'s own patch-body comparison** (src/witness/run.ts:1347,
   unchanged file) against the new content-aware `canonicalMember`. Flagged
   as open by the work history itself (11.10 item 2); I did not close it,
   since `run.ts` is unchanged in this round and it is explicitly a
   pre-existing open item rather than something this round claims to have
   fixed.
5. **An exhaustive fuzz of the multiset-matching mechanism.** My attacks in
   the "failed" list above are reasoned constructions, not a generated
   search; I did not write a property-based/randomized test against
   `phaseOwnedMemberIndices`.
6. **A real, landing pull request built end to end to exploit CR-001 or
   CR-002 or my Finding 1**, as opposed to a synthetic fixture. Same
   limitation the work history names for itself (11.10 item 6); my Finding
   1 is a synthetic fixture reproduced on both trees, not a real phase
   branch.
7. **The `push` CI arm, macOS, and the post-merge push run.** Not exercised
   here; same standing limitation named throughout the work history and
   CLAUDE.md T-009.
8. **Whether `git show`'s handling of directories/symlinks in Finding 2 is
   itself intentional or accidental upstream git behavior across versions.**
   I measured the git in this container; did not check other git versions.

## VERDICT

**FIX-ROUND-NEEDED. One blocking MEDIUM (Finding 1): extending a witness
spec's `tests[]` array while leaving `dangerousStates` untouched falsely
reddens every untouched sibling member, reproduced end to end on both trees
via the real gate entrypoint, and is not exercised by any test the round
added.** This is a false red the round introduces (priority-2 question),
reachable through ordinary, encouraged future work (a phase strengthening
an existing spec's coverage), on shipped `src/gates/red-witness.ts` and
`src/witness/spec.ts`. Whether the orchestrator/owner treats the "claim
covers the WHOLE tests array, not just replacement" behavior as intended
pressure or as a defect to narrow is a design call outside my remit; I
report it as reproduced and reachable, not as resolved.

Everything else attacked in priorities 1, 3, and 4 came back clean: no
third escape wider than the two the reviews already found, no exploitable
gap in the four deliberate exclusions, and the directory/symlink edge cases
in the patch-body reader are inert rather than dangerous. The prior round's
two named defects (CR-001, patch-body content; CR-002, the spec's claim)
are genuinely fixed for the shapes both reviews and this round's own tests
name; I did not find a way to reconstruct either original escape.

This round is round 1 of a hard cap of 2 (DR-0027). One more round, and it
should be scoped narrowly: either accept Finding 1 as intended pressure
(with a test added that names it, since none does today) or narrow the
claim's `tests` comparison so that pure extension does not trigger
"own every member" while replacement still does.

Status: COMPLETE.
