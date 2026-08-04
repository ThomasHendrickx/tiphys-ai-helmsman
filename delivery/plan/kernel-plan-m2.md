# Tiphys Kernel Plan M2: Deterministic gates

- Status: DRAFT, pending adversarial review
- Baseline commit: 5b8e8aef6e5b21de9f9a919fa01d77e748cc4ee9 (branch claude/state-p4-start; `main` at 54ceb6eb27c7a0fa07ae2b67d09f0dc41d9382e4, M1-P3 merged, M1-P4 in flight). Decision record DR-0012 (delegated merge authority) landed at 52e1724 during drafting and is applied in section 3 and section 1.4.
- Milestone: M2 (deterministic gates), blueprint section 13 row M2
- Binding rule: "If it is not written here, it is not being made. Unanswered questions go to the orchestrator."
- Relation to `delivery/plan/kernel-plan-v1.md`: this document expands section 5 of kernel plan v1 (the M2 outline) into full phases in the format of v1 section 3. Kernel plan v1 remains the governing plan for everything else: its header, section 1 (standing context and binding conventions), section 2 (SC dispositions), section 3 (M1 phases, constraints C-1 to C-3, the test accounting rule, the invocation form), sections 6 and 7 (M3 to M5 outlines), section 8 (decisions D-1 to D-19), section 9 (owner decisions), section 11 (parked) and Appendix A (the 115-row coverage table) are unchanged by this document and are not restated except where cited. Where this plan decomposes M2 differently from v1 section 5's seven outline items, the difference is recorded as a numbered decision in section 5 below (M2-D-01). No row of v1's Appendix A moves buckets: all 16 M2 rows stay in M2.
- Process summary: written in parallel with M1-P4 implementation under decided DR-0011 (planning produces documents and touches no source file), from kernel plan v1 section 5, the 16 M2-bucketed rows of `delivery/requirements/migration-table.md`, blueprint sections 1, 4, 10 and 13, the process doc disciplines these gates mechanize, decision records DR-0002 to DR-0007 and DR-0011, tuition T-001 to T-004, and the M1 review and work-history record (`delivery/review/`, `delivery/work-history/`) read for defects that a gate would have caught mechanically.
- Series note: decisions in this document are numbered M2-D-nn and constraints M2-C-n, so they never collide with v1's D-nn and C-n. The M3 plan is being written concurrently by a separate agent; the orchestrator reconciles the two at the boundary named in section 2.

---

## 1. Standing context

### 1.1 What M1 delivers, and what of it M2 consumes

M2 starts only after the M1 exit test has passed and its evidence is committed on `main` (kernel plan v1 section 4: "The M2 milestone may not start before that evidence commit is on main"). At that point the following exist and are the ground M2 builds on. Each entry names the M2 phase that consumes it.

| M1 deliverable | Where | Consumed by |
|---|---|---|
| npm package skeleton, `tsc -b` build, `node --test` suite, `dist/` never committed (D-17, D-18) | package.json, tsconfig.src.json, tsconfig.test.json | every phase |
| CLI dispatch table and the `EX_USAGE` 64 contract | src/cli.ts, bin/tiphys.ts | M2-P1 (the only phase that edits src/cli.ts) |
| CI workflow: matrix job `test`, non-matrixed fan-in job named exactly `gates` (DR-0004's required check context) | .github/workflows/gates.yml | M2-P1 (adds a step inside the `test` job, never a new required check name) |
| behavior registry, appended by every phase (EXT-F-05 test accounting rule) | test/behaviors.json | M2-P3 (makes it executable), every phase (registration) |
| fleet layout, `doctor` and its readiness profiles with WARN-to-FAIL promotion (EXT-F-08) | src/fleet.ts, src/commands/doctor.ts | M2-P1 (profile promotion is the model for gate applicability; no doctor edit is planned) |
| executor adapter (local subprocess), launch record, turn-end contract, task meta | src/spawn.ts, src/hooks.ts, src/task.ts | M2-P8 (credential scoping edits the child environment the adapter builds) |
| exit-test harness pattern: `--mode local|full`, per-step JSON evidence records, no record for a command not executed, command-scoped git identity, gh-free deterministic PATH | scripts/m1-exit-test.sh, scripts/stub-payload.sh | M2-P9 (same shape for the M2 exit test), M2-P8 (moves PR creation out of the stub payload) |
| worktree pool, lease lock, watcher, liveness guard | src/pool.ts, src/lock.ts, src/watcher.ts, src/liveness.ts | not consumed by M2. No M2 phase edits them. |

M1-P4, M1-P5 and M1-P6 are not merged at the time this plan is written. Their contracts above are as-planned, not as-delivered, which produces a binding constraint:

- **M2-C-1 (verify the delivered M1 contract before consuming it).** Any M2 phase whose steps consume an M1 contract listed above performs, as its numbered step 1, a verification-first check that the delivered shape matches what this plan assumes, records the finding verbatim in its work history before any code, and stops and escalates to the orchestrator if it diverges (process doc section 2b; R-012's verification-first construct; v1 phase field "files-to-touch (verify before editing)"). Improvising around a divergence is forbidden (v1 Never list).

### 1.2 What M2 is

M2 mechanizes seven disciplines that the current process enforces by prompt and by hand, plus the substrate they need. The placement rule (blueprint section 1) is the reason each one is a script: every M2 component is a computable check with an exit code, and none of them requires judgment to produce a verdict. Where judgment remains (whether a declared witness class is honest, whether a deviation serves the plan's intent), it stays with the L3 reviewer and is named as such rather than faked in a script.

The blueprint's M2 contents (section 13) are: red-witness harness (first), full-suite wrapper ported into kernel bin, scope auditor, citation linter, coverage checker, deploy and migration verifiers, credential scoping. All seven are planned below. Two additions are made and justified in section 5: the gate contract and runner that all seven emit into and are invoked by (M2-D-02), and the run-pinning module that T-004 requires (M2-D-06).

### 1.3 Conventions and constraints carried forward

All binding conventions of v1 section 1.4 apply unchanged (English only; npm only; no em dashes and pure ASCII; falsifiable criteria only with the register "node --test exits 0 and reports N tests, N > 0"; milestone exit tests are hard gates; commit messages carry no tool names). Parallelism policy is now governed by decided DR-0011 rather than by v1 section 1.4 item 5; see M2-D-03.

Constraints C-1, C-2 and C-3 of v1 section 3 carry forward and each one bites in M2:

- **C-1 (one current-state authority, never a log tail).** The full-suite wrapper must derive counts from the runner's machine-readable reporter output and the process exit code, never by scraping a summary line out of a log tail (M2-P3 criterion 6 witnesses this with a test that prints a counterfeit summary line to stdout). The same rule governs the deploy verifier: the platform's parsed API response is the authority, not a log.
- **C-2 (no pid, process liveness, signals or /proc for identity or exclusion).** No M2 gate probes a process. The deploy verifier's readiness is a polled API response with a wall-clock timeout; the credential-scoping gate inspects an environment it constructs, not a running process.
- **C-3 (never auto-background a long-running process).** The gate runner runs gates sequentially in the foreground; the deploy verifier polls in the foreground with a declared timeout; no gate spawns a detached child and no gate has a daemonize flag (structural greps are acceptance criteria in M2-P1 and M2-P7).

New constraints declared by this plan, binding on every M2 implementer:

- **M2-C-2 (never green by omission).** No gate reports green for work it did not do. Every green result record carries a `units` count strictly greater than zero, where the unit is declared per gate in the manifest (tests witnessed, files audited, citations resolved, findings checked, migrations compared). A gate that exits 0 having examined nothing is recorded as `error`, never green. This is the executable form of SC-011's precondition semantics and of the M2 exit test's "zero vacuous passes" clause.
- **M2-C-3 (fail closed).** A check that cannot reach a verdict reports `error`. It never reports `not-applicable` (which asserts a precondition was evaluated and found unmet) and never reports green. Precondition evaluation that itself fails is `error`. Adopted verbatim from firstmate's fail-closed rule, already adopted for teardown landedness in v1 M1-P4 step 5 (FM-035, FM-038).
- **M2-C-4 (a gate never mutates the caller's working tree).** Gates that must run tests against another state (the red-witness harness) do so in a scratch clone they create and own. After any gate run, the caller's repository has an unchanged HEAD and a byte-identical working tree. Grounded in T-004: shared mutable ground turns one run's experiment into another run's phantom finding.
- **M2-C-5 (evidence is pinned or it is not evidence).** Any gate that executes a test suite records a pin manifest (file set, sha256, size, mtime) of its declared source roots at run start and at run end. Any difference in any of the four fields, including a byte-identical rewrite that only changes mtime, makes the run non-evidence: the record's status is `error` and the gate exits nonzero. T-004 records the exact case that motivates the mtime clause: `src/lock.ts` was rewritten in place with pristine content 42.8 seconds into a failing run, so a content-hash-only pin would have declared that run clean.

### 1.4 Shared phase fields, stated once

- **migrations: none** for every M2 phase (this is a library, v1 section 3).
- **substrate (DR-0007): substrate-neutral** for every M2 phase. Gates are files, subprocesses and exit codes, identical on a persistent machine and in a reclaimable cloud session. Two gates reach outside the filesystem: the deploy verifier calls a platform HTTP API and the credential-scoping gate's live half calls the GitHub API. Neither is substrate-specific; both are precondition-gated and report not-applicable when their configuration is absent (M2-P7, M2-P8).
- **Invocation form**, inherited from v1 section 3 (PR-102): in phase steps and acceptance criteria, `tiphys <cmd>` means `node bin/tiphys.ts <cmd>` (the source entry, no build required). The M2 exit-test harness invokes `dist/bin/tiphys.js` after `npm run build`, which is where the compiled form is witnessed.
- **Test accounting rule** (EXT-F-05, v1 section 3) applies to every M2 phase unchanged: each phase names its new behaviors, adds at least one identified test per behavior, registers the mapping in `test/behaviors.json`, and no previously registered behavior's mapped test may disappear (checked by name, never by count). From M2-P3 onward this rule is executable rather than procedural, which is exactly the gap `delivery/review/clean-room-m1-p1.md` finding CR-002 recorded as open until M2.
- **Standing pre-authorized extras** for M2 phases are three, not two: `test/behaviors.json`, the phase work history (`delivery/work-history/m2-pN.md`), and `gates.manifest.json` (each gate phase appends its own entry, the same append-only pattern as the behavior registry). M2-P1 adds the third to CLAUDE.md so the scope auditor and the human reviewer read the same list. Note for the merge gate: DR-0012's clean-review clause 5 says "the two standing pre-authorized extras", which is correct for M1; from M2-P1's merge onward the authoritative list is CLAUDE.md's, and it names three.
- **Standing environment warnings** of CLAUDE.md apply to every M2 implementer and must be forwarded in every brief. Four of them bite M2 specifically: warning 1 (local Node 22 versus the >=26 floor: any criterion asserting exit 0 under the floor is floor-gated locally and witnessed in CI), warning 4 (computed-URL dynamic import from `test/` into `src/`), warning 6 (`gh` absent locally, present in CI: use a deterministic gh-free PATH), and warning 7 (`--test-name-pattern` must precede the positional path, which the red-witness harness depends on for running one named test).

---

## 2. Boundary with M3

The M3 plan is being detail-planned concurrently. These items sit on the boundary and are claimed or disclaimed here explicitly rather than silently. The orchestrator reconciles; where this plan and the M3 plan disagree, that disagreement is visible because both name the item.

1. **Gate registry versus gate manifest (R-094).** M2 builds a **manifest**: one file, `gates.manifest.json`, describing the gates of one repository (this one), with per-gate preconditions and applicability. M3-P3 builds the **canonical registry** (R-094 is an M3 row in v1's Appendix A): the single source consumed by CI and briefs, keyed per assurance mode. **M2 deliberately does not implement assurance modes.** The manifest schema reserves a `modes` field, validated if present and ignored by the M2 runner, so M3's promotion is an additive change and not a rewrite. Claim: manifest and runner are M2; registry, mode selection and brief consumption are M3.
2. **Report contract and status line (R-084 to R-089a).** M3-P1. M2 claims only R-089b, the machine half: the coverage checker's finding-to-outcome parity. Because the report contract does not exist yet, M2-P6 defines its own **input contract** (a findings inventory plus a coverage table in a declared shape) and the M3 report schema must emit that shape or supersede it. This is a real dependency in the M3 direction and is listed in section 7 as a risk. M2 must not invent a report schema.
3. **Plan schema (R-011, R-018, R-019, R-021).** M3-P1. M2's scope auditor consumes a minimal **phase declaration** projection (`delivery/plan/phases/<phase-id>.json`: id, branch, files-to-touch, extras, citations), authored by the orchestrator from the plan document before dispatch. Recommendation to the M3 planner: make the plan schema's phase object a superset of these fields, so the projection becomes a generated view of one source rather than a second source that can drift. Until then the drift risk is real and named in section 7.
4. **Schemas directory.** CLAUDE.md reserves the repository-root `schemas/` for M3 kernel deliverables, placeholders only. M2's schema documents therefore live under `src/gates/schemas/` and ship in the package (M2-D-05). M3-P1 or M3-P3 decides whether to relocate them under the canonical `schemas/`; that relocation is one move plus one path constant.
5. **JSON Schema validation technology.** M2 needs enough of JSON Schema to validate a manifest and a result record. It ships a minimal in-repo validator with a closed, documented keyword set that **errors loudly on any keyword it does not implement** (M2-D-04). M3-P1 authors five artifact schemas that will exercise far more of the specification; the decision to adopt an external validator library belongs there, with M2's module boundary as the seam. M2 must not pre-empt it.
6. **Fix-round verification as a pipeline requirement.** T-003's first structural consequence ("full mode must require a delta review or verification of every fix round") is a pipeline-shape rule, not a gate: no script can tell an honest fix round from a dishonest one. It belongs to M3's assurance-mode definitions and AGENTS.md (R-024, R-096, R-002). M2 disclaims it and instead builds the two mechanical halves T-003 does name for M2: the dangerous-state witness requirement and the hand-authored-fixture flag (M2-P2).
7. **Universal-quantifier linting in work histories** (T-003 structural consequence 3, "always"/"never"/"in all cases" claims requiring a cited counter-experiment). Partially computable, but its subject is the report and work-history contract, which is M3-P1. M2 disclaims it. Recorded here so it is not lost between the two plans.
8. **Tuition flow (R-070, R-091) and role briefs (R-004 to R-009b).** M3. M2 produces two tuition candidates by construction (see section 7) but does not build the flow.
9. **Credential scoping's owner half.** M2-P8 builds the kernel-side environment scrub and the token probe. Branch protection (R-064, R-065a) is M4 in v1's Appendix A; DR-0004 items 2 and 3 are already-approved owner actions; DR-0004 item 4 is the M2 owner action A-3 in section 6. No overlap with M3.

---

## 3. Phases

Nine phases. Branch names follow `claude/m2-pN-<slug>`. One phase, one branch, one PR. Merge authority: decided DR-0012 delegates merging to the orchestrator for the duration of the owner's absence, conditional on two independent clean-room reviews on different model families with no unresolved high or medium finding, CI green on the exact head, and a passing scope audit; its limits also hold, in particular that milestone exit tests stay hard gates and are presented to the owner regardless. Two M2 pull requests edit CLAUDE.md (M2-P1 and M2-P3, see M2-D-12): under DR-0012's "never merge anything that changes an owner-reserved matter" limit, the orchestrator either obtains owner sanction for those two or records why the standing-extras list and the gate list are not owner-reserved matters. Phase declarations for the scope auditor are authored by the orchestrator before dispatch and committed to `main`, never authored on the phase branch (M2-P4 step 4 explains why).

### M2-P1: Gate contract, manifest, and runner

- id: M2-P1
- branch: claude/m2-p1-gate-contract-and-runner
- intent: Establish how a gate is declared, invoked, and reported, so the seven gates that follow emit one comparable record type and the milestone's exit test can count them. Deliver the runner, the manifest, the result record and its schema, the precondition semantics, and the CI wiring that runs the (initially empty) gate set on every kernel PR.
- grounding: M1 merged with exit evidence on `main`. DR-0006 decided (lintable-schema-first governs gate output formats). SC-011 disposition (a gate whose precondition is unmet reports not-applicable, never green) and its M2 exit-test clause. Blueprint section 4 (every toolbelt entry is a contract with an exit code) and FM-060 as adopted in v1 M1-P4 (every toolbelt boundary is a subprocess with an exit code). Verify absent first: `src/gates/`, `gates.manifest.json`.
- steps:
  1. M2-C-1 verification: confirm the delivered `src/cli.ts` dispatch shape, the `EX_USAGE` constant, and the delivered `.github/workflows/gates.yml` job layout (matrix job `test`, fan-in job named exactly `gates`). Record findings before any code. Confirm that adding a step inside the `test` job introduces no new check-run name, because DR-0004's ruleset names the context `gates` verbatim and a second required context would silently never complete.
  2. Create `src/gates/result.ts`: the `GateResult` record. Fields: `gate` (id), `status` (exactly one of `green`, `red`, `not-applicable`, `error`), `units` (integer), `unitLabel` (string), `startedAt`, `endedAt` (ISO-8601), `precondition` ({id, met, reason, evidence}) when the gate declares one, `detail` (one line), `evidence` (array of relative paths), `pin` (optional, written by gates bound by M2-C-5). Constructor rule enforced in code: a record with status `green` and `units` 0 is rewritten to `error` with a reason naming M2-C-2, and cannot be constructed otherwise.
  3. Create `src/gates/schemas/gate-result.schema.json` and `src/gates/schemas/gate-manifest.schema.json` (JSON Schema, DR-0006). Create `src/gates/validate.ts`: a minimal validator over a closed keyword set (`type`, `required`, `properties`, `additionalProperties`, `enum`, `items`, `minimum`, `minItems`, `pattern`, `const`, `$ref` to local definitions). Any keyword outside that set encountered while loading a schema is a load error naming the keyword, never a silent pass (M2-D-04).
  4. Verification-first sub-step, then implement: determine empirically whether `tsc -b` at the pinned compiler emits `src/gates/schemas/*.json` into `dist/` (JSON module resolution) or whether an explicit copy step in the build script is required; record which, implement the one that works, and add the schemas to the package `files` allowlist if needed. Criterion 9 witnesses the outcome from `npm pack`, so either mechanism is acceptable and neither may be assumed.
  5. Create `src/gates/manifest.ts` and the repository's own `gates.manifest.json` (initially with zero gate entries plus the schema reference; each later phase appends its entry). Manifest entry fields: `id`, `command` (argv array, executed as a subprocess), `unitLabel`, `applicability` (`required` or `conditional`), `precondition` ({id, kind, ...}) where `kind` is one of a closed set: `file-exists`, `file-absent`, `branch-matches`, `diff-touches`, `command-exit-zero`. Reserved and validated but unused in M2: `modes` (section 2 item 1).
  6. Create `src/gates/run.ts` and `src/commands/gates.ts`; register `gates` in `src/cli.ts` (the only M2 edit to that file). `tiphys gates run --manifest <file> --evidence <dir> [--only <id>...]` evaluates each gate's precondition, runs applicable gates sequentially in the foreground as subprocesses (C-3), captures stdout and stderr to the evidence directory, and reads each gate's result record. Exit-code contract, documented in the module and in CLAUDE.md: `0` green, `1` red, `20` not-applicable, `21` gate error, `64` usage (inherited). Status resolution rule (the uncaught-exception trap): a gate subprocess that exits nonzero **without having written a result record** is recorded `error`, not `red`, because Node exits 1 on an uncaught exception and that collides with the red code. Runner exit: 0 only when there are zero `red`, zero `error`, and every `required` gate is `green`; a `required` gate reporting `not-applicable` makes the runner exit nonzero naming the gate.
  7. Write `summary.json` into the evidence directory: manifest path and sha256, per-gate status, and the counts (`declared`, `applicable`, `green`, `red`, `not-applicable`, `error`, `vacuous`). No record is written for a gate that was not executed (M1-P6 discipline).
  8. Wire `node dist/bin/tiphys.js gates run` into `.github/workflows/gates.yml` as an additional step **inside the existing `test` job**, after `npm test`. Update CLAUDE.md: the standing extras list gains `gates.manifest.json`, and the gate list gains a fourth entry (`tiphys gates run`) with a note that the M3 registry replaces the section.
  9. Tests in `test/gates.test.ts` against fixture manifests and fixture gate scripts; register behaviors.
- files-to-touch (create unless marked): src/gates/result.ts, src/gates/validate.ts, src/gates/manifest.ts, src/gates/run.ts, src/gates/schemas/gate-result.schema.json, src/gates/schemas/gate-manifest.schema.json, src/commands/gates.ts, gates.manifest.json, test/gates.test.ts; src/cli.ts (edit), .github/workflows/gates.yml (edit), CLAUDE.md (edit), package.json (edit only if step 4's finding requires a build or files change).
- acceptance criteria:
  1. `npm ci`, `npm run build`, `npm test` each exit 0; after the build `git status --porcelain` is empty.
  2. Against a fixture manifest of four gates (one exiting 0 with a record of units 3, one exiting 1 with a red record, one whose `file-exists` precondition names an absent file, one exiting 21 with an error record), the evidence directory contains exactly four result records with statuses `green`, `red`, `not-applicable`, `error` in that mapping, `summary.json` reports counts declared 4, applicable 3, green 1, red 1, not-applicable 1, error 1, and the runner exits nonzero.
  3. Against a manifest containing only the green gate, the runner exits 0 and `summary.json` reports applicable 1, green 1, vacuous 0.
  4. A fixture gate that exits 0 while writing a record with `units` 0 is recorded `error`, the summary's `vacuous` count is 1, and the runner exits nonzero; the same gate with `units` 1 is recorded `green` and the runner exits 0 (M2-C-2, falsifiable in both directions).
  5. A gate whose `applicability` is `required` and whose precondition is unmet is recorded `not-applicable` and the runner exits nonzero with a message naming the gate; the same gate declared `conditional` leaves the runner at exit 0 (SC-011 with teeth, both directions).
  6. A precondition of kind `command-exit-zero` whose command does not exist yields status `error` for that gate, never `not-applicable` and never `green`, and the runner exits nonzero (M2-C-3).
  7. A fixture gate that throws an uncaught exception (exit 1, no record written) is recorded `error`, not `red`, and the summary's error count is 1 (the exit-code collision is handled, not assumed away).
  8. Schema validation: a manifest missing `id` is rejected naming the field; a result record carrying a status outside the four-value enum is rejected; loading a schema document containing a keyword outside the closed set fails with an error naming the keyword rather than validating anything (M2-D-04, falsifiable).
  9. `npm pack` output contains both schema documents, and `node dist/bin/tiphys.js gates run --manifest <fixture> --evidence <dir>` behaves identically to the source entry on criterion 3's fixture (the compiled path resolves its schemas).
  10. `tiphys gates run` with an unknown flag exits 64 and prints usage to stderr (inherits M1's contract).
  11. Structural: grep over `src/gates/` shows no `detached: true`, no `unref`, no `process.kill`, no `/proc`, no pid usage (C-2, C-3).
  12. The phase PR shows exactly one required check named `gates` completed successfully, and the check-run list contains no new required context (inspection of the check-runs API output, recorded in the work history; DR-0004's ruleset context is unchanged).
  13. `node --test` exits 0 with 0 failing and zero unaccounted tests; `test/behaviors.json` maps every behavior newly named by this phase's criteria to a test present in this run, and every previously registered mapping still resolves by name.
- suggested model tier: strongest (the record shape, the status vocabulary and the exit-code contract are consumed by seven phases and promoted by M3).
- citations: SC-011 (precondition semantics, resolved here in executable form), DR-0006 (lintable schema first, gate output formats), DR-0004 (the `gates` required check context must not change), blueprint section 4 (toolbelt contracts) and section 1 (placement rule), v1 M1-P4 grounding (FM-060 subprocess boundaries). Requirement rows discharged: none (see Appendix A note on the spine).
- conflicts-with: M2-P3 (CLAUDE.md), M2-P9 (.github/workflows/gates.yml). All later phases append to gates.manifest.json.
- blocked-by: M1 exit test passed and its evidence committed on `main` (hard milestone gate, v1 section 4).
- parallelizable: no. Every other M2 phase consumes this contract.

### M2-P2: Red-witness harness

- id: M2-P2
- branch: claude/m2-p2-red-witness-harness
- intent: Make red-witness discipline mechanical: a test counts as guarding a behavior only when it has been demonstrated red against a declared dangerous state and green at head, in a pinned, isolated run, with the evidence emitted as a record.
- grounding: M2-P1 merged. Blueprint section 4 (contract: input test IDs plus baseline SHA, asserts red on baseline and green on head, emits an evidence file) and section 10 point 4 (the witness target is latest `main`, re-verified at merge time; the merge-time re-run is M5, see step 7). CLAUDE.md's strengthened red-witness rule and tuition T-003 (the witness must be red against the DANGEROUS state, and hand-authored fixtures standing in for real captured output are a defect class). Tuition T-004 (a run that cannot pin its source is an anecdote, not evidence).
- steps:
  1. M2-C-1 verification of M2-P1's record and manifest contracts.
  2. Create `src/gates/pin.ts` (T-004, M2-C-5): `takePin(roots)` returns `{roots, takenAt, files: [{path, sha256, size, mtimeMs}]}`; `comparePins(a, b)` returns the differences, including added and removed paths. Any difference of any kind, including a byte-identical rewrite that changes only mtime, is a difference. Both pins are written into the evidence record.
  3. Create `src/witness/spec.ts` and `src/gates/schemas/witness-spec.schema.json`. A witness spec (JSON per DR-0006) declares, per witness: `id`; `behavior` (must resolve in `test/behaviors.json`); `tests` (test names, run with `--test-name-pattern` placed before the positional path, warning 7); `class` (`additive`, `destructive`, or `classification`); `dangerousState` ({kind: `baseline-ref` | `patch` | `mutation`, plus the ref, patch path, or file-and-substitution}); `deterministic` (boolean) and `repeats` (integer, default 5 when `deterministic` is true); optional `consumesExternalOutput` ({program, captures: [paths], provenance: the command that produced each capture}).
  4. Create `src/witness/run.ts`. Per witness: create a scratch clone of the repository into a temp directory owned by the harness and never write to the caller's tree (M2-C-4); fetch `origin` and resolve the baseline ref from the fetched remote, never from a possibly stale local ref (the PR-001 and EXT-F-03 lesson class, already paid for once in M1); take the start pin; apply the declared dangerous state; run the named tests; require a nonzero exit with each named test reported failing; repeat `repeats` times when `deterministic` is declared and record every run's outcome; restore head; run the named tests green; take the end pin; write the record.
  5. Refusal rules, evaluated before any test runs, each producing `red` with a reason line naming its source: (a) `class` is `destructive` or `classification` and `dangerousState.kind` is `baseline-ref` (T-003: a bare absent-feature baseline is not the dangerous state); (b) `behavior` does not resolve in `test/behaviors.json`; (c) `consumesExternalOutput` is declared and no capture is cited, or a cited capture is missing or empty, or no cited capture's basename is referenced from the sources of the named tests (T-003 lesson 4: hand-written strings chosen to match the implementation are not a witness). Each cited capture's sha256 and provenance line are recorded.
  6. Determinism rule (the U-10 shape, `delivery/review/verification-m1-p3-fix-round-2.md`): when `deterministic` is true, every repetition must be red; if k of n repetitions are red with k < n, the witness is `red` and the record carries the measured rate k/n. When `deterministic` is false, the measured rate is recorded and a rate of 0/n is still `red`.
  7. Create the gate entry `red-witness` in `gates.manifest.json`. Applicability: precondition `diff-touches` on `src/` or `bin/`. If source changed and no witness spec exists for the phase, the gate is `red` (never `not-applicable`); if no source changed, `not-applicable` with the reason recorded. Merge-time re-verification against the exact merge target (blueprint section 10 point 4) is expressed as a parameter (`--baseline <ref>`) and is **not** wired as a merge gate here: M2 runs no parallel phases and has no merge-time gate to hang it on, and building the enforcement now would be machinery for a state this milestone does not reach (M2-D-08, and the M1-P3 lesson).
  8. Tests in `test/witness.test.ts` and `test/pin.test.ts` against scratch git repositories created in the test with command-scoped git identity (warning 5).
- files-to-touch: src/gates/pin.ts, src/witness/spec.ts, src/witness/run.ts, src/gates/red-witness.ts (the gate entry point with a main guard), src/gates/schemas/witness-spec.schema.json, test/witness.test.ts, test/pin.test.ts (create); gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. On a scratch repository where the named test is red at the declared dangerous state and green at head, the harness exits 0, the record's status is `green`, `units` equals the number of witnesses evaluated, and both pins are recorded and equal.
  2. Given a witness whose test is **green against the declared dangerous state** (the T-003 shape: the fixture repository stages a destroy against a branch carrying no commits), the harness exits nonzero and the record names the witness id and the reason "not red against the declared dangerous state"; with the fixture corrected so the branch carries a commit, the same spec exits 0 (falsifiable in both directions, and red against the dangerous state rather than against an absent feature).
  3. A witness with `class` `destructive` whose `dangerousState.kind` is `baseline-ref` is `red` before any test runs, with a reason citing T-003; changing `kind` to `mutation` with a real substitution makes the same witness evaluable (both directions).
  4. A witness declaring `deterministic` true whose test is red in 3 of 5 repetitions is `red` and the record carries the rate 3/5; the same witness declared `deterministic` false is `green` with the rate recorded (the U-10 shape, both directions).
  5. `consumesExternalOutput` declared with no capture cited is `red`; with a capture file that exists, is non-empty, and whose basename appears in the named tests' sources, the same witness is evaluable and the record carries the capture's sha256 and provenance line (both directions).
  6. While the harness is running, a helper rewrites one file under the pinned roots with **byte-identical content** (content hash unchanged, mtime changed): the record's status is `error`, the reason names the path and the differing field, and the harness exits nonzero (T-004's exact case; a content-only pin cannot pass this criterion).
  7. After every harness run in criteria 1 to 6, the caller's repository HEAD is unchanged and `git status --porcelain` is empty (M2-C-4).
  8. With the scratch repository's local `main` deliberately behind its remote, the recorded baseline SHA equals the fetched remote head, not the local ref, and the record names the fetched ref (stale-ref refusal, both states staged).
  9. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: strongest (this is the gate that judges every other test in the system; a false witness here is invisible everywhere else).
- citations: R-015b (repro redness verified, not asserted), R-028b (red-on-baseline proven mechanically at implementation), R-036 (red-witness harness emitting an evidence file), R-037b (the fake-repair red/green demonstration is mechanical), R-056b (the revert check is computable); blueprint section 4 (harness contract), section 10 point 4 (latest-main target); CLAUDE.md red-witness rule; T-003 (dangerous-state and fixture rules), T-004 (pinning), `delivery/review/verification-m1-p3-fix-round-2.md` U-10 (measured rates 11/20, 8/20, 6/20 against a claim of determinism).
- conflicts-with: none in source; appends to gates.manifest.json and test/behaviors.json with M2-P3 to M2-P8.
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P3 to M2-P8 under DR-0011's five conditions (disjoint source files; the two append-only extras are the only shared files).

### M2-P3: Full-suite wrapper with parity counting

- id: M2-P3
- branch: claude/m2-p3-suite-wrapper
- intent: Replace "the suite is green" with a machine-countable claim: discovery parity, registry resolution, skip accounting, and the wrapper's own exit code as the only truth.
- grounding: M2-P1 merged. Process doc section 2e item 8 ("the full-suite wrapper, never bare test runners", parity counting, "report the exit code, never infer success from a log tail"). Blueprint section 4 (full-suite wrapper: machine-countable pass/fail/skip parity versus baseline). v1 section 5 note: the wrapper marked EXISTS lives in a current-process project not present in this repository, so it is BUILT from the contract under the same degradation rule as D-1. `delivery/review/clean-room-m1-p1.md` CR-002 records the behavior-registry gap this phase closes. Constraint C-1 governs the implementation.
- steps:
  1. M2-C-1 verification: confirm the delivered `test/behaviors.json` shape and the delivered `npm test` script, and confirm which machine-readable reporters the pinned Node emits (`--test-reporter`), recording the chosen one and why. Parsing a human-facing summary line is forbidden (C-1).
  2. Create `src/gates/suite.ts`: run the suite with the chosen machine-readable reporter into the evidence directory; parse counts (pass, fail, skipped, todo, cancelled, total) from the structured stream and the process exit code only.
  3. Discovery parity: independently enumerate test files from the configured glob and compare with the file set the reporter actually reported. Any file discovered but not reported, or reported but not discovered, is a parity failure.
  4. Registry resolution: every behavior in `test/behaviors.json` must resolve by name to a test present in the run; every behavior registered at the merge base must still be present (name comparison against the merge-base copy of the registry, never a count).
  5. Skip accounting: a skipped test must carry a non-empty reason; a skip without one is a parity failure (this is the executable form of EXT-F-05's "skipped with a recorded reason").
  6. Exit-code truth: the wrapper's own exit code is the gate. If the runner exits 0 while any parity check fails, the wrapper exits nonzero. Emit the result record with `units` equal to the tests reported.
  7. Register the gate `suite` in `gates.manifest.json` as `required` with unit label "tests". Update CLAUDE.md's gate list so gate 3 is the wrapper (with `node --test` retained as the developer-facing runner) and add an `npm run gate:suite` script. `npm test` stays a bare `node --test` so the suite is always runnable without the gate (M2-D-09).
  8. Tests in `test/suite-gate.test.ts` against fixture suites in scratch directories.
- files-to-touch: src/gates/suite.ts, test/suite-gate.test.ts (create); package.json (edit, add the gate script), CLAUDE.md (edit, gate list), gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. On this repository, the wrapper exits 0, the record's status is `green`, `units` equals the total reported by `node --test`, and the recorded arithmetic satisfies pass + fail + skipped + todo + cancelled == total == discovered file-set coverage.
  2. With one fixture test file present on disk but excluded from the reported set (the PR-106 dangerous state: a glob that drops files once subdirectories exist), the bare runner exits 0 and the wrapper exits nonzero naming the missing file; restoring the file to the reported set returns the wrapper to exit 0 (both directions, and red against the dangerous state rather than against an absent feature).
  3. With a registered behavior's test renamed in a fixture suite, the bare runner exits 0 and the wrapper exits nonzero naming the behavior; restoring the name returns exit 0 (this is exactly CR-002's unguarded gap, both directions).
  4. With a behavior present in the merge-base registry deleted from the head registry, the wrapper exits nonzero naming the deleted behavior.
  5. A fixture test skipped without a reason makes the wrapper exit nonzero; the same test skipped with a reason string leaves it at exit 0 (both directions).
  6. A fixture test whose body prints a counterfeit summary line to stdout (for example a line claiming "pass 999") does not change any recorded count, and the wrapper's verdict is unaffected (C-1: no log-tail reading; the counterfeit line is captured verbatim in the evidence).
  7. A fixture suite in which the runner exits 0 but the reporter stream is truncated mid-run is recorded `error`, not `green` (M2-C-3, fail closed).
  8. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds, now checked by this phase's own wrapper as well as by inspection.
- suggested model tier: strongest (parity semantics are subtle and the failure mode is a silently smaller suite, which the process doc calls the most dangerous output a suite can produce).
- citations: R-048 (full-suite wrapper, parity counting, exit code as truth); process doc section 2e item 8; blueprint section 4; constraint C-1; `delivery/review/clean-room-m1-p1.md` CR-002; v1 M1-P1 step 2 (the quoted-glob hazard, PR-106).
- conflicts-with: M2-P1 (CLAUDE.md; sequential ordering absorbs it).
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P2 and M2-P4 to M2-P8 under DR-0011.

### M2-P4: Scope auditor

- id: M2-P4
- branch: claude/m2-p4-scope-auditor
- intent: Make "every changed file is on the phase's list or a declared extra" a check with an exit code, run against the merge-base copy of the phase declaration so it cannot be widened from inside the phase.
- grounding: M2-P1 merged. Blueprint section 4 (scope auditor: git diff names versus the plan's declared files-to-touch, undeclared extras fail) and section 11. Process doc section 3 (scope audit as a review step) and section 1c (files-to-touch verified before editing, enforced after). CLAUDE.md's standing pre-authorized extras. `delivery/review/clean-room-m1-p2.md` deviation 1 records a real case: `test/behaviors.json` was edited while absent from the phase's files-to-touch list, correctly judged a clerical gap in the plan rather than scope creep, which is precisely the distinction the standing-extras rule encodes.
- steps:
  1. M2-C-1 verification of the M2-P1 contracts.
  2. Create `src/gates/schemas/phase-declaration.schema.json` and the declaration loader: `{id, branch, filesToTouch: [paths], declaredExtras: [paths], citations: [ids]}`.
  3. Create `src/gates/scope.ts`: resolve the merge base of the branch against the fetched default branch; compute changed paths with `git diff --name-status` over `<merge-base>..<head>`, counting renames as both the old and the new path and counting deletions; compare against the declaration's list plus the three standing extras of section 1.4, with the work-history extra scoped to the phase's own file (`delivery/work-history/<phase-id>.md`).
  4. Read the declaration from the **merge base**, not from the head branch, so an implementer editing the declaration on their own branch cannot widen the audited scope. Record the declaration path and its merge-base blob sha256 in the result record.
  5. Report: `units` equals the number of changed paths audited; a listed file that was not touched is not a violation and is recorded as an under-touch count in the detail line.
  6. Precondition and applicability: `branch-matches` the phase pattern `claude/m[0-9]+-p[0-9]+-*`. If the branch matches and no declaration exists for it, the gate is `red` (never `not-applicable`); if the branch does not match (paperwork branches), `not-applicable` with the reason recorded. Registered as `conditional`.
  7. Register the gate; tests in `test/scope-gate.test.ts` against scratch repositories.
- files-to-touch: src/gates/scope.ts, src/gates/schemas/phase-declaration.schema.json, test/scope-gate.test.ts (create); gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. In a scratch repository whose declaration lists files A and B, a diff touching A and B exits 0 with `units` 2; adding an undeclared file C makes the gate exit nonzero with a reason naming C (both directions).
  2. A diff touching `test/behaviors.json` and `delivery/work-history/<this-phase>.md` without declaring them is green; a diff touching `delivery/work-history/<another-phase>.md` is red naming that path (standing extras are exactly three and the work-history extra is phase-scoped).
  3. Renaming a declared file to an undeclared path is red naming the new path; renaming it to another declared path is green (both directions).
  4. Deleting a declared file is green; deleting an undeclared file is red naming it.
  5. A declaration modified on the head branch to add file C does not change the verdict for a diff touching C: the gate stays red and the record's declaration sha256 equals the merge-base blob (the anti-widening property, witnessed against the dangerous state rather than against an absent feature).
  6. On a branch matching the phase pattern with no declaration present at the merge base, the gate is red naming the branch; on a branch not matching the pattern, the gate is `not-applicable` with the reason recorded and the runner's summary counts it as not-applicable (both directions).
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: cheaper tier acceptable (the contract is fully specified above and the work is diff arithmetic).
- citations: R-020 (files-to-touch verified before editing and enforced after), R-058 (scope audit: every changed file on the list or a declared extra); blueprint section 4 and section 11; process doc sections 1c and 3; CLAUDE.md standing extras; `delivery/review/clean-room-m1-p2.md` deviation 1.
- conflicts-with: none in source.
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P2, M2-P3, M2-P5 to M2-P8 under DR-0011.

### M2-P5: Citation linter

- id: M2-P5
- branch: claude/m2-p5-citation-linter
- intent: Make every file:line citation in a delivery document checkable: the file exists, the line is in range, an optional content hash still matches, and a citation into a repository this checkout does not contain is recorded as unverifiable-external with provenance rather than passing silently.
- grounding: M2-P1 merged. Blueprint section 4 (citation linter: file exists, line in range, optional content hash, stale citation fails) and section 11 ("citations must be real"). Process doc sections 1a and 1d (verification evidence is file:line; plan review re-verifies every citation). A real case this repository already contains: kernel plan v1 cites `bin/fm-lock.sh:47-85` and `bin/fm-teardown.sh:678-712` in the scouted firstmate clone, which is not part of this checkout, so a naive linter reds the governing plan.
- steps:
  1. M2-C-1 verification of the M2-P1 contracts.
  2. Create `src/gates/citations.ts` plus a config shape (validated by a schema): `roots` (named path roots, `.` for this repository), `externalRoots` (name, provenance repo and commit, availability flag), `documents` (glob of citation-bearing documents), and the recognized citation grammars (`path:line`, `path:start-end`, and the optional content-hash suffix form, documented in the module).
  3. Resolution rules: a citation resolving under a local root must name an existing file and a line (or range) within its line count, else `red` naming the citation and the file's actual line count. A citation resolving under a declared external root is recorded `unverifiable-external` with its provenance, counted separately in the record, and is never counted as a resolved unit. A citation resolving under no declared root is `red`.
  4. Vacuous guard (M2-C-2): a document inside the configured `documents` set containing zero recognized citations is `red` with the reason "no citations found in a citation-bearing document"; a document outside the set is not examined. The gate is `not-applicable` only when the diff touches no configured document.
  5. Scope decision (M2-D-10): the kernel manifest entry lints the configured documents **changed in the diff**, not the whole repository history of documents, so the gate does not retroactively red the merged corpus. The phase additionally performs a one-shot inventory run over every existing `delivery/**` document and records the full result in its work history as evidence; it **reports** stale citations and does not edit any other document (fixing them is an orchestrator call).
  6. Register the gate; tests in `test/citation-gate.test.ts` against fixture documents and against real files of this repository.
  7. Second call site (R-025): the same executable is what a plan review runs; the phase documents the reviewer invocation in the module docs. No second implementation.
- files-to-touch: src/gates/citations.ts, src/gates/schemas/citation-config.schema.json, test/citation-gate.test.ts (create); gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. A fixture document citing `src/cli.ts:1` is green with `units` equal to the citations resolved; citing `src/cli.ts:<lineCount+1>` is red naming the citation and the file's line count; citing `src/nope.ts:1` is red naming the missing file (three directions).
  2. A range citation `path:12-40` inside a file of at least 40 lines is green; a range whose end exceeds the file is red naming the end line (both directions).
  3. A citation carrying the optional content-hash suffix is green when the cited lines still hash to the recorded value and red when one character of those lines changes (both directions).
  4. Run against the real text of `delivery/plan/kernel-plan-v1.md`: citations into the declared external firstmate root are counted `unverifiable-external` with provenance and the gate does not red on them; removing the external-root declaration from the config makes the same citations red (both directions, using a real document rather than a fixture).
  5. A configured document containing zero recognized citations is red with the reason recorded; the same document with one valid citation is green (M2-C-2, both directions).
  6. The one-shot inventory over `delivery/**` is recorded in the work history with per-document counts (resolved, unresolved, unverifiable-external) and no document other than this phase's own files is modified (verified by the diff).
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: cheaper tier acceptable (string and filesystem work against a specified grammar).
- citations: R-010b (citations in verification output must be real), R-025 (plan review re-verifies every citation; same artifact, second call site); blueprint section 4 and section 11; process doc sections 1a and 1d.
- conflicts-with: none in source.
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P2 to M2-P4 and M2-P6 to M2-P8 under DR-0011.

### M2-P6: Coverage checker

- id: M2-P6
- branch: claude/m2-p6-coverage-checker
- intent: Make "no orphans" a check with an exit code: every finding in an inventory lands in exactly one accepted bucket, parked buckets carry a reason, phantom coverage of findings that do not exist fails, and every finding in a final report has exactly one non-empty outcome.
- grounding: M2-P1 merged. Blueprint section 4 (coverage checker: every input finding ID referenced by a phase, decision or parked item; orphans fail) and section 11. Process doc section 1c ("every input finding must land in a phase, a decision, an open question, or parked-with-a-reason. No orphans") and section 7 (the final report's table of every input finding to outcome). Plan decision D-7 and SC-009: an open question is represented as a decision record with status open, and the accepted reference types are exactly phase, decision, and parked.
- steps:
  1. M2-C-1 verification of the M2-P1 contracts.
  2. Create `src/gates/coverage.ts` plus a config schema declaring: the `inventory` source (a file listing finding ids, or a table column), the `coverage` table source, and `bucketKinds` (a named set of regexes, each with a `requiresNote` flag). The kernel config declares phase (`M[0-9]+-P[0-9]+`), milestone (`M[0-9]+`), decision (`DR-[0-9]{4}` or `D-[0-9]+` or `M2-D-[0-9]+`), and `parked` with `requiresNote` true.
  3. Checks, each producing a named failure: an inventory id with no bucket row (orphan); an inventory id with more than one bucket row (double-bucketed); a bucket row whose id is absent from the inventory (phantom coverage, which is how a renumbering is caught); a bucket value matching no declared kind; a `parked` row with an empty note.
  4. Finding-to-outcome parity (R-089b): given a report's findings table (id, outcome) and the same inventory, every finding must have exactly one non-empty outcome; a missing, duplicated or empty outcome fails naming the id. The input shape is declared here and is the contract M3's report schema must satisfy or supersede (section 2 item 2).
  5. `units` equals the number of inventory ids checked. An empty inventory is `error`, never green (M2-C-2).
  6. Register the gate; tests in `test/coverage-gate.test.ts` against fixtures and against this repository's real artifacts.
- files-to-touch: src/gates/coverage.ts, src/gates/schemas/coverage-config.schema.json, test/coverage-gate.test.ts (create); gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. Against the real pair (`delivery/requirements/migration-table.md` as inventory, `delivery/plan/kernel-plan-v1.md` Appendix A as coverage table), the gate exits 0 with `units` 115 and the record's counts match the appendix's own stated totals (M1 11, M2 16, M3 74, M4 13, M5 1, parked 0). This uses the repository's real artifacts, not fixtures.
  2. With one appendix row deleted in a scratch copy, the gate exits nonzero naming exactly that row id as an orphan; restoring it returns exit 0 (both directions).
  3. With one appendix row duplicated into two different buckets, the gate exits nonzero naming the id as double-bucketed.
  4. With a bucket row whose id is absent from the inventory, the gate exits nonzero naming it as phantom coverage.
  5. A `parked` row with an empty note is red; the same row with a non-empty note is green (both directions).
  6. An empty inventory produces status `error` with `units` 0, and the runner counts it as vacuous rather than green (M2-C-2).
  7. Finding-to-outcome parity: a fixture report whose findings table covers 5 of 6 inventory ids is red naming the sixth; with an empty outcome cell it is red naming that id; with all six covered and non-empty it is green with `units` 6 (three directions).
  8. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: cheaper tier acceptable (set arithmetic over declared inputs).
- citations: R-023 (every input finding lands in a phase, decision, open question or parked-with-reason; no orphans), R-089b (every-finding-has-an-outcome is checkable); blueprint section 4 and section 11; process doc sections 1c and 7; SC-009 and plan decision D-7 (accepted reference types).
- conflicts-with: none in source.
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P2 to M2-P5, M2-P7, M2-P8 under DR-0011.

### M2-P7: Deploy verifier and migration verifier

- id: M2-P7
- branch: claude/m2-p7-deploy-and-migration-verifiers
- intent: Build the two post-merge verifiers to contract, precondition-gated, so that on this repository they report not-applicable with a named unmet precondition and on a project that declares a deploy target or migrations they produce a real verdict.
- grounding: M2-P1 merged. Blueprint section 4 (deploy verifier: poll platform API until READY or timeout, blocks next dispatch; migration verifier: applied migrations match repo migrations post-merge) and section 11. Process doc section 4 ("never assume the platform did its job": one run found deploys silently not spawning, another found migrations skipped by a flake while the code deployed anyway). SC-011 disposition: on a non-deploying repository these report not-applicable, which is exactly what the M2 exit test asserts for them. Constraints C-2 and C-3 govern the poll loop.
- steps:
  1. Verification-first: confirm and record that this repository declares no deploy target and no migrations, and that no charter exists yet (charters are M3 and M4). This is the phase whose subject the milestone does not reach, and the record of that fact is part of its evidence.
  2. Create `src/gates/deploy.ts`. Configuration (from the manifest entry, schema-validated): `endpoint`, `headersFromEnv` (variable names only, never inline secrets), `statusPath` (a pointer into the JSON response), `readyValue`, `failureValues`, `timeoutSeconds`, `pollSeconds`. Behavior: poll in the foreground (C-3) until `readyValue`, a failure value, or the timeout; record every poll with its timestamp, HTTP status and extracted value; green with `units` 1 on ready; red on a failure value or on timeout, naming the last observed value and elapsed seconds; `error` when the response cannot be parsed or the status pointer is absent (M2-C-3).
  3. Create `src/gates/migrations.ts`. Configuration: `repoInventory` (directory plus pattern, or a command) and `appliedInventory` (a command). Compare the two sorted id lists: red on any repo migration not applied, red on any applied migration absent from the repository (drift in both directions), green with `units` equal to the number compared. A repository that declares a migrations location containing zero migrations reports `not-applicable` with that reason, never green with units 0.
  4. R-032's blocking half: the deploy verifier writes a verdict record keyed to the verified commit sha, and the module documents the consumption contract ("the next dispatch requires a green verdict record for the merged sha"). The enforcement wiring belongs where a dispatch loop and a real deploy both exist, which is the pilot wiring at M4 (Appendix A residue note; M2-D-11). M2 does not add a dispatch block to `spawn`.
  5. Register both gates in `gates.manifest.json` as `conditional` with preconditions `file-exists` on the declared deploy configuration and on the declared migrations location.
  6. Tests in `test/deploy-gate.test.ts` (against an in-process `node:http` stub bound to loopback on an ephemeral port, no external network) and `test/migration-gate.test.ts` (against fixture inventory commands).
- files-to-touch: src/gates/deploy.ts, src/gates/migrations.ts, src/gates/schemas/verifier-config.schema.json, test/deploy-gate.test.ts, test/migration-gate.test.ts (create); gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. Against a stub returning a non-ready value twice and then the ready value, the verifier exits 0 with `units` 1 and the record contains exactly three polls with timestamps and extracted values; against a stub that never returns ready, it exits nonzero at the timeout, the record's elapsed time is at least the configured timeout, and the detail names the last observed value (both directions).
  2. Against a stub returning a declared failure value on the first poll, the verifier exits nonzero after exactly one poll (it does not wait out the timeout), and the record names the failure value.
  3. Against a stub whose body lacks the configured status pointer, the record's status is `error` (never green, never red-by-guess) and the gate exits nonzero (M2-C-3).
  4. Structural: grep over both verifier modules shows no `detached`, no `unref`, no `process.kill`, no pid usage (C-2, C-3); after any verifier run no child process remains (the test asserts the run is synchronous by measuring that the command has returned before the assertion executes).
  5. Migration verifier: repository inventory [001, 002] with applied [001] is red naming 002; applied [001, 002, 003] is red naming 003 as drift; equal lists are green with `units` 2 (three directions).
  6. A declared migrations location containing zero migrations reports `not-applicable` with that reason and `units` 0, and the runner counts it as not-applicable rather than green (M2-C-2 and SC-011 together).
  7. On this repository, both gates report `not-applicable` and each record names its unmet precondition and the evidence of evaluation (the absent configuration path). With a fabricated deploy configuration placed in a scratch copy pointing at an unreachable endpoint, the deploy gate becomes applicable and reports `red`, not `not-applicable` (this proves the precondition is really evaluated rather than hardcoded, in both directions).
  8. No secret value appears in any evidence record: the record names environment variable names only, and a test setting a token-shaped value in a configured header variable asserts that the value does not appear anywhere under the evidence directory.
  9. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: strongest (fail-closed semantics, a network boundary, and the highest risk of building for a state that does not exist; see section 7 risk 1).
- citations: R-032 (deploy verification blocks the next dispatch; enforcement residue at M4 per M2-D-11), R-068 (migrations verified applied after every merge), R-069 (deploy verified READY before the next phase starts); blueprint section 4 and section 11; process doc section 4; SC-011 (precondition semantics on a non-deploying repository); constraints C-2, C-3.
- conflicts-with: none in source.
- blocked-by: M2-P1 merged.
- parallelizable: yes with M2-P2 to M2-P6 and M2-P8 under DR-0011.

### M2-P8: Credential scoping

- id: M2-P8
- branch: claude/m2-p8-credential-scoping
- intent: Make "implementers never create PRs" structural rather than instructional: the executor hands a child an allowlisted environment with no pull-request-capable credential, and a gate witnesses both that scrub and, when the owner has provisioned the scoped token, that the token itself cannot create a pull request.
- grounding: M2-P1 merged; M1-P4's executor adapter delivered. Blueprint section 4 (credential scoping: implementers cannot create PRs or merge, enforced by token scope or branch protection, not instruction) and section 11. Process doc section 0 (the implementer role never creates PRs) and section 2a ("do not create the PR"). DR-0004 item 4, decided in principle and queued for this plan: a fine-grained PAT with contents write only and no pull-requests permission; the exact setup is proposed in section 6 as owner action A-3.
- steps:
  1. M2-C-1 verification: read the delivered executor adapter and record how the child environment is currently constructed; read the delivered `scripts/stub-payload.sh` and `scripts/m1-exit-test.sh` and record whether the stub payload opens the pull request itself.
  2. Create `src/exec/env.ts`: build the child environment from an **allowlist** (not a denylist), enumerated in the module: PATH, HOME, LANG and locale variables, TMPDIR, the `TIPHYS_*` variables spawn needs, the command-scoped git identity variables, and nothing else by default. Pull-request-capable credentials (`GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GH_CONFIG_DIR`, `GIT_ASKPASS`, `GIT_CONFIG_GLOBAL` pointing at a credential store) are excluded by construction. An explicit `--allow-pr-credentials` flag, documented as orchestrator-only, passes them through.
  3. Wire the allowlist into the executor adapter used by `spawn` (edit, verifying the delivered seam first).
  4. Consequence for the M1 exit-test harness (this is the cross-milestone interaction the phase exists to resolve): if the delivered stub payload opens the pull request itself, move pull-request creation out of the payload and into the harness, so the M1 exit test continues to pass under the scrub and the exercised shape matches R-008 rather than contradicting it. If the delivered harness already creates the PR outside the payload, record that and change nothing.
  5. Create `src/gates/credentials.ts` with two halves. Half A (offline, always applicable): construct the child environment that the adapter would hand an implementer from the current process environment and assert no excluded variable survives; `units` equals the number of excluded names checked. Half B (live probe, conditional): when `TIPHYS_IMPLEMENTER_TOKEN` is present, perform the safe negative probe (a pull-request creation request that cannot create anything) and require the permission-denied class; when absent, report `not-applicable` naming owner action A-3 as the unmet precondition, never green.
  6. Verification-first for half B, before writing any assertion: capture the real API responses for both the scoped implementer token and an orchestrator token, record both verbatim in the work history, and derive the assertion from the captured responses. If the observed status codes differ from what step 5 assumes, stop and escalate to the orchestrator rather than reshaping the assertion to fit (T-003 lesson 4: assertions must be built from real captured output, not hand-written strings chosen to match the implementation).
  7. Register the gate; tests in `test/credentials-gate.test.ts`. The live probe is skipped locally with a recorded reason (the token is owner-held) and is witnessed once during the M2 exit test with the owner present.
- files-to-touch: src/exec/env.ts, src/gates/credentials.ts, test/credentials-gate.test.ts (create); the executor adapter module delivered by M1-P4 (edit, verify the seam first), scripts/stub-payload.sh and scripts/m1-exit-test.sh (edit only if step 1 finds the payload creates the PR), gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. A spawn whose stub exec dumps its full environment shows none of the excluded credential variables, while the parent process had every one of them set to a recognizable value; with `--allow-pr-credentials` the same spawn shows them present (both directions).
  2. The scrub is an allowlist: a variable named `TIPHYS_UNRELATED_SECRET` set in the parent does not appear in the child; a variable on the enumerated allowlist does appear (both directions, and this is the property a denylist implementation cannot satisfy).
  3. The child environment still contains everything the M1 spawn path needs: the same stub payload that succeeded before this phase succeeds after it, exercised through the M1 exit-test harness in local mode with exit 0 (no regression witnessed, not asserted).
  4. Half A of the gate is green in this repository's CI, where an ambient `GITHUB_TOKEN` exists, with `units` equal to the number of excluded names; injecting one excluded variable back into the constructed child environment makes it red naming that variable (both directions).
  5. Half B reports `not-applicable` with a reason naming owner action A-3 when no implementer token is present, and the runner's summary counts it as not-applicable rather than green (M2-C-2).
  6. Half B, witnessed once with the owner-provisioned token: the probe records the captured HTTP status and body verbatim and reports green; the same probe with an unscoped token reports red (both directions). Evidence: `gh pr list` counts, or the API list equivalent, are identical before and after every probe run, so the probe creates nothing.
  7. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: strongest (credentials, an external API contract, and an edit to a merged M1 seam).
- citations: R-008 (implementer never creates PRs, enforced structurally); blueprint section 4 and section 11; process doc sections 0 and 2a; DR-0004 item 4; T-003 (assertions from captured output).
- conflicts-with: M2-P9 (scripts/m1-exit-test.sh, if step 4 edits it).
- blocked-by: M2-P1 merged. Half B's witness is blocked by owner action A-3; the rest of the phase is not.
- parallelizable: yes with M2-P2 to M2-P7 under DR-0011, subject to the scripts/ overlap with M2-P9.

### M2-P9: M2 exit-test harness and evidence

- id: M2-P9
- branch: claude/m2-p9-exit-test
- intent: Turn "all gates run green in CI on the kernel repo itself" into a scripted, falsifiable procedure that produces a committed evidence bundle, and prove the harness itself can fail.
- grounding: M2-P1 to M2-P8 merged. Blueprint section 13 row M2 (exit test) as amended by SC-011 and restated in v1 section 5. The M1-P6 harness pattern (per-step JSON evidence records, no record for a command not executed, a deliberate-break criterion proving the harness is falsifiable).
- steps:
  1. Create `scripts/m2-exit-test.sh <evidence-dir>`: run `npm ci`, `npm run build`, the suite wrapper, then `node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence <dir>`; then evaluate the assertions of step 2 over the produced records. Every step appends its command, exit code and captured output as a JSON evidence record (DR-0006), and no record is written for a command that was not executed.
  2. Assertions over the bundle: every gate declared in the manifest has exactly one result record; every `required` gate is `green`; every `not-applicable` record names its unmet precondition and the evidence of its evaluation; zero records with status `error`; zero vacuous passes (no `green` record with `units` 0); the summary counts (declared, applicable, green, not-applicable) are printed and equal the recomputed counts from the individual records.
  3. Falsifiability: support documented environment overrides that (a) force one gate to report green with units 0 and (b) flip one `required` gate's precondition to unmet. Under either override the harness must exit nonzero.
  4. Wire the harness into CI as a step inside the existing `test` job, so the exit procedure runs on every kernel PR from this phase on and no new required check name is introduced.
  5. Commit the evidence bundle for the milestone run at `delivery/evidence/m2-exit-test/` through a paperwork PR under the current process.
- files-to-touch: scripts/m2-exit-test.sh, test/m2-exit-test.test.ts (create); .github/workflows/gates.yml (edit), gates.manifest.json, test/behaviors.json (standing extras).
- acceptance criteria:
  1. `scripts/m2-exit-test.sh <dir>` exits 0 on a machine with only git, Node at the floor, and npm, and the evidence directory afterward contains one record per declared gate plus `summary.json`, each validating against the gate-result schema.
  2. The bundle shows every `required` gate green, both verifiers `not-applicable` with their unmet preconditions named, and zero records with status `error` or with green and `units` 0.
  3. Under the vacuous-gate override the harness exits nonzero naming the vacuous gate; under the required-not-applicable override it exits nonzero naming that gate (the harness is falsifiable in both documented directions, mirroring M1-P6 criterion 5).
  4. The CI `gates` check completes successfully on the phase PR and the check-run list still contains exactly the contexts it contained before this phase (no new required context; DR-0004 unchanged).
  5. The committed bundle at `delivery/evidence/m2-exit-test/` contains the counts and the manifest sha256, and the sha256 matches `gates.manifest.json` at the evidenced commit.
  6. `node --test` exits 0 with 0 failing and zero unaccounted tests; the behavior registry criterion of section 1.4 holds.
- suggested model tier: cheaper tier acceptable (scripting against contracts fixed by M2-P1 to M2-P8).
- citations: blueprint section 13 (M2 exit test) as amended by SC-011; v1 section 5 (exit-test wording, evidence location); v1 M1-P6 (harness pattern and falsifiability criterion).
- conflicts-with: M2-P1 (.github/workflows/gates.yml), M2-P8 (scripts/).
- blocked-by: M2-P1 to M2-P8 merged.
- parallelizable: no.

---

## 4. M2 exit test

Run by the orchestrator under the current process after M2-P9 has merged, on `main`, with the owner present for the one owner-held step. Executed via `scripts/m2-exit-test.sh <evidence-dir>`, whose steps and assertions are the contract; the CI run of the same harness on every PR is the continuous form.

Procedure:

- E1. Preconditions: `main` at the merged M2-P9 head; `npm ci`, `npm run build` exit 0; the suite wrapper exits 0 with parity satisfied. Recorded with exit codes.
- E2. `node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence <dir>` exits 0.
- E3. Bundle assertions (section 3, M2-P9 step 2): one record per declared gate; every `required` gate green; every `not-applicable` record naming its unmet precondition and its evaluation evidence; zero `error`; zero vacuous passes; recomputed counts equal to `summary.json`.
- E4. Owner-held step: with the A-3 implementer token supplied for the duration of the run, the credential-scoping gate's half B executes and is recorded green, with the captured API response verbatim and with evidence that no pull request was created. If A-3 has not been provisioned, half B is recorded `not-applicable` naming A-3, the milestone's exit is recorded as **passed with one owner-side clause outstanding**, and the outstanding clause is carried in `delivery/STATE.md` until it is discharged. It is never recorded as green.
- E5. Falsifiability: the two documented overrides are exercised and each makes the harness exit nonzero. Recorded.
- E6. The evidence bundle is committed at `delivery/evidence/m2-exit-test/` and reaches `main` through a pull request. M3 may not start before that commit is on `main` (hard milestone gate, v1 section 1.4 item 6).

What this exit test proves: that on this repository, at this commit, eight gates are declared, invoked as subprocesses, and reported in one validated record shape; that every gate the manifest marks required examined at least one unit and returned green; that the two gates whose preconditions this repository cannot meet said so explicitly with the unmet precondition named, and were counted separately from the green ones; that no gate reported green having examined nothing; and that the harness itself fails when either failure mode is injected.

What it does not prove, recorded here rather than assumed away:

1. **Nothing about a project with a deploy target or migrations.** Both verifiers are exercised only against in-process stubs and against this repository's not-applicable path. Their first contact with a real platform is M4's pilot wiring.
2. **Nothing about assurance modes.** Mode selection, and the registry that carries it, are M3-P3 (section 2 item 1).
3. **Nothing about merge-time red-witness re-verification.** The harness accepts a baseline parameter; the merge-time gate that would use it is M5 (blueprint section 10 point 4, M2-D-08).
4. **The credential-scoping proof is two-part and only one part is CI-witnessed.** The environment scrub is witnessed in CI on every PR; the token's own incapacity is witnessed once, by the owner, with an owner-held token (E4). Branch protection, the other structural half named by the blueprint, is DR-0004 items 2 and 3 (owner-executed) plus M4's R-064.
5. **A scope audit is only as good as the declaration it reads.** The auditor reads the merge-base declaration and refuses a phase branch with no declaration, but a branch that does not match the phase pattern is `not-applicable`. Paperwork branches legitimately need that; it is also the one path by which source could reach a PR unaudited. Recorded as a known limitation, to be closed by M3's registry when branch classes become declarable.
6. **The citation linter is scoped to documents changed in the diff** (M2-D-10). A stale citation in an untouched document is found by the one-shot inventory run recorded in M2-P5's work history, not by the standing gate.
7. **Gate correctness on a codebase unlike this one.** Every gate is witnessed against this repository and against scratch fixtures. Behavior on a large, polyglot, or deploying repository is unwitnessed until M4.

---

## 5. Decisions taken in this plan (flag if you disagree)

- **M2-D-01 (phase decomposition).** v1 section 5 outlines seven M2 items; this plan delivers nine phases. The differences: the gate contract and runner are separated out as M2-P1 (see M2-D-02); the scope auditor and citation linter are separated (v1's outline item 3 combined them) because they share no code beyond the result contract, have distinct failure modes, and small phases are cheaper to review, which DR-0011 records as this project's actual constraint; the exit-test harness is its own phase, matching M1-P6's shape. No requirement row moves and no outline item is dropped.
- **M2-D-02 (a spine phase before the gates).** The seven components must emit comparable records for the exit test to count applicable, green and not-applicable, and the runner must exist before the first gate can be wired into CI. Rather than let M2-P2 invent a format that six later phases copy, M2-P1 delivers the contract, the manifest, the runner, the exit codes and the CI wiring. The blueprint's "red-witness harness (first)" ordering is honoured in the sense that matters: red-witness is the first gate, and it is first because it is the discipline the whole pipeline leans on. M2-P1 discharges no requirement row and is not an orphan; see the Appendix A note.
- **M2-D-03 (parallelism).** Decided DR-0011 (maximum safe parallelism, five binding conditions) governs M2, superseding v1 section 1.4 item 5's blanket "off until M5" for this milestone. Every phase declares `parallelizable` and `conflicts-with` above. M2-P1 is strictly first and M2-P9 is strictly last; M2-P2 to M2-P8 are pairwise disjoint in source and share only two append-only files. Merge order remains dependency order regardless of work order, and the per-pair disjointness check DR-0011 condition 1 requires is performed against the files-to-touch lists above before any parallel dispatch.
- **M2-D-04 (schema validation technology).** M2 ships a minimal in-repo JSON Schema validator over a closed keyword set that fails loudly on any keyword it does not implement. Rationale: M1 shipped zero runtime dependencies (D-3); the M2 schemas are small and authored in-repo; and the alternative, adopting a validator library, is better decided at M3-P1 where five artifact schemas will exercise the specification properly. The loud-failure rule is what keeps the subset honest: a schema keyword the validator cannot evaluate is an error at load, never a silent pass. Reversible: the validator sits behind one module interface.
- **M2-D-05 (where M2 schemas live).** Under `src/gates/schemas/`, shipped in the package, because CLAUDE.md reserves the repository-root `schemas/` for M3 kernel deliverables and forbids populating it early. Relocation is an M3 decision (section 2 item 4).
- **M2-D-06 (run pinning is a Layer 1 script, delivered in M2-P2).** T-004's structural consequence is deterministic and scriptable, so by the placement rule it is Layer 1, not a prompt. It ships with the red-witness harness because that is the M2 gate that mutates a tree and runs a suite. Pinning covers file set, sha256, size and mtime, and any difference in any field makes the run non-evidence: T-004's own forensics describe a byte-identical rewrite, which a content-only pin would have passed.
- **M2-D-07 (gates are subprocesses named by the manifest, not entries in the CLI dispatch table).** Only M2-P1 edits `src/cli.ts`. Each later phase adds its own module with a main guard and one manifest entry. This follows the blueprint's own framing that every toolbelt boundary is a subprocess with an exit code, and it is what makes M2-P2 to M2-P8 pairwise disjoint under DR-0011.
- **M2-D-08 (no merge-time witness gate in M2).** The settled decision that red-witness targets latest `main` and is re-verified at merge time (blueprint section 10 point 4) is encoded as a harness parameter, not as an enforcement. M2 runs no parallel phases and has no merge-time hook; building the enforcement now would be defensive machinery for a state this milestone does not reach, which cost M1-P3 five fix rounds. The enforcement is M5's, where the blueprint already places it.
- **M2-D-09 (`npm test` stays a bare runner).** The wrapper becomes the gate and is added to CLAUDE.md's gate list and to an `npm run gate:suite` script, but `npm test` continues to invoke `node --test` directly so the suite is always runnable without the gate machinery and so a wrapper defect cannot make the suite unrunnable.
- **M2-D-10 (citation linting is diff-scoped).** The standing gate lints configured documents changed in the diff. A whole-corpus gate would red the merged history on day one and would tempt an implementer to edit documents outside its phase. The corpus is inventoried once, in M2-P5's work history, and the findings go to the orchestrator.
- **M2-D-11 (R-032's enforcement half lands at M4).** M2 builds the deploy verifier and its verdict record and documents the consumption contract; the blocking of the next dispatch is wired where a dispatch loop and a real deployment both exist, which is M4's pilot wiring. Recorded as a residue line in Appendix A rather than as a moved row, following the precedent of v1's DR-0007 obligation split (PR-201).
- **M2-D-12 (vetoable: CLAUDE.md edits).** Two phases edit CLAUDE.md: M2-P1 adds `gates.manifest.json` to the standing pre-authorized extras, and M2-P3 makes the suite wrapper the third gate. CLAUDE.md is the repository's agent-rules single source until the M3 registry replaces it, so changing it is a process-visible act. Flagged vetoable; the alternative is a gate list that disagrees with the gates actually run, which is worse.
- **M2-D-13 (credential scoping is an allowlist).** The child environment is built from an enumerated allowlist rather than by removing known-bad names. A denylist fails silently the first time a credential arrives under a name nobody enumerated, and the rule this discharges is structural ("enforced by token scope or branch protection, not instruction").

---

## 6. Open questions and owner decisions

Per plan decision D-7, an open question is a decision record with status open, not a free-floating list item. M2 needs the following. None of them blocks M2-P1 dispatch.

1. **Owner action A-3 (DR-0004 item 4, credential scoping): provision the scoped implementer token.** DR-0004 is decided in principle and its item 4 was explicitly queued for this plan, with the exact setup to be proposed here. Proposed setup, for the owner to execute or amend:
   - Create a fine-grained personal access token, repository-scoped to `ThomasHendrickx/tiphys-ai-helmsman` only.
   - Repository permissions: Contents: Read and write. Metadata: Read (mandatory). **Pull requests: No access.** Actions, Workflows, Administration, Secrets: No access.
   - Expiry: the shortest period that covers M2 (this is a construction-time credential, not a production one).
   - Supply it to the M2 exit-test run as `TIPHYS_IMPLEMENTER_TOKEN`; do not place it in CI secrets, because the kernel's own CI does not need it and half A of the gate is what CI witnesses.
   - Confirm alongside it that the DR-0004 ruleset from items 2 and 3 is active with **no bypass actors**, since a token that cannot open a pull request but can push to `main` would defeat the point.
   Blocks: the E4 clause of the M2 exit test and criterion 6 of M2-P8. Blocks nothing else. If it is not provisioned, the milestone exits with that clause recorded outstanding and never recorded green (section 4, E4).
2. **A decision record to be raised at the next free DR number (open): which platform the deploy verifier's first concrete adapter targets.** (The number is deliberately not fixed here: DR-0012 was claimed by a concurrently running planning session for a different subject, and the orchestrator assigns the number when it raises the record.) M2-P7 builds a configuration-driven poller against a generic HTTP contract, which is sufficient for the kernel's not-applicable path and for stub-witnessed behavior. A concrete adapter for the pilot project's platform would be worth more, and blueprint owner action 2 (pick the pilot project for M4 cutover) is what would answer it. Recommendation: leave it open; M2-P7 ships the generic adapter; the concrete adapter is written with the pilot at M4. Non-blocking, recorded so that a known answer is not wasted.
3. **DR-0008 (open, deferred by the owner; due before the M3 plan is approved): release registry and package naming.** Not an M2 blocker: M2 publishes nothing. Named here only because it comes due inside M2's calendar window.
4. **DR-0010 (open, due at M4 adapter planning): harness-native orchestration primitive.** Not an M2 blocker. Named because M2's gates are exactly the deterministic layer that record argues the primitive does not provide, and M2's evidence will be an input when it is decided.
5. **Vetoable plan decisions in section 5 needing no owner action unless the owner disagrees:** M2-D-12 (CLAUDE.md edits). All other decisions in section 5 are realization-level and reversible.

---

## 7. Risks

Ordered by the honest question the M1-P3 lesson forces: does M2 actually reach the state this component guards, and can its tests be red against the dangerous state rather than against an absent feature?

1. **M2-P7 (deploy and migration verifiers) is the component most likely to behave like M1-P3.** The milestone never reaches the state it guards: this repository has no deploy target, no migrations, and no charter, and no project will have any until M4. Every witness is therefore either a stub the implementer shapes or a not-applicable path. T-003's exact failure mode applies: a stub written alongside the implementation asserts what the implementation does, not what the platform does. Mitigations already in the phase: the fixture must exercise the failure directions (timeout, declared failure value, unparseable body, drift in both directions), the not-applicable path is witnessed with the precondition proven to be really evaluated (criterion 7's fabricated configuration), and the secret-leak criterion is a real property rather than a shaped one. Residual risk accepted and recorded in section 4's not-proven list. If the owner wants this narrowed further, the honest option is to reduce M2-P7 to the precondition and record shape only and move the pollers to M4 with the pilot; that trade is available and is not recommended, because the contract is cheap to build and expensive to discover late.
2. **M2-P2 (red-witness harness) is the gate that judges every other test, so a false witness here is invisible everywhere else.** Its own tests must be red against the dangerous state (a worthless witness accepted as green), which criteria 2 to 6 are written to require. Two secondary risks: wall time (declared-deterministic witnesses run `repeats` times, and CLAUDE.md warning 11 already records that suite wall time grows with real-clock waits, so the default of 5 is a cost the owner should see and can change), and flakiness of the harness itself (it clones, fetches, mutates and restores; every one of those is a real-filesystem operation with a real failure rate). The pin and the scratch-clone isolation exist precisely because M1 already paid twice for unpinned, shared-tree runs (T-004, and the U-2 investigation that followed).
3. **M2-P8 (credential scoping) depends on an external API's behavior and on an owner action.** The negative probe's assertion is derived from captured responses at build time and could rot when GitHub changes a status code; the phase's step 6 requires it to be built from captured output and to escalate rather than improvise on divergence, but nothing keeps it true a year later. It also touches a merged M1 seam (the executor adapter) and possibly the M1 exit-test scripts, which is the only place in M2 where a change can break a previously green milestone: criterion 3 exists to witness that it did not.
4. **Input-shape duplication with M3.** The scope auditor's phase declaration and the coverage checker's inventory and coverage-table shapes are M2 inventions that M3's plan schema and report contract must adopt or supersede (section 2 items 2 and 3). If M3 invents different shapes, M2's gates need rework in M3, and the two plans will have paid twice. The mitigation is entirely procedural: the orchestrator reconciles the two plans before M3 dispatch, with this section as the flag.
5. **Every kernel PR now runs eight gates.** CI time and review time both grow, and a flaky gate taxes every future run (process doc section 4's flake economics). Two of the eight execute suites (red-witness and the wrapper), which is where the time goes. Named so that the first slow month is not a surprise.
6. **The exit test could pass vacuously, which would be the most ironic failure available.** Mitigations are structural rather than aspirational: M2-C-2 makes a green record with zero units an error, `required` applicability makes a silently not-applicable gate a failure, and M2-P9 criterion 3 requires the harness to fail under both injected failure modes.
7. **Planning against unbuilt M1 phases.** M1-P4 to M1-P6 are not merged at drafting time, so M2-P8 and M2-P9's grounding is as-planned. M2-C-1 converts that into a verification-first step in every affected phase rather than an assumption, but a large divergence in the delivered executor seam would force a plan revision before those phases dispatch. This is the same shape as v1's D-16 and is handled the same way.

---

## Appendix A: Requirements coverage

Every row that kernel plan v1's Appendix A places in the M2 bucket, mapped to exactly one M2 phase. Sixteen rows, sixteen mappings, zero orphans, zero parked. Counts by phase: M2-P1 = 0, M2-P2 = 5, M2-P3 = 1, M2-P4 = 2, M2-P5 = 2, M2-P6 = 2, M2-P7 = 3, M2-P8 = 1, M2-P9 = 0. Total = 16.

| Row | Rule (abbreviated from the migration table) | Phase |
|---|---|---|
| R-008 | Implementer never creates PRs; enforced by token scope or branch protection | M2-P8 |
| R-010b | Citations in verification output must be real (file exists, line in range) | M2-P5 |
| R-015b | Repro redness is verified, not asserted | M2-P2 |
| R-020 | Files-to-touch verified before editing and enforced after | M2-P4 |
| R-023 | Every input finding lands in a phase, decision, open question or parked-with-reason | M2-P6 |
| R-025 | Plan review re-verifies every file:line citation (same artifact, second call site) | M2-P5 |
| R-028b | Red-on-baseline proven mechanically at implementation | M2-P2 |
| R-032 | Next phase starts only after the previous merged and its deploy verified | M2-P7 |
| R-036 | Red-witness: red on baseline, green after, evidence emitted | M2-P2 |
| R-037b | The fake-repair red/green demonstration is mechanical | M2-P2 |
| R-048 | Full-suite wrapper with discovery-count parity; exit code is the truth | M2-P3 |
| R-056b | The revert check is computable | M2-P2 |
| R-058 | Scope audit: every changed file on the list or a declared extra | M2-P4 |
| R-068 | Verify migrations actually applied after every merge | M2-P7 |
| R-069 | Verify the production deploy reached READY before the next phase starts | M2-P7 |
| R-089b | Every-finding-has-an-outcome is checkable | M2-P6 |

Phases discharging no row, and why this is not an orphan in the other direction: M2-P1 delivers the contract, manifest, runner and exit-code vocabulary that all sixteen rows' components emit into and are invoked by; M2-P9 delivers the milestone's exit procedure. Neither corresponds to a rule extracted from the process doc, because the process doc has no rule about how its own gates are wired together. Both are named in blueprint section 13's M2 row by implication (the exit test is "all gates run green in CI on the kernel repo itself", which presupposes something that runs them and something that counts them) and are justified in M2-D-02.

Residue notes (partial discharge, recorded rather than hidden, following the precedent of v1's PR-201 obligation split):

| Row | Discharged in M2 | Residue, and where it lands |
|---|---|---|
| R-032 | the deploy verifier, its verdict record keyed to the verified sha, and the documented consumption contract | the enforcement that blocks the next dispatch, wired at M4 with the pilot where a dispatch loop and a real deployment exist (M2-D-11) |
| R-089b | the parity checker plus its declared input contract | binding that input contract to the report schema, M3-P1 (section 2 item 2) |
| R-008 | the executor environment allowlist and the token probe | branch protection (DR-0004 items 2 and 3, owner-executed; R-064 at M4) and the token itself (owner action A-3) |

Cross-check against v1 Appendix A: the sixteen rows above are exactly the rows v1 marks M2 (R-008, R-010b, R-015b, R-020, R-023, R-025, R-028b, R-032, R-036, R-037b, R-048, R-056b, R-058, R-068, R-069, R-089b). No row is added, removed, or moved to another milestone by this document, so v1's bucket totals (M1 11, M2 16, M3 74, M4 13, M5 1, parked 0) are unchanged.
