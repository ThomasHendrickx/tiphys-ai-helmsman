# M3-P9 declaration gap: one forced test edit, granted with the measurement behind it

- date: 2026-08-13
- author: orchestrator
- grants: `test/gate-registry.test.ts` as a `declaredExtras` entry on M3-P9
- precedent: the same shape was granted to M3-P8 as `e3aad93`

## Why a grant was needed at all

The scope auditor derives a phase id from the branch name and requires every
changed path to be on that phase's declaration. `test/gate-registry.test.ts` is
not on M3-P9's, and the phase cannot have a green suite without editing it.

The implementer measured this, named it, and did NOT amend its own declaration.
That is the correct division: an implementer that grants itself scope has
removed the only check on scope there is.

## The mechanism, which is the reason this keeps happening

CLAUDE.md:233 already states it: **a test over an append-only registry asserts
BY NAME and never BY COUNT, and never on a specific row's presence.**

`gate-registry.yaml` is append-only across phases. `test/gate-registry.test.ts`
holds a map whose KEY SET is compared with `deepEqual` against the registry's
script gates that are absent from `gates.manifest.json`. A set equality against
an append-only registry is a claim about every future phase, and it is false the
moment the next phase appends. M3-P9 is the phase that appends.

**This is not a one-off, and saying so is the point of writing it down.** The
same test would redden for M3-P10 in the same way, for the same reason. The
grant below fixes M3-P9's instance; it does not fix the mechanism, and the
mechanism is now a tracked item.

## The measurement

Captured by the implementer at its branch, with only the two new
`gate-registry.yaml` entries added and nothing else written, node v26.6.0 with
`dist/` built, invocation `node --test test/gate-registry.test.ts`:

```
AssertionError [ERR_ASSERTION]: a script gate is declared in gate-registry.yaml
and absent from gates.manifest.json with no recorded reason; CI runs the
MANIFEST, so that gate does not run in CI
    [
      'agent-rules-drift',
  +   'check-agents-references',
  +   'check-dual-review'
    ]
```

The full capture, with its transliteration note and its statement of what the
derivation did not cover, is in the phase work history on the branch.

## Why the citation to the failing line is QUOTED and not resolved

The failure is at `test/gate-registry.test.ts:1039` on the M3-P9 BRANCH. That
citation is written in backticks deliberately, because this document lands on
`main` and the gate resolves citations against the tree being linted.

The trap is not that it would redden. `test/gate-registry.test.ts` is 1136 lines
on `main`, so 1039 is IN RANGE and would resolve **silently**, against the old
version of the file, pointing at a line that is not the line under discussion. A
citation that reddens announces itself; one that resolves against the wrong
version does not. Measured before writing this, not assumed.

## What this grant does NOT do

- **It does not widen `filesToTouch`.** It adds one `declaredExtras` entry and
  nothing else. Any further out-of-declaration file needs its own grant with its
  own measurement.
- **It does not endorse the edit.** The implementer still owes a red witness for
  whatever it changes there, and the reviewer still audits it. A scope grant is
  permission to touch a file, not agreement about what is done to it.
- **It does not fix the mechanism.** The set-equality assertion remains, and the
  next phase to append to `gate-registry.yaml` will hit it again unless the test
  is rewritten to assert by name. It is added to
  `delivery/review/tracked-findings-register.md` in this same commit, so it is
  recorded rather than scheduled. That path is quoted rather than cited because
  this branch CHANGES that file, and a citation resolves against the tree being
  linted.

## Second grant: `test/checks.test.ts`, and this one is TERMINAL

- date: 2026-08-13, added after the implementer handed back
- grants: `test/checks.test.ts` as a second `declaredExtras` entry on M3-P9

The first grant above says "any further out-of-declaration file needs its own
grant with its own measurement". This is that grant, and the measurement is
below rather than referenced.

### Why it is not the same finding twice

The `gate-registry.test.ts` instance is a set equality that reddens for
WHICHEVER phase appends next. This one is different in a way that matters: it
reddens from M3-P9 ONWARDS, permanently, and no future phase can make it pass
again.

`test/checks.test.ts` has a test named for a row whose phase is not yet in
force being reported pending. It read whatever the REAL tree happened to have
pending. "Some row is pending" is true only while some phase owns inventory
rows and has not yet created its anchor artifact.

**M3-P9 is the phase that exhausts the inventory.** Measured at its head by the
orchestrator, independently of the implementer's own count, by grouping
`delivery/requirements/clause-map.json` by phase:

| phase | rows |
|---|---|
| M3-P1 | 12 |
| M3-P2 | 3 |
| M3-P3 | 3 |
| M3-P4 | 9 |
| M3-P5 | 7 |
| M3-P6 | 13 |
| M3-P7 | 13 |
| M3-P8 | 3 |
| M3-P9 | 11 |
| **M3-P10** | **0** |

74 rows over nine phases. M3-P10 owns none. So from the moment `AGENTS.md`
exists the real tree reports zero pending, at this head and at every head after
it. The assertion was not red FOR M3-P9; it was red FROM M3-P9 onwards.

### Why the repair is accepted rather than merely permitted

The implementer did not pin a new expectation. It CONSTRUCTS the pending state
in a staged copy: it removes one phase's rows and that phase's anchor artifact,
reproducing the tree shape that exists before a phase lands, and it DERIVES
which phase to suppress (one whose rows all discharge into a single artifact)
rather than naming one. Naming a phase would have reintroduced the pin the
repair exists to remove. Nothing in the working tree is touched.

That is strictly stronger than what was there, and it is the by-name discipline
at CLAUDE.md:233 applied rather than quoted.

### What this second grant does NOT do

- **It is not a general grant.** A third out-of-declaration file still needs a
  third grant.
- **It does not verify the repair.** The reviewer audits what was written; this
  records why the file could be touched at all.
- **The row counts are from the M3-P9 BRANCH head, not from `main`.** M3-P9's
  own eleven rows do not exist on `main` yet. Re-running the grouping against
  `main` gives 63 rows over eight phases, M3-P1 through M3-P8, with M3-P10 at
  zero. That second number was MEASURED against `main` rather than obtained by
  subtracting eleven from seventy-four, because an arithmetic identity and a
  fact about a file are different claims and only one of them survives a row
  being added somewhere unexpected. The conclusion is unchanged on both sides:
  M3-P10 owns no clause-map rows.
