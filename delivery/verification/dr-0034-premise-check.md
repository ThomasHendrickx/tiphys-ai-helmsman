# DR-0034's premise, checked against the repositories it describes

- date: 2026-08-20
- checked by: orchestrator
- subject: delivery/decisions/DR-0034-pulse-is-the-pilot-and-the-controls-are-cut.md:1
- outcome: **the decision stands; two of its factual statements do not.**

## Why this document exists rather than an edit to DR-0034

A decided owner decision record is never reopened, and this does not reopen
one. Both of DR-0034's decisions are unchanged: the pilot is `pulse`, and the
three falsification controls are cut. What is corrected here is the record's
description of the WORLD at the time it was written, which was wrong in a way
that would mislead the next reader about what the project still owes.

## What was measured

Clones of both repositories, fetched into this container on 2026-08-17 and
re-probed against the GitHub API on 2026-08-20. Every path named below with
backticks is in one of those repositories and deliberately does not resolve
here.

| probe | result |
|---|---|
| `ThomasHendrickx/pulse` HEAD | `1204775`, "chore: trigger production deployment after environment configuration" |
| `ThomasHendrickx/pulse` tracked files | 73, across `src/`, `delivery/`, `prisma/`, `test/`, `supabase/`, `.claude/` |
| `ThomasHendrickx/pulse-fleet` HEAD | `ebed33b`, "backlog: verdict validation tuition from M1-P1 dual review" |
| both repositories, `pushed_at` | 2026-08-19, so both were live and moving before this check |
| `ThomasHendrickx/pulse` visibility | **public** |
| `ThomasHendrickx/pulse-fleet` visibility | **public** |

## Correction 1: the pilot was already running, not waiting to start

DR-0034 is written in the future tense throughout. Line 20 of it says `pulse`
is "started from an empty directory", and its "what this buys" paragraph lists
charter, `tiphys init`, a plan written from nothing, the first phase and the
first release as things a greenfield start WILL exercise.

They had already happened. At the measured head, `pulse-fleet` carries
`charter/pulse.yaml`, `dispatch-plan-v1.yaml`, two decision records of its own,
and composed briefs for a plan writer and for two M1-P1 reviewers. `pulse`
carries an intake, `delivery/plan/pulse-v1.yaml`, an M1-P1 work history, two
M1-P1 clean-room review verdicts, and a Next.js application with a Prisma
schema and a deployed Vercel production target.

So the sentence "a greenfield start exercises the whole kernel loop" is not
a forecast in need of testing. It is a description of something that ran, in a
session this orchestrator does not own, and produced results. The record's
framing invites a reader to go and set up a pilot that exists.

**What is NOT corrected:** the cost DR-0034 states, that greenfield never tests
ADOPTING an existing codebase, is unaffected and still owed. Nothing measured
here bears on it.

## Correction 2: A-2 is satisfied in substance and violated in form

DR-0034 lists among the owner actions it creates "A-2, the private fleet
remote, which was already owed". A-2 is registered at delivery/STATE.md:1583 as
"provide or approve a private remote per real fleet home, for fleet-state
durability".

A fleet remote now exists, `ThomasHendrickx/pulse-fleet`, and it is durable:
fleet state is committed and pushed rather than living in a container. That
half is done.

**It is PUBLIC, and A-2 asked for private.** This is the one finding here that
needs an owner action rather than a note, and the reason is DR-0034's own:

> Personal finance means real account data. The `credential-scrub` gate and the
> fleet's read scope stop being theoretical at M4, because this is the first
> time they guard something whose disclosure would matter.

Stated precisely rather than alarmingly, because the difference matters:

- **No credential was found.** `notes/deployed-infrastructure.md` in the fleet
  repository names a Supabase project ref and a Vercel project id and closes
  with "No secrets in this file, ever." A Supabase project ref appears in the
  client URL of any deployed page, so it is not a secret.
- **What IS public is the shape of the system**: the fleet's dispatch plan, its
  warnings file naming which ambient credentials belong to another project, its
  decision records, and the project's full delivery paperwork.
- **The exposure that matters is FUTURE, not present.** A fleet repository
  accumulates work histories and review evidence about a personal finance
  application. The point at which that becomes account data is not signalled by
  anything mechanical, and flipping the repository after the fact does not
  unpublish what was already fetched.

**Recommendation, and it is one an agent cannot perform:** make both
repositories private now, while the cost of doing so is one setting and the
history is two days old. That the orchestrator cannot do it is measured rather
than assumed: `GET /repos/ThomasHendrickx/pulse-fleet` returns
`permissions.admin` false for this session's credentials.

## Correction 3, offered rather than corrected: the pilot has already paid

DR-0034 justifies cutting the three controls partly on the ground that "the
kernel is about to be pointed at a real project, which tests it harder than any
control does". That prediction is now measurable, and it held. `backlog.md` in
the fleet repository records three kernel defects found by USE, none of which
any gate in this repository detects:

1. `tiphys spawn` scrubs the child environment under the M2-P8 allowlist and
   ships no agent adapter, so a real agent payload cannot authenticate. The
   pilot dispatched its plan writer outside the kernel as a result.
2. `tiphys validate --type verdict --context .` cannot pass in a downstream
   fleet as documented: it resolves plan, work-history and assurance-mode
   documents at the context root, where a real project keeps them under
   `delivery/` and at the fleet root.
3. `dual-review-decorrelation` requires two distinct `produced-by` values with
   no declared override path, which the pilot's single-family agent environment
   could not satisfy. Its owner overrode the check by decision record; both of
   its reviewers escalated rather than record a false family.

**Item 3 was checked here against the kernel source rather than taken from the
pilot's report**, because it is the one of the three that is a design claim
rather than an observation:

- The per-dimension loop at src/checks.ts:3489 compares `produced-by` as an
  opaque string and raises a violation whenever one value occurs in two of the
  group's verdicts. It has no exemption arm.
- `schemas/verdict.schema.json` documents the field, at line 38, as "which model
  family produced it". So the value the check compares is specified to BE the
  family, not the model.
- The loop's own comment, at src/checks.ts:3490 onward, rules out the escape
  that exists elsewhere in the check: once a delegated grant has been
  established, an unshown dimension is refused rather than reported
  not-applicable, deliberately, because "under a grant, unshown must be
  refused".

So a single-family environment under a delegated grant has two paths and no
third: record the same value twice and fail the check, or record a value that
is not the family. **The check is strict in the right direction and offers no
honest way to satisfy it**, which is a different defect from being wrong. The
kernel's own delivery could not have surfaced it, because this repository's
delivery has had two model families available throughout.

These are recorded here as observation, not as a claim about what 0.2.0 should
contain. They are tracked in the register in delivery/STATE.md:1532 onward.

## What this document does NOT establish

- **It says nothing about the quality of the pilot's own delivery.** Its
  reviews, verdicts and merges were produced by a session this orchestrator
  does not own and has not audited.
- **It does not establish that the three defects above are complete.** They are
  what one project found in three days of use, which is a lower bound.
- **The clones are two days behind.** Both repositories were pushed to on
  2026-08-19 and the file-level readings here are from the 2026-08-17 heads.
  The visibility probe is from 2026-08-20 and is current.
