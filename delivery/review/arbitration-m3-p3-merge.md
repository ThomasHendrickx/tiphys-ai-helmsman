# Arbitration: M3-P3 round 10, and the decision to merge

- date: 2026-08-10
- arbitrator: the orchestrator
- head: `676c050`
- inputs: delivery/review/verification-m3-p3-r10-delta.md:1 (690 lines, PR #77)
  and delivery/review/clean-room-m3-p3-r10-criteria.md:1 (568 lines, PR #76)
- outcome: **MERGE. Five lows, all recorded as tracked items with reasons under
  DR-0012 condition 2. No round 11.**

## Both reviews agree, from different contracts

| contract | verdict |
|---|---|
| delta verification | V-1 to V-4 and CRB9-02 CLOSED, three lows, none in the executable change |
| clean-room, criteria lens | APPROVE, two lows, nothing high or medium |

**No high. No medium.** DR-0012 condition 2 permits merging with lows provided
each is fixed or explicitly recorded as a tracked item with a reason. They are
recorded below.

V-1 is closed at the MECHANISM rather than at its instances, and that is
established twice independently. The verifier showed the three parts now pin
`skips[]` to an EQUALITY rather than bounding it, and constructed two B-members
round 10 never named, both red, with an over-rejection probe green. The
clean-room reviewer wrote an oracle from the document's own defining sentence and
ran a 20,000-case differential fuzz: zero disagreements at this head, and
**1,416 disagreements against the round-9 check**, which is what makes the fuzz
discriminating rather than vacuous.

## Why this is a merge and not a round 11

The lows are all TEXT: two stale line numbers, a mis-counted grep, one stale
sentence, and an untracked open question. Not one is in the executable change,
and both reviewers say so independently.

**The decisive argument is the regress, not the effort.** DR-0012 condition 1
requires two independent reviews of the CURRENT head. Any round 11 produces a new
head, which owes two more reviews, whose own findings would produce a round 12.
For prose corrections that regress has no natural stopping point, and condition 2
exists precisely to stop it: lows are merged with, and tracked.

The base rate supports the same conclusion from the other side. Nine of the first
ten rounds of this phase produced a new defect. **Round 10 produced none in the
executable change**, which is the first time this phase can say that of a round
that also changed behaviour. Spending another round on prose has a real chance of
disturbing code that two contracts have now verified.

## The five lows, tracked with reasons

1. **Stale citations round 10 added** (V-1 and CR-001, the same finding found
   twice). `src/modes.ts:221` should be 234; `test/assurance-modes.test.ts:2119`
   should be about 2333. Both were computed against the PRIOR head and moved by
   round 10's own insertion. **Tracked**, and the structural half is what matters:
   the `citations` gate cannot see them. Confirmed by the orchestrator directly,
   every precondition path and every `documents` glob is under `delivery/`, so
   citations in `src/` and `test/` are ENTIRELY UNGATED. Fixing two numbers does
   not close that, and closing it is a gate-configuration change belonging to a
   phase that owns the registry.
2. **The claim grep's accounting is wrong** (V-2): four hits, not three, and the
   one the record names is not among them. Substance unharmed, the report of the
   mechanism is not. **Tracked.**
3. **`assurance-modes.yaml:18` still claims `mode-gate-sets-resolve` "keeps the
   two files from drifting apart"** (V-3), four lines above the paragraph the
   same commit rewrote, contradicted by that same commit's own measurement.
   **Tracked, and it is the low the orchestrator is least comfortable with**,
   because it is a false claim in a SHIPPED file and this project's whole thesis
   is that false claims in durable records are what hide defects. It is a
   descriptive comment rather than anything the CLI prints, which is why it is
   low and not medium. It is queued as the first text correction after merge.
4. **The `mode-gate-sets-resolve` open question has no id** (CR-002). Given one
   below.
5. **Round 10's gate table was taken at a different head than the one reviewed**
   (O-1). Honestly labelled by the round, and CLOSED by the clean-room reviewer
   re-running the whole bundle at `676c050`: 8 green, and `scope` green at 43
   units rather than the false not-applicable a detached worktree produces.

## The one-directional check shape is now a TRACKED MECHANISM, not three anecdotes

The verifier probed `mode-gate-sets-resolve` by a structurally DIFFERENT route
than round 10 used, and both routes validate at exit 0 where the checked
direction reddens. Its assessment, which this arbitration adopts: **the same
mechanism, not a lookalike.** A relation stated redundantly with the word
"exactly", one containment enforced, shipped data satisfying both so the hole is
latent, and documentation claiming the drift is closed.

One difference is recorded rather than smoothed over: `skips`' unchecked
direction let a document OVERSTATE its downgrades and made the CLI contradict
itself, while `gate-sets`' unchecked direction makes the modes document
UNDER-report, so today's consequence is a false description rather than a false
assurance claim. That is why it is not being treated as a second CR-002.

It is tracked in delivery/STATE.md:1 under the carried-forward items, by name,
with the measurement. **Three occurrences in one phase is a mechanism**, and the
next phase that writes a check over a relation between two documents should ask
what the converse admits before writing the description.

## Merge preconditions, checked against DR-0012's text rather than recalled

| condition | state |
|---|---|
| 1, two independent reviews of the CURRENT head | SATISFIED. Both are of `676c050`, on different contracts |
| 2, no unresolved high or medium | SATISFIED. Five lows, each tracked above with a reason |
| 3, reviewers given and walking the acceptance criteria | SATISFIED. The clean-room contract executed every criterion touching the changed surface with its own exit code, and carried the rest forward with a per-row reason |
| 4, CI green on the exact head | SATISFIED. `gates` / `pull_request`, run 31375024358, head `676c050`, conclusion success, observed by the reviewer and independently by the orchestrator |
| 5, scope audit passes | SATISFIED. Green at 43 units, run in a scratch clone under the real branch name |
| 6, arbitration recorded where reviews disagree | They do not disagree. This document records the disposition anyway |

## What is owed after the merge

T-009 rule 1: the post-merge `push` run on the new `main` tip, verified by its
ARM and not by the run conclusion. The phase does not close until that is
observed.

## ADDENDUM: the branch was updated onto `main`, and condition 1 was re-checked

Branch protection refused the merge with a 405 because the phase branch was
behind `main`. Bringing it up to date produces a NEW HEAD, `d272780`, and
DR-0012 condition 1 requires two reviews of the CURRENT head. That could have
invalidated both reviews, so it was MEASURED rather than argued:

```
$ git diff --stat 676c050..d272780 -- src/ test/ witness/ schemas/ '*.yaml' package.json
(no output)
```

Empty. Everything the update brought in is `delivery/` paperwork and `CLAUDE.md`:
the arbitrations, the tuition entries, the review reports and their evidence
bundles, DR-0023, and the plan-text correction. **Not one file either reviewer
examined differs between the reviewed head and the merged head.**

So condition 1 holds in substance at `d272780`: the reviews are of the same
content, and the delta is exclusively the paperwork that documents them. Stating
this as a measured diff rather than as "it is only paperwork" is the point, since
"only paperwork" is an assertion and the diff is a fact.
