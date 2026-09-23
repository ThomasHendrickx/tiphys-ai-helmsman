# Delta verification, M5-P4 fix round 1 (opus)

- Date: 2026-09-23
- PR: #209, branch `claude/m5-p4-ci-truth`
- Head verified: bbc53a4913949c94daf36519a1ad0e8bfe3dc904
- Previous head reviewed: 602cc6d
- Merge base: e81c5e8. origin/main is now cb5de0d (#208, a version bump).
- Inputs: my criteria review (delivery/review/clean-room-M5-P4-opus-criteria.md,
  byte-identical to the file I wrote; checked with `cmp`) and the work
  history section "Fix round 1" in `delivery/work-history/m5-p4.md`.
- Model family: opus
- Method:
  - Checked out the head detached in my isolated worktree.
  - Used Node v26.6.0, checked with `node --version` in every script shell.
  - Ran mutations in a separate detached lab worktree at bbc53a4
    (lab2). Each mutation was restored from an in-memory copy of the
    original, and `git status --porcelain` in lab2 was empty afterwards.
  - Ran the PR bundle in a scratch clone where branch
    `claude/m5-p4-ci-truth` is checked out at bbc53a4, because the scope gate
    needs the phase branch name.

## Verdict

APPROVE. High 0, medium 0, low 2 (CR-V1 and CR-V2). Both are optional.

- CR-001 is closed. The harness now derives the shell the runner actually
  uses. My original pipe-to-`cat` mutant on the real gates.yml is now red.
- CR-002 is closed. A glob in either upload path is now refused by name.
- CR-003 is closed. The CLAUDE.md edit matches the real artifact.
- The fix round introduced no regression. The suite, the PR bundle and CI
  are green at bbc53a4, and one flake is disclosed below.

## 0. Fix-round contract, item 3 first (what the derivation did NOT cover)

The work history's not-covered list names five regions. I probed each one.

| region the implementer excluded | my probe | result |
|---|---|---|
| nested test directories | `find test -mindepth 2 -name '*.ts' -not -path '*/fixtures/*'` | no output. Nothing was missed. |
| `scripts/` and `src/` | `grep -rnE '"(ba)?sh", \["-c"\|/bin/(ba)?sh\|execSync\(' scripts src bin` | three hits: scripts/check-retirement-inventory.mjs:376 (runs inventory `verified-by` commands), and src/gates/suite.ts:886 and src/gates/suite.ts:1103 (run the npm `test` script as npm does). None runs workflow `run:` text. |
| other spellings (`sh`, `/bin/bash`) | `grep -rnE 'spawnSync\("(sh\|/bin/bash\|/bin/sh)"' test/*.ts` | 10 hits, in credentials-gate, cutover, pool, spawn and suite-gate. I read each: all run `command -v`, a `grep` contract, or `package.json`'s test script. None runs workflow step text. |
| macos-smoke.yml and release.yml | not probed as harness targets | no test executes them. This agrees with the implementer. |
| the runner default | the implementer did not re-read the CI log | I read it: run 35834743824, id-collision step, `shell: /usr/bin/bash -e {0}`. |

So the not-covered section is honest, and my probes of its excluded regions
found no missed instance.

## 1. CR-001 (was medium): CLOSED

`runnerShell` is in `test/authored-bytes.test.ts`, which the branch changes,
so it is quoted. It takes the shell from the step's `shell:`, else the job's
`defaults.run.shell`, else the workflow's. That precedence matches GitHub's
own rule (step, then job defaults, then workflow defaults).

- No shell set: `bash -e`.
- `bash`: `bash --noprofile --norc -eo pipefail`.
- Anything else throws, and so does a `runs-on` that is not `ubuntu-*`.
- The `run:` text is written to a file and run as `{0}`.

**The model is right.** GitHub's Linux defaults are: unspecified is
`bash -e {0}`, and `shell: bash` is `bash --noprofile --norc -eo pipefail {0}`.
The first half is confirmed by the CI log above. The second half matches the
GitHub Actions documentation. No workflow in this repository sets `shell:`,
so I could not observe it on a real run. Custom templates (`bash {0}`), `sh`,
`pwsh` and `python` are refused rather than modelled, which is the safe
choice.

Mutations on the REAL `.github/workflows/gates.yml`, run in lab2 against the
named test (`extracted from the gates job`):

| mutant | expected | result |
|---|---|---|
| control (no change) | green | green, exit 0 |
| A: id-collision `run:` piped to `cat` (my original CR-001 mutant) | red | **RED**, `the scripts/check-id-collisions.mjs step exited 0 on the deliberate violation` |
| B: authored-bytes `run:` piped to `cat` | red | **RED**, same message for that step |
| B2: authored-bytes `run:` piped to `tee /dev/null` | red | **RED** |
| C: step-level `shell: bash`, plus the `cat` pipe | step is wired (pipefail) | test RED, see CR-V1 |
| D: job-level `defaults.run.shell: bash`, plus the `cat` pipe | step is wired | test RED, see CR-V1 |
| E: workflow-level `defaults.run.shell: bash`, plus the `cat` pipe | step is wired | test RED, see CR-V1 |
| E2: workflow default `bash` with step `shell: sh` overriding it | refused | **RED**, `the step shell "sh" is not one this harness models` (so step beats workflow) |
| F: step `shell: sh` | refused | **RED**, same message |
| G: step `shell: bash {0}` (custom template) | refused | **RED**, `the step shell "bash {0}" is not one this harness models` |
| H2: multi-line `run:` with `\|\| echo ignored` on the check line, then `echo done` | red | **RED**, `exited 0 on the deliberate violation` |
| J: test mutant, default shell given pipefail | red | **RED** at the in-test pipe-to-`cat` assertion |
| J2: test mutant, `bash` given plain `-e` | red | **RED** at the `step shell: bash` assertion |

For C, D and E, the harness itself decides correctly. The test's own positive
cases (`pipedStepBash`, `pipedJobBash`) prove it: a pipe under `shell: bash`
is reported as wired, and the whole file is green at head. The test goes red
on my mutants for a different reason, which is CR-V1 below.

One mutant (H, a multi-line `run:` whose first line is the failing check) was
refused by the test's text precondition (`the workflow no longer carries run:
node scripts/check-id-collisions.mjs`), so it says nothing about the harness.
The shell half of that case is trivial (`bash -e` on `false`, then
`echo done`, exits 1), so it is not worth a finding.

## 2. CR-002 (was low): CLOSED

Any upload `path` line containing `* ? [ ] { } !` is now refused, after the
`${{ runner.temp }}` expression is removed. Resolution still runs as before.
Mutations on the REAL gates.yml, named test `uploads exactly the bundle`:

| mutant | result |
|---|---|
| control | green |
| K: push `main-bundle/*.json` (was GREEN at 602cc6d) | **RED**, `push: ... carries a glob character, and only a literal file path is allowed` |
| K2: push `main-bundle/summary.json*` (was GREEN at 602cc6d) | **RED**, same message |
| K3: push `main-bundle/summary.[j]son` (a new shape) | **RED**, glob message plus `the upload resolves to []` |
| L: pr `pr-bundle/summ?ry.json` | **RED**, now through the glob refusal, not only the text pin |
| L2: pr `pr-bundle/*.json` | **RED**, glob refusal |
| M: test mutant, refusal regex never matches | **RED**, `the push main-bundle/*.json glob was not refused` |

Both arms are now guarded by the same mechanism. The pr arm's text-pin
precondition is still there, and now there is a matching `pushPath` pin.

## 3. CR-003 (was low): CLOSED

The CLAUDE.md edit sits in the section "A green BUNDLE is not evidence ...".
I checked every factual claim in the new lead-in against the real artifact
from run 35834743824, which I downloaded in the first review (HTTP 200):

| claim in CLAUDE.md | real artifact | match |
|---|---|---|
| pull_request artifact `gates-summary-pull-request-attempt-<n>` | `gates-summary-pull-request-attempt-1` | yes |
| push artifact `gates-summary-push-attempt-<n>` | matches `.github/workflows/gates.yml`; not observable before merge | yes, by text |
| exactly ONE file, the bundle summary | zip holds one entry, `summary.json`, 11788 bytes | yes |
| 7-day retention | created 2026-09-23T08:09:28Z, expires 2026-09-30T08:09:27Z | yes |
| row fields `status`, `units`, `applicable`, `vacuous` in `gates[]` | row keys: applicable, declaredNotApplicable, detail, id, record, status, stderr, stdout, unitLabel, units, vacuous | yes |
| guarded by `test/gate-registry.test.ts:2086` | line 2086 at bbc53a4 is that test's `test(` title line | yes |

Nothing else in CLAUDE.md changed:

- `git diff --stat e81c5e8 bbc53a4 -- CLAUDE.md` gives 26 insertions and 4
  deletions, all inside that section (read in full).
- origin/main's own change since the merge base (cb5de0d) does not touch
  CLAUDE.md. Its diff stat lists a decision record, `package.json`,
  `package-lock.json`, `plugin/package.json` and one JSON row.
- `node scripts/render-agent-rules-gates.mjs --check` exits 0
  (`green (24 rendered gate rows compared)`).

The list of cases where the old four-fact procedure still applies gives
three: artifact expired, run cancelled before its upload step, head from
before M5-P4. It omits a fourth (CR-V2): a run that failed before the bundle
step. The upload step then runs under `!cancelled()`, finds no file, and warns
(`if-no-files-found: warn`). But then there is no bundle for the four-fact
procedure to read either, so the omission misleads nobody.

## 4. Declaration entries and the new inventory row

- `delivery/plan/phase-declarations/m5-p4.json` now adds, at head,
  `delivery/plan/cutover/retirement-inventory.json` (accepted in my first
  review) and `CLAUDE.md`.
  - ACCEPT `CLAUDE.md`. CR-003 needed it, it is additive only, and the change
    stays inside one section.
  - The plan's files-to-touch lists neither entry. The arbitration should
    record both.
- The new row is `claude-md:updated-by-m5-p4-summary-json-is-now-uploaded-so`:
  - rule `CLAUDE.md:628`, and `grep -n 'IS NOW UPLOADED' CLAUDE.md` gives
    line 628;
  - kind `bold-lead`, status GAP, disposition KEEP, the same as the section's
    four-fact rows;
  - its `verified-by` command re-executed gives a zero count in each of the
    three files (AGENTS.md, the implementer role brief and the clean-room
    checklist), exit 1, as recorded.
  - `node scripts/check-retirement-inventory.mjs` gives
    `308 row(s) against 308 derived rule anchor(s), 1 retired, commands
    EXECUTED` and `every rule in the three roots is resolved`, exit 0.
  - GAP/KEEP is the right call. The artifact names and retention belong to
    this repository's CI, not to the kernel.

## 5. The six out-of-scope `bash -c` sites

The implementer says these six sites differ from the runner only on errexit,
and that the difference changes no result today. That was a reading. I
executed it: at each site, in lab2, I swapped `bash -c` for `bash -e -c` (the
runner's errexit semantics). I ran every test that uses the site under both
shells, then restored the file.

| site | tests exercised | `bash -c` | `bash -e -c` |
|---|---|---|---|
| `test/gate-registry.test.ts:894` (drift evaluator, 2 callers; quoted because the branch changes this file) | 2 | 2 pass, exit 0 | 2 pass, exit 0 |
| test/agents-policy.test.ts:977 | 1 | 1 pass | 1 pass |
| test/implementer-brief.test.ts:1182 | 1 | 1 pass | 1 pass |
| test/exit-test-local.test.ts:667 (M1 falsifiability guard) | 1 | 1 pass | 1 pass |
| test/m2-exit-test.test.ts:642 (M2 self-test guard) | 1 | 1 pass | 1 pass |
| test/gates.test.ts:1331 and test/gates.test.ts:1335 (push bundle step) | 1 | 1 pass, 0 skipped (with dist) | 1 pass, 0 skipped (with dist) |

The gates.test site skips itself without `dist/`. On the first attempt it
reported `skipped 1` under both shells, which proved nothing. I then linked
`dist/` into lab2 and re-ran it: 0 skipped both ways.

On pipefail the implementer is right too. `bash -c` has no pipefail, the same
as the runner default, so these sites cannot carry CR-001's
over-strict-harness shape. None of the six changes a result today, and the
residue is honestly described as unproven for future multi-line steps.

## Findings

### CR-V1 (low): the in-test pipe-to-`cat` defang assumes the real workflow keeps the runner's default shell

**Claim.** The fourth defang in `test/authored-bytes.test.ts` appends a pipe
to `cat` to the REAL workflow's run line and asserts that the harness reports
`exited 0 on the deliberate violation`. That only holds while the real step
has no `shell: bash` anywhere in its precedence chain. Suppose someone adds
`shell: bash` to the step, the job defaults or the workflow defaults. That is
a legitimate change which makes the steps STRICTER. The test then goes red,
with a message saying the pipe was not detected as a defang (my mutants C, D
and E).

**Why it matters.** It fails closed, so no weakened step can pass. The risk
is a confusing red that invites someone to "fix" the harness instead of the
test.

**Fix, optional.** Branch the in-test expectation on the derived shell:
expect the defect under `bash -e`, and none under pipefail. Or state the
assumption in the assertion message.

### CR-V2 (low): the CLAUDE.md fallback list omits "the run failed before the bundle step"

See item 3. It is cosmetic, because such a run has no bundle to read at all.
Fix, optional: add it as a fourth case.

## 6. Suite and PR bundle

All runs used Node v26.6.0 at bbc53a4.

| run | result |
|---|---|
| `npm ci` in my worktree | exit 0 |
| `npm run build`, then `git status --porcelain` | exit 0; only my untracked report |
| `npm test`, dist built | exit 0; tests 1400, pass 1400, fail 0, cancelled 0, skipped 0; status unchanged afterwards |
| PR bundle, FIRST attempt (in the scratch clone, run concurrently with the `npm test` above) | exit 1: `suite` red on ONE test, see below |
| PR bundle, SECOND attempt (same clone, nothing else running) | exit 0 |
| CI, pull_request run 35840811756, head_sha bbc53a4 | gates success, macos-smoke success; artifact `gates-summary-pull-request-attempt-1` (id 10741996171) uploaded, expiring 2026-09-30 |

Second attempt, verbatim:

```
gates: declared 15 applicable 9 verdict 9 green 9 red 0 not-applicable 6 error 0 vacuous 0
gates: required gate(s) not applicable: citations, red-witness
m2-assert (PR bundle): OK. 15 gate record(s) match section 1.4; derived from 15 manifest id(s), 15 bundle row id(s) and 13 table row id(s); 15 gate(s) asserted (13 from an explicit table row, 2 under the default required-green: brief-drift, typecheck); 0 asserted absent; counts re-derived and equal to summary.json; zero red; zero error; zero vacuous.
```

Its suite gate reported `1400 test(s) from 69 file(s) (pass 1400, fail 0,
skipped 0, todo 0, did-not-run 0)`. Its scope gate was green over 14 paths
and named both amendments.

**The first-attempt red, disclosed rather than averaged away.** The one
failing test was `a precondition command exiting nonzero is error, not a
skip, whenever a path-shaped argv element cannot be opened: unreadable,
after an option, or carrying whitespace` (test/gates.test.ts).

- The fail event carries no message: `failureType: testCodeFailure`.
- Run alone at bbc53a4 it passes, both in the scratch clone and in my
  worktree (1 test, 1 pass, exit 0 each).
- It passes in the second bundle, in my `npm test`, and in CI.
- The fix round changes nothing that test touches. The branch diff since
  602cc6d is two test files, CLAUDE.md, the declaration, the inventory and
  delivery documents. None of them is src/ or test/gates.test.ts.

My reading is contention, not a defect. During that attempt two full suites
ran at once on 4 CPUs (`npm test` took 1337 s, against 464 s alone), and
`npm ci` rewrote the node_modules the clone links to during the clone's
build. I did not establish the cause, so this is an open item for whoever
next sees that test fail, not a finding against this branch.

## Probes run

- Item 3 of the fix-round contract: every excluded region probed (section 0).
- 21 runs on the CI-step and upload harnesses (sections 1 and 2):
  - 2 controls, both green;
  - 15 mutants red as expected (A, B, B2, E2, F, G, H2, J, J2, K, K2, K3, L,
    L2, M);
  - 3 red for the CR-V1 reason (C, D, E);
  - 1 refused by the text precondition (H), which is uninformative.
  - lab2's `git status --porcelain` was empty after restore.
- The six `bash -c` sites were run under `bash -c` and `bash -e -c`: same
  result at all six (section 5).
- CLAUDE.md claims checked against the real artifact; render `--check`
  exit 0 (section 3).
- The inventory row's `verified-by` re-executed; check-retirement-inventory
  exit 0 (section 4).
- check-authored-bytes exit 0; check-id-collisions exit 0 (next free T-045 /
  DR-0052).
- CI check runs and artifact listing for head bbc53a4.

## Honest failures

- `shell: bash` mapping to `-eo pipefail` is taken from the GitHub
  documentation. It is not observed on a real run, because no workflow here
  sets `shell:`.
- The push-arm artifact and both new steps on the push event are observable
  only after merge (T-009 rule 1).
- The first-attempt bundle flake is unexplained (section 6).
- I did not re-run the implementer's W9, W9b, W9c and W10 witnesses
  verbatim. My J, J2, K to M and A to B mutants cover the same states
  independently.
