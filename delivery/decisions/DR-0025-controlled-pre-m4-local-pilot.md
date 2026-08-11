# DR-0025: One controlled pre-M4 local self-delivery pilot

- id: DR-0025
- project: tiphys-kernel
- task: macos-portability-pilot
- question: May the unfinished Tiphys kernel manage the local lifecycle of one
  real change before M4 without claiming that M4 cutover or the harness adapter
  is complete?
- reversibility: reversible; the pilot uses a separate fleet home and the
  current delivery process retains every authority the unfinished kernel does
  not yet implement
- status: decided by the owner
- decided: authorize exactly one controlled pre-M4 local pilot for the macOS
  portability task, within the boundary below
- date: 2026-08-11

## Id allocation

`DR-0025` was checked across the full git history before allocation. The only
prior occurrence is DR-0024's statement that the id was free; no decision was
ever allocated under this id.

## Owner authorization, recorded verbatim

> Authorize one controlled pre-M4 local pilot in which Tiphys manages fleet,
> worktree, task, subprocess, watcher, and teardown lifecycle for the macOS
> portability task. The current delivery process retains planning, review,
> credentials, PR, merge, and recovery authority. This pilot does not
> constitute M4 cutover or acceptance of the unfinished harness adapter.

## Boundary

Tiphys owns these operations during the pilot:

1. initialize and diagnose a separate local fleet home;
2. acquire and check the local fleet lease;
3. allocate the task worktree and durable task records;
4. assemble the implementer brief;
5. launch one synchronous local subprocess through `ExecutorAdapter`;
6. write the executor and turn-end records;
7. expose completion through the watcher;
8. refuse unsafe teardown and tear down only after the current process has
   made the work recoverable.

The current delivery process retains:

1. this plan and every scope decision;
2. the narrow Codex authentication hand-off needed by the temporary wrapper;
3. independent review and fix-round arbitration;
4. every GitHub credential and every push, pull-request, merge, and branch
   protection action;
5. salvage and recovery if the subprocess dies or leaves incomplete work.

The subprocess receives no GitHub or pull-request credential. A temporary
wrapper outside the project repository may expose only the local model client
authentication needed to run the implementer, feed it the Tiphys-authored
brief, capture its last message, and return its real exit code. That wrapper is
pilot scaffolding, not the M4 harness adapter.

## What this decides and what it does not

This is the one controlled exception to the pre-M4 non-use rule in
delivery/plan/kernel-plan-v1.md:38. It does not decide DR-0010, whose harness
adapter alternatives remain open for M4 at
delivery/decisions/DR-0010-harness-orchestration-primitive.md:30. It proves
only the local lifecycle surfaces actually exercised and records every gap the
external process had to fill.

The pilot is a failure if its final report rounds those gaps up into a claim of
self-hosting. The correct output is a measured boundary: what Tiphys did, what
the wrapper did, what the current process did, and where authority crossed.

