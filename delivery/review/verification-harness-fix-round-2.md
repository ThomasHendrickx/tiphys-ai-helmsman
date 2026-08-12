# Delta verification: harness assertion-direction fix round 2

Instrument: delta verifier. Not an implementer, not a clean-room reviewer.
Nothing is fixed here, no pull request is opened, nothing is merged.

Subject: branch `claude/exit-test-harness-assertion-direction`, delta
fdb3120..9b7752d, against the two clean-room reviews that reviewed fdb3120.

Verifier worktree: a fresh detached worktree at 9b7752d with its own
`npm ci` (exit 0), plus a second detached worktree used as a mutation lab.
Toolchain: node v26.6.0 from the scratch prefix, checked in the shell that
ran each command.

Status: IN PROGRESS. This document is written incrementally and committed
after each command whose output it cites.

## 1. What this verification did NOT cover

(to be completed; see final section)

## 2. Verdict

(pending)

## 3. The delta, confirmed independently

```
$ git diff --stat fdb3120 9b7752d
 .../work-history/exit-test-assertion-direction.md  | 1182 ++++++++++++++++++++
 scripts/m2-exit-test.sh                            |   22 +
 test/behaviors.json                                |    4 +-
 test/m2-exit-test.test.ts                          |  242 +++-
 4 files changed, 1442 insertions(+), 8 deletions(-)

$ git diff --numstat 16a3ec6 9b7752d
117	0	delivery/work-history/exit-test-assertion-direction.md
```

CONFIRMED: `16a3ec6..9b7752d` is documentation-only, 117 lines added, 0 removed,
one file, inside `delivery/`. The code delta is entirely `fdb3120..16a3ec6`.

The premise both clean-room reviews rested on is VOID, measured:

```
$ git show fdb3120:scripts/m2-exit-test.sh | sha256sum
9f53425fc0e119d3398722c50d025a45466cab3d31f2c232f9dc9f5f22da1138  -
$ git show 9b7752d:scripts/m2-exit-test.sh | sha256sum
4b607dd9696485e5ef5e68838b99d596e532f516db2aa2012630873a14b9d452  -
```

My own working copy at HEAD hashes to `4b607dd9...` and the test file to
`5bb732f77ce3e0a3a9665e59eec3f70be55e26eec9d093297e07d8c53ae2cb19`, which are
the two pristine snapshot hashes the round records at
delivery/work-history/exit-test-assertion-direction.md:2554. Independently
reproduced, so the round's snapshots are the bytes on the branch.

## 4. CENTRAL CLAIM 1: does `probe-4-explicit-table-leg` discriminate?

The round's evidence (FR2.4) is a table of whole-test exit codes. The test
aborts at its first failed assertion, so that table can establish at most which
probe failed FIRST under each defang. It cannot show what the later probes did.
Three of its twelve cells are therefore unmeasured.

I measured the complete matrix instead. Method: the test was INSTRUMENTED in
place (one anchored single replacement, aborting unless the anchor occurs
exactly once) so the probe loop REPORTS per probe instead of asserting, and the
loop runs to completion under every harness state. Four harness states
(pristine plus one leg deleted at a time, each an anchored single replacement)
times four probes times two arms. Restored from the saved pristine bytes after
the run; no `git checkout --` anywhere.

Defanger negative control first, so a silently missing anchor cannot read as a
clean result:

```
$ node HDV-defang.mjs scripts/m2-exit-test.sh /dev/null 'this anchor does not occur anywhere at all' 'x'
ANCHOR NOT UNIQUE (0 occurrences), aborting: this anchor does not occur anywhere at all
EXIT=2
```

The matrix. Cell is the assertion program's exit status for that probe;
`0` means the probe was ACCEPTED, i.e. that probe no longer witnesses anything.
Identical on the `pr` arm and the `main` arm, so one table serves both.

| probe | pristine | `-rows` | `-manifestIds` | `-explicitById` |
|---|---|---|---|---|
| probe-1-rows-leg | 1 | **0** | 1 | 1 |
| probe-2-manifest-leg | 1 | 1 | **0** | 1 |
| probe-3-manifest-gate-not-applicable | 1 | 1 | 1 | 1 |
| probe-4-explicit-table-leg | 1 | 1 | 1 | **0** |

CONTROL: every cell of the pristine column is 1, so no probe is trivially
accepted; and the three `0` cells are the only accepted cells anywhere, so no
defang collapses the whole family.

**Claim 1 is UPHELD for probe-4.** Deleting `...explicitById.keys()` and nothing
else turns probe-4 green while probes 1, 2 and 3 stay red, and deleting either
other leg leaves probe-4 red. Its unique rejecter is the explicit leg. It does
not merely look different.

The verbatim finding lines show what fires, and they are not the same branch for
every probe:

```
probe-1  [fixture-gate-declared-nowhere] expected status green, observed not-applicable ...
         [fixture-gate-declared-nowhere] is a REQUIRED gate but its status is not-applicable, not green ...
probe-2  [credential-token] gates.manifest.json declares this gate and the bundle carries NO record for it ...
probe-3  [credential-token] expected status green, observed not-applicable ...
         [credential-token] is a REQUIRED gate but its status is not-applicable, not green ...
probe-4  [fixture-gate-only-the-table-names] no record in the bundle for a gate the table lists (expected green)
```

Two things fall out of the matrix that the round's own evidence could not show,
and one of them is a finding. See DV-1 and DV-2 in section 8.

## 5. CENTRAL CLAIM 3: the 22 lines of new production code, read as new code

Both new checks are reachable ALONE, verified by defanging each one and
re-running a five-case fixture set through the extracted assertion program:

```
                       pristine   check A removed   check B removed
CONTROL-wellformed        0             0                 0
A gates is an object      1             0                 1
B everything empty        1             1                 0
D gates key missing       1             0                 1
```

CONTROL is exit 0 in every column, so neither check is always-red and the
driver's fixtures are accepted at all. Removing A frees case A while case B
stays rejected; removing B frees case B while case A stays rejected. **The
round's claim that each is witnessed alone by a member the other cannot reject
is UPHELD.**

What the two checks CANNOT reject is finding DV-3, and it is the same silent
degradation, in the same leg, under a third input.

## 6. CENTRAL CLAIM 2: re-deriving "24 branches, 3 reference the reason, 0 of 24"

I did NOT run the round's script for this. I wrote my own enumerator with a
deliberately different method: the round brace-matches forward from a line
containing `fail(`, mine runs a character scan with a string / template /
comment aware tokenizer and counts tokens in CODE POSITION only, so a `fail(`
inside a comment or a string cannot be counted and a multi-line call cannot be
double counted. It also counts `throw` and separates `process.exit(0)`.

```
$ node HDV-enum.mjs <harness at fdb3120>
kind | file line | arg
exit | 433 | 2
exit | 457 | 2
exit | 467 | 1
exit | 499 | 1
fail | 536 | ... fail | 545 | ... fail | 549 | ... fail | 556 |
fail | 568 | ... fail | 576 | ... fail | 584 | ... fail | 603 |
fail | 609 | ... fail | 620 | ... fail | 633 | ... fail | 650 |
fail | 655 | ... fail | 659 | ... fail | 678 | ... fail | 694 |
fail | 697 | ... fail | 711 | ... fail | 715 |
exit | 724 | 1
TOTAL rejection tokens: 24
  fail(): 19
  process.exit(nonzero): 5
  throw: 0
process.exit(0) tokens (NOT rejections): 1

reason binding: const why = explicit ? "" : DEFAULT_SPEC_WHY
code-position occurrences of identifier `why` at file lines: 533, 540, 550, 556
```

**Claim 2 is UPHELD.** Twenty-four rejection tokens at `fdb3120`, and my line
numbers agree with the round's published table line for line, including the four
`process.exit` sites and the count `19 + 5`. The identifier `why` occurs in code
position at four lines: 533 is the binding, and 540, 550 and 556 fall inside the
`fail(` calls the round marks YES at 536, 549 and 556. So **three** of
twenty-four reference the reason variable, independently. Since all three read
one binding whose value is `""` when `explicit` is truthy, and `explicitById`'s
keys are inserted together with their specs so `explicit` is truthy for every
one of them, **zero** branches can carry the key for an explicit member.

At HEAD the same enumerator reports 26 (`21` fail, `5` exit), the two new
self-vacuity checks being the difference, and the reason binding is unchanged.

## 7. CENTRAL CLAIM 4: the guard against a FOURTH leg

Form first, then behaviour.

FORM. The assertion is `assert.deepEqual(sorted source NAMES, ["explicitById",
"manifestIds", "rows"])`. It pins no count:

```
$ grep -nE 'sources\.length|probed\.length' test/m2-exit-test.test.ts
(no output, exit 1)
```

BEHAVIOUR, one run of the guard test per harness variant, each variant an
anchored single replacement off the pristine bytes:

```
legguard:PRISTINE        EXIT=0
legguard:h-norows        EXIT=1  Derived from the harness: ["explicitById","manifestIds"]
legguard:h-nomanifest    EXIT=1  Derived from the harness: ["explicitById","rows"]
legguard:h-noexplicit    EXIT=1  Derived from the harness: ["manifestIds","rows"]
legguard:h-fourth-ident  EXIT=1
legguard:h-fourth-expr   EXIT=0     <== see DV-4
```

Green control, red on each of the three REMOVALS with the derived list printed
by name, red on an ADDED source spelled as a bare identifier. That much of the
claim is UPHELD.

`h-fourth-expr` is mine and it is finding DV-4.

## 8. Findings

### DV-1 (LOW): `probe-3` witnesses no leg, and the guard's own message says it does

Measured, section 4's matrix: `probe-3-manifest-gate-not-applicable` is exit 1
in ALL FOUR harness columns. Removing `manifestIds` does not free it, because
its bundle carries a row for the same gate, so it re-enters through the `rows`
leg. It goes green only if both legs are removed.

The union-source guard's assertion message states the mapping the guard exists
to keep honest, and it is wrong about probe-3:

> probe-1-rows-leg witnesses `rows`, probe-2-manifest-leg and
> probe-3-manifest-gate-not-applicable witness `manifestIds`, probe-4-
> explicit-table-leg witnesses `explicitById`

Measured, `manifestIds` has exactly ONE witness, probe-2. The manifest leg IS
witnessed, so nothing is currently unguarded; what is wrong is the attribution.
It matters because that message is what a future maintainer reads when the
guard reddens, and it would tell them the manifest leg has two independent
witnesses when removing probe-2 would leave it with none. This is the
"one witness is not a class" shape displaced one level, into the bookkeeping.

Round 1 already labelled a similar mis-credit ("these are NOT witnesses for the
derived expected set, and the assertion names the check they do witness so they
cannot be miscredited again", test/m2-exit-test.test.ts:1530). The same
discipline was not applied to probe-3.

### DV-2 (observation, not a defect): the round's FR2.4 claim 3 is looser than its evidence

FR2.4 says "Each leg reddens a DIFFERENT named assertion, so the three probes
are three code paths and not one wearing three hats." Measured, probes 1 and 3
redden the SAME two branches with the same two message texts, and probes 2 and 4
redden the SAME `if (row === undefined)` statement by its two ternary arms. What
IS true, and is the property that matters, is that deleting each leg turns
exactly one probe green, and section 4's matrix establishes that for all three
legs on both arms, which the round's own whole-test exit codes could not.

### DV-3 (MEDIUM): a manifest with `gates: []` empties the manifest leg silently, and neither new check rejects it

The round names the mechanism in the shipped comment: "a manifest that parses
but whose `gates` key is not an array makes the manifest leg empty". A manifest
whose `gates` key IS an array but EMPTY makes the manifest leg empty in exactly
the same way, and is rejected by neither check.

Five cases through the extracted assertion program, control first:

```
--- CONTROL-wellformed: EXIT=0
--- A-gates-is-object:   EXIT=1   ... its "gates" key is not an array ...
--- B-everything-empty:  EXIT=1   ... the derived expected set is EMPTY ...
--- C-gates-empty-array: EXIT=0
      m2-assert (m3): OK. 1 gate record(s) match section 1.4; 1 gate(s) asserted ...
--- D-gates-key-missing: EXIT=1   ... its "gates" key is not an array ...
```

Case C is a manifest `{"version":1,"gates":[]}` with a bundle reporting one
green row. `Array.isArray([])` is true so check A cannot fire; the expected set
is non-empty because the ROWS leg supplies it, so check B cannot fire. The run
is certified with the manifest leg contributing nothing, which is precisely the
state in which "gates.manifest.json declares this gate and the bundle carries NO
record for it" can never fire: a configured gate that did not run is invisible
again, which is the class this whole branch exists to close.

Two things sharpen this rather than soften it:

1. **The shipped message asserts the opposite.** Check A's own text ends "a
   manifest that declares no gates cannot certify a bundle". Case C IS a
   manifest that declares no gates and it DOES certify a bundle. A `cannot`
   claim in production text, falsified by the program it is printed by.
2. **The round's own stated rationale puts case C in scope.** The comment says
   both covered inputs are "reachable by anything else that runs this program,
   and 'not reachable today' is not a property a later edit preserves". Case C
   has the same standing and is not covered.

MITIGATION, stated so the severity is not overstated: through the SHIPPED
harness an empty manifest yields a bundle with no rows, and then check B fires.
The exposure is a bundle and a manifest that do not come from the same run, and
any future consumer of the program. I did not construct an end-to-end shipped
path that reaches case C, and I am not claiming one exists.

### DV-4 (MEDIUM): the fourth-leg guard is blind to a leg spelled as an expression

The behaviour registered is "every source spread into the derived expected set
is named by this suite, so a new leg cannot arrive unprobed"
(test/behaviors.json:601). The guard reads sources with
`/\.\.\.\s*([A-Za-z_$][\w$]*)/g`, which requires the spread to be followed
immediately by a bare identifier. A spread of a parenthesised expression is
invisible to it.

I added a fourth leg in this repository's own idiom, `...(summary.extraGates ??
[])`, which is the same shape as `expect.gates ?? []` and `expect.absent ?? []`
already in the file. It is a FULLY FUNCTIONAL leg, not a syntactic decoration.
Control first, same fixtures, one gate id supplied only through the new leg:

```
--- CONTROL: pristine program, same fixtures (fourth leg absent)
m2-assert (fx): OK. 1 gate record(s) match section 1.4; 1 gate(s) asserted ...
EXIT=0
--- h-fourth-expr program, same fixtures
m2-assert (fx): FAIL with 1 finding(s):
  - [gate-entering-by-the-FOURTH-leg] gates.manifest.json declares this gate and
    the bundle carries NO record for it, ...
EXIT=1
```

The id entered the expected set through the new leg and changed the verdict. And
the guard stays green:

```
legguard:h-fourth-ident  EXIT=1
legguard:h-fourth-expr   EXIT=0
```

So the registered behaviour's universal claim is false as written. The guard
covers legs spelled `...identifier...`, which happens to include all three
present ones and the most obvious new spellings (`...fooIds`,
`...Object.keys(x)`), and excludes `...(x ?? [])` and `...[a, b]`. FR2.9 item 1
declares the adjacent exclusion (a SECOND union added beside this one) but does
not declare this one, which is closer: a fourth leg inside the SAME union.

## 9. Regressions: `test/behaviors.json`, per hunk

One hunk, three lines:

```
$ git diff -U0 fdb3120 16a3ec6 -- test/behaviors.json
@@ -599 +599,3 @@
-  "m2-exit-zero-red-reads-rows-not-counts": "... cannot pass"
+  "m2-exit-zero-red-reads-rows-not-counts": "... cannot pass",
+  "m2-exit-assert-program-not-exempt-from-m2-c-2": "..."
+  "m2-exit-union-sources-named-by-this-suite": "..."
```

| edit | FORCED or RELAXED |
|---|---|
| the single `-` line | neither: identical text, a trailing comma added because a row follows it |
| `m2-exit-assert-program-not-exempt-from-m2-c-2` | FORCED by new behaviour (the two harness checks) |
| `m2-exit-union-sources-named-by-this-suite` | FORCED by new behaviour (the union-source guard) |

Nothing was relaxed and nothing was deleted; the only `-` line in the whole file
diff is the comma reformat. Both new descriptions are verbatim the titles of the
two new tests, each of which occurs exactly once, so both resolve BY NAME.

## 10. The byte-identity claim, verified by RE-EXECUTION rather than comparison

The round reports that a blanket replacement briefly rewrote line numbers inside
its published derivation capture, and that it was reverted with "captured output
block is VERBATIM: True". Captured output that was edited and restored is where
fabricated evidence would hide, so I did not take the string comparison.

I extracted the round's own pasted script out of the markdown fence, extracted
its published output out of the following fence, made a worktree at `fdb3120`,
ran the script there, and diffed:

```
$ node HDV-round-derive.mjs <worktree at fdb3120> > HDV-rerun.txt
rerun EXIT=0
$ diff HDV-round-captured.txt HDV-rerun.txt
diff EXIT=0
```

Zero differences over all 62 lines, including every one of the 24 file:line
tokens. **The published capture is what the published script produces at
`fdb3120`.** The near-miss was reverted correctly, and the script and the output
are consistent with each other and with the tree they name.

## 11. The `src/` grep the round declined to run (its FR2.9 item 5)

The round excluded this by choice. I ran it. The mechanism is "a witness
family's admission test is keyed on a message only some branches emit", whose
code signature is a NEGATED membership test used to reject a probe's output.

```
$ git grep -n -E 'filter\(\(?(line|l|f|finding)[^)]*\)? *=> *!?[A-Za-z_$.]*\.includes\(' -- 'test/*' 'src/*' 'scripts/*' 'bin/*'
test/assurance-modes.test.ts:1465        line.includes("duplicates and must be unique")
test/assurance-modes.test.ts:1508        line.includes("mode-ids-are-unique")
test/assurance-modes.test.ts:1542        line.includes("duplicates and must be unique")
test/assurance-modes.test.ts:1586        line.includes("role-ids-are-unique")
test/assurance-modes.test.ts:1694        line.includes("mode-conditions-quote-granted-by")
test/assurance-modes.test.ts:1730        line.includes("mode-conditions-quote-granted-by")
test/assurance-modes.test.ts:1897        line.includes("charter-mode-enum-matches-modes")
test/brief-compose.test.ts:246          !rendered.includes(`### ${field}`)
test/liveness.test.ts:179                line.includes("watcher stale")
test/m2-exit-test.test.ts:1512          !line.includes(probe.reason)
test/teardown.test.ts:70                 line.includes("watcher stale")
test/teardown.test.ts:78                !line.includes("watcher stale")
exit=0
```

Result: **one instance of the dangerous polarity over a program's findings, and
it is the site this round fixed.** The `assurance-modes` and `liveness` hits are
POSITIVE filters that COUNT occurrences of one named check; a positive filter
cannot silently reject a probe, it can only fail to find one, which is a
different (and self-announcing) failure. `teardown.test.ts:78` strips an
advisory line from a stream before other assertions, not an admission test.
`brief-compose.test.ts:246` is over rendered fields, not findings.

I also looked for the OTHER half of the shape, a spread union whose legs decide
what gets asserted on:

```
$ git grep -n -E 'for \(const [A-Za-z_$]+ of \[\.\.\..*\.\.\.' -- 'src/*' 'bin/*' 'scripts/*' 'test/*'
scripts/m2-exit-test.sh:515   the union under review
src/commands/mode.ts:131      [...lines, ...checks.lines]      output concatenation, decides nothing
src/gates/citations.ts:298    [...config.externalRoots, ...config.roots]   resolution roots, not an assertion set
```

Neither `src/` hit is the same class. This closes FR2.9 item 5 for the polarity
and the union shape, within the bounds in section 1.

## 12. The complete suite sentence: three axes plus SKIPPED

All at HEAD `9b7752d` plus this report file, `dist/` built with `npm run build`
exit 0 and `git status --porcelain` empty afterwards unless stated.

| toolchain | build state | invocation | tests | pass | SKIPPED | exit |
|---|---|---|---|---|---|---|
| node v26.6.0 (scratch prefix) | `dist/` built | `npm test` | 596 | 596 | **0** | 0 |
| node v26.6.0 | `dist/` built | bare `node --test` | **598** | 598 | **0** | 0 |
| node v26.6.0 | `dist/` REMOVED | `npm test` | 596 | 586 | **10** | 0 |
| node v22.22.2 (default, `bash -lc`) | `dist/` built | `npm test` | 596 | 594 | **2** | 0 |

596 is the number CI and the `suite` gate mean. The bare-invocation `+2` is the
tracked `sandbox/test/greet.js` fixture CLAUDE.md:684 records. The default
toolchain's 2 skips are the floor-gated `doctor` tests, per CLAUDE.md:668.

The no-dist arm reports **10** skipped, not the **9** CLAUDE.md:653 records. The
extra one is named rather than inferred: `a RED gate is rejected on BOTH bundles
under three structurally different shapes ...`, which is a fifth dist-gated test
in `test/m2-exit-test.test.ts` and does not exist on `origin/main`
(`git show origin/main:test/m2-exit-test.test.ts | grep -c 'a RED gate is
rejected on BOTH bundles'` returns 0). So CLAUDE.md's 9 is correct for `main`
and stale for this branch; this is a consequence of the branch, not a defect in
it, and it is worth an edit to warning 12 when the branch merges.

**BOTH CI arms carry the two new tests**, which is the T-009 property the round
claims. In the no-dist arm, where the five dist-gated tests skip, both new tests
still PASS:

```
+ the assertion program applies M2-C-2 to ITSELF and refuses to certify a bundle ...
+ every source spread into the derived expected set is named by this suite ...
```

TRANSLITERATION NOTE. Node's test reporter prints U+2139 at the head of each
summary line and U+2714 at the head of each passing line. Every capture in this
document that carries them has them rendered as `i` (U+2139, 0 occurrences kept
in this file, the summary lines are quoted as a table instead) and `+` (U+2714,
2 occurrences, the two lines immediately above). U+2716 does not occur: no test
failed in any of the four runs. Nothing else in any captured output was changed.

Machine load was measured at each run rather than assumed, because two agents
hit wall-clock flakes today: `uptime` read load average 0.08 before the first
run and 2.80 before the second. No test failed in any of the four runs, so the
`test/watcher.test.ts` and `test/coverage-gate.test.ts:189` flakes did not
arise here.
