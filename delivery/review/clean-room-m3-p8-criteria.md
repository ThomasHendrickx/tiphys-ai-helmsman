# Clean-room review: M3-P8 (tuition flow), criteria walk

Reviewer: clean-room agent A. Subject: branch `claude/m3-p8-tuition-flow`,
PR #125, head 26ee653. Report branch `claude/review-m3-p8-a`, cut from
`origin/main` at 2a3892b (T-019).

Status: IN PROGRESS. This file is appended to as work proceeds; its mtime is
the beacon.

Reference anchor for the process rules this review follows: CLAUDE.md:1

## Log

- Started. Toolchain node v26.6.0 confirmed.

## Method

All commands run in a worktree of the branch under review at 26ee653, on node
v26.6.0 from the session scratch prefix (`node --version` checked in the shell
that ran them), with `dist/` built (`npm run build` exit 0, `git status
--porcelain` empty afterwards). Every schema mutation below is applied to the
working tree and restored from a pristine copy; `git status --porcelain` is
checked empty after each block.

## Criterion 1: every promoted entry plus the two tickets validate

DISCHARGED.

```
for f in tuition/T-*.yaml; do node bin/tiphys.ts validate --type tuition --context . "$f"; done
validated=15 failures=0
node bin/tiphys.ts validate --type mechanism-index --context . tuition/mechanism-index.yaml
mi exit=0
```

The relation the plan asks for (validated = kernel-relevant entries in
`delivery/tuition/` plus two) was recomputed rather than read out of the work
history. `grep -L -i 'kernel-relevant' delivery/tuition/T-*.md` names eight
files (T-010 to T-014, T-018, T-019, T-020), so twelve declare it; T-018 is
promoted by the work history's rule (b) as the incident that paid for
`checking-a-generated-artifact-against-its-own-generator`. 12 + 1 = 13 promoted,
plus T-021 and T-022, is 15. The feed holds exactly 15 `T-*.yaml` files.

## Criterion 2: Kind A dangerous-instance rejections, both directions

DISCHARGED, with two structurally different members on each half.

| instance | at head | with the keyword removed |
|---|---|---|
| `kernel-relevant: true`, `structural-consequence: []` | exit 1, `INVALID #/structural-consequence array has 0 items, fewer than the required minimum 1` | exit 0 (`then.properties.structural-consequence.minItems` deleted) |
| `kernel-relevant: true`, field ABSENT | exit 1, `INVALID #/structural-consequence required property structural-consequence is missing` | exit 0 (`then.required` deleted) |
| `mechanisms[0].evidence: []` | exit 1, `INVALID #/mechanisms/0/evidence array has 0 items ...` | exit 0 (`evidence.minItems` deleted) |
| `mechanisms[0].evidence` ABSENT | exit 1, `INVALID #/mechanisms/0/evidence required property evidence is missing` | exit 0 (`evidence` dropped from the item's `required`) |

The schema file was restored from a pristine copy after each mutation and
`git status --porcelain schemas/tuition.schema.json` printed nothing.

## Criterion 3 and 4b: Kind B rejections, both directions

DISCHARGED.

| instance | at head | with the check deregistered from the registry array |
|---|---|---|
| `applied` consequence targeting `roles/there-is-no-such-brief.md` | exit 1, `INVALID #/structural-consequence/0/target structural consequence is marked applied and its target ... does not exist (check: tuition-target-exists)` | exit 0 |
| `mechanisms[0].evidence[0]` naming an absent file | exit 1, `INVALID #/mechanisms/0/evidence/0 evidence names ... which does not exist (check: mechanism-rule-evidence-resolves)` | exit 0 |
| `machine-readable-form` naming key `destructiveCommandsRenamed` | exit 1, `INVALID #/mechanisms/0/machine-readable-form/key machine-readable form names key ... which gates.manifest.json does not carry (check: mechanism-rule-evidence-resolves)` | exit 0 |

Deregistration was done by removing the entry from the registry array in
`src/checks.ts` and restoring from a pristine copy; `git status --porcelain
src/checks.ts` printed nothing afterwards.

## Criterion 4: projection drift, all directions

DISCHARGED, four directions measured rather than the two the criterion asks for.

| mutation | result |
|---|---|
| a `mechanisms[]` entry appended to `tuition/T-004.yaml`, index untouched | exit 1, `DRIFT mechanism rebasing-a-branch-under-review is declared by tuition entry T-004 and is missing from the committed index` |
| the same tree, `tuition index --out tuition/mechanism-index.yaml` then `--check` | `wrote 16 mechanism(s) from 15 entr(ies)`, then exit 0 |
| a whole row deleted from the committed index, feed untouched | exit 1, `DRIFT mechanism claim-file-mutual-exclusion-by-o-excl is declared by tuition entry T-005 and is missing from the committed index` |
| one word of a rule hand-edited in the committed index | exit 1, `DRIFT mechanism shared-worktree differs from the projection of tuition entry T-004` |
| unmutated head | exit 0, `15 mechanism(s) projected from 15 entr(ies); the committed index matches` |

## Criterion 7: list filter and add refusal

DISCHARGED.

Every entry in the SHIPPED feed is kernel-relevant, so `tuition list` and
`tuition list --kernel-relevant` print identical output against `tuition/`; the
filter therefore has no negative instance in the tree and was exercised against
a staged feed instead (`--dir`), holding `T-005`, `T-015` and a probe entry
`T-777` with `kernel-relevant: false`. All three print under `list`; only the
two kernel-relevant ones print under `--kernel-relevant`. This is the same gap
the implementer recorded finding in its own witness, and the shipped behaviour
matches.

`tuition add --file <invalid> --into <dir>` exits 1, prints `is not a valid
tuition entry` plus the INVALID lines, and leaves the directory listing
byte-identical (`ls -la | sha256sum` equal before and after). A second add of an
id already present exits 1 with `already exists, and a tuition id is never
reused`.

## Criterion 4d: the interim index is gone and its readers redirected

DISCHARGED UNDER THE DIRECTORY READING, with a residue that is a tracked item
rather than a finding (see finding L-1 below).

`MECHANISMS.md` is absent from the tree and from `git ls-files`.
`tuition/README.md:6` names `tuition/mechanism-index.yaml` as the index. The
walk over `roles/`, `schemas/`, `checklists/`, `tuition/`, `templates/` and
`AGENTS.md` finds zero occurrences. The reverse direction is witnessed for real,
not only by the test's staged copy: witness member 1 of
`interim-index-removed-and-redirected` rewrites a line of `tuition/README.md`
to mention the deleted file, which the registered test's own `walk()` reads.

## Criterion 6: the composed brief names the generated index

DISCHARGED.

```
node bin/tiphys.ts brief compose --role implementer --phase templates/plan.example.yaml --phase-id M9-P1
exit=0
line 11:  3. tuition/mechanism-index.yaml
```

The named path is the generated file: `tuition index --check` against it exits 0
with `the committed index matches`.

## Criterion 4c: no interim row is dropped

DISCHARGED, derived independently of the phase's test.

`test/fixtures/mechanisms-interim.md` is byte-identical to `git show
037477e:MECHANISMS.md` (`diff -q` exit 0), so the capture is verbatim as the
criterion requires. Parsing the fixture's table myself and applying the key
derivation the schema documents (lowercase, non-alphanumeric runs to one hyphen,
ends trimmed) gives twelve keys, and all twelve are present in
`tuition/mechanism-index.yaml`. The generated index carries fifteen keys; the
three extra are `shared-worktree`, `supervising-a-dispatched-agent` and
`checking-a-generated-artifact-against-its-own-generator`.

Removing a mechanism and regenerating is the reverse direction, and it is
measured under criterion 4 above (the deleted `claim-file-...` row is named).

## Criterion 5: the claim-file row

DISCHARGED for the rule, with a citation caveat recorded as L-2 below.

The row `claim-file-mutual-exclusion-by-o-excl` carries T-005's loud-failure
rule ("A claim that cannot be taken must fail LOUDLY and name the stuck file"),
three siblings, and two evidence strings. The first resolves
(`delivery/verification/u2-race-flake-investigation.md`). The second is
`delivery/tuition/T-005, the silent reimplementation ...`, which
`pathReferencesIn` does not treat as a path (no extension), so it is neither
resolved nor reported. See L-2.

## Criterion 8: the retention doctor check

DISCHARGED for the states the criterion names; a MEDIUM finding sits beside it
(CR-1).

Probed against a real fleet built with `tiphys init` plus a hand-written
`charter/charter.yaml` declaring three retention paths, all present and tracked:

| fleet state | generic | `--for full` |
|---|---|---|
| three paths declared, present, tracked | `PASS 3 declared retention path(s) present and tracked`, exit 0 | PASS |
| `delivery/evidence/` added to `.gitignore` | `FAIL ... is git-ignored and will not survive a clone`, exit 1 | FAIL |
| the ignore removed again | PASS | PASS |
| charter present, `retention` key ABSENT | `WARN ... declares no retention paths` | `FAIL ... (required for profile full)` |
| `tiphys init` fleet, `charter/` holds only `.gitkeep` | `WARN ... no project is realized here yet and retention is not applicable` | `WARN`, NOT promoted |

The fix-round-2 cost is real and correctly bounded as stated: `PROFILES.full` is
`["gh-missing", "remote-missing", "retention-undeclared"]` at
`src/commands/doctor.ts:53` and `retention-not-applicable` is absent from it, so
`--for full` no longer asserts that a project is realized. Doctor's check list
is `node, git, gh, layout, remote, lock, beacon, identity, retention` and none
of the other eight reads the charter, so nothing else in the kernel at M3
asserts realization either. That matches what the work history claims.

## Criterion 9: the two migration-ticket ids do not collide

DISCHARGED AS THE PLAN SCOPES IT; the wider claim its behaviour registration
makes is not (finding CR-2).

Independent scan: the feed holds fifteen ids, the delivering log holds twenty,
`T-021` and `T-022` are in the feed and in neither position of the log. The
registered test asserts both by name.

## Criterion 10: suite and clause map

DISCHARGED.

Suite sentence with all three axes: node **v26.6.0** (scratch prefix), build
state **`dist/` PRESENT** (`npm run build` exit 0, `git status --porcelain`
empty afterwards), invocation **`npm test`**: **710 tests, 710 pass, 0 fail, 0
SKIPPED**, exit 0. That reproduces the integration's number exactly.

Gates re-run at this head, one at a time, so each number is a gate-level
measurement rather than a bundle-level green (T-009 one scope down):

| gate | verdict | units | vacuous |
|---|---|---|---|
| `scope` | green | 55 changed paths audited | false |
| `clause-map` | green | 63 clause-map rows checked | false |
| `coverage` | green | 115 finding ids checked | false |
| `manifest-self-check` | green | 8 | false |
| `agent-rules-drift` | green | 18 | false |
| `brief-drift` | green | 15 | false |
| `citations` | not-applicable | 0 | false |

`scope` is green because the declaration on `origin/main` already carries
`test/liveness.test.ts` and `test/implementer-brief.test.ts` in
`declaredExtras`. The clause map carries this phase's three rows: R-070 ->
`tuition/README.md`, R-091 -> `schemas/tuition.schema.json`, R-098 ->
`src/commands/doctor.ts`.

## Witness spot-check: do the tests reach the behaviour

The fix-round-2 witness is the one most worth re-measuring, because round 2 is
where the doctor condition was split. All three of its members were applied to
`src/commands/doctor.ts` in the working tree and the named test run under
`--test-reporter tap`, reading `ok`/`not ok` lines rather than the summary
counts:

```
control            ok 1 - doctor reports retention not applicable, never FAIL under --for full, ...
member 0           not ok 1 - ...   (condition id folded back into retention-undeclared)
member 1           not ok 1 - ...   (retention-not-applicable promoted in PROFILES.full)
member 2           not ok 1 - ...   (the not-applicable verdict turned into PASS)
restored control   ok 1 - ...
```

All three find-strings were confirmed present in the file before mutating, so
none is a stale mutation that silently applies nothing.

## FINDINGS

### CR-1, MEDIUM: `CHECK retention PASS` on a charter that declares no usable retention path

**Shipped behaviour threatened:** the `retention` doctor check (R-098), this
phase's step 7, in both the generic and the `full` profile.

The check builds its path list with

```
Object.values(retention).filter(v => typeof v === "string" && v !== "")
```

and then, if the list is empty, falls through the loop and returns PASS with
`0 declared retention path(s) present and tracked`. Measured against a real
fleet (`tiphys init` plus a hand-written charter), THREE structurally different
shapes reach it, under both profiles:

| charter `retention` | generic | `--for full` |
|---|---|---|
| `retention: {}` | `PASS 0 declared retention path(s) present and tracked` | same PASS |
| values are nested maps (`work-history: {path: ...}`) | same PASS | same PASS |
| values are empty strings | same PASS | same PASS |

The check's own header at `src/commands/doctor.ts` says the opposite in the
same words the plan uses: "the two states a reader might confuse (nothing
declared, everything declared and present) never print the same word". Here they
print the same word, PASS, and the plan's hazard-to-criterion row
(delivery/plan/kernel-plan-m3.md:4042) requires FAIL or
not-applicable-with-a-reason for a charter with no retention path.

**Why it is reachable by a real user rather than only by a fixture.** Doctor
does not validate the charter: its check list is `node, git, gh, layout, remote,
lock, beacon, identity, retention` and none of the other eight reads
`charter/`. `tiphys init` writes no charter, and charter authorship is an owner
duty, so every charter in existence is hand-written. `schemas/charter.schema.json`
does forbid all three shapes (three required string properties,
`additionalProperties: false`), so `tiphys validate --type charter` catches
them, but nothing makes a user run it before `tiphys doctor --for full`, and
doctor is the command criterion 8 points at.

**Bounding what is and is not covered.** The implementer named the first of the
three shapes in the round-2 not-covered section and left it; the other two were
not named. No registered test exercises any of them (`grep -n retention
test/doctor.test.ts` shows three tests, covering present/ignored, absent-path
plus `full` promotion, and the no-charter state).

**Cost to fix:** one guard, `if (paths.length === 0)` returning
`retention-undeclared`, plus a member on the existing witness. That is inside
the same function this phase already owns.

### CR-2, MEDIUM: the cross-directory id guard is green on the collision it names

**Shipped behaviour threatened:** the registry entry
`tuition-ids-unique-across-directories` in `test/behaviors.json`, which the
`suite` gate resolves by name, and criterion 9's "the test outlives this phase,
which is the point, since the two directories will keep growing independently".

The registered description is `no tuition id is claimed by both the shipped feed
and the delivering project's log`. That sentence is FALSE of the tree it
describes: thirteen ids (T-001 to T-009, T-015 to T-018) are claimed by both,
by design, because the feed entries are promotions. The test does not assert it
either. For a shared id it asserts only that the delivering log's file contains
`- id: T-nnn` or `# T-nnn:`, which is true of all twenty log files by naming
convention, so the assertion is satisfied by the filename scheme rather than by
the property.

Measured. A new shipped entry claiming `T-010`, an id the delivering log gave to
a completely different incident (the NUL control-character check), was added to
the feed and the two test files run:

```
node --test --test-reporter tap --test-name-pattern "no tuition id is claimed by both ..." test/tuition.test.ts
ok 1 - no tuition id is claimed by both the shipped feed and the delivering project's log

node --test test/tuition.test.ts test/mechanism-index.test.ts   ->   exit 0
```

Green, whole-file, on the exact dangerous state. The witness spec does not
contradict this: its two members are `T-021 -> T-005` (caught by the
within-feed duplicate loop) and `T-022 -> T-999` (caught by the by-id ticket
assertion), so neither reaches the cross-directory arm, and the witness's green
at head is honest about a narrower class than the behaviour name claims.

The plan's hazard table already scopes the ONGOING collision risk out
("criterion 9 checks the two ids this phase allocates"), so the finding is not
that the class is unpoliced. It is that the assertion and the registered
description both say it IS policed, which is the shape CLAUDE.md names: a guard
whose condition does not test the property that matters is green and worthless.
Either strengthen the assertion (compare the two documents' subject lines) or
narrow the description and the failure message to what is checked.

### L-1, LOW: a shipped schema still names the deleted `MECHANISMS.md`

`src/gates/schemas/gate-manifest.schema.json:60` carries "the mechanism
MECHANISMS.md forbids" in a `description`, and it IS shipped: `npm pack`
produces `package/dist/src/gates/schemas/gate-manifest.schema.json`. Criterion
4d forbids the string in "briefs, `AGENTS.md`, checklists, schemas"; under the
top-level-`schemas/` reading the tree is clean and the phase is satisfied, and
that reading is the one the orchestrator's own record
(delivery/plan/m3-p8-declaration-gap.md:1) put to the dispatch. The file is not
on the phase's declaration. LOW because the consequence is one dangling pointer
in a description string, and the phase resolved the reading in writing rather
than silently.

### L-2, LOW: one of the claim-file row's two citations resolves to nothing

Criterion 5 asks for evidence that "resolves to both cited files". The shipped
row's second evidence string is `delivery/tuition/T-005, the silent
reimplementation two phases later that became M1's most severe defect`.
`pathReferencesIn` requires a token with a slash AND an extension, so
`delivery/tuition/T-005` is not treated as a path: it is neither resolved nor
reported, and `validate` exits 0. The string is the interim file's citation
carried over verbatim, which step 2b asks for, so this is a collision between
two plan instructions rather than a mistake. LOW: a reader can still find the
entry, and the implementer's residue names prose-only evidence as an accepted
boundary.

### L-3, LOW: the shipped feed's evidence references do not resolve in the package

`package.json` ships `tuition`, and `delivery/` is deliberately not shipped, so
every `delivery/...` citation in the shipped feed and index dangles for a
consumer. Measured on the packed tarball:

```
node bin/tiphys.ts validate --type mechanism-index --context <pack>/package <pack>/package/tuition/mechanism-index.yaml
INVALID #/mechanisms/11/evidence/0 evidence names delivery/verification/u2-race-flake-investigation.md, which does not exist (check: mechanism-rule-evidence-resolves)
... exit 1
```

`tuition list` and `tuition index --check` against the packed feed both exit 0,
and `structural-consequence[].target` paths such as `roles/implementer.md` do
resolve in the package, so the commands a consumer actually runs are unaffected.
LOW, and stated because the mechanism index is mandated reading and a reader who
follows a citation from an installed package finds nothing there.

### Observation, not a finding: the machine-readable-form row is named differently from the plan

Criterion 4b calls it "the `destructive-git-operation` entry". The shipped index
key is `worktree-removal-and-force-branch-delete`, the interim file's own name,
which is what step 2b and criterion 4c require. The substance criterion 4b asks
for (a `machine-readable-form` naming `gates.manifest.json` and the key
`destructiveCommands`, resolving, and reddening on a renamed key) is delivered
and was measured above.

## What this review did NOT cover

- **I did not run the `red-witness` or `suite` gates.** The suite was run
  directly (`npm test`, 710/710/0 skipped) and six other gates were run
  individually; `red-witness` takes several minutes over 63 witnesses and I
  spot-checked one witness (three members) by hand instead. So the claim
  "every declared member of every witness is red" is NOT re-measured here; only
  `doctor-retention-not-applicable-without-a-charter` is.
- **I did not re-derive the eleven behaviour descriptions** corrected in fix
  round 1, beyond confirming the `suite` gate's own resolution is not part of
  what I ran.
- **I did not audit the other four doctor profiles** (`generic`, `local-only`,
  `direct-pr`, `watch`) for the one-id-two-states shape, which the implementer
  also lists as uncovered.
- **I did not read `src/tuition.ts`'s projection code line by line.** The
  projection was exercised behaviourally (four drift directions, regeneration,
  the interim-row derivation) rather than read.
- **I did not observe CI.** No `pull_request` run and no post-merge `push` run
  on this head was watched; every number above is local, on node v26.6.0 with
  `dist/` built, in a worktree of 26ee653.
- **I did not review M3-P7's half of the merge**, only that the enumeration the
  work history claims (22 registered checks) is consistent with the suite
  passing at 710.
- **The `retention: {}` family was probed for three shapes.** Other charter
  shapes (a `retention` value that is a string, a number, a list of non-strings)
  were not probed.

## Verdict

**FINDINGS, not APPROVE.** Two MEDIUM findings block under DR-0012's
"no unresolved high or medium finding": CR-1 (the retention check prints PASS on
the vacuous declaration the plan's hazard row says must never pass silently) and
CR-2 (the cross-directory id guard is green on the collision its own registered
description claims to catch). Both are small, local fixes inside files the phase
already owns. Everything else in the criteria walk is discharged with executed
evidence.
