# Clean-room review: release-verify registry wait (hazard contract)

Date: 2026-09-23
PR: #211
Head SHA reviewed: 90f09fc1a8968ce0c410bad066b11a652a774ac1
Branch: claude/release-verify-waits-for-registry
Contract: hazard
Model family: sonnet
Method: clean-room, no implementer account read. Static read of scripts/release-verify.sh
and its tests, plus targeted execution probes (network-error loops, malformed flags,
tarball-mode network check, records-file validity, wait-vs-refusal ordering, stub
fidelity against a real npm capture).

Status: COMPLETE

## Summary

The registry wait is a real fix for the measured incident (T-045, run
35839356656) and the ordering worry named in the dispatch (wait running
before the clean-environment refusal) is NOT present: the refusal runs
first, confirmed by execution. The paperwork (T-045, DR-0052,
delivery/STATE.md A-15) checks out exactly against the live GitHub Actions
API and the live npm registry.

Two hazard-class defects were found and reproduced against the real script
(not the stub): the wait has no per-poll network timeout, so a stalled
(not merely refused) connection can silently blow the declared bound by a
large factor; and the numeric validation for --wait-seconds/--poll-seconds
accepts arbitrarily long digit strings, which overflow bash's signed 64-bit
arithmetic and can either disable the bound (implementation-dependent wrap
to a huge positive deadline) or produce an instant false NOT SERVED. See
CR-001 and CR-002.

## Progress notes (beacon)

- Read scripts/release-verify.sh in full at head 90f09fc. Wait ordering
  confirmed correct: clean-environment / NODE_PATH refusals (lines 292-309)
  run strictly before wait_for_registry (called at lines 409-410). Verified
  by execution, not just by reading (see probes below).
- Verified T-045 / DR-0052 / STATE.md A-15 against the live GitHub API and
  live npm registry: run 35839356656, its job/step timings, the head sha,
  and npm's own gitHead/time/dist-tags metadata for @tiphys/kernel@0.2.0 all
  match the documents' claims exactly.
- Mutation-tested two new tests (wait-then-verify, never-served-times-out)
  against the real script: both red on the targeted mutation, green restored.
- Found and reproduced two hazard-class defects (see findings). Full suite
  running in background for the mechanical gates.

## Findings

### CR-001 (high): a single `npm view` poll has no timeout, so a stalled (not refused) network connection can blow the declared wait bound by a large, unbounded-in-practice factor

Claim: `wait_for_registry()` at scripts/release-verify.sh:352 calls
`npm view "$NAME@$VERSION" version --cache "$wait_cache" --prefer-online`
with no `timeout` wrapper and no npm-level fetch-timeout flag. The deadline
check (`if [ $((now + POLL_SECONDS)) -gt "$deadline" ]`) runs only BETWEEN
polls, never around one. If a single poll hangs instead of returning an
error quickly (a stalled TCP connection, packets silently dropped, a
half-open proxy), the wait can sit inside that one `npm view` call for far
longer than `--wait-seconds`/`RELEASE_VERIFY_WAIT_SECONDS` ever declared,
with nothing to interrupt it until npm's own internal timeout (unconfigured
here, and not verified to be short) or the outer CI job timeout, which is
GitHub's 360-minute default per .github/workflows/release.yml (no
`timeout-minutes` is set anywhere in that file, confirmed by
`grep -n timeout-minutes .github/workflows/release.yml`, zero hits, matching
the work history's own claim at
delivery/work-history/release-verify-waits-for-registry.md:69).

Why it matters: the entire point of this fix is a BOUND distinct from a step
failure (the PR's own comment block at scripts/release-verify.sh:330 says
"BOUNDED, and the bound is distinct from a step failure"). A stalled poll
defeats exactly that guarantee, silently: the operator configured 900s (or
any --wait-seconds), and the actual wait for one bad poll can run into the
job's 360-minute ceiling, twenty-four times the default bound, with no
`NOT SERVED` message and no evidence written until the whole thing finally
gives up or the job is killed externally. This is precisely the hazard
class named in the dispatch ("can a network error loop forever") and it is
not a network error the script classifies at all; it is a network
condition it never budgets for.

Evidence (executed against the real, unmodified script at head 90f09fc,
no stub):

```
$ timeout 60 env npm_config_registry=http://127.0.0.1:1/ npm view \
    @tiphys/kernel@0.1.0 version --cache /tmp/rvw-cache-probe --prefer-online
single call status=124 elapsed=60s
```

A single `npm view` call against an address that accepts no connection
(port 1, nothing listening, no RST/ICMP reaching back through this
container's network path) did not return within 60 seconds; the outer
`timeout` killed it. That is one poll, not sixty: with the script's own
default `--poll-seconds 15`, a single stalled poll like this already
exceeds ten polls' worth of the intended cadence and can exceed a
short-configured `--wait-seconds` (for example 30 or 60, both plausible
operator choices for a fast CI check) many times over before the loop's
own deadline check is ever reached, because that check never runs while
the call is in flight.

A second, end-to-end run through the actual `wait_for_registry` function
(same registry override, `--wait-seconds 5 --poll-seconds 1`) also did not
return within a 30s outer wrapper:

```
$ timeout 30 env npm_config_registry=http://127.0.0.1:1/ bash \
    scripts/release-verify.sh @tiphys/kernel 0.1.0 --workdir /tmp/rvw-netfail-workdir \
    --wait-seconds 5 --poll-seconds 1 --records /tmp/rvw-netfail-workdir/records-e.json
status=124 elapsed=30s
```

A `--wait-seconds 5` run that should report `NOT SERVED` within about 5-6
seconds instead ran past 30 seconds and had to be killed externally: 6x the
declared bound and counting, on the very first poll.

Fix suggestion: wrap the `npm view` invocation in `timeout` bounded to the
remaining budget (`min(POLL_SECONDS, deadline - now)`, or a fixed small cap
such as 30s), and treat a `timeout`-induced kill the same as any other
nonzero exit (retry until the deadline, same as today). This keeps one
stalled poll from silently consuming the whole bound.

### CR-002 (medium): --wait-seconds / --poll-seconds / RELEASE_VERIFY_WAIT_SECONDS / RELEASE_VERIFY_POLL_SECONDS accept arbitrarily long digit strings, which overflow bash's signed 64-bit arithmetic and defeat the bound

Claim: the validation at scripts/release-verify.sh:111-116 is
`''|*[!0-9]*` (reject empty or any non-digit character), which correctly
rejects negative numbers, non-numeric strings, and empty values, but places
NO ceiling on magnitude. `deadline=$((started + WAIT_SECONDS))` at
scripts/release-verify.sh:345 and the loop's `$((now + POLL_SECONDS))` at
scripts/release-verify.sh:359 are then bash arithmetic, which is signed
64-bit and wraps silently on overflow (no error, no nonzero exit from the
arithmetic expression itself when the result is nonzero).

Measured, isolated (`$((started + N))` for N built from repeated `9`
digits, `started` a real epoch time):

| digits | value | resulting deadline |
|---|---|---|
| 18 | 999999999999999999 | 1000000001790157252 (huge positive: bound effectively disabled) |
| 19 | 9999999999999999999 | -8446744071919394364 (negative: bound collapses to zero) |
| 20 | 99999999999999999999 | 7766279633242399172 (huge positive again) |

So depending on exactly how many digits the bad value has, the overflow
goes either direction: an operator error (or a misconfigured
`RELEASE_VERIFY_WAIT_SECONDS`, e.g. a copy-paste that concatenated a
timestamp) can produce a wait that is, for all practical purposes,
unbounded, or one that fails after exactly one poll while claiming to have
honored a huge requested bound.

Demonstrated end to end against the real script (19-nine value, a version
that genuinely does not exist on the registry, `--poll-seconds 1`):

```
$ timeout 20 bash scripts/release-verify.sh @tiphys/no-such-package-xyz 1.0.0 \
    --workdir /tmp/rvw-overflow-workdir --wait-seconds 9999999999999999999 \
    --poll-seconds 1 --records /tmp/rvw-overflow-workdir/records-d.json
release-verify: NOT SERVED. The registry did not serve @tiphys/no-such-package-xyz@1.0.0
  within 9999999999999999999 seconds (1 poll(s), last npm view exit 1).
status=75 elapsed=1s
```

The script accepted the value (no exit-64 usage error), then reported
"waited within 9999999999999999999 seconds" after exactly ONE poll and one
second, because the overflowed deadline had already collapsed to a
negative epoch. This directly answers the dispatch's question ("can bad
values for the wait flags or env vars disable the bound (huge...)"): yes,
and the failure mode is nondeterministic across digit counts (sometimes
fail-closed-instantly, sometimes fail-open-forever), which is worse than
either failure mode alone because it cannot be relied on to fail safely.

None of the five new tests exercise a value long enough to overflow; the
malformed-input test (`release-verify's wait flags override the
environment and a malformed bound is a usage error`,
test/license-gate.test.ts:1451) checks `""`, `"-5"`, `"soon"`, `"0"` for
`--poll-seconds` only, none of which are anywhere near the ~19-digit
boundary where this defect appears.

Fix suggestion: cap accepted values to a sane maximum (for example reject
any value above 86400 seconds, or above whatever the intended maximum
sensible wait is) as part of the existing `case` validation, which already
has a natural place for it and would also give a clear usage-error message
instead of silent wraparound.

## Probes run (found nothing / confirmed correct)

- Wait-vs-refusal ordering: static read (clean-environment probe and
  record at scripts/release-verify.sh:292-309, strictly before the
  `wait_for_registry` call at scripts/release-verify.sh:409-410) PLUS
  execution: NODE_PATH contamination and in-checkout resolution-path
  contamination, each run with `--wait-seconds 999999`, both refused in 0s
  elapsed (no wait attempted). Confirms the dispatch's specific worry
  (contaminated directory waiting 15 minutes before refusing) is NOT
  present in this diff.
- False "served" on version mismatch (prefix, dist-tag, stdout
  whitespace/extra lines): the match is exact string equality
  (`[ "$observed" = "$VERSION" ]`) against `npm view <name>@<exact-version>
  version`, which is an exact-version specifier, not a range or tag, so
  npm itself would 404 rather than resolve to a different real version.
  Checked the real capture (witness/captures/release-verify-registry-not-served.txt):
  a served version's stdout is exactly the version string with no trailing
  whitespace or extra lines (`0.2.0`, `0.1.0`). Command substitution strips
  only trailing newlines, which matches. No exploit found for a false
  positive; the existing witness member 2 (mutating the comparison to
  require a `v` prefix) already tests the adjacent case in the safe
  direction (a real match failing to register), and I did not find a
  member that produces a false positive registering as "served".
- Tarball mode network reach: static read confirms `wait_for_registry` is
  called only inside `if [ -z "$TARBALL" ]`
  (scripts/release-verify.sh:409), and the new test
  ("release-verify in tarball mode makes no registry poll") asserts zero
  `view` calls in the stub's call log; reran it green at head.
- Records file JSON validity: the wait writes one JSONL line via a real
  `JSON.stringify` in `node -e` (scripts/release-verify.sh:369-396), so
  escaping of embedded quotes/newlines in captured stderr is handled by
  the JSON serializer, not by hand-built string interpolation. Every
  outcome (served, not-served, network-error-then-served) writes exactly
  one `registry-served` record; verified in my own probes that the file
  parses as one JSON object per line in all three outcomes I exercised
  (contaminated refusal, served, not-served).
- Stub fidelity: the stub's "not served" answers for both `npm view` and
  `npm install` are read verbatim from
  witness/captures/release-verify-registry-not-served.txt, a real capture
  (npm 11.18.0, node v26.6.0, dated 2026-09-23, the same day) rather than
  hand-typed. Confirmed the capture's served-version sections
  (`npm view @tiphys/kernel@0.2.0 version`, `@0.1.0`) print exactly the
  version with no extra stdout, matching what the stub's post-limit branch
  synthesizes (`echo "${spec##*@}"`). Argument parsing in the stub's
  `install` case correctly consumes `--prefix VALUE` and `--cache VALUE`
  as two-token pairs and single-token flags otherwise, matching the real
  invocation's argument order at scripts/release-verify.sh:418-422.
  I independently confirmed against the LIVE registry (not the stub) that
  @tiphys/kernel@0.1.0 and @0.2.0 really do install successfully via the
  unmodified script, and that @0.2.0's registry metadata
  (`gitHead=cb5de0d29061ab5c50a6023658f18eee931e74a7`,
  `time["0.2.0"]=2026-09-23T09:01:47.626Z`, `dist-tags.latest=0.2.0`)
  matches DR-0052's evidence section exactly.
- Paperwork accuracy: run 35839356656 (via mcp github actions_get /
  actions_list) confirms: head_sha cb5de0d29061ab5c50a6023658f18eee931e74a7,
  conclusion failure, publish step completed 08:56:38Z, the verification
  step ran 08:56:38Z-08:56:39Z (one second, exactly as T-045 claims), and
  the `tag` job is `skipped`. Commit cb5de0d exists on `main`'s history
  ("Bump the kernel to 0.2.0 for release (#208)"), its package.json has
  `"version": "0.2.0"`, confirming A-15's tag target commit. `git ls-remote
  --tags origin` shows no `v0.2.0` tag yet, confirming the gap A-15
  describes is still open. Mutation-testing the wait-disabled state on the
  real script reproduces T-045's exact five exit codes (1, 1, 127, 1, 127),
  independently corroborating the incident account.
- ASCII/citation conventions: `node scripts/check-authored-bytes.mjs` exit
  0 on the full tree at head. No em-dash bytes in the three new/changed
  delivery docs (grep for U+2014, zero hits). Each of DR-0052 and T-045
  carries at least one resolving `path:line` citation outside backticks
  into scripts/release-verify.sh, which the branch and main both contain
  byte-identically at that path (only line 1 is cited, trivially
  byte-identical).
- Mutation-tested two of the five new tests directly against the real
  script (not a copy): disabling the `wait_for_registry` call (`if false
  && ...`) reddens "waits until the registry serves the version, then
  verifies it" with the exact incident exit codes; changing the timeout
  exit from `exit 75` to `exit 1` reddens "times out with NOT SERVED and
  exit 75...". Both restored to green after reverting.
- behaviors.json: all five new entries
  (release-verify-waits-for-the-registry-to-serve-the-version,
  release-verify-not-served-times-out-distinctly,
  release-verify-served-but-broken-fails-at-its-steps,
  release-verify-tarball-mode-makes-no-registry-poll,
  release-verify-wait-flags-override-env-and-reject-malformed) map to
  test titles that occur exactly once in test/license-gate.test.ts,
  checked by grep -F -c.
- Scope: changed files are scripts/release-verify.sh,
  test/license-gate.test.ts, test/behaviors.json,
  witness/captures/release-verify-registry-not-served.txt, two new
  witness/*.json files, delivery/STATE.md, one new decision record, one
  new tuition entry, and the work history. No phase-declaration file
  exists or is expected (defect-fix branch, does not match
  `^claude/m[0-9]+-p[0-9]+-`, as the work history states and CLAUDE.md's
  branch-naming rule requires). Blast radius: `.github/workflows/release.yml`
  is the only production consumer of scripts/release-verify.sh and is
  unchanged (grep confirms both call sites at lines 276 and 320 are
  untouched, and no `timeout-minutes` is set on the `release` job).

## Honest-failure section (could not check)

- Could not observe npm's own internal request/connect timeout precisely;
  only established that it exceeds 60s against a non-responding address in
  this container's network path, which is already enough to demonstrate
  CR-001 but does not pin an exact upper bound for npm's own behavior.
- Did not run the macOS smoke job or CI itself; T-009 lists that as
  CI-only. Local green (see full-suite run below) is the substitute per
  CLAUDE.md's "local green before opening" rule.
- Did not exhaustively fuzz every overflow boundary for `--poll-seconds`
  (only reasoned by analogy from `--wait-seconds`, since both share the
  identical `case` validation shape and the same `$(( ))` arithmetic
  pattern at scripts/release-verify.sh:359); I did not execute a
  `--poll-seconds` overflow probe end to end, only the isolated arithmetic
  check plus static code reading.
- Did not verify gh CLI's actual `--verify-tag` flag against a live `gh`
  binary (not installed here; standing warning 6). Took the flag's
  presence as plausible syntax rather than confirming against `gh` itself.
(Resolved after first draft: the full local suite finished, 1399/1399
pass, 0 fail, 0 skipped, exit 0, on the reviewed head itself. See
"Mechanical gates (local)" above.)

## Mechanical gates (local)

- `node scripts/check-authored-bytes.mjs`: exit 0.
- `npm ci` and `npm run build` (node v26.6.0): both exit 0, `git status
  --porcelain` clean afterward.
- `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
  --only citations --base origin/main --head HEAD`: green, 3 citations
  resolved, 0 unresolved, 0 self-citation.
- Same runner, `--only red-witness`: not-applicable (no changed path under
  src/, bin/, plugin/), matching the work history's own claim and
  CLAUDE.md's coverage rule (`scripts/` is not an audited tree).
- Same runner, `--only scope`: errors requesting `--phase`, because this
  branch does not match `^claude/m[0-9]+-p[0-9]+-` by design (a defect-fix
  branch, per CLAUDE.md's branch-naming rule and the work history's own
  scope section); the work history's own PR-bundle run recorded `scope:
  not-applicable` for the same structural reason. Not a defect.
- `node scripts/check-id-collisions.mjs`: no collisions; T-045 and DR-0052
  are each the next free id in their scheme, matching what the diff
  allocates.
- Full local suite (`npm ci && npm run build && node --test
  "test/**/*.test.ts"`, node v26.6.0, dist/ built), run to completion in
  this worktree on the reviewed head 90f09fc: **1399 tests, 1399 pass, 0
  fail, 0 cancelled, 0 skipped, 0 todo, exit 0, duration_ms 780017**
  (about 13 minutes). This matches the implementer's own recorded run at
  the immediate ancestor commit `319b55c` (1399/1399, 966s) in test count
  and pass/fail shape; the reviewed head adds no new tests over that
  ancestor commit's suite size, consistent with the diff being a
  paperwork-only addition on top of `319b55c` plus the merge of `main`.

## Verdict

**FIX-ROUND-NEEDED.**

Two hazard findings, CR-001 (high) and CR-002 (medium), both reproduced by
direct execution against the real, unmodified script (not the test
stubs). Neither is hypothetical: CR-001 was demonstrated twice (a bare
`npm view` call and a full `wait_for_registry` run), and CR-002 was
demonstrated once against the real script with a value the script's own
validation accepts. Both bear directly on hazard questions named in the
dispatch ("can a network error loop forever", "can bad values ... disable
the bound").

Everything else checked out: the wait-before-refusal ordering worry is
not present (verified by execution); the paperwork (T-045, DR-0052,
STATE.md A-15) is accurate against the live GitHub API and live npm
registry, including exact timestamps and exit codes; the stub npm is
faithful to a real, dated capture; tarball mode makes no registry
contact; the five new behaviors resolve to real, uniquely-named tests;
two of the five tests were mutation-tested directly and both reddened on
the targeted mutation; ASCII, citation and identifier-collision checks
are clean; scope is limited to the expected file set with the expected
gate not-applicable results for a non-phase branch.
