# DR-0060: pulse's CI push run counts as the M4 deploy verification

- id: DR-0060
- status: DECIDED
- decided-by: owner, 2026-09-25, in the orchestrator session
- raised-by: M5-P1, Part 3 of the M4 exit test on pulse, row 5
- relates-to: DR-0037, DR-0041, DR-0042, DR-0016

## The situation

The M4 exit test asks that the pilot's next phase be "merged and
deploy-verified entirely on v1" (delivery/plan/kernel-plan-v1.md:368). It was
re-run against pulse M3-P5 (pulse PR #25, merge `35d2e55`). Four of its five
pre-written rules are met. Row 5, deploy verification, is NOT MET as the rule
was written (delivery/verification/m4-exit-test-pulse.md:492). The rule asked
for "the pilot's own deploy-verification evidence for the merged sha, read
from its pushed files" (delivery/verification/m4-exit-test-pulse.md:273).

The facts behind row 5, all read-only from pulse:

- Pulse's `charter.yaml` leaves `release-verification` at `mode: reserved`.
  Its note says the shape is undecided (pulse DR-0014) and names a working
  candidate: "the Playwright golden journey plus the fast gate, green on the
  release commit".
- Pulse CI (added in pulse PR #24) ran on the push of `1796ff8` to pulse
  `main`: run 36035853808, fast gate success and Playwright slow gate
  success.
- `1796ff8` differs from the M3-P5 merge `35d2e55` only in three records
  files (two round-two verdicts and the work history). So the code under
  that run is the merged release commit's code, byte for byte.
- The push run at `35d2e55` itself was cancelled by the push of `1796ff8`
  (pulse's CI concurrency group), the shape at CLAUDE.md:538.
- Vercel production deployments of both `35d2e55` (id 6643693281) and
  `1796ff8` (id 6644236912) report status `success`.

No further evidence could come from this repository: DR-0037 forbids writing
to the pilot, so the only way to meet row 5 as written was for pulse's owner
to decide pulse DR-0014 and for the pilot to push a record.

## The question put to the owner

The orchestrator proposed, on 2026-09-25: "Nothing more is needed from pulse.
I count pulse's CI run as the deploy check and record the decision here. Then
the M4 exit test passes." The owner answered: "Ok".

## Decision

For the M4 exit test on pulse M3-P5, pulse's post-merge CI push run at
`1796ff8`, run 36035853808 (fast gate plus the Playwright golden journey, both
success), is accepted as the deploy verification.

The reasons:

1. It is the check pulse itself names as its release-verification candidate.
2. It ran green on a commit whose code equals the merged release commit
   `35d2e55`; the only differences are three records files.
3. Both commits were deployed to production by Vercel with status `success`.

So row 5 is MET by this decision, and with rows 1 to 4 already met the M4 exit
test is discharged. The evidence document keeps its NOT MET analysis as the
record of why this decision was needed.

## What this decision is NOT

- It does NOT decide pulse DR-0014 for pulse. Pulse's charter still reads
  `release-verification: mode: reserved`. That choice belongs to pulse's owner
  and pulse's own session, and nothing here changes it.
- It does NOT claim a verification against the deployed site. The Playwright
  slow gate in pulse CI runs against a local stack, not against the Vercel
  deployment. The deploy-verify wrapper `playwright.deploy.config.ts` exists in
  pulse and no CI job runs it.
- It does NOT turn a CI run into "pushed files". The rule as written asked for
  pushed files; the owner accepted the CI run in their place. That is a
  relaxation of the rule, taken by the owner, and it is recorded as one rather
  than relabelled (the green-without-delivery hazard,
  delivery/plan/value-delivery-plan.yaml:89).
- It does NOT set a rule for later milestones or other projects. It settles
  this one exit test.

## Residue, carried rather than lost

- Both round-two review verdicts for pulse M3-P5 are one model family. That
  meets pulse's own DR-0003 ("same family, varied lenses"), not this
  repository's DR-0012.
- The round-two verdicts were committed 37 seconds after the merge, by the
  pilot's design. That the reviews preceded the merge is the pilot's own
  recorded claim, plausible from the timing, not observed.
- The push run at `35d2e55` was cancelled. Row 4 rests on T-009's
  cancelled-run discharge (CLAUDE.md:548).
