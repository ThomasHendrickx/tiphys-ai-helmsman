# DR-0031: a commit, a pull request and a CI run are three different things

- id: DR-0031
- project: tiphys-kernel
- status: **DECIDED BY THE OWNER, 2026-08-13.** Stated by the owner unprompted
  after asking why one day produced ten pull requests for two phases.
- supersedes nothing. It NARROWS how the standing "one phase, one branch, one
  pull request" rule is applied, which the orchestrator had been widening in
  practice without deciding to.
- date: 2026-08-13

## The owner's decision, in their words

> To me the philosophy of the git and merge cycles, which a PR is: a commit is a
> unit of work, a PR/merge is a full collection of units that stands on their
> own. It contains all evidence needed to deliver a unit of self contained
> value. The CI is there as enforcement to keep main green and clean, but is not
> the enforcer to use to just test if it is green. Local should always be able to
> do that before the PR opening.

And, on what happens to work that never lands:

> Evidence on phase abandoning would not fit on main. Main is of the actual work
> done. If this becomes a multi user we will encounter work that will never reach
> main and that is ok and also the wanted outcome.

## The three rules

1. **A commit is a unit of work.**
2. **A pull request is a unit of self-contained value, and it carries ALL the
   evidence for that value.** For a phase, that is the code, the work history,
   both clean-room reviews, the arbitration, any verification, and the record of
   what it merges carrying.
3. **CI enforces that `main` stays green. It is NOT how you find out whether you
   are green.** Local establishes that before the pull request opens.

Corollary from the second quote: **`main` is the record of work actually done.**
Evidence about a phase that is abandoned belongs with the abandoned branch and
does not belong on `main`. Work that never reaches `main` is a normal and
intended outcome, and it becomes more so with more than one contributor.

## What this cost, measured rather than asserted

One day, 2026-08-13: **ten pull requests, of which two were phases.** Each CI
cycle runs about sixteen minutes, and branch protection's up-to-date requirement
SERIALISES them, so the eight auxiliary pull requests cost eight sequential
cycles rather than eight parallel ones.

The breakdown, and it is what makes the rule actionable:

| pull requests | what | forced? |
|---|---|---|
| 2 | the phases themselves | correct |
| 3 | scope-declaration grants | **forced by a tool defect, see below** |
| 4 | reviews, arbitration, verification, open-items record | **policy, not mechanics** |
| 1 | owner decision records | correctly separate; not phase work |

## The defect this exposed, which is the mirror of T-019

Measured on `main` at `bdec27d`, while M3-P9 was still open:

| path | on `main`? |
|---|---|
| `delivery/review/clean-room-m3-p9-criteria.md` | PRESENT |
| `delivery/verification/m3-p9-fix-round-1.md` | PRESENT |
| `delivery/review/arbitration-m3-p9.md` | PRESENT |
| `AGENTS.md` | **ABSENT** |
| `scripts/check-dual-review.mjs` | **ABSENT** |

So `main` asserted review and verification evidence for code it did not contain.

**T-019 was a paperwork pull request that carried code which should not land**
(delivery/tuition/T-019-a-verification-branch-carried-the-code-it-was-verifying.md:1).
**This is paperwork pull requests carrying evidence about code that has not
landed.** They are one defect: the pull request's contents do not match the unit
of value it claims to deliver. The owner's framing is what makes both visible as
the same thing, and neither the scope gate nor any review caught this one.

T-019's own remedy generalises with it. It gave a mechanical pre-merge check,
`git diff --stat $(git merge-base origin/main FETCH_HEAD)..FETCH_HEAD`, and said
to stop if the file list does not match the stated subject. That check was only
ever run in one direction, looking for code in a paperwork pull request. **Run it
in both:** a pull request whose evidence describes something its diff does not
contain fails the same test.

This record also documents the applicability rule that made the same
verification-depth argument in
delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:17 worth
paying for: the cost of process is measured, not assumed.

## What changes

**Immediately, by rules edit:**

- Local green before opening a pull request, including merging `main` in locally
  and running the union. This is not a weaker substitute for the CI run: it is
  STRONGER. The pull-request run tests the union with the base AS OF THAT RUN,
  and building the union by hand is what found two failures in M3-P6 that
  neither branch's CI could see.
- **If CI tells you something you did not already know locally, that is a defect
  in the local procedure, not a normal outcome.** It is a signal to fix the
  procedure, not a reason to push again.

**By code change, assigned to M3-P11:**

- `delivery/review/<phase>*`, `delivery/review/arbitration-<phase>*` and
  `delivery/verification/<phase>*` become standing pre-authorized extras
  alongside `test/behaviors.json` and the work history, so a phase's evidence
  rides in the phase's own pull request. The list is at `src/gates/scope.ts`, in
  shipped code, which is why this is a phase and not a rules edit. The
  orchestrator initially told the owner it was a rules edit and was wrong.
- The scope gate reads the phase declaration from the merge base AND from the
  head, and reports an ADDITION as a loud named diff for the reviewer to sign
  off, rather than as a hard red. Today it reads the merge base only, which is
  why a declaration amendment can never ride with the phase that needs it: three
  of the day's ten pull requests existed for nothing else.

## What genuinely still needs CI, so the rule is not overstated

Two things, measured:

- the macOS smoke job, which is a different operating system;
- the M1 exit test in FULL mode, because `gh` is not usable in this container
  (`gh auth status` reports the token invalid and GraphQL is refused).

Everything else in the gate bundle runs locally on the floor-satisfying
toolchain. That is a short list, and it is the point: CI is the record, not the
test loop.

## What this record does NOT establish

- **The new way is not fully available yet.** Scope-grant pull requests remain
  necessary until M3-P11 ships the both-declarations read. Until then the rule
  is aspirational for that one case and the count will not fall all the way.
- **It does not measure the saving.** Four fewer pull requests per phase is
  arithmetic from one day's breakdown, not a measurement across phases, and
  phases differ.
- **It does not address the serialisation itself.** Branch protection's
  up-to-date requirement will still force one CI cycle per merge; this record
  reduces the NUMBER of merges, not the cost of each.
- **Nobody has checked whether other pull requests on `main` carry evidence for
  unlanded code.** The M3-P9 instance above was found by inspection prompted by
  the owner's question, not by a sweep, and no sweep has been run.
