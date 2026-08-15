# Clean-room review, M3-P12, criteria lens

- reviewer: clean-room criteria lens (independent of the adversarial hazard
  lens running in parallel)
- branch reviewed: `claude/m3-p12-tag-and-github-release`
- sha reviewed: ca9ae71c0b50a0b5f80f26e41b5c243e918c81ae
- PR: #144
- lens: CRITERIA. Does the branch establish, with independently reproduced
  evidence, each of the nine acceptance criteria in
  delivery/plan/m3-p12-phase-spec.md:22.

This file is the beacon required by CLAUDE.md:443. Created before independent
verification work started; appended as work proceeds.

## Method

All commands below were run in a fresh worktree checked out at the reviewed
sha, never in the implementer's own tree, with the scratch node v26.6.0
toolchain first on PATH. Every mutation used to reproduce a witness member was
applied by hand with a Python script writing directly to
`.github/workflows/release.yml`, run against the real test suite, then the
original file was restored and `git status --short` was checked clean before
the next probe. This is deliberately independent of `witness/*.json` and the
`red-witness` gate runner: the goal is to establish these facts without
trusting the implementer's harness, only the test file's own assertions and a
plain YAML parse.

## Criterion 1: two jobs, exact permission sets (MET)

Independent YAML parse, not the test's own parser:

```
$ node -e '
const fs = require("fs");
const yaml = require("./node_modules/yaml");
const doc = yaml.parse(fs.readFileSync(".github/workflows/release.yml", "utf8"));
console.log("jobs:", Object.keys(doc.jobs));
console.log("release perms:", JSON.stringify(doc.jobs.release.permissions));
console.log("tag perms:", JSON.stringify(doc.jobs.tag.permissions));
console.log("id-token in tag?", "id-token" in doc.jobs.tag.permissions);
'
jobs: [ 'release', 'tag' ]
release perms: {"contents":"read","id-token":"write"}
tag perms: {"contents":"write"}
id-token in tag? false
```

Matches the work history's claim exactly: two jobs, release holds
`contents: read` + `id-token: write`, tag holds `contents: write` only, and
`id-token` is genuinely absent as a key (not `id-token: none`, which the
normaliser at test/license-gate.test.ts:1662 would also have to reject as
holding `write`). The test's own assertion at
test/license-gate.test.ts:1838 makes the same absence check
(`"id-token" in writer.scopes === false`), and I ran it green at baseline
(see the batch run under criterion 3-4 below).

## Criterion 2: the condition is extracted and evaluated, not pattern-matched (MET)

Read test/license-gate.test.ts:1756-1793: `EXPRESSION_REFERENCE` and
`EXPRESSION_EQUALITY` are anchored regexes that capture a dotted path and an
optional single-quoted literal; `compileExpression` returns a real closure
over `lookupContext`, which walks the path against an arbitrary context object
at call time (test/license-gate.test.ts:1760). This is a real compile step,
not a string comparison: the returned function is later called with seven
different `context` shapes (test/license-gate.test.ts:1888-1909) and the
producer's own output expression is compiled and called separately
(test/license-gate.test.ts:1923-1935), then the two are composed end to end
(test/license-gate.test.ts:1940-1949), so the assertion is genuinely "does a
rehearsal fail to reach a write" rather than two independent assertions that
happen to both be true.

I did not need to mutate anything to confirm this is evaluation rather than
matching: an evaluator that merely grepped for the output's name would not be
able to fail differently on `steps.decide.outputs.publish` (bare reference,
truthy on any non-empty string including `no`) vs
`needs.release.outputs.publish == 'yes'` (strict equality); the test's own row
table names this distinction explicitly and it only makes sense under
evaluation. I independently confirm this claim is correct reasoning, not
merely asserted.

## Criterion 3: red witness, two structurally different members, neither a permissions line (MET)

Reproduced both members by hand, restoring the file and checking
`git status --short` clean after each:

Member 0, `if:` deleted from the tag job:

```
$ python3 -c "... replace '    needs: release\n    if: ...\n' with '    needs: release\n' ..."
$ node --test --test-name-pattern "gated twice" test/license-gate.test.ts
AssertionError [ERR_ASSERTION]: release.yml job tag if:: there is no expression here at all, found undefined
```

Member 1, the release job's output pinned to the literal `'yes'`:

```
$ python3 -c "... replace '      publish: \${{ steps.decide.outputs.publish }}\n' with \"      publish: 'yes'\n\" ..."
$ node --test --test-name-pattern "gated twice" test/license-gate.test.ts
AssertionError [ERR_ASSERTION]: the release job's publish output: yes is outside the two shapes this evaluator accepts (a bare reference, or a reference compared to a single-quoted literal). ...
```

Both messages match the work history's table verbatim. Member 0 attacks the
CONSUMER (the tag job's own `if:`), member 1 the PRODUCER (the release job's
output declaration); neither touches a `permissions:` line, so this witness is
disjoint from criterion 4's class as required. Both redden the SAME named
test, which is correct: they are two members of one witness for one
behaviour, not two different behaviours.

One caveat worth recording rather than treating as a defect: member 1's
failure is a REFUSAL (the evaluator's grammar rejects a bare non-`${{ }}`
literal outright), not a semantic demonstration that the pinned value would
actually let the tag job run on a rehearsal. That is a deliberate design
choice stated in the test's own comment (test/license-gate.test.ts:1741-1749,
"an evaluator that quietly returned undefined ... would be green over every
one"), and it is a defensible one: it makes any producer expression outside
the two allowed shapes a hard failure rather than something to reason about
case by case. It does mean the specific mechanism named in the work history's
table ("the release job's output pinned to the literal 'yes'" reddening
because the shape is disallowed) is accurate, but a reader should not
mistake the failure for "the composed condition was run end-to-end against
the mutant and returned true" -- it was not; the evaluator refused to compile
the mutant at all. This is not a finding against the phase (the design is
sound and stated), just a precision note for whoever reads the table next.

## Criterion 4: id-token added to the tag job reddens a named test (MET)

Member 0, `id-token: write` added to the tag job's permissions map:

```
$ node --test --test-name-pattern "exactly one job in any workflow declares a write grant" test/license-gate.test.ts
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  [ 'contents', + 'id-token' ]  vs  [ 'contents' ]
```

Member 1, the tag job's permissions map replaced by the `write-all` shorthand:

```
AssertionError [ERR_ASSERTION]: a shorthand grant is not a minimal grant; write-all carries id-token with it
```

Both reproduced independently and both match the work history. The shorthand
member is real coverage, not decoration: `normalizeGrant`
(test/license-gate.test.ts:1662) explicitly treats `write-all` and `read-all`
as the only understood shorthands and fails loudly on any other string, so a
scan that silently treated an unrecognised shorthand as "no permissions" is
foreclosed rather than merely untested.

## Criterion 5: annotated, named v<version>, at the exact commit (MET)

The claim under review is specific: the lab has two commits and the step is
told to tag the FIRST, so a step that (wrongly) tagged `HEAD` would be
visible. Read test/license-gate.test.ts:1996-2021 (`makeTagLab`): it creates
commit 1 (`target`), then a second commit (`head`), asserts
`target !== head`, and the step under test is invoked with `SHA: lab.target`,
never `lab.head`.

Reproduced the vacuous-witness risk directly by mutating the step to tag
`HEAD` instead of `"${SHA}"`:

```
$ python3 -c "... replace the tag -a ... \"\${SHA}\" line's trailing \"\${SHA}\" with HEAD ..."
$ node --test --test-name-pattern "the tagging command, executed against a scratch repository" test/license-gate.test.ts
AssertionError [ERR_ASSERTION]: the tag points somewhere other than the commit the workflow ran from
  + '24e746ffbea93e05e34bcd75b200bd3c95dd6c60'   (actual, = HEAD)
  - 'd6e0369a8a3dce551025e2bc3fe90863c2d45a05'   (expected, = target)
```

This directly confirms the claim: because the lab's HEAD and target are
different commits, a step that silently substituted HEAD for the given SHA is
caught. Had the lab used only one commit (target == HEAD), this mutation would
have passed by accident, which is exactly the vacuous-witness shape the
stronger red-witness rule (CLAUDE.md:325) warns about; the two-commit
construction is what closes it, and I independently confirmed it does.

Also confirmed: the tag is genuinely annotated (`cat-file -t` reads `tag`, not
`commit`), it is pushed to the remote and read back from the remote (not only
the local clone), and it carries a non-empty message. All at baseline, run
green as part of the batch below.

## Criterion 6: fails closed on a pre-existing tag, two structurally different states, no local tag in the remote-only case (MET, with one point strengthened by an independent probe)

Reproduced both members of the shipped witness:

Member 0, local refusal replaced by delete-and-reuse:

```
AssertionError [ERR_ASSERTION]: a pre-existing tag must refuse; stdout Deleted tag 'v0.7.3' (was a122aa1)
tag: created annotated v0.7.3 at ...
```

Member 1, the whole remote-existence probe block removed:

```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /refusing/. Input:
'To /tmp/tiphys-tag-lab-.../remote.git\n ! [rejected]  v0.7.3 -> v0.7.3 (already exists)\n...'
```

Both match the work history. Member 1's captured stderr is worth reading on
its own: with the remote probe removed, `git push` itself rejects the
existing tag, so the step still exits nonzero, but by ACCIDENT of git's own
behaviour rather than by the step's own guard, and the failure message is
`[rejected] ... already exists` from git, not the step's `refusing` language.
That is exactly the "writes and then fails to push" shape the work history
warns against for member 0's "obvious" alternative, and it shows up here on
member 1 too, for a different sub-reason (git's push rejection, not the
step's own tag-delete).

I went one step further than the shipped witness to test whether the "NO
LOCAL TAG WAS CREATED" assertion (test/license-gate.test.ts:2147-2151) is
actually doing independent work, since both shipped members happen to fail an
earlier assertion (`/refusing/` or the exit code) before reaching it. I wrote
my own mutation, not in `witness/`: reordered the script so the annotated tag
is created BEFORE the remote-existence probe runs (guard bodies otherwise
unchanged), simulating "creates locally, discovers the remote conflict only
afterward":

```
AssertionError [ERR_ASSERTION]: a local tag was created for a tag the remote already carries, so the refusal came after a write rather than before one
```

This reddens specifically on the assertion the shipped witness never reaches,
confirming that assertion is not vestigial. This is independent evidence
beyond what the phase itself demonstrated, and it strengthens rather than
weakens the MET verdict: the mechanism the criterion cares about (refuse
before writing, not write then fail) is genuinely tested, not merely
asserted in prose.

## Criterion 7: the release body carries four things by name, chosen so none can alias (MET)

Read test/license-gate.test.ts:2202-2280. The four asserted facts (version,
commit sha, npm URL, workflow run link) are each matched with a `^...$`
multiline-anchored regex against a distinct line of the composed notes file,
so aliasing between them is prevented by the anchoring regardless of the
chosen values; the "chosen so none can alias" property is a second,
independent safety margin (a 40-hex-digit fake sha, a fake npm scope/package,
a fake `github.invalid` server) rather than the only thing preventing
confusion. I did not find a way to make one of the four values pass in place
of another given the anchored regexes, so the aliasing property holds as
claimed, though it is closer to belt-and-suspenders than to load-bearing.

Reproduced member 1 (the `npm:` line removed from the body):

```
AssertionError [ERR_ASSERTION]: the release body does not carry the npm package URL for the package and version it anchors
actual: 'version: 0.7.3\n\ncommit: 0123456789abcdef...\n\nworkflow run: https://github.invalid/...\n'
```

Confirms the npm-URL assertion is real (the notes file genuinely lacks the
line once removed) rather than checking something always present by
construction.

## Criterion 9: the round-2 comment quoted verbatim, DV-2's mutant re-measured red (MET)

Fetched the PRE-PHASE text of the comment from `origin/main` rather than
trusting the branch's own copy:

```
$ git show origin/main:test/license-gate.test.ts | sed -n '1324,1330p'
  /* THE JOB SET IS EXACT TOO (DV-2). A second job on a release workflow is an
     ordinary thing to add, and the verifier's mutant was exactly that. This
     assertion makes adding one a deliberate act that reddens here first; the
     assertions below ALSO iterate every job, so relaxing this line does not
     silently reopen the hole. Two guards, because the whole finding is that one
     guard's scope was narrower than its claim. */
  assert.deepEqual(Object.keys(document.jobs), ["release"]);
```

That is byte-for-byte the text the work history quotes at
delivery/work-history/m3-p12.md:326-333 (minus the M3-P12 addendum paragraph
appended after it), confirming the quote is genuine and not a paraphrase, and
that CLAUDE.md's "quote it rather than paraphrase it" instruction
(delivery/plan/m3-p12-phase-spec.md:33) was followed for the correct citation
(test/license-gate.test.ts:1330 on `main`, which resolves at that line
number on the pre-phase tree the citation is about).

Re-measured DV-2's mutant myself (prepend an unguarded-publish `notify` job)
rather than trusting the inherited-witness table:

```
$ node --test --test-name-pattern "the release workflow is manually dispatched only" test/license-gate.test.ts
AssertionError: [ 'notify', 'release', 'tag' ]  !=  [ 'release', 'tag' ]

$ node --test --test-name-pattern "exactly one step in any workflow invokes a publish command" test/license-gate.test.ts
AssertionError: expected exactly one step invoking a publish command, found 2: ... job notify step 1 ... | ... job release step 11 ...
```

Both independent assertions redden, matching the work history's claim that
extending the job-set list from two names to three did not reopen the round-2
hole: the every-job publish scan and the job-set list are both still live
guards against the same mutant.

After every mutation probe above, the workflow file was restored from a saved
copy and diffed byte-identical, and `git status --short` was checked clean
before moving to the next probe.

## Criterion 8: the suite (IN PROGRESS -- see below)

(section appended once the full local run completes)
