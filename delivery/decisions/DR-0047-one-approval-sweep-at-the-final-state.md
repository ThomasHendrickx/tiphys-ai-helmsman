# DR-0047: one approval sweep at the final state, not per phase

- status: **DECIDED by the owner, 2026-09-18**
- relates to: DR-0012 (delegated merge authority), DR-0027 (reviews target
  shipped value), DR-0031 (a pull request is a unit of self-contained value),
  DR-0035 (fix-round tiers), DR-0045 (pull-request and merge authority)
- narrows WHEN the review condition is evaluated. It does not weaken WHAT the
  condition is.

## The owner's decision, in their words

> "Ok, group things more. Rather cut away CI time and overhead time. Having the
> last two phases run and then doing this investigation approves the full flow
> while the approve and then 2 new phases gives more overhead in total.
>
> For now token efficiency and throughput is key. The only point in time that
> requires the approval stamp for now is the final state."

## What it decides

**The approval stamp is owed by the FINAL STATE, not by each intermediate
merge.** One review sweep over the finished milestone approves all thirty phases
at once. Reviewing twenty-eight now and then reviewing two more after M4-P24 and
M4-P25 land is strictly more work for the same coverage, and it pays for two
sweeps where one would do.

The arithmetic the owner is pointing at, stated plainly: a per-phase sweep now
covers 28 of 30 and leaves a second pass owed for the remaining 2. A sweep after
they land covers 30 of 30 in one pass.

## What changes, concretely

1. **The last two phases run FIRST.** M4-P24 and M4-P25 merge on green gates and
   their fix rounds, without waiting for a second reviewer each.
2. **The retrospective review of the sixteen unreviewed phases (T-041) FOLDS INTO
   that final sweep** rather than running as five separate group passes now.
   Groups A and B are already done and their findings stand; C, D and E move.
3. **Fewer pull requests.** Evidence, fixes and paperwork batch into as few as
   the unit-of-value rule allows. Each CI cycle is about sixteen minutes and
   branch protection serialises them, which is the cost DR-0031 already names.
4. **Findings already reproduced are still fixed NOW**, not deferred. Five HIGH
   defects are open against shipped code and two of them are security-shaped.
   Deferring the REVIEW is not deferring a known defect.

## What it does NOT change

- **It does not waive review.** The condition of DR-0012 is unchanged: two
  independent clean-room reviews on different model families, no unresolved high
  or medium finding, CI green, scope audit passing. Only the point at which it is
  evaluated moves.
- **It does not lower the gate bundle.** Every merge still needs its gates green
  and its post-merge push run observed (T-009).
- **It does not make an unreviewed state shippable.** Nothing ships, publishes,
  or enters cutover on a final state that has not passed the sweep. The owner's
  own words bind this: the final state is exactly what requires the stamp.

## The risk this accepts, stated rather than left implicit

A defect merged now is found later than it would have been, so a later fix sits
on top of more code. That is a real cost and it is the one being traded for
throughput. It is bounded by two facts: nothing runs on Tiphys before M4
completes, so no defect here is live; and the sweep is a hard gate on the final
state, so nothing escapes it, it only arrives later.

Recorded at delivery/tuition/T-041-sixteen-phases-carrying-shipped-code-merged-with-no-clean-room-review.md:1
is how the unreviewed state arose in the first place. This record is the
deliberate version of a deferral, which is a different thing from the accident
that entry describes, and the difference is that this one has an end date: the
final sweep.
