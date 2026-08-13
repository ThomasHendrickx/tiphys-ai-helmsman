# Tracked findings register

DR-0027 changed what happens to a finding that does not reach a shipped
artifact: it is RECORDED AND TRACKED rather than sent to a fix round. That
creates a durability gap the decision itself does not close. A finding whose
only home is a review document nobody re-reads, or worse a merge commit
message, is a finding that has been lost politely.

This file is that home. It is the single place a later reader looks to answer
"what did we knowingly not fix, and why".

Rules for this file:

- A finding leaves this register in exactly two ways: it is FIXED, with the
  commit that fixed it named, or it is REFUTED, with the measurement that
  refuted it named. Nothing is removed for being old.
- The "why not blocking" column states the DR-0027 test that was applied, which
  is REACHABILITY to a shipped artifact or a real user path, not the severity
  label.
- A finding that is contested is recorded as contested, with the argument. An
  agreed finding and a disputed one are not the same thing and the register
  must not flatten them.

## M3-P7, merged carrying these

Merged at `2a3892b`.

| id | what | why not blocking |
|---|---|---|
| H-3 / CR-02 | a checklist framing whose `orders-probes` scopes name no probe, so it validates nothing and reorders nothing | found independently by BOTH reviewers, so the fact is not in doubt. It is a no-op field in a shipped schema, not a wrong answer from a shipped command |
| H-4 | editing a shipped checklist's `id` silently disarms direction 1 of `gate-probes-resolve` | reachable only by a future editor of the checklist, which is the exact shape DR-0027 rule 2 names as a tracked item |
| CR-01 | acceptance criteria 1 and 4e name a command that needs `--context` | wrong text in the plan, not wrong behaviour in the package |
| CR-03 | `verifies-gate` may name a gate that no checklist verifies | a missing cross-check. No shipped artifact is wrong because of it |

## M3-P8, on the branch at the time of writing

Reviews are `delivery/review/clean-room-m3-p8-criteria.md` and
`delivery/review/clean-room-m3-p8-hazard.md`, both landing in this same batch.

| id | what | why not blocking |
|---|---|---|
| CR-2 | `tuition-ids-unique-across-directories` is green on the exact collision its message names | a guard that does not guard. It makes no shipped output wrong today |
| HRB-2 | retention says "present and tracked" but only runs `git check-ignore` | **CONTESTED, see below** |
| HRB-3 | the generator does not round-trip its own output | affects a regeneration path, not a consumer of the package |
| HRB-4 | `driftLines` is set-keyed, so a duplicated line leaves both sets unchanged | the T-020 multiplicity mechanism again. Same site class as the open item in `scripts/render-agent-rules-gates.mjs` |
| HRB-5 | `listEntryFiles` filters `.yaml` only and silently drops `.yml` | no shipped entry uses `.yml`. It is a trap for a future author, not a present wrong answer |
| HRB-7 | `tuition-target-exists` accepts a dangling symlink and resolves outside the context | narrowed by the round 3 fix to HRB-8, which changed how context is established. Re-measure before acting |
| HRB-9 | `tuition add --dir` is silently ignored | a CLI flag that does nothing is a real defect and it is a wrong answer to a user. Recorded here because the branch is at its round cap, NOT because it fails the reachability test |
| 3 LOWs | from reviewer A | severity LOW, no reachability argument offered by the reviewer |

### HRB-2 is contested, and the contest is recorded rather than resolved

The round 3 implementer argued HRB-2 belongs with the three ship-breakers it
was sent to fix, on the grounds that it is the same mechanism ("a message word
that no condition decides") and that the harm is the one R-098 exists to
prevent. Its constructed input on a real fleet:

```
git ls-files --error-unmatch notes/work-history/keep.md  -> exit 1 (NOT tracked)
git check-ignore -q -- notes/work-history                -> exit 1 (not ignored)
git status --porcelain notes/                            -> ?? notes/
tiphys doctor -> CHECK retention PASS 1 declared retention path(s) present and tracked
```

The path does not survive the next clone and doctor calls it tracked.

**The orchestrator's position: the argument is sound and the finding is not
being fixed anyway.** Not because it fails the reachability test, which it
passes, but because DR-0027 rule 3 caps a branch at two fix rounds and this
branch has had three. Fixing it would be a fourth. The cap exists to stop
exactly the loop that produced this register, and suspending it for a finding
the implementer itself found is how the cap stops meaning anything.

It is weaker than the three that were fixed: it needs an uncommitted directory.
The implementer's counter, also recorded, is that an uncommitted directory is
the ordinary state right after authoring, which is when a user runs doctor.

## Carried from before DR-0027

These predate the decision and were already unowned. They are listed so that
"tracked" means one list rather than two.

| what | where |
|---|---|
| DV4-1, plus round 4's LOWs and round 5's three declared-uncovered items | the exit-test harness, which ships nothing |
| `describeDrift` builds a `Set` of each block's lines, so a DUPLICATED line leaves both sets unchanged and it prints a hard-coded sentence that is actively false | `scripts/render-agent-rules-gates.mjs` |
| sibling flake sites, unmeasured | `test/lock.test.ts`, `test/gates.test.ts`, `scripts/m1-exit-test.sh` |

`describeDrift` and HRB-4 are the SAME mechanism in two programs, which is the
observation T-020 records. Anyone picking up either should pick up both.

## What this register does NOT establish

- **It is not a completeness claim.** It holds what the reviews reported and
  what the orchestrator carried forward. No sweep has been run to find tracked
  items that were recorded somewhere else and never reached this file, and the
  M1 and M2 milestones are not represented here at all.
- **It does not order the items.** Nothing here is scheduled, and the register
  deliberately does not pretend to be a backlog with priorities.
- **The reachability judgements are the orchestrator's**, made from the
  reviewers' own descriptions rather than by re-deriving each finding. A wrong
  description produces a wrong judgement here and this file would not show it.
