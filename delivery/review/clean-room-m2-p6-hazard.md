# Clean-room HAZARD review: M2-P6 (coverage checker)

Reviewer: hazard contract, second of the dual review. Findings from CR-985.
Subject: `claude/m2-p6-coverage-checker` at 39ae672b783cec3d9acd23385e03a082e09fe43d
Head verified: `git rev-parse HEAD` -> 39ae672b783cec3d9acd23385e03a082e09fe43d
Merge base with main: 4c9bfbcbd63a1668ab6697fba0460514edb52602

## VERDICT: FIX-ROUND-NEEDED

Four MEDIUM findings (CR-985, CR-987, CR-988, CR-989). Under DR-0012 merge
requires no unresolved high or medium finding.

The phase is well built: every acceptance criterion holds, the M2-C-6 path
guards hold under every hostile path I could construct, and the M2-P1
integration surface is clean in all four probes. What it misses is on the
inventory side of its own arithmetic and in the R-089b parity contract it
declares for M3.

## Gate evidence (floor toolchain v26.6.0 / npm 11.18.0)

- `npm ci` EXIT=0, no EBADENGINE line
- `npm run build` EXIT=0; `git status --porcelain` empty afterwards
- `npm test` EXIT=1: tests 210, pass 206, fail 4, skipped 0
- Scope audit PASSES: 6 changed files, exactly the plan's files-to-touch
  (`src/gates/coverage.ts`, `src/gates/schemas/coverage-config.schema.json`,
  `test/coverage-gate.test.ts`, `gates.manifest.json`) plus the two standing
  pre-authorized extras (`test/behaviors.json`,
  `delivery/work-history/m2-p6.md`).
- ASCII clean: `grep -rP '[^\x00-\x7F]'` over all five authored files: no hits.
- 9 new behaviors registered; each resolves to exactly one `test()` string.

Failure triage (no new failure is attributable to M2-P6):

1. `test/gates.test.ts:2361` 2 !== 3 (schema count). DECLARED KNOWN cross-phase.
2. `test/liveness.test.ts:633` beacon `age 14s` vs a hardcoded `age 13s`
   regex. REPRODUCES IN ISOLATION. Pre-existing: the test writes a beacon at
   `Date.now() - 13_000` (liveness.test.ts:646-657) then spawns a CLI; when
   that spawn costs the remaining fraction of a second the age rounds to 14.
   Not in this phase's diff.
3. `test/watcher.test.ts:269` and `:419`. BOTH PASS when watcher.test.ts runs
   alone. Full-suite load flakes. Not in this phase's diff.

## FINDINGS, BY MECHANISM (fix-round contract: fix the mechanism)

### MECHANISM 1: the inventory side is a bag of ids with no cardinality invariant

The coverage side has an explicit cardinality check (`double-bucketed`,
coverage.ts:240). The inventory side has none. `inventoryIds` is an ARRAY
built at coverage.ts:213 with duplicates preserved; `inventorySet`
(coverage.ts:214) is used only for the phantom scan, so the dedupe never
reaches the counting loop at coverage.ts:230.

The module comment at coverage.ts:34-39 claims the orphan and phantom checks
"scan in opposite directions on purpose, so neither can compensate for the
other's blind spot." That claim does not hold for cardinality: duplication is
detected in one direction and not the other.

**CR-985 (MEDIUM). A duplicated inventory row inflates `units` and every
count, green, no finding.** `src/gates/coverage.ts:213,230`.
Constructed against the REAL migration table (duplicating its line 17,
`| R-001a | S0, 15-17 | ... | M4 | ... |`):

```
A0 baseline                    units=115 findings=0 perKind={milestone:104,phase:11} perMilestone={M1:11,M2:16,M3:74,M4:13,M5:1}
A2  R-001a duplicated (x2)     units=116 findings=0 perKind={milestone:105,phase:11} perMilestone={M4:14, ...}
A2b R-001a tripled  (x3)       units=117 findings=0 perKind={milestone:106,phase:11} perMilestone={M4:15, ...}
```

Green each time. This is the phase's own hazard class inverted: the total adds
up (and grows) while one row is counted twice.

**CR-986 (LOW, same mechanism). A row lost from BOTH documents is green with a
silently smaller `units`; nothing establishes a floor.**

```
A1  '| R-050a |' deleted from BOTH real documents   units=114 findings=0 perMilestone M4=12  GREEN
A3  U+200B injected into id R-002 in BOTH documents units=114 findings=0 perMilestone M3=73  GREEN
```

The gate has no expected-totals field and no floor; criterion 1's 115 lives
only in `test/coverage-gate.test.ts:146`, so this repository is protected by
`node --test` but the SHIPPED gate (the point of Tiphys) is not: any project
consuming it gets no cardinality guard at all. LOW here because the repo's own
gate chain covers it; it becomes the same class as CR-985 in the product.

Suggested mechanism-level fix, addressing both: a `duplicate-inventory-id`
finding kind plus an optional `expectedUnits` / `minimumUnits` config field.

### MECHANISM 2: two definitions of "empty" in one module, only one of which trims

**CR-987 (MEDIUM). `checkFindingOutcomeParity` accepts a whitespace-only
outcome as a non-empty say.** `src/gates/coverage.ts:357` compares
`outcome === ""` with no trim, while `checkCoverage` trims every cell at
`src/gates/coverage.ts:162`.

```
A5  parity, outcome "   "        -> {"ok":true,"checked":1,"missing":[],"duplicated":[],"empty":[]}
A5b parity, outcome U+200B       -> {"ok":true,...,"empty":[]}
A5c parity, outcome "\n"         -> {"ok":true,...,"empty":[]}
A5d CONTRAST checkCoverage, parked note "   " -> findings=1 kind=missing-note  (RED, correct)
A5e checkCoverage, parked note U+200B         -> findings=0 perKind={"parked":1} (GREEN, wrong)
```

Plan criterion 8 and the module comment at coverage.ts:61-64 claim "the row
exists" and "the row says something" are not conflated. A three-space outcome
exists and says nothing. A5e shows `checkCoverage` is fooled too, because
`String.prototype.trim` strips U+00A0 and U+FEFF but not U+200B. Fix the
mechanism (one shared "is this cell empty" predicate that normalises
zero-width characters), not the two call sites.

### MECHANISM 3: a one-directional scan where the module's own design rule is two-directional

**CR-988 (MEDIUM). `checkFindingOutcomeParity` never looks at report rows whose
id is absent from the inventory.** `src/gates/coverage.ts:347` iterates
`inventoryIds` only; there is no analogue of the phantom scan.

```
A6  checkFindingOutcomeParity(["F-1"], [{F-1,"covered"},{F-99,"covered"}])
    -> {"ok":true,"checked":1,"missing":[],"duplicated":[],"empty":[]}
```

An outcome row for an id that no longer exists (a renumbering, the exact
scenario the coverage side's phantom check exists for) is silently accepted.
Plan step 4 declares this shape as "the contract M3's report schema must
satisfy or supersede", so the omission propagates into M3.

### MECHANISM 4: a probe whose answer is computed and then discarded

**CR-989 (MEDIUM). An evidence write that is refused, or that fails, is
discarded silently and the gate still reports green.**
`src/gates/coverage.ts:581-601`: `const refusal = refuseOpenForWrite(countsPath)`
computes a reason string that is never used; when it is defined the `if` body
is skipped and nothing is said. `runStep`'s failure is likewise ignored at
`coverage.ts:598`.

```
C8  FIFO at <evidence>/counts.json
    exit=0  stdout "coverage: green (2 finding ids checked)"  stderr EMPTY
    record  {"status":"green","units":2,...,"evidence":[]}
C9  --evidence pointing at a directory that does not exist
    exit=0  stdout "coverage: green (2 finding ids checked)"  stderr EMPTY
    record  {"status":"green","units":2,...,"evidence":[]}
```

Compare `coverage.ts:641-652`, where the identical refusal on the RESULT path
IS written to stderr and returns EXIT_GATE_ERROR. This is the CR-520 family
one step on: the type probe is performed correctly and its answer thrown away.
MECHANISMS.md's claim-file row is the governing rule ("must fail LOUDLY and
name the stuck file").

### MECHANISM 5: config strings spliced into a regex without validation

`^(?:${idPattern})$` at `src/gates/coverage.ts:151` and
`^(?:${bucketKind.pattern})$` at `src/gates/coverage.ts:256`. The schema
constrains both to `"type": "string"` only
(`coverage-config.schema.json:19-22, 34-36, 62-64`).

**CR-990 (LOW). A schema-valid config with a malformed regex throws and writes
NO result record.** C7: `idPattern: "Z-[0-9"` ->
`stderr: tiphys coverage: Invalid regular expression: /^(?:Z-[0-9)$/: Unterminated character class`,
exit 21, `*** NO RESULT FILE WRITTEN ***`. Every other error path in `main`
emits a record; only the module-bottom handler at `coverage.ts:668-676` does
not. CONTAINED by the runner (probe I3 below), hence LOW.

**CR-991 (LOW). Regex injection and unbounded backtracking.**
`idPattern: "R-1)|(.*"` compiles to `/^(?:R-1)|(.*)$/` and matched every row:
A9 returned `["ID","anything at all"]` from a two-row fixture. Backtracking is
unbounded and has no timeout:

```
A19 pattern (a+)+b, input "a" x N
    N=18   19 ms
    N=20   20 ms
    N=22   63 ms
    N=24  302 ms
    N=26 1231 ms      (4x per 2 characters)
    N=40  exceeded a 180 s timeout and was killed
```

Same "a block is not an exception" shape as the FIFO class, one input class
over.

**CR-992 (LOW). Overlapping bucket kinds resolve first-match-wins, silently.**
`coverage.ts:255-261` breaks on the first match. A7: kinds
`[milestone /M([0-9]+)/, parked /M1|parked/ requiresNote:true]`, value `M1`,
EMPTY note -> `units=1 findings=0 perKind={"milestone":1}`. The second kind's
`requiresNote` never applied and nothing said so. The kernel config's own four
kinds do NOT overlap (anchoring stops `M1-P3` matching `^(?:M([0-9]+))$`), so
this is careless-config only.

### Standalone lows

**CR-993 (LOW). Content markdown does not render as a table is parsed as a
table row.** `coverage.ts:154-156` trims BEFORE testing `startsWith("|")`.

```
A16 a four-space-indented row (a markdown code block) counted as live -> units=1 GREEN
A4b an identical '| F-9 | M9 | example |' inside a ``` fence in BOTH documents
    -> units=2 findings=0 perMilestone={"M1":1,"M9":1}   (an invented milestone, GREEN)
```

Latent, not live: `grep -n '```' delivery/requirements/migration-table.md
delivery/plan/kernel-plan-v1.md` returns nothing. Note the fail-closed
direction is correct when a fenced row appears in only ONE document (A4:
orphan; A15 HTML-commented row: orphan). It is the CONSISTENT case that
goes green.

**CR-994 (LOW). A duplicated `--result` flag silently discards the earlier
target.** `coverage.ts:433-439` overwrites. C11b:
`--result a.json --result b.json` -> exit 0, `a.json exists: no`,
`b.json exists: yes`. The runner never does this.

**CR-995 (LOW). `unitLabel` names the wrong noun.** `coverage.ts:635` and
`gates.manifest.json` both say `"finding ids checked"`, while
`coverage.ts:609` prints "115 inventory id(s) checked" and plan step 5 says
"`units` equals inventory ids checked". The summary row an operator reads
says the wrong thing.

## ATTACK TABLE

| # | Hazard | Construction | Outcome |
|---|---|---|---|
| A0 | baseline | real pair, real module | units 115, findings 0, perKind {milestone 104, phase 11}, perMilestone {M1 11, M2 16, M3 74, M4 13, M5 1}. Criterion 1 holds |
| A1 | renumbering: row lost from both docs | drop `\| R-050a \|` from both real files | units 114, M4 12, GREEN, 0 findings. **CR-986** |
| A2 | duplicate id, INVENTORY side | duplicate real line 17 (`R-001a`) | units 116, M4 14, GREEN, 0 findings. **CR-985** |
| A2b | same, tripled | three copies | units 117, M4 15, GREEN |
| A3 | unicode: U+200B inside an id, both docs | replace `\| R-002 \|` in both | units 114, M3 73, GREEN. **CR-986** |
| A4 | table row inside a code fence, one doc | fenced `\| F-9 \| M9 \| example \|` in inventory only | orphan F-9, RED. DEFENDED |
| A4b | same, CONSISTENT in both docs | fenced row in both | units 2, GREEN, invented perMilestone M9. **CR-993** |
| A5/b/c | outcome present but empty | parity outcome `"   "`, U+200B, `"\n"` | ok TRUE each time. **CR-987** |
| A5d | contrast | checkCoverage parked note `"   "` | missing-note, RED. Correct |
| A5e | ZWSP note | checkCoverage parked note U+200B | GREEN, perKind parked 1. **CR-987** |
| A6 | parity phantom direction | report row for id absent from inventory | ok TRUE. **CR-988** |
| A7 | bucket regex overlapping another kind | `milestone /M([0-9]+)/` + `parked /M1\|parked/` requiresNote | value M1 with empty note: GREEN under milestone. **CR-992** |
| A8 | CRLF line endings | both real docs converted | units 115, identical to baseline. DEFENDED |
| A9 | regex injection via idPattern | `R-1)\|(.*` | extracted `["ID","anything at all"]`. **CR-991** |
| A10 | malformed regex | `R-[0-9` | SyntaxError out of extractIdRows. **CR-990** |
| A11 | a row that parses as two (escaped pipe) | `\| F-1 \| M1 \\\| note \| real note \|` | unknown-kind on `"M1 \\"`, RED. DEFENDED |
| A12 | short row, bucket cell absent | `\| F-1 \|` only | unknown-kind on `""`, RED. DEFENDED |
| A13 | near-duplicate ids | R-050 and R-050a together | distinct, both counted. DEFENDED |
| A14 | coverage config reads the WHOLE plan file | extract from all of kernel-plan-v1.md | exactly 115 rows, lines 439-553. No stray R- table row elsewhere |
| A15 | HTML-commented row | `<!-- \| F-1 \| M1 \| removed \| -->` | orphan, RED. DEFENDED |
| A16 | four-space-indented row | markdown code block | counted as live, GREEN. **CR-993** |
| A17 | bucketColumn == noteColumn | schema-valid config, both 1 | parked row is its own note, always passes. LOW (hostile config) |
| A18 | non-participating capture group | `M([0-9]+)\|parked` | perMilestone {M1 1, milestone 1}, mixed key space. DECLARED in the schema description |
| A19 | ReDoS via config pattern | `(a+)+b`, N = 18..40 | 19/20/63/302/1231 ms, then >180 s at N=40, killed. **CR-991** |
| A20 | empty inventory WITH phantoms | inventory empty, 2 coverage rows | units 0, 2 phantoms, status forced green at coverage.ts:571-576 -> rewritten error/vacuous, phantoms preserved in `detail`. Fail-closed |
| C2 | FIFO at inventory path | mkfifo | exit 21, error, "is a named pipe ... not opened", record written, NO BLOCK. DEFENDED |
| C3 | FIFO at coverage-table path | mkfifo | same. DEFENDED |
| C4 | FIFO at --config path | mkfifo | same. DEFENDED |
| C5 | dangling symlink at inventory | ln -s nowhere | exit 21, error "does not exist". Fail-closed (see O-2) |
| C6 | symlink to a regular file outside the tree | ln -s ../elsewhere.md | followed and READ, green units 2. Documented classifyEntry policy |
| C7 | malformed regex through the CLI | schema-valid config | exit 21, stderr only, NO RESULT FILE. **CR-990** |
| C8 | FIFO at evidence/counts.json | mkfifo | exit 0 GREEN, evidence [], stderr EMPTY. **CR-989** |
| C9 | evidence directory absent | --evidence /nonexistent | exit 0 GREEN, evidence [], stderr EMPTY. **CR-989** |
| C10 | FIFO at the result path | mkfifo | exit 21, loud stderr naming the type, no block. DEFENDED |
| C11 | usage error | no --result | exit 64 with usage on stderr. DEFENDED |
| C11b | duplicate --result | two flags | exit 0, first target never written. **CR-994** |

## M2-P1 INTEGRATION PROBES

**Does the green-zero-units rewrite come from the shared constructor?** YES.
Derivation published:

```
$ grep -n "makeGateResult|vacuous|GateResult|status: \"error\"|status: \"green\"" src/gates/coverage.ts
14:  makeGateResult,
47-49: (comment)
532/544/557: status: "error"   <- EmitFields values, not GateResult literals
569-570: (comment)
631:  const result = makeGateResult({
```

`makeGateResult` at coverage.ts:631 is the SOLE construction site. There is no
`vacuous` assignment anywhere in the module and no `GateResult` object
literal. coverage.ts:571-576 deliberately reports `green` with 0 units and
lets `result.ts:179-189` do the rewrite. This is exactly what the brief asked
for, and it is correct.

**I1: `tiphys gates run --manifest gates.manifest.json`.** exit 0.
`declared 2 applicable 2 verdict 2 green 2 red 0 not-applicable 0 error 0 vacuous 0`.
Coverage row: `status green, units 115, unitLabel "finding ids checked",
vacuous false, applicable true`, detail carrying both views. Evidence
`counts.json` written under `<evidence>/coverage/` with the full report.
Record is schema-valid (also asserted by the phase's own test via
`validateResultDocument`).

**I2: precondition unmet.** Repointed `coverage-inventory-exists` at a missing
path. exit 21, status `not-applicable`, detail
`"precondition coverage-inventory-exists evaluated and unmet: ... does not exist"`,
`requiredNotApplicable: ["coverage"]`, reason `"no applicable gate"`. The
manifest entry matches the plan's gate table (`file-exists` on the inventory
config). Correct: `not-applicable` ASSERTS an evaluation happened, and a
required gate that is not-applicable fails the run.

**I3: a failure inside the gate.** Malformed-regex config through the runner.
exit 21, status `error`, detail
`"gate coverage exited 21 without writing a result record at <path>"`,
counts `error 1`, `aborted: false`. Files written: `summary.json`,
`coverage/stdout.txt`, `coverage/stderr.txt`, `coverage/result.json` (the
runner's own synthesised record). **Clean error, no partial record.** This is
why CR-990 is LOW rather than MEDIUM.

**I4: named pipe at the precondition target.** exit 21, `error 1`,
`applicable 0`, no block, and `error` rather than `not-applicable` (M2-C-3
fail-closed). Correct.

## ATTEMPTED AND COULD NOT CONSTRUCT

Recorded as attempted with the reason, never claimed impossible.

- **A false GREEN via an escaped pipe `\|` shifting columns.** Every variant I
  built lands the shifted fragment in `bucketColumn` and produces
  `unknown-kind` RED (A11), or leaves the note non-empty. I did not find a
  shift that both preserves a valid bucket value AND empties a required note.
  I am not asserting none exists.
- **A single table row that parses as two.** The parser is line-oriented
  (`coverage.ts:153` splits on `/\r?\n/`) and emits at most one `TableRow` per
  physical line, so I could not construct one. The converse (one logical row
  over two lines) is not markdown table syntax.
- **Homoglyph ids that MERGE two distinct rows.** `R-050` and `R-050a` stay
  distinct (A13); a homoglyph simply fails `idPattern` and drops out, which is
  a loud orphan/phantom unless edited in both documents, which is A3 and is
  already reported under CR-986. I did not find a homoglyph that makes two
  different ids collide into one.
- **The manifest precondition against a dangling symlink at the REAL inventory
  path.** Not constructed: it requires mutating a tracked file in the worktree
  under review. UNTESTED, not defended.
- **`gh`-dependent paths.** None in this phase; nothing attempted.

## OBSERVATIONS (not findings)

- **O-1.** The full suite was never run on the FLOOR toolchain by the
  implementer (the work history records floor usage for
  `test/coverage-gate.test.ts` alone, 9 pass). I ran it and found the three
  non-phase failures triaged above. `test/liveness.test.ts:633` is genuinely
  fragile (a hardcoded `age 13s` racing process startup) and deserves its own
  ticket; it will bite any slower runner.
- **O-2.** A dangling symlink at a configured path reports "does not exist"
  (C5) rather than naming the dangling link, inherited from
  `readRegularFileIfPresent` mapping dangling -> absent. Fail-closed, and
  task.ts behaviour rather than this phase's, but liveness has the opposite
  precedent ("a beacon that is a dangling symlink is a failed check, not an
  absent one").
- **O-3.** A symlink to a regular file OUTSIDE the tree is followed and read
  (C6, green units 2). Documented `classifyEntry` policy, recorded so it is
  not rediscovered.
- **O-4.** `coverage.ts:571-576` forces `green` on `units === 0` even when
  phantoms exist, so A20's two phantoms surface as `error`/`vacuous`. The
  phantoms survive in `detail`, so it is fail-closed, but "vacuous" slightly
  misdescribes "two phantom rows and no inventory".
- **O-5.** `new RegExp` is recompiled per row per kind at `coverage.ts:256`
  (115 x 4 on the real run). Not a correctness issue.
- **O-6.** The work history is honest. It does not claim any of the six
  mechanisms above are covered, and its claim grep was actually run and
  dispositioned. The M2-C-1 verification section checks out against the
  delivered M2-P1 code.

## Artifacts

- `attacks.mjs`, `attacks2.mjs`, `attacks3.mjs`: pure-function battery
- `cli-attacks.sh` (+ `cli/`): CLI battery C1-C11b
- `integ.sh` (+ `integ/`): M2-P1 integration probes I1-I4
- `floor.sh`: floor-toolchain wrapper
