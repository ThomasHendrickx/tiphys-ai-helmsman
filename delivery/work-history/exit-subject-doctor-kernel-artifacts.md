# M3-P13 work history: the kernel-artifacts check for tiphys doctor

- date: 2026-08-15
- subject: the M3 exit test's designated subject change (stage E1.6). It is NOT
  a phase of the M3 plan, and the section "the branch is not phase-shaped, by
  ruling" is why that sentence is load-bearing rather than pedantic.
- branch: `task/exit-subject-doctor-kernel-artifacts`, created by the kernel's
  own pool at the fetched base d5d87f7 (see "how this work was launched")
- plan: the amended instance the exit test produced at E1.4 and E1.5, which
  lives in the exit-test bundle rather than in `delivery/plan/`, at
  `delivery/evidence/m3-exit-test/e1/plan-kernel-artifacts.yaml` on the bundle
  branch. Quoted rather than cited, because that path does not exist on `main`
  and a citation that resolves against the wrong tree is worse than none
  (CLAUDE.md:155).

**This phase is NOT complete. One gate is red and the reason is structural
rather than a defect in this change.** Section "the blocker" states it with both
arms measured. Everything else in the phase is done and green.

## The branch is not phase-shaped, by orchestrator ruling

**This is the orchestrator's second recorded intervention, I-3 in the exit-test
bundle's `interventions.md`, and it is recorded there in full with the note that
the E2 reviewers may judge it wrong.** The short form, because a reader of this
history should not have to fetch another document to understand the branch name:

The first push of this work used `claude/m3-p13-doctor-kernel-artifacts`, taken
from the `branch` field of the plan instance, which the plan schema forces to
match `^claude/m[0-9]+-p[0-9]+-.+$`. That name matches the scope auditor's phase
pattern, so the auditor derived phase `m3-p13` and required a declaration at the
merge base that does not exist on `origin/main`. The orchestrator ruled: rename
the branch so it does not match, and do NOT mint an `m3-p13` phase declaration,
because `.claude/orchestrator-next.mjs:126` harvests phase numbers from
declaration filenames, work-history filenames AND remote branch names, so a
thirteenth id would become a permanent phantom phase in the milestone's
accounting.

What that cost, stated without softening because the ruling itself insists on
it: **on a non-phase branch the scope gate has no phase to audit, so it reports
not-applicable and the scope audit asserts NOTHING about this change.** That is
a real reduction in what E1.6's expected-status table witnesses, and it is a
WEAKER not-applicable than the diff-scoped kind DR-0018's table contemplates:
there the trigger is "the head does not touch the gate's paths", here it is
"this branch is not a phase", which is a statement about the branch rather than
about the diff.

Two consequences carried in this history rather than left to be found:

- The plan instance still names phase `M3-P13` in its `id` field, because the
  plan schema's phase-id pattern requires that shape and an implementer does not
  edit the plan (R-007). So the plan says M3-P13 and no filename, branch or
  declaration does. Nothing harvests a plan instance that lives in the exit-test
  bundle, so no phantom phase results; the mismatch is recorded because a
  reviewer reading the plan will look for the phase and not find it.
- The declaration `delivery/plan/phase-declarations/m3-p13.json`, written before
  the ruling, was DELETED from this branch rather than kept, and the work
  history was renamed off the `m3-pNN.md` shape for the same harvesting reason.

## How this work was launched, because it is the exit test's subject

`tiphys spawn` created the pool worktree and assembled the brief; the kernel's
own machinery did it rather than a human simulating it:

```
$ tiphys spawn --task exit-subject-doctor-kernel-artifacts \
    --project <fleet>/projects/tiphys-kernel \
    --brief <bundle>/e1/brief-implementer.md --shape ship --exec "git rev-parse HEAD"
d5d87f7baf4ad31ab77ab074a5f0b588da189217
spawned exit-subject-doctor-kernel-artifacts worktree
  <fleet>/worktrees/exit-subject-doctor-kernel-artifacts exec exited 0
```

Exit 0. `tasks/exit-subject-doctor-kernel-artifacts/meta.json` records `baseSha`
d5d87f7baf4ad31ab77ab074a5f0b588da189217, `baseOffline` false and branch
`task/exit-subject-doctor-kernel-artifacts`; the base is the sha the pool
FETCHED from the project's remote default branch, so the branch is cut from
`main` rather than from any local state.

**Where the phase-shaped name came from, measured rather than assumed, because
the ruling asked.** `taskBranchName` at src/pool.ts:52 returns `task/<id>`, so
the kernel's own output was `task/m3-p13` on the first spawn, which does NOT
match the phase pattern. The matching name was applied by the runner from the
plan's `branch` field, outside the kernel. The first spawn was therefore never
the source of the problem, and the fix was still made AT THE TASK ID rather than
by a git rename, so that the branch this work is reviewed on is the kernel's own
output: the second spawn was given a task id that is not phase-shaped and the
kernel produced `task/exit-subject-doctor-kernel-artifacts` from it. The eleven
commits were carried across with `git merge --ff-only`, so nothing was
rewritten and every commit is byte-identical to the one reviewed before the
rename.

**The implementer is the runner agent working under the composed brief in that
worktree, and the `--exec` payload is not the implementer.** Stated plainly
because the alternative reading would be a false claim about what the kernel
did: no agent executor adapter exists before M4 (kernel plan section 4.5 limit
5), so `--exec` runs an ordinary subprocess to completion. What the kernel
genuinely did here is compose the brief from `roles/implementer.md`, create the
pool worktree at the fetched base, write the task meta and the executor record,
and run the payload under the lease.

## clause mechanism-lookup: what the index said, including where it said nothing

Consulted `tuition/mechanism-index.yaml` (16 entries) BEFORE writing the check,
per the clause. What was found, mechanism by mechanism:

| mechanism I used | index entry | what it said | how this change satisfies it |
|---|---|---|---|
| reading a path whose type is not established | `reading-a-path-whose-type-is-not-established` | lstat the link, stat what it resolves to, open ONLY a regular file; a block is not an exception, so try/catch does not touch it | the AGENTS.md probe goes through `classifyEntry` from src/task.ts:118 rather than `existsSync`, and a FIFO at that path is a reported refusal. Asserted with a timeout by the test named in criterion 11 |
| a guard whose failure path is a crash | `a-guard-s-own-failure-path` | a guard whose correctness depends on a crash is not a guard; make the success path total so removing the explicit failure is visible | `resolveInstalledKernelRoot` RETURNS its reason instead of throwing, and the check turns that into a FAIL record. This is criterion 10 and it has its own witness |
| a check whose subject is chosen by the artifact it audits | `checking-a-generated-artifact-against-its-own-generator` | a check whose subject is selected by a value read from the artifact it audits can be silently narrowed by editing that artifact; pin the subject OUTSIDE the artifact | the four required artifacts are a constant in the source. Reading them from the install's own `package.json` files array would mean an install that dropped `roles/` from both the tree and the list reported itself complete |
| resolving a package root | **no entry** | the index has no row for resolving an installed package's own root, and this is exactly the mechanism the plan review's high finding was about | recorded here as the answer rather than as an omission, and the reasoning is in the source comment above `resolveInstalledKernelRoot` so the next reader does not have to reconstruct it |
| directory emptiness as a proxy for resolvability | **no entry** | nothing in the index | decision D-1 of the phase plan is the reasoning, and criterion 3 is the guard |

## What was built

One check, `kernel-artifacts`, in src/commands/doctor.ts. It resolves the
installed kernel root, requires `roles/`, `schemas/` and `checklists/` to exist
AND to be non-empty and `AGENTS.md` to exist as a regular file, names EVERY
missing artifact rather than the first, and carries the condition
`kernel-artifacts-incomplete`, promoted to FAIL under the `full` profile only.

### The high finding from the plan review, and how it was answered

PR-1 measured that `kernelRoot()` at src/roles.ts:330 walks upward for a
`roles/` directory carrying a `.md` file and throws at src/roles.ts:347, so a
check built on it answers about an ancestor or crashes on exactly the state
criterion 1 describes. The check therefore does NOT use it. It resolves the
first ancestor carrying a `package.json`, which is the package boundary rather
than a member of the set under test, and criterion 9's test stages an install
with `roles/` removed INSIDE a parent that does carry `roles/*.md`, which is
the arm an upward-walking resolver reports PASS on.

**DEVIATION FROM THE PLAN'S LITERAL WORDING, declared rather than absorbed.**
The amended plan's step says the root is "computed from import.meta.url WITHOUT
searching upward". A fixed depth is not implementable across the two shipped
layouts, and this was measured rather than argued: `npm pack --dry-run` on this
head puts the module at `dist/src/commands/doctor.js` with the artifacts three
levels up at the package root, while the development checkout has
`src/commands/doctor.ts` with the artifacts two levels up, and `dist/package.json`
is not in the pack listing (181 files). So a fixed depth is wrong in one of the
two layouts. What the finding was PROTECTING is preserved exactly: the search
key is `package.json` rather than the artifact under test, and the test named in
criterion 9 is the check on that, green under both of its dangerous states. The
wording is reported to the orchestrator rather than edited, because R-007 says
an implementer does not edit the plan.

## Evidence

**Suite, the complete sentence.** Invocation `npm test`, toolchain node
v26.6.0, build state `dist/` present (built immediately before). Reported:
tests 836, pass 836, fail 0, **skipped 0**, todo 0, cancelled 0. Exit 0. The
base at d5d87f7 reported 824 under the identical sentence, so this phase adds
twelve tests and skips none.

**The real capture, and it is the strongest thing in the phase.**
`witness/captures/doctor-kernel-artifacts-staged-install.txt` is verbatim
output of the BUILT CLI of a staged install, run from a fleet home with `gh` on
the PATH and a push target configured, so `kernel-artifacts` is the only check
able to drive the exit code. Three cases:

| case | line | exit |
|---|---|---|
| complete install, `--for full` | `CHECK kernel-artifacts PASS ... carries roles/, schemas/, checklists/ and AGENTS.md` | 0 |
| `roles/` removed, `--for full` | `CHECK kernel-artifacts FAIL ... is missing roles/ (absent) (required for profile full)` | 1 |
| `roles/` removed, no profile | `CHECK kernel-artifacts WARN ... is missing roles/ (absent)` | 0 |

Two tests hold that contract: one asserts the recorded capture, and one stages
a fresh install from the built package and reproduces all three cases live. The
second is what stops the first from being a stored string that drifts.

**Witnesses.** Four durable specs, each with TWO structurally different
dangerous states, because one witness is not a class and the harness enforces
it as rule (g):

| spec | arm | member 0 | member 1 |
|---|---|---|---|
| `witness/doctor-kernel-artifacts-empty-directory.json` | an empty directory counts as missing | the emptiness test defanged | the directory read faked as non-empty |
| `witness/doctor-kernel-artifacts-resolution.json` | the resolver does not walk past the install | the search key changed back to `roles/` | the answer shifted one level up |
| `witness/doctor-kernel-artifacts-fifo.json` | a FIFO is refused, not opened | `classifyEntry` replaced by `existsSync` | irregular entries accepted as present |
| `witness/doctor-kernel-artifacts-unresolvable.json` | an unresolvable root is a FAIL | the resolver throws instead of returning | the FAIL handler dropped |

All four are GREEN under the harness. The run record is at the gate's evidence
directory and is carried into the exit-test bundle with this history.

**Three things the harness taught this phase, each of which cost a round and
none of which is in any document I read first.** They are recorded here because
the next implementer will hit them in the same order:

1. A behavior's VALUE in `test/behaviors.json` is the exact reported TEST NAME,
   not a description of the behavior. The `suite` gate resolves behaviors by
   matching that string against reported test names, and ten prose descriptions
   made it red with ten findings.
2. A witness spec's named tests must ALL redden under EVERY member, so a spec
   naming several tests and several arms was not satisfiable here, and the
   gate said so per member: "no named test reaches this arm ... stayed green:
   <the other named tests>". The fix is one spec per arm, which is what M3-P8
   did to its own retention witness at `5dc2e0a` and what this phase re-derived
   from the gate's own message.
3. Rule (f) binds a witness to a real capture whenever the phase diff touches a
   file the spawn grep matches, and src/commands/doctor.ts spawns git, so every
   witness here needs `consumesExternalOutput` even though the new check spawns
   nothing itself.

## The blocker: red-witness is RED and this change cannot make it green

**The mechanism, not the instance.** A witness spec's `mutation.find` is a
VERBATIM QUOTATION OF A SOURCE LINE. That makes the quoted line a coupling
point owned by no phase. Two M3-P8 specs quote the `full:` profile-promotion
line of src/commands/doctor.ts, and the designated subject of this exit test
requires adding a condition to exactly that line.

Both arms measured, on this head, with everything else in the phase green:

| arm | what was done | red-witness result |
|---|---|---|
| A | repair both specs so their promotion member matches the new source text | `rule (d): declared dangerous state does not intersect the phase diff (member 0 ...)` for both specs |
| B | leave both specs exactly as `main` has them | `error: mutation find text "  full: [\"gh-missing\", \"remote-missing\", \"retention-undeclared\"]," does not occur in src/commands/doctor.ts` for both |

The reason neither arm can be repaired from inside this phase: editing a spec
file puts it in the phase diff, which makes it one of the phase's OWN witnesses,
and rule (d) then requires EVERY member of it to intersect the diff
(src/witness/run.ts:1251). Those specs' other members mutate the RETENTION code,
which this phase does not touch and must not touch. Leaving them alone leaves a
find text that no longer occurs, which is an error rather than a pass.

**The three things this phase deliberately did NOT do**, because each would be
worse than a red gate:

- Reformat or touch the retention code so those members intersect. That is
  writing code to satisfy a guard rather than to be right.
- Remove the promotion member from the M3-P8 specs. That would delete a guard
  another phase built and this phase was not asked to change, which is the
  settled-question case R-007 puts outside an implementer's authority.
- Drop the profile promotion from this change. The promotion is part of the
  subject the exit test DESIGNATED, and dropping it would silently change what
  the exit test measured.

Arm A is what the branch carries, because a repaired spec at least guards the
new source text; the remaining red is then a judgment about rule (d) rather
than a stale quotation.

## Two findings for the reviewers, neither fixed here

- **The plan schema and the kernel's own pool disagree about what a phase
  branch is called.** `schemas/plan.schema.json` requires a phase's `branch` to
  match `^claude/m[0-9]+-p[0-9]+-.+$`, and `taskBranchName` at src/pool.ts:52
  creates `task/<id>`. Both are shipped kernel artifacts. The consequence is
  visible in this phase's own gate run: the `scope` gate reported
  not-applicable because the pool worktree's branch is `task/m3-p13`, which the
  auditor's phase pattern does not match. The branch pushed for review carries
  the plan's name, so the gate resolves there, but nothing in the kernel maps
  one to the other.
- **The plan schema forces a phase-shaped branch onto work that is not a
  phase.** `schemas/plan.schema.json` requires every phase's `branch` to match
  `^claude/m[0-9]+-p[0-9]+-.+$`, so a plan instance CANNOT express the branch
  this work is actually reviewed on. The dispatch brief said the branch must not
  match that pattern; the schema says it must; the orchestrator's ruling settled
  it in favour of the brief and against the plan instance's own field. The
  residue is that a shipped schema cannot describe a legitimate piece of work,
  which is a finding about the schema rather than about this change.

## The scope gate, measured on both branch names

Both readings are recorded, because between them they say what the gate does and
what it no longer asserts here.

**On the phase-shaped name, before the ruling**, the gate was APPLICABLE and RED:

```
gates: scope: red: branch claude/m3-p13-doctor-kernel-artifacts (phase m3-p13)
  matches the phase pattern but no phase declaration exists at
  delivery/plan/phase-declarations/m3-p13.json in the merge base d5d87f7...;
  the declaration must be committed to main before the phase branch is created
```

Reading M3-P11's own code settles why a declaration on the branch would not have
fixed it, and the distinction is finer than the sentence in CLAUDE.md that this
work's plan step was built on. src/gates/scope.ts:609 documents the asymmetry:
reading the head alone would let a phase grant itself scope, so an ADDITION to an
EXISTING declaration is allowed and printed by name for a reviewer, and a REMOVAL
stays hard. Both sides are read, but the merge-base side must EXIST. M3-P11 made
an amendment able to ride with its phase; it did not make a NEW phase's first
declaration able to.

**On the kernel-created name, after the ruling**, the gate is NOT-APPLICABLE, and
that is the state this branch is reviewed in. It asserts nothing about this
change's file set. See the ruling section above for what is being traded for
what.

**One further measurement, made and then undone, because it nearly became a
false result.** To isolate whether this change's FILE SET is within a
declaration, the declaration was committed onto a scratch base and the branch
rebased onto it. The gate refused that too, and correctly:

```
gates: scope: error: merge base 1eef3a0... is not an ancestor of the configured
  trunk origin/main (d5d87f7...); this is the shape of a merge base forked onto
  the branch under audit rather than the true fork point with main
```

That is the anti-forgery guard working. The branch was reset back and the scratch
base deleted, so nothing of the probe is in what is pushed, and `d5d87f7` is an
ancestor of the pushed head, verified with `git merge-base --is-ancestor`.
**The consequence is that whether the file set audits clean is NOT established by
this work at all**, on either branch name.

## The gate bundle, as the whole expected-status table

`tiphys gates run --registry gate-registry.yaml --mode full --base d5d87f7
--head HEAD --phase m3-p13`, node v26.6.0, `dist/` built, run at the PUSHED head
9becd638e206875e465c2c096bbec178d3b1f8c2 rather than at an earlier one. Runner
exit 1.

| gate | status | units | applicable | vacuous |
|---|---|---|---|---|
| manifest-self-check | green | 8 | true | false |
| coverage | green | 115 | true | false |
| credential-scrub | green | 7 | true | false |
| credential-token | not-applicable | 0 | false | false |
| suite | green | 836 | true | false |
| citations | not-applicable | 0 | false | false |
| scope | **red** | 0 | true | false |
| deploy | not-applicable | 0 | false | false |
| migrations | not-applicable | 0 | false | false |
| clause-map | green | 74 | true | false |
| red-witness | **red** | 7 | true | false |
| agent-rules-drift | green | 21 | true | false |
| brief-drift | green | 18 | true | false |
| check-agents-references | green | 21 | true | false |
| check-dual-review | not-applicable | 0 | false | false |
| license | green | 10 | true | false |

Recomputed from the rows: green 9, red 2, not-applicable 5, error 0.
`summary.json` reports declared 16, applicable 11, verdict 11, green 9, red 2,
not-applicable 5, error 0, vacuous 0. The recomputed counts equal the reported
ones. Every green gate has `units` greater than zero, and every not-applicable
carries its precondition id and evaluation in `summary.json`, so none is a
silent skip.

**Two reds, both structural, both explained above, neither a defect in the
change itself**: `scope`, because a new phase's first declaration cannot ride
with its branch, and `red-witness`, because two M3-P8 witness specs quote the
source line this change must edit. `red-witness` reports four own witnesses
GREEN with 2 of 2 red repetitions on each of their two members; the run record
carries those rows beside the two red ones.

**An earlier bundle at an earlier head reported `scope` as not-applicable**,
because the pool worktree's branch was still `task/m3-p13` and the auditor's
phase pattern does not match it. That reading is superseded by the table above
and is recorded so that a reviewer meeting both does not have to reconcile
them: the branch name changed between the two runs, and the branch name is what
decides whether the gate applies.
