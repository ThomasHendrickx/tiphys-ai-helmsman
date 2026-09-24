# Clean-room criteria review: hemma bootstrap onto Tiphys (M5-P6 step 3a)

Reviewer: clean-room CRITERIA reviewer, read-only. Started 2026-09-24.
Subjects: hemma PR #456 (head 8e84b4e), hemma-fleet PR #1 (head bba99ec).

Status: see end of file

## 0. Heads and clones

- hemma PR #456: `tiphys/bootstrap` at 8e84b4e464e6902bbecdc982242cd87c9cde24bd, origin/main a6141d7d, merge base a6141d7d. Head has NOT moved.
- hemma-fleet PR #1: origin/tiphys/bootstrap at bba99ec (parents 25a917f, 7efd572). Head has NOT moved.
- kernel: claude/m5-p6-scale-out-proof at a505f61 (spec source).

## Item 1. hemma diff scope

`git diff --stat origin/main...HEAD`: 14 files, 1407 insertions, 0 deletions. Files:
.github/workflows/tiphys-gates.yml (new), assurance-modes.yaml, charter.yaml,
docs/tiphys/phase-declarations/m1-p1.json, m1-p2.json, docs/tiphys/plan.yaml,
docs/work-history/2026-09-24.tiphys-bootstrap.md, gate-registry.yaml,
package-lock.json (+100), package.json (+1, the devDependency line only),
scripts/tiphys-gates/{gate-result,lint,typecheck,unit-tests}.mjs.
No application source, no prisma/ change, no migration, ci.yml untouched. PASS.

## Item 3 (part). Charter field support, spot-check (10 claims)

| claim | source checked | result |
|---|---|---|
| Node 24 in CI | ci.yml:115, :373, :759 node-version: 24 | supported |
| validate and build-and-e2e on self-hosted | ci.yml:79 [self-hosted, hemma, validate], :238 [self-hosted, hemma, build] | supported |
| auth: Resend + Google, JWT, Prisma adapter | integrations/next-auth/auth.ts:2,3,108,248 | supported |
| Decimal(10, 2), never Float for money | CLAUDE.md:157; schema has 28 Decimal(10, 2); the 6 Float fields are confidence/rates, not money | supported |
| UUID keys, hard delete only | CLAUDE.md:158, :160 | supported |
| projectId from ctx.session.user.projectId | CLAUDE.md:44 | supported |
| models Project, ProjectMember | prisma/schema.prisma:818, :1045 | supported |
| health endpoints live/ready 200 | docs/deployment.md:31, :35 | supported |
| migrations only in CI, never manual | CLAUDE.md:182-183, docs/deployment.md:7 | supported |
| 1,000 happy users; Belgian DIY | PROJECT-PURPOSE.md:381, CLAUDE.md:7 | supported |
| evidence path docs/reports/ example | docs/reports/2026-03-20.security-review.md exists | supported |

## Item 2. Lockfile, non-dev entries (own script, scratchpad/m5p6-bootreview/lockcmp.mjs)

Rule: every `packages` entry where either side lacks `dev: true` must be deep-equal; root
entry compared with devDependencies stripped; all top-level keys other than `packages` compared.
Node v26.6.0.

- origin/main vs HEAD: base 1727 entries, head 1734; non-dev differing 0; dev-only 7, all added under node_modules/@tiphys/kernel/ (kernel, ajv, json-schema-traverse, commonmark, entities, mdurl, yaml). removed none, changed none. exit 0.
- control main vs main: 0 / 0, exit 0.
- red witness, the first bootstrap lockfile b743bf9: non-dev differing 2 (node_modules/fsevents, node_modules/yaml), exit 1. So the comparison can go red on the known bad state.
- root devDependencies: only `@tiphys/kernel` added, 0.2.1 exact. `git diff` of package-lock.json has 0 removed lines.
- after `npm ci` (npm 11.18.0): hoisted yaml 2.8.4, kernel-nested yaml 2.9.0.
PASS.

## Item 3. Charter equality and validation (node v26.6.0, installed kernel 0.2.1)

- `cmp charter.yaml <fleet origin/tiphys/bootstrap:charter/hemma.yaml>` exit 0.
- `npx tiphys validate --type charter charter.yaml` exit 0; the fleet copy exit 0.
- Negative control: a copy with product-intent removed exits 1 (YAML error from my crude edit, so this control only shows the command can fail, not the schema check itself).
- `validate --type gate-registry gate-registry.yaml` exit 0; `validate --type plan docs/tiphys/plan.yaml` exit 0, `dispatchable: true`.
- Field support spot-check: see table above, 11 claims, all supported.
PASS.

## Item 4. assurance-modes.yaml

After `npm ci`: `cmp assurance-modes.yaml node_modules/@tiphys/kernel/assurance-modes.yaml` exit 0;
sha256 3aaba6da21a034c9a95d7ee19a36dffb77d985e699e4e33e7a8f6d8297b025ea (matches exit doc 1c);
also cmp-identical to the kernel branch's copy. PASS.

## Item 6 (part). Phase predicates red at the branch point

eslint JSON per file, rule counts: site-shed.service.spec.ts {no-untimed-clock-in-specs: 7}, exit 1;
oauth.spec.ts {no-untimed-clock-in-specs: 7}, exit 1. No other rule fires in either file, so
`--max-warnings 0` is reachable by clearing that one rule alone.

## Item 6. Conflict pre-pass (kernel branch a505f61, node v26.6.0)

```
$ node bin/tiphys.ts conflicts --append-only package-lock.json <hemma>/docs/tiphys/phase-declarations/m1-p1.json <hemma>/docs/tiphys/phase-declarations/m1-p2.json
append-only, union-resolved, never an overlap: package-lock.json
DISJOINT M1-P1 M1-P2
conflicts: 0 overlapping pair(s), 1 disjoint pair(s), 0 overlapping path(s)
exit 0
```
Control: both declarations plus `tests/setup.ts` -> `OVERLAP M1-P1 M1-P2 tests/setup.ts`, exit 1.
The command also schema-loads each declaration (ids M1-P1/M1-P2 accepted, so the id and branch patterns hold).
Semantic coupling judged: neither spec path is referenced by any tracked non-doc file (`git grep` hits only docs/),
so no generated manifest couples them; both share tests/setup.ts, which neither may touch.

## Item 5. Gates, run as the workflow runs them (node v26.6.0, clean env)

Environment: `env -i` with HOME, PATH (node 26 first), CI=true, proxy/CA vars, and
DATABASE_URL = DIRECT_URL = postgresql://postgres:postgres@localhost:5432/hemma_e2e (the job's env
block values). No ambient DB variable reached any command (scratchpad/m5p6-bootreview/cienv.sh).
Preflight: npm ci exit 0, prisma generate exit 0, next typegen exit 0.

PR arm on the PR head, local branch tiphys/bootstrap, `--base a6141d7 --head 8e84b4e --phase tiphys/bootstrap`:
```
gates: declared 4 applicable 3 verdict 3 green 3 red 0 not-applicable 1 error 0 vacuous 0
gates: unit-tests: green: 8540 passed, 0 failed, 14 skipped, 7 todo of 8561; 0 failed suite(s); vitest exit 0
gates: typecheck: green: 3910 project file(s) in the program, 0 error line(s); tsc exit 0
gates: lint: green: 3875 file(s), 0 error(s) (0 fatal), 795 warning(s); eslint exit 0
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch tiphys/bootstrap does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: every applicable gate is green
exit 0
```
Identical numbers to the exit doc's CI job log (1j).

Scope lab: local bare origin with main = 8e84b4e (simulated post-merge), `--base origin/main --head HEAD --only scope`,
`--phase` as the workflow's sed derives it (checked: claude/m1-p1-site-shed-frozen-clock -> m1-p1):

| run | branch | change | result |
|---|---|---|---|
| A | claude/m1-p1-site-shed-frozen-clock | declared spec only | green, 1 path audited, exit 0 |
| B | same | plus integrations/google-calendar/oauth.spec.ts | red naming that path, exit 1 |
| C | claude/m1-p1-other | declared spec | error, branch does not match declaration, exit 21 |
| D | claude/m1-p2-google-calendar-oauth-frozen-clock | spec + dated work history | green, 2 paths, exit 0 |
| E | same | plus tests/setup.ts and a new file | red naming both, exit 1 |
| F | claude/m1-p1-site-shed-frozen-clock | undeclared oauth.spec.ts AND scope entry deleted from gate-registry.yaml, `--only lint` (the only other gate) | green, exit 0: scope simply does not run (CR-B-001) |
| push | main, `--base HEAD~1 --head HEAD --phase main`, scope+lint | none | scope not-applicable, lint green, exit 0 |
| push, no params | main | none | scope error "requires --base --head --phase", exit 21 (why the push arm passes them) |

Note: the registry `events` field is not read by the 0.2.1 runner (`grep -rn events dist/src` finds only suite
reporter names), so scope's `events: [pull_request]` is declarative only; the workflow comment already
accounts for this by passing parameters on push.

## Item 7. Bootstrap-input classification (exit doc 1g)

Count checked: B-1..B-17, 2 CHARTER (B-3, B-7), 9 PREDICATE (B-9..B-17), 5 OPERATOR (B-1, B-2, B-4, B-5, B-6),
1 KERNEL-HANDWORK (B-8, H-6). Totals match the summary line. Every hand step I could reconstruct from the
two diffs and the work history is present: init-elsewhere-and-copy (B-2), the modes copy (B-8, H-6), the
template read from the kernel branch (B-9), the nested-strategy npm 10.9.7 lockfile (B-12), the
retention-path edit (B-3), resume and the projects/hemma link (B-5, B-6). The earlier `mkdir` handwork is
disclosed and corrected (F-2). Gaps: CR-B-006.

## Item 8. hemma-fleet vs `tiphys init` 0.2.1

`npx tiphys init <empty scratch>` (0.2.1 from hemma's npm ci) exit 0; its 7 tracked files
(.gitignore, backlog.md, charter/.gitkeep, decisions/.gitkeep, package.json, status/.gitkeep,
tasks/.gitkeep) each `cmp`-identical to the fleet branch at bba99ec. Commit 25a917f carries exactly those 7.
bba99ec adds charter/hemma.yaml and package-lock.json only; the lockfile's @tiphys/kernel is 0.2.1 with the
same integrity as hemma's lockfile. Fresh clone: npm ci exit 0, validate charter exit 0, resume exit 0,
doctor exit 0 (layout PASS, retention PASS with projects/hemma linked). Non-ASCII in the fleet tree: 0 files.
PASS.

## hemma rules (hemma CLAUDE.md)

- File naming lowercase-hyphen: all 14 new paths conform.
- Work history docs/work-history/2026-09-24.tiphys-bootstrap.md: has Date/Branch/Status, verbatim Prompt
  (three messages), What changed lists all 14 files (checked against the diff), Key decisions non-empty.
- Lint zero errors, tsc clean: gates above. E2E rule: exit doc 1f/1j record the red run 1 beside the later
  green runs and CI build-and-e2e success; recorded honestly, not softened.
- Non-ASCII in the 14 changed files: 0 (grep -P exit 1 per file).

## Findings

- CR-B-001 (low, hemma PR): the scope proof for the parallel phases is only as strong as the HEAD's own
  gate-registry.yaml. The workflow runs the registry from the checked-out head, and nothing in hemma pins it
  (no gate-classes gate; the declarations' gateClasses.scope is not checked by anything that runs). Measured
  run F: a phase branch that deletes the scope entry and touches an undeclared path runs green, exit 0.
  Mitigated today only by the clean-room reviews seeing gate-registry.yaml in the diff. The same property
  holds for the adapters and the lockfile, so this is a design residue shared with the kernel, not a spec
  breach. Cheap narrowing: on pull_request, run `--registry` from `git show <base.sha>:gate-registry.yaml`,
  or add "phase diff touches gate-registry.yaml, scripts/tiphys-gates/, .github/workflows/tiphys-gates.yml
  or package-lock.json" as an explicit reviewer stop. Record it in the exit doc either way.
- CR-B-002 (low, exit doc): section 1a table gives the hemma PR head as 668f690; the PR head is 8e84b4e
  (1j states it). The summary table is stale after the fix round.
- CR-B-003 (low, exit doc): the conflict pre-pass in 1c ran WITHOUT `--append-only`, so it printed the
  kernel's three default registries, which intake 6a says step 3 should replace with hemma's own. Re-run
  here with `--append-only package-lock.json`: DISJOINT, exit 0, control OVERLAP exit 1. Verdict unchanged;
  the recorded run should be replaced or annotated.
- CR-B-004 (low, hemma plan): the phase predicate is FILE-level. hemma's rule is silenced by a single
  `vi.useFakeTimers()` or `vi.setSystemTime()` anywhere in the spec
  (infrastructure/lint/no-untimed-clock-in-specs.mjs, header lines 2-3 and the name test at line 54). So
  m1-pN-lint can go green while Date.now() sites still read the real clock, and neither hazard class
  (deleted-assertion, leaked-fake-timers) covers that gamed-predicate shape. Add a reviewer-checkable
  criterion, e.g. every former Date.now() site executes with fake timers active (a top-level beforeEach),
  or name the hazard. Also, leaked-fake-timers is "addressed by" a test-count criterion that does not test
  for a leak.
- CR-B-005 (low, hemma workflow): `${{ github.head_ref }}` is interpolated directly into the shell in the
  PR-arm `--phase` line (and `github.ref_name` in the push arm). GitHub's hardening guidance is to pass such
  values through `env:`. Exposure is small (permissions contents: read; a fork PR's head_ref cannot be
  checked out anyway), but it is a one-line fix.
- CR-B-006 (low, exit doc 1g): (a) section 1 does not state the verdict on criterion p6-charter-only. With
  H-6 present, the criterion as worded is NOT met on released 0.2.1 (it would be with this branch's
  `init --project`); say so explicitly rather than leave it to inference. (b) Intake input I-2
  (`--shared-exclusion`) has no B-row: the fleet home was initialised without it (doctor: shared-lock
  not-declared). It is an OPERATOR choice that matters if the two phases run from different environments,
  and should be classified. (c) The H- numbering jumps from H-4 (intake) to H-6; H-5 appears nowhere.

## Verdicts

- hemma PR #456 at 8e84b4e: APPROVE (no high or medium finding; CR-B-001, -004, -005 are low).
- hemma-fleet PR #1 at bba99ec: APPROVE (no finding against it).
- Kernel-side exit doc (not under review as a PR, reported for the orchestrator): CR-B-002, -003, -006 low.

Status: COMPLETE
