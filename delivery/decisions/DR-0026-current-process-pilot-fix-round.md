# DR-0026: Current-process pilot fix round

- id: DR-0026
- project: tiphys-kernel
- task: macos-portability-pilot
- question: May the current delivery process resolve the three feature-code
  findings from the first review of the controlled pilot without launching a
  second Tiphys subprocess?
- reversibility: reversible; the fix remains on the delivery PR until review,
  CI, and merge authority approve it
- status: decided by the owner
- decided: authorize the current delivery process to resolve the three review
  findings on PR 89 without another Tiphys subprocess
- date: 2026-08-11

## Owner authorization, recorded verbatim

> Authorize the current delivery process to resolve the three review findings
> on PR #89 without launching another Tiphys subprocess. This is fix-round and
> recovery work within the existing controlled pilot and does not expand
> Tiphys authority, constitute M4 cutover, or accept the unfinished harness
> adapter. After the fixes, use independent Codex clean-room reviews if the
> Claude-family reviewer remains unavailable.

## Effect on the pilot boundary

DR-0025 still authorizes exactly one Tiphys-managed synchronous subprocess.
That subprocess already ended and no second one is authorized. This decision
changes only who may implement the three review fixes: the current delivery
process may edit the already declared feature and test scope on the existing
Tiphys task branch and commit it there. The current process then advances the
separate `codex/macos-portability-pilot` delivery branch and PR 89 to that same
audited commit. The task branch remains intact as pilot evidence until Tiphys
teardown.

Planning, review, credentials, PR, merge, recovery, and teardown arbitration
remain outside Tiphys. The fix must pass the original pilot acceptance
criteria, two independent reviews of the current committed head under distinct
review briefs, Linux required CI, and the macOS smoke workflow before merge.
Both review outcomes must be written under `delivery/review/` and committed
before merge. If the Claude-family reviewer remains unavailable, two fresh
Codex reviews are the owner-approved fallback; only model-family diversity is
waived, not the review count, independence, current-head requirement, or
committed evidence. This decision does not accept the temporary adapter or
make any M4 claim.

## Findings in scope

1. Add an explicit scope-gate witness for the logical macOS `/var` alias,
   expected exit 21, and written error record.
2. Prove the Apple Git prefix-system `osxkeychain` precondition before relying
   on the credential scrub witness.
3. Make the authored-byte checker inspect tracked Git bytes without following
   symlink targets, with direct tests. Fail-closed test coverage required to
   make that third fix reviewable is part of the same finding.

The standing Linux red-witness gate also requires mutation coverage for every
changed source file. The original pilot scope omitted its witness artifact, so
the current process may add only
`witness/macos-portability-identity-and-scrub.json`. This is verification
scaffolding for the already authorized source changes, not a fourth feature
finding or an expansion of Tiphys authority.
