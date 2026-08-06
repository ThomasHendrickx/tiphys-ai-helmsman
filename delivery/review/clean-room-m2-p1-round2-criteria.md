# CR-880 Delta Review, Fix Round 1 of PR #11

Reviewer: CRITERIA-CONTRACT
Branch: claude/m2-p1-gate-contract-and-runner
Head under review: 3c7970b
Previous reviewed head: ac3b2f6 (all 16 criteria MET)
Status: IN PROGRESS

## Log

## Setup

- Worktree: scratchpad/m2p1-d-criteria/repo, detached at 3c7970b. npm ci clean, exit 0, 0 vulnerabilities (Node 26.6.0 / npm 11.18.0 from scratch toolchain).
- Fetched origin/claude/m2-era-paperwork (c0343a1) for amended plan text and prior reviews.
- Delta commits: ac3b2f6..3c7970b = two commits (4d7f5d9, 3c7970b), 13 files changed (2396 ins / 91 del).
- SCOPE (full PR envelope, base = origin/main 037477e, not local stale main bcefc98):
  git diff --name-only 037477e..3c7970b = 16 files exactly:
  .github/workflows/gates.yml, delivery/work-history/m2-p1.md, gates.manifest.json,
  package.json, src/cli.ts, src/commands/gates.ts, src/gates/manifest.ts,
  src/gates/pin.ts, src/gates/result.ts, src/gates/run.ts,
  src/gates/schemas/gate-manifest.schema.json, src/gates/schemas/gate-result.schema.json,
  src/gates/validate.ts, test/behaviors.json, test/gates.test.ts, test/pin.test.ts
  This matches the plan's M2-P1 files-to-touch (11 create + src/cli.ts, .github/workflows/gates.yml,
  package.json = 14) plus the two standing pre-authorized extras (test/behaviors.json,
  delivery/work-history/m2-p1.md) = 16. NOTE: local `main` was stale (bcefc98); origin/main
  (037477e) is the real merge base and is what the 16-file claim resolves against, not
  ac3b2f6..3c7970b directly (13 files, that is only the fix-round delta). No delivery/plan/
  edit, no bin/tiphys.ts, no src/task.ts, no src/lock.ts anywhere in either diff. SCOPE: PASS.

- REGISTRY: test/behaviors.json ac3b2f6=186 keys, 3c7970b=199 keys, origin/main=162 keys.
  Programmatic diff: added=13 (gate-branch-matches-anchored-and-escaped,
  gate-declared-not-applicable-not-green, gate-duplicate-id-message-in-table,
  gate-evidence-directory-is-claimed, gate-file-absent-precondition,
  gate-pin-disagreement-is-error, gate-runner-crash-is-error-with-summary,
  gate-self-check-units-match-label, gate-success-path-needs-a-green,
  gate-vacuous-flag-not-gate-authored, gate-validator-ajv-seam-divergences,
  pin-restored-mtime-still-differs, pin-vacuity-floor), removed=0 (both vs ac3b2f6 and
  vs origin/main). Matches implementer's claim (199, 13 added, 0 removed) exactly.
  Resolution by name checked: all 13 new ids map to a distinct test() description in
  test/gates.test.ts / test/pin.test.ts (sampled all 13, not just some -- cheap to do
  exhaustively since count is small). No shared registry check script exists in the repo
  (grep for behaviors.json usage in src/test returns nothing); resolution is by
  description-matching convention only, same as the rest of the project. REGISTRY: PASS.

## Aggregate rule (amended criterion 9 shape), own fixtures

Built three independent manifests against the compiled dist/bin/tiphys.js (not test
harness code), run via `tiphys gates run`:

- Fixture A: gate-authored not-applicable (gate exits 20, writes its own not-applicable
  record, required, no precondition on the manifest). Result: exit 21, reason
  "no applicable gate", counts {declared:1, applicable:0, verdict:0, green:0, red:0,
  not-applicable:1, error:0, vacuous:0}.
- Fixture B: runner-evaluated precondition unmet (file-exists on an absent path,
  required). Result: exit 21, reason "no applicable gate", IDENTICAL counts shape to A.
- Fixture C: single real green gate. Result: exit 0, reason "every applicable gate is
  green", counts {declared:1, applicable:1, verdict:1, green:1, ...}.

A and B are byte-for-byte indistinguishable in exit code, reason string and counts shape,
confirming the amendment's claim that gate-authored not-applicable and runner-evaluated
unmet precondition are now the same thing to the counters. C confirms a single green still
exits 0. AGGREGATE RULE: PASS, both ways plus the single-green control.

## Record contract (criterion 2), unchanged numbers

test/gates.test.ts:279-287, the criterion-2 fixture (green/red/not-applicable/error, one
each), asserts `assert.deepEqual(summary.counts, {declared:4, applicable:3, verdict:2,
green:1, red:1, "not-applicable":1, error:1, vacuous:0})`. The deepEqual locks the full
shape: old numbers (declared 4, applicable 3, green 1, red 1, not-applicable 1, error 1)
are byte-identical to the pre-amendment contract, with `verdict` and `vacuous` as pure
additions. Ran this test directly: PASS. RECORD CONTRACT: numbers unchanged, confirmed
by the test's own deepEqual, not by re-reading the implementer's claim.

## Validator ($ref fixes vs closed-keyword-set loudness)

VALIDATION_KEYWORDS list (src/gates/validate.ts:43-55) is unchanged: type, required,
properties, additionalProperties, enum, items, minimum, minItems, pattern, const, $ref
(11 entries, matches the plan text verbatim). Own probes against loadSchema/validate
imported directly from src/gates/validate.ts:
  - unknown keyword `unevaluatedProperties` in a schema: loadSchema returns
    {ok:false, reason:"... unsupported schema keyword unevaluatedProperties at #"}.
    Still refuses loudly, still names the keyword.
  - `$ref` with a sibling `type` keyword: loadSchema now refuses (this is a NEW, STRICTER
    refusal added this round, CR-802) -- not a loosening.
  - `__proto__` as a genuine own property in `properties` (constructed via JSON.parse,
    not object-literal syntax, to avoid the JS proto-setter trap myself): schema loads
    correctly, an instance whose own `__proto__` is a matching string validates clean.
  - `__proto__` as an UNDECLARED own instance property with `additionalProperties:false`:
    flagged "property __proto__ is not permitted here" -- confirms CR-808's ownProperty()
    helper reads through own-property lookups on both schema-side and instance-side, in
    both directions (declared passes, undeclared and disallowed is caught).
VALIDATOR: the $ref/proto fixes are net-stricter, not looser. PASS.

## Pin criterion (five fields, ctimeMs)

PinFile interface: path, sha256, size, mtimeMs, ctimeMs = five fields (src/gates/pin.ts:
73-81), matches "now five fields including ctimeMs".

## Preconditions: branch-matches and file-absent

branch-matches: anchored regex `^(?:${source})$` with phase substituted through
escapeRegExp first (src/gates/run.ts:354-357). file-absent: `present === wanted` with
`wanted = precondition.kind === "file-exists"` (src/gates/run.ts:304-327), preceded by
the M2-C-6 irregular/unexaminable-is-error branch shared with file-exists.

## MUTATION TABLE (all restores verified byte-identical via diff against saved originals
before and after every mutation; git status --porcelain clean at the end)

| # | Mutation | Site | Named test | Result |
|---|---|---|---|---|
| 1 | `applicable: ingested.status !== "not-applicable"` -> `applicable: true` | run.ts:566, applicable set-site (CR-800 half 1) | "a gate that declares its own not-applicable cannot make the bundle green" | REDDENED (1 !== 0 on counts.applicable) |
| 1b | same mutation, sibling test | n/a | "the runner cannot report success over an empty green bucket" | stayed GREEN (confirms distinct site) |
| 2 | `if (exitCode===EXIT_GREEN && counts.green===0)` -> `if (false && ...)` | run.ts:797, decideAggregate green-bucket assertion (CR-800 half 2) | "the runner cannot report success over an empty green bucket" | REDDENED (actual 0 notStrictEqual expected 0, i.e. exit stayed 0) |
| 2b | same mutation, sibling test | n/a | "a gate that declares its own not-applicable cannot make the bundle green" | stayed GREEN (confirms distinct site: the counts.verdict===0 branch still catches this case even with the assertion disabled) |
| 3 | evidence-dir claim `{flag:"wx"}` -> `{flag:"w"}` | run.ts claimEvidenceDirectory | "one run owns its evidence directory and a second is refused loudly" | REDDENED (second run not refused) |
| 4 | branch-matches anchor `^(?:...)$` -> unanchored `${source}` | run.ts evaluatePrecondition branch-matches | "branch-matches is anchored and treats the phase id as a literal" | REDDENED (decoy branch matched: actual green, expected not-applicable) |
| 5a | file-absent polarity `present === wanted` -> `present !== wanted` | run.ts evaluatePrecondition file-exists/file-absent | "file-absent is met only when nothing is there, and an irregular entry is error" | REDDENED (actual not-applicable, expected green, on the "nothing there" case) |
| 5b | M2-C-6 arm `if (entry.kind==="irregular"\|\|"unexaminable")` -> `if (false)` | same function, the guard preceding the polarity check | same test as 5a | REDDENED (actual green, expected error, on the fifo case) |
| ctime | `comparePins` dropped the `ctimeMs` field comparison | pin.ts comparePins | "a byte-identical rewrite that restores mtime exactly is still a difference" | REDDENED (0 !== 1 differences found) |

Distinct-member requirement satisfied: mutations 1/1b and 2/2b each hit only their
own test and leave the sibling green, so the two CR-800 fix sites are independently
witnessed (one witness is not a class, satisfied). 5a and 5b independently redden two
different assertions inside the same test (polarity vs the M2-C-6 arm), both required
by the contract.

## Gates, both toolchains, own invocations (cap: 3 full suite runs, used 3)

- npm ci: exit 0, 0 vulnerabilities (Node 26.6.0 / npm 11.18.0).
- npm run build: exit 0; `git status --porcelain` empty after build, both times checked.
- Node 26.6.0 (floor toolchain), full suite, run 1: 193 tests, 192 pass, 1 fail, 0 skip.
  Failure: test/watcher.test.ts:500 "a resident watcher and a concurrent single pass
  never both surface a wake" -- NOT the flake named in my brief (liveness.test.ts:671),
  a different contention-class flake in an UNTOUCHED file (watcher.test.ts is not in the
  16-file envelope). Re-ran in isolation (--test-name-pattern before the path): PASS.
- Node 26.6.0, full suite, run 2 (serial confirmation): 193 tests, 193 pass, 0 fail,
  0 skip. Matches implementer's claimed 193/0/0 exactly.
- Node 22.22.2 (container default, via `bash -lc`, confirmed `node --version` in-shell):
  193 tests, 191 pass, 0 fail, 2 skip. Matches implementer's claimed 191/0/2 exactly.
  (Floor-gated tests skip on the default toolchain per CLAUDE.md warning 1; not
  independently re-derived which 2, taken as consistent with the documented pattern.)
- Node 26.6.0, dist removed (`rm -rf dist *.tsbuildinfo`), full suite, run 3 of cap:
  193 tests, 189 pass, 0 fail, 4 skip, each skip reason printed inline naming
  "dist/ is absent; run npm run build first (CI builds before it tests)" for the four
  dist-dependent tests (compiled-entry schema resolution, npm pack contents, the
  gate-bundle-step workflow parse, and the runner-crash-summary test). Matches claimed
  189/4 with reasons exactly. Rebuilt afterward; git status clean.
GATES: PASS on both toolchains and both dist states; the one red result was reproduced
as a pre-existing contention flake outside this delta's file envelope, not a regression
introduced by the fix round.

## CI criterion, PR #11 checks on 3c7970b

get_check_runs on PR #11: two checks, both on head_sha 3c7970b, both "completed"/"success":
  - "test (26)" (job id 92558665693)
  - "gates" (job id 92559857389, the required fan-in context, depends on test)
Fetched job logs directly (mcp github get_job_logs) rather than trusting the green
checkmark:
  - npm test inside CI: "tests 193 / pass 193 / fail 0 / skipped 0" -- matches my own
    floor-toolchain local run exactly, same toolchain (matrix node: 26).
  - The gate bundle step command as CI actually invoked it:
    `node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence ...
     --base "037477ea1a813da4df8ae3b93b9db47e98199a2e"
     --head "3c7970b56533442222f6858c6f6279f54ed2a2c2"`
    --head is the literal PR head commit SHA, NOT a synthetic merge SHA: CR-830-1 fix
    confirmed LIVE in the actual workflow run, not just in the yml text. --base is
    037477e, which is origin/main's tip and matches the base I used for the 16-file
    scope diff independently.
  - Real gate output captured: "gates: declared 1 applicable 1 verdict 1 green 1 red 0
    not-applicable 0 error 0 vacuous 0" / "gates: every applicable gate is green" --
    the gate-bundle step executed for real and measured something (manifest-self-check),
    not a step that merely exists in the yml.
  - "M2 gate bundle (push)" step present and correctly "skipped" (this run is a
    pull_request event).
  - fetch-depth note: actions/checkout@v4 in this workflow has NO explicit fetch-depth
    override (still shallow). The inline comment explicitly defers this to "the first
    diff-touches gate (M2-P2, M2-P5)" as a paired future change; M2-P1's own gate
    (manifest-self-check) has no diff-touches precondition, so the absence is coherent
    with the note rather than a broken promise. Not independently verifiable that a
    LATER phase actually pairs fetch-depth with its first diff-touches gate; that is
    out of this phase's scope and is correctly flagged in the plan as M2-P2/M2-P5's job.
CI: PASS, verified against real job logs, not just the check-run conclusion.

## Untouched criteria, spot-checked (3, plus why these three)

Chosen because they exercise the three parts of the runner NOT touched by the fix
round's mutation targets (usage/CLI parsing, structural C-2/C-3 grep, and a precondition
kind other than branch-matches/file-absent), so a regression in shared plumbing would
show here even though the delta's own tests are elsewhere:
1. "tiphys gates run with an unknown flag exits 64 with usage on stderr" -- PASS.
2. Structural grep over src/gates/*.ts for `detached: true`, `.unref(`, `process.kill`,
   `/proc` (bare path usage, not prose): only hit is a PROSE comment describing the rule
   ("here reads a pid... or touches /proc"), no code usage. PASS (criterion 13 intact).
3. "a diff-touches gate without --base is error and with --base yields its real verdict"
   -- PASS (criterion 8, a precondition kind untouched by this round's fixes).

## Claim-grep (CLAUDE.md's binding contract), independent re-run

```
$ grep -cEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|never|always|no way to' delivery/work-history/m2-p1.md
27
```
The implementer's own embedded transcript claims "20 raw / 11 real hits, all settled".
Running the identical command against the DELIVERED file now gives 27, not 20 -- the
raw count does not reproduce. Cause, traced line by line: the file contains not one but
effectively two self-referential blocks (the round's own grep transcript plus its
disposition table, at lines 678-703 and 1369-1392), and by the time all of the "Three
witnesses came back green" narrative and the disposition table itself were written,
additional prose after the embedded "20" snapshot pushed the true total to 27 without a
final re-run to confirm the number that shipped. Two of the extra hits (lines 1391 and
1392, "it also catches replace-by-rename" and "can only make more runs error, never
fewer") are NOT in the implementer's disposition table and are not declared as part of
either excluded transcript block. I traced their substance independently rather than
trusting the sentence: both describe pin.ts's ctimeMs addition, which I already
mutation-tested above (the ctimeMs mutation reddened the named test, and CR-804's
"strict ADDITION... never a substitution" is true by inspection of comparePins, which
only APPENDS to the fields array and never removes an existing check). So the
underlying substance holds, but the implementer's own claim-grep pass did not cover its
own document's final state, which is exactly the reproducibility gap the fix-round
contract's item 3 exists to catch. Sampled 5 of the declared 11 real hits (lines 350,
874, 895/897, 1185, 1261) against independent evidence:
  - 350: confirmed the literal constraint name M2-C-2 is quoted verbatim from the code
    (M2_C_2_DETAIL constant), not a live claim.
  - 874: independently re-ran `grep -n '"gates", cmdGates' src/cli.ts` (one hit, line 23)
    and `grep -n "^export function cmdGates"` (one hit) myself; confirms "the ONLY
    entry" is a real singularity, not an assertion.
  - 895/897: the two-schema-document staging (F4b/F5b) is consistent with my own
    exit-21-naming-the-path behavior observed when probing file-absent/file-exists
    M2-C-6 arms with mkfifo above.
  - 1185: independently constructed a genuine cyclic $ref (no instance descent) and a
    genuine two-level recursive schema; got "schema reference ... is cyclic" for the
    former and correct multi-level validation (no false cyclic flag, no RangeError/hang)
    for the latter, matching the claimed CR-807 fix.
  - 1261: independently confirmed the compiled-vs-source trap this row names by running
    the CR-801 test via `--test-name-pattern` before and after `npm run build` in the
    "gates both toolchains" section above (dist-removed run correctly SKIPPED that exact
    test with a reason, rather than silently passing against stale dist/).
FINDING CR-880-1 (LOW): the work history's claim-grep raw count (20) does not reproduce
against the delivered file (27); two hits outside the disposition table are unaddressed
by name, though their underlying substance is independently verified true. Not a defect
in the shipped code; a completeness gap in the self-audit's own final re-run.

## Scope of every negative result in this review

- The three untouched-criteria spot checks are exactly three of sixteen; the other
  thirteen were not independently re-walked this round (ac3b2f6's full walk covers them
  and the delta does not touch their code paths per the file-level diff).
- Mutation testing covered exactly the sites named in my contract (CR-800 both halves,
  evidence-dir claim, ctime pin, branch-matches anchor, file-absent polarity + M2-C-6
  arm). I did NOT mutate: the validator's $ref-sibling/cycle/proto fixes (probed
  positively and negatively instead, no source mutation, because the contract asked for
  probes there, not a mutation table), CR-801 crash discipline, CR-803's atomic
  rename-staging half (only the O_EXCL claim half was mutated), CR-806/812/813, and
  CR-830-1 (verified end to end via the real CI log instead, which is a stronger check
  than a local mutation for a GitHub-expression-only fix).
- The registry check ("resolves by name") is a manual description-match, not a
  mechanical link, because no such mechanism exists anywhere in this repository for any
  phase; I did not build one to check M2-P1 specifically, matching how every prior
  phase's review has treated this.
- The CI check_runs / job-log fetch reports what GitHub recorded for this run; it does
  not independently re-execute the workflow, and a runner-level compromise (a forged log)
  is outside what this contract can see.
- The flaky watcher.test.ts failure was isolated and reproduced green once; I did not
  bisect its root cause since watcher.test.ts is outside the 16-file scope envelope of
  this phase and this delta.
- I did not attempt to reproduce DR-0012's dual-cross-model-review or arbitration
  process; that is the orchestrator's job, not this delta review's.

## VERDICT: APPROVE

No high or medium finding. One LOW finding (CR-880-1, claim-grep raw-count
non-reproducibility, substance independently verified true, no code defect).

Summary of what was re-executed (not merely re-read):
- npm ci, npm run build, npm test on Node 26.6.0 (floor) and Node 22.22.2 (container
  default via bash -lc), plus a dist-removed run: all match the implementer's claimed
  numbers exactly (193/0/0 twice on floor after isolating one contention flake outside
  scope, 191/0/2 on default, 189/4-with-reasons without dist).
- Registry diff computed programmatically against ac3b2f6 and origin/main: 199/13-added/
  0-removed, matches exactly; all 13 new ids independently matched to distinct tests.
- Scope diff computed against the correct merge base (origin/main 037477e, not the stale
  local main): exactly 16 files, matches the plan's files-to-touch plus the two standing
  extras; no plan edit, no bin/tiphys.ts, no src/task.ts, no src/lock.ts.
- Aggregate rule: 3 own fixtures run through the compiled CLI (gate-authored
  not-applicable, runner-evaluated unmet precondition, single real green), confirming
  the amendment's indistinguishability claim and the exit-0 control.
- 8 source mutations across run.ts and pin.ts, each restored byte-identical and
  confirmed via diff before moving to the next; each reddened its target test and left
  at least one sibling test green where the contract required distinct-member proof
  (CR-800's two halves; file-absent's two arms).
- CI: fetched real job logs for PR #11 at head 3c7970b, not just the check-run
  conclusion; found the exact invoked command line proving CR-830-1's --head fix is
  live, and the real gate-bundle output proving the step measures something.
- Validator: 4 independent probes against loadSchema/validate (unknown keyword, $ref
  sibling, declared __proto__, undeclared __proto__ under additionalProperties:false),
  none of them mutations, all net-stricter than before.

