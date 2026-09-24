# Clean-room review: PR 211, release-verify waits for the registry (opus)

- date: 2026-09-23
- PR: 211, branch `claude/release-verify-waits-for-registry`
- head SHA reviewed: 90f09fc1a8968ce0c410bad066b11a652a774ac1 (merge-base with
  origin/main 0b6eee7)
- contract: criteria (defect fix outside the M5 plan; the contract is the work
  history's own statement of the defect plus DR-0052 and T-045, and the seven
  criteria in the dispatch prompt)
- model family: opus
- method: detached checkout of the head; diff read in full
  (`git diff origin/main...HEAD`, 10 files); every criterion re-executed on node
  v26.6.0 / npm 11.18.0; ten mutations run in a byte copy of the worktree (a
  "mutation lab") so the full suite in the real worktree was never disturbed;
  the pre-fix script from origin/main run against the new tests; the script run
  against the real npm registry; npm's own source read to settle the open
  question.

## Verdict

FIX-ROUND-NEEDED. One medium, three low. No high.

The fix is well made, bounded, honestly documented, and every criterion in the
prompt is met as written. The medium is the work history's own open question:
it is a real risk, the mechanism for it is visible in npm's source, and the fix
is a one-line change of probe. If the orchestrator rates CR-001 low, nothing
else here blocks and the verdict becomes APPROVE.

## Findings

### CR-001 (medium): "served" is measured on a different document than the one `npm install` reads

Claim. The wait's poll is `npm view <name>@<version> version`. `npm view` asks
the registry for the FULL packument. `npm install` asks for the ABBREVIATED
("corgi") packument and then for the tarball. These are different responses
with different `Accept` headers, so "npm view shows the version" does not imply
"npm install can resolve and fetch it". A lag in the corgi document or the
tarball would pass the wait on its first poll and then fail at `install`,
which is the incident again, now with a log line saying "the registry serves".

Evidence, from the npm bundled in the node v26.6.0 toolchain:

- `lib/commands/view.js` line 40 and line 136: `fullMetadata: true`.
- `node_modules/pacote/lib/registry.js` line 15: `corgiDoc =
  'application/vnd.npm.install-v1+json; ...'`, line 16: `fullDoc =
  'application/json'`, line 74: `accept: this.fullMetadata ? fullDoc :
  corgiDoc`. Install does not set `fullMetadata`, so it sends the corgi header.
- `lib/commands/cache.js` lines 173-182: `npm cache add <spec>` first calls
  `pacote.tarball.stream(spec, ..., flatOptions)`, which is the install path
  (corgi packument, then the tarball bytes, integrity checked), and only then
  a full-metadata manifest.

The work history already names this as open ("It does not establish that
served by npm view implies installable"). The incident does not distinguish the
two: `run_step` sends install's output to /dev/null, so the CI log of run
35839356656 never showed whether the install failed with ETARGET (metadata) or
a tarball 404. I could not observe a real propagation window from here, so the
size of the gap is not measured; the gap itself is a fact of npm's source.

Why it matters. It is the same shape CLAUDE.md keeps paying for: a guard whose
condition does not test the property that matters. The property that matters is
"the install step will succeed", and the probe reads something adjacent to it.

Fix (small, measured here). Make the poll the install's own request path:

    npm cache add "$NAME@$VERSION" --cache "$wait_cache"

Measured against the real registry from a clean scratch directory, npm 11.18.0:
`npm cache add @tiphys/kernel@0.2.0` exit 0; `npm cache add
@tiphys/kernel@9.9.9` exit 1 with `npm error code ETARGET` /
`npm error notarget No matching version found for @tiphys/kernel@9.9.9.`,
i.e. the same answer `npm install` gives in the committed capture. Keeping the
existing `npm view ... version` equality as a second condition costs nothing
and keeps the exact-version check. Optionally require two consecutive
successful polls to absorb a CDN edge that flaps. The stub in
test/license-gate.test.ts must then answer `cache add` from the same shared
counter (not-served answer from the captured install section, which is already
ETARGET), and a new witness member should be "poll with npm view only", red on
a stub where `view` is served before `cache add`/`install` are.

### CR-002 (low): the exact-version half of "served" is unwitnessed

Claim. The served test is exit 0 AND stdout equal to the version
("scripts/release-verify.sh" line 354 on the branch). Mutation A drops the
stdout half (`if [ "$code" -eq 0 ]; then`): all 8 release-verify tests stay
green (exit 0, 8 pass). The work history says both halves are needed, but the
only captured not-served shape exits 1, so exit code alone already decides
every tested case.

Why it matters. Criterion 1 says "the EXACT version". The equality half guards
against an npm that answers exit 0 with empty or different stdout for an
unpublished version of an existing package (older npm did print nothing and
exit 0 there). Without a witness a later simplification can remove it silently.

Fix. A stub mode whose first K `view` answers are exit 0 with empty stdout (and
one that prints a different version), asserting `attempts` equals K+1; add the
mutation as a member of the waits-for-the-registry witness.

### CR-003 (low): the poll interval is unwitnessed, so a busy loop passes

Claim. Mutation G replaces `sleep "$POLL_SECONDS"` with `:`. All 8 tests stay
green. Test 2 asserts `attempts >= 2` with no upper bound, and every run ends
well inside its time limits either way.

Why it matters. A busy loop would send hundreds of registry requests per minute
for up to 900s from a release job. Not a correctness failure, but the "bounded
and polite" property is claimed and not guarded.

Fix. In the never-served test (wait 3, poll 1), also assert `attempts <= 5`.

### CR-004 (low): on NOT SERVED the CI log does not show WHY npm said no

Claim. The distinguishing evidence (`lastStderr`, e.g. E404 versus an E401 or a
network error) is written only to the records file. The workflow's
post-publish step runs under GitHub's `bash -e`, so the `cat records.json`
after the script does not run when the script exits 75. The CI log shows only
"npm view exited 1" per poll, and every one of E404, E401, ENOTFOUND and
ETIMEDOUT exits 1.

Why it matters. A misconfigured auth line or a network fault would wait 900s
and report NOT SERVED, and the operator could not tell that from propagation
without re-running. It does not break DR-0032 (the job still fails, the tag is
still skipped).

Fix. Print the first `npm error` line of the last poll inside the NOT SERVED
message (or on each "not served yet" line). No workflow change needed.

## Criteria walk

1. **Registry mode waits until the exact version is served, then runs its
   steps unchanged.** MET (with CR-001 and CR-002 on what "served" means).
   Test `release-verify in registry mode waits until ...` green at head; red on
   the pre-fix origin/main script (run below: 3 of 4 new tests fail, the
   tarball one green, as the work history says). The steps block after
   `wait_for_registry` is byte-unchanged in the diff (the diff hunk ends before
   `# E4.3's four witnesses`). Real registry: `release-verify.sh
   @tiphys/kernel 0.2.0` exit 0, records `clean-environment 0,
   registry-served 0 attempts 1 lastStdout 0.2.0, install 0, import 0,
   bin-version 0, copy-template 0, validate-template 0`.
2. **Bounded, timeout has a distinct exit code and message.** MET. Real
   registry, `9.9.9 --wait-seconds 10 --poll-seconds 3`: exit 75 after 9s, 3
   polls, `NOT SERVED. The registry did not serve @tiphys/kernel@9.9.9 within
   10 seconds (3 poll(s), last npm view exit 1).`, records exactly
   `clean-environment`, `registry-served` with `lastStderr` carrying E404.
   `RELEASE_VERIFY_WAIT_SECONDS=0`: one poll, exit 75. Mutations B (timeout
   falls through to the steps), E (timeout exits 1) and H (unbounded loop) each
   redden the never-served test and the flags test. Residue: a single
   `npm view` that hangs is bounded by npm's own fetch timeout and retries, not
   by `--wait-seconds`, so the real ceiling is the deadline plus one npm call.
3. **Served but broken still fails at the steps.** MET. Test 3 green at head
   (exit 1, bin-version and copy-template step lines, one poll, under 15s).
   Witness member 2 of the waits witness is its dangerous-state red (verified by
   the work history's hand run; my mutation F covers the neighbouring
   "gives up early" member and reddens tests 1 and 2).
4. **Tarball mode makes no registry request.** MET. Test 4 green at head,
   zero `view` calls in the stub log. Mutation C (tarball mode also waits)
   reddens it and also the pre-existing clean-directory tarball test.
   Honest scope: the test proves no `npm view` call; the stub would also log any
   `install <name>@<version>` call, and none occurs.
5. **release.yml and its exact-string assertions unaffected; DR-0032 holds.**
   MET. `git diff --stat origin/main...HEAD -- .github` is empty. The full
   suite at head, which contains every release.yml assertion in
   test/license-gate.test.ts, is 1399 pass 0 fail. DR-0032: exit 75 is nonzero,
   the step has no `continue-on-error` (asserted by the existing test), so the
   release job fails and the `tag` job (`needs: release`) is skipped. A publish
   therefore still ends verified-and-tagged or visibly untagged.
6. **Every new test is red against the dangerous state.** MET for the
   behaviours the tests claim, with CR-002 and CR-003 as unguarded sub-
   properties. Pre-fix run and mutation table below.
7. **Suite and PR bundle green on node 26.** Suite MET: `npm ci` exit 0,
   `npm run build` exit 0, `git status --porcelain` afterwards shows only this
   untracked report, `npm test` exit 0: 1399 tests, 1399 pass, 0 fail, 0
   skipped, 0 cancelled, 0 todo (node v26.6.0, dist built, invocation
   `npm test`). Bundle MET:
   `./scripts/m2-exit-test.sh --no-build --bundle pr --base origin/main --head HEAD --phase claude/release-verify-waits-for-registry <scratch>`
   at 90f09fc, node v26.6.0, exit 0:
   `gates: declared 15 applicable 8 verdict 8 green 8 red 0 not-applicable 7 error 0 vacuous 0`;
   suite `reported 1399 test(s) ... pass 1399, fail 0, skipped 0`;
   citations green, `linted 3 changed document(s) ... 3 citation(s) resolved`
   (applicable here, unlike the work history's run at 319b55c, because the
   branch now changes delivery/decisions, delivery/tuition and STATE.md);
   `required gate(s) not applicable: scope, red-witness, gate-classes`, each by
   its own precondition (not a phase branch; no path under src/, bin/,
   plugin/); `m2-assert (PR bundle): OK ... zero red; zero error; zero
   vacuous`; `m2-green: OK`. So this bundle is not evidence that scope,
   red-witness or gate-classes asserted anything about this change.

### The two extra questions

- **900s default versus the release job.** Compatible. `grep -n timeout
  .github/workflows/release.yml` finds nothing, so no step or job
  `timeout-minutes` exists and GitHub's 360-minute job default applies. 900s
  plus the install steps is well inside it. The post-publish step needs no
  OIDC token, so token lifetime is not a constraint. One note: the job holds
  `id-token: write` for up to 15 extra minutes, which is harmless.
- **Listing shown but tarball not fetchable.** Real, and slightly wider than
  the work history states: not only the tarball but also the abbreviated
  packument that install reads is a different response from the one `npm view`
  reads. See CR-001 for the evidence and the fix.

## Mutation table (lab copy, node v26.6.0, pattern `release-verify`, 8 tests)

| id | mutation | exit | red tests |
|---|---|---|---|
| 0 | none (head control) | 0 | none, 8 pass |
| A | served = exit 0 only | 0 | **none (CR-002)** |
| B | timeout falls through to steps | 1 | never-served, flags |
| C | tarball mode also waits | 1 | clean-directory tarball, tarball-no-poll |
| D | `--wait-seconds` ignored | 1 | flags |
| E | timeout exits 1 | 1 | never-served, flags |
| F | poll once then proceed | 1 | waits, never-served |
| G | no sleep between polls | 0 | **none (CR-003)** |
| H | no deadline | 1 | never-served, flags |
| I | `--poll-seconds` any value accepted | 1 | flags |

The lab copy was restored and compared byte-identical to the head script
afterwards (`restored, identical: true`).

Pre-fix script (origin/main) against the four behaviour tests, TAP reporter so
no glyphs to transliterate: `not ok 1` waits, `not ok 2` never-served,
`not ok 3` served-but-broken, `ok 4` tarball; tests 4 pass 1 fail 3, exit 1.
This matches the work history's own red table.

## Probes run

- Diff read in full; scripts/release-verify.sh read in full at head.
- behaviors.json: all five new names map to titles present exactly once as
  `test("<title>"` in test/license-gate.test.ts.
- `node scripts/check-authored-bytes.mjs`: exit 0.
- `node scripts/check-id-collisions.mjs`: exit 0, highest T-045 and DR-0052,
  no collisions. `A-15`: `git log --all -S'A-15'` finds only this branch's
  commit 27ac51f; A-14 is taken by DR-0051, so A-15 is the next id. Found
  nothing wrong.
- Scope: not a phase branch (branch name does not match
  `^claude/m[0-9]+-p[0-9]+-`), so there is no declaration and the scope gate is
  not applicable by its precondition. Every changed file serves the fix:
  script, its test, behaviors, two witness specs, one capture, work history,
  DR-0052, T-045 and the A-15 entry in STATE.md. Nothing extraneous.
- Blast radius: scripts/release-verify.sh is consumed by release.yml (two
  steps, one tarball, one registry) and by test/license-gate.test.ts. The
  tarball arm is unchanged in behaviour (mutation C proves it is guarded). The
  two refusal tests now pass `RELEASE_VERIFY_WAIT_SECONDS=0`; they refuse
  before the wait, so this changes nothing at head.
- The capture file: real npm output, headed as such; the test stub reads exit
  code and stderr from it rather than typing them (red-witness rule,
  CLAUDE.md:345).
- Real-registry runs of the script (0.2.0 served, 9.9.9 never served, wait 0).
- `npm view @tiphys/kernel@9.9.9 version` exit 1 on npm 11.18.0, confirming the
  capture's shape today.
- DR-0052 decision 2 (do not re-run the release run) checked against
  release.yml: a re-run repeats `npm publish`, which is refused for an existing
  version. Sound.
- A-15 instructions: annotated tag at `cb5de0d`, which the DR says is the
  `gitHead` npm records. I did not re-read the registry's `gitHead` field.
- Citation convention: the work history cites `scripts/release-verify.sh:341`
  etc. on its own branch, where the line numbers are correct for the head
  (checked `wait_for_registry` at 341 and the call at 409-410). The coverage
  list it cites, src/gates/red-witness.ts:164, is byte-identical on both sides.

## Honest failures (not checked here)

- The real propagation window. I cannot publish, so CR-001's gap is shown from
  npm's source and not measured as a time interval.
- The release workflow itself, the macOS smoke job, and CI on the pushed head.
- The stored-witness gate evaluation (`red-witness` is not applicable on this
  branch by its precondition); my mutation table is a hand run, like the work
  history's.
- Whether the release job's `.npmrc` placeholder token changes `npm view`'s
  answer. Inferred harmless because the same config ran the pre-existing
  registry install for 0.1.0.
