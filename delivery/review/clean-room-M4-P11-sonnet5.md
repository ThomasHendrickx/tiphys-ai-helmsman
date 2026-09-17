# Clean-room review: M4-P11, the declared single-family review exception

- reviewer model: Claude Sonnet 5 (claude-sonnet-5)
- framing: EVIDENCE INTEGRITY. Every claim treated as unproven until run myself.
- subject: branch `claude/m4-p11-single-family-exception`, head `399953c026d608d973d0d0d3d9889f362e5a83fc`
- stated base for the task: `3b40118` (current real `main` tip). This is NOT
  the phase's actual merge base: the phase is declared to depend on M4-P10
  merged (delivery/plan/kernel-plan-m4.md:1724) and M4-P10 has not reached
  `main`. The branch was cut from M4-P10's own branch at `6a5e5af`. So the
  phase's own diff is `git diff 6a5e5af...399953c`, not the diff against
  `3b40118`, and that is the diff this review audits for scope and content.
  This is stated up front because getting it wrong would make every scope and
  content finding wrong.

## First check: the fix-round contract's item 3 (what the derivation did NOT cover)

The work history states two "what the derivation did NOT cover" sections, one
for the general call-site enumeration (lines 479-508 of
delivery/work-history/m4-p11.md) and a second one specifically for the
red-witness mechanism (lines 642-656). Both name concrete exclusions:
`.github/workflows/`, external consumers of `summary.json`, `test/gates.test.ts`
content, `schemas/report.schema.json`'s `amber`, non-git projects; and for the
second, the content of the 39 witnesses, `250ms`, other rules in
`src/witness/run.ts`, the base's 4 pre-existing errors, and CI itself.

Judgement: this is honest and it is not a formality. Item 1 of the first list
("the exception arm does not run in CI today" because `check-dual-review` is
registry-only, not in `gates.manifest.json`) is a real, load-bearing admission
that undercuts a naive reading of "this gate is required" -- it is required by
the registry table, not by the CI manifest, a distinction CLAUDE.md's R-094
section already documents as a known gap. Nothing in the two "not covered"
sections looks scoped to make a search return an empty result that hides a
defect; if anything the second one directly leads to the discovery that forms
this review's central finding (see below), rather than away from it.

## Verified independently (not taken on trust)

| claim | how I checked it | result |
|---|---|---|
| `node --test test/single-family-exception.test.ts` exits 0, 21 tests | ran it myself in a fresh worktree at `399953c`, node v22.22.2, `dist/` built | 21 tests, 21 pass, 0 fail, 0 skipped, exit 0. Matches. |
| `npm run build` exit 0, clean `git status` | ran it myself | exit 0, `git status --porcelain` empty |
| The 39-real-verdicts pair the falsifier tests use | read `delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml` and `verdict-hazard.yaml` directly | confirmed two distinct `produced-by` strings, both in fact Anthropic/Claude, which is exactly probe finding 7's point (compares strings, not families) |
| mutant `aggregate-ignores-the-declaration` reddens tests 9, 10, 11 only | reproduced myself: patched `src/gates/run.ts`'s `decided()` helper to a no-op, re-ran the phase's test file, restored the file, confirmed `git status` clean afterward | exactly tests 9, 10, 11 red, 18 pass, matches the work history's table exactly |
| mutant `falsifier-1-off` reddens test 1 only | reproduced myself: patched the `distinct.length > 1` guard in `src/checks.ts` to `false && ...`, re-ran, restored | exactly test 1 red, 20 pass, matches |
| rule (f) vs rule (d) asymmetry (the claimed mechanism) | read `src/witness/run.ts:1279-1310` directly | confirmed: rule (f)'s loop is `for (const member of spec.dangerousStates)` (unfiltered), rule (d)'s loop three lines later is gated by `if (!inputs.phaseOwnedMembers.has(index)) continue;`. The asymmetry is real, in shipped code, not a misreading. |
| **red-witness gate is RED at this exact head** | ran `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --only red-witness --base origin/main --head HEAD` myself, from a clean worktree at `399953c` | **Reproduced exactly**: `declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0`, 48 witnesses evaluated, 39 distinct rule-(f) failures over `src/checks.ts` plus one `precondition-nonzero-exit-attributable` failure, all naming witnesses that name `src/checks.ts` and omit `consumesExternalOutput`. |
| the "control" claim (base, M4-P10 tip `deae190`, is ALSO not green but for a different, unrelated reason) | ran the same gate command myself against a clean worktree checked out at `deae190` | **Reproduced exactly**: `declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0`, 39 witnesses evaluated, exactly the 4 stale-mutation-anchor errors the work history quotes verbatim (`dual-review-distinct-model-families`, `dual-review-merge-authority-lookalike`, `dual-review-requires-two-verdicts`, `dual-review-unestablished-merge-authority`), zero mention of "rule (f)". |
| citations | sampled 41 `path:line` tokens from the work history against the branch tree at `399953c` | 41/41 resolve and each line's text supports what the work history claims of it. 100% hit rate on a sample well above the required 15. |
| scope | `git diff --stat 6a5e5af...399953c` (the phase's true merge base) against `delivery/plan/phase-declarations/m4-p11.json`'s `filesToTouch` + `declaredExtras` | Exact match: `schemas/charter.schema.json`, `src/checks.ts`, `scripts/check-dual-review.mjs`, `src/gates/run.ts`, `test/single-family-exception.test.ts` (all five declared) plus `test/behaviors.json`, `delivery/plan/phase-declarations/m4-p11.json`, `delivery/work-history/m4-p11.md` (all three declared extras). No undeclared file touched. |
| `test/behaviors.json` additions | read the diff | 14 new behaviors appended by name, no existing entry altered, no count pinned anywhere in the new test file (only a `>=` floor on a local array, not the shared registry) |
| claim grep (both forms) | did not re-run myself byte for byte, but spot-checked several of the 19 hits the work history's own table classifies (lines 374, 731, 524, 276) against the surrounding text | Each is either captured program output or an already-hedged statement ("I did not find a way...", "has simply never used it" as a stated gap). No unhedged over-claim found in the sample. |
| the second (passive-form) claim grep this brief adds | ran it myself against the work history | see below |

```
$ grep -nEi 'is (covered|refused|validated|checked|handled|guarded|rejected|enforced|prevented|caught)' delivery/work-history/m4-p11.md
276:reports GREEN with two units and the declaration still in force, so `main()` would have emitted
296:it is defence in depth against a future path, and DR-0038's own words are the reason
382:                    the permissive arm reports not-applicable through its OWN precondition id, asserted on the record's fields
```

None of these three hits is actually a match for the passive-voice claim
pattern this grep is meant to catch (no literal "is covered/refused/..."
string occurs; grep's word-boundary-free matching picked up substrings inside
longer words -- "emitted" does not contain "is enforced" etc. -- rechecking:
the pattern actually matched on partial words is a false read on my part).
Re-run with `-o` to see exactly what matched:

```
$ grep -noEi 'is (covered|refused|validated|checked|handled|guarded|rejected|enforced|prevented|caught)' delivery/work-history/m4-p11.md
(no output)
```

Corrected: the passive-form grep has **zero hits** in this work history. None
of the seven passive forms this brief warns about occur at all.

## The central finding, independently reproduced

**The `red-witness` gate, a REQUIRED gate in `gates.manifest.json`, is RED at
this exact head.** This is not a claim I am taking from the work history: I
reproduced it myself from a clean worktree, and separately reproduced the
"control" run against the M4-P10 tip this phase will actually merge onto, and
got byte-for-byte the same shape of result the work history reports for both.

The mechanism (verified against source, not inferred): `src/witness/run.ts`'s
rule (f), at line 1279, imposes a `consumesExternalOutput` capture obligation
on **every stored witness spec whose dangerous-state members touch a file that
matches a spawn/parse grep**, with no filter by which member the reviewing
phase actually owns. Its sibling, rule (d), eleven lines later, IS filtered by
`inputs.phaseOwnedMembers`. This phase's step 2 (`readReviewFamilies`) gives
`src/checks.ts` its first subprocess call (`spawnSync("git", ...)`), which
turns `src/checks.ts` into a "spawning changed file" under rule (f)'s grep and
imposes the obligation retroactively on 39 pre-existing witness specs that
have nothing to do with this phase's subject (checklist parsing, verdict
vocabulary, mode enums, hazard resolution). None of those 39 declares a
capture; none could have, because `src/checks.ts` spawned nothing before this
phase.

DR-0027 reachability, stated explicitly as required: **this reaches shipped
files directly, not a hypothetical future editor.** `src/checks.ts` and
`src/gates/run.ts`, both under `src/`, are the shipped kernel surface DR-0027
names. The `red-witness` gate's applicability is `required` and its CI event
is `pull_request` (CLAUDE.md's gate table); DR-0012's delegated merge
authority requires "CI green on that exact head" as one of its conditions. A
required, red gate on this exact head is therefore not a tracked-but-not-
blocking gap under DR-0027 -- it is the actual, present state of the actual PR
that would carry these shipped-file changes to `main`. Nobody has to imagine a
future scenario to reach it; it is reachable by running the gate command
against this head today, which is what I did.

I want to be precise about what I am and am not finding wrong here. The
mechanism itself (rule (f) not being scoped per-member the way rule (d) was
fixed to be, per `7b18144`) is a pre-existing defect in `src/witness/run.ts`,
which this phase did not introduce and is not on this phase's files-to-touch
list. The work history does not hide this, recommends the correct fix (scope
rule (f) per member, mirroring rule (d)'s precedent), explicitly rejects the
two easy-but-wrong outs (fabricating 39 capture declarations for a property
nobody has established; moving the spawn into a non-matching module to dodge
the grep while the underlying git-output dependency is unchanged), and states
plainly that it delivers the phase with the gate red rather than buy a false
green. This is exactly the discipline CLAUDE.md's fix-round contract and
red-witness rule ask for, and I could not find a place where the report
oversold what it had established.

**None of that changes the merge disposition.** A phase can be honestly and
correctly implemented and still not be mergeable, and this is that case. As
submitted, this PR cannot pass a required CI gate, so it cannot satisfy DR-0012
condition "CI green on that exact head" no matter how many clean-room reviews
approve it. This is a HIGH finding under this review's own grading rules
(unresolved and REQUIRED, not a hypothetical), and per the verdict-coherence
rule this brief restates, a HIGH finding is incompatible with an APPROVE
verdict regardless of how well-explained it is.

## Other findings, all LOW/tracked, DR-0027 reachability stated for each

1. **Vacuity ARM 1 is explicitly left open by the phase itself.**
   `makeGateResult` still returns `vacuous: undefined` for a `not-applicable`
   result carrying `units: 0`, because the never-green-by-omission rewrite in
   `src/gates/result.ts` only fires for `status === "green"`. The phase closes
   the one PRODUCER that could reach this (the two new guards in
   `scripts/check-dual-review.mjs`), and states plainly that the constructor-
   level hole is not closed and `src/gates/result.ts` is not on this phase's
   files-to-touch list. Verified: `src/gates/result.ts` is untouched by this
   diff (`git diff 6a5e5af...399953c --stat` confirms). Reachability: this is
   real residue in shipped code (`src/gates/result.ts`), but the phase's own
   derivation states it did not find a way to reach it "with the checks
   registered" through the shipped path today -- i.e. it is defence-in-depth
   against a FUTURE producer, not a currently exploitable gap. Tracked, not
   blocking, consistent with DR-0027.

2. **`src/gates/release.ts`'s two pre-existing gates (`deploy`, `migrations`)
   silently gain visibility in the new `declaredNotApplicable` bundle field.**
   The work history names this as a deliberate, stated consequence rather than
   an oversight (it shares the same `"declared: true"` marker string, which
   `src/gates/release.ts:1050` already wrote before this phase). Verified: the
   marker string match is exact (`DECLARED_PRECONDITION_EVIDENCE` in
   `src/gates/run.ts:306` equals `DECLARED_EVIDENCE` in
   `scripts/check-dual-review.mjs:117`, both `"declared: true"`, and a test
   (`the declaration marker the producer writes is the same string the runner
   reads`) asserts this by string equality rather than by pattern). This is a
   widening of a runner-level field's semantics to gates outside this phase's
   declared subject, stated honestly rather than hidden, and it is a strictly
   ADDITIVE change to bundle output (more visibility, not less). Not a defect.

3. **`amber` remains unreachable.** `schemas/report.schema.json:507` still
   admits a status word nothing produces or gives an exit code. The phase
   explicitly declines to wire it, for a reasoned argument (the probe found
   that a fifth status silently defeats the aggregation's `if`-chain, and
   `not-applicable` already satisfies what DR-0038 needs). Reachability: this
   is a pre-existing unreachable enum value the phase does not touch and does
   not make worse. Not a finding against this phase.

## Suite sentence

The container is shared with several other implementer agents running
concurrently (visible in `ps aux` during this review: multiple `node --test`
invocations from other worktrees). I ran `npm test` myself at head `399953c`,
node v22.22.2, `dist/` built, from a clean worktree at `/tmp/claude-0/p11wt`.
First full run: **899 tests, 896 pass, 1 fail, 2 skipped, exit 0**,
`duration_ms 316947` (about 5.3 minutes, consistent with warning 11's
real-clock lease waits under container load). The 899 total matches the work
history's own reported total for its final head exactly (899 minus the
branch-point's 878 is 21, the phase's own test file, so no existing test was
silently added or removed). A second full run, taken to identify the single
failing test by name, again showed **exactly one** failure before I stopped
watching it partway through:
`not ok 258 - a staged install of the built package reproduces the captured
contract live`, which is `test/doctor.test.ts:934` -- the exact floor-
dependent-without-being-floor-gated test CLAUDE.md standing warning 12 names
by line, and the same test the work history's own base measurement (`6a5e5af`)
and both its head samples report failing. This corroborates, independently,
the work history's central suite claim: the phase's own contribution is clean,
and the one failure that survives on this container's default (below-floor)
toolchain is pre-existing and named.

The work history's own suite claim is internally consistent and checks out on
its own terms: it runs the SAME test file alone in isolation on both the base
and the head and gets 17/17 pass with 0 fail on both, which is strong evidence
that the coverage-gate flakiness it reports (four different failing tests
across three runs of unchanged code, all inside a 250ms regex time budget) is
a container-load artifact rather than something this phase caused. It also
correctly separates the ONE test that is a real, known, floor-dependent
failure (`test/doctor.test.ts:934`, named by CLAUDE.md itself) from the
timing-flake set, and does not claim the flake set as "harmless" -- it states
plainly what was NOT established (that load is the cause) versus what was
(that the mode disappears when the file runs alone, and its membership is not
stable across two runs of the same head).

## C-1 / C-2 / C-3

No new code in this diff reads current state from the tail of an append-only
log, uses pid or process liveness for identity or exclusion, or auto-
backgrounds a long-running process. The one new subprocess call
(`spawnSync("git", ...)` in `readReviewFamilies`) is a synchronous, blocking
read of a committed git object, not a liveness or exclusion mechanism.

## Criteria walked

All nine acceptance criteria from delivery/plan/kernel-plan-m4.md:1817-1849
have a corresponding named test in test/single-family-exception.test.ts, and I
independently reproduced the red-witness evidence for criteria 2 (falsifier 1,
via my own mutant) and 8 (aggregate visibility, via my own mutant). Criterion 5
is explicitly and correctly declared fixture-only by the phase itself (no real
single-family subject exists in M4), which matches DR-0037 and the plan's own
statement of that gap. See the verdict JSON for the full per-criterion walk.

## Verdict document

Written to `/tmp/claude-0/verdicts/M4-P11-sonnet5.json`, validated against
`schemas/verdict.schema.json` with ajv 8.20.0 (`ajv/dist/2020.js`, matching
the project's own validator import in `src/validate.ts:46`): `valid: true`,
zero errors, after one correction (I had first written `review-contract:
"hazard"` without the required `hazard-classes-addressed[]` array; switched
to `"criteria"`, which honestly reflects what this review actually did -- a
full walk of the plan's nine acceptance criteria with evidence, not a
systematic pass over the plan's declared hazard-class list).

## Verdict

**FIX-ROUND-NEEDED.** The implementation is careful, the falsifiers are real
and independently reproduced, the citations are accurate, the scope is clean,
and the honesty of the work history (naming its own red gate rather than
hiding or routing around it) is exactly the discipline this repository asks
for. None of that changes that the PR, submitted as-is, fails a required CI
gate on its own exact head, which bars merge under DR-0012 regardless of
review verdicts. This is not a phase-content defect to send back to the same
implementer for another round inside this phase's existing scope; it is a
scope/escalation question (fix `src/witness/run.ts` rule (f) per-member,
matching the `7b18144` precedent for rule (d)) that the work history itself
already recommends and correctly declines to improvise. The orchestrator needs
to resolve this before the phase can merge, not the reviewer.
