# Clean-room DELTA re-review (hazard)     M2-P2 fix round 1

Subject: branch claude/m2-p2-red-witness-harness @ 7714805
Reviewer: hazard delta re-reviewer
Started: (in progress)

## Setup
- WORKDIR recorded, head checked out at 7714805 (verified detached).

## Status: COMPLETE - FIX-ROUND-NEEDED

## Gate numbers (floor node v26.6.0)
- npm ci exit 0 (npm 11.18.0, no EBADENGINE)
- npm run build exit 0, git status clean after build
- Phase suite test/witness.test.ts: 34 tests, 34 pass, 0 fail, 0 skipped (was 28 pre-fix; +6 fix-round witnesses)

## Fix wiring confirmed present
- deriveTextAssertions rewritten: READ_BINDING (sync+async), STRING_BINDING (var path), textAssertionsOnVar (tied to read result), inlineTextAssertedReads, fail-conservative.
- red-witness.ts:234 screens *.sh via shellSpawnsAndParses, else SPAWN_GREP. CR-H2 wired.

## Next: attack from both sides (bypass + over-reach)

## CR-H1 verification (prior finding closed at mechanism for named members)
Probe attack.mjs against REAL exported deriveTextAssertions (floor node):
- baseline sync+literal: TEXT-ASSERTING (no regression)
- async NAMED-import readFile (member D): TEXT-ASSERTING -> CLOSED
- variable path (member F): TEXT-ASSERTING -> CLOSED
- assert.equal whole doc: TEXT-ASSERTING -> CLOSED
- template-literal path: TEXT-ASSERTING (caught)
- destructured import + bare call: TEXT-ASSERTING (caught)
The three idioms the arbitration named (D/E/F) are closed at the mechanism.

## NEW FINDING CR-1500 (MEDIUM, merge-blocking): read-recognition misses the DOMINANT namespace idiom; work history overstates node:fs/promises coverage
Same probe, ESCAPES (textAsserting=false -> single deleting member ships GREEN):
- G. `fs.readFileSync(doc)` (namespace)          -> not-text  ESCAPE
- A. `await fs.promises.readFile(doc)` (namespace)-> not-text  ESCAPE
- A2. `fsp.readFile(doc)` (namespace alias)       -> not-text  ESCAPE
- B. aliased callee (`const rf=readFileSync`)     -> not-text  (DECLARED residue)
- D. `readFile(doc,(e,data)=>assert.match(data,..))` callback -> not-text ESCAPE
- E. two-hop rebinding (`const body=raw`)         -> not-text  ESCAPE
Chain proven: run.ts:1133 needsClassRules = classification || textAsserting;
textAsserting=false + non-classification class => the >=2-member rule is NOT
enforced => single deleting member GREEN. Same three properties that made the
original CR-H1 merge-blocking (judges every test; criteria-invisible; hazard #3).
`fs.readFileSync` is MORE common than the async-named-import form the detector
DOES catch. NOT named as residue; derivation table (m2-p2.md:620) affirmatively
claims "async readFile (node:fs/promises) -> TEXT-ASSERTING", which reads as
node:fs/promises being covered when only the destructured named-import form is.

## CR-1501 (LOW, folded): isDocumentPathLiteral misses extension-less root docs
overreach.mjs control: `readFileSync("Makefile")` + assert.match -> not-text.
Root files with no "/" and no "." (Makefile, Dockerfile, LICENSE, CODEOWNERS,
Jenkinsfile) are not recognized as document paths. Same class as CR-1500.

## OVER-REACH test (part b): CLEAN, no finding
overreach.mjs: 6 legitimate behaviour witnesses (read passed to project fn;
runtime temp path; parse-then-assert-derived; computed length; assert.ok via
project fn) ALL correctly not-text. Fail-conservative is correctly tied to the
read RESULT being directly asserted; it does NOT falsely redden derived-value
witnesses. No over-reach.

## CR-H2 verification (shell spawn+parse): CLOSED
shell.mjs: git|grep, subst+case, backtick+awk, while-read+=~ all SPAWN+PARSE
(4 structurally different members); exit-status-only, pure echo, xargs-residue,
plain assignment all NOT flagged. Wired at red-witness.ts:234. Residue named.

## Regression / integration
- Criterion 3b (CR-661 reproduction) test present (witness.test.ts:549+), passes.
- Four kernel witness specs present under witness/; self-guard test:297 passes.
- Phase suite 34/34 on floor. Scope audit PASSES (all changed files within
  declared filesToTouch + work-history extra + registries).

## Full suite (floor node v26.6.0)
- Run 1: 254 tests, 251 pass, 3 fail, 0 skipped (3 = real-clock flakes, untouched files)
- Run 2 (re-run): 254 tests, 254 pass, 0 fail, 0 skipped -> the 3 were flakes, none P2-attributable
- The 2 cross-phase failures from the prior review (schema-count, push-bundle) are ABSORBED (branch on origin/main), consistent with the arbitration's expectation.

## Phase suite, both toolchains
- Floor node v26.6.0: test/witness.test.ts 34 tests / 34 pass / 0 fail / 0 skipped
- Default node v22.22.2: test/witness.test.ts 34 tests / 34 pass / 0 fail / 0 skipped

## VERDICT: FIX-ROUND-NEEDED
- CR-H1: closed at mechanism for the THREE named members (D async named-import, E variable regex, F variable path) + several more (assert.equal, indexOf, inline, template literal, destructured import). Good work.
- CR-H2: closed at mechanism (shell spawn+parse), residue named.
- CR-1261/CR-1262: corrected.
- Over-reach: CLEAN (no legitimate behaviour witness falsely reddened).
- NEW CR-1500 (MEDIUM, merge-blocking): read-RECOGNITION still narrower than the hazard for the DOMINANT idiom. Namespace-qualified reads (fs.readFileSync, fs.promises.readFile, fsp.readFile), callback-style, and two-hop rebinding all ship a single-member text-asserting witness GREEN. Same mechanism as CR-H1, same 3 properties that made it merge-blocking, and the escaping idiom is MORE common than the ones the fix caught. Not named as residue; derivation table (m2-p2.md:620) overstates node:fs/promises coverage.
- CR-1501 (LOW, fold-in): isDocumentPathLiteral misses extension-less root docs (Makefile/Dockerfile/LICENSE/CODEOWNERS).

Remedy is BOUNDED (not an idiom chase): (1) close the namespace member-call form of the same builtin the detector already targets; (2) correct the derivation table and NAME the callback/two-hop/extension-less-root residue as aliased-callee is named.
