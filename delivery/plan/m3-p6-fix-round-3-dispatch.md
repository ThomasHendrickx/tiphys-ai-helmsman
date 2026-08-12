# M3-P6 fix round 3: the orchestrator's half of the brief, written before dispatch

Written while the round is BLOCKED, so that dispatch costs no thinking time when
it unblocks. The blocker is stated first because it is the only thing gating it.

## The blocker, in one line

The exit-test harness branch edits BOTH `test/m2-exit-test.test.ts` and
`scripts/m2-exit-test.sh`, which are exactly the files this fix round needs, so
the harness merges FIRST and this round is written on top of it. Dispatching
before that guarantees a second conflict in the same two files.

## What this round fixes, and how it was found

Not by either branch's CI. `main` was merged into M3-P6 locally and the union
was run: **626 tests, 624 pass, 2 fail, 0 skipped**, node v26.6.0, `dist/` built,
invocation `npm test`. Both branches are individually green. Full measurement,
including the three-way union of `test/behaviors.json` that preceded it, at
delivery/verification/m3-p6-and-the-harness-only-fail-together.md:1.

**Failure 1**, `test/implementer-brief.test.ts`, this phase's own test:
`the main bundle's --only list was not found in the harness`. The test derives
`brief-drift`'s push-arm reachability FROM the harness instead of asserting it
from memory, which is correct and its own comment says so. Its derivation is a
regex recognising six ids written out literally as `--only` arguments. Harness
round 2 replaced that shape with one declared array and a loop, so the regex now
matches nothing and the test fails on its own guard rather than on its subject.

**Failure 2**, `test/m2-exit-test.test.ts`, the harness's own test, whose CONTROL
arm fails rather than its subject: this phase takes `gates.manifest.json` from
eleven gates to twelve, and the synthetic healthy bundle builds records for a
PINNED gate set rather than deriving one from the manifest, so the twelfth gate
has no record and the control is no longer healthy. The harness is behaving
correctly.

## The mechanism, which is the point of the round

**Failure 1 and DV3-F1 are the same defect in different files**, and the
implementer should be told so rather than left to notice:

> A check's CONDITION recognises a syntactic or typed SUBSET of the class its
> MESSAGE quantifies over, so members outside that subset pass in silence.

Known instances: DV-4 (leg guard matched `...IDENTIFIER`), DV-3 (manifest guard
tested `!Array.isArray`), DV3-F1 (writes pin matched member NAMES), and now
failure 1 (push-arm derivation matched one argument spelling). Harness round 4 is
closing the class on its side. **This round should use whatever technique round 4
lands rather than inventing a second one**, so the two do not diverge; read the
round-4 work history before choosing an instrument.

Failure 2 is a DIFFERENT mechanism and must not be collapsed into the first: it
is the append-only registry antipattern at CLAUDE.md:201, a fixture pinning a set
that a later phase appends to.

## Scope, already amended

`test/m2-exit-test.test.ts` was ADDED to this phase's declaration and to the plan
text, because the scope gate reads the declaration from the MERGE BASE and the
amendment therefore had to land on `main` first. It has.

**`scripts/m2-exit-test.sh` is NOT on the list, deliberately.** The remedy for
failure 2 may lie entirely in the fixture, by deriving the gate set from the
manifest instead of pinning it. Only if the fix genuinely requires an
expectations row in that script does it become a further amendment, with its own
recorded reason. The implementer must ASK rather than assume the grant.

## What the round owes

The full fix-round contract, all three parts: the mechanism named rather than the
two instances; the derivation published in full, being the command that
enumerates every OTHER place in this phase's tests that derives a fact from
another file's text or pins a set a later phase can extend, with its complete
output; and its own section stating what the derivation did NOT cover.

Two specific traps to hand over, both paid for already in this milestone:

- **Registries assert BY NAME, never BY COUNT.** A count or a pinned set is a
  claim about every future phase. Failure 2 IS that mistake; do not fix it by
  writing a new pinned set of twelve.
- **A witness for a CLASS must redden under at least TWO structurally different
  members.** For failure 1 that means at least two different spellings of the
  harness's declaration, not just the current one.

## What this pre-written brief does NOT cover

- **It is written against a union measured at ONE pair of heads.** Round 4 will
  move `main` again and the union has to be rebuilt after it lands; the two
  failures above are what that union contained, not what the next one will.
- **It assumes the two failures are the whole set.** The run stops after
  reporting them, and fixing either could expose more. A green is established
  only by a green run.
- **The `push` arm is unreachable before merge** and nothing here discharges it.
