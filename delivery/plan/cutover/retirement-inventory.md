# The retirement inventory: one row per rule, and a checker that reddens

- phase: M4-P23, spec at delivery/plan/kernel-plan-m4.md:3133
- date: 2026-09-16
- machine-readable rows: `delivery/plan/cutover/retirement-inventory.json`
- the guard: `scripts/check-retirement-inventory.mjs`, exit nonzero while any
  row is unresolved
- this document: the reasoning, the derivation, and what the guard does NOT
  reach

## What is being retired, and why the count is derived

Three roots retire at cutover: `CLAUDE.md`, the `.claude/skills` tree (four
skill files and two reference briefs), and `.claude/orchestrator-next.mjs`.
That set is the intake's, not this phase's, and only the first is citable from
a linted document, which is why every reference to the other two in this
document sits in backticks.

**The row count is DERIVED. Nothing here was counted by hand.** The extraction
is a committed command with a declared grammar:

```
node scripts/check-retirement-inventory.mjs --extract
```

A rule anchor is a line at COLUMN ZERO that is one of: a markdown heading, a
top-level enumerated item (`1.`, `3b.`), a top-level bullet, a bolded lead-in
paragraph, or, in the JavaScript root, a top-level function or binding. Four
markdown kinds with no exceptions. Measured over the six markdown roots: a
headings-only grammar finds 59 rules where the shipped one finds 264, and in
`CLAUDE.md` alone it finds 24 of 133. A grammar of headings and numbers still
drops every bolded lead-in and the seven `## Never` bullets, which are the most
binding lines in the file. Every line of every root falls inside exactly one
anchor's span, so a rule cannot hide between two anchors.

Measured at this head:

| root | rule anchors |
|---|---|
| `CLAUDE.md` | 133 |
| `.claude/skills` (6 files) | 131 |
| `.claude/orchestrator-next.mjs` | 24 |
| total | 288 |

**The JavaScript root moved from 16 anchors to 24 while this phase was in
review, and that is the checker doing its job rather than failing.** A harness
pull request rewrote `.claude/orchestrator-next.mjs` on the default branch: it
added `deriveMilestone`, `worktreesByBranch`, `gitTry`, `gitCount`,
`branchNames`, `WORKTREES`, `hardErrors`, `unreplicated` and `watched`, and it
removed the `SCRATCH` constant. The checker went red with nine orphaned rules
and one stale row, which is exactly the pair of directions the set-equality
check exists to report. The nine are classified in the section below and the
stale row is retired rather than deleted.

The checker requires SET EQUALITY by id, in both directions, between that
extraction and the JSON rows. A count comparison would be weaker: it would pass
when one rule gained a row and another lost one. The full extraction output is
in the work history at `delivery/work-history/m4-p23.md`, which is where the
phase section asks for it.

## The two axes, and why one word was not enough

The dispatch asked for `PORTED`, `GAP` or `FALSE`. The phase section at
delivery/plan/kernel-plan-m4.md:3160 asks for a closed vocabulary of `PORT`
with a kernel artifact, `DELETE` with a reason, or `KEEP` with the DR-0029
side. These are two different questions and collapsing them loses information:
`PORTED` is a FINDING about the world as it is, and `PORT` is a DISPOSITION
about what happens next. A rule can be a GAP today and still be KEEP, because it
belongs to this project's predicate rather than to the kernel's process
(DR-0029 part 1, delivery/decisions/DR-0029-the-ownership-boundary-and-the-applicability-envelope.md:38).

Every row carries both, and the checker enforces the cross-consistency that
makes them non-redundant:

- `PORTED` if and only if `PORT`. A PORT row names an existing destination and
  carries a probe and a negative witness.
- `GAP` rows carry a `gap` field naming what kernel destination is missing, and
  are `KEEP` (with a side) or `DELETE` (with a reason).
- `FALSE` rows carry a `correction` saying what this phase changed, and their
  `verified-by` command is the REFUTATION: it demonstrates that the world
  contradicts the rule.

Totals: 196 PORTED, 88 GAP, 4 FALSE. Dispositions: 196 PORT, 75 KEEP, 17
DELETE. Of the KEEP rows, 46 are process-side and 29 predicate-side.

Those totals moved by one in the fix round (the C-3 row was a GAP/KEEP and is a
PORTED/PORT) and by eight more in the harness-change pass: eight of the nine new
JavaScript anchors are PORTED/PORT and the ninth is a GAP/DELETE, while the
retired `SCRATCH` row takes a GAP/DELETE away, so GAP and DELETE both hold
still at 88 and 17. Every number in this paragraph is derived by reading the
JSON rather than counted by hand, and the checker refuses the document if any
row's two axes disagree.

**NOTHING DERIVES THESE NUMBERS AT CHECK TIME, AND THAT IS WHY THEY KEEP GOING
STALE.** The fix round updated six of them and missed two, in this file, which a
delta verifier then measured (finding V-3). This pass recomputed EVERY number in
this document from the JSON rather than adjusting the ones it expected to have
moved, and the ones that moved are named where they sit. The checker reddens on
a stale ROW and says nothing about a stale SENTENCE, so the recompute is a
procedure a reader has to run, not a guard. Running it is one command against
the JSON and it belongs in any future round that touches a row.

## The four FALSE rows

**1. Scope declaration grants no longer need their own pull request.** This is
the one the phase section names, and it is the worked example for the whole
pass. `CLAUDE.md` said a declaration amendment needs its own pull request
because the scope gate reads the declaration from the merge base only.
src/gates/scope.ts:110 records that M3-P11 changed exactly that: the
declaration is read from BOTH the merge base and the head, an addition on the
head is allowed, and the protection is that the addition is printed by name.
Corrected in this phase at CLAUDE.md:806. Carried across uncritically, this
would have become a false constraint inside a kernel brief, where no scope gate
exists to contradict it.

**2. `schemas/`, `roles/` and `tuition/` are not placeholders.** The rule said
they were reserved for M3 deliverables and must not be populated early. M3
shipped them: `roles/` holds 7 entries, `schemas/` 17 and `tuition/` 17.
The rule has been false since M3 landed and it told every implementer since not
to touch trees that were already full. Corrected at CLAUDE.md:61.

**3. Phases are not sequential until M5.** The phase-delivery skill's
pre-dispatch checklist still says so. DR-0011 turned parallelism on where a
recorded pre-pass proves the phases disjoint, and M2, M3 and M4 have all run
concurrent waves; this phase was dispatched in one
(delivery/plan/m4-conflict-pre-pass.md:64). `CLAUDE.md` already carries the true
rule, so the correction is recorded here and the false text dies with the tree
in M4-P25. The skills tree is outside this phase's files-to-touch list and was
deliberately not edited.

**4. Merge authority is not unconditionally the owner's.** The same skill's
merge step says merge only when the owner has approved. DR-0012 delegated merge
authority to the orchestrator conditional on dual cross-model clean review, and
`CLAUDE.md` says so. Same treatment as row 3: recorded, not edited.

Rows 3 and 4 are why this inventory exists at all. Both rules are in the tree
that M4-P25 deletes, both would have been read by a migration as prose worth
carrying, and neither is true.

## Where the ported rules go

196 rows PORT, and the destinations concentrate rather than scatter:

| destination artifact | rows |
|---|---|
| `AGENTS.md` (orchestrator brief) | 68 |
| `roles/implementer.md` | 56 |
| `checklists/clean-room.yaml` | 14 |
| `roles/investigator.md` | 10 |
| `checklists/hazard-review.yaml` | 9 |
| `templates/warnings.md` | 7 |
| `src/gates/scope.ts` | 6 |
| `assurance-modes.yaml` | 4 |
| everything else (14 artifacts) | 25 |

**The column is counted per ARTIFACT and it sums to 199, not 196.** Three rows
(the `gitTry` family) name two destinations, `roles/investigator.md` and
`checklists/clean-room.yaml`, because the rule is carried by a brief clause and
by the checklist probe that tests for it, and neither alone is the whole port.
Counting per destination STRING instead would give those three a row of their
own and hide them from both artifact totals, which is worse. The earlier version
of this table could count either way because every destination then named one
artifact.

The shape is worth stating: the supervision and merge rules are the
orchestrator brief's, the working rules are the implementer brief's, the review
rules are checklist probe ids, and a handful of rules live in CODE. The citation
grammar is the interesting case: it is enforced at src/gates/citations.ts:104,
and it is ALSO stated in three role briefs, at roles/investigator.md:129,
roles/plan-writer.md:90 and roles/clean-room-reviewer.md:121. That is a stronger
port than the row claims, and it is recorded here because my first reading of it
("not prose anywhere in the kernel") was wrong: a `grep -rniE 'path.ext|citation'`
over the kernel's prose trees found all three.

## The gaps, which are the part a migration would have lost

Twenty-four groups of rules have no kernel destination. The three the intake
predicted are confirmed by command, and the pass found more. (Twenty-six before the fix round, which moved
the C-3 group out; twenty-five until the harness change retired the
`next-hardcoded-scratch` group with the constant it named.)

**The three loop gaps.** Open the pull request, merge, and the stop condition.
`grep -c 'pr create' src/cli.ts src/commands/spawn.ts src/commands/gates.ts`
exits 1: the kernel opens nothing. M4-P24 owns all three; until it lands, "the
orchestrator does not decide when it is finished" has no destination at all,
which is the largest single gap here and has three recorded violations behind
it.

**C-3 WAS LISTED HERE AS A GAP AND THAT WAS FALSE. The correction, and the
mechanism behind it.** This paragraph used to read "C-3 is enforced in shipped
code and appears in no brief, no checklist and not in the mechanism index". The
first two thirds of that are wrong. AGENTS.md:497 states it: "C-3 forbids a
kernel COMMAND from putting long-running work out of the operator's sight
without being told to", and schemas/assurance-modes.schema.json:37 binds a
shipped schema to it. The row's `verified-by` searched five files for the
literal token `auto-background`, exited 1, and the exit was read as the RULE
being absent when it was only the WORD. Searching the constraint id finds it at
once.

The mechanism, which is why this is written up rather than quietly edited: a
nonzero exit proves that A TOKEN is absent from THE FILES THAT COMMAND NAMED,
and the prose beside it claimed the rule was absent from the kernel. Nothing
compared the two scopes. The checker now does, at
scripts/check-retirement-inventory.mjs:652: every absence claim is re-run
case-insensitively over a declared wider surface AND over the row's own files,
and a hit must be named and read before the row can stand. C-3 is now a
PORTED/PORT row with `AGENTS.md` as its destination.

**What survives of it is narrower and is a gap.** C-1 and C-2 have entries in
tuition/mechanism-index.yaml and C-3 has none, and the AGENTS.md statement is
incidental: it is made to disambiguate C-3 from arming a watchdog rather than as
a standalone rule. That is recorded here rather than as a GAP row, because the
rule IS carried and a GAP row would say it is not.

**C-1 nearly became a false gap in this very document, and the correction is
recorded rather than quietly applied.** My first pass called C-1 a GAP after
searching the briefs and the checklists. It is in tuition/mechanism-index.yaml:45,
under the key `append-only-log`, and roles/implementer.md:175 routes an
implementer to that index before writing code that uses the mechanism. The
search scope was wrong, not the kernel. It is the exact failure the fix-round
contract's third item exists against, committed by the person writing the
inventory that is supposed to prevent it.

**The identifier register.** Thirteen rows: `SC-nnn`, `R-nnn`, `DR-nnnn`,
`T-nnn`, `A-n` and the never-reuse-a-retired-id rule. The kernel has finding ids
and tuition ids and no cross-scheme register. This one has been paid for twice
in this repository.

**Owner-facing register.** Seven rows about how an owner-facing message is
written, in plain language, surfacing only decisions. The kernel has a
final-report shape and an escalation threshold and nothing about the register.

**Document precedence.** Four rows. `AGENTS.md`'s mandated-reading list is an
order of READING, not of AUTHORITY, and nothing says which document wins.

**Smaller, and worth not losing:** the CI-conclusion recursion (recording the
observed green produces a new head with no run), local-green-before-opening, the
salvage rule to MEASURE the leavings before committing them, and the retired
script's own false-green guard (an empty derivation is a failure, not an empty
milestone).

Seventeen rows DELETE. Ten of them name harness tools the kernel does not model,
and three are the retired script's merged-ness predicate, which must NOT be
ported: it reports a branch whose commits landed inside another branch's pull
request as OPEN forever.

## The harness change: nine new rules, and one row retired

**The question this forced, and the answer, because a reader will ask why.**
Nine of the ten unresolved items were ordinary JavaScript declarations in a
harness script that ships in no package and is in no gate registry. The cheap
move is to narrow the extraction so a function declaration in that root is not a
rule. It is refused, for four reasons, and the fourth is the one that decides it.

1. **The inventory already carries this class, with a written reason.** `git`,
   `onMain`, `done`, `pushedNotMerged`, `notStarted`, `lines`, `next` and
   `exitCode` are rows today, GAP/DELETE, under "carried as rows because the
   grammar covers every top-level declaration". Narrowing would have to delete
   eight rows to stay consistent with itself.
2. **"Not a kernel deliverable" does not separate anything.** It is equally true
   of `CLAUDE.md` and of the `.claude/skills` tree. All three roots are harness;
   retiring harness into kernel artifacts is the whole job.
3. **The redness IS the mechanism.** "Every future edit to that file reddens the
   checker until someone updates the catalogue" is the guarantee, not the cost.
   It is how this stale catalogue was found at all, and the cost measured here is
   nine JSON rows.
4. **No syntactic predicate separates a rule from plumbing in that root.**
   `const MILESTONE`, `const STALE_SECONDS`, `newestMtime` and
   `derivePhaseNumbers` are rules, three of them PORTED with kernel
   destinations, and they are indistinguishable as SYNTAX from `gitTry`. Any
   narrowing that drops the second set drops the first. The separation is a
   reading, so it belongs in the row's `disposition` and `reason`, which is
   where it already is. A guard narrowed until its condition no longer tests
   the property it claims is this repository's most-repeated defect, and
   narrowing here would be an instance of it.

How the nine landed: eight PORTED/PORT and one GAP/DELETE.

| anchor | disposition | destination or reason |
|---|---|---|
| `deriveMilestone` | PORT | `roles/implementer.md`, the derive-never-pin rule; the script's own comment says it is the same rule as `derivePhaseNumbers` |
| `worktreesByBranch` | PORT | `AGENTS.md`, T-014's measure-do-not-predict clause |
| `WORKTREES` | PORT | same clause; it is the call site |
| `gitTry` | PORT | `roles/investigator.md` and `checklists/clean-room.yaml`: a count that could not be taken is not a zero |
| `gitCount` | PORT | same |
| `hardErrors` | PORT | same; this binding is the register of counts that failed |
| `unreplicated` | PORT | `AGENTS.md`, the pushed half of the durability rule |
| `watched` | PORT | `AGENTS.md`, an empty watch set is an absence of evidence, not health |
| `branchNames` | DELETE | plumbing, a branch listing; the rule its comment states is carried by the `gitTry` row rather than double-counted here |

### The retired row, and why a register rather than a deletion

`next-script:scratch` tracked `const SCRATCH =`, a hard-coded scratchpad path.
The harness change replaced it with `worktreesByBranch()`, which reads
`git worktree list`, so the anchor is gone and the row is unresolvable. Deleting
it silently would lose two things: that the row existed, and that the defect it
named was closed and by what.

So the JSON gained a `retired` array and the checker gained
`checkRetiredEntry`. A retired entry carries the id, the anchor text that is
gone, the date, a reason, and an optional `superseded-by`. **The register is
checked in two directions rather than stored.** A retired id whose anchor
becomes extractable AGAIN is red, so retirement cannot be used to keep a live
rule out of the inventory; and a `superseded-by` that names a row which is not
in the inventory is red, because a dangling pointer reads as a settled hand-off.

**What is NOT enforced, said here so nobody reads the register as stronger than
it is.** The checker has no memory of the previous inventory, so a row deleted
along with its anchor leaves rows and anchors consistent and nothing reddens.
Moving a row into `retired` instead of dropping it is a CONVENTION whose check
is the reviewer reading the diff. Everything above is about an entry that
already exists.

Stated exactly, because the row's gap is easy to over-read as closed: the
SCRIPT no longer predicts a working directory, and the KERNEL still does not
derive one. `grep -c 'scratchpad' src/fleet.ts src/cli.ts` still exits 1. The
gap moved to `next-script:worktreesbybranch` and M4-P24 still owns it.

## What the checker enforces, and what it does not

Enforced, by execution, on every run:

1. set equality between the derived anchors and the rows, both directions;
2. the closed vocabularies and the cross-axis consistency, including a GAP row
   naming what kernel destination does not exist and a FALSE row saying what
   this phase corrected;
3. every row's `verified-by` command RE-RUN, with the recorded exit code
   reproduced;
4. that command naming at least one existing path OUTSIDE the three retirement
   roots, so a row cannot re-verify itself against the document it is retiring;
5. every PORT row's `negative-witness` RE-RUN, required to exit nonzero, to
   carry the same probe as the verified-by command, and not to be a copy of it;
6. at least one row marked FALSE;
7. a crash or an unreadable input exits 2 and is never rendered as a pass;
8. every `retired` entry, in both directions: its rule must not be extractable
   again, and its `superseded-by` must name a row that exists.

Criterion 7 of the phase section (nothing is deleted from the three roots in
this phase) needs no separate mechanism: a deletion removes an anchor, and the
row that survives it goes red as stale.

**NOT enforced, and this is the residue rather than a detail.** The pair
"probe found in the destination, probe absent from a same-kind sibling" proves
the destination carries the named obligation and that the probe discriminates
between artifacts. It does NOT prove the destination's clause is as STRONG as
the retired rule. That comparison is a reading, it is recorded per row in the
`note` field, and it is the thing a reviewer should spot-check. The claim-grep
row is the case where the mechanical form is at its strongest, because
roles/implementer.md:295 carries the grep PATTERN literally rather than a
description of it, so "not weaker" is content identity. Most rows are not that
lucky.

Also not reached: the verification is per DESTINATION CLAUSE, not per rule.
Where several rows share a clause they share its probe, so the row-level claim
is "this rule's destination is that clause" and the command-level claim is
"that clause exists and says the thing".

**THE WIDENED SURFACE, AND WHAT IS OFF IT.** The delta verification's V-4 found
that the not-covered statement named `delivery/` as the one exclusion when there
were ten. The full list of trees and files that the widening does NOT search:
`delivery/`, `test/`, `scripts/`, `.github/`, `sandbox/`, `witness/`,
`assurance-modes.yaml`, `gates.manifest.json`, `package.json` and
`role-model-config.yaml`. The verifier widened into every one of them and found
no false row, so the omission cost nothing here; it is written out because an
unnamed exclusion is what makes an empty result unreadable.

A surface member that MOVES used to make every absence claim quieter rather than
louder, which is the opposite of how the errored-grep arm is treated. Two changes
close it. A survivor set that is EMPTY is now a non-answer: the absence is
reported UNVERIFIED rather than confirmed, which is the errored-grep rule reached
through the other door. And the narrower case, one member renamed while others
survive, is caught a level out, by a suite assertion that every declared member
of `WIDENED_SURFACE` exists in this repository. That split is deliberate: the
checker also runs against scratch roots that hold almost none of the surface, so
it cannot tell a renamed tree from a deliberately absent one, and the repository
can.

## M5-P5, the context diet: a disposition for every removed block

- phase: M5-P5, 2026-09-23, diet baseline `6dc5b06`
- the register: the `diet` array in the JSON, beside `rows` and `retired`
- the guard: the diet tests in test/retirement-inventory.test.ts:1236, not the
  checker script

The numbers in the sections above are as of M4-P23 and are left as that
phase's record. At this phase's head the checker reports 318 rows against 318
derived anchors and 9 retired. The JSON gives 212 PORTED, 102 GAP and 4 FALSE,
and 212 PORT, 89 KEEP and 17 DELETE. By root: 136 in `CLAUDE.md`, 146 in
`.claude/skills` and 36 in `.claude/orchestrator-next.mjs`. At `6dc5b06` the
same command gave 323 rows: 214 PORTED, 105 GAP, 4 FALSE, and 20 DELETE. The
difference is this phase: seven rows retired and two added.

**Why a second register, and why it is not a PORT row.** M4-P23's rows track
RULES and prove a port with a negative-witness command. That shape is weak for
a pruned BLOCK. A block of history shares its keywords with a dozen other
files, so a grep for one of them exits 0 whether the block's content survived
or not. That is the sibling-keyword port the phase section forbids. So a diet
entry names the baseline line range and its first and last lines, and it is
evidenced by QUOTES, never by a command.

The kinds, and what each must carry:

| disposition | evidence the test checks |
|---|---|
| `exact-duplicate` | the WHOLE removed block, normalised, is in the BINDING text of a rule file (`CLAUDE.md` or `AGENTS.md`) |
| `mechanically-enforced` | the enforcing script exists and a workflow or the manifest runs it (or the gate is in the manifest); the test title is defined exactly once, the script's basename is in that test's OWN body, and a declared `asserts` fragment is in that body too; a quote of the kept rule is in the binding text of a rule file |
| `history-moved` | a quote of at least 8 words AT a named line range of a `delivery/` file that existed at the baseline and is not a pruned file, plus a quote of at least 6 words of the kept rule in the binding text of a rule file |
| `corrected` | a quote AT the authority's line range, in live text there (not inside a comment, fence, details block, blockquote or indented code, for a Markdown authority), and the replacement in the binding text of a rule file |
| `superseded-status` | `delivery/STATE.md` only: a reason and a quote of at least 6 words, either PINNED (`rev`, `at`) at a commit that is an ancestor of HEAD, or in the binding text of a rule file, or in a registered stable section of `delivery/STATE.md`, or in the live text of a file the diet does not prune |
| `archived` | `delivery/STATE.md` only: a reason, and a paragraph of the current `delivery/STATE.md` naming `git show 6dc5b06:delivery/STATE.md` and the entry's own `lines A to B` |

The refusal of a keyword is the word floor. An entry that carries
`verified-by`, `probe` or `negative-witness` is refused outright, at
test/retirement-inventory.test.ts:1332.

**Binding text is an allowlist, since the fresh-implementer round.** Two
earlier rounds defined NON-binding text by a list of labels (an HTML comment, a
heading with certain words, a paragraph calling itself non-binding), and every
phrasing not on the list passed: `## Archive`, `## Deprecated rules`, a fenced
block, `<details>`, a Setext heading, a disclaimer in its own paragraph. So the
two rule files are now parsed (test/retirement-inventory.test.ts:927), and a
line is binding only when it is a paragraph, list item, table row, heading or
registered-binding frontmatter line outside every fence, HTML comment,
`<details>` block, other HTML block, blockquote and indented code block, AND
every heading above it is registered `binding` (test/retirement-inventory.test.ts:1041).
Text before the first heading is not binding.

**The heading register** is `binding-headings` in the JSON: every heading of
`CLAUDE.md` (24) and `AGENTS.md` (35), keyed by level and text, each `binding`,
plus `AGENTS.md`'s frontmatter. A heading in either file that is not
registered is a finding, and so is a registered heading that is gone
(test/retirement-inventory.test.ts:1081). So a new `## Archive` fails loudly
and needs a reviewer to register it, `binding` or `non-binding`. A later phase
that adds a heading to either file registers it in the same change.

**Disclaimers cannot be classified by a test**, so they are not classified.
Every match of a broad word list (obsolete, deprecated, no longer, not binding,
non-binding, for reference, historical, superseded, archived, retired, kept
for, legacy, withdrawn, outdated, and forms of them) in binding text is a
finding of its own unless it sits inside a quote in `disclaimers-acknowledged`,
and each acknowledged quote must occur exactly once in binding text
(test/retirement-inventory.test.ts:1107). Twelve are acknowledged today, ten in
`CLAUDE.md` and two in `AGENTS.md`, each with its reason. The acknowledgement is
the human decision.

**Completeness, which the register alone does not give.** A register can be
fully evidenced and still omit a block. So a second test takes every run of
baseline lines of `CLAUDE.md` and `AGENTS.md` that no diet range covers, split
at blank lines, and requires it to be in the current file. Whitespace is
collapsed, and citation line numbers are masked so that a repointed citation
does not count as a removal. A run that was live at the baseline must be in the
BINDING text now (test/retirement-inventory.test.ts:1451). The baseline is read
generously, every live line counting as binding, which is the strict direction.

**`delivery/STATE.md` is status, and status is rewritten.** It is not under the
completeness check, because its point is to be rebuilt, and no diet check reads
its volatile text: the standing section, the standing reminders and the tracked
obligations are rewritten by routine updates. Status evidence is PINNED at
`6dc5b06` for six entries, and the rest quote CLAUDE.md, a decision record, or
one of the five sections registered in `state-stable-sections` (How to resume
cold, Owner decisions, M4 closure, Earlier milestones, History of this file).
A simulated standing update, with a new date and head, a changed count, a
rewritten re-verification paragraph and a new table row, keeps every diet and
STATE check green. Its shape check (test/retirement-inventory.test.ts:1548)
still requires the current standing first, no dated daily block, the M4 closure
and its residue and the history pointers, and every A-n id of the baseline.
Every id in the standing "Owner actions open" list needs a register item of at
least 25 words with a code span (test/retirement-inventory.test.ts:1507); the
only exemption is the explicit id list at test/retirement-inventory.test.ts:846,
which holds `A-14` until M5-P1 lands its register item.

This phase's register: eleven `CLAUDE.md` entries (eight `history-moved`, three
`corrected`) and fifteen `delivery/STATE.md` entries (fourteen
`superseded-status`, one `archived`). `diet-claude-md-02` was
`mechanically-enforced` until the fresh-implementer round. No real test names
`scripts/check-authored-bytes.mjs` inside its own body (they call it through a
module-level helper), so that claim cannot be checked honestly, and the entry
is now `history-moved` to T-010 with the kept rule. The `mechanically-enforced`
arm is witnessed on fixtures only. `AGENTS.md` is unchanged. It is the shipped
orchestrator brief and 66 PORT rows name it as their destination, so thinning
it is a brief change and not a diet.

**What this does NOT reach.** The quote check shows the text is AT the named
place. It does not show that the place is the right home, or that a history
quote carries everything the block said. That is a reading, and it stays with
the reviewer. A disclaimer in words that are not on the list is still read as
binding. The register says which sections are binding; it cannot say a
section's content is true. Tables inherit their section's class, because a
table cannot be told from a table of history by syntax; a disclaimer before
one is caught by the tripwire, a table of history under a binding heading with
no such word is not. The parser follows CommonMark closely enough for these two
files and is not a CommonMark implementation; where it is unsure it reads NOT
binding, which turns a relocation into a loud removal. A pinned status quote
shows what the file said at `6dc5b06`, not what STATE.md says now: currency is
still the orchestrator's. The `enforced-by` checks show the named test names
the script and makes the declared assertion; they do not show the assertion is
the rule's property. The completeness test needs the baseline commit, so a
shallow clone fails it rather than skipping it. The two `corrected` entries for
DR-0044 retire five rows, and the test checks both directions of that link. It
does not check that a replacement is true. For the DR-0044 rule the authority
is the owner record, because the rule is about the harness and `src/` models no
workflow cap. For the review-path row the authority is the M5-P3 contract in
the plan. Both readings are in the work history.

## Re-running it

```
node scripts/check-retirement-inventory.mjs            # check, commands executed
node scripts/check-retirement-inventory.mjs --extract  # the derivation
node --test test/retirement-inventory.test.ts          # the checker's own witnesses
```

Recomputing the derived numbers in this document, which nothing does for you:

```
node -e 'const r=require("./delivery/plan/cutover/retirement-inventory.json").rows;
const c=f=>r.filter(f).length;
console.log("PORTED",c(x=>x.status==="PORTED"),"GAP",c(x=>x.status==="GAP"),"FALSE",c(x=>x.status==="FALSE"));
console.log("PORT",c(x=>x.disposition==="PORT"),"KEEP",c(x=>x.disposition==="KEEP"),"DELETE",c(x=>x.disposition==="DELETE"));
console.log("GAP groups",new Set(r.filter(x=>x.status==="GAP").map(x=>x.group)).size);'
```

The M4-P23 inventory was a description and changed nothing in the three roots
except the two corrections named above. M4-P25 performs the deletions, under
the rollback note in section 4.3 of the plan. M5-P5 removed blocks under the
diet register described above.
