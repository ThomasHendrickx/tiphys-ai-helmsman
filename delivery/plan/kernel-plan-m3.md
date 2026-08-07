# Tiphys Kernel Plan M3: Judgment Layer

- Status: DRAFT, revision 3 (**re-grounded 2026-08-07 against M2 AS DELIVERED**,
  applying the arbitration of adversarial review round 2,
  `delivery/review/arbitration-m3-plan-r2.md`. Revision 2 re-grounded against
  the M2 PLAN while that plan was still DRAFT. Revision 1 applied plan-review
  round 1.)
- Revision 3 (2026-08-07): applies `delivery/review/arbitration-m3-plan-r2.md`,
  which reduces the round's twenty findings to four mechanisms plus eight local
  findings. **What changed.** (1) Every joint with M2 is re-derived by OPENING
  THE DELIVERED ARTIFACT on `main` at `dbba3c8` instead of reading the M2 plan;
  the per-joint result, confirmed or corrected, is section 1.7, and the
  corrections are the CI shape (one job named `gates`, DR-0017), the
  phase-declaration path, field names and ownership, the routing of M3's five
  new checks through the gate registry, DR-0018's diff-scoped-gate semantics,
  and section 2.2's reason for not reusing the M2-P6 coverage checker. (2)
  Section 2.6 is new and binding: every item in a phase's hazard class names
  the numbered acceptance criterion that reddens against it, or records why no
  criterion can; the ten per-phase maps are in section 3 and they added
  criteria to M3-P2, M3-P5, M3-P6 and M3-P9. (3) The exit test's witnesses now
  cover the arms they claim: E3.1 names the CI EVENT and the head sha (T-009),
  and E0.5 carries three structurally different falsification controls plus an
  explicit statement of what remains unwitnessed. (4) The `A-n` owner-action
  namespace is registered to one allocator and this plan's own ids are moved
  off the collisions. Local findings A-004 to A-014 are applied in place.
  **What did NOT change, and this is a constraint of the round rather than an
  observation**: no requirement row moves between phases, no phase is
  renumbered, no decision id `D-M3-nn` is reused or renumbered (revision 3 adds
  D-M3-33 to D-M3-36 and rewrites the body of D-M3-28 under its own number),
  and Appendix A's arithmetic is untouched at 74 rows with the same per-phase
  counts.
- Revision 2 (2026-08-06): re-grounding only. No requirement row moves, no phase
  is renumbered, no decision id is reused. The inputs absorbed and the inputs
  read-and-declined are tabulated in section 1.6, which is the instrument by
  which this revision is judged. Baseline: `main` at `037477e` (M1 complete: all
  six M1 phases merged, M1 exit test passed with recorded evidence, four
  decisions DR-0013 to DR-0016 recorded, three tuition entries T-006 to T-008
  recorded, M2 plan re-grounded to revision 2). Working branch
  `claude/m3-plan-regrounding`.
- Revision 1 (2026-08-05): plan-review round 1 findings applied (M3R-001 to
  M3R-011, `delivery/review/plan-review-m3-r1.md`), and the plan re-grounded
  against everything the project learned after it was first drafted: tuition
  T-005, the M1-P4 dual review recorded as T-001's second data point, the
  M1-P5 reviews, and `delivery/STATE.md`'s carried-forward list. The
  re-grounding was the round's first step, not its last, because the largest
  finding (T-005 absent) existed only because the plan was written in parallel
  with the implementation that produced it. Also folded in: the M2 planner's
  boundary reconciliation items 10 and 11, which close the mechanism-index
  ownership question from both sides and hand this plan the third part of
  T-003's destructive-authority consequence (D-M3-26).
- Baseline commit at first drafting: 2e570c7b91cda937790105c40ab0781e3e252be7
  (main, M1-P3 merged, M1-P4 in flight). State at revision 1: M1-P1 through
  M1-P4 merged (#1, #2, #3, #6); M1-P5 stopped at PR #8 under DR-0012's
  stop-rather-than-grind limit, awaiting the owner; M1-P6 built ahead on its
  branch, waiting on P5 and on owner action A-1.
  **State at revision 2 (2026-08-06), superseding all of the above**: M1 is
  COMPLETE. All six phases are merged (#1, #2, #3, #6, #8, #9); M1-P5 merged at
  `58ac964` after four fix rounds with zero high findings on the merged code;
  M1-P6 merged at `7e1b5f1` after four fix rounds and five review passes; the M1
  exit test PASSED on the merged head on Node v26.6.0 with a 56-record evidence
  bundle and a falsification control that exits 1, so the pass is a measurement.
  M2 has not started and is held by the owner's hard stop at the M1 boundary,
  which permits document work such as this re-grounding and permits no dispatch.
  **State at revision 3 (2026-08-07), superseding the M2 sentence above, which
  was false when revision 2 shipped it and is corrected here rather than
  quietly deleted.** M2 is COMPLETE on `main` at `dbba3c8`, including its
  post-exit-test fix round. All nine M2 phases are merged, the M2 exit test has
  passed, and two further owner decisions were recorded during it (DR-0017,
  single-job CI; DR-0018, exit-test semantics for src-scoped gates). Every M2
  joint this plan describes is therefore an artifact that can be READ, and
  revision 3 reads it. Evidence:

```
$ git log --oneline -1 origin/main
dbba3c8 STATE: correct the branch-cleanup claim, which asserted a deletion that failed (#34)
$ grep -n 'milestone: M2' delivery/STATE.md
  milestone: M2 (gate registry), COMPLETE including its post-exit-test fix
```
- Binding rule: "If it is not written here, it is not being made. Unanswered
  questions go to the orchestrator."
- Relationship to `delivery/plan/kernel-plan-v1.md`: this document replaces
  section 6 of that plan (the five-item M3 outline) with detailed phasing. It
  does not modify, supersede, or reopen anything else there. Plan v1 remains
  the governing document for M1, M2, M4, M5, for its constraints C-1 to C-3,
  for its decisions D-1 to D-19, and for its coverage appendix. Where this
  document and plan v1 disagree about M3, this document wins only after it is
  owner-approved; until then plan v1's outline stands. Every requirement row
  bucketed to M3 by plan v1's Appendix A (74 rows) is assigned to exactly one
  phase here, in Appendix A below.
- Relationship to `delivery/plan/kernel-plan-m2.md`: that document, DRAFT and
  written concurrently under DR-0011, expands plan v1 section 5 into M2 phases.
  It and this one meet at the boundary its section 2 enumerates; every item
  there is accepted here (D-M3-17), and its phase ids and artifact paths are the
  ones this document cites. Neither plan moves a requirement row.
- Precedence unchanged: process doc, plan v1, decision records, then this
  document, then `CLAUDE.md`. Decision records outrank this plan, which is why
  DR-0011 relaxes section 1.3's parallelism convention and DR-0012 changes who
  may merge, both after plan v1 was approved and both applied here.
- Process summary: written as the M3 detailed-planning stage of the current
  orchestrated delivery process, from plan v1, the migration table, the two
  intake documents, decision records **DR-0001 to DR-0016**, tuition entries
  **T-001 to T-008**, the interim mechanism index `MECHANISMS.md`,
  `delivery/verification/release-verification-interface.md`,
  `delivery/plan/kernel-plan-m2.md` at revision 2 and
  `delivery/plan/m2-conflict-pre-pass.md`, `CLAUDE.md`'s fix-round contract,
  claim grep and dispatch contract, and M1's complete defect record through the
  M1 exit test. Ten phases, each one branch and one pull request, sequential
  except for the one pair D-M3-19 permits under DR-0011, with the derivation in
  section 2.5. Section 1.6 records what revision 2's re-grounding took from each
  input and what it declined, and is the instrument by which this revision is
  judged.
  M3-P4 of the v1 outline (the 74-row migration walk) is decomposed by
  artifact family into seven phases (M3-P3 to M3-P9), which discharges the
  binding external review finding EXT-F-07. The remaining three phases are the
  v1 outline's other items: M3-P1 (schemas, outline item 1), M3-P2 (gate
  registry, outline item 3), and M3-P10 (release engineering, outline item 5).
  **Outline item 2, and the fold this plan makes rather than leaves implicit
  (A-004, revision 3).** Plan v1 section 6's outline has FIVE items, and item 2
  is the role-brief phase: "role briefs ported from the process doc:
  investigator, plan writer, adversarial plan reviewer, implementer, clean-room
  reviewer, orchestrator (`AGENTS.md`)". It is delivered here by M3-P5, M3-P6
  and M3-P9, not by a phase of its own. That is a DELIBERATE FOLD into the
  EXT-F-07 family decomposition, taken because v1's own item 4 lists those same
  artifacts as families 1 and 3 of the migration walk, so item 2 and item 4
  double-book them and a plan that honoured both would ship the briefs twice.
  Item 2's three named obligations are carried, each at a cited location, so
  the fold absorbs them rather than losing them: the SC-001 correction of the
  process doc's role table (M3-P5 step 4 and criterion 4, plus D-M3-12); the
  SC-008 merge-authority resolution D-6 (M3-P3's `merge-authority` enum and
  `AGENTS.md` in M3-P9 step 2, witnessed by M3-P9 criterion 6); and the SC-010
  scoped read-only rule D-8 (`AGENTS.md`, M3-P9 step 2, same criterion 6).
  Without this sentence the phase list
  above claims to enumerate a five-item partition while covering four of it,
  and a reader could not tell absorption from omission.

---

## 1. Standing context

### 1.1 What exists when M3 starts

M3 does not start until M2's exit test has passed with recorded evidence on
`main` (plan v1 section 1.4 convention 6, section 5). At that point the
repository contains:

From M1 (walking skeleton, plan v1 section 3):

- `bin/tiphys.ts` and `src/cli.ts`, one dispatch table, subcommands `version`,
  `init`, `doctor`, `lock`, `pool`, `spawn`, `teardown`, `watch`.
- `src/fleet.ts` (fleet-home layout), `src/lock.ts` (lease lock, no pid
  anywhere, C-2), `src/pool.ts` (worktree pool with fetched-base resolution),
  `src/task.ts` (task meta as the single current-state authority, C-1),
  `src/brief.ts` (brief assembly, appends the fleet warnings file verbatim),
  `src/hooks.ts` (turn-end file), `src/spawn.ts`, `src/teardown.ts`,
  `src/watcher.ts`, `src/liveness.ts`.
- `test/behaviors.json`, the behavior-name registry every phase appends to
  (EXT-F-05).
- `schemas/README.md`, `roles/README.md`, `tuition/README.md`: placeholders
  created by M1-P1 that name M3 as the milestone that fills them.
- `scripts/m1-exit-test.sh`, `scripts/stub-payload.sh`, `sandbox/`.
- `.github/workflows/gates.yml`. **Corrected at revision 3 by reading the file
  on `main`; revision 2 said "the `test` matrix job and the `gates` fan-in
  job", and that shape no longer exists.** The workflow is ONE job named
  `gates` with no matrix, node 26 pinned (DR-0017, owner, 2026-08-06). DR-0004's
  required status context is the literal string `gates`, and a job named
  `gates` with no matrix publishes exactly that context, so branch protection
  is satisfied by the job directly rather than by a fan-in over a matrix. The
  two-job shape was removed because the fan-in needed a second runner
  acquisition and starved in the queue under contention (DR-0017 records the
  measurement: fifteen minutes queued and then cancelled on PR #15). Evidence:

```
$ git show origin/main:.github/workflows/gates.yml | grep -nE '^(jobs:|  [a-z-]+:|on:)'
3:on:
4:  pull_request:
27:jobs:
28:  gates:
```

  **Two consequences bind every M3 phase that edits this file (P1, P2, P6, P9,
  P10), and both are new at revision 3.** First, the job stays NAMED `gates`
  with NO matrix: adding a matrix renames the published context to `gates (26)`
  and silently detaches branch protection, so an M3 phase that adds a job or a
  matrix to satisfy some other criterion has broken the required check. This is
  a standing constraint, stated in D-M3-28 and repeated in each of the five
  phases' files-to-touch notes. Second, the workflow FORKS ON THE CI EVENT: the
  `pull_request` arm runs `scripts/m2-exit-test.sh --bundle pr` with `--base`,
  `--head` and `--phase`, and the `push`-to-`main` arm runs `--bundle main`
  with none of the three, which means the two events run DIFFERENT gate sets.
  That is exactly T-009's mechanism, and every M3 check wired into this file
  must declare which arm it runs on (section 2.3 rule 7, D-M3-28).
- the M1 exit-test evidence. **Path corrected at revision 2**: revision 1 said
  `delivery/evidence/m1-exit-test/`, and that directory does not exist. The
  delivered artifact is `delivery/verification/m1-exit-test-evidence.md`
  (56-record bundle, Node v26.6.0, exit 0, verified by `ls delivery/` at
  `037477e`, which returns no `evidence` entry). Section 4's
  `delivery/evidence/m3-exit-test/` is a path this plan CREATES and is
  unaffected; what was wrong was the claim about M1.
- **`MECHANISMS.md` at the repository root**, the interim mechanism index,
  committed 2026-08-05 with twelve rows under T-005's "cheap interim measure,
  available now". It says of itself that it is intended to be SUPERSEDED by
  M3-P8's generated projection. M3-P6 and M3-P8 both consume it; see
  D-M3-23 as amended at revision 2.
- **`classifyEntry` and `refuseOpenForWrite` in `src/task.ts`** (M1-P5, merged
  at `58ac964`): the one answer to "may this path be opened", lstat the link,
  stat what it resolves to, open only a regular file. Every M3 command that
  reads a path it did not create uses these rather than a bare `readFileSync`
  (D-M3-27).

**M1 residues that are load-bearing for M3, named here rather than left in
`delivery/STATE.md` (revision 2).** M1 completed on 2026-08-06 with its exit
test passed on `7e1b5f1`; these four items survived it and each one lands on an
M3 phase:

1. **The unprobed-open class is still OPEN in `src/lock.ts`, `src/pool.ts` and
   `src/brief.ts`.** M1-P5 closed it for the guard, the watcher and doctor.
   `teardown`, four `lock` subcommands and `spawn` still block forever on a
   named pipe. `src/brief.ts` is the one of the three that M3 touches: M3-P5
   consumes it and M3-P5/M3-P6 add `tiphys brief compose`, which resolves and
   READS mandated-reading paths it did not create. Verified at `037477e`:
   `src/brief.ts` line 1 imports `readFileSync` and lines 43 and 56 call it
   bare. **M3 does not fix the three files (no M3 phase acquires
   `src/lock.ts` or `src/pool.ts`) and M3 must not ADD an instance**, which is
   D-M3-27, the M3 analogue of M2's constraint M2-C-6.
2. **A known flake in a suite this plan's every criterion treats as a binary
   gate.** `test/liveness.test.ts:671` asserts a hardcoded `age 13s` against a
   901-second freshness threshold and fails under CPU contention; it was seen
   once by each of two reviewers and was clean on serial re-run both times
   (M1-P6 tracked low CR-762). It is an M1-P5 file. `delivery/STATE.md` says it
   "should be fixed early in M2". **If it is not fixed before M3 starts, M3-P2
   promotes a registry whose `suite` gate reads `node --test` exit 0 as a
   binary fact over a suite with a known non-deterministic member**, and every
   M3 phase's criterion 1 inherits it. Risk 11 records this and M3-P2's
   grounding requires the state to be verified rather than assumed.
3. **The other two tracked M1-P6 lows.** CR-760: a workflow step's own `run:`
   script is asserted by TEXT, so two structurally different edits leave it
   green. **Restated at revision 3**: CR-760 was recorded against "the `gates`
   fan-in job's own `run:` script", and DR-0017 deleted the fan-in job, so the
   INSTANCE is gone. The MECHANISM is not: the workflow on `main` still carries
   several `run:` blocks (the two `m2-exit-test.sh` bundle steps, the
   `--self-test` falsifiability guard, the M1 harness and its guard) whose
   behaviour a text assertion cannot see. This bites M3 directly, because five
   M3 phases (P1, P2, P6, P9, P10) wire a new check into
   `.github/workflows/gates.yml`, and a text assertion over a workflow is the
   exact class `MECHANISMS.md` row "Asserting a CI step is wired" was paid for
   six times in M1-P6. D-M3-28 states what M3 phases do instead, restated at
   revision 3 against the single-job shape. CR-761 is a documentation narrowing
   in M1-P6's own residue statement and touches no M3 artifact.
4. **T-008, and it is not a residue so much as the milestone's strongest single
   piece of evidence for what M3 ships.** On 2026-08-06 two review agents died
   within minutes of dispatch and the orchestrator did not notice for nine
   hours and eleven minutes, because its supervision was "wait for a completion
   notification", which is process liveness and is what constraint C-2 forbids.
   The project building the watcher and the liveness guard did not apply them to
   itself. This lands on three M3 artifacts (the role briefs, the reviewer
   briefs, and `AGENTS.md`) as the dispatch contract of section 1.3, and it is
   cited in section 4.5 as the reason the supervision clauses are not
   decoration.

From M2 (deterministic gates), the eight components M3 consumes by name.
**Revision 3 replaces the M2 PLAN with the M2 ARTIFACT as the source of every
row below.** Revision 2's rows were taken from `delivery/plan/kernel-plan-m2.md`
while that document was DRAFT; the delivered module, its CLI contract and its
delivered path are now on `main` and each row names them. The per-joint
confirmed-or-corrected record, with the commands that produced it, is section
1.7. Phase ids still follow the M2 detailed plan and not plan v1 section 5's
outline numbering, which differs (D-M3-17):

| M2 component | Delivered as | What M3 uses it for |
|---|---|---|
| M2-P2 red-witness harness | `src/gates/red-witness.ts`, invoked `node src/gates/red-witness.ts --result <path> --evidence <dir> --base <ref> [--head <ref>]`. Durable witness SPECS live at `witness/<behavior-id>.json` and validate against `src/gates/schemas/witness-spec.schema.json`; captured external output lives at `witness/captures/`; the run writes `witness-records.json` into the evidence directory | the implementer brief's red-witness clause and the plan-review and clean-room test-honesty probes cite the accepted proof (R-028a, R-056a). **Corrected at revision 3**: the accepted proof is the PAIR, a committed `witness/<id>.json` spec whose `dangerousStates[]` has at least one member, plus the run's `witness-records.json`. Revision 2 said "its evidence file", singular, which names only the second and lets a probe be answered by a run with no durable spec behind it |
| M2-P3 full-suite wrapper | `src/gates/suite.ts`, manifest id `suite`, unitLabel `tests reported` | the report contract's "all green means the wrapper's exit code" field (R-049, R-086). **Confirmed at revision 3 and sharpened**: the gate binds the child's exit code to the parsed counts in BOTH directions (exit 0 with a failing or did-not-run test is a failure, and a nonzero exit with no failing test in the stream is a failure), so the report contract's `wrapper-exit-code` field is one half of a pair and M3-P4 carries the counts beside it rather than instead of it |
| M2-P4 scope auditor | `src/gates/scope.ts`, manifest id `scope`, invoked with `--declarations delivery/plan/phase-declarations`, reading `<dir>/<phase>.json` out of the MERGE BASE | the plan schema's `files-to-touch` field is the auditor's input, through the phase-declaration projection named below. **Corrected at revision 3**: path, field names and the merge-base timing were all wrong at revision 2; see item 3 |
| M2-P5 citation linter | `src/gates/citations.ts`, manifest id `citations`, invoked `node src/gates/citations.ts --result <file> --evidence <dir> --base <ref> [--head <ref>]`, precondition `diff-touches` on six `delivery/` paths | the verifier attached to the investigator and plan-writer briefs (R-010a). **Corrected at revision 3**: it is a GATE with a diff-scoped precondition, not a free-standing linter over a file. It resolves only citations ADDED OR MODIFIED in `base...head` (M2-D-21) and treats a citation inside backticks or a fenced block as QUOTED and never resolves it (M2-D-22). So R-010a's "verification pass" is a pass over a DIFF, and the brief clause must say which base, or the attached verifier is not runnable as specified |
| M2-P6 coverage checker | `src/gates/coverage.ts`, manifest id `coverage`, `--config <path>` validated against `src/gates/schemas/coverage-config.schema.json`, falling back to the built-in `KERNEL_COVERAGE_CONFIG` when the flag is absent | accepted reference types phase, decision, parked (D-7) constrain the plan schema's open-questions and parked sections; its finding-to-outcome parity mode validates the final report (R-089b, consumed by R-089a). **Corrected at revision 3**: it is CONFIG-DRIVEN, with an `inventory` document and a `coverageTable` document as two separately configured sources each with an id regex. Section 2.2 is rewritten against that fact |
| M2-P1 gate manifest and gate runner | `gates.manifest.json`, `src/gates/schemas/gate-manifest.schema.json`, the runner `src/gates/run.ts` behind `tiphys gates run --manifest <file> --evidence <dir> [--base] [--head] [--phase] [--only]`, and the record constructor `src/gates/result.ts` | the seed the canonical gate registry promotes, with its SC-011 precondition semantics (R-094). **Confirmed at revision 3, with the two constraints named**: `makeGateResult` is THE ONLY CONSTRUCTOR and it rewrites a green record with `units` 0 to `error` with `vacuous: true` (M2-C-2, `src/gates/result.ts` lines 148 to 183), and a gate invoked without a parameter it needs is `error` and never not-applicable (M2-C-3). M3-P2's promotion must preserve both, and revision 3 gives it criteria that redden if it does not |
| M2-P7 deploy and migration verifiers | `src/gates/deploy.ts` and `src/gates/migrations.ts`, two thin entries over the one contract module `src/gates/release.ts`, with `src/gates/schemas/release-record.schema.json` and two reference adapters under `src/gates/adapters/` | named stages in the full assurance mode's pipeline definition (R-096). **Confirmed at revision 3, with one property M3-P3 must not contradict**: the outcome vocabulary (satisfied, failed, pending, absent, not-applicable, error) is DELIBERATELY NOT a schema enum, because an out-of-enum outcome is a named fail-closed error rather than a generic schema failure. M3-P3 references stage ids and never the outcome enum, so nothing in M3 needs to restate it |
| M2-P8 credential scoping | `src/gates/credentials.ts`, two manifest entries `credential-scrub` (required) and `credential-token` (conditional, precondition id `implementer-token-present-owner-action-a-3`) | the structural fact the implementer brief must not contradict (R-008 is M2; the brief clause is M3). **Confirmed at revision 3, with the residue named**: the real defence is the allowlist in `src/exec/env.ts`; the module's derived denylist is a bounded TRIPWIRE and says so in its own header. The implementer brief's no-pull-request clause may cite the scrub as structural, and may not claim it is exhaustive |

Six M2 artifacts are named by path because M3 fits against them directly. Each
one is a joint this plan has to fit against rather than guess at, and at
revision 3 each was READ on `main` rather than taken from the M2 plan:

1. `gates.manifest.json`, the per-repository gate manifest with preconditions
   and applicability (M2-P1). Its schema reserves a `modes` field that the M2
   runner validates if present and ignores; M3-P2's promotion is therefore
   additive and not a rewrite (M2 plan section 2 item 1).
2. `src/gates/schemas/`, where M2's own schema documents live, because
   `CLAUDE.md` reserves the root `schemas/` for M3. M2 leaves the relocation
   decision to M3; this plan takes it (D-M3-20).
3. `delivery/plan/phase-declarations/<phase-id>.json`, the phase-declaration
   projection the M2-P4 scope auditor consumes. **Corrected at revision 3 in
   all three of its observable properties, by reading the delivered schema and
   manifest rather than the M2 plan's prose; revision 2 was wrong about the
   path, the field names and the timing, and M3-P1 criterion 10 would have
   failed on its first attempt.**
   - **Path.** `delivery/plan/phase-declarations/`, not `delivery/plan/phases/`.
     The directory is passed to the gate from `gates.manifest.json`, and the
     filename is the phase id LOWERCASED (`m3-p1.json`), because the CI harness
     derives `--phase` from the branch name by a lowercase regex.
   - **Field names, and the set is CLOSED.** Required: `id`, `branch`,
     `filesToTouch`, `declaredExtras`, `citations`, all camelCase, with
     `additionalProperties: false`. Revision 2 said "(`id`, `branch`,
     `files-to-touch`, `extras`, `citations`)" and made `extras` a required
     phase field; a projection emitting those names is rejected by the schema
     rather than merely ignored. `filesToTouch` holds literal paths, or literal
     directories written with a TRAILING SLASH, and never a description
     (M2R-016): the auditor matches the string exactly or as a directory
     prefix. `declaredExtras` is over and above two standing extras the auditor
     adds itself, `test/behaviors.json` and the phase's own
     `delivery/work-history/<id>.md`.
   - **Timing, and it is an operational prerequisite the plan previously did
     not carry at all.** The auditor reads the declaration out of the MERGE
     BASE of the audited branch, never from the head, which is the whole
     anti-widening property: a declaration that is not on `main` when the
     branch forks CANNOT govern that branch, and editing it on the branch
     cannot widen the audited scope. Every M3 branch is `claude/m3-pN-<slug>`,
     which matches the scope gate's `branch-matches` precondition, so scope
     RUNS on every M3 pull request and a missing declaration is a red gate.
   - **Ownership, assigned here because no phase owned it (A-009).** The ten
     `delivery/plan/phase-declarations/m3-p1.json` to `m3-p10.json` documents
     are authored by the ORCHESTRATOR from section 3's `files-to-touch` lists
     and merged to `main` in ONE pull request BEFORE the first M3 branch is
     created. They are not on any phase's files-to-touch list and must not be,
     because a phase that could author its own declaration could widen its own
     audit. Section 3's preamble states the step; D-M3-33 records the decision
     and why it is one pull request rather than ten.
   - Evidence for all of the above:

```
$ git ls-tree -r origin/main --name-only delivery/plan/phase-declarations/ | head -3
delivery/plan/phase-declarations/README.md
delivery/plan/phase-declarations/m2-p2.json
delivery/plan/phase-declarations/m2-p3.json
$ git show origin/main:src/gates/schemas/phase-declaration.schema.json \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['required'])"
['id', 'branch', 'filesToTouch', 'declaredExtras', 'citations']
$ git show origin/main:gates.manifest.json | python3 -c "import json,sys;print([g for g in json.load(sys.stdin)['gates'] if g['id']=='scope'][0]['command'])"
['node', 'src/gates/scope.ts', '--declarations', 'delivery/plan/phase-declarations']
$ git show origin/main:.github/workflows/gates.yml | grep -n 'phase '
92:          --phase "$(printf '%s' "${{ github.head_ref }}" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')"
```

   The M2 plan recommends that the M3 plan schema's phase object be a superset
   so the projection becomes a generated view of one source rather than a
   second source that can drift. This plan accepts that (M3-P1 step 2,
   D-M3-18), and revision 3 corrects what the generated view must EMIT so the
   consumer accepts it.
4. M2-P6's coverage input contract: a findings inventory plus a coverage table
   in a declared shape, defined by M2 because the report contract does not
   exist yet. M3-P4's report and final-report schemas must emit that shape or
   supersede it deliberately, and M3-P4 has a criterion that runs the real
   checker rather than reasoning about compatibility.
5. **The M2 validator's DIAGNOSTIC CONTRACT, added at revision 2 and the one
   joint that runs in the other direction.** DR-0013 clause 6 promises that
   M3-P1 will retire M2's validator as an engine "preserving its module
   boundary" and re-run "all existing M2 validation tests" unchanged. M2's plan
   at revision 2 accepted the obligation that makes that promise keepable: M2-P1
   step 4 and criterion 10 now require M2's validator to emit
   `INVALID <json-pointer> <message>` with deterministic ordering and require
   M2's own tests to assert that contract rather than any engine-specific
   wording (`delivery/plan/kernel-plan-m2.md` section 2 item 5). **M3-P1 does
   not assume this; it verifies it as its first step.** If M2 as delivered
   emits engine-specific wording or its tests assert it, the retirement is a
   rewrite of M2's tests rather than an engine swap, and DR-0013's
   "boundary preserved" language would be false at the moment it was acted on.
   That is an escalation to the orchestrator (D-M3-16), not something M3-P1
   fixes on M2's side.
6. **M2-P7's release-verification outcome enum and record schema** (M2-D-20,
   rewritten in M2's revision 2 under DR-0014). It is the shape the charter's
   RESERVED verification field must later configure or deliberately supersede,
   in the same relation item 4 describes for the report contract. M3 does not
   design that field; see D-M3-29.

Everything else is verified before use: every M3 phase that consumes an M2
artifact confirms its real path and output shape before editing and records the
confirmation in its work history.

**Revision 2's version of this paragraph, and what it cost, recorded because it
is the round's whole lesson.** Revision 2 read: "At revision 2 the M2 plan is
DRAFT at revision 2 ... so a path taken from it is a starting point for that
verification, never a substitute for it." That sentence states the hazard
CORRECTLY, and revision 2 then relied on the M2 plan anyway. Adversarial review
round 2 opened five of M2's delivered artifacts and found three of the five
mis-specified. Revision 3 opens the rest (section 1.7 lists which, and which
were confirmed) because a base rate of three in five is not a base rate at
which the unread ones may be assumed sound.

**The rule that replaces it, binding from revision 3 onward.** M2 is COMPLETE
and every joint is readable, so no M3 phase may take a path, a field name, a
flag or an output shape from `delivery/plan/kernel-plan-m2.md`. The source is
the file on `main`, and the verification a phase records in its work history is
a captured command against that file, not a citation to the M2 plan's prose.
Where this plan quotes a shape, section 1.7 carries the command that produced
it, so a later reader can re-run the derivation instead of re-trusting it.

### 1.2 What M3 therefore builds

M3 is layer 2 (blueprint section 2): the process kernel itself. It converts
the process document into machine-checkable artifacts and ships them inside
the npm package. It builds no new deterministic gate scripts (that was M2) and
no harness integration (that is M4).

Deliverables, all inside the published package:

- `schemas/`: JSON Schema files, one per artifact type, plus one validator
  command.
- `templates/`: starter instances that validate against those schemas.
- `roles/`: the six role briefs of blueprint section 6.
- `checklists/`: probe lists per review type.
- `AGENTS.md`: the orchestrator's job description.
- the canonical gate registry and the assurance-mode definitions.
- `tuition/`: the cross-project failure-mode log and the flow that feeds it.
- the release pipeline and v0.1.0.

### 1.3 Conventions inherited, and the one that changed

Plan v1 section 1.4 in full: English only; npm only; no em dashes and pure
ASCII in authored text; falsifiable acceptance criteria only, with the
register "node --test exits 0 and reports N tests, N > 0"; one phase equals one
branch equals one pull request; milestone exit tests are hard gates. The gate
list of `CLAUDE.md` (npm ci, npm run build, node --test) applies to every M3
phase, and M3-P2 is the phase that replaces that list with a pointer to the
registry, which `CLAUDE.md` line 3 already anticipates.

Convention 5 changed after plan v1 was approved. DR-0011 (decided 2026-08-04,
"maximum safe parallelism") relaxes parallelism-off-until-M5 for cases where the
declared file lists prove disjointness, under five binding conditions: a
recorded pairwise files-to-touch disjointness check before each parallel
dispatch; stale `conflicts-with` notes reconciled first; merge order stays
dependency order regardless of work order; criteria that cannot execute until an
earlier phase merges are marked deferred and executed in a final validation
pass, never dropped; and prerequisites the parallel phase needs become urgent
rather than eventual. This plan therefore declares `parallelizable` per phase
(section 2.4) instead of asserting a blanket no, and D-M3-19 records which M3
phases can actually claim it.

The red-witness rule applies in its stronger T-003 form: a test counts only if
it has been demonstrated red against the DANGEROUS state, not merely against
the absent feature. Section 2.3 states what that means for schemas, which is
the artifact type M3 mostly ships.

**Four rules were added to `CLAUDE.md` after revision 1 of this plan and are
binding on every M3 phase (revision 2).** They are listed here because M3 is
the milestone in which three of the four stop being repository rules and become
KERNEL DELIVERABLES: the artifacts M3 ships are where a future project inherits
them or does not.

1. **The fix-round contract, measured 2026-08-05.** Sixteen M1 fix rounds were
   completed, thirteen were re-reviewed, and TWELVE of those thirteen produced a
   new finding attributable to the round itself; the dominant shape, roughly a
   third of M1's elapsed time, is that the fix addressed the INSTANCE the
   reviewer named when the defect was the MECHANISM. Three items are required of
   every fix round: name the mechanism rather than the finding; publish the
   exact command that enumerates every call site of that mechanism together with
   its full output; and state what the derivation did NOT cover. The reviewer's
   FIRST check is the third item. M1-P5's fourth round used this method and
   derived eleven call sites where the review had listed eight, closing in one
   round a class that three prior rounds had each closed one path at a time.
   **M3 ships this as a requirement on artifacts, not as a norm**: the report
   and work-history contracts (M3-P4) carry the three fields, the clean-room
   checklist (M3-P7) carries the reviewer's first check, and the implementer
   brief (M3-P6) carries the obligation. D-M3-30 records the placement.
2. **The claim grep, binding before any work history is submitted.** A
   mechanical `grep -nEi 'cannot be|impossible|needs a|is covered|catches|would
   catch|recovers|anyway|always|never|no way to'` over the work history, where
   every hit carries an adjacent captured command or is restated as an open
   question. Tuition T-006 records seven instances of unexecuted claims across
   M1, one of them the orchestrator's own, and notes that the pattern survived
   being documented as a norm; a grep is mechanical and a reminder is not.
   **This is why M3-P4's work-history schema carries a declared claims
   section**: a schema gives the check a field to look at instead of a regex
   over free prose (D-M3-30).
3. **One witness is not a class.** A witness for a CLASS must redden under at
   least TWO structurally different members of it. M1-P6 produced two
   consecutive mediums from this alone. Section 2.3 rule 6 applies it to M3's
   own DANGEROUS-instance fixtures.
4. **The dispatch contract (T-008): no agent without a beacon and a guard.**
   Every dispatched agent writes its output INCREMENTALLY, creating its artifact
   within the first minutes and appending as it works, so the file's mtime is
   its beacon and a death leaves salvage rather than nothing. A freshness
   watchdog is armed in the SAME TURN as the dispatch, and it tests FRESHNESS
   (newest mtime under the agent's working directory), never existence and never
   completion. The measured cost of not doing this was nine hours eleven
   minutes; the first watchdog written after the incident tested EXISTENCE, so
   it fired two minutes in and reported success while saying nothing, which is
   the red-witness rule one level up. **M3 ships this in the role briefs
   (M3-P5, M3-P6) and in `AGENTS.md` (M3-P9)**, per D-M3-31.

### 1.4 Constraints C-1, C-2, C-3 as they bite M3

The three plan v1 constraints carry forward and are not restated as new
numbers. Where each one bites an M3 artifact:

- C-1 (one current-state authority; never read current state from the tail of
  an append-only log). Bites the status line contract directly (M3-P1): the
  status stream is append-only and is not the state authority; the current
  state is a separate file rewritten atomically, and `status show` must not
  parse the stream. Also bites the report contract (M3-P4): an outcome is read
  from the finding's `outcome` field, never inferred from the last line of a
  narrative section.
- C-2 (no pid, process liveness, signals, or /proc for identity or exclusion).
  Bites `AGENTS.md` (M3-P9): the orchestrator's supervision duties are written
  in terms of lease freshness and beacon age, never "check whether the agent is
  still running". Bites the assurance-mode definitions (M3-P3): no mode may
  declare a stage whose completion is detected by process liveness.
  **Revision 2 adds the measurement that makes this the most expensive
  constraint in the project.** T-008: the orchestrator supervised two review
  agents by waiting for a completion notification, which IS process liveness,
  and lost nine hours eleven minutes because a dead process sends no
  notification and no notification is indistinguishable from work in progress.
  So `AGENTS.md`'s supervision section is not a restatement of C-2 for
  tidiness; it is the clause whose absence has a measured price on this
  project's own orchestrator, and M3-P9 criterion 5 is what makes its
  vocabulary falsifiable.
- C-3 (never auto-background a long-running process). Bites the full-mode
  pipeline definition (M3-P3) and `AGENTS.md` (M3-P9): arming supervision is an
  explicit orchestrator step verified through the beacon; no mode definition
  and no brief may instruct any agent to background the watcher.
  **A distinction revision 2 must draw so the two rules do not appear to
  collide.** T-008's second rule requires a freshness watchdog armed in the
  same turn as a dispatch, and C-3 forbids auto-backgrounding a long-running
  process. These are compatible and the reason is the word AUTO: C-3 forbids a
  kernel command from backgrounding work behind the operator's back, and the
  watchdog is an EXPLICIT, declared supervision act whose whole purpose is to
  be observable. `AGENTS.md` states the distinction rather than leaving a
  future reader to resolve two clauses that look contradictory (M3-P9 step 4).
- **New at revision 2, and not a new constraint number: the unprobed-open
  class.** C-1 to C-3 are plan v1's and are not renumbered. What revision 2
  adds is D-M3-27, which binds every M3 command that reads a path it did not
  create to the delivered `classifyEntry` and `refuseOpenForWrite` in
  `src/task.ts`. It bites `tiphys brief compose` (M3-P5, M3-P6), which resolves
  mandated-reading paths; `tiphys validate` (M3-P1), whose ordinary input is a
  hand-authored file at an operator-supplied path; `tiphys checklist resolve
  --extra` (M3-P7); `tiphys tuition add --file` (M3-P8); and every `--context`
  directory walk. This is M1's most expensive defect class (twelve paths, four
  fix rounds, CR-520 and CR-560) and M2's constraint M2-C-6 is the same rule for
  gates. M3 uses the delivered implementation rather than writing a second one,
  which is T-005's lesson applied inside this milestone.

### 1.5 Artifact format policy under DR-0006 (per artifact type)

DR-0006 is decided and strict: anything expressible as structured data is YAML
or JSON validated by a lintable schema; markdown with structured frontmatter is
the exception and every use must state a reason valid on its own terms;
convenience is never a valid reason. This table is the required per-type
record. It is binding on every M3 phase, and a phase that ships an artifact in
a form not listed here is a review finding.

| Artifact type | Form | Reason |
|---|---|---|
| schemas | JSON (`schemas/*.schema.json`) | JSON Schema is a JSON dialect; no choice exists |
| charter | YAML; the `product-intent` field is a block scalar | every field of blueprint section 7 is enumerable except product intent, which blueprint section 7 defines as "one page max, what winning looks like" prose; the prose lives inside a field, not outside the structure. **Revision 2: the charter also carries a RESERVED `release-verification` field under DR-0014 (D-M3-29). Reserved means declared, validated if present, and NOT designed here** |
| plan | YAML; `intent`, `grounding`, and narrative fields are block scalars | R-019 enumerates the phase fields exactly; blueprint section 5 adds two more; a plan is a list of typed phases with prose values, so the structure is the artifact and the prose is field content |
| decision record | YAML; `question`, `options[].detail`, `recommendation`, and narrative are block scalars | blueprint section 7 gives the field list literally (id, project, task, question, options, recommendation, reversibility, evidence, status, decided, date) |
| status line | JSON records | fully enumerable; there is no prose field (R-084's whole point is sparseness) |
| report and final report | YAML; `narrative`, per-finding `analysis`, and honest-failure descriptions are block scalars | R-089a's content is a table of findings to outcomes plus four enumerable lists; the prose is per-finding and lives in fields |
| work history | YAML; `prompt` (verbatim), per-decision `why`, and deviation text are block scalars | R-052a names three parts, two of which are lists and one of which is verbatim text |
| gate registry | YAML validated by JSON Schema | fully enumerable; inherits the M2-P1 manifest's shape and its precondition semantics (SC-011) |
| assurance modes | YAML | fully enumerable (mode, stages, gate sets, merge authority) |
| role-to-model configuration | YAML | fully enumerable |
| checklists (probe lists) | YAML: a list of `{id, probe, applies-to, evidence-required}` | a probe is a question with an identity and an applicability rule; that is data, and structuring it is what lets a checklist be extended, merged, and orphan-checked. Markdown here would be convenience, which DR-0006 forbids |
| tuition entries | YAML; `what-happened`, `lesson`, and `structural-consequence[].detail` are block scalars | the header fields, the consequence list, and the `mechanisms[]` this entry constrains are enumerable; the incident narrative is not |
| mechanism index | YAML: `{mechanism, rule, evidence[]}` entries keyed by mechanism | T-005 names the form directly ("it is small, it is structured data under DR-0006, and it is checkable"); it is a projection of the tuition feed's `mechanisms[]` field, so it has no prose of its own. **Revision 2: the INTERIM index now exists as `MECHANISMS.md`, markdown, twelve rows, committed 2026-08-05.** Its markdown form is not a counter-example to this row and is not grandfathered: it is repository paperwork under `CLAUDE.md`'s "where things live", explicitly self-described as the interim to be SUPERSEDED, and it is the SEED and INPUT for the shipped YAML index rather than a second copy of it (M3-P8 step 2b) |
| finding set (`schemas/finding.schema.json`, M3-P5, R-029) | YAML; per-finding `analysis` and the set's `verdict-rationale` are block scalars | **ADDED at revision 3 (A-012). It was missing, and section 1.5's own enforcement clause made any form the implementer picked a review finding by construction.** Same reason as the report row and stated in the same terms: R-029's content is a `verdict`, a `produced-by`, and a severity-ranked list of typed findings, all enumerable; what is not enumerable is the ANALYSIS behind one finding, which is argument and lives inside a field. Note the asymmetry with role briefs deliberately: a finding set's structure is what the derived checks read, so structure is the artifact here and the prose is field content, whereas a brief's argument IS the artifact |
| verdict (`schemas/verdict.schema.json`, M3-P7, R-060) | YAML; per-finding `analysis`, the `rationale` for APPROVE or FIX-ROUND-NEEDED, and each `hazard-classes-addressed[].statement` are block scalars | **ADDED at revision 3 (A-012), same omission.** A verdict is a finding set plus four cross-document completeness arrays (`criteria[]`, `deviations-judged[]`, `hazard-classes-addressed[]`, `produced-by`), every one of which is compared field-by-field by a Kind B check in a different document; a markdown verdict would make `verdict-criteria-complete`, `verdict-deviations-judged` and `verdict-hazard-classes-addressed` unimplementable. The reasoning prose sits inside the fields the checks do not read |
| role briefs (`roles/*.md`) | markdown with YAML frontmatter | JUSTIFIED EXCEPTION. A brief is instruction prose addressed to a reasoning agent. Its effect comes from argument, ordering, and emphasis, which have no field decomposition that preserves them: splitting a brief into fields produces either one giant string field (structure that carries nothing) or a set of fragments no agent reads as an argument. The frontmatter carries everything that is enumerable (role id, clause ids, mandated reading paths in order, attached verifiers, default model tier, allowed outputs), and that frontmatter is schema-validated. The reason is not that markdown is easier: it is that the remaining content has no structure to express |
| `AGENTS.md` | markdown with YAML frontmatter | JUSTIFIED EXCEPTION, same reason: it is the orchestrator's brief. Binding: any policy that is expressible as data (gate lists, mode tables, model tiers, stage sequences) is NOT written in `AGENTS.md`; it is referenced by path into the structured artifacts, and M3-P9 has an acceptance criterion that asserts the absence of the duplicated data |
| fleet environment-warnings file (`warnings.md`) | markdown | JUSTIFIED EXCEPTION. Its only consumer is `src/brief.ts`, which appends it verbatim into instruction prose (R-083b, M1-P4). Structuring it would require a renderer whose only output is the prose form the file already holds, so the structure would have no reader. The reason is absence of a consumer for the structure, not convenience. M3 ships the template (R-083a), not a conversion |

Scope note, to prevent a predictable confusion: this policy governs artifacts
the kernel ships and validates. It does not govern `delivery/**`, which is this
build's own paperwork under the current process and is not a kernel deliverable
(`CLAUDE.md`, "Where things live"). `delivery/plan/kernel-plan-m3.md` is
therefore markdown and is not an instance of the plan schema.

### 1.6 Re-grounding record (revision 2, 2026-08-06)

DR-0011's recorded consequence makes this an explicit step BEFORE adversarial
review, not a review finding. One row per input, with what the plan took from it
or the reason it changed nothing. An input silently ignored would be worse than
one rejected with a reason, so every input read is listed whether or not it
moved anything.

| Input | Disposition |
|---|---|
| `delivery/decisions/DR-0013` as DECIDED (Ajv 8.20.0 exact, Draft 2020-12, strict; `yaml` 2.9.0 exact; the fourteen validator criteria; the `INVALID <json-pointer> <message>` contract) | **Changed six passages and confirmed two.** Changed: M3-P1 step 1 (verifies M2's diagnostic contract and its tests' assertions, not its keyword set); step 8 (already carried the decision, now also states the YAML decode stage as a separate stage per DR-0013 clause 3.3); step 10b and the files-to-touch entry for `package-lock.json` (the lockfile is a REQUIRED artifact of this phase and criterion 1's clean `git status` is what proves it was regenerated rather than hand-edited); step 11 (tests now enumerate the Ajv and YAML behaviours the fourteen criteria require); M3-P10 step 2 and criterion 1 (the license gate's inputs now name `ajv`, `yaml` and BOTH transitive production inventories, which is what DR-0013 clause 5 and criterion 14 demand and which revision 1 left only on M3-P1's side); D-M3-16 (its stale "extension of the M2 validator's keyword set" clause is restated). Confirmed unchanged after checking: the fourteen criteria inserted on the decision day are coherent with the decision text and none was reworded; the section 1.5 format table needs nothing, because Ajv changes the ENGINE and not the artifact forms. New section 1.1 item 5 records the obligation running from DR-0013 back into M2. |
| The superseded option-2 write-up in section 7 | **Rewritten as history with an explicit frame.** Revision 1 marked the block SUPERSEDED at the top and then left the option list, the recommendation and the note to the owner in the present imperative, so a reader landing mid-block would read an instruction. Section 7 now brackets the whole passage between an opening and a closing marker, converts the recommendation to past tense with the outcome stated beside it, and marks the two bullets whose content was overtaken (the owner note about steps 8 and 11, and the M3R-002 scope correction) with what actually happened. |
| `delivery/decisions/DR-0014` and `delivery/verification/release-verification-interface.md` (1053 lines, read in full) | **Changed M3-P1 step 3 and added D-M3-29 and D-M3-17 item 12.** The charter schema RESERVES `release-verification` and does not design it: the field is declared, validated if present, closed against unknown shapes, and cited to the investigation, whose section 8 item 4 says in terms that "the charter field is M3's, and M3 should reserve the space rather than design it". Two of the investigation's three hand-offs are TAKEN because they are cheap and available now: `escalation-contract`'s default `stop-for[]` gains "a change from a declared release verification to `none`" (section 4.1's closing recommendation, one line), and the M2 outcome enum is named as the shape a later charter field configures. The third, the charter coherence check, is DECLINED FOR M3 WITH A REASON rather than built: the investigation's own section 8 item 4 says the predicate needs a real charter, which arrives at M4's pilot, and building a Kind B check whose predicate is invented is the M1-P3 shape this plan's risk 1 exists to prevent. It is recorded in Appendix C item 12 as available-and-declined, not as a debt. |
| `delivery/decisions/DR-0015` (the owner is not an approval step) | **Changed five passages.** Owner action **A-3 is REMOVED** from section 7, which is what DR-0015's own consequence list instructs and which revision 1 did not execute. Section 4.2 stage E2 is rewritten: the mechanism is kept and the signatory changes, so the exit run still stops, still waits for an approval artifact it did not produce, still records it, and still resumes from it, with dual cross-model clean review as the signature. M3-P10's `blocked-by` drops A-3. M3-P9 step 2's merge-authority duty no longer reads "owner approves per pull request". Section 4.5's proves-list gains the handoff property and the does-not-prove list gains what DR-0015 says is genuinely lost, that nobody witnesses a wait measured in days. |
| `delivery/decisions/DR-0016` (escalation threshold) | **Changed four passages and settled one question this plan would otherwise have raised.** M3-P3's `escalation-bounds` gains a required `on-exceeded` field, because DR-0016 changes the RESPONSE at the bound from a stop-and-wait to a fresh implementer plus a third review contract dispatched immediately with the owner notified asynchronously, and a bound that records the limit but not the response encodes the superseded regime. M3-P9's `decorrelated-review` clause and the orchestrator's stop duty follow. Section 6 and section 7 are rewritten against DR-0016's two-limb test. **Nothing in section 3 or section 4 now assumes an owner click**, verified by the grep recorded in section 1.6's closing note. |
| `delivery/tuition/T-005` plus the interim `MECHANISMS.md`, twelve rows | **Changed M3-P6, M3-P8 and D-M3-23.** The index EXISTS now, which falsifies revision 1's premise that M3-P6 must invent a one-entry stub. M3-P6's stub becomes a CONVERSION of the interim file's twelve rows into the schema M3-P8 will generate into, and M3-P8 gains criterion 4c: no interim row may be silently dropped by the generated projection, which is the coupling M2's boundary item 10 asked for from the other side. |
| `delivery/tuition/T-006` (unexecuted claims about the world) | **Changed M3-P4 and M3-P7, and it is the input that most enlarges an existing contract.** T-006 establishes that T-003's universal-quantifier rule, already in this plan, would have caught NONE of the three false claims M1-P5 produced, because impossibility, coverage and remedy claims are existential and causal rather than universal and are settled by CONSTRUCTION rather than by counter-experiment. M3-P4's report and work-history schemas gain a declared `claims[]` section with a `kind` enum and a required executed construction per kind; M3-P7's clean-room checklist gains a probe that hunts impossibility and coverage claims specifically, which T-006 records reviewers already doing by instinct three times out of three. |
| `delivery/tuition/T-007` (criteria cannot contain the defect) | **Changed every phase section, plus M3-P1, M3-P6, M3-P7 and M3-P9.** Every M3 phase now declares a **hazard class** beside its acceptance criteria (D-M3-32), which is T-007's explicit structural consequence for the plan schema and which M2's revision 2 did in the same shape. The plan SCHEMA gains a required `hazard-classes[]` phase field, so a future project's second review contract is derivable from its plan rather than improvised per dispatch. The clean-room reviewer brief and the checklists carry the two-contract rule: a code phase requires two review CONTRACTS, not two reviewers, one walking the criteria and one given the hazard question. |
| `delivery/tuition/T-008` (the orchestrator had no beacon) | **Changed section 1.1, section 1.4, M3-P5, M3-P6, M3-P9 and section 4.5.** The dispatch contract (incremental output as beacon; a freshness watchdog armed in the same turn; the guard tests freshness, never existence) becomes clause text in the implementer and reviewer briefs and an orchestrator duty in `AGENTS.md`, with D-M3-31 recording the placement. Section 1.4 adds the C-3 distinction that keeps "arm a watchdog" from reading as a licence to auto-background. |
| `CLAUDE.md`'s fix-round contract and claim grep | **Changed M3-P4, M3-P6, M3-P7 and section 1.3.** This is where the two stop being repository rules and become kernel deliverables. The report and work-history schemas carry `mechanism`, `derivation` (command plus FULL output) and `not-covered` as required fields of a fix-round record; the clean-room checklist's FIRST probe is `not-covered`; the implementer brief carries the claim grep as a pre-submission obligation. D-M3-30 records the placement and the measured evidence (twelve of thirteen re-reviewed fix rounds produced a new finding attributable to the round). |
| The M1 defect record as it actually ended | **Changed section 1.1 (four named residues), added D-M3-27 and D-M3-28, and added risks 11 and 12.** The unprobed-open class still open in `src/lock.ts`, `src/pool.ts` and `src/brief.ts`; the `test/liveness.test.ts:671` flake against every criterion that reads `node --test` exit 0 as binary; CR-760's text-asserted CI wiring against the five M3 phases that wire a check into the workflow; and T-008 itself. |
| `delivery/plan/kernel-plan-m2.md` at revision 2, sections 2 and 1.5 | **Changed D-M3-17 (item count corrected to twelve, item 12 added), section 1.1 items 5 and 6, and M3-P4's grounding.** M2's section 2 now carries twelve items, not nine as D-M3-17's prose asserted while listing eleven. Item 5 gained the diagnostic-contract obligation and item 12 is new for the charter boundary; both are reconciled on M3's side above. |
| `delivery/plan/m2-conflict-pre-pass.md` | **Changed section 2.4 and added section 2.5.** M2's pre-pass is the worked shape for stating a parallel structure from grounding fields before dispatch rather than at it. M3's own structure is now DERIVED and written down in section 2.5 rather than asserted in one sentence of D-M3-19; the derivation confirms D-M3-19's conclusion and, for the first time, shows the work. |
| `delivery/STATE.md` at `037477e` | **Corrected section 1.1's M1 statement and three stale claims.** Also the source of the four carried-forward items Appendix C item 10 dispositions, which are re-checked against the file as it now reads rather than as revision 1 read it. |

**Inputs read that changed nothing, recorded so the omission is deliberate.**

1. **`delivery/decisions/DR-0011` itself.** Its five conditions are already
   applied in section 1.3 and D-M3-19 and none of them has moved. What changed
   is not the decision but this plan's compliance with condition 1, which now
   has a written derivation (section 2.5) instead of an assertion.
2. **`delivery/decisions/DR-0012`.** Superseded in one clause by DR-0015
   (milestone boundaries) and in another by DR-0016 (stop-and-wait), both
   handled above. Its definition of "clean" and its dual cross-model condition
   are unchanged and are what M3-P3's `delegated-under-conditions` value and
   M3-P9's `decorrelated-review` clause encode. No edit needed.
3. **`MECHANISMS.md`'s rows for the lease compare-and-swap, the append-only
   log, atomic file replacement, worktree removal, classifying another
   program's errors, parsing reporter output, pattern-matching a consumed
   file's text, verifying access to a remote, and a guard's own failure path.**
   Nine of the twelve rows bind M1 and M2 components that no M3 phase builds or
   edits. They are forwarded in every M3 brief under the `mechanism-lookup`
   obligation, which is a dispatch duty, and they are seeded into M3-P8's
   index, which is a deliverable. Turning any of them into an M3 gate would be
   machinery for a state this milestone does not reach. **Three of the twelve
   DO bind M3 and are taken**: "reading a path whose type is not established"
   becomes D-M3-27; "asserting a CI step is wired" becomes D-M3-28; and
   "claim file" is the seeded entry M3-P6's stub and M3-P8's projection both
   carry.
4. **The M1 exit-test evidence bundle
   (`delivery/verification/m1-exit-test-evidence.md`).** Read for the shape of
   a passing exit test and for what its full mode could not witness. It
   changes no M3 criterion: section 4's staging was already modelled on the M1
   exit test under EXT-F-04, and the `gh` limitation it records is already in
   `CLAUDE.md` warning 6 and already bounds section 4 stage E2. One thing was
   confirmed rather than changed: the M1 run used a FALSIFICATION CONTROL (the
   same harness against a known-bad state, exiting 1), which section 4 does not
   currently require. That is a real gap and it is taken, as stage E0.5, rather
   than being left as a confirmation.

**The closing check on this record.** Two greps were run over the plan as
re-grounded, and both are reported in the deliverable rather than summarized:
`grep -rP '[^\x00-\x7F]'` over this file, which must report nothing, and the
`CLAUDE.md` claim grep over the changes, whose hits are each either backed by an
adjacent captured command or restated as an open question.

### 1.7 Re-grounding record (revision 3, 2026-08-07): M2 AS DELIVERED

Section 1.6 is revision 2's record and is left standing as history. This
section is revision 3's, and it exists because revision 2's re-grounding was
performed against the M2 PLAN while that plan was DRAFT. M2 is now COMPLETE on
`main` at `dbba3c8`. **Every row below was produced by opening the delivered
artifact, and the row states which.** The full derivation, the commands and
their untruncated output, is
`delivery/work-history/m3-plan-revision-3.md`; what appears here is the result
plus the command that produced it.

**The joints, one row each.** "Confirmed" means the plan's description
survived being checked against the artifact. "CORRECTED" means it did not.

| Joint | Artifact opened on `main` | Result |
|---|---|---|
| CI job structure | `.github/workflows/gates.yml` | **CORRECTED.** One job named `gates`, no matrix, no fan-in (DR-0017). Section 1.1's bullet, D-M3-28's rationale, section 2.3 rule 7's example list and M3-P2 criterion 5b's example list all named the deleted shape. Eight `fan-in` references at revision 2; zero remain as a live claim |
| CI event fork | `.github/workflows/gates.yml` | **CORRECTED BY ADDITION.** The `pull_request` arm and the `push`-to-`main` arm run different bundles. Revision 2 was silent, which is T-009's shape. Now stated in section 1.1, carried into D-M3-28, and it is why every M3 check must declare its arm |
| required status context | `.github/workflows/gates.yml`, DR-0017, DR-0004 | **CORRECTED BY ADDITION.** The context is the literal string `gates`; adding a matrix renames it to `gates (26)` and detaches branch protection. Now a standing constraint on the five phases that edit the file |
| phase declarations | `src/gates/schemas/phase-declaration.schema.json`, `gates.manifest.json`, `src/gates/scope.ts`, `delivery/plan/phase-declarations/README.md` | **CORRECTED, three ways.** Path, camelCase closed field set, and merge-base timing. Plus an ownership gap: nobody created the ten `m3-pN.json` files. Section 1.1 item 3, section 3's preamble, D-M3-33 |
| gate registry as CI's single caller | `.github/workflows/gates.yml`, `scripts/m2-exit-test.sh`, `src/commands/gates.ts` | **CORRECTED.** The M2 exit harness is the SINGLE caller of `gates run`, deliberately, so exactly one `summary.json` is produced per job. Five M3 checks were specified as raw workflow steps, which routes around the authority M3-P2 exists to establish. Section 2.2, D-M3-34 |
| diff-scoped gate semantics | DR-0018, `scripts/m2-exit-test.sh` | **CORRECTED BY ADDITION.** A required diff-scoped gate whose trigger the head does not touch is expected `not-applicable` with a recorded reason, and the runner treats a required gate reporting not-applicable as a failure (exit 20). M3-P2 criterion 3 and exit stage E1.6 both asserted a plain "exits 0 with everything green", which DR-0018 records as unsatisfiable for exactly this reason |
| M2-P6 coverage checker | `src/gates/coverage.ts` | **CORRECTED.** It is config-driven: `--config <path>` validated against `coverage-config.schema.json`, falling back to `KERNEL_COVERAGE_CONFIG` only when absent, with `inventory` and `coverageTable` as two separately configured sources. Section 2.2's stated reason for not reusing it ("every M3 phase a potential edit of M2's gate surface") was false; a second instance costs one config document and one registry entry and edits no M2 source |
| M2-C-2, never green by omission | `src/gates/result.ts` lines 148 to 183, `src/gates/schemas/gate-result.schema.json` | **Confirmed, and it is the constraint M3-P2's own hazard class named and no criterion checked.** `makeGateResult` is the only constructor and rewrites green-with-zero-units to `error` with `vacuous: true`. M3-P2 gains criteria 3b and 3c |
| M2-C-3, fail closed | `src/gates/result.ts`, `src/gates/red-witness.ts` line 454, `src/gates/citations.ts` line 1238 | **Confirmed.** A gate invoked without a parameter it needs is `error`, never not-applicable, and two delivered gates carry the M2-C-3 citation in their own refusal text |
| `modes` reserved field | `src/gates/schemas/gate-manifest.schema.json` line 70 | **Confirmed exactly as the plan describes**: `{"type": "array", "items": {"type": "string"}}`, described as "Reserved for M3's assurance modes ... Validated if present, ignored by the M2 runner, so the promotion is additive" |
| validator diagnostic contract | `src/gates/validate.ts` line 90 | **Confirmed.** `` return `INVALID ${diagnostic.pointer} ${diagnostic.message}`; `` is the module's public contract, so DR-0013 clause 6's "boundary preserved" retirement is keepable. M3-P1 step 1 still verifies M2's TESTS assert the contract rather than engine wording, which is a different claim and remains unverified here |
| `src/gates/schemas/` location | `git ls-tree` | **Confirmed.** Nine schema documents live there and the root `schemas/` is empty but for `README.md`, so D-M3-20's relocation decision has the shape it assumed |
| M2-P2 red-witness harness | `src/gates/red-witness.ts`, `src/gates/schemas/witness-spec.schema.json`, `witness/` | **CORRECTED BY SHARPENING.** The accepted proof is a durable `witness/<id>.json` spec plus the run's `witness-records.json`, not "its evidence file" singular. `dangerousStates[]` has `minItems: 1` and every member must have been red |
| M2-P3 suite wrapper | `src/gates/suite.ts` | **Confirmed and sharpened.** The exit code is bound to the parsed counts in both directions, so R-049/R-086's `wrapper-exit-code` field travels with counts rather than instead of them |
| M2-P5 citation linter | `src/gates/citations.ts`, `gates.manifest.json` | **CORRECTED.** It is a diff-scoped gate (`--base`/`--head`, precondition `diff-touches`), resolves only citations added or modified in the diff (M2-D-21), and never resolves a citation inside backticks or a fenced block (M2-D-22). "Attached verifier" in R-010a therefore means a pass over a diff and needs a base |
| M2-P7 release verification | `src/gates/deploy.ts`, `src/gates/migrations.ts`, `src/gates/release.ts`, `release-record.schema.json` | **Confirmed, with one property named**: the outcome vocabulary is enforced in code as a fail-closed rule and is deliberately NOT a schema enum. M3-P3 references stage ids only, so nothing in M3 restates it |
| M2-P8 credential scoping | `src/gates/credentials.ts`, `gates.manifest.json` | **Confirmed, with the residue named.** The allowlist in `src/exec/env.ts` is the defence; the module's denylist is a bounded tripwire and its own header says a dangerous name outside the walked vocabulary that is also allowlisted would pass green. The implementer brief may cite the scrub as structural and may not call it exhaustive |
| `destructiveCommands` | `gates.manifest.json` | **Confirmed.** Present with four entries (`pool destroy`, `teardown`, `src/pool.ts`, `src/teardown.ts`), which is the key M3-P6's `destructive-authority` clause and M3-P8's `machine-readable-form` both point at (D-M3-26) |
| `A-n` owner-action ids | `gates.manifest.json`, `delivery/STATE.md`, `delivery/plan/kernel-plan-m2.md` | **CORRECTED.** `A-3` is a live M2 owner action AND a literal precondition id inside `gates.manifest.json` on `main`; `A-4` is allocated by both this plan and `delivery/STATE.md` to different acts. Section 7 registers the namespace and moves this plan's ids |

**Decision records and tuition entries dispositioned at revision 3.** Revision
2's section 1.6 table has no row for any of these, and two of the three are
newer than it.

| Input | Disposition |
|---|---|
| `delivery/decisions/DR-0017` (single-job CI, owner, 2026-08-06) | **Cited for the first time; changed five passages.** Section 1.1's workflow bullet, the CR-760 residue statement, section 2.3 rule 7's defang list, D-M3-28's whole rationale, and M3-P2 criterion 5b's parenthetical. The plan cited DR-0017 zero times at revision 2 while five phases wired steps into the file it governs |
| `delivery/decisions/DR-0018` (exit-test semantics for src-scoped gates, owner, 2026-08-07) | **Cited for the first time; changed two criteria.** M3-P2 criterion 3 and exit stage E1.6 both expected every required gate green from a single bundle run. DR-0018 records that a diff-scoped gate whose trigger the head does not touch is legitimately not-applicable, that the runner nonetheless fails a required not-applicable (exit 20), and that the harness therefore carries per-gate green-path evidence separately. Both criteria are rewritten to that shape |
| `delivery/tuition/T-009` (a gate result is evidence only for the run that produced it) | **Cited for its MECHANISM for the first time; changed four passages.** Revision 2's single T-009 hit was a remark about tuition id allocation. Now: exit stage E3.1 names the event, the head sha and completion; section 1.1 states the event fork; D-M3-28 requires every wired check to declare its arm and requires BOTH arms witnessed where behaviour forks; and M3-P9's `AGENTS.md` gains a merge-completion clause with a criterion behind it |
| `delivery/review/arbitration-m3-plan-r2.md` and the two round-2 reports | **The instrument of this revision.** Four mechanisms and eight local findings; the disposition of all twenty findings is in `delivery/work-history/m3-plan-revision-3.md` |

**What revision 3's derivation did NOT cover, stated because an empty result
from a wrongly scoped search is indistinguishable from an absence of defects,
and this project has been bitten by that shape repeatedly.**

1. **No M3 artifact was executed, because none exists.** Every correction above
   is a document change checked against another document or against source on
   `main`. The phases themselves remain unverified by anything except reading.
2. **The M2 gate modules were read for their PUBLIC CONTRACT, not audited.**
   For each of the eleven modules the derivation read the module header, the
   usage string, the flag table, and the code sites that decide status and
   units. It did NOT read the bodies of `src/gates/suite.ts` (1142 lines) or
   `src/gates/citations.ts` (1509 lines) line by line, and it did not run any
   of them. A defect living inside a body whose header describes it correctly
   would not have been found.
3. **M2's TEST suites were not opened.** M3-P1 step 1's obligation is that
   M2's own validation tests assert the `INVALID <json-pointer> <message>`
   contract rather than engine wording. Revision 3 confirmed the module emits
   that string; it did NOT read `test/` to confirm what the tests assert. That
   remains M3-P1's first step and it is a real, unverified precondition of
   DR-0013 clause 6.
4. **`scripts/m2-exit-test.sh` was read for its documented modes and flags, not
   for its assertion code.** The bundle definitions, the `--self-test`
   semantics and the single-caller property come from its header comment and
   from the workflow that invokes it.
5. **Appendix C was not re-audited.** Neither round-2 reviewer audited it, and
   revision 3 touched only item 1 (the coverage-checker option, which is
   downstream of a corrected joint). The other twelve items are unexamined.
6. **The clause-by-clause content of M3-P5 and M3-P6 was not re-derived.**
   Round-2 reviewer B recorded the same exclusion. Revision 3 added the two
   criteria the hazard-class rule forced (M3-P5 criterion 3b, M3-P6 criterion
   9d) and did not otherwise re-examine the remaining cited clauses.

---

## 2. Phase decomposition, and how completeness is checked

### 2.1 EXT-F-07 compliance

EXT-F-07 is binding: the v1 outline's M3-P4 (the 74-row migration walk) may not
be dispatched as one phase, and detailed planning must divide it by artifact
family into at least six subphases, each with its own requirements coverage
input and its own orphan check. The division here is seven phases covering the
six named families, because one family (role briefs) is split in two and the
other five map one to one:

| EXT-F-07 family | Phase here | Rows |
|---|---|---|
| role briefs | M3-P5 (investigator, plan writer, adversarial plan reviewer) and M3-P6 (implementer, clean-room reviewer) | 7 and 13 |
| review checklists | M3-P7 | 13 |
| orchestrator policy | M3-P9 | 11 |
| reporting and work-history templates | M3-P4 | 9 |
| tuition flow | M3-P8 | 3 |
| assurance-mode behaviour | M3-P3 | 3 |

Seven phase ids, six families, one split: the role-brief family is divided
because a single phase carrying all twenty brief rows would be a catch-all of
exactly the shape EXT-F-07 objects to. The other three phases of this plan
(M3-P1 schemas, M3-P2 gate registry, M3-P10 release) are the v1 outline's own
separate items 1, 3, and 5 and are not part of the migration walk, which is why
they do not appear above. No phase in this plan carries more than thirteen
requirement rows, and each of the seven has its own coverage input (its row list
in Appendix A) and its own orphan check (the clause-map criterion in its
acceptance list), which is what EXT-F-07 requires of each subphase.

Arithmetic note (M3R-006): revision 0 of this plan said "eight phases" here and
in its process summary, which its own table contradicted. Seven is the number
the table shows and the number that is true.

### 2.2 The clause map: the per-phase orphan check

A row like R-034 ("stop and escalate, never improvise") lands as a clause in a
prose brief. Nothing in M1 or M2 can check that. EXT-F-07 requires a per-subphase
orphan check, so M3-P1 builds the smallest thing that provides one:

`delivery/requirements/clause-map.json` maps each M3 row to
`{phase, artifact, clause}`, and `scripts/check-clause-map.mjs` fails if a row
owned by a merged phase has no entry, if the named artifact file does not
exist, or if the clause id does not occur in that artifact. Every artifact M3
ships carries clause ids: in frontmatter and body headings for briefs and
`AGENTS.md`, as `id` fields for checklist probes and gate entries, as
`$comment` clause tags or property names for schemas.

**The row INVENTORY, specified at revision 3 (A-007), because without it the
first of those three conditions cannot fire.** Conditions two and three are
computable from `clause-map.json` alone. Condition one is not: "a row owned by
a merged phase has no entry" needs an INDEPENDENT enumeration of which rows
exist and which phase owns each, and revision 2 never said where that
enumeration comes from. If the script takes `clause-map.json` as its own
inventory then a phase that omits one of its rows produces a green check, and
stage E0.1's "exits 0 over all 74 rows" is satisfied by a file containing
seventy-three. A completeness checker whose only input is the thing whose
completeness is in question is a presence check wearing a completeness
checker's name, and that is the same guard-condition failure T-008's postscript
records one level up.

So the inventory is named, and it is named as a SEPARATE configured source in
exactly the shape M2-P6 already uses:

- **inventory**: Appendix A of this document, the 74-row table, parsed as a
  markdown row table with id pattern `R-[0-9]+[a-z]?` in column 1 and the
  owning phase `M3-P[0-9]+` in column 2. It is a second source from the map,
  authored by a different act (planning, not implementation), which is the
  property that makes the comparison meaningful.
- **coverage table**: `delivery/requirements/clause-map.json`, id pattern the
  same, one entry per row.
- **merged-phase determination, stated mechanically rather than left to the
  reader**: a phase is IN FORCE when its artifact file named in the inventory
  row exists in the working tree. `git merge-base` is deliberately not used,
  because the check must give the same answer on a phase branch, in CI on both
  events, and in the exit run. A row whose phase is not yet in force is
  reported as `pending <phase>` and does not fail the check; a row whose phase
  IS in force and has no entry fails it, naming the row and the phase.
- The check therefore fails in FOUR conditions, not three: a row in the
  inventory owned by an in-force phase with no map entry; a map entry naming a
  row that is not in the inventory (the reverse direction, which catches an
  invented row); a named artifact file that does not exist; and a clause id
  that does not occur in its artifact.

M3-P1 criterion 9b (new at revision 3) is the witness that condition one is
live: DELETING an entry from `clause-map.json` for a row whose phase is in
force makes the check exit nonzero naming the row and the phase, and restoring
it returns exit 0. Criterion 9 already witnesses condition three; without 9b
the row-level condition has no red witness at all and the plan would be
shipping a guard whose own condition was never tested, which section 2.3 rule 3
forbids for every other check in this document.

This is the same pattern as `test/behaviors.json`, which is already proven in
this repository across three phases: one registry, appended by every phase,
checked by name and never by count. Like `test/behaviors.json`, the clause map
and the phase work history are standing pre-authorized extras on every M3
phase's files-to-touch list.

**Why this is a separate script rather than a second M2-P6 instance, restated
at revision 3 because revision 2's reason was FALSE against M2 as delivered
(A-008).** Revision 2 said: "Extending a merged M2 component from an M3 phase
would make every M3 phase a potential edit of M2's gate surface." That is not
what a second instance costs. `src/gates/coverage.ts` is CONFIG-DRIVEN: it
takes `--config <path>` validated against
`src/gates/schemas/coverage-config.schema.json` and falls back to the built-in
`KERNEL_COVERAGE_CONFIG` only when the flag is absent, so a second coverage
instance is one new JSON config document plus one new registry entry and edits
no M2 source file at all.

```
$ git show origin/main:src/gates/coverage.ts | sed -n '741,744p'
function resolveConfig(configPath: string | undefined): LoadedConfig | FailedConfig {
  if (configPath === undefined) {
    return { ok: true, config: KERNEL_COVERAGE_CONFIG };
```

The real reason, which survives being checked: **the two checks answer
different questions over different shapes.** M2-P6's coverage gate compares two
ID TABLES and asks whether every id in the inventory appears in the coverage
table with an accepted reference type. The clause map's third and fourth
conditions ask whether a named CLAUSE STRING occurs inside an arbitrary
artifact of the implementer's choosing, which is a text-occurrence check over
markdown briefs, YAML checklists and JSON schemas, and `coverage.ts`'s
configured shape (`path` plus `idPattern` per source) has nowhere to express
"and then grep this third file for this id". Folding the clause map into it
would require widening the coverage config's own schema, which IS an edit to
M2's gate surface, whereas running a second instance is not.

**What is taken from M2-P6 rather than declined**, and it is the half that was
missing: the inventory-versus-coverage-table SEPARATION above. That separation
is not optional in the clause map, it is the thing that makes condition one
computable, and M2 has a delivered, working, tested precedent for it. Merging
the two tools remains a recorded option for M4 or later, not a debt (Appendix C
item 1), and Appendix C item 1's stated cost is corrected there too.

**Where the check RUNS, decided at revision 3 (D-M3-34).** It is a
`gate-registry.yaml` entry, not a raw workflow step; see section 2.2a.

### 2.2a Where M3's new checks run: through the registry, not around it

**New at revision 3 (A-011, D-M3-34).** Revision 2 wired five new checks into
`.github/workflows/gates.yml` as direct `run:` steps:
`check-clause-map.mjs` (M3-P1), `render-agent-rules-gates.mjs --check` (M3-P2),
`check-brief-drift.mjs` (M3-P6), `check-agents-references.mjs` and
`check-dual-review.mjs` (M3-P9). None of them was declared as a registry entry
anywhere in the plan. That is a plan that builds an authority and then routes
its own checks around it, and it has three consequences the plan never stated
it was accepting:

1. **The exit test's central gate-coverage claim would not cover M3's own
   checks.** Stage E1.6 asserts the gate runner over `gate-registry.yaml
   --mode full` reports every applicable gate green with nothing vacuous. Five
   of M3's checks would be outside that run, so no evidence record in the
   bundle would name them.
2. **R-094's property would be falsified by this plan's own additions on the
   day M3-P2 merges.** "The single source consumed by CI and briefs" is the
   row; five checks consumed by CI and absent from the source is the opposite.
3. **Event applicability would be unstated, which is T-009 one level down.**
   The workflow forks on `github.event_name`. A raw `run:` step with no `if:`
   executes on BOTH arms; one with an `if:` executes on one. Revision 2
   specified neither, so no one could say whether a given check is green on
   `main`.

There is a fourth fact revision 2 could not have known and revision 3 must
respect: **M2 deliberately made the exit harness the SINGLE caller of
`gates run`**, so that exactly one gate set runs and exactly one `summary.json`
is produced per job. The workflow says so in its own comment, and M2-P1's two
interim bundle steps were removed to achieve it. Adding raw steps does not
break that property, but adding a SECOND `gates run` call would, so "just add
another runner invocation" is not available either.

**The decision (D-M3-34): every M3 check enters `gate-registry.yaml`.** Each
one is declared with an `id`, a `command`, a `unitLabel`, an `applicability`,
a `precondition` where one applies, and, new in the M3 registry, a required
`events[]` field naming which CI events the check is evaluated under
(`pull_request`, `push`, or both). Consequences, all of them binding:

- The runner selects them by mode and event, so they run inside the one
  `gates run` the harness already makes and the single-caller property is
  preserved.
- Each check's process is a gate subprocess under M2-P1's contract: it writes
  ONE `GateResult` through `makeGateResult`, so M2-C-2 and M2-C-3 apply to
  M3's checks automatically rather than by remembering. A clause-map check
  that examined zero rows becomes `error` with `vacuous: true`, which is
  exactly the property a raw `run:` step does not have.
- `gates.manifest.json` joins the `files-to-touch` list of every phase that
  registers an entry (P1, P2, P6, P9, P10), per the phase-declarations
  README's M2R-020 rule, and those additions are unions against the merge base
  in the same way `test/behaviors.json` is.
- The five phases still edit `.github/workflows/gates.yml`, but only where a
  step genuinely belongs at workflow level (M3-P10's release wiring is the one
  clear case). Any check that stays a workflow step must state WHY in the
  phase's step list and must declare its event arm, and section 2.3 rule 7's
  execute-the-extracted-step criterion still applies to it.
- Stage E1.6 then covers M3's own checks, which is what makes it worth
  asserting.

### 2.3 Two kinds of check, and what the red-witness rule demands of each

M3 mostly ships schemas and prose. Revision 0 of this plan applied one witness
methodology to every validation criterion, and the review found that several of
those criteria describe properties no JSON Schema keyword can express, under any
DR-0013 option (M3R-002). Conflating the two kinds is how an implementer arrives
at a criterion that cannot be met, and then either fakes the demonstration or
builds an undeclared script. So the two kinds are separated here, by name, and
every validation criterion in this plan states which kind it is.

**Kind A, schema checks.** Properties of one document that a schema keyword
expresses: a required field, a closed enum, a value constrained by a sibling
value through `if`/`then`, an array with a minimum length, a pattern, an
`additionalProperties: false` boundary, a `contains` requirement on an array.
These are enforced by the schema and witnessed as in rules 1 and 2 below.

**Kind B, derived checks.** Properties that require comparing array elements to
each other, resolving a reference into another document, computing arithmetic
over sibling fields, or touching the filesystem. JSON Schema cannot express
these, and this plan does not pretend otherwise. They are implemented as named
derived checks in `src/checks.ts`, registered per artifact type and run by
`tiphys validate` after schema validation succeeds, each reporting
`INVALID <json-pointer> <message> (check: <check-id>)` and each contributing to
the same nonzero exit. `tiphys validate --context <dir>` supplies the directory
against which cross-document references resolve; a derived check that needs a
context it was not given reports `SKIPPED <check-id> no context` and the command
exits nonzero, so a cross-document rule can never pass by not being run. The
plan already contained one instance of this pattern before the review named the
class (M3-P1's `dispatchable` boolean, "the validator computes and reports"); the
review's contribution was noticing that four more criteria needed it and did not
say so.

The rules, binding on every phase's acceptance criteria:

1. Every schema ships at least one invalid fixture that is well-formed YAML or
   JSON and structurally plausible, and that violates precisely the property the
   schema exists to enforce. A fixture that is merely malformed (a syntax error,
   a missing required field chosen at random) does not count: that is the
   "test against the absent feature" T-003 names as worthless.
2. Kind A witness: every such fixture is demonstrated in both directions,
   rejected by the shipped schema and accepted when the guarding keyword is
   removed from the schema. Both demonstrations are captured in the work history
   and reverted.
3. Kind B witness: the same DANGEROUS-instance discipline applies, but the
   thing removed and restored is the derived check, not a schema keyword. The
   fixture is rejected with the check registered and accepted with it
   deregistered, both captured and reverted. A Kind B criterion that offers a
   schema-keyword witness has misclassified itself and fails review.
4. Where an artifact's content consumes another program's output (the gate
   registry consuming the M2 gate runner's report, the report contract
   consuming the M2 full-suite wrapper's exit code and counts, the checklists
   consuming the M2 red-witness harness's evidence file), the fixtures must
   contain real captured output from that program. Hand-written strings shaped
   to match the schema are forbidden by the red-witness rule's last sentence
   and by T-003 lesson 4.
5. Every derived check is listed in the table below when its phase introduces
   it, so the class stays auditable rather than being rediscovered per phase.
6. **One witness is not a class (revision 2, `CLAUDE.md`).** Where a criterion
   below says a fixture witnesses a CLASS of invalid instance rather than one
   instance, at least TWO structurally different members of that class must be
   demonstrated red. M1-P6 produced two consecutive medium findings from this
   alone: one defang reddened a guard test and three others left it green, and
   the round after it repeated the mistake one abstraction up. Applied to this
   plan, the criteria it binds are the ones whose language is plural, and each
   of them now names its two members explicitly rather than saying "a fixture":
   M3-P1 criterion 5 (a misspelled property at two different object depths),
   M3-P6 criterion 2 (section deletion witnessed per section, already plural),
   M3-P7 criterion 3b (probe-text weakening witnessed on two different probes),
   and M3-P9 criterion 3 (a gate list AND a mode table, which revision 1
   already listed as three and which therefore already complies).
7. **A check wired into CI is a behaviour, not a text, and its EVENT ARM is
   part of the behaviour (revision 2, restated at revision 3, D-M3-28).**
   Five M3 phases touch `.github/workflows/gates.yml`. A test that asserts a
   step's TEXT is present catches deletion and misses defanging, which M1-P6
   confirmed six times across four rounds. **The defang list is restated at
   revision 3 against the workflow as it now is**: `exit 1` changed to
   `exit 0`; two placements of `|| true`; a step-level `if: false`; a quoted
   YAML key the whitelist regex could not see; and, replacing the stale sixth
   member, an `if:` condition narrowed so the step runs on only one CI event
   (revision 2's sixth member was "the step moved into a job the fan-in does
   not need", and DR-0017 deleted the fan-in, so that member cannot occur and
   a criterion written against it would be green and worthless). Every M3
   criterion asserting that a check is wired EXECUTES the extracted step
   against stubs and observes its exit code; where a text assertion is
   unavoidable it is labelled as such and the residue is named.
   **Two additions at revision 3, both from T-009.** First, a criterion
   asserting a check is wired must also assert WHICH EVENT ARM it runs under,
   because a gate result is evidence only for the configuration that produced
   it and the workflow runs different bundles on `pull_request` and on `push`
   to `main`. Second, where a check's behaviour FORKS on the event, both arms
   need a witness: one witnessed arm and one unwitnessed arm is the exact shape
   that left `main` red for four hours and twenty-one minutes, and the
   unwitnessed arm is the one that broke. A check declared in
   `gate-registry.yaml` with an `events[]` field (section 2.2a) discharges the
   first addition by construction, which is one of the reasons D-M3-34 routes
   the checks there.

Derived checks this plan requires, by owning phase. The review's list was
explicitly representative rather than exhaustive, so this table is the result of
auditing every validation criterion in the plan for the pattern, and it contains
three instances the review did not name (`checklist-probe-ids-unique`,
`tuition-target-exists`, `charter-mode-enum-matches-modes`). **Revision 2 adds
one row, `verdict-hazard-classes-addressed`, bringing the count to sixteen**;
D-M3-22's "fifteen Kind B checks" is corrected there. **Revision 3 adds one
more, `plan-hazard-classes-addressed-by-resolves` (section 2.6, D-M3-35),
bringing the count to SEVENTEEN**, owned by M3-P1, which already owns
`src/checks.ts` and two other rows so no phase acquires a new file:

| Check id | Phase | Property, and why no schema keyword reaches it |
|---|---|---|
| `plan-verification-first-present` | M3-P1 | matches a `report-code-disagreement[]` entry against a step inside a different array element selected by phase id: a foreign-key lookup across arrays |
| `plan-dispatchable` | M3-P1 | computes a derived boolean from the `fill-in` slots (already framed this way in revision 0) |
| `mode-no-undeclared-downgrade` | M3-P3 | compares a mode's `pipeline[]` against the sibling `full` mode's, a cross-object comparison inside one file |
| `mode-stage-order` | M3-P3 | asserts `adversarial-plan-review` precedes `implement`, a position-of-A-before-position-of-B property |
| `mode-gate-sets-resolve` | M3-P3 | resolves gate-set references into `gate-registry.yaml`, a different document |
| `charter-mode-enum-matches-modes` | M3-P3 | asserts the charter schema's mode enum equals the ids in `assurance-modes.yaml`, so the duplication cannot drift |
| `report-parity-arithmetic` | M3-P4 | asserts `discovered == passed + failed + skipped + did-not-run`, arithmetic over sibling fields |
| `final-report-finding-parity` | M3-P4 | asserts every id in `inputs[]` appears in `input-findings[]`, a cross-array completeness property. Revision 0 listed this once as a schema witness and once, correctly, as an M2-P6 checker run; the schema framing was wrong and is removed |
| `gate-probes-resolve` | M3-P7 | resolves `gate-registry.yaml` probe ids into `checklists/clean-room.yaml`, a different document |
| `checklist-probe-ids-unique` | M3-P7 | `uniqueItems` compares whole array items, not one nested property across items, so probe-id uniqueness is not a keyword property |
| `verdict-criteria-complete` | M3-P7 | compares a verdict's `criteria[]` against the acceptance criteria of a plan phase in a different document |
| `verdict-deviations-judged` | M3-P7 | compares a verdict's `deviations-judged[]` against the deviations declared in a work history, a different document (M3R-005) |
| `verdict-hazard-classes-addressed` | M3-P7 | NEW at revision 2 (T-007): compares a `hazard` verdict's `hazard-classes-addressed[]` against the `hazard-classes[]` of a plan phase in a different document. Same cross-document completeness shape as `verdict-criteria-complete`, one field along |
| `dual-review-decorrelation` | M3-P9 | compares two verdict documents' `produced-by` values and their injected probe framings (M3R-004) |
| `tuition-target-exists` | M3-P8 | resolves an `applied` structural consequence's target path against the filesystem |
| `mechanism-rule-evidence-resolves` | M3-P8 | resolves each mechanism-index rule's evidence references, and any `machine-readable-form` path and key, against real files (T-005's checkability rule, extended by D-M3-26 to the M2 manifest coupling) |
| `plan-hazard-classes-addressed-by-resolves` | M3-P1 | NEW at revision 3 (section 2.6, D-M3-35): resolves each `hazard-classes[].addressed-by` criterion id INTO the SAME phase's `acceptance[]` ids, a foreign-key lookup between two sibling arrays of one phase object, and fails on one that resolves to nothing. `enum` cannot express it because the admissible values are computed per phase, not fixed |

Anything an implementer finds that belongs in this table and is not in it is a
plan defect to escalate, not a script to write quietly: D-M3-22 says so, and the
M2-P4 scope auditor would fail the undeclared file anyway.

### 2.4 Shared phase fields, stated once

- migrations: none. This is a library.
- parallelizable (DR-0011, section 1.3): **section 2.5 now carries the
  derivation and this bullet carries only its outcome.** M3-P1 through M3-P3
  and M3-P10 are no; M3-P7 beside M3-P8 is conditionally yes. Revision 1
  asserted this in one sentence; revision 2 shows the work, because M2's
  pre-pass demonstrated that a plan written sequentially is not necessarily
  sequentially CONSTRAINED and that nobody had checked. For M3 the check was
  run and the conclusion did not move, which is a result and not a formality
  (D-M3-19, unchanged in substance).
- substrate (DR-0007): substrate-neutral for M3-P1 to M3-P9 (all of it is
  files, schemas, and text). M3-P10 is the exception and says so.
- invocation form (PR-102): `tiphys <cmd>` means `node bin/tiphys.ts <cmd>`;
  the exit run and the release verification use the compiled `dist/bin/tiphys.js`.
- test accounting rule (EXT-F-05): each phase names its new behaviors, adds at
  least one identified test per behavior, registers the mapping in
  `test/behaviors.json`, reports zero unaccounted tests, and loses no
  previously registered mapping, checked by name and never by count.
- standing pre-authorized extras on every files-to-touch list:
  `test/behaviors.json`, `delivery/requirements/clause-map.json`, and
  `delivery/work-history/m3-pN.md`.
- every phase runs `grep -rP '[^\x00-\x7F]'` over its touched files and records
  a clean result (conventions, `CLAUDE.md`).
- suggested model tier is stated per phase, per R-075's own rule.
- **hazard class, NEW at revision 2 (T-007, D-M3-32).** Every phase section
  below declares a hazard class beside its acceptance criteria: what a defect
  in THIS phase would look like if the criteria were all met. It is the second
  review contract's input and a pre-submit self-review for the implementer. The
  hazard classes are the plan's, not the implementer's; an implementer who
  believes one is wrong escalates rather than rewriting it. **Revision 3 adds
  the obligation that makes the field checked rather than documented (section
  2.6, D-M3-35): every item in a phase's hazard class names the numbered
  acceptance criterion that reddens against it, or one of section 2.6's three
  admissible reasons why none can, in a `hazard class to criterion` table
  immediately below the paragraph. An item with neither is a plan defect.**
  T-007's evidence is
  that two reviewers on different model families walked all fifteen of a
  phase's acceptance criteria by direct execution, agreed on every mechanical
  fact, and one found a high-severity defect that live-locked every supervision
  command, because no criterion described it.
- **path reads, NEW at revision 2 (D-M3-27).** Every M3 command that opens a
  path it did not create goes through the delivered `classifyEntry` and
  `refuseOpenForWrite` in `src/task.ts`, never a bare `readFileSync`,
  `openSync`, `appendFileSync` or `renameSync`. A path that is not a regular
  file makes the command report an error naming the path and the observed type,
  and no M3 command blocks indefinitely on a path it did not create. Each phase
  that adds such a command carries one criterion staging the dangerous state
  with a real `mkfifo`, in both directions.
- **CI wiring, NEW at revision 2 (D-M3-28).** A criterion asserting that a
  check is wired into `.github/workflows/gates.yml` executes the extracted step
  against stubs and observes its exit code; a text assertion is labelled as
  such and its residue named (section 2.3 rule 7).

### 2.5 M3's parallel structure, derived rather than asserted

DR-0011 condition 1 requires a recorded pairwise files-to-touch disjointness
check BEFORE each parallel dispatch. Revision 1 satisfied the letter of
D-M3-19 with a sentence. Revision 2 records the derivation, in the shape
`delivery/plan/m2-conflict-pre-pass.md` established, so a dispatching
orchestrator reads a table rather than re-deriving one. **This is the plan's
statement, not the dispatch-time check**: the dispatch-time check is still
required, is still run over the real lists on the day, and still cancels a
parallel start on any overlap it finds.

**The dependency graph, read from this plan's own `grounding` and `blocked-by`
fields, one row per phase:**

| Phase | Grounds on (its own field) | Can start when |
|---|---|---|
| M3-P1 | M2 merged with exit evidence on `main` | M2 exit test passes |
| M3-P2 | M3-P1 merged | P1 merges |
| M3-P3 | M3-P2 merged | P2 merges |
| M3-P4 | M3-P3 merged | P3 merges |
| M3-P5 | M3-P4 merged | P4 merges |
| M3-P6 | M3-P5 merged | P5 merges |
| M3-P7 | M3-P6 merged | P6 merges |
| M3-P8 | M3-P6 merged (**corrected at revision 3**; revision 2 said M3-P7, and P8's grounding names no P7 artifact) | P6 merges; MERGES after P7 |
| M3-P9 | M3-P8 merged | P8 merges |
| M3-P10 | M3-P1 to M3-P9 merged | all merge |

**The graph result, and it is the opposite of M2's.** M2's pre-pass found that
nothing between P2 and P8 grounded on anything between P2 and P8, so a plan
written sequentially was not sequentially constrained. **M3's chain is
genuinely a chain**: every phase from P2 to P9 grounds on its immediate
predecessor by name, and each grounding is a real consumption rather than an
ordering habit. The consumptions, so the claim is checkable rather than
restated: P2 needs P1's validator and clause map to validate the registry at
all; P3 resolves gate-set references INTO P2's `gate-registry.yaml`; P4's
report contract is referenced by type name from P5's and P6's briefs; P5 ships
`schemas/role-brief.schema.json` and `brief compose`, which P6 extends rather
than reinvents; P7's checklists must supply the probe ids P2's registry entries
name and are referenced by P6's clean-room brief; **P8 consumes P6, not P7**
(it replaces P6's stub index and re-witnesses P6's mandated-reading path, and
names no P7 artifact anywhere in its grounding; corrected at revision 3, see
the qualified-yes paragraph below); P9 references all of them and its own
anti-duplication check fails if any is absent. **So the chain is genuinely a
chain from P2 to P7 and again from P8 to P9, with one link, P7 to P8, that is
a MERGE-ORDER constraint rather than a consumption.**

**Pairwise file overlap, RECOMPUTED at revision 3 (A-005), because revision 2's
three counts were not derived from the lists they claimed to be derived from.**
Revision 2 asserted "nine of the ten phases edit `src/cli.ts` or
`src/validate.ts` or both" and "six edit `package.json`'s `files` array". The
true numbers are SEVEN and NINE. This matters more than a typo would: DR-0011
condition 1 asks for a disjointness CHECK, and a check computed from wrong
inputs returns a result indistinguishable from a correct one, which is the
fix-round contract's item 3 failure applied to a pre-pass. The counts are now
produced by a command over the plan's own `files-to-touch` blocks, so they stay
falsifiable across revisions rather than being re-asserted:

```
$ for n in 1 2 3 4 5 6 7 8 9 10; do
    s=$(grep -n "^### M3-P$n:" delivery/plan/kernel-plan-m3.md | cut -d: -f1)
    e=$(awk -F: -v s=$s '$1>s{print $1; exit}' <(grep -n "^- blocked-by" delivery/plan/kernel-plan-m3.md))
    blk=$(sed -n "${s},${e}p" delivery/plan/kernel-plan-m3.md \
          | sed -n "/^- files-to-touch/,/^- \(conflicts-with\|acceptance\|hazard\|citations\)/p")
    printf "M3-P%-2s cli=%s validate=%s checks=%s pkgjson=%s workflow=%s\n" "$n" \
      "$(echo "$blk"|grep -c 'src/cli.ts')" "$(echo "$blk"|grep -c 'src/validate.ts')" \
      "$(echo "$blk"|grep -c 'src/checks.ts')" "$(echo "$blk"|grep -c 'package.json')" \
      "$(echo "$blk"|grep -c 'workflows/gates.yml')"
  done
M3-P1  cli=1 validate=1 checks=1 pkgjson=1 workflow=1
M3-P2  cli=1 validate=1 checks=0 pkgjson=1 workflow=1
M3-P3  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
M3-P4  cli=0 validate=1 checks=1 pkgjson=0 workflow=0
M3-P5  cli=1 validate=1 checks=0 pkgjson=1 workflow=0
M3-P6  cli=0 validate=0 checks=0 pkgjson=1 workflow=1
M3-P7  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
M3-P8  cli=1 validate=1 checks=1 pkgjson=1 workflow=0
M3-P9  cli=0 validate=0 checks=1 pkgjson=1 workflow=1
M3-P10 cli=0 validate=0 checks=0 pkgjson=1 workflow=1
```

The true counts, one line each:

| File | Phases that list it | Count |
|---|---|---|
| `src/cli.ts` or `src/validate.ts` or both | P1, P2, P3, P4, P5, P7, P8 | **7** (revision 2 said nine) |
| `src/cli.ts` | P1, P2, P3, P5, P7, P8 | 6 |
| `src/validate.ts` | P1, P2, P3, P4, P5, P7, P8 | 7 |
| `src/checks.ts` | P1, P3, P4, P7, P8, P9 | **6** (revision 2 said six; correct, and it matches the six owning phases in section 2.3's derived-check table exactly) |
| `package.json` | all but P4 | **9** (revision 2 said six) |
| `.github/workflows/gates.yml` | P1, P2, P6, P9, P10 | 5 (matches the five phases named throughout) |

**The stated CAUSE was false as well, and it is the more useful correction.**
Revision 2 explained the overlap with "because every phase registers its own
artifact types with the validator's `--type` table". P6, P9 and P10 contradict
it: they ship artifacts (`roles/implementer.md`,
`roles/clean-room-reviewer.md`, `AGENTS.md`, the release scripts) and register
no validator type at all, which is why they list neither file. So there are
two different serialisation arguments in play and they have different failure
modes, and revision 3 separates them: **P4 through P8 are constrained by FILE
OVERLAP on the two hand-edited tables; P6, P9 and P10 are constrained by
DEPENDENCY, because each reads an artifact an earlier phase ships.** A reader
who conflated them would conclude that P9 must serialise for a merge reason
when it must serialise for a consumption reason.

**These are not append-only registries keyed by name**, which is what let M2
resolve `test/behaviors.json` and `gates.manifest.json` as a union:
`src/cli.ts` is a dispatch table and `src/validate.ts` is a type table, both
hand-edited source, and a union merge over source is not a resolution rule, it
is a hope.

| Pair | Overlap beyond the standing extras | Parallelizable, and on which ground |
|---|---|---|
| P7 beside P8 | `package.json` `files` (one line each: `checklists` and `tuition`); `src/validate.ts` type table; `src/cli.ts` dispatch table; `src/checks.ts` registry | **conditionally yes**, see below |
| P4 beside P6 | **NONE.** P4 lists `src/validate.ts` and `src/checks.ts` and not `package.json`; P6 lists `package.json` and `.github/workflows/gates.yml` and neither of P4's two. The intersection outside the standing extras is empty | **no, on DEPENDENCY grounds only**: P6's briefs reference M3-P4's report and work-history types by name. Recorded explicitly because revision 2's catch-all row asserted a file overlap here that does not exist, and a serialisation justified by a false reason is one nobody can re-check |
| any pair involving P9 or P10 | `package.json` `files`, plus `src/checks.ts` for P9 | **no, on DEPENDENCY grounds**: P9 references every earlier artifact and its anti-duplication check fails if any is absent; P10 requires all nine merged |
| every other pair | `src/cli.ts` and/or `src/validate.ts` and/or `src/checks.ts`, plus at least one artifact the later phase reads | no, on BOTH grounds |

**The one qualified yes, restated honestly (revision 2 narrowed revision 1's
claim; revision 3 widens the overlap it names by one file).** Revision 1 said
M3-P7 and M3-P8's lists "share only the standing pre-authorized extras and
`package.json`'s `files` array, and that overlap is one line each". Revision 2
corrected that to include `src/validate.ts` and `src/checks.ts`. The recount
above adds a third: both also list `src/cli.ts`. So the pair is parallelizable
only under a stronger condition than either earlier revision stated, and the
condition is named here rather than discovered at merge: **all three edits are
single-line appends to three lists, and the pair may be dispatched concurrently
only if the dispatch-time check confirms that both phases' edits to
`src/cli.ts`, `src/validate.ts` and `src/checks.ts` are appends and not
restructurings.** If either phase needs to restructure the dispatch table, the
type table or the check registry, the pair serialises. Under DR-0011 condition
1 an overlap cancels the parallel start unless the resolution rule is written
down first, and this paragraph is that rule.

**And the pair's other field must agree with this one (A-006).** Revision 2
declared P7 beside P8 conditionally parallelizable while M3-P8's `blocked-by`
read "M3-P7 merged", which is an unconditional serial dependency; the two
fields could not both be right, and an orchestrator following section 3 would
serialise while one following section 2.5 would not. Checking what P8 actually
CONSUMES settles it: M3-P8's own `grounding` names `tuition/README.md`
(M1-P1), M3-P6's seed `mechanism-index.yaml`, M3-P1's charter `retention`
field, and the M1-P2 doctor. **No M3-P7 artifact is named anywhere in it**, and
section 2.5's own consumption list says the same thing one line along ("P8
replaces P6's stub index and re-witnesses P6's mandated-reading path"), which
is a consumption of P6. So the "M3-P7 merged" in P8's `blocked-by` was an
ordering habit, which is precisely the thing this derivation exists to detect.
Revision 3 resolves it in the direction the evidence points: **M3-P8's
`blocked-by` becomes "M3-P6 merged", plus the standing rule that merge order is
dependency order so P8 merges after P7.** The consumption list at the top of
this section is corrected to name P6 in P8's row. The real parallel question is
therefore P6 beside P7 beside P8, and it is answered rather than left open: P6
beside P7 is NO, because P7's checklists are referenced by P6's clean-room
brief and P7's probe ids are named by P2's registry entries that P6's brief
renders; P7 beside P8 is the conditional yes above. P6 must still merge before
both.

**What the derivation is worth, stated so nobody reads it as a disappointment.**
M2's pre-pass bought roughly 22 hours of wall clock. M3's buys at most one
phase overlap and possibly none. The value here is not the saving: it is that
DR-0011 condition 1 is now DISCHARGED IN WRITING for M3 before dispatch,
including the correction to revision 1's overlap claim and revision 2's three
miscounts, which is exactly the kind of thing that is expensive to find during
a merge and cheap to find now.

### 2.6 Every hazard class names the criterion that reddens against it

**NEW at revision 3, binding on every phase in section 3 and on the plan schema
M3-P1 ships (D-M3-35).**

Revision 2 added `hazard-classes[]` to every phase (D-M3-32) as T-007's
structural consequence: a criteria-walking review cannot find a defect the
criteria do not describe, so the plan states, per phase, what a defect would
look like if every criterion were met. The field was populated with genuinely
sharp, mechanically-checkable hazards. Then several of them appeared NOWHERE in
the phase's acceptance criteria, which converts the field from an obligation
back into documentation.

The sharpest measured instance, and the reason this is a rule rather than a
reminder. M3-P2's hazard class names "a promotion that silently drops M2's
`units`-greater-than-zero rule, so a gate examining nothing reports green
lawfully". That is M2-C-2, the anti-vacuous-green constraint the whole of M2's
gate contract exists to enforce, and it is enforced on `main` inside
`makeGateResult`. Round 2's reviewer ran `grep -in units` over all 4905 lines
of revision 2 and got two hits, both inside M3-P2's own grounding and hazard
prose: not one of the phase's seven criteria, not the sixteen-row derived-check
table, not the behaviors list, not the exit test. The registry promotion could
therefore have dropped M2's central safety property and passed every criterion
the phase declared.

**The rule.** Every item in a phase's `hazard-classes[]` must name EITHER the
numbered acceptance criterion that reddens against it, OR an explicit recorded
reason why no criterion can. A hazard class item with neither is a plan defect,
raised as a finding rather than fixed silently by the implementer.

**How it is discharged in this document**: each phase in section 3 carries,
immediately after its hazard-class paragraph, a `hazard class to criterion`
table with one row per item. The table is part of the plan, not a review aid,
and revision 3 building it added criteria to four phases (M3-P2 3b and 3c,
M3-P5 3b, M3-P6 9d, M3-P9 5b) and marked five items as structurally
uncheckable with the reason stated.

**The three admissible reasons for "no criterion can", and nothing else is
admissible.** Anything outside this list is a criterion that was not written.

1. **It is a JUDGMENT property of prose.** A clause whose text says something
   weaker than the row it discharges is not decidable by any test; the honest
   answer is that the second review contract's hazard reviewer is the only
   instrument, and the row says so and names the checklist probe that asks.
   This is not a loophole, because the probe id is itself checkable and
   `verdict-hazard-classes-addressed` requires a statement per class.
2. **It is a property of a state the milestone never enters.** Building an
   enforcement for it is risk 1's shape (M1-P3). The row names the state and
   the milestone that reaches it.
3. **The verification requires an artifact that does not exist yet at this
   phase.** The row names the later phase whose criterion covers it, and that
   phase's own table carries the row. A hazard deferred this way must land
   somewhere; a deferral naming no later phase is a plan defect.

**How this rule reaches the kernel, so it is a deliverable and not only a
repository practice.** M3-P7's verdict schema already requires
`hazard-classes-addressed[]` with one finding-or-cleared statement per declared
class (`verdict-hazard-classes-addressed`). Revision 3 adds the other half:
M3-P1's plan schema gives each `hazard-classes[]` item the shape
`{id, statement, addressed-by}` where `addressed-by` is required and is either
a criterion id from the same phase's `acceptance[]` or one of the three reasons
above with its named target, and a Kind B derived check
`plan-hazard-classes-addressed-by-resolves` (section 2.3's table, added at
revision 3) resolves each `addressed-by` criterion id INTO the same phase's
`acceptance[]` and fails on one that resolves to nothing. So a future project
inherits the obligation mechanically rather than inheriting a paragraph about
it.

---

## 3. Phases

### 3.0 Pre-dispatch step, before the first M3 branch is created

**NEW at revision 3 (A-009, D-M3-33). This is not a phase and it is not
optional; without it M3-P1's first pull request fails the scope gate.**

The M2-P4 scope auditor reads `delivery/plan/phase-declarations/<phase>.json`
out of the MERGE BASE of the audited branch, so a declaration that is not on
`main` when the branch forks cannot govern that branch. Every M3 branch is
`claude/m3-pN-<slug>`, which matches the gate's `branch-matches` precondition,
so scope RUNS on every M3 pull request and a missing declaration is a red gate,
not a skip.

The step:

1. The ORCHESTRATOR authors ten documents,
   `delivery/plan/phase-declarations/m3-p1.json` through `m3-p10.json`,
   lowercase filenames, from this section's `files-to-touch` lists. Each is
   `{id, branch, filesToTouch, declaredExtras, citations}` and nothing else
   (`additionalProperties: false`). `filesToTouch` carries literal paths, or
   literal directories with a TRAILING SLASH, never prose. `declaredExtras`
   carries this plan's standing pre-authorized extras that the auditor does not
   add itself: `delivery/requirements/clause-map.json` on every phase, plus
   `delivery/evidence/m3-exit-test/` on M3-P10. The auditor adds
   `test/behaviors.json` and the phase's own `delivery/work-history/m3-pN.md`
   on its own, so those two are never listed.
2. They are merged to `main` in **ONE** pull request, before the M3-P1 branch
   is created. One rather than ten, because ten pull requests over ten
   documents that no code reads until its phase dispatches is ten merge trains
   for one act, and because a single document set is reviewable as a set: the
   review that matters is "does every declaration match the plan section it
   projects", which is a comparison over all ten at once.
3. **No phase authors or edits its own declaration, ever.** A phase that could
   edit the document governing its own audit could widen its own scope, and the
   merge-base read is the only thing preventing that. Consequently no phase's
   `files-to-touch` list in this section contains a phase declaration, and a
   phase that finds it needs a path its declaration does not carry ESCALATES to
   the orchestrator for a declaration amendment merged to `main`, exactly as
   M2's `delivery/plan/phase-declarations/README.md` requires.
4. Once M3-P1 ships `tiphys plan project`, the ten documents become a GENERATED
   view of this plan rather than a hand-authored second source (D-M3-18), and
   M3-P1 criterion 10 is what proves the generated form is accepted by the real
   auditor. Until then they are hand-authored, and that is stated rather than
   hidden: the first M3 branch forks before the generator exists, so its
   declaration cannot have been generated.

### M3-P1: Schema foundation, validator, and the plan, charter, decision, and status-line contracts

- id: M3-P1
- branch: `claude/m3-p1-schemas-and-validator`
- intent: Ship `schemas/` with the four artifact schemas that belong to no
  migration family, the starter instances that go with them, one validator
  command, the status-line emitter, and the clause-map check, so every later M3
  phase lands against a machine gate instead of against prose review alone.
- grounding: M2 merged with its exit evidence on `main`. `schemas/` holds only
  the M1-P1 placeholder README; `templates/` and `checklists/` do not exist.
  DR-0006 decided (section 1.5 table is the applied form). **DR-0013 is DECIDED
  (2026-08-05) and this phase implements it**: Ajv 8.20.0 exact, Draft 2020-12,
  strict, plus `yaml` 2.9.0 exact; revision 1's "must be decided before
  dispatch" is superseded and the record is
  `delivery/decisions/DR-0013-schema-validator-implementation.md`. M2-P6's
  coverage checker fixes the accepted reference types (phase, decision, parked)
  that the plan schema's open-questions and parked sections must express (D-7).
  **DR-0014 is DECIDED in principle and its investigation has reported**
  (`delivery/verification/release-verification-interface.md`), which is why
  step 3 RESERVES the charter's verification field rather than designing it
  (D-M3-29). T-007 gives the plan schema a required `hazard-classes[]` field
  (D-M3-32). D-M3-27 binds every path this phase's commands read.
- hazard class (T-007, D-M3-32): **the contract every later M3 phase and every
  future kernel consumer is written against, so a defect here is invisible until
  it has been depended on by nine phases.** What can produce a schema set that
  passes its own criteria and guarantees nothing: a schema permissive enough
  that every later artifact validates while proving nothing, whose invalid
  fixtures are syntax errors rather than structurally plausible instances; an
  `additionalProperties: false` omitted at ONE nested object level, so a typo is
  silently ignored exactly where the criteria did not look; a derived check
  registered but never reached, so a cross-document rule passes by not running;
  an Ajv instantiation that differs in one policy from DR-0013's list, most
  dangerously coercion or default-insertion, which makes the validator alter
  what it validated; a diagnostic that leaks Ajv's own wording into what
  becomes a public contract; a YAML decode failure presenting as a stack trace,
  which is the seam this phase is taking; the M2 retirement changing M2's test
  EXPECTATIONS rather than its engine, which would make DR-0013's
  "boundary preserved" false at the moment it was acted on; and a
  hand-authored path handed to `validate` that is a named pipe, which blocks
  the command forever (D-M3-27, the M1-P5 class applied to the first kernel
  command whose ordinary input is an operator-supplied path).
- hazard class to criterion (section 2.6, NEW at revision 3). "DR-0013 n" means
  criterion n of the DR-0013 block below, which is part of this phase's
  acceptance list:

| Hazard item | Reddens against |
|---|---|
| a permissive schema whose invalid fixtures are syntax errors rather than plausible instances | criteria 3 and 4 (four structurally plausible DANGEROUS instances, each witnessed by removing and restoring its one guarding keyword), plus section 2.3 rule 1, which makes a merely-malformed fixture non-qualifying |
| `additionalProperties: false` omitted at ONE nested level | criterion 5, which names TWO structurally different members (top level and at least two deep) precisely because one witness is not a class here |
| a derived check registered but never reached | criterion 4c (`SKIPPED <check-id> no context` and a nonzero exit, both directions) |
| an Ajv policy differing from DR-0013's list, most dangerously coercion or default-insertion | DR-0013 4 (unknown keyword fails compilation, naming it) and DR-0013 6 (deep-equal assertion that the validated value was not mutated, one case per kind) |
| a diagnostic leaking Ajv's own wording into a public contract | DR-0013 8 (assert the exact `INVALID <json-pointer> <message>` text AND that no Ajv-authored wording reaches either stream) |
| a YAML decode failure presenting as a stack trace | criterion 12 and DR-0013 9, both directions (removing the step 8b handler reproduces the trace, captured and reverted) |
| the M2 retirement changing M2's test EXPECTATIONS rather than its engine | **NO CRITERION IN THIS PHASE, section 2.6 reason 3 (the verification needs an artifact this phase does not own).** DR-0013 10 asserts M2's tests are RE-RUN UNCHANGED and pass, which detects a rewrite only if the reviewer also diffs them. So the phase carries a step-1 obligation plus a mechanical guard: step 1 records `git diff --stat origin/main -- test/` scoped to M2's validation tests in the work history, and a nonempty diff there is an ESCALATION under D-M3-16, never an adaptation. Stated as an obligation with a command rather than as a criterion because the phase legitimately cannot make it a test: a test that asserts "these files were not edited" is asserting about the diff, which is the scope auditor's job and it already runs |
| a named pipe at a hand-authored path handed to `validate` | criterion 5d, both directions, with a real `mkfifo`, for the file argument AND the `--context` directory |
| a clause-map row silently absent (added at revision 3, section 2.2) | criterion 9b, which deletes an entry from `clause-map.json` for an in-force phase and requires a nonzero exit naming the row and the phase |
| a `hazard-classes[].addressed-by` naming a criterion that does not exist (added at revision 3, section 2.6) | criterion 5f, both directions, Kind B check `plan-hazard-classes-addressed-by-resolves` |
- steps:
  1. Verify: `schemas/` contains only `README.md`; `templates/` and
     `checklists/` absent; `package.json` `files` is `["dist"]`. Verify the real
     paths and output shapes of the M2-P5 citation linter, the M2-P6 coverage
     checker, the M2 validator module, the
     `src/gates/schemas/` location, and the phase-declaration projection
     `delivery/plan/phase-declarations/<phase-id>.json` the M2-P4 scope auditor
     consumes (**path corrected at revision 3**; revision 2 said
     `delivery/plan/phases/`); record all of it in the work history.
     **Revision 3 changes what this verification IS.** Revision 2 asked for it
     "because later phases cite these paths and the M2 plan they come from is
     DRAFT". M2 is now COMPLETE, so the source is the artifact on `main` and
     section 1.7 already carries the per-joint result. What this step still
     owes is therefore narrower and sharper: re-run section 1.7's commands
     against `main` as it stands ON THE DAY OF DISPATCH, because M2 could
     acquire a fix round between this plan's approval and this phase's branch,
     and record any difference as an escalation under D-M3-16 rather than
     adapting to it.
     **Two verifications rewritten at revision 2, because DR-0013 changed what
     matters about M2's validator.** Revision 1 asked this step to verify
     "the M2 validator module and its documented keyword set". Under DR-0013 the
     keyword set is irrelevant, because Ajv supplies Draft 2020-12 entire and
     M2's engine is retired. What must be verified instead, and is now the
     step's operative content, is the pair that makes DR-0013 clause 6 keepable
     (section 1.1 item 5): (a) that M2's validator as DELIVERED emits
     `INVALID <json-pointer> <message>` with deterministic ordering, and (b)
     that M2's own validation tests assert THAT contract and not any
     engine-specific wording. Both are obligations M2's plan accepted at its
     revision 2 (M2-P1 step 4 and criterion 10). Record the exact test file
     paths and the assertions inspected. **If either is false as delivered, STOP
     and escalate**: the retirement is then a rewrite of M2's tests rather than
     an engine swap, DR-0013's "existing M2 validation tests are re-run
     unchanged" cannot be satisfied, and quietly rewriting them would make the
     decision record false at the moment it was acted on (D-M3-16 forbids the
     quiet edit; the escalation is the alternative).
  2. Create `schemas/plan.schema.json`. Required: header (`status`,
     `baseline-commit`, `binding-rule` as a required const carrying the process
     doc's exact sentence, R-017; `process-summary`), `standing-context`
     (R-018), `report-code-disagreement` (R-011), `phases[]`, `decisions[]`
     numbered (R-021), `open-questions[]` whose entries are decision-record
     references only (D-7, SC-009), `parked[]` whose entries require a `reason`.
     Each phase requires `id`, `branch`, `intent`, `grounding`, `severity`,
     `verified-root-cause`, `steps[]`, `files-to-touch[]`, `acceptance[]`
     (minItems 1), `hazard-classes[]` (minItems 1, NEW at revision 2),
     `migrations`, `conflicts-with[]`, `parallelizable`,
     `citations[]` (R-019 plus the blueprint section 5 superset).
     **`hazard-classes[]` is T-007's explicit structural consequence for this
     schema (D-M3-32)**: "a phase section that declares acceptance criteria
     should also declare its hazard classes, so the second contract is derivable
     from the plan rather than improvised per dispatch". Each entry is
     `{id, hazard, derived-from}` where `derived-from` is a free-text statement
     of what about the component's NATURE produces the hazard (for M1-P5 it was
     "this component reads files it does not own", which names the defect class
     directly). It is `minItems: 1` and not optional, because an optional field
     is the version of this rule that did not survive: T-007 records a phase
     meeting fifteen of fifteen executed criteria while live-locking every
     supervision command, and the reviewer who found it differed in its BRIEF,
     not in its model. This is a Kind A rule; the criteria coupling
     (`verdict-hazard-classes-addressed`, M3-P7) is Kind B and lands there.
     Three structural
     rules that make prose rules mechanical:
     - `fill-in` (R-014): an optional phase object with `filled: false` and the
       named slots `root-cause`, `fix-shape`, `files`; a phase whose `fill-in`
       is present and unfilled is valid for review and invalid for dispatch.
       Kind B, derived check `plan-dispatchable` (section 2.3): the validator
       computes and reports it, because it is a function of the slots rather
       than a property of one field.
     - verification-first (R-012): a step may carry `kind: verification-first`;
       a plan whose `report-code-disagreement` list contains an entry with
       `verified: false` and whose owning phase has no `verification-first` step
       is invalid. Kind B, derived check `plan-verification-first-present`: it
       matches an element of one array against a step nested inside an element of
       another, selected by phase id, which no schema keyword expresses (M3R-002).
     R-016's binding content (one artifact, committed as the first commit of the
     first branch) is expressed as: the plan is one file, and the commit-position
     check stays parked exactly as plan v1 section 11 item 8 parked it. The
     word "markdown" in R-016 is superseded by DR-0006 and by section 1.5.
     Projection rule (D-M3-18, accepting the M2 plan's boundary recommendation;
     **the target shape is CORRECTED at revision 3 by reading
     `src/gates/schemas/phase-declaration.schema.json` on `main`, and revision
     2 had all three of its observable properties wrong**): the phase object is
     a strict superset of the M2-P4 scope auditor's phase-declaration
     projection, and this phase adds `tiphys plan project --phase-id <id>`
     emitting exactly that projection from the plan file, so the auditor's input
     becomes a generated view of one source instead of a second hand-authored
     source that can drift. What the projection must EMIT, verbatim from the
     delivered schema:
     - the five required properties `id`, `branch`, `filesToTouch`,
       `declaredExtras`, `citations`, camelCase, and **nothing else**, because
       the delivered schema sets `additionalProperties: false` and an extra
       property is a rejection rather than an ignored field. Revision 2 said
       "(`id`, `branch`, `files-to-touch`, `extras`, `citations`)", which is
       three errors in five names, and criterion 10 would have failed on its
       first attempt;
     - `id` matching `^M[0-9]+-P[0-9]+$` (uppercase, as the plan spells it) and
       `branch` matching `^claude/m[0-9]+-p[0-9]+-.+$`;
     - `filesToTouch` as literal paths, or literal directories with a TRAILING
       SLASH, never prose (M2R-016): the auditor matches the string exactly or
       as a directory prefix and does not interpret descriptions, so a plan
       whose `files-to-touch` entry carries a parenthetical such as "(edit only
       if step 4 requires it)" must project the PATH and drop the gloss, and
       this phase's projector is where that stripping happens or does not;
     - the output FILE the projection is written to is
       `delivery/plan/phase-declarations/<phase-id-lowercased>.json`, because
       CI derives `--phase` from the branch by a lowercase regex.
     The plan phase field keeps this document's own spelling, `files-to-touch`
     and `extras`, because this plan is markdown and the plan SCHEMA is a
     separate artifact; the projector is the one place the two vocabularies
     meet, and D-M3-18's whole value is that there is exactly one such place.
     `extras` is a required phase field, defaulting to the standing
     pre-authorized extras, because the auditor already treats `declaredExtras`
     as required.
  3. Create `schemas/charter.schema.json` with blueprint section 7's required
     fields: `identity` (name, repo, kernel-version-pin), `delivery-mode` and
     `assurance-tier` (values constrained to the mode ids M3-P3 defines; this
     phase declares the enum and M3-P3 owns the mode definitions),
     `yolo-permissions`, `irreversible-decisions` (stack, language, framework,
     core data model, tenancy, auth, deployment topology),
     `product-intent` (block scalar, one page), `constraints`,
     `escalation-contract` (R-022, R-090) with a required `stop-for[]` whose
     default entries are "any irreversible choice the charter is silent on"
     and, NEW at revision 2, **"a change from a declared release verification
     to `none`"**, and
     `retention` paths (consumed by M3-P8 for R-098). A missing required field
     blocks realization, which is what the schema's `required` list means
     (blueprint section 7).
  3b. **Release verification: RESERVE the space, do not design it (DR-0014,
     D-M3-29, NEW at revision 2).** The charter schema declares a
     `release-verification` field and this phase does exactly four things with
     it, no more:
     - It is REQUIRED, and its only currently-valid shapes are
       `{mode: none, reason: <non-empty string>}` and
       `{mode: reserved, note: <non-empty string>}`. `additionalProperties:
       false` at that object level, so any other shape fails compilation-time
       or validation-time rather than being silently accepted.
     - `mode: none` requires a non-empty `reason`. This is the investigation's
       defence 2 (`delivery/verification/release-verification-interface.md`
       section 4.1): silence is never permission, an absent field is an error
       rather than a quiet skip, and disabling verification costs visibility.
       It is Kind A, an `if`/`then` on `mode`.
     - The schema's `$comment` on the field cites
       `delivery/verification/release-verification-interface.md` and DR-0014 by
       id, and states in terms that the field's real shape is NOT decided here.
       That investigation's section 8 item 4 is unambiguous: "the charter field
       is M3's, and M3 should reserve the space rather than design it", settled
       by the first real project charter at M4's pilot.
     - It does NOT enumerate adapters, does NOT model N verifications, does NOT
       express M2-P7's outcome enum, and does NOT carry the charter coherence
       check the investigation recommends (a non-local deployment topology
       declared alongside verification `none` is internally contradictory).
       That check is a Kind B derived check in this plan's own vocabulary and
       would cost one check and no new artifact, and it is DECLINED FOR M3 WITH
       A REASON rather than built: the investigation's own section 8 item 4
       says its predicate ("non-local topology") needs a real charter to be
       written against, and inventing the predicate now is the M1-P3 shape risk
       1 exists to prevent. Recorded in Appendix C item 12 as
       available-and-declined, so the question is asked and answered rather
       than skipped.
     What this phase DOES take from the investigation, because it is one line
     and available now, is step 3's `stop-for[]` addition: a change from a
     declared verification to `none` becomes an owner decision rather than an
     implementer's edit, which is the difference between "the owner chose to
     run without verification" and "verification stopped happening"
     (investigation section 4.1, closing recommendation).
  4. Create `schemas/decision-record.schema.json`: blueprint section 7's field
     list, plus `reversibility` as an enum of exactly `reversible`, `costly`,
     `irreversible` (R-063), plus `vetoable` (boolean) and `revert-cost`
     (string) so R-090's "flagged vetoable and made trivially revertible" has a
     field rather than a habit, plus `status` as an enum of `open`, `deferred`,
     `decided` (an open question is a record with status open, D-7).
  5. Create `schemas/status-line.schema.json` (R-084): a record is
     `{at, run, project, state, detail, refs[]}` where `state` is an enum of
     exactly `needs-decision`, `blocked`, `done`, `failed`, `phase-change`
     (blueprint section 5). No `info`, no `progress`, no `heartbeat`: routine
     noise is unrepresentable, which is the sparseness R-084 asks for expressed
     structurally rather than as an instruction.
  6. Create `src/status.ts` and `src/commands/status.ts`. `tiphys status emit
     --run <id> --state <state> [--detail <text>] [--ref <r>]` appends one
     validated record to `state/status/stream.jsonl` and then rewrites
     `state/status/current.json` atomically (write temp, rename).
     `tiphys status show` reads `state/status/current.json` only and never opens
     the stream (C-1). Module docs state the constraint and name it.
  7. Create `templates/plan.example.yaml`, `templates/charter.example.yaml`,
     `templates/decision-record.example.yaml`: minimal instances that validate.
  8. Create `src/validate.ts`, `src/checks.ts`, and `src/commands/validate.ts`:
     `tiphys validate --type <t> [--context <dir>] <file>` exits 0 when the
     instance passes schema validation and every derived check registered for
     its type; exits 1 printing one line per violation as
     `INVALID <json-pointer> <message>` for schema violations and
     `INVALID <json-pointer> <message> (check: <check-id>)` for derived ones;
     exits 64 on usage error. `--type auto` resolves the type from the instance's
     `kind` field and exits 64 when absent. A derived check that needs a context
     it was not given prints `SKIPPED <check-id> no context` and the command
     exits nonzero, so a cross-document rule cannot pass by not running.
     `src/checks.ts` holds the registry of derived checks per type (section 2.3);
     this phase registers `plan-dispatchable` and
     `plan-verification-first-present`, and later phases append their own.
     Schema-validation implementation per DR-0013: instantiate the Ajv Draft 2020-12 implementation with strict mode, allErrors, schema and meta-schema validation, and NO coercion, defaults, additional-property removal, input mutation or remote schema loading. Unknown or invalidly combined keywords fail schema COMPILATION. Normalize every Ajv error into the Tiphys diagnostic contract `INVALID <json-pointer> <message>` with deterministic ordering; Ajv wording is never a public contract. Retire the M2 validator as an ENGINE, preserving its module boundary, routing M2 gate-schema validation through Ajv, and re-running every existing M2 validation test unchanged.
     **Two clauses of DR-0013 that revision 1 did not carry into this step, added at revision 2.**
     (a) **YAML is INPUT DECODING and is a separate stage from validation, not conflated with it** (DR-0013 YAML clause 3). `src/validate.ts` decodes with `yaml` 2.9.0 first, then validates the decoded value; a decode failure and a validation failure are distinguishable in the diagnostic and neither produces a stack trace on any stream (DR-0013 YAML clause 4, which is the same top-level policy step 8b builds).
     (b) **Every Tiphys schema declares the dialect explicitly**, `"$schema": "https://json-schema.org/draft/2020-12/schema"` (DR-0013 clause 3), and this is asserted by a registered test over every file in `schemas/` rather than by inspection, so a schema added by a later phase without the declaration fails a gate rather than a reading. **Every schema file M3 ships in any phase inherits this**, which is why it is stated here and not repeated ten times.
     (c) The path handed to `validate` is an operator-supplied path this command did not create, so it is opened through `classifyEntry` and `refuseOpenForWrite` (D-M3-27), never a bare `readFileSync`. Same for the `--context` directory walk.
  8b. Add a top-level error presentation handler in `bin/tiphys.ts`: a thrown
     error from any subcommand is printed as one diagnostic line and exits 1
     (or 64 for usage errors), never as a stack trace. This closes the seam
     `delivery/STATE.md` records as carried-forward and unowned ("clean
     presentation of a load-time configuration error... a seam no M1 phase
     owns"). It is owned here rather than left because this phase is the first
     to add commands whose ordinary input is a hand-authored file that will
     routinely be malformed: a validator that answers malformed YAML with a
     stack trace is a validator nobody trusts. Scope is exactly the handler and
     nothing else in `bin/tiphys.ts` (D-M3-21).
  9. Create `delivery/requirements/clause-map.json` and
     `scripts/check-clause-map.mjs` per section 2.2, seeded with this phase's
     twelve rows, taking its row INVENTORY from Appendix A of this plan and its
     coverage table from the map, as two separately configured sources in the
     shape `src/gates/coverage.ts` on `main` already uses. **Register the check
     as a `gates.manifest.json` ENTRY, not as a raw workflow step (corrected at
     revision 3, section 2.2a and D-M3-34).** Revision 2 said "wire the check
     into `.github/workflows/gates.yml` as a step in the existing `test` job",
     and there is no `test` job: DR-0017 collapsed CI to ONE job named `gates`
     on 2026-08-06, so that instruction names a job that does not exist. The
     entry declares `id: clause-map`,
     `command: ["node", "scripts/check-clause-map.mjs"]`,
     `unitLabel: "clause-map rows checked"`, `applicability: required`, and,
     once M3-P2 has added the field to the registry schema, `events:
     [pull_request, push]`. This phase runs BEFORE M3-P2, so the entry goes
     into `gates.manifest.json` in M2's own manifest shape and M3-P2's
     promotion carries it into `gate-registry.yaml` and adds its `events[]`.
     Registering rather than wiring also gives the check M2-C-2 for free: it
     writes its result through `makeGateResult`, so a run that examined zero
     rows becomes `error` with `vacuous: true` rather than exiting 0.
  10. Register every new artifact type this phase introduces (`plan`,
      `charter`, `decision-record`, `status-line`) with the validator's `--type`
      table and the `auto` resolver, and every phase after this one does the same
      for its own types in its own step (M3R-001).
  10b. Extend `package.json` `files` to `["dist", "schemas", "templates"]`, so
      the published package carries what M3 ships. Later phases extend it
      further; M3-P10 asserts the final set. Relocate M2's schema documents from
      `src/gates/schemas/` to `schemas/` and update the path constant M2 left as
      the seam (D-M3-20); the M2 plan states this is one move plus one path
      constant, and this phase verifies that claim before acting on it and
      reports rather than improvises if it is wrong.
  10c. **Dependencies and the lockfile, stated explicitly at revision 2 because
      this is the kernel's first production dependency and the lockfile is the
      artifact that makes the pin real.** Add `ajv` at exactly `8.20.0` and
      `yaml` at exactly `2.9.0` to `dependencies` (not `devDependencies`), with
      no range prefix. Regenerate `package-lock.json` by running `npm install`
      once and committing the result; do not hand-edit it. Record in the work
      history the resolved transitive production dependency set of both
      packages, with each one's `license` field, because that inventory is a
      REQUIRED INPUT to the EXT-F-09 license gate M3-P10 builds (DR-0013 clause
      5, and criterion 14 of the validator block below). Recording it here
      rather than only at M3-P10 is deliberate: an inventory taken nine phases
      after the dependency was added is an inventory of whatever the tree
      resolved to by then, and plan v1 decision D-3 (zero runtime dependencies)
      is superseded from M3 onward by DR-0013 and dated there, not silently.
  11. Tests: `test/validate.test.ts`, `test/schemas.test.ts`,
      `test/checks.test.ts`, `test/status.test.ts`, with valid and invalid
      fixtures under `test/fixtures/`.
      **Revision 2 states what those files must contain, because DR-0013's own
      consequence note says "its steps 8 and 11 ... change with the choice" and
      revision 1 changed step 8 only.** The fourteen validator criteria below
      are the acceptance contract; these are the test files that carry them:
      `test/validate.test.ts` holds the engine-policy tests (criteria 4, 5, 6,
      7, 8, 9: unknown keyword fails COMPILATION and names the keyword; an
      invalid schema fails meta-schema validation; the validated value is
      deep-equal to the input for one case of each mutation kind Ajv could have
      performed; local `$ref` resolves while an unresolved and a REMOTE
      reference each fail closed; the diagnostic text is asserted exactly and no
      Ajv-authored wording reaches either stream; malformed YAML gives one
      concise diagnostic, nonzero exit, and no stack frame).
      `test/schemas.test.ts` holds the vocabulary coverage (criterion 2: every
      keyword in the declared authoring vocabulary has BOTH a positive and a
      negative test, and criterion 3: `oneOf`, `if`/`then` and `contains` each
      carry a DISCRIMINATING pair), plus the dialect-declaration assertion of
      step 8(b).
      `test/schema-suite.test.ts` (a fifth file, NEW at revision 2 and added to
      files-to-touch) holds criterion 11, the applicable cases from the official
      JSON Schema Test Suite, with the suite revision recorded and every
      exclusion carrying its reason. It is a separate file because it is the one
      test set imported from outside this repository and a reviewer needs to see
      its provenance without reading past the kernel's own tests.
      The M2 regression contract (criterion 10) is discharged by RUNNING M2's
      existing validation test files unchanged, not by copying assertions into
      these files; step 1 verified they are runnable against the new engine.
- files-to-touch (create unless marked): `schemas/plan.schema.json`,
  `schemas/charter.schema.json`, `schemas/decision-record.schema.json`,
  `schemas/status-line.schema.json`, `schemas/README.md` (edit),
  `templates/plan.example.yaml`, `templates/charter.example.yaml`,
  `templates/decision-record.example.yaml`, `src/validate.ts`, `src/checks.ts`,
  `src/commands/validate.ts`, `src/status.ts`, `src/commands/status.ts`,
  `src/plan.ts`, `src/commands/plan.ts`,
  `test/validate.test.ts`, `test/schemas.test.ts`, `test/checks.test.ts`,
  `test/status.test.ts`, `test/plan-projection.test.ts`,
  `test/schema-suite.test.ts` (NEW at revision 2, step 11: the JSON Schema Test
  Suite cases of validator criterion 11), `test/fixtures/**`,
  `scripts/check-clause-map.mjs`,
  `gates.manifest.json` (edit, ADDED at revision 3: registers the clause-map
  check as a gate entry rather than a raw workflow step, section 2.2a and
  D-M3-34; append-only and resolved as a union against the merge base, like
  `test/behaviors.json`),
  `delivery/requirements/clause-map.json`, `src/cli.ts` (edit),
  `bin/tiphys.ts` (edit, top-level error handler only, step 8b; verify the
  dispatcher shape first),
  `package.json` (edit, ADDS `ajv` 8.20.0 and `yaml` 2.9.0 as exact production
  dependencies, the kernel's first, per step 10c),
  `package-lock.json` (edit, REGENERATED by `npm install` and never hand-edited;
  required by DR-0013 and load-bearing, because criterion 1's clean
  `git status --porcelain` after `npm ci` plus `npm run build` is what proves
  the committed lockfile matches the declared pins),
  `.github/workflows/gates.yml` (edit), `src/gates/schemas/**`
  (move to `schemas/`, per step 10 and D-M3-20; verify the M2 path constant
  dependencies), the M2 validator module (edit to route through Ajv and retire
  it as an engine while preserving its module boundary and its diagnostic
  contract; verify step 1's two findings first), M2's own validation test files
  (RE-RUN unchanged, NOT edited; listed here so that an edit to any of them is
  visible to the scope audit as the escalation-worthy event step 1 describes
  rather than as an ordinary change).
- acceptance criteria:
  1. `npm ci`, then `npm run build` exits 0 and `git status --porcelain` is
     empty afterward; `npm test` exits 0 without a prior build, 0 failing, zero
     unaccounted tests, and `test/behaviors.json` maps every behavior named
     below to a test present in the run while every previously registered
     mapping still resolves by name.
  2. `tiphys validate --type plan templates/plan.example.yaml` exits 0, and the
     same for `charter`, `decision-record`, and a status-line record.
     `tiphys validate --type auto` on each example exits 0.
  3. Kind A DANGEROUS-instance rejection, each fixture exiting 1 with a message
     naming the offending pointer (section 2.3 rules 1 and 2): (a) a plan whose
     phase has `acceptance: []`; (b) a charter with every other field present and
     no `escalation-contract`; (c) a decision record with `status: decided` and
     an empty `decided`; (d) a status-line record with `state: done` and no
     `run`.
  4. Each of the four fixtures in criterion 3 is accepted when the single schema
     keyword guarding it is removed, and rejected when it is restored; both runs
     are captured in the work history and the schema is reverted (Kind A witness,
     section 2.3 rule 2).
  4b. Kind B DANGEROUS-instance rejection (section 2.3 rule 3): a plan with a
     `report-code-disagreement` entry `verified: false` and no
     `verification-first` step in the owning phase exits 1 with a message
     carrying `(check: plan-verification-first-present)`; the same fixture exits
     0 when that check is deregistered from `src/checks.ts` and exits 1 again
     when it is restored, both captured and reverted. A plan whose `fill-in` is
     present and unfilled reports `dispatchable: false` and a plan with no
     `fill-in` reports `dispatchable: true` (check `plan-dispatchable`, both
     directions).
  4c. A cross-document derived check invoked without `--context` prints
     `SKIPPED <check-id> no context` and the command exits nonzero; the same
     invocation with `--context` exits 0 on a valid instance (both directions).
     This is the guard against a cross-document rule passing by not running,
     which is the vacuous-pass shape SC-011 and the parity-counting wrapper both
     exist to prevent.
  5. An instance identical to a valid example except for one misspelled property
     name exits 1 and the message names that property (every object level sets
     `additionalProperties: false`, so a typo is a failure and not a silently
     ignored field). **Two structurally different members, per section 2.3 rule
     6**: one misspelling at the document's TOP level and one at a nested object
     level at least two deep (a `phases[n].fill-in` property, for instance).
     One witness here is not a class, because the failure mode this guards is
     precisely an `additionalProperties: false` omitted at one nesting level
     while present at the top.
  5b. **Charter release-verification reservation (D-M3-29, DR-0014), all
     directions.** A charter with no `release-verification` field exits 1 naming
     the field; one with `{mode: none}` and no `reason` exits 1 naming `reason`;
     one with `{mode: none, reason: "..."}` exits 0; one with
     `{mode: vercel, endpoint: "..."}` exits 1 naming the offending property,
     which is the guard that stops a project inventing the field's real shape
     before M4's pilot decides it. Each is Kind A and each is witnessed by
     removing and restoring its guarding keyword. A registered test asserts the
     field's `$comment` cites DR-0014 and
     `delivery/verification/release-verification-interface.md` by path, so a
     later reader finds the reason for the reservation from the schema itself.
  5c. **`stop-for[]` default entry (investigation section 4.1).** The shipped
     `templates/charter.example.yaml` carries "a change from a declared release
     verification to `none`" in its `escalation-contract.stop-for[]`, asserted
     by a registered test. This is a presence assertion over prose and is
     labelled as such: it proves the default is shipped, not that anyone obeys
     it.
  5d. **Path-type refusal (D-M3-27), both directions.** With a named pipe staged
     by a real `mkfifo` at the path handed to `tiphys validate <file>`, the
     command exits nonzero within a bounded time naming the path and the
     observed entry type, and does NOT block; the same invocation against a
     regular file at the same path exits 0. The same pair is witnessed for the
     `--context` directory. This is the M1-P5 class (CR-520, twelve paths, four
     fix rounds) applied to the first kernel command whose ordinary input is an
     operator-supplied path, and it is a criterion rather than a note because
     `src/brief.ts` shows what happens when the rule is only a note.
  5e. **Hazard-classes field (T-007, D-M3-32), both directions.** A plan whose
     phase carries `hazard-classes: []` exits 1 naming the pointer; the same
     phase with one entry exits 0. Witnessed by removing and restoring
     `minItems`. `templates/plan.example.yaml` carries at least one real hazard
     class, so the template teaches the field rather than declaring it empty.
  5f. **`hazard-classes[].addressed-by` resolves (NEW at revision 3, section
     2.6, D-M3-35), both directions.** Each `hazard-classes[]` item is
     `{id, statement, addressed-by}` with all three required; `addressed-by` is
     either a criterion id present in the SAME phase's `acceptance[]` or one of
     section 2.6's three reason forms with its named target. A plan whose phase
     declares a hazard class with `addressed-by: "criterion 99"` and no
     criterion 99 exits 1 with a message carrying
     `(check: plan-hazard-classes-addressed-by-resolves)`; the same fixture
     exits 0 when the check is deregistered from `src/checks.ts` and exits 1
     again when it is restored, both captured and reverted (Kind B, section 2.3
     rule 3). The required-field half is Kind A and is witnessed by removing and
     restoring `required`. **Two structurally different members, per section 2.3
     rule 6**: one item whose `addressed-by` names a criterion id that does not
     exist, and one whose `addressed-by` is a reason form naming a phase id that
     does not exist in the plan. One witness is not a class here because the
     two arms of `addressed-by` resolve against different things.
  6. `tiphys status emit --run r1 --state phase-change --detail x` in a fleet
     home exits 0, appends exactly one line to `state/status/stream.jsonl`, and
     `state/status/current.json` parses with `state` equal to `phase-change`.
  7. C-1 witness: after overwriting `state/status/stream.jsonl` with
     unparseable bytes, `tiphys status show` still exits 0 and prints the
     correct current state; an implementation of `show` that reads the stream is
     demonstrated red against the same fixture, captured and reverted.
  8. `tiphys status emit --state progress` exits nonzero and the message names
     the `state` enum (R-084: the sparse vocabulary is enforced, not requested).
  9. The clause-map check exits 0 over this phase's twelve rows; removing one
     clause id from its artifact makes it exit nonzero naming the row and the
     artifact, and restoring it returns exit 0. **Invoked through the gate
     registry at revision 3 (section 2.2a, D-M3-34), not as a raw workflow
     step**: the check is a `gate-registry.yaml` entry whose command is
     `node scripts/check-clause-map.mjs`, with `events: [pull_request, push]`
     and `unitLabel: "clause-map rows checked"`, so it writes one `GateResult`
     through the M2-P1 subprocess contract and M2-C-2 makes a run that examined
     zero rows `error` rather than green.
  9b. **The MISSING-ROW condition (NEW at revision 3, section 2.2, A-007), both
     directions.** The check takes Appendix A of this plan as its row INVENTORY
     and `delivery/requirements/clause-map.json` as its coverage table, two
     separate configured sources with id pattern `R-[0-9]+[a-z]?`, in the shape
     `src/gates/coverage.ts` already uses on `main`. DELETING the entry for a
     row whose owning phase is in force makes the check exit nonzero naming the
     row and the phase; restoring it returns exit 0. Adding a map entry for a
     row that is NOT in Appendix A also exits nonzero, naming the invented row.
     A row whose phase is not yet in force is reported `pending <phase>` and
     does not fail. Without this criterion the first of the check's four
     conditions has no red witness at all, and a phase that under-seeds its own
     rows produces a green check, which is the guard-whose-condition-is-untested
     shape section 2.3 rule 3 forbids everywhere else in this plan.
  10. `tiphys plan project --phase-id <id>` over `templates/plan.example.yaml`
      emits a projection the M2-P4 scope auditor accepts as input (run the real
      auditor against it, exit 0); mutating one `files-to-touch` entry in the
      plan changes the projection and makes the auditor's verdict change
      accordingly, so the generated view is demonstrably derived from the plan
      and not from a copy (both directions). **Three assertions added at
      revision 3, each because revision 2 specified the target wrongly and this
      criterion would have failed on its first attempt (A-009).** (a) The
      emitted document validates against the DELIVERED
      `src/gates/schemas/phase-declaration.schema.json` read from `main`, not
      against a copy transcribed into this phase; the emitted key set is
      exactly the five required camelCase names and a sixth key makes the
      schema reject it, witnessed by emitting one extra key on purpose. (b)
      The projection is written to
      `delivery/plan/phase-declarations/<lowercased-phase-id>.json` and the
      real auditor is invoked exactly as `gates.manifest.json` invokes it,
      `node src/gates/scope.ts --declarations delivery/plan/phase-declarations`,
      against a scratch git repository whose branch is `claude/m3-p1-...` and
      whose MERGE BASE carries the declaration, because the auditor reads the
      merge base and an auditor run against a declaration present only at the
      head proves nothing about the property that matters. (c) A
      `files-to-touch` entry carrying a parenthetical gloss projects to the
      bare path, witnessed by a plan entry written as
      `` `src/cli.ts` (edit only if step 4 requires it) `` projecting to
      `src/cli.ts`, because the auditor matches strings literally and would
      reject the glossed form as an undeclared path.
  11. `npm pack` produces a tarball whose listing contains `schemas/` and
      `templates/` entries and contains no `delivery/` entry.
  12. A subcommand made to throw (a malformed YAML artifact handed to
      `tiphys validate`, and a plan file that is valid YAML but not a mapping)
      prints one diagnostic line and exits 1 or 64, and stderr contains no stack
      frame (`grep -c "    at "` equals 0); removing the step 8b handler makes
      the same invocation print a stack trace, captured and reverted (D-M3-21,
      both directions).
  13. `grep -rP '[^\x00-\x7F]'` over the touched files reports nothing.
- new behaviors: `validate-valid-instance`, `validate-invalid-pointer-message`,
  `validate-additional-properties`, `validate-auto-type`, `schema-plan-empty-acceptance`,
  `schema-plan-verification-first-required`, `schema-charter-escalation-required`,
  `schema-decision-decided-value-required`, `schema-status-run-required`,
  `status-emit-appends-and-updates-current`, `status-show-ignores-stream`,
  `status-state-enum-closed`, `clause-map-check-detects-missing-clause`,
  `plan-projection-feeds-scope-auditor`, `check-plan-verification-first-present`,
  `check-plan-dispatchable`, `check-missing-context-fails-loudly`,
  `cli-errors-have-no-stack-trace`,
  and NEW at revision 2: `validate-unknown-keyword-fails-compilation`,
  `validate-input-not-mutated`, `validate-remote-ref-fails-closed`,
  `validate-yaml-decode-diagnostic`, `schemas-declare-2020-12-dialect`,
  `schema-suite-applicable-cases-pass`,
  `schema-charter-release-verification-reserved`,
  `schema-charter-verification-none-requires-reason`,
  `schema-plan-hazard-classes-required`,
  `validate-refuses-non-regular-input-path`,
  and NEW at revision 3: `clause-map-check-detects-missing-row`,
  `clause-map-check-detects-invented-row`,
  `check-plan-hazard-classes-addressed-by-resolves`,
  `schema-plan-hazard-class-addressed-by-required`,
  `plan-projection-emits-camelcase-closed-set`,
  `plan-projection-strips-files-to-touch-gloss`.
- suggested model tier: strongest. The schemas are the contract every later M3
  phase and every future kernel consumer is written against; a loose schema here
  is invisible until it has been depended on.
- citations: R-011, R-012, R-014, R-016, R-017, R-018, R-019, R-021, R-022,
  R-063, R-084, R-090; blueprint sections 5 and 7; DR-0006; plan v1 D-7, D-3
  (superseded from M3 onward by DR-0013, dated in that record), and section 11
  item 8; constraint C-1; SC-009; **DR-0013** (the engine, the pins, the
  diagnostic contract, the fourteen criteria); **DR-0014** and
  `delivery/verification/release-verification-interface.md` sections 4.1 and 8
  item 4 (the reserved charter field, D-M3-29); **T-007** (the
  `hazard-classes[]` field, D-M3-32); **`MECHANISMS.md`** row "reading a path
  whose type is not established" (D-M3-27); `delivery/STATE.md`'s
  carried-forward item on the top-level error handler (step 8b, D-M3-21).
- conflicts-with: every later M3 phase (`src/cli.ts`, `package.json` files
  entry, `schemas/README.md`, the clause map, `test/behaviors.json`). Sequential
  ordering absorbs this.
- blocked-by: M2 exit evidence on `main`, and nothing else. DR-0013 is DECIDED
  (2026-08-05): Ajv 8.20.0 exact, Draft 2020-12, strict mode, plus `yaml` 2.9.0
  exact. It is no longer a blocker and this phase implements it. **Verified at
  revision 2 by reading every `blocked-by` in section 3**: no M3 phase is
  blocked on an open owner decision, because DR-0008 and DR-0013 are both
  decided and DR-0010's M3 half needs no work under this plan's recorded answer
  (section 6 item 2).

#### Validator acceptance criteria added by DR-0013 (decided 2026-08-05)

These are additional to M3-P1's existing criteria and are binding on the phase
that adopts Ajv. Each is falsifiable and each names what must be executed.

1. A valid instance of each shipped schema validates and exits 0.
2. Every keyword in the declared authoring vocabulary has BOTH a positive and a
   negative test; a keyword with only a positive test is not covered.
3. `oneOf`, `if`/`then` and `contains` each carry a DISCRIMINATING test: one
   instance that satisfies exactly one branch and one that satisfies the wrong
   branch, so the test would fail if the keyword were ignored.
4. An unknown schema keyword fails schema COMPILATION, before any instance is
   validated, and the failure names the keyword.
5. A schema that is itself invalid fails meta-schema validation.
6. Input is not coerced, defaulted, stripped or otherwise mutated: assert the
   validated value is deep-equal to the input, for a case of each kind.
7. Local `$ref` resolves; an unresolved reference and a REMOTE reference each
   fail closed rather than being silently skipped or fetched.
8. Ajv errors are converted into `INVALID <json-pointer> <message>` with stable
   ordering. Assert the exact diagnostic text, and assert that no Ajv-authored
   wording reaches stdout or stderr.
9. Malformed YAML produces one concise diagnostic and a nonzero exit, with no
   stack trace on any stream.
10. Every existing M2 gate manifest and result retains its PRIOR pass/fail
    behaviour through the new engine. This is a regression contract: the M2
    validation tests are re-run unchanged, not rewritten.
11. Applicable cases from the official JSON Schema Test Suite pass for every
    keyword in the declared vocabulary. Record which suite revision was used
    and which cases were excluded as not applicable, with the reason.
12. `npm ci`, `npm run build`, `node --test` and `npm pack` all exit 0.
13. The packed package contains the shipped schemas, and a clean install in a
    scratch directory resolves both runtime dependencies.
14. The production dependency and license inventory includes `ajv`, `yaml` and
    every transitive production dependency of both, as an input to EXT-F-09.
    **Recorded in THIS phase's work history** (step 10c), not deferred to
    M3-P10, so the inventory names what was installed when the pin was taken
    rather than whatever the tree resolved to nine phases later. M3-P10's
    license gate consumes it as an input and re-derives it at release time;
    a difference between the two is a finding, not a routine update.

**Verified unchanged at revision 2 (this block was inserted on the decision day,
2026-08-05, and re-read against the decision text on 2026-08-06).** All fourteen
criteria are coherent with
`delivery/decisions/DR-0013-schema-validator-implementation.md`: criteria 1 to 3
against clause 7 (documented authoring vocabulary), 4 against clause 4's
compilation-time failure, 5 against clause 4's meta-schema validation, 6 against
clause 4's four no-mutation policies, 7 against clause 4's no-remote-loading, 8
against clause 5's diagnostic contract, 9 against the YAML clause 4, 10 against
clause 6's regression promise, 12 and 13 against the packaging consequence, and
14 against clause 5 of the YAML correction. Criterion 11 (the official JSON
Schema Test Suite) is the plan's own addition rather than the decision's and is
kept, because a vocabulary claim with no external suite behind it is the
hand-written-subset risk the decision rejected, wearing different clothes. Only
criterion 14's SITE moved at revision 2, from unstated to this phase's work
history. No criterion was reworded.

Two standing prohibitions for this phase, from DR-0013 and from plan review
finding M3R-002: do NOT silently weaken a schema rule, and do NOT reclassify a
Kind A requirement as Kind B to avoid expressing it. If a planned requirement
cannot be represented correctly under Draft 2020-12, or conflicts with the
decision, STOP and report the exact conflict rather than working around it.
**A third prohibition, added at revision 2 and load-bearing for DR-0013 clause
6**: do NOT edit M2's validation tests to make them pass against Ajv. They are
re-run UNCHANGED or the phase escalates (step 1). An edited M2 test is not a
regression contract, it is a new contract wearing the old one's name.

### M3-P2: Canonical gate registry

- id: M3-P2
- branch: `claude/m3-p2-gate-registry`
- intent: Promote the M2-P1 gate manifest to the canonical registry that CI and
  briefs both read from one source (R-094), carry SC-011's precondition
  semantics over unchanged, and add the two judgment-verified gate entries D-11
  settled (R-043, R-044).
- grounding: M3-P1 merged (validator and clause map exist). The M2-P1 gate
  manifest `gates.manifest.json` exists with its schema and its runner, and its
  schema reserves a `modes` field that the M2 runner validates if present and
  ignores (M2 plan section 2 item 1), which is what makes this promotion
  additive rather than a rewrite. All three are verified before editing and
  their real paths recorded. SC-011 is binding: a gate whose precondition is
  unmet reports not-applicable and never green. `CLAUDE.md` line 3 states that this registry replaces its gate
  list, which is an obligation of this phase.
  **Three things this phase must verify at revision 2 rather than assume.**
  (a) M2's `deploy` and `migrations` entries report `not-applicable`
  STRUCTURALLY and not locally: release verification runs after a merge against
  a commit that exists only once the merge has happened, so those entries can
  only ever be not-applicable in ANY pre-merge bundle, on every repository
  (`delivery/verification/release-verification-interface.md` observation O-3,
  adopted into M2's revision 2 gate table). The promotion carries them forward
  as declared-but-not-applicable and this phase's criterion 3 must not be read
  as having exercised them.
  (b) M2's revision 2 added constraints M2-C-2 (never green by omission: a
  green record carries `units` greater than zero) and M2-C-3 (fail closed: a
  check that cannot reach a verdict is `error`, never not-applicable). Both are
  properties of the manifest this registry is a superset of; verify their
  delivered shape before extending, because a superset that drops a base
  constraint is a widening dressed as a promotion.
  (c) **The suite's flake state at dispatch.** Revision 2 named
  `test/liveness.test.ts:671` specifically. **M2 FIXED that instance**: the
  assertion on `main` at `dbba3c8` matches `age (\d+)s` and range-checks the
  captured value instead of pinning 13s (risk 11 carries the captured lines).
  The obligation therefore CHANGES SHAPE rather than disappearing, because the
  point was never that one test: the `suite` gate this registry promotes reads
  `node --test` exit 0 as a binary fact, and that reading becomes the
  definition every future project inherits. So: verify the suite's flake state
  AT DISPATCH, not by re-reading this paragraph, and record what was observed
  in the work history with the command that produced it. If any
  non-deterministic member is open at that point, say so in the promoted
  entry's `$comment` and in risk 11 rather than promoting silence.
- hazard class (T-007, D-M3-32): **a registry that can report green for a gate
  that examined nothing, in the one artifact CI and every brief both read as
  authoritative.** What can produce that: a promoted entry that lost the
  precondition semantics SC-011 gives it, so an unmet precondition reads green
  instead of not-applicable; a `modes[]` field made live in a shape M2's runner
  validates-if-present and therefore silently accepts while meaning something
  else; a gate declared with no precondition at all, which can only ever report
  green or red and is how a vacuous pass enters; the rendered `CLAUDE.md` block
  and the registry agreeing because the renderer reads the block rather than
  deriving it from the registry; the drift check wired into the workflow as a
  TEXT assertion that survives being defanged (D-M3-28, and CR-760 is that shape
  live in the file this phase edits); a not-applicable that is really a
  misconfiguration (M2-C-3); and a promotion that silently drops M2's
  `units`-greater-than-zero rule, so a gate examining nothing reports green
  lawfully.
- hazard class to criterion (section 2.6, NEW at revision 3). **This phase is
  the reason section 2.6 exists**: round 2's `grep -in units` over all 4905
  lines of revision 2 hit only the hazard prose above, so the phase's central
  named hazard had no criterion behind it at all:

| Hazard item | Reddens against |
|---|---|
| a promoted entry that lost SC-011's precondition semantics, so an unmet precondition reads green | criterion 3, whose parity assertion consumes the runner's REAL output and requires zero gates green with an unmet precondition |
| a `modes[]` field made live in a shape M2's runner validates-if-present and silently accepts while meaning something else | criterion 1 plus step 1's escalation clause. Step 1 captures the reserved field's DELIVERED shape (`{"type": "array", "items": {"type": "string"}}`, `gate-manifest.schema.json` line 70) and a difference from what step 2 needs is a D-M3-16 escalation rather than a unilateral edit to a merged M2 gate |
| a gate declared with no precondition at all | criterion 4, Kind A, `required` removed and restored |
| the rendered `CLAUDE.md` block and the registry agreeing because the renderer reads the block rather than deriving from the registry | criterion 5, both directions: adding a gate to `gate-registry.yaml` WITHOUT re-rendering must make `--check` exit nonzero naming the added gate. A renderer that read the block would stay green there |
| the drift check wired as a TEXT assertion that survives being defanged | criterion 5b, which extracts and EXECUTES the step and observes its exit code, with two structurally different defangs |
| a not-applicable that is really a misconfiguration (M2-C-3) | **criterion 3c, NEW at revision 3.** No criterion covered this at revision 2 |
| a promotion that silently drops M2's `units`-greater-than-zero rule (M2-C-2) | **criterion 3b, NEW at revision 3.** No criterion covered this at revision 2, which is the finding that produced section 2.6 |
| the `test/liveness.test.ts:671` flake making `suite` a binary gate over a non-deterministic suite | **NO CRITERION IN THIS PHASE, section 2.6 reason 3.** The defect is in an M1-P5 file that this phase does not acquire and must not edit. Step 1(c) requires the observed state to be RECORDED in the work history and in risk 11, and if still open, in the promoted entry's `$comment`. Recording is not checking, and this row says so rather than implying otherwise |
- steps:
  1. Verify `gates.manifest.json`, its schema (including the reserved `modes`
     field's declared shape), and one real captured run of the M2 gate runner
     (store the capture under `test/fixtures/`; section 2.3 rule 3 forbids
     hand-written stand-ins). If M2's reserved `modes` shape differs from what
     step 2 needs, that is an escalation to the orchestrator, not a unilateral
     change to a merged M2 gate (D-M3-16).
  2. Create `schemas/gate-registry.schema.json`, a superset of the M2 manifest
     schema that makes the reserved `modes[]` field live per gate entry (the
     dimension blueprint section 5 requires, "the canonical list of gates per
     assurance mode"), and adds: `verified-by`
     with values `script` or `clean-room-checklist`; `probe` (required exactly
     when `verified-by` is `clean-room-checklist`), naming a checklist probe id
     that M3-P7 must supply; `precondition` carried over from M2-P1 unchanged.
  3. Create `gate-registry.yaml` at the package root: the promoted
     `gates.manifest.json`
     with the kernel-generic gates (build, suite wrapper, scope, citations,
     coverage, red-witness) and the project-specific gates
     (deploy, migrations, i18n, analytics, manifest regen, e2e, docs grep) kept
     declared-but-not-applicable on the kernel exactly as M2-P1 left them
     (scout observation 2), plus the two new entries:
     `unit-tests-for-changed-service-methods` (R-043) and
     `fixtures-for-changed-component-states` (R-044), both
     `verified-by: clean-room-checklist` per D-11, each naming its probe id.
  4. Extend the M2 gate runner with `--registry <file>` and `--mode <mode>`
     selection (verify its option-parsing shape before editing; if M2 already
     provides selection, consume it and record that no edit was needed).
  5. Create `scripts/render-agent-rules-gates.mjs`: renders the registry's
     kernel-applicable gate list into the exact block `CLAUDE.md` carries, and
     `--check` compares the rendered block against the file and exits nonzero on
     drift. Replace `CLAUDE.md`'s hand-written gate list with the rendered block
     and a pointer to `gate-registry.yaml` (R-094: single source consumed by CI
     and briefs; this is the drift gate that makes "single source" true rather
     than asserted).
     **Register `--check` as a `gate-registry.yaml` ENTRY, not as a raw
     workflow step (corrected at revision 3, section 2.2a, D-M3-34).** Revision
     2 said "wire `--check` into the gates workflow", which routes this phase's
     own check around the authority the phase exists to establish and would
     falsify R-094 on the day the phase merges. The entry declares
     `id: agent-rules-drift`, `command: ["node",
     "scripts/render-agent-rules-gates.mjs", "--check"]`,
     `unitLabel: "rendered gate rows compared"`, `applicability: required`, and
     `events: [pull_request, push]`. The same step adds the `events[]` field to
     `schemas/gate-registry.schema.json` (step 2) and back-fills it on every
     promoted entry, deriving each entry's value from the two bundle
     definitions in `scripts/m2-exit-test.sh` rather than assigning it by
     judgment: the `main` bundle runs `manifest-self-check`, `suite`,
     `coverage`, `credential-scrub`, `deploy` and `migrations`, and the three
     diff-scoped gates plus `credential-token` run only on the PR bundle. That
     mapping is captured from the harness in step 1 and recorded, because
     assigning `events[]` from memory is how the registry acquires a claim
     nothing checked.
  6. Register the `gate-registry` type with the validator's `--type` table and
     the `auto` resolver, mirroring M3-P1 step 10 (M3R-001: this phase's
     criterion 1 cannot be met without this edit, so the edit is declared).
  7. Tests: `test/gate-registry.test.ts`.
- files-to-touch: `schemas/gate-registry.schema.json`, `gate-registry.yaml`,
  `scripts/render-agent-rules-gates.mjs`, `test/gate-registry.test.ts`,
  `test/fixtures/gate-runner-capture.*` (create); `src/validate.ts` (edit, type
  table), `CLAUDE.md` (edit, gate
  section only), `.github/workflows/gates.yml` (edit), `package.json` (edit,
  add `gate-registry.yaml` to `files`), the M2 gate runner source (edit only if
  step 4 requires it; verify first), `src/cli.ts` (edit only if step 4 requires
  it), `gates.manifest.json` (edit, ADDED at revision 3: this phase promotes
  the manifest and must carry M3-P1's clause-map entry across, section 2.2a and
  D-M3-34; append-only, union-resolved against the merge base).
  **Standing constraint on the `.github/workflows/gates.yml` edit, NEW at
  revision 3 (DR-0017, DR-0004):** the workflow is ONE job named `gates` with
  no matrix, and the required status context is that literal string. This phase
  may not add a job and may not add a matrix; doing either renames the
  published context and detaches branch protection. The edit here is narrow by
  design, because D-M3-34 moves the drift check into the registry and the
  registry runs inside the bundle the harness already invokes.
- acceptance criteria:
  1. `tiphys validate --type gate-registry gate-registry.yaml` exits 0.
  2. A registry entry with `verified-by: clean-room-checklist` and no `probe`
     exits 1 naming the entry id; the same entry with a `probe` exits 0 (both
     directions).
  3. Running the M2 gate runner against the registry with `--mode full` on the
     kernel repository exits 0 and its report, parsed from the run's own output,
     accounts for every gate, with zero gates reported green whose precondition
     is unmet (SC-011). The assertion consumes the runner's real output, not a
     fixture transcribed by hand.
     **The expected-status table is CORRECTED at revision 3 against DR-0018,
     which revision 2 predates.** Revision 2 said "every kernel-generic gate as
     green and every project-specific gate as not-applicable", and DR-0018
     records that as unsatisfiable: three gates are DIFF-SCOPED (`red-witness`
     on `diff-touches src/, bin/`, `scope` on the branch and `--phase`,
     `citations` on `diff-touches` its configured documents), and on a head that
     does not touch their trigger they are legitimately `not-applicable` while
     the runner treats a REQUIRED gate reporting not-applicable as a failure
     (exit 20). So the assertion is:
     - every NON-diff-scoped required gate is green with `units` greater than
       zero;
     - every diff-scoped gate is either green (its trigger is touched by this
       phase's own diff, which for M3-P2 is true of `citations` and `scope` and
       false of `red-witness` unless step 4 edits the runner) or
       `not-applicable` carrying its precondition id and the recorded
       evaluation;
     - every project-specific gate is `not-applicable`, and `deploy` and
       `migrations` are not-applicable for a STRUCTURAL reason (release
       verification runs post-merge against a commit that does not exist yet),
       which grounding note (a) already forbids reading as "exercised";
     - zero `error`, zero `vacuous`, and recomputed counts equal
       `summary.json`.
  3b. **M2-C-2 survives the promotion (NEW at revision 3; section 2.6; the
     hazard class named this and no criterion checked it).** With the registry
     in place and the runner extended per step 4, a fixture gate whose command
     writes its own record with `status: green` and `units: 0` is REWRITTEN to
     `error` with `vacuous: true`, and the bundle fails. Both directions: the
     same fixture with `units: 1` reports green and the bundle passes. The
     dangerous state is a HAND-WRITTEN RECORD FILE, not a synthetic switch,
     because gates are subprocesses that author their own records (M2-D-07) and
     `scripts/m2-exit-test.sh --self-test` on `main` already uses exactly this
     fixture shape; the phase reuses that shape rather than inventing one.
     A registry promotion or a `--registry`/`--mode` extension that routes
     around `makeGateResult` and constructs a record literal is the realistic
     way this rule gets dropped, so the test asserts on the RECORD THE RUNNER
     INGESTED, never on the constructor being called.
     **Two structurally different members, per section 2.3 rule 6**: a
     zero-units green from a gate selected by `--mode full`, and a zero-units
     green from a gate selected by `--registry` under a non-full mode, because
     the two selection paths are where an extension can diverge.
  3c. **M2-C-3 survives the promotion (NEW at revision 3, same reason).** A
     gate invoked without a parameter it declares in `parameters[]` reports
     `error` naming the missing parameter, never `not-applicable` and never
     green. Witnessed against the real runner by selecting a `parameters:
     ["base"]` gate with no `--base` supplied, and in the other direction with
     `--base` supplied. The delivered gates carry this in their own refusal
     text (`src/gates/red-witness.ts` line 454, `src/gates/citations.ts` line
     1238), so the fixture asserts against captured real output per section 2.3
     rule 4 rather than against a hand-written string. This is the difference
     between "the precondition was evaluated and found unmet" and "the gate
     could not reach a verdict", and collapsing the second into the first is
     how a misconfiguration ships as a clean not-applicable.
  4. Kind A DANGEROUS-instance witness: a registry whose `deploy` gate declares
     no precondition is rejected by the schema `required` list (a gate with no
     precondition can only ever report green or red, which is how a vacuous pass
     enters). The guarding keyword is removed and the fixture accepted, then
     restored (section 2.3 rule 2). Criterion 2's probe requirement is likewise
     Kind A, an `if`/`then` on `verified-by`.
  5. `node scripts/render-agent-rules-gates.mjs --check` exits 0; adding a gate
     to `gate-registry.yaml` without re-rendering makes it exit nonzero naming
     the added gate; re-rendering returns exit 0.
  5b. **The drift check is wired as a BEHAVIOUR, not as a text (D-M3-28,
     section 2.3 rule 7).** The workflow step added in step 5 is extracted and
     EXECUTED against stubs, and its exit code is observed: with a drifted
     registry the extracted step exits nonzero, with a re-rendered one it exits
     0. A test asserting only that the step's text appears in
     `.github/workflows/gates.yml` does not discharge this criterion; M1-P6
     produced six confirmed instances of a text assertion surviving an edit that
     inverted the behaviour (`exit 1` to `exit 0`, two placements of `|| true`,
     a step-level `if: false`, a quoted YAML key the whitelist regex could not
     see, and, replacing the stale sixth member at revision 3, an `if:`
     narrowed so the step runs on only one CI event; DR-0017 deleted the fan-in
     job, so revision 2's "the step moved into a job the fan-in does not need"
     names a defang that cannot occur and a criterion written against it would
     be green and worthless). Two structurally different defangs are witnessed,
     per section 2.3 rule 6.
     **And the check's EVENT ARM is asserted (NEW at revision 3, T-009,
     D-M3-28).** The drift check is registered in `gate-registry.yaml` with
     `events: [pull_request, push]` (section 2.2a), and the criterion asserts
     the check is evaluated on BOTH arms, because `CLAUDE.md` drift is not a
     property of a pull request, it is a property of `main`. A check that ran
     only on `pull_request` would let a direct push, a rebase, or a
     merge-queue-side edit drift the file with nothing red.
  6. `CLAUDE.md`'s gate section is the rendered block plus the registry pointer,
     and contains no hand-maintained gate list (inspection plus criterion 5).
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; behaviors
     and clause map resolve for this phase's three rows; every earlier mapping
     still resolves.
- new behaviors: `gate-registry-validates`, `gate-registry-probe-required`,
  `gate-registry-precondition-required`, `gate-registry-not-applicable-not-green`,
  `agent-rules-gate-drift-detected`,
  and NEW at revision 2: `gate-drift-check-wired-executably`,
  and NEW at revision 3: `gate-registry-zero-units-green-becomes-error`,
  `gate-registry-missing-parameter-is-error-not-na`,
  `gate-registry-events-field-required`,
  `gate-registry-diff-scoped-na-accepted-with-reason`.
- suggested model tier: cheaper tier acceptable. The shape is fixed by the M2
  manifest and by SC-011; the work is promotion plus two entries.
- citations: R-043, R-044, R-094; D-11; SC-011; blueprint section 5 (gate
  registry) and section 4; plan v1 section 5 item 5 (M2-P1 seed) and scout
  observation 2; **NEW at revision 3**: M2-C-2 and M2-C-3 (criteria 3b and 3c,
  and the delivered enforcement in `src/gates/result.ts`), **DR-0017** (the
  single-job workflow and the required status context), **DR-0018** (criterion
  3's expected-status table), **T-009** (the `events[]` field and criterion
  5b's both-arms assertion), and D-M3-34.
- conflicts-with: M3-P3 (reads the registry's `modes` field), M3-P6 (the
  implementer brief renders its gate list from this registry), M3-P10
  (`package.json` files entry).
- blocked-by: M3-P1 merged; M2-P1 merged (named dependency: `gates.manifest.json`,
  its schema, and the runner).

### M3-P3: Assurance modes and role-to-model configuration

- id: M3-P3
- branch: `claude/m3-p3-assurance-modes`
- intent: Define the three assurance modes as validated data (pipeline stages,
  gate sets by reference, merge authority), define `full` as the current proven
  process's sequence (R-096), gate the adversarial plan review on mode
  declaration (R-024), and ship the kernel's role-to-model defaults (R-075).
- grounding: M3-P2 merged (the registry's `modes` dimension exists and gate ids
  are referenceable). Blueprint section 8 fixes the three modes and their merge
  authority; SC-008 and plan v1 D-6 fix what "merge authority: owner" means.
  T-003's structural consequence for full mode is applied here and is cited, not
  invented. Constraints C-2 and C-3 bind stage definitions (section 1.4).
  **Three decisions changed what this phase encodes after revision 1 and all
  three are cited rather than inferred.** DR-0015 removes the owner from the
  merge path INCLUDING at milestone boundaries, so `merge-authority: owner` is
  still a representable value (a future project may want it) but is no longer
  what the kernel's own regime is. DR-0016 changes the RESPONSE at an escalation
  bound from a stop-and-wait to a fresh implementer plus a third review contract
  dispatched immediately with the owner notified asynchronously, which is why
  `escalation-bounds` gains a required `on-exceeded` field in step 1. T-007
  requires a code phase to have TWO review contracts rather than two reviewers,
  which is a property of the pipeline and therefore lands in the stage list.
- hazard class (T-007, D-M3-32): **the one artifact in which a downgrade can be
  made invisible, and the one that encodes who may merge.** What can produce a
  mode set that validates while permitting less assurance than it appears to:
  a mode omitting a stage `full` contains with an empty `skips[]`, which is the
  improvisation blueprint section 8 forbids and which no schema keyword can
  see; `adversarial-plan-review` placed after `implement` in a pipeline that
  still contains both; a gate-set reference that resolves to nothing because the
  cross-document check was never run, so the mode's assurance is a name with no
  gates behind it; `escalation-bounds` carrying DR-0012's numbers while
  recording the SUPERSEDED response, which encodes a regime DR-0016 replaced;
  `merge-authority: delegated-under-conditions` with conditions that do not
  match DR-0012's, so the artifact and the grant differ; a charter mode enum
  that drifts from the mode ids the first time a mode is added; and a stage
  whose completion could be detected by process liveness, which is C-2 and
  which T-008 measured at nine hours eleven minutes on this project's own
  orchestrator.
- hazard class to criterion (section 2.6, NEW at revision 3):

**This phase's map came out fully covered, which is the result the rule wanted
and is worth stating rather than passing over: every one of the seven items
already had a criterion at revision 2. The rule found nothing to add here. It
found something to add at M3-P2, M3-P5, M3-P6 and M3-P9, and a map that is
uniformly full teaches nothing about whether the rule was applied.** One
residue is named below because the criterion covering it is weaker than the
hazard it is matched to.

| Hazard item | Reddens against |
|---|---|
| a mode omitting a stage `full` contains with an empty `skips[]` | criterion 3(a), Kind B check `mode-no-undeclared-downgrade`, both directions with the check deregistered and restored |
| `adversarial-plan-review` placed after `implement` in a pipeline containing both | criterion 3(b), Kind B check `mode-stage-order`, both directions |
| a gate-set reference that resolves to nothing because the cross-document check was never run | criterion 3(d), Kind B check `mode-gate-sets-resolve` run with `--context`, plus M3-P1 criterion 4c's standing rule that the same check invoked WITHOUT `--context` prints `SKIPPED <check-id> no context` and exits nonzero, so the cross-document rule cannot pass by not being run |
| `escalation-bounds` carrying DR-0012's numbers while recording the SUPERSEDED response | criterion 4c, the required `on-exceeded` field with its two-item enum, both directions, plus the registered test asserting `full`'s value is `fresh-implementer-and-third-contract` and not `escalate-to-owner` |
| `merge-authority: delegated-under-conditions` with conditions that do not match DR-0012's | criterion 4b, both directions via `if`/`then` on the empty `conditions[]` and the missing `granted-by` |
| a charter mode enum that drifts from the mode ids the first time a mode is added | criterion 4, Kind B check `charter-mode-enum-matches-modes`, whose dangerous state is correctly the ADDED-MODE case rather than the steady state |
| a stage whose completion could be detected by process liveness (C-2) | criterion 5, a registered grep over `assurance-modes.yaml` and its schema for `pid`, `kill`, `daemon`, `background`. **Residue, named at revision 3 because matching a hazard to a criterion is worth nothing if the criterion is weaker than the hazard**: this is a fixed-token presence check, so a stage whose completion is liveness-detected WITHOUT using any of the four words passes it. The four tokens are the vocabulary C-2 and C-3 are written in, which is why they are the right first line, and the second line is the hazard review contract, which is prose-reading rather than grep. M3-P9 criterion 5 has the same shape and the same residue for `AGENTS.md`. Neither is upgraded here, because the upgrade is a semantic check over prose and inventing one is section 2.6 reason 2's shape |
- steps:
  1. Create `schemas/assurance-modes.schema.json`: a mode is
     `{id, pipeline[], gate-sets[], merge-authority, skips[], declared-by}`
     where `pipeline[]` entries are stage ids from a closed enum, `gate-sets[]`
     are references resolved against `gate-registry.yaml`, `merge-authority` is
     an enum of `owner`, `owner-approves-orchestrator-merges` (D-6, SC-008), and
     `delegated-under-conditions`, the last requiring a `conditions[]` list and
     a `granted-by` decision-record reference. The third value exists because
     the owner has already granted exactly that regime once, in DR-0012 (dual
     cross-model clean review, orchestrator merges, grant standing until the
     owner returns), and a mode vocabulary that cannot express the authority
     regime actually in force would force the next such grant to live outside
     the artifacts,
     **Revision 2 adds the DR-0015 annotation, not a fourth value.** The enum is
     unchanged: `owner`, `owner-approves-orchestrator-merges`, and
     `delegated-under-conditions` all remain representable, because a future
     project may declare any of them and the kernel is not the place to make
     another project's governance unrepresentable. What changes is the
     `$comment` on the field and the kernel's own charter instance: DR-0015
     records that for THIS project the owner is not an approval step anywhere in
     execution, milestone boundaries included, and that dual cross-model clean
     review is the signature. So `owner-approves-orchestrator-merges` describes
     a regime this project has left, and the schema says so with a dated
     citation rather than by deletion.
     and `skips[]` lists the stages this mode omits. "Non-empty for any mode that
     omits a stage `full` contains" (blueprint section 8: "downgrades are
     declared, never improvised") is Kind B, derived check
     `mode-no-undeclared-downgrade`: it compares one mode's pipeline against the
     sibling `full` mode's, which is a cross-object comparison no schema keyword
     performs (M3R-002). The schema's own share is the field's presence and item
     type. Stop-rather-than-grind bound: a mode may carry
     `escalation-bounds: {max-fix-rounds-after-review, recurrence-of-high-in-one-component, on-exceeded}`,
     and `full` carries DR-0012's own two limits plus DR-0016's response,
     because a limit that lives only in an orchestrator's discipline is the
     prompt-only state blueprint principle 6 calls temporary.
     **`on-exceeded` is NEW at revision 2 and is required whenever
     `escalation-bounds` is present (DR-0016).** Its value is a closed enum of
     `fresh-implementer-and-third-contract` and `escalate-to-owner`, and `full`
     declares the first. This is not a refinement: DR-0012's bound as revision 1
     encoded it was a STOP-AND-WAIT, and DR-0016 replaced that response after
     measuring that the stop cost 4.7 hours on M1-P5 alone (16 per cent of that
     milestone's elapsed critical path), that it fired three times, that all
     three times the owner chose the option the orchestrator had already
     recommended, and that the intervention which actually broke M1-P5's spiral
     was the FRESH IMPLEMENTER dispatched afterwards, which derived eleven call
     sites where the review had listed eight. A bound recording the limit but
     not the response encodes the superseded regime in the kernel's own data,
     which is exactly the drift this phase's other checks exist to prevent.
     `escalate-to-owner` remains in the enum because DR-0016's residual
     guardrail is real: if the round after the fresh implementer also fails, the
     phase goes to the owner.
     **Revision 1's parenthetical is superseded 2026-08-06.** It read "those
     limits are being exercised right now (M1-P5 is stopped at PR #8 under
     exactly them)". M1-P5 MERGED at `58ac964` (PR #8) after four fix rounds and
     six clean-room reviews, with zero high findings from either contract on the
     merged code, and M1 completed on 2026-08-06. The claim is kept in its
     corrected form because the underlying point survives and is now stronger:
     the limits were exercised, three times, and the measurement of what
     happened next is what produced DR-0016.
  2. Create `assurance-modes.yaml` with `full`, `direct-pr`, `local-only`.
     `full`'s pipeline is the process doc's sequence enumerated (process doc
     section 9 item 3, R-096): intake, verification-pass, plan,
     adversarial-plan-review, implement, clean-room-review, fix-round,
     fix-round-verification, merge-on-green, deploy-verify, migration-verify,
     final-report. The `fix-round-verification` stage is required in `full` and
     is the applied form of T-003's structural consequence ("full mode must
     require a delta review or verification of every fix round, not leave it to
     orchestrator discretion"); it is cited to T-003 and to
     `delivery/review/verification-m1-p3-fix-round.md`, not asserted as new
     policy. R-024's rule (adversarial plan review happens before anyone builds)
     is Kind B, derived check `mode-stage-order`: `adversarial-plan-review` must
     precede `implement` in any mode whose pipeline contains both, and a mode
     omitting it must list it in `skips[]`. Relative position of two values in a
     variable-length array is not a schema keyword property (M3R-002). Gate-set
     references resolve through Kind B check `mode-gate-sets-resolve`, which
     reads `gate-registry.yaml` from `--context`. `full` requiring a
     `fix-round-verification` stage is Kind A (`if` on `id`, `then` a `contains`
     on `pipeline[]`). Under DR-0013 as decided this is simply Draft 2020-12, which includes
     `contains`; section 7 records that addition.
  2b. **`review-contracts`, NEW at revision 2 (T-007, D-M3-32).** The
     `clean-room-review` stage carries a `review-contracts[]` list rather than a
     reviewer count, and `full` declares exactly two contracts by id:
     `criteria` (walks the phase's acceptance criteria) and `hazard` (is given
     the phase's declared `hazard-classes[]` as its starting question). A mode
     whose pipeline contains `clean-room-review` and whose `review-contracts[]`
     has fewer than two entries is invalid, Kind A via `if`/`then` over
     `minItems`. T-007's evidence is why this is a schema rule and not a brief
     sentence: two reviewers on different model families walked all fifteen of
     M1-P5's acceptance criteria by direct execution, agreed on every mechanical
     fact, and one returned APPROVE while the other found a high-severity defect
     that live-locks `doctor`, `spawn`, `teardown` and both watcher modes. The
     approving report does not contain the word `readBeacon`, because no
     criterion covers that path. **Had both been briefed on the criteria, both
     would have approved, on any two models.** The decorrelation that mattered
     was in the question asked, and this project had it by accident of how two
     lenses happened to be briefed. `full` makes it a declaration.
     Its relation to DR-0012, stated so the two are not read as one: DR-0012
     requires two different MODEL FAMILIES and T-007 requires two different
     CONTRACTS. They are orthogonal, `full` requires both, and
     `scripts/check-dual-review.mjs` (M3-P9) checks both, which is why that
     script's `framing` distinctness check and this field are two halves of one
     rule rather than a duplication.
  3. Create `schemas/role-model-config.schema.json` and
     `role-model-config.yaml` (R-075): per role id, a `tier` of `strongest` or
     `cheaper` with the process doc's own rule applied (strongest for
     money-path and architecture phases, investigations, and all reviews;
     cheaper for mechanical phases), a `charter-override: allowed` flag, and
     `review-model-family` (optional), which exists because T-001 recorded a
     miss that survived three same-family rounds and asked for at least a
     charter-level option to route one review round of a full-mode plan to a
     different family. Binding is configuration resolved by the harness adapter
     (blueprint section 6); M3 ships the data and no resolver.
  4. Add `mode` and `assurance-tier` validation to the charter schema's enum
     (edit `schemas/charter.schema.json`: replace M3-P1's declared placeholder
     enum with the mode ids defined here), and register Kind B check
     `charter-mode-enum-matches-modes`, which asserts the schema's enum equals
     the ids in `assurance-modes.yaml`. Without it the two lists are a
     duplication that drifts silently the first time a mode is added, which is
     the same drift hole M3-P2 closes for the gate list.
  5. Add `tiphys mode show --mode <id>` printing the resolved stage list and
     gate sets, so a brief or a human can read what a declared mode requires
     without parsing YAML by hand.
  6. Register the `assurance-modes` and `role-model-config` types with the
     validator's `--type` table and the `auto` resolver, and register this
     phase's four derived checks in `src/checks.ts` (M3R-001: criterion 1 cannot
     be met without the first edit and criteria 3a, 3b, 3d cannot be met without
     the second).
  7. Tests: `test/assurance-modes.test.ts`.
- files-to-touch: `schemas/assurance-modes.schema.json`, `assurance-modes.yaml`,
  `schemas/role-model-config.schema.json`, `role-model-config.yaml`,
  `src/modes.ts`, `src/commands/mode.ts`, `test/assurance-modes.test.ts`
  (create); `schemas/charter.schema.json` (edit), `src/validate.ts` (edit, type
  table), `src/checks.ts` (edit, register this phase's derived checks),
  `src/cli.ts` (edit), `package.json` (edit, files entry).
- acceptance criteria:
  1. `tiphys validate --type assurance-modes assurance-modes.yaml` exits 0, and
     the same for `role-model-config.yaml`.
  2. `tiphys mode show --mode full` exits 0 and prints exactly the twelve stage
     ids of step 2 in order; `--mode direct-pr` and `--mode local-only` exit 0
     and each print a `skips` list that is non-empty.
  3. DANGEROUS-instance rejections, each exiting 1 and naming the offending
     field: (a) a mode whose pipeline omits `clean-room-review` while `skips[]`
     is empty (an undeclared downgrade, the improvisation blueprint section 8
     forbids), Kind B, check `mode-no-undeclared-downgrade`; (b) a mode whose
     pipeline places `implement` before `adversarial-plan-review` (R-024),
     Kind B, check `mode-stage-order`; (c) a `full` mode definition with no
     `fix-round-verification` stage (T-003), Kind A, `contains`; (d) a mode
     referencing a gate set id absent from `gate-registry.yaml`, Kind B, check
     `mode-gate-sets-resolve`, run with `--context`. Each Kind B fixture carries
     `(check: <id>)` in its message and is witnessed by deregistering and
     restoring the check (section 2.3 rule 3); the Kind A fixture is witnessed by
     removing and restoring the `contains` keyword (rule 2). All witnesses are
     captured in the work history and reverted.
  4. A charter declaring `delivery-mode: yolo` exits 1 naming the enum; a
     charter declaring `full` exits 0 (both directions). Adding a fourth mode id
     to `assurance-modes.yaml` without updating the charter schema's enum makes
     `charter-mode-enum-matches-modes` exit 1 naming both files; updating the
     enum returns exit 0 (Kind B, both directions).
  4b. A mode with `merge-authority: delegated-under-conditions` and an empty
     `conditions[]` or a missing `granted-by` exits 1 naming the field; the same
     mode carrying DR-0012's six conditions and its record reference exits 0
     (both directions, Kind A via `if`/`then`). This is the falsifiable form of
     "downgrades are declared, never improvised" applied to authority rather than
     to stages.
  4c. `full`'s `escalation-bounds` carry DR-0012's two limits with values, and a
     `full` definition missing `escalation-bounds` exits 1 (Kind A, both
     directions). The bound is data the orchestrator brief cites (M3-P9), not
     an enforcement engine: nothing in M3 counts fix rounds, and section 4.5
     records that as unproven rather than implying otherwise.
     **Revision 2 adds the `on-exceeded` half (DR-0016), both directions**: an
     `escalation-bounds` object with the two limits and no `on-exceeded` exits 1
     naming the field; `full`'s declared value is
     `fresh-implementer-and-third-contract`; a value outside the two-item enum
     exits 1 naming the enum. Kind A via `required` and `enum`, witnessed by
     removing and restoring each. A registered test asserts `full`'s value is
     the fresh-implementer one and not `escalate-to-owner`, so the kernel's own
     mode cannot silently revert to the regime DR-0016 measured and replaced.
  4d. **Two review contracts in `full` (T-007), both directions.** A `full`
     definition whose `clean-room-review` stage declares one
     `review-contracts[]` entry exits 1 naming the pointer; the same definition
     with `criteria` and `hazard` exits 0. Witnessed by removing and restoring
     the `minItems`. A registered test asserts the two ids are distinct, because
     two entries both named `criteria` would satisfy `minItems` and reproduce
     exactly the failure T-007 records.
  5. Structural constraint check: `assurance-modes.yaml` contains no stage whose
     definition mentions process liveness, pid, or backgrounding, verified by a
     grep over the file and its schema for `pid`, `kill`, `daemon`, `background`
     (C-2, C-3); the check is a registered test so it holds on every future run.
  6. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's three rows; earlier mappings still resolve.
- new behaviors: `modes-validate`, `mode-show-full-stage-order`,
  `mode-undeclared-downgrade-rejected`, `mode-review-before-implement`,
  `mode-full-requires-fix-round-verification`, `mode-unknown-gate-set-rejected`,
  `charter-mode-enum-closed`, `charter-mode-enum-drift-detected`,
  `mode-delegated-authority-requires-conditions`,
  `mode-full-requires-escalation-bounds`, `modes-no-liveness-vocabulary`,
  and NEW at revision 2: `mode-escalation-bounds-require-response`,
  `mode-full-response-is-fresh-implementer`,
  `mode-clean-room-requires-two-contracts`,
  `mode-review-contracts-are-distinct`.
- suggested model tier: strongest. This phase encodes merge authority, the
  definition of the pipeline that all later work is measured against, and the
  one place where a downgrade could be made invisible.
- citations: R-024, R-075, R-096; blueprint sections 6 and 8; process doc
  sections 5 and 9; SC-008, plan v1 D-6, and DR-0012 (the delegated authority
  value and its conditions); T-001 (review-model-family option);
  T-003 (fix-round verification stage); constraints C-2 and C-3;
  **DR-0015** (the annotation on `owner-approves-orchestrator-merges`);
  **DR-0016** (`escalation-bounds.on-exceeded`, and the measurement behind it);
  **T-007** (`review-contracts[]`, D-M3-32); **T-008** (why the C-2 criterion 5
  scan is not decoration).
- conflicts-with: M3-P6 and M3-P9 (both reference mode ids), M3-P7 (the
  fix-round-verification stage needs a checklist), M3-P10 (files entry).
- blocked-by: M3-P2 merged. DR-0010's M3 half (section 7) should be answered
  before dispatch; if it is not, this phase ships the configuration with no
  harness targeting, which is the recommendation anyway, and the record says so.
- honest scope note: M3 never executes `direct-pr` or `local-only`. The kernel
  runs `full` and only `full` (the exit test is a full-mode run). These two
  modes are therefore witnessed by validation and by `mode show`, not by
  execution, and section 4's does-not-prove list says so. Building an
  enforcement engine for a mode this milestone never enters is precisely the
  M1-P3 failure this plan is trying not to repeat.

### M3-P4: Reporting, work-history, and environment-warning contracts

- id: M3-P4
- branch: `claude/m3-p4-report-and-work-history`
- intent: Ship the report contract, the final-report shape, the work-history
  contract, and the environment-warnings template, so that from here on every
  role brief and checklist has a validated output format to point at instead of
  describing one in prose.
- grounding: M3-P3 merged. M2-P3's full-suite wrapper exists and its exit code
  and parity counts are the only meaning of "all green" (R-048, R-086); a real
  captured wrapper run is stored as a fixture (section 2.3 rule 3). M2-P6's
  coverage checker has a finding-to-outcome parity mode (R-089b) and, because
  the report contract did not exist when M2 was planned, it defines its own
  input contract: a findings inventory plus a coverage table in a declared shape
  (M2 plan section 2 item 2, which names this as a real dependency in the M3
  direction). This phase's schemas must emit that shape or supersede it
  deliberately; the choice is recorded in the work history and the criteria
  below run the real checker rather than reasoning about compatibility. T-003 and T-004 both name this contract as a structural
  consequence, and both are applied here by citation.
  **Revision 2 adds three more inputs that name this phase by name, and it is
  now the phase carrying the most re-grounding weight in the plan.** T-006
  establishes that T-003's universal-quantifier rule, which revision 1 already
  carried here, would have caught NONE of the three false claims M1-P5 produced,
  because impossibility, coverage and remedy claims are existential and causal
  rather than universal and are settled by CONSTRUCTION rather than by
  counter-experiment. `CLAUDE.md`'s fix-round contract and claim grep are
  repository rules that become KERNEL DELIVERABLES here: this is the phase where
  a future project inherits them or does not. And the M2 traceability table
  routes four uncovered M1 defects to this contract by name (rows 11, 12, 19 and
  20 of `delivery/plan/kernel-plan-m2.md` section 1.5: a work history that
  declared a path untestable when it was one CLI flag away; a deviation
  declaration that undercounted its own extras; an evidence bundle recording a
  claim that was false while being internally consistent and machine-valid; and
  a self-reported registry count wrong by exactly one while described as
  "computed independently"). Those four are what this contract is for, and none
  of them is caught by any gate M1 or M2 builds.
- hazard class (T-007, D-M3-32): **the contract that decides what a false claim
  is allowed to look like, in a milestone whose own evidence is written in it.**
  What can produce a schema that validates a dishonest record: a required field
  satisfied by an empty string, so `reason`, `not-covered` and
  `no-findings-statement` become ceremony; an arithmetic parity rule that adds
  up while a row is lost, which is the shape M1 produced twice; a claims section
  whose `kind` enum is open, so an impossibility claim can be filed as a note
  and skip its construction requirement; a fix-round record whose `derivation`
  field accepts a SUMMARY of the command's output rather than the full output,
  which is the exact softening `CLAUDE.md` names; a gate-result `green` that can
  be constructed without the wrapper's exit code because the coupling lives in
  a different object; an `honest-failures[]` entry that is structurally complete
  and semantically empty; and, worst because it is invisible, a schema that
  makes an honest record MORE expensive to write than a dishonest one, which is
  how a contract gets routed around rather than broken.
- hazard class to criterion (section 2.6, NEW at revision 3). **Criterion
  lettering was 2, 2c, 2d, 2b at revision 2 and is reordered to 2, 2b, 2c, 2d
  here (A-014), because `verdict-criteria-complete` compares a verdict's
  hand-transcribed `criteria[]` against this list mechanically and an
  out-of-order id is exactly what such a transcription drops:**

| Hazard item | Reddens against |
|---|---|
| a required field satisfied by an EMPTY STRING, so `reason`, `not-covered` and `no-findings-statement` become ceremony | **criterion 2e, NEW at revision 3.** No criterion covered this at revision 2: every rejection fixture removes a field, and `required` is satisfied by `""`. The new criterion is below |
| an arithmetic parity rule that adds up while a row is lost | criterion 2b(a), Kind B check `report-parity-arithmetic`, and criterion 2b(b) plus criterion 4 for the final-report direction, the second checked twice on purpose |
| a claims section whose `kind` enum is OPEN, so an impossibility claim is filed as a note | criterion 2c(d), which requires `kind: note` to exit 1 naming the enum, with three structurally different members of the claim class witnessed at 2c(a), (b) and (c) |
| a `fix-round.derivation` accepting a SUMMARY rather than the full output | criterion 2d(c) for the empty-or-absent case, and 2d(d), which requires a registered test asserting the shipped template's `derivation` carries real multi-line captured output rather than a one-line placeholder |
| a gate-result `green` constructible without the wrapper's exit code because the coupling lives in a different object | criterion 2(a), Kind A `if`/`then` on the same object, both directions, with criterion 3 requiring the fixture to be a VERBATIM capture of the real M2 suite wrapper rather than an authored string |
| an `honest-failures[]` entry structurally complete and semantically empty | criterion 2(c) for the missing `exposure-window`, plus **criterion 2e** for the empty-string case. The residual, that a non-empty `exposure-window` can still be meaningless, is section 2.6 reason 1 and is the hazard reviewer's, via M3-P7's `honest-failure-substance` probe |
| a mechanism restated as the finding it came from | **NO SCHEMA CAN REACH THIS, section 2.6 reason 1**, and criterion 2d(a) already says so in terms rather than claiming otherwise. The instrument is M3-P7's `fix-round-mechanism-named` probe; risk 2 covers the residue. What the schema buys is that the round cannot be REPORTED without `not-covered` and a full `derivation.output`, which is 2d(b) and 2d(c) |
| a schema that makes an honest record MORE EXPENSIVE to write than a dishonest one | **NO CRITERION CAN REACH THIS, section 2.6 reason 1, and it is the item the phase's own hazard paragraph calls the worst because it is invisible.** It is a property of the ratio between two authoring costs, not of any instance, so no fixture exhibits it. Two partial instruments are named rather than pretending to one whole: the phase's own step 4 requires the four shipped templates to be filled with REAL content from this repository's existing records rather than with placeholders, so the cost of an honest record is paid once by the plan and is visible; and M3-P7's clean-room checklist carries the `contract-avoidance` probe asking whether any record in the phase routed around a field rather than filling it. Neither is a test. Recorded here because an unrecorded uncheckable hazard reads as a checked one |
- steps:
  1. Create `schemas/report.schema.json`. Required: `kind`, `role`, `task`,
     `verdict` where applicable, `findings[]` each with `id`, `severity`,
     `evidence[]` (each an object with `path` and either `lines` or `command`
     plus `exit-code`), `analysis` (block scalar), and `outcome`;
     `deviations[]` (R-057a: every departure from the plan's letter is declared,
     each with `plan-clause` and `why`); `honest-failures[]` each requiring
     `cause`, `exposure-window`, and `structural-fix` (R-088, so an incident
     cannot be recorded without the three things that make it useful);
     `environmental-claims[]` each requiring `evidence[]` (R-085, so an
     environmental excuse without evidence is unrepresentable); and
     `gate-results[]` where a result of `green` requires
     `wrapper-exit-code: 0` and `discovered`, `passed`, `failed`, `skipped`,
     `did-not-run` counts (R-049, R-086: "all green" only ever means the
     wrapper's exit code, expressed as a schema rule rather than as an
     instruction an agent can forget).
     Two entries applied from tuition, both cited in the schema's `$comment`
     fields: `findings[].source-pinned` (boolean, required) with a
     `pinned-evidence` ref when true, so a finding produced by a run that
     cannot pin the source it ran against is labelled rather than inherited as
     fact (T-004); and `universal-claim` handling, where any `analysis` or
     `evidence[].note` containing a universal quantifier (`always`, `never`,
     `every`, `all cases`, `in all`) requires a sibling `counter-experiment`
     reference (T-003 lesson 3 and its named structural consequence, which
     states this is partially lintable).
  1b. **`claims[]`, NEW at revision 2, and the largest single addition this
     phase takes (T-006, `CLAUDE.md`'s claim grep, D-M3-30).** T-006 establishes
     that step 1's `universal-claim` rule, which was T-003's answer, would have
     caught NONE of the three false claims M1-P5 produced. Those were an
     impossibility claim ("this state cannot be constructed here"), a coverage
     claim ("this check catches that"), and a remedy claim ("doing X recovers
     from Y"). Each is existential or causal rather than universal, and each is
     settled by CONSTRUCTION rather than by counter-experiment: a universal
     claim needs someone to try to falsify it, an impossibility claim needs
     someone to try to BUILD the thing. The report and work-history schemas
     therefore share a `claims[]` definition:
     `{id, kind, statement, settled-by}` where `kind` is a CLOSED enum of
     `universal`, `impossibility`, `coverage`, `remedy`, and `open-question`,
     and `settled-by` is required for every kind except `open-question`, whose
     entries must instead carry no evidence and are the honest restatement.
     Per kind: `universal` requires a `counter-experiment` reference (T-003
     unchanged); `impossibility`, `coverage` and `remedy` each require an
     `executed-construction` object carrying `command`, `exit-code` and
     `output`, which is the attempt rather than the reasoning that predicted
     the attempt would fail.
     **Why a schema field and not a regex.** `CLAUDE.md`'s claim grep is
     mechanical and binding on this project today, and it works because a work
     history is prose a grep can scan. But T-006 records that its own pattern
     "survived being documented as a norm" and was then reproduced by the
     orchestrator who filed it, on the same day. A grep over free prose finds
     candidate sentences; a declared section gives the check a FIELD, so the
     honest restatement is a first-class value rather than an omission. Both
     survive: M3-P6's implementer brief carries the grep as a pre-submission
     obligation over the prose, and this schema carries the section. The two are
     not redundant, because the grep finds what the author forgot to declare.
     **The honest restatement is cheap and the schema makes it available**:
     "I did not find a way to force this arm" is `kind: open-question` and needs
     no construction; "this arm cannot be forced here" is `kind: impossibility`
     and needs one. T-006's whole lesson is that the first invites the next
     reader to try and the second closes the question permanently, and the
     schema is where that difference stops depending on which sentence an
     implementer happened to write.
  1c. **`fix-round[]`, NEW at revision 2 (`CLAUDE.md`'s fix-round contract,
     D-M3-30).** A report of a fix round requires a `fix-round` object with
     three required fields, and each maps to one item of the measured contract:
     `mechanism` (a statement of the MECHANISM, not the finding: "a FIFO at the
     beacon hangs the guard" is a finding, "reading a path whose type has not
     been established" is the mechanism, and the round fixes the second);
     `derivation` (`{command, output}`, where `output` is the FULL output of the
     command that enumerates every call site of that mechanism, not a summary of
     it, which is a schema `minLength` plus a registered test asserting the
     example carries a multi-line value); and `not-covered` (a non-empty
     statement of the regions the derivation excluded and why).
     The measured evidence, cited in the schema's `$comment` so a future reader
     finds the reason rather than the rule: a throughput analysis of M1
     measured sixteen completed fix rounds, thirteen were re-reviewed, and
     TWELVE of those thirteen produced a new finding attributable to the round
     itself; the dominant shape, roughly a third of the milestone's elapsed
     time, is that the fix addressed the INSTANCE the reviewer named when the
     defect was the MECHANISM, and M1-P3 chained four rounds that way, M1-P5
     four, M1-P6 two. `not-covered` is required rather than optional because a
     search whose scope is wrong returns an empty result indistinguishable from
     an absence of defects, and this project was bitten by that three times
     (`state/session.lock` probed when the lease is `state/orchestrator.lock`;
     an inventory scoped to `tasks/`, `state/` and `worktrees/` while the missed
     path sat at the fleet root; a usage error read as a clean result).
     M3-P7's clean-room checklist makes `not-covered` the reviewer's FIRST
     probe, which is the other half of the same rule.
  2. Create `schemas/final-report.schema.json` (R-089a): `input-findings[]`
     mapping every input finding id to an `outcome` (the table), plus
     `decisions-owed[]`, `owner-verification[]`, `infrastructure-left[]`, and
     `out-of-band[]`, all required and all allowed to be empty only with an
     explicit `none: true` marker, so silence and emptiness are distinguishable.
     **One property of this schema is load-bearing beyond this phase and is
     named at revision 2: the final report is a PROJECTION, not a summary.**
     Every field above is derived from records that already exist (findings,
     verdicts, decisions, work histories), which is the same relation M3-P8's
     mechanism index has to the tuition feed. That relation is what makes a
     dense read layer possible on top of a verbose archive: the projections
     (final report, mechanism index, findings inventory, carried-forward items)
     are consumed at every dispatch and must stay dense, while the raw entries
     (full review texts, per-round work-history sections) are read only in
     dispute. Once a raw entry's durable residue has been projected out, the
     entry is archive rather than working state, and git history makes removing
     it from the working tree lossless. **M3 builds no compactor and this plan
     proposes none.** What it does is make the distinction structural in the
     artifacts, so a later compaction is a question about which layer a file is
     in rather than a judgement about which files look like filler.
  3. Create `schemas/work-history.schema.json` (R-052a, R-035): `prompt`
     (verbatim block scalar), `files-touched[]`, `per-step-commits[]`,
     `key-decisions[]` each with `decision` and `why` (the why that is invisible
     in the diff), `verification-first[]` (R-035: findings written before any
     code, recorded verbatim, with a required `contradicts-plan` boolean whose
     true value requires a `stopped-and-reported` reference),
     `deviations[]`, `gate-evidence[]` sharing the report schema's
     `gate-results` definition, and `environment-warnings[]` (R-083a's
     accumulation half). **At revision 2 it also shares the report schema's
     `claims[]` (step 1b) and `fix-round[]` (step 1c) definitions by `$ref`,
     rather than restating them.** A shared definition is not a convenience
     here: the work history is the artifact a later reviewer trusts and the one
     `CLAUDE.md` says must never be softened, and two independently-drifting
     copies of the honesty contract is the drift hole M3-P2 closes for gates and
     M3-P3 closes for mode ids. A registered test asserts both schemas resolve
     to the SAME definition object rather than to two equal ones.
  4. Create `templates/report.example.yaml`,
     `templates/final-report.example.yaml`,
     `templates/work-history.example.yaml`, and `templates/warnings.md`
     (R-083a's template half; markdown by the justified exception in section
     1.5, whose reason is that its only consumer appends it verbatim into a
     brief).
  5. Register the four types with the validator's `--type` table and the `auto`
     resolver, and register this phase's two derived checks in `src/checks.ts`:
     `report-parity-arithmetic` (asserts
     `discovered == passed + failed + skipped + did-not-run`, arithmetic over
     sibling fields that no schema keyword computes) and
     `final-report-finding-parity` (asserts every id in `inputs[]` appears in
     `input-findings[]`, a cross-array completeness property). Revision 0 listed
     both as schema witnesses, which was wrong (M3R-002).
  6. Tests: `test/report-contract.test.ts`, `test/work-history.test.ts`.
- files-to-touch: `schemas/report.schema.json`,
  `schemas/final-report.schema.json`, `schemas/work-history.schema.json`,
  `templates/report.example.yaml`, `templates/final-report.example.yaml`,
  `templates/work-history.example.yaml`, `templates/warnings.md`,
  `test/report-contract.test.ts`, `test/work-history.test.ts`,
  `test/fixtures/wrapper-capture.*` (create); `src/validate.ts` (edit, type
  table), `src/checks.ts` (edit, register this phase's derived checks).
- acceptance criteria:
  1. `tiphys validate` exits 0 on each of the four new example instances.
  2. Kind A DANGEROUS-instance rejections, each exiting 1 naming the offending
     pointer, each witnessed by removing and restoring the guarding keyword
     (section 2.3 rule 2): (a) a report with `gate-results[0].result: green` and
     no `wrapper-exit-code` (the exact shape of a false all-green claim, R-086);
     (b) a report with an `environmental-claims[0]` and an empty `evidence[]`
     (R-085); (c) an `honest-failures[0]` with a cause and no `exposure-window`
     (R-088); (d) a work history with a
     `verification-first[0].contradicts-plan: true` and no
     `stopped-and-reported` reference (R-035); (e) a finding whose `analysis`
     contains "always" and which carries no `counter-experiment` (T-003, an
     `if`/`then` over a `pattern` on the same object, so it is Kind A);
     (f) a finding with `source-pinned: true` and no `pinned-evidence` (T-004).
  2b. Kind B DANGEROUS-instance rejections, each carrying `(check: <id>)` in the
     message and each witnessed by deregistering and restoring the check
     (section 2.3 rule 3): (a) a report whose `gate-results[0]` has
     `wrapper-exit-code: 0` while `discovered` exceeds
     `passed + failed + skipped + did-not-run`, the silently-dropped-tests case
     R-048 exists for, check `report-parity-arithmetic`; (b) a final report whose
     `input-findings[]` omits an id present in its own `inputs[]` list, check
     `final-report-finding-parity` (R-089a's table has a hole). The second is
     deliberately checked twice, here by the kernel's own validator and in
     criterion 4 by the M2-P6 coverage checker, because the artifact should be
     self-checking and the independent checker is the one the pipeline runs.
  2c. **Claims-section rejections, NEW at revision 2 (T-006), each Kind A and
     each witnessed by removing and restoring the guarding keyword.** (a) A
     `claims[0]` with `kind: impossibility` and no `executed-construction`
     exits 1 naming the pointer, and the same claim carrying a construction with
     `command`, `exit-code` and `output` exits 0. This is M1-P5's exact false
     claim, "needs a stat or readdir failure that is neither ENOENT nor a
     permission bit, and this suite runs as root", which a reviewer disproved in
     minutes with `symlinkSync(p, p)` raising ELOOP and needing no privileges.
     (b) The same pair for `kind: coverage`, which is the M1-P5 claim whose
     unhandled case was a permanent hang of every supervision command. (c) The
     same pair for `kind: remedy`. (d) A `claims[0]` with `kind: note` exits 1
     naming the enum, because an open `kind` lets any claim be filed as
     something the schema does not question. (e) A `kind: open-question` entry
     with no `settled-by` exits 0, which is the honest restatement being
     first-class rather than an omission, and the same entry carrying an
     `executed-construction` exits 1, because a settled question filed as open
     is the opposite failure and is equally a misdeclaration.
     Three structurally different members of the claim class are witnessed
     across (a), (b) and (c), which exceeds section 2.3 rule 6's two.
  2d. **Fix-round contract rejections, NEW at revision 2 (`CLAUDE.md`,
     D-M3-30), each Kind A and each witnessed both directions.** (a) A
     `fix-round` with a `finding` restated as its `mechanism` is not
     schema-detectable and this criterion does NOT claim it is; what IS
     detectable and is asserted here is (b) a `fix-round` with no
     `not-covered`, which exits 1 naming the field, and (c) a `fix-round` whose
     `derivation.output` is empty or absent, which exits 1. (d) A registered
     test asserts `templates/report.example.yaml`'s `fix-round.derivation`
     carries real multi-line captured output rather than a one-line
     placeholder, per section 2.3 rule 4. The residue is stated rather than
     implied: **no schema can tell a mechanism from a finding**, that judgement
     is M3-P7's `fix-round-mechanism-named` probe, and risk 2 covers it. What
     the schema buys is that the round cannot be REPORTED without the two
     fields whose absence is what made twelve of thirteen re-reviewed M1 fix
     rounds produce a new finding.
  2e. **The empty-string satisfaction class, NEW at revision 3 (section 2.6;
     the phase's own hazard class named it first and no criterion reached it).**
     Every rejection fixture above removes a field, and `required` alone is
     satisfied by `""`, so a record can carry `reason: ""`, `not-covered: ""`
     and `no-findings-statement: ""` and validate. Every field whose VALUE is
     the point rather than its presence carries `minLength: 1` and a
     `pattern: "\\S"` so whitespace does not satisfy it either, and each is
     witnessed both directions: the instance with `""` exits 1 naming the
     pointer, the instance with real text exits 0, and the fixture is accepted
     when `minLength` is removed and rejected when it is restored (Kind A,
     section 2.3 rule 2). **Three structurally different members, exceeding
     section 2.3 rule 6's two, chosen because the three differ in WHERE the
     emptiness sits**: a top-level scalar (`no-findings-statement: ""`), a
     scalar nested inside an array element
     (`fix-round[0].not-covered: ""`), and a whitespace-only block scalar
     (`honest-failures[0].exposure-window` set to a newline and two spaces),
     which is the member `minLength` alone does not catch and is why the
     `pattern` is required beside it. The field inventory this applies to is
     written into the phase's work history as a list, because "every field
     whose value is the point" is a judgment made once at authoring time and a
     later reader cannot re-derive which fields were considered.
  3. The gate-results fixtures in criterion 2 use the real captured output of
     the M2 full-suite wrapper stored in `test/fixtures/`, and a registered test
     asserts the fixture is a verbatim capture (its recorded command and exit
     code are present) rather than an authored string (section 2.3 rule 3,
     T-003 lesson 4).
  4. The M2-P6 coverage checker, run in finding-to-outcome parity mode against
     `templates/final-report.example.yaml`, exits 0; against a copy with one
     `input-findings` row deleted it exits nonzero naming the orphaned id
     (R-089b consuming R-089a, both directions).
  5. `templates/warnings.md` is consumed unchanged by the M1-P4 brief assembly:
     placing it as a fleet `warnings.md` and running a spawn produces a
     `brief.md` containing its full text (R-083b's existing behavior, re-witnessed
     against the shipped template so the template cannot drift out of usability).
  6. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's nine rows; earlier mappings still resolve.
- new behaviors: `report-green-requires-exit-code`, `report-parity-counts-checked`,
  `report-environmental-claim-requires-evidence`,
  `report-incident-requires-exposure-window`, `report-universal-claim-requires-counter-experiment`,
  `report-unpinned-finding-labelled`, `work-history-contradiction-requires-stop`,
  `final-report-finding-outcome-parity`, `warnings-template-reaches-brief`,
  and NEW at revision 2:
  `report-impossibility-claim-requires-construction`,
  `report-coverage-claim-requires-construction`,
  `report-remedy-claim-requires-construction`,
  `report-claim-kind-enum-closed`,
  `report-open-question-needs-no-construction`,
  `report-fix-round-requires-not-covered`,
  `report-fix-round-requires-full-derivation-output`,
  `claims-definition-shared-with-work-history`,
  and NEW at revision 3: `report-empty-string-does-not-satisfy-required`,
  `report-whitespace-block-scalar-rejected`,
  `work-history-not-covered-rejects-empty-string`.
- suggested model tier: strongest. This is the contract that decides whether a
  false claim is expressible, and T-003 is a record of what one false claim in a
  work history cost this project.
- citations: R-035, R-049, R-052a, R-057a, R-083a, R-085, R-086, R-088, R-089a;
  blueprint section 5 (report contract) and section 11 (honest reporting rules);
  process doc sections 2b, 2e, 3, and 7; R-089b and R-048 as the M2 components
  consumed; T-003 (universal claims, real captured output) and T-004 (source
  pinning); **T-006** (the `claims[]` section and its three non-universal kinds,
  and the orchestrator's own instance); **`CLAUDE.md`'s fix-round contract and
  claim grep** (the `fix-round[]` object, D-M3-30, with the M1 measurement);
  **`delivery/plan/kernel-plan-m2.md` section 1.5 rows 11, 12, 19 and 20**, the
  four M1 defects M2 routes to this contract by name.
- conflicts-with: M3-P5 and M3-P6 (the briefs reference these types), M3-P7 (the
  verdict schema shares the finding definition), M3-P10 (files entry).
- blocked-by: M3-P3 merged; M2-P3 and M2-P6 merged (named dependencies).

### M3-P5: Authoring-role briefs and the finding format

- id: M3-P5
- branch: `claude/m3-p5-authoring-role-briefs`
- intent: Ship the investigator, plan-writer, and adversarial-plan-reviewer
  briefs with their frontmatter contracts, the finding-format schema those
  reviews output, and the brief composition command that resolves a role brief
  from the installed kernel; and correct the process doc's role table so the
  reviewer's settled visibility is stated in one place, not two contradictory
  ones (SC-001).
- grounding: M3-P4 merged (report and finding evidence shapes exist). M2-P5's
  citation linter is the verifier attached to the investigator and plan-writer
  roles (blueprint section 6); its real invocation is verified and recorded.
  `roles/` holds only the M1-P1 placeholder README. `src/brief.ts` exists from
  M1-P4 and is consumed, not rewritten: verify its exported shape first.
  **A warning about `src/brief.ts` specifically, added at revision 2 and
  verified at `037477e`.** It is one of the three files where M1's
  unprobed-open class is still OPEN: line 1 imports `readFileSync` and lines 43
  and 56 call it bare, so a named pipe at the fleet `warnings.md` hangs
  `tiphys spawn` forever and strands a worktree, a branch and a pool record
  (CR-560). This phase CONSUMES that module and adds `brief compose`, whose
  whole job is resolving and reading mandated-reading paths it did not create.
  **D-M3-27 binds the new code**: `brief compose` uses `classifyEntry` and
  `refuseOpenForWrite`. It does NOT fix `src/brief.ts` (that file is M1-P4's,
  patching it from here would repeat CR-521, and `delivery/STATE.md` records
  the class as needing its own scope), and it must not add a thirteenth
  instance. Record the observed state of the three files in the work history so
  the residue is measured rather than assumed unchanged.
- hazard class (T-007, D-M3-32): **judgment-bearing prose whose only mechanical
  guarantee is that a clause id exists, plus an edit to a governing document.**
  What can pass every criterion here and still be wrong: a clause present as a
  heading with text under it that says the opposite of the row it discharges,
  which the clause map cannot see; a `mandated-reading` list that resolves
  because every path exists while omitting the one document the role actually
  needs; a brief composed correctly whose rendered phase text silently drops a
  field the plan carries, so the agent reads a subset and believes it read the
  phase; the SC-001 process-doc edit rewriting rather than annotating, which
  loses the provenance the footnote exists to preserve; a `finding` schema that
  admits an empty review as a thorough one; and a composition path that blocks
  forever on a non-regular mandated-reading entry, which is this phase's own
  inherited hazard (D-M3-27, above).
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a clause present as a heading with text under it that says the OPPOSITE of the row it discharges | **NO CRITERION CAN REACH THE GENERAL CASE, section 2.6 reason 1**, and the phase's own hazard sentence says why: the clause map proves presence, never content. What IS covered is the one clause where the difference between rule and sentiment has a measured cost: criterion 6b's registered grep asserts `incremental-output`'s text names the artifact-within-the-first-minutes rule rather than "report as you go". The general case is the hazard reviewer's, through M3-P7's `clause-text-matches-row` probe, and `verdict-hazard-classes-addressed` requires a statement for this class |
| a `mandated-reading` list that resolves because every path exists while OMITTING the one document the role needs | **NO CRITERION CAN REACH THIS, section 2.6 reason 1.** Criterion 2 checks that every listed path resolves, which is the opposite direction; nothing can compute which document a role NEEDS. Named rather than left implied because criterion 2 reads, at a glance, as if it covered completeness and it covers only resolvability |
| a brief composed correctly whose RENDERED PHASE TEXT silently drops a field the plan carries | **criterion 3b, NEW at revision 3.** Criterion 3 checks that the output contains the mandated-reading list, the body and SOME rendered phase text in order, which a renderer emitting only `id`, `branch`, `intent` and `steps[]` satisfies. That renderer would hand every dispatched agent a phase with no acceptance criteria and no hazard classes, which is the one place the hazard-review contract M3-P6, M3-P7 and M3-P9 build is actually consumed |
| the SC-001 process-doc edit rewriting rather than annotating | criterion 4, which requires the footnote quoting the original wording and a registered test grepping BOTH files for the same visibility string, so the two cannot silently diverge |
| a `finding` schema that admits an empty review as a thorough one | criterion 5(b), `if`/`then` on `minItems` requiring a `no-findings-statement` when `findings: []`, both directions |
| a composition path that blocks forever on a non-regular mandated-reading entry | criterion 6c, both directions, with a real `mkfifo`, and it is explicitly NOT criterion 2's missing-path case |
- steps:
  1. Create `schemas/role-brief.schema.json` for the frontmatter of every
     `roles/*.md` file: `role` (id from the six of blueprint section 6),
     `lifetime`, `sees[]`, `never[]`, `mandated-reading[]` (ordered paths),
     `verifiers[]` (references to M2 components or gate ids),
     `outputs[]` (artifact types from `schemas/`), `model-tier` (resolved
     against `role-model-config.yaml`), and `clauses[]` (the clause ids the
     clause map resolves against). `additionalProperties: false`.
  2. Create `roles/investigator.md`: produces a root-cause verdict with evidence
     and fixes nothing (R-004); must produce a runnable repro that is red on
     current code, not an explanation (R-015a); reproduce before fixing, and if
     it will not reproduce, ship the harness and say so (R-092); every claim
     carries file:line evidence checked by the citation linter (R-010a's
     investigator half).
  3. Create `roles/plan-writer.md`: never decides product questions, flags them
     as decision records (R-005); performs the code-level verification pass over
     every input claim before any phase is planned, with file:line evidence
     (R-010a); outputs a plan instance validated by `schemas/plan.schema.json`.
  3b. **The dispatch contract, carried by all three briefs of this phase and
     both of M3-P6's (T-008, D-M3-31, NEW at revision 2).** Two clauses, with
     their own ids, in the shared clause block every role brief inherits:
     - `incremental-output`: the agent creates its output artifact within the
       first minutes of work and appends to it as it goes, so the file's mtime
       is a beacon and a death leaves a partial result rather than nothing. An
       agent that writes only at the end has no beacon. Measured cost of the
       absence: nine hours eleven minutes, T-008, and the entire loss was wall
       clock because nothing was written down as it happened.
     - `beacon-is-not-a-claim`: the agent does not report progress by asserting
       it. The artifact IS the report. This is the brief-side half of the
       orchestrator duty M3-P9 carries, and the two are written as one rule seen
       from two ends, because a watchdog watching freshness needs something
       freshening.
     Both are delivered under R-033a's "mandated reading in order" family for
     the implementer and under the corresponding brief-structure rows for the
     other roles, so no requirement row moves and Appendix A's counts are
     unchanged.
  4. Create `roles/adversarial-plan-reviewer.md`: sees the input report, the
     plan, and the code (the blueprint's deliberate widening, D-14), edits
     nothing, outputs a finding set (R-006). Amend
     `delivery/intake/orchestrated-delivery-process.md` section 0's role table
     row for this role: change the `Sees` cell to the settled visibility and add
     a footnote quoting the original wording and citing SC-001, D-14, and
     blueprint section 6. The original text is preserved in the footnote so the
     intake document is annotated rather than rewritten.
  5. Create `schemas/finding.schema.json` (R-029): a finding set is
     `{verdict, produced-by, findings[]}` where `verdict` is required,
     `findings[]` entries require `id`, `severity` (ranked enum), `evidence[]`,
     and `concrete-edit` (the plan edit the finding demands, R-029's "concrete
     plan edits"), and a set with `findings: []` requires
     `no-findings-statement`. `produced-by` records the model family that
     produced the review (T-001's second ask: record in the review header which
     family produced it).
  6. Create `src/roles.ts` and `src/commands/brief.ts`:
     `tiphys brief compose --role <id> --phase <plan-file> --phase-id <id>
     [--out <file>]` resolves `roles/<id>.md` from the installed kernel, checks
     every `mandated-reading` path exists, and emits the composed brief
     (frontmatter-driven header, brief body, the phase text rendered from the
     plan instance, then the fleet warnings file if present). Exits nonzero
     naming the first missing mandated-reading path. `src/brief.ts` stays the
     assembly used by spawn; composition writes the file spawn's `--brief`
     consumes, so no M1 contract changes.
  7. Tests: `test/roles.test.ts`, `test/brief-compose.test.ts`,
     `test/finding-schema.test.ts`.
- files-to-touch: `schemas/role-brief.schema.json`, `schemas/finding.schema.json`,
  `roles/investigator.md`, `roles/plan-writer.md`,
  `roles/adversarial-plan-reviewer.md`,
  `roles/_shared-dispatch-contract.md` (create, NEW at revision 3: the single
  copy of the `incremental-output` and `beacon-is-not-a-claim` clause text that
  this phase's three briefs and M3-P6's two briefs all include, so the specific
  wording exists once rather than five times; criterion 6b),
  `src/roles.ts`, `src/commands/brief.ts`,
  `test/roles.test.ts`, `test/brief-compose.test.ts`,
  `test/finding-schema.test.ts` (create); `roles/README.md` (edit),
  `src/cli.ts` (edit), `src/validate.ts` (edit, type table),
  `package.json` (edit, add `roles` to files),
  `delivery/intake/orchestrated-delivery-process.md` (edit, one table cell plus
  one footnote, per SC-001; declared here because an intake edit must never be
  an undeclared extra).
- acceptance criteria:
  1. `tiphys validate --type role-brief roles/<id>.md` exits 0 for all three
     briefs (frontmatter validated; body not parsed).
  2. A brief whose frontmatter names a `mandated-reading` path that does not
     exist causes `tiphys brief compose` to exit nonzero naming that path; with
     the path present the same command exits 0 (both directions). This is the
     falsifiable form of "mandated reading in order": the paths are checked, not
     promised.
  3. `tiphys brief compose --role plan-writer --phase templates/plan.example.yaml
     --phase-id <id>` exits 0 and the output contains, in order: the resolved
     mandated-reading list, the brief body, and the named phase's rendered text;
     composing with a `--phase-id` absent from the plan exits nonzero naming the
     id.
  3b. **The rendered phase text is a COMPLETE projection of the phase object
     (NEW at revision 3, section 2.6; the phase's own hazard class named this
     and criterion 3 does not reach it), both directions.** Every required
     top-level field of `schemas/plan.schema.json`'s phase definition appears in
     `brief compose`'s output, verbatim or by a documented transform declared in
     the renderer, and the assertion is driven FROM THE SCHEMA rather than from
     a hand-written field list: the test reads the schema's phase `required`
     array and requires a rendering for each name, so adding a required phase
     field in a later phase reddens this test until the renderer handles it,
     rather than silently shrinking the brief. The dangerous state is the
     realistic one: the renderer is edited to drop ONE field and the composed
     output is observed to shrink while criterion 3 as worded stays green;
     restoring the field returns both to green.
     **Two structurally different members, per section 2.3 rule 6, and they are
     structurally different because they fail in different ways**: dropping
     `hazard-classes[]`, an ARRAY OF OBJECTS whose absence leaves the hazard
     review contract with nothing to work from; and dropping `acceptance[]`, an
     array whose absence leaves the criteria contract with nothing, so a brief
     that dropped it would still compose, still validate and still be dispatched.
     One member is not a class here because a renderer can handle scalars
     correctly and arrays not at all.
  4. `roles/adversarial-plan-reviewer.md` states the settled visibility (input
     report, plan, code) and the process doc's role table row now matches it,
     with the footnote citing SC-001 (inspection plus a registered test that
     greps both files for the same visibility string, so the two documents
     cannot silently diverge again).
  5. Kind A DANGEROUS-instance rejections for `schemas/finding.schema.json`,
     each witnessed by removing and restoring the guarding keyword: (a) a
     finding set with a `severity: high` finding carrying no `concrete-edit`
     (`required` per finding); (b) a finding set with `findings: []` and no
     `no-findings-statement`, a silent empty review being indistinguishable from
     a thorough one, which is the failure this guards (`if`/`then` on
     `minItems`); (c) a finding set with no `produced-by` (T-001, `required`).
     All three are single-document properties, so none needs a derived check;
     this phase adds no entry to section 2.3's Kind B table.
  6. `tiphys validate --type report` accepts an investigator report only when a
     `repro` reference is present for a root-cause verdict, and rejects the same
     report with the reference removed (R-015a made mechanical through the
     report contract rather than left as brief prose; Kind A `if`/`then`, both
     directions).
  6b. **Dispatch-contract clauses present (T-008, D-M3-31), both directions.**
     All three briefs carry `incremental-output` and `beacon-is-not-a-claim` as
     body headings resolving from frontmatter (criterion 7's round-trip shape,
     imported here). Deleting either heading makes
     `tiphys validate --type role-brief` exit nonzero naming the orphaned clause
     id, and restoring it returns exit 0. A registered grep test asserts the
     `incremental-output` clause text names the artifact-within-the-first-
     minutes rule rather than a generic "report as you go", which is the
     difference between the rule and a sentiment.
     **Revision 3 makes the clause text a SINGLE COPY.** M3-P6 carries the same
     two clauses onto two more briefs, so the specific wording would exist in
     five places and drift independently. This phase creates
     `roles/_shared-dispatch-contract.md`, the one copy, and all three briefs
     here include it by the documented include the composer resolves; M3-P6's
     two briefs include the same file and do not edit it. The grep test asserts
     against the shared source AND against each composed brief's output, so a
     brief that inlines its own copy instead of including the shared block is
     caught by criterion 7's clause-id round trip (the shared block carries the
     ids, and an inlined copy duplicates them).
  6c. **Path-type refusal in composition (D-M3-27), both directions.** With a
     named pipe staged by a real `mkfifo` at a `mandated-reading` path,
     `tiphys brief compose` exits nonzero within a bounded time naming the path
     and the observed entry type and does NOT block; with a regular file at the
     same path it exits 0. This is not the same criterion as criterion 2: that
     one covers a MISSING path, and a missing path and a non-regular path are
     different states with different failure modes, which is precisely the
     distinction M1-P5 paid four fix rounds to learn.
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's seven rows; earlier mappings still resolve.
- new behaviors: `role-brief-frontmatter-validates`,
  `brief-compose-missing-reading-fails`, `brief-compose-renders-phase`,
  `brief-compose-unknown-phase-id-fails`, `reviewer-visibility-agrees-across-documents`,
  `finding-requires-concrete-edit`, `finding-empty-set-requires-statement`,
  `finding-records-model-family`, `investigator-report-requires-repro`,
  and NEW at revision 2: `role-brief-carries-incremental-output-clause`,
  `brief-compose-refuses-non-regular-reading-path`,
  and NEW at revision 3: `brief-compose-renders-every-required-phase-field`,
  `brief-compose-dropped-hazard-classes-detected`,
  `brief-compose-dropped-acceptance-detected`.
- suggested model tier: strongest. Brief content is judgment-bearing and the
  SC-001 correction touches a governing document.
- citations: R-004, R-005, R-006, R-010a, R-015a, R-029, R-092; blueprint
  section 6 (role table and attached verifiers) and section 1 (placement rule);
  process doc sections 0, 1a, 1b, 1d, and 8 item 6; SC-001 and plan v1 D-14;
  T-001; M2-P5 citation linter as the attached verifier; **T-008** (the two
  dispatch-contract clauses, D-M3-31); **`MECHANISMS.md`** row "reading a path
  whose type is not established" and CR-560 (the `src/brief.ts` warning in the
  grounding, and criterion 6c).
- conflicts-with: M3-P6 (adds two more briefs to the same schema and command),
  M3-P7 (checklists reference the reviewer roles), M3-P10 (files entry).
- blocked-by: M3-P4 merged; M2-P5 merged (named dependency); M1-P4 merged (for
  `src/brief.ts`, already true by M3).

### M3-P6: Delivery-role briefs (implementer and clean-room reviewer)

- id: M3-P6
- branch: `claude/m3-p6-delivery-role-briefs`
- intent: Ship the implementer and clean-room-reviewer briefs, with the
  implementer brief's six mandatory sections generated from the artifacts that
  own them rather than transcribed, so a registry or contract change cannot
  leave a stale brief behind.
- grounding: M3-P5 merged (`schemas/role-brief.schema.json`, `brief compose`).
  `gate-registry.yaml` from M3-P2 is the source of the brief's gate list
  (R-094's "consumed by CI and briefs"). M2-P2's red-witness harness and M2-P8's
  credential scoping are the structural facts two clauses cite. T-002 recorded
  a real agent death holding uncommitted work; R-081b's clause is written from
  that record. T-005 is the phase's other binding input: a rule M1-P3 paid for in
  a multi-hour investigation did not reach M1-P5, which reimplemented the same
  claim-file mechanism silently and produced the most severe defect found in M1.
  The implementer there had read the plan, the agent-rules file, the constraint
  list, the accumulated environment warnings and three work histories, and none
  of them carried the rule. T-005's named structural consequence lands on this
  brief's mandated-reading section, and its artifact half (the mechanism index)
  is delivered by M3-P8. Ordering note: the index therefore has to exist before
  the brief can require reading it, which is why this phase's criterion 8 is
  conditional and its full witness is completed by M3-P8 (see D-M3-23).
  **Revision 2 changes the premise of that ordering note, and it is the single
  most consequential re-grounding change in this phase.** Revision 1 was written
  when the mechanism index did not exist and therefore had this phase invent a
  one-entry stub. `MECHANISMS.md` was committed at the repository root on
  2026-08-05 with TWELVE rows, under T-005's own "cheap interim measure,
  available now", and it says of itself that it is intended to be SUPERSEDED by
  M3-P8's generated projection. So this phase does not invent a stub: **it
  CONVERTS the twelve interim rows into the schema M3-P8 will generate into**,
  and M3-P8's projection must not silently drop any of them (its criterion 4c).
  D-M3-23 is amended accordingly.
  **Three of the twelve rows bind this phase's own clauses rather than only its
  stub**, which is why the conversion is not clerical: "reading a path whose
  type is not established" is D-M3-27 and is the class still open in
  `src/brief.ts`, the module this phase's own command extends; "worktree removal
  and force branch delete" is the `destructive-authority` clause's evidence; and
  "asserting a CI step is wired" is D-M3-28, which binds this phase's own
  `scripts/check-brief-drift.mjs` wiring.
- hazard class (T-007, D-M3-32): **the instruction surface every future
  implementer runs on, whose defects are executed rather than read.** What can
  pass this phase's criteria and still produce bad implementers: a clause whose
  heading round-trips while its text says something weaker than the row (the
  clause map proves presence, never content); a generated gate-list block whose
  drift check compares the block to itself rather than to the registry; a
  mandated-reading list that names the mechanism index while the index it names
  is the stub nobody replaced, so the lookup obligation resolves against one
  entry and reads as satisfied; a `destructive-authority` clause whose third
  conjunct points at a manifest key M2 renamed; a claim-grep obligation stated
  without the command, so each implementer invents their own pattern; a
  dispatch-contract clause that says "report progress" instead of "write the
  artifact", which is the T-008 shape restated as a sentiment; and a
  brief-drift check wired into the workflow as a text assertion (D-M3-28,
  CR-760's live shape in the file this phase edits).
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a clause whose heading round-trips while its text says something WEAKER than the row | criterion 7 covers the round trip and explicitly does not cover the text; criteria 9(a), 9(b) and **9(d), NEW at revision 3**, cover the three clauses where the difference between rule and sentiment has a measured cost. The general case is section 2.6 reason 1 and is the hazard reviewer's, via M3-P7's `clause-text-matches-row` probe |
| a generated gate-list block whose drift check compares the block TO ITSELF rather than to the registry | criterion 3, both directions: adding a gate to `gate-registry.yaml` WITHOUT re-rendering must make the check exit nonzero naming the gate. A check that compared the block to itself stays green there, which is exactly what the added-gate direction detects |
| a mandated-reading list naming the mechanism index while the index is the stub nobody replaced | criterion 8, whose revision-2 form requires the SEED's mechanism-key set to be a superset of `MECHANISMS.md`'s twelve keys, failing and naming any missing key; plus M3-P8 criterion 4c, which re-witnesses the same property against the GENERATED projection so the obligation survives the replacement |
| a `destructive-authority` clause whose third conjunct points at a manifest key M2 RENAMED | criterion 8b, which resolves `gates.manifest.json` through the same `brief compose` mandated-reading resolution, both directions. **Confirmed at revision 3 by reading `gates.manifest.json` on `main`**: `destructiveCommands` is present with four entries, so the key the clause points at exists and the criterion has something to resolve |
| a claim-grep obligation stated WITHOUT the command, so each implementer invents their own pattern | criterion 9(a), which asserts the clause body carries the grep VERBATIM by comparing it to `CLAUDE.md`'s pattern, both directions. Labelled a text assertion in its own words: it proves the command is shipped, not that anyone runs it |
| a dispatch-contract clause that says "report progress" instead of "write the artifact" | **criterion 9(d), NEW at revision 3.** Revision 2's criterion 9(c) required only that `incremental-output` and `beacon-is-not-a-claim` be PRESENT as body headings and round-trip against frontmatter, which is presence, and the phase's own hazard paragraph says one line above that the clause map proves presence and never content. M3-P5 criterion 6b had already built the text-specificity witness for its three briefs; this phase carried the identical clause pair onto two MORE files and did not carry the fix, which is the fix-round contract's own named failure shape reproduced inside the plan |
| the brief-drift check wired as a text assertion | criterion 11, which extracts and EXECUTES the step under two structurally different defangs |
- steps:
  1. Create `roles/implementer.md` with the six sections R-033a enumerates,
     each carrying a clause id: mandated reading in order; phase scope with
     pipeline-history updates; push protocol; full gate list; accumulated
     environment warnings; reporting contract. The gate-list section is a
     generated block: `brief compose` renders it from `gate-registry.yaml` for
     the declared mode, and a drift check fails if the committed block differs.
     Clauses, each with its own id and each traceable to a row:
     never edits the plan and never re-investigates settled questions (R-007);
     one phase equals one branch equals one pull request, with the worktree and
     branch naming conventions M1-P3 established (R-031); if implementation
     reveals the plan is wrong, stop and escalate, never improvise a different
     fix (R-034); repair lying test fakes first, show the old test red pre-fix,
     then land the fix (R-037a); per-step local commits with meaningful messages
     (R-038); batched pushes every one to three steps, never per-commit, because
     each push costs a CI run (R-039); always push before any long-running
     validation (R-040); a fix round is one to two pushes, not six (R-074);
     salvaged WIP is verified or rewritten, never trusted (R-081b, citing T-002
     and the "WIP-UNREVIEWED (do not treat as reviewed)" prefix that incident
     used); never end a turn to wait for builds or CI, wait by doing useful
     steps and then check state directly (R-082a); false claims found in
     comments or docs are corrected loudly in place (R-087).
  1b. Two clauses this brief carries from T-005, which are not new requirement
     rows but the applied form of R-033a's "mandated reading in order" and are
     recorded in the clause map against R-033a (M3R-003):
     - `mechanism-lookup`: before writing any code that uses a mechanism named
       in `tuition/mechanism-index.yaml` (claim file, lease, append-only log,
       worktree removal, force delete, retry classification, and whatever the
       index has grown by then), the implementer looks the mechanism up and
       states in the work history which rules it found and how the
       implementation satisfies each. "The index had no entry" is an acceptable
       and recorded answer; not looking is not. The mandated-reading section
       lists the index by path, so `brief compose`'s existing path check
       (M3-P5 criterion 2) already fails a brief that names a missing index.
     - `mechanism-sibling`: when a phase establishes a rule about a mechanism,
       the implementer records it at the mechanism's definition in the source
       AND names the sibling implementations that share it, then adds the rule
       to the tuition feed's `mechanisms[]` so the index picks it up. T-005 calls
       this the cheap interim measure and records that M1-P5's fix round did
       exactly it; this clause makes it standard rather than a one-off.
     - `destructive-authority`, adjacent to the two above and delivered under
       the same row (T-003 structural consequence 4; M2 plan section 2 item 11,
       whose three-way split this plan accepts, D-M3-26): an implementer adding
       or extending a command that can destroy work states that destructive
       authority explicitly in the command's own contract, never inherits force
       semantics from a caller, and adds the command to the
       `destructiveCommands` list in M2's `gates.manifest.json`. The third
       conjunct is what keeps M2's machine half and this prose half from
       diverging, and it is what would have caught V-1 at authoring time: that
       defect's entire justification was a guarantee living in a phase that did
       not exist yet, which the M1-P3 environment warnings already record as
       "a safety argument that depends on a component not yet built is not a
       safety argument".
  1c. **Three clauses NEW at revision 2, all delivered under R-033a's existing
     rows so no row moves and Appendix A's counts are unchanged.**
     - `claim-grep` (`CLAUDE.md`, T-006, D-M3-30): before submitting any work
       history the implementer runs the exact command
       `grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' <work-history>`
       and records its output. Every hit carries an adjacent captured command
       that settles it, or is restated as an open question in the work history's
       `claims[]` section (M3-P4 step 1b). **The clause carries the command
       literally, not a description of it**, because a description makes each
       implementer invent a pattern and the whole point of a grep is that it is
       the same grep. T-006 records seven instances of unexecuted claims across
       M1, one of them the orchestrator's own, and notes that the pattern
       survived being documented as a norm; a norm depends on memory and a
       command does not.
     - `fix-round-mechanism` (`CLAUDE.md`'s fix-round contract, D-M3-30): a fix
       round names the MECHANISM rather than the finding, publishes the exact
       command enumerating every call site of that mechanism together with its
       FULL output, and states what the derivation did NOT cover. The clause
       cites the measurement (sixteen M1 fix rounds, thirteen re-reviewed,
       twelve of those thirteen producing a new finding attributable to the
       round itself) and the counter-example that worked (M1-P5's fourth round
       derived eleven call sites where the review had listed eight, closing in
       one round a class three prior rounds had each closed one path at a time).
       The report SHAPE is M3-P4's `fix-round[]`; this clause is the instruction
       to fill it, and the placement rule (D-M3-03) is why the shape is there
       and the instruction is here.
     - `incremental-output` and `beacon-is-not-a-claim` (T-008, D-M3-31): the
       two dispatch-contract clauses M3-P5 step 3b defines for the shared clause
       block, carried here for the implementer and the clean-room reviewer. Both
       roles create their output artifact within the first minutes and append to
       it as work proceeds, so its mtime is the beacon the orchestrator's
       watchdog reads. The measured cost of the absence is nine hours eleven
       minutes on this project's own review dispatch (T-008), and the entire
       loss was wall clock precisely because nothing was written down as it
       happened.
  2. Create `roles/clean-room-reviewer.md`: has not seen the implementation
     session, reviews the diff and the plan's acceptance criteria only, edits
     nothing and posts nothing to the pull request (R-009b); carries the same
     R-087 clause on the review side; outputs a verdict instance (the schema
     lands in M3-P7, referenced here by type name).
  2b. **The clean-room brief declares WHICH CONTRACT it is running (T-007,
     D-M3-32, NEW at revision 2).** `full` mode requires two review contracts
     rather than two reviewers (M3-P3 step 2b), so this brief carries a
     `review-contract` frontmatter field whose value is `criteria` or `hazard`,
     and a clause block per value:
     - `criteria`: walk every acceptance criterion of the phase, quote it, and
       return a met or not-met verdict with file:line evidence (R-053, the
       existing content).
     - `hazard`: the reviewer is given the phase's declared `hazard-classes[]`
       as its STARTING QUESTION and is instructed not to begin from the
       criteria. T-007's evidence is that a reviewer executing the phase's
       entire contract faithfully and completely could not have found M1-P5's
       high-severity defect, because the contract did not contain it, and that
       the approving report does not contain the word `readBeacon` at all.
     The brief states, in its own text, that a `criteria` verdict is not a
     completeness claim: "all acceptance criteria met" is one input, never a
     terminal green. That sentence is in the brief rather than only in this plan
     because the brief is what the reviewer reads.
  3. Extend `src/roles.ts` with the generated-section mechanism and
     `scripts/check-brief-drift.mjs --check`, mirroring M3-P2's agent-rules
     drift check.
  4. Record the two migration tickets plan v1 section 11 item 7 parked for this
     moment, as inputs M3-P8 turns into tuition entries: D-9's L1 enforcement of
     review-never-skipped and D-10's L1 pre-validation push hook. They are
     recorded, not built (the rows are discharged in their decided L2 form).
  5. Tests: `test/implementer-brief.test.ts`, `test/clean-room-brief.test.ts`.
- files-to-touch: `roles/implementer.md`, `roles/clean-room-reviewer.md`,
  `scripts/check-brief-drift.mjs`, `tuition/mechanism-index.yaml` (create as the
  SEED of criterion 8, converted from `MECHANISMS.md`'s twelve rows; M3-P8
  replaces its contents with the generated projection),
  `schemas/mechanism-index.schema.json` (create here rather than at M3-P8, per
  criterion 8 as revised; M3-P8 EDITS it to add `machine-readable-form` and
  does not create it, and that phase's files-to-touch is corrected to match),
  `test/implementer-brief.test.ts`,
  `test/clean-room-brief.test.ts` (create); `src/roles.ts` (edit),
  `src/commands/brief.ts` (edit), `.github/workflows/gates.yml` (edit),
  `gates.manifest.json` (edit, ADDED at revision 3: the brief-drift check is
  registered as a gate entry with `events: [pull_request, push]` rather than
  wired as a raw workflow step, section 2.2a and D-M3-34; the entry is promoted
  into `gate-registry.yaml` by the same rule M3-P2 established, which by this
  phase has already merged, so the entry goes straight into the registry),
  `roles/_shared-dispatch-contract.md` (**READ ONLY here, and not on this
  phase's edit list**: M3-P5 creates it and this phase's two briefs include the
  same single copy. Added to this list at revision 3 so the dependency is
  visible; if this phase finds it needs to CHANGE the shared text, that is an
  escalation, because changing it changes three merged briefs),
  `package.json` (edit, files entry: `tuition` enters the published set here
  rather than at M3-P8, because the stub ships with this phase).
  **Standing constraint on the `.github/workflows/gates.yml` edit (DR-0017,
  DR-0004):** one job named `gates`, no matrix, no second job. See section 1.1.
- acceptance criteria:
  1. `tiphys validate --type role-brief` exits 0 on both briefs.
  2. `tiphys brief compose --role implementer` output contains all six R-033a
     sections, each non-empty; deleting any one section from the brief file
     makes compose exit nonzero naming the missing section (both directions,
     one witness per section).
  3. The composed brief's gate-list block is byte-identical to the block
     `gate-registry.yaml` renders for the declared mode; adding a gate to the
     registry without re-rendering makes `node scripts/check-brief-drift.mjs
     --check` exit nonzero naming the gate; re-rendering returns exit 0
     (R-094's single source, enforced rather than asserted).
  4. The composed implementer brief contains no instruction to create or merge a
     pull request, asserted by a registered grep test over the composed output
     for `gh pr create`, `pr merge`, and "open the PR" (the brief must not
     contradict the structural fact M2-P8 enforces; a brief that instructs what
     the credentials forbid produces agents that fail confusingly).
  5. The composed brief contains the fleet warnings file's full text when one
     exists and exactly the brief text when none exists (R-083b re-witnessed
     through composition).
  6. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's thirteen rows, each to a clause id present in the
     brief body; earlier mappings still resolve.
  7. Every clause id in both briefs' frontmatter occurs exactly once as a body
     heading anchor, and every body heading anchor occurs in the frontmatter
     (a registered test, both directions; this is what stops a clause id from
     being a label with no text behind it, which would make the clause map a
     rubber stamp).
  8. T-005 clauses (M3R-003): the implementer brief's mandated-reading section
     names `tuition/mechanism-index.yaml` by path, and its `mechanism-lookup`
     and `mechanism-sibling` clauses are present as body headings resolving from
     frontmatter (criterion 7 covers the round trip). Because M3-P8 ships the
     GENERATED index, this phase witnesses the clause and the path entry against
     a committed SEED index, and M3-P8 replaces the seed with the generated
     projection and re-witnesses the path. Deleting the seed makes
     `tiphys brief compose --role implementer` exit nonzero naming the missing
     path (both directions), which is the same mandated-reading check M3-P5
     built and is why the clause is not merely advisory.
     **Revision 2 changes what the seed is, and it is a strictly stronger
     requirement than revision 1's.** Revision 1 asked for a stub carrying "at
     least the one entry T-005 itself establishes". The interim index exists:
     `MECHANISMS.md` at the repository root, twelve rows, committed 2026-08-05.
     The seed is therefore a CONVERSION of all twelve of those rows into
     `schemas/mechanism-index.schema.json`'s shape, each keeping its rule text
     and its "paid for by" citations as `evidence[]`, and the criterion is:
     `tiphys validate --type mechanism-index tuition/mechanism-index.yaml` exits
     0 and a registered test asserts the seed's mechanism-key set is a superset
     of the twelve keys in `MECHANISMS.md`, failing and naming any missing key.
     Both directions: removing one converted row makes the test fail naming that
     mechanism, restoring it returns green. This is what stops the shipped index
     being poorer than the interim file it supersedes, which is the coupling
     `delivery/plan/kernel-plan-m2.md` section 2 item 10 asked for from the
     other side ("M3-P8's generated index must not silently drop an interim
     row"). The seed's schema is created here by reference to M3-P8's, which is
     the only forward reference in this phase and is why D-M3-23 exists.
  8b. The `destructive-authority` clause is present as a body heading resolving
     from frontmatter (criterion 7 covers the round trip), names all three of its
     conjuncts, and names `gates.manifest.json`'s `destructiveCommands` list by
     path; the path is checked to exist by the same `brief compose` mandated-
     reading resolution, so a brief pointing at a manifest M2 moved fails loudly
     rather than instructing an implementer to edit a file that is not there
     (both directions, D-M3-26).
  9. **Revision-2 clauses present and specific, both directions each.** (a) The
     `claim-grep` clause body contains the grep command VERBATIM, asserted by a
     registered test that compares it to the pattern in `CLAUDE.md`; replacing
     the command with a paraphrase makes the test fail, restoring it returns
     green. This is a text assertion and is labelled as one: it proves the
     command is shipped, not that anyone runs it. (b) The `fix-round-mechanism`
     clause body names all three items (mechanism, derivation with full output,
     what the derivation did not cover) and cites the M1 measurement; weakening
     it to two items makes the test fail. (c) `incremental-output` and
     `beacon-is-not-a-claim` are present as body headings in both briefs and
     round-trip against frontmatter (criterion 7's shape). **This is a PRESENCE
     check and nothing more, and revision 3 says so rather than letting it read
     as coverage**; the text-specificity half is criterion 9(d).
  9d. **The dispatch-contract clause TEXT is specific in both briefs (NEW at
     revision 3, section 2.6; carries M3-P5 criterion 6b's fix to this phase's
     two files), both directions.** A registered grep test asserts that
     `incremental-output`'s clause text in BOTH `roles/implementer.md` and
     `roles/clean-room-reviewer.md` names the artifact-within-the-first-minutes
     rule and the mtime-as-beacon consequence, and that
     `beacon-is-not-a-claim`'s text states that the guard tests FRESHNESS and
     never existence and never completion. Weakening either to a generic
     phrasing such as "report your progress as you work rather than only at the
     end" makes the test fail naming the file and the clause; restoring the
     specific text returns green.
     **The four copies problem, and how this phase avoids it rather than
     doubling it.** M3-P5 ships the same two clauses on three briefs and this
     phase adds two more, so the specific text would exist in five places and
     drift independently. The clause text is therefore shipped ONCE, as a
     shared clause block that both phases' briefs include by a documented
     `$ref`-style include resolved at compose time, and the grep test asserts
     against the single source plus the composed output of each of the five
     briefs. A brief that inlines its own copy instead of including the shared
     block fails criterion 7's round trip, because the included block carries
     the clause ids and an inlined copy would duplicate them.
     **Two structurally different members, per section 2.3 rule 6**: the
     `incremental-output` weakening above, and a `beacon-is-not-a-claim`
     weakening to "check that the agent is still working", which is the exact
     C-2 violation T-008's first watchdog shipped and is a different failure
     from a vague restatement, because it is specific and wrong rather than
     unspecific.
  10. **The two review contracts are declared and distinguishable (T-007).**
     `tiphys brief compose --role clean-room-reviewer --review-contract criteria`
     and `--review-contract hazard` both exit 0 and emit briefs whose first
     instruction differs; a `--review-contract` value outside the two exits
     nonzero naming it. A registered test asserts the `hazard` brief's text
     instructs the reviewer NOT to begin from the acceptance criteria, and the
     `criteria` brief's text contains the sentence that "all acceptance criteria
     met" is one input and never a terminal green. Both directions.
  11. **The brief-drift check is wired as a BEHAVIOUR (D-M3-28).** The workflow
     step added in step 3 is extracted and EXECUTED against stubs and its exit
     code observed, under two structurally different defangs (section 2.3
     rules 6 and 7). Criterion 3 already witnesses the check's own logic; this
     criterion witnesses that CI actually runs it, which is the half M1-P6
     produced six confirmed misses of.
- new behaviors: `implementer-brief-six-sections`,
  `implementer-brief-gate-list-drift`, `implementer-brief-no-pr-instruction`,
  `implementer-brief-carries-warnings`, `clean-room-brief-validates`,
  `brief-clause-ids-round-trip`, `implementer-brief-requires-mechanism-index`,
  `implementer-brief-destructive-authority-clause`,
  and NEW at revision 2: `seed-index-covers-interim-mechanisms`,
  `implementer-brief-carries-claim-grep-command`,
  `implementer-brief-fix-round-three-items`,
  `briefs-carry-dispatch-contract-clauses`,
  `clean-room-brief-declares-review-contract`,
  `clean-room-hazard-brief-does-not-start-from-criteria`,
  `brief-drift-check-wired-executably`,
  and NEW at revision 3: `dispatch-clause-text-is-specific-in-both-briefs`,
  `beacon-clause-rejects-liveness-phrasing`,
  `briefs-include-shared-dispatch-block-not-a-copy`.
- suggested model tier: strongest for the clause text (it is the instruction
  surface every future implementer runs on), cheaper tier acceptable for the
  drift-check mechanics.
- citations: R-007, R-009b, R-031, R-033a, R-034, R-037a, R-038, R-039, R-040,
  R-074, R-081b, R-082a, R-087; blueprint section 6; process doc sections 2a,
  2c, 2d, 3, 6, and 7; plan v1 D-9, D-10, and section 11 item 7; T-002;
  T-005 (the two mechanism clauses, delivered under R-033a); T-003 structural
  consequence 4 and finding V-1 (the `destructive-authority` clause, delivered
  under the same row, D-M3-26); M2-P1 as the owner of the `destructiveCommands`
  list the clause writes to; M2-P2 and M2-P8 as the named dependencies;
  **`MECHANISMS.md`** (the twelve-row interim index the seed converts, and the
  three rows that bind this phase's own clauses); **T-006 and `CLAUDE.md`'s
  claim grep** (the `claim-grep` clause, D-M3-30); **`CLAUDE.md`'s fix-round
  contract** (the `fix-round-mechanism` clause, D-M3-30); **T-007** (the
  `review-contract` frontmatter field and its two clause blocks, D-M3-32);
  **T-008** (the two dispatch-contract clauses, D-M3-31); **CR-760** (why
  criterion 11 executes the wired step rather than asserting its text,
  D-M3-28).
- conflicts-with: M3-P7 (verdict schema referenced here), M3-P9 (`AGENTS.md`
  references both briefs), M3-P10 (files entry).
- blocked-by: M3-P5 merged; M2-P2 and M2-P8 merged (named dependencies).

### M3-P7: Review checklists, probe injection, and the verdict contract

- id: M3-P7
- branch: `claude/m3-p7-review-checklists`
- intent: Ship `checklists/` as validated probe lists (plan review, clean room,
  flake playbook, environment-failure diagnosis), the mechanism by which the
  orchestrator injects per-phase probes, and the verdict schema the clean-room
  reviewer outputs.
- grounding: M3-P6 merged (both review-side briefs exist and reference a verdict
  type). M2-P2's red-witness harness evidence file is what two probes accept as
  proof (R-028a, R-056a); a real captured evidence file is stored as a fixture
  (section 2.3 rule 3). The gate registry's two `verified-by:
  clean-room-checklist` entries from M3-P2 name probe ids this phase must
  supply, and the clause map fails if they do not resolve.
  **Revision 2 adds a fifth checklist and three probe families, all from inputs
  that name a "reviewer checklist" as their structural consequence by name.**
  T-006 asks for a probe hunting impossibility and coverage claims specifically,
  and records that reviewers already do it by instinct three times out of three,
  which is exactly the case for an instruction: instinct does not survive a
  reviewer change. T-007 asks for the hazard review contract to be a DECLARED
  ARTIFACT rather than left to whoever writes the dispatch prompt, which makes
  it a checklist here and not only a brief clause in M3-P6. `CLAUDE.md`'s
  fix-round contract states that "the reviewer's FIRST check is item 3", which
  is an ordering requirement on a probe list and is therefore this phase's to
  express.
- hazard class (T-007, D-M3-32): **a checklist whose probes are present,
  unique, resolvable and useless.** What can pass every criterion here: a probe
  whose text is generic enough to be answered without opening anything, which
  criterion 3b narrows for four probes and cannot for the rest; a framing that
  reorders the list without changing the entry point, so `--framing` is
  cosmetic and the T-001 decorrelation is nominal; a hazard checklist whose
  probes are the criteria probes reworded, which reproduces T-007's failure
  while appearing to fix it; an extra-probe merge that silently overrides a
  canonical probe instead of colliding; a probe id resolving to a gate entry
  that no longer exists in the other direction (the check runs registry-to-
  checklist, not checklist-to-registry); a verdict schema that admits APPROVE
  alongside an unaddressed hazard class; and the ordering requirement on the
  fix-round probe being expressed as a comment rather than as position, so it is
  first in the file and not first in the resolved output.
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a probe whose text is generic enough to be answered without opening anything | criterion 3b, both directions, for the five probe sets it names, **and the phase's own hazard sentence already states the residue: it "narrows for four probes and cannot for the rest".** The rest are section 2.6 reason 1, and the instrument is the phase's own suggested-tier note plus risk 2 |
| a framing that reorders the list without changing the ENTRY POINT, so `--framing` is cosmetic | criterion 4c, which requires the two framings to differ in their first resolved probe and not merely in order |
| a hazard checklist whose probes are the criteria probes reworded, which reproduces T-007 while appearing to fix it | criterion 4e. **Residue named at revision 3**: "reworded" is a semantic relation and no test decides it; what 4e can and does assert is that the two checklists' probe ID sets are disjoint and that the hazard checklist's first probe is `hazard-classes-addressed` rather than a criteria probe. A determined rewording that also renamed the ids would pass, and that is section 2.6 reason 1, carried by `dual-review-decorrelation` at M3-P9 comparing the two verdicts' framings |
| an extra-probe merge that silently OVERRIDES a canonical probe instead of colliding | criterion 2, which requires a duplicate id in an `--extra` file to be an error naming both sources rather than a silent last-wins |
| a probe id resolving to a gate entry that no longer exists IN THE OTHER DIRECTION | **NO CRITERION AT REVISION 2, and the phase's own hazard names the asymmetry: `gate-probes-resolve` runs registry-to-checklist.** Covered at revision 3 by criterion 3c, below, which adds the checklist-to-registry direction |
| a verdict schema that admits APPROVE alongside an unaddressed hazard class | criterion 4b's Kind B `verdict-hazard-classes-addressed`, plus criterion 4(a) for the APPROVE-with-a-high-finding shape, both directions |
| the fix-round probe's ordering expressed as a COMMENT rather than as position | criterion 4d, which asserts position in the RESOLVED OUTPUT and not in the file, which is the distinction the hazard names |
- steps:
  1. Create `schemas/checklist.schema.json`: a checklist is
     `{id, applies-to, probes[]}` where each probe requires `id`, `probe` (the
     question), `applies-to`, and `evidence-required` (boolean), with
     `additionalProperties: false` and unique probe ids. **NEW at revision 3
     (criterion 3c, section 2.6): a probe may carry an optional
     `verifies-gate`, the id of the `gate-registry.yaml` entry whose
     `verified-by: clean-room-checklist` names it.** It is optional because
     most probes verify no gate, and it is what makes the checklist-to-registry
     direction computable at all: without a back-reference there is nothing for
     a check to resolve, and the orphan the phase's own hazard class names
     would stay invisible by construction. Every probe named by a registry
     entry MUST carry it, which is an `if`/`then` the registry side cannot
     express and criterion 3c's check enforces.
  2. Create `checklists/plan-review.yaml` (R-026b hidden dependencies and
     semantic coupling above the file-overlap floor the M5 pre-pass computes;
     R-027 probe every fix shape for the state that can no longer exit, with the
     process doc's zero-amount-rows example carried as the probe's illustration;
     R-028a test the testability claims, where the accepted evidence is the M2-P2
     harness's evidence file and not the plan's assertion).
  3. Create `checklists/clean-room.yaml` (R-053 each acceptance criterion quoted
     with file:line evidence and a met or not-met verdict; R-055 correctness
     probes: negatives, zero, empty, unicode, the state that can never exit;
     R-056a test-honesty probes: would the test fail if the fix were reverted,
     does it assert behavior rather than implementation detail, does a fence
     catch the failure mode it is named for; R-057b each declared deviation
     judged against the plan's intent by the reviewer, never assumed by the
     implementer; R-059 blast-radius probes, the single best question in the
     process; R-093 the shared-consumer probe, "a field that renders and decides
     is two fields"; plus the two probes the gate registry's R-043 and R-044
     entries name). One further probe under R-055's correctness list, pairing the
     M3-P6 `destructive-authority` clause with a check so the clause is judged
     rather than merely written (D-M3-26): probe `destructive-authority-declared`
     asks, for any command in the diff that can destroy work, whether its own
     contract states that authority, whether force semantics are inherited from a
     caller rather than declared, and whether the command appears in
     `gates.manifest.json`'s `destructiveCommands` list. The third question is
     answerable from the diff and the manifest, so the probe carries
     `evidence-required: true`. It is a probe rather than a gate because no
     script can judge whether a contract states an authority; the computable part
     is M2's list, and this probe's third question is the reviewer reading that
     list rather than re-deriving it.
  3c. **Three probe families NEW at revision 2, added to
     `checklists/clean-room.yaml` under existing rows so no row moves.**
     - **The fix-round probes (`CLAUDE.md`'s fix-round contract, D-M3-30),
       under R-057b.** Three probes, and their ORDER is part of the artifact:
       `fix-round-not-covered` is the FIRST probe of the resolved clean-room
       list whenever the review is of a fix round, because `CLAUDE.md` says in
       terms that "the reviewer's FIRST check is item 3". It asks what regions
       the derivation excluded and why, and it carries
       `evidence-required: true` because the answer is in the work history's
       `fix-round.not-covered` field (M3-P4 step 1c) or it is missing.
       `fix-round-mechanism-named` asks whether the round's stated `mechanism`
       is a mechanism or a restated finding, with the plan's own worked example
       in the probe text ("a FIFO at the beacon hangs the guard" is a finding,
       "reading a path whose type has not been established" is the mechanism).
       `fix-round-derivation-published` asks whether the derivation's full
       output is present rather than summarized. The first and third are
       answerable from the artifact; the second is the judgement no schema
       reaches, which is why M3-P4 criterion 2d states its own residue and
       points here.
     - **The unexecuted-claim probes (T-006), under R-056a's test-honesty
       family.** `claim-impossibility-constructed` and
       `claim-coverage-constructed` ask, for every entry in the record's
       `claims[]` section and for every impossibility or coverage assertion in
       its prose that the section does not declare, whether the executed
       construction is present. Both carry `evidence-required: true`. The probe
       text names the distinction that makes them different from the existing
       universal-claim probe: a universal claim needs someone to try to falsify
       it, an impossibility claim needs someone to try to BUILD the thing, and
       T-006's own reviewer settled one in minutes with `symlinkSync(p, p)`
       raising ELOOP where the record had claimed the state could not be
       constructed without privileges. T-006 records that reviewers caught all
       three instances by instinct; an instruction is what makes that repeatable
       across a reviewer change, which is the whole reason it is a probe.
     - **The one-witness-is-not-a-class probe (`CLAUDE.md`), under R-056a.**
       `class-witness-has-two-members` asks, for any test the record presents as
       guarding a CLASS, whether at least two structurally different members
       have been demonstrated red. M1-P6 produced two consecutive medium
       findings from this alone: one defang reddened a guard test and three
       others left it green, and the round after repeated the mistake one
       abstraction up.
  3d. **`checklists/hazard-review.yaml`, NEW at revision 2 (T-007, D-M3-32).**
     T-007's structural consequence is that the second review contract "must be
     a declared artifact, not left to whoever writes the dispatch prompt to
     remember". M3-P6 ships the brief that declares which contract a reviewer is
     running; this file is the contract's probe list. Its probes are derived
     from the phase's `hazard-classes[]` (M3-P1) rather than from the acceptance
     criteria, and its canonical entries are the four questions T-007 names as
     the hazard family: what can BLOCK, what can be LOST, what can NEVER EXIT,
     what can DESTROY. Each carries `evidence-required: true` and each names a
     construction rather than asking a bare question (a real `mkfifo`, a forced
     concurrency, a killed process mid-write, a destroy on a branch carrying
     committed unpushed work).
     **Its first probe is `hazard-classes-addressed`**, which walks the phase's
     declared `hazard-classes[]` and requires one finding-or-cleared statement
     per class. That is the Kind B derived check `verdict-hazard-classes-
     addressed`, registered in step 6b and tabulated in section 2.3.
     The file explicitly does NOT restate the criteria probes. A hazard
     checklist that is the criteria checklist reworded reproduces T-007's exact
     failure while appearing to fix it, and criterion 6b asserts the two files'
     probe-id sets are disjoint.
  4. Create `checklists/flake-playbook.yaml` (R-066: extract the failure, judge
     fail-pattern against a local run, known signature means re-kick, unknown
     means investigate first, because a real bug looks identical to a flake
     until you read the log) and `checklists/env-failure-diagnosis.yaml`
     (R-050b: byte-identical route, reproduced outside the runner, never waved
     off).
  5. Probe injection (R-054): `tiphys checklist resolve --checklist <id>
     [--extra <file>] [--framing <id>]` merges the canonical checklist with a
     per-phase extra probe file, failing on probe-id collision and on an extra
     probe missing `evidence-required`. The extension mechanism is data, so a
     per-phase probe set is reviewable and reusable; the AGENTS.md duty to write
     them is M3-P9. `--framing` exists because of T-001's second, more specific
     lesson (M3R-004): the M1-P4 dual review found different defects because the
     two reviewers were given different STARTING QUESTIONS, one walking the
     acceptance criteria as a contract and one told to start from "where can this
     destroy something or claim a guarantee it does not have". T-001's own words:
     "the checklists should vary the entry point rather than only the reviewer".
     A framing is therefore a first-class field of the checklist artifact
     (`framings[]`, each `{id, entry-point, orders-probes}`), and
     `checklist resolve --framing` reorders and re-heads the resolved probe list
     accordingly. `checklists/clean-room.yaml` ships at least the two framings
     that were actually exercised, `criteria-contract` and `destructive-paths`,
     cited to T-001's second data point rather than invented.
  6. Create `schemas/verdict.schema.json` (R-060): `{verdict, findings[],
     produced-by, framing, criteria[], deviations-judged[]}` where `verdict` is
     an enum of exactly `APPROVE` and `FIX-ROUND-NEEDED`; `criteria[]` requires
     one entry per acceptance criterion with `quote`, `evidence[]`, and `met`
     (R-053); `deviations-judged[]` requires one entry per deviation declared in
     the phase's work history, each with `deviation`, `serves-plan-intent`, and
     `reasoning` (M3R-005: R-057b's "judged... never assumed" had the same shape
     as criteria completeness and the plan had left it as a bare probe, so a
     reviewer could silently skip judging one of three declared deviations and
     every criterion still passed); `findings[]` entries require `severity` and
     `concrete-fix`; `framing` records which entry point this review was given;
     and a verdict of `APPROVE` with any finding of severity `high` is invalid
     (Kind A, `if`/`then` over `contains`).
  6a. **The verdict schema gains `hazard-classes-addressed[]` and
     `review-contract` (T-007, NEW at revision 2).** `review-contract` is a
     required enum of `criteria` and `hazard`, mirroring the brief field M3-P6
     ships, so a verdict states which contract produced it and
     `scripts/check-dual-review.mjs` can check contract distinctness as well as
     model-family and framing distinctness. `hazard-classes-addressed[]` is
     required when `review-contract` is `hazard`, one entry per class in the
     referenced plan phase, each with `class-id`, `probed` and either a finding
     reference or a `cleared-because` statement. The completeness rule across
     the two documents is Kind B, check `verdict-hazard-classes-addressed`
     (step 6b), and it has exactly the shape `verdict-criteria-complete` has for
     criteria, for exactly the same reason: a reviewer could otherwise silently
     skip one of three declared hazard classes and every other criterion would
     still pass. That is the shape M3R-005 found for deviations and revision 2
     finds again one field along.
  6b. Register the `checklist` and `verdict` types with the validator and
     register this phase's four derived checks in `src/checks.ts`, plus
     `verdict-hazard-classes-addressed` NEW at revision 2 (five in total):
     `checklist-probe-ids-unique` (uniqueness of a nested property across array
     items is not what `uniqueItems` compares, so this is Kind B and the review
     did not name it), `gate-probes-resolve` (registry probe ids into the
     checklist, cross-document), `verdict-criteria-complete` and
     `verdict-deviations-judged` (both compare a verdict against a different
     document, the plan phase and the work history respectively).
  7. Tests: `test/checklists.test.ts`, `test/verdict-schema.test.ts`.
- files-to-touch: `schemas/checklist.schema.json`, `schemas/verdict.schema.json`,
  `checklists/plan-review.yaml`, `checklists/clean-room.yaml`,
  `checklists/flake-playbook.yaml`, `checklists/env-failure-diagnosis.yaml`,
  `checklists/hazard-review.yaml` (NEW at revision 2, step 3d, T-007),
  `src/checklists.ts`, `src/commands/checklist.ts`, `test/checklists.test.ts`,
  `test/verdict-schema.test.ts`, `test/fixtures/red-witness-evidence.*`
  (create); `src/cli.ts` (edit), `src/validate.ts` (edit, type table),
  `src/checks.ts` (edit, register this phase's derived checks),
  `package.json` (edit, add `checklists` to files).
- acceptance criteria:
  1. `tiphys validate --type checklist` exits 0 on all four checklists; a
     checklist with two probes sharing an id exits 1 naming the id and carrying
     `(check: checklist-probe-ids-unique)`, witnessed by deregistering and
     restoring that check (Kind B, section 2.3 rule 3; `uniqueItems` compares
     whole items and cannot express this).
  2. `tiphys checklist resolve --checklist clean-room --extra <file>` exits 0 and
     prints the merged probe list; an extra file reusing a canonical probe id
     exits nonzero naming the collision; an extra probe without
     `evidence-required` exits nonzero (R-054, all directions).
  3. Kind B check `gate-probes-resolve`, run with `--context`: every probe id
     named by a `gate-registry.yaml` entry with
     `verified-by: clean-room-checklist` resolves to a probe in
     `checklists/clean-room.yaml`; deleting one probe makes it exit nonzero
     naming the gate and the probe id, restoring it returns exit 0, and
     deregistering the check makes the deleted-probe fixture pass (all three
     captured). This is the join M3-P2 deliberately left open, closed here
     rather than trusted.
  3b. Probe-text specificity (M3R-007), a registered test rather than a schema
     rule because it is a property of prose: the R-027 probe's text contains the
     process doc's own illustration (the words "zero" and a reference to the
     state that can no longer exit); the R-055 probe set contains separate
     entries naming negative, zero, empty, and unicode rather than one generic
     "check edge cases" entry; the `destructive-authority-declared` probe names
     all three of its questions and cites `destructiveCommands` by name, so a
     reviewer cannot answer it without opening the manifest; the R-059 and R-093 probes name a consumer-search
     action rather than asking a bare question; and the R-066 flake-playbook
     probes name the three-consecutive-reds threshold. Each is witnessed in both
     directions: weakening the probe text to a generic phrasing makes the test
     fail, restoring it passes, captured in the work history. This does not prove
     the probes are good (risk 2 stands), but it does make the specific content
     the plan's own steps demand non-optional, which is the difference between a
     checklist and a gesture.
  3c. **The OTHER direction, checklist to registry (NEW at revision 3, section
     2.6; the phase's own hazard class names the asymmetry and no criterion
     covered it), both directions.** Criterion 3 walks registry entries and
     asks whether each names a probe that exists. It cannot see a probe that
     names a gate entry which no longer exists, because it never starts from
     the checklist. The same Kind B check therefore runs in both directions:
     every probe carrying a `verifies-gate` field resolves to a gate id present
     in `gate-registry.yaml`; renaming a gate id in the registry without
     updating the probe makes the check exit nonzero naming the probe and the
     missing gate id, and restoring the name returns exit 0; deregistering the
     check makes the renamed-gate fixture pass. **Two structurally different
     members, per section 2.3 rule 6**: a gate id RENAMED (the probe points at
     a name that never existed) and a gate entry DELETED (the probe points at a
     name that used to exist), which fail through different lookups and are the
     two ways a registry edit orphans a probe.
  4. Kind A DANGEROUS-instance rejections for `schemas/verdict.schema.json`,
     each witnessed by removing and restoring the guarding keyword:
     (a) `verdict: APPROVE` with a finding of severity `high` (the exact shape of
     a review that says yes while recording a reason to say no, which is how a
     fix round gets skipped); (b) a `FIX-ROUND-NEEDED` finding with no
     `concrete-fix` (R-060); (c) a verdict with no `produced-by` or no `framing`.
  4b. Kind B DANGEROUS-instance rejections, each carrying `(check: <id>)` and
     each witnessed by deregistering and restoring the check: (a) a verdict whose
     `criteria[]` omits an acceptance criterion present in the referenced plan
     phase, a review that quietly skipped a criterion, check
     `verdict-criteria-complete`; (b) a verdict whose `deviations-judged[]` omits
     a deviation declared in the referenced work history, check
     `verdict-deviations-judged` (M3R-005: the same completeness shape as (a),
     which revision 0 left as a bare probe question for no stated reason).
  4c. `tiphys checklist resolve --checklist clean-room --framing criteria-contract`
     and `--framing destructive-paths` both exit 0 and emit probe lists whose
     first probe differs; a `--framing` id absent from the checklist's
     `framings[]` exits nonzero naming it (T-001's second lesson made
     executable rather than recorded).
  4d. **Fix-round probe ordering (`CLAUDE.md`, D-M3-30), both directions.**
     `tiphys checklist resolve --checklist clean-room --framing fix-round`
     emits a list whose FIRST probe id is `fix-round-not-covered`; moving that
     probe later in `checklists/clean-room.yaml` changes the resolved output and
     makes a registered test fail naming the expected first probe; restoring it
     returns green. The ordering is a property of the RESOLVED output rather
     than of the file, because a reviewer reads the resolved list. This is the
     falsifiable form of "the reviewer's FIRST check is item 3".
  4e. **Hazard checklist (T-007), all directions.**
     `tiphys validate --type checklist checklists/hazard-review.yaml` exits 0.
     A registered test asserts its probe-id set is DISJOINT from
     `checklists/clean-room.yaml`'s, failing and naming any shared id; adding a
     criteria probe to the hazard file makes it fail, removing it returns green.
     Kind B check `verdict-hazard-classes-addressed`, run with `--context`: a
     `hazard` verdict whose `hazard-classes-addressed[]` omits a class declared
     in the referenced plan phase exits nonzero naming the class, the complete
     verdict exits 0, and deregistering the check makes the incomplete fixture
     pass (all three captured, section 2.3 rule 3). A `criteria` verdict is
     unaffected by the check, which is asserted too, so the rule applies exactly
     where the contract applies.
  4f. **Unexecuted-claim probes (T-006), specificity in both directions.** The
     `claim-impossibility-constructed` probe text names the
     falsify-versus-BUILD distinction and cites T-006; weakening it to
     "check claims are supported" makes a registered test fail, restoring it
     returns green. Same for `claim-coverage-constructed`. Two structurally
     different members, per section 2.3 rule 6.
  5. The R-028a and R-056a probes name the M2-P2 evidence file as the accepted
     proof, and a registered test asserts the fixture used in the tests is a
     real captured harness evidence file (its recorded command and exit code are
     present), not an authored string (section 2.3 rule 3).
  6. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's thirteen rows to probe ids present in the checklists;
     earlier mappings still resolve.
- new behaviors: `checklist-validates`, `checklist-duplicate-probe-id-rejected`,
  `checklist-extra-probe-merge`, `checklist-extra-probe-collision`,
  `gate-registry-probes-resolve`, `verdict-approve-with-high-finding-rejected`,
  `verdict-criteria-completeness`, `verdict-deviations-completeness`,
  `verdict-finding-requires-fix`, `verdict-records-framing`,
  `checklist-framings-differ`, `checklist-probe-text-specific`,
  `checklist-destructive-authority-probe`, `red-witness-fixture-is-captured`,
  and NEW at revision 2: `checklist-fix-round-probe-is-first`,
  `checklist-hazard-probes-disjoint-from-criteria`,
  `verdict-hazard-classes-completeness`,
  `verdict-records-review-contract`,
  `checklist-impossibility-probe-specific`,
  `checklist-coverage-probe-specific`,
  `checklist-class-witness-probe`,
  and NEW at revision 3: `checklist-probe-verifies-gate-resolves`,
  `checklist-orphan-probe-detected-on-gate-rename`,
  `checklist-orphan-probe-detected-on-gate-deletion`.
- suggested model tier: strongest. Probe quality is the whole value of the
  artifact, and the verdict schema decides what a review is allowed to say.
- citations: R-026b, R-027, R-028a, R-050b, R-053, R-054, R-055, R-056a,
  R-057b, R-059, R-060, R-066, R-093; blueprint sections 5, 6, and 11; process
  doc sections 1d, 2e, 3, 4, and 8 items 4, 5, and 7; D-11 (the two registry
  probes); T-001 second data point (framings); T-003 structural consequence 4
  and V-1 (the `destructive-authority-declared` probe, delivered under R-055,
  D-M3-26); M2-P2 as the named dependency; **T-006** (the two unexecuted-claim
  probes, under R-056a); **T-007** (`checklists/hazard-review.yaml`, the
  verdict's `review-contract` and `hazard-classes-addressed[]`, D-M3-32);
  **`CLAUDE.md`'s fix-round contract** (the three fix-round probes and the
  ordering requirement, D-M3-30) **and its one-witness-is-not-a-class rule**
  (the `class-witness-has-two-members` probe).
- conflicts-with: M3-P9 (`AGENTS.md` cites the probe-injection duty), M3-P10
  (files entry).
- blocked-by: M3-P6 merged; M2-P2 merged (named dependency).

### M3-P8: Tuition flow and the mechanism index

- id: M3-P8
- branch: `claude/m3-p8-tuition-flow`
- intent: Start the tuition flow operating (R-091): a validated entry format, the
  root `tuition/` feed populated with the five failure modes this project has
  already paid for, the mechanism index T-005 asks for as a projection of that
  feed, the retention duty made checkable (R-098), and the immediate hotfix rule
  stated where the orchestrator reads it (R-070).
- grounding: M3-P7 merged. `tuition/README.md` is the M1-P1 placeholder and
  `tuition/` holds nothing but that and M3-P6's seed `mechanism-index.yaml`
  (`CLAUDE.md`: the root `tuition/` is the future cross-project feed and is not
  `delivery/tuition/`). The charter schema's `retention` field exists from
  M3-P1. The M1-P2 doctor is extended here, so its check list and profile table
  are verified before editing. T-005 is the phase's second binding input and its
  own words fix the design: "the tuition flow (M3-P8) should be the writer of
  that index", and "a tuition entry that constrains a mechanism must name the
  mechanism, so the index is a projection of the tuition feed rather than a
  second thing to maintain". `delivery/STATE.md`'s carried-forward list assigns
  the index to this milestone with no owner; this phase is the owner (M3R-003).
  **Revision 2 corrects two premises and adds three entries.** First, the
  interim index EXISTS: `MECHANISMS.md`, twelve rows, root, committed
  2026-08-05, self-described as the interim to be SUPERSEDED by this phase's
  projection. It is this phase's SEED and INPUT, M3-P6 has already converted it
  into schema shape, and criterion 4c makes dropping any of its rows a failure
  rather than a slow loss. Second, this build's tuition log has grown from five
  entries to EIGHT (T-006, T-007 and T-008 were recorded 2026-08-05 and
  2026-08-06), all three kernel-relevant, so step 3's promotion list grows from
  five to eight and step 5's identifier allocation must start higher than
  revision 1's "at the time of writing that is T-006 and T-007", which is now
  false. Third, `schemas/mechanism-index.schema.json` is CREATED by M3-P6 (its
  seed needs it) and EDITED here to add `machine-readable-form`; step 2 and the
  files-to-touch list are corrected accordingly.
- hazard class (T-007, D-M3-32): **an artifact whose whole value is that a
  future reader who was not there can act on it, and whose defects are silence
  rather than error.** What can produce a feed and an index that validate and
  teach nothing: a generated projection that silently drops an interim row, so
  the index ships poorer than the markdown file it replaced; a rule stated
  precisely enough to pass its evidence check and vaguely enough to be
  unusable, which no schema reaches; a `structural-consequence` marked
  `applied` whose target path exists but does not contain the change claimed; a
  `machine-readable-form` pointing at a manifest key M2 renamed, so the
  anti-drift coupling is itself drifted; an id collision between the two
  `T-nnn` spaces that grows silently as both directories keep growing; a
  `mechanisms[]` entry whose evidence resolves to a file that exists but does
  not establish the rule; and a retention check that passes because the
  declared path is absent from the charter rather than present and tracked.
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a generated projection that silently DROPS an interim row | criterion 4c, both directions, plus M3-P6 criterion 8's seed-side superset assertion, so the property is checked once against the seed and again against the generated projection that replaces it |
| a rule stated precisely enough to pass its evidence check and vaguely enough to be UNUSABLE | **NO CRITERION CAN REACH THIS, section 2.6 reason 1.** `mechanism-rule-evidence-resolves` checks that the evidence resolves, never that the rule is usable, and no schema keyword decides usability. The instrument is the hazard review contract; the phase's suggested tier was raised at revision 2 from "cheaper acceptable" to "strongest" for exactly this reason, which is a mitigation and not a check, and this row says so |
| a `structural-consequence` marked `applied` whose target path EXISTS but does not contain the change claimed | criterion 3, Kind B `tuition-target-exists`, covers the path-existence half only. **The content half is NOT covered and is section 2.6 reason 1**: "contains the change claimed" is a semantic relation between a prose consequence and a file. Named rather than left to be discovered, because criterion 3 reads at a glance as if it covered the whole item, and the two halves are what this project has repeatedly found to differ |
| a `machine-readable-form` pointing at a manifest key M2 RENAMED | criterion 4b, which resolves the declared path and key against the real `gates.manifest.json`. **Confirmed at revision 3**: `destructiveCommands` is present with four entries, so the key exists and the check has a real target rather than a hypothetical one |
| an id collision between the two `T-nnn` spaces that grows silently | criterion 9, which asserts the two migration-ticket ids collide with nothing existing, plus step 5's resolve-at-dispatch rule and the revision-3 restatement of criterion 1 as a relation rather than a literal count. **Residue**: criterion 9 checks the two ids this phase allocates, not the ongoing collision risk between the two directories, which no artifact M3 ships can police because `delivery/tuition/` is not a kernel deliverable |
| a `mechanisms[]` entry whose evidence resolves to a file that EXISTS but does not establish the rule | same shape as the `applied` row above and the same disposition: the resolution half is criterion 3's `mechanism-rule-evidence-resolves`, the establishment half is section 2.6 reason 1 |
| a retention check that passes because the declared path is ABSENT from the charter rather than present and tracked | criterion 8. **Verify at implementation and redden if it is not already both directions**: the criterion must assert that a charter with NO `retention` path makes the doctor check report FAIL or not-applicable-with-a-reason, never a silent pass, because a check that is vacuously satisfied by an absent declaration is the SC-011 shape this milestone exists to police |
- steps:
  1. Create `schemas/tuition.schema.json`: `{id, project, date, stage,
     kernel-relevant, what-happened, lesson[], mechanisms[],
     structural-consequence[], evidence[]}` where `kernel-relevant: true`
     requires at least one `structural-consequence` entry, each carrying
     `target` (a kernel artifact path) and `status` (`proposed`, `applied`,
     `ticketed`). An entry that claims kernel relevance and proposes no change
     to any kernel artifact is not tuition, it is an anecdote, and the schema
     says so. `mechanisms[]` is the T-005 field: each entry is
     `{mechanism, rule, evidence[]}` with `evidence[]` required and non-empty,
     because T-005's checkability rule is that "a rule with no citation to an
     investigation, review or tuition entry is not a rule".
  2. EDIT `schemas/mechanism-index.schema.json` (created by M3-P6 for its seed;
     revision 1 had this phase create it, which contradicted M3-P6's own
     files-to-touch list) to add the optional
     `machine-readable-form`, a path plus a key naming where the same rule exists
     as data, which is the field the `destructive-git-operation` entry uses, and
     generate `tuition/mechanism-index.yaml` with
     `tiphys tuition index [--out <file>] [--check]`: the index is a projection
     of every entry's `mechanisms[]`, keyed by mechanism, each rule carrying its
     evidence references and the id of the entry it came from. `--check`
     compares the committed index against a fresh projection and exits nonzero
     on drift, so the index cannot rot, and it is a projection rather than a
     second source exactly as T-005 requires. This phase replaces M3-P6's seed
     index with the generated file and re-witnesses the implementer brief's
     mandated-reading path against it.
  2b. **The interim index is an INPUT, not a competitor (NEW at revision 2).**
     `MECHANISMS.md` at the repository root holds twelve rows, each with a rule
     and a "paid for by" citation, and states of itself that it is the interim
     and is intended to be superseded by this projection. Every one of its
     twelve mechanisms must appear in the generated index, which means every one
     must appear in some tuition entry's `mechanisms[]` field, which is the work
     step 4 does. `MECHANISMS.md` is then DELETED by this phase, with a pointer
     to `tuition/mechanism-index.yaml` left in `tuition/README.md`, because two
     indexes is the exact thing T-005 says not to build ("a projection of the
     tuition feed rather than a second thing to maintain"). It is deleted rather
     than kept for reference because git history keeps it losslessly and a file
     kept for reference is a file someone will edit.
  2c. **The projection model is also the repository's compaction model (NEW at
     revision 2, stated here because this is the phase that builds the model).**
     The index is dense because it is READ at every dispatch under the
     `mechanism-lookup` obligation; the tuition entries behind it are longer
     because they are read only when a rule is disputed. That shape is general
     and not a property of tuition: projections (this index, M3-P4's final
     report, a findings inventory, a carried-forward list) are the READ layer
     and must stay dense, while raw entries (full review texts, per-round
     work-history sections) are the ARCHIVE layer. Once a raw entry's durable
     residue has been projected out and the projection's evidence references
     resolve, the entry is archive rather than working state, and git history
     makes removing it from the working tree lossless. **This plan builds no
     compactor and proposes none.** What it does is make the two layers
     structurally distinct in the artifacts and their checks, so a later
     compaction decision is a question about which layer a file is in rather
     than a judgement about which files look like filler. The check that makes
     it safe already exists in this phase as
     `mechanism-rule-evidence-resolves`: a projection whose evidence no longer
     resolves fails, which is what stops an archive removal from being a silent
     loss rather than a lossless one.
  3. Populate `tuition/` with the kernel-relevant entries promoted from this
     build's own log, converted to the schema (R-091's "kernel-relevant tuition
     ships upstream as a kernel PR", performed once, by hand, as the flow's
     first real use): T-001 (cross-model review catch, targeting
     `role-model-config.yaml`'s `review-model-family` and, from its second data
     point, `checklists/clean-room.yaml`'s `framings[]`), T-002 (agent death and
     salvage, targeting `roles/implementer.md`'s R-081b clause and the M4
     detection work), T-003 (fix rounds need verification, targeting
     `assurance-modes.yaml`'s `fix-round-verification` stage and
     `schemas/report.schema.json`'s universal-claim rule), T-004 (verification
     isolation and source pinning, targeting `schemas/report.schema.json`'s
     `source-pinned` field), and T-005 (lessons do not propagate between phases,
     targeting `tuition/mechanism-index.yaml` and `roles/implementer.md`'s
     `mechanism-lookup` and `mechanism-sibling` clauses). Each entry's
     `structural-consequence[].status` is `applied` with the artifact path, or
     `ticketed` with the record that carries it, and never `proposed` for a
     consequence this milestone already shipped.
     **Three more entries, NEW at revision 2, because the log grew after
     revision 1 was written and all three are kernel-relevant by their own
     headers.** T-006 (unexecuted claims about the world, targeting
     `schemas/report.schema.json`'s and `schemas/work-history.schema.json`'s
     shared `claims[]` section from M3-P4 step 1b, and
     `checklists/clean-room.yaml`'s two unexecuted-claim probes from M3-P7 step
     3c, plus the mechanism `verifying-access-to-a-remote` whose rule is that
     `git push --dry-run` authenticates against receive-pack while `clone` and
     `ls-remote` witness nothing about write access). T-007 (criteria cannot
     contain the defect, targeting `schemas/plan.schema.json`'s
     `hazard-classes[]`, `assurance-modes.yaml`'s `review-contracts[]`,
     `checklists/hazard-review.yaml`, and `roles/clean-room-reviewer.md`'s
     `review-contract` field). T-008 (the orchestrator had no beacon, targeting
     the `incremental-output` and `beacon-is-not-a-claim` clauses in
     `roles/implementer.md` and `roles/clean-room-reviewer.md` and the
     supervision section of `AGENTS.md`, plus the mechanism
     `supervising-a-dispatched-agent` whose rule is that supervision is a
     freshness watchdog armed in the same turn as the dispatch and never a wait
     for a completion notification). **This entry set is eight, not five**, and
     step 5's identifier allocation and criterion 1's count follow from it.
  4. Populate `mechanisms[]` on the entries that constrain one, which is what
     makes the index non-empty on day one rather than an empty shell waiting for
     a future incident. At minimum: `claim-file` from T-005 (a claim that cannot
     be taken fails loudly and names the stuck file, never absorbs silently;
     evidence `delivery/verification/u2-race-flake-investigation.md` defect D-3
     and `delivery/review/clean-room-m1-p5-second.md` finding 1);
     `retry-classification` from T-003 (a contention signature is built from
     real captured stderr, never from hand-written examples; evidence
     `delivery/review/verification-m1-p3-fix-round.md` V-2);
     `destructive-git-operation` from T-003 (a command that can destroy work
     states its destructive authority in its own contract and never inherits
     force semantics from a caller that does not yet exist; evidence V-1 in the
     same file, and `machine-readable-form` citing the `destructiveCommands`
     list in M2's `gates.manifest.json`, which is the same rule's checkable view
     and is what M2-P2's derived-class rule consumes: two views of one rule, and
     the citation is what stops them drifting, M2 plan section 2 item 10); `shared-worktree` from T-004 (a verification lens works in its
     own clone and a run that cannot pin its source is not evidence; evidence
     `delivery/verification/u2-race-flake-investigation.md`). Each is a rule this
     project has already paid for, with a citation, which is the only kind of
     entry the schema accepts.
     **The minimum is now the twelve interim rows, not the four above (revision
     2).** `MECHANISMS.md` carries twelve mechanisms and step 2b requires every
     one to survive into the generated index, so `mechanisms[]` across the eight
     entries must cover all twelve: the four already named, plus
     `lease-compare-and-swap`, `append-only-log`,
     `reading-a-path-whose-type-is-not-established`, `atomic-file-replacement`,
     `parsing-another-programs-reporter-output`,
     `pattern-matching-a-consumed-files-text`, `asserting-a-ci-step-is-wired`,
     `verifying-access-to-a-remote`, and `a-guards-own-failure-path`. Each keeps
     the interim file's rule text and its "paid for by" citations as `evidence[]`
     rather than being re-derived, because re-deriving a rule someone already
     paid for is how the wording drifts away from what the incident actually
     established. Where a mechanism has no natural home among the eight
     entries, it attaches to the entry whose incident produced it, which the
     interim file's "paid for by" column already names.
  5. Create the two migration tickets plan v1 section 11 item 7 parked for this
     moment as `ticketed` tuition entries: D-9's L1 mode-aware branch-protection
     enforcement of review-never-skipped, and D-10's L1 pre-validation push
     check. Both are recorded here and executed post-M3, which is what section
     11 item 7 says. Identifier allocation (M3R-011): kernel-shipped tuition and
     this build's `delivery/tuition/` share one `T-nnn` space, which `CLAUDE.md`
     says is never renumbered, so the two ticket numbers are allocated at
     dispatch as the next two free ids across BOTH directories and recorded in
     the work history. The files-to-touch list below carries the slug with the
     number resolved at dispatch rather than a number that may already be taken
     by then. **Revision 1's parenthetical "at the time of writing that is T-006
     and T-007" is superseded 2026-08-06 and is the worked example of why the
     rule exists**: T-006, T-007 and T-008 were all recorded in
     `delivery/tuition/` within thirty hours of revision 1 being written, so
     both proposed numbers were taken before the phase could dispatch. The
     lowest free id at revision 2 is T-009, and it will very likely have moved
     again by dispatch. **The rule proved itself a second time within a day:
     that sentence was already false when revision 2 shipped, because T-009 was
     recorded on 2026-08-07 and the lowest free id at revision 3 is T-010.**
     Do not read the number in this sentence either. Resolve at dispatch; do
     not copy a number out of this plan.
  6. Create `src/tuition.ts` and `src/commands/tuition.ts`:
     `tiphys tuition add --file <entry>` validates and writes an entry into the
     fleet's tuition area; `tiphys tuition list [--kernel-relevant]` prints one
     line per entry with id, date, and target count; `tiphys tuition index` is
     step 2's projection. Promotion of a kernel-relevant entry into a kernel
     pull request is a documented orchestrator procedure (M3-P9's `AGENTS.md`),
     not machinery: the kernel never opens pull requests, and building a promoter
     M3 uses once is the M1-P3 mistake.
  7. R-070 (a pipeline flaw is fixed immediately as a hotfix, not deferred) and
     R-098's retention duty land as: an `AGENTS.md` clause (written in M3-P9,
     clause ids reserved here) plus the checkable half built here, a new
     `tiphys doctor` check `retention` that reads the charter's `retention`
     paths and FAILs when a declared path is absent or is git-ignored in the
     fleet or project repository. Extend the doctor profile table by promoting
     `retention` to FAIL under the `full` profile.
  8. Register the `tuition` and `mechanism-index` types with the validator's
     `--type` table and the `auto` resolver, and register this phase's two
     derived checks in `src/checks.ts`: `tuition-target-exists` and
     `mechanism-rule-evidence-resolves` (both touch the filesystem, so both are
     Kind B, and neither was named by the review).
  9. Tests: `test/tuition.test.ts`, `test/mechanism-index.test.ts`, and an
     extension of `test/doctor.test.ts` for the retention check.
- files-to-touch: `schemas/tuition.schema.json` (create),
  `schemas/mechanism-index.schema.json` (EDIT: created by M3-P6 for its seed,
  extended here with `machine-readable-form`; corrected at revision 2, where
  revision 1 listed it as a create and contradicted M3-P6's list),
  `tuition/` (a DIRECTORY entry with a trailing slash, **replacing the literal
  enumeration `tuition/T-001.yaml` through `tuition/T-008.yaml` at revision 3,
  A-010**). The literal list was a hard-coded enumeration of a growing set
  handed to a checker that treats the declared list as CLOSED and
  anti-widening: `delivery/tuition/` held nine entries on 2026-08-07, not
  eight, because T-009 was recorded after revision 2 was written, and by
  dispatch it may hold more. An implementer who does the right thing and
  promotes the kernel-relevant T-009 fails the scope audit and has to escalate;
  one who follows the list literally silently drops the newest and arguably
  most kernel-relevant entry. The phase-declaration schema accepts a literal
  directory written with a trailing slash (M2R-016), and the auditor matches it
  as a prefix, so the directory entry is the form that survives the feed
  growing. Step 3's promotion list is restated in the same terms: **every entry
  in `delivery/tuition/` at DISPATCH, with the count and the resolved id list
  recorded in the work history**, never a number copied out of this plan. This
  is the identical rule the phase already states for tuition IDENTIFIERS one
  screen earlier ("resolve at dispatch; do not copy a number out of this
  plan"), which revision 2 stated and then contradicted for tuition FILENAMES
  one screen later. The directory entry also absorbs the two migration tickets
  (`T-<next>-review-enforcement` and `T-<next+1>-push-before-validation`, step
  5), whose numbers are likewise allocated at dispatch, and the generated
  `tuition/mechanism-index.yaml`; each is still named in the steps, and the
  scope declaration covers them by prefix rather than by a name nobody can know
  in advance.
  `MECHANISMS.md` (DELETE, step 2b, once every one of its twelve rows resolves
  through the generated index; declared here because a deletion must never be
  an undeclared extra to the scope audit; it is at the repository ROOT and is
  therefore NOT covered by the `tuition/` prefix, which is exactly the kind of
  path the fix-round contract's item 3 records this project missing three
  times), `src/tuition.ts`,
  `src/commands/tuition.ts`, `test/tuition.test.ts`,
  `test/mechanism-index.test.ts` (create); `tuition/mechanism-index.yaml`
  (edit: replaces M3-P6's seed with the generated projection),
  `tuition/README.md` (edit), `src/commands/doctor.ts` (edit, verify check list
  and profile table first), `test/doctor.test.ts` (edit), `src/cli.ts` (edit),
  `src/validate.ts` (edit, type table), `src/checks.ts` (edit, register this
  phase's derived checks), `package.json` (edit, files entry).
- acceptance criteria:
  1. `tiphys validate --type tuition` exits 0 on **every promoted entry plus
     the two tickets**, and `tiphys validate --type mechanism-index
     tuition/mechanism-index.yaml` exits 0. **The COUNT is resolved at dispatch,
     not stated here (corrected at revision 3, A-010).** Revision 1 said seven,
     revision 2 said TEN (eight promoted plus two tickets), and revision 2's
     number was already wrong when it shipped, because T-009 was recorded
     2026-08-07. The criterion is therefore written as a relation rather than a
     number: the count of validated entries equals the count of files in
     `delivery/tuition/` that step 3 judged kernel-relevant, plus two, and both
     counts are recorded in the work history with the `ls` that produced them.
     A criterion carrying a literal count of a growing set is a criterion that
     goes stale between planning and dispatch, which this plan has now
     demonstrated twice in two revisions.
  2. Kind A DANGEROUS-instance rejections, each witnessed by removing and
     restoring the guarding keyword: (a) an entry with `kernel-relevant: true`
     and an empty `structural-consequence[]` exits 1 naming the field; (b) a
     `mechanisms[]` entry with a rule and an empty `evidence[]` exits 1 naming
     the field, which is T-005's own rule ("a rule with no citation to an
     investigation, review or tuition entry is not a rule") expressed as a
     schema constraint rather than as advice.
  3. Kind B rejections, each carrying `(check: <id>)` and witnessed by
     deregistering and restoring the check: (a) an entry whose
     `structural-consequence[].status` is `applied` and whose `target` path does
     not exist in the repository exits 1 naming the path, check
     `tuition-target-exists` (a claim that a fix was applied is checked against
     the tree, which is exactly the claim T-003 showed a document can carry
     falsely); (b) a `mechanisms[]` rule whose evidence reference names a file
     that does not exist exits 1 naming the reference, check
     `mechanism-rule-evidence-resolves`.
  4. `tiphys tuition index --check` exits 0 against the committed index; adding
     a `mechanisms[]` entry to any tuition file without regenerating makes it
     exit nonzero naming the mechanism and the entry id; regenerating returns
     exit 0 (both directions: the index is a projection, and drift is a failure
     rather than a slow divergence).
  4b. The `destructive-git-operation` entry carries a `machine-readable-form`
     naming `gates.manifest.json` and the key `destructiveCommands`, and that
     path and key both resolve (Kind B, check
     `mechanism-rule-evidence-resolves` extended to cover the field); renaming
     the key in a fixture manifest makes it exit nonzero naming the key, and
     restoring it returns exit 0 (both directions). This is the anti-drift
     coupling M2 asked for: the prose rule and the machine list are two views of
     one thing and the index says which (D-M3-26). Dependency direction is M3
     reads M2, never the reverse.
  4c. **No interim row is dropped (NEW at revision 2, step 2b, and the coupling
     `delivery/plan/kernel-plan-m2.md` section 2 item 10 asked for), both
     directions.** A registered test parses `MECHANISMS.md` as it stood at
     `037477e` (checked in as `test/fixtures/mechanisms-interim.md`, a verbatim
     capture, per section 2.3 rule 4) and asserts that every one of its twelve
     mechanism keys resolves to an entry in the generated
     `tuition/mechanism-index.yaml`, failing and NAMING any missing key.
     Removing one mechanism from a tuition entry's `mechanisms[]` and
     regenerating makes the test fail naming that mechanism; restoring it
     returns exit 0. The fixture is the capture rather than the live file
     because `MECHANISMS.md` is deleted by this phase, and a test whose input
     the phase deletes is a test that stops meaning anything the moment it is
     needed.
  4d. **`MECHANISMS.md` is gone and its readers are redirected**, asserted by a
     registered test: the file is absent, `tuition/README.md` names
     `tuition/mechanism-index.yaml` as the index, and no shipped artifact
     (briefs, `AGENTS.md`, checklists, schemas) contains the string
     `MECHANISMS.md`. Both directions: reintroducing a reference makes the test
     fail. Two indexes is the state T-005 exists to prevent and the state that
     produced M1's most severe defect when one mechanism was implemented twice.
  5. The generated `tuition/mechanism-index.yaml` contains an entry for
     `claim-file` whose rule is T-005's loud-failure rule and whose evidence
     resolves to both cited files; deleting T-005's `mechanisms[]` block and
     regenerating removes that entry, and restoring it brings it back (both
     directions). This is the specific defect T-005 records: the next
     implementer reaching for a claim file now gets an answer, and the test
     proves the answer comes from the feed rather than from a hand-written file.
  6. `tiphys brief compose --role implementer` output names
     `tuition/mechanism-index.yaml` in its mandated reading and the path
     resolves to the generated index (M3-P6 criterion 8 completed against the
     real artifact rather than the stub).
  7. `tiphys tuition list --kernel-relevant` exits 0 and prints exactly the
     entries whose `kernel-relevant` is true; `tiphys tuition add` on an invalid
     entry exits nonzero and writes nothing (verified by comparing the tuition
     directory listing before and after).
  8. `tiphys doctor` in a fleet whose charter declares a `retention` path that
     exists and is tracked prints `CHECK retention PASS`; after adding that path
     to `.gitignore`, the same command prints `CHECK retention FAIL` naming the
     path and exits nonzero; under `--for full` the same promotion is witnessed
     (both directions, R-098).
  9. The two migration-ticket ids do not collide with any existing
     `delivery/tuition/T-nnn` or `tuition/T-nnn` id, asserted by a registered
     test that scans both directories for duplicate ids and fails on any
     (M3R-011; the test outlives this phase, which is the point, since the two
     directories will keep growing independently).
  10. `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map
     resolves this phase's three rows; earlier mappings still resolve.
- new behaviors: `tuition-entry-validates`,
  `tuition-kernel-relevant-requires-consequence`,
  `tuition-mechanism-rule-requires-evidence`, `tuition-applied-target-must-exist`,
  `mechanism-evidence-resolves`, `mechanism-index-projection-drift`,
  `mechanism-index-contains-claim-file-rule`,
  `mechanism-machine-readable-form-resolves`,
  `implementer-brief-reads-generated-index`,
  `tuition-list-filters-kernel-relevant`, `tuition-add-rejects-invalid`,
  `tuition-ids-unique-across-directories`, `doctor-retention-check`,
  and NEW at revision 2: `mechanism-index-covers-every-interim-row`,
  `interim-index-removed-and-redirected`,
  `tuition-add-refuses-non-regular-entry-path`.
- suggested model tier: strongest, changed from revision 0's "cheaper tier
  acceptable". The phase is no longer a schema plus four conversions: it now
  carries the mechanism index, which is the structural answer to the failure
  T-005 records, and the index's value is entirely in whether its rules are
  stated precisely enough to be usable by someone who was not there.
- citations: R-070, R-091, R-098; blueprint section 9 (tuition flow) and section
  2 (kernel PRs); process doc sections 4 and 9 item 5; plan v1 section 11 item 7
  and the R-091 note (directory scaffolded in M1-P1); T-001 to T-005, with T-005
  as the source of the mechanism index and its checkability rule; **T-006, T-007
  and T-008** (the three entries added at revision 2, step 3, and the two
  mechanisms they contribute); T-003
  structural consequence 4 and V-1, with M2-P1's `destructiveCommands` list as
  the cited machine-readable form (D-M3-26, M2 plan section 2 items 10 and 11);
  **`MECHANISMS.md`** (the twelve-row interim index this phase's projection must
  cover and then supersede, steps 2b and 4c); **`delivery/plan/kernel-plan-m2.md`
  section 2 item 10** (the no-dropped-row coupling, asked for from M2's side);
  `delivery/STATE.md` carried-forward item "a mechanism index... belongs with the
  M3 tuition flow".
- conflicts-with: M3-P9 (`AGENTS.md` clauses reserved here), M3-P10 (files
  entry).
- blocked-by: **M3-P6 merged** (corrected at revision 3, A-006), plus M2-P1
  merged (named dependency: the `destructiveCommands` list the seeded entry
  cites, confirmed present with four entries in `gates.manifest.json` on
  `main`; the citation is read-only, so nothing here edits a merged M2
  artifact, D-M3-16). **M3-P8 MERGES AFTER M3-P7, because merge order is
  dependency order (CLAUDE.md convention 5), but it is not blocked from
  STARTING by P7.** Revision 2 read "M3-P7 merged", which is an unconditional
  serial dependency that contradicted section 2.5's own declaration that the
  pair is conditionally parallelizable; the two fields could not both be right.
  Checking what this phase actually consumes settles it in P6's favour: the
  `grounding` field above names `tuition/README.md` (M1-P1), M3-P6's seed
  `mechanism-index.yaml`, M3-P1's charter `retention` field and the M1-P2
  doctor, and no M3-P7 artifact anywhere. The old value was an ordering habit,
  which is precisely what section 2.5's derivation exists to detect.

### M3-P9: Orchestrator policy (AGENTS.md)

- id: M3-P9
- branch: `claude/m3-p9-agents-policy`
- intent: Ship `AGENTS.md`, the orchestrator's job description, carrying the
  eleven policy rows plus the four plan-level duties that plan v1 assigned to
  this document by name, with every piece of data-expressible policy referenced
  by path rather than restated.
- grounding: M3-P8 merged, so every artifact `AGENTS.md` references exists.
  Plan v1 assigns four duties here explicitly: the fleet-state commit and push
  discipline (D-4, PR-012, SC-002), the merge-authority resolution (D-6,
  SC-008), the projects/ read-only rule with its release-manager carve-out
  (D-8, SC-010), and the specification half of the cloud fleet resume story
  (PR-201, whose executable machinery is M4). Constraints C-2 and C-3 bind the
  supervision clauses (section 1.4). This is the kernel's shipped orchestrator
  brief and is not `CLAUDE.md`, which is this repository's own agent-rules file
  under the current process.
  **Three decisions and one tuition entry changed what this document says after
  revision 1.** DR-0015 removes the owner from the merge path including at
  milestone boundaries, so step 2's merge-authority duty no longer reads
  "owner approves per pull request". DR-0016 replaces the stop-and-wait response
  at an escalation bound with a fresh implementer plus a third review contract
  dispatched immediately, and adds a threshold rule for when the owner is
  involved at all, which is a new clause. T-007 makes the second review contract
  a declared duty rather than a dispatch habit. And T-008 is the reason this
  document's supervision section is the most load-bearing prose M3 ships: the
  orchestrator running THIS project supervised two review agents by waiting for
  a completion notification and lost nine hours eleven minutes, while building
  the watcher and liveness guard that exist to prevent exactly that.
- hazard class (T-007, D-M3-32): **the document the orchestrator runs on, whose
  failure mode is a clause that reads as satisfied while the property is
  absent.** What can pass every criterion here: a supervision section that
  names lease freshness and the beacon and still leaves "wait for the agent to
  report" as the operative instruction, which is exactly what T-008 measured; a
  duty stated without the mechanism that discharges it, so it depends on
  attention, which this project has recorded twice as insufficient; a
  decorrelation clause satisfied by two verdicts that differ in `produced-by`
  while both ran the criteria contract, which is T-007's failure surviving
  DR-0012's check; an anti-duplication check that passes because the duplicated
  data was reworded rather than removed; a reference that resolves to a file
  whose content moved; and the whole document drifting into a restatement of
  the registry and the modes, which is risk 5 and which the criterion 3 check
  is the structural answer to.
  **Added at revision 3 (T-009):** a merge-completion duty that says "CI is
  green" without naming the EVENT and the head sha, which is satisfiable by
  reading the already-green `pull_request` check on the source branch while the
  `push` run on the new `main` tip is red, and which cost this project four
  hours and twenty-one minutes across five consecutive runs with four more
  merges landing on top.
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a supervision section that names lease freshness and the beacon and still leaves "wait for the agent to report" as the OPERATIVE instruction | criterion 7c, which requires the `dispatch-requires-a-guard` clause text to contain FRESHNESS and "newest mtime" and to contain neither "exists" nor "completion" as the watched condition, plus criterion 5's vocabulary scan forbidding the liveness vocabulary anywhere in the document. Both are text assertions and both say so |
| a duty stated WITHOUT the mechanism that discharges it, so it depends on attention | **NO CRITERION CAN REACH THE GENERAL CASE, section 2.6 reason 1.** Criterion 7c covers the one duty whose mechanism-free form has a measured price. The instrument for the rest is the hazard review contract; risk 5 carries the residue |
| a decorrelation clause satisfied by two verdicts differing in `produced-by` while both ran the CRITERIA contract | criterion 7b, witnessed separately from criteria 7's family and framing dimensions precisely because T-007's finding is that they are different properties |
| an anti-duplication check that passes because the duplicated data was REWORDED rather than removed | criterion 3 covers the pasted-verbatim case. **The reworded case is NOT covered and is section 2.6 reason 1**: "the same table in different words" is a semantic relation. Named because criterion 3 reads as if it covered the item and the phase's own hazard sentence is explicit that it does not |
| a reference that resolves to a file whose CONTENT moved | criterion 2 covers deletion of the referenced file. **Content movement is NOT covered and is section 2.6 reason 3 with a named later target**: it is the same shape as the clause map's third condition, and the honest position is that `check-agents-references.mjs` should assert the referenced ANCHOR and not only the path. Revision 3 makes that criterion 2b rather than leaving it a residue |
| the whole document drifting into a restatement of the registry and the modes | criterion 3, plus risk 5 |
| a merge-completion duty that says "CI is green" without naming the event and the head sha (T-009) | **criterion 5b, NEW at revision 3.** No clause and no criterion covered this at revision 2; T-009's single appearance in the whole plan was a remark about tuition id allocation |
- steps:
  1. Create `AGENTS.md` (markdown with frontmatter validated by
     `schemas/role-brief.schema.json` with `role: orchestrator`), clause ids in
     frontmatter and as body headings, carrying:
     never writes feature code in projects, infra-hotfix carve-out named
     (R-001b); never lets a review be skipped, with the structural half being
     the declared mode's stage list from `assurance-modes.yaml` and the
     prompt-only residue ticketed in `tuition/` (R-002, D-9); a genuine unknown
     gets a dedicated investigator dispatched alongside plan writing, with the
     note that this is a scout task and not a parallel phase, so it does not
     collide with the phase-parallelism limits DR-0011 sets (R-013); all
     plan-review
     findings are applied to the plan before execution starts (R-030); the fix
     round goes back to the same implementer, resumed with context intact
     (R-061); disputes are allowed with evidence and the orchestrator
     arbitrates (R-062); the merge commit message tells the story (R-065b);
     three consecutive reds from the same flake means stop re-kicking and fix
     the flake first, promoted to next in queue (R-067, D-13, with the L1
     counter deferred to v1.1 telemetry); consolidate small, low-risk,
     disjoint-surface phases into one pull request and keep big or risky phases
     alone (R-073, the declared exception to R-032); kill recurring flakes early
     and count what one costs across re-kicks, reviews, and near-misses (R-076);
     re-kick only when there is nothing pending to batch it with (R-077).
  2. Add the four plan-assigned duties named in the grounding, each citing its
     source: fleet-state commit and push discipline (which fleet state is
     committed and pushed, and when); **merge authority, restated at revision 2
     under DR-0015**, which is that the authority regime is whatever the
     declared mode's `merge-authority` says and that for a mode declaring
     `delegated-under-conditions` the SIGNATURE is dual cross-model clean review
     rather than a person, at milestone boundaries included; the orchestrator
     executes the merge serially as release manager. Revision 1's "owner
     approves per pull request, orchestrator executes the merge" is superseded
     2026-08-05 by DR-0015, which states in terms that the owner does not
     approve merges and that DR-0012's milestone-boundary carve-out is removed.
     What SURVIVES and is written here because DR-0015 says it survives: exit
     tests remain hard gates, and their evidence is presented to the owner
     unasked. Presenting evidence is not requiring a click, and only the second
     was removed. Also the projects/ read-only rule and its ref-update
     carve-out; and the fleet resume
     specification (what is expected to survive reclamation, what is rebuilt,
     what doctor should report), explicitly marked as specification with the
     machinery deferred to M4.
  2b. **The escalation-threshold clause, NEW at revision 2 (DR-0016).** Clause
     `escalation-threshold`: the orchestrator escalates to the owner ONLY when
     two or more options are genuinely comparable AND the consequence is high
     impact and costly to reverse. If the analysis yields a recommendation the
     orchestrator would defend, the options are not comparable and there is
     nothing to ask: decide, record it as a decision record with its reasoning,
     and report it. The clause states the ordering rule that makes the test
     applicable rather than felt: **write the recommendation FIRST**, because
     doing so is what reveals whether the question was ever a question. It
     states the two standing exceptions unchanged: anything needing elevated
     access the agent does not hold, and anything the owner has explicitly
     reserved. And it carries DR-0016's own measured evidence, because a
     threshold with no cost attached gets widened: owner escalations cost 4.7
     hours on M1-P5 alone, 16 per cent of that milestone's elapsed critical
     path, the limit fired three times, and all three times the owner chose the
     option the orchestrator had already recommended.
     Clause `stalled-phase-response`, the other half: when a phase needs more
     than two fix rounds after review or a high-severity finding recurs in one
     component, the response is a FRESH IMPLEMENTER plus a third review
     contract, dispatched immediately, with the owner notified asynchronously
     rather than waited on; only if that round also fails does the phase go to
     the owner. The clause cites `full` mode's `escalation-bounds.on-exceeded`
     (M3-P3) by path rather than restating the numbers, per the
     anti-duplication rule, and it records why the response changed: the
     intervention that broke M1-P5's spiral was not the owner's decision but the
     fresh implementer dispatched afterwards, which derived eleven call sites
     where the review had listed eight.
  2c. **The two-review-contract duty, NEW at revision 2 (T-007).** Clause
     `two-review-contracts`: for a code phase the orchestrator dispatches two
     review CONTRACTS, not two reviewers. One is composed with
     `--review-contract criteria` and `checklists/clean-room.yaml`; the other
     with `--review-contract hazard` and `checklists/hazard-review.yaml`,
     carrying the phase's declared `hazard-classes[]` as its starting question.
     The clause states, with the evidence, why two models are not sufficient:
     two reviewers on different families walked all fifteen of M1-P5's
     acceptance criteria by direct execution, agreed on every mechanical fact,
     and one returned APPROVE while the other found a high-severity defect that
     live-locked every supervision command; the approving report does not
     contain the word `readBeacon`, and had both been briefed on the criteria
     both would have approved on any two models. The clause also states the
     `AGENTS.md`-side residue plainly: "all acceptance criteria met" is one
     input to a phase's assurance and is never a terminal green.
  3. Add the four duties this build paid tuition for, each citing its entry:
     salvage discipline, with the exact `WIP-UNREVIEWED (do not treat as
     reviewed):` prefix (T-002); verification dispatch isolation, every lens in
     its own clone, never a shared worktree (T-004); per-phase probe
     injection into the clean-room review using the M3-P7 extension mechanism
     (R-054's orchestrator half, whose data mechanism already shipped); and the
     promotion procedure for kernel-relevant tuition, which is a documented
     orchestrator act rather than machinery (M3-P8 step 6), including the
     requirement that an entry constraining a mechanism names it so
     `tiphys tuition index` picks it up (T-005).
  3b. Add the decorrelated-review duty (M3R-004), the finding that revision 0
     recorded as schema fields and never enforced or assigned. Clause
     `decorrelated-review`, citing DR-0012 and T-001 directly: when the declared
     mode's `merge-authority` is `delegated-under-conditions`, the orchestrator
     may merge only after verifying, against the verdict files rather than
     against memory, that (a) two verdicts exist for the exact head, (b) their
     `produced-by` model families are distinct, which is DR-0012 condition 1,
     (c) their `framing` values are distinct, which is T-001's second lesson
     that "two reviews with different STARTING QUESTIONS find different things"
     and that "the checklists should vary the entry point rather than only the
     reviewer", (d) neither carries an unresolved high or medium finding,
     which is DR-0012 condition 2, and **(e) NEW at revision 2, their
     `review-contract` values are distinct, one `criteria` and one `hazard`**
     (T-007, and the schema field M3-P7 step 6a adds). Condition (e) is not a
     duplicate of (b) or (c) and the difference is the whole point: T-007
     records two verdicts on ONE head, from two different model families, that
     agreed on every mechanical fact because both walked the criteria, and the
     one that found the high-severity defect differed in its BRIEF. DR-0012's
     condition 1 checks the model; T-007's condition checks the question.
     The clause also carries the stop-rather-than-grind bound by
     reference to `full` mode's `escalation-bounds` INCLUDING its `on-exceeded`
     response (M3-P3), rather than restating the numbers, per the
     anti-duplication rule; the response is DR-0016's fresh implementer plus a
     third contract, not DR-0012's original stop-and-wait. Ship `scripts/check-dual-review.mjs` (Kind B derived
     check `dual-review-decorrelation`, registered in `src/checks.ts`) so the
     verification is a command with an exit code and not a habit: a kernel that
     can represent the regime but cannot detect a run that quietly used one
     model family twice reproduces the exact failure class T-001 exists to
     prevent, this time invisible because the kernel's own artifacts never
     looked.
  4. Add a supervision section written in lease and beacon terms only, with an
     explicit statement that liveness is lease freshness and that arming the
     watcher is an explicit foreground step (C-2, C-3).
     **Revision 2 makes this section the dispatch contract rather than a
     restatement of C-2, and it is the clause with the largest measured price
     behind it in the whole plan (T-008, D-M3-31).** Three clauses:
     - `dispatch-requires-a-beacon`: no agent is dispatched without being
       instructed to write its output INCREMENTALLY, creating its artifact
       within the first minutes and appending as it works, so the file's mtime
       is the beacon. An agent that writes only at the end has no beacon, and
       when it dies it leaves nothing. This is the orchestrator-side half of the
       `incremental-output` clause M3-P5 and M3-P6 put in the briefs, and the
       two are one rule seen from two ends.
     - `dispatch-requires-a-guard`: a freshness watchdog is armed in the SAME
       TURN as the dispatch. It watches the newest mtime under the agent's
       working directory and reports stale after a declared threshold. **It
       tests FRESHNESS, never existence and never completion.** The clause names
       the recorded failure of the first attempt at this fix, because it is the
       cheapest available warning: the first watchdog written after the incident
       tested whether the report file EXISTED, both agents created a skeleton
       within two minutes, so it fired immediately and reported success while
       telling the orchestrator nothing. That is a guard whose condition does
       not test the property that matters, which is the red-witness rule one
       level up.
     - `notification-is-not-liveness`: waiting for a completion notification is
       PROCESS LIVENESS and is forbidden by C-2. A dead process sends no
       notification, and an absence of notification is indistinguishable from
       work in progress. The clause carries the measurement: on 2026-08-06 two
       review agents died within minutes of dispatch and were not noticed for
       nine hours eleven minutes, during which the orchestrator answered the
       owner repeatedly, dispatched other work, wrote three decision records and
       ran a throughput analysis, without once checking whether the thing it was
       waiting on was alive. It was the largest single waste in the project,
       larger than every escalation combined. The clause also states why a
       stated stall rule is not the answer: the orchestrator HAD a thirty-minute
       stall rule, had stated it aloud to the owner that morning, and did not
       apply it, because a rule addressed to attention fails exactly when a
       session is busy, which is when it is needed.
     The section also carries the C-3 distinction from section 1.4, so a reader
     does not resolve "arm a watchdog" against "never auto-background" by
     guessing: C-3 forbids a kernel COMMAND from backgrounding work behind the
     operator's back; the watchdog is an explicit, declared supervision act
     whose purpose is to be observable, and the orchestrator arms it knowingly.
  5. Create `scripts/check-agents-references.mjs`: every path referenced by
     `AGENTS.md` must exist, and `AGENTS.md` must not contain a gate list, a
     mode table, or a model-tier table (the data lives in
     `gate-registry.yaml`, `assurance-modes.yaml`, `role-model-config.yaml`).
     Wire into the gates workflow.
  6. Tests: `test/agents-policy.test.ts`, `test/dual-review.test.ts`.
- files-to-touch: `AGENTS.md`, `scripts/check-agents-references.mjs`,
  `scripts/check-dual-review.mjs`, `test/agents-policy.test.ts`,
  `test/dual-review.test.ts` (create); `src/checks.ts` (edit, register
  `dual-review-decorrelation`), `.github/workflows/gates.yml` (edit),
  `gate-registry.yaml` (edit, ADDED at revision 3: both scripts are registered
  as registry entries with their `events[]` rather than wired as raw workflow
  steps, section 2.2a and D-M3-34. `check-agents-references` is
  `events: [pull_request, push]` because a broken reference on `main` is the
  state that matters; `check-dual-review` is `events: [pull_request]` with a
  precondition, because a merged head has no pair of verdicts to compare and a
  gate that cannot reach a verdict must be not-applicable-with-a-reason rather
  than green, which is M2-C-3 applied to M3's own check),
  `package.json` (edit, add `AGENTS.md` to files).
  **Standing constraint on the `.github/workflows/gates.yml` edit (DR-0017,
  DR-0004):** one job named `gates`, no matrix, no second job. See section 1.1.
- acceptance criteria:
  1. `tiphys validate --type role-brief AGENTS.md` exits 0 with `role:
     orchestrator`.
  2. `node scripts/check-agents-references.mjs` exits 0; deleting any file
     `AGENTS.md` references makes it exit nonzero naming the reference;
     restoring it returns exit 0 (both directions).
  2b. **References resolve to an ANCHOR, not only to a path (NEW at revision 3,
     section 2.6), both directions.** Every `AGENTS.md` reference is written as
     a path plus a clause id, heading anchor or field pointer inside the target,
     and `check-agents-references.mjs` asserts the anchor occurs in the target
     file. Deleting the anchor while leaving the file present makes it exit
     nonzero naming the reference and the missing anchor; restoring it returns
     exit 0. Criterion 2 covers the file-deleted case only, which is the loud
     failure; the file-present-but-content-moved case is the silent one and is
     the one this phase's hazard class names. **Two structurally different
     members, per section 2.3 rule 6**: a heading anchor removed from a
     markdown target (`roles/implementer.md`), and a field pointer whose key
     was renamed inside a YAML target (`assurance-modes.yaml`), because the two
     are located by different means and a checker can handle one and not the
     other.
  3. The same script exits nonzero when a gate id list, a mode table, or a
     model-tier table is pasted into `AGENTS.md`, witnessed by pasting one and
     reverting (the anti-duplication rule of section 1.5 is enforced, which is
     what stops this file from drifting away from the registry it summarizes).
  4. Clause map resolves this phase's eleven rows to clause ids present as body
     headings, and every clause id in the frontmatter occurs exactly once in the
     body and the reverse (both directions, as in M3-P6 criterion 7).
  5. A registered grep test asserts `AGENTS.md` contains no instruction using
     pid, process liveness, signals, `/proc`, or backgrounding vocabulary, and
     that its supervision section names lease freshness and the beacon (C-2,
     C-3, falsifiable in both directions by inserting and removing a violating
     line).
  5b. **The merge-completion clause names the EVENT and the head sha (NEW at
     revision 3, T-009, D-M3-36), both directions.** `AGENTS.md` carries a
     `merge-is-not-complete-until` clause as a body heading resolving from
     frontmatter, and a registered grep test asserts its text states all four
     of: that the run to be observed is the one whose EVENT is `push`; that its
     head sha equals the new `main` tip; that it is observed TO COMPLETION with
     the same watchdog discipline T-008 requires; and that a `pull_request`
     check on the source branch does NOT discharge it. Weakening the text to
     "confirm CI is green on main after merging" makes the test fail naming the
     clause; restoring the four elements returns green.
     A second registered test asserts the clause cites T-009 by id, per
     criterion 8's rule that a clause encoding a reversal carries its record.
     **Two structurally different members, per section 2.3 rule 6, chosen
     because the two ways this clause degrades are different**: the vague
     weakening above, which drops all four elements at once; and a SPECIFIC
     weakening that keeps "observe the run on the new `main` tip" and drops the
     event name, which is the more likely edit and is exactly the state T-009
     records, where the PR check and the push run were both real runs on
     related shas and the wrong one was read.
     **And the general rule behind the clause, which is the part that outlives
     this instance**: `AGENTS.md` also carries `gate-result-is-scoped-to-its-run`
     stating that "CI is green" is never a complete sentence and that a
     complete one names the event and the head sha, with the corollary that
     where behaviour forks on the CI event, BOTH arms need a witness. This is a
     text assertion over prose and is labelled as one, per D-M3-28's honesty
     rule; what it buys is that a future orchestrator reading this document
     finds the rule rather than reconstructing it from an incident.
  6. The four plan-assigned duties of step 2 are each present with a citation to
     their source record (D-4/PR-012, D-6/SC-008, D-8/SC-010, PR-201), asserted
     by a registered test that greps for the four citation tokens.
  7. Dual-review decorrelation (M3R-004), all five directions witnessed with
     verdict fixtures: with `merge-authority: delegated-under-conditions`,
     `node scripts/check-dual-review.mjs <dir>` exits 0 on two verdicts for one
     head with distinct `produced-by` and distinct `framing`; exits nonzero
     naming the duplicated value when the two share a `produced-by`; exits
     nonzero naming it when the two share a `framing`; exits nonzero when only
     one verdict exists for the head; and exits 0 for a mode whose
     `merge-authority` is `owner`, so the check applies exactly where the grant
     applies. Deregistering `dual-review-decorrelation` makes the shared-family
     fixture pass, which is the Kind B witness (section 2.3 rule 3).
  7b. **Contract distinctness (T-007), both directions.** `check-dual-review.mjs`
     exits nonzero naming the duplicated value when the two verdicts share a
     `review-contract`, even if their `produced-by` and `framing` both differ;
     the same pair with one `criteria` and one `hazard` exits 0. This is the
     fifth distinctness dimension and it is witnessed separately from the other
     two, because T-007's whole finding is that model decorrelation and contract
     decorrelation are different properties and the project had the second by
     accident.
  7c. **Supervision clauses (T-008, D-M3-31), both directions each.** A
     registered test asserts `AGENTS.md` carries `dispatch-requires-a-beacon`,
     `dispatch-requires-a-guard` and `notification-is-not-liveness` as body
     headings resolving from frontmatter, and that the
     `dispatch-requires-a-guard` clause text contains the words FRESHNESS and
     "newest mtime" while containing neither "exists" nor "completion" as the
     watched condition. Weakening the clause to "check the agent has produced
     output" makes the test fail, restoring it returns green. This is a text
     assertion over prose and is labelled as one, per D-M3-28's honesty rule:
     it proves the clause says the thing, never that an orchestrator obeys it.
     What makes it more than decoration is criterion 5's vocabulary scan, which
     forbids the liveness vocabulary in the same document.
  8. `AGENTS.md` cites DR-0012 and T-001 by id in the `decorrelated-review`
     clause, asserted by a registered grep test (revision 0's `AGENTS.md`
     citation list contained neither, which is what M3R-004 found).
     **Revision 2 extends the same test to four more ids in the clauses that
     encode them**: DR-0015 in the merge-authority duty, DR-0016 in
     `escalation-threshold` and `stalled-phase-response`, T-007 in
     `two-review-contracts`, and T-008 in the supervision section. The reason
     for the extension, stated as the argument it is rather than as a
     prediction: four of this document's clauses now encode decisions that
     REVERSED an earlier written position, and an untraceable clause gives a
     future reader nothing to weigh a softening against. This project has one
     recorded instance of the shape (revision 1 of this plan carried owner
     action A-3 for a day after DR-0015 removed it, because the removal lived in
     a record the plan did not cite); one instance is not a class, and the
     citation costs a grep.
  9. `node --test` exits 0 with 0 failing and zero unaccounted tests; earlier
     mappings still resolve.
- new behaviors: `agents-frontmatter-validates`,
  `agents-references-resolve`, `agents-no-duplicated-policy-data`,
  `agents-clause-ids-round-trip`, `agents-no-liveness-vocabulary`,
  `agents-carries-plan-assigned-duties`, `dual-review-distinct-model-families`,
  `dual-review-distinct-framings`, `dual-review-requires-two-verdicts`,
  `dual-review-inapplicable-under-owner-authority`,
  and NEW at revision 2: `dual-review-distinct-contracts`,
  `agents-supervision-tests-freshness`,
  `agents-carries-escalation-threshold`,
  `agents-carries-two-review-contract-duty`,
  `agents-cites-decisions-behind-reversed-clauses`,
  and NEW at revision 3: `agents-merge-completion-names-event-and-sha`,
  `agents-merge-completion-rejects-pull-request-check`,
  `agents-carries-gate-result-scoping-rule`,
  `agents-references-resolve-to-anchor`,
  `agents-anchor-check-detects-renamed-yaml-key`.
- suggested model tier: strongest. This is the document the orchestrator runs
  on, and four of its clauses encode settled owner resolutions.
- citations: R-001b, R-002, R-013, R-030, R-061, R-062, R-065b, R-067, R-073,
  R-076, R-077; blueprint sections 2, 3, 6, and 10; process doc sections 0, 1b,
  1d, 3, 4, and 5; plan v1 D-4, D-6, D-8, D-9, D-13, PR-012, PR-201, SC-002,
  SC-008, SC-010; DR-0012 (the delegated-authority conditions the
  `decorrelated-review` clause enforces); T-001 (framing distinctness), T-002,
  T-004, and T-005 (the tuition promotion duty); constraints C-2 and C-3;
  **DR-0015** (the merge-authority duty as restated in step 2); **DR-0016**
  (`escalation-threshold` and `stalled-phase-response`, step 2b, with the
  measurement); **T-007** (`two-review-contracts`, step 2c, and the fifth
  distinctness dimension in step 3b); **T-008** (the three supervision clauses
  of step 4, D-M3-31, and the nine-hour-eleven-minute measurement they carry);
  **NEW at revision 3: T-009** (the `merge-is-not-complete-until` and
  `gate-result-is-scoped-to-its-run` clauses of criterion 5b, D-M3-36, and the
  four-hour-twenty-one-minute measurement they carry), **DR-0017** (the
  single-job workflow this phase edits), and D-M3-34 (both scripts registered
  as gate entries rather than raw workflow steps).
- conflicts-with: M3-P10 (files entry).
- blocked-by: M3-P8 merged.

### M3-P10: Release engineering, self-delivery exit run, and v0.1.0

- id: M3-P10
- branch: `claude/m3-p10-release-and-exit`
- intent: Make the package publishable and verifiably complete, gate the release
  on licenses, wire the fleet-home version pin the M1-P2 init left as a
  documented placeholder, then execute the M3 exit test of section 4 and publish
  v0.1.0.
- grounding: M3-P1 through M3-P9 merged with CI green on `main`. **DR-0008 is
  DECIDED (2026-08-05): public npmjs under the `@tiphys` scope,
  `@tiphys/kernel` and `@tiphys/claude-code-plugin`
  (`delivery/STATE.md` owner-decisions table).** Revision 1 recorded it as open
  and overdue in three places while its own risk 3 recorded it as decided, which
  is a contradiction revision 2 removes: section 6 item 1, section 7's table,
  and this line all now read decided, and the M3R-008 split fallback below is
  marked historical. Owner
  action A-7 (renumbered from A-4 at revision 3, A-003: publish credentials and
  the `@tiphys` scope claim) is the one
  remaining owner item and is elevated access the orchestrator does not hold,
  which DR-0016 keeps owner-reserved. The
  M1-P2 init writes a fleet `package.json` whose kernel dependency pin is
  "a documented placeholder until M3 first publish" (plan v1 M1-P2 step 2), and
  this is that moment. EXT-F-09 fixes the license gate's five checks.
  Blueprint section 13's M3 exit test, amended by DR-0008 and SC-011, is the
  procedure of section 4.
- hazard class (T-007, D-M3-32): **the one irreversible phase in the milestone,
  and the one whose failure is invisible until a consumer installs.** What can
  pass every criterion and still ship a broken package: a `files` list that
  packs every directory and omits one file inside one of them, so the pack
  listing looks right and a schema `$ref` fails to resolve from inside an
  installed tree; a license gate that inventories `dependencies` while the
  transitive production set is what actually ships; a release-verify script run
  from a directory that still has the source tree on its resolution path, so it
  witnesses the repository rather than the install; an exit-test evidence bundle
  that is internally consistent and records a claim that was false, which is the
  M1-P6 CR-680 shape exactly; a supervising intervention that filled a gap
  without either party noticing, which E0.3 exists for; and a publish that
  reaches the registry in a form nobody intended, which is the one action in
  this milestone with no clean undo.
  **Added at revision 3 (T-009):** a post-merge witness discharged from the
  already-green `pull_request` check on the source branch rather than from the
  `push` run on the new `main` tip, so the exit test certifies a `main` that
  may be red and the certification is not detectably wrong from inside the
  bundle.
  **One open question inside that last
  hazard, stated rather than asserted**: whether an unclaimed `@tiphys` scope
  refuses a publish or accepts it is a property of npmjs this plan has NOT
  executed. The implementer establishes it against the real registry before
  step 4's workflow can run, and records the command and its output, rather
  than reasoning about what npm will do.
- hazard class to criterion (section 2.6, NEW at revision 3):

| Hazard item | Reddens against |
|---|---|
| a `files` list that packs every DIRECTORY and omits one file inside one of them | criterion 3, which copies a template OUT OF THE INSTALLED PACKAGE and validates it against a schema copied from the same install, so a `$ref` that fails to resolve from inside an installed tree reddens. Criterion 2's listing assertion alone would not catch it, and the two are kept separate for that reason |
| a license gate that inventories `dependencies` while the TRANSITIVE production set is what ships | criterion 1b, both directions, including the vacuous-pass direction (removing `ajv` from the inventory logic must make the gate exit 0 over a tree that contains it, captured and reverted) |
| a release-verify script run from a directory that still has the SOURCE TREE on its resolution path | criterion 5, "from a clean directory with a clean cache", and criterion 3's temporary prefix. **Residue named at revision 3**: "clean" is a property of the environment the script is invoked in, not of the script, so a criterion cannot fully own it. Criterion 5 is strengthened below to require the evidence record to carry the RESOLVED path of the package under test, so the bundle shows which tree answered rather than asserting which one should have |
| an exit-test evidence bundle internally consistent that records a claim that was FALSE | stage E0.5's falsification controls, rewritten at revision 3 to cover three structurally different mechanisms instead of one, plus criterion 6's requirement that a control be present and FAILED at its declared stage. **The residue is real and section 4.5 carries it**: no bundle can certify its own truthfulness, which is why the controls exist and why section 4.5 now states which E1 mechanisms remain unwitnessed |
| a supervising INTERVENTION that filled a gap without either party noticing | stage E0.3's binding rule plus criterion 6's "no stage records a substituted or skipped step without the documented substitution marker". **Section 2.6 reason 1 applies to the unnoticed case by construction**: an intervention nobody noticed is not recorded, and no check over the record can see it. Section 4.5 item 1 carries it |
| a publish that reaches the registry in a form nobody intended | criteria 2, 3 and 4 before publication and criterion 5 after it. **Section 2.6 reason 2 applies to the irreversibility itself**: nothing checks a publish that has already happened, which is what makes the pre-publication criteria the whole defence and why the `@tiphys` scope behaviour is established against the real registry before step 4's workflow can run |
| a post-merge witness discharged from the `pull_request` check rather than the `push` run on the new `main` tip (T-009) | exit stage E3.1 as rewritten at revision 3, which names the event, requires the run's head sha to equal the new `main` tip, requires it observed TO COMPLETION, and records run id, event, head sha and conclusion as an evidence record; plus criterion 6, which requires that record to be present in the bundle |
- steps:
  1. Update `package.json`: name per DR-0008's outcome, `version` 0.1.0, remove
     `private`, and set `files` to exactly `dist`, `schemas`, `templates`,
     `roles`, `checklists`, `tuition`, `AGENTS.md`, `gate-registry.yaml`,
     `assurance-modes.yaml`, `role-model-config.yaml`, plus `LICENSE` and any
     notices. Verify the accumulated list against what the previous nine phases
     added rather than trusting this list.
  2. Create `scripts/license-gate.mjs` implementing EXT-F-09's five checks:
     inventory production dependencies **including the full TRANSITIVE
     production set of `ajv` 8.20.0 and `yaml` 2.9.0, which DR-0013 clause 5
     names as required inputs to this gate and which M3-P1 step 10c recorded at
     the moment the pins were taken**; the gate re-derives the inventory here
     and a difference from M3-P1's recorded set is a FINDING rather than a
     routine update, because a silently grown production tree between M3-P1 and
     M3-P10 is exactly the supply-chain surface DR-0013 marked the decision
     costly for. Then: check license metadata is present;
     reject unknown or explicitly prohibited licenses against a declared
     allowlist; verify `THIRD-PARTY-NOTICES` exists whenever copied third-party
     code is declared (D-1's license note: protocol reimplementation carries no
     notice obligation, so the declaration file drives this check); verify
     `LICENSE` and any required notices are present in the `npm pack` output.
     Wire into the gates workflow and into `prepublishOnly`.
  3. Extend `src/commands/init.ts` so a new fleet home's `package.json` depends
     on the published kernel name at a pinned version, replacing the M1-P2
     placeholder (verify the placeholder's exact shape first).
  4. Create `.github/workflows/release.yml`: a manually dispatched workflow that
     runs the gates, the license gate, `npm pack`, and publishes to the DR-0008
     registry using an owner-provided token; it never runs on push.
  5. Create `scripts/release-verify.sh <name> <version>`: from a clean temporary
     directory with a clean npm cache, `npm install <name>@<version>`, then
     import the package and run its bin, recording every command and exit code
     as JSON evidence records (SC-011's kernel analogue of deploy verification).
  6. Execute section 4's exit test and commit its evidence bundle to
     `delivery/evidence/m3-exit-test/` through a pull request.
- files-to-touch: `scripts/license-gate.mjs`, `scripts/release-verify.sh`,
  `.github/workflows/release.yml`, `THIRD-PARTY-NOTICES` (create only if a
  declaration requires it), `test/license-gate.test.ts` (create);
  `package.json` (edit), `src/commands/init.ts` (edit),
  `test/init.test.ts` (edit), `.github/workflows/gates.yml` (edit),
  `gate-registry.yaml` (edit, ADDED at revision 3: the license gate is a
  registry entry with `events: [pull_request, push]` rather than a raw workflow
  step, section 2.2a and D-M3-34. The RELEASE workflow's own steps stay in
  `.github/workflows/release.yml` and are deliberately workflow-level, because
  they run on a tag event the gate bundle never sees; this phase states that
  reason rather than leaving it implicit, which is what D-M3-34 requires of any
  check that stays at workflow level),
  `delivery/evidence/m3-exit-test/` (a DIRECTORY entry, ADDED at revision 3,
  A-013).
  **Why the evidence directory has to be declared, and it is not a formality.**
  Section 4 requires two artifacts under it and neither was on any list:
  `supervision-rules.md`, which stage E0.2 requires to exist BEFORE the run and
  whose commit E0.5 requires to PRECEDE the first E1 evidence record; and the
  full bundle, which E4.4 commits through a pull request. The scope audit is a
  hard phase-completion condition and an undeclared path is a red gate, not a
  warning. That bites the supervision file specifically: its whole value is the
  commit ORDERING E0.5 asserts, so discovering the declaration gap after a
  scope audit rejects the file, and re-committing it afterwards, destroys the
  property the file exists to have. M2-P9 hit exactly this shape and declared
  `delivery/evidence/m2-exit-test/` in its `declaredExtras`; this phase has
  strictly more evidence to commit.
  **Where each lands, stated because E0.2 and E4.4 pull in opposite
  directions.** `supervision-rules.md` is committed to `main` in the SAME
  pre-dispatch pull request as section 3.0's ten phase declarations, before the
  M3-P10 branch is created, because E0.2 requires it to exist before the run
  and E0.5 requires its commit to precede the first E1 record; a file committed
  on the phase branch would have its ordering entangled with the run it is
  supposed to bound. The BUNDLE is committed on the phase branch and reaches
  `main` through M3-P10's own pull request per E4.4. Both sit under
  `delivery/evidence/m3-exit-test/`, so the one directory entry in
  `declaredExtras` covers the bundle, and the pre-dispatch commit needs no
  declaration at all, being a commit to `main` rather than a phase diff.
- acceptance criteria:
  1. `node scripts/license-gate.mjs` exits 0 on the repository as shipped; with
     a fixture dependency tree containing a package whose `license` field is
     absent it exits nonzero naming the package; with one whose license is
     outside the allowlist it exits nonzero naming the license; with a
     third-party-code declaration present and `THIRD-PARTY-NOTICES` absent it
     exits nonzero (four directions, each witnessed).
  1b. **The two production dependencies and their transitive set are in the
     inventory (DR-0013 clause 5, criterion 14 of M3-P1's validator block),
     both directions.** The gate's inventory output names `ajv` at 8.20.0,
     `yaml` at 2.9.0, and every transitive production dependency of both with
     each one's license; a registered test compares that set against the one
     M3-P1's work history recorded and exits nonzero naming any package present
     in one and absent from the other. Removing `ajv` from the inventory logic
     makes the gate exit 0 over a tree that contains it, which is the vacuous
     pass this criterion exists to catch, and is captured and reverted.
  2. `npm pack` produces a tarball whose listing contains every path in the
     `files` list including `AGENTS.md`, `roles/`, `schemas/`, `checklists/`,
     `templates/`, `tuition/`, `gate-registry.yaml`, `assurance-modes.yaml`,
     `role-model-config.yaml`, and `dist/`, and contains no `delivery/`,
     `test/`, `sandbox/`, or `src/` entry (asserted by listing the tarball, both
     the presence and the absence halves).
  3. Installing that tarball into a temporary prefix exits 0; running the
     installed `tiphys version` through that prefix prints `0.1.0`; and
     `tiphys validate --type plan <a template copied out of the installed
     package>` exits 0, which witnesses that the shipped schemas resolve from an
     installed package and not only from the source tree (this is the failure
     mode that would make every M3 artifact invisible to a real consumer).
  4. `tiphys init <fresh dir>` writes a fleet `package.json` whose dependency is
     the published name at the pinned version, and `npm install` in that fleet
     home exits 0 against the published package (run after publication, recorded
     in the exit evidence; before publication the same assertion runs against
     the local tarball).
  5. `scripts/release-verify.sh <name> 0.1.0` exits 0 from a clean directory
     with a clean cache and emits one JSON evidence record per command with its
     exit code (SC-011). **Each record also carries the RESOLVED path of the
     package under test (NEW at revision 3), so the bundle shows which tree
     answered rather than asserting which one should have.** A record whose
     resolved path lies inside the repository working tree rather than inside
     the temporary install prefix fails the criterion, witnessed both
     directions by running the script once from the repository root (must fail,
     naming the resolved path) and once from the clean directory (must pass).
     This is the falsifiable half of "clean", which is otherwise a property of
     the invoking environment that no assertion inside the script can reach.
  6. Section 4's exit test passes with its evidence bundle committed, and the
     bundle validates: every stage has its records, the AUTHORIZATION artifact
     of stage E2 is present (the dual cross-model clean review with
     `check-dual-review.mjs`'s exit-0 record, not an owner approval; corrected
     at revision 2 under DR-0015), the falsification control of stage E0.5 is
     present and FAILED at its declared stage, and no stage records a
     substituted or skipped step without the documented substitution marker.
     **Extended at revision 3, three ways.** (a) ALL THREE of stage E0.5's
     falsification controls are present and each FAILED at its own declared
     stage, not one of the three; a bundle carrying one control and a claim
     about "the stages" is the one-witness-is-not-a-class shape section 2.3
     rule 6 forbids everywhere else. (b) Stage E3.1's post-merge record is
     present and carries the run id, the EVENT (`push`), the head sha, and the
     conclusion, and the head sha in that record equals the merge commit sha
     recorded beside it, compared as strings rather than asserted to match
     (T-009). (c) The bundle carries section 4.5's explicit list of which E1
     mechanisms the controls do and do not cover, so the exit test's own
     coverage claim is bounded inside the artifact rather than only in this
     plan.
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; earlier
     mappings still resolve.
- new behaviors: `license-gate-missing-metadata`,
  `license-gate-prohibited-license`, `license-gate-missing-notices`,
  `pack-contains-kernel-artifacts`, `pack-excludes-delivery-and-tests`,
  `installed-package-schemas-resolve`, `init-writes-kernel-pin`,
  and NEW at revision 2: `license-gate-covers-runtime-dependency-tree`.
- suggested model tier: strongest for the release procedure and the exit run
  (irreversible: a published name and version cannot be unpublished cleanly),
  cheaper tier acceptable for the license gate script.
- substrate (DR-0007): this is the one M3 phase that is not substrate-neutral.
  Publication needs network access and an owner-provided credential, and the
  exit run needs a fleet home on whichever substrate it is executed from. The
  evidence records which substrate ran it, and section 4 states what that does
  and does not witness.
- citations: SC-006, SC-011, SC-012, DR-0008; EXT-F-09; plan v1 D-1 (license
  note), D-17 (prepack builds), M1-P2 step 2 (the fleet pin placeholder);
  blueprint section 3 (npm spine, pin is the upgrade) and section 13 (M3 exit
  test).
- conflicts-with: none remaining (last M3 phase).
- blocked-by: M3-P9 merged; **owner action A-7, renumbered from A-4 at revision
  3 (A-003; the act is "provide npmjs publish credentials and claim the
  `@tiphys` scope", named here as well as numbered so a stale id is still
  readable)**, which is elevated access the orchestrator does not
  hold. **DR-0008 is DECIDED (2026-08-05) and is no longer a blocker.**
  **The exit-run approval action was REMOVED at revision 2**: DR-0015 states in
  terms that "approve the exit run's pull request" is not an owner action, and
  revision 1 carried it anyway. Section 4 stage E2 is rewritten to match; the
  mechanism is kept and the signatory changes. **Revision 3 withdraws revision
  2's further claim that the id `A-3` was thereby retired**: `A-3` in the shared
  `A-n` namespace is M2's outstanding scoped-implementer-token action and is the
  literal string `implementer-token-present-owner-action-a-3` inside
  `gates.manifest.json` on `main`, so this plan never held it and cannot retire
  it. See section 7.
- **HISTORICAL, superseded 2026-08-05**: fallback if DR-0008 is still open at dispatch (M3R-008). DR-0008 was decided
  on 2026-08-05 (public npmjs under `@tiphys`), so this split never became
  operative and is kept only as the record of what was planned against the risk.
  It is not an instruction. Read as history: this phase splits at
  step 5. Steps 1 to 5 dispatch as `M3-P10a`, branch
  `claude/m3-p10a-release-engineering`, carrying the license gate, the `files`
  completeness assertions, `release-verify.sh` run against a locally packed
  tarball, and the `tiphys init` pin written against the working-assumption name
  `@tiphys/kernel`; every one of criteria 1 to 3 is witnessable without a
  registry, and criterion 4's published-package half is deferred with a recorded
  reason. Step 6 and section 4 stage E4 do not dispatch: they become `M3-P10b`,
  which stays blocked. Section 4 stages E1 to E3 may still run, because nothing
  in the full-mode delivery of the subject change touches a registry. What the
  split cannot rescue: the milestone does not exit, because the exit test's E4
  is half of what blueprint section 13 asks for. The split buys work, not
  completion, and the plan says so rather than implying a package name can be
  chosen late for free (published names are permanent, which is why DR-0008 is
  marked costly).

---

## 4. M3 exit test

Blueprint section 13's M3 row, amended by DR-0008 and SC-011: "one kernel change
delivered end to end through the kernel's own full mode; release v0.1.0 to the
registry decided in DR-0008", plus the release-verification analogue. This
section makes that concrete and executable. It is staged like the M1 exit test
(EXT-F-04): automated witnesses either side of a recorded authorization,
because an authorization is not a script step and pretending otherwise is how a
"deterministic" exit test acquires a step nobody can re-run.

**Revision 2 changes who signs that authorization and adds one stage.** DR-0015
removes the owner from the merge path INCLUDING at milestone boundaries, so
stage E2's signatory is dual cross-model clean review rather than the owner, and
owner action A-3 is removed. The MECHANISM is deliberately kept, and DR-0015
records why in the owner's own terms: stage B exists in the blueprint as more
than a rubber stamp, because it is the one place the exit test witnesses that
the kernel can hand control to an external decision it does not produce, sit
inert while nothing of its own is running, and resume correctly afterwards. Keep
the mechanism, change who signs. Section 4.5 records what is genuinely lost,
which is that nobody witnesses a wait measured in days. Stage E0.5 is new and
comes from the M1 exit test's own shape rather than from a decision: the M1 run
passed with a FALSIFICATION CONTROL, the same harness against a known-bad state,
exiting 1 at step C2, which is what made its pass a measurement rather than an
absence of failure. Section 4 did not require one; it does now.

The run is the controlled exception settled decision 6 authorizes (SC-013): the
kernel's own full mode drives one change, under current-process supervision.

### 4.0 Preconditions (stage E0, all recorded before anything runs)

E0.1. M3-P1 through M3-P10's non-exit steps are merged, and for EACH of those
merges the `push`-event `gates` run whose head sha is the resulting `main` tip
was observed to completion and was green, with run id, event, head sha and
conclusion recorded (T-009; "CI is green on `main`", which is what revision 2
wrote here, is not a complete sentence and is corrected at revision 3 in the
same terms as E3.1). The clause-map check exits 0 over all 74 rows of Appendix
A, with the row inventory taken from Appendix A and the coverage table from
`delivery/requirements/clause-map.json` as two separate sources (section 2.2),
so "exits 0 over all 74 rows" is a statement about the inventory and not about
whatever the map happened to contain.

E0.2. The supervision rules for the exception exist as a committed file,
`delivery/evidence/m3-exit-test/supervision-rules.md`, written before the run
starts (plan v1 section 6 names this as a key risk: "the self-delivery exit run
needs explicit supervision rules written before it starts"). It must state, per
current-process safeguard, whether it remains active during the run, and it must
declare the binding rule below.

E0.3. Binding rule on the exception, stated here so it cannot be softened during
the run: every intervention by the supervising current process is recorded in
the evidence bundle with what was done and why. An intervention that substitutes
for a kernel artifact (a human writing the brief the kernel failed to compose, a
human running a gate the registry did not select, a human applying a review
finding the verdict schema rejected) is an exit-test failure, not a footnote.
Interventions that only observe, or that stop the run, are not failures.

E0.4. The subject change is designated before the run and satisfies all of:
in scope for the kernel, genuinely wanted, small enough for one phase, touching
at most three source files, requiring no owner decision, and carrying at least
one behavior that can be demonstrated red without it. Designated subject: add a
`kernel-artifacts` check to `tiphys doctor` that FAILs when the resolved kernel
package is missing any of `roles/`, `schemas/`, `checklists/`, or `AGENTS.md`,
promoted to FAIL under the `full` profile. It is wanted (M3 has just made those
directories load-bearing and nothing checks that an installed kernel actually
carries them), small, and red-witnessable by removing a directory from a staged
install. If it is already built by the time the run happens, the fallback rule
is: the orchestrator designates the smallest item from the M5 deferral list in
`delivery/STATE.md` that meets every criterion above, and records the
designation and the reason in the evidence bundle before stage E1 begins.

E0.5. **A falsification control is defined before the run and executed after it
(NEW at revision 2, from the M1 exit test's delivered shape).** The M1 run's
pass is a measurement rather than an absence of failure because the same harness
was run against a known-bad state and exited 1 at step C2, and that control is
in `delivery/verification/m1-exit-test-evidence.md`. Section 4 as revision 1
wrote it required no such thing, which means a stage that silently did nothing
would have been indistinguishable from a stage that passed. **THREE controls, not one, and revision 3 is where that changes.** Revision 2
defined a single control (one shipped schema keyword removed) and then claimed
of it, in the plural and unqualified, that a control which passes means "the
stages are not measuring what they claim". Stage E1 spans roughly fifteen
assurance mechanisms of at least four structurally different KINDS that this
plan itself insists are different: Kind A schema validation (E1.1, E1.4), Kind
B cross-document derived checks (E1.7), a real external-program gate (the M2
gate runner and the red-witness harness at E1.6), and a prose-and-judgment
mechanism (the two review CONTRACTS at E1.7, which M3-P6, M3-P7 and M3-P9 spend
most of their machinery on). A schema-keyword control exercises the FIRST KIND
ONLY. Standing one witness in for a heterogeneous plural claim is the exact
"one witness is not a class" failure section 2.3 rule 6 polices in every other
artifact this milestone ships, applied to the exit test itself.

So the exit test carries three controls, chosen so that each reaches a
different kind, and each names the stage at which the run must fail:

- **C1, Kind A (schema validation).** Re-run the E1 sequence with ONE shipped
  schema keyword removed, so an instance the run validated is now accepted
  where it was rejected. Expected failure stage: **E1.1**, the charter
  validation, whose own negative half (a charter with `escalation-contract`
  removed) must stop exiting nonzero.
- **C2, Kind B (a cross-document derived check actually running).** Re-run the
  E1 sequence with one Kind B check DEREGISTERED from `src/checks.ts`, namely
  `verdict-criteria-complete`, and with a verdict fixture whose `criteria[]`
  omits one of the phase's acceptance ids. Expected failure stage: **E1.7**,
  where `tiphys validate --type verdict --context <plan dir>` must stop exiting
  0 on the deficient verdict. This reaches what C1 cannot: whether the derived
  checks are INVOKED with `--context` during the real run rather than skipped.
- **C3, the review-contract distinctness mechanism (prose and judgment).**
  Re-run E1.7 dispatching BOTH review contracts with
  `--review-contract criteria`, everything else unchanged. Expected failure
  stage: **E1.7**, where `node scripts/check-dual-review.mjs` must exit nonzero
  naming the shared `review-contract` value. This reaches the one property
  T-007 exists for, that two DIFFERENT questions were actually asked, and it is
  the property no schema-keyword control can see. It also catches a defect the
  revision-2 control set was blind to: a `check-dual-review.mjs` invocation
  whose exit code is captured into the bundle but is not gating anything (a
  `|| true`, or evidence recorded from a run made after the fact rather than
  from the one that produced the merge), because under C3 the script MUST turn
  the run red and a non-gating invocation will not.

**A control that PASSES is an exit-test failure**, per control, at its own
declared stage. Passing at the WRONG stage is also a failure, because a control
that fails somewhere else has not exercised the mechanism it was defined for.

**What the three controls still do NOT witness, stated here rather than left to
be inferred, because a control set with an unstated boundary reads as
complete.** No control covers: E1.2's fleet and lock behaviour (M1 machinery,
witnessed by the M1 exit test and not re-witnessed here); E1.3's
stage-list-to-evidence mapping, whose failure is a missing record rather than a
wrong one; E1.5's "findings were applied to the plan", which is witnessed as a
state change in the plan file and has no control; E1.6's mechanism-index
consultation, which is a work-history claim and not a machine check; E1.8's
fix-round-verification stage, which is not-applicable on an APPROVE run and so
may not execute at all; and the release stages E4.1 to E4.3, which run once and
irreversibly. E1.9's and E1.10's validation are the same Kind A mechanism C1
stands for and are covered BY KIND rather than by instance, which is a weaker
statement than being covered and is written as the weaker statement. Section
4.5 repeats this list, so the bound travels with the bundle rather than only
with the plan.

The three controls' definitions and their expected failure stages are written
into `delivery/evidence/m3-exit-test/supervision-rules.md` BEFORE stage E1
begins, and the file's commit precedes the first E1 evidence record, which is
the checkable form of "not chosen after seeing which stages turned out to be
weak". The commit ordering is asserted from the bundle rather than promised.

### 4.1 Stage E1: full-mode delivery of the subject change (automated witnesses)

Each step records command, exit code, and output as a JSON evidence record.

E1.1. Charter: a kernel charter instance is authored and
`tiphys validate --type charter` exits 0; it declares `delivery-mode: full` and
a kernel version pin. A copy with the `escalation-contract` removed exits
nonzero, recorded, so the run witnesses that validation is live and not
ceremonial.

E1.2. Fleet: `tiphys init <fresh dir>` exits 0; `tiphys doctor --for full`
exits 0 with no FAIL lines; `tiphys lock acquire` exits 0 and
`TIPHYS_HOLDER_ID` is exported for the mutating steps.

E1.3. Mode resolution: `tiphys mode show --mode full` exits 0 and its stage list
is captured; every subsequent stage of this run maps to one of those stage ids,
and the mapping is part of the evidence. A stage executed that is not in the
list, or a listed stage with no evidence record, fails the exit test.

E1.4. Plan: a plan instance for the subject change is authored by an agent
composed from `roles/plan-writer.md` via `tiphys brief compose`;
`tiphys validate --type plan` exits 0; the M2-P5 citation linter exits 0 over
it; the M2-P6 coverage checker exits 0 with no orphans.

E1.5. Adversarial plan review: an agent composed from
`roles/adversarial-plan-reviewer.md` with `checklists/plan-review.yaml`
produces a finding set; `tiphys validate --type finding-set` exits 0; the
findings are applied to the plan and the amended plan re-validates (R-030's duty
witnessed as a state change in the plan file, not as an assertion).

E1.6. Implementation: `tiphys spawn` runs an implementer composed from
`roles/implementer.md` in a pool worktree; the composed brief names
`tuition/mechanism-index.yaml` and the implementer's work history records, per
the `mechanism-lookup` clause, which mechanisms it used and what the index said
about each, including "no entry" where that is the answer (T-005, M3R-003); the
change lands with its tests; the M2 gate runner over
`gate-registry.yaml --mode full` exits 0 with no gate green whose precondition
is unmet. **The expected-status table is DR-0018's, corrected at revision 3**:
a required DIFF-SCOPED gate whose trigger the exit head does not touch is
expected `not-applicable` with its precondition id and evaluation recorded, not
`green`, and the runner treats an unexplained required not-applicable as a
failure (exit 20). So the assertion is that every non-diff-scoped required gate
is green with `units` greater than zero, every diff-scoped gate is green or
not-applicable with a recorded reason, zero `error`, zero `vacuous`, and
recomputed counts equal `summary.json`. **The designated subject change touches
`src/commands/doctor.ts`, so `red-witness` IS triggered on this head and must
be green rather than not-applicable**, stated because a not-applicable there
would be the vacuous pass this exit test exists to refuse, and because the
fallback subject rule of E0.4 could designate a change that does not touch
`src/`, in which case the designation record must say so and E1.6 expects
not-applicable-with-a-reason instead. The M2-P2 red-witness harness's DURABLE
SPEC for the new behavior (`witness/<behavior-id>.json`, with at least one
`dangerousStates[]` member) and the run's `witness-records.json` are both in
the bundle; **corrected at revision 3 from "its evidence file", singular, which
names only the second and would be satisfied by a run with no committed spec
behind it.** M3's own registered checks (section 2.2a) run inside this same
bundle, which is what makes this stage a claim about the milestone's own checks
and not only about M2's.

E1.7. Clean-room review: an agent composed from `roles/clean-room-reviewer.md`
with `checklists/clean-room.yaml` resolved through
`tiphys checklist resolve` (including at least one injected per-phase probe,
R-054) produces a verdict; `tiphys validate --type verdict --context <plan dir>`
exits 0, which runs `verdict-criteria-complete`, `verdict-deviations-judged`
and, NEW at revision 2, `verdict-hazard-classes-addressed`
against the plan phase and the work history. **Two review CONTRACTS run, not
merely two reviewers (T-007, and `full` mode's `review-contracts[]` from M3-P3
step 2b)**: one composed with `--review-contract criteria` against
`checklists/clean-room.yaml`, one with `--review-contract hazard` against
`checklists/hazard-review.yaml`, the second given the phase's declared
`hazard-classes[]` as its starting question. They also run on different model
families and with different `--framing` values, and
`node scripts/check-dual-review.mjs` exits 0 over the pair (M3R-004); a run that
produces one review, or two sharing a family, a framing, or a contract, fails
the exit test rather than being noted. The contract dimension is separate from
the family dimension and both are checked, because T-007 records two verdicts on
one head from two families agreeing on every mechanical fact while one missed a
high-severity defect the criteria did not describe.

E1.8. If the verdict is FIX-ROUND-NEEDED: the fix round runs, and the
`fix-round-verification` stage that `full` mode requires (T-003) runs after it
and produces its own validated report. A run whose fix round skips that stage
fails the exit test. If the verdict is APPROVE with no findings, the stage is
recorded as not-applicable with the verdict as evidence.

E1.9. Reporting: the phase work history validates against
`schemas/work-history.schema.json`; the final report validates against
`schemas/final-report.schema.json`; the M2-P6 coverage checker in
finding-to-outcome parity mode exits 0 over it.

E1.10. Status: the status records emitted during the run validate against
`schemas/status-line.schema.json`, and `tiphys status show` reports the current
state from `current.json` (C-1).

### 4.2 Stage E2: authorization (recorded, not scripted)

**Rewritten at revision 2 under DR-0015.** Revision 1's title was "owner
authorization" and its E2.1 required the owner's approving review, citing
DR-0012's milestone-boundary carve-out. DR-0015 supersedes that carve-out
explicitly and names this plan's owner action A-3 as removed. The stage
survives, and DR-0015 records why in the owner's terms: it is the one place the
exit test witnesses that the kernel can hand control to an external decision it
does not produce, sit inert while nothing of its own is running, and resume from
the artifact afterwards. **Keep the mechanism, change who signs.**

E2.1. The authorization artifact is the dual cross-model clean review of
DR-0012's definition of clean, captured into the bundle: two verdicts on the
exact head, distinct `produced-by` model families, distinct `framing` values,
distinct `review-contract` values (one `criteria`, one `hazard`, T-007), no
unresolved high or medium finding, CI green on that head, and the scope audit
passing. `scripts/check-dual-review.mjs` exits 0 over the pair and its record is
the bundle's evidence that the reviews were decorrelated rather than declared to
be. The orchestrator then merges with a squash merge, as release manager (D-6).
**The absence of a valid authorization artifact is an exit-test failure**, which
is unchanged from revision 1; what changed is what makes it valid.

E2.2. **The wait is the review pipeline's wall time and the lease is sized for
it (DR-0015, CR-608, option 1 as adopted).** The certification run acquires its
lease with an EXPLICIT duration covering the whole authorization window rather
than relying on the 900-second default, and the observed lease state is recorded
in the bundle either way, so a lapse is reported rather than silent. DR-0015
notes this is a MORE binding requirement than the version it replaces, not less:
a human might have answered in two minutes, whereas the measured review pipeline
is not fast. Measured in DR-0015's own session rather than guessed: a single
clean-room review of a code phase ran between 24 and 45 minutes, two ran
concurrently, and a phase needing a fix round took hours end to end. A
900-second lease covers none of that, and `checkHoldership` fails closed on an
expired lease, so an overrun makes the run FAIL rather than pass unsafely.

E2.3. **Exit-test evidence goes to the owner unasked (DR-0015, unchanged and
restated because it is the half that survived).** The milestone does not start
M4 before that evidence is presented. Presenting evidence is a reporting
obligation, not a click, and this stage does not wait on the owner for it.

### 4.3 Stage E3: post-merge witnesses

E3.1. **The post-merge run, named by EVENT and by HEAD SHA (rewritten at
revision 3 under T-009, which postdates revision 2).** Revision 2 read: "The
squash commit is on `main`; CI is green on `main`; the merged SHA is recorded."
That is the exact incomplete sentence T-009 was written to ban. The `gates`
workflow fires on two events and runs DIFFERENT bundles per event
(`pull_request` runs `--bundle pr` with `--base`, `--head` and `--phase`; a
push to `main` runs `--bundle main` with none of the three), so "CI is green"
without an event name and a head sha is not a claim about anything. The old
wording is satisfiable by looking at the already-green `pull_request` check on
the merged branch, which is precisely the substitution that left `main` red for
four hours and twenty-one minutes across five consecutive runs while four more
pull requests were merged on top of it, and which the owner surfaced rather
than the process.

The criterion is:

1. The squash commit is on `main`, and its sha is recorded.
2. The `gates` workflow run whose EVENT is `push` and whose HEAD SHA equals
   that sha is identified. The two shas are compared as strings in the
   evidence record, not asserted to be the same.
3. That run is OBSERVED TO COMPLETION and its conclusion is `success`. Observed
   with the same watchdog discipline T-008 requires: a run still in progress is
   not a green run, and an absent conclusion is not a green conclusion.
4. The run id, the event, the head sha and the conclusion are written into the
   bundle as one evidence record.
5. **A `pull_request`-event check on the source branch does NOT discharge this,
   stated as a prohibition rather than left to inference**, because the failure
   mode is that the two are both real green runs on related shas and the wrong
   one is read.

If the run is red, the milestone does not close. The phase is not complete at
merge; it is complete when the run whose head sha is the new tip has finished
green.

E3.1b. **Both arms of any behaviour that forks on the CI event have a witness
(T-009's second rule, new at revision 3).** M3 adds checks to the gate registry
with a declared `events[]` (section 2.2a), and for any check whose `events[]`
names only one arm, the bundle records WHY that arm and records the observed
result on the other arm being not-run rather than green. One witnessed arm and
one unwitnessed arm is the shape that broke here, and the unwitnessed one is
the one that broke.

E3.2. `tiphys teardown --task <id>` exits 0, the worktree is removed, and the
task meta status is `closed`. `tiphys lock release` exits 0.

E3.3. `tiphys tuition list` is run and any failure mode the run produced is
recorded as a tuition entry before the bundle is closed (R-091's flow exercised
by the run that would otherwise be the first to skip it).

### 4.4 Stage E4: release and release verification

E4.1. `node scripts/license-gate.mjs` exits 0.

E4.2. The release workflow publishes `<name>@0.1.0` to the registry DR-0008
decided; the publish output and the registry's returned version are recorded.

E4.3. `scripts/release-verify.sh <name> 0.1.0` exits 0 from a clean directory
with a clean cache: `npm install` exits 0, a module import of the package
resolves, the installed bin prints `0.1.0`, and a schema copied out of the
installed package validates a template copied out of the same install (SC-011's
kernel analogue: the published package installs and imports at the released
version).

E4.4. The evidence bundle is committed to `delivery/evidence/m3-exit-test/`
through a pull request. M4 may not start before that commit is on `main`.

### 4.5 What this exit test proves, and what it does not

Proves: the M3 artifact set is internally consistent and machine-validated end
to end on one real change; every stage `full` mode declares was executed and has
an evidence record; the mechanism index was consulted by the implementer and the
consultation is in the work history; the two reviews were decorrelated by a
check with an exit code rather than by assertion; the kernel's own briefs compose, its checklists resolve, its
schemas accept the artifacts the roles produced and rejected at least one
deliberately invalid instance; the published package installs from a clean
environment and its shipped schemas and templates resolve from inside the
installed tree; the license gate runs before publication.
**Revision 2 adds three to the proves-list.** The kernel can hand control to an
external authorization it does not produce, sit inert, and resume from the
artifact (stage E2, the property DR-0015 kept when it changed the signatory).
The exit test measures rather than merely passes, because stage E0.5's
falsification controls fail and each names its failure stage. And the two review
contracts of `full` mode were both run and both recorded, which is T-007's
property witnessed once rather than asserted.
**Revision 3 narrows the second of those three and adds one.** The
measures-rather-than-passes claim is now bounded: THREE controls run, reaching
Kind A schema validation, Kind B derived-check invocation, and review-contract
distinctness, and stage E0.5 lists by name the E1 stages no control reaches
(E1.2, E1.3, E1.5, E1.6's mechanism-index claim, E1.8, and the release stages),
with E1.9 and E1.10 covered by KIND rather than by instance. Revision 2's
version of this sentence stood one control in for "the stages", plural and
unqualified, which is the shape section 2.3 rule 6 forbids. The addition: the
post-merge state of `main` is witnessed on the run that actually governs it,
the `push`-event run whose head sha is the new tip, observed to completion
(E3.1, T-009), rather than on a `pull_request` check that is green about a
different configuration.

Does not prove, and these are recorded rather than assumed away:

1. Unsupervised operation. The run is supervised by the current process by
   design (SC-013). Interventions are recorded, which bounds the doubt; it does
   not remove it. **And the bound is only over interventions somebody noticed**:
   an intervention that filled a gap without either party noticing is not
   recorded, and no check over the record can see it (M3-P10's hazard class
   names this, and section 2.6 reason 1 is why no criterion covers it).
2. Judgment quality. Every criterion above checks that a role's output validates
   and that a stage ran. None of them checks that the plan was good, the review
   was searching, or the probes were the right probes. That is the standing
   limit of a layer-2 milestone, and it is why M4's pilot is the real test.
3. n equals one. One change, one shape (a small additive kernel change), one
   mode. Nothing about a large change, a change with migrations, a change to a
   project rather than the kernel, or a change that fails its review is
   witnessed.
4. The other two assurance modes. `direct-pr` and `local-only` are validated
   data and are never executed in M3 (section 3, M3-P3 scope note).
5. The harness adapter. No Claude Code plugin, no hooks, no window or
   cloud-session executor adapter: all M4 (plan v1 section 7).
6. Multi-environment fleet lifecycle. Unchanged from plan v1's PR-201 split: the
   cloud fleet resume story is specified in `AGENTS.md` by M3-P9 and executed by
   M4.
7. Parallelism. DR-0011 permits provably disjoint concurrent work, and this
   milestone uses it for at most one phase pair (D-M3-19); the M5 machinery that
   makes parallelism safe at scale, the conflict pre-pass and the merge-time
   witness gate, is not built here. The plan schema's `conflicts-with` and
   `parallelizable` fields are recorded and validated, never load-bearing.
8. Registry portability. The release is verified against the one registry
   DR-0008 chose, from one environment.
9. **A long authorization wait (NEW at revision 2, DR-0015's own honest
   residual).** With the owner out of the path, the authorization window is the
   review pipeline's wall time, measured in tens of minutes to hours. Nobody
   witnesses a wait measured in DAYS, which is the case an inert kernel would be
   most likely to fail. DR-0015 records this as what is genuinely lost by the
   change, and it is copied here rather than left in the decision record,
   because a not-proven list that omits a known gap is the vacuous-pass shape
   this plan spends section 2.3 preventing.
10. **Supervision under real load (NEW at revision 2, T-008).** M3 ships the
   dispatch contract as clause text and as an orchestrator duty, and the exit
   run executes it once, on one change, with one orchestrator paying attention
   to one thing. T-008's measurement is that the failure happened to a competent
   orchestrator, holding the design, having stated the rule aloud that morning,
   supervising only TWO agents, while busy with real work. Nothing in this exit
   test reproduces the busy condition, so what is witnessed is that the clauses
   exist and were followed once, never that they survive the state in which they
   are needed. That is the standing limit of a layer-2 milestone and it is why
   M4's pilot is the real test of this specific property, not only of judgment.
11b. **What the falsification controls do not reach (NEW at revision 3, and
   repeated here from stage E0.5 so the bound travels with the bundle).** Three
   controls run and each names its expected failure stage, which is three more
   than a run with none and two more than revision 2 defined. They do not
   witness E1.2's fleet and lock behaviour, E1.3's stage-to-evidence mapping,
   E1.5's application of findings to the plan, E1.6's mechanism-index
   consultation, E1.8's fix-round-verification stage (which is not-applicable
   on an APPROVE run and may not execute at all), or the release stages E4.1 to
   E4.3, which run once and irreversibly. E1.9 and E1.10 are the same Kind A
   mechanism control C1 stands for and are covered BY KIND rather than by
   instance, which is weaker than being covered and is written as the weaker
   statement. An exit test whose control set has an unstated boundary reads as
   complete, and that is the vacuous-pass shape one level up from the one
   section 2.3 exists to prevent.
12. **The claim classes the record contract newly covers (NEW at revision 2,
   T-006).** M3-P4 makes an impossibility, coverage or remedy claim
   unrepresentable without an executed construction, and M3-P7 adds probes that
   hunt them. The exit run produces one work history and two verdicts. Whether
   the contract actually stops a false claim is a property of many records over
   many phases, and one run cannot show it. What the run witnesses is that an
   honest record validates and that a fixture missing its construction is
   rejected, which is a property of the schema and not of the practice.

---

## 5. Decisions taken in this plan (flag if you disagree)

A fresh series, labelled D-M3-nn, so it never collides with plan v1's D-1 to
D-19, which remain in force unchanged.

- D-M3-01: M3 is ten phases in the order P1 to P10, sequential except as
  D-M3-19 allows, and the eight
  migration-walk phases (P2 to P9) are ordered by consumption: an artifact is
  built after the artifact it reads from. That is why the gate registry and the
  assurance modes precede the briefs (the implementer brief renders its gate
  list from the registry), and why `AGENTS.md` is last of the artifact phases
  (it references all of them).
- D-M3-02: The role-brief family is split into two phases (P5 authoring roles,
  P6 delivery roles) because twenty rows in one phase is the catch-all shape
  EXT-F-07 forbids. This exceeds EXT-F-07's minimum of six subphases, which the
  finding permits ("at least").
- D-M3-03: Where a requirement row has both a machine-checkable form (schema,
  template, registry entry) and a prose form (brief clause, policy line), the
  phase that owns the machine-checkable artifact owns the row, and the prose
  phase cites it. Applied to R-035 (work-history contract in P4, implementer
  brief cites it) and R-054 (checklist extension mechanism in P7, `AGENTS.md`
  duty cites it). Exception where an owner decision already fixed the artifact:
  R-002 stays in P9 because D-9 decided it as an `AGENTS.md` clause.
- D-M3-04: The clause map (section 2.2) is the per-subphase orphan check
  EXT-F-07 requires. It is a new repository-level script rather than an
  extension of the M2-P6 coverage checker, so that no M3 phase has to edit a
  merged M2 gate. Merging them later is recorded as an option, not a debt.
- D-M3-05 (vetoable): the plan, charter, decision-record, report, work-history,
  and tuition artifacts are YAML with prose-bearing fields as block scalars, per
  DR-0006's structured-first rule and the reasons in section 1.5. This is
  vetoable because the charter is the owner's own writing surface and the owner
  is the person who has to live with hand-authoring YAML. If vetoed for the
  charter specifically, the fallback is markdown with YAML frontmatter for the
  charter alone, with the reason recorded as "the artifact is authored by hand
  by the owner and its dominant content is the product-intent page", and every
  other type stays structured.
- D-M3-06: role briefs, `AGENTS.md`, and the fleet warnings template are the
  only markdown artifacts M3 ships, each with the reason recorded in section
  1.5. Checklists are YAML, against the intuition that a checklist is prose,
  because a probe list is a list of identified questions and structuring it is
  what makes injection, merging, and orphan checking possible.
- D-M3-07: R-016's "one markdown file" is discharged as "one file", with the
  format decided by DR-0006. The commit-position check remains parked exactly as
  plan v1 section 11 item 8 parked it; this plan does not revive it.
- D-M3-08: prose artifacts get falsifiable acceptance criteria through clause
  ids: every brief and `AGENTS.md` carries clause ids in frontmatter that must
  round-trip against body headings, and the clause map ties each row to one
  clause id. This proves presence and traceability. It does not prove the clause
  is well written, and section 8 risk 3 says so rather than letting the criteria
  imply otherwise.
- D-M3-09: no artifact renderer is built. There is no markdown rendering of the
  YAML plan, no prose rendering of a checklist, no promoter that opens a tuition
  pull request. Each of those would be machinery serving a scenario M3 never
  enters, which is the M1-P3 failure this plan is trying not to repeat (plan v1
  section 3 fourth-round note: "cut the surface instead of hardening it again").
  Two generated blocks do exist, both because they close a drift hole with a
  check attached: the agent-rules gate block (M3-P2) and the implementer brief's
  gate list (M3-P6).
- D-M3-10: `direct-pr` and `local-only` modes are declarative data with no
  enforcement engine in M3, because the kernel never runs them before M4. The
  same reasoning as D-M3-09.
- D-M3-11: T-003's structural consequence is applied as a required
  `fix-round-verification` stage in `full` mode (M3-P3) plus the universal-claim
  and source-pinning rules in the report contract (M3-P4). It is applied by
  citation to the tuition entry, not invented here, so that a reviewer can check
  the provenance of a rule that adds cost to every fix round.
- D-M3-12: the SC-001 correction to the process document is made as an
  annotation: the role-table cell is amended and a footnote quotes the original
  wording and cites SC-001 and D-14. An intake document is a governing document,
  so it is annotated with provenance rather than silently rewritten, and the edit
  is a declared files-to-touch entry in M3-P5 rather than an undeclared extra.
- D-M3-13: `templates/` is added to the package layout. Blueprint section 3's
  topology does not list it, but blueprint section 5 says every artifact "gets a
  schema or template file". This is the same class of correction as SC-003's
  topology redraw: the diagram predates the decision.
- D-M3-14: the status line ships as a schema, an emitter, and a current-state
  file, with no transport. Delivery of a status line to the owner is a harness
  concern (M4). C-1 forces the current-state file to be the authority and the
  stream to be a log.
- D-M3-15: the subject change of the exit run is designated at planning time
  (section 4.0 E0.4) with a stated fallback rule, so the run cannot be made easy
  by choosing a change after seeing what the kernel can manage.
- D-M3-16 (restated at revision 2, because DR-0013 changed what the third
  exception IS): no M3 phase edits a merged M2 component except three named
  cases. (1) M3-P2's optional extension of the gate runner's selection flags.
  (2) M3-P1's relocation of M2's schema documents (D-M3-20). (3) M3-P1's
  RETIREMENT of the M2 validator as an engine, routing its gate-schema
  validation through Ajv while preserving its module boundary and its
  diagnostic contract (DR-0013 clause 6). Revision 1 named the third case as
  "extension of the M2 validator's keyword set, which DR-0013 as decided makes
  unnecessary", which was a sentence describing a thing that is not happening;
  the thing that IS happening is the retirement, and it is a bigger edit than an
  extension would have been, so naming it correctly matters. **M2's validation
  TESTS are not in the exception list**: they are re-run unchanged, and an edit
  to any of them is the escalation-worthy event M3-P1 step 1 describes. Any
  other required M2 change is an
  escalation to the orchestrator, not an improvisation, because M2's exit
  evidence is a hard gate that a quiet edit would invalidate.
- D-M3-17: this plan follows `delivery/plan/kernel-plan-m2.md`'s phase ids and
  artifact paths, not plan v1 section 5's outline numbering, which differs (v1's
  outline put the red-witness harness first; the M2 plan puts the gate contract
  and runner first). Both documents are DRAFT and concurrent, written under
  DR-0011's parallel-planning grant, so the orchestrator reconciles them at the
  boundary the M2 plan's section 2 names. **All TWELVE of its boundary items are
  accepted** (revision 1's prose said "all nine" while listing eleven, which is
  an arithmetic error revision 2 corrects in the direction the list already
  showed; M2's revision 2 then added a twelfth, item 12 below), each with the
  place this plan discharges it, so completeness can be
  read here rather than re-derived from the other document (M3R-010):
  1. gate registry versus manifest: M2 builds `gates.manifest.json`, M3-P2
     promotes it and makes the reserved `modes` field live.
  2. report contract and status line: M3-P1 (status line) and M3-P4 (report),
     with M3-P4 required to emit or deliberately supersede M2-P6's declared
     coverage input contract.
  3. plan-schema superset for the scope auditor's projection: accepted as
     D-M3-18, built in M3-P1 step 2 with `tiphys plan project`.
  4. schemas-directory relocation: accepted as D-M3-20, executed in M3-P1
     step 10b.
  5. validation technology seam: DR-0013, DECIDED for Ajv, superseding the
     recommendation that was to extend M2's validator rather than adopt a
     library. **M2's revision 2 added an obligation running the other way and it
     is accepted here** (section 1.1 item 5): DR-0013 clause 6's promise to
     re-run M2's validation tests unchanged only holds if M2's validator emits
     `INVALID <json-pointer> <message>` with deterministic ordering and its own
     tests assert that contract rather than engine-specific wording, which
     M2-P1 step 4 and criterion 10 now require. M3-P1 step 1 VERIFIES both as
     delivered and escalates rather than adapting if either is false.
  6. fix-round verification as a pipeline requirement: M2 disclaims it, M3-P3
     carries it as a required `full` stage, cited to T-003.
  7. universal-quantifier linting: M2 disclaims it, M3-P4 carries it in the
     report schema as a Kind A `if`/`then` over a `pattern`.
  8. tuition flow and role briefs: M2 disclaims both, M3-P8 and M3-P5/M3-P6
     carry them.
  9. credential scoping: M2-P8 builds the kernel-side half and the owner half is
     DR-0004 item 4; the M2 plan states there is no M3 overlap and this plan
     agrees, so no action is required here beyond M3-P6's clause that the
     implementer brief must not instruct what the credentials forbid.
  10. mechanism index: M2 disclaims it in full and cites this plan's D-M3-23 as
     its owner, closing the orphan from both sides; the one coupling it names is
     discharged by D-M3-26's `machine-readable-form` citation.
  11. destructive-authority declaration: split three ways and accepted as
     D-M3-26, with M3 taking the rule text and the authoring-time enforcement.
  12. **release verification and the charter (DR-0014), NEW in M2's revision 2
     and accepted here as D-M3-29.** M2 builds one post-merge verification
     contract with two static manifest entries and two reference adapters
     (M2-D-20); M2 explicitly does NOT build the charter field that selects and
     configures a verification, does not build a registry of N charter-declared
     verifications, and does not generalize the two entries. Its three named
     hand-offs are dispositioned individually rather than accepted as a block:
     **(a) accepted** as an input, M2's outcome enum and record schema are the
     shape a later charter field must configure or supersede, recorded in
     section 1.1 item 6, and M3 does not encode that shape now because the field
     is reserved rather than designed. **(b) declined for M3 with a reason**,
     the charter coherence check (a non-local deployment topology alongside
     verification `none` is internally contradictory) is a Kind B check in this
     plan's own vocabulary and would cost one check and no artifact, but the
     investigation's section 8 item 4 says its predicate needs a real charter,
     which arrives at M4's pilot; Appendix C item 12 records it as
     available-and-declined. **(c) accepted and taken**, the change-to-`none`
     entry on the charter's `escalation-contract.stop-for[]` default list, which
     is one line and is M3-P1 step 3.
  No requirement row moves in either direction.
- D-M3-18: the plan schema's phase object is a strict superset of the M2-P4
  scope auditor's phase-declaration projection, and M3-P1 ships
  `tiphys plan project` to generate it. This accepts the recommendation the M2
  plan's boundary item 3 makes to this planner, and it closes the drift risk
  that plan names, rather than acknowledging it and leaving it open.
- D-M3-19 (supersedes any reading of section 1.4 convention 5 as absolute, per
  decided DR-0011): M3 phases declare `parallelizable` individually. Only
  M3-P7 beside M3-P8 can claim it, and only after DR-0011's recorded pairwise
  disjointness check at dispatch. The reason so few qualify is not caution:
  **SEVEN** of the ten phases edit `src/cli.ts` or `src/validate.ts`
  (recomputed at revision 3; revision 2's "nine" was not derived from the lists
  it cited, see section 2.5), and the remaining three read an artifact an
  earlier phase creates, so every pair is constrained by file overlap or by
  dependency and DR-0011's first condition cancels a parallel start on any
  overlap. Declaring more would be declaring something the file lists
  contradict. **The pair itself is corrected at revision 3**: M3-P8's
  `blocked-by` named M3-P7 while its grounding consumed only M3-P6, so the
  P7-P8 link is a merge-order constraint and not a consumption, and the real
  question is P6 beside P7 beside P8, answered in section 2.5.
- D-M3-20: M2's schema documents move from `src/gates/schemas/` to the canonical
  `schemas/` in M3-P1, which is the choice the M2 plan's boundary item 4 leaves
  to M3. Reason: `CLAUDE.md` reserves the root `schemas/` for exactly these
  deliverables, two schema locations in one package is a question every future
  reader has to answer twice, and the M2 plan states the move is one relocation
  plus one path constant. M3-P1 verifies that claim before acting on it.
- D-M3-21 (re-grounding, not a review finding): M3-P1 owns the top-level error
  presentation handler in `bin/tiphys.ts` that `delivery/STATE.md` records as
  carried forward with no owner. It is taken here because M3-P1 is the first
  phase to add commands whose ordinary input is a hand-authored file, and a
  validator that answers malformed YAML with a stack trace is one nobody trusts.
  Scope is the handler and nothing else in that file. The other three
  carried-forward items stay unowned by M3 and are recorded in Appendix C so the
  choice is visible rather than silent.
- D-M3-22 (M3R-002): validation checks are classified as Kind A (schema keyword)
  or Kind B (validator-computed or cross-document) in section 2.3, every
  criterion states which it is, and the **sixteen** Kind B checks are tabulated
  there (fifteen at revision 1; revision 2 adds
  `verdict-hazard-classes-addressed` from T-007). An implementer who finds a check that belongs in that table and is not
  in it escalates it as a plan defect; writing the check as an undeclared script
  is forbidden, both because the M2-P4 scope auditor would fail the undeclared
  file and because the table is what stops this class from being rediscovered
  once per phase.
- D-M3-23 (M3R-003, AMENDED at revision 2): T-005's mechanism index is delivered
  in two halves that sit
  in adjacent phases: M3-P6 ships the implementer brief's `mechanism-lookup` and
  `mechanism-sibling` clauses plus a committed SEED index, and M3-P8 replaces
  the seed with the generated
  projection of the tuition feed's `mechanisms[]` field and re-witnesses the
  brief's path. The split is because the brief cannot require reading a file that
  does not exist, and reordering the two phases would put the tuition flow before
  the briefs it is written for. Neither half is a new requirement row: the brief
  clauses are delivered under R-033a's "mandated reading in order" and the index
  under R-091's tuition flow, both recorded in the clause map against those rows,
  so Appendix A's counts are unchanged.
  **What revision 2 amends is the SEED, and the amendment is a strengthening.**
  Revision 1 specified "a committed stub index carrying the one rule T-005
  itself establishes", written when no index existed. `MECHANISMS.md` was
  committed at the repository root on 2026-08-05 with TWELVE mechanisms, under
  T-005's own "cheap interim measure, available now", and states of itself that
  it is intended to be superseded by M3-P8's projection. So the seed is a
  CONVERSION of all twelve rows rather than an invention of one, M3-P8's
  projection must cover all twelve (its criterion 4c, which is the coupling
  M2's boundary item 10 asked for), and M3-P8 DELETES the interim file rather
  than leaving two indexes, which is the state T-005 exists to prevent.
  `schemas/mechanism-index.schema.json` moves from M3-P8 to M3-P6 as a create,
  because the seed needs it; M3-P8 edits it. Both phases' files-to-touch lists
  are corrected, and no requirement row moves.
- D-M3-24 (M3R-004): the dual cross-model review guarantee is enforced by
  `scripts/check-dual-review.mjs` and cited in `AGENTS.md`, not merely
  representable in a schema field. Recording a claim without checking it is the
  unenforced-data shape this project has recorded twice (T-003's false work
  history, T-004's unpinned finding), and DR-0012 is not hypothetical: it is the
  regime M1-P3 through M1-P5 were reviewed under.
- D-M3-26 (routed from the M2 planner's boundary reconciliation, M2 plan
  section 2 items 10 and 11): T-003's fourth structural consequence splits three
  ways, and this plan accepts M2's split and takes two of the three parts. The
  machine-readable `destructiveCommands` list is M2's, because it is a gate input
  that lets M2-P2 derive a witness's class instead of trusting an implementer's
  declaration. The rule text with its evidence is M3-P8's seeded
  `destructive-git-operation` index entry, which now cites the manifest list as
  its `machine-readable-form` so the two views cannot drift; the dependency
  direction is M3 reads M2, never the reverse, because M2 ships first. The third
  part, enforcing that a NEW destructive command states its authority in its own
  contract, is M3's and is agreed rather than merely accepted: no script can
  judge whether a contract states an authority, the computable half is already
  M2's list, and what remains is exactly a brief clause plus a review probe,
  which is where the placement rule sends a judgeable rule. It lands as M3-P6's
  `destructive-authority` clause and M3-P7's `destructive-authority-declared`
  probe, both under existing rows (R-033a and R-055), so no row moves and no
  count changes. The clause's third conjunct, add the command to the manifest
  list, is the seam that keeps the two plans' halves joined at authoring time,
  which is when V-1 would have been caught rather than at verification time.
- D-M3-25 (M3R-009): the push-cadence trio (R-038 per-step commits, R-039
  batched pushes, R-074 one-to-two-push fix rounds) stays L2 brief clauses in
  M3-P6, and the computability question the migration table asked of its six
  resist-rows but never asked of these three is answered here rather than left
  unasked. A proxy is computable: commits-per-push from git history, and CI runs
  per phase from the workflow API, both available post-hoc. It is not built,
  for two reasons that are about the check rather than about effort. First, the
  proxy measures the wrong thing at the wrong time: the rule exists to stop a
  phase burning CI runs, and a post-hoc count tells you it already happened.
  Second, the numbers are advisory in the process doc's own wording ("every 1 to
  3 steps"), so a gate would either fail honest work or never fire. Recorded in
  Appendix C as available-and-declined with these reasons, which is what the
  placement rule asks for: the question asked and answered, not skipped.

**Decisions added at revision 2 (2026-08-06), numbering continued from D-M3-26
so no id is reused and nothing is renumbered.** Each is taken under DR-0016's
two-limb test rather than raised: each has a recommendation this planner would
defend, so the options are not comparable and there is nothing to ask. The
reasoning is recorded here exactly as if it had been escalated, which is what
DR-0016 requires in exchange.

- D-M3-27 (path reads go through the delivered classifier): every M3 command
  that opens a path it did not create uses `classifyEntry` and
  `refuseOpenForWrite` from `src/task.ts` (M1-P5, merged at `58ac964`), never a
  bare `readFileSync`, `openSync`, `appendFileSync` or `renameSync`. A path that
  is not a regular file makes the command report an error naming the path and
  the observed type; no M3 command blocks indefinitely on a path it did not
  create. **Why this is a decision and not an observation**: M3 introduces at
  least five commands whose ordinary input is an operator-supplied path
  (`validate <file>`, `validate --context <dir>`, `brief compose`'s
  mandated-reading resolution, `checklist resolve --extra`, `tuition add
  --file`), which is a larger untrusted-path surface than any M1 phase had. The
  class is M1's most expensive: twelve paths, four fix rounds, CR-520 and
  CR-560, and it is STILL OPEN in `src/lock.ts`, `src/pool.ts` and
  `src/brief.ts`, the last of which M3-P5 consumes. M2 took the same decision as
  constraint M2-C-6 for gates. **M3 uses the delivered implementation rather
  than writing a second one**, which is T-005's lesson applied inside this
  milestone, and M3 does NOT fix the three open files: no M3 phase acquires
  `src/lock.ts` or `src/pool.ts`, patching `src/brief.ts` from M3-P5 would
  repeat CR-521, and `delivery/STATE.md` records the class as needing its own
  scope. The residue is that M3 stops the class growing and does not close it,
  stated in section 1.1 rather than implied.
- D-M3-28 (a wired check is a behaviour, not a text): every M3 criterion
  asserting that a check is wired into `.github/workflows/gates.yml` extracts
  the step and EXECUTES it against stubs, observing its exit code, under at
  least two structurally different defangs. Where a text assertion is
  unavoidable it is labelled as such and its residue named. Five M3 phases wire
  a check into that file (P1's clause map, P2's gate drift, P6's brief drift,
  P9's reference and duplication checks, P10's license gate), and the class this
  prevents was confirmed SIX times across four M1-P6 rounds: `exit 1` changed to
  `exit 0`, two placements of `|| true`, a step-level `if: false`, a quoted YAML
  key the whitelist regex could not see, and the guarded step moved into a job
  the fan-in does not need. **Two corrections and one addition at revision 3,
  under the same decision number because the DECISION is unchanged and only its
  world model was wrong (no decision id is reused or renumbered in this
  revision).**
  (a) **The sixth defang cannot occur and is replaced.** DR-0017 (owner,
  2026-08-06) collapsed CI to ONE job named `gates` with no matrix and no
  fan-in, so "the guarded step moved into a job the fan-in does not need" names
  a state that does not exist, and a criterion written against it would be
  green and worthless, which is the red-witness failure this decision exists to
  prevent. The sixth member is now: an `if:` condition narrowed so the step
  runs on only one CI event. CR-760's INSTANCE (the fan-in's own script) is
  likewise gone; its MECHANISM is not, because the single job still carries
  several `run:` blocks whose behaviour a text assertion cannot see.
  (b) **A standing constraint on the file itself.** DR-0004's required status
  context is the literal string `gates`, and a job named `gates` with no matrix
  publishes exactly that. Any M3 phase that adds a job or a matrix renames the
  context to something else and silently detaches branch protection. No M3
  phase may do either, and the five phases' files-to-touch entries repeat it.
  (c) **The EVENT ARM is part of the behaviour (T-009).** The workflow forks on
  `github.event_name` and the two arms run different bundles, so a criterion
  that asserts a check is wired must also assert which arm it runs under, and
  where behaviour forks on the event, BOTH arms need a witness. D-M3-34 routes
  M3's checks into `gate-registry.yaml` with a required `events[]` field, which
  discharges the first half by construction.
  **Why decided rather than raised**: the alternative is cheaper tests that are
  known not to work, which is not a comparable option.
- D-M3-29 (the charter RESERVES release verification): the charter schema
  declares a required `release-verification` field admitting exactly
  `{mode: none, reason}` and `{mode: reserved, note}`, with
  `additionalProperties: false`, a `$comment` citing DR-0014 and the
  investigation, and no adapter enumeration, no N-verification registry, and no
  coherence check. `escalation-contract.stop-for[]` gains the change-to-`none`
  entry. **Why reserve rather than design**: DR-0014's own impact section says
  the M3 planner "should hold that space rather than design it now", and
  `delivery/verification/release-verification-interface.md` section 8 item 4
  repeats it and names what settles it, the first real project charter at M4's
  pilot. Designing a field against no real charter is the M1-P3 shape risk 1
  exists to prevent, in a new subject. What IS taken now is what costs one line
  and needs no invented predicate: the positive-declaration rule with its
  required reason (the investigation's defence 2, silence is never permission)
  and the stop-for entry. The coherence check is declined with its reason in
  Appendix C item 12.
- D-M3-30 (the fix-round contract and the claim grep become artifact
  requirements): `CLAUDE.md`'s fix-round contract lands as M3-P4's required
  `fix-round[]` object (`mechanism`, `derivation` with FULL output,
  `not-covered`), as M3-P7's three fix-round probes with `not-covered` FIRST in
  the resolved list, and as M3-P6's `fix-round-mechanism` clause. The claim grep
  lands as M3-P6's `claim-grep` clause carrying the command VERBATIM and as
  M3-P4's `claims[]` section. **Why both a grep and a schema field**: they catch
  different things. The grep finds candidate sentences the author did not
  declare; the section makes the honest restatement a first-class value rather
  than an omission. T-006 records that the pattern survived being documented as
  a norm and was reproduced by the person who filed it on the same day, which is
  the evidence that one mechanism is not enough. The measured evidence for the
  fix-round half: sixteen M1 fix rounds, thirteen re-reviewed, twelve of those
  thirteen producing a new finding attributable to the round; the dominant shape
  is the fix addressing the instance when the defect was the mechanism, and
  M1-P3 chained four rounds that way, M1-P5 four, M1-P6 two. **What no schema
  buys**: whether a stated `mechanism` is a mechanism or a restated finding is a
  judgement; it is M3-P7's `fix-round-mechanism-named` probe, and risk 2 owns it
  rather than the criteria implying otherwise.
- D-M3-31 (the dispatch contract ships in the briefs and in `AGENTS.md`):
  T-008's two rules land as the `incremental-output` and
  `beacon-is-not-a-claim` clauses in every role brief (M3-P5, M3-P6) and as the
  `dispatch-requires-a-beacon`, `dispatch-requires-a-guard` and
  `notification-is-not-liveness` clauses in `AGENTS.md`'s supervision section
  (M3-P9). **Why the kernel and not a habit**: T-008 measured a competent
  orchestrator, holding the design, having stated a thirty-minute stall rule
  aloud that morning, supervising only two agents, losing nine hours eleven
  minutes to a silent stop, because supervision by waiting for a completion
  notification is process liveness and C-2 forbids it for exactly that reason.
  It was the largest single waste in the project, larger than every escalation
  combined, and it is also the strongest available argument for this kernel
  existing at all, which is why section 4.5 cites it rather than leaving it in a
  tuition entry. The GUARD clause names the recorded failure of the first fix,
  which tested EXISTENCE, fired two minutes in, and reported success while
  saying nothing: a guard whose condition does not test the property that
  matters is the red-witness rule one level up.
- D-M3-32 (every phase declares a hazard class, and the plan schema requires
  them): each phase section of this plan carries a `hazard class` field beside
  its acceptance criteria, and `schemas/plan.schema.json` requires
  `hazard-classes[]` with `minItems: 1` on every phase. `full` mode requires two
  review CONTRACTS (M3-P3), `checklists/hazard-review.yaml` is the second
  contract's declared probe list (M3-P7), the clean-room brief declares which
  contract it runs (M3-P6), the verdict schema records it and its
  `hazard-classes-addressed[]` completeness is Kind B check
  `verdict-hazard-classes-addressed`, and `AGENTS.md` carries the dispatch duty
  (M3-P9). **Why required rather than optional**: T-007 records a phase meeting
  fifteen of fifteen EXECUTED acceptance criteria, walked by two reviewers on
  different model families who agreed on every mechanical fact, while
  live-locking `doctor`, `spawn`, `teardown` and both watcher modes; the
  approving report does not contain the word `readBeacon`, because no criterion
  covers that path, and had both been briefed on the criteria both would have
  approved on any two models. T-007's own words: the pairing "should be a rule,
  not an accident". An optional field is the version of this rule that does not
  survive a busy dispatch, which is the same failure mode T-008 records for
  stall rules. **What it does not buy, stated so the criteria do not imply
  otherwise**: a declared hazard class can be wrong or shallow, and nothing
  checks that. It makes the second contract DERIVABLE rather than improvised,
  which is what T-007 asks for; risk 2 owns the residue.
- **D-M3-33 (NEW at revision 3): the ten phase declarations are authored by the
  orchestrator and merged to `main` in one pull request before the first M3
  branch is created.** The M2-P4 scope auditor reads
  `delivery/plan/phase-declarations/<phase>.json` out of the MERGE BASE, so a
  declaration absent from `main` when the branch forks cannot govern that
  branch, and every M3 branch matches the gate's `branch-matches` precondition
  so scope runs on every M3 pull request. Revision 2 assigned this to nobody and
  M3-P1's first pull request would have discovered it. **Why the orchestrator
  and not the phase**: a phase that could author the document governing its own
  audit could widen its own scope, and the merge-base read is the only thing
  preventing that. **Why one pull request and not ten**: the review that matters
  is whether every declaration matches the plan section it projects, which is a
  comparison over all ten at once, and ten merge trains for one authoring act is
  cost with no property behind it. **Why decided rather than raised**: it is an
  operational prerequisite with one workable shape, not a choice between
  comparable options (DR-0016).
- **D-M3-34 (NEW at revision 3): every M3 check enters `gate-registry.yaml`
  with a required `events[]` field, rather than being wired as a raw workflow
  step.** Section 2.2a carries the argument in full. In short: M3-P2 promotes
  the registry to "the single source consumed by CI and briefs" (R-094), and
  revision 2 then added five of M3's own checks as direct workflow steps, which
  falsifies that property on the day M3-P2 merges, leaves those five checks
  outside the exit test's central gate-coverage assertion at E1.6, and leaves
  their event applicability unstated, which is T-009 one level down. Registering
  them also gives each one M2-C-2 and M2-C-3 for free, because a registered
  check writes its result through `makeGateResult` and a check that examined
  nothing becomes `error` with `vacuous: true` instead of exiting 0. **The
  constraint this respects**: M2 deliberately made the exit harness the SINGLE
  caller of `gates run` so exactly one `summary.json` is produced per job, so
  registration is the only way to add a check to the bundle without breaking
  that. **What stays at workflow level**: M3-P10's release wiring, because it
  runs on a tag event the gate bundle never sees; any other exception must
  state its reason in the phase's step list and declare its event arm. **Why
  decided rather than raised**: the alternative contradicts a requirement row
  this milestone is delivering.
- **D-M3-35 (NEW at revision 3): every hazard-class item names the criterion
  that reddens against it, or a recorded reason none can.** Section 2.6 carries
  the rule, the three admissible reasons, and the per-phase maps. This converts
  `hazard-classes[]` from documentation into a checked obligation, which is what
  T-007 asked for and what D-M3-32 declared without enforcing. It reaches the
  kernel through the plan schema: each item is `{id, statement, addressed-by}`
  with `addressed-by` required, and Kind B check
  `plan-hazard-classes-addressed-by-resolves` (M3-P1 criterion 5f) resolves a
  criterion-id `addressed-by` into the same phase's `acceptance[]`. **The
  measured reason**: M3-P2's hazard class named M2-C-2, the constraint the whole
  of M2's gate contract exists to enforce, and `grep -in units` over all 4905
  lines of revision 2 hit only the hazard prose, so the registry promotion could
  have dropped M2's central safety property and passed every criterion the phase
  declared. **What it does not buy**: a criterion named in an `addressed-by` can
  still be weaker than the hazard it is matched to. Three maps say so in their
  own rows (M3-P3's C-2 grep, M3-P8's `tuition-target-exists`, M3-P9's
  anti-duplication check), which is the honesty the rule is worth.
- **D-M3-36 (NEW at revision 3): a gate result is evidence only for the
  configuration that produced it, and M3's artifacts say so.** T-009's mechanism
  lands in three places. The exit test names the EVENT and the head sha and
  requires the run observed to completion (E0.1, E3.1, E3.1b). `AGENTS.md`
  carries `merge-is-not-complete-until` and `gate-result-is-scoped-to-its-run`
  as clauses with M3-P9 criterion 5b behind them. And D-M3-28 requires a wired
  check to declare its event arm, with both arms witnessed where behaviour
  forks. **Why this is a decision rather than a criterion**: T-009 is one day
  old and postdates revision 2 entirely, so the plan had no position at all, and
  the placement question (exit test only, versus exit test plus `AGENTS.md` plus
  the CI-wiring rule) is the kind a later reader will want the reasoning for.
  The placement is all three because the failure recurred at all three levels in
  the incident: the orchestrator read the wrong run, the merge procedure had no
  clause requiring the right one, and the workflow forked on an event nobody had
  written down.

## 6. Open questions

Per D-7, an open question is a decision record with status open, not a
free-floating list item. The open questions of this plan are exactly:

1. **DR-0008 (release registry and package naming): DECIDED 2026-08-05**,
   public npmjs under the `@tiphys` scope, `@tiphys/kernel` and
   `@tiphys/claude-code-plugin`. It is no longer an open question and is listed
   here only because revision 1 listed it as open and overdue while its own
   risk 3 already recorded it as decided; leaving the contradiction would be a
   worse outcome than restating a settled record.
   **Revision 1's text, superseded 2026-08-05, kept as the record of what was
   asked**: DR-0008 was open and deferred with a stated due date ("before the M3
   plan is approved") that had passed; it bound M3-P10 entirely and bound
   `package.json`'s `name` field, the fleet-home pin M3-P10 writes into
   `tiphys init`, and every release-verification criterion naming the package;
   M3-P1 through M3-P9 could be approved and dispatched with it open because no
   acceptance criterion in any of them names a package, a registry or a version,
   which the reviewer verified and this plan re-verified by search. That
   verification is still true and is why the decision arriving when it did cost
   nothing. What remains open on this subject is not a decision but owner action
   A-7 (renumbered from A-4 at revision 3, A-003), the publish credential and
   the `@tiphys` scope claim, which is elevated
   access the orchestrator does not hold and which DR-0016 keeps owner-reserved.
2. DR-0010 (harness-native orchestration primitive): open, recorded as due at
   M4. Its question text explicitly includes an M3 half ("should any
   judgment-layer fan-out (M3 review stages) target it?"). This plan's answer,
   pending the owner's, is no: M3 dispatches roles through the M1 executor
   adapter and the current process, and nothing in section 3 or section 4
   targets the primitive. If the owner wants the M3 half decided differently,
   M3-P3 is the phase that changes.
3. DR-0013 (JSON Schema validation implementation): raised by this plan and
   DECIDED by the owner 2026-08-05 for an external validator (Ajv 8.20.0 exact,
   Draft 2020-12), with the plan's YAML-parser omission closed in the same
   decision (`yaml` 2.9.0 exact). See section 7 and the decision record.
4. **DR-0014 (release verification interface): DECIDED IN PRINCIPLE 2026-08-05**
   (a pluggable interface with kernel-shipped reference adapters), with its
   interface design investigated and reported in
   `delivery/verification/release-verification-interface.md`. It is listed here
   for completeness rather than as an open question, because the part that bears
   on M3 is settled in the direction that requires no decision from anyone: the
   charter field is M3's to RESERVE and not to design, which is D-M3-29. The
   genuinely undecided parts (the field's real shape, whether verification
   generalizes to N charter-declared verifications, the coherence-check
   predicate) are all settled by the first real project charter at M4's pilot,
   per the investigation's section 8 item 4. **No M3 phase is blocked by any of
   them**, because a reserved field is complete without them.

There are no other open questions, and **no M3 phase is blocked on an owner
DECISION** (revision 2, verified by reading every `blocked-by` field in section
3). The one owner item remaining is A-7 (renumbered from A-4 at revision 3,
A-003), which is an ACT requiring elevated
access rather than a choice, and it blocks M3-P10 only. Under DR-0016 that
distinction matters: an act the agent cannot perform is owner-reserved by
construction, while a choice with a defensible recommendation is the agent's.

## 7. Owner decisions and owner actions

| DR | Question | Status | Blocks |
|---|---|---|---|
| DR-0008 | Release registry and package naming (SC-012, SC-006) | **DECIDED 2026-08-05: public npmjs under `@tiphys`, packages `@tiphys/kernel` and `@tiphys/claude-code-plugin`.** Revision 1's "open, deferred, overdue" is superseded | nothing. M3-P10's remaining blocker is owner ACTION A-7 (renumbered from A-4 at revision 3, A-003), not this record |
| DR-0010 | Does any M3 judgment fan-out target the harness-native primitive | open, due at M4; the M3 half falls due at M3-P3 dispatch | M3-P3 only in the sense that a yes changes it; a no needs no work, and no is this plan's recorded answer |
| DR-0013 | How is JSON Schema validation implemented in the kernel | DECIDED 2026-08-05: Ajv 8.20.0 exact, Draft 2020-12, strict; `yaml` 2.9.0 exact | discharged; M3-P1 unblocked and implements it |
| DR-0014 | The shape of post-merge release verification | DECIDED IN PRINCIPLE 2026-08-05 (pluggable interface, kernel-shipped reference adapters); interface investigated, `delivery/verification/release-verification-interface.md` | nothing in M3. The charter field is RESERVED, not designed (D-M3-29) |
| DR-0015 | Is the owner an approval step | DECIDED 2026-08-05: no, at milestone boundaries included; dual clean review is the signature | discharged; the exit-run approval ACT is removed and section 4.2 is rewritten. **Revision 3**: the id `A-3` is NOT retired by that removal, because `A-3` belongs to M2's outstanding token action and is embedded in `gates.manifest.json`; see section 7 |
| DR-0016 | When may an agent stop and ask the owner | DECIDED 2026-08-05: only genuine high-impact ties; recommendation-backed questions are the agent's | discharged; `escalation-bounds.on-exceeded` (M3-P3) and two `AGENTS.md` clauses (M3-P9) |

**No M3 phase is blocked on an open owner decision at revision 2, re-verified
at revision 3 by reading all ten `blocked-by` fields again after the M3-P8
correction. DR-0017 and DR-0018, both decided since revision 2, block nothing:
they CORRECT things this plan asserted, which is section 1.7's business rather
than this table's, and both are now cited.**

---

### DR-0013 as raised: HISTORICAL RECORD, NOT INSTRUCTION

**START OF HISTORICAL BLOCK. Everything between this line and the marked END is
the record of what was ASKED and RECOMMENDED before 2026-08-05, preserved so a
reader can see the reasoning the owner overrode. It is NOT the decision and no
part of it is an instruction to anyone.** The owner decided for an EXTERNAL
validator (Ajv 8.20.0 exact, JSON Schema Draft 2020-12, strict mode), rejecting
the option-2 recommendation below, and closed this plan's YAML-parser omission
in the same decision (`yaml` 2.9.0 exact). The authoritative text is
`delivery/decisions/DR-0013-schema-validator-implementation.md`. Revision 2
added this framing because revision 1 marked the block superseded at the top and
then left its option list, its recommendation and its note to the owner in the
present imperative, so a reader landing in the middle of it would read
instructions that are false.

- Question: DR-0006 decided that artifacts are validated by JSON Schema. The
  kernel ships zero runtime dependencies today (`package.json` has
  `devDependencies` only), and M2 ships a minimal in-repo validator with a
  closed, documented keyword set that errors loudly on any keyword it does not
  implement (M2 plan decision M2-D-04, boundary item 5, which explicitly leaves
  this decision to M3). M3's five artifact schemas exercise far more of the
  specification than a gate manifest does. Does the kernel extend M2's validator
  or adopt an external one?
- Reversibility: costly. A runtime dependency in a published package is
  inherited by every fleet home from M3 onward, enters the EXT-F-09 license
  gate's inventory, and is a supply-chain surface. Extending M2's validator is
  cheaper to reverse but compounds: every schema written against a keyword the
  subset lacks has to be rewritten if the subset is later abandoned.
- Options: (1) take one established JSON Schema validator as a runtime
  dependency, pinned exact, with the license gate covering it, and keep M2's
  validator for M2's own manifest or retire it behind the same interface;
  (2) extend M2's closed keyword set to cover what M3's schemas need
  (`type`, `required`, `enum`, `const`, `properties`, `items`,
  `additionalProperties`, `minItems`, `pattern`, `oneOf`, `if`/`then` for the
  conditional rules M3-P1 and M3-P4 need, and `contains`, which M3-P3's
  `full`-requires-`fix-round-verification` rule and M3-P7's
  APPROVE-with-a-high-finding rule both need), keeping the loud-failure-on-unknown-
  keyword property that makes the subset safe, and declare the subset in
  `schemas/README.md`; (3) hand-write per-type checks in TypeScript, which
  contradicts DR-0006's language-neutral intent.
- Recommendation AS MADE, and REJECTED by the owner 2026-08-05: option 2,
  extending M2's validator, which was a change from
  what this plan first assumed. The reason given was M2's loud-failure property: a
  keyword outside the set fails the validator rather than being ignored, which
  removes the failure mode that made option 1 attractive (silently ignored
  keywords producing vacuous passes, the SC-011 class). With that property in
  place, option 1 buys specification completeness the kernel's own schemas do
  not need, at the cost of the first runtime dependency in a package every
  fleet home installs. Option 1 remains the right answer if the conditional
  rules M3-P1 step 2 and M3-P4 step 1 require turn out to need more of the
  specification than the extended subset can carry, and that is a discovery the
  M3-P1 implementer must escalate rather than work around.
- Note for the owner AS WRITTEN, and now DISCHARGED: "M3-P1's steps 8 and 11 and
  its dependency-related criteria
  change with the choice, and nothing else does. Both options keep the schemas
  themselves standard JSON Schema, so neither locks the artifacts in." That
  prediction held. Revision 1 changed step 8 only; revision 2 changed step 11
  and step 10c (the lockfile and the dependency inventory) and M3-P10 step 2
  (the license gate's inputs), which is the rest of what the note named. The
  prediction that nothing else changes also held: no schema, no artifact form,
  and no other phase moved because of the engine choice.
- Scope correction from the review AS RECORDED (M3R-002): revision 0's note framed
  "the conditional rules need more of the specification than the subset carries"
  as a risk confined to M3-P1 and M3-P4, which was wrong. Section 2.3 now
  separates the checks no schema technology can express (Kind B, fifteen of them,
  spread across five phases) from the ones a keyword covers (Kind A), so this
  decision is about Kind A only and its blast radius is bounded. An implementer
  who finds a Kind A rule the subset cannot carry escalates rather than
  reclassifying it as Kind B to avoid the conversation (D-M3-22).
  **Still true after the decision, and DR-0013 clause 8 says so in terms**:
  cross-document, filesystem, arithmetic and cross-array rules stay in
  `src/checks.ts` and are not encoded as Ajv extensions, so the Kind A / Kind B
  boundary is unchanged by the engine choice. The count is sixteen at revision
  2, not fifteen.

**END OF HISTORICAL BLOCK. Everything below is current.**

---

### The `A-n` owner-action namespace (NEW at revision 3, A-003)

**The problem, measured.** `CLAUDE.md`'s identifier-scheme registry lists
`SC-`, `R-`, `FM-`, `PR-`/`EXT-F-`, `CR-`, `V-`/`U-`, `DR-`, `T-`, `C-` and
`D-`, and does NOT list `A-`. Three live documents therefore allocated `A-n`
independently and collided:

```
$ grep -o 'A-[0-9]' delivery/STATE.md | sort -u
A-1  A-2  A-4  A-6
$ grep -o 'A-[0-9]' delivery/plan/kernel-plan-m3.md | sort -u    # before this revision
A-1  A-3  A-4  A-5
$ git show origin/main:delivery/plan/kernel-plan-m2.md | grep -c 'A-3'
(A-3 = provision the scoped implementer token, DR-0004 item 4, OUTSTANDING)
$ git show origin/main:gates.manifest.json | python3 -c "
import json,sys
print([g['precondition']['id'] for g in json.load(sys.stdin)['gates'] if g['id']=='credential-token'])"
['implementer-token-present-owner-action-a-3']
```

`A-4` meant the npm publish credential here and the deletion of thirty-five
stale branches in `delivery/STATE.md`, which marks its own A-4 "NEW", the
evidence that its author did not know the id was taken. `A-3` meant three
things, one of them a literal string inside a MERGED, MACHINE-READ manifest on
`main`. That last one is what makes this more than cosmetic: `A-3` is
load-bearing inside a kernel artifact.

**The allocator.** `delivery/STATE.md`'s owner-action table is the single
allocator of `A-n`. It is the document `CLAUDE.md` designates as the one place
that answers where the project stands right now, and it is what an orchestrator
resuming cold reads first, so an id that means one thing there and another here
is a wrong answer delivered to the reader most likely to act on it. This plan
CITES ids and does not mint them; a new owner action is added to STATE.md's
table and cited here by the number that table assigns.

**Resolution, and the constraint on it.** The one id with a machine dependency
KEEPS ITS NUMBER: M2's `A-3` (the scoped implementer token) is named inside
`gates.manifest.json` on `main` and is not renamed here or anywhere. Ids in
use elsewhere (`A-1`, `A-2`, `A-4`, `A-6` in STATE.md; `A-5` below) are left
alone. This plan's own colliding allocation moves to a fresh id above all of
them.

**Orchestrator action, outside this plan and recorded here so it is not
dropped**: add `A-nnn` to `CLAUDE.md`'s "Identifier schemes" list with
`delivery/STATE.md` named as the allocator. That is an edit to a governing
document and is not a plan edit.

Owner actions (acts, not choices):

- **A-3 IS NOT THIS PLAN'S TO RETIRE, and revision 2's claim that it was is
  withdrawn (A-003).** Revision 2 wrote that this plan's owner action A-3,
  "approve the exit run's pull request", was removed by DR-0015 and that "the
  id is retired rather than reused, per the identifier rule". The removal of the
  ACT is correct and stands. The retirement of the ID is wrong: `A-3` in the
  shared namespace belongs to M2's outstanding action, provisioning the scoped
  implementer token under DR-0004 item 4, and it is the literal string
  `implementer-token-present-owner-action-a-3` inside `gates.manifest.json` on
  `main`. This plan never held that id and cannot retire it. What remains true
  is the substance: nothing replaces the removed act, because section 4.2 stage
  E2's authorization artifact is the dual cross-model clean review of DR-0012's
  definition of clean, and the MECHANISM is deliberately kept (the kernel stops,
  waits for an artifact it did not produce, records it, and resumes from it),
  because DR-0015 records that as the one place the exit test witnesses that
  property. What is genuinely lost is in section 4.5 item 9 rather than hidden.
- **A-7 (was A-4 at revision 2; renumbered here, A-003), before M3-P10
  dispatches: provide publish credentials for npmjs and claim the `@tiphys`
  scope**, which DR-0008 decided on 2026-08-05 along with the package names
  `@tiphys/kernel` and `@tiphys/claude-code-plugin`. The orchestrator has no
  such credential and will never assume one. **This is the only remaining owner
  item on M3's critical path**, and under DR-0016 it is owner-reserved by
  construction rather than by judgement: it is elevated access the agent does
  not hold, not a choice with options. **Why this one moved rather than
  STATE.md's A-4**: A-7 is cited only inside this plan, which is DRAFT and not
  yet owner-approved, so moving it costs nothing outside this document, whereas
  STATE.md's A-4 is a live queued act. The number 7 is the lowest free id above
  every id any of the three documents has issued (A-1 to A-6). **M3-P10's
  `blocked-by` now cites the ACT as well as the id**, so a reader who
  encounters a stale number still knows what is owed. Registering it: the
  orchestrator adds the row to `delivery/STATE.md`'s owner-action table as A-7
  in the same pass that adds `A-nnn` to `CLAUDE.md`.
- A-5: **DONE 2026-08-05, superseding revision 1's standing item.** DR-0004
  items 2 and 3 (branch protection) are executed. `delivery/STATE.md` records
  the ruleset as active and witnessed refusing a merge whose branch was behind
  `main`, then allowing it after the branch was updated and CI went green on the
  exact merged head. So "merge on CI green only" (R-064) is structurally
  enforced before M3 begins, which is what this item asked for, and it is
  witnessed rather than asserted. **DR-0004 item 4 (implementer token scoping)
  remains queued for M2** and is not an M3 item: M2-P8 builds the kernel-side
  half and the owner half is that queued action.

## 8. Risks

Ordered by how likely the phase is to behave the way M1-P3 did, which is the
comparison plan v1's own history makes available.

1. **M3-P3 and M3-P2: building for states the milestone never enters.** This is
   the M1-P3 shape exactly. The registry has a mode dimension and the modes have
   pipelines, and the kernel executes exactly one of the three modes, once.
   Every line of enforcement written for `direct-pr` or `local-only`, every
   precondition engine beyond what M2-P1 already shipped, and every mode-aware
   branch-protection coupling is machinery whose first real exercise is M4 at
   the earliest. Mitigation, binding: D-M3-10 makes the two unused modes
   declarative data; M3-P2 promotes the M2 manifest and adds two entries rather
   than rewriting the runner; the acceptance criteria witness validation and
   selection, never enforcement. The failure signature to watch for in review is
   a criterion that can only be met by code that runs in a mode M3 never enters.
2. **Prose artifacts cannot be proven good, and the criteria might imply they
   were.** M3-P5, M3-P6, M3-P7, and M3-P9 ship 44 of the 74 rows as clause text
   and probe questions. Revision 1 narrows this slightly: M3-P7 criterion 3b now
   checks that the specific illustrative content the plan's own steps demand is
   present in the probe text (M3R-007), which converts "the probe exists" into
   "the probe says the thing", but not into "the probe is the right probe". The clause map proves a clause id exists and a heading
   exists under it. It proves nothing about whether the clause says the right
   thing, and neither does any gate this project has or will have. The only real
   evidence is the exit run, which is one change (section 4.5 item 3).
   Mitigation: D-M3-08 states the limit in the plan rather than leaving it for a
   reviewer to discover; the clause round-trip criteria (M3-P6 criterion 7,
   M3-P9 criterion 4) at least make an empty clause id impossible; every brief
   and checklist phase is dispatched at the strongest model tier for the clause
   text. Residual risk is real and is not closed by this plan.
3. **DR-0008 and DR-0013 are both now DECIDED, and the risk they carried is
   discharged.** DR-0008 decided 2026-08-05 (public npmjs under @tiphys);
   DR-0013 decided 2026-08-05 (Ajv 8.20.0 exact, Draft 2020-12, plus `yaml`
   2.9.0 exact). The reasoning this item recorded remains true as a general
   lesson and is kept for it: DR-0013 blocked M3-P1, which blocks all nine
   phases after it, so a decision that arrives late does not delay one phase,
   it delays the milestone. No M3 phase is now blocked on an owner decision.
4. **The exit run is circular and supervised.** The kernel's full mode is judged
   by artifacts the kernel just shipped, in a run a competent human is watching
   and can rescue without noticing they did. E0.3 exists precisely because "the
   supervisor quietly filled a gap" is the failure that would make a green exit
   test worthless. Mitigation is procedural, not structural, which is the
   weakest kind, and the honest statement is that this exit test is a
   consistency check plus one delivery, not a proof of autonomy.
5. **`AGENTS.md` as a dumping ground.** Eleven policy rows plus four
   plan-assigned duties plus three tuition duties in one document, whose natural
   drift is to restate the registry and the modes in prose that then goes stale.
   Mitigation: the anti-duplication check (M3-P9 criterion 3) is the structural
   answer, and it is falsifiable in both directions.
6. **Schema circularity in M3-P1.** A permissive schema makes every later
   artifact pass while proving nothing, and nothing downstream would notice.
   Mitigation: section 2.3's DANGEROUS-instance rule with the two-directional
   keyword witness, applied to every schema in every phase. A phase whose
   invalid fixtures are syntax errors has not met its criteria.
7. **A plan written in parallel with the work it plans goes stale while it is
   being written.** This is not hypothetical for this document: T-005 was
   committed under three hours after this plan's first drafting commit, it is
   squarely about M3's central artifacts, and revision 0 did not mention it. The
   review found it, and the orchestrator has recorded the procedural fix against
   DR-0011: a plan written in parallel with implementation is re-grounded against
   everything learned since it was started, before its review rather than after.
   Revision 1 performed that re-grounding, and it produced four changes the
   findings did not ask for (the mechanism-index ownership was already assigned
   to M3 by `delivery/STATE.md`'s carried-forward list; the top-level error
   handler, D-M3-21; DR-0012's escalation bounds as mode data, M3-P3 step 1;
   T-001's framing lesson as a checklist field, M3-P7 step 5).
   **Revision 1 stated its residual risk as a prediction, and the prediction
   came true in full, which is now the most useful thing this item records.** It
   read: "M1-P5 is still open, M1-P6 has not run, and the M1 exit test has not
   happened, so T-006 and T-007 may exist before M3-P1 dispatches." Measured on
   2026-08-06: M1-P5 merged at `58ac964`, M1-P6 merged at `7e1b5f1`, the M1 exit
   test PASSED with a 56-record bundle, and T-006, T-007 AND T-008 all exist.
   Four decision records also arrived (DR-0013 to DR-0016), two of which
   REVERSED positions revision 1 had encoded: DR-0015 removed an owner action
   the plan still carried, and DR-0016 replaced the response at an escalation
   bound the plan had written into mode data. Revision 2 is the re-grounding
   that absorbed all of it, and section 1.6 is its record.
   **The risk is not discharged, because the same shape applies one milestone
   along**: M2 has not run, M2's own plan is DRAFT at revision 2 and pending its
   adversarial review round 2, and six M3 phases ground on M2's DELIVERED
   artifacts rather than on its planned ones. The mitigation is the one that has
   now worked twice: re-ground at dispatch, not only at planning. Each phase's
   grounding line already requires verification of what it consumes; this risk
   adds the tuition feed to that list, which is exactly what the mechanism index
   makes cheap, and revision 2 makes the lookup a dispatch duty in every brief
   rather than a thing an orchestrator remembers.
8. **Two plans written concurrently.** M2 and M3 were detail-planned in
   parallel under DR-0011 by separate agents. The boundary is enumerated in the
   M2 plan's section 2 and accepted in D-M3-17, which makes disagreement visible
   rather than silent, but both documents are DRAFT and either can move under
   adversarial review. Every path this plan takes from the M2 plan is verified
   by the phase that uses it, and D-M3-16 forbids a quiet edit to a merged M2
   component. The residual risk is that an M2 review changes the manifest shape,
   the projection, or the coverage input contract after this plan is approved,
   which would land on M3-P1, M3-P2, and M3-P4 specifically.
9. **Suite wall time.** M1-P3 measured 63.4 seconds at its head and warned that
   the figure grows (`CLAUDE.md` warning 11, M1-P3 warnings 6 and 9). M3 adds
   ten phases of schema and CLI tests plus brief composition against the
   filesystem. Budget harness timeouts off the measured figure at each phase's
   head, and do not shorten real waits to compensate.
10. **Publication is irreversible.** A published name and version cannot be
   cleanly withdrawn, and fleet homes pin it from M3 onward. M3-P10's ordering
   (license gate, pack assertions, install-from-tarball, only then publish)
   exists for that reason, and the phase is dispatched at the strongest tier.
   **Narrowed at revision 2**: the NAME half is settled (DR-0008, `@tiphys`),
   so what remains is the version and the content, both of which the ordering
   above addresses. The new element is the two production dependencies: from
   M3-P1 onward the published package carries `ajv` and `yaml` and their
   transitive production trees, which every fleet home inherits and which
   DR-0013 marked the decision costly for. M3-P10 criterion 1b compares the
   gate's re-derived inventory against the one M3-P1 recorded when the pins were
   taken, so a tree that grew between the two is a finding rather than a
   surprise at publish time.
11. **A known flake in a suite this plan treats as a binary gate (NEW at
   revision 2; **THE INSTANCE IS CLOSED at revision 3 and the risk is narrowed
   rather than deleted**).** `test/liveness.test.ts:671` asserted a hardcoded
   `age 13s` and failed under CPU contention; it was seen once by each of two
   M1-P6 reviewers and was clean on serial re-run both times (tracked low
   CR-762). **M2 fixed it.** The assertion on `main` at `dbba3c8` now matches
   `age (\d+)s` and range-checks the captured value against the fresh band,
   with the fix's own reason in a comment above it ("The guarded property is
   PASS at the exact 901s threshold with an age at least as old as stamped and
   still inside the fresh band, not the exact second. Pinning \"13s\" flaked."):

```
$ git show origin/main:test/liveness.test.ts | sed -n '675p;684p'
    /^CHECK beacon PASS beacon present, age (\d+)s \(freshness threshold 901s\)$/m,
    `beacon age ${String(passAge)}s outside the fresh band [13, 901): ${doctored.stdout}`,
```

   The MECHANISM behind the risk is not closed and is why the entry stays: a
   suite whose exit code the whole plan treats as a binary fact can acquire a
   new non-deterministic member at any time, and M3-P2 promotes that reading
   into `gate-registry.yaml` where it becomes the definition every future
   project inherits. M3-P2's grounding note (c) is therefore restated rather
   than dropped: verify the suite's flake state AT DISPATCH and record what was
   observed, rather than reading this paragraph and concluding the question is
   settled. Every M3 phase's
   criterion 1 reads `node --test` exit 0 as a fact, and M3-P2 PROMOTES that
   reading into `gate-registry.yaml`, where it becomes the definition every
   future project inherits. **Mitigation, and it is weak on purpose because the
   strong version is not M3's to build**: M3-P2's grounding requires the
   suite's flake state to be VERIFIED at dispatch and recorded, and any open
   instance is named in the registry entry's `$comment`. M3 fixes no test in a
   file it does not acquire and M3 papers over nothing. The failure signature
   to watch for
   is an M3 phase re-running a red suite until it goes green and recording the
   green run, which is exactly the re-kick behaviour M3-P7's
   `checklists/flake-playbook.yaml` exists to make a decision rather than a
   habit.
12. **M3 inherits an open defect class in a file it consumes (NEW at revision
   2).** The unprobed-open class is still open in `src/lock.ts`, `src/pool.ts`
   and `src/brief.ts`; M3-P5 consumes the third and both M3-P5 and M3-P6 build
   `brief compose` on top of it. **Mitigation**: D-M3-27 binds all NEW M3 code
   to the delivered `classifyEntry` and `refuseOpenForWrite`, and M3-P5
   criterion 6c and M3-P1 criterion 5d stage the dangerous state with a real
   `mkfifo` in both directions. **The residue is real and is not closed**: M3
   stops the class growing to a thirteenth instance and leaves the twelve M1
   instances where they are, which is the same position M2 takes with its
   constraint M2-C-6, and neither milestone owns the fix. The failure signature
   to watch for is an M3 phase "fixing" `src/brief.ts` in passing, which would
   be an undeclared scope extension into an M1-P4 file and would repeat CR-521.

---

## Appendix A: M3 requirements coverage

Every row plan v1's Appendix A bucketed to M3 (74 rows), mapped to exactly one
phase of this plan. No orphans and no row in two phases. Parked: 0. Where a row
has a residue that M3 cannot discharge, the residue is named in the note and
tracked in Appendix C; the row itself is discharged here in the form its
governing decision fixed.

Per-phase counts: M3-P1 = 12, M3-P2 = 3, M3-P3 = 3, M3-P4 = 9, M3-P5 = 7,
M3-P6 = 13, M3-P7 = 13, M3-P8 = 3, M3-P9 = 11, M3-P10 = 0. Total = 74, which
equals plan v1 Appendix A's M3 bucket count of 74.

Revision 1 moved no row and changed no count. The artifacts revision 1 added
(the mechanism index and the two implementer-brief mechanism clauses from T-005,
the dual-review decorrelation check from DR-0012 and T-001, checklist framings,
`deviations-judged[]`, and the derived-check registry) are all delivered under
rows that already existed: R-091 for the index, R-033a for the brief clauses,
R-054 and R-060 for the checklist and verdict additions, R-002 and R-061 for the
`AGENTS.md` review duties. Tuition entries and decision records are not
requirement rows and never enter this table; adding one does not create a row,
which is why the count survives a fix round that added real scope.

**Revision 2 moved no row and changed no count either, and the check is the
same one.** The artifacts revision 2 added (the plan schema's
`hazard-classes[]`, `full` mode's `review-contracts[]` and
`escalation-bounds.on-exceeded`, the charter's reserved `release-verification`
field and its `stop-for[]` entry, the report and work-history `claims[]` and
`fix-round[]` sections, `checklists/hazard-review.yaml` and six new probes, the
verdict's `review-contract` and `hazard-classes-addressed[]`, the five
dispatch-contract and escalation clauses across the briefs and `AGENTS.md`, the
`claim-grep` and `fix-round-mechanism` clauses, three more tuition entries and
eight more seeded mechanisms) are all delivered under rows that already existed:
R-019 for the plan phase fields, R-096 and R-024 for the mode fields, R-022 and
R-090 for the charter fields, R-052a, R-057a, R-085 to R-089a for the record
contracts, R-053 to R-060 for the checklist and verdict additions, R-033a and
R-009b for the brief clauses, R-002, R-061 and R-013 for the `AGENTS.md` duties,
and R-091 for the tuition feed and its index. Per-phase counts are unchanged:
M3-P1 = 12, M3-P2 = 3, M3-P3 = 3, M3-P4 = 9, M3-P5 = 7, M3-P6 = 13, M3-P7 = 13,
M3-P8 = 3, M3-P9 = 11, M3-P10 = 0, total 74. **This is the second consecutive
revision in which real scope was added and no row moved**, which is what the
"artifacts, not rows" discipline is for and which is worth stating because the
alternative reading, that nothing was added, is false.

**Revision 3 moved no row, changed no count, and did not edit a single line of
the table below.** It is the third consecutive revision to add real scope
without moving a row: the artifacts revision 3 added (the ten phase
declarations, the `events[]` registry field, the `hazard-classes[].addressed-by`
field and its derived check, the shared dispatch-contract clause block, the
clause map's inventory source, two more falsification controls, the
`merge-is-not-complete-until` and `gate-result-is-scoped-to-its-run` clauses,
the checklist's `verifies-gate` field, and thirteen new acceptance criteria)
are all delivered under rows that already existed: R-019 for the plan phase
fields, R-094 for the registry, R-033a and R-009b for the brief clauses, R-053
and R-060 for the checklist and verdict additions, R-002 and R-061 for the
`AGENTS.md` duties. Verified rather than asserted, at revision 3:

```
$ git diff 70b8f05 -- delivery/plan/kernel-plan-m3.md | grep -cE '^[+-]\| R-'
0
$ awk '/^## Appendix A/,/^## Appendix B/' delivery/plan/kernel-plan-m3.md | grep -c '^| R-'
74
$ ... | awk -F'|' '{gsub(/ /,"",$3); print $3}' | sort | uniq -c
     12 M3-P1   3 M3-P2   3 M3-P3   9 M3-P4   7 M3-P5
     13 M3-P6  13 M3-P7   3 M3-P8  11 M3-P9   (M3-P10 = 0)
$ ... | awk -F'|' '{gsub(/ /,"",$2); print $2}' | sort | uniq -d
(empty: no duplicate row id)
$ comm -23 <(M3 Appendix A row ids) <(plan v1 rows bucketed M3); comm -13 ...
(both empty: exact set match in both directions, 74 and 74)
```

| Row | Phase | Artifact and note |
|---|---|---|
| R-001b | M3-P9 | `AGENTS.md` clause: never writes feature code in projects, infra-hotfix carve-out named |
| R-002 | M3-P9 | `AGENTS.md` clause per D-9; the structural half is `full` mode's stage list (M3-P3); L1 enforcement ticketed in M3-P8 |
| R-004 | M3-P5 | `roles/investigator.md`: root-cause verdict with evidence, fixes nothing |
| R-005 | M3-P5 | `roles/plan-writer.md`: never decides product questions, flags them as decision records |
| R-006 | M3-P5 | `roles/adversarial-plan-reviewer.md` with the blueprint's widened visibility; process doc role table annotated (SC-001, D-14, D-M3-12) |
| R-007 | M3-P6 | `roles/implementer.md` clause: never edits the plan, never re-investigates settled questions |
| R-009b | M3-P6 | `roles/clean-room-reviewer.md`: diff plus acceptance criteria only, edits nothing, posts nothing |
| R-010a | M3-P5 | verification-pass clause in the investigator and plan-writer briefs; verifier is the M2-P5 citation linter |
| R-011 | M3-P1 | `schemas/plan.schema.json` required section `report-code-disagreement` |
| R-012 | M3-P1 | plan schema `kind: verification-first` step plus the rule that an unverified claim requires one |
| R-013 | M3-P9 | `AGENTS.md` dispatch clause: dedicated investigator alongside plan writing; scout task, not a parallel phase |
| R-014 | M3-P1 | plan schema `fill-in` object with named slots and a computed `dispatchable` flag |
| R-015a | M3-P5 | investigator brief clause; made mechanical by the report contract's `repro` requirement (M3-P5 criterion 6) |
| R-016 | M3-P1 | plan schema: one file; format per DR-0006 (D-M3-07); commit-position check stays parked (plan v1 section 11 item 8) |
| R-017 | M3-P1 | plan schema `binding-rule` const carrying the process doc's exact sentence |
| R-018 | M3-P1 | plan schema required `standing-context` |
| R-019 | M3-P1 | plan schema phase fields, blueprint section 5 superset including `conflicts-with` and `parallelizable` |
| R-021 | M3-P1 | plan schema numbered `decisions[]` |
| R-022 | M3-P1 | `schemas/decision-record.schema.json` plus the charter's `escalation-contract` |
| R-024 | M3-P3 | `assurance-modes.yaml`: adversarial plan review precedes implement, or is declared in `skips[]` |
| R-026b | M3-P7 | `checklists/plan-review.yaml`: hidden dependencies and semantic coupling above the M5 file-overlap floor |
| R-027 | M3-P7 | `checklists/plan-review.yaml`: the state that can no longer exit |
| R-028a | M3-P7 | `checklists/plan-review.yaml`: testability claims checked against the M2-P2 evidence file, not admired |
| R-029 | M3-P5 | `schemas/finding.schema.json`: verdict, severity-ranked findings, concrete plan edits, `produced-by` (T-001) |
| R-030 | M3-P9 | `AGENTS.md` clause: all plan-review findings applied before execution; witnessed in the exit run at E1.5 |
| R-031 | M3-P6 | implementer brief clause: one phase, one branch, one pull request, with the M1-P3 naming conventions |
| R-033a | M3-P6 | implementer brief template, six required sections, gate list generated from the registry |
| R-034 | M3-P6 | implementer brief clause: stop and escalate, never improvise a different fix |
| R-035 | M3-P4 | `schemas/work-history.schema.json` `verification-first[]` with the `contradicts-plan` and `stopped-and-reported` rule (D-M3-03); brief clause cites it |
| R-037a | M3-P6 | implementer brief clause: repair lying test fakes first, old test red pre-fix |
| R-038 | M3-P6 | implementer brief clause: per-step local commits with meaningful messages |
| R-039 | M3-P6 | implementer brief clause: batched pushes every one to three steps, never per-commit |
| R-040 | M3-P6 | implementer brief clause: always push before long-running validation; L1 hook ticketed in M3-P8 (D-10) |
| R-043 | M3-P2 | `gate-registry.yaml` entry `verified-by: clean-room-checklist` with its probe id (D-11); probe supplied in M3-P7 |
| R-044 | M3-P2 | same shape as R-043 for changed component states (D-11) |
| R-049 | M3-P4 | report contract: a `green` gate result requires `wrapper-exit-code` (one clause serves R-049 and R-086) |
| R-050b | M3-P7 | `checklists/env-failure-diagnosis.yaml`: byte-identical route, reproduced outside the runner |
| R-052a | M3-P4 | `schemas/work-history.schema.json`: prompt verbatim, files touched, key decisions with the why |
| R-053 | M3-P7 | `checklists/clean-room.yaml` plus the verdict schema's `criteria[]` completeness rule |
| R-054 | M3-P7 | checklist extension mechanism (`tiphys checklist resolve --extra`); the orchestrator duty is an `AGENTS.md` clause (D-M3-03) |
| R-055 | M3-P7 | `checklists/clean-room.yaml` correctness probes: negatives, zero, empty, unicode, the state that can never exit |
| R-056a | M3-P7 | `checklists/clean-room.yaml` test-honesty probes; the revert check is the M2-P2 harness |
| R-057a | M3-P4 | report contract `deviations[]`, each with `plan-clause` and `why` |
| R-057b | M3-P7 | `checklists/clean-room.yaml`: each deviation judged against the plan's intent by the reviewer |
| R-059 | M3-P7 | `checklists/clean-room.yaml` blast-radius probes |
| R-060 | M3-P7 | `schemas/verdict.schema.json`: APPROVE or FIX-ROUND-NEEDED, severity-ranked findings, a concrete fix each |
| R-061 | M3-P9 | `AGENTS.md` clause: fix round returns to the same implementer, resumed with context intact |
| R-062 | M3-P9 | `AGENTS.md` clause: disputes allowed with evidence, orchestrator arbitrates |
| R-063 | M3-P1 | decision-record schema `reversibility` enum |
| R-065b | M3-P9 | `AGENTS.md` clause: the merge commit message tells the story |
| R-066 | M3-P7 | `checklists/flake-playbook.yaml` |
| R-067 | M3-P9 | `AGENTS.md` policy clause (D-13); L1 flake-signature counter stays deferred to v1.1 telemetry |
| R-070 | M3-P8 | tuition flow: a pipeline flaw is fixed immediately as a hotfix, promoted to next in queue |
| R-073 | M3-P9 | `AGENTS.md` policy clause: consolidation of small disjoint phases, the declared exception to R-032 |
| R-074 | M3-P6 | implementer brief clause: a fix round is one to two pushes |
| R-075 | M3-P3 | `role-model-config.yaml` kernel defaults plus the T-001 `review-model-family` option; charter override resolved by the M4 harness adapter |
| R-076 | M3-P9 | `AGENTS.md` policy clause plus the tuition entry duty |
| R-077 | M3-P9 | `AGENTS.md` policy clause: re-kick only when there is nothing pending to batch with |
| R-081b | M3-P6 | implementer brief clause: salvaged WIP is verified or rewritten, never trusted (T-002) |
| R-082a | M3-P6 | implementer brief clause: never end a turn to wait; applied to all roles through the shared clause block |
| R-083a | M3-P4 | `templates/warnings.md` plus the work-history schema's `environment-warnings[]` |
| R-084 | M3-P1 | `schemas/status-line.schema.json` with a closed five-value state enum; emitter with C-1 current-state file |
| R-085 | M3-P4 | report contract: an environmental claim requires evidence |
| R-086 | M3-P4 | report contract: "all green" means the wrapper's exit code, with parity counts |
| R-087 | M3-P6 | implementer and clean-room brief clause: false claims in comments and docs corrected loudly in place |
| R-088 | M3-P4 | report contract `honest-failures[]` requiring cause, exposure window, and structural fix |
| R-089a | M3-P4 | `schemas/final-report.schema.json`; parity verified by the M2-P6 coverage checker (R-089b) |
| R-090 | M3-P1 | decision-record `vetoable` and `revert-cost` fields plus the charter escalation contract |
| R-091 | M3-P8 | `schemas/tuition.schema.json`, the populated `tuition/` feed, `tiphys tuition add` and `list` |
| R-092 | M3-P5 | investigator brief clause: reproduce before fixing; if it will not reproduce, ship the harness and say so |
| R-093 | M3-P7 | `checklists/clean-room.yaml` shared-consumer probe: a field that renders and decides is two fields |
| R-094 | M3-P2 | `gate-registry.yaml` as the single source, with the `CLAUDE.md` drift check that makes "single source" true |
| R-096 | M3-P3 | `assurance-modes.yaml` `full` pipeline, the process doc's sequence enumerated |
| R-098 | M3-P8 | charter `retention` paths plus the `tiphys doctor` retention check |

Completeness check, three ways: the count above is 74, equal to plan v1's M3
bucket; every row id in plan v1's Appendix A whose bucket is M3 appears here
exactly once; and `scripts/check-clause-map.mjs` (M3-P1) enforces the same
mapping mechanically from M3-P1 onward, so a row that loses its artifact between
now and the exit test fails a gate rather than a reading.

## Appendix B: named M2 dependencies per phase

M2 must complete before M3 starts (plan v1 section 1.4 convention 6). Each M3
phase names the M2 components it consumes so a partial M2 is visible as a
blocked phase and not as a surprise at implementation time.

| Phase | M2 components consumed | What breaks without it |
|---|---|---|
| M3-P1 | M2-P4 scope auditor (the phase-declaration projection), M2-P5 citation linter, M2-P6 coverage checker, the M2 validator module WITH ITS DIAGNOSTIC CONTRACT and its own validation tests, `src/gates/schemas/` | the plan schema's open-questions and parked reference types are unconstrained; the projection stays a second hand-authored source; and, corrected at revision 2, the retirement of the M2 engine becomes a REWRITE of M2's tests rather than an engine swap unless M2 as delivered emits `INVALID <json-pointer> <message>` with deterministic ordering and its tests assert that contract rather than engine wording (M2-P1 step 4 and criterion 10). Step 1 verifies both; a divergence is an escalation, not an adaptation |
| M3-P2 | M2-P1 `gates.manifest.json`, its schema with the reserved `modes` field, and the runner | there is nothing to promote; the registry would be invented rather than promoted, and SC-011's semantics would be re-derived |
| M3-P3 | M2-P1 (gate set references), M2-P7's post-merge verification contract (rewritten in M2's revision 2 under DR-0014 as ONE pluggable contract with two static manifest entries and two reference adapters, not two bespoke verifiers) | `full` mode's stage list cannot reference the verification stages the process doc requires after merge. Corrected at revision 2: the stage names are `deploy-verify` and `migration-verify` as before, and what changed underneath them is M2's implementation shape, which M3 references by stage id and never by adapter |
| M3-P4 | M2-P3 full-suite wrapper, M2-P6 coverage checker and its declared input contract | the report contract cannot bind "green" to a real exit code and parity counts; finding-to-outcome parity has no checker and the two contracts drift apart |
| M3-P5 | M2-P5 citation linter | R-010a's verification pass has no attached verifier, which is the whole point of the row |
| M3-P6 | M2-P2 red-witness harness, M2-P8 credential scoping, M3-P2 registry | the red-witness clause has no evidence artifact; the no-pull-request clause contradicts nothing structural |
| M3-P7 | M2-P2 red-witness harness | R-028a and R-056a probes have no accepted proof and degrade to opinions |
| M3-P8 | none | |
| M3-P9 | M3-P2, M3-P3, M3-P7 (references only) | the anti-duplication rule has nothing to point at |
| M3-P10 | the whole M2 gate set, run by the exit test | the exit run's E1.6 cannot assert a full gate pass |

## Appendix C: recorded residues and options (not parked rows)

These are not requirement rows and are not deferrals of M3 scope. They are
things this plan deliberately does not build, recorded so a later reader does
not mistake absence for oversight.

1. Merging the clause map into the M2-P6 coverage checker. An option for M4 or
   later. **The COST is corrected at revision 3 (A-008), because revision 2
   recorded it wrongly and the wrong cost was what left M3 building a second
   completeness checker from scratch with an input-source gap the existing one
   does not have.** Revision 2's reason, that extending a merged M2 component
   would make every M3 phase a potential edit of M2's gate surface, is false
   against M2 as delivered: `src/gates/coverage.ts` takes `--config <path>`
   validated against `coverage-config.schema.json` and falls back to a built-in
   kernel config only when the flag is absent, so a second coverage instance is
   one JSON config document plus one registry entry and edits no M2 source. The
   real reason M3 still ships its own script is that the two checks answer
   different questions over different shapes (section 2.2), and what IS taken
   from M2-P6 rather than declined is the inventory-versus-coverage-table
   separation, which is not optional in the clause map and is what makes its
   missing-row condition computable at all.
2. L1 enforcement of R-002 (mode-aware branch protection) and R-040 (a
   pre-validation push check). Both are decided as L2 for now (D-9, D-10) and
   both are ticketed as tuition entries in M3-P8, which is exactly what plan v1
   section 11 item 7 said would happen when the tuition flow started.
3. An L1 flake-signature counter for R-067: deferred to v1.1 telemetry (D-13,
   blueprint section 12).
4. An L1 coverage floor for R-043 and R-044: optional later addition (D-11).
5. The charter override resolution for R-075: configuration is shipped here, the
   resolver is the M4 harness adapter (blueprint section 6).
6. Status line transport: schema and emitter here, delivery in M4 (D-M3-14).
7. The cloud fleet resume machinery: specified in `AGENTS.md` by M3-P9, executed
   by M4 (PR-201, unchanged).
8. Artifact renderers, a tuition pull-request promoter, and any mode-enforcement
   engine: D-M3-09 and D-M3-10.
9. A computable check for the push-cadence trio (R-038, R-039, R-074). The
   proxy exists (commits per push from git history, CI runs per phase from the
   workflow API) and is declined with reasons in D-M3-25, rather than the
   question going unasked as it did in revision 0 (M3R-009).
10. Carried-forward items in `delivery/STATE.md`, re-checked at revision 2
   against the file as it now reads rather than as revision 1 read it. The list
   has grown from five to eight, and M3's dispositions are:
   **Unowned by M3, stated so the silence is a choice**: the non-atomic
   `meta.json` write (the M2 plan is where it belongs, and it is a source defect
   not a layer-2 artifact); M1-P4's inert liveness hook, which M3 does not
   remove because no M3 phase acquires `src/spawn.ts`, and if any phase ends up
   needing that file it removes the hook in the same change and declares it;
   deadline-less abandonment, which plan v1's own not-proven list assigns to M2
   or M4; **the unprobed-open class across `src/lock.ts`, `src/pool.ts` and
   `src/brief.ts`** (NEW in the list at revision 2), which M3 does not close and
   does not grow, per D-M3-27 and risk 12; and **M1-P6's three tracked lows**
   (NEW at revision 2), of which CR-762 is risk 11's subject and belongs to M2,
   CR-760's INSTANCE is gone with the fan-in job DR-0017 deleted (corrected at
   revision 3) while its MECHANISM shapes D-M3-28, and M3 owns neither, and
   CR-761 is a documentation narrowing touching no M3 artifact.
   **Owned by M3**: the top-level error handler, M3-P1 under D-M3-21; the
   mechanism index, M3-P8 under D-M3-23; **the second review contract per code
   phase** (NEW in the list at revision 2, from T-007), owned across M3-P1's
   `hazard-classes[]`, M3-P3's `review-contracts[]`, M3-P6's brief field,
   M3-P7's hazard checklist and M3-P9's dispatch duty, under D-M3-32; and **the
   work-history contract covering impossibility, coverage and remedy claims**
   (NEW at revision 2, from T-006), owned by M3-P4's `claims[]` section and
   M3-P7's two probes, under D-M3-30.
11. Counting fix rounds. `full` mode carries DR-0012's stop-rather-than-grind
   limits as `escalation-bounds` data (M3-P3), and nothing in M3 counts rounds
   or detects recurrence. The bound is a number the orchestrator brief cites,
   which makes it visible and auditable but not enforced; enforcement needs
   pipeline history M3 does not have. Recorded rather than implied. **Revision 2
   adds the response half (`on-exceeded`, DR-0016) as data alongside the limits,
   which changes what an unenforced bound MEANS but not whether it is
   enforced**: an orchestrator reading the bound now finds the action as well as
   the threshold, and still nothing counts.
12. **The charter coherence check for release verification (NEW at revision 2,
   available and declined with a reason).** The interface investigation
   recommends it: a charter declaring a non-local deployment topology while
   declaring release verification `none` is internally contradictory, that
   contradiction is checkable across two fields of one document, it is a Kind B
   derived check in this plan's own vocabulary, and it costs one check and no
   new artifact. It is the only one of the investigation's four defences that
   catches a project lying to itself deliberately rather than by omission, so
   the case for it is real and is not dismissed. **It is declined for M3 because
   its predicate cannot be written yet.** The investigation says so itself, at
   section 4.1 item 4 ("the exact predicate, non-local topology, needs a real
   charter to be written against") and again at section 8 item 4, which names
   what settles it: the first real project charter, at M4's pilot. Writing an
   invented predicate now would produce a check that is either trivially true or
   fails honest charters, and building enforcement for a state the milestone
   never enters is the M1-P3 shape risk 1 exists to prevent. What M3 DOES take
   from the same section, because it needs no predicate, is the positive
   declaration with a required reason (D-M3-29) and the `stop-for[]` entry for a
   change to `none` (M3-P1 step 3). Recorded here as an option for M4, not as a
   debt.
13. **A compactor for `delivery/` (NEW at revision 2).** M3-P8 step 2c states
   that the tuition flow's projection model is also the repository's compaction
   model: projections are the read layer and must stay dense, raw entries are
   the archive layer and are read only in dispute, and once a raw entry's
   durable residue is projected out, git history makes removing it from the
   working tree lossless. **No compactor is built and none is proposed here.**
   What M3 ships is the structural distinction plus the check that makes an
   archive removal safe rather than lossy
   (`mechanism-rule-evidence-resolves`: a projection whose evidence no longer
   resolves fails). Recorded so a later reader can see that the model was stated
   deliberately and the tool was not built, rather than concluding either was an
   oversight.
