# M3 exit test, stage E1.7: the composed briefs, for the orchestrator to dispatch

- date: 2026-08-15
- author: exit-test runner, dispatch D
- discharges: the runner's HALF of E1.7 (delivery/plan/kernel-plan-m3.md:5242).
  The two reviews themselves are the orchestrator's to dispatch, on different
  model families, and this runner does not dispatch them.

**Everything in this pack was produced BY THE KERNEL, not written by hand.** The
checklists were resolved by `tiphys checklist resolve` and the briefs composed
by `tiphys brief compose`; the runner authored only the injected per-phase probe
file, which is what R-054's extension mechanism exists for.

## The head under review

| what | value |
|---|---|
| subject branch | `claude/exit-subject-doctor-kernel-artifacts` |
| head | eb13da6b96137967d4a5b8311f0f044e75758b42 |
| base | `main` at 7b18144, which carries the witness-ownership fix |
| gate state at that head | 10 green, 0 red, 6 not-applicable, 0 error, 0 vacuous; runner exit 20 for two required-and-explained not-applicables |
| the change | a `kernel-artifacts` check for `tiphys doctor`, the exit test's designated subject |

## Contract 1: CRITERIA

| field | value |
|---|---|
| brief | `e1/e1-7/brief-clean-room-criteria.md`, 313 lines, composed exit 0 |
| `review-contract` | `criteria` |
| checklist | `checklists/clean-room.yaml` PLUS the injected per-phase probes |
| framing | `criteria-contract` |
| resolved probe list | `e1/e1-7/resolved-clean-room-criteria-framing.txt`, **27 probes** |
| record | `e1/records/E1.7-brief-compose-criteria.json`, `e1/records/E1.7-checklist-resolve-clean-room.json` |

## Contract 2: HAZARD

| field | value |
|---|---|
| brief | `e1/e1-7/brief-clean-room-hazard.md`, 313 lines, composed exit 0 |
| `review-contract` | `hazard` |
| checklist | `checklists/hazard-review.yaml` |
| framing | none passed; the hazard checklist ships no `framings:` block, so its resolved order is file order and its first probe is `hazard-classes-addressed` by position |
| resolved probe list | `e1/e1-7/resolved-hazard-review.txt`, **9 probes** |
| record | `e1/records/E1.7-brief-compose-hazard.json`, `e1/records/E1.7-checklist-resolve-hazard.json` |

### The phase's declared `hazard-classes[]`, which is the hazard contract's starting question

Copied verbatim from the plan instance so the dispatch does not have to fetch
it, and so the reviewer's `hazard-classes-addressed[]` can be compared against
it one class at a time:

| id | statement | plan says addressed by |
|---|---|---|
| H1 | A check that passes because it looked at a path that always exists, so a kernel missing an artifact still reports PASS. The concrete form here is an `existsSync` on a directory the install created empty. | criterion 3 |
| H2 | A check that reports the state of the DEVELOPMENT CHECKOUT rather than of the resolved install, so it is green for every developer and says nothing about any user's environment. | criterion 1 |
| H3 | A check promoted in the wrong direction, so a missing artifact stops a local-only run that never needed it, which is the failure mode that made a freshly initialized fleet exit nonzero once already. | criterion 5 |
| H4 | A witness that reddens under one dangerous state and is green under the sibling shape, which is the "one witness is not a class" failure this repository has paid for twice. | criterion 7 |
| H5 | A doctor that hangs on a named pipe placed at one of the artifact paths, which is the open class this repository tracks against modules that read paths they did not create. | criterion 11 |

## The injected per-phase probes (R-054)

`e1/e1-7/per-phase-probes.yaml`, four probes, merged into the criteria contract
by `checklist resolve --extra`. All four appear in the resolved list, which was
checked by matching their ids in the resolver's own output rather than assumed:

| probe id | what it forces |
|---|---|
| `subject-resolver-not-the-artifact-under-test` | establish BY EXECUTION that the delivered check does not repeat `kernelRoot`'s upward search for the artifact under test, and say where else you looked |
| `subject-staged-install-not-the-checkout` | say which tests exercise a staged install and which exercise this checkout, and whether any criterion is witnessed only by the second |
| `subject-capture-is-real-and-reproduced` | verify the shipped CLI transcript is real captured output and that the reproducing test would fail if transcript and program disagreed |
| `subject-two-stored-specs-repaired-not-weakened` | establish that the two M3-P8 witness specs this change edits were repaired rather than defanged |

The last one exists because this change edits two witness specs it does not own.
That is the shape the exit test's own blocker came from, and a reviewer should
be made to look at it rather than left to notice it.

## What the runner asserts about this pack, and what it does not

**Asserts**: both briefs composed exit 0; they differ in more than a label, the
`review-contract` field and the whole contract clause differ (`## clause
review-contract-criteria` versus `## clause review-contract-hazard`), verified by
diffing the two files; the injected checklist validates exit 0 under
`--context`; the resolved lists carry 27 and 9 probes and the four injected
probes are present by id.

**Does not assert**: anything about the model families or the framings the two
reviews will actually run under. Those are set at dispatch, they are the
orchestrator's, and `scripts/check-dual-review.mjs` is what will judge them
afterwards. This pack cannot make the pair decorrelated; it can only make the
two contracts genuinely different, which is the half that is mechanical.

## Two measurements made while composing this pack

**1. `tiphys validate --type checklist` exits 1 with no INVALID line when given
no `--context`.** All four shipped checklists behave identically, and so does
the runner's injected file: the only output is `SKIPPED gate-probes-resolve no
context` and the exit code is 1. With `--context .` every one of them exits 0.
A SKIPPED derived check is not an invalid document, so an exit code of 1 with no
INVALID line says a document is bad when the tool merely lacked an input.
Recorded as a small finding; not fixed here.

**2. The runner nearly reported a defect that does not exist, and the cause is
worth more than the finding.** An earlier probe appeared to show the shipped
`clean-room.yaml` exiting 0 while the runner's file exited 1 on identical
output, which would have been a content-dependent discrepancy. It was an
artifact of the measurement: the command was piped into `tail -2`, so `$?` was
`tail`'s status and not the validator's. Re-measured without the pipeline, every
checklist exits 1 without context and 0 with it. This is the same shape as the
guards this repository polices, one level down: a reading whose apparatus cannot
report the thing being read.
