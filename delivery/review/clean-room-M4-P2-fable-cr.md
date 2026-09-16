# Clean-room review: M4-P2 async launch

Reviewer: Claude Fable 5.1 (clean-room, evidence-integrity framing)
Subject: branch `claude/m4-p2-async-launch`, head b12dc98, base 3b40118
Started: 2026-09-16

## Status: IN PROGRESS (incremental beacon)

## Step 0: reading
- CLAUDE.md read via system prompt.

## Interim findings (appended as the review proceeds)

- Environment incident: my first review worktree at `scratchpad/m4p2` was CLOBBERED
  by a sibling agent at 02:13:17 (the directory is now a `git clone`, `.git` is a
  directory, reflog says `clone:` then `checkout:`; git's worktree registry still
  points there). My first suite run (520 tests, 53 fail, MODULE_NOT_FOUND and
  ENOENT on `.github/workflows`) is INVALID and discarded. Re-run in a uniquely
  named worktree `m4p2-cr-fable-13095`.
- Derivation honesty (fix-round item 3): the work history's not-covered list is
  explicit and, checked against the code, ACCURATE. The stale-turn-end OPEN
  QUESTION is answered by src/task.ts:406 (`readdirSync(dir).length > 0`) and my
  probe: refused by CR-301 before the precondition. The FIFO arm (untested by
  the phase) refuses in 375ms with "could not be read". The allow-pr-credentials
  composition (untested) omits the scrub root from the message and stages none.
- Scope: real gate RED in a staged clone whose trunk is the true fork point,
  for the predicted reason (no declaration at merge base). With the declaration
  staged at the merge base the real gate is GREEN, 10 changed paths audited,
  2 declared paths untouched. No collision with any other wave-1 branch on
  src/spawn.ts, src/task.ts, src/watcher.ts, test/spawn.test.ts,
  test/credentials-gate.test.ts or the three witness files.
- Citations: 57 distinct tokens; those inside the fenced pre-change block are
  quoted per the gate. Of ~41 prose citations: test/spawn.test.ts:1032 and
  :1118 are STALE (shifted by abe1689; real lines 1047 and 1134), CLAUDE.md:14
  is off by one. Criterion 5's `sed -n '1031,1069p'` measurement was taken
  over a range that at head straddles two tests; re-measured over 1048-1085
  below.
- Claim greps: 5 line hits, 5 wrap-insensitive hits (no wrap miss); all are
  quoted titles, captured output or negations. Passive-form grep: 4 hits, all
  test titles or a negation. Clean.
- Witness specs: three, two members each. Spec 1 members are genuinely
  different (guard deleted vs weakened to existence). Spec 2 member 1 (rethrow
  in runStepAsync) exists for src/task.ts coverage and reddens by making
  spawnTask throw, not by rolling anything back; the rollback-shaped members
  (DS-C, DS-D) were run by hand and are NOT in the spec. Spec 3's two members
  are the same reintroduction with two different bugs.
- 02:21:50: waiting on suite in m4p2-cr-fable-13095, raw logs corroborate WH captures

## Shipped-code attack log (src/spawn.ts, src/task.ts, src/watcher.ts)

- `subprocessAdapter.launch` body: only the signature line and a doc comment
  changed in the diff (verified by reading `git diff 6961186..b12dc98 -- src/`).
- Sync throw inside a non-async adapter: wrapped by `async () => adapter.launch()`
  so it becomes a rejection and is caught by runStepAsync. Held.
- Legacy adapter returning a plain LaunchOutcome: `await` on a non-promise
  works, so the interface change is backward tolerant. Held.
- Hook writes `{endedAt: ISO string, exitCode: integer}` (src/hooks.ts:46-56,
  integer validated); the precondition's shape check matches. Held.
- Hook path == turnEndPath(fleet, taskId) (src/hooks.ts:63). Held.
- Watcher never unlinks or renames turn-end (renames are the check request
  only, src/watcher.ts:744), so a resident watcher cannot race the precondition
  into a false refusal. Held.
- FIFO at turn-end: refused in 375ms, scrub root intact. Held (my probe).
- allow-pr-credentials + fabricated completion: refused, message omits the
  scrub root, task dir holds brief.md, meta.json, turn-end-hook.mjs. Held.
- Stale turn-end from a previous incarnation: refused by CR-301 at
  src/spawn.ts:426 before the precondition runs. The WH's open question is
  answered: not reachable.
- Record disagreeing with the report (record exitCode 3, adapter 0, endedAt
  "not-a-date"): ACCEPTED, spawn reports exit code 0. Plan step 5 says "if it
  parses, the spawn proceeds exactly as today", so this is plan-sanctioned and
  disclosed in the WH. Tracked, not blocking.
- CLI: src/commands/spawn.ts:142 awaits spawnTask; a refusal is one stderr
  line and exit 1. Held.
- C-1: no log-tail reads added. C-2: no pid/liveness. C-3: the promise is
  awaited inside spawnTask; nothing detaches. Held.

## Verdict: APPROVE (with tracked findings), reproduction PARTIAL

Forced to report at 02:22 UTC with the suite at 224 pass / 2 fail of ~855 in
`m4p2-cr-fable-13095` (node v26.6.0, dist built, `npm test`, git worktree),
under load 65 on 4 CPUs. The two fails are both in test/coverage-gate.test.ts,
the file the work history names as the wall-clock false-red signature; I did
NOT get to read their assertion text and do not claim the cause. The
red-witness gate had not started. Its verdict on this branch is UNOBSERVED by
me; what I verified is the implementer's harness (verify-witness.mjs applies
each find/replace once, runs the named tests with the pattern flag before the
path, requires red then green) and its raw logs (dsB2.log, dsD.log), which
match the work history verbatim. CI with fetch-depth 0 must supply the gate.
