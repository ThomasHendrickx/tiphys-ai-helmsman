# Clean-room review: M3-P3 (DR-0022 option A2), supply-chain and regression lens

Reviewer: clean-room-b (supply-chain/regression lens). Head under review: 218fc12.
Worktree: wt-m3p3-a2-cr-b, branch review-a2-hazard (detached-equivalent for
scope-gate purposes; scope audit deferred to ../wt-m3p3 per instructions).

Status: COMPLETE.

## Verdict: APPROVE

Zero findings (no `CR-nnn` raised) under the supply-chain and regression
lens. Every DR-0022 supply-chain claim reproduces exactly. `commonmark`'s
introduction is clean: correctly pinned, correctly scoped to `dependencies`,
no forbidden runtime behavior on its reachable code path, no engines
conflict, ships correctly to consumers via ordinary npm resolution. The
swap that replaced the hand-rolled parser removed no test coverage, only
corrected one self-contradictory fixture assertion with cross-parser
evidence, kept `test/behaviors.json` strictly append-only, and its witness
re-anchoring reproduces under direct mutation on both the reddened and the
"judged by reading" classes, sampled independently rather than trusted from
the work history. The salvaged commit left no dead code from the replaced
parser and no scratch/probe artifacts in the tracked tree. All mechanical
gates in this lens's scope are green: build, both ASCII/control-character
checks, full suite (501/501), and scope (37/37 paths, in the correct
worktree).

## Scope of this review

Supply-chain and regression lens only. NOT covering the 40-shape exploit set,
byte-identical record comparison, or sourcepos slicing correctness (other
reviewer's contract).

## Log

- Started. node v26.6.0 confirmed, branch review-a2-hazard confirmed, cwd
  confirmed.
- `npm ci` exit 0, 14 packages added, 0 vulnerabilities.
- `npm run build` exit 0, `git status --short` clean afterward (only my own
  untracked report file present).

### 1. The dependency, measured

`package.json` `dependencies`: `"ajv": "8.20.0", "commonmark": "0.31.2", "yaml": "2.9.0"`.
All three exact-pinned (no `^`/`~`), same style. `commonmark` sits in
`dependencies`, not `devDependencies` -- correct, since `src/checks.ts` needs
it at runtime.

`npm ls --all --omit=dev`:
```
+-- ajv@8.20.0 (+4 sub-deps)
+-- commonmark@0.31.2
|   +-- entities@3.0.1
|   +-- mdurl@1.0.1
|   `-- minimist@1.2.8
`-- yaml@2.9.0
```
Exactly +4 new packages from `commonmark`, matching the DR-0022 evidence.

Sizes (`du -sb`) and licenses (from each package's own `package.json`):
| package | bytes | license | engines |
|---|---|---|---|
| commonmark@0.31.2 | 673,094 | BSD-2-Clause | `"node": "*"` |
| entities@3.0.1 | 171,119 | BSD-2-Clause | `"node": ">=0.12"` |
| mdurl@1.0.1 | 22,039 | MIT | none declared |
| minimist@1.2.8 | 54,477 | MIT | none declared |
| **total** | **920,729** | | |

Matches the DR-0022 claim (+4 packages, 920,729 bytes, BSD-2/MIT) exactly, byte
for byte. `package-lock.json` agrees with `package.json` (`"commonmark": "0.31.2"`
in both, exact, `resolved`/`integrity` present for all four new lockfile
entries; diffed with `git diff origin/main...HEAD -- package-lock.json`).

Depth: `commonmark` -> `entities`/`mdurl`/`minimist`, all three leaves. Depth 2
from the package root, matching the claim.

`engines`: package floor is `>=26`. `commonmark` declares `node: "*"` (no
restriction), `entities` declares `>=0.12`. Neither conflicts with the floor.
No engine-range hazard.

**Import/runtime behavior of `commonmark` itself:**
`grep -nE "require\(|process\.|eval\(|Function\(|fetch\(|XMLHttpRequest" node_modules/commonmark/lib/{index,blocks,inlines,common,from-code-point}.js`
returns zero matches -- the library's actual `main` entry chain (`lib/index.js`,
which requires `blocks.js`, `inlines.js`, `common.js`, `from-code-point.js`,
`node.js`) does no `require()` of `fs`/`net`/`http`/`child_process`, no
`process.*` access, no `eval`/`new Function`, no network API. `lib/node.js`
despite its filename is the AST `Node` class, not a Node.js-specific module --
confirmed by reading it (state-machine tree walker, no I/O).
The package's `bin/commonmark` CLI script does `require('fs')` and
`require('os')`, but that file is never reached: nothing in this repository
requires `commonmark/bin/commonmark`, and npm does not auto-load a
dependency's `bin` script on `require()`.
Conclusion: no network, no filesystem, no process-liveness, no dynamic code
at import or parse time on the path this project actually exercises. No
conflict with C-2 or DR-0013 clause 4.

**Lazy-loading pattern:** `src/checks.ts` does not `import` `commonmark` at
the top of the module. It uses `createRequire(import.meta.url)` and defers
resolution to `commonMarkModule()`, called only when a record is actually
parsed. The comment at `src/checks.ts:816-824` states this mirrors the
existing pattern documented in `src/validate.ts` for `ajv`/`yaml`, done
because `test/scope-gate.test.ts`'s `copyInstallation` copies `src/` outside
the repo where no `node_modules` sits above it, and a top-level import would
throw `ERR_MODULE_NOT_FOUND` before the test's actual condition runs. Verified
this is a real, not aspirational, concern: confirmed `test/scope-gate.test.ts`
does copy source to a scratch location (see below).

**Published tarball:** `npm run build` then `npm pack --dry-run --json`:
`total files: 123`, `node_modules entries: 0`. The package ships NO vendored
`node_modules` (the pre-existing `"!dist/node_modules"` entry in `package.json`
`files` excludes the `dist/node_modules` that `build:runtime-deps` populates --
this exclusion and that script both predate M3-P3, confirmed by
`git diff origin/main...HEAD -- package.json` showing no changes to those
lines, only the added `"commonmark": "0.31.2"` dependency line and two
unrelated new `files` entries for yaml configs from M3-P3's other changes).
Extracted the tarball's `package.json` directly and confirmed the
`dependencies` field, including `commonmark`, is present in the published
manifest, so `npm install @tiphys/kernel` by any consumer pulls `commonmark`
transitively through ordinary npm dependency resolution -- it does not rely on
anything vendored in the tarball. This is correct and not a regression: a
runtime `dependencies` entry does not need to be physically inside the
tarball's `node_modules` to be installed for a consumer.

**Verdict on section 1: no findings.** Every DR-0022 supply-chain claim
reproduces exactly (package count, byte size, licenses, pin style). No
network/fs/process access on the reachable code path. No engines conflict
with the `>=26` floor. Lazy `createRequire` loading correctly mirrors the
existing `ajv`/`yaml` pattern and is exercised for a real, verified reason
(`test/scope-gate.test.ts`'s `copyInstallation`).

### 2. Regression

**This is the first time `quotableUnits` (or `src/checks.ts`'s markdown
handling) reaches `main` at all.** `origin/main`'s `src/checks.ts` is 341
lines and contains zero occurrences of `quotableUnits`; the entire feature,
across all six in-branch rounds (hand-rolled parser rounds 1-5, then the A2
commonmark swap as round 6), lives on the single phase branch
`claude/m3-p3-assurance-modes` and has not merged yet. So `git diff
origin/main...HEAD` is not "old merged behavior vs new" -- it is the whole
phase's addition. `delivery/review/*.md` and `delivery/decisions/DR-0022-*.md`
already on `origin/main` are PAPERWORK from a separate small PR (#60, #61,
#62) that carried only the decision record and review evidence forward
early; no code from those rounds is on `main`. Confirmed:
`git show origin/main:src/checks.ts | wc -l` = 341, no `quotableUnits` match.

The regression question that matters is therefore INSIDE the phase branch:
what did round 6 (the commonmark swap, commit `1a5b7ba` and its two follow-up
commits) change relative to round 5's state (`18c335a`), the last state of
the hand-rolled parser. `git diff 18c335a..HEAD --stat`:

```
 test/assurance-modes.test.ts                       |  40 +-
 src/checks.ts                                      | 611 ++++-------
 witness/checks-code-block-content-not-quotable.json   |  8 +-
 witness/checks-conditions-are-whole-quotes.json       |  4 +-
 witness/checks-heading-forms-not-quotable.json        |  8 +-
 witness/checks-interrupters-inside-an-item-end-no-unit.json | 16 +-
 witness/checks-list-item-content-belongs-to-the-item.json   |  8 +-
 (+ decision/review/tuition/work-history paperwork, package.json/lock)
```

**Only ONE caller of `quotableUnits` exists in production code**
(`grep -rn "quotableUnits" src/ bin/`): `src/checks.ts:1210`, inside the
decision-record grant-condition checker, unchanged in shape across the swap
(still `quotableUnits(read.body)`). All other references are documentation
comments or `test/assurance-modes.test.ts` call sites (9 of them, all
exercising the same exported function).

**Test-file diff across the swap is exactly one assertion, and it is a
correction, not a weakening.** `git diff 18c335a..HEAD -- test/assurance-modes.test.ts`
shows only the `WHOLE_ITEMS` table's setext row changing from asserting the
setext aside's text IS part of the item's unit to asserting it is NOT,
matching the ATX row's existing (and correct) exclusion. The commit message
attached to this change documents the mechanism: the setext row was wrong
since round 5 (`2ca96c9`), born self-contradictory with the ATX row four
lines above it in the same commit, and survived five rounds because "the test
WAS the specification" -- the hand-rolled parser was tuned to satisfy both
rows even though a setext heading and an ATX heading are the same block kind
and must be treated identically. The correction is backed by TWO independent
CommonMark-conformant parsers (`markdown-it` 14.1.0 commonmark preset and
`commonmark` 0.31.2 itself) agreeing byte-for-byte on the AST shape
(`item > paragraph, heading(level=2), paragraph`). I did not re-run this
cross-check myself (out of lens: that is sourcepos/AST correctness, the
other reviewer's contract), but the mechanism claimed -- "a heading's text
belongs to no unit, and this is the same rule already applied to the ATX
row" -- is a legitimate, well-evidenced correction of a defective fixture,
not a deletion of coverage. No assertion was removed; the row's *expected
value* changed, and the row still runs.

**`test/behaviors.json` is append-only across the whole phase and stayed
that way across the swap.** `git diff 18c335a..HEAD -- test/behaviors.json`
is empty (round 6 registered no new behavior names and deleted none).
`git diff origin/main...HEAD -- test/behaviors.json` (the whole phase) shows
30 new keys added, zero removed, zero modified in place -- pure append,
consistent with the append-only-by-name rule in `CLAUDE.md` binding
convention 5.

**Witness re-anchoring, independently reproduced, not merely trusted.** The
work history (`delivery/work-history/m3-p3.md` section 4, "T-011: eleven
dangerous states pointed into code DR-0022 deleted") reports 104 dangerous
states enumerated across 50 specs, 11 broken `find` strings across 5 specs
(all inside the `quotableUnits` region, as expected since that is the only
region round 6 touched), and 22 more `find` strings that still matched but
were "judged by reading, not by mutation" against the surviving hand-rolled
code paths (`modeConditionsQuoteGrantedBy`'s comparison, check
registrations, the charter enum comparison, acceptance-id counting,
criterion/phase resolution). I independently re-ran a sample of BOTH kinds
myself, in this worktree, using the pristine-copy-mutate-restore method (no
`git checkout --` used at any point):

- All 12 re-anchored members across the 5 broken-and-fixed specs
  (`checks-code-block-content-not-quotable`, `checks-conditions-are-whole-quotes`,
  `checks-heading-forms-not-quotable`, `checks-interrupters-inside-an-item-end-no-unit`
  x4, `checks-list-item-content-belongs-to-the-item` x2) are claimed RED by
  the work history. I spot-checked
  `checks-list-item-content-belongs-to-the-item`'s two members directly:
  baseline green (`tests 1, pass 1, fail 0`), member 0 red
  (`tests 1, pass 0, fail 1`), member 1 red (`tests 1, pass 0, fail 1`),
  `git diff --stat -- src/checks.ts` clean after each restore.
- Of the 22 "judged by reading" anchors, I mutated four members across two
  specs that were NOT re-anchored and NOT retaken by the round
  (`checks-conditions-quote-granted-by`, both members; and, going one step
  further than instructed by also checking `checks-charter-mode-enum-drift`
  and `checks-enum-compared-element-wise`, two more members each): all six
  reddened (`pass 0, fail 1`) against their registered test names, confirming
  the round's "by reading" judgment that these anchors are unaffected by the
  swap holds up under actual mutation, not just inspection. Full commands
  and output are in the Log section below.

**No test was deleted, weakened, or lost its registration.** The claim grep
(`grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|
recovers|anyway|always|never|no way to' delivery/work-history/m3-p3.md`) was
already run by the implementer over its own added section (5377 onward) and
the three hits it reports were rewritten to sourced claims; I re-ran the same
grep over the WHOLE phase's work history file to check the earlier rounds'
sections were not exempted from scrutiny by that framing. See log for count
and a sample of what earlier-round hits look like.

**Verdict on section 2: no findings.** The only test-file change across the
swap corrects a self-contradictory fixture with cross-parser evidence, no
assertion was removed, `test/behaviors.json` only grew, and both classes of
witness anchor (reddened via the swap, and left untouched) independently
reproduce as claimed on direct mutation.

### 3. The salvage itself

Commit `1a5b7ba` ("M3-P3 round 6 (A2): SALVAGED from a died implementer,
gates not yet run") is honest about its own status in its own message: "The
gates have NOT been run at this head by anyone... repeated here as a claim to
be verified rather than as evidence." Two follow-up commits
(`0f055e9`, `218fc12`) then ran verification and recorded a re-run at "the
true final head." This is the correct shape for T-008 salvage (commit
immediately, verify separately, do not claim what has not been checked).

**Committed-tree cleanliness, checked directly rather than assumed:**
- `grep -nE "console\.(log|debug|warn|error)|debugger;|TODO|FIXME|XXX|process\.exit\(" src/checks.ts`
  -- zero hits. No debug output, no debugger statements, no unresolved
  markers left in the new/changed code.
- `grep -nE "closesFence|ATX_HEADING|continuesListItem|listContentColumn|currentIsListItem" src/checks.ts`
  -- zero hits. These are the hand-rolled parser's own internal names (from
  the round-5 state at `18c335a`); none of them survive as dead code
  alongside the new commonmark-based implementation. The swap is a clean
  replacement, not an addition next to old code.
- `git diff origin/main...HEAD --name-status`, full list: every path is
  either a witness/schema/yaml/test/src file plainly belonging to the M3-P3
  assurance-modes feature, or `delivery/**` paperwork, or the three touched
  package files. No stray path (no `r6-probe/`, no `r6-lab/`, no
  `take-witness.mjs`, no `witness-finds.mjs` -- all names the work history
  cites as its own scratch tooling) is present in the tracked tree. The work
  history itself states these lived in `scratchpad/r6-lab`, outside the
  repository, and `git status` was checked after every probe; I have no way
  to verify a directory that by construction is not in the diff, but its
  absence from `git diff --name-status` is exactly what "not committed"
  looks like, and is consistent with the claim.
- `npm run build` exits 0 and leaves `git status --short` clean (checked
  above, section 1), so the salvaged `src/checks.ts` type-checks cleanly
  under the strict build, not merely under `node --test`'s type-stripping.

**Verdict on section 3: no findings.** The salvage was committed honestly
(claims labeled as unverified at commit time), the swap left no dead code
from the replaced parser, and no scratch/probe artifacts reached the tracked
tree.

## Gates run, each with its own exit code

- `npm ci`: exit 0, 14 packages added, 0 vulnerabilities.
- `npm run build`: exit 0, `git status --short` clean afterward.
- ASCII check (`grep -raPl '[^\x00-\x7F]'`, `-a` present) over all 428 tracked
  files minus the two documented exemptions
  (`delivery/intake/orchestrated-delivery-process.md`,
  `test/fixtures/json-schema-test-suite/**`): 0 files flagged. Ran as a
  per-file loop (not a single xargs invocation) specifically to avoid the
  xargs-exit-123-looks-like-failure trap this repo has already been bitten
  by; confirmed 0 hits directly, not by exit code alone.
- Control-character check (`grep -raPl '[\x00-\x08\x0B\x0C\x0E-\x1F]'`, same
  `-a`, same scope): 0 files flagged, same per-file method.
- `node --test "test/**/*.test.ts"` (in `wt-m3p3-a2-cr-b`): exit 0, `tests 501,
  pass 501, fail 0, cancelled 0, skipped 0, todo 0`, duration_ms 248167 (about
  4m8s wall time -- consistent with standing warning 11 about real-clock
  lease waits in the witness harness's spawned children).
- Scope gate: run in `../wt-m3p3` (branch confirmed
  `claude/m3-p3-assurance-modes`, same head `218fc12`, `git status --short`
  clean), NOT in this detached worktree, per the task's own trap warning.
  `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
  --evidence <dir> --base origin/main --head HEAD --phase m3-p3 --only scope`:
  `status green, units 37, "37 changed path(s) audited against declaration
  delivery/plan/phase-declarations/m3-p3.json at merge base 3c60acb..."`.
  (First attempt without `--phase` did reproduce the documented false
  `error` shape -- `"gate scope requires --phase, which was not supplied"`,
  distinct from the detached-worktree false-HIGH trap the task warns about,
  and resolved by supplying `--phase m3-p3`, matching the branch's own
  `^claude/m[0-9]+-p[0-9]+-` derivation.)

## Findings

None. Zero `CR-nnn` raised.

## What this review did NOT cover

Read this first.

1. **The 40-shape exploit set, byte-identical record comparison, and
   `sourcepos` slicing correctness are explicitly out of this lens's
   contract** and were not independently re-run here. I did not verify the
   `markdown-it`/`commonmark` cross-check behind the setext-row fixture
   correction myself (section 2); I evaluated only whether that correction
   was a legitimate fix versus a coverage loss, which is a regression
   question, not a correctness one. The other reviewer's report is the
   authority on whether the new `quotableUnits` is actually correct.
2. **`unit-tests-for-changed-service-methods` and
   `fixtures-for-changed-component-states`** are `clean-room-checklist`
   gates the automated runner explicitly does not execute (reported by the
   runner itself: "2 registry gate(s) declared verified-by clean-room-
   checklist and NOT executed by this runner"). Neither was walked as a
   manual checklist item in this review; they are correctness-adjacent and
   sit closer to the other reviewer's lens.
3. **Not all 22 "judged by reading" witness anchors were mutated.** I spot-
   checked 3 of the 22 named specs (`checks-conditions-quote-granted-by`,
   `checks-charter-mode-enum-drift`, `checks-enum-compared-element-wise`;
   6 dangerous-state members total) plus 2 of the 5 re-anchored specs
   (`checks-list-item-content-belongs-to-the-item`, both members). The
   remaining 19 "by reading" anchors and 3 re-anchored specs
   (`checks-code-block-content-not-quotable`,
   `checks-heading-forms-not-quotable`,
   `checks-interrupters-inside-an-item-end-no-unit`) were read but not
   independently mutated by me; I relied on the work history's own
   `take-witness.mjs` transcript for those, which reports all reddening as
   claimed and whose method (pristine-copy, mutate, restore, no
   `git checkout --`) matches what I independently verified works.
4. **The claim grep was not run to resolution over the whole phase's work
   history**, only over round 6's own added section (already done by the
   implementer, reproduced by me at a summary level: 73 total hits across
   the 5586-line file, sampled the pre-round-6 hits and found them already
   addressed inline in their own sections). A full per-hit audit of all
   five earlier rounds' claim-grep compliance is a fix-round-contract
   question for the phase as a whole, not specific to the A2 supply-chain
   swap, and was judged out of proportion to this lens.
5. **CI (the `pull_request` and post-merge `push` arms) has not run at this
   head by this review.** Everything reported above is local, matching the
   dead implementer's own stated gap in the work history. Per T-009, this
   report's green results are evidence only for the local configuration
   that produced them.
6. **`markdown-it` as a differential oracle**: the work history states it
   lives in a scratch prefix outside the repository and is not, and must
   not become, a project dependency. I did not attempt to reinstall it or
   re-run the differential fuzz myself; I read the transcript and confirmed
   `package.json`/`package-lock.json` are untouched by anything describing
   it (no `markdown-it` entry in either file, checked directly).
7. **The M3-P3 feature's own design** (assurance modes, role-model
   configuration, the charter schema changes) was read only as far as
   needed to trace `quotableUnits`'s one call site and confirm scope; its
   business-logic correctness is not this lens's concern and was not
   evaluated.
8. **Node floor and `engines` were checked for `commonmark` and its three
   sub-dependencies only**, not for `ajv`/`yaml` (pre-existing, out of
   scope for this phase) or for the toolchain itself.
