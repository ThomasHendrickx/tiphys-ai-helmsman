# The paperwork branch is locally green, and what that sentence does and does not cover

- date: 2026-09-16
- branch: `plan/pstack-borrow-review`, head `aecb518`
- purpose: DR-0031 clause 3 says CI enforces that `main` stays green and is NOT
  how you find out whether you are green. This is the finding-out, done first.

## What was run, and every qualifier

**Preflight, in the order CLAUDE.md's gate list gives:**

| step | result |
|---|---|
| `npm run build` (the type gate) | exit **0** |
| `git status --porcelain` after the build | **0 lines**, which is the acceptance criterion |
| `npm test` | 849 tests, **848 pass, 1 fail, 0 skipped**, exit 1 |

The suite sentence with all four qualifiers, because three is not enough here:
interpreter node v26.6.0 at `/home/user/n26-review/bin`; `dist/` BUILT;
invocation `npm test`, which is what the `suite` gate runs rather than the two
extra a bare `node --test` picks up; tree a git CHECKOUT, and deliberately placed
OUTSIDE `/tmp/claude-0` so standing warning 1's traversal trap could not
contribute a failure that looks like a branch defect.

**The one failure is not this branch's**, and it is controlled rather than
argued: `test/coverage-gate.test.ts:476` fails with
`pattern ^(?:R-[0-9]+[a-z]?)$ did not complete within 250ms`, and the SAME test
on the SAME tree run alone gives 1 test, 1 pass, 0 fail, exit 0. It is the
wall-clock defect now planned as M4-P28, witnessed five times by four parties,
and this run lowered its known threshold to load 33. Full account in
delivery/verification/wall-clock-budgets-are-load-dependent.md:1.

**The registry gates, run locally:**

| verdict | gates |
|---|---|
| green (7) | `manifest-self-check`, `citations`, `clause-map`, `agent-rules-drift`, `brief-drift`, `check-agents-references`, `license` |
| green (1 more) | `credential-scrub`: no pull-request-capable credential resolvable from any of 7 probed sources |
| not-applicable WITH A REASON (5) | `scope` (branch name deliberately does not match the phase pattern), `red-witness` (no changed path under `src/` or `bin/`), `check-dual-review` (no verdict document), `deploy` and `migrations` (no `release-verification.json`, which is structural pre-merge) |
| red | **none** |

`citations` at this head: 27 changed documents linted, 556 citations resolved,
0 self-citations, 0 unverifiable-external.

## What this does NOT establish

- **No CI run has been observed**, on either event. By T-009 there is no
  `pull_request` arm and no `push` arm witnessed here at all, and a local green
  is evidence only for the configuration that produced it.
- **The macOS smoke job cannot run here**, and CLAUDE.md names it as one of the
  two genuinely CI-only items.
- **`coverage` and `suite` were not run as GATES**, only the suite directly.
  Both are wall-clock sensitive and the box has been at load 27 to 69 all day,
  so a gate-level run would be measuring the machine as much as the branch.
- **The gates above were run at a single head** and this branch has moved since
  several of them. The head named at the top is the one the suite and the
  citations gate ran against; re-run before opening if it moves again.
- **Nothing here says the CONTENT is right.** It says the mechanical checks pass.
  Under DR-0027 this branch is `delivery/**` and takes no review round, which is
  a deliberate owner decision about cost, not a claim that it was reviewed.
