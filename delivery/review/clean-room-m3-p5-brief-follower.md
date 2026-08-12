# Clean-room review: M3-P5, Contract B-PRIME (brief-follower audit)

> ORCHESTRATOR NOTE, DECLARED TRANSLITERATION. This report pastes real
> captured output from `node --test`, whose reporter prints U+2139
> INFORMATION SOURCE at the head of its summary lines. Binding convention 3
> requires authored files to be pure ASCII, and CLAUDE.md's stated
> resolution for this exact collision is to transliterate AND DECLARE it,
> because hand-writing the output instead would be the fabrication the
> red-witness rule exists to prevent.
>
> Replaced: U+2139 rendered as `i`, 5 occurrences. NOTHING ELSE in any
> captured output was altered: no count, no exit code, no test name, and no
> other codepoint appeared.

Status: COMPLETE.

Reviewer: clean-room B-PRIME (brief-follower audit), model family: this
session (Claude, Sonnet 5). Contract A (the nine-criteria acceptance walk) is
a parallel reviewer's job and is not duplicated here.

Worktree head: 48829d99eaa78b3ed64953f5ee5c65f85c84d0e3 (detached, at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p5-cr-b)

## What this review did NOT cover

- Contract A's territory entirely: the nine acceptance criteria walked and
  executed, the pre-merge/post-merge criterion re-walk, the 21
  behaviors/9 witness specs resolving by name, the scope audit. Not
  duplicated here on purpose.
- `node --test` could not be run to completion in this worktree: the `yaml`
  package is absent from the linked `node_modules`
  (`/home/user/tiphys-ai-helmsman/node_modules` has no `yaml/` directory),
  so every test file that imports `src/roles.ts` (which imports `yaml`)
  fails immediately with `ERR_MODULE_NOT_FOUND` regardless of source
  correctness. Captured:
  ```
  $ node --version
  v26.6.0
  $ node --test test/roles.test.ts
  Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml' imported from
  .../test/roles.test.ts
  ```
  This is an environment gap in my worktree, not a finding about the
  briefs. I did not `npm install` to fix it because that would mutate
  `/home/user/tiphys-ai-helmsman/node_modules`, shared outside my worktree,
  which is out of scope for a read-only clean-room pass. Consequence: every
  claim below about mandated-reading resolution and schema shape was
  verified by READING the schemas and `src/roles.ts`'s resolver directly
  (`resolveMandatedReading`, `src/commands/brief.ts`), and by static
  `grep`/citation-following, not by running `tiphys brief compose` end to
  end or by observing `test/roles.test.ts` pass.
- I did not attempt to independently reconstruct, minute by minute, the
  "roughly twenty-five minutes frozen while its tree changed" episode named
  in my dispatch. `delivery/work-history/m3-p5.md` and `delivery/STATE.md`
  record ONE implementer killed by a usage limit and salvaged
  (`delivery/work-history/m3-p5.md:196`, `delivery/STATE.md:60`), and the
  commit timestamps on `claude/m3-p5-authoring-role-briefs` (captured below)
  do not by themselves show a clean 25-minute gap, because a single commit
  can bundle several minutes of uncommitted appends. I treat the frozen-beacon
  episode as reported context from the dispatching orchestrator rather than
  as something I independently re-derived from committed artifacts, and I
  say so wherever I rely on it.
- I did not review `roles/implementer.md` or `roles/clean-room-reviewer.md`
  (not M3-P5 artifacts) or `AGENTS.md` in depth; `_shared-dispatch-contract.md`
  was read in full because M3-P5 ships it and all three of its briefs include
  it.
- I read all three role briefs in full, `_shared-dispatch-contract.md` in
  full, and the relevant sections of `schemas/report.schema.json`,
  `schemas/finding.schema.json`, `schemas/plan.schema.json`,
  `schemas/role-brief.schema.json`, `src/roles.ts`, and
  `src/commands/brief.ts` in full or by targeted grep. I did not read
  `schemas/report.schema.json` end to end (it is 60+KB); I read every
  section relevant to the investigator's output shape.

## Log

- Read CONTRACT-B-PRIME.md in full. Method: read each brief as its intended
  agent with no other context; list what it produces, forbids, and leaves
  to guess; hunt for brief-vs-CLAUDE.md conflicts; scrutinize
  `incremental-output`/`beacon-is-not-a-claim` as mechanism vs assertion;
  check against this phase's own history.
- Read `roles/_shared-dispatch-contract.md`, `roles/investigator.md`,
  `roles/plan-writer.md`, `roles/adversarial-plan-reviewer.md` in full.
- Noticed `roles/investigator.md`'s `mandated-reading` lists
  `schemas/finding.schema.json` but not `schemas/report.schema.json`, while
  its `outputs` is `report`. Cross-checked against
  `schemas/finding.schema.json:5` ("A finding set: the artifact an
  adversarial plan review or a clean-room review outputs") and
  `schemas/report.schema.json:8-17` (the investigator's actual required
  fields: `kind, role, task, findings, claims, deviations, honest-failures,
  environmental-claims, gate-results`). Confirmed no `$ref` links the two
  schemas (`grep -n "finding.schema" schemas/report.schema.json` returns
  nothing).
- Confirmed `mandated-reading` is resolved LITERALLY and IN ORDER with no
  derivation from `outputs`: `src/roles.ts:271-294`
  (`resolveMandatedReading`) walks exactly the declared list and
  `src/commands/brief.ts:6-9` states the composed output "carries the
  resolved mandated-reading list, in order" with no other injection path.
- Found the plan's own hazard-class table had already named this exact
  shape and declared it unreachable by any criterion:
  `delivery/plan/kernel-plan-m3.md:2997` (the row quoted in Finding 1
  below).
- Verified all six mandated-reading paths across the three briefs resolve
  on disk (`ls` each path), which is why criterion 2 (path resolvability)
  is satisfied and gives no signal on the gap found above.
- Read `schemas/plan.schema.json`'s `report-code-disagreement` and
  `verification-first` step kind (lines 15, 49, 184-186) against
  `roles/plan-writer.md`'s R-010a and R-005 clauses: consistent, no
  mismatch found.
- Read `schemas/finding.schema.json`'s `required` array
  (`kind, verdict, produced-by, findings`) against
  `roles/adversarial-plan-reviewer.md`'s prose ("a verdict, the model
  family that produced the review", "no `concrete-edit` is a remark"):
  consistent, field names and semantics match.
- Verified the SC-001 footnote `roles/adversarial-plan-reviewer.md` cites
  actually exists in the process document
  (`delivery/intake/orchestrated-delivery-process.md:20-38`) and that D-14
  and R-006's citation-table row resolve
  (`delivery/plan/kernel-plan-v1.md:389`,
  `delivery/plan/kernel-plan-m3.md:6421` area). Consistent.
- Ran both CLAUDE.md ASCII/control-character checks over all four brief
  files (`_shared-dispatch-contract.md` and the three role briefs): both
  clean (evidence below).
- Read `delivery/work-history/m3-p5.md` in full as a CLAIM (per my
  instructions), noted the one recorded usage-limit kill and salvage at
  line 196, and cross-checked the branch's commit timestamps.

## Findings

### Finding 1 (HIGH): the investigator's `mandated-reading` omits its own
output schema and includes the wrong one, and the plan predicted exactly
this failure mode as unreachable by any criterion

`roles/investigator.md:10-17`:

```
mandated-reading:
  - roles/_shared-dispatch-contract.md
  - schemas/finding.schema.json
verifiers:
  - citations
outputs:
  - report
```

The investigator's only declared output type is `report`, which
`tiphys validate --type report` checks against `schemas/report.schema.json`.
That schema requires nine top-level fields none of which the brief's prose
explains in structural terms: `kind, role, task, findings, claims,
deviations, honest-failures, environmental-claims, gate-results`
(`schemas/report.schema.json:8-17`). The brief's prose (clauses R-004,
R-015a, R-092, R-010a) describes the VERDICT and REPRO semantically ("a
command someone else can run, which fails now", "state what the repro does
NOT cover") but never names `claims`, `deviations`, `honest-failures`,
`environmental-claims`, or `gate-results`, and never states that a verdict
now costs a `repro` by a top-level `if`/`then` newly added for this very
phase's criterion 6 (`schemas/report.schema.json:89`, the
`$comment` at that line naming the conditional in detail). The ONLY place
that structural contract lives is `schemas/report.schema.json` itself, and
it is not on the investigator's mandated-reading list.

What IS on the list, `schemas/finding.schema.json`, describes a different
document for a different role: its own `description` field reads "A finding
set: the artifact an adversarial plan review or a clean-room review
outputs" (`schemas/finding.schema.json:5`), it requires `produced-by` (a
field a `report` document does not have), and it has no `repro`, no
`claims`, no `deviations`, no `honest-failures`, no `gate-results`. There is
no `$ref` connecting the two schemas (`grep -n "finding.schema"
schemas/report.schema.json` returns nothing); the "findings" property
inside `report.schema.json` resolves to that document's OWN local
`#/$defs/finding`, not to the top-level finding-set schema.

**An agent handed only `roles/investigator.md`, faithfully doing what it
says, would read the wrong schema and never see the one that actually
governs the shape of its own output.** The most likely concrete failure: a
report missing `claims`, `deviations`, `honest-failures`,
`environmental-claims`, and `gate-results` entirely (none of which the brief
prose mentions by name), which fails `additionalProperties: false` /
`required` validation outright; or, more subtly, a report that states a
root-cause verdict without the newly-required `repro` field, because the
brief's prose describes R-015a/R-092 as things to DO but the mechanical
"a verdict now costs a repro" rule lives only in the schema's `if`/`then`
this phase built specifically for criterion 6
(`schemas/report.schema.json:89`, "$comment": "M3-P5 CRITERION 6, R-015a
... a verdict now costs a `repro`, by the top-level if/then this document
adds for M3-P5 criterion 6"). That is the exact criterion this phase spent
the second implementer's session unblocking and delivering
(`delivery/work-history/m3-p5.md:283`, `:1096`); a brief that cannot lead
its own agent to the field that discharges it is a direct threat to that
criterion holding up under real dispatch, not merely a documentation nit.

This is not a hypothetical class of defect invented for this review. The
plan's own hazard-class table, written before this phase shipped, names
this EXACT shape and states in so many words that nothing can catch it
mechanically:

> `delivery/plan/kernel-plan-m3.md:2997`: "a `mandated-reading` list that
> resolves because every path exists while OMITTING the one document the
> role needs | **NO CRITERION CAN REACH THIS, section 2.6 reason 1.**
> Criterion 2 checks that every listed path resolves, which is the opposite
> direction; nothing can compute which document a role NEEDS."

`roles/investigator.md`'s mandated-reading list resolves in full (both
`roles/_shared-dispatch-contract.md` and `schemas/finding.schema.json`
exist on disk, verified), so criterion 2 is and stays green on this exact
defect. The plan is explicit that only a reviewer reading the brief AS THE
AGENT would ever see it, which is this contract's entire reason to exist,
and it did.

**Why this belongs to B-PRIME and not Contract A**: criterion 2 (path
resolvability) is a schema/mechanical check and passes on the shipped
brief; no registered test or derived check can fail here because, per the
plan's own admission quoted above, none is capable of representing "the
role needs a document it wasn't given." This is a defect only a
brief-as-its-agent read exposes.

**Recommended concrete edit** (offered per the adversarial-plan-reviewer
convention, though I am not that contract): add
`schemas/report.schema.json` to `roles/investigator.md`'s mandated-reading
list. Whether `schemas/finding.schema.json` should also be removed is a
judgment call for the phase owner: an investigator's report does carry a
`findings[]` array (`schemas/report.schema.json`'s OWN local `$defs/finding`,
distinct from the top-level finding-set schema), so there may be no
investigator-side reason to read the top-level finding-set document at all.

Severity: HIGH. This is the single mandated-reading list in the phase that
is actually wrong for its role, it governs a criterion this very phase
struggled to deliver (criterion 6, unblocked only in the second
implementer's final session), and the plan itself flags the failure class
as one no gate can see.

### Finding 2 (MEDIUM): `incremental-output` is, by itself, an assertion;
the mechanism lives entirely outside the three briefs, and this phase's own
history is the evidence

Quoting `roles/_shared-dispatch-contract.md:17-27`:

> "Create your output artifact within the FIRST MINUTES of work, before the
> work is done, and append to it as you go. ... Write what you just tried,
> the command you ran, what it printed, what you concluded, and what you
> are about to do next. Do not save the write-up for the end and do not
> polish it as you go."

This is strongly worded, but it names no TRIGGER: no minimum cadence ("at
least every N minutes"), no event ("after every tool call" or "after every
distinct step"), and no self-check the agent is told to run against its own
behavior. It asks the agent to remember to keep writing while doing
something else, which is precisely the shape CLAUDE.md itself names as
insufficient elsewhere in this same repository: "A stated stall rule is not
sufficient. It addresses attention, and attention is what a busy session
does not have. This project has recorded twice that a rule depending on
memory does not survive." (CLAUDE.md, Dispatch contract section). The
clause quotes that exact lesson in its own text ("Measured cost of the
absence: two review agents died ... nothing had been written down") but
does not apply the lesson's own conclusion to itself: nothing MECHANICAL
compels the append.

The companion clause, `beacon-is-not-a-claim`, is honest about this: "The
two halves need each other. A watchdog watching freshness needs something
freshening, which is the clause above; and an agent freshening a file needs
something watching, which is the supervisor's duty." The actual enforcement
device -- the freshness watchdog -- is explicitly NOT the agent's job and is
not carried by any of these three briefs; it is the dispatching
orchestrator's separate obligation (CLAUDE.md's T-008 section,
`.claude/skills/phase-delivery/`). So `incremental-output`, read strictly as
text inside `roles/investigator.md`, `roles/plan-writer.md`, or
`roles/adversarial-plan-reviewer.md`, gives the dispatched agent a norm and
zero mechanism; the mechanism exists only in the pairing with an external,
unwritten-in-any-brief supervisor process.

This phase's own recorded history is consistent with exactly that: ONE
implementer working this same branch was terminated by a usage limit mid
task (`delivery/work-history/m3-p5.md:196`, `delivery/STATE.md:60`), and
its recovery worked because the file it had been appending to (the beacon)
existed and was salvaged, not because the clause prevented the interruption
-- it cannot, a usage-limit kill is not something a writing habit forestalls.
Per my dispatch, an implementer in this same phase also went roughly
twenty-five minutes with the beacon frozen while its tree kept changing,
recovering only after an external nudge; I was not able to independently
re-derive that specific episode from the committed branch history (see
"What this review did NOT cover"), so I report it as relayed context, not
as something I re-verified from git timestamps. Taken at face value, it is
a second, sharper confirmation of the same conclusion: the clause's own
prose ("append as you go", "do not save the write-up for the end") did not,
by itself, keep the beacon fresh; an external actor watching from outside
the brief did.

None of this means the design is wrong -- `beacon-is-not-a-claim` explicitly
built the supervisor side for exactly this reason, and CLAUDE.md's T-008
section documents that the split is deliberate. The finding is narrower:
the brief text, read as an instruction to the agent alone (which is
Contract B-PRIME's exact test -- "an agent handed ONLY this brief"), asserts
a behavior it cannot enforce and names no mechanical trigger the agent
itself could use to self-check ("have I written anything in the last N
minutes or M tool calls? If not, stop and write now."). A cheap edit would
add exactly that kind of self-trigger to the clause, which would make the
agent-side half load-bearing on its own instead of purely rhetorical.

Severity: MEDIUM. The two-halves design is sound and documented, and the
supervisor side is a real, separately-specified mechanism (per CLAUDE.md),
so this is not a "the rule does nothing" finding. It is that the brief text
itself, in isolation, is assertion rather than mechanism, and this phase's
own history is consistent with that gap actually manifesting.

### Finding 3 (LOW, not actionable, recorded for completeness): R-010a is
defined twice with different scopes, and it is intentional, not a defect

`roles/investigator.md`'s R-010a clause ("every claim carries file:line
evidence") and `roles/plan-writer.md`'s R-010a clause ("verify every input
claim against the code before planning a phase") read as different rules
under one clause id at first pass. I checked whether this is a drafting
error. It is not: `delivery/plan/kernel-plan-m3.md:3038` and `:3043`
explicitly call these the "investigator half" and the plan-writer's full
form of the SAME requirement row
(`delivery/requirements/migration-table.md:33`), and
`delivery/requirements/clause-map.json:152-156` anchors R-010a's clause-map
row to `roles/plan-writer.md` specifically, while the investigator's half is
the file:line-evidence portion of the same underlying requirement. No
agent-facing conflict follows from this: each brief only carries the half
relevant to its own role, and neither brief tells its agent something
untrue about what R-010a requires of THAT role. Recorded as checked and
cleared rather than left implicit.

### No other CLAUDE.md conflicts found

Checked in particular: em-dash usage (none found by reading), ASCII and
control-character cleanliness (measured below, clean), the citation form
`path.ext:LINE` outside backticks (all three briefs' prose citations of
R-004/R-005/R-006/R-010a/R-015a/R-092 use plain clause-id prose, not
file:line citations, which is consistent with how CLAUDE.md's own citation
rule is written -- it governs `delivery/` documents with `citationRequired`,
and these are `roles/` artifacts under a different verifier, `citations`
resolving what IS cited), the "cannot be forced" vs "did not find a way"
distinction (R-092's text uses the CORRECT, weaker form and explicitly
tells the investigator to avoid the stronger claim, matching CLAUDE.md's
claim-grep guidance rather than conflicting with it), and the
append-only-registry by-name-not-by-count rule (none of these three briefs
assert a registry count; that discipline is exercised in
`delivery/work-history/m3-p5.md` itself, which is Contract A/scope-gate
territory).

## ASCII / control-character checks (both, with `-a`, run over the four
brief files)

```
$ grep -raP '[^\x00-\x7F]' roles/investigator.md roles/plan-writer.md \
    roles/adversarial-plan-reviewer.md roles/_shared-dispatch-contract.md
(no output, exit 1)

$ grep -raP '[\x00-\x08\x0B\x0C\x0E-\x1F]' roles/investigator.md \
    roles/plan-writer.md roles/adversarial-plan-reviewer.md \
    roles/_shared-dispatch-contract.md
(no output, exit 1)
```

Both checks clean. No transliteration was needed (no captured tool output
appears in these four files).

## Environment / toolchain

```
$ node --version
v26.6.0
```
(toolchain prefix on PATH first, per dispatch instructions).
`node --test` could not complete on this worktree (missing `yaml` package
in the linked `node_modules`; see "What this review did NOT cover"). No
suite result is quoted here because none was obtained; this is Contract
A's territory in any case.

## Verdict

**CHANGES REQUIRED.**

Per-brief summary of what each leaves to guess and whether it rises to a
defect:

- **`roles/investigator.md`**: leaves the exact output filename/location to
  the dispatch prompt (not a defect; consistent with how every dispatch in
  this delivery, including mine, names the output path explicitly) and
  leaves "when is the mystery finished" to judgment (not a defect; matches
  R-092's "if it will not reproduce, ship the harness and say so" escape
  hatch). It DOES leave the investigator with the wrong schema to read for
  its own output shape -- Finding 1, HIGH.
- **`roles/plan-writer.md`**: leaves the exact plan file path/name to the
  dispatch prompt (not a defect, template exists at
  `templates/plan.example.yaml`) and leaves the DR-filing convention itself
  unstated in the brief body (not a defect; CLAUDE.md, which the same agent
  is bound by and which is auto-loaded in this repository, already states
  the `delivery/decisions/DR-nnnn-<slug>.md` convention). No defect found in
  this brief.
- **`roles/adversarial-plan-reviewer.md`**: leaves the exact severity
  taxonomy's ordering to be inferred from `schemas/finding.schema.json`'s
  comment rather than restating it in the brief body (minor, not a defect:
  the schema is correctly on this brief's mandated-reading list, unlike
  the investigator's). No defect found in this brief.

`incremental-output`/`beacon-is-not-a-claim`: as a PAIR, a real mechanism,
by design and by CLAUDE.md's own T-008 section. As TEXT INSIDE THESE THREE
BRIEFS ALONE, `incremental-output` is an assertion with no agent-facing
trigger, and this phase's own recorded interruption (and the reported,
not-independently-re-derived, 25-minute frozen-beacon episode) is
consistent with that gap. Finding 2, MEDIUM.

Nothing here is a manufactured finding: Finding 1 is a concrete,
demonstrated mismatch between a role's declared output type and its
mandated reading, verified against the actual schema and the actual
resolver code, and independently predicted as unreachable by any criterion
in the plan's own hazard table. Finding 2 is scoped to what the clause text
alone can and cannot do, not to the design as a whole, and says so.

## UPDATE, 2026-08-12T03:50Z: node_modules fixed, execution run, nothing
changed

The orchestrator identified and fixed an environment handicap: my
worktree's `node_modules` was a symlink to
`/home/user/tiphys-ai-helmsman/node_modules`, which was empty (the
`yaml` package this whole toolchain depends on was missing there, not
just in my link). After `npm ci` on the target of that symlink, the
package is present and I re-ran what my "did not cover" section said I
could not run.

### The suite, previously blocked, now green

```
$ node --version
v26.6.0
$ node --test test/roles.test.ts test/brief-compose.test.ts test/finding-schema.test.ts
i tests 24
i pass 24
i fail 0
i cancelled 0
i skipped 0
```

Toolchain node v26.6.0, `dist/` NOT built (I did not run `npm run build`;
this was three targeted test files, not the full `npm test` suite, and
Contract A is the acceptance-criteria walk, not mine), invocation was the
explicit file list above, not `npm test`. This is not a suite-result claim
for the phase; it is confirmation that the specific tests covering roles,
brief composition and the finding/report schemas pass on this head, and
that none of them catches Finding 1 (`grep -n "outputs\\b"
test/roles.test.ts test/brief-compose.test.ts` returns nothing: no test in
either file reads the `outputs` field at all, so nothing here was ever
positioned to catch a mandated-reading list that doesn't match a role's
declared output type).

### Finding 1, now a DEMONSTRATION rather than an argument, and it did not
weaken

Ran the composer directly on the investigator role, which is exactly what
CONTRACT-B-PRIME.md pointed at as "more informative than reading the
source":

```
$ node bin/tiphys.ts brief compose --role investigator \
    --phase templates/plan.example.yaml --phase-id M9-P1 \
    --out <scratch>/investigator-composed.md
exit=0
```

The composed brief (251 lines, saved to
`/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/p5-cr-b-ev/investigator-composed.md`)
opens:

```
# Brief: investigator

role: investigator
lifetime: One mystery
model-tier: strongest

## Mandated reading, in order

1. roles/_shared-dispatch-contract.md
2. schemas/finding.schema.json

...

## Outputs

- report
```

`grep -n "report.schema" <that file>` returns nothing across all 251
lines. This is the actual document an investigator agent receives from
`tiphys brief compose`, not my reading of the source frontmatter: it
declares `Outputs: report` and never mentions `schemas/report.schema.json`
anywhere, including in the rendered phase section at the bottom (checked in
full). Execution CONFIRMS Finding 1 exactly as argued from source: an
agent handed only this composed brief has no path to the schema governing
the shape of the one document type it is asked to produce.

**Finding 1 stands at HIGH, now demonstrated rather than merely argued.**
No refutation, no weakening, no widening beyond what was already written.

### Re-scoped "what this review did NOT cover"

The `node_modules`/`yaml` gap named above is RESOLVED and no longer part of
what this review could not do; the suite excerpt and the composed-brief
capture above supersede that bullet. What remains genuinely uncovered, per
my dispatch (Contract A is not mine) and per what I still cannot verify
from committed artifacts:

- Contract A's territory: the nine acceptance criteria executed, the
  pre-merge/post-merge re-walk, all 21 behaviors/9 witness specs resolving
  by name across the full suite, the scope audit. Not duplicated here.
- The full `npm test` / `npm run build` / gate-registry run at this head
  (I ran three targeted test files relevant to this contract's claims, not
  the whole suite or the build; that is Contract A's job).
- The "roughly twenty-five minutes frozen beacon, external nudge" episode:
  still not independently re-derived from git timestamps (the fix that
  unblocked `yaml` does not bear on this; it was never a tooling
  question, it is a question about session-internal mtimes not preserved
  in the committed history). Left as relayed context, as before.
- `roles/implementer.md`, `roles/clean-room-reviewer.md`, `AGENTS.md`: not
  M3-P5 artifacts, not read in depth.
