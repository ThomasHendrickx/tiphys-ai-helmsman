# Delta verification: exit-test harness fix round 4

Independent verifier. I did not write the code under review. The job was to
falsify it, not to confirm it.

Subject: branch `claude/exit-test-harness-assertion-direction`, pull request
109, head 392f97f, delta 6fd51cb..392f97f. Round 4 of a fix chain whose earlier
rounds are already on `main`.

Toolchain for every measurement below unless a line says otherwise: node
v26.6.0 from the scratch prefix, `node --version` checked in the shell that ran
the command.

`$SP` below is this session's scratchpad directory,
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad`.
Everything under `$SP/DV4-*` is a lab or a capture and is ephemeral: it is named
so a reader can see WHAT produced each block, and every block quoted here is
reproducible from the lab script beside it, not from the directory surviving.

**Verdict: VERIFIED WITH FINDINGS.** The round's central claim is largely true
and is a real improvement: the freeze is reached on every path, it is a property
of the object, and every post-freeze write shape I could construct is refused by
it. But the SECOND instrument, the re-derivation the round added specifically to
cover the region the freeze cannot reach, carries the round's own mechanism one
more time, and its shipped comment states a universal that four measured members
falsify.

| id | severity | one line |
|---|---|---|
| DV4-1 | MEDIUM | the leg-union re-derivation is a LENGTH-plus-membership test, not a set equality, so a write inside the closure that substitutes a DUPLICATE for a DROPPED id passes it; four members exit 0 certifying a bundle in which a manifest-declared gate produced no record |
| DV4-2 | LOW | the freeze is a property of the object, but the program consumes the set by ITERATION and the iteration protocol lives on the unfrozen prototype; one post-freeze member exits 0 and certifies a gate that did not run |
| DV4-3 | LOW | FR4.11's not-covered says it read the unfiltered command-substitution output "and found no such case"; there are eight such cases in the same file |
| DV4-4 | LOW (observation) | the two derivations share their FILTERS as well as their legs, which the not-covered section states for legs only |

Nothing here is a defect in the bytes that ship. The shipped assertion program is
correct on every fixture I built. All four findings are about the strength of the
guards, which is the entire subject of this branch.

## 1. The ground I stood on, checked rather than inherited

**`main` is a genuine pre-fix control.** Measured at `origin/main` = 7784c47,
which is NOT the merge base (the merge base is 9781212):

```
$ grep -c "Object.freeze" scripts/m2-exit-test.sh     # on origin/main
0
$ grep -c "legContributed" scripts/m2-exit-test.sh    # on origin/main
0
$ grep -c "expectedIds" scripts/m2-exit-test.sh       # on origin/main
7
```

So `main` already carries the DERIVATION (the union of three legs) and carries
NEITHER of round 4's two new run-time instruments. It is a real control for this
round's material, not a synthetic one.

**Which files I may cite with a resolving `path:line`.** The branch changes
exactly four paths against the merge base:

```
$ git diff --name-only origin/main...392f97f
delivery/work-history/exit-test-assertion-direction.md
scripts/m2-exit-test.sh
test/behaviors.json
test/m2-exit-test.test.ts
```

This report lands on `main`, where those four carry different bytes, so every
reference into them below is QUOTED in backticks and its line number is
informational only, per CLAUDE.md:178. Everything else in the tree is
byte-identical across the two sides and is cited normally.

**`red-witness` does not run on this pull request**, so no gate evaluates whether
the new witnesses can fail. Confirmed independently: the diff touches
`scripts/`, `test/` and `delivery/` and no path under `src/` or `bin/`, which is
the gate's precondition. The repository already records that shape at
delivery/verification/red-witness-does-not-run-on-scripts.md:1. Everything in
section 2 is therefore lab work, mine and the round's, and nothing mechanical
stands behind it.

## 2. DV4-1 (MEDIUM): the second derivation compares a LIST against a SET

### The claim being tested

The round's own words, quoted from the shipping comment at
`scripts/m2-exit-test.sh:577` to `scripts/m2-exit-test.sh:578`:

> An id that no leg contributed, an id the table declared absent, a
> duplicate, or a dropped id all break the equality.

and from `delivery/work-history/exit-test-assertion-direction.md:5052`:

> all break it.

and the disclosure at FR4.5 item 6, which bounds the uncaught class to a write
that "adds an id A LEG ALREADY CONTRIBUTED", adding that "`out.push(out[0])`
would break the equality by length, so a duplicate is caught"; and FR4.10, which
restates the uncaught class as "a write inside the derivation closure that
produces a set the legs also produce".

### The condition

`scripts/m2-exit-test.sh:597`:

```
if (expectedIds.length !== legContributed.size || expectedIds.some((id) => !legContributed.has(id))) {
```

`legContributed` is a `Set`. `expectedIds` is an `Array`. Length against SIZE
plus one-way membership is set equality ONLY for a duplicate-free list. The
honest program produces a duplicate-free list because the loop dedupes with
`out.includes(id)`, so the two agree in production; but the check is a guard
against the loop being changed, and a change that introduces a duplicate is
exactly what defeats the arithmetic.

**A drop and a duplicate cancel.** Legs contribute `{A, B}`; the mutated closure
returns `[A, A]`. Length 2 equals size 2, and every element is in the set. The
check passes and the program never asserts on B.

This is not the class FR4.5 item 6 discloses. `[A, A]` is not "a set the legs
also produce": the legs produce `{A, B}` and the mutated run produces `{A}`.
The disclosure covers the ADDING direction of a duplicate and misses the
SUBSTITUTING one, which is the silent direction.

### The witness: four structurally different members, against the DANGEROUS state

The lab is at `$SP/DV4-lab2/lab.mjs` and the capture at `$SP/DV4-lab2-head.txt`.
It extracts the assertion program from the head harness heredoc, injects one
statement before `  return out;` (anchor count asserted to be exactly 1 for every
member), and runs it against fixtures that are byte-identical across all five
rows. The fixtures ARE the dangerous state rather than a synthetic difference:
the manifest declares TWO gates and the bundle carries a record for ONE, so the
honest program must report that a declared gate did not run.

```
########## CONTROL-unmutated anchors=1 exit=1 leg-union-check-fired=false names-gate-that-did-not-run=true
m2-assert (did-not-run): FAIL with 1 finding(s):
  - [fixture-gate-that-did-not-run] gates.manifest.json declares this gate and the bundle carries NO record for it, and the table does not list it as absent from this bundle; a declared gate that produced no record is a gate that did not run. This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.

########## M1-pop-then-push-first anchors=1 exit=0 leg-union-check-fired=false names-gate-that-did-not-run=false
m2-assert (did-not-run): OK. 1 gate record(s) match section 1.4; derived from 2 manifest id(s), 1 bundle row id(s) and 0 table row id(s); 2 gate(s) asserted (0 from an explicit table row, 2 under the default required-green: fixture-gate-that-ran, fixture-gate-that-ran); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.

########## M2-index-overwrite anchors=1 exit=0 leg-union-check-fired=false names-gate-that-did-not-run=false
########## M3-splice-substitute anchors=1 exit=0 leg-union-check-fired=false names-gate-that-did-not-run=false
########## M4-fill anchors=1 exit=0 leg-union-check-fired=false names-gate-that-did-not-run=false
```

The last three rows print an OK line identical to M1's; the capture file carries
all four verbatim and nothing in it was altered. The file is pure ASCII as
emitted, checked with `LC_ALL=C grep -caP '[^\x00-\x7F]'` returning 0.

The four injections, and why they are structurally different rather than four
spellings of one thing:

| member | injected | shape |
|---|---|---|
| M1 | `out.pop(); out.push(out[0]);` | two method calls, one removing and one adding |
| M2 | `out[1] = out[0];` | an index assignment, no method call at all |
| M3 | `out.splice(1, 1, out[0]);` | one method call doing both in a single operation |
| M4 | `out.fill(out[0]);` | a whole-array method naming no index |

**ENTERED, not merely the exit code.** The brief requires that a refusal show
WHY. Here the requirement runs the other way: I must show the ACCEPTANCE is real
and not an accident of the fixture. The evidence is in the success line the
program prints for itself. It reads `2 gate(s) asserted ... fixture-gate-that-ran,
fixture-gate-that-ran`, naming one gate twice, and the gate that did not run
appears nowhere in the output (`names-gate-that-did-not-run=false`). The
`leg-union-check-fired=false` column is a direct probe of the instrument under
test: its own message string never appears in any of the four outputs.

### It survives the whole suite, which is the part that matters

An injection into a scratch copy proves the check is weak. It does not prove such
a change would reach `main`, because the suite might catch it another way. So I
injected into the real harness in the head worktree and ran the tests.

Two of my first attempts were caught. I record that rather than only the member
that worked, because a null result is evidence:

| injected into the real `scripts/m2-exit-test.sh` | `node --test test/m2-exit-test.test.ts` |
|---|---|
| `out[1] = out[0];` | 18 tests, 16 pass, 2 FAIL |
| `out[out.length - 1] = out[0];` | 18 tests, 17 pass, 1 FAIL |
| `if (out.length > 2) { out[1] = out[0]; }` | **18 tests, 18 pass, 0 fail, 0 skipped** |

The first two are caught because the round's own new test carries a positive
control that runs the SHIPPED program against a two-gate fixture and asserts both
gates are named (`test/m2-exit-test.test.ts:2140`), and because one pre-existing
leg probe drives the real thirteen-gate table and depends on the LAST element.
That control is doing real work and I say so plainly. But its fixture is of a
fixed size, and a member conditioned on the set being larger than two walks past
it, along with every other test in the file.

The harm of the surviving member, measured against three declared gates of which
the middle one produced no record (`$SP/DV4-lab4.mjs`):

```
=== MUTATED harness (out.length>2 collapse of element 1) ===
exit=0
m2-assert (three declared, middle did not run): OK. 2 gate record(s) match section 1.4; derived from 3 manifest id(s), 2 bundle row id(s) and 0 table row id(s); 3 gate(s) asserted (0 from an explicit table row, 3 under the default required-green: fixture-gate-a, fixture-gate-a, fixture-gate-c); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.

=== PRISTINE harness (as shipped at 392f97f) ===
exit=1
m2-assert (three declared, middle did not run): FAIL with 1 finding(s):
  - [fixture-gate-b-did-not-run] gates.manifest.json declares this gate and the bundle carries NO record for it, and the table does not list it as absent from this bundle; a declared gate that produced no record is a gate that did not run. This gate has NO row in the expectations table, so it was asserted under the default for a declared-but-unlisted gate, which is deliberately the STRICT one (required, green). If this gate is legitimately allowed another status, that is a row to add to the table in scripts/m2-exit-test.sh, not a default to loosen.
```

Both bundles the real harness runs carry more than two expected ids (the PR
bundle asserted on thirteen in a capture taken during the same session), so the
condition `out.length > 2` holds on every real run.

### Why this is the round's own mechanism, again

The mechanism round 4 set out to fix, in its own words at FR4.1: a check's
CONDITION recognises a subset of the class its MESSAGE quantifies over. The
message at `scripts/m2-exit-test.sh:577` quantifies over "a dropped id". The
condition recognises a dropped id only when the drop changes the CARDINALITY. A
drop paid for with a duplicate is a member of the message's class and not of the
condition's. That is instance four, inside the instrument built to end instances
one to three.

### The shape of a fix, for the orchestrator's information

One line: compare sorted lists, or add the duplicate-freeness the loop already
intends, for example by also requiring `new Set(expectedIds).size` to equal
`expectedIds.length`. This is a suggestion, not a finding; I did not test it
beyond noting that all four members above change `new Set(expectedIds).size`.

## 3. DV4-2 (LOW): the freeze is a property of the object, the reading is a property of the prototype

The round's claim, FR4.2 item 2: "any later write must name `expectedIds`, and
`Object.freeze` makes every such write throw in a module, whatever it is spelled
like and through whatever alias it arrives. This is a property of the OBJECT".

**The write half of that claim is TRUE and I could not falsify it.** The round's
own eight post-freeze members pass at head (section 6.5). To those I added two
post-freeze writes of my own in `$SP/DV4-lab1/lab.mjs`, capture
`$SP/DV4-lab1-head.txt`: a replay of `expectedIds.push` as a control that the lab
itself works, and `Object.defineProperty`, which the round did not inject. Both
threw:

```
########## R4-after-push ... exit=1
TypeError: Cannot add property 2, object is not extensible
########## DV4-after-defineproperty ... exit=1
TypeError: Cannot define property 2, object is not extensible
```

`Object.defineProperty` is refused. A `structuredClone` round trip and a Proxy
wrap both require rebinding `expectedIds`, which is a `const`, so neither is
expressible. The freeze throws rather than failing silently because the program
is written to `m2-assert.mjs` and run as an ES module, which is strict mode; I
checked the extension at `scripts/m2-exit-test.sh:438` rather than assuming it.

**What is not closed is the READ.** The program consumes the set with
`for (const id of expectedIds)`, and the iteration protocol resolves through
`Array.prototype`, which `Object.freeze(expectedIds)` does not touch. One member,
injected AFTER the freeze and after the leg-union check, exits 0 and certifies
the same dangerous bundle as section 2 (`$SP/DV4-lab3.txt`):

```
########## proto-iterator-truncate-nongenerator exit=0
m2-assert (proto): OK. 1 gate record(s) match section 1.4; derived from 1 manifest id(s), 1 bundle row id(s) and 0 table row id(s); 2 gate(s) asserted (0 from an explicit table row, 2 under the default required-green: fixture-gate-that-ran, fixture-gate-that-did-not-run); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
```

The injected statement replaces `Array.prototype[Symbol.iterator]` with a
non-generator iterator that yields index 0 only. Note the report drifts with it:
the success line claims both gates were asserted while the per-gate loop ran over
one, and `derived from 1 manifest id(s)` shows the same truncation reaching
`contribution()`.

Severity LOW rather than MEDIUM, and the reason is stated so it can be argued
with: unlike section 2, I have no plausible accidental edit with this shape. An
engineer maintaining this program writes `out[1] = out[0]`; reassigning
`Array.prototype[Symbol.iterator]` is not something a maintenance edit does by
accident, which is a judgement and not a measurement. I record it because the
round's class statement is "an operation that changes the set of gate ids this
program asserts on", and this is a member of that class that exits 0, so the
class statement is broader than the guard. A second prototype member,
`Object.getPrototypeOf(expectedIds)[Symbol.iterator] = ...` taken from a slice of
the array itself, exited 1. So this is ONE witness, not two, and CLAUDE.md:380
says one witness is not a class. I am not calling it one.

### Two more members from the same lab, disclosed rather than left in the capture

`$SP/DV4-lab1-head.txt` carries two members I did not turn into findings, and I
name them so nothing in my own evidence is undisclosed:

- `explicitById.set(<gate B>, { expect: "green|red|error", required: false })`
  injected after the derivation exits 0. It does NOT change the set of gate ids
  asserted on, which is the class the round quantified over; it changes the SPEC
  one of them is asserted under. The row-driven backstops (zero red, zero error,
  zero vacuous, and the not-applicable justification loop) still hold, so the
  reachable harm is bounded. Not a finding against this round; recorded because
  the freeze covers the id set and no instrument covers the spec map.
- `rows.length = 0` injected after the derivation is caught LOUDLY, with six
  findings including four count re-derivation mismatches. A null result, recorded
  because it is evidence about where the program is already strong.

## 4. DV4-3 (LOW): a false absence in a not-covered section

FR4.11 derives the command-substitution sites with a grep filtered by command
name, and its not-covered paragraph says, at
`delivery/work-history/exit-test-assertion-direction.md:5910`:

> the filter is also a blocklist of common commands rather than a parser, so a
> substitution invoking one of the filtered names in argument position would not
> appear above; I read the unfiltered output as well and found no such case

The unfiltered enumeration of the same file, run by me:

```
$ grep -n '\$(' scripts/m2-exit-test.sh | grep -v '\$(('
```

returns eight substitutions in argument position invoking a filtered name: seven
occurrences of `at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \` passed to `json_object`
(`scripts/m2-exit-test.sh:397`, `:418`, `:902`, `:1156`, `:1211`, `:1270`,
`:1399`) and one `"$(wc -c <"${TIPHYS}" | tr -d ' ') bytes at ..."` passed to
`note_step` (`scripts/m2-exit-test.sh:1183`). Each is the exact shape FR4.11's
own mechanism describes: a command substitution used as an ARGUMENT, whose status
`set -euo pipefail` (`scripts/m2-exit-test.sh:76`) discards.

The CONSEQUENCE is small and I do not inflate it: a failing `date` or `wc`
produces an evidence record with an empty field, not a changed verdict. The
finding is the sentence, not the sites. CLAUDE.md:326 makes item 3 the reviewer's
first check and CLAUDE.md:859 forbids softening a work history; an asserted
absence the file contradicts is the error in that section that costs the next
reader most, because it tells them not to look. The honest form was available and
is used elsewhere in the same document: "I did not find a way", rather than
"found no such case".

## 5. DV4-4 (LOW, observation): the two derivations share more than their legs

The round states the complementarity limit for LEGS, at
`scripts/m2-exit-test.sh:583` and in FR4.5 item 5: a fourth leg enters both
computations, so they agree, and the element pin is what covers that. True, and
it is the right disclosure.

The FILTERS are shared in the same way and are not mentioned. Both computations
apply `usableId` and `absentIds.has`. Measured, `$SP/DV4-lab5.txt`, with
`absentIds.add(<the gate that did not run>)` injected before the derivation:

```
########## CONTROL exit=1 leg-union-check-fired=false
m2-assert (shared-filter): FAIL with 1 finding(s):
  - [fixture-gate-b-did-not-run] gates.manifest.json declares this gate and the bundle carries NO record for it, ...

########## shared-filter-absentIds exit=0 leg-union-check-fired=false
m2-assert (shared-filter): OK. 1 gate record(s) match section 1.4; ... 1 gate(s) asserted (0 from an explicit table row, 1 under the default required-green: fixture-gate-a); 1 asserted absent: fixture-gate-b-did-not-run; ...
```

(The two OK/FAIL lines are elided at the ellipses only; the capture holds them in
full and is pure ASCII.)

Mitigation, and it is real: the success line NAMES the absent id, so a reader of
the evidence sees it, exactly as section 2's collapse prints the duplicate id
twice. Neither is visible to any check. This is an observation about the
completeness of the not-covered section rather than a defect.

## 6. What I checked and found CORRECT

### 6.1 The freeze is reached on every path (brief target 2)

`expectedIds` is a `const` initialised by an immediately-invoked function
expression wrapped in `Object.freeze`, at `scripts/m2-exit-test.sh:559`. There is
no conditional around it and no assignment to the binding elsewhere. The only
exits before it are four terminal `process.exit` calls (argument check,
expectations read, summary read, manifest read), enumerated by line:

```
$ grep -n "process.exit" scripts/m2-exit-test.sh | awk -F: '$1<560'
455:  process.exit(2);
479:  process.exit(2);
489:  process.exit(1);
521:  process.exit(1);
```

None of them continues. No path reaches the per-gate assertion loop with an
unfrozen set. The freeze is applied to the binding rather than to a copy: the
IIFE's return value IS the frozen object, and its accumulator `out` has no
binding outside the closure.

### 6.2 The occurrence pin genuinely fails closed

The inverted default holds. Walking the classifier by hand against shapes it was
not written for: an alias declaration leaves `;` after the identifier,
`Object.assign(expectedIds, ...)` leaves `,`, a computed member leaves `[]`, and
`expectedIds.length = 0` is excluded from the `.length` read form by the negative
lookahead `(?!\s*=[^=])`. None is in the pinned `["=", ")"]`, and because the
comparison is a `deepEqual` over an ordered array, an appended occurrence changes
its length and reddens whatever its token. The one form yielding the
already-pinned `)` token is an identifier passed as a final argument, and the
test's own comment says it pins that deliberately as a not-proven read. I could
not construct a source-level write naming the binding that this scan skips.

### 6.3 The DV3-F2 fix, and it was genuinely one frame out (brief target 4)

Confirmed on both sides. On `origin/main` the call site is an ARGUMENT:

```
1149:  write_expect "${expect}" "$(main_expect_json)"
```

On the branch it is a guard that takes the status:

```
1280:  if ! main_expect="$(main_expect_json)"; then
```

and the inner `main_absent_json` call is guarded the same way at
`scripts/m2-exit-test.sh:271`. The round's claim that its first fix closed
nothing is correct: an explicit `exit 1` inside a function whose output is
consumed by a command substitution in argument position terminates the subshell,
and the parent sees an empty expansion with no status to act on. The five
substitutions the round's table walks are correctly classified, and the three
plain assignments do take the status under `set -e`. The gap in that derivation
is DV4-3 above, which is a gap in the DISCLOSURE and not in the fix.

### 6.4 The two unfixed SUBSET rows are genuinely pre-existing and genuinely out of scope (brief target 5)

FR4.5 item 4 discloses two rows it found and did not fix. Verified:

```
$ grep -n "a broken gate is never accepted as diff-scoped" test/m2-exit-test.test.ts
418:      (same line number on origin/main and on the branch)
$ grep -n "it must accept any nonzero self-test exit" test/m2-exit-test.test.ts
675:      (same line number on origin/main and on the branch)
$ diff <(sed -n '390,430p' MAIN) <(sed -n '390,430p' BRANCH)     # no output
$ diff <(sed -n '650,690p' MAIN) <(sed -n '650,690p' BRANCH)     # no output
```

Both regions are byte-identical between `origin/main` and 392f97f, and both sit
outside all three hunks the branch adds to that file (hunk heads at 1558, 1623
and 1701 in the three-dot diff). Pre-existing: yes. Out of scope: yes, on
substance rather than on convenience. Neither row touches the derived expected
set, the legs, the freeze or the re-derivation; the first is about a diff-scoped
gate reporting error and the second about the self-test guard's exit code, and
no line this round added reaches either path. The disclosure is accurate and the
decision not to widen them is right for this round.

### 6.5 The three new and changed tests run and pass at head

```
$ node --version
v26.6.0
$ node --test --test-name-pattern 'named by this suite|cannot prove is a read' test/m2-exit-test.test.ts
 [PASS] every source spread into the derived expected set is named by this suite, so a new leg cannot arrive unprobed (3.140119ms)
 [PASS] every occurrence of the derived expected set's binding that this suite cannot prove is a read is pinned, so an unrecognised operation reddens instead of passing (23.010407ms)
 [i] tests 2
 [i] pass 2
 [i] fail 0
 [i] skipped 0
$ node --test --test-name-pattern 'refused at RUN TIME' test/m2-exit-test.test.ts
 [PASS] a write that adds an id to the derived expected set is refused at RUN TIME, in spellings no list of names contains (770.352668ms)
 [i] tests 1
 [i] pass 1
 [i] fail 0
 [i] skipped 0
```

**TRANSLITERATION, DECLARED.** The two captures above are real runs and their
glyphs were replaced, per CLAUDE.md:144. U+2714 (heavy check mark) rendered as
`[PASS]`, 3 occurrences. U+2139 (information source) rendered as `[i]`, 8
occurrences. Nothing else in any captured output in this report was changed, and
every other capture here is pure ASCII exactly as emitted.

## 7. The complete suite sentence

Three axes named, per CLAUDE.md:743 and CLAUDE.md:782.

| toolchain | build state | invocation | tests | pass | fail | SKIPPED |
|---|---|---|---|---|---|---|
| node v26.6.0 | `dist/` built | `node --test test/m2-exit-test.test.ts` at head, unmutated | 18 | 18 | 0 | 0 |
| node v26.6.0 | `dist/` built | same file, harness carrying `if (out.length > 2) { out[1] = out[0]; }` | 18 | 18 | 0 | 0 |
| node v26.6.0 | `dist/` built | `node --test "test/**/*.test.ts"` (the command `npm test` runs), same mutation | 598 | 596 | 2 | 0 |

`npm ci` exit 0 and `npm run build` exit 0 in the head worktree, with a clean
`git status --short` afterwards apart from the mutation I introduced and then
reverted (`git status --short` empty again after restoring the file).

The third row's total, 598, matches the number the round reports for `npm test`
at this head, so the mutation adds and removes no test. **Its two failures are
NOT attributed to the mutation, and I say what settles that rather than averaging
it away:**

- `test/coverage-gate.test.ts:146` reported `'error' !== 'green'`. Re-run ALONE,
  same toolchain, same build state, WITH the same mutation still in place: 17
  tests, 17 pass, 0 fail, 0 skipped. Re-run alone with the mutation reverted:
  identical. A defect the mutation caused would not disappear when the file runs
  by itself, so this is a whole-suite-load effect, not a consequence of the
  injected line.
- `test/watcher.test.ts:269` reported "expected at least 4 beacon writes, saw 3".
  This is the flake the dispatch brief told me not to re-litigate; a separate
  agent was looping that test on this box for the whole session, which is exactly
  the load condition it is sensitive to. I did not attribute it and I did not
  investigate it.

I did NOT reproduce the round's bare `node --test` count of 600. Section 2's
findings rest on the first two rows, and the second row IS the finding: an
eighteen-test file that stays entirely green while the harness silently drops a
gate from every real bundle.

## 8. What MY derivation did NOT cover

1. **Two files, and mostly one function.** I attacked
   `scripts/m2-exit-test.sh`'s assertion program and the three tests in
   `test/m2-exit-test.test.ts` that guard it. I did not audit the rest of the
   408-line test delta, the other fifteen tests in that file, or
   `test/behaviors.json` beyond confirming it is a four-line change.
2. **I did not run the real harness end to end.** Every measurement here drives
   the extracted assertion program directly, exactly as the round's own probes
   do. A `--full` or `--local` run of `scripts/m2-exit-test.sh` is not exercised
   by me. In particular I did not check whether the surviving member of section 2
   would also survive the harness's own `--self-test`, and a reader should not
   take section 2 as covering that.
3. **I did not run the gate registry over the branch.** No `tiphys gates run`
   evidence for 392f97f is in this report. CI on the pull request is outside what
   I can see, and the round records that no `gates` run exists for any head of
   this branch.
4. **The injection sites are two.** Everything in section 2 is injected at
   `  return out;` and everything in section 3 after `const derivedIds = ...`. A
   write between the freeze and the leg-union check is injected by no member of
   mine, and neither is one between `const legContributed` and the `if` that
   consumes it; the round names the second of those as untested too, in FR4.5
   item 8.
5. **The prototype family has ONE witness**, which is why section 3 is explicitly
   not called a class.
6. **I did not re-litigate the `test/watcher.test.ts` flake**, per the brief, and
   another agent was looping that test on this box throughout. Every wall-clock
   duration quoted above was therefore measured under unknown contention and is
   not a timing result.
7. **I did not verify the round's bare `node --test` count of 600**, only the
   598 that `npm test`'s invocation produces (section 7).
8. **Severity is my judgement, not a measurement.** DV4-1 is MEDIUM because I
   have a plausible accidental edit for it and DV4-2 is LOW because I do not. The
   measurements are the exit codes and the outputs; a reader who disagrees with
   the weighting has everything needed to re-weight it.

## 9. The claim grep over this report

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/verification/harness-round4-delta.md
```

Every hit and what settles it:

- Hits inside quoted shipped messages ("a declared gate that produced no record
  is a gate that did not run", "never", "cannot") are captured output from the
  program under test and from the round's own comments. Altering them would be
  the fabrication the red-witness rule exists to prevent.
- "its own message string never appears in any of the four outputs" in section 2
  is a statement about a measurement whose probe column
  (`leg-union-check-fired=false`) is printed in the capture immediately above it.
- "the check passes and the program never asserts on B" in section 2 is settled
  by the same capture: `names-gate-that-did-not-run=false` on all four members,
  and the success line naming one gate twice and the other not at all.
- "the region the freeze cannot reach" in the verdict paragraph is the round's
  own framing and is settled by the four members of section 2, which write inside
  the closure and do NOT throw, against the two post-freeze writes of section 3,
  which do.
- "I could not construct a source-level write naming the binding that this scan
  skips" in section 6.2 is deliberately in that form rather than "no such write
  exists". I walked four shapes by hand and did not prove a universal.
- "reassigning `Array.prototype[Symbol.iterator]` is not something a maintenance
  edit does by accident" in section 3 is a judgement, is labelled as one in the
  same sentence, and the reason is given so it can be argued with.

**The grep's known hole, checked by eye.** The alternation carries `cannot be`
and no other `cannot X` form. I read every `cannot see`, `cannot reach`,
`cannot fire` and `cannot happen` in this document. Each is either a quotation of
a shipped comment or a statement of what an instrument does NOT cover, which is
the direction that cannot flatter the change.

## 10. Handover

- Verdict: VERIFIED WITH FINDINGS. One MEDIUM (DV4-1), three LOW.
- DV4-1 is a one-line fix and, unlike rounds 2 and 3, it does not call for a new
  instrument: the instrument is right and its comparison is not.
- DV4-3 is a text correction in a not-covered section.
- Nothing here needs the owner.
- This report is on branch `claude/verify-harness-round4`, cut from `origin/main`
  rather than from the branch under review, so landing it does not drag the
  subject onto `main`. It is NOT pushed.
