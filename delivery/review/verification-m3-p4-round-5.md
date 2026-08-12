# M3-P4 fix round 5, delta verification

Verifier: delta verifier (T-003), independent of the implementation session.
Head verified: 6f9406a (detached worktree).
Delta under review:

```
git diff --stat c7d9d2c..HEAD
 delivery/work-history/m3-p4.md | 524 +++-
 schemas/report.schema.json     |   8 +-
 test/report-contract.test.ts   |  30 +-
```

Status: COMPLETE. Verdict: APPROVE. See the "## Verdict" section at the end
for the summary table and the one new residue recorded.

## What this verification did NOT cover

- **I did not independently re-derive the full "29 count-plus-derivation
  sentences" figure from Sweep B.** I spot-checked the two sites the round
  says it examined and deliberately left unchanged
  (`schemas/report.schema.json:313` and `:382`, both quoted verbatim and
  confirmed to match the file at those lines), and I ran my own independent
  regex sweep across all three touched schemas for `(found|names?|derived)
  ... <number> <word>` shaped phrases looking for anything left over-claimed;
  it turned up nothing beyond the two historical-narration mentions of "four
  members" that are corrected in the same paragraph (Item 4 below) and one
  unrelated, pre-existing, round-3-scoped claim ("derived four of them",
  `work-history.schema.json:161`, about the `verificationFirst` token list,
  outside CR-C-1's class and outside this round's stated fix set). I did not
  read all 29 of the round's own listed sentences one by one against their
  cited derivations.
- **I did not re-attack the eleven claims contract C already attacked and
  held**, matching the round's own stated scope; re-litigating a held claim
  from round 4's review is not this round's contract.
- **I did not audit the seven schemas the phase does not touch**, or
  pre-existing `main` prose for the same over-claiming shape, matching the
  round's own declared boundary.
- **I did not attempt to force `src/gates/run.ts:989`, `:1009`, `:1023` or
  `:1035` through the real runner myself.** I verified their line numbers and
  conditions by reading the source (table in Item 4), and I verified the
  round's and the reviewer's forced members (Member A at :1015) are
  reproduced in the work history with captured commands, but I did not
  personally re-run `tiphys gates run` against a scratch registry for the
  three-or-four unforced sites; that would be new derivation beyond this
  round's stated scope, not a check on what the round claims.
- **CI (the `pull_request` and `push` workflow runs) was not observed.** This
  worktree is detached at 6f9406a with no open PR event; T-009 requires the
  post-merge `push` run on the eventual new `main` tip to be watched
  separately, and that cannot exist yet.
- **I did not re-run the `scope`, `manifest-self-check`, `coverage`,
  `red-witness`, or `clause-map` gates**, only `citations` (which correctly
  reported not-applicable for this delta, see Item 6 below) plus the full
  `npm test` suite and targeted re-runs of the two changed test bodies. The
  delta touches no `delivery/plan/`, `delivery/decisions/`,
  `delivery/requirements/`, `delivery/verification/`, `delivery/tuition/` or
  `delivery/STATE.md` path, which is what makes most of those gates
  legitimately inapplicable to this specific three-file delta; I did not
  verify that inapplicability determination for every gate, only for
  `citations`.
- **I did not check whether the mutated-in-place experiments (Items 1-2,
  below) altered `dist/` or any build artifact.** `dist/` is gitignored and
  not part of `git status`, so a stray build byproduct from a mutation run
  would not show as dirty; I did not separately inspect `dist/` for staleness
  after restoring the source files. `npm run build` was re-run clean after
  all mutation experiments were done and before the full suite run, which
  should cover this, but I note the gap rather than assume it away.

## Setup

- Toolchain: node v26.6.0 at
  /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/toolchain/node-v26.6.0-linux-x64/bin
  put first on PATH; verified `node --version` in the executing shell each time
  (see individual commands below).
- Prior reviews and ruling fetched from origin/main at 7d55392 (after
  `git fetch origin main`), stored at
  /tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/dv5-evidence/{cr-criteria.md,cr-argument-audit.md,arbitration-r4.md}.
  Read in full before starting.

## Item 3 (did first, cheapest and highest-leverage): schema behaviour unchanged, by construction

`git diff --stat` says `schemas/report.schema.json | 8 +-`. Checked every
changed line-pair is a `$comment` string and nothing else:

```
$ git diff c7d9d2c..HEAD -- schemas/report.schema.json | grep -E '^[+-]' | grep -v '^+++\|^---' | grep -v '"\$comment"'
(no output)
```

All 4 changed lines (8 diff lines, +4/-4) are `$comment` values. Then proved
it structurally rather than by re-reading: parsed both schema revisions as
JSON, stripped every `$comment` key recursively at every depth, and compared
the resulting structures for exact equality.

```
$ node -e '
const a = JSON.parse(require("fs").readFileSync(process.argv[1]));
const b = JSON.parse(require("fs").readFileSync(process.argv[2]));
function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === "object") {
    const r = {};
    for (const k of Object.keys(o)) { if (k === "$comment") continue; r[k] = strip(o[k]); }
    return r;
  }
  return o;
}
console.log("equal after stripping $comment:", JSON.stringify(strip(a)) === JSON.stringify(strip(b)));
' <(git show c7d9d2c:schemas/report.schema.json) <(cat schemas/report.schema.json)
equal after stripping $comment: true
```

This is a stronger guarantee than "documents that validated before still
validate": the two schemas are the SAME validator by construction, not
merely empirically indistinguishable on the samples I happened to run. Item 3
is CLOSED. (Empirical corroboration with real `validate` runs against the
CR-C-1 fixtures follows below alongside CR-C-1's own verification.)

## Item 1 and item 2: CR-A-1 (test/report-contract.test.ts)

Diff for this file, reviewed first (`git diff c7d9d2c..HEAD -- test/report-contract.test.ts`):
the pinned `assert.equal(oneHop.size, 3, ...)` at the old line 1394 is
replaced with a `for` loop asserting `oneHop.has(direct) === true` by name
for the three literal pointers `report.schema.json#/$defs/gateResult`,
`report.schema.json#/$defs/claim`, `report.schema.json#/$defs/fixRound`, plus
the pre-existing `assert.ok(closure.size > oneHop.size, ...)` inequality
retained unchanged below it.

Baseline: at HEAD, unmodified, this test passes.

```
$ node --version
v26.6.0
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
tests 1
pass 1
fail 0
```

### Reproducing the reviewer's two members (CR-A-1's own witnesses)

Pristine copies of schemas/report.schema.json, schemas/work-history.schema.json
and test/report-contract.test.ts were made before any mutation, at
/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/dv5-pristine/,
and every mutated file below was restored from that copy (never
`git checkout --`) before the next experiment, verified with `diff` against
`git show HEAD:<path>` after each restore.

**Member 1**, a scratch `schemas/verdict.schema.json` (deleted after, never
committed) `$ref`-ing `report.schema.json#/$defs/finding`:

```
$ cat schemas/verdict.schema.json
{
  "$id": "https://tiphys.dev/schemas/verdict.schema.json",
  ...
  "properties": { "findings": { "type": "array", "items": {
    "$ref": "report.schema.json#/$defs/finding" } } }
}
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
pass 1
fail 0
```

**Member 2**, the same shape `$ref`-ing `report.schema.json#/$defs/evidence`:

```
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
pass 1
fail 0
```

**Both PASS with the new by-name assertion.** This is correct and intended,
not a gap: CLAUDE.md convention 5 says a test over an append-only registry
must assert BY NAME, never BY COUNT, precisely so that a later phase's
legitimate addition does not redden it. Adding a fourth cross-document `$ref`
(what CR-A-1's own witnesses did, and what M3-P7 will really do) is exactly
that legitimate addition. The old `assert.equal(oneHop.size, 3)` would have
reddened here (this is what CR-A-1 demonstrated against the pinned form,
`4 !== 3`, confirmed by inspection of `arbitration-r4.md`'s own quoted
derivation rather than re-run, since the pinned line no longer exists at this
head to re-run against). The new form deliberately does not, and that is the
fix working, not a residue.

### Confirming the new assertion still reddens on a genuine violation

Two structurally different violations, both restored afterward from the
pristine copies:

**Violation A: remove the `claims` cross-document $ref** in
`schemas/work-history.schema.json` (`properties.claims.items` changed from
`{ "$ref": "report.schema.json#/$defs/claim" }` to `{ "type": "object" }`,
simulating a future edit that silently stops sharing the definition):

```
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
fail 1
AssertionError [ERR_ASSERTION]: report.schema.json#/$defs/settledBy
+ actual - expected
  [
    'report',
-   'work-history'
  ]
```

Reddens (on the earlier "chained pointer" assertion in the same test, since
`claim` is also how `work-history` reaches `settledBy` transitively; the test
never gets to the by-name loop because an earlier assertion in the same test
body already catches this damage). Restored and confirmed clean:
`diff schemas/work-history.schema.json <(git show HEAD:schemas/work-history.schema.json)`
produced no output.

**Violation B: rename the `gateResult` $defs key to `gateOutcome`** everywhere
a real `"$ref"` value pointed at it (`schemas/report.schema.json`'s `$defs`
key itself, its one internal self-`$ref`, and
`schemas/work-history.schema.json`'s cross-document `$ref`; comment prose
mentioning the old name left untouched since it is not machine-read):

```
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
fail 1
AssertionError [ERR_ASSERTION]: report.schema.json#/$defs/gateResult was
expected to be visible one hop out; the one-hop set is
report.schema.json#/$defs/gateOutcome, report.schema.json#/$defs/claim,
report.schema.json#/$defs/fixRound
false !== true
```

This one fails at the by-name loop itself (line ~1409 in the diff), the exact
assertion CR-A-1 replaced. Restored and confirmed clean against
`git show HEAD:schemas/report.schema.json` (no diff) and the same for
`work-history.schema.json`.

**CR-A-1 verdict: CLOSED.** The new assertion is by name, passes on the
reviewer's two witnesses (correctly, since those are legitimate growth, not
violations), and reddens on two structurally different genuine violations
(a severed cross-document ref, and a renamed $defs key), one of which trips
the very assertion line CR-A-1 named.

## Item 2: the counterfactual claim (round's key-rename argument)

The round's work history claims that under the `gateResult` to `gateOutcome`
key-rename mutation, the OLD assertion (`assert.equal(oneHop.size, 3)`) would
have stayed GREEN while the NEW by-name assertion reddens, i.e. the by-name
form guards strictly more than the pinned form for this mutation.

Reproduced directly: I instrumented a scratch copy of the test (never
committed, restored after) to print `oneHop.size` right after computing it,
under the same `gateOutcome` rename as Violation B above:

```
$ node --test --test-name-pattern "a check guarding a definition reached through a chain of references" test/report-contract.test.ts
ONEHOP_SIZE=3 KEYS=report.schema.json#/$defs/gateOutcome|report.schema.json#/$defs/claim|report.schema.json#/$defs/fixRound
fail 1
```

`oneHop.size` is still exactly 3 after the rename (the set just has a
different member: `gateOutcome` in place of `gateResult`), which is exactly
what `assert.equal(oneHop.size, 3)` requires to pass, which is the OLD assertion
would have been GREEN under this mutation. The actual shipped assertion
(by name) is RED under the same mutation, shown above as Violation B.

**Counterfactual claim: CONFIRMED, by direct reproduction of both sides of
the comparison at the same mutation, not by argument.** The by-name form
strictly dominates the pinned form on this witness: same green baseline,
same red on a real defect (severed/renamed direct pointer), but the by-name
form is also green on legitimate growth where the pinned form would have
been red (that direction is CR-A-1's own witnesses above). The pinned form
has no case in this set where it is right and the named form is wrong.

Every mutated file was restored from the pristine copy after this
experiment; confirmed with `diff schemas/report.schema.json
<(git show HEAD:schemas/report.schema.json)` and the equivalent for
`work-history.schema.json`, both silent.

## Item 4: the corrected numbers against src/gates/run.ts, measured myself

```
$ grep -n 'spawnSync' src/gates/run.ts | head -3
2:import { spawnSync } from "node:child_process";
...
943:  const child = spawnSync(entry.command[0] as string, argv, {

$ grep -n 'errorResult(' src/gates/run.ts | wc -l
18
$ grep -n 'errorResult(' src/gates/run.ts | grep -v '^787:' | wc -l
17
$ grep -n 'errorResult(' src/gates/run.ts | grep -v '^787:' | awk -F: '$1<943' | wc -l
7
$ grep -n 'errorResult(' src/gates/run.ts | grep -v '^787:' | awk -F: '$1>943' | wc -l
10
```

18 total matches of `errorResult(`: one is the function definition at line 787,
seventeen are call sites, seven above the spawn at line 943, ten below it.
**This exactly matches the round's corrected claim** ("17 call sites, 7 above
the spawn and 10 below") and resolves the task prompt's own "seventeen or
eighteen" ambiguity: eighteen is the raw grep-match count including the
definition, seventeen is the call-site count, and the round's corrected text
consistently uses the call-site count (17), which is the right one for a
claim about the CLASS OF RECORDS THE CODE CAN PRODUCE (the definition itself
produces no record).

### A residue in the correction: the shipped $comment's "unforced" list is short by one

Traced every below-spawn call site to what it does, by reading
`src/gates/run.ts:985-1065` directly:

| line | condition | status per work-history/CR-C-1 |
|---|---|---|
| 989 | capture refused | named, not forced |
| 992 | `child.error` (spawn itself failed) | examined by round 4 |
| 999 | signal termination | examined by round 4 |
| 1009 | `entryClass` irregular/unexaminable | named, not forced |
| 1015 | exited but wrote no record | forced (reviewer's Member A) |
| 1023 | record read refused / vanished | named, not forced |
| 1035 | record does not JSON.parse | **not named anywhere in the shipped schema $comment** |
| 1043 | record fails its own schema | forced (reviewer's Member C) |
| 1051 | record names the wrong gate | forced (reviewer's Member B) |
| 1060 | exit code disagrees with recorded status | forced (reviewer's Member D) |

That is 2 examined + 4 forced + 4 unforced (989, 1009, 1023, **1035**) = 10,
which is arithmetically required (10 below-spawn sites, 2 examined, 4 forced,
so 10 - 2 - 4 = 4 must remain unforced-and-named or the enumeration is
incomplete).

The round's own `delivery/work-history/m3-p4.md` gets this right, twice:

```
$ grep -n '1035' delivery/work-history/m3-p4.md
3284:1035:    return errorResult(
3409:below-spawn sites (src/gates/run.ts:989, :1009, :1015, :1023, :1035, :1043,
3471:1035  mentions outside the pasted grep: 0
3495:BELOW the spawn (10): 989, 992, 999, 1009, 1015, 1023, 1035, 1043, 1051, 1060
3503:eleven either; :989, :1009 and :1023 are unforced, src/gates/run.ts:1035 was
3962:src/gates/run.ts:989, :1009, :1023 or :1035, so the class size stated above is a
3503:forced by nobody, and a later change to the runner can add more.
```

`delivery/work-history/m3-p4.md:3503` names all four unforced sites (989,
1009, 1023, and separately "src/gates/run.ts:1035 was forced by nobody").

**But the SHIPPED schema comment does not.** The only enumeration of the
"named and not forced" set inside `schemas/report.schema.json` is:

```
$ node -e 'const s=require("fs").readFileSync("schemas/report.schema.json","utf8");
const i=s.indexOf("989"); console.log(s.slice(i-40,i+220));'
...and three more (src/gates/run.ts:989, src/gates/run.ts:1009,
src/gates/run.ts:1023) are named and NOT forced. Fix round 5 reproduced the
src/gates/run.ts:1015 member itself...
```

`grep -c '989' schemas/report.schema.json` finds exactly one occurrence of
that number in the whole file, and `1035` does not appear in
`schemas/report.schema.json` at all (`grep -c '1035' schemas/report.schema.json`
returns 0). The shipped, durable artifact says "three more... named and NOT
forced" where the round's own accompanying work history says four, and the
count I derived directly from `src/gates/run.ts` requires four.

### NEW FINDING (dv5-1, severity LOW): the round's own correction of CR-C-1 undercounts the "named and unforced" set by one, in the shipped schema comment only

- **What is false:** `schemas/report.schema.json`'s `$defs/gateResult`
  `$comment` (and the identical sentence duplicated at
  `$defs/gateResult/oneOf/1` `no-wrapper-exit-code`'s `$comment`) both say
  "three more... are named and NOT forced", naming 989, 1009, 1023. The true
  count, both by my own read of `src/gates/run.ts:985-1065` and by the
  round's own work history, is FOUR: 989, 1009, 1023, and 1035 (a JSON parse
  failure on the result record), which is not named in either shipped
  $comment.
- **Why it is the same mechanism, one size down:** this is CR-C-1's exact
  shape recurring inside CR-C-1's own fix, exactly the risk the round's
  epigraph in this dispatch was written to catch. The magnitude is far
  smaller (missing 1 of 10 below-spawn sites in a "not a total, a floor"
  disclaimer, versus round 4's original claim of "four members" for a class
  of at least eleven), and it does not carry a schema defect (verified in
  Item 3 above: no keyword changed, so nothing is refused or accepted
  differently because of this miscount).
- **Why LOW and not MEDIUM:** the round's own text explicitly disclaims
  exhaustiveness ("SO THE NUMBER IS A FLOOR AND NOT A TOTAL... the
  enumeration is open") for the very reason that would make an exact count
  matter less, and the accompanying work history (which CLAUDE.md's
  durability table also requires and treats as an authoritative record) has
  the correct number in three places. A reader who goes to the work history,
  which the schema comment itself points to by name ("derived in full in
  delivery/work-history/m3-p4.md"), gets the right count. But the shipped
  artifact is the one CR-C-1 was specifically about, or "a false claim in a
  durable record is how a real defect stays hidden" (arbitration-r4.md:69),
  and nothing here is machine-checked: `grep -n "1035\|1009\|errorResult"
  test/report-contract.test.ts` returns no output, so a future edit could
  make this drift further with no gate noticing.
- **Not itself a reason to send the round back a sixth time**, in this
  verifier's judgment: it does not reopen the schema-behaviour question (Item
  3), it does not misstate the total (17/7/10, all independently verified
  above), and it is smaller in every dimension than what it corrects. Recorded
  as a residue for the arbitrator to weigh, per this round's own standard that
  a correction is itself a claim, and per CLAUDE.md's "the reviewer's FIRST
  check is item 3" for the same reason: it belongs in the record even though
  it is not being written as a reason to reject.



## Item 5: the sweeps

**Sweep A (four surviving pinned `.length`/`.size` assertions in the phase
diff), reproduced with the round's own command:**

```
$ git fetch origin main -q
$ for f in $(git diff --name-only origin/main..HEAD | grep -E '\.ts$'); do
    grep -nE 'assert\.(equal|strictEqual|deepEqual|ok)\([^)]*(\.length|\.size)' "$f"
  done
test/report-contract.test.ts:1294:  assert.ok(schemas.size >= 3, ...)
test/report-contract.test.ts:1936:  assert.equal(branches.length, 4);
test/work-history.test.ts:225:     assert.equal(companions.length, 1);
test/work-history.test.ts:498:     assert.equal(branches.length, 3);
```

Same four sites the round names. Checked each claim independently:

- `report-contract.test.ts:1294`: `assert.ok(schemas.size >= 3, ...)` is an
  inequality already, not a pinned equality; matches the round's own
  classification without dispute.
- `report-contract.test.ts:1936` and `work-history.test.ts:498`: read both in
  full context (`test/report-contract.test.ts:1935-1936` and
  `test/work-history.test.ts:497-498`). Both `assert.equal(branches.length,
  N)` lines are immediately followed by `branches.pop()`, confirmed by
  reading the next line at both sites. That is the round's claimed
  justification (the count exists so `pop()` removes the SAME branch the
  witness names, and reddening on growth is the safe failure direction for a
  defang, not a bug). Holds on inspection.
- `work-history.test.ts:225`: `companions.length` reads `COMPANION_TABLE` at
  `src/commands/validate.ts:93-95`, a hand-written `Map` with exactly one
  entry (`["work-history", ["report"]]`), confirmed by reading the source.
  Not a scan over a growing directory; a second companion would be a
  deliberate schema-contract change, not organic registry growth. Holds on
  inspection.
- The claimed "six `=== 0` emptiness hits in changed `src/` files, none a
  pinned cardinality" also reproduced exactly:
  ```
  $ grep -nE '\.(length|size)\s*===\s*0' src/checks.ts
  197, 481, 1560, 1582, 1722, 1901
  ```
  Six lines, the same six line numbers the round names, all `=== 0`
  presence/emptiness checks rather than pinned counts.

**Sweep A: all four survivors' justifications hold on independent reading,
including the two `branches.length` pins the task singled out.**

**Sweep B (29 count-plus-derivation sentences, 4 corrected, 2 examined and
left):** spot-checked rather than exhaustively re-derived (see "did not
cover" above). The two "examined and deliberately not changed" sites were
read at their cited lines and match the quotes in the work history verbatim:

```
$ node -e 'const s=require("fs").readFileSync("schemas/report.schema.json","utf8").split("\n");
console.log(s[312].includes("It broke on the first try and on four members"));
console.log(s[381].includes("THREE MEMBERS OF THE CLASS THEY DO NOT REACH"));'
true
true
```

Both hold: `:313`'s "four members" is what a derivation FOUND (the branch's
repair is itself a declaration, so the count carries no normative weight),
and `:382`'s "three members" comes with its own built-in disclaimer against
being read as exhaustive. An independent regex sweep for other
count-plus-derivation-verb phrases across all three touched schemas (see "did
not cover") surfaced nothing beyond what is already discussed in Item 4.

## Item 6: gates and suite

```
$ node --version
v26.6.0
$ npm run build   # exit 0, git status clean afterward (confirmed separately)
$ git status --short
(clean except this report file)
$ npm test
tests 562
pass 562
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 157766.685239
```

Matches the stated reference (562/562/0 skipped) exactly, toolchain node
v26.6.0, `dist/` built, invocation `npm test`.

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only citations --evidence <dv5-evidence>/gates --base origin/main --head HEAD
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: no applicable gate
```

Correctly not-applicable: `citations`'s precondition
(`gate-registry.yaml:114-123`) is `diff-touches` on
`delivery/plan/, delivery/verification/, delivery/decisions/,
delivery/tuition/, delivery/requirements/, delivery/STATE.md`, none of which
this three-file delta touches. This matches the round's own work history
observation (`delivery/work-history/m3-p4.md:3966`, "the work history's own
prose is not gated by `citations`") rather than contradicting it.

## Item 7: the claim grep over the round's own added lines

```
$ git diff -U0 -- delivery/work-history/m3-p4.md | grep '^+' | grep -v '^+++' \
    | grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to'
```

Ran this myself over the round-5 section (`delivery/work-history/m3-p4.md`
from line 3723 to end) rather than trusting the round's own report of its
own grep. Found the same two pre-final-edit hits the round names ("and round
4 never saw it", "never by `git checkout --`"), both of which the round's own
text settles with an adjacent captured command or a stated fact about its own
actions, matching CLAUDE.md's contract. No unaddressed hit found.

## Verdict

**APPROVE**, with one new LOW residue recorded (dv5-1) that does not, in this
verifier's judgment, warrant a sixth round.

| finding | status | evidence |
|---|---|---|
| CR-A-1 (pinned `oneHop.size` count) | **CLOSED** | by-name assertion passes on both reviewer witnesses (Items 1-2), reddens on two structurally different genuine violations (severed ref, renamed key), the specific by-name assertion line reddens directly under the renamed-key mutation |
| CR-C-1 (undercounted "four members" completeness claim) | **CLOSED, WITH RESIDUE** | schema behaviour proven unchanged by construction and corroborated empirically (Item 3); corrected numbers (17 call sites, 7 above / 10 below the spawn) verified against `src/gates/run.ts` myself and exactly match (Item 4); but the shipped schema `$comment`'s own restatement of the correction undercounts the "named and not forced" set by one (three named, should be four; `src/gates/run.ts:1035` is missing), even though the round's own work history states the correct count of four in three separate places (dv5-1, LOW) |

**Counterfactual claim (by-name assertion strictly dominates the pinned form
under a `gateResult`-to-`gateOutcome` key rename): CONFIRMED by direct
reproduction of both sides at the same mutation.** Instrumented the test to
print `oneHop.size` under the rename: it stays exactly 3 (just with a
different member), which is what the old `assert.equal(oneHop.size, 3)`
needed to stay green. The actual shipped by-name assertion reddens under the
identical mutation. Same green baseline, same red on a real defect, and the
by-name form is additionally green where the pinned form would have wrongly
reddened (the reviewer's two witnesses, legitimate schema growth). No case
found where the pinned form was right and the named form was wrong.

**New finding: dv5-1 (LOW).** The round's correction of CR-C-1's undercount
itself contains a smaller undercount, in the shipped `schemas/report.schema.json`
`$comment` only (not in the accompanying work history, which has the correct
number in three places, and not in any test, so nothing here is
schema-behaviour-affecting). Full detail and the line-by-line table under
"Item 4" above. Flagged because it is the same mechanism this round exists to
close, recurring one order of magnitude smaller inside the fix itself, which
is exactly what this dispatch asked the delta verifier to attack hardest.
Recommended action: worth a one-line follow-up edit to the shipped
`$comment` (name the fourth site, `src/gates/run.ts:1035`, or say "at least
four" rather than "three more") whenever this file is next touched, but not,
by itself, grounds to reopen this round: it does not restate the class size
wrong (17/7/10 all confirmed correct), it does not change schema behaviour,
and it is explicitly hedged as "a floor and not a total" in the same
sentence.

**Suite:** node v26.6.0, `dist/` built, `npm test`: 562 tests, 562 pass, 0
fail, 0 skipped, matching the stated reference exactly. `git status` clean
after build. `citations` gate correctly not-applicable for this delta
(precondition paths untouched). Claim grep over the round's own added lines:
two hits, both settled by an adjacent captured command or fact, matching
CLAUDE.md's fix-round contract.

See "What this verification did NOT cover" at the top of this file for
everything this review did not attempt.
