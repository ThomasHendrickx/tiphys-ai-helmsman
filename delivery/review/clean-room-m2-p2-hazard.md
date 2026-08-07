# Clean-room HAZARD review: M2-P2 red-witness harness (second contract)

- Subject branch: claude/m2-p2-red-witness-harness
- Head: 7ed8830fc2ccdd859c08b46f4355ba9ad4799f4f (verified via git rev-parse; checked out detached)
- Merge base with main: bcefc9886159a693fc752bcb602cc201b09db9f5
- Reviewer role: HAZARD (T-007 second contract). Attack what the criteria cannot describe.
- Toolchain: floor node v26.6.0 (scratchpad), npm ci exit 0, build exit 0, git clean after build.
- Phase suite: test/witness.test.ts 28/28 pass on floor (54.9s).

## VERDICT: FIX-ROUND-NEEDED

One MEDIUM finding, merge-blocking under DR-0012 (unresolved medium). It lands
on the phase's OWN declared hazard class #3 (M2-D-18: "an assertion over a
document's TEXT that survives an edit inverting its meaning"). Plus one
MEDIUM/LOW coverage gap in rule (f), and observations.

---

## FINDINGS

### CR-H1 (MEDIUM, merge-blocking): rule (g) text-assertion detection is bypassed by three standard idioms, shipping a single-member text-asserting witness GREEN

The whole reason M2-P2 exists (hazard #3) is that a witness whose test merely
asserts the TEXT of a document is worthless: it survives an edit that inverts
the document's behaviour (the six-instance CR-661 class). Rule (g) is supposed
to catch such witnesses by (a) forcing >=2 structurally different members and
(b) requiring a member that preserves the asserted text while inverting
behaviour. Rule (g)'s strong form only fires when `deriveTextAssertions`
(src/witness/run.ts:342) flags the witness text-asserting. That detection is a
syntactic pattern match, and its two extraction regexes are narrower than the
plan's own description ("a file read from a path", "the four assert forms",
M2-P2 step 4 rule (g)). Three STANDARD, non-exotic idioms defeat it, each
making textAsserting=false so a SINGLE deleting member passes and the gate
returns GREEN:

Mechanism: `deriveTextAssertions` requires BOTH `documents.size > 0` AND
`patterns.size > 0` (run.ts:370). Documents come from `READ_CALL =
/readFileSync?\s*\(([^)]*)\)/` (run.ts:328)     note `readFileSync?` matches
"readFileSyn"+optional"c", i.e. ONLY synchronous readFileSync, never async
`readFile`. Patterns come from a literal-regex regex (MATCH_PATTERN,
run.ts:331) and a literal-string `.includes(` regex (run.ts:332); a variable
regex or a variable path yields nothing.

Confirmed by construction against the real gate (runRedWitnessGate), each a
single member that DELETES the guarded workflow step:

| Member | idiom | deriveTextAssertions | gate status |
|---|---|---|---|
| D | `await readFile(".github/workflows/guard.yml")` (node:fs/promises) | textAsserting=false (documents=[]) | GREEN (should be red: single-member collapse) |
| E | readFileSync + `assert.match(body, wanted)` (named regex var) | textAsserting=false (patterns=[]) | GREEN |
| F | readFileSync(P,...) with `const P = "....yml"` (path in a var) | textAsserting=false (documents=[]) | GREEN |

Captured (attack.ts / attack2.ts):
- D: `status: green` "every witness red against every declared dangerous state and green at head"; deriveTextAssertions documents=[].
- E: `status: green`; patterns=[].
- F: `status: green`; documents=[].

PROOF the certified test is a worthless behaviour guard (attack3.ts): the SAME
async-read test, handed the meaning-inverting member (`exit 1` -> `exit 0`,
nothing else), STAYS GREEN     the gate reports member rate.red 0/1, unreachedArm
{file: .github/workflows/guard.yml, lines:[9], greenTests:["guard wired
async"]}. So the test survives the exact edit hazard #3 names, yet the
delete-member witness (D) shipped GREEN. This is a false witness in the guard
that judges every other test.

Why this is beyond the declared residue: the work-history hazard self-review
(item 3) states detection is escapable "through an aliased callee or asserts
through a helper," and the self-guard test keeps the kernel's own test file
honest. But `readFile` (node:fs/promises) is not an alias of readFileSync, it
is a first-class standard API; `assert.match(body, wanted)` is a direct assert
form, not a helper; `readFileSync(P,...)` is a direct sync read. None is
"aliased callee or helper." The plan describes detection over "a file read
from a path" without restricting to sync, so the implementation is narrower
than its own contract. The kernel's four shipped witnesses are all `additive`
and non-text-asserting (the self-guard test confirms it), so nothing delivered
is falsified today; the hole is latent and reachable by any future phase whose
witness asserts over a document (M2-P3/P6 and the guard-wiring class do).

Further members of the same class, VERIFIED via deriveTextAssertions (both
returned textAsserting=false): `assert.equal(readFileSync(path), EXPECTED)`
(documents found, patterns=[]) and `assert.ok(body.indexOf("X") >= 0)`
(documents found, patterns=[]). assert.equal over a whole document is among the
strongest and most common text assertions. The class has well more than two
structurally different members.

T-007 fit: a criteria reviewer cannot find this. Criterion 3b tests only the
DETECTED shape (readFileSync + literal assert.match). Nothing in the criteria
exercises async read, a variable pattern, a variable path, assert.equal, or
indexOf. The defect is in what the criteria do not describe, which is precisely
what this second contract exists to catch.

Fix direction (mechanical): broaden READ_CALL to `readFile(?:Sync)?` and cover
`fs/promises`; extract patterns for assert.equal/doesNotMatch/indexOf too; and
treat "a document read outside src/ and test/ + ANY assert reference to its
contents + no extractable pattern" conservatively (either mark text-asserting on
the document-read signal alone, or refuse-with-reason "text-assertion pattern
not statically extractable; rewrite to a literal or add a behaviour member")
rather than silently returning textAsserting=false. Add red-witness members for
at least two of {async read, variable regex, variable path, assert.equal} so
the class is guarded by >=2 structurally different members.

### CR-H2 (MEDIUM-LOW): rule (f) capture obligation cannot see bin/ shell scripts, exactly where M1's V-2 defect lived

`isAuditedSource` includes `bin/` (red-witness.ts:145), so a bin/ shell script
with no witness is red (coverage). But rule (f)'s SPAWN_GREP
(child_process|execFile|spawnSync|execSync, run.ts:266) is four JS tokens; a
POSIX shell script that spawns and PARSES another program's output contains
none of them. So a bin/ script that classifies git output (the V-2 shape,
CLAUDE.md warning 10) can be guarded by a test that hand-writes the expected
git output, with NO consumesExternalOutput required.

Confirmed (attack2.ts, ATTACK G): a `bin/classify.sh` reading git stderr on
stdin, guarded by a test feeding a hand-written string `"fatal: cannot lock ref
whatever"`, ships GREEN with no capture obligation. M1's actual V-2 lived in
`bin/fm-*.sh` shell scripts that classified git contention output; this is the
one audited-source class where the real defect occurred and rule (f)'s
derivation is blind to it.

Caveat: the plan DEFINES rule (f)'s derivation as exactly those four JS tokens
"over the changed files," so this is arguably within declared scope. But the
plan's stated intent ("a module that spawns a subprocess or parses another
program's output") is broader than the chosen grep, and bin/ is audited. At
minimum the residue should be NAMED in the work history (it currently is not:
the work history's rule-(f) discussion is JS-only) so a future bin/ author is
warned. Recommend either extending the derivation to shell (git/grep/awk
invocation heuristics under bin/) or recording the gap explicitly.

---

## ATTACK TABLE (constructed and run)

| # | Mechanism attacked | Construction | Outcome |
|---|---|---|---|
| D | rule (g) detection: async read | text test via `await readFile`; single delete member | GREEN (escape) -> CR-H1 |
| E | rule (g) detection: variable regex | readFileSync + `assert.match(body, var)`; single delete member | GREEN (escape) -> CR-H1 |
| F | rule (g) detection: variable path | `readFileSync(P)` with P a const; single delete member | GREEN (escape) -> CR-H1 |
| proof | hazard #3 realness | async-read test under `exit 1`->`exit 0` member | rate.red 0/1, unreachedArm; test survives inversion (confirms D/E/F are false witnesses) |
| G | rule (f): bin/ shell scripts | bin/classify.sh parses git stderr; test hand-writes it; no capture field | GREEN (escape) -> CR-H2 |
| H | rule (e): destructive via wrapper | reaper.ts branch -D via spawnSync; destructiveCommands=["pool destroy"] | RED, but caught by rule (f) (spawnSync present), not rule (e); could not isolate a rule (e) false-green -> observation only |

## ATTEMPTED, NOT CONSTRUCTED (with reasons)

- Two structurally-different-but-semantically-identical members (rule g
  collapse): the collapse check is purely syntactic (same file+find, or
  byte-identical patch after path normalisation, run.ts:974-1000). Two members
  editing different lines with the same semantic effect DO pass the >=2
  requirement. This is a declared design choice (M2-D-17: "structurally
  different is derived, not judged"), so it is a plan-acknowledged residue, not
  a defect against the plan. Not pushed as a finding.
- destructiveCommands entry invoked via assembled string (rule e): my first
  attempt leaked the literal "pool destroy" through an assert; the clean wrapper
  attempt (H) was caught by rule (f) because the wrapper used spawnSync. Rule
  (e) is keyed to manifest command STRINGS appearing in the test source and the
  manifest is M2-P1's; I could not construct a clean false-green through rule
  (e) alone. Recorded as an observation, not a finding.
- Stored witness whose member touches a diff file only via ./x-vs-x path
  normalisation: git diff does not emit `./`-prefixed paths, so a real diff
  cannot produce the mismatch; constructing a hand-crafted patch header with
  `./` is contrived and not a realistic attacker input. Not constructed.
- NODE_OPTIONS reporter/name-pattern injection into the spawned test: reasoned
  through. The child is spawned with `--test-reporter tap` on argv and NODE_TEST*
  scrubbed (run.ts:586-592). An inherited `NODE_OPTIONS=--test-reporter=spec`
  yields two reporters -> node errors -> parseTapStream sees non-"TAP version"
  -> gate ERROR (loud), not a false green. An inherited name-pattern only adds
  tests to the run; results are filtered by exact name (run.ts:623-634), so the
  named verdict is unaffected. Defended (fails closed). Not constructed.
- M2-C-4 harness writing outside the scratch clone: all harness writes go to
  mkdtemp-owned scratch (patch stage at scratchRoot, run.ts:495;
  applyPatchToDocuments stage under scratchRoot, run.ts:766). The caller repo is
  only read (git read commands + delivered probes). assertCallerClean runs after
  every gate call in the suite. A malicious TEST writing to the caller via an
  absolute path is out of M2-C-4 scope (test code runs in a clone). No defect.
- M2-C-6 on the harness's own reads: spec/behaviors/manifest/testfiles/patch
  reads route through `git show` (cannot block on a fifo) or the delivered
  classifyEntry/readRegularFileIfPresent. pinRoots uses lstatSync (probe, not
  open). No raw blocking open of an untyped path found. Compliant.

## INTEGRATION PROBES (M2-P1)

- Well-formed GateResult via delivered constructor: red-witness.ts builds every
  result through `makeGateResult` (result.ts); records carry
  gate/status/units/unitLabel/detail/evidence. PASS.
- Registered in gates.manifest.json as `red-witness`, applicability required,
  precondition diff-touches on src/,bin/, parameters [base,head], unitLabel
  "witnesses evaluated". PASS (manifest lines 18-38).
- Runs under `tiphys gates run`: cli.ts -> cmdGates -> runGates (src/commands/gates.ts:112).
  Wired. PASS.
- `--base` absent is error (M2-C-3): main() returns errorOutcome when base
  undefined; phase test spawns the real CLI and asserts exit 21 + "M2-C-3".
  PASS.
- Consumes the delivered five-field pin incl ctimeMs: uses takePin/comparePins
  from pin.ts; the pin-witness test (byte-identical rewrite between pins)
  errors naming mtimeMs. PASS.
- Failure mid-run leaves a coherent record: errorOutcome always writes a
  makeGateResult record; a caught throw in main() becomes an error record
  (red-witness.ts:459-466). Evidence best-effort but verdict always recorded.
  PASS.

## FULL SUITE (floor node v26.6.0, complete capture)
229 tests, 224 pass, 5 fail, 0 skipped, npm exit 1. The 5 failures are EXACTLY
the brief's pre-declared known set, nothing else:
1. "the workflow's gate bundle step runs the gate runner and is able to fail"
   (push-bundle guard, cross-phase, absorbed at merge)
2. "manifest-self-check reports one unit per schema document" (schema-count,
   cross-phase, absorbed at merge)
3. "doctor and the guard return one verdict about one beacon" (real-clock flake;
   beacon age 16s vs regex expecting 13s)
4. "a resident watcher keeps running and backs off with growing beacon gaps"
   (real-clock flake)
5. "the heartbeat schedule is on disk and shared by single passes" (real-clock
   flake)
The phase's own file test/witness.test.ts is 28/28 on floor in isolation. No
unexpected failure. Phase-attributable suite state is clean.

## SEVERITY NOTE
CR-H1 is labelled MEDIUM. A case for HIGH exists (it lands on the phase's own
declared hazard #3, in the guard that judges every other test, and a criteria
reviewer structurally cannot find it). Either label is merge-blocking under
DR-0012. The fix is mechanical (broaden the two extraction regexes + add
red-witness members), which argues for a normal fix round rather than
escalation.
