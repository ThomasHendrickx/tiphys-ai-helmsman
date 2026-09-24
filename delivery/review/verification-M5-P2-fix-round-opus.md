# Delta verification: M5-P2 fix round 1 (Opus)

- Date: 2026-09-23
- PR: #207
- Branch: claude/m5-p2-intent-to-outcome
- Head verified: b86b2eb (previous head reviewed: e0e4118)
- origin/main at verification: cb5de0d (one commit past the merge base e81c5e8;
  `git merge-tree --write-tree origin/main HEAD` exit 0, tree ff007d9)
- Contract: delta verification of fix round 1 (CR-001, CR-002, CR-003,
  CR-M5P2-01), with the orchestrator's five questions
- Model family: Opus
- Method: re-executed on node v26.6.0 (scratch toolchain, `node --version`
  checked in each shell). Fleet probes ran from real `tiphys init` fleets.
  Mutations of the shared rule ran against BOTH consumers' test files, with
  restore by copy and a `cmp` check. Every witness member was applied alone.
  My own derivation grep. The suite ran in this worktree. The PR bundle ran in
  a scratch clone checked out on the real phase branch name, so the scope gate
  applies.

## Verdict: APPROVE

| severity | count |
|---|---|
| high | 0 |
| medium | 0 |
| low | 4 |

CR-001 is closed by mechanism, not by instance. There is now one location
rule, shared by both commands. Doctor and the composer read the same file in
a real fleet. The central classification is guarded from both consumers:
one mutation turned three doctor tests and two composer tests red.
The four lows are gaps in a guard or in wording. None of them turns a red
into a green on the paths that were fixed. They can be carried as follow-ups
or closed in a small extra commit.

## 1. CR-001 is closed (executed)

Scratch script p2fr-fleet.sh. Every case ran from a `tiphys init` fleet root,
with the charter written into `charter/`:

| case | compose exit | what it printed |
|---|---|---|
| one charter, `charter/svc.yaml` | 0 | intent carried; `charter: <fleet>/charter/svc.yaml`; doctor's retention line names the same path |
| one charter, `.yml` extension | 0 | carried |
| two charters | 1 | "2 charters are declared (<one>, <two>) ... name one with --charter"; stdout empty |
| two charters, `--charter` picks one | 0 | the picked charter only |
| root `charter.yaml` plus a charter in `charter/` | 1 | both named |
| only non-charter YAML (`kind: notes`) | 1 | "1 YAML document(s) ... none with kind: charter"; doctor WARN with the same count |
| a charter plus a stray non-charter YAML | 0 | the charter is used (see CR-FR-03) |
| undecodable YAML alone | 1 | "is not valid YAML ..."; doctor FAIL with the identical reason text |
| undecodable stray beside a good charter | 1 | refused, naming the stray |
| named pipe in `charter/` | 1 | "is a named pipe, not a regular file, so it was not opened", bounded |
| charter without product-intent | 1 | "declares no product-intent" |
| empty YAML file | 1 | counted as non-charter YAML |
| fresh fleet, or only `README.txt` | 0 | undeclared sentence naming both places searched |
| `charter` is a regular FILE, not a directory | 0 | undeclared sentence, which is false here (CR-FR-02) |

## 2. The shared module and the doctor refactor

**Reading.** src/charter.ts `readCharterDirectory` is doctor's old loop,
lifted: same sorted walk, same `.yaml`/`.yml` filter, same candidate count,
same `readRegularFileIfPresent` and `decodeDocument` calls, and the same
reason strings. One real difference exists. The old loop returned at the
first refused, undecodable or retention-less entry and never read the rest.
The new one reads and classifies every entry, and then doctor consumes them
in the same order with the same early returns. The verdict and the detail
string are therefore unchanged for every case. The only extra cost is the
reads after the first returning entry. Those are bounded, because a pipe or
device is refused by type and never opened.

**Doctor's tests.** `node --test test/doctor.test.ts`: 51 tests, 51 pass,
twice at baseline. In one earlier mutation run, one unrelated doctor test
failed once ("CHECK worktrees reports an unlistable pool as FAIL instead of
letting the run abort"). It passed on the rerun and on both baseline runs, so
I record it as a flake and not as a result.

**Mutations of the shared rule** (scratch scripts p2fr-mut.sh and
p2fr-mut2.sh, both test files run in full each time, `cmp` RESTORED):

| mutation in src/charter.ts | doctor.test.ts | brief-compose.test.ts |
|---|---|---|
| MA: kind check never matches | exit 1, 3 red: retention PASS/FAIL-on-ignored, missing-path FAIL with `--for full`, never-PASS five shapes | exit 1, 2 red: the fleet-init test and the fleet-ambiguous test |
| MB: undecodable entry classified as not-charter | exit 0 | exit 0 |
| MC: `.yml` dropped from the filter | exit 0 | exit 0 |
| MD: refused entry classified as absent | exit 0 | exit 0 |

MA answers the question: the shared rule's core is guarded from BOTH
consumers. MB, MC and MD are CR-FR-01.

## 3. The derivation (fix-round contract)

My own grep for charter-locating sites, excluding comment lines:
`git grep -n -i charter -- src plugin/src scripts bin`, minus
src/charter.ts, src/commands/brief.ts, src/checks.ts and
scripts/check-dual-review.mjs (which the work history classified). Each
remaining hit is one of: the doctor retention reader (now shared); a
directory-name list (src/fleet.ts, src/commands/init.ts,
plugin/src/hooks/project-write-block.ts, scripts/rehearse-cutover-rollback.mjs);
the validate type map; scripts/m1-exit-test.sh, which WRITES
`<fleet>/charter/charter.yaml` (consistent with the rule); and
plugin/src/model-resolution.ts.

The last one is not in the work history's table. I checked it: it RECEIVES a
charter (`policy.charter?: {path, tier}`) and locates none. `git grep -ln
"charterOverride\|charter-override" -- plugin src scripts` finds only
itself and src/checks.ts, so nothing in the repository supplies it a charter
yet. It is not a missed locator. It is the next place a charter will need
locating, and it should use src/charter.ts when it does. I did not find a
missed charter-locating site.

The not-covered section is honest. It names untracked files, `test/`,
`templates/`, `schemas/`, and dynamically built paths, and says the search
went no further. My grep used a looser token (`charter`, case-insensitive)
and confirms the set.

## 4. Wording and declaration grants

- **CR-003 wording, roles/implementer.md.** It now says "You write this in
  your report, not as a separate document. The orchestrator carries your
  answer into the final report's `delivered-outcome` object". Correct and
  plain. AGENTS.md gains the matching orchestrator paragraph ("The final
  report is yours ... check it against the reviews, not just copy it"). Both
  validate as role briefs, exit 0. check-agents-references is green, 23
  references. CLOSED.
- **CR-002, roles/README.md.** Usage now shows `[--charter <file>]`, and the
  composed order includes the Intent section. CLOSED, with one inaccuracy in
  the new rule text (CR-FR-03).
- **Declaration grants added at head.** The scope gate prints them by name
  (bundle result below). My judgement on each:
  - `src/charter.ts`: required by the mechanism fix. Accept.
  - `src/commands/doctor.ts`: required, so one rule has one home. The
    refactor preserves behaviour (section 2). Accept.
  - `roles/README.md`: required by CR-002. Accept.
  - `AGENTS.md`: required by CR-003. Accept, with a note: M5-P5's plan entry
    PRUNES AGENTS.md (files-to-touch at
    delivery/plan/value-delivery-plan.yaml:346), and its `conflicts-with` is
    empty. P5 must keep this paragraph. The orchestrator should say so in
    P5's brief (CR-FR-04).
  - `witness/`: a DIRECTORY prefix, broader than the three files it needs.
    It lets this phase edit any other phase's witness spec without the file
    being named. Accept for this round, since the diff touches only the three
    new specs (`git diff --name-only e0e4118 HEAD -- witness/`). Narrowing it
    to the three paths is better practice (CR-FR-04).

## 5. Witnesses, suite and bundle

**Witness members, each applied alone** (scratch script p2fr-wit.sh; each
`find` confirmed unique before applying; restored, tree clean afterwards):

| spec | baseline | member 0 | member 1 |
|---|---|---|---|
| witness/p2-charter-fleet-init.json | 1 test, 0 fail | exit 1, 1 fail | exit 1, 1 fail |
| witness/p2-charter-fleet-ambiguous.json | 1 test, 0 fail | exit 1, 1 fail | exit 1, 1 fail |
| witness/p2-evidence-distinct.json | 1 test, 0 fail | exit 1, 1 fail | exit 1, 1 fail |

**Suite.** `npm test` at b86b2eb, node v26.6.0, `dist/` built, in this
worktree: exit 0, tests 1404, pass 1404, fail 0, cancelled 0, skipped 0.

**Bundle.** See "PR bundle" below.

**Other checks**, all exit 0: `validate --type final-report
templates/final-report.example.yaml`; role-brief validation of
roles/implementer.md, roles/clean-room-reviewer.md and AGENTS.md;
`check-brief-drift.mjs --check`; `check-authored-bytes.mjs`. The claim grep
over the "Fix round 1" section gives 0 hits in both the line-based and
wrap-insensitive forms.

The evidence schema change (CR-M5P2-01, the other reviewer's finding) was
checked in passing. The item pattern `[A-Za-z0-9]` is a single class with no
quantifier. `uniqueItems` holds. The honest two-entry example validates.

## Findings

### CR-FR-01 (low): the shared walker's fail-closed arms are unguarded in both consumers

**Claim.** Three mutations of src/charter.ts leave both test files green:
MB (an undecodable entry becomes not-charter), MC (`.yml` ignored) and MD
(a refused entry becomes absent).

**What each costs.**
- MC in the composer is the CR-001 shape again: a fleet whose only charter is
  `svc.yml` would compose exit 0 with "no charter declared". My probe shows
  the unmutated code handles `.yml` correctly, but nothing keeps it that way.
  CR-001's class, "a charter is present and the composer calls it
  undeclared", is witnessed for `.yaml` in `charter/` only. One witness is
  not a class.
- MB and MD in doctor turn a FAIL (pipe or undecodable charter) into a quieter
  verdict. This gap is PRE-EXISTING: `grep -n "mkfifo\|not valid YAML\|\.yml"
  test/doctor.test.ts` finds only an AGENTS.md FIFO case. But the round made
  this code the SHARED rule, so the gap now covers two commands.
- In the composer, MB and MD mostly still fail closed through the
  non-charter-YAML count. They fail open only beside a good charter.

**Fix.** Extend the fleet-init test with a `.yml` charter, and with an
undecodable document and a named pipe in `charter/`, each asserting exit 1
and naming the entry. Add MC and MB (or MD) as members of an existing or new
witness spec.

### CR-FR-02 (low): an unlistable `charter/` is reported as undeclared

**Claim.** `readCharterDirectory` treats ANY `readdirSync` error as
"no-directory". When `charter` is a regular file (ENOTDIR, executed) the
composer exits 0 and says `charter/` "holds no YAML document". That sentence
is false. The same arm would take EACCES on a directory that cannot be
listed, which I could not run because the container runs as root.

**Why it is low.** It needs a broken fleet layout, and doctor's layout check
FAILs that layout loudly. It is still the stale-charter hazard in miniature:
a place that cannot be read is reported as empty.

**Fix.** Return "no-directory" only for ENOENT. Any other error becomes a
refusal in `locateCharters`. Doctor can keep its current WARN, because its
layout check owns the condition.

### CR-FR-03 (low): roles/README.md overstates when non-charter YAML stops composition

**Claim.** The new README text says "YAML in `charter/` that is not a charter
... stop[s] composition". That is true only when NO charter is found. The C2
probe (a charter plus `notes.yaml`) composes exit 0, and that is the right
behaviour.

**Fix.** Change it to: "YAML in `charter/` of which none is a charter".

### CR-FR-04 (low): two notes on the declaration grants

1. The `witness/` grant is a directory prefix. Narrow it to the three spec
   files.
2. The AGENTS.md grant creates an overlap the plan does not record: M5-P5
   prunes AGENTS.md and declares `conflicts-with: []`. Tell the P5 dispatch
   to keep the delivered-outcome paragraph, or record the overlap.

Neither is a defect in this diff.

## Probes that found nothing

- Symlink and pipe at the root `charter.yaml`: refused through the lstat
  candidate rule (read, and exercised by the round-0 fails-closed test,
  which is green in the 1404 run).
- `--charter` naming one of several: composes with only the named intent.
- The kernel repository root: it has `charter.yaml` and no `charter/`, so
  exactly one candidate. The existing composer tests that run with cwd at
  the repository root are green.
- witness/doctor-kernel-artifacts-resolution.json has a member whose `find`
  occurs twice in doctor.ts. It also occurs twice in origin/main's doctor.ts
  (checked with `git show origin/main:src/commands/doctor.ts`), so it is
  pre-existing, as the work history says.

## Honest failures

- The EACCES arm of CR-FR-02 was not executed, because the container runs as
  root.
- I did not read CI for b86b2eb. The orchestrator owns that observation.
- The first bundle attempt in the scratch clone did not run (the branch
  already existed, so the checkout never populated the tree: npm ci exit 1,
  bundle exit 127). It was rerun after `git reset --hard b86b2eb`. Only the
  rerun counts.

## PR bundle

Run in a scratch clone of this repository, on a local branch named
claude/m5-p2-intent-to-outcome at b86b2eb, so the scope gate's
phase-branch precondition holds. The clone's origin/main was cb5de0d and the
merge base was e81c5e8. npm ci 0, build 0, node v26.6.0.

`scripts/m2-exit-test.sh --base origin/main --head HEAD --phase m5-p2
--bundle pr --no-build <scratch>`: **exit 0**.

- `gates: declared 15 applicable 10 verdict 10 green 10 red 0 not-applicable 5 error 0 vacuous 0`
- scope: green, 19 changed paths audited against the merge-base
  declaration. It printed "DECLARATION AMENDED AT HEAD: 5 entry/entries
  ADDED ... filesToTouch AGENTS.md, filesToTouch roles/README.md, filesToTouch
  src/charter.ts, filesToTouch src/commands/doctor.ts, filesToTouch witness/
  (DIRECTORY PREFIX: grants every current and future path under it, not one
  file)". Those are exactly the five I judged in section 4.
- red-witness: green, 26 witnesses evaluated (3 own, 23 stored re-evaluated),
  "every witness red against every declared dangerous state and green at
  head".
- Required gates not applicable: citations only.
- m2-assert: 15 records, zero red, zero error, zero vacuous.

This bundle ran on a different machine path from my first-review run, which
could not satisfy the scope precondition from a detached head. That
limitation from the first review is therefore discharged.
