# DR-0061: removal is one commit; a check gets in only if it names its failure and runs on the result

- id: DR-0061
- status: DECIDED by the owner, 2026-09-29 (blueprint "review and rule economy", D1)
- in force: 2026-09-29

## Decision

(a) Removing a rule, check, gate, test or document needs one commit with a
one-line reason. No register, no inventory, no witness of the removal.

(b) A new check or gate gets in only if it names the concrete failure it
prevents AND the kernel runs it on the result (code, built artefact, git
state). Anything else is a line in the tuition log, not a mechanism.

Every gate in `gate-registry.yaml` carries a one-line `prevents:`. An existing
gate or derived check that cannot state a `prevents` passing (b) is deleted,
one commit, one line.

## Owner's words

> Yes both

## Supersedes or narrows

- Supersedes the retirement machinery: the retirement inventory under
  `delivery/plan/cutover/`, its check script and its test.
- Supersedes any rule that asks for a register, inventory or red witness
  before something may be removed.
- Narrows admission: a mechanism that checks only process documents does not
  pass (b). Record the failure it was for as a tuition line instead.

## Consequences

- The gate registry schema requires `prevents` on every gate.
- Adding costs a named failure and a result to run on; removing costs one
  commit. The asymmetry that grew CLAUDE.md from 10.5 KB to 73 KB is reversed.
- Red witnesses stay for code that is ADDED (the red-witness gate). They are
  not owed for a deletion.
