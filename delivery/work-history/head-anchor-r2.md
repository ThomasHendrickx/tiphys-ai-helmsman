# Work history: DR-0047 approval sweep, round 2, the head anchor and two residues

Branch: `claude/sweep-fix-head-anchor-r2`. Base: `claude/m4-sweep-integration`
at d653022, which is the union of round 1's three branches and not `main`.

Round 1 fixed the findings it was given. This round fixes one defect round 1
INTRODUCED, two residues round 1 escalated because the files were not its own,
and one further call site of round 1's own mechanism that nobody had looked at.
Round 1's work is not undone anywhere here.

Files touched: src/checks.ts:1, scripts/check-dual-review.mjs:1,
src/gates/merge-preconditions.ts:1, src/commands/doctor.ts:1, src/task.ts:1,
src/validate.ts:1, `schemas/README.md`, `test/**` and this document.

## 0. The suite, as a complete sentence

Interpreter `/tmp/claude-0/n26/bin/node`, **v26.6.0**, read with `node --version`
in the shell that ran the command. Build state: `npm ci` exit 0 then
`npm run build` exit 0, and `git status --porcelain` afterwards names only the
files this round edits (no `dist/`, no `*.tsbuildinfo`). Invocation: `npm test`,
which `package.json` defines as `node --test "test/**/*.test.ts"`.

```
i tests 1387
i suites 0
i pass 1387
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 358168.95449
NPM_TEST_EXIT=0
```

Transliteration note, per the repository's declared resolution: the Node test
reporter's summary glyph U+2139 is rendered `i` above, 16 occurrences across the
two summary blocks in this section, counted with `grep -o`. No U+2716 appears in
either block because no test failed, and no per-test line is pasted in this
section, so no U+2714 needed rendering here. Section 4 carries its own note for
the one block that does paste per-test lines. Nothing else in any captured
output in this document was altered.

**THE BASELINE WAS MEASURED, NOT QUOTED.** The same interpreter, the same
invocation and `npm run build` first, in a detached worktree at d653022:

```
i tests 1380
i suites 0
i pass 1380
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 351278.448468
NPM_TEST_EXIT=0
```

This round adds SEVEN tests, four in test/dual-review-head-anchor.test.ts:1, one
in test/schemas.test.ts:340, one in test/doctor.test.ts:2321 and one in
test/merge-preconditions.test.ts:1135. 1380 + 7 is 1387, which is the number
above. The SKIPPED count is zero on both arms, so no test was converted into a
skip by this round.

**A KNOWN LOCAL FAILURE THAT IS NOT THIS ROUND'S, and this round closed its
cause rather than only working around it.** test/gates.test.ts drops to an
unprivileged uid and spawns `process.execPath`; when that interpreter lives
under a mode-700 `/tmp/claude-0` the child cannot traverse to its own
interpreter. That is T-029, at
delivery/tuition/T-029-the-precondition-test-flakes-only-here.md:1. See section
6: the helper now grants traversal to the interpreter as well as to the
repository, and the red and green arms of that change are captured.

## 1. The MECHANISMS, not the findings

### M1. An ANCHOR EXPRESSED AS EQUALITY WHERE THE RELATION THAT CAN HOLD IS ANCESTRY

Round 1 closed CR-VS-001 by anchoring the verdict corpus to the commit under
audit: a verdict whose declared head is not the audited head is excluded. The
danger it names is real and both of its refusals are kept.

The mechanism it introduced is one relation too narrow. **A verdict cannot name
the commit that carries it.** Reviewers read commit X and write a verdict
naming X; committing that verdict produces X+1; CI audits X+1 or a merge commit
above it. So in every flow that commits its reviews, the declared head is a
strict ancestor of the audited one, and under equality every such run excluded
every verdict and reported not-applicable. That is a claim about flows and the
measurement that settles it follows. Measured by the orchestrator on round 1's own branch at
5867a918cda809f7c5d4bc366fc7940458c140c0: the verdicts declared that commit, the
gate audited its direct child 0ddd06a73d49c1910449d01303bc9c2579f5f492, and the
record read not-applicable, exit 21.

The finding is "green forever once fed" becoming "never green", which is the
cannot-do-its-job shape at the other pole: a gate that cannot go green is as
uninformative as one that cannot go red, and this one carries DR-0047's approval
stamp.

The repair is ANCESTRY CONSTRAINED BY WHAT CHANGED IN BETWEEN. A verdict is
evidence about the SHIPPED CONTENT it read. If the audited commit's shipped
content is identical to the reviewed commit's, the audited commit is the thing
the reviewer approved, whatever paperwork landed on top. So a declared head is
admitted when it is the audited commit, or when it is an ancestor and every path
that differs between the two trees is under `delivery/`.

### M2. A REPORTING CONSUMER THAT DOES NOT CATCH WHAT ITS SIBLING CATCHES

Round 1 made `poolList` THROW on an unlistable `tasks/`, which is right: a
category empty by construction must not be reported as empty by observation.
src/commands/next.ts:335 catches it and reports into `unknown`. Doctor did not,
so a DIAGNOSTIC command aborted on the first check that could not look, printing
nothing and exiting 1. One consumer of one function degraded and the other
aborted, and the asymmetry is the defect rather than the missing line.

### M3. TWO HAND-WRITTEN LISTS, ONE ENFORCED AND ONE RENDERED, WITH NOTHING COMPARING THEM

`AUTHORING_VOCABULARY` at src/validate.ts:144 holds sixteen keywords; the table
in `schemas/README.md` declared fifteen, missing `uniqueItems`, since the day
M3-P1 wrote both. Adding the row closes the instance. What closes the mechanism
is an assertion that the document's keyword column equals the constant, because
the next keyword anybody adds to either half is the next instance.

### M4. A TRAVERSAL GRANT THAT COVERS THE REPOSITORY AND NOT THE INTERPRETER

`grantTraversalWhenUnderTmp` opened the chain to the repository for an
unprivileged child and said nothing about `process.execPath`. A run whose node
lives under a mode-700 prefix therefore spawns a child that cannot reach its own
interpreter, and the failure looks like a branch failure. Same shape as M2: a
guard written for one of the two paths a call needs.

## 2. The DERIVATION

The script is `derive.sh` in the round's scratch directory and its FULL output
is section 7 of this document, not a summary of it. Every section below cites
the block that produced its rows.

### M1's derivation, and what it found

D1a lists every gate the registry hands a run identifier to, which is the set of
gates that CAN compare a declared identifier to a run one. D1b lists every place
in `src/`, `bin/` and `scripts/` that parses `--head`, `--base` or `--phase`.
D1c lists every equality test against a resolved commit or a declared head in
the modules that admit or exclude evidence. D1d lists every call site of the two
functions that place evidence against the commit under audit.

**D1c FOUND A SECOND CALL SITE OF THE MECHANISM, AND NO REVIEW HAD NAMED IT.**
`src/gates/merge-preconditions.ts` selected its corpus with

```
.filter((entry) => String(entry.record["head"] ?? "").toLowerCase() === head)
```

which is the same comparison spelled once more, in the gate that encodes
DR-0012's six merge conditions. Under it that gate's own precondition ("a merge
is being proposed at this head, evidenced by a committed verdict naming it")
could never be met either, so every real run of it reported not-applicable and
none of the six conditions was ever evaluated. Both sites now read the relation
from ONE function, src/checks.ts:4243, so they cannot drift into two answers
about one question.

### M2's derivation

D2a lists every caller of `poolList`. There are three: src/commands/next.ts:335
(already catching), src/commands/doctor.ts:1499 (fixed here) and
src/commands/pool.ts:112. The third is the `pool list` COMMAND, whose whole job
is that listing; an uncaught throw there exits nonzero with the reason on
stderr, which is the correct behaviour for a command that has one output and
could not produce it, so it is left alone deliberately rather than by omission.

D2b lists every exported doctor check and D2c every directory listing reachable
from one, so a check that can abort the run is visible rather than inferred.
src/commands/doctor.ts:1093, :1198 and :738 each already guard their own
`readdirSync`; the pool listing was the one that reached an unguarded one
through a callee.

### M3's derivation

D3a lists every shipped list constant a document claims to render, D3b every
README under a tracked tree. Only `schemas/README.md` renders a vocabulary, and
only `AUTHORING_VOCABULARY` and `ANNOTATION_KEYS` are rendered by it.

D3a also surfaced a SECOND pair of constants, `VALIDATION_KEYWORDS` and a second
`ANNOTATION_KEYS` at src/gates/validate.ts:69, which are a different and
narrower closed set for gate-result schemas. No document renders them, so M3's
mechanism does not reach them. That they are a second constant under one name is
a DIFFERENT mechanism and is not closed here; see section 3.

## 3. WHAT THE DERIVATION DID NOT COVER

The reviewer's first check.

1. **Only the EQUALITY spelling of M1 was enumerated.** D1c greps for `===` and
   `!==`. A site that compared a declared identifier to a run identifier through
   `.includes`, a `Set`, a `startsWith` or a `Map` key would not appear. One
   such comparison is known and was read by hand rather than by the grep:
   src/gates/merge-preconditions.ts:546 matches an arbitration document's token
   as a PREFIX of the head, which is a different relation on purpose and is
   unchanged.
2. **The `plugin/` tree and `.github/workflows/` were searched only for the
   selection rule, and only by pattern.** The search returned nothing:

   ```
   grep -rn 'head.*===\|toLowerCase() ===\|partitionByAuditedHead\|record\["head"\]' plugin/ .github/
   (no output)
   ```

   An empty result from a pattern search is not the same fact as an absence, and
   this one is reported as what it is.
3. **The WORKTREE arm of `check-dual-review` is still not head-anchored.** It is
   restated with a reason in section 5 rather than closed, and the cost of
   closing it was measured rather than guessed.
4. **The ancestry rule is a claim about the two TREES, not about each
   intervening commit.** `git diff --name-only <declared>..<audited>` compares
   endpoints, so a commit that adds `src/x.ts` and a later one that removes it
   leaves no entry and is admitted. That case is admitted deliberately and the
   reasoning is at src/checks.ts:4134; what it means for coverage is that no
   assertion here is about intermediate trees, and nobody checks one out.
5. **`delivery/` is the only evidence root.** A project whose paperwork lives
   elsewhere gets every gap refused. The prefix is `PAPERWORK_ROOT`, which is
   the kernel's own declared root and not a name invented here, and a consumer
   with another layout is not covered.
6. **Two `git diff` spellings are controlled and the rest are not.** Rename
   detection is disabled with `--no-renames`, because a rename from `src/a.ts`
   to `delivery/b.md` would otherwise print the DESTINATION ONLY and the
   deletion of a shipped file would be invisible. Path quoting is disabled with
   `-z`, for the opposite direction, and that one was found by reading the
   implementation rather than by any test (see section 4c). Nothing else about
   a repository's `diff.*` configuration is controlled or tested.
7. **No CI arm was exercised.** Everything here ran locally on the
   floor-satisfying toolchain. `.github/workflows/gates.yml` is outside this
   round's edits and the interaction between the new admission and its direct
   `check-dual-review` step is reasoned from the file's text and from local runs
   of the same two commands, not observed on a runner.
8. **`npm pack` was not run**, so nothing here establishes what the packed
   package contains after the src/task.ts re-export in section 6.
9. **The second vocabulary at src/gates/validate.ts:69 is enumerated and not
   reconciled.** Nothing compares it to `AUTHORING_VOCABULARY`, and nothing here
   establishes whether the two SHOULD agree; they are different closed sets for
   different document families as far as their comments say.
10. **M4's fix is witnessed only on this container.** The red arm needs a
    repository outside the OS temp root and an interpreter under a mode-700
    prefix; a runner with a system node reaches neither arm.
11. **THIS REPOSITORY'S OWN `check-dual-review` RESULT IS UNCHANGED, and that
    was measured rather than assumed**, because a corpus rule that started
    admitting documents could have changed a gate this repository runs on
    itself. The precondition arm, same command, same head-supplying flag, at
    both heads:

    ```
    base d653022 : check-dual-review: 0 verdict document(s) (corpus: delivery/review
                   read from commit d6530221... ) ... exit 1
    head 7f05c05 : check-dual-review: 0 verdict document(s) (corpus: delivery/review
                   read from commit 7f05c059... ) ... exit 1
    ```

    Zero on both, so the gate is not-applicable here before and after.
12. **THE TWO CORPORA HAVE DIFFERENT ROOTS, which the measurement above
    surfaced and this round does not change.** The PAIR corpus is
    `delivery/review/**` (the `scope` field prints it) while the FALSIFIER
    corpus is `delivery/**`. `git grep -c '^kind: verdict' -- 'delivery/**'`
    reports 13 documents in this repository, all of them under
    `delivery/evidence/`, and the pair loader sees none of them. Round 1's
    CR-VS-002 fix was about DEPTH and made both loaders recursive; the ROOT
    asymmetry is a different fact, it is enumerated here, and closing it is not
    this round's finding.
13. **The relation is computed PER VERDICT and spawns git**, up to three
    processes each (`rev-parse`, `merge-base --is-ancestor`, `diff`), and an
    equal head spawns none. Nothing here measures that cost against a corpus
    much larger than the 13 documents above.
14. **The stored-witness staleness check in section 4b is a TEXT check.** It
    proves every mutation still applies; it proves nothing about whether a
    mutation still produces the dangerous state it was written for. Only the one
    member this round rewrote was reasoned about on that second question.

## 4. The red witnesses

Every capture below is real output of the shipped program, taken with the probe
`probe.mjs` in the round's scratch directory, which stages the same shapes the
tests stage. The RED column is run against a detached worktree at d653022, so it
is round 1's shipped code and not a defanged copy of this round's.

### M1: FOUR members of one class, three red and one green

They fail by structurally different routes, and the fourth is the control
without which the three refusals are indistinguishable from a gate that can no
longer go green at all, which is the defect this round exists to fix.

**RED, all four, at d653022.** The green control included:

```
=== ancestry class, four members, against BASE (round 1, claude/m4-sweep-integration at d653022)

--- MEMBER 1 RESOLUTION: verdicts declare deadbeef...deadbeef, audited HEAD is real
    exit=20 status=not-applicable units=0

--- MEMBER 2 NOT-ANCESTOR: verdicts declare a sibling-branch commit
    exit=20 status=not-applicable units=0

--- MEMBER 3 SHIPPED GAP: ancestor, but src/shipped.ts differs
    exit=20 status=not-applicable units=0

--- MEMBER 4 GREEN CONTROL: ancestor, whole gap under delivery/
    exit=20 status=not-applicable units=0
    detail: no verdict document was found (corpus: delivery/review read from commit
    687eb18f24e545b3a874b6ed0cccc2ae62e877e0, resolved from HEAD) for the commit under audit
    687eb18f24e545b3a874b6ed0cccc2ae62e877e0 ... so there is no pair of reviews to compare;
    2 committed verdict document(s) review other work and are NOT evidence about this commit:
    .../decorrelated-criteria.yaml declares head 5f972d31140e3843480b010dc4b27491f0fff99e,
    which is a commit in this repository and is not the commit under audit ...
```

The fourth row is the finding. A decorrelated approving pair that reviewed the
parent of the audited commit, whose entire gap is the verdicts themselves, is
reported as a review of other work.

**GREEN, on this branch**, same probe, same four stagings:

```
=== ancestry class, four members, against FIXED (claude/sweep-fix-head-anchor-r2)

--- MEMBER 1 RESOLUTION
    exit=20 status=not-applicable units=0
    detail: ... declares head deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, which does not
    resolve to a commit in this repository at all, so it is evidence about an object nobody
    can produce and it is not evidence about the commit under audit ...

--- MEMBER 2 NOT-ANCESTOR
    exit=20 status=not-applicable units=0
    detail: ... declares head 5844da353ca42c30691cadd16c2119ce1f5ca1d4, which is a commit in
    this repository and is neither the commit under audit 7e4b87d47d9b76aa4d9d78ceae187472f0938bf8
    nor an ancestor of it, so it is a review of other work ...
    (control) is-ancestor 5844da35 7e4b87d4 exit=1

--- MEMBER 3 SHIPPED GAP
    exit=20 status=not-applicable units=0
    detail: ... declares head e15215f09c94888e1005693a8c3b95ce98090c2c, which is an ancestor
    of the commit under audit 4010d1149d3b3cceecbac8198e804e432fd3db00, but 1 path(s) outside
    delivery/ differ between them (src/shipped.ts), so shipped work no verdict reviewed is
    riding in on a review of something else ...
    (control) is-ancestor reviewed=e15215f0 head=4010d114 exit=0
    (control) git diff --name-only: delivery/review/decorrelated-criteria.yaml ,
    delivery/review/decorrelated-hazard.yaml , src/shipped.ts

--- MEMBER 4 GREEN CONTROL
    exit=0 status=green units=2
    detail: 2 verdict(s) for the commit under audit 226f70532590a0f86606680747d902aba6e19b09
    (from --head 226f70532590a0f86606680747d902aba6e19b09) examined by 1 registered check(s)
    named dual-review-decorrelation and 1 named verdict-pair-approves; no decorrelation
    violation and the pair approves; 2 of 2 verdict(s) were admitted by ANCESTRY rather than
    by naming this commit, their gap to it being paperwork only: ...
    (control) git diff --name-only: delivery/review/decorrelated-criteria.yaml ,
    delivery/review/decorrelated-hazard.yaml , delivery/work-history.md
```

Why these are four members and not one shape four times: member 1 fails at
RESOLUTION, member 2 at ANCESTRY, member 3 at the CONTENT OF THE GAP, and member
4 passes. Each prints a different sentence and the tests assert that the other
routes' sentences are ABSENT, so a single refusal reason could not satisfy more
than one of them. The tests are
test/dual-review-head-anchor.test.ts:246, :346, :388 and :221.

**A FIFTH ROUTE, DIRECTION, is refused and tested separately.** A verdict naming
a DESCENDANT of the audited commit reviewed a tree the audited commit does not
contain. It is refused on its own sentence at
test/dual-review-head-anchor.test.ts:463, and the ancestry check that places it
is run in both directions inside the test rather than assumed.

**AN EQUAL HEAD STILL PASSES.** That is decided at src/checks.ts:4248, before
any git call, and it is the arm test/dual-review-head-anchor.test.ts:221
asserts. Deciding it first also matters for the second call site: `--head` there
comes from the CI event and need not be an object in the checkout.

### M1's second call site: merge-preconditions

The witness is in-file and uses the mutant this round replaced, which is the
dangerous state rather than an invented one:

```
'if (relation.kind === "same" || relation.kind === "evidence-only-ancestor") {'
  ->
'if (relation.kind === "same") {'
```

Against a real two-commit git context whose gap is `delivery/` only, the shipped
gate reports a `verdict-selection` row reading `2 verdict(s) admitted and 0
excluded`, and conditions 1 and 2 green; the mutant reports `not-applicable`,
units 0, and ZERO rows, so DR-0012's conditions are not evaluated at all. The
test is test/merge-preconditions.test.ts:1135 and it reads the gap from git
rather than assuming it from the staging.

### The fifth member of M1's class, found by reading rather than by review

`git diff --name-only` QUOTES a path outside printable ASCII. A paperwork file
named with one such character therefore arrived as a double-quoted,
octal-escaped spelling that does not start with `delivery/`, and a
paperwork-only gap was classified as shipped content. Measured on git 2.43.0,
one repository, one commit, one flag changed:

```
git diff --no-renames --name-only A..B      ->  "delivery/na\303\257ve.md"
git diff -z --no-renames --name-only A..B   ->  delivery/na<the real byte>ve.md
```

It is fail-CLOSED, so it admitted nothing it should not. It is fixed anyway
because refusing a green a project is entitled to is the cannot-go-green shape
this round exists to end, one filename narrower.

**RED**, a copy of this tree with `-z` and the NUL split reverted and nothing
else changed:

```
X a paperwork-only gap is still paperwork when a filename is not printable ASCII,
  which the default diff spelling would have called shipped content
  AssertionError: check-dual-review: not-applicable (0 review verdicts examined ...)
    actual: 20, expected: 0
```

**GREEN** on this branch: `status=green`, `units=2`. The test also asserts that
git DOES quote by default, by running the unquoted-form command itself, so a
future git that stopped quoting would fail the test rather than pass it
vacuously. It is test/dual-review-head-anchor.test.ts:431.

Transliteration note for that block only: the reporter's U+2716 is rendered `X`,
1 occurrence.

### M2: doctor aborts, and the run is what proves it

The staging chmods `tasks/` to 000 and runs the SHIPPED CLI as an unprivileged
uid, because root bypasses directory permissions here. That was measured rather
than assumed: as uid 0, `readdirSync` of a mode-000 directory returns its
entries, so a test that only chmodded would be green whatever the code did.

**RED, the same test file run against d653022:**

```
AssertionError [ERR_ASSERTION]: exit=1 stdout= stderr=tiphys: EACCES: permission denied,
scandir '/tmp/tiphys-p2-doctor-5n14Jh/fleet/tasks'
  expected: /CHECK worktrees FAIL the worktree pool could not be listed/
  actual:   ''
```

`stdout` is EMPTY. Not one check reported. **GREEN, on this branch:** the run
prints `CHECK worktrees FAIL the worktree pool could not be listed ...` and then
`CHECK kernel-artifacts ...`, which is the half that distinguishes a caught
throw from an uncaught one. The test asserts both, and asserts a control run
first so that "the run never reached this check" cannot pass as a fix. It is
test/doctor.test.ts:2321.

### M3: the vocabulary row, red by construction

**RED**, this round's test with the row removed from the document and nothing
else changed:

```
AssertionError [ERR_ASSERTION]: schemas/README.md declares 15 keyword(s) and
AUTHORING_VOCABULARY holds 16
  actual: [ '$ref', 'additionalProperties', 'const', 'contains', 'enum', 'if', 'items',
            'minItems', 'minLength', 'oneOf', 'pattern', 'properties', 'required', 'then',
            'type' ]
```

**GREEN** with the row at schemas/README.md:49. The test parses the document's
keyword column rather than re-typing the list, and it carries a green control
over the ANNOTATIONS sentence in the same document, which already agreed, so a
parser returning nothing could not pass the comparison by accident.

### M4: the interpreter traversal, red outside the temp root

The red arm needs a repository that is NOT under the OS temp root, and that was
measured rather than reasoned: with the repository under `/tmp/claude-0` the
BASE helper passes too, because granting the repository walks through
`/tmp/claude-0` on its way and opens the interpreter's parent as a side effect.
Two runs of the base arm from `/tmp/claude-0/.../basewt`, `/tmp/claude-0` reset
to 700 before each, both passed and both left it at 755.
Both arms were staged at `/home/t029probe/`, interpreter
`/tmp/claude-0/n26/bin/node`, `/tmp/claude-0` reset to mode 700 before each:

```
--- T-029 ARM: base (repo at /home/t029probe/base)
X a precondition command exiting nonzero is error, not a skip, ...
  AssertionError: unreadable: the CLI could not be spawned unprivileged:
  Error: spawnSync /tmp/claude-0/n26/bin/node EACCES
    /tmp/claude-0 after: 700

--- T-029 ARM: fixed (repo at /home/t029probe/fixed)
OK a precondition command exiting nonzero is error, not a skip, ... (1197.372865ms)
    /tmp/claude-0 after: 755
```

Transliteration note for that block only: the reporter's U+2716 is rendered `X`,
1 occurrence, and U+2714 is rendered `OK`, 1 occurrence. Nothing else in it was
changed.

## 4b. A STORED WITNESS WENT STALE, and it was found by derivation rather than by the gate

Changing a line that a stored `witness/*.json` mutation names by its exact text
makes that mutation unappliable. The gate would have reported it, and the cheaper
order is to look first, so every stored mutation was checked against the tree
before the gate ran:

```
node --input-type=module -e '
import {readdirSync, readFileSync, existsSync} from "node:fs";
let bad=0, checked=0;
for (const f of readdirSync("witness").filter(n=>n.endsWith(".json"))) {
  let spec; try{ spec=JSON.parse(readFileSync("witness/"+f,"utf8")); }catch(e){ console.log("PARSE",f,String(e)); continue; }
  for (const [i,m] of (spec.dangerousStates??[]).entries()) {
    if (m.kind!=="mutation" || typeof m.file!=="string") continue;
    checked++;
    if (!existsSync(m.file)) { console.log("MISSING FILE", f, i, m.file); bad++; continue; }
    const body=readFileSync(m.file,"utf8");
    if (!body.includes(m.find)) { console.log("STALE FIND", f, "member", i, m.file, JSON.stringify(m.find).slice(0,90)); bad++; }
  }
}
console.log("checked", checked, "stale", bad);
'

STALE FIND merge-preconditions-no-verdict-at-head-is-not-applicable.json member 1
  src/gates/merge-preconditions.ts "    .filter((entry) => String(entry.record[\"head\"] ?? \"\")..."
checked 704 stale 1
```

704 mutations checked, exactly ONE stale, and it is this round's own: member 1 of
that witness mutated the equality filter into `.filter(() => true)`, which was
"select every verdict whatever head it names". The same dangerous state in the
new code is admitting every verdict whatever relation it has, so the member now
mutates the admission condition into `if (true || relation.kind === "same") {`.
The dangerous state is preserved and the text is not; that distinction is the
reason the member was rewritten rather than deleted.

The checker is reproduced above rather than described because a reviewer needs to
be able to re-run it: it is the only thing standing between a text-addressed
mutation and a witness that silently stops witnessing.

**THE REWRITTEN MEMBER WAS THEN APPLIED AND ITS TEST RUN**, because "the
mutation applies again" and "the mutation still reddens the behaviour" are
different facts and only the second is what a witness is for. A copy of this
tree with member 1 applied:

```
member 0 applies: True
member 1 applies: True
mutated member 1
X a head no committed verdict names is not-applicable with an evaluated unmet
  precondition rather than green (404.109014ms)
```

Transliteration note for that block only: the reporter's U+2716 is rendered `X`,
2 occurrences (the failing line is printed twice, once in the run and once in the
failing-tests summary, and only the first is quoted here). The same test on the
unmutated tree passes, which is the run quoted in section 0.

## 5. The worktree arm: RESTATED WITH A REASON, not closed

Round 1's residue 2 says the worktree arm of `check-dual-review` is not
head-anchored by design, so a context that is not a git repository can still go
green over verdicts naming anything. It is not closed here, and the reason is a
measurement rather than a judgment.

Closing it means the unanchored arm stops reporting a status a merge could rely
on. `test/dual-review.test.ts` holds 27 tests and stages NO git repository in
any of them:

```
grep -c 'git(' test/dual-review.test.ts        -> 0
grep -n 'git init\|"init"' test/dual-review.test.ts  -> no match
grep -c '^test(' test/dual-review.test.ts      -> 27
```

So every one of those 27 runs through the worktree arm, and changing that arm's
status is a restaging of the whole file. That is a larger change than any
finding this round was given, it is in a file this round has no other reason to
touch, and restaging 27 tests to accommodate a status change is exactly the
shape that produces a defanged suite. It is refused here on those grounds and
left as the same open residue, with the cost now recorded so the next round does
not have to measure it again.

Two things bound it, and neither is offered as a closure. DR-0012 condition 1
requires the reviews to be COMMITTED, and this arm is reached only when nothing
is. And the arm SAYS what it is in every line it prints, at
scripts/check-dual-review.mjs:619.

## 6. The duplicated classifier: CONSOLIDATED, and the pair named in the dispatch is not the pair that duplicated

The dispatch named `classifyTaskMeta` (src/task.ts) and
`classifyPathEntry`/`readRegularPathIfPresent` (src/fleet.ts). Read rather than
assumed, `classifyTaskMeta` at src/task.ts:436 classifies a TASK RECORD (absent,
unparsable, malformed) and is not a path classifier at all. The real duplication
is `classifyEntry`/`readRegularFileIfPresent`/`refuseOpenForWrite` in
src/task.ts against `classifyPathEntry`/`readRegularPathIfPresent`/
`refuseOpenPathForWrite` in src/fleet.ts: identical union types, identical
bodies, identical sentences.

Round 1's reason for the copy was right and is not the reason it had to stay.
The import edges are printed in section 7's last block rather than asserted here:
src/task.ts imports `Fleet` from src/fleet.ts and `leaseStatus` from src/lock.ts,
src/lock.ts imports `readRegularPathIfPresent` from src/fleet.ts, and src/fleet.ts
imports no local module at all. So importing UPWARD from lock or exclusion into
task would make the cycle task -> lock -> task. The direction that removes the
copy is DOWNWARD: src/fleet.ts imports no local module at all, and src/task.ts
already imported `Fleet` from it. The chain is task -> fleet and lock -> fleet,
and nothing points back.

So the bodies in src/task.ts are gone and the names are bound to src/fleet.ts's
at src/task.ts:108. The 88 call sites in 31 files are untouched, because the
names were the whole cost of the rewrite and none of the reason the duplication
was a defect: what mattered was two bodies that could drift, and there is now
one body. The build is the check that the binding is complete; a bare
`export ... from` would have published without binding and left this module's own
call sites unresolved, which is why they are imported under the old names rather
than re-exported straight through.

The `witness/*.json` mutants that mention `classifyEntry` were checked before
this was done: all five mutate CALL SITES in src/commands/doctor.ts,
src/checks.ts and src/spawn.ts, never the definition. Section 4b's walk of all
704 stored mutations is the mechanical form of that check and it reports one
stale member, which is the merge-preconditions one and not any of these five.

## 7. The derivation command and its full output

```
sh derive.sh          # from the repository root, output verbatim below
```

The script, in full:

```
#!/bin/sh
# THE MECHANISMS, and the derivation for each. Run from the repository root.
#
# M1  An ADMISSION PREDICATE that compares a DECLARED identifier to a RUN
#     identifier with equality, where the flow structurally guarantees they
#     differ. The guard then cannot pass, which is the cannot-go-red rule at
#     the other pole.
# M2  A REPORTING CONSUMER that does not catch a throw its sibling consumer
#     catches, so one path degrades and the other aborts.
# M3  Two hand-written lists, one enforced and one rendered, with nothing
#     comparing them.
set -u

echo "### D1a  every gate that is handed a RUN identifier by the registry"
echo "###      (these are the gates that CAN compare declared to run)"
awk '/^  - id:/{id=$3} /parameters:/{print FILENAME": "id" "$0}' gate-registry.yaml

echo
echo "### D1b  every place in src/ scripts/ bin/ that PARSES a run identifier"
grep -rn -- '"--head"\|"--base"\|"--phase"' src bin scripts | sort

echo
echo "### D1c  every equality/inequality test against a resolved commit or a"
echo "###      declared head, in the modules that admit or exclude evidence"
grep -rnE '(auditedHead|requestedHead|headKey|refSha|declared|\.sha)\b[^=!<>]*(===|!==)' src bin scripts | sort

echo
echo "### D1d  every call site of the two functions that place evidence against"
echo "###      the commit under audit"
grep -rn 'partitionByAuditedHead\|resolveAuditedHead\|relateDeclaredHead\|headGroupFor' src bin scripts test | sort

echo
echo "### D2a  every caller of poolList, the function round 1 converted from"
echo "###      swallow to throw"
grep -rn 'poolList' src bin scripts | sort

echo
echo "### D2b  every exported doctor CHECK, so a check that can abort the run"
echo "###      is visible rather than inferred"
grep -n '^export function check' src/commands/doctor.ts

echo
echo "### D2c  every unguarded directory listing reachable from a doctor check"
grep -n 'readdirSync\|readdir(' src/commands/doctor.ts src/pool.ts | sort

echo
echo "### D3a  every shipped list constant that a document claims to render"
grep -rn 'AUTHORING_VOCABULARY\|ANNOTATION_KEYS' src schemas test | sort

echo
echo "### D3b  every README under a SHIPPED tree, which is where a rendered"
echo "###      list can drift from the constant that decides"
git ls-files '*/README.md' 'README.md'
```

Its output, in full, taken at this branch's final tree:

```
### D1a  every gate that is handed a RUN identifier by the registry
###      (these are the gates that CAN compare declared to run)
gate-registry.yaml: suite     parameters: [base]
gate-registry.yaml: scope     parameters: [base, head]
gate-registry.yaml: red-witness     parameters: [base, head]
gate-registry.yaml: check-dual-review       `parameters: [base, head]` since M2 and the runner appends the flags to
gate-registry.yaml: check-dual-review     parameters: [head]
gate-registry.yaml: gate-classes     parameters: [phase]
gate-registry.yaml: merge-preconditions     parameters: [head, phase]

### D1b  every place in src/ scripts/ bin/ that PARSES a run identifier
scripts/check-dual-review.mjs:149:    if (argument === "--head") {
scripts/m2-exit-test.sh:1157:           "--only", "red-witness", "--base", `${sha}^`, "--head", sha, "--phase", "m2-p2"],
scripts/m2-exit-test.sh:1216:     "--base", base, "--head", head, "--phase", "m2-p4"],
scripts/m2-exit-test.sh:1255:     "--base", base, "--head", head],
src/commands/brief.ts:315:    ["--phase", "phase"],
src/commands/gates.ts:110:    } else if (flag === "--base") {
src/commands/gates.ts:112:    } else if (flag === "--head") {
src/commands/gates.ts:76:  "--base",
src/commands/gates.ts:77:  "--head",
src/commands/gates.ts:78:  "--phase",
src/commands/spawn.ts:133:    } else if (flag === "--phase" && value !== undefined) {
src/gates/citations.ts:1465:const VALUE_FLAGS = ["--result", "--evidence", "--base", "--head"];
src/gates/citations.ts:1482:    } else if (flag === "--base") {
src/gates/gate-classes.ts:158:  "--phase",
src/gates/merge-preconditions.ts:138:  "--head",
src/gates/merge-preconditions.ts:139:  "--phase",
src/gates/red-witness.ts:88:    ["--base", "base"],
src/gates/red-witness.ts:89:    ["--head", "head"],
src/gates/red-witness.ts:91:    ["--phase", "phase"],
src/gates/release.ts:930:  const names = ["--result", "--evidence", "--base", "--phase", "--head"];
src/gates/release.ts:941:    } else if (flag === "--base") {
src/gates/release.ts:943:    } else if (flag === "--phase") {
src/gates/scope.ts:158:  "--base",
src/gates/scope.ts:159:  "--head",
src/gates/scope.ts:160:  "--phase",
src/gates/suite.ts:573:        "--base",
src/gates/suite.ts:574:        "--head",
src/gates/suite.ts:590:    } else if (flag === "--base") {
src/gates/suite.ts:592:    } else if (flag === "--head") {

### D1c  every equality/inequality test against a resolved commit or a
###      declared head, in the modules that admit or exclude evidence
scripts/check-dual-review.mjs:346:    familyReading.kind === "declared" && familyReading.families.length === 1
scripts/check-retirement-inventory.mjs:652:    if (declared === undefined || declared === null || typeof declared !== "object" || !nonEmptyString(declared.read)) {
scripts/check-retirement-inventory.mjs:668:  if (declared === undefined || declared === null || typeof declared !== "object") {
scripts/license-gate.mjs:233:      license: declared === "" ? undefined : declared,
src/adapters/load.ts:481:  if (declared.specifier === undefined) {
src/checklists.ts:364:        `${request.checklist.path} declares no framing ${request.framingId}; it declares ${declared.length === 0 ? "none" : declared.join(", ")}`,
src/checks.ts:4248:  if (declared === auditedHead) {
src/commands/mode.ts:142:      `${read.path} declares no mode ${wanted}; it declares ${declared.length === 0 ? "none" : declared.join(", ")}`,
src/exclusion.ts:241:  if (declared === undefined || declared === false) {
src/exclusion.ts:245:    declared === true ? {} : (declared as Record<string, unknown>);
src/exclusion.ts:246:  if (declared !== true && (raw === null || typeof raw !== "object" || Array.isArray(raw))) {
src/exclusion.ts:512:  if (after.kind === "present" && after.sha !== expectedSha && after.sha !== sha) {
src/exclusion.ts:515:  if (after.kind === "present" && after.sha === sha) {
src/exclusion.ts:536:    typeof value.sha !== "string" ||
src/exclusion.ts:579:  if (previous !== undefined && previous.sha === sha && previous.counter === counter) {
src/gates/release.ts:1032:  if (declared === undefined) {
src/gates/release.ts:1041:  if (declared.mode === "none") {
src/gates/run.ts:1775:    declared.length === 0
src/gates/scope.ts:801:    if (resolvedHeadResult.sha !== actualHeadResult.sha) {
src/pool.ts:1220:    if (facts.branchTip.sha !== baseSha) {
src/witness/run.ts:1071:  if (declared.kind === "read") {
src/witness/run.ts:1620:    if (baseline.sha !== undefined) {
src/witness/run.ts:743:    if (baseline.sha === undefined) {

### D1d  every call site of the two functions that place evidence against
###      the commit under audit
scripts/check-dual-review.mjs:210: * all, is EXCLUDED and NAMED. See `resolveAuditedHead` in `src/checks.ts` for
scripts/check-dual-review.mjs:233:  const anchor = resolveAuditedHead(directory, requestedHead, loaded.source);
scripts/check-dual-review.mjs:244:      ? partitionByAuditedHead(directory, loaded.verdicts, anchor.head)
scripts/check-dual-review.mjs:79:  resolveAuditedHead,
scripts/check-dual-review.mjs:80:  partitionByAuditedHead,
src/checks.ts:3156: * `headGroupFor` turns this set into the reviews of one `(phase, head)`, and
src/checks.ts:3178: * as `headGroupFor` already does for a sibling with no usable head.
src/checks.ts:3947:function headGroupFor(
src/checks.ts:4000: * `headGroupFor` above groups by the head THE VERDICT DOCUMENTS THEMSELVES
src/checks.ts:4072:export function resolveAuditedHead(
src/checks.ts:4109: * `partitionByAuditedHead` compared the declared head to the audited one with
src/checks.ts:4243:export function relateDeclaredHead(
src/checks.ts:4348: * `relateDeclaredHead` for why the second is safe and for what it deliberately
src/checks.ts:4355: * `headGroupFor`. A reader is owed the fact that the corpus holds two
src/checks.ts:4358:export function partitionByAuditedHead(
src/checks.ts:4375:    const relation = relateDeclaredHead(contextDirectory, key.value, auditedHead);
src/checks.ts:5257:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/checks.ts:5279:       CARRIED IN, NOT DROPPED. See `loadCommittedVerdicts` and `headGroupFor`:
src/checks.ts:5522:    const grouped = headGroupFor(committed.verdicts, phaseKey, headKey);
src/gates/merge-preconditions.ts:14:  relateDeclaredHead,
src/gates/merge-preconditions.ts:973:     passes and touches git not at all (`relateDeclaredHead` answers that case
src/gates/merge-preconditions.ts:981:    const relation = relateDeclaredHead(contextDirectory, declared, head);
test/verdict-head.test.ts:266:    !oldChecks.includes("headGroupFor"),

### D2a  every caller of poolList, the function round 1 converted from
###      swallow to throw
src/commands/doctor.ts:10:import { poolList, resolveNetworkTimeoutMs } from "../pool.ts";
src/commands/doctor.ts:1482:     round 2). `poolList` THROWS on a `tasks/` it cannot list, which is correct
src/commands/doctor.ts:1499:    entries = poolList(fleet);
src/commands/next.ts:333:  let entries: ReturnType<typeof poolList>;
src/commands/next.ts:335:    entries = poolList(fleet);
src/commands/next.ts:8:import { TASK_ID_PATTERN, poolList } from "../pool.ts";
src/commands/pool.ts:112:      for (const entry of poolList(fleet)) {
src/commands/pool.ts:3:import { poolCreate, poolDestroy, poolList } from "../pool.ts";
src/pool.ts:770:export function poolList(fleet: Fleet): PoolListEntry[] {

### D2b  every exported doctor CHECK, so a check that can abort the run
###      is visible rather than inferred
1077:export function checkKernelArtifacts(
1194:export function checkTasks(root: string): CheckResult {
1330:export function checkBranches(root: string): CheckResult {
1468:export function checkWorktrees(root: string): CheckResult {
1572:export function checkSharedLock(root: string): CheckResult {

### D2c  every unguarded directory listing reachable from a doctor check
src/commands/doctor.ts:1093:      entries = readdirSync(path);
src/commands/doctor.ts:1198:    entries = readdirSync(tasksDir, { withFileTypes: true });
src/commands/doctor.ts:2:import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
src/commands/doctor.ts:738:    names = readdirSync(charterDir).sort();
src/pool.ts:4:  readdirSync,
src/pool.ts:773:  const names = readdirSync(fleet.worktreesDir)
src/pool.ts:788:     SAME channel the `readdirSync(fleet.worktreesDir)` above it already
src/pool.ts:791:  const taskIds = readdirSync(fleet.tasksDir).sort();

### D3a  every shipped list constant that a document claims to render
src/checks.ts:1871: * of `AUTHORING_VOCABULARY` (src/validate.ts:111). No other permitted keyword
src/gates/validate.ts:220:    if (VALIDATION_KEYWORDS.includes(key) || ANNOTATION_KEYS.includes(key)) {
src/gates/validate.ts:69:export const ANNOTATION_KEYS: readonly string[] = [
src/validate.ts:144:export const AUTHORING_VOCABULARY: readonly string[] = [
src/validate.ts:164:export const ANNOTATION_KEYS: readonly string[] = [
src/validate.ts:36: * `AUTHORING_VOCABULARY` in BOTH directions: `$ref`, `items`, `properties` and
test/schema-suite.test.ts:256:  for (const keyword of validateModule.AUTHORING_VOCABULARY) {
test/schema-suite.test.ts:67:  AUTHORING_VOCABULARY: readonly string[];
test/schemas.test.ts:268:  const missing = validateModule.AUTHORING_VOCABULARY.filter(
test/schemas.test.ts:305: * document and `AUTHORING_VOCABULARY` were two hand-written lists with nothing
test/schemas.test.ts:343:     keyword, and `AUTHORING_VOCABULARY` is what the validator enforces. Nothing
test/schemas.test.ts:356:    [...validateModule.AUTHORING_VOCABULARY].sort(),
test/schemas.test.ts:357:    `schemas/README.md declares ${String(declared.length)} keyword(s) and AUTHORING_VOCABULARY holds ` +
test/schemas.test.ts:358:      `${String(validateModule.AUTHORING_VOCABULARY.length)}`,
test/schemas.test.ts:35:  AUTHORING_VOCABULARY: readonly string[];
test/schemas.test.ts:366:     same document already agrees with `ANNOTATION_KEYS`, and it is asserted
test/schemas.test.ts:36:  ANNOTATION_KEYS: readonly string[];
test/schemas.test.ts:376:    [...validateModule.ANNOTATION_KEYS].sort(),
test/validate.test.ts:61:  AUTHORING_VOCABULARY: readonly string[];

### D3b  every README under a SHIPPED tree, which is where a rendered
###      list can drift from the constant that decides
delivery/evidence/m2-exit-test/README.md
delivery/plan/phase-declarations/README.md
roles/README.md
sandbox/README.md
schemas/README.md
tuition/README.md
witness/fixtures/dual-review/README.md
```

## 8. The claim grep

**THE LISTING BELOW WAS TAKEN WITH ITSELF ABSENT FROM THE DOCUMENT, and that is
said first because it is the one thing a reader of a self-referential capture has
to know.** Pasting the listing back in makes every quoted hit a hit again, so the
numbers a reviewer measures on the FINAL text are larger than the ones the
listing was taken at. Both are given.

The binding line-based form, run with section 8 removed:

```
grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/head-anchor-r2.md
92:The finding is "green forever once fed" becoming "never green", which is the
104:### M2. A REPORTING CONSUMER THAT DOES NOT CATCH WHAT ITS SIBLING CATCHES
108:src/commands/next.ts:335 catches it and reports into `unknown`. Doctor did not,
154:could never be met either, so every real run of it reported not-applicable and
238:10. **M4's fix is witnessed only on this container.** The red arm needs a
402:It is fail-CLOSED, so it admitted nothing it should not. It is fixed anyway
444:first so that "the run never reached this check" cannot pass as a fix. It is
467:The red arm needs a repository that is NOT under the OS temp root, and that was
599:src/checks.ts and src/spawn.ts, never the definition. Section 4b's walk of all
620:#     catches, so one path degrades and the other aborts.
```

Ten matching lines, and every one of them is dispositioned in the table below.

**ON THE FINAL TEXT**, the document a reviewer will actually run the command
against, with this section present:

```
grep -cEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/head-anchor-r2.md          ->  30   (matching LINES)
grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' delivery/work-history/head-anchor-r2.md | wc -l  ->  70   (OCCURRENCES)
tr '\n' ' ' < delivery/work-history/head-anchor-r2.md | grep -oEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' | wc -l  ->  70
```

**THE TWO FORMS ARE MADE COMPARABLE BEFORE BEING COMPARED**, which is the point
CLAUDE.md's own table makes by counting OCCURRENCES on both sides: the binding
command counts LINES and the wrap-insensitive one counts OCCURRENCES, and
comparing those two directly would read every multi-hit line as a hidden hit.
70 against 70, so no hit phrase straddles a wrap in this document.

### What settles each hit

| line | the phrase | what settles it |
|---|---|---|
| the M1 mechanism (settled voluntarily; the grep no longer hits it) | "in every flow that commits its reviews" | the orchestrator's measurement at 5867a918cda809f7c5d4bc366fc7940458c140c0 quoted in section 1, and member 4 of the probe in section 4, whose RED column is that exact shape reported not-applicable |
| the M1 finding | "never green" | the RED capture in section 4: all FOUR members, the green control included, report `status=not-applicable units=0` at d653022 |
| M2's heading and its body | "DOES NOT CATCH", "catches it" | D2a in section 7 lists all three callers of `poolList`; src/commands/next.ts:335 is the catching one and its `catch` is visible in the file |
| the second call site | "could never be met either" | the mutant witness in section 4: with the equality selection restored the gate reports `not-applicable`, units 0, and ZERO rows |
| the fifth member | "it admitted nothing it should not" | the direction is established by the rule itself: the quoted spelling fails the `delivery/` prefix test, which can only move a verdict OUT of the admitted set; the RED capture in section 4 is that move happening |
| residue 10 | "needs a" | the two-arm capture in section 4, plus the two base-arm runs from under `/tmp/claude-0` that pass, which is why the probe was staged at `/home/t029probe/` |
| the doctor control | "cannot pass as a fix" | the test asserts a CONTROL run first, which reaches `CHECK worktrees` and `CHECK kernel-artifacts`, before it chmods; test/doctor.test.ts:2321 |
| the classifier consolidation | "never the definition" | section 4b's walk of all 704 stored mutations reports one stale member and it is the merge-preconditions one, not any of these five; the 1387-pass suite is the second check |
| derive.sh's own comment | "catches" | quoted script text, not a claim by this document |

## 9. Bytes and citations

```
node scripts/check-authored-bytes.mjs
(no output)
exit=0
```

No em dashes were used. Every citation in this document is `path.ext:LINE`
outside backticks, and every one of them resolves in THIS tree, because the code
and its evidence are on one branch and land together. Paths named without a line
number are quoted, deliberately, and buy nothing toward the substantive-citation
floor.

## 10. The gate run

The bundle, run locally on the floor-satisfying toolchain against this branch's
code head eac7012b5fec80dc094eef47ea330b59ac947261:

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --evidence <scratch>/evidence3 --base origin/main --head HEAD

gates: 2 registry gate(s) declared verified-by clean-room-checklist and NOT executed by this runner: unit-tests-for-changed-service-methods (probe unit-tests-for-changed-service-methods), fixtures-for-changed-component-states (probe fixtures-for-changed-component-states)
gates: registry gate-registry.yaml mode full
gates: declared 19 applicable 11 verdict 10 green 10 red 0 not-applicable 5 error 4 vacuous 0
gates: manifest-self-check: green: validated 8 schema document(s) against the closed keyword set ... and gates.manifest.json against gate-manifest.schema.json
gates: coverage: green: 115 inventory id(s) checked; per-kind: decision 6, milestone 98, phase 11; per-milestone: M1 11, M2 16, M3 74, M4 5, M5 3, decision 6
gates: credential-scrub: green: no pull-request-capable credential resolvable from any of the 7 probed sources
gates: credential-token: not-applicable: precondition implementer-token-present-owner-action-a-3 evaluated and unmet
gates: suite: green: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 1387 test(s) from 68 file(s) (pass 1387, fail 0, skipped 0, todo 0, did-not-run 0); discovered 68 file(s) walking test for .test.ts; 1262 behavior(s) resolve; merge base ad2428b76ef6
gates: citations: not-applicable: precondition citations-diff-touches-documents evaluated and unmet: no changed path under delivery/plan/, delivery/verification/, delivery/decisions/, delivery/tuition/, delivery/requirements/, delivery/STATE.md
gates: scope: error: gate scope requires --phase, which was not supplied
gates: deploy: not-applicable: precondition deploy-release-verification-declared ... evaluated and unmet: release-verification.json does not exist
gates: migrations: not-applicable: precondition migrations-release-verification-declared ... evaluated and unmet: release-verification.json does not exist
gates: clause-map: green: 74 rows checked, 0 pending a phase not yet in force
gates: red-witness: error: 151 witness(es) evaluated (10 own, 141 stored re-evaluated in 1853028ms); witness merge-preconditions-unreachable-api-is-error: error: member 1 (mutation of src/gates/merge-preconditions.ts): fetch of origin failed in the scratch clone: git fetch --quiet origin exited 128: error: RPC failed; curl 56 GnuTLS recv error (-110): The TLS connection was non-properly terminated.; error: 8229 bytes of body are still expected; fetch-pack: unexpected disconnect while reading sideband packet; fatal: early EOF; fatal: fetch-pack: invalid index-pack output
gates: agent-rules-drift: green: CLAUDE.md's gate block matches gate-registry.yaml row for row (3 preflight step(s), 21 gate(s))
gates: brief-drift: green: roles/implementer.md's full gate block matches gate-registry.yaml row for row (21 row(s) compared)
gates: check-agents-references: green: 22 references resolved to a path that the package publishes, 22 of them also to an anchor inside it
gates: check-dual-review: not-applicable: precondition dual-review-verdicts-present evaluated and unmet: node scripts/check-dual-review.mjs --precondition . exited 1
gates: license: green: 12 production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing
gates: typecheck: green: tsc -b ... exited 0 and reported 450 distinct file(s); the unit count is those printed paths, not a constant
gates: gate-classes: error: gate gate-classes requires --phase, which was not supplied
gates: merge-preconditions: error: gate merge-preconditions requires --phase, which was not supplied
gates: 4 gate(s) reported error: scope, red-witness, gate-classes, merge-preconditions
GATES_EXIT=21
```

**ZERO RED.** Four gates report `error` and each is accounted for rather than
waved past.

**THREE OF THE FOUR ARE THE BRANCH SHAPE, not this round's code.** `scope`,
`gate-classes` and `merge-preconditions` all say `requires --phase, which was not
supplied`. This is not a phase branch: CLAUDE.md's branch-naming rule reserves
`^claude/m[0-9]+-p[0-9]+-` for a phase's own implementation branch, so
`claude/sweep-fix-head-anchor-r2` has no phase id and there is no
`delivery/plan/phase-declarations/<id>.json` to read. A local invocation with no
`--phase` therefore cannot evaluate them, and the same three errored on round 1's
branch for the same reason.

**THE FOURTH IS A NETWORK FAILURE INSIDE ONE WITNESS EVALUATION, NOT A FINDING,
AND SAYING SO IS A CLAIM THAT NEEDED CHECKING.** 151 witnesses were evaluated,
10 of them this round's own and 141 stored ones re-evaluated because a member of
each touches a file this round changed. ONE member, of
`merge-preconditions-unreachable-api-is-error`, could not be evaluated because
the harness's scratch clone could not fetch from `origin`: `curl 56 GnuTLS recv
error (-110)`, a transport failure at the agent proxy. No witness reported "no
longer guards its behavior", and no changed source file reported having no
witness.

**IT WAS RE-RUN, AND THE RE-RUN IS WHAT SETTLES IT.** `--only red-witness`
against the same head, 31 minutes, 151 evaluations again:

```
node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
  --only red-witness --evidence <scratch>/evidence4 --base origin/main --head HEAD

gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: red-witness: error: 151 witness(es) evaluated (10 own, 141 stored re-evaluated in 1832958ms); witness implementer-brief-gate-list-drift: error: member 1 (mutation of scripts/check-brief-drift.mjs): fetch of origin failed in the scratch clone: git fetch --quiet origin exited 128: error: RPC failed; curl 56 GnuTLS recv error (-110): The TLS connection was non-properly terminated.; fatal: expected 'acknowledgments'
GATES_EXIT=21
```

**THE FAILING WITNESS MOVED AND THE SIGNATURE DID NOT.** Run A failed on
`merge-preconditions-unreachable-api-is-error`, run B on
`implementer-brief-gate-list-drift`, and the two have nothing in common except
that the harness's scratch clone had to fetch from `origin`. A defect in a
witness does not move between runs; a flaky transport does. Read from the two
`witness-records.json` files rather than from the summary lines:

```
A evaluated 151 green 150      B evaluated 151 green 150
same witness set: True
union of the two green sets covers all 151: True
A's failing witness is green in B: True
B's failing witness is green in A: True
uncoveredSources: []  (both runs)
```

So EVERY one of the 151 witnesses was evaluated GREEN in at least one of the two
runs, no witness reported "no longer guards its behavior" in either, and no
changed source file went uncovered. **What is NOT claimed: this gate did not
reach a green verdict locally, and nothing here makes it do so.** Its own rule is
that could-not-determine is `error`, and one member could not be determined in
each run. The CI runner fetches over a different network path and is the place
that verdict has to be taken.

**AND THE HARNESS HAS NO RETRY ON THAT FETCH, which is a real residue rather
than an excuse.** `git fetch` in the scratch clone fails the whole gate on one
transport hiccup, so on this container the gate is non-deterministic by
construction for a reason that has nothing to do with any witness. It is
recorded here for the orchestrator; it is outside this round's findings and its
files.


**WHAT THIS RUN IS EVIDENCE ABOUT, stated in T-009's form.** It is the `full`
mode of the registry bundle, run from a local clone at code head
eac7012b5fec80dc094eef47ea330b59ac947261 with `--base origin/main`. It is NOT
evidence about either CI event, and the pull-request arm supplies `--phase` and
would run the three gates that error here. The commits after eac7012 touch
`delivery/work-history/head-anchor-r2.md` and nothing else, so the diff every
gate above reasons over is unchanged by them; `citations` does not read
`delivery/work-history/` (its own precondition names the trees it does read, and
that tree is not among them) and `red-witness` selects witnesses by the CHANGED
SOURCE FILES, which are the same set.

