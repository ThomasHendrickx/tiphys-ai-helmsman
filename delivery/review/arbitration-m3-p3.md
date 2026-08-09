# Arbitration: M3-P3 dual clean-room review

- date: 2026-08-09
- phase: M3-P3 (assurance modes and role-to-model configuration)
- head reviewed: `7b3afbf`, PR #54
- reports: `clean-room-m3-p3-criteria.md` (Opus family, 912 lines),
  `clean-room-m3-p3-hazard.md` (Sonnet family, 529 lines)
- verdicts: criteria CHANGES REQUIRED (2 high, 4 low); hazard CHANGES REQUIRED
  (2 high, 1 medium, 1 low)
- combined: 10 findings, 4 high, 1 medium, 5 low, with one overlapping pair

## Disagreements to arbitrate: NONE

No conflict on any finding. The reports overlap on exactly one, the NUL bytes in
`src/checks.ts`, which the criteria lens graded high and the hazard lens medium.
**Resolved at high**, for the reason the criteria lens gives and the hazard lens
did not reach: the file is the one every later M3 phase extends, so a derivation
grep over `src/` silently returns a false empty from it, which is the shape this
project has paid for three times.

## What both reviewers CONFIRMED, recorded because it is load-bearing

M3-P3 encodes who may merge and is the one artifact in which a downgrade can be
made invisible. The confirmations below are therefore worth as much as the
findings.

- **Every acceptance criterion is MET.** All twelve walked BY EXECUTION, with the
  reviewer building its own fixtures rather than reusing the phase's, and
  re-taking every witness. Criterion 4c's revision-2 `on-exceeded` half was
  walked in all three of its members.
- **16 of 16 behavior registrations are the exact `test("...")` literal**, and no
  test in the file is unregistered. M3-P1 had 35 of 46 fail this, so the phase
  fixed the mechanism rather than the instance it was told about.
- **9 of 9 witness members redden the NAMED test**, verified with
  `--test-name-pattern` selecting exactly one test. M3-P1's review found eight
  members that landed where no named test executed.
- **22 applied mutations, 22 caught, zero survivors** on the criteria lens,
  including five where a check stays registered and silently stops covering half
  its rule. The hazard lens independently ran 8 mutations with 7 caught; its one
  survivor is finding B-002 below.
- **All four declared judgment calls are justified**, including the one that
  looks most like a deviation: `full`'s `merge-authority:
  delegated-under-conditions` rather than blueprint section 8's `owner`. A mode
  carrying DR-0012's escalation bounds with `owner` authority is incoherent, and
  criteria 4b and 4c force the bounds.
- **Both weaknesses the plan concedes are reported honestly rather than
  overstated.** Criterion 4c: ten grep hits, every one a decode or a print,
  nothing counts a fix round. Criterion 5's residue is stated in four independent
  places.

## Mechanism 1: uniqueness asserted by a predicate that does not test identity

**Findings: B-002 (high), B-004 (low, latent).**

`uniqueItems` is deep-object equality, not `id` equality. Two `modes[]` entries
may therefore share an `id` and differ anywhere else, and the schema is content.
Reproduced by the orchestrator, with the crippled entry placed FIRST:

```
$ node bin/tiphys.ts mode show --mode full     # two entries with id 'full'
mode: full
pipeline:
  intake / verification-pass / plan / adversarial-plan-review / implement /
  fix-round / fix-round-verification / merge-on-green / deploy-verify /
  migration-verify / final-report          <- 11 stages, clean-room-review GONE
skips:
  (none)
mode show exit=0
```

Eleven stages, `clean-room-review` absent, `skips` empty, exit 0, no warning.
**That is the invisible downgrade the phase exists to prevent, on the path an
operator or a brief actually uses.**

One correction to the hazard report, in the phase's favour and it does not save
the finding. `validate` DOES reject the same document:

```
INVALID #/modes assurance-modes.yaml declares mode ids [direct-pr, full, full,
local-only] and the delivery-mode enum in schemas/charter.schema.json is
[direct-pr, full, local-only]; the two must be equal
(check: charter-mode-enum-matches-modes)
```

But that is an ACCIDENT of the enum comparison being multiplicity-sensitive, not
a uniqueness check, and it is exactly the kind of incidental coverage that
disappears the moment the comparison is rewritten to compare sets. `mode show`
never calls it. `role-model-config.yaml` has no equivalent accident at all, which
is why B-004 is the same defect with no incidental guard.

**This mechanism has occurred before in this milestone.** M3-P1 finding B-003:
duplicate `acceptance[].id` values let `hazard-classes[].addressed-by` resolve to
an unrelated decoy. Same predicate, same milestone, different document. A
recurrence is a signal that the fix was applied to the instance.

**Ruling: ACCEPTED, high.** Add a derived check that asserts id uniqueness by id,
for BOTH documents, and red-witness it with two structurally different members
(same id with differing bodies; same id with identical bodies, which `uniqueItems`
does catch, so the witness must not rely on that arm alone). Then answer, in the
work history, whether any OTHER `uniqueItems` in this repository is standing in
for identity uniqueness, and publish the enumerating command.

## Mechanism 2: a reader that does not validate what it reads

**Finding: B-002's other half, ruled separately because the fix differs.**

`mode show` loads `assurance-modes.yaml` and serves it without invoking
`validate` or any registered check. Every guard this phase built is therefore
bypassed on the command the phase shipped for humans and briefs to use. The
uniqueness fix above does not close this by itself: it makes ONE more document
state detectable, on a path that still does not look.

**Ruling: ACCEPTED, high.** `mode show` must run the same validation before
serving, and refuse rather than print on a document that fails. Red-witness with
a document that is invalid for a reason UNRELATED to duplicate ids, so the
witness tests the validation call and not the new uniqueness check.

## Mechanism 3: a constraint verified by cardinality instead of content

**Finding: B-003 (high).**

DR-0012's six merge-authority conditions are checked for COUNT only, and only for
the shipped file, and only by a test assertion (`length === 6`), never by the
schema or a derived check. The hazard reviewer replaced all six with fabricated
one-liners: `validate --context .` exits 0 and the registered test still passes.

The artifact that says who may merge can therefore be rewritten to say something
else entirely, and every guard stays green. This is the same family as mechanism
1, one level up: the check tests a PROXY for the property rather than the
property.

**Ruling: ACCEPTED, high.** Bind the conditions to their source. The
orchestrator's recommendation, and the implementer may argue for a different one
WITH evidence: `granted-by: DR-0012` already names the record, so the check
should resolve that reference and compare content against it rather than trusting
a count. If a full content comparison is not derivable, say precisely why and
what is checked instead, in the work history, rather than leaving a count.

## Mechanism 4: control bytes in authored source, and the guard that cannot see them

**Findings: A-001 (high), B-001 (medium), A-002 (high). Resolved as one
mechanism split across two owners.**

`src/checks.ts:586` carries two literal NUL bytes as a `join()` separator. The
criteria lens adds the detail that makes it high rather than cosmetic: the NUL
sits past git's sniff window, so `git diff --stat | grep -c Bin` is 0 and the
diff renders as `join("")`, which is WORSE than an unreviewable diff because it
looks correct.

Both reviewers independently found that CLAUDE.md's prescribed control-character
grep is blind to NUL, and the criteria lens's byte-wise scan of all 399 tracked
files found the second member already on `main`:
`delivery/review/arbitration-m3-p1.md`.

**Ruling: SPLIT.**

- The guard is the ORCHESTRATOR's and is already fixed, in PR #55: both checks now
  prescribe `grep -raP` with a measured four-fixture table, the arbitration
  document is de-NULed, and `delivery/tuition/T-010` records the mechanism
  (a tool that changes behaviour on the property being tested cannot test for it
  in its default mode). The reviewers reached the same conclusion independently
  and by a different route, which is the strongest confirmation available.
- `src/checks.ts` is the PHASE's, and belongs to this fix round. Replace the raw
  bytes with an escape. Do NOT weaken the separator to something that changes the
  join's semantics without saying so.

## Mechanism 5: a criterion written against a convention the same phase retires

**Finding: A-003 (low). This is the referred discrepancy, and it is now RULED.**

The implementer reported that criterion 1's literal command omits `--context` and
exits 1, while the hazard-to-criterion map requires the check to be
context-requiring so it cannot pass by not being run. **The criteria reviewer
ruled THE PLAN IS WRONG**, and gave the reason the implementer could not: this
phase ships the repository's FIRST TWO `requiresContext: true` checks, so the
convention every earlier criterion 1 was written against stopped holding at the
moment step 2 added one.

**Ruling: ACCEPTED. The implementer's reading and implementation are both
correct.** The fix is a PLAN AMENDMENT, not a code change, and it is the
orchestrator's to make. The implementer must not touch it.

## Remaining findings, accepted as written

- **A-004 (low).** The `contains` diagnostic names the field but not the missing
  stage. Name it.
- **A-005 (low).** Criterion 4's green arm needs four coordinated edits, not one.
  A plan-text accuracy item, recorded with the amendment above.
- **A-006 (low).** Two capture-fidelity slips in the work history.

## Assignment

| Owner | Findings |
|---|---|
| the M3-P3 implementer, fix round 1 | mechanisms 1, 2, 3; the `src/checks.ts` half of mechanism 4; A-004; A-006 |
| the orchestrator | the guard half of mechanism 4 (done, PR #55); the plan amendment for mechanism 5 and A-005 |

## Stopping rule

DR-0012's limit is more than two fix rounds after the first dual review, or a
high recurring in the same component across rounds. **This is round one. The
limit has NOT fired.**

One thing to watch in round two, stated now so it is not discovered later:
mechanism 1 is a RECURRENCE of M3-P1's B-003 at the milestone level. If a
uniqueness-by-wrong-predicate finding appears again in round two, the recurrence
clause fires and DR-0016 applies: a fresh implementer plus a third review
contract goes out immediately, and the owner is notified asynchronously rather
than the phase waiting.

## What this round did NOT cover

- Neither reviewer observed a CI run, including the `main` push arm. Under T-009
  that arm has no witness until the post-merge run is watched to completion.
- Neither ran the phase against a real consuming project; both worked in the
  kernel repository. M3 never executes `direct-pr` or `local-only`, so those two
  modes are witnessed by validation and by `mode show`, never by execution, which
  the plan's honest-scope note already states.
- The criteria lens's 22 mutations and the hazard lens's 8 are samples, not
  exhaustive passes.
- Neither audited whether the mode-id enum triplicated across
  `assurance-modes.schema.json`, `gate-registry.schema.json` and
  `charter.schema.json` can drift on the leg that has no cross-check. The hazard
  lens recorded it as an out-of-scope observation because
  `gate-registry.schema.json` is not on this phase's files-to-touch list. It
  stays open and belongs with the orchestrator.
