# Clean-room review: M4-P16 fleet rehydration (reviewer: fable-cr)

Started 2026-09-16. Branch claude/m4-p16-fleet-rehydration, head 1701940, base 3b40118.
Framing: evidence integrity. Status: IN PROGRESS.

## Log
- created file, reading CLAUDE.md, plan section, work history, probes doc

## Setup (measured)
- review worktree: scratchpad/m4p16-review/tree at 1701940 (git checkout, detached), node v26.6.0 at /home/user/m4p16-toolchain, npm ci exit 0, npm run build exit 0, git status clean after build.
- true phase diff is 6961186..1701940 (15 paths); 6961186..3b40118 shared plan stack carries ZERO changes under src/ test/ bin/ scripts/ witness/ .github/ (git diff --stat empty).
- test/resume.test.ts: exit 0, 14 tests, 14 pass, 0 skipped. test/init.test.ts: exit 0, 9 pass, 0 skipped. (node --test --test-reporter=tap <file>, dist built)

## First check: derivation honesty (fix-round contract item 3)
Section 6.3's "what the derivation did NOT cover" names three exclusions (44 other test files, assert.equal on streams, REBUILT array comparisons), and the second was found by widening. Section 9 lists six residues, section 12.5 six non-established items. Honest. The worst admitted item is 12.5(2): the red-witness gate was NOT run on the branch; the witness specs were only hand-executed. That is worse than it sounds only if the gate reddens for a reason hand-execution cannot see (rule f capture obligation, coverage). Checked: init.ts is covered by the pre-existing init-writes-kernel-pin spec which carries captures; fleet.ts/cli.ts/resume.ts are covered by the five new specs.

## Witness members re-run by hand (lab worktree, all 10 members)
All named tests red under every member; control restored 14/14 green; lab git status clean.
- resume-refusal-is-a-class: m0 red tests 4,5,7; m1 red 6,7. Two genuinely different checks deleted. Class holds.
- resume-leaves-a-live-fleet-untouched: m0 (patch) red on REBUILT count first (expected 0 actual 3); a SILENT destroy variant I wrote (rm+mkdir, no print) is red on "resume removed a live worktree file", so the content assertion carries the witness, not the output count.
- m1 (present -> rebuild:true): red because mkdirSync throws EEXIST, CLI prints `tiphys: EEXIST: file already exists, mkdir .../state` exit 1. The WH table calls this "resume reports work it did not do"; it never reports anything, it crashes. Same for M2 (all-or-nothing): EEXIST exit 1. Red for exit code, not for the mechanism the WH names. LOW.
- partition: both members red 9/14. registered: red 12/14.

## Attacks on the shipped command (scratch fixtures, head bin)
a. .git as a FILE (git worktree): accepted, rebuilt 3, exit 0. Correct.
b. .git as DANGLING SYMLINK: accepted, rebuilt 3, exit 0.  h. .git as EMPTY FILE: accepted. The "is a git repository" precondition tests only that SOMETHING named .git exists. LOW.
c. state -> symlink to outside dir: left alone, 2 REBUILT. Correct.
d. operand is a file: refused exit 1. f. `resume --help`: treated as a dir named --help, exit 1 (no help arm). LOW.
g. clone missing tasks/: refused as not a fleet home. Matches WH 3a.
i. 10 forced two-process races: 0 bytes stderr.
e. read-only root not testable as uid 0.

## Claim grep
line-based sections 1-9: 10 occurrences; wrap-insensitive: 10; whole file 65/65. Passive forms: hits only inside the quoted grep patterns (lines 571,573,585). All 10 disposed in section 11 with a mutant or capture; row 547 self-labelled weakest. No over-claim found.

## Citations
65 tokens extracted outside backticks, 0 missing, 0 out of range. 63 land on the exact line claimed; init.ts:85 (message is at :93) and init.ts:47 (write is at :111) land in the right block, not the exact line.

## Suite (my run, git checkout worktree, node v26.6.0, dist built, `npm test`)
Not completed at the time the verdict was demanded: see the numbers recorded in the verdict. Load average 24 to 55 on 4 CPUs throughout (five other M4 implementers). red-witness gate NOT run by me for the same reason; every member re-executed by hand instead (above).

## Verdict: APPROVE. Findings are LOW and tracked; none reaches a shipped artifact in a way that changes a user outcome beyond three empty directories.
