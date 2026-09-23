# T-046: an agent killed another agent's tests by pattern

## What happened

On 2026-09-23 at about 10:40Z, the implementer of the release-verify fix
(PR #211) cleaned up its own stopped suite run with `pkill -f` on the path of
the shared Node 26 interpreter. Several agents were running on the same
container with that same interpreter. The pattern matched their processes too.

One of them was the M5-P2 implementer's local PR bundle, whose red-witness step
was at that moment running mutated doctor tests. That bundle run went red on
witness/doctor-retention-not-applicable-and-undeclared-stay-distinct.json: the
clean-head run for one member exited 1 and its named test was reported missing,
neither passed nor failed. A rerun with nothing changed was green. The M5-P2
implementer could not explain it and recorded it as an open intermittent. The
cause surfaced only because the other implementer reported its own `pkill`.

The implementer's own report is the evidence, in
delivery/work-history/release-verify-waits-for-registry.md:446 on that branch.

## The mechanism

**A process pattern names a program, not an owner.** On a machine where
several agents run the same interpreter from the same path, `pkill -f <path>`
selects every agent's processes, and nothing tells the killer which were its
own. The victim sees a failure with no cause in its own work, which is the
worst kind: it reads as flakiness, and flakiness gets re-run and forgotten.

This is the process-identity mistake constraint C-2 forbids in kernel code,
made by an agent in its own housekeeping.

## What changes

1. Every implementer and reviewer brief says: never `pkill` or `killall` by
   pattern; kill only process ids you started and recorded yourself, or a
   process group you created.
2. An unexplained test that "went missing" or died mid-run, on a container
   shared with other agents, is first checked against the other agents'
   reports for that time window before being called intermittent.
