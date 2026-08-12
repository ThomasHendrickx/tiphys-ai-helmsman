# M3-P6 fix round 1: delta verification

Status: COMPLETE. Verdict: APPROVE the delta, with one low finding (DV-1) and
three observations. Written incrementally and committed after each cited
command.

- Phase branch: `claude/m3-p6-delivery-role-briefs`
- Fix round head: `2a89757`
- Previous head: `16bab6f`
- Current `main`: `e730116`
- Delta under verification: `git diff 16bab6f..2a89757`
- Verifier worktrees under the session scratchpad: `dvp6-head` (2a89757),
  `dvp6-prev` (16bab6f), `dvp6-lab` (mutable copy of 2a89757),
  `dvp6-report` (this file, branched from origin/main).

Scope reference for the review documents this round answers:
delivery/review/arbitration-m3-p6.md:1 on `main`, with
delivery/review/clean-room-m3-p6-criteria.md:739 (contract A's three findings)
and delivery/review/clean-room-m3-p6-self-comparison.md:153 (contract B's F-B2)
beside it.

## What this verification does NOT cover

Stated first, because it is the check I demand of the round.

- **Not a re-walk of the acceptance criteria.** Contract A walked all eleven at
  `16bab6f` and its verdict stands for what it walked; that evidence lives in
  delivery/review/clean-room-m3-p6-criteria.md:59. I verify the DELTA
  `16bab6f..2a89757` and whether it did what it claimed.
- **Not a review of F-B1.** `scripts/m2-exit-test.sh` is on a separate branch;
  I check only that this round did not touch it.
- **No CI run on either event.** Every capture below is local. T-009's
  post-merge `push` observation remains the orchestrator's duty.
- **I did not re-derive the mechanism universe from scratch.** I re-ran the
  round's own derivation commands and probed the gap it named (D7).

## Log

Entries in the order run. Each names the command and its exit code.

### 1. The delta is six files, and `scripts/m2-exit-test.sh` is not among them

```
$ git diff --numstat 16bab6f..2a89757
919 0   delivery/work-history/m3-p6.md
33  ... scripts/check-brief-drift.mjs
49  ... src/roles.ts
7   ... test/behaviors.json
312 ... test/implementer-brief.test.ts
6   ... witness/brief-drift-check-wired-executably.json
```

Six files, as claimed. `scripts/m2-exit-test.sh` does NOT appear, so the scope
finding the brief warned about is absent.

### 2. The work history was APPENDED, not rewritten

```
$ git diff --numstat 16bab6f..2a89757 -- delivery/work-history/m3-p6.md
919	0	delivery/work-history/m3-p6.md
$ git diff -U0 16bab6f..2a89757 -- delivery/work-history/m3-p6.md | grep "^@@"
@@ -981,0 +982,919 @@
```

Zero deleted lines and a single hunk that begins after the last pre-round line.
Nothing earlier in the document was softened or restated.

### 3. `test/behaviors.json`: extended BY NAME, and nothing pins a COUNT

The orchestrator left this one to me. Three checks:

```
$ git diff 16bab6f..2a89757 -- test/behaviors.json
  3 rows APPENDED (brief-gate-block-mode-pinned-outside-the-brief,
                   brief-gate-block-mode-narrowing-refused,
                   brief-gate-block-units-are-the-rows-compared)
  1 row's VALUE updated (implementer-brief-fix-round-three-items)
  0 rows deleted
$ node -e 'console.log(Object.keys(require("./test/behaviors.json")).length)'
615
$ git grep -nE "behaviou?rs?\)?\.(length|size)|Object\.keys\(behaviou?rs?" -- test src scripts bin
   (no output)
```

Every other reference to `test/behaviors.json` from a test is a FIXTURE it
writes into a scratch directory (`fixtureBehaviors(...)`,
`writeFileSync(join(dir, "test/behaviors.json"), ...)`) rather than a read of
the repository's own registry, over the full grep output published above. No test pins a count, and no test asserts a specific
row's presence. Verified.

**The value update is required, not a liberty.** src/gates/suite.ts:1039 resolves
each behaviour by matching its VALUE against a reported test name, and
src/gates/suite.ts:1046 makes a merge-base KEY that disappears a finding. So a
renamed test with a stale value is a red `suite` gate and the row had to move
with it. No key was deleted. The four new/renamed values all resolve: each
appears exactly once as a test title in test/implementer-brief.test.ts:314,
test/implementer-brief.test.ts:349, test/implementer-brief.test.ts:398 and
test/implementer-brief.test.ts:806.

### 4. CV-1, contract A's defang: REPRODUCED RED, with a green control

Fixed head (`2a89757`), the shipped brief's begin marker switched to
`local-only`, nothing else:

```
$ node scripts/check-brief-drift.mjs --write
brief-drift: error (0 generated brief gate rows compared)
roles/implementer.md's generated gate-list block declares mode local-only and
the shipped brief must declare full: ...
WRITE_EXIT=21
$ node scripts/check-brief-drift.mjs --check
... CHECK_EXIT=21
$ rows in the block afterwards: 15   (UNCHANGED; --write refused rather than rewrote)
```

Control at the pre-round head (`16bab6f`), identical defang:

```
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the local-only gate block in roles/implementer.md (8 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (8 generated brief gate rows compared)
CHECK_EXIT=0
$ rows afterwards: 5
```

Contract A's finding reproduced exactly at the old head and closed at the new
one. With the narrowed marker in place at the fixed head the registered suite
also reddens SIX of eighteen tests in test/implementer-brief.test.ts, test 5
being the direct assertion.

### 5. CV-1, contract B's defang: `units` reaches zero and M2-C-2 FIRES

A registry declaring no gate for `full`, the block re-rendered to agree with it:

```
FIXED HEAD 2a89757
$ node scripts/check-brief-drift.mjs --write  --registry <empty-full> --brief <copy>
  rewrote the full gate block (0 row(s))            WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check ...
brief-drift: error (0 generated brief gate rows compared)
M2-C-2 (never green by omission): a gate reporting green with units 0 examined
nothing, so this record is error; ...
CHECK_EXIT=21     result.json: status=error units=0 vacuous=true

CONTROL 16bab6f, same inputs
brief-drift: green (3 generated brief gate rows compared)
CHECK_EXIT=0      result.json: status=green units=3 (no vacuous field)
```

The preflight floor of three is gone and the vacuity guard is reachable. Both
halves of CV-1 verified, both directions, with controls.

### 6. The MECHANISM claim tested directly: with the pin deleted, `--write` DOES narrow

The implementer claims `--write` is the command that would legitimise a narrowed
marker, which is why the refusal covers every mode. Tested by deleting the pin
block from scripts/check-brief-drift.mjs:242 at the FIXED head:

```
$ (pin deleted, marker switched to local-only)
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the local-only gate block in roles/implementer.md (5 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (5 generated brief gate rows compared)     CHECK_EXIT=0
$ rows: 5
$ node --test test/implementer-brief.test.ts   (pin deleted, brief restored)
not ok 6 - narrowing the brief's declared gate-list mode makes the drift check refuse ...
# pass 17  # fail 1
```

The claim is TRUE as stated, and test 6 is the witness that guards it.

### 7. A THIRD NARROWING EXISTS AND THE ROUND DOES NOT CATCH IT (new, DV-1)

I was asked to look for one, and it is there. The round moved the MODE out of
the audited artifact. It did not move the SELECTION FUNCTION, which is still
shared between the thing rendered and the thing compared, so a strict-subset
filter added INSIDE `renderBriefGateBlock` is self-consistent and silent.

Three narrowings probed, all at the fixed head `2a89757`.

**(a) Move the kernel pin itself to `local-only` and re-render.** CAUGHT, by
the test only:

```
$ (src/roles.ts:553 BRIEF_GATE_BLOCK_MODE = "local-only"; marker narrowed)
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the local-only gate block in roles/implementer.md (5 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (5 generated brief gate rows compared)        CHECK_EXIT=0
$ rows in the shipped brief: 5
$ node --test test/implementer-brief.test.ts
# tests 18  # pass 14  # fail 4
  error: "mode full selects coverage and the pinned mode local-only does not, so
          the brief's gate table is not the widest the registry declares"
```

**(b) Narrow the REGISTRY so `full` selects a strict subset** (`coverage`
drops `full`), then re-render. CAUGHT, by exactly one test:

```
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the full gate block in roles/implementer.md (14 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (14 generated brief gate rows compared)       CHECK_EXIT=0
$ node --test test/implementer-brief.test.ts
not ok 5 - the shipped brief's gate-list block declares the mode the kernel pins, ...
# tests 18  # pass 17  # fail 1
  error: "mode direct-pr selects coverage and the pinned mode full does not, ..."
```

(a) and (b) both vindicate the implementer's stated reason for DERIVING the
widest-mode invariant instead of pinning the literal `full` twice. Note in both
that the GATE is green and only the SUITE reddens.

**(c) A strict-subset filter inside the renderer. NOT CAUGHT, BY ANYTHING.**
One added `.filter((gate) => gate["verified-by"] === "script")` on `selected`
at src/roles.ts:661, then `--write`:

```
$ node scripts/check-brief-drift.mjs --check      (before re-rendering)
brief-drift: red ... the brief has a row the registry does not: | `unit-tests-for-changed-service-methods` ... ; | `fixtures-for-changed-component-states` ...
CHECK_BEFORE_WRITE_EXIT=1
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the full gate block in roles/implementer.md (13 row(s) from gate-registry.yaml)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (13 generated brief gate rows compared)       CHECK_EXIT=0
$ rows in the shipped brief: 13     (the registry declares 15 for full)
$ npm run build   BUILD_EXIT=0
$ npm test
tests 617   pass 617   fail 0   skipped 0                        SUITE_EXIT=0
```

**The entire suite is green over a shipped implementer brief advertising 13
gates where the registry declares 15.** That is contract A's finding 3 in a
different clothes: the instruction surface every future implementer reads is
silently narrowed and every gate is green.

Why test 5 misses it, read off its own body: it derives `selects()` ITSELF from
`gate-registry.yaml` (test/implementer-brief.test.ts:333), which is the right
independent derivation, but it only compares mode against mode. It never
compares that independent derivation against the ROWS THE SHIPPED BRIEF
ACTUALLY CARRIES. Test 3 does compare the brief to a rendering, but through the
same `renderBriefGateBlock`, so it agrees with the narrowing by construction.

**PRE-EXISTING, NOT INTRODUCED.** Control at `16bab6f` with the identical
filter:

```
$ node scripts/check-brief-drift.mjs --write
check-brief-drift: rewrote the full gate block in roles/implementer.md (16 row(s) ...)
WRITE_EXIT=0
$ node scripts/check-brief-drift.mjs --check
brief-drift: green (16 generated brief gate rows compared)       CHECK_EXIT=0
$ node --test test/implementer-brief.test.ts
# tests 15  # pass 15  # fail 0
```

So this is a RESIDUAL of the mechanism the round named, not a regression the
round created. Severity LOW, matching the severity both reviewers gave CV-1:
it needs a kernel-source edit rather than an edit to the audited markdown, and
CV-1's own instance was rated low on the same footing. The one-line close is an
assertion in test 5 that every id in `pinned` appears as a row in the shipped
brief's located block.

### 8. A-1: the check now EXECUTES, and reddens for the right reason both ways

The predicate is `fixRoundClauseFindings` at test/implementer-brief.test.ts:752,
returning findings rather than throwing; each of four weakenings is written to a
file, read back off disk, and put through that same predicate, with a
back-to-green control over the same path.

DANGEROUS STATE 1, the SHIPPED clause weakened (roles/implementer.md:329,
"together with its FULL output" softened to "with a summary of it"):

```
not ok 1 - the fix-round-mechanism clause names all three items and cites the M1 measurement, and every weakening of it reddens the same check when it is re-run over the weakened file
  error: |-
    the shipped fix-round clause does not satisfy its own check
    + actual - expected
    + [
    +   'the derivation item does not require the full output'
    + ]
    - []
  operator: 'deepStrictEqual'
# pass 0  # fail 1
```

DANGEROUS STATE 2, the PREDICATE defanged (the full-output `require(...)` block
deleted from the test's own predicate), shipped clause restored:

```
not ok 1 - the fix-round-mechanism clause names all three items ...
  error: 'the weakening "item 2 softened to drop the full-output demand, heading intact" left the check with nothing to report'
# pass 0  # fail 1
```

State 2 is the decisive one: the arm reddens because it OBSERVED the predicate
reporting nothing. The pre-round arm could not have said that: it built the
weakened text with String.replace and asserted only that the result no longer
CONTAINED item 3, and I read that source at 16bab6f to confirm it. Neither failure is a missing file, a missing directory, or a
throw from the harness. A-1 verified.

Tree restored to zero modified paths after every defang above; every restore was
`cp` from a pristine snapshot directory, never `git checkout --`.

### 9. A-2: the added member is structurally different, and the GATE evaluates it

**The gate, not only the test.** `red-witness` run on this head against the
current `main`:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --evidence <dir> --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
RW_EXIT=0     result.json: status=green units=19
```

Read out of the run's own `witness-records.json`, not retyped:

```
evaluations: 19
witness: brief-drift-check-wired-executably   status: green   members: 3   reasons: []
  member 0 find="      - name: Implementer brief gate-list drift ...\n        run: ... --check\n"  replace=""
           runs: exit1/red=true  exit1/red=true  exit0/red=false
  member 1 same find, replace adds `if: github.event_name == 'pull_request'`
           runs: exit1/red=true  exit1/red=true  exit0/red=false
  member 2 find="        run: node scripts/check-brief-drift.mjs --check\n"
           replace="        run: node scripts/check-brief-drift.mjs\n"
           runs: exit1/red=true  exit1/red=true  exit0/red=false
```

The gate re-evaluates THREE members, the new one among them, it goes red under
the mutation and green restored, and rule (g) reported no collapse (`reasons`
empty). Non-collapse verified by EXECUTION, not by reading the rule.

**Structurally different, measured by which assertion each one trips.** I
applied each member by hand and captured the failure:

```
member 0: error: 'expected exactly one brief-drift step in the gates job, found 0'   (found.length === 1)
member 1: error: 'the brief-drift step carries an if:, so one CI arm never runs it'  (step.if === undefined)
member 2: error: 'the wired step exited 0 with the registry ahead of the brief'      (the EXIT CODE)
```

Three different assertions, and member 2 is the only one that reaches the
EXECUTED half. That is the gap contract A named, and it is closed. Member 2's
`find` occurs exactly ONCE in `.github/workflows/gates.yml`, so it targets
uniquely. A-2 verified.

OBSERVATION (not a finding, and not this round's to fix): rule (g)'s collapse
test is exact string equality of `find` at src/witness/run.ts:1318, while the
comment above it at src/witness/run.ts:1306 says two mutations "touching the
same line" are one member. Member 2's `find` is a strict SUBSTRING of members
0 and 1's, so it does touch the same line, and the non-collapse rests on the
implementation being narrower than its comment. Here that is harmless because
the three members are substantively distinct, proven by the three different
assertions above. It is recorded so nobody later reads rule (g) as enforcing
what its comment describes.

### 10. D5's broken grep: the account is EXACTLY TRUE, re-run four ways

The round reports that D5's first regex was broken, returned empty at BOTH
heads, and was caught only by a control run against the pre-round head. I
re-ran both forms at both heads:

```
$ git grep -nE "units: [A-Za-z_.\[\]()]+ \+ " 16bab6f -- src/ scripts/ bin/
EXIT=1        (no output; this is the CONTROL and the site demonstrably exists here)
$ git grep -nE "units: [A-Za-z_.\[\]()]+ \+ " 2a89757 -- src/ scripts/ bin/
EXIT=1        (no output)

$ git grep -n -E 'units: [^,;]+ \+ ' 16bab6f -- src scripts bin
16bab6f:src/roles.ts:644:  return { text: lines.join("\n"), units: registry.preflight.length + selected.length };
EXIT=0
$ git grep -n -E 'units: [^,;]+ \+ ' 2a89757 -- src scripts bin
EXIT=1

$ git grep -n -E 'units: [^,;]+ \+ ' 2a89757      (whole tree, no path filter)
2a89757:delivery/work-history/m3-p6.md:1070
2a89757:delivery/work-history/m3-p6.md:1444
2a89757:delivery/work-history/m3-p6.md:1451
EXIT=0
```

The broken form is blind at both heads; the fixed form finds the site at the
pre-round head and nothing at this one; the whole-tree run confirms the path
filter is not doing the work. The only remaining occurrences anywhere are this
document quoting itself.

**The control discipline is REAL, and it is the strongest thing in the round.**
The one detail that differs from the published capture is that the whole-tree
run now returns three hits where the round published one: the round's capture
was taken before the derivation section was appended, and the two extra hits are
that section quoting its own output. That is a consequence of appending
incrementally, not a discrepancy.

### 11. The claim grep, both forms, and why my counts are not the round's

The round reports 9 line-based hits and 10 wrap-insensitive. Re-run over the
same subject (`tail -n +982` of the work history, 919 lines):

```
FORM1_HITS=30      FORM2_HITS=41
```

That looks like a contradiction and it is not. Decomposed by line:

- Form 1's hits at section lines 26, 36, 51, 75, 83, 94, 160, 187 and 515 are
  EXACTLY the nine the round published, in the same order and with the same
  text.
- Every one of the other 21 falls at section line 640 or later, inside the
  round's own claim-grep section, which QUOTES the grep command (that alone
  contributes one hit for each of the pattern's eleven alternatives) and then
  quotes the nine results and the ten-row settlement table.
- Form 2 behaves identically: its hits 1 to 10 are exactly the round's ten,
  including the wrapped `It / needs an` at hit 10, and hits 11 to 41 are all
  inside the same self-quoting section.

So the round's 9 and 10 are TRUE for the document as it stood when the grep ran,
and the delta is pure self-quotation. Recorded because the next reader who runs
the command will get 30 and 41 and needs to know why. The wrapped hit is real:
form 1 misses it because "It" ends one line and "needs an" begins the next, and
the surrounding prose does restate it as an open question ("this round does not
close it either").

### 12. The closing bundle's head, verified by diff

```
$ git log --oneline 5e5bd69..2a89757
2a89757 M3-P6 fix round 1: the closing gate bundle and the head it covers
df98b3b M3-P6 fix round 1: record the mechanism-index row as a recorded judgment, not an omission
c5c56ae M3-P6 fix round 1: citations, branch name, main merge check and out-of-scope calls
$ git diff --numstat 5e5bd69..2a89757
185	0	delivery/work-history/m3-p6.md
```

Three commits after the bundle head and they touch ONE file, the work history,
which is a standing pre-authorized extra. The bundle at `5e5bd69` is therefore
evidence for `2a89757` on every gate whose verdict cannot turn on that file.

### 13. The orchestrator's three structural claims, re-checked

```
$ git merge-tree --write-tree e730116 2a89757
5d88809fdb51b099d0c9b4596a2f192e2c224a72     MERGE_TREE_EXIT=0
$ git merge-base e730116 2a89757
307ed2f4e02d7a6f2b05388308dadedbaaf8e617
$ git rev-parse <merge-base>:roles/_shared-dispatch-contract.md   f8784f2256cad1ac0e934bf7b628ca7519d81758
$ git rev-parse 2a89757:roles/_shared-dispatch-contract.md        f8784f2256cad1ac0e934bf7b628ca7519d81758
$ git rev-parse e730116:roles/_shared-dispatch-contract.md        f8784f2256cad1ac0e934bf7b628ca7519d81758
```

Clean merge against the CURRENT `main` (`e730116`, not the `bb8f656` the round
tested against), and the shared dispatch contract is one blob at all three
points.

### 14. The suite, quoted on all four axes I measured

Two of the round's four rows reproduced at `2a89757`, plus the gate's own run.
Toolchain checked with `node --version` in the shell that ran each command.

| toolchain | dist | invocation | tests | pass | SKIPPED | exit |
|---|---|---|---|---|---|---|
| node v26.6.0 (scratch prefix) | BUILT | `npm test` | 617 | 617 | **0** | 0 |
| node v26.6.0 (scratch prefix) | BUILT | bare `node --test` from the repository root | **619** | 619 | **0** | 0 |
| node v26.6.0 (scratch prefix) | BUILT | the `suite` GATE (which runs the `test` script) | 617 | 617 | **0** | 0 |

TRANSLITERATION DECLARED: Node's default reporter prints U+2139 INFORMATION
SOURCE at the head of each summary line. It occurs SIXTEEN times across the two
raw captures below and each is rendered `i`. U+2716 HEAVY MULTIPLICATION X does
not occur, because no arm in these three had a failure. Nothing else in any
captured output in this document was changed.

```
=== npm test, node v26.6.0, dist BUILT ===
i tests 617
i suites 0
i pass 617
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 190512.037903
SUITE_EXIT=0

=== bare 'node --test' from the repository root, same toolchain, same dist ===
i tests 619
i suites 0
i pass 619
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 221236.781816
BARE_EXIT=0
```

The 619-vs-617 pair is NAMED, not inferred:

```
$ node --test --test-name-pattern "greet"
ok 1 - greet returns a greeting for a name
ok 2 - greet rejects an empty name
$ node -e 'console.log(require("./package.json").scripts.test)'
node --test "test/**/*.test.ts"
```

and the `suite` gate's own `counts.json` confirms which number CI means:

```
{"childNode":"v26.6.0","gateNode":"v26.6.0","testScript":"node --test \"test/**/*.test.ts\"",
 "counts":{"reported":617,"pass":617,"fail":0,"skipped":0,"todo":0,"didNotRun":0,
           "discoveredFiles":38,"reportedFiles":38,"behaviors":615,"mergeBaseBehaviors":594},
 "childExit":0,"findings":[]}
```

**The complete sentence: at `2a89757`, node v26.6.0 from the scratch prefix,
`dist/` BUILT, invocation `npm test` (which is what the `suite` gate and CI
run): 617 tests, 617 pass, 0 fail, 0 SKIPPED, exit 0. The bare `node --test`
invocation reports 619 for the same tree because it also collects
`sandbox/test/greet.test.js`, which `package.json`'s glob excludes.**

### 15. Authored bytes, with the exit-2 trap probed rather than assumed

```
$ git status --porcelain | wc -l
0
$ node scripts/check-authored-bytes.mjs
AUTHORED_BYTES_EXIT_BEFORE_ADD=0
$ git add -A
$ node scripts/check-authored-bytes.mjs
AUTHORED_BYTES_EXIT_AFTER_ADD=0
```

Run in a pristine worktree at `2a89757`. The tree already equalled the index, so
the exit-2 arm could not fire; staging first and re-running is recorded so the
0 is a checked 0 and not an unchecked 2.

### 16. The closing gate bundle, re-run by me, and ONE UNEXPLAINED RED

Run in a DETACHED worktree at `2a89757` against `origin/main` = `e730116`:

```
$ bash scripts/m2-exit-test.sh --base origin/main --head HEAD --phase m3-p6 --bundle pr --no-build <ev>
gates: declared 12 applicable 7 verdict 7 green 6 red 1 not-applicable 5 error 0 vacuous 0
gates: 1 gate(s) reported red: suite
m2-assert (PR bundle): FAIL with 3 finding(s):
  - [suite] expected status green, observed red (1 finding(s): failing test:
      "a refused or failed evidence write makes the gate error instead of a silent green"
      (test/coverage-gate.test.ts))
  - [suite] is a REQUIRED gate but its status is red, not green
  - [scope] expected status green, observed not-applicable (precondition
      scope-branch-is-a-phase-branch evaluated and unmet: branch HEAD does not match
      ^(?:claude/m[0-9]+-p[0-9]+-.*)$)
EXITTEST_EXIT=1
```

**The `scope` row is MY environment, not the round.** A detached worktree has no
branch name, which is the same limitation contract A recorded; the round's own
run from the real branch reports `scope: green (24 changed paths audited)`.

**The `suite` row is a flake and I could not reproduce it.** Per-gate rows read
out of that run's `summary.json`:

```
manifest-self-check green 8 | coverage green 115 | credential-scrub green 7
credential-token not-applicable 0 | suite RED 617 | citations not-applicable 0
scope not-applicable 0 | deploy not-applicable 0 | migrations not-applicable 0
clause-map green 47 | red-witness green 19 | brief-drift green 15
suite counts: reported 617, pass 616, fail 1, skipped 0, childExit 1
```

Three subsequent runs of the same tree at the same head are green:

```
$ node --test --test-name-pattern "a refused or failed evidence write makes the gate error instead of a silent green" test/coverage-gate.test.ts
ok 1  # pass 1  # fail 0
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only suite --evidence <ev2> --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
SUITEGATE_EXIT=0
counts: reported 617, pass 617, fail 0, skipped 0, childExit 0
```

plus the two whole-suite runs in section 14. **NOT attributable to this delta:**
`test/coverage-gate.test.ts` is not among the six changed files and the delta
touches nothing it exercises. Recorded rather than averaged away, and the one
structurally suspicious member is the NAMED PIPE at
test/coverage-gate.test.ts:667, the only member in that test that can block or
race. Every other gate row in the failing run matches the round's published
bundle exactly, including `red-witness: green (19)` and
`brief-drift: green (15)`.

The failing test was then run in isolation eight more times, all green:

```
run 1..5 (tap):  # pass 17  # fail 0     (x5)
run 1..3 (default reporter): exit=0      (x3)
```

Nine green observations against one red. I could not force it, I am not
claiming it cannot be forced, and it is named here so the next person who sees
it has a prior.

### 17. `scope: green (24)` verified from the REAL branch

The gate derives the phase id from `git rev-parse --abbrev-ref HEAD` and has no
override flag (`--abbrev-ref` is a git token inside src/gates/scope.ts:398, not
an option; passing it produces the usage banner). So I ran it from the worktree
that is actually on the branch, at the same head, with the evidence written
outside that tree and nothing modified in it:

```
$ git rev-parse --abbrev-ref HEAD    claude/m3-p6-delivery-role-briefs
$ git rev-parse HEAD                 2a89757d37703a8104752fdf54f5e77cc0380d30
$ git status --porcelain | wc -l     0
$ node src/gates/scope.ts --declarations delivery/plan/phase-declarations \
    --base origin/main --head HEAD --phase m3-p6 --evidence <ev> --result <ev>/result.json
scope: green (24 changed paths audited)
24 changed path(s) audited against declaration delivery/plan/phase-declarations/m3-p6.json
at merge base 307ed2f4e02d7a6f2b05388308dadedbaaf8e617
(sha256 7146bfcb0ac84d39ec5030e82488bdb5249a97969cc83eaa173cb242663b52d1)
(1 declared path(s) not touched: roles/_shared-dispatch-contract.md)
SCOPE_EXIT=0
```

Against the CURRENT `main`, not the one the round tested against.

### 18. The derivation's uncovered regions: judged, not taken on trust

I re-ran D1, D1b, D5 and D7 at this head and every one reproduces exactly what
the round published. Item by item on what it said it did NOT cover:

**`delivery/**` excluded from D1: HONEST, and I checked the excluded region
rather than trusting the reason.**

```
$ git grep -n "BEGIN GENERATED" -- delivery/    (excluding the work history itself)
EXIT=1        (nothing)
$ git grep -c "BEGIN GENERATED" -- delivery/work-history/m3-p6.md
10            (all self-quotation of D1's own output)
```

The exclusion is not merely justified, it is empty. D1b reproduces two hits and
exactly one family carries a selecting parameter.

**The two checklist probes have no program: TRUE and unavoidable.** They are
`verified-by: clean-room-checklist` and the runner does not execute them (the
gate run says so itself: "2 registry gate(s) declared verified-by
clean-room-checklist and NOT executed by this runner").

**`deploy` and `migrations` "parse no flags so they rest on D7 alone":
UNDERSTATES its own coverage.** Both files parse nothing because both delegate
to `runReleaseGate` at src/gates/release.ts:989, whose five flags
(`--result --evidence --base --phase --head`, src/gates/release.ts:930) are all
argv, and `src/gates/release.ts` is INSIDE D6's and D7's `src/gates/` scope and
returned nothing in both. So the conclusion holds with more support than the
round claims. The residual is D6's pattern shape: it matches `options.x = `, and
release.ts assigns into a differently shaped object, so a document-derived
default written that way would be invisible to D6. D7 is what covers it, and D7
found nothing there.

**"D7 is a syntactic proxy and is the gap most likely to hide a fourth
instance": TRUE, AND A FOURTH INSTANCE IS IN IT.** DV-1 in section 7 is exactly
that shape: the selector is not passed on one line to a render/select/filter
call, it is a `.filter(...)` chained inside the renderer itself, so no line-wise
grep over call sites reaches it. The round named the right gap and did not
search it. That is the honest form of the failure the contract's item 3 exists
to surface, and it is why item 3 is the first thing a verifier reads.

**"No workflow run on either CI event": TRUE and unchanged.** Nothing I ran was
a `pull_request` or `push` run either. T-009's post-merge observation is still
owed.

### 19. The judgement calls the round asked to be judged

**Putting the "widest mode" invariant in the TEST rather than in the CHECK:
DEFENSIBLE, with one consequence that must be written down.** The reasoning is
sound: a future registry that legitimately grows a mode outside `full` would
turn the CHECK red for a reason unrelated to the brief, and a test failure is
the right price for a judgement about the registry's shape. But sections 7(a)
and 7(b) measured the consequence, and it is real: under BOTH of those
narrowings the `brief-drift` GATE is GREEN and only the SUITE reddens. So the
direct workflow step `node scripts/check-brief-drift.mjs --check` is not the
guard for those states; the `suite` gate is. That is fine because both run on
both CI events, but it means the shipped header's promise should not be read as
covering mode narrowing. Not a finding; a fact a later reader needs.

**The `tuition/mechanism-index.yaml` row, recommended and deliberately not
added: I AGREE, and I agree with the reasoning as stated.** A fix round's diff
should be exactly what the findings require. The mechanism is durably recorded
in the work history and in two source comments (src/roles.ts:527 and
scripts/check-brief-drift.mjs:31), so nothing is lost by deferring. I did not
add it. **And DV-1 strengthens the case for the row rather than weakening it**:
the mechanism now has three demonstrated faces (the artifact-supplied selector,
the units floor, and the renderer-internal filter), which is precisely what a
mechanism index is for.

**F-B3 left tracked: I agree.** Exit code correct in every case, message wrong
only for a reordered or duplicated row, and the reader is told to re-render
either way.

**F-B1 untouched: CONFIRMED BY DIFF, not by assertion.** `scripts/m2-exit-test.sh`
is absent from `git diff --name-only 16bab6f..2a89757`, and I ran the harness
without editing it.

### 20. Citations and the quoting rule

Eight of the round's citations spot-checked by opening the file at the line:

```
src/roles.ts:553                                    export const BRIEF_GATE_BLOCK_MODE = "full";
src/roles.ts:689                                      return { text: lines.join("\n"), units: selected.length };
scripts/check-brief-drift.mjs:242                     if (located.mode !== BRIEF_GATE_BLOCK_MODE) {
test/implementer-brief.test.ts:752                  function fixRoundClauseFindings(clauseText: string): string[] {
witness/brief-drift-check-wired-executably.json:25      "replace": "        run: node scripts/check-brief-drift.mjs\n"
src/witness/run.ts:1318                                       `rule (g): members ${String(a)} and ${String(b)} mutate ...
schemas/gate-registry.schema.json:8                   "additionalProperties": false,
test/implementer-brief.test.ts:338                    for (const mode of declaredModes) {
```

All eight resolve to exactly what the round says is there. The three review
documents are BACKTICKED rather than cited, which is correct:

```
$ git ls-tree -r --name-only 2a89757 -- delivery/review/ | grep m3-p6
EXIT=1        (they do not exist on this branch)
$ git ls-tree -r --name-only e730116 -- delivery/review/ | grep m3-p6
delivery/review/arbitration-m3-p6.md
delivery/review/clean-room-m3-p6-criteria.md
delivery/review/clean-room-m3-p6-self-comparison.md
```

They are on `main` and not on the phase branch, so a bare `path:line` would not
resolve there. The quoted form is the deliberate right choice.

## Findings

| id | severity | finding |
|---|---|---|
| DV-1 | LOW | A third narrowing of the brief's gate table exists and nothing I ran caught it (the whole suite, and every gate in the PR bundle): a strict-subset filter inside `renderBriefGateBlock` at src/roles.ts:661, followed by `--write`, leaves `brief-drift` green over a 13-row block where the registry declares 15 for `full`, and the whole suite green at 617/617/0. PRE-EXISTING (the same defang is silent at `16bab6f` too), so it is a residual of the mechanism the round named, not a regression. It lives in the exact gap the round's own derivation flagged as most likely to hide another instance. One-line close: assert in test/implementer-brief.test.ts:314 that every id in `pinned` appears as a row in the shipped brief's located block. |
| DV-2 | OBSERVATION | One unreproduced red: `test/coverage-gate.test.ts`'s "a refused or failed evidence write makes the gate error instead of a silent green" failed once inside a full PR bundle (617 reported, 616 pass) and passed in nine subsequent runs, including the `suite` gate alone at 617/617/0. Not attributable to this delta; that file is not among the six changed. The named-pipe member at test/coverage-gate.test.ts:667 is the only structurally suspicious part. |
| DV-3 | OBSERVATION | Rule (g)'s collapse test is exact equality of `find` at src/witness/run.ts:1318, while its own comment at src/witness/run.ts:1306 says two mutations "touching the same line" are one member. The new witness member's `find` is a strict substring of the other two, so it touches the same line and does not collapse. Harmless here (the three members trip three different assertions, measured), but rule (g) enforces less than its comment describes. |
| DV-4 | OBSERVATION | Under the two mode narrowings the fix DOES catch (7a and 7b), the `brief-drift` GATE is green and only the `suite` gate reddens. Defensible placement, but the check's shipped header should not be read as covering mode narrowing. |

Nothing above blocks. DV-1 is the one worth a tracked follow-up.

## Verdict

**APPROVE the delta.** All three findings the round was dispatched to close are
closed and each was verified by executing the dangerous state and observing the
exit code, with a control at the pre-round head in every case where one was
available:

- **CV-1: VERIFIED, both convergent halves.** Contract A's marker narrowing is
  refused at exit 21 in `--write` and `--check` where the pre-round head
  rewrote to a 5-row table and reported green at exit 0. Contract B's vacuity
  half fires: `units` reaches 0 and M2-C-2 rewrites the record to
  `error / vacuous: true` at exit 21, where the pre-round head reported
  `green (3)` at exit 0. The mechanism claim about `--write` was tested by
  deleting the pin and reproducing the narrowing end to end. Three registered
  tests guard it and each is red under a different dangerous state.
- **A-1: VERIFIED.** The requirements are one re-runnable predicate; each of
  four weakenings is written to a file, read back, and put through it. Both
  defangs redden for the RIGHT reason: weakening the shipped clause names the
  unmet requirement, and defanging the predicate itself produces "the weakening
  ... left the check with nothing to report", which only a test that OBSERVES
  the check's output can say.
- **A-2: VERIFIED BY THE GATE, not only by the test.** `red-witness` evaluates
  three members of the spec, reports no rule (g) collapse, and the new member is
  red under mutation and green restored. It is structurally different measured
  by which assertion it trips: it is the only one that reaches the exit-code
  assertion.

The round's own paperwork holds up under re-execution: the derivations
reproduce, the broken-grep confession is exactly true, the claim-grep counts
decompose to the round's numbers plus pure self-quotation, the closing bundle's
head covers the current head because the three commits after it touch one
standing-extra file, the shared dispatch contract is one blob at three points,
and the branch merges clean into the CURRENT `main`.

**Conditions before merge**, none of them this round's to discharge:

1. The F-B1 harness fix on `claude/exit-test-harness-assertion-direction` merges
   first, per the arbitration.
2. CI green on THIS head, on the `pull_request` arm, observed. Everything above
   is local.
3. The post-merge `push` run on the new `main` head observed to completion
   (T-009). I could not run either arm.
4. DV-1 tracked. It does not block, on the same footing that made CV-1 a low.

## The claim grep over this document, both forms

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/verification-m3-p6-fix-round.md
FORM1_HITS=11
$ (same alternatives, whitespace flattened first)
FORM2_HITS=11
```

The two forms agree, so no claim of mine is hidden by a line wrap. Every hit
settled:

| # | claim | settled by |
|---|---|---|
| 1 | "rather than a read of the repository's own registry" | the full `git grep behaviors.json -- test` output in section 3; restated to describe what the grep showed rather than what does not exist |
| 2 | "M2-C-2 (never green by omission)" | captured output from the gate itself, section 5. Not my prose; altering it would be fabrication |
| 3 | "It never compares that independent derivation against the ROWS THE SHIPPED BRIEF ACTUALLY CARRIES" | settled by execution, not by reading: under DV-1's defang the shipped brief carries 13 rows and test 5 PASSES (section 7c) |
| 4 | "it needs a kernel-source edit" | the DV-1 defang I applied was to src/roles.ts:661, captured in section 7c |
| 5 | "The pre-round arm could not have said that" | the pre-round source at 16bab6f, quoted in the round's own work history and re-read by me; the old arm re-runs nothing |
| 6 | "never `git checkout --`" | a statement about MY OWN method. Its evidence is the `git status --porcelain \| wc -l` = 0 printed after every defang above, and the pristine snapshot directory every restore copied from |
| 7 | inside a captured assertion message | the test reporter's verbatim output, section 9 |
| 8, 9 | describing the wrap in the round's claim grep | the published FORM1/FORM2 counts and the located hit, section 11 |
| 10 | "I am not claiming it cannot be forced" | this is the restatement, not the claim. DV-2 is filed as an open question with nine green observations and one red |
| 11 | "nothing I ran caught it" | SCOPED to what I ran, and what I ran is published: `npm test` 617/617/0, bare `node --test` 619/619/0, and the full PR bundle's twelve gate rows. I did not run a `pull_request` or `push` CI arm and I do not claim anything about them |

Byte checks on this document:

```
nonAscii=0  control=0  emDash=0
$ node scripts/check-authored-bytes.mjs      (after git add -A)
AUTHORED_BYTES_EXIT=0
```
