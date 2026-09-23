# Clean-room review: M5-P2, criteria contract, Opus

- Date: 2026-09-23
- PR: #207
- Branch: claude/m5-p2-intent-to-outcome
- Head reviewed: e0e411895da559f1299f9f408b20814ab60fcf85 (checked out detached)
- Merge base: e81c5e8 (origin/main at review time, unchanged during review)
- Contract: criteria
- Model family: Opus
- Method: every acceptance criterion re-executed on node v26.6.0 (the scratch
  toolchain, `node --version` checked in the same shell as each command); four
  reviewer mutations of my own, restored by copy and confirmed with `cmp`;
  blast-radius probes, including a composed brief inside a real `tiphys init`
  fleet; scope audit against the declaration; claim grep in both forms.

## Verdict: FIX-ROUND-NEEDED

| severity | count |
|---|---|
| high | 0 |
| medium | 1 |
| low | 3 |

The four criteria pass as written, and the tests are strong: my own
mutations went red, the closed key set is asserted as a set, and the rejections
run through the real validator. The medium finding is about the phase INTENT,
not a criterion. In the fleet layout the kernel itself creates, the charter is
never found. The brief then states "no charter declared", which is false there.
This is the undeclared arm that deviation (1) defends, and it is the arm real
fleets reach.

## Acceptance criteria

| id | result | evidence |
|---|---|---|
| p2-charter-reaches-brief | MET (letter) | Suite test "a composed implementer brief and a composed reviewer brief each carry the charter's exact product intent ..." passes on v26.6.0. It composes both roles through the real CLI, asserts the multi-line intent verbatim and the phase intent beside it, and checks that no line of the old intent appears in either green output after inversion. This is the strong form the brief asked for. Reviewer mutation M2 (product intent cut to its first line) turned it red, exit 1, "the exact product intent is not in the brief". See CR-001 for the real-fleet gap, which is outside this criterion's fixture. |
| p2-final-report-contract | MET | Re-executed through `node bin/tiphys.ts validate --type final-report`: shipped example exit 0. Object deleted: exit 1, `#/delivered-outcome required property delivered-outcome is missing`. Evidence key deleted: exit 1, `#/delivered-outcome/evidence required property evidence is missing`. delivered true with `evidence: []`: exit 1, `array has 0 items, fewer than the required minimum 1`. Reviewer mutation M3 (`minItems` 1 to 0 in the `then` branch) turned the registered test red, exit 1, "delivered true, evidence empty". |
| p2-no-scoring | MET | `grep -niE 'value-score\|confidence-percent\|value/token\|risk-matrix\|score\|percent\|ratio' src/commands/brief.ts` exit 1, no hits. In the schema the only hits are `$comment` prose: line 52 (this phase's text forbidding them) and line 115 (a pre-existing "ENUMERATION"). The registered test asserts the closed key set, `additionalProperties: false`, boolean `delivered`, and no number or integer type anywhere in the schema. Reviewer mutation M4 (`delivered` type changed to integer) turned it red, exit 1. Validator probes: a `score: 9` key in the object and a top-level `value-score: 9` both exit 1, "is not permitted here". |
| p2-suite | MET | `npm ci` exit 0. `npm run build` exit 0, and `git status --short` afterwards shows only this untracked report. `npm test` exit 0: tests 1400, pass 1400, fail 0, cancelled 0, skipped 0, todo 0. Conditions: node v26.6.0, `dist/` built, invocation `npm test`. |

Nothing is marked CI-deferred by the work history, and I found nothing that
needed to be.

## Findings

### CR-001 (medium): in a `tiphys init` fleet the charter is never read, and the brief says none is declared

**Claim.** `resolveProductIntent` looks for a charter only at
`<cwd>/charter.yaml` (quoted: `src/commands/brief.ts` line 154), or at
`--charter`. The composer already expects cwd to be the FLEET ROOT: it reads
the fleet warnings file from cwd, and that file lives at the fleet root
(src/brief.ts:31). But a fleet keeps its charters in a `charter/` DIRECTORY at
that root (src/fleet.ts:93), and doctor reads them there
(src/commands/doctor.ts:735). So in the kernel's own deployment layout,
composition takes the "undeclared" arm, exits 0, and writes a false
sentence into the brief.

**Evidence, executed** (scratch script `p2rev-fleet.sh`, node v26.6.0):

```
tiphys init <S>/fleet                                   -> init=0
cp templates/charter.example.yaml <S>/fleet/charter/example-service.yaml
(cd <S>/fleet) tiphys doctor | grep retention
  CHECK retention FAIL <S>/fleet/charter/example-service.yaml declares retention path delivery/work-history/, which does not exist
(cd <S>/fleet) tiphys brief compose --role implementer --phase <K>/templates/plan.example.yaml --phase-id M9-P1
  compose=0
  ## Product intent
  no charter declared: --charter was not given and <S>/fleet/charter.yaml does not exist, so this brief carries no product intent
```

Doctor finds and reads the charter by path. Brief compose, run from the same
directory, reports that no charter is declared. Nothing in the shipped roles,
README or any caller passes `--charter`. I searched `roles/`, `src/`,
`scripts/` and `plugin/` for `brief compose` callers and found none outside
tests.

**Why it matters.** The phase intent is "agents receive the charter's product
intent". The hazard stale-charter is a brief that composes green without the
declared intent. In the layout `tiphys init` creates, that happens every
time. The only signal is a sentence that names the wrong file and calls the
charter undeclared. The criterion's fixture puts `charter.yaml` in cwd, which
matches the kernel repository's own layout (repo-root `charter.yaml`, used by
check-dual-review) and not a fleet's. So the tests are green for the one
layout that works. M5-P6's scale-out on an existing project is the next place
this would be relied on.

**Judgment on deviation (1).** On its own, exit 0 with a stated absence is
defensible: the plan says "a declared charter". Doctor also treats an empty
`charter/` as WARN. What I cannot accept is the definition of "declared". A
fleet whose `charter/` holds a `kind: charter` document HAS declared a
charter, by the kernel's own convention.

**Fix.** When `--charter` is not given, look in cwd's `charter/` too, using the
same rule doctor uses (YAML files with `kind: charter`). Exactly one: read
it. More than one: refuse unless `--charter` picks one. YAML present but none
of it `kind: charter`: refuse, because that matches doctor's
retention-undeclared state. Only an absent or YAML-free `charter/` together with
no `charter.yaml` counts as undeclared. Add a witness that composes from an
`init` fleet with the charter in `charter/`. Also state in the sentence which
places were searched. If the orchestrator prefers to keep the lookup narrow,
the smaller fix is that the undeclared arm refuses whenever `charter/` holds a
`kind: charter` document. That changes a false green into a loud red.

### CR-002 (low): roles/README.md's Composition section no longer describes the composed brief

**Claim.** The shipped `roles/README.md` (near line 111) lists the composed
brief's contents "in order" and gives the usage line. After this change it
omits the new `# Intent` section and the `--charter` flag. The file is not
on the declaration, so the implementer could not fix it in scope.

**Fix.** Either add `roles/README.md` to the declaration (additions are
allowed and are printed by name) and update the paragraph, or record the
drift for M5-P3, which also edits roles/.

### CR-003 (low): the implementer paragraph assigns the delivered-outcome object to a document the implementer does not write

**Claim.** The new paragraph in `roles/implementer.md` (near line 453) says
"This is the `delivered-outcome` object the final report requires". The
implementer's declared output is `work-history` (its frontmatter `outputs`).
The final report is an output of the orchestrator (`AGENTS.md` frontmatter:
`outputs: decision-record, final-report`), and `AGENTS.md` got no matching
instruction. The schema forces the orchestrator to fill the object anyway,
because `final-report.schema.json` is on its mandated reading and the field
is required. So nothing is lost mechanically. But the implementer brief can
be read as "put this object in your work history", and the work-history
schema would refuse it.

**Fix.** Reword it as: "your report states this answer, and the orchestrator
carries it into the final report's `delivered-outcome` object". Optionally
add one sentence to AGENTS.md under a later phase, since AGENTS.md is not on
this declaration.

### CR-004 (low): delivery/plan/m5-conflict-pre-pass.md, mandated by the M5 briefs, does not exist

**Claim.** `git ls-tree -r --name-only origin/main | grep -i pre-pass` lists
m2, m3, m3-p7-p8 and m4 pre-passes, and no m5 file. The implementer recorded
this and used the plan's `conflicts-with: [M5-P3]` instead, which is correct
for this phase (`parallelizable: false`). This is not a defect of the PR. It
is an orchestrator paperwork gap. It matters because CLAUDE.md rule 5 requires
the pre-pass to be written down before any concurrent dispatch.

## Declared deviations

1. No charter declared: exit 0 with an explicit sentence. Acceptable as a
   stance, not acceptable with the current definition of "declared". See
   CR-001.
2. delivery/evidence/m3-exit-test/e1/e1-9/final-report.yaml no longer
   validates. I reproduced exit 1. I searched for readers with
   `git grep -n "e1-9\|E1\.9\|m3-exit-test/e1" -- src scripts test bin .github plugin`.
   The only hit is a comment in `test/single-family-exception.test.ts` about
   e1-7, not e1-9. No code consumer exists, and the suite is green. Leaving it
   as a record is correct: rewriting it would falsify the E1.9 validity record,
   and the plan's migration clause says reports are records. ACCEPTED.
3. The charter path in the brief is absolute when defaulted. Composed briefs
   are not compared anywhere. brief-drift compares generated gate rows in role
   files, and `node scripts/check-brief-drift.mjs --check` exits 0 at this
   head. With `--charter <relative>` the printed path is relative as given,
   which is consistent with how `--phase` is resolved (against process cwd,
   quoted `src/commands/brief.ts` line 331). ACCEPTED.

## Blast radius

- Final-report schema consumers: `src/checks.ts` finding-parity (reads
  `inputs` and `input-findings` only), the `validate --type final-report`
  mapping, the shipped example (migrated, exit 0), the e1-9 record (deviation
  2), and the orchestrator brief's mandated reading. Stage-id mentions in
  `test/assurance-modes.test.ts` are pipeline ids, not documents. No other
  producer exists in `scripts/`, `.github/` or `plugin/` (grep, no hits).
- `tiphys brief compose` consumers: only tests (clean-room-brief,
  implementer-brief, mechanism-index, roles, brief-compose). All are green in
  the 1400-test run. When those tests compose with cwd at the kernel
  repository root, they now read the repository's own `charter.yaml`, which
  carries `product-intent` (quoted `charter.yaml` line 68), so they compose
  green.
- Role-brief validator: `validate --type role-brief` exits 0 for both
  changed roles.
- Readers of roles/*.md: `node scripts/check-brief-drift.mjs --check` exit
  0. `node scripts/check-agents-references.mjs` exit 0, "22 references
  resolved".

## Scope audit

`git diff --name-only origin/main...HEAD` lists 9 paths. Seven are the
declaration's filesToTouch. The other two are `test/behaviors.json` and
`delivery/work-history/m5-p2.md`, both standing extras. The declaration file
is unchanged on the branch, so no added entry needs sign-off. I could not run
the scope GATE here: my worktree is detached, and the phase branch is checked
out in the implementer's worktree, so the gate's precondition
(`branch HEAD does not match`) was unmet. The manual audit above stands in for
it, and CI's `pull_request` run is the authority.

## Probes run

1. `npm ci` 0, `npm run build` 0, clean status, `npm test` 1400/1400/0 fail/0
   skipped (v26.6.0, dist built).
2. Criterion p2-final-report-contract through the CLI, plus six extra
   perturbations, each exit 1: string `"true"`, whitespace evidence entry,
   null evidence, blank phase-intent, inner `score`, top-level `value-score`.
   delivered false with an empty list: exit 0, as designed.
3. Reviewer mutations. Each one was checked as applied (`cmp` differs), then
   restored (`cmp` equal, printed RESTORED):
   - M1: any unreadable declared charter treated as undeclared. The
     fails-closed test went red, exit 1, "(implementer) composed".
   - M2: product intent truncated to its first line. The reaches-brief test
     went red, exit 1.
   - M3: `then` minItems 0. The final-report-contract test went red, exit 1.
   - M4: `delivered` typed integer. The closed-key test went red, exit 1.
4. All six new test/behaviors.json names resolve to exact test titles, checked
   by a script matching `test("<description>",` in the two test files.
5. `node scripts/check-authored-bytes.mjs` exit 0.
6. `git merge-tree --write-tree origin/main HEAD` exit 0, tree 3419795.
7. Claim grep over delivery/work-history/m5-p2.md: zero hits in both the
   line-based and wrap-insensitive forms.
8. Local PR bundle (`scripts/m2-exit-test.sh --bundle pr --phase m5-p2
   --no-build`): `declared 15 applicable 8 verdict 8 green 8 red 0
   not-applicable 7 error 0 vacuous 0`, exit 1. The only unmet expectation was
   scope not applicable because my HEAD is detached (see Scope audit). The
   red-witness gate was green, "4 witness(es) evaluated". Citations were not
   applicable (no citation-required path changed).
9. Example evidence checked. The phase-intent matches
   delivery/plan/kernel-plan-m3.md:2321 verbatim. The cited round-8
   verification line is a real verdict table, and both named root files exist.
10. Fail-closed edge cases, by reading: `--charter ""` reaches
    `readOperatorPath("")` and is refused as absent. A directory at
    `charter.yaml` is classified irregular and refused. No finding.
11. The fleet-layout probe that produced CR-001.

## Honest failures (not checked here)

- The scope gate itself did not run on the real branch name (see above).
- I did not read the CI conclusion for this head. The container's git
  isolation guard refused my REST probe command. That is the orchestrator's
  observation to make.
- I did not audit the M5-P3 collision beyond confirming that the reviewer
  paragraph is a separate paragraph before the first clause heading.
