# Pipeline state

The single place that answers "where are we right now". Update it whenever
a phase changes state, a decision is answered, or an owner action becomes
runnable. If this file disagrees with reality, reality wins and this file
is wrong: verify against git and the PR list before trusting it.

## M5 standing at 2026-09-23, 17:40 UTC, `main` at 6dc5b06

M5 runs in waves under DR-0050 (delivery/plan/m5-conflict-pre-pass.md:1). The
approved plan is delivery/plan/value-delivery-plan.yaml:1.

### Merged, with the post-merge `push` run observed green

| what | PR | main head | push run |
|---|---|---|---|
| M5-P4, CI tells the truth about what it ran | #209 | 8558dca | gates 35847665771 success |
| release verification waits for the registry | #211 | ac98d3c | gates 35858746022 success |
| M5-P2, charter intent into briefs, delivered outcome in reports | #207 | 5662d74 | gates 35862907311 success on attempt 2 |
| M5-P3, live review evidence | #213 | 6dc5b06 | gates 35890128107 success |

The M5-P2 push run went red once on attempt 1 in a test M5-P2 does not touch,
and was green on the one allowed re-run. Recorded, with the #211 instance, in
delivery/verification/cutover-status-tree-digest-intermittent.md:1. The #213
row was read from the Actions API for head
6dc5b066f5609133845e72ba03d998e694ac37d1, event `push`: `gates` run
35890128107 and `macOS smoke` run 35890128121, both completed, conclusion
success, attempt 1.

From M5-P3 on, every review writes one verdict JSON per review contract at
`delivery/review/<phase-id>-<contract>.json`, and a missing verdict is red at
the merge gate rather than not-applicable.

### In flight

- M5-P5, context diet (wave C): implementer dispatched 17:00 UTC on
  `claude/m5-p5-context-diet`.
- Kernel 0.2.1, old history validates again (DR-0053, DR-0054): implementer
  dispatched 17:00 UTC on `claude/kernel-0-2-1-history-compat`.
- M5-P1, pulse value proof: `claude/m5-p1-pulse-value-proof`, waiting on A-14.
- M5-P6, scale-out proof: `claude/m5-p6-scale-out-proof`, wave D.

### Owner decisions open

- Publish kernel 0.2.1 to npm once its PR is merged under DR-0012 (DR-0053).
  Asked 2026-09-23. The owner asked for the 0.2.0 publish by name, so this one
  waits for a go-ahead too.

### Owner actions open

- A-14: restart pulse and bump pulse-fleet to kernel 0.2.0. Its register
  entry was allocated on the M5-P1 branch and reaches this register when that
  phase merges; it is not yet on `main`. Pulse reports its pin is done.
- A-15: tag and release v0.2.0. The tag was still absent at 17:03 UTC.
- A-10: fleet default branch and six probe branches.
- A-9 and A-8: scratch and superseded branches on this repository. Both were
  still present at 17:10 UTC by `git ls-remote origin`.

The full runnable text of every open action is in the register below.

## How to resume cold

1. Read `CLAUDE.md`, then this file.
2. `git fetch origin main` and check what is actually merged.
3. Check open PRs and their CI state.
4. Read the newest files in `delivery/review/` and `delivery/tuition/`;
   they carry the most recent hard-won knowledge.
5. Pick up from the "In flight" section above, using the
   `phase-delivery` skill.

## Owner action items

- **A-9: DELETE THE SCRATCH BRANCHES I PUSHED BY MISTAKE.** Only the owner can;
  this container cannot delete a remote ref, which standing warning 14 at
  CLAUDE.md:1089 records with the measurement, and a `--dry-run` reports success
  either way so there is no non-destructive way to confirm it in advance.

  On 2026-09-16 at about 04:38 I pushed every M4 branch after a session-limit
  kill, using the refspec `grep -E '^(claude/m4-p|worktree-wf)'`. That second
  alternative was meant to carry ONE branch holding salvaged work and it carried
  FIFTEEN, because the harness names every agent worktree's branch
  `worktree-wf_*`. Fourteen of the fifteen are empty harness scratch.

  Safe to delete, all of them: `worktree-wf_2b81e806-d59-1`,
  `-d59-2`, `worktree-wf_325aa631-d2d-1`, `-d2d-2`, `worktree-wf_6346a0c1-e72-1`,
  `worktree-wf_717552c9-287-1`, `worktree-wf_a1849252-b71-1`,
  `worktree-wf_aca97ef8-95e-1`, `-95e-2`, `worktree-wf_ad5072ea-a8f-1`,
  `worktree-wf_badbbac6-8f2-2`, `worktree-wf_bdcf1646-6e4-1`,
  `worktree-wf_cc74053e-aaa-1`, `worktree-wf_deb48280-c22-1`, `-c22-2`.

  **`worktree-wf_95ea9fad-2fd-1` is the ONE to keep for now.** It carries the
  M4-P19 fix round's salvaged work as a `WIP-UNREVIEWED` commit. It can be
  deleted once that work is folded into `claude/m4-p19-pool-record-reconstruction`.

  This is low urgency and pure tidiness; nothing is blocked by it. It is
  recorded rather than left because a mistake that cannot be undone from here
  should not be discovered later by someone wondering what those branches are.

- **A-15: CREATE THE v0.2.0 TAG AND GITHUB RELEASE.** Opened 2026-09-23.
  OPEN. `@tiphys/kernel@0.2.0` is published, and the release workflow skipped
  its tag job because the registry check raced npm (T-045, DR-0052). This
  container can push neither tags nor releases.

  What the owner does, from a clone with push rights:

  ```
  git fetch origin
  git tag -a v0.2.0 cb5de0d29061ab5c50a6023658f18eee931e74a7 \
    -m "v0.2.0, published to the npm registry by the release workflow"
  git push origin refs/tags/v0.2.0
  gh release create v0.2.0 --verify-tag --title v0.2.0 --notes "version: 0.2.0

  commit: cb5de0d29061ab5c50a6023658f18eee931e74a7

  npm: https://www.npmjs.com/package/@tiphys/kernel/v/0.2.0

  workflow run: https://github.com/ThomasHendrickx/tiphys-ai-helmsman/actions/runs/35839356656"
  ```

- **A-10: THE SIX PROBE BRANCHES ON THE FLEET REMOTE, AND ITS DEFAULT BRANCH.**
  Raised earlier and unchanged. A probe against `tiphys-ai-helmsman-fleet` left
  six branches and altered its default branch. Same constraint as A-9: ref
  deletion is refused here.

<!-- A-14 lands here, as its own bullet directly after A-10, when
     claude/m5-p1-pulse-value-proof merges. -->

**This section is the sole allocator of `A-n` ids** (CLAUDE.md identifier
schemes). An `A-n` is an ACT the owner must perform because it needs access an
agent does not hold; a CHOICE is a `DR-nnnn` instead. A plan that needs a new
action asks for an id rather than picking one, because the namespace has
already collided once: `A-4` meant two different things in two live documents
and `A-3` meant three, one of them a literal string inside
`gates.manifest.json` on `main`. Retired ids are never reused.

1. **DR-0004: DONE (owner, 2026-08-05).** The ruleset is active and was
   witnessed refusing a merge whose branch was behind `main`, then allowing it
   after the branch was updated and CI went green on the exact merged head.
   Item 4 (implementer token scoping) remains queued for M2.
2. **A-1: DONE (owner, 2026-08-05).** The toy sandbox repository is
   https://github.com/ThomasHendrickx/tiphys-ai-helmsman-sandbox. Both M1-P6
   scripts take the repository URL as an argument, so nothing needs editing;
   the URL is supplied at dispatch. M1-P6's full mode is unblocked.
3. **A-6, NEW and blocking one criterion.** Grant this session PUSH access to
   `ThomasHendrickx/tiphys-ai-helmsman-sandbox`. The repository was attached to
   the session and READ works (`git clone` exit 0, `git ls-remote` exit 0), but
   the write path is refused: `git push --dry-run` exits 128 with HTTP 403 on
   `git-receive-pack`, while the same dry-run against the kernel repository in
   the same shell exits 0. The refusal arrives before any ref is proposed, so
   it is an authorization asymmetry, not branch protection and not anything the
   push could be adjusted to satisfy. Re-calling the attach with push access
   returns already-present and does not upgrade an attached repository.
   Likely the GitHub App is not installed on the sandbox repository, or
   workspace policy excludes it; an admin can grant it in the Claude GitHub
   settings. What it unblocks: M1-P6 criterion 1's real-repository form, its
   commit-identity assertion, and the idempotence half, plus the M1 exit test's
   FULL mode. Local mode is unaffected and passes.
4. **A-2, AMENDED 2026-09-15 by DR-0037 and PARTLY DONE.** Original text:
   "Provide or approve a private remote per real fleet home, for fleet-state
   durability." **The PRIVATE requirement is withdrawn.** The kernel needs a
   DURABLE remote; visibility is the project's declaration and the kernel does
   not check it.
   - **`pulse` half: CLOSED.** The owner has decided `pulse` and `pulse-fleet`
     are a portfolio project and stay public. The recommendation earlier in this
     file to make them private is SUPERSEDED and must not be acted on.
   - **Kernel half: remote DONE, fleet home NOT.**
     `ThomasHendrickx/tiphys-ai-helmsman-fleet` exists and is private. The
     fleet home itself has not been created, and the remote now carries six
     branches pushed by this orchestrator's own cross-environment-exclusion
     probe (`probe-fleet-home`, `probe-lease-a`, `tiphys/lease`,
     `tiphys/lease-r1`, `tiphys/lease-r2`, `tiphys/lease-r3`). It must be
     cleaned or re-created before pilot bootstrap, and branch deletion is an
     owner action.
   - The GENERALISATION of this amendment beyond `pulse` is the ORCHESTRATOR's
     inference under DR-0016, not the owner's instruction, and is vetoable.
4b. **A-n REQUESTED, 2026-09-15: clean the kernel fleet remote.** This
   orchestrator's own cross-environment-exclusion probe pushed six branches to
   `ThomasHendrickx/tiphys-ai-helmsman-fleet` and, by pushing first, set the
   repository's DEFAULT BRANCH to a probe branch. The refs are
   `probe-fleet-home`, `probe-lease-a`, `tiphys/lease`, `tiphys/lease-r1`,
   `tiphys/lease-r2` and `tiphys/lease-r3`. Ref deletion is refused to this
   container (A-4 and standing warning 14), so cleaning is an owner action. It
   must happen before pilot bootstrap runs `tiphys init` against that remote.
   The kernel repository's own refs were not touched. The probe's measured
   results are in `delivery/verification/` and are worth keeping; only the refs
   need removing.

5. **A-4: DONE (owner, 2026-08-07).** The stale `claude/*` branches were
   deleted through the `gh` CLI. The orchestrator could not do it: this
   container's credentials are refused ref deletion with HTTP 403 on both the
   GitHub API and `git push --delete`, though ordinary pushes from the same
   credentials succeed. The remote is now exactly two refs, `main` and
   `claude/m3-plan-regrounding`, which is the state this project wanted:
   `main` is the source of truth and the M3 branch is where M3 is worked,
   rebased onto `main` rather than diverging from it.
6. **A-7: DONE.** Both parts are closed: the owner claimed the `@tiphys` npm
   scope on 2026-08-10, and part 2 became the OIDC trusted-publisher
   configuration under DR-0024, over which `@tiphys/kernel` 0.1.0 and 0.2.0
   have since been published. A-5 is allocated by
   delivery/plan/kernel-plan-m3.md:2538 (DR-0004 items 2 and 3, branch
   protection), and M2's A-3 is embedded as a literal string in
   `gates.manifest.json` (`implementer-token-present-owner-action-a-3`), so
   neither id is free. The full A-7 text, including the id note, is at
   `git show 6dc5b06:delivery/STATE.md` lines 1725 to 1775.

7. **A-8, NEW 2026-08-15, and it is small, mechanical and not urgent.** Delete
   the remote branch `claude/m3-p13-doctor-kernel-artifacts`, which sits at
   4a719d6994877900a4d05ecfc41825f6cd838354. It was pushed during the M3 exit
   test's stage E1.6 and then superseded within the hour by
   `claude/exit-subject-doctor-kernel-artifacts`, which carries the identical
   commits (they were moved with `git merge --ff-only`, so nothing was
   rewritten). Nothing needs it.

   **Why an agent cannot do it: this container's proxy permits ref CREATION and
   UPDATE and refuses ref DELETION.** Measured today by two parties with three
   methods, and the two accounts agree:

   | method | result |
   |---|---|
   | `git push origin --delete <branch>` (exit-test runner) | `RPC failed; HTTP 403`, remote hung up |
   | `git push <url> ":refs/heads/<branch>"` (exit-test runner) | `RPC failed; HTTP 403` |
   | `DELETE /repos/.../git/refs/heads/<branch>` (exit-test runner) | HTTP 403, `Write access to this GitHub API path is not permitted through this proxy` |
   | `git push origin --delete <branch>` (orchestrator's own clone) | the same 403 |

   Ordinary pushes from the same credentials succeed, which is what makes this
   an asymmetry rather than a credential problem: the branch being deleted was
   pushed from this container minutes earlier.

   **This is a REDISCOVERY, not a discovery, and that is the part worth
   keeping.** Item 5 above records the same refusal measured on 2026-08-07 while
   closing A-4, in the same words. It was in this register and not in the
   standing environment warnings, so the next agent to try met it fresh and
   spent three attempts on it. Recorded in the exit-test bundle as finding F-3
   at `delivery/evidence/m3-exit-test/interventions.md` with that reasoning.

   **The consequence, stated plainly rather than left as tidiness.** The branch
   name matches `^claude/m3-p[0-9]+-`, and the stop-condition script harvests
   phase numbers from three sources, one of which is remote branch names. So
   while this branch exists, M3 reads as having a THIRTEENTH phase, and the
   other two sources say it does not exist: `git ls-tree origin/main
   delivery/plan/phase-declarations/` lists m3-p1 through m3-p12 and no m3-p13,
   and no `m3-p13.md` work history is on `main` either. The exit
   test's subject change was deliberately moved off that name for exactly this
   reason (intervention I-3 in the bundle), and until the branch is deleted the
   phantom is two-thirds prevented rather than prevented.

   **Id note, so a grep does not mislead the next reader.** `A-8` also appears
   in delivery/work-history/m3-p4.md:3596 as a local TEST-ARM label in a table
   of arms named A-1 upward. That is a different namespace inside one document,
   not an allocation from this register, and it predates this one. A grep for
   `A-8` therefore returns hits that are not this action.


## Owner decisions

The register is `delivery/decisions/` itself, one file per record. Measured
2026-09-23 on `main` at 6dc5b06, by reading each record's status line: every
record there was decided. DR-0014 and DR-0015 read "decided in principle", and
DR-0010, which the old table here still listed as open, reads "DECIDED BY THE
ORCHESTRATOR, 2026-09-15". A record raised after that measurement carries its
own status line, and any decision still open is listed in the standing section
at the top of this file, so this section does not restate either.

## Standing reminders

- **TWO CLAUDE.md AMENDMENTS ARE STILL QUEUED.** A third, DR-0044's concurrency
  reversal, was applied by M5-P5: CLAUDE.md's agent-concurrency section now
  says one workflow at a time. The two still waiting are each durable
  elsewhere, so neither is lost if the queue stalls: the claim grep's
  passive-voice gap, seven forms measured missed, in
  delivery/verification/the-claim-grep-catches-one-passive-assertion-and-misses-seven.md:1;
  and the fourth suite qualifier, git checkout versus `git archive` copy, in
  delivery/verification/a-suite-number-needs-a-fourth-qualifier.md:1.

- **PUSH EVERY PHASE BRANCH ON DISPATCH, NOT ON COMPLETION.** Measured
  2026-09-16: twelve M4 branches carrying 141 distinct commits existed only in
  this container and on no remote, for just over two hours of continuous
  multi-agent work. `git ls-remote --heads origin 'refs/heads/claude/m4-*'`
  returned zero lines. Nothing was lost, because the container was not
  reclaimed first, which is luck and not process. A commit is not a durable
  artifact; a pushed commit is. The full account is
  delivery/tuition/T-027-four-hundred-commits-lived-only-in-the-container.md:1.

- **THE STOP CONDITION HAD THREE GUARDS THAT COULD NOT GO RED, ALL IN ONE
  FILE.** Found in the same sitting. Its milestone defaulted to the literal
  "m3", complete since 2026-08-26, so the bare invocation printed "13/13
  merged, NOTHING LEFT" and exited 0 for every milestone after it. Its phase
  set was harvested from three sources that all read origin, so local-only work
  was not an unflagged phase but not a phase at all. Its worktree path was a
  hard-coded constant containing a different session's scratchpad id, a
  directory that does not exist, so the liveness half had been silently inert.
  All three are fixed; the milestone is derived, unpushed commits rank above
  every other action with exit 6, and worktrees are found with `git worktree
  list --porcelain`.

  **Run it bare and read the exit code.** 6 means push now; 2 means work
  remains; 3 means run the exit test; 4 or 5 mean the derivation is broken,
  which is a defect and never an idle repository.

- **A WATCHDOG MUST PRINT EVERY CYCLE.** The one armed before this ran for
  hours and emitted zero bytes, because it printed only on transitions. Its
  healthy output and its absence were identical, so it carried no information.
  It was also keyed on worktrees, and three review workflows dispatched on
  2026-09-16 had none, so six reviewers would have been unwatched. Key on the
  transcript the harness guarantees, not the worktree an agent may not create.
  Recorded as postscripts 5 and 6 of
  delivery/tuition/T-026-worktree-isolation-needs-a-git-cwd-and-fails-instantly-without-one.md:1.

- **DR-0012 CONDITION 1 IS APPLIED THROUGH A READING, AND THE READING MUST BE
  STATED IN EVERY MERGE COMMIT THAT USES IT.** The condition requires "two
  independent clean-room reviews for the CURRENT HEAD". Read literally, no phase
  that runs a fix round can ever satisfy it, because every fix moves the head.
  The reading this project uses, and has used since M3-P4 merged at `a7b7b07`:
  **the dual review covers the head's SUBSTANCE, and a structural delta
  verification covers everything that changed since.** M3-P5 merged on the same
  basis at `086b8df`, naming the dual pair at `48829d9` plus two delta
  verifications.
  The reading is precedented and defensible. It is ALSO a softening if it is
  never said aloud, and DR-0012's own heading says its terms are defined "so it
  cannot be softened later". So: name both halves in the merge commit, or do not
  rely on it. Do not reopen the decision record; this is how it is applied.
- **The documentation-only carve-out enumerates PATHS, and root-level artifacts
  are outside them.** The carve-out (one review rather than two) names
  `delivery/**`, `CLAUDE.md` and `.claude/**`. `assurance-modes.yaml`,
  `gate-registry.yaml` and `gates.manifest.json` are at the repository root and
  are in none of them, so a paperwork pull request touching one is not
  documentation-only by the text. When the change really is inert, SHOW it
  rather than asserting it: PR #99 repointed one citation inside a `#` comment
  and demonstrated the parsed document was deep-equal at both heads before
  relying on the carve-out. Dropping the file to make the boundary clean is the
  worse option when it means knowingly shipping a rotted citation.
- Parallelism is on under DR-0011, but MERGE order is still dependency order:
  work may be concurrent, landing may not. A parallel phase's PR never merges
  before the phases its grounding names.
- Milestone exit tests are hard gates, and their evidence goes to the owner
  even while merge authority is delegated.
- A plan written in parallel with implementation is re-grounded against
  everything learned since it was started, as an explicit step BEFORE its
  adversarial review (DR-0011, recorded consequence).
- Process paperwork must reach `main`, not only a side branch. This file
  exists because it once did not.
- **A PUSHED BRANCH WITH NO PULL REQUEST IS NOT ON THE PATH TO `main`, and the
  orchestrator has made this mistake three times.** The third and worst was
  `claude/paperwork-m3p3-merge`, which carried the arbitration AUTHORISING the
  M3-P3 merge: the phase was merged on the strength of a document that was not
  yet heading anywhere. It was caught by the OWNER asking why two review PRs
  were still open, which is the process being audited by the person it is meant
  to protect. Push and open the PR in the same turn; a branch is not evidence
  until it has somewhere to land.
- **Merge the evidence BEFORE or WITH the phase, not after it.** Merging the
  phase first is what stranded #76, #77 and #78, and it also costs a rebase per
  merge, since branch protection requires up-to-date-with-base and therefore
  405s every other open PR each time one lands.
- **A phase branch that exists is not a phase branch that is checked out.**
  Measured 2026-08-10: M3-P4's implementer created its branch, left HEAD on
  `main`, and committed its beacon there. Nothing was pushed, so `origin/main`
  never saw it, and it was corrected by moving the branch to the commit and
  resetting `main`, with no change to any file content. `git rev-parse
  --abbrev-ref HEAD` before every commit is the mechanical form; "remember to be
  on the branch" is not, and this project has recorded twice that a rule
  depending on memory does not survive a busy session.
- A merge is not complete until the post-merge `push` run on the new `main`
  head is observed green. The PR check and the push run execute DIFFERENT
  bundles, so a green PR check is not evidence about `main` (tuition T-009,
  which cost four hours and twenty-one minutes of red `main` and four merges
  landed on top of it).
- **EDITING A FILE BREAKS CITATIONS POINTING INTO IT FROM FILES YOU ARE NOT
  TOUCHING. This is the CONVERSE direction and it is easy to miss entirely.**
  Measured 2026-08-10, second occurrence the same day. `assurance-modes.yaml`
  cites the one-directional-check bullet in this file. Inserting the M3-P4
  round-1 section ABOVE that bullet moved it from 442 to 488 and left the yaml
  pointing at unrelated text, **in a file the change did not open**.
  The usual rule ("resolve your citations last") only covers citations you
  WROTE. It does not cover citations that point AT what you edited. The
  mechanical form for that direction: **after editing any file, grep the tree for
  citations naming it and re-resolve them**, because nothing else will.
  ```
  grep -rn 'delivery/STATE.md:[0-9]' --include='*.md' --include='*.yaml' . | grep -v node_modules
  ```
  **BUT DO NOT REPOINT EVERYTHING THE GREP RETURNS, and this rule produced its
  own counter-example the first time it was run.** That sweep found
  `delivery/review/clean-room-m3-p3-r8-criteria.md` citing `delivery/STATE.md`
  line 530 for the M3-P10 blocking obligation, which this edit moved to 728. It
  was left ALONE, deliberately. `delivery/review/` and
  `delivery/work-history/` are records of what was examined WHEN THEY WERE
  WRITTEN, which is why src/gates/citations.ts:185 removes both trees from the
  `documents` globs: re-checking them at head re-litigates settled history.
  Repointing that line would have made the record say something the reviewer
  never checked.
  **So the sweep's output splits in two:** forward-claiming documents
  (`delivery/plan/`, `delivery/verification/`, `delivery/decisions/`,
  `delivery/requirements/`, this file, and root-level files like
  `assurance-modes.yaml`) get repointed; historical records get left exactly as
  written. Getting this backwards corrupts the record in the name of tidiness.
  Neither direction is covered by the `citations` gate for a root-level file
  like `assurance-modes.yaml`, whose every `documents` glob is under
  `delivery/`.
- **A CITATION IS STALE THE MOMENT YOUR OWN INSERTION MOVES ITS TARGET, and the
  author is the last person who will notice.** Measured 2026-08-10, by the
  orchestrator, against itself. `assurance-modes.yaml` cites the
  one-directional-check bullet in this file. It was verified correct at
  `delivery/STATE.md:425` when written. Editing the main-head section ABOVE it,
  in a later commit on the same branch, moved the bullet to 442 and left the
  citation pointing at an unrelated sentence.
  This is the SAME defect M3-P3 round 10 shipped twice and that this file tracks
  as a merge low, and the orchestrator had warned the M3-P4 implementer about
  this exact trap thirty minutes earlier. Knowing the rule did not prevent it;
  running a check did.
  **`assurance-modes.yaml` is at the repository root, so it is NOT under the
  citations gate's `documents` globs** (all of which are `delivery/**/*.md` plus
  `delivery/STATE.md`). Nothing in this repository could have caught it.
  The mechanical form, and it is the only form that works: **resolve every
  `path:line` you wrote LAST, after your final edit to the cited file**, and
  check the line MEANS what it is cited for rather than merely existing. Doing
  it when you write the citation verifies a state your own later commits then
  invalidate.
- **CONSECUTIVE MERGES CANCEL EACH OTHER'S PUSH RUNS, so a per-head T-009
  discharge is not always achievable and must not be claimed.** Measured
  2026-08-10 while landing the M3-P3 evidence PRs: the push run on `f70c712`
  (run 31382497764) reports conclusion **cancelled**, because merging #76
  seconds later superseded it under the workflow's concurrency group. Its step 9
  `M2 exit test (push)` did reach **success**, and steps 10 and 11 too, but step
  12 was cancelled, so the run as a whole never completed.
  The honest reading, and the one to use: **step 9 succeeded, the run did not
  finish, and that is a PARTIAL observation rather than a discharge.** The trap
  is that step 9 is exactly the arm T-009 names, so quoting it alone produces a
  true sentence that reads as a complete one, which is the same shape T-009 and
  warning 12 both record.
  The rule when merges are batched: **discharge the FINAL head of the batch with
  a run that completed**, and say plainly that the intermediate heads were
  superseded rather than verified. An intermediate head's content is contained
  in the final head, so nothing is unverified; what is missing is a per-head
  claim, and the fix is to stop making one.

## Tracked obligations, unowned

Re-verified 2026-09-23 against `main` at 6dc5b06. Four items closed since they
were written and left this list: the `process.exit()` truncation (M4-P29,
src/gates/suite.ts:1166), the DR-0022 parser decision (M3-P3 merged), the
`package.json` 0.1.0 bump (it reads 0.2.0), and the missing `clause-map`
expectation row (present at scripts/m2-exit-test.sh:221).

- **`delivery/plan/m4-conflict-pre-pass.md:60` IS A BLANK LINE.** Found by the
  same reviewer while checking twenty-two citations by hand, hit rate 21 of 22.
  The wave-1b row naming M4-P23 is four lines further down. It is IN RANGE, so
  the citations gate stays green and the citation points at nothing, which is
  the silent-resolution trap CLAUDE.md:155 describes: the citation that reddens
  is not the dangerous one.

- **A witness can stop witnessing while every gate stays green (T-011).** Two
  instances in two consecutive M3-P3 rounds, both self-reported by the
  implementer and both confirmed independently. A `find` that stops matching is
  caught by `red-witness` rule (d); a `find` that STILL MATCHES a line whose
  meaning drifted is caught by nothing. The 97-member sweep is structurally blind
  to the second kind, because the drift was in a FIXTURE the witness reads rather
  than in the source its `find` points at. Whether `red-witness` should detect it
  is an open design question on M2-P2's file and may not be decidable
  mechanically; full record in
  `delivery/tuition/T-011-a-witness-can-stop-witnessing-silently.md`. Not assigned.

- **The two-member witness rule is enforced on a strict subset of what it is
  written as.** CLAUDE.md states it without qualification; `src/witness/run.ts`
  gates it on `spec.class === "classification" || derivation.textAsserting`, so
  an `additive` spec may declare two members that collapse to one with the gate
  green. Measured by the delta verifier: 22 of 43 specs exempt, 4 single-member,
  2 of those without a good excuse. Full record and the reason it is NOT being
  fixed in passing: `delivery/verification/red-witness-rule-g-exemption.md`. The
  guard is not wrong, it is narrower than its own statement, and which reading is
  right decides whether the fix belongs in the gate or in the sentence.

- **Two other sites carry the block-state mechanism M3-P3 round 3 fixed**, both
  reported with reproductions and neither edited because both are other phases'
  files: `src/gates/coverage.ts` `extractIdRows` admitted a fenced table row, and
  `scripts/check-clause-map.mjs` `parseInventory` admitted a fenced inventory row.
  The second compounds with the containment defect already reported at line 195
  of that same file.

  **CONFIRMED 2026-08-09, no longer provisional.** The round-3 delta verifier
  reproduced both independently (its finding V-7) and did not edit either, as
  instructed. So each has been demonstrated twice, by two agents that did not
  share a context: once by the implementer that found the mechanism and once by
  a verifier told only to confirm or refute.

  **Neither is assigned yet, and that is the honest state.** `src/gates/coverage.ts`
  is on M2-P6's declaration and `scripts/check-clause-map.mjs` on M3-P1's, so
  fixing either is an orchestrator-side change to shared harness code and owes the
  full fix-round contract under the T-009 corollary. Neither is urgent: both admit
  a FENCED example as real data, and no shipped artifact currently contains the
  triggering shape, which is the same "latent, not live" position V-1's fenced form
  held before `DR-0004` turned out to contain it. That precedent is the reason this
  entry does not read as safe: a latent shape becomes live the first time someone
  writes an ordinary document.

  The cheap check, if either is picked up: grep the artifacts each one parses for
  a fenced block, and say what the search did not cover.

- **`scripts/m2-exit-test.sh` is a structural bottleneck and is on no
  gate-adding phase's declaration.** It is the SINGLE caller of `gates run`
  (delivery/plan/kernel-plan-m3.md:663, settled at revision 3), so a gate is only real when
  this file selects it and gives it an expectation row. It is declared on
  `m2-p9.json` (its author) and nowhere else in M3. Measured: FOUR
  orchestrator-side fixes to it already (#27, #30, #44, and the pending
  `agent-rules-drift` one), and it has now blocked two phases in a row,
  M3-P1 (`clause-map`) and M3-P2 (`agent-rules-drift`).
  **Do NOT pre-emptively widen the remaining declarations**: M3-P6 and M3-P9
  edit the registry, but neither one's acceptance criteria demand CI
  execution, so adding the harness to them now would be inventing scope. The
  mechanism is instead a DISPATCH-TIME CHECK: before dispatching any phase
  that touches `gate-registry.yaml` or `gates.manifest.json`, read its
  criteria and ask whether the gate must RUN to satisfy them. If it must, the
  harness belongs on that phase's declaration; if it must not, expect an
  escalation and land the harness change yourself afterwards, as was done for
  `clause-map` in #44.


**The M1 to M3 "carried forward, not yet owned" backlog is NOT re-verified
here.** It is 22 items, from a non-atomic `meta.json` write to eleven accepted
unwitnessed mutants, at `git show 6dc5b06:delivery/STATE.md` lines 1307 to
1551. It left this file because nothing in it had been touched since M3 and it
cost every reader 17 KB; it did not become false by leaving. A phase that picks
one up re-verifies it against `src/` first, because some may already be fixed.

## M4 closure

**M4 is closed.** All thirty phases are merged; pull request #202 closed the
DR-0047 approval sweep on top of them at `main` `de1664d`, and the post-merge
`push` runs on that head were green (`gates` 35421893179, `macOS smoke`
35421893194). The merge-authority gate was fed on both arms for the first time,
evidence at delivery/verification/merge-authority-gate-fed-both-arms.md:1. The
full closure block, with the six HIGH defects the sweep's fix round fixed, is at
`git show 6dc5b06:delivery/STATE.md` lines 2633 to 2703.

**The M4 exit test did not run.** Its criterion at
delivery/plan/kernel-plan-v1.md:366 is the pilot's next phase merged and
deploy-verified entirely on v1. DR-0041 keeps it bound to the pilot, and DR-0042
permits reading the pilot and rebooting it. M5-P1 carries it; it waits on A-14.

### Residue, carried deliberately rather than lost

1. **Three sweep groups were not run: cutover, plugin, docs.** The owner cut them
   for budget after five groups had returned. Five of eight groups is what the
   approval evidence rests on, which is less coverage than DR-0047 designed.
2. **This head carries no approval stamp.** DR-0012 lends merge authority only
   against two independent clean-room reviews of the same head on different
   model families. Those were not bought for `de1664d`, so merge authority
   reverted to the owner, and the owner merged #202. That is the rule working
   rather than a workaround.
3. **The worktree arm of `check-dual-review` stays unanchored by design** and
   prints a sentence saying so. Only the audited-commit arm refuses a mismatched
   head.
4. **Two path classifiers remain separate**, left for a consolidation pass that
   no phase owns.
5. **The low-severity findings from the five groups that ran are unfixed.** They
   are in the group verdicts embedded under `delivery/review/`.

## Earlier milestones

M1 closed 2026-08-06 (hard stop released by the owner), M2 on 2026-08-07, M3
on 2026-08-20 with `@tiphys/kernel@0.1.0` published, tagged and released. Their
phase tables, pull request numbers and arbitration pointers are in
`git show 6dc5b06:delivery/STATE.md`, lines 1018 to 1306.

## History of this file

**This file holds the CURRENT standing only.** It was compacted by M5-P5 on
2026-09-23: every superseded daily status block, every closed tracked item and
the M1 to M4 progress tables left it, and none of them was rewritten. They are
in git history, which is the archive:

```
git show 6dc5b06:delivery/STATE.md     # the last uncompacted version, 2736 lines
git log -p --follow -- delivery/STATE.md
```

What each removed block was, and why it could go, is recorded block by block in
the `diet` array of delivery/plan/cutover/retirement-inventory.json:1, which a
test checks against that baseline.
