# DR-0065: what a kernel-launched reviewer may do

- id: DR-0065
- status: RAISED, 2026-09-30, awaiting the owner
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
