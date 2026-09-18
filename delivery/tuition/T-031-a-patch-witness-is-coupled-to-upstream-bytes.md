# A patch-based witness member breaks when an unrelated phase edits its target
# file, and the gate reports ERROR rather than red

**A SECOND ENTRY WAS BRIEFLY FILED UNDER T-031 AND IS NOW T-037.** It is
delivery/tuition/T-037-the-absent-arm-of-the-push-watcher-returned-success.md:1,
about a push-run watcher whose absent arm exited 0. A citation to `T-031` written
between 2026-09-17 and 2026-09-18 may mean that document rather than this one.
The collision and its renumbering are recorded in T-039.

Measured 2026-09-16 on M4-P2 after merging `main` forward.

## What happened

`witness/spawn-launch-failed-rolls-back-through-a-symlink.json` has a member
whose dangerous state is expressed as a PATCH,
`witness/patches/m4-p2-canonicalise-the-caller-argument-instead.patch`. Its job
is a good one: it applies the PLAUSIBLE-BUT-WRONG alternative fix, canonicalising
the caller's argument inside `loadFleet`, and demonstrates that it closes one arm
and ships the other. That is a stronger witness than the usual kind, because it
refutes a specific competing design rather than only the absence of the feature.

The patch targets `src/fleet.ts`. M4-P16 changed `src/fleet.ts` and merged. The
patch's context lines no longer match:

    witness spawn-launch-failed-rolls-back-through-a-symlink: error: member 1
    (patch witness/patches/m4-p2-canonicalise-the-caller-argument-instead.patch):
    does not apply: git apply ... exited 1:
    error: patch failed: src/fleet.ts:1

The gate reports **error**, not red, which is correct: it could not evaluate the
member, and an unevaluated member is not a passing one.

## The coupling, stated so it is not rediscovered

**A patch member is coupled to the exact BYTES of its target file.** Every other
witness member shape is coupled to a string (`find`/`replace`), which survives
edits elsewhere in the file. A patch carries context lines, so ANY upstream
change near them breaks it, and the phase that breaks it is not the phase that
owns it.

Neither phase did anything wrong. M4-P16 had every right to edit `src/fleet.ts`;
M4-P2 had good reason to express that member as a patch. The cost is that a
long-lived branch carrying a patch witness acquires a maintenance dependency on
every file its patches touch.

## What it is NOT

It is not an argument against patch members. The alternative-fix patch is the
most informative member in this phase, because it is the only one that refutes a
competing design rather than the feature's absence. Replacing it with a
find/replace member would lose that.

## What to do when it happens

Regenerate the patch against the current tree, preserving the INTENT rather than
the bytes: apply the alternative fix to the merged source, diff, and store that.
Then let the red-witness gate confirm the member still reddens, which is the only
check that the regenerated patch still expresses the same dangerous state. Do not
hand-edit context lines to make `git apply` succeed; that can produce a patch
which applies and no longer implements the alternative design, and the gate would
then report green over a member that witnesses nothing.

## What this does NOT establish

How OFTEN the targets change. The population itself is now measured rather than
left open: `git ls-files 'witness/patches/*'` returns TEN patch members across
SIX distinct target files.

| patch | targets |
|---|---|
| citation-na-arm-a-drop-precondition | src/gates/citations.ts |
| citation-na-drop-precondition | src/gates/citations.ts |
| citation-na-precondition-met-true | src/gates/citations.ts |
| citation-readd-review | src/gates/citations.ts |
| citation-readd-work-history | src/gates/citations.ts |
| m4-p2-canonicalise-the-caller-argument-instead | src/fleet.ts, src/pool.ts |
| m4-p2-normalise-but-still-compare-strings | src/gates/coverage.ts |
| resume-destroy-and-recreate | src/commands/resume.ts |
| witness-clone-degrade-refusal | src/witness/run.ts |
| witness-clone-drop-node-modules-link | src/witness/run.ts |

Five of the ten target one file, `src/gates/citations.ts`, so a single future
phase editing that file breaks five members at once. That is the shape to watch,
and it is a prediction rather than an observation: nothing here says any of the
five is currently at risk.

A rate would need the change history of those six files, which is not measured
here. One instance is not a rate, and ten members is not a defect.
