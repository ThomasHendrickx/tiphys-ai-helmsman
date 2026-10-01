# T-049: a witness went stale through a pull request the gate skipped

- id: T-049
- date: 2026-09-30
- phase: M6-P6, found at M6-P5's pull request

## What happened

M6-P6 (`1c95cfe`) rewrapped tuition text that the stored witness
`witness/mechanism-index-claim-file-rule.json` mutates. M6-P6's pull request
touched no `src/`, `bin/` or `plugin/` file, so the `red-witness` gate's
precondition (`red-witness-diff`, `diff-touches src/ bin/ plugin/`,
gate-registry.yaml:103-109) was unmet and the gate reported not-applicable
on both events (push run 36777401327). The stale spec surfaced one pull
request later, on M6-P5 (#233), whose `src/` change made the gate run; it
could not pass there either, and was removed (DR-0061).

## The mechanism

The gate decides whether to run from the paths the change touches, but a
stored witness depends on files outside those paths: the files it mutates
and the tests it runs. A change to only those files never runs the witness
that depends on them.

## The rule

A gate's precondition must cover every file its subjects depend on, not
only the files its `prevents` names. Until the red-witness precondition also
matches the files stored specs mutate or run, a pull request that edits such
a file outside `src/`, `bin/` or `plugin/` leaves its witnesses unchecked.
Proposed fix, not in the M6 plan: add those files to the precondition (the
pull-request arm already selects stored specs by exactly that set).

## Second instance (found at the M6 close)

PR #211 (2026-09-23) added two witnesses for `scripts/release-verify.sh` and
touched no `src/`, so neither was ever evaluated. The first full sweep on
push (run 36792621178, `main` 568b9f3) found one collapsing under rule (g)
and the other's members 1 to 4 staying green. Both were removed (3749abf).
A witness for a file outside the precondition's paths is unchecked from the
day it lands.
