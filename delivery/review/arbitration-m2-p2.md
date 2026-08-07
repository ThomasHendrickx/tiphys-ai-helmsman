# Arbitration: M2-P2 red-witness harness, round one

- date: 2026-08-06
- head: `7ed8830fc2ccdd859c08b46f4355ba9ad4799f4f` (branch claude/m2-p2-red-witness-harness)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One merge-blocking medium and one
  medium-low from the hazard contract; criteria contract APPROVE. First fix
  round.

## The verdicts

| | criteria (Sonnet, CR-1260..) | hazard (Opus, CR-H1..) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 0 / 2 | 0 / 2 / 0 |

The criteria contract confirms every criterion holds, including 3b against
the byte-identical CR-661 reproduction and 5a against the real V-2 capture.
The hazard contract found that the gate's OWN declared hazard is reachable
by standard idioms the detection does not cover. This is the T-007 split in
the one gate where a false negative is invisible everywhere, so it must be
closed.

## The mechanism (CR-H1, medium, merge-blocking)

**Rule (g)'s text-assertion detection is narrower than the hazard it
guards.** `deriveTextAssertions` fires only when it finds both a document
read and an assertion pattern, but the document-read regex matches only
synchronous `readFileSync` (never async `readFile` from `node:fs/promises`)
and the pattern regex matches only literal regexes/strings (never a variable
regex or a variable path). Confirmed against the real gate, each a single
member that DELETES the guarded workflow step and should be red as a
single-member collapse, all shipped GREEN:
- `await readFile(...)` (async) -> no document detected -> green;
- `assert.match(body, wanted)` (variable regex) -> no pattern -> green;
- `readFileSync(P)` with `const P = "...yml"` (variable path) -> green.

Proof they are false witnesses: the same async-read test handed the
meaning-inverting member (`exit 1` -> `exit 0`, nothing else) STAYS GREEN,
which is exactly hazard #3 (an assertion over TEXT that survives an edit
inverting its meaning). Latent today, because all four shipped kernel
witnesses are additive; the hole opens for the first document-asserting
witness, and this gate is the one that certifies every other test.

**Fix at the mechanism, not the three idioms:** broaden the document-read
detection to `readFile(?:Sync)?` and `node:fs/promises`, extract the full
set of assert forms the plan names, and **fail conservatively**: when a
document read and an assert reference coexist but no pattern is extractable,
treat the witness as text-asserting (subject to rule g) rather than
silently returning false. Red witnesses for at least two of these idioms.

## CR-H2 (medium-low), folded into the same round

Rule (f)'s capture obligation covers `bin/` as audited source but its
spawn-detection grep is four JS tokens, so a `bin/*.sh` that spawns and
parses another program's output (exactly where M1's V-2 defect lived,
`bin/fm-*.sh`) ships green with no `consumesExternalOutput` required, guarded
by a hand-written string. Extend the spawn/parse derivation to shell, or at
minimum record the gap in the residue with the reason; the work history's
rule-(f) discussion is JS-only and does not name it.

## The two criteria lows

CR-1261 (D-P2-3 says `spec.class` is consulted at two places, actually
three) and CR-1262 (D-P2-4 says the spawn-grep has a fifth `exec(`
alternative, actually four): documentation-accuracy in the work history, no
constructed coverage gap. Correct them in the same round while the file is
open.

## Fix-round contract, binding

Name the mechanism (detection narrower than the guarded hazard; fail
conservatively when a read+assert pair has no extractable pattern), not the
three idioms. Publish the derivation enumerating the detection's inputs and
showing each idiom now caught, with full output and non-coverage. Red
witnesses stage the dangerous state under at least two structurally
different idioms (async read; variable pattern), each red as a single-member
collapse and each red under the meaning-inverting member. Claim grep last,
raw output, commit named. Update the branch onto main first (absorbs the
schema-count and push-bundle cross-phase fix). Both toolchains. Suggested
tier: strongest under the model rule (Opus), because this gate judges every
other test.
