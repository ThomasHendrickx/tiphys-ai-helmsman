# T-042: a refusal predicate that only fires on a PRESENT-but-invalid value,
# so an ABSENT one is accepted

**Measured:** 2026-09-18, against `main` at `cbc34f1`, reproduced through a real
`spawnTask` before anything was changed.

**Found by:** the group B clean-room retrospective review
(delivery/review/clean-room-retro-B-criteria.md:1, finding CR-B-002, HIGH), then
re-reproduced and generalised by the fix round
(delivery/work-history/credential-route-fixes.md:1).

## The mechanism

A guard written as

```
if (value !== undefined && isInvalid(value)) { refuse }
```

conjoins a PRESENCE test with a VALIDITY test, so it can only refuse a value
that arrived. A field the contract calls mandatory and the type system calls
optional reaches it as `undefined` and is silently excused.

The shape is the parent class this repository keeps paying for, one level down:
a guard whose condition does not test the property that matters is green and
worthless (T-008's postscript, the red-witness rule one level up). What makes
this member worth its own entry is that the guard READS AS CORRECT. It names
the right field, it produces a good refusal sentence, and it has a passing test
behind it, because the test supplies a value.

## What it cost here

`refuseExtraAllowlist` (src/exec/env.ts:227) guarded the blank-reason refusal
with `reason !== undefined && reason.trim().length === 0`. `extensionReason`
returns `undefined` for a bare string entry and for an object with no `reason`
property. So on the audited credential route, with `payloadClass: "project"`,
a real spawn accepted a write-capable token with NO recorded reason, three
members deep:

```
bare string                        ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{}]
object, reason property absent     ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN"}]
object, reason not a string        THREW    | TypeError: reason.trim is not a function
object, reason blank (control)     refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
```

That defeats DR-0039 condition 2 and M4-P8 criterion 4, which are the owner's
standing constraint that a write-capable credential is never handed to an
implementer, enforced BY CODE rather than by a promise. The third member is
worse than the two the review reported: a non-string reason was not a refusal at
all, it was an uncaught `TypeError` out of `spawnTask`.

## The second reason it survived: a compile-time argument about a runtime seam

delivery/work-history/m4-p8.md:621 recorded HALF of this and then closed it:
"The audited route cannot produce one: `SpawnOptions.extraAllowlist` is typed to
the object form and a string does not typecheck there."

The SAME PHASE rejected that argument one field over. `payloadClass` is a
runtime check precisely because, in that phase's own words, "the consumer that
reaches this seam is a JavaScript plugin, and a missing field there is
`undefined`, not a compile error". A type is not a guard at a seam a plugin
reaches, and the phase held the right principle without applying it to the
adjacent field.

The binding claim grep did not catch the sentence either: its vocabulary carries
`cannot be` and the sentence says `cannot produce`. The single-word phrases
(`never`, `always`, `impossible`) are effectively immune; the multi-word ones
are the exposed set, and this is one more word for that list.

## The repair, and it is mechanical

Write the POSITIVE validity predicate and then decide what to do with its false
arm, so absent, blank and wrong-typed all reach the same place by construction:

```
const usable = typeof value === "string" && value.trim().length > 0;
if (!usable) { refuse, naming WHICH of the three it was }
```

This repository already spells it that way where it got it right, for instance
src/cutover.ts:140 and plugin/src/hooks/project-write-block.ts:629, and it had
already repaired one instance of the defect: the migrations adapter refuses a
matched row that exposes NO applied checksum in a separate arm
(src/gates/adapters/migrations-command.ts:355), citing M2-C-3, "an unchecked
assumption never becomes a green".

**And do not give the requirement a DEFAULT.** Where two callers want different
strictness, pass the requirement explicitly at both, because an omitted argument
taking the permissive arm is the same mechanism one level up.

## How to find the rest of them

The literal grep is a starting point and not the answer: the shape is spelled
several ways. The derivation that enumerated them is published in full at
delivery/work-history/credential-route-fixes.md:1, three commands over `src/`,
`bin/` and `plugin/src/`. The discriminator that separates a defect from a
correct optional field is ONE question, and it is the useful half of this entry:

**Is the field mandatory by its own contract, with no separate arm elsewhere
that handles its absence?**

An absent `expectedUnits` means "no expectation was configured", which is a
legitimate state. An absent `reason` means "the entry broke a contract its own
doc comment states", which is not.
