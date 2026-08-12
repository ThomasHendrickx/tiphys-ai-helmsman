# Arbitration, M3-P5: the reviews do not conflict, and the HIGH stands

- date: 2026-08-12
- head arbitrated: 48829d9 on claude/m3-p5-authoring-role-briefs (PR #96)
- reviews: delivery/review/clean-room-m3-p5-criteria.md:1 (contract A, criteria,
  executed) and delivery/review/clean-room-m3-p5-brief-follower.md:1
  (contract B-prime, the brief-follower audit, new to this phase)
- ruling: **DOES NOT MERGE. One fix round on the HIGH and the MEDIUM, then delta
  verification.**

## The verdicts LOOK opposed and are not

| | contract A | contract B-prime |
|---|---|---|
| verdict | APPROVE | CHANGES REQUIRED |
| criteria | 10 of 10 MET, 0 partial, 0 not met | not its contract |
| findings | none | 1 high, 1 medium |

DR-0012 condition 6 requires the orchestrator to arbitrate a disagreement with
evidence rather than by preferring the convenient verdict. **There is no
disagreement of fact to resolve here, and contract A says so itself.** Its
Section 0, written before any finding:

> A design or correctness defect that no acceptance criterion reaches is the
> other [contract's] territory ... (and a `mandated-reading` list that omits the
> document a role needs). I did not attempt either.

**Contract A named the exact defect class contract B-prime found, and recorded
that it was not looking there.** So APPROVE means "every acceptance criterion is
met", which is true and independently strong, and CHANGES REQUIRED means "the
shipped brief is unusable for its stated purpose", which is also true. Both hold.
The HIGH is unrefuted, and DR-0012 condition 2 forbids merging with it open.

## The HIGH, verified by me before ruling

`roles/investigator.md` declares its only output as `report` and lists
`schemas/finding.schema.json` in its mandated reading, a schema its own text
describes as what a REVIEW outputs. It never names `schemas/report.schema.json`,
the contract its output must satisfy.

I composed the brief myself rather than trusting either reviewer:

```
$ node bin/tiphys.ts brief compose --role investigator \
    --phase templates/plan.example.yaml --phase-id M9-P1
exit 0     251 lines
$ grep -c 'report\.schema\.json' <composed>
0
```

Zero occurrences. An investigator receives a brief that never points at the
nine-field contract its report must satisfy, including the `repro` rule THIS
PHASE just added.

**Why no gate saw it.** Criterion 2 checks that every listed path resolves, and
every listed path does resolve; the defect is in what is ABSENT. Contract
B-prime also measured that no test reads the `outputs` field at all
(`grep -n "outputs\b"` over the three new test files returns nothing), so the
suite was never positioned to catch it either.

**The plan predicted this exactly.** Its hazard table names a mandated-reading
list that omits a document the role needs, and says NO CRITERION CAN REACH THIS.
It shipped anyway. A hazard named in the plan and left to prose is a hazard that
arrives.

## The MEDIUM, upheld

`incremental-output`, read as text inside the briefs alone, is an ASSERTION with
no agent-facing trigger: no cadence, no event, no self-check. The only thing that
actually enforces it is the supervisor's freshness watchdog, which lives outside
these briefs entirely.

That matters beyond this phase, because the kernel SHIPS these briefs to
consumers who will not have this orchestrator's watchdog. As written, the clause
travels without its teeth.

This project has twice recorded that a rule depending on memory does not survive
a busy session, and that the answer both times was a mechanism. Upheld as a
medium rather than a low for that reason.

## What the fix round must do, and what it must NOT do

1. **The HIGH: fix the MECHANISM, not the instance.** Adding one path to
   `roles/investigator.md` closes the instance and leaves the method that
   produced it. The round must first DERIVE whether the other two briefs have
   the same hole: does the plan writer's brief name the schema its plan must
   satisfy, does the adversarial plan reviewer's name the schema its findings
   must satisfy? Publish the command and its full output. Only then repair, and
   say which repair follows from which derivation.
2. **Consider whether the composer should derive mandated reading from
   `outputs`.** Contract B-prime measured that `resolveMandatedReading` reads the
   list literally and derives nothing. A mechanism that made the omission
   impossible would be better than three correct lists, and this repository
   prefers a mechanism that makes the failure impossible over a guard that
   detects it. If that is out of scope or a worse trade, say why in the work
   history rather than doing it silently.
3. **The MEDIUM: give the clause an agent-facing trigger or a stated
   consequence.** The honest minimum is that the brief tell its reader the beacon
   is watched and what happens when it goes stale, which converts an exhortation
   into a consequence the reader can act on. Do not claim to have made it a
   mechanism if what was written is still an assertion; that over-claim is the
   defect M3-P4 spent five rounds on.
4. **Nothing else.** Contract A found zero findings across ten criteria after
   forcing its own red witnesses; that work is not to be disturbed.

## Recorded against the orchestrator, twice

**I broke a reviewer's environment.** Contract B-prime's worktree had its
`node_modules` symlinked to a directory holding ZERO packages, so it could not
run the suite or the composer and fell back to reading source. Contract A hit the
same empty directory and repaired it itself before proceeding. Measured after
`npm ci`: 14 packages, `yaml` present, both links resolving.

I fixed it and offered contract B-prime the execution it had been denied, telling
it explicitly not to soften or inflate anything because I had written to it. It
withdrew nothing and UPGRADED the HIGH from argued to demonstrated by composing
the brief. That is the right outcome, and it was only available because the
reviewer had DECLARED the handicap in its boundary section instead of quietly
working around it.

**The second, smaller one:** I fed contract B-prime a specific claim as context
(a twenty-five minute frozen beacon during this phase). It declined to certify it
from commit timestamps and labelled it relayed context rather than its own
evidence. It was right to refuse, and I told it to keep the refusal.

## What this arbitration does NOT establish

- **Whether `roles/implementer.md` and `roles/clean-room-reviewer.md` carry the
  same omission.** They are M3-P6's deliverables and were not reviewed here.
  M3-P6 should be dispatched knowing this shape exists.
- **Whether the two hazard items the plan says no criterion can reach are
  otherwise covered.** M3-P7's `clause-text-matches-row` probe is named as the
  owner of one; that was not verified.
- **The CI arms.** Contract A recorded, correctly, that it observed neither the
  pull-request run nor the post-merge push run. I observed the pull-request run
  myself: both workflows green by step at 48829d9. The push run cannot exist yet.
