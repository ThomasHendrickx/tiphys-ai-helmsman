# Independent delta verification: M3-P3 fix round 7

Head under verification: `986f58a` on `claude/m3-p3-assurance-modes`.
Prior head (round 6): `218fc12`. Merge base with `origin/main`: TBD.
Verifier: independent delta verifier, did not write the code.
Started: 2026-08-09.

Toolchain: `/tmp/claude-0/.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin`
first on PATH, `node --version` = v26.6.0, npm 11.18.0, confirmed in the shell
that runs each command.

Working tree: fresh detached worktree at `986f58a`.

## Status

IN PROGRESS. Appending as work proceeds.

## Log

- Worktree created at `986f58a`. Diff `218fc12..986f58a` is 3 commits,
  9 files, 1092 insertions, 12 deletions, matching the brief.

- Read on `origin/main`: CLAUDE.md, `arbitration-m3-p3-a2.md`,
  `clean-room-m3-p3-a2-correctness.md` (566 lines, findings read in full),
  `orchestrator-reproduction-cr-001.md`, `orchestrator-cr-001-fix-feasibility.md`,
  `DR-0022`. Work history deliberately NOT yet read.
- `npm ci` EXIT=0, `npm run build` EXIT=0, `git status --porcelain` 0 lines
  after build, node v26.6.0 in that shell.
- Round 7's `src/checks.ts` diff read hunk by hunk. Five hunks:
  (1) `NOT_QUOTABLE` docstring, (2) `QUOTE_MARKER` extracted +
  `SKIPPABLE_PREFIX` widened, (3) `startOffset` docstring, (4) two literal
  regexes replaced by `QUOTE_MARKER` in `startOffset` and `sourceSlice`,
  (5) two docstrings in `paragraphsBeneath` / `quotableUnits`.
  Only ONE hunk changes behaviour: the `SKIPPABLE_PREFIX` widening.
  `QUOTE_MARKER` has no `g`/`y` flag, so sharing one regex object across
  `.exec` and `.replace` carries no `lastIndex` state. Confirmed by reading.

- T-011 mechanical check: EVERY `dangerousStates.find` in all 19 witness specs
  under `witness/` (38 mutation states) resolves to EXACTLY ONE occurrence in
  `src/checks.ts` at `986f58a`. Zero non-unique. Command in the report body.
- Verifier's OWN 69-shape set, markup-free, scored against TWO structurally
  independent oracles (`commonmark` 0.31.2 AST inline text, and `markdown-it`
  14.1.0 token stream). Both oracles agree on 68; on those 68 the
  implementation matches 68/68. The one split (T6, `>\t>\t- x`) is a genuine
  tab-handling disagreement BETWEEN the two parsers; the implementation follows
  `commonmark`, which is the project's chosen parser.
  Shapes included that round 7 did not name: depths 7, 9, 10, 11 and 12;
  `- 1. - > - 1. - > -` (nine markers); mixed `*`/`+`/`-`; paren ordered
  markers; tabs mixed with spaces; quote-inside-list-inside-quote.

- **V-1 (HIGH) FOUND: the widened `SKIPPABLE_PREFIX` backtracks exponentially,
  and it is REACHABLE from `quotableUnits`.** Measured: `986f58a` takes
  **73,175 ms** on a 269-byte two-line document where `218fc12` takes 23.7 ms
  and returns the SAME unit. Regression introduced by this round. Details and
  reproduction in the findings section.
- DR-0022 acceptance criterion RE-DERIVED from `git archive 18c335a`
  (md5 `4f9ed9b66f6a7e1e04efdb2450c7da9e`, agreeing with the correctness
  reviewer's independent derivation): **20/20 byte-identical, 504 units**,
  probe EXIT=0. Round 7's claim CONFIRMED.
- md5 of `218fc12:src/checks.ts` = `0d3504eadfc894d85e06b9a81d2f0db6`. Round
  7's pin CONFIRMED.
- Diagonal CONFIRMED: each of the three new tests is red under exactly its own
  two witness members and green under the other four.
- Verifier's own 23-mutant campaign run. 12 SURVIVE, including
  `SKIPPABLE_PREFIX` bounded at THREE markers.
