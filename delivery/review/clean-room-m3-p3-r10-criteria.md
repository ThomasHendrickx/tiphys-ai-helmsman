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

- Schema hunk INERTNESS CHECKED, not assumed. Structural JSON diff of
  `schemas/assurance-modes.schema.json` between b5c01f0 and 676c050 reports
  exactly ONE changed path, `/$defs/modeShape/properties/skips/$comment`, and
  swapping the round-9 schema into the staged install gives byte-identical
  output on four probes (shipped document, downgraded reference, phantom entry,
  `mode show`). `assurance-modes.yaml`'s hunk is comment-only: the parsed data
  is identical and the non-comment line diff is empty at exit 0.
- DR-0020: five `CLOSED VOCABULARY AT v0.1.0 (DR-0020)` disclosures across the
  three schemas, head and round 9 both, and round 10's schema diff contains
  zero `CLOSED VOCABULARY` lines. `mode show` still annotates both
  validated-only modes and the `--file` arm still says "not determinable here".
- DR-0022 re-derived independently from `git archive 676c050 delivery/decisions`:
  20 records, 504 units on both arms, DIFF_EXIT=0, md5
  e5c0dfd22c3b3f9215b88200d2804352. Sixth independent derivation.
- Suite, three axes, all exit 0: npm test + dist = 507/507/0 skipped; bare
  `node --test` + dist = 509/509/0; npm test without dist = 507 tests, 498
  pass, 9 SKIPPED; default toolchain node v22.22.2 + dist = 507 tests, 505
  pass, 2 SKIPPED.
- CI OBSERVED on the exact head: `gates` workflow, event `pull_request`, run
  31375024358, job 93412207232, head_sha
  676c0509b1e5396adee35ca1367ca03eb9469896, conclusion SUCCESS, completed
  2026-08-10T09:48:53Z. The post-merge `push` arm cannot exist yet and remains
  owed under T-009.
- Full registry gate bundle running in a scratch CLONE under the real branch
  name `claude/m3-p3-assurance-modes`, base 3c60acb, `--phase m3-p3`.

