# Clean-room review: M3-P3 round 10, acceptance criteria and shipped behaviour

Reviewer: clean-room criteria reviewer (independent of the round-10 implementer
and of the concurrent delta verifier).
Head under review: 676c050
Started: 2026-08-10 (beacon created in the first minutes per T-008).
Status: IN PROGRESS. This file is appended to as work proceeds.

## Method

Fresh detached worktree at 676c050 under the scratchpad. Floor toolchain
(node v26.6.0) placed first on PATH and re-confirmed with `node --version` in
the shell that runs each command.

## Log

- Worktrees: `CR10-wt` (detached 676c050) for execution, `CR10-report` (branch
  `claude/review-m3p3-r10` off origin/main) for this file. The main repository
  was never written to.
- node v26.6.0, npm 11.18.0, `npm ci` exit 0, `npm run build` exit 0,
  `git status --porcelain` 0 lines after the build.
- Isolated staged install `CR10-inst` (dist, schemas, decisions, registries,
  templates) so no fixture ever mutates a git worktree. Every mutation battery
  restored by `cp` from a pristine copy inside a `finally`, and printed AND
  compared md5: `match=YES` on both batteries.
- `mode show` run for all three modes: exit 0 each, all three
  `execution-status` sentences read, all three `skips:` sections read.
- CR-002 members 1, 2 and 3 re-run. Member 1 exit 1, member 3 exit 1, member 2
  (faithfully reconstructed, including the `review-contracts[]` the round-8
  report specifies) exit 0 with `direct-pr` correctly annotated NEVER
  EXERCISED.
- V-1 direction B, both sides of the relation: phantom `skips[]` entry exit 1;
  reference pipeline SHRUNK with no `skips[]` edited at all, exit 1 with two
  diagnostics.
- CRB9-02 both directions: honestly downgraded `full` exit 1; legitimately
  LEANER `full` exit 0 and still annotated the un-downgraded process.
- Foreign `--file` arm exercised on four documents with a properly staged
  context; all sentences read.

