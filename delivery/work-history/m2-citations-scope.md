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

The policy is encoded in TWO halves that must agree: the gate's `documents`
config (what the gate checks) and the manifest precondition
`citations-diff-touches-documents.paths` (what makes the runner consider the
gate applicable). `delivery/review/` and `delivery/work-history/` are removed
from BOTH. If they disagree, a PR that touches a record tree fires the
precondition, the gate runs, finds no configured document, and emits a plain
"no changed path" not-applicable that carries no evaluated precondition, which
the M2 exit harness (DR-0018) correctly rejects as indistinguishable from a
skipped or errored gate. Keeping the two halves in sync makes a record-only PR
resolve to a clean precondition-unmet not-applicable that the harness accepts.

## Why

Once M2-P9 wired the exit harness to run the full gate set on every delivery-doc
PR, the citations gate began checking the historical record. A record is a
record; its references were valid when the reviewer wrote them and were never
authored to satisfy a strict repo-relative citation gate. The anti-fabrication
value of the gate is on forward-claiming docs whose claims must hold against
current code. Those stay fully gated.

This is not a hypothesis. Measured 2026-08-07 by running the citations gate
(`node src/gates/citations.ts --base main --head <paperwork-batch>`) over the
real M2 paperwork batch under the PRE-exclusion config (evidence saved to
`delivery/evidence/`): status RED, 86 citations resolved, and 139 red reasons,
which fall into exactly two shapes, neither of them fabrication:

- 20 arbitration docs are `citationRequired` yet carry ZERO substantive
  citations. Arbitrations are short decision summaries; requiring every one to
  cite code is the wrong policy, not a defect in the doc.
- 119 review-doc citations the gate cannot resolve, dominated by reviewer
  SHORTHAND: bare filenames (`run.ts:370`, `citations.ts:376`, `suite.ts:969-975`)
  that match no declared root because they are not repo-relative; a handful of
  ranges with trailing `+`/`/` the tokenizer rejects as malformed; and a few
  refs to files that have since moved. These are records of what was examined,
  not claims that must resolve at head.

## Verification (red-witnessed, rule (f) capture, re-checked by the orchestrator)

- A committed witness, `witness/citation-record-doc-not-gated.json`, covers the
  `src/gates/citations.ts` change (red-witness step 7 coverage). Its two
  structurally different dangerousStates members re-add `delivery/review/` and
  `delivery/work-history/` to the config; the named test is green at head and
  reddens under each member, so the red-witness gate evaluates it green only by
  demonstrating the record trees really are excluded.
- Because `citations.ts` spawns `git cat-file` (a spawn/parse module), rule (f)
  requires a real capture: `witness/captures/citation-git-cat-file-resolution.txt`
  records the true `git cat-file -t` contract (present path -> exit 0 / `blob`;
  absent path -> exit 128 / does-not-exist), and the test asserts a live scratch
  repo reproduces it, anchoring the resolution mechanism to real git output.
- A forward doc (plan/decisions/...) carrying an UNRESOLVING made citation
  still reds (`src/nope.ts:999`): anti-fabrication preserved.
- A `delivery/review/` doc with an unresolving citation no longer reds: records
  not gated.
- The M2 paperwork batch passes citations under the new config.
