# Clean-room review: witness ownership scoping (CRITERIA contract)

review-contract: criteria
framing: does this change do what it claims, and is each claim carried by evidence that would survive someone hostile checking it?
produced-by: Claude (Sonnet 5, Anthropic)
head under review: deea5017aeb351a3a2b6f92ac9a375f9173b0282 on branch claude/witness-ownership-scoping
base: origin/main at d5d87f7

Status: COMPLETE.

## VERDICT: FIX-ROUND-NEEDED

One finding, CR-001, MEDIUM severity, reproduced (not a hypothesis) against
shipped `src/gates/red-witness.ts` / `src/witness/spec.ts` using real
`kind: "patch"` witness members that exist in this repository's own
corpus today. Per DR-0027, a MEDIUM in `src/` blocks the merge if it can
reach a shipped artifact or a real user path; I judge it reachable and
name the shipped behavior at risk (rule (d)'s diff-intersection obligation
for `patch`-kind members), satisfying DR-0027 rule 4's requirement that a
blocking finding name the shipped behavior at risk. Everything else I
checked -- the fail-safe direction, the two-behavior witness class, the
unreachable-fallback-line claim, the harness worktree change, the full
test suite, the claim grep, and a spot-check of the work history's own
citations -- held up under independent reproduction. See "What I did not
cover" at the end for the boundaries of this review.

## Diffstat (git diff --stat origin/main...claude/witness-ownership-scoping)

```
 delivery/work-history/witness-ownership-scoping.md | 736 +++++++++++++++++++++
 scripts/m2-exit-test.sh                            |  75 ++-
 src/gates/red-witness.ts                           |  48 +-
 src/witness/run.ts                                 | 110 ++-
 src/witness/spec.ts                                | 117 +++-
 test/behaviors.json                                |   4 +-
 test/witness.test.ts                               | 209 ++++++
 witness/witness-rule-d-binds-an-added-member.json  |  24 +
 .../witness-rule-d-scoped-to-authored-members.json |  24 +
 9 files changed, 1279 insertions(+), 68 deletions(-)
```

## Step 1: what the work history declares NOT covered (read first, per project rule)

From section 4 and section 9 of delivery/work-history/witness-ownership-scoping.md:

1. The second search (`grep -rn "dangerousStates" src/`) is scoped to `src/`
   only; `test/`, `scripts/`, `.github/`, `delivery/` excluded. Declared
   deliberate for the rules audit (rules a-g all live in
   src/witness/run.ts), but explicitly says a granularity mismatch in a
   script or workflow would not appear, and `scripts/` was not audited for
   this shape.
2. It is an audit of ONE mechanism (file-granular fact + member-granular
   obligation), not a general audit of rule (d) correctness.
3. `memberTouchedFiles` was not audited as its own source of the same
   mismatch, only its callers' granularity.
4. Renames -- closed later by measurement (ARM A, section 10).
5. Fail-safe arms (unreadable/invalid baseline) -- closed later by
   measurement (ARMS B/C, section 10).
6. Item 1 restated in section 9: "that rule (d) is the only place in the
   repository with this mechanism" is explicitly NOT established, scoped by
   the src/-only, one-shape audit above.
7. Section 9 item 5: nothing about the `push` arm of the gates workflow;
   every measurement is a local `pull_request`-shaped run.
8. Section 9 item 6: nothing about macOS (declared CI-only).
9. Section 9 item 7: no post-merge push run yet (cannot exist pre-merge).

Judgment on honesty of these bounds: items 1-3 and 6-9 read as honestly
scoped -- each is a concrete named exclusion with a stated reason, not a
vague hedge. I independently re-ran the `dangerousStates` grep unscoped
(below) to check whether the scoping in item 1 actually left something
findable outside `src/`, since that's the one place a hostile check would
push first.

```
$ grep -rln "dangerousStates" --include='*.ts' --include='*.mjs' --include='*.sh' . \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
./src/checks.ts
./src/gates/red-witness.ts
./src/witness/run.ts
./src/witness/spec.ts
./test/witness.test.ts
./test/checks.test.ts
```
(run from repo root of the worktree at branch head)

No `scripts/*.sh` or `.github/**` hits at all -- `dangerousStates` as an
identifier does not leave `src/`+`test/`. This narrows but does not close
item 1: the work history's own caveat is about a *shape* (file-granular
fact + member-granular obligation), not about the literal identifier, and a
shell script could reimplement the same shape without ever mentioning
`dangerousStates`. I did look at `scripts/m2-exit-test.sh`'s new diff for
this shape (see CR-003 below) since that file is touched by this same
branch, and found nothing of this shape there, but I did not audit the rest
of `scripts/` beyond that file. That gap is real and is carried into my own
"not covered" section below rather than closed.

## Verified claims (checked and confirmed accurate, no defect found)

- **The fail-safe direction (arms B, C, D).** Independently reproduced with
  my own scratch-repo probes against `runRedWitnessGate` (not reusing the
  implementer's probe code): schema-invalid baseline and unparseable
  baseline both cause the gate to treat EVERY head member as owned (rule
  (d) correctly reddens a non-intersecting member in both cases); a valid
  baseline with the member genuinely pre-existing (spec touched only via an
  unrelated `repeats` bump) correctly does NOT trigger rule (d) for that
  member. Matches the work history's ARMS B/C/D claims in section 10.
- **The witness (two behaviors, two specs).** Ran `node --test
  test/witness.test.ts` directly: 44 tests, 44 pass, 0 fail, 0 skipped,
  including both named tests
  ("editing one member of a witness spec imposes rule (d) on that member
  only..." and "a member this phase ADDED to an existing witness spec must
  still intersect the phase diff"). Read the `siblingFixture` helper and
  its three untouched-sibling members (`src/legacy.ts` mutation outside the
  diff, `src/spare.ts` mutation inside the diff but outside the changed
  hunk, and a `patch` member) directly in test/witness.test.ts:1605-1701 --
  confirmed structurally distinct (three different member kinds/shapes),
  satisfying "one witness is not a class."
- **The unreachable line (src/witness/run.ts:250's merge-base fallback).**
  Independently reproduced with two orphan-root branches in a scratch repo
  and calling `computePhaseDiff` directly: `git merge-base A B` exits 1
  with no stdout, the three-dot `git diff --name-status --no-renames
  A...B` then exits 128 (`fatal: ...: no merge base`), and
  `computePhaseDiff` returns `{ok:false, ...}` BEFORE reaching the
  `mergeBaseSha` fallback's consuming code path. Matches the work history's
  own ARM E measurement exactly (same exit codes, same failure point).
  I did not find a way to reach the fallback either; the claim is sound as
  far as both of us tested it.
- **The claim grep (section 8).** Independently re-ran both the line-based
  and wrap-insensitive forms against
  `delivery/work-history/witness-ownership-scoping.md`: 42 occurrences in
  each, matching the work history's own count (42/42, zero hidden by wrap).
- **Citations gate scope claim.** `delivery/work-history/` is confirmed
  absent from `citationRequired`'s precondition globs in
  src/gates/citations.ts:233-238 at branch head (the list is exactly
  `delivery/plan/**/*.md`, `delivery/verification/**/*.md`,
  `delivery/decisions/**/*.md`, `delivery/tuition/**/*.md`,
  `delivery/requirements/**/*.md`, `delivery/STATE.md`), confirming the
  work history's claim that this document was not linted by the gate.
- **Spot-checked citations.** Eight `path:line` citations in the work
  history that are stated to be about the post-change tree (as opposed to
  the ones the document itself marks "quoted rather than cited" for being
  pre-change) were checked against branch-head content:
  src/witness/spec.ts:283, src/witness/run.ts:1291, src/witness/run.ts:95,
  src/gates/red-witness.ts:295, src/witness/run.ts:908,
  src/witness/run.ts:250, src/gates/red-witness.ts:246,
  src/gates/red-witness.ts:387. All eight resolve to the described content.
- **`--no-renames` on the phase diff.** Confirmed present at both
  src/witness/run.ts:254 and src/witness/run.ts:272 at branch head.
- **Harness worktree path is absolute.** Confirmed `scratch` in
  scripts/m2-exit-test.sh is derived from `evidence`, which is resolved via
  `CDPATH= cd -- "${evidence}" && pwd` (scripts/m2-exit-test.sh:338),
  so `join(scratch, "red-witness-head-tree")` is absolute, matching the
  claim.
- **Harness cleanup path registers failures correctly.** Read
  scripts/m2-exit-test.sh:1102-1151: a worktree-add failure pushes to the
  SAME `failures` array checked at scripts/m2-exit-test.sh:1243 (`if
  (failures.length > 0) { ... process.exit(1); }`), so a checkout failure
  does fail the script rather than being silently absorbed. `git worktree
  prune` runs both before creation (line 1114) and after removal in the
  `finally` (line 1147), matching the "both sides" claim.
- **Build and test-count sanity.** `npm run build` exit 0, `git status
  --porcelain` clean after build (both confirmed at branch head, toolchain
  node v26.6.0). `git diff --stat` shows exactly 2 new `test("...")`
  entries added to test/witness.test.ts and exactly 2 new keys added to
  test/behaviors.json, consistent with the claimed 824 (base) + 2 = 826
  total.
- **Full suite, the complete sentence.** Invocation `npm test`; toolchain
  node v26.6.0 (confirmed in the invoking shell); build state `dist/`
  present (built moments before via `npm run build`, exit 0, clean
  `git status --porcelain` afterward); reported **tests 826, pass 826, fail
  0, skipped 0, todo 0, cancelled 0**; the run completed (no timeout, no
  crash). Exactly matches the work history's section 6 claim.

## Step 2: the diff itself

Read src/witness/spec.ts, src/gates/red-witness.ts, src/witness/run.ts diffs
in full (git diff origin/main...claude/witness-ownership-scoping -- <path>).
The mechanism as described in the work history matches the code:
`phaseOwnedMemberIndices` (src/witness/spec.ts, new function) computes a Set
of owned indices via multiset-consume of `canonicalMember` keys against the
merge-base version; `ownedMembersOf` in src/gates/red-witness.ts wires it in
via `git show <mergeBaseSha>:<path>` and `parseWitnessSpec`; rule (d)'s loop
in src/witness/run.ts now does `if (!inputs.phaseOwnedMembers.has(index))
continue;` per member instead of gating the whole loop on a boolean. `own` /
`stored` split (file-in-diff test) is UNCHANGED -- ownership refinement only
narrows what happens to members of specs already in `own`.

## CR-001: canonicalMember is content-blind for "patch"-kind members, and this silently defeats rule (d) for that member kind (MEDIUM, REPRODUCED)

**The claim under test.** Section 3 of the work history states: "A member is
OWNED when no structurally identical member exists... Structural identity is
`canonicalMember`, the kind's own fields in a fixed order." The brief asks
directly: "What does it do when a member is edited in a way that changes
behaviour but the comparison treats it as identical?"

**The gap.** `DangerousStateMember` has three kinds
(src/witness/spec.ts:46-48 at branch head). For `mutation` and `baseline-ref`,
every field that determines behavior (`file`/`find`/`replace`, or `ref`) is
INLINE in the spec JSON, so `canonicalMember` (src/witness/spec.ts:243-254 at
head) genuinely captures the member's full behavior. For `patch`, the only
field is `patch: string`, which is a PATH to a separate file
(`witness/patches/*.patch`), and `canonicalMember` hashes only that path
string: `JSON.stringify(["patch", member.patch])`. It never reads the
referenced file's content. So two patch members with the same path but
DIFFERENT underlying patch content are "structurally identical" by this
comparison, and a patch member whose *content* changes while its *path*
field stays the same is judged UNOWNED (pre-existing) as long as it matches
byte-for-byte against whatever member existed at the merge base with that
path -- even though the merge-base version, read via `git show
<mergeBaseSha>:<path>`, necessarily reflects the OLD patch file content had
IT existed unchanged, not the new one. Concretely: baseline member
`{kind:"patch", patch:"witness/patches/foo.patch"}` and head member
`{kind:"patch", patch:"witness/patches/foo.patch"}` (identical JSON) are
always judged the same member by `canonicalMember`, regardless of whether
`witness/patches/foo.patch`'s CONTENT changed between the two revisions.

**Why it matters.** When a member is judged unowned, rule (d)'s loop
`continue`s past it entirely (src/witness/run.ts, rule (d) loop) -- no "must
intersect the phase diff" check runs for it at all. So a phase that (a)
touches the spec's own JSON file for any unrelated reason (making the spec
"own" per the pre-existing file-level test) and (b) separately rewrites the
CONTENT of a `patch`-kind member's referenced file to describe a genuinely
different dangerous state, while leaving the `patch` path field unchanged,
gets that member's rule (d) obligation silently skipped, exactly the
"editing one member ... imposes rule (d) ... [in a way that is wrongly
scoped]" failure shape this whole branch exists to fix, now reproduced one
level down for one member kind.

**Reproduction (pure function).** `phaseOwnedMemberIndices` called directly:
baseline `[{kind:"patch",patch:"patches/foo.patch"}]`, head
`[{kind:"patch",patch:"patches/foo.patch"}]` (same path; the on-disk content
at that path is asserted, not represented, to differ) returns `owned: []`
-- i.e. NOT owned, regardless of content. Script:
`node ./probe1.mjs` (deleted after use; reproducible from the two lines
above against `src/witness/spec.ts`'s exported `canonicalMember` and
`phaseOwnedMemberIndices`).

**Reproduction (end-to-end through `runRedWitnessGate`), the stronger form.**
Built a scratch git repo: baseline has `witness/foo-guard.json` (one `patch`
member, `witness/patches/foo.patch`) and that patch file mutates
`src/legacy.ts`. HEAD changes ONLY `repeats: 1 -> 2` in the spec JSON (an
unrelated spec-level field, so the spec is "own" per the file-in-diff test)
and REWRITES `witness/patches/foo.patch`'s content in place (same path) to a
different mutation of the SAME untouched `src/legacy.ts`. The phase diff at
head is exactly `{witness/foo-guard.json, witness/patches/foo.patch}` --
`src/legacy.ts` is untouched by the phase. Ran `runRedWitnessGate({repoRoot,
base, head})`:

```
status: red
detail: 1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); witness foo-guard: red: member 0 (patch witness/patches/foo.patch): red in 0 of 2 repetitions where deterministic true requires every repetition red
```

No "rule (d)" reason appears anywhere in the output; the gate proceeded
straight to APPLYING the (content-changed) patch and running the RED/GREEN
evaluation, never checking whether member 0's declared dangerous state
intersects the phase diff. It does not, since `src/legacy.ts` is not
in `diff.files` at all.

**The control that isolates the path-vs-content distinction.** Same
scenario, except the head spec instead RENAMES the referenced patch to a new
path carrying the exact same (different-from-baseline) content
(`witness/patches/foo-renamed.patch`, `git diff --name-status` reports
`R084 witness/patches/foo.patch witness/patches/foo-renamed.patch`).
`canonicalMember` now differs (different path string), the member is judged
OWNED, and rule (d) correctly fires:

```
status: red
detail: 1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms); witness foo-guard: red: rule (d): declared dangerous state does not intersect the phase diff (member 0, patch witness/patches/foo-renamed.patch)
```

Same underlying content change, same diff shape (spec file + one patch file
changed, target file untouched); the ONLY variable between the two runs is
whether the `patch` field's path string itself changed. That isolates the
defect to path-vs-content, not to anything else about the scenario.

**Reachability (DR-0027).** This is in shipped `src/gates/red-witness.ts` and
`src/witness/spec.ts`, the exact files this change modifies, implementing
the gate that governs every PR merge in this repository's own delivery
process. `kind: "patch"` is not hypothetical: three shipped specs use it
today (`witness/citation-na-precondition.json`,
`witness/citation-record-doc-not-gated.json`,
`witness/witness-clone-resolves-dependencies.json`, confirmed by `grep -l
'"kind": *"patch"' witness/*.json`). Any future phase that edits a
patch-kind member's referenced `.patch` file's content, in the same commit
as any other edit to that spec's JSON (a `repeats` bump, an added sibling
member, anything), while leaving the `patch` field's path string unchanged,
defeats rule (d) for that member. This is a REAL user path for the kernel's
own gate, not a hypothetical one bounded to a future editor of the guard
itself.

**Severity: MEDIUM, and I believe it should block per the brief's own
reachability test**, though I flag this for the orchestrator's judgment
since it is a narrower reach than "any PR" (it requires the specific patch
+ same-path-content-change + co-located-spec-edit shape). It directly
contradicts the work history's implicit claim (never stated as a limit) that
`canonicalMember` establishes "structural identity" uniformly across all
three member kinds; it only does so for two of the three, and the third is
real production usage.

**What this finding does NOT establish.** I did not check whether the SAME
gap exists in reverse for `patch` members under rule (g) (structural
distinctness / duplicate refusal), which also calls `canonicalMember`
indirectly via the multiset match in `phaseOwnedMemberIndices` for a
different purpose (deciding whether a repeated member is "new"). The work
history states rule (g) is unaffected because it computes structural
distinctness independently from spec and head-state document text
(section 2.3 table), which I did not independently verify for the
patch-content case. Flagging as a related but UNVERIFIED avenue, not part
of CR-001's reproduced claim.

## Findings summary

| id | severity | status | reachability |
|---|---|---|---|
| CR-001 | MEDIUM | REPRODUCED (end-to-end through `runRedWitnessGate`, plus an isolating control) | shipped `src/gates/red-witness.ts` + `src/witness/spec.ts`; `kind:"patch"` members exist in the shipped `witness/` corpus today; any future phase editing a patch member's referenced file's content while separately touching that spec's JSON, with the `patch` path unchanged, silently escapes rule (d)'s "must intersect the diff" obligation for that member |

No other finding rose to a severity worth recording as a `CR-nnn` row. Two
items are worth naming as sub-blocking observations, both already flagged
by the work history itself and independently confirmed rather than newly
found by me:

- The work history's own section 7.7 "tracked finding" (the red-witness
  gate's spec-corpus listing walks the RUN tree while everything else
  reads the audited head) is real, tracked by the implementer, and
  correctly not acted on per DR-0027 rule 2 (reachable only by someone
  deliberately running the gate with a head differing from their working
  tree). I read the code confirming the description
  (src/gates/red-witness.ts:246's `listWitnessSpecFiles(witnessDir)` walks
  a filesystem path, not a git object) and did not find reason to disagree
  with "tracked, not blocking."
- `scripts/m2-exit-test.sh`'s worktree change is `scripts/`, tracked-only
  per DR-0027 rule 1's table and the brief's own instruction. I found no
  defect in it (see "Verified claims" above) but did not give it the same
  depth of adversarial probing as CR-001, consistent with its tier.

## What my review did NOT cover

1. **Rule (g)'s interaction with the CR-001 gap**, as stated just above:
   whether the content-blindness of `canonicalMember` for `patch` members
   also lets a phase sneak a "new" member past rule (g)'s
   structural-distinctness / duplicate-refusal check, or the reverse
   (wrongly refusing a genuinely new member). Not measured.
2. **Rule (f) and the coverage computation's use of `memberTouchedFiles`
   for `patch` members**, beyond reading the work history's own section
   2.3 table and finding its reasoning about rule (f) not being gated on
   `phaseOwn`/`phaseOwnedMembers` consistent with the code I read. I did
   not build an independent adversarial probe against rule (f) the way I
   did for rule (d).
3. **`scripts/` and `.github/` outside `scripts/m2-exit-test.sh`'s specific
   diffed hunk**, and `.github/workflows/gates.yml`'s `--phase` derivation
   claims (quoted from the work history, not independently re-read by me
   against the workflow file).
4. **The registry gate bundle** (`tiphys gates run --registry
   gate-registry.yaml --mode full ...`), the work history's section 6
   table. I attempted to reproduce it but the run exceeded my working
   budget for this pass (two 2-minute-timeout foreground invocations; the
   first left a stale claim file on its evidence directory, which I
   cleaned up rather than chase further). I instead relied on: (a) my own
   direct, narrower probes against `runRedWitnessGate` and
   `computePhaseDiff` for the red-witness-specific claims, which is
   stronger evidence for those specific claims than a bundle summary line
   would be, and (b) the full `npm test` run (826/826 pass, 0 skipped,
   toolchain node v26.6.0, `dist/` built, invocation `npm test`), which I
   DID complete. The registry bundle's other 14 gate rows (manifest,
   coverage, credential-scrub, etc.) are UNVERIFIED by me and taken on the
   work history's word.
5. **The `push` arm of the gates workflow and the post-merge push run**,
   same scope the work history itself declares open (its section 9 items
   5 and 7); T-009 binds and I have nothing additional to add here.
6. **macOS.** Not measured, consistent with the work history.
7. **Whether the `dangerousStates`-mismatch mechanism (file-granular fact,
   member-granular obligation) recurs anywhere the work history's `src/`-
   only grep could not see** (`scripts/`, `.github/`, outside the one file
   I spot-checked). I re-ran the identifier grep unscoped and it does not
   leave `src/`+`test/`, which narrows but does not close this; a
   differently-shaped reimplementation of the same mismatch pattern
   outside `src/` would not be caught by either the work history's search
   or mine.
8. **`test/checks.test.ts` and other test files touching
   `dangerousStates`** (surfaced by my own unscoped grep) were not read in
   detail; I confirmed they exist and did not audit their content for the
   granularity-mismatch shape.
9. I did not review `delivery/work-history/witness-ownership-scoping.md`
   for compliance with every CLAUDE.md convention (ASCII/control-character
   cleanliness, em-dash-freedom, etc.) beyond the citation and claim-grep
   checks reported above; I read it for content and evidentiary support,
   not for house-style conformance.



