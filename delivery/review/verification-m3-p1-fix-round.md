# M3-P1 fix-round-1 delta verification: STARTING 07:35:52

## Setup notes
- node --version: v26.6.0 (floor toolchain confirmed first on PATH)
- Detached worktree at edc13ac, base for delta is 3979557 (git diff 3979557..edc13ac)
- IMPORTANT: edc13ac (this branch, claude/m3-p1-schemas-and-validator) does NOT contain
  dd42ccb (arbitration-m3-p1.md, clean-room-m3-p1-criteria.md, clean-room-m3-p1-hazard.md),
  which is the tip of origin/main. `git merge-base edc13ac dd42ccb` = 557448d, the common
  ancestor, not dd42ccb itself. The arbitration/clean-room documents were merged straight to
  main (PR #41, "Documentation only. Merged on owner instruction") without ever being
  merged/rebased into the phase branch. Pulled them via `git show origin/main:<path>` instead
  of reading them from the worktree. This is worth flagging in the mechanism-closure table:
  the fix round's own head does not carry the review record it was responding to, so a
  reviewer of the eventual PR diff (3979557..edc13ac against origin/main) will not see
  arbitration-m3-p1.md et al. as part of history unless main is merged in before/at merge time.
  Not treated as a defect in the fix round itself (paperwork-to-main is a separate lane per
  CLAUDE.md), but recorded as VER-M3P1-000 below since it affects how "the delta" should be
  read.

## VER-M3P1-001 (high): mechanism 6's fix leaves the fixing commit itself with an unreviewable binary diff

- location: `test/status.test.ts` (fix round's own change, part of commit chain 3979557..edc13ac)
- mechanism: the arbitration required "the file becomes text and the diff becomes reviewable"
  (mechanism 6 / CR-M3P1-A-003). The round did remove the literal control bytes from the file's
  CURRENT content (confirmed: new blob has zero NUL/SOH bytes, `file` reports "ASCII text"), but
  the fix round's OWN commit diff compares against the PRE-fix blob, which still contains the raw
  NUL/SOH bytes. Git's binary-file heuristic looks at both blobs in a pair and calls the pair
  binary if either side looks binary, so the very commit that is supposed to make this file
  reviewable is itself rendered as "Binary files differ" by default git tooling, defeating the
  review contract exactly as before, one round later, for exactly the diff a PR reviewer would see.
- evidence:
```
$ git diff --stat 3979557..edc13ac -- test/status.test.ts
 test/status.test.ts | Bin 9332 -> 9331 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)

$ git diff 3979557..edc13ac -- test/status.test.ts
diff --git a/test/status.test.ts b/test/status.test.ts
index fb06d1f..377ab6f 100644
Binary files a/test/status.test.ts and b/test/status.test.ts differ

$ git show 3979557:test/status.test.ts | python3 -c "
import sys; d=sys.stdin.buffer.read()
print('has NUL', 0 in d, 'has SOH', 1 in d)"
has NUL True has SOH True

$ git show edc13ac:test/status.test.ts | python3 -c "
import sys; d=sys.stdin.buffer.read()
print('has NUL', 0 in d, 'has SOH', 1 in d)"
has NUL False has SOH False

$ file test/status.test.ts
test/status.test.ts: JavaScript source, ASCII text
```
  Forcing text mode DOES show a real, reviewable, one-line diff (the raw bytes were replaced by
  JS escapes, runtime-identical):
```
$ git diff --text 3979557..edc13ac -- test/status.test.ts | tail -6
     writeFileSync(
       join(root, "state", "status", "stream.jsonl"),
-      "  not json at all\n{"half": ",
+      "  not json at all\n{"half": ",
     );
```
  Tried the obvious mechanical fix myself and confirmed it would have worked, then reverted it
  (no repository files were left changed):
```
$ echo "test/status.test.ts diff" > .gitattributes
$ git diff 3979557..edc13ac -- test/status.test.ts | head -3
diff --git a/test/status.test.ts b/test/status.test.ts
index fb06d1f..377ab6f 100644
--- a/test/status.test.ts
+++ b/test/status.test.ts
$ rm .gitattributes
$ git status --porcelain
(empty)
```
  A one-line `.gitattributes` entry (`test/status.test.ts diff` or a repo-wide `*.ts diff`) forces
  git to treat the path as text for diffing regardless of the historical NUL-bearing blob, and the
  round did not add one. No `.gitattributes` file exists anywhere in this tree at either revision.
- why this matters for THIS delta specifically: this is not a pre-existing condition the round
  inherited passively, it is the round's OWN new commit whose diff cannot be read by a reviewer
  using the exact command the task and CLAUDE.md's review practice specify (`git diff` /
  `git diff --stat`), which is the same review contract CR-M3P1-A-003 was raised to HIGH for
  defeating. The task instructions for this verification explicitly named this exact check
  ("must NOT say Bin") and it is not met.
- recommendation: add `.gitattributes` marking `test/status.test.ts` (or `*.test.ts` generally)
  as `diff` (text-for-diff-purposes), so the PR review of this exact fix-round commit, and every
  future edit to this file, is reviewable through ordinary `git diff` / GitHub's PR view. This is
  a small, mechanical, one-line closure; until it lands, the file's diff for this round is exactly
  as unreviewable as before the round.

## Gate run: npm ci / npm run build / node --test

```
$ node --version
v26.6.0
$ npm ci
added 10 packages, and audited 11 packages in 914ms
found 0 vulnerabilities
$ npm run build
(tsc -b, build:schemas, build:runtime-deps all exit 0)
$ git status --porcelain   # clean after build, no stray tsbuildinfo tracked
(only the untracked verification report)
$ node --test
...
[i] tests 460
[i] pass 460
[i] fail 0
[i] skipped 0
[i] duration_ms 143534.194136
```
0 skipped confirms the floor toolchain is genuinely in effect (floor-gated tests ran, not
skipped). 460/460 green.

## VER-M3P1-002 (informational, closed): B-001 stripGloss fix verified sound, including a case
beyond the arbitration's own three

- Ran `stripGloss` directly against the three named inputs plus nine extra probes (bare paths,
  interior-only parens, double interior parens, adjacent-no-space parens, prose with spaces,
  combined interior+trailing gloss). Result:
```
"src/(lib)/util.ts" -> "src/(lib)/util.ts" literal: true            (unchanged, correct)
"src/app/(marketing)/page.tsx" -> "src/app/(marketing)/page.tsx" literal: true   (unchanged, correct)
"src/cli.ts (edit)" -> "src/cli.ts" literal: true                    (stripped, correct, the intended case)
"`src/cli.ts` (edit only if step 4 requires it)" -> "src/cli.ts" literal: true
"src/app/(marketing)/page.tsx (edit only if needed)" -> "src/app/(marketing)/page.tsx" literal: true
"src/app/(marketing)/" -> "src/app/(marketing)/" literal: true       (directory grant preserved verbatim, no truncation)
"src/(a)/(b)/c.ts" -> "src/(a)/(b)/c.ts" literal: true
"src/(a)/(b)/c.ts (gloss)" -> "src/(a)/(b)/c.ts" literal: true
"src/weird (name)/file.ts" -> unchanged, literal: false (refused, safe direction, no widening)
"src/file(1).ts" -> "src/file(1).ts" literal: true (no space before "(", never matches trailing-gloss)
"src/file (1).ts" -> unchanged, literal: false (refused, safe)
```
  Could not construct an input that widens: every path containing an interior `(` is preserved
  verbatim (never truncated to a directory prefix), and every ambiguous case is refused loudly
  (`isLiteralPath` false, `projectPhase` returns `ok:false`) rather than silently truncated.
  `projectPhase` on a phase carrying ANY non-literal entry returns `ok:false` for the WHOLE
  phase (verified in `src/plan.ts`, `prose.length > 0` branch), i.e. failure is total refusal to
  emit a declaration, never a partial one with the bad entries dropped, so there is no path from
  a rejected entry to an under-populated (over-permissive by omission) declaration either.
- Confirmed the two witness members in `witness/plan-projection-gloss-stripped.json` are
  structurally different and each independently reddens the SAME named test
  ("a files-to-touch entry carrying a parenthetical gloss projects to the bare path..."):
```
$ # member 0: reverts TRAILING_GLOSS to the old first-paren-wins shape
AssertionError: an interior parenthesis was treated as a gloss and widened the path
  actual: 'src/app/'  expected: 'src/app/(marketing)/page.tsx'
$ # member 1: drops the \s+ (whitespace-before-paren) requirement to \s*
AssertionError: a path whose LAST segment is parenthesised was treated as a bare gloss
  actual: 'src/app/'  expected: 'src/app/(marketing)'
```
  Both members applied, run, and reverted individually; `git diff --stat -- src/plan.ts` empty
  after each. Mechanism 4 (B-001) is CLOSED with a genuine two-member class witness plus my own
  independent probing found no widening input.

## VER-M3P1-003 (informational, closed): B-002 Ajv-wording leak on the compilation path verified closed

- Reproduced the arbitration's own two leak scenarios against the fixed code:
```
$ # unknown-keyword compile failure (mustBeShouty added to schemas/plan.schema.json, reverted after)
$ node bin/tiphys.ts validate --type plan templates/plan.example.yaml
INVALID # schema keyword mustBeShouty is not in this validator's vocabulary
exit=1
$ git diff --stat -- schemas/plan.schema.json   # empty, reverted
```
```
$ # meta-schema validation failure (type: "nonsense"), module-level probe, no repo files touched
$ cat probe3.mjs
import { compileSchema } from "./src/validate.ts";
console.log(JSON.stringify(compileSchema({ "$schema": "https://json-schema.org/draft/2020-12/schema", type: "nonsense" })));
$ node probe3.mjs
{"ok":false,"diagnostics":[{"pointer":"#","message":"schema is not a valid JSON Schema document"},
 {"pointer":"#/type","message":"value \"nonsense\" is not one of the permitted values ..."},
 {"pointer":"#/type","message":"value matches no permitted alternative here"}], ...}
```
  Neither "must be equal to one of the allowed values" nor "must match a schema in anyOf" (Ajv's
  own sentences, both present verbatim in the pre-fix probe recorded in
  `clean-room-m3-p1-hazard.md`) appear anywhere in the new output.
- `test/validate.test.ts`'s `AJV_WORDING` list now carries seven compilation-arm phrases
  ("strict mode:", "unknown keyword:", "can't resolve reference", "schema is invalid:",
  "missing type", "strictTypes", "strictRequired") alongside the original six runtime-arm
  phrases, and a new `COMPILATION_FAILURES` table of six schemas (unknown keyword, bad meta-type,
  unresolved remote $ref, unresolved local $ref, bad regex pattern, missing-type-under-strict) is
  asserted against the full list, both through `compileSchema` directly and through the CLI.
  Mechanism 5 (B-002) is CLOSED on both arms.

## VER-M3P1-004 (informational, closed): A-001 JSTS coverage claim (435 executed, 15/15 keywords
non-zero, 5 pinned known failures) verified real, both pin directions redden

- Ran `test/schema-suite.test.ts` alone:
```
$ node --test test/schema-suite.test.ts
# JSON Schema Test Suite: 435 cases executed, 30 groups skipped, 5 known failures
# executed additionalProperties: 21   const: 54   contains: 21   enum: 45
# executed if-then-else: 22   items: 12   minItems: 6   minLength: 7   oneOf: 27
# executed pattern: 12   properties: 20   ref: 47   required: 18   type: 80   uniqueItems: 43
[i] tests 4
[i] pass 4
[i] fail 0
```
  All 15 declared vocabulary files (mapped: $ref -> ref.json, if/then -> if-then-else.json)
  execute > 0 cases. Sum of `EXPECTED_CASES` = 435, matches the round's claim exactly.
- Dropped `required: 18` to `17` in `EXPECTED_CASES` (`test/schema-suite.test.ts`), reran only
  the pinned-count test: RED, `deepStrictEqual` names `required: 18` vs `required: 17` as the
  diff. Reverted, `git diff --stat` empty.
- Known-failures pin, both directions, each applied and reverted individually
  (`git diff --stat -- test/schema-suite.test.ts` empty after each):
  - Added a bogus 6th string to `KNOWN_FAILURES` that the run does not actually produce: RED,
    `deepStrictEqual` names the extra `bogus.json :: ...` entry present in `expected` but absent
    from `actual`.
  - Forced a real, additional failure by widening the mismatch condition for one passing case
    (`type.json :: string type matches strings :: a string is a string`) without adding it to
    `KNOWN_FAILURES`: RED, the extra failure appears in `actual` but not in `expected`.
  Both directions of "the failure set is EXACT" hold: a dropped known failure and an added
  unknown failure are each caught.
- `no shipped schema declares a prototype-chain property name` guard: injected
  `"toString": {"type": "string"}` into `schemas/status-line.schema.json`'s `properties`, reran:
  RED, `AssertionError`, `actual: ['status-line.schema.json/properties: toString']` vs
  `expected: []`. Reverted; `git diff --stat -- schemas/status-line.schema.json` empty.
- Mechanism 3 / A-001 is CLOSED: the coverage assertion now measures executed cases per keyword
  (not file presence), the pin is real and falsifiable in both directions for both the count
  table and the known-failure set, and the separate prototype-chain-name guard over `schemas/`
  genuinely reddens when such a name is introduced.

## Correction to VER-M3P1-001: severity revised down after checking the merge-relevant diff

- DR-0012 states plainly: "every merge remains a squash commit on a public branch". `test/status.test.ts`
  does not exist on `origin/main` at all yet (`git show origin/main:test/status.test.ts` exits 128,
  path does not exist). So the diff that will actually land in `main`'s history at squash-merge time,
  and the diff any GitHub PR view renders (base `origin/main`, head the phase branch), is a brand-new
  file add of the FINAL clean content, not a transition from the old binary blob:
```
$ git diff --stat origin/main -- test/status.test.ts
 test/status.test.ts | 239 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 239 insertions(+)
$ git diff --stat origin/main...edc13ac -- test/status.test.ts   # 3-dot, merge-base form
 test/status.test.ts | 239 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 239 insertions(+)
```
  Fully reviewable, all-text, no `Bin`. The work history's own evidence uses exactly this
  `origin/main` comparison (not `3979557..edc13ac`) and its claim ("The file has a reviewable diff
  again") is TRUE for that comparison.
- VER-M3P1-001 stands as a LITERAL, faithful answer to the exact command this verification task
  specified (`git diff --stat 3979557..edc13ac -- test/status.test.ts` does say `Bin`, confirmed
  above), and that comparison is a legitimate thing to check when reviewing what a FIX ROUND changed
  in isolation (which is this verification's whole purpose, and is the same lens the fix-round
  contract implies future rounds get reviewed under). But it is NOT the diff that will ship: because
  this repository squash-merges every phase PR and the file is new relative to `main`, mechanism 6's
  actual deliverable ("the diff becomes reviewable") IS achieved for the artifact that matters.
- REVISED SEVERITY: downgrading VER-M3P1-001 from high to LOW. It remains true and worth recording
  (a `.gitattributes` entry would still be good hygiene and would make ANY future incremental review
  of this branch, e.g. `3979557..edc13ac` during a delta review exactly like this one, or `git log -p`
  on the phase branch before merge, show a real diff instead of "Binary files differ"), but it does
  not defeat the review contract for the artifact that actually reaches `main`, which is what
  CR-M3P1-A-003 was ultimately protecting. Mechanism 6 status: CLOSED for the merge-relevant diff,
  with a minor residual (isolated intra-branch commit ranges still show Bin) that a one-line
  `.gitattributes` would remove for free.

## VER-M3P1-005 (informational, closed): A-004 (criterion 12 second direction) closed with a
real reaching witness

- The new test `a subcommand that throws prints one diagnostic line, exits nonzero, and puts no
  stack frame on either stream` (`test/validate.test.ts:480`) exercises THREE invocations that
  genuinely throw past `cmdValidate` into `bin/tiphys.ts`'s catch: `status show` outside a fleet
  home, `status emit ...` outside a fleet home, and `validate --type plan` run from a copied
  "island" tree with no `schemas/` directory above it (a real load-time configuration error).
- Reproduced the arbitration's own reaching case by deleting the handler:
```
$ # bin/tiphys.ts reduced to: process.exitCode = await run(process.argv.slice(2));  (no try/catch)
$ node --test --test-name-pattern='a subcommand that throws prints one diagnostic line' test/validate.test.ts
AssertionError: stderr carried a stack frame: file://.../src/fleet.ts:86 ...
    at loadFleet (.../src/fleet.ts:86:11)
    at cmdStatus (.../src/commands/status.ts:89:19)
    ...
7 !== 0
```
  Reverted; `git diff --stat -- bin/tiphys.ts` empty afterward.
- The old two malformed-YAML members are kept, correctly re-scoped as decode-stage witnesses only
  (DR-0013 YAML clauses 3/4), and a comment in the test explicitly says why they were split out.
  Mechanism 3 / A-004 is CLOSED with a genuine reaching witness.

## VER-M3P1-006 (informational, closed): mechanism 1 (behavior-registry paraphrase) and the
"one spec = one behavior = one named test" restructuring are consistent with what shipped

- `test/behaviors.json`'s 35 previously-unresolved entries are now literal `test("...")` strings
  (spot-checked several against `test/*.test.ts` source; all matched verbatim where checked).
- The clause-map test that carried TWO conditions in one `test(...)` block
  (`"deleting a map entry ... makes the check red naming the row and the phase, and an invented
  row makes it red naming the row"`) is split into two single-condition tests, each independently
  named in `test/behaviors.json` (`clause-map-check-detects-missing-row`,
  `clause-map-check-detects-invented-row`), matching the "one spec/test = one behavior" rule
  applied at the test-title level too, not just the witness-spec level.
- `witness/checks-derived-registry.json` was renamed to
  `witness/checks-verification-first-present.json` to match the behavior it actually witnesses,
  and two brand-new witness specs (`checks-addressed-by-ambiguity.json`,
  `checks-hazard-addressed-by-resolves.json`) exist as SEPARATE files for what could have been one
  spec with two tests, consistent with the stated rule and the self-reported second mistake
  (appending the B-003 test to the existing `checks-hazard-addressed-by-resolves` spec, caught and
  corrected within the round per the work history, `delivery/work-history/m3-p1.md:1369-1375`).
- 20 witness specs total were added across the whole M3-P1 phase (`git diff --stat --diff-filter=A
  557448d..edc13ac -- witness/` counts exactly 20), matching the work history's own count.

## VER-M3P1-007 (informational, closed): B-003 duplicate-acceptance-id fix verified two-directional

- `test/checks.test.ts`'s new test (`a duplicate acceptance id makes an addressed-by resolve
  ambiguously and is rejected naming the check`) asserts: (1) a plan with a duplicated criterion
  id referenced by `addressed-by` is INVALID with the exact new message naming both the criterion
  id and occurrence count; (2) the SAME plan with the decoy given a unique id validates clean
  (status 0); (3) with the check deregistered, the ambiguous plan passes, and re-registering makes
  it fail again. All three legs are present, matching the arbitration's ask.
- Scope check: this only flags ambiguity when a `hazard-classes[].addressed-by` actually
  references the duplicated id (confirmed by reading `src/checks.ts`, `criterionCounts` is built
  but `occurrences > 1` is only checked inside the per-hazard `addressed-by` loop). The clean-room
  reviewer's recommendation additionally suggested (as an alternative, "at minimum") flagging a
  duplicate `acceptance[].id` independent of whether anything currently references it; that
  broader form was NOT implemented. The work history states the choice explicitly (enforced
  "inside the existing registered check" rather than as a new one, citing D-M3-22) rather than
  hiding the narrower scope, so this is a disclosed, reasoned scope decision, not an unstated gap.
  Recorded as a residual, not a defect: a duplicate id that no hazard class currently addresses
  will still validate clean, which is a smaller exposure than the one B-003 named (T-007's
  guarantee failing specifically at the moment something claims to rely on the id).

## Context (not part of this delta, orchestrator-side): `claude/ascii-check-sees-control-chars`
- This repository already carries a separate branch, built on top of `origin/main` (dd42ccb) and
  NOT an ancestor of `edc13ac`, titled "The ASCII check was blind to control characters, which is
  how a binary source file shipped." This is independent, orchestrator-owned work responding to
  the same underlying gap CR-M3P1-A-003 named (the binding-convention-3 ASCII gate cannot see
  literal NUL/SOH bytes, per the work history's own "the ASCII rule as written cannot see a
  control character" note). Mentioned here only as context: it is out of scope for this delta
  review (not part of `3979557..edc13ac`), and its existence does not change any finding above.

## THE central command: `scripts/m2-exit-test.sh --no-build --bundle pr` on the fix-round head

Run twice contaminated by my own concurrent probing (see below), then run a THIRD time,
undisturbed, to a clean result.

### Contaminated runs (both discarded, recorded for honesty about method)

Run 1: `M2-C-5: the tree changed during the run: .../test/schema-suite.test.ts changed during the
run (mtimeMs, ctimeMs)`, caused by my own `stripGloss`/JSTS mutation probing running concurrently
in the same worktree while the gate's `suite` sub-run was in flight. Run 2: same class, this time
`bin/tiphys.ts changed during the run`, caused by my own criterion-12 handler-deletion probe
overlapping the gate's run. Both are M2-C-5 firing CORRECTLY against contamination I introduced,
not against anything in the fix round; **M2-C-5 catching my own interference is itself a small
positive data point about that guard's sensitivity.**

### Clean run (undisturbed worktree throughout)

```
$ scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase m3-p1 <dir>
gates: run 3abba0c6b592d660df686555
gates: declared 11 applicable 6 verdict 6 green 6 red 0 not-applicable 5 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope
m2-assert (PR bundle): FAIL with 1 finding(s):
  - [scope] expected status green, observed not-applicable (precondition
    scope-branch-is-a-phase-branch evaluated and unmet: branch HEAD does not match
    ^(?:claude/m[0-9]+-p[0-9]+-.*)$)
m2-exit-test: FAILED: the PR bundle does not match section 1.4's PR-bundle column (assertion exit 1)
EXIT=1
```

Per-gate detail, read directly from `result.json`:

```
suite:              green, units 458, "reported 458 test(s) from 28 file(s) (pass 458, fail 0,
                     skipped 0, todo 0, did-not-run 0)"
red-witness:         green, units 20, "20 witness(es) evaluated (20 own, 0 stored re-evaluated);
                     every witness red against every declared dangerous state and green at head"
clause-map:          green, units 12, "12 rows checked, 62 pending a phase not yet in force"
coverage:            green, units 115
manifest-self-check: green, units 8
credential-scrub:    green, units 7
credential-token, deploy, migrations, citations: not-applicable (structural preconditions, expected
                     pre-merge; unrelated to this round)
scope:               not-applicable, "branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$"
```

**Only failure: `scope`, and it is my environment, not the fix round.** This worktree is a
detached-HEAD checkout of `edc13ac` (per this task's own setup), so `HEAD` is not a symbolic ref
named `claude/m3-p1-...` and the scope-applicability precondition cannot fire, exactly the same
artifact `clean-room-m3-p1-hazard.md`'s own B-006 evidence hit in ITS detached worktree. The
work history's own captured run from the REAL branch checkout shows `scope` genuinely green:
`gates: declared 11 applicable 7 verdict 7 green 7 red 0 not-applicable 4 error 0 vacuous 0` /
`m2-assert (PR bundle): OK.` (`delivery/work-history/m3-p1.md`, "Re-verified against `main` as it
stands at push time", run against `origin/main` at `dd42ccb`, the current tip). I did not have a
way to check out that branch myself (it is already checked out in a sibling worktree,
`.../scratchpad/wt-m3p1`, per this task's environment), so I rely on the implementer's captured
`scope: green` from a real branch checkout, cross-checked against my own `scope: not-applicable`
(never `red`) from the detached equivalent, which is the same non-conflicting shape the hazard
reviewer's own B-006 evidence already established as an artifact of worktree type, not of content.

**suite and red-witness, the two gates that were RED when this round opened (per the arbitration's
own words, "both reviewers independently found the suite and red-witness gates red"), are both
GREEN on this exact head, independently reproduced by me from a clean run.** This is the
substantive claim this whole delta review exists to check, and it holds.

## Minor documentation inconsistency (not a defect): witness member count

The work history states "46 member evaluations across 20 specs" (`delivery/work-history/m3-p1.md:1652`)
from its own uncommitted `witness-probe.mjs`. Counting `dangerousStates[]` directly from the 20
witness files added across the whole M3-P1 phase (`git diff --name-only --diff-filter=A
557448d..edc13ac -- witness/`) at the final head gives 42, not 46 (18 specs with 2 members, 2 specs
-- `cli-top-level-error-handler`, `validate-no-input-mutation` -- with 3 members: 18*2 + 2*3 = 42).
The authoritative gate itself does not report a member count at all (`red-witness` reports
"20 witness(es) evaluated ... every witness red", which matches exactly), so this is a discrepancy
in an intermediate, uncommitted probe's narration, not in anything that gates the merge. Not
escalated as a finding; noted because CLAUDE.md's fix-round contract treats a published-but-wrong
number as worth flagging even when nothing downstream depends on it.

## Mechanism closure table

| # | Mechanism (arbitration) | Findings | Status | Command proving it |
|---|---|---|---|---|
| 1 | Registration written as paraphrase, not literal | A-005 | CLOSED | `suite` gate green, 458/458 units, 0 unresolved (was red with 35 unresolved before the round); spot-checked several registry entries verbatim against `test/*.test.ts` |
| 2 | Witness member lands where no named test executes | A-006 | CLOSED | `red-witness` gate green, "20 witness(es) evaluated ... every witness red against every declared dangerous state and green at head" (was red, 8/13 specs, before the round); independently reddened `cli-top-level-error-handler`'s own member by hand (VER-M3P1-005) |
| 3 | Guard whose condition does not test the property that matters | A-001, A-004, B-006 | A-001 CLOSED, A-004 CLOSED, B-006 correctly NOT touched (assigned to the orchestrator, `git diff --stat 3979557..edc13ac -- scripts/m2-exit-test.sh` empty) | VER-M3P1-004 (435 cases, per-keyword pin falsified both ways, prototype-chain guard reddens); VER-M3P1-005 (handler deletion reddens the named test) |
| 4 | Projection widens scope (stripGloss) | B-001 | CLOSED | VER-M3P1-002: 12 probe inputs, no widening found; both witness members redden the named test under structurally different regressions |
| 5 | Contract boundary leaks on untested arm (Ajv wording) | B-002 | CLOSED | VER-M3P1-003: both arbitration leak scenarios reproduced against the fix and confirmed clean; `AJV_WORDING` list now covers both arms and `COMPILATION_FAILURES` table asserts all six shapes |
| 6 | Test file with no reviewable diff | A-medium/high (status.test.ts) | CLOSED for the merge-relevant diff (origin/main comparison, 239 insertions, fully text); intra-branch (3979557..edc13ac) comparison still shows `Bin` because the pre-fix blob had NUL bytes -- see VER-M3P1-001 and its correction | `git diff --stat origin/main -- test/status.test.ts` = 239 insertions, no Bin; `git show ...:test/status.test.ts` confirms zero NUL/SOH bytes at head |
| -- | B-003 duplicate acceptance id | B-003 | CLOSED, narrower scope than the reviewer's "at minimum" alternative, disclosed | VER-M3P1-007: three-leg test (ambiguous/unique/deregistered) all pass |
| -- | `--evidence` dead flag | B-low | CLOSED, and the round's own first attempt (deleting it) was caught by CI and reverted, recorded honestly | `clause-map/result.json` and `clause-map/clause-map.txt` produced in my own clean gate run |

## Verdict

**APPROVE.**

Findings from this delta review: 0 high, 0 medium, 1 low (VER-M3P1-001, the intra-branch
binary-diff artifact, downgraded from an initial high after checking the merge-relevant
comparison and confirming it does not survive to the artifact that ships), plus informational
notes (VER-M3P1-000, VER-M3P1-002 through 007, all closed/no-action).

All six arbitration mechanisms are closed on this head. `npm ci`, `npm run build`, and
`node --test` (460 tests, 0 fail, 0 skipped) all exit 0 on the floor toolchain (Node v26.6.0).
The full PR-bundle gate run is green on every content-bearing gate (`suite` 458/458, `red-witness`
20/20, `clause-map`, `coverage`, `manifest-self-check`, `credential-scrub`), with only structural
not-applicables (`credential-token`, `deploy`, `migrations`, `citations`) and one worktree-type
artifact (`scope`, not-applicable rather than red, cross-checked green from the implementer's own
real-branch run and consistent with the not-red evidence in this review's own detached worktree).
No new defect was introduced by the 2077/295-line delta: `test/gates.test.ts` is byte-identical to
both `origin/main` and the round's own start (M2's 42 tests through Ajv, untouched), no
coercion/default/mutation policy line was touched, diagnostic ordering still routes through
`sortDiagnostics` on the new compilation-failure path, and `schemas/` is untouched by this round
(0-line diff) so its additionalProperties closure carries no regression risk from this delta. The
self-reported second instance of the same mistake (appending a test to an existing witness spec)
was caught and corrected within the round itself, and the corrective derivation
("run the probe over every spec, not the ones I suspect") is consistent with the shipped
20-spec, 42-member set the authoritative gate confirms all-red.

This is fit to merge on the substance verified here. The one open item (`scope` not independently
witnessed green from a real branch checkout in THIS review) is a limitation of my review
environment, not a defect, and is cross-checked against the implementer's own captured evidence
from a real checkout of the same head.

## What I did NOT cover

- **I did not independently verify the `scope` gate reports green from a REAL `claude/m3-p1-...`
  branch checkout.** My worktree is detached HEAD by task design, and the phase's own branch was
  already checked out in a sibling worktree I was told not to touch
  (`.../scratchpad/wt-m3p1`). I relied on the implementer's own captured `scope: green` /
  `m2-assert: OK` run from the real branch (`delivery/work-history/m3-p1.md`, re-verified against
  `dd42ccb`), cross-checked only for non-conflict (my own run says not-applicable, never red).
- **I did not read Ajv's own source** to independently confirm the prototype-chain unsoundness
  claim's ROOT CAUSE (that `required` resolves through `Object.prototype`); I verified its
  OBSERABLE BEHAVIOR (the pinned five failures reproduce, and reproduce as an exact set in both
  directions) and the bounding guard, which is what the plan and DR-0013 actually gate on.
- **I did not audit the vendored JSON Schema Test Suite fixtures themselves** for fidelity to
  upstream beyond the revision already recorded in `PROVENANCE.md`; neither did either clean-room
  reviewer, and this delta did not touch the vendored fixture files (confirmed:
  `git diff --stat 3979557..edc13ac -- 'test/fixtures/json-schema-test-suite/*.json'` is empty).
- **I did not run the `main`-bundle arm** (`--bundle main`) of `scripts/m2-exit-test.sh`; the task
  scoped this review to the PR bundle, and T-009's "both arms need a witness" concern is about the
  orchestrator's own harness (`scripts/m2-exit-test.sh`, unmodified by this round) rather than
  about this phase's content.
- **I did not exercise the schemas against a real consuming project.** Both clean-room reviewers
  already recorded this as out of scope before M4's pilot, and nothing in this delta changes that.
- **I did not re-derive the meta-schema-validation and remote/$ref classification regexes in
  `compilationDiagnostics` against every Ajv 8.20.0 exception shape that could occur** beyond the
  six shapes the shipped test table (`COMPILATION_FAILURES`) exercises; an Ajv exception shape
  outside those six falls through to the generic `"schema could not be compiled"` message, which
  is the safe (nothing-leaked) default, so an uncovered shape would under-inform rather than leak,
  but I did not enumerate Ajv's full exception surface to confirm six is exhaustive for this
  engine's configuration.
- **I did not independently re-run the mutation-testing table from the ORIGINAL criteria review**
  (the twelve rows confirming no-input-mutation, strict validation, etc.); those were already
  confirmed sound before this round and this round's diff does not touch `coerceTypes`,
  `useDefaults`, `removeAdditional`, `strict`, or `validateSchema` (confirmed by grep above), so
  they carry no regression risk from this delta specifically.

## Verification COMPLETE 08:10:08
