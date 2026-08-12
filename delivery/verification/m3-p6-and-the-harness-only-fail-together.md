# M3-P6 and the exit-test harness fail only when merged, and neither branch's CI can see it

- date: 2026-08-12
- author: orchestrator
- status: MEASURED, two failures reproduced in one run; ownership decided; fix
  round not yet dispatched at time of writing
- severity: blocks M3-P6's merge. Nothing on `main` is broken by it.

## What was run

`main` at `9781212` merged into M3-P6 at `077f339`. One conflict,
`test/behaviors.json`, resolved as a three-way union with the checks the
append-only rule at CLAUDE.md:198 implies: base 594 keys, ours +24, theirs +6,
union 624, **zero removals on either side, zero keys whose value changed, zero
keys added by both**. Diff against ours is ten lines, so no reformat.

Then, node v26.6.0, `dist/` built, invocation `npm test`:

```
i tests 626
i pass 624
i fail 2
i skipped 0
i duration_ms 291690.462871
```

(That capture is transliterated: U+2139 INFORMATION SOURCE rendered `i`, five
occurrences. Nothing else in it was altered.)

Both branches are individually green. The failures exist only in the merge.

## Failure 1: a derivation that recognised one spelling

`test/implementer-brief.test.ts:1216`, M3-P6's own test:

```
AssertionError: the main bundle's --only list was not found in the harness
  at test/implementer-brief.test.ts:1240
```

The test does the RIGHT thing and its comment says so: it derives `brief-drift`'s
push-arm reachability FROM the harness rather than asserting it from a memory of
the harness. It derives with
`/--only manifest-self-check[\s\S]*?\) \\/`.

That regex recognised the harness as it was: six ids written out literally as
`--only` arguments. The harness fix round 2 REPLACED exactly that shape with one
`MAIN_ONLY_GATES` declaration and a loop, `only_args+=(--only "${gate_id}")`,
and its own comment at scripts/m2-exit-test.sh:207 records that the six ids used
to be written out twice. So the derivation now matches nothing and the test
fails on its own guard rather than on its subject.

**This is the same mechanism the harness round 3 named for DV-3 and DV-4: a
condition that recognises a syntactic SUBSET of the class its message quantifies
over.** M3-P6's regex recognises the literal-arguments spelling; the harness now
uses the loop spelling. The guard is honest and the recognition is narrow.

## Failure 2: a control bundle that pinned a gate set

`test/m2-exit-test.test.ts:1212`, the harness's own test, whose CONTROL arm
fails rather than its subject:

```
a healthy pr bundle must be ACCEPTED, including a manifest gate with no table
row that is green:
m2-assert (PR bundle): FAIL with 1 finding(s):
  - [brief-drift] gates.manifest.json declares this gate and the bundle carries
    NO record for it ... a declared gate that produced no record is a gate that
    did not run.
```

The harness is behaving correctly. M3-P6 adds `brief-drift` to
`gates.manifest.json`, taking it from eleven gates to twelve, and the test's
synthetic healthy bundle carries records for a gate set that does not derive
from the manifest. The twelfth gate has no record, so the control is no longer
healthy.

**This is the antipattern the rules file already names**, at CLAUDE.md:201. Its
words, quoted rather than paraphrased so the claim-grep hit below is visibly a
QUOTATION of a standing prescription and not a new universal of mine: *"A test
over an append-only registry asserts BY NAME and never BY COUNT."* A count, or
here a pinned set, is a claim about every FUTURE phase and is false the moment
the next one appends. `gates.manifest.json` is one of the shared append-only
registries listed at CLAUDE.md:198.

## Why no gate caught this, which is the transferable part

Neither branch could see it, and not through negligence:

- M3-P6's CI ran against a `main` WITHOUT the harness fix, so the old `--only`
  spelling was present and its regex matched.
- The harness's CI ran against a manifest WITHOUT `brief-drift`, so eleven gates
  was the whole manifest and its control bundle was complete.

Each branch's evidence was true of the tree it ran in. **The defect is in the
UNION of two trees that no run had ever built**, which is what a merge is, and
the first time the union existed was this local merge. That is an argument for
building the union before the merge queue rather than discovering it in it.

## Ownership, decided rather than escalated

The rules file settles it in the same passage as the antipattern: *a phase that
extends a registry may have to edit the TEST that over-asserts on it, so that
test belongs on the phase's declaration* (CLAUDE.md:201). M3-P6 is the phase
extending `gates.manifest.json`, so both failures are M3-P6's fix round.

`test/implementer-brief.test.ts` is already on M3-P6's files-to-touch list, so
failure 1 is in scope now. `test/m2-exit-test.test.ts` and
`scripts/m2-exit-test.sh` are NOT, so the declaration has to be amended for
failure 2. That is a scope claim, so here is what settles it rather than a
reader taking it on trust:

```
$ node -e 'for (const f of require("./delivery/plan/phase-declarations/m3-p6.json").filesToTouch) console.log(f)'
roles/implementer.md
roles/clean-room-reviewer.md
scripts/check-brief-drift.mjs
tuition/mechanism-index.yaml
MECHANISMS.md
schemas/mechanism-index.schema.json
test/implementer-brief.test.ts
test/clean-room-brief.test.ts
src/roles.ts
src/commands/brief.ts
.github/workflows/gates.yml
gates.manifest.json
gate-registry.yaml
CLAUDE.md
roles/_shared-dispatch-contract.md
package.json
src/commands/validate.ts
witness/
delivery/requirements/clause-map.json

$ grep -c 'm2-exit-test' delivery/plan/phase-declarations/m3-p6.json
0
```

The amendment is the narrow one the discovered need justifies, not a general
grant.

**Merge order is now genuinely constrained, for the first time with a reason
rather than a habit.** Harness round 3 edits both
`scripts/m2-exit-test.sh` and `test/m2-exit-test.test.ts`, which are exactly the
files M3-P6's fix round needs. So the harness lands FIRST and M3-P6's fix round
is written on top of it. Doing it the other way guarantees a second conflict in
the same two files.

## What this did NOT cover

- **Only the `pull_request` arm ran.** The `push` arm is unreachable before
  merge (T-009 rule 1) and nothing here discharges it.
- **The union was built once, at one pair of heads.** Harness round 3 will move
  `main` again, and this measurement does not carry forward to that union. It
  has to be rebuilt after the harness lands.
- **Two failures is what this run found, not what the union contains.** The run
  stops reporting nothing after the second failure, but a fix for either could
  expose more; a green is only established by a green run.
- **No third-party check ran.** This is the orchestrator's own local run, on a
  box that was at load 4.65 when it started. Neither failure is timing-shaped,
  and both reproduce as assertion errors on deterministic inputs rather than as
  timeouts, which is why they are reported as real rather than as the contention
  flakes recorded in
  delivery/verification/orchestrator-load-and-the-claim-grep-hole.md:8.
