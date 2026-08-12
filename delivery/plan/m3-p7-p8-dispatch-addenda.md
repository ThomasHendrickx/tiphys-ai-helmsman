# M3-P7 and M3-P8: the orchestrator's dispatch addenda, written before dispatch

- date: 2026-08-12
- author: orchestrator
- status: READY TO USE the moment M3-P6 merges. Nothing here depends on the
  merge except the two facts marked RE-DERIVE.
- purpose: the phase text comes from the plan, and after M3-P6 merges it can
  also be assembled by `tiphys brief compose --role implementer`. **This file is
  the part neither of those produces**: what the orchestrator knows and the plan
  does not say. Written now so dispatch costs one turn rather than a composition
  session on the critical path.

**A caution on the composer, recorded so it is not discovered at dispatch.**
`tiphys brief compose` needs `roles/implementer.md`, which is an M3-P6
deliverable and absent from `main` (measured: the command exits nonzero naming
the missing path). So it becomes usable only after that merge, and it should be
used as a CHECK on the M3-P6 deliverable rather than as the authority for a
dispatch. Nothing runs on Tiphys before M4, which is a settled owner decision.

## Both briefs carry all of this, verbatim

### 1. The concurrency tripwire (DR-0011, and it is the whole permission)

> Your declaration shares `src/cli.ts`, `src/validate.ts`, `src/checks.ts`,
> `src/commands/validate.ts` and `package.json` with a phase being implemented
> AT THE SAME TIME as yours. Your edits to all five are expected to be APPENDS
> to existing lists, maps and tables. If you find you need to RESTRUCTURE any of
> them, reorder an array whose order turns out to matter, rename a key, change a
> table's shape, or move an existing entry, **STOP and tell the orchestrator
> before doing it.** Do not resolve it yourself and do not work around it. The
> pair is parallel only for as long as this holds, and you discovering otherwise
> is the expected way this is found, not a failure.

The reasoning is at delivery/plan/m3-p7-p8-concurrency-pre-pass.md:1, including
the one site the pre-pass could NOT determine (`src/validate.ts`, undetermined
for both phases) and the reason the plan's condition cannot be fully discharged
in advance.

### 2. The corrected beacon rule, which supersedes older briefs

> Create your work history in the first minutes and APPEND after each command
> whose output you will cite, BEFORE running the next one. COMMIT LOCALLY on
> each append. PUSH only when a cancelled CI run would cost nothing: before you
> have triggered a run, or after an in-flight one has already given you its
> answer. Never push while a run you intend to rely on is in flight.

Committing locally satisfies durability; pushing is a separate act that CANCELS
in-flight CI. An earlier brief fused them, an agent obeyed both faithfully, and
six pushes cancelled five runs leaving the critical-path branch with no
completed evidence for two hours. Full account at
delivery/tuition/T-017-the-beacon-instruction-asks-for-a-habit.md:114.

### 3. Do not ask them to record their own final CI conclusion

That instruction is self-invalidating: writing the green for head H produces
H+1, a head with no completed run. Ask instead for the green on the CODE head
plus a statement that later commits are prose-only and verifiable with
`git diff --name-only`. Observing the final head is the orchestrator's job under
T-009. Recorded in the phase-delivery skill.

### 4. Standing environment warnings that have bitten someone

Node: use the scratch v26.6.0 toolchain and check `node --version` IN THE SHELL
THAT RUNS THE COMMAND; a stripped environment silently resolves to v20, which
has no TypeScript type stripping. A fresh worktree has NO `node_modules`, so run
`npm ci` first or every probe fails identically for the wrong reason and
measures nothing. Quote any suite result with all three axes and the SKIPPED
count: toolchain, build state, invocation. Transliterate Node reporter glyphs
and DECLARE codepoints, replacements and counts. Run
`node scripts/check-authored-bytes.mjs` with the tree STAGED, because it exits 2
WITHOUT CHECKING when the working tree differs from the index and that reads
exactly like a pass.

Citations: a citation is `path.ext:LINE` and ONLY outside backticks. A new
`delivery/` document usually needs at least one real one. The gate resolves that
a line EXISTS and cannot check that it says what you claim, so open the file.
Repository-root files such as `gate-registry.yaml` match no declared root and
cannot be cited by line at all; quote them in backticks.

### 5. Mutate IN PLACE, never in a copy

Copying a script out of its tree breaks its relative imports, so both arms of
the probe fail identically for a reason unrelated to the mutation. That happened
twice in one session here and only the control arm exposed it. Save the original
bytes, mutate in place, restore from the saved copy. Never `git checkout --` in
a tree holding uncommitted work; there is no safe narrow form.

## M3-P7 only

- branch `claude/m3-p7-review-checklists`. Only the phase's own implementation
  branch may match `^claude/m[0-9]+-p[0-9]+-`; the scope auditor derives a phase
  id from the name and any other branch matching it is an automatic red gate.
- **Its grounding consumes M3-P6 directly**: both review-side briefs exist and
  reference a verdict type. That is why P7 could not run beside P6, whatever the
  file overlap said, and it is the error this orchestrator made once already.
- The gate registry's two `verified-by: clean-room-checklist` entries name probe
  ids this phase must supply, and **the clause map fails if they do not
  resolve.** That is a hard, mechanical acceptance condition.
- RE-DERIVE after the merge: delivery/plan/m3-p7-registry-probe.md:1 establishes
  by execution that no test over the clause map or `test/behaviors.json`
  over-asserts by count, measured at `bb8f656`. M3-P6 CHANGES the clause map, so
  that result is stale on the merged head and its own last section names the
  cheap re-check: the same two mutations.
- Carry T-006's finding as a requirement, not a suggestion: a probe hunting
  impossibility and coverage claims specifically, because reviewers already do
  it by instinct three times out of three and instinct does not survive a
  reviewer change.

## M3-P8 only

- branch `claude/m3-p8-tuition-flow`.
- **It is blocked on M3-P6, NOT on M3-P7.** Plan revision 3 corrected this at
  delivery/plan/kernel-plan-m3.md:1130 because M3-P8's grounding names no M3-P7
  artifact; the old value was an ordering habit. It still MERGES after P7,
  because merge order is dependency order.
- Its grounding names `tuition/README.md` from M1-P1, M3-P6's seed
  `mechanism-index.yaml`, M3-P1's charter `retention` field, and the M1-P2
  doctor.
- It replaces M3-P6's stub index, so it must read what M3-P6 actually shipped
  rather than what the plan says M3-P6 would ship.
- RE-DERIVE after the merge: nothing in the registry probe covers M3-P8's
  requirement ids or artifacts, and that document says so. If M3-P8 extends the
  clause map, the same two mutations apply to it and have not been run.

## What this file does NOT do

- **It is not a brief.** It is the orchestrator's half. The phase text,
  acceptance criteria and hazard classes come from
  delivery/plan/kernel-plan-m3.md:3571 for M3-P7 and
  delivery/plan/kernel-plan-m3.md:3965 for M3-P8, and the implementer reads them
  there rather than from a paraphrase here.
- **It does not settle whether both are dispatched at once.** The pre-pass is a
  VETO and not a permit; it forbids nothing here, and the grounding is what
  authorises. Both groundings are satisfied by M3-P6 merging, so both may start,
  and the tripwire is what makes the pair safe rather than the pre-pass.
- **It has not been reviewed.** No second reader has checked that the five
  shared files are the right five, and the recount that produced them is the
  orchestrator's own.
