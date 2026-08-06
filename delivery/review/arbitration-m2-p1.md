# Arbitration: the two M2-P1 reviews

- date: 2026-08-06
- head: `ac3b2f6` (PR 11)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: FIX-ROUND-NEEDED stands. One high and five mediums block merge
  under DR-0012 clause 2. First fix round, same implementer, normal process;
  the DR-0016 fresh-implementer response is for a THIRD round, not a first.

## The verdicts

| | hazard (Opus) | criteria (Sonnet) |
|---|---|---|
| verdict | FIX-ROUND-NEEDED | APPROVE |
| high / medium / low | 1 / 5 / 8 | 0 / 0 / 1 |
| criteria | spot checks | 16/16 MET, executed on own fixtures |
| gates Node 26 | 180 / 180 / 0 skip | 180 / 180 / 0 skip |
| gates default | 180 / 178 / 2 skip | 180 / 178 / 2 skip |
| registry | 186, 0 unresolved | 186, 0 unresolved (own script) |

No factual disagreement anywhere: both reproduced the same gate numbers, the
same registry counts, the same scope result, and the criteria contract's nine
mutations all reddened as the work history claimed.

## Why the split is T-007 again, fourth phase running

CR-800 lives in counting semantics no acceptance criterion describes.
Criterion 9 says "no applicable gate" must not read as green, and the
implementation honours the letter of that criterion for the shapes the
criterion names. The hazard construction routes not-applicable through the
GATE rather than through a runner-evaluated precondition, and the counters
then say "every applicable gate is green" over a bundle whose examined units
total zero. Sixteen of sixteen criteria met, executed, and the spine can
still certify nothing as everything. The criteria contract itself said its
APPROVE should be weighed jointly, and it is: the FIX-ROUND-NEEDED verdict
stands because DR-0012 clause 2 blocks on any unresolved high or medium.

## What blocks, and in what shape

- **CR-800 (HIGH)**: the mechanism is counting semantics, not a message.
  "Applicable" must mean REACHED A GREEN OR RED VERDICT, and the exit-0
  reason must be impossible to emit over zero green verdicts. The hazard
  reviewer's restatement of criterion 9 is adopted as the intended reading.
- **CR-801 to CR-805 (MEDIUM)**: the runner's own crash discipline, the
  `$ref`-siblings Ajv seam break, concurrent runners on one evidence dir,
  the pin vacuity floor plus unenforced M2-C-5, and `branch-matches`
  anchoring and escaping. Each is a mechanism, and the fix-round contract
  applies to each.
- The 8 hazard lows and 1 criteria low: fix or record with reasons.

## Plan ripple, deliberately sequenced AFTER the fix round

The hazard review judged deviations D1 (`gates[].parameters`) and D2
(`GateResult.vacuous`) necessary but needing one-line ripples into the plan's
steps 6 and 2, and criterion 9 needs its restatement. Those plan edits are the
ORCHESTRATOR'S, not the implementer's, and they happen after the fix settles
the exact semantics, so the plan is amended once to match reality rather than
twice. Recorded here so the delta review can check both halves together.

## What the round confirmed sound, so it is not re-litigated

The diagnostic contract as an Ajv seam: shape, pointer format, deterministic
ordering (one ordering over ten runs, three producers), no engine wording
leaking. The four named divergences (`$ref` siblings, `$ref` cycle behaviour,
`__proto__`, one off-table message) are in the fix list. The M2-C-6
enforcement held under real mkfifo at all three placements. The criterion-14
deferral is honest, checked against the workflow and warning 6.
