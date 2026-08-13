# Arbitration, M3-P9: two reviews, one agreement, one disagreement, one finding neither owns

- date: 2026-08-13
- arbitrator: orchestrator
- reviews: `delivery/review/clean-room-m3-p9-criteria.md` (criteria lens),
  `delivery/review/clean-room-m3-p9-hazard.md` (hazard lens), both landing in
  this same batch
- both verdicts: REQUEST CHANGES
- outcome: fix round 1 of a hard maximum of two (DR-0027)

## Where they agree, and it is the blocker

Reviewer A's CR-001 is HIGH and uncontested. `dual-review-decorrelation` reads
each dimension with a default and compares for distinctness without first
establishing the value was present, so ABSENT and PRESENT-BUT-DIFFERENT collapse.

The direction is the bad one: **it fails OPEN.** A correlated review pair, which
is precisely what the decorrelation requirement exists to refuse, is authorised
to merge. Three structurally different members were measured red-expected and
green-observed, and the both-omitted control correctly reddens, which is what
makes it a class rather than a typo.

This is squarely M3-P9's, squarely shipped (`src/checks.ts`, shipped as
`dist/src/checks.js`), and squarely on a real user path. It blocks under
DR-0027's reachability test with nothing to weigh.

## Where they disagree: the two unshipped scripts

Same fact, two severities. `AGENTS.md` ships and names
`scripts/check-agents-references.mjs` and `scripts/check-dual-review.mjs`;
`scripts/` is not in `package.json` `files`.

| | reviewer A (CR-002) | reviewer B (H-1) |
|---|---|---|
| severity | MEDIUM | HIGH |
| reasoning | the class pre-exists on `main` and package completeness is M3-P10's | both of this phase's new gates fail for every consumer, and one failure is silently masked |

**Ruling: MEDIUM, and the round fixes only the narrow part that is this phase's
own.** The reasoning, rather than a split difference:

Reviewer B is right about the observed behaviour and its measurement is the
better one: it built the real tarball, installed it into a fresh consumer
project, and ran the commands the shipped documents instruct a consumer to run.
That is the strongest form of evidence available here and it found a real
failure.

Reviewer A is right about ATTRIBUTION, and attribution is what decides a merge.
Measured independently by the orchestrator against the M3-P9 head:

| path | in `package.json` `files` |
|---|---|
| `gate-registry.yaml`, `AGENTS.md`, `roles/`, `dist/` | yes |
| `scripts/`, `src/`, `bin/` | **no** |

So the shipped registry has named commands absent from the package since M2.
Eleven gates already did this before M3-P9 existed, `manifest-self-check`
included. M3-P9 adds two more and, separately, adds `AGENTS.md` to `files`.

**That second act is the only part that is genuinely new**, and it is the part
the fix round is scoped to: a shipped document should not promise a file the
package does not contain. Making M3-P9 fix the whole packaging shape would be
scope creep of the exact kind that cost this project a measured day, and fixing
only its own two gates while eleven identical ones remain would be the
fix-the-instance-leave-the-mechanism error recorded four consecutive times in
`delivery/tuition/T-020-four-rounds-each-reintroduced-the-mechanism-they-closed.md`.

The whole-package-shape question is M3-P10's and it is a real decision, not a
chore: `dist/` is the built artifact that already ships, so shipping `scripts/`,
`src/` and `bin/` alongside it creates two truths. The orchestrator's
recommendation, recorded here so M3-P10 does not restart the analysis, is that
gate commands should invoke through the shipped built artifact rather than the
package growing a second copy of its own sources. That is a recommendation, not
a decision, and M3-P10 owns it.

## The finding neither review owns, and it is the one that will outlive this phase

Reviewer B's root-cause work produced something larger than the finding it was
attached to. In the gate runner, a command that FAILS TO EXIST is reported as
`not-applicable`, indistinguishable in the printed line from a legitimate
"precondition unmet" skip, because the precondition evaluator treats a command
as "could not run" only when the LAUNCHER fails to spawn, not when the script it
launches is missing and exits 1.

**A crash that prints as a skip is a guard that cannot go red.** This repository
has paid for that shape at least four times: a watchdog that tested existence
rather than freshness, a control-character check blind to NUL, a watchdog
pointed at a subset of an agent's paths, and an expired monitor that could not
fire. Every one was green and worthless.

It is not M3-P9's: it is M2-P1 era code in the gate runner, and it is
deliberately OUT of the fix round's scope so the round does not sprawl. It is
recorded in `delivery/review/tracked-findings-register.md` with the reachability
argument attached, and it is flagged to the owner rather than filed silently,
because a conditional gate reporting `not-applicable` is currently not
trustworthy anywhere in this system, including in the evidence this process
quotes at itself.

## What this arbitration does NOT establish

- **It does not re-derive either review.** The severities are weighed from the
  reviewers' own measurements. Only the packaging table above was measured by
  the orchestrator, and only because the disagreement turned on it.
- **It does not settle the package shape.** It records a recommendation and
  names M3-P10 as the owner. A recommendation that nobody has argued against is
  not a decision.
- **It does not bound the CR-001 class.** Three members were measured. Nobody
  has enumerated every site in the shipped surface where a value is read with a
  default and then compared; that enumeration is what the fix round owes, and
  its absence here is why the round owes it rather than the arbitration
  asserting it.
