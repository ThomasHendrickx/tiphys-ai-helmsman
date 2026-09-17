# Clean-room review: M4-P26 (rollback)
Review started 2026-09-16T01:29:42Z. Framing: CORRECTNESS AND DATA LOSS.

## Context read
- CLAUDE.md, plan section kernel-plan-m4.md:3334-3540, work history (1166 lines),
  m4-conflict-pre-pass.md (wave 1b at base de9b386 declares M4-P26).
- Diff: 18 files, 4585 insertions, 1 deletion.

## Check 0: item 3 of the fix-round contract (the not-covered statement)
The work history HAS one, at "WHAT THE DERIVATION DID NOT COVER" plus a second
list "What this phase did NOT do". Four + seven entries. Judged below.

## Candidate findings under investigation
1. publishCutoverState round-trips ONLY `switches`; unknown top-level keys and
   unknown per-record fields are silently dropped on every rollback write.
2. planRollback overwrites `restoreTo` on a NO-OP re-run, destroying the
   pre-flip record the freeze-point restore depends on.
3. restoreRetirementRoots: `git checkout <sha> -- <root>` does not delete files
   added after the freeze, so the "restore" leaves a hybrid tree.
4. evaluatePortRow: a negative witness killed by a signal (status null) is
   read as `ported`.
5. syncFleetState does `git add -A` at the fleet root, committing and pushing
   whatever else is there, during a trigger whose precondition is that
   in-flight work exists.

## Reproductions (all on node v26.6.0, dist built, clone at 7dcce83)
- `node --test --test-reporter=tap test/cutover.test.ts` -> 27 tests, 27 pass, 0 fail, 0 skipped.
- full `npm test` (NODE_OPTIONS=--test-reporter=tap) -> 876 tests, 875 pass,
  1 fail, 0 skipped, exit 1. The one failure is test/coverage-gate.test.ts:146,
  `'error' !== 'green'`. Third distinct subset of the SAME untouched file across
  three runs (implementer: 189/190/193, then 182; mine: 180). File alone: 17/17.
- red-witness gate: green, 9 witnesses, 18 members. Reproduced independently.
- citations gate: green, 527 resolved at 7dcce83.
- scope gate: RED (declaration absent from merge base). Reproduced; the
  implementer reported this as an orchestrator grant, which is correct.
- check-authored-bytes.mjs: exit 0. No `Bin` files in the diff. No non-ASCII.
- claim grep: 64 line-visible, 64 wrap-insensitive, zero missed by wrap.
- C-1/C-2/C-3: no pid, /proc, signal, detached spawn, or log-tail read.

## CONFIRMED findings (probes in scratchpad/probe/)
H1 syncFleetState `git add -A` commits and pushes an operator's untracked file
   and a torn in-flight meta.json under the rollback commit. Measured.
H2 evaluatePortRow fails OPEN: any disposition that is not exactly "PORT",
   including a string row or a number row, returns `ported`. Measured.
M1 a second (no-op) rollback overwrites every `restoreTo`. Measured.
M2 publishCutoverState drops unknown top-level and per-record fields. Measured.
M3 restoreRetirementRoots prints RESTORED while the root does not match the
   sha (post-freeze files survive). Measured.
M4 rollback.md:61 and work-history:1072 cite test/cutover.test.ts:135 and :177
   as the atomicity witnesses; they are at 210 and 252. Stale since f42217c.
L1 cutover-rollback-atomic.json member 2 reddens on a throw, not on a partial
   write, so it is not a member of the class the witness names.
L2 `witness/` is a de-facto shared append-only tree not allocated in the
   pre-pass and not listed with the three registries in CLAUDE.md rule 5.
