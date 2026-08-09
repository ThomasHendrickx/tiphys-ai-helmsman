# Independent delta verification: M3-P3 fix round 7

Head under verification: `986f58a` on `claude/m3-p3-assurance-modes`.
Prior head (round 6): `218fc12`. Merge base with `origin/main`: `3c60acb`.
Verifier: independent delta verifier, did not write the code.
Date: 2026-08-09.

Toolchain: `/tmp/claude-0/.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin`
first on PATH, `node --version` = v26.6.0, npm 11.18.0, confirmed in the shell
that runs each command.

Working tree: fresh detached worktree at `986f58a`.

## Status

COMPLETE. Verdict: **CHANGES REQUIRED. Do not merge `986f58a`.**
One HIGH, one MEDIUM, four LOW.

| id | severity | one line |
|---|---|---|
| V-1 | HIGH | round 7's widened `SKIPPABLE_PREFIX` backtracks EXPONENTIALLY; a 269-byte record takes 73 s in `quotableUnits` and 88 s through `tiphys validate`, where round 6 takes 24 ms |
| V-2 | MEDIUM | the CR-001 witness does not guard the mechanism it claims: a model bounded at THREE markers reproduces the exact CR-001 defect at depth four and the whole suite stays green; the test name and the registered behaviour description both claim "four markers" and the fixture's deepest member is three |
| V-3 | LOW | the second `dangerousStates` member of the CR-001 witness spec is near-vacuous: it reddens fourteen tests, thirteen of which predate this round |
| V-4 | LOW | the work history's sentence "no tracked markdown file in this repository carries a two-marker line" is false at this head; the work history itself now carries one |
| V-5 | LOW | CR-002 is only partly closed: eleven of the review's fourteen surviving mutants still survive. The round states this openly; it is measured here so the orchestrator rules on scope rather than inheriting it |
| V-6 | LOW | the `QUOTE_MARKER` extraction newly shares one regex OBJECT between `.exec` and `.replace`; it is correct only because the literal has no `g` flag, and adding `g` survives the whole suite |

The log below is the incremental beacon trail. Findings begin at "Findings".

## Log

- Worktree created at `986f58a`. Diff `218fc12..986f58a` is 3 commits,
  9 files, 1092 insertions, 12 deletions, matching the brief.

- Read on `origin/main`: CLAUDE.md, `arbitration-m3-p3-a2.md`,
  `clean-room-m3-p3-a2-correctness.md` (566 lines, findings read in full),
  `orchestrator-reproduction-cr-001.md`, `orchestrator-cr-001-fix-feasibility.md`,
  `DR-0022`. Work history deliberately NOT yet read.
- `npm ci` EXIT=0, `npm run build` EXIT=0, `git status --porcelain` 0 lines
  after build, node v26.6.0 in that shell.
- Round 7's `src/checks.ts` diff read hunk by hunk. Five hunks:
  (1) `NOT_QUOTABLE` docstring, (2) `QUOTE_MARKER` extracted +
  `SKIPPABLE_PREFIX` widened, (3) `startOffset` docstring, (4) two literal
  regexes replaced by `QUOTE_MARKER` in `startOffset` and `sourceSlice`,
  (5) two docstrings in `paragraphsBeneath` / `quotableUnits`.
  Only ONE hunk changes behaviour: the `SKIPPABLE_PREFIX` widening.
  `QUOTE_MARKER` has no `g`/`y` flag, so sharing one regex object across
  `.exec` and `.replace` carries no `lastIndex` state. Confirmed by reading.

- T-011 mechanical check: EVERY `dangerousStates.find` in all 19 witness specs
  under `witness/` (38 mutation states) resolves to EXACTLY ONE occurrence in
  `src/checks.ts` at `986f58a`. Zero non-unique. Command in the report body.
- Verifier's OWN 69-shape set, markup-free, scored against TWO structurally
  independent oracles (`commonmark` 0.31.2 AST inline text, and `markdown-it`
  14.1.0 token stream). Both oracles agree on 68; on those 68 the
  implementation matches 68/68. The one split (T6, `>\t>\t- x`) is a genuine
  tab-handling disagreement BETWEEN the two parsers; the implementation follows
  `commonmark`, which is the project's chosen parser.
  Shapes included that round 7 did not name: depths 7, 9, 10, 11 and 12;
  `- 1. - > - 1. - > -` (nine markers); mixed `*`/`+`/`-`; paren ordered
  markers; tabs mixed with spaces; quote-inside-list-inside-quote.

- **V-1 (HIGH) FOUND: the widened `SKIPPABLE_PREFIX` backtracks exponentially,
  and it is REACHABLE from `quotableUnits`.** Measured: `986f58a` takes
  **73,175 ms** on a 269-byte two-line document where `218fc12` takes 23.7 ms
  and returns the SAME unit. Regression introduced by this round. Details and
  reproduction in the findings section.
- DR-0022 acceptance criterion RE-DERIVED from `git archive 18c335a`
  (md5 `4f9ed9b66f6a7e1e04efdb2450c7da9e`, agreeing with the correctness
  reviewer's independent derivation): **20/20 byte-identical, 504 units**,
  probe EXIT=0. Round 7's claim CONFIRMED.
- md5 of `218fc12:src/checks.ts` = `0d3504eadfc894d85e06b9a81d2f0db6`. Round
  7's pin CONFIRMED.
- Diagonal CONFIRMED: each of the three new tests is red under exactly its own
  two witness members and green under the other four.
- Verifier's own 23-mutant campaign run. 12 SURVIVE, including
  `SKIPPABLE_PREFIX` bounded at THREE markers.

- V-1 escalated: the hang reaches the SHIPPED CLI.
  `node bin/tiphys.ts validate --type assurance-modes --context <dir> <doc>`
  over a context holding ONE 269-byte decision record: **88 seconds**, EXIT=1.
- 9-skip claim CONFIRMED: without `dist/`, 504 tests / 495 pass / 9 skipped /
  exit 0, five in `test/gates.test.ts` and four in `test/m2-exit-test.test.ts`,
  every skip reason naming `dist`. With `dist/` built: 504 / 504 / 0 skipped.
- `test/behaviors.json` strictly APPEND-ONLY by name against both the merge base
  (`3c60acb`, 477 -> 510, 0 removed, 0 descriptions changed) and round 6's head
  (507 -> 510, exactly the three new rows).
- Both ASCII checks with `-a` over 431 tracked paths minus the two exemptions:
  both grep EXIT=1, zero matches, and both greps demonstrated able to SEE a NUL
  fixture and a UTF-8 fixture respectively (exit 0 on those).
- Registry gates each with its own exit code: manifest-self-check 0,
  credential-scrub 0, agent-rules-drift 0, coverage 0, clause-map 0,
  red-witness 0; citations 21 not-applicable (pre-existing, diagnosed by the
  round). Scope re-derived by hand against the declaration at the merge base:
  40 changed paths, 0 outside the declaration plus the standing extras.
- Claim grep re-run independently: 13 hits inside the round-7 section, of which
  5 are substantive and all 5 are the ones the round lists and settles.
- A18 "oracle limit" claim CONFIRMED against a SECOND parser and against the
  OLD implementation.

---

# What this verification did NOT cover

**Read this first.** A search whose scope is wrong returns an empty result that
is indistinguishable from an absence of defects.

1. **CI.** Every measurement here is LOCAL, node v26.6.0 from the scratch
   prefix, in this container. I observed no GitHub Actions run: neither the
   `pull_request` arm nor the post-merge `push` arm on a new `main` head. T-009
   requires both separately and nothing local discharges either.
2. **The `scope` gate was not run by the runner at this head by me.** The gate
   derives its phase from `git branch --show-current`, and the branch
   `claude/m3-p3-assurance-modes` is already checked out in two other worktrees
   (`scratchpad/wt-m3p3`, which has nine uncommitted lines belonging to another
   agent, and `scratchpad/wt-m3p3-r7`), so I could not check it out a third
   time and I deliberately did not run anything inside someone else's tree. In
   a DETACHED worktree the gate reports `not-applicable`, exit 21, which is a
   measurement artifact and not a verdict. I re-derived the same property BY
   HAND instead (section "Scope, re-derived by hand"), which tests the changed
   paths against the declaration but does NOT exercise the gate's own code.
3. **Everything in the phase that is not `quotableUnits` and its check.**
   `src/modes.ts`, `src/commands/mode.ts`, the three schemas,
   `role-model-config.yaml`, `templates/charter.example.yaml` and the CLI wiring
   were read only where round 7's diff touches them. Round 7's diff touches none
   of them, which is why this scope is defensible, but a defect there would not
   have been found here.
4. **My mutation campaign is 23 mutants plus the 6 witness states, all inside
   `quotableUnits` and its helpers.** I did not mutate the nine pre-existing
   derived checks, `runChecks`, `resolveRecord`, or the CLI. I scored survivors
   against `test/assurance-modes.test.ts` (33 tests) and confirmed only ONE
   (V-N1, the finding V-2 rests on) against the full 504-test suite. The other
   eleven survivors are measured against the one file plus the round's own
   derivation that `quotableUnits` has exactly one shipped consumer
   (`src/checks.ts:1312`) and one test consumer.
5. **My shape set is 69 markup-free shapes plus one hand-written markup shape
   (A18).** It is not a fuzz. My oracles read INLINE TEXT, so by construction
   they cannot adjudicate anything that depends on markup preservation, which is
   the A-versus-A2 distinction DR-0022 settled. That is why the set is
   markup-free: any divergence is then a SLICING defect.
6. **The ReDoS reachability search is not exhaustive.** I proved the exponential
   arm is reachable and exhibited a concrete 269-byte document, but I did not
   characterise the full input class, did not find the shortest such document,
   and did not establish an upper bound on the running time as a function of
   document length. My scaling evidence is a family that doubles per marker; I
   stopped measuring it at eleven seconds.
7. **Supply chain and regression** are another lens by contract. I did not look
   at `package-lock.json`, `npm audit`, `commonmark`'s provenance, or
   `build:runtime-deps`. Round 7 changes none of them.
8. **Performance other than the regex.** I did not measure memory, nor
   `commonmark`'s own parse time on deep nesting, nor the per-record cache.
9. **Process.** I did not verify that round 7's beacon and dispatch discipline
   were followed during the round, only that the artifacts it cites exist and
   say what it says they say.
10. **I did not attempt to determine whether any consuming project's decision
    record triggers V-1.** In THIS repository no decision record does: all
    twenty extract in milliseconds and the instrumented probe records 517
    `SKIPPABLE_PREFIX` evaluations over them with ZERO rejections and a longest
    span of five characters.

---

# Findings

## V-1 (HIGH) The widened `SKIPPABLE_PREFIX` backtracks exponentially, and it is reachable from the shipped CLI

**File and line:** `src/checks.ts:960` at `986f58a`.

```
const SKIPPABLE_PREFIX = /^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)]|[-*+])[ \t]*))*[ \t]*$/;
```

**The mechanism, not the instance.** The outer group is starred, and BOTH the
leading `[ \t]*` of an iteration and the trailing `[ \t]*` inside two of its
three alternatives can consume the same run of spaces or tabs. Every whitespace
run between two markers is therefore an ambiguity the engine must try both ways,
and the choices multiply. On a subject that ultimately FAILS, the engine must
exhaust the whole product before it can report failure. The predicate round 7
replaced had no such nesting for list markers (it allowed at most one), so this
is a property the widening introduced.

This is the same shape as the widening's own safety argument, seen from the
other side. The docstring argues correctly that anchoring makes acceptance safe.
Anchoring says nothing about the cost of REJECTION, and rejection is exactly the
arm `startOffset` exists to take.

**Reproduction 1, the predicate alone.** Failing subjects of `"- "` repeated,
node v26.6.0. The old predicate is constant time on the same inputs.

```
$ node redos2.mjs
SINGLE space between markers, failing input:
   10 markers  len= 21  OLD 0.084 ms   NEW 0.54 ms
   15 markers  len= 31  OLD 0.038 ms   NEW 1.39 ms
   20 markers  len= 41  OLD 0.005 ms   NEW 43.80 ms
   25 markers  len= 51  OLD 0.007 ms   NEW 1432.46 ms
   28 markers  len= 57  OLD 0.006 ms   NEW 11355.80 ms
   30 markers  len= 61  OLD 0.007 ms   NEW 45539.94 ms
EXIT=124   (my own 110 s timeout, i.e. the last row did not finish twice)
```

A 61-character string. Three point two times slower per added marker.

**Reproduction 2, through `quotableUnits`, and this is the one that matters.**
The document below was NOT hand-built to fit the regex. It was found by a random
differential fuzz over 40,000 short documents (`redos-fuzz.mjs`, seed 20260809),
which reported one `SKIPPABLE_PREFIX` evaluation costing 12,333 ms. Re-running
the shipped code on that document directly:

```
$ node redos-repro.mjs
document: 269 bytes, 2 lines
quotableUnits(): 74.27 s   units=1
EXIT=3          (my probe's own "over one second" exit code)
```

The document, verbatim:

```
> 3) 1.   2. 2. 1.   * 3)   * 1. 1. > - 1. 1. 3) > 1. + - - 1. * 2. + [r36]: https://example.invalid/x
<TAB>* <TAB>  -   1.   > 3) *   3) + <TAB><TAB>+ * - <TAB>- 3) <TAB>+ - 3) <TAB>2. 2. * + 3) long long long long long long long long long long long long long long long long long long long long
```

(`<TAB>` is a literal tab. The file is written by `redos-repro.mjs` so no tab is
lost in transcription.)

Why it reaches the arm: line 1 is a link reference definition behind a long
container prefix, so the parser advances the paragraph's START LINE past it and
leaves the START COLUMN describing line 1 (the exact hazard `startOffset` was
built for). Line 2 is a lazy continuation whose leading TAB stops its own
markers from interrupting the paragraph, so it is continuation TEXT that merely
LOOKS like a container prefix. The offset from line 1 lands one character past
line 2's marker run, and the predicate must explore every way of splitting
twenty-four markers before it can fail.

**Reproduction 3, this is a REGRESSION and not a pre-existing hole.** Same
document, same process, both implementations imported side by side:

```
$ node redos-compare.mjs
218fc12 (round 6): 23.688 ms      units=1   ["* - 1. > 3) * 3) + + * - - 3) + - 3) 2. 2. * + 3) long long ..."]
986f58a (round 7): 73174.926 ms   units=1   ["* - 1. > 3) * 3) + + * - - 3) + - 3) 2. 2. * + 3) long long ..."]
EXIT=0
```

**Identical output, 3,090 times slower.** The unit is the same string, so no
test comparing units can ever see this.

**Reproduction 4, end to end through the SHIPPED CLI.** A context directory
holding the twenty real decision records plus ONE 269-byte extra record with the
content above, and `assurance-modes.yaml` with `full`'s `granted-by` pointed at
it:

```
$ time node bin/tiphys.ts validate --type assurance-modes --context /tmp/redosctx /tmp/redos-modes.yaml
INVALID #/modes/0/conditions/0 mode full cites DR-9999 for a condition that is not
a whole quoted item of that record: "a condition that will not resolve"
(check: mode-conditions-quote-granted-by)
tiphys validate EXIT=1   elapsed=88 s
```

**Eighty-eight seconds for one 269-byte record.** The growth is exponential in
the marker count and the marker count costs about four bytes each, so a record a
few dozen bytes longer does not return at all in any usable time.

**Why HIGH.** `src/checks.ts` is a KERNEL deliverable. `quotableUnits` runs over
decision records supplied by whichever project consumes the kernel, so its input
is not under the kernel's control. A gate that never returns is worse than a red
gate: it produces no verdict, no diagnostic, and no timeout, and in CI it burns
the job's whole budget. The kernel's own `gates` bundle would be the first
victim.

**Scaling, so the severity is not resting on one document.** A minimal family
(`redos-minimal.mjs`: a quote-nested link reference definition on line 1, a
tab-indented lazy continuation of `"* "` markers on line 2) at 4 bytes per added
marker:

```
m= 14 q= 15  doc= 140B   218fc12  0.220 ms   986f58a    0.9 ms
m= 15 q= 16  doc= 144B   218fc12  0.254 ms   986f58a    1.5 ms
m= 16 q= 17  doc= 148B   218fc12  0.333 ms   986f58a    3.0 ms
m= 17 q= 18  doc= 152B   218fc12  0.411 ms   986f58a    6.8 ms
m= 18 q= 19  doc= 156B   218fc12  0.530 ms   986f58a   11.4 ms
EXIT=0
```

Round 6 is flat. Round 7 doubles per marker.

**What this reproduction did NOT establish.** I did not find the shortest
triggering document, did not characterise the full class of triggering inputs,
and did not test whether `commonmark` itself has a nesting limit that bounds the
achievable marker count from a single line (my documents put the markers in
CONTINUATION text, where no such limit applies). I also did not test whether a
possessive or atomic rewrite fixes it, because proposing a fix is not this
report's job.

**What was CHECKED and is clean:** no real decision record reaches the slow arm.
Instrumented over all twenty records under `delivery/decisions/`, 517
`SKIPPABLE_PREFIX` evaluations, **zero rejections**, longest span five
characters, slowest 0.082 ms. So this is latent for THIS repository today and
live for any consumer.

## V-2 (MEDIUM) The CR-001 witness guards instances up to three markers, not the unboundedness it claims, and the behaviour description over-states its own coverage

**File and line:** `test/assurance-modes.test.ts:2565-2582` (the fixture),
`test/behaviors.json:509`, `witness/checks-multi-marker-lines-strip-every-marker.json:5`.

**The mechanism.** Round 7's own `SKIPPABLE_PREFIX` docstring states the
principle exactly right:

> REPETITION IS UNBOUNDED ON PURPOSE. A model allowing two markers would move
> the boundary to three and leave the same defect standing there, which is the
> shape this project keeps paying for.

The CODE honours that. The WITNESS does not. `MULTI_MARKER_RECORD`'s four
members carry two, two, three and two markers; its deepest member is THREE. A
model bounded at three is therefore indistinguishable from an unbounded one to
every test in the repository.

**Reproduction.** Mutant V-N1, a single bounded quantifier:

```
-const SKIPPABLE_PREFIX = /^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)]|[-*+])[ \t]*))*[ \t]*$/;
+const SKIPPABLE_PREFIX = /^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)]|[-*+])[ \t]*)){0,3}[ \t]*$/;
```

It is a REAL defect, not a cosmetic change: it restores CR-001 verbatim at depth
four and beyond, in both directions at once.

```
$ node -e '<import the mutated module and print units>'
  depth 3: ["alpha depth 3"]
  depth 4: ["- - - - alpha depth 4"]
  depth 5: ["- - - - - alpha depth 5"]
  depth 6: ["- - - - - - alpha depth 6"]
EXIT=0
```

And nothing notices:

```
V-N1  SKIPPABLE_PREFIX bounded at THREE markers  | exit=0 tests=33 pass=33 fail=0 skip=0  SURVIVES
```

(against `test/assurance-modes.test.ts`; the full-suite confirmation is recorded
in the "Full-suite confirmation" section below.)

The neighbouring control is what makes this a finding rather than a nitpick: the
SAME mutant bounded at TWO is killed.

```
V-N2  SKIPPABLE_PREFIX bounded at TWO markers    | exit=1 tests=33 pass=32 fail=1  killed
```

So the witness's discriminating power stops exactly one member past the
fixture's deepest member. That is a boundary, and it is the boundary the round's
own docstring says must not exist.

**And the description is not merely under-powered, it is FALSE.** The test name,
the `test/behaviors.json` row and the witness spec's `tests` entry all read:

> a line opening more than one block marker leaves no marker in the unit, at two,
> three and four markers and with a quote after a list marker

There is no four-marker member. The registry description is the thing a later
reader trusts, and CLAUDE.md's rule is that a work history is never softened for
exactly this reason. Counted from the fixture:

```
`- - ${MULTI_MARKER_TWO}`          2 markers
`- > ${MULTI_MARKER_QUOTE}`        2 markers
`- - - ${MULTI_MARKER_THREE}`      3 markers
`- 1. ${MULTI_MARKER_ORDERED}`     2 markers
`- ${MULTI_MARKER_CONTROL}`        1 marker  (the control)
```

**Why this is MEDIUM and not LOW.** CR-002 was raised because a fix could be
reverted in place while every gate stayed green. This is that finding, one level
in: the CR-001 fix can be reverted to a bounded model while every gate stays
green. Round 7 argues at length that it fixed the mechanism and not the
instances; the witness it took only proves the instances.

**What would clear it:** a member at depth four or more (round 7 measured
one, two, three, four, five, six and eight in its own probe, so the input
already exists outside the tree), and the description corrected to match
whatever the fixture actually carries.

## V-3 (LOW) The second `dangerousStates` member of the CR-001 witness spec is near-vacuous

**File and line:** `witness/checks-multi-marker-lines-strip-every-marker.json:16-21`.

Member `[1]` replaces the whole start-offset computation:

```
"find":    "const from = line === startLine ? startOffset(text, startColumn, quoteDepth) : 0;",
"replace": "const from = 0;"
```

Measured, it reddens FOURTEEN tests, thirteen of which existed before round 7:

```
checks-multi-marker-lines-strip-every-marker#1 | exit=1 tests=33 pass=19 fail=14 killed
   RED: the shipped assurance-modes.yaml and role-model-config.yaml validate ...
   RED: mode show prints full's twelve stage ids in order ...
   ... eleven more ...
   RED: a line opening more than one block marker leaves no marker in the unit ...
```

It is the review's M08, which the review already recorded as `killed` at
`218fc12`. A dangerous state that thirteen pre-existing tests already reject
demonstrates nothing about the behaviour this spec is registered against.
Member `[0]` (the old narrow regex) is the real witness and it is specific: it
reddens exactly one test.

This is not a false green and the spec is not wrong; it is one of the two
required members carrying no information. CLAUDE.md's "one witness is not a
class" asks for two STRUCTURALLY DIFFERENT members, and in practice this spec
has one.

## V-4 (LOW) A work-history sentence is false at this head

**File and line:** `delivery/work-history/m3-p3.md`, the DR-0022 section:

> which follows from the measured fact that no tracked markdown file in this
> repository carries a two-marker line.

Re-running the correctness reviewer's own sweep at `986f58a`:

```
$ git ls-files '*.md' | xargs grep -nP '^\s*(?:>\s?)*(?:[0-9]{1,9}[.)]|[-*+])\s+(?:[0-9]{1,9}[.)]|[-*+]|>)\s'
delivery/work-history/m3-p3.md:5726:- - Two list markers open on one line. | - > A quote opens after a list marker.
SWEEP GREP EXIT=0
```

The hit is round 7's own captured assertion output. Restricted to decision
records, which is what the criterion is actually about, the sweep is clean:

```
$ git ls-files 'delivery/decisions/*.md' | xargs grep -nP '<same pattern>'
(no output)   grep EXIT=1
```

So the SUBSTANCE holds and only the sentence is over-broad. Recorded because the
sentence is load-bearing for the DR-0022 argument and the next reader will
re-run the sweep and get a hit.

## V-5 (LOW) CR-002 is partly closed: eleven of fourteen surviving mutants still survive

Round 7 states this plainly under "What round 7 did NOT do", so it is not a
concealed gap. It is measured here so the orchestrator rules on scope rather
than inheriting a summary.

Reconstructing the review's twenty mutants independently (my own find/replace
strings, each verified to resolve to exactly one occurrence) and scoring against
`test/assurance-modes.test.ts` at `986f58a`:

```
R-M03  NOT_QUOTABLE emptied                                     | exit=0  SURVIVES
R-M06  startOffset fallback strips nothing                      | exit=0  SURVIVES
R-M07  sourceSlice ignores endColumn                            | exit=0  SURVIVES
R-M09  sourceSlice does not strip continuation quote markers    | exit=0  SURVIVES
R-M10  sourceSlice joins lines with no space                    | exit=0  SURVIVES
R-M11  quotableUnits splits on LF only (CRLF and lone CR break) | exit=0  SURVIVES
R-M12  collectUnits does not deepen quote depth                 | exit=0  SURVIVES
R-M13  paragraphsBeneath does not deepen quote depth            | exit=0  SURVIVES
R-M16  normalizeProse does not trim                             | exit=0  SURVIVES
R-M18  empty top-level unit is still added                      | exit=0  SURVIVES
R-M19  startOffset offset bound off by one                      | exit=0  SURVIVES
```

Eleven, exactly the eleven the round names. The three the arbitration asked for
(M01, M04, M20) are now all killed, which I verified directly and which is
recorded under "Verified and holding".

My own new mutants add four more unguarded regions:

```
V-N6   QUOTE_MARKER also eats a list marker (the fallback widened)  | exit=0  SURVIVES
V-N7   QUOTE_MARKER loses its START anchor                          | exit=0  SURVIVES
V-N8   QUOTE_MARKER made GLOBAL                                     | exit=0  SURVIVES
V-N10  startOffset applied to EVERY line, not only the first        | exit=0  SURVIVES
V-N11  line split drops the lone-CR alternative                     | exit=0  SURVIVES
V-N12  line split order swapped so CRLF becomes two lines           | exit=0  SURVIVES
```

V-N6 is worth naming separately: round 7's `startOffset` docstring says
explicitly "I did not find a way to force this arm with a marker-carrying line
... because no probe I could build reddens a wider strip here, widening it would
be code no witness could guard". My measurement AGREES with that statement. The
honest form is the round's own and I could not improve on it.

The mutants that ARE killed, as controls that my harness is not vacuous:

```
V-N2  SKIPPABLE_PREFIX bounded at TWO markers                | exit=1  killed (1 test)
V-N3  SKIPPABLE_PREFIX loses the ORDERED alternative         | exit=1  killed (14 tests)
V-N4  SKIPPABLE_PREFIX loses the BULLET alternative          | exit=1  killed (1 test)
V-N5  SKIPPABLE_PREFIX loses its END ANCHOR                  | exit=1  killed (1 test)
V-N9  startOffset never accepts the verification             | exit=1  killed (14 tests)
```

## V-6 (LOW) The `QUOTE_MARKER` extraction introduces a shared regex OBJECT

**File and line:** `src/checks.ts:926`, used at `src/checks.ts:1025` (`.exec`)
and `src/checks.ts:1048` (`.replace`).

Round 7 replaced two identical inline regex LITERALS with one shared CONSTANT.
That is the right de-duplication and I confirmed by reading that it is currently
correct: the literal carries no `g` or `y` flag, so neither `.exec` nor
`.replace` touches `lastIndex`, and one object can safely serve both.

The point is that this is now a PROPERTY OF THE FLAGS rather than a property of
the structure, and nothing tests it. Adding `g` is a one-character edit that
would make `.exec` stateful across calls and `.replace` global:

```
V-N8  QUOTE_MARKER made GLOBAL, so exec/replace share lastIndex | exit=0 tests=33 pass=33 SURVIVES
```

Recorded as LOW because the current code is correct and the round's own reason
for the extraction (one grammar, one definition) is sound. It is a new
unguarded coupling that did not exist at `218fc12`, which is why it belongs in a
DELTA verification.

---

# Verified and holding: what I attacked and could not break

## 1. The CR-002 diagonal is real, and the M04 case is closed

Each of the three new tests measured under each of the six witness mutations,
each with its own exit code, restored by `cp` from a pristine copy after every
arm (`md5sum` printed `21efa427ac503380f282addb5ee2362f` at the end of every
run), node v26.6.0:

```
                                                multi-marker  start-column  emptied
checks-emptied-paragraph-contributes-no-unit#0  green         green         RED
checks-emptied-paragraph-contributes-no-unit#1  green         green         RED
checks-multi-marker-lines-strip-every-marker#0  RED           green         green
checks-multi-marker-lines-strip-every-marker#1  RED           green         green
checks-start-column-verified-not-trusted#0      green         RED           green
checks-start-column-verified-not-trusted#1      green         RED           green
```

**A DIAGONAL, not a smear.** Each test is red under exactly its own two members
and green under the other four. Round 7's central claim is CONFIRMED
independently.

The single most important cell, checked first as the brief required:
`checks-start-column-verified-not-trusted` member `[0]` IS the review's M04
(`if (offset <= text.length && SKIPPABLE_PREFIX.test(...))` becomes
`if (offset <= text.length)`), which the correctness review measured as
SURVIVING a fully green 501-test suite. It now reddens:

```
checks-start-column-verified-not-trusted#0 | exit=1 tests=33 pass=32 fail=1 killed
   RED: the parser start column is verified rather than trusted, so a paragraph
        advanced past a link reference definition is not truncated, in the quote
        form and in the list form
```

M20 (member `[1]`, `SKIPPABLE_PREFIX` becomes `/^[\s\S]*$/`) and M01 (member
`[0]` of the emptied-paragraph spec, `carriesProse` becomes `return true`) also
now redden. All three of the mutants the arbitration named are closed.

## 2. T-011: every witness `find` still resolves to exactly one occurrence

The mechanical half, over ALL 19 witness specs under `witness/` and all 38
mutation states, against `src/checks.ts` at `986f58a`:

```
$ node -e '<split the pristine source on each dangerousStates.find and count>'
checks-addressed-by-ambiguity.json [0] ... UNIQUE
... (38 rows, every one UNIQUE) ...
total mutation states: 38   non-unique finds: 0
EXIT=0
```

The SEMANTIC half, which no gate performs, for the five specs round 7 touched:

- `checks-multi-marker-lines-strip-every-marker` `[0]` restores the OLD narrow
  predicate byte for byte. I compared it against `git show 218fc12:src/checks.ts`
  and it is the exact prior text. Meaning intact.
- `checks-start-column-verified-not-trusted` `[0]` is exactly the pre-fix
  conditional; `[1]` is a predicate that accepts everything. Both mean what the
  round says.
- `checks-emptied-paragraph-contributes-no-unit` `[0]` and `[1]` hit the two
  DIFFERENT walkers (`carriesProse` itself, and the `paragraphsBeneath` call
  site). Two structurally different members, as the rule asks.
- The two pre-existing specs round 7 MODIFIED were re-run in full. All four
  members still redden their own test and only their own test:

```
checks-code-block-content-not-quotable#0 | exit=1 pass=32 fail=1 killed
   RED: code block content in the cited record is not a quotable unit, in the fenced form and in the indented form
checks-code-block-content-not-quotable#1 | exit=1 pass=32 fail=1 killed
   RED: code block content in the cited record is not a quotable unit, in the fenced form and in the indented form
checks-heading-forms-not-quotable#0      | exit=1 pass=32 fail=1 killed
   RED: heading text in the cited record is not a quotable unit, for an indented ATX heading and for a setext heading
checks-heading-forms-not-quotable#1      | exit=1 pass=32 fail=1 killed
   RED: heading text in the cited record is not a quotable unit, for an indented ATX heading and for a setext heading
harness EXIT=0
```

Round 7's CR-003 correction of the reviewer (member `[0]` was ALREADY distinct;
it was member `[1]` that was byte-identical) is CONFIRMED by reading the two
files at `218fc12`, and member `[1]` is now type-specific in each.

## 3. CR-001 is closed BEHAVIOURALLY, against two independent oracles

My own 69-shape set, markup-free by construction, scored against `commonmark`
0.31.2's AST inline text AND `markdown-it` 14.1.0's token stream, two
structurally independent parsers:

```
$ node run-shapes.mjs
shapes: 69
both oracles agree on: 68   (oracles split on 1)
implementation matches the agreed oracle: 68/68
EXIT=0
```

The set deliberately includes shapes round 7 did NOT name: marker depths 7, 9,
10, 11 and 12 (round 7 claims 1-6 and 8); `- 1. - > - 1. - > -` at nine markers;
`> - > - > -`; mixed `*`, `+` and `-` in one prefix; paren ordered markers
(`1) 2)`); a nine-digit ordered marker nested in another; tabs mixed with spaces
at three levels; quote-inside-list-inside-quote and
ordered-inside-bullet-inside-ordered in both the one-line and the real-nesting
forms; markers with no content; and continuation lines under multi-marker
openers.

The single oracle split is `>\t>\t- epsilon qqb`, where `commonmark` yields
`["epsilon qqb"]` and `markdown-it` yields `["- epsilon qqb"]`. That is a
genuine tab-expansion disagreement BETWEEN THE TWO PARSERS. The implementation
follows `commonmark`, which is the parser DR-0022 chose, so this is not
adjudicable against the implementation and is reported rather than scored.

(An earlier run of the same set showed four further splits at depths 10-12;
those were `markdown-it`'s default `maxNesting: 20` refusing the document, not a
disagreement. Raising it to 200 removed all four. Recorded so nobody re-derives
a false finding from the default.)

## 4. The column-is-lying guard still WORKS after the widening

The four spans the guard exists to reject are still rejected, and I checked this
through behaviour rather than through the predicate. Shapes H1-H6 of my set (a
link reference definition then prose, in the quote form, the list form, two
stacked definitions, inside a nested quote, and the two emptied-paragraph forms)
all match the agreed oracle at `986f58a`. Concretely, the truncations
`"silon eta..."` and `"mbda mu..."` do not appear in any unit set, and the
guard's own regression test (`checks-start-column-verified-not-trusted`) reddens
under both of its mutations. Widening did not weaken the guard's CORRECTNESS.
It weakened its COST, which is V-1.

## 5. The owner's DR-0022 acceptance criterion, re-derived from git

The old implementation was taken from `git archive`, NOT from any copy the round
staged:

```
$ git archive 18c335a src | tar -x -C <scratch>
$ md5sum <scratch>/src/checks.ts
4f9ed9b66f6a7e1e04efdb2450c7da9e     (identical to the value the correctness
                                      reviewer independently derived)
$ node records.mjs
  IDENTICAL  DR-0001-license.md  15 units
  IDENTICAL  DR-0002-node-floor.md  15 units
  ... (all twenty) ...
  IDENTICAL  DR-0022-quotable-units-after-five-rounds.md  47 units
records: 20
byte-identical unit sets: 20/20
total units (new implementation): 504
EXIT=0
```

**20/20 and 504 units, exactly what round 7 reports.** The pinned md5 for the
shipped round-6 file is also confirmed:

```
$ git show 218fc12:src/checks.ts | md5sum
0d3504eadfc894d85e06b9a81d2f0db6
$ git show 986f58a:src/checks.ts | md5sum
21efa427ac503380f282addb5ee2362f
```

## 6. The A18 "oracle limit" claim is TRUE, and I checked it rather than accepted it

Round 7 reports "adversarial 19/20, the one remaining divergence is an ORACLE
limit, not an implementation defect". Adjudicated against a SECOND parser and
against the OLD implementation, which the round did not do:

```
source            : "- \\- escaped dash text\n"
implementation    : ["\\- escaped dash text"]
commonmark inline : ["- escaped dash text"]
markdown-it inline: ["- escaped dash text"]
commonmark HTML   : <ul>\n<li>- escaped dash text</li>\n</ul>
OLD (pre-A2) impl : ["\\- escaped dash text"]
EXIT=0
```

Both inline-text oracles unescape; the implementation keeps the source bytes;
**and so does the pre-A2 implementation**, which is decisive, because the
owner's criterion is byte-identity WITH THAT. An implementation that agreed with
the inline oracle here would FAIL DR-0022. The claim is correct.

## 7. The nine-skip open question is settled exactly as round 7 says

Same head, same command, node v26.6.0, two worktrees differing only in whether
`npm run build` ran:

```
with dist/ built :  tests 504   pass 504   fail 0   skipped 0   EXIT=0
without dist/    :  tests 504   pass 495   fail 0   skipped 9   EXIT=0
```

All nine skip reasons name `dist`, five in `test/gates.test.ts` and four in
`test/m2-exit-test.test.ts`, verbatim:

```
- the compiled entry resolves its schema documents and behaves identically to the source entry
- npm pack output contains both schema documents
- the workflow's gate bundle step runs the gate runner and is able to fail
- a throw escaping the runner is error with a summary, never the red exit code
- a run releases only the claim it holds, and writes nothing after releasing
      # dist/ is absent; run npm run build first (CI builds before it tests)
- --self-test rejects a vacuous-green fixture and a required-not-applicable fixture, naming each, and exits nonzero
- the assertion code accepts a diff-scoped gate that is not-applicable with an evaluated precondition, and rejects one without (DR-0018)
- the PR bundle requires scope green: the harness assertion code rejects a scope not-applicable and accepts a scope green
- the PR bundle accepts a scope not-applicable on a non-phase run and resolves scope differently for phase vs non-phase runs (M2R-026)
      # dist entry <root>/dist/bin/tiphys.js is absent; build with npm run build before this test
```

**The complete sentence for this head is: 504 tests, 504 pass, 0 fail, 0
skipped, exit 0, node v26.6.0, `dist/` built.**

## 8. `test/behaviors.json` is strictly append-only, asserted BY NAME

```
vs merge base 3c60acb: keys 477 -> 510
  REMOVED by name: 0 []
  DESCRIPTION CHANGED: 0 []
  ADDED: 33
vs round 6 head 218fc12: keys 507 -> 510
  REMOVED by name: 0 []
  DESCRIPTION CHANGED: 0 []
  ADDED: 3
    + mode-conditions-multi-marker-lines-strip-every-marker
    + mode-conditions-start-column-verified-not-trusted
    + mode-conditions-emptied-paragraph-contributes-no-unit
```

No count is pinned anywhere in this check.

## 9. Both ASCII checks, with a red witness for the checks themselves

Over `git ls-files` at `986f58a` minus the two path exemptions
(`delivery/intake/orchestrated-delivery-process.md`,
`test/fixtures/json-schema-test-suite/`), 431 paths. Each exit code is the
GREP's, read from `$?` immediately after a redirect, never a pipeline's:

```
$ grep -raP '[^\x00-\x7F]' $(cat paths.txt) > out          NON-ASCII grep EXIT=1   0 matches
$ grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' $(cat paths.txt) > out
                                                           CONTROL grep EXIT=1     0 matches
```

And, because CLAUDE.md's own tuition T-010 is that a green check can be blind, I
demonstrated both greps CAN see what they are for:

```
$ printf 'hello\x00world\n' > /tmp/nul.bin
$ grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' /tmp/nul.bin     EXIT=0   (sees NUL)
$ printf 'caf\xc3\xa9\n' > /tmp/utf8.bin
$ grep -raP '[^\x00-\x7F]' /tmp/utf8.bin                    EXIT=0   (sees non-ASCII)
```

Per-file over the nine paths round 7 touched, both patterns together: 0, 0, 0,
0, 0, 0, 0, 0, 0. And `git diff --stat 218fc12 986f58a` reports no file as
`Bin`.

## 10. Gates, each with its own exit code

Node v26.6.0 in the shell that ran each one, `--evidence` to a scratch dir,
`--base $(git merge-base HEAD origin/main)` = `3c60acb`, `--head HEAD`:

```
npm ci                                                      EXIT=0
npm run build                                               EXIT=0  (git status --porcelain 0 lines after)
npm test                                                    EXIT=0  504 tests, 504 pass, 0 fail, 0 skipped
tiphys gates run --registry --only manifest-self-check      EXIT=0  green
tiphys gates run --registry --only credential-scrub         EXIT=0  green
tiphys gates run --registry --only agent-rules-drift        EXIT=0  green
tiphys gates run --registry --only coverage                 EXIT=0  green
tiphys gates run --registry --only clause-map               EXIT=0  green
tiphys gates run --registry --only red-witness              EXIT=0  green
tiphys gates run --registry --only citations                EXIT=21 not-applicable
tiphys gates run --registry --only scope                    EXIT=21 not-applicable (DETACHED worktree; artifact, see below)
```

`citations` reporting not-applicable is PRE-EXISTING and round 7 diagnoses it
correctly; I did not re-derive that diagnosis.

## 11. Scope, re-derived by hand because the gate could not be run at this head

The gate needs the branch checked out and it is already checked out twice
elsewhere. I re-derived the property directly instead, reading the declaration
from the MERGE BASE exactly as the gate does:

```
$ git show 3c60acb:delivery/plan/phase-declarations/m3-p3.json
branch field: claude/m3-p3-assurance-modes      (equals the branch under review)
files-to-touch entries: 18
$ git diff --name-only 3c60acb 986f58a | wc -l
40
changed paths: 40   not covered by the declaration or the standing extras: 0
```

Round 7's nine changed paths, individually:

```
in-scope  delivery/work-history/m3-p3.md      (standing pre-authorized extra)
in-scope  src/checks.ts
in-scope  test/assurance-modes.test.ts
in-scope  test/behaviors.json                 (standing pre-authorized extra)
in-scope  witness/checks-code-block-content-not-quotable.json
in-scope  witness/checks-emptied-paragraph-contributes-no-unit.json
in-scope  witness/checks-heading-forms-not-quotable.json
in-scope  witness/checks-multi-marker-lines-strip-every-marker.json
in-scope  witness/checks-start-column-verified-not-trusted.json
```

`witness/` is a declared directory prefix. Nothing is outside scope. This tests
the PROPERTY and not the GATE; see non-coverage item 2.

## 12. The fix-round contract, checked in the order CLAUDE.md requires

**Item 3 FIRST, the non-coverage statement.** Round 7's is present, specific,
and unusually good. It names four exclusions for the CR-001 derivation (package
consumers, a differently-named slicer, `delivery/**`, the unwidened recovery
strips), a separate list for the witness work (eleven un-witnessed survivors by
id, the nine unmutated checks, the `repeats: 2` choice), and a five-item "What
round 7 did NOT do". I checked the two that could be checked mechanically: the
eleven named survivors ARE exactly the eleven I measure surviving, and the claim
that no other module reads `sourcepos` holds
(`git grep -n sourcepos -- src bin scripts test` returns `src/checks.ts` only).

**Item 1, the mechanism rather than the finding.** Stated as "ONE grammar,
THREE models of it, and the guard decides between 'the column is lying' and
'the prefix is richer than my model' using the model that is incomplete."
That is a mechanism, and it is the right one.

**Item 2, the derivation with its full output.** Three greps are published with
their output and their exit codes. I re-ran the third at `986f58a` and it now
returns TWO regexes rather than three (`QUOTE_MARKER` and `SKIPPABLE_PREFIX`),
which is the change the round claims.

**The claim grep**, re-run independently over the whole file:

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/m3-p3.md
```

86 hits file-wide, 13 inside the round-7 section (which starts at line 5588). Of
those 13, five are substantive claims and eight are the round's own quoting of
them plus the substring `whenever`. The five substantive ones are EXACTLY the
five the round lists, and each carries an adjacent captured command. **The
round's claim-grep accounting is accurate and complete**, which I did not expect
to be able to say.

The round also volunteers the one sentence the grep does NOT catch, in the
correct form: "I did not find a way to force `startOffset`'s recovery arm with a
marker-carrying line." My own V-N6 measurement agrees with it.

---

# Full-suite confirmation for V-2

V-2 rests on a mutant surviving, and CR-002's whole lesson is that a mutant
measured against ONE FILE is not measured against the suite. So V-N1 was run
against the whole suite in an ISOLATED worktree, with `npm run build` first so
no test could be skipped for want of `dist/`:

```
$ md5sum src/checks.ts                         # before
21efa427ac503380f282addb5ee2362f
$ <apply V-N1: {0,3} instead of *>
$ md5sum src/checks.ts
9647507a2eb825e5a85da4df3663cf59
$ npm run build                                 EXIT=0
$ npm test                                      FULL SUITE EXIT=0
i tests 504
i pass 504
i fail 0
i skipped 0
$ cp checks.PRISTINE src/checks.ts && md5sum src/checks.ts     # restored by cp
21efa427ac503380f282addb5ee2362f
```

**504 of 504 pass with CR-001 restored at depth four.** This is the same
sentence the correctness review wrote about M04 one round ago, with a different
mutant.

A process note, recorded because it nearly produced a false measurement: an
earlier attempt ran this suite and a witness-spec harness CONCURRENTLY IN THE
SAME WORKTREE, so both were writing `src/checks.ts`. That run was detected by an
unexpected md5, killed, and DISCARDED; the numbers above come from a rerun in a
worktree with nothing else in it. No result in this report comes from the
contaminated run.

---

# Verdict

**CHANGES REQUIRED. `986f58a` must not be merged.** Under DR-0012 condition 2 a
single unresolved medium blocks merge, and this head carries a HIGH.

## Was this the sixth consecutive round to produce a new defect?

**Yes, and it is a REGRESSION rather than an old hole newly seen.** That
distinction was the one the arbitration made in round 6's favour, and it does
not hold here. V-1 is not pre-existing: the exact same document, the exact same
process, gives 23.7 ms at `218fc12` and 73,175 ms at `986f58a`, with an
IDENTICAL unit set. The defect is in the one line this round changed for
behaviour, and it is a consequence of the specific rewrite chosen rather than of
the direction taken. A widening that is not ambiguous on whitespace would close
CR-001 identically and not have this property.

## Per finding

**CR-001: CLOSED as a correctness matter, RE-OPENED as a cost matter in the same
line.** The marker-leak class really is gone, and I established that
independently and more widely than the round did: 68 of 68 shapes matching where
two structurally independent parsers agree, including depths and interleavings
the round never tried, and the column-is-lying guard still rejecting every span
it exists for. The round's own docstring gets the mechanism right and its
anchoring argument is sound as far as it goes. What the argument does not cover
is that anchoring bounds what may be ACCEPTED and says nothing about the cost of
REJECTING, and rejecting is the arm the guard exists to take. That gap is V-1.

**CR-002: PARTLY CLOSED, and the part left open is the part CR-002 was about.**
The three witnesses the arbitration named are genuine: they are diagonal, they
are red against the shipped `218fc12` where they should be, and M04, M20 and M01
are all now killed. That is real work and it is verified. But the CR-001 witness
does not guard the CR-001 mechanism, only its instances up to depth three
(V-2), which reproduces the finding's own shape one level up: a fix that can be
reverted in place while every gate stays green. Eleven of the review's fourteen
survivors also remain (V-5), which the round declares honestly and which is a
scope question for the orchestrator rather than a concealment.

**CR-003: CLOSED.** The docstrings no longer claim `NOT_QUOTABLE` performs the
exclusion; the structural reason (AST leaves) is stated with its measurement;
the set is kept as declared intent per the arbitration; and the two witness
specs' second members are now type-specific, with all four members re-measured
reddening their own test and only their own test. The round also CORRECTED the
reviewer on a point of fact (member `[0]` was already distinct, member `[1]` was
the byte-identical one) and the correction is right.

## What the round did well, since a verification that lists only breakage is not a measurement

The DR-0022 criterion re-derived from git holds at 20/20 and 504 units. The
pinned md5s are correct. The claim-grep accounting is accurate and complete,
which I have not previously been able to say about a work history here. The
nine-skip open question is settled exactly as claimed and for the reason
claimed. The A18 "oracle limit" claim survives adjudication against a second
parser AND against the pre-A2 implementation, which is a stronger test than the
round applied to itself. The non-coverage statement is specific enough to check,
and the two items I could check mechanically both held. `test/behaviors.json` is
append-only. Every gate that can run at this head is green with its own exit
code. Nothing in the diff is out of declared scope.

## What would clear this head

1. V-1: an unambiguous formulation of `SKIPPABLE_PREFIX` (the ambiguity is the
   whitespace shared between an iteration's leading `[ \t]*` and the trailing
   `[ \t]*` inside its alternatives), or a non-backtracking scan. Whatever
   replaces it needs a witness that is a TIME bound, because the unit sets are
   identical either way and no equality assertion can ever see this.
2. V-2: a fixture member at depth four or more, and the behaviour description
   corrected to match the fixture.
3. V-3, V-4, V-6: one distinct dangerous state, one sentence, and a decision on
   whether the shared regex object wants a guard.

