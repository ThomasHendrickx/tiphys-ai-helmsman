# DR-0065: what a kernel-launched reviewer may do

- id: DR-0065
- status: DECIDED BY THE OWNER, 2026-09-30: option 1, harness-neutral
- raised by: the orchestrator, during M6-P5 fix round 1

## Why this is the owner's

DR-0062 has the kernel launch every reviewer. M6-P5 built the launcher
(`tiphys review dispatch`), which starts a headless Claude Code session in a
throwaway worktree. The first review launched this way (M6-P5 review A,
2026-09-30, $10.57) could not write its verdict or run any command, because
the launcher passes no permission flags. Its record therefore carries no
verdict hash and never counts.

The fix that grants the reviewer write and command permissions was refused by
the implementing session's permission classifier as creating an unsafe agent.
An agent does not route around that refusal, so the grant is the owner's to
give or withhold.

## Options

1. **Scoped grant (recommended).** The launcher passes
   `--permission-mode acceptEdits` and an allow-list: Read, Glob, Grep, Write,
   Edit, and Bash limited to `node`, `npm run build`, and read-only `git`
   (`diff`, `log`, `show`, `grep`, `status`, `checkout --`). No `git push`, no
   network tools. The child already runs with GitHub tokens scrubbed (M6-P5
   fix round 1, CR-M6P5A-02). The reviewer can run and mutate tests in its
   own worktree, as today's reviewers do.
2. **Read-only reviewer.** Read, Glob and Grep only. The reviewer returns its
   verdict in its final message and the kernel writes and hashes the file. No
   test runs or mutations by the reviewer. Review A worked this way by
   accident and still found two high and three medium findings, by reading.
3. **Full grant.** `--permission-mode bypassPermissions`. Not recommended.

## Recommendation

Option 1. It keeps the review as strong as today's, bounds what the child can
touch, and needs one explicit approval of one edit to
`plugin/src/review.ts`.

## Consequence either way

M6-P5 cannot merge until this is decided: its merge gate counts only
kernel-recorded reviews with a verdict hash, and no launched review can
produce one today.

Evidence: delivery/decisions/DR-0062-the-kernel-launches-reviewers.md:1 is
the decision this realizes.

## Decision

The owner, 2026-09-30, verbatim:

> option 1 but dont ty it to claude, only if the harness is claude is that
> allowed. A codex harness should be able to execute

Option 1 is granted, with two conditions: the grant is not a Claude feature,
and a Codex harness must be able to run a review too.

## How it is realized (orchestrator, under DR-0016)

1. **The kernel states the grant once, with no harness in it.** A reviewer
   may read the repository, write inside its own review worktree, and run
   `node`, `npm run build` and read-only `git`. It may not push and has no
   network tools. This lives in `src/` as data the kernel passes to the
   executor. No vendor or harness name enters `src/`.
2. **Each executor maps that grant to its own harness.** The Claude Code
   executor in `plugin/` maps it to `--permission-mode acceptEdits` and an
   `--allowedTools` list. Those flags exist only there. M6-P5 does this.
3. **A Codex executor is a new phase, M6-P7.** It maps the same grant to
   Codex's own sandbox and approval settings, checked against the installed
   Codex CLI rather than memory. Measured 2026-09-30: `OPENAI_API_KEY` is set
   in this environment, `GET https://api.openai.com/v1/models` answers 200,
   and `npm view @openai/codex version` prints 0.159.2. So its served-model
   reading can be witnessed against real captured Codex output, as the
   red-witness rule requires. It is a separate phase, not part of M6-P5's fix
   round, because it is new scope and needs its own review.

## Known limit, stated rather than hidden

The allow-list bounds the harness's own tools, not what an allowed program
can do: `node -e` can start any process. Scrubbing `GH_TOKEN` does not stop a
push either, because the agent proxy in this container supplies credentials
on the way out (CLAUDE.md, standing warning on REST reachability). So the
grant is a bound on an honest reviewer, not a security boundary against a
hostile one. Branch protection on `main` remains what keeps `main` safe.
