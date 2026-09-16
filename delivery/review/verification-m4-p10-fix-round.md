# Delta verification: M4-P10 fix round

Reviewer role: delta verifier. Started 2026-09-16.

## Plan

1. Confirm the dispatched head sha resolves.
2. Read CLAUDE.md, plan section, work history in full.
3. Run the work history's own derivation command, then widen it.
4. Walk each original finding: mechanism, other call sites, reproduction at
   the old head versus the new one.
5. Attack the round itself: red witnesses, fail-open guards, pinned counts,
   the claim grep (both forms), the suite sentence, C-1/C-2/C-3.
6. Apply DR-0027 reachability to every HIGH/MEDIUM and set blocking status.

Written incrementally; this file is the beacon.

## 0. A stale clone cost the first hour of this review, and the correction
##    is recorded rather than erased

`git clone --no-local /home/user/tiphys-ai-helmsman <scratch>` clones from a
LOCAL FILESYSTEM MIRROR, not from GitHub. That mirror's copy of
`claude/m4-p10-verdict-head-and-medium` was itself stale: it stopped at
`deae190a03affe711efa854fefcfd6fe0454d63f` (the commit that lands the two
clean-room reviews), one commit short of where the real branch already was.
The dispatched head, `a6db78d94b61e812526f22a5a2d751e45c003fe5`, did not
exist in that mirror at all.

I treated the sha's absence as a dispatch error and wrote most of a review
against `deae190a03affe711efa854fefcfd6fe0454d63f`, concluding (correctly,
for that commit) that no fix-round code existed yet, since the only
commit past the reviewed head `6a5e5af` was the evidence-landing commit.
That conclusion could not survive contact with the real branch: pushing my
own report commit to `origin` failed as a non-fast-forward, which is what
uncovered the mirror's staleness. `git remote set-url origin
https://github.com/ThomasHendrickx/tiphys-ai-helmsman` and a fresh `git
fetch` produced the real tip:

```
$ git fetch origin claude/m4-p10-verdict-head-and-medium
   deae190..a6db78d  claude/m4-p10-verdict-head-and-medium -> origin/...
$ git cat-file -t a6db78d94b61e812526f22a5a2d751e45c003fe5
commit
```

The dispatched sha was correct all along. **The lesson kept for this
project's own record: a clone taken with `--no-local` from a sibling
session's working copy is only as fresh as that copy, and a sha that fails
to resolve there is not proof the sha is wrong.** A stale local mirror and a
wrong dispatched sha produce the identical symptom (`git cat-file -t`
fails), and the only way to tell them apart is to check the REAL remote,
which is what I should have done before writing a page of analysis against
the wrong commit. The rest of this document is against the real head,
`a6db78d94b61e812526f22a5a2d751e45c003fe5`, rebased my report commit onto
it (`git rebase --onto a6db78d... deae190... claude/m4-p10-...`), and
redid every measurement below from there.

## 1. The delta actually contains a fix round

`git log deae190a03affe711efa854fefcfd6fe0454d63f..a6db78d94b61e812526f22a5a2d751e45c003fe5`
shows six commits, not one, ending in "Work history: the suite-gate finding,
the gate bundle, and the claim grep re-measured". `git diff --stat` between
the two: 11 files changed, 1155 insertions, 67 deletions, touching
`src/checks.ts`, `scripts/check-dual-review.mjs`, four `witness/*.json`
specs, `test/dual-review.test.ts`, `test/verdict-head.test.ts`,
`test/behaviors.json`, the phase declaration, and 743 new lines in the work
history (its section 11, "FIX ROUND 1"). This is a real fix round with real
code, not a paperwork-only commit.

## 2. What the work history's own fix-round section claims

`delivery/work-history/m4-p10.md`'s section 11 (lines 916-1531 in the
current file) is unusually thorough, and states, per its own row-by-row
disposition table (11.1):

| finding | disposition claimed |
|---|---|
| opus5 HIGH: four stale witness `find` strings | FIXED (11.3) |
| opus5 MEDIUM: unreadable third review silently dropped | FIXED, "and it was one of FIVE sites" (11.2) |
| opus5 MEDIUM (tracked): scope gate red, 27 inherited files | NOT fixed, not fixable in this phase (11.8) |
| fable: stale citations | FIXED for every citation (11.7) |
| fable: `preHeadCommit()` 200-commit walk | NOT fixed, left as a future trigger (11.9) |

It also reports finding TWO further defects itself, beyond both reviews:
a masking bug in its own first attempt to fix the HIGH finding (11.5, a
guard that could not go red because a second rule's message shared its
first twelve words with the rule the tests already asserted), and the
`suite` gate being red the whole time at `6a5e5af` because
`test/behaviors.json`'s values were prose descriptions rather than the
literal test names the gate matches against (11.11).

I did not take this table on faith. Below is what I independently checked
against it, and where I could not check something myself, I say so rather
than repeating the claim as my own finding.

## 3. HIGH finding: reproduced fixed, independently

**The mechanism, unchanged from my own first pass**: a witness spec's
`find` field targets shipped source by exact string; a refactor can zero
its occurrence count (loud error) or double it (silent, since
`.split(find).join(replace)` applies to every match). I re-ran my own
widened derivation, over every `witness/*.json` file's `src/checks.ts`
mutation members, against the FIXED head:

```
$ python3 - <<'PY'
import json, glob
checks = open("src/checks.ts").read()
total = 0
missing = []
for path in sorted(glob.glob("witness/*.json")):
    data = json.load(open(path))
    for ds in data.get("dangerousStates", []):
        if ds.get("kind") == "mutation" and ds.get("file") == "src/checks.ts":
            total += 1
            cnt = checks.count(ds["find"])
            if cnt != 1:
                missing.append((path, cnt, ds["find"][:80]))
print(f"total members: {total}, off-count members: {len(missing)}")
for m in missing: print(m)
PY
total members: 79, off-count members: 1
('witness/checklist-duplicate-probe-id-guard.json', 2, ...)
```

Down from 7 off-count members (6 of them the dual-review family) before the
round, to 1. The one remaining is the SAME pre-existing, phase-unrelated
member I found before the round even started (identical count, 2, at both
`origin/main`'s merge base and the current head; already being addressed on
the sibling M4-P11 branch per `git log --all --oneline` showing
`1edfb89 Four witness members on main are BLUNTED: they match two sites,
silently`). The widened search finds nothing new attributable to this
round.

**Live reproduction against the shipped gate**, not only the static count:

```
$ node --experimental-strip-types bin/tiphys.ts gates run --registry gate-registry.yaml \
    --mode full --only red-witness --evidence <dir> --base origin/main --head HEAD
```

This run was still in flight when I finished drafting the rest of this
document (39 stored witnesses under heavy container contention take
several minutes); its result is appended at the end of this section once it
completed, unedited from what the tool printed.

```
gates: run 560c528811920954504b9764
gates: registry gate-registry.yaml mode full
gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
gates: red-witness: green: 39 witness(es) evaluated (4 own, 35 stored
  re-evaluated in 512430ms); every witness red against every declared
  dangerous state and green at head
gates: every applicable gate is green
```

**GREEN, confirmed live and independently**, not merely by re-reading the
work history's own claim of green at an earlier intermediate commit
(`3098650`). This run is at the actual final head,
`a6db78d94b61e812526f22a5a2d751e45c003fe5`, `--base origin/main`, the same
invocation this repository's own required `pull_request` gate uses. `4 own`
matches the work history's own deduction (this branch changes exactly four
files under `witness/`, each one spec); `35 stored re-evaluated` plus the
`0 red 0 error` verdict means all 39 stored witnesses this diff triggers,
including the four repointed ones, are now red against their dangerous
states and green at this head. The HIGH finding's mechanism (a `find`
string losing uniqueness) is fixed for every site this round's diff
touches.

**A detail the work history's own section 11.3 surfaces and I checked
independently**: the fix does not merely repoint the four broken `find`
strings, it also repairs the "blunted" one my first pass found
(`dual-review-requires-two-verdicts` member 0, which had drifted from
matching once to matching twice because round 0 added a second, textually
similar guard). The repointed member now carries three lines of
surrounding context specific to the `dualReviewDecorrelation` check
(the `"#/phase"` pointer, which is unique to it; `verdictPairApproves` uses
`"#/verdict"`). I confirmed this distinguishes the two sites by checking
both messages directly in the current source:

```
$ grep -n 'a delegated grant requires two independent\|condition 2 is a property of the PAIR' src/checks.ts
3702:  ...and a delegated grant requires two independent clean-room reviews of the exact head
3919:  ...and DR-0012 condition 2 is a property of the PAIR, so it cannot be satisfied by fewer than two
```

Two distinct message tails, confirming the two call sites of the
`if (group.length < 2)` shape are now textually distinguishable at the
line the witness's context now anchors on. I also checked that the TESTS
were tightened to match, not only the spec (this is the part that actually
closes the masking bug; a repointed witness anchor with an unchanged,
prefix-only test assertion would still mask):

```
$ grep -n 'only 1 verdict document\|condition 2 is a property of the PAIR' test/dual-review.test.ts test/verdict-head.test.ts
test/dual-review.test.ts:243: ...(check: dual-review-decorrelation)
test/verdict-head.test.ts:575: ...(check: dual-review-decorrelation)
test/verdict-head.test.ts:582: ...(check: verdict-pair-approves)
```

Both the distinguishing tail AND the emitting check id are now asserted,
in two separate assertions rather than one regex either rule could satisfy.
This matches what section 11.5 claims and is not merely restated from it.

**Verdict: FIXED, confirmed independently at both the static and the live
gate level.**

## 4. MEDIUM finding: reproduced fixed, independently, with my own fixture

**The mechanism, unchanged from my own first pass**: `loadCommittedVerdicts`
treated "does not decode" identically to "is legitimately prose", both
silently skipped. The fix (`git diff deae190 a6db78d -- src/checks.ts`,
inspected directly) changes this: an unreadable or undecodable `.yaml`/
`.yml`/`.json` file is now pushed onto a new `unexaminable: Diagnostic[]`
array that both `dualReviewDecorrelation` and `verdictPairApproves` seed
their violations with, rather than being `continue`d past. A parallel fix
was made at `headGroupFor` (a verdict whose `phase` cannot be established
now becomes a diagnostic instead of silently failing the join), and at
`scripts/check-dual-review.mjs`'s own `committedVerdictPaths`, which the
work history says was a FIFTH site neither review named.

**Reproduced live, with my own fixture, against the FIXED script** (same
staging shape as before the round, `test/dual-review.test.ts`'s own
`stageContext`, quoted rather than resolved since that file is one this
branch changes):

```
$ node scripts/check-dual-review.mjs <dir with a.yaml, b.yaml (both APPROVE), and
    a third file, c-broken.yaml, containing:
    "kind: verdict\nphase: M3-P9\nhead: dcbe6704...\nverdict: FIX-ROUND-NEEDED\n  bad: [unclosed">
check-dual-review: error (0 review verdicts examined for decorrelation)
1 document(s) under <dir>/delivery/review could not be examined, so whether
a review refusing this head is among them is unknown and no merge verdict
can be reached: <dir>/delivery/review/c-broken.yaml did not decode:
<dir>/delivery/review/c-broken.yaml is not valid YAML: Nested mappings are
not allowed in compact mappings
exit=21
```

Before the round, the identical fixture produced `check-dual-review: green
(2 review verdicts examined for decorrelation) ... the pair approves`,
`exit=0`, with the broken file never named (I measured this myself against
the pre-round code before I knew a real fix round existed; see Section 6).
After the round: the gate ERRORS, names the exact file, and states plainly
that no merge verdict can be reached, rather than silently reporting two
verdicts and moving on. This is the fail-closed direction DR-0012's own
merge precondition needs and it is now what the shipped script does, not
only what the work history claims it does.

**Verdict: FIXED, confirmed independently with my own fixture, not merely
re-run from the work history's example.**

## 5. The MEDIUM (tracked) scope finding: correctly left open

opus5's third finding (scope gate red, 27 inherited paperwork files) is
unchanged, as both the original review and the work history's own section
11.8 agree it should be: the branch was cut from
`plan/pstack-borrow-review` rather than from `main`, and the scope gate
reads the phase declaration from the merge base, which does not yet carry
it. Fixing this is not a code change available to this phase (it would
require the declaration to already be on `main`, or the branch to have
been cut differently, neither of which an implementer inside this phase
can retroactively do). I re-confirm the reachability call: confined to
`delivery/`, no shipped file, no user path. **TRACKED, not blocking**, as
both original reviews and the work history already conclude.

## 6. My own first-pass numbers, against the stale head, recorded for
##    the record rather than discarded

Before discovering the mirror was stale, I independently reproduced the
HIGH and MEDIUM findings as OPEN against `deae190a03affe711efa854fefcfd6fe0454d63f`
(the same code as the reviewed head `6a5e5af`, since no code changed
between them): the red-witness gate errored with the same five broken
members opus5 named, and my own fixture reproduced the silently-dropped
third review. Those measurements are not wrong, they are simply about a
commit that was never actually "the current head": the real fix round
(Sections 3-4 above) already existed on GitHub when the dispatch was
written. I am keeping this section rather than deleting the earlier work,
per this project's own practice of not softening or erasing a working
history's record of what was actually measured and when.

## 7. First check, applied to the ROUND's own derivation (fix-round
##    contract item 3)

The round's own not-covered statements are unusually explicit (11.2's
bullet list and 11.9's additions). I ran its central derivation command
myself rather than trusting the printed output:

```
$ grep -n 'continue;' -B 6 src/checks.ts | sed -n '/function loadCommittedVerdicts/,/return { ok: true, verdicts/p'
```

reproduces the same site enumeration the work history's table in 11.2
lists (12 sites, 5 of them changed from skip to diagnostic). I widened
this in the one direction the round's own section 11.6 concedes is a
judgment call rather than a measurement: a `.yaml` whose `kind` is present
but not a scalar (a list, say). I did not leave this as an open question:
I built the fixture and ran it, at the current (fixed) head, with the same
staging shape as Section 4:

```
$ <third file c-list-kind.yaml, alongside two real APPROVE verdicts>
  kind:
    - verdict
  phase: M3-P9
  head: dcbe6704813e861736c8d394dca35f7dc31b4f93
  verdict: FIX-ROUND-NEEDED
$ node scripts/check-dual-review.mjs <dir>
check-dual-review: green (2 review verdicts examined for decorrelation)
2 verdict(s) examined ... no decorrelation violation and the pair approves
exit=0
```

**This is the SAME fail-open shape Section 4 shows fixed for the decode
case, still present through this one arm.** A third, genuinely refusing
review (`verdict: FIX-ROUND-NEEDED`) whose `kind:` field is a YAML list
rather than a scalar string is silently dropped and the gate reports the
pair approves, exactly as an undecodable file did before this round. The
work history's own reasoning for treating this as a determinate "not a
verdict" answer (11.6: "a document declaring a list-valued `kind` has said
it is not a verdict") does not hold up against this fixture: the document
plainly IS a verdict, malformed in one field, not a prose review that
happens to share a directory. A `kind:` typo shaped this way (`kind:
[verdict]`, or a YAML block-list slip) is exactly the kind of accident this
mechanism exists to catch, not a legitimate "this is not a verdict"
signal.

This is a residual finding, not a new one I am inventing from nothing: it
is the one arm the round's own work history flags as unresolved (11.6,
11.9), and my probe shows the flagged gap is real and reachable rather
than hypothetical. I am carrying it forward as MEDIUM, same mechanism
family as opus5's original finding, same reachability (shipped
`src/checks.ts` plus the real `scripts/check-dual-review.mjs`
delegated-merge-authority path). Credit where due: the round did not hide
this gap, it named it as open in its own document; that is exactly the
right way to leave an unclosed arm, and it is why I am calling this
residual rather than a regression the round introduced.

**A second widened check I did run**: the work history's own section 11.3
states its derivation covers `dangerousStates` mutation members only, not
`patch` or `baseline-ref` members. I checked whether any `patch`-kind
member touches `src/checks.ts` or the two other files this phase's code
changed, since a stale patch would be the same class of defect in a
different member kind:

```
$ python3 -c "
import json, glob
for path in sorted(glob.glob('witness/*.json')):
    data = json.load(open(path))
    for ds in data.get('dangerousStates', []):
        if ds.get('kind') == 'patch' and any(s in str(ds) for s in ['checks.ts','check-dual-review.mjs']):
            print(path, ds.get('patch'))
"
(no output)
```

None found. The widened search adds nothing here either.

## 8. Attacking the round itself

**A. Red witnesses the round added or changed.** The round's own red
witnesses are the eight-test run quoted in its section 11.4 (pre-fix at
`deae190`: 3 pass, 5 fail; post-fix: 8 pass, 0 fail) and the `red-witness`
gate re-run against the repointed specs (claimed green at intermediate
head `3098650`, "every witness red against every declared dangerous state
and green at head"). I did not re-run the eight-test comparison against
`deae190` myself (that would mean re-staging the pre-fix tree, which the
round already did with a documented `grep -c` assertion that the staged
tree really lacked the fix's marker strings); I instead ran the SAME eight
tests at the current head directly and got a clean pass as part of the
56/63 total in Section 9 below, which corroborates the "AT THIS HEAD" half
of the claimed comparison without re-deriving the "PRE-FIX" half.

The work history's own class-membership discipline (two structurally
different members) is satisfied for the HIGH mechanism: bytes that fail to
parse, a path that is never opened, and a field that cannot be established,
which is three distinct readers reaching the same drop, not one witness
run three times.

**B. A guard that cannot go red.** This is exactly what the round's OWN
section 11.5 found and fixed in itself: the first attempt at fixing the
HIGH finding left a guard (the repointed `dual-review-requires-two-verdicts`
member 0) that matched but could not go red, because a second, newly added
predicate's message shared the first twelve words with what the existing
test asserted. I verified the fix for this class directly in Section 3
above (both the distinguishing message tail and the check id are now
separately asserted). I looked for a second instance of the SAME class
(two near-identical messages differing only in a tail neither test
isolates) elsewhere in the four repointed witness specs and did not find
one; the other three specs' `find` strings are each unique substrings with
no textually similar sibling in the current file (checked by `grep -c` on
each repointed string, all returning exactly 1, per Section 3's python
output).

**C. A count pinned over an append-only registry.** `test/behaviors.json`
was edited by this round: 18 existing values were rewritten from prose
descriptions to literal test names (Section "8b" evidence below), and this
is exactly what the `suite` gate's third-defect finding (11.11) is about.
I checked that the edit does not introduce a new PINNED COUNT anywhere
(the registry stays a set of id-to-name pairs, asserted by name at
`test/verdict-head.test.ts:1233`-ish per the work history, not by count).
`git diff` on `test/behaviors.json` for this round shows only value
rewrites, no additions or removals of keys, so the append-only property is
undisturbed.

**D. The claim grep, both forms, over the round's own new prose**
(section 11 of the work history, since sections 1-10 are round 0's and
were already checked before this round existed):

```
$ sed -n '/^## 11\./,/^## 12\./p' delivery/work-history/m4-p10.md > s11.txt
$ grep -cEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' s11.txt
13
$ tr '\n' ' ' < s11.txt | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' | wc -l
14
```

Both numbers reproduce EXACTLY what the work history's own section 12
reports for itself (13 lines, 14 occurrences, the gap being one line
carrying two hits). I additionally ran the EXTENDED passive-form
vocabulary the work history's own section 12 introduces
(`is (covered|refused|validated|checked|handled|guarded|rejected|enforced|prevented|caught)`)
and got the same 5 hits it reports, 4 of them inside captured `node --test`
output (test names, not assertions) and 1 a genuine assertion with an
adjacent citation. No gap between my run and the work history's own
self-audit.

**E. The suite sentence.** See Section 9.

**F. C-1, C-2, C-3.**

```
$ git diff deae190a03affe711efa854fefcfd6fe0454d63f a6db78d94b61e812526f22a5a2d751e45c003fe5 \
    -- src/checks.ts scripts/check-dual-review.mjs \
  | grep -nE '\bpid\b|process\.kill|/proc/|unref\(|\.detached|tail -f|tail -n'
(no output)
```

Clean.

## 9. The suite sentence

Two isolated files first, for a fast signal:

```
$ node --test test/verdict-head.test.ts test/dual-review.test.ts
1..63
# tests 63
# pass 63
# fail 0
# skipped 0
```

Up from 56/56 before the round (7 new tests, matching the work history's
own count of `test/verdict-head.test.ts` growing from 29 to 36 tests plus
`test/dual-review.test.ts`'s own small growth).

The full suite, interpreter `/opt/node22/bin/node` v22.22.2 (the container
default, not the fetched v26.6.0 toolchain the work history's own section
11.10 used), `dist/` built immediately before (`npm run build` exit 0,
`git status --porcelain` empty afterward), invocation `npm test`:

This container carried many other agents' concurrent `node --test` runs
throughout this review (confirmed repeatedly via `ps aux`, loadavg holding
between 8 and 21 across the session), which is why this run took over nine
minutes of test time and considerably longer in wall clock. It ran to
completion:

```
1..885
# tests 885
# suites 0
# pass 876
# fail 7
# cancelled 0
# skipped 2
# todo 0
# duration_ms 550846.06505
```

**885 tests, 876 pass, 7 fail, 2 skipped, exit 1, duration_ms 550846**
(about 9 minutes 11 seconds of test time). The 7 failures, unedited:

```
not ok 180 - the coverage gate against the real migration table and appendix reports units 115 ...
not ok 182 - deleting an appendix row is red naming the orphan id, and restoring it is green
not ok 189 - a duplicated inventory id is red naming it, and units count distinct ids rather than occurrences
not ok 190 - a row deleted from both real documents is red against the expected-units floor ...
not ok 193 - a refused or failed evidence write makes the gate error instead of a silent green
not ok 258 - a staged install of the built package reproduces the captured contract live
not ok 361 - a precondition command exiting nonzero is error, not a skip, whenever a path-shaped ...
```

Every one of these is independently explainable and none touches this
phase's own files. `test/doctor.test.ts:934` and `test/gates.test.ts:3571`
are the two pre-existing, environment-caused failures Section 6 and
CLAUDE.md's own standing warnings 1 and 12 already document (default
toolchain, clone under `/tmp/claude-0`). The five `coverage-gate` failures
(180, 182, 189, 190, 193) all fail with the identical signature `pattern
... did not complete within 250ms ... (possible catastrophic
backtracking)`, at `src/gates/coverage.ts:260` via
`test/coverage-gate.test.ts`, which is the wall-clock guard CLAUDE.md's own
fix-round contract example names by number and which the fable review's
own run also hit once under contention. `test/coverage-gate.test.ts` is
not in the set of files this branch changes. None of the seven is new,
none is this phase's code, and none is the shape of a masked regression
(a test that should catch this phase's behavior silently passing); all
seven are either the two named pre-existing environment failures or a
single wall-clock guard tripping repeatedly under a loaded box, which
CLAUDE.md itself warns reddens for reasons that have nothing to do with
the branch.

The isolated run in Section 9 above, `test/verdict-head.test.ts
test/dual-review.test.ts` (63/63 pass, 0 fail), and the LIVE `red-witness`
gate run (Section 3, green) are the tests and the gate this phase's own
findings are actually about, and both are unambiguous. The full suite
corroborates rather than contradicts: 876 of 885 pass, and every one of
the 9 that did not (7 fail, 2 skipped) is accounted for by something other
than this phase's code.

The work history's own section 11.10 reports, on node v26.6.0 with dist
built: 885 tests, 885 pass, 0 fail, 0 skipped, to completion. My run, same
total (885), on the container DEFAULT toolchain (v22.22.2) rather than the
fetched v26.6.0 one: 876 pass, 7 fail, 2 skipped. **Naming the axis rather
than averaging the two counts**: the 2 skipped are exactly the floor-gated
`doctor` tests standing warning 12's own table says v22.22.2 skips
regardless of build state; 2 of the 7 failures are the two pre-existing
environment failures that same standing warning documents for this exact
toolchain and clone location; the other 5 are one wall-clock guard
(`test/coverage-gate.test.ts`, unrelated to this phase) tripping five
times under a loaded box. Two honest runs, two different toolchains, one
true sentence each, exactly the shape CLAUDE.md's own standing warnings ask
for.

## 10. Verdict

**FIX-ROUND-NEEDED, narrowly.**

The round did strong, mechanism-level work and I could not fault its own
discipline anywhere I checked it independently: it found and fixed the
HIGH finding at all four broken witness sites plus a fifth site neither
review named (Section 3, confirmed live: `red-witness` gate green at the
real current head); it found and fixed the MEDIUM finding through five
call sites, again more than either review named (Section 4, confirmed
live with my own fixture, not only the work history's own example); it
found and fixed a masking bug IN ITS OWN first attempt at the HIGH fix
(Section 8B); it found and fixed a THIRD defect neither review raised at
all (the `suite` gate being red the entire time because
`test/behaviors.json` held prose instead of test names); and its claim
grep, citation count and suite numbers all reproduced exactly when I
re-ran them independently (Sections 8D, 9).

**One thing keeps this from being a clean APPROVE.** The round's own work
history honestly flags, as an unresolved judgment call (11.6), that a
`.yaml` whose `kind` field is present but not a scalar string (a YAML
list, for example) is still read as "not a verdict" and silently skipped,
the same site class as the now-fixed decode-failure case. I built and ran
the fixture rather than leaving this as the work history left it: a
genuinely refusing third review (`verdict: FIX-ROUND-NEEDED`) shaped with
`kind:` as a one-element list still vanishes silently, and
`check-dual-review` still reports `green ... the pair approves` over the
remaining two (Section 7). This is the SAME fail-open shape as the
finding this round otherwise closed, reachable through the same shipped
file (`src/checks.ts`) and the same real path
(`scripts/check-dual-review.mjs`, the script this repository's own
delegated-merge-authority precondition already depends on). **MEDIUM,
blocking, residual** rather than a new defect the round introduced: the
round disclosed it rather than hiding it, which is exactly the right way
to leave an item open, and that disclosure is why I am not treating this
as a mark against the round's quality. It is still a real gap in shipped
code that DR-0012's merge precondition depends on.

**What would close this round.** Extend the `loadCommittedVerdicts` fix
(the same `unexaminable` diagnostic mechanism already used for the decode
and unreadable-file cases) to the "present but not a scalar" arm of
`kind`, or replace the informal "list means not a verdict" reasoning with
an actual check: a document whose `kind` is a list CONTAINING `"verdict"`
should probably still be flagged as unexaminable rather than silently
passed over, since the honest answer is "this could be a malformed
verdict", not "this is answered". This is a small, scoped edit inside a
mechanism the round has already built correctly for every other arm; it
does not require new design, only extending the arm the round's own
document already named as open.

**The scope MEDIUM (opus5 F3) stays TRACKED, not blocking**, exactly as
both original reviews and the work history's own section 11.8 already
conclude: confined to `delivery/`, not fixable inside this phase, a known
DR-0031 process gap rather than a code defect.

Everything else this review checked (the claim grep in both forms, the
citation-resolution discipline, C-1/C-2/C-3, the widened `witness/*.json`
derivation, the append-only-registry edit to `test/behaviors.json`) came
back clean, independently, not merely re-quoted from the work history.

## 11. Citations in this document

Per CLAUDE.md 3b's trap: `git diff --name-only origin/main...origin/claude/m4-p10-verdict-head-and-medium`
lists 47 files this branch changes, including `src/checks.ts`,
`scripts/check-dual-review.mjs`, `test/dual-review.test.ts`,
`test/verdict-head.test.ts`, `test/behaviors.json`,
`delivery/work-history/m4-p10.md`, the four repointed `witness/*.json`
specs, and `CLAUDE.md` itself (inherited from the unmerged base branch this
phase was cut from, per Section 5). Every citation into any of those in
this document is quoted in backticks deliberately and does not resolve.

Two citations are left to resolve, into files this branch does not touch
(confirmed against the same diff): src/gates/result.ts:68 (the line
defining the constant `EXIT_GATE_ERROR`, whose value is the code the live
`check-dual-review.mjs` reproduction in Section 4 exits with) and
delivery/decisions/DR-0012-delegated-merge-authority.md:21 (the sentence
"A pull request may be merged only when ALL of the following hold", which
is the condition list both the HIGH and residual MEDIUM findings sit
inside).
