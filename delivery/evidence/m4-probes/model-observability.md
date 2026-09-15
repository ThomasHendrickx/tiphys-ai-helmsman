# PROBE: can the model that actually served an agent turn be observed at all?

Key: model-observability
Started: 2026-09-15
Scratch: /tmp/claude-0/m4-probes/model-observability/
Repo read-only at /home/user/tiphys-ai-helmsman, branch plan/pstack-borrow-review.

STATUS: IN PROGRESS (appending as I go)

## Item 5 (the measured problem) - reading phase

Two most recent clean-room reviews on this branch:

  $ grep -n produced-by delivery/review/clean-room-m3-exit-subject-criteria.md
  5:produced-by: Claude, Sonnet 5 (claude-sonnet-5)
  $ grep -n produced-by delivery/review/clean-room-m3-exit-subject-hazard.md
  5:- produced-by: Claude Opus 5 (Anthropic model family)
  exit 0 both

Canonicalisation, src/checks.ts:3079 canonicalScalar: NFKC, refuse any codepoint
outside U+0020..U+007E, collapse whitespace runs, trim, ASCII lowercase.
Comparison, src/checks.ts:3520 onward: values are bucketed in a Map keyed by the
canonical string and a bucket of size >= 2 is the violation. So DISTINCTNESS IS
STRING INEQUALITY, nothing else.

Canonical forms of the two real strings:
  "claude, sonnet 5 (claude-sonnet-5)"
  "claude opus 5 (anthropic model family)"
These are unequal, so the pair reads as DECORRELATED. Both are Anthropic.
PRELIMINARY: intake claim CONFIRMED on reading. Executable confirmation below.

## Item 3: what the ENVIRONMENT exposes. MEASURED.

I am MYSELF a subagent of the orchestrator session. CLAUDE_CODE_CHILD_SESSION=1.
So the probes below are already "in a child".

  $ for v in CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_SUBAGENT_MODEL_FORCE \
      ANTHROPIC_MODEL ANTHROPIC_SMALL_FAST_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL \
      ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL \
      CLAUDE_CODE_MODEL CLAUDE_MODEL CLAUDE_CODE_MAIN_MODEL CLAUDE_CODE_EFFORT \
      CLAUDE_EFFORT; do printenv "$v" ...; done

  UNSET CLAUDE_CODE_SUBAGENT_MODEL (printenv exit 1)
  UNSET CLAUDE_CODE_SUBAGENT_MODEL_FORCE (printenv exit 1)
  UNSET ANTHROPIC_MODEL (printenv exit 1)
  UNSET ANTHROPIC_SMALL_FAST_MODEL (printenv exit 1)
  UNSET ANTHROPIC_DEFAULT_OPUS_MODEL (printenv exit 1)
  UNSET ANTHROPIC_DEFAULT_SONNET_MODEL (printenv exit 1)
  UNSET ANTHROPIC_DEFAULT_HAIKU_MODEL (printenv exit 1)
  UNSET CLAUDE_CODE_MODEL (printenv exit 1)
  UNSET CLAUDE_MODEL (printenv exit 1)
  UNSET CLAUDE_CODE_MAIN_MODEL (printenv exit 1)
  UNSET CLAUDE_CODE_EFFORT (printenv exit 1)
  SET   CLAUDE_EFFORT=high

  $ env | grep -i model | wc -l
  0   (the single earlier hit was PWD containing "model-observability", my own
       scratch directory name. Named and discounted rather than left to imply
       a model variable exists.)

SO: ZERO environment variables in this process name a model. Not the requested
one, not the resolved one. CLAUDE_EFFORT=high is the only tuning knob visible
and it is not a model identity.

What IS exposed and is a FACT (not a self-attestation):
  AI_AGENT=claude-code_2-1-273_agent
  CLAUDE_CODE_VERSION=2.1.42        <- DISAGREES with the binary, see below
  CLAUDE_CODE_ENTRYPOINT=remote_mobile
  CLAUDE_CODE_SESSION_ID=49c9c4fa-6f01-5020-aa81-c87700265964
  CLAUDE_CODE_REMOTE_SESSION_ID=cse_01SvXQvsfQQZrxnyMCWsxGVL
  CLAUDE_CODE_ACCOUNT_UUID / CLAUDE_CODE_ORGANIZATION_UUID
  ANTHROPIC_BASE_URL=https://api.anthropic.com
  CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1
  CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST=1

  $ /opt/claude-code/bin/claude --version
  2.1.273 (Claude Code)      exit 0

NOTE A CONTRADICTION, reported rather than smoothed: CLAUDE_CODE_VERSION says
2.1.42, AI_AGENT says 2-1-273, the binary says 2.1.273. An env var is only as
good as whoever set it. This is directly relevant to M4-D-06: an env var is an
observable condition, NOT an observable truth.

## BREAKTHROUGH (item 1/2/6): the CLI result envelope DOES report the served model

  $ cd /tmp/claude-0/m4-probes/model-observability/run1
  $ /opt/claude-code/bin/claude -p "Reply with exactly: PONG" \
      --output-format json --model haiku
  EXIT 0, stderr empty

Relevant slice of stdout (verbatim):

  "modelUsage":{"claude-haiku-4-5-20251001":{
      "inputTokens":909,"outputTokens":51,
      "cacheReadInputTokens":20311,"cacheCreationInputTokens":5129,
      "costUSD":0.013453099999999999,"contextWindow":200000,
      "maxOutputTokens":32000,"thinkingTokens":31,
      "canonicalModel":"claude-haiku-4-5","provider":"firstParty",
      "costBasis":"list"}}

This is HARNESS-WRITTEN, not agent-written. It is keyed by the DATED model id
and carries a canonicalModel and a provider. The intake's Appendix B item 1
("no plugin hook can read the resolved model after the fact") is about HOOKS.
It does not cover the CLI result envelope, and the result envelope answers the
question.

Also present and useful: "service_tier":"standard", "speed":"standard",
"fast_mode_state":"off", "subagent_stats" with spawned/requested/refused counts.

STILL TO FALSIFY: is modelUsage an ECHO OF THE REQUEST or a record of what was
SERVED? Discriminating test below.

### FALSIFICATION: modelUsage is NOT an echo of the request. Two arms.

ARM A (failure arm, run first per the rules) - request a model that does not exist:

  $ /opt/claude-code/bin/claude -p "Reply with exactly: PONG" \
      --output-format json --model "claude-does-not-exist-9"
  EXIT 1
  stderr: [claude-code:unrecognized_model] {"model":"claude-does-not-exist-9","query_source":"sdk"}
  stdout: "api_error_status":404, "is_error":true, "terminal_reason":"api_error",
          "result":"There's an issue with the selected model (claude-does-not-exist-9)..."
          "modelUsage":{"claude-haiku-4-5-20251001":{...,"outputTokens":11,...}}

  The REQUESTED string appears in the error text and in stderr. It does NOT
  appear in modelUsage. modelUsage names claude-haiku-4-5-20251001, which is the
  auxiliary/sidecar model that ran anyway. So modelUsage tracks what was BILLED,
  not what was ASKED FOR. This probe CAN report failure and did.

ARM B - request sonnet, and see whether main and auxiliary are separated:

  $ /opt/claude-code/bin/claude -p "Reply with exactly: PONG" \
      --output-format json --model sonnet
  EXIT 0, result "PONG"
  modelUsage keys: [ "claude-haiku-4-5-20251001", "claude-sonnet-5" ]
    claude-haiku-4-5-20251001: inputTokens 899, outputTokens 12, contextWindow 200000
    claude-sonnet-5:           inputTokens 2,   outputTokens 5,  contextWindow 1000000,
                               cacheRead 28660, cacheCreation 6721, costUSD 0.03267

  TWO entries. The main turn's model and the sidecar model are both accounted
  separately. Under --model haiku there was only ONE key, because the two
  coincided. That is consistent accounting, not an echo.

CAVEAT, MEASURED AND NOT SMOOTHED: the id granularity is NOT uniform.
"claude-haiku-4-5-20251001" carries a date; "claude-sonnet-5" does not. Both
carry canonicalModel ("claude-haiku-4-5", "claude-sonnet-5") and
provider ("firstParty"). A kernel consuming this must key on canonicalModel and
must not assume a date suffix exists.

CAVEAT 2: session_id in all three runs was 49c9c4fa-6f01-5020-aa81-c87700265964,
identical to my own CLAUDE_CODE_SESSION_ID. The headless CLI inherits the
session id from the environment here. Do not treat session_id from a nested
-p run as a fresh identifier.

## Item 4: do hooks carry model information? MEASURED. NO, AND THE INTAKE IS RIGHT.

Real hook payloads captured, not documentation. Custom settings file at
hooks/settings.json registering a stdin-dumping command on nine events, run via
`--settings`. Six events actually fired.

  $ /opt/claude-code/bin/claude -p 'Run the bash command: echo HOOKPROBE. Then
      reply with exactly DONE.' --output-format json --model sonnet \
      --settings .../hooks/settings.json --allowedTools Bash \
      --permission-mode acceptEdits
  EXIT 0, result "DONE", stderr empty

Payloads written: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
Stop, SessionEnd. (SubagentStop, PreCompact, Notification did not fire in this
run; that is an absence of the CONDITION, not evidence about their schema.)

Recursive key enumeration over all six payloads, 28 distinct keys:

  background_tasks, cwd, duration_ms, effort, effort.level, hook_event_name,
  last_assistant_message, permission_mode, prompt, prompt_id, reason,
  scratchpad_dir, session_crons, session_id, source, stop_hook_active,
  tool_input, tool_input.command, tool_input.description, tool_name,
  tool_response, tool_response.interrupted, tool_response.isImage,
  tool_response.noOutputExpected, tool_response.stderr, tool_response.stdout,
  tool_use_id, transcript_path

  keys matching /model/i: (none)        script exit 0

TRAP NAMED AND DISCOUNTED: `grep -ail model *.json` exits 0 and hits all six
files. Every hit is the literal string "model-observability" inside cwd,
transcript_path and scratchpad_dir, which is MY OWN SCRATCH DIRECTORY NAME.
A naive grep would have reported the opposite of the truth here. The structural
key enumeration above is what settles it.

**So: NO hook event's stdin JSON carries the model. Appendix B item 1 is
CONFIRMED as stated about hooks.**

### BUT: every payload carries transcript_path, and the transcript DOES carry it

  $ wc -l /root/.claude/projects/-tmp-claude-0-.../<session>.jsonl
  28

  $ node -e '<count distinct .message.model over the jsonl>'
  claude-sonnet-5 2
  total lines parsed: 28

The transcript JSONL records `message.model` on each assistant message, written
by the harness. A hook is handed the path to it. So a hook CAN establish the
served model, by reading a file it is given rather than by a field it is passed.
That is a different trust story and it is stated separately below.

## Item 2: subagent self-report, and the mechanism that checks it. MEASURED.

  $ /opt/claude-code/bin/claude -p 'Use the Task tool to launch the "prober"
      subagent exactly once. Then reply with exactly the text the subagent
      returned.' --output-format json --model sonnet --allowedTools Task
      --permission-mode acceptEdits --settings .../hooks/settings.json
      --agents '{"prober":{"description":"Reports which model it believes it
      is","prompt":"Reply with exactly one line: I-BELIEVE-I-AM: <your model
      id>. Do not use any tools.","model":"haiku"}}'
  EXIT 0

  result: "I-BELIEVE-I-AM: claude-haiku-4-5-20251001"          <- SELF-REPORT
  modelUsage: claude-haiku-4-5-20251001 (156 out tokens, canonicalModel
              claude-haiku-4-5) AND claude-sonnet-5 (190 out tokens)
  subagent_stats: spawned 1, by_type {"prober":1}

So the self-report AGREED with the harness accounting here. Agreement is
corroboration, NOT proof of trustworthiness. The lying probe below settles it.

### SubagentStop is the event that matters, and it carries a POINTER

Real captured SubagentStop payload (verbatim keys):

  session_id, transcript_path, cwd, scratchpad_dir, prompt_id, permission_mode,
  agent_id "a8576cbe6ad2f53b0", agent_type "prober", hook_event_name,
  stop_hook_active, agent_transcript_path, last_assistant_message,
  background_tasks, session_crons

  agent_transcript_path = /root/.claude/projects/<proj>/<session>/subagents/
                          agent-a8576cbe6ad2f53b0.jsonl

Still NO model field. But the PARENT transcript and the AGENT transcript are
separate files and each records its own model:

  parent transcript, 3 assistant rows: model claude-sonnet-5, isSidechain false
  agent  transcript, 2 assistant rows: model claude-haiku-4-5-20251001,
                                       isSidechain true,
                                       message.usage.service_tier "standard"

THIS IS THE MECHANISM. SubagentStop fires at TURN END for that agent, hands you
agent_id + agent_type + agent_transcript_path, and the transcript at that path
is harness-written and names the model that served every assistant message.
M4-D-06's "(b) WHEN: at TURN END" is satisfiable, and by a hook.

### THE TRUST BOUNDARY, DEMONSTRATED RATHER THAN ARGUED

Same shape, but the agent is told to emit a FALSE self-report:

  --agents '{"liar":{...,"prompt":"You are a TEST FIXTURE ... emit a
    deliberately INCORRECT self-report ... Reply with exactly one line:
    produced-by: GPT-7 Turbo (OpenAI model family)","model":"haiku"}}'
  EXIT 0

  SELF-REPORT (result):    "produced-by: GPT-7 Turbo (OpenAI model family)"
  HARNESS modelUsage keys: ["claude-haiku-4-5-20251001","claude-sonnet-5"]
  SubagentStop.last_assistant_message: "produced-by: GPT-7 Turbo (OpenAI model family)"

And the agent transcript line, ONE JSONL record carrying both:

  model=claude-haiku-4-5-20251001  isSidechain=true
  text="produced-by: GPT-7 Turbo (OpenAI model family)"

The agent said OpenAI. The harness recorded Anthropic haiku. Nothing reconciled
them and nothing complained. A `produced-by` line written BY the reviewing agent
is an unverified assertion, and this is the command that shows it.

## Item 5: the measured problem. CONFIRMED, and it is WORSE than stated.

### 5a. The pair the intake names

  delivery/review/clean-room-m3-exit-subject-criteria.md:5
    produced-by: Claude, Sonnet 5 (claude-sonnet-5)
  delivery/review/clean-room-m3-exit-subject-hazard.md:5
    - produced-by: Claude Opus 5 (Anthropic model family)

Both Anthropic. Staged as verdict documents (copies of the shipped fixtures
witness/fixtures/dual-review/decorrelated-{criteria,hazard}.yaml with only the
produced-by line substituted) into a scratch context with the repository's own
assurance-modes.yaml and a charter set to delivery-mode full, then run through
the SHIPPED script:

  $ node scripts/check-dual-review.mjs /tmp/.../dualreview
  check-dual-review: 1 registered check(s) named dual-review-decorrelation ran over 2 verdict(s)
  REPORT dual-review-decorrelation 2 verdict(s) for phase M3-P9 are distinct on produced-by, framing, review-contract
  check-dual-review: green (2 review verdicts examined for decorrelation)
  2 verdict(s) examined by 1 registered check(s); no decorrelation violation
  EXIT 0

  node v22.22.2 AND node v26.6.0 (fetched to a scratch prefix, v26.6.0
  confirmed by --version): identical output, exit 0 both. Not toolchain-dependent.

**GREEN. Two Anthropic reviews read as decorrelated. The intake is CONFIRMED.**

CONTROL ARM (so the green above is not a check that never objects): same pair,
hazard side's produced-by set to the criteria side's string verbatim.

  EXIT 1, red:
  INVALID #/produced-by produced-by value claude, sonnet 5 (claude-sonnet-5)
  occurs in 2 of the 2 verdicts for phase M3-P9 (...), so the reviews are not
  decorrelated on produced-by

So the check works exactly as designed and the design is the defect.

### 5b. SECOND STRUCTURALLY DIFFERENT MEMBER (one witness is not a class)

The same shape occurs in a second, unrelated pair:

  delivery/review/clean-room-witness-ownership-criteria.md:5
    produced-by: Claude (Sonnet 5, Anthropic)
  delivery/review/clean-room-witness-ownership-hazard.md:7
    - produced-by: Claude Opus 5 (Anthropic)

Not the pair the intake names. Two members, so this is a class, not an incident.

### 5c. THE WORSE FACT, WHICH THE INTAKE DOES NOT STATE

  $ ls delivery/review/*.yaml delivery/review/*.json
  ls: cannot access ...: No such file or directory      EXIT 2
  $ ls delivery/review/*.md | wc -l
  198
  $ node scripts/check-dual-review.mjs /home/user/tiphys-ai-helmsman
  check-dual-review: error (0 review verdicts examined for decorrelation)
  /home/user/tiphys-ai-helmsman/charter.yaml does not exist, so the declared
  mode's merge-authority is unknown ...                 EXIT 21

loadCommittedVerdicts at src/checks.ts:2920 skips any file that is not .yaml or
.json carrying `kind: verdict`. This repository's 198 reviews are all markdown.
So on this branch's tree the check has examined no real review at all: the loader
skips every one of them. It fails CLOSED (error, exit
21, not green), which is correct behaviour, but the operative consequence is:

  **decorrelation in this delivery is orchestrator judgment today, unchecked by
  any program, and the program that exists would pass the real pair anyway.**

### 5d. And a false produced-by passes too

Third arm, the string the live "liar" subagent actually emitted:

  hazard side produced-by: GPT-7 Turbo (OpenAI model family)
  (while both reviews would in fact be Anthropic)
  EXIT 0, green, "distinct on produced-by, framing, review-contract"

The check cannot distinguish "genuinely two families" from "one family written
two ways" from "a fabricated family". All three are one string comparison.

## Item 6: the honest answer, and a WORKING PROTOTYPE rather than a fallback

The premise of the question ("if the resolved identity is unobservable") does
not hold. It IS observable. Here is the working hook.

  hooks/resolve.sh, registered on SubagentStop only. It reads the payload,
  takes agent_transcript_path, and greps distinct .message.model over the
  assistant rows. Each exit path I could construct writes a line; the three
  failure arms below are the ones I forced, and I did not enumerate the rest.

  $ claude -p 'Use the Task tool to launch the "liar" subagent exactly once.
      Then reply with exactly DONE.' --model sonnet
      --settings hooks/settings2.json --allowedTools Task
      --agents '{"liar":{...,"prompt":"... Reply with exactly one line:
        produced-by: GPT-7 Turbo (OpenAI model family) ...","model":"haiku"}}'
  EXIT 0

  hooks/resolved.txt:
  RESOLVED agent_type=liar model=claude-haiku-4-5-20251001

  The agent's own text in that same turn claimed OpenAI. The hook reported
  Anthropic haiku. The hook never asked the agent.

FAILURE ARMS OF THE HOOK, run as synthetic stdin so the guard is shown able to
go red:

  $ echo '{"hook_event_name":"SubagentStop","agent_type":"x"}' | hooks/resolve.sh
    -> RESOLVE-FAIL no agent_transcript_path in payload
  $ echo '{...,"agent_transcript_path":"/nonexistent/nope.jsonl"}' | ...
    -> RESOLVE-FAIL agent_transcript_path not readable AT HOOK TIME: /nonexistent/nope.jsonl
  $ echo '{...,"agent_transcript_path":"<file with no assistant rows>"}' | ...
    -> RESOLVED agent_type=z model=RESOLVE-FAIL no assistant model rows

  DEFECT IN MY OWN PROBE SCRIPT, reported rather than hidden: the third line
  begins "RESOLVED" and should not. The failure token is present so the two are
  still distinguishable, but a kernel copying this shape must put the outcome in
  ONE field, not in a prefix and a value that can disagree.

### THE TRUST BOUNDARY, stated precisely

THREE different things, and M4-D-06 must not let them be one field:

  1. SELF-ATTESTED. What the agent says it is. Demonstrated forgeable above:
     "produced-by: GPT-7 Turbo (OpenAI model family)" from a haiku agent.
     This is what every `produced-by` line in delivery/review/ is today.
     Trust level: NONE. It is an assertion by the party being checked.

  2. HARNESS-OBSERVED, SAME TRUST DOMAIN AS THE AGENT. message.model in the
     agent transcript, and modelUsage / subagent_stats in the CLI result
     envelope. Written by the Claude Code process, not by the model. The agent
     cannot emit these by talking. It COULD in principle write to the transcript
     file with a Write tool, since the file is 0600 owned by the same uid the
     agent's Bash tool runs as. So this is strong against a model that is merely
     wrong or merely prompted, and NOT a cryptographic boundary against a model
     that is actively tampering with its own filesystem.
     Trust level: HIGH for the threat this project actually has (two reviews
     that both happened to be Anthropic and nobody noticed). It is exactly the
     T-001 failure class.

  3. OBSERVABLE CONDITION FROM THE ENVIRONMENT. M4-D-06's "override CONDITION".
     MEASURED: in this container there is NOTHING. Zero env vars name a model,
     in the parent or in a child. CLAUDE_CODE_SUBAGENT_MODEL and
     CLAUDE_CODE_SUBAGENT_MODEL_FORCE are both UNSET (printenv exit 1).
     The declared request is observable only as the adapter's own `--model`
     argument, which the adapter chose and is therefore self-attestation about
     the REQUEST, not evidence about the RESOLUTION.

WHAT THE ADAPTER CAN REPORT AS A FACT, in decreasing order of strength:

  a. From SubagentStop: agent_id, agent_type, agent_transcript_path, and the
     distinct set of message.model over that transcript's assistant rows.
     Harness-written, per-agent, at turn end. THIS IS THE ONE TO USE.
  b. From the CLI result envelope (--output-format json): modelUsage keyed by
     dated model id, each with canonicalModel, provider ("firstParty"),
     contextWindow, maxOutputTokens, costUSD; plus service_tier, speed,
     fast_mode_state, and subagent_stats (spawned / refused.depth_limit / ...).
     Session-scoped, not per-agent, and it MIXES the main model with the
     auxiliary sidecar model. Good for cost and for cross-checking (a).
  c. The requested string, recorded AS a request and labelled as one.
  d. The agent's self-report, recorded AS a self-report and labelled as one,
     useful only as a thing to compare against (a) and flag on mismatch.

M4-D-06's phrasing "the adapter reports what it actually resolved" is
SATISFIABLE, via (a). Appendix B item 1 is correct about hook FIELDS and wrong
as a conclusion about hook REACH, because the payload hands over a path.

RECOMMENDATION (offered, not decided): the record should carry BOTH (a) and (d)
and the kernel should refuse when they disagree. A single `resolved` field
collapses a forgeable claim and an observed fact into one string, which is the
exact substitution T-009 names one scope down.

## WHAT I DID NOT COVER, and why

1. **Documentation.** I did not fetch the published Claude Code docs for
   subagents, model resolution order or hooks. Every statement above is from a
   command run in this container against claude 2.1.273. Where the intake's
   documentation-derived claim and my measurement could be compared (Appendix B
   item 1) I compared them. Where they could not, I have no documentation
   opinion. This is a deliberate scope choice per the dispatch ("do not stop at
   the documentation") but it does mean I cannot say whether the behaviour I
   measured is CONTRACTUAL or incidental to this build. A kernel depending on
   `agent_transcript_path` is depending on an observed shape, not a documented
   one. THAT IS A REAL RISK AND I DID NOT RETIRE IT.
2. **One harness version, one entrypoint, one provider.** claude 2.1.273,
   CLAUDE_CODE_ENTRYPOINT=remote_mobile, provider "firstParty". I did not test
   Bedrock, Vertex or Foundry, where `provider` and the model id shape will
   differ. I did not test an older or newer CLI.
3. **Mid-turn resolution change (M4-D-06 part b).** I did NOT witness a case
   where the harness requested one model and was served another under load. I
   cannot force that condition. What I established is only that the record is
   written from ACCOUNTING rather than from the request, which is the property
   that would make it survive such a change. I did not observe the change
   itself, and I am not claiming it was observed.
4. **Whether an agent can tamper with its own transcript.** I reasoned about
   file ownership (0600, same uid) but did NOT run an agent that tried to write
   to its own transcript file. That is the one arm that would settle trust
   level 2, and it is untested. Label the paragraph above a reasoned bound, not
   a measurement.
5. **SubagentStop for parallel / background subagents.** I ran one subagent at a
   time, foreground. Whether agent_transcript_path is correct and
   distinguishable with several in flight is untested.
6. **PreCompact and Notification payloads.** Registered, never fired. I have no
   evidence about their schema in either direction.
7. **The main-agent turn end.** Stop carries last_assistant_message and
   transcript_path but no agent_id. For the MAIN agent, resolution has to come
   from transcript_path plus isSidechain===false filtering, which I read but did
   not build a hook for.
8. **The 198 markdown reviews.** I checked produced-by lines by grep for the two
   pairs the probe named plus a scan of all 31 produced-by occurrences. I did
   NOT audit every review for whether its stated family is true.

## WHAT THIS PROBE CANNOT DISTINGUISH

It CAN distinguish "it works" from "I could not test it" on items 2, 3, 4, 5
and 6: each has a command, an exit code and a control arm.

It CANNOT distinguish, on item 1, "Claude Code guarantees this" from "this
build happens to do this". I did not read the documentation and the behaviour
is not self-describing.

## Reproduction

All artifacts under /tmp/claude-0/m4-probes/model-observability/:
  hooks/settings.json, hooks/dump.sh          payload capture
  hooks/settings2.json, hooks/resolve.sh      the working resolver
  hooks/resolved.txt                          its output
  run1/ run_fail/ run_sonnet/ run_hooks/ run_sub/ run_lie/ run_resolve/
                                              each with out.json and err.txt
  dualreview/                                 the staged verdict context
  node-v26.6.0-linux-x64/                     the floor toolchain

STATUS: COMPLETE.
