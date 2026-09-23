# Arbitration: M5-P2 intent to outcome (PR #207)

Orchestrator record for the merge decision under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:14): two reviews on
different model families of the same head, no unresolved high or medium
finding, CI green on that exact head, and the scope audit passing.

## Reviews on the record

| document | family | round | verdict |
|---|---|---|---|
| `delivery/review/clean-room-M5-P2-opus-criteria.md` | Opus | clean room | FIX-ROUND-NEEDED |
| `delivery/review/clean-room-M5-P2-sonnet-hazard.md` | Sonnet | clean room | APPROVE with one medium |
| `delivery/review/verification-M5-P2-fix-round-opus.md` | Opus | fix round 1 | APPROVE |
| `delivery/review/verification-M5-P2-fix-round-sonnet.md` | Sonnet | fix round 1 | APPROVE |
| `delivery/review/verification-M5-P2-fix-round-2-opus.md` | Opus | fix round 2, head 115e177 | APPROVE, 0 high, 0 medium, 3 low |
| `delivery/review/verification-M5-P2-fix-round-2-sonnet.md` | Sonnet | fix round 2, head 115e177 | APPROVE, 0 high, 0 medium, 0 low |

The two round-2 verifications are the pair this merge rests on. Both cover
115e177, the head whose code this record ships unchanged. This commit adds
only files under `delivery/review/`.

Both verifications re-attacked every round-2 finding (CR-FR-01 to CR-FR-04)
through the real CLI on real `tiphys init` fleets and report each closed.
There is no disagreement to arbitrate.

## The intermittent red-witness run

The round-2 work history recorded one PR-bundle run in which an existing
witness spec's member reddened, while a direct run and a second bundle run
did not. The Opus verification attributes it, strongly but not provably, to
another agent's `pkill` by pattern at about 10:40Z (recorded as T-046 on the
orchestrator paperwork branch). The evidence: the timing of the failing
evaluation in the red run, the shape reproduced exactly by signalling its own
processes (`node --test` exits 1 on SIGTERM with the named test missing), and
42 of 42 direct reruns plus 12 of 12 `evaluateWitness` runs green under load.
The Sonnet verification reproduced the mutation red three times directly and
did not establish a cause. The PR bundle is green on 115e177.

## Tracked, not fixed here (all low)

- CR-FR2-01 (Opus): dangling symlink branches under `charter/` are not all
  refused. The work history's plan (lstat `charter`, class dangling entries as
  refused) is left to a later phase.
- CR-FR2-02 (Opus, pre-existing): with a bad entry beside a charter that has
  no retention, `doctor` stops at the first charter it reads, so its result
  depends on file-name order while `brief compose` refuses.
- CR-FR2-03 (Opus, pre-existing, `src/witness/run.ts` unchanged here): the
  red-witness gate cannot tell a killed test child from a failing test. It
  cannot produce a false green. Candidate fix: treat a missing named test with
  a file-level `not ok` as a harness error.

## Carried forward

M5-P5 edits `roles/clean-room-reviewer.md` and `roles/implementer.md` after
this phase. It must keep the delivered-outcome paragraph this phase added.

## Scope sign-off

The scope gate is green at this head and names 10 declaration entries added
at the head: `AGENTS.md`, `roles/README.md`, `src/charter.ts`,
`src/commands/doctor.ts`, and six exact `witness/p2-*.json` paths that
replace the earlier `witness/` wildcard. The Opus round-2 verification
checked them as additive against the merge-base declaration, and the
orchestrator signs them off here.
