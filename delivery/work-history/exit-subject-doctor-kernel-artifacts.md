# M3-P13 work history: the kernel-artifacts check for tiphys doctor

- date: 2026-08-15
- subject: the M3 exit test's designated subject change (stage E1.6). It is NOT
  a phase of the M3 plan, and the section "the branch is not phase-shaped, by
  ruling" is why that sentence is load-bearing rather than pedantic.
- branch: `task/exit-subject-r2`, created by the kernel's own pool at the
  fetched base 7b18144 (see "how this work was launched"), pushed for review as
  `claude/exit-subject-doctor-kernel-artifacts`
- plan: the amended instance the exit test produced at E1.4 and E1.5, which
  lives in the exit-test bundle rather than in `delivery/plan/`, at
  `delivery/evidence/m3-exit-test/e1/plan-kernel-artifacts.yaml` on the bundle
  branch. Quoted rather than cited, because that path does not exist on `main`
  and a citation that resolves against the wrong tree is worse than none
  (CLAUDE.md:155).

**REVISED 2026-08-15 after the blocker was fixed and merged.** The first
delivery of this work was blocked by a red `red-witness` whose cause was a
harness defect rather than a defect in this change. That defect is fixed on
`main` at 7b18144, this work was re-based onto it, and **`red-witness` is now
GREEN with 7 witnesses evaluated and zero red**. The blocker section below is
kept, with its resolution beside it, because the mechanism it records is the
reason the harness changed.

One weaker condition remains and it is NOT this change: the gate runner exits 20
because two REQUIRED gates are not applicable on this branch, `citations` and
`scope`, each with its precondition id and evaluation recorded. See the
expected-status section.

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

**Suite, the complete sentence, re-measured after the rebase.** Invocation
`npm test`, toolchain node v26.6.0, build state `dist/` present (built
immediately before). Reported: tests 847, pass 847, fail 0, **skipped 0**,
todo 0, cancelled 0. Exit 0.

The arithmetic across the rebase, since three numbers are now in play: the old
base d5d87f7 reported 824 and this work made it 836, adding twelve. The new base
7b18144 carries the witness-ownership fix and its own tests, and the same twelve
land on top of it for 847, which the `suite` gate reports independently in the
table below. Nothing here skips a test under any of the three.

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

### RESOLVED: both arms re-measured under the fix on `main` at 7b18144

The harness was changed rather than this work: ownership is now per MEMBER
instead of per FILE. Re-measured here rather than taken on report, at base
7b18144 with the same branch content:

| arm | before the fix | after the fix |
|---|---|---|
| A, both specs repaired (what this branch carries) | `rule (d)` red on their untouched members | **green**, `every witness red against every declared dangerous state and green at head`, runner exit 0 |
| B, both specs left as `main` has them | `error: mutation find text ... does not occur` | **unchanged: the same error** |

**Arm B is unchanged, and that is correct rather than a gap.** A spec whose
`find` text no longer occurs cannot be applied to anything, so erroring is the
only honest verdict available; the fix was never about that arm. What the fix
removes is the TRAP between the two: repairing the quotation used to be punished
by rule (d) firing on siblings, so both routes were closed. Now the repair route
is open and the stale route is still an error, which leaves exactly one correct
action for a phase that edits a quoted line: repair the quoting spec.

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

`tiphys gates run --registry gate-registry.yaml --mode full --base 7b18144
--head HEAD --phase exit-subject-r2`, node v26.6.0, `dist/` built, at head
25e9df73bc62d3df2779439aaf8a337ebcc0f7ad. **Runner exit 20**, and the reason is
stated below rather than left in the exit code.

| gate | status | units | applicable | vacuous |
|---|---|---|---|---|
| manifest-self-check | green | 8 | true | false |
| coverage | green | 115 | true | false |
| credential-scrub | green | 7 | true | false |
| credential-token | not-applicable | 0 | false | false |
| suite | green | 847 | true | false |
| citations | not-applicable | 0 | false | false |
| scope | not-applicable | 0 | false | false |
| deploy | not-applicable | 0 | false | false |
| migrations | not-applicable | 0 | false | false |
| clause-map | green | 74 | true | false |
| red-witness | green | 7 | true | false |
| agent-rules-drift | green | 21 | true | false |
| brief-drift | green | 18 | true | false |
| check-agents-references | green | 21 | true | false |
| check-dual-review | not-applicable | 0 | false | false |
| license | green | 10 | true | false |

Recomputed from the rows: green 10, not-applicable 6, red 0, error 0.
`summary.json` reports declared 16, applicable 10, verdict 10, green 10, red 0,
not-applicable 6, error 0, vacuous 0. **The recomputed counts equal
`summary.json`.**

Read against E1.6's assertion, clause by clause:

- **every non-diff-scoped required gate green with `units` greater than zero**:
  yes, ten of them, and the units are in the table rather than summarised;
- **every diff-scoped gate green or not-applicable with a recorded reason**:
  yes, and every not-applicable carries its precondition id and evaluation in
  `summary.json`, so none is a silent skip;
- **`red-witness` GREEN rather than not-applicable**: yes, green with 7
  witnesses evaluated. Six own and one stored re-evaluated; every own witness is
  red against every declared dangerous state at 2 of 2 repetitions and green at
  head. This is the clause the whole stage turns on and it is now met;
- **zero `error`, zero `vacuous`**: yes;
- **the runner exits 0**: **NO. It exits 20.**

### Why the runner exits 20, stated plainly

```
gates: required gate(s) not applicable: citations, scope
```

Neither is red and neither is silent. `citations` is not applicable because no
changed path lies under its six configured trees (this diff's only `delivery/`
path is a work history, which M2's own scope decision removed from the gate's
documents). `scope` is not applicable because the branch is not phase-shaped,
which is the accepted consequence of the orchestrator's branch ruling recorded
as intervention I-3 in the exit-test bundle.

**Two things follow and both belong to the orchestrator rather than to this
work.** First, the exit test's own text says the runner "treats an UNEXPLAINED
required not-applicable as a failure (exit 20)"; measured here, it exits 20 for
two not-applicables that ARE explained, each carrying its precondition id and
evaluation. Second, that condition is structural for this subject: any branch
that is not a phase branch and touches no citation-gated document reaches it,
so no version of this change makes the runner exit 0 while I-3's ruling stands.

## Fix round 1

Round 0's head was `eb13da6`. Both E1.7 clean-room reviews returned
FIX-ROUND-NEEDED, on the criteria contract's CR-002 and the hazard contract's
CR-001. This section records what this round changed and the command that
settles each claim. The findings themselves are not re-derived here: they are
in `delivery/review/clean-room-m3-exit-subject-criteria.md` and
`delivery/review/clean-room-m3-exit-subject-hazard.md` on branch
claude/m3-exit-test, and the four shapes of the hazard finding were measured
there against a real staged install.

### The MECHANISM, not the instances

**Presence was tested where the property that matters is resolvability.** The
check asked whether a required path EXISTS (a non-empty `readdirSync` for a
directory, a `classifyEntry` kind for the file) and reported success as
`carries roles/, schemas/, checklists/ and AGENTS.md`, which is a claim about
what the install RESOLVES. Criterion 3 had closed one instance of the gap, the
empty directory. The hazard review forced three more directory shapes and the
FILE shape, all PASS with FAIL count zero.

The fix is a predicate, not a redesign of doctor. What "resolves" means is
taken from the CONSUMER rather than invented, so the check cannot claim more
than the consumer will deliver:

    roles/       src/roles.ts:335              `.md`
    schemas/     src/commands/validate.ts:156  `.schema.json`
    checklists/  src/checklists.ts:91          `.yaml`

plus, for every one of them and for `AGENTS.md`, that the member is a REGULAR
FILE carrying bytes. One predicate, four instances closed.

**What the derivation does NOT cover**, stated rather than left to be found.
The predicate asks whether at least ONE member would be selected and carries
bytes. It does not PARSE a member, so a `.yaml` that does not decode, a
`.schema.json` that is not a schema and a `.md` with no frontmatter all
resolve. It does not ask WHICH members are present, so an install carrying one
role resolves `roles/` even when the role a brief names is the missing one.
Both are deliberate and are written into the source comment: a per-document
decode is the consuming command's own failure, reported by it, naming the path
it could not use.

Measured against the built CLI of a staged install of this head, one fresh copy
per shape, gh stubbed and a remote configured so `kernel-artifacts` is the only
check able to drive the exit code. Full output is committed at
`witness/captures/doctor-kernel-artifacts-resolvability.txt`:

| staged shape | round 0 (the reviews) | this head |
|---|---|---|
| `checklists/` = one `NOTES.txt` | PASS, exit 0, FAIL count 0 | FAIL `checklists/ (present, but no .yaml member resolves)`, exit 1 |
| `roles/` = one empty subdirectory | PASS | FAIL `roles/ (present, but no .md member resolves)`, exit 1 |
| every `roles/*.md` truncated | PASS | FAIL `roles/ (present, but no .md member resolves)`, exit 1 |
| `AGENTS.md` truncated to 0 bytes | PASS | FAIL `AGENTS.md (present but empty, so it states nothing)`, exit 1 |

### The two witnesses the class was missing

The criteria review confirmed BY EXECUTION that the removed-DIRECTORY and
removed-FILE behaviours, the two the plan names most explicitly, appeared in no
witness's `tests[]` or `failedNamedTests` across all seven evaluations. They do
now, and so does the new behaviour.

`witness/doctor-kernel-artifacts.json` is the file criterion 7 names literally.
It carries both central tests and two structurally different members: one
suppresses the missing report entirely, the other drops the
`kernel-artifacts-incomplete` condition, so the check can never be promoted to
FAIL under `full`. `witness/doctor-kernel-artifacts-resolvability.json` mutates
the two halves of the new predicate one at a time: member 0 defangs the
consumer filter, member 1 defangs the content floor by one comparison.

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only red-witness --evidence <dir> --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 9 witness(es) evaluated (8 own, 1 stored re-evaluated
  in 12177ms); every witness red against every declared dangerous state and
  green at head
GATE EXIT=0
```

Read back out of `witness-records.json` rather than asserted, since a green
bundle is not evidence about a particular witness. Both members of both new
specs: 2 red runs at exit 1 and 1 head run at exit 0, and the reddened test
names are exactly the ones the reviews said were uncovered:

    doctor-kernel-artifacts            member 0 and member 1 both fail
      "a staged install missing roles/ carries kernel-artifacts-incomplete,
       which full promotes to FAIL"
      "a staged install missing AGENTS.md is caught, which is the FILE member
       of the class"
    doctor-kernel-artifacts-resolvability   member 0 and member 1 both fail
      "presence is not resolvability: the four shapes that used to PASS are
       each named"

**One repair this round had to make, and it is worth naming.**
`witness/doctor-kernel-artifacts-fifo.json` went RED on rule (d) the first time
the gate ran, because both its mutations quoted source lines the resolvability
predicate had rewritten. The mutations were repointed at the new text and the
same semantic dangerous states preserved. There is a consequence to record
rather than gloss: with `carriesContent` also calling `classifyEntry` on the
same path, defanging the FILE branch's own `classifyEntry` no longer reaches an
open. The witness still reddens, on the DETAIL rather than on a hang. The
mechanism is now guarded at two sites, which is why a single-site defang is no
longer sufficient to make it dangerous.

### The derivation debt, published rather than chased

The hazard review's CR-002 is right that round 0 cited the mechanism
`reading-a-path-whose-type-is-not-established` and published no derivation over
its call sites. Here it is. The command, and its full output:

```
grep -rn "existsSync" src/
```

    src/fleet.ts:1, :65, :71          presence then statSync, type established
    src/task.ts:2, :386, :408         boolean; :408 statSyncs before readdirSync
    src/brief.ts:1, :53               PRESENCE THEN readFileSync AT :56
    src/gates/credentials.ts:2, :413  boolean, HOME as a cwd; no open
    src/gates/run.ts:868              a comment, not a call
    src/version.ts:1, :15             PRESENCE, PATH RETURNED, OPENED AT :20
    src/pool.ts:3, :271, :427, :465, :676, :677, :685   booleans, no open
    src/commands/doctor.ts:2, :70, :197, :512, :561, :625, :792
                                      :70 and :792 are comments; the rest are
                                      booleans; the walk at :72 IS FIXED HERE
    src/commands/lock.ts:1, :66, :79  booleans over a barrier file
    src/commands/init.ts:3, :74       presence then statSync
    src/teardown.ts:2, :348           presence only; nothing opens the report

Twenty call sites in `src/` (thirty-three grep lines, thirteen of them import
or comment lines). Three establish presence and then OPEN the path:

- **src/commands/doctor.ts:72**, `readKernelEnginesNode`. INSIDE this phase's
  files-to-touch, and CLOSED this round: it now walks with `classifyEntry`.
- **src/version.ts:15**, `findOwnPackageJson`, opened by `readOwnVersion`.
  OUTSIDE files-to-touch and not touched. The hang the review forced is here,
  and it was measured PRE-EXISTING at the base `7b18144`, so it is tracked
  rather than fixed in this phase.
- **src/brief.ts:53**, the fleet warnings file, `readFileSync` at :56. OUTSIDE
  files-to-touch. Tracked.

**What this derivation does NOT cover, and one of the gaps bit the derivation
itself.**

1. It enumerates `existsSync` only, so a `readFileSync` with NO presence test
   at all is invisible to it. One such site turned up incidentally while
   classifying: `readPoolRecord` at src/pool.ts:171 opens the record path
   inside a `try` that cannot catch a blocking open. Tracked, not fixed.
2. It is scoped to `src/`. `scripts/` and `bin/` carry sixteen more matches,
   which are dev harness rather than shipped runtime and were not classified.
3. **A five-line window grep is the wrong instrument, and returned one hit
   where the answer is three.** `grep -rn -A5 "existsSync(" src/ | grep -E
   "readFileSync|..."` finds only src/brief.ts:56, because src/version.ts
   returns the path from one function and opens it in another, and doctor.ts's
   walk opens it inside the loop body past the window. The classification above
   is per-site by reading, not by window.

**Gap 1 was then closed with a second command, because a derivation that names
its own hole and leaves it is half a derivation.** Widening from "presence then
open" to "open at all":

```
grep -rn "readFileSync(\|openSync(\|createReadStream(" src/ --include=*.ts \
  | grep -v import | grep -v readRegularFileIfPresent
```

    src/validate.ts:863     GUARDED: classifyEntry at :855 refuses absent,
                            dangling, irregular and unexaminable first
    src/task.ts:189         GUARDED: this IS readRegularFileIfPresent, the guard
    src/gates/pin.ts:114    GUARDED: classifyEntry above it, then statSync
    src/commands/doctor.ts:80  GUARDED AS OF THIS ROUND, by the walk at :72
    src/brief.ts:43         UNGUARDED, no presence test at all
    src/brief.ts:56         UNGUARDED, presence tested, type not established
    src/lock.ts:143         UNGUARDED
    src/lock.ts:164         UNGUARDED
    src/version.ts:27       UNGUARDED, the site the review's hang comes from
    src/pool.ts:171         UNGUARDED, inside a try that cannot catch a block
    src/watcher.ts:591      openSync for APPEND, the write side of the same
                            hazard (refuseOpenForWrite territory)

Eleven open sites, four guarded and seven not. Three comment lines in
`src/witness/run.ts` and `src/lock.ts` matched the grep and are not call sites.
NONE of the seven is inside this phase's files-to-touch, so none is fixed here
and all seven are tracked. This widening does not change what this round did;
it changes what the round can honestly say it looked at.

### The three small ones

- **The witness filename (criteria CR-001).** `witness/doctor-kernel-artifacts.json`,
  the name criterion 7 and files-to-touch both give, now exists and carries the
  two behaviours the plan's witness step names. **The residual deviation is
  declared here rather than left undeclared**: five sibling specs
  (`-empty-directory`, `-fifo`, `-resolution`, `-unresolvable`, `-resolvability`)
  and two captures sit beside it, none of them on files-to-touch. The reason is
  the harness rule that every named test of a spec must redden under EVERY
  member, so one spec per arm is forced; the plan's singular filename could not
  have held them. That is offered for a reviewer's judgment, not asserted as
  settled.
- **The test name that stated an outcome it did not assert (hazard CR-003,
  R-087).** `a staged install missing roles/ is a FAIL naming roles/` asserted
  `WARN`. The NAME was wrong, not the assertion: the check returns the
  condition and the printer promotes it. Renamed to `a staged install missing
  roles/ carries kernel-artifacts-incomplete, which full promotes to FAIL`, and
  `test/behaviors.json` updated to match, since the registry value must equal
  the reported test name.
- **Criterion 10's dead arm (hazard CR-004).** Recorded truthfully in the
  test's own comment and NOT made reachable. An install whose root cannot be
  resolved has no `package.json` above it either, so `readOwnVersion` refuses at
  src/version.ts:20 and the process exits 1 before any command runs. The
  criterion's letter is met by that exit 1; the arm the unit test asserts is
  never the one that produces it. Making it reachable would mean moving or
  duplicating the startup version read, which is outside files-to-touch and is
  the same walk tracked above. The measurement behind this is the hazard
  review's, cited rather than repeated.

### Suite, the complete sentence

**Invocation** `npm test` (which is `node --test "test/**/*.test.ts"`).
**Toolchain** node v26.6.0 from the scratch prefix, printed by `node --version`
in the shell that ran it. **Build state** `dist/` built (`npm ci` exit 0,
`npm run build` exit 0, `git status --porcelain` clean afterwards).

```
i tests 849
i suites 0
i pass 849
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 271230.607159
SUITE EXIT=0
```

Round 0 reported 847 at the same invocation, toolchain and build state; the two
new tests are this round's. **Transliteration, declared:** node's test reporter
prints U+2139 at the head of each summary line. Eight occurrences are rendered
`i` above. Nothing else in any captured output in this document was changed.

The doctor file alone, which is criterion 6's own command:
`node --test test/doctor.test.ts`, same toolchain and build state, **tests 32,
pass 32, fail 0, SKIPPED 0**, duration 18980ms. Round 0 reported 30.

### The claim grep, run against this document

Line-based binding form over the whole work history: **8 matching lines**
(93, 214, 269, 270, 471, 583, 587, 628). Wrap-insensitive form: **8
occurrences**. The gap is zero, so nothing in this document is hidden from the binding grep by
a line wrap.

Four hits are this round's, the fourth being line 628 inside this very
paragraph. Line 471 ("the check can never be promoted to FAIL under full")
describes the effect of witness member 1, and the command that settles it is the red-witness run quoted directly above it: the member is red at
exit 1 on both named tests. Lines 583 and 587 (criterion 10's dead arm) are not
settled by anything of mine; they are settled by the E1.7 hazard review, which
copied `dist/` to a directory with no `package.json` above it and measured
`tiphys doctor` exit 1 with the message from `readOwnVersion` rather than from
`checkKernelArtifacts` (its CR-004). That is a citation, not a re-derivation,
and this round did not reproduce it.

### The gate bundle at the fix-round head, beside round 0's

Run locally before pushing, which is DR-0031's rule. Head `556df2f`, base
`origin/main` at `7b18144`, node v26.6.0, `dist/` built, the same invocation
round 0 recorded (`--phase claude/exit-subject-doctor-kernel-artifacts`, which
the runner requires and which the earlier bundle in this round omitted, so that
first run reported `scope: error` for want of the flag rather than for anything
about the branch).

```
gates: declared 16 applicable 10 verdict 10 green 10 red 0 not-applicable 6 error 0 vacuous 0
BUNDLE2 EXIT=20
```

| | round 0, this branch | fix round 1 |
|---|---|---|
| applicable / green / red / error / vacuous | 10 / 10 / 0 / 0 / 0 | 10 / 10 / 0 / 0 / 0 |
| not-applicable | 6 | 6 |
| `suite` | 847 | **849**, 0 skipped |
| `red-witness` | green, 7 witnesses | green, **9** witnesses |
| runner exit | 20 | 20 |

**The comparator is round 0's SUBJECT-branch bundle, not the record at
`e1/records/branch-local-gate-bundle.json`.** That record was taken on the
BUNDLE branch with `--phase claude/m3-exit-test`, where `red-witness` is
not-applicable because that branch touches no witness; reading it as this
change's round-0 arm would compare 9 applicable against 10 and invent a
difference. Checked rather than assumed: its not-applicable set is
credential-token, citations, scope, deploy, migrations, **red-witness**,
check-dual-review, and this round's is the same list without `red-witness`.

The runner still exits 20, for the same two required-and-explained
not-applicables, `citations` and `scope`. Nothing in this round changes that:
`scope`'s precondition is that the branch matches `^claude/m[0-9]+-p[0-9]+-`,
which the orchestrator's I-3 ruling deliberately made false, and `citations`
has no changed path under its six configured trees.
