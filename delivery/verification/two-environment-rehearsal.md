# The two-environment rehearsal of the shared exclusion register

- phase: M4-P22
- branch: `claude/m4-p22-shared-exclusion-integration`
- plan section: delivery/plan/kernel-plan-m4.md:3050, criteria 4 and 5 at
  delivery/plan/kernel-plan-m4.md:3062
- run: 2026-09-17, node v26.6.0 at `/tmp/claude-0/n26/bin/node`, git 2.43.0
- subject: the layer M4-P21 built (src/exclusion.ts:1) and the three commands
  this phase wired to it, `doctor` (src/commands/doctor.ts:1545), `spawn`
  (src/spawn.ts:906) and `teardown` (src/teardown.ts:452)

## Why this document exists, and why criterion 5 is a criterion

T-025's rule is the reason this page leads with what it could NOT do:
a rehearsal that does not perform the check the real step performs cannot
fail the way the real step fails
(delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:30).
A rehearsal that stayed silent about its gaps would read as coverage of the
whole mechanism, and the gaps here are exactly where the mechanism is most
likely to be wrong.

## WHAT THIS REHEARSAL COULD NOT REACH

Written first, deliberately.

1. **TWO GENUINELY DIFFERENT MACHINES.** Everything below ran in one
   container. The two environments are two clones on two genuinely different
   FILESYSTEMS, which is what the plan asks for and is more than two
   directories: environment A sits on a tmpfs (`fsid=9c46f8f3fe50f392`) and
   environment B on the ext4 root filesystem (`fsid=27de05ad2e55ee6d`), and
   the transcript records the `stat -f` for both. That establishes that the
   local lease artifact cannot be shared by the filesystem, which is the
   property the layer exists for. It establishes NOTHING about two hosts: no
   network partition is exercised, no clock drift is real, and both clones
   reach the remote by one absolute path rather than over a network.
2. **TWO GENUINELY DIFFERENT SYSTEM CLOCKS.** The skew in step R2 and the
   takeover in R11 are INJECTED through `TIPHYS_LOCK_TEST_NOW_MS`, the seam
   M4-P21 built, and read by src/commands/lock.ts:120. No system clock was
   touched, which is deliberate: changing a container's clock would measure
   the container rather than the code (hazard H-K). The consequence is that
   the counter rule is exercised against a chosen instant and not against two
   machines that genuinely disagree.
3. **GITHUB'S OWN REF-UPDATE ORDERING UNDER CONCURRENT PUSHES.** Every
   register write below goes to a LOCAL BARE REPOSITORY over the file
   transport. Whether GitHub serialises two simultaneous
   `--force-with-lease=<ref>:<sha>` pushes to one ref the way a local bare
   repository does is INFERRED from M4-P20's probe
   (delivery/verification/cross-environment-exclusion-probe.md:1) and is NOT
   measured here. The remote this kernel targets also refuses three of the
   four ref namespaces M4-P21 probed, which is why the register is a branch
   at all, so the local bare repository and the real remote are not the same
   configuration in at least one known way.
4. **NO STEP BELOW RUNS CONCURRENTLY.** Each command completes before the
   next begins, so the transcript establishes the ORDERING rules and not the
   race. The single-winner property under a genuine race is M4-P20's
   measurement and M4-P21's witness, not this page's.
5. **NO PROTECTED REGISTER BRANCH.** The register is `refs/heads/tiphys/lease`
   and is therefore subject to any `refs/heads/**` ruleset. Nothing here
   exercises a remote that refuses the push, and the predicted failure mode is
   every acquire failing closed with a push refusal rather than a lease
   refusal.
6. **MACOS IS NOT EXERCISED.** Linux container only.

## What it DID establish, step by step

The transcript is complete and unedited except for the substitution named
below. Each step prints the command, its stdout prefixed `|`, its stderr
prefixed `!`, and its exit code. There are FORTY-FOUR blocks and FORTY-FOUR
exit codes: four record the toolchain and the two filesystems, eleven are the
setup S1 to S11, and twenty-nine are the rehearsal proper R1 to R29. The two
counts are checkable with `grep -c '^=== '` and `grep -c '^exit='` over this
file, and they are quoted as a pair because a step printed without its exit
code is the one a reader would take on trust.

| step | what it shows |
|---|---|
| R1 | environment A, opted in, register absent: `CHECK shared-lock PASS free` |
| R2, R3 | A acquires; the register commit on the remote carries A's environment id and fencing counter 1 |
| R4 | environment B, on the other filesystem, reads `CHECK shared-lock PASS held <A>` while its OWN `CHECK lock` says `no lease present` |
| R5, R6 | B's acquire is refused and the register sha is byte-identical afterwards |
| R7 | A spawns a task and the register permits it |
| R8, R9 | B spawns with NO local lease, so the M1-P4 holdership guard permits it, and the shared layer refuses; B's `worktrees/` and `tasks/` are empty afterwards |
| R10, R11, R12 | B observes once, then takes the fleet over when the counter has stood still; the register advances to counter 2 under B's id |
| R13 | A's local lease file is byte-for-byte what it was: a takeover on another filesystem cannot touch it |
| R14 | **THE DANGEROUS STATE, PRINTED AS TWO LINES.** `CHECK lock PASS lease held by <A's holder>` and `CHECK shared-lock PASS held <B>` in one run |
| R15, R16, R17, R18 | in that state A's spawn and A's teardown are both refused with one line each, and the `ls` before and after are identical: nothing created, nothing removed |
| R19, R20 | with the register unreachable the check is WARN and never PASS |
| R21 | `doctor --for full` promotes it to FAIL |
| R22, R23, R24 | spawn and teardown both fail closed, and again nothing is created or removed |
| R26, R27, R28 | B releases, A reads `free`, and A's spawn is permitted again, so the layer is a gate and not a wall |

**R20's exit code is 1 and that is NOT this check's doing.** Breaking A's
`origin` also breaks `CHECK remote`, which FAILs. R21 is the step that
attributes the promotion, because it prints every check line: `CHECK
shared-lock FAIL ... (required for profile full)` beside the others. The
honest summary is that the shared-lock STATUS WORD moves from WARN to FAIL
under `full`, and the run's exit code on this fleet home is decided by
several checks at once.

**One consequence nobody asked for, recorded because it showed up.** R21
prints `CHECK branches WARN 1 of 2 pushed branch(es) unmerged into
origin/main: origin/tiphys/lease`. The register IS a branch, so the branch
check counts it. That is not a defect in either check and it is not silenced
here: an operator of a fleet that has opted in will see the register listed
among their unmerged branches forever, because a register that is never
merged is the register working. M4-P21 predicted the visibility
(delivery/work-history/m4-p21.md:1); this is the first measurement of it.

## THE ONE SUBSTITUTION IN THE TRANSCRIPT

Three absolute paths and one long git flag list are rendered as tokens, and
nothing else in any captured line was altered:

- `<A>` is environment A's root on the tmpfs.
- `<B>` is environment B's root on the ext4 filesystem.
- `<KERNEL>` is the kernel checkout the CLI was run from.
- `git <IDENTITY-FLAGS>` is the command-scoped identity and transport
  configuration every fixture git call carried, spelled out once here rather
  than on forty lines: `-c user.name=tiphys-rehearsal -c
  user.email=rehearsal@tiphys.invalid -c commit.gpgsign=false -c
  protocol.file.allow=always -c push.negotiate=false`. Standing warning 5:
  identity is command-scoped and never written to user or global git
  configuration.

The environment ids, holder ids, shas, timestamps and counters are the REAL
ones that run produced and are left exactly as printed.

## The transcript

```
########## M4-P22 two-environment rehearsal
=== toolchain: node
$ node --version
| v26.6.0
exit=0

=== toolchain: git
$ git --version
| git version 2.43.0
exit=0

=== filesystem of environment A root
$ stat -f -c %T fsid=%i on %n <A>
| tmpfs fsid=9c46f8f3fe50f392 on <A>
exit=0

=== filesystem of environment B root
$ stat -f -c %T fsid=%i on %n <B>
| ext2/ext3 fsid=27de05ad2e55ee6d on <B>
exit=0

=== S1 create the shared fleet remote (bare)
$ git <IDENTITY-FLAGS> init --bare --initial-branch=main --quiet <A>/fleet.git
exit=0

=== S2 build a fleet home with the opt-in field
$ node <KERNEL>/bin/tiphys.ts init <A>/fleet-source --shared-exclusion
| initialized fleet home at <A>/fleet-source
| declared tiphys.sharedExclusion on origin at refs/heads/tiphys/lease
exit=0

=== S3 point it at the remote
$ git <IDENTITY-FLAGS> -C <A>/fleet-source remote add origin <A>/fleet.git
exit=0

=== S4 publish it
$ git <IDENTITY-FLAGS> -C <A>/fleet-source push --quiet origin HEAD:refs/heads/main
exit=0

=== S5 clone environment A, on the tmpfs root
$ git <IDENTITY-FLAGS> -C <A> clone --quiet <A>/fleet.git <A>/env-a
exit=0

=== S6 clone environment B, on the ext4 root
$ git <IDENTITY-FLAGS> -C <B> clone --quiet <A>/fleet.git <B>/env-b
exit=0

=== S7 a clone carries no state/ (the local lease cannot travel)
$ ls <A>/env-a
| backlog.md
| charter
| decisions
| package.json
| status
| tasks
exit=0

=== S8 the declaration both environments now carry
$ cat <A>/env-a/package.json
| {
|   "name": "tiphys-fleet-home",
|   "version": "0.0.0",
|   "private": true,
|   "description": "Tiphys fleet home. The kernel dependency below is an exact pin; changing it is how this fleet upgrades (blueprint section 3).",
|   "dependencies": {
|     "@tiphys/kernel": "0.1.0"
|   },
|   "tiphys": {
|     "sharedExclusion": {
|       "remote": "origin",
|       "ref": "refs/heads/tiphys/lease",
|       "staleWindowSeconds": 5
|     }
|   }
| }
exit=0

=== S9 a project upstream and a clone of it inside A
$ git <IDENTITY-FLAGS> init --initial-branch=main --quiet <A>/upstream
exit=0

=== S10 clone the project into A
$ git <IDENTITY-FLAGS> -C <A> clone --quiet <A>/upstream <A>/env-a/projects/demo
exit=0

=== S11 clone the project into B
$ git <IDENTITY-FLAGS> -C <B> clone --quiet <A>/upstream <B>/env-b/projects/demo
exit=0

=== R1 doctor in A before anything is held
$ (cd <A>/env-a && tiphys doctor)
| CHECK shared-lock PASS free (register refs/heads/tiphys/lease on origin holds no lease yet)
| CHECK lock PASS no lease present
exit=0

=== R2 A acquires the fleet (clock injected ten minutes behind, one hour of duration)
$ (cd <A>/env-a && TIPHYS_LOCK_TEST_NOW_MS=1789689031038 node <KERNEL>/bin/tiphys.ts lock acquire --duration 3600)
| acquired 20bdd52b-ace7-4926-9d11-c3a4fbd80e53 expires 2026-09-18T00:50:31.038Z
| shared exclusion: register refs/heads/tiphys/lease on origin was absent, claiming it for environment 32754273-8aa3-49b4-ba43-3f091bd17db1 at counter 1; signal=counter; register now 32210796d736fc984f6a7b41cec2f3ef6913f9f9
exit=0

=== R3 the register the remote now holds
$ git -C fleet.git rev-parse refs/heads/tiphys/lease
| 32210796d736fc984f6a7b41cec2f3ef6913f9f9
$ git -C fleet.git cat-file -p <sha>:lease.json
| {
|   "state": "held",
|   "envId": "32754273-8aa3-49b4-ba43-3f091bd17db1",
|   "counter": 1,
|   "acquiredAt": "2026-09-17T23:50:31.038Z",
|   "expiresAt": "2026-09-18T00:50:31.038Z",
|   "durationSeconds": 3600,
|   "ref": "refs/heads/tiphys/lease"
| }
exit=0

=== R4 doctor in B sees A holding the fleet
$ (cd <B>/env-b && tiphys doctor)
| CHECK shared-lock PASS held 32754273-8aa3-49b4-ba43-3f091bd17db1 until 2026-09-18T00:50:31.038Z (register refs/heads/tiphys/lease on origin, fencing counter 1)
| CHECK lock PASS no lease present
exit=0

=== R5 B tries to acquire
$ (cd <B>/env-b && TIPHYS_LOCK_TEST_NOW_MS=1789689631038 node <KERNEL>/bin/tiphys.ts lock acquire)
! tiphys lock: shared exclusion refused acquire: register refs/heads/tiphys/lease is held by environment 32754273-8aa3-49b4-ba43-3f091bd17db1 until 2026-09-18T00:50:31.038Z; signal=counter, fencing counter 1 has stood still for 0ms of the 5000ms this environment requires, and no clock comparison was made
exit=1

=== R6 the register is byte-identical after B's refused acquire
| before=32210796d736fc984f6a7b41cec2f3ef6913f9f9 after=32210796d736fc984f6a7b41cec2f3ef6913f9f9 same=yes
exit=0

=== R7 A spawns a ship task, which the register permits
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts spawn --task t-one --project <A>/env-a/projects/demo --brief <A>/brief.md --shape ship --exec <A>/payload.sh)
| spawned t-one worktree <A>/env-a/worktrees/t-one exec exited 0
exit=0

=== R8 B spawns, holding NO local lease, so the old guard permits it
$ (cd <B>/env-b && X=1 node <KERNEL>/bin/tiphys.ts spawn --task t-two --project <B>/env-b/projects/demo --brief <A>/brief.md --shape ship --exec <A>/payload.sh)
! tiphys spawn: shared exclusion refused spawn: the shared register names environment 32754273-8aa3-49b4-ba43-3f091bd17db1 as holding this fleet until 2026-09-18T00:50:31.038Z, and this environment is 0a5012aa-ae97-430a-86cd-743493e7db2f; the local lease is evidence about this filesystem only, so mutating tasks here would run a second orchestrator over one fleet; take the fleet over with: tiphys lock acquire --take-over; signal=counter
exit=1

=== R9 B created nothing
$ ls <B>/env-b/worktrees <B>/env-b/tasks
| <B>/env-b/tasks:
| 
| <B>/env-b/worktrees:
exit=0

=== R10 B observes the register once, arming its own stale clock
$ (cd <B>/env-b && TIPHYS_LOCK_TEST_NOW_MS=1789689631038 node <KERNEL>/bin/tiphys.ts lock acquire)
! tiphys lock: shared exclusion refused acquire: register refs/heads/tiphys/lease is held by environment 32754273-8aa3-49b4-ba43-3f091bd17db1 until 2026-09-18T00:50:31.038Z; signal=counter, fencing counter 1 has stood still for 0ms of the 5000ms this environment requires, and no clock comparison was made
exit=1

=== R11 B takes the fleet over once the counter has stood still
$ (cd <B>/env-b && TIPHYS_LOCK_TEST_NOW_MS=1789689637038 node <KERNEL>/bin/tiphys.ts lock acquire --take-over)
| acquired fc8d173b-ea65-4bb2-886c-a9611048e7b5 expires 2026-09-18T00:15:37.038Z
| shared exclusion: taking over refs/heads/tiphys/lease from environment 32754273-8aa3-49b4-ba43-3f091bd17db1, whose fencing counter 1 stood still for 6000ms; environment 0a5012aa-ae97-430a-86cd-743493e7db2f advances it to 2; signal=counter; register now c237b17b4f2f312745a4da4e6fb04ab5adc58793
exit=0

=== R12 the register after the takeover
| {
|   "state": "held",
|   "envId": "0a5012aa-ae97-430a-86cd-743493e7db2f",
|   "counter": 2,
|   "acquiredAt": "2026-09-18T00:00:37.038Z",
|   "expiresAt": "2026-09-18T00:15:37.038Z",
|   "durationSeconds": 900,
|   "ref": "refs/heads/tiphys/lease"
| }
exit=0

=== R13 A's local lease is untouched by that takeover
$ cat <A>/env-a/state/orchestrator.lock
| {
|   "holderId": "20bdd52b-ace7-4926-9d11-c3a4fbd80e53",
|   "hostname": "vm",
|   "acquiredAt": "2026-09-17T23:50:31.038Z",
|   "expiresAt": "2026-09-18T00:50:31.038Z",
|   "durationSeconds": 3600,
|   "token": "68936ad1-a8ff-417b-b330-d7de00ddf234"
| }
exit=0

=== R14 doctor in A: CHECK lock still says A holds it, CHECK shared-lock says B does
$ (cd <A>/env-a && tiphys doctor)
| CHECK shared-lock PASS held 0a5012aa-ae97-430a-86cd-743493e7db2f until 2026-09-18T00:15:37.038Z (register refs/heads/tiphys/lease on origin, fencing counter 2)
| CHECK lock PASS lease held by 20bdd52b-ace7-4926-9d11-c3a4fbd80e53, expires 2026-09-18T00:50:31.038Z
exit=0

=== R15 what A has before its refused commands
$ ls <A>/env-a/worktrees <A>/env-a/tasks
| <A>/env-a/tasks:
| t-one
| 
| <A>/env-a/worktrees:
| t-one
| t-one.pool.json
exit=0

=== R16 A spawns again: REFUSED
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts spawn --task t-three --project <A>/env-a/projects/demo --brief <A>/brief.md --shape ship --exec <A>/payload.sh)
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
! tiphys spawn: shared exclusion refused spawn: the shared register names environment 0a5012aa-ae97-430a-86cd-743493e7db2f as holding this fleet until 2026-09-18T00:15:37.038Z, and this environment is 32754273-8aa3-49b4-ba43-3f091bd17db1; the local lease is evidence about this filesystem only, so mutating tasks here would run a second orchestrator over one fleet; take the fleet over with: tiphys lock acquire --take-over; signal=counter
exit=1

=== R17 A tears down its own task: REFUSED
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts teardown --task t-one)
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
! tiphys teardown: shared exclusion refused teardown: the shared register names environment 0a5012aa-ae97-430a-86cd-743493e7db2f as holding this fleet until 2026-09-18T00:15:37.038Z, and this environment is 32754273-8aa3-49b4-ba43-3f091bd17db1; the local lease is evidence about this filesystem only, so mutating tasks here would run a second orchestrator over one fleet; take the fleet over with: tiphys lock acquire --take-over; signal=counter
exit=1

=== R18 what A has after the two refusals (nothing created, nothing removed)
$ ls <A>/env-a/worktrees <A>/env-a/tasks
| <A>/env-a/tasks:
| t-one
| 
| <A>/env-a/worktrees:
| t-one
| t-one.pool.json
exit=0

=== R19 break A's view of the register
$ git <IDENTITY-FLAGS> -C <A>/env-a remote set-url origin <A>/not-a-repository.git
exit=0

=== R20 doctor in A with the register unreachable
$ (cd <A>/env-a && tiphys doctor)
| CHECK shared-lock WARN unreachable register refs/heads/tiphys/lease on origin could not be read: fatal: '<A>/not-a-repository.git' does not appear to be a git repository
| CHECK lock PASS lease held by 20bdd52b-ace7-4926-9d11-c3a4fbd80e53, expires 2026-09-18T00:50:31.038Z
exit=1

=== R21 doctor --for full promotes it
$ (cd <A>/env-a && X=1 node <KERNEL>/bin/tiphys.ts doctor --for full)
| CHECK node PASS v26.6.0 satisfies kernel engines ">=26"
| CHECK git PASS git version 2.43.0
| CHECK gh FAIL gh not found on PATH, PR modes unavailable (required for profile full)
| CHECK layout PASS all layout entries present
| CHECK remote FAIL git fetch origin did not succeed, so this fleet's push target could not be reached and nothing about it is established: fatal: '<A>/not-a-repository.git' does not appear to be a git repository
| CHECK lock PASS lease held by 20bdd52b-ace7-4926-9d11-c3a4fbd80e53, expires 2026-09-18T00:50:31.038Z
| CHECK shared-lock FAIL unreachable register refs/heads/tiphys/lease on origin could not be read: fatal: '<A>/not-a-repository.git' does not appear to be a git repository (required for profile full)
| CHECK beacon WARN watcher not running or not scheduled
| CHECK identity PASS git commit identity configured (Claude <noreply@anthropic.com>)
| CHECK retention FAIL no charter document in <A>/env-a/charter, so no project is realized here yet and retention is not applicable (required for profile full)
| CHECK tasks PASS 0 open of 1
| CHECK branches WARN 1 of 2 pushed branch(es) unmerged into origin/main: origin/tiphys/lease
| CHECK worktrees PASS 1 pool entr(ies), each with a pool record beside it
| CHECK kernel-artifacts PASS the kernel install at <KERNEL> carries roles/, schemas/, checklists/ and AGENTS.md
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
exit=1

=== R22 A spawns with the register unreachable: REFUSED
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts spawn --task t-four --project <A>/env-a/projects/demo --brief <A>/brief.md --shape ship --exec <A>/payload.sh)
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
! tiphys spawn: shared exclusion refused spawn: unreachable register refs/heads/tiphys/lease on origin could not be read: fatal: '<A>/not-a-repository.git' does not appear to be a git repository; a register that cannot be read cannot show whether another environment is running this fleet, so this refuses rather than falling back to local-only exclusion; signal=clock, because no fencing counter could be read
exit=1

=== R23 A tears down with the register unreachable: REFUSED
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts teardown --task t-one)
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
! tiphys teardown: shared exclusion refused teardown: unreachable register refs/heads/tiphys/lease on origin could not be read: fatal: '<A>/not-a-repository.git' does not appear to be a git repository; a register that cannot be read cannot show whether another environment is running this fleet, so this refuses rather than falling back to local-only exclusion; signal=clock, because no fencing counter could be read
exit=1

=== R24 still nothing created and nothing removed
$ ls <A>/env-a/worktrees <A>/env-a/tasks
| <A>/env-a/tasks:
| t-one
| 
| <A>/env-a/worktrees:
| t-one
| t-one.pool.json
exit=0

=== R25 restore A's view of the register
$ git <IDENTITY-FLAGS> -C <A>/env-a remote set-url origin <A>/fleet.git
exit=0

=== R26 B releases the fleet
$ (cd <B>/env-b && TIPHYS_LOCK_TEST_NOW_MS=1789689638038 node <KERNEL>/bin/tiphys.ts lock release --holder fc8d173b-ea65-4bb2-886c-a9611048e7b5)
| released fc8d173b-ea65-4bb2-886c-a9611048e7b5
| shared exclusion: release by environment 0a5012aa-ae97-430a-86cd-743493e7db2f advances refs/heads/tiphys/lease to counter 3; signal=counter; register now 4176b24970252872bf5103d7a66a56d9c45c6370
exit=0

=== R27 doctor in A now reads free
$ (cd <A>/env-a && tiphys doctor)
| CHECK shared-lock PASS free (register refs/heads/tiphys/lease on origin was released by environment 0a5012aa-ae97-430a-86cd-743493e7db2f at fencing counter 3)
| CHECK lock PASS lease held by 20bdd52b-ace7-4926-9d11-c3a4fbd80e53, expires 2026-09-18T00:50:31.038Z
exit=0

=== R28 A spawns again and is permitted, so the layer is a gate and not a wall
$ (cd <A>/env-a && TIPHYS_HOLDER_ID=20bdd52b-ace7-4926-9d11-c3a4fbd80e53 node <KERNEL>/bin/tiphys.ts spawn --task t-five --project <A>/env-a/projects/demo --brief <A>/brief.md --shape ship --exec <A>/payload.sh)
| spawned t-five worktree <A>/env-a/worktrees/t-five exec exited 0
! watcher stale: 1 open task(s) in flight and no readable beacon at <A>/env-a/state/watcher.beacon; start "tiphys watch" or schedule "tiphys watch --once" at least every 1200s
exit=0

=== R29 A's worktrees at the end
$ ls <A>/env-a/worktrees
| t-five
| t-five.pool.json
| t-one
| t-one.pool.json
exit=0

########## identifiers used above
environment A id: 32754273-8aa3-49b4-ba43-3f091bd17db1
environment B id: 0a5012aa-ae97-430a-86cd-743493e7db2f
A local holder id: 20bdd52b-ace7-4926-9d11-c3a4fbd80e53
B local holder id: fc8d173b-ea65-4bb2-886c-a9611048e7b5
```

## How to reproduce it

The script that produced the transcript is the sequence in the table above,
run against a kernel checkout at `<KERNEL>`. It is not committed, because it
hard-codes two container-specific roots and would be a fixture nobody can run
unchanged; the steps are printed in full above and each one is a single
command.
