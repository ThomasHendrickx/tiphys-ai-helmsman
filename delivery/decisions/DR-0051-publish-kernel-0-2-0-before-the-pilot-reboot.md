# DR-0051: publish kernel 0.2.0 before the pilot reboot, and read the pilot over the API

- id: DR-0051
- status: DECIDED
- decided-by: owner
- date: 2026-09-23
- supersedes: nothing
- relates-to: DR-0008, DR-0024, DR-0037, DR-0042, DR-0049

## The questions

M5-P1 stopped at owner action A-14, the pulse reboot, with two open questions
(delivery/plan/value-delivery-plan.yaml:28 is the phase):

1. The only published kernel is `@tiphys/kernel` 0.1.0, from 2026-08-15, and
   both pulse-fleet and the kernel fleet pin it. It predates every M4 merge, so
   a pilot phase run on it says nothing about M4.
2. The read-only pilot probe exits 3 because GitHub's REST API refuses reads of
   `pulse` and `pulse-fleet` from a session that has not attached them. Git
   reads worked. The API is where the pilot's check runs and deployments live,
   which M5-P1 needs to verify.

## The decisions

1. Owner, 2026-09-23: "publish kernel 0.2.0". The release is cut from `main`
   through the existing release workflow (`.github/workflows/release.yml`,
   manual dispatch, OIDC per DR-0024), after a version-bump pull request
   merges green.
2. The owner attached `ThomasHendrickx/pulse` and `ThomasHendrickx/pulse-fleet`
   to the orchestrator session on 2026-09-23. That grants push credentials. It
   does NOT change DR-0037: this orchestrator still writes nothing to the pilot.
   The credentials are used for REST reads only, and the probe's own chokepoint
   (GET only, git `ls-remote` and depth-1 `clone` only) is unchanged.

## What this does not decide

- Moving pulse-fleet's pin from 0.1.0 to 0.2.0 is a pilot-side change, made by
  the pilot's own session after the reboot, not by this orchestrator.
