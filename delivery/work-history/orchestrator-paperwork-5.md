# Work history: orchestrator paperwork 5, kernel 0.2.1 release

Branch `claude/m5-orchestrator-paperwork-5`, cut from `origin/main` at 2c49ab3
(after #216 and #218). Not a phase branch: the phase-pattern check printed
`false`. Written incrementally.

## Log

- Branch created from origin/main 2c49ab3; branch-name check printed `false`.
- `node scripts/check-id-collisions.mjs`: exit 0, "next free T-047", "next
  free DR-0057", "no collisions". The history search for `A-17` over all refs
  printed nothing. The same search for `A-16` hits only c9f14d9, where A-16 is
  a fixture id inside a review report ("open action A-16 with no register
  item"), so A-16 is treated as taken and A-17 is allocated.
- Copied both hand-run merge-preconditions captures verbatim into
  `delivery/evidence/` (non-ASCII byte count 0 in each).
- The scratch `clean-room-kernel-0-2-1-release-bump.md` (90 lines, 4804
  bytes) is byte-identical to the first 90 lines of main's
  delivery/review/clean-room-kernel-0-2-1-release-bump-hazard.md:1
  (`head -90 ... | cmp -` exit 0); main's copy adds the 95d1ede update. It
  is a duplicate and was NOT added.
- REST API probe (curl through the agent proxy, all HTTP 200). Every run
  below is `completed`, conclusion `success`, attempt 1:

  | run | workflow | event | head |
  |---|---|---|---|
  | 35966714698 | gates | pull_request | 8a00c96ce3ddf8524308df2b78d4ee5242221504 |
  | 35966714689 | macOS smoke | pull_request | 8a00c96 (same) |
  | 35971153312 | gates | push | 69a7a607abb2932ff87bc580df22f304a38c2a0b |
  | 35971153205 | macOS smoke | push | 69a7a60 (same) |
  | 35973303679 | gates | pull_request | a957a9590683836231e8563a6135c4fbb88de1a1 |
  | 35973303931 | macOS smoke | pull_request | a957a95 (same) |
  | 35976377266 | gates | push | 2c49ab39d25b08783c8dd6422e96adc38de222f2 |
  | 35976377284 | macOS smoke | push | 2c49ab3 (same) |
  | 35976386843 | release | workflow_dispatch | 2c49ab3 (same) |

  Release run jobs: `release` completed success 08:52:11Z, `tag` completed
  success 08:52:24Z. The runs API does not return dispatch inputs, so
  version=0.2.1 confirm=0.2.1 is the orchestrator's account, not observed.
- `GET /pulls/216`: merged true, merge_commit_sha 69a7a60..., head 8a00c96,
  merged_at 2026-09-24T07:43:17Z. `GET /pulls/218`: merged true,
  merge_commit_sha 2c49ab3..., head a957a95, merged_at 2026-09-24T08:37:54Z.
- Tag: `ls-remote origin 'refs/tags/v0.2*'` printed exactly two lines,
  `fdd6ff1...  refs/tags/v0.2.1` (an annotated tag object) and
  `2c49ab3...  refs/tags/v0.2.1^{}`. No v0.2.0 tag is present, so A-15 stays
  open. `GET /releases/tags/v0.2.1`: 200, name v0.2.1, draft false,
  prerelease false, published 2026-09-24T08:52:21Z, body names commit 2c49ab3
  and run 35976386843. `GET /releases/tags/v0.2.0`: 404.
- `npm view @tiphys/kernel dist-tags`: `{"latest": "0.2.1"}`;
  `npm view @tiphys/kernel@0.2.1 gitHead`: 2c49ab39d25b08783c8dd6422e96adc38de222f2,
  published 2026-09-24T08:51:54.743Z.
- Follow-up (e) was MEASURED rather than copied. The `gates` workflow now
  uploads `summary.json` (gates.yml steps "Upload the gate summary"), so
  per-gate detail is readable from the run's artifact. Two runs:

  | run | red-witness detail | bundle (summary startedAt to endedAt) | M2 exit test step | gates job |
  |---|---|---|---|---|
  | #216 PR 35966714698 | 115 evaluated (24 own, 91 stored re-evaluated in 727427ms) | 24.8 min | 24.9 min | 47.9 min |
  | #218 PR 35973303679 | 4 evaluated (1 own, 3 stored re-evaluated in 12181ms) | 7.6 min | 7.7 min | 30.7 min |

  Observed: the stored re-evaluation alone took 12.1 minutes on #216. Deduced,
  not observed: the summary carries no per-gate duration, so the whole gate's
  cost on #216 is estimated by subtracting #218's 7.6-minute bundle (where
  red-witness took seconds) from #216's 24.8, about 17 minutes. That is close
  to the brief's "about 16 minutes"; the brief's "roughly 20-minute CI" is the
  bundle step, while the whole `gates` job was 47.9 minutes. The STATE entry
  gives these numbers.
- Follow-up (d) probe: `git config --show-origin --get commit.gpgsign` prints
  `file:/root/.gitconfig true`, `gpg.format` is `ssh`.
  test/remove-git-directory.test.ts:1 contains no `commit.gpgsign` or
  `GIT_CONFIG` line (grep, no hit); five other test files do set
  `commit.gpgsign` (sweep-exclusion-sync, spawn, cross-environment-lock,
  cross-environment, teardown). The signing-service timeout itself was not
  reproduced by me; it is the orchestrator's observation.
- The #217 push run was not in the brief; read to fill its row rather than
  leave the table incomplete: head 3eeccb911a5ca20bed375783cf3fdb3f54e37934,
  event push, `gates` 35934423857 and `macOS smoke` 35934423859, both
  completed success, attempt 1.
- Wrote delivery/decisions/DR-0057-a-non-phase-branch-merges-with-condition-5-not-applicable.md:1.
  Its tier claims were read from src/gates/merge-preconditions.ts:876 (the
  two lower rows) and src/gates/merge-preconditions.ts:893 (everything else
  fails closed to dual), and condition 5's red arm from
  src/gates/merge-preconditions.ts:533.
- STATE.md: standing header to 2c49ab3; #217, #216 and #218 rows; a release
  paragraph; the 0.2.1 item removed from "In flight"; M5-P1 now points at A-17; A-17
  in the standing list and as a register item after A-15; A-15's absence
  re-read; seven follow-ups under "Tracked obligations, unowned". No other
  section was rewritten.

## The retirement-inventory test and A-17

OPEN_ACTION_EXEMPT on main is ["A-14"] (test/retirement-inventory.test.ts:848).
A-17 is allocated on this branch and its full register item is on this branch,
so it needs no exemption, and NO TEST CHANGE was made. The smallest correct
change was to give A-17 a real register item (over 25 words, with code spans).

Red witness for that reasoning: STATE.md was first copied to the scratchpad,
then the A-17 register item (1335 chars) was cut from the worktree copy, then
the file was restored by `cp` from the saved copy (`cmp` exit 0). With the
item cut, the test "STATE.md begins with the current standing" exited 1,
"pass 0, fail 1", actual `[ 'open owner action A-17 has no register item' ]`.
With the item present: green, see Checks.

## Checks, at da79453, node v26.6.0 and npm 11.18.0 from the scratch prefix

- `npm ci`: exit 0, 0 EBADENGINE lines.
- `node scripts/check-authored-bytes.mjs`: exit 0 (after committing; before
  the commit it exited 2, "tracked working tree differs from the index", which
  is its refusal to check an unstaged tree, not a byte finding).
- `node scripts/check-id-collisions.mjs`: exit 0, "highest DR-0057, next free
  DR-0058", "highest T-046, next free T-047", "no collisions".
- `node scripts/render-agent-rules-gates.mjs --check`: exit 0, "green (24
  rendered gate rows compared)".
- citations gate (`--base origin/main --head HEAD`, evidence in the
  scratchpad): exit 0, "linted 2 changed document(s) at da79453...: 22
  citation(s) resolved, 0 self-citation(s), 0 unverifiable-external". The two
  documents are delivery/STATE.md and the DR-0057 record; this work history
  is not among the documents it lints.
- `node --test test/retirement-inventory.test.ts`: 56 tests, 56 pass, 0 fail,
  0 cancelled, 0 skipped, 0 todo. `dist/` was not built; the test file
  contains no `dist/` string (grep count 0), and it reported 0 skipped.
- Claim grep over DR-0057: one hit, "whenever" (matches the `never`
  alternative), adjacent to the citation src/gates/merge-preconditions.ts:533
  that settles it. Over the STATE.md additions: "whenever" (same citation),
  and the DR-0037 rule that the orchestrator "never writes" to the pilot,
  which restates a decided rule rather than a measurement. Over this work
  history: the only hits are the quotations of those two phrases in this
  bullet.
- Re-run at 04431ba after this section was first written: citations gate
  exit 0 (captured directly, not through a pipe), "22 citation(s) resolved".
