# M3-P6 arbitration: two contracts, one convergence, one medium

- date: 2026-08-12
- arbitrator: orchestrator
- head reviewed: `origin/claude/m3-p6-delivery-role-briefs` at `16bab6f`, the
  same head by both reviewers, which is DR-0012 condition 1's requirement.
- reviews: delivery/review/clean-room-m3-p6-criteria.md:1 (contract A, the
  acceptance-criteria walk, 970 lines) and
  delivery/review/clean-room-m3-p6-self-comparison.md:1 (contract B, the
  self-comparing-check audit, 482 lines), on DIFFERENT MODEL FAMILIES.
- DR-0012 condition 6 requires the orchestrator to arbitrate with evidence and
  record it. This is that record.

## The verdicts

**Contract A: APPROVE, three low findings, none blocking.** Every criterion
EXECUTED rather than read, both directions forced where the criterion asks for
both. All of 1 through 11 met.

**Contract B: no self-comparing check found**, which is the phase's own named
hazard and it is genuinely absent. `scripts/check-brief-drift.mjs` derives from
the registry and never from the block, proven by two registry-side defangs and
eight brief-side defangs, plus a removed begin marker producing a gate `error`
at exit 21 rather than a silent "no drift". One medium, two low.

**They do not disagree on any mechanical fact.** There is nothing to arbitrate
in the adversarial sense, which is worth saying plainly rather than manufacturing
a dispute to look rigorous.

## The convergence, which is the most valuable output of the pair

**Contract A's finding 3 and contract B's F-B2 are the SAME DEFECT, reached from
two directions, and neither contract asked for it.**

- A switched the brief's declared gate-list mode to `local-only` and got a GREEN
  drift check over a brief advertising 5 gates instead of 15.
- B observed that `units` at src/roles.ts:644 is
  `registry.preflight.length + selected.length`, so with the marker pointed at a
  mode no gate declares, the gate reports `green (3 rows compared)` over an EMPTY
  gate table, and M2-C-2's vacuity guard can never fire because `preflight` is
  mode-independent and always 3.

The orchestrator confirmed B's half independently: `src/roles.ts:644` reads
exactly as quoted, and the same arithmetic explains the gate's "18 rows" as 15
registry gates plus 3 preflight steps.

Both reviewers rated it LOW and both noted it IS caught today, incidentally,
because the tests that exercise the check inject `modes: [full]`. **Convergence
is evidence that a defect is real and reachable; it is not evidence that its
impact is larger.** So this is not being inflated to medium. It is, however, the
low most worth fixing, because a check whose subject can be silently narrowed is
the same family the phase exists to close.

T-007's claim is that decorrelating the QUESTION, not merely the reviewer,
catches what a single contract misses. Two contracts converging on a defect
neither was pointed at is the strongest instance of that this project has
recorded.

## The medium, and it is confirmed rather than relayed

**F-B1: the exit-test harness asserts over the expectation, never over the
rows.** Contract B extracted the assertion program and ran it against two
synthetic bundles differing only in a red `brief-drift` row. BOTH EXITED 0.

The orchestrator confirmed it independently before acting:

- 12 gates in `gates.manifest.json`; exactly one, `brief-drift`, is absent from
  `PR_EXPECT_JSON`, derived by differencing the id sets in BOTH directions
  (`manifest not in table: ["brief-drift"]`, `table not in manifest: []`).
- The expectation loop is `for (const spec of expect.gates ?? [])`.
- The only global loops over rows are the not-applicable justification loop,
  which `continue`s on anything not `not-applicable`, plus zero-error and
  zero-vacuous. The red count is a summary total nothing asserts on.

**Two readings are both true, and the finding stands under either.** The
MECHANISM is pre-existing; the INSTANCE arrives with this phase, and
`scripts/m2-exit-test.sh` is on no M3 declaration, so the implementer could not
have fixed it and correctly named it in the shipped source instead.

**Protection is not lost today.** A red from this gate fails the job through the
direct workflow step, which carries no `if:` and was observed to run and pass as
step 8 of the pull-request arm. The latent hazard is someone later deleting that
step believing the gate covers it, which the shipped header already warns
against.

### Why it is not being downgraded

DR-0012 condition 2 permits merging with LOW findings tracked; a medium must be
RESOLVED. Reclassifying a reviewer's severity to make the orchestrator's own
merge easier is the shape condition 6 exists to forbid. It is resolved instead.

### The ordering constraint, which decided the design

The naive fix, "every bundle row must be named by the expectation or fail", is
CIRCULAR with an unmerged phase:

1. `brief-drift` is not in the manifest on `main`; it arrives with M3-P6.
2. Under the naive rule, M3-P6's merge would redden M3-P6's OWN pull request.
3. M3-P6 cannot fix that, per the declaration.
4. The mirror order fails too: an expectation row added before the gate exists
   trips the existing "no record in the bundle for a gate the table lists".

So the row and the gate would have to land together, and they cannot. The
resolution put to the implementer, to EVALUATE rather than obey, is to derive the
expected set FROM the manifest and treat an unlisted manifest gate as
REQUIRED-GREEN by default. `main` is then unchanged today, and M3-P6 merges with
no edit of its own.

**DISPATCHED as an orchestrator-side fix round on branch
`claude/exit-test-harness-assertion-direction`**, owing the full fix-round
contract under T-009's corollary, with a freshness watchdog armed in the same
turn. It must MERGE BEFORE M3-P6.

## Disposition of every finding

| id | source | severity | disposition |
|---|---|---|---|
| F-B1 harness asserts one direction | B | MEDIUM | RESOLVED by a dispatched fix round that merges first |
| CV-1 brief's declared mode unasserted | **A and B** | LOW | FIX in an M3-P6 round; in scope, and convergent |
| A-1 criterion 9(b) weakening proved in memory | A | LOW | FIX; a test that proves in memory rather than by executing is the exact shape criterion 11 exists to prevent, and shipping it in the phase that closes that shape elsewhere is incoherent |
| A-2 wiring witness spec's two dangerous states both make the step NOT RUN | A | LOW | FIX; "one witness is not a class" applied to the phase's own witness spec, and neither member leaves the step running-but-toothless |
| F-B3 `describeDrift` compares line sets | B | LOW | TRACKED, not fixed. Exit code is correct; only the message is wrong, and only for a reordered or duplicated row. Recorded in delivery/STATE.md's carried-forward register with this reason |

## What this arbitration does NOT do

- **It does not merge M3-P6.** Two conditions remain: the harness fix must land,
  and the M3-P6 fix round must be delta-verified. CI on `16bab6f` is already
  verified by step on both workflows, so condition 4 will need re-establishing on
  whatever head the fix round produces, not carried from this one.
- **It does not count this as M3-P6's first fix round for the stop rule** until
  the round is actually dispatched. DR-0012's bound is two rounds after review.
- **It does not re-verify contract A's or contract B's individual defangs.** The
  orchestrator independently confirmed F-B1 and the `src/roles.ts:644` half of
  CV-1, and took the rest on the reports, which is what the reports are for.
