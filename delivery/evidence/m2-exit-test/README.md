# M2 exit-test evidence bundle

Produced by `scripts/m2-exit-test.sh` (kernel plan M2, M2-P9) on the
`claude/m2-p9-exit-test` head, floor toolchain Node `v26.6.0`, npm `11.18.0`.
`--base origin/main` is the real pull-request base (`1b6f096`); in this
container the local `main` ref is stale, and in a fresh checkout `main` IS
`origin/main`.

This bundle is committed as paperwork per M2-P9 step 6; the orchestrator routes
it. Files here are the harness stdout captures (scratch absolute paths replaced
by `<evidence-dir>`) and the two `gates run` summaries.

## What the exit test proves (delivered)

- The harness is NOT vacuous. Its assertion program evaluates a bundle against
  section 1.4's expected-status table per gate, not a bare count, and refuses a
  bundle that does not match. `self-test.out` shows the SAME assertion program
  rejecting two injected bad bundles: a gate reporting green with units 0 (the
  runner rewrites it to error+vacuous) and a required gate whose file-exists
  precondition is unmet. `--self-test` exits nonzero (working), naming each gate.
- No production gate carries a status-override environment variable (grep
  evidence in the work history; asserted structurally in
  `test/m2-exit-test.test.ts`).
- The CI wiring is the single caller of `gates run`, guarded behaviourally
  (red-witnessed against three structurally different workflow defangs; see the
  work history).

## What the bundle does NOT yet show green, and why (escalation)

Neither the PR bundle nor the main bundle is green on this head. The harness is
reporting this honestly; the causes are outside M2-P9's scope and are the
escalation carried in `delivery/work-history/m2-p9.md` section 4:

- BLOCKER A: `red-witness` (required) is not-applicable because M2-P9's diff
  touches no `src/` or `bin/`, so its `diff-touches` precondition is unmet.
  Section 1.4 requires it green. This is a plan/reality contradiction the
  orchestrator must resolve. See `pr-bundle.summary.json` (`red-witness`
  not-applicable) and `pr-bundle.out`.
- BLOCKER B: `suite` (required) is red because the suite gate's child-scoped
  custom-reporter `NODE_OPTIONS` leaks into the witness harness's nested
  `node --test` invocations, failing 19 `test/witness.test.ts` tests that a
  plain `npm test` (395/395/0) passes. Pre-existing in merged M2-P2/M2-P3 code.
  See both summaries (`suite` red) and both `.out` files.
- Declared scope deviation (not a defect): `scope` is red naming
  `test/gates.test.ts`, which M2-P9 had to edit to migrate the two interim-
  wiring tests it replaced; that file is not on the M2-P9 declaration. See
  `pr-bundle.summary.json` (`scope` red) and the work history section 5.

On the committed head, `manifest-self-check`, `coverage`, `credential-scrub`
and `citations` are green; `deploy`, `migrations` and `credential-token` are
not-applicable as the table expects.

## Reproduce

```
scripts/m2-exit-test.sh --self-test <dir>                    # exits nonzero, working
scripts/m2-exit-test.sh --base origin/main --phase m2-p9 --bundle pr --no-build <dir>
scripts/m2-exit-test.sh --base origin/main --bundle main --no-build <dir>
```

Note `--phase m2-p9` is LOWERCASE, matching the phase-declaration filename the
scope gate reads (it uppercases only for its id check).
