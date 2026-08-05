# Adversarial plan review: kernel plan M2, round 1

- Date: 2026-08-05
- Plan under review: `delivery/plan/kernel-plan-m2.md` (DRAFT, nine phases, sixteen requirement rows)
- Plan baseline as declared by the plan: commit 5b8e8ae on `claude/state-p4-start`, `main` at 54ceb6e
- Repository state at review time: `origin/main` at 6ec0482 (M1-P4 merged), M1-P5 stopped at the DR-0012 limit awaiting the owner (`delivery/STATE.md`), M1-P6 built on its branch and unmerged
- Reviewer stance: adversarial, read-only. Nothing in the plan, the source tree or the M1 record was edited. This file is the only file written.
- Verdict basis: kernel plan v1 (header, binding rule, section 1.4, section 3 shared fields and C-1 to C-3, M1 phase sections, D-series, Appendix A), `delivery/requirements/migration-table.md`, blueprint sections 1, 4, 10, 11 and 13, the process doc, tuition T-001 to T-005, CLAUDE.md, the M1 reviews and work histories, and the delivered source at `origin/main`.

## Method

1. Read the M2 plan in full, then v1's cited sections, the migration table, blueprint sections 1 and 4, T-001 to T-005 and CLAUDE.md.
2. Walked the significant M1 defects (V-1, V-2, U-10, F-1, F-2, N-401, CR-002, M1-P5 finding 1, M1-P5 duplicate claim-file divergence) and asked, per defect, which M2 gate catches it and whether the plan's acceptance criteria demonstrate that capability.
3. Verified citations by opening the cited artifact and the cited clause. Sampled 24 citations across requirement rows, blueprint sections, process doc sections, decision records, tuition entries and claims about what M1 delivered.
4. Recomputed the coverage arithmetic mechanically against v1 Appendix A and the migration table.
5. Checked each phase's acceptance criteria for the question "could this pass while the thing it guards is broken", with extra weight on M2-P2 and on the not-applicable paths.
6. Checked conflicts-with, blocked-by and parallelizable against the phases' own files-to-touch lists, and against DR-0011 and DR-0012.
7. Read the M3 plan (read-only, not reviewed here) to judge the nine boundary items and to hunt orphans between the two milestones.
8. Ran convention checks over the plan text.

## VERDICT: FIX-ROUND-NEEDED

Findings: 6 high, 14 medium, 6 low.

The plan is unusually strong on citation hygiene, coverage arithmetic and honest not-proven statements. Its defects cluster in one place: the gates it builds are honest about what they measure, but several of the properties they measure are declared by the very agent under suspicion, and the milestone's own exit test is run in a state where its two hardest gates cannot evaluate. Both are fixable inside the existing phase structure.

---

## High findings

### M2R-001 (high): the red-witness gate's three load-bearing inputs are all self-declared by the implementer, with no cross-check against the phase diff, so T-003's exact defect class recurs by omitting a field

**Claim located.** Section 3, M2-P2 step 3 (line 134): the witness spec declares `class` (`additive`, `destructive`, `classification`), `dangerousState` (`baseline-ref` | `patch` | `mutation`) and an optional `consumesExternalOutput`. Step 5 (line 136) refuses only on: (a) `class` destructive or classification combined with `dangerousState.kind` baseline-ref, (b) an unresolvable behavior, (c) `consumesExternalOutput` declared but not evidenced. Section 1.2 (line 36) parks the honesty of the declaration with the L3 reviewer.

**Why it is dangerous.** Every refusal rule fires on a declaration the implementer wrote. The implementer is the party whose test is under suspicion. Three escapes exist, and each of them is exactly one of M1's real defects:

- Label a destroy witness `additive` and rule (a) never fires. Nothing in the spec ties `class` to what the named tests actually drive. V-1's test (`delivery/review/verification-m1-p3-fix-round.md`, finding V-1) was a destroy test that could not observe data loss; nothing here forces it to be classed destructive.
- Declare `dangerousState.kind: mutation` with a substitution that is not the dangerous one. A mutation that changes an error string makes any test red. The harness records "red against the declared dangerous state" and passes. There is no requirement that the mutation intersect the phase diff, and no requirement that the mutation be recorded in the evidence for a reviewer to judge.
- Simply omit `consumesExternalOutput`, and rule (c) never fires. This is V-2 verbatim: the M1-P3 fix round narrowed a matcher on git's stderr using hand-authored example strings (`delivery/review/verification-m1-p3-fix-round.md`, finding V-2; T-003 lesson 4). T-003's candidate structural check was stated as a detection ("any test whose assertions consist solely of hand-authored fixture strings, WHERE THE BEHAVIOR UNDER TEST CONSUMES EXTERNAL PROGRAM OUTPUT, is flagged"). The plan converts a detection into an opt-in declaration, which the defect it is named after would have skipped.

**Evidence.** T-003 structural consequences section, red-witness bullet. `delivery/review/verification-m1-p3-fix-round.md` V-1 and V-2. M2-P2 criteria 2, 3 and 5 each exercise the declared path only; none stages a witness whose declaration is false.

**Concrete edit.** In M2-P2 step 5, add three refusal rules and matching criteria:

- (d) The `patch` or `mutation` dangerous state must touch at least one file changed in the phase diff, and for `mutation` at least one line inside a changed hunk; otherwise `red` with the reason "declared dangerous state does not intersect the phase diff". Record the applied mutation diff verbatim in the evidence record.
- (e) `class` is derived, not only declared: a witness whose named tests invoke a command the manifest marks destructive (or whose behavior name resolves to a module on a declared destructive-operation list, see M2R-018) must be `destructive`; a declaration weaker than the derived class is `red`.
- (f) `consumesExternalOutput` is required, not optional, when the phase diff touches a module that spawns a subprocess or parses another program's output (a `child_process` / `execFile` / `spawnSync` grep over the changed files is sufficient and deterministic); a witness in that state without the field is `red`.

Add criteria: "a witness declaring `mutation` against a file outside the phase diff is red, and the same witness with the mutation moved into a changed hunk is evaluable (both directions)" and "a phase diff touching a module that spawns a subprocess, with a witness that omits `consumesExternalOutput`, is red (the V-2 shape, staged with the real captured stderr from `delivery/review/verification-m1-p3-fix-round.md` as the capture)".

### M2R-002 (high): witness specs are per-phase and are never re-evaluated, so a registered witness that silently goes green (M1's N-401) is invisible to this milestone

**Claim located.** M2-P2 step 7 (line 138): "If source changed and no witness spec exists for the phase, the gate is `red`". All of M2-P2's criteria evaluate the witnesses of the run at hand. Nothing in the plan creates a standing witness corpus or re-evaluates a prior phase's witnesses at a later head.

**Why it is dangerous.** M1 produced this defect and it was caught by hand. N-401 (`delivery/review/clean-room-m1-p4.md`): witness W9 was measured green against the fixed source while the work history still presented it as a live guard, in the same component where V-1 happened. The reviewer's exact words: "This is the T-003 shape exactly: a registered, green, worthless witness". A red-witness gate that only ever looks at the current phase's own witnesses cannot see this: the witness rots when a LATER change moves the protection somewhere else. Since M2-P2 is the gate that judges every other test, this is the one place where the omission compounds.

**Evidence.** `delivery/review/clean-room-m1-p4.md` N-401, with measured rates (W9 green 3/3 after the fix, W3/W5/W7 red 3/3 under the same procedure). `delivery/review/verification-m1-p3-fix-round-2.md` records the same class twice more: two mutations that produced no witness at all.

**Concrete edit.** Make witness specs durable and re-evaluated:

1. Witness specs live in a repository-level directory (for example `witness/<behavior-id>.json`), not in phase-scoped files, and are added to the standing pre-authorized extras alongside `test/behaviors.json`.
2. Add to M2-P2 step 7: the gate re-evaluates every stored witness whose declared dangerous state touches a file in the current diff. A stored witness that is now GREEN against its own declared dangerous state is `red` with the reason "witness no longer guards its behavior", and the record names the witness and the measured rate. This is bounded work (only witnesses whose dangerous state intersects the diff re-run) and it is the mechanized form of the blunting check M1's reviewers performed by hand.
3. Add a criterion: "a stored witness from an earlier fixture phase, made green by a later change in the same run, is red naming the witness; reverting the later change returns exit 0 (both directions, staged as the N-401 shape)".

### M2R-003 (high): the milestone exit test runs on `main`, where the runner has no branch, no merge base and no diff, so the three diff-scoped gates cannot evaluate and the exit evidence is thinner than section 4 claims

**Claim located.** Section 4 (line 364): "Run by the orchestrator ... on `main`", E2 invokes `gates run --manifest gates.manifest.json --evidence <dir>`. The runner's entire invocation contract is M2-P1 step 6 (line 100): `tiphys gates run --manifest <file> --evidence <dir> [--only <id>...]`. There is no base ref, no head, no branch and no phase id. Three gates need exactly those: M2-P2's precondition is `diff-touches` on `src/` or `bin/` (line 138); M2-P4 resolves "the merge base of the branch against the fetched default branch" and reads the declaration from the merge base (lines 197 and 198); M2-P5 is diff-scoped by M2-D-10 (line 228) and is "not-applicable only when the diff touches no configured document" (line 227). M2-P3 step 4 also needs "the merge-base copy of the registry" (line 167).

**Why it is dangerous.** Two failure modes, both bad:

1. If the implementer defines "the diff" implicitly (HEAD~1..HEAD, or the working tree against HEAD), then on `main` the gates evaluate a squash commit or an empty diff. The scope auditor on `main` is not-applicable by branch pattern (M2-P4 step 6). The red-witness gate on an empty diff is not-applicable. The citation linter on an empty diff is not-applicable. So the milestone's headline evidence, "all gates run green in CI on the kernel repo itself" (blueprint section 13), reduces to: the suite wrapper, the coverage checker and half of credential scoping ran; the three gates that encode the disciplines M1 actually violated said "not-applicable".
2. Section 4's own narrative already contradicts this. Line 375 says the exit test proves "that the TWO gates whose preconditions this repository cannot meet said so explicitly". On `main` there would be at least four, and probably five, not-applicable records. That sentence is wrong as written, and it is the sentence a later reader will quote.

Under M2-C-3 the alternative is worse: a precondition that cannot be evaluated at all is `error`, and E3 asserts zero errors, so a strict implementation makes the exit test unpassable.

**Evidence.** M2-P1 step 6 signature versus M2-P2 step 7, M2-P4 steps 3 and 4, M2-P5 step 4, M2-P3 step 4. Section 4 E2 and the "what this exit test proves" paragraph. `.github/workflows/gates.yml` at `origin/main` confirms there is one `test` job and one `gates` fan-in job, so the CI form of the harness runs in a pull-request context where a base exists, but section 4's milestone run does not.

**Concrete edit.**

1. Extend the runner signature in M2-P1 step 6 to `tiphys gates run --manifest <file> --evidence <dir> [--base <ref>] [--head <ref>] [--phase <id>] [--only <id>...]`, and state that a gate whose precondition kind is `diff-touches` or `branch-matches` reports `error`, not `not-applicable`, when the required parameter is absent. Add a criterion witnessing that.
2. Change section 4 so the milestone run is executed on the M2-P9 pull-request head with `--base main --phase M2-P9`, and record the `main` run as a second, explicitly weaker bundle. The blueprint's exit condition is "all gates run green in CI on the kernel repo itself"; the CI run of a phase pull request is that state, `main` is not.
3. Replace section 4's "the two gates" sentence with a per-gate expected-status table (gate, applicability, expected status on the exit run, unmet precondition if any), and make E3 assert against that table rather than against a count.

### M2R-004 (high): credential scoping can report green while an implementer can still open a pull request, because the scrub is environment-only and the allowlist keeps `HOME`

**Claim located.** M2-P8 intent (line 309): "the executor hands a child an allowlisted environment with no pull-request-capable credential". Step 2 (line 313) enumerates the allowlist as "PATH, HOME, LANG and locale variables, TMPDIR, the `TIPHYS_*` variables ... and nothing else by default", and excludes "`GH_TOKEN`, `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN`, `GH_CONFIG_DIR`, `GIT_ASKPASS`, `GIT_CONFIG_GLOBAL` pointing at a credential store". Criterion 4 (line 324) claims half A is green "in this repository's CI, where an ambient `GITHUB_TOKEN` exists".

**Why it is dangerous.** Three separate defects, and the phase's whole claim is structural rather than instructional, so a false green here is worse than no gate:

1. `HOME` is on the allowlist, so the child still reads `$HOME/.config/gh/hosts.yml` (gh's stored OAuth token), `$HOME/.gitconfig` credential helpers, `$HOME/.netrc` and `$HOME/.git-credentials`. On the orchestrator's own machine an implementer with a scrubbed environment can still run `gh pr create`. Half A checks variable names and reports green.
2. Excluding `GH_CONFIG_DIR` and `GIT_CONFIG_GLOBAL` makes it worse, not better. Both are redirections. Removing a redirection returns the child to the DEFAULT credential path. If the parent had `GH_CONFIG_DIR` pointing at a scratch directory, dropping it sends gh to `$HOME/.config/gh`. Dropping `GIT_CONFIG_GLOBAL` also undoes the M1-P2 discipline that pointed git at a nonexistent global config (v1 M1-P2 criterion 7, EXT-F-02): the child silently regains the user's real `~/.gitconfig`.
3. Criterion 4's premise is false. GitHub Actions does not export `GITHUB_TOKEN` into the job environment; it is available as `secrets.GITHUB_TOKEN` / `github.token` and must be mapped in with `env:`. `.github/workflows/gates.yml` at `origin/main` sets no `env:` block anywhere. So the criterion's stated dangerous state does not exist in CI and the assertion passes trivially. That is a vacuous pass inside the gate whose milestone constraint is "never green by omission".

Note also that half A's `units` is "the number of excluded names checked" (step 5, line 316). Under an allowlist, no excluded name can survive by construction, so the unit count measures a tautology and grows by adding names.

**Evidence.** `.github/workflows/gates.yml` at `origin/main` (no `env:`, no token mapping). `src/spawn.ts` at `origin/main`: `subprocessAdapter.launch` calls `spawnSync(program, args, { cwd, stdio: "inherit" })` with no `env`, so today the child inherits everything, which confirms the seam is real. v1 M1-P2 step 2 and criterion 7 for the `GIT_CONFIG_GLOBAL` discipline the exclusion would undo.

**Concrete edit.**

1. Change step 2: the scrub REDIRECTS rather than drops the credential-store pointers. Set `GH_CONFIG_DIR`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and `HOME` (or `XDG_CONFIG_HOME`) to harness-owned empty directories inside the task directory, and document that dropping them is forbidden because the default paths are the credential stores.
2. Change half A from a name check to a capability check: from inside the constructed child environment, assert that a pull-request-capable credential cannot be resolved (for example `gh auth status` reports no authenticated host, and `git config --get-all credential.helper` is empty). `units` becomes the number of credential SOURCES probed (environment, gh config, git global config, netrc, git-credentials), not the number of names.
3. Rewrite criterion 4 to stage its own dangerous state: the test writes a token-shaped `hosts.yml` into a fake `HOME` and a credential helper into a fake global git config, then asserts the child cannot see either; removing the redirection makes the gate red (both directions).
4. Add a criterion that the same scrub applies to the turn-end hook invocation, which `src/spawn.ts` spawns as a second child.

### M2R-005 (high): the plan's defect grounding stops at M1-P4, so it never read M1's most severe defect or T-005, and it contains no defect-to-gate traceability at all

**Claim located.** Header, process summary (line 8): grounding includes "tuition T-001 to T-004, and the M1 review and work-history record ... read for defects that a gate would have caught mechanically". `T-005` appears zero times in the plan (verified by grep). Section 1.1 (line 30) states M1-P4, M1-P5 and M1-P6 are unmerged.

**Why it is dangerous.** The plan is a gate plan. The single best test of a gate plan is whether it catches the defects the project has actually produced, and two of the most instructive arrived after the plan's baseline:

- M1-P5's dual review found a CRITICAL (`delivery/review/clean-room-m1-p5-second.md` finding 1): a stranded claim file made every future watcher pass silently and permanently report nothing to surface for a genuinely pending signal, while the beacon kept advancing so the liveness guard reported the fleet healthy. `delivery/STATE.md` records the phase as stopped at the DR-0012 limit for a recurring high in one component. No M2 gate touches this class, and the plan does not say so.
- T-005 (2026-08-05) is the root-cause entry for that defect: the same claim-file mechanism was implemented twice and diverged, because the project has no index from MECHANISM to RULE. T-005 names the mechanism index as a kernel artifact, "small, structured data under DR-0006, and it is checkable: a rule with no citation to an investigation, review or tuition entry is not a rule". That checkable half is M2-shaped and the plan neither claims nor disclaims it (see M2R-018).

Beyond the missing inputs, the plan contains no place where a reader can check the claim it makes in its own process summary. There is no table mapping M1's observed defects to the gate that would have caught each one, or to "no gate, stays with L3".

**Evidence.** grep for `T-005` in `delivery/plan/kernel-plan-m2.md` returns nothing. `delivery/review/clean-room-m1-p5-second.md` finding 1 and the delta sections. `delivery/STATE.md` "In flight". `delivery/tuition/T-005-lessons-do-not-propagate-between-phases.md`.

**Concrete edit.**

1. Refresh the header's grounding to T-001 to T-005 and to the M1-P5 review record, and re-baseline the plan on `origin/main` at 6ec0482 or later.
2. Add a subsection 1.5, "What M1's real defects would have hit", as a table: defect (V-1, V-2, U-10, N-401, CR-002, PR-106 glob, M1-P5 finding 1, M1-P5 duplicate-mechanism divergence, F-2 rollback bypass), the M2 gate that catches it, the criterion that demonstrates the capability, or the explicit entry "no gate, stays with the L3 reviewer, recorded in section 4's not-proven list". A gate plan that cannot fill this table honestly is not ready to dispatch, and filling it is the cheapest possible check on the rest of the plan.
3. Move the honest negatives from that table into section 4's not-proven list (F-2's uncaught-exception-bypasses-rollback class and M1-P5's silent-permanent-failure class are both L3 work in M2).

### M2R-006 (high): two M2 pull requests amend the conditions of the authority under which they would be merged, and the plan's fallback is self-authorization

**Claim located.** Section 1.4 (line 63): "Note for the merge gate: DR-0012's clean-review clause 5 says 'the two standing pre-authorized extras', which is correct for M1; from M2-P1's merge onward the authoritative list is CLAUDE.md's, and it names three." Section 3 (line 86): the orchestrator "either obtains owner sanction for those two or records why the standing-extras list and the gate list are not owner-reserved matters". M2-D-12 (line 402) flags the CLAUDE.md edits vetoable.

**Why it is dangerous.** DR-0012 is a decided owner decision record and is the only basis on which anything merges while the owner is away. Its clause 5 is a merge precondition stated numerically, and its limits say "Never merge anything that changes an owner-reserved matter: a decision record, the plan's binding conventions, merge authority itself". CLAUDE.md IS the record of the binding conventions (CLAUDE.md preamble: "This file is the agent-rules single source for this repository until the M3 gate registry replaces it"). So M2-P1, the phase every other phase is blocked by, is a pull request that changes a binding-convention record and simultaneously redefines a clause of the grant it merges under. The plan's alternative, letting the orchestrator record why this is not owner-reserved, is the beneficiary ruling on its own authority, which is precisely the shape DR-0012's limits exist to prevent. CLAUDE.md's Never list also forbids reopening a decided record and directs the agent to raise a new one.

**Evidence.** `delivery/decisions/DR-0012-delegated-merge-authority.md`, clause 5 and the limits section. CLAUDE.md preamble and Never list. M2-P1 files-to-touch (line 104) includes `CLAUDE.md (edit)`; M2-P3 files-to-touch (line 172) includes `CLAUDE.md (edit, gate list)`.

**Concrete edit.** Replace the section 1.4 note and the section 3 paragraph with an owner decision, raised before M2-P1 dispatches, at the next free number after DR-0013 (claimed by the M3 plan): "amend DR-0012 clause 5 to read 'the standing pre-authorized extras named in CLAUDE.md at the merge base', and sanction the CLAUDE.md edits of M2-P1 and M2-P3 as in-scope for delegated merge". List it in section 6 as a blocking owner action for M2-P1, not as a note. If the owner is unreachable, the honest fallback is that M2-P1 and M2-P3 wait for the owner while the other phases proceed, not that the orchestrator records a justification for itself.

---

## Medium findings

### M2R-007 (medium): applicability is unstated for four of the eight gates, and only one gate is explicitly `required`, so "every required gate is green" is nearly vacuous

**Claim located.** M2-P3 step 7 registers `suite` "as `required`". M2-P4 step 6 registers the scope auditor "as `conditional`". M2-P7 step 5 registers both verifiers "as `conditional`". M2-P2 step 7, M2-P5 step 6, M2-P6 step 6 and M2-P8 step 7 say only "register the gate" and never state the `applicability` value that M2-P1 step 5 makes a required manifest field. Section 4 E3 and M2-P9 step 2 assert "every `required` gate is `green`".

**Why it is wrong.** The exit test's central assertion is quantified over a set the plan never fixes. As written, an implementer could register red-witness, citations, coverage and credentials as `conditional` and the milestone would exit with exactly one required gate green. This is the same failure shape M2-C-2 is written to prevent, one level up.

**Concrete edit.** Add a table to section 1.4 or section 3 listing all eight gates with `id`, `unitLabel`, `applicability`, precondition kind, and expected status on the kernel repository. Bind each phase's registration step to that table. Recommended values: `suite`, `citations`, `coverage`, `credentials` and `red-witness` are `required` on a phase pull request; `scope` is `required` when `--phase` is supplied; the two verifiers are `conditional`.

### M2R-008 (medium): the suite wrapper's discovery parity enumerates from the configured glob, so it cannot catch the dangerous state its own criterion 2 names

**Claim located.** M2-P3 step 3 (line 166): "independently enumerate test files from the configured glob and compare with the file set the reporter actually reported". Criterion 2 (line 175) stages "the PR-106 dangerous state: a glob that drops files once subdirectories exist".

**Why it is wrong.** If the wrapper enumerates with the same glob the runner uses, a defective glob drops the same files on both sides and parity holds. The word "independently" is doing work the mechanism does not perform. PR-106's real hazard, recorded in v1 M1-P1 step 2 and live in `package.json` today (`"test": "node --test \"test/**/*.test.ts\""`), is precisely that the pattern is the thing that can be wrong.

**Evidence.** `package.json` at `origin/main`, scripts.test. v1 M1-P1 step 2 (PR-106).

**Concrete edit.** Change step 3 to: enumerate by walking the declared test ROOTS (`test/`) for a declared filename suffix (`.test.ts`), never by expanding the runner's own pattern, and compare that set with the reporter's file set. Rewrite criterion 2 as: "a test file placed in a new subdirectory `test/sub/x.test.ts`, which the configured runner pattern fails to select, leaves the bare runner at exit 0 and makes the wrapper exit nonzero naming the file; correcting the pattern returns exit 0 (both directions)".

### M2R-009 (medium): M2-C-4 and M2-C-5 contradict each other, and M2-P2 criterion 6 witnesses a state the harness's own isolation rule makes unreachable

**Claim located.** M2-C-4 (line 54): a gate that runs tests against another state does so "in a scratch clone they create and own", and the caller's tree is byte-identical afterwards. M2-C-5 (line 55): the pin covers "declared source roots" at run start and end, and any difference including mtime makes the run non-evidence. M2-P2 criterion 6 (line 147): "While the harness is running, a helper rewrites one file under the pinned roots with byte-identical content ... the record's status is `error` ... (T-004's exact case; a content-only pin cannot pass this criterion)".

**Why it is wrong.** If the pinned roots are inside the harness's own scratch clone, no external party can write to them, so criterion 6 can only be satisfied by the test reaching into the harness's private temp directory, which is a state that cannot occur in production. That is the T-003 defect shape ("a concurrency path where no contention can occur") in the phase whose job is to prevent it. If instead the pinned roots are the CALLER's tree, the pin proves nothing about what actually ran, because the run happened in a clone taken at the start.

T-004's own case is not reproduced either way: T-004 is about a SHARED worktree, which M2-C-4 abolishes.

**Concrete edit.** Split the two obligations and say what each proves:

1. The pin covers the scratch clone's source roots and is taken at clone time and at run end. Its purpose is T-004 lesson 3, "a run that cannot name what it executed is not evidence". State that explicitly, and drop the claim that it reproduces T-004's incident.
2. Criterion 6 becomes: "with a documented in-harness hook that rewrites one file in the scratch clone with byte-identical content between the start and end pins, the record's status is `error` and the reason names the path and the differing field (mtime); a content-hash-only pin cannot pass this criterion". Name it as a mechanism witness, not as a reproduction of T-004.
3. Add a separate criterion for the caller-tree property M2-C-4 actually asserts, which criterion 7 already covers.

### M2R-010 (medium): M2-C-5 binds the suite wrapper, which cannot satisfy it, because the pinning module is built by a phase declared parallel to it

**Claim located.** M2-C-5 (line 55): "Any gate that executes a test suite records a pin manifest". M2-P3 executes the suite. `src/gates/pin.ts` is created in M2-P2 (line 140). M2-P3's files-to-touch (line 172) does not include it, M2-P3's blocked-by is "M2-P1 merged" (line 185), and M2-D-03 declares M2-P2 to M2-P8 "pairwise disjoint in source".

**Why it is wrong.** Either M2-P3 silently violates a constraint the plan declares binding on every implementer, or it consumes a module a concurrently running phase owns. Both break the disjointness claim that the parallelism decision rests on. None of M2-P3's eight criteria mentions a pin.

**Concrete edit.** Move `src/gates/pin.ts` and its tests into M2-P1 (it is spine, not witness machinery), add `pin` to the `GateResult` contract there, add M2-P3 criterion "the wrapper's record carries start and end pins over the declared source and test roots and they are equal; a byte-identical rewrite between them makes the record `error`", and correct M2-P3's blocked-by and the disjointness statement in M2-D-03.

### M2R-011 (medium): the exit test's falsifiability overrides require shipping a documented switch that makes a production gate report a false green

**Claim located.** M2-P9 step 3 (line 343): "support documented environment overrides that (a) force one gate to report green with units 0 and (b) flip one `required` gate's precondition to unmet".

**Why it is dangerous.** M2-P1 step 2 makes a green/units-0 record impossible to construct through the kernel constructor. To honour override (a), an implementer must add a code path that bypasses that invariant. The kernel then ships an environment variable whose documented effect is "make a gate lie", inside the package whose purpose is deterministic assurance. It is also a weaker witness than the plan thinks: it exercises the override path, not the path an externally authored gate would take.

**Concrete edit.** Replace step 3 with: "Falsifiability is exercised against a fixture manifest, not against production gates. `scripts/m2-exit-test.sh --self-test <dir>` runs the same assertion code over a fixture manifest containing (a) a fixture gate that writes its own result record with status `green` and `units` 0, and (b) a `required` fixture gate whose `file-exists` precondition names an absent file. Under each the harness exits nonzero naming the gate. No production gate carries an override flag." Update criterion 3 and section 4 E5 to match. This also strengthens the witness, because M2-D-07 makes gates subprocesses that author their own records, so a hand-written record file is the realistic dangerous state.

### M2R-012 (medium): the runner reports success having run nothing, from M2-P1's merge until M2-P2 lands

**Claim located.** M2-P1 step 5 (line 99) creates `gates.manifest.json` "initially with zero gate entries"; step 8 wires `gates run` into CI immediately. The runner's exit rule (step 6) is "0 only when there are zero `red`, zero `error`, and every `required` gate is `green`", which an empty manifest satisfies.

**Why it is wrong.** M2-C-2 says "No gate reports green for work it did not do". The runner is exempt from its own constraint at the aggregate level, and the exemption is live on every kernel pull request for at least one phase.

**Concrete edit.** Add to step 6: "the runner exits nonzero with reason `no applicable gate` when the count of applicable gates is zero, and `summary.json` records `applicable 0` as an error condition". Add a criterion for it. If M2-P1 must merge with an empty manifest, declare a placeholder gate that checks the manifest validates against its own schema, so the first CI run measures something real.

### M2R-013 (medium): DR-0011 does not authorize seven parallel implementation phases, and the shared manifest file violates its own condition 1

**Claim located.** M2-D-03 (line 393): "Decided DR-0011 (maximum safe parallelism, five binding conditions) governs M2, superseding v1 section 1.4 item 5's blanket 'off until M5' for this milestone ... M2-P2 to M2-P8 are pairwise disjoint in source and share only two append-only files."

**Why it is wrong on the record.** DR-0011's decision section enumerates the authorized concurrent streams: "M1-P4 implementation (already running), M1-P6 build in parallel on disjoint files, detailed planning of M2, detailed planning of M3". It authorizes no parallel implementation phases beyond M1-P6, and its recommendation is "Option 2, scoped to M1-P6 only". Its condition 1 is "A pairwise files-to-touch disjointness check is performed and recorded before each parallel dispatch, and any overlap cancels the parallel start". Seven phases each appending to `gates.manifest.json` is an overlap on every pair; the plan asserts the standing-extras carve-out, but no decision grants it. There are also three shared files now, not two (M2-P2 line 153 says two; section 1.4 line 63 says three).

Two further costs the plan does not price: DR-0012 requires two cross-model clean-room reviews per pull request, so seven concurrent phases is fourteen reviews, and DR-0011's own evidence section says "the constraint here has been review throughput, not implementer throughput". `delivery/STATE.md` currently shows one phase stopped and the milestone blocked behind it.

**Concrete edit.** Either (a) raise a decision extending DR-0011 to M2 implementation phases with the append-only carve-out stated explicitly, or (b) restate M2-D-03 as a bounded claim: at most two phases in flight at once, chosen so their manifest entries are appended in merge order, with the pairwise check recorded per pair as condition 1 requires. Correct "two append-only files" to three in M2-P2's conflicts-with line.

### M2R-014 (medium): the citation linter's root-resolution rule is unspecified, and its one real-document criterion is not satisfiable as written

**Claim located.** M2-P5 step 2 (line 225) declares `roots` and `externalRoots`; step 3 (line 226): "A citation resolving under a declared external root is recorded `unverifiable-external`". Criterion 4 (line 236) runs against the real text of `delivery/plan/kernel-plan-v1.md` and expects the firstmate citations to be counted external.

**Why it is wrong.** The citations in question are written as bare relative paths: `bin/fm-lock.sh:47-85` and `bin/fm-teardown.sh:678-712` (v1 M1-P3 step 1 and M1-P4 step 5). This repository HAS a `bin/` directory. Nothing in the config shape says how a bare path is assigned to a root, so `bin/fm-lock.sh:47-85` resolves under the local root `.` as a missing file (red) and under the firstmate root as external, with no stated tie-break. Criterion 4 asserts one of those outcomes without specifying the mechanism that produces it, and M2-P5 step 5 forbids editing the cited document, so prefixing the citations in v1 is not available to the implementer either.

Related: the vacuous-document rule (step 4) reds any configured document with zero recognized citations. `delivery/STATE.md`, tuition entries and work histories legitimately contain none, so the `documents` glob becomes load-bearing and can be shrunk until the gate passes.

**Concrete edit.**

1. In step 2, give each root an explicit `match` (a list of path globs). External roots match first and their globs are stated in the config (`bin/fm-*.sh`, `bin/fm-session-lock-lib.sh`). A path matching more than one root is a config error, reported as `error`, never guessed.
2. Restate criterion 4 to name the glob and both directions, as it already does.
3. Narrow the vacuous rule: a document is `red` for zero citations only if it is in a declared `citation-required` subset (plans, reviews, verifications); other configured documents with zero citations contribute zero units and are recorded, not red. State that the `documents` glob is committed configuration and its narrowing is a scope-audited change.

### M2R-015 (medium): the coverage checker's bucket kinds do not produce the milestone totals criterion 1 asserts

**Claim located.** M2-P6 step 2 (line 254) declares `bucketKinds` as phase (`M[0-9]+-P[0-9]+`), milestone (`M[0-9]+`), decision, and `parked`. Criterion 1 (line 261) asserts that against the real artifacts "the record's counts match the appendix's own stated totals (M1 11, M2 16, M3 74, M4 13, M5 1, parked 0)".

**Why it is wrong.** I recomputed v1 Appendix A mechanically: 115 rows, and the eleven M1 rows are all written as `M1-P1` through `M1-P5`, while M2 to M5 rows are bare milestones. Under the declared bucket kinds the gate produces kind counts (phase 11, milestone 104), not milestone counts. Producing "M1 11, M2 16, M3 74, M4 13, M5 1" requires a normalization rule (map a phase bucket to its milestone prefix) that the plan does not state.

**Evidence.** Mechanical count over `delivery/plan/kernel-plan-v1.md` Appendix A: 115 rows; buckets M3 74, M2 16, M4 13, M1 11, M5 1; the M2 set is exactly the sixteen rows the M2 plan's Appendix A lists; the migration table's 115 ids and the appendix's 115 ids are identical sets with no additions or omissions. The plan's coverage arithmetic is correct; only the checker's bucket model is.

**Concrete edit.** Add to step 2: "each bucket kind declares a `milestone` extraction (a capture group), and the record reports counts per milestone as well as per kind". Add a criterion: "a bucket value `M1-P3` is counted under milestone M1 and kind phase; a row whose bucket matches no kind is red naming the row".

### M2R-016 (medium): M2-P8's files-to-touch does not name the file it edits, in the milestone that builds the scope auditor

**Claim located.** M2-P8 files-to-touch (line 319): "the executor adapter module delivered by M1-P4 (edit, verify the seam first)".

**Why it is wrong.** The scope auditor (M2-P4) compares changed paths against a declaration of literal paths, and the declaration is read from the merge base so it cannot be widened from inside the phase. A files-to-touch entry that is a description rather than a path cannot be projected into `delivery/plan/phases/M2-P8.json`, so either the phase is un-auditable or the orchestrator invents the path when authoring the projection, which is the drift M2's own section 2 item 3 warns about. The plan already knows the answer: section 1.1 (line 26) names `src/spawn.ts`, `src/hooks.ts`, `src/task.ts`, and the adapter is in fact `subprocessAdapter` in `src/spawn.ts` at `origin/main`.

**Evidence.** `src/spawn.ts` at `origin/main`, `export const subprocessAdapter: ExecutorAdapter` and its `spawnSync` call with no `env` option.

**Concrete edit.** Replace the entry with `src/spawn.ts (edit: the subprocess adapter's child environment; verify the seam first)`, and add `src/hooks.ts (edit only if the turn-end hook invocation needs the same scrub)`. Add a plan-wide rule in section 1.4: every files-to-touch entry in M2 is a literal path or a literal directory, because the phase declaration projection is generated from it.

### M2R-017 (medium): the deploy and migration verifiers apply T-003's captured-output rule to the GitHub API but not to the platform API they exist for, and the migration comparison cannot see the drift it is named after

**Claim located.** M2-P7 steps 2 and 3 (lines 283 and 284) and criteria 1 to 6; risk 1 (line 429) accepts the residual risk. Contrast M2-P8 step 6 (line 317), which requires capturing real API responses before writing any assertion and escalating on divergence.

**Why it is insufficient.** The plan itself identifies M2-P7 as the phase most likely to repeat M1-P3, and its mitigation is that the fixtures exercise failure directions. But every fixture is an in-process `node:http` stub written by the same implementer, so the assertions describe what the stub does, which is T-003 lesson 4 exactly. The asymmetry with M2-P8 is unexplained: the same rule is applied where the API is GitHub and dropped where the API is the deploy platform.

Second defect, independent of the stub question: step 3 compares "the two sorted id lists". The failure the process doc records is "migrations being skipped by a flake while the code deployed anyway", which id comparison catches, but the other classic drift, a migration file edited after it was applied, produces identical id lists and a green verdict. The blueprint's contract is "applied migrations MATCH repo migrations post-merge".

**Concrete edit.**

1. Add to M2-P7 step 2 the same rule M2-P8 step 6 carries: at least one real captured response from a real deployment platform, recorded verbatim with provenance in the work history, is the source of the `statusPath`, `readyValue` and `failureValues` defaults and of the parser test fixtures. If no platform is reachable at implementation time, the phase ships the record shape and the preconditions only, and the poller's semantics move to M4 with the pilot. That is the scope-down the plan names and rejects at line 429; it should be taken for the poller, and not for the rest of the phase.
2. Add to step 3: where the applied inventory exposes a checksum or hash per migration, compare it; where it does not, record `detail: id-comparison only, content drift not detectable with this inventory command` and state that limitation in section 4's not-proven list. Add a criterion for equal ids with a differing checksum being red where checksums are available.
3. Add the migration counterpart of criterion 7 (a fabricated migrations location proving the precondition is really evaluated), so both verifiers have the not-hardcoded witness and not just the deploy one.

### M2R-018 (medium): two of tuition's structural consequences are claimed by neither M2 nor M3, which section 2 exists to prevent

**Claim located.** Section 2 (lines 70 to 80) lists nine boundary items, claimed or disclaimed. Neither list contains T-005's mechanism index nor T-003's fourth structural consequence.

**Why it is wrong.** I read the M3 plan: "mechanism index" appears nowhere in it (the single hit is an unrelated fixture filename), and "destructive" appears nowhere in it. T-005 says the mechanism index "is a kernel artifact ... small, it is structured data under DR-0006, and it is checkable: a rule with no citation to an investigation, review or tuition entry is not a rule". T-003's fourth consequence says "any kernel command that can destroy work must state its destructive authority explicitly in its contract, and force semantics must never be inherited implicitly". Both are exactly the kind of item section 2 was written to make visible, and both are currently invisible to both milestones. The second one also feeds M2R-001's derived-class rule.

**Evidence.** grep over `delivery/plan/kernel-plan-m3.md` for `mechanism index` and `destructive`, both empty. T-005 structural consequences. T-003 structural consequences, fourth bullet.

**Concrete edit.** Add two items to section 2:

- Item 10, mechanism index: the index itself and its writer are M3 (tuition flow). M2 claims the checkable half only if it is cheap: a `mechanism-index` gate is out of scope for M2, so M2 DISCLAIMS it, records that the M3 planner must claim it, and flags that if M3 does not, it is an orphan.
- Item 11, destructive-authority declaration: M2 claims the machine-readable half, a `destructiveCommands` list in `gates.manifest.json` consumed by M2-P2's derived witness class (M2R-001 edit e), and disclaims the contract-prose half to the M3 implementer brief.

### M2R-019 (medium): M2's cross-references to M3 phase ids are wrong, and v1's Appendix A now names the wrong M2 phases

**Claim located.** Section 2 item 1 (line 72): "M3-P3 builds the canonical registry"; section 4 not-proven item 2 (line 380): "the registry that carries it, are M3-P3"; section 2 item 2 (line 73): "Report contract and status line (R-084 to R-089a). M3-P1"; item 7 (line 78): universal-quantifier linting "is M3-P1".

**Why it is wrong.** In the concurrently drafted M3 plan, the canonical gate registry is M3-P2, the report and work-history contracts are M3-P4 (which is where the universal-quantifier check actually sits), and M3-P1 is the schema foundation. Separately, v1's Appendix A notes still use v1 section 5's outline numbering: "R-015b | M2 | red-witness harness (M2-P1)", "R-048 | M2 | full-suite wrapper (M2-P2)", "R-020 | M2 | scope auditor (M2-P3)", "R-094 | M3 | canonical gate registry (M3-P3; manifest seed M2-P5)". Under the new decomposition M2-P1 is the spine, M2-P2 is red-witness, M2-P5 is the citation linter. Every one of those parentheticals now points at the wrong phase, and the M2 plan's M2-D-01 states only that no row moves.

**Concrete edit.** In section 2, replace M3 phase ids with phase NAMES plus a note that ids are reconciled by the orchestrator before M3 dispatch. In M2-D-01, add: "v1 Appendix A's parenthetical M2-Pn notes refer to v1 section 5's outline numbering and are superseded by this plan's Appendix A; the orchestrator updates those notes in the same revision that approves this plan." Same for R-094's `M2-P5` seed note, which is now M2-P1.

### M2R-020 (medium): M2-P1 and M2-P3 both edit `package.json` and neither declares the conflict

**Claim located.** M2-P1 files-to-touch (line 104): "package.json (edit only if step 4's finding requires a build or files change)". M2-P3 files-to-touch (line 172): "package.json (edit, add the gate script)". M2-P1's conflicts-with (line 121) names M2-P3 for CLAUDE.md only; M2-P3's conflicts-with (line 184) names M2-P1 for CLAUDE.md only.

**Why it matters.** The conflicts-with field is the input to DR-0011 condition 1 and, from M5, to the conflict pre-pass. A plan that builds the scope auditor should have accurate file declarations; an inaccurate one here is the seed of a false-negative disjointness check.

**Concrete edit.** Add `package.json` to both conflicts-with lines. While there, add `gates.manifest.json` and `test/behaviors.json` to every phase's conflicts-with, or state once in section 1.4 that the three standing extras are shared by construction and are excluded from pairwise disjointness by the decision raised in M2R-013.

---

## Low findings

### M2R-021 (low): the relationship between the `error` count and the `vacuous` count is undefined

M2-P1 step 7 lists both `error` and `vacuous` in `summary.json`; criterion 4 says a units-0 green is "recorded `error`" AND "the summary's `vacuous` count is 1". Whether such a record is counted in both totals is unstated, so E3's "zero `error`, zero vacuous passes" may double-count or may leave a gap. Edit: state that `vacuous` is a subset of `error` and that `error` is the sum, and add it to criterion 2's arithmetic.

### M2R-022 (low): the parity arithmetic drops R-048's "did-not-run" term

R-048 and process doc section 2e item 8 state the identity as `passed+failed+skipped+did-not-run == discovered`. M2-P3 criterion 1 uses `pass + fail + skipped + todo + cancelled == total`. Node's `total` counts tests the runner saw; a test that never registered (guarded by a condition at load time) is in neither side of the identity, which is the bucket the rule names. Edit: state the mapping from the rule's four terms to the reporter's five counters, name `cancelled` as the "did-not-run" carrier, and add the registry-resolution check as the compensating control for tests that never register, which step 4 already provides.

### M2R-023 (low): criterion 12 of M2-P1 cannot observe requiredness from the artifact it names

"The phase PR shows exactly one required check named `gates` ... (inspection of the check-runs API output)". The check-runs API reports checks that ran, not which contexts a ruleset requires; requiredness lives in the ruleset (DR-0004 item 2), and CLAUDE.md warning 6 records that `gh` is absent locally. Edit: split into two observations, "the check-run list on the PR contains exactly the contexts it contained before this phase (`test (26)` and `gates`)" and "the ruleset's required contexts are unchanged, evidenced by `gh api repos/.../rulesets`, recorded in the work history or marked CI-deferred with a reason".

### M2R-024 (low): section 6 item 2 leaves a decision-record number unassigned that the M3 plan has since claimed

Open question 2 says the number "is deliberately not fixed here" because DR-0012 was taken by another session. The M3 plan now raises DR-0013 for validator implementation. Edit: state "the next free number after DR-0013" and have the orchestrator assign at reconciliation, so two concurrent plans do not both land a DR-0013.

### M2R-025 (low): R-020's "verified before editing" half is not discharged and is not in the residue table

R-020 reads "Files-to-touch is verified before editing and enforced after". M2-P4 delivers the enforcement half only; the verification half is an implementer-brief duty (M3). The plan has an excellent residue mechanism (Appendix A, residue notes) and uses it for R-032, R-089b and R-008. Edit: add an R-020 residue row naming the implementer-brief clause at M3 as the other half.

### M2R-026 (low): from M2-P9 onward, CI runs the whole gate set twice per pull request

M2-P1 step 8 adds `gates run` to the `test` job; M2-P9 step 4 adds the exit-test harness to the same job, and the harness's step 1 runs `npm ci`, `npm run build` and `gates run` again. With two suite-executing gates in the set (risk 5), that doubles the most expensive part of every future run. Edit: either have the CI step invoke the harness only (and let it be the single caller of `gates run`), or have the harness detect an existing evidence directory for the same head and assert over it rather than re-running.

---

## Probes run

Named so that an empty result is distinguishable from an unchecked area.

1. **Would these gates have caught M1's real defects?** Walked V-1 (silent data loss on destroy), V-2 (retry signature dropping the real transient), U-10 (overstated determinism), F-2 (thrown error bypassing rollback), N-401 (witness silently green), CR-002 (registry rot), PR-106 (glob dropping files), M1-P5 finding 1 (stranded claim, permanent false health), and the M1-P5 duplicate claim-file divergence. Results: V-1's test-worthlessness is genuinely demonstrated by M2-P2 criterion 2, which is the single best thing in the plan; CR-002 is genuinely closed by M2-P3 criterion 3; PR-106 is claimed but not achievable as specified (M2R-008); V-2 is caught only if the implementer opts in (M2R-001); N-401 is not caught at all (M2R-002); U-10 is caught by M2-P2's determinism rule and criterion 4, which is a real gain; F-2, M1-P5 finding 1 and the duplicate-mechanism divergence are outside every M2 gate and the plan does not say so (M2R-005, M2R-018).
2. **Citation audit.** Verified: process doc section 2e item 8 (wrapper wording, parity formula, "never infer success from a log tail"), section 4 ("never assume the platform did its job", both incidents), section 0 and 2a (implementer never creates PRs), section 1a, 1c, 1d, section 3 (scope audit as a review step), section 7 (final report table). Blueprint section 4 rows for red-witness, wrapper, scope auditor, citation linter, coverage checker, deploy verifier, migration verifier, credential scoping; section 1 placement rule; section 10 point 4; section 11 rows; section 13 M2 row. v1: SC-011 disposition, D-7, EXT-F-05 test accounting, M1-P1 step 2 (PR-106), M1-P4 grounding (FM-060) and step 5 (FM-035, FM-038 fail-closed), M1-P2 EXT-F-08 profiles, the firstmate external citations. Decision records DR-0004 item 4, DR-0006, DR-0007, DR-0011, DR-0012. Tuition T-003 (dangerous state, hand-authored fixtures) and T-004 (the 42.8-second byte-identical rewrite). Review artifacts: CR-002 in `clean-room-m1-p1.md`, deviation 1 in `clean-room-m1-p2.md`, U-10's measured rates 11/20, 8/20, 6/20 in `verification-m1-p3-fix-round-2.md`. Every one of these supports the claim it decorates. The only citation defects found are forward references to M3 phase ids (M2R-019) and the missing T-005 (M2R-005). This is the strongest part of the plan.
3. **Coverage audit.** Recomputed mechanically: v1 Appendix A has exactly 115 rows; bucket counts M1 11, M2 16, M3 74, M4 13, M5 1, parked 0; the id sets of the migration table and the appendix are identical with no additions or omissions; the sixteen M2 rows in the plan's Appendix A are exactly v1's sixteen M2 rows. Per-phase counts stated (0, 5, 1, 2, 2, 2, 3, 1, 0) are each correct against the table. Spot-checked eight rows against the phase claiming them (R-008 to M2-P8, R-010b and R-025 to M2-P5, R-020 and R-058 to M2-P4, R-023 and R-089b to M2-P6, R-048 to M2-P3, R-056b to M2-P2, R-032/R-068/R-069 to M2-P7): every mapping matches the migration table's rule text and target form. No row is silently moved. This probe came back essentially empty-handed; only the R-020 residue (M2R-025) and the stale v1 parentheticals (M2R-019) surfaced.
4. **The self-identified risk (M2-P7).** Judged inadequate as mitigated, and the plan's own rejected alternative is closer to right for one half of the phase. See M2R-017. The migration verifier should stay in M2 (its inputs are local and its drift semantics are checkable); the deploy poller's response semantics should either be built from a captured real response or deferred to M4 with the pilot.
5. **Testability of acceptance criteria.** Walked all nine phases' criteria asking "could this pass while the thing it guards is broken". Found: M2-P8 criterion 4 (M2R-004), M2-P3 criterion 2 (M2R-008), M2-P2 criterion 6 (M2R-009), M2-P6 criterion 1 (M2R-015), M2-P1 criterion 12 (M2R-023), M2-P9 step 3's overrides (M2R-011). The not-applicable criteria were checked specifically: M2-P7 criterion 7's fabricated-configuration direction is a genuinely good design and should be copied to the migration verifier; M2-P1 criteria 5 and 6 give SC-011 and M2-C-3 real teeth in both directions; M2-P8 criterion 5 correctly refuses to let an absent owner token read as green. M2-P2's criteria 1 to 5, 7 and 8 are well-formed and mostly both-directions; the weakness there is upstream of the criteria, in what the spec lets an implementer declare.
6. **Cross-phase conflicts and ordering.** Found the undeclared `package.json` overlap (M2R-020) and the undeclared `src/gates/pin.ts` dependency of M2-P3 on M2-P2 (M2R-010). The declared conflicts (CLAUDE.md between M2-P1 and M2-P3, the workflow between M2-P1 and M2-P9, `scripts/` between M2-P8 and M2-P9) are accurate. blocked-by fields are accurate. The CLAUDE.md interaction with DR-0012 is M2R-006; the parallelism claim is M2R-013.
7. **Boundary with M3.** All nine items judged. The SUBSTANCE of the split is right in every one: manifest versus registry, report contract to M3, plan schema to M3 with the superset recommendation (which the M3 draft has in fact adopted), schemas directory under `src/gates/` per CLAUDE.md's reservation, validator technology deferred to a decision record M3 has now raised as DR-0013, fix-round verification to M3's assurance modes, universal-quantifier linting to M3's report contract, tuition flow to M3, credential scoping's owner half to DR-0004 and M4. Two defects: the M3 phase ids are wrong in three places (M2R-019), and two tuition-derived items are claimed by neither plan (M2R-018).
8. **Conventions.** Clean. `grep -P '[^\x00-\x7F]'` over the plan returns nothing; no em dashes; no "works correctly" or equivalent vagueness; npm only; English only; every acceptance criterion is falsifiable in form (their defects are in what they measure, not in whether they can fail). Falsifiable-in-both-directions is used consistently and well.

Probes that came back empty-handed: the coverage audit (probe 3) beyond two cosmetic items; the convention sweep (probe 8); the blocked-by chain; the citation audit for everything except forward references. The M2-C-1 verification-first construct is applied to every phase that consumes an M1 contract, and the plan's treatment of unbuilt M1 phases (risk 7, and M2-C-1 itself) is the correct shape.

## Honest failures of this review

1. **I did not execute anything.** This is a plan review, and every finding is derived from documents plus read-only inspection of `origin/main`. Where I assert a mechanism (GitHub Actions not exporting `GITHUB_TOKEN`; `tsc` and JSON emission; gh reading `$HOME/.config/gh`), I am asserting from knowledge of those tools, not from a run in this environment. M2R-004's point 3 in particular should be confirmed by inspecting one real CI job's environment before the finding is applied; the finding survives either way, because points 1 and 2 do not depend on it.
2. **I read the M3 plan only in the places the boundary and orphan probes needed.** My statements about where the registry, the report contract and the universal-quantifier check sit in M3 come from its headings and a targeted grep, not a full read. If the M3 plan is revised concurrently, M2R-019's specifics can move.
3. **I did not attempt to price the plan.** Wall time, CI minutes and review load are named in the plan's risks 2 and 5 and I did not challenge the numbers, beyond noting in M2R-013 that fourteen cross-model reviews is what seven parallel phases costs under DR-0012.
4. **I did not verify every one of the plan's 100-plus internal cross-references**, only the 24 citations sampled in probe 2 plus the ones a specific finding depends on. A citation defect outside that sample is possible.
5. **I formed no independent view on whether the minimal in-repo JSON Schema validator (M2-D-04) is the right call.** The loud-failure-on-unknown-keyword rule makes it honest, and the decision is reversible behind one module interface, so I let it stand. If it is wrong, it is wrong in M3-P1's direction and the M3 review is the place for it.
6. **M2R-002's proposed re-evaluation rule has a cost I did not bound.** Re-running stored witnesses whose dangerous state intersects the diff could be expensive on a large diff. I chose the diff-intersection scoping to bound it, but the right ceiling should be measured by the implementer, and the plan should record the measurement rather than inherit my guess.
