# Rollback of a failed cutover (D-19's second limb)

- phase: M4-P26
- date: 2026-09-15
- status: the procedure. It is executable steps, not prose.

## What this document discharges

D-19 is a binding planning requirement at delivery/plan/kernel-plan-v1.md:394.
It requires a rollback procedure for a failed cutover covering THREE DISTINCT
TRIGGERS: drain reversal, freeze-point restore, and retirement criteria unmet.
A procedure covering only "it broke" does not discharge it, and neither does a
narrative. Every step below names the COMMAND that performs it and the
OBSERVATION that proves it happened.

The phase section this document implements is at
delivery/plan/kernel-plan-m4.md:3334.

**What rollback is NOT.** It does not reopen the settled hard-cutover decision.
D-19 says so in its own sentence: what hard cutover excludes is dual-running
after acceptance, not recovery from a cutover that fails.

## The two halves, and one of them is cheap

**The FILES are cheap, and this document says so rather than dressing the whole
thing as expensive.** Everything under the retirement roots is git-tracked.
Restoring it is one `git checkout <sha> -- <root>` inside a guard, and the
guard is the only interesting part.

**The AUTHORITY is the expensive half.**
delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:15
prices the revert at "whatever phases ran under it". The branch-protection
ruleset is owner-configured, the orchestrator cannot change it, and both the
freeze and the unfreeze therefore carry owner latency. Neither is a git revert.

## The freeze point is FIVE SWITCHES, not one event

The five are DR-0025's retained items, listed at
delivery/decisions/DR-0025-controlled-pre-m4-local-pilot.md:45. Five
independently flippable switches are what make rollback PARTIAL rather than
all-or-nothing, and they are why the one switch with owner latency is separable
from the four that are not.

| switch | flipped back by | verified flipped by |
|---|---|---|
| `planning-and-scope` | the atomic rewrite of `cutover.json` | the switch line reads `current` in the re-read state, and the fleet commit that carries it is on `origin` |
| `review-and-arbitration` | the same atomic rewrite | same |
| `credentials-and-refs` | the rewrite records the INTENT; the ruleset and the grants are changed by the OWNER | the generated request is diffed against the live ruleset read through the API, and the diff is empty afterwards |
| `salvage-and-recovery` | the same atomic rewrite | same as the first row |
| `closeout` | the same atomic rewrite | same as the first row |

**Four of the five are a file write. One is not.** That asymmetry is the whole
reason the switches are separate, and collapsing them into one event is what
would make rollback all-or-nothing.

The rewrite is ATOMIC: the complete next state is assembled in memory and
published by one rename, so a failure part way through leaves the file holding
the five values it held before. A per-switch write would leave three switches
saying `kernel` and two saying `current`, which describes a process with no
owner for three of its five authorities. The implementation is at
src/cutover.ts:220 and the two witnesses are at test/cutover.test.ts:135 and
test/cutover.test.ts:177.

## Two subjects, not one

delivery/decisions/DR-0036-the-harness-adapter-leads-m4-and-the-kernel-is-the-second-subject.md:15
makes the kernel a second subject alongside the pilot, so a failed cutover
leaves a kernel MID-ADOPTION and a pilot MID-FLIGHT. A single-subject rollback
does not discharge D-19 as amended.

**The pilot half is not this orchestrator's to execute.**
delivery/decisions/DR-0037-the-kernel-is-m4s-only-subject-and-tiphys-has-no-opinion-on-project-visibility.md:19
keeps this orchestrator away from the pilot and its fleet.
delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:13
then allows READING it and records that the owner can reboot it. So the pilot
half of every trigger below is written as steps SOMEONE ELSE EXECUTES, plus
what this side verifies READ-ONLY.

| subject | who executes the rollback | what this side does |
|---|---|---|
| the kernel (this repository and its fleet) | this orchestrator | all of it |
| the pilot | the pilot's own operator, or the owner after a reboot (delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:65) | re-probe read-only and record what was observed (delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:62) |

**Consequence that must not be smoothed over: the pilot's drain is in the
CANNOT-SEE list, permanently.** This side can read the pilot; it cannot drain
it, cannot salvage its agents and cannot flip its switches. Every rollback
report prints that line rather than omitting it, because an absent line reads
as a clean one.

## Ordering when more than one trigger fires

**1, then 2, then 3.** Drain reversal is the only one of the three that can
LOSE WORK, so it goes first even when a freeze-point restore is also indicated.

## Drain is a COMPUTED PREDICATE, not a judgment

Drain counts IN-FLIGHT work only: live worktrees and open tasks with no
turn-end. It does NOT count pushed unmerged branches. That is decided at
delivery/plan/kernel-plan-m4.md:3279, and the reason is measured: this
container cannot delete a remote ref, and
delivery/verification/m4-prototype-probes.md:165 generalises the trap further,
to `git push --dry-run` not probing push authorization at all, in either
direction. A drain predicate over branches therefore blocks cutover on an owner
action with no local pre-check, which is a predicate that can never read clean.

No process is probed at any point (plan constraint C-2). A live worktree is a
DIRECTORY on disk. An open task is meta.json's status plus the ABSENCE of the
turn-end file. Nothing asks whether an agent is still breathing.

---

## TRIGGER 1: DRAIN REVERSAL

**Fires when** the cutover state reports a nonzero `DRAIN` line while at least
one switch reads `kernel`. That is: in-flight work exists that the old process
must handle, after drain was computed clean and cutover was entered.

**Rehearsable: FULLY.** `node scripts/rehearse-cutover-rollback.mjs --trigger
drain-reversal` exits 0 against a scratch fleet carrying two structurally
different in-flight items.

#### Step 1.1: enumerate the in-flight items BEFORE touching anything

- command: `tiphys cutover rollback --trigger drain-reversal --fleet <fleet> --json`
  prints the enumeration as its first act; the JSON is written to
  `delivery/plan/cutover/drain-reversal-<date>.md` with its exit code.
- observation: one `IN-FLIGHT <kind> <id> <detail>` line per item, and a
  `DRAIN <n> in flight` line whose n equals that count.
- rehearsable: FULLY.
- note: the enumeration is taken FIRST because it is the thing a crash would
  lose. The plan's step order writes the switches first; the observation is
  identical either way, and taking the list before the write keeps it when the
  write fails.

#### Step 1.2: set all five switches to `current` in ONE atomic rewrite

- command: the same invocation as step 1.1. It assembles the whole next state
  in memory and publishes it with one rename.
- observation: five `SWITCH <name> current` lines, and re-reading
  `<fleet>/cutover.json` yields five `current` values. On any failure the file
  is BYTE-IDENTICAL to what it was.
- rehearsable: FULLY.

#### Step 1.3: publish the rolled-back state to the fleet remote

- command: the same invocation commits and pushes the fleet home. It exits
  NONZERO if the push did not land, and `--allow-no-remote` downgrades a fleet
  with no origin to a printed `SYNC not-pushed <reason>` line rather than a
  silent skip.
- observation: `SYNC pushed <sha>`, and `git rev-parse origin/main` equals
  `git rev-parse HEAD` in the fleet home.
- rehearsable: FULLY, against a local bare remote.
- note: the failure arm is written first. A rollback that changes the file
  locally and does not land it leaves every other environment believing the
  switches are still `kernel`, and a swallowed push failure is
  indistinguishable from a push that worked.

#### Step 1.4: salvage each LIVE WORKTREE

- command: `tiphys teardown --task <id> --salvage`, which pushes the leavings.
  Where the pool record is absent because the fleet was reclaimed, the
  reconstructed-record path is used instead.
- observation: the exit code per item, recorded in the same document, and the
  worktree directory no longer appears in the next enumeration.
- rehearsable: PARTIALLY. The rehearsal performs the salvage EFFECT (commit the
  leavings, then remove the worktree) and prints a `NOT-INVOKED step 3` line
  naming what it did not call and why. The teardown command consumes a pool
  record owned by another phase.

#### Step 1.5: salvage each OPEN TASK with no turn-end

- command: the agent-salvage procedure, which is a process artifact executed by
  a human or an agent and not a command this side can call. It is quoted as
  `.claude/skills/agent-salvage/SKILL.md` until the retirement inventory ports
  it.
- observation: the task carries a turn-end record afterwards, so it stops being
  in flight, and the next enumeration does not name it.
- rehearsable: PARTIALLY, on the same terms as step 1.4, and the rehearsal
  prints a `NOT-INVOKED step 4` line.
- BINDING CONSTRAINT that follows from this step: **nothing in the retirement
  set is DELETED while trigger 1 is reachable.** The old path has to still
  exist for the rollback to have somewhere to go. Trigger 1 stays reachable
  until the switches have been `kernel` through at least one full phase with
  drain clean throughout.

#### Step 1.6: re-read and confirm

- command: re-read `<fleet>/cutover.json` and re-run the in-flight enumeration.
- observation: five `current` switches and `DRAIN clean`, exit 0.
- rehearsable: FULLY. The rehearsal asserts exactly this at its step 5.

#### Step 1.P: the pilot, read-only

- command: re-probe the pilot read-only and record what was observed. Do not
  flip, drain, or salvage anything there.
- observation: a written record of the pilot's own drain state, and a
  `CANNOT-SEE` line in this side's report saying the pilot's drain is not
  visible from here.
- rehearsable: NO. There is no scratch pilot, and reading a live third-party
  fleet is not something a rehearsal may do.

---

## TRIGGER 2: FREEZE-POINT RESTORE

**Fires when** work delivered under flipped switches is found to be wrong, and
authority must return to the current process for phases already run under it.
The revert cost is "whatever phases ran under it", which is why this trigger
has a re-audit step and trigger 1 does not.

**Rehearsable: NO for step 2.3, and its INPUT is rehearsable instead.**

#### Step 2.1: identify the flip

- command: `git log --format=%H -- cutover.json` in the fleet home.
- observation: the commits that moved a switch, newest first. Each switch
  carries its own `restore-to`, so restoration READS a recorded value rather
  than reconstructing an intent. A record missing `restore-to` is REFUSED
  rather than defaulted, and the refusal names the switch.
- rehearsable: FULLY.

#### Step 2.2: restore the FILES

- command: `tiphys cutover restore-files --repo <dir> --from <pre-freeze-sha>
  --root <path> [--root <path>]`, on a fresh branch cut from `main`, followed
  by a pull request.
- observation: `RESTORED <sha> <roots>` on exit 0. The command REFUSES with
  exit 1 and touches NOTHING when `git status --porcelain` is non-empty, and
  the refusal line names the count of uncommitted changes.
- rehearsable: FULLY.
- note: the dirty-tree guard is a precondition and not a warning printed
  alongside. ANY `git checkout --` in a tree holding uncommitted work is
  destructive, including when it names a single path, and this repository has
  paid for that twice (the agent-rules standing warning on `git checkout --`).

#### Step 2.3: restore the AUTHORITY

- command: `tiphys cutover restore-request --ruleset
  delivery/plan/cutover/pre-freeze-ruleset.json --out <path>` generates the
  request. **The request is then performed by the OWNER.** An `A-n` id is
  requested from delivery/STATE.md, which is the sole allocator.
- observation: `REQUEST <path> <n> field(s)`, where every field in the captured
  ruleset appears with its pre-flip value. The generator EXITS NONZERO and
  writes nothing when a field is absent, and ALSO when a field is present and
  empty. Afterwards, the generated request diffed against the live ruleset read
  through the API is empty.
- **rehearsable: NO.** See the table below for the property.

#### Step 2.4: re-audit every phase that ran under the flipped switches

- command: `git log --since=<flipped-at> --name-only -- delivery/work-history/`
  computes the phase list. Each phase is then re-reviewed under the restored
  authority.
- observation: for each phase, two independent clean-room reviews on different
  model families, no unresolved high or medium finding, CI green on the exact
  head, and a passing scope audit. Those conditions are owner-reserved and are
  NOT relaxed for a rollback.
- rehearsable: PARTIALLY. The PHASE LIST computation runs against a fixture
  repository. The reviews do not: they consume real review capacity on real
  phases, and a rehearsal with fabricated verdicts would be the exact
  fabrication those conditions exist to prevent.

#### Step 2.5: record the restore

- command: write a NEW decision record and update delivery/STATE.md.
- observation: the new record exists and cites the record being restored from.
  It is a NEW record and never an edit to the decided one, because a decided
  record is never reopened.
- rehearsable: FULLY, in the trivial sense that writing a file is checkable.

#### Step 2.P: the pilot, read-only

- command: ask the pilot's operator, or the owner after a reboot, to perform
  steps 2.1 to 2.5 on the pilot. Re-probe read-only afterwards.
- observation: a written record of what the pilot reported, marked as
  second-hand.
- rehearsable: NO, for the same reason as step 1.P.

---

## TRIGGER 3: RETIREMENT CRITERIA UNMET

**Fires when** the switches read `kernel` and drain is clean, but the
retirement evaluation exits nonzero: one or more `PORT` rows is `unported`, or
a ported destination is WEAKER than the rule it replaced. This is the trigger
that catches a cutover which completed on paperwork.

**Rehearsable: steps 3.1 to 3.3 FULLY.** `node
scripts/rehearse-cutover-rollback.mjs --trigger retirement-unmet` exits nonzero
against a fixture inventory carrying one deliberately weaker destination, and
exits 0 with `--port`.

#### Step 3.1: list the failing rows

- command: evaluate every `PORT` row of the retirement inventory.
- observation: one `PORT <id> ported|unported <reason>` line per row, and a
  NONZERO exit while any row is `unported`. The list IS the work item; no
  reading of the inventory is required to produce it.
- rehearsable: FULLY.

#### Step 3.2: for each failing row, port it properly or revert the retirement

- command: porting is ordinary work. Reverting uses step 2.2's mechanism, which
  is a file restore and is cheap.
- observation: the row's disposition afterwards is `PORT` with a passing
  witness, or `KEEP` with the source artifact still present. A row that is
  neither is still failing.
- rehearsable: FULLY. The rehearsal's repaired arm shows a row taking each of
  the two options.

#### Step 3.3: decide "weaker" by COMMAND, never by reading

- command: the row's `negative-witness` command, run against the NEW artifact.
- observation: the witness was RED under the old rule. It must be RED under the
  new artifact too. A witness that exits 0 means the new artifact does not
  catch what the old one caught, so the row is `unported` and NOT a pass. A
  verdict derived only from the destination file existing is the vacuous
  version: a file can exist and say nothing.
- rehearsable: FULLY, and the fixture is built so the weak and strong arms
  differ ONLY in the witness result. Both destinations exist as files.

#### Step 3.4: repeat from 3.1, or flip back

- command: repeat step 3.1 until exit 0. If a row cannot be ported within its
  round budget, flip the switches back under trigger 2.
- observation: exit 0 from step 3.1, or a trigger 2 record. A row that consumes
  its budget gets a fresh implementer, and is not an owner question.
- rehearsable: the repeat is; the flip-back inherits step 2.3's unrehearsable
  execution and nothing more.

#### Step 3.P: the pilot, read-only

- command: the pilot's retirement inventory is the pilot operator's to
  evaluate. Re-probe read-only and record.
- observation: a written record, marked second-hand.
- rehearsable: NO, for the same reason as step 1.P.

---

## The steps that CANNOT be rehearsed, and the property that makes each so

**This section exists because a rehearsal that silently skipped a step, and
exited 0 on the steps around it, is worse than no rehearsal.** The rehearsal
script therefore REFUSES trigger 2 with its own exit code 3 and prints one line
naming the property, rather than passing over it.

| step | the property that makes it unrehearsable |
|---|---|
| 2.3, restore the AUTHORITY | the branch-protection ruleset is a single live object on one owner-owned repository: there is no second instance to rehearse against, and no dry run distinguishes allowed from refused |
| 2.4, the re-reviews | they consume real review capacity on real phases; a rehearsal with fabricated verdicts is the fabrication the conditions exist to prevent |
| 1.P, 2.P, 3.P, the pilot halves | there is no scratch pilot, and this side may read the pilot but may not act on it |
| 1.4 and 1.5, the salvage commands | they consume records owned by other phases; the rehearsal performs the EFFECT and prints what it did not call |

**The precedent is exact and it is in this repository.** The first real publish
of 0.1.0 was refused by the registry after four dry runs all exited 0, and the
dry run that mattered is the row at
delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:40.
A property only the registry checks is a property nothing local can be red
about. The same record names the transferable practice, which is the one
applied here: writing the asymmetry down BEFORE the action is what makes the
failure a known cost rather than an accident
(delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:57).

The second measured instance of the same shape is
delivery/verification/m4-prototype-probes.md:165: four target refs, all four
reported as pushable by `--dry-run`, three refused with HTTP 403 in reality.

So step 2.3 is rehearsed in its PREPARATION and not in its EXECUTION. The
rehearsal asserts that the generated request is complete and that every field
carries a recorded pre-flip value. **It asserts NOTHING about whether the
owner's change will be accepted**, and the generated request says so in its own
text so that a reader of the request cannot mistake one for the other.

## What this procedure does NOT cover

Stated here rather than left for a later reader to assume it covers more.

1. **Work an agent held only in its own session.** That boundary is already
   fixed at AGENTS.md:304: anything an agent held only in its own session is
   gone. Rollback restores what was committed and pushed, and nothing else.
2. **An npm publish.** A published version is not unpublished by anything here.
   Rollback of a release is a new version, not a retraction.
3. **Deletion of a remote ref.** This container cannot delete a remote ref, and
   the dry-run exits 0 either way, so branch cleanup is an OWNER action with an
   `A-n` id and is never part of a rollback step. This is also why drain does
   not count branches.
4. **The pilot's own state.** This side reads it and records what it read. It
   does not roll it back.
5. **Anything that was never in `cutover.json`.** The procedure restores the
   five switches and the retirement roots. A change made outside both is
   outside the procedure, and the honest answer is that it has to be found by
   reading the diff rather than by running a command.

## Running the rehearsal

```
node scripts/rehearse-cutover-rollback.mjs --trigger drain-reversal
node scripts/rehearse-cutover-rollback.mjs --trigger retirement-unmet
node scripts/rehearse-cutover-rollback.mjs --trigger retirement-unmet --port
node scripts/rehearse-cutover-rollback.mjs --trigger freeze-point-restore
node scripts/rehearse-cutover-rollback.mjs --trigger freeze-point-restore-input
```

Exit codes: 0 every observation held, 1 an observation did not hold, 2 usage,
3 REFUSED because the trigger has a step that cannot be rehearsed, 4 the
script's own assertion helper does not discriminate. The captured output of all
five is in delivery/work-history/m4-p26.md:1.

**Exit code 4 exists because the gap was measured.** Before it, an assertion
helper that agreed with everything left all four rehearsal tests green and the
script exited 0. Every arm now puts a deliberately disagreeing pair through the
same helper before it runs, and prints `SELF-CHECK OK`. A rehearsal whose
verdict machinery has stopped working must not be able to report a green, which
is the same property this whole document exists to give the rollback.
