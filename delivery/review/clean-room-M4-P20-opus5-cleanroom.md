# Clean-room review: M4-P20 (cross-environment exclusion pre-pass)

Reviewer: Opus 5 (claude-opus-5), single reviewer, framing: EVIDENCE INTEGRITY AND DATA LOSS.
Branch: claude/m4-p20-exclusion-pre-pass, head 6aea774, base 3b40118 (== origin/main at review time).
Started: beacon opened before reading.

## Status
- [x] established base/head, confirmed merge-base == 3b40118 == origin/main
- [ ] work history item 3 (derivation not-covered) honesty check
- [ ] red witnesses
- [ ] guard that cannot go red
- [ ] pinned counts over append-only registry
- [ ] claim grep (3 forms)
- [ ] suite sentence (4 qualifiers)
- [ ] scope vs m4-conflict-pre-pass.md
- [ ] citations sample >= 15
- [ ] C-1 / C-2 / C-3

## Raw facts recorded so far
- `git diff --stat origin/main...branch` reports 34 files, 13081 insertions.
- Phase declaration filesToTouch lists SIX files only:
  scripts/probe-cas-ref.mjs, test/cas-probe.test.ts, test/cross-environment.test.ts,
  test/behaviors.json, delivery/verification/cross-environment-exclusion-probe.md,
  delivery/plan/phase-declarations/m4-p20.json
- The branch carries 29 commits; the phase's own are bde0df4, a0a283a, cfd49a9,
  ea0318c, 93787b5, 85c29d2, 6aea774 plus 6961186 (conflict pre-pass wave 1).
  The remaining ~21 are unmerged orchestrator M4 paperwork inherited from the cut point.

## FINDING CR-M4P20-001 (MEDIUM): the probe rm -rf's its argv path with no guard

scripts/probe-cas-ref.mjs:188 to :189

```
function buildScratchFleet(root, cloneNames) {
  const absRoot = resolve(root);
  rmSync(absRoot, { recursive: true, force: true });
```

`root` is the raw `<path>` operand of `--remote`, `--vacuity` or `--namespaces`,
taken straight from `process.argv` by parseArgs (scripts/probe-cas-ref.mjs:566)
with no validation of any kind: not emptiness, not "must not exist", not "must
be under tmpdir", not a prompt, not a `--force` flag. The USAGE string and the
file header both describe the mode as "Builds a bare repository at <path>" and
say nothing about deleting what is already there.

MEASURED, not reasoned. I built a directory holding a `.git/`, a `charter/` and
an uncommitted `WORK.md`, pointed the documented command at it, and it was gone
with exit 0 and no warning:

```
$ find /tmp/claude-0/dataloss/precious | sort
.../precious/.git/HEAD
.../precious/WORK.md
.../precious/charter/plan.md
$ node scripts/probe-cas-ref.mjs --remote /tmp/claude-0/dataloss/precious
A accept
B refuse ! [rejected]        25ef89d7... -> refs/tiphys/lease (stale info)
exit=0
$ ls -a /tmp/claude-0/dataloss/precious
.  ..  A  B  remote.git  seed      # WORK.md DESTROYED
```

Reachability: NOT a shipped artifact (scripts/ is outside DR-0027's shipped
surface). It IS a real user path: delivery/verification/cross-environment-exclusion-probe.md
lines 86, 148 and 200 print exactly these three commands as the reproduction
instructions, with `<path>` as a free operand, in a repository whose standing
warning 8 exists because one destructive command cost four rounds of
uncommitted work.

Not HIGH because triggering it needs the operator to name a path they care
about; every in-repository invocation passes a fresh `mkdtempSync` directory.

Concrete fix, one guard at the top of buildScratchFleet:

```
if (existsSync(absRoot) && readdirSync(absRoot).length > 0) {
  throw new Error(
    `refusing to build a scratch fleet in a non-empty directory: ${absRoot}. ` +
    `This probe deletes its root recursively. Name a path that does not exist.`,
  );
}
```
plus one line in USAGE saying the path is created and deleted.

## FINDING CR-M4P20-002 (MEDIUM): the probe guard cannot go red against a HAND-WRITTEN refusal line, which is the one property criterion 2 names

Criterion 2 (delivery/plan/kernel-plan-m4.md:2939) says the refusal signature is
"CAPTURED from a real forced contention, never hand-written (T-003)".
test/cas-probe.test.ts:12 says the guard exists because "an evidence producer
that quietly becomes a no-op produces a document that reads exactly the same as
a real measurement."

I defanged exactly that property. scripts/probe-cas-ref.mjs:167 to :174 replaced
by a function that IGNORES git's stderr and returns a hand-written constant with
a fabricated object name:

```
function refusalStderrLine(stderr) {
  return "! [rejected]        deadbeefdeadbeefdeadbeefdeadbeefdeadbeef -> refs/tiphys/lease (stale info)";
}
```

The probe then prints, at exit 0:

```
A accept
B refuse ! [rejected]        deadbeefdeadbeefdeadbeefdeadbeefdeadbeef -> refs/tiphys/lease (stale info)
```

and the guard reports `tests 5 pass 5 fail 0 skipped 0`. All five green.
`deadbeef...` is not a sha any git in this run produced.

This is the repository's dominant failure shape (a guard whose condition does
not test the property that matters). The work history's own defang table has two
probe-guard members, and BOTH are "remove the contention" style: one makes B
push the correct expectation, one moves the discriminator arm's ref. Neither
attacks capture-versus-fabrication. So by the "one witness is not a class" rule
the two listed members are closer to one defect twice than to two members, for
this particular claim. (Their group-1 precondition pair and group-2 pin pair ARE
genuinely different; this criticism is only about the probe-guard pair.)

Reachability: NOT a shipped artifact. scripts/ and test/ are outside
package.json `files` (measured: ["dist","!dist/node_modules","LICENSE",
"AGENTS.md","gate-registry.yaml","gates.manifest.json","assurance-modes.yaml",
"checklists","role-model-config.yaml","roles","schemas","templates","tuition"]).
The reach is one hop: the probe is the evidence behind M4-D-11, and M4-D-11
governs src/exclusion.ts, which M4-P21 ships. I cannot show a direct path from
this gap to a wrong byte in a shipped file, so under DR-0027 I mark it TRACKED
rather than blocking, and say so plainly.

Concrete fix, one assertion in test/cas-probe.test.ts near line 138, where
`payload.b.stderr` (real) and `payload.b.refusalLine` (printed) are both already
in scope:

```
assert.equal(
  payload.b.stderr.includes(payload.b.refusalLine),
  true,
  "the printed refusal line must be a substring of git's real stderr, not text " +
    `this probe composed: printed ${payload.b.refusalLine}`,
);
```

WITNESSED, both directions, by me:
- pristine: `b.stderr.includes(b.refusalLine)` is **true**
- under the fabrication defang: **false**

(`b.refusalLine` is emitted in the --json payload already; the remote mode adds
it at scripts/probe-cas-ref.mjs:337.)

## FINDING CR-M4P20-003 (MEDIUM): a derivation published as "Full output" is not the full output, and one row is dropped with no marker

delivery/work-history/m4-p20.md, the section "The derivation I did run, and its
exact scope", publishes `grep -rn "skip:" test/*.ts` and labels the block
**"Full output, sixteen lines"**. The fix-round contract's item 2 says publish
"its full output. Not a summary of it."

Measured, three ways:

| where | real line count |
|---|---|
| at the branch head 6aea774 | **24** |
| at the merge base 3b40118 (same command, same files) | **21** |
| as published in the work history | **16** |

The 24 minus 16 decomposes into three different things, and only two of them
are declared:

1. **Declared and visible.** Five `test/suite-gate.test.ts` rows (209, 361,
   362, 392, 548) are compressed into one line reading "fixture strings inside
   the suite gate's own tests". A reader can see that happened.
2. **Declared.** Two long ternaries truncated with `(...)`, license-gate 871
   and 1122. The note says so.
3. **NOT declared and NOT visible: `test/watcher.test.ts:1401:  { skip: fifoSkip },`
   is simply absent.** It is not compressed, not marked, not mentioned. It
   pre-exists this phase (`git show 3b40118:test/watcher.test.ts | sed -n '1401p'`
   prints it) and this phase does not touch `test/watcher.test.ts`
   (`git diff --name-only 3b40118...6aea774 -- test/watcher.test.ts` is empty).
   Its sibling `test/watcher.test.ts:1330` IS published, so it is not a
   whole-file elision either.

The three rows from the phase's OWN `test/cross-environment.test.ts` (516, 547,
623) are also absent, which is defensible if the grep predates the file, but the
block is used to conclude "NONE of them gates on a feature that does not exist
yet" and those three lines are exactly the counterexample the phase created.

The CONCLUSION survives: watcher:1401 is `{ skip: fifoSkip }`, an environment
gate like its sibling, so "every existing gate in test/ is an ENVIRONMENT gate"
remains true. What does not survive is the label. A derivation whose stated
count is wrong and whose output has one silent omission is the artifact the
fix-round contract's item 3 exists to make trustworthy, and the failure is
invisible to every gate (the citations gate does not lint work histories, which
this work history itself records).

Reachability: NO shipped artifact and no user-visible command. TRACKED, not
blocking.

Concrete fix: replace the block with the real 24 lines from
`grep -rn "skip:" test/*.ts` at HEAD, change "Full output, sixteen lines" to
"Full output, twenty-four lines", and keep the compression only if it is
labelled as a filter with its own count, for example
"five test/suite-gate.test.ts rows collapsed to one, listed by line number".

## FINDING CR-M4P20-004 (LOW): the disjointness argument is file-level, and these tests depend on a file another wave-1 unit owns

delivery/work-history/m4-p20.md says "Checked against the pre-pass's other five
wave-1 units: no file I touch appears on any of their lists." True, and it does
not cover the dependency that matters here.

test/cross-environment.test.ts:320 asserts
`git check-ignore --quiet state/orchestrator.lock` exits 0, which is true only
because src/fleet.ts:28 lists `state/`. test/cross-environment.test.ts:402 writes
`charter/divergence.md`, which needs `tiphys init` to create `charter/`.
delivery/plan/m4-conflict-pre-pass.md:16 grants `src/fleet.ts` and
`src/commands/init.ts` to M4-P16, running concurrently.

I PROVED the dependency is load-bearing rather than assuming it: deleting
`"state/"` from src/fleet.ts:28 in a scratch clone turns three of the eight
tests red (`tests 8 pass 3 fail 3 skipped 2`), including both dangerous-state
pins and the anti-vacuity control.

I also checked whether the collision is LIVE today, and it is not:
`git diff <merge-base>..claude/m4-p16-fleet-rehydration -- src/fleet.ts src/commands/init.ts`
is purely additive; it derives `EPHEMERAL_DIRS` FROM `FLEET_IGNORED` and leaves
`FLEET_IGNORED`, `FLEET_FILES` and `FLEET_DIRS` unchanged. So this is a gap in
the METHOD with no instance, which is why it is LOW.

Reachability: src/fleet.ts IS shipped, so a future instance could turn `main`
red after both merge. No instance exists today. TRACKED.

Concrete fix: add one line to delivery/plan/m4-conflict-pre-pass.md under the
M4-P20 row: "M4-P20's tests READ src/fleet.ts (FLEET_IGNORED must contain
`state/`) and the layout `tiphys init` creates. M4-P16 owns both files; either
unit changing that layout reddens test/cross-environment.test.ts after merge."

## FINDING CR-M4P20-005 (LOW): the usage test hands real paths to a script that rm -rf's its path operand

test/cas-probe.test.ts:255 is
`runProbe(["--remote", "/tmp/a", "--vacuity", "/tmp/b"])`. It is safe TODAY only
because parseArgs returns `exactly one mode may be given` before any runner is
reached (scripts/probe-cas-ref.mjs:580, and main returns 64 at :599 before
dispatch). Given CR-M4P20-001, the day argument parsing changes order this test
deletes `/tmp/a` and `/tmp/b` on a developer machine.

Concrete fix: use `scratch(t, ...)` paths in that assertion as the other four
tests already do, so no hard-coded real path is ever handed to a mode operand.

## MY FIRST CHECK: the not-covered statement, and is anything worse than it sounds

The work history carries a not-covered list of SEVEN items and the evidence
document carries SIX. I judge them HONEST and unusually specific: each names
what was excluded and why, not "further work is possible".

Two judgements a reader should not have to infer.

**One item is BETTER than it sounds.** Item 7 admits "the conclusion 'a red
branch fails the suite gate' rests on the source rather than on a run". In fact
this repository already executes that property: `test/suite-gate.test.ts` carries
`a failing test makes the suite gate red naming it`, and I watched it PASS in my
own full-suite run at 6aea774. So the reading was correct and confirmable at zero
cost; the honest admission understates how well covered the claim is.

**One item is WORSE than it sounds, and it is CR-M4P20-003.** The `grep -rn
"skip:" test/*.ts` derivation admits the SCOPE gap (top-level only, literal
`skip:`). I checked that admitted gap and it is nominal: `find test -mindepth 2
-name '*.ts'` returns ZERO files, so "test/*.ts" and "test/**" are the same set
here. What the item does NOT admit is that the published OUTPUT is incomplete,
which is a different and larger problem than the scope it does admit.

## THE SUITE SENTENCE, re-run independently

The work history's sentence is complete on three of the four qualifiers and
names its head: "npm test, node v26.6.0, dist/ built, 862 tests, 860 pass,
0 fail, 2 SKIPPED, 0 todo, exit 0", measured at ea0318c with a captured argument
that ea0318c..HEAD changes only markdown. It does NOT explicitly name the
FOURTH qualifier (git checkout versus `git archive` copy), though "a separate
clone at /tmp/m4p20-base" implies a checkout.

My independent run, all four qualifiers stated:

> **git CHECKOUT** (`git clone` of the repository, detached at 6aea774),
> interpreter **node v26.6.0** (/tmp/node26), **`dist/` built** (`npm ci` exit 0,
> `npm run build` exit 0, `git status --porcelain` zero lines after the build),
> invocation **`npm test`**, load average 0.92 at start:
> **862 tests, 859 pass, 1 fail, 2 skipped, 0 todo, exit 1.**

The TEST COUNT and the SKIP COUNT reproduce exactly (862 / 2). The one failure
is `test/gates.test.ts:3571`, `a precondition command exiting nonzero is error,
not a skip, ...`, and **I established the base before attributing it**: the same
single test at the branch point 6961186, same interpreter, same build state,
also FAILS (`tests 1 pass 0 fail 1`). It is therefore not attributable to this
change. It is an artifact of WHERE my clone sits (under `/tmp/claude-0`, mode
`drwx------`), which is standing warning 1's family with the repo rather than the
interpreter as the variable. The phase touches no file involved.

The two skipped are confirmed by name to be the two gated group-3 witnesses.

## THE RED WITNESSES, re-run by me rather than read

| what I did | result | matches work history |
|---|---|---|
| stub `src/exclusion.ts`, run `node --test test/cross-environment.test.ts` | `tests 8 pass 5 fail 3 skipped 0`, exit 1; tests 5, 6 and 8 red; failure text `exactly one environment may hold the fleet lease; A ok=true B ok=true` | YES, verbatim |
| remove the stub | `tests 8 pass 6 fail 0 skipped 2`, exit 0 | YES |
| baseline `test/cas-probe.test.ts` | `tests 5 pass 5 fail 0 skipped 0` | YES |
| MY defang, not theirs: delete `"state/"` from src/fleet.ts:28 (the SHIPPED source, not the test helper) | `tests 8 pass 3 fail 3 skipped 2`; tests 3, 4 and 7 red | consistent with their row 3, reached through a different mechanism |
| MY defang: B pushes with the CORRECT expectation (probe line 303) | `tests 5 pass 3 fail 2` | YES, matches their row 5 |
| MY defang: `refusalStderrLine` returns a hand-written constant | `tests 5 pass 5 fail 0` -- **GREEN** | NOT in their table; this is CR-M4P20-002 |

Class counting, honestly:
- group 1 precondition: two members, GENUINELY different (both predicate arms
  off versus head-comparison only off, reddening 2 tests versus 1).
- group 2 pins: two members, GENUINELY different, and I added a third through
  the shipped source.
- probe guard: two members, and BOTH are "remove the contention". For the
  capture-not-hand-written claim that is one defect twice, not two members.

## GUARD THAT CANNOT GO RED: the audit

- The group-3 gate IS a skip, which is the classic shape. The implementer names
  it, and bounds it two ways. I verified BOTH bounds work: the expiry guard
  (test 8) does go red under a stub, and the anti-vacuity control (test 7) is
  green today and reddens under my fleet.ts defang. This is handled well.
- The probe guard is green against fabrication. CR-M4P20-002.
- The `assertHoldsLiveLease` helper checks four facts, not `ok: true` alone,
  which is exactly the defect the earlier probe had. Verified by reading and by
  the fleet.ts defang reddening on `ENOENT`-class setup failure rather than
  reporting a false double-hold.

## PINNED COUNTS OVER AN APPEND-ONLY REGISTRY (binding convention 5)

CLEAN. test/behaviors.json gains 13 rows, append-only. No new test asserts a
count or a length over it. test/cas-probe.test.ts:163 carries an explicit
comment refusing to pin the `findings` list length and builds a Map keyed by id
instead, which is the rule applied to a NEW registry-shaped thing before anyone
asked. `assert.equal(lines.length, 2)` at test/cas-probe.test.ts:78 is the
criterion's own "exactly two lines", not a registry count.

The one pinned count nearby, `test/coverage-gate.test.ts:160`
(`assert.equal(report.perMilestone["M4"], 13)`), is NOT touched by this phase and
is already flagged for M4-P13 at delivery/plan/m4-conflict-pre-pass.md:54.

## C-1, C-2, C-3

CLEAN, measured. `grep -nEi 'process\.kill|/proc|\.pid|kill\(|signal|SIGTERM|SIGKILL'`
over the three new files hits only COMMENTS asserting compliance. Every child
process is `spawnSync` (no `spawn(`, no `detached`, no `nohup`), so C-3 holds.
No log-tail read anywhere, so C-1 holds.

## SCOPE

The phase's OWN commits (6961186..6aea774) touch exactly seven paths: the six on
delivery/plan/phase-declarations/m4-p20.json plus
delivery/work-history/m4-p20.md, a standing pre-authorized extra. No undeclared
edit, no collision with the other five wave-1 units' file lists.

Two facts a merger needs and the implementer already states: the `scope` gate is
RED because the declaration is not in the merge base, and the branch carries 21
INHERITED orchestrator commits touching 27 further files (the whole M4 plan, ten
decision records, eleven probe evidence documents). Merging this branch lands all
of that. That is a DR-0031 unit-of-value question for the orchestrator, not a
defect in the implementer's work.

## DOES ANYTHING HERE REACH THE SHIPPED SURFACE

**NO, and I checked rather than accepted the dispatch's word for it.**
`git diff --name-only 3b40118 6aea774 -- src/ bin/ package.json package-lock.json`
is EMPTY. The branch adds nothing under schemas/, roles/ or tuition/.
package.json `files` is
`["dist","!dist/node_modules","LICENSE","AGENTS.md","gate-registry.yaml","gates.manifest.json","assurance-modes.yaml","checklists","role-model-config.yaml","roles","schemas","templates","tuition"]`,
which contains neither `scripts` nor `test`. No finding above makes a shipped
artifact wrong.

## VERDICT: APPROVE

Five findings, none higher than MEDIUM, none reaching a shipped artifact.
Recorded, not blocking, per DR-0027 and the one-round dispatch.
The two MEDIUMs worth someone's next hour are CR-M4P20-001 (a one-line guard on
an unguarded `rm -rf`) and CR-M4P20-002 (a one-line assertion that would have
caught fabricated evidence, witnessed red and green by me).

## CITATIONS: hit rate

I collected every `path.ext:LINE` token from delivery/work-history/m4-p20.md,
delivery/verification/cross-environment-exclusion-probe.md,
delivery/plan/m4-conflict-pre-pass.md and the three new source files:
**38 distinct citations**. I resolved all 38 with `sed -n '<N>p'` and read each
resolved line against its claim.

**38 of 38 resolve, and 38 of 38 say what is claimed. Hit rate 100 percent.**

Spot checks that carry weight rather than the easy ones:
- src/lock.ts:63 is the exclusion-domain comment, so "lock.ts states its own
  domain honestly" is true and not a euphemism.
- src/fleet.ts:28 is `export const FLEET_IGNORED = ["state/", ...]`, the line the
  whole dangerous-state argument rests on. I defanged it and three tests went
  red, so the citation is load-bearing rather than decorative.
- src/gates/red-witness.ts:38 really does declare the precondition as
  `diff-touches` on `src/` and `bin/`, so "the red-witness gate does not evaluate
  this phase" is correct.
- delivery/plan/kernel-plan-m4.md:2989 really lists
  `test/cross-environment-lock.test.ts`, confirming the M4-P21 scope gap the
  implementer raises.
- `src/gates/suite.ts:1074` and `:1056` appear only inside backticks, inside the
  sentence recording that they were WRONG and were corrected to :1063 and :1058.
  Quoted deliberately, per CLAUDE.md rule 3b. Both corrected forms resolve.

## The verdict document

Written to /tmp/claude-0/verdicts/M4-P20-opus5.json.
Independently schema-checked against schemas/verdict.schema.json with ajv 2020
under strict: true: **VALID: true**.
`node bin/tiphys.ts validate --type verdict <file>` exits 1 with four SKIPPED
lines (`dual-review-decorrelation`, `verdict-criteria-complete`,
`verdict-deviations-judged`, `verdict-hazard-classes-addressed`), all reading
"no context". That is the expected standalone behaviour: those four are
cross-document Kind B checks needing `--context`, and the repository's own test
`a derived check that requires a context it was not given is SKIPPED and the run
fails` describes exactly this. The document is schema-valid; the four checks run
when the merge gate supplies the plan and work-history context.

## Checked against delivery/verification/m4-prototype-probes.md (the measurement wins)

I read that document in full and compared item 8, the git-ref compare-and-swap
probe, against this phase's claims. **No contradiction.** All three of item 8's
conditions are carried forward correctly:

- "Only refs/heads/* is pushable here" (m4-prototype-probes.md:147) is the stated
  basis for deviation 2, and the probe keeps the custom namespace as a named
  discriminator arm rather than deleting it.
- "Bare --force-with-lease ... a routine fetch re-arms it ... CLOBBERED a live
  holder" (m4-prototype-probes.md:150) was CONTRADICTED by the implementer's
  first vacuity run, and they did the right thing: they refused to average two
  honest accounts, found the cause (a default fetch refspec covers refs/heads/*
  only), and reproduced the recorded clobber exactly once the arm moved to a
  branch. The measurement won, as the dispatch requires.
- "Nonzero does NOT mean 'I lost'" is carried into
  delivery/verification/cross-environment-exclusion-probe.md section 6 and into
  the guard test's own comment at test/cas-probe.test.ts:135.

Item 8's stronger results that this phase does NOT repeat (the real barrier-
synchronised race against the real remote, and the no-change-duration rule that
removes the clock comparison) are both named in the evidence document's
not-covered list rather than quietly absorbed.
