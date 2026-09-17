# The union script's doc comment described a three-way rule and its code did a
# two-way comparison

Found 2026-09-16 by the orchestrator, in its own tooling, while merging main
forward into `claude/m4-p11-single-family-exception`. Recorded because the
comment and the code sat eleven lines apart and disagreed, and nothing could
have caught that.

## The rule the tool exists to enforce

Three registries in this repository are append-only and resolved as a union
against the merge base, and the reason is in the binding conventions: a phase
that hand-merges a large JSON object is ten chances to drop a row silently. The
helper refuses two things outright rather than warning about them: a row present
at the merge base and absent from either side, which is a REMOVAL a union cannot
represent, and a genuine edit collision.

Its own comment defines the second as "a key whose value DIFFERS between the two
sides, WHERE AT LEAST ONE SIDE ALSO DIFFERS FROM THE BASE".

## What the code did

```
for (const key of Object.keys(ours)) {
  if (!Object.hasOwn(theirs, key)) continue;
  if (ours[key] === theirs[key]) continue;
  collisions.push({ key, ours: ours[key], theirs: theirs[key], base: base[key] });
}
```

`base` appears once, in the object it pushes, which is used only to PRINT. The
decision is `ours[key] !== theirs[key]`, a two-way comparison. A two-way
comparison cannot tell an edit collision from an ordinary one-sided edit,
because in both cases the two sides differ.

## The measurement

`claude/m4-p11-single-family-exception` was cut from
`claude/m4-p10-verdict-head-and-medium`. M4-P10 then ran three more fix rounds,
during which it RENAMED twelve tests, and merged. `test/behaviors.json` maps a
behavior id to the test's title, so those twelve descriptions changed on main
and not on the branch.

For all twelve: `ours === base`, `theirs !== base`. Nothing collided. Main had
moved on and the branch had not touched them. The union refused all twelve and
printed them under "carry DIFFERENT values on the two sides. That is an edit
collision", with the base value visible and identical to `ours` in every row,
which is what made it obvious once read.

## Why it survived

**It failed CLOSED**, and that is why this entry is short on consequences and
long on the shape. A guard that refuses too much is loud; the operator reads the
refusal and does something. The twelve rows were named, so nothing was lost and
nothing was silently mis-merged. The cost was one blocked merge and the time to
read it.

That is worth separating from the usual finding here. This repository's
recurring defect is a guard whose condition does not test the property it
claims, and the ones that have cost real time have all failed OPEN: a watcher
that reported green about a different workflow, an ASCII check that could not
see NUL, a witness that reddened for the absent feature rather than the
dangerous state. This is the same defect with the sign flipped. The lesson is
that the shape is about the CONDITION, not about the direction it fails in, and
a fail-closed instance is the cheap one to learn from.

## The fix, and the three-way rule written out

The loop now consults the base:

| relation | action |
|---|---|
| `ours === theirs` | agreed, not a conflict |
| `ours === base`, `theirs !== base` | only THEIRS edited it; take theirs |
| `theirs === base`, `ours !== base` | only OURS edited it; take ours |
| both differ from base and from each other | a real collision; REFUSE |
| absent from base, both added, values differ | a real add/add collision; REFUSE |

One-sided edits are applied and NAMED on stderr, one id per line, rather than
folded in silently. A tool that quietly picks sides is the thing this helper
exists to avoid; naming what it took keeps the merge auditable.

## The red witness, and why the first one was worthless

Two structurally different members and a control, each a real git conflict with
three index stages rather than a mock.

**The first version of the fixture never reached the code.** It changed the
registry on one side only, so git merged it cleanly, there were no index stages,
and the script exited 65 "not in a three-way conflict" on both members. Green or
red for reasons unrelated to the property under test. The real case always has a
conflict for some OTHER reason: both sides append different new rows at the same
place, which is a textual conflict and not a value collision, and the one-sided
edit rides along inside it. The fixture now builds exactly that, and prints the
index-stage count so a reader can see the script really ran.

Measured, same fixture, one variable changed (the script):

| member | before the fix | after the fix |
|---|---|---|
| A: `ours === base`, theirs edited | **exit 69, refused** | exit 0, result takes THEIRS |
| B: `theirs === base`, ours edited | **exit 69, refused** | exit 0, result takes OURS |
| C (control): both edited, differently | exit 69, refused | exit 69, refused |

C is what makes A and B mean something: the refusal still works, so the fix
narrowed the condition rather than removing it.

## What this does NOT establish

Whether the same two-way-where-three-way-is-meant shape exists elsewhere in the
orchestrator's harness scripts. I found this one by hitting it, not by looking
for it, and I have not audited the others for it. The scripts are small enough
that the audit is cheap and it has not been done.

Nor does it establish anything about the kernel's own merge handling. This
helper is orchestrator harness under `.claude/`, it is not shipped in the npm
package, and no kernel gate runs it. The rule it implements is a repository
convention that the kernel does not yet enforce in code.
