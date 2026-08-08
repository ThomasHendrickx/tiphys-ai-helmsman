# M3-P2 clean-room review (hazard): STARTING 16:19:22

Reviewer contract: attack the phase for a defect that can pass EVERY declared
acceptance criterion. Not a criteria walk (a second reviewer is doing that).
Head under review: `ee7042b`, worktree
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/wt-m3p2-cr-b`.

Read before starting: T-003, T-006, T-007, T-008, T-009, CLAUDE.md (binding
conventions, red-witness rule, fix-round contract), M3-P2's plan section
(`delivery/plan/kernel-plan-m3.md` line 2050), then
`delivery/work-history/m3-p2.md` last.

Toolchain: `node --version` = v26.6.0 (floor toolchain first on PATH).
`npm ci` exit 0. `npm run build` exit 0, clean `git status` after.
`node --test`: 470 pass, 0 fail, 0 skipped (ran to completion, 214s).

---

## 16:26 -- orientation

`git diff --stat` against merge base `bd47464`: 28 files, +3815/-24. Read
`src/gates/run.ts` in full (the runner, M2-C-2/M2-C-3 enforcement point),
`src/commands/gates.ts` (CLI), `schemas/gate-registry.schema.json`,
`gate-registry.yaml`, `scripts/render-agent-rules-gates.mjs`,
`.github/workflows/gates.yml` diff, and `test/gate-registry.test.ts`.

Structural observation confirmed by reading `loadRegistry` in `src/gates/run.ts`:
the registry is projected onto an M2 `GateManifest` and then EVERY line after
that point (`runOneGate`, `ingestGateRun`, `decideAggregate`) is the unmodified
M2 runner. There is no second code path that constructs a `GateResult`
directly from a registry entry. This is the strongest structural argument
against a vacuous-green regression, and I attacked it directly below rather
than accepting the argument on its own say-so.

---

## Attack 1: vacuous green through the registry path (M2-C-2)

Built a one-gate registry
(`/tmp/.../scratchpad/attack1/attack-registry.yaml`) whose gate writes its own
record `{"status":"green","units":0}` (the exact fixture shape
`scripts/m2-exit-test.sh --self-test` already uses on `main`), and ran it
through the real CLI, twice, under structurally different selection paths:

```
$ node bin/tiphys.ts gates run --registry attack-registry.yaml --mode full --evidence ev-full
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 1
gates: 1 gate(s) reported error: attack-vacuous
EXIT=21

$ node bin/tiphys.ts gates run --registry attack-registry.yaml --mode local-only --evidence ev-local
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 1
gates: 1 gate(s) reported error: attack-vacuous
EXIT=21
```

Ingested record in both directories:

```json
{
  "gate": "attack-vacuous",
  "status": "error",
  "units": 0,
  "detail": "M2-C-2 (never green by omission): a gate reporting green with units 0 examined nothing, so this record is error; the gate reported: claims green having examined nothing (hand-written record via registry path)",
  "vacuous": true
}
```

M2-C-2 survives the registry path under both `--mode full` and a non-full
mode. **No finding.** (This duplicates, and confirms by independent
construction, `test/gate-registry.test.ts`'s own
`gate-registry-zero-units-green-becomes-error` test, which does the same
thing over `["full","local-only"]` and anchors to a stored real capture.)

## Attack 2: fail-open on a missing declared parameter (M2-C-3)

Registry entry declaring `parameters: [base]`, run with and without `--base`,
gate itself writing a real green record when invoked:

```
--- no --base ---
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: attack-needs-base
EXIT=21

--- with --base HEAD ---
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: every applicable gate is green
EXIT=0
```

Never `not-applicable` in the missing-parameter case, both directions
witnessed. **No finding.** (First attempt at this attack was contaminated by
a shell-pipeline mistake on my part -- `echo "EXIT=$?"` after a piped `| tail`
captures `tail`'s exit code, not the gate runner's. Recorded here because it
is exactly the kind of "read the wrong signal and believe it" mistake T-006
is about, and I want a later reader to see it was caught, not silently
avoided.)

## Attack 3: SC-011, unmet precondition must never be green

Code inspection of `runOneGate` (src/gates/run.ts:836-875): the precondition
is evaluated and, if unmet, the function returns `not-applicable` and
**returns before the gate subprocess is spawned at all.** There is no code
path by which the underlying script can override that verdict, because the
script never runs. Combined with `test/gate-registry.test.ts`'s
`gate-registry-diff-scoped-na-accepted-with-reason` (which exercises this
against the real runner and a real precondition), I did not find a
construction that reaches green with an unmet precondition. **No finding**,
stated as a search that did not succeed rather than as an impossibility (the
mechanism is inspectable and the reason a script-side override cannot happen
is structural: precondition evaluation strictly precedes `spawnSync`).

## Attack 4: enumerate every registry entry, prove by running which arm executes it

This is where the finding is.

Real facts, gathered by execution, not by reading:

```
$ grep -rn -- "--registry" .github/workflows/gates.yml scripts/m2-exit-test.sh package.json
(no output)
```

**`--registry` is invoked nowhere in CI.** Not in the workflow file, not in
`scripts/m2-exit-test.sh` (the M2 exit-test harness that both CI arms
actually call), not in any `package.json` script. The only places `--registry`
is exercised are `test/gate-registry.test.ts` (a test, not a CI gate
invocation of the real registry) and the CLI's own usage/flag-parsing code.

```
$ sed -n '923,960p' scripts/m2-exit-test.sh   # run_main_bundle
  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
      --manifest "${MANIFEST}" --evidence "${dir}" --base "${base}" \
      --only manifest-self-check --only suite --only coverage \
      --only credential-scrub --only deploy --only migrations )
```

The `push`-to-`main` arm runs `gates run --manifest gates.manifest.json`
with a hard-coded `--only` list. The `pull_request` arm (`run_pr_bundle`,
not pasted here) also passes `--manifest gates.manifest.json`, never
`--registry`. **Both CI arms execute the OLD M2-P1 manifest, unchanged, not
the registry this phase promotes.**

This is not a hidden defect the implementer missed -- it is the delivered,
disclosed, correct state of `scripts/m2-exit-test.sh`, which is not on this
phase's files-to-touch list, and the plan's own revision-3 re-grounding
SETTLES this as the intended architecture:

```
delivery/plan/kernel-plan-m3.md:663
| gate registry as CI's single caller | .github/workflows/gates.yml,
scripts/m2-exit-test.sh, src/commands/gates.ts | **CORRECTED.** The M2 exit
harness is the SINGLE caller of `gates run`, deliberately, so exactly one
`summary.json` is produced per job. Five M3 checks were specified as raw
workflow steps, which routes around the authority M3-P2 exists to establish.
Section 2.2, D-M3-34 |
```

So the plan's binding decision is that `scripts/m2-exit-test.sh`, calling
`gates run --manifest gates.manifest.json`, remains CI's one caller. That
is exactly what is delivered. The registry, as of this merge, is consumed by
CI for exactly one purpose: the `agent-rules-drift` raw workflow step (see
Attack 5) invokes `scripts/render-agent-rules-gates.mjs --check`, which reads
`gate-registry.yaml` directly (not through `gates run --registry`) to check
CLAUDE.md's rendering.

**The defect is not in the code. It is that two of the project's own most
authoritative, first-read artifacts assert the opposite of this as settled
present-tense fact, and nothing in the delivered gate set can ever turn red
if that claim stays false forever.**

```
CLAUDE.md:146-148
**`gate-registry.yaml` is the canonical gate registry and the single source
this section is generated from (R-094).** CI runs it through
`tiphys gates run --registry gate-registry.yaml --mode <mode>` and the block
below is RENDERED from it...

gate-registry.yaml:3-4
# This file is the SINGLE SOURCE for this repository's gates. CI reads it
# through the gate runner (`tiphys gates run --registry gate-registry.yaml
# --mode <mode>`)...
```

Both sentences describe a CI invocation that does not exist anywhere in the
repository (see the grep above) and that the plan's own revision-3
re-grounding explicitly rejected building this way ("the M2 exit harness is
the SINGLE caller of `gates run`, deliberately"). The claim is not a stale
leftover from a draft; it is new text this phase wrote and committed.

**Why every acceptance criterion passes anyway (T-007 shape).** Criterion 1
validates the registry document. Criteria 2/4 are schema Kind-A tests.
Criterion 3/3b/3c run the registry through the CLI directly, by hand, which is
exactly how I reproduced attacks 1-3 above -- a criteria-walking reviewer runs
the same command and sees it pass, and nothing in the criteria asks "does the
CI workflow's own YAML invoke this path". Criterion 5/5b check that the
GENERATED BLOCK matches the registry and that the drift check is wired
executably; neither touches the HAND-WRITTEN PROSE paragraph sitting just
above the generated markers in `CLAUDE.md`, nor the registry's own header
comment, which is exactly where the false claim lives (outside anything
`agent-rules-drift` compares). Criterion 6 only requires "no hand-maintained
GATE LIST", which is satisfied -- the false sentence is prose, not a list.

**Why nothing else in the system can catch it either.** The gate nominally
responsible for checking that a requirement like R-094 is actually discharged
is `clause-map` (`scripts/check-clause-map.mjs`), and its condition 4 is a
pure substring test:

```
scripts/check-clause-map.mjs:195
if (!body.includes(entry.clause)) { ... "does not occur in" ... }
```

`delivery/requirements/clause-map.json` marks R-094 discharged by
`gate-registry.yaml` merely existing and containing the literal text
"R-094" (which it does, in its own header comment and in the
`agent-rules-drift` entry's `$comment`). This textual check is structurally
incapable of distinguishing "R-094 is true" from "R-094 is asserted". So the
one required, CI-enforced gate whose job is closest to catching a
requirement-coverage overclaim will report green on this file forever,
regardless of whether CI ever actually executes through the registry.

**Self-contradiction inside the delivered code, as corroborating evidence.**
`scripts/render-agent-rules-gates.mjs`'s own header (lines 21-27) states:

```
IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a).
Registered in `gate-registry.yaml` as `agent-rules-drift`, so it runs
inside the one `gates run` the harness makes rather than beside it...
```

The actual workflow step added by this phase
(`.github/workflows/gates.yml`, new step "Agent-rules gate-list drift") is:

```yaml
- name: Agent-rules gate-list drift (gate-registry.yaml is the single source, R-094)
  run: node scripts/render-agent-rules-gates.mjs --check
```

This is a bare `run:` step, invoked directly, not through
`tiphys gates run --registry ... --mode ...`, carrying no `--result` and no
`--evidence`. It runs BESIDE the one `gates run` the harness makes, which is
precisely what the header comment says it does not do, and precisely the
shape D-M3-28/D-M3-34 exist to forbid ("Five M3 checks were specified as raw
workflow steps, which routes around the authority M3-P2 exists to
establish"). The work history discloses and escalates this specific
deviation honestly (declared deviation 6, "the drift check is BOTH a
registry entry and a workflow step"), with a correct and reasoned
justification (the push-arm's hard-coded `--only` list cannot reach it any
other way, given the harness is out of this phase's scope). What is NOT
disclosed anywhere is that this same limitation means `gate-registry.yaml`
is not, in fact, "the single source CI reads" for any gate OTHER than
`agent-rules-drift` -- ten of eleven promoted script gates, and both new
checklist-verified entries, are exercised in CI exclusively through
`gates.manifest.json`, never through the registry.

**Note on `makeGateResult` reuse (why this is not itself a vacuous-green
hole).** The raw step's underlying script still constructs its own result
through `makeGateResult`, so if the registry it read had zero preflight steps
and zero gates, M2-C-2 would still convert the resulting green-units-0 to
`error` even in this bypassed invocation. I verified this by reading
`src/gates/result.ts:158-186`: the rewrite is IN the constructor, not only in
the runner's ingest path, so the standalone script cannot smuggle a vacuous
green through this specific door. This is why I am not raising the raw step
itself as an M2-C-2 defect -- only the truthfulness of the surrounding prose.

### CR-M3P2-B-001 -- HIGH

**Location:** `CLAUDE.md:146-148`, `gate-registry.yaml:3-8`,
`delivery/requirements/clause-map.json` (R-094 row).

**Mechanism:** an artifact's own header prose asserts a present-tense fact
about which system consumes it ("CI runs it through
`tiphys gates run --registry ... --mode <mode>`") that is not implemented
anywhere in the repository, that the plan's own binding revision-3
re-grounding explicitly settled the opposite way for ("the M2 exit harness is
the SINGLE caller of `gates run`"), and that the one automated check closest
to this requirement (`clause-map`, backing R-094) is a substring match
incapable of ever detecting the gap.

**The defective implementation that still passes every criterion:** exactly
what is shipped at `ee7042b`. Every one of criteria 1 through 7 passes
(verified above and independently re-derived by my own attacks 1-3). The
false claim sits in hand-written prose outside anything any criterion
compares, and the requirement it overclaims (R-094, "single source consumed
by CI") is marked discharged in an append-only registry that no later phase
is likely to reopen (CLAUDE.md: "A decided record is settled and is never
reopened by an agent" -- clause-map rows are not decision records, but the
practical effect of a green, required gate is the same chilling one).

**Evidence:** the three greps and reads above (`--registry` absent from CI
config and the harness; `scripts/m2-exit-test.sh:942-946`'s `--manifest`
invocation; `kernel-plan-m3.md:663`'s corrected-architecture row;
`scripts/check-clause-map.mjs:195`'s substring condition;
`scripts/render-agent-rules-gates.mjs:21-27` versus the actual workflow step
it describes).

**Recommendation:** rewrite both prose passages to state the true, narrower
claim -- e.g. "`gate-registry.yaml` is the canonical SOURCE OF RECORD for
this repository's gates and CLAUDE.md's gate section is rendered from it and
kept in sync by the `agent-rules-drift` gate (both CI events); CI's gate
EXECUTION for every other gate still runs through `gates.manifest.json` via
`scripts/m2-exit-test.sh`, which is not yet wired to `--registry` (owned by
M2-P9 / a future phase)." Either fix the prose now (a documentation-only
change, no scope conflict) or open a decision record / owner action that
tracks "wire `scripts/m2-exit-test.sh` to `gates run --registry`" as
outstanding, so a future reader of `delivery/STATE.md` sees the gap instead
of inferring from a green clause-map gate that it does not exist.

---

## Attack 5: the checklist-entry precondition, claimed evaluated, never evaluated

Two new registry entries (`unit-tests-for-changed-service-methods`,
`fixtures-for-changed-component-states`, D-11, R-043/R-044) each carry a
`precondition` (`checklists/clean-room.yaml` exists) and a `$comment`
claiming:

```
gate-registry.yaml:184-186 ($comment on unit-tests-for-changed-service-methods)
... until `checklists/clean-room.yaml` exists the precondition is evaluated
and unmet and this entry reports not-applicable, which is SC-011's shape and
not a silent skip.
```

Read `src/gates/run.ts::loadRegistry`: entries are split into two disjoint
sets by `verified-by` -- `script` entries become `GateEntry[]` and go through
`runOneGate` (which is where precondition evaluation, `evaluatePrecondition`,
lives); `clean-room-checklist` entries are filtered into `declaredByChecklist`
and **never reach `runOneGate` or `evaluatePrecondition` at all.** Confirmed
by execution:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full --base HEAD~1 --evidence ev-real-full2
gates: 2 registry gate(s) declared verified-by clean-room-checklist and NOT
executed by this runner: unit-tests-for-changed-service-methods (probe ...),
fixtures-for-changed-component-states (probe ...)
gates: declared 12 applicable 6 verdict 6 green 6 red 0 not-applicable 4 error 2 vacuous 0
```

Neither checklist entry appears anywhere in `declared`/`applicable`/
`not-applicable` counts or in any per-gate row; they are reported only in the
separate `declaredByChecklist` line, with no status at all, not
`not-applicable`. **No code path today evaluates that precondition or reports
`not-applicable` for these two entries.** The comment describes M3-P7's future
behavior (once the checklist runner exists) in present tense, as something
that already happens.

### CR-M3P2-B-002 -- MEDIUM

**Location:** `gate-registry.yaml` `$comment` fields on
`unit-tests-for-changed-service-methods` and
`fixtures-for-changed-component-states` (two instances, same wording pattern).

**Mechanism:** a coverage claim in committed prose ("the precondition is
evaluated and unmet ... this entry reports not-applicable") describing
behavior that is not implemented by any code shipped in this phase or any
earlier one; the actual runner output for these entries is a distinct,
un-statused "declared ... NOT executed" line, never `not-applicable`. This is
T-006's "claimed coverage" shape precisely: a claim of the form "this case is
handled", written without the construction that would demonstrate it, landing
in a file every future phase reads as authoritative for what the registry
already does.

**The defective implementation that still passes every criterion:** current
`gate-registry.yaml`, verified above by real execution; criterion 2 only
checks the schema `if`/`then` (probe required when `verified-by` is
`clean-room-checklist`), and nothing in the plan's criteria asserts what the
runner reports for a checklist entry when its precondition is unmet, because
D-11 explicitly took these two gates out of the runner's remit.

**Evidence:** the CLI run above; `src/gates/run.ts:378-386` (the
`declaredByChecklist` filter, which never calls `evaluatePrecondition`).

**Recommendation:** reword the `$comment` to the true, weaker claim: "until
M3-P7 ships a checklist runner that reads this precondition, this entry is
reported by `tiphys gates run` only as declared-and-not-executed; it carries
no status and is not counted as not-applicable by anything today." Low cost,
same place, prevents a future reader (including M3-P7's own implementer) from
assuming SC-011 semantics already apply here.

---

## Attack 6: the projection as an attack surface (dropped/defaulted fields)

`GateEntry` (`src/gates/manifest.ts:64-72`) has exactly seven fields:
`id, command, unitLabel, applicability, parameters?, precondition?, modes?`.
`loadRegistry`'s projection (`src/gates/run.ts:387-404`) sets every one of
them from the registry entry, conditionally including `parameters` and
`precondition` only when present (matching M2's own optional-field
convention), and drops nothing else because there is nothing else in the M2
type to drop. Compared field-by-field against the M2 schema
(`src/gates/schemas/gate-manifest.schema.json`) -- no field silently
defaulted. **No finding.**

Also checked: `test/gate-registry.test.ts`'s own criterion-1 test
(`the shipped gate-registry.yaml validates against its schema...`) already
does the promotion-fidelity diff I set out to do by hand -- for every entry
in `gates.manifest.json`, assert the registry's same-id entry has identical
`command`, `unitLabel`, `applicability`, `parameters`, `precondition`. I
re-ran it standalone to confirm it is not a false green:

```
$ node --test --test-name-pattern 'validates against its schema' test/gate-registry.test.ts
tests 1, pass 1, fail 0
```

I additionally hand-diffed the eleven promoted entries against
`gates.manifest.json` myself (`python3` field comparison script, not shown,
zero differences found), as an independent check on the test rather than
trusting it alone. **No finding** on field-level promotion fidelity; note
this test is exactly what prevents `gates.manifest.json` (still CI's real
input) and `gate-registry.yaml` from silently diverging on the 5 fields that
matter operationally, since `suite` (which runs this test) fires on both CI
events. It does NOT cover `modes` or `events` diverging from what CI actually
selects for entries NOT in `gates.manifest.json` (i.e. `agent-rules-drift`
and the two checklist entries), but a separate test
(`gate-registry-events-field-required`) explicitly special-cases
`agent-rules-drift` for exactly this reason.

## Attack 7: `required` + `modes`, can a required gate skip?

Re-derived the implementer's stated reasoning rather than trusting it.
Schema (`schemas/gate-registry.schema.json` `$defs.gate`): `precondition` is
required only when `applicability: conditional`; the six entries with
`applicability: required` and no precondition
(`manifest-self-check`, `suite`, `credential-scrub`, `clause-map`,
`agent-rules-drift`, and `coverage` which already has one) are therefore
INCAPABLE of ever reporting `not-applicable` -- `evaluatePrecondition` is
only reached when `entry.precondition !== undefined`
(`src/gates/run.ts:836`). Confirmed by reading, not merely trusting the
work-history's derivation. The inverse the prompt asked me to look for -- "a
conditional gate that should be required" -- is `deploy`/`migrations`
(conditional, structurally always not-applicable pre-merge per O-3) and the
two D-11 checklist gates (conditional by construction, since D-11 settles
they are not reliably computable and must be allowed to be not-applicable
before M3-P7 ships). I did not find a `conditional` entry that should be
`required` by the plan's own stated intent. **No finding.**

## Attack 8: append-only registries, count or specific-row pins reintroduced

```
$ git diff bd47464a137966f2e32b57033ecf0a1767d407e2 ee7042b -- test/behaviors.json
```
Pure additive diff, ten new keys appended, nothing removed or reordered.

```
$ git diff bd47464a137966f2e32b57033ecf0a1767d407e2 ee7042b -- test/checks.test.ts
```
This phase's diff to `test/checks.test.ts` REMOVES the exact class of defect
CLAUDE.md's convention 5 describes (`Object.keys(map).length === 12`,
`R-094 pending M3-P2` pinned literally, a hand-listed staging directory list
that silently excluded a repo-root artifact) and replaces every one with a
name-based or derived-arithmetic assertion. I confirmed this file compiles
and its tests pass as part of the full `node --test` run (470/470).
`gates.manifest.json` was NOT edited by this phase at all
(`git diff ... -- gates.manifest.json` is empty) despite being on the
files-to-touch list; this is the same fact underlying CR-M3P2-B-001's
Attack 4 and is separately, honestly disclosed in the work history's
declared-deviations list (item 6) and its "what this phase did not cover"
section. **No NEW pinning defect found**; the phase in fact fixed pre-existing
pins in `test/checks.test.ts` left by M3-P1, and I mention it here because it
is exactly the shape section 8 of my brief asked me to hunt for and it is
worth recording that this hunt came back clean rather than silently
skipped.

---

## Verdict

**CHANGES REQUIRED.**

- HIGH: 1 (CR-M3P2-B-001)
- MEDIUM: 1 (CR-M3P2-B-002)
- LOW: 0

Both findings are documentation/claim defects, not gate-logic defects: every
mechanism I could construct an attack against (vacuous green, fail-open on an
unreachable check, SC-011 unmet-precondition-to-green, dropped/defaulted
projection fields, required-gate skip via precondition, append-only-registry
pinning) held under direct construction and real execution, and duplicates
independent, well-built tests already in `test/gate-registry.test.ts`. The
two findings that survived are both instances of the SAME mechanism: a
written claim about what the system does, landing in a committed,
authoritative file, that was not checked against an execution of the system
before being written down (T-006's shape, generalized from work-history prose
to shipped artifact prose). Neither is a red-witness-testable code defect;
both are corrections to text that a future reader (human or agent) will trust
as fact. Given CLAUDE.md's own instruction ("Read this file first") and the
project's repeated, expensive history with exactly this failure mode
(T-006's three-instances-in-one-phase, plus the orchestrator's own repeat the
same day), I am not downgrading CR-M3P2-B-001 to a documentation nit: the
artifact that says "read me first" containing an unchecked claim about CI
behavior is the mechanism, not the instance.

Recommend: a one-round fix rewriting the two prose passages (CLAUDE.md and
gate-registry.yaml's header) plus the two `$comment` fields, re-running
criterion 5/6 to confirm the generated block is unaffected (the false prose
sits outside the generated markers, so this is a no-risk edit), no code
change required, no new red-witness needed since nothing here is a behavior
to guard, only a claim to correct.

## Attacks I ran that found nothing

1. Vacuous green (M2-C-2) through `--registry` under `--mode full` and
   `--mode local-only`, hand-built fixture gate, real CLI execution (Attack 1).
2. Fail-open on a missing declared parameter (M2-C-3), both directions, real
   CLI execution (Attack 2).
3. SC-011 green-with-unmet-precondition, by code inspection of the strict
   evaluate-then-spawn ordering in `runOneGate` (Attack 3).
4. Projected-manifest field drop/default versus the M2 `GateManifest` type
   and versus the committed `gates.manifest.json`, independently re-derived
   by hand in addition to running the existing test (Attack 6).
5. `required` + `modes` interaction: verified no `required` entry can reach
   `not-applicable` (the six no-precondition required gates), and searched
   for a `conditional` entry that should be `required` per the plan's own
   stated intent (Attack 7).
6. Append-only registry pinning reintroduced in this phase's own diff to
   `test/behaviors.json` or `test/checks.test.ts` (Attack 8) -- found the
   phase REMOVING pre-existing pins, not adding new ones.
7. `--only` / registered-workflow defang classes for the drift check
   (`|| true`, a narrowing `if:`) -- not independently re-attacked; the
   phase's own `test/gate-registry.test.ts` witnesses both by extracting and
   executing the real step text, and I read that test rather than
   re-implementing it, since criterion 5b's Kind requires exactly this
   red-witness shape and rebuilding it would not have added information.

## What I did NOT cover

1. **The `push` arm on the real GitHub Actions runner.** Everything above was
   run locally against the worktree; I did not push a branch or observe an
   actual `push`-to-`main` CI run of this exact head. The work history
   itself flags this as open ("the post-merge push run ... is the
   orchestrator's to watch"), and T-009 makes that the orchestrator's
   obligation before closing the phase, not this review's.
2. **`scripts/m2-exit-test.sh`'s assertion program, line by line.** I read
   enough of it to confirm the `--only` list and the absence of `--registry`
   (Attack 4), but did not audit the ~1200-line file for unrelated defects;
   it is explicitly out of this phase's scope and the plan's own revision-3
   re-grounding states the same limitation ("read for its documented modes
   and flags, not for its assertion code").
3. **M3-P3's `modes` enum and M3-P6's role-brief consumption of this
   registry.** Both are named as `conflicts-with` this phase and are future
   work; I did not attempt to construct a mode-selection or role-brief attack
   against artifacts that do not exist yet.
4. **The two D-11 checklist gates' actual verification once M3-P7 ships.**
   Nothing to attack yet; flagged only the present-tense overclaim about their
   current behavior (CR-M3P2-B-002).
5. **A byte-for-byte audit of `src/gates/citations.ts` and `src/gates/suite.ts`**
   (both large, both unmodified by this phase) for interaction effects with
   the new `--registry` code path beyond the parameter/precondition/M2-C-2/
   M2-C-3 mechanisms I did attack; the plan's own revision-3 re-grounding
   records the same non-coverage for the same reason (module headers and
   contracts read, bodies not audited).
6. **Windows/exotic-filesystem behavior of the new YAML registry parsing**
   (`decodeDocument`) -- out of scope for a hazard review of gate-registry
   semantics and not named in the phase's own hazard class.
