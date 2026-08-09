# DR-0022: what to do about quotableUnits after five fix rounds

- id: DR-0022
- project: tiphys-kernel
- task: M3-P3, escalated to the owner
- question: One function, `quotableUnits()` in `src/checks.ts`, has taken five fix
  rounds and four independent verifications and has produced a new defect every
  time. The whole of M3 is serialised behind it. Which of three options do we take?
- reversibility: option A adds a RUNTIME DEPENDENCY to a package that ships on
  npm, which is costly to reverse after v0.1.0; option B changes a shipped
  check's contract; option C is cheap to reverse and buys nothing new
- status: **OPEN, raised to the owner 2026-08-09.** Not decided by the
  orchestrator. See "why this one goes to you" below.
- date: 2026-08-09

## Why this one goes to the owner, when the last three did not

DR-0016 sets the bar: escalate only when two or more options are genuinely
comparable AND the consequence is high impact and costly to reverse. It also says
that if the analysis yields a recommendation the orchestrator would defend, there
is nothing to ask.

The orchestrator has a recommendation, below, and would defend it. But it does
not clear the bar on its own, for two independent reasons:

1. **Option A adds a runtime dependency to a published npm package.** This
   repository has treated exactly that class as an owner decision twice already:
   DR-0013 pinned `ajv` and `yaml` by owner decision. Runtime deps today are
   exactly those two. A third is the owner's call, not the orchestrator's, and it
   is costly to reverse once v0.1.0 is published.
2. **DR-0016's own second clause is reached.** Its fallback (a fresh implementer
   plus a third review contract) fired after round 2, and the phase has now failed
   twice more UNDER that fallback. The rule says the phase then goes to the owner.
   The orchestrator already extended it once, for round 5, on the argument that
   the mechanism had finally been named mechanically. That argument was tested and
   round 5 REGRESSED a shape round 4 had correct.

## The measured record, because the pattern is the argument

| round | fixed | what the next verification found |
|---|---|---|
| 1 | 3 highs (duplicate ids, reader not validating, count-not-content) | orchestrator found the count fix was a SUBSTRING check |
| 2 | the substring check | delta verification: 1 medium, 2 low, all in the new `quotableUnits` |
| 3 (fresh implementer) | fence state, indented headings | V-1: list-item continuation admitted as its own unit |
| 4 | continuation, plus nested sub-items | V-4: four more unconditional `flush()` sites, same mechanism |
| 5 | all nine sites, enumerated and argued | **V-5: a REGRESSION. Round 4 was correct on this shape; round 5 broke it** |

Five rounds, five defects, one function. Two witnesses were also found to have
silently stopped guarding anything while every gate stayed green.

**Round 5 is the one that settles it.** It did everything the fix-round contract
asks: it enumerated all nine call sites with four search keys, argued the closure
of the enumeration, ruled on each site individually, chose its threshold
deliberately, and kept controls that a lazy fix would have broken. The verification
confirmed every one of those claims independently. And it still regressed, because
the guard it added leaves `current` open without setting `blankPending`, so a
fully dedented next line with no blank between fuses into the item.

That is not a careless round. It is evidence that hand-rolling a CommonMark block
parser is the wrong shape of work, not that the last five agents were careless.

## The options

### Option A: use a real CommonMark parser

Add `commonmark` as a runtime dependency and extract quotable units from its AST
instead of from a hand-written line loop.

The verification that found V-5 **already used `commonmark` 0.31.2 as its
oracle**, to establish that round 4 was right and round 5 wrong. So the parser is
already the thing this project measures correctness against; option A is making
the implementation agree with the oracle rather than chasing it.

- Removes the whole class: no block-state machine, no interrupter enumeration, no
  threshold decision, no drift.
- Costs a third runtime dependency in a package whose current runtime surface is
  exactly `ajv` and `yaml`, both owner-decided (DR-0013).
- Costs supply-chain surface for every consuming project, forever, for one check.

### Option B: change the contract so prose does not need parsing

Require a decision record to mark its quotable conditions explicitly (a fenced
block with a known info string, or a YAML front-matter list), and have the check
read that rather than infer structure from prose.

- Removes the parsing problem entirely, with no dependency.
- Costs: every existing decision record that a mode cites must be edited to carry
  the marker. Today that is DR-0012 only, so the cost is small NOW and grows.
- Changes what a consuming project must do to its own records, which is a
  consumer-facing contract change on top of DR-0020's closed-vocabulary decision.

### Option C: one more hand-rolled round

- Cheap, reversible, and the base rate says it produces another defect. Five for
  five so far.

## The orchestrator's recommendation, stated so the question is answerable

**Option A**, with `commonmark` pinned exact like `ajv` and `yaml`.

The reasoning: the project already treats that parser as ground truth, so any
hand-rolled version is a reimplementation that must be kept in agreement with it
forever, by hand, with no mechanism that detects divergence. That is precisely the
"guard narrower than the property" family this repository has now recorded five
times. A dependency is a real cost, and it is a ONE-TIME, VISIBLE cost, whereas
the divergence is a recurring, invisible one.

If the dependency is unacceptable, **option B** is the orchestrator's second
choice, and it is genuinely close: it is the only option that makes the check
simple rather than correct-by-borrowing.

**Option C is not recommended** and the orchestrator will not take it without an
instruction.

## What is NOT blocked by this

Nothing. M3 is a strictly serial chain: M3-P4 is blocked-by M3-P3 merged, P5 by
P4, and so on to P10, and there is no M3 conflict pre-pass. The entire remaining
milestone is behind this one function, which is why this is raised now rather than
batched.

## Evidence

- `delivery/review/verification-m3-p3-round-5.md`, which found V-5 and verified it
  against `commonmark` 0.31.2 as an independent oracle.
- `delivery/review/verification-m3-p3-round-4.md` and `-round-3.md` for the two
  rounds before it.
- `delivery/review/arbitration-m3-p3.md` for the original dual review.
- `delivery/decisions/DR-0016-escalation-threshold.md`, whose fallback is exhausted.
- `delivery/decisions/DR-0013-schema-validator-implementation.md`, the precedent
  that a runtime dependency here is an owner decision.
