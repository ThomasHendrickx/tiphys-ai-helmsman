# Delta verification, M3-P4 fix round 3

Independent delta verifier, the third contract on this phase. This verifies the
DELTA `2ed019b..5470207` (7 commits), not the phase.

- round 2 head, previously verified: `2ed019b`
- round 3 head, under verification: `5470207` (HEAD confirmed
  `54702071dd10ec8d9b5c50c83c8415cf266dbdac`)
- merge base: `c7a7ce9`
- worktree: a private clone under the scratchpad, real branch name
  `claude/m3-p4-report-and-work-history`, never the main checkout
- toolchain: node v22.22.2 from `/opt/node22/bin`, checked with
  `node --version` in every shell that ran a measurement

## Verdict

**Round 3 fixed the mechanism it was dispatched to fix, and it committed one
new instance of that same mechanism while doing it.**

DV-001, DV-002 and DV-004 are CLOSED. DV-003 is CLOSED for the half the
arbitration named and introduces DV3-001, a NEW HIGH: the branch it added is
justified by a class-wide argument ("a gate that RAN and did not pass has a
wrapper exit code by construction", "THE BRANCH SPLIT IS ON RAN-OR-NOT") that
does not hold for the member `error`, and the counter-example is captured in
this round's OWN work history four sections later. The result is an
over-rejection: an honest record of a gate that errored before it ran is now
unwritable in a report AND in a work history.

That is the same shape the round names in its own opening sentence, which is
why it is a finding rather than a quibble: "round 2 declared a class closed on
a single argument, and the argument did not hold across the class."

A second, smaller over-rejection (DV3-002, MEDIUM) is at the DV-002 site: the
new `pattern` refuses the plainest honest sentence a `contradicts-plan: false`
record can carry, "This does not contradict the plan." A third (DV3-003, LOW)
is an evidence defect: the work history records "runner exit 0" for a bundle
that exits 20, contradicting a section of its own document. A fourth (DV3-004,
LOW) is a not-covered bullet whose stated derivation derives nothing, though its
conclusion is right.

Every other number the round published, and there are many, I reproduced
exactly: three suite axes, both ASCII checks with planted controls, all twelve
per-gate rows and their unit counts, the closure counts from a third
implementation, and the line-neutrality of `src/checks.ts`.

## First check, in the contract's order: what the round says it did NOT cover

Taken from the round's own two lists (delivery/work-history/m3-p4.md:2552,
2674, 2813, 2925, 3122) and checked by me.

| the round's stated gap | my check | result |
|---|---|---|
| `delivery/review/` and the PR body not swept for restatements | read; those are point-in-time records | agreed, editing them would falsify the record |
| the other seven schemas not enumerated for the CR-002 mechanism | measured: only `work-history.schema.json` has cross-document `$ref`, three of them | the scope is real, not a convenience |
| the counts half of `gateResult` not attempted | measured; the parity check already guards it | see "the third error" below |
| `error`/`amber` measured for the exit code only | THIS IS WHERE THE NEW FINDING IS | see DV3-001 |
| the DV-001 walk follows `$ref` only | measured: `$dynamicRef` and `$anchor` are absent, but ALL TEN schemas use `$id` | conclusion holds, the round's reason for it does not: DV3-004 |
| a check reading a shared definition WITHOUT declaring `guards` is undetected | CONSTRUCTED, both arms | true, and LATENT |
| no node 26 toolchain fetched | I did not fetch one either | stated, not settled |
| neither CI arm run | I did not run either | both still owed (T-009) |

### The uncovered item the dispatch told me to construct

A derived check can read a shared definition and simply omit `guards`, and the
new enumeration is blind to it. Constructed rather than reasoned, by mutating
the SHIPPED `src/checks.ts` to register a probe that reads `gate-results` (the
report key of the shared `#/$defs/gateResult`) while registered for `report`
alone. Restored by `cp` from a `trap`, md5 compared:

```
$ md5sum src/checks.ts            # before
68acf608026a1e497ba4013f64f49bca  src/checks.ts
```

| probe | shipped enumeration tests |
|---|---|
| reads `gate-results`, NO `guards` | **ok 1, ok 2, 2 pass 0 fail** (the hole) |
| the SAME probe with `guards: ["report.schema.json#/$defs/gateResult"]` | **not ok 1** (control) |

The control's text names the mechanism:

```
+   'dv3-probe-reads-shared-def guards report.schema.json#/$defs/gateResult
     but does not run on work-history (it runs on report)'
```

```
$ md5sum src/checks.ts            # after the trap restored it
68acf608026a1e497ba4013f64f49bca  src/checks.ts
```

So the guard is keyed on a VOLUNTARY DECLARATION, not on what a check reads.
It is LATENT today and I verified that rather than taking it: only
`work-history.schema.json` carries cross-document `$ref`s, only
`report-parity-arithmetic` declares `guards`, and the other two report-family
checks (`report-no-findings-statement`, `final-report-finding-parity`) read
nothing shared. The round named this and handed it back (item 6 of its
handback). **Confirmed as declared, not a new finding.**

## NEW FINDING DV3-001 (HIGH): the DV-003 split is not on ran-or-not

### The mechanism, in my words

**A universal claim over a class, used to justify a keyword, with no member of
the class derived.** The round wrote into a SHIPPED schema comment:

> A gate that RAN and did not pass has a wrapper exit code by construction, so
> requiring its PRESENCE refuses no honest record.

> THE BRANCH SPLIT IS ON RAN-OR-NOT: `not-applicable` is in the sibling branch
> because a gate that did not run has no exit code to give, and demanding one
> there would be the unwritable-honest-record failure this schema keeps
> guarding against.

Both sentences quantify over "results that ran". The new branch puts `red`,
`amber` and `error` on that side. **`error` is not a ran-status in this
repository**, and the round did not derive it; its own not-covered list says
"`error` and `amber` were measured only for the exit code", which covers the
COUNTS question and not this one.

### The counter-example, reproduced rather than argued

The gate runner's own comment says what `error` means, at src/gates/run.ts:837:

```
  // Parameters first: a gate invoked without something it needs measured
  // nothing, and that is `error`, never `not-applicable` (M2-C-3, M2R-003).
```

"Measured nothing" and "not-applicable is forbidden here" together mean the
author has no other status to use. Reproduced at this head:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only scope --evidence <scratch> --base origin/main --head HEAD
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: scope
runner exit=21

$ cat <scratch>/scope/result.json
{
  "gate": "scope",
  "status": "error",
  "units": 0,
  "unitLabel": "changed paths audited",
  "startedAt": "2026-08-10T16:29:37.890Z",
  "endedAt": "2026-08-10T16:29:37.890Z",
  "detail": "gate scope requires --phase, which was not supplied",
  "evidence": []
}
```

No child was spawned; `startedAt` equals `endedAt`; the record carries no exit
code because there is none. **This is the exact run the round itself captured**
and wrote up at delivery/work-history/m3-p4.md:3080 ("an earlier run of the
same bundle without it reported `scope` as **error**, `gate scope requires
--phase, which was not supplied`"). The counter-example was already in the
document that asserts the class.

A SECOND, structurally different member, from the same file: a gate killed by a
signal is `error` and `child.status` is null, so there is no exit code either
(src/gates/run.ts:998, which returns before `const exitCode = child.status ?? -1`
at src/gates/run.ts:1005). Two members that fail for different reasons, so this
is a class and not one spelling.

### What the schema now refuses

```
$ node bin/tiphys.ts validate --type report <scratch>/E-error-no-exit.yaml
INVALID #/gate-results/1 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report <scratch>/E-error-with-exit.yaml
exit=0
$ node bin/tiphys.ts validate --type work-history <scratch>/W-error-no-exit.yaml
INVALID #/gate-evidence/1 value matches no permitted alternative here
exit=1
```

The obligation travels through the `$ref`, which is the round's own claim
working correctly; it is the over-rejection that travels with it. A work
history is precisely where "the scope gate errored because `--phase` was not
supplied" gets recorded.

### Why HIGH

1. It is an OVER-REJECTION of an honest record, and the schema comment beside
   it names that exact failure as the thing it is guarding against. The round
   asserted it had avoided it.
2. The only ways out for an author are to omit the row (hiding a gate that was
   asked for and could not run) or to write a number that never existed. This
   phase ships the contract that decides what a false claim may look like, and
   this branch makes the true record inexpressible and the false one valid.
   That is the same reasoning the round-2 arbitration used to rate DV-002 HIGH.
3. It is the round's own named mechanism, committed by the round, and refuted
   by a capture inside the round's own work history.

The remedy is small and is not mine to choose: either move `error` to the free
branch, or split on a property that is actually about running.

## NEW FINDING DV3-002 (MEDIUM): the DV-002 pattern refuses honest negations

### The mechanism, in my words

**A guard written from the examples it was shown.** The three members the round
built all ASSERT a divergence. The pattern it derived matches the phrase, not
the assertion, so it also refuses every sentence that DENIES a divergence, and
denial is the natural sentence for a `contradicts-plan: false` record.

Nineteen fixtures, generated from `templates/work-history.example.yaml` by
substituting only the `finding` string of the entry that already carries
`contradicts-plan: false`, run through the real CLI at this head.

| `finding` | exit |
|---|---|
| `This does not contradict the plan; I checked section 2.3 before writing anything.` | **1, REFUSED** |
| `Nothing here contradicts the plan, and I read section 2.3 twice to be sure.` | **1, REFUSED** |
| `The reviewer thought this was contrary to the plan, and it is not: section 2.3 allows it.` | **1, REFUSED** |
| `I checked whether the wrapper count conflicts with the plan and it does not.` | **1, REFUSED** |

All four are honest records that contradict nothing, and all four are the exact
shape the boolean beside them is set to `false` for. Three arms of the same
diagnostic and nothing else:

```
INVALID #/verification-first/1 value matches no permitted alternative here
```

Two things make this worse than a taste question. **R-035 records these
findings VERBATIM**, so the author's remedy is to alter a verbatim record.
And the shipped `$comment` describes the rule as refusing "a finding whose own
prose names a divergence FROM THE PLAN while the boolean beside it says there
is none" -- a denial does not name a divergence, so the comment describes a
narrower rule than the keyword implements. That is DV-004's shape at a new
site: the comment and the code disagree, and the comment is what a later
author reads.

The second exit is worse than the first: an author who will not reword can set
`contradicts-plan: true`, which then requires a `stopped-and-reported` string,
i.e. an escalation that never happened. The schema makes the honest record
unwritable and a fabricated one writable.

MEDIUM rather than HIGH because the refusal is loud rather than silent and the
author is not misled about the document being rejected, only about why.

### The fix IS at the mechanism for the direction it was aimed at

Verified separately, and this is the good half. The round exercised three of
its eight tokens. I exercised the other five plus two case forms, all as
members, none of them named by the round:

| `finding` | exit |
|---|---|
| `This is contrary to the plan section 2.3, ...` | **1** |
| `... which conflicts with the plan section 2.3.` | **1** |
| `The count list here diverges from the plan ...` | **1** |
| `The six-count identity is at odds with the plan section 2.3.` | **1** |
| `The wrapper output is inconsistent with the plan section 2.3.` | **1** |
| `THIS CONTRADICTS THE PLAN SECTION 2.3 ...` (all caps) | **1** |
| `This Contradicts The Plan Section 2.3 ...` (title case) | **1** |

and three over-rejection controls that must pass, and do:

| `finding` | exit |
|---|---|
| `This deviates from the planning document the owner wrote, and the plan says nothing.` | 0 |
| `The plan is wrongly formatted in section 2, which is a typo and not a contradiction.` | 0 |
| `The two schema comments contradict each other about which check guards the definition.` | 0 |

So the token list works as a class over the direction it covers, the word
boundaries hold against `planning` and `wrongly`, and the case-insensitive
character classes are right. That is a mechanism fix, not three instances.

### Observation, not a finding: three undeclared under-reach escapes

The round declares three residues (neutral prose, `the plans` plural, a token
split over a line break) and declines to claim the eight tokens are exhaustive.
That declaration covers what follows, so it is recorded as measurement rather
than as a finding, but the orchestrator should see the price:

| `finding` | exit |
|---|---|
| `This contradicts plan section 2.3, ...` (article deleted) | 0, ACCEPTED |
| `This contradicts the M3 plan section 2.3, ...` (one word interposed) | 0, ACCEPTED |
| `This contradicts the  plan section 2.3, ...` (two spaces) | 0, ACCEPTED |

The first is the round's own member 1 with one word deleted.

The pattern is linear, which the round did not witness and I measured, so it is
not a ReDoS hazard: 1000, 4000, 16000 and 64000-character near-misses took
0.21, 0.05, 0.39 and 1.45 ms.

## DV-002 (HIGH, round 2): CLOSED

The site is narrowed, the correction is written where the false sentence was
rather than deleted, and the remedy generalises across the token list (seven
members above, five of them the round never named). The three shipped false
sentences are corrected in place at schemas/work-history.schema.json:69 and
schemas/report.schema.json:420, and the work-history restatements with them.

CLOSED at the mechanism, with DV3-002 opened against the direction the round
did not test.

## DV-003 (MEDIUM, round 2): CLOSED for the half named, DV3-001 opened

The exit-code obligation exists, it constrains PRESENCE and never VALUE, the
declared-open residue survives, and it travels to the work history. Measured by
me at this head:

| record appended to the shipped report template | exit |
|---|---|
| `result: red`, no exit code | **1** |
| `result: amber`, no exit code | **1** |
| `result: error`, no exit code | **1** (and this is DV3-001) |
| `result: red`, `wrapper-exit-code: 0` (the DECLARED-OPEN residue) | 0 |
| `result: red`, `wrapper-exit-code: 1` | 0 |
| `result: not-applicable`, nothing else | 0 |
| the shipped template unmodified | 0 |

The residue is preserved. What the round got wrong is which values belong on
which side, not whether the obligation is expressible.

### The "third error nobody named": TRUE, and it is a good catch

Verified two ways, independently of the round.

By reading: `report-parity-arithmetic`'s `run()` iterates `GATE_RESULT_SITES`
and reads `record[site.key]`; `result` appears nowhere in its body
(src/checks.ts:1714 is the loop, and the body between src/checks.ts:1703 and src/checks.ts:1765 never names `result`). By construction, at this head:

```
$ node bin/tiphys.ts validate --type report <scratch>/P1-red-partial-counts.yaml
INVALID #/gate-results/1 gate result records 2 of the 6 counts and omits failed,
skipped, todo, did-not-run, so parity cannot be computed (check: report-parity-arithmetic)
exit=1
$ node bin/tiphys.ts validate --type report <scratch>/P2-red-all-counts-unbalanced.yaml
INVALID #/gate-results/1 discovered 10 does not equal passed + failed + skipped +
todo + did-not-run = 9 (check: report-parity-arithmetic)
exit=1
$ node bin/tiphys.ts validate --type report <scratch>/P3-red-no-counts.yaml
exit=0
$ node bin/tiphys.ts validate --type report <scratch>/P4-red-all-counts-balanced.yaml
exit=0
```

So round 2's "`result: red` owes nothing at all: no exit code, no counts" was
wrong in BOTH conjuncts, and the counts conjunct was already guarded by a check
this same phase wrote. The round's sentence for it ("round 2 wrote a claim about
a site without running the check that already guarded it") is accurate. This is
a real catch and not a restatement.

## DV-001 (MEDIUM, LATENT, round 2): CLOSED

### The mechanism, in my words

**A test that names one relation and computes another.** The comment claimed
REACHABILITY; the code enumerated DIRECT CROSS-DOCUMENT REFERENCE. Those differ
by every chain, and the shipped tree hid the difference because its one `guards`
entry happens to sit one hop out.

### Reproduced independently, from a script I wrote before reading the round's

```
$ node <scratch>/closure-mine.mjs schemas
schemas: 10
closure definitions: 32  one-hop cross-document set: 3
multi-type definitions: 6
  report.schema.json#/$defs/claim reached-by=[report, work-history] (one-hop)
  report.schema.json#/$defs/fixRound reached-by=[report, work-history] (one-hop)
  report.schema.json#/$defs/gateResult reached-by=[report, work-history] (one-hop)
  report.schema.json#/$defs/settledBy reached-by=[report, work-history] INVISIBLE TO ONE-HOP
  report.schema.json#/$defs/settledByConstruction reached-by=[report, work-history] INVISIBLE TO ONE-HOP
  report.schema.json#/$defs/settledByCounterExperiment reached-by=[report, work-history] INVISIBLE TO ONE-HOP
single-type definitions invisible to one-hop: 26
unresolvable pointers in closure: 0
```

32 against 3, three multi-type invisible, 26 single-type invisible, zero
unresolvable. That is the round's table and the round-2 verifier's table, line
for line, from a third implementation.

Keeping `oneHopDefinitionUsers()` in the file AS the dangerous state is the
right call and it is what makes the witness a measurement: the test asserts
`oneHop.has(chained) === false` and the closure's membership in the same loop,
so reverting the walk reddens at the property rather than at an arithmetic
comparison. The size comparison is an inequality (`closure.size > oneHop.size`)
rather than a pinned number, which is convention 5 obeyed rather than quoted.

The second arm (a `guards` pointer resolving to nothing) is a genuinely
different kind of member, not a third spelling: no reachability walk of any
depth reports it, so it needs its own assertion. It registers a real probe
through `registerCheck` and removes it in a `finally`, then re-asserts the
registry is clean.

CLOSED.

## DV-004 (LOW, round 2): CLOSED

The corrected comment's new claim is that the registration is known by reading
`report.schema.json`'s own `properties` block. Verified independently:

```
$ node -e '<walk every properties block in schemas/*.json>'
report.schema.json /properties/no-findings-statement, /properties/findings
```

No other shipped schema names either property, and both are TOP-LEVEL rather
than in `$defs`, so no `$ref` could ever reach them and the enumeration could
never have made the registration a checked fact. The corrected text is true and
the old text was false.

## The construction choice: the additive `oneOf` reaches the same obligation

The round rejected the verifier's REPLACING `oneOf` and added one BESIDE the
untouched `if`/`then`. I judged this rather than accepting it, because an
additive alternation next to a conditional is exactly the shape that leaves a
gap.

It does not, at either site, and the reason is that the two rules are disjoint
on the SAME discriminating field:

- `gateResult`: the `if`/`then` fires only on `result: green`; the `oneOf`'s
  obligation branch enumerates `[red, amber, error]` and its free branch
  `[green, not-applicable]`. Union equals the `result` enum exactly, and the
  branches are disjoint, so every value selects exactly one branch. Green's
  seven required fields, `wrapper-exit-code: const 0` and `failed: const 0` are
  all still in the `if`/`then` and untouched.
- `verificationFirst`: the `if`/`then` fires on `contradicts-plan: true`; the
  `oneOf`'s branch 0 requires it and pins `true`, branch 1 pins `false`. The
  asymmetry (branch 0 has `required`, branch 1 does not) is what makes an
  ABSENT boolean fall to one branch instead of matching both, and the outer
  `required: [finding, contradicts-plan]` catches the absence separately.

The stated reason for choosing it is measurable and I confirmed it from the
diff: `git diff 2ed019b 5470207 -- test/` shows no existing assertion edited.
The replacing form would have changed `value does not satisfy the requirements
its own shape triggers here` into `value matches no permitted alternative here`
for T-004's coupling, CR-003's pinned `failed`, the `todo` bucket and R-035's
escalation, none of which this round has a finding against. The round also
asserted that the green diagnostics did NOT double, which is the failure mode
the additive form risks, and the suite is green on it.

**Judgement: the additive form is the better construction and the round's
justification for it is sound.** The verifier's suggestion was not superior and
the round was right not to follow it.

One residue I did not find closed and that neither form addresses: nothing
binds the two `oneOf` branch enums to the `result` enum they restate. Adding a
sixth `result` value without touching the branches makes every record carrying
it invalid, which is loud rather than silent, so I am recording it as an
observation and not a finding.

## Evidence confirmed or contradicted

### The suite, on all three axes, all CONFIRMED

One head (`5470207`), one toolchain (node v22.22.2), `dist/` state per row.

| invocation | `dist/` | tests | pass | SKIPPED | exit |
|---|---|---|---|---|---|
| `npm test` | built | 550 | 548 | **2** | 0 |
| bare `node --test` from the root | built | 552 | 550 | **2** | 0 |
| `npm test` | **removed** | 550 | 539 | **11** | 0 |

Every number matches the round's table. The arithmetic the dispatch asked me to
confirm holds: 11 = 9 dist-dependent + 2 floor-gated. The two constant skips are
NAMED rather than inferred, from the bare run's own output:

```
ok 138 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is below
  the kernel floor >=26; exit-0 witnessed on CI (Node 26)
ok 142 - doctor with gh absent exits 0 under the generic profile # SKIP ...
```

The two extra tests on the invocation axis are the `sandbox/test/greet.test.js`
pair CLAUDE.md already documents.

### Both ASCII checks, with positive controls, CONFIRMED

Over `git ls-files` minus the two path-scoped exemptions, 503 files, counted as
LINES because `xargs` returns 123 either way:

```
non-ASCII matching lines: 0
control-char matching lines: 0
non-ASCII matching lines (planted fixture added): 1
control-char matching lines (planted NUL fixture added): 1
git diff --stat origin/main...HEAD lines containing "Bin": 0
```

503 files and both zeros match the round exactly, and the planted arms prove
the pipeline can report.

### `src/checks.ts` line-neutrality, CONFIRMED BY MEASUREMENT

The round says it caught a nine-line shift in its own committed work and made
the edit line-neutral. Both halves verified:

```
$ for h in c7a7ce9 2ed019b d164b4c 52a0d43 5470207; do
    echo "$h $(git show $h:src/checks.ts | wc -l)"; done
c7a7ce9 1667
2ed019b 2020
d164b4c 2029      <- the defect, nine lines longer
52a0d43 2020      <- the remedy
5470207 2020
```

Stronger than a line count, and this is the check that settles the sweep:

```
$ diff <(sed '63,72d' <checks at 2ed019b>) <(sed '63,72d' <checks at 5470207>)
(no output)
```

Every byte of `src/checks.ts` outside lines 63-72 is IDENTICAL to round 2, and
the changed region is five lines replaced by five lines (`git diff -U0` reports
`@@ -66,5 +66,5 @@`). And no citation anywhere in the tree lands in that region:

```
$ git grep -nE 'src/checks\.ts:(6[0-9]|7[0-5])\b' $(git ls-files)
NONE
```

So every one of the 100-plus `src/checks.ts:LINE` citations in the repository
resolves to exactly the content it resolved to at `2ed019b`, which was already
verified. The round's spot-check claim is true and the property is stronger
than spot-checking establishes.

### Citations added by the delta, resolved by hand

`delivery/work-history/` is outside the citations gate's precondition paths
(gate-registry.yaml:117), so the gate is `not-applicable` here and cannot cover
them. All fifteen distinct `path:line` tokens added anywhere in the delta were
resolved individually at this head; every one lands on the line it claims,
including the two the round re-pointed after the line-neutrality fix
(`src/checks.ts:1698` is `id: "report-parity-arithmetic",`). One token,
`report.schema.json:420`, appears without its `schemas/` prefix inside a
captured grep block and is quoted output rather than a citation.

## Did the round fix the MECHANISM or the INSTANCE?

The mechanism, on three of four findings, and it named the mechanism better
than the arbitration did. Naming the four findings as one defect with four
faces is correct and I checked it rather than accepted it: DV-002 is a class
argument that fails at one member, DV-003 is the same argument failing at half
of one member, DV-001 is the same shape one abstraction down (a comment
claiming reachability over code computing direct reference), DV-004 is the same
shape at the smallest scale.

**The claim I was told to check hardest, that the round offers NO replacement
class-wide argument, is FALSE in exactly one place, and it is the place that
matters.** The DV-003 branch is justified by "a gate that RAN and did not pass
has a wrapper exit code by construction" and "THE BRANCH SPLIT IS ON
RAN-OR-NOT". Those are class-wide arguments, they are asserted rather than
derived, and they do not hold across the class. Everywhere else the round did
what it said: per-site derivations, per-site not-covered lists, and honest "I
did not find a way" where it did not find one.

The `CLAUDE.md` claim grep is again blind to it. Run over the round-3 section
of the work history it produces five hits, all quoted greps or captured
program output:

```
$ sed -n '2404,3129p' delivery/work-history/m3-p4.md > r3-section.md
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' r3-section.md
L18 L72 L133 L136 L254   (5 hits, every one benign)
```

"by construction" and "the split is on RAN-OR-NOT" carry none of the mandated
tokens, which is the same observation round 2's verifier made about round 2's
three sentences. The grep reaches wording; only building the counter-example
reaches the reasoning. The round says this itself and adopted "build the
counter-example first" as its method rule, and it applied that rule at three
sites and not at the fourth.

## Per-finding table, with the mechanism in MY words

| id | severity | mechanism, my words | verdict |
|---|---|---|---|
| DV-001 | MEDIUM (latent) | a test that names one relation (reachability) and computes another (direct reference) | **CLOSED**, numbers reproduced from a third implementation |
| DV-002 | HIGH | an impossibility claim about a remedy, accepted without building the remedy | **CLOSED** for its direction; opens DV3-002 for the converse |
| DV-003 | MEDIUM | a conjunction refuted by its weaker half while reading as one settled fact | **CLOSED** for the exit-code half; opens DV3-001 |
| DV-004 | LOW | a comment claiming a derivation nothing performs | **CLOSED**, verified independently |
| DV3-001 | **HIGH, NEW** | a universal over a class used to justify a keyword, with no member derived: `error` does not mean the gate ran | **OPEN** |
| DV3-002 | **MEDIUM, NEW** | a guard written from the examples it was shown: it matches the phrase and so refuses the denial as well as the assertion | **OPEN** |
| DV3-003 | **LOW, NEW** | a published exit code that the published counts cannot produce | **OPEN** |
| DV3-004 | **LOW, NEW** | absence from one permission list read as evidence of non-use, when the keyword lives in the other list | **OPEN** |
| the third error | n/a | round 2 wrote a claim about a site without running the check that already guarded it | **round 3's catch is TRUE**, verified two ways |
| a check reading a shared definition without `guards` | n/a | the guard is keyed on a voluntary declaration, not on what a check reads | **CONFIRMED AS DECLARED**, latent, already handed back |

## What this verification did NOT cover

- **Neither CI arm.** I ran nothing on `pull_request` and nothing on the
  post-merge `push` head. T-009's rule is that a gate result is evidence only
  for the configuration it ran under, and mine is a third configuration that is
  neither event. Both arms are still owed.
- **No node 26 toolchain.** Every suite row above is node v22.22.2, so the two
  floor-gated `doctor` tests are SKIPPED in all three and I did not witness
  them. I could have fetched one and chose to spend the time on the schema
  probes instead, which is a judgement and not a limit.
- **`delivery/review/` and the PR body.** Same exclusion the round declared. I
  did not sweep older review documents for restatements of the corrected
  impossibility claims, and I cannot see the PR body from here.
- **The other seven shipped schemas, for the CR-002 mechanism.** I confirmed
  they carry no cross-document `$ref`, which is a different question from
  whether any of them has an author-selected branch that owes nothing. I did
  not enumerate their branches.
- **The counts half of `gateResult`.** I confirmed the parity check guards
  partial and unbalanced counts. I did not attempt to close "red with no counts
  at all" and I have no opinion on whether it should be.
- **The English space of ways to say a finding diverges from a plan.** I found
  three escapes beyond the round's three declared ones and stopped. I am not
  claiming six is the number.
- **Whether an author would in practice hit DV3-002.** I showed four honest
  sentences are refused. I did not sample real work histories to estimate how
  often that phrasing occurs.
- **The `enumerableSection` site.** I did not try to close it and I did not
  audit the round's claim that a `why-none` field is blocked by plan text
  rather than by structure; I read the cited clause
  (delivery/plan/kernel-plan-m3.md:2791) and it says what the round says it
  says, which is not the same as agreeing the remedy is blocked.
- **CR-007.** Not reopened, per the arbitration.
- **The `test/gates.test.ts` race** over `src/gates/schemas/`. I deliberately
  never ran two suites over one tree, so I did not observe it and I did not
  chase it.
- **Whether `report-parity-arithmetic`'s six-count identity matches the M2-P3
  wrapper's.** I verified the check's behaviour, not its agreement with the
  wrapper.
- **The `red-witness` gate reports "0 own, 31 stored" at every round of this
  phase, including round 1.** So this phase registers no witness specs with that
  gate and its schema guards are witnessed by in-test defang arms instead. That
  is pre-existing and identical at `2ed019b`, so it is not in this delta and I
  did not judge whether it should be.
- **The round's OTHER not-covered bullets were not each audited for DV3-004's
  defect.** I checked the `$id` one because the walk depended on it and found
  the derivation invalid. I did not re-derive the remaining bullets, so I cannot
  say whether the same shape sits in any of them.
- **The delta's schema comments were not read line by line for further false
  claims.** I read the two that changed and the surrounding residue paragraphs;
  the round's own claim was that all five sites are corrected, and I confirmed
  the two shipped ones rather than all five.

## The DV-001 fix, verified against the SHIPPED assertion rather than the round's account

Three probes registered into the shipped `src/checks.ts` registry, each
`type: "report"` with `alsoTypes: []`, restored by `cp` from a `trap` with md5
compared (`68acf608026a1e497ba4013f64f49bca` before and after every arm):

| probe `guards` | shipped test | failure text |
|---|---|---|
| `report.schema.json#/$defs/settledBy` (1 extra hop, invisible one hop out) | **fail 1** | `dv3-chain guards ... but does not run on work-history (it runs on report)` |
| `report.schema.json#/$defs/settledByConstruction` (2 extra hops) | **fail 1** | same shape |
| `report.schema.json#/$defs/nowhere` (resolves to nothing) | **fail 1** | `dv3-chain guards ... which no shipped schema reaches` |

The third fails at the DANGLING assertion and the first two at the hole loop, so
the two arms are separately load-bearing rather than one arm answering for both.
Read as TEXT, not as an exit code.

## The gates, run by me: 8 green confirmed, and the runner's EXIT CODE was NOT

Same command as the round, same head, my own evidence directory, on a tree whose
only untracked additions were this report and a `node_modules` symlink (no
tracked file modified).

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <scratch> --base origin/main --head HEAD --phase m3-p4
gates: declared 12 applicable 8 verdict 8 green 8 red 0 not-applicable 4 error 0 vacuous 0
gates: required gate(s) not applicable: citations
runner exit=20
```

Every per-gate row matches the round's table exactly, read from my own
`result.json` files rather than from the summary line:

| gate | status | units |
|---|---|---|
| `agent-rules-drift` | green | 17 rendered gate rows compared |
| `citations` | not-applicable | 0 citations resolved |
| `clause-map` | green | 27 clause-map rows checked |
| `coverage` | green | 115 finding ids checked |
| `credential-scrub` | green | 7 credential sources probed |
| `credential-token` | not-applicable | 0 tokens probed |
| `deploy` | not-applicable | 0 release verifications satisfied |
| `manifest-self-check` | green | 8 schema documents validated |
| `migrations` | not-applicable | 0 migrations compared |
| `red-witness` | green | 31 witnesses evaluated |
| `scope` | green | 18 changed paths audited |
| `suite` | green | 550 tests reported |

`red-witness` was green on my FIRST attempt, so the transient the round hit in
round 2 did not recur here.

### NEW FINDING DV3-003 (LOW): the work history reports the wrong runner exit code

delivery/work-history/m3-p4.md:3062 says "runner exit 0" for this bundle. The
runner exits **20**, and it must, given the round's own counts. The aggregate
decision is a pure function of them (src/gates/run.ts:1165): no error, no red,
verdict 8, and `citations` is a REQUIRED gate reporting `not-applicable`
(`applicability: required` in gate-registry.yaml), so the fourth branch fires
and `EXIT_NOT_APPLICABLE` is 20 (src/gates/result.ts:67). Identical counts
cannot produce a different exit code.

This is not a hidden failure and the gate results themselves are exactly as
reported. It matters because the SAME work history already devotes a section to
explaining that exit 20 is expected here and why
(delivery/work-history/m3-p4.md:193), so the document now contradicts itself,
and because this repository's evidence rule is the exit code. The wrong number
is in the direction that reads better.

Round 3 also verified nothing about this in its verification pass, and the
error is exactly the kind a re-run catches.

### NEW FINDING DV3-004 (LOW): the `$id` bullet derives nothing

The round's DV-001 not-covered list says its walk follows `$ref` only, and
justifies that as safe: "No shipped schema uses the other three (checked by
their absence from `AUTHORING_VOCABULARY` at src/validate.ts:111)". Both halves
fail.

```
$ grep -h '"\$dynamicRef"\|"\$anchor"\|"\$id"' schemas/*.json
  "$id": "https://tiphys.dev/schemas/assurance-modes.schema.json",
  ... (one per file, ten in total, every one an "$id")
```

All ten shipped schemas USE `$id`. And absence from `AUTHORING_VOCABULARY`
could not have shown otherwise, because `$id` is a permitted annotation listed
in the SIBLING array `ANNOTATION_KEYS`, which begins at src/validate.ts:131 and
carries `$id` at src/validate.ts:134, twenty-odd lines below the array the
round cited.

**The conclusion still holds and I checked it rather than assumed it**: every
`$id` sits at a document root, none re-bases a subschema, and each one's last
path segment equals its file name, so resolving by `$id` and resolving by file
prefix give the same owner for every pointer in this tree. The walk is correct.

LOW, and it is DV-004's exact family: an account of HOW something is known that
does not establish it, beside a conclusion that happens to be right. Two of the
four things this round was sent to fix were that shape, which is why it is worth
naming rather than waving through.

## Method notes, including against myself

- Every mutation restored by `cp` from a `trap`, never `git checkout --`, with
  md5 printed AND compared. Two pristine copies were taken and all four mutation
  sessions restored to the same digest.
- All scratch fixtures were written OUTSIDE the repository tree.
- Failure TEXT was read in every witness arm; no arm was scored on an exit code
  alone.
- I never ran two suites over one tree, so the pre-existing
  `test/gates.test.ts` race was neither hit nor cleared.
- My first attempt at the DV-003 report fixtures failed on a shell quoting
  error (`undefined/E-error-no-exit.yaml`) and produced a run whose exit code
  was 1 for a reason that had nothing to do with the schema. Recorded because a
  count of red arms cannot see this.
- No transient git or signing failure occurred in this session; there is
  nothing to record a second attempt for.

## Where this leaves the DR-0012 stop rule

Not my decision, and I state the inputs plainly rather than a recommendation
about merging, because that is the orchestrator's under DR-0012 and DR-0016.

- Round 3 was the SECOND fix round after the dual review.
- Three of four findings are CLOSED at the mechanism, verified by construction
  and not by reading the round's account.
- One NEW HIGH (DV3-001) is attributable to the round itself, and it is the
  round's own named mechanism committed by the round. That is the twelve-of-
  thirteen shape from the M1 throughput analysis, occurring again.
- The remedy for DV3-001 is small and local (which values sit in which `oneOf`
  branch, plus the two sentences that justified the wrong split). DV3-002 is
  the same kind of edit at the other site. Neither needs new machinery.
- DR-0012's own condition for stopping is a phase needing more than two fix
  rounds OR a high-severity finding recurring in one component. A HIGH has now
  been found in `schemas/report.schema.json`'s `gateResult` in two consecutive
  delta verifications (DV-003 MEDIUM then DV3-001 HIGH at the same definition),
  and a HIGH has been found in the `$comment` prose of these schemas in both
  rounds.

## Claim grep over THIS report

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' \
    delivery/review/verification-m3-p4-round-3.md
```

Nineteen hits. Every one, settled or restated:

- **L11, L613, L692, L698, L770** ("never the main checkout", "I never ran two
  suites over one tree", "never `git checkout --`"). Statements about what I
  did, not about the world. The three suite runs above are sequential and each
  reports its own duration; the four mutation sessions each printed and
  compared md5.
- **L118, L324, L556, L731.** Quoted program output or a quoted grep command,
  not my prose.
- **L181** ("a number that never existed"). Settled: the runner record captured
  above (`<scratch>/scope/result.json`) has no exit-code field, and
  `startedAt == endedAt` with no child spawned. Any integer written into
  `wrapper-exit-code` for that gate would be an invention.
- **L230** ("an escalation that never happened"). RESTATED as what I measured
  rather than as a prediction about authors: a document with
  `contradicts-plan: true` and a `stopped-and-reported` string validates
  regardless of whether the escalation occurred, which my probe `C-neg-*`
  family shows is the only alternative to rewording the verbatim finding. I did
  not observe an author doing it.
- **L287** ("five of them the round never named"). Settled by comparison: the
  round's own witness table at delivery/work-history/m3-p4.md:2584 exercises
  three findings (`contradicts the plan`, `the plan is wrong`, `deviates from
  the plan`). The five in my table (`contrary to`, `conflicts with`, `diverges
  from`, `at odds with`, `inconsistent with`) appear in neither its table nor
  its registered test.
- **L296** ("constrains PRESENCE and never VALUE"). Settled: the branch
  declares `"wrapper-exit-code": {"type": "integer"}` with no `const` and no
  `enum`, and both `wrapper-exit-code: 0` and `: 1` beside `result: red` exit 0.
- **L319** ("never names `result`"). Settled:
  `sed -n '1703,1765p' src/checks.ts | grep -n '\["result"\]\|\.result'`
  returns nothing, and the four constructed fixtures behave accordingly.
- **L399** ("could never have made the registration a checked fact"). Settled by
  the properties walk over all ten schemas: `findings` and
  `no-findings-statement` occur only in `report.schema.json` and only at the
  top level, and the enumeration keys on `$ref` targets, of which there are 32
  and none is a top-level property.
- **L422** ("catches the absence separately"). Settled by construction:

```
$ node bin/tiphys.ts validate --type work-history <scratch>/A-absent-clean.yaml
INVALID #/verification-first/1/contradicts-plan required property contradicts-plan is missing
exit=1
```

  and the same fixture with divergence prose reports the `oneOf` line as well,
  so the asymmetric branch does not swallow the missing boolean.
- **L688** ("the kind a re-run catches"). RESTATED: I re-ran the same command
  and got a different exit code from the one recorded. I am not claiming re-runs
  catch this class in general.
- **L747.** Quoted source comment.

## Beacon and provenance

This file was created within the first minutes of the run and appended to
throughout (T-008). Worktree: a private clone under the scratchpad. HEAD
`54702071dd10ec8d9b5c50c83c8415cf266dbdac`, branch
`claude/m3-p4-report-and-work-history`, tracked tree clean at every measurement.

STATUS: COMPLETE.
