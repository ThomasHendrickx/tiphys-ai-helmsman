# M5 plan readiness check, 2026-09-22

Subject: the approved M5 plan, delivery/plan/value-delivery-plan.yaml:1, at
`main` head `f7b7d8e`. Question: can its first phase be dispatched as written?

## What passes

| check | command | result |
|---|---|---|
| plan is well formed | `node bin/tiphys.ts validate --type plan delivery/plan/value-delivery-plan.yaml` | `dispatchable: true`, exit 0 |
| each phase projects | `node bin/tiphys.ts plan project --phase-id M5-Pn --plan ... --stdout`, n = 1..6 | exit 0 for all six |
| declarations on main | `ls delivery/plan/phase-declarations/m5-p*.json` | six files, M5-P1 to M5-P6 |
| branch names derive their phase | the CLAUDE.md branch-name check, per declaration | `true` for all six |
| no phase branch pushed yet | `git ls-remote --heads origin 'claude/m5-*'` | empty |

Toolchain: node v22.22.2 (container default), after `npm ci`. A first
`validate` run before `npm ci` failed with "Cannot find module 'yaml'"; that is
the missing install, not the plan.

## What blocks M5-P1 as written

M5-P1 must pass acceptance `p1-trigger` (delivery/plan/value-delivery-plan.yaml:63):
`node scripts/check-cutover-entry.mjs` exits 0 with all four arms satisfied.
The phase says it runs "without changing kernel code"
(delivery/plan/value-delivery-plan.yaml:31) and its files-to-touch are three
documents only. Its grounding says the checks "already ship"
(delivery/plan/value-delivery-plan.yaml:39).

Measured on a full (unshallowed) clone at `f7b7d8e`:

```
ARM a drain not-yet -- cutover status: the cutover command is not delivered (exit 64)
ARM b exclusion not-yet -- behaviors.json does not yet register: exclusion-second-clone-refused, exclusion-unreachable-register-fails-closed, exclusion-identity-no-process-probing, doctor-shared-lock-four-statuses, spawn-refused-under-foreign-shared-lease, teardown-refused-under-foreign-shared-lease
ARM c retirement unreachable -- the retirement report carries a line its contract does not fix, so the report cannot be read in full: PORT claude-md:tiphys-kernel-repository-rules ported negative witness exits 1 under the new artifact
ARM d pre-freeze-ruleset satisfied -- delivery/plan/cutover/pre-freeze-ruleset.json is present and is newer than delivery/plan/cutover/retirement-inventory.json by commit order (1789726959 against 1789717584)
```

On a shallow clone arm d reads `unreachable` instead; `git fetch --unshallow`
turns it satisfied. That one is environment, not a defect.

The other three are defects in shipped code or data, not "not yet":

- **Arm a.** The trigger calls `tiphys cutover status` with no `--fleet`
  (scripts/check-cutover-entry.mjs:431). The CLI requires `--fleet` and exits
  64 with "--fleet is required" (src/commands/cutover.ts:63). The script reads
  that usage error as "the cutover command is not delivered". The command is
  delivered. This is the "usage error read as a clean result" shape the
  fix-round contract names, in the opposite direction.
- **Arm b.** None of the six behavior names the arm requires exists in
  test/behaviors.json (a `grep -c` for three of them returns 0 each). Related
  names exist, for example `shared-exclusion-captured-cas-contract`, so either
  the behaviors were registered under other names or they were never written.
  Not settled here.
- **Arm c.** `tiphys cutover status --retirement --json` exits 0 and reports
  rows with verdict `ported`. The text form prints `PORT <id> ported <reason>`,
  which the trigger's parser does not accept
  (scripts/check-cutover-entry.mjs:710). Producer and reader disagree on the
  line format.

M4 closed with the cutover sweep group not run (delivery/STATE.md:2660), which
is consistent with these surviving.

## Consequence

M5-P1 cannot meet `p1-trigger` inside its declared files. Fixing arms a, b and
c touches `scripts/`, `src/` or `test/`, which M5-P1 does not declare and its
intent excludes. The plan's binding rule forbids making what is not written, so
this needs a plan revision before dispatch, not an implementer's judgment.

Recommendation: add one small repair phase ahead of M5-P1 (for example
`M5-P0`, branch `claude/m5-p0-cutover-trigger-repair`) that fixes the three
arms, with a red-then-green witness for each against the real CLI output, and
leaves M5-P1 unchanged. M5-P2 to M5-P6 are not affected by this finding.

Not covered by this check: the pulse probe (M5-P1 step 2, needs the pilot
reachable), and whether each later phase's file list is complete. Only
existence of the listed paths was checked; the missing ones are all files a
phase is meant to create.
