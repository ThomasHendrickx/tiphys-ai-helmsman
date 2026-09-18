# The freeze point: five switches, a drain predicate, and a precondition

- phase: M4-P25
- plan section: delivery/plan/kernel-plan-m4.md:3266
- decided here and not reopened: M4-D-15, delivery/plan/kernel-plan-m4.md:3279
- companion documents: delivery/plan/cutover/rollback.md:1 (how a freeze is
  undone) and delivery/plan/cutover/retirement-inventory.md:1 (what moves)

## What a freeze point is

It is a CONDITION, not a date, and it lifts exactly once. The condition is
computed by `tiphys cutover status` from files and from git, never from
anybody's judgment, and the command exits nonzero while it is unmet.

The condition has three parts and all three must hold:

1. all five switches read `kernel`;
2. drain is clean;
3. the pre-freeze capture is present and is no older than the most recent
   switch write.

## The five switches

The list is CLOSED. A sixth name is a plan revision, not a code edit, because
every rollback trigger enumerates them. They are declared once, at
src/cutover.ts:73, and the status command iterates that list rather than the
document's own keys, so a file carrying a stray key cannot change the shape of
the report.

| switch | what it governs |
|---|---|
| `planning-and-scope` | the plan and every scope decision |
| `review-and-arbitration` | independent review and fix-round arbitration |
| `credentials-and-refs` | every GitHub credential and every push, pull-request, merge and branch-protection action |
| `salvage-and-recovery` | salvage and recovery when work is left incomplete |
| `closeout` | phase closeout and the post-merge duties |

Five switches rather than one event is what makes the rollback in
delivery/plan/cutover/rollback.md:1 partial rather than all-or-nothing, and it
is why `credentials-and-refs`, the one switch with owner latency, is separable
from the four that are not.

Every switch WRITE records four things: `flippedAt`, `flippedBy`, `reason` and
`restoreTo`. The requirement lives in the shipped schema,
schemas/cutover-state.schema.json:1, and not in the command that happens to be
writing, because rollback reads the recorded `restoreTo` rather than
reconstructing an intent. A record without one is a switch that can never be
rolled back, so a write missing it is refused and nothing is written.

**The plan spells those four `flipped-at`, `flipped-by`, `reason` and
`restore-to`, and the document spells them in camelCase.** The document's
spelling is the one that was already shipped and read (src/cutover.ts:101), so
the schema pins that and the plan's spelling is read as prose naming the four
fields rather than as their serialised keys. This is written down because the
difference is exactly the kind that costs a round when it is discovered instead
of stated.

## Drain: what it counts, and the omission is the decision

Drain counts IN-FLIGHT WORK ONLY: live worktrees and open tasks with no
turn-end file, enumerated at src/cutover.ts:518. It also counts what it could
not decide, as a third kind, because an entry a predicate cannot read has not
been found clean.

**It does NOT count pushed unmerged branches.** That is M4-D-15
(delivery/plan/kernel-plan-m4.md:3279) and the reason is measured rather than
preferred: this container cannot delete a remote ref, and
`git push --dry-run` does not probe push authorization at all, in either
direction, for any ref namespace (delivery/verification/m4-prototype-probes.md:165).
A drain defined as "no unmerged branches" therefore waits forever on an owner
action that has no local pre-check, which is a predicate that can never read
clean.

The branch count IS printed, on its own line, after the drain verdict:

```
DRAIN clean
BRANCHES 7 pushed and unmerged, informational: drain does not count branches (M4-D-15)
```

It is informational and it does not vote. Branch cleanup is a separate owner
action and it does not gate cutover.

Constraint C-2 is load-bearing in this predicate. A live worktree is a
DIRECTORY on disk and an open task is a file state. No process is probed, no
pid is read, and nothing asks whether an agent is still breathing.

## The precondition that cannot be rehearsed, and its input that can

**No switch may report `kernel` while
delivery/plan/cutover/pre-freeze-ruleset.json is absent, or older than the most
recent switch write.** The guard is at src/cutover.ts:1458 and it has three
answers, not two: `not-required` while nothing is frozen, `satisfied`, and
`refused` naming which of the two arms it hit.

The capture exists because restoring AUTHORITY after a failed cutover is an
owner action whose execution cannot be rehearsed (T-025, delivery/tuition/T-025-the-one-path-that-cannot-be-rehearsed-is-the-one-that-failed.md:1).
Its INPUT can be, and that is what the file is: the branch-protection ruleset as
it stood before the first flip.

**The comparison is content to content, not mtime to mtime.** A working-tree
mtime is set by whatever checkout produced the tree, so on a fresh clone every
file looks newer than every recorded instant, and an mtime-based guard would
report satisfied on exactly the machine a reviewer uses. The document therefore
records `captured-at` and the guard reads it. A capture with no `captured-at`,
or one that does not parse as an instant, is refused rather than accepted:
treating it as satisfied would make a malformed capture indistinguishable from
a good one.

**What the shipped capture does and does not contain.** The ruleset half is
real: three endpoints answered 200 and their bodies are recorded verbatim. The
credential-grant half is not: three endpoints were refused, two of them by the
agent proxy and one by GitHub, and the file names each one with its status code
and the consequence. Completing that half needs access this container does not
hold.

## The retirement criteria

`tiphys cutover status --retirement` prints one line per `PORT` row of
delivery/plan/cutover/retirement-inventory.json:1 and exits nonzero while any
row is `unported`.

A row is `ported` only when BOTH halves hold:

1. every kernel artifact its `destination` names exists as a file; and
2. that row's `negative-witness` command is RED under the new artifact, with
   the exit status the row recorded.

**The second half is the one that matters.** A verdict derived from the file
existing alone is the vacuous version: a file can exist and say nothing. The
negative witness was red against a subject that does not carry the rule, so a
witness exiting 0 under the new artifact means the probe discriminates nothing,
which is precisely "weaker". The derivation is at src/cutover.ts:1185.

**And a nonzero exit is not automatically a red witness.** `grep` exits 1 when
it searched and found nothing and 2 when it could not search at all. Accepting
any nonzero status reports a row as ported on the strength of an error message,
so the row's own recorded exit is required to match.

The rows are DATA FROM A FILE. Every command is screened before anything spawns
it, on the executable position of each segment rather than on the whole string,
against an allowlist of tools that have no option for writing a file. That is a
TOOL allowlist and not a sandbox, and the difference is stated rather than
implied: the child still runs with the command's own privileges and can read
whatever it can read.

## Reading the report

```
tiphys cutover status --fleet <dir> [--repo <dir>] [--json]
tiphys cutover status --retirement [--repo <dir>] [--inventory <path>] [--json]
```

Exit codes, and the third one is the point: 0 the condition is met, 3 the
question was answered and WORK REMAINS, 1 the command refused to answer, 64 a
usage error. A cutover that has not completed is not a failure of the command,
and a caller that cannot tell those apart cannot script anything. The same
split is what `tiphys next` uses (delivery/plan/kernel-plan-m4.md:3234).

The report always prints what no local command can see: open pull requests, CI
conclusions, post-merge push runs, and whether the pilot's own fleet is drained
(src/cutover.ts:690). That block is NOT abbreviated when the answer is short,
because a command that prints less when it has less to say is
indistinguishable from one reporting a quiet system.

## What this document does not cover

1. **It does not flip anything.** This phase ships the capability and does not
   exercise the authority. Under DR-0036 merge authority stays with the current
   process for the whole of M4 regardless, and nothing on `main` changes state
   because this phase landed.
2. **Deletion of retired artifacts is not here.** When it happens it ships in
   ONE pull request with its replacement (DR-0031), so that `main` never
   asserts evidence for code it does not contain nor carries code its evidence
   does not cover. Nothing is deleted in this phase.
3. **The credential-grant half of the pre-freeze capture is incomplete**, as
   the capture itself records. The ruleset half is complete.
4. **The pilot is not this orchestrator's subject** (DR-0037), so its drain is
   in the cannot-see list rather than in the predicate.
