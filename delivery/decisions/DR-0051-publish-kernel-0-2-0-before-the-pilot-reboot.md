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

## Correction to question 2, recorded by M5-P1 on 2026-09-23

The probe's exit 3 had two causes, not one. Attaching the pilot repositories
was needed, and so was `NODE_USE_ENV_PROXY=1`: Node's built-in `fetch` ignores
`HTTPS_PROXY` without it, went to GitHub anonymously, and got a rate-limit 403
that the probe reports the same way as an authorization refusal. With both, the
probe exits 0. The full account is in M5-P1's work history on its own branch.

## Fix round on this pull request, 2026-09-23

The first CI run on this pull request went red on `red-witness`, run
35834593066. Stored witness `plugin-runtime-packages-declared-for-consumers`
has a mutation member whose find text quotes the plugin's peer dependency line
`"@tiphys/kernel": "^0.1.0"`, and the bump changed that line to `^0.2.0`.

- Mechanism: a stored witness mutation whose find text quotes a line that a
  version bump rewrites. Any such member stops matching and the gate errors.
- Derivation: a script read every `witness/*.json`, took each member of kind
  `mutation`, and checked that its find text occurs in its file at this head.
  Before the fix: `mutation members checked 704, missing 1`, the member above.
  After replacing `^0.1.0` with `^0.2.0` in that find text: `missing 0`.
- Not covered: the 11 members of kind `patch` were not checked by that script.
  The gate itself re-evaluated every stored witness touching this diff (3) and
  named only this one. Documents that mention 0.1.0 as history (decision
  records, STATE, captures under `witness/captures/`) were deliberately left
  alone, since they describe the 0.1.0 release.
- This should have been found before opening the pull request (DR-0031): the
  local PR bundle was not run for a change judged to be three version lines.
  Cited rule: CLAUDE.md:1 is the rules file that requires it.
