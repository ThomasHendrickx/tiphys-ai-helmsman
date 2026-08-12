# Arbitration, M3-P4 fix round 3: the phase does not merge

- date: 2026-08-10
- head arbitrated: 5470207 on claude/m3-p4-report-and-work-history (PR #81)
- input: delivery/review/verification-m3-p4-round-3.md (round-3 delta verification)
- ruling: **PHASE DOES NOT MERGE. DR-0012's stop rule is invoked, and DR-0016's
  response applies: a fresh implementer and a third review contract.**

## The verdict in one paragraph

Round 3 closed every finding it was sent to close, and closed them well: DV-001,
DV-002, DV-003's named half and DV-004 are all verified shut, several from
independently written reproductions rather than from the round's account. It also
found a real error nobody had named. And it introduced a new HIGH of its own,
DV3-001, in the very fix that closed DV-003. That is the second fix round after
the dual review, which is the last DR-0012 allows, and the new HIGH is the same
shape as the one the previous round was told to fix. Both of DR-0012's limits are
therefore reached, not one.

## What I verified myself before ruling

The verifier's findings are not taken on trust. I reproduced the load-bearing
claims independently, at the same head, in my own scratch tree.

**DV3-001, both ends of it.** First, that the runner really does produce the
record the schema refuses:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only scope --evidence <scratch>/ev --base origin/main --head HEAD
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: scope
runner exit=21

$ cat <scratch>/ev/scope/result.json
{
  "gate": "scope",
  "status": "error",
  "units": 0,
  "unitLabel": "changed paths audited",
  "startedAt": "2026-08-10T17:02:53.072Z",
  "endedAt": "2026-08-10T17:02:53.073Z",
  "detail": "gate scope requires --phase, which was not supplied",
  "evidence": []
}
```

No exit-code field, because no child ran and there is no exit code to report.
`startedAt` equals `endedAt`.

Second, that the shipped schema refuses exactly that and accepts its fabrication.
I wrote a minimal report carrying that one gate result honestly, and the same
report with an exit code invented:

```
$ node bin/tiphys.ts validate --type report <scratch>/base.yaml
INVALID #/gate-results/0 value matches no permitted alternative here
exit=1
$ node bin/tiphys.ts validate --type report <scratch>/with-exit.yaml
exit=0
```

The `oneOf` at line 464 of `schemas/report.schema.json` puts `error` in the branch
whose `required` is `["result", "wrapper-exit-code"]`, at line 468 of the same
file. Both paths are written here in backticks deliberately: that file does not
exist on `main`, since this phase creates it, so a resolving citation to it would
be a claim about a file that is not there. So the true record is unwritable and
the false one validates. **That is this phase's entire thesis running backwards**,
in the definition whose own comment names "the unwritable-honest-record failure
this schema keeps guarding against".

**DV3-002.** Confirmed, and my first attempt at confirming it was wrong in a way
worth recording. I substituted an inline string over a `finding: >-` folded block
header and left its three continuation lines in place, so all four fixtures
failed, including the control that must pass. A control that fails is a broken
harness, not a finding; I rebuilt the fixtures replacing the whole block and
re-ran:

| fixture | exit |
|---|---|
| unmodified template | 0 |
| control, "contradict each other" (must pass) | 0 |
| "This contradicts the plan section 2.3" (must be refused) | 1 |
| "This does not contradict the plan; I checked section 2.3 first" | **1, over-rejection** |
| "Nothing here contradicts the plan, and I read section 2.3 twice" | **1, over-rejection** |

The guard refuses the denial as readily as the assertion, and a denial is the
natural sentence beside `contradicts-plan: false`.

## THE RULING: what recurred, which is the point

Round 2's arbitration (delivery/review/arbitration-m3-p4-round-2.md:1) ruled on
DV-002 that **the defect is the ARGUMENT, not the sentence**: the round had
declared a class closed on a single class-wide argument, and the argument did not
hold across the class. Round 3 was told that in those words.

Round 3 then did it again, one site over. To justify putting `error` in the
exit-code-required branch it wrote, into a shipped `$comment`:

> A gate that RAN and did not pass has a wrapper exit code by construction, so
> requiring its PRESENCE refuses no honest record.

> THE BRANCH SPLIT IS ON RAN-OR-NOT.

Both sentences quantify over a class. Neither derives a member. And the
counter-example was already inside the round's own work history, at line 3080 of
`delivery/work-history/m3-p4.md` (also backticked, also not on `main`), where the
round itself captured the `scope` gate erroring for a missing `--phase`. **The
round refuted its own class argument in its own document and did not notice,
because it never enumerated the class.**

DV3-002 is the same shape a third time: a pattern derived from the three members
the round happened to build, generalised to the phrase rather than to the
assertion.

So the mechanism is not "the `error` status was mis-sorted". It is:

> **A universal claim over a class is being used to justify a keyword, and no
> member of the class is ever derived. Fixing the instance leaves the method
> that produced it intact, which is why this is the third occurrence.**

DR-0012's two limits are both reached:

- `max-fix-rounds-after-review: 2`. Round 3 was the second.
- `recurrence-of-high-in-one-component: 1`. Over-rejection of the honest record,
  HIGH, twice in the shared `gateResult` and prose-guard component.

## What happens now (DR-0016, DR-0023)

The phase does NOT wait for the owner. A fresh implementer is dispatched
immediately with a third review contract, and the owner is notified
asynchronously. DR-0016's measured basis is that the fresh implementer, not the
owner decision, is the half that worked.

**The fresh implementer's brief is not "fix DV3-001 and DV3-002".** That is the
instance-fixing this ruling exists to stop. The brief is:

1. Enumerate every universal claim this phase has written into a shipped
   `$comment`, a schema keyword's justification, or the work history. Publish the
   command that enumerates them and its full output.
2. For each, derive a member of the class or restate the claim as bounded. The
   claim-grep in CLAUDE.md is the starting list of verbs, not the finish.
3. Only then repair DV3-001 and DV3-002, and state which repair follows from
   which derivation.

The third review contract is correspondingly not "walk the acceptance criteria"
(contract A) nor "find the expressible lie" (contract B), both of which have now
been run twice on this phase. It is **the argument audit**: take every load-bearing
universal sentence in the diff and try to derive a counter-example, preferring
members the round's own artifacts already contain, since that is where the last
two lived.

## The lower findings, ruled

- **DV3-003 (LOW), upheld.** The work history reports "runner exit 0" for the
  full bundle where the same command at the same head exits 20. The fresh round
  corrects the number; `decideAggregate` is a pure function of counts the round
  itself published, so there is nothing to investigate.
- **DV3-004 (LOW), upheld as stated.** The `$id` bullet's reasoning is wrong and
  its conclusion is right, verified by the verifier. Correct the derivation, do
  not disturb the conclusion.
- The three undeclared under-reach escapes (article deleted, word interposed,
  double space) are recorded as measurement, not findings, because the round
  declared it was not claiming exhaustiveness. The fresh implementer should see
  the price and decide in the open, not silently widen the pattern.

## What this arbitration does NOT establish

- **Whether DV3-001's remedy is to move `error` to the free branch or to split on
  a different property.** The verifier declined to choose and so do I; that is the
  implementer's call, and it must follow from the derivation rather than precede
  it.
- **Whether any of the round's closed findings reopened.** I re-verified DV3-001
  and DV3-002 only. The four closures rest on the verifier's reproductions, which
  were independently constructed and which I read but did not re-run.
- **Whether the same class-argument shape sits in M3-P1 to M3-P3's shipped
  comments.** It has not been looked for. Three occurrences in one phase is
  reason to look, and that is a question for the orchestrator after this phase
  lands, not a reason to widen this round.
