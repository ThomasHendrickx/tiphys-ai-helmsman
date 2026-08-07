# Clean-room adversarial review: citations scope exclusion (PR #28)

Branch: claude/citations-scope-dr0019
HEAD: 0ed6a84
Reviewer: independent clean-room agent (in progress, beacon file, appending as work proceeds)

Status: STARTING. This file will be appended incrementally.

## 0. Scope of review
Hazards to check:
1. Witness validity (red-witness gate, two structurally different patch members)
2. Config/manifest sync completeness (grep derivation of all citation tree enumerations)
3. Harness N/A legitimacy (m2-exit-test.sh pr bundle)
4. Anti-fabrication / claim grep + ASCII/em-dash check + 139 sum check
5. Any other hazard (over-broad exclusion, decorative test, scope creep, fabricated owner sign-off)

## 1. Diff overview (verified against actual diff, not the prompt's summary)

`git diff main HEAD --stat`:

```
 .../m2-citations-scope/red-under-old-config.txt    | 157 +++++++++++++++++++++
 delivery/work-history/m2-citations-scope.md        |  77 ++++++++++
 gates.manifest.json                                |   2 -
 src/gates/citations.ts                             |  21 ++-
 test/behaviors.json                                |   3 +-
 test/citation-gate.test.ts                         | 124 ++++++++++++++--
 .../captures/citation-git-cat-file-resolution.txt  |  18 +++
 witness/citation-record-doc-not-gated.json         |  25 ++++
 witness/patches/citation-readd-review.patch        |  12 ++
 witness/patches/citation-readd-work-history.patch  |  12 ++
 10 files changed, 430 insertions(+), 21 deletions(-)
```

`src/gates/citations.ts`: removes `delivery/review/**/*.md` and
`delivery/work-history/**/*.md` from `DEFAULT_CITATION_CONFIG.documents`,
and removes `delivery/review/**/*.md` from `citationRequired`. Adds a large
doc-comment justifying this as an orchestrator operational decision under
DR-0015 (not an owner decision).

`gates.manifest.json`: removes `"delivery/review/"` and
`"delivery/work-history/"` from the `citations-diff-touches-documents`
precondition's `paths` array (the gate's applicability precondition, i.e.
what diff makes the citations gate "required" at all).

Confirmed matches the prompt's summary. No changes found outside this
file list.

## 2. Fabricated owner sign-off / delivery/decisions/ check (item under "critical" framing)

```
$ git diff main HEAD --stat -- delivery/decisions/
(no output)
$ git diff main HEAD | grep -n "DR-0019"
(no output)
$ grep -rn "DR-0019" . --include='*.md' --include='*.ts' --include='*.json' 2>/dev/null | grep -v node_modules
(no output)
```
VERDICT: delivery/decisions/ untouched by this diff, and no reference to a
fabricated "DR-0019" survives anywhere in the tree at this HEAD. The
citations.ts comment explicitly frames this as "Orchestrator decision ...
under DR-0015; the owner delegated this scope call and is not an approval
step in execution; reversible, owner may override" -- i.e. it does NOT claim
owner sign-off. Severity: NONE (hazard ruled out, confirmed clean).

## 3. Hazard 1: WITNESS VALIDITY (most important)

`witness/citation-record-doc-not-gated.json` declares `dangerousStates`
as two patches (`citation-readd-review.patch`, `citation-readd-work-history.patch`),
`repeats: 2`, `class: additive`.

### 3a. red-witness gate run (floor toolchain, node v26.6.0)

```
$ export PATH=".../toolchain/node-v26.6.0-linux-x64/bin:$PATH"
$ node --version
v26.6.0
$ BASE=$(git rev-parse main)   # 8cadeac5562f83fdb2453cfec4fe84c113a0e517
$ HEAD=$(git rev-parse HEAD)   # 0ed6a848008b3d44ebd31b44194cf79666a39784
$ node src/gates/red-witness.ts --base "$BASE" --head HEAD --result /tmp/rw.json --evidence /tmp/rwev
red-witness: green (1 witness(es) evaluated (1 own, 0 stored re-evaluated in 0ms);
every witness red against every declared dangerous state and green at head)
$ echo $?
0
```

`/tmp/rwev/witness-records.json` per-member detail (extracted with a script):

```
member index 0 patch witness/patches/citation-readd-review.patch
  run1 exitCode 1 red True (failed the named test)
  run2 exitCode 1 red True (failed the named test)
  run3 exitCode 0 red False (head, passed)
member index 1 patch witness/patches/citation-readd-work-history.patch
  run1 exitCode 1 red True (failed the named test)
  run2 exitCode 1 red True (failed the named test)
  run3 exitCode 0 red False (head, passed)
```

Both declared dangerous states reddened on BOTH repeats and the head build
is green, exactly matching `repeats: 2`.

### 3b. Independent manual reproduction (not just trusting the gate's own report)

To rule out the gate itself mis-reporting, I extracted HEAD via
`git archive HEAD | tar -x` into three isolated scratch trees
(`head`, `patch-review`, `patch-wh`), applied each patch with `patch -p1`
(clean apply, no fuzz), and ran the named test directly with
`--test-name-pattern`:

```
$ cd patch-review && node --test --test-name-pattern "a record doc" test/citation-gate.test.ts
X ... failing tests:
  AssertionError [ERR_ASSERTION]: review: {"gate":"citations", ...,
    "evidence":["delivery/review/rec.md"],"status":"red", ...,
    "detail":"delivery/review/rec.md: src/nope.ts:999 cites a file that does
     not exist (src/nope.ts)"}
  + actual 'red'  - expected 'not-applicable'

$ cd patch-wh && node --test --test-name-pattern "a record doc" test/citation-gate.test.ts
X ... failing tests:
  AssertionError [ERR_ASSERTION]: work-history: {"gate":"citations", ...,
    "evidence":["delivery/work-history/rec.md"],"status":"red", ...,
    "detail":"delivery/work-history/rec.md: src/nope.ts:999 cites a file that
     does not exist (src/nope.ts)"}
  + actual 'red'  - expected 'not-applicable'

$ cd head && node --test --test-name-pattern "a record doc" test/citation-gate.test.ts
tests 1, pass 1, fail 0
```

This is the strong form of the red-witness rule satisfied: each patch fails
the test **for its own record tree specifically** (the failure's `evidence`
and `detail` fields name `delivery/review/rec.md` under one patch and
`delivery/work-history/rec.md` under the other, both because status flipped
to `red` when that tree became a gated document again). It is not one patch
happening to break the test for an unrelated reason. The two members are
structurally different (different directory, different DEFAULT_CITATION_CONFIG
list entry re-added), satisfying "one witness is not a class" / CLAUDE.md's
requirement that a class-witness redden under at least two structurally
different members.

Additionally the test itself (independent of the witness patches) directly
asserts the forward-doc contrast (`delivery/plan` still reds on the identical
citation shape) inside the same test body, which is the "gate is scoped, not
gutted" check called for in the code comment.

**Verdict: witness is VALID, not vacuous. Severity: NONE (hazard ruled out).**

## 4. Hazard 2: CONFIG/MANIFEST SYNC COMPLETENESS

Derivation command (every enumeration of a delivery-tree glob/path in
`src/` and the manifest):

```
$ grep -rn "delivery/" src/gates/*.ts src/*.ts gates.manifest.json
```

Full output (only lines that enumerate delivery/review or
delivery/work-history, or that are part of the citations config lists,
reproduced above in section 1) plus the complete list of delivery-tree
mentions in `src/`:

- `src/gates/citations.ts`: `DEFAULT_CITATION_CONFIG.documents` (line ~232-239)
  and `.citationRequired` (line ~240-242) -- the only two lists this gate
  reads for its own policy. Both updated (review and work-history removed
  from `documents`; review removed from `citationRequired`; work-history was
  never in `citationRequired` before this change, so nothing to remove there).
- `gates.manifest.json`: `citations-diff-touches-documents` precondition's
  `paths` array (the ONLY `diff-touches` precondition anywhere in the
  manifest that mentions delivery/review or delivery/work-history --
  confirmed by `grep -n '"id"\|"kind": "diff-touches"\|"paths"' gates.manifest.json`,
  which shows exactly one `citations` gate entry and one `red-witness` gate
  entry with `diff-touches`; red-witness's precondition paths are
  `["src/", "bin/"]`, unrelated to delivery trees). Updated to match.
- `src/gates/scope.ts:739`: `delivery/work-history/${phase}.md` is a
  **different mechanism** (the scope-audit's per-phase pre-authorized-extras
  list, unrelated to the citations gate's document set) and is correctly
  untouched; it still means "each phase's own work-history file is an
  allowed touch", independent of whether citations treats work-history as a
  citable document.
- `src/gates/schemas/phase-declaration.schema.json:28`: same scope-audit
  mechanism, prose description only, untouched, correct.
- `src/gates/suite.ts:371,380`, `src/pool.ts:24`, `src/watcher.ts:162`,
  `src/gates/citations.ts:26,32` (its own doc-comment history): these are
  all **prose citations to specific historical documents** (pointing at a
  particular work-history/review file as a comment/rationale reference),
  not enumerations of the citations gate's tree-level policy. They are
  unaffected by whether the tree is gated for FUTURE drift-checking.
- Full repo-wide grep for `delivery/review` and `delivery/work-history`
  outside `delivery/` itself (`grep -rln ... . | grep -v '^./delivery/'`)
  additionally surfaced `test/exit-test-local.test.ts`,
  `test/scope-gate.test.ts` (scope-audit standing-extras fixtures, unrelated
  mechanism), `test/suite-gate.test.ts`, `test/release-contract.test.ts`
  (prose references to specific historical work-history files),
  `test/witness.test.ts` (prose reference to a specific historical review
  doc used as an assertion string, not a citations-config assumption), and
  `test/behaviors.json` / `test/citation-gate.test.ts` (covered separately),
  and `dist/**` (build output, not authored, will regenerate on next build).
  None of these encode a second copy of "which delivery trees does the
  citations gate treat as documents" that could now be out of sync.

**What this search did NOT cover:** it does not cover `.claude/skills/**`
(harness configuration, explicitly out of scope for the kernel's own gate
logic per CLAUDE.md's "not a kernel deliverable" framing) or any config
outside `src/`, `gates.manifest.json`, and `test/`. I did not grep
`schemas/`, `roles/`, or root `tuition/` since CLAUDE.md states these are
M3 placeholders not yet populated; confirmed empty/placeholder-only:

```
$ find schemas roles tuition -type f 2>/dev/null
```
(checked separately below)

**Verdict: the two loci (citations.ts config, gates.manifest.json
precondition) are the only places that encode this policy, and both are
updated consistently. Severity: NONE for the mechanism this hazard names.**

## 5. Hazard 3: HARNESS N/A LEGITIMACY

Command run exactly as specified (with the floor toolchain on PATH):

```
$ BASE=$(git rev-parse main); HEAD=$(git rev-parse HEAD)
$ PHASE=$(printf '%s' claude/citations-scope-dr0019 | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')
$ echo "$PHASE"
claude/citations-scope-dr0019      # <-- the sed does NOT match (branch has no mN-pM), so
                                    #     PHASE ends up being the whole branch name unchanged
$ scripts/m2-exit-test.sh --no-build --bundle pr --base "$BASE" --head "$HEAD" --phase "$PHASE" /tmp/exitrev2
m2-exit-test: recorded (observation: scope expectation resolved for this run)
gates: run fa0fe960e69bb4ca9d7da170
gates: declared 10 applicable 5 verdict 5 green 5 red 0 not-applicable 5 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope
m2-assert (PR bundle): OK. 10 gate record(s) match section 1.4; counts re-derived and equal
to summary.json; zero error; zero vacuous.
m2-green: red-witness GREEN with 4 unit(s) against M2-P2 merged diff 1b6f0963b62f^..1b6f0963b62f (real history)
m2-green: scope GREEN with 2 unit(s) against scratch repo: declaration governs claude/m2-p4-scope-auditor, ...
m2-green: citations GREEN with 1 unit(s) against scratch repo: changed delivery/plan/fixture.md cites src/target.ts:1 which resolves
m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
m2-exit-test: OK. evidence in /tmp/exitrev2
$ echo $?
0
```
Ran twice for reproducibility (first under `run_in_background`/nohup as
PID 14447 with the same result, then again in foreground to capture the
exit code directly): both runs exit 0, identical gate verdicts.

### 5a. Is "citations not-applicable" here a real evaluated precondition or the bad shape?

`/tmp/exitrev2/pr-bundle/citations/result.json`:
```json
{
  "gate": "citations",
  "status": "not-applicable",
  "detail": "precondition citations-diff-touches-documents evaluated and unmet: no changed path under delivery/plan/, delivery/verification/, delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md",
  "precondition": {
    "id": "citations-diff-touches-documents",
    "met": false,
    "reason": "no changed path under delivery/plan/, delivery/verification/, delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md"
  }
}
```
This is the GOOD shape DR-0018 requires: a structured `precondition{id, met:false,
reason}` object, not a bare "no changed path" status with nothing evaluated.
The reason string correctly reflects the UPDATED document list (review and
work-history already absent), i.e. it is self-consistently derived from the
post-change config, not stale. This is expected and legitimate: this PR's own
paperwork lives in `delivery/work-history/` and `delivery/evidence/`, both
excluded from `documents`, so the PR's own diff genuinely touches none of the
still-gated trees.

I confirmed `scripts/m2-exit-test.sh`'s assertion code (`m2-assert.mjs`,
generated fresh each run, not part of this PR's diff) actually enforces this
rather than rubber-stamping: it contains an explicit check (read at
`/tmp/exitrev2/m2-assert.mjs` around the diff-scoped-gate section) that
`fail()`s when a diff-scoped not-applicable lacks an evaluated
`precondition{id, met:false, reason}` object, citing DR-0018 by name in the
source comment. citations is declared `"expect": "green|not-applicable"`,
`"diffScoped": true` in the harness's own expectation table
(`scripts/m2-exit-test.sh` line 836) -- pre-existing standing infrastructure,
NOT modified by this PR (confirmed: `scripts/m2-exit-test.sh` does not
appear in `git diff main HEAD --stat`).

### 5b. Is "scope not-applicable" here legitimate, not a loophole?

`/tmp/exitrev2/pr-bundle/scope/result.json` detail:
`"precondition scope-branch-is-a-phase-branch evaluated and unmet: branch
claude/citations-scope-dr0019 does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$"`.
The harness's `resolve_scope_expect` function (scripts/m2-exit-test.sh,
around line 1113-1127) derives its OWN expectation independently from the
actual checked-out branch name via `git rev-parse --abbrev-ref HEAD`, not
from the (possibly-garbage) `--phase` flag value, and its comment states
explicitly: "scope is required GREEN only on a PHASE-branch run; on a
non-phase run scope is legitimately not-applicable ... a phase-branch scope
N/A still FAILS." Since `claude/citations-scope-dr0019` is genuinely not a
`claude/mN-pM-*` phase branch (this change is explicitly an orchestrator
operational decision under DR-0015, not a plan phase), this not-applicable
is the correct, honestly-derived outcome, and the mechanism would have
caught a phase-branch scope N/A as a failure had this been one.

**Verdict: harness N/A legitimacy confirmed for both citations and scope.
Severity: NONE.**

## 6. Hazard 4: ANTI-FABRICATION / CLAIM GREP

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m2-citations-scope.md
13:  fabricated file never reached `main`.
39:record; its references were valid when the reviewer wrote them and were never
```

Both hits inspected:
- Line 13, "The fabricated file never reached main": VERIFIED true as a
  literal git fact for `main` as it stands: `git log main --oneline -- '*DR-0019*'`
  finds nothing on `main`, `delivery/decisions/` has zero diff vs `main`
  (section 2 above), and `grep -rn "DR-0019" .` finds nothing anywhere in
  the current tree. HOWEVER: the fabricated commit (`719f04f`, "M2-P5: scope
  the citations gate to forward-claiming docs (DR-0019)", which literally
  added `delivery/decisions/DR-0019-citations-scope-forward-docs.md` with a
  false "decided (owner, 2026-08-07)" status) IS an ancestor of this branch's
  HEAD (`git merge-base --is-ancestor 719f04f HEAD` succeeds) even though it
  is NOT an ancestor of `main` (`git merge-base --is-ancestor 719f04f main`
  fails). A later commit on the same branch (`f775c56`, "Re-attribute
  citations-scope change as an orchestrator decision, not a fabricated owner
  DR") deletes the fabricated file. So the claim is true FOR MAIN TODAY, but
  is contingent on the merge strategy: CLAUDE.md's `.claude/skills/phase-delivery/SKILL.md`
  section 7 mandates **squash merge** for this repository, which would fold
  `719f04f` and `f775c56` into a single commit on `main` carrying only the
  final (clean) diff, permanently keeping the fabricated commit message and
  file out of `main`'s history. If this PR were instead merged with a
  regular (non-squash) merge commit, the fabricated attribution WOULD become
  a permanent, findable part of `main`'s commit graph (via `git log --all`
  even if not via the tree at any single commit on `main`'s first-parent
  line). This is a low-severity process-dependency finding, not a defect in
  the diff under review, but the merge operator must use squash merge for
  the "never reached main" claim to remain true after this PR lands.
- Line 39, "were never authored to satisfy a strict repo-relative citation
  gate": a characterization of the historical reviewers' intent, not a
  falsifiable engineering claim about the current system; does not require a
  captured command per the claim-grep rule's spirit (it is not asserting a
  mechanism "cannot" or "always" does something).

No other absolutist claims found. The measured "139 red reasons" claim:
independently recounted from `delivery/evidence/m2-citations-scope/red-under-old-config.txt`:

```
$ grep -c "^  - delivery/.*is citationRequired and carries zero substantive citations" ... -> 20
$ grep -c "^  - delivery/.*matches no declared root" ...                                -> 107
$ grep -c "^  - delivery/.*cites a file that does not exist" ...                        -> 8
$ grep -c "^  - delivery/.*is not a recognized citation" ...                            -> 4
$ grep -c "^  - delivery/" ...  (total reason lines)                                    -> 139
```
20+107+8+4 = 139, matches the total line count exactly (a naive first pass
without anchoring to `^  - delivery/` double-counted matches against the
file's own header-summary lines, which restate the same numbers in prose;
scoping the grep to body lines only resolves this and confirms the sum is
internally consistent, not a copy-paste arithmetic error).

ASCII / no-em-dash check on every changed authored file:
```
$ for f in delivery/work-history/m2-citations-scope.md delivery/evidence/m2-citations-scope/red-under-old-config.txt src/gates/citations.ts test/citation-gate.test.ts test/behaviors.json gates.manifest.json witness/citation-record-doc-not-gated.json witness/patches/*.patch witness/captures/citation-git-cat-file-resolution.txt; do grep -nP '[^\x00-\x7F]' "$f"; done
(no output for any file -- all clean)
```

**Verdict: no unbacked absolutist claims. One process-dependency caveat
(squash-merge requirement) noted as LOW severity, not a defect in the diff.
139-sum and ASCII checks both pass. Severity: NONE for fabrication; LOW
(process note) for the merge-strategy contingency.**

## 7. Hazard 5: other hazards considered

- **Over-broad exclusion letting a forward-claiming doc escape gating**:
  ruled out. `documents` and `citationRequired` still include
  `delivery/plan/**/*.md` and `delivery/verification/**/*.md` (forward-claiming,
  still `citationRequired`), plus `delivery/decisions/**/*.md`,
  `delivery/requirements/**/*.md`, `delivery/tuition/**/*.md`, and
  `delivery/STATE.md` remain `documents`. Only `delivery/review/` (a
  post-hoc finding record) and `delivery/work-history/` (a post-hoc
  what-was-done record) are excluded, both squarely historical-record trees
  by their own definition in CLAUDE.md's table ("Review of a PR" / "What an
  implementer did and why" are retrospective, not forward claims about
  future code state). No forward-claiming tree is newly excluded.
- **Decorative/fake capture consumption**: ruled out in section 3
  (independent manual re-run of the test reproduced the exact capture-backed
  assertions and both patch failures with real, distinguishable per-tree
  failure messages, not a hand-written string).
- **Scope creep beyond what the change needs**: the diff touches exactly 10
  files, all directly required by the change (config, manifest, renamed
  test assertions to stop depending on the excluded tree, new witness +
  patches + capture, work-history, and the measured evidence file backing
  the "139" claim). No unrelated file is touched. `git diff main HEAD
  --stat` reproduced in section 1 above is the full file list; nothing
  outside it.
- **Branch/PR naming residue**: the branch is still named
  `claude/citations-scope-dr0019`, a naming leftover from the earlier
  (corrected) fabricated-DR-0019 draft. Cosmetic only; no content under that
  name survives in the diff or in `delivery/decisions/`. Severity: LOW
  (cosmetic, does not affect correctness, but a reviewer or future
  archaeologist skimming branch names could momentarily believe an owner
  decision DR-0019 exists; the work-history file at
  `delivery/work-history/m2-citations-scope.md` correctly disambiguates this
  in its first paragraph).

## 8. Summary of findings by severity

| # | Finding | Severity |
|---|---|---|
| 1 | Fabricated "DR-0019" owner sign-off: confirmed absent from `main` and from `delivery/decisions/` at this HEAD; correctly re-attributed as an orchestrator decision under DR-0015 | NONE (ruled out) |
| 2 | Witness `citation-record-doc-not-gated.json`: confirmed red under BOTH patches (distinct per-tree failure), green at head, independently reproduced outside the gate's own tooling | NONE (ruled out) |
| 3 | Config/manifest sync: only two loci encode the policy, both updated consistently; no third stale copy found in `src/`, manifest, or tests | NONE (ruled out) |
| 4 | Harness N/A legitimacy: both citations and scope not-applicable carry genuine evaluated preconditions per DR-0018's own (pre-existing, unmodified) enforcement; exit test exits 0 | NONE (ruled out) |
| 5 | Claim-grep hits: both benign; "139" sum independently reproduced; ASCII/em-dash clean | NONE (ruled out) |
| 6 | "Fabricated file never reached main" is contingent on squash-merge (mandated by this repo's own procedure) rather than an inherent property of the diff | LOW (process note) |
| 7 | Branch still named `...-dr0019`, a naming residue from the corrected draft | LOW (cosmetic) |
| 8 | Over-broad exclusion / decorative test / scope creep | NONE (ruled out) |

## 9. Overall verdict: APPROVE

This PR does exactly what it says: it removes two historical-record delivery
trees (`delivery/review/`, `delivery/work-history/`) from the citations
gate's forward-citation-resolution policy, in exactly the two places that
encode that policy (`src/gates/citations.ts` and
`gates.manifest.json`), while leaving every forward-claiming tree
(`plan`, `verification`, `decisions`, `requirements`, `STATE.md`) fully
gated and `citationRequired` where it was before. The earlier fabricated
"DR-0019" owner-decision framing was genuinely corrected on this branch
before reaching `main`, is honestly disclosed in the work-history file, and
leaves no trace in the current tree or in `delivery/decisions/`. The new
witness is a real, non-vacuous red-witness: I independently reproduced,
outside the repository's own gate tooling, that each of the two
structurally-different dangerous-state patches reddens the named test for
its own specific record tree and that HEAD passes; the harness's
not-applicable outcomes for citations and scope on this non-phase branch
both carry genuinely evaluated, DR-0018-conformant preconditions, and the
full PR-bundle exit test exits 0. The only items I could not clear to
"none" are two low-severity notes (a squash-merge dependency for the
historical claim about `main`, already true today and enforced by this
repo's own binding merge convention; and a cosmetic branch-name residue)
neither of which is a defect in the shipped diff or a reason to block merge.

