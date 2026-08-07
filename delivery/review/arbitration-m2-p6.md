# Arbitration: M2-P6 coverage checker, round one

- date: 2026-08-06
- head: `39ae672b783cec3d9acd23385e03a082e09fe43d` (branch claude/m2-p6-coverage-checker)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** Four mediums from the hazard contract, all
  one class deep on the same surface. First fix round, same implementer
  (DR-0016 keeps rounds one and two with the original implementer).

## The verdicts

| | criteria (Sonnet, CR-970..) | hazard (Opus, CR-985..) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 0 / 1 | 0 / 4 / 8 |
| gates | both toolchains, own 9 tests green | floor: own 9 green; full suite = 1 known cross-phase + real-clock flakes |
| method | criterion 1 re-derived with an independent script; two-guard mutation with sha256 restore | attack table over the inventory side; four M2-P1 integration probes clean |

No factual disagreement. The criteria contract confirms every acceptance
criterion holds and the integration surface is sound; the hazard contract
found four mediums the criteria could not see, which is exactly the T-007
split the two contracts exist to produce. The lone criteria low (first-match
ordering on overlapping kinds) is the hazard contract's CR-992, so it is one
finding, not two.

## The mechanism, named rather than the four instances

The hazard reviewer already grouped the four mediums into mechanisms. Stated
as the fix round must fix them, at the mechanism:

1. **The inventory side has no cardinality invariant (CR-985, medium).** The
   coverage side checks for double-bucketing; the inventory side counts a
   duplicated id as two units and stays green. The module comment claims the
   two scans cannot compensate for each other's blind spot, which is false
   for cardinality. Fix: the inventory side gets the same duplicate-id check
   the coverage side has, and units become a count with a stated
   uniqueness invariant. The false comment is corrected, not just the code.
   CR-986 (the missing floor/expectedUnits, so the shipped gate has no
   anchor the way the test does) is the same mechanism and is fixed with it.

2. **Two definitions of "empty", only one of which trims, and neither sees
   zero-width (CR-987, medium).** The parity check compares against `""`
   with no trim; `checkCoverage` trims but `trim()` does not strip U+200B.
   Fix: one shared emptiness predicate, applied on both sides, that treats
   whitespace-only and zero-width-only content as empty. One definition,
   used twice.

3. **The finding-to-outcome parity scan is one-directional (CR-988,
   medium).** It iterates inventory ids only, so a phantom outcome (an id in
   the outcomes with no inventory row) passes. The coverage-coverage check
   has a phantom analogue; this one does not. This propagates: plan step 4
   declares this shape as the contract M3's report schema must satisfy, so
   the defect would ship into M3's input contract. Fix: add the phantom
   direction, symmetric with the coverage-side phantom check.

4. **An M2-C-6 refusal computed and discarded (CR-989, medium).** On the
   evidence side (`counts.json`), `refuseOpenForWrite`'s reason is assigned
   and never read and `runStep`'s failure is ignored, so a FIFO at the
   evidence path yields a silent green with empty evidence. The same refusal
   on the result path is loud and returns EXIT_GATE_ERROR. This is the
   CR-520 family one step on. Fix: the evidence-side refusal is honoured the
   same way the result-side one is, and a red witness stages the FIFO at the
   evidence path exactly as the result-path witness does.

## The lows, dispositions

The eight lows: CR-990/CR-991 (regex from unvalidated config: malformed
throws with no record; injection and ReDoS unbounded) and CR-992 (overlapping
kinds first-match-wins) are one mechanism, config-string-into-regex without
validation or bound, and the fix round takes them together because a
coverage gate that a config author can hang or make lie is a real gate
defect, not cosmetic. CR-993 (fenced/indented rows parsed as live; latent, no
fences in either real document today), CR-994 (duplicate --result silently
drops one), CR-995 (unitLabel wording) are recorded as tracked lows and may
ride if the implementer judges them out of proportion, each with a reason in
the work history per DR-0012 clause 2. The fix round decides; it does not get
to ride the four mediums or the regex mechanism.

## Fix-round contract, binding on this round

The three CLAUDE.md items apply. In particular: name each mechanism above
(not the instance), publish the derivation that enumerates every site of it
(for CR-989, every place the gate writes into a caller-supplied path and
whether each honours the refusal; for the regex mechanism, every place a
config string reaches a RegExp constructor), and state what the derivation
did not cover. Red witnesses stage the dangerous state: CR-985 a real
duplicate id in a real-shaped inventory; CR-989 a real mkfifo at the
evidence path with a harness bound; and the regex mechanism a real ReDoS
input with a measured time bound. Run the claim grep last and paste it. And
the standing debt this phase owes: **run the full suite on the floor
toolchain** (the hazard reviewer notes no P6 party has), and record it.

## Also recorded, not this phase's to fix

`test/liveness.test.ts:633` joins `:671` and the watcher locations in the
real-clock-flake family tracked in `delivery/STATE.md`; both reviewers hit
it and both proved it pre-existing. It is not a P6 finding.
