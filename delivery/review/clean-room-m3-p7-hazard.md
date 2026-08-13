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
