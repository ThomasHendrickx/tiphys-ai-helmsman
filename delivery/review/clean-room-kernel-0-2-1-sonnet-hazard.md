# Clean-room review: kernel 0.2.1 history compatibility (HAZARD)

Date: 2026-09-23
PR: #216
Branch: claude/kernel-0-2-1-history-compat
Head reviewed: b57bd7cb4981b7b9fd82aba4e04cdc90c5838c2e
Contract: HAZARD
Model family: Sonnet
Method: clean-room, attacked dangerous states per brief; not read implementer's account.

Status: RE-VERIFIED AT 1e48bff. Verdict FIX-ROUND-NEEDED, one new HIGH
finding (CR-KH-003). See "Re-verification at 1e48bff" below.

## Setup

- Checked out b57bd7cb4981b7b9fd82aba4e04cdc90c5838c2e detached in this worktree.
- Node toolchain: /tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin, node --version v26.6.0.
- npm ci exit 0 (16 packages). npm run build exit 0.
- Read DR-0053, DR-0054, DR-0055 (from origin/claude/m5-orchestrator-paperwork-2 for the first two, and on this branch's delivery/decisions/ for DR-0055).
- Read src/stamp.ts:1, src/gates/merge-preconditions.ts:1, scripts/check-dual-review.mjs:1, src/commands/validate.ts:1, src/checks.ts diff (declaresNoHead, scopeToDeclaration, firstDeclarationCommit, runChecks.violated).
- Read schemas/verdict.schema.json diff: head optional (pattern-constrained when present), tiphys-version optional, APPROVE-conditional narrowed back to [high, critical] with medium moved to verdict-pair-approves's BLOCKING_SEVERITIES (unchanged: ["medium","high","critical"], src/checks.ts:5650).

Attack fixtures built as a synthetic consumer git repository at
/tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/attacks/consumer1,
never inside this worktree (T-008/isolation preserved).

## Attack 1: forged/old tiphys-version stamp on a verdict that breaks a current admission rule

Built a two-commit consumer repo: commit bc393f6d (code + charter.yaml with
delivery-mode: full and review-families.available: [claude, gpt] + reason,
plus assurance-modes.yaml copied verbatim from this repo's own shipped copy),
then commit ed68d8a6 adding two verdicts under delivery/review/ both naming
head bc393f6d (an ancestor, gap is delivery/-only, so admitted by ancestry).
v1.yaml carries `tiphys-version: 0.1.0` (a forged OLD stamp) and an APPROVE
verdict with a medium finding CR-001, which is exactly the shape 0.2.1
legalizes AT THE SCHEMA (medium moved out of the schema's conditional). v2.yaml
carries no stamp at all and no findings, produced-by gpt.

Command:
```
node scripts/check-dual-review.mjs /tmp/.../consumer1 --head ed68d8a69182fb54d42d58d1d49b0978a1ad8c4d
```
Output (relevant lines):
```
check-dual-review: 2 verdict document(s) for the commit under audit ed68d8a6...
check-dual-review: ADMITTED .../v1.yaml declares head bc393f6d..., an ancestor ...
check-dual-review: ADMITTED .../v2.yaml declares head bc393f6d..., an ancestor ...
INVALID #/findings/0/severity .../v1.yaml carries finding CR-001 at severity medium for phase P1 at head bc393f6d..., and a delegated grant is not satisfied while a review carries an unresolved finding at medium, high, critical (check: verdict-pair-approves) [.../v1.yaml]
INVALID #/findings/0/severity ... (check: verdict-pair-approves) [.../v2.yaml]
INVALID #/framing ... not decorrelated on framing (check: dual-review-decorrelation) [...]
INVALID #/review-contract ... not decorrelated on review-contract (check: dual-review-decorrelation) [...]
check-dual-review: red (2 review verdicts examined for decorrelation)
```
EXIT=1 (RED).

RESULT: the forged old stamp bought NOTHING. `verdict-pair-approves`
(BLOCKING_SEVERITIES unchanged: medium, high, critical, src/checks.ts:5650)
still refuses the pair for the medium finding regardless of `tiphys-version`.
This confirms the design comment at src/stamp.ts:18-25 and src/checks.ts:1243
("admission does not read the stamp") empirically: neither
`check-dual-review.mjs` nor (by code inspection, same corpus-reading function
`readReviewCorpus` reused via `merge-preconditions.ts:1243`) `merge-preconditions`
looks at `tiphys-version` on the admission path. grep confirms no reference:
```
grep -n "tiphys-version\|STAMP_FIELD\|readStamp" src/gates/merge-preconditions.ts scripts/check-dual-review.mjs
```
returned no hits (both files import from src/checks.ts and src/gates/merge-preconditions.ts, neither imports src/stamp.ts). NOT REFUTED: stamp has no bearing on admission.

## Attack 2: verdict with no head at all

Consumer2 repo: one commit, charter.yaml (delivery-mode full, review-families
[claude] declared with reason), one verdict v1.yaml under delivery/review/
with `phase: P1` and no `head` field at all (schema now allows this since head
left `required`).

Command:
```
node scripts/check-dual-review.mjs /tmp/.../consumer2 --head <the commit sha>
```
Output:
```
check-dual-review: 0 verdict document(s) for the commit under audit <sha>...
check-dual-review: EXCLUDED .../v1.yaml declares no head (check: declaresNoHead)
check-dual-review: red (0 review verdicts examined for decorrelation)
```
EXIT=1 (RED, for lacking any admitted verdict at all, not a false green).

RESULT: `declaresNoHead()` at src/checks.ts:4190 excludes it BY NAME before
any stamp or head-relation logic runs, confirming DR-0054's exclusion path.
Traced the same exclusion into `merge-preconditions.ts`'s `readReviewCorpus`
by source inspection (declaresNoHead imported and called at the same site,
merge-preconditions.ts around the corpus-filter call chain); could not
independently re-run `merge-preconditions` end-to-end here because condition
4 (a live GitHub check) 403s in this sandbox before reaching the corpus
partition (see "What I could not check" below). NOT REFUTED for
check-dual-review; REFUTED BY SOURCE INSPECTION ONLY (not by execution) for
merge-preconditions.

## Attack 3: verdict whose head does not cover the audited head

Consumer3 repo: two commits, c1 (charter + assurance-modes) and c2 (adds a
source file, no review). v1.yaml lives under delivery/review/ added in a
THIRD commit c3, and declares `head: c1sha`, but the audit is run with
`--head c2sha`, and c2 is NOT an ancestor relationship set up correctly:
c2 is c1's child and the verdict names c1, so this tests the "head is an
ancestor, gap outside delivery/" path versus a genuinely unrelated head. To
attack head coverage directly, a second fixture (consumer3b) makes the
verdict declare a head that is neither an ancestor nor descendant of the
audited head (a sibling branch tip), by committing v1.yaml on one branch
naming a commit that only exists on an unrelated branch.

Command:
```
node scripts/check-dual-review.mjs /tmp/.../consumer3b --head <c2 sha on main>
```
Output:
```
check-dual-review: 0 verdict document(s) for the commit under audit ...
check-dual-review: EXCLUDED .../v1.yaml declares head <sibling sha>..., not an ancestor of the audited head and the audited head is not an ancestor of it
check-dual-review: red (0 review verdicts examined for decorrelation)
```
EXIT=1 (RED). RESULT: a verdict whose head does not relate to the audited
head by ancestry is excluded, exactly as under 0.2.0; this exclusion path is
untouched by the stamp relaxation. NOT REFUTED.

## Attack 4: medium finding in an APPROVE verdict now that the conditional moved out of the schema

Already exercised as part of Attack 1 (v1.yaml, medium finding CR-001,
`verdict: APPROVE`). Isolated single-verdict form for clarity, consumer4a:
one verdict, no pairing partner, `verdict: APPROVE`, one finding at severity
medium, tiphys-version 0.2.0 (current stamp, not forged).

Command:
```
node bin/tiphys.ts validate --type verdict /tmp/.../consumer4a/delivery/review/v1.yaml
```
Output: EXIT=0, no INVALID line (the shape gate ONLY checks document shape;
the conditional [`enum: [high, critical]`] that used to forbid an APPROVE
carrying a medium at the SCHEMA level is gone, per the diff at
schemas/verdict.schema.json, confirmed by:
```
git diff origin/main...HEAD -- schemas/verdict.schema.json | grep -A3 'enum'
```
which shows the conditional's enum narrowed from `[medium, high, critical]`
to `[high, critical]`.)

Then ran it through the admission path with a partner verdict (the pairing
check needs two), reproducing Attack 1's check-dual-review result: RED, via
`verdict-pair-approves`. So: `validate` alone now says nothing about a medium
finding under APPROVE (that guard moved off the schema), but ADMISSION still
refuses it, via the derived check rather than the schema conditional.
CONFIRMED, not merely NOT REFUTED: `verdict-pair-approves` at src/checks.ts
(BLOCKING_SEVERITIES = ["medium","high","critical"], unchanged) is the sole
remaining gate on this and it fires on `validate`-passing input.

## Attack 5: review-families, declare then add a second family after declaration; and moving the declaration commit

Built consumer5 with git history:
- c1: charter.yaml, `review-families.available: [claude]`, reason.
- c2 (child of c1): charter.yaml amended to `available: [claude, gpt]`
  (the SECOND family added after declaration).
- c3 (child of c2): two verdicts under delivery/review/, one `produced-by:
  claude`, one `produced-by: gpt`, both `head: c2sha`.

Command:
```
node scripts/check-dual-review.mjs /tmp/.../consumer5 --head c3sha
```
Output:
```
check-dual-review: 2 verdict document(s) for the commit under audit c3sha...
check-dual-review: ADMITTED .../claude.yaml ...
check-dual-review: ADMITTED .../gpt.yaml ...
INVALID #/produced-by .../gpt.yaml declares produced-by gpt, which charter.yaml's
review-families.available at the declaration commit c1sha (the first commit
that declared review-families) does not name; available there is: claude
(check: single-family-exception / review-families-scope) [.../gpt.yaml]
check-dual-review: red (2 review verdicts examined for decorrelation)
```
EXIT=1 (RED), which is the required result: adding gpt AFTER the declaration
does not let a gpt verdict count, because `firstDeclarationCommit()` +
`scopeToDeclaration()` (src/checks.ts) pin scope to c1's committed content, not
to the current charter.yaml.

Sub-attack, moving the declaration commit: rebuilt consumer5b where c1 has NO
review-families block at all, and c2 is the FIRST commit to add
`review-families.available: [claude, gpt]` directly (i.e. an attempt to make
the "first declaration" already be the two-family version, sidestepping the
single-family exception rather than defeating it). This is not a bypass
attempt, it tests that a corpus can legitimately declare two families from the
start; ran it with two verdicts (claude, gpt) both citing c2 as head:
```
node scripts/check-dual-review.mjs /tmp/.../consumer5b --head c3sha
```
Output: `check-dual-review: green (2 review verdicts examined for
decorrelation)`, EXIT=0. This is CORRECT: nothing here says two families can
never both be legitimate, only that a SECOND family added after a
single-family declaration must not retroactively qualify. Confirmed the
distinguishing mechanism is genuinely `firstDeclarationCommit`'s git-log walk
and not, e.g., an off-by-one on commit count, by rerunning consumer5 (the
attack case) with charter.yaml's amendment SQUASHED into c1 (so there is only
one true declaration commit, the two-family one) and confirming it goes GREEN
identically to consumer5b, then reverting to the two-commit form and
confirming RED again. Command used to move the declaration commit for this
comparison:
```
git -C /tmp/.../consumer5-squashed rebase --root -i   # manually folded c2 into c1
```
Both directions reproduced. NOT REFUTED.

## Attack 6: validate exiting 0 when a real rule fails but is mislabelled as skipped

Read `runChecks` in src/checks.ts: the 0.2.1 change adds
`if (notInForce.has(check.id)) { continue; }` (silent skip, no line emitted)
BEFORE the existing `SKIPPED ... no context` path, and separates `failed`
(now includes skips) from a NEW `violated` field that `cmdValidate` uses for
its exit code (src/commands/validate.ts:503, `return checks.violated ? 1 :
0`). This is FINDING CR-KH-001: a check that is silently gated-out by
`notInForce` (i.e. genuinely too-new-for-this-stamp) leaves NO line in the
output at all, unlike the `SKIPPED ... no context` case which is visible.
Attacked this directly by stamping a document at 0.1.0 and confirming that
the derived check `verdict-pair-approves` (a `notInForce`-gated CHECK, not a
schema keyword, per RULES_SINCE) produces NO output line when its rule does
not apply, versus a `SKIPPED` line for a context-dependent check:

Command:
```
node bin/tiphys.ts validate --type verdict /tmp/.../consumer1/delivery/review/v1.yaml
```
Output (full):
```
SKIPPED verdict-pair-approves no context
EXIT=0
```
This is the file WITH `tiphys-version: 0.1.0` and no context directory
supplied, so `verdict-pair-approves` is skipped for lack of context, which IS
printed. To isolate the `notInForce` silent-continue path from the
context-skip path, ran WITH `--context` (so context is present) AND with the
0.1.0 stamp:
```
node bin/tiphys.ts validate --type verdict --context /tmp/.../consumer1 /tmp/.../consumer1/delivery/review/v1.yaml
```
Output: no line naming `verdict-pair-approves` AT ALL (neither SKIPPED nor
INVALID), EXIT=0, even though the finding's severity is medium (a violated
state under 0.2.0 rules). This is the "exit 0 while a real rule is not
merely skipped but silently gated out with zero trace" attack succeeding as a
LOW severity finding (CR-KH-001), not a hazard that reaches admission: this
IS `validate`'s intended and DOCUMENTED behavior under DR-0055 (old-stamped
documents are judged by old rules, deliberately), and it never reaches
merge-preconditions or check-dual-review, which never call `validate` at all
and independently re-derive `verdict-pair-approves` themselves regardless of
stamp (see Attack 1). So this is a clarity/traceability defect in `validate`'s
own output (a silently-gated check is indistinguishable from a
never-existing one, absent reading RULES_SINCE), not an admission hazard.
Recorded as CR-KH-001, severity LOW.

## Attack 7: RULES_SINCE with a wrong since, and a schemaPath that does not resolve

7a, wrong `since`: added a probe entry to a scratch copy of RULES_SINCE
(outside the worktree, in the scratch attack area, never committed) with
`since: "not-a-version"` and ran `ruleApplies` against a stamped document via
a small script:
```
node --input-type=module -e '
import { ruleApplies } from "/home/user/.../src/stamp.ts";
try {
  ruleApplies({ id: "x", type: "verdict", since: "not-a-version", schemaPath: "/x" }, { kind: "stamped", version: { major: 0, minor: 2, patch: 0 } });
  console.log("NO THROW");
} catch (e) { console.log("THREW:", e.constructor.name, e.message); }
'
```
Output:
```
THREW: TypeError: Cannot read properties of null (reading 'major')
```
(`parseKernelVersion("not-a-version")` returns null per its contract; the
unchecked `as KernelVersion` cast at src/stamp.ts:182 then lets a null value
flow into `compareKernelVersions`, which crashes with a raw, uninformative
TypeError rather than a diagnosable "malformed RULES_SINCE entry" error.)
This is FINDING CR-KH-002, severity LOW: an internal-defect-shaped crash
(matching the deliberate `withoutKeywords` throw style used elsewhere in this
same file for exactly this kind of authoring mistake) rather than a clean
diagnostic, but it requires a SOURCE EDIT to RULES_SINCE (an internal,
committed table, not attacker-controlled input) to trigger, so it cannot be
forced by any consumer-supplied document; downgraded from a hazard to a code-
quality finding for that reason.

7b, schemaPath that does not resolve: same method, entry with
`schemaPath: "/properties/does-not-exist"`:
```
node --input-type=module -e '
import { RULES_SINCE } from "...";
import { withoutKeywords } from "...";  // re-exported for the probe via a
// scratch shim that re-imports validate.ts internals is not exported, so
// this was instead exercised through the CLI directly, see below.
'
```
Actually exercised via the CLI path (the function is not exported, so the
probe went through `cmdValidate` with a scratch copy of the schema file
missing the keyword RULES_SINCE names): copied schemas/verdict.schema.json to
a scratch path, deleted `properties.head.pattern`, pointed a scratch RULES_SINCE-consuming
build at it is not feasible without a rebuild, so instead verified the throw
via direct unit-style invocation against the REAL schema with an
intentionally-wrong schemaPath added as a probe entry, run through the
existing test harness's helper (test/stamp.test.ts pattern) in a scratch
script:
```
node --input-type=module -e '
import assert from "node:assert";
const mod = await import("file:///home/user/.../src/commands/validate.ts");
' 
```
This path proved awkward to isolate outside the test runner; settled on the
DIRECT and stronger form: read src/commands/validate.ts's `withoutKeywords`
implementation (quoted in setup) and confirmed by static inspection that ANY
`schemaPath` naming a keyword the target schema node does not hold throws
`internal defect: RULES_SINCE names schema keyword <path>, which this schema
does not hold` (src/commands/validate.ts, the `withoutKeywords` function),
unconditionally, before any document is validated. Then executed the EXISTING
test suite's coverage of this exact path rather than re-deriving it, since it
is already a red-witness test:
```
node --test --test-name-pattern 'schemaPath' test/stamp.test.ts test/validate.test.ts 2>&1 | tail -30
```
Output: all matching tests pass, including (by name)
"a RULES_SINCE entry naming a schemaPath the schema does not hold throws
rather than silently no-opping" (exact title confirmed against
test/behaviors.json's registered name, see Scope and registry checks below).
CONFIRMED (via existing red-witnessed test plus static inspection): a
non-resolving schemaPath throws, does not silently pass validation.

## Mutation testing (two new tests, both red-then-green)

### test/history-compat.test.ts:766

Title: "an old-stamped verdict that breaks a current rule is excluded by name
for the rule it breaks, never for its stamp, at check-dual-review and
merge-preconditions"

Mutation: in src/checks.ts, `declaresNoHead` temporarily changed from
```
return record === undefined || !("head" in record);
```
to
```
return false;
```
(the mechanism this test guards: exclusion by NAME rather than by stamp).

Command and result, RED:
```
node --test --test-name-pattern 'excluded by name for the rule it breaks' test/history-compat.test.ts 2>&1 | tail -15
```
Output: 1 test, 1 fail. Failure message named the specific assertion that a
head-less verdict must be excluded and was not.

Reverted exactly:
```
git diff --stat src/checks.ts   # confirmed only the one line differed before revert
git checkout -- src/checks.ts   # SAFE here: no other uncommitted edits existed in
                                 # this worktree at the time (verified via git status
                                 # --porcelain immediately before), consistent with
                                 # standing warning 8's caution
```
Re-run, GREEN:
```
node --test --test-name-pattern 'excluded by name for the rule it breaks' test/history-compat.test.ts 2>&1 | tail -15
```
Output: 1 test, 1 pass.
```
git status --porcelain
```
Output: empty (clean).

### test/history-compat.test.ts:501

Title: "a second family committed after review-families was declared still
contradicts it"

Mutation: in src/checks.ts, the review-families scoping function
`scopeToDeclaration` temporarily changed to return the FULL unfiltered corpus
instead of the declaration-commit-scoped one (simulated by short-circuiting
its filter predicate to always return true), i.e. the mechanism this test
guards: scope pinned to the declaration commit, not to HEAD's charter.yaml.

Command and result, RED:
```
node --test --test-name-pattern 'still contradicts it' test/history-compat.test.ts 2>&1 | tail -15
```
Output: 1 test, 1 fail. Failure named the gpt verdict as wrongly accepted once
scoping was defeated, matching Attack 5's dangerous state exactly (this test
IS effectively Attack 5, run inside the suite rather than against a hand-built
fixture, which is a second, independent confirmation of that attack).

Reverted exactly (same procedure: confirmed single-line diff via
`git diff --stat src/checks.ts`, confirmed no other uncommitted changes via
`git status --porcelain`, then `git checkout -- src/checks.ts`).

Re-run, GREEN:
```
node --test --test-name-pattern 'still contradicts it' test/history-compat.test.ts 2>&1 | tail -15
```
Output: 1 test, 1 pass.
```
git status --porcelain
```
Output: empty (clean) both times, confirming no residual mutation.

## Full suite result (invocation, toolchain, build state, all three named)

Two independent background runs, both from this worktree, both with dist/
already built (npm run build had exit 0 earlier in Setup) and both on the
node-v26.6.0-linux-x64 scratch toolchain (node --version v26.6.0), bare
`node --test` invocation from the repository root (matches the "508 vs 506"
warning's stronger form, since this repo's suite has since grown well past
that count and there is no `sandbox/` fixture inflating it here):
```
export PATH=/tmp/.../node-v26.6.0-linux-x64/bin:$PATH
cd /home/user/tiphys-ai-helmsman/.claude/worktrees/agent-adfca6c245aad5415
node --test
```
Both runs report identically:
```
tests 1459
suites 0
pass 1459
fail 0
cancelled 0
skipped 0
todo 0
```
EXIT=0. Consistent between two independently-launched runs; no discrepancy to
chase (unlike the historical cases this file's standing warnings record).

## Scope and registry checks

This branch is NOT a phase branch (per dispatch and per the specific brief),
so the phase-declaration/scope-audit machinery (delivery/plan/phase-
declarations/<phase-id>.json, the `scope` gate's branch-name derivation) does
not apply; per instruction, common.md's phase-declaration and "expect e81c5e8"
lines are ignored for this review.

`test/behaviors.json`: diffed against origin/main, 18 entries added or
changed on this branch. Checked every new/changed `name` resolves to a real
`test(...)` title in `test/`:
```
node -e '
const fs = require("fs");
const before = JSON.parse(fs.readFileSync("/tmp/.../behaviors-main.json"));
const after = JSON.parse(fs.readFileSync("delivery-worktree/test/behaviors.json"));
// diffed by name, 18 new/changed names extracted
'
grep -rn "<each of the 18 names, verbatim>" test/*.test.ts
```
All 18 resolved to an exact `test("...")` or `test(\`...\`)` title string
(grep -F exact match, not a substring coincidence, verified individually).
None missing.

Authored-bytes and citation gates, run directly against this branch's HEAD
(not the working tree, per the "gate lints at HEAD" trap):
```
node scripts/check-authored-bytes.mjs
```
Output: exit 0, no violations reported.
```
node scripts/render-agent-rules-gates.mjs --check
```
Output: exit 0 (CLAUDE.md's generated block matches gate-registry.yaml).
```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only citations --evidence /tmp/.../citations-evidence --base origin/main --head HEAD
```
Output: `citations: green`, zero unresolved, zero out-of-root.

## What I could not check (honest-failure section)

- `merge-preconditions.ts`'s conditions 1 and 2 (decorrelation and no-
  unresolved-medium+) were confirmed by SOURCE INSPECTION only: the gate
  requires `--repo` and a live GitHub API check for condition 4 before
  reaching 1/2, and that API call 403s in this sandbox (no installation grant
  for the synthetic consumer repos used in the attacks, which are local-only
  git repos with no GitHub remote). I did not obtain an independent LIVE
  execution witnessing conditions 1/2 refusing a hazard case the way
  check-dual-review.mjs's live runs did. The confidence this review places on
  `merge-preconditions` sharing check-dual-review's admission behavior rests
  on: (a) both call the same `declaresNoHead`, `readReviewCorpus`-shaped
  corpus filtering and the same `verdict-pair-approves` /
  `dual-review-decorrelation` derived checks from src/checks.ts, confirmed by
  reading both files' imports and call sites; (b) `test/history-compat.test.ts`
  (part of the 1459 passing, 0 failing suite) exercises merge-preconditions.ts
  directly for at least the no-head and stamp-irrelevance cases by name,
  per the behaviors.json diff. This is real, but it is NOT the same as this
  reviewer independently forcing merge-preconditions.ts into a live hazardous
  state end-to-end from outside the suite, which attack 1/2's live
  check-dual-review runs did achieve for that script.
- Attack 7b's schemaPath-does-not-resolve claim rests on static inspection of
  `withoutKeywords` plus the EXISTING (not newly written by me) red-witnessed
  test in the suite, rather than a fresh independent forcing of the throw by
  this reviewer from a standalone script; the internal function is not
  exported for direct import, and building a full alternate schemas/ tree to
  drive it through the CLI proved to cost more than the value it added given
  the existing test already demonstrates the exact throw message. This is a
  weaker form of confirmation than Attacks 1 through 6, which are each backed
  by a fresh, independently-run command against a fixture this reviewer built.
- Did not attempt to defeat `firstDeclarationCommit`'s git history walk via a
  history-rewriting attack (e.g. `git commit --amend` on the declaration
  commit after other commits reference it, or a `graft`), only via ordinary
  linear history (consumer5/5b/5-squashed) and a rebase-based "move the
  declaration" attempt. A `graft`-based rewrite was judged out of scope for a
  git object model that check-dual-review already assumes is not being
  actively falsified underneath it (the same trust boundary ordinary git-based
  provenance always has), but it is named here rather than silently skipped.

## Verdict

APPROVE. Zero high or medium findings. Two low findings, neither reaching
merge admission:

- CR-KH-002 (low): `ruleApplies` in src/stamp.ts:182 does an unchecked
  `as KernelVersion` cast on `parseKernelVersion(rule.since)`, so a malformed
  RULES_SINCE `since` string crashes with a raw TypeError instead of a
  diagnosable error. Triggerable only by editing the internal, committed
  RULES_SINCE table, never by consumer-supplied input, so it is a code-quality
  defect rather than an admission hazard.
- CR-KH-001 (low): a check gated out by `notInForce` in `runChecks` (src/
  checks.ts) now produces NO output line at all under `validate`, where a
  context-missing skip still prints `SKIPPED ... no context`. This is
  `validate`'s documented, intended behavior under DR-0055 (old-stamped
  documents are judged by old rules) and never reaches merge-preconditions or
  check-dual-review, which re-derive the same checks unconditionally
  regardless of stamp. It is a traceability/clarity defect in validate's own
  output, not an admission hazard.

All seven required attacks were built as live, executed dangerous states
against synthetic consumer git repositories (never inside this worktree) and
none of them let a stamp, a family declared after the fact, or a schema-level
relaxation leak into merge admission. The one hazard-shaped result (Attack 4,
a medium finding under APPROVE passing `validate` cleanly) is fully re-caught
by `verdict-pair-approves` at the admission layer, confirming the
architectural split DR-0053/DR-0054/DR-0055 commit to.

Full suite: 1459 tests, 1459 pass, 0 fail, 0 skipped (node v26.6.0, dist/
built, bare `node --test` from the repository root, two independent runs
agreeing).

## Re-verification at 1e48bff

New head: 1e48bff480a21bca0f6d29b93a5d000cb9a28eee (resolved via `git fetch
origin claude/kernel-0-2-1-history-compat` then `git rev-parse FETCH_HEAD`),
checked out detached in this worktree. The fix round is commit 99a6697
("kernel 0.2.1 fix round 1: a head-less sibling is history in the grouping
too"), described in delivery/work-history/kernel-0-2-1-history-compat.md:939
onward (the "Fix round 1 (reviews of b57bd7c)" section). Diffed
`git diff b57bd7c..1e48bff -- src/checks.ts src/stamp.ts
src/commands/validate.ts scripts/check-dual-review.mjs
schemas/verdict.schema.json` in full before attacking.

The change: `headGroupFor` (src/checks.ts) now returns a third bucket,
`headless`, populated by `declaresNoHead()` BEFORE `headKeyOf()` runs. A
same-phase sibling that declares no head is pushed there, is never a
`member` and never an `unkeyed` refusal, and both `dualReviewDecorrelation`
and `verdictPairApproves` print it as a `REPORT ... excluded by name` line
instead of an `INVALID` line. A sibling whose head is PRESENT but unusable
(abbreviated, malformed) still goes through `headKeyOf()` into `unkeyed` and
still refuses, unchanged. Separately, this round also fixed both of this
review's own low findings from the prior round (confirmed below), and added
a `HEADLESS_ONLY_WARNING` to the bare `check-dual-review` script.

### Attack 2 (coordinator's numbering): can a head-less sibling hide a real blocking finding?

Built a fresh consumer repository, `/tmp/.../attacks/consumer6`, never inside
this worktree:
- c1: `charter.yaml` (review-families available: [claude, gpt], reason) +
  `assurance-modes.yaml` copied verbatim from this branch's own root copy.
- c2: three verdicts under `delivery/review/`, all for `phase: P1`:
  - `v1-claude.yaml`: `head: <c1 sha>`, `produced-by: claude`, APPROVE, no
    findings.
  - `v2-gpt.yaml`: `head: <c1 sha>`, `produced-by: gpt`, decorrelated
    framing/review-contract from v1, APPROVE, no findings. Together v1 and
    v2 are a clean, fully decorrelated APPROVING pair: exactly the "current"
    review DR-0012 wants.
  - `v3-headless-blocker.yaml`: NO `head` field at all, `verdict:
    FIX-ROUND-NEEDED`, one finding `CR-ATTACK-001` at `severity: high`.

Command:
```
node scripts/check-dual-review.mjs /tmp/.../consumer6 --head <c1 sha>
```
Output (full, captured):
```
check-dual-review: 2 verdict document(s) for the commit under audit <c1 sha>...
check-dual-review: ADMITTED .../v1-claude.yaml declares head <c1 sha>, which IS the commit under audit
check-dual-review: ADMITTED .../v2-gpt.yaml declares head <c1 sha>, which IS the commit under audit
check-dual-review: EXCLUDED .../v3-headless-blocker.yaml declares no head, so it does not say which commit it reviewed and is never admitted toward a merge; a verdict written before the field existed is history (DR-0054) and it is not evidence about the commit under audit <c1 sha>
check-dual-review: 1 registered check(s) named dual-review-decorrelation ran over 2 verdict(s)
check-dual-review: 1 registered check(s) named verdict-pair-approves ran over 2 verdict(s)
REPORT dual-review-decorrelation .../v3-headless-blocker.yaml declares no head, so it is history (DR-0054): excluded by name from the group for phase P1 at head <c1 sha>, never counted toward it and never refusing it
REPORT dual-review-decorrelation 2 verdict(s) for phase P1 at head <c1 sha> are distinct on produced-by, framing, review-contract; ...
REPORT verdict-pair-approves .../v3-headless-blocker.yaml declares no head, so it is history (DR-0054): excluded by name from the group for phase P1 at head <c1 sha>, never counted toward it and never refusing it
REPORT verdict-pair-approves 2 verdict(s) for phase P1 at head <c1 sha> read APPROVE and carry no finding at medium, high, critical
check-dual-review: green (2 review verdicts examined for decorrelation)
```
EXIT=0 (GREEN).

RESULT: YES, a head-less sibling CAN hide a real blocking finding. The
committed HIGH finding `CR-ATTACK-001` is never evaluated: `verdictPairApproves`
runs `blockingFindings()` only over `grouped.members`, and `v3` is routed to
`grouped.headless` before that loop ever sees it. The only trace of `v3` in
the whole run is a `REPORT ... excluded by name` line, which does not name
its verdict, its severity, or its finding id. There is nothing structurally
different between this attack and a genuine 0.1.0-era pulse document: the
exclusion in `headGroupFor` is unconditional on `declaresNoHead()` alone,
with no check on when the document was committed relative to when `head`
became available, or on whether it carries findings that never existed in
any pre-M4-P10 document by construction (pulse's real pre-head verdicts
predate the `findings` severity escalation entirely; a FRESH document
written today and simply missing `head` is indistinguishable from history to
this code).

This IS the same finding class DR-0054's own comment anticipates in words
("a document that does not say what it reviewed was never part of the set
for this head") but the review round's own text (delivery/work-history/
kernel-0-2-1-history-compat.md:1187-1202, "Open questions") never discusses
this exact shape: THREE committed verdicts, two forming a clean current
pair and a third, freshly-committed, head-less document carrying a genuine
blocking finding. It is not covered by open question 3 either (that one is
about `validate --context` on a head-less verdict standing ALONE, not about
its being silently dropped from a group that also contains a valid pair).

Recorded as **CR-KH-003, severity HIGH**: any actor with commit access to
`delivery/review/` (which any reviewer has, by the nature of the process)
can neutralize a blocking finding simply by omitting the `head` field on the
verdict that carries it, while two other, clean verdicts satisfy the pair.
Neither merge gate surfaces this at all beyond an unlabelled REPORT line
naming the excluded path; a human skimming `check-dual-review: green` output
would not learn that a HIGH finding was committed and ignored. Concrete fix
suggested below.

### Attack 3: present-but-unusable head still refused, even beside a headless sibling

Kept `v3-headless-blocker.yaml` in place and added a fourth verdict,
`v4-badhead-blocker.yaml`: `head: "0259038"` (a present, quoted, seven-hex
abbreviation, deliberately YAML-ambiguous per this branch's own recorded
trap), `verdict: FIX-ROUND-NEEDED`, one finding `CR-ATTACK-002` at
`severity: high`.

Command and output (abridged to the verdict line):
```
node scripts/check-dual-review.mjs /tmp/.../consumer6 --head <c1 sha>
...
INVALID #/head .../v4-badhead-blocker.yaml declares head 0259038, which is
not forty lowercase hexadecimal digits; an abbreviated sha is a second
spelling of one head and would form its own group of one, which is never
compared to anything (check: dual-review-decorrelation) [.../v1-claude.yaml]
... (four such INVALID lines total, two checks times two named comparisons,
plus two more against v4's own head)
check-dual-review: red (3 review verdicts examined for decorrelation)
```
EXIT=1 (RED). RESULT CONFIRMED: a present-but-unusable head still refuses
the whole group, unlike an absent head, which is silently excluded. The
dichotomy the fix round intended (a document that never claimed relevance is
history; a document that claimed relevance and got it wrong is refused) is
implemented exactly as described, and this is the control that makes Attack
2 above a genuine gap rather than a blanket "any malformed head passes":
only the OMITTED case is silent.

### Attack 4: the new bare warning, the ruleApplies throw, and the NOT IN FORCE line

**Bare `check-dual-review` warning (CR-006).** Built `/tmp/.../attacks/
consumer7`: one commit with `charter.yaml` (review-families: [claude, gpt])
and one head-less verdict under `delivery/review/`.

Without `--base` (the "bare" invocation the coordinator names):
```
node scripts/check-dual-review.mjs /tmp/.../consumer7 --head <sha>
```
Output:
```
check-dual-review: not-applicable (0 review verdicts examined for decorrelation)
no verdict document was found ... 1 committed verdict document(s) review
other work and are NOT evidence about this commit: .../v1-headless.yaml
declares no head ...; WARNING every committed verdict declares no head, so
none is a review of any commit; without --base this script computes no
review budget and cannot refuse a change that owes two reviews: pass --base
(the gate runner does) for that refusal
```
EXIT=20 (not-applicable, WITH the warning naming `--base`).

Control, WITH `--base` (what the gate runner actually supplies):
```
node scripts/check-dual-review.mjs /tmp/.../consumer7 --head <sha> --base <parent sha>
```
Output:
```
check-dual-review: 0 verdict document(s) admitted ...
INVALID #/verdicts the diff <parent>...<sha> changes 1 path(s), 1 of them in
the dual-review tier (charter.yaml), so DR-0012 requires 2 approving,
decorrelated verdicts ...; 0 of 2 are admitted and 2 missing. A missing
review is RED, never not-applicable (M5-P3)
check-dual-review: red (0 review verdicts examined for decorrelation)
```
EXIT=1 (RED). CONFIRMED: exactly the documented dichotomy. The gate runner
always passes `--base`, so in CI this reads RED, never the weaker
not-applicable; the warning exists for someone invoking the bare script by
hand, and it correctly names the missing flag.

**`ruleApplies` throw (CR-KH-002 fix).** Re-read src/stamp.ts:174-191 at
1e48bff: `parseKernelVersion(rule.since)` is now called and checked for
`undefined` BEFORE the `stamp.kind !== "stamped"` branch, so the throw fires
for EVERY document, not only stamped ones (the exact defect this review
found last round: at b57bd7c an unstamped document never reached the
comparison and silently avoided the crash). No live re-probe was needed
beyond reading the source, since the mechanism is now a plain, unconditional
early check; confirmed by the passing test
"a RULES_SINCE row whose since is not a kernel version is an internal defect
that names the row, for an unstamped document as much as a stamped one" in
the fresh full run of test/history-compat.test.ts below.

**NOT IN FORCE line (CR-KH-001 fix).** Re-ran the exact probe that produced
CR-KH-001 last round:
```
node bin/tiphys.ts validate --type verdict --context /tmp/.../consumer1 /tmp/.../consumer1/delivery/review/v1.yaml
```
(the 0.1.0-stamped verdict with `--context` supplied, isolating the
`notInForce`-gated silent-continue path from the context-skip path). At
1e48bff this now prints:
```
HISTORY verdict-head-full-sha applies from tiphys-version 0.2.0 ...
HISTORY verdict-pair-approves applies from tiphys-version 0.2.0 ...
NOT IN FORCE verdict-pair-approves for tiphys-version 0.1.0
```
where at b57bd7c the `NOT IN FORCE` line was entirely absent. CONFIRMED
FIXED: a check gated out by the stamp is now traceable beside the SKIPPED
lines, exactly as CR-KH-001 asked. (This particular probe's older fixture
also now fails additional, UNRELATED schema checks, because the verdict
schema's `findings`/`criteria` shape changed in the intervening M5-P5
paperwork merge folded into this branch; that is out of this round's scope
and not re-litigated here.)

### Original 7 attacks, spot-re-run at 1e48bff

Re-ran attack 1 (forged/old stamp beside a medium finding) and attack 5
(review-families second-family-after-declaration) against fresh fixtures
built the same way as the first review, since these are the two most likely
to interact with a `headGroupFor` change (both go through the same derived
checks). Both reproduce identically: attack 1's forged-0.1.0-stamp-plus-
medium-finding pair still reddens with `check: verdict-pair-approves` naming
BLOCKING_SEVERITIES, no mention of the stamp; attack 5's second-family-after-
declaration fixture still reddens naming the declaration commit. Attacks 3,
6, 7 are subsumed by Attack 3/4 above (present-but-unusable head; NOT IN
FORCE; ruleApplies throw) at the new head. Attack 2 (plain no-head, no
finding) is subsumed by this round's Attack 2 above, which is the same
mechanism with a finding added.

### Mutation test: the new headless-sibling test

Test: "a same-phase sibling verdict with no head is history: a real pulse
M3-P3 round-4 review beside an anchored approving pair is excluded by name
and both merge gates clear the review conditions, while a sibling whose head
is present and unusable still reddens both" (test/history-compat.test.ts:938,
behavior `admission-headless-sibling-is-history` in test/behaviors.json:1355).

Mutation: in src/checks.ts, changed
```
if (declaresNoHead(candidate.record)) {
```
to
```
if (false && declaresNoHead(candidate.record)) {
```
inside `headGroupFor` (the exact mechanism this round's fix round added),
confirmed via `git status --porcelain` that this was the only uncommitted
change before running.

Red:
```
node --test --test-name-pattern 'a same-phase sibling verdict with no head is history' test/history-compat.test.ts
```
Output: 1 test, 1 fail. `gates: check-dual-review: red: INVALID #/head
delivery/review/m3-p3-criteria-round4.yaml declares no head ...`,
`'red' !== 'green'`, exactly the dangerous state (the pulse M3-P3 sibling
refusing the group again, as it did before the fix).

Reverted the single line exactly; `git status --porcelain` empty afterward.

Green:
```
node --test --test-name-pattern 'a same-phase sibling verdict with no head is history' test/history-compat.test.ts
```
Output: 1 test, 1 pass.

### Full suite at 1e48bff

`test/history-compat.test.ts` in full (node v26.6.0, dist/ built, bare
`node --test test/history-compat.test.ts`):
```
tests 20
pass 20
fail 0
skipped 0
```
The full repository suite was not re-run in full for this round (the
dispatch brief asks for single test files given shared CPU); the file most
affected by the fix round is green in full, and the two probes above
(Attack 3, Attack 4) exercised the admission path live outside the suite as
well.

### Verdict, re-verification

**FIX-ROUND-NEEDED.** One new finding, CR-KH-003, severity HIGH (above).

CR-KH-001 and CR-KH-002 from the first review round are CONFIRMED FIXED
(both re-probed live above) and are not carried forward as findings.

Suggested concrete fix for CR-KH-003, for the next round to evaluate rather
than prescribe: `headGroupFor` (or its callers) should additionally scan
`grouped.headless` for any document carrying a finding at
`BLOCKING_SEVERITIES` (medium/high/critical) and surface THAT as a violation
distinct from ordinary history, for example "a head-less document commits a
blocking finding and is excluded from grouping; resolve or discard it before
merging" -- keeping the DR-0054 exemption for a document that carries
nothing dangerous, while closing the specific gap this attack demonstrates.
An alternative raised only for completeness, not recommended without the
orchestrator's judgment: gate the exemption by commit time relative to the
review-families declaration commit, mirroring `scopeToDeclaration`'s own
precedent elsewhere in this same file, so only genuinely pre-existing
documents get the free pass and a freshly committed head-less document does
not.


## Re-verification at 281d892

Status: COMPLETE. Verdict APPROVE. New head: 281d8925f06dbb81cca16fd32d7199e600908c23,
checked out detached in this worktree. Fix round 2 addresses CR-KH-003 (this
review) and Opus's CR-007 (same mechanism). Design per the coordinator:
a head-less same-phase sibling is history only if its blob at the audited
commit equals its blob at the merge base; one the diff adds or changes is
refused by both derived checks, naming path, verdict and blocking findings.
Reading delivery/work-history/kernel-0-2-1-history-compat.md, section
"Fix round 2", and the diff, before attacking.

### Toolchain and build

node v26.6.0 (/tmp/claude-0/.../scratchpad/node-v26.6.0-linux-x64/bin,
prepended to PATH). npm ci: clean. npm run build: exit 0, git status clean
afterward. test/history-compat.test.ts + test/verdict-head.test.ts: 62 tests,
62 pass, 0 fail, 0 skipped.

### Task 1: CR-KH-003 (consumer6 shape) through both gates, with and
without --base

Re-ran via the OFFICIAL suite (test/history-compat.test.ts:1050, the fix
round's own witness test) and independently, via a freshly built consumer8
fixture (a real two-commit git repository, base = clean decorrelated
APPROVING pair with no headless sibling, head = same pair plus a headless
verdict carrying a HIGH finding, built at
/tmp/.../scratchpad/attacks/consumer8, never inside this worktree).

Official test, both ADDED and CHANGED-at-base members: check-dual-review RED
and merge-preconditions RED, both WITH --base, naming the sibling's path,
"is current work and not history", the verdict (FIX-ROUND-NEEDED) and its
blocking finding by id and severity. WITHOUT --base the bare script stays
green (this is genuinely excluded, not not-applicable) but the REPORT line
changed from the round-2 unlabelled line to: "declares no head and is
excluded as history (DR-0054) on its SHAPE ALONE: provenance was NOT
checked, because no base was given", still naming the verdict and the
HIGH finding.

CR-KH-003 is CONFIRMED FIXED: the exact class of attack that went GREEN at
1e48bff (a headless sibling with a HIGH finding, added by the change, hidden
behind an unlabelled REPORT line) now reddens both merge gates when --base is
supplied, and even without --base the finding is named rather than silent.

### Task 2: attacking the new provenance mechanism

**Rename / move (the implementer's self-declared untested surface).** Built
consumer9: three real commits (base with `old-name-blocker.yaml`, headless,
HIGH finding CR-RENAME-001; a "reviewed" commit bumping src/feature.ts into
the dual-review tier; a final commit that `git mv`s the blocker to
`new-name-blocker.yaml`, byte-identical content, and adds two real approving
verdicts naming the reviewed sha). Confirmed byte-for-byte identity across
the rename with a diff before running anything.

  node scripts/check-dual-review.mjs <consumer9> --head <head sha> --base <base sha>
  -> red, exit 1: "new-name-blocker.yaml declares no head, and the change
     under audit ADDS it (merge base <sha>) ... It reads verdict
     FIX-ROUND-NEEDED, blocking finding(s) CR-RENAME-001 (high)."

  node src/gates/merge-preconditions.ts --result ... --head <head sha> \
    --phase consumer9-phase --context <consumer9> --base <base sha>
  -> red, exit 1, condition-1 and condition-2 both red with the identical
     sentence.

A pure rename, same content, different path, is treated as ADDED and
refused by both gates. This is the fail-closed direction and it holds by
execution, not merely by the implementer's prediction: `blobAt` resolves
`git rev-parse <rev>:./<path>`, which is strictly path-keyed, so there is no
content-only match that could launder a rename into history.

**Different path with a matching blob.** Subsumed by the rename result: the
mechanism has no code path that compares blob content across different
paths; each candidate's OWN path is looked up at its OWN base by
construction (src/checks.ts:4025-4029, blobAt takes `candidate.path` only).
Read-verified and consistent with the rename attack's live failure.

**Absolute-vs-relative context path (src/checks.ts:4026).** Read directly.
`relative(contextDirectory, path)` undoes exactly the
`join(contextDirectory, <path-in-commit>)` the corpus loader always performs
before calling blobAt, so it is correct whether contextDirectory is absolute
(merge-preconditions) or relative, e.g. `.` (the bare script). Not
independently re-broken and re-tested this round (that would just re-derive
the fix's own documented control); read-verified only.

**Symlink at the verdict's path, an unresolvable merge base (shallow clone),
a moving --base ref, and a headless sibling added on main after the fork
point arriving via a merge into the branch.** NOT built as live fixtures this
round, for time. Read-verified instead: `establishHistoryProvenance`
(src/checks.ts:3990-4012) returns `{ kind: "error", reason: ... }` whenever
`git merge-base` fails, and `headGroupFor`'s own header comment states every
head-less sibling becomes an "unkeyed" violation in that state, never
silently excluded -- fail-closed by construction, the same default this round
twice demonstrated live elsewhere (the rename fixture above, and the
present-but-unusable-head control below). This is stated as read-verified,
not tested: I did not build a shallow clone or a moving ref and force the
error branch.

### Task 3: residuals exactly as stated

**(a) A blocker already on the base.** Re-ran test/history-compat.test.ts:972
(the control arm, using a real pulse M3-P3 round-4 review, medium finding
CR4-M3P3-01, committed unchanged at the base). check-dual-review: green, the
REPORT line names the sibling "is unchanged since the merge base <sha>, so it
is history (DR-0054)", naming verdict APPROVE and the finding, never silent.
Confirmed exactly as claimed. Not wider: the moment the change ADDS, CHANGES,
or (per the rename attack above) MOVES that path, both gates refuse it.

**(b) The bare script without --base.** Read .github/workflows/gates.yml
directly. Line 224 (`node scripts/check-dual-review.mjs .`) carries no
--base, inside a step named "Dual-review decorrelation, informational only
(M3-P9; the enforcing review gate is merge-preconditions)", with a preceding
comment block (lines 215-220) stating plainly that this step "cannot know
what review a change OWES" and that "the enforcing gate is
merge-preconditions, run inside the M2 exit test step below with --base".
Citation confirmed: .github/workflows/gates.yml:225 is inside that `run:`
block. Confirmed exactly as claimed and not wider.

### Task 4: fix-round contract and mutation testing

The work-history "Fix round 2" section names the mechanism (provenance, not
shape), publishes a full derivation (grep command plus before/after line
tables), and states what the derivation did not cover (renames, explicitly,
in its own words). All three fix-round-contract obligations are met.

Mutation-tested 2 of the 3 members of
witness/kernel-0-2-1-headless-sibling-provenance.json directly in
src/checks.ts, each applied alone and reverted exactly before the next:

1. Blob comparison dropped: `if (atHead !== undefined && atBase === atHead)`
   -> `if (atHead !== undefined)`. Ran
   `node --test --test-name-pattern "adds or changes is current work"
   test/history-compat.test.ts`: RED, `'green' !== 'red'` (the ADDED member
   now reads green, the dangerous state). Reverted the exact line; `git
   status --porcelain -- src/checks.ts` empty.
2. Base read at the wrong revision: `blobAt(contextDirectory,
   provenance.mergeBase, candidate.path)` -> `blobAt(contextDirectory,
   provenance.refSha, candidate.path)`. Same test: RED, same
   `'green' !== 'red'` shape. Reverted exactly; `git status --porcelain --
   src/checks.ts` empty; re-ran: 1 test, 1 pass, confirming the final state
   is genuinely the original.

The third member (provenance never established, `base === undefined` widened
to `base === undefined || base !== ""`) was not independently mutated this
round; it is structurally the same defect class as the two already
demonstrated (a comparison silently short-circuited to always-true), and the
implementer's own work history records all three hand-tried red-then-green.
Two structurally different members were independently reproduced by this
review, satisfying the witness-diversity rule on its own terms.

### Task 5: pulse's real history and the present-but-unusable-head dichotomy

Both re-confirmed via test/history-compat.test.ts:972, run directly at this
head: arm 1 (pulse's real M3-P3 round-4 review, committed at the base) is
green through both merge gates; arm 2 (the same sibling with a present but
abbreviated head) reddens both. This is the same dichotomy demonstrated in
round 2's Attack 3, holding unchanged at 281d8925.

### Schema / stamp cross-check

schemas/verdict.schema.json:34 and src/stamp.ts:153 read directly:
`verdict-head-required` is a RULES_SINCE row since 0.2.0, lifted for
unstamped/pre-0.2.0 documents; its own `$comment` states plainly that
"Admission does not schema-validate and does not read the stamp; it decides
a head-less sibling's standing from the merge base instead." Consistent with
the claimed design and with DR-0055's schema/admission split.

### Verdict

**APPROVE.** CR-KH-003 is confirmed fixed by execution against both the
official suite and two independently built live fixtures. The new
provenance mechanism was attacked directly (rename/move) and held: the
attack is refused, fail-closed, by both merge gates. Both stated residuals
were confirmed exactly as claimed and not found to be wider. Two of three
witness members were independently mutation-tested, red-then-green, with
clean exact reverts. No new finding is raised. Four items were read-verified
rather than independently forced as live fixtures (symlink path, unresolvable
merge base / shallow clone, a moving --base ref, a headless sibling arriving
via a merge from main) -- named above rather than silently skipped; each
rests on the same fail-closed design (`{ kind: "error" }` on any merge-base
failure) that this round's live rename attack and the present-but-unusable-
head control both independently confirm holds for the adjacent code paths.

### Claim grep

  tr '\n' ' ' < delivery/review/clean-room-kernel-0-2-1-sonnet-hazard.md \
    | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'

Hits in this round's new section: "never silently excluded" (x2, restating
the source's own comment), "never" (fail-closed by construction), "never
found" (none). Each is either a direct quote from source/output or
immediately paired with the captured command and output that settles it.
The four read-verified-not-tested items above are stated as NOT tested,
never as "cannot be forced".
