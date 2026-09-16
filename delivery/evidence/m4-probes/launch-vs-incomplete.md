# PROBE: can a harness-primitive-backed adapter distinguish LAUNCH-FAILED from INCOMPLETE?

Key: launch-vs-incomplete
Started: (see mtimes)
Scratch: /tmp/claude-0/m4-probes/launch-vs-incomplete/
Repo read-only at /home/user/tiphys-ai-helmsman (branch plan/pstack-borrow-review).

STATUS: IN PROGRESS. This file is the beacon; appended as work proceeds.

## Failure arm, declared FIRST

This probe can report these distinct outcomes, and they are not the same:

- MEASURED-DISTINGUISHABLE: I ran the two arms and got different observable
  signals, captured below with exit codes.
- MEASURED-BLURRED: I ran the two arms and got the SAME observable signal.
  That is a positive finding: an adapter must then report `incomplete` for
  everything.
- COULD-NOT-TEST: I was unable to drive the arm at all from inside this
  container (no API, no permission, no primitive reachable). This is NOT
  evidence of either of the above and will be labelled in those words.

## PART A: the control, subprocessAdapter. MEASURED-DISTINGUISHABLE.

Interpreter: /opt/node22/bin/node v22.22.2. No build needed (no dist involved):
the probe imports src/spawn.ts:1 directly by dynamic import under Node type
stripping. Repo tree untouched: the fleet, the upstream repo and the project
clone are all created under /tmp/claude-0/m4-probes/launch-vs-incomplete/.

Scripts: control.mjs, control2.mjs, control3.mjs in that directory.
Command: `/opt/node22/bin/node control.mjs` etc, each exit 0 (the script exit,
not the arm verdict; each arm prints its own result).

### A1 payload does not exist -> launch-failed -> rollback destroys everything

    === ARM: A1 nonexistent payload
    spawnTask result: {
      "ok": false,
      "reason": "executor launch failed: cannot launch /tmp/.../no-such-binary:
                 Error: spawnSync /tmp/.../no-such-binary ENOENT"
    }
    worktree exists after: false
    task dir exists after: false
    payload work file survives: false

### A2 payload runs and exits 3 -> completed, exitCode 3, nothing rolled back

    === ARM: A2 payload runs and exits 3
    spawnTask result: { "ok": true, "value": { "meta": {... "id": "a2" ...},
                        "exitCode": 3 } }
    worktree exists after: true
    task dir exists after: true
    payload work file survives: true "real work\n"

So the control distinction is real and it is carried by `result.error !== undefined`
(spawnSync ENOENT) at src/spawn.ts:191, NOT by an exit code. That is exactly why
src/spawn.ts:150 says the adapter runs without a shell: under `sh -c` the same
missing binary arrives as ordinary exit 127, which A2 shows is the shape of a
payload that ran.

### A3 payload ran, then the turn-end hook failed -> incomplete, no rollback

The payload wrote work into the worktree, then overwrote
tasks/a3/turn-end-hook.mjs with `process.exit(9)`.

    === ARM: A3 payload ran then the turn-end hook failed
    spawnTask: {"ok":false,"reason":"the payload exited 0 but the turn-end hook
      /tmp/.../fleet/tasks/a3/turn-end-hook.mjs failed (exit 9); the worktree and
      the task directory are left in place"}
    worktree=true taskdir=true payloadWork=true

Three arms, three different observable results, on the shipped adapter.

## PART A-RED: what an adapter that got this wrong actually does

RED arm adapter (control2.mjs, control3.mjs): identical to subprocessAdapter
except it reads `result.status === null` (payload killed by a signal) as
"it never started" and returns `launch-failed`. This is the realistic M4
mistake, because an agent-shaped payload killed by a supervisor, an OOM or a
usage-limit cut has no exit code either.

Payload: writes PAYLOAD-WORK.txt into the worktree, then `kill -9 $$`.

    === ARM: RED: mis-classifying adapter, payload started and was SIGKILLed
    spawnTask: {"ok":false,"reason":"executor launch failed: no exit code from
      /tmp/.../p4.sh (signal SIGKILL); rollback of the worktree did not complete:
      worktree /tmp/.../fleet/worktrees/red has uncommitted changes or untracked
      files; commit or land them first, or pass --discard to remove anyway"}
    worktree=true taskdir=false payloadWork=true

    === ARM: GREEN: same SIGKILLed payload through subprocessAdapter
    spawnTask: {"ok":true,"value":{... "exitCode":137}}
    worktree=true taskdir=true payloadWork=true

Two facts, and the second is the one that is easy to miss:

1. The shipped adapter classifies the SIGKILLed payload as COMPLETED with
   exit 137 (128+9 via payloadExitCode, src/spawn.ts:133). It does not blur.
2. The mis-classifying adapter's rollback DID NOT destroy the work. poolDestroy
   is called with discard:false and deleteBranchForce:false (src/spawn.ts:374),
   and it refused. This is defence in depth working, and it is a real limit on
   how bad the V-1 shape is today.

Second RED arm, control3.mjs, because "uncommitted" is one member of the class
and an agent that COMMITS in its own worktree is the other (M4 hazard H-J,
delivery/plan/m4-intake.md:817). Payload commits, then `kill -9 $$`:

    spawnTask: {"ok":false,"reason":"executor launch failed: no exit code
      (signal SIGKILL); rollback of the worktree did not complete: branch
      task/committed carries commits beyond its base 5fb17d1... (tip 191576a...);
      land them or pass --delete-branch-force to delete it anyway"}
    worktree exists: true
    AGENT-WORK.txt exists: true
    task dir exists: false
    pool record exists: true
    branch task/committed in project clone: "+ task/committed\n" exit 0
    git log task/committed: "191576a agent commit\n5fb17d1 one\n" exit 0

So the committed arm is refused too. The damage a mis-classification does today
is NOT loss of the payload's work. It is this:

    $ cd <fleet> && node bin/tiphys.ts teardown --task committed
    tiphys teardown: no readable task meta for task id committed;
    teardown needs tasks/committed/meta.json
    TEARDOWN_EXIT=1

The rollback deleted tasks/<id>/ (meta.json, brief.md, executor.json) BEFORE
poolDestroy refused, leaving an orphaned worktree plus a live pool record that
the kernel's own documented recovery route cannot close. The route
src/spawn.ts:486 names for the adapter-threw case is exactly the command that
now exits 1.

FINDING (Part A): the distinction is mechanically carried by whether spawnSync
returned an `error` object, not by any exit code, and only because the adapter
runs with no shell. An adapter that infers "never started" from a MISSING EXIT
CODE is wrong, and the probe shows what it costs.

## PART B: the harness primitive. WHICH primitive, stated first.

DR-0010 (delivery/decisions/DR-0010-harness-orchestration-primitive.md:20) describes
the primitive as "deterministic control flow over disposable agents, structured
outputs, parallel fan-out". In THIS container that is the Workflow tool plus
in-process subagent spawn. I could drive NEITHER of them:

- I am myself a subagent, and no in-process agent-spawn tool is exposed to me.
  `ListAgents` returned: "No reachable agents - no other Claude session is
  running on this machine right now".
- `ToolSearch` for a workflow/agent-spawn tool returned nothing that spawns.
  The `workflow-authoring` skill says in terms that it "does not itself
  authorize running one".
- `TaskCreate`/`TaskGet`/`TaskList`/`TaskStop` are a TODO LIST, not an agent
  spawner. I loaded their schemas to check; TaskCreate takes {subject,
  description} and returns a todo row. Anyone reading "TaskCreate" as the
  orchestration primitive is reading the wrong tool.

So COULD-NOT-TEST applies to the Workflow primitive itself, and nothing below
should be read as a measurement of it.

What I COULD drive is the OTHER harness primitive M4 would plausibly use, the
Claude Code Remote session spawner: `create_session` / `get_session` /
`interrupt_session` / `archive_session`. That is a real "spawn a disposable
agent and observe it from the caller's side" surface, and the launch-failed
versus incomplete question applies to it unchanged.

### B1 the call itself can fail: invalid environment

    mcp__Claude_Code_Remote__create_session
      environment_id: env_NOT_A_REAL_ENVIRONMENT_0000
    -> ERROR: failed to create session: the requested resource was not found

No session id returned. This IS a clean launch-failed analogue: the caller gets
a synchronous refusal and there is nothing to have started.

### B1b THE BLUR, and it is the finding: an invalid MODEL is accepted

    mcp__Claude_Code_Remote__create_session
      title: "m4 probe B1b invalid model"
      model: "claude-not-a-real-model-9"
    -> {"id":"session_01GqcYJTKeaT5GDo2GreqYkb",
        "session_status":"SESSION_STATUS_PENDING",
        "configured_model":"claude-not-a-real-model-9",
        "status_bucket":"SESSION_STATUS_BUCKET_WORKING",
        "connection_status":"disconnected"}

A launch that cannot succeed was accepted, given an id, and reported as
**WORKING**. The synchronous return says nothing about whether the agent
started. Compare Part A, where the shipped subprocess adapter learns ENOENT
synchronously from spawnSync itself.

(Polling both sessions next; results appended below.)

### B1b resolved: the invalid model DID NOT fail. It was silently substituted.

    get_session session_01GqcYJTKeaT5GDo2GreqYkb
    -> "session_status":"SESSION_STATUS_IDLE"
       "configured_model":"claude-not-a-real-model-9"
       "external_metadata":{"last_served_model":"claude-opus-5", ...}
       "post_turn_summary":{"status_category":"completed",
                            "status_detail":"printed 'probe'"}
       "status_bucket":"SESSION_STATUS_BUCKET_COMPLETED"
       "usage":{"cost_usd":0.042727, "output_tokens":4}

The agent ran, on a DIFFERENT model from the one requested, and reported
COMPLETED. `configured_model` still echoes the model that does not exist. An
adapter that trusted the create call, or even the completion, would report a
successful launch of a model that was never used.

### B3 bad source repo: synchronous refusal, nothing created

    create_session source_url:
      https://github.com/ThomasHendrickx/definitely-not-a-repo-m4probe-0000
    -> ERROR: failed to create session: GitHub repository access check failed
       ... (github_repo_access_denied)

So the primitive has a synchronous refusal channel, and TWO of the three
bad-launch shapes I could construct take it (bad environment, bad repo). The
third (bad model) does not: it is repaired behind the caller's back.

### B2 killed mid-run: the caller sees IDLE / REVIEW_READY, and nothing else

Session session_01UBgHNGapnksjH3ska88nY8 was created with a 180-second busy
loop, observed RUNNING, then interrupted.

Before the interrupt:

    "session_status":"SESSION_STATUS_RUNNING",
    "task_summary":"Running a 180-second busy loop and printing the iteration count",
    "status_bucket":"SESSION_STATUS_BUCKET_WORKING"

    interrupt_session -> {"events":[{"control_request":{...
       "request":{"cancel_queued":true,"subtype":"interrupt"},
       "request_id":"00c5c2aa4f6c4102a752dcde66ff8ee0"}}]}

After:

    "session_status":"SESSION_STATUS_IDLE",
    "status_bucket":"SESSION_STATUS_BUCKET_REVIEW_READY",
    (no post_turn_summary at all; task_summary is GONE)
    "usage":{"output_tokens":309, "cost_usd":0.0669905}

**THE BLUR, MEASURED.** Compare the two terminal states in the same units:

| arm | session_status | status_bucket | post_turn_summary |
|---|---|---|---|
| B1b ran to completion | IDLE | COMPLETED | present, "completed" |
| B2 killed mid-run | IDLE | REVIEW_READY | ABSENT |

The bucket difference exists, but REVIEW_READY is NOT a kill signal: this
probe's own parent session reads `"status_bucket":
"SESSION_STATUS_BUCKET_REVIEW_READY"` while perfectly healthy and mid-turn.
REVIEW_READY is what you get when no post-turn summary was written, and an
agent that died writes none, exactly as an agent that finished with work
pending writes none. The absence of the summary is the ONLY difference, and an
absence is what a still-starting session also looks like.

Neither `session_status` nor `status_bucket` reported FAILED for a turn that
was cancelled while running. `get_session`'s own documentation says
status_bucket reads 'failed' for a turn that errored; an interrupt is not that.

### B4 killed HARDER (archive mid-run), and the reading CHANGED UNDER ME

Session session_01VkiMKUQWoPATCNXFAfGAXf, 240-second busy loop, observed
`SESSION_STATUS_RUNNING` with `task_summary` set, then archived mid-run
(archive_session "releases its container").

Read 1, the archive_session return itself, 2026-09-15T23:14:5x UTC:

    "session_status":"SESSION_STATUS_ARCHIVED",
    "status_bucket":"SESSION_STATUS_BUCKET_COMPLETED",
    (no post_turn_summary)

Read 2, get_session about a minute later:

    "session_status":"SESSION_STATUS_ARCHIVED",
    "status_bucket":"SESSION_STATUS_BUCKET_FAILED",
    "post_turn_summary":{"status_category":"failed",
      "status_detail":"[ede_diagnostic] result_type=user
                       last_content_type=n/a stop_reason=tool_use"}

Same session, same kill, two different answers about sixty seconds apart. The
terminal classification is EVENTUALLY CONSISTENT, and the first read of a
freshly killed agent says COMPLETED.

CONTROL, so this is not attributed to archiving as such: B1b, which genuinely
finished, was archived afterwards and stayed
`"status_bucket":"SESSION_STATUS_BUCKET_COMPLETED"` with its real
post_turn_summary intact. Archiving does not manufacture a FAILED.

### The two kills do NOT agree, which is the class witness

Two structurally different kills of the same shape of agent:

| kill | immediately after | ~1 min later | after archive |
|---|---|---|---|
| interrupt_session | IDLE / REVIEW_READY | IDLE / REVIEW_READY (unchanged) | ARCHIVED / **COMPLETED** |
| archive_session mid-run | ARCHIVED / **COMPLETED** | ARCHIVED / FAILED | n/a |

The interrupted session, once archived, reports COMPLETED with no post-turn
summary at all. A killed agent reported as completed is the exact inversion
that matters here: it is the signal an adapter would read as "the payload
finished", and it is wrong.

### B2 final state, 2 minutes after archive: still COMPLETED

    get_session session_01UBgHNGapnksjH3ska88nY8
    -> "session_status":"SESSION_STATUS_ARCHIVED",
       "status_bucket":"SESSION_STATUS_BUCKET_COMPLETED",
       (no post_turn_summary)

It never flipped to FAILED. So the interrupt arm is permanently mis-reported,
and the archive arm is mis-reported only for the first minute. The two kills
disagree, which is what makes this a class rather than one instance.

### Usage limit: COULD-NOT-TEST, in those words

I could not drive an agent into a usage limit. Doing it would mean burning the
owner's five-hour quota on purpose, which is destructive and not mine to spend.
What I CAN report is the observable that exists: every session record carries

    "rate_limit_info":{"isUsingOverage":false,"rateLimitType":"five_hour",
                       "resetsAt":1789514400,"status":"allowed"}

and the value was IDENTICAL (same resetsAt epoch, same type, same status)
across this probe's parent session and all three child sessions I created. That
identity is measured; the INFERENCE from it, labelled as an inference, is that
the field is ACCOUNT-scoped rather than session-scoped, which would make it a
poor per-task outcome signal. Nobody has shown what a session actually killed
by a usage limit reports, and this probe did not establish it.

## PART B-RED: the naive primitive-backed adapter, run for real

`red-primitive.mjs` in the scratch directory. A primitive-backed
`ExecutorAdapter` with the obvious classification
(`status_bucket` -> `LaunchOutcome`), fed the REAL captured get_session records
above, wired into the REAL `spawnTask` from src/spawn.ts:297, against a payload
that commits agent work into its worktree.

    $ /opt/node22/bin/node red-primitive.mjs    # exit 0

    --- b1b-completed.json
      bucket=SESSION_STATUS_BUCKET_COMPLETED
      adapter said: {"kind":"completed","exitCode":0}
      spawnTask: {"ok":true,...}
      worktree exists=true AGENT-WORK=true taskdir=true

    --- b2-after-archive.json          <-- THIS AGENT WAS KILLED MID-RUN
      bucket=SESSION_STATUS_BUCKET_COMPLETED
      adapter said: {"kind":"completed","exitCode":0}
      spawnTask: {"ok":true,...}
      worktree exists=true AGENT-WORK=true taskdir=true

    --- b4-read1.json                  <-- THIS AGENT WAS KILLED MID-RUN
      bucket=SESSION_STATUS_BUCKET_COMPLETED
      adapter said: {"kind":"completed","exitCode":0}
      spawnTask: {"ok":true,...}

    --- b4-read2.json                  <-- SAME KILL, READ ONE MINUTE LATER
      bucket=SESSION_STATUS_BUCKET_FAILED
      adapter said: {"kind":"launch-failed","reason":"session ... failed:
        [ede_diagnostic] result_type=user last_content_type=n/a
        stop_reason=tool_use"}
      spawnTask: {"ok":false,"reason":"executor launch failed: ...;
        rollback of the worktree did not complete: bran..."}
      worktree exists=true AGENT-WORK=true taskdir=false

Two different defects, from one probe, and the same kill produces both
depending on WHEN the adapter read:

1. **The silent one.** A killed agent is reported `completed` with exit code 0.
   `spawnTask` returns ok:true, writes a turn-end of 0, and the whole delivery
   downstream treats a half-done phase as done. Nothing is destroyed and
   nothing warns. This is worse than the loud one because no gate sees it.
2. **The loud one.** The same kill, read a minute later, becomes
   `launch-failed`, which authorizes rollback of a worktree carrying an agent's
   commit. Today poolDestroy's two gates refuse (Part A), so the commit
   survives, but tasks/<id>/ is already gone and the task is unclosable.

## ANSWER

**Can a harness-primitive-backed adapter distinguish LAUNCH-FAILED from
INCOMPLETE? PARTIALLY, and not by the route that looks obvious.**

Split it in three, because the arms are not equally answerable:

1. **The synchronous refusal IS a sound launch-failed signal.** Two of three
   bad-launch shapes I constructed (bad environment_id, bad source repo) fail
   the `create_session` CALL, return no id, and create nothing. An adapter may
   map that, and only that, to `launch-failed`. Measured, both arms.
2. **Everything observed AFTER a session id exists is BLURRED, measured.**
   `status_bucket` is not a launch signal at all: a killed agent read COMPLETED
   (twice, two different kills), a killed agent read REVIEW_READY permanently,
   a killed agent read FAILED a minute after reading COMPLETED, and a healthy
   parent session reads REVIEW_READY. FAILED means "the turn errored"; it never
   means "the payload never started". Mapping FAILED to `launch-failed` is the
   defect, and it is the mapping a reasonable engineer writes first.
3. **Usage limit: not established.** Stated as COULD-NOT-TEST above.

**So the adapter contract this probe supports:**

- `launch-failed` ONLY when the create call itself refused and returned no
  session id. That fact is local to the adapter, synchronous, and cannot be
  confused with a started agent, exactly as `spawnSync`'s ENOENT is in
  src/spawn.ts:191.
- `completed` ONLY on a positive completion artifact the AGENT wrote (the
  kernel already has the shape: the turn-end record, and the absent-record rule
  at src/gates/release.ts:609 that calls exit 0 with no response record an
  ERROR). Never on `status_bucket`.
- `incomplete` for EVERYTHING ELSE, including FAILED. Safe and lossy, and this
  probe says lossy is the correct trade: `incomplete` never rolls back, and
  every mis-read measured here would have been harmless under it.

That is finding (3) of the brief answered as a real finding: they blur, so
report `incomplete` for everything that is not a synchronous create refusal.

One consequence worth stating for the DR-0010 decision: since the only sound
`launch-failed` is a synchronous refusal, a primitive-backed adapter can be
SAFE, but its `completed` arm needs a kernel-side artifact the harness does not
provide. That is more work than "borrow the harness's execution machinery"
suggests, and it is an argument for option 3's split rather than option 1.

## WHAT THIS PROBE DID NOT COVER

1. **The Workflow primitive itself.** Named above. DR-0010's primitive is the
   workflow/subagent surface, and I could not spawn one: no agent-spawn tool is
   exposed to a subagent here, and `ListAgents` reported no reachable agents.
   Everything in Part B is about `create_session`, a DIFFERENT primitive.
   Anyone citing this probe for the Workflow tool is over-reading it.
2. **The usage-limit arm.** Not driven, for the reason given.
3. **A container reclaim, an OOM, and a network partition.** I killed agents
   with `interrupt_session` and `archive_session`, which are caller-initiated.
   A container dying on its own may report differently, and I have no evidence
   either way.
4. **Timing.** I read the archive arm at roughly 0s and roughly 60s. I did not
   bisect, so "eventually consistent within about a minute" is the resolution
   of two reads, not a measured bound.
5. **The child-environment question.** The sibling probe owns it. I did not
   test whether `create_session` can impose the kernel's scrubbed env; note
   only that `create_session`'s own schema says a Cowork environment IGNORES
   `environment_variables`, `extra_allowed_tools` and `append_system_prompt`,
   which is second-hand from the tool description and not a measurement.
6. **The kernel side is the CURRENT tree.** Part A measured src/spawn.ts at
   branch plan/pstack-borrow-review, head fc697d6, `git status --porcelain`
   zero lines before and after. No repository file was modified; every fleet,
   clone and worktree lived under /tmp/claude-0/m4-probes/launch-vs-incomplete/.
7. **Node.** Every Part A run used /opt/node22/bin/node v22.22.2, below the
   declared floor of >=26. No suite was run and no `dist/` was involved, so the
   build-state and skipped-count axes of standing warning 12 do not apply, but
   the floor axis is untested: I did not re-run these arms on v26.

## CLEANUP

All three sessions created by this probe were archived:
session_01GqcYJTKeaT5GDo2GreqYkb, session_01UBgHNGapnksjH3ska88nY8,
session_01VkiMKUQWoPATCNXFAfGAXf. Total measured cost across them, from their
own `usage.cost_usd`: 0.042727 + 0.0669905 + (B4 reported no usage block) =
about 0.11 USD plus B4's unreported loop.

STATUS: COMPLETE.
