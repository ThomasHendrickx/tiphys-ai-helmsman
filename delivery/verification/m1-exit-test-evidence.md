# M1 exit test: evidence

- date: 2026-08-06
- head under test: `7e1b5f1acd3b7d4eb267165e39825fef845a4818` (`main`, after PR #9)
- toolchain: Node v26.6.0, the DECLARED FLOOR, not the container default of 22.x
- mode: local
- **result: PASS, exit code 0**
- presented to the owner unasked, per DR-0015, which removed the owner's
  approval click but explicitly kept the reporting obligation

## The gate

Binding convention 6: milestone exit tests are hard gates. No milestone starts
before the previous exit test has passed with recorded evidence. This is that
evidence.

## Preconditions, on the merged head

```
node --version          v26.6.0
npm ci                  exit 0
npm run build           exit 0
git status after build  clean
```

## The run

```
scripts/m1-exit-test.sh --mode local <evidence-dir>
EXIT CODE: 0
```

Evidence bundle: **56 records**, a 12-entry step map covering every step of
plan section 4, and `session.json`. Record kinds: 29 executed, 19 assertion,
3 observation, 2 skipped-full-only, 2 substituted, 1 started. Nothing silent:
every full-only skip and every local substitution is a recorded entry with its
reason, rather than an absence.

## The falsification control, which is what makes the pass mean anything

A harness that cannot fail is worse than no harness. Run on the SAME head,
same toolchain, with stage B skipped so nothing merges:

```
TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 scripts/m1-exit-test.sh --mode local <dir>
EXIT CODE: 1

m1-exit-test: FAILED: step C2 (tiphys teardown after the squash merge):
              expected exit zero, got 1
captured: tiphys teardown: branch task/m1-exit is not landed on origin/main;
          land it before tearing the task down
C2 record: exitCode=1 outcome=fail
```

It fails at C2, not earlier, which is the specific prediction M1-P6 made at
build time and could not execute until now. The pass above is therefore a
measurement rather than an absence of failure.

## The blueprint's three exit conditions, each witnessed

**1. A trivial task lands as a change on the sandbox default branch, driven by
`tiphys spawn`.**
A4 executed, exit 0 (spawn creates the task, worktree and branch). C1 executed,
exit 0, with the payload's change confirmed present on the sandbox default
branch and the merged sha recorded as an assertion.

**2. `tiphys teardown` REFUSES while the work has not landed.**
A7, exit **1**, outcome pass (the nonzero exit is the expected behaviour):

```
tiphys teardown: branch task/m1-exit is not landed on origin/main;
land it before tearing the task down
```

Plus two further assertions: the refusal names the task branch, and the
worktree survives the refusal. Then at C2, after the merge, teardown exits 0,
the worktree is removed and task meta status is `closed`. Both directions
witnessed.

**3. The watcher WAKES on completion.**
A8, exit 0, one line, byte-exact under `cat -A`:

```
signal m1-exit turn-end$
```

## Also witnessed in the same run

- `tiphys lock acquire`, `renew` before the stage B wait (PR-203), and
  `release` at C3, all exit 0.
- The lease SURVIVED stage B and the harness recorded that observation
  explicitly rather than assuming it. The recovery path for a lapsed lease
  exists and is separately witnessed in M1-P6's work history; it did not need
  to fire here.
- The stage B squash commit carries the deterministic harness identity, not the
  container's ambient git identity.
- The evidence bundle validated at C3.

## What this run does NOT witness, stated rather than implied

**Full mode.** It needs `gh`, which is absent in this container and cannot be
usefully installed: measured 2026-08-06, `gh` installs and `gh api user`
authenticates as the owner, but `gh auth status` reports the token invalid,
`permissions.push` reads FALSE even on the kernel repository where git pushes
demonstrably succeed, and GraphQL is refused with "only the pinned set of
PR-review operations is served". The API path and the git path have different
authorities here.

Two observations are consequently recorded as `skipped-full-only` rather than
executed: `gh pr view` reporting OPEN at A6, and reporting MERGED at C1. Their
local substitutions (the pushed branch ref observed via `git ls-remote`, and
the merged sha observed on the sandbox default branch) are recorded and did
execute.

Full mode is runnable on a real runner or the owner's machine with:

```
scripts/m1-exit-test.sh --mode full \
  --sandbox-remote https://github.com/ThomasHendrickx/tiphys-ai-helmsman-sandbox \
  --stage a <evidence-dir>
# then, after the PR is merged:
scripts/m1-exit-test.sh --mode full --stage c --approval <file> <evidence-dir>
```

**Long-horizon resident operation.** Backoff is witnessed at test timescales
only, which plan v1 section 4 already records as a known limit.

## Milestone standing

M1 is complete. Six phases merged: PR #1, #2, #3, #6, #8, #9. The exit test
passes on the merged head with a falsification control proving it can fail.

Carried forward into M2, recorded in `delivery/STATE.md` rather than closed
here: the unprobed-open class remains in `src/lock.ts`, `src/pool.ts` and
`src/brief.ts`; three tracked lows from M1-P6; and one genuine suite flake,
`test/liveness.test.ts:671`, which asserts a hardcoded age and fails under CPU
contention. That last one matters more than its severity suggests, because the
rules treat `node --test` exit 0 as a hard binary gate and a gate with a flaky
member is not binary.
