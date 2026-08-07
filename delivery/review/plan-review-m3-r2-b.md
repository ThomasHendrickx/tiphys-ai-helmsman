# M3 plan review round 2 (b): STARTING 21:23:11

- Reviewer lens: falsifiability and hazard (adversarial, round 2, second reviewer "b").
- Read first: CLAUDE.md, delivery/review/plan-review-m3-r1.md, delivery/tuition/T-001..T-009, then delivery/plan/kernel-plan-m3.md (4905 lines) in full by section.
- Method: grep-driven cross-checks of hazard-class prose against the acceptance-criteria and derived-check tables that are supposed to operationalize them, and a search for T-009's substance (newest tuition entry, cannot have been absorbed by revision 2).
- Writing incrementally per T-008/beacon discipline; findings appended as found, not batched at the end.

---

## M3R2B-001: The exit test's own merge-completion criterion reintroduces exactly the T-009 failure it postdates

- severity: high
- location: `delivery/plan/kernel-plan-m3.md:3863-3866` (stage E3.1); also `delivery/plan/kernel-plan-m3.md:3179-3494` (M3-P9, `AGENTS.md`, no `merge is not complete until...` clause); contrast `delivery/tuition/T-009-green-on-the-wrong-event.md`
- what: T-009 (2026-08-07, the day before this plan revision's most recent commits) is a **binding consequence with an exact sentence**: "A merge is not complete until the post-merge `push` run on the new `main` head is observed to completion. Not the PR check on the branch: the run whose head sha is the new tip." The M3 exit test's own post-merge stage, E3.1, reads: "The squash commit is on `main`; CI is green on `main`; the merged SHA is recorded." This is exactly the sentence structure T-009 diagnoses as the failure mode: "CI is green" stated without naming which run, on which event, checked how. Nothing in E3.1 requires watching the `push`-triggered run on the new head to completion as opposed to reading the already-green `pull_request` check on the merged branch, which is the precise substitution that produced four hours twenty-one minutes of red `main` while every PR check stayed green. `AGENTS.md` (M3-P9) is the document T-008 turned into "the most load-bearing prose M3 ships" for the beacon/watchdog dispatch contract, but it carries no equivalent clause for T-009's mechanism ("a gate result is evidence only for the configuration it ran under") anywhere in its eleven-plus-clause list (checked against the full step 2/2b/2c/3/3b/4 text, `delivery/plan/kernel-plan-m3.md:3179-3448`).
- the defective implementation that still passes: an implementer (or orchestrator, at the real M3-P10 exit run, or at any future phase merged under this milestone's own machinery) reads the PR's `pull_request`-event check as "CI is green on main", records the merged SHA, and moves on. Every criterion in section 4 stage E3 is met: the SHA is on `main`, some CI run (the PR one) is green, the SHA is recorded. If `.github/workflows/gates.yml`'s `push` arm silently breaks in the same shape T-009 recorded (an unconditional derivation step, a bundle mismatch, anything that forks on `github.event_name`), nothing in this plan's own acceptance criteria, exit test, or `AGENTS.md` clause set requires anyone to have looked at that arm before declaring the phase or the milestone closed.
- evidence: `grep -n -i 'T-009\|post-merge push\|new main head\|head sha\|both arms' delivery/plan/kernel-plan-m3.md` returns exactly one hit, at line 3014, inside M3-P8's tuition-ticket-numbering discussion ("the lowest free id at revision 2 is T-009") ,  a citation of T-009 as an ID-allocation fact, never as the mechanism. `grep -n -i 'push to main\|pull_request\|github.head_ref\|--bundle\|event_name' delivery/plan/kernel-plan-m3.md` shows the plan discusses `gates.yml` only in the context of adding new steps to it (five phases wire a check in), never in the context of which CI event a check runs under. Contrast `delivery/tuition/T-009-green-on-the-wrong-event.md`'s own "Binding consequence" section, item 1, quoted above verbatim.
- recommendation: Add to stage E3.1 (or a new E3.0): "the post-merge `push`-triggered run on the exact SHA that is now the tip of `main` is observed to completion and is green; the SHA of that run is recorded and compared byte-for-byte against the merge commit; a `pull_request`-event check on the source branch does not discharge this." Add a symmetric clause to `AGENTS.md`'s merge-authority duty (M3-P9 step 2) citing T-009 by id, parallel to how T-008 got three named clauses in step 4. If any M3 phase's own CI wiring (the five phases that edit `gates.yml`) forks behavior on `github.event_name`, require both arms be witnessed per D-M3-28's own logic extended to events, not only to text-vs-behavior.

---

## M3R2B-002: M3-P2's own named hazard ("a promotion that silently drops M2's units-greater-than-zero rule, so a gate examining nothing reports green lawfully") has no corresponding acceptance criterion, derived check, or fixture anywhere in the phase or the plan's Kind-B check table

- severity: high
- location: `delivery/plan/kernel-plan-m3.md:1319-1327` (grounding note (b)) and `:1337-1351` (hazard class); contrast the acceptance-criteria block `:1403-1436` and the derived-check table at section 2.3, `:596-614`
- what: M3-P2's own grounding section names two specific M2 constraints the registry promotion must not silently weaken: "M2-C-2 (never green by omission: a green record carries `units` greater than zero) and M2-C-3 (fail closed: a check that cannot reach a verdict is `error`, never not-applicable)," and instructs the implementer to "verify their delivered shape before extending, because a superset that drops a base constraint is a widening dressed as a promotion." The phase's own hazard-class paragraph restates the identical concern as the thing a defect would look like: "a promotion that silently drops M2's `units`-greater-than-zero rule, so a gate examining nothing reports green lawfully." This is a textbook mechanically-checkable property, structurally identical to `report-parity-arithmetic` (M3-P4, arithmetic over sibling fields, built as a registered Kind B check with fixtures) and to every other item in section 2.3's derived-checks table. Yet `units` does not appear anywhere else in the entire 4905-line plan: not in M3-P2's seven acceptance criteria (1 through 7, including criterion 3's real-gate-runner-output assertion, which checks precondition-vs-green but never checks unit counts), not in the section 2.3 derived-check table (sixteen rows, none named `gate-result-units-nonzero` or similar), not in any `new behaviors` list, not in the exit test. The instruction to "verify" is a bare prose imperative with no falsifiable criterion behind it ,  exactly the T-006 shape ("an assertion about the world belongs in a record only with the command that produced it") one level up: a claim the plan asks the implementer to make ("M2-C-2 and M2-C-3 survive the promotion") with no command named that would let a reviewer check it, and no registered test that would catch a regression later. Contrast M3-P1, which is otherwise this plan's most rigorous phase and translates every single hazard-class item into a numbered acceptance criterion (5, 5b, 5d, 5e, the fourteen DR-0013 validator criteria) ,  M3-P2 is the one phase where the hazard-class prose and the criteria list visibly diverge.
- the defective implementation that still passes: an implementer promotes `gates.manifest.json` to `gate-registry.yaml` and, in step 4, extends the M2 gate runner with `--registry` and `--mode` selection. In doing so (deliberately or by an ordinary refactor) the runner's result-emission path stops requiring `units > 0` for a `green` verdict, or turns an `error` case for an unreachable check into `not-applicable`. Every one of M3-P2's seven criteria still passes: criterion 1 (schema validates), criterion 2 (probe-required if/then), criterion 3 (the real gate runner run over the kernel repo reports every kernel-generic gate green and every project-specific gate not-applicable, with "zero gates reported green whose precondition is unmet" ,  a check about preconditions, not about `units`), criteria 4 through 7 (schema-level DANGEROUS-instance witnesses, the drift-check wiring, the CLAUDE.md rendering, `node --test` exit 0). A `suite` gate that examines zero tests (an empty glob match) now reports `green` lawfully under the promoted registry and its extended runner, and nothing built in this phase, or cited from M2, catches it.
- evidence: `grep -n -i 'units' delivery/plan/kernel-plan-m3.md` -> two hits, both inside M3-P2's own grounding/hazard-class prose (lines 1324, 1350); zero hits anywhere in the acceptance-criteria block, the section 2.3 derived-check table, the `new behaviors` list, or section 4 (`sed -n '1298,1449p'` of the plan, full M3-P2 section, read in full above).
- recommendation: Add a Kind B derived check (`gate-result-units-nonzero`, or fold into the existing `gate-registry-not-applicable-not-green` behavior's test) that runs the real M2 gate runner against a fixture gate whose script check reports zero units examined and asserts the result is `error` or a non-green outcome, not `green`; witness it in both directions (green with a nonzero-unit fixture, rejected with a zero-unit one, per section 2.3 rule 3). Add a companion criterion asserting M2-C-3's fail-closed behavior survives the `--registry`/`--mode` extension of the gate runner (a check that cannot reach a verdict, exercised with a fixture that forces that path, reports `error` and never `not-applicable`). Cite M2-C-2 and M2-C-3 by id in the acceptance criteria the way every other named constraint in this plan is cited where it is checked, not only where it is described.

---

## M3R2B-003: `brief compose`'s rendered-phase-text completeness is named as the phase's own hazard and then never checked

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md:2046-2047` (hazard class) vs. acceptance criterion 3, `:2134-2137`, and the full M3-P5 acceptance-criteria block `:2126-2183`
- what: M3-P5's hazard-class paragraph names, as one of the specific ways a defect could pass every stated criterion, "a brief composed correctly whose rendered phase text silently drops a field the plan carries, so the agent reads a subset and believes it read the phase." The only criterion touching `brief compose`'s phase-rendering output is criterion 3: it checks that the output contains, IN ORDER, the mandated-reading list, the brief body, and "the named phase's rendered text," and that an absent `--phase-id` fails. Nothing checks that the rendered phase text is a COMPLETE rendering of the phase object ,  that `hazard-classes[]`, `acceptance[]`, `citations[]`, `files-to-touch[]`, and every other required phase field (schemas/plan.schema.json, M3-P1 step 2) all appear in the composed output. `grep`-searching the plan for any round-trip or completeness assertion on the rendered phase text (as opposed to the well-covered clause-id/frontmatter round-trips used in M3-P5 criterion 6b, M3-P6 criterion 7, and M3-P9 criterion 4) finds none.
- the defective implementation that still passes: `brief compose`'s phase-renderer serializes only `id`, `branch`, `intent`, and `steps[]` from the phase object (a subset that looks complete to a casual read) and silently omits `hazard-classes[]` and `acceptance[]`. Criterion 3 still passes: the output contains the mandated-reading list, the brief body, and SOME rendered phase text, in the right order; the unknown-`--phase-id` failure path is unaffected. An implementer brief composed this way would hand the dispatched agent a phase description with no acceptance criteria and no hazard classes ,  precisely undermining T-007's own fix (the hazard-classes field exists so "the second contract is derivable from the plan," and if the renderer drops it, the hazard-review contract that M3-P6/M3-P9/M3-P7 build has nothing to work from at the one place it is actually consumed by a dispatched agent) ,  while every other M3-P5 and M3-P9 machinery (the clause-map, the hazard-classes schema requirement, the two-review-contract duty) stays green because none of them re-checks what the COMPOSED brief actually contains versus what the plan phase declares.
- evidence: `grep -n -i 'rendered phase\|phase text\|brief compose' delivery/plan/kernel-plan-m3.md` (17 hits, all read); none names a completeness or round-trip property of the rendered phase text versus the phase object's own field set. `grep -n -i 'round-trip\|every field\|no field is dropped\|renders every\|content-complete\|drops a field' delivery/plan/kernel-plan-m3.md` returns only the charter's field-enumerability note (line 390, a different artifact) and the clause-id/heading round-trip criteria (lines 2160, 2241, 2455, 2473, 3470, 4013), none of which is about phase-to-rendered-text completeness.
- recommendation: Add a criterion (or extend criterion 3) asserting that `brief compose`'s rendered phase text is a complete projection of the phase object: every top-level required field of `schemas/plan.schema.json`'s phase definition (at minimum `hazard-classes[]` and `acceptance[]`, since those are what the hazard-review and clean-room contracts consume) appears, verbatim or by a documented transform, in the composed output; witnessed by removing one such field from the renderer and observing the composed output silently shrink while criterion 3 as currently worded stays green, then requiring the new criterion to catch it.

---

## M3R2B-004: The dispatch-contract text-specificity witness that M3-P5 builds for its three briefs is not repeated for M3-P6's two briefs, even though M3-P6's own hazard class names the identical failure shape

- severity: medium
- location: `delivery/plan/kernel-plan-m3.md:2050-2051` (M3-P6 hazard class) vs. acceptance criterion 9(c), `:2478-2480`; contrast M3-P5 criterion 6b, `:2159-2163`
- what: M3-P6's hazard-class paragraph names, verbatim, "a dispatch-contract clause that says 'report progress' instead of 'write the artifact', which is the T-008 shape restated as a sentiment" as a way this phase's own criteria could all pass while the delivered brief is worthless. One phase earlier, M3-P5 built exactly the guard this names: criterion 6b requires "a registered grep test asserts the `incremental-output` clause text names the artifact-within-the-first-minutes rule rather than a generic 'report as you go', which is the difference between the rule and a sentiment" for its three briefs (investigator, plan-writer, adversarial-plan-reviewer). M3-P6 carries the SAME two clauses (`incremental-output`, `beacon-is-not-a-claim`, per its own step 1c, "carried here for the implementer and the clean-room reviewer") onto two MORE brief files, and its own criterion 9(c) covering them reads only: "`incremental-output` and `beacon-is-not-a-claim` are present as body headings in both briefs and round-trip against frontmatter (criterion 7's shape)." No text-content check. The clause-map / round-trip mechanism this criterion relies on proves a heading exists and is wired to frontmatter; it does not, and by the plan's own repeated admission elsewhere ("the clause map proves presence, never content," M3-P6's own hazard-class sentence one line above), prove the text under the heading is the specific rule rather than a sentiment.
- the defective implementation that still passes: `roles/implementer.md`'s `incremental-output` section is written as "Report your progress as you work rather than only at the end." That is a heading present, correctly named, correctly round-tripped against frontmatter (criterion 7 passes), and is exactly the generic sentiment M3-P5's criterion 6b was built to reject for the OTHER three briefs ,  but M3-P6 criterion 9(c) does not check for it on `implementer.md` or `clean-room-reviewer.md`, so it passes cleanly. This is the fix-round contract's own named failure pattern ("the fix addressed the instance the reviewer named, when the defect was the mechanism") reproduced inside the plan itself: the mechanism is "a dispatch-contract clause can be present and round-tripped while still being a sentiment," M3-P5 fixed that mechanism for three specific files, and M3-P6, introducing the identical clause pair on two more files one phase later with the identical hazard named in its own prose, does not carry the fix over.
- evidence: `sed -n '2159,2163p'` and `sed -n '2478,2480p'` of the plan (quoted above); M3-P6's own hazard-class text at line 2050-2051 naming the exact failure; `grep -n "artifact-within-the-first-minutes\|report as you go" delivery/plan/kernel-plan-m3.md` matches only inside M3-P5's criterion 6b, never inside M3-P6's criteria block.
- recommendation: Extend M3-P6 criterion 9(c) to the same text-specificity witness M3-P5 criterion 6b already uses: assert `incremental-output`'s clause text in both `roles/implementer.md` and `roles/clean-room-reviewer.md` names the artifact-within-the-first-minutes rule (or is a documented shared `$ref`/include of the exact text M3-P5 ships, so there is only one copy to keep specific rather than four independently-driftable ones), witnessed by weakening it to a generic phrasing and observing the test fail, per section 2.3's own two-directional witness discipline that this plan applies everywhere else.

---

## M3R2B-005: The exit test's single falsification control stands in, by its own stated purpose, for every one of E1's roughly fifteen stages, in violation of the plan's own "one witness is not a class" rule

- severity: high
- location: `delivery/plan/kernel-plan-m3.md:3892-3906` (stage E0.5) and its acceptance witness at `:3654-3658` (M3-P10 criterion 6); contrast section 2.3 rule 6, `:594-604`
- what: Section 2.3 rule 6 (revision 2, cited as binding by `CLAUDE.md`) states: "Where a criterion below says a fixture witnesses a CLASS of invalid instance rather than one instance, at least TWO structurally different members of that class must be demonstrated red... One witness is not a class." Stage E0.5 introduces exactly one falsification control for the entire self-delivery exit run: "re-run the E1 sequence against a deliberately broken artifact set (one shipped schema keyword removed, so an instance the run validated should now be accepted where it was rejected) and record that the run FAILS, naming the stage at which it fails." The stated purpose of this single control is explicitly general: "A control that passes is an exit-test failure, because it means the stages are not measuring what they claim" (plural "stages," unqualified). But E1 spans roughly fifteen distinct assurance mechanisms of at least three different KINDS that the plan itself elsewhere insists are structurally different (section 2.3's own Kind A/Kind B split): Kind A schema validation (E1.1, E1.4), Kind B cross-document derived checks (`verdict-criteria-complete`, `verdict-hazard-classes-addressed`, `mode-gate-sets-resolve`, `dual-review-decorrelation` at E1.7), a real external-program-output gate (the M2 gate runner and red-witness harness at E1.6), and a prose/judgment mechanism (the two review CONTRACTS at E1.7, whose whole distinctness the plan spent M3-P6/M3-P7/M3-P9 building machinery for). A single "remove one schema keyword" control only exercises the FIRST kind. It says nothing about whether `check-dual-review.mjs` is actually wired into the live exit run's pass/fail path, whether the hazard-review contract's reviewer was actually given a different starting question rather than the criteria contract copy-pasted, or whether a Kind B check registered in `src/checks.ts` is actually invoked with `--context` during the real run rather than skipped.
- the defective implementation that still passes: the M3-P10 implementer wires E1.7's two review dispatches so that both use the `criteria` contract in practice (a copy-paste of the dispatch prompt, the exact T-007 failure this plan spent an entire phase-and-a-half preventing), and `check-dual-review.mjs`'s exit code is captured in the evidence bundle but not actually gating anything (a `|| true` on the invocation, or the evidence recorded from a run made after the fact rather than from the one that produced the merge). E0.5's control is executed exactly as specified ,  one shipped schema keyword removed, E1.1's charter validation duly fails, the failure stage is duly recorded ,  and it passes precisely because it was never designed to exercise the review-contract-distinctness mechanism at all. Every acceptance criterion in section 4 and M3-P10 criterion 6 ("the falsification control of stage E0.5 is present and FAILED at its declared stage") is satisfied. The exit test is certified as "a measurement rather than an absence of failure" while the one property T-007 exists for ,  that two DIFFERENT questions were actually asked ,  was never measured by anything in the falsification control, only asserted by the same run it is supposed to be checking.
- evidence: `sed -n '3892,3906p'` (E0.5's text, one control, one artifact class: "one shipped schema keyword removed"); `sed -n '3748,3823p'` (stage E1, showing the three-plus distinct mechanism kinds E0.5 is supposed to stand for); section 2.3 rule 6's exact text at lines 594-604, which this plan cites as binding on every OTHER plural/class claim in the document but does not apply to itself here.
- recommendation: Either (a) add a second, structurally different falsification control alongside E0.5's schema-keyword removal ,  e.g., deliberately dispatch both review contracts with the same `--review-contract criteria` value and require the run to fail at E1.7 naming the missing distinctness, which directly exercises the Kind B / dual-review / two-contract mechanism the schema-keyword control cannot reach ,  per section 2.3 rule 6's own two-member-minimum; or (b) narrow section 4.5's proving claim so it no longer reads as covering "the stages" (plural, unqualified) and instead states explicitly which stages the one control does and does not measure, so the exit test's self-certification is not itself an instance of the vacuous-pass shape section 2.3 exists to prevent.

---

## Verdict

**CHANGES REQUIRED.**

Counts: 3 high (M3R2B-001, M3R2B-002, M3R2B-005), 2 medium (M3R2B-003,
M3R2B-004), 0 low.

None of these findings is an architectural objection. The plan's general
methodology (Kind A/Kind B separation, the DANGEROUS-instance witness
discipline, the hazard-classes field, the two-review-contract mechanism, the
per-phase re-grounding against T-006/T-007/T-008) is sound and, on the
evidence of M3-P1, M3-P3, and M3-P4, is applied with real rigor most of the
time. What this pass found is exactly the shape the task brief asked for: two
places where the plan's OWN diagnostic prose (a hazard class, or a named
tuition entry) correctly identifies a mechanism and then the acceptance
criteria simply do not follow it there (M3R2B-002, M3R2B-003); one place
where a fix built for one set of files is not carried to a sibling set
introduced one phase later under the identical hazard (M3R2B-004); one place
where the plan's newest, most relevant tuition entry (T-009, which predates
this revision by less than a day and which the task brief specifically
flagged as unabsorbed) is cited only for an ID-numbering fact and never for
its mechanism (M3R2B-001); and one place where the plan's own single
strongest anti-vacuity device (the falsification control) is itself a
single witness standing in for a claim about a plural, heterogeneous set of
mechanisms, which is the exact "one witness is not a class" failure the plan
elsewhere polices in every other artifact it ships (M3R2B-005). Each of the
five is fixable with a criterion addition or a phase-text edit, not a
redesign, and none of them touches the plan's phase boundaries, sequencing,
or requirement coverage (which the companion completeness review is covering).

## What I did NOT cover

- **M3-P5's and M3-P6's clause-by-clause content beyond the specific items
  named above.** Both briefs carry a large number of individually-cited
  clauses (R-007, R-031, R-034, R-037a, R-038, R-039, R-040, R-074, R-081b,
  R-082a, R-087, and more); I read all of both phase sections in full but did
  not attempt to construct a defective-implementation case against every
  individual clause's criterion, only against the ones the hazard-class prose
  itself flagged or that a cross-phase contrast surfaced (M3R2B-003,
  M3R2B-004). A clause-by-clause adversarial pass of M3-P5/M3-P6 specifically
  was out of scope for the time available.
- **M3-P8's tuition/mechanism-index machinery beyond the read I did.** I read
  the full phase text and its acceptance criteria and found its hazard-class
  items well translated into criteria (4b, 4c, 4d specifically answer three of
  the seven hazard items named), but I did not independently verify that the
  twelve `MECHANISMS.md` rows and the eight tuition entries actually cross-map
  the way step 4 claims, since `MECHANISMS.md` and the eight tuition entry
  files do not exist yet (M3 has not been implemented) ,  this is a
  read-only-plan review, not an executed one, same limit round 1 recorded.
- **Sections 5, 6, 7 (decisions taken, open questions, owner decisions) beyond
  spot checks.** I read section 8 (risks) in full and it is honest and
  well-argued; I did not read every one of the roughly thirty D-M3-nn decision
  entries in section 5 line by line looking for internal contradictions, only
  the ones cited by the phases I focused on (D-M3-27, D-M3-28, D-M3-30,
  D-M3-31, D-M3-32, D-M3-16, D-M3-29). A dedicated pass over all of section 5
  for internal consistency was not performed here.
- **Appendix A (requirements coverage) and Appendix B/C.** These are exactly
  the completeness-arithmetic domain the task brief assigned to the other
  reviewer; I did not re-derive or spot-check the 74-row coverage table.
- **Whether DR-0008, DR-0013, DR-0014, DR-0015, DR-0016 are themselves sound
  decisions.** I read them only as the plan quotes and cites them, to check
  whether the plan's own text is internally consistent with what it claims
  those records say; I did not fetch or independently re-evaluate the
  decision records themselves (`delivery/decisions/DR-00nn-*.md`) against the
  situations that produced them.
- **No code was run.** Like round 1, no schemas, validators, checklists, or
  scripts exist yet for M3 (M3 has not been implemented), so every finding
  above is established by reading the plan's text against itself and against
  the tuition corpus, not by executing a red/green demonstration. Where a
  finding claims "no criterion covers X," that claim rests on an exhaustive
  `grep` over the plan file text (commands and output shown per finding), not
  on running a validator that does not yet exist.
- **M3-P9's `AGENTS.md` clause text beyond the T-008/T-009 lens.** I read the
  full phase in detail for the T-008 dispatch contract and the T-009 gap
  (M3R2B-001), but did not adversarially check every one of its eleven R-series
  policy rows or the DR-0016 escalation-threshold clause text for the same
  "present but generic" failure mode M3R2B-004 found in M3-P6; a full pass
  there, symmetric to M3R2B-004, might find more instances of the same shape
  and was not completed given time.

