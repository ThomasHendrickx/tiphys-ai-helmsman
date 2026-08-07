# M3 Plan Review, Round 2, Reviewer A (completeness and internal coherence)

- Date: 2026-08-07
- Plan under review: `delivery/plan/kernel-plan-m3.md` revision 2, 4905 lines
- Branch: `claude/m3-plan-regrounding`, worktree head `f9a1e9e`
- Lens: completeness machinery, coverage arithmetic, dependency graph,
  citation existence, staleness against the real repository. Falsifiability
  and hazard analysis are another reviewer's contract and are not duplicated
  here.
- Round 1 (`delivery/review/plan-review-m3-r1.md`) read in full first; findings
  it already closed are not re-raised.

Findings are appended as they are produced. This file is written incrementally
(tuition T-008); its mtime is the liveness beacon.

---

## Method log

- read CLAUDE.md, plan-review-m3-r1.md, STATE.md, T-001..T-009
- reading plan sections 1-8 and appendices A-C
- cross-checks executed with grep/ls/git against this worktree and `main`

---

## M3R2A-001: the plan's model of CI is the two-job shape that DR-0017 deleted; five M3 phases wire steps into it

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:102-103, 147-150, 610-619, 697, 1005, 1423-1427, 4258-4268, 4855
- what: the MECHANISM is that this plan's "what exists when M3 starts" section
  (1.1) is a snapshot of a repository state that no longer exists, and five
  phases' acceptance criteria are written against structures inside that
  snapshot. Concretely, the plan asserts `.github/workflows/gates.yml` has "the
  `test` matrix job and the `gates` fan-in job", and then builds a recurring
  criterion pattern ("a test asserting a check is wired ... extracts the step
  and executes it ... the step moved into a job the fan-in does not need")
  whose FAILURE MODEL is the two-job shape. DR-0017 collapsed CI to one job.
  There is no fan-in and no matrix. Neither DR-0017 nor DR-0018 is cited
  anywhere in the plan.
- evidence:

```
$ git show origin/main:.github/workflows/gates.yml | grep -nE '^(jobs:|  [a-z-]+:|on:)'
3:on:
4:  pull_request:
27:jobs:
28:  gates:
```

  and the workflow's own comment at lines 13-25:

```
# ONE job, named `gates`. ...
# This replaces the earlier two-job shape (a matrix `test` job plus a `gates`
# fan-in that only asserted the matrix succeeded). ... Owner decision
# (2026-08-06): collapse to one job so each run acquires one runner. ...
# adding a matrix would change the context to `gates (26)` and break the
# required-check name.
```

  against the plan:

```
$ grep -c 'fan-in' delivery/plan/kernel-plan-m3.md
8
$ grep -c 'DR-0017' delivery/plan/kernel-plan-m3.md
0
$ grep -c 'DR-0018' delivery/plan/kernel-plan-m3.md
0
$ sed -n '102,103p' delivery/plan/kernel-plan-m3.md
- `.github/workflows/gates.yml` with the `test` matrix job and the `gates`
  fan-in job.
```

- why it matters: D-M3-28 (line 4258ff) is a BINDING criterion pattern applied
  to five phases, and its stated hazard ("the step moved into a job the fan-in
  does not need") cannot occur in a single-job workflow. An implementer writing
  a criterion against a non-existent hazard writes a green, worthless test:
  exactly the red-witness failure CLAUDE.md and T-007 exist to prevent. Worse,
  the REAL hazard in the current workflow is the one DR-0017's comment and
  T-009 both name, that the required status context is the literal string
  `gates` and any structural change to the job breaks branch protection, and
  that the workflow forks behavior on `pull_request` vs `push`. The plan is
  silent on both. An M3 phase that adds a matrix or a second job to satisfy a
  plan criterion would silently detach the required check.
- recommendation: re-ground section 1.1's workflow bullet to the single `gates`
  job; cite DR-0017 and DR-0018 in section 1.6's disposition table; restate
  D-M3-28's hazard in terms of the single-job shape (the extracted-step
  execution test survives, its rationale does not); and add the required
  -status-context invariant ("the job stays named `gates` with no matrix") as
  an explicit constraint on every phase whose files-to-touch list includes
  `.github/workflows/gates.yml`.

## M3R2A-002: the M3 exit test's post-merge witness is the exact incomplete sentence T-009 was written to ban

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:3865-3866 (stage E3.1), and by
  omission across section 4.1 and 4.4
- what: the MECHANISM is that a gate result is evidence only for the CI
  configuration that produced it. The `gates` workflow fires on two events and
  runs different bundles per event, so "CI is green" without an event name and a
  head sha is not a claim about anything. Stage E3.1 of the M3 exit test reads,
  in full: "The squash commit is on `main`; CI is green on `main`; the merged
  SHA is recorded." That sentence does not name the EVENT, does not require the
  `push` run whose head sha is the new tip to be observed, and does not require
  the run to complete. It is satisfiable by looking at the `pull_request` check
  on the merged branch, which is precisely what happened for four hours and
  twenty-one minutes on 2026-08-07.
- evidence:

```
$ sed -n '3863,3867p' delivery/plan/kernel-plan-m3.md
### 4.3 Stage E3: post-merge witnesses

E3.1. The squash commit is on `main`; CI is green on `main`; the merged SHA is
recorded.
```

```
$ grep -nE 'post-merge run|push run|push event|pull_request event|both arms|both events|head sha' delivery/plan/kernel-plan-m3.md
(no output)
$ grep -c 'T-009' delivery/plan/kernel-plan-m3.md
1
$ grep -n 'T-009' delivery/plan/kernel-plan-m3.md
3014:     lowest free id at revision 2 is T-009, and it will very likely have moved
```

  The single occurrence of `T-009` in a 4905-line plan is a passing remark about
  tuition id allocation, not the tuition entry. `CLAUDE.md` states the binding
  rule that the plan does not carry:

```
$ grep -n 'A merge is not complete until' CLAUDE.md
(binding rule, section "Green is scoped to the run that produced it (T-009, binding)")
```

- why it matters: M3's exit test is the milestone's hard gate and its output is
  the evidence bundle presented to the owner under DR-0015. If E3.1 is
  discharged from a `pull_request` check, the exit test certifies a `main` that
  may be red, and the certification is not detectably wrong from inside the
  bundle. Worse, this is a RECORDED failure mode of this project with a measured
  cost, re-enabled by a plan written one day before it was recorded. Every other
  criterion in section 4 names a command and an exit code; this one names
  neither.
- recommendation: rewrite E3.1 to name the event, the head sha and completion:
  "the `gates` workflow run whose event is `push` and whose head sha equals the
  new `main` tip is observed to completion and is green; the run id, event, head
  sha and conclusion are recorded as an evidence record". Add T-009 to section
  1.6's disposition table. Add T-009's second rule (where behavior forks on the
  CI event, both arms need a witness) as a standing constraint on the five
  phases that edit `.github/workflows/gates.yml`, and as a probe in M3-P7's
  clean-room checklist.

## M3R2A-003: owner-action id A-4 is allocated to two different acts in two live documents

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:3511, 3640, 4367, 4395, 4404, 4507
  versus `delivery/STATE.md`:133, 313
- what: the MECHANISM is that the `A-n` owner-action namespace has no declared
  allocator. `CLAUDE.md`'s "Identifier schemes" section registers `SC-`, `R-`,
  `FM-`, `PR-`/`EXT-F-`, `CR-`, `V-`/`U-`, `DR-`, `T-`, `C-` and `D-`, and does
  NOT register `A-`. Two documents therefore allocate independently, and both
  have now issued A-4.
- evidence:

```
$ grep -n 'A-4' delivery/plan/kernel-plan-m3.md | head -3
3511:  action A-4 (publish credentials and the `@tiphys` scope claim) is the one
3640:- blocked-by: M3-P9 merged; owner action A-4 (publish credentials and the
4367:   A-4, the publish credential and the `@tiphys` scope claim, which is elevated

$ grep -n 'A-4' delivery/STATE.md
133:This is therefore an OWNER ACTION, listed in the section below as A-4. The
313:5. **A-4, NEW, ready to execute.** Delete the 35 stale `claude/*` branches.
```

  STATE.md marks its A-4 "NEW", which is the evidence that its author did not
  know the id was taken. The collision is not isolated: the plan retires A-3 and
  marks A-5 done, while STATE.md's list runs A-1, A-2, A-4, A-6 and has no A-3
  or A-5 at all.

```
$ grep -n 'A-[0-9]' delivery/STATE.md | grep -o 'A-[0-9]' | sort -u
A-1
A-2
A-4
A-6
$ grep -o 'A-[0-9]' delivery/plan/kernel-plan-m3.md | sort -u
A-1
A-3
A-4
A-5
```

- why it matters: M3-P10's `blocked-by` field names "owner action A-4" and the
  plan calls it "the only remaining owner item on M3's critical path". STATE.md
  is the document CLAUDE.md designates as "the single place that answers where
  we are right now", and its A-4 is a branch deletion. An orchestrator resuming
  cold reads STATE.md first, sees A-4 done (branches deleted), and can conclude
  M3-P10 is unblocked when the npm credential has never been supplied. The plan
  itself insists ids are "never renumbered, cited across documents" and
  explicitly retires A-3 "per the identifier rule", so this is a violation of a
  discipline the plan is actively practising.
- recommendation: register `A-nnn` in `CLAUDE.md`'s identifier-scheme list with
  `delivery/STATE.md`'s owner-action table named as the single allocator;
  renumber the newer of the two collisions (STATE.md's branch deletion, which
  has no downstream citations, to A-7); and make the plan's M3-P10 `blocked-by`
  cite the act by name as well as by id.

## M3R2A-004: the plan's mapping onto plan v1's M3 outline silently drops outline item 2

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:71-75, 484, 503
- what: the MECHANISM is an accounting claim that enumerates a partition without
  covering it. The plan states that outline item 4 (the migration walk) is
  decomposed into M3-P3..M3-P9, and that "the remaining three phases are the v1
  outline's OTHER items: M3-P1 (outline item 1), M3-P2 (outline item 3), and
  M3-P10 (outline item 5)." Plan v1 section 6 has FIVE outline items. Item 2
  ("M3-P2 role briefs ported from the process doc: investigator, plan writer,
  adversarial plan reviewer, implementer, clean-room reviewer, orchestrator
  (AGENTS.md)") is named nowhere in this plan. The string "outline item 2" does
  not occur.
- evidence:

```
$ grep -n 'outline item' delivery/plan/kernel-plan-m3.md
74:  v1 outline's other items: M3-P1 (schemas, outline item 1), M3-P2 (gate
75:  registry, outline item 3), and M3-P10 (release engineering, outline item 5).

$ grep -n '^[0-9]\. M3-P' delivery/plan/kernel-plan-v1.md | head
(v1 section 6 phase list, items 1..5; item 2 is the role-brief phase)
```

- why it matters: v1's own outline double-books role briefs and AGENTS.md
  (item 2 names them as their own phase; item 4's EXT-F-07 lists them as
  families 1 and 3 of the migration walk). The M3 plan resolves the ambiguity by
  folding item 2 into the walk, which is a REASONABLE resolution, but it never
  states that it made one. A reviewer checking this plan against v1's outline
  finds a phase list that claims to be exhaustive and is not, and cannot tell
  whether item 2's specific obligations were absorbed or forgotten. Two of them
  are load-bearing and easy to lose: "the same phase corrects the process doc's
  role table (SC-001)" and "AGENTS.md encodes the SC-008 merge-authority
  resolution (D-6) and the SC-010 scoped read-only rule (D-8)". They ARE covered
  (SC-001 at :2094 and :2188; D-6/SC-008 at :1459, :1493, :3189; D-8/SC-010 at
  :3191), which is exactly why the omission is a paperwork defect rather than a
  scope hole, and exactly why it should be one sentence to fix.
- recommendation: add one sentence at :71-75 stating that v1 outline item 2
  (role briefs and AGENTS.md) is delivered by M3-P5, M3-P6 and M3-P9, that this
  is a deliberate fold into the EXT-F-07 family decomposition because v1's own
  item 4 lists those same families, and that item 2's three named obligations
  (SC-001 role-table correction, D-6/SC-008, D-8/SC-010) are carried at the
  cited phases.

## M3R2A-005: section 2.5's parallelism derivation contradicts the files-to-touch lists it claims to be derived from

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:742-777 (the overlap paragraph and
  the pairwise table)
- what: the MECHANISM is a derivation whose inputs were not read. Section 2.5
  exists specifically to satisfy DR-0011 condition 1 ("a recorded pairwise
  files-to-touch disjointness check BEFORE each parallel dispatch"), and it
  states that revision 2 "records the derivation ... so a dispatching
  orchestrator reads a table rather than re-deriving one". Three of its
  quantitative claims are false against this plan's own files-to-touch lists,
  and the conclusion rests on them.
  - claim: "Nine of the ten phases edit `src/cli.ts` or `src/validate.ts` or
    both." Actual: SEVEN (P1, P2, P3, P4, P5, P7, P8). P6, P9 and P10 list
    neither.
  - claim: "Six edit `package.json`'s `files` array." Actual: NINE phases list
    `package.json` (all but P4).
  - claim: "Six edit `src/checks.ts`." Actual: six (P1, P3, P4, P7, P8, P9).
    This one is right.
- evidence: run over the plan's own `- files-to-touch:` blocks, bounded by the
  next `- blocked-by:` line:

```
$ for n in 1 2 3 4 5 6 7 8 9 10; do
    s=$(grep -n "^### M3-P$n:" delivery/plan/kernel-plan-m3.md | cut -d: -f1)
    e=$(grep -n "^- blocked-by" delivery/plan/kernel-plan-m3.md | awk -F: -v s=$s '$1>s{print $1; exit}')
    blk=$(sed -n "${s},${e}p" delivery/plan/kernel-plan-m3.md | sed -n "/^- files-to-touch/,/^- \(conflicts-with\|acceptance\|hazard\|citations\)/p")
    echo "M3-P$n cli=$(echo "$blk"|grep -c 'src/cli.ts') validate=$(echo "$blk"|grep -c 'src/validate.ts') package.json=$(echo "$blk"|grep -c 'package.json')"
  done
M3-P1 cli=1 validate=1 package.json=1
M3-P2 cli=1 validate=1 package.json=1
M3-P3 cli=1 validate=1 package.json=1
M3-P4 cli=0 validate=1 package.json=0
M3-P5 cli=1 validate=1 package.json=1
M3-P6 cli=0 validate=0 package.json=1
M3-P7 cli=1 validate=1 package.json=1
M3-P8 cli=1 validate=1 package.json=1
M3-P9 cli=0 validate=0 package.json=1
M3-P10 cli=0 validate=0 package.json=1
```

  against the plan text:

```
$ sed -n '742,748p' delivery/plan/kernel-plan-m3.md
**Pairwise file overlap, and where the chain would break even if the graph
allowed it.** Nine of the ten phases edit `src/cli.ts` or `src/validate.ts` or
both, because every phase registers its own artifact types with the validator's
`--type` table and the `auto` resolver (M3R-001 made that edit explicit per
phase rather than implicit). Six edit `src/checks.ts` to register derived
checks. Six edit `package.json`'s `files` array.
```

  The stated cause is also false as stated: "every phase registers its own
  artifact types" is contradicted by P6, P9 and P10, which introduce artifacts
  (`roles/implementer.md`, `AGENTS.md`, release scripts) and register no type.

- why it matters: the pairwise table's second row reads "every other pair |
  `src/cli.ts` and/or `src/validate.ts` and/or `src/checks.ts`, plus at least one
  artifact the later phase reads | no". For the pairs involving P6 and P10 that
  justification is simply absent from the real lists: P4 beside P6, for example,
  has ZERO file overlap outside the standing extras. The conclusion (serialise
  everything but P7/P8) may still be right on dependency grounds, but DR-0011
  condition 1 asks for a disjointness CHECK, and a check computed from wrong
  inputs returns a result indistinguishable from a correct one. This is the
  fix-round contract's item 3 failure ("a search whose scope is wrong returns an
  empty result indistinguishable from an absence of defects") applied to a
  pre-pass, and this project has been bitten by that shape three times.
- recommendation: recompute the three counts from the files-to-touch lists
  (a script, so it stays true across revisions), replace the "every other pair"
  catch-all row with the real per-pair overlap for at least the pairs whose
  overlap the catch-all misstates (any pair involving P4, P6, P9 or P10), and
  state explicitly where the serialisation is enforced by DEPENDENCY rather than
  by file overlap, since those are different arguments with different failure
  modes.

## M3R2A-006: section 2.5 declares M3-P7 and M3-P8 parallelizable while M3-P8's blocked-by requires M3-P7 merged, and P8's grounding names no P7 artifact

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:770-777 (the qualified yes), 2820
  (P8 `blocked-by`), 2831-2841 (P8 `grounding`), 733-740 (the consumption list)
- what: two coupled incoherences in the one place the plan claims parallelism.
  1. The pairwise table says P7 beside P8 is "**conditionally yes**"
     parallelizable, and the following paragraph states the condition. But
     M3-P8's `blocked-by` reads "M3-P7 merged", which is an unconditional serial
     dependency. Under CLAUDE.md convention 5, MERGE order is dependency order
     but WORK order may be concurrent; a `blocked-by` naming "M3-P7 merged"
     forbids the concurrent start the pre-pass just authorized. The two fields
     cannot both be right.
  2. Section 2.5 asserts "every phase from P2 to P9 grounds on its immediate
     predecessor by name, and each grounding is a real consumption rather than
     an ordering habit", then lists the consumptions. The entry for P8 is "P8
     replaces P6's stub index and re-witnesses P6's mandated-reading path" -
     a consumption of **P6**, not P7. M3-P8's own `grounding` field opens "M3-P7
     merged" and then names, as what it actually consumes, `tuition/README.md`
     (M1-P1), M3-P6's seed `mechanism-index.yaml`, M3-P1's charter `retention`
     field, and the M1-P2 doctor. No M3-P7 artifact is named anywhere in it.
- evidence:

```
$ sed -n '2820,2823p' delivery/plan/kernel-plan-m3.md
- blocked-by: M3-P7 merged; M2-P1 merged (named dependency: the
  `destructiveCommands` list the seeded entry cites; the citation is read-only,
  so nothing here edits a merged M2 artifact, D-M3-16).

$ sed -n '2831,2836p' delivery/plan/kernel-plan-m3.md
- grounding: M3-P7 merged. `tuition/README.md` is the M1-P1 placeholder and
  `tuition/` holds nothing but that and M3-P6's seed `mechanism-index.yaml`
  (`CLAUDE.md`: the root `tuition/` is the future cross-project feed and is not
  `delivery/tuition/`). The charter schema's `retention` field exists from
  M3-P1. The M1-P2 doctor is extended here, so its check list and profile table
  are verified before editing.

$ sed -n '738,740p' delivery/plan/kernel-plan-m3.md
`schemas/role-brief.schema.json` and `brief compose`, which P6 extends rather
than reinvents; P7's checklists must supply the probe ids P2's registry entries
name and are referenced by P6's clean-room brief; P8 replaces P6's stub index
```

- why it matters: section 2.5's whole value is that the graph is checkable
  rather than asserted, and it says so ("The consumptions, so the claim is
  checkable rather than restated"). Checking it finds that P8's link in the
  chain is an ordering habit, which is precisely the thing the derivation
  claims M3 does not have and M2 did. That matters concretely: if P8 does not
  consume P7, then P8 could start as soon as P6 merges, and the real question
  for a dispatching orchestrator is P6-beside-P7-beside-P8, which the plan never
  asks. Meanwhile the contradictory `blocked-by` means an orchestrator following
  section 3 will serialise while an orchestrator following section 2.5 will not.
- recommendation: pick one. Either state P8's real consumption of a P7 artifact
  (if there is one, name it, and drop the parallel claim), or change P8's
  `blocked-by` to "M3-P6 merged" plus "merges after M3-P7 (merge order is
  dependency order)" and re-derive the pre-pass over the P6/P7/P8 triple rather
  than the P7/P8 pair. Also correct the consumption list at :740 so its P8 row
  names the phase it actually cites.

## M3R2A-007: the clause map, the plan's sole EXT-F-07 orphan check, has no specified row inventory, so the orphan it exists to catch is the one it cannot see

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:514-537 (section 2.2), 1003-1006
  (M3-P1 step 9), 1173-1175 (M3-P1 criterion 9), 3699 (stage E0.1)
- what: the MECHANISM is a completeness checker whose only input is the thing
  whose completeness is in question. Section 2.2 specifies
  `scripts/check-clause-map.mjs` as failing on three conditions: "if a row owned
  by a merged phase has no entry, if the named artifact file does not exist, or
  if the clause id does not occur in that artifact". Conditions two and three
  are computable from `clause-map.json` alone. Condition ONE is not: it requires
  an independent enumeration of which rows exist and which phase owns each. The
  plan never says where that enumeration comes from, on any of the 37 lines
  mentioning the clause map (`grep -n 'clause-map\|clause map' ... | wc -l`
  returns 37; the filtered grep below returns nothing. Its scope is lines
  containing
  `clause-map` or `clause map`, so a statement of the source phrased without
  either string would be outside it, and I did not find one by reading section
  2.2 and M3-P1 step 9 in full either). It is not a files-to-touch
  entry of any phase, and `delivery/requirements/` holds only
  `firstmate-scout-report.md` and `migration-table.md`. If the script reads
  `clause-map.json` as its inventory, a phase that simply omits one of its rows
  produces a green check, and E0.1's "exits 0 over all 74 rows" is satisfied by
  a file containing 73.
- evidence:

```
$ ls delivery/requirements/
firstmate-scout-report.md  migration-table.md

$ grep -n 'clause-map' delivery/plan/kernel-plan-m3.md | grep -iE 'inventory|source|reads|input|appendix'
(no output)

$ sed -n '520,523p' delivery/plan/kernel-plan-m3.md
`delivery/requirements/clause-map.json` maps each M3 row to
`{phase, artifact, clause}`, and `scripts/check-clause-map.mjs` fails if a row
owned by a merged phase has no entry, if the named artifact file does not
exist, or if the clause id does not occur in that artifact.
```

  Criterion 9 witnesses only the third condition, both directions:

```
$ sed -n '1173,1175p' delivery/plan/kernel-plan-m3.md
  9. `node scripts/check-clause-map.mjs` exits 0 over this phase's twelve rows;
     removing one clause id from its artifact makes it exit nonzero naming the
     row and the artifact, and restoring it returns exit 0.
```

  There is no criterion anywhere in the plan that reddens the check by REMOVING
  A ROW from `clause-map.json`, which is the only witness that condition one is
  live. The comparison case is instructive, because M2 solved exactly this and
  the solution is on `main`: the coverage gate takes an `inventory` document and
  a `coverageTable` document as separate configured sources with id regexes.

```
$ git show origin/main:src/gates/coverage.ts | sed -n '173,186p'
export const KERNEL_COVERAGE_CONFIG: CoverageConfig = {
  inventory: {
    path: "delivery/requirements/migration-table.md",
    idPattern: "R-[0-9]+[a-z]?",
  },
  coverageTable: {
    path: "delivery/plan/kernel-plan-v1.md",
    idPattern: "R-[0-9]+[a-z]?",
    ...
```

- why it matters: EXT-F-07 is a BINDING external review finding and the clause
  map is the entire discharge of its "own orphan check" clause for seven
  subphases (section 2.1 says so at :507, D-M3-04 at :3990 says so again). A
  check that cannot detect a missing row is not an orphan check; it is a
  presence check over whatever it was given. The failure is silent and it
  compounds: each phase seeds its own rows, and I did not find a clause in the
  plan under which a later phase re-checks an earlier phase's row set. If one
  exists I did not locate it, and the plan should name it.
- recommendation: name the inventory source explicitly in section 2.2 and in
  M3-P1 step 9 (Appendix A of this plan, or plan v1's Appendix A filtered to the
  M3 bucket, parsed the way `coverage.ts` parses a markdown row table), and add
  a fourth acceptance criterion to M3-P1 that reddens the check by DELETING an
  entry from `clause-map.json` and greens it by restoring it. Also state the
  merged-phase determination (which phases' rows are in force) as a mechanical
  rule rather than leaving it to the reader.

## M3R2A-008: section 2.2's reason for not reusing the M2-P6 coverage checker is factually wrong against M2 as delivered

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:532-537; Appendix C item 1 at :4822
- what: section 2.2 declines to reuse M2-P6 on this ground: "Extending a merged
  M2 component from an M3 phase would make every M3 phase a potential edit of
  M2's gate surface." M2-P6 as delivered is CONFIG-DRIVEN. `src/gates/coverage.ts`
  takes `--config <path>` validated against `coverage-config.schema.json`, and
  falls back to a built-in kernel config only when the flag is absent. A second
  coverage instance therefore costs one new JSON config document plus one new
  `gates.manifest.json` entry, and touches no M2 source file at all.
- evidence:

```
$ git show origin/main:src/gates/coverage.ts | grep -n -- '--config'
104: * `--config` document are all supplied by configuration and none of them
168: * configuration document alongside them; a `--config` flag (validated
658:/* <dir> [--config <path>]`, the gate subprocess contract src/gates/run.ts */
706:const VALUE_FLAGS = ["--result", "--evidence", "--config"];
740:/** Load and validate a `--config` document, or fall back to the kernel config. */
810:      "usage: node src/gates/coverage.ts --result <file> --evidence <dir> [--config <file>]\n",

$ git show origin/main:src/gates/coverage.ts | sed -n '741,744p'
function resolveConfig(configPath: string | undefined): LoadedConfig | FailedConfig {
  if (configPath === undefined) {
    return { ok: true, config: KERNEL_COVERAGE_CONFIG };
```

- why it matters: this is not an argument about taste; it is a design decision
  taken on a false premise, and the decision is what leaves M3 building a second
  completeness checker (M3R2A-007's `check-clause-map.mjs`) from scratch, with
  the input-source gap that new tool has and the existing one does not.
  Appendix C item 1 records the merge as "an option for M4 or later", which
  encodes the same wrong cost. Note that reusing M2-P6 does not by itself fix
  M3R2A-007, but it makes the inventory/coverage-table split unavoidable rather
  than optional, which is exactly the property that is missing.
- recommendation: restate the reason. If M3 still wants its own script (there
  are defensible reasons: the clause check is a text-occurrence check over
  arbitrary artifacts, not a bucket check over a table), say THAT and drop the
  gate-surface claim. Either way, adopt M2-P6's inventory/coverage-table
  separation for the clause map.

## M3R2A-009: the phase-declaration projection is specified at the wrong path with the wrong field names, and no M3 phase owns creating one

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:192-197 (the M2 boundary item),
  895-902 (M3-P1 step 2, D-M3-18), 1176-1182 (M3-P1 criterion 10), 4129-4133
  (D-M3-18), 4805 (Appendix B, M3-P1 row)
- what: the MECHANISM is a plan that specifies an interface from the M2 plan's
  text rather than from M2's delivered artifact, so all three observable
  properties of that interface are wrong, and the operational prerequisite the
  interface imposes is invisible.
  1. **Path.** The plan says the projection lives at
     `delivery/plan/phases/<phase-id>.json`. It is
     `delivery/plan/phase-declarations/<phase-id>.json`, lowercase, and the
     directory is passed to the gate from `gates.manifest.json`.
  2. **Field names.** The plan says the projection is
     "(`id`, `branch`, `files-to-touch`, `extras`, `citations`)" and makes
     `extras` "a required phase field". The delivered schema requires
     `filesToTouch` and `declaredExtras`, camelCase, with
     `additionalProperties` closed. `tiphys plan project` as specified would
     emit a document the scope auditor rejects, and M3-P1 criterion 10 ("run the
     real auditor against it, exit 0") would fail on the first attempt.
  3. **Ownership and timing.** The declaration for a phase must be committed to
     `main` BEFORE that phase's branch is created, because the gate reads it out
     of the MERGE BASE. No M3 phase's files-to-touch list contains a phase
     declaration, section 2.4's standing pre-authorized extras do not include
     one, and no step anywhere in the plan creates the ten `m3-pN.json`
     documents. Every M3 branch is `claude/m3-pN-<slug>`, which matches the
     scope gate's `branch-matches` precondition, so scope RUNS on every M3 PR.
- evidence:

```
$ git ls-tree -r origin/main --name-only delivery/plan/phase-declarations/
delivery/plan/phase-declarations/README.md
delivery/plan/phase-declarations/m2-p2.json
... m2-p3 .. m2-p9 ...

$ git show origin/main:src/gates/schemas/phase-declaration.schema.json \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['required'])"
['id', 'branch', 'filesToTouch', 'declaredExtras', 'citations']

$ git show origin/main:gates.manifest.json | python3 -c "import json,sys;print([g for g in json.load(sys.stdin)['gates'] if g['id']=='scope'][0]['command'])"
['node', 'src/gates/scope.ts', '--declarations', 'delivery/plan/phase-declarations']

$ git show origin/main:src/gates/scope.ts | sed -n '421,431p'
 * Read `<declarationsDir>/<phase>.json` out of the MERGE BASE commit, never
 ...
  const relPath = `${declarationsDir.replace(/\/+$/, "")}/${phase}.json`;

$ git show origin/main:delivery/plan/phase-declarations/README.md | sed -n '3,11p'
One JSON document per M2 phase, the projection the scope auditor (M2-P4)
reads. Authored by the orchestrator from `delivery/plan/kernel-plan-m2.md`
section 3's files-to-touch lists, committed to `main` BEFORE any phase
branch is created, never authored or edited on a phase branch ...
The anti-widening property depends on the merge base: the auditor reads the
declaration from the merge base of the audited branch, so a declaration that
is not on `main` when the branch forks cannot govern that branch.

$ sed -n '192,193p' delivery/plan/kernel-plan-m3.md
3. `delivery/plan/phases/<phase-id>.json`, the phase-declaration projection the
   M2-P4 scope auditor consumes (id, branch, files-to-touch, extras,
```

  And the CI harness derives the phase id from the branch, lowercased, which
  fixes the filename M3 must produce:

```
$ git show origin/main:.github/workflows/gates.yml | grep -n 'phase '
  --phase "$(printf '%s' "${{ github.head_ref }}" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')"
```

- why it matters: this is a dispatch blocker for M3-P1 itself, discovered at the
  first PR rather than at planning. The scope audit is one of CLAUDE.md's
  non-negotiable phase-completion conditions, and M2-P9's exit test already
  treats a vacuously not-applicable scope result as the hazard it exists to
  prevent (the workflow comment records that this exact vacuity shipped once).
  Separately, D-M3-18's whole claim ("the auditor's input becomes a generated
  view of one source instead of a second hand-authored source that can drift")
  is a claim about a target the plan has mis-specified, so the generated view
  would not be accepted by the consumer.
- recommendation: correct the path, the field names and the closed property set
  at :192-197 and :895-902, verified by reading
  `src/gates/schemas/phase-declaration.schema.json` on `main` rather than the M2
  plan's prose. Add an explicit pre-dispatch step to section 3's preamble (or to
  the phase-delivery procedure the plan hands the orchestrator): the ten
  `delivery/plan/phase-declarations/m3-pN.json` documents are authored from this
  plan's files-to-touch lists and merged to `main` before the first M3 branch is
  created, exactly as M2's README requires. State whether they are one PR or ten.

## M3R2A-010: M3-P8's files-to-touch enumerates tuition entries T-001 to T-008 as a fixed list, which the scope audit will enforce against a feed that already has nine

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:3039-3061 (M3-P8 files-to-touch),
  2846-2850 (M3-P8 grounding), 3014-3017 (id allocation)
- what: the MECHANISM is a plan that hard-codes an enumeration of a growing set
  into a field the scope auditor treats as a closed list. M3-P8's files-to-touch
  names `tuition/T-001.yaml` through `tuition/T-008.yaml` literally, and its
  grounding says "this build's tuition log has grown from five entries to EIGHT
  ... so step 3's promotion list grows from five to eight". The log has NINE.
  T-009 was recorded 2026-08-07, after revision 2 was written.
- evidence:

```
$ ls delivery/tuition/
T-001-cross-model-review-catches.md      T-006-unexecuted-claims-about-the-world.md
T-002-agent-death-mid-fix-round.md       T-007-criteria-cannot-contain-the-defect.md
T-003-fix-rounds-need-verification.md    T-008-the-orchestrator-had-no-beacon.md
T-004-shared-worktree-verification.md    T-009-green-on-the-wrong-event.md
T-005-lessons-do-not-propagate-between-phases.md

$ grep -n 'tuition/T-00' delivery/plan/kernel-plan-m3.md
3043:  `tuition/T-001.yaml`,
3044:  `tuition/T-002.yaml`, `tuition/T-003.yaml`, `tuition/T-004.yaml`,
3045:  `tuition/T-005.yaml`, `tuition/T-006.yaml`, `tuition/T-007.yaml`,
3046:  `tuition/T-008.yaml` (the three added at revision 2, step 3),

$ sed -n '2846,2850p' delivery/plan/kernel-plan-m3.md
... this build's tuition log has grown from five entries to EIGHT (T-006, T-007
and T-008 were recorded 2026-08-05 and 2026-08-06), all three kernel-relevant,
so step 3's promotion list grows from five to eight ...
```

  The scope gate treats the declared list as closed and anti-widening:

```
$ git show origin/main:src/gates/scope.ts | sed -n '40,44p;110,113p'
 * THE ANTI-WIDENING PROPERTY (criterion 5, this phase's reason to exist).
 ...
 * that leaves the declared set and a new path that never entered it are
 ... present in the diff, so it must be declared.
```

- why it matters: an implementer who does the right thing (promotes the
  kernel-relevant T-009, which is a mechanism rule about CI-event-scoped
  evidence and is exactly the kind of entry the kernel tuition feed exists for)
  fails the scope audit and has to escalate. An implementer who follows the list
  literally silently drops the newest and arguably most kernel-relevant entry.
  The plan itself identified this failure mode for tuition IDENTIFIERS at
  :3010-3017 ("resolve at dispatch; do not copy a number out of this plan") and
  then reintroduced it one screen later for tuition FILENAMES. Note also that
  the same paragraph's "the lowest free id at revision 2 is T-009" is already
  false, which is the rule proving itself for the second time.
- recommendation: replace the literal enumeration with a rule the scope audit
  can hold: declare `tuition/` as a directory entry on the files-to-touch list
  (the phase-declaration schema accepts literal directories, M2R-016), and
  restate step 3 as "every entry in `delivery/tuition/` at dispatch, count
  recorded in the work history" rather than a number. Add T-009 to section 1.6's
  disposition table so its content, not only its id, is dispositioned.

### M3R2A-003, addendum: the collision is three-way, and `A-3` is a literal string in a shipped kernel artifact

Running the same check against the M2 plan on `main` shows a THIRD independent
allocator, and it makes the plan's retirement of A-3 actively wrong:

```
$ git show origin/main:delivery/plan/kernel-plan-m2.md | grep -nE 'A-[0-9]' | head -4
84:| `credential-token` | M2-P8 | ... | green with owner action A-3, else not-applicable |
173:9. **Credential scoping's owner half.** ... item 4 is owner action A-3 in section 6.
506:- blocked-by: M2-P1 merged; ... The `credential-token` witness is blocked by owner action A-3
621:1. **Owner action A-3 (DR-0004 item 4): provision the scoped implementer token.**

$ git show origin/main:gates.manifest.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
print([g['precondition']['id'] for g in d['gates'] if g['id']=='credential-token'])"
['implementer-token-present-owner-action-a-3']
```

So `A-3` means three different things: the scoped implementer token (M2 plan,
OUTSTANDING, and named inside `gates.manifest.json` on `main` as the shipped
precondition id), "approve the exit run's pull request" (M3 plan, removed), and
nothing at all in `delivery/STATE.md`, which has no A-3 row. The M3 plan says at
:4496-4498 that "the id is retired rather than reused, per the identifier rule",
which retires an id that a live plan has assigned to an outstanding owner action
and that a merged, machine-read manifest string depends on. This raises the
severity of M3R2A-003 to **high**: the `A-n` scheme is now load-bearing inside a
kernel artifact and is being allocated by three documents with no registry.

Recommendation, revised: register `A-nnn` in `CLAUDE.md`, declare
`delivery/STATE.md` the allocator, reconcile all three lists in one pass
(M2's A-3 is the one with a machine dependency and must keep its number), and
renumber the M3 plan's A-4 and A-5 and STATE.md's A-4 around it.

## M3R2A-011: the plan wires five new checks as raw workflow steps, which bypasses the gate registry that M3-P2 exists to make "the single source consumed by CI"

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:1005-1006, 1346, 1383-1385, 2251,
  3395-3399, 3572-3576, 3784, 609-620
- what: the MECHANISM is a plan that builds an authority (the gate registry) and
  then routes its own new checks around it. M3-P2 promotes `gates.manifest.json`
  to `gate-registry.yaml` under R-094, "the single source consumed by CI and
  briefs, with the drift check that makes 'single source' true rather than
  asserted". Five M3 phases then add checks to CI as direct `.github/workflows/
  gates.yml` steps: `check-clause-map.mjs` (P1), `render-agent-rules-gates.mjs
  --check` (P2), `check-brief-drift.mjs` (P6), `check-agents-references.mjs` and
  `check-dual-review.mjs` (P9), plus P10's release wiring. None of them is
  declared as a registry or manifest entry anywhere in the plan.
- evidence:

```
$ grep -n 'gate-registry.yaml' delivery/plan/kernel-plan-m3.md | grep -iE 'clause-map|render-agent|brief-drift|agents-references|dual-review'
(no output)

$ grep -n 'gates.manifest.json' delivery/plan/kernel-plan-m3.md | wc -l
      (only section 1.1 / Appendix B references; no M3 phase's files-to-touch
       lists it, verified below)

$ for n in 1 2 3 4 5 6 7 8 9 10; do
    s=$(grep -n "^### M3-P$n:" delivery/plan/kernel-plan-m3.md | cut -d: -f1)
    e=$(grep -n "^- blocked-by" delivery/plan/kernel-plan-m3.md | awk -F: -v s=$s '$1>s{print $1; exit}')
    sed -n "${s},${e}p" delivery/plan/kernel-plan-m3.md | sed -n "/^- files-to-touch/,/^- conflicts-with/p" | grep -q 'gates.manifest.json' && echo "M3-P$n declares gates.manifest.json"
  done
(no output: no M3 phase declares it)

$ sed -n '1005,1006p' delivery/plan/kernel-plan-m3.md
     twelve rows. Wire the check into `.github/workflows/gates.yml` as a step in
     the existing `test` job (verify the job layout first).
```

  and the exit test's only gate-coverage assertion:

```
$ sed -n '3783,3785p' delivery/plan/kernel-plan-m3.md
the change lands with its tests; the M2 gate runner over
`gate-registry.yaml --mode full` exits 0 with no gate green whose precondition is
unmet; ...
```

- why it matters: three consequences, all downstream of one decision the plan
  never states it made.
  1. E1.6 asserts the gate runner over the registry exits 0 with nothing
     vacuously green. Five of M3's own checks are outside that run, so the exit
     test's central gate-coverage claim does not cover the milestone's own new
     checks, and no evidence record in the bundle names them.
  2. R-094's property ("single source consumed by CI") is falsified by this
     plan's own additions on the day M3-P2 merges.
  3. Post-DR-0017 the workflow forks on event (`if: github.event_name ==
     'pull_request'` versus not). A raw `run:` step with no `if:` executes on
     BOTH arms; one with an `if:` executes on one. The plan specifies neither,
     which is the T-009 shape one level down: a check whose event applicability
     is unstated is a check nobody can say is green on `main`.
  Note also the instance at :1005-1006, which names "the existing `test` job".
  There is no `test` job (M3R2A-001).
- recommendation: state the routing decision explicitly. Either every M3 check
  enters `gate-registry.yaml` with an applicability and a precondition (which is
  what R-094 implies and what makes E1.6 meaningful), or the plan declares which
  checks are deliberately workflow-level and why, names their event
  applicability, and adds them to the exit test's evidence list separately. Add
  `gates.manifest.json` to the files-to-touch list of whichever phases must
  register entries, per the phase-declarations README's M2R-020 rule.

## M3R2A-012: section 1.5's binding format table omits two artifact types the plan ships and validates

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:386-408
- what: section 1.5 declares itself binding: "It is binding on every M3 phase,
  and a phase that ships an artifact in a form not listed here is a review
  finding." The table has sixteen rows. Two artifact types the plan ships,
  registers with `--type`, and validates in the exit test are absent: the
  **finding set** (`schemas/finding.schema.json`, M3-P5, row R-029) and the
  **verdict** (`schemas/verdict.schema.json`, M3-P7, row R-060). Both carry
  substantial prose per finding, which is exactly the case the table exists to
  adjudicate, and both would otherwise inherit no reason at all.
- evidence:

```
$ sed -n '386,408p' delivery/plan/kernel-plan-m3.md | grep -oE '^\| [^|]+' | sed 's/^| //'
Artifact type
schemas
charter
plan
decision record
status line
report and final report
work history
gate registry
assurance modes
role-to-model configuration
checklists (probe lists)
tuition entries
mechanism index
role briefs (`roles/*.md`)
`AGENTS.md`
fleet environment-warnings file (`warnings.md`)

$ grep -nE 'validate --type (finding-set|verdict)' delivery/plan/kernel-plan-m3.md
3775:`tiphys validate --type finding-set` exits 0; the
3790:`tiphys validate --type verdict --context <plan dir>` exits 0, which runs

$ grep -n 'schemas/finding.schema.json\|schemas/verdict.schema.json' delivery/plan/kernel-plan-m3.md | head -4
2116:  `schemas/role-brief.schema.json`, `schemas/finding.schema.json`,
2697:- files-to-touch: `schemas/checklist.schema.json`, `schemas/verdict.schema.json`,
4763:| R-029 | M3-P5 | `schemas/finding.schema.json`: verdict, severity-ranked findings, concrete plan edits, `produced-by` (T-001) |
4775:| R-060 | M3-P7 | `schemas/verdict.schema.json`: verdict, severity-ranked findings, concrete plan edits, `produced-by` (T-001) |
```

- why it matters: DR-0006 requires a per-type reason and says convenience is
  never valid. The two omitted types are the ones whose prose content is most
  arguable (a finding's analysis, a verdict's reasoning), so they are precisely
  the two where an implementer will improvise a form and where a reviewer has
  nothing to check it against. The section's own enforcement clause makes any
  form the implementer picks a review finding by construction, which turns a
  planning omission into a guaranteed fix round.
- recommendation: add two rows. Given the plan's other rows, the shape is
  probably "YAML; per-finding `analysis` and the verdict `rationale` are block
  scalars", with the reason stated in the same terms as the report row.

## M3R2A-013: M3-P10 must commit the exit-test evidence bundle and write a pre-run supervision file, neither of which is on its files-to-touch list

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md`:3572-3576 (M3-P10 files-to-touch),
  3702-3706 (E0.2), 3889-3891 (E4.4)
- what: section 4 requires two `delivery/evidence/m3-exit-test/` artifacts:
  `supervision-rules.md`, committed BEFORE stage E1 begins with the commit
  ordering asserted from the bundle (E0.2 and E0.5), and the full evidence
  bundle committed through a pull request (E4.4). M3-P10's files-to-touch list
  contains neither, and section 2.4's standing pre-authorized extras
  (`test/behaviors.json`, `delivery/requirements/clause-map.json`,
  `delivery/work-history/m3-pN.md`) do not cover them.
- evidence:

```
$ sed -n '3572,3576p' delivery/plan/kernel-plan-m3.md
- files-to-touch: `scripts/license-gate.mjs`, `scripts/release-verify.sh`,
  `.github/workflows/release.yml`, `THIRD-PARTY-NOTICES` (create only if a
  declaration requires it), `test/license-gate.test.ts` (create);
  `package.json` (edit), `src/commands/init.ts` (edit),
  `test/init.test.ts` (edit), `.github/workflows/gates.yml` (edit).

$ grep -n 'delivery/evidence/m3-exit-test' delivery/plan/kernel-plan-m3.md
3703:`delivery/evidence/m3-exit-test/supervision-rules.md`, written before the run
3739:... written into
3740:`delivery/evidence/m3-exit-test/supervision-rules.md` BEFORE stage E1 begins,
3889:E4.4. The evidence bundle is committed to `delivery/evidence/m3-exit-test/`
```

  M2 solved this with the phase declaration's `declaredExtras`, which the M3
  plan does not use (see M3R2A-009):

```
$ git show origin/main:delivery/plan/phase-declarations/m2-p9.json | grep -A2 declaredExtras
  "declaredExtras": [
    "delivery/evidence/m2-exit-test/"
  ],
```

- why it matters: the scope audit is a hard phase-completion condition, and an
  undeclared path is a red gate, not a warning. M2-P9 hit exactly this shape and
  declared the directory; M3-P10 has strictly more evidence to commit and
  declares none of it. The E0.2/E0.5 file is worse than the bundle, because its
  whole value is that its COMMIT PRECEDES the first E1 record (E0.5: "the file's
  commit precedes the first E1 evidence record"), so adding it after a scope
  audit rejects it destroys the very ordering property E0.5 asserts.
- recommendation: add `delivery/evidence/m3-exit-test/` to M3-P10's declared
  extras (and to its phase declaration once M3R2A-009 is fixed), and state
  whether `supervision-rules.md` lands in M3-P10's own branch or in a separate
  pre-dispatch commit to `main`, since E0.2 requires it to exist before the run
  and E4.4 puts the bundle in a pull request.

## M3R2A-014: M3-P4's acceptance criteria are numbered out of order (2, 2c, 2d, 2b)

- severity: low
- location: `delivery/plan/kernel-plan-m3.md`, M3-P4 acceptance criteria
- what: sub-criteria appear in the order 2, 2c, 2d, 2b. Every other phase's
  sub-lettering is monotonic. A criteria list is walked item by item by the
  clean-room reviewer and by the verdict schema's `verdict-criteria-complete`
  derived check, which compares a verdict's `criteria[]` against the plan
  phase's; an out-of-order id is the kind of thing a hand-transcribed
  `criteria[]` silently drops.
- evidence:

```
$ python3 -c "... extract per-phase criteria ids ..."
M3-P1: ['1','2','3','4','4b','4c','5','5b','5c','5d','5e','6','7','8','9','10','11','12','13']
M3-P4: ['1','2','2c','2d','2b','3','4','5','6']
M3-P7: ['1','2','3','3b','4','4b','4c','4d','4e','4f','5','6']
```

  (no duplicates and no numeric gaps in any phase; M3-P4 is the only ordering
  anomaly)
- why it matters: low on its own; it matters because M3-P7's
  `verdict-criteria-complete` will compare against this list mechanically and
  the plan is the source of truth for it.
- recommendation: reorder to 2, 2b, 2c, 2d.

## M3R2A-015: section 1.1 describes M2 as a PREDICTION taken from the M2 plan, and M2 is now delivered and readable; the plan says this is unsafe and then does it

- severity: high
- location: `delivery/plan/kernel-plan-m3.md`:33-37 (header, "M2 has not
  started"), 79-233 (all of section 1.1), 4797-4816 (Appendix B)
- what: this is the MECHANISM behind M3R2A-001, M3R2A-009 and M3R2A-011 rather
  than a fourth instance. Section 1.1's model of what M3 consumes is derived
  from `delivery/plan/kernel-plan-m2.md`, a document that was DRAFT when
  revision 2 was written. The plan states the risk explicitly and correctly:

```
$ sed -n '228,233p' delivery/plan/kernel-plan-m3.md
**At revision 2 the M2 plan is DRAFT at revision 2, re-grounded 2026-08-05 and
pending its own adversarial review round 2**, so a path taken from it is a
starting point for that verification, never a substitute for it. This is not a
formality: M2's revision 2 rewrote M2-P7 substantially, rebuilt its section 1.5
traceability table from thirteen rows to twenty-two, added constraint M2-C-6,
and changed its parallel structure. Any of those can move again.
```

  They did move. M2 is COMPLETE. Every joint the plan names is now an artifact
  on `main` that can be read instead of predicted, and reading three of them
  found three defects (the CI job structure, the phase-declaration
  path/field-names/timing, the routing of new checks). The plan's own header
  still asserts the opposite state:

```
$ sed -n '33,37p' delivery/plan/kernel-plan-m3.md
  exit test PASSED on the merged head on Node v26.6.0 with a 56-record evidence
  bundle and a falsification control that exits 1, so the pass is a measurement.
  M2 has not started and is held by the owner's hard stop at the M1 boundary,
  which permits document work such as this re-grounding and permits no dispatch.
```

  against reality:

```
$ git log --oneline -3 origin/main
dbba3c8 STATE: correct the branch-cleanup claim, which asserted a deletion that failed (#34)
d997985 STATE: make main the source of truth for the post-exit-test fix round (#33)
50bcecb Tuition T-009: a gate result is evidence only for the run that produced it (#31)

$ grep -n 'milestone: M2' delivery/STATE.md
  milestone: M2 (gate registry), COMPLETE including its post-exit-test fix
```

- **derivation, published in full per the fix-round contract.** I enumerated
  every file path section 1.1 names and tested each against `main`'s tree:

```
$ python3 -c "<extract backticked paths from section 1.1; test each against
              git ls-tree -r --name-only origin/main>"
OK     .github/workflows/gates.yml      OK     src/brief.ts
ABSENT AGENTS.md   (M3 creates it)      OK     src/cli.ts
OK     CLAUDE.md                        OK     src/fleet.ts
OK     MECHANISMS.md                    OK     src/hooks.ts
OK     bin/tiphys.ts                    OK     src/liveness.ts
OK     delivery/STATE.md                OK     src/lock.ts
OK     delivery/plan/kernel-plan-m2.md  OK     src/pool.ts
OK     delivery/verification/m1-exit-test-evidence.md
OK     gates.manifest.json              OK     src/spawn.ts
OK     roles/README.md                  OK     src/task.ts
OK     sandbox/                         OK     src/teardown.ts
OK     schemas/  schemas/README.md      OK     src/watcher.ts
OK     scripts/m1-exit-test.sh          OK     test/behaviors.json
OK     scripts/stub-payload.sh          OK     tuition/README.md
```

- **what this derivation did NOT cover, stated because an empty result from a
  wrongly scoped search is indistinguishable from an absence of defects.**
  1. It tests PATH EXISTENCE only. Every defect I actually found in section 1.1
     is a STRUCTURE or CONTENT claim about a path that exists: the job layout
     inside `gates.yml`, the field names inside `phase-declaration.schema.json`,
     the location of `phase-declarations/`. A path-existence sweep returns
     all-green against every one of them. The three I found came from reading
     three artifacts by hand, not from this sweep.
  2. It only covers paths written inside backticks in section 1.1. Paths named
     in section 3's steps, in Appendix B's prose, and glob-shaped references
     such as `delivery/plan/phases/<phase-id>.json` are outside it. That last
     one is the M3R2A-009 defect, and it is outside this derivation's scope by
     construction.
  3. It says nothing about the SEMANTICS of the eight named M2 components
     (whether the coverage checker's input contract, the red-witness evidence
     file format, the suite wrapper's exit-code semantics, or M2-P7's outcome
     enum are what the plan believes). I read the coverage checker's config
     surface (M3R2A-008) and the scope gate's declaration surface (M3R2A-009).
     I did NOT read `src/gates/red-witness.ts`, `src/gates/suite.ts`,
     `src/gates/citations.ts`, `src/gates/deploy.ts`, `src/gates/migrations.ts`
     or `src/gates/credentials.ts` against the claims M3-P4, M3-P6, M3-P7 and
     M3-P3 make about them. Three of five artifacts I did read carried a
     mis-specification, so I would not assume the six unread ones are clean.
- why it matters: revision 2 was a re-grounding, and DR-0011's recorded
  consequence makes re-grounding the explicit step before adversarial review
  precisely so a plan is not reviewed against a world that has changed. The
  re-grounding was performed against M2's PLAN because that was all that existed
  on 2026-08-06. It no longer is. Every phase from M3-P1 onward will discover
  these at implementation time, one at a time, which is the shape CLAUDE.md's
  fix-round contract measures at roughly a third of M1's elapsed time.
- recommendation: a third re-grounding pass, scoped narrowly and mechanically:
  for each of the eight M2 components and four named artifacts in section 1.1
  and each row of Appendix B, open the delivered artifact on `main`, and record
  in section 1.6 either "confirmed, command and output" or the correction.
  Update the header's state paragraph, add DR-0017, DR-0018 and T-009 to the
  disposition table, and re-read the six gate modules listed in item 3 above
  against the phases that consume them.

---

## Confirmed clean (checked, no finding)

Recorded so a later reader can tell a checked-and-sound region from an
unexamined one.

1. **Appendix A arithmetic is exact.** 74 rows, no duplicate row id, per-phase
   counts equal the stated counts, and the row SET is identical to plan v1's M3
   bucket in both directions.

```
$ awk 'NR>=4713 && NR<=4795 && /^\| R-/' delivery/plan/kernel-plan-m3.md | wc -l
74
$ ... | cut -f2 | sort | uniq -c
 12 M3-P1   3 M3-P2   3 M3-P3   9 M3-P4   7 M3-P5
 13 M3-P6  13 M3-P7   3 M3-P8  11 M3-P9   (M3-P10 = 0)
$ ... | cut -f1 | sort | uniq -d
(empty: no duplicates)
$ comm -23 <(v1 M3 bucket rows) <(M3 Appendix A rows); comm -13 ...
(both empty)
```

2. **Section 2.1's EXT-F-07 table sums correctly.** 7+13+13+11+9+3+3 = 59 for
   the seven migration-walk phases, plus 12+3+0 = 15 for M3-P1, M3-P2, M3-P10 =
   74. Round 1's M3R-006 ("eight phases" against a seven-row table) is fixed and
   no successor error is present here.
3. **"No M3 phase is blocked on an open owner DECISION" is TRUE**, verified by
   reading all ten `blocked-by` fields. P1 names M2 exit evidence; P2..P9 name a
   predecessor plus merged M2 phases; P10 names M3-P9 plus owner ACTION A-4.
   DR-0010 appears in M3-P3's `blocked-by` as a should-be-answered note with a
   stated recommendation and an explicit no-work-if-no answer, which is not a
   block. (The A-4 identifier is a separate defect: M3R2A-003.)
4. **All 152 new behavior names are unique across the ten phases and none
   collides with the 414 already in `test/behaviors.json` on `main`.**
5. **The derived-check table has exactly the sixteen rows it claims**, and its
   owning phases (P1 x2, P3 x4, P4 x2, P7 x5, P8 x2, P9 x1) match exactly the
   six phases whose files-to-touch lists include `src/checks.ts`.
6. **Acceptance-criteria ids have no duplicates and no numeric gaps in any
   phase** (one ordering anomaly, M3R2A-014).
7. **Every DR-nnnn, T-nnn, C-n, SC-nnn and EXT-F-nn the plan cites exists.**
   DR-0001 to DR-0016 cited, all present in `delivery/decisions/`; T-001 to
   T-009 all present; C-1..C-3 and EXT-F-04/05/07/09 all present in plan v1.
8. **Every file path named in section 1.1 exists on `main`** except `AGENTS.md`,
   which M3-P9 creates (see M3R2A-015 for what this check cannot see).
9. **D-M3-17's "twelve items" matches M2's section 2**, which carries twelve
   numbered boundary items on `main`.
10. **ASCII purity holds.** `grep -cP '[^\x00-\x7F]'` returns 0 and there are no
    em dashes.
11. **The named M2 dependencies in Appendix B are real**: scope auditor,
    citation linter, coverage checker, validator with the `INVALID <pointer>
    <message>` contract (`src/gates/validate.ts:90`), `src/gates/schemas/`,
    `gates.manifest.json` with the reserved `modes` field
    (`gate-manifest.schema.json:70`), `destructiveCommands` (present, required
    by the manifest schema, seeded with four entries), the red-witness harness,
    the suite wrapper, and credential scoping. None of the named dependencies is
    missing. What is wrong is their described SHAPE, not their existence.

## Verdict

**CHANGES REQUIRED.**

| Severity | Count | Findings |
|---|---|---|
| high | 7 | M3R2A-001, 002, 003 (raised from medium by its addendum), 005, 007, 009, 015 |
| medium | 7 | M3R2A-004, 006, 008, 010, 011, 012, 013 |
| low | 1 | M3R2A-014 |
| **total** | **15** | |

The plan's internal completeness machinery is in good shape where it is closed
over the plan's own text: the requirement-row arithmetic, the behavior registry,
the derived-check registry, the criteria numbering and the citation set all
verify. Every high finding is at a JOINT with the world outside the plan: the
CI workflow, the scope auditor's declaration format, the tuition feed, the
clause map's missing external inventory, and the `A-n` namespace shared with two
other live documents. That is one mechanism (M3R2A-015) with six measured
instances, and it is fixable by one bounded pass rather than by re-planning.

## What I did NOT cover

Stated at the length the fix-round contract requires, because an unstated
exclusion reads as a clean result.

1. **Falsifiability of individual acceptance criteria, and hazard analysis.**
   Assigned to the other reviewer. I read criteria for NUMBERING, for internal
   references, and for whether the file list can satisfy them; I did not judge
   whether any given criterion is falsifiable or whether its red witness is a
   real one. In particular I did not evaluate section 2.3's Kind A / Kind B
   rules, the two-directional witness criteria, or the "one witness is not a
   class" applications at M3-P1 criterion 5, M3-P6 criterion 2, M3-P7 criterion
   3b and M3-P9 criterion 3.
2. **Six of the eleven delivered M2 gate modules.** I read `src/gates/coverage.ts`,
   `src/gates/scope.ts`, `src/gates/validate.ts`, `src/gates/manifest.ts`
   (schema only) and `gates.manifest.json`. I did NOT read
   `src/gates/red-witness.ts`, `src/gates/suite.ts`, `src/gates/citations.ts`,
   `src/gates/deploy.ts`, `src/gates/migrations.ts` or `src/gates/credentials.ts`
   against the claims M3-P3, M3-P4, M3-P6 and M3-P7 make about them. Three of
   the five artifacts I did open carried a mis-specification, so the base rate
   here is not low and the unread six should be treated as unchecked, not clean.
3. **Section 3's step lists in detail.** I read every phase's `grounding`,
   `blocked-by`, `conflicts-with`, `files-to-touch`, `new behaviors` and
   criteria ids in full, and read the step bodies of M3-P1, M3-P2, M3-P6, M3-P8
   and M3-P10. I skimmed the step bodies of M3-P3, M3-P4, M3-P5, M3-P7 and
   M3-P9. A contradiction living only inside one of those five step bodies would
   not have been found.
4. **Section 5's decision list (D-M3-01 to D-M3-32) as a set.** I followed
   individual D-M3-nn citations where a finding led to one (16, 17, 18, 19, 22,
   23, 26, 27, 28, 29, 32). I did not audit the list for internal contradiction,
   for numbering gaps, or against plan v1's D-1..D-19.
5. **Section 8's risks (1 to 12) and Appendix C's items (1 to 13).** Read for
   whether they contradicted a finding I already had; not audited independently.
6. **The intake documents and the migration table.** Not read this round. Row
   ownership was checked against plan v1's Appendix A, which is the plan's own
   declared source, not against `delivery/requirements/migration-table.md`. A
   row that plan v1 mis-bucketed would be invisible to my check.
7. **Whether M3's scope is the right scope.** Out of contract. I checked that
   what the plan says it builds is internally accounted for, not that it is the
   correct set of things to build.
8. **Nothing was executed against a built kernel**, because none of M3's
   artifacts exists yet. All evidence above is `git`, `grep`, `ls`, `sed`,
   `awk` and `python3` over committed text on `main` and on this worktree at
   `f9a1e9e`.

## Claim-grep discharge (CLAUDE.md, binding on this report)

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/review/plan-review-m3-r2-a.md
```

Fourteen hits. Disposition, one line each:

- lines quoting `src/gates/scope.ts`, the phase-declarations README, the ls of
  `delivery/tuition/`, DR-0006 and the plan's own text: quotations, not my
  claims.
- "the plan never states it made [a resolution]" (M3R2A-004) and "the plan never
  states it made [the routing decision]" (M3R2A-011): each backed by the
  adjacent `grep -n 'outline item'` / `grep -n 'gate-registry.yaml' | grep -iE
  ...` output in the same finding.
- "which the plan never asks" (M3R2A-006): backed by the pairwise table quoted
  in the same finding, whose only parallel row is P7-beside-P8.
- "the plan never says where that enumeration comes from" (M3R2A-007): restated
  with its grep's scope named, and with what I read by hand beyond the grep.
- "a phase that under-seeds is never contradicted by any later phase"
  (M3R2A-007): restated as an open question ("I did not find a clause under
  which a later phase re-checks an earlier phase's row set").
- "it cannot be added retroactively" (M3R2A-013): restated in terms of the
  property E0.5 asserts, with E0.5 quoted.
- "M3-P10 is unblocked when the npm credential has never been supplied"
  (M3R2A-003): a described reader scenario, not a claim about the world; the two
  conflicting A-4 definitions are captured above it.

ASCII check on this file:

```
$ grep -cP '[^\x00-\x7F]' delivery/review/plan-review-m3-r2-a.md
0
```
