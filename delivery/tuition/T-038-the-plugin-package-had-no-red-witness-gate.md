# T-038: the second package shipped with two of its guards switched off

**Measured:** 2026-09-17, on `main` at `14ba6fd`.

## What happened

M4-P6's implementer reported its bundle as `12 green / 0 red / 0 error / 0
vacuous`, and added in the same line: `citations + red-witness not-applicable by
precondition`. It then ran the `red-witness` gate DIRECTLY to get a verdict, and
got `green, 8 own`.

That parenthesis is the finding. M4-P6 ships eight new red witnesses for code
under `plugin/`, and the gate that exists to re-evaluate them **declined to
run**.

## The mechanism, which is not "red-witness has a bug"

The harness ENUMERATES the code it guards, and `plugin/` was added to the
repository by M4-P5 without being added to those enumerations. Any guard whose
scope is a hand-written path list stops covering a tree the moment a new one
appears, and it reports that as NOT-APPLICABLE, which reads like a clean result.

## The derivation, and its full output

Every `diff-touches` precondition, in both the registry and the manifest the
harness actually runs:

```
  registry gate=citations    precondition=citations-diff-touches-documents paths=['delivery/plan/', 'delivery/verification/', 'delivery/decisions/', 'delivery/tuition/', 'delivery/requirements/', 'delivery/STATE.md']
  registry gate=red-witness  precondition=red-witness-diff                 paths=['src/', 'bin/']
  manifest gate=citations    precondition=citations-diff-touches-documents paths=['delivery/plan/', 'delivery/verification/', 'delivery/decisions/', 'delivery/tuition/', 'delivery/requirements/', 'delivery/STATE.md']
  manifest gate=red-witness  precondition=red-witness-diff                 paths=['src/', 'bin/']
```

`citations` is scoped to documents and is correct. `red-witness` is the gap, and
its precondition is declared at `gate-registry.yaml:179` in the registry and
mirrored in `gates.manifest.json`, which is the copy CI actually runs. Those two
are QUOTED rather than cited because a root-level `.yaml` or `.json` path
matches no declared citation root, which is the rule CLAUDE.md:182 gained
yesterday and which this document nearly repeated.

**A SECOND, STRUCTURALLY DIFFERENT INSTANCE OF THE SAME MECHANISM**, found by
asking what else enumerates the code rather than by stopping at the reported
one. `package.json`'s build script builds three projects; the `typecheck` GATE
declares two:

```
build:     tsc -b tsconfig.src.json tsconfig.test.json plugin/tsconfig.json
typecheck: node src/gates/gate-classes.ts typecheck --project tsconfig.src.json --project tsconfig.test.json
```

Measured, `tsc --listFiles`, counting printed paths under `plugin/`:

| project set | plugin files printed |
|---|---|
| the GATE's two projects | **0** |
| `plugin/tsconfig.json` alone | 2 |

So the typecheck gate type-checked none of the plugin package while reporting
420 files and green. The BUILD covered it, which is why nothing looked wrong:
one arm was witnessed and the sibling arm was not, which is the shape
delivery/tuition/T-009-green-on-the-wrong-event.md:1 records, and the shape
CLAUDE.md:496 calls a guard whose condition does not test the property that
matters.

## What the derivation did NOT cover

- **Only `diff-touches` preconditions and the typecheck project list.** Other
  precondition kinds (`file-exists`, command probes) were not audited for tree
  assumptions.
- **`scripts/*.mjs` was grepped for `bin/` and the two hits inspected.**
  `scripts/check-authored-bytes.mjs` works from `git ls-files`, so it already
  covers `plugin/`; the hit in `scripts/check-retirement-inventory.mjs` is a
  comment. No other script carries a source-tree list.
- **`.github/workflows/` names `plugin` nowhere**, so no workflow step is
  scoped to it either way. Whether the push arm needs one is not settled here.
- **Whether any OTHER future tree has the same problem.** The fix adds one path
  to one list, which is the same hand-written enumeration one entry longer. A
  derivation from the workspace list in `package.json` would close the class;
  that is not done here and is stated rather than implied.

## The blast radius

Two phases shipped plugin code under the gap: M4-P5, which created the tree,
and M4-P6. Neither had its plugin code type-checked by the gate, and M4-P6's
eight witnesses were not re-evaluated by the gate that owns them. Both were
green, and both were honestly green: the gates reported exactly what they were
asked.

M4-P7 and M4-P9 are the next two plugin phases and would have inherited it.

## The fix

One path added to `red-witness`'s precondition and one project added to
`typecheck`'s command, in BOTH the registry and the manifest, because the
harness runs `--manifest` and a registry-only change does not reach CI.

Witness, before and after, same tree, one variable:

| | plugin files typechecked | red-witness on a plugin-only diff |
|---|---|---|
| before | 0 | not-applicable |
| after | 2 | applicable |

## The rule

A guard scoped by a hand-written path list is a guard with an expiry date. When
a new top-level tree of shipped code appears, the question is not "does the
build cover it" but "which enumerations now omit it", and the answer is found
by listing every enumeration rather than by checking the one that complained.

## Postscript, same day: the fix was HALF a fix, and its own not-covered section said so

The section above ends with "this adds one path to one list, which is the same
hand-written enumeration one entry longer". That was true and it understated
the problem, because there were TWO lists and only one was widened.

`red-witness` has a PRECONDITION, which decides whether the gate RUNS, and an
`isAuditedSource` predicate at src/gates/red-witness.ts:164, which decides what
it REQUIRES. The fix above widened the first. The second still read:

```
return path.startsWith("src/") || path.startsWith("bin/");
```

So from that fix until this postscript, a diff touching only `plugin/` **ran
the gate and took no coverage obligation from it**. M4-P6 shipped eight
witnesses voluntarily and was green; a plugin phase shipping ZERO would have
been green too, which is the same guard-that-cannot-go-red one level in.

Found by the M4-P29 implementer while reading that file for an unrelated
reason, and reported in its not-covered section rather than fixed, which is
correct: it is not that phase's file to widen.

### Why `plugin/src/` and not `plugin/`

This list is the coverage obligation, so bare `plugin/` would pull in
`plugin/package.json` and `plugin/tsconfig.json`, which no witness mutates and
which would then redden every plugin phase for its own packaging. `src/` and
`bin/` are source trees; the plugin package's source tree is `plugin/src/`.

The two lists are therefore DELIBERATELY different now, and that is worth
stating because the obvious tidy-up is to make them equal: the precondition is
`src/`, `bin/`, `plugin/` and the obligation is `src/`, `bin/`, `plugin/src/`.
Running on a packaging-only change is right; requiring a witness for it is not.

### The witness, and it is not a green/red pair

Both arms are RED overall, so comparing exit codes shows NOTHING. The
difference is in the REASONS, and the four reasons the two arms share are
artifacts of driving an old diff against today's witness corpus, which makes
them a control: they are constant, so the single difference is attributable.

Driven against M4-P5's merge, which shipped `plugin/src/adapter.ts` and
`plugin/src/index.ts` and zero witness specs:

| | reasons reported |
|---|---|
| before | 4, none about uncovered source |
| after | 5, the first being `source changed with no witness spec covering it: plugin/src/index.ts` |

Re-controlled against M4-P6's merge, which DID ship eight specs: green before
and green after, so the change does not redden the merged history.

### The rule this adds to the one above

When a guard has a "does it run" list and a "what does it require" list, a new
tree has to be added to BOTH, and they are not always the same string. Widening
only the first buys a gate that executes and demands nothing, which reports as
a clean run.
