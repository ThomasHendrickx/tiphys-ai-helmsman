# Clean-room DELTA re-review (hazard contract): M2-P6 fix round one

- Subject: branch `claude/m2-p6-coverage-checker` at head `407e768`
- Head verified: `git rev-parse HEAD` -> 407e7684fdabca42a85dbdfdbc73aa619d6c6ea9, clean tree
- merge-base with main: e1390f3
- Contract: hazard, delta re-review of the four mediums + regex mechanism from CR-1200 / arbitration-m2-p6.md
- Toolchain: floor v26.6.0 / npm 11.18.0 at the scratch prefix

## VERDICT: APPROVE

All four mediums (CR-985, CR-987, CR-988, CR-989) and the regex mechanism
(CR-990/991/992) are closed AT THE MECHANISM, each confirmed by a dangerous
state I constructed independently at THIS head. No regression. Scope clean.
Full suite green on the true floor toolchain. One LOW residue (U+2060 word
joiner outside `isEmptyCell`'s character set); it does not reopen CR-987's
mechanism and does not gate merge (lows do not block under DR-0012).

## Gate evidence (floor toolchain v26.6.0)

- `npm ci` (floor node): EXIT 0, no EBADENGINE line.
- `npm run build` (floor node): EXIT 0; `git status --porcelain` empty after.
- Full suite, TRUE floor toolchain (floor node as the actual test process,
  `node --test "test/**/*.test.ts"`): **tests 220, pass 220, fail 0,
  skipped 0, EXIT 0.** The floor-gated doctor tests RAN (0 skipped), and the
  previously-known cross-phase failure (`test/gates.test.ts` manifest-self-check
  2!=3) is RESOLVED on this head: the schema self-check enumeration merged from
  main now counts 3 schema documents dynamically. The standing debt the
  arbitration named ("run the full suite on the floor toolchain") is
  discharged GREEN, no non-flake failure.
  - NOTE on method (CLAUDE.md warning #1): running `npm test` while launching
    npm with the floor node still executes the inner `node --test` on ambient
    v22 (SKIP reason line proved it: "local Node v22.22.2 is below the kernel
    floor"). The green-with-0-skip result above is from invoking the floor
    node DIRECTLY as the test process.
- Scope audit: 6 changed files vs main (`src/gates/coverage.ts`,
  `src/gates/schemas/coverage-config.schema.json`, `test/coverage-gate.test.ts`,
  `gates.manifest.json`, `test/behaviors.json`, `delivery/work-history/m2-p6.md`),
  all on the P6 files-to-touch list or the two standing extras. PASSES.
- ASCII: `grep -rP '[^\x00-\x7F]'` over all six authored files: no hits.
- Behaviors: 8 new entries this round, bijective with 8 new `test()` names;
  17 tests total in the file.

## FINDINGS

### High: none.
### Medium: none.

### Low
- **L-1 (residue on CR-987, does not gate).** `isEmptyCell`
  (`src/gates/coverage.ts:212-219`) strips exactly U+200B/200C/200D/FEFF then
  trims. A note or outcome consisting only of U+2060 WORD JOINER (a genuinely
  invisible character) reads as NON-empty: measured `isEmptyCell("   ")
  === false`. The same is true of other invisibles (U+2061-2064, U+00AD,
  U+034F, ...). This is a completeness gap in a defense-in-depth normalization,
  NOT a reopening of the mechanism: the predicate is shared and applied
  identically on both sides (note check line 518, parity outcome line 629), so
  no asymmetry is reintroduced, and every character the hazard review named is
  handled. The round documented its exact set. Recorded for the tracked-low
  list; chasing the full invisible-codepoint set is out of proportion.

## Fix-verification table (medium, construction I built, outcome)

| finding | dangerous state I constructed at 407e768 | outcome |
|---|---|---|
| CR-985 | inventory with `R-001` duplicated (x2 and x3), real-shaped rows | units=2 (distinct), `duplicate-inventory-id:R-001` finding, detail names the count. CLOSED |
| CR-985 (evasion) | duplicate via trailing-whitespace id variant | trimmed -> collapses to one key -> dup still detected. No inflation path |
| CR-985 (evasion) | zero-width injected into the duplicate id | id fails the anchored `idPattern` -> row dropped, not counted (falls to CR-986 floor). No inflation path |
| CR-985 (masking) | one id deleted from both docs AND another duplicated, expectedUnits=3 | distinct=2; BOTH `duplicate-inventory-id` and `expected-units-mismatch` fire. Dedup precedes counting, so a duplicate cannot pad the count to hide a deletion |
| CR-986 | row deleted from both real docs (units below expectedUnits), and units above expectedUnits | `expected-units-mismatch` fires in both directions naming expected vs found. CLOSED |
| CR-987 | parked note = U+200B only; parity outcome = U+200B only; also ZWNJ/ZWJ/BOM/nbsp/mix | `missing-note` fires on the note side; `empty:["F-1"]`, `ok:false` on the parity side; all four named zero-width chars + whitespace treated as empty by the ONE shared predicate. CLOSED (residue L-1: U+2060) |
| CR-988 | parity report row `F-99` absent from inventory (also combined with a duplicated row) | `phantom:["F-99"]`, `ok:false`; phantom still caught when combined with duplication. CLOSED |
| CR-989 | real `mkfifo` at `<evidence>/counts.json` via the real CLI, bounded by a 10s harness timeout | exit 21, `status:"error"` record WRITTEN to the result path, `detail` names the named pipe, evidence `[]`, no hang. CLOSED |
| CR-989 (member 2) | evidence directory absent | exit 21, error record, "evidence write failed: ENOENT", no hang |
| CR-989 (new angle) | `counts.json` is a directory | exit 21, error, "is a directory ... not opened" |
| CR-989 (new angle) | evidence path itself a FIFO | exit 21, error, "ENOTDIR", fail-closed |
| CR-989 (new angle) | `counts.json` a symlink -> FIFO | exit 21, error, "is a named pipe" (refusal detects through the symlink), NO hang |
| CR-989 (policy) | `counts.json` a symlink -> regular file | exit 0, green, write follows the symlink and records evidence. Consistent with the result-path follow policy (original review O-3/C6); not a defect |
| CR-990 | malformed `idPattern` `"Z-[0-9"` via real CLI | exit 21, `status:"error"`, result record WRITTEN (was: no record), detail "not a valid regular expression". CLOSED |
| CR-991 | ReDoS bucketKind `(a|a)+` that BYPASSES the static heuristic, long input, via real CLI + directly via `boundedExec` | bounded at ~250ms (RegexBoundExceededError), CLI exit 21 in 591ms with error record, no hang. Raw unbounded cost measured escalating to 4999ms at n=28, proving the bound does real work. Two structurally different members bounded (nested `(a+)+` AND overlapping-alternation `(a|a)+`, `(a|aa)+`, `(.*a){20}`). CLOSED |
| CR-992 | overlapping kinds `milestone /M([0-9]+)/` + `parked /M1|parked/`, value `M1`, empty note | `ambiguous-kind` finding naming both kinds; `perKind.milestone` undefined (silent-green path removed). CLOSED |

## M2-P1 integration (still holds)

- `tiphys gates run --manifest gates.manifest.json --evidence <dir>` on floor
  node: exit 0, `declared 2 applicable 2 green 2 red 0 error 0 vacuous 0`.
- coverage row: green, units 115, per-kind {milestone 104, phase 11},
  per-milestone {M1 11, M2 16, M3 74, M4 13, M5 1}, exactly criterion 1. The
  regex bounding did NOT corrupt milestone capture-group extraction.
- manifest-self-check: green, units 3, record schema-valid.
- `makeGateResult` is the sole GateResult constructor (coverage.ts:973); the
  green-zero-units rewrite still comes from the shared constructor.

## Attempted and NOT constructed (with reasons)

- **A duplicate that inflates `units`.** The dedup keys on the exact trimmed id
  string before counting; identical strings collapse to one Map key. Whitespace
  and zero-width variants either collapse (dup detected) or fail the anchored
  idPattern and drop out (floor catches). I did not find an inflation path. Not
  asserting none exists.
- **A ReDoS input that beats the node:vm timeout.** Every catastrophic pattern
  I built, including three that bypass the static heuristic, was interrupted at
  ~250ms by `boundedExec`. node:vm's timeout does interrupt V8 regex
  backtracking (confirmed by direct measurement against the raw-unbounded
  escalation). I did not find a pattern that hangs.
- **An evidence path that bypasses the refusal to a silent green.** Six write
  targets tested; the only green is the symlink-to-regular-file case, which is
  the documented follow policy and writes real evidence, not empty. I did not
  find a silent-green-with-empty-evidence path.
- **A zero-width the shared predicate misses.** FOUND: U+2060 (recorded as
  L-1). It is a low completeness residue, applied consistently on both sides.

## Progress log
- Set up workdir, read CLAUDE.md, arbitration, original hazard review, full
  work-history fix-round section, full coverage.ts.
- Confirmed head, scope, ASCII.
- Ran adversarial batteries (pure functions, CLI, ReDoS timing, integration).
- Ran full suite on true floor toolchain: 220/220 green.
- Verdict: APPROVE.
