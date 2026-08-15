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

## M3-P9 round 2: what the branch merges carrying, and why there is no round 3

M3-P9 hit DR-0027's hard cap of two fix rounds. It merges with these open, and
the reasoning for merging rather than abandoning is stated below rather than
implied by the merge.

| # | open item | why it is not a blocker |
|---|---|---|
| 1 | `citations` is REQUIRED and NOT-APPLICABLE on the round's own work history, because `delivery/work-history/` is not in the gate's precondition paths. So that document's citations are not machine-checked | pre-existing and identical in round 1; the implementer verified all four by hand and they resolve. It is a gap in the GATE's coverage, not a wrong artifact |
| 2 | **187 stage-3 sites outside `dual-review-decorrelation` are unexamined by execution.** "The class is closed" applies to that one check and to nothing else | the class was closed where it was known to bite. The remaining sites are candidates, not findings; nobody has shown one is wrong |
| 3 | Two DECLARED behaviour changes: a trailing byte-order mark was silently trimmed and is now REFUSED, and a legitimately non-ASCII `produced-by` is now REFUSED | both are the fail-closed direction for this check, and both are declared rather than discovered. A user with a non-ASCII model-family name is refused rather than mis-passed |
| 4 | `src/checklists.ts`, `src/commands/brief.ts`, `src/gates/run.ts`, the eleven gates naming unshipped paths, and `test/gate-registry.test.ts` | all deliberately out of scope and each owned elsewhere; the implementer did not self-grant |

### Why merge rather than abandon, stated as an argument

The cap forces a choice and this is the reasoning for the one taken.

1. **Round 2's fix is structurally different from round 1's.** It restricts the
   input alphabet rather than enumerating attacks. Measured in the round: NFKC
   folds only 3 of 9 attack characters, and no normalisation form folds a
   cross-script homoglyph, so a confusables table would have been a list that
   goes stale. A character-set restriction closes members nobody has thought of
   yet, which is what closing a class means.
2. **It refused rather than repaired.** An invisible character is rejected, not
   stripped. Silently repairing a document built to deceive its reader and
   handing back a green is the worse failure.
3. **The residual risk is LATENT, not active.** `check-dual-review` is
   not-applicable on every head this repository has ever had, established by the
   M3-P9 criteria reviewer by enumeration: 176 markdown documents, zero verdict
   documents, none in history. The check ships but has never fired here.
   **M4's pilot is the first time it decides anything real**, which is the right
   moment for a fresh look at it rather than a third round now.
4. **The cap exists to stop exactly this loop**, and a third round would be the
   loop. Round 1 was verified and produced a HIGH; round 2 closed it, found a
   fifth member the verification missed, and found a WORSE site the verification
   had not attacked. That is a healthy round, not evidence that a fourth pass is
   owed.

**No delta verification was run on round 2, and that is a decision rather than an
omission.** A verification cannot lead to a fix here, because the cap is spent;
it could only produce a finding to record. The trade was judged not worth it
against the four points above. If that judgement is wrong, the cost is a finding
discovered at M4 instead of now, on a check that does not fire until then.

### The lesson that is worth more than the finding: an inherited citation nobody checked

Round 1 declined to fold case, citing a reviewer finding (CR-003) as naming
case-insensitive comparison a WEAKENING. Round 2 checked that citation and **it
was wrong**: CR-003 is a LOW about witness-spec construction, and its
case-insensitivity remark is a suggested MUTATION, not a design ruling.

So a design decision in shipped code rested on a misread citation, and the misread
propagated because the next reader inherited it instead of opening it. It was
caught only because the round-2 brief said to check it rather than inherit it.

**Generalise: a citation used to justify NOT doing something deserves the same
scrutiny as one used to justify doing it.** This repository already requires
evidence for claims; this is the same rule applied to a claim of the form "a
reviewer said we should not".

## M3-P11, merged carrying nine residues and one finding that is not its own

M3-P11 merged at `39316be` after two clean-room reviews, two fix rounds (the hard
cap) and an independent delta verification between them.

### The nine residues, and the SPLIT is the useful part

The work history lists them by number in two groups, and the grouping matters
more than the count because the two directions have different costs:

- **still a FALSE ERROR**: the gate refuses something honest. Loud, and because
  `decideAggregate` checks `counts.error` first, one of these fails the WHOLE
  bundle regardless of applicability.
- **still a SILENT SKIP**: the gate passes something it did not check. Quiet, and
  it is the original defect class.

Named specifically: `--opt=/path` is now UNPROBED rather than correctly probed
(strictly better than the state it replaced, which was a guaranteed false error);
the extensionless bare operand (`node check`) remains a silent skip; and
mechanism C, a directory operand read as a non-regular file, is LATENT rather
than live, because this repository's own `scope` gate is declared with a
directory operand but carries no precondition.

### What makes this phase worth reading later

**The pull request was GREEN while a real regression was live.** Fix round 1
traded a silent wrong skip for a false error and recorded it as an accepted cost.
The delta verifier measured that a single false error fails the entire bundle, so
an honest, correctly written precondition would have blocked a consumer's whole
delivery. No gate in the bundle exercises that shape, so CI could not have caught
it, and neither could any amount of re-running.

**And round 2 closed what round 1 called unclosable.** Round 1's reasoning was
sound and was not the end of the question: it never tried a SECOND, narrower way
to be path-shaped. Measured over 30 declared commands, round 1's rule gives 2
false gaps and round 2's gives 0. "I could not find a way" is a true sentence and
is not the same as "there is no way", and writing the true one is what told round
2 where to look.

## UNOWNED, and the SECOND of its kind: a required credential gate reads a crash as clean

Found by the M3-P11 delta verifier, reproduced with a wrapper that self-inflicts
SIGSEGV on `git config` subcommands.

`src/gates/credentials.ts` reads a signal-killed `git` or `gh` subprocess as a
benign "clean" verdict, meaning no credential helper was found, rather than as
`error`. It is inside `credential-scrub`, which is a **required** gate whose
entire job is refusing a credential leak.

It is the same mechanism as the entry below, one file over, and it was
deliberately kept out of M3-P11's LAST fix round because loading a fourth file
into a final round is how a round fails. It is pre-existing rather than a
regression of that phase.

**Reachability, which DR-0027 makes the test:** a consumer whose `git` is killed
by a signal is told their tree is clean of credential helpers when nothing was
established. That reaches a real user path in the gate least able to afford it.

**It needs an owner and it is reported to the owner rather than filed quietly.**
The orchestrator's recommendation is its own small phase, on the same reasoning
that gave the entry below one: a crash read as a verdict is exactly what M3-P11
existed to stop, and leaving a second instance in a required gate contradicts
the phase that just shipped.

## UNOWNED AND SERIOUS: the gate runner reports a crash as a skip

Found by the M3-P9 hazard reviewer while root-causing something else, and it is
larger than the finding it was attached to. It is listed FIRST because it is the
only entry in this register that makes other evidence untrustworthy.

**A gate command that FAILS TO EXIST is reported as `not-applicable`**,
indistinguishable in the printed line from a legitimate "precondition unmet"
skip. The precondition evaluator treats a command as "could not run" only when
the LAUNCHER fails to spawn, not when the script it launches is missing and
exits 1. Root-caused to the gate runner (`src/gates/run.ts`, shipped as
`dist/src/gates/run.js`) with the code path quoted in the hazard review.

**A crash that prints as a skip is a guard that cannot go red.** This repository
has paid for that shape at least four times: a watchdog that tested existence
rather than freshness, a control-character check blind to NUL, a watchdog
pointed at a subset of an agent's paths, and an expired monitor that could not
fire. Every one was green and worthless.

Why it is not merely tracked-and-forgotten:

- It is in SHIPPED code, and a consumer running a conditional gate gets
  `not-applicable` when the gate actually crashed.
- It degrades this build's own evidence. Every `not-applicable` this process has
  quoted for a conditional gate is, strictly, either a skip or a crash, and the
  printed line does not say which. That includes lines quoted in merged work
  histories.

It is NOT M3-P9's (M2-P1 era) and was deliberately excluded from that phase's
fix round so the round did not sprawl. **It needs an owner.** The orchestrator's
position is that it belongs with M3-P10 or its own small phase, and it is being
reported to the owner rather than filed quietly.

Reachability, stated plainly because DR-0027 makes reachability the test: a
consumer sees a false `not-applicable`, so it reaches a real user path and would
block a merge if it belonged to the phase in front of it.

## Found during M3-P9, granted around rather than fixed

| what | where |
|---|---|
| a `deepEqual` over the KEY SET of the registry's script gates absent from the manifest. A set equality against an APPEND-ONLY registry is a claim about every future phase, so it reddens for whichever phase appends next. M3-P9 hit it; M3-P10 will hit it the same way | `test/gate-registry.test.ts` |

This one is recorded with its cost already paid once. It was granted around
with a `declaredExtras` amendment rather than fixed, because rewriting the
assertion to work by name is not M3-P9's job and doing it inside M3-P9 would
widen a phase that is already carrying two new gates. **The grant fixes the
instance and leaves the mechanism**, which is the shape T-020 records four
consecutive times, so it is written down rather than left to be rediscovered by
M3-P10.

It is the same family as `describeDrift` below and as HRB-4 above: a comparison
whose equivalence class is not the one its message quantifies over.

## THE NON-PUBLISH EVIDENCE RESTED ON TWO PROBES THAT LAG, ONE OF THEM BY HOURS

Found 2026-08-14 evening, by accident, while helping the owner through A-7's
bootstrap. It is recorded because it weakens evidence that is already MERGED,
which is the kind of finding that otherwise disappears.

M3-P10's work history establishes "I did not publish" with two probes:
`GET https://registry.npmjs.org/@tiphys%2fkernel` returning 404, and
`search?text=scope:tiphys` returning `{"total":0}`. The orchestrator quoted both
back in the pull request body. Both are now measured to be capable of reporting
an empty registry that is not empty.

The owner published the `0.0.0` stub. Timeline, all measured:

| moment | observation |
|---|---|
| 14:13:53.690Z | version `0.0.0` created, per the packument's own `time` map |
| 14:14:04Z | the owner's `npm deprecate` returns **E404** |
| 14:17:43Z | the orchestrator's packument probe returns **404** |
| 19:42:39Z | packument returns **200** with the version present |
| 19:42:39Z | `search?text=scope:tiphys` STILL returns `{"total":0}` |

So the packument read path lagged at least four minutes behind a successful
write, and the search index lagged more than five and a half hours. **The
orchestrator read the 404 and reported that the package did not exist**, which
was a wrong inference from a correct measurement, and it is written that way
rather than as a registry fault.

**The consequence for the phase, stated in both directions.** M3-P10's claim
that it did not publish is almost certainly TRUE, and it is now supported by a
stronger measurement than the one it recorded: the packument holds exactly one
version, `0.0.0`, created from the owner's laptop, and no `0.1.0` exists. What
is weakened is the METHOD, not the conclusion. A future phase that proves a
negative about a registry with either of these probes is proving less than it
appears to.

The stronger form, for whoever needs it next: enumerate the versions that DO
exist and account for each, rather than asserting the package is absent. An
absence read from a lagging index is indistinguishable from a lagging index.

## NONDETERMINISTIC IN THE RELEASE PATH: `test/implementer-brief.test.ts`

Found 2026-08-15 while driving the `0.1.0` publish. A rehearsal of `release.yml`
on `7c0b1e7` failed at `npm test`:

```
test/implementer-brief.test.ts:1171
the brief-drift step wired into the gates workflow ... reddens under two structurally different defangs
  Error: ENOENT, No such file or directory '/tmp/tiphys-impl-wired-XE7crl/src/gates/schemas'
      at stageKernel (test/implementer-brief.test.ts:96:5)
```

**Established as a FLAKE by discriminator rather than by argument.** The same
commit's `npm test` was green in the `gates` workflow twenty minutes earlier,
and an immediate re-dispatch of the identical rehearsal, same head and same
inputs, passed. Two outcomes from one configuration is the definition.

**The cause is NOT established, and one plausible story was tested and
refuted.** The first hypothesis was a sibling test sweeping the `/tmp/tiphys-*`
namespace, which is the shape M3-P10 reported as a tuition candidate. There is
no sweeper: no broad `rm` over that namespace and nothing that reads `tmpdir()`
and deletes. The hypothesis is recorded as dead so the next reader does not
re-run it.

**Why it did not block the publish**, stated as an argument rather than assumed:
the flake sits at step 9, BEFORE the publish, so when it fires the run aborts
and nothing reaches the registry. It costs a retry, never a wrong artifact. That
is the fail-closed direction.

Reachability under DR-0027: it is in `test/`, which ships nothing, and its
failure mode is a false RED. It reaches a real path only in the sense that it
can block a release, which is why it is here rather than nowhere. Same family as
the `test/watcher.test.ts` flake this repository fixed earlier.

## UNOWNED AND EXPLOITABLE: `gates.yml` interpolates a branch name into a shell

Found by the M3-P10 round-1 delta verifier as DV-8. It is listed here rather
than left in a work history because that is precisely the finding the verifier
made against the round: it lived in one document and not in the register that
exists for it.

`.github/workflows/gates.yml` interpolates `github.head_ref` into a shell inside
a `$(printf | sed)`. The verifier established three things rather than one:

1. `claude/m3-p1-"$(id)"` is a LEGAL git ref name, so the injection has a
   carrier;
2. `on: pull_request` is unfiltered, so the workflow fires for it;
3. the job declares no `permissions:` key, so it takes the default set rather
   than a named one.

That is exploitable rather than merely shaped like a risk. It is bounded: this
repository is public and `pull_request` (not `pull_request_target`) gives a fork
a read-only token with no secrets, so the reachable harm is what an attacker can
do INSIDE a runner rather than to the repository's contents. The bound is stated
because a finding whose blast radius is not stated gets either over-read or
ignored.

**It is not M3-P10's.** That branch does touch `gates.yml` (round 0 added the
licence-gate step, so `gates.yml` is on its `filesToTouch`), and it was told not
to touch this line: a last fix round under a spent cap is not where an unrelated
security fix belongs. The M3-P10 round-2 implementer nearly wrote that the file
was outside its declaration, checked, found that false, and corrected it, which
is why the reason recorded here is the true one.

Reachability under DR-0027: a shell running attacker-chosen text in this
repository's CI. It reaches a real path and it needs an owner.

## M3-P10, merged carrying these

Full reasoning in `delivery/review/arbitration-m3-p10-addendum.md` on the phase
branch. Merged at DR-0027's hard two-round cap.

| id | what | why not blocking |
|---|---|---|
| DV-3 | `${{ }}` into `actions/github-script`'s `with: script:` is invisible to the interpolation assertion | declared by the round; no such site exists at that head |
| DV-4 | a zero-dependency tree reads as "run npm ci" when npm install did run | not reachable (3 dependencies) and `scripts/` does not ship |
| DV-5 | npm puts `dev:true` on the `vendor/x` lock key rather than the `node_modules/x` link key, so a dev `file:` dependency reads as production | not reachable at that head; the shipped set was verified unchanged, 10 of 10 |
| DV-7 | what the pre-publish step executes is a re-pack, not the published bytes, because `npm publish` repacks | no divergence demonstrated; `npm publish <tarball>` would close it |
| HRB-4 | `== false` coercion, now a `confirm` string measured failing closed on all nine off-table values | reachability was not established by the reviewer or by either round, and is not claimed now |
| round-1 residues | the `.npmrc` registry-redirect gap (records do not carry which registry answered); workspaces, npm aliases and `auto-install-peers` untested | gaps in coverage rather than wrong answers at that head |

**The one that was not a finding but was the most important line here: NO
WORKFLOW HAD BEEN EXECUTED. CLOSED 2026-08-14 20:03Z.** Every claim about
`release.yml`, from three agents across two reviews and a verification, was
static analysis of YAML and shell, and the round-2 implementer named that
absence itself.

The first ever execution of that workflow was a REHEARSAL dispatch against
`main` at `40b70a8`, run `31836129435`, `version: 0.1.0` and `confirm` empty.
`total_count` for the workflow was 1, which is how "first ever" is established
rather than remembered. Conclusion `success`, read by step:

| step | conclusion | why it matters |
|---|---|---|
| 05 `Decide whether this dispatch publishes` | success | the version-agreement check passed and the empty confirm did not refuse |
| 11 `npm pack, and check the listing against the tree on disk` | success | the listing check held against a real built tree on a real runner |
| **12 `Install and RUN the packed artifact, before any publish`** | **success** | **round 1's M3 fix, witnessed in execution: it carries no `if:` and it really does run on a rehearsal** |
| 13 `Publish to npmjs over OIDC` | **skipped** | the guard held under a real dispatch, not only under a test |
| 14 `Rehearsal only, nothing was published` | success | the complementary arm fired |
| 15 `Release verification ... after publishing` | skipped | correct; it is post-publish by design |

Nothing was published, and the two pieces of evidence are given in order of
strength rather than run together. PRIMARY: GitHub's own job record reports step
13 SKIPPED. SECONDARY: the registry holds exactly one version, `0.0.0`,
published 14:13:53Z by the owner, with `modified` 19:44:54Z being the
deprecation, and no `0.1.0`. The secondary is the weaker of the two here
BECAUSE OF THE ENTRY ABOVE: a version published at 20:03 might not have appeared
by 20:09, so a registry read cannot carry this claim on its own.

**What the rehearsal still does NOT establish**: the publish arm. Steps 13 and
15 are the only two that have never run, and by construction they cannot be
witnessed without publishing. That is the one asymmetry this design accepts on
purpose.

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
