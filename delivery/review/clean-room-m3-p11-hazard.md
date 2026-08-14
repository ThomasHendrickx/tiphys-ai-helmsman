# Clean-room hazard review: M3-P11 (precondition crash verdict)

Reviewer: second clean-room reviewer, lens HAZARD (can the gate still lie).
Branch under review: `claude/m3-p11-precondition-crash-verdict`, head a73313d, PR #137.
This review branch: `claude/review-m3-p11-b`, cut from `origin/main` at 57bafe9
(tuition T-019: never cut evidence from the branch being reviewed).

Citations below point into files the reviewed branch CHANGES
(`git diff --name-only origin/main...claude/m3-p11-precondition-crash-verdict`),
so per CLAUDE.md:155 they are quoted in backticks rather than left as bare
`path:line` tokens, which would resolve on `main`'s shorter/older versions of
these files.

## Not covered

- I did not re-review the `delivery/`-paperwork or `CLAUDE.md` acceptance-
  criteria walkthrough; the task explicitly scopes this round to hazard on
  the three shipped files, and a second concurrent reviewer covers the
  criteria walk.
- I did not run the CI workflow (`gh`/`GH_TOKEN` are unusable per the task
  brief) and make no claim about the PR's actual CI status. Everything below
  is measured locally, either against the phase branch's own worktree/dist
  build or against a real `npm pack` extraction.
- I did not attempt to break `credential-scrub`, `citations`, `coverage`,
  `deploy`, `migrations`, `clause-map`, or `red-witness`'s own internal logic;
  they are gates whose OWN command scripts were used only as fixtures for
  probing the runner around them, not audited themselves.
- I did not fuzz the four-part `commandPathOperands` rule exhaustively. I
  targeted the shapes the task named plus the ones the implementer's own
  residue list named, and one shape the implementer's residue list does not
  name (the unreadable operand, below). A wider fuzz of argv shapes (quoted
  substrings, `=`-joined long options such as `--manifest=x`, multi-byte
  paths) was not attempted and may hold more of the same class.
- I did not test on a real multi-user filesystem with mismatched UID/GID
  ownership (only local `chmod 000` plus `sudo -u ubuntu`, which is a good
  enough proxy for "this process cannot read that file" but not identical to
  an NFS/container UID-mapping failure).
- I did not review `witness/*.json` witness-spec wiring against `red-witness`
  rule (b) in detail; the second reviewer's criteria walk is better placed for
  that.
- `gates.manifest.json` is unaffected by this phase and was not attacked as
  a manifest; only the RUNNER'S handling of manifest-shaped input was probed.
- The consumer-view check (section 4) ran the shipped `gates.manifest.json`'s
  twelve gates; it did not additionally run `gate-registry.yaml`'s 30-command
  superset the implementer's own false-positive derivation covers.

## Environment

```
$ export PATH=".../scratchpad/toolchain/node-v26.6.0-linux-x64/bin:$PATH"
$ node --version
v26.6.0
```

Worktrees used (all under my scratch directory, none touching the primary
repository checkout per the task's instruction):

- `scratchpad/review-b`: this review branch, cut from `origin/main`.
- `scratchpad/phase-p11`: detached worktree at the reviewed branch's head
  (a73313d), read-only, used to read source, build, and run the phase's own
  suite.
- `scratchpad/consumer/kernel`: a real `npm pack` extraction of the phase
  branch's package, `npm install`ed, used for the consumer-view checks.
- `scratchpad/hazard`, `scratchpad/e2e-hazard`: hazard fixtures.

Build and suite, phase branch, node v26.6.0, `npm run build` run first (so no
skip axis applies), invocation `npm test`:

```
tests 778
pass 778
fail 0
skipped 0
duration_ms 200859.522483
```

778 pass, 0 fail, 0 skipped is a green suite on the built-toolchain axis. I
did not additionally run the default (`bash -lc`, floor-gated) toolchain axis
or the bare `node --test` invocation axis; the `npm test` axis is sufficient
for this hazard round's purposes and is stated as exactly that, not as "CI is
green" (T-009).

---

## Summary of verdict

**REQUEST CHANGES**, on one HIGH finding (H-1: an undisclosed operand-
readability gap that reproduces the exact defect this phase exists to close)
and one MEDIUM finding (M-1: a directory-prefix scope grant disclosed as a
single terse line). Everything else attempted against changes 2 and 3 (the
scope-gate boundary and anti-widening rules) held; I could not make either
lie. See "What did NOT break" below.

H-1 is fixable in-phase (extend `probeCommandRunnable`'s operand check to a
readability probe, symmetric with the existing executable-bit check on the
launcher) and does not require reopening change 2 or change 3. I recommend a
fix round rather than accepting it as a residue, because unlike the four
residues the implementer already named and defended as "chosen to protect a
real declaration in this repository" (the after-option, whitespace, no-slash,
and PATH-launcher cases), the unreadable-operand gap protects nothing: no
declaration in this repository depends on an operand being probed-but-
unreadable, and closing it costs one more `statSync` and one more bitmask
check, the same shape of code already written for the launcher three lines
away.

---

## 1. Making the gate lie: precondition wrong-verdicts

### The mechanism, stated once

`probeCommandRunnable` (`src/gates/run.ts:729`) decides "could this run" by
checking, for the launcher and for every argv element `commandPathOperands`
selects (`src/gates/run.ts:696`), whether `classifyEntry` finds it absent,
dangling, or irregular. For the LAUNCHER only, it additionally checks the
mode bits are executable (`src/gates/run.ts:766`-`774`). For an OPERAND, once
`classifyEntry` reports `regular`, the probe is satisfied and moves on: **no
operand is ever checked for READABILITY.**

That asymmetry is not academic. `evaluatePrecondition`'s `command-exit-zero`
arm (`src/gates/run.ts:920`-`948` in this branch) decides `met`/`unmet`
purely from `spawnSync`'s exit status once the probe has passed. When `node`
launches successfully (so `spawnSync`'s own `.error` stays `undefined`, the
launcher genuinely ran) but then fails to OPEN the operand file it was told
to run, the resulting nonzero exit is read as `unmet`, i.e. `not-applicable`.
That is verdict-for-verdict the exact defect the phase's own opening sentence
names: "the gate said `not-applicable` when the gate had crashed."

### H-1 (HIGH): an operand that exists, is a regular file, and is unreadable is reported runnable, and the real spawn then produces a wrong verdict

This shape is in NONE of the four residues the work history's "Residues, open
questions" section 3 names (after-an-option, carries-whitespace, no-slash,
PATH-resolved-launcher). It is not a probe-scope limitation; it is the probe
checking existence and TYPE and never checking the one remaining precondition
for a successful `open()`, permission.

Proven three ways, weakest to strongest.

**(a) The probe function alone**, run as a non-privileged user (`sudo -u ubuntu`,
since root bypasses DAC read checks and would falsely "pass" this test):

```
$ chmod 000 unreadable.mjs
$ sudo -u ubuntu stat -c '%a' unreadable.mjs
0
$ sudo -u ubuntu node probe_runnable.mjs node .../unreadable.mjs
{
  "runnable": true,
  "reason": "",
  "probed": [".../unreadable.mjs"]
}
```

**(b) The real spawn**, same file, same user, showing the probe's answer is
wrong:

```
$ sudo -u ubuntu node -e "spawnSync('node',['.../unreadable.mjs'],...)"
{"status":1,"stderr":"...Error: EACCES: permission denied, open '.../unreadable.mjs'\n...","stdout":""}
```
`status` is 1, `error` is absent (the launcher `node` ran fine). That is
precisely the shape the phase's own derivation table calls out as
indistinguishable from a legitimate refusal, reproduced for a cause the probe
was supposed to rule out.

**(c) End to end, through the real shipped CLI**, `npm pack`ked, extracted,
`npm install`ed, run as `ubuntu` against a one-gate manifest whose precondition
names the unreadable script:

```
$ sudo -u ubuntu node dist/bin/tiphys.js gates run --manifest manifest-unreadable.json --evidence ev-unreadable
gates: demo-unreadable-gap: not-applicable: precondition demo-unreadable-precondition evaluated and unmet: node .../unreadable-precond.mjs exited 1
gates: no applicable gate
```

The shipped binary, run by an account other than the file's owner, reports
`not-applicable` for a precondition command that never ran the code it was
supposed to evaluate. A consumer reading that verdict is told "this gate does
not apply here," when the true state is "this gate could not be evaluated,"
which is the wrong side of the exact distinction DR-0029 calls the actual
product.

**Consumer-visible thing that breaks:** any `command-exit-zero` precondition
whose command names a script that exists but that the runner's process cannot
read (wrong owner, restrictive umask, a permissions regression introduced by
packaging/extraction/CI-runner UID mapping, a secrets file deliberately
`chmod 600` by someone else) is silently downgraded from "this crashed, look
at it" to "this legitimately does not apply," with no operator-visible sign
that anything went wrong. That is a false negative on a gate meant to guard
against exactly false negatives.

### H-1-adjacent, CONFIRMED not merely asserted: two of the four disclosed residues really do produce wrong verdicts, not just unhelpful messages

The work history's residue 3 (delivery/work-history/m3-p11.md, prose, not
independently demonstrated there against the real CLI) asserts these are
"a place a genuinely unrunnable command would still be read as unmet." I
verified two of the four end to end against the packed CLI rather than taking
the assertion on faith, because CLAUDE.md's fix-round contract treats an
undemonstrated claim as unknown:

**Operand after an option** (`node --flag script.mjs`; `commandPathOperands`
skips any element whose PREDECESSOR starts with `-`, `src/gates/run.ts:710`),
missing script, real shipped CLI:

```
$ node dist/bin/tiphys.js gates run --manifest manifest-flag.json --evidence ev-flag
gates: demo-flag-gap: not-applicable: precondition demo-flag-precondition evaluated and unmet: node --no-warnings .../does-not-exist-at-all.mjs exited 1
```

**Operand carrying whitespace** (`commandPathOperands`'s fourth guard,
`src/gates/run.ts:696`-`714`), missing script with a space in its name, direct
probe plus real spawn:

```
probe: runnable=true, probed=[]   (the operand was never examined)
spawn: status=1, error=undefined
```

Both are the SAME mechanism as H-1: an argv position the four-part rule
declines to examine, followed by a real crash the exit-code-only fallback
reads as a legitimate skip. I did not additionally reproduce the fourth
residue (no-slash operand); by the rule's own definition a no-slash element is
one that, in the `gates.manifest.json` entries I inspected (`--pin-root src`,
`.` for `check-dual-review`), is not intended as a path in the first place, so
its risk there is lower. I did not check all 30 commands the implementer's own
false-positive derivation covers (`gate-registry.yaml` in full mode plus the
manifest), only the 12 in the shipped manifest, so this is a narrower claim
than "every declaration in the repository," stated as such.

### What did NOT reproduce a wrong verdict (worth stating, not just asserted)

**A GATE's own command (not a precondition) is immune to all of the above**,
by a different and more robust mechanism: `ingestGateRun`
(`src/gates/run.ts:1179` onward) decides `error` from the ABSENCE of a
written result record, never from the exit code, so a crash for any reason
(missing operand after a flag, unreadable operand, throws-at-import) still
correctly reaches `error`, only with the generic pre-M3-P11 message ("gate X
exited N without writing a result record") instead of the new precise one.
Confirmed against the packed CLI:

```
$ node dist/bin/tiphys.js gates run --manifest manifest-gate-flag.json --evidence ev-gate-flag
gates: demo-gate-flag-gap: error: gate demo-gate-flag-gap exited 1 without writing a result record at .../result.json
```

So the severity split the task asked for is real and mechanical, not a
judgment call: **for a precondition (`command-exit-zero`), an argv position
the probe skips is a WRONG VERDICT; for a gate's own command, the identical
gap is only an UNHELPFUL MESSAGE**, because the gate path has a second,
independent safety net (the record file) that the precondition path does not
have and structurally cannot have (a precondition has no record of its own to
write).

- Directory as operand, dangling symlink as operand: correctly `error`,
  reason names the type (`.../dirop is a directory, not a regular file...`,
  `.../danglingop.mjs is a symbolic link whose target does not exist...`).
- Missing launcher via bare `PATH` name, non-executable launcher, launcher
  with a bad shebang: correctly `error`, via `spawnSync`'s own `.error`
  (unchanged pre-M3-P11 behaviour, and the phase's own derivation table
  measures exactly this).
- `isPhaseOwnEvidence`'s boundary rule (below) and `compareDeclarations`'s
  removal/addition split (below): held against everything I tried.

### LOW / TRACKED: the new stdout stream's line-forgery defense is real but not airtight

`src/commands/gates.ts:213`-`217` prints one line per non-green row and
passes `detail` through `singleLine` specifically, per its own comment, so a
gate's multi-line detail "cannot forge additional `gates:` lines in this
stream." Verified that claim holds for embedded `\n` (folded to `"; "`,
confirmed by reading `src/task.ts:429`'s `singleLine`, which `split("\n")`s
and rejoins). It does NOT strip a bare `\r` with no paired `\n`: `"a\rb".trim()`
only trims the string's ends, so a mid-string `\r` survives into the printed
line. A `detail` string a gate script controls (not an external attacker;
gate scripts are already-trusted manifest content, so this is defense-in-
depth rather than a live exploit path) could therefore embed a carriage
return to visually overwrite the start of its own printed line on a real
terminal. This does not change the machine-readable verdict (the JSON record
is unaffected) and requires a gate already privileged enough to control its
own `detail`, so I am not raising it as a scored finding; recorded as
TRACKED because the comment's claim ("cannot forge additional lines") is true
for `\n` and silently narrower than it reads for `\r`.

---

## 2. Attacking change 3: the declaration-delta scope widening

`compareDeclarations` (`src/gates/scope.ts:612`) diffs exactly the three
array fields of `PhaseDeclaration` (`filesToTouch`, `declaredExtras`,
`citations`) plus the two scalars (`id`, `branch`) as an all-or-nothing
removal. I confirmed this is the FULL field set (`src/gates/scope.ts:208`-
`214` declares no other fields), so there is no sixth field a branch could
widen invisibly.

Tried and held:

- **Removal via rename.** An entry present in `filesToTouch` at the merge
  base and absent at the head (moved to a new string, or deleted outright)
  shows up in `delta.removed` because the diff is a Set-membership diff per
  field: the OLD string vanishing from the head's set is a removal regardless
  of what else was added. `test/scope-gate.test.ts`'s change-B test walks this
  exact case (declaration widened AND authorized at head, both arms green/red
  as expected) and I re-derived the same result by hand against
  `compareDeclarations` directly.
- **Whole-declaration deletion.** Handled as a distinct arm
  (`src/gates/scope.ts:905`-`918`), not folded into "no delta"; reddens
  naming the merge-base and head shas.
- **Field-mismatched move** (moving an entry from `filesToTouch` to
  `declaredExtras` with the identical string): produces BOTH a `removed` and
  an `added` entry for the same string, since the diff is per-field. That
  reddens the run (any `removed.length > 0` is red), which is a false
  POSITIVE for a harmless paperwork move, not a hole; noted only because a
  future author might read the two-entry output and wrongly suspect a bug in
  the diff rather than in their own edit.

**M-1 (MEDIUM): a directory-prefix addition is one printed line for
unbounded scope.** `isAllowed` (`src/gates/scope.ts`, pre-existing, unchanged
by this phase) treats any `filesToTouch`/`declaredExtras` entry ending in `/`
as a PREFIX, matching every path under it. `compareDeclarations` prints such
an entry exactly like any single-file addition:

```
compareDeclarations(
  {filesToTouch:["src/a.ts"], ...},
  {filesToTouch:["src/a.ts","src/"], ...},
)
=> { added: ["filesToTouch src/"], removed: [] }
```

That single line, `filesToTouch src/`, is technically "printed by name" as
change 3 promises, but it grants the SAME scope as if every current and
future file under `src/` had been listed individually, in a detail string
whose whole design intent is a human scanning for one anomalous entry among
several. **Consumer-visible thing that breaks:** a phase can self-authorize
write access to an entire directory tree, in the same PR that then uses it,
disclosed as a string indistinguishable in length and shape from a genuine
single-file addition. This is the exact mechanism the module's own comment at
`src/gates/scope.ts:105`-`118` warns about generically ("a reviewer who
ignores the printed line gets no protection from it at all"), but the
directory-wildcard case means one ignored line costs far more than the
comment's framing implies (one file vs. an unbounded and growing set). I am
not aware this needs a code change; it may be enough for the printed line to
say `filesToTouch src/ (a DIRECTORY PREFIX, not a single file)` so the
reviewer's scan does not have to already know `isAllowed`'s semantics to
notice the difference in kind. Recording as MEDIUM because it is disclosed
(not a lie) but disclosed in a way a reasonable reviewer could reasonably
miss, which is the criterion the task asked me to apply.

---

## 3. Attacking change 2: the phase-own-evidence boundary rule

`isPhaseOwnEvidence` (`src/gates/scope.ts:557`) requires, in order: the path
sits directly under `delivery/review/` or `delivery/verification/` (one level,
no nested directory swept in); the basename (case-folded) starts with one of
`""`, `clean-room-`, `arbitration-`, `verification-`; what follows the prefix
starts with the phase id (case-folded) followed by `-`, `.`, or end-of-string.

I tried every shape the task named directly against the function:

| attack | path | phase | result |
|---|---|---|---|
| shorter phase claims longer phase's doc | `delivery/review/clean-room-m3-p11-hazard.md` | `m3-p1` | false |
| longer phase claims shorter phase's doc | `delivery/review/clean-room-m3-p1-hazard.md` | `m3-p11` | false |
| no boundary char, numeric run-on | `delivery/review/m3-p110-something.md` | `m3-p11` | false |
| no boundary char at all | `delivery/review/m3-p11xhazard.md` | `m3-p11` | false |
| nested directory | `delivery/review/sub/m3-p11-x.md` | `m3-p11` | false |
| literal `..` inside the path string | `delivery/review/../verification/m3-p11-x.md` | `m3-p11` | false |
| directory-case mismatch | `DELIVERY/REVIEW/m3-p11-hazard.md` | `m3-p11` | false |
| basename-case mismatch (both sides folded) | `delivery/review/M3-P11-hazard.MD` | `m3-p11` | **true** (intended: case-insensitive basename match is a stated leniency, not a cross-phase leak, since the id substring still has to match) |

I could not find an input where a document belonging to one phase id is
accepted as another phase's own evidence, or where the directory/nesting
constraint is bypassed. `test/scope-gate.test.ts`'s four-arm test over this
exact boundary (own evidence, another phase's evidence, the `m3-p1`/`m3-p11`
prefix trap, and one-level-nested evidence) matches what I found by direct
attack; I did not just re-read that test and trust it, I ran the function
against inputs of my own choosing that the shipped test does not use verbatim
(the `..`-in-string case, the directory-case-mismatch case, and the
`m3-p110`/no-boundary-char case are mine, not the test's).

**No finding here.** This is a place I looked hard for a hole, per the task's
priority-3 instruction, and did not find one. Stating that plainly rather than
manufacturing a finding.

---

## 4. Consumer view: real `npm pack`, real extraction, real `npm install`

```
$ npm pack --silent   # inside the phase branch's worktree, dist/ already built
tiphys-kernel-0.0.0.tgz
$ tar xzf tiphys-kernel-0.0.0.tgz -C .../consumer && mv .../consumer/package .../consumer/kernel
$ cd .../consumer/kernel && npm install --omit=dev --quiet
added 10 packages
```

The packed tree ships `dist/`, `gates.manifest.json`, `gate-registry.yaml`
and the root paperwork directories, and deliberately excludes `dist/node_modules`
(`!dist/node_modules` in `package.json`'s `files`) and, more importantly for
this check, `bin/`, `src/`, and `scripts/` as `.ts`/`.mjs` source: the shipped
`gates.manifest.json`'s eleven commands still name `bin/tiphys.ts`,
`src/gates/*.ts`, and `scripts/*.mjs`, none of which exist in a real installed
copy of this package. This is exactly the M3-P9-inherited "registry whose
commands cannot run in a consumer tree" case the task pointed at, now run for
real rather than assumed.

```
$ node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence ev1
gates: declared 12 applicable 0 verdict 0 green 0 red 0 not-applicable 4 error 8 vacuous 0
gates: manifest-self-check: error: gate manifest-self-check could not be run: bin/tiphys.ts does not exist (resolved to .../kernel/bin/tiphys.ts)
gates: coverage: not-applicable: precondition coverage-inventory-exists evaluated and unmet: delivery/requirements/migration-table.md does not exist
gates: credential-scrub: error: gate credential-scrub could not be run: src/gates/credentials.ts does not exist (resolved to .../kernel/src/gates/credentials.ts)
gates: credential-token: not-applicable: precondition implementer-token-present-owner-action-a-3 evaluated and unmet: node -e process.exit(...) exited 1
gates: suite: error: gate suite requires --base, which was not supplied
gates: citations: error: gate citations requires --base, which was not supplied
gates: scope: error: gate scope requires --base --head --phase, which was not supplied
gates: deploy: not-applicable: precondition ... (STRUCTURAL, pre-merge) evaluated and unmet: release-verification.json does not exist
gates: migrations: not-applicable: precondition ... (STRUCTURAL, pre-merge) evaluated and unmet: release-verification.json does not exist
gates: clause-map: error: gate clause-map could not be run: scripts/check-clause-map.mjs does not exist (resolved to .../kernel/scripts/check-clause-map.mjs)
gates: red-witness: error: gate red-witness requires --base --head, which was not supplied
gates: brief-drift: error: gate brief-drift could not be run: scripts/check-brief-drift.mjs does not exist (resolved to .../kernel/scripts/check-brief-drift.mjs)
gates: 8 gate(s) reported error: manifest-self-check, credential-scrub, suite, citations, scope, clause-map, red-witness, brief-drift
```

`declared 12`, `not-applicable 4 + error 8 = 12`, matching the manifest's gate
count (four printed facts settle a bundle-level read per CLAUDE.md's own
method; here I have the per-gate lines directly, which is stronger). Re-run
with `--base --head --phase` supplied (a scratch git repo, branch `master`, so
the branch-shaped preconditions are legitimately unmet rather than erroring on
missing parameters):

```
gates: declared 12 applicable 0 verdict 0 green 0 red 0 not-applicable 7 error 5 vacuous 0
gates: suite: error: gate suite could not be run: src/gates/suite.ts does not exist (resolved to .../kernel/src/gates/suite.ts)
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated and unmet: branch master does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: citations: not-applicable: precondition citations-diff-touches-documents evaluated and unmet: no changed path under ...
gates: red-witness: not-applicable: precondition red-witness-diff evaluated and unmet: no changed path under src/, bin/
```

**Result: the six gates whose commands name an unshipped path
(`manifest-self-check`, `credential-scrub`, `suite`, `clause-map`,
`brief-drift`, and `citations`/`scope`/`red-witness` in the first run before
their real preconditions could even be reached) all report `error` naming the
exact missing path, in both the record and, new this phase, on stdout.** None
of them silently reports `not-applicable`. The four/three gates that DO report
`not-applicable` (`coverage`, `credential-token`, `deploy`, `migrations`, and
`scope`/`citations`/`red-witness` once given real git plumbing) do so for
genuinely unmet, structurally-expected preconditions (files that legitimately
do not exist pre-merge, a branch name that legitimately does not match), which
is the honest skip this phase is careful not to break.

This is the strongest evidence in this review, because it is the actual
shipped artifact, run by `npm install`, not a source-level shortcut. The
consumer-facing half of DR-0029's "actual product" claim holds under this
test: **a consumer running these registries against a real installed package
gets `error`, honestly, never a silent `not-applicable`, for the packaging gap
M3-P9 left behind.**

The two wrong-verdict hazards from section 1 (H-1 and the confirmed
after-option/whitespace residues) are NOT visible in this particular consumer
scenario, because none of `gates.manifest.json`'s current preconditions use an
option-before-operand or an unreadable-operand shape; they were demonstrated
against synthetic manifests built for that purpose. Both are real risks for
future consumer-authored `command-exit-zero` preconditions, not risks in this
repository's current shipped registry today. That distinction is stated
explicitly because DR-0027 asks for the shipped-behavior-at-risk to be named
precisely, not gestured at.

---

## Findings, by severity

**H-1, HIGH.** An operand of a `command-exit-zero` precondition that exists,
is a regular file, and is unreadable by the runner's process is reported
`runnable: true` by `probeCommandRunnable`; the real spawn then crashes
(EACCES on open, no `spawnSync` `.error`) and the crash is read as a
legitimate `unmet`, i.e. `not-applicable`. Reproduced against the function
directly, against a raw `spawnSync`, and end to end against the real shipped
`npm pack` CLI run as a non-root user. Not named anywhere in the phase's own
residue list (`delivery/work-history/m3-p11.md`, "Residues, open questions"
section 3, which names four different, disclosed limits). Consumer-visible
break: a permissions problem on a precondition script (wrong owner, umask,
packaging/CI UID mismatch, a deliberately-restricted file) is silently
downgraded from crash to skip, exactly the failure this whole phase exists to
close.

**M-1, MEDIUM.** A `filesToTouch`/`declaredExtras` addition that is a
directory prefix (ends in `/`) grants scope over every current and future
path under it, but is printed identically in shape and length to a single-
file addition (`filesToTouch src/`). Disclosed, not a lie, but disclosed in a
way that does not distinguish "one file" from "everything under this tree" for
a reviewer scanning the printed line, which is the entire protection change 3
relies on. Consumer-visible break: a reviewer who trusts the printed-addition
mechanism as change 3's design intends can approve an unbounded scope grant
while reading a line that looks the same size as a narrow one.

**LOW / TRACKED.** `singleLine`'s newline-forgery defense on the new stdout
stream (`src/commands/gates.ts:213`-`217`) does not strip a bare `\r`, so a
gate's own `detail` (already-trusted manifest content, not an external input)
could cosmetically overwrite the start of its printed line on a real
terminal. Does not affect the machine-readable verdict.

**No finding, stated plainly.** Change 2's boundary rule
(`isPhaseOwnEvidence`) held against every boundary/traversal/case/nesting
attack I tried, including several not covered by the shipped test. Change 3's
removal/rename/deletion detection held against every shape I tried. The
consumer-view check found the six-plus registry commands reporting `error`
exactly as the phase promises, with matching counts.

---

## Verdict

**REQUEST CHANGES.**

Reasoning: H-1 is not a theoretical residue with a documented tradeoff behind
it, the way the four disclosed argv-position limits are; it is an unexamined
corner of the exact mechanism (`probeCommandRunnable`) this phase built to
close this exact class of bug, verified to reproduce the exact symptom
("`not-applicable` when the gate had crashed") the phase's own opening
sentence names as the thing at stake, end to end through the real shipped
binary as a non-root user. That is squarely inside this phase's declared
scope (`src/gates/run.ts`, change 1) and squarely inside what DR-0029 calls
the actual product. A fix round that extends the existing operand loop with a
readability check (symmetric with the executable-bit check already present
for the launcher three lines above it) closes it without reopening changes 2
or 3, which held.

M-1 is a documentation/clarity gap in an already-disclosed tradeoff, not a
gate that lies; I would not block on it alone, but it is worth folding into
the same round since it touches the same printed-line mechanism.
