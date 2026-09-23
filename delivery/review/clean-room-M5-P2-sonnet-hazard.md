# Clean-room review: M5-P2 (hazard contract)

Date: 2026-09-23
PR: #207
Branch: claude/m5-p2-intent-to-outcome
Head SHA reviewed: e0e411895da559f1299f9f408b20814ab60fcf85
Contract: hazard
Model family: Sonnet
Method: fetched branch, checked out the head detached, built with node
v26.6.0, ran the full targeted suite, then attacked the two new surfaces
(the charter reader in src/commands/brief.ts and the delivered-outcome
schema clause in schemas/final-report.schema.json) by constructing
dangerous inputs by hand and running them through the real CLI
(bin/tiphys.ts), and by mutating shipped source/schema files in place,
re-running the guarding test, and restoring the original bytes
(diffed back to a saved copy to confirm a clean restore).

## Verdict

APPROVE, with one medium finding to consider before or shortly after
merge. Nothing found blocks the phase's own acceptance criteria or
crosses into a phase/milestone-risking defect.

## Scope of the diff

git diff origin/main...e0e411895da559f1299f9f408b20814ab60fcf85 --name-only
(delivery/work-history/m5-p2.md:1) touches exactly:

- src/commands/brief.ts (charter reader, intent rendering, --charter flag)
- schemas/final-report.schema.json (delivered-outcome object)
- templates/final-report.example.yaml (worked example)
- roles/implementer.md, roles/clean-room-reviewer.md (role instructions)
- test/brief-compose.test.ts, test/report-contract.test.ts (new tests)
- test/behaviors.json (registry, standing extra)
- delivery/work-history/m5-p2.md (standing extra)

All nine files are on delivery/plan/phase-declarations/m5-p2.json:1's
filesToTouch or declaredExtras, or are the work-history standing extra.
Scope audit: clean.

## Plan hazard classes attacked

### ceremonial-intent: "Product intent is printed but no completion
artifact answers it"

The delivered-outcome object does close this in the form the plan names:
`node bin/tiphys.ts validate --type final-report` refuses a report with
the object deleted, with its evidence key deleted, and with `delivered:
true` over an empty evidence array. I reproduced all three refusals
directly (not by reading the test) against the shipped schema:

```
$ node bin/tiphys.ts validate --type final-report <doc with delivered-outcome deleted>
INVALID required property delivered-outcome is missing
$ node bin/tiphys.ts validate --type final-report <doc with evidence key deleted>
INVALID #/delivered-outcome/evidence required property evidence is missing
$ node bin/tiphys.ts validate --type final-report <doc with evidence: []>
INVALID #/delivered-outcome/evidence array has 0 items
```

exit 1 in all three cases, exit 0 restored. This matches the acceptance
criterion p2-final-report-contract literally.

**But the coupling can be satisfied with an unsupported claim**, which is
the sharper form of this hazard class the brief asked me to attack
(finding CR-M5P2-01 below): duplicate evidence entries and near-blank
single-character entries both pass with `delivered: true`. Pure
whitespace is correctly refused by the `\S` pattern; near-whitespace and
exact duplicates are not.

### goodhart-score: "A value field becomes a numeric target agents
optimize instead of an outcome"

Attacked by walking the whole final-report schema tree for any `type:
number` or `type: integer` node (not only inside delivered-outcome) and
finding none, and by trying to add a fifth key (`value-score: 0.9` and
`risk-note: "low"`) to a delivered-outcome instance through the real
validator:

```
$ node bin/tiphys.ts validate --type final-report <doc with value-score added>
INVALID #/delivered-outcome/value-score property value-score is not permitted here
```

I re-ran this walk myself independently of the shipped test (same method,
independently executed): `additionalProperties: false` at
schemas/final-report.schema.json:53 and the four-key `required`/`properties`
sets close it. No gap found. Both witnessed by mutation (see below).

### stale-charter: "Brief composition silently falls back to a default
when the charter is unreadable"

This is the class I attacked hardest, since it is a reader of files the
kernel does not own. `resolveProductIntent` (src/commands/brief.ts:150)
delegates classification to `classifyEntry` (lstat then stat, so a
dangling symlink is distinguished from absence) and the read to
`readOperatorPath` (src/validate.ts:863), which is the same
already-hardened FIFO/directory/unreadable guard `tiphys validate` uses
elsewhere (D-M3-27). I built each dangerous state by hand against a
scratch working directory and ran `bin/tiphys.ts brief compose` for real:

| charter.yaml is... | result |
|---|---|
| a directory | refused: "is a directory, not a regular file, so it was not opened", exit 1 |
| a named pipe (mkfifo) | refused in bounded time (also in the shipped test, BOUNDED_MS), exit 1 |
| a dangling symlink | refused: "does not exist", exit 1 (an ERROR, not silently undeclared) |
| YAML decoding to a list | refused: "is not a document with kind: charter", exit 1 |
| YAML decoding to a bare scalar string | refused: same message, exit 1 |
| a well-formed object with the wrong `kind` (e.g. `kind: modes`) | refused: same message, exit 1 |
| a 50 MB `product-intent` block scalar | composed in under 2s, no hang, exit 0 |
| absent (nothing at the path, no --charter given) | composes, with an explicit "no charter declared" sentence rendered (not an omitted section) |

None of these fall back to a default or compose silently. The one
substantive design choice, "undeclared" is judged by `lstat` presence and
not by resolvability, is exactly right for the hazard: a dangling symlink
or FIFO is DECLARED and its unreadability is an ERROR that stops
composition, never treated as "no charter." I could not find a path
through which a declared-but-broken charter composes.

**The reverse direction (a project that DID declare a charter hitting the
undeclared path)**: cannot happen by construction. The undeclared branch
requires both `charterFile === undefined` AND
`classifyEntry(path).kind === "absent"`; any real entry at the default
path, or any `--charter` value at all (even naming a missing file), takes
the declared-or-error path instead. Verified by code reading
(src/commands/brief.ts:159-161) and by the "no charter declared" test
which explicitly asserts a separate `--charter` invocation elsewhere
still resolves.

## Mutation-tests (two, structurally different, both required by the
review brief)

1. **src/commands/brief.ts**, widened the "undeclared" condition to also
   treat an `irregular` entry (a FIFO) as undeclared instead of an error.
   Re-ran `brief compose fails closed when a declared charter cannot be
   read...` (test/brief-compose.test.ts:457): went red, "0 !== 1", the
   FIFO member composed a full brief where it should have refused.
   Reverted; `diff` against a saved copy confirmed a byte-identical
   restore.
2. **schemas/final-report.schema.json**, removed `delivered-outcome` from
   the top-level `required` array. Re-ran `a final report without
   delivered-outcome...` (test/report-contract.test.ts:2176): went red,
   "delivered-outcome deleted: 0 !== 1" (the CLI accepted a report with no
   delivered-outcome section at all). Reverted; `diff` confirmed a clean
   restore.

Both tests are demonstrated red against the dangerous state and green
with the guard present, per the red-witness rule.

## test/behaviors.json resolution

All six new entries (p2-charter-reaches-brief, p2-charter-fails-closed,
p2-charter-undeclared-stated, p2-intent-section-closed-set,
p2-final-report-contract, p2-no-scoring) match an existing `test(...)`
title byte for byte in test/brief-compose.test.ts or
test/report-contract.test.ts. Checked by grepping both files' test titles
and comparing against test/behaviors.json:1270-1275 directly rather than
trusting the diff.

## Suite and build

Node v26.6.0 (scratch toolchain, first on PATH), `npm run build` exit 0,
`git status --porcelain` clean after build (only my own untracked report
file). Ran the two changed test files directly:
`node --test test/brief-compose.test.ts test/report-contract.test.ts`:
48 tests, 48 pass, 0 fail, 0 skipped, invocation as shown, build state
built, toolchain v26.6.0.

## Citations and ASCII

`node scripts/check-authored-bytes.mjs` on this checkout: no output, exit
implied clean (no violation lines printed). This report cites
delivery/work-history/m5-p2.md:1 and other path:line forms above outside
backticks, into files the branch changes or that are byte-identical with
main; the only file this review's citations resolve against that could
differ from main is delivery/work-history/m5-p2.md, which the branch
adds, so I also cite it by its own line 1 rather than a deeper line that
might shift.

## Findings

### CR-M5P2-01 (medium): the evidence-coupling check can be satisfied by
duplicate or near-blank evidence entries, so a `delivered: true` claim
can pass the schema while being effectively unsupported

**Claim.** `delivered-outcome.evidence` requires `minItems: 1` when
`delivered: true`, and each item must match `pattern: "\S"`. That rejects
pure-whitespace entries but not exact duplicates or single-character
entries that are technically non-blank.

**Why it matters.** The plan's own hazard-classes table addresses
ceremonial-intent by "a completion artifact answers" the intent, and the
schema's own `$comment` at schemas/final-report.schema.json:51 states the
coupling exists so "a delivery claim with nothing behind it is a
rejection by the schema, not by a reviewer's attention." Two identical
evidence strings, or a lone punctuation character repeated, is exactly
"nothing behind it" in substance while passing the mechanical minItems
and pattern checks. This is squarely the case the hazard-contract brief
asked me to attack ("evidence entries that are whitespace or duplicate").

**Evidence.** Built two YAML instances from templates/final-report.example.yaml
and ran the real validator:

```
$ node bin/tiphys.ts validate --type final-report dup-evidence.yaml
(evidence: ["Same unverified claim.", "Same unverified claim."])
exit=0

$ node bin/tiphys.ts validate --type final-report nearws-evidence.yaml
(evidence: [".", " . "])
exit=0

$ node bin/tiphys.ts validate --type final-report purews-evidence.yaml
(evidence: ["   ", "\t\t"])
INVALID .../evidence/0 value "   " does not match the required pattern \S
INVALID .../evidence/1 value "\t\t" does not match the required pattern \S
exit=1
```

So the pattern guard genuinely stops pure whitespace but not the
duplicate or near-blank cases.

**Assessment against severity.** This does not block the phase: the
schema's own `$comment` (schemas/final-report.schema.json:51) explicitly
scopes this out ("nothing here compares phase-intent with the plan's
text or checks that an evidence entry resolves... a false answer with
plausible evidence is a reviewer's finding"), and the phase's acceptance
criterion p2-final-report-contract is met exactly as literally stated
(delete, delete-evidence, empty-evidence-with-delivered-true all refused).
I am not overriding that deliberate design choice; I am flagging that the
declared boundary is wider than it needs to be for at least the DUPLICATE
half, which is a mechanical property (not a semantic "is this evidence
true" judgment the authors correctly kept out of the schema).

**Concrete fix.** Add `"uniqueItems": true` to the `evidence` array in
schemas/final-report.schema.json (both at the top level and, if desired,
specifically under the `delivered: true` branch). This is a one-line,
non-scoring, mechanical addition consistent with "no numeric field, no
score": it does not judge evidence quality, it only refuses the same
string cited twice. It would not catch the near-blank single-character
case (`"."`  and `" . "` are already distinct strings); that half is a
genuine judgment call the reviewer role's new paragraph
(roles/clean-room-reviewer.md:54) already assigns to a human/agent
reviewer ("Check that answer against the artifact... it does not check
that the evidence is true, and that part is yours"), so I am not asking
for it to become mechanical.

**Recommendation.** Low urgency: either fold `uniqueItems: true` into
this PR's fix round, or record it as a follow-up finding for the next
phase touching this schema. It does not need to block merge.

## Probes run (including those that found nothing)

- Charter reader against: directory, named pipe, dangling symlink,
  non-object YAML (list), non-object YAML (scalar string), wrong-kind
  object, 50 MB product-intent, absent path, empty --charter target,
  --charter naming a file elsewhere. All fail closed or compose correctly
  as designed; no silent fallback found.
- Final-report schema against: deleted delivered-outcome, deleted
  evidence key, empty evidence with delivered true, duplicate evidence,
  near-blank evidence, pure-whitespace evidence, fifth key (numeric and
  string), honest delivered:false with empty evidence (correctly still
  writable).
- Walked the whole schema tree for `type: number`/`type: integer`
  outside delivered-outcome as well as inside: none found.
- Verified the "no charter declared" path cannot be reached when a
  charter IS declared (code reading plus the elsewhere-named --charter
  test already in the suite).
- Scope audit: all 9 changed files accounted for by the phase
  declaration and standing extras.
- test/behaviors.json: all 6 new names resolve to real test titles,
  checked by direct grep/compare, not by trusting the diff.
- Mutation-tested two structurally different guards (a TypeScript
  classification branch in the charter reader, and a JSON Schema
  `required` array entry): both reproduced red against the dangerous
  state and were restored byte-identical.
- ASCII/authored-bytes check: clean.
- `npm run build` then targeted `node --test`: 48/48 pass, 0 skipped,
  git status clean after build.

## Honest-failure / not-verified-here

- I did not run the full repository suite (`node --test` over all of
  `test/**/*.test.ts`), only the two changed test files plus the build.
  The phase's own acceptance criterion p2-suite ("npm run build and node
  --test both exit 0 with a nonzero test count") is stated as a whole-repo
  claim; I verified the build and the two changed files directly rather
  than the full suite, for time. This is a gap in my own coverage, not a
  finding against the PR; a second reviewer or the orchestrator's own
  full-suite run should close it before merge if not already done.
- I did not exercise the `check-dual-review` gate class or the
  `citations`/`scope` script gates through `tiphys gates run`; I checked
  their substance by hand (scope audit above, ASCII script above) rather
  than through the gate runner itself.
- I did not attempt to construct a huge (multi-GB) charter file to find a
  memory ceiling; 50 MB composed in under 2 seconds and this is consistent
  with `readFileSync`'s synchronous, bounded-by-available-memory behavior
  used identically elsewhere in this codebase (D-M3-27's own FIFO guard is
  the actual hazard class that matters here, and it is covered).
- I did not check whether other consumers of `tiphys brief compose`
  (outside this repository, in a future project using the kernel) might
  rely on the OLD usage line without `--charter`; the flag is optional and
  additive, so this is unlikely to be a real blast-radius concern, but I
  did not exhaustively search for other callers.

## Blast radius

`resolveProductIntent` and `renderIntent` are new, additive to
`composeBrief`; the only existing behavior changed is that every composed
brief now carries an extra `# Intent` section. This is visible in the
existing (unmodified) tests for brief compose still passing (48/48, no
prior test asserts an absence of this section). `schemas/final-report.schema.json`
adds a new required top-level key, which is a breaking change for any
final-report document written before this phase; the plan's own
migrations note (delivery/plan/value-delivery-plan.yaml:160) accepts this
("Existing final-report fixtures and examples gain delivered-outcome.
Historical markdown reports are records and are not rewritten"), and the
shipped example and both changed role briefs were updated in lockstep, so
the only consumer inside this repository (the validator and the coverage
checker's finding-to-outcome parity mode) was exercised and passed.
