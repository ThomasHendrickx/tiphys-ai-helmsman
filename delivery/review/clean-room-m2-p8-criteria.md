# Clean-room review: M2-P8 credential scoping

- Date: 2026-08-06
- Branch: claude/m2-p8-credential-scoping
- Head reviewed: af56782fbb50d8e56788f2f927277177f26aeb7a (fetched and checked out
  detached at this exact SHA; verified with `git log -1 --oneline`)
- Method: fresh clean-room agent, no exposure to the implementation session.
  Executed criteria myself in a detached scratch worktree, including two
  independent mutation tests with sha256 pre/post verification, one full
  independent run of the M1 exit-test harness in local mode to completion,
  and a merge-base comparison run of the full suite to settle the flake
  question.

## VERDICT: APPROVE

No high or medium findings. Three low/informational notes, none blocking.

## Environment

- Default toolchain: node v22.22.2 (container default).
- Floor toolchain used for all gated runs: node v26.6.0, npm 11.18.0, prefetched
  at `/tmp/.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin`, placed first on
  PATH per CLAUDE.md warning 1.
- `gh` absent from this environment (warning 6); all credential-gate tests use
  a deterministic gh-free PATH by construction (verified by reading the test
  file's `ghFreeBinDir` helper).
- Host is heavily shared: `uptime` showed load average 25-31 throughout this
  review, with ~25 concurrent `node --test` / `npm test` processes visible in
  `ps aux`, corroborating the implementer's own host-load flake claim
  independently (this review did not take that claim on faith; see the suite
  section below).

## Gate numbers

- `npm ci`: exit 0 (floor toolchain, no EBADENGINE line).
- `npm run build`: exit 0; `git status --porcelain` empty afterward.
- Full suite at HEAD (floor toolchain): 211 tests, 207 pass, 4 fail, 0
  skipped, 0 cancelled. All 4 failures are in `test/watcher.test.ts` (3) and
  `test/liveness.test.ts` (1), files this phase does not touch.
- Full suite at merge base 4c9bfbc, same floor toolchain, same host, run from
  a separate scratch worktree I created for this comparison: 203 tests, 200
  pass, 3 fail, 0 skipped. The 3 failures are the SAME test titles in the
  SAME two files: "doctor and the guard return one verdict about one
  beacon", "a resident watcher keeps running and backs off with growing
  beacon gaps", "the heartbeat schedule is on disk and shared by single
  passes". This independently confirms the implementer's claim that this is
  a pre-existing, host-load-caused flake class in liveness/watcher code this
  phase does not own, not a regression introduced by M2-P8. My own run
  surfaced one additional flaky title from the same class/files
  ("a resident watcher is silent on heartbeats unless bounded") that the
  implementer's runs did not hit, which is expected variance under a
  non-deterministic timing flake and does not change the disposition: same
  files, same mechanism (beacon/cadence timing under load), zero overlap
  with this phase's diff.
- `test/credentials-gate.test.ts` in isolation: 10 tests, 10 pass, 0 fail.
- `test/exit-test-local.test.ts` in isolation: 10 tests, 10 pass, 0 fail
  (confirms the local-mode shape is unchanged after moving PR creation out
  of the payload).
- `manifest-self-check reports one unit per schema document` (test/gates.test.ts):
  pass. This branch adds NO schema document (`git diff origin/main...HEAD
  --name-only | grep -i schema` returns nothing), so the schema-count gate's
  behavior is unaffected by this phase regardless of which manifest.ts
  revision (pre- or post-e1390f3) the branch carries; verified directly by
  running the test rather than assuming it.
- M1 exit-test harness, `--mode local`, floor toolchain: first attempt failed
  at step A1 (the harness's own internal `npm test` gate) on the identical
  host-load flake described above; second attempt on the same head
  completed with **exit 0**, full stage-by-stage evidence bundle at
  `.../cr-m1-exit-evidence-2`, including:
  - `028-A6.json`: `tiphys spawn` invoked through the compiled
    `dist/bin/tiphys.js`, exit code 0.
  - `029-A6.json` / `payload-report.txt`: "payload branch task/m1-exit",
    "payload commit 2783ddf14ecf53f479a4f8bec567e4756b5ec3ba", "payload
    pushed file:///tmp/tiphys-m1-exit-amy9q8/toy-sandbox.git task/m1-exit".
    No "payload pr" line, confirming local mode's shape is unchanged.
  - Every later stage (A7, A8, B1, C1-C3) ok, harness exits 0.

## Criteria walk (re-executed, not read-only)

1. **Scrubbed dump, redirected pointers, both directions.** Verified by
   running `test/credentials-gate.test.ts` and by reading `src/spawn.ts`
   lines around the two `spawnSync` call sites: `request.env` spread
   conditionally so `undefined` means Node's native full-inheritance form
   (no `env` key at all), never an accidentally-empty object. `--allow-pr-
   credentials` exists as `SpawnOptions.allowPrCredentials`, defaulting to
   `false`/unset (scrub on). Met.
2. **Allowlist not denylist, both directions.** `src/exec/env.ts`
   `DEFAULT_CHILD_ENV_ALLOWLIST` is exact-name only, no prefix matching (the
   module comment explicitly rejects a `TIPHYS_*` prefix rule for exactly
   the reason criterion 2 tests). Test passes. Met.
3. **Capability check with its own staged dangerous state.** Independently
   mutation-tested (see below): with the redirection intact, `credential-
   scrub` is green with `units === CREDENTIAL_SOURCES.length` (6) against a
   parent environment carrying a token-shaped `hosts.yml` under a fake HOME,
   a credential helper in a fake global git config, and a live `GH_TOKEN`.
   Removing the redirection reddens the gate naming the resolvable source.
   Met, both directions, self-verified.
4. **Turn-end hook child witnessed separately.** `src/spawn.ts`'s two
   `spawnSync` call sites (payload, then hook) each apply `request.env`
   independently; the test drives `subprocessAdapter.launch` directly and
   dumps the hook child's environment in both the scrubbed and
   `env: undefined` (inherit) directions. Met.
5. **No regression, end to end.** Personally re-run to a clean exit 0 (see
   Gate numbers above), not merely re-read from the implementer's transcript.
   Met.
6. **`credential-token` not-applicable naming A-3.** Verified: absent-token
   run exits 20, record status `not-applicable`, detail matches both `/A-3/`
   and `/TIPHYS_IMPLEMENTER_TOKEN/`. Met.
7. **Live-token witness, owner-blocked.** Verified this is CI-deferred
   honestly rather than silently green: with `TIPHYS_IMPLEMENTER_TOKEN`
   present, the gate exits 21 (`error`), never 0 or 20, with a detail naming
   A-3 and "captured" (i.e. it fails closed rather than inventing a green).
   The capture procedure for the eventual live witness is written into both
   the module comment and the work history. Met as CI-deferred with a
   reason, not a quiet pass.
8. **Suite and registry.** 211 tests at HEAD on the floor toolchain (pre-
   existing 4-test flake investigated and attributed above); all 10 new
   registry keys mechanically confirmed to resolve to real test titles in
   `test/credentials-gate.test.ts` (checked programmatically, not by eye).
   Met.

## Mutation testing (performed by this review, not taken from the work history)

Two structurally different guards, each defanged on a copy of the real
module, confirmed red, then restored and confirmed byte-identical by
sha256.

| Guard | File | Mutation | Result | sha256 restore |
|---|---|---|---|---|
| 1 | src/exec/env.ts | `buildChildEnv`'s redirect loop changed to copy the PARENT's pointer value through instead of the harness-owned target (drop-the-redirection shape) | `credential-scrub is green with units equal to sources probed...` -> FAIL (`1 !== 0`, i.e. a resolvable source now exists); `spawn scrubs the payload child environment...` -> FAIL (`HOME` dump shows `/root` instead of the redirected path) | `912f3b60...` before and after, identical |
| 2 | src/gates/credentials.ts | The gh-token-vocabulary tripwire (`tokens = names.filter(...)`) hard-coded to always empty, removing the one check that catches a widened-allowlist token | `credential-scrub probes report resolvable sources when the redirection is absent` -> FAIL (member 3's token probe reports `clean` instead of `resolvable`) | `985ae55f...` before and after, identical |

Both mutations reddened a different named test in a different module,
satisfying the "two structurally different members" bar independently of
the implementer's own red-witness table.

## Scope audit

Three-dot diff against the TRUE merge base (`git merge-base HEAD
origin/main` = `4c9bfbc`, confirmed by `git diff origin/main...HEAD
--name-only`):

```
delivery/work-history/m2-p8.md
gates.manifest.json
scripts/m1-exit-test.sh
scripts/stub-payload.sh
src/exec/env.ts
src/gates/credentials.ts
src/spawn.ts
test/behaviors.json
test/credentials-gate.test.ts
```

This is an exact match to `delivery/plan/phase-declarations/m2-p8.json`'s
`filesToTouch` (`src/exec/env.ts`, `src/gates/credentials.ts`,
`test/credentials-gate.test.ts`, `src/spawn.ts`, `src/hooks.ts`,
`scripts/stub-payload.sh`, `scripts/m1-exit-test.sh`, `gates.manifest.json`,
`test/behaviors.json`) minus the one file legitimately left untouched
(`src/hooks.ts`, see below), plus the one standing pre-authorized extra
(the phase work history). No file outside this set. **Scope audit: PASS.**

**A two-dot diff (`origin/main..HEAD`) shows a wider file list** (adds
`.github/workflows/gates.yml`, `delivery/work-history/m2-p1.md`,
`src/gates/manifest.ts`, `test/gates.test.ts`, and makes `test/behaviors.json`
appear to have two keys removed). This is NOT scope creep by the M2-P8
implementer: `origin/main` (`e1390f3`) is one commit ahead of this branch's
own base (`4c9bfbc`); that one commit is an unrelated M2-P1 fix round
("enumerate schema documents in self-check") merged to `main` after M2-P8
branched. The two "removed" `test/behaviors.json` keys
(`gate-self-check-schema-enumeration`,
`gate-bundle-steps-only-survives-parameterized-gate`) were added BY that
same M2-P1 commit and are simply not yet present on this still-based-on-
4c9bfbc branch; they are not deleted by any M2-P8 commit (confirmed: they
are absent from the merge-base blob too). This is exactly the append-only,
resolve-as-union-against-merge-base situation CLAUDE.md section on binding
conventions describes for concurrent M2 phases, and it is expected to
resolve when this branch is rebased onto `main` before merge (see low
finding CR-1350-L1 below).

## `src/hooks.ts` step-1 claim, verified directly

The work history claims the generated turn-end hook script reads no
environment, so `src/hooks.ts` needs no edit. Read the file directly:
`renderTurnEndHook` (lines 38-58) bakes the turn-end path in as a
`JSON.stringify` literal and the generated script body imports only
`node:fs`'s `writeFileSync`, reading `process.argv[2]` and nothing else.
No `process.env` access anywhere in the file. **Claim verified true.**

## Registry audit

- `gates.manifest.json`: two new entries appended (`credential-scrub`,
  `credential-token`), zero existing entries modified or removed relative
  to the merge base. Both validate against
  `src/gates/schemas/gate-manifest.schema.json`'s closed keyword set
  (`command-exit-zero` is in the schema's precondition-kind enum; there is
  no `env` kind, confirming the work history's reason for using a command
  precondition rather than an environment check).
- `test/behaviors.json`: 10 new keys appended relative to the merge base
  (4c9bfbc), 0 removed, 0 modified (verified with a length/diff check
  against the merge-base blob, not the moving `origin/main` tip). All 10
  resolve by exact string match to a `test(...)` title in
  `test/credentials-gate.test.ts` (checked programmatically). **Registry
  audit: pure append, PASS.**

## Deviations judged

1. **`--allow-pr-credentials` as a `SpawnOptions` field, not a CLI flag.**
   Necessary, not merely convenient: `src/commands/spawn.ts` (the CLI flag
   parser) is not on this phase's files-to-touch list, confirmed absent
   from both the phase declaration and the actual diff, and confirmed to
   have no `allowPrCredentials`/`allow-pr-credentials` reference anywhere in
   its source. Exposing the escape hatch at the library boundary
   (`spawnTask`) is also where the M4-era adapter callers will sit per the
   plan's own step 9. No ripple missed: nothing in M2 consumes the flag, so
   there is no dangling half-wired feature.
2. **Scrub root is ephemeral on a completed launch, persists on
   incomplete.** Independently confirmed via path construction
   (`scrubRoot` joins `taskDir`; `worktreePath` joins `fleet.worktreesDir`,
   a disjoint root) that the removal can never touch the worktree. Necessary
   given the delivered task-directory-as-flat-record-set contract, and the
   asymmetry (kept on `incomplete` for operator inspection) is the safer
   direction.
3. **`credential-token`'s token-present arm is `error`, not the plan
   table's literal "green with owner action A-3".** Necessary under M2-C-3
   (fail closed) and T-003 lesson 4 (never derive an assertion from an
   uncaptured/invented response). Verified the gate genuinely fails closed
   (exit 21, not 20, not 0) and is not silently passing as not-applicable
   while a token is actually present. This is the single largest owner-
   blocked residue in the phase and it is handled honestly.
4. **A fourth red-class member (widened allowlist) added beyond the
   criterion's literal two directions.** Strengthens the suite; no
   downside. The work history's own account of discovering this gap during
   its first attempt (W6) is itself evidence the "one witness is not a
   class" rule is being applied for real here, not just cited.
5. **Gates as modules with main guards, not `tiphys` subcommands.** This is
   not actually a deviation: `kernel-plan-m2.md`'s M2-D-07 states verbatim
   "only M2-P1 edits `src/cli.ts`; each later phase adds its own module with
   a main guard and one manifest entry." Labeling this a "deviation" in the
   work history is over-cautious but harmless.

## Findings

No high or medium findings.

- **CR-1350-L1 (low, process).** This branch is one commit behind
  `origin/main` (missing `e1390f3`). Not a code defect and the true
  (merge-base) scope and registry diffs are clean, but the branch should be
  rebased onto current `main` before merge so the two-dot diff and the
  registry union resolve without a reviewer having to reconstruct the
  merge-base story by hand. Routine under DR-0004's "branch current with
  main" rule for phases developed concurrently with M2-P1 fix rounds; not a
  finding against the implementer's work.
- **CR-1350-L2 (low, cosmetic).** The work history's criterion-5 walk quotes
  `"local mode must not reach for gh at all"` as if it were a test title;
  it is actually an inline comment inside a differently-titled test
  (`test/exit-test-local.test.ts:1097`). The underlying assertion is real
  and passes; only the citation form is imprecise.
- **CR-1350-L3 (low, informational).** All nine of this branch's own commits
  carry the git author identity `Claude <noreply@anthropic.com>` rather
  than a human name. CLAUDE.md rule 7 concerns commit MESSAGE text (subject
  lines here are clean of any AI/tool name), and this identity is the
  standing environment default across every concurrent M2 phase branch in
  this fanout (confirmed against an M2-P4 commit as a control), not
  something this implementer chose. It also does not survive squash merge:
  `origin/main`'s actual commits show the owner's identity. No action
  needed unless the orchestrator wants to override the environment's git
  identity for future phase branches generally.

## Probes run (including empty-handed ones)

- Searched for `process.kill`, `/proc`, `signal-0`, `process.pid` in the two
  new modules: zero matches (C-2 compliant).
- Searched for `detached`, `unref`, `daemonize` in the two new modules plus
  `src/spawn.ts`: only a comment noting their absence (C-3 compliant,
  structural).
- Searched the credential probes for any `.includes`/`match`/regex applied
  to another program's stdout/stderr TEXT (as opposed to its exit code):
  exactly one `.includes`, and it is a membership test over names this
  module owns (`GH_TOKEN_VARIABLES`), not a parse of gh's or git's output.
  No message-text classification of another program's behavior.
- Grepped all touched/new authored files for non-ASCII bytes
  (`grep -rlP '[^\x00-\x7F]'`): zero hits.
- Checked whether `ExecutorRequest` or `SpawnOptions` (the two changed
  interfaces) have any consumer besides `src/spawn.ts` and the new test
  file: none found; no other adapter exists yet, so no downstream blast
  radius beyond this phase's own files today.
- Attempted to reproduce the M1 exit-test harness cleanly twice; first
  attempt failed at the harness's own internal suite gate (A1) on the host-
  load flake, second attempt succeeded end to end with a real evidence
  bundle (see Gate numbers). Did not stop at the first failure and report
  it as a phase defect without checking whether it was environmental.
- Did NOT re-derive the "every child-launch call site" grep independently
  beyond spot-checking `src/spawn.ts` and `src/gates/credentials.ts`
  directly; relied on reading the work history's captured command output
  for `pool.ts`, `doctor.ts`, `init.ts`, `teardown.ts` and confirming their
  disposition (orchestration-context launches, out of this phase's declared
  scope) is consistent with what those files' role is elsewhere in the
  plan. This is the one area of the review that is closer to "read and
  agreed" than "independently re-derived from scratch."

## Honest-failure section

- I could not get the M1 exit-test harness to pass on the first attempt on
  this shared host; it failed at its own A1 gate on the same pre-existing
  flake the implementer described. I do not read this as a finding because
  (a) the failing tests are in files this phase does not touch, (b) I
  reproduced the identical failure set at the merge base under the same
  host conditions in a separate scratch worktree, and (c) a second run of
  the harness on the SAME head, moments later, completed cleanly end to
  end. If a reader wants a single clean witness rather than this
  reasoning chain, rerun `scripts/m1-exit-test.sh --mode local` on a quieter
  host; I would not expect a different outcome.
- I did not attempt to force the token-present live-API arm (criterion 7)
  since no A-3 token exists in this environment either; I verified the
  fail-closed shape instead of the live green/red pair, which is exactly
  what the plan says is available before A-3 lands.
