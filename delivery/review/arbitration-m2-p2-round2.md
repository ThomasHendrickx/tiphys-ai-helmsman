# Arbitration: M2-P2 red-witness harness, round two

- date: 2026-08-06
- head: `7714805` (branch claude/m2-p2-red-witness-harness)
- outcome: **FIX-ROUND-NEEDED.** One medium from the hazard delta; criteria
  delta APPROVE. Second fix round, still implementer-owned (round three would
  trigger the DR-0016 fresh-implementer escalation).

## The verdicts

| | criteria delta (Sonnet, CR-1515) | hazard delta (Opus, CR-1500) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |

Criteria confirms all 11 criteria hold (3b/5a byte-exact against the real
captures) and four escape idioms re-reddened; one note CR-1263 (fix commits
carry model/tool trailers) is handled by writing a clean squash message at
merge. Hazard found the round-one fix closed the mechanism for some read
spellings but not the dominant one.

## The mechanism (CR-1500, medium), and why it blocks

Round one broadened read-recognition to async named-import and variable
forms, but `deriveTextAssertions` still does NOT recognize the
NAMESPACE-QUALIFIED read: `fs.readFileSync(...)`, `await
fs.promises.readFile(...)`, `fsp.readFile(...)`. That is the dominant
real-world idiom, more common than the async-named-import form round one DID
fix. Under it, `textAsserting` is false, the >=2-member rule is not enforced,
and a single deleting member ships GREEN: a false witness in the gate that
judges every other test, the exact hazard #3 and mechanism that made the
original CR-H1 merge-blocking. And the work history's derivation table
affirmatively claims node:fs/promises is TEXT-ASSERTING, reading as covered
when only the destructured named-import form is: an overstated-coverage claim
the fix-round contract forbids.

The reviewer fairly raised the APPROVE counter-argument (MECHANISMS row 23:
this detector class cannot be fully closed; the doctrine is name-the-residue,
do not chase; the corpus has zero namespace-read witnesses today, so latent).
It is overruled for consistency: the escaping idiom is the STANDARD one, not
an exotic alias; the original CR-H1 cleared the merge-blocking bar while being
RARER; and the residue is not merely unnamed but affirmatively mis-claimed as
covered. A gate whose whole purpose is to not be foolable must catch the
common way it is fooled.

## Fix at the mechanism, bounded (not an idiom chase)

Recognize the namespace member-call form of the SAME builtin the detector
already targets (`<ns>.readFile(?:Sync)?`, including `fs.promises.readFile`
and an aliased-namespace like `fsp.readFile`). Then, per the fix-round
contract, correct the derivation-table claim and NAME the members that remain
uncovered as explicit residue with a reason, exactly as the aliased-callee
residue is already named: callback-style reads, two-hop variable rebinding,
and (CR-1501, low, folded in) extension-less root documents like `Makefile`
whose path has no `/` or `.`. Naming is the discharge for those; the
namespace form is common enough to require closing, not naming.

Red witnesses (strong form, >=2 structurally different): a single-member
text-asserting witness using `fs.readFileSync` AND one using
`fs.promises.readFile`, each green-suppressed pre-fix and caught post-fix
(single-member collapse), and at least one also red under the
meaning-inverting member. Do not regress the over-reach property (the fix must
still not falsely redden a legitimate derived-value behaviour witness, which
the criteria delta confirmed is currently correct).

## Fix-round contract, binding

Name the mechanism (read-recognition must cover the namespace member-call of
the targeted builtin; everything not covered is NAMED residue with a reason,
never claimed covered). Publish the derivation enumerating the read spellings
and which the detector now recognizes, with output, and the honest residue
list. Claim grep last. Both toolchains. Update onto current main first.
Suggested tier: Opus (this gate judges every other test).
