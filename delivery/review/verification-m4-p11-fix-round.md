# Delta verification: M4-P11 fix round 2

Subject: branch claude/m4-p11-single-family-exception
Reviewed head: 9a1b193b1da473533d7889d4b581c5586910d1de
Prior-review head: 2f3b651e599837387d27314f8271f3c352d6ff46
Delta: git diff 2f3b651..9a1b193

Status: COMPLETE. Written incrementally from the first minutes; its mtime was the beacon.
Verdict: FIX-ROUND-NEEDED, section 11.

## Plan

1. Read CLAUDE.md, the M4-P11 plan section, the work history, and all three prior reviews.
2. FIRST CHECK: the fix-round contract item 3, what the derivation did NOT cover. Run the
   derivation command myself, then widen it in a direction the author excluded.
3. Per original finding: name the mechanism, enumerate other call sites, reproduce at the
   prior head and show gone at the current head.
4. Attack the round: red witnesses (defang), guards that cannot go red, counts pinned over
   append-only registries, the claim grep in both forms, the four-part suite sentence,
   C-1/C-2/C-3.
5. DR-0027 reachability for every HIGH/MEDIUM.

## 0. Provenance of this document and of the heads

The branch's copy of this filename carried the ROUND 1 delta verification
(committed at e4b4a0a, 628 lines, verdict FIX-ROUND-NEEDED). This round 2
verification REPLACES it in place, which is what the dispatch asks for. I saved
the round 1 text before overwriting and read it in full; its four findings
DV-001 to DV-004 are the "original findings" this round must close, alongside
the two clean-room reviews' CR-M4P11-001 to CR-M4P11-003.

Head chain, from git rather than from prose:

- 399953c: the head both clean-room reviews audited.
- 2f3b651: the head the round 1 delta verification audited (fix round 1).
- 9a1b193: this head (fix round 2). Its parents are 11447c5 (a merge of the
  branch with itself after the round 1 verification landed) and the round 2 work.

The delta under verification, 2f3b651..9a1b193, is 6 files:
delivery/review/verification-m4-p11-fix-round.md (+628, the round 1 report
landing), delivery/work-history/m4-p11.md (+989), scripts/check-dual-review.mjs
(+63/-?), src/checks.ts (+195/-?), test/behaviors.json (+5/-?),
test/single-family-exception.test.ts (+223/-?).

## 1. FIRST CHECK: the derivation, re-run and widened

The round states its exclusions in section 3 of the FIX ROUND 2 block, six of
them, BEFORE any finding. That is the contract's item 3 and it is present and
first, as the contract asks.

### 1.1 The author's derivations, re-run by me at 9a1b193

D6 (`grep -rnE "\b(readFileSync|readdirSync|existsSync|statSync|lstatSync|
realpathSync|readlinkSync|openSync|classifyEntry|readContextDocument|
readOperatorPath|readContextDocumentAt|contextDocumentPresentAt|
listCommittedTree|gitIn|spawnSync)\b" src/checks.ts scripts/check-dual-review.mjs`)
run by me: 51 lines. I diffed my full output against the block quoted in the
work history, line for line:

```
$ diff d6-quoted.txt d6-mine.txt && echo "D6 IDENTICAL"
D6 IDENTICAL
```

51 = 51, byte-identical. Nothing was elided and nothing was added.

D7: 26 lines, D8: 25 lines, both reproduce.

### 1.2 WIDENED, in a direction the author excluded

D7 is the weak one by construction: its pattern requires a DOUBLE-QUOTED
literal subcommand, so a git call written with single quotes, backticks or a
computed subcommand is invisible to it. That is the "empty result
indistinguishable from an absence of defects" shape. I widened both the quoting
and the subcommand set:

```
$ grep -rnoE "['\"\`](ls-tree|ls-files|grep|log|diff|diff-tree|status|add|checkout|stash|clean|rm|mv|apply|blame|shortlog|whatchanged|restore)['\"\`]" src bin scripts
```

The widened form finds two additional backtick spellings (src/witness/run.ts
`grep`, src/gates/run.ts `rm`) and, decisively for the ROOT coordinate, **the
same three files carry `ls-tree` under either form**: `src/checks.ts`,
`src/gates/suite.ts`, `src/witness/run.ts`. I read the two outside this phase:

- src/gates/suite.ts:802 is `git(cwd, ["ls-tree", mergeBaseSha, "--", flags.registry])`,
  the PATHSPEC form, the correct one.
- `src/witness/run.ts:1741` (QUOTED, because this branch changes that file, so a
  resolving citation into it would point at a different line on `main`) is
  `gitIn(repoRoot, ["ls-tree","-r","--name-only",headSha,"--","test/"])`, the
  pathspec form again, and its cwd is a resolved `repoRoot`.

**Result of the widening: no second instance of DV-002 in shipped code.** The
narrow search's emptiness is therefore informative rather than merely empty,
which is the property the contract's item 3 exists to establish.

### 1.3 A widening the author did NOT make, and what it returns

The round's `nest` test option nests by exactly ONE level and exercises only
the PAIR corpus. The FALSIFIERS' corpus (`loadPaperworkVerdicts`, the whole
`delivery/` tree) was the one that was already correct at 2f3b651 and it was
rewritten to share `listCommittedTree` in this round, so it is newly at risk
and no arm in the phase covers it nested. I built that arm myself: a context at
DEPTH THREE (`d1/d2/d3`) inside its repository, a committed charter declaring
`review-families.available: [family-a]`, a committed pair under
`delivery/review/` both carrying `produced-by: family-a`, and a second-family
verdict committed at `delivery/evidence/past/b-other.yaml`, which is falsifier
1's only evidence and is OUTSIDE the pair directory.

| head | result |
|---|---|
| 2f3b651 | **error, exit 21** (the pair corpus listed nothing, so the declaration read could not proceed) |
| 9a1b193 | **red, exit 1**, falsifier 1 firing and naming the depth-three path |

The red line at 9a1b193, quoted from the run:

```
INVALID #/produced-by charter.yaml declares the single review family family-a
(canonically family-a) and <ctx>/delivery/evidence/past/b-other.yaml carries
produced-by family-b, which is not the declared family, so the exception does
not apply to it
```

So the falsifier corpus resolves correctly at depth three, not only at depth
one. The widened search found nothing the narrow one did not; I report that as
a pass rather than as a silence.

## 2. THE ORIGINAL FINDINGS: REPRODUCED AT 2f3b651, GONE AT 9a1b193

Method: MY OWN lab, not the phase's `stage()` helper. A shell builder that
copies the repository's `templates/charter.example.yaml`, its
`assurance-modes.yaml` and two `witness/fixtures/dual-review/` verdicts into a
scratch tree, `git init`, one commit, then runs the SHIPPED
`scripts/check-dual-review.mjs` from a worktree of the head under test. The
committed pair is `decorrelated-criteria.yaml` plus `shared-family-hazard.yaml`,
both `produced-by: family-a`, same phase and same head, which is DR-0012
condition 1 violated in the committed record. Interpreter /opt/node22/bin/node,
v22.22.2.

| arm | 2f3b651 | 9a1b193 |
|---|---|---|
| CONTROL: context IS the repository root, charter committed | red, exit 1 | red, exit 1 |
| DV-002: context is `proj/` inside the repository | **not-applicable, exit 20** | **red, exit 1** |
| DV-001: `charter.yaml` on disk, in no commit, context at the root | **green, exit 0** | **error, exit 21** |
| both at once: nested AND uncommitted charter | not-applicable, exit 20 | error, exit 21 |

The DV-001 green at 2f3b651 printed, verbatim:

```
REPORT dual-review-decorrelation <dir> declares no delivery mode (no charter.yaml),
so the verdicts for phase M3-P9 were NOT evaluated against a merge-authority
regime; scripts/check-dual-review.mjs refuses such a directory outright
```

and the error at 9a1b193 prints:

```
<dir>/charter.yaml does not exist in commit 4780e5b84cf8bc52c5547ddba887e12d8328f2ba,
resolved from HEAD, so the declared mode's merge-authority is unknown and no
decorrelation verdict can be reached; a merge check that cannot determine the
regime reports error, never green
```

The new sentence names the SOURCE, which is what made the old one unfalsifiable
by its reader.

**The control row is the one that makes the other three mean something**: the
root-context, committed-charter arm is red at BOTH heads, so the fix is not a
swap of which shape works.

### 2.1 Closed at the MECHANISM, not at the instance

The mechanism the round names is "a lookup and the decision it feeds address
different trees, and the disagreement is never reported because the lookup
answers successfully about its own tree", with two coordinates (SNAPSHOT, ROOT)
and one collapse (could-not-look reported as nothing-there). I checked the
mechanism rather than the two instances, three ways:

1. The SNAPSHOT coordinate now has ONE probe with two callers.
   `REGIME_DOCUMENTS` and the presence probe moved out of
   `scripts/check-dual-review.mjs` into `src/checks.ts` as
   `missingRegimeDocument`, which `establishDelegatedRegime` and the gate
   script both reach. `grep -n classifyEntry scripts/check-dual-review.mjs` at
   9a1b193 returns exactly one hit and it is inside a comment, so the script
   holds no probe of its own at all.
2. The ROOT coordinate now has ONE listing idiom. `listCommittedDirectory`
   became `listCommittedTree` with a `recursive` flag, and BOTH corpora call
   it. The tree-ish spelling `<sha>:./<dir>` is gone from the listing; the
   remaining `<sha>:./<path>` spellings are `cat-file -t` and `show`, neither
   of which takes an implicit cwd pathspec.
3. The collapse is closed with a SECOND probe that does not name the path
   (`git cat-file -t <refSha>`), so "the commit is unreadable" and "the path is
   not in this commit" are two answers again.

## 3. ATTACKING THE ROUND: the red witnesses, defanged by me

I did not replay the round's mutants. I wrote three of my own, each aimed at
ONE site, so that a reddening is ATTRIBUTABLE to that site rather than general.
Baseline first: interpreter /opt/node22/bin/node v22.22.2, `dist/` built,
invocation `node --test test/single-family-exception.test.ts`, tree a git clone
checkout at 9a1b193: **30 tests, 30 pass, 0 fail, 0 SKIPPED**, exit 0.

| defang | what it reverts | reddened |
|---|---|---|
| D1 | delete the `missingRegimeDocument` refusal block from the gate script | **exactly 1**: `not ok 28 - a charter.yaml that exists only in the working tree ...` |
| D2 | `listCommittedTree` lists the tree-ish `<sha>:./<dir>` again (with the caller-side prefixing restored so the arm is otherwise equivalent) | **exactly 1**: `not ok 29 - a committed correlated pair is red when the context directory is NOT the repository root` |
| D3 | delete the second `cat-file -t <refSha>` probe, so an unreadable commit returns an empty corpus again | **exactly 1**: `not ok 30 - a committed corpus that could not be READ is refused, never reported as an empty corpus` |

Every defang restored byte-identically afterwards (`cmp` against the saved
original, exit 0; `git status --short` shows only this report).

**Each is red against the DANGEROUS STATE, not against an absent feature**, and
my own lab in section 2 is what establishes that rather than the test's
wording: D1's state is the gate reporting GREEN over a committed correlated
pair (measured exit 0 at 2f3b651), D2's is a conditional gate reporting
NOT-APPLICABLE over the same pair (measured exit 20 at 2f3b651), D3's is an
unreadable commit reported as an empty corpus.

**One witness is not a class, and here the class has THREE members that are
genuinely different.** The class is "a lookup and the decision it feeds address
different trees". Its members fail in three different FUNCTIONS, and produce
three different OUTPUTS: green/exit 0, not-applicable/exit 20, and a refusal.
That is stronger than the rule's floor of two structurally different members.
The single-site attribution above is what shows they are three members rather
than one defect written down three times: if they were one, a single defang
would have reddened more than one of them.

## 4. ATTACKING THE ROUND: guards that cannot go red, and arms nobody staged

### 4.1 The ordering change nobody asked about

Fix round 1 ran the regime refusal FIRST, before the corpus was loaded. This
round moves it to THIRD, after `committedVerdictPaths` and after
`readReviewFamilies`. A reordering of a fail-closed guard is exactly where a
fail-open arm hides, so I staged the four contexts where the order can matter
and ran both heads:

| context | 2f3b651 | 9a1b193 |
|---|---|---|
| git repo, NO charter anywhere, ZERO verdicts | error, exit 21 | error, exit 21 |
| git repo, NO charter anywhere, committed correlated pair | error, exit 21 | error, exit 21 |
| NOT a git repository, charter on disk, correlated pair on disk | red, exit 1 | red, exit 1 |
| NOT a git repository, NO charter, correlated pair on disk | error, exit 21 | error, exit 21 |

Identical on every arm. The reorder is safe on the cases I could construct, and
the worktree arm (rows 3 and 4) still refuses through the same function, which
is what makes `missingRegimeDocument`'s default-parameter source usable rather
than a second resolution.

### 4.2 A listing shape the new pathspec form could have changed and does not

`listCommittedTree(..., false)` lists `./delivery/review/` non-recursively. If
that directory carries a SUBDIRECTORY in the commit, the listing yields a path
naming a tree, and `git show <sha>:./<that tree>` prints a tree listing with
exit 0 rather than failing. I staged it (a third verdict committed at
`delivery/review/sub/nested-verdict.yaml`) and ran both heads: **identical**,
red/exit 1 with `ran over 2 verdict(s)` at both. The subdirectory is ignored at
both heads, so this is pre-existing behaviour and not a regression; I record it
because it is the shape the pathspec change could have altered and did not.

### 4.3 The control arm that changes verdict, re-measured by me

The round's own table row 4 says the uncommitted-`assurance-modes.yaml` control
goes from red to error. I reproduced it rather than accepting it, because a
control arm whose verdict changes is where a fix quietly stops reporting
something:

| arm | 2f3b651 | 9a1b193 |
|---|---|---|
| `assurance-modes.yaml` on disk, in no commit, committed correlated pair | red, exit 1 | error, exit 21 |

Both block, and `error` is the more accurate of the two under M2-C-3: the
regime was not determined, so no verdict about decorrelation was reached and a
red would have been a verdict. Verified that the refusal's text names the
document and the source:

```
<dir>/assurance-modes.yaml does not exist in commit 93d1bb0b93a196d5677a0912b89e69cb1299eafa,
resolved from HEAD, so the declared mode's merge-authority is unknown ...
```

### 4.4 Counts pinned over an append-only registry

CLEAN. `test/behaviors.json` gains exactly three entries, appended, no existing
entry altered (`git diff 2f3b651..9a1b193 -- test/behaviors.json` is +5/-1 and
the -1 is the comma on the previous last line). The phase's registration test
asserts BY NAME over an id list, and the only `.length` comparison in the
changed test file is `assert.equal(seen.length, ARMS.length, ...)`, a
self-comparison over a local array. No gate count, no manifest count and no
clause-map row count is pinned anywhere in the delta.

### 4.5 C-1, C-2, C-3

CLEAN.

```
$ git diff 2f3b651..9a1b193 -- src scripts schemas bin | grep -cE '^[-+].*(process\.pid|/proc/|kill\(|SIGTERM|SIGKILL|detached|unref|setTimeout|execFile|\.on\("exit)'
0
```

Zero. The only new subprocess in the delta is one more `gitIn(["cat-file","-t",refSha])`
inside `listCommittedTree`, which wraps `spawnSync`: synchronous (C-3), reading
stdout for DATA rather than probing liveness (C-2), and reading a type rather
than a log tail (C-1).

## 5. WHAT I FOUND THAT THE ROUND, BOTH CLEAN-ROOM REVIEWS AND ROUND 1 DID NOT

### DV2-001 (HIGH, BLOCKING): fourteen of the twenty-six `suite` findings are M4-P11's OWN behaviors, and the work history calls the red "inherited whole"

**Nobody had run the `suite` GATE and read its finding list.** Both clean-room
reviews measured the test suite (899/896/1/2) and neither ran the gate. The
round 1 delta verification states plainly that it ran `red-witness` and the
suite and did NOT re-run the rest of the bundle. So the gate's finding
attribution has never been checked by a reviewer, and it is where the defect is.

I ran it:

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only suite --phase m4-p11 --evidence <scratch>/ev --base origin/main --head HEAD
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: suite: red: 28 finding(s)
```

`counts.json`: `{"reported":911,"pass":907,"fail":2,"skipped":2,"todo":0,
"didNotRun":0,"discoveredFiles":47,"reportedFiles":47,"behaviors":813,
"mergeBaseBehaviors":775}`.

**28 reconciles to the round's 26 exactly**, and the reconciliation is worth
stating because it is the kind of unexplained gap this repository has paid for
three times: 26 are `behavior <id> does not resolve` and TWO are
`failing test:` findings, namely `test/doctor.test.ts`'s staged-install test and
`test/gates.test.ts`'s `a precondition command exiting nonzero is error ...`.
Both are the environment, not the branch: the first is CLAUDE.md standing
warning 12's floor-dependent-without-being-floor-gated test, and the second is
standing warning 1's `/tmp/claude-0` traversal trap, since my clone is under
`/tmp/claude-0`. The second is the same test whose witness is the fortieth red
witness the round explains in its section 6.1, which corroborates that
explanation from an independent direction.

**Of the 26 behavior findings, FOURTEEN are `single-family-*`, which is
M4-P11's own original batch.** Counted from the gate's own `counts.json`
`findings` array rather than from a grep over prose:

```
single-family-absent-declaration-is-not-permission
single-family-declaration-marker-shared-by-name
single-family-declaration-read-from-the-commit
single-family-declaration-uncommitted-is-error
single-family-declared-exception-named-in-the-bundle
single-family-duplicate-declared-family-is-error
single-family-exception-refused-below-two-reviews
single-family-exception-refused-when-the-falsifiers-did-not-run
single-family-falsifier-corpus-contradiction
single-family-falsifier-name-mismatch
single-family-narrows-produced-by-only
single-family-no-arm-reports-green
single-family-permissive-arm-precondition-id
single-family-two-declared-families-is-not-the-exception
```

The other twelve are M4-P10's `verdict-head-*`, `verdict-pair-*` and
`dual-review-prints-verdict-values`.

**Zero of the fourteen exist on `main`:**

```
$ git show origin/main:test/behaviors.json | grep -c 'single-family'
0
```

So they are not inherited in any sense. They are this phase's.

**The mechanism is one, not fourteen: the registry entry carries a DESCRIPTION
of the behavior where the gate resolves the TEST NAME, verbatim.** The tests
exist and pass; only the registered text drifted. Three worked examples, the
registry text against the test name that is plainly the one meant:

| id | registered text | the test that exists |
|---|---|---|
| `single-family-permissive-arm-precondition-id` | "the permissive arm reports not-applicable carrying precondition id single-family-declared with met false, never the existing verdicts-present precondition" | "the permissive arm reports not-applicable through its OWN precondition id, asserted on the record's fields" |
| `single-family-falsifier-corpus-contradiction` | "a one-family declaration is red when the project's own committed verdicts carry two or more distinct produced-by values, and the reason names them" | "a one-family declaration against this repository's own two real verdicts is red and names both observed families" |
| `single-family-declaration-read-from-the-commit` | "the review-families declaration is read from the object database with its ref, ref sha and blob sha256, so a working-tree edit after the commit does not change what the check read" | "editing the declaration in the working tree after the commit changes nothing, and the recorded blob sha256 is the committed blob's" |

This violates the binding convention at the end of CLAUDE.md's gate section:
"every new behavior is registered in `test/behaviors.json` and resolves by
name". Registered is not the same as resolves, and fourteen entries are the
first half without the second.

**Why every previous measurement missed it, which is the interesting half.**
Fix round 1's work history reports "27 at the base, 27 at the head", the set
difference empty, and concludes "the ids are M4-P10's `verdict-head-*` and
`verdict-pair-*` family". Its base was a clone at `122472b`. Measured:

```
$ for ref in origin/main 122472b 2f3b651 9a1b193; do
    git show $ref:test/behaviors.json | grep -c '"single-family'
  done
origin/main 0 ; 122472b 14 ; 2f3b651 20 ; 9a1b193 23
```

`122472b` ALREADY CARRIES THE FOURTEEN. It is not the phase's start; it is a
point inside M4-P11 after the original implementation landed. So round 1's
control arm contained the defect it was controlling for, its set difference was
empty for that reason, and its attribution to M4-P10 was wrong. I checked that
the fourteen at `122472b` are the SAME fourteen the gate reports unresolved
today, by set difference rather than by count:

```
$ diff base14.txt unres14.txt && echo IDENTICAL
IDENTICAL
```

That is the same shape round 1 itself recorded one paragraph earlier, "a
control arm that has been contaminated by the experiment reads as a WORSE base
than the truth"; here it read as a base that shares the defect, which makes the
defect invisible instead.

**The round 2 work history states the fact and then withdraws it in the next
sentence.** It writes "the ids are M4-P10's `verdict-head-*` and `verdict-pair-*`
family plus the ORIGINAL M4-P11 batch whose registry text drifted from the test
names", which is exactly right, and three paragraphs later concludes "**The
`suite` red is inherited whole.**" Fourteen of twenty-six are not inherited at
all. The second sentence is the one a reader carries away, and it is false.

**DR-0027 reachability, stated explicitly.** `suite` is a REQUIRED gate
(gate-registry.yaml, applicability `required`, modes full/direct-pr/local-only)
and it runs on BOTH CI events, `pull_request` AND `push`. So this is red on the
pull-request head, which makes DR-0012's condition "CI green on that exact head"
unmet, and it is red on the post-merge `push` run, which is the T-009 arm that
took `main` red for four hours and twenty-one minutes. That is a real user path
reached by running one command against this head today, which is what I did.
It is the same reachability standard both clean-room reviews applied to the red
`red-witness` gate, and it is graded the same way here.

**Cost to fix: one file, already on the declaration.** `test/behaviors.json` is
a standing pre-authorized extra. Fourteen strings must be replaced by the test
names they meant. No source change, no new test. I did not make the edit,
because an implementer must choose whether to rename the tests or the registry
entries, and either choice belongs in a work history.

**What fixing it does NOT do.** The gate stays red, because twelve of the
twenty-six are M4-P10's and this branch carries M4-P10 unmerged. So this
finding is not "make the gate green"; it is "stop the phase asserting that a
red it owns fourteen twenty-sixths of belongs to someone else."

### 5.1 Two arms I attacked and could not break

Recorded because an APPROVE with no attempt shown is a failed verification, and
because the round 1 verifier left both as readings rather than measurements.

- **The worktree arm.** Round 1's verifier wrote that it did not attack the
  worktree arm "beyond reading the code, because no exception can be granted
  there". I staged it two ways: a git repository with an UNBORN HEAD (no
  commit at all), and a directory that is not a git repository, each carrying a
  charter declaring `review-families.available: [family-a]`, both regime
  documents on disk, and a same-family pair on disk. **error, exit 21 at both
  heads in both arms.** The exception cannot be granted from a working-tree
  corpus, which is now measured rather than read.
- **The subdirectory arm**, section 4.2 above.

## 6. THE CLAIM GREPS, BOTH FORMS, RUN BY ME

| scope | form | count |
|---|---|---|
| whole file | line-based, MATCHING LINES | 85 |
| whole file | line-based, OCCURRENCES | 165 |
| whole file | wrap-insensitive, OCCURRENCES | 165 |
| FIX ROUND 2 section | line-based, MATCHING LINES | 37 |
| FIX ROUND 2 section | line-based, OCCURRENCES | 57 |
| FIX ROUND 2 section | wrap-insensitive, OCCURRENCES | 57 |

**Missed by wrap: 0 at both scopes**, and every number reproduces the round's own
table exactly.

**I audited the GAP rather than only counting it**, which is the part that
matters. The round publishes sixteen offsets and says the hits inside section 10
itself are named as a class rather than enumerated. I checked that claim two
ways:

1. Every one of the sixteen published offsets still carries a hit in the
   COMMITTED text. 16 of 16 resolve, with the matched phrase printed beside each.
   No stale offset, which is the failure a sibling phase published twelve of.
2. The sixteen are EXACTLY the set of line-based hits before section 10's
   heading, computed rather than trusted:

```
$ SEC10=$(grep -n '^## 10. THE CLAIM GREPS' fr2.txt | cut -d: -f1)   # 853
$ head -n $((SEC10-1)) fr2.txt | grep -nEi '<the pattern>' | cut -d: -f1
19 65 67 147 230 237 243 402 422 464 472 490 569 674 675 839
```

So the table omits nothing outside the section it declares it stops at.

I re-settled the four load-bearing ones by measurement rather than by reading
the table: offset 464 ("because the shared refusal catches it first") is my
section 4.3; offset 569 ("the fix cannot be a swap of which shape works") is my
control arm in section 2; offset 490 ("a commit that cannot be read reports an
EMPTY corpus") is my defang D3; offsets 65 and 67 ("can never differ here") are
`git ls-files | grep -cE '^charter\.yaml$'` returning 0 and `ls charter.yaml`
reporting no such file, which I ran myself.

**The extended grep the binding one cannot see.** The Opus 5 review found the
round-1 over-claim with a passive-voice pattern the binding eleven alternatives
do not contain. I ran a wider one over the FIX ROUND 2 section:

```
$ tr '\n' ' ' < fr2.txt | grep -oEi 'is caught|are caught|is (covered|refused|validated|checked|handled|guarded|rejected|enforced|prevented)|cannot occur|not possible|guaranteed|ensures|proves that|makes it impossible|by construction|nothing can'
is covered   (x2)
cannot occur (x1)
by construction (x1)
```

Both `is covered` hits are inside the QUOTED grep command itself, not authored
claims. `by construction` is a table cell asserting that `missingRegimeDocument`
is the same probe as `contextDocumentPresentAt`, which is checkable by reading
the function and which I checked. `cannot occur` is "the worktree arm ... has
one source by definition, so the mechanism cannot occur there", which is a
deduction rather than a measurement in the document; **I measured it** (section
5.1) and it holds. So the extended grep finds one claim worth settling and it
settles.

## 7. THE SUITE SENTENCE, FOUR QUALIFIERS, MINE

**Interpreter /opt/node22/bin/node v22.22.2 (the container default, BELOW the
declared floor of >=26); `dist/` BUILT (`npm ci` exit 0 then `npm run build`
exit 0, `git status` clean afterwards apart from this report); invocation
`npm test`; tree a GIT CLONE CHECKOUT at 9a1b193 (`git clone --no-local` then
`git checkout <sha>`): 911 tests, 908 pass, 1 fail, 2 SKIPPED, 0 todo,
duration 344287ms, `NPM_TEST_EXIT=1` captured directly and not after a pipe.**

`/proc/loadavg` before `6.86 9.25 8.06`, after `11.10 10.58 9.03`. The box is
shared with other agents' test runs throughout (visible in `pgrep -af 'node
--test'`), which is why no timing here is quoted as a property of the branch.

The single failure is `not ok 258 - a staged install of the built package
reproduces the captured contract live`, which is the
floor-dependent-without-being-floor-gated test CLAUDE.md's standing warning 12
names, in `test/doctor.test.ts`, a file this branch does not touch: it is absent
from `git diff --name-only origin/main...9a1b193`, which lists 51 files. **A red
on the container default is not proof of a red branch**, and the base was not
re-measured for it because the file is unchanged; both clean-room reviews
measured the same failure at `399953c` and the round measured it on the base.

**My 911 matches the round's 911 exactly**, and the two accounts differ only on
the axis CLAUDE.md says they should: the round ran node v26.6.0 and got
911/911/0 fail/0 skipped, and the floor accounts for exactly the two skips and
the one failure I see. 908 at `2f3b651` plus three new tests is 911, so no
existing test was removed.

**One discrepancy I did NOT average away.** The `suite` GATE's `counts.json`
reports `"fail":2` for the same head, the second failure being
`test/gates.test.ts`'s `a precondition command exiting nonzero is error, not a
skip ...`. Run alone in this same checkout that test is `1 test, 1 pass, 0 fail,
0 skipped`. So the second failure is a property of how the gate runner invokes
the suite, not of the branch, and it is the same test whose witness is the
fortieth red witness the round explains in its section 6.1 as the
`/tmp/claude-0` traversal trap. My clone IS under `/tmp/claude-0`. That
corroborates the round's explanation from an independent direction and it is
reported as corroboration rather than as proof, because I did not build a clone
outside `/tmp/claude-0` to complete it.

## 8. THE ORIGINAL FINDINGS, ONE ROW EACH

| finding | the MECHANISM it was an instance of | closed at the mechanism? | reproduced at the prior head and gone at 9a1b193? |
|---|---|---|---|
| DV-001 (HIGH, round 1 verifier): the regime's PRESENCE probe moved to the commit and the gate script's refusal stayed on disk | a lookup and the decision it feeds address different SNAPSHOTS, and the disagreement is never reported because the lookup answers successfully about its own | **YES.** `REGIME_DOCUMENTS` and the probe moved into `src/checks.ts` as one function with two callers; the script now holds no probe of its own | YES, section 2: green/exit 0 at 2f3b651, error/exit 21 at 9a1b193, my own lab |
| DV-002 (HIGH, round 1 verifier): `listCommittedDirectory` lists nothing from a nested context | the same, on the ROOT coordinate | **YES**, and wider than reported: one listing function now serves BOTH corpora, so the falsifier corpus cannot drift from the pair corpus again | YES, section 2: not-applicable/exit 20 at 2f3b651, red/exit 1 at 9a1b193; and it holds at depth THREE, which no test covers, section 1.3 |
| DV-003 (MEDIUM, tracked): the fortieth witness IS reproducible and round 1 said it was not | a finding retired by assertion rather than by measurement | **YES**, corrected in place with a marker, plus a three-arm probe naming the cause (the `/tmp/claude-0` traversal trap reaching the witness lab through `node_modules`), plus a gate-level control that REFUTED the interpreter half of the explanation | n/a, it is a correction to a document; I corroborated the cause independently, section 7 |
| DV-004 (MEDIUM, tracked): rule (f) imposes no obligation when a phase adds a spawn and edits no witness | a derived heuristic narrowed by a scope fix | **NOT ADDRESSED, and not mentioned.** The per-member filter is unchanged. Legitimate under DR-0027 since round 1 marked it tracked, but see DV2-002 | n/a |
| CR-M4P11-001 (HIGH, Opus 5): the corpus read from the working tree while the declaration is read from git | a decision assembled from two sources of truth | closed in round 1; **still closed here**, both directions | deletion and addition arms both red/exit 1 at 9a1b193, my own lab |
| CR-M4P11-002 (MEDIUM, Opus 5): the falsifier corpus is ONE DIRECTORY | the set a falsifier is evaluated over is narrower than the claim it falsifies | closed in round 1; **still closed here** | a second-family verdict at `delivery/evidence/past/` is found and named, at depth three, section 1.3 |
| CR-M4P11-003 / the fortieth witness | see DV-003 | see DV-003 | see DV-003 |
| The required `red-witness` gate is not green (HIGH, both reviewers) | a required gate that cannot pass bars merge whatever the reviews say | the phase's own contribution stays closed (39 rule (f) failures to zero); the gate is still `error` | still error; four fifths M4-P10's stale anchors, the fifth explained as an environment property |

## 9. FINDINGS OF THIS ROUND

### DV2-001, HIGH, BLOCKING

Section 5. Fourteen of the twenty-six `suite` findings are M4-P11's own
behaviors, registered with descriptive text where the gate resolves the test
name verbatim, and the work history concludes that the red is "inherited
whole". Reachability: the `suite` gate is `applicability: required` at
gate-registry.yaml:101 and runs on both CI events at gate-registry.yaml:104, so
it is red on the pull-request head (DR-0012's "CI green on that exact head"
unmet) and on the post-merge `push` run, which is T-009's arm. Fixable in one
already-declared file.

### DV2-002, LOW, TRACKED

The round closes DV-001, DV-002 and DV-003 and says nothing at all about
DV-004. Round 1 marked DV-004 tracked, so leaving it open is legitimate; saying
nothing is not, because a reader cannot tell "considered and left tracked" from
"missed". Round 1's own work history carried a "WHAT THIS ROUND DID NOT CLOSE"
section; round 2 has "WHAT THE DERIVATION DID NOT COVER" and no equivalent for
the FINDINGS. Reachability: confined to `delivery/`, so tracked, not blocking.

### Not findings, recorded because I looked

- The ordering change (regime refusal moved from first to third) is safe on the
  four contexts where order can matter, section 4.1.
- The non-recursive listing still ignores a subdirectory under
  `delivery/review/`, identically at both heads, section 4.2.
- The control arm that changes verdict (red to error) changes reason and not
  direction, section 4.3.
- No count is pinned over an append-only registry, section 4.4.
- C-1, C-2, C-3 clean, section 4.5.
- Scope: the delta's six paths are `src/checks.ts`,
  `scripts/check-dual-review.mjs`, `test/behaviors.json`,
  `test/single-family-exception.test.ts`, the work history and THIS document.
  The first four and the work history are on the declaration; this document is
  admitted by the standing phase-evidence allowance at src/gates/scope.ts:565,
  which permits a file directly under `delivery/review/`, one level only.

## 10. WHAT I DID NOT COVER

- **CI, in either event.** `check-dual-review` is registry-only and
  `scripts/m2-exit-test.sh` runs `--manifest`, so the feature this phase ships
  has no CI arm at all and nothing in this verification has one either. T-009's
  second rule is unmet for the feature and was unmet before both rounds.
- **The `pull_request` union.** The branch is stacked on unmerged M4-P10, so
  the tree CI will build is not the tree I measured. Every number here is
  against 9a1b193 alone.
- **The full gate bundle.** I ran `suite` and the test suite. I did not re-run
  `citations`, `scope`, `clause-map`, `coverage`, `red-witness` or `license` at
  this head, so the round's own bundle table is taken on its own evidence except
  where I re-measured it. In particular I did NOT independently re-run
  `red-witness`, so the fortieth witness is corroborated by my `suite` gate's
  second failure rather than reproduced at the gate.
- **A clone outside `/tmp/claude-0`.** That is the missing arm in the round's
  own explanation of the fortieth witness and it is missing from mine too.
- **`test/`, as a search scope.** My widenings covered `src`, `bin` and
  `scripts`. The round names `test/` as its first uncovered region and DV-002
  was the defect that exclusion predicted; I did not go looking for the next
  one. A reader should expect more staging helpers that cannot produce the
  configuration the code under test must survive.
- **Performance on a large consumer tree.** The falsifier corpus spawns one
  `git show` per candidate blob under `delivery/`. Not timed.
- **The two failing tests' base.** `test/doctor.test.ts` is unchanged by this
  branch, so head-independence follows from the file; I did not check out the
  base and re-run it.

## 11. VERDICT

**FIX-ROUND-NEEDED.**

The round is good work and I say so before the finding. It named ONE mechanism
with two coordinates and a collapse, derived from it with three commands whose
output I reproduced byte-identically, stated six exclusions before any finding,
closed both blocking findings AT THE MECHANISM rather than at the instance (one
listing function for both corpora, one presence probe with two callers), and
corrected two false sentences in the previous round IN PLACE with markers rather
than only contradicting them elsewhere. Its claim-grep arithmetic reproduces
exactly at both scopes, all sixteen published offsets still resolve and are
exactly the complete set outside the section they declare they stop at, and its
three new witnesses each redden under a single-site defang of their own site and
nothing else. I reproduced every closure it claims, in my own lab, with a
control arm, and I extended the nested case to depth three and to the falsifier
corpus, which no test in the phase covers.

It is not mergeable for ONE reason, and it is not one of the two it was sent
back for:

- **DV2-001 (HIGH, blocking).** Nobody had ever run the `suite` GATE and read
  its finding list: both clean-room reviews ran the test suite, and the round 1
  verifier says plainly it did not re-run the bundle. When it is run, fourteen
  of the twenty-six findings are M4-P11's OWN behaviors, registered with text
  that does not match any test name. Zero of the fourteen exist on `main`. Round
  1 attributed the whole red to M4-P10 on the strength of a control clone at
  `122472b` that already contained the fourteen, and round 2 names the M4-P11
  batch in one sentence and then concludes "the `suite` red is inherited whole"
  in another. It is not.

DV2-002 is LOW and tracked.

### What I tried to break and how it held

- **Held.** The SNAPSHOT coordinate, both documents. An uncommitted
  `charter.yaml` is error where it was green; an uncommitted
  `assurance-modes.yaml` is error where it was red. Both block.
- **Held.** The ROOT coordinate, at depth one AND at depth three, for the pair
  corpus AND for the falsifier corpus, with the root-context control red at both
  heads so the fix is not a swap of which shape works.
- **Held.** The probe collapse. A well-formed sha no object carries is refused
  instead of returning an empty corpus.
- **Held.** The three new witnesses, under three single-site defangs, one test
  each, restored byte-identically after each.
- **Held.** The ordering change, on four contexts where order can matter.
- **Held.** The worktree arm, which the previous verifier read rather than ran:
  unborn HEAD and non-git, both error.
- **Held.** CR-M4P11-001 and CR-M4P11-002, still closed, both directions.
- **Held.** C-1, C-2, C-3, the append-only registry, the claim-grep arithmetic
  at both scopes and both forms, the sixteen offsets, the suite arithmetic.
- **BROKE.** The attribution of the `suite` gate's red. Fourteen of
  twenty-six are the phase's own, and both the round and its predecessor say
  otherwise.

