# T-043: a record whose STATUS WORD asserted more than the check behind it had
# looked at

**Measured:** 2026-09-18, against `main` at `cbc34f1`, reproduced through a real
`spawnTask` with a real credential store planted on disk.

**Found by:** the group B clean-room retrospective review
(delivery/review/clean-room-retro-B-criteria.md:1, finding CR-B-001, HIGH). The
class member beside it was found by the fix round's derivation
(delivery/work-history/credential-route-fixes.md:1).

## The mechanism

A record field whose value is a WORD an operator reads as a verdict, written
after a check that covered only part of what the word implies. The record is
then not merely incomplete: it POSITIVELY ASSERTS that the thing was verified.

This is the inverse of a missing artifact and it is worse, because a missing
artifact makes a reader go and look. A record that says `compared` ends the
enquiry.

## What it cost here

`compareHandover` (src/spawn.ts:378) compared the NAME SETS the kernel handed
an adapter and the adapter reported launching with, and wrote
`status: "compared"`. The comment above it gave a sound reason for not
comparing VALUES: a value comparison would put credential material into a record
an operator reads.

The reason is sound for most names and wrong for exactly five. The
`CREDENTIAL_STORE_REDIRECTIONS` are the whole M2R-004 defense and they work by
REDIRECTING `HOME`, `XDG_CONFIG_HOME`, `GH_CONFIG_DIR`, `GIT_CONFIG_GLOBAL` and
`GIT_CONFIG_SYSTEM` into the task directory, never by dropping them. So an
adapter that keeps the name set BYTE-IDENTICAL and only puts those values back
hands the child every default credential path again, and the name-set comparison
structurally cannot see it.

Three real spawns, one honest adapter each, against the unfixed kernel:

```
1 HOME+XDG reverted     spawn ok: true   meta.handover: {"status":"compared","added":[],"removed":[]}   child verdict: "red"
2 GIT_CONFIG_GLOBAL rev. spawn ok: true  meta.handover: {"status":"compared","added":[],"removed":[]}   child verdict: "red"
3 honest adapter        spawn ok: true   meta.handover: {"status":"compared","added":[],"removed":[]}   child verdict: "green"
```

**The three records are byte-identical and two of the three children are red.**
The child's own probe reported the gh credential store reachable from inside the
payload while `meta.json` said the handover was compared and clean.

## The second member, which is why this is a class

The derivation enumerated every string-literal-union field in the shipped kernel
and every field whose NAME asserts a verification. It found one more in the SAME
record: `scrubMode: "scrubbed"` (src/task.ts:349). "Scrubbed" is a strong word.
What the field records is that the kernel CHOSE to scrub and that
`buildChildEnv` returned. It says nothing about what the child received, because
between that field being written and the payload starting there is an adapter.

The two members are structurally different: one is a comparison's verdict
covering one of two properties, the other is a construction's verdict standing
in for a delivery.

## The repair, and BOTH halves are needed

1. **Weaken the WORD so it can only say what was checked.** Costs nothing,
   asserts correctly, and is NOT sufficient on its own: it stops the record
   lying and does not stop the adapter. The handover vocabulary is now
   `compared`, `names-compared`, `pointers-compared`, `unreported` and
   `not-applicable`, so the value names which of the two properties it covered.
2. **Strengthen the CHECK so the other property is checked too.** The five
   redirection pointers are compared by value. The constraint the original
   design was protecting is untouched: only the NAMES that differ enter the
   record, never a value.

**Prefer an observation the guard's own side can make over a report from the
side being guarded.** The pointer evidence is taken from the turn-end record,
which the KERNEL generates and which runs in the child's environment, and the
adapter's own report is kept only as a weaker fallback. The record says which
source it used, so a reader can grade the evidence instead of trusting a word.

## The test that keeps this honest

`status` is a closed vocabulary, so a fresh reader can enumerate what a value
claims. Where a field carries a word rather than a count, ask the one question
this entry exists for:

**If every check behind this field were removed except the cheapest one, would
this value change?**

If it would not, the word is stronger than the check. A COUNT does not have this
failure mode, which is why `checked: number` (src/gates/coverage.ts:747) is the
honest shape wherever it is available.
