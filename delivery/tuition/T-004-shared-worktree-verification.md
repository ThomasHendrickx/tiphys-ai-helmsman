# T-004: Verification lenses sharing one worktree can manufacture a phantom defect

- id: T-004
- project: tiphys-kernel
- date: 2026-08-04
- stage: M1-P3 verification and the investigation that followed it
- kernel-relevant: yes (verification harness contract, evidence pinning)

## What happened

The first adversarial verification of the M1-P3 fix round was dispatched by
the orchestrator with this instruction: run the lenses against the shared
phase worktree, and "you MAY copy the branch content to a scratch directory
if you want to execute builds or tests". Several lenses therefore ran full
test suites in the same worktree, while other lenses mutated sources in it
to perform sabotage witnesses, each taking a byte copy and restoring it
afterwards. The final tree was verified byte-clean.

That round produced U-2: two EXT-F-01 race witnesses failing intermittently
on what was believed to be unmodified code, with no mechanism attribution.
Because those witnesses guard the compare-and-swap that implements "one
orchestrator per fleet", the finding blocked a merge and triggered a second,
larger investigation.

The investigation established that the compare-and-swap is sound under every
attack it could construct, and that 180 full-suite runs in the exact failing
configuration produced zero occurrences, against an original observed rate
of 2 in 11. It also established by forensics that the shared worktree's
`src/lock.ts` was rewritten in place with pristine content 42.8 seconds into
the failing run, and that something was created or renamed inside its `src/`
directory eight minutes earlier. Deleting only the byte-compare branch from
a pristine clone reproduces the exact failure shape of the original run.

The trigger is not proven, and the investigation deliberately refused to
award a root cause. What is settled is that the failing runs did not execute
the shipped compare-and-swap as written, and that a concurrent source
modification by a sibling lens is the leading candidate.

## Lessons

1. **Shared mutable ground turns one lens's experiment into another lens's
   discovery.** A sabotage window that is perfectly disciplined in isolation
   (copy, mutate, measure, restore) becomes an invisible source of phantom
   findings the moment a second agent is running tests against the same
   files. The tree is byte-clean by the time anyone inspects it, so the
   evidence of contamination is gone while the finding survives.

2. **The orchestrator's dispatch instruction was the defect.** The lenses
   followed their briefs. The brief permitted, rather than required,
   isolation. Permitting isolation is not the same as requiring it, and the
   difference cost two multi-hour investigations and a blocked merge.

3. **A test run is only evidence if you can prove what it ran.** No artifact
   recorded the content of the source files during the failing run, so the
   question could only be approached through filesystem forensics after the
   fact, and could not be closed. A run that cannot name what it executed is
   not evidence, it is an anecdote.

4. **A phantom finding costs as much as a real one, sometimes more.** U-2
   was treated exactly as a real high-severity possibility should be
   treated, which was correct given what was known, and that correctness is
   what made it expensive. The cheap fix is upstream, in how verification is
   dispatched.

## Structural consequences

- **Already applied**: `.claude/skills/adversarial-verification/SKILL.md`
  requires every agent to work in its own isolated clone and forbids working
  in a worktree another agent is editing. The second verification round was
  dispatched under that rule, and the investigation's own four hypotheses
  each ran in a private clone.
- **Still to build, for the kernel's own verification tooling (M2)**: a
  verification run must pin the source it ran against, recording the hash
  and mtime of every file under `src/` at run start and at run end, and
  declaring itself non-evidence if they differ. This is deterministic and
  scriptable, so by the placement rule it belongs in Layer 1, not in a
  prompt.
- **Report contract (M3)**: a finding produced by a run that cannot pin its
  source must be labelled as unpinned, so a later reader can weigh it
  correctly rather than inheriting it as fact.

## What this does not excuse

U-2 was not a waste. The investigation it forced produced three real defects
on pristine code that nothing else had found: a non-atomic initial lease
publish that intermittently reddens an acceptance witness and can make a
healthy fleet report as corrupt, a claim-steal double win that the CLI
actively invites, and a hold seam that cannot tell holding from never having
held. The lesson is about dispatch hygiene, not about spending less on
verification.

## Evidence

- `delivery/verification/u2-race-flake-investigation.md`, verdict section,
  hypothesis 1 forensics, and the "one process change is a condition of
  trusting the next verification round" paragraph.
- `delivery/review/verification-m1-p3-fix-round.md`, U-2 and honest-failure
  item 1, and its stated working-tree discipline.
- `.claude/skills/adversarial-verification/SKILL.md`, the isolation rule.
