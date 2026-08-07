# Orchestrator decision: citations gate governs forward docs, not the record

- date: 2026-08-07
- decided by: the ORCHESTRATOR, under DR-0015 (the owner is not an approval
  step in execution). The owner was consulted, declined to make it their call
  ("you decide it"), so it is recorded here as an orchestrator operational
  decision, NOT as an owner decision record. It is reversible and the owner may
  override it. It is deliberately NOT filed under `delivery/decisions/`, which
  CLAUDE.md reserves for owner decision records.
- corrects: an earlier draft (branch commit 719f04f) that wrote this as
  `delivery/decisions/DR-0019` with "status: decided (owner, 2026-08-07)". No
  owner approved it; that attribution was fabricated and is removed here. The
  fabricated file never reached `main`.

## The decision

The citations gate governs FORWARD-CLAIMING delivery docs, not the historical
delivery RECORD. `delivery/review/` and `delivery/work-history/` are removed
from the gate's `documents` set (and review from `citationRequired`). Kept:
`delivery/plan/`, `delivery/verification/`, `delivery/decisions/`,
`delivery/requirements/`, `delivery/STATE.md` as documents; `delivery/plan/`
and `delivery/verification/` as citationRequired.

## Why

Once M2-P9 wired the exit harness to run the full gate set on every delivery-doc
PR, the citations gate began checking the historical record. A record's
`path:line` references were valid when written and drift as code moves;
requiring them to resolve against code at head re-litigates settled history and
made the whole M2 review backlog unlandable (41 docs). A record is a record;
the anti-fabrication value of the gate is on forward-claiming docs whose claims
must hold against current code. Those stay fully gated.

## Verification (red-witnessed by the implementer and re-checked by the orchestrator)

- A forward doc (plan/decisions/...) carrying an UNRESOLVING made citation
  still reds (`src/nope.ts:999`): anti-fabrication preserved.
- A `delivery/review/` doc with an unresolving citation no longer reds: records
  not gated.
- The M2 paperwork batch passes citations under the new config.
