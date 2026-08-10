# Clean-room review: M3-P3 at head 108eed0, acceptance-criteria walk

Reviewer: independent clean-room agent (round 8 criteria contract).
Head under review: 108eed0.
Report branch: claude/review-m3p3-r8-criteria (off origin/main a8d7016).
Started: 2026-08-10 (beacon created; this file is appended as work proceeds).

## Status log

- [t0] Worktrees created: cr8-lab (detached 108eed0), cr8-report (branch).
- [t0] Reading CLAUDE.md, M3-P3 plan section, DR-0022, DR-0020.
- [t1] Plan section read (kernel-plan-m3.md lines 2317-2500ish). Criteria enumerated:
  1, 2, 3(a-d), 4, 4b, 4c, 4d, 5, 6. Now reading DR-0022 and DR-0020.
- [t2] Toolchain: node v26.6.0 (floor), npm 11.18.0, absolute path
  scratchpad/toolchain/node-v26.6.0-linux-x64/bin, confirmed in each shell.
  `npm ci` exit 0, zero EBADENGINE lines. `npm run build` exit 0, `git status
  --porcelain` empty afterwards (0 lines).
- [t3] Full suite WITH build present: exit 1. tests 505, pass 503, fail 2,
  skipped 0. Failures are `test/watcher.test.ts:269` and `:419`, both M1
  watcher real-clock tests, NOT M3-P3 files. Investigating flake vs regression.
- [t4] Isolated run at `test/watcher.test.ts` alone: exit 0, 23/23 pass. Load
  average during the full run was 10.81 (a delta verifier runs concurrently).
  The two failures are real-clock flakes in pre-existing M1 code, not M3-P3.
  A second full run is scheduled before the report closes.
- [t5] Criterion 1 executed: exit 0 both documents with `--context .`; without
  `--context` the three context-requiring checks print SKIPPED and exit 1.
- [t6] Criterion 2 executed: full prints the twelve stage ids in plan order,
  exit 0; direct-pr (7 skips) and local-only (10 skips) exit 0.
- [t7] Criterion 3 (a)(b)(c)(d) executed from reviewer-authored fixtures, all
  exit 1 with the field named and `(check: <id>)` present where Kind B.
- [t8] Criterion 4 executed both directions in an ISOLATED STAGED INSTALL
  (scratchpad/cr8-inst) so the git worktree is never mutated.
- [t9] Criteria 4b, 4c, 4d executed, every direction, all in the staged install.
  4d also rejects TWO IDENTICAL entries by `uniqueItems`, which is stronger than
  the plan's "a registered test asserts the two ids are distinct".
- [t10] Criterion 5: reviewer grep over `assurance-modes.yaml` and
  `schemas/assurance-modes.schema.json` for pid|kill|daemon|background,
  case-insensitive, GREP exit 1 (no match), 0 lines. The registered test carries
  its own non-vacuity control.
- [t11] DR-0022 owner criterion RE-DERIVED: `git archive 108eed0
  delivery/decisions` (20 records), unit sets computed by importing
  `quotableUnits` from the round-5 baseline tree (18c335a) and from the head,
  both through `readOperatorPath`. 20/20 byte-identical, output files md5
  e5c0dfd22c3b3f9215b88200d2804352 both sides, `diff` exit 0.
- [t12] Gate registry run, mode full, phase m3-p3, base = merge-base
  3c60acbe: 6 green, 0 red, 4 not-applicable, 2 error (scope and red-witness
  both errored only because `--head` was not supplied). SUITE gate green with
  505 tests, pass 505, fail 0, skipped 0 (a SECOND full-suite run, which is the
  control on the two flakes above).
- [t13] scope gate re-run on the phase branch worktree with --head: GREEN,
  41 changed paths audited against delivery/plan/phase-declarations/m3-p3.json
  at the merge base. That worktree was 0-dirty before and after.
- [t14] red-witness gate with --head: GREEN, 35 witnesses evaluated (22 own,
  13 stored), every one red against every dangerous state and green at head.
  451 tracked+untracked files md5-compared before and after: zero difference,
  so no mutant survived.
- [t15] Independent ReDoS reproduction: round 7 (986f58a) takes 11,203 ms and
  12,464 ms on the two near-miss members; head takes 2.6 ms and 0.4 ms, with
  the SAME unit sets. V-1 is closed and I verified it, not just read it.
- [t16] Second full suite run, load average 0.36 at start: exit 0, 505 tests,
  505 pass, 0 fail, 0 SKIPPED. Suite WITHOUT a build present: exit 0, 505 tests,
  496 pass, 0 fail, 9 SKIPPED, which is the documented trap and is quoted here
  rather than left implicit.
- [t17] Adversarial probes B/D/E on skips[] found a real defect. Writing it up.
- [t18] Report body being written now; the sections below supersede this log.

---

# THE REPORT

## Verdict

**APPROVE WITH ONE MEDIUM (CR-002) AND TWO LOWS (CR-001, CR-003).**

Every acceptance criterion in the M3-P3 plan section was EXECUTED, not read.
The table below is the deliverable. The owner's DR-0022 criterion and both of
DR-0020's disclosure obligations were re-derived independently and hold. The
round-7 HIGH (catastrophic backtracking) is closed and I reproduced both arms
myself rather than taking the verification's word for it.

CR-002 is a MEDIUM and under DR-0012 condition 2 a medium blocks merge until
resolved or explicitly recorded as tracked with a reason. I state below both the
case for the severity and the case against it, so the orchestrator can arbitrate
on evidence rather than on my adjective.

## Environment, named once because every number below depends on it

- Toolchain: node **v26.6.0**, npm **11.18.0**, absolute path
  `scratchpad/toolchain/node-v26.6.0-linux-x64/bin` FIRST on PATH, and
  `node --version` was run IN THE SHELL THAT RAN EACH COMMAND. Every capture
  below was produced under it.
- Build state: `npm ci` exit 0 (zero EBADENGINE lines), `npm run build` exit 0,
  `git status --porcelain` EMPTY after the build. Unless a row says otherwise,
  the suite numbers are the WITH-BUILD arm.
- Worktrees: `cr8-lab` (detached at 108eed0) for execution; `cr8-report`
  (branch `claude/review-m3p3-r8-criteria` off origin/main a8d7016) for this
  file. The main repository at `/home/user/tiphys-ai-helmsman` was never
  mutated and no git-mutating command was run there.
- **Mutation discipline.** Most dangerous-state fixtures were run against an
  ISOLATED STAGED INSTALL (`scratchpad/cr8-inst`: a copy of `dist/`, `schemas/`,
  the three shipped YAML documents and `delivery/decisions/`), so the git
  worktree was never touched at all. The three probes that HAD to mutate the
  worktree (probe D, probe E, and the `on-exceeded` red witness) each ran inside
  a script with `trap restore EXIT`, restoring by `cp` from a pristine copy,
  never by `git checkout --`, and each printed AND COMPARED md5 before and
  after. All three printed `match=YES`, and `git status --porcelain` in
  `cr8-lab` is 0 lines now.

## THE CRITERION TABLE

Every row was executed. `EXIT` is the command's OWN exit code; no row's status
came through a pipe.

| # | Criterion (plan text, abbreviated) | How I executed it | Result |
|---|---|---|---|
| 1 | `validate --type assurance-modes --context . assurance-modes.yaml` exits 0, same for `role-model-config.yaml` | both commands, plus the amendment's standing rule | **PASS**. `C1a_EXIT=0`, `C1b_EXIT=0`. Without `--context` the command prints `SKIPPED charter-mode-enum-matches-modes no context`, `SKIPPED mode-conditions-quote-granted-by no context`, `SKIPPED mode-gate-sets-resolve no context` and `C1c_EXIT=1`, so the amended reading is the one the code implements |
| 2 | `mode show --mode full` exits 0 and prints exactly the twelve stage ids of step 2 IN ORDER; `direct-pr` and `local-only` exit 0 with a non-empty `skips` | ran all three, then compared the printed pipeline mechanically against the plan's twelve | **PASS**. `EXIT_full=0`, `printed=12`, `EXACT_MATCH_IN_ORDER=true`. `EXIT_direct-pr=0` with 7 skips, `EXIT_local-only=0` with 10 skips |
| 3(a) | mode omitting `clean-room-review` with empty `skips[]` exits 1, names the field, Kind B `mode-no-undeclared-downgrade` | reviewer-authored fixture: `direct-pr`'s `skips` emptied | **PASS**. `C3a_EXIT=1`; 7 diagnostics at `#/modes/1/skips`, one of them naming `clean-room-review`, all carrying `(check: mode-no-undeclared-downgrade)` |
| 3(b) | pipeline placing `implement` before `adversarial-plan-review` exits 1, Kind B `mode-stage-order` | swapped the two stages inside `full` | **PASS**. `C3b_EXIT=1`, `INVALID #/modes/0/pipeline mode full places implement at position 3 and adversarial-plan-review at position 4 ... (check: mode-stage-order)` |
| 3(c) | a `full` with no `fix-round-verification` exits 1, Kind A `contains` | removed the stage | **PASS**. `C3c_EXIT=1`, `INVALID #/modes/0/pipeline array contains no item equal to "fix-round-verification", and 1 is required` |
| 3(d) | a mode naming a gate set absent from `gate-registry.yaml` exits 1, Kind B `mode-gate-sets-resolve`, run WITH `--context` | inserted `no-such-gate-set` | **PASS**. `C3d_EXIT=1`, `INVALID #/modes/0/gate-sets/1 gate set no-such-gate-set is not declared in gate-registry.yaml (check: mode-gate-sets-resolve)`; same fixture WITHOUT `--context` gives `C3d_nocontext_EXIT=1` with the three SKIPPED lines |
| 3, witnesses | each Kind B fixture witnessed by DEREGISTERING and restoring the check; the Kind A fixture by removing and restoring `contains` | did not take this on trust: ran the `red-witness` GATE at this head | **PASS**. Gate GREEN, `35 witness(es) evaluated (22 own, 13 stored re-evaluated in 124170ms); every witness red against every declared dangerous state and green at head`. Separately, the in-test deregistration controls for 3(b) and 3(d) are at `test/assurance-modes.test.ts:422-439` and `:581-598` |
| 4 | charter `delivery-mode: yolo` exits 1 naming the enum; `full` exits 0; adding a fourth mode id without updating the charter enum reddens `charter-mode-enum-matches-modes` naming BOTH files; updating returns 0 | all four directions, plus the amendment's half-fix trap | **PASS**. `C4_yolo_EXIT=1` (`value "yolo" is not one of the permitted values "full", "direct-pr", "local-only"`), `C4_full_EXIT=0`. Drift: `C4_DRIFT_EXIT=1`, TWO diagnostics naming `assurance-modes.yaml`, the charter schema path, and BOTH `delivery-mode` and `assurance-tier`. Half-fix (only `delivery-mode` updated): `C4_HALFFIX_EXIT=1`, still red on `assurance-tier`, which is exactly what the 2026-08-09 amendment predicts. Full fix: `C4_GREEN2_EXIT=0` and `mode show --mode review-only` exit 0. See **CR-003** for the edit count |
| 4b | `delegated-under-conditions` with empty `conditions[]` or missing `granted-by` exits 1 naming the field; DR-0012's six conditions plus the record reference exits 0 | both red arms and the control | **PASS**. Empty: `C4b_EMPTY_EXIT=1`, `#/modes/0/conditions array has 0 items, fewer than the required minimum 1`. Missing grant: `C4b_NOGRANT_EXIT=1`, `#/modes/0/granted-by required property granted-by is missing`. Control `C4b_CTRL_EXIT=0` |
| 4c | `full` missing `escalation-bounds` exits 1; bounds without `on-exceeded` exits 1 naming the field; a value outside the two-item enum exits 1 naming the enum; a registered test asserts `full`'s value is `fresh-implementer-and-third-contract` and not `escalate-to-owner` | four schema directions plus a live RED WITNESS of the registered test | **PASS**. `4c-1 EXIT=1` (`required property escalation-bounds is missing`), `4c-2 EXIT=1` (`escalation-bounds/on-exceeded required property on-exceeded is missing`), `4c-3 EXIT=1` (`value "stop-and-wait-for-owner" is not one of the permitted values "fresh-implementer-and-third-contract", "escalate-to-owner"`), `4c-4 EXIT=0` for the other legal enum value, which is why the registered test matters. Witness: with `full`'s value flipped to `escalate-to-owner`, `test/assurance-modes.test.ts:919` goes `GREEN_EXIT=0` -> `RED_EXIT=1`; restore printed `match=YES` and the worktree is 0-dirty |
| 4d | `full` with one `review-contracts[]` entry exits 1 naming the pointer; with `criteria` and `hazard` exits 0; a registered test asserts the two ids are distinct | three directions | **PASS, and STRONGER than the criterion asks.** One entry: `EXIT=1`, `array has 1 items, fewer than the required minimum 2`. Field removed: `EXIT=1`, `required property review-contracts is missing`. **Two entries both `criteria`: `EXIT=1`, `array items 0 and 1 are duplicates and must be unique`** - the T-007 shape is closed by `uniqueItems` in the SCHEMA, not only by a test |
| 5 | `assurance-modes.yaml` and its schema contain no `pid`, `kill`, `daemon`, `background`; a registered test so it holds on every run | ran the grep myself and read the test | **PASS**. `grep -niE 'pid|kill|daemon|background' assurance-modes.yaml schemas/assurance-modes.schema.json` -> `GREP_EXIT=1`, 0 lines (the GREP's status, not a pipeline's). The registered test at `test/assurance-modes.test.ts:1025` carries its own NON-VACUITY control, asserting each of the four tokens IS found in a synthetic stage that contains it |
| 6 | `node --test` exits 0 with 0 failing and zero unaccounted tests; clause map resolves this phase's three rows; earlier mappings still resolve | three independent suite runs and the clause-map gate | **PASS, with one caveat recorded rather than hidden.** Clean run: `SUITE2_EXIT=0`, **tests 505, pass 505, fail 0, SKIPPED 0**, with build, node v26.6.0, load average 0.36. Independent second measurement, the `suite` GATE: green, `reported 505 test(s) from 30 file(s) (pass 505, fail 0, skipped 0, todo 0, did-not-run 0) ... 511 behavior(s) resolve`. Clause map: gate green, `18 rows checked, 56 pending a phase not yet in force`; the merge base carries 15 rows and this branch appends exactly `R-024`, `R-096`, `R-075`, so the three new rows resolve and all 15 earlier ones still do. CAVEAT below |

### Criterion 6's caveat, stated because a green that was not always green is not a clean measurement

My FIRST full-suite run, taken while a concurrent delta verifier had the box at
**load average 10.81**, exited 1: tests 505, pass 503, **fail 2**, skipped 0. The
two failures were `test/watcher.test.ts:269` (`expected at least 4 beacon writes,
saw 3`) and `test/watcher.test.ts:419` (`0 !== 3`). Both are real-clock M1
watcher tests and neither file is touched by this phase.

Three subsequent measurements all pass: `test/watcher.test.ts` alone, exit 0,
23/23; the `suite` gate, 505/505; the second full run at load average 0.36,
505/505. **Conclusion: load-induced flake in pre-existing M1 code, not an M3-P3
defect.** I am recording it rather than dropping it because "the suite is green"
is not a complete sentence when one run of it was not, and because a wall-clock
watcher assertion that fails at load 10 will fail on a busy CI runner too. It is
not this phase's to fix and I am not raising it as a finding against M3-P3.

### The build-state arm, quoted because the trap is real

Same head, same toolchain, NO `npm run build`: exit **0**, tests 505,
pass 496, fail 0, **SKIPPED 9**. A reviewer who ran only that arm would report a
green suite having silently not run nine tests. Every suite number in this report
is labelled with its build state for that reason.

## The three additional merge preconditions I was asked to check

### 1. The shipped CLI still behaves

- `tiphys validate` against the three real shipped documents with `--context .`:
  exit 0 each (assurance-modes, role-model-config, and the charter template).
- `tiphys mode show --mode full | direct-pr | local-only`: exit 0 each, full
  output captured above in the log section.
- Error paths: unknown mode -> exit 1 with `declares no mode nope; it declares
  direct-pr, full, local-only`. Missing `--mode` -> exit **64** with a usage
  line. `--help` -> exit **64** (usage error, which is a deliberate choice, not a
  crash). `mode show` against an INVALID document -> exit **1** with
  `... is not a valid assurance-modes document, so it is not served` followed by
  the diagnostics, so it validates before serving.
- `npm pack --dry-run`: exit 0, 123 files, 357.9 kB. The three schemas, both
  YAML documents and `dist/` are IN; `delivery/` is OUT (0 hits); the vendored
  `dist/node_modules` copy is excluded by the `!dist/node_modules` files entry
  (the only textual hit is the prepack script itself), and `commonmark` is a
  declared runtime dependency, so a consumer resolves it normally.

### 2. DR-0020's disclosure obligations

| Obligation | Verified how | Result |
|---|---|---|
| The three schemas carry a `$comment` naming the vocabulary as this repository's own at v0.1.0, citing the record | `grep -n 'v0\.1\.0'` on each file, GREP exit 0 on all three | **MET.** Five disclosures: the stage enum and the mode-id enum in `schemas/assurance-modes.schema.json` (lines 37, 160), the role enum in `schemas/role-model-config.schema.json` (line 42), and BOTH `delivery-mode` and `assurance-tier` in `schemas/charter.schema.json` (lines 41, 46). Each says `CLOSED VOCABULARY AT v0.1.0 (DR-0020)` and defers extension to M4 |
| `tiphys mode show` annotates a mode that is validated-only and never executed | ran all three modes | **MET for the shipped data.** `direct-pr` and `local-only` print `DECLARED AND VALIDATED, NEVER EXERCISED ... no phase of the tiphys project has ever been delivered under it. Its pipeline and its gate selection are checked by validation only (DR-0020)`, and every invocation prints a standing `limits:` line disclosing the closed vocabulary. **But the DERIVATION behind that annotation is unsound: see CR-002** |
| Escalation bounds shown as DATA, never as an enforcement engine | read the `full` output | **MET.** `escalation-bounds (data an orchestrator brief cites; nothing in this release counts fix rounds, detects recurrence, or enforces these):` |
| The record's own forward dependency (`package.json` still `0.0.0` while five `$comment`s name v0.1.0) | read `package.json` and `delivery/STATE.md` on origin/main | **CORRECTLY OUTSTANDING, not a finding.** `"version": "0.0.0"` at this head, and `delivery/STATE.md:530` carries the blocking obligation on M3-P10 verbatim. Neither side of it is on this phase's declaration |

### 3. The owner's DR-0022 acceptance criterion

> *unit sets byte-identical on all the records under `delivery/decisions/`, re-derived from `git archive`, never from a copy anyone staged*

**DISCHARGED. 20 of 20 byte-identical.**

Method, so it can be repeated:

1. `git archive 108eed0 delivery/decisions | tar -x -C scratchpad/cr8-records`,
   `ARCHIVE_EXIT=0`, 20 records. Nothing staged by anyone else was read.
2. A driver imported `quotableUnits` and `readOperatorPath` from TWO trees and
   ran them over the same 20 archived files:
   - the head under review, `108eed0` (A2: `commonmark` for structure,
     `sourcepos` slicing, with rounds 7 and 8 on top);
   - the pre-A2 BASELINE, `18c335a`, the round-5 true-final head DR-0022 was
     raised against. `git show 18c335a:src/checks.ts | grep -c commonmark` = 0,
     so the baseline genuinely predates the dependency.
3. Both sides: `records=20 total-units=504`. `diff` of the two JSON dumps:
   `DIFF_EXIT=0`, 0 lines. Both files md5
   `e5c0dfd22c3b3f9215b88200d2804352`. Per record, all 20 compare equal by
   `JSON.stringify`: `records=20 byte-identical=20 differing=0`.

Per-record unit counts, so the numbers are visible rather than summarised:
DR-0001 15, DR-0002 15, DR-0003 15, DR-0004 18, DR-0005 18, DR-0006 22,
DR-0007 19, DR-0008 19, DR-0009 16, DR-0010 29, DR-0011 37, DR-0012 36,
DR-0013 38, DR-0014 29, DR-0015 32, DR-0016 40, DR-0017 7, DR-0018 10,
DR-0020 42, DR-0022 47.

Note for the record: DR-0022's own text says NINETEEN, which was the count when
it was written. `delivery/decisions/` now holds TWENTY, because DR-0020 and
DR-0022 itself were added afterwards. Both of the two extra records are included
above and both are byte-identical, so the criterion holds on the larger set.

## FINDINGS

### CR-002 (MEDIUM): `skips[]` is checked for completeness but never for soundness, and `mode show`'s DR-0020 annotation is derived from `skips.length`, so a one-line data edit makes the shipped CLI print a false statement about the kernel's own delivery

**The MECHANISM, not the instance.** `mode-no-undeclared-downgrade`
(`src/checks.ts:~300`) asks one question: *is every stage `full` runs that this
mode omits declared in `skips[]`?* It never asks the converse: *is every stage in
`skips[]` actually omitted?* `executionStatus` (`src/modes.ts:177-198`) then uses
`mode.skips.length === 0` as its proxy for "this is the un-downgraded mode the
project follows". The proxy holds today only because `full` happens to be the
only mode with an empty list. Nothing enforces that, and `skips[]` is shipped
data that any edit can change.

**Member 1, the sharp one.** `full` keeps its complete twelve-stage pipeline,
still runs `deploy-verify`, and gains ONE bogus entry in `skips[]`:

```
$ sed -i 's/    skips: \[\]/    skips:\n      - deploy-verify/' assurance-modes.yaml
$ node dist/bin/tiphys.js validate --type assurance-modes --context . assurance-modes.yaml
VALIDATE_EXIT=0                      # <-- green, no diagnostic at all
$ node dist/bin/tiphys.js mode show --mode full
mode: full
execution-status: DECLARED AND VALIDATED, NEVER EXERCISED. This mode declares 1
skipped stage(s), so it is a declared downgrade of the un-downgraded process, and
no phase of the tiphys project has ever been delivered under it. Its pipeline and
its gate selection are checked by validation only (DR-0020).
SHOW_EXIT=0
```

The shipped command now states, of the mode this project has delivered every
phase under, that no phase has ever been delivered under it. Reproduction script
`scratchpad/cr8-probeE.sh`; it restores from a pristine trap and printed
`RESTORE pre=1e4df7d04cdda24629dfedbf0555a73c post=1e4df7d04cdda24629dfedbf0555a73c match=YES`,
and `git status --porcelain` in `cr8-lab` is 0 lines.

**Member 2, structurally different (one witness is not a class).** `direct-pr`
is given `full`'s pipeline, an empty `skips[]` and a `review-contracts[]`:

```
VALIDATE_EXIT=0
mode: direct-pr
execution-status: this mode declares no skipped stage, so it is the un-downgraded
process, and it is the one the tiphys project follows for its own delivery.
merge-authority: owner
```

A mode that has never been entered now claims to be the one the project follows,
with `merge-authority: owner` printed directly beneath it, which is not the
regime in force (DR-0015). Script `scratchpad/cr8-probeD2.sh`, same trap, same
`match=YES`.

**Member 3, the same root in its mildest form.** `local-only` declaring
`implement` in `skips[]` while `implement` is in its own pipeline: `EXIT=0`, and
`mode show` prints `implement` under BOTH `pipeline:` and `skips:`. Capture at
`scratchpad/cr8-probeB.txt`.

**Why no existing guard sees it.** `witness/modes-execution-status-derived.json`
declares two dangerous states and BOTH are code mutations
(`if (mode.skips.length === 0)` -> `if (true)`, and
`if (!context.shippedDocument)` -> `if (false)`). The registered test asserts the
sentences the shipped data produces. So the guard covers "someone breaks the
function" and does not cover "someone edits the data", which is this artifact's
entire threat model and the reason criteria 3, 4b, 4c and 4d exist. This is the
red-witness rule one level up, in the form CLAUDE.md states it: a guard whose
condition does not test the property that matters is green and worthless.

**Fix shape (not my job to apply, stated so severity can be judged).** The
completeness check already computes both sets. One predicate over the same two
sets closes it: any stage present in BOTH `skips[]` and `pipeline[]` is invalid.
Separately, `executionStatus` should key off `mode.id === "full"` rather than
`skips.length`, since blueprint section 8 defines `full` as the un-downgraded
process by name.

**Severity, argued in both directions rather than asserted.**

- FOR medium: DR-0020 is a settled decision whose obligation 2 exists precisely
  so an operator "who has not read the plan is not misled", and this is the
  shipped CLI printing a false claim about the project's own delivery, at exit 0,
  with every gate in the registry green. The threat model of this whole artifact
  is a data edit, so "it needs a data edit" is not mitigation here, it is the
  hazard. The plan's own hazard class calls this "the one artifact in which a
  downgrade can be made invisible"; this is that hazard inverted.
- AGAINST medium: **no assurance is weakened by any member.** In member 1 the
  pipeline is untouched and every stage still runs; in member 2 the mode GAINS
  stages. Nothing here lets a phase ship with less review than it appears to. It
  is a disclosure and data-integrity defect, not an assurance-hiding one. Nor is
  it a round-8 regression: `src/modes.ts` predates round 6 and round 8's own
  non-coverage note (item 5) says in as many words that it did not review it.

I rate it MEDIUM and I would defend that, but the orchestrator has the
arbitration and the argument against is recorded honestly above.

### CR-001 (LOW): the near-miss time budget is a wall-clock assertion, and the box it will run on is not always quiet

`test/assurance-modes.test.ts:2947`, `NEAR_MISS_BUDGET_MS = 1000`. The bound is
well argued in its own comment (honest cost 0.2-3.2 ms, pathological 11.2-12.6 s,
so ~1,400x headroom on the green arm and ~11x on the red arm) and I MEASURED both
arms independently:

```
head 108eed0 : bullet 151 bytes  2.6 ms ; ordered 207 bytes  0.4 ms   (same unit sets)
round7 986f58a: bullet 151 bytes 11203.2 ms ; ordered 207 bytes 12464.2 ms
```

So the witness is genuine and the margin is real. The LOW is only this: on the
same box, at load average 10.8, two OTHER wall-clock tests in this repository
failed in my first suite run. A 1,400x margin is very likely enough; I did not
force the green arm red and I did not find a way to. Recorded so that if this
test ever flakes in CI, nobody spends a round rediscovering that it is
time-based. No action requested.

### CR-003 (LOW): criterion 4's amendment says the change is FOUR coordinated edits; it is SIX, and the two it omits are the ones that fail first

The 2026-08-09 amendment exists specifically to tell the next phase adding a mode
id "the real shape of the change". Measured, adding a fourth mode id needs:

1. `assurance-modes.yaml` (declare the mode) - named by the amendment
2. `schemas/assurance-modes.schema.json`, the mode-id `enum` - **NOT named**
3. `schemas/charter.schema.json`, `delivery-mode` enum - named
4. `schemas/charter.schema.json`, `assurance-tier` enum - named
5. `gate-registry.yaml`, the `modes` list of every gate the new mode selects -
   **NOT named**, and unavoidable because `gate-sets` has `minItems: 1`
   (`#/modes/3/gate-sets array has 0 items, fewer than the required minimum 1`)
6. `schemas/gate-registry.schema.json`, its own `modes` item enum - **NOT
   named**; without it `validate --type gate-registry` fails with
   `#/gates/4/modes/3 value "review-only" is not one of the permitted values`

Edit 2 is the FIRST thing that fails (`#/modes/3/id value "review-only" is not
one of the permitted values`), before any of the four the amendment lists is even
reached. A reader budgeting the amendment's four edits lands red twice on paths
the amendment does not mention. This is a defect in PLAN TEXT, not in code, and
the code behaves correctly at every step; I raise it because the amendment's
whole purpose is to be the accurate map. Whole sequence captured in
`scratchpad/cr8-c4*.txt`.

## What I ATTACKED and did NOT break

A review that lists only breakage is not a measurement, so here is the negative
space, each item with what was actually run.

- **The block-prefix rewrite (rounds 7 and 8), the code neither existing review
  saw.** Round 7's pattern is genuinely catastrophic and I reproduced it in
  isolation: `/^(?:[ \t]*(?:>[ \t]?|(?:[0-9]{1,9}[.)]|[-*+])[ \t]*))*[ \t]*$/`
  against `"-  " * n + "Z"` costs 0.2 ms at n=6, 173.9 ms at n=14, 14,080 ms at
  n=18 and 125,074 ms at n=20 on a 61-BYTE subject. Round 8's scan
  (`isSkippablePrefix`) is flat, and end to end through `quotableUnits` the two
  witness documents go from 11.2 s / 12.5 s to 2.6 ms / 0.4 ms **with identical
  unit sets both ways**, which is the control that a fast-because-broken fix
  would fail. V-1 is closed and I verified it rather than reading about it.
- **`mode-no-undeclared-downgrade` with no reference mode.** I tried removing
  `full` entirely, hoping the comparison would silently no-op. It is closed
  explicitly: `INVALID #/modes no mode declares id full, so no mode's omitted
  stages can be measured against the reference pipeline (check:
  mode-no-undeclared-downgrade)`, `EXIT=1`.
- **The T-007 duplicate-contract shape.** `criteria` twice is rejected by
  `uniqueItems` in the schema, not left to a test.
- **`mode show` serving an invalid document.** Refuses, exit 1, and prints the
  diagnostics.
- **Control characters and non-ASCII.** Both CLAUDE.md greps, `-a` present, over
  the 41 changed paths: GREP exits 1 and 1, 0 lines each. Over the whole tracked
  tree minus the two by-path exemptions (432 files): GREP exits 1 and 1, 0 lines
  each. `git diff --stat` reports no file as `Bin`.
- **The red-witness gate as an audit of itself.** GREEN, 35 witnesses, and I
  md5-compared 451 tracked files before and after the run: zero difference, so
  the run left no mutant behind.
- **The scope audit.** GREEN on the phase branch with `--phase m3-p3` and
  `--base $(git merge-base HEAD origin/main)` = `3c60acbe`: 41 changed paths
  audited against `delivery/plan/phase-declarations/m3-p3.json` read from the
  merge base. Run in the implementer's worktree, which was 0-dirty before AND
  after. (Run from a DETACHED worktree the gate correctly reports
  `not-applicable: branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$`,
  which is the trap CLAUDE.md's branch-name section describes.)
- **The rest of the registry.** `manifest-self-check` green (8), `coverage`
  green (115), `credential-scrub` green (7), `citations` not-applicable,
  `clause-map` green (18), `agent-rules-drift` green (17). `credential-token`,
  `deploy`, `migrations` not-applicable for stated structural reasons.

## WHAT I DID NOT COVER, and why. READ THIS FIRST when reviewing my report.

A search whose scope is wrong returns an empty result indistinguishable from an
absence of defects, so the gaps are stated as axes, not only as items.

1. **CI, BOTH ARMS. I observed no GitHub Actions run at all** - not the
   `pull_request` arm and not the post-merge `push` arm on the new `main` head.
   T-009 requires both separately and NOTHING in this report discharges either.
   Every number here is local, one container, one engine (V8), one node build.
   DR-0012 condition 4 ("CI is green on the exact head being merged") is
   therefore UNVERIFIED BY ME.
2. **The delta verifier's contract.** I deliberately did not re-walk V-1 to V-6
   for closure, except V-1, which I reproduced because the criterion table needed
   the CLI to be fast. Whether rounds 7 and 8 introduced anything new is the
   concurrent verifier's job and I have not seen its output.
3. **The work history was read LAST and only in part.** It is 6,909 lines. I read
   fix round 8 in full, the round-6 completion pass headings, and the section
   index. I did not audit rounds 1 to 5 against their own evidence. The claim
   grep over it returns 99 hits, which I did not settle one by one; the round-8
   author settles the hits in their own section explicitly, and I checked that
   the round-8 section does so, not the earlier ones.
4. **Correctness of `quotableUnits` beyond the twenty real records.** I ran the
   OWNER'S criterion (byte-identity on the archived records) and nothing wider.
   I did not run the 40-shape exploit set, did not fuzz, and did not consult
   `commonmark` as an oracle. If A2 and the baseline are both wrong in the same
   way on some shape, my comparison cannot see it, BY CONSTRUCTION: it is an
   equivalence test, not a correctness test.
5. **`commonmark` itself.** No supply-chain review of the new runtime dependency
   beyond confirming it is pinned exact (`0.31.2`), is a declared `dependencies`
   entry, resolves in `npm ci` with 0 vulnerabilities reported and 0 EBADENGINE
   lines, and does not leak into the tarball via `dist/node_modules`. I did not
   measure its parse cost on deeply nested input, which round 8's own gap list
   also names.
6. **The consumer lens.** I did not build a scratch consuming project. That was
   the third contract's job and produced DR-0020; I checked DR-0020's
   OBLIGATIONS, not its findings.
7. **`role-model-config.yaml` beyond validation and reading.** It validates, and
   the six roles, tiers and `review-model-family` values read consistently with
   R-075 and T-001. I did not attempt dangerous instances against it, because the
   plan states no acceptance criterion for it beyond criterion 1.
8. **Downstream obligations.** M3-P9's brief citations of these ids and M3-P10's
   version bump are named in STATE.md and are not on this phase's declaration; I
   confirmed the STATE.md entry exists and stopped there.
9. **The two `clean-room-checklist` gates.** `unit-tests-for-changed-service-methods`
   and `fixtures-for-changed-component-states` are declared in the registry and
   are NOT executed by the runner (it says so on every run). I did not probe them
   manually.
10. **Concurrency.** The box carried another agent throughout. I have shown the
    two suite failures were load-induced, but I cannot rule out that some timing
    number in this report is optimistic or pessimistic by a factor I did not
    measure. The two ReDoS comparisons are 4,000x apart, so no plausible load
    factor touches that conclusion.

## Evidence committed alongside this report

`delivery/review/evidence/clean-room-m3-p3-r8-criteria/`:

| file | what it is |
|---|---|
| `cr8-units.mjs` | the DR-0022 driver: imports `quotableUnits` and `readOperatorPath` from a given tree and dumps unit sets for a directory of records |
| `units-head-108eed0.json`, `units-baseline-18c335a.json` | its output on the `git archive`d records, from the head and from the pre-A2 baseline |
| `units-md5.txt` | both md5 `e5c0dfd22c3b3f9215b88200d2804352`, which is the byte-identity claim in one line |
| `cr8-nearmiss.mjs`, `cr8-redos.mjs` | the two cost probes; run them against a tree path |
| `cr8-probeE.sh`, `cr8-probeD2.sh` | CR-002 members 1 and 2, each self-restoring from a pristine trap with md5 printed |
| `cr8-witness-onexceeded.sh` | the criterion 4c red witness, same trap discipline |
| `cr8-restage.sh` | rebuilds the isolated staged install the fixtures run against |
| `gates-summary-full-mode.json`, `-scope.json`, `-red-witness.json` | the three gate runs, per-gate status, units and detail |
| `red-witness-evaluations.json` | the 35 witness evaluations, status and member count each (the full 15 MB record was summarised, not committed) |
| `probe-b-mode-show-contradictory-skips.txt` | CR-002 member 3's `mode show` output |
| `suite-with-build-counts.txt`, `suite-without-build-counts.txt`, `suite-first-run-under-load-counts.txt` | the three suite arms, counts as the reporter printed them |

No captured output in this report or this bundle contains a non-ASCII byte:
`grep -raP '[^\x00-\x7F]'` over both returns GREP exit 1. **No transliteration
was needed and none was performed**, because every capture quoted here came from
the CLI, the gate runner or the TAP reporter's `# pass` summary lines, none of
which emit U+2139 or U+2716; I did not capture the default spec reporter's
output. Nothing was hand-written to avoid a glyph.

## Post-commit log (the beacon keeps moving)

- Committed at `ab8c434`, pushed to `origin/claude/review-m3p3-r8-criteria`,
  push exit 0. Branch name checked against the scope auditor's pattern before
  pushing: `node -e 'console.log(/^claude\/m[0-9]+-p[0-9]+-/.test(...))'` printed
  `false`, so it does not claim to be a phase branch.
- Final state of every tree I touched: `cr8-lab` `git status --porcelain` 0
  lines; the implementer's worktree `wt-m3p3-r8` 0 lines before and after the
  scope gate run; the main repository at `/home/user/tiphys-ai-helmsman` never
  written to.
- Handover, in one line for the orchestrator: the criteria are DISCHARGED and the
  merge blocker is CR-002 plus the two arms of CI that nobody local can witness.
