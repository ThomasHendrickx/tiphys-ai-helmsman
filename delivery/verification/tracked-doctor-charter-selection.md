# Tracked finding: `tiphys doctor` selects charters by a raw `kind` read, and a
# failed reading passes silently

Found 2026-09-16 by the delta verification of M4-P10's second fix round, as
finding NF-2. Recorded here because it is a real defect in a shipped,
user-visible command, it is NOT M4-P10's to fix, and a finding that lives only
inside one phase's review is a finding that gets lost.

## The defect

src/commands/doctor.ts:472 opens `if (document["kind"] !== "charter") {` and
src/commands/doctor.ts:473 is the bare `continue;` inside it, in a loop over the
charter directory. A document whose `kind` cannot be read as the scalar
`charter` is skipped, and the skip is indistinguishable from "this file is not a
charter".

**The line number in this paragraph was WRONG when this entry was first drafted,
and the way it was wrong is the one CLAUDE.md warns about.** It said 471, which
is a closing brace: in range, so it resolved, and it resolved SILENTLY against a
line that is not the line under discussion. It was corrected by reading the file
rather than by a red gate, because a red gate cannot see this class at all.

## Measured, not argued

A fleet made by `tiphys init`, one good charter with three real retention paths,
plus a second charter declaring a retention path that does not exist:

| second charter's `kind` | result |
|---|---|
| `charter` (control) | `CHECK retention FAIL ... declares retention path notes/does-not-exist, which does not exist` |
| a one-element YAML list | `CHECK retention PASS`, exit 0 |
| `Charter` | `CHECK retention PASS`, exit 0 |
| a string carrying U+200B | `CHECK retention PASS`, exit 0 |

Three structurally different members and a control. `tiphys doctor` reports PASS
and exits 0 over a fleet holding a broken charter.

## Why it is not M4-P10's

M4-P10 fixed exactly this mechanism for VERDICT documents, and the verifier
established that this is the same mechanism one directory along. It is still not
M4-P10's to close:

- src/commands/doctor.ts is byte-identical on `origin/main` and at M4-P10's
  head, so merging M4-P10 does not introduce it and refusing that merge does not
  remove it;
- the file is not on M4-P10's declaration, so fixing it there would widen the
  diff into a file the phase has no business changing.

That reasoning is DR-0027 applied correctly, and it is why the finding is
non-blocking rather than why it does not matter.

## What it needs

A phase of its own. The highest id the M4 plan currently uses is M4-P30, so the
next free one is M4-P31, and allocating it is a plan revision rather than
something to do in passing.

Its shape is already clear from M4-P10's fix: one shared reader that separates
ESTABLISHED from ABSENT from UNUSABLE from UNCANONICAL, rather than a second raw
read per call site. M4-P10 removed the duplicate reader rather than aligning
two, and the same move applies here.

## What this does NOT establish

The measurement covers the retention check only. Nothing here says whether the
other doctor checks that iterate the charter directory behave the same way, nor
whether a consumer could reach the state by accident rather than by a crafted
fixture. Both should be settled by whoever takes the phase, not assumed from
this entry.
