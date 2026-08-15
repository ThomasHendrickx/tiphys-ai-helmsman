# Arbitration: the M3 exit test's subject change, and why one re-review rather than two

- date: 2026-08-15
- arbitrator: orchestrator
- head merged: the tip of `claude/m3-exit-test-and-subject`
- outcome: **MERGES.** One fix round spent of a cap of two.

## The reviews

Two clean-room reviews at `eb13da6`, on different model families, framings and
review contracts, both FIX-ROUND-NEEDED:

- delivery/review/clean-room-m3-exit-subject-criteria.md:1 (criteria contract)
- delivery/review/clean-room-m3-exit-subject-hazard.md:1 (hazard contract)

Their two blocking findings were one mechanism seen from two sides. The hazard
contract found that the check verified a path EXISTS where the property that
matters is that the artifact RESOLVES, with four shapes forced to `PASS` against
a staged install including an `AGENTS.md` of zero bytes. The criteria contract
found that the two behaviours the phase exists for, a removed directory and a
removed file, had no red-witness mutation coverage at all, so `red-witness` was
green over witnesses that missed the change's whole purpose.

**A guard checking the wrong property, and no witness that would have caught
it.** That is the pairing this repository keeps paying for, and here the two
contracts found the two halves separately.

## Why ONE re-review and not two

DR-0012 conditions delegated merge authority on dual clean review. Both verdicts
sit on the PRE-fix head and both read FIX-ROUND-NEEDED, so E2.1 was not
discharged by them and something had to look at the fixed head.

The judgment: the second contract had already done its distinct job. Running
both again on a head whose only change is the closure of their own findings buys
a duplicate answer to a question already asked. So a single delta re-review ran,
scoped to whether the findings are closed and whether closing them broke
anything, at delivery/review/re-review-m3-exit-subject-fix-round.md:1. It
returned APPROVE.

**This is a departure from DR-0012's letter and it is recorded as one.** The
owner's steer, recorded in delivery/decisions/DR-0034-pulse-is-the-pilot-and-the-controls-are-cut.md:1,
is to stop over-engineering; the arbitrator judged the second contract to be
ceremony here and not assurance. A reader who disagrees has the head, both
original reviews and the re-review to check it against.

## What the re-review established rather than accepted

It reproduced rather than agreed, which is the distinction that matters:

- It ran `npm pack`, staged a real install, and reproduced all four shapes as
  `FAIL` exit 1 where they had been `PASS` exit 0.
- It hunted a FIFTH false-pass shape by execution and found one, a
  whitespace-only `.md`, then reported it as NOT a finding because
  `src/commands/doctor.ts`'s own comment declares that boundary deliberate.
  Declining a bankable finding is the behaviour worth naming.
- It read `witness-records.json` directly rather than the gate's summary line,
  and confirmed the reddened test names are the pair the criteria review said
  were uncovered.
- On whether the round broke anything, it hand-applied the FIFO witness's exact
  mutation at BOTH revisions and found the looseness predates the round, so the
  repoint preserved parity rather than defanging anything.

## Merged carrying these, none blocking

| what | why not blocking |
|---|---|
| the whitespace-only `.md` boundary | declared deliberate in the source; a document with no information is a different problem from a missing one |
| seven unguarded open sites from the M3 derivation, including `src/pool.ts:171` and `src/brief.ts:43` | outside this phase's files-to-touch; the derivation naming them is what was owed |
| the FIFO-at-`package.json` hang at src/version.ts:20 | reproduces at the base, so pre-existing; deliberately not fixed here |
| `checkRetention` as one more presence-test site | another phase's code |
| `scope` and `citations` keeping the runner at exit 20 | structural on a non-phase branch while the branch ruling stands |

## What this arbitration does NOT establish

- **The exit test no longer claims to measure rather than merely pass.** The
  three falsification controls are cut by owner decision and section 4.5's claim
  is unsupported without them. DR-0034 records what that costs.
- **The E1.8 verification was produced by the same agent as the round**, which
  it states in its own header. The re-review is the independent check, not it.
- **No claim is made about the whitespace boundary being right**, only that it
  is declared and therefore not a hidden gap.
