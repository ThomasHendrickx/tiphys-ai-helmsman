# CR-830: Clean-room criteria-contract review, PR #11 (M2-P1)

Branch: claude/m2-p1-gate-contract-and-runner
Head: ac3b2f6
Base: main at 037477e
Method: CRITERIA-CONTRACT review per T-007 (walks plan acceptance criteria as executable
contract; a separate concurrent hazard reviewer in m2p1-hazard attacks what no criterion
describes). Working tree isolated at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/m2p1-criteria
(git worktree, detached at ac3b2f6). Toolchain: Node 26.6.0 at
.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin, first on PATH, for the primary walk;
container default Node confirmed separately via bash -lc for the floor-gate skip check.

STATUS: IN PROGRESS (this file updates incrementally; mtime is the beacon)

## Verdict

**APPROVE.**

16 of 16 acceptance criteria MET, all independently executed against own
fixtures and the actual `bin/tiphys.ts` CLI (or, for criterion 14, against
the real PR via the GitHub API). Zero not-met. Zero not-verifiable-here
(criterion 14(b) is CI-deferred, not not-verifiable, and the deferral was
checked and is honest). Nine mutations against the phase's own declared
hazard class, all reddened as claimed, all restored byte-identical. Gate
numbers reproduced exactly on both toolchains. Registry numbers reproduced
exactly by an independent script. Scope audit clean. Conventions clean.
Three deviations judged necessary and correctly scoped. One LOW finding
(CR-830-1), which does not block this phase and is forwarded as a note for
M2-P2/M2-P5's own M2-C-1 verification step. No unresolved high or medium
finding.

## Setup log

- git worktree add --detach at ac3b2f6, npm ci exit 0 (Node 26.6.0 / npm 11.18.0).
- npm run build (dist removed first) exit 0; git status --porcelain empty after build
  (only untracked REVIEW-OUT.md, this file, outside git scope).
- node --test --test-reporter=tap "test/**/*.test.ts" on Node 26 (dist present):
  exit 0, 180 tests, 180 pass, 0 fail, 0 skipped, 0 todo, duration_ms 97578.
  Matches the work history's reported 180/0/0. TAP captured at
  ../m2p1-criteria-n26-run1.tap.

Read in full: CLAUDE.md, kernel-plan-m2.md section 1 and full M2-P1 section
(lines 203-244), delivery/work-history/m2-p1.md, T-003, T-006, T-007.

Plan's M2-P1 acceptance criteria count: 16 (criteria 1-16, with sub-items on
several). This MATCHES what the implementer walked (16). No discrepancy in
count; not a finding.

## Criteria walk

All fixtures built independently of the implementer's test suite, under
/tmp/.../scratchpad/m2p1-fixtures/, driven against the actual `bin/tiphys.ts`
CLI (source entry) unless noted.

### Criterion 1
"npm ci, npm run build, npm test each exit 0; after the build git status
--porcelain is empty."
MET. See Setup log above: npm ci exit 0, npm run build exit 0 (dist removed
first), git status --porcelain empty (only the untracked REVIEW-OUT.md, this
review's own scratch file, which is outside the repo's tracked scope).

### Criterion 2
"Against a fixture manifest of four gates ... evidence contains exactly four
records with statuses green/red/not-applicable/error in that mapping;
summary.json reports declared 4 applicable 3 green 1 red 1 not-applicable 1
error 1 vacuous 0 with error equal to the number of error-status records; the
runner exits nonzero."
MET. Own fixture manifest (crit2-manifest.json), own gate.mjs script (argv
controlled, not env, so the manifest fully determines behavior). Result:
`declared 4 applicable 3 green 1 red 1 not-applicable 1 error 1 vacuous 0`,
exit 21. Matches exactly.

### Criterion 3
"Against a manifest containing only the green gate, the runner exits 0 with
applicable 1, green 1, vacuous 0."
MET. `declared 1 applicable 1 green 1 ... vacuous 0`, exit 0.

### Criterion 4
"A fixture gate exiting 0 with units 0 is recorded error, counted in both
vacuous (1) and error (1), and the runner exits nonzero; with units 1 it is
green and the runner exits 0 (both directions)."
MET both directions. units=0: status=error, vacuous=true, exit 21. units=1:
status=green, vacuous=false, exit 0. This exercises the INGEST-side rewrite
(the fixture writes green/units-0 directly, bypassing makeGateResult), which
is the W1 shape.

### Criterion 5
"A required gate whose precondition is unmet is not-applicable and the
runner exits nonzero naming it; declared conditional, the runner exits 0
(both directions)."
MET both directions. required + unmet file-exists precondition: exit 20,
reason "required gate(s) not applicable: fx-required". conditional + same
unmet precondition: exit 0.

### Criterion 6
"A command-exit-zero precondition whose command does not exist yields error,
never not-applicable and never green."
MET. Own fixture naming a nonexistent binary: status error, detail names the
ENOENT, exit 21.

### Criterion 7
"A fixture gate that throws an uncaught exception (exit 1, no record) is
error, not red."
MET. Own crash fixture: gate exits 1 (Node's uncaught-exception exit code,
which collides with EXIT_RED), no record written by the gate itself; runner
records status error with detail "... exited 1 without writing a result
record at <path>", exit 21. Confirmed the record at that path afterward was
written by the RUNNER itself (run.ts's "the runner owns the record on disk"
behavior, line ~669), not by the gate; this is documented behavior, not a
concealed record.

### Criterion 8
"A manifest whose only gate declares precondition kind diff-touches, invoked
without --base, yields error for that gate and a nonzero runner exit; the
same invocation with --base yields the gate's real verdict (both directions)."
MET both directions. Without --base: error, detail "gate fx-difftouch
requires --base, which was not supplied", exit 21. With --base 037477e
--head HEAD (a real range that does touch src/gates/, since that is this
phase's own diff): precondition evaluates met, gate runs, green, exit 0.

### Criterion 9
"A manifest with zero gate entries, and separately a manifest whose every
gate is not-applicable, both make the runner exit nonzero with reason 'no
applicable gate'."
MET both directions. Zero gates: declared 0, reason "no applicable gate",
exit 21. Two conditional gates both with unmet file-exists preconditions:
declared 2, applicable 0, not-applicable 2, reason "no applicable gate",
exit 21.

### Criterion 10
Multi-part, all MET:
- Manifest missing `id`: `["INVALID #/gates/0/id required property id is
  missing"]` (via `validateManifestDocument` called directly, own fixture
  document).
- Result record with status outside enum: `["INVALID #/status value
  \"not-a-status\" is not one of the permitted values \"green\", \"red\",
  \"not-applicable\", \"error\""]`.
- Schema with a keyword outside the closed set (`oneOf`): `loadSchema`
  returns `{ok:false, reason:"fixture-schema: unsupported schema keyword
  oneOf at #"}`, a load error naming the keyword, never a silent pass.
- Determinism: a fixture schema with three simultaneous violation classes
  (missing required props, wrong type, additional-property), run 10
  consecutive times via `validateToLines`: byte-identical 5-line output in
  the same order all 10 times.
- `grep -n "INVALID" test/gates.test.ts` shows the tests assert the pointer,
  order and message text (e.g. lines 682-760), not any validator-internal
  wording.
- `npm pack --dry-run` and a real `npm pack` both list
  `dist/src/gates/schemas/gate-manifest.schema.json` and
  `dist/src/gates/schemas/gate-result.schema.json` in the tarball (own
  invocation, tarball removed after inspection, no state left behind).
- Criterion-3's fixture re-run through `dist/bin/tiphys.js`: summary.json
  identical to the source-entry run once volatile fields (timestamps, evidence
  paths) are stripped.

### Criterion 11
"takePin over a fixture root, then a byte-identical rewrite of one file
(content hash unchanged, mtime changed), then a second pin: comparePins
reports exactly one difference naming the path and the mtimeMs field; with no
rewrite it reports none (both directions)."
MET both directions. Own fixture root, own script calling takePin/comparePins
directly, forced mtime bump with `utimesSync` to guarantee the mtime tick
registers regardless of filesystem timestamp resolution. Rewrite case: exactly
one difference, `{kind:"changed", fields:["mtimeMs"]}`. No-rewrite case: `[]`.

### Criterion 12
"tiphys gates run with an unknown flag exits 64 with usage on stderr."
MET, and checked more than the letter of the criterion: unknown flag on
`gates run` (exit 64), on `gates self-check` (exit 64), and a bare unknown
`gates` subcommand (exit 64), all confirmed usage text lands on stderr with
stdout empty (separate fd capture).

### Criterion 13
"Structural: grep over src/gates/ shows no detached: true, no unref, no
process.kill, no /proc, no pid usage (C-2, C-3)."
MET. Own greps for `detached`, `unref`, `process\.kill`, `/proc`, and
`\.pid\b|process\.pid` over src/gates/ and src/commands/gates.ts. The only
hits for `detached`, `unref` and `/proc` are inside one doc comment in run.ts
describing their ABSENCE; `process.kill` and pid usage have zero hits.
Confirmed separately that `spawnSync` (not `spawn`) is the only child-process
API used, and no `detached: true` or `.unref()` call-site exists anywhere.

### Criterion 14
"(a) the check-run list on the phase PR contains exactly the contexts it
contained before this phase, test (26) and gates, evidenced from the
check-runs API; (b) the ruleset's required contexts are unchanged, evidenced
by gh api repos/.../rulesets, or marked CI-deferred (gh absent)."
(a) MET, verified independently via the GitHub API (`pull_request_read
get_check_runs` on PR #11, ThomasHendrickx/tiphys-ai-helmsman): exactly two
check runs, `gates` (conclusion success) and `test (26)` (conclusion
success), nothing else. Also pulled the `test (26)` job log directly and
confirmed the "M2 gate bundle (pull request)" step actually EXECUTED (not
skipped): it printed `gates: declared 1 applicable 1 green 1 red 0
not-applicable 0 error 0 vacuous 0` / `gates: every applicable gate is
green`, invoked as `node dist/bin/tiphys.js gates run --manifest
gates.manifest.json --evidence ... --base 037477ea... --head
1d66ab24...`. This is stronger evidence than the criterion strictly asks for
(it asks for the check-run list; I additionally confirmed the step inside it
ran for real), and it independently satisfies the "also check against PR
#11's actual gates check" instruction.
(b) CI-DEFERRED, and the deferral is HONEST, checked mechanically: `command -v
gh` in this review's own environment: `gh ABSENT` (same as the implementer's
finding). Grepped `.github/workflows/gates.yml` for any `gh api` invocation
of the rulesets endpoint: none exists anywhere in the workflow, so criterion
14(b) is not silently discharged elsewhere and then hidden; it genuinely is
not checked by anything today, which is what "CI-deferred" claims and no
more. This matches CLAUDE.md warning 6 verbatim (gh absent locally; even
where installable, `gh auth status` and `permissions.push` are not an
authority for this repository's ruleset in this container). Not a false
witness: nothing in this repository's CI attempts and skips this check; it is
consistently unattempted, and the work history says exactly that rather than
claiming a check ran clean.

One OBSERVATION (not a finding against this phase, forwarded as a note for
M2-P2/M2-P5): the job log shows `--head` was passed as
`1d66ab2406466ffca85d21b76e5f77f1b3229f5f`, GitHub Actions' synthetic PR
merge-commit SHA for the `pull_request` event's `github.sha`, not the PR
branch head `ac3b2f6f...`. This is standard `pull_request`-trigger behavior
(actions/checkout's default ref), harmless to THIS phase because
`manifest-self-check` has no precondition consuming `--base`/`--head`. It
becomes relevant the moment a `diff-touches` gate registers (M2-P2, M2-P5):
the diff will be computed against a merge commit, not the literal head
commit, which is a different thing from the shallow-checkout/fetch-depth
issue the work history already flagged in its "Open questions" section 1.
Recorded here so it is not lost between phases; it is not this phase's
defect because this phase consumes neither parameter.

### Criterion 15
"node --test exits 0 with 0 failing and zero unaccounted tests; the behavior
registry criterion of section 1.4 holds."
MET, verified with an INDEPENDENT script (not the implementer's
check-registry script), parsing my own captured TAP output
(m2p1-criteria-n26-run1.tap) and comparing against test/behaviors.json:
- 180 distinct top-level test titles in the run, 180 pass, 0 fail (per the
  gate-numbers section above).
- 186 registered behaviors, 0 unresolved (every description matches some
  test title), 0 test titles with no registered behavior.
- Base (037477e) had 162 behaviors; head has 186; 24 added, 0 removed,
  0 retitled (same key, different description), computed by set arithmetic
  over the two JSON files, not by hand.
This independently reproduces the work history's registry numbers exactly
(186 / 0 unresolved / 24 added / 162 base), by a different script than
theirs.

### Criterion 16
"With mkfifo used to place a named pipe at the manifest path, and separately
at a file-exists precondition target, and separately at the path a fixture
gate writes its record to, each run reports error naming the path and the
observed type and returns within the gate's bound ... With the same paths as
regular files, all three are the gate's real verdict (both directions, three
placements). A grep over src/gates/ shows no readFileSync, openSync,
appendFileSync or renameSync on an externally supplied path that does not
route through classifyEntry or refuseOpenForWrite."
MET, all three placements, both directions, own fixtures, own mkfifo:
- Placement 1 (manifest path itself is a FIFO): `timeout 15` wrapped, returned
  immediately (well under bound), status error, detail "... is a named pipe,
  not a regular file, so it was not opened", exit 21.
- Placement 2 (file-exists precondition target is a FIFO): same pattern,
  returned immediately, error naming the path and "named pipe", exit 21; with
  a regular file at that path, real verdict (green), exit 0.
- Placement 3 (the gate's own record path, pre-existing as a FIFO before the
  run starts): returned immediately, error naming the path and type plus
  "refusing to run gate fx-recordfifo", exit 21; with a stale regular file
  at that path beforehand (the normal case the runner's clear-and-rewrite
  logic exists for), real verdict (green), exit 0.
Own independent grep over src/gates/*.ts and src/commands/gates.ts for
`readFileSync|openSync|appendFileSync|renameSync|writeFileSync` reproduced
the SAME five call sites the work history's audit table lists (pin.ts:85,
run.ts:171, commands/gates.ts:140, plus the mutating rmSync/mkdirSync in
run.ts), and confirmed each sits immediately after its guard
(`classifyEntry` or `refuseOpenForWrite`) on the preceding lines. No
unguarded raw call site on an externally supplied path found.

## Mutation table (red-witness re-derivation, own execution)

All mutations applied by editing the tracked source file in place (`Edit` /
`sed`), running the named test alone via `--test-name-pattern` (preceding the
path per warning 7), then restored by `cp` from a pre-mutation backup and
confirmed byte-identical by `diff` (empty) and `md5sum` (equal) before
proceeding to the next mutation. No `git checkout --` used anywhere (warning
8). Final `git status --porcelain` after all mutations: only the untracked
REVIEW-OUT.md; full suite re-run green 180/180 at the end (see Setup log
addendum below).

| # | Behavior / witness shape | Mutation | Observed result | Byte-identical restore |
|---|---|---|---|---|
| 1 | W5b: `requiredParameters` emptied | `run.ts`: `requiredParameters` returns `[]` unconditionally | RED: `AssertionError ... actual: 0, expected: notStrictEqual 0` (exit code was 0, expected nonzero) | Confirmed, md5 `28b7abd0...` both sides |
| 2 | W5c: `requiredParameters` ignores the `entry.parameters` declaration (structurally different member: the OTHER half of the `Set` union) | `run.ts`: `Set<RunParameter>(entry.parameters ?? [])` to `Set<RunParameter>()` | RED, same assertion shape, different code path | Confirmed |
| 3 | W15b: the contract sort in `validate()` removed | `validate.ts`: delete the final `.sort(...)` in `validate()` | RED: `deepStrictEqual` failure, lines out of order | Confirmed, md5 `9025c48d...` |
| 4 | W15c: the merge sort in `validateManifestDocument` removed, `validate()`'s own sort left intact (structurally different member: a different producer's ordering) | `manifest.ts`: delete the final `.sort(...)` in `validateManifestDocument` | RED: `deepStrictEqual` failure, lines out of order (a different pair of lines than #3) | Confirmed, md5 `2f9ed835...` |
| 5 | W23b: unknown flags silently accepted, against the complete-invocation test | `commands/gates.ts`: unknown-flag branch in `parseFlags` now skips instead of returning `undefined` | RED: exit 0 instead of 64 on an otherwise-valid invocation plus one unknown flag | Confirmed, md5 `42392df3...` |
| 6 | Validator loud-failure property: unknown schema keyword | `validate.ts`: `checkSchemaNode`'s keyword loop short-circuits with an unconditional `continue` before the closed-set check | RED: `strictEqual` `true !== false` (load that should fail now succeeds) | Confirmed |
| 7 | SC-011 not-applicable/green distinction | `run.ts`: unmet-precondition branch changed from `status: "not-applicable", units: 0` to `status: "green", units: 1` (bypasses the M2-C-2 rewrite on purpose, to isolate this property from that one) | RED: `strictEqual` `0 !== 1` on the not-applicable count | Confirmed |
| 8 | Pin: a changed tree passes | `pin.ts`: `comparePins`'s `mtimeMs` comparison gated behind `false &&` | RED: `strictEqual` `0 !== 1` on the difference count (the byte-identical-rewrite case now reports no difference) | Confirmed, md5 `3500fcfb...` |
| 9 | M2-C-6: pre-spawn record-path probe AND stale-record clear both removed (the W12b/W13b shape, the load-bearing double-guard) | `run.ts`: `refuseOpenForWrite(recordPath)` check and the `rmSync(recordPath, {force:true})` clear both replaced with dead code | RED BY TIMEOUT: outer `timeout 60` fired at exit 124; the test runner itself reported "Interrupted while running" / "Promise resolution is still pending but the event loop has already resolved" after its own 45s internal timeout. This reproduces the work history's claimed hang exactly (their bound was 40s; mine was set slightly looser at 45s/60s so the outer wrapper would not race the inner one) | Confirmed, md5 `28b7abd0...` |
| 10 | Unsupported schema keyword load error (criterion 10, re-derived as a mutation rather than only a positive fixture) | Same as #6 (one mechanism, two entries in this table because it discharges both a mutation-table row and a criterion) | RED (see #6) | Confirmed |

Two additional witnesses from the work history's own table were NOT
re-derived by mutation here, for stated reasons rather than silently skipped:
W12 (probe removed alone, no hang, because the clear still deletes the FIFO)
and W1/W2 (the ingest-side and constructor-side M2-C-2 rewrites) were instead
exercised as ordinary fixture runs under criterion 4 above (units-0 gate
recorded error, both at the ingest boundary since my fixture bypasses the
constructor entirely). That is a DIRECT exercise of the same property W1
guards, not a mutation of the guard itself; I did not additionally mutate
`makeGateResult`'s own rewrite (W2's shape) to confirm it separately reddens.
**Scope of this gap, stated rather than left implicit:** the constructor-side
rewrite (W2) is exercised positively (criterion 4, units=1 branch, and every
green fixture gate throughout this review used `makeGateResult`-shaped
records) but its own removal was not independently mutated and reddened by
this review. Recorded as UNPROVEN-HERE rather than claimed covered.

## Deviations, judged

**D1 (`gates[].parameters` field).** Necessary, not merely convenient: the
plan's own step 7 requires the runner to know a gate needs `--phase` etc.
without pattern-matching the gate's command text, and `MECHANISMS.md`'s row
on that exact mechanism is cited. Verified present and load-bearing: the
field appears in `gate-manifest.schema.json` (`parameters`, enum
`base|head|phase`), is read by `requiredParameters` in `run.ts`, and
criterion 8's own diff-touches precondition test exercises the OTHER half of
the union (precondition-derived requirement) while criteria 5's mutation
table entries 1-2 exercise the declared half. Serves the plan's intent
directly.

**D2 (`GateResult.vacuous` field).** Necessary for the same class of reason:
once the M2-C-2 rewrite fires, a vacuous error and an ordinary error share
one status word, and step 8 requires the summary to count `vacuous` as a
strict subset of `error`. Verified present in `gate-result.schema.json` and
exercised directly by criterion 4 (units-0 case: `vacuous:true` in both the
per-gate row and the aggregate `counts.vacuous`). Serves the plan's intent.

**D3 (`manifest-self-check` as `tiphys gates self-check` inside
`src/commands/gates.ts`).** A placement convenience, not a scope expansion:
the file was already on the phase's files-to-touch list. The plan names the
gate and its job (validate every schema document and the manifest) without
naming a home for it; this is a defensible reading and does not touch a file
outside the declared set. Verified: `gates.manifest.json`'s sole gate
`manifest-self-check` has command `["node","bin/tiphys.ts","gates",
"self-check", ...]`, matching.

All three deviations are argued with a stated falsifier in the work history
(D1: "if a reviewer can show a way for the runner to derive the requirement
without reading either a declaration or the command text..."; D2: same
mechanism citation; D3: two plan readings recorded explicitly). None
expands scope, none contradicts a plan constraint, and all three are
mechanically verifiable in the shipped code rather than only argued in prose.

## Scope audit (own re-derivation)

`git diff --name-status 037477e HEAD`: 16 files, identical list to the work
history's. 14 are on the plan's M2-P1 files-to-touch list; `test/behaviors.json`
and `delivery/work-history/m2-p1.md` are the two CLAUDE.md standing
pre-authorized extras. Zero files outside scope. `package.json`'s edit is
under the plan's own stated condition ("edit only if step 5 requires a build
or files change") and step 5's own measurement (own re-run: `rm -rf dist &&
npm run build` before the copy step produced zero `.json` files under
`dist/`, confirming the condition's premise myself rather than trusting the
work history's claim of it). `dist/` is gitignored and absent from
`git ls-files`.

## Gate numbers (both toolchains, own execution)

Floor toolchain (Node 26.6.0 / npm 11.18.0), dist present:
`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty,
`node --test` exit 0, **180 pass / 0 fail / 0 skipped**.

Floor toolchain, `dist/` removed before the test run:
**177 pass / 0 fail / 3 skipped**, each of the 3 skips carrying the reason
"dist/ is absent; run npm run build first (CI builds before it tests)"
(the two dist-comparison tests plus the CI-bundle-step test).

Container default toolchain (Node 22.22.2 / npm 10.9.7, reached via
`bash -lc` so the login shell resolves it, per warning 1), dist present:
`npm ci` exit 0 (EBADENGINE warning present and expected), `npm run build`
exit 0, `git status --porcelain` empty, `node --test` exit 0,
**178 pass / 0 fail / 2 skipped**, both skips carrying the reason "local
Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node
26)" (the two PRE-EXISTING floor-gated doctor tests, not this phase's).

All three figures match the work history's reported numbers exactly (180/0/0,
177/0/3, 178/0/2), reproduced with my own invocations rather than trusted
from the document.

## Registry (own script, own execution)

Own script (not the implementer's `check-registry.mjs`) parsing my own
captured TAP output and diffing `test/behaviors.json` against
`git show 037477e:test/behaviors.json`:
- base 162 keys, head 186 keys, 24 added, 0 removed, 0 retitled (set
  arithmetic over the two JSON documents).
- 180 distinct top-level test titles in my own Node-26 TAP run.
- 0 unresolved behaviors (every description string matches some test title).
- 0 test titles with no registered behavior.
Matches the work history's reported figures exactly.

## Conventions

`grep -rP '[^\x00-\x7F]'` over `src/gates/`, `src/commands/gates.ts`,
`test/gates.test.ts`, `test/pin.test.ts`, `gates.manifest.json`,
`.github/workflows/gates.yml`, `package.json`, `delivery/work-history/m2-p1.md`:
no output (pure ASCII). Grep for the em dash byte sequence over the same set:
no output. `git log --format='%H%n%B%n---' 037477e..HEAD | grep -i
"claude|anthropic|gpt|copilot|ai-generated|co-authored"`: no output (commit
MESSAGES carry no AI/tool names, matching convention 7 literally). npm only:
`package.json` and `package-lock.json` only, no yarn/pnpm lockfile. English
only: confirmed by reading.

One note, not a convention violation because the convention names commit
MESSAGES specifically: PR #11's DESCRIPTION (fetched via the GitHub API, not
a commit message) ends with "Generated by Claude Code" plus a session link.
CLAUDE.md's convention 7 is scoped to commit messages, which are clean; the
PR body is a different artifact and outside that convention's literal text.
Recorded here rather than silently noticed, since a future tightening of the
convention to cover PR descriptions would need to know this exists.

## Findings, CR-830

### CR-830-1 (LOW): `--head` on the PR gate-bundle step is the synthetic merge-commit SHA, not the branch head

**Claim:** the "M2 gate bundle (pull request)" step in `.github/workflows/gates.yml`
passes `--head "${{ github.sha }}"`. On a `pull_request` trigger, GitHub sets
`github.sha` to the ephemeral merge commit the runner checked out, not the PR
branch's actual head commit (`ac3b2f6f...`).

**Evidence:** the job log for check-run 92544257530 (test (26)) on PR #11
shows the actual invocation: `node dist/bin/tiphys.js gates run --manifest
gates.manifest.json --evidence "..." --base "037477ea1a813da4df8ae3b93b9db47e98199a2e"
--head "1d66ab2406466ffca85d21b76e5f77f1b3229f5f"`, while
`pull_request_read get` on the same PR reports the branch head as
`ac3b2f6f34fa96662e76dd3f2d0d46118ec980d4`, a different SHA. This is standard,
well-documented `pull_request`-trigger behavior (`actions/checkout`'s default
ref for that event), not a bug this phase introduced.

**Why LOW and not higher:** this phase's only registered gate
(`manifest-self-check`) declares no `parameters` and no precondition
consuming `--base`/`--head`, so nothing in M2-P1 itself is affected; the
value is threaded through and recorded in `summary.json.parameters` but nothing
reads it. It becomes live the moment a `diff-touches` gate registers
(M2-P2's `red-witness`, M2-P5's `citations`), where the diff will be computed
against a merge commit rather than the literal head commit, which is a
related but DIFFERENT concern from the shallow-checkout/`fetch-depth` issue
the work history already flagged in its own "Open questions" section
(item 1). That existing note covers "the diff command will fail without
history"; it does not cover "the diff command will succeed but against the
wrong right-hand side."

**Concrete fix:** when M2-P2 or M2-P5 lands, pass
`--head "${{ github.event.pull_request.head.sha }}"` instead of
`"${{ github.sha }}"` in the pull_request branch of the gate-bundle step (the
push branch is unaffected, since `github.sha` on a push IS the real commit).
Not a required fix for THIS PR, since no gate in it consumes the parameter,
but worth carrying into M2-P2/M2-P5's own M2-C-1 verification step so it is
not rediscovered the hard way.

No other findings. No high or medium findings against this phase's
implementation, its tests, its scope, or its conventions.

## Honest-failure section (what did NOT get done, stated with scope)

- I did not independently re-derive W2 (the constructor-side M2-C-2 rewrite)
  by mutation; I exercised the same property positively through fixtures
  instead (see the Mutation table's closing note). If a reviewer wants that
  specific guard mutated and reddened, it is not done here.
- I did not attempt to reproduce the `branch-matches`, `file-absent`, or
  `modes` precondition kinds' behavior at all: the work history states they
  are UNWITNESSED by this phase's own tests (M2-P4 and M2-P6 are their
  consumers), and I did not add coverage the phase itself does not claim.
  Not this phase's gap to close.
- I did not attempt `--only` filtering, which the work history also marks
  UNWITNESSED. Same disposition.
- I did not attempt concurrent runs against one evidence directory (the work
  history's own "NOT ATTACKED" item). Out of scope for a criteria-contract
  walk of a phase whose plan does not ask for concurrency handling.
- I did not install or attempt to make `gh` authoritative for criterion
  14(b); I confirmed its absence and confirmed nothing in the CI workflow
  attempts the ruleset check either, which is what makes the deferral honest,
  but I did not go further and try the release-tarball `gh` install CLAUDE.md
  describes, since warning 6 already states its measured result (GraphQL
  refused, `permissions.push` false) and re-deriving an already-recorded
  environment fact was not a good use of this review's time.
- I did not test filesystems with coarser mtime resolution than this
  container's (the work history's own stated UNPROVEN item for the pin); I
  have no such filesystem available here either.
- I did not audit the `git` subprocess's own file-access behavior for
  M2-C-6 compliance (the work history explicitly scopes this out, and I did
  not have reason to disagree: `git` is a trusted, already-audited binary
  this kernel depends on elsewhere, not new surface this phase introduces).

## What this contract cannot see (T-007)

This review walked the plan's 16 acceptance criteria as an executable
contract and additionally ran 9 independent mutations against the phase's
declared hazard class. That is still a CRITERIA-SHAPED activity: every probe
above started from a criterion or from a named witness in the work history's
own red-witness table, which is the same corpus the implementer had. A
concurrent hazard reviewer (m2p1-hazard, not read by me, per the isolation
rule) is the one instructed to start from a hazard question rather than from
this list. Things a criteria walk structurally cannot promise, even when
every named check passes:

- **Unknown unknowns in the spine's own arithmetic.** The hazard class this
  phase declares is "a defect here is invisible in every gate downstream."
  I confirmed several NAMED ways the runner could lie (double-counting,
  vacuous-green, unmet-precondition-as-green, a stale pin) each redden their
  named guard. I did not go looking for an UNNAMED way to make the runner lie
  that neither the plan, the work history, nor I thought to name. T-007's
  whole point is that this is exactly the gap a criteria walk cannot close by
  being more thorough within its own list.
- **Interaction effects across gates that do not exist yet.** M2-P1 ships one
  gate. Every property here was checked against fixtures with 1-4 gates in a
  manifest. Whether the counting and aggregation logic holds up under the
  full nine-phase, ten-gate manifest M2-P9 will eventually run is not, and
  cannot yet be, tested here.
- **Timing-sensitive races beyond the ones staged.** The mkfifo probes and
  the pin's mtime probe are deterministic once staged, but a probe-then-open
  race (the residual window `src/task.ts` itself documents as inherited and
  unclosed) is a TOCTOU class that no fixture in this review, or in the
  implementer's own campaign, attempts to force. Both records say so rather
  than claiming otherwise.
- **Whether the manifest and record schemas will actually compose cleanly
  with M3's Ajv swap.** The diagnostic-contract tests assert the CURRENT
  engine's output against a fixed string contract, which is the right thing
  to test now, but no execution here or in the work history exercises Ajv
  itself, because DR-0013's swap is M3's work. This is a criterion this
  phase could not have and does not claim.

## Probes run, including empty-handed ones

- Searched `.github/workflows/gates.yml` for any `gh api ... rulesets`
  invocation: none found (empty-handed; this is what makes the criterion
  14(b) deferral honest rather than silently discharged elsewhere).
- Searched for `git checkout --` anywhere in this review's own commands:
  none used; all mutation restores used `cp` from a pre-mutation backup.
- Attempted to find a second, unguarded raw `fs` call site in `src/gates/`
  beyond the five the work history lists: none found (empty-handed).
- Attempted to find AI/tool names in commit messages: none found
  (empty-handed), though the PR description carries one (see the Conventions
  section note).
- Checked whether `package-lock.json` or any yarn/pnpm artifact exists:
  confirmed npm-only, no other lockfile.





