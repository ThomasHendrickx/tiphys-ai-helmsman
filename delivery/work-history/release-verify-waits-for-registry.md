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

- scripts/release-verify.sh:341 `wait_for_registry`, called only when no
  `--tarball` was given (scripts/release-verify.sh:409). Each poll is
  `npm view <name>@<version> version --cache <fresh> --prefer-online`
  (scripts/release-verify.sh:352), and "served" is exit 0 AND stdout exactly
  equal to the version (scripts/release-verify.sh:354). Both halves are
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

The comment at test/license-gate.test.ts:2788 cited the registry install at
the old line 299; it now cites scripts/release-verify.sh:421.

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
