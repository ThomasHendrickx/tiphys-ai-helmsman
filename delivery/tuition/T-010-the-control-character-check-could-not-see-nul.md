# T-010: the control-character check could not see NUL

- id: T-010
- date: 2026-08-09
- discovered by: the M3-P3 hazard-lens clean-room reviewer (finding CR-001),
  then generalised by the orchestrator from the instance to the check itself
- severity: high, and it invalidates a class of past evidence rather than one file

## What happened

On 2026-08-08 this repository learned that its single ASCII check was blind to
control characters by construction, because `NUL` and `SOH` live inside
`\x00-\x7F`. The fix was a SECOND check, written into CLAUDE.md binding
convention 3:

```
grep -rP '[\x00-\x08\x0B\x0C\x0E-\x1F]' <paths>
```

On 2026-08-09 the M3-P3 hazard reviewer reported two raw NUL bytes in
`src/checks.ts`, a file that phase authored. The orchestrator had run the
prescribed check against that exact head hours earlier and it had printed
nothing. So had CI.

The check does not work. Measured, GNU grep 3.11, one byte per fixture:

| fixture | `grep -qP` | `grep -qaP` |
|---|---|---|
| `hello\x00world` | **MISSED** | detected |
| `hello\x01world` | detected | detected |
| `hello\x1bworld` | detected | detected |
| `hello world` | miss (correct) | miss (correct) |

Without `-a`, GNU grep detects a file containing NUL as binary and stops
reporting matches from it. The check therefore skips exactly the file it exists
to catch, and reports success.

## The mechanism

**A guard whose condition does not test the property that matters is green and
worthless.** This is the FIFTH recorded instance in this project (T-008's
watchdog tested existence rather than freshness; M3-P1's vendored-suite guard
asserted a file existed; `clause-map` marked R-094 discharged on a substring
occurrence; the first ASCII check was blind to control characters). It is the
red-witness rule one level up, applied to guards instead of tests.

The specific sub-shape here is narrower and worth naming separately, because it
will recur with other tools:

**A tool that CHANGES BEHAVIOUR on the property you are testing for cannot test
for it in its default mode.** grep's binary detection is triggered by NUL, and
NUL is the search target. The detector and the target are the same signal, so
the default mode is structurally incapable of reporting it. Any check whose
input handling branches on the thing being detected needs the branch disabled
explicitly, which for grep is `-a`.

## Why the 2026-08-08 incident did not reveal this

`test/status.test.ts` carried **raw NUL AND SOH**. SOH is detectable without
`-a`. So the check appeared to work, on a file that also happened to carry a
byte it could see. A single fixture would have hidden this; the four-fixture
probe above is what separated them.

This is the "one witness is not a class" rule arriving from the other
direction: one PASSING witness did not establish the class either.

## What it invalidates

Every "control characters: clean" report between 2026-08-08 and 2026-08-09,
including the orchestrator's own on multiple pull requests and CI's on every
run. They were TRUE statements about what the command returned and USELESS
statements about the property.

Re-running the corrected check over `origin/main` at `45722e3`, with the two
path-scoped exemptions applied, found:

```
delivery/review/arbitration-m3-p1.md
```

one file, one byte, at offset 8727:

```
b' genuinely needs as DATA belong in escapes (`\x00`),\nnever as l'
```

That is the arbitration document that RULED on the original NUL incident. Its
sentence saying control characters belong in escapes contains a literal NUL
inside the backticks that were meant to hold the escape sequence. It has been
on `main` since, and the branch scan additionally found `src/checks.ts` in
M3-P3.

## The fix

1. CLAUDE.md binding convention 3 now prescribes `grep -raP` for BOTH checks,
   with the measured table above so the flag is not dropped as noise by a later
   editor.
2. `delivery/review/arbitration-m3-p1.md` rewritten to describe the escape in
   words rather than embed the byte.
3. `src/checks.ts` belongs to M3-P3 and goes to that phase's fix round; it is
   not the orchestrator's to edit.

## What is NOT fixed, and is tracked rather than claimed

**No gate runs either ASCII check.** Both live only in CLAUDE.md as instructions
to agents, so they depend on every agent remembering to run them, and this
project has recorded twice that a rule depending on memory does not survive a
busy session. The hazard reviewer named this in CR-001 and it is correct.

Making it a gate means a new entry in `gate-registry.yaml`, `gates.manifest.json`
and the CI harness, which is phase work rather than an orchestrator hotfix, and
it collides with the half of R-094 that is already open (CI reads the manifest,
not the registry). It is recorded in `delivery/STATE.md` as a tracked
obligation. Until it exists, the corrected greps are a discipline and not a
guarantee, and this entry says so rather than implying otherwise.
