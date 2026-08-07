# M2 fix: suite gate reporter NODE_OPTIONS leak into nested node --test

Branch: `claude/m2-fix-suite-reporter-leak`, off `origin/main` at `1b6f096`.
Toolchain: floor Node v26.6.0 (fetched, put first on PATH), npm 11.18.0.

## The defect (as surfaced by the M2 exit test)

Plain `npm test` on the floor toolchain is green (395 tests, 0 fail), but the
`suite` gate over the full tree reported RED with 19 failing tests, ALL in
`test/witness.test.ts`. Reproduced before touching anything:

```
$ node dist/bin/tiphys.js gates run --manifest gates.manifest.json \
    --evidence /tmp/sg_ev_before --base main --head HEAD --only suite
gates: 1 gate(s) reported red: suite
```

`/tmp/sg_ev_before/suite/counts.json`:
- `reporterRequestedVia`: child-scoped NODE_OPTIONS --test-reporter=data:... --test-reporter-destination
- `childExit`: 1; `counts`: reported 395, pass 376, fail 19, skipped 0
- all 19 findings in `test/witness.test.ts`

## The MECHANISM (not the finding)

The finding is "19 tests in `test/witness.test.ts` fail under the suite gate".
The mechanism is:

> A test fixture spawns a nested `node --test` child whose environment inherits
> the suite gate's top-level-run-scoped reporter via `NODE_OPTIONS`.

`src/gates/suite.ts` requests its pinned machine-readable reporter for the
top-level `npm test` run it spawns by setting a child-scoped `NODE_OPTIONS`
(`--test-reporter=<data url> --test-reporter-destination=<its stream file>`,
suite.ts around L861-871). That option is meant for THAT run alone, but
`NODE_OPTIONS` is inherited by every descendant process.

`test/witness.test.ts` drives `src/witness/run.ts`, whose `runNamedTests`
(around L795-833) spawns nested `node --test` children per witness member to
exercise the red-witness harness. It built the child env from `process.env`
scrubbing only `NODE_TEST*` (the child-of-a-runner protocol leak) and NOT
`NODE_OPTIONS`. So each nested `node --test`:

1. is invoked with `--test-reporter tap` in its own argv, AND
2. inherits `--test-reporter=<data url> --test-reporter-destination=<stream>`.

That is two reporters against one destination, which Node rejects at startup:

```
TypeError [ERR_INVALID_ARG_VALUE]: The argument '--test-reporter' must match
the number of specified '--test-reporter-destination'. Received ['tap', ... ]
    at parseCommandLine (node:internal/test_runner/utils:297:13)
```

The child exits 1 producing no tap stream, `parseTapStream` fails ("expected the
pinned reporter format tap ... observed a stream opening with \"\""), the member
evaluation errors, and every witness test that runs a member reddens.

The reporter is a top-level-run-scoped input, exactly like `NODE_TEST_CONTEXT`
(which this same code already scrubs for the same class of reason). It was simply
omitted from the scrub.

### Why plain `npm test` stays green

Probed on Node v26.6.0:
- a plain `node -e` child with the reporter in `NODE_OPTIONS`: exit 0, the flag
  is SILENTLY IGNORED (it only applies under `--test`). So plain-node children
  are unaffected;
- a `node --test` child that also carries a reporter in argv: the count-mismatch
  error above.

So only a nested `node --test` run is affected, and only when a reporter is
present in the ambient `NODE_OPTIONS`, which is exactly the suite gate's child
and not a plain `npm test`.

## The derivation, published

### grep 1: every nested `node --test` / child-node spawn in src and test

```
grep -rEn 'node --test|"--test"|process.execPath' src test | grep -v behaviors.json
```

The only PRODUCTION spawn of a nested `node --test` that copies the parent env
is `src/witness/run.ts:800` (argv `["--test","--test-reporter","tap",...]`) at
`src/witness/run.ts:833` (`spawnSync(process.execPath, argv, { env })`). Every
other `process.execPath` spawn in `test/` invokes the tiphys CLI or a gate entry
(plain node: reporter silently ignored) or the suite gate itself (which builds
its own scrubbed child env).

### grep 2: every process.env copy / NODE_OPTIONS / NODE_TEST scrub site

```
grep -rEn 'NODE_OPTIONS|startsWith\("NODE_TEST"\)|Object.entries\(process.env\)' src test | grep -v behaviors.json
```

Sites that build a child env and the disposition of each:
- `src/gates/suite.ts:862-871`: the injector (drops inherited NODE_OPTIONS, sets
  the reporter). Correct; it is the source of the ambient option.
- `src/witness/run.ts:827-828`: the fix site. Now scrubs NODE_TEST* AND NODE_OPTIONS.
- `test/suite-gate.test.ts:61-62`: already scrubs NODE_OPTIONS and NODE_TEST* for
  every child (documented L19-28). Immune.
- `test/exit-test-local.test.ts:984-986`: runs a toy `npm test` (node --test) but
  explicitly sets `env NODE_OPTIONS: "--test-reporter=tap"`, REPLACING any
  inherited value (override wins) so there is one reporter and no conflict. Immune,
  and a positive example of the correct pattern.
- `test/exit-test-local.test.ts:106-127` (`identityLessEnv`): scrubs GIT_/NODE_TEST*
  but NOT NODE_OPTIONS. Its EXECUTED tests (invalid-invocation, `--list-steps`,
  seeder paths) never spawn a nested `node --test`; the one path that runs
  `node --test` overrides NODE_OPTIONS (L984). LATENT, not active.

Settling the `exit-test-local.test.ts` claim (that its executed tests do not
spawn a conflicting nested `node --test`):

```
$ grep -nE 'node --test|run\("npm"|process.execPath' test/exit-test-local.test.ts
968:    const ci = run("npm", ["ci"], { cwd: clone, env });
972:    // with whatever node --test defaults to. ...
984:    const tested = run("npm", ["test"], {
```

The only invocation that runs `node --test` is the toy `npm test` at L984, and
its env sets `NODE_OPTIONS: "--test-reporter=tap"` (L986), replacing any inherited
value. Every other `run(...)` in this file runs `bash`, `git`, or `npm ci`.

Empirical confirmation that the enumeration is complete: on `origin/main` under
the suite gate, ONLY `test/witness.test.ts` reddened (19), no other file
(`/tmp/sg_ev_before/suite/counts.json`, findings all in `test/witness.test.ts`).

### What the derivation did NOT cover

- Bash harnesses (`bin/*`, the exit-test harness, seeders) that may run
  `node --test` in stages NOT exercised by the current suite (e.g. exit-test FULL
  mode, which does not run in this container). Their node argv / NODE_OPTIONS
  handling was not audited here.
- `identityLessEnv`'s missing NODE_OPTIONS scrub is a same-class latent gap. I did
  not find an executed test that exercises it (the grep above shows its only
  `node --test` path overrides NODE_OPTIONS at L986), so I could not produce a
  red-witness for a change there; left as-is and recorded here for a reviewer
  rather than changed unwitnessed.
- A future new nested `node --test` spawn elsewhere would reintroduce the class.
  The fix is at the single production site, mirroring the pattern already used in
  `test/suite-gate.test.ts`.

## The fix chosen, and why not the other

Option (b) (make `src/gates/suite.ts` request the reporter in a form that does
not transitively inherit) was rejected: `NODE_OPTIONS` inherits by construction,
and the only script-agnostic way I found to give the reporter to exactly the
top-level run without inheritance would be to inject Node CLI args into the target
repo's `scripts.test`. The suite gate's own header forbids that:

```
$ sed -n '34,37p' src/gates/suite.ts
 * is executed VERBATIM through `/bin/sh -c`, exactly as npm runs it. The
 * gate never parses or reconstructs the script: deciding what another
 * program will do by pattern-matching the text of a file it consumes is
 * the mechanism MECHANISMS.md records four fix rounds for.
```

Node selects a reporter only via CLI args or `NODE_OPTIONS`; with the script off
limits, `NODE_OPTIONS` is the only channel I found. So the fix belongs at the
descendant that must not inherit it, not at the injector.

Option (a), at the mechanism level: the nested `node --test` spawn scrubs the
reporter from its environment. Applied in `src/witness/run.ts:runNamedTests` by
adding `|| name === "NODE_OPTIONS"` to the existing scrub loop, with a full
comment. The nested child sets its own reporter explicitly in argv and owes
nothing to the ambient env, so a clean `NODE_OPTIONS` is correct and does not
weaken the suite gate's counting authority (C-1: counts still come from the
reporter stream plus the child exit code, unchanged).

## Red-witness

A dedicated guard test was added, red against the DANGEROUS state (the reporter
actually leaking), green with the fix (T-003 stronger form; real captured child
output, not a hand-written string):

`test/witness.test.ts`:
`"a nested test run does not inherit the suite gate reporter NODE_OPTIONS"`
(behavior `witness-nested-run-scrubs-reporter-node-options`, registered
append-only in `test/behaviors.json`).

It spawns the red-witness gate CLI over `adderFixture()` with a poisoned
`NODE_OPTIONS=--test-reporter=tap --test-reporter-destination=<file>`,
reproducing the suite gate's ambient child condition, and asserts the gate greens.

- WITHOUT the fix (scrub reverted), run in isolation on the floor toolchain:

(the "[FAIL]" marker below is node's U+2716 cross, transcribed to ASCII to keep
this file pure ASCII per CLAUDE.md rule 3):

```
[FAIL] a nested test run does not inherit the suite gate reporter NODE_OPTIONS
  AssertionError: ... member 0 (mutation of src/adder.ts): expected the pinned
  reporter format tap ... observed a stream opening with "" (test child exited 1;
  stderr: ... TypeError [ERR_INVALID_ARG_VALUE]: The argument '--test-reporter'
  must match the number of specified '--test-reporter-destination'.
  Received [ 'tap', 'tap' ] ... )
  21 !== 0
```

- WITH the fix: `tests 1, pass 1, fail 0`.

At the suite-gate level (the acceptance the exit test surfaced):
- BEFORE (origin/main): RED, childExit 1, reported 395, pass 376, fail 19
  (all `test/witness.test.ts`, spanning baseline-ref / mutation / patch members,
  structurally different members of the one class). `/tmp/sg_ev_before`.
- AFTER: GREEN, childExit 0, reported 396, pass 396, fail 0, findings 0.
  `reported` (396) equals plain `npm test` (396). `/tmp/sg_ev_after`.

`src/witness/run.ts` is already in the red-witness gate's per-file coverage set
(via `witness/witness-tap-reporter-pin.json`, whose dangerous state mutates
`src/witness/run.ts`), so this change needs no new witness spec for coverage.

## Gates (floor toolchain, Node v26.6.0)

- `npm ci`: exit 0.
- `npm run build`: exit 0; `git status --porcelain` after build shows only the
  three intended edits, no `dist/` and no `*.tsbuildinfo`.
- plain `npm test`: 396 tests, 396 pass, 0 fail, 0 skipped.
- `suite` gate over the full tree: GREEN, 396 tests reported, 0 findings.

Full manifest run (`gates run` without `--only`) additionally reported `scope`
error ("requires --phase", not a plan-phase run) and `red-witness` error
(`git diff -U0 ... ENOBUFS` over the entire M2 range `bcefc98..1b6f096`, where
`1b6f096` is `origin/main` and contains no commit of this branch). Both are
pre-existing/environmental and independent of this three-file change.

## Files changed

- `src/witness/run.ts`: scrub `NODE_OPTIONS` in the nested `node --test` child env.
- `test/witness.test.ts`: the red-witness guard test.
- `test/behaviors.json`: one append-only behavior entry resolving to the guard test.
- `delivery/work-history/m2-fix-suite-reporter-leak.md`: this file.
