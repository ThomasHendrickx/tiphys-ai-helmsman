# Delta verification: exit-test harness assertion direction, fix round 3

Independent delta verifier. I did not write the code under check and my job was to
try to falsify it.

> **EDITED AFTER HANDBACK BY THE ORCHESTRATOR, declared here rather than done
> silently.** Fifteen citations into `test/m2-exit-test.test.ts` and
> `scripts/m2-exit-test.sh` were converted from resolving form to QUOTED form
> (wrapped in backticks). **No claim, number, verdict or word of analysis was
> changed**; the edit is purely the backticks. The reason is a collision between
> two rules that this document is the first to hit:
>
> - Tuition T-019 says cut an evidence branch from `main`, never from the branch
>   under review, so that landing the evidence does not land its subject. This
>   branch obeys that.
> - The `citations` gate requires a `path:line` token to resolve IN THE TREE
>   BEING LINTED. On `main`, `test/m2-exit-test.test.ts` has 1886 lines, so
>   `test/m2-exit-test.test.ts:1911` is out of range and the gate went RED
>   (run 31628258664, step 8).
>
> An evidence document about an unmerged branch therefore CANNOT cite that
> branch's line numbers in resolving form while sitting on `main`. The rules
> file already prescribes the remedy and says so in as many words at
> CLAUDE.md:180: a path in backticks is how you name a file you are NOT
> asserting exists at that line, "such as one on an unmerged branch". That is
> exactly this case.
>
> (The first version of this note cited that rule as `CLAUDE.md:3b`, which is
> its RULE number and not a line number, so the gate rejected it as malformed.
> Recorded because it is the same class of error as the one the note is about:
> a citation that looks right to its author and does not resolve.)
>
> **The four citations that were the most dangerous were not the failing one.**
> `:1911` was out of range and went red loudly. `:1731`, `:1870`, `:1878` and
> all seven `scripts/m2-exit-test.sh` citations are IN range on `main` and so
> resolved silently, against round 2's version of those files, pointing at lines
> that are not the lines this document is discussing. A red gate is the good
> outcome there.
>
> Citations into `test/watcher.test.ts` were left resolving, because that file is
> byte-identical between `main` and the branch, so they mean on `main` exactly
> what they mean on the branch.

**Target: branch `claude/exit-test-harness-assertion-direction`, PR #109, head
`0475d8b`.** Previous head `9b7752d`. I was dispatched against `402c534` and
re-targeted mid-task; `scripts/m2-exit-test.sh` is byte-identical at both
(`5791db626d2ff268...`), so every assertion-program measurement below stands
unchanged, and the DV-4 mutation matrix was RE-RUN against the shipping bytes at
`0475d8b` and reproduced identically. Section 4.3 records that re-run.

**Verdict: VERIFIED WITH FINDINGS.**

DV-3 is closed and I could not falsify the closure: I found FOUR further members
of the class beyond the two the round reports, and the new condition rejects all
of them on both arms while the code now on `main` accepts all of them. DV-4 is
closed for the class it was found in and NOT closed for the class the round's own
text quantifies over: three structurally different FUNCTIONAL writes to
`expectedIds` change the assertion program's verdict and leave the new guard
green, and none of the three is named in the round's not-covered section.

Toolchain for every measurement: node v26.6.0 from the scratch prefix, verified
with `node --version` in the shell that ran each command. Where a result depends
on build state or invocation, both are named.

## Findings

| id | severity | subject |
|---|---|---|
| DV3-F1 | MEDIUM | the writes pin quantifies over "every operation that WRITES the binding"; three functional write shapes escape it and flip the program's verdict |
| DV3-F2 | LOW | `main_absent_json` crashes on two manifest shapes and `--print-expect main` then exits 0 emitting invalid JSON, so the new manifest-leg check never runs on that arm (pre-existing, outside this delta, but its site WAS enumerated by the round's own derivation and not walked) |
| DV3-F3 | LOW | the success line reports the rows leg by ROW COUNT while reporting the other two legs by CONTRIBUTED IDS, under a comment saying each leg's contribution is reported |
| DV3-F4 | observation | the fourth-leg guard reddens on a block comment placed between two legs, which adds no leg |
| DV3-F5 | observation | truncation on the main arm also collapses the DERIVED ABSENT LIST, a consequence the round's item 4 does not name (equally visible on the same line) |
| DV3-F6 | LOW, outside the delta | `test/watcher.test.ts` is flaky IN ISOLATION on an idle box, so the required `suite` gate is nondeterministic; this exonerates the round and refines its explanation |

Targets 1, 2, 3 and 5 produced no finding against the round's own work. Target 4
produced DV3-F1.

## 0. The reviewer's FIRST check: is the not-covered section honest?

CLAUDE.md:326 makes the not-covered section the first thing a reviewer reads. I
read FR3.11 before touching the code and then tried to break each declaration.

| item | claim | my measurement |
|---|---|---|
| 3 | a leg that GROWS is not covered | **CONFIRMED, exactly as stated.** Two growth mutations (G1, G2 in section 4.2) flip the program's verdict and leave the guard green. Declared, not hidden. |
| 4 | TRUNCATION is not covered, only made VISIBLE | **CONFIRMED.** Section 3 measures it on both arms: accepted, and the leg count drops from 11 to 3 on the success line. Visible, not failing, not worse than declared. |
| 6 | `red-witness` does not run on this pull request | **CONFIRMED**, and section 6 records that no `gates` run exists for ANY round-3 head, so the position is worse than item 6 alone implies and the round says so itself. |

Items 3 and 4 are honest declarations. What the section does NOT declare is the
class in DV3-F1, and that is the finding.

## 1. Target 1: DV-3's closure, checked with the method that FOUND DV-3

DV-3 was found by feeding the check a REAL eleven-gate manifest rather than a
hand-built degenerate fixture, so that is the method I used.

### 1.1 The baseline is `main` itself, verified rather than accepted

The orchestrator reported mid-task that round 2 is already on `main`. I checked it
rather than taking it, because it changes what a rejection below means:

```
scripts/m2-exit-test.sh                  main=3115e7dddaf4  9b7752d=3115e7dddaf4  SAME
test/m2-exit-test.test.ts                main=e0f042056c27  9b7752d=e0f042056c27  SAME
test/behaviors.json                      main=1c8e343c00f3  9b7752d=1c8e343c00f3  SAME
.github/workflows/gates.yml              main=d87710e1880d  9b7752d=d87710e1880d  SAME
test/gate-registry.test.ts               main=4b93e1914c81  9b7752d=4b93e1914c81  SAME
$ git show origin/main:scripts/m2-exit-test.sh | sha256sum
4b607dd9696485e5ef5e68838b99d596e532f516db2aa2012630873a14b9d452
```

Confirmed. **So the "prev" column of every matrix below is not a synthetic
pre-fix state: it is the program running on `main` right now.** Every EXIT=0 in
that column is a live acceptance of a degraded manifest in production.

### 1.2 The inputs are real, and their provenance is checked rather than assumed

- Manifest: `gates.manifest.json` at head, 11 gates (manifest-self-check,
  coverage, credential-scrub, credential-token, suite, citations, scope, deploy,
  migrations, clause-map, red-witness).
- Expectations tables: produced by the SHIPPED entry point, never replicated.
  `--print-expect pr <scope-expect>` and `--print-expect main`, where the scope
  expect is itself resolved by the shipped `--resolve-scope-expect` for this
  branch name and measures `green|not-applicable`. The main arm's absent list is
  DERIVED from whichever manifest is in place, so it is regenerated per variant
  against the degraded manifest, which is what the real harness would do.
- Bundles: runner-produced, 11 rows (PR) and 6 rows (main), each with per-gate
  `result.json` directories. Provenance checked rather than trusted:

```
summary.manifestSha256 = b4af5a4b92edb9b63feb57bc658896d0baf7eaa319b84983ee61cfd7bf237705
fresh hash of manifest = b4af5a4b92edb9b63feb57bc658896d0baf7eaa319b84983ee61cfd7bf237705
```

The bundle's recorded manifest hash equals a fresh hash of the head manifest, so
it was produced against exactly this manifest.

One modelling decision, stated because it is load-bearing: when a variant degrades
the manifest, the driver rewrites `summary.manifestSha256` to a fresh hash of the
degraded manifest. That is what the real runner does, it hashes the manifest it
read. Leaving the old hash would trip check 9 first and MASK whether the
manifest-leg check fired, making every row uninformative.

### 1.3 The degradation matrix, both arms, both programs

Each variant starts from the real 11-gate manifest PLUS one newly declared gate
(`newly-declared-gate`) that no expectations table names and that no bundle
carries a record for. That is the exact class the derivation exists to close.
Full output in the scratchpad at `DVR3-degrade-matrix.txt`.

| variant | pr main | pr head | main-arm main | main-arm head |
|---|---|---|---|---|
| C0 real 11, untouched | 0 | 0 | 0 | 0 |
| C1 real 12, the new gate did not run | 1 | 1 | 0 | 0 |
| D1 `gates` restructured to an object | 1 | 1 | 2 | 2 |
| D2 `id` key renamed to `name` | **0** | **1** | **0** | **1** |
| D3 `gates` emptied to `[]` | **0** | **1** | **0** | **1** |
| D4 `gates` key deleted | 1 | 1 | 1 | 1 |
| D5 `gates` set to `null` | 1 | 1 | 1 | 1 |

C0 is the positive control and exits 0 in all four cells, so the fixtures are
wired and a rejection is a rejection of the degradation rather than of the lab.
C1 is the second control: on the PR arm both programs correctly reject a newly
declared gate that produced no record, and on the main arm both correctly ACCEPT,
because the derived absent list contains it. That asymmetry is correct behaviour,
not a gap, and I checked it rather than assuming it.

D4 and D5 reddened on both programs. I report them because a null result is
evidence: the `Array.isArray` test the round replaced already caught those two.

### 1.4 The third member, and the fourth, and the fifth

The orchestrator asked me to confirm both members the round reports and look for a
third. Only shapes that PASS `Array.isArray` and still empty the leg can be DV-3
members, because the condition on `main` is exactly `!Array.isArray(...)`. Six
were built and run:

| member | `gates` is | pr main | pr head | main-arm main | main-arm head |
|---|---|---|---|---|---|
| M1 (round 3's member a) | `[]` | **0** | 1 | **0** | 1 |
| M2 (round 3's member b) | `[{name},{id:""},{id:7}]` | **0** | 1 | **0** | 1 |
| **M3 (mine)** | an array of PLAIN STRINGS, `["suite", ...]` | **0** | 1 | **0** | 1 |
| **M4 (mine)** | an array of `null` entries | **0** | 1 | 2 | 2 |
| **M5 (mine)** | an array of NESTED ARRAYS, `[["suite"], ...]` | **0** | 1 | **0** | 1 |
| **M6 (mine)** | entries with `id: null` | **0** | 1 | **0** | 1 |

Both members the round reports are confirmed independently, and there is not a
third but a third, fourth, fifth and sixth. M3, M4 and M5 are structurally
different from M1 and M2 in a way that matters: their ENTRIES are not objects at
all, so a reader auditing the manifest by eye sees twelve gate names and the
program sees none. Every one of the six is accepted by the program on `main` and
rejected at head, with the shape named in the message:

```
M1-empty-array-round3-member-a     parses but its "gates" key is an empty array, so the manifest leg of the derived expected set is EMPTY
M2-entries-no-usable-id-member-b   parses but its "gates" key is an array of 3 entries and NONE carries a non-empty string id, so the manifest leg of the derived expected set is EMPTY
M3-array-of-plain-strings          parses but its "gates" key is an array of 12 entries and NONE carries a non-empty string id, so the manifest leg of the derived expected set is EMPTY
M4-array-of-nulls                  parses but its "gates" key is an array of 12 entries and NONE carries a non-empty string id, so the manifest leg of the derived expected set is EMPTY
M5-array-of-nested-arrays          parses but its "gates" key is an array of 12 entries and NONE carries a non-empty string id, so the manifest leg of the derived expected set is EMPTY
M6-ids-all-null-typed              parses but its "gates" key is an array of 12 entries and NONE carries a non-empty string id, so the manifest leg of the derived expected set is EMPTY
```

This is the strongest evidence in this report FOR the round: the condition it
chose (`manifestIds.length === 0`, `scripts/m2-exit-test.sh:550`) is the property
rather than a shape, and it caught four members nobody had constructed. A
condition written against shapes would have needed four more branches.

M4's main-arm cells read 2 rather than 1 for a reason that is not the leg check;
it is DV3-F2, section 5.

### 1.5 Every branch of the new message is reachable, by execution

The new check builds an `observed` string from four branches
(`scripts/m2-exit-test.sh:551`). A branch that cannot fire is the shape target 3
asks about, so I forced each rather than reading it:

```
D1-gates-restructured-to-object    parses but its "gates" key is not an array (it is object)
D2-id-key-renamed-to-name          parses but its "gates" key is an array of 12 entries and NONE carries a non-empty string id
D3-gates-emptied-to-array          parses but its "gates" key is an empty array
D4-gates-key-deleted               parses but its "gates" key is absent
D5-gates-set-to-null               parses but its "gates" key is not an array (it is null)
```

All four fire on inputs the program actually receives. No dead branch, and each
message names the shape that arrived.

**On the shipped message's own universal.** The sentence "a manifest that declares
no gates cannot certify a bundle" was FALSE when DV-3 measured it against
`!Array.isArray(...)`. Against `manifestIds.length === 0` I could not falsify it:
eleven inputs that empty the leg are all rejected, and an input that does not empty
the leg is not a manifest declaring no gates. I did not prove it over all inputs.
I record eleven members that could have falsified it and did not, and I leave the
universal open rather than calling it settled.

## 2. Target 3: auditing the new lines for the shape that produced DV-3 and DV-4

DV-3's shape is a condition narrower than the message above it. I walked the new
lines for both halves.

- `manifestIds.length === 0`, `scripts/m2-exit-test.sh:550`. The condition IS the
  property the message names. Eleven falsification attempts, none escaped.
- The `observed` ternary, `scripts/m2-exit-test.sh:551`. It is used for diagnosis
  and is not part of any condition. Measured rather than read: the binding occurs
  at exactly two sites, its declaration and its interpolation into the message.

  ```
  $ grep -n '\bobserved\b' scripts/m2-exit-test.sh
  539://       unusable-entries shape as one condition rather than four; the observed
  551:  const observed = !Array.isArray(manifestGates)
  559:  fail(null, `the manifest ${manifestPath} parses but ${observed}, so the manifest leg of the ` +
  600:    fail(spec.id, `expected status ${allow.join(" or ")}, observed ${row.status}` +
  ```

  Line 539 is a comment and line 600 is the same word in an unrelated message, so
  the binding itself is declared once and read once. All four branches are
  reachable (section 1.5).
- `expectedIds.length === 0` is unchanged in this round except for the comment
  above it. Its independent reachability is witnessed by the shipped test's
  member 4, which I ran green.
- The success line, `scripts/m2-exit-test.sh:788`, carries the one mismatch I found.

### DV3-F3 (LOW): the rows leg is reported by a different measure than the other two

The comment at `scripts/m2-exit-test.sh:782` says "EACH LEG'S CONTRIBUTION IS
REPORTED TOO", and the line prints `derived from ${manifestIds.length} manifest
id(s), ${rows.length} bundle row(s) and ${explicitById.size} table row(s)`.

`manifestIds.length` is the leg's contribution after filtering to non-empty string
ids. `explicitById.size` is a Map size, so deduplicated by id. `rows.length` is
the RAW row count: the rows leg contributes `rows.map((row) => row?.id)`, which is
filtered and deduplicated inside the loop at `scripts/m2-exit-test.sh:516`. For a
bundle carrying duplicate or idless rows the printed number exceeds the leg's
contribution, under a comment saying it is the contribution.

This is a message claiming slightly more than the value under it, the DV-3 family
one order of magnitude smaller. It weakens no check, because the line reports
rather than asserts. I did not construct a case where it misleads a reader in
practice, because a runner-produced bundle does not carry idless rows, and I
record that limit rather than implying I proved harm.

## 3. Target 2: are the two declared exclusions honest?

### Item 4, TRUNCATION. Visible, not failing, not worse than declared.

`T1` truncates the twelve-gate manifest to its first three entries. Both arms,
both programs, ACCEPTED. The head's success line makes it visible:

```
--- pr T1-truncated-to-first-3 (assert-head)
m2-assert (PR bundle): OK. 11 gate record(s) match section 1.4; derived from 3 manifest id(s), 11 bundle row(s) and 11 table row(s); ...
EXIT=0
--- main T1-truncated-to-first-3 (assert-head)
m2-assert (main bundle): OK. 6 gate record(s) match section 1.4; derived from 3 manifest id(s), 6 bundle row(s) and 6 table row(s); 6 gate(s) asserted (...); 0 asserted absent; ...
EXIT=0
```

against the control at the same head:

```
--- main C0-real-11-untouched (assert-head)
... derived from 11 manifest id(s), 6 bundle row(s) and 6 table row(s); 6 gate(s) asserted (...); 5 asserted absent: credential-token, citations, scope, clause-map, red-witness; ...
```

`derived from 3 manifest id(s)` against `derived from 11` is the visibility the
declaration claims, and it is real. Behaviour matches declaration exactly.

### DV3-F5 (observation): truncation also collapses the main arm's derived absent list

The declaration describes the harm as degrading the leg. On the main arm it
degrades a second thing it does not name: the absent list is DERIVED from the
manifest by `main_absent_json` (`scripts/m2-exit-test.sh:225`), so a truncated
manifest also empties it, and the five gates the main bundle does not run stop
being asserted absent. The captures above show `0 asserted absent` where the
control shows `5 asserted absent: credential-token, citations, scope, clause-map,
red-witness`.

An observation and not a finding, because it is equally VISIBLE on the same
success line, which is the standard the declaration sets for itself. It widens the
declared consequence rather than contradicting it.

### Item 3, a leg that GROWS. Uncovered, exactly as declared.

Measured in section 4.2 as G1 and G2. Both leave the guard green and both flip the
program's verdict, so they are functional and unguarded, as the item says.

## 4. Target 4: DV-4's closure, and the class it does not close

### 4.1 The method

The fourth-leg guard is `test/m2-exit-test.test.ts:1731` onward. I mutated
`scripts/m2-exit-test.sh` in a dedicated worktree with anchored SINGLE
replacements, ran the guard, and restored from saved pristine bytes. Two different
questions are measured per variant:

- **guard**: does the shipped guard redden?
- **program**: does the mutation actually admit an id into the derived expected
  set, measured by running the assertion program extracted from the MUTATED
  harness against the real PR bundle? A guard that reddens on a decoration proves
  nothing, and a guard that stays green on a decoration is not a defect. Without
  this column every row would be ambiguous.

The mutator's own negative control runs first, so a silently missing anchor cannot
read as a clean result. Pristine and restored sha256 are identical.

### 4.2 The matrix, against the shipping bytes at `0475d8b`

```
pristine sha256 5791db626d2ff26864354ad07c747fc1a1d0739d200baef80b3fe9a9bf313dfc
=== negative control for the mutator itself ===
mutator control OK: ANCHOR NOT UNIQUE (0 occurrences), aborting
PRISTINE-control           guard=GREEN (blind)   program: EXIT=0 asserted=11
W1-extra-push              guard=RED  (exit 1)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
W2-splice                  guard=RED  (exit 1)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
W3-index-assignment        guard=GREEN (blind)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
W4-alias-then-push         guard=GREEN (blind)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
W5-push-apply              guard=GREEN (blind)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
W6-newline-split-push      guard=RED  (exit 1)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
G1-rows-binding-grows      guard=GREEN (blind)   program: EXIT=1   - [dvr3-extra-leg-id] expected status green, observed undefined This gate has NO row in the expectations tab
G2-manifestIds-binding-grows guard=GREEN (blind)   program: EXIT=1   - [dvr3-extra-leg-id] gates.manifest.json declares this gate and the bundle carries NO record for it, and th
N1-reformatted-union       guard=GREEN (blind)   program: EXIT=0 asserted=11
N2-comment-between-legs    guard=RED  (exit 1)   program: EXIT=0 asserted=11
restored sha256 5791db626d2ff26864354ad07c747fc1a1d0739d200baef80b3fe9a9bf313dfc
```

The exact mutations:

| variant | the edit |
|---|---|
| W1 | `expectedIds.push("dvr3-extra-leg-id");` before the derivedIds line |
| W2 | `expectedIds.splice(0, 0, "dvr3-extra-leg-id");` |
| W3 | `expectedIds[expectedIds.length] = "dvr3-extra-leg-id";` |
| W4 | `const alias = expectedIds;` then `alias.push("dvr3-extra-leg-id");` |
| W5 | `Array.prototype.push.apply(expectedIds, ["dvr3-extra-leg-id"]);` |
| W6 | `expectedIds` and `.push("dvr3-extra-leg-id");` split across two lines |
| G1 | the `rows` BINDING grows: `const rows = [...(Array.isArray(summary.gates) ? summary.gates : []), { id: "dvr3-extra-leg-id" }];` |
| G2 | the `manifestIds` BINDING grows: `.concat(["dvr3-extra-leg-id"])` appended to its filter |
| N1 | the union reformatted across five lines, no leg added |
| N2 | a block comment `/* the rows leg */` between two legs, no leg added |

### 4.3 The re-run against the final bytes

I was dispatched against `402c534` and the matrix was first run there. `de2d806`
then edited one comment line inside this very guard. The matrix was re-run at
`0475d8b` against `test/m2-exit-test.test.ts` sha256 `4baa388bda4016c8...` and
produced the eleven rows above, identical row for row to the `402c534` run. The
implementer's claim that every witness was re-run against the shipping bytes holds
for this guard, and DV3-F1 is a finding about the shipping bytes, not about a
superseded head.

The comment `de2d806` corrected reads, in full, "So every operation that WRITES
the binding is pinned too." (`test/m2-exit-test.test.ts:1870`). The correction
changed "statement ... by its own text" to "operation" and **preserved the
universal**, which is the half DV3-F1 is about.

### 4.4 What IS closed

W1, W2 and W6 confirm the round's own matrix. W6 confirms the whitespace
insensitivity the round added after measuring a line-based version walk past a
split write. N1 is the control that matters in the other direction: a five-line
reformat adds no leg and stays green, so the guard is not a blanket trip on the
text moving.

The element-list half of DV-4 is closed. I did not find a spelling INSIDE the
array literal that escapes it.

### 4.5 DV3-F1 (MEDIUM): the writes pin quantifies over a class it does not recognise

W3, W4 and W5 each add a FUNCTIONAL leg: the id `dvr3-extra-leg-id` enters the
derived expected set, is asserted under the strict default, and the program's
verdict flips from EXIT=0 to EXIT=1 on byte-identical fixtures. The shipped guard
exits 0 on all three.

Three structurally different members, which is past the CLAUDE.md:350 bar by
itself:

- **W3** writes through an INDEX rather than a method, so no member name follows
  the identifier.
- **W4** writes through an ALIAS, so the mutating call does not mention
  `expectedIds` at all.
- **W5** writes through `Function.prototype.apply`, so the identifier appears as
  an ARGUMENT rather than as a receiver.

The condition is a member-name lookup against a fixed list at
`test/m2-exit-test.test.ts:1878` (`push`, `splice`, `unshift`, `pop`, `shift`,
`sort`, `reverse`, `fill`, `copyWithin`) plus `++`, `--` and `=`, applied to the
token following each occurrence of the identifier. W3's occurrence is followed by
`[`, W4's mutating call never names the identifier, W5's occurrence is followed by
`,`.

**Why this is a finding and not a declared limit.** The comment at
`test/m2-exit-test.test.ts:1870` states the universal: "So every operation that
WRITES the binding is pinned too." The failure message at
`test/m2-exit-test.test.ts:1911` states another: "the derived expected set is
written by an operation this suite does not know about." FR3.5 states a third.
The round declares TWO neighbouring gaps, a second union in another program and a
leg that grows, and neither covers a direct write to `expectedIds` in this
program. I searched the whole round-3 region of the work history for the shapes:

```
$ awk 'NR>=3372' delivery/work-history/exit-test-assertion-direction.md \
    | grep -niE 'index assignment|expectedIds\[|alias|\.apply\(|push\.call|Reflect|concat'
(no output)
```

The round's own re-run matrix names four write shapes and all four are `push` or
`splice`. Its claim grep restated one sentence to say "Four write shapes are
measured, which is not a proof over all forms", which is honest about the
MEASUREMENT, but the assertion's comment and its message still quantify over all
forms, and those are the artifacts a later reader trusts. The registered behaviour
`m2-exit-union-sources-named-by-this-suite` still ends "so a new leg cannot arrive
unprobed", and W3, W4 and W5 are three ways a new leg arrives unprobed.

This is the DV-4 shape one round later and one abstraction across. DV-4 was "the
condition recognised one spelling of the class it quantified over". The fix
widened the spellings recognised inside the array literal, and the second
assertion, added in the same fix, repeats the original error against a different
class.

**Severity MEDIUM, and the reasoning rather than the label.** It is a test guard,
not shipped kernel code, and the escaping spellings are less idiomatic than
`.push`, so the chance a future implementer trips it is lower than DV-4's. Against
that: it is the same defect shape in the same file one round later, it was
introduced BY this round, the universal is written into a registered behaviour and
two comments, and this repository's recorded pattern is that a guard whose
condition does not test the property it names is green and worthless. I would not
defend calling it LOW.

**What would close it.** Either restate the comment, the message and the
registered behaviour to the class the condition actually recognises, naming index
writes and aliasing as uncovered; or widen the condition. Which of the two is the
implementer's call. I note only that the first is cheap and the second may need a
parser, and that this repository has twice paid for choosing to widen a text scan
instead of narrowing a claim.

### 4.6 DV3-F4 (observation): a comment between two legs reddens the guard

N2 inserts `/* the rows leg */` between two legs. It adds no leg, the program's
verdict is unchanged (EXIT=0, 11 asserted), and the guard reddens. The element
splitter is comment AWARE, so a comment cannot split an element or end the
literal, but the element text it slices still INCLUDES the comment and the
comparison is against pinned bare text.

The mechanism is measured rather than inferred. Under N2 the splitter still
produced a three-element list, and the comment travelled inside one element's
text:

```
Derived from the harness: ["...explicitById.keys()","...manifestIds","/* the rows leg */ ...rows.map((row) => row?.id)"]
```

So the comment neither split an element nor ended the literal; it survived into
the compared text and failed the set equality.

This fails safe and is not a defect in the property guarded. I record it because a
maintainer who annotates the union gets a red gate whose message says a leg
arrived when none did, and because it is the counterpart to N1: whitespace is
normalised out of the comparison and comments are not.

## 5. DV3-F2 (LOW): the main arm's expectations derivation exits 0 on invalid JSON

Found while running D1 and M4 on the main arm, where both programs exit 2 rather
than 1. The cause is not in the assertion program:

```
$ bash scripts/m2-exit-test.sh --print-expect main     # manifest gates is an object
EXIT=0
...
  "absent": 
}
--- stderr:
TypeError: (manifest.gates ?? []).map is not a function
$ node -e 'JSON.parse(...)'
DOES NOT PARSE: Unexpected token '}', ..."absent": \n}" is not valid JSON
```

and for M4, an array of nulls, the same route with a different throw:

```
TypeError: Cannot read properties of null (reading 'id')
```

`main_absent_json` (`scripts/m2-exit-test.sh:225`) crashes, command substitution
swallows its exit status, the placeholder substitutes to nothing, and
`--print-expect main` exits 0 emitting a document that is not JSON. The assertion
program then exits 2 at "expectations does not parse", and the NEW manifest-leg
check never runs on that arm for those two shapes. That is a demonstration rather
than a deduction: the D1 and M4 main-arm cells in sections 1.3 and 1.4 read EXIT=2
for BOTH programs, and exit 2 is the expectations-parse exit, which the assertion
program takes before reading the manifest at all.

The second throw is the sharper one: the assertion program reads the same leg with
`gate?.id` and `main_absent_json` reads it with `gate.id`. Two readers of one
structure disagree about null tolerance, so an input the fixed check handles
cleanly kills the other reader first.

Two things bound this:

- **It is not silent.** `run_main_bundle` ends with
  `if [ "${ASSERT_EXIT}" -ne 0 ]; then die ...` at `scripts/m2-exit-test.sh:1189`,
  so the harness aborts. What is lost is the diagnosis: the operator is told the
  main bundle does not match section 1.4 with exit 2, when the cause is a crashed
  derivation two functions away.
- **It is PRE-EXISTING and outside this delta**, byte-identical between `9b7752d`
  and head:

```
$ diff <(awk 'NR>=219 && NR<=236' DVR3-prev/scripts/m2-exit-test.sh) \
       <(awk 'NR>=219 && NR<=236' DVR3-head/scripts/m2-exit-test.sh)
main_absent_json IDENTICAL between 9b7752d and 402c534 (pre-existing, not in this delta)
```

I raise it anyway because the round's own enumeration surfaced the line twice.
Its published output lists `scripts/m2-exit-test.sh:232`, the filter inside
`main_absent_json`, under heading A (type-predicate recognitions) and again under
heading C (membership filters). Its walk then covered only the six rejections
stating a universal, so this site of the same mechanism, reading the manifest leg,
was enumerated and not walked. That is a gap in the derivation, not a defect the
round introduced.

I looked for a SILENT version and did not find one: `gates` absent, `null`, `[]`,
entries without ids, entries that are strings, and entries that are nested arrays
all leave `main_absent_json` returning `[]` without crashing, and in every one of
those the new manifest-leg check fires (D2 to D5 and M1, M2, M3, M5, M6 main-arm
head cells are all EXIT=1). The crashing shapes are non-array `gates` and array
entries that are null.

## 6. Target 5: the `suite` RED, settled further than the round settled it

The round attributed a local `suite` RED to a real-clock flake in
`test/watcher.test.ts` under load average 2.89 and said plainly that the
attribution "is a reading, not a demonstration". I was asked to settle it on an
unloaded box, bounded.

**The complete sentence for my suite result**, all three axes named: head
`0475d8b`, node **v26.6.0**, `dist/` **built** (`npm run build` EXIT=0, `git
status --porcelain` empty afterwards), invocation **`npm test`**:

```
i tests 596
i suites 0
i pass 595
i fail 1
i cancelled 0
i skipped 0
i todo 0
i duration_ms 225488.595922
npm test EXIT=1
```

596 tests, 595 pass, 1 fail, **0 skipped**, EXIT=1. The failure is
`a resident watcher keeps running and backs off with growing beacon gaps` at
test/watcher.test.ts:293, `expected at least 4 beacon writes, saw 3`. Load average
at the start of that run was **0.27**, so it is not the round's load explanation.

I then ran the file ALONE five times, nothing else running:

```
watcher.test.ts alone, run 1: EXIT=0   tests 23 pass 23 fail 0
watcher.test.ts alone, run 2: EXIT=1   tests 23 pass 22 fail 1
watcher.test.ts alone, run 3: EXIT=0   tests 23 pass 23 fail 0
watcher.test.ts alone, run 4: EXIT=0   tests 23 pass 23 fail 0
watcher.test.ts alone, run 5: EXIT=0   tests 23 pass 23 fail 0
```

Run 2 failed a DIFFERENT test, `the heartbeat schedule is on disk and shared by
single passes` at test/watcher.test.ts:432, `0 !== 3`.

### DV3-F6 (LOW, outside the delta): the flake is real and is not load

Three distinct real-clock tests in `test/watcher.test.ts` have now been observed
failing: two named by the round and one named here. One of them failed in an
ISOLATED single-file run, which removes suite parallelism and external load as
necessary conditions. All three assert a COUNT of writes observed inside a
wall-clock deadline, which is the shape that fails when a process is descheduled.

For this round the result is exculpatory and I want that stated plainly:
`test/watcher.test.ts` is byte-identical between `origin/main` and the branch head
(blob `9996fa70762dd5845bde0002a0f6cfff5258446d` on both), and the branch does not
touch it in any commit. The round's attribution was correct; its explanation was
incomplete, and load is not the mechanism.

The process consequence belongs to whoever merges rather than to this round: the
`suite` gate is `required`, and a required gate that fails roughly one run in five
means a red `suite` on this branch carries no information until the failing test
name is read. It should not be re-litigated as a defect in this change, and it
should not be averaged away either.

## 7. Independent check of the round's merge-path claim

The round's FR3.18 claims the delta applies cleanly to `main` and yields
byte-identical files. That claim decides what happens to this pull request, so I
checked it rather than reading it. `main` had moved again since the round measured
it, to `9781212`:

```
$ git diff 9b7752d..0475d8b -- scripts/m2-exit-test.sh test/behaviors.json \
    test/m2-exit-test.test.ts delivery/work-history/exit-test-assertion-direction.md > round3.patch
2099 lines
$ git worktree add --detach <probe> origin/main    # HEAD is now at 9781212
$ git apply --check round3.patch
git apply --check EXIT=0
$ git apply round3.patch
applied (3 trailing-whitespace warnings, no errors)

scripts/m2-exit-test.sh        probe=5791db626d2ff268 branch=5791db626d2ff268 SAME
test/behaviors.json            probe=71205e1b55027221 branch=71205e1b55027221 SAME
test/m2-exit-test.test.ts      probe=4baa388bda4016c8 branch=4baa388bda4016c8 SAME
```

Confirmed, and confirmed against a NEWER `main` than the round measured against,
which is a stronger result than the round's own. The three trailing-whitespace
warnings are `git apply` diagnostics on context, not errors, and the resulting
bytes are identical.

## 8. What MY derivation did NOT cover

A search whose scope is wrong returns an empty result indistinguishable from an
absence of defects, so this is the section to read before trusting any row above.

1. **I did not run the real harness end to end.** Every assertion-program
   measurement drives the program EXTRACTED from the heredoc, against
   runner-produced bundles from a previous round rather than bundles I generated.
   The extraction is mechanical (an awk range between the heredoc delimiters) and
   the expectations tables come from the shipped entry point, but a defect in the
   shell code AROUND the heredoc is outside everything I measured, except the one
   path in DV3-F2 that I drove through `--print-expect`.
2. **The bundles are inherited from the round's own lab directory.** I verified
   their `manifestSha256` against a fresh hash of the head manifest and that is
   the whole of my provenance check. I did not re-derive their per-gate
   `result.json` contents or re-run the gates that produced them. If those bundles
   were fabricated rather than produced, my section 1 would not detect it, and I
   note that the hash check makes fabrication harder rather than impossible.
3. **My degradation set is fifteen variants and it is not exhaustive.** I chose
   shapes an ordinary edit produces. A manifest degradation nobody has thought of
   is outside it, and the leg check's universal is unfalsified by me rather than
   proved.
4. **The DV-4 mutation set is eleven variants.** Three escapes found does not mean
   three exist. I did not enumerate the write forms systematically and used no
   parser; I reasoned from the condition to candidate spellings and tested those.
   There may be more.
5. **I did not run any `gates` registry gate.** No `gates` run exists for any
   round-3 head and the round explains why (the pull request is conflicted).
   Nothing in this report is a gate result.
6. **I did not verify rounds 1 and 2**, nor the 3370 lines of work history before
   the round-3 sections, beyond the ones I cite.
7. **I did not examine `.github/workflows/gates.yml` or `test/gate-registry.test.ts`**,
   both of which the branch changes relative to `main` though this round's delta
   does not touch them.
8. **I did not verify the round's own line-number citations.** It records that
   eleven of twenty were wrong on a first pass and were corrected; I verified the
   ones I cite myself and no others.
9. **No `push` arm, and no post-merge run.** Everything here is pre-merge, and
   CLAUDE.md:436 is discharged by none of it.
10. **Everything ran on node v26.6.0 only.** I repeated no matrix on the default
    toolchain, so a toolchain-dependent difference in any of them is unmeasured.
11. **The suite result is ONE `npm test` run plus five single-file runs.** I did
    not run the bare `node --test` invocation at the repository root, so I have no
    number for the 508-style invocation at this head and do not offer one.

## 9. My own pre-submission checks

**TRANSLITERATION, DECLARED.** The suite capture in section 6 is a verbatim
`npm test` summary, and Node's test reporter prints U+2139 at the head of each
summary line, which fails the non-ASCII check. Per the binding resolution in
CLAUDE.md, the capture is transliterated rather than hand-written or pasted raw:
**U+2139 (8 occurrences) is rendered as `i`. Nothing else in any captured output
in this document was changed.** The check below was run before and after and the
counts come from the file itself:

```
$ python3 -c "..."   # count non-ASCII codepoints in this file
non-ASCII codepoints present: {'0x2139': 8}
replaced U+2139 -> 8 occurrences; file is now pure ASCII
```

**Authored bytes**, with the tree staged, because the script exits without
checking on a dirty index:

```
$ git add -A && node scripts/check-authored-bytes.mjs
EXIT=0
```

**The claim grep** over this document, both the alternation the rules file
prescribes and the `cannot X` forms it is blind to, are recorded with their
dispositions in the commit that carries this file.

**Citations.** Every `path.ext:LINE` token here was resolved against the worktree
at `0475d8b`, or against `CLAUDE.md` in the repository root, and the target line
printed.
