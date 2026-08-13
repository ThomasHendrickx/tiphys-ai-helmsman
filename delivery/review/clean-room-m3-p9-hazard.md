# Clean-room review, M3-P9, hazard lens (reviewer B)

Branch under review: `claude/m3-p9-agents-policy`, head `d9d5a1d`, PR #131.
This review's own branch: `claude/review-m3-p9-b`, cut from `origin/main` at
`12f84f9`.

Lens: what does a CONSUMER of the published npm package get wrong because of
this. A second reviewer is walking the acceptance criteria as a contract
concurrently; this review does not duplicate that.

Status: IN PROGRESS, appended incrementally.

## What this review does NOT cover (read this first)

- `scripts/`, `test/`, `.github/`, the gate registry, and anything under
  `delivery/` are out of scope per owner decision DR-0027 (shipped-value
  ruling). Findings there are noted only if they make a SHIPPED artifact
  wrong; otherwise not investigated.
- CI status is not read (`gh` returns 401 against REST in this environment;
  polling would fail silently, so it is not attempted at all).
- This review does not re-walk the phase's acceptance criteria as a
  contract; that is the concurrent reviewer's job.
- Coverage of the shipped check is by direct construction of a handful of
  fixture shapes (correlated pair, decorrelated pair, malformed/empty
  input), not exhaustive fuzzing.

(This section will be amended if further gaps are found during the review.)

## Environment measured

