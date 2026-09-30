# M6: review and rule economy

The owner's blueprint of 2026-09-29, realized. Four owner decisions are in
force and are not reopened here:

| blueprint | record |
|---|---|
| D1 deletion and admission | delivery/decisions/DR-0061-removal-is-one-commit-and-a-check-must-name-its-failure.md:1 |
| D2 the kernel launches reviewers | delivery/decisions/DR-0062-the-kernel-launches-reviewers.md:1 |
| D3 review tier follows the diff | delivery/decisions/DR-0063-review-tier-follows-the-diff.md:1 |
| D4 acceptance criteria are tests | delivery/decisions/DR-0064-acceptance-criteria-are-tests.md:1 |

Phasing and realization are the orchestrator's. This file is the plan. If a
thing is not written here, it is not being made.

## How the phases land

- **One branch.** This session may push only `claude/upbeat-gates-w3cm5m`.
  Each phase is one pull request from that branch; after a merge the branch
  restarts from `main`. The name does not match the phase pattern, so the
  `scope` gate reports not-applicable and the reviewers confirm the exact
  diff instead (DR-0057). Files-to-touch below are declared broadly, as the
  blueprint asks, and bind the implementer and the reviewers.
- **Reviews follow DR-0063 from P1 on.** `single`: one hazard review on the
  cheaper tier. `pair`: two hazard reviews, and the reviewers are all one
  vendor, so every pair merges under the single-vendor exception (DR-0062).
  No criteria contract is dispatched from P1 on (DR-0064).
- **Until P2 lands, the old merge gate still runs in CI.** Where it asks for
  something a decision has removed (a criteria contract), the decision wins
  and the merge record says so.
- **Order.** P1, then P2 (D3) before P3 (D1), because P2 is what makes two
  hazard reviews acceptable to the merge gate and every later phase is judged
  by it. The owner's order lists D1 and D3 together; this puts D3 first.
  The "one gate list" cleanup moves into P3, because deleting gates while the
  M2 exit-test harness still pins them would mean editing its tables only to
  delete it one phase later.
- **Landing order after P3: P4, then P6, then P5.** P5 reads the
  single-vendor exception (`review-families` in `charter.yaml`) at the merge
  base, so the declaration must be on `main` before P5 merges. P6 is
  `single` tier and carries it; measured under the pre-P5 merge gate, a
  single-tier change adding the declaration passes the review rows, while a
  pair change after it would not, so P6 lands after P4. P5 also waits on
  delivery/decisions/DR-0065-what-a-kernel-launched-reviewer-may-do.md:1.
  P7 lands last: it extends P5's launcher to a second harness.

## Acceptance criteria are tests, here too

Every criterion below names its `check`: a test name in the suite or a
command with its expected exit. `not-testable` criteria carry a reason.

## M6-P1: the four decision records and this plan

- intent: land DR-0061 to DR-0064 and this plan, so every later phase has
  them on `main`.
- tier: `single`.
- files-to-touch: `delivery/decisions/`, `delivery/plan/`. `delivery/STATE.md` is left alone until P3 retires the test that pins its headings.
- acceptance:
  - p1-records: the four records exist and each carries the decision, the
    owner's words, what it supersedes and its consequences. check:
    `node scripts/check-id-collisions.mjs` exits 0.
  - p1-faithful: not-testable: that a record says what the owner decided is a
    reading, so it goes to the hazard review.

## M6-P2: the review tier follows the diff (D3, and D4's contract drop)

- intent: replace DR-0027's hardcoded path table with a project-declared
  runtime set, two tiers `pair | single`, and hazard-only review contracts.
- tier: `pair` (touches `src/`, `schemas/`).
- files-to-touch: `src/`, `schemas/`, `scripts/`, `test/`, `charter.yaml`,
  `assurance-modes.yaml`, `role-model-config.yaml`, `gate-registry.yaml`,
  `gates.manifest.json`, `AGENTS.md`, `roles/`, `checklists/`, `templates/`,
  `tuition/`, `witness/`, `.github/`, `.claude/`, `delivery/`.
- steps:
  1. A `runtime-set` declaration in `charter.yaml` (schema in
     `schemas/charter.schema.json`): path prefixes, plus manifest files that
     count only when a key other than a version field changes, plus the
     dependency pins that count as version fields. This repository declares
     the set in DR-0063.
  2. `classifyReviewBudget` classifies a diff `pair | single`. The
     declaration is read at the merge base, so a change cannot shrink the set
     that judges it; a change to the declaration itself is `pair`. No
     declaration, an unreadable one, or a manifest that cannot be parsed at
     either side is `pair`. `none` is gone.
  3. The merge gate requires, per tier: `pair` two approving hazard verdicts
     for the head, decorrelated as today on `produced-by` only (framing and
     review-contract distinctness are dropped); `single` one approving hazard
     verdict, no arbitration row. Condition 3 (criteria walked) is removed.
  4. Drop the criteria contract: `assurance-modes.yaml` full mode
     `review-contracts: [hazard]` and its schema minimum, `REVIEW_CONTRACTS`
     in `src/roles.ts`, the verdict schema's `criteria` requirement and the
     `review-contract` enum, `verdict-criteria-complete`, the criteria framing
     and probes in `checklists/clean-room.yaml`, the criteria clauses in
     `roles/clean-room-reviewer.md` and `AGENTS.md`.
  5. `role-model-config.yaml`: the clean-room reviewer's tier follows the
     review tier (strongest for `pair`, cheaper for `single`).
  6. `AGENTS.md` and `roles/`: `single` means one review, no arbitration, one
     fix round.
  7. Old verdicts stay valid history: a committed verdict with
     `review-contract: criteria` or with `criteria[]` still validates.
  8. The `suite` gate stops refusing a behavior deleted since the merge base.
     That is a register of removals, which DR-0061 (a) ends. It is done here,
     not in P3, because P2 is the first phase that deletes tests.
- acceptance:
  - p2-version-bump: a version-only bump of `package.json`,
    `package-lock.json` and `plugin/package.json` (the real #224 diff) is
    `single`. check: a named test in `test/merge-preconditions.test.ts`.
  - p2-dependency: adding a dependency is `pair`. check: named test.
  - p2-src: a diff touching `src/` is `pair`. check: named test.
  - p2-delivery: a `delivery/`-only diff is `single`. check: named test.
  - p2-undeclared: a project with no runtime declaration is `pair`. check:
    named test.
  - p2-single-green: a `single` change with one approving hazard verdict and
    no arbitration document is green. check: named test.
  - p2-pair-one: a `pair` change with one verdict is red. check: named test.
  - p2-hazard-pair: two approving hazard verdicts with distinct `produced-by`
    are green. check: named test.
  - p2-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.
  - p2-deleted-behavior: a behavior registered at the merge base and deleted
    on the head no longer reddens the `suite` gate. check: named test in
    `test/suite-gate.test.ts`.
  - p2-red-witness: `node bin/tiphys.ts gates run --registry gate-registry.yaml
    --only red-witness` is green on the phase head.
- hazards: a runtime change classified `single` (fail open); a dependency
  change hidden inside a "version-only" manifest diff; an unreadable
  declaration read as "no runtime set" and therefore `single`; a failing test
  deleted to get green now that the suite gate allows deletion.

## M6-P3: deletion, admission, and one gate list (D1)

- intent: every gate states what it prevents or is gone; the retirement
  machinery is gone; `gate-registry.yaml` is the only gate list and CI runs
  it directly on both events.
- tier: `pair`.
- files-to-touch: `src/`, `bin/`, `scripts/`, `schemas/`, `test/`,
  `witness/`, `gate-registry.yaml`, `gates.manifest.json`,
  `assurance-modes.yaml`, `charter.yaml`, `package.json`, `checklists/`,
  `templates/`, `tuition/`, `roles/`, `AGENTS.md`, `CLAUDE.md`, `.github/`,
  `.claude/`, `delivery/`.
- steps:
  1. Delete the retirement machinery and what feeds only it:
     `delivery/plan/cutover/retirement-inventory.json` and `.md` (the diet
     register is its `diet` array), `test/retirement-inventory.test.ts`,
     `scripts/check-retirement-inventory.mjs`, the retirement mirror in
     `src/cutover.ts` and `tiphys cutover status --retirement`, and
     `scripts/check-cutover-entry.mjs` with its test (the cutover it gated
     has happened; nothing runs it).
  2. `schemas/gate-registry.schema.json` requires a one-line `prevents` on
     every gate.
  3. Judge every gate and every derived check in `src/checks.ts` against
     DR-0061 (b). Keep with a `prevents`, or delete with a one-line commit
     reason. Expected keepers, to be verified: `suite`, `typecheck`,
     `red-witness`, `credential-scrub`, `license`, `scope`,
     `merge-preconditions`, and `verdict-pair-approves`. Expected to go:
     `citations`, `clause-map`, `coverage`, `gate-classes`,
     `check-agents-references`, `agent-rules-drift`, `brief-drift`,
     `manifest-self-check`, `credential-token`, the two checklist-verified
     entries, and the derived checks that only read process documents.
     `deploy` and `migrations` are never applicable in this repository; their
     code ships for projects, so they leave this registry and their code
     stays.
  4. One gate list: CI runs `tiphys gates run --registry gate-registry.yaml`
     on both events, with the event selecting the gates by their declared
     `events`. Delete `gates.manifest.json`, `scripts/m2-exit-test.sh`, the
     M1 and M2 self-test guards, and the per-mode `gate-sets` lists in
     `assurance-modes.yaml` (derived from the registry's `modes`). Delete the
     checks that only kept copies aligned. The M1 exit-test step stays only if
     it passes DR-0061 (b) and is not already run by the suite.
  5. `delivery/STATE.md` gets its M6 entry once the test pinning its headings
     is gone.
- acceptance:
  - p3-prevents: the registry schema rejects a gate without `prevents`.
    check: named test in `test/gate-registry.test.ts`.
  - p3-all-prevent: every gate in `gate-registry.yaml` validates. check:
    `node bin/tiphys.ts validate --type gate-registry gate-registry.yaml`
    exits 0.
  - p3-absent: `delivery/plan/cutover/retirement-inventory.json`, its `.md`,
    `test/retirement-inventory.test.ts`,
    `scripts/check-retirement-inventory.mjs` and `gates.manifest.json` are
    absent. check: `test ! -e` on each, exit 0.
  - p3-ci: the `gates` workflow calls the runner with `--registry` on both
    events and never `--manifest`. check: named test in
    `test/gate-registry.test.ts`.
  - p3-red-fails-ci: the runner exits nonzero when a required gate is red,
    vacuous or errors. check: named test.
  - p3-sizes: `gate-registry.yaml` at most 10,000 bytes and
    `assurance-modes.yaml` at most 6,000 bytes. check: `wc -c`.
  - p3-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.
  - p3-ci-green: not-testable locally: the `gates` run on the pull request
    head and the post-merge `push` run are green.
- hazards: a deleted gate was the only guard of a real product failure; the
  runner exits 0 while a required gate is red, so CI goes green over a red
  bundle; the push arm runs nothing.

## M6-P4: acceptance criteria are tests (D4)

- intent: a plan criterion carries `check` or `not-testable`; the kernel
  proves `check` against suite results; reports count `not-testable`.
- tier: `pair`.
- files-to-touch: `src/`, `bin/`, `schemas/`, `templates/`, `roles/`,
  `checklists/`, `test/`, `witness/`, `gate-registry.yaml`, `AGENTS.md`,
  `delivery/`.
- steps:
  1. `schemas/plan.schema.json`: each acceptance item requires exactly one of
     `check` (test names or a command) and `not-testable` (a reason).
  2. The kernel maps a phase's criterion checks to suite results: a named
     test must be reported and pass; a command must exit 0. Registered as a
     gate with a `prevents` (a criterion reported met with nothing proving
     it). This replaces `verdict-criteria-complete`.
  3. `templates/plan.example.yaml`, `roles/plan-writer.md`,
     `roles/adversarial-plan-reviewer.md`: the new criterion shape.
     `not-testable` criteria go into the hazard reviewer's brief.
  4. The final report states the `not-testable` count per phase.
  5. Token diet for shipped schemas: drop `$comment`, one-line `description`.
- acceptance:
  - p4-schema: the plan schema rejects a criterion with neither `check` nor
    `not-testable`. check: named test.
  - p4-maps: a criterion whose named test is absent, failing or skipped is
    red; one whose test passes is green. check: named tests.
  - p4-report: the final report schema requires the per-phase
    `not-testable` count. check: named test.
  - p4-diet: no file under `schemas/` contains `$comment`. check:
    `grep -rl '\$comment' schemas/` finds nothing.
  - p4-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.
- hazards: a criterion reads as proven by a test that was skipped or never
  ran; `not-testable` becomes the easy default.

## M6-P5: the kernel launches reviewers (D2)

- intent: reviews are dispatched by the kernel, which records what the
  harness served; the merge gate trusts those records, not the verdict's
  self-report.
- tier: `pair`.
- files-to-touch: `src/`, `bin/`, `plugin/`, `schemas/`, `scripts/`,
  `test/`, `witness/`, `charter.yaml`, `gate-registry.yaml`,
  `assurance-modes.yaml`, `role-model-config.yaml`, `roles/`, `AGENTS.md`,
  `checklists/`, `.github/`, `.claude/`, `delivery/`. P5 also does the
  comment diet of `gate-registry.yaml`, `assurance-modes.yaml` and
  `role-model-config.yaml`, because it edits them and runs alongside P6.
- steps:
  1. `tiphys review dispatch --role clean-room-reviewer --tier <t> --head
     <sha> --phase <id>` launches the reviewer through the executor and
     writes a review record: task id, head sha, observed model, family, and
     the run's reported cost and token usage. The observed model comes from
     the harness's own output (the headless result or the transcript), never
     from the reviewer.
  2. Family is the vendor. Every Claude model is one family. This
     repository's `charter.yaml` declares the single-vendor exception.
  3. The merge gate reads APPROVE and findings from each verdict, and the
     review count, reviewed head and family distinctness from kernel review
     records. A verdict with no matching kernel record does not count.
  4. Delete `produced-by`, the framing and review-contract comparisons,
     `producedByCaveat`, `dual-review-decorrelation`,
     `scripts/check-dual-review.mjs` and its gate, and their tests.
  5. The launcher passes the kernel's reviewer grant to the executor, and
     each executor maps it to its own harness's flags (DR-0065). The grant
     is data in `src/` with no harness named in it: read the repository,
     write inside the review worktree, run `node`, `npm run build` and
     read-only `git`; no push, no network tools. The Claude Code executor
     maps it to `--permission-mode acceptEdits` and an `--allowedTools`
     list. One live dispatch on the cheaper tier proves the reviewer can
     write and run.
- acceptance:
  - p5-family-red: two verdicts whose kernel-recorded families match, with no
    single-vendor exception, are red. check: named test.
  - p5-no-record: a verdict with no kernel review record is not counted.
    check: named test.
  - p5-no-reader: no gate reads `produced-by`. check:
    `grep -rn "produced-by\|producedBy" src scripts plugin/src` finds no
    reader.
  - p5-record: a dispatched review writes a record with head, observed model,
    family and cost. check: named test with a stub executor.
  - p5-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.
  - p5-grant: the Claude Code executor's argv carries exactly the mapped
    grant, and the kernel passes the grant it defines. check: named tests.
  - p5-live: not-testable in CI: it spends a real model call. One live
    `tiphys review dispatch --tier cheaper` is recorded in the work history,
    and its record shows a non-null verdict sha256 and an observed model.
- hazards: a family read from a field the reviewer wrote; a review the kernel
  did not launch counted toward the pair; a failed model observation falls
  back silently to a self-reported value.

## M6-P6: environment script and token diet

- intent: the environment is made deterministic by a script, not by prose;
  agent-facing files carry only what an agent needs.
- tier: `single`.
- files-to-touch: `CLAUDE.md`, `AGENTS.md`, `roles/`, `tuition/`,
  `templates/`, `checklists/`, `scripts/`, `test/`, `.claude/`,
  `gate-registry.yaml`, `assurance-modes.yaml`, `role-model-config.yaml`,
  `charter.yaml`, `delivery/`.
- steps:
  1. A setup script that makes the environment deterministic: a full clone
     (a shallow clone fails three tests), the Node floor, build before suite.
     Keep in prose only what a script cannot fix.
  2. Rewrite `CLAUDE.md` down to current rules; history lives in git and the
     decision records.
  3. Comments only where a field's meaning is not obvious, in the
     implementer brief, the shared dispatch contract and the mechanism index.
     The registry, the modes file and the role config are P5's (see there).
  4. P6 does not edit `AGENTS.md`, `roles/clean-room-reviewer.md`,
     `gate-registry.yaml`, `assurance-modes.yaml` or `role-model-config.yaml`,
     so it can run alongside P5. The setup script also runs from a
     `.claude/settings.json` SessionStart hook in cloud sessions only.
- acceptance:
  - p6-claude: `CLAUDE.md` at most 25,000 bytes. check: `wc -c`.
  - p6-reading: the implementer brief plus its mandated reading at most
    48,000 bytes. check: a named test summing the files.
  - p6-env: the setup script run on a shallow clone leaves a full clone, a
    Node at or above the floor, and a built `dist/`. check: named test or
    command.
  - p6-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.

## M6-P7: a Codex harness can run a review (DR-0065)

- intent: the owner decided the reviewer grant is not a Claude feature and a
  Codex harness must be able to run a review. P5 makes the grant
  harness-neutral; this phase adds the second executor.
- tier: `pair`.
- files-to-touch: `adapters/`, `src/`, `plugin/`, `schemas/`, `test/`,
  `witness/`, `charter.yaml`, `package.json`, `package-lock.json`,
  `delivery/`.
- steps:
  1. Install the Codex CLI to a scratch prefix with npm (pin the version) and
     read its own `codex exec --help`. Every flag used is quoted from that
     output, not from memory.
  2. `adapters/codex/review.ts` implements the kernel's `ReviewExecutor`: its
     own vocabulary (id and version), a tier-to-model map built from models
     the API lists, family `openai` for every model, `command()` mapping the
     kernel's grant to Codex's sandbox and approval settings (writes inside
     the worktree, no network), and `observe()` reading the served model and
     usage from Codex's own output.
  3. One real Codex run is captured and committed as a fixture. The observer
     is tested against it, never against hand-written rows.
  4. Families from two vocabularies are comparable only when both tokens are
     members of `charter.yaml` `review-families.available`. A token outside
     that list is red, naming it. This keeps the P5 refusal for undeclared
     tokens and lets one Claude and one Codex review form a distinct pair.
  5. One live `tiphys review dispatch --executor adapters/codex/review.ts
     --tier cheaper`, with its record in the work history.
  6. `tiphys review dispatch` without `--executor` today falls back to
     `@tiphys/claude-code-plugin`, named in `src/review.ts`. The fallback
     moves to project configuration (for example `review-executor` in
     `charter.yaml`), so a project run by a Codex harness needs no flag and
     `src/` names no harness package.
  7. The work history reports the measured cost of that review next to a
     Claude review of the same brief. The orchestrator then decides whether
     `review-families.available` gains `openai`, which would end the
     single-vendor exception and make every pair cross-vendor (DR-0063).
- acceptance:
  - p7-argv: the Codex executor's argv carries the mapped grant exactly.
    check: named test.
  - p7-observe: the observer returns the served model from the committed real
    capture, and a capture without it reads as not observed. check: named
    tests.
  - p7-families: distinct families from two vocabularies, both in the
    charter's list, are green; a token outside the list is red. check: named
    tests.
  - p7-no-vendor-in-src: no vendor or harness name enters `src/`. check: the
    existing test that asserts it.
  - p7-live: not-testable in CI: it needs an OpenAI key and spends a real
    call. Recorded in the work history with its record.
  - p7-build: `npm run build` exits 0, `npm test` exits 0 with 0 fail.
- hazards: the Codex child inherits pull-request credentials; Codex's
  sandbox is wider than the grant (network on, writes outside the worktree);
  the served model is read from text the reviewer wrote; a family token no
  one declared is compared as if it were a vendor.
- not in scope: publishing the adapter as its own npm package (package names
  are DR-0008's; that needs a new record).

## Not in scope

Any check that verifies this pruning happened. Work-history format, STATE.md,
agent supervision. The pulse and hemma repositories, except through a
released kernel. A rebuild.

## Final report

Per phase: what was deleted (one line each), what was kept with its
`prevents`, anything needing an owner decision, and the `not-testable` count.
