# Verification: controlled macOS portability pilot lifecycle

- task: `macos-portability-pilot`
- authority: DR-0025 and DR-0026
- fleet: `/Users/thomashendrickx/Projects/private-ai-harnesses/tiphys-pilot-fleet`
- implementation PR: [#89](https://github.com/ThomasHendrickx/tiphys-ai-helmsman/pull/89)
- reviewed PR head: `0997de2bdc756c895ba2eeb55f8ce9ead4c5e7ca`
- merged commit: `1e020983d7f5de1bb212113f240a0982fd3ac83e`
- closeout status: complete on `main` through PR 91 (`c154ef8`)
- pilot verdict: partial controlled pilot; delivery, watcher, landedness, and
  teardown succeeded, but the
  implementation agent could not perform the plan-required local commit and
  the current process had to recover it, and final-head delta-review outcomes
  were not committed before merge; this is not M4 cutover or acceptance of
  the temporary harness adapter

## Grounding

The owner's original authorization and role split are recorded at
delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:25 and
delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:33. The separate
post-teardown record and partial-verdict rule come from
delivery/plan/macos-portability-pilot.md:138 and
delivery/plan/macos-portability-pilot.md:174. DR-0026's exact current-head and
committed-review conditions are at
delivery/decisions/DR-0026-current-process-pilot-fix-round.md:44. The failed
implementation-agent commit and current-process recovery are preserved at
delivery/work-history/macos-portability-pilot.md:117 and
delivery/work-history/macos-portability-pilot.md:142.

## Delivered result

PR 89 was squash-merged at `2026-08-11T17:01:34Z`. Before merge, its exact
head passed Linux `gates` run `31514292346` and macOS smoke run `31514292350`.
After merge, the exact merged commit passed Linux `gates` run `31515461801`
and macOS smoke run `31515461767`.

The substantive and evidence head
`a7603568ebfdc389299962ecab0e16e380a64f8d` received two independent Codex
clean-room reviews under distinct criteria and adversarial briefs. Both
reported no findings. Their committed reports are
`delivery/review/clean-room-macos-portability-pilot-final-criteria.md` and
`delivery/review/clean-room-macos-portability-pilot-final-adversarial.md`.
Two further independent read-only sessions checked the evidence-only delta
from `a760356` through final PR head `0997de2` and reported no findings, but
their outcomes were not committed before merge. They therefore do not satisfy
DR-0026's durable current-head review-evidence requirement. The Claude-family
reviewer was unavailable, so the reviews used the Codex fallback the owner
expressly authorized in DR-0026; model-family diversity was waived, and the
missing durable delta record remains a process deviation rather than being
rounded up to compliance.

Final local verification before delivery was green: build; 74 focused tests
with no skip; all 517 tests with no skip; all five red-witness units with each
declared mutation red; repository-wide authored-byte checking;
`git diff --check`; and exact `npm pack --dry-run --json` with 125 files. The
full commands and the pinned red-witness invocation are in
`delivery/work-history/macos-portability-pilot.md`.

## Lifecycle result

Tiphys created the fleet task at `2026-08-11T15:04:53.833Z` from base
`37577e6b83b60b9b6b381d748ef328dc51f30cd8`, allocated branch
`task/macos-portability-pilot` and its worktree, assembled the persisted brief,
and launched exactly one synchronous `subprocess` adapter at
`2026-08-11T15:04:53.834Z`. The durable turn-end record says the executor
ended at `2026-08-11T15:23:11.162Z` with exit code 0. No second Tiphys
subprocess ran during the DR-0026 fix round.

Tiphys watcher state was active during implementation and first exposed the
turn-end event at `2026-08-11T15:23:11.174Z`. The current process observed
that persisted state, but the durable evidence does not identify who invoked
or hosted the pre-merge watcher. After merge, the current process ran the
merged Tiphys watcher once. It exited 0 with `heartbeat 1` and rewrote
`state/watcher.beacon` at `2026-08-11T17:03:16.894Z`, with backoff streak 1
and interval 120000 ms. This proved the watcher path again without launching
an executor.

Before teardown, the current process verified that the worktree was clean,
both required post-merge checks were green on `1e020983`, and
`git merge-tree --write-tree refs/remotes/origin/main
refs/heads/task/macos-portability-pilot` produced the same tree
`c1ff56a7aea253d00758aa93fac9d21d18389837` as `origin/main`. It then ran,
with the matching lease holder transported outside the task brief:

`TIPHYS_HOLDER_ID=8d57d3ba-f561-455c-a988-874cee0880e0 node projects/tiphys-ai-helmsman/bin/tiphys.ts teardown --task macos-portability-pilot`

The command exited 0 and printed `torn down macos-portability-pilot`. No
`--salvage`, discard, forced branch deletion, or source edit was used. Tiphys
recognized the squash-landed tree, marked the task closed, removed the task
worktree and pool record, unregistered the worktree, and removed the local
task branch. The current process then released the matching lease; the lock
record is absent.

## Surviving fleet evidence

The separate fleet remains recoverable locally. The project clone is on
`main` at `1e020983`. `tasks/macos-portability-pilot/meta.json` survives with
`status: closed`, along with `brief.md`, `executor.json`, `implementer-final.md`,
`turn-end`, and `turn-end-hook.mjs`. The watcher beacon, cadence, seen, and
last-wake records survive under `state/`. The task worktree, its pool record,
the local task branch, and `state/orchestrator.lock` do not survive, as intended
after successful teardown and lease release.

## Authority crossings and deviations

Tiphys commands and mechanisms managed fleet initialization and diagnosis,
lease mechanics, pool/worktree/task allocation, brief assembly, the single
subprocess launch, executor and turn-end records, watcher state, and guarded
teardown. The current process invoked the watcher and consumed its observation
after merge. During implementation it consumed persisted watcher state, but
the invoker and host of that pre-merge watcher were not durably captured; this
unknown crossing is not assigned retrospectively. The temporary adapter
exposed only the local Codex-client authentication handoff, fed the persisted
brief to one local Codex process, captured its final message, and returned its
exit status. Its sha256 and the exact brief sha256 are pinned in the work
history.

The current delivery process retained planning and scope, adapter preparation,
review and arbitration, Git recovery, all GitHub credentials, branch and PR
operations, merge authority, teardown readiness judgment, lease release, and
this closeout. Under DR-0026 it also resolved PR 89's three findings directly
and used independent Codex clean-room review because the Claude-family reviewer
remained unavailable. Those actions did not expand Tiphys authority.

The controlled implementation process could edit the task worktree but its
sandbox could not create the shared Git worktree index lock, so the current
process performed the authorized audit, staging, and commit recovery. The
same sandbox denied localhost listeners and npm log writes beneath its
redirected HOME; unrestricted host verification subsequently passed. Other
recorded deviations were one dependency-free test attempt, one transient npm
DNS failure, an isolated accidental `tiphys init --help` fleet moved
recoverably to `/tmp`, and broader host-read permission in the Codex workspace
than credential scrubbing alone implies. None of those operational deviations
lost work or bypassed CI, landedness, or teardown guards, but the Git
common-directory write boundary and broad read boundary are adapter-hardening
inputs for M4.

The two final evidence-delta review sessions reported no findings but were not
written into durable review records before PR 89 merged. The substantive and
evidence head had two committed independent reviews, and the final delta only
changed those reports and corrected their base label, but DR-0026 required
current-head outcomes to be committed before merge. The merge therefore did
not fully meet that process condition. This cannot be repaired retroactively
and is part of the partial verdict.

## Boundary conclusion

When this record is durable on `main`, the final pilot verdict is partial. The
unfinished kernel managed the authorized fleet, worktree, task, subprocess,
watcher-state, and safe squash-aware teardown surfaces for one real macOS
portability delivery, while the retained current process supplied every
authority explicitly excluded from Tiphys. The implementation agent did not
complete the plan-required local commit because its sandbox could not write
the shared Git worktree index; current-process recovery made the code safe and
deliverable but does not turn that missed lifecycle step into success. The
final-head delta reviews also lacked the durable pre-merge evidence required by
DR-0026. Before this closeout landed, the plan defined the pilot itself as
incomplete. PR 91 completed that durability step without changing the partial
verdict. This is evidence for the exercised lifecycle surfaces only. It neither
decides DR-0010, lifts the M3-P4 stop, accepts the temporary adapter, nor claims
M4 self-hosting or cutover.

## Post-landing reconciliation (2026-08-12)

PR 91 made this closeout durable on `main` as `c154ef8`. That satisfies the
plan's criterion 15 durability condition and completes the closeout process.
It does not change the measured pilot verdict from partial to successful.

The three recorded gaps classify as follows:

1. The implementation agent's local commit is inherently historical. The
   binding sequence assigns that commit to the implementation agent at
   delivery/plan/macos-portability-pilot.md:157, and the persisted brief also
   required that agent to finish with one local commit and a clean worktree.
   The current process's recovery commit safely preserved and delivered the
   work, but a later commit cannot make the implementation agent have completed
   the missed step.
2. DR-0026's final-head review-evidence condition is inherently historical.
   The decision required both current-head outcomes to be committed before
   merge at delivery/decisions/DR-0026-current-process-pilot-fix-round.md:48.
   The sessions reported no findings, and the closeout already records that
   fact, but committing a new summary after PR 89 merged cannot satisfy a
   before-merge condition.
3. The pre-merge watcher invoker and host remain unknown. A post-landing audit
   of the surviving task and watcher records found timestamps, cadence, wake,
   and task identity, but no invoker, process identity, session, or host field.
   Assigning one now would manufacture provenance rather than recover it.

No further documentation can truthfully upgrade this completed partial pilot
to a successful pilot. Re-exercising the missed lifecycle properties would be
a new pilot, not remediation of the 2026-08-11 run. That requires explicit
owner authorization because DR-0025 authorizes exactly one controlled
subprocess and DR-0026 expressly authorizes no second Tiphys subprocess at
delivery/decisions/DR-0026-current-process-pilot-fix-round.md:35. No new
subprocess was run for this reconciliation, and it makes no M4 adapter,
self-hosting, or cutover claim.
