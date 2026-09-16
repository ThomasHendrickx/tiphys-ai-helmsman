# M4 prototype probes: what was measured, and what it overturns

- date: 2026-09-15
- subject: the fourteen questions M4's intake recorded as PROTOTYPE-BLOCKED
- method: eight probe agents and two adversarial reviewers, dispatched as five
  concurrent workflows. Each wrote its findings incrementally to a beacon file;
  all ten beacons are committed verbatim under `delivery/evidence/m4-probes/`
  and are the primary evidence. This document is the summary and the
  consequences, not a replacement for them.
- transliteration: the copied beacons were checked for non-ASCII and control
  bytes before committing. Zero substitutions were required; the check is
  recorded because it ran, not because it found anything.

**SIX of these overturn something this repository believed.** Those are first.
Items 11 and 12 were added after the last two probes returned.

## 1. The premise of M4-D-07 is FALSE in this container

**Believed:** a real agent payload cannot authenticate under the kernel's
credential scrub. This is recorded as the first of "three kernel defects found
by USE" at delivery/verification/dr-0034-premise-check.md:102, and the intake
built M4-D-07 and part of the harness-adapter workstream on it.

**Measured:** a Claude Code payload authenticates under the kernel's REAL
scrubbed environment (seven variables, produced by calling `buildChildEnv` with
`process.env`), exit 0, unique nonce echoed. It also authenticates with PATH
and nothing else.

**Why.** The credential is not in the environment at all. It is at an absolute
path OUTSIDE `$HOME`, so redirecting `HOME`, which is the scrub's entire
defense against credential stores (src/exec/env.ts:110), cannot reach it.

**So the minimal `extraAllowlist` for model authentication is THE EMPTY LIST.**
M4-D-07's question, as the intake asks it, has no content.

**What the scrub DOES break is `git push`, and it costs exactly one name.**
Measured against the real endpoint: full environment HTTP 200; scrubbed seven
HTTP 401; scrubbed plus `HTTPS_PROXY` HTTP 200; scrubbed plus `GH_TOKEN` ONLY
still HTTP 401. `GH_TOKEN` carries nothing, exactly as standing warning 6
concluded from a different direction.

**The honest limit, in the prober's own words: it could not distinguish "the
pilot was wrong" from "the pilot ran somewhere else".** One container, one day.
The pilot's report is not refuted; its premise is not reproducible here.

## 2. The `credential-scrub` gate's verdict is INVERTED with respect to real capability

Measured in this container, the gate greens `HTTPS_PROXY`, which grants full
GitHub write, and reddens `GIT_CONFIG_*`, which grants only URL rewriting. The
one name that actually carries push capability is the one it permits.

That is a defect in a shipped gate, and it is the same shape the repository
keeps paying for: the condition does not test the property that matters.

## 3. The credential boundary here is the UID AND THE FILESYSTEM, not the environment

Single-variable experiment, same command, same environment, only the uid
changed: uid 0 AUTHENTICATED; uid 65534 refused with a specific authentication
error and exit 1.

The kernel's scrub is environment-only and spawns the child at the SAME uid, so
a payload keeps read access to the credential file. And redirecting `HOME` hides
a path from RESOLUTION without removing READ ACCESS to the absolute path: a
payload that names `/root/.gitconfig` directly gets the file.

**Consequence for M4.** "Enforced by code" (DR-0039) is weaker than that record
assumed. The environment scrub is real and is not the boundary it reads as. A
uid or a mount is what would make it one, and the kernel uses neither.

**Not established, and the prober said so plainly:** whether removing the
credential file breaks authentication. The session's permission classifier
refused both the mask and a directory listing, citing credential exploration.
The uid experiment establishes that the credential is filesystem-and-uid bound;
it does not isolate which file carries it. No credential contents were read.

## 4. D-8's carve-out does not partition the operations it names

**Believed:** "the orchestrator never writes working-tree content or commits in
projects/; ref updates through designated merge tooling are the carve-out"
(delivery/plan/kernel-plan-v1.md:383). The intake treats this as the hook's
predicate.

**Measured:** a fast-forward merge in a CHECKED-OUT clone rewrites tracked files
on disk. One file's digest changed and another was created.

**So the sanctioned act is a member of the forbidden set.** No path-based hook
can implement the line as written. The carve-out is implementable only if
restated as: allow exactly these NAMED absolute-path tools, constructed so their
writes are ref-only, which log before they act. The hook verifies the NAME; the
tool provides the GUARANTEE. That inversion is the design point, because a hook
cannot inspect what a program will do.

## 5. DR-0010 is answered: option 1 is refuted for ship phases

Full account and the four measured arms are in
delivery/decisions/DR-0010-harness-orchestration-primitive.md:1, updated the
same day. In short: the harness's environment control is a DENYLIST over the
host environment (174 in, 193 out), it FAILS OPEN when its sandbox dependencies
are missing, and one surviving name carries a live credential that is on the
kernel's own dangerous-variable list. The kernel's own path gives seven
variables built from nothing.

## 6. A third gate status is a small edit and a silent semantics change

**The vocabulary is four words** (src/gates/result.ts:47) with a closed
exit-code table. Adding a fifth is eleven inserted lines across three files and
produces exactly ONE type error.

**That is not the cost.** With the vocabulary edit alone, a bundle containing one
ordinary green gate plus one gate reporting the NEW status printed
`gates: every applicable gate is green` and exited 0. The compiler said nothing,
because the aggregation uses `if` chains rather than an exhaustive switch.

**So DR-0038's real work is the aggregation precedence, not the enum**, and the
naive implementation introduces a guard that cannot go red into the gate runner
itself.

**A third status word already exists and is unreachable.**
schemas/report.schema.json:507 admits `amber`, and the schema's own comment says
it is not one of the runner's four statuses and no producer defines an exit code
for it. DR-0038 makes an existing reporting word reachable.

**One claim the prober did NOT measure and flagged as such:** a VACUOUS third
status appears constructible, because the never-green-by-omission rewrite fires
only for `status === "green"`. That is precisely the shape M2-C-2 exists
against, and it must be re-measured rather than inherited from a reading.

## 7. The decorrelation check compares STRINGS, not families, reproduced

Run against a fixture carrying the two real `produced-by` values from this
repository's own reviews: **green, reported as decorrelated**, while one of them
contains the words "Anthropic model family". A byte-identical repeat IS caught,
which is the control proving the green is the check working as written.

An ABSENT dimension is also RED, indistinguishable BY STATUS from a real
correlation violation and separated only by prose.

## 8. A git ref IS a real compare-and-swap, with three conditions the recommendation omitted

Two clones of the real fleet remote, raced against a shared barrier. Create
race: exactly one winner, the loser refused server-side. Update race: exactly
one winner, and the refusal names both the actual and the expected sha, which is
a fencing token for free.

Three conditions M4-D-11 did not state:

1. **Only `refs/heads/*` is pushable here.** Tags, notes and custom namespaces
   all return HTTP 403. A "dedicated ref" must be read as a dedicated BRANCH.
2. **The expectation must be an explicit sha.** Bare `--force-with-lease` uses
   the local remote-tracking ref, so a routine fetch re-arms it. Measured: a
   stale environment fetched, then pushed with the bare form, and CLOBBERED a
   live holder with exit 0 and no refusal.
3. **Nonzero does NOT mean "I lost".** A transport failure exits 1 too. The API
   needs three states, with INDETERMINATE resolved by re-reading the ref.

**The best result, and it is stronger than the recommendation claimed:** safety
does not depend on the freshness rule being right. A challenger judged a live,
renewing holder stale and attempted takeover; the CAS refused it. The freshness
rule controls reclaim LATENCY only. And no clock comparison is needed if the
rule is a locally-measured no-change duration over the register: with one
holder's timestamp set a year fast, the timestamp rule (which is what
src/lock.ts does) says "wait forever" while the duration rule proceeds
correctly.

## 9. Standing warning 14 was too narrow, and is generalised

A second, independent instance was measured: `git push --dry-run` reported
`* [new tag]`, `* [new reference]` and `* [new branch]` with exit 0 for three
refs whose real pushes returned HTTP 403. The warning recorded this only for
`--delete`. The rule is now that a dry-run does not probe push AUTHORIZATION at
all. CLAUDE.md is amended.

## 10. The write-block hook: sound for file tools, unsound for Bash

A real plugin with a `PreToolUse` hook refused a working-tree write in a project
clone and permitted a designated ref update, in the same configuration, in real
sessions, with a control proving the write would otherwise have landed.

Three defects found in the same pass:

- **The Bash arm is structurally unsound.** The hook receives a path FIELD for
  the file tools and a STRING for Bash. Two non-exotic constructions got a write
  through, one reproduced end to end. The Bash block belongs in filesystem
  permissions or a mount, not in a hook.
- **A hook that exits 1 does not block.** Any uncaught exception exits 1, so a
  BUGGY write-block is an ABSENT write-block and nothing reports it. The
  acceptance criterion must include a witness that reddens when the hook itself
  is broken.
- **The matcher is an allowlist of tool names**, so any MCP tool taking a path
  falls outside it.

**Not established:** whether `PreToolUse` hooks fire at all under a bypass
permission mode. If they do not, a launch flag defeats the whole block. It is
one run and it must happen before any design depends on the hook.

## What this costs the intake

M4-D-01 and M4-D-11 are answered. M4-D-07's premise is gone and the question
must be re-asked. The write-block phase gains a restated carve-out and loses its
Bash arm. DR-0038's phase gains the aggregation work and a vacuity re-measure.
DR-0039's "enforced by code" is downgraded to "enforced for the environment, and
the environment is not the boundary".

**Six probes ran and four overturned a belief. That ratio is the argument for
running the other prototypes before the phases that depend on them, rather than
planning on desk research.**


## 11. The resolved model IS observable, and the intake's appendix was wrong

**Believed:** no plugin hook can read the resolved model after the fact
(delivery/plan/m4-intake.md:1 appendix B item 1). M4-D-06 was written to survive
that answer, by separating an observable override CONDITION from a self-reported
IDENTITY.

**Measured: the conclusion is false, and the premise it rests on is true.** Six
real hook payloads were captured and their keys enumerated recursively: 28 keys,
ZERO matching `/model/i`. So no hook field carries the model, exactly as the
appendix said. But every payload carries `transcript_path`, and `SubagentStop`
additionally carries `agent_id`, `agent_type` and `agent_transcript_path`. The
transcript at that path is HARNESS-WRITTEN and records `message.model` on every
assistant row.

**The demonstration is the part that settles the trust boundary.** A working
`SubagentStop` hook resolved `claude-haiku-4-5-20251001` for a subagent whose own
text in that same turn claimed `produced-by: GPT-7 Turbo (OpenAI model family)`.

**So a `produced-by` line written by the reviewing agent is forgeable, the
forgery is invisible to every gate this repository has, and an observed
alternative exists.** M4-D-06's "the adapter reports what it actually resolved"
is satisfiable by OBSERVATION. The design must not collapse the two into one
self-report.

A second source exists and must not be used alone: the CLI result envelope
carries a `modelUsage` block naming the served model. It is session-scoped and
mixes the main model with an auxiliary one, so it is unfit for per-agent
attribution. It is also demonstrably not an echo of the request: asking for a
model that does not exist produces an error, and the requested string never
appears in `modelUsage`.

**The honest limit, and the prober named it as the probe's largest gap:** the
documentation was deliberately not read, so it cannot be said whether
`agent_transcript_path` and `message.model` are CONTRACTUAL or incidental to
this build. A kernel depending on them depends on an observed shape. Also
untested: transcript tampering by the agent itself, and whether the paths stay
distinguishable with several subagents in flight.

**And the environment carries nothing.** `CLAUDE_CODE_SUBAGENT_MODEL` and
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` are both UNSET here, and no environment
variable in the process names a model. So M4-D-06's observable-CONDITION half
has no carrier in this container. The separation of condition from identity is
still the right shape; the condition is simply not readable here.

## 12. The sha-binding fix was BUILT, and the post-merge call site is not missing

**DR-0041's measurement reproduced independently**, and its "green for every
commit forever" is now measured rather than inferred: the shipped adapter drove
the deploy gate green against the real registry for THREE distinct unpublished
commits.

**The mechanism is narrower than DR-0041 stated.** It is not that npm's
`versions` is an object. It is that the observe step has exactly ONE source for
its satisfying value, configuration, and configuration is constant across
commits. The only subject comparison in the shipped adapter sits inside the
`locate` path, which the packument's shape happens to defeat as well.

**The fix is 74 added lines in one file:** an `observe.satisfiedSubjectField`
that takes the satisfying value from the KERNEL-OWNED subject instead of from
configuration. Against the real registry, at the exact commit the unpatched
adapter calls green, the patched gate reports `deploy: red`, exit 1, with a
reason naming both shas. It still greens when the served value matches. Suite
849 pass, 0 skipped, exit 0 on node v26.6.0 with `dist/` built via `npm test`.
Two structurally different class members were exercised plus a misconfiguration
arm, and a bound-only declaration met by the OLD adapter ERRORS rather than
greening, which is fail-closed forward compatibility.

**Correction to DR-0041 and to the plan: the post-merge call site is NOT missing
code.** `deploy` is already in the main bundle and already runs on every push to
`main`. It reports not-applicable only because `release-verification.json` is
absent. So the call site and the binding are ONE phase, not two.

**Stated so it is not overstated:** `gitHead` is publisher-asserted, not
cryptographically bound. The fix is a large improvement and is not attestation.

**Also recorded because its wrong output looked plausible:** the prober's first
fixture harness blocked its own event loop, so the server never accepted a
connection and every arm failed for a reason that had nothing to do with the
subject. They found it and said so.

## AMENDMENT, 2026-09-16: the three questions M4-P1 had left open

Added by the M4-P1 remainder on branch `claude/m4-p1-harness-probe`. The eight
probes above left three questions open and one of them blocked M4-P9's design.
All three were run. The captures are under
`test/fixtures/harness-probe/` and the full account, including the failure arms
written before the runs and the derivation, is in
delivery/work-history/m4-p1.md:1.

Harness probed: `claude --version` 2.1.273 (Claude Code), binary
`/opt/claude-code/bin/claude`, node v22.22.2 at `/opt/node22/bin/node`, one
container, one account, 2026-09-15 into 2026-09-16.

### 13. `PreToolUse` hooks DO fire under a bypass permission mode, and `exit 2` still blocks

**This unblocks M4-P9 and the answer is the favourable one.** Item 10 above left
it open in terms ("Not established: whether `PreToolUse` hooks fire at all under
a bypass permission mode").

Measured with a plugin whose hook writes a marker file and then exits with a
chosen code, in a real `claude -p` session whose payload reports
`"permission_mode":"bypassPermissions"` back to the hook:

| arm | hook exit | marker | app.txt |
|---|---|---|---|
| bypass, `Write` | 2 | YES | unchanged |
| bypass, `Write` | 0 | YES | CHANGED (the control) |
| bypass, `Bash` | 2 | YES | unchanged |
| bypass, `Bash` | 0 | YES | CHANGED (the control) |
| bypass via `--dangerously-skip-permissions` | 2 | YES | unchanged |

Two structurally different tools, each with its own control, at
test/fixtures/harness-probe/q1-bypass-permission-mode/bypass-exit2.summary.txt:1
and
test/fixtures/harness-probe/q1-bypass-permission-mode/bypass-bash-exit2.summary.txt:1.

The earlier probe could not reach this arm because the CLI refuses the flag
as root. The gate's condition is in the shipped bundle,
`process.getuid()===0 && process.env.IS_SANDBOX!=="1" && !CLAUDE_CODE_BUBBLEWRAP`,
and this container declares `IS_SANDBOX=yes`; the probe exported `IS_SANDBOX=1`
for the child only.

**Two traps found in the same pass, and the second is worse than the question
that was asked:**

- **`--settings '{"permissions":{"defaultMode":"bypassPermissions"}}'` does not
  reach bypass.** The hook payload reports `permission_mode` as `default`. The
  run looks entirely successful. Only the harness's own echoed field
  distinguishes the mode you asked for from the mode you got, so every arm must
  echo it.
- **A `--plugin-dir` that does not exist removes the entire write-block,
  silently, exit 0, no warning.** Same configuration as the blocking arm, one
  wrong path: marker absent, file written. Captured at
  test/fixtures/harness-probe/q1-bypass-permission-mode/bypass-badplugindir-exit2.summary.txt:1.
  This is a second FAIL-OPEN route alongside item 10's `exit 1`, and it is
  upstream of the hook: the hook is not broken, it is absent. **M4-P9 needs an
  acceptance criterion that the plugin LOADED**, evidenced by a positive
  artifact the hook writes, and an absent artifact must be red.

### 14. Launch-failed versus incomplete IS distinguishable in the SUBPROCESS form, by the result envelope

A different surface from the one the earlier probe drove. That probe measured
`create_session` and recorded that it could not drive the Workflow primitive.
This measures `claude -p` as a subprocess, which is what M4-P5's adapter will
run, and nothing here is evidence about either of the other two.

| arm | exit | stdout | transcript |
|---|---|---|---|
| healthy | 0 | full envelope, `terminal_reason: completed` | created, assistant rows present |
| bad model | 1 | full envelope, `is_error: true`, `terminal_reason: api_error`, `api_error_status: 404` | created, one assistant row whose model is `<synthetic>` |
| SIGKILL mid-turn | 137 | **zero bytes** | created, ZERO assistant rows |
| SIGTERM mid-turn | 124 | **zero bytes** | created, ZERO assistant rows |
| nonexistent `--plugin-dir` | **0** | full envelope, success | created, normal |

Captures at
test/fixtures/harness-probe/q2-launch-failed-vs-incomplete/D2-abandon-sigkill.summary.txt:1
and
test/fixtures/harness-probe/q2-launch-failed-vs-incomplete/B2-launch-fail-bad-model-freshcwd.summary.txt:1.

**The discriminator is the presence of a complete result envelope, and three
nearby fields are traps.** The exit code alone does not carry it. `subtype`
reads `success` on the arm whose `is_error` is `true`. And the transcript does
NOT discriminate: the first reading of this matrix thought it did, because two
children launched in the same working directory APPEND TO ONE TRANSCRIPT FILE
(the child inherits `CLAUDE_CODE_SESSION_ID` and the path is
`<slug-of-cwd>/<session-id>.jsonl`), so a census that counted FILES saw the
second run create nothing. Re-run in a fresh directory, the launch failure
created a transcript like every other arm. Both summaries are committed,
including the misleading one.

### 15. Transcript-based model resolution is NOT stable, in two independent ways

Item 11 above named two untested arms. Both were tested and both are negative.

**The paths are sound under concurrency.** Four runs, three subagents each,
launched in one message, each agent type pinned to a different model. Twelve
resolutions: three distinct `agent_id` and three distinct
`agent_transcript_path` every time, no reuse, and every model that came back
was the right one for its agent type.

**There is a WRITE RACE at the hook.** In two of those twelve, the transcript at
`agent_transcript_path` had ZERO assistant rows at hook time while the payload's
own `last_assistant_message` carried the agent's finished text. The same
resolver against the same path twenty seconds later returned the correct model,
which is what makes it a race rather than a wrong path:
test/fixtures/harness-probe/q3-transcript-model-resolution/alpha-recheck-after-the-race.jsonl.txt:1.
The loser varied between runs (`alpha` once, `beta` once), so it is not one
agent type or one position in the fan-out.

**Consequence: a resolver that falls back to the self-report on an empty
transcript is green whenever the race does not fire and silently accepts a
forgeable value when it does.** The failure correlates with load, so it is
rarest in testing. An empty transcript at hook time must be UNRESOLVED and
LOUD.

**The transcript is agent-reachable.** An agent with only `Bash` found its own
transcript in one turn. Asked to forge a row in it, the model REFUSED, and that
refusal is a model policy rather than a boundary: the file is mode 0600 owned by
root and the agent runs at that same uid, so an ordinary process at the agent's
uid appends to it with exit 0. Two structurally different tampers were run:

- APPEND a forged row: the resolver reports two models for one agent, which is
  anomalous and catchable.
- REWRITE the model string in place on every assistant row: the resolver reports
  one model, `outcome: resolved`, byte-shaped exactly like the truth.

Both at
test/fixtures/harness-probe/q3-transcript-model-resolution/tamper-mechanism.jsonl.txt:1.

**So `observed` is a real level ABOVE `self-reported` and BELOW attested.** The
earlier probe's demonstration stands and is not weakened: a haiku agent claiming
GPT-7 was caught by the transcript, because a self-report costs nothing and a
tamper takes deliberate file access. What must not be written into M4-P7 is any
vocabulary implying attestation. An attested level would need a signer that a
process at the agent's uid cannot write to; I looked only at the transcript tree
and its permissions and did not find one here, which is an open question rather
than a settled absence.

### What this amendment did NOT cover

- **The Workflow primitive is still undriven.** Item 14 measures a subprocess.
- **One container, one account, one CLI build (2.1.273), one day.** Every
  statement here is about that configuration.
- **The bypass arms ran as root with `IS_SANDBOX=1`.** A genuinely unprivileged
  run was attempted and abandoned: `claude` as a fresh non-root user hit
  `EACCES` on `/root/.ccr/ca-bundle.crt` followed by an authentication error,
  and copying that CA bundle to a readable path was refused by this session's
  own classifier with `Reason: [Credential Exploration]`. The two causes could
  not be separated and were not worked around. So whether hooks fire under
  bypass AT A DIFFERENT UID is NOT ESTABLISHED.
- **The race was not bisected.** Two empty reads in twelve resolutions over four
  runs is enough to show it exists and that the loser varies. It is not a rate
  and no probability should be quoted from it.
- **No usage-limit, OOM, container-reclaim or network-partition arm** was run
  for item 14, exactly as the earlier probe recorded for its own surface.
- **`claude --restricted` was still not run**, which item 10 named as the most
  promising route past the Bash unsoundness and which remains one command
  someone else can settle.
