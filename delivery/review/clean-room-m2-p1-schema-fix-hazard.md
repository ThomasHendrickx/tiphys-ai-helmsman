# Clean-room hazard review B: M2-P1 schema self-check inventory fix round

- Branch: claude/m2-p1-schema-self-check-inventory
- Head: 87ea9f8f537330ad0db69db4bf84591af3f5386b (verified checked out)
- Base: origin/main 4c9bfbc (verified)
- Findings numbered from CR-1165
- Floor toolchain: node v26.6.0 (verified)

## VERDICT: APPROVE

No high or medium findings. Two LOW observations (abnormal-state diagnostic quality only, both fail closed). Both changes are correct, necessary, and well-guarded. The two new red-witness tests are genuine and the CR-812 parity test remains an independent readdir witness (not tautological).

## Build / integration (floor toolchain node v26.6.0)
- npm ci exit 0, npm run build exit 0, git status clean after build.
- build:schemas (cpSync) copies src/gates/schemas -> dist/src/gates/schemas; dist has both schemas. files:["dist"] ships them.
- self-check via SOURCE entry: green, units=2. via DIST entry: green, units=2. Matches committed count (2).
- gates run --only manifest-self-check via dist: exit 0, declared 1 applicable 1 green 1. GateResult well-formed (gate/status/units/unitLabel/startedAt/endedAt/detail/evidence).
- gates.manifest.json declares exactly ONE gate today (manifest-self-check); --only manifest-self-check selects it -> no reduction today.
- node --test test/gates.test.ts (floor toolchain): 42 tests, 42 pass, 0 fail, 0 skipped, 0 cancelled. Both new tests ran (dist present) and pass; the pre-existing CR-830-1 wiring guard passes.

## Change 1: schemaDocumentPaths enumeration (src/gates/manifest.ts:142-148)

Now: readdirSync(dir).filter(name => name.endsWith(".schema.json")).sort().map(fileURLToPath).

Attack table (real runs against the REAL src/gates/schemas dir, each cleaned up, repo verified byte-identical after):

| Attack | Result | Verdict |
|---|---|---|
| benign non-schema files (foo.json, gate-x.schema.json.bak, README, plain.txt) | units stayed 2, all rejected by .endsWith(".schema.json") | PASS - filter admits only intended docs |
| subdirectory named subdir.schema.json | status=error "is a directory, not a regular file", exit 21, no hang | PASS - fails closed (M2-C-6) |
| FIFO named fifo.schema.json | status=error "is a named pipe, not a regular file", exit 21, timeout 15s did NOT fire | PASS - fails closed, no hang (M2-C-6) |
| symlink -> regular schema (link.schema.json) | followed, validated, units=3 | PASS - consistent with MECHANISMS rule (stat resolved target, open only regular file); harmless |
| symlink -> FIFO (linktofifo.schema.json -> realfifo) | status=error "is a named pipe", exit 21, no hang | PASS - resolved-type check catches it even through a symlink |
| empty directory (both schemas moved out), standalone self-check | error exit 21 "gate-manifest.schema.json is missing from this installation", no result file | PASS - NOT a vacuous green; fails closed |
| empty directory, via runner (gates run --only) | error exit 21, runner reports "gate runner failed: ... missing" | PASS - fails closed |
| missing directory entirely | error exit 21, raw "ENOENT ... scandir" (see CR-1165) | PASS on safety (fails closed); LOW on diagnostic quality |

- units=0-green is STRUCTURALLY UNREACHABLE: any state with zero .schema.json files also lacks gate-manifest.schema.json, which manifest validation needs, so self-check errors first. M2-C-2 anti-vacuity in the runner is defense-in-depth beneath this, never reached here.
- Sort: `.sort()` is comparator-less (manifest.ts:146) => UTF-16 code-unit order, locale-independent and deterministic; V8 both in CI (linux/node26) and local, and Array.prototype.sort is stable (ES2019+). CI and local agree.
- Ordering coupling: NONE. Only two consumers (src/commands/gates.ts:190 loop, :255 join) and both are order-agnostic and length-agnostic. No positional [0]/[1] indexing anywhere (grep clean). manifestSchema()/resultSchema() read gate-manifest/gate-result by NAME independently of the enumeration, so they are not order-coupled.
- Package shipping: files:["dist"] + build:schemas cpSync ships exactly the committed set (dist mirrors src). Uncommitted-but-on-disk documents are not shipped because dist is rebuilt from src by cpSync; only committed src schemas reach dist.

## Change 2: workflow (.github/workflows/gates.yml)

- --only manifest-self-check on BOTH bundle steps; fetch-depth: 0 on checkout.
- Does the pin silently reduce CI validation? Today NO (manifest has one gate). Forward: yes, the bundle steps will run only manifest-self-check as later phases add gates to the manifest, but that is correct and documented: (a) each phase's gate is exercised by its OWN test suite via `npm test` two steps up; (b) intermediate phases' files-to-touch lists exclude this workflow file; (c) M2-P9 replaces both steps with the full main-bundle. CONFIRMED against the plan: delivery/plan/kernel-plan-m2.md:518 (M2-P9 step 4) defines `--only manifest-self-check,suite,coverage,credential-scrub,deploy,migrations`. The workflow comment's claim is accurate.
- --only errors loudly on an absent gate name ("--only names no such gate", src/gates/run.ts:1331-1336), so the static list can only ever be too narrow, never silently wrong.
- fetch-depth: 0 is FORWARD-ONLY: no diff-touches or branch-matches gate exists in gates.manifest.json today, so nothing consumes it yet. Stated as such in the comment. Acceptable.
- Guard-test vacuity (task item 2 last bullet): the pre-existing CR-830-1 wiring test's falsifiability arm (push step vs empty manifest) STILL reddens - now via "--only names no such gate" instead of "zero applicable gates". A `|| true`/`exit 0` defang would still be caught (arm asserts non-zero exit). NOT vacuous. Verified by running the file (42/42).

## Change 3: parity test integrity (CR-812)

- test/gates.test.ts "manifest-self-check reports one unit per schema document" reads the directory itself via readdirSync(...).filter(name=>name.endsWith(".schema.json")) and asserts record.units === schemas.length. It does NOT call schemaDocumentPaths(). It remains an INDEPENDENT witness, not tautological. Read both sides directly to confirm. This is not the defang-by-construction class the project warns about.

## New tests are genuine red witnesses
- "manifest-self-check picks up a schema document dropped into the directory" - two structurally different members (valid doc => counted; invalid doc with maxLength => red naming keyword+file). Work history captures the reverted-state red (2 !== 3). Believable and re-confirmed green here.
- "both bundle steps' --only shape survives a required gate that its own step cannot evaluate" - member 1 push/diff-touches, member 2 PR/branch-matches, plus falsifiability on both steps. Uses REAL extracted step text via bundleStepCommands(). Two distinct class members => satisfies "one witness is not a class".

## behaviors.json
- Valid JSON (209 keys). Two new entries append-only; strings match the two new test() titles exactly => resolve by name.

## Findings

CR-1165 (LOW): A missing schemas DIRECTORY (not just empty) makes readdirSync throw a raw "ENOENT ... scandir" message, where the pre-fix code returned hardcoded paths and reported the cleaner domain message "schema document <path> is missing from this installation". Still fails closed (exit 21, error, no false green), caught by the cmdGates outer backstop. Only reachable via a broken installation/build; in CI both src and dist schema dirs always exist after `npm run build`. Diagnostic-quality only. Not blocking.

CR-1166 (LOW / observation): schemaDocumentPaths() is invoked twice in cmdSelfCheck (src/commands/gates.ts:190 loop, :255 detail join), i.e. two readdir passes. A directory change between them could make the green detail list inconsistent with the counted units. Not reachable under normal single-process operation with no concurrent writer (node --test runs sequentially; production is a single CLI process). Cosmetic. Optional: capture the array once and reuse.

Observation (no finding): a symlink whose target is a regular schema is followed and counted as a document. Consistent with the established "stat the resolved target, open only a regular file" rule; symlink-to-FIFO/dir is still caught. Harmless.

## Attempts not constructed
- GitHub's own YAML resolution (if:, ${{ }} substitution, whether fetch-depth:0 actually deepens history on GitHub runners): not exercisable from this tree, same stated boundary as the pre-existing wiring test. Not constructable locally.
- Full-suite clean exit 0: not attempted as a pass criterion; per the task and CLAUDE.md warning 11, liveness.test.ts/watcher.test.ts real-clock flakes are expected under load. The scoped file (gates.test.ts) is the gate this round answers for: 42/42/0.
