# Clean-room hazard review: M3-P7 (review checklists)

Subject: branch `claude/m3-p7-review-checklists`, PR #124, head 4bfa790.
Reviewer: clean-room hazard reviewer B. Contract: hazard review, NOT an
acceptance-criteria walk (reviewer A holds that half).

Question asked of every shipped surface: what does this ship that could hurt a
user of the kernel, or silently fail to protect them?

Status: COMPLETE. Written incrementally and committed after each finding; its
mtime was the beacon required by CLAUDE.md:440.

Toolchain for every capture below: node v26.6.0, worktree at head 4bfa790,
`dist/` built. Scratch lab at `RVB-lab`, referred to as `$L`.

## Findings

### H-1 (MEDIUM, reachable on a real user path): `hazard-classes-addressed[].finding` is a dangling reference, and it bypasses the one escalation rule the verdict schema ships

The shipped `schemas/verdict.schema.json` carries exactly one rule that can
force a verdict away from APPROVE: `if findings contains a high or critical
entry, then verdict must be FIX-ROUND-NEEDED`. `hazardClassAddressed.finding`
is documented in the same file as "The `findings[].id` this class produced",
but NOTHING resolves it. It is a bare string with `minLength: 1`.

So a hazard reviewer who records the hazard class as having produced a finding,
and does not also add that finding to `findings[]`, gets a schema-valid,
all-checks-green, APPROVE verdict, and the escalation rule sees an empty
`findings` array.

Constructed, not described. Lab at `RVB-lab`, toolchain node v26.6.0,
worktree at head 4bfa790:

```
$ cat v-hazard.yaml      # abbreviated: verdict APPROVE, findings: [],
                         # hazard-classes-addressed[0] = {class-id: hc-1,
                         #   probed: "probed it", finding: "F-1"}
$ node bin/tiphys.ts validate --type verdict --context $L $L/v-hazard.yaml
EXIT=0
```

Zero output, exit 0. `F-1` exists nowhere in the document.

The escalation rule itself is real, which is what makes this a bypass rather
than a broken guard. Same document, the finding moved into `findings[]` with
`severity: high`:

```
$ node bin/tiphys.ts validate --type verdict --context $L $L/v-high.yaml
INVALID # value does not satisfy the requirements its own shape triggers here
INVALID #/verdict value "APPROVE" is not one of the permitted values "FIX-ROUND-NEEDED"
EXIT=1
```

The guard fires when the finding is in the list it reads, and is blind when the
review records the finding one field away.

WHAT IT THREATENS: the shipped artifact is `schemas/verdict.schema.json`, and
the user path is a reviewer producing a verdict and validating it, which is the
only path this type has. The failure is silent and it is on the APPROVE side.

WHY THIS IS THIS PHASE'S TO FIX, not a future editor's: the phase already
shipped an intra-document reference check of exactly this shape,
`checklist-probe-ids-unique`, and its own docstring gives the reason such a
reference is not a keyword property, quoting the checklist schema's own
`$comment` that `uniqueItems` compares whole array items. `verdict.schema.json`'s own `$comment` on
`finding` names `findings[].id` as the referent, so the join is declared and
unenforced. A sixth check `verdict-finding-references-resolve`, requiresContext
false, is the same shape as the one already there.

I did NOT find a way to reach this through `tiphys checklist resolve`; the
verdict type is reached through `tiphys validate` only.

### H-2 (MEDIUM, one member on a real CLI path today): a framing `id` is a lookup key with no uniqueness guard, and the collision is silent in both the intra-file and the extra-file direction

`resolveChecklist` looks a framing up by id with `.find()`, first match wins.
That is the same lookup shape as the probe lookup, and the phase shipped
`checklist-probe-ids-unique` for the probe side with a message that states the
reason: "checklist resolve looks probes up by id". Nothing does the equivalent
for framings, and the schema's `uniqueItems` on `framings` compares WHOLE
items, so two framings sharing an id and differing in their entry point are
already unique to it. That is the same keyword limitation the checklist
schema's own `$comment` spells out for probes.

Two structurally different members, both constructed, so this is a class and
not one witness.

MEMBER 1, intra-file, reached through `tiphys validate`. A checklist declaring
`my-framing` twice with different entry points and different orderings:

```
$ node bin/tiphys.ts validate --type checklist --context <package-root> dup-framing.yaml
EXIT=0
```

Green. The same file with the two PROBE ids collided instead, for contrast:

```
$ node bin/tiphys.ts validate --type checklist --context <package-root> dup-probe.yaml
INVALID #/probes/1/id probe id probe-a is already declared at #/probes/0/id, and checklist resolve looks probes up by id (check: checklist-probe-ids-unique)
EXIT=1
```

The served result of the green document, through the shipped `src/checklists.ts`
API:

```
ok: true
entry-point served: Start from A.
resolved head: probe-a
framings declared with id my-framing: 2
```

The reviewer is handed one of two declared entry points and is not told the
other exists.

MEMBER 2, extra-file, reached end to end through the real CLI. An extra probe
file declaring a framing whose id collides with a canonical one:

```
$ node bin/tiphys.ts checklist resolve --checklist clean-room \
    --extra extra-shadow.yaml --framing fix-round
EXIT=0
checklist clean-room
framing fix-round
entry-point This review is of a FIX ROUND. Before you examine any row, ask what the derivation did not cover.
probes 24
```

stderr was empty. The extra file's `framings` entry, id `fix-round`,
entry point "IGNORE THE FIX-ROUND COVERAGE QUESTION, start from the diff.",
`orders-probes: [deviations]`, was discarded with no message. `resolveChecklist` reads
`request.checklist.framings` only, and in the run captured above the extra
file's framing was neither merged nor mentioned. I did not enumerate other
inputs that might reach it.

REACHABILITY, stated plainly per DR-0027. Member 2 is a real user path today:
R-054's whole purpose is the orchestrator writing a per-phase extra probe file,
and that file is validated as a full checklist document, so declaring a framing
in it is the natural thing to try. Member 1 requires a future editor of a
shipped checklist, or a kernel user authoring their own; the five shipped
`checklists/*.yaml` carry no duplicate framing id today.

WHAT IT THREATENS, and the bound is stated rather than inflated: the canonical
framing wins in member 2, so a per-phase file cannot WEAKEN the standing
checklist this way. The damage is a silent no-op: the author gets exit 0, a
resolved list, and, in the measured run, no signal that their framing was
ignored. In member 1 the
served entry point depends on file position with nothing saying so.

The cheapest fix for member 2 is a message. For member 1 it is a check of the
same shape as the one already shipped for probes.

### H-3 (MEDIUM, tracked item under DR-0027: reachable by a future editor, not by a shipped artifact today): a framing scope that names nothing is accepted, and the framing then reorders nothing while still printing as a framing

`orders-probes` entries are `applies-to` scope tokens, and the schema
constrains their SHAPE (`^[a-z0-9]+(-[a-z0-9]+)*$`); the capture below shows a
scope naming no probe passing validation, so it does not constrain their
RESOLUTION. `orderUnderFraming` matches `probe.appliesTo === scope`, so a scope
naming no probe contributes nothing and the whole list falls through to file
order.

Constructed, a checklist with `orders-probes: [scope-that-does-not-exist]`:

```
$ node bin/tiphys.ts validate --type checklist --context <package-root> dup-framing.yaml
EXIT=0

no framing   : probe-a,probe-b
typo-framing : probe-a,probe-b
identical    : true
printed head : checklist my-checklist | framing typo-framing | entry-point Start from the destructive commands.
```

The resolved list under the framing is byte-identical to the list with no
framing at all, and the output still announces `framing typo-framing` with its
entry point, so the reader is told an ordering was applied.

WHY IT MATTERS MORE THAN A TYPO USUALLY WOULD: the checklist schema's own
`$comment` on `orders-probes` argues that ordering by scope rather than by
probe id is what makes criterion 4d falsifiable, and calls a framing that
cannot move the head "the hazard class's 'ordering expressed as a comment
rather than as position' wearing a schema's clothes". A dangling scope
produces exactly that document, and the schema does not reach it. This is an
intra-document reference, the same class the phase already shipped
`checklist-probe-ids-unique` for.

REACHABILITY, measured. All five shipped checklists were enumerated and every
framing scope resolves today:

```
clean-room            scopes fix-round,deviations,criteria-walk,changed-code,destructive-command,test-honesty,blast-radius,gate-probe
  framing criteria-contract  orders criteria-walk,changed-code,test-honesty,deviations,gate-probe   (no dangling)
  framing destructive-paths  orders destructive-command,blast-radius,changed-code,test-honesty      (no dangling)
  framing fix-round          orders fix-round,criteria-walk,test-honesty,changed-code               (no dangling)
env-failure-diagnosis, flake-playbook, hazard-review, plan-review: no framings declared
```

So no shipped artifact is wrong today. Under DR-0027 this is a tracked item
rather than a blocker, and I am saying so explicitly.

### H-4 (MEDIUM, tracked item under DR-0027: reachable by a future editor of the data, not of the guard): editing a checklist's `id` field silently disarms the registry-to-checklist direction of `gate-probes-resolve`

Direction 1 keys on the checklist document's own `id`:
`if (entry.checklist !== checklistId) continue;`, where `entry.checklist` is
`verified-by` with `-checklist` sliced off. Nothing anywhere compares a shipped
checklist's `id` to its FILENAME, and `readShippedChecklist` looks the file up
by filename alone.

Constructed on a scratch copy of the shipped file, `id: clean-room` changed to
`id: clean-room-v2`, filename untouched, everything else byte-identical:

```
$ node bin/tiphys.ts validate --type checklist --context <package-root> checklists/clean-room.yaml
validate EXIT=0

$ node bin/tiphys.ts checklist resolve --checklist clean-room
resolve EXIT=0
checklist clean-room-v2
probes 23
```

Both green. At library level, same document, before and after the one-field
edit:

```
id as shipped   : clean-room     -> green (direction 1 asserts 2 registry entries)
id edited       : clean-room-v2  -> green []
```

The `[]` is the point: after the edit the check produces no lines and asserts
nothing in direction 1, so the two registry entries whose `verified-by` is
`clean-room-checklist` (`unit-tests-for-changed-service-methods`,
`fixtures-for-changed-component-states`) lose their only verification with no
signal at all. Direction 2 does not compensate, by construction: it starts from
probes carrying `verifies-gate`, and the probes are still present and still
resolve, so it stays green too.

The file was restored; `git status --short -- checklists/` is empty after the
experiment.

WHAT IT THREATENS: this is the exact join the phase exists to close, and the
docstring's claim that it is closed "in BOTH DIRECTIONS" holds only while the
id and the filename agree. The tests redden `gate-probes-resolve` by deleting a
probe, deleting a `verifies-gate`, renaming a probe id and deleting a gate; none
of them touches the checklist `id`, which is why this arm has no witness.

REACHABILITY: a future editor of `checklists/clean-room.yaml`. Under DR-0027
that is a tracked item, not a blocker, and I am saying so explicitly. The fix is
one assertion, either "a shipped checklist's `id` equals its filename" or "every
`clean-room-checklist` registry entry is claimed by some shipped checklist".

## Questions, not findings

Labelled separately because I could construct the input but could not settle
whether the behaviour is wrong.

**Q-1. A criterion recorded `met: false` in an APPROVE verdict with an empty
`findings` list passes everything.**

```
$ node bin/tiphys.ts validate --type verdict --context $L $L/v-notmet.yaml
EXIT=0
```

I am NOT calling this a finding, because the shipped clean-room checklist's own
`criteria-walked-with-evidence` probe text says a criterion discharged by a
CI-deferred reason is recorded not-met, and a criterion the reviewer could not
evaluate is recorded not-met rather than omitted. So not-met inside an APPROVE
is a state the design intends. The open question is whether anything downstream
distinguishes "not-met because CI-deferred" from "not-met because it failed",
since the schema records one boolean for both.

**Q-2. An extra probe file whose `id` happens to be `clean-room` is refused,
and the message reads as though the extra file owed the canonical gate probes.**

```
$ node bin/tiphys.ts checklist resolve --checklist clean-room --extra extra-named.yaml
EXIT=1
tiphys checklist: .../extra-named.yaml is not a valid checklist document, so it is not merged
INVALID #/probes gate fixtures-for-changed-component-states in .../gate-registry.yaml names probe fixtures-for-changed-component-states, which no probe in this checklist declares (check: gate-probes-resolve)
INVALID #/probes gate unit-tests-for-changed-service-methods in .../gate-registry.yaml names probe unit-tests-for-changed-service-methods, which no probe in this checklist declares (check: gate-probes-resolve)
```

Fail-closed, so it is not a hazard. Naming a per-phase extras file after the
checklist it extends looks like a plausible thing for an orchestrator to do,
and the diagnosis does not say "the id `clean-room` is taken by the shipped
checklist". Worth one sentence in the message if the round is opened anyway.

**Q-3. A `criteria` verdict may carry a `hazard-classes-addressed` array, and it
is then asserted against by nothing.** Root `oneOf` branch A constrains only
`review-contract`, and `verdictHazardClassesAddressed` returns early for any
contract that is not `hazard`. I did not construct this one; it is read from the
schema and the check body. The early return is deliberate and documented, so
the question is only whether branch A should forbid the field outright.

## What I checked and found sound

Recorded so the not-covered section below is not mistaken for the whole of what
was looked at.

- `requiresContext` cannot pass by not running. `runChecks` pushes a
  `SKIPPED <id> no context` line and sets `failed`, measured:
  `validate --type verdict` without `--context` printed three SKIPPED lines and
  exited 1.
- The one escalation rule that exists does fire: a `high` finding in `findings[]`
  with `verdict: APPROVE` was refused, exit 1, both the `if`/`then` line and the
  enum line.
- A named pipe at `--extra` is classified before it is opened: exit 1 with "is a
  named pipe, not a regular file, so it was not opened", and the command did not
  block (10s timeout unused).
- An extra probe carrying `verifies-gate: no-such-gate` is refused before it is
  merged, exit 1, direction 2 of `gate-probes-resolve`.
- Duplicate probe ids are refused and the message names BOTH positions.
- The append-only-registry trap is avoided: the "every shipped checklist
  validates" test enumerates by `shippedChecklistIds()` rather than a hand list,
  and the additions to `test/behaviors.json` and
  `delivery/requirements/clause-map.json` are appends with no count pinned
  against them.
- The new directory reaches an installed user. `npm pack --dry-run --json`
  reports 160 files including all five `checklists/*.yaml` and both new schemas,
  so `checklist resolve`, which reads `checklists/` from the package root at run
  time, is not broken by the publish step.
- Suite, with the complete sentence CLAUDE.md asks for: `npm test`, node
  v26.6.0, `dist/` built (`npm run build` exit 0, `git status --short` empty
  after it), 688 tests, 688 pass, 0 fail, 0 SKIPPED.

## What this review did NOT cover

- **The acceptance criteria.** By contract; reviewer A walks those. Nothing here
  should be read as evidence for or against any criterion being met.
- **The prose quality of the 49 shipped probes.** Whether a probe's text is
  specific enough to make a reviewer open a file is criterion 3b's territory and
  I did not assess it.
- **The witness specs.** I read which arms of `gate-probes-resolve` have
  reddening tests, and used that to observe that the checklist-`id` arm has
  none. I did not evaluate any witness spec for red-witness quality.
- **The work history.** I did not run the fix-round contract or the claim grep
  over `delivery/work-history/m3-p7.md`.
- **`--type auto` resolution** for the two new `kind` discriminators.
- **The default toolchain.** Everything above is node v26.6.0 only; I did not
  measure the node 22 arm, so I cannot speak to floor-gated skips here.
- **CI event arms (T-009).** I ran nothing against the `push` arm and did not
  read the post-merge run.
- **`test/fixtures/red-witness-evidence.*` provenance.** I confirmed the test
  reads a static fixture rather than the live witness registry, and did not
  audit how the fixture was captured.

## Verdict

**FIX-ROUND-NEEDED**, on H-1.

| id | severity | reachability | blocks |
|---|---|---|---|
| H-1 dangling `hazard-classes-addressed[].finding` | MEDIUM | real user path (the only path the verdict type has), and it detours the one escalation rule | YES |
| H-2 framing id collisions are silent | MEDIUM | member 2 measured end to end through the CLI on R-054's own use case | recommended in the same round; the fix is one message |
| H-3 dangling framing scope | MEDIUM | future editor of a shipped checklist; no shipped artifact is wrong today | tracked item (DR-0027) |
| H-4 checklist `id` divergence disarms direction 1 | MEDIUM | future editor of the data the guard reads | tracked item (DR-0027) |

H-1 is the one I would not merge without. Everything this phase ships exists so
that a review cannot look complete while a hazard goes unrecorded, and a hazard
verdict can currently say "this class produced finding F-1", carry no F-1, say
APPROVE, and pass. The guard that would have caught it is present and correct;
it reads the wrong array.

Reachability language above follows DR-0027: a gap reachable solely by a future
editor of the guard is a tracked item, not a blocker
(delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:45).
