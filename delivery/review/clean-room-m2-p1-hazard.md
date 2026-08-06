# Clean-room HAZARD-CONTRACT review: PR #11, M2-P1 (gate contract, manifest, runner, run pinning)

- Head SHA under review: `ac3b2f6f34fa96662e76dd3f2d0d46118ec980d4`
- Base: `main` at `037477e`
- Branch: `claude/m2-p1-gate-contract-and-runner`
- Contract: HAZARD. A criteria reviewer holds the acceptance-criteria walk concurrently (T-007); this report does not duplicate that walk beyond regression spot-checks.
- Reviewer isolation: detached worktree at `.../scratchpad/m2p1-hazard`, read-only against `/home/user/tiphys-ai-helmsman`. Nothing committed. `m2p1-criteria` untouched.
- Toolchain: floor toolchain `.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin` first on PATH; `node --version` re-printed in every shell that ran a gate or a probe. Default toolchain reached through `bash -lc`.

## VERDICT: FIX-ROUND-NEEDED

**1 high, 5 medium, 8 low.**

The spine CAN report green about something it never examined. The construction is
three lines of manifest and is deterministic (CR-800). Everything else is either a
rework-inside-the-phase item or documentation.

## Method

1. Read in full: `CLAUDE.md`, `MECHANISMS.md`, `delivery/plan/kernel-plan-m2.md`
   sections 1 to 3 and the whole `### M2-P1` block, `delivery/work-history/m2-p1.md`,
   `src/gates/*.ts`, `src/commands/gates.ts`, both schema documents,
   `gates.manifest.json`, `.github/workflows/gates.yml`, and the relevant parts of
   `src/task.ts` and `test/gates.test.ts`.
2. Built rather than read: a fixture-gate harness (`HZ/lab/fixture-gate.mjs`,
   `prewrite-gate.mjs`, `slow-gate.mjs`) and nine fixture manifests, driven against
   the real `bin/tiphys.ts` and `dist/bin/tiphys.js` entries.
3. Every negative result below carries its scope.

## The starting question, answered

**Can this spine say "examined and healthy" about something it never examined? YES.**

```
gates: declared 1 applicable 1 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: every applicable gate is green
RUNNER_EXIT=0
```

Total units examined by that bundle: 0. Three structurally different members of the
same shape all exit 0. That is CR-800.

---

# Findings

## CR-800 (HIGH) A bundle that examined nothing exits 0 with reason "every applicable gate is green", whenever the not-applicable verdict comes from the gate rather than from a runner-evaluated precondition

**Claim.** `counts.applicable` counts "the runner spawned this gate", not "this gate
was applicable". `runOneGate` sets `applicable: true` on every path that reaches the
`spawnSync` (src/gates/run.ts:487), including the path where the gate itself exits 20
with a `not-applicable` record. The aggregate vacuity rule at src/gates/run.ts:705 is
`counts.applicable === 0`, so it never fires along that path. A `conditional` gate is
then not caught by the required-not-applicable rule either, and the run exits
`EXIT_GREEN` with `reason = "every applicable gate is green"` while zero gates were
green.

**Why dangerous.** This is exactly SC-011, M2-C-2 at the aggregate level and M2R-012,
and it is the hazard the plan names for this phase in its own words: "a status that
can be constructed as green with nothing examined". Seven phases build against the
gate subprocess contract that run.ts documents at its head, and that contract tells
every gate author that exit 20 plus a `not-applicable` record is a first-class thing
a gate may emit. Along that documented path the aggregate anti-vacuity rule does not
hold. The `reason` string is also false, not merely permissive: "every applicable
gate is green" over a bundle with `green: 0` is the CR-680 shape (an evidence record
that asserts something untrue), and it is what an operator or a later reviewer reads
first.

**Contagion, concretely.** Section 1.4 declares `credential-token` as `conditional`
with precondition "env `TIPHYS_IMPLEMENTER_TOKEN` present". There is no env
precondition kind in the closed set (`PRECONDITION_KINDS`, src/gates/manifest.ts:44),
so M2-P8 must either wrap it in `command-exit-zero` (safe) or self-declare inside the
gate (the CR-800 shape). The plan does not say which, and the runner accepts both.

**One witness is not a class.** The guarding test
(`test/gates.test.ts:611`, behavior `gate-zero-applicable-is-error`) has exactly ONE
structural member: two `conditional` gates whose `file-exists` preconditions are
evaluated BY THE RUNNER. No test anywhere exercises a gate that declares its own
not-applicable status. That is the missing second member, and constructing it is what
found the defect.

**Evidence.**

Member 1, single conditional gate, gate-declared not-applicable:

```
$ cat HZ/lab/m-cond-na.json
{ "version": 1,
  "gates": [ { "id": "selfna", "command": ["node","HZ/lab/fixture-gate.mjs"],
               "unitLabel": "things examined", "applicability": "conditional" } ],
  "destructiveCommands": [] }

$ FIX_GATE=selfna FIX_STATUS=not-applicable FIX_UNITS=0 FIX_EXIT=20 \
    node bin/tiphys.ts gates run --manifest HZ/lab/m-cond-na.json --evidence HZ/ev1
gates: declared 1 applicable 1 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: every applicable gate is green
RUNNER_EXIT=0
```

`HZ/ev1/summary.json` carries `"exitCode": 0`, `"reason": "every applicable gate is
green"`, `"counts": {..., "green": 0, "not-applicable": 1, ...}`.

Member 2, mixed bundle exercising BOTH not-applicable paths at once:

```
$ FIX_GATE=gate-na FIX_STATUS=not-applicable FIX_UNITS=0 FIX_EXIT=20 \
    node bin/tiphys.ts gates run --manifest HZ/lab/m-mixed.json --evidence HZ/ev11
gates: declared 2 applicable 1 green 0 red 0 not-applicable 2 error 0 vacuous 0
gates: every applicable gate is green
RUNNER_EXIT=0
counts: {"declared":2,"applicable":1,"green":0,"red":0,"not-applicable":2,"error":0,"vacuous":0}
statuses: runner-na=not-applicable(applicable:false), gate-na=not-applicable(applicable:true)
total units examined: 0
```

Member 3, the same through `--only`:

```
$ ... --evidence HZ/ev12 --only gate-na
gates: declared 1 applicable 1 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: every applicable gate is green
RUNNER_EXIT=0
```

Both control directions, so the finding is not a restatement of "nonzero is nonzero":

```
# control A: the SAME gate reporting green with units 1
$ ... --only gate-na            (FIX_STATUS=green FIX_UNITS=1 FIX_EXIT=0)
gates: declared 1 applicable 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
RUNNER_EXIT=0                   <- indistinguishable from the vacuous run by exit code

# control B: the runner-evaluated precondition path, which DOES fail closed
$ node bin/tiphys.ts gates run --manifest HZ/lab/m-cond-precond.json --evidence HZ/ev2
gates: declared 1 applicable 0 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: no applicable gate
EXIT=21

# control C: the same gate-declared not-applicable, but applicability required
$ ... --manifest HZ/lab/m-req-na.json --evidence HZ/ev2b
gates: required gate(s) not applicable: selfna
EXIT=20
```

So the two paths to `not-applicable` are treated differently, and only one of them is
guarded.

**Concrete fix.** Make the vacuity rule test what it means. Replace
`counts.applicable === 0` with a check on gates that reached a verdict, for example a
new `counts.verdict = counts.green + counts.red`, and error with `NO_APPLICABLE_GATE`
when `counts.verdict === 0`. Separately, stop overloading `applicable`: a gate whose
RECORD says `not-applicable` should set `outcome.applicable = false` regardless of
which side decided it, so the summary field means "was applicable" rather than "was
spawned". And fix the `reason` string so it cannot claim greenness over an empty green
bucket. Add a test whose fixture gate declares its own `not-applicable` (the second
structural member the class is missing), plus the `--only` variant.

---

## CR-801 (MEDIUM) The runner exits 1, the RED code, on its own uncaught exception, with no summary and, mid-bundle, a gate-authored green record left on disk

**Mechanism, not the instance.** The mechanism is: *a throw that escapes `runGates`
reaches Node's top level, and Node's uncaught-exception exit code is 1, which is this
phase's own `EXIT_RED`*. The runner enforces exactly this discipline on its GATES
(src/gates/run.ts:528, "a nonzero exit here is NOT red: Node exits 1 on an uncaught
exception, which collides exactly with the red code") and does not obey it itself.
There is no try/catch and no `process.on('uncaughtException')` anywhere in
`src/cli.ts` or `bin/tiphys.ts`.

**Derivation, published in full.**

```
$ grep -rn 'throw ' src/gates/ src/commands/gates.ts
src/gates/manifest.ts:89:    throw new Error(
src/gates/manifest.ts:98:    throw new Error(loaded.reason);
src/gates/pin.ts:78:    throw new Error(
src/gates/pin.ts:122:      throw new Error(`${entry.reason}; refusing to pin ${root}`);
src/gates/pin.ts:143:      throw new Error(`pin root ${root} does not exist`);
src/gates/pin.ts:149:    throw new Error(`${entry.reason}; refusing to pin ${root}`);

$ grep -rn 'JSON.parse\|new RegExp\|manifestSchema()\|resultSchema()\|validateManifestDocument\|validateResultDocument' src/gates/ src/commands/gates.ts
src/gates/manifest.ts:95:  const parsed = JSON.parse(read.body) as unknown;      <- NOT in a try
src/gates/manifest.ts:205:    ...validate(manifestSchema(), document),           <- manifestSchema() throws
src/gates/manifest.ts:223:  return formatDiagnostics(validate(resultSchema(), document));
src/gates/manifest.ts:256:  const diagnostics = validateManifestDocument(parsed);  <- NOT in a try
src/gates/run.ts:558:  const diagnostics = validateResultDocument(parsed);    <- NOT in a try
src/gates/validate.ts:364:    if (!new RegExp(pattern).test(instance)) {         <- NOT in a try

$ grep -rn 'try\|catch\|uncaught\|unhandled\|process.on' src/cli.ts bin/tiphys.ts
(no output, exit 1)
```

Note the asymmetry the derivation exposes: `new RegExp` on a CALLER-supplied pattern
IS guarded (src/gates/run.ts:279-286), and `new RegExp` on a SCHEMA-supplied pattern
is not (src/gates/validate.ts:364). Same call, same failure, one guarded.

**What this derivation does NOT cover.** It searched `src/gates/**` and
`src/commands/gates.ts` only. It does not cover throw sites inside `src/task.ts`
(whose `classifyEntry`, `readRegularFileIfPresent` and `runStep` all catch internally,
checked by reading them), does not cover Node builtins invoked with already-validated
arguments, and does not cover the gate subprocesses, which are children and cannot
propagate a throw into the runner. It also does not cover the other seven CLI
subcommands, which are outside this phase.

**Evidence, two structurally different members.**

Member 1, throw before any gate runs (state: a `dist/` whose schema copy step did not
run, which is precisely the state witness W27 exists to guard):

```
$ rm -rf dist/src/gates/schemas
$ node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence HZ/ev4
RUNNER_EXIT=1
Error: schema document .../dist/src/gates/schemas/gate-manifest.schema.json is missing from this installation
    at readSchemaDocument (.../dist/src/gates/manifest.js:17:15)
    at manifestSchema (.../dist/src/gates/manifest.js:33:32)
    at validateManifestDocument (.../dist/src/gates/manifest.js:123:21)
    at loadManifest (.../dist/src/gates/manifest.js:173:25)
    at runGates (.../dist/src/gates/run.js:383:20)
$ ls -R HZ/ev4
ls: cannot access 'HZ/ev4': No such file or directory
```

Member 2, throw MID-BUNDLE (only the result schema removed), after gate one ran:

```
$ rm -f dist/src/gates/schemas/gate-result.schema.json
$ FIX_GATE=g-one FIX_STATUS=green FIX_UNITS=3 FIX_EXIT=0 \
    node dist/bin/tiphys.js gates run --manifest HZ/lab/m-two.json --evidence HZ/ev4c
RUNNER_EXIT=1
Error: schema document .../gate-result.schema.json is missing from this installation
    at resultSchema (.../dist/src/gates/manifest.js:39:30)
$ find HZ/ev4c -type f
HZ/ev4c/g-one/result.json      <- the GATE's own record, status green, never overwritten by the runner
HZ/ev4c/g-one/stderr.txt
HZ/ev4c/g-one/stdout.txt
$ test -f HZ/ev4c/summary.json && echo YES || echo "NO SUMMARY"
NO SUMMARY
```

The control shows the same state handled correctly by the sibling code path:

```
$ node dist/bin/tiphys.js gates self-check --manifest gates.manifest.json --result ... --evidence ...
manifest-self-check: error (0 schema documents validated)
SELFCHECK_EXIT=21
```

`dist/` was rebuilt afterwards; `npm run build` exit 0 and `git status --porcelain`
clean apart from this reviewer's own untracked `HZ/` and `REVIEW-OUT.md`.

**Why dangerous.** Member 2 leaves an evidence bundle containing a green record and no
summary, and the process exit code is 1, which `statusForExitCode(1)` in this phase's
own table reads as `red`. M2-P9's exit harness is a programmatic consumer of both the
exit code and the record count. A consumer cannot distinguish "one gate reported red"
from "the runner died before it could report anything".

**Concrete fix.** Wrap the body of `runGates` (or `cmdGates`) so that any escaping
throw becomes `EXIT_GATE_ERROR` with the reason on stderr, exactly as `ingestGateRun`
already does for its children. Belt and braces: make `readSchemaDocument` return a
result type rather than throwing, so `loadManifest` and `validateResultDocument` can
report `error` instead of unwinding. Add a `process.on('uncaughtException')` at
`bin/tiphys.ts` that exits 21 rather than 1. Witness it with two members, not one: the
two above are already staged.

---

## CR-802 (MEDIUM) `$ref` siblings are silently ignored: a KNOWN keyword in a position this validator drops without a word

**Claim.** `validateNode` returns immediately after following a `$ref`
(src/gates/validate.ts:303-315), so any keyword sitting beside `$ref` in the same
schema object is never evaluated. `loadSchema` permits it, because both `$ref` and the
sibling are inside the closed set. The result is a schema that validates less than it
says, with no diagnostic and no load error.

**Why dangerous.** The module's own comment states the rule this breaks: "a validator
that silently skips `oneOf` reports a document valid while never having checked the
constraint that mattered, which is the same shape as 'green by omission' one layer
down". The closed keyword set is loud about UNKNOWN keywords and silent about a KNOWN
keyword in a position it drops, which is the harder half of the attack. It matters
twice over: M2-P2 authors `witness-spec.schema.json` against this engine next, and
DR-0013 clause 6 promises M3-P1 can swap Ajv in and re-run M2's tests unchanged. Ajv
at Draft 2020-12 DOES apply `$ref` siblings, so a schema written against this engine
changes verdict at the swap. That is a compatibility break at the exact seam the plan
asks this phase to protect.

**Evidence.**

```
$ node HZ/lab/validator-probe.mjs
=== A1 $ref with sibling required/enum (2020-12 says siblings apply) ===
LOAD OK
DIAGNOSTICS(0): []
```

The schema was
`{"properties":{"x":{"$ref":"#/$defs/s","required":["mustBeThere"],"additionalProperties":false}}}`
and the instance was `{"x":{"anything":1}}`, which violates both siblings. Zero
diagnostics.

**Empty-handed controls in the same battery**, so the loudness claim is scoped rather
than dismissed: a nested `oneOf` inside `$defs/x/properties/y` IS refused at load
naming the keyword and its pointer (A4); a property literally NAMED `oneOf` is
correctly treated as a property and not a keyword (A5), so that aliasing trick does not
land; `items` in tuple (array) form is refused (A6); a dangling `$ref` and an external
`$ref` both produce `INVALID` lines rather than passing (A7, A8); and a trailing
newline does not defeat an anchored `pattern`, because JavaScript `$` is strict
end-of-input (A10).

**Concrete fix.** Either evaluate siblings after resolving the `$ref` (three lines:
resolve, validate against the target, then continue through the rest of this node), or
refuse `$ref` with any sibling validation keyword at LOAD time with a reason naming the
sibling. The second is cheaper and matches the module's stated philosophy. Witness it
with two structurally different siblings, for example `required` and `enum`.

---

## CR-803 (MEDIUM) Two runners sharing one evidence directory: a runner reports another run's record as its own, and a real red is converted to error while the surviving bundle is the other run's green

**Claim.** The runner takes no claim on the evidence directory, stamps no run identity
into any record or summary, and uses fixed per-gate paths
(`<evidence>/<gate-id>/result.json`, `<evidence>/summary.json`). `runOneGate` clears
the record path (src/gates/run.ts:461), spawns, and later ingests whatever is at that
path. Two runners interleave those steps freely.

**Why dangerous.** This is the declared hazard "a runner that writes a record for a
gate it did not execute", verbatim. It also destroys evidence silently: the surviving
bundle is attributable to no run. The implementer listed concurrency as NOT ATTACKED.
Seven phases run concurrently from M2-P2 onward, and M2-P9's exit harness runs the
bundle in the same tree developers do.

**Evidence.** Fixture gate writes its record FIRST, then sleeps, then exits, which is
the ordinary shape of a gate that does work after producing its record.

```
# Runner B: green, units 9, slow.  Runner A starts 0.5s later: green, units 5, fast.
# 3 of 3 trials identical.
   A (5 units) exit=0  gates: declared 1 applicable 1 green 1 red 0 ...
   B (9 units) exit=0  gates: declared 1 applicable 1 green 1 red 0 ...
   final summary row: units=5 detail="RUNNER-A examined 5 units" status=green
```

B, the last writer, wrote a summary attributing runner A's record (5 units, A's detail
string) to B's own run. B never examined 5 units of anything.

```
# Same shape, B red and A green:
   A exit=0  : gates: every applicable gate is green
   B exit=21 : gates: 1 gate(s) reported error: shared
```

B's gate genuinely reported RED and B reports ERROR, because it ingested A's green
record whose status disagreed with B's child's exit code. The red is lost.

```
# Last-writer-wins on the whole bundle, 6 of 6 trials (slow green A, fast red B):
trial 1..6: A exit=0 [every applicable gate is green] | B exit=1 [1 gate(s) reported red: shared]
            surviving record detail: RUNNER-A green 5 units / status=green
            surviving summary reason: every applicable gate is green | exit 0
```

**Scope of the negative.** I did not construct a case where the process EXIT CODE goes
green while a red was found: in every shape I built the red run still exited nonzero.
The corruption is of the record and of the on-disk bundle, not of the exit code, in the
shapes I reached. I did not construct contention on `gates.manifest.json` (it is read
once, read-only) or on the repository through the `git` subprocesses. In CI the
evidence directory is `${{ runner.temp }}/gate-evidence`, per job, so CI is not exposed
today; the exposure is local and is any two runs given the same `--evidence`.

**Concrete fix.** Cheapest sufficient closure: give each run a `runId`, pass it to the
gate as a flag, require it in the record, and refuse to ingest a record whose `runId`
is not this run's. That closes both observed shapes without a lock. If exclusion is
wanted instead, MECHANISMS.md's row "Claim file (mutual exclusion by O_EXCL)" is
binding and says a third user reads `src/lock.ts` first. Whichever is chosen,
`summary.json` should be written through an atomic replace with a collision-free stage
name (MECHANISMS.md, "Atomic file replacement"); it is currently a bare `writeFileSync`.

---

## CR-804 (MEDIUM) `takePin` has no vacuity floor, and the runner never enforces M2-C-5 although it holds both the data and the module

**Claim, part one.** `takePin([root])` over an existing but empty directory returns
`files: []`, and `comparePins` over two such pins returns `[]`. Nothing in the module
or its type distinguishes "the tree did not change" from "no tree was measured".

**Claim, part two.** Nothing in `src/gates/run.ts` imports `pin.ts` at all (verified by
grep; the only import anywhere in `src/` is the `Pin` TYPE into `result.ts`). A gate can
therefore report `green` while carrying a `pin` pair whose start and end differ, and the
runner will not notice, two lines away from where it applies the structurally identical
M2-C-2 rewrite to `units` (src/gates/run.ts:584).

**Why dangerous.** Part one is M2-C-2 one layer down, at the module two other phases
consume as their PRIMARY evidence. M2-P2 step 3 takes pins "over the clone's source and
test roots"; M2-P3 pins under M2-C-5. If a scratch clone puts sources one directory
deeper than the computed root, the pin silently measures nothing, `comparePins` reports
no difference, and the gate reports green with units taken from its test count rather
than from the pin. Part two means M2-C-5 is enforced entirely by each gate's own
honesty, which is the property this milestone exists to stop relying on.

**Evidence.**

```
$ node HZ/lab/pin-probe.mjs
B1 empty root: files=0 differences=[]
```

Related, and stated as empty-handed controls rather than findings: two spellings of the
same root do NOT silently compare equal, they produce a loud added+removed pair
(`B2 abs-vs-relative root: differences=2`), and a symlinked directory inside a root
makes the whole pin THROW rather than skip
(`B1b THREW: .../vialink/src is a directory, not a regular file, so it was not opened; refusing to pin`).
Both are fail-closed and correct.

**Concrete fix.** For part one, give `Pin` a `fileCount` and make `takePin` throw when
a declared root contributed zero files, with a reason naming the root; a root a caller
declared that holds nothing is a configuration error, not a measurement. Putting the
rule in the module that carries it is T-005's lesson. For part two, in `ingestGateRun`:
if `record.pin` is present, `record.status === "green"` and
`comparePins(record.pin.start, record.pin.end).length > 0`, rewrite to `error` naming
M2-C-5, exactly as M2-C-2 is handled.

---

## CR-805 (MEDIUM) `branch-matches` is unanchored and interpolates `{phase}` unescaped into regex source, and the kind has no test at all

**Claim.** src/gates/run.ts:277-287 does
`pattern.split("{phase}").join(options.phase)` and then `new RegExp(source).test(name)`.
The match is unanchored, and the substituted phase value is regex SOURCE, not a literal.

**Why dangerous.** M2-P4's `scope` gate is declared in section 1.4 with precondition
`branch-matches` phase pattern, and M2-P4 is one of the seven phases dispatched against
this contract. A precondition whose job is to decide "am I on the branch this phase
governs" that matches a superstring of that branch is deciding applicability on a
weaker predicate than it appears to. The unescaped substitution is the same family as
MECHANISMS.md's "Deciding what another program will do by pattern-matching the text of
a file it consumes": `{phase}` is documented as a token substitution, and a
substitution into regex source without escaping silently changes the pattern's meaning.
The implementer lists this kind as UNWITNESSED, correctly.

**Evidence.** Scratch git repository on branch
`evil/claude/m2-p4-scope-auditor-DECOY`, manifest precondition pattern
`claude/{phase}-`:

```
--phase "m2-p4" -> status=green | fixture gate      <- decoy branch MATCHED
--phase "m2.p4" -> status=green | fixture gate      <- '.' behaved as a wildcard
```

Control, same manifest, branch renamed to `totally/unrelated`:

```
--phase "m2-p4" -> status=not-applicable | precondition p evaluated and unmet: branch totally/unrelated does not match claude/m2-p4-
--phase "m2.p4" -> status=not-applicable | precondition p evaluated and unmet: branch totally/unrelated does not match claude/m2.p4-
```

**Scope of the negative.** Unanchored matching is strictly MORE permissive, so I could
not construct a real phase branch that fails to match. The exposure is
false-applicability, not false-inapplicability.

**Concrete fix.** Escape the substituted `{phase}` before building the source, and
either anchor the compiled expression or say in the schema description that the pattern
is unanchored so an author knows to write `^...$`. Add a test for the kind with two
members: a decoy superstring branch and a phase id carrying a regex metacharacter.

---

## CR-806 (LOW) `counts.vacuous` is not a strict subset of `error`

Step 8 says "`vacuous` is a strict subset of `error` and `error` is the total". A gate
that writes `vacuous: true` on a green record passes the schema (`vacuous` is an
optional boolean with no cross-field constraint) and is counted in both buckets by
src/gates/run.ts:657, which tests `result.vacuous === true` without regard to status.

```
$ FIX_STATUS=green FIX_UNITS=7 FIX_EXTRA='{"vacuous":true}' node bin/tiphys.ts gates run ...
gates: declared 1 applicable 1 green 1 red 0 not-applicable 0 error 0 vacuous 1
EXIT=0
counts: {"declared":1,"applicable":1,"green":1,"red":0,"not-applicable":0,"error":0,"vacuous":1}
```

The runner is documented as adversarial towards its own gates; here it trusts a field
whose whole purpose (deviation D2) is to be set only by the two rewrite points.

**Fix.** In `ingestGateRun`, drop or reject an incoming `vacuous` the runner did not
set, and assert `counts.vacuous <= counts.error` before writing the summary.

## CR-807 (LOW) A `$ref` cycle in a schema document is a RangeError, not an `INVALID` diagnostic

```
=== A2 self-referential $ref ===
LOAD OK
THREW: RangeError: RangeError: Maximum call stack size exceeded
```

`loadSchema` walks `properties`, `$defs` and `items` but never follows `$ref`, so a
cycle passes the load and blows the stack during validation. It is the same escaping
throw as CR-801 and is only separate because the fix is in a different module: detect a
cycle at load, or carry a visited set in `resolveRef`. Ajv handles recursive refs, so
this is also a seam divergence. Reachable when M2-P2 or M3 authors a recursive schema,
which is a normal thing to want.

## CR-808 (LOW) `__proto__` is not rejected by `additionalProperties: false`

```
=== A3 __proto__ key vs additionalProperties:false ===
DIAGNOSTICS(1): ["INVALID #/other property other is not permitted here"]
```

`other` was rejected; `__proto__` was not. Cause: `properties["__proto__"]` resolves
through the prototype chain to `Object.prototype`, which `isPlainObject` accepts as a
subschema, so the key is treated as declared. Impact today is one ignored extra key,
not pollution (JSON.parse creates an own property). It is on the list because Ajv
rejects it, so it is another seam divergence. **Fix:** use
`Object.prototype.hasOwnProperty.call(properties, name)` before treating `subschema` as
declared, in both `validateNode` and `checkSchemaNode`.

## CR-809 (LOW) A byte-identical rewrite whose mtime is restored at full precision is invisible to the pin

```
mtimeMs 1786000465646.4954 -> 1786000465646.4954
DIFFERENCES: []
```

`cp -p`, `rsync -a` and `tar -x` all restore mtime through `utimensat` at nanosecond
precision, so the pin's four fields cannot see them. This is NOT held against the
implementer: M2-C-5 fixes the field set at "file set, sha256, size, mtime", so closing
it is a plan question. It is recorded because M2-P2 criterion 7 is a pin witness and
should not be read as covering this shape. The cheap closure is `ctimeMs` (no userspace
call can restore it; `utimes` bumps it) or `ino` (catches replace-by-rename).

**On the implementer's UNPROVEN sub-millisecond claim, judged as asked.** On this
container mtimeMs carries a fractional part
(`1786000378281.7456 -> 1786000378282.0005` for two back-to-back writes), so
granularity is far finer than a millisecond, and `ubuntu-latest` uses ext4, which
stores nanosecond mtimes. The coarse-granularity risk is not real on either filesystem
in play. The real gap is the deliberate-restore shape above, which is not a granularity
question at all.

## CR-810 (LOW) The claim-grep transcript recorded in the work history does not reproduce against the submitted file

The work history records two hits. Re-running the binding command against the submitted
file returns fourteen: lines 74 and 350 as declared, plus lines 678 to 703, which are
the grep's own transcript and its disposition table quoting the very phrases it
adjudicates. Nothing is hidden and every extra hit is a quotation, but the next reader
who runs the binding grep gets a different answer from the one recorded and has to
re-adjudicate twelve lines to discover they are self-references. **Fix:** re-run the
grep after the disposition table is written and record the final output, or exclude the
transcript block explicitly and say so.

## CR-811 (LOW) One diagnostic message is authored outside `DIAGNOSTIC_MESSAGES`

`duplicateIdDiagnostics` (src/gates/manifest.ts:191) writes
`gate id "x" is declared more than once` inline. The validate module states that the
message table exists "so a future engine has one table to map onto instead of a search
through call sites". This message requires exactly that search, and it is asserted by a
test (my seam probe shows it as line 3 of a three-line ordered output), so M3-P1 will
hit it. **Fix:** move it into `DIAGNOSTIC_MESSAGES` as `duplicateId(id)`.

## CR-812 (LOW) `manifest-self-check` reports 3 units under the label "schema documents validated" when two schema documents exist

```
$ node bin/tiphys.ts gates self-check --manifest gates.manifest.json --result ...
manifest-self-check: green (3 schema documents validated)
units: 3 unitLabel: "schema documents validated"
```

`schemaDocumentPaths()` returns two paths; the third unit is the manifest. `units` is
the entire anti-vacuity device of M2-C-2, and the one gate the milestone ships today
reports a count that does not match its own declared unit. Section 1.4 fixes the
unitLabel, so the fix is to count 2 and report the manifest validation in `detail`, or
to ripple the plan's unitLabel.

## CR-813 (LOW) The CI bundle runs the compiled runner and a source-entry gate

`gates.manifest.json` invokes `node bin/tiphys.ts`; `.github/workflows/gates.yml`
invokes `node dist/bin/tiphys.js gates run`. So in CI the runner resolves
`dist/src/gates/schemas/*.json` and the gate it spawns resolves
`src/gates/schemas/*.json`. Both dist documents ARE exercised (by the runner's manifest
load and record ingest), so nothing goes unchecked, but the bundle's own record says
"3 schema documents validated" about source copies during a run whose runner used dist
copies. `npm pack --dry-run` confirms `bin/tiphys.ts` is not shipped
(`bin/tiphys.ts shipped? false`), so a manifest carrying that command is
repository-local by construction. Worth one sentence in the manifest or the work
history so M4 does not inherit the ambiguity.

---

# Explicit questions the brief asked

**Can the spine report green about something it never examined?** YES, along the
gate-declared not-applicable path. CR-800, three constructed members, both controls.
Along the runner-evaluated precondition path it correctly reports `no applicable gate`
and exits 21. The vacuous-green defences at the CONSTRUCTOR and at INGEST are sound:
`makeGateResult` folds negative and fractional units to zero and rewrites, and a
hand-written record bypassing the constructor is rewritten at ingest. A gate that lies
about `units` is not caught; the work history says so honestly and restates it as an
open question, and I did not find a way to close it either without redoing the gate's
work. It is honestly recorded. The one place it could leak into a consumer is that
`summary.json` carries no aggregate units total, so no consumer can currently be misled
by one; if M2-P9 adds one it will be a sum of unaudited claims and should be labelled
as such.

**Is the diagnostic contract sound as a seam for Ajv?** Mostly, with two real
divergences and two cosmetic ones. Sound: the `INVALID <pointer> <message>` shape, RFC
6901 fragment pointers, the final (pointer, message) sort that makes ordering a
property of the contract rather than of the traversal, and the absence of any test
asserting engine-internal wording (grep for `unsupported schema keyword`,
`is not a schema object`, `unsupported type value`, `unsupported additionalProperties`
across `test/*.ts` returns nothing; 11 assertions on `INVALID ` lines). Determinism
holds across 10 runs with three violations from three DIFFERENT producers interleaving
by pointer:

```
distinct orderings across 10 runs: 1
  INVALID #/gates/0/precondition/path required property path is missing
  INVALID #/gates/1/applicability value "nope" is not one of the permitted values "required", "conditional"
  INVALID #/gates/1/id gate id "dup" is declared more than once
```

Not sound: `$ref` siblings (CR-802) and `$ref` cycles (CR-807) both behave differently
under Ajv, so a schema authored against this engine can change verdict at the swap;
`__proto__` (CR-808) likewise; and one message lives outside the contract table
(CR-811). Fixing CR-802 and CR-811 before seven phases author schemas against this
engine is the cheap moment.

**Do the three deviations need plan ripple?**

- **D1 `gates[].parameters`: NECESSARY, and it needs a ripple.** The alternative is the
  mechanism MECHANISMS.md forbids with four rounds of receipts. But step 6's field list
  is what seven implementers will read when they author their manifest entries, and it
  does not mention `parameters`. Section 1.4's table already implies it ("plus
  `--phase`" for `scope`), so the ripple is one line in step 6 and costs nothing.
- **D2 `GateResult.vacuous`: NECESSARY, and it needs a ripple.** Same reasoning: step 2
  fixes the record's field list and nine phases emit records against it. The ripple
  should also say the field is set ONLY by the two rewrite points, which is what CR-806
  shows is currently unenforced.
- **D3 `self-check` in `src/commands/gates.ts`: CONVENIENCE, and NO ripple needed.** The
  plan does not say where it lives, the file is on the files-to-touch list, and nothing
  downstream depends on the placement.
- **The two plan READINGS.** Both are correct and both are well argued. The second
  ("not executed" means not REACHED) is right. The FIRST is the interesting one: it
  correctly identifies that criterion 5 and criterion 9 contradict each other on a
  single-gate manifest, and resolves the contradiction in the FIXTURE rather than in the
  code. That resolution is right for the runner-precondition path and is exactly what
  leaves the gate-declared path unguarded. So the plan text needs a ripple too:
  criterion 9's rule should be stated as "a bundle in which no gate reached a green or
  red verdict exits nonzero, regardless of which side decided not-applicable".

**What I constructed for concurrency.** Two runners against one evidence directory, in
three shapes. (i) Fast red versus slow green, 6 of 6 trials: the red run exits 1
correctly but the surviving bundle is entirely the green run's, record and summary
both. (ii) Record-written-early gates, 3 of 3 trials: the later runner ingests and
reports the earlier runner's record, 5 units and the other run's detail string, for a
gate it spawned itself with 9. (iii) The same with the slow runner red: its red is
converted to `error` because it ingested the other run's green record. Scope: I did not
reach a shape where a red run exits 0, and I did not construct contention on
`gates.manifest.json` (read-only, read once) or through the `git` subprocesses. CI is
not exposed today because `${{ runner.temp }}` is per job.

**The fourth double-guard instance.** Found, and it is CR-800. The property "a bundle
that examined nothing does not report success" is held by two rules,
`counts.applicable === 0` and `requiredNotApplicable`. The single test that guards it
(`test/gates.test.ts:611`) has ONE structural member, the runner-evaluated
precondition, in which both rules hold. The second structurally different member, a
gate that declares its own not-applicable status, has no test and is broken. That is
the same shape as W5, W15 and W23, one level up.

---

# Probes run

| # | Probe | Result | Scope of the result |
|---|---|---|---|
| P1 | Conditional gate self-declaring not-applicable | **CR-800**, exit 0, green 0 | Single gate; extended to members 2 and 3 |
| P2 | Runner-evaluated precondition unmet, conditional | Empty-handed: exit 21, `no applicable gate` | The guarded path; this is the control for CR-800 |
| P2b | Required gate self-declaring not-applicable | Empty-handed: exit 20, named | `required` is protected; only `conditional` leaks |
| P3 | Gate smuggles `vacuous: true` onto a green record | **CR-806** | Schema permits it; no cross-field check exists |
| P3b | Gate reports `units: 1e21`, green | Accepted (`units: 1e+21`, status green) | Confirms the admitted `units` limit; no consumer sums units today |
| P4 | `dist/` missing both schemas, `gates run` | **CR-801** member 1, exit 1, no evidence dir | Broken-install state; `dist/` restored and rebuilt |
| P4b | Same state, `gates self-check` | Empty-handed: exit 21, error record | The correct behaviour, in the sibling path |
| P4c | `dist/` missing only the result schema, two gates | **CR-801** member 2, exit 1, green record on disk, no summary | Mid-bundle crash |
| A1-A12 | Validator battery: `$ref` siblings, `$ref` cycle, `__proto__`, nested unknown keyword, property named `oneOf`, tuple `items`, dangling/external `$ref`, non-string `required`, anchored pattern vs trailing newline, `minimum` on a string | **CR-802, CR-807, CR-808**; A4/A5/A6/A7/A8/A10 empty-handed | Whole-document schemas only; did not fuzz instance shapes |
| B1 | `takePin` over an empty root | **CR-804** | Existing-but-empty root; a missing root correctly throws |
| B1b | Symlinked directory inside a root | Empty-handed: the pin THROWS naming the path and type | Fail-closed and correct |
| B2 | Same tree pinned under absolute and relative root spellings | Empty-handed: loud added+removed pair | Not silently equal |
| B3 | mtime granularity on this filesystem | Sub-millisecond fractional mtimeMs observed | This container; ext4 on ubuntu-latest is nanosecond |
| B3b | Content changed, mtime restored | Empty-handed: caught by sha256 | Both fields pull their weight |
| B4/B4b | Byte-identical rewrite, mtime restored at full precision | **CR-809** | Deliberate-restore shape only; not T-004's actual incident |
| P6 | `branch-matches` against a decoy superstring branch, and a metacharacter phase id | **CR-805**, both directions with control | False-applicability only |
| P7 | Two runners, one evidence dir, slow-green vs fast-red, 6 trials | **CR-803** | Deterministic in the constructed timing |
| P7b | Record-written-early gates, 3 trials | **CR-803**, cross-run record attribution | Same |
| P7c | Same with the slow runner red | **CR-803**, red converted to error | Same |
| P8 | Independent M2-C-6 derivation over `src/gates/**` and `src/commands/gates.ts` | Empty-handed: no unguarded open found | See the derivation and its scope below |
| P9 | `mkfifo` at the manifest path, at a `file-exists` target, at a gate's record path | Empty-handed: all three exit 21 with the type named, none hit the 20s `timeout` | Regression spot-check of criterion 16 |
| P10 | `--only` unknown id, `--only` known id, `file-absent` kind | Empty-handed: 21 / 0 / 0, all correct | Three arms listed UNWITNESSED, and they work |
| P11 | Gate writing a record for a DIFFERENT gate id | Empty-handed: `gate bm wrote a record for fixture`, error, exit 21 | Reached by accident while building P6; the arm the work history calls unwitnessed does work |
| P12 | Registry resolution by name, independently computed | Empty-handed: 186 registered, 180 titles, 0 unresolved, 0 unregistered, 24 added, 0 removed, 0 retitled | Matches the work history exactly |
| P13 | Step-5 measurement re-run: does `tsc -b` alone emit JSON into `dist/`? | Empty-handed: `JSON under dist after tsc alone: []` | The `package.json` edit IS justified under the plan's own condition |
| P14 | Seam determinism, 10 runs, three violations from three producers | Empty-handed: 1 distinct ordering | Manifest validation only |
| P15 | Engine-wording leak into tests | Empty-handed: grep for four internal reason strings returns nothing | `test/*.ts` |
| P16 | Conventions: non-ASCII, em/en dash, pnpm/yarn, tool names in commit messages | Empty-handed: all clean | The 16 changed files and `git log 037477e..ac3b2f6` |
| P17 | Scope audit | Empty-handed: 16 files, 14 on the list, 2 standing extras | Matches |
| P18 | `npm pack --dry-run` | Both schema documents present under `dist/src/gates/schemas/` | 57 files |

## My own M2-C-6 derivation (item 4 of the brief), published in full

```
$ grep -rn 'from "node:fs' src/gates/ src/commands/gates.ts
src/gates/run.ts:2:import { lstatSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
src/gates/pin.ts:2:import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
src/commands/gates.ts:16:import { writeFileSync } from "node:fs";

$ grep -rnE '\b(readFileSync|writeFileSync|appendFileSync|openSync|renameSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|rmdirSync|cpSync|copyFileSync|existsSync|realpathSync|readlinkSync|createReadStream|createWriteStream|opendirSync|globSync|truncateSync|symlinkSync|linkSync|chmodSync|utimesSync)\(' src/gates/*.ts src/commands/gates.ts
src/gates/pin.ts:84:  const stats = statSync(path);
src/gates/pin.ts:85:  const body = readFileSync(path);
src/gates/pin.ts:101:    return lstatSync(path).isDirectory();
src/gates/pin.ts:108:  const names = readdirSync(dir).sort();
src/gates/run.ts:137:    return lstatSync(path).isDirectory();
src/gates/run.ts:160:    mkdirSync(path, { recursive: true }),
src/gates/run.ts:171:  const written = runStep(`writing ${path}`, () => writeFileSync(path, body));
src/gates/run.ts:462:    rmSync(recordPath, { force: true }),
src/commands/gates.ts:140:    writeFileSync(path, renderGateResult(result)),

$ grep -rnE 'spawnSync|execFile|execSync|spawn\(' src/gates/*.ts src/commands/gates.ts
src/gates/run.ts:207:  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
src/gates/run.ts:335:  const result = spawnSync(command[0] as string, command.slice(1), {...});
src/gates/run.ts:475:  const child = spawnSync(entry.command[0] as string, argv, {...});
```

Every row goes through the classifier or is a non-blocking probe:

| Row | Guard | Verdict |
|---|---|---|
| `pin.ts:85` readFileSync | `classifyEntry` at `pin.ts:76` | guarded |
| `pin.ts:84` statSync | probe, cannot block | safe |
| `pin.ts:101`, `run.ts:137` lstatSync | probe, cannot block | safe |
| `pin.ts:108` readdirSync | preceded by `isRealDirectory` (lstat); `opendir` uses `O_DIRECTORY`, which fails ENOTDIR on a FIFO rather than blocking | safe |
| `run.ts:160` mkdirSync | `classifyEntry` at `run.ts:149` | guarded |
| `run.ts:171` writeFileSync | `refuseOpenForWrite` at `run.ts:167` | guarded |
| `run.ts:462` rmSync | `refuseOpenForWrite` at `run.ts:450`; `unlink` does not open | guarded twice |
| `commands/gates.ts:140` writeFileSync | `refuseOpenForWrite` at `commands/gates.ts:134` | guarded |
| `run.ts:207/335/475` spawnSync | `cwd` is not caller-supplied through the CLI; `execvp` on a non-directory cwd fails ENOTDIR without blocking | safe |

Reads of externally supplied paths not in the table go through
`readRegularFileIfPresent` (`manifest.ts:87`, `manifest.ts:235`, `run.ts:538`,
`commands/gates.ts:176`) or `classifyEntry` (`run.ts:240`, `run.ts:524`, `pin.ts:115`,
`pin.ts:141`). **No second implementation of the probe exists in this diff**, confirmed
independently.

**What MY derivation does not cover.** It searched `src/gates/*.ts` and
`src/commands/gates.ts` and nothing else. It does not cover `src/task.ts`'s own
documented probe-then-open window, inherited unchanged. It does not cover the file
access of the `git` and gate subprocesses, which open paths this audit never
enumerated. It does not cover `src/cli.ts` or the other seven subcommands. It does not
cover the twelve open M1 instances in `src/lock.ts`, `src/pool.ts` and `src/brief.ts`,
which have no M2 owner. And it enumerates a FIXED LIST of function names rather than all
of `node:fs`, so an API neither I nor the implementer named would be invisible to both
of us.

**One difference from the implementer's audit, stated because it is a scope gap even
though it yielded nothing.** The implementer's grep pattern list omitted `readdirSync`
and the whole stat family. My wider list adds `pin.ts:108`, `pin.ts:101` and
`run.ts:137`. All three are safe, so the conclusion is unchanged and the SCOPE statement
in the work history should say the audit enumerated named functions rather than the
`node:fs` surface.

## Gate numbers, both toolchains

Floor toolchain, `node --version` printed in the same shell as each command:

```
TOOLCHAIN: v26.6.0 / npm 11.18.0
npm ci                        exit 0
npm run build                 exit 0
git status --porcelain        clean (only this reviewer's untracked HZ/ and REVIEW-OUT.md)
npm test                      exit 0   tests 180  pass 180  fail 0  skipped 0  duration_ms 99126
```

Container default toolchain, through `bash -lc`:

```
TOOLCHAIN: v22.22.2 / npm 10.9.7   (/opt/node22/bin/node)
npm test                      exit 0   tests 180  pass 178  fail 0  skipped 2
```

The two skips are the pre-existing floor-gated doctor tests
(`local Node v22.22.2 is below the kernel floor >=26`), not this phase's. Both figures
match the work history exactly. `test/liveness.test.ts:671` did not flake in either run.

## Registry, scope, conventions

```
behaviors registered       : 186
distinct test titles run   : 180
behaviors UNRESOLVED       : 0
test titles unregistered   : 0
added / removed / retitled : 24 / 0 / 0   (base at 037477e: 162)
```

Scope: 16 files, all on the plan's files-to-touch list plus `test/behaviors.json` and
`delivery/work-history/m2-p1.md`, the two standing extras. `package.json`'s edit is
conditional on step 5, and I re-measured the condition myself: `npx tsc -b` alone leaves
`dist` with no `.json` file at all, so the copy step is required and the edit is
authorised. Conventions clean: no non-ASCII in any changed file, no em or en dash in the
diff, no `pnpm`/`yarn`, no model or tool name in `git log 037477e..ac3b2f6`.

---

# Honest failure

1. **I did not construct a shape in which the runner exits 0 while a gate reported
   red.** Every concurrency and crash shape I built kept the red run's exit code
   nonzero. The corruption I could reach is of the record and of the on-disk bundle.
   Someone with a different timing model may do better; treat "the exit code cannot be
   forced green by contention" as UNPROVEN, not as established.
2. **I did not audit the gate subprocesses' own file access**, the same gap the
   implementer declares. A gate that opens a path badly is invisible to both audits.
3. **I did not exercise the CI workflow.** `gh` is absent and, per warning 6, not an
   authority here. Nothing in this report is evidence about what GitHub does with `if:`,
   `continue-on-error`, job defaults, check-run naming or the ruleset. Criterion 14
   remains correctly CI-deferred and I did not improve on the implementer's position. I
   also did not verify that `actions/checkout@v4`'s shallow clone breaks a future
   `diff-touches` gate; the implementer's forward warning about `fetch-depth: 0` looks
   right by reading and I did not test it, because no gate needs it today.
4. **I did not fuzz the validator's instance space**, only its schema space plus a dozen
   hand-built instances. `type`/`enum`/`const` interactions on nested arrays are
   untested by me.
5. **I did not measure the runner under a manifest of realistic size.** Everything ran
   with one or two gates. Ordering, counter and evidence-layout behaviour at ten gates is
   inferred from the code, not witnessed.
6. **CR-804's contagion argument is a reading of M2-P2 and M2-P3's plan text, not a
   measurement.** Those phases do not exist yet. If their implementers compute roots
   correctly the vacuity floor never bites.
7. **I did not attempt to overturn my own CR-800 by arguing that a gate should never
   self-declare not-applicable.** If the orchestrator decides that the gate subprocess
   contract forbids a gate from emitting `not-applicable` and that exit 20 is reserved
   for the runner, then CR-800 becomes a documentation and validation finding rather
   than a logic one. Either way something must change, because today the contract
   documented at the head of `src/gates/run.ts` explicitly permits exit 20 from a gate.
