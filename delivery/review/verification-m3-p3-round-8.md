# Independent delta verification: M3-P3 fix round 8

- head under verification: `108eed04e57991717dce8695b1c11ea505efda62` on
  `claude/m3-p3-assurance-modes`
- prior head (round 7): `986f58a`
- merge base with `origin/main`: `3c60acbee541711aca2b046269aa35a03f22bb8e`
- verifier: independent delta verifier, did not write this code
- date: 2026-08-10
- toolchain:
  `scratchpad/toolchain/node-v26.6.0-linux-x64/bin` FIRST on PATH,
  `node --version` = v26.6.0, `npm --version` = 11.18.0, confirmed in the shell
  that ran each command below. Worktrees `wt-head`, `wt-mut` at the head,
  `wt-r7` at `986f58a`, all fresh and verified pristine before any measurement.

> TRANSLITERATION NOTE, so no reader mistakes this for altered evidence. Node's
> test reporter prints U+2714 and U+2716 at the head of its result lines and
> U+2139 on its summary lines. This repository is ASCII-only by binding
> convention, so every captured line below renders them as nothing, `x` and `i`
> respectively. Nothing else in any captured output was changed. Both ASCII
> checks were run over this file with `-a` before it was committed:
> `NONASCII_EXIT=1`, `CONTROL_EXIT=1`.

## Verdict

**Round 8 does what it says on V-1 through V-6. Every one of the five findings
it was dispatched for is closed, and I confirmed each independently rather than
from the work history.** The HIGH is closed on the cost axis by five separate
measurements including one through the shipped CLI, the language is unchanged
under my own exhaustive enumeration, and the new `for (;;)` terminates under
every degenerate input I could build.

**No new defect was found in the shipped code.** That sentence is the first
time this phase can carry it, and it is qualified by what I did not reach,
below.

Four findings, none of them in `src/`:

| id | severity | one line |
|---|---|---|
| W-1 | MEDIUM | the work history states that "a disambiguated pattern was considered and REJECTED WITH A MEASUREMENT"; the pattern it measured is NOT disambiguated, a genuinely unambiguous one is language-equivalent and runs 22,700x faster, and the arbitration's mechanism statement that round 8 calls incomplete is in fact correct and complete |
| W-2 | LOW | `witness/checks-start-column-verified-not-trusted.json`'s two dangerous states are two spellings of ONE shape and redden the IDENTICAL two tests suite-wide; rule (g) passes only because their `find` strings differ. Pre-existing in shape at `986f58a`, rewritten but not separated by round 8 |
| W-3 | LOW | the CR-001 witness's discriminating power still stops one step past the fixture's deepest member: a `{0,5}` and a `{0,6}` bound both survive. The boundary moved from three to five; it was not removed, and the production docstring's "REPETITION IS UNBOUNDED ON PURPOSE" is still unwitnessed |
| W-4 | LOW | the "about 1,400 times above the honest cost" figure does not follow from its own adjacent capture ("3.8 ms for both shapes" gives about 263x). The CONCLUSION is confirmed by my own load testing; only the arithmetic is loose |

W-1 is a defect in the round's DERIVATION, not in its code. It changed no
outcome: the implementer adopted the orchestrator's recommendation anyway. The
remedy is a text correction that cannot introduce a code defect. If the
orchestrator judges DR-0012 condition 2 too blunt for that, the argument for
downgrading it to LOW is stated in W-1 itself; I have not applied that judgment
here because softening a finding is not mine to do.

## What this verification did NOT cover

**Read this first. A search whose scope is wrong returns an empty result that is
indistinguishable from an absence of defects.**

1. **CI, both arms.** Every number here is LOCAL, node v26.6.0 from the scratch
   prefix, in this container. I observed no GitHub Actions run: neither the
   `pull_request` arm nor the post-merge `push` arm on a new `main` head. T-009
   requires both separately and nothing here discharges either.
2. **The `scope` gate was not RUN by the runner at this head.** The gate derives
   its phase from the branch name and requires the declaration's own `branch`
   field to equal the current branch; `claude/m3-p3-assurance-modes` is checked
   out in the implementer's worktree, and I did not run anything inside another
   agent's tree. In my bundle the gate therefore reports
   `not-applicable ... branch verify-tmp-r8 does not match ^(?:claud...`, which
   is a measurement artifact and not a verdict. I re-derived the property BY
   HAND instead (41 changed paths against the declaration at the merge base,
   0 outside it plus the standing extras), which tests the property but does NOT
   exercise the gate's own code.
3. **Everything in the phase that is not `quotableUnits` and its helpers.**
   `src/modes.ts`, `src/commands/mode.ts`, the schemas, `role-model-config.yaml`
   and the CLI wiring were read only where the round-8 diff touches them, which
   is nowhere.
4. **The eleven accepted survivors** (M03, M06, M07, M09, M10, M11, M12, M13,
   M16, M18, M19). Decided out of scope by the arbitration. I did not re-measure
   them and make no claim about them. One paragraph on that decision is at the
   very end, clearly labelled, and it does not colour this verdict.
5. **My mutation campaign is small.** Six bound mutants, three loop-bound
   mutants, and the six declared dangerous states of the three touched witness
   specs. I did not run a broad mutation campaign over `quotableUnits`; round
   7's verifier did, and the eleven survivors it found are item 4.
6. **`commonmark`'s own cost** on pathological input, except for the two probes
   in "a pre-existing crash" below. A document expensive to PARSE would not be
   caught by anything here.
7. **Engines other than V8.** "The old pattern was catastrophic" and "the scan
   is flat" are both V8 measurements on one machine.
8. **The `citations` gate's own logic.** I confirmed its exit code is 21 at both
   heads and read its detail; I did not test whether its precondition is the
   right one.

## 1. V-1 (HIGH): closed, on the axis where it lived

### 1a. The cost, measured five ways, on documents I built

**Predicate-level growth curve, near-miss span `"\t" + "* " * n + "t"`**, the
shape that fails at its very last character:

```
n      round-7 pattern   round-8 witness[1]   unambiguous pattern   round-8 scan
 8         0.187 ms           0.120 ms             0.060 ms            0.124 ms
14         1.083 ms           1.083 ms             0.003 ms            0.011 ms
20        43.830 ms          46.827 ms             0.008 ms            0.081 ms
24       693.863 ms         755.729 ms             0.008 ms            0.011 ms
28    11,206.018 ms      12,094.850 ms             0.080 ms            0.086 ms
                                                                       EXIT=0
```

Round 7 doubles per marker. The scan is flat. Same result for the ORDERED
family, measured separately (`1. ` at n=20: round 7 50.5 ms, scan 0.015 ms).

**Through `quotableUnits`, on round 7's OWN fuzz-found document**, reconstructed
from `verification-m3-p3-round-7.md` and not from anything round 8 staged:

```
document: 268 bytes, 2 lines
round8 108eed0: 7.388 ms  units=1  "* - 1. > 3) * 3) + + * - - 3) + - 3) 2. 2. * + 3) long long long...
R8_ONLY_EXIT=0
```

The unit is the string round 7's verifier reported. That document cost 73,175 ms
at `986f58a`.

**End to end through the SHIPPED CLI, identical command and context at both
heads.** Context: the twenty real decision records plus one 268-byte extra
record carrying the pathological content, `full`'s `granted-by` pointed at it.

```
$ node bin/tiphys.ts validate --type assurance-modes --context /tmp/r8ctx /tmp/r8modes.yaml
  at 986f58a : real 1m14.694s   CLI_R7_EXIT=1
  at 108eed0 : real 0m0.582s    CLI_EXIT=1
```

Byte-identical diagnostics on both, including
`INVALID #/modes/0/conditions/0 mode full cites DR-9999 ... (check: mode-conditions-quote-granted-by)`.
**128 times faster, same output.**

**Differential fuzz over 1,200 documents I generated** (three seeds), biased at
near misses rather than well-formed documents, because a generator emitting only
well-formed documents is structurally blind to this class:

```
seed=1 docs=400 unit-set mismatches=0  worst round8 = 16.009 ms   EXIT=0
seed=2 docs=400 unit-set mismatches=0  worst round8 =  3.051 ms   EXIT=0
seed=3 docs=400 unit-set mismatches=0  worst round8 =  4.213 ms   EXIT=0
```

**Scaled far past the witness parameters**, near-miss shape at 28 to 3,584
markers (151 to 14,375 bytes): 0.5 ms to 20.3 ms, no super-linear region.

### 1b. The language is unchanged, enumerated by me

Alphabet of ELEVEN characters `[space tab > - * + . ) 0 7 x]`. That quotient is
sound and complete for BOTH implementations, because every character class in
play (`[ \t]`, `>`, `[-*+]`, `[0-9]`, `[.)]`, everything else) has a
representative and both implementations treat the classes identically, so the
enumeration covers the whole Unicode alphabet up to the length bound.

```
alphabet=11 maxlen=6 strings=1948717   R7!=scan:0   R7!=unambiguous:0
alphabet=11 maxlen=7 strings=21435888  R7!=scan:0   R7!=unambiguous:0
EXIT=0 on both
```

Those two counts are EXACTLY round 8's, which is independent corroboration that
we enumerated the same space.

**What length 7 cannot reach, and what I did about it.** The only place where
length matters beyond local structure is the nine-digit cap in
`[0-9]{1,9}[.)]`: a ten-digit run needs eleven characters. I probed that region
directly rather than inheriting round 8's forty boundary cases: digit runs of
length 1 to 14, three digit alphabets plus a mixed run, six following
delimiters, twelve surrounding contexts, plus every pair of adjacent 7-to-12
digit runs.

```
digit-region probes=3804 mismatches=0   EXIT=0
```

Round 8's forty boundary cases DO name that region explicitly
(`"1234567890."`, `"12345678901."`, `"0000000000."`, `"1234567890) "`,
`"> 1234567890. "`), so its disclosure is honest; my probe is 95 times wider and
agrees.

### 1c. Termination: proved by reading and by attack

The loop is safe because every iteration either advances `at` or returns. Read:
the only two `continue` branches are guarded by `quote > 0` and `list > 0`, so
each strictly increases `at`; the third branch always returns. `charCodeAt` past
the end is `NaN`, which compares false against every code, so both helpers
return 0 at or past end and the fall-through branch is taken.

Measured, not argued:

```
38 degenerate spans, each timed, hard timeout: empty, single space, single tab,
lone ">", ">>>", each bullet alone, "1.", "1)", "0123456789", 20,000-character
runs of "-", " ", "\t", ">", "> ", "1.", "* " + "x", "9", "9"+".", ".", ")",
an astral character, CR, LF, VT, FF, NUL, "x".
  every one RETURNS; worst 4.919 ms ("> " x 10,000)

helper invariants, 1,399,533 (string, position) pairs over ALL strings of
length <= 5 over the 11-character alphabet, at every position INCLUDING two
past the end:
  negative returns=0   NaN returns=0   nonzero-at-or-past-end=0
EXIT=0
```

I did not find a way to make either helper return 0 while the scan continues,
nor to make the index move backwards or become NaN. That is a statement about my
search; the reading above is what makes it more than that.

### 1d. CR-001 is still closed, at unbounded depth

Depths 1 to 30, six different marker interleavings each (bullet, star, plus,
quote, ordered-dot, ordered-paren rotated):

```
CR-001 sweep: depths 1..30 x 6 interleavings = 180 documents, failures=0
lying-span probes ("ep","re","alp","sil","x","prose"," a ","\t- x"):
  every one returns the FULL prose, none truncated
CR001_EXIT=0
```

### 1e. The time witness: red where it must be, green with room

**Red against both declared dangerous states, each individually**, restored by
`cp` from a pristine copy inside a trap with md5 compared after every restore
(T-013):

```
member[0] (round-7 pattern restored into the function)
  pristine md5 9697035ed2073c1ee165b5d1e0107cc5 (verified BEFORE the measurement)
  find-string occurrences in src/checks.ts: 1
  x a long near-miss block prefix ... (11182.165062ms)
  AssertionError: bullet run: rejecting a 151-byte near miss took 11158.7 ms,
    over the 1000 ms budget; the block-prefix test is backtracking rather than scanning
  restored md5 9697035ed2073c1ee165b5d1e0107cc5 -> restore VERIFIED equal to pristine
  MUTANT_TEST_EXIT=1

member[1] (flat alternation inlined at the decision point)
  x a long near-miss block prefix ... (12026.331482ms)
  restore VERIFIED equal to pristine
  MUTANT_TEST_EXIT=1
```

A FIRST attempt at this produced a FALSE RED: the worktree had no
`node_modules`, so both members failed with `ERR_MODULE_NOT_FOUND` on `yaml`
before any test ran. I installed dependencies, re-baselined the unmutated file
green, and re-ran. Recording that because a red for the wrong reason is
indistinguishable from a witness working.

**T-013 fired for real during this verification.** A `bound-6` run was killed by
my own outer 2-minute shell timeout, so the harness's `finally` never ran and the
mutant was left installed. The next three runs ABORTED with
`ABORT: tree is NOT pristine before the measurement. target=abdc06dc... pristine=9697035e...`
and produced no measurement. Restored by `cp` from the pristine copy, md5
compared, `git status --porcelain` back to zero lines. Every number in this
report was taken from a run that printed a verified-pristine md5 first.

**The bound is robust, and this is measured under load rather than argued.**

```
honest cost, IDLE, 20 samples each, exactly what the test times:
  bullet run  min 0.117  med 0.313  max  2.674 ms
  ordered run min 0.056  med 0.080  max  0.185 ms

under 16 busy node processes on 4 cores, load average 18.87 (4.7x
oversubscribed), 40 samples each:
  bullet run  min 0.076  med 0.181  max 17.163 ms
  ordered run min 0.041  med 0.051  max 11.152 ms
  the ACTUAL test, run three times under that load: PASSED 3/3
    (106.1 ms, 106.9 ms, 127.8 ms wall including cold module load)
```

Worst observed asserted cost under 4.7x oversubscription is 17.2 ms, which
leaves **58x** of headroom. To make the green arm flake you would need a runner
58 times slower than this container ALREADY 4.7 times oversubscribed. The red
arm is 11x the other way and grows with the marker count. **I could not make it
flake.**

**`deterministic: true` is the STRONGER declaration here, not a convenient
one.** `src/witness/run.ts:1477` reads `spec.deterministic ? rate.red ===
rate.total : rate.red > 0`, so `true` requires EVERY repetition red and `false`
would accept one. The mutant is 11x over the budget on both repetitions, so the
stronger form holds; declaring `false` would have been the weaker claim. All 54
witness specs in the repository declare `deterministic: true` and `repeats: 2`,
so the new spec is also consistent with the convention rather than special-cased.
Measured by the gate itself: `rate={"red":2,"total":2}` on both members.

**The two dangerous states are genuinely different, with one caveat.**
`member[0]` restores round 7's pattern (whose ambiguity involves the `>[ \t]?`
optional AND two branches' trailing `[ \t]*`) as a whole-function replacement;
`member[1]` inlines a DIFFERENT ambiguous pattern (no `[ \t]?`, uniform trailing
star) at the call site. Different text, different regexes, different ambiguity
sites. They are members of one class ("an ambiguous whitespace-separated marker
pattern") rather than two spellings of one instance, and `member[1]` is
specifically the pattern a reviewer would plausibly write as a simplification,
which is what makes it worth having. I accept this pair. See W-2 for the
neighbouring spec, where the same test does NOT pass.

## 2. V-2 (MEDIUM): closed, with a residual that is inherent

The fixture gained `- > 1. * > Five markers of four families on one line.`, and
the test name, the `test/behaviors.json` value and the witness spec's `tests`
entry all now read "at two, three and five markers". The claim matches the
fixture.

Bound mutants applied to the decision point, each against
`test/assurance-modes.test.ts` (34 tests), T-013 discipline throughout:

```
{0,2}  tests 34  pass 33  fail 1   KILLED   restore VERIFIED  MUTANT_TEST_EXIT=1
{0,3}  tests 34  pass 33  fail 1   KILLED   restore VERIFIED  MUTANT_TEST_EXIT=1
{0,4}  tests 34  pass 33  fail 1   KILLED   restore VERIFIED  MUTANT_TEST_EXIT=1
{0,5}  tests 34  pass 34  fail 0   SURVIVES restore VERIFIED  MUTANT_TEST_EXIT=0
{0,6}  tests 34  pass 34  fail 0   SURVIVES restore VERIFIED  MUTANT_TEST_EXIT=0
```

At `986f58a` the `{0,3}` mutant survived the whole suite; it is now killed, and
so is `{0,4}`, which is the boundary a "widen it by one" fix would land on. That
is exactly what the arbitration asked for and it is delivered.

A structurally different family of the same bound, bounding the SCAN's loop
rather than a regex, agrees:

```
loop bounded to 3 iterations   KILLED   MUTANT_TEST_EXIT=1
loop bounded to 4 iterations   KILLED   MUTANT_TEST_EXIT=1
loop bounded to 5 iterations   KILLED   MUTANT_TEST_EXIT=1
```

The residual is W-3.

## 3. V-3, V-4, V-6

**V-3 CLOSED.** `witness/checks-multi-marker-lines-strip-every-marker.json`
member `[1]` is now the `{0,3}` bound. Against the FULL suite, not one file:

```
label=multimarker-m1-bound3
  tests 505  pass 504  fail 1
  x a line opening more than one block marker leaves no marker in the unit,
    at two, three and five markers and with a quote after a list marker
  RESTORED md5 9697035ed2073c1ee165b5d1e0107cc5 (pristine 9697035ed2073c1ee165b5d1e0107cc5)
  SUITE_EXIT=1
```

**ONE test red, suite-wide, and it is the right one.** Round 7 measured the old
member at fourteen red, thirteen pre-existing. The two members of that spec are
also genuinely different: a wrong GRAMMAR (round 6's narrow model) against a
wrong BOUND on the right grammar.

**V-4 CLOSED**, and re-run by me rather than read:

```
$ grep -nP '^\s*(?:>\s?)*(?:[0-9]{1,9}[.)]|[-*+])\s+(?:[0-9]{1,9}[.)]|[-*+]|>)\s' $(git ls-files '*.md')
delivery/work-history/m3-p3.md:5726:- - Two list markers open on one line. | - > A quote opens after a list marker.
SWEEP_ALL_EXIT=0

$ (the same pattern, restricted to delivery/decisions/*.md)
SWEEP_DECISIONS_EXIT=1
```

Exactly the hits and exit codes the corrected passage claims, with the grep's own
status taken rather than a pipeline's. The correction is marked as a correction.

**V-6 CLOSED by removal, and the derivation is honest.** The arbitration offered
"add a witness or state why the risk is accepted"; round 8 took a third option
and said so. Verified:

```
$ git grep -n 'SKIPPABLE_PREFIX\|QUOTE_MARKER' -- . | grep -v '^delivery/'
GITGREP_EXIT=1        (1 = no match)
```

The `g`-flag mutation can no longer be written against this module. The
work history's V-6 prose is a model of the form this repository asks for:
"I DID NOT FIND A WAY to build a behavioural witness", the supporting fuzz number
attributed to round 7 rather than claimed, and the `.replace` argument labelled a
READING of the specification rather than a measurement.

## 4. The OWNER's DR-0022 criterion, re-derived

Old side from `git archive 986f58a`, never from any copy the round staged:

```
$ git archive 986f58a src | tar -x -C <scratch>      ARCHIVE_EXIT=0
$ md5sum <scratch>/src/checks.ts                     21efa427ac503380f282addb5ee2362f
$ git show 986f58a:src/checks.ts | md5sum            21efa427ac503380f282addb5ee2362f
$ node records.mjs <old> <new> <20 records from git archive 108eed0>
  IDENTICAL on all twenty, DR-0001 through DR-0022
  records: 20   byte-identical unit sets: 20/20   units in A: 504   units in B: 504
  RECORDS_EXIT=0
```

**20/20, 504 units on both sides.** That md5 is also the one round 7's verifier
and round 8 independently printed.

## 5. Gates, the registries and the ASCII checks

```
npm ci          EXIT=0
npm run build   EXIT=0    git status --porcelain after build: 0 lines
node --test     EXIT=0    507 tests, 507 pass, 0 fail, 0 SKIPPED (dist BUILT)
npm test        EXIT=0    505 tests, 505 pass, 0 fail, 0 SKIPPED (dist BUILT)
```

The 507/505 split is not a discrepancy: `npm test` is
`node --test "test/**/*.test.ts"` and bare `node --test` walks a wider default
set. The `suite` GATE reports 505 from 30 files, which is the authoritative
number and the one round 8 quotes.

Registry bundle at this head, `--mode full`, `--base 3c60acb --head 108eed0
--phase m3-p3`:

```
manifest-self-check    green            8 schema documents validated
coverage               green          115 inventory ids checked
credential-scrub       green            7 credential sources probed
suite                  green          505 tests reported (child node v26.6.0)
clause-map             green           18 rows checked
red-witness            green           35 witnesses evaluated (22 own, 13 stored,
                                       167,397 ms); "every witness red against
                                       every declared dangerous state and green at head"
agent-rules-drift      green           17 rendered gate rows compared
citations              not-applicable  no changed path under the configured documents globs
credential-token       not-applicable  precondition implementer-token-present-owner-action-a-3 unmet
deploy                 not-applicable  STRUCTURAL in any pre-merge bundle
migrations             not-applicable  STRUCTURAL in any pre-merge bundle
scope                  not-applicable  branch verify-tmp-r8 does not match the phase pattern (MY artifact, see non-coverage 2)

gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
BUNDLE_EXIT=20
```

**The two exit 21s: pre-existence CONFIRMED by me at `986f58a`, not inherited.**
Run at that head with the same base:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode direct-pr \
    --base 3c60acb --head 986f58a --phase m3-p3 --only citations
  declared 1 applicable 0 not-applicable 1     GATE_citations_EXIT=21
$ ... --only credential-token
  declared 1 applicable 0 not-applicable 1     GATE_credential-token_EXIT=21
```

Per-member red rates taken from the gate's own witness records, for the three
specs round 8 touched:

```
checks-multi-marker-lines-strip-every-marker  status=green  member[0] 2/2  member[1] 2/2
checks-near-miss-prefix-bounded-time          status=green  member[0] 2/2  member[1] 2/2
checks-start-column-verified-not-trusted      status=green  member[0] 2/2  member[1] 2/2
```

**T-011, over all 54 specs and not only the touched ones:** 105 `mutation`
dangerous states, every one resolving to EXACTLY ONE occurrence of its `find`
string at this head. 0 failures. I also read the three touched specs' `find` and
`replace` pairs against the rewritten source and confirm each still means what
its author intended (line 1079 for the function, line 1157 for the decision
point).

**`test/behaviors.json`, append-only BY NAME against the MERGE BASE**, which is
what CLAUDE.md's rule measures:

```
base rows=477  head rows=511
removed BY NAME vs merge base: 0
added vs merge base: 34
DESCRIPTION CHANGED IN PLACE vs merge base: 0
base key order preserved as a prefix of head order: true
```

**On the edited row, which round 8 flagged loudly.** Against `986f58a` there IS
one in-place description edit,
`mode-conditions-multi-marker-lines-strip-every-marker` moving from "four
markers" to "five markers". Against the MERGE BASE there is none, because that
key is one of the 34 rows THIS PHASE ADDS and has never reached `main`. **The
edit is acceptable, and the reason is structural rather than lenient**: the value
is the test's NAME, the witness spec resolves the test BY that name, and the name
was false. Editing a row that has already merged would break name resolution for
work outside the phase; editing the phase's own unmerged row cannot. No key was
removed, no key repurposed, no other value changed. Round 8's disclosure of it is
correct in every particular.

**Both ASCII checks with `-a`**, over 432 tracked paths minus the two
path-scoped exemptions (`delivery/intake/orchestrated-delivery-process.md`,
`test/fixtures/json-schema-test-suite/`), with the greps' OWN exit codes and not
a pipeline's:

```
grep -laP '[^\x00-\x7F]'                 NONASCII_GREP_EXIT=1   (1 = clean)
grep -laP '[\x00-\x08\x0B\x0C\x0E-\x1F]' CONTROL_GREP_EXIT=1    (1 = clean)
```

and both demonstrated able to SEE what they exist to catch:

```
grep -laP '[^\x00-\x7F]' /tmp/f-utf8.bin                  -> match, UTF8_FIXTURE_EXIT=0
grep -laP '[\x00-\x08\x0B\x0C\x0E-\x1F]' /tmp/f-nul.bin   -> match, NUL_FIXTURE_EXIT=0
```

`git diff --stat 986f58a 108eed0` reports no file as `Bin`.

**Scope, re-derived by hand** (see non-coverage 2 for why not by the gate): the
declaration at the merge base names branch `claude/m3-p3-assurance-modes`, which
is the branch; 41 changed paths, 18 declared entries plus the two standing
extras, **0 paths outside**.

**Claim grep, run independently over the whole work history:** 99 hits total, 13
at or after line 6176 (round 8's section). Every substantive one carries an
adjacent captured command or is restated as a statement about the author's own
run. Round 8's own accounting names six and settles six; the extra hits are the
lines of its own accounting table. **This is the second consecutive round whose
claim-grep accounting I can call accurate and complete.**

## 6. The findings

### W-1 (MEDIUM): the rejected alternative was never built

**File and line:** `delivery/work-history/m3-p3.md`, fix round 8, the paragraph
beginning "**A disambiguated pattern was considered and REJECTED WITH A
MEASUREMENT.**", and the mechanism statement above it.

**What it claims.** That the mechanism is "deciding this with an ANCHORED
PATTERN CONTAINING ADJACENT OPTIONAL-WHITESPACE QUANTIFIERS", that the
arbitration's narrower framing (the whitespace shared between an iteration's
leading `[ \t]*` and the trailing `[ \t]*` in its alternatives) is incomplete,
that "the fix is not a better pattern", and that a disambiguated pattern was
measured at 12,147 ms and 11,280 ms and rejected on that evidence.

**What the pattern it measured actually is.**

```
/^(?:[ \t]*(?:>|[-*+]|[0-9]{1,9}[.)])[ \t]*)*[ \t]*$/
```

Every iteration ENDS with `[ \t]*` and the next iteration BEGINS with `[ \t]*`.
Those two are adjacent across the iteration boundary, so a whitespace run
between two markers can still be split two ways, and the final `[ \t]*` after
the group adds one more. **It is the same ambiguity in a different arrangement.
It is not disambiguated.** The BODY of the paragraph says so correctly ("It is
the same class in a different arrangement"); the heading, the framing and the
conclusion do not.

**The genuinely unambiguous form exists and is one edit away.** Hoist the
leading `[ \t]*` out of the group so every iteration starts on a marker
character, which is never whitespace:

```
/^[ \t]*(?:(?:>|[-*+]|[0-9]{1,9}[.)])[ \t]*)*$/
```

**Reproduction, on round 8's OWN two witness documents, through
`quotableUnits`:**

```
bullet run m=28  (151 bytes)
  r7 shipped pattern                                    11538.308 ms  units-match=true
  round8 witness member[1] (called "disambiguated")     12144.985 ms  units-match=true
  a GENUINELY unambiguous pattern                           0.535 ms  units-match=true
  round8 scan (shipped)                                     0.489 ms  units-match=true

ordered run m=28  (207 bytes)
  r7 shipped pattern                                    12569.385 ms  units-match=true
  round8 witness member[1] (called "disambiguated")      11916.000 ms  units-match=true
  a GENUINELY unambiguous pattern                           6.042 ms  units-match=true
  round8 scan (shipped)                                     0.807 ms  units-match=true
THREE_EXIT=0
```

I reproduce round 8's 12,147 / 11,280 ms almost exactly. The unambiguous form is
**22,700 times and 1,970 times faster** than the one round 8 measured, returns
identical units, and is language-equivalent to the round-7 pattern over all
21,435,888 enumerated strings of length <= 7 (`R7!=unambiguous:0`, section 1b)
plus the 3,804 ten-digit-region probes.

**Why this matters, stated without overreach.**

1. The arbitration's mechanism statement was CORRECT AND COMPLETE. Removing
   exactly the adjacency it named collapses the cost by four orders of
   magnitude. Round 8's claim that the framing is incomplete is contradicted by
   round 8's own choice of counter-example.
2. The arbitration explicitly offered two options, "an unambiguous pattern, or a
   linear scan", and invited the implementer to reject its recommendation with
   its own derivation. **The first option was never built.** The work history
   reads as though it was evaluated and lost on measurement, which is the exact
   shape T-012 records: a measurement that is true, and proves less than it
   appears to, carrying authority while doing it.
3. The fix-round contract's item 1 is "name the MECHANISM, not the finding". The
   mechanism as named ("an anchored pattern at all") is broader than the true
   one and is not supported by the evidence offered for it.

**What this is NOT.** It is not a defect in `src/checks.ts`. The SHIPPED
docstring is careful and correct: it says the scan "removes the CLASS ... rather
than the one instance of it that a disambiguated pattern would remove", which
concedes exactly the point. The scan is also the better option on the merits and
was the orchestrator's recommendation, so the OUTCOME is unaffected: the
implementer adopted the recommendation, and would have adopted it anyway. The
remedy is a correction to two paragraphs of the work history, which cannot
introduce a code defect.

**Why MEDIUM and not LOW.** Round 7's V-4 was LOW for one incidental false
sentence. This is a false claim in the round's CENTRAL derivation, it is the
justification for rejecting the option the arbitration named first, and it
records a wrong lesson ("a better pattern cannot help") in a durable artifact
that later readers are told to trust. If the orchestrator judges DR-0012
condition 2 a disproportionate consequence for a text defect, the argument for
LOW is: outcome unaffected, code correct, no gate affected, remedy is prose.
I have not applied that judgment myself.

### W-2 (LOW): two dangerous states that are one shape

**File:** `witness/checks-start-column-verified-not-trusted.json`, both members.

```
member[0]  find    "if (offset <= text.length && isSkippablePrefix(text.slice(0, offset))) {"
           replace "if (offset <= text.length) {"
member[1]  find    "function isSkippablePrefix(span: string): boolean { ... for (;;) { ... }"
           replace "function isSkippablePrefix(span: string): boolean {\n  return span.length >= 0;\n}"
```

`span.length >= 0` is unconditionally true, so member[1] makes the call site
`if (offset <= text.length && true)`, which is member[0] character for
character in effect. **Both are "the span check always accepts".**

Measured against the FULL suite, T-013 discipline, both restores verified:

```
label=startcol-m0   tests 505  pass 503  fail 2   SUITE_EXIT=1
  x a long near-miss block prefix is rejected in bounded time, for a bullet run and for an ordered run
  x the parser start column is verified rather than trusted, so a paragraph advanced
    past a link reference definition is not truncated, in the quote form and in the list form
  RESTORED md5 9697035ed2073c1ee165b5d1e0107cc5 (pristine 9697035ed2073c1ee165b5d1e0107cc5)

label=startcol-m1   tests 505  pass 503  fail 2   SUITE_EXIT=1
  (the IDENTICAL two test names)
  RESTORED md5 9697035ed2073c1ee165b5d1e0107cc5 (pristine 9697035ed2073c1ee165b5d1e0107cc5)
```

**Identical red sets.** Rule (g) passes only because its collapse test is
`first.find === second.find` (`src/witness/run.ts:1307-1318`), and the two
`find` strings differ. The gate is doing what it was written to do; the check is
syntactic and this pair defeats it without lying to it.

**This is pre-existing in shape, not introduced by round 8.** At `986f58a` the
same spec paired `if (offset <= text.length) {` with
`SKIPPABLE_PREFIX = /^[\s\S]*$/`, which is the same "always accepts" pair. Round
7's verifier did not flag it (its V-3 was about the neighbouring spec). Round 8
rewrote both members to retarget them at the new code and did not take the
opportunity to separate them. Reported because the brief asks whether the
members are genuinely different and for this spec the answer is no; a genuine
second member for "the start column is verified rather than trusted" would
attack the FALLBACK arm (for example bounding `quoteDepth`, or returning
`offset` instead of `consumed`) rather than the acceptance arm a second time.

### W-3 (LOW): the boundary moved from three to five, it was not removed

`src/checks.ts` docstring: "REPETITION IS UNBOUNDED ON PURPOSE. A model allowing
two markers would move the boundary to three and leave the same defect standing
there." That property is still unwitnessed. Measured in section 2: `{0,2}`,
`{0,3}` and `{0,4}` are killed; `{0,5}` and `{0,6}` SURVIVE the whole
`test/assurance-modes.test.ts` file. The discriminating power stops exactly one
step past the fixture's deepest member, which is the same structure V-2
reported, one notch further out.

Round 8's own claim is narrower than that and is TRUE as written: five markers
"is past any bound a 'widen it by one' fix would reach". A `{0,5}` model is a
widen-by-two, and nothing in the round claims to catch it. So this is a
disclosure gap rather than a false statement: the residual is real, it is not
named, and a reader of the docstring would reasonably believe otherwise.

**It is also inherent to a FINITE fixture and cannot be closed by adding a sixth
member**, which would move the boundary to six. The cheap way to close it, if
the orchestrator wants it closed, is a fixture member whose depth is generated
at run time (say 40 markers) so that no constant bound a mutant can carry
survives it. I did not build that; I am naming the shape.

### W-4 (LOW): an arithmetic claim that does not follow from its own capture

`delivery/work-history/m3-p3.md`, fix round 8, V-1: "runs it in **3.8 ms for
both shapes** ... So the assertion sits about 1,400 times above the honest
cost". 1000 / 3.8 is 263, and per-shape 1.9 ms gives 526. The same "about 1,400
times" appears in the test docstring in `test/assurance-modes.test.ts`, where the
stated honest range is "0.2 ms to 3.2 ms" and 1,400x corresponds to the fast end
only.

**The CONCLUSION is confirmed**, independently and more harshly than the round
tested it (section 1e): median honest cost 0.30 ms and 0.08 ms idle, worst
17.2 ms under 4.7x CPU oversubscription, and the real test passed 3/3 under that
load. The margin is between 58x and 12,500x depending on the regime. Only the
arithmetic is loose, and the fix is to quote the range rather than a single
multiplier.

## 7. What I attacked and did NOT break

A verification that lists only breakage is not a measurement, so this is the
list of attacks that FAILED to find anything.

- The `for (;;)` loop: 38 degenerate spans, 1,399,533 helper invariant checks,
  runs of 20,000 identical characters of every relevant class, an astral
  character, NUL. No hang, no negative index, no NaN.
- Language equivalence: 23,384,605 enumerated strings plus 3,804 targeted
  ten-digit probes plus 1,200 fuzzed documents. Zero divergences.
- Cost: marker sweeps to 3,584 markers, three fuzz seeds, the shipped CLI, and
  a search for a NEW pathological class against the scan (long single lines,
  20,000-paragraph documents, 400,000-character indentation runs, 100,000-digit
  runs). Worst observed round-8 cost anywhere: 149 ms, on a 60,000-byte
  20,000-paragraph document, and that cost is `commonmark`'s parse, not the scan.
- **The six quantified-group regex sites round 8 READ but did NOT time**, which
  is its own declared non-coverage item 2 and exactly where a sibling of V-1
  would live. I TIMED all six, with adversarial inputs built against each
  (a repeated `a./-` run and a pure dot run for `CITATION_SOURCE`'s
  `[A-Za-z0-9_./-]*\.`, an unterminated escaped-quote run for the three
  string-literal patterns, a leading-whitespace run for the TAP line, a long
  digit run for the engine range):

```
n        citations:453  citations:453  citations:453  run.ts:335  run.ts:359  run.ts:385  run.ts:542  doctor.ts:78
         (a./- run)     (dot run)      (near-miss)
200            0.49          0.06           0.01        0.08        0.05        0.13        0.05        0.05
3200           0.13          0.04           0.14        0.01        0.05        0.05        0.08        0.03
12800          0.51          0.13           0.64        0.08        0.23        0.21        0.22        0.10
SIX_EXIT=0
```

  **All eight probes are LINEAR to n=12,800; the worst is 0.64 ms.** Round 8's
  reading of each ("disjoint on the first character", "polynomial with a single
  star and no nesting") is confirmed by measurement. Its non-coverage item 2 is
  discharged, and I did not find a sibling of V-1 anywhere in `src/` or `bin/`.
  What I did NOT do: adversarial inputs derived from each pattern's own
  structure by a tool rather than by hand, and `citations` running over real
  documents rather than synthetic strings.

- Two dangerous states per witness for the three touched specs, each applied
  individually: all six red on exactly their own test, all six restores verified
  by md5.

## 8. A pre-existing crash, named because M3-P4 touches this file

**NOT a round-8 finding and NOT part of the verdict.** `quotableUnits` throws an
uncaught `RangeError: Maximum call stack size exceeded` out of `collectUnits`
(recursion over the `commonmark` AST) on a document with roughly more than 8,000
nested quote markers. Measured IDENTICALLY at both heads:

```
depth   round7                                        round8
 8000   ok units=1                                    ok units=1
12000   RangeError: Maximum call stack size exceeded  RangeError: Maximum call stack size exceeded
```

It predates round 8 (and predates round 7), it is not on the axis this round
touched, and it is out of scope here. It is recorded because it is an UNCAUGHT
exception rather than a diagnostic, on input a consuming project supplies, in a
file that is on M3-P4's files-to-touch list.

## 9. Verdict on V-1 through V-6, unambiguous

| finding | verdict | on what evidence |
|---|---|---|
| **V-1 (HIGH)** | **CLOSED** | 128x through the shipped CLI with byte-identical output, flat growth to 3,584 markers, 23.4M-string language equivalence, termination proved by reading and by 38-span attack, and a time witness demonstrated red 2/2 on both members and green with 58x headroom under 4.7x CPU oversubscription |
| **V-2 (MEDIUM)** | **CLOSED** | `{0,2}`, `{0,3}` and `{0,4}` all killed, plus three loop-bound mutants; name, description, spec and fixture agree. Residual W-3 (LOW) |
| **V-3 (LOW)** | **CLOSED** | the replacement member reddens ONE test out of 505, was fourteen |
| **V-4 (LOW)** | **CLOSED** | both sweeps re-run by me, exit codes and hits reproduce exactly |
| **V-5 (LOW)** | **out of scope** | orchestrator decision in `arbitration-m3-p3-round-8.md`; not re-measured, no claim made |
| **V-6 (LOW)** | **CLOSED by removal** | `git grep` for both constants outside `delivery/` returns nothing, exit 1; the derivation is stated in the true form ("I DID NOT FIND A WAY") |

**Recommendation: this head is mergeable on the code.** W-1 is a MEDIUM against
the work history and, under DR-0012 condition 2, blocks as written. The remedy
is a correction to two paragraphs and does not require a code change, a new
witness, or a ninth round of implementation. W-2, W-3 and W-4 are LOW and can be
merged with as tracked items.

## 10. On the eleven accepted survivors, clearly labelled

**This paragraph is not part of the verdict and did not colour it.** I did not
re-measure M03, M06, M07, M09, M10, M11, M12, M13, M16, M18 or M19, and I make
no claim about them. On the decision itself: I think it is right, and for a
reason the arbitration states but could state harder. The scarce resource in a
phase on its eighth round is not witness count but the number of remaining
opportunities to introduce a ninth defect, and eleven new witnesses over
behaviour nobody is changing is eleven such opportunities bought with no new
protection. The one qualification I would add is that `src/checks.ts` is on
M3-P4's files-to-touch list, so the eleven stop being dormant the moment that
phase starts; the STATE.md tracking by name, which the arbitration mandates, is
what makes that recoverable, and it should be re-read at M3-P4's dispatch rather
than at M3's exit.
