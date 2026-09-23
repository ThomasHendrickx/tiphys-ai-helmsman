# Delta verification: M5-P2 fix round 1

Date: 2026-09-23
PR: #207
Branch: claude/m5-p2-intent-to-outcome
Head verified: b86b2eb
Prior head (my own hazard review): e0e4118
Model family: Sonnet
Method: fetched the branch and checked out b86b2eb detached in an isolated
worktree; diffed it against my own prior review head (e0e4118) and read the
work history's "Fix round 1" section as the implementer's own account, then
independently re-derived each of its four claims rather than trusting it.
Re-ran my three round-0 attack fixtures against the fixed schema through the
real CLI and built two new fixtures targeting the declared residual gap.
Hazard-attacked the new shared src/charter.ts module by hand against scratch
fleet directories (directory-as-file, ambiguous multiple charters, a FIFO, a
50MB document, a symlinked directory) through real `bin/tiphys.ts brief
compose` runs, which surfaced one new finding. Read the doctor.ts refactor
diff line by line and mutation-tested one pre-existing witness against it.
Mutation-tested all six `dangerousStates` members across the three new
witness specs directly against the shipped files, confirming each RED,
restoring each to byte-identical bytes (diffed against a saved copy) before
moving to the next. Built a floor-satisfying node v26.6.0 toolchain and ran
the full suite with `dist/` built, per CLAUDE.md standing warning 12.

## Scope of the delta

git diff e0e4118 b86b2eb --stat (delivery/work-history/m5-p2.md:1, Fix round 1
section): 17 files, +1340/-72. Full names:
AGENTS.md, delivery/plan/phase-declarations/m5-p2.json,
delivery/review/clean-room-M5-P2-opus-criteria.md,
delivery/review/clean-room-M5-P2-sonnet-hazard.md,
delivery/work-history/m5-p2.md, roles/README.md, roles/implementer.md,
schemas/final-report.schema.json, src/charter.ts, src/commands/brief.ts,
src/commands/doctor.ts, test/behaviors.json, test/brief-compose.test.ts,
test/report-contract.test.ts, witness/p2-charter-fleet-ambiguous.json,
witness/p2-charter-fleet-init.json, witness/p2-evidence-distinct.json.

The declaration (delivery/plan/phase-declarations/m5-p2.json:8-14) grew five
entries at head: src/charter.ts, src/commands/doctor.ts, roles/README.md,
AGENTS.md, witness/. All nine full-diff files (origin/main...b86b2eb) resolve
to either an entry on that declaration, a declaredExtra, or the review-evidence
files (both clean-room reviews, allowed per "a pull request carries all its
evidence"). No unaccounted file.

## Item 1: CR-M5P2-01 closure, attacked directly

Reproduced my own three round-0 attacks (duplicate evidence, near-blank
punctuation-only evidence, pure-whitespace evidence) against the fixed schema
through the real CLI:

```
$ node bin/tiphys.ts validate --type final-report dup-evidence.yaml
(evidence: two identical strings)
INVALID #/delivered-outcome/evidence array items 0 and 1 are duplicates and must be unique
exit=1

$ node bin/tiphys.ts validate --type final-report nearws-evidence.yaml
(evidence: [".", " . "])
INVALID .../evidence/0 value "." does not match the required pattern [A-Za-z0-9]
INVALID .../evidence/1 value " . " does not match the required pattern [A-Za-z0-9]
exit=1

$ node bin/tiphys.ts validate --type final-report purews-evidence.yaml
(evidence: ["   ", "\t\t"])
INVALID .../evidence/0 ... exit=1 (unchanged, pattern still catches this)
```

All three now refused. CR-M5P2-01 is closed for the attack I raised.

Does `delivered: true` still pass with evidence pointing at nothing? Built two
more instances against the fixed schema:

```
evidence: ["x", "y"]              -> exit 0   (declared residue: lone alnum char)
evidence: ["a1", "a1 "]           -> exit 0   (declared residue: uniqueItems is exact-string)
```

Both match the schema's own $comment (schemas/final-report.schema.json:74)
verbatim: "a single alphanumeric character such as x passes; and nothing
checks that an entry resolves or is true." The residual gap is honestly
declared, not silently left, and it is a strictly narrower gap than round 0
(which accepted whole-sentence duplicates and multi-character punctuation
strings). Not a finding.

ReDoS: the new pattern `[A-Za-z0-9]` is a single character class with no
quantifier, so it cannot backtrack. Ran the shipped timing test directly
(200000-char punctuation near-miss): pass, 126ms. Independently reproduced
outside the suite with `/[A-Za-z0-9]/.test()` on 200k/2M/20M-character
adversarial strings (no letter or digit anywhere): 0ms/2ms/25ms, linear.
Pattern is safe.

## Item 2: hazard-attacked src/charter.ts (shared by doctor and brief compose)

Built each dangerous state by hand against a scratch fleet directory and ran
`bin/tiphys.ts brief compose` for real (node v26.6.0):

| state | result |
|---|---|
| single charter in `charter/` | composes, exit 0 |
| directory named `charter.yaml` at root | refused: "is a directory, not a regular file", exit 1 |
| both a root `charter.yaml` and a charter in `charter/` (ambiguous) | refused, both paths named, exit 1 |
| a named pipe (mkfifo) inside `charter/` | refused: "is a named pipe, not a regular file", exit 1, under a 10s timeout (no hang) |
| a 50MB `product-intent` block scalar inside `charter/` | composed, exit 0, well under the 10s timeout |
| unreadable file (chmod 000) inside `charter/`, as root | read anyway (root bypasses permission bits in this container); could not force a true EACCES here, see honest-failure |

None of these hang, and none of these silently fall back to a default.

One more state: `charter/` itself a symlink to a named pipe (not a
directory). `readdirSync` on it throws ENOTDIR, which `readCharterDirectory`'s
try/catch already turns into `no-directory`, so this composes as the
undeclared state, exit 0, no hang (checked under a 10s timeout). This is the
right answer: it fails toward the same honest "no charter declared" sentence
rather than toward a guess.

**Finding CR-M5P2-F01 (see Findings): `charter/` itself, or an entry inside
it, can be a symlink to a location outside the fleet, and its content is read
and folded into the composed brief with no indication the bytes did not come
from the fleet.** Built with `ln -s /tmp/m5p2attack/outside-secret
/tmp/m5p2attack/fleet3/charter` and a `kind: charter` document at the target:
`brief compose` read it and rendered its `product-intent` verbatim, labeled
only with the fleet-local path (`.../fleet3/charter/x.yaml`), which does not
exist as a real file; the real bytes are at
`/tmp/m5p2attack/outside-secret/x.yaml`. See Findings for severity and why
this is inherited rather than newly introduced.

## Item 3: declaration entries and doctor.ts blast radius

Declaration grant: five entries added at head (src/charter.ts,
src/commands/doctor.ts, roles/README.md, AGENTS.md, witness/), all real files
this round touches, matching delivery/work-history/m5-p2.md:441-445's own
account. No entry was removed (src/gates/scope.ts:877's stricter rule, files still
present at merge base). Confirmed the declaration file itself
(delivery/plan/phase-declarations/m5-p2.json) already existed on `main`
before this branch (round 0 shipped it), so the "declaration must exist at
merge base" rule is satisfied.

doctor.ts refactor: read the diff directly (git diff e0e4118 b86b2eb --
src/commands/doctor.ts). `checkRetention` now calls the shared
`readCharterDirectory` instead of its own inline readdir/decode loop. Checked
by hand that the early-return order is preserved: the new loop still FAILs
first on any `refused`/`undecodable` entry (matching the old refused-read and
decode-failure FAILs), still treats `absent` entries as skip-and-continue
(matching the old `read.kind === "absent"` continue), and only inspects
`document`/`path` for `kind === "charter"` entries, unchanged from round 0.
No behavioral difference found by reading; the work history's own numbers
(twenty existing doctor specs, each `find` string occurring exactly once in
the changed file) are consistent with a pure refactor. I did not
independently re-run all twenty pre-existing doctor witness specs myself
(see honest-failure), but did run the full suite (see item 4) which exercises
test/doctor.test.ts unchanged.

Blast radius beyond doctor and brief compose: confirmed src/charter.ts's two
exports (readCharterDirectory, locateCharters) are imported only from
src/commands/doctor.ts and src/commands/brief.ts by reading the import lines
in both diffs; no third caller.

Spot-checked one of the twenty pre-existing doctor witness specs the work
history claims are unaffected (witness/doctor-retention-not-applicable-and-undeclared-stay-distinct.json),
independently, by hand: confirmed its `find` strings (the two comment blocks
"NO YAML AT ALL" and "YAML IS PRESENT AND NONE OF IT IS A CHARTER") still
occur verbatim in the refactored src/commands/doctor.ts (grep, one hit each),
then applied member 2 of that spec (`candidates === 0` -> `candidates === -1`)
directly and re-ran the named test: RED, the not-applicable branch became
unreachable and the WARN detail read "0 YAML document(s)..." instead of "no
charter document...". Restored, diffed clean. This confirms the refactor did
not silently break a pre-existing charter/retention witness, for at least
this one; I did not re-run all twenty (see honest-failure).

## Item 4: the three new witness specs, mutation-tested directly

Read witness/p2-charter-fleet-ambiguous.json, witness/p2-charter-fleet-init.json
and witness/p2-evidence-distinct.json, and applied each of their six
`dangerousStates` mutations by hand (not through the gate runner) to the
actual shipped files, one at a time, restoring the exact original bytes
(verified by `diff` against a saved copy) after each:

| spec | member | result |
|---|---|---|
| p2-charter-fleet-ambiguous | `if (location.found.length > 1)` -> `if (false)` | RED: 0 !== 1 |
| p2-charter-fleet-ambiguous | `if (location.nonCharterYaml > 0)` -> `if (false)` | RED: 0 !== 1 |
| p2-charter-fleet-init | `found.push(entry.path)` -> `void entry` | RED: "the fleet charter was not found" |
| p2-charter-fleet-init | `locateCharters(workingDirectory)` -> locate under `no-such-root` | RED: "the fleet charter was not found" |
| p2-evidence-distinct | `uniqueItems: true` -> `false` | RED: 0 !== 1 |
| p2-evidence-distinct | pattern `[A-Za-z0-9]` -> `\S` | RED: 0 !== 1 |

All six members independently reproduced red against the named test. All
files restored byte-identical (diffed against a saved copy after each
restore) and `git status --porcelain` confirmed clean before moving on.

### Full suite, node v26.6.0, built, `npm test` invocation

Fetched a floor-satisfying toolchain (node v26.6.0, per CLAUDE.md standing
warning 1) into a scratch prefix, built with `npm run build` (exit 0, clean
`git status` after), then ran the `npm test` invocation (the same one the
`suite` gate runs) with that toolchain first on PATH:

```
$ node --version
v26.6.0
$ npm test
...
tests 1404
suites 0
pass 1404
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 1022450.671619
npm test exit=0
```

1404 tests, 1404 pass, 0 fail, 0 cancelled, **0 skipped**, exit 0. This
matches delivery/work-history/m5-p2.md:441's own claimed count exactly (1404
tests, all pass). Toolchain: node v26.6.0. Build state: `dist/` built before
running (standing warning 12). Invocation: `npm test` (not a bare
`node --test`, so this is the exact command the `suite` gate runs). Duration
about 17 minutes wall clock, consistent with standing warning 11's real-clock
lease waits. Progress was observed live via the running process tree
(`ps aux`, confirming the actual `node --test` process by pid and cwd, and
watching its children grow across the run) and via `tail --pid=<pid> -f
/dev/null` blocking until that exact process exited, rather than assumed
from a quiet log: an earlier attempt to capture this run through a
`timeout`-wrapped, `tail`-piped background command produced no output at all
and was abandoned in favor of the unwrapped, unpiped invocation used here.
Item 4's second half, "the suite is green on node 26," is confirmed with the
full number, not a bundle-level inference.

## Honest failures (what this delta verification could not cover)

- The `scope` gate itself was not run directly against this head from my
  worktree. My checkout is detached at b86b2eb, and the scope auditor derives
  a phase id from the current branch name (CLAUDE.md, "Branch names are
  load-bearing"), which a detached HEAD does not carry. I audited the
  declaration grant by hand instead (Item 3): read the declaration file's
  diff, confirmed all five added entries name real touched files, confirmed
  no entry was removed, and confirmed the declaration file itself predates
  this branch on `main`. This is a manual substitute for the gate, not the
  gate itself.
- The unreadable-file attack (chmod 000 inside `charter/`) could not force a
  true EACCES: this container runs as root, and root bypasses permission
  bits, so the file was read anyway regardless of mode. I did not find a way
  to force a true permission refusal in this container; I am stating this as
  an open question rather than a claim that no such state exists.
- I did not independently re-run all twenty pre-existing doctor witness specs
  the work history claims are unaffected by the refactor (Item 3). I
  spot-checked exactly one of the twenty by hand (mutation-tested, confirmed
  red, restored clean), and separately ran the full suite (which exercises
  `test/doctor.test.ts` unchanged), but did not mutation-test the other
  nineteen specs myself.
- A small, unreconciled discrepancy: my own count of witness files naming
  `src/commands/doctor.ts` as `"file"` came to 19
  (`grep -l '"file": "src/commands/doctor.ts"' witness/*.json | wc -l`),
  while the work history states "twenty existing doctor specs"
  (delivery/work-history/m5-p2.md:441). I did not chase this down further; it
  does not change the verdict, since the one spec I did spot-check passed,
  but a reader relying on an exact witness count for doctor.ts should
  re-derive it rather than trust either number verbatim.

## Findings

### CR-M5P2-F01 (low): a symlinked `charter/` directory or entry reads content
from outside the fleet with no indication of the real source

**Claim.** `readCharterDirectory` (src/charter.ts:72) calls `readdirSync(directory)`
directly. If `charter/` itself is a symlink to a directory outside the fleet,
Node follows it transparently and lists the target directory's contents; each
entry is then read through the same followed-symlink path. The composed
brief's "charter:" line names the fleet-local path
(e.g. `.../fleet/charter/x.yaml`), which is not where the bytes live.

**Evidence.**

```
$ ln -s /tmp/m5p2attack/outside-secret /tmp/m5p2attack/fleet3/charter
$ cat /tmp/m5p2attack/outside-secret/x.yaml
kind: charter
product-intent: SECRET FROM OUTSIDE THE FLEET
$ cd /tmp/m5p2attack/fleet3 && node .../bin/tiphys.ts brief compose --role implementer ...
exit=0
## Product intent
charter: /tmp/m5p2attack/fleet3/charter/x.yaml
SECRET FROM OUTSIDE THE FLEET
```

The path printed does not exist as a real file; the real file is at
`/tmp/m5p2attack/outside-secret/x.yaml`.

**Why it matters, and why it is LOW rather than MEDIUM or HIGH.** This is
consistent with, not a departure from, the design already established
throughout this codebase: `classifyEntry` explicitly follows a symlink to a
regular file and treats it as regular (src/fleet.ts:264, "a symlink to a
regular file is regular"), and `resolveProductIntent`'s own docstring at round
0 already accepted a root `charter.yaml` that is a symlink to a real file
elsewhere. What changed in fix round 1 is that the SAME acceptance now applies
to a whole DIRECTORY (`charter/`) rather than one file, widening the surface
from one followed link to N. I checked whether this pre-dates the round: at
e0e4118, `doctor.ts`'s `checkRetention` already called `readdirSync(charterDir)`
directly with the identical no-symlink-guard shape, so the MECHANISM is
inherited, not newly introduced; round 1 is the first time this reachable
surface also flows into a document handed directly to an agent (the composed
brief) rather than only into doctor's terse PASS/FAIL/WARN lines. Nothing in
src/charter.ts, the work history, or the round-1 diff mentions this as a
considered and declared residue (unlike the evidence-pattern gap, which is
explicitly named in the schema's own $comment), so it is worth recording
rather than assuming it was weighed and accepted. Practical exploitability is
low: a fleet's `charter/` is normally created and populated by the same
principal that runs `tiphys brief compose` against it, so someone would need
to plant the symlink themselves to be affected by it, which is a low-value
attack.

**Fix (optional, not blocking).** `lstatSync(directory).isSymbolicLink()`
before the `readdirSync`, refusing (or explicitly warning) rather than
following, mirrors the D-M3-27 discipline already applied to individual file
reads. This is a suggestion for a future round, not a requirement of this one.

## Verdict: APPROVE

| severity | count |
|---|---|
| high | 0 |
| medium | 0 |
| low | 1 |

CR-M5P2-01 is closed for the exact attacks that raised it (duplicate and
near-blank evidence), with a narrower and honestly-declared residual gap, a
correctly linear pattern, and independently reproduced red/green mutation
tests. The shared charter module correctly refuses every dangerous state I
built by hand (directory-as-file, FIFO, ambiguous multiple charters, stray
non-charter YAML, a 50MB document) with no hang and no silent fallback, and CR-001
(the round-0 undeclared-in-a-real-fleet finding) is closed: brief compose now
reads the exact document doctor reads, verified against a real `tiphys init`
fleet. The doctor.ts refactor preserves at least the one pre-existing witness I
mutation-tested, and the scope audit accounts for every changed file. All six
mutations across the three new witness specs reproduce red independently. The
one finding (CR-M5P2-F01) is low severity, inherited rather than introduced by
this round, and does not block merge; it is recorded for a future round's
consideration.

