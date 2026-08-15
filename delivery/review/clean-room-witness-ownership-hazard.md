# Clean-room review, HAZARD contract: witness ownership scoping

- review-contract: hazard
- framing: how could this change make a guard fail to guard, and what state would
  have to exist for that to go unnoticed? Not checking whether the change meets
  its criteria; attacking it.
- produced-by: Claude Opus 5 (Anthropic)
- head under review: deea5017aeb351a3a2b6f92ac9a375f9173b0282 on branch
  claude/witness-ownership-scoping
- base: origin/main at d5d87f7baf4ad31ab77ab074a5f0b588da189217 (confirmed to be
  the merge base by `git merge-base`)
- status: COMPLETE
- citations: every `path:line` token below was verified against the BRANCH tree
  at deea501, which is where the brief says this document lands. Most point into
  `src/witness/run.ts`, `src/witness/spec.ts` and `src/gates/red-witness.ts`,
  which the branch CHANGES, so they resolve there and would resolve against the
  wrong content on `main` (CLAUDE.md:155). The four into CLAUDE.md and the two
  into .github/workflows/gates.yml are byte-identical on both sides
  (`git diff --name-only origin/main...deea501` lists neither).

## Environment, quoted once so every result below inherits it

- toolchain: node v26.6.0 from the scratch prefix named in the brief, confirmed
  in the shell that ran each command
- worktrees: head at `deea501` and base at `d5d87f7`, both created with
  `git -C <repo> worktree add --detach <ABSOLUTE path>` (standing warning 9)
- build state: `npm ci` exit 0, `npm run build` exit 0, `git status --porcelain`
  empty afterwards, in the head worktree
- baseline suites, head worktree, unmutated, node v26.6.0, `dist/` built. Both
  numbers are quoted because the invocation is a third axis (standing warning 12):
  - `node --test test/witness.test.ts`: **44 tests, 44 pass, 0 fail, 0 SKIPPED, exit 0**
  - `npm test`: **826 tests, 826 pass, 0 fail, 0 SKIPPED, exit 0**
- the branch's own `red-witness` gate row, reproduced here rather than taken from
  the work history: `gates run --manifest gates.manifest.json --only red-witness
  --base d5d87f7 --head deea501` gives `declared 1 applicable 1 verdict 1 green 1
  red 0 ... vacuous 0` and `6 witness(es) evaluated (2 own, 4 stored re-evaluated
  in 15574ms)`. Local `pull_request`-shaped run only; T-009 scopes it to that.

## CR-001 (MEDIUM): a `patch` member's ownership is decided by its PATH ALONE, so rewriting the patch BODY silently exempts it from rule (d)

### The mechanism

`canonicalMember` (src/witness/spec.ts:248 at head, and the patch arm at src/witness/spec.ts:253) encodes a patch member as

```
JSON.stringify(["patch", member.patch])
```

which is the patch's PATH and nothing else. The dangerous state a patch member
declares does not live in the spec document at all: it lives in the patch file,
and `memberTouchedFiles` resolves it by reading that file's body at the audited
head. So the ownership derivation compares the one field of a patch member that
does NOT carry its meaning.

Consequence: a phase can rewrite an existing patch file from top to bottom,
turning a dangerous state about file X into a dangerous state about an entirely
unrelated file Y, and `phaseOwnedMemberIndices` will report the member as not
authored by this phase. Rule (d) is then skipped for it.

This is exactly the direction the change's own doc comment says it chose against:
"the failure mode of this derivation is a member wrongly EXEMPTED, so an
unreadable baseline keeps the obligation rather than dropping it"
(src/witness/spec.ts:280 at head). The unreadable-baseline arm is conservative;
this arm is not, and it is not mentioned anywhere in section 4 of the work
history ("what my derivation did NOT cover"), which is where it would belong.

### Reproduction, both trees, one fixture

Lab at `.../rev-wos-hazard/lab1full.test.ts`, copied into each worktree as
`test/zzlab1.test.ts` and removed afterwards. Fixture: a spec that EXISTS AT THE
BASE with two members, member 0 a mutation of `src/adder.ts` (the file the phase
changes, and the member the phase repairs), member 1 a patch member at
`patches/alt.patch`. The head rewrites `patches/alt.patch` so it now mutates
`src/spare.ts`, which the phase diff does not touch. The member's text in the
spec document is byte-identical on both sides.

| tree | arm | status | rule (d) names member 1? |
|---|---|---|---|
| base `d5d87f7` | patch body REWRITTEN at head | **red** | yes, `member 1, patch patches/alt.patch` |
| base `d5d87f7` | control: patch body unchanged | red | yes |
| head `deea501` | patch body REWRITTEN at head | **green** | **no** |
| head `deea501` | control: patch body unchanged | green | no |
| head `deea501` | discriminator: patch body identical, member PATH changed `alt.patch` -> `alt2.patch` | **red** | yes, `member 1, patch patches/alt2.patch` |

The last row is what isolates the cause. Same fixture shape, same patch content,
one field different: changing the member's PATH makes it owned and rule (d)
fires; changing the member's MEANING (the patch body) does not. So the
discriminator is the canonical form's blindness to the patch body, not anything
about the fixture.

Verbatim red detail from the base tree:

```
1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); witness combo-guard: red: rule (d): declared dangerous state does not intersect the phase diff (member 1, patch patches/alt.patch)
```

and from the head tree, same fixture:

```
1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); every witness red against every declared dangerous state and green at head
```

### Reachability, which is what DR-0027 makes the test

`src/witness/spec.ts` and `src/gates/red-witness.ts` are shipped. The corpus in
this repository at the audited head has **7 patch members across 3 specs**
(`witness/citation-na-precondition.json`, `witness/citation-record-doc-not-gated.json`,
`witness/witness-clone-resolves-dependencies.json`), all pointing into
`witness/patches/`. Measured:

```
$ grep -ho '"kind": "[a-z-]*"' witness/*.json | sort | uniq -c
    301 "kind": "mutation"
      7 "kind": "patch"
```

So the state needed to reach it exists today: a phase that edits one of those
three spec documents for any reason AND rewrites one of the referenced patch
bodies gets rule (d) dropped for that member. That is a plausible real edit (a
patch drifts out of applying and is regenerated), not a hypothetical one. It is
not reachable by an untouched spec, because an untouched spec is `stored` and
rule (d) never applied to it (measured, not assumed: the CONTROL rows of the
CR-002 table below report `0 own, 1 stored` and green on BOTH trees).

Severity MEDIUM rather than HIGH: the effect is the loss of ONE refusal rule for
ONE member kind, and the witness still has to demonstrate red by execution, so
a wholly fictitious dangerous state does not survive. Not TRACKED, because it
is reachable through the shipped gate on the corpus as it stands rather than
only by a future editor of the guard.

### Cheapest fix shape (not prescriptive)

Fold the patch BODY at the merge base and at the head into the canonical form,
e.g. `["patch", member.patch, sha256(body)]`, with an unreadable body on either
side falling back to "owned" so the conservative direction is preserved.

## CR-002 (MEDIUM): ownership is computed over `dangerousStates` ALONE, so a phase that rewrites only a spec's CLAIM (`behavior`, `tests`) authors nothing and takes NO rule (d) obligation at all

This is the third hazard class the brief asked for. The two the brief named are
"the guard stops guarding" and "the ownership derivation is attacker-controlled
through the merge-base side". This one is neither: the ownership derivation is
exactly as specified, on exactly the right revision, and the hole is that the
thing it measures authorship of is not the thing rule (d) is about.

### The mechanism

`phaseOwnedMemberIndices` compares `spec.dangerousStates` at head against the
same array at the merge base. A spec document has four other load-bearing
fields: `id`, `behavior`, `tests` and `class`. Those carry the spec's CLAIM,
which is "these named tests guard this behavior, and here is the dangerous state
they have been shown red against". A phase that rewrites the CLAIM and leaves
every member byte-identical authors nothing by this derivation, so
`phaseOwnedMembers` is empty and rule (d) is skipped for the entire spec,
including its hunk-level arm.

The effect: a phase can take a dangerous state an earlier phase authored, point
it at a behavior and a test THIS PHASE INTRODUCED, and obtain a witness for the
new behavior without rule (d) ever asking whether that dangerous state is about
anything this phase changed. On `main` this is refused.

### Reproduction

Lab at `.../rev-wos-hazard/lab4.test.ts`, run in both worktrees as
`test/zzlab4.test.ts` and removed afterwards. Fixture: `src/legacy.ts` gains a
new export at the END of the file (lines 5-7); the pre-existing member's `find`
text sits at line 2 and is untouched. The head re-points the spec from
`old-behavior`/`old thing` to `new-behavior`/`new thing`, both newly added by
the phase, and changes NOTHING in `dangerousStates`.

| tree | arm | status | detail |
|---|---|---|---|
| base `d5d87f7` | claim rewritten, members identical | **red** | `rule (d): ... (member 0, mutation of src/legacy.ts touches no line inside a changed hunk)` |
| head `deea501` | same fixture | **green** | `1 witness(es) evaluated (1 own, 0 stored ...); every witness red against every declared dangerous state and green at head` |
| base `d5d87f7` | CONTROL: spec not edited at all | green | `0 own, 1 stored` |
| head `deea501` | CONTROL: spec not edited at all | green | `0 own, 1 stored` |

The control matters and is reported rather than assumed: an untouched spec is a
STORED witness on both trees and rule (d) never applied to it, so the control
cannot tell the trees apart. Only the experiment does, which is what makes the
spec edit plus the tree the joint discriminator.

### Reachability, and the part of this that is NOT new

Stated honestly, because half of the surrounding hole is pre-existing.

**Pre-existing and unchanged:** the coverage check is FILE-granular (a changed
`src/` file must be touched by SOME member of SOME spec, src/gates/red-witness.ts:326),
while rule (d)'s hunk arm is LINE-granular and has only ever applied to specs
the phase edited. So "a phase changes lines no dangerous state is about" is
already reachable on `main` via a stored witness, and the control row above
demonstrates it on BOTH trees. This finding does not claim otherwise.

**New here:** on `main`, editing the spec at all pulled every member back under
the hunk arm, so a phase could not both rewrite a spec's claim and keep a stale
member. After this change it can. The shipped consequence is that the red-witness
gate will certify a NEW behavior on a dangerous state that no rule has checked
against the phase's diff.

MEDIUM rather than HIGH: the dangerous state still has to make the newly named
test genuinely red by execution, so the witness is not fictitious, only
mis-aimed. MEDIUM rather than LOW/TRACKED: it is reachable through the shipped
gate by an ordinary edit (re-pointing a spec's `tests[]`), not only by a future
editor of the guard.

**The counter-argument, stated so the arbitrator does not have to reconstruct
it:** one can read rule (d) as a claim about MEMBERS only, in which case this is
correct behaviour and the gap is the pre-existing file-granular coverage check.
I do not think that reading survives the change's own words, which say rule (d)
protects "a phase cannot add a dangerous state about unrelated code"
(src/witness/run.ts:1289) - re-pointing a spec at a new behavior IS adding a
dangerous state about unrelated code to that behavior's guard, spelled without
touching the member array.

## CR-003 (TRACKED): the new ownership logic has three newly EXPORTED functions and no test names any of them; seven structurally different corruptions of it leave the witness suite green

### The derivation

A mutation sweep, `.../rev-wos-hazard/lab2.mjs`, applies one corruption at a
time IN PLACE in the head worktree, runs `node --test test/witness.test.ts`
(node v26.6.0, dist built), restores the original bytes by writing them back
(never `git checkout --`, standing warning 8) and asserts the tree is clean
again. Every row below reports `treeCleanAfterRestore: true`. Raw results at
`.../rev-wos-hazard/lab2-results.json`.

| id | what it corrupts | suite |
|---|---|---|
| M1 | `phaseOwnedMemberIndices` always returns the empty set | **caught**, 2 fail |
| M2 | `ownedMembersOf` returns the empty set (the other producer) | **caught**, 2 fail |
| M3 | membership test instead of the MULTISET consume | SURVIVED |
| M4 | `canonicalMember` drops a mutation's `replace` | SURVIVED |
| M5 | `canonicalMember` drops a mutation's `find` | SURVIVED |
| M6 | `canonicalMember` keys a mutation on its FILE alone | SURVIVED |
| M7 | absent baseline owns NOTHING (the fail-open direction) | **caught**, 1 fail |
| M8 | rule (d) loses its inside-a-changed-hunk arm | SURVIVED |
| M9 | the baseline is read at `baseSha` instead of `mergeBaseSha` | SURVIVED |
| M10 | unreadable baseline passed as `[]` rather than `undefined` | SURVIVED |
| M11 | an unparseable baseline owns nothing | SURVIVED |

The tests that caught M1, M2 and M7 are named, so the catch is attributable:
`a member this phase ADDED to an existing witness spec must still intersect the
phase diff` and the pre-existing `a mutation member outside the phase diff is
red naming the member and moving it in is evaluable`.

Supporting evidence that no other test file covers the survivors:

```
$ grep -rn "phaseOwnedMemberIndices\|canonicalMember\|parseWitnessSpec\|mergeBaseSha" test/
(no output)
```

Three functions newly exported from shipped `src/` and one new `PhaseDiff` field,
and no test in the repository names any of them.

### Which survivors matter, and which do not

**M8 is PRE-EXISTING and is not a finding against this change.** I expected a
coverage regression and did not find one: the same corruption applied to the
BASE tree also leaves its suite green.

```
base d5d87f7, `if (member.kind === "mutation")` -> `if (false)`:
  i tests 42  i pass 42  i fail 0  i skipped 0
```

**Transliteration notice, per CLAUDE.md's captured-output rule.** That block is
real captured output from `node --test`, whose reporter prints U+2139 at the head
of its summary lines. The four occurrences of U+2139 in this document are
rendered as `i`. Nothing else in any captured output here was changed, and no
U+2716 occurs because no run quoted in this document had a failing test line.
Every other quoted capture is byte-verbatim.

**M3, M4, M5, M6, M9, M10 and M11 are all NEW code from this change.** Two of
them corrupt properties the change's own documentation calls load-bearing:

- M3: the multiset consume, which src/witness/spec.ts:272 says "matters because
  rule (g) is what refuses that copy and it must still see it as new".
- M9: reading the old side at the merge base rather than at `baseSha`, which
  src/witness/run.ts:95 declares and the comment above it explains at length as the standing-warning-13 property.

Both are asserted in prose and neither has a red witness. That is the shape
CLAUDE.md's red-witness rule exists to refuse, applied to the guard itself.

### Severity

TRACKED, per the brief's own rule: a gap reachable only by a FUTURE EDITOR of
the guard is tracked, and every row here requires someone to edit
`phaseOwnedMemberIndices`, `canonicalMember` or `ownedMembersOf`. It does not
make any currently shipped artifact wrong. Recording it because "the fix
addressed the instance rather than the mechanism" is this project's dominant
failure mode and an unwitnessed mechanism is how the next instance gets in.

### Scope of this measurement, stated because a wrong scope reads as an absence of defects

The sweep ran `node --test test/witness.test.ts` only, not the full suite. A
three-mutation full-suite confirmation (M9, M3, M6 under `npm test`) is reported
in the addendum below and AGREES; the identifier grep above is why. The other
four survivors (M4, M5, M10, M11) were NOT re-run under the full suite, so for
those the result is "uncovered by `test/witness.test.ts`" and no stronger.

## The harness change: `scripts/m2-exit-test.sh` runs the demonstration in a worktree at the audited sha

The brief asks whether that can make the demonstration pass while the real gate
would fail, on the ground that a demonstration that cannot go red is worth
nothing. I attacked it and the answer is a qualified no, with a measured
narrowing that should be recorded.

### CR-004 (TRACKED, `scripts/`): the demonstration's blast radius shrank from the whole present corpus to four historical specs, and the compensating catch is a DIFFERENT gate row

Measured. The audited sha is `1b6f0963b62f` (M2-P2's merge commit).

```
$ git ls-tree -r --name-only 1b6f0963b62f -- witness/   ->  4 .json specs
$ git ls-tree -r --name-only deea501      -- witness/   ->  150 .json specs
```

So the demonstration now exercises the gate against 4 of the 150 specs the
repository carries, and none of the 4 is a `patch`-kind member (patch members
did not exist at M2-P2; see the work history's own 7.3).

Forced, rather than argued. I poisoned the PRESENT corpus with an unparseable
spec `witness/zz-hazard-broken.json` and ran BOTH demonstration scripts against
the same tree, the same `--tiphys` build and the same manifest:

| demonstration script | result |
|---|---|
| the NEW one (worktree at the audited sha) | `m2-green: red-witness GREEN with 4 unit(s) ... spec corpus read from a worktree checked out at 1b6f0963b62f`, exit 0 |
| the OLD one (`cwd: repo`) | `[red-witness] green-path demonstration is not a non-vacuous green: status red, units 6` |

**The compensating catch exists and I verified it rather than assuming it.** The
same poisoned corpus, put to the REAL gate row on this branch's diff:

```
$ node dist/bin/tiphys.js gates run --manifest gates.manifest.json --only red-witness \
    --base d5d87f7 --head deea501 --phase witness-ownership-scoping
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: red-witness: red: 6 witness(es) evaluated (2 own, 4 stored re-evaluated in 15866ms); witness spec .../witness/zz-hazard-broken.json does not parse as JSON: ...
```

and the same command with the poison removed:

```
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 6 witness(es) evaluated (2 own, 4 stored re-evaluated in 15574ms); every witness red against every declared dangerous state and green at head
```

So a corrupt present-day spec is still caught inside the same exit-test bundle,
by the gate ROW rather than by the green-path demonstration. The demonstration
did not become a guard that cannot go red; it became a guard over a narrower and
more faithful configuration, and the wider configuration is covered elsewhere.
TRACKED, `scripts/`, and it does not block: per DR-0027 a `scripts/` finding
blocks only if it makes a shipped artifact wrong, and this one does not.

**The part that is a real loss, stated so it is not lost:** a regression that
only the modern corpus can express (anything about `patch`-kind members, for
instance, which is exactly the ground of CR-001) is now invisible to the
demonstration AND to any historical replay. That is not an argument for reverting
the harness change, whose reasoning I checked and agree with; it is an argument
for the demonstration not being cited as evidence about the present corpus.

### What I checked in the harness and found sound

- `git worktree add` uses an ABSOLUTE path, so standing warning 9's
  resolve-against-the-repository trap does not apply. Confirmed by reading and
  by the run above leaving no stray worktree (`git worktree list` unchanged).
- The failure arm is written FIRST: `added.status !== 0` pushes a failure naming
  the sha and the stderr. This is the one place a `|| true`-shaped swallow would
  have reproduced the T-008 shape, and **I forced the arm rather than reading
  it.** A copy of the generated `m2-green.mjs` with one line changed, the audited
  sha replaced by forty zeroes so `git worktree add` refuses:

  ```
  m2-green: FAIL with 1 finding(s):
    - [red-witness] could not check out the audited head 000000000000 into a worktree: fatal: invalid reference: 0000000000000000000000000000000000000000
  exit=1
  ```

  and `git worktree list` afterwards names no `red-witness-head-tree`. The
  trigger is synthetic; the arm it exercises is the shipped one, unmodified.
  I first tried to force it environmentally (a read-only scratch directory, then
  an unusable scratch path) and neither worked here: this container runs as root,
  so the read-only directory was ignored, and the unusable path hung a LATER
  demonstration for ten minutes before I killed it. Recorded because the second
  attempt is a real way to waste time.
- Removal is in a `finally`, with `worktree prune` on both sides and an `rmSync`
  of the target path before `add`, so a previous run's registered-but-deleted
  worktree is cleaned before the add rather than colliding with it.
- `record(gate, resultPath)` moved inside the `else`, which is correct: on the
  add-failure arm a `record` call would have reported "wrote no result record"
  as a SECOND failure for the same cause. The single failure names the real one.
- The demonstration cannot pass vacuously: `record` requires
  `status === "green" && units > 0 && vacuous !== true`, and the run reports
  4 units.

## Failed attacks

Recorded with what I expected and what happened, because they bound what a later
reader has to re-check. All run in both worktrees where a comparison is
meaningful; lab at `.../rev-wos-hazard/lab5.test.ts`.

### FA-1: add a SECOND copy of an existing member, hoping the multiset consume is really a set membership test

Expected: the duplicate is matched against the single baseline copy and exempted.
**Happened: caught.** Head tree, red, and it names ONLY the added copy:

```
witness combo-guard: red: rule (d): declared dangerous state does not intersect the phase diff (member 2, mutation of src/legacy.ts)
```

The base tree reddens BOTH copies (`member 1` and `member 2`), which is the
file-granular over-reach this change removes, so the two trees differ in exactly
the intended way and no further.

### FA-2: permute the members, hoping a positional derivation reads a reorder as authorship

Expected: index-based matching would treat a reorder as new authorship and
redden. **Happened: green on head, red on base.** The matching is by canonical
form, not by index, so a reorder owns nothing. This is a correctness result in
the change's favour, and it is the arm that would have made the change a false-red
generator.

### FA-3: rename the spec FILE, hoping the merge-base read finds nothing and something fails OPEN

Expected: `git show <mergeBase>:witness/new-name.json` fails, and I hoped the
failure path dropped the obligation. **Happened: caught, and it fails CLOSED.**
Head tree: `rule (d): ... (member 1, mutation of src/legacy.ts)`. Base tree:
identical reason. `--no-renames` plus "an unreadable baseline owns everything" is
the conservative composition the change claims.

### FA-4: change a `src/` file that no member of any spec is about

Expected: with rule (d) relaxed, a phase could change code with no dangerous
state aimed at it. **Happened: caught by a DIFFERENT check.** Head tree:
`source changed with no witness spec covering it: src/orphan.ts`. The coverage
computation (src/gates/red-witness.ts:326) walks ALL specs, own and stored, and
is not ownership-gated at all, so it is untouched by this change. This is the
backstop that keeps CR-002 at MEDIUM instead of HIGH.

### FA-5: DELETE the member that is about the phase's own change, keeping one stale member

Expected: deletions author nothing, so rule (d) sees an empty owned set and says
nothing, and the phase escapes with a gutted witness. **Happened: rule (d) does
indeed say nothing, and coverage catches it anyway.** Head tree:
`source changed with no witness spec covering it: src/adder.ts`. The escape
exists exactly as predicted and is closed one layer up.

### FA-6: reach the `mergeBaseSha` fallback, so that a real run silently reads the old side at `baseSha`

Expected: some history shape where `git merge-base` fails but the three-dot diff
succeeds. **Happened: I did not find one, and the reason is structural.** Built a
repository with two orphan roots and measured directly:

```
$ git merge-base <A> <B>                                 -> exit 1, no output
$ git diff --name-status --no-renames <A>...<B>          -> exit 128
   fatal: <A>...<B>: no merge base
```

`computePhaseDiff` takes that same three-dot diff immediately after, so it
returns `ok: false` and control never reaches the assignment. This independently
reproduces the work history's ARM E. Stated as "I did not find a way to force
this arm", not as "this arm cannot be forced".

### FA-7: make the workflow's `--base` diverge from the merge base, so the ownership read is wrong in CI

Expected: `--base "${{ github.event.pull_request.base.sha }}"` is the base BRANCH
TIP, which advances while a branch is open, so an out-of-date branch would have
`baseSha != mergeBase` and the derivation would read main's newer spec as the
branch's baseline. **Happened: this is precisely what `mergeBaseSha` fixes**, and
the fix is correct: .github/workflows/gates.yml:231 supplies that base, and
`ownedMembersOf` reads `diff.mergeBaseSha`. The attack lands on the PRE-change
design, not on this one. Related: `fetch-depth: 0` at
.github/workflows/gates.yml:58 and the explicit shallow refusal at
src/gates/red-witness.ts:168 close the shallow-clone variant of it.

### FA-8: get a member exempted by making it structurally identical to a pre-existing one ON PURPOSE (the brief's hazard class 2)

Expected: a usable exemption. **Happened: dead for `mutation` members, alive for
`patch` members.** For a mutation, the canonical form is file plus find plus
replace, so a member identical to a pre-existing one IS that pre-existing
dangerous state and buys the author nothing. For a patch the canonical form is
the PATH alone, so identity is purchasable by keeping the path and rewriting the
body. That is CR-001 and it is the only surviving instance of this class I found.

### FA-9: get the demonstration to pass over a broken present-day corpus while the real gate would fail

Expected: the worktree change hides a real failure inside the exit test.
**Happened: half true, and the other half closes it.** The demonstration is
indeed blind to the present corpus, forced and measured under CR-004; the gate
ROW in the same bundle is not, and reddens on the same poison. The exit test as a
whole still goes red.

## Addendum: the full-suite confirmation for CR-003's survivors

Invocation `npm test`, node v26.6.0, `dist/` built, head worktree, one mutation
applied in place at a time and the original bytes written back afterwards. Tree
clean after every restore.

| mutation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| M9, baseline read at `baseSha` | 826 | 826 | 0 | 0 | 0 |
| M3, set instead of multiset | 826 | 826 | 0 | 0 | 0 |
| M6, `canonicalMember` on file alone | 826 | 826 | 0 | 0 | 0 |

So the three are not merely uncovered by `test/witness.test.ts`; they are
uncovered by the whole suite. The M9 row is the one worth naming twice: it is
the property the change argues for at greatest length, over twenty lines of
doc comment above src/witness/run.ts:95, and the entire suite is indifferent to
it.

Note the invocation matters here (standing warning 12, third axis): `npm test`
is 826, and a bare `node --test` from the repository root would include the
tracked `sandbox/` fixture and report more. Every number in this document is
`npm test` or a named single file.

## Verdict

**FIX-ROUND-NEEDED.**

Two MEDIUM findings, both reproduced by execution against both trees, both
reachable through the shipped gate rather than only by a future editor of it:

- **CR-001**, a `patch` member's ownership is keyed on its path alone, so
  rewriting the patch body exempts a member the phase demonstrably authored. The
  live corpus carries 7 patch members across 3 specs, so the state needed to
  reach it exists today.
- **CR-002**, ownership is computed over `dangerousStates` alone, so a phase that
  rewrites only a spec's CLAIM (`behavior`, `tests`) takes no rule (d) obligation
  at all, including the hunk arm, and can certify a NEW behavior on a dangerous
  state nothing has checked against its diff.

Both are the review's central question answered the same way: **the relaxation is
WIDER than claimed.** The claim is "a member a sibling edit dragged into the
file's diff is not owned"; the delivered behaviour is "anything whose
`dangerousStates` canonical form is unchanged is not owned", and two distinct
kinds of real authorship live outside that canonical form.

CR-003 (TRACKED) and CR-004 (TRACKED, `scripts/`) do not block.

**What the change gets RIGHT, said plainly rather than left implicit**, because a
hazard review that reports only holes misleads about the whole:

- The direction of the derivation's failure is genuinely conservative in the
  three arms it names: absent, unparseable and invalid baselines all own
  everything, and FA-3 forces the first of those and finds it closed.
- Reading the old side at the MERGE BASE rather than at `baseSha` is not a
  detail; FA-7 shows the workflow really does supply a base that diverges, so the
  pre-change design would have been wrong in CI the moment a branch fell behind.
- The multiset consume is right and FA-1 could not break it.
- The reorder case (FA-2) is the arm that would have made this a false-red
  generator, and it is handled.
- The harness change is sound (CR-004's checks), its failure arm is written
  first, and it does not create a demonstration that cannot go red.

## What this review did NOT cover

The reviewer's first check, per CLAUDE.md:362, applied to my own work.

1. **The `push` arm of the gates workflow.** Every measurement here is a local
   `pull_request`-shaped run or a direct `runRedWitnessGate` call. T-009 binds:
   this document is evidence for that configuration and no other. `red-witness`
   is declared `pull_request` only in the registry, which is why I did not
   pursue it, but I did not verify that declaration end to end.
2. **macOS, and CI generally.** Nothing here ran on a runner.
3. **The other rules.** I attacked rule (d)'s SCOPE. I did not re-audit rules
   (a), (b), (c), (e), (f) or (g) for their own correctness; I only established
   that `phaseOwnedMembers` is read in exactly one place
   (`grep -rn "phaseOwnedMembers" src/` gives five lines: the field at
   src/witness/run.ts:126, the consumer at src/witness/run.ts:1291, a comment at
   src/witness/run.ts:1284, and the two producers at src/gates/red-witness.ts:368
   and src/gates/red-witness.ts:387), so no other rule changed
   behaviour.
4. **The work history's claim grep and its counts.** I read sections 1 to 10 and
   independently reproduced ARM E, but I did not re-run the forty-two-occurrence
   count or verify every row of its section 8 table. That is the criteria
   reviewer's ground.
5. **`test/behaviors.json` and the two new witness specs as documents.** I did
   not check them against the schema or against rule (g)'s structural
   distinctness beyond observing that the branch's own `red-witness` gate row is
   green at head (6 witnesses, 2 own, 4 stored, reproduced independently here).
6. **Performance.** `ownedMembersOf` adds one `git show` per own spec per run. I
   did not measure it; the observed re-evaluation times (15.6s and 15.9s in my
   two gate runs) are indistinguishable from the work history's 14.0s at this
   resolution.
7. **CR-001 and CR-002 in combination with the `coverage` and `scope` gates on a
   REAL branch.** Both were forced in synthetic fixtures. I did not construct a
   real phase branch that exploits either end to end, so the claim is that the
   gate accepts the state, not that a whole PR would land.
8. **Whether CR-002 has a variant that also defeats the coverage backstop.** I
   found the backstop (FA-4, FA-5) and stopped there rather than searching for a
   way around it.

## The claim grep, on this document

Both forms, per CLAUDE.md:369 and the wrap-insensitive supplement at CLAUDE.md:396.
**Eighteen occurrences line-based, eighteen wrap-insensitive, so ZERO were
hidden by a wrap.** Nine of the eighteen are the nine QUOTATIONS inside the table
below, which restate the phrase in order to settle it; the grep pattern itself is
not spelled out in this document. The nine real occurrences are the table's rows.

| line | phrase | what settles it |
|---|---|---|
| 115 | "rule (d) never applied to it" | the CR-002 control rows, which report `0 own, 1 stored` and green on BOTH trees |
| 171 | the same sentence in CR-002 | the same table, immediately above it |
| 214 | "never `git checkout --`" | a statement about what I did; every lab2 row reports `treeCleanAfterRestore: true`, and `git status --porcelain` on the head worktree is empty |
| 220 | "always returns the empty set" | a description of the mutation I applied, quoted from the lab source |
| 342 | "the wider configuration is covered elsewhere" | the captured red gate run on the poisoned corpus, two paragraphs above it |
| 435 | "coverage catches it anyway" | the captured `source changed with no witness spec covering it: src/adder.ts` on the line below |
| 452 | "control never reaches the assignment" | the ARM E capture above it: `git merge-base` exit 1 and the three-dot diff exit 128, run here on a two-orphan-root repository |
| 454 | "not as 'this arm cannot be forced'" | quoting the rule at CLAUDE.md:378 in order to refuse the claim, not asserting it |

One earlier over-claim was restated rather than left: "a worktree that cannot be
created is red rather than silent" was a reading of the source, and it is now
FORCED with a captured `exit=1` and the failure line, in the harness section.
