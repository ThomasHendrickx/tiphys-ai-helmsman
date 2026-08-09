# Clean-room review: M3-P3, consumer lens (third review contract, DR-0016)

- date: 2026-08-09
- phase: M3-P3 (assurance modes and role-to-model configuration)
- head reviewed: `b8715004e313cdf1cb88b485def074113a81ae33` (fix round 2 head,
  detached worktree `wt-m3p3-cr-c`)
- lens: CONSUMER. Tiphys is an npm package that will run delivery for OTHER
  projects. This review does not re-walk the twelve acceptance criteria
  (`clean-room-m3-p3-criteria.md`, done, at head `7b3afbf`) and does not
  re-attack the invisible-downgrade class (`clean-room-m3-p3-hazard.md`,
  done, same head). Both are read for context; neither is repeated here. Not
  re-reported either: duplicate mode ids, `mode show` serving without
  validating, containment-versus-equality in the conditions check (all three
  independently confirmed CLOSED), and the three open `quotableUnits()`
  findings a fresh implementer is fixing concurrently.
- method: built TWO scratch consuming projects OUTSIDE this repository and
  pointed the shipped `tiphys validate` / `tiphys mode show` commands at them
  with `--context`, using the built `dist` is not required since sources run
  natively:
  - `consumer-project/`: a project with its own vocabulary (mode id
    `standard`, stages `design`/`implement`/`review`/`merge`), to test
    whether the shipped schema can express a governance regime this project
    did not anticipate.
  - `consumer-project-compliant/`: a project that adopts Tiphys's own three
    mode ids and thirteen stage ids exactly, with its own `gate-registry.yaml`
    and (added incrementally) its own `schemas/charter.schema.json`, to
    isolate which parts of validation succeed for a fully-cooperative
    consumer versus which fail regardless of cooperation.

  This is the part neither prior review did; both said so under their own
  "did not cover" sections.

**VERDICT: CHANGES REQUIRED for consumer fitness.** Every finding below is
about the gap between what M3-P3 says it ships ("Tiphys is a delivery-process
kernel... that will run orchestrated delivery for other projects") and what a
project other than this one can actually receive from it. Two findings (CR-001,
CR-002) are read as genuine defects because they contradict the phase's own
stated intent without the phase saying so; the others are limits that are real
today, are not necessarily wrong to ship at M3, but are currently undisclosed
and belong on the record before M4 harness work is built on top of them.

## CR-001 (HIGH): the mode, stage and role vocabularies are closed to exactly this repository's own ids, tripled across schemas, with no extension point

**Mechanism:** `schemas/assurance-modes.schema.json`'s `$defs.modeShape.id` is
`"enum": ["full", "direct-pr", "local-only"]`, `$defs.stageId` is a thirteen-item
closed enum naming exactly the process document's own stages, and
`schemas/role-model-config.schema.json`'s `$defs.roleBinding.role` is a
six-item closed enum naming exactly blueprint section 6's own roles. Every
object level in both schemas carries `additionalProperties: false`. The same
mode-id enum is declared a THIRD time in `schemas/gate-registry.schema.json`
(`gates[].modes` items) and a FOURTH time in `schemas/charter.schema.json`
(`delivery-mode` and `assurance-tier`). The schema's own `$comment` on `id`
says this plainly: "Closed here and closed again in gate-registry.schema.json's
`modes` item enum and in schemas/charter.schema.json's `delivery-mode` enum,
which is three copies of one list." The comment reasons about drift between
the three copies of ITS OWN list. It never asks whether the list itself should
be closed to one project's vocabulary, because that question is outside the
frame the phase was reviewed under (criteria: does this repo's document
validate; hazard: can a downgrade hide) and inside the frame this lens is
assigned.

**This is the direct, first answer to the review's starting question 3.**
`full`, `direct-pr`, `local-only` are not examples of a mode-id shape a
consumer may extend; they are the complete and only admissible set, and the
stage vocabulary a mode's `pipeline[]` may draw from is likewise exactly
Tiphys's own thirteen. A downstream project cannot declare a mode called
`standard`, cannot name a pipeline stage `design` or `code-review` or
`security-scan`, and cannot name a role anything other than one of
`orchestrator`, `investigator`, `plan-writer`, `adversarial-plan-reviewer`,
`implementer`, `clean-room-reviewer`. The document types this phase ships are
not "assurance modes, as a concept, encoded so any project can declare its
own" - they are Tiphys's own configuration, wearing a schema that looks like a
kernel type because it lives beside the other kernel types.

**Reproduction, own vocabulary rejected (mode id, stage ids):**

```
$ cat consumer-project/assurance-modes.yaml
modes:
  - id: standard
    declared-by: "Acme Corp engineering handbook, section 4"
    pipeline: [design, implement, review, merge]
    skips: []
    gate-sets: []
    merge-authority: owner

$ node bin/tiphys.ts validate --type assurance-modes consumer-project/assurance-modes.yaml
INVALID #/kind required property kind is missing
INVALID #/modes/0/gate-sets array has 0 items, fewer than the required minimum 1
INVALID #/modes/0/id value "standard" is not one of the permitted values "full", "direct-pr", "local-only"
INVALID #/modes/0/pipeline/0 value "design" is not one of the permitted values "intake", "verification-pass", "plan", "adversarial-plan-review", "implement", "clean-room-review", "fix-round", "fix-round-verification", "merge-on-green", "orchestrator-diff-review", "deploy-verify", "migration-verify", "final-report"
INVALID #/modes/0/pipeline/2 value "review" is not one of the permitted values [same 13]
INVALID #/modes/0/pipeline/3 value "merge" is not one of the permitted values [same 13]
INVALID #/version required property version is missing
exit=1
```

(`kind`/`version` are separately-required fields and would also need fixing;
the point is the closed enums reject the vocabulary itself, independent of
those.)

**Reproduction, own role vocabulary rejected:**

```
$ cat role-model-config.yaml
roles:
  - role: backend-developer
    tier: cheaper
    charter-override: allowed
    rationale: "Acme's own role table, section 2"

$ node bin/tiphys.ts validate --type role-model-config role-model-config.yaml
INVALID #/roles/0/role value "backend-developer" is not one of the permitted values "orchestrator", "investigator", "plan-writer", "adversarial-plan-reviewer", "implementer", "clean-room-reviewer"
exit=1
```

**The field the plan actually discusses turns out no more open than the ones
it doesn't.** `merge-authority`'s three values are explicitly defended in the
plan text as being kept representable "because a future project may declare
any of them and the kernel is not the place to make another project's
governance unrepresentable." That reasoning was applied to one field. It was
not applied to `id`, to `pipeline[]`'s stage vocabulary, or to `role`, and
none of those three has a comparable defense in the schema, the plan section
quoted at the top of this report, or the acceptance criteria. A consuming
project whose real governance is, for instance, "any two of five named
reviewers must approve" cannot express that in `merge-authority` either, so
even the one field with a stated defense is empirically as closed as the
three that have none.

**What this is not:** it is not a claim that M3 should have built a fully
open configuration language. `additionalProperties: false` and closed enums
are DR-0013's own authoring convention, applied consistently and for reasons
that make sense for validating THIS repository's own artifacts. The defect is
narrower and sharper: the phase's own framing text (kernel plan M3-P3's
grounding paragraph, and the top-level document description "One document per
repository... which pipeline stages each runs") reads as if this is a general
artifact type, and nothing anywhere states that it is closed to this
project's vocabulary until a reader manually diffs the enum against their own
plan. That silence is the defect, not the closedness itself.

**Recommended disposition:** write down, wherever `assurance-modes.yaml` and
`role-model-config.yaml` are introduced (schema `description`, `schemas/README.md`,
or the honest-scope note), that these are Tiphys's OWN declared modes/stages/
roles, not an open vocabulary a consuming project can populate with its own;
and record whether extending the vocabulary for other projects is in scope
for M4 or is a permanent one-repository-only design. Either answer is fine;
the current silence, next to prose that says Tiphys "will run orchestrated
delivery for other projects," is not.

## CR-002 (HIGH): a fully-compliant consumer still cannot get a clean `validate` without building this repository's own charter apparatus, and cannot get one without `--context` at all

**Mechanism:** `charter-mode-enum-matches-modes` (`src/checks.ts:580-632`) is
registered for type `assurance-modes` with `requiresContext: true` and NO
conditional gate on the document's own content (contrast
`mode-conditions-quote-granted-by`, which only acts when a mode declares
non-empty `conditions[]` - see CR-003). It unconditionally reads
`<context>/schemas/charter.schema.json`, and unconditionally requires that
file's `delivery-mode` and `assurance-tier` properties to carry an `enum`
that is exactly the set of mode ids the instance declares.

Combined with `runChecks`'s policy that a `SKIPPED <id> no context` line
makes the run fail (`src/checks.ts:1003-1029`, `failed: violationLines.length
> 0 || skippedLines.length > 0`), there is no path to a clean
`tiphys validate --type assurance-modes` for ANY consumer:

- Omit `--context`: `charter-mode-enum-matches-modes` and
  `mode-gate-sets-resolve` both report `SKIPPED ... no context` and the
  command exits 1, regardless of how correct the document is.
- Supply `--context` without a `schemas/charter.schema.json` at that exact
  relative path: `charter-mode-enum-matches-modes` fails with "the charter
  schema could not be read."
- Supply one, but with different property names, a different file location,
  or an enum that does not exactly equal the declared mode-id set: it still
  fails.

The ONLY way to reach exit 0 is to adopt Tiphys's own two charter field names
(`delivery-mode`, `assurance-tier`) at Tiphys's own relative path
(`schemas/charter.schema.json`, under whatever `--context` directory is
given), with an enum kept in lockstep with the modes document. A consuming
project with no charter concept at all, or with a governance-declaration file
under a different name, a different shape, or a different location, cannot
validate its own `assurance-modes.yaml` cleanly no matter how correct that
document otherwise is.

**Reproduction**, using `consumer-project-compliant/`, which by this point
already uses Tiphys's exact mode-id and stage vocabulary (CR-001's fix
assumed) and ships its own `gate-registry.yaml`:

```
$ node bin/tiphys.ts validate --type assurance-modes --context consumer-project-compliant consumer-project-compliant/assurance-modes.yaml
INVALID #/modes the charter schema could not be read, so its mode enum could not be compared with assurance-modes.yaml: .../consumer-project-compliant/schemas/charter.schema.json does not exist (check: charter-mode-enum-matches-modes)
exit=1

# add schemas/charter.schema.json with delivery-mode/assurance-tier enum ["full","direct-pr","local-only"]
$ node bin/tiphys.ts validate --type assurance-modes --context consumer-project-compliant consumer-project-compliant/assurance-modes.yaml
INVALID #/modes assurance-modes.yaml declares mode ids [full] and the assurance-tier enum in .../schemas/charter.schema.json is [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
INVALID #/modes assurance-modes.yaml declares mode ids [full] and the delivery-mode enum in .../schemas/charter.schema.json is [direct-pr, full, local-only]; the two must be equal (check: charter-mode-enum-matches-modes)
exit=1

# narrow the charter enum to exactly the one declared mode id
$ node bin/tiphys.ts validate --type assurance-modes --context consumer-project-compliant consumer-project-compliant/assurance-modes.yaml
exit=0

# and without --context at all, even on this now-fully-passing document:
$ node bin/tiphys.ts validate --type assurance-modes consumer-project-compliant/assurance-modes.yaml
SKIPPED charter-mode-enum-matches-modes no context
SKIPPED mode-conditions-quote-granted-by no context
SKIPPED mode-gate-sets-resolve no context
exit=1
```

**Why this is a defect and not just "cross-document checks need context",
which the plan already concedes** (arbitration mechanism 5, ruled: this
phase ships the repository's first two `requiresContext: true` checks, and
criterion 1's literal command is now known to need `--context`). That ruling
is about the VALIDATE INVOCATION needing a flag. It says nothing about
`charter-mode-enum-matches-modes` requiring a SPECIFIC OTHER ARTIFACT, with a
specific shape and a specific location, to exist at all. `mode-gate-sets-resolve`
also needs `--context`, but what it needs there is a document the consumer
would build anyway to run gates (`gate-registry.yaml`), in a shape whose
GATE IDS are free-form (`^[a-z0-9][a-z0-9-]*$`). `charter-mode-enum-matches-modes`
needs a document (a JSON Schema, not a data file) whose EXISTENCE, path and
two property names are all this-repository conventions with nothing in the
`assurance-modes.yaml` schema, its description, or the honest-scope note
telling a consumer that adopting `assurance-modes.yaml` also means adopting
a `charter.schema.json` shaped exactly like this one's.

**Recommended disposition:** either document the coupling explicitly (an
`assurance-modes` document is only independently valid together with a
charter schema of this shape, at this path - state it as a precondition in
the schema description and in whatever M4 harness-adoption guide exists), or
make the check's target configurable (a `--charter-schema <path>` /
convention-over-configuration escape hatch), or split it so a consumer can
ask "is this modes document internally consistent" without also being asked
"does some other file four directories over happen to exist." Any of the
three is a defensible design choice; shipping none of them, silently, is the
finding.

## CR-003 (LOW, write-down): `mode-conditions-quote-granted-by` requires context it may never use

**Mechanism:** the check is `requiresContext: true` unconditionally
(`src/checks.ts:843-846`), but its own `run()` is a no-op for every mode
whose `conditions` array is empty or absent (`src/checks.ts:907-911`, `if
(conditions.length === 0) continue;`). So a consumer whose modes never use
`merge-authority: delegated-under-conditions` still gets
`SKIPPED mode-conditions-quote-granted-by no context` whenever `--context`
is omitted, for a check that would have produced zero violations even had
context been supplied. Contrast `mode-gate-sets-resolve`, which genuinely
always needs context because `gate-sets` has `minItems: 1` and is therefore
never empty.

**Reproduction:** shown above, in CR-002's third block - the compliant
consumer's `full` mode uses `merge-authority: owner`, never
`delegated-under-conditions`, and the skip still fires.

**Why this is LOW rather than a numbered defect on its own:** because
`mode-gate-sets-resolve` already forces every consumer to supply `--context`
regardless (gate-sets can never be empty), this imprecision changes nothing
observable today. It is named because it is a second instance of the SAME
shape as CR-002 - a check whose `requiresContext` flag is broader than the
condition under which it actually has something to check - and because a
future relaxation of `gate-sets`'s `minItems` (for a mode that legitimately
selects no additional gates beyond the mandatory ones) would silently turn
this from cosmetic into another always-fails-without-context trap, in the
same file, for the same reason CR-002 exists.

## CR-004 (MEDIUM): the disclosures a consuming project would need are the ones that never ship

**Mechanism, with two structurally different members, per this project's own
"one witness is not a class" rule.**

**Member 1: `tiphys mode show` discloses nothing about execution status,**
and the ONE place that does (the plan's honest-scope note: "M3 never
executes `direct-pr` or `local-only`... witnessed by validation and by
`mode show`, not by execution") lives in `delivery/plan/kernel-plan-m3.md`,
which `package.json`'s `files` list excludes from the shipped package:

```
$ npm pack --dry-run 2>&1 | tail -5
npm notice package size: 344.9 kB
npm notice unpacked size: 1.2 MB
npm notice shasum: 8e32e7a0e8047b430b5ba9b88ed1a0a0dedbaf5b
npm notice total files: 123
```

123 files, enumerated in full during the run: `dist/**`, `gate-registry.yaml`,
`role-model-config.yaml`, `schemas/**`, `templates/**`, `package.json`. No
`delivery/`, no `CLAUDE.md`, no `MECHANISMS.md`. `schemas/README.md` DOES
ship (confirmed in the same listing) and says nothing about mode execution
status either (read in full; it covers the schema dialect, the Ajv
configuration and the authoring vocabulary only).

`tiphys mode show --mode direct-pr` and `--mode local-only` both exit 0 and
print a pipeline and a `gate-sets` list in exactly the same format and the
same tone of confidence as `--mode full`:

```
$ node bin/tiphys.ts mode show --mode direct-pr
mode: direct-pr
merge-authority: owner
pipeline:
  intake
  plan
  implement
  merge-on-green
  final-report
skips:
  verification-pass
  adversarial-plan-review
  clean-room-review
  fix-round
  fix-round-verification
  deploy-verify
  migration-verify
gate-sets:
  manifest-self-check
  coverage
  credential-scrub
  credential-token
  suite
  citations
  scope
  clause-map
  red-witness
  agent-rules-drift
  unit-tests-for-changed-service-methods
  fixtures-for-changed-component-states
declared-by: blueprint section 8 row 2, "implement + gates, no adversarial layers", with merge authority `owner` from the same row.
exit=0
```

There is no line anywhere in this output, or in `mode.ts`'s `--help`-equivalent
usage string, saying that this mode, unlike `full`, has never been run
end-to-end by the project that built it. The command's own doc comment says
its purpose is "so a brief or a human can read what a declared mode requires
WITHOUT PARSING YAML BY HAND" (`src/commands/mode.ts:5-7`, emphasis added) -
i.e., it is explicitly the interface for a reader who has not gone and read
the plan. That reader gets a printout that looks exactly as authoritative for
`direct-pr` as for `full`.

**Member 2, structurally different, same class:** the `mode-conditions-quote-
granted-by` check's own known limitation (no-fabrication, not
no-omission-detection - already conceded in the phase's own work history and
explicitly out of scope for this review to re-litigate as a functional gap)
likewise does not survive into anything a consumer can read. The extensive
comment stating this ("WHAT THIS DOES NOT DO, stated here and not only in the
work history", `src/checks.ts:757-765`) is source-only:

```
$ grep -n "modeConditionsQuoteGrantedBy\|fabrication\|omission" dist/src/checks.d.ts
198:export declare const modeConditionsQuoteGrantedBy: DerivedCheck;
```

The declaration ships; the caveat attached to it does not, because TypeScript
`.d.ts` generation does not carry an internal implementation comment forward
onto a `const X: Type = {...}` object-literal export the way it does for a
function signature. (Contrast `dist/src/modes.d.ts`, which DOES retain
`modes.ts`'s full module-level doc comment including the "M3 never executes"
sentence - so the disclosure that DOES ship is reachable only by a
TypeScript-literate consumer who opens that specific `.d.ts` file, not by
anyone using the CLI, and not by anyone reading `role-model-config.yaml`'s or
`assurance-modes.yaml`'s sibling check.)

**Why MEDIUM and not a hard blocker:** nothing here produces a wrong answer;
`mode show`'s output for `direct-pr` and `local-only` is factually accurate
data from a validated document. The gap is entirely in what is NOT said, and
it recurs in the same direction both times: the honesty this project
practices about the limits of its own work (the honest-scope note, the
work-history caveats, this very phase's own hazard-mapping discipline) is
real and is written down carefully - and consistently lands in the one place
(`delivery/`, or stripped source comments) that this project's own rules
(CLAUDE.md: "`delivery/` is... not a kernel deliverable") guarantee will
never reach the audience the honesty is about.

**Recommended disposition:** for member 1, either have `mode show` print an
explicit annotation for any mode not equal to whatever mode id the shipping
process itself exercises (a per-mode `executed-by` or `witnessed-by` field in
`assurance-modes.yaml` would let this generalize to a consumer's own modes
too, which member 1's fix should not hard-code to `full` by name), or accept
this as a documented limit and say so in `schemas/README.md`, which does
ship. For member 2, move the no-omission caveat (or a shortened form of it)
into the schema's own `$comment` on `conditions`/`merge-authority`, since
`schemas/` ships and `src/checks.ts` does not.

## Limits worth writing down (not defects)

- **Decision-record resolution is hardcoded to two directory names.**
  `mode-conditions-quote-granted-by` looks for a `granted-by` record only
  under `<context>/delivery/decisions/` or `<context>/decisions/`
  (`DECISION_DIRECTORIES`, `src/checks.ts:770`). A consumer whose governance
  records live under, say, `docs/decisions/` or `governance/` cannot use
  `merge-authority: delegated-under-conditions` until they adopt one of the
  two hardcoded names, or the kernel gains a configurable path. The check
  fails CLOSED in that case (a clear "no decision record ... was found"
  message, never a silent pass), which is the right failure mode; it is
  named here as a real, narrow ergonomic limit rather than a defect.
- **`assurance-modes.yaml` and `role-model-config.yaml` are each "one
  document per repository"** (both schemas' own `description` fields say
  so) at a fixed filename resolved by walking up from the installed module
  (`packageRoot()` in `modes.ts`) or passed explicitly with `--file`/
  `--context`. This is a reasonable, disclosed convention (comparable to
  `package.json` at a project root) and is not treated as a finding.
- **The mode vocabulary question (CR-001) may be an intentional M3-scope
  boundary rather than an oversight** - nothing in the plan says otherwise,
  but nothing says it IS the boundary either. This review cannot settle which
  it is; it can only show, with a reproduction, that the vocabulary is
  closed and that the phase's own framing language does not say so.

## What this review did NOT cover

- The twelve acceptance criteria (done, twice, independently, both APPROVE on
  the mechanical facts) and the invisible-downgrade hazard class (done,
  independently) were deliberately not re-walked. Where this report's
  findings touch code those reviews also read (`charter-mode-enum-matches-modes`,
  `mode-conditions-quote-granted-by`), it is to ask a DIFFERENT question of
  the same code, not to re-verify their findings.
- The three open `quotableUnits()` findings (code-fence state, indented-heading
  detection, over-strict unit merging) were not re-investigated; a fresh
  implementer is fixing them concurrently and this lens was told not to
  re-report them. If any fix to that function changes the shape of CR-004's
  member 2 (for example, by adding a caveat comment above the exported
  `quotableUnits` function itself, which WOULD ship since it is a named
  export), that is worth a fast re-check, not assumed here.
- This review did not build a THIRD scratch project attempting `merge-
  authority: delegated-under-conditions` end to end from a consumer's own
  decision-record directory; the "Limits worth writing down" section states
  the mechanism from reading the code (`DECISION_DIRECTORIES`) rather than
  from an executed reproduction. The mechanism is simple enough (two
  hardcoded strings, `readdirSync` against them) that a repro was judged
  lower value than the four executed reproductions above; if that judgment is
  wrong, it is a fifteen-minute follow-up, not a re-scope.
- No CI run was observed on this head, including the `main` push arm (same
  gap the arbitration document already recorded for the first round; T-009
  applies unchanged).
- This review did not audit `src/commands/mode.ts`'s or `src/modes.ts`'s
  behavior on Windows-style paths, CRLF line endings, or non-ASCII prose in a
  consumer's own `declared-by` field. Nothing in the starting brief pointed at
  encoding as the likely fault line for the CONSUMER lens specifically (as
  opposed to the hazard lens, which owns invisible-downgrade encodings), and
  time was spent instead on the two structural findings (CR-001, CR-002) that
  the reproduction method this contract required (a real scratch consuming
  project) surfaced first and hardest.
- This review did not re-run `node --test` to completion inside the time box
  used for the reproductions above; a background run was started
  (`node --test`, working directory `wt-m3p3-cr-c`) but its result is not
  used as evidence for or against any finding in this report, all of which
  are demonstrated by direct CLI reproduction against scratch fixtures rather
  than by the registered suite.
- This review did not examine M3-P5's role-brief schema, M3-P6, or M3-P9's
  consumption of `assurance-modes.yaml` / `role-model-config.yaml`, all of
  which are separate phases; CR-001's finding that the vocabulary is closed
  will interact with whichever of those phases is meant to let a consuming
  project's own charter select a mode, and that interaction was out of scope
  for a single-phase consumer lens.
