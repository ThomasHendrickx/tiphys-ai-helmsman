# Work history: release-verify waits for the registry

Branch `claude/release-verify-waits-for-registry`, cut from `origin/main` at
`cb5de0d`. A defect fix outside any phase, so there is no phase declaration
and the branch name deliberately does not match `^claude/m[0-9]+-p[0-9]+-`.

## The defect, as measured by the orchestrator (2026-09-23)

Release run 35839356656 (workflow_dispatch, version 0.2.0, on `main` at
`cb5de0d`): `npm publish --access public --provenance` succeeded at 08:56:38Z
and printed "Your package is being processed and may take a few minutes to
become available." One second later the post-publish step ran
scripts/release-verify.sh in registry mode and reported `step install exited
1`, `step import exited 1`, `step bin-version exited 127`, `step copy-template
exited 1`, `step validate-template exited 127`, `5 failing step(s)`. The
`tag` job (`needs: release`) was skipped. The registry's `time["0.2.0"]` is
2026-09-23T09:01:47.626Z, about five minutes after the publish, and the same
command run by hand at 09:03Z exited 0.

## The mechanism

**A post-publish verification that treats "not yet served" the same as
"served and broken".** The registry arm of the script went straight to
`npm install <name>@<version>` with no notion that the registry needs time
to start serving a fresh publish, so the propagation delay surfaced as five
step failures that are indistinguishable, in the log, from a broken package.

The fix is to separate the two questions. Registry mode now first asks
"does the registry SERVE exactly this version" and waits, bounded, until the
answer is yes; only then are the unchanged steps run. A version that is never
served ends in a DISTINCT outcome (exit 75, `NOT SERVED`, no step run). A
version that is served and broken passes the wait on its first poll and fails
at its steps exactly as before.

## What was built

- (Round 0; these line numbers are at `319b55c` and are quoted, not cited, because fix round 1 moved them.) `scripts/release-verify.sh:341` `wait_for_registry`, called only when no
  `--tarball` was given (`scripts/release-verify.sh:409`). Each poll is
  `npm view <name>@<version> version --cache <fresh> --prefer-online`
  (`scripts/release-verify.sh:352`), and "served" is exit 0 AND stdout exactly
  equal to the version (`scripts/release-verify.sh:354`). Both halves are
  needed because the real not-served answer (captured below) is exit 1 with an
  EMPTY stdout, and a network failure is also a nonzero exit; neither is final,
  so both are polled again until the deadline.
- Bounds: default deadline 900s, poll interval 15s. Override by
  `--wait-seconds` / `--poll-seconds`, or by `RELEASE_VERIFY_WAIT_SECONDS` /
  `RELEASE_VERIFY_POLL_SECONDS`; a flag beats the environment. A malformed
  bound, or a poll interval of 0, is a usage error (exit 64). `--wait-seconds
  0` means poll exactly once.
- Why 900s: npm itself says "a few minutes", and the one measurement is about
  five (08:56:38Z publish, 09:01:47Z registry time, green by hand at 09:03Z).
  Fifteen minutes is three times the observation. The release job carries no
  `timeout-minutes`, so the GitHub default of 360 minutes applies and the wait
  cannot collide with it. Why 15s: about sixty polls at most, which is
  negligible load and at worst a fifteen-second delay after the version
  appears.
- Evidence: a `registry-served` record in the records file, written in both
  outcomes, carrying `exitCode` (0 or 75), `served`, `attempts`,
  `deadlineSeconds`, `pollSeconds`, `firstPollAt`, `lastPollAt`,
  `elapsedSeconds`, `lastNpmExitCode`, `lastStdout` and up to three
  `npm error` lines of the last poll's stderr.
- On timeout: stderr says `NOT SERVED. The registry did not serve <name>@<version>
  within N seconds (M poll(s), last npm view exit C).`, then that no step was
  run, and the script exits 75. None of the step lines and no `failing
  step(s)` line appear.
- Tarball mode does not wait and makes no registry request.
- .github/workflows/release.yml is NOT changed. It needed no change: the step
  invokes the script without `--tarball`, which is exactly the arm that now
  waits, and there is no step or job timeout for the wait to exceed. The
  exact-string assertions over that file in test/license-gate.test.ts are
  therefore untouched.

## The real captured npm output

witness/captures/release-verify-registry-not-served.txt, produced by a
scratch capture script on 2026-09-23 with node v26.6.0 and npm 11.18.0, fresh
cache per command. The two answers the stub replays:

```
=== npm view @tiphys/kernel@9.9.9 version --prefer-online (fresh cache)
exit=1
--- stdout:
--- stderr:
npm error code E404
npm error 404 No match found for version 9.9.9
...
=== npm install --prefix inst @tiphys/kernel@9.9.9 (fresh cache)
exit=1
--- stdout:
--- stderr:
npm error code ETARGET
npm error notarget No matching version found for @tiphys/kernel@9.9.9.
```

The same capture shows `npm view @tiphys/kernel@0.2.0 version` exit 0 printing
`0.2.0`, and a package that does not exist at all also exiting 1 with E404.
The `***` inside the debug-log paths in the capture is npm's own redaction of
the session id (checked with `od -c` on the raw file), not an edit. The capture
file's header says so.

## Tests (test/license-gate.test.ts)

A stub `npm` is written first on PATH by `registryStub`. It models the
registry as ONE request counter shared by `view` and `install`: the first K
requests of either kind get the not-served answer read from the capture file
(exit code and stderr), later ones are served. That shared counter is what
makes the first test red on the pre-fix script, whose first registry request
is the install. The stub's `install` writes a minimal package tree (manifest,
template, bin); `broken` mode writes one with no template and a bin that exits
1. The bounds are passed BY ENVIRONMENT in the four behaviour tests so the
pre-fix script (which rejects unknown flags with exit 64) reddens for the
defect and not for a usage error; that was measured, see "Red, first attempt".

1. `release-verify in registry mode waits until the registry serves the
   version, then verifies it` (K=2, wait 30, poll 1): exit 0, three polls,
   wait record before the install record, every step exit 0.
2. `release-verify in registry mode times out with NOT SERVED and exit 75 when
   the registry never serves the version` (never, wait 3, poll 1): exit 75,
   the NOT SERVED line naming 3 seconds, no step line, records exactly
   `clean-environment` then `registry-served`, at least two polls, the last
   npm exit equal to the capture's, E404 in `lastStderr`, no install call,
   under 30s wall time.
3. `release-verify in registry mode fails a served but broken version at its
   steps without waiting out the deadline` (served at once, broken, wait 20):
   exit 1, step lines for bin-version and copy-template, no NOT SERVED, one
   poll, under 15s.
4. `release-verify in tarball mode makes no registry poll` (registry never
   serves, wait 2): exit 0, zero `view` calls in the stub log, no
   `registry-served` record, install artifact `local-tarball`.
5. `release-verify's wait flags override the environment and a malformed bound
   is a usage error`: env 600s with `--wait-seconds 2` ends 75 "within 2
   seconds"; `--poll-seconds 0`, `--wait-seconds soon`, `--wait-seconds -5`
   each exit 64.

The two existing refusal tests now spawn with `RELEASE_VERIFY_WAIT_SECONDS=0`
(helper `refusalEnv`). They refuse before the wait, so at head this changes
nothing; it bounds a MUTATED run (the red-witness harness removes the refusal)
to one poll instead of up to 900s if the runner cannot reach the registry.

The comment at `test/license-gate.test.ts:2788` (round 0) cited the registry install at
the old line 299; it cited `scripts/release-verify.sh:421` at `319b55c`, and cites the moved line after fix round 1.

Behaviours registered in test/behaviors.json, by name:
`release-verify-waits-for-the-registry-to-serve-the-version`,
`release-verify-not-served-times-out-distinctly`,
`release-verify-served-but-broken-fails-at-its-steps`,
`release-verify-tarball-mode-makes-no-registry-poll`,
`release-verify-wait-flags-override-env-and-reject-malformed`.

## Witness specs

`scripts/` is not an audited source tree for the coverage obligation
(src/gates/red-witness.ts:164 lists only `src/`, `bin/`, `plugin/src/`), so
no witness is REQUIRED by coverage. Two are added anyway, because the
red-witness rule binds the tests, and because rule (f) applies to a changed
`*.sh` that spawns npm (src/gates/red-witness.ts:257), so both carry
`consumesExternalOutput` naming the capture.

- witness/release-verify-waits-for-the-registry-to-serve-the-version.json,
  classification, three members on three points of the pipeline: (0) the wait
  removed, which is the incident; (1) the wait present and giving up after one
  poll; (2) the wait present and misclassifying a served version as not
  served.
- witness/release-verify-tarball-mode-makes-no-registry-poll.json,
  classification, two members: (0) tarball mode runs the blocking wait; (1)
  the wait untouched and one non-blocking `npm view` added to the tarball
  install arm, visible only in the stub's call log.

The EXISTING witness witness/release-verify-refuses-contaminated-resolution-path.json
touches scripts/release-verify.sh, so the gate re-evaluates it as a stored
witness. Its three `find` strings are in lines this change did not edit; that
they still match exactly once is checked by the red-witness gate run below.

## Red, first attempt, and why it was discarded

The first version of the tests passed the bounds as flags. Against the pre-fix
script all four were red, and all four for the WRONG reason: `actual: 64`,
the pre-fix script's usage exit for an unknown option. That is red against an
absent flag, not against the dangerous state, so the bounds were moved to the
environment and the flags got their own test.

## Red against the pre-fix script (origin/main `cb5de0d`)

Method: with everything committed, a scratch script wrote
`git show origin/main:scripts/release-verify.sh` over the script, ran the four
behaviour tests, and restored from `HEAD` (tree clean afterwards, printed by
the script). Node v26.6.0.

TRANSLITERATION DECLARED: in the captures in this section, U+2716 is rendered
`x` (3 occurrences) and U+2714 `v` (1 occurrence), U+2139 is rendered `i` (4
occurrences). Nothing else was changed; lines were omitted, not edited, where
`...` appears.

```
node v26.6.0; script under test: origin/main:scripts/release-verify.sh (cb5de0d)
x release-verify in registry mode waits until the registry serves the version, then verifies it (3075.992224ms)
x release-verify in registry mode times out with NOT SERVED and exit 75 when the registry never serves the version (3473.401672ms)
x release-verify in registry mode fails a served but broken version at its steps without waiting out the deadline (2932.362664ms)
v release-verify in tarball mode makes no registry poll (3536.411654ms)
i tests 4
i pass 1
i fail 3
i skipped 0
...
  AssertionError [ERR_ASSERTION]: expected a green after the registry started serving; stderr:
  release-verify: step install exited 1
  release-verify: step import exited 1
  release-verify: step bin-version exited 127
  release-verify: step copy-template exited 1
  release-verify: step validate-template exited 127
  release-verify: 5 failing step(s); records in /tmp/tiphys-rv-wait-FKDCKu/records.json
```

Test 1's pre-fix failure reproduces the incident's five step failures with the
incident's exit codes (1, 1, 127, 1, 127). Test 2 fails `1 !== 75` with the
same five lines. Test 3 fails `no registry-served record`, which is red
against the ABSENT feature only, because pre-fix a served and broken version
already fails at its steps; its red against the dangerous state is member 2
below. Test 4 is GREEN pre-fix, as it must be (the pre-fix script polls
nothing); its red is the tarball witness's two members below.

## Red against each declared dangerous state

Method: scratch script applying each witness member's find/replace to the
script in the worktree, running that witness's named tests, restoring from
`HEAD` (tree clean afterwards). Node v26.6.0, head `c777611`. The script
itself printed `PASS`/`FAIL`/`i` in place of U+2714/U+2716/U+2139, so no
transliteration happened in this document; that substitution is in the
scratch script, declared here.

```
--- release-verify-waits-for-the-registry-to-serve-the-version member 0: exit 1
FAIL ... waits until the registry serves the version, then verifies it
FAIL ... times out with NOT SERVED and exit 75 when the registry never serves the version
FAIL ... fails a served but broken version at its steps without waiting out the deadline
i tests 3 / i pass 0 / i fail 3
--- member 1: exit 1
FAIL ... waits until the registry serves the version  (expected a green after the registry started serving)
FAIL ... times out with NOT SERVED ...                 (polled 1 time(s) in a 3s window at 1s)
PASS ... fails a served but broken version ...
i tests 3 / i pass 1 / i fail 2
--- member 2: exit 1
FAIL ... waits until the registry serves the version  (30813ms)
PASS ... times out with NOT SERVED ...
FAIL ... fails a served but broken version ...         (21060ms, expected a step failure)
i tests 3 / i pass 1 / i fail 2
--- release-verify-tarball-mode-makes-no-registry-poll member 0: exit 1
FAIL release-verify in tarball mode makes no registry poll (2634.387705ms)
--- member 1: exit 1
FAIL release-verify in tarball mode makes no registry poll  (tarball mode asked the registry)
restored, tree clean
```

That block is CONDENSED from the scratch script's output: test names are
shortened with `...`, the three `i` summary lines are joined with ` / `, and
the parenthesised assertion message is the first `AssertionError` line for
that test. The per-test verdicts and exit codes are as printed.

### Re-run at the final script (head `319b55c`), all three witnesses

After the record-field edit in `319b55c`, the same scratch script was run
again over ALL THREE witness specs that touch scripts/release-verify.sh,
including the pre-existing
witness/release-verify-refuses-contaminated-resolution-path.json. Every find
string matched exactly once (the script prints `find occurs N times` and
skips the member otherwise; no such line appeared). Result, one line per
member, same PASS/FAIL/i substitution as above:

| witness | member | named tests red | exit |
|---|---|---|---|
| refuses-contaminated-resolution-path | 0, 1, 2 | 1 of 1 each | 1 |
| waits-for-the-registry-to-serve-the-version | 0 | 3 of 3 | 1 |
| waits-for-the-registry-to-serve-the-version | 1 | 2 of 3 (served-but-broken stays green) | 1 |
| waits-for-the-registry-to-serve-the-version | 2 | 2 of 3 (never-served stays green) | 1 |
| tarball-mode-makes-no-registry-poll | 0, 1 | 1 of 1 each | 1 |

The script ended `restored, tree clean`.

**This is a HAND run, not the gate.** The `red-witness` gate is
not-applicable on this branch (its precondition needs a changed path under
`src/`, `bin/` or `plugin/`; see the bundle below), so no gate evaluated these
specs. They will be evaluated as STORED witnesses by the first later phase
whose diff touches scripts/release-verify.sh AND src/, bin/ or plugin/. The
harness's own `repeats: 2` and head-green control were not exercised here.

## Green

All on node v26.6.0, npm 11.18.0, in this worktree, `dist/` built.

- `npm ci` exit 0. `npm run build` exit 0 (after one type fix, `c777611`);
  `git status --porcelain` empty afterwards.
- `npm test` (the package script, `node --test "test/**/*.test.ts"`), at
  `319b55c`: **1399 tests, 1399 pass, 0 fail, 0 skipped**, 0 cancelled, 0
  todo, exit 0, duration 966s.
- The eight release-verify tests alone, same toolchain, dist built: 8 tests, 8
  pass, 0 fail, 0 skipped (the dist-gated clean-directory tarball test ran).
- Local PR bundle,
  `./scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase claude/release-verify-waits-for-registry <scratch>`,
  exit 0:

  ```
  gates: declared 15 applicable 7 verdict 7 green 7 red 0 not-applicable 8 error 0 vacuous 0
  gates: suite: green: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 1399 test(s) from 68 file(s) (pass 1399, fail 0, skipped 0, todo 0, did-not-run 0); discovered 68 file(s) walking test for .test.ts; 1274 behavior(s) resolve; merge base cb5de0d29061
  gates: citations: not-applicable: precondition citations-diff-touches-documents evaluated and unmet: no changed path under delivery/plan/, delivery/verification/, delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md
  gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch claude/release-verify-waits-for-registry does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
  gates: red-witness: not-applicable: precondition red-witness-diff evaluated and unmet: no changed path under src/, bin/, plugin/
  gates: required gate(s) not applicable: citations, scope, red-witness, gate-classes
  m2-assert (PR bundle): OK. 15 gate record(s) match section 1.4; ...
  m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.
  ```

  The seven green: manifest-self-check, coverage, credential-scrub, suite,
  clause-map, brief-drift, typecheck. Four REQUIRED gates are not applicable
  on this branch by their own preconditions (quoted above), so this bundle is
  NOT evidence that citations, scope, red-witness or gate-classes asserted
  anything about this change.
- `node scripts/check-authored-bytes.mjs` exit 0 (clean index, `319b55c`).
- Against the REAL registry, from an empty scratch directory, at 09:23Z:
  `release-verify.sh @tiphys/kernel 0.2.0` exit 0, `registry-served` record
  `attempts 1`, `elapsedSeconds 1`, `lastStdout "0.2.0"`; and
  `release-verify.sh @tiphys/kernel 9.9.9 --wait-seconds 20 --poll-seconds 5`
  exit 75, `NOT SERVED ... within 20 seconds (4 poll(s), last npm view exit 1)`,
  records exactly `clean-environment` and `registry-served` with
  `lastStderr ["npm error code E404","npm error 404 No match found for version 9.9.9","npm error 404"]`.

## Derivation: every place that reads the registry right after a publish

```
$ grep -rnE 'npm (view|info|show|v |install|i |publish|dist-tag)|registry\.npmjs|packument|release-verify\.sh' scripts .github src
scripts/license-gate.mjs:147: *   - an OPTIONAL dependency, which `npm install` and `npm ci --omit=dev` both
scripts/license-gate.mjs:181: * `npm install` first, and the gate says so.
scripts/license-gate.mjs:453:      `LICENSE-INVENTORY ${taken.lockMissing} does not exist, so npm has not recorded what it installed and the production set cannot be READ; run npm ci or npm install before this gate. There is deliberately no fallback to walking the manifest: that walk is what missed an optional dependency and a version-conflict nesting`,
scripts/release-verify.sh:59:usage: scripts/release-verify.sh <name> <version> [--tarball <path>]
scripts/release-verify.sh:317:# 35839356656: `npm publish` printed "Your package is being processed and may
scripts/release-verify.sh:319:# `npm install` could not resolve the version, and all five steps failed. The
scripts/release-verify.sh:323:# WHAT "SERVED" MEANS HERE: `npm view <name>@<version> version`, with a fresh
scripts/release-verify.sh:352:    observed="$(npm view "$NAME@$VERSION" version --cache "$wait_cache" --prefer-online 2>"$err_file")" || code=$?
scripts/release-verify.sh:362:    echo "release-verify: $NAME@$VERSION not served yet (poll $attempts, npm view exited $code); polling again in ${POLL_SECONDS}s" >&2
scripts/release-verify.sh:381:      command: "npm view " + name + "@" + version + " version --prefer-online (fresh cache per poll)",
scripts/release-verify.sh:401:    echo "release-verify: NOT SERVED. The registry did not serve $NAME@$VERSION within $WAIT_SECONDS seconds ($attempts poll(s), last npm view exit $code)." >&2
scripts/release-verify.sh:418:  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
scripts/release-verify.sh:421:  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
.github/workflows/release.yml:144:          registry-url: https://registry.npmjs.org
.github/workflows/release.yml:149:      # later "which npm published this" answerable.
.github/workflows/release.yml:152:          npm install -g npm@11.18.0
.github/workflows/release.yml:263:      # `cd "$RUNNER_TEMP/verify"` is not tidiness: scripts/release-verify.sh
.github/workflows/release.yml:276:          bash "$GITHUB_WORKSPACE/scripts/release-verify.sh" "$name" "$REQUESTED" \
.github/workflows/release.yml:286:        run: npm publish --access public --provenance
.github/workflows/release.yml:291:          echo "release: this dispatch was a rehearsal. Every gate ran, the artifact was packed, installed and executed, and npm publish did NOT run."
.github/workflows/release.yml:320:          bash "$GITHUB_WORKSPACE/scripts/release-verify.sh" "$name" "$REQUESTED" \
src/commands/init.ts:150:     between two `npm install` runs, which is the opposite of what the pin is
grep exit=0
```

(Run on the final working tree of this branch, so the release-verify.sh hits include the new code. Full lines, nothing truncated.)

Reading of every hit:

- scripts/license-gate.mjs:147, :181, :453 and src/commands/init.ts:150 are
  comments or messages about local installs; none contacts the registry after
  a publish.
- .github/workflows/release.yml:152 installs npm itself, BEFORE any publish.
- .github/workflows/release.yml:276 is the PRE-publish run, `--tarball`, which
  asks the registry nothing and must not wait.
- .github/workflows/release.yml:286 is the publish.
- .github/workflows/release.yml:320 is the post-publish run, the incident's
  step. It reaches the registry only through scripts/release-verify.sh, whose
  registry reads are the new poll (:352) and the install (:421), and the
  install now runs only after the poll has seen the version.
- A second grep for the tag job's commands (`curl|npm |gh release|gh api` over
  release.yml) found only `git tag`, `gh release create` and comments below
  line 324: the tag job reads GitHub, not the npm registry.

So there is exactly one post-publish registry reader in this repository, and
it is the one fixed.

## What the derivation did NOT cover

- Only `scripts/`, `.github/` and `src/`. Not `bin/`, `plugin/`, `test/`,
  `roles/`, `templates/`, or any consumer project. `bin/` holds the CLI entry,
  which has no publish path; not grepped, so stated rather than asserted.
- Registry reads spelled other ways: `fetch(` or `https.get` to a packument
  URL, `npx <pkg>@<version>`, `npm exec`, `npm pack <name>@<version>`,
  `pnpm`/`yarn`. The pattern would not see those. `registry.npmjs` and
  `packument` were included to catch URL-based reads; a read against a
  different registry host would still be missed.
- It does not establish that "served by `npm view`" implies "installable".
  `npm view` reads the packument; `npm install` also fetches the tarball. If
  the packument can list a version before its tarball is fetchable, the wait
  would pass and the install step would fail as a step failure. I did not
  find a way to observe a propagation window from here, so this is an open
  question, not a settled one. The incident's evidence (registry `time` field
  about five minutes after publish, and a green install two minutes after
  that) is consistent with the packument being the thing that lagged.
- The capture is of a version that is NEVER served (9.9.9), not of a version
  during its real propagation window. That a propagating version answers with
  the same E404 shape is inferred, not captured.
- The macOS smoke job and the release workflow itself were not run; the
  release workflow only runs on dispatch.

## Claim grep

Line-based form (the binding command), run on this file before the final
section was added:

```
30:answer is yes; only then are the unchanged steps run. A version that is never
118:   the registry never serves the version` (never, wait 3, poll 1): exit 75,
127:4. `release-verify in tarball mode makes no registry poll` (registry never
154:no witness is REQUIRED by coverage. Two are added anyway, because the
197:x release-verify in registry mode times out with NOT SERVED and exit 75 when the registry never serves the version (3473.401672ms)
234:FAIL ... times out with NOT SERVED and exit 75 when the registry never serves the version
269:scripts/license-gate.mjs:453: ... the production set cannot be READ; ...
332:- The capture is of a version that is NEVER served (9.9.9), not of a version
```

(Line 269 shortened here with `...`; it is the pasted derivation output.)
Wrap-insensitive form: `never` 6, `NEVER` 1, `anyway` 1, `cannot be` 1, which
is 9, the same 9 occurrences the line-based form shows. Zero missed by wrap.

Each hit settled:

- `never` / `NEVER` (30, 118, 127, 197, 234, 332): every one names a test
  scenario (the stub's `"never"` mode, which answers not-served to every
  request) or the 9.9.9 fixture version, not a claim about the world. The
  9.9.9 half is settled by the capture (exit 1, E404) and by the real-registry
  run in "Green" (exit 75 after 4 polls).
- `anyway` (154): "Two are added anyway" is settled by the adjacent citation
  of the coverage list at src/gates/red-witness.ts:164 and the bundle's
  `red-witness: not-applicable` line.
- `cannot be` (269): inside pasted grep output from scripts/license-gate.mjs,
  not a claim made here.

Re-run of both forms on the FINAL file, after the last three sections were
added. The line-based form adds two NEW lines outside this section: 274
(`never-served`, a test label in the witness table) and 280 (`needs a`, "its
precondition needs a changed path under src/, bin/ or plugin/", settled by the
quoted bundle line `red-witness: not-applicable: precondition
red-witness-diff evaluated and unmet: no changed path under src/, bin/,
plugin/`). Every other new hit is inside this section, quoting the hits above.
On the final file the wrap-insensitive form and `grep -oEi` over the lines
report IDENTICAL per-phrase occurrence counts, so no hit was split by a wrap.
The counts themselves are not quoted here, because this section quotes the
phrases and every quotation changes them.

## Fix round 1 (PR 211)

Both clean-room reviews of head `90f09fc` asked for a fix round, and both are
committed unchanged in this branch:
delivery/review/clean-room-release-verify-wait-sonnet.md:51 (CR-001 high,
CR-002 medium) and delivery/review/clean-room-release-verify-wait-opus.md:31
(CR-001 medium, CR-002 to CR-004 low). The coordinator's brief for the round
named the shared mechanism, and this round works from it.

### Mechanism

**The wait's bound and its "served" test were not the properties they claimed
to be.** The bound claimed "the wait ends by --wait-seconds", and it was a
check made only BETWEEN polls, on a number bash could not always do arithmetic
on. The "served" test claimed "npm install can now fetch the version", and it
asked a different registry document from the one install reads, with a
comparison no test could tell from "exit 0". Each finding is one place where
the claimed property and the tested property came apart:

| finding | claimed property | what was actually tested | fix |
|---|---|---|---|
| Sonnet CR-001 | the run ends by the deadline | the deadline, checked only after a poll returned | every poll runs under `bounded_run` with the time left, floor 10s |
| Sonnet CR-002 | the deadline is N seconds | N as bash arithmetic, which wraps at 19 digits | length check first, then a ceiling of 86400, else exit 64 |
| Opus CR-001 | install can fetch the version | the full packument, which install does not read | `npm cache add` (install's path) first, then the exact `npm view` check |
| Opus CR-002 | served is exactly this version | exit 0 AND equality, but no test reddens without the equality | new test with exit 0 and a wrong or empty stdout |
| Opus CR-003 | polls are spaced by the interval | a lower bound on attempts only | upper bound on attempts in the never-served test |
| Opus CR-004 | the log says why it was not served | the exit code only | the last `npm error` line is on the NOT SERVED line |

### What changed in scripts/release-verify.sh

- Bound validation, scripts/release-verify.sh:113. `checked_seconds` rejects
  non-digits, strips leading zeros (so `08` is not an octal error), checks the
  LENGTH against the ceiling's length before any integer comparison, then
  compares against `MAX_SECONDS=86400` and the minimum (0 for wait, 1 for
  poll). Beyond it: exit 64, "from N to at most 86400". Both flags and both
  environment variables go through it, because the flags only overwrite the
  variables before validation runs.
- `bounded_run`, scripts/release-verify.sh:415. Node, not `timeout(1)`:
  macOS ships no GNU `timeout`, and the repository treats macOS as supported
  (there is a macOS smoke workflow; it does NOT run this script, its test step
  names five other test files), so a maintainer running this by hand on a Mac
  must get the same bound; a bash
  background job with a watchdog `sleep` is portable but leaves the watchdog
  or a grandchild behind; node is already required by every record this script
  writes. The command runs `detached`, in its own process group, with stdout
  and stderr going to FILES, and on expiry the whole group gets SIGKILL and the
  wrapper exits 124 and creates `<stderr-file>.timed-out`. Sending a signal to
  a child this script started, on a timer this script set, is not identity or
  exclusion, so constraint C-2 does not govern it: no decision is taken from
  whether a process is alive.
- The poll, scripts/release-verify.sh:447. Each attempt computes a poll
  deadline, the later of the run's deadline and now plus
  `POLL_FLOOR_SECONDS=10`, and gives each npm call the time left on it. So a
  whole run ends by the deadline plus at most 10s. npm also gets
  `--fetch-retries=0` and `--fetch-timeout` equal to that limit, so in the
  ordinary case npm fails by itself with its own error.
- "Served" is now two conditions in order: `npm cache add <spec>` exits 0,
  then `npm view <spec> version` exits 0 and prints exactly the version.
- The record gains `lastCommand`, `lastPollTimedOut` and `pollFloorSeconds`.
  The NOT SERVED line now reads `(... poll(s); last poll: <command> exited C;
  last npm error: <line>)`, or `<command> timed out and was killed` and
  `last npm error: none`.

### A measurement that changes what Sonnet CR-001 was

The review reproduced a 60s+ poll against `http://127.0.0.1:1/`, a refused
port, and read it as a stalled connection. Measured here, same toolchain
(node v26.6.0, npm 11.18.0), from an empty scratch directory:

```
--- registry http://127.0.0.1:1/ extra '': exit=1 elapsed=70s; first npm error: npm error code ECONNREFUSED
--- registry http://127.0.0.1:1/ extra '--fetch-retries=0': exit=1 elapsed=1s; first npm error: npm error code ECONNREFUSED
--- registry http://10.255.255.1/ extra '': exit=1 elapsed=0s; first npm error: npm error code E405
--- registry http://10.255.255.1/ extra '--fetch-retries=0': exit=1 elapsed=0s; first npm error: npm error code E405
```

So the measured 60s and more was npm's own retry backoff on a REFUSED
connection, not a hang: with retries off the same call fails in one second.
`--fetch-retries=0` fixes the case the review measured. A connection that truly
never answers is the case `bounded_run` exists for, and I did not find a way to
produce one here: the non-routable address was answered by the container's
proxy with E405, so the real-network arm of that case is witnessed only by the
stub, not by a real stalled socket. That is an open residue, not a settled one.

The fixed script against both real addresses, `--wait-seconds 5
--poll-seconds 1`:

```
release-verify: NOT SERVED. The registry did not serve @tiphys/kernel@0.1.0 within 5 seconds (4 poll(s); last poll: npm cache add exited 1; last npm error: npm error code ECONNREFUSED).
exit=75 elapsed=5s
release-verify: NOT SERVED. The registry did not serve @tiphys/kernel@0.1.0 within 5 seconds (4 poll(s); last poll: npm cache add exited 1; last npm error: npm error code E405).
exit=75 elapsed=5s
```

Against the real public registry at head `e350076`: `@tiphys/kernel 0.2.0`
exit 0, `registry-served` with `attempts 1`, `lastCommand "npm view"`,
`lastStdout "0.2.0"`; `@tiphys/kernel 9.9.9 --wait-seconds 20
--poll-seconds 5` exit 75 after 17s, `last npm error: npm error code ETARGET`,
`lastStderr` the capture's three ETARGET lines. That the NOT SERVED line
distinguishes causes is shown by three real answers: ETARGET (not served),
ECONNREFUSED (network) and E405 (the proxy). An E401 was not produced here.

### New real capture

witness/captures/release-verify-cache-add-not-served.txt: `npm cache add` of
9.9.9 (exit 1, ETARGET) and of 0.2.0 (exit 0), npm 11.18.0 on node v26.6.0,
2026-09-23, fresh cache per command, with `--fetch-retries=0`. Everything
below its header is byte for byte what npm printed. The stub's `cache`
answer replays its exit code and stderr.

### Tests

The stub widened (test/license-gate.test.ts:1245): `cache` and `install` share
the request counter, and so does `view` by default; `view: "served"` serves
view from the first request while the install path is not served;
`view: {wrong, count}` answers exit 0 with a wrong stdout; `hang: true` makes
every registry request sleep in a child that never answers.

Edited: test 1 now also asserts 3 `cache add` calls and 1 `view` call; the
never-served test asserts at most 5 attempts (Opus CR-003), the cache-add
capture's exit code and ETARGET, and `last npm error: npm error code ETARGET`
on stderr (Opus CR-004); the tarball test asserts no `view` and no `cache`
call.

New, each registered in test/behaviors.json by name:

- `release-verify-bounds-each-registry-poll`: hang stub, wait 3, poll 1;
  exit 75 in under 25s, "timed out", `lastPollTimedOut: true`, no install.
- `release-verify-polls-the-install-path`: view served, install path served
  on its third request; exit 0, 3 attempts, 3 `cache add` calls, install 0.
- `release-verify-served-means-the-exact-version`: two arms, `0.1.9` twice
  and empty stdout once; exit 0 with count+1 attempts and `lastStdout
  "0.2.0"`.
- `release-verify-rejects-bounds-above-a-day`: 86401 and nineteen nines, each
  by `--wait-seconds`, `--poll-seconds`, `RELEASE_VERIFY_WAIT_SECONDS` and
  `RELEASE_VERIFY_POLL_SECONDS`, all exit 64 with "at most 86400" and no
  registry call; control: `--wait-seconds 86400 --poll-seconds 86400` exit 0.

### Red before the fix

Tests committed first (`dd642f8`), script untouched since `319b55c` (blob
`f7bde19`). TRANSLITERATION DECLARED for this block: U+2716 rendered `x` (5),
U+2714 rendered `v` (3), U+2139 rendered `i` (4). Lines omitted where `...`
appears; nothing else changed.

```
node v26.6.0; head dd642f8; script blob f7bde19
x release-verify in registry mode waits until the registry serves the version, then verifies it (3082.14962ms)
x release-verify in registry mode times out with NOT SERVED and exit 75 when the registry never serves the version (3400.743256ms)
v release-verify in registry mode fails a served but broken version at its steps without waiting out the deadline (1054.475222ms)
v release-verify in tarball mode makes no registry poll (1184.757283ms)
x release-verify bounds each registry poll, so a registry that never answers still ends within the deadline (40042.239554ms)
x release-verify polls the install path, so a version npm view shows before npm install can fetch it is still waited for (1127.345505ms)
v release-verify does not count npm view exiting 0 with a different or empty version as served (5300.623977ms)
x release-verify rejects a wait or poll bound above 86400 seconds, by flag and by environment (10010.477853ms)
i tests 8
i pass 3
i fail 5
i skipped 0
...
  AssertionError [ERR_ASSERTION]: lastStderr ["npm error code E404","npm error 404 No match found for version 9.9.9","npm error 404"]
  AssertionError [ERR_ASSERTION]: expected NOT SERVED from a registry that never answers; status -1 after 40.04s
  AssertionError [ERR_ASSERTION]: --wait-seconds 86401 was accepted (status -1 after 10.002s): release-verify: @tiphys/kernel@0.2.0 not served yet (poll 1, npm view exited 1); polling again in 1s
```

The hang test was killed by its own 40s spawn timeout, a run with a 3s
deadline. The corgi test failed `1 !== 0`: the pre-fix wait passed on its
first `npm view` and the install then failed. Test 1 failed `0 !== 3` on
`cache add` calls. The pattern missed `release-verify's wait flags`
(unchanged this round).

Two new assertions are GREEN pre-fix by construction, and their red is a
mutation, not the pre-fix script: the exact-version test (the pre-fix script
already compared stdout; Opus CR-002 was that nothing reddened WITHOUT the
comparison) and the attempts upper bound (the pre-fix script already slept;
CR-003 was that nothing reddened without the sleep). Both reds are below.

The run left an orphaned `sleep 100000` from the killed pre-fix hang run, and
the mutation lab left two more; all were removed with `pkill -f '^sleep
100000'` and `pgrep` then found none. After the fix, the green runs left none.

### Red against each dangerous state, and green

Five witness specs now touch scripts/release-verify.sh besides the
pre-existing contamination one. Each member was applied by the scratch
mutation lab (clean tree required, restore from `HEAD`, `restored, tree
clean` printed), at head `e350076`, node v26.6.0. The lab prints `PASS`,
`FAIL` and `i` itself, so nothing here is transliterated.

| witness | member | what it breaks | named tests red |
|---|---|---|---|
| waits-for-the-registry-to-serve-the-version | 0 | wait removed | 3 of 3 |
| same | 1 | gives up after one poll | 2 of 3 |
| same | 2 | served misread as `v$VERSION` | 2 of 3 |
| same | 3 | no pause between polls (CR-003) | 1 of 3: "polled 42 time(s) in a 3s window at 1s" |
| same | 4 | last npm error dropped (CR-004) | 1 of 3: "does not carry npm error code ETARGET" |
| bounds-each-registry-poll | 0 | timer 1000 times too long | 1 of 1, killed at 40s |
| same | 1 | npm run directly, unbounded | 1 of 1, killed at 40s |
| polls-the-install-path | 0 | cache add replaced by a second view | 1 of 1 |
| same | 1 | cache add called, result ignored | 1 of 1 |
| served-means-the-exact-version | 0 | exit 0 alone is served (CR-002) | 1 of 1: arm `0.1.9`, 3 polls expected |
| same | 1 | prefix match | 1 of 1: arm `""`, 2 polls expected |
| rejects-bounds-above-a-day | 0 | ceiling raised | 1 of 1: 86401 accepted |
| same | 1 | length check dropped | 1 of 1: `[: 9999999999...` then exit 75 |
| tarball-mode-makes-no-registry-poll | 0, 1 | unchanged members | 1 of 1 each |

Named but NOT a member: killing only the direct child instead of the group.
With output going to files, a surviving grandchild holds nothing the script
waits on, so that mutation would leave the hang test green. The group kill is
defence for a wrapper whose grandchild holds the connection, and no test here
observes it. The witness's provenance says the same.

The lab ran at `e350076`. The later commits change comments only in the
script (`2369631`), so a scratch count of every member's `find` string in
`HEAD:scripts/release-verify.sh` at `2369631` was run instead of a second
lab: all 18 members of all seven release-verify witnesses, the pre-existing
contamination witness's three included, match exactly once. The
contamination witness's members were NOT re-run this round.

Green at the fixed script, all twelve release-verify tests in the file,
node v26.6.0, `dist/` built: `i tests 12`, `i pass 12`, `i fail 0`,
`i skipped 0` (glyph U+2139 rendered `i`, 4). The hang test took 10.4s against
its 3s deadline, which is the 10s floor.

### Derivation

Four enumerations, run at the final head by a scratch script. D1 lists every
external command the script runs, so each can be classed as bounded or not;
D2 every place a numeric input enters arithmetic or a comparison; D3 every
place the script decides served; D4 every other registry read in the
repository.

```
head 2369631
$ grep -nE '(^|[^a-z_-])(npm|node|sleep|timeout|curl|tar|cp|mktemp)( |$)' scripts/release-verify.sh | grep -vE '^[0-9]+:\s*#'
184:  node -e '
199:  node -e '
255:    printf 'node resolution from this directory'
262:  node -e '
278:  node -e '
419:  node -e '
464:    last_command="npm cache add"
468:      npm cache add "$NAME@$VERSION" --cache "$wait_cache" --prefer-online \
471:      last_command="npm view"
476:        npm view "$NAME@$VERSION" version --cache "$wait_cache" --prefer-online \
491:    sleep "$POLL_SECONDS"
498:  last_error="$(grep '^npm error' "$err_file" | grep -v 'complete log' | head -n 1 || true)"
499:  node -e '
505:      .filter((line) => line.startsWith("npm error") && !line.includes("complete log"))
512:      command: "npm cache add " + name + "@" + version + ", then npm view " + name + "@" + version + " version; --prefer-online --fetch-retries=0, fresh cache per poll, each bounded by the time left on the deadline",
538:    echo "release-verify: NOT SERVED. The registry did not serve $NAME@$VERSION within $WAIT_SECONDS seconds ($attempts poll(s); last poll: $why; last npm error: ${last_error:-none})." >&2
555:  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
558:  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
565:run_step import node -e '
590:cp "$PREFIX/node_modules/$NAME/templates/plan.example.yaml" "$COPIED/plan.example.yaml" 2>/dev/null || COPY_CODE=$?
591:record copy-template "$COPY_CODE" "cp <install>/templates/plan.example.yaml $COPIED/"
exit=0

$ grep -nE 'WAIT_SECONDS|POLL_SECONDS|POLL_FLOOR_SECONDS|MAX_SECONDS|\$\(\(' scripts/release-verify.sh | grep -vE '^[0-9]+:\s*#'
72:               or RELEASE_VERIFY_WAIT_SECONDS). 0 means poll exactly once.
77:               RELEASE_VERIFY_POLL_SECONDS); at least 1, at most 86400
89:WAIT_SECONDS="${RELEASE_VERIFY_WAIT_SECONDS:-900}"
90:POLL_SECONDS="${RELEASE_VERIFY_POLL_SECONDS:-15}"
97:    --wait-seconds) WAIT_SECONDS="${2:?--wait-seconds needs a value}"; shift 2 ;;
98:    --poll-seconds) POLL_SECONDS="${2:?--poll-seconds needs a value}"; shift 2 ;;
121:MAX_SECONDS=86400
126:    ''|*[!0-9]*) echo "release-verify: $option must be a whole number of seconds, from $minimum to at most $MAX_SECONDS, got '$value'" >&2; usage; exit 64 ;;
130:  if [ "${#digits}" -gt "${#MAX_SECONDS}" ] || [ "$digits" -gt "$MAX_SECONDS" ] || [ "$digits" -lt "$minimum" ]; then
131:    echo "release-verify: $option must be a whole number of seconds, from $minimum to at most $MAX_SECONDS, got '$value'" >&2; usage; exit 64
136:checked_seconds --wait-seconds "$WAIT_SECONDS" 0
137:WAIT_SECONDS="$CHECKED"
138:checked_seconds --poll-seconds "$POLL_SECONDS" 1
139:POLL_SECONDS="$CHECKED"
298:    FAILURES=$((FAILURES + 1))
392:POLL_FLOOR_SECONDS=10
452:  local deadline=$((started + WAIT_SECONDS))
457:    attempts=$((attempts + 1))
459:    poll_deadline=$((now + POLL_FLOOR_SECONDS))
465:    limit=$((poll_deadline - now))
469:      --fetch-retries=0 --fetch-timeout="$((limit * 1000))" || code=$?
473:      limit=$((poll_deadline - now))
477:        --fetch-retries=0 --fetch-timeout="$((limit * 1000))" || code=$?
487:    if [ $((now + POLL_SECONDS)) -gt "$deadline" ]; then
490:    echo "release-verify: $NAME@$VERSION not served yet (poll $attempts, $last_command exited $code); polling again in ${POLL_SECONDS}s" >&2
491:    sleep "$POLL_SECONDS"
494:  local elapsed=$(( $(date +%s) - started ))
531:    "$WAIT_SECONDS" "$POLL_SECONDS" "$first_at" "$last_at" "$elapsed" \
533:    "$POLL_FLOOR_SECONDS"
538:    echo "release-verify: NOT SERVED. The registry did not serve $NAME@$VERSION within $WAIT_SECONDS seconds ($attempts poll(s); last poll: $why; last npm error: ${last_error:-none})." >&2
exit=0

$ grep -nE 'served=|observed|"\$code" -eq 0|exit_code=75' scripts/release-verify.sh
367:# three times what was observed and still far inside any job timeout. On
454:  local attempts=0 code=0 observed="" last_at="" now=0 served=no
462:    observed=""
470:    if [ "$code" -eq 0 ]; then
478:      observed="$(cat "$out_file")"
482:    if [ "$code" -eq 0 ] && [ "$observed" = "$VERSION" ]; then
483:      served=yes
496:  [ "$served" = yes ] || exit_code=75
501:      firstAt, lastAt, elapsed, npmExit, observed, errFile, lastCommand, timedOut,
525:      lastStdout: observed,
532:    "$code" "$observed" "$err_file" "$last_command" "$timed_out" \
exit=0

$ grep -rnE 'npm (view|info|show|cache add)|registry\.npmjs|--wait-seconds|RELEASE_VERIFY_(WAIT|POLL)' scripts .github src bin
scripts/release-verify.sh:69:  --wait-seconds <n>
scripts/release-verify.sh:72:               or RELEASE_VERIFY_WAIT_SECONDS). 0 means poll exactly once.
scripts/release-verify.sh:77:               RELEASE_VERIFY_POLL_SECONDS); at least 1, at most 86400
scripts/release-verify.sh:89:WAIT_SECONDS="${RELEASE_VERIFY_WAIT_SECONDS:-900}"
scripts/release-verify.sh:90:POLL_SECONDS="${RELEASE_VERIFY_POLL_SECONDS:-15}"
scripts/release-verify.sh:97:    --wait-seconds) WAIT_SECONDS="${2:?--wait-seconds needs a value}"; shift 2 ;;
scripts/release-verify.sh:115:# 64-bit arithmetic (a 19-nine --wait-seconds was measured giving up after ONE
scripts/release-verify.sh:136:checked_seconds --wait-seconds "$WAIT_SECONDS" 0
scripts/release-verify.sh:349:#   1. `npm cache add <name>@<version>` exits 0. This is INSTALL'S OWN FETCH
scripts/release-verify.sh:351:#      of this wait asked only `npm view`, which reads the FULL packument, a
scripts/release-verify.sh:356:#   2. `npm view <name>@<version> version` exits 0 AND prints exactly
scripts/release-verify.sh:374:# first version checked its deadline only BETWEEN polls, so one `npm view`
scripts/release-verify.sh:375:# that did not return outlived --wait-seconds without limit. The review
scripts/release-verify.sh:464:    last_command="npm cache add"
scripts/release-verify.sh:468:      npm cache add "$NAME@$VERSION" --cache "$wait_cache" --prefer-online \
scripts/release-verify.sh:471:      last_command="npm view"
scripts/release-verify.sh:476:        npm view "$NAME@$VERSION" version --cache "$wait_cache" --prefer-online \
scripts/release-verify.sh:512:      command: "npm cache add " + name + "@" + version + ", then npm view " + name + "@" + version + " version; --prefer-online --fetch-retries=0, fresh cache per poll, each bounded by the time left on the deadline",
.github/workflows/release.yml:144:          registry-url: https://registry.npmjs.org
exit=0
```

Reading:

- D1. The network-reaching calls are the two polls, both through
  `bounded_run`, and the two `run_step install npm install` lines. The
  tarball arm reads no registry. The REGISTRY arm's install is NOT bounded by
  this script; see "not covered". Every `node -e` is local (resolution
  probes, the record writer, the import step, the wrapper itself), and `cp` is
  local. The `sleep` runs only after a check that the interval ends before the
  deadline.
- D2. Every use of `WAIT_SECONDS` and `POLL_SECONDS` in arithmetic comes after
  `checked_seconds` at lines 136 to 139; the only other inputs to arithmetic
  are `date +%s`, the floor constant, and counters the script owns.
- D3. One decision, at the `served=yes` line, and it needs both conditions.
- D4. The only registry reader outside the script is the workflow's
  `registry-url` for `setup-node`; the wait flags and variables appear only in
  scripts/release-verify.sh. The workflow passes neither, so it gets the 900s
  and 15s defaults.

### What the derivation did NOT cover

- **The registry-mode install step is not bounded by this script.** It runs
  after the wait has seen the version through install's own path, so it is
  not the wait's bound and not what the reviews named; but it is the same
  shape, one network command with no wall-clock limit, and it is left to the
  job. The release job sets no `timeout-minutes` (Sonnet quotes the grep), so
  that limit is GitHub's default. Stated as an open item for the coordinator,
  not fixed here.
- D1's pattern lists `npm`, `node`, `sleep`, `timeout`, `curl`, `tar`, `cp`
  and `mktemp` only. A command spelled another way (a variable holding a
  command name, `"$BIN" version` at the bin step) is not matched; the bin step
  runs the installed package's own bin locally and reads no network, which I
  checked by reading the lines, not by the grep.
- D4 covers `scripts`, `.github`, `src` and `bin`, not `plugin/`, `test/` or
  any consumer project, and only the spellings in the pattern.
- Whether `npm cache add` succeeding implies `npm install` succeeding in every
  propagation state is not established. Opus's reading of npm's source says it
  fetches the corgi packument and the tarball of THIS package, which is what
  install needs for it. Install ALSO resolves the package's production
  dependencies (package.json lists `ajv`, `commonmark` and `yaml`, pinned),
  and `cache add` does not fetch those. An unfetchable dependency would
  therefore pass the wait and fail at `install` as a step failure. Those are
  long-published versions rather than part of this publish, so the
  propagation lag does not apply to them, but that is reasoning, not a
  measurement. No real propagation window was observed.
- A truly stalled socket was not produced on a real network (see the
  measurement above); the stub is the only witness of that arm.
- The macOS smoke job was not run. `bounded_run`'s portability rests on
  node's `detached` spawn making the child a process-group leader on
  non-Windows platforms, and on `kill` with a negative pid meaning that group,
  which is POSIX behaviour. Neither was exercised on macOS: the macOS smoke
  workflow does not run test/license-gate.test.ts, so no CI run will exercise
  it there either.
- `--fetch-timeout` is npm's per-request timeout. Whether it alone would bound
  the whole command is not established, so `bounded_run` stays as the
  backstop.

### An error of mine in a shared container, recorded for the coordinator

At about 10:40Z I stopped my own interrupted full-suite run and then ran
`pkill -f` on the Node 26 scratch interpreter's PATH to clear its leftover
children. That interpreter is shared by every agent in this session, and the
command also killed child processes of ANOTHER agent's gate run: the M5-P2
local PR bundle writing to the session scratchpad's `p2/ev-r2` directory,
whose red-witness harness was running mutated `test/doctor.test.ts` cases at
the time (seen in `ps` as `node --test ... test/doctor.test.ts` and a
`tiphys-witness-*` fleet). A killed mutation run can read as a red witness, so
that bundle's red-witness verdict should be treated as unknown and the bundle
re-run. My two earlier cleanups, `pkill -f '^sleep 100000'`, matched a
command line that this branch's hang stub starts and that I know of nothing
else starting; I did not check each process's parent before killing it,
which is the same gap at lower risk. The mechanism is
the one the dispatch contract names for watchdogs: a pattern chosen because
it matched MY processes, with no check that it matched ONLY mine.

### Gates at the final head

All on node v26.6.0, npm 11.18.0, `dist/` built, head `701b31f`: `npm ci`
exit 0, `npm run build` exit 0, `git status --porcelain` empty afterwards.
Local PR bundle,
`./scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase claude/release-verify-waits-for-registry <scratch>`,
exit 0:

    gates: declared 15 applicable 8 verdict 8 green 8 red 0 not-applicable 7 error 0 vacuous 0
    gates: suite: green: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 1403 test(s) from 68 file(s) (pass 1403, fail 0, skipped 0, todo 0, did-not-run 0); discovered 68 file(s) walking test for .test.ts; 1278 behavior(s) resolve; merge base 0b6eee7dfc0f
    gates: citations: green: linted 3 changed document(s) at 701b31f89dec315c790ff0097492e1465d19ffbf: 3 citation(s) resolved, 0 self-citation(s), 0 unverifiable-external
    gates: red-witness: not-applicable: precondition red-witness-diff evaluated and unmet: no changed path under src/, bin/, plugin/
    gates: required gate(s) not applicable: scope, red-witness, gate-classes
    m2-assert (PR bundle): OK. 15 gate record(s) match section 1.4; ... zero red; zero error; zero vacuous.
    m2-green: OK. 3 diff-scoped gate(s) demonstrated green on a triggering state.

1403 is round 0's 1399 plus the four new tests. `red-witness`, `scope` and
`gate-classes` are not applicable on this branch by their own preconditions,
so this bundle is NOT evidence that they asserted anything; the witness
evidence is the hand-run lab above.

The FIRST bundle run this round, at `2369631`, exited 1 with `suite: error:
M2-C-5: the tree changed during the run: ... test/license-gate.test.ts
changed during the run`. That was my edit of a comment in that file while the
suite ran. The gate was right; the edit was committed as `701b31f` and the
bundle re-run with the tree untouched, which is the run quoted above.

The commit after `701b31f` adds only this work-history section. The citations
in it were checked by the claim grep and a citations-only gate run below, not
by the bundle.

### Claim grep, fix round 1

Both forms, run by a scratch script over this section (it starts at line
446) before this subsection was written. Line-based: 11 matching lines, 11
occurrences (`always` 1, `needs a` 3, `never` 7). Wrap-insensitive over the
same lines: the same 11, so none was split by a wrap. Whole file: 44 by each
form.

Each hit settled:

- Line 459, "could not always do arithmetic": settled by Sonnet CR-002's
  measurement (delivery/review/clean-room-release-verify-wait-sonnet.md:122,
  a nineteen-nine bound giving up after one poll) and by the cap witness's
  member 1 above, whose captured stderr shows bash's `[` failing on the
  nineteen-digit value.
- Line 525, "never answers" and "I did not find a way": an open residue,
  stated as one; the adjacent measurement shows the two addresses tried.
- Lines 471, 562, 565, 594, 597, 607: test names, a stub mode and captured
  assertion text, not claims about the world.
- Lines 709, 710, 757: pasted derivation output (`needs a value` is the
  script's own usage message).

This subsection itself adds hits by quoting the phrases above.
