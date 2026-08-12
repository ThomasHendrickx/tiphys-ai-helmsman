# M3-P6 merge readiness: DR-0012's six conditions walked, before they are needed

Written while M3-P6 is blocked, so that no condition is discovered unmet at
merge time. This project has twice found a missing precondition under merge
pressure, which is the worst moment to find one.

## The six conditions, each with its evidence or its gap

| # | condition | state |
|---|---|---|
| 1 | two independent clean-room reviews of the current head, different model families, committed | **MET** for `077f339`. Both are on `main`. |
| 2 | no unresolved high or medium finding | **MET as of the reviews.** Fix round 2's delta verification returned VERIFIED with two LOW, merged as `9781212`. |
| 3 | both reviewers given the acceptance criteria as contract, and both walked or executed them | **MET**, recorded in the review files. |
| 4 | **CI green on the EXACT head being merged** | **NOT MET, and this is the live gap. See below.** |
| 5 | scope audit passes | **MET at 24 of 24 files** on `077f339`, and the declaration has since been amended to add `test/m2-exit-test.test.ts`, so the fix round's extra file is already covered. |
| 6 | arbitration recorded where reviews disagree | **MET.** |

So five of six hold and the sixth is the one the fix round exists to restore.

## Condition 4 is subtler than it reads, and this is the part worth carrying

**A `pull_request` run does NOT test the branch. It checks out the MERGE REF,
so it tests the UNION of the branch with its base.** That is a strength: it means
the PR arm has been testing integration all along.

**But it tests the union with the base AS OF THAT RUN**, and a run is not
re-triggered when the base moves. Measured now:

| thing | value |
|---|---|
| M3-P6 head | `077f339` |
| base recorded on the pull request | `307ed2f` |
| `main` today | `7784c47` |
| commits `main` has gained since that base | **14** |

So M3-P6's green certifies a union that **no longer exists**. It is not a false
green; it is a green about a different question than the one merging now asks.

**This is the third member of the T-009 family and the one that actually bit.**
T-009 says a gate result is evidence only for the configuration it ran under,
and names the CI EVENT as the thing that varies. Two more axes have since been
paid for: the head sha (a green on an earlier head is not a green on this one),
and now **the BASE**. The complete sentence for a pull-request green names the
event, the head AND the base.

The proof that this is not theoretical is that building the union by hand found
two failures that this green does not see, at
delivery/verification/m3-p6-and-the-harness-only-fail-together.md:1.

**Branch protection's up-to-date requirement is the only mechanism that forces
the base current**, which is why updating a behind branch costs a CI cycle and
why that cost is not waste. It is the run that asks the current question.

## What restores condition 4, in order

1. Harness round 4 closes DV3-F1 and its branch merges. It edits both files
   M3-P6's fix round needs, so it goes first.
2. M3-P6's fix round 3 lands the two fixes, brief pre-written at
   delivery/plan/m3-p6-fix-round-3-dispatch.md:1.
3. `main` is merged into M3-P6 and the union is REBUILT and re-measured. The
   existing measurement was taken at one pair of heads and does not carry
   forward past step 1.
4. CI runs on that head, with a current base, and is read BY STEP.
5. The post-merge `push` run on the new `main` head is read by step (T-009
   rule 1). No pull-request run discharges it.

## What this walk did NOT cover

- **It reads the conditions, it does not re-execute the reviews.** Conditions 1,
  2, 3 and 6 are taken from the committed review and arbitration files rather
  than re-derived, so a defect in those files is invisible here.
- **Condition 5 is asserted from the last recorded scope run**, not re-run. The
  head has not moved since, but the declaration HAS changed, and the gate reads
  the declaration from the merge base rather than the head.
- **It assumes the two known union failures are the whole set.** The union run
  reported two and stopped reporting nothing further; fixing either could expose
  more, and only a green run establishes a green.
