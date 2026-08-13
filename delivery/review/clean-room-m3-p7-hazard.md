# Clean-room hazard review: M3-P7 (review checklists)

Subject: branch `claude/m3-p7-review-checklists`, PR #124, head 4bfa790.
Reviewer: clean-room hazard reviewer B. Contract: hazard review, NOT an
acceptance-criteria walk (reviewer A holds that half).

Question asked of every shipped surface: what does this ship that could hurt a
user of the kernel, or silently fail to protect them?

Status: IN PROGRESS (this file is appended as the review proceeds; its mtime is
the beacon required by CLAUDE.md:397).

## Findings

(none yet)

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
`checklist-probe-ids-unique`, and its own docstring gives the reason a nested
reference cannot be a keyword. `verdict.schema.json`'s own `$comment` on
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
`orders-probes: [deviations]`, was discarded with no message. `resolveChecklist`
reads `request.checklist.framings` only, so an extra file's framings are never
merged and never mentioned.

REACHABILITY, stated plainly per DR-0027. Member 2 is a real user path today:
R-054's whole purpose is the orchestrator writing a per-phase extra probe file,
and that file is validated as a full checklist document, so declaring a framing
in it is the natural thing to try. Member 1 requires a future editor of a
shipped checklist, or a kernel user authoring their own; the five shipped
`checklists/*.yaml` carry no duplicate framing id today.

WHAT IT THREATENS, and the bound is stated rather than inflated: the canonical
framing wins in member 2, so a per-phase file cannot WEAKEN the standing
checklist this way. The damage is a silent no-op: the author gets exit 0, a
resolved list, and no way to tell their framing was ignored. In member 1 the
served entry point depends on file position with nothing saying so.

The cheapest fix for member 2 is a message. For member 1 it is a check of the
same shape as the one already shipped for probes.
