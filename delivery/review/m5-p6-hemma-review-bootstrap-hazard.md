# Clean-room HAZARD review: hemma bootstrap onto Tiphys kernel

Reviewer: clean-room agent (read-only). Subject:
- ThomasHendrickx/hemma PR #456, head 8e84b4e464e6902bbecdc982242cd87c9cde24bd, branch tiphys/bootstrap, base main a6141d7
- ThomasHendrickx/hemma-fleet PR #1, head bba99ec82bc1108bed802f0ceb0428cef053b05b

Status: IN PROGRESS (written incrementally)

## Log
started Thu Sep 24 14:40:35 UTC 2026

## Method

- Node v26.6.0 (npm 11.18.0) used throughout from
  /tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin
  (task's stated path differs by the "-home-user" segment; the actual
  scratchpad root has no such segment. Verified: node --version = v26.6.0).
- Kernel spec cloned: `git clone -b claude/m5-p6-scale-out-proof
  https://github.com/ThomasHendrickx/tiphys-ai-helmsman kernel`. Built with
  `npm ci && npm run build`, exit 0 each, used to independently re-run gates.
- hemma cloned: `git clone --branch tiphys/bootstrap --single-branch
  https://github.com/ThomasHendrickx/hemma hemma`. HEAD =
  8e84b4e464e6902bbecdc982242cd87c9cde24bd (matches PR #456's stated head).
- hemma-fleet cloned: same pattern. HEAD = bba99ec82bc1108bed802f0ceb0428cef053b05b
  (matches PR #1's stated head).
- Read kernel docs delivery/verification/m5-hemma-intake.md (sections 4e, 4f)
  and delivery/verification/m5-scale-out-exit.md section 1 in full, and
  independently re-verified their material claims rather than trusting them.
- No database was needed for any check run directly by this review (the
  three hemma adapters and prisma steps were not executed here; the exit
  report already captured that evidence with the local-only override rule
  followed). Where I built a push-event simulation, it used a local bare git
  remote only, no database.

## 1. Production safety of merging hemma PR #456

`git diff --stat a6141d7 8e84b4e`: 14 files changed, 1407 insertions(+), 0
deletions. Files: .github/workflows/tiphys-gates.yml, assurance-modes.yaml,
charter.yaml, docs/tiphys/phase-declarations/{m1-p1,m1-p2}.json,
docs/tiphys/plan.yaml, docs/work-history/2026-09-24.tiphys-bootstrap.md,
gate-registry.yaml, package-lock.json, package.json (+1 line),
scripts/tiphys-gates/{gate-result,lint,typecheck,unit-tests}.mjs.

- `package.json`: the only change is one devDependency line,
  `"@tiphys/kernel": "0.2.1"`. Verified with `git diff a6141d7 8e84b4e --
  package.json`.
- Production dependency tree independently re-verified (not trusting the
  exit report's claim): parsed both a6141d7's and 8e84b4e's
  package-lock.json `packages` maps with a small Node script, filtered to
  entries where `dev` is not true, and diffed by key. The only "difference"
  found (1 of 1021 entries) is the ROOT package-lock entry itself
  (`packages[""]`), and drilling into that showed its `dependencies` object
  is byte-identical (`JSON.stringify` equal) between base and head; only
  `devDependencies` gained the one new entry. So hemma's resolved PRODUCTION
  dependency graph (what `next build` and the Vercel build install/bundle) is
  unchanged. Confirmed the kernel's own `yaml` 2.9.0 pin stays isolated at
  `node_modules/@tiphys/kernel/node_modules/yaml` (`dev: true`) and the
  root's `node_modules/yaml` stays 2.8.4 (`dev: false`), by direct
  inspection of the head lockfile.
- `next.config.ts` unchanged (not in the diff). App directory is `app/`; grep
  of `app`, `lib`, `domain`, `server`, `components` for `tiphys` returns no
  hits, so no application code imports anything from the new
  docs/scripts/yaml files. `package.json`'s `build`/`prebuild` scripts are
  unchanged, so `next build` (and therefore the Vercel build) does not touch
  any new file this PR adds.
- No migration: no file under `prisma/migrations/` in the diff (confirmed by
  the file list above). `ci.yml`'s `migrate` job (which runs `prisma migrate
  deploy` against production `DIRECT_URL` on push to main) is untouched.
- No secret exposure: grepped charter.yaml, gate-registry.yaml,
  tiphys-gates.yml and the work-history file for AWS/GitHub/API-key/PEM
  patterns and for any non-localhost `postgresql://` URL with embedded
  credentials. No hits.
- `tiphys-gates.yml`: `permissions: contents: read` only (verified by direct
  read, no other permission scopes present). No `pull_request_target`
  anywhere in the file or elsewhere in the diff (`grep -rn
  pull_request_target` over the whole repo tree found nothing). Two DB env
  vars (`DATABASE_URL`, `DIRECT_URL`) are hardcoded literal
  `postgresql://postgres:postgres@localhost:5432/hemma_e2e` strings, not
  `secrets.*`; they exist only so `prisma generate` finds a config value, and
  the job has no database service so nothing connects.
- Push arm: reads-only. Runs `npm ci`, `prisma generate`, `next typegen`,
  then `tiphys gates run` (three adapters that run hemma's own vitest/tsc/
  eslint read-only, plus `scope` which reads git history only) and uploads
  `summary.json` as a build artifact. No git write, no deploy trigger beyond
  what a normal push already causes via Vercel's own hook (unaffected by this
  PR), no write API call. Concurrency group is keyed by `run_id` on `main`
  (not by ref), so, unlike the kernel's own `gates.yml`, a push run on main is
  NOT cancelled by the next push (verified by reading the `concurrency:`
  block; this is a real improvement over the kernel's own known T-009
  weakness).
- **Independently simulated the push arm** (task instruction: "it has not
  run on push yet: simulate its steps for a push event with the same inputs
  locally"). Built the kernel, made a local clone of the hemma bootstrap
  branch, renamed it to `main`, symlinked `node_modules/@tiphys/kernel` to
  the built kernel checkout, pushed to a local bare "origin", and ran the
  gate runner with the workflow's exact push-arm command shape
  (`--base HEAD~1 --head HEAD --phase main`, since on push `github.ref_name`
  = `main`). Verbatim result (scope gate only, since full deps were not
  installed for vitest/tsc/eslint in this scratch clone):
  ```
  gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch
  evaluated and unmet: branch main does not match
  ^(?:claude/m[0-9]+-p[0-9]+-.*)$
  ```
  This matches the exit report's own "port-closed" push-arm measurement
  (exit 0, scope not-applicable) and is now independently reproduced rather
  than merely read.
- One kernel-level observation, not a defect in this PR: the gate schema's
  per-gate `events` field (e.g. `scope`'s `events: [pull_request]`) is
  declared in the type (kernel `src/gates/run.ts:353`) but a repo-wide grep
  (`grep -rn '\bevents\b' src`) found no other reference to it anywhere in
  the gate runner. It is not read or enforced; a gate is evaluated on every
  event the workflow calls it for regardless of its declared `events` list.
  In this registry it is harmless because `scope`'s `branch-matches`
  precondition independently produces the correct not-applicable verdict on
  push to `main`. Recorded as HZ-B-004 (informational).

**Verdict on #456's production safety: no change to the production runtime,
build inputs, dependency tree, or the migrate job was found. The new
workflow reads only and cannot mask a failure into green** (each adapter's
`finish()` helper fails to `error`/`red` on a missing report, an unreadable
report, a nonzero exit, or a bad JSON shape; verified by reading
`scripts/tiphys-gates/gate-result.mjs`, `unit-tests.mjs`, `lint.mjs`,
`typecheck.mjs` in full: no `|| true`, no `continue-on-error`, no swallowed
exit code).

## 2. tiphys-gates workflow, detail

- Trigger events: `push: branches: [main]`, `pull_request: branches: [main]`.
  Matches CLAUDE.md's stated need (fetch-depth 0, `ref: head_ref`).
- `fetch-depth: 0` is present (needed for the scope gate's merge-base
  resolution; matches the kernel's own standing lesson about this).
- Failure masking: none found. `timeout-minutes: 30` bounds a hang. The
  summary-upload step runs `if: ${{ !cancelled() }}`, which still runs (and
  therefore still surfaces) on a failed-but-not-cancelled job; it does not
  suppress the job's own red exit code, it only ensures evidence is kept.

## 3. Scope gate as wired, adversarial tests (independently run, not read)

Built the kernel (`npm ci && npm run build` in the kernel clone, both exit
0), set up a scratch clone of hemma's bootstrap branch renamed to `main` with
a local bare "origin", created phase branches for
`claude/m1-p1-site-shed-frozen-clock` against the real
`docs/tiphys/phase-declarations/m1-p1.json`, and ran
`node node_modules/@tiphys/kernel/dist/bin/tiphys.js gates run --registry
gate-registry.yaml --mode full --only scope --base origin/main --head HEAD
--phase m1-p1` (GIT_AUTHOR_*/GIT_COMMITTER_* set per CLAUDE.md standing
warning 5) against each attempt:

| attempt | result |
|---|---|
| declared file edited only | green, 1 path audited, exit 0 |
| correct branch, undeclared new file added alongside the declared edit (`lib/sneaky-payload.ts`) | **red**, names the undeclared path, exit 1 |
| wrong branch name carrying the declared file's edit plus a sneak file | **error**, "does not match declaration's own branch", exit 21 (fails closed, never green) |
| `git mv` renaming the declared spec file plus an edit | **red**, names the new (moved) path as outside scope, exit 1 |
| deleting an undeclared tracked file (`README.md`) with no other change | **red**, names the deleted path, exit 1 |
| **undeclared new files placed under the kernel's hardcoded "standing extra" paths, `delivery/review/arbitration-m1-p1.md` and `test/behaviors.json`, neither of which exists anywhere else in hemma** | **GREEN**, "2 changed path(s) audited", exit 0, no mention of either file as out-of-scope |

The last row is a real finding, HZ-B-001. `src/gates/scope.ts:979` and
`src/gates/scope.ts:565` hardcode `test/behaviors.json`,
`delivery/work-history/<phase>.md`, `delivery/review/` and
`delivery/verification/` as always-allowed "standing extras" and "evidence
directories", regardless of what project the gate runs against. Hemma has no
`delivery/` tree and does not use `test/behaviors.json` (its own convention
is `docs/tiphys/` and `docs/work-history/`), so these paths are dead weight
for hemma in the benign case, but they are also an unconditional, silent
scope-audit bypass: any phase branch in hemma can add or edit a file at
`delivery/review/<anything>`, `delivery/verification/<anything>`, or
`test/behaviors.json`, completely undeclared, and the scope gate reports
green. Verified with a direct commit and gate run (table above), not
inferred from the kernel source alone. This is inherited kernel behavior,
not something introduced by hemma's PR #456, and it does not expose
production or secrets by itself (those paths sit outside `app/`, so nothing
in them reaches the Vercel build), but it defeats the audit's stated
purpose for hemma's phases, since hemma's registry has no `merge-preconditions`
or `red-witness` gate to catch it another way, and no content check on those
paths. Severity: MEDIUM. Not a blocker for merging #456 itself (the
bootstrap PR does not exercise a phase branch), but must be flagged before
step 3 (the two frozen-clock phases) runs, since it is exactly the mechanism
those phases will be judged by.

Other observations, non-blocking:
- Wrong-branch and no-declaration cases fail CLOSED (error, never green),
  consistent with the exit report's runs C/D/E and the kernel intake's runs
  C/D/E.
- Path-spelling tricks (case, `./`, trailing slash, double slash) were not
  separately exploitable beyond the rename test above: git normalizes paths
  in its diff output before the gate ever sees them, so there is no
  git-level spelling gap distinct from the rename case already shown red.
- Not tested here: a declared path replaced by a symlink pointing outside
  the repository (scope only audits path names, not path types/targets; this
  is a generic property of the mechanism, not specific to hemma, and was
  out of this review's time budget). Recorded as an open question, not a
  finding, HZ-B-005 (informational, for the orchestrator to consider before
  step 3).

## 4. hidden-bootstrap-handwork

Cross-checked the exit report's own inventory (1g/1h, B-1 to B-17, F-1 to
F-7) against the actual commits and files on both branches rather than
re-deriving it from scratch, since the report's own derivation method
(`env -i` isolation for the CI-env finding, non-dev lockfile diffing) is
itself evidence-backed and reproducible. Found nothing it missed:
- `assurance-modes.yaml` (H-6 / F-3) IS byte-identical to the kernel's own
  copy: confirmed `cmp` was reported exit 0 in the report; independently
  re-hashed the copy of the file the review has on disk
  (`sha256sum hemma/assurance-modes.yaml` and
  `kernel/assurance-modes.yaml`) below.
- No other undeclared handwork found: `gate-registry.yaml`,
  `docs/tiphys/plan.yaml`, and both phase declarations are all committed,
  reviewed prose with sourced comments (each charter field cites the hemma
  document it was read from). No file in the diff is unexplained by the
  work-history document.

```
sha256sum hemma/assurance-modes.yaml
sha256sum kernel/assurance-modes.yaml
```

Confirmed by hash:
```
$ sha256sum hemma/assurance-modes.yaml kernel/assurance-modes.yaml
3aaba6da21a034c9a95d7ee19a36dffb77d985e699e4e33e7a8f6d8297b025ea  hemma/assurance-modes.yaml
3aaba6da21a034c9a95d7ee19a36dffb77d985e699e4e33e7a8f6d8297b025ea  kernel/assurance-modes.yaml
```
Matches the exit report's own claimed hash exactly. F-3/H-6 is real and
already declared (not hidden): it is a byte copy of kernel configuration
placed by hand because 0.2.1 lacks `init --project`, and the report names it
as such. Not a NEW hidden-handwork finding; the declared one checks out.

## 5. hemma-fleet PR #1

`git diff --stat 7efd572 bba99ec` (from the pre-init README-only commit):
adds `.gitignore`, `backlog.md`, `charter/.gitkeep`, `charter/hemma.yaml`,
`decisions/.gitkeep`, `package-lock.json`, `package.json`, `status/.gitkeep`,
`tasks/.gitkeep`. `.gitignore` contents:
```
state/
worktrees/
projects/
```

**HZ-B-002 (medium): `node_modules/` is not gitignored.** Ran `npm ci` in a
clone of the branch (11 packages, exit 0) and checked `git status --short`:
`?? node_modules/` appears as untracked, confirming it is not covered by any
ignore rule. `find node_modules -type f | wc -l` = 1058 files, `du -sh
node_modules` = 8.9M. This matches `tiphys init`'s own hardcoded
`.gitignore` writer (kernel `src/fleet.ts:22`, `FLEET_FILES` list has no
`node_modules` entry; only `state/`, `worktrees/`, `projects/` are
gitignored by design, kernel `src/fleet.ts:161`), so it is not something
hemma-fleet's authors omitted, it is what `tiphys init` 0.2.1 writes
verbatim (the exit report's own byte-for-byte diff in section 1b confirms
this `.gitignore` is `tiphys init`'s stock output). Risk: a future `git add
-A` / `git add .` (which CLAUDE.md's own git-safety protocol separately
warns against, for a different reason) would sweep the whole kernel
dependency tree into the fleet-home repository. Checked
`@tiphys/kernel`'s own `package.json` for lifecycle scripts that would run on
install (`postinstall`, etc.): none present (`scripts` block has only
`build`, `test`, `prepack`, `gate:license`, `prepublishOnly`, none of which
fire on `npm ci`/`npm install` as a dependent). So the risk is repository
bloat and accidental churn, not code execution or secret exposure. Not a
blocker for merging PR #1 as it stands today (nothing has swept node_modules
in yet), but it should be fixed before this fleet home sees routine commits;
recommend adding `node_modules/` to `.gitignore` in a follow-up commit (or a
kernel fix to `src/fleet.ts`'s stock `.gitignore`, which is the root cause
and would also protect future fleet homes).

No secrets found in `charter/hemma.yaml` (architecture prose only, sourced by
comment to specific hemma documents; grepped for credential patterns, no
hits). `package.json` has exactly one dependency, the exact-pinned
`@tiphys/kernel@0.2.1`; `package-lock.json` was not independently rebuilt
against it here since there is no production build surface for a fleet-home
repository to protect (it deploys nothing).

No other findings in hemma-fleet.

## Findings summary

- HZ-B-001 (medium, kernel-inherited, applies to hemma's future phases): the
  scope gate's hardcoded "standing extra" paths
  (`test/behaviors.json`, `delivery/work-history/<phase>.md`,
  `delivery/review/`, `delivery/verification/`) are an unconditional,
  undeclared-file bypass for ANY project using this kernel version, hemma
  included. Demonstrated with a real commit and gate run. Not exercised by
  PR #456 or PR #1 themselves (no phase branch exists yet), so it does not
  block merging either bootstrap PR, but the orchestrator must know it before
  trusting scope-green on the two M1 phases that follow.
- HZ-B-002 (low-medium): hemma-fleet's `.gitignore` (as `tiphys init` 0.2.1
  writes it) does not exclude `node_modules/`. Confirmed by installing and
  checking `git status`. No code-execution or secret risk (no lifecycle
  scripts in the one dependency), but a real repository-bloat/accidental-
  commit risk. Recommend fixing before routine use, not a merge blocker.
- HZ-B-003 (informational, not a defect): confirmed independently (not
  merely read) that PR #456 changes no production dependency, no migration,
  no application code path, and that its new workflow's push arm is read-
  only and cannot mask a failure (adapters fail closed on missing/bad
  output). Re-derived the non-dev lockfile diff myself rather than trusting
  the work history's claim, with the same zero-diff result.
- HZ-B-004 (informational): the kernel gate schema's `events` field is
  declared but not enforced anywhere in the gate runner (`grep -rn` over
  `src` found only the type declaration). Harmless in this registry because
  `scope`'s own branch-matches precondition independently produces the
  correct verdict, but worth the kernel team knowing: a future registry that
  relies on `events` alone to gate a check off would not get what it expects.
- HZ-B-005 (informational, open question, not tested): scope audits path
  names only, not path types. Whether a declared path can be turned into a
  symlink pointing outside the repository and still register as "in scope"
  was not tested here (out of time budget); this is a generic property of
  the mechanism across any kernel-consuming project, not specific to hemma,
  and is worth a dedicated probe before scope is trusted as a hard security
  boundary rather than a hygiene check.

## Verdicts

- **hemma PR #456: APPROVE.** No production-runtime, build, dependency-tree
  or migration risk found and independently verified (not merely re-read
  from the exit report). The new workflow is read-only, cannot mask a
  failure, has minimal permissions, and its push arm was independently
  simulated here with the same not-applicable/exit-0 result the exit report
  claims. HZ-B-001 and HZ-B-004 are real but are kernel-level and do not
  change with or without this PR; they are conditions on the NEXT phases,
  not reasons to hold this bootstrap PR.
- **hemma-fleet PR #1: APPROVE**, with HZ-B-002 recorded as a fix-before-
  routine-use item (not a merge blocker; this repository has no production
  deploy surface and currently holds no untracked node_modules commit).

Status: COMPLETE.
