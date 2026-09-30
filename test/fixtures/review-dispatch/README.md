# Review dispatch fixtures (M6-P5)

`haiku-with-sonnet-subagent.stream.jsonl` is a REAL capture of the harness
CLI's headless stream, taken once on 2026-09-30 in this container (Claude Code
2.1.285) by the M6-P5 implementer, in an empty scratch directory:

    printf 'Use the Agent tool exactly once, with its model parameter set to
    sonnet, to launch a general-purpose subagent whose whole job is to reply
    with the single word PONG. After it returns, reply with the single word
    DONE and nothing else.\n' | claude -p --output-format stream-json
    --verbose --model claude-haiku-4-5-20251001 --allowedTools Agent

The prompt went in on stdin, which is how `tiphys review dispatch` hands a
brief to the executor. Exit 0. The raw capture was 67 rows, sha256
f645b392469af6bc2317ed14bf6910bfa580c87f91a92e79edf66ac41a044a76.

It was captured because it carries the case the review dispatch must handle
explicitly: the top-level assistant rows are all on one model, one assistant
row is the SUBAGENT's (non-null `parent_tool_use_id`) on a DIFFERENT model,
and the final `result` row's `modelUsage` names both. It also carries a row
AFTER the `result` row (`system/task_summary`).

Two alterations, declared so a reader can tell altered-and-declared from
altered-and-hidden, and nothing else in any row was changed:

1. The `system/commands_changed` row (row 3, 25680 bytes, the list of this
   session's slash commands) was REMOVED. It carries no model, cost or usage
   field, and it held 28 non-ASCII characters the authored-bytes rule forbids.
2. In the one remaining row that carried non-ASCII (row 11 of the raw
   capture, a `user` row), U+2014 was replaced by `--`, 4 occurrences.

The committed file is 66 rows, sha256
7d53a0fb23f3199fef409c46f1a2907024f140073f5b338d8f77f3b99d72faa3.

`grant-smoke.stream.jsonl` is a REAL capture of the same CLI (Claude Code
2.1.285), taken once on 2026-09-30 by the M6-P5 fix round 2 live smoke: the
stream `tiphys review dispatch --tier cheaper` captured when the Claude Code
executor ran with the kernel's reviewer grant mapped to its flags (DR-0065).
The command, the five-line brief and the review record are in
delivery/work-history/m6-p5.md, fix round 2. The raw capture was 20 rows,
sha256 a08375099a7ce245d7dab30a78ce082f9d4260965ea95e1b404b8bc6f3aca438.

It carries what the grant changed: the `system/init` row reads
`permissionMode: acceptEdits` and its `tools` list has no `WebFetch` or
`WebSearch`, which the capture above (run without the grant's flags) lists;
the reviewer's `node --version` and `git log` ran, its `Write` of the verdict
succeeded, and the `result` row's `permission_denials` is empty.

One alteration, declared, and nothing else in any row was changed: in row 15
of 20 (a `user` row, the Write tool's result), U+2014 was replaced by `--`, 1
occurrence. The committed file is 20 rows, sha256
d601c5fb7ffe172e3f2c2350c1ac80ad1c95d8fd7ab4ce2a6dc6d495506a02ca.

`codex-luna.stream.jsonl` is a REAL capture of `codex exec --json`
(@openai/codex 0.159.2), taken once on 2026-09-30 by the M6-P7 implementer
with the argv `adapters/codex/review.ts` builds for the kernel's reviewer
grant, `--model gpt-6-luna` (the cheaper tier), a five-line brief on stdin,
and an environment of PATH, an empty HOME, TMPDIR, LANG and `CODEX_API_KEY`.
The argv and brief are in delivery/work-history/m6-p7.md, step 3. The raw
capture was 13 rows, sha256
85df636058847b0803735b6a3c06cab51c014f7da62a7c26054f1cc9bb5facb9.

It shows what the Codex observer reads: `thread.started`, `turn.started`,
`item.*` rows (the reviewer's messages and its four commands) and one
`turn.completed` row carrying token usage, and NO `model` key on any row.

One alteration, declared, and nothing else in any row was changed: in row 3 of
13 (an `agent_message` item), U+2019 was replaced by `'`, 1 occurrence. The
committed file is 13 rows, sha256
f3bfa353a8e8032add5df4bb40288b8b15b3971b964e5d7b74baa3780f34af9d.

`codex-without-key.stream.jsonl` is a REAL capture of the same CLI and argv,
taken minutes earlier with `OPENAI_API_KEY` in place of `CODEX_API_KEY`:
every request was refused `401 Unauthorized: Missing bearer or basic
authentication`, and the run ends in `turn.failed` with no `turn.completed`.
Unaltered, 14 rows, ASCII, sha256
ee260f4def172e842a1dfa8d16ba168e0f51a6671aff0a269fa96ed9b712a701.

`codex-exec-help.txt` is the installed CLI's own `codex exec --help`
(0.159.2), unaltered, sha256
0e82cfde0122715250e93dc65866caa956b2ac5b9d0b20ec4ad4f9e81486509e.
