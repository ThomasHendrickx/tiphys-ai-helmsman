# Delta verification: M4-P11 fix round

Subject: phase M4-P11, branch claude/m4-p11-single-family-exception.
Reviewed head: 2f3b651e599837387d27314f8271f3c352d6ff46.
Prior reviews were against 399953c026d608d973d0d0d3d9889f362e5a83fc.
Delta under verification: 399953c..2f3b651.

STATUS: COMPLETE. Written incrementally from the first minutes; its mtime was the beacon.
Verdict: FIX-ROUND-NEEDED, section 12.

## Plan

1. Read CLAUDE.md, the M4-P11 plan section, both clean-room reviews, the work history.
2. FIRST CHECK: the fix-round contract item 3 (what the derivation did NOT cover).
   Run the author's derivation command; widen it in a direction the author excluded.
3. Per original finding: name the mechanism, enumerate other call sites, reproduce
   at 399953c and show gone at 2f3b651.
4. Attack the round: red witnesses (defang), guards that cannot go red, pinned
   counts over append-only registries, claim grep both forms, suite sentence,
   C-1/C-2/C-3.
5. Verdict under DR-0027: reachability decides blocking, not the severity label.

## 1. FIRST CHECK: the derivation, run and widened

The work history states its exclusions at `delivery/work-history/m4-p11.md`
section 3, six of them, each with a reason. That is the contract's item 3 and it
is present before any row is examined.

### 1.1 The author's derivations, re-run at this head

D1 (`grep -rnE 'REVIEW_DIRECTORY|loadCommittedVerdicts|committedVerdictPaths|
LoadedVerdict|selectVerdicts|loadPaperworkVerdicts|readCommittedVerdicts|
loadVerdictsFromWorktree|PAPERWORK_ROOT' src bin scripts schemas`) run by me at
`2f3b651`: exit 0, 58 lines. The work history quotes 14 of them and SAYS it
elided declaration and comment lines. I diffed my full output against its
quotation: every line it omits is a comment, a type-position occurrence or an
interpolation inside a message string. No call site is missing. In particular
the two `loadCommittedVerdicts(contextDirectory, source)` call sites at
`src/checks.ts` 4410 and 4723 and the single surviving
`scripts/check-dual-review.mjs` call at 179 are all present in both.

D3 (`grep -rnE '"(show|ls-tree|cat-file|rev-parse)"' src bin scripts`) run by
me: 58 hits over 14 files.

### 1.2 WIDENED IN A DIRECTION THE AUTHOR EXCLUDED

D2 is the weak one and it is the one I widened. As written it greps three
IDENTIFIERS (`readdirSync|readOperatorPath|readContextDocument`), so a
filesystem read of a governance document written with a bare `readFileSync` or
`existsSync` is invisible to it. That is the "empty result indistinguishable
from an absence of defects" shape, so I re-ran it over every fs read primitive:

```
$ grep -rlE 'readFileSync|readdirSync|existsSync|statSync|lstatSync|openSync|realpathSync|readlinkSync' src bin scripts
```

37 files against the narrow form's 23. The 17 files the narrow form could not
see are `scripts/m2-exit-test.sh`, `scripts/release-verify.sh`, `src/brief.ts`,
`src/commands/lock.ts`, `src/fleet.ts`, `src/gates/adapters/http-json.ts`,
`src/gates/coverage.ts`, `src/gates/credentials.ts`, `src/gates/deploy.ts`,
`src/gates/migrations.ts`, `src/gates/run.ts`, `src/lock.ts`,
`src/path-identity.ts`, `src/teardown.ts`, `src/version.ts`, `src/watcher.ts`
and `src/witness/run.ts`.

I then intersected that widened set with D3 BY DOCUMENT, which is the
intersection the mechanism actually needs, and inspected each newly-visible
file's reads:

| file | what its fs reads touch | a git-read counterpart of the same document? |
|---|---|---|
| `src/gates/deploy.ts` | none (zero matches) | n/a |
| `src/gates/migrations.ts` | none (zero matches) | n/a |
| `src/gates/coverage.ts` | one occurrence, inside a comment | n/a |
| `src/gates/credentials.ts` | `existsSync(env.HOME)` | no |
| `src/gates/run.ts` | `lstatSync`/`statSync` on evidence and probe paths | no |
| `src/witness/run.ts` | `lstatSync` on directories and `node_modules` | no |
| `src/gates/suite.ts` | `lstatSync`/`readdirSync` over the evidence tree | no |

I also widened D3 itself, because its pattern requires DOUBLE QUOTES and would
miss a git subcommand written with single quotes, backticks or a template:

```
$ grep -rlE "['\"\`](show|ls-tree|cat-file|rev-parse|log|grep|diff|worktree|blame|notes|for-each-ref|ls-files|archive)['\"\`]" src bin scripts
```

The widened form returns the SAME 14 files as the narrow one, so D3's scope was
adequate at the file level and its narrowness cost nothing.

**Result of the widening: no new instance of the mechanism in shipped code.**
The widened search returns nothing the narrow one did not, which is the answer
that makes the narrow one's emptiness informative rather than merely empty. The
`test/` exclusion remains genuinely uncovered and the work history names it
(section 3 item 1) including its consequence.

## 2. THE ORIGINAL FINDINGS, REPRODUCED AT `399953c` AND RE-RUN AT `2f3b651`

The mechanism the round names is one level above both reviewers' findings: a
decision assembled from TWO SOURCES OF TRUTH, one the git object database and
one the working tree. I accept that framing and I checked it by MEASUREMENT
rather than by reading the diff.

Method, identical at both heads and independent of the phase's own tests: a
scratch context directory built by me from the shipped template charter, the
repository's own `assurance-modes.yaml` and the `witness/fixtures/dual-review/`
verdicts, `git init` plus one commit, then the shipped gate script run from a
worktree of each head. Probe scripts are at
`/tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/delta-m4-p11/`.

| dangerous state | `399953c` | `2f3b651` |
|---|---|---|
| baseline: one family declared, everything committed | not-applicable, exit 20 | not-applicable, exit 20 |
| CR-M4P11-001 (deletion): a committed second-family verdict `rm`ed from the working tree only | **not-applicable, exit 20** (exception bought) | **red, exit 1** |
| CR-M4P11-001 (addition): one committed verdict plus an UNCOMMITTED second, manufacturing the pair | **not-applicable, exit 20** | **red, exit 1** |
| CR-M4P11-002 (extent): two COMMITTED second-family verdicts under `delivery/evidence/` | **not-applicable, exit 20** | **red, exit 1** |
| site 4 (regime), no declaration, pair shares `produced-by`, `delivery-mode: direct-pr` written to the working tree only | **green, exit 0** | **red, exit 1** |
| site 4 again, through `assurance-modes.yaml`: `merge-authority: owner` written to the working tree only | **green, exit 0** | **red, exit 1** |

In the deletion arm at `399953c`, `git show HEAD:delivery/review/b-other-phase.yaml`
still printed `produced-by: family-b` while the gate granted the exception, so
the reproduction is of the exact fact the Opus 5 review recorded.

**All three named findings are closed AT THE MECHANISM, not at the instance**,
and the round's own fourth site (the regime) is a strictly larger hole than
either review reported: at `399953c` an uncommitted one-word edit to
`delivery-mode` or to `merge-authority` turned the whole decorrelation
requirement off and returned exit 0. I reproduced both, and both are red now.

CR-M4P11-003 (the reviewer's fortieth witness) does not reach a shipped file and
the round records it as open with its cause unestablished. I did not reproduce
it either; it stays tracked.

## 3. WHAT THE ROUND BROKE

### DV-001 (HIGH, BLOCKING): the regime's PRESENCE probe moved to the commit and the script's refusal did not, so an UNCOMMITTED charter now buys a GREEN where it used to buy a RED

This is the round's own mechanism, in the round's own new code, at the round's
own fourth site, in the direction the round did not measure.

`establishDelegatedRegime` now asks `contextDocumentPresentAt(contextDirectory,
"charter.yaml", source)`, which on the commit arm is `git cat-file -t
<sha>:./charter.yaml`. Its `!charterPresent` arm returns `kind: "report"` and
prints, verbatim, `scripts/check-dual-review.mjs refuses such a directory
outright`. The script's refusal is still a WORKING-TREE probe,
`classifyEntry(join(directory, document)).kind === "absent"` over
`REGIME_DOCUMENTS`. The two probes now answer different questions, so a
directory whose charter exists ON DISK and in NO COMMIT passes the script's
refusal, reaches a check that reads the commit, is told there is no charter,
and is reported GREEN.

Measured, one context, one variable changed (the head of the repository the
shipped script is run from). Context: `delivery/review/` carries a COMMITTED
pair for phase M3-P9 both carrying `produced-by: family-a` (so the pair is
correlated and DR-0012 condition 1 is violated); `charter.yaml` and
`assurance-modes.yaml` are written into the working tree AFTER the commit and
are in no commit.

| head | result |
|---|---|
| `399953c` | **red, exit 1**, naming `produced-by value family-a occurs in 2 of the 2 verdicts for phase M3-P9` |
| `2f3b651` | **green, exit 0**, `no decorrelation violation and the pair approves` |

The green run's own record says:

```
REPORT dual-review-decorrelation <dir> declares no delivery mode (no charter.yaml),
so the verdicts for phase M3-P9 were NOT evaluated against a merge-authority
regime; scripts/check-dual-review.mjs refuses such a directory outright
```

The script did not refuse it. That sentence is false of the run that printed it,
which is the same defect shape as the arm-B sentence the Opus 5 review quoted
("all 2 committed verdict(s) carry it") and which this round corrected.

The asymmetry is only in the CHARTER. I ran the sibling arm as a control:
`assurance-modes.yaml` present on disk and absent from the commit gives
**exit 1** at `2f3b651`, because an unreadable modes document is a VIOLATION and
not a report. So one of the two regime documents is fail-closed and the other is
fail-open, which is what makes the missing one findable rather than a general
property of the design.

**This is a REGRESSION, not residue.** At `399953c` the same context was red,
because `establishDelegatedRegime` read the charter from disk, found it, and
applied the delegated regime. The round made the check stricter about SOURCE and
in doing so removed the only thing that was reading the document at all.

**Reachability, stated as DR-0027 requires.** Shipped files:
`src/checks.ts` (`establishDelegatedRegime`) and
`scripts/check-dual-review.mjs` (`REGIME_DOCUMENTS`), both under `src/` and
`scripts/`, the gate the registry declares at gate-registry.yaml:266. The
user-visible commands are `node scripts/check-dual-review.mjs <dir>` and
`tiphys gates run --only check-dual-review`, whose registry command is
`[node, scripts/check-dual-review.mjs, .]`, i.e. the repository root. The gate is
DR-0012 condition 1's merge gate. The actor model is the one the round's own
mechanism statement names: someone who can write a file and commits nothing.
Before this round that actor could not switch the regime off; after it, writing
an uncommitted `charter.yaml` into a repository that has none takes the gate from
`error` (the script's refusal) to `green`.

This repository is itself in the precondition state: `git ls-files` at this head
lists `assurance-modes.yaml` and NO `charter.yaml` at the root.

**The fix is one line and it is the round's own rule applied once more:** the
script's `REGIME_DOCUMENTS` refusal must probe the SAME source the check reads,
i.e. `contextDocumentPresentAt`/`resolveCorpusSource` rather than
`classifyEntry`. Equivalently, `establishDelegatedRegime`'s `!charterPresent`
arm must be a VIOLATION on the commit arm rather than a report, matching its own
`MODES_DOCUMENT` sibling twenty lines down.

**Red witness the round should have had:** an uncommitted CREATION of
`charter.yaml`. The round wrote and then DELETED the uncommitted-DELETION arm
(work history section 8, settling hit 341) after measuring it fail-closed, and
concluded the arm was covered. The deletion direction is fail-closed; the
addition direction is fail-open. One direction of a two-directional mechanism
was measured and the class was closed on it, which is the "one witness is not a
class" rule with the two members being the two directions.

### DV-002 (HIGH, BLOCKING): `listCommittedDirectory` lists NOTHING when the context directory is not the repository root, and an empty pair corpus makes a conditional gate report not-applicable

Same family as DV-001 and found by attacking the new git reads rather than the
old disk reads. The round replaced one `readdirSync` with two DIFFERENT git
listing idioms in the same file, and only one of them survives a context
directory that is a subdirectory of its repository.

- `listCommittedDirectory` (the PAIR corpus) runs
  `git ls-tree -z --name-only <sha>:./delivery/review` with cwd set to the
  context directory. `git ls-tree` applies the cwd prefix as an implicit
  pathspec, so inside a subdirectory the listing is filtered against a prefix
  the tree's own entries do not carry and comes back EMPTY, exit 0.
- `loadPaperworkVerdicts` (the FALSIFIERS' corpus) runs
  `git ls-tree -r -z --name-only <sha> -- ./delivery/`, a pathspec form whose
  output is cwd-relative, and it is CORRECT in the same directory. I checked
  both rather than assuming they behaved alike.

Measured, cwd = the context directory, one commit:

```
$ git cat-file -t $S:./delivery/review          -> tree      (exit 0)
$ git ls-tree --name-only $S:./delivery/review  -> <empty>   (exit 0)
$ git ls-tree --full-tree --name-only $S:./delivery/review
a-criteria.yaml
a-hazard.yaml
$ git ls-tree -r --name-only $S -- ./delivery/
delivery/review/a-criteria.yaml
delivery/review/a-hazard.yaml
```

The empty listing is then indistinguishable from an absent directory, because
`listCommittedDirectory`'s `git cat-file -t` probe succeeded and the `ls-tree`
that followed returned no names with exit 0. So "could not enumerate" becomes
"there are none".

**End-to-end, and it is fail-OPEN.** Context: a project at `proj/` inside a git
repository, `proj/delivery/review/` carrying two COMMITTED verdicts for one head
both `produced-by: family-a`, i.e. DR-0012 condition 1 violated, no
`review-families` declaration anywhere.

| head | result |
|---|---|
| `399953c` | **red, exit 1** |
| `2f3b651` | **not-applicable, exit 20**, `no verdict document is (corpus: delivery/review read from commit ...), so there is no pair of reviews to compare` |

`check-dual-review` is declared `applicability: conditional` at
gate-registry.yaml:286. What I MEASURED is the gate script: exit 20 where it
used to be exit 1. What I did NOT measure is the bundle aggregate over this
context, so the step from "the gate is not-applicable" to "the bundle does not
fail" is taken from CLAUDE.md's own four-fact reading procedure, which states
that the `required gate(s) not applicable:` line is selected on
`applicability === "required"`, and is left as a DEDUCTION rather than reported
as an observation. Either way the gate itself stops reporting a violation it
used to report, and prints a sentence asserting there was nothing to compare
about a commit that contains two verdicts.

**Reachability, as DR-0027 requires.** `src/checks.ts`'s
`listCommittedDirectory` is reached by `loadCommittedVerdicts`, which is reached
by BOTH merge-precondition checks (`dual-review-decorrelation` and
`verdict-pair-approves`) and by `scripts/check-dual-review.mjs`'s
`committedVerdictPaths`, including its `--precondition` arm. Both files are
shipped. The user-visible commands are `node scripts/check-dual-review.mjs <dir>`
and `tiphys gates run --only check-dual-review`.

The kernel's own repository does not hit this, because the registry command is
`[node, scripts/check-dual-review.mjs, .]` run from the repository root, so the
context directory IS the root. Every CONSUMER whose tiphys context is not its
repository root does hit it, and shipping to consumers is what this package is
for. That is the exact shape of a defect that no amount of green in this
repository can see.

**Fix:** `--full-tree` on the `<sha>:./<dir>` listing, or the pathspec form its
sibling twenty lines away already uses. Both were run above and both return the
two entries.

A second, smaller thing in the same function, stated as a reading of the code
with the code quoted rather than as a measurement:

```
  const typed = gitIn(["cat-file", "-t", `${refSha}:./${directory}`], contextDirectory);
  if (!typed.ok) {
    return { ok: true, names: [] };
  }
```

A `cat-file -t` that fails for any reason other than absence returns the same
value as an absent directory, so "absent" and "git could not answer" become one
answer. I did not construct a failing `cat-file` here, so this is an open
question rather than a measured defect; it is recorded because it is the
`could-not-look-reported-as-looked-and-found-nothing` shape the sibling
`loadPaperworkVerdicts` comment says it set out to avoid.

**Red witness the round should have had:** every arm of
`test/single-family-exception.test.ts` stages a context that is its own
repository root (`stage()` runs `git init` inside the scratch directory), so no
test in the phase can distinguish a root context from a nested one. This is the
`test/` exclusion the derivation names at work history section 3 item 1,
producing exactly the consequence that item predicts.

### DV-003 (MEDIUM, tracked): the fortieth witness IS reproducible at this head, and the work history says it is not

Work history section 6 ("CR-M4P11-003") and section 12 both state that the
fortieth failing witness the Opus 5 reviewer saw at `399953c` is "not
reproducible at this head" with its cause open. The round re-derived it at
`a7d007f`, which is BEFORE the rule (f) fix, when 39 rule (f) failures were in
the same output.

Measured by me at `2f3b651`, the committed head, the whole gate:

```
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: red-witness: error: 50 witness(es) evaluated (0 own, 50 stored re-evaluated in 277492ms)
...witness precondition-nonzero-exit-attributable no longer guards its behavior (member 0 red 2/2, member 1 red 2/2)
EXIT=21
```

From the gate's own `witness-records.json`, counted rather than eyeballed: 50
evaluations, 45 green, 4 error, 1 red; ZERO reasons containing `rule (f)`; one
occurrence of `no longer guards`. The red one is
`precondition-nonzero-exit-attributable`, and its recorded reason is
`member 0 (mutation of src/gates/run.ts): the named tests are not green at the
audited head`, with `headGreen: false` on both members. The reviewer's reading
was right.

So the sentence "not reproducible at this head" is false at the head it is
committed at. The cause remains unestablished: the named test
(`a precondition command exiting nonzero is error, not a skip, ...`) is GREEN
when I run it directly in this checkout (1 test, 1 pass, 0 fail, 0 skipped), so
the failure is a property of the witness runner's mutation lab at
`/tmp/tiphys-witness-*`, which is a file COPY of `src`, `test` and `bin` and not
a git checkout. That is standing warning 12's fourth qualifier, and it is the
same distinction the work history itself draws in section 9 about
`git archive` copies.

Not blocking on its own: it is a statement in `delivery/`, and the gate result
it mis-describes is reported accurately everywhere else. It is recorded because
a fix round that says a reviewer's finding is not reproducible, when it is,
retires a real finding by assertion.

### DV-004 (MEDIUM, tracked): rule (f) now imposes NO obligation when a phase adds a spawn and edits no witness

This is the residue of the rule (f) scope fix, and the work history does not
name it in section 12.

The fix is correct in what it removes and the round proves it: three tests, and
I defanged both directions myself rather than replaying theirs.

```
$ node --test --test-name-pattern 'subprocess call|spawning changed file' test/witness.test.ts
ok 1 - giving a file its first subprocess call imposes rule (f) on no member this phase did not author
ok 2 - a member this phase ADDED that touches a spawning changed file still owes a capture
ok 3 - a member this phase EDITED that touches a spawning changed file still owes a capture
# tests 3 / pass 3 / fail 0 / skipped 0
```

| defang | result |
|---|---|
| revert the loop to `for (const member of spec.dangerousStates)` | **not ok 1**, 2 pass |
| `if (false && spawningTouched.length > 0 && ...)` | **not ok 2, not ok 3**, 1 pass |

Both restored byte-identically (`cmp` against `git show HEAD:src/witness/run.ts`
exit 0). Two structurally different members for the "still owes" class, ADDED
and EDITED, and they are genuinely different: one is a new member, the other is
a `replace`-field-only edit of an existing one.

The residue: the obligation is now keyed on a phase OWNING a member. A phase
that gives a file its first subprocess call and touches no witness spec at all
imposes rule (f) on nothing, so a pre-existing witness whose behavior now
consumes that program's output carries no derived capture obligation and nobody
is told. That is measured by the round's own table, read the other way: 39 specs
went from obliged to unobliged with no spec edited.

Reachability: shipped `src/witness/run.ts`, the required `red-witness` gate.
I could NOT construct a case where a real defect ships as a result, because the
phase that adds the spawn normally also adds the tests, and a new member is
owned. Marked tracked rather than blocking on that basis, and recorded so the
residue is written down rather than discovered later: rule (f) is a DERIVED
heuristic and its derivation is now strictly narrower than before.

## 4. THE ROUND'S RED WITNESSES, DEFANGED BY ME

I did not replay the round's mutants. I wrote three of my own against the
corpus and regime fixes, each aimed at ONE site, so that the reddening is
attributable rather than general. Baseline first: node v22.22.2 at
`/opt/node22/bin/node`, `dist/` built, git clone checkout at `2f3b651`,
invocation `node --test test/single-family-exception.test.ts`:
27 tests, 27 pass, 0 fail, 0 skipped.

| defang | what it reverts | reddened |
|---|---|---|
| C1 | `loadCommittedVerdicts` takes the worktree arm unconditionally | 13 of 27, including 20, 21, 22, 23 |
| C2 | `readContextDocumentAt` reads the working tree unconditionally | exactly 2: **24** and **25**, the two regime arms |
| C3 | the falsifiers read `delivery/review/` again instead of the paperwork root | exactly 1: **22**, the placement arm |

`src/checks.ts` restored byte-identically after each (`cmp` against
`git show HEAD:src/checks.ts`, exit 0).

C2 and C3 are the interesting ones: a single-site revert reddens exactly the
tests that describe that site and nothing else, which is what distinguishes a
witness for a property from a test that happens to break. C1 is broad because
reverting the source of the whole corpus changes every arm, which is expected
and is why it is not the discriminating defang.

**One witness is not a class, checked per class:**

- "the corpus source" has members DELETION (test 20) and ADDITION (test 21).
  Genuinely different: one removes evidence that refutes, the other manufactures
  the pair DR-0012 condition 2 requires. Different guards, opposite directions.
- "the regime source" has members `charter.yaml`'s `delivery-mode` (test 24) and
  `assurance-modes.yaml`'s `merge-authority` (test 25). Different documents,
  different fields.
  **But the class has a THIRD direction and it is unwitnessed: PRESENCE.**
  Both members edit a document that exists in both the commit and the working
  tree. Neither covers a document that exists in ONE of them, and that is
  DV-001.
- "rule (f) still binds" has members ADDED and EDITED. Different.

## 5. COUNTS PINNED OVER AN APPEND-ONLY REGISTRY

CLEAN. `test/behaviors.json` gains nine entries, all appended, no existing entry
altered. The phase's test asserts BY NAME over an id list, and the only
`.length` comparison in the file is `assert.equal(seen.length, ARMS.length)`,
a self-comparison over a local array. No gate count, manifest count or
clause-map row count is pinned in either changed test file.

One arithmetic slip, INFO only: work history section 13 says "this round's eight
new behaviors all resolve". The diff adds NINE
(`witness-rule-f-binds-an-edited-member` is the ninth, added in the same commit
`2be54b0` the bundle was run at). Section 9's own suite arithmetic uses nine and
is right; the "eight" is stale against its own commit.

## 6. THE CLAIM GREPS, BOTH FORMS

Run by me at this head.

| scope | form | count |
|---|---|---|
| whole file | line-based, MATCHING LINES | 48 |
| whole file | line-based, OCCURRENCES | 108 |
| whole file | wrap-insensitive, OCCURRENCES | 108 |
| FIX ROUND 1 section | line-based, OCCURRENCES | 34 |
| FIX ROUND 1 section | wrap-insensitive, OCCURRENCES | 34 |

**Missed by wrap: 0, at both scopes.** The round's own table reports 34 and 34
for its section; I reproduce both exactly.

I audited the gap rather than only counting it. Every line-based hit in the FIX
ROUND 1 section is at an offset the round's settlement table names, or is one of
the two lines that quote the grep commands, or is settling prose sitting
adjacent to its own capture (offsets 537, 553, 565). The table's eight offsets
(71, 97, 268, 284, 341, 370, 433, 444) all resolve to the sentence the table
says is there; I read each. Three of the eight (341, 433, 444) match only the
EXTENDED pattern, not the binding one, which the round states.

**One settled hit is settled in one direction only, and that is DV-001.**
Offset 341: "an uncommitted DELETION of `charter.yaml` is refused by
`scripts/check-dual-review.mjs` before the check runs, with gate status `error`,
so that arm is already fail-CLOSED on the shipped path". The capture under it is
real and the sentence about DELETION is true. The conclusion drawn from it, that
the arm is fail-closed, is false for the ADDITION direction. I found no run of
that direction in the work history and I ran it myself: it is green at this
head, section 3, DV-001. A capture that settles one member of a two-member class
does not settle the class.

## 7. THE SUITE SENTENCE

Four qualifiers, mine, run at this head:

**Interpreter node v22.22.2 at `/opt/node22/bin/node` (the container default,
BELOW the declared floor); `dist/` BUILT (`npm ci` then `npm run build`, exit 0,
`git status --porcelain` clean apart from this report); invocation `npm test`;
tree a GIT CLONE CHECKOUT at `2f3b651` (`git clone --no-local` of the
repository, then `git checkout <sha>`): 908 tests, 905 pass, 1 fail,
2 SKIPPED, duration 374303ms.**

`/proc/loadavg` before: `5.66 5.69 7.86`. After: `9.68 9.66 9.08`. The box is
loaded by other work throughout, which is why no gate timing below is quoted as
a property of the branch.

The single failure, identified by name in a second targeted run:
`not ok 32 - a staged install of the built package reproduces the captured
contract live` in `test/doctor.test.ts` (32 tests, 29 pass, 1 fail, 2 skipped).
That is the floor-dependent-without-being-floor-gated test CLAUDE.md standing
warning 12 names, in a file this branch does not touch: it is absent from
`git diff --name-only origin/main...2f3b651`, which lists 50 files. The base was
therefore not re-measured for it; head-independence follows from the file being
unchanged, and both clean-room reviews measured the same failure at `399953c`.

908/905/1/2 matches the work history's own final row exactly. 908 minus the
899 both reviewers measured at `399953c` is 9, which is this round's nine new
tests, so no existing test was removed.

The coverage-gate flakiness the first round reported did not reproduce for me
either.

## 8. C-1, C-2, C-3

CLEAN. `git diff 399953c..2f3b651 -- src scripts schemas bin` matched none of
`process\.pid`, `/proc/`, `kill\(`, `SIGTERM`, `SIGKILL`, `detached`, `unref`,
`setTimeout`, `execFile`, `\.on\("exit`. Every new subprocess in the delta is a
`gitIn(...)` wrapper over `spawnSync` reading `ls-tree`, `cat-file -t`, `show`
or `rev-parse`: synchronous (C-3), reading stdout for DATA rather than probing
liveness (C-2), and reading whole blobs rather than a log tail (C-1).

## 9. SCOPE

The head declaration adds `src/witness/run.ts` and `test/witness.test.ts` to
`filesToTouch`. That is a head-side ADDITION, which `src/gates/scope.ts` admits
as a NAMED diff for a reviewer to sign off rather than accepting silently, and
nothing was removed. I sign it off: the required gate was red for a defect
eleven lines from a fix this repository had already made once for the sibling
rule, and the two alternatives (fabricating 39 capture declarations, or moving
the spawn to dodge the grep) are both worse. The work history argues it in
section 11 and the gate does not pretend to have decided it.

## 10. WHAT I DID NOT COVER

- **CI.** `check-dual-review` is registry-only and `scripts/m2-exit-test.sh`
  runs `--manifest`, so nothing in this verification has a CI witness either.
  T-009's second rule is unmet for this feature and was unmet before the round.
- **The `pull_request` union.** The branch is stacked on unmerged M4-P10, so the
  tree CI will build is not the tree I measured. Every measurement here is
  against `2f3b651` alone.
- **The full gate bundle.** I ran `red-witness` and the suite; I did not re-run
  `citations`, `scope`, `clause-map`, `coverage` or `license` at this head, so
  the round's section 13 table is taken on its own evidence except where I
  re-measured it.
- **The cause of the `headGreen: false` in the witness lab** (DV-003). I
  established that it reproduces and that the same test is green outside the
  lab; I did not find why.
- **Performance of the widened falsifier corpus.** The round states 103
  candidate blobs and 8953667 bytes in this repository, and the implementation
  spawns one `git show` per candidate. I did not time it on a large consumer
  tree.
- **Non-git contexts.** I exercised the commit arm throughout. The worktree arm
  has one test (23) and I did not attack it beyond reading the code, because no
  exception can be granted there.

## 11. THE ORIGINAL FINDINGS, ONE ROW EACH

| finding | mechanism it was an instance of | closed at the mechanism? | reproduced at `399953c` and gone at `2f3b651`? |
|---|---|---|---|
| CR-M4P11-001 (HIGH, Opus 5): the corpus is read from the working tree while the declaration is read from git | a decision assembled from two sources of truth | **YES**, and wider than reported: the round found and fixed a fourth site (the REGIME) that neither review reached and that switched the whole check off rather than one dimension | YES, both directions (deletion and addition), table in section 2 |
| CR-M4P11-002 (MEDIUM, Opus 5): the corpus is ONE DIRECTORY | the set a falsifier is evaluated over is narrower than the claim it falsifies | **YES**, the falsifiers now read every verdict document under the paperwork root, and the round states the remaining boundary (outside `delivery/`) in the source file rather than leaving it to be found | YES |
| CR-M4P11-003 (tracked, Opus 5): 40 failing witnesses, not 39 | a count derived from a grep over one run quoted as a property of the head | **NO**, and the round's statement about it is measured false: see DV-003 | The fortieth IS reproducible at `2f3b651`; I reproduced it |
| The required `red-witness` gate is not green at this head (HIGH, both reviewers) | a required gate that cannot pass bars merge whatever the reviews say | **THE PHASE'S OWN CONTRIBUTION IS CLOSED**: 39 rule (f) failures to ZERO, counted from the gate's own records, not from a grep | The gate is still NOT GREEN. It is `error`, exit 21, 4 stale mutation anchors plus the fortieth witness |
| Vacuity ARM 1 residue in `src/gates/result.ts` (LOW/tracked, Sonnet 5) | a constructor that can mint a `not-applicable` with `units: 0` and no vacuity flag | unchanged, and `src/gates/result.ts` is absent from `git diff --name-only origin/main...2f3b651` | n/a, still tracked |

On the four stale mutation anchors, I checked the round's attribution rather
than accepting it. Both find texts are absent from `src/checks.ts` at the
branch's own base `122472b` AND at this head (`grep -cF` returns 0 for each, in
both trees), and `git diff 122472b..HEAD -- src/checks.ts | grep -cE
'^[-+].*(DELEGATED_MERGE_AUTHORITY|authorityReading)'` returns 0. They are
M4-P10's and this round did not create them. That does not make the gate green.

## 12. VERDICT

**FIX-ROUND-NEEDED.**

The round is good work. It named a mechanism rather than three findings, it
derived from the mechanism and found a FOURTH site that was strictly worse than
anything either reviewer reported, it stated six exclusions, its claim-grep
arithmetic reproduces exactly, its citations are 8 of 8, its red witnesses
survive targeted single-site defangs, and it closed the phase's whole
contribution to the red-witness gate. I reproduced every closure it claims for
CR-M4P11-001 and CR-M4P11-002, in both directions, at both heads.

It is not mergeable, for two reasons that are this ROUND'S, not the previous
one's:

- **DV-001 (HIGH, blocking).** Moving the regime's PRESENCE probe to the commit
  while leaving the gate script's refusal on disk turned an uncommitted
  `charter.yaml` from a RED into a GREEN, and made the record print a sentence
  asserting a refusal that did not happen. Reaches `src/checks.ts`,
  `scripts/check-dual-review.mjs` and `tiphys gates run --only
  check-dual-review`. It is the round's own mechanism, at the round's own fourth
  site, in the one direction the round did not measure.
- **DV-002 (HIGH, blocking).** `listCommittedDirectory` lists nothing when the
  context directory is not the repository root, so a committed correlated pair
  reports `not-applicable` on a conditional gate instead of red. Reaches the
  same shipped files and the same command, for every consumer whose tiphys
  context is not its repository root. Invisible in this repository by
  construction, because the gate runs with `.` at the root.

Both are REGRESSIONS: the same contexts were red at `399953c`.

DV-003 and DV-004 are MEDIUM and TRACKED under DR-0027: DV-003 is a false
statement in `delivery/`, and DV-004 is a narrowing of a derived heuristic for
which I could not construct a shipping defect.

Separately, and not graded by me because it is not this round's: the required
`red-witness` gate is `error` at this head, so DR-0012's "CI green on that exact
head" is unmet. Four fifths of that is M4-P10's, with three independent
attribution facts I re-measured; the fifth is DV-003's fortieth witness.

### What I tried to break and how it held

- **Held.** The declaration's provenance. Unchanged from round 1 and still
  pinned to a blob sha256.
- **Held.** The corpus SOURCE, both directions. Deletion and addition, measured.
- **Held.** The corpus EXTENT. Placement under `delivery/evidence/` no longer
  defeats falsifier 1; defang C3 reddens exactly the one test that says so.
- **Held.** The REGIME, for EDITS. One uncommitted word in either of two
  documents used to buy exit 0 and now buys exit 1.
- **Held.** Rule (f). Both defang directions redden the arms they should, and
  the anti-laundering arm is a real edited-member witness, not a restatement.
- **Held.** C-1, C-2, C-3, the append-only registry, the claim-grep arithmetic,
  the citation set, the suite arithmetic.
- **BROKE.** The REGIME, for PRESENCE. An uncommitted `charter.yaml` is green.
- **BROKE.** The pair corpus, for a nested context. Two committed correlated
  verdicts report "no verdict document".
- **BROKE.** The claim that the fortieth witness is not reproducible.
