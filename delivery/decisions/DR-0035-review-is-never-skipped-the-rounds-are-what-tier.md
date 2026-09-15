# DR-0035: review is never skipped; the fix-round count is what tiers

- id: DR-0035
- project: tiphys-kernel
- task: pstack borrow review, raised as D1 in
  delivery/plan/pstack-borrow-review.md
- question: A proposed rule sized assurance by change size and declared impact,
  and its lowest tier sent a change to no review at all. Does the owner accept
  that some changes ship unreviewed?
- reversibility: reversible in the direction that costs nothing (tightening a
  cap is a one-line change) and expensive in the other (a defect that ships
  unreviewed is found by a user)
- vetoable: no, this is the owner's own instruction
- revert-cost: one line per cell in the table, plus the phases already run
  under it
- status: **DECIDED BY THE OWNER, 2026-09-15.**
- decided: every change is reviewed; the tiering is on the number of fix rounds;
  one round is the floor
- date: 2026-09-15

## The decision, in the owner's terms

> every change needs a review. The tiering on review is on the number of back
> and forths between reviewer and fixer. 1 round is the bare minimum

Two things follow, and the second is the one that changes the design.

**There is no zero tier.** The proposal in the plan document sent a
zero-subject change to no reviewer. That is refused. Every change gets at least
one round.

**The dial is the fix-round count, not the assurance mode.** The proposal
tiered which of `full`, `direct-pr` and `local-only` a change earned. That was
the wrong dial. What tiers is how many times findings go back to the
implementer and come back to the clean-room reviewer.

The two roles are named as the shipped vocabulary names them
(schemas/role-brief.schema.json:24 opens the closed six-value role enum, and
schemas/role-brief.schema.json:30 is `clean-room-reviewer` itself):
`clean-room-reviewer` and `implementer`. The unit is the FIX ROUND, which
CLAUDE.md already treats as a first-class concept with its own contract at
CLAUDE.md:333, and which checklists/clean-room.yaml:38 already scopes probes
to.

## The table

| | low impact | high impact |
|---|---|---|
| zero subject | 1 round | 1 round |
| small subject | 1 round | 2 rounds |
| large subject | 2 rounds | 3 rounds |

Subject size is value plus assurance lines with paperwork excluded. Impact is
declared before the work and carries a floor: a change touching a declared
high-impact path may not be called low impact.

## Why this is better than what it replaces

Stated at length because the replaced version was mine.

**It removes a governance defect.** The mode-tiering version silently narrowed
a condition of the DR-0012 grant: delegated merge authority is conditional on
two independent clean-room reviews of the current head
(delivery/decisions/DR-0012-delegated-merge-authority.md:22), and a change
routed to no review has no such pair. DR-0012:40 puts an owner-reserved
condition outside what the orchestrator may change. Tiering the ROUNDS leaves
that condition untouched, because the first review always happens. An
adversarial reviewer found this, not the author.

**The cap is a cap, not a target, and the number that justifies it is already
measured.** A throughput analysis of M1 counted sixteen completed fix rounds;
thirteen were re-reviewed and TWELVE OF THOSE THIRTEEN produced a new finding
attributable to the round itself (CLAUDE.md:335). A fix round is a change, and
a change needs reviewing, so round N+1 largely exists to check round N. Rounds
are not monotonically improving and a budget is not stinginess.

**The ceiling of three is derived rather than chosen.** DR-0012:34 already
stops a delegated merge at "more than two fix rounds after its first dual
review", so two is this repository's own existing constant and the table
generalises it. Observed at the extremes: the phases that took one round
shipped without incident, and the recorded costs ran to four (M1-P5, M1-P6),
five (the DR-0027 loop) and ten (M3-P3).

## What happens at the cap

Not a further round. DR-0016 already decided it: a fresh implementer plus a
third review contract, dispatched immediately, with the owner notified
asynchronously. The property being protected is that something DIFFERENT
happens, and the measured evidence recorded there is that the fresh
implementer, and not the owner decision, was the half that worked.

## What this does NOT decide

- **It does not change how many reviewers see one head.** DR-0012's dual
  cross-model condition stands untouched. This is about iteration, not about
  how many pairs of eyes the first round has.
- **It does not put a threshold in the kernel.** DR-0029:50 settles that the
  kernel ships no command and no threshold. The table above is this project's
  declaration; the kernel would ship at most the contract for expressing one.
- **It does not decide where the selector runs.** Wiring it into dispatch is a
  `.claude/` procedure change; wiring it into `assurance-modes.yaml` belongs to
  M4's pilot-bootstrap workstream and to M4's mandatory intake
  (delivery/plan/kernel-plan-v1.md:368).

## Evidence

The selector implementing this table, its tests, and the red witness for the
floor live in the sandbox repository at `tools/value-ratio/assurance-tier.mjs`.
Measured 2026-09-15 on node v22.22.2: 18 tests, 18 pass, 0 fail, 0 skipped.
Dropping any cell to zero reddens two tests; raising a cell above three reddens
the same two.
