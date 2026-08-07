# Clean-Room DELTA Re-Review: M2-P5 Fix Round 1 (criteria/regression)
Started: 2026-08-06T15:21:16Z
Branch: claude/m2-p5-citation-linter
Reviewer role: criteria/regression contract, following CR-1245 findings

## Status: IN PROGRESS

## Setup
- Repo attached via `add_repo` already present. Fetched origin main,
  claude/m2-p5-citation-linter, claude/m2-phase-reviews.
- Created detached worktree at
  scratchpad/m2-fanout/m2-p5/rereview-criteria/repo checked out to
  origin/claude/m2-p5-citation-linter. `git rev-parse HEAD` = 2d7efc3.
  Matches the target sha exactly (2d7efc39ed08fc1e3f31436e967a56c6832f24a0
  is the full sha).
- `git merge-base --is-ancestor origin/main HEAD` succeeds: branch IS
  current with main (HEAD is a merge commit onto origin/main = e1390f3).
  NOTE: local ref `main` in this worktree is STALE (bcefc98, an M1-era
  commit inherited from the shared checkout's fetch history) -- all scope
  and gate commands below use `origin/main` explicitly, never bare `main`.
- Read CLAUDE.md, delivery/plan/kernel-plan-m2.md M2-P5 section (lines
  362-393, criteria 1-9), phase-declarations/m2-p5.json, arbitration-m2-p5.md,
  clean-room-m2-p5-criteria.md (round-zero criteria review), full
  delivery/work-history/m2-p5.md (1448 lines), full src/gates/citations.ts
  (1456 lines).
- Floor toolchain confirmed present at scratchpad/toolchain/node-v26.6.0-linux-x64/bin
  (node --version: v26.6.0). Default toolchain: /opt/node22/bin, v22.22.2.
  Wrapper scripts run-floor.sh / run-default.sh (cd + exec) used throughout
  because the sandbox rejects compound cd/export/env invocations in this
  worktree-isolated agent.

## Gates
- `npm ci` floor toolchain: exit 0, no EBADENGINE (correct, floor satisfies
  the declared >=26).
- `npm run build` floor toolchain: exit 0; `git status --porcelain` after
  build: EMPTY (clean).
- Required green derivation, re-run independently (not copy-pasted):
  `node src/gates/citations.ts --result ... --evidence ... --base origin/main --head HEAD`
  -> `citations: green (3 citations resolved)`, exit 0, units 3, matches
  the work history's own captured derivation exactly.

## Scope
- `git diff --name-status origin/main...HEAD` (using origin/main, NOT the
  stale local `main`): exactly 6 files --
  delivery/work-history/m2-p5.md (A), gates.manifest.json (M),
  src/gates/citations.ts (A), src/gates/schemas/citation-config.schema.json (A),
  test/behaviors.json (M), test/citation-gate.test.ts (A).
  All 6 are on phase-declarations/m2-p5.json's filesToTouch (5 entries) plus
  the work-history standing extra. declaredExtras: [] (consistent, none used).

## Registry (test/behaviors.json)
- Current HEAD: 248 keys. origin/main baseline: 209 keys.
- Diff script (removed/retitled/added computed programmatically): removed=0,
  retitled=0, added=39, all 39 added keys are citation-prefixed.
  2 pre-existing "self-check" keys present (came in via the origin/main
  merge, not added by this phase) -- consistent with "merged
  gate-self-check-* present, none removed/retitled".
- All 39 citation-* keys' titles resolve EXACTLY (string match) to test
  titles found in test/citation-gate.test.ts; reverse check: all 39 titles
  found in the source file are registered (1:1, no orphan test, no orphan
  registry entry).
- `node --test test/citation-gate.test.ts`: 39/39 pass, 0 fail (floor
  toolchain, TAP reporter).
- Duplicate-key / conflict-marker check on the merged test/behaviors.json:
  248 raw `"key":` lines == 248 parsed keys (no duplicate key names); no
  `<<<<<<<`/`=======`/`>>>>>>>` leftover conflict markers.

## Criteria re-execution (all 9, independently, not trusting the work history)

Each re-run by calling the exported functions directly via a computed-URL
dynamic import of src/gates/citations.ts (crit1235.mjs, crit4.mjs, crit6.mjs,
setup-c9*.sh), or the registered CLI end to end in scratch git repos.

1. **HOLDS.** `resolveCitation` on real tokens: `src/cli.ts:1` -> `resolved`;
   `src/cli.ts:999999` -> `unresolved`, "is out of range: src/cli.ts has 49
   line(s)"; `src/nope.ts:1` -> `unresolved`, "cites a file that does not
   exist (src/nope.ts)". Three directions, all correct.
2. **HOLDS.** `src/gates/citations.ts:1-40` -> `resolved`;
   `src/gates/citations.ts:1-999999` -> `unresolved`, "is out of range:
   src/gates/citations.ts has 1456 line(s)". Both directions.
3. **HOLDS.** Computed the real sha256 of `src/cli.ts` line 1
   (`0fa5d2e6...4701`) and cited it with the matching suffix -> `resolved`;
   flipped the last hex digit -> `unresolved`, "content hash mismatch:
   recorded ...4700, computed ...4701". Both directions.
4. **HOLDS, re-verified against the REAL kernel-plan-v1.md.** `extractCitations`
   on the real file finds 9 `bin/fm-*` tokens (matches the round-zero
   review's own count). WITH `externalRoots` = the firstmate config: all 9 ->
   `unverifiable-external`, "matches external root firstmate, not present in
   this checkout". WITHOUT `externalRoots` (`[]`): all 9 -> `unresolved`,
   "matches no declared root (local or external)" -- note this detail STRING
   changed since round zero (was "cites a file that does not exist" against
   this repo's own then-`bin/**` local root; CR-1022's fix round narrowed the
   local root to `bin/*.ts`, so `bin/fm-lock.sh` no longer matches ANY local
   root either). Both directions still land on a `red`-eligible `unresolved`
   outcome and the plan's own words ("red as unmatched") if anything now
   match MORE precisely than round zero's actual detail string did.
5. **HOLDS.** Config with two local roots both matching `src/**`:
   `findAmbiguousGlobs` returns `[{glob:"src/**", roots:["dup","kernel"]}]`;
   `runCitationsGate` on that config -> `error`, "citation config declares
   glob(s) under more than one root, never guessed: \"src/**\" in dup,
   kernel". Config error, never guessed.
6. **HOLDS, five directions (three original + two new).** Direct
   `analyzeDocument` calls: (a) zero citations, required doc ->
   `vacuousGuardFires: true`; (b) one valid citation, required doc ->
   `false`; (c) zero citations, non-required doc (`delivery/STATE.md`) ->
   `false`, contributes zero units; (d) ONLY a backtick-quoted citation,
   required doc -> STILL `true` (quoted excluded from `substantiveCount`);
   (d2) ONLY a fenced-code-block citation, required doc -> STILL `true`;
   (e) ONLY a self-referential citation, required doc -> STILL `true` (self
   excluded from `substantiveCount`). This directly confirms M2-D-22's
   "quoted/self tokens do not count toward the vacuous guard" for the guard
   specifically, independent of the mutation tests below.
7. **HOLDS with one explained discrepancy (see Finding CR-R2, below).**
   Fresh `inventoryDeliveryTree(repo)` run: 92 documents, totals
   361/316(resolved incl. self)/36(unresolved)/9(ext). The work history's
   printed table sums to 333/288/36/9 (excluding its own row, as the table
   itself states). Row-by-row diff against the committed table: 90 of 91
   parsed rows match EXACTLY; the sole mismatch is
   `delivery/work-history/m2-p1.md` (table: 68/53/15/0, fresh: 93/78/15/0).
   Root cause, verified: that file did not exist in this branch when the
   table was captured (commit `6b7f287`); it arrived via `origin/main`
   commit `e1390f3` ("M2-P1 fix ...", landed on main AFTER the table was
   written) and entered this branch only through the merge commit `2d7efc3`
   (`Merge remote-tracking branch 'origin/main' ...`) that was performed
   AFTER the fix round's own last content commit `963cbde`, evidently to
   bring the branch current with main for this review. The table was never
   recomputed after that merge. `361 = 333 (table sum) + 3 (this file's own
   fresh row) + 25 (the m2-p1.md delta)`, confirmed arithmetically.
8. **HOLDS for this phase's own suite** (`test/citation-gate.test.ts`:
   39/39 pass, 0 fail, both toolchains). The REPOSITORY-WIDE `npm test` has
   one failing test, but it is a pre-existing real-clock flake in a file
   this phase never touches (see Gates, full suite, below) -- not a
   "citations" registration failure and not attributable to this phase.
9. **Functionally closed but the PLAN'S LITERAL WORDING no longer describes
   the delivered mechanism -- see Finding CR-R1, below.** Reproduced
   end-to-end in two fresh scratch git repos:
   - A FIFO placed on disk at a path that IS a diff-named document (same
     relative path as a committed, changed `.md` file) is completely
     IGNORED by the registered gate: both "before mkfifo" and "after mkfifo"
     runs return IDENTICAL `green`, `units:1` results, because content is
     read via `git cat-file <head>:<path>`, never from the working tree.
     (`setup-c9.sh`, reproduced independently, not copied from the work
     history.)
   - Citing a git TREE object (a directory literally named `weird.md`) as a
     target DOES trigger the M2-C-6-equivalent defense on the new
     substrate: `error`, exit 21, "... is a git tree object, not a blob
     (regular file), so it was not read", bounded (`GIT_TIMEOUT_MS = 30000`
     on every `spawnSync`). (`setup-c9c.sh`, independently reproduced.)
   So the ORIGINAL FIFO-in-the-working-tree hazard (M1-P5's CR-520 class)
   is genuinely closed for the registered gate -- more strongly than
   before, since it is now structurally immune rather than merely refused
   -- but via a DIFFERENT observable outcome (`green`/ignored, not
   `error`/refused) than criterion 9's own sentence describes ("the gate
   reports error naming the path and the observed type"), and via a
   DIFFERENT mechanism (`gitObjectType`/`readGitBlob`, a new probe-then-read
   implementation for the git-object substrate) than its second clause
   describes ("the reads route through the delivered `classifyEntry`",
   which is now true ONLY for the one-shot inventory's filesystem walk, not
   for the registered gate's document/citation reads). The one-shot
   inventory's OWN FIFO defense (`walkDocuments` throwing via
   `classifyEntry`) is unchanged and still literally matches the plan.

## Mutation testing (two of the new guards)

Baseline sha256 of `src/gates/citations.ts`:
`b9f140de0bf3af197a4b30f60bcac92b1dde83ea5592c5493e5584fc94751c2f`.

| # | mutation | mechanism targeted | tests reddened | restore verified |
|---|---|---|---|---|
| 1 | `isWithinRanges` forced to `return false` unconditionally (single early line inserted) | M2-D-22 quoted/fenced exclusion (the ONE choke point both call sites share) | 2 structurally different: `a document that both MAKES and QUOTES a bad citation reds only on the made one (arbitration's red witness)` (registered-gate CLI test) AND `the one-shot inventory excludes quoted citations from its counts (M2-D-22 applies uniformly)` (inventory test) -- 37/39 pass, 2 fail | sha256 identical to baseline after revert |
| 2 | `isTouched` forced to `return true` unconditionally (single early line inserted) | M2-D-21 hunk-scope selection | 2 structurally different: `a pre-existing bad citation the PR does not touch is never the PR's failure (M2-D-21, dissolves CR-1016)` (registered-gate CLI test) AND `analyzeDocument separates resolved, self-resolved, unresolved and unverifiable-external counts, hunk-scoped by the touched parameter` (direct unit test) -- 37/39 pass, 2 fail | sha256 identical to baseline after revert |

Note on mutation 2: re-running the required green derivation
(`--base origin/main --head HEAD`) under this mutation still returned
`green (3 citations resolved)`, i.e. it does NOT reproduce CR-1015's original
red. This is expected and does not weaken the mutation test: CR-1015 (the
work history's own citation-shaped strings) is dissolved primarily by
M2-D-22 (they are backtick-quoted) for this specific diff, since the file is
wholly new so every line is already "touched" whether hunk-scoping works or
not; M2-D-21's hunk-scope mechanism is independently and adequately killed
by the two unit/integration tests above, which is the class the arbitration
actually asked to be witnessed (CR-1016, not CR-1015).

## Gates, full suite, both toolchains (background runs, `npm test`'s own glob `test/**/*.test.ts`)

- Floor toolchain (Node v26.6.0): 242 total, 241 pass, **1 fail**, 0
  skipped, `duration_ms 230163`.
- Default toolchain (Node v22.22.2): 242 total, 239 pass, **1 fail**, 2
  skipped (floor-gated, per CLAUDE.md warning 1), `duration_ms 246794`.
- The ONE failure on BOTH toolchains is test 124, `test/liveness.test.ts:633`,
  "doctor and the guard return one verdict about one beacon": asserts an
  exact beacon-age string; observed `age 14s` against an expected
  `/age 13s/` pattern. Re-ran in isolation three times: reproduced
  identically (`age 14s`) every time in this environment, consistent with a
  tight real-clock tolerance, not a deterministic defect -- and identical in
  shape/file/assertion to the flake both round zero's and this round's own
  work history already documented. `git diff --stat origin/main...HEAD --
  test/liveness.test.ts test/watcher.test.ts src/liveness.ts src/watcher.ts
  src/commands/doctor.ts` is EMPTY: this phase touches none of these files.
- **Better than the work history's own last-recorded numbers**: round zero's
  Findings A and B (`test/gates.test.ts:1289` and `test/gates.test.ts:2378`)
  are BOTH `ok` (passing) on this exact head, on both toolchains, confirmed
  by grepping their exact test titles in the captured TAP output. This
  matches the work history's own "Post-round discovery" section (origin/main
  commit `e1390f3` fixed both upstream) and the fact that this exact head
  (`2d7efc3`) is a merge of that commit into the branch (confirmed above under
  Setup) -- something the branch's own last content commit (`963cbde`)
  predates and could not have measured.
- No watcher.test.ts flakes appeared in either run this time (host had less
  contention); their absence here is not evidence the flake class is closed,
  consistent with CLAUDE.md warning 11.

## Findings

**CR-R1 (MEDIUM): plan criterion 9's literal text no longer matches the
delivered mechanism; needs a plan amendment, not a fix round.**
Evidence: see criterion 9 re-execution above (setup-c9.sh, setup-c9c.sh,
both independently reproduced, output captured). The FIFO-in-working-tree
case now returns identical `green` results before and after staging the
FIFO (immune, not merely refused), contradicting the plan's own sentence
"the gate reports error naming the path and the observed type"; and the
"reads route through the delivered classifyEntry" clause is now true only
for the one-shot inventory, not the registered gate (which reads via the new
`gitObjectType`/`readGitBlob` pair). This is a disclosed, deliberate,
reasoned consequence of CR-1017's fix (the module's own doc comments name it
explicitly), and the underlying hazard-defense goal (M1-P5's CR-520 class
applied to a gate) is genuinely met -- arguably more strongly, since the
threat is structurally unreachable rather than merely refused, and the
equivalent hazard on the new git-object substrate (a TREE or COMMIT object
where a blob is expected) is independently confirmed closed. Recommend: the
orchestrator write a plan amendment for M2-P5's criterion 9 (parallel to the
M2-D-21/M2-D-22 amendments arbitration already promised), documenting the
FIFO-immune / tree-object-error split, rather than sending this back for a
fix round that would have to reintroduce a filesystem read (a second
implementation of M2-C-6, exactly what T-005 warns against) purely to
satisfy the old wording.

**CR-R2 (LOW, evidence-integrity, not code): the CR-1001-corrected inventory
table has one further stale row, for a reason outside this phase's own
commits.** Evidence: inv-check.mjs output above. `delivery/work-history/
m2-p1.md`'s row (68/53/15/0 in the committed table) does not match a fresh
re-run (93/78/15/0); all other 90 rows match exactly, and the delta is fully
explained arithmetically and by git history: that file's addition landed on
`origin/main` (commit `e1390f3`) after this round's table-capturing commit
(`6b7f287`), and reached this branch only through a later merge (`2d7efc3`)
that post-dates the round's own last content commit. Not a citations.ts
defect (the gate's resolution logic for this file's real citations is
correct, confirmed by the fresh run itself); not attributable to the
implementer's own workflow within the round (the merge that introduced the
staleness happened after the round's work was complete). Recommend noting
this explicitly in the work history or accepting it as tracked, exactly as
CR-1027 was disposed.

## Verdict: APPROVE

No high finding. No finding that risks a broken gate or the milestone: the
registered `citations` gate is demonstrably correct end to end (required
green derivation reproduced independently; all 9 criteria functionally hold;
two structurally-different mutation tests killed on both of the round's new
mechanisms; scope and registry clean; full suite green on both toolchains
except one pre-existing, out-of-file real-clock flake, and even that is
BETTER than the round's own last recorded numbers because Findings A and B
are now resolved via the main merge). The two findings above (CR-R1 medium,
CR-R2 low) are documentation/evidence-artifact gaps that do not require
another fix round: CR-R1 needs a plan-text amendment (not a code change) and
CR-R2 is a reporting-only table row, fully explained, affecting nothing the
registered gate enforces.

## Probes run (including empty-handed ones)

- Checked for git conflict markers and duplicate JSON keys in the merged
  test/behaviors.json: none found.
- Attempted to force CR-1021's "vanish race" branch (a path
  `gitChangedDocuments` names but `readGitBlob` reports missing) via the
  same two-scratch-repo construction the fix round used: did not attempt a
  concurrent `git update-ref` (the work history's own open question); not
  independently re-attempted here either, left as the same open question,
  not upgraded to "cannot happen" in this report.
- Checked whether the default-toolchain run picked up any node_modules
  incompatibility from being installed under the floor toolchain: `npm run
  build` was only run under the floor toolchain; the default-toolchain full
  suite ran directly against already-built `dist/` and the same
  `node_modules`, consistent with this project's TS-native-execution model
  (no native addons); no anomaly observed.
- Did not attempt to re-derive M2-C-2's `makeGateResult` zero-units
  constructor rule or the M2-P1 `decideAggregate` ordering (deviation (c) in
  the round-zero criteria review); out of scope for M2-P5 per the
  arbitration's own "escalated to its own item" section, not re-litigated
  here.
- Did not attempt to reproduce the watcher.test.ts real-clock flakes (they
  did not appear in either of my two full-suite runs); this is consistent
  with them being load-dependent flakes, not evidence the class is closed.

## Status: COMPLETE
