# Arbitration: M2-P7 release verification, round one

- date: 2026-08-06
- head: `fc7914eadddd11791518c4b628d6c6550cc0156a` (branch claude/m2-p7-deploy-and-migration-verifiers)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** One HIGH and two mediums from the hazard
  contract; criteria contract APPROVE. First fix round.

## The verdicts

| | criteria (Sonnet, CR-1320..) | hazard (Opus, CR-P7H-..) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 0 / 1 | 1 / 2 / 0 |
| gates | 44/44 both toolchains; fixtures byte-verified vs appendix A | same, plus the attack set |

The criteria contract confirms every acceptance criterion holds, the fixtures
are honest, and no failure vocabulary ships. The hazard contract found the
defects the criteria could not describe. Both concur on killSignal (below).

## The HIGH, at the mechanism

**CR-P7H-1: the kernel hangs forever on a FIFO planted at an evidence-write
path.** `runVerification` guards the request-file write with
`refuseOpenForWrite`, but writes the adapter's stdout, stderr, and the
per-attempt record with bare `writeFileSync` and no type probe. The
per-attempt `spawnSync` timeout bounds only the child; these kernel-side
writes are bounded by nothing, and the paths are deterministic. A hostile
adapter (named in the module's own threat model) returns a valid `pending`,
plants a FIFO at the next attempt's stdout path, and the kernel blocks
permanently. Constructed and confirmed: killed at 20s against a 5s deadline,
no attempt-2 record. This defeats the phase's central stated guarantee that
an adapter cannot hang the kernel, and it is the fix-round-contract shape
exactly: the M2-C-6 defang mutated the response READ and never the
stdout/stderr/attempt WRITES.

**Fix at the mechanism, not the one path:** every write the kernel makes into
the evidence directory (stdout, stderr, attempt record, and any other) goes
through the delivered `refuseOpenForWrite`/`classifyEntry`, the same as the
request file. The derivation must enumerate every `writeFileSync`/`openSync`
/`appendFileSync` in `src/gates/release.ts` and both adapters and show each
now establishes type first; the red witness plants a FIFO at EACH such path
(at least stdout and the attempt record, two structurally different members)
and asserts the kernel returns bounded, not blocks.

## The mediums

- **CR-P7H-2 (medium):** with `checksumPointer` configured, a matched
  migration whose applied checksum is null/absent skips content comparison
  and passes on id-match, and the record's `observation.raw` lists only ids
  so a reader cannot see the row went unverified. Soft-state partial-green.
  Fix: a configured checksum that is absent on a matched row is not a silent
  pass; it is surfaced (the row is reported unverified, or the outcome
  reflects that the comparison the config asked for could not be made).
- **CR-P7H-3 (medium):** `redactSecrets` removes the verbatim secret anywhere
  (nested field, URL query, stderr, all confirmed clean) but a base64 form
  leaks into the stderr evidence. Criterion 11's "no secret value appears
  anywhere" is not scoped to verbatim. Fix: broaden redaction to the encoded
  forms a credential realistically takes (at least base64), or scope the
  claim precisely and record what is not covered.

## The low, and killSignal

- **Criteria low (test #17):** `attemptTimeoutMs: 2000` is tighter than this
  implementer's own 5000ms convention for the same subprocess-spawn risk, so
  the test flakes under heavy host load (same class as CR-762). Raise to
  5000ms in this round while the file is open.
- **killSignal / C-2: decided, numeric 9 STAYS.** Both contracts
  independently reproduced that the default signal never returns against a
  SIGTERM-trapping child and that numeric 9 and "SIGKILL" are functionally
  identical, and both conclude a timeout kill of the kernel's OWN spawned
  child is not the identity-or-exclusion use C-2 forbids. It is not a
  violation. **Follow-up, not P7's (its files-to-touch excludes
  `test/gates.test.ts`):** add a one-line documenting carve-out to M2-P1's
  signal-name witness so the name can return later; recorded in the plan-
  amendments batch (task 31), not this round.

## Fix-round contract, binding

Name the mechanism (every kernel-side evidence-dir write establishes path
type first), not the one stdout path. Publish the derivation enumerating
every write site with full output and what it did not cover. Red witnesses
plant a real FIFO at each write path (>=2 structurally different) and assert
bounded return. Claim grep last, raw output, commit named. Update the branch
onto main first (absorbs the schema-count cross-phase fix). Both toolchains.
Suggested tier: strongest available under the model rule (Opus), because the
defect is a kernel hang in the milestone's most complex phase.
