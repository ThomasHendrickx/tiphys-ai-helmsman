# Delta verification: M4-P23 fix round

Subject: phase M4-P23, branch claude/m4-p23-retirement-inventory.
Reviews under test were produced against head 7b2b7f1.
Current head: 303057b50b7a63cc53747c983665f1cde3027ac2.
Delta verified: git diff 7b2b7f1..303057b.

Status: IN PROGRESS (this file is appended as work proceeds; its mtime is the beacon).

## Plan

1. First check: does the work history state what its derivation did NOT cover?
   Run the derivation command myself, then widen it in a direction the author
   excluded and report what the widened search returns.
2. Per original finding: name the mechanism, check whether the round fixed the
   mechanism or only the named instance, reproduce against 7b2b7f1 and show it
   gone at 303057b.
3. Attack the round itself: red witnesses (defang them), guards that cannot go
   red, counts pinned over append-only registries, the claim grep in both forms,
   the four-part suite sentence, and C-1/C-2/C-3.
4. DR-0027 reachability for every HIGH or MEDIUM raised.

Environment note, recorded before any timing-sensitive measurement:
/proc/loadavg at start was 13.83 13.02 11.08, nproc 4. The box is loaded.


## Session note (re-dispatch)

The first delta-verification session died after writing the plan above.
This report is continued by a re-dispatched verifier in the same clone at the
same head. Environment at restart: /proc/loadavg 2.20 2.50 2.87, nproc 4,
so the box is far lighter than the first session recorded. Both figures are
kept because a timing-sensitive measurement must name the load it ran under.

## Read

Both prior reviews read in full. They are the SAME reviewer's two outputs
(clean-room narrative and structured result), so they carry one finding set,
not two: F1 HIGH (C-3 GAP row false), F2 MEDIUM (R-094 verified-by is a shell
quoting error), F3 MEDIUM (command screen does not prevent writes and the
header says it does), F4 MEDIUM tracked (allowlist witness red arm destructive),
F5 LOW (no fence tracking), F6 LOW (466 vs 467, blank-line citation), plus a
pre-existing shipped process.exit() item routed elsewhere.

## First check: the derivation, run and then widened

The work history's derivation script is scratch and not committed, so I wrote
my own against the checker's exported `nonAnswerExit`, `liftPattern`,
`argumentPathsNamed` and `WIDENED_SURFACE` rather than re-implementing them.
It reproduces the published numbers exactly at the fix-round head:

```
# call sites (recorded exit codes): 468
# screen-refused commands: 0
# class 1 non-answer exits: 0
# class 2 absence rows: 82
# class 2a unliftable: 0
# class 2b absence rows whose pattern IS carried on the surface: 10
# rows with undeclared hits: 0
```

The ten class-2b rows and their hit sets match the work history row for row.

### The widening the author excluded

The not-covered section names ONE exclusion from `WIDENED_SURFACE`: `delivery/`,
with a measured reason (three rows pulled the inventory JSON into their own
surface through a path-shaped token inside their search pattern, and the JSON
quotes every rule back at itself). It does NOT name the other exclusions, and
there are several: `test/`, `scripts/`, `.github/`, `assurance-modes.yaml`,
`gates.manifest.json`, `package.json`, `sandbox/`, `witness/` and
`role-model-config.yaml` are all off the surface and none is discussed.

So I widened in that direction and re-ran:

```
$ node derive.mjs <clone> test,scripts,.github,assurance-modes.yaml,gates.manifest.json,package.json
# class 2b absence rows whose pattern IS carried on the surface: 19
# rows with undeclared hits: 19
```

Nineteen rows against ten. I then read every new hit rather than reporting the
count. The result is that NONE of them refutes a row:

- Most are SELF-REFERENCE, which is the same effect the author measured for
  `delivery/`: `scripts/check-retirement-inventory.mjs` and
  `test/retirement-inventory.test.ts` quote the patterns back (`skills`,
  `delivery/ is the build`, `broken derivation`, `execFileSync`). Adding those
  two trees to the surface would make several rows permanently red for quoting
  themselves.
- `skill-phase-delivery:4-open-the-pr` gains `scripts/m1-exit-test.sh:711`,
  `scripts/stub-payload.sh:14` and `test/implementer-brief.test.ts:771`. The
  first two are the M1 exit-test HARNESS calling `gh pr create`, which is the
  delivery process and not the kernel; the third is a test asserting that
  `gh pr create`, `pr merge` and `open the PR` are FORBIDDEN in a brief, which
  CONFIRMS the gap instead of refuting it. The row stands.
- The four `required gate` rows gain `.github/workflows/gates.yml:247` and six
  lines of `scripts/m2-exit-test.sh`. Every one is a comment or a failure string
  about a required gate, not a statement of the four-printed-facts reading
  procedure the rows say is uncarried. The rows stand.
- `claude-md:r-094-is-partially-delivered-and-the-half-that-i` gains
  `scripts/check-brief-drift.mjs` and `scripts/render-agent-rules-gates.mjs`
  for `--registry`. Neither is `scripts/m2-exit-test.sh`, which is the file the
  row's claim is about, and `--registry` is still absent from that file and
  from the workflow. The row stands.

VERDICT ON THE FIRST CHECK: the not-covered statement understates its own
exclusions by naming only `delivery/`, and the widened search finds no row whose
claim is false. I report the first as a gap in the statement and the second as
the measured result, because a widened search that returns nothing is only worth
anything when it is shown to have been run.

## Original findings: mechanism, other call sites, and a before/after reproduction

Two worktrees were cut from my clone, one at 7b2b7f1 and one at 303057b, so
every "before" below is a real run of the reviewed head and not a quotation.
Control first: the checker AT 7b2b7f1 against the tree AT 7b2b7f1 prints
"280 row(s) against 280 derived rule anchor(s), commands EXECUTED" and exits 0.
That is the green the reviews were refuting, reproduced.

### F1 (HIGH), the C-3 GAP row

MECHANISM: an exit code proves A TOKEN is absent from THE FILES THE COMMAND
NAMED; the prose beside it claims THE RULE is absent from the kernel.

The instance is fixed. The row is now PORTED/PORT with destination AGENTS.md,
probe "C-3 forbids a kernel COMMAND", verified-by exit 0, and a sibling
negative witness at exit 1. It also records a NARROWER residual that is true:
C-1 and C-2 have mechanism-index entries and C-3 does not.

MECHANISM TEST, which is the part a claim cannot substitute for. I put the
PRE-FIX C-3 row back into the FIXED inventory and ran the FIXED checker:

```
UNRESOLVED claude-md:never-auto-background-a-long-running-process-c-3:
  verified-by exits 1, so the row claims an absence, but the same pattern
  "auto-background" is carried by src/commands/spawn.ts, src/gates/release.ts,
  src/spawn.ts. A widened block naming those files and reading them is required
exit=1
```

So the guard DOES redden the founding instance. It reddens for a DIFFERENT
FACT than the one that made the row false: it points at `src/`, not at
AGENTS.md:497, because AGENTS.md states the rule without the token
`auto-background`. A truthful `widened.read` saying "those are shipped code, not
an instruction channel" would have satisfied the guard and left the row false.

That is not hidden. The work history's not-covered item 6 states the spelling
family is only half covered and asks the open question. I measured the class
member it names, in a scratch root: AGENTS.md carries the rule under a different
word, `grep -c 'widget' AGENTS.md` exits 1, and the fix-round checker prints
"every rule in the three roots is resolved", exit 0. So the declared gap is
real and correctly declared, and the finding table's "Mechanism fixed by the
widened-absence check" is stronger than the measurement supports.

### F2 (MEDIUM), the R-094 verified-by shell quoting error

MECHANISM: a command that failed to RUN is not a command that answered, and its
error reproduces forever.

Instance fixed: the command is now `grep -c -- '--registry'
scripts/m2-exit-test.sh`, exit 1, output `0`.

OTHER CALL SITES, enumerated by me rather than accepted: all 468 recorded exits.
Every one is a single segment led by `grep`, and the only recorded exits are 0
(198) and 1 (270). Zero non-answers at this head.

MECHANISM TEST: the PRE-FIX R-094 row put back into the FIXED inventory reddens
three separate ways under the fixed checker, the first of which is the
classifier this round added:

```
verified-by records exit 2, which is not an answer: grep exits 2 only on an
  error, so it searched nothing. A command that failed to run reproduces
  forever and verifies nothing.
```

The classifier's declared gap (per-tool codes for `ls`, `cat`, `wc`, `comm`,
`head`, `tail`, `test` are not tabulated) is unreachable today because all 468
commands are `grep`.

### F3 (MEDIUM), the command screen

MECHANISM: an allowlist chosen for "looks harmless" instead of for a property,
with a header stating the property.

Instance and mechanism both fixed, and I attacked the new list rather than
reading it. Both members reproduced END TO END, one variable (which checker):

```
=== checker at 7b2b7f1, verified-by = sed -i s/ORIGINAL/DESTROYED/ src/victim.txt
BEFORE: IMPORTANT ORIGINAL CONTENT
retirement-inventory: 5 row(s) against 5 derived rule anchor(s), commands EXECUTED
AFTER : IMPORTANT DESTROYED CONTENT
=== checker at 303057b, same row, same root
BEFORE: IMPORTANT ORIGINAL CONTENT
  UNRESOLVED claude-md:lab-rules: verified-by command segment starts with "sed",
    which is not on the allowlist
AFTER : IMPORTANT ORIGINAL CONTENT
```

`sort -o src/victim.txt /dev/null` truncates the victim to zero bytes at
7b2b7f1 and is refused at 303057b.

I then put 36 candidate commands through the exported `screenCommand` at the
fix-round head, looking for a write the new list still reaches: subshells
`(sed ...)`, brace groups, `env`/`command`/`exec`/`eval`/`xargs` prefixes,
`VAR=x` assignment prefixes, backslash-escaped `\sed`, leading tab and leading
space, a literal newline, a backslash continuation, `&`, `;`, `&&`, `||`, a
pipe into `tee`, `2>/dev/null`, a heredoc, and `$( )`. ALL 36 were refused.
The nine surviving tools are `grep test ls wc comm diff head tail cat`, and I
could not find a file-writing option on any of them. The screen held.

### F4 (MEDIUM, tracked), the destructive red arm

Fixed at the mechanism: `scratchRoot()` builds a `mkdtemp` tree with the three
roots, an `AGENTS.md` for the widening to search, and a victim file, and every
destructive fixture goes through `checkScratch(root, ...)`. I checked every
remaining call of `check(...)`, which still passes the REAL repository root: the
commands those tests inject are `grep -c ...` and `test -f CLAUDE.md` only.
The old `rm -rf delivery/plan/cutover` aimed at the real root is gone.

### F6 (LOW), the numbers

466 became 468 and the pre-pass citation :60 became :64, both verified. See
"What the round broke" for two the round MISSED in the same file.

## What the round BROKE or left unwitnessed

### V-1. Arm 2 of the round's own mechanism has NO red witness, and the work history says it has one

The round states three checks that perform the verdict-versus-sentence
comparison. Arm 2 is "the row's own files are part of that surface", passed into
the widening as `argumentPathsNamed(vb.command, repo)`. The work history says it
is "demonstrated red and green by the fixture named 'only an absence of that
spelling' in the red-witness capture below".

I defanged it: one edit, replacing that argument with `[]`, leaving everything
else byte-identical.

```
### DEFANG: D5 widening drops the row's own argument files
    # tests 27
    # pass 27
    # fail 0
```

Twenty-seven of twenty-seven still pass. The same defanged checker against the
REAL roots prints "280 row(s) against 280 derived rule anchor(s), commands
EXECUTED / every rule in the three roots is resolved", exit 0. So the arm is
unwitnessed by the suite AND unexercised by any live row.

WHY the named fixture does not witness it: that test's command is
`grep -c 'MANDATED-READING' AGENTS.md`, and `AGENTS.md` is already the first
entry of `WIDENED_SURFACE`. The case-insensitive widening finds it through the
surface, with or without arm 2. What the fixture actually witnesses is
case-insensitivity, which is a different property.

The arm IS real, which is why this is "unwitnessed" and not "pointless". I
isolated it in a scratch root where the carrying file is OFF the surface, using
the code's own `DELEGATED` example:

```
root: AGENTS.md carries nothing relevant; docs/dr0012.md carries "delegated"
row : verified-by  grep -c 'DELEGATED' docs/dr0012.md   exit 1   (a true absence
      of that spelling, in the right file)

=== fix-round checker
  UNRESOLVED claude-md:lab-rules: verified-by exits 1, so the row claims an
    absence, but the same pattern "DELEGATED" is carried by docs/dr0012.md ...
exit=1
=== same checker, arm 2 removed
retirement-inventory: every rule in the three roots is resolved
exit=0
```

Two structurally different states, one variable. The red-witness rule says a
guard counts only when it has been shown red without the behavior; this one has
not been, and the work history asserts otherwise. The claim grep FOUND this
sentence (`catches`, at line 1172 and again in the settlement table) and the
settlement entry cites the fixture that does not settle it, so the failure is a
mis-settled hit rather than a missed one.

DR-0027 reachability: `scripts/check-retirement-inventory.mjs` and
`test/retirement-inventory.test.ts` are not under `src/`, `bin/`, `schemas/`,
`roles/` or `tuition/`; the checker is in no gate registry, no manifest and no
`package.json` `files` entry (measured: `grep -n check-retirement` over
`gate-registry.yaml`, `gates.manifest.json`, `.github/workflows/*.yml` and
`package.json` returns nothing). TRACKED, not blocking.

### V-2. The fence fix handles a COLUMN-ZERO fence only, and CLAUDE.md contains fourteen indented fence lines today

The reviewer's F5 said a column-zero bullet, heading or bolded line inside a code
fence becomes a phantom rule anchor. The fix is a state machine whose
fence regexp is anchored at column zero (the exported checker's FENCE_RE). CommonMark allows an
opening fence indented by up to three spaces, and this repository uses that form
inside numbered list items.

Measured on the live root at the fix-round head:

| shape in CLAUDE.md | count |
|---|---|
| fence lines at column zero | 10 |
| fence lines indented one to three spaces | 14 |
| fence lines indented four or more | 2 |

So the recognised half is a minority of the fences in the file the grammar is
pointed at. Forced in a scratch root whose CLAUDE.md carries one three-space
fence containing three column-zero lines, one of each affected anchor kind:

```
$ node scripts/check-retirement-inventory.mjs --repo <scratch> --extract
claude-md:never-do-the-thing   CLAUDE.md:6  bullet     - Never do the thing.
claude-md:a-shell-comment      CLAUDE.md:7  heading    # a shell comment
claude-md:a-bolded-lead-in     CLAUDE.md:8  bold-lead  **A bolded lead-in.**
# 7 rule anchor(s) across 3 retirement root(s)
```

Three phantom anchors at the FIX-ROUND head, from exactly the defect F5 named.
It is not wrong today only because the content inside those fourteen indented
fences is itself indented.

RELATED, and it is the reason this is a mechanism gap rather than a second
instance: the round's own witness pair for this class is "a column-zero BULLET
and a column-zero HEADING, inside one fence". Those differ in ANCHOR KIND and
are identical in FENCE KIND, which is the half the fix actually implements. The
class is "a fence hides a rule"; two members that share the fence shape prove
the grammar half twice and the fence-recognition half once.

It fails CLOSED (a phantom anchor reddens as "rule at X:N has NO row"), which is
why it is LOW. There is a matching fail-open I could not reach today: an
UNCLOSED fence makes the extractor drop every anchor after it, and a rule added
after one would be silently uninventoried rather than orphaned. I checked all
seven markdown roots at this head and every one is balanced, so nothing is
dropped now.

Reachability: same as V-1, `scripts/` and a `delivery/` document. TRACKED.

### V-3. The round moved one row and updated five derived numbers, and missed two more in the same file

`delivery/plan/cutover/retirement-inventory.md` line 120 reads "187 rows PORT",
and the destination table directly below it gives `AGENTS.md` 63 rows. Measured
from the JSON at the fix-round head: 188 PORT rows, 64 of them destined for
`AGENTS.md`. Measured at 7b2b7f1: 187 and 63, both CORRECT there. The round moved
the C-3 row from GAP/KEEP to PORTED/PORT with destination `AGENTS.md`, corrected
the totals at line 73 and the gap-group count at line 148, and left these two
stale 47 lines further down in the same document.

The work history's own "Six numbers the round corrected" section exists because
"a quoted number starts an investigation". These are two more of exactly that
kind, introduced by the round. The mechanism behind F6 is "a derived number
written by hand goes stale"; it is fixed for the six sites the author walked and
not for the two he did not, and nothing derives these numbers at check time.

Everything else in that document reconciles: 133 / 131 / 16 = 280 per root,
188 PORTED, 88 GAP, 4 FALSE, 188 PORT, 75 KEEP, 17 DELETE, 46 process-side and
29 predicate-side KEEP rows, twenty-five gap groups, and "everything else (14
artifacts) | 25".

Reachability: `delivery/` paperwork. TRACKED.

### V-4. The widened surface is silent when a member of it moves, and the not-covered statement names only one exclusion

Two related observations, both INFO.

`widenedHitPaths` filters `WIDENED_SURFACE` through `existsSync` and searches
what survives. If a surface member disappears, the search is quietly narrower
and there is no signal. Measured in a scratch root, one variable:

```
AGENTS.md carries the token -> UNRESOLVED ... carried by AGENTS.md   exit=1
renamed to BRIEFS.md        -> every rule in the three roots is resolved, exit=0
```

Compare the round's own S1 fix, which correctly makes a widening grep that could
not RUN yield UNVERIFIED rather than confirmed. A surface that is not THERE gets
the opposite treatment. `present.length === 0` returns `{paths: [], error: null}`,
which is the confirm-the-absence verdict. Rows that already declare a hit-path
into the moved tree do redden, through the `existsSync` check on
`widened.hit-paths`; the seventy-two absence rows with no declared hits do not.

Separately, the not-covered statement names `delivery/` as the one exclusion
from the surface. `test/`, `scripts/`, `.github/`, `assurance-modes.yaml`,
`gates.manifest.json`, `package.json`, `sandbox/`, `witness/` and
`role-model-config.yaml` are also off it and none is named. I widened into them
and found no false row (see the first-check section), so the omission cost
nothing here; it is reported because "what the derivation did not cover" is the
reviewer's first check and an unnamed exclusion is the thing that makes an empty
result unreadable.

Reachability: `scripts/`, a future editor of the guard. TRACKED.

## What I attacked and how it HELD

### Red witnesses: six defangs, one variable each

Method: a byte copy of the fix-round checker, one edit to put a single
property back into its DANGEROUS state, the committed test file run unchanged
against it, then restore from the byte copy and `cmp` it. No VCS restore was
used anywhere, per the standing warning about `git checkout --`.

| defang | tests red |
|---|---|
| D1 `git`, `sed`, `awk`, `node`, `sort` put back on the allowlist | 3: the in-place-editor arm, the output-flag arm, and the pinning test |
| D2 fence recognition disabled | 1: fenced blocks are not rules |
| D3 the widening's own grep error returns null (the round's S1 fail-open) | 2: the classifier unit and the end-to-end PATH probe |
| D4 `nonAnswerExit` always returns null | 2: the grep usage error and the shell not-found |
| D5 the row's own argument files dropped from the widening | **0, see V-1** |
| D6 the widened superset check replaced by field presence | 1: hit-paths omit a carrying file |

Five of the six go red, and the two members under D1, D3 and D4 are genuinely
different producers (an in-place flag against an output flag; a classifier unit
against a forced spawn failure; a tool-specific code against the shell's own).
D5 is the finding.

The D1 pair deserves its own line because I re-derived it rather than accepting
it. `sed -i` REWRITES the victim and `sort -o` TRUNCATES it to zero bytes, so
the two members reach the write by different options on differently-shaped
tools, which is what makes the allowlist's stated property the thing under test.
Both were reproduced end to end against the 7b2b7f1 checker and both are refused
by the 303057b one.

### A guard that cannot go red: 36 attacks on the new screen

Listed in the F3 section above. All 36 refused, including every shell
metacharacter route (`(`, `{`, `;`, `&`, `&&`, `||`, a literal newline, a
backslash continuation), every prefix wrapper (`env`, `command`, `exec`, `eval`,
`xargs`, a `VAR=x` assignment), a backslash-escaped command name, leading
whitespace, redirection, heredocs and command substitution. I could find no
file-writing option on any of the nine surviving tools. The screen held.

The one weak point I did find is V-4, and it is in the widening rather than the
screen.

### Counts pinned over an append-only registry

None. `test/behaviors.json` gains eleven names and loses none in the delta. No
test asserts a count over it, over `gates.manifest.json` or over the clause map.
The one numeric assertion in the phase's test file is a FLOOR on a locally built
sample (`rows.length === 2` over `realRows().filter(GAP).slice(0, 2)`), which
does not pin the registry.

`ALLOWED_FIRST_TOKENS` IS pinned to exactly nine names, deliberately and
correctly: it is a security contract, not an append-only registry, and the
source says so.

### The claim greps, both forms

Binding vocabulary, over the work history at the fix-round head:

```
line-based, matching LINES        46
line-based, matching OCCURRENCES  80
wrap-insensitive OCCURRENCES      81
```

One occurrence hidden by a hard wrap. I located it by diffing the two `uniq -c`
tables rather than by eye: it is a `would catch` split between "WOULD" and
"CATCH" across a line break, in the paragraph that records the author REMOVING
that over-claim. The work history already names it and explains it.

Fourteen prose hits sit in the fix-round section once fenced captured output is
excluded, and every one appears in the work history's own settlement table.
Thirteen are settled correctly. The fourteenth is the `catches` at line 1172,
whose settlement cites the fixture that does not settle it: that is V-1.

Note that the work history reports 53 / 88 / 90 for an EXTENDED vocabulary that
adds the passive assertions-of-handling. Those are different numbers about a
different alternation and both sets are true; I report mine as the binding one.

### The suite sentence, and the base

The complete sentence, all four qualifiers:

**Interpreter** node v26.6.0 from the floor-satisfying scratch toolchain,
npm 11.18.0. **Build state** `npm ci` exit 0, `npm run build` exit 0,
`git status --short` showing only my own untracked review file.
**Invocation** `npm test`, which is the form the `suite` gate runs, not bare
`node --test`. **Checkout kind** a `git clone --no-local` of the repository with
a linked worktree per compared head, not a `git archive` copy. **Result**

```
tests 876 / pass 876 / fail 0 / SKIPPED 0 / exit 0 / duration 294302ms
loadavg BEFORE  0.95 2.19 3.01
loadavg AFTER  10.40 7.69 5.19
```

That is 876 pass where the work history reports 876 tests, 874 pass, 2 fail. I
did NOT average the two. The work history attributes its two failures to the
wall-clock regex budget in the coverage gate under a load average of 31.94, and
names the control. My run is the same head, the same interpreter, the same build
state and the same invocation, differing in LOAD, and it is green. That
CONFIRMS the attribution rather than merely accepting it: the failing set is
load-dependent and is not caused by this branch. The budget is
src/gates/coverage.ts:235, a 250ms wall-clock bound, in a file this branch does
not touch.

The phase's own file separately: 27 tests, 27 pass, 0 fail, 0 skipped, exit 0.
The checker against the real roots: 280 rows against 280 derived anchors,
commands EXECUTED, exit 0, 2.6s.

Cheap guards re-run at the fix-round head: `node scripts/check-authored-bytes.mjs`
exit 0; `node scripts/render-agent-rules-gates.mjs --check` exit 0;
`node scripts/check-brief-drift.mjs` exit 0.

I did NOT run the `pull_request` CI arm or the post-merge `push` arm. Stated
because a gate result is evidence only for the configuration it ran under.

### C-1, C-2, C-3

Clean over the round's changed code. `spawnSync` sixteen times and one
`execFileSync` for `git rev-parse --show-toplevel`; no `spawn`, no `detached`,
no `unref`, no `nohup`, no `setsid`, no `/proc`, no `process.kill`. The two
`signal` references read a child's own `spawnSync` result to say the command did
not answer, which is reporting a death rather than using liveness for identity
or exclusion, so C-2 is satisfied. No state is read from the tail of an
append-only log: the checker reads a whole JSON document and the three roots.
Nothing is backgrounded; every execution is synchronous with a 30s timeout.

### Things the reviews asserted that I re-derived rather than accepted

- 468 recorded exit codes; 198 zero, 270 one; every command a single segment led
  by `grep`; zero non-answers. Reproduced independently.
- Seven commands whose path set differs between `kernelPathsNamed` and
  `argumentPathsNamed`, and ZERO of the seven losing every kernel path.
  Reproduced.
- Ten rows carrying a `widened` block, hit sets matching. Reproduced.
- Every line cited inside those ten `read` fields, opened and checked:
  src/gates/citations.ts:173, src/gates/citations.ts:177, src/gates/run.ts:1685,
  src/gates/run.ts:1720, checklists/plan-review.yaml:24, tuition/T-016.yaml:26
  and gate-registry.yaml:15. All seven resolve and say what the field claims.
  The work history's not-covered item 2 correctly calls this a human check; I
  redid it independently rather than trusting it.
- 133 / 131 / 16 = 280 rule anchors per root. Reproduced.
- C-3 stated at AGENTS.md:497 and bound into a shipped schema at
  schemas/assurance-modes.schema.json:37. Both opened.

## Verdict

**APPROVE.**

The round closed all six findings at the instance, and at the mechanism for F2,
F3 and F4. F1's mechanism fix reddens the founding instance, for a narrower
reason than the finding named, and the residual is declared honestly. F5's
mechanism fix covers the column-zero fence and not the indented one. F6's
mechanism is a hand-maintained derived number and two of them went stale in the
round itself.

Four findings, V-1 through V-4. Every one of them is confined to
`scripts/check-retirement-inventory.mjs`, `test/retirement-inventory.test.ts` and
`delivery/plan/cutover/retirement-inventory.md`. Measured: this branch changes
nothing under `src/`, `bin/`, `schemas/`, `roles/` or `tuition/`; the checker is
absent from the gate registry, the gates manifest, both CI workflow files and the
package's published `files` list. Under
delivery/decisions/DR-0027-reviews-target-shipped-value-not-ceremony.md:45 that
makes all four TRACKED and none of them blocking, and a verdict of
FIX-ROUND-NEEDED would need at least one that is not.

I would rather V-1 and V-3 were fixed before this lands, because V-1 is a
work-history sentence asserting a witness that does not exist in a phase whose
whole subject is claims wider than the verdict beside them, and V-3 is two
numbers that will start someone's investigation. Neither reaches a shipped
artifact, so neither blocks, and saying so plainly is the point of DR-0027.

### What I tried and could not break

The command screen against 36 attacks. Five of six defangs. The append-only
discipline. The claim greps in both forms. The suite, whose only reported
failures I reproduced as absent under lighter load rather than absent by
assertion. The truth of every line cited by the ten widened `read` fields. The
280-anchor derivation. The widened surface, extended into six trees the author
did not name, which found nineteen rows with hits and not one false claim.

### What this verification did NOT cover

1. I did not open a pull request and did not observe either CI arm. The
   `pull_request` bundle and the post-merge `push` run on the new `main` head
   are unwitnessed by me.
2. I read the 280-row JSON programmatically and by hand only where a probe
   flagged a row. I did not re-read all 280 `rule` and `text` fields against
   live anchors; a prior review reports zero drift there and I did not repeat it.
3. My widening of `WIDENED_SURFACE` covered `test/`, `scripts/`, `.github/`,
   `assurance-modes.yaml`, `gates.manifest.json` and `package.json`. I did NOT
   widen into `delivery/`, because the author measured the self-reference that
   makes it useless, nor into `node_modules/`, `dist/` or `sandbox/`.
4. I did not force the widening grep's exit-2 arm end to end either. The author
   records two forcing moves that failed here and I found no third.
5. I did not re-run the M1 or M2 exit tests, the macOS smoke job, or the gate
   bundle through `bin/tiphys.ts`. The cheap script guards were re-run; the
   registry bundle was not.
6. My verdict on V-2 rests on CommonMark's three-space allowance plus a measured
   fixture. I did not check how any other markdown renderer in this toolchain
   treats an indented fence, because the extractor is the only consumer that
   matters here.
