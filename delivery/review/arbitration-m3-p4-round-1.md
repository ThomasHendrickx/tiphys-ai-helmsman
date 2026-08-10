# Arbitration: M3-P4 round 1, dual clean-room review at `a3ea489`

- date: 2026-08-10
- arbiter: the orchestrator
- head reviewed: `a3ea489`, confirmed unmoved by BOTH reviewers at the end of
  their runs
- outcome: **FIX ROUND. Two HIGH findings block merge under DR-0012 condition 2.
  No merge, no owner escalation.**

## The two contracts, and that they did not overlap

| contract | verdict | findings |
|---|---|---|
| expressible-lie | CHANGES REQUIRED | 2 high, 2 medium, 3 low, 2 informational |
| criteria execution | CHANGES REQUIRED | 1 medium, 2 low, 3 informational, NO high |

They agree on the verdict and share almost no finding. That is the pairing
working: T-007 asks for two different CONTRACTS rather than two models on one
contract, and a pair that had returned the same list twice would have told us
only that one of them was redundant.

CI is green on this exact head, so DR-0012 condition 4 is met and is not what
blocks: run 31387495323, `pull_request`, all steps ok, step 8 (the PR bundle)
success. Condition 5 is met, `scope` green at 18 units. **Condition 2 is what
fails, and it fails on substance.**

## CR-001, HIGH, ACCEPTED. The mechanism is not the instance.

`report-parity-arithmetic` is registered for type `report` only and reads the
key `gate-results`, so it never runs on a work history's `gate-evidence[]`. A
work history claiming 9999 discovered and 1 passed and green exits 0, where the
identical counts in a report exit 1.

**The finding is that one check misses one type. The MECHANISM is this: a
derived check is registered PER TYPE and reads a TYPE-SPECIFIC KEY, while the
`$defs` it guards are SHARED ACROSS TYPES. Sharing a definition therefore does
NOT share its check, and nothing in the system says so.**

This is the fourth occurrence of the one-directional shape in M3, and the first
where the phase's own instrument asserts the opposite: the converse table at
`delivery/work-history/m3-p4.md` line 551 at `a3ea489` calls the relation CLOSED and the shared
definition's comment at `schemas/report.schema.json` line 411 at `a3ea489` says the check applies.
An artifact built to catch this class was itself the thing that hid it.

**What the round owes, and a fix to the single instance is NOT acceptable:**
enumerate every `$def` shared between two or more of the three schemas, and for
each, every derived check that guards it, and state for each pair whether the
check actually runs on every type that uses the definition. Publish the
enumerating command and its FULL output, not a summary. Where the answer is no,
either close it or record it as an open hole in the schema comment. The
correctness of a comment that says a check applies is part of this finding.

## CR-002, HIGH, ACCEPTED. Same treatment.

`kind: open-question` accepts any statement with no settlement, so the same
impossibility filed as `open-question` exits 0 while filed as `impossibility` it
requires a construction. The universal-quantifier pattern is applied to
`finding.analysis` and `evidence[].note` and NOT to `claim.statement`.

**Mechanism: an enum branch that requires NOTHING makes every sibling branch
that requires something OPTIONAL, because the author chooses the branch.** The
guard is only as strong as the weakest kind, and `open-question` was designed to
be the weak one on purpose, as the honest restatement. Its honesty is exactly
what makes it the escape.

The plan wanted `open-question` to be first-class so that "I did not find a way
to force this arm" could be filed without ceremony. That intent is right and is
NOT to be reversed. The round must find a form that keeps the honest use cheap
while denying the dishonest one. The reviewer states the remedy is inside the
declared authoring vocabulary; the round must confirm that by construction.

**The round owes the converse derivation here too:** for every enum in the three
schemas whose branches carry different obligations, state which branch is
weakest and whether choosing it escapes the others.

## The two mediums, both accepted

- **CR-003.** `result: green` with `wrapper-exit-code: 0` and `failed: 400`
  validates: parity balances and the record contradicts itself. R-086's shape in
  the direction the converse table never asked.
  **Checked against the phase's DECLARED residue before accepting, because the
  two are easy to confuse and one of them would make this finding invalid.** The
  shared definition's comment declares open the case where a NOT-green result
  carries `wrapper-exit-code: 0`, with the reason that a wrapper can exit 0 while
  the author judges the run not green. CR-003 is a DIFFERENT shape: a GREEN
  result carrying 400 failures. Nothing declares that one open, so the finding
  stands.
- **CR-005.** ALL-CAPS universals bypass the quantifier pattern entirely.
  `NEVER`, `ALWAYS`, `EVERY`, `ALL CASES` pass; lowercase `never` is correctly
  rejected as a control. **83 such tokens across 39 tracked files, including the
  schemas under review.** This repository's own house style uses capitals for
  emphasis constantly, so the hole is not hypothetical here: it is the shape our
  own documents are written in.

## CR-1520, MEDIUM, ACCEPTED AS A DOCUMENT DEFECT AND NOT A CODE DEFECT

The witness table has a column headed "keyword removed (then GREEN)" and five
rows name a keyword no test removes. The reviewer took all five arms itself,
md5-verified nothing was mutated, and all five hold.

**So no guard is missing and no criterion is unmet by its letter. The TABLE
overstates.** That distinction was only available by execution, and a reviewer
that had read the table and believed it would have filed a HIGH that did not
exist. Recorded here because the cheap move was available and was not taken.

Remediation is a document edit. It is not a licence to soften: the table must
say what each arm actually removes.

## The lows, and one that lands on the orchestrator

- **CR-004**, residue 3 names only the SUMMARY case; a truncated capture and a
  capture of the WRONG command also validate and are named nowhere. Fix the
  residue text.
- **CR-006**, the comment and residue 7 both say `in every case` passes the
  pattern; measured, it is caught by `[Ee]very`. Fix the text.
- **CR-007**, `verdict: APPROVE` over two unresolved high findings sharing one
  id validates.
- **CR-1521 and CR-1522**, born-stale citations in the subtler form: the line
  exists and does not mean the cited thing.

**CR-1522 lands on me and is corrected here rather than quietly.** The finding
says `scripts/m2-exit-test.sh:879` is cited for "its own comment" and proposes
`:880`. Measured at this head, BOTH are wrong: 879 is `local dir=...`, 880 is
`rm -rf "${dir}"`, and the comment begins at **881**. The finding is right that
the citation does not resolve to what it claims; its own replacement is off by
one.

My handback-verification note reproduced the implementer's citation and quoted
that comment as though it sat at 879. I verified the CLAIM and did not verify
the LINE. That is the third citation I have got wrong today, in the same session
in which I wrote the standing reminder about it, and it was caught by a reviewer
rather than by me. The reminder is right and it did not save me; only running
the check does.

## The two informationals worth keeping

- **CR-1523** confirms warning 12's third axis a second time, independently:
  criterion 6's literal command is a bare `node --test`, which measures 537
  tests, 535 pass, **2 skipped**, exit 0, the two extra named as the sandbox
  `greet` fixture. The work history quotes only `npm test`. Both are true of
  their own invocation.
- **CR-1525** says plan criterion 2c(a)(b)(c) are ONE schema shape rather than
  three, and that the real structural difference comes from the implementer's
  own within-kind members. That is a PLAN observation, not a phase defect, and
  it is routed to the plan-text queue rather than to this round.

## The two decisions the implementer handed back, DECIDED

DR-0016: where I have a recommendation I would defend, there is nothing to ask.
Both of these have one.

**1. The `todo` bucket gap: TAKE IT, in this fix round.** The implementer did
not only hand this back in conversation: the shared definition's `$comment`
already records it in the shipped file, naming the sixth bucket, stating that a
run reporting `todo > 0` cannot be recorded without breaking parity, and calling
it "a real gap in the plan's field list" rather than papering over it by
inventing a field the plan does not name. That is the behaviour this process
wants and it is why the decision is cheap to make. The M2-P3 wrapper
reports six buckets with the identity `pass + fail + skipped + todo +
did-not-run == reported`; the plan named five gate-result counts. A run with
`todo > 0` therefore CANNOT be recorded without breaking parity. That is a
contract that refuses a legitimate run, which is worse than a missing feature,
and `schemas/report.schema.json` is already on the phase's declaration so the
edit is in scope. The plan text is amended to six counts by this arbitration and
the amendment is recorded in the plan-text queue.

**2. `no-findings-statement` when `findings` is empty: TAKE IT TOO, as a third
derived check.** I verified the implementer's premise independently before
deciding: `AUTHORING_VOCABULARY` is sixteen keywords and `maxItems` is ABSENT,
so no permitted schema keyword can express "this array is empty". The escalation
was correct rather than an excuse.

D-M3-22 makes an unlisted derived-check row a plan defect to escalate. I am
taking it rather than deferring because the hole is in the phase's own core
purpose: a report claiming zero findings without saying why is hazard 1 wearing
a different hat, and the phase exists to close hazard 1. Section 2.3's table is
amended to three rows for this phase.

Both amendments are PLAN CHANGES made by the orchestrator with reasoning, per
DR-0016, and neither is an irreversible or high-impact choice of the kind
DR-0016 reserves for the owner.

## Not escalated to the owner, and why

DR-0012's stop rule bites after TWO fix rounds following the first dual review.
This is round 1. Nothing here is a tie between comparable options, and A-7 is
untouched. Under DR-0023 the stop rule would notify rather than wait in any
case.

## What this arbitration did NOT settle

- Whether CR-002's remedy is truly inside the declared vocabulary. The reviewer
  asserts it; the round must prove it by construction, and if it cannot, that is
  a fourth item for the plan-text queue rather than a licence to widen the
  vocabulary silently.
- The COMPANION_TABLE design, which the implementer flagged as the phase's
  largest design judgement. Contract B did not audit it and contract A's
  execution did not target it. **It is unreviewed by both contracts** and that is
  stated here rather than left for someone to assume otherwise.
- Nine of the eleven registry gates, named in contract A's own non-coverage
  section, and both CI arms from its perspective.
- Whether the 83 ALL-CAPS tokens across 39 tracked files include any that would
  become a false rejection once CR-005 is closed. The round must check before it
  widens the pattern.
