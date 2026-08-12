# T-015: a citation into a newest-at-top file rots on every append, and a re-run is what caught it every time

- date: 2026-08-12
- discovered by: the orchestrator, against itself, four times in one branch
- kernel-relevant: yes
- id check: `git log --all --oneline -- 'delivery/tuition/T-015*'` and
  `git log --all --oneline -S'T-015'` both return empty, so T-015 has never been
  allocated or retired

## The failure

`assurance-modes.yaml:48` cites a bullet in `delivery/STATE.md` by line number.
`delivery/STATE.md` is a NEWEST-AT-TOP file: every currency update inserts
bullets above the existing ones. So every append to it moves that bullet, and the
citation is wrong the instant the append lands.

**Measured on branch `claude/plan-m3p6-dispatch-read`, 2026-08-12.** The citation
was CORRECT on `main` before the branch started, which is the part worth stating
plainly rather than blaming an inherited defect:

```
$ git show origin/main:delivery/STATE.md | grep -n 'THE MECHANISM ITSELF, which is the item to carry'
613:- **THE MECHANISM ITSELF, which is the item to carry rather than the three
$ git show origin/main:assurance-modes.yaml | grep -n 'delivery/STATE.md:'
48:#                      three anecdotes; it is tracked in delivery/STATE.md:613.
```

613 cited, 613 correct. Five commits later on that one branch, the target had
moved to 708, and the citation had to be repointed FIVE TIMES:

| commit adds | bullet moves to | citation repointed to |
|---|---|---|
| the first currency block | 660 | 660 |
| the M3-P7 pre-read bullet | 679 | 679 |
| the push-run PARTIAL becoming COMPLETE (one line longer) | 680 | 680 |
| the M3-P8 gap bullet | 690 | 690 |
| the fix-round handback bullet, and THIS ENTRY's own STATE row | 708 | 708 |

Every one of those five was caught by re-running the resolution, and NONE of them
was noticed while writing. Two are worth singling out. The third is the subtlest:
a nine-line block replaced by a ten-line block, which does not feel like an
insertion at all. The fifth is the sharpest, because **the commit that broke the
citation for the fifth time is the commit that adds THIS ENTRY**: writing the
tuition record about the failure mode caused another instance of the failure
mode, and it was caught by the same re-run rather than by having just written a
thousand words about it. That is the strongest evidence in this record that the
answer is a command and not an awareness.

## The mechanism, stated as a mechanism and not as a lesson

**A line-number citation into a file whose convention is to prepend is not a
stable reference. It is a reference with a decay rate equal to the file's append
rate.** Nothing about the citing file changes; the target moves underneath it.

Two consequences that generalise past this pair:

1. **The author is structurally the last person to notice.** They are looking at
   the text they wrote, not at the target's new offset, and the citation still
   LOOKS right because it was right when they typed it.
2. **Writing the citation and verifying it are the same act only if verification
   happens LAST.** Verifying when you write it certifies a state your own later
   commits in the same branch then invalidate. This is why "check your citations"
   as advice does not work and "resolve every `path:line` after your final edit to
   the cited file" does.

## Why no gate caught it, measured

`assurance-modes.yaml` is at the REPOSITORY ROOT. The `citations` gate's
`documents` globs are all under `delivery/`, so a root-level authored file is
outside the gate entirely, in both directions: neither a rotted citation FROM it
nor one INTO it is checked. Confirmed the same way the gap was confirmed for
`delivery/review/` on the same day: the gate reports a precondition rather than a
verdict when no changed path is under those globs.

So this is not a gate that failed. It is a region with no gate, and the region
contains the kernel's own root-level configuration files.

## Structural consequence

- status: **partly applied.** The discipline half is written into
  delivery/STATE.md:1 as a standing reminder and was followed four times in one
  branch, which is what produced the measurement above. The MECHANISM half is
  not built.
- target: the `citations` gate's `documents` globs, which today reach only
  `delivery/`. Extending them to root-level authored files
  (`assurance-modes.yaml`, `gate-registry.yaml`, `gates.manifest.json`,
  `CLAUDE.md`) would put this region under the same check as everything else.
- owner: **not this record's to assign.** `gate-registry.yaml` is M3-P2's
  artifact and its globs are a phase's deliverable, so the change belongs to a
  phase and is flagged here rather than improvised on a paperwork branch.

## The cheaper mitigation, available to anyone today

Prefer citing something that does not move. A path with a line number into an
append-at-top file is the fragile form; a path with a line number into a stable
document, or a quoted path with no line number when the reference is nominal
rather than positional, does not decay. When the positional citation is the right
one anyway, resolve it after the final edit and not before.

## What this entry does NOT claim

- **It does not claim this is the first instance.** delivery/STATE.md:1 records
  an earlier one on 2026-08-10 where the same citation was verified correct at
  one line and moved by a later commit on the same branch, and records that
  M3-P3 round 10 shipped the same defect twice.
- **It does not claim the four repoints above were avoidable by care.** They were
  each caught by a command, and the entry's whole point is that the command is
  what worked. Three of the four came after having just written the rule down.
- **It does not measure how many other root-level citations are currently
  rotted.** That sweep was not run, and the absence of a gate over that region
  means nobody has run it.
