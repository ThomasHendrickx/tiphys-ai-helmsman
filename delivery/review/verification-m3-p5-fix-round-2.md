# Delta verification: M3-P5 fix round 2

Verifier: independent delta verifier. Did not write M3-P5, did not review it
before, and read fix round 1's verification only for the three findings it
raised. Scope is the DELTA 85f9fd6..944086b, not the phase.

- HEAD under verification: 944086b
- PREV (fix round 1 head): 85f9fd6
- Merge base with `origin/main`: 52fe657, which matches the round's own capture
- Verdict: **APPROVE the delta.** Three LOW findings, none blocking, all
  recorded below with the runs that produced them.

Toolchains used, named because this repository has paid three times for an
unqualified suite number:

- node v26.6.0 from `<scratchpad>/toolchain/node-v26.6.0-linux-x64/bin`
- node v22.22.2, the container default, reached through `bash -lc`
- Every command below states which one ran it.

## 1. WHAT THIS VERIFICATION DID NOT COVER

Written first, because the fix-round contract makes it the reviewer's first
check, and because a search whose scope is wrong returns an empty result
indistinguishable from an absence of defects.

1. **NO CI RUN OF ANY KIND WAS OBSERVED.** Same gap the round names first. I
   observed no `pull_request` check and no post-merge `push` run. Every gate
   number in this report is a LOCAL bundle in this container. Under T-009 that
   is evidence for one configuration only, and the two CI arms remain
   unwitnessed by me as well as by the round.
2. **I did not run the M3-P6 briefs against the repaired test.** They do not
   exist on this branch. Every fourth-brief result below uses briefs I STAGED
   in a lab copy, so it is evidence about the mechanism, not about M3-P6's
   actual deliverables.
3. **My D-3 mechanism derivation reads `src/**/*.ts` only.** It does not read
   `test/`, `bin/`, `scripts/`, or the shell scripts. It finds a specific
   syntactic shape (a collection compared as a whole, an element of it
   resolved with `join`/`resolve`); a path compared through a helper function,
   through an object key, or across a module boundary is invisible to it. The
   two shapes I know it cannot see are a comparison whose collection is built
   by a call rather than named, and a resolution that happens in a different
   module from the comparison.
4. **Finding F-3 is a CANDIDATE confirmed by source reading and by a
   constructed live run, not by a naturally occurring failure.** No witness
   spec in the tree today spells a path non-canonically, so the defect is
   latent. I did not survey how likely an author is to write one.
5. **I did not re-derive the round's stage-1 scanner.** I re-ran the round's
   own two scripts rather than writing a third, so a defect COMMON to both
   stages of their scanner would be invisible to me. What I did instead is
   check the scanner against a known instance (see F-3's method) and read its
   source for rigging; I found none.
6. **The symlink and case-insensitivity residues of D-3 are only partly
   probed.** I constructed the symlink case and confirmed the residue is real;
   I did NOT construct a case-insensitive filesystem, and cannot on this one.
7. **Timing and flake:** every test result below is a single run except where
   a control is stated. I did not run any assertion repeatedly to look for
   nondeterminism.
8. **I did not audit the phase against its acceptance criteria.** This is a
   delta verification of a fix round; the phase-level walk belongs to the
   clean-room reviews.

## 2. Findings

Three, all LOW. None blocks the merge. Each carries the run that produced it.

### F-1 (LOW): step 6's "re-run at the repaired head" was captured two commits earlier, and its line numbers are 20 short

The round's preamble makes step 6 the AUTHORITY for every shifted line number:
it says every `path:LINE` naming `test/roles.test.ts` or `src/roles.ts` is as of
85f9fd6 "unless it is marked otherwise", and that "the re-run at the repaired
head is in step 6 below with the diff that accounts for every shift"
(delivery/work-history/m3-p5.md:2418). Step 6 itself says "Re-run against the
tree this round hands back".

It was not run against that tree. Measured:

```
$ for c in 85f9fd6 ebc9b00 a3e8151 649da20 944086b; do
    n=$(git show $c:test/roles.test.ts | grep -n 'sharedAnchors, \["incremental-output"' | cut -d: -f1)
    w=$(git show $c:test/roles.test.ts | wc -l); echo "$c anchor_line=$n total_lines=$w"; done
85f9fd6 anchor_line=285 total_lines=425
ebc9b00 anchor_line=404 total_lines=544
a3e8151 anchor_line=424 total_lines=564
649da20 anchor_line=424 total_lines=564
944086b anchor_line=424 total_lines=564
```

Step 6 prints `C test/roles.test.ts:404`, which is ebc9b00's number. a3e8151
(the capture-equality rework, which is part of the same round) added 20 lines,
and the handback head is 424. The same staleness reaches step 8, whose hit-3
settlement pastes `sed -n '400,404p' test/roles.test.ts` showing the
clause-anchor test. At the handback head that range shows an unrelated R-004
assertion:

```
$ sed -n '400,404p' test/roles.test.ts          # at 944086b
      briefOriginal.replace(/^## clause R-004:.*$/m, "## The verdict"),
    );
    const localRed = runCli(["validate", "--type", "role-brief", investigator]);
    assert.notEqual(localRed.status, 0);
    assert.match(localRed.stdout, /R-004/);
$ sed -n '420,424p' test/roles.test.ts          # where the quoted text actually is
test("every clause id a brief declares occurs exactly once as an anchor of its own body or of the block it includes", () => {
  const sharedAnchors = rolesModule.clauseAnchors(
    readFileSync(join(rolesDir, "_shared-dispatch-contract.md"), "utf8"),
  );
  assert.deepEqual(sharedAnchors, ["incremental-output", "beacon-is-not-a-claim"]);
```

WHAT IS NOT WRONG: the SUBSTANCE reproduces exactly. I re-ran the round's own
two scripts at both heads, on node v22.22.2:

```
$ node classify-hand-written-sets.mjs <PREV 85f9fd6> | tail -1
HITS: 4  NON-HITS: 240
$ node classify-hand-written-sets.mjs <HEAD 944086b> | tail -1
HITS: 3  NON-HITS: 241
$ node enumerate-hand-written-sets.mjs <PREV> | grep -E '^(FILES|TOTAL)'
FILES SCANNED: 36
TOTAL: 244
$ node enumerate-hand-written-sets.mjs <HEAD> | grep -E '^(FILES|TOTAL)'
FILES SCANNED: 36
TOTAL: 244
```

and the diff between the two runs has exactly the shape step 6 claims (one HIT
removed, four rows shifted, one row added for the round's own D-3 spelling
loop), differing from the published diff only by the 20-line offset:

```
$ diff <(classify at PREV) <(classify at HEAD)
2d1
< A test/roles.test.ts:49 SUBSET of roles (3/5): investigator,plan-writer,adversarial-plan-reviewer
5c4
< C test/roles.test.ts:285 EQUALS-UNIVERSE of clauses (2/2): incremental-output,beacon-is-not-a-claim
---
> C test/roles.test.ts:424 EQUALS-UNIVERSE of clauses (2/2): incremental-output,beacon-is-not-a-claim
24,25c23,24
< A test/roles.test.ts:307 NO-GROWING-UNIVERSE
< A test/roles.test.ts:322 NO-GROWING-UNIVERSE
---
> A test/roles.test.ts:446 NO-GROWING-UNIVERSE
> A test/roles.test.ts:461 NO-GROWING-UNIVERSE
84a84
> B test/roles.test.ts:332 NO-GROWING-UNIVERSE
203c203
< C test/roles.test.ts:399 NO-GROWING-UNIVERSE
---
> C test/roles.test.ts:538 NO-GROWING-UNIVERSE
247c247
< HITS: 4  NON-HITS: 240
---
> HITS: 3  NON-HITS: 241
```

WHY IT IS A FINDING AND NOT A NITPICK: this round MEASURED the equivalent lag
for the gate bundle rather than arguing it (step 12 re-ran the whole bundle at
649da20 for exactly this reason) and named the one-commit lag explicitly. The
same discipline was available for step 6 and was not applied, and the result is
that the document's designated authority for line numbers points 20 lines off
in the file the round edits. A reader following it lands on an unrelated
assertion.

REMEDY: re-run the two scripts at 944086b and replace step 6's output and step
8's `sed` capture, or mark both as captured at ebc9b00 the way the preamble
marks the 85f9fd6 numbers. Either is a paperwork edit; nothing in the code
moves.

### F-2 (LOW): "NOT expressible" is false as stated, and a durable witness for the fourth-brief property does exist

Step 3b states that the durable witness for "a fourth brief exists" is "NOT
expressible", because rule (d) requires a phase-own witness member to touch a
file in the phase diff, and M3-P6's briefs are in no diff. It adds that the only
way to satisfy the rule "would be to have the patch also touch some changed file
for no reason, which is gaming a guard rather than satisfying it".

Rule (d) requires a NON-EMPTY intersection, not that every touched file be in
the diff. Its own source:

```
$ sed -n '1250,1262p' src/witness/run.ts
  // (d) diff intersection, for the phase's own witnesses.
  if (inputs.phaseOwn) {
    for (let index = 0; index < spec.dangerousStates.length; index += 1) {
      const member = spec.dangerousStates[index] as DangerousStateMember;
      if (member.kind === "baseline-ref") {
        continue;
      }
      const files = memberTouchedFiles(member, readPatch);
      const changedTouched = files.filter((file) => inputs.diff.files.has(file));
      if (changedTouched.length === 0) {
```

So a `patch` member touching BOTH `roles/implementer.md` (not in the diff) and
`test/roles.test.ts` (in the diff) satisfies rule (d). The round's dismissal
rests on the premise that the second file would be touched "for no reason", and
that premise is false for the obvious construction: REVERTING `AUTHORING_ROLES`
to the hand-written literal IS the dangerous state, and the fourth brief is what
makes it dangerous. Both halves are constitutive.

DEMONSTRATED. In a lab copy of 944086b I staged a fourth brief AND reverted the
list, then ran both tests. node v22.22.2:

```
== the fourth brief, refused by the shipped validator ==
INVALID #/outputs/0 output type work-history is governed by schemas/work-history.schema.json, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written
EXIT=1

== GUARD test under the combined dangerous state ==
not ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
  error: 'no recorded refusal for roles/implementer.md'
# pass 0
# fail 1

== OUTPUT-CONTRACT test under the SAME state (this is the silent one) ==
ok 1 - every authoring brief puts the schema of every output type it declares on its mandated-reading list
# pass 1
# fail 0
```

That is precisely the property the round wanted durable: the fix absent plus a
fourth brief present is RED on the guard and GREEN on the assertion that is
supposed to care. A `patch` member encoding those two edits is expressible, is
not gaming, and would be re-evaluated by the red-witness gate on every future
run.

SEVERITY IS LOW, NOT HIGHER, and the reason is worth stating: the property IS
enforced at this head. I verified it with a mutation the round did not declare
(F-2's method, below in section 3.1), and it reddens. What is missing is the
DURABLE guard on that enforcement, so the arm can rot without anything going
red. The two declared members cover vacuity and over-derivation, which are
structurally different from each other, so the class rule is met; this is a
third direction, not a missing class.

### F-3 (LOW): the D-3 mechanism has at least one more live site, in the shipped kernel

The round's gap 4 states that it did not derive the D-3 mechanism and fixed only
the two sites the finding named. I did that derivation, and it returns one
further site.

THE MECHANISM, stated so it is testable: one path-valued expression is compared
by STRING EQUALITY or SET MEMBERSHIP in one place and RESOLVED with
`join`/`resolve` in another. The resolver normalises; the comparison does not.

THE SITE: `src/witness/run.ts`. A witness member's declared file is resolved
with `join` when the mutation is applied, and compared as a raw string when rule
(d) tests whether it intersects the phase diff:

```
$ grep -n 'member.file' src/witness/run.ts
741:  const target = join(cloneDir, member.file);          <- RESOLVED (normalises)
1267:        const diffFile = inputs.diff.files.get(member.file);   <- RAW
1367:          return path === member.file ? ...                    <- RAW
$ grep -n 'inputs.diff.files.has(file)' src/witness/run.ts
1258:      const changedTouched = files.filter((file) => inputs.diff.files.has(file));
```

and `memberTouchedFiles` hands rule (d) the authored string verbatim:

```
$ sed -n '295,296p' src/witness/spec.ts
  if (member.kind === "mutation") {
    return [member.file];
```

The diff side of that comparison is built by parsing git's own output
(src/witness/run.ts:238), so it carries git's spelling of each path; the spec
side is author-written. Measured on this phase's diff, none of the 34 paths
carries `./`, a leading `/`, `/../` or `//`:

```
$ git diff --name-only 52fe657 944086b | grep -cE '(^\./|^/|/\.\./|//)'
0
```

That is a measurement of THIS diff, not a guarantee about every diff git can
produce. That is the same asymmetry D-3 had between `validate` and
`brief compose`, and its polarity is the same fail-safe one: a witness spelled
`./test/roles.test.ts` would have its mutation APPLY (because `join` normalises)
and would be REFUSED by rule (d) as not intersecting the diff.

I confirmed it live rather than by reading; the run is in section 3.6.

NOT FIXED HERE AND SHOULD NOT BE: `src/witness/run.ts` is not on
delivery/plan/phase-declarations/m3-p5.json:4's files-to-touch list, so this
phase cannot touch it without a scope violation. Recorded for whoever next
touches the witness runner, exactly as the round recorded
test/deploy-gate.test.ts:667 for the deploy gate.

## 3. The round's claims, each verified or falsified

### 3.0 The stated property: `roles/` is untouched

Verified rather than assumed, two ways. The name-status of the delta lists seven
files and no path under `roles/`, and every file in `roles/` is byte-identical
by blob id across the delta:

```
$ git diff --name-status 85f9fd6 944086b
M	delivery/work-history/m3-p5.md
M	src/roles.ts
M	test/behaviors.json
M	test/roles.test.ts
A	witness/captures/role-brief-non-brief-refusal.txt
A	witness/role-brief-reading-entry-one-canonical-form.json
A	witness/role-brief-set-derived-not-listed.json

$ for f in $(git ls-tree --name-only -r 944086b roles/); do ... compare blob ids ... done
IDENTICAL roles/README.md
IDENTICAL roles/_shared-dispatch-contract.md
IDENTICAL roles/adversarial-plan-reviewer.md
IDENTICAL roles/investigator.md
IDENTICAL roles/plan-writer.md
```

The delta is 7 files, as stated.

### 3.1 Claim 1: D-1 fixed at the mechanism, and the oracle is not decoration

VERDICT: **verified, and the oracle does more than the round demonstrated.**

The list is genuinely derived. `AUTHORING_ROLES` at test/roles.test.ts:72 reads
`roles/` with `readdirSync` and keeps a file when its first line is `---`, which
is the rule src/roles.ts:93 applies.

I attacked the derivation with THREE mutations, each applied by exact string
replacement with a tool that exits 3 if the find string is absent, so a
mutation that failed to land could not be mistaken for one that failed to
redden. All runs node v22.22.2, `--test-name-pattern` before the positional
path (CLAUDE.md warning 7).

CONTROL, unmutated head:

```
ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
# pass 1
# fail 0
EXIT=0
```

MUT-V, the empty derivation (the round's declared member 1):

```
not ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
  error: 'the derived brief set is empty, so every assertion over it would be vacuous'
# pass 0
# fail 1
EXIT=1
```

MUT-O, the over-broad derivation (the round's declared member 2):

```
not ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
  error: 'roles/README.md was derived as a brief and README is not a role id'
# pass 0
# fail 1
EXIT=1
```

THE VACUITY ARGUMENT IS REAL, and it is the whole case for the guard. Under
MUT-V the output-contract assertion passes, having checked nothing:

```
== MUT-V, output-contract test only ==
ok 1 - every authoring brief puts the schema of every output type it declares on its mandated-reading list
# pass 1
# fail 0
EXIT=0
```

MUT-D, MY OWN, and NOT one of the round's declared dangerous states: drop
exactly ONE real brief from the derived set. This is the direction the round
ADVERTISES the oracle for ("a brief silently dropped from the derived set
reddens here, because the validator would accept it") and which neither
declared member exercises: MUT-V is caught by the emptiness assertion and MUT-O
by the role-id assertion, and neither reaches the validator comparison.

```
== MUT-D: investigator silently dropped ==
not ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
  error: 'roles/investigator.md is excluded from the derived brief set and the validator accepts it as a brief'
# pass 0
# fail 1
EXIT=1
== and the OUTPUT-CONTRACT test under the same drop ==
ok 1 - every authoring brief puts the schema of every output type it declares on its mandated-reading list
# pass 1
# fail 0
EXIT=0
```

So the oracle arm works, and it is load-bearing: under MUT-D the assertion that
is supposed to care is green and only the guard reddens. The round's claim about
the oracle is TRUE. What is missing is that no declared dangerous state
exercises it, which is the durability half of F-2.

A property worth recording for the next phase: the guard pins the EXCLUDED set
to exactly the two files in the capture. A later phase adding another non-brief
file to `roles/` reddens it with `no recorded refusal for roles/<name>` until
the capture is regenerated. That is the EQUALS-UNIVERSE shape the round's own
derivation names, and it fails loudly rather than silently, which is the right
side of that trade.

### 3.2 Claim 2: the derivation of the mechanism class

VERDICT: **reproduces exactly; the four verdicts are correct; one presentation
defect (F-1).**

The round's two scripts live in the session scratchpad, not in the repository, so
"re-run its published commands" required locating them; they are
`enumerate-hand-written-sets.mjs` and `classify-hand-written-sets.mjs`. I read
both for rigging before running them and found none: the universes are read from
the tree at run time, the verdict is a set-containment test, and nothing
special-cases `roles.test.ts`.

Stage 1 and stage 2 reproduce at both heads, numbers already quoted under F-1:
244 candidates over 36 files at both heads, HITS 4 at PREV and HITS 3 at HEAD.
The 2186-row first attempt is recorded by the round as useless and I did not
re-run it.

THE FOUR HITS, each verdict checked rather than accepted:

- **test/roles.test.ts:49 (at PREV), `AUTHORING_ROLES`, SUBSET of roles 3/5.**
  This is D-1 and it is gone at HEAD. Confirmed by the diff above.
- **The shared-clause anchor pin, EQUALS-UNIVERSE of clauses 2/2, left in
  place, claimed to "fail loudly".** I checked this BY BREAKING IT rather than
  by reading. Appending a third clause to the shared block, simulating what
  M3-P6 may do:

  ```
  $ grep -nE '^#{1,6}[ \t]+clause[ \t]+' roles/_shared-dispatch-contract.md
  17:## clause incremental-output: create the artifact in the first minutes, append as you go
  68:## clause beacon-is-not-a-claim: the artifact is the report, and the guard tests freshness
  == with a third clause appended ==
  not ok 1 - every clause id a brief declares occurs exactly once as an anchor of its own body or of the block it includes
  # pass 0
  # fail 1
  == control, unmodified shared block ==
  ok 1 - every clause id a brief declares occurs exactly once as an anchor of its own body or of the block it includes
  # pass 1
  # fail 0
  ```

  The pin does fail loudly. The round's reason for leaving it stands.
- **test/deploy-gate.test.ts:667, SUBSET of gates 2/14, called a real smaller
  instance left for scope.** Confirmed real:

  ```
  $ sed -n '660,667p' test/deploy-gate.test.ts
        "--only",
        "deploy",
        "--only",
        "migrations",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    for (const gate of ["deploy", "migrations"]) {
  ```

  and correctly out of scope: `test/deploy-gate.test.ts` is absent from
  delivery/plan/phase-declarations/m3-p5.json:4's `filesToTouch`, which I read
  in full. Leaving it is the right call.
- **test/assurance-modes.test.ts:1379, SUBSET of schemas 1/12, called a false
  positive.** Confirmed a false positive:

  ```
  $ sed -n '1379,1381p' test/assurance-modes.test.ts
    for (const path of [modesPath, join(schemasDir, "assurance-modes.schema.json")]) {
      assert.deepEqual(livenessHits(readFileSync(path, "utf8")), [], path);
    }
  ```

  Two paths, one of them a variable. Not a membership list. Correctly classified.

The stated gaps in step 1c are accurate as far as I checked them. I did not
independently audit gap 2 (memberships that are not array literals) across the
other 35 files, and say so in section 1.

### 3.3 Claim 3: red witnesses, two structurally different members

VERDICT: **verified. Member B reproduced in full, including the arm where every
weaker check stays green.**

Member B staged in a lab copy of 944086b: a fourth brief `clean-room-reviewer`
with `outputs: [report, finding]` whose reading list keeps
`schemas/report.schema.json`, so the FIRST output is satisfied. node v22.22.2:

```
-- the reading list and outputs as staged --
mandated-reading:
  - roles/_shared-dispatch-contract.md
  - schemas/report.schema.json
outputs:
  - report
  - finding

-- WEAKER CHECKS, all green here --
   the list mentions a schema:            yes
   the schema exists on disk:             yes
   brief compose resolves the list:       COMPOSE EXIT=0

-- the shipped validator, which walks EVERY output --
INVALID #/outputs/1 output type finding is governed by schemas/finding.schema.json, which is not on mandated-reading, so this brief never tells its agent where the contract for its own output is written
EXIT=1

-- DERIVED brief set (this round) --
not ok 1 - every authoring brief puts the schema of every output type it declares on its mandated-reading list
  error: 'clean-room-reviewer declares output finding, whose contract is schemas/finding.schema.json, and does not read it'
# pass 0
# fail 1

-- HAND-WRITTEN brief set (the reviewed head's state) --
ok 1 - every authoring brief puts the schema of every output type it declares on its mandated-reading list
# pass 1
# fail 0
```

It fails at `#/outputs/1` and not at `#/outputs/0`, exactly as claimed, and the
hand-written row is the silent miss reproduced. I also staged member A (an
`implementer` brief with `outputs: [work-history]` and no schema on its reading
list) while testing F-2 and it is refused at `#/outputs/0`, so the two members
are structurally different in the way the round says.

I did not re-run every one of the six matrix cells; I ran the two that carry the
argument (B derived red, B hand-written green) plus A derived red.

### 3.4 Claim 4: the first bundle was red, and the capture is compared by equality

VERDICT: **verified, and the equality is stronger than the round demonstrated.**

The capture is genuine program output. Byte-for-byte, the recorded refusal lines
and a live run at HEAD agree:

```
$ cat witness/captures/role-brief-non-brief-refusal.txt   (refusal lines only)
tiphys validate: roles/README.md does not open with a --- frontmatter fence, so it has no role-brief frontmatter to validate
tiphys validate: roles/_shared-dispatch-contract.md does not open with a --- frontmatter fence, so it has no role-brief frontmatter to validate

$ for f in roles/README.md roles/_shared-dispatch-contract.md; do node bin/tiphys.ts validate --type role-brief "$f"; echo "EXIT=$?"; done
tiphys validate: roles/README.md does not open with a --- frontmatter fence, so it has no role-brief frontmatter to validate
EXIT=1
tiphys validate: roles/_shared-dispatch-contract.md does not open with a --- frontmatter fence, so it has no role-brief frontmatter to validate
EXIT=1
```

The comparison in the test is `assert.equal` on the trimmed stdout+stderr
against the recorded line (test/roles.test.ts:177), not a pattern.

THE DECISIVE TEST, which the round did not run: reword the message in a way that
KEEPS the phrase the original regex matched. If the equality is real it reddens;
if the guard were still `/frontmatter fence/` it would not. I changed
src/roles.ts:96 from "so it has no role-brief frontmatter to validate" to "so
there is no role-brief frontmatter here to validate":

```
== MUT-R: guard test under the reworded message ==
not ok 1 - the brief set every assertion in this file runs over is derived from roles/, is not empty, and partitions the directory the way the shipped validator does
  error: |-
  expected: 'tiphys validate: roles/README.md does not open with a --- frontmatter fence, so it has no role-brief frontmatter to validate'
  actual: 'tiphys validate: roles/README.md does not open with a --- frontmatter fence, so there is no role-brief frontmatter here to validate'
# pass 0
# fail 1

== and what the ORIGINAL regex would have said about the same rewording ==
live: tiphys validate: roles/README.md does not open with a --- frontmatter fence, so there is no role-brief frontmatter here to validate
/frontmatter fence/ matches: true
```

So the reworded message passes the pattern the red bundle rejected and fails the
equality that replaced it. The rule (f) repair is real, not cosmetic.

### 3.5 Claim 5: D-3 normalised through one shared function

VERDICT: **verified, and the fix covers two spellings more than the round
measured. The stated residue is real; I constructed one case the round said it
had not.**

`canonicalReadingEntry` is exported at src/roles.ts:292 and is asked by both
sites: the comparison at src/roles.ts:302 and the resolution at src/roles.ts:380.

I wrote my own probe rather than re-running theirs: for each spelling, write it
into `roles/investigator.md` in a lab copy, then run BOTH commands and compare
exit codes. I added two spellings the round did not test. node v22.22.2:

```
=== WITH the canonical form (HEAD, 944086b) ===
schemas/report.schema.json                 validate EXIT=0  compose EXIT=0  AGREE
./schemas/report.schema.json               validate EXIT=0  compose EXIT=0  AGREE
schemas/../schemas/report.schema.json      validate EXIT=0  compose EXIT=0  AGREE
/schemas/report.schema.json                validate EXIT=0  compose EXIT=0  AGREE
schemas//report.schema.json                validate EXIT=0  compose EXIT=0  AGREE
./schemas/./report.schema.json             validate EXIT=0  compose EXIT=0  AGREE
=== WITHOUT it (raw string membership, the state D-3 found) ===
schemas/report.schema.json                 validate EXIT=0  compose EXIT=0  AGREE
./schemas/report.schema.json               validate EXIT=1  compose EXIT=0  DISAGREE
schemas/../schemas/report.schema.json      validate EXIT=1  compose EXIT=0  DISAGREE
/schemas/report.schema.json                validate EXIT=1  compose EXIT=0  DISAGREE
schemas//report.schema.json                validate EXIT=1  compose EXIT=0  DISAGREE
./schemas/./report.schema.json             validate EXIT=1  compose EXIT=0  DISAGREE
```

The "without" arm was produced by mutating HEAD back to raw membership
(`new Set(reading)`) and raw resolution (`join(root, declared)`), each by exact
string replacement. The round reported three disagreeing spellings; five
disagree, and all five now agree. The fix is broader than its own measurement,
which is the safe direction.

WHAT CANONICALISATION DOES NOT COVER. The round names two residues and says it
constructed neither. I constructed the first:

```
$ ln -s report.schema.json schemas/report-alias.schema.json
SYMLINK residue: schemas/report-alias.schema.json     validate EXIT=1  compose EXIT=0  DISAGREE
```

Two entries naming one document through a symlink are still two strings, and the
two commands still disagree. The residue is REAL, not hypothetical. Its polarity
is the same fail-safe one D-3 had (the strict side refuses), and closing it would
mean comparing inodes or realpaths rather than strings, which is a different and
larger decision than this round's. Recorded, not raised as a finding, because the
round declared it at the decision site.

I did NOT construct the case-insensitive-filesystem case and cannot on this one.
"I did not find a way to force that arm here" is the true sentence; I make no
claim that it is unforceable.

A third thing canonicalisation does not reach, unchanged from fix round 1 and
restated at src/roles.ts:224: the check is still satisfied by a STRING. A brief
may name a schema document that does not exist and pass
`validate --type role-brief`; `brief compose` is what refuses the missing path.
I confirmed the division of labour holds at HEAD in the probe above, where every
`compose` exit is the resolving side.

### 3.6 F-3 confirmed live: the same mechanism in the witness runner

Method, and the reason it is the right method: my FIRST derivation was useless
and I am recording it rather than only its replacement.

VERSION 1 intersected, per module, identifiers appearing both as an argument to
`join`/`resolve` and as the subject of a membership or equality test. It
returned EIGHT candidates and BYTE-IDENTICAL output at 85f9fd6 and 944086b:

```
$ node d3-mechanism.mjs <PREV>  |  $ node d3-mechanism.mjs <HEAD>
   (identical, 8 candidates, src/roles.ts in NEITHER)
CANDIDATES: 8
```

That is a scanner that cannot see the one instance it was built to generalise,
and its empty result would have been indistinguishable from an absence of
defects. The cause: the two roles are played by DIFFERENT identifiers. The
elements of `reading` are compared through `new Set(reading)`, and an element
bound as `declared` is what `join(root, declared)` resolves.

VERSION 2 makes the unit the COLLECTION. For every identifier X: is X compared
as a whole (`new Set(X)`, `X.includes(`, `X.has(`, `X.indexOf(`), and does an
element bound out of X (`for (const V of X)`, `X.map((V) =>`, and the other
element-binding methods) reach `join`/`resolve`? X in both roles is a candidate.

RED WITNESS FOR THE SCANNER ITSELF, which is what version 1 lacked: it must find
D-3 where D-3 was live and lose it where D-3 is fixed.

```
=== v2 at PREV 85f9fd6 (D-3 LIVE) ===
src/gates/run.ts  collection 'only'  compared-at 1583  element-resolved-at 1572(id)
src/roles.ts  collection 'reading'  compared-at 275  element-resolved-at 345(declared)
src/witness/run.ts  collection 'files'  compared-at 1258  element-resolved-at 1258(file),1421(path)
CANDIDATES: 3

=== v2 at HEAD 944086b (D-3 fixed) ===
src/gates/run.ts  collection 'only'  compared-at 1583  element-resolved-at 1572(id)
src/witness/run.ts  collection 'files'  compared-at 1258  element-resolved-at 1258(file),1421(path)
CANDIDATES: 2
```

It finds `src/roles.ts` collection `reading` at PREV and loses it at HEAD. The
scanner has the right scope.

THE TWO SURVIVORS, each given a verdict:

- **src/gates/run.ts:1583, collection `only`.** FALSE POSITIVE. `only` holds
  GATE IDS, not paths (`only.includes(gate.id)` selecting from the manifest);
  the `join` hit came from the very common identifier `id` matching elsewhere in
  the module. Nothing here is a path.
- **src/witness/run.ts:1258, collection `files`.** REAL, and it is F-3. Covered
  in section 2.

LIVE CONFIRMATION rather than source reading. I re-spelled the two members of
`witness/role-brief-set-derived-not-listed.json` from `test/roles.test.ts` to
`./test/roles.test.ts` in the working tree of the head worktree, changing
nothing else, and ran the red-witness gate. The mutation targets still resolve
(`join` normalises) and rule (d) refuses them:

### 3.6a F-3, the live run (pasted at the moment it finished)

The witness spec re-spelled, nothing else changed, node v26.6.0 at 944086b:

```
$ node -e '<re-spell both members from "test/roles.test.ts" to "./test/roles.test.ts">'
spec re-spelled ./test/roles.test.ts in 2 member(s)

$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --only red-witness --evidence <scratch>/gates-f3b --base origin/main --head HEAD --phase m3-p5
gates: run 8cf93bdca24a214ba96dd545
gates: registry gate-registry.yaml mode full
gates: declared 1 applicable 1 verdict 1 green 0 red 1 not-applicable 0 error 0 vacuous 0
gates: 1 gate(s) reported red: red-witness
GATES EXIT=1

$ cat <evidence>/red-witness/result.json
status: red units: 18
18 witness(es) evaluated (13 own, 5 stored re-evaluated in 96776ms); witness
role-brief-set-derived-not-listed: red: rule (d): declared dangerous state does
not intersect the phase diff (member 0, mutation of ./test/roles.test.ts);
rule (d): declared dangerous state does not intersect the phase diff
(member 1, mutation of ./test/roles.test.ts)
```

`test/roles.test.ts` is unambiguously in the phase diff; the only change is the
spelling of the path in the spec. Rule (d) says it does not intersect. That is
the D-3 mechanism, live, in the shipped kernel, in a file this phase may not
touch.

THE TREE WAS RESTORED from a copy taken before the edit, not with
`git checkout --` (CLAUDE.md standing warning 8):

```
$ cp <scratch>/PRISTINE-witness-spec.json witness/role-brief-set-derived-not-listed.json
$ git status --porcelain | wc -l
0
$ git rev-parse --short HEAD
944086b
```

### 3.7 Claim 6: D-2, the work-history quote matches the shipped bytes

VERDICT: **verified.**

My first attempt was a RAW substring check and it reported the quote absent from
the shipped clause. That was MY error, not a finding: the shipped clause is hard
wrapped, so the quoted sentence straddles a newline. The round's own check
flattens whitespace before comparing, which is the correct treatment, and I
re-ran it:

```
$ node quotecheck.mjs            # node v22.22.2, at 944086b
"Nothing here forces the append"
  shipped clause: true   work history: true
"and what the kernel adds is to make the absence VISIBLE and th"
  shipped clause: true   work history: true
"the kernel's contribution is"
  shipped clause: false   work history: true
```

The shipped bytes, so a reader can check the elision:

```
$ grep -n 'Nothing here forces the append' -A 2 roles/_shared-dispatch-contract.md
61:AND THE HONEST LIMIT OF THIS CLAUSE. Nothing here forces the append. This is a
62-rule you follow, and what the kernel adds is to make the absence VISIBLE and
63-the consequence real, not to make the omission impossible.
```

The work history's ellipsis covers exactly "This is a rule you follow,", which
is a fair elision. The artifact quote at delivery/work-history/m3-p5.md:2179 is
repaired.

ONE IMPRECISION, not a finding. The round says of the old wording that "it is
the only remaining occurrence". Flattened, there are THREE occurrences:

```
$ (whitespace-flattened) count in work history: 3
  ...quotes the shared clause as "the kernel's contribution is ..." where the shipped bytes sa...
  ...delivery/work-history/m3-p5.md:2179 quoted the clause as "the kernel's contribution is to make the absence VISIBLE"; r...
  ...shipped clause: true work history: true "the kernel's contribution is" shipped clause: false work his...
```

All three are quotations OF THE FINDING (the D-2 bullet, the step-5 prose, and
the capture block that reads them), not uses of the old wording as an artifact
quote. The substance of the claim holds; the word "only" does not. Recorded here
so a later reader who runs the same count is not surprised.

### 3.8 Claim 7: the suite, on three axes

VERDICT: **verified, every figure, including the SKIPPED counts.**

FIRST, A FALSE START I AM RECORDING BECAUSE IT NEARLY BECAME A FINDING. My first
suite run was in a `tar` copy of the worktree that excluded `.git`. It reported
590 tests, 587 pass, 3 fail, exit 1. All three failures were git-dependent
(`readGitBlob`/`gitObjectType` expecting a tree, `gitTargetReader` expecting a
blob, and a diff-scoped registry gate), because a copy without `.git` is not a
repository. That was MY artifact. I re-ran every arm in the real git worktree at
944086b and the figures below are those runs. A verifier who had stopped at the
first run would have filed three phantom findings.

All three arms at 944086b, `dist/` BUILT, in the git worktree:

```
$ node --version && npm run build && git status --porcelain | wc -l
v26.6.0
BUILD_EXIT=0
GIT_STATUS_AFTER_BUILD_LINES=0
```

so the clean-status-after-build acceptance criterion holds too.

| toolchain | build state | invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|---|---|
| node v26.6.0 | `dist/` built | `npm test` (what the `suite` gate runs) | 590 | 590 | 0 | **0** | 0 |
| node v26.6.0 | `dist/` built | bare `node --test` from the repository root | 592 | 592 | 0 | **0** | 0 |
| node v22.22.2 (container default, via `bash -lc`) | `dist/` built | `npm test` | 590 | 588 | 0 | **2** | 0 |

TRANSLITERATION DECLARED (CLAUDE.md rule 3). The node v26.6.0 runs use node's
spec reporter, whose lines carry non-ASCII. In the two blocks below, U+2139
INFORMATION SOURCE is rendered `i`: 8 occurrences in the first block, 7 in the
second, 15 in total on this page. No U+2714 HEAVY CHECK MARK is reproduced in
either block, so its count here is 0. The v22.22.2 run emits TAP, which is pure
ASCII and is quoted unaltered. Nothing else in any captured output was changed
and no captured output in this report was hand-written.

```
$ node --version; npm test                       # node v26.6.0, dist built
v26.6.0
i tests 590
i suites 0
i pass 590
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 165199.54617
NPM_TEST_EXIT=0

$ node --test                                    # invocation axis, same toolchain and build state
i tests 592
i suites 0
i pass 592
i fail 0
i cancelled 0
i skipped 0
i todo 0
BARE_EXIT=0

$ bash -lc 'node --version && npm test'          # toolchain axis, the container default
v22.22.2
# tests 590
# pass 588
# fail 0
# cancelled 0
# skipped 2
# todo 0
DEFAULT_NPM_TEST_EXIT=0
```

THE TWO EXTRA TESTS ARE NAMED, not inferred. They appear in the bare invocation
and are absent from `npm test`:

```
$ grep 'greet' <bare node --test log>
OK greet returns a greeting for a name (0.862974ms)
OK greet rejects an empty name (0.413976ms)
$ grep -c 'greet' <npm test log>
0
$ node -e 'console.log(JSON.parse(...package.json...).scripts.test)'
node --test "test/**/*.test.ts"
$ git ls-files sandbox/
sandbox/README.md
sandbox/package-lock.json
sandbox/package.json
sandbox/src/greet.js
sandbox/test/greet.test.js
```

(the two `OK` above are my own transliteration of U+2714 in that grep output, 2
occurrences, declared here.)

THE TWO SKIPS ARE NAMED by the reporter, each carrying the floor in its own SKIP
reason, and there are two and not nine because `dist/` is built:

```
ok 153 - doctor in a healthy fleet exits 0 # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
ok 157 - doctor with gh absent exits 0 under the generic profile # SKIP local Node v22.22.2 is below the kernel floor >=26; exit-0 witnessed on CI (Node 26)
```

Like the round, I did NOT measure a `dist`-absent arm, so I make no claim about
the nine-test figure from my own runs.

I also checked the round's own transliteration declaration for completeness
rather than plausibility. It declares U+2139 rendered `i` 16 times and U+2714
rendered `OK` twice. Counted in the round-2 section of the work history:

```
$ python3: lines starting 'i ' in the round-2 section:  16
$ python3: lines starting 'OK ' in the round-2 section:  2
$ non-ASCII characters in the whole work history:        0
```

The declaration is exact, not approximate.

### 3.9 Claim 8: the gate bundle, EXIT=20 and the reason from the run's own record

VERDICT: **verified.** node v26.6.0, at 944086b, full mode:

```
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <scratch>/gates-dv --base origin/main --head HEAD --phase m3-p5
gates: run d4cc9d6554874243003f2830
gates: 2 registry gate(s) declared verified-by clean-room-checklist and NOT executed by this runner: unit-tests-for-changed-service-methods (probe unit-tests-for-changed-service-methods), fixtures-for-changed-component-states (probe fixtures-for-changed-component-states)
gates: registry gate-registry.yaml mode full
gates: declared 12 applicable 7 verdict 7 green 7 red 0 not-applicable 5 error 0 vacuous 0
gates: required gate(s) not applicable: citations, scope
GATES EXIT=20
```

EXIT=20 confirmed. The `citations` reason read from the gate's OWN result record
rather than from the summary line:

```
$ cat <evidence>/citations/result.json
status: not-applicable   units=0
detail: no changed path under the configured documents globs (34 changed path(s)
  total). The diff-touches precondition is a path prefix and the documents config
  is a glob set, so a changed path under a configured tree that is not a
  configured document reaches here with the precondition met
```

which is the reason the round states.

MY RUN DIFFERS FROM THE ROUND'S ON ONE GATE AND THE CAUSE IS MY ENVIRONMENT, NOT
THE ROUND. The round reports applicable 8 / green 8 / not-applicable 4 with only
`citations` not applicable; I get applicable 7 / green 7 / not-applicable 5 with
`scope` also not applicable. The gate says why:

```
$ cat <evidence>/scope/result.json
status: not-applicable   units=0
detail: precondition scope-branch-is-a-phase-branch evaluated and unmet:
  branch HEAD does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
```

My worktree is at DETACHED HEAD, because `claude/m3-p5-authoring-role-briefs` is
checked out in another worktree and git will not check it out twice. This is a
neat live confirmation that CLAUDE.md's "branch names are load-bearing" entry is
mechanical rather than advisory, and it is not a defect in the round.

I therefore verified the scope PROPERTY directly instead of through the gate:

```
$ git diff --name-only 52fe657 944086b | wc -l
34
$ node -e '<audit each changed path against filesToTouch plus the standing extras>'
changed: 34   off-list: 0
declared-but-untouched: src/validate.ts
```

34 changed paths, none off the list, and `src/validate.ts` declared but not
touched, which reproduces the round's quoted scope detail exactly.

EVERY OTHER GATE MATCHES THE ROUND'S UNITS, gate for gate:

| gate | my status | my units | round's units |
|---|---|---|---|
| `agent-rules-drift` | green | 17 | 17 |
| `citations` | not-applicable | 0 | 0 |
| `clause-map` | green | 34 | 34 |
| `coverage` | green | 115 | 115 |
| `credential-scrub` | green | 7 | 7 |
| `credential-token` | not-applicable | 0 | 0 |
| `deploy` | not-applicable | 0 | 0 |
| `manifest-self-check` | green | 8 | 8 |
| `migrations` | not-applicable | 0 | 0 |
| `red-witness` | green | 18 | 18 |
| `scope` | not-applicable (my detached HEAD) | 0 | 34 |
| `suite` | green | 590 | 590 |

and the two that carry the most:

```
red-witness: 18 witness(es) evaluated (13 own, 5 stored re-evaluated in 95356ms);
  every witness red against every declared dangerous state and green at head
suite: suite green via tiphys-suite-events-v1 (child node v26.6.0): reported 590
  test(s) from 36 file(s) (pass 590, fail 0, skipped 0, todo 0, did-not-run 0);
  discovered 36 file(s) walking test for .test.ts; 594 behavior(s) resolve;
  merge base 52fe657aff6e
```

So both new witness specs are re-evaluated red against every declared dangerous
state by the gate itself, independently of my own mutation runs in section 3.1.

## 4. The round's own stated gaps, tested rather than accepted

The round lists seven not-covered items. Three were flagged to me; I tested all
three and add my verdict on the others I could reach.

1. **"NO CI RUN OF ANY KIND WAS OBSERVED."** TRUE, and it is also true of this
   verification. Every gate number in the round's work history and in this
   report is a local bundle in this container. Under T-009 a gate result is
   evidence only for the configuration it ran under, so the `pull_request` arm
   and the post-merge `push` arm on the new `main` tip each still need their own
   witness before this phase closes. Neither the round nor I can produce them
   from here. This is the largest open item on the phase and it is not a defect
   in the round's work.
2. **"I did not derive the D-3 mechanism."** TRUE, and I did it. It returns one
   further live site. That is F-3. The round's honesty here is what made the
   gap findable, and the finding it yields is out of this phase's scope to fix.
3. **The durable witness for "a fourth brief exists" claimed NOT expressible.**
   FALSE as stated. That is F-2, with the construction and the red run in
   section 2.
4. **test/deploy-gate.test.ts:667 left unfixed for scope.** Verified real and
   verified correctly out of scope in section 3.2. The right call.
5. **"The output-contract check still reaches the FRONTMATTER only."** Verified
   in section 3.5: a brief may name a document that does not exist and pass
   `validate`; `brief compose` is what refuses it. Unchanged residue, correctly
   declared at the definition site.
6. **"No brief was added."** Verified: `roles/` is byte-identical across the
   delta (section 3.0), and every fourth brief in this report and in the round's
   is staged in a lab copy.
7. **"The dist-absent build-state arm was not measured this round."** TRUE, and
   I did not measure it either. The nine-test figure remains quoted from
   CLAUDE.md by both of us, and is labelled as quoted in both.

## 5. Verdict

**APPROVE the delta 85f9fd6..944086b.** The three findings the round was
dispatched with are closed, and closed at the mechanism rather than at the
instance:

- **D-1 (MEDIUM): CLOSED.** The brief set is derived from `roles/` at run time,
  the false comment is replaced by one that records what was false and how it
  was falsified, and the derivation carries a guard whose two declared dangerous
  states both redden (section 3.1). The guard's independent-oracle arm also
  reddens on a third direction I supplied and the round did not declare.
- **D-2 (LOW): CLOSED.** The quotation matches the shipped bytes, checked by
  whitespace-insensitive substring against the shipped file (section 3.7).
- **D-3 (LOW): CLOSED, and more broadly than measured.** One exported
  `canonicalReadingEntry` is asked by both the check and the resolver; five
  spellings that disagreed now agree, where the round measured three
  (section 3.5).

The three findings I raise are all LOW and none blocks the merge:

| id | severity | what | fixable in this phase |
|---|---|---|---|
| F-1 | LOW | step 6's "re-run at the repaired head" and step 8's `sed` capture were taken at ebc9b00; line numbers are 20 short of the handback head | yes, paperwork only |
| F-2 | LOW | "NOT expressible" is false; a durable witness for the fourth-brief property exists and was not written | yes, one patch member |
| F-3 | LOW | the D-3 mechanism has a second live site, `src/witness/run.ts:1258` (rule (d) compares an authored path raw against a git-canonical diff) | NO, out of scope; record for the witness runner |

WHAT WOULD CHANGE MY VERDICT: an observed CI run on either arm going red. I
observed none, which is section 1 item 1 and the phase's largest open item, not
a defect in this round.

A note on the round's method, offered because it is the part most worth keeping.
Three things in it are better than the contract requires, and each of them is
what let me find something rather than merely agree: it recorded its useless
first derivation (2186 rows) instead of only the useful second; it recorded the
RED first gate bundle and what the red was, instead of only the green one; and
it named its own gaps precisely enough that two of my three findings are its own
gap statements followed through. A round that had hidden any of those would have
been faster to read and worth less.

## 6. The claim grep over THIS report, both forms

CLAUDE.md's binding command is line-based and this prose is hard wrapped, so a
phrase straddling a wrap is invisible to it. Both forms were run over this file.

```
$ grep -nEi 'cannot be|impossible|needs a|is covered|catches|would catch|recovers|anyway|always|never|no way to' <this report> | wc -l
```

Measured BEFORE this section was written: hits on 5 LINES, and both forms
reporting the SAME 15 occurrences, with an empty diff between the two sorted
occurrence lists.

Re-measured on the FINISHED file, because writing this section adds text the
grep then reads, exactly as the round's own step 11 records:

```
line-visible: 18   wrap-insensitive: 18
$ diff <(line-based, sorted) <(wrap-insensitive, sorted)   ->   empty
```

Both figures are stated as of the moment they were taken. The three added
occurrences are this section quoting the hits it settles. The wrap gap is empty
here, which is a measurement of this file and not a guarantee about the next
one; the reason to run both forms is that the first cannot tell you whether it
missed anything.

HIT BY HIT:

1. **"never tells its agent"**, twice, inside CAPTURED validator output
   (`#/outputs/0` for member A and `#/outputs/1` for member B). The words are
   the shipped diagnostic's, quoted exactly as the program printed them, not
   mine.
2. **"is always canonical"**: REWRITTEN. It was a universal claim about every
   git diff and I had measured one. It now states what was measured, with the
   command, and says so.
3. **"not to make the omission impossible"**: inside a quotation of
   roles/_shared-dispatch-contract.md:63. The shipped file's words.
4. **The alternation inside the grep command itself**, which this section
   quotes. It is the check reading its own text, and it is why the occurrence
   count is dominated by one line.

Two sentences in this report were deliberately written in the weaker form the
rule asks for. In section 3.5: "I did not find a way to force that arm here" for
the case-insensitive filesystem, rather than a claim that it cannot be forced.
In section 1 item 3: my D-3 scanner's blind spots are named as shapes it cannot
see, with the two I know listed, rather than a claim that the derivation is
complete.

## 7. Reproduction index

Everything in this report can be re-run. The scratch artefacts are session-local
and are listed so a later reader knows what existed rather than assuming it:

- The round's own two derivation scripts, `enumerate-hand-written-sets.mjs` and
  `classify-hand-written-sets.mjs`, live in the session scratchpad and NOT in
  the repository. Their full output is pasted in the work history, which is what
  the fix-round contract requires, but the SCRIPTS are not recoverable from git.
  A later reader can re-derive the numbers only by rewriting them. This is worth
  one sentence to the orchestrator rather than a finding: the contract asks for
  the command and its output, and both are present.
- My own scanners, `d3-mechanism.mjs` (the recorded dead end) and
  `d3-mechanism2.mjs` (the one with a red witness), and the exact-string
  mutation tool `mut.mjs`, are likewise session-local.
- Mutations were applied to `tar` copies of the head worktree with
  `node_modules` symlinked, restored by re-extracting a pristine snapshot taken
  before any edit. No `git checkout --` was used at any point in this
  verification (CLAUDE.md standing warning 8). The one edit made inside the head
  worktree, for the F-3 live run, was restored from a file copy and the worktree
  verified clean afterwards.
- Both ASCII checks were run with the load-bearing `-a`, over `git ls-files`
  minus the two path-scoped exemptions, at 944086b:

```
$ node scripts/check-authored-bytes.mjs
SCRIPT EXIT=0
$ <control-character scan, grep -qaP over every tracked file minus the two exemptions>
control-char scan done          (no file reported)
$ <non-ASCII scan, same file set>
non-ascii scan done             (no file reported)
```


## 8. Status

COMPLETE. Written incrementally from 06:18 to 06:50 UTC on 2026-08-12; this
file's mtime was the beacon throughout.

Not committed and not pushed, as instructed. The head worktree was left clean
(`git status --porcelain` empty at 944086b) after the one edit made in it for
the F-3 live run was restored from a file copy.
