# m6-close-fix: work history

Branch `m6-close-fix`, base `5a3968e`. A pull request whose branch and title
name no phase now gets a `--phase` the kernel can record a review for.
Toolchain for every run below: node v26.6.0, npm 11.18.0.

## The defect and the mechanism

Finding: PR #235 (branch `claude/upbeat-gates-w3cm5m`, title without a leading
`Mn-Pn:`) ran the gates with `--phase claude/upbeat-gates-w3cm5m`, and
merge-preconditions stayed red because `tiphys review dispatch` refuses that
phase (src/review.ts:505) and the review record schema refuses it too
(schemas/review-record.schema.json:34, `^[a-z0-9][a-z0-9-]*$`).

Mechanism: a phase id taken from free text (the branch name) without checking
it against the grammar the consumer enforces.

## The change

`.github/workflows/gates.yml`, step "Gates (pull request)", else arm only: the
branch name is lowercased and every byte outside `[a-z0-9-]` becomes `-`
(`LC_ALL=C tr`, so the mapping is per byte). If the result does not match
`^[a-z0-9][a-z0-9-]*$` the step prints an `::error::` line and exits 1. The
phase-branch arm and the title arm are unchanged; the branch still reaches the
shell only through `env:`. The step comment says what the else arm does.

The step's derivation run directly (the `run:` text up to the runner call,
extracted with sed into a scratch script, then `bash -eo pipefail`):

```
phase=claude-upbeat-gates-w3cm5m
branch=claude/upbeat-gates-w3cm5m exit=0
phase=close-out-m6-final
branch=Close-Out.M6_final exit=0
::error::branch _close-out gives --phase '-close-out', not a phase id a review can be recorded for
branch=_close-out exit=1
phase=m6-p5
branch=claude/m6-p5-x exit=0
```

## Tests

test/gate-registry.test.ts:

- `the pull-request gates step takes --phase from a phase branch, ...` (row
  `m6-p5-phase-from-pr-title`, name unchanged): its two non-phase cases and
  its title-arm-removed assertion now expect `claude-upbeat-gates-w3cm5m`.
- NEW `a pull request whose branch and title name no phase gets a --phase in
  the kernel's review phase grammar` (row
  `gates-workflow-non-phase-pr-phase-grammar`, appended to
  test/behaviors.json). It runs the real step text (`pullRequestStepPhase`)
  and checks the derived phase against the `phase` pattern READ from
  schemas/review-record.schema.json, over `claude/upbeat-gates-w3cm5m` (a `/`)
  and `Close-Out.M6_final` (uppercase, `.`, `_`), and checks that
  `_close-out` (maps to a leading `-`) exits nonzero with no runner call
  (no `STUB-ARGV` line in the step's output; the direct run above shows
  `branch=_close-out exit=1` and no `phase=` line, and the GREEN run below
  passes that check). It collects every failing case so a red run names
  each one.
- `the gates workflow runs the registry runner directly on both CI events
  ...` (existing, name unchanged): its harness `registryStepDefects` ran the
  step's `run:` text without the step's `env:`, so `HEAD_REF` was empty. The
  old else arm passed `--phase ""` and the step exited 0; the new else arm
  exits 1 on an empty phase, and the test went red in the first full suite
  run (1247 tests, 1246 pass, 1 fail):

  ```
  test at test/gate-registry.test.ts:1397:1
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + [
  +   'pull_request: the gates step failed over a runner that exited 0: '
  + ]
  - []
  ```

  The harness now applies the step's `env:` too, with each `${{ }}` replaced
  by `fixture` as in `run:`, so the step runs as the runner runs it
  (`HEAD_REF=fixture` gives `--phase fixture`). No assertion changed.

## Red and green

RED, on the step text at base 5a3968e (`git diff --quiet --
.github/workflows/gates.yml` exit 0 before the run, so the workflow file was
the base commit's), with the new and updated tests in place:

```
node --test --test-reporter=tap --test-name-pattern="no phase gets a --phase in the kernel's review phase grammar|takes --phase from a phase branch" test/gate-registry.test.ts
exit=1
not ok 1 - the pull-request gates step takes --phase from a phase branch, else from the title's leading Mn-Pn: lowercased, else the branch name, and the title's shell syntax runs nothing
not ok 2 - a pull request whose branch and title name no phase gets a --phase in the kernel's review phase grammar
# tests 2
# pass 0
# fail 2
# cancelled 0
# skipped 0
```

The new test reddened on all three members, each named in its failure:

```
branch claude/upbeat-gates-w3cm5m: --phase "claude/upbeat-gates-w3cm5m" is outside the review record's ^[a-z0-9][a-z0-9-]*$ (exit 0
branch Close-Out.M6_final: --phase "Close-Out.M6_final" is outside the review record's ^[a-z0-9][a-z0-9-]*$ (exit 0
branch _close-out: the step passed --phase "_close-out" instead of exiting nonzero (exit 0
```

GREEN, same command on the changed step:

```
exit=0
ok 1 - the pull-request gates step takes --phase from a phase branch, else from the title's leading Mn-Pn: lowercased, else the branch name, and the title's shell syntax runs nothing
ok 2 - a pull request whose branch and title name no phase gets a --phase in the kernel's review phase grammar
# tests 2
# pass 2
# fail 0
# cancelled 0
# skipped 0
```

Whole file after the harness fix (`node --test --test-reporter=tap
test/gate-registry.test.ts`): exit 0, 22 tests, 22 pass, 0 fail, 0 skipped.

## Derivation: every place a CI step or script turns a branch or title into `--phase`

Command, run on the changed tree:

```
git grep -nE -- '--phase|HEAD_REF|head_ref|PR_TITLE|pull_request\.title|abbrev-ref HEAD|GITHUB_HEAD_REF' -- .github scripts .claude bin package.json gate-registry.yaml
```

Full output (exit 0):

```
.claude/harness/localgreen.sh:60:PHASE_ARG=$(printf '%s' "$(git rev-parse --abbrev-ref HEAD)" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')
.claude/harness/localgreen.sh:65:  --base "$(git rev-parse "$BASE")" --head "$(git rev-parse HEAD)" --phase "$PHASE_ARG" \
.claude/skills/phase-delivery/SKILL.md:185:  --phase <phase-id> --context . --result <scratch>/mp/result.json \
.claude/skills/phase-delivery/references/clean-room-brief.md:13:clean-room-reviewer --phase <plan file> --phase-id <id>` (hazard is the only
.github/workflows/gates.yml:40:      # `git rev-parse --abbrev-ref HEAD` returns the literal string "HEAD".
.github/workflows/gates.yml:48:      # (github.head_ref) puts the runner on claude/mN-pM-..., so
.github/workflows/gates.yml:49:      # `git rev-parse --abbrev-ref HEAD` returns the branch name and scope
.github/workflows/gates.yml:53:      # cross-check confirms they agree. On a push to main github.head_ref is
.github/workflows/gates.yml:59:          ref: ${{ github.head_ref }}
.github/workflows/gates.yml:76:      # --phase is derived from the source branch (lowercase, to match the
.github/workflows/gates.yml:99:          HEAD_REF: ${{ github.head_ref }}
.github/workflows/gates.yml:100:          PR_TITLE: ${{ github.event.pull_request.title }}
.github/workflows/gates.yml:102:          if [[ "$HEAD_REF" =~ ^(claude/)?(m[0-9]+-p[0-9]+) ]]; then
.github/workflows/gates.yml:104:          elif [[ "$PR_TITLE" =~ ^([Mm][0-9]+-[Pp][0-9]+): ]]; then
.github/workflows/gates.yml:107:            phase="$(printf '%s' "$HEAD_REF" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C tr -c 'a-z0-9-' '-')"
.github/workflows/gates.yml:109:              echo "::error::branch $HEAD_REF gives --phase '$phase', not a phase id a review can be recorded for"
.github/workflows/gates.yml:120:            --phase "$phase"
gate-registry.yaml:4:# on each event (plus --phase on a pull request); `--event` selects the gates
scripts/m1-exit-test.sh:528:  sandbox_default=$(git -C "${seed_clone}" rev-parse --abbrev-ref HEAD)
scripts/stub-payload.sh:96:branch=$(git rev-parse --abbrev-ref HEAD)
```

Reading of each producer:

- `.github/workflows/gates.yml:102-120`: the step this change fixes. The
  phase-branch arm yields `m[0-9]+-p[0-9]+` and the title arm yields the same
  lowercased; both are inside the grammar by their own regex (the existing
  test's cases give `m6-p5` and `m12-p34`). The else arm is the one that
  passed free text, and is now mapped and checked.
- `.claude/harness/localgreen.sh:60`: SAME MECHANISM, NOT CHANGED. On a branch
  that names no phase the `sed` leaves the branch name as it is, so the local
  green script passes e.g. `--phase claude/upbeat-gates-w3cm5m`. It is harness
  code under `.claude/`, outside this brief ("do not change anything else");
  reported to the orchestrator as an open site.
- `scripts/m1-exit-test.sh:528` and `scripts/stub-payload.sh:96` read a branch
  name for other purposes (a sandbox default branch, a report line); neither
  passes `--phase`.
- The two `.claude/skills/` hits are documentation of the flag, not code.

## What the derivation did not cover

- `src/`, `plugin/`, `adapters/`: excluded from the command above because they
  CONSUME `--phase` rather than derive it. A separate search,
  `git grep -nE 'm\[0-9\]\+-p\[0-9\]\+|abbrev-ref|head_ref|HEAD_REF|pull_request\.title|PR_TITLE' -- src bin plugin adapters`,
  returned src/commands/doctor.ts:391,424,1439, src/gates/run.ts:1309,
  src/gates/schemas/phase-declaration.schema.json:18 and src/gates/scope.ts:431.
  Read: run.ts:1309 and scope.ts:431 match the current branch against a
  pattern built from a supplied `--phase`; doctor.ts reads the branch for a
  report. None of them turns a branch into a `--phase`.
- `test/`, `sandbox/`, `lab/`, `witness/`, `delivery/`: not searched; tests and
  fixtures are not a CI step or script that produces the flag, and
  `delivery/` is paperwork.
- Other repositories that consume the kernel and write their own workflows:
  not visible from here.
- A phase passed by hand on a command line (an orchestrator or agent typing
  `--phase <x>`): no file to search.

## Results at e8b89f5

`npm run build` exit 0 (dist/ built). `npm test` exit 0, node v26.6.0,
dist/ built: 1247 tests, 1247 pass, 0 fail, 0 skipped. The reporter's
summary lines, with U+2139 replaced by `i` in 7 places and nothing else
changed:

```
i tests 1247
i suites 0
i pass 1247
i fail 0
i cancelled 0
i skipped 0
i todo 0
```

`node scripts/check-authored-bytes.mjs` on the clean tree at e8b89f5: exit 0.

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --event pull_request --evidence <scratch>/m6cf-gatesev --base origin/main --head HEAD --phase claude-upbeat-gates-w3cm5m
gates exit=1
gates: run 8fc63c04c4b54490d53a06c4
gates: registry gate-registry.yaml mode full event pull_request
gates: declared 8 applicable 6 verdict 6 green 5 red 1 not-applicable 2 error 0 vacuous 0
gates: authored-bytes: green: 1816 tracked file(s) carry no control or non-ASCII byte
gates: credential-scrub: green: no pull-request-capable credential resolvable from any of the 7 probed sources
gates: suite: green: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 1247 test(s) from 71 file(s) (pass 1247, fail 0, skipped 0, todo 0, did-not-run 0); discovered 71 file(s) walking test for .test.ts; 1163 behavior(s) resolve; merge base 4411d74ec9f5
gates: typecheck: green: tsc -b tsconfig.src.json tsconfig.test.json plugin/tsconfig.json --force --listFiles exited 0 and reported 464 distinct file(s); the unit count is those printed paths, not a constant
gates: license: green: 12 production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch m6-close-fix does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: red-witness: not-applicable: precondition red-witness-diff evaluated and unmet: no changed path under src/, bin/, plugin/
gates: 1 gate(s) reported red: merge-preconditions
```

merge-preconditions (red, expected: no review recorded yet), its detail cut
to its head and tail:

```
gates: merge-preconditions: red: DR-0063 single at head e8b89f5dc5d2c8259e96cf5f6199a48086bec10f, phase claude-upbeat-gates-w3cm5m: ... requires 1 approving hazard review, launched by the kernel, for the commit under audit e8b89f5dc5d2c8259e96cf5f6199a48086bec10f; 0 of 1 are counted and 1 missing. ...
```

The two patterns the review path enforces, checked on the old and the new
phase (the dispatch itself was not run here; it launches a reviewer):

```
node -e 'const s=require("./schemas/review-record.schema.json");const p=new RegExp(s.properties.phase.pattern);const r=/^[a-z0-9][a-z0-9-]*$/;for(const x of ["claude-upbeat-gates-w3cm5m","claude/upbeat-gates-w3cm5m"])console.log(x,"schema",p.test(x),"review.ts:505",r.test(x))'
claude-upbeat-gates-w3cm5m schema true review.ts:505 true
claude/upbeat-gates-w3cm5m schema false review.ts:505 false
```

## Claim greps

Both CLAUDE.md claim greps (line-based and wrap-insensitive) were run on this
file. The one hit (the `_close-out` sentence under Tests) now carries its
evidence; a rerun of both returned no hit (exit 1 each).
