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
| `.claude/orchestrator-next.mjs` | 16 |
| total | 280 |

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

Totals: 188 PORTED, 88 GAP, 4 FALSE. Dispositions: 188 PORT, 75 KEEP, 17
DELETE. Of the KEEP rows, 46 are process-side and 29 predicate-side.

Those totals moved by one in the fix round, and the move is the correction
below: the C-3 row was a GAP/KEEP and is a PORTED/PORT. Every number in this
paragraph is derived by reading the JSON rather than counted by hand, and the
checker refuses the document if any row's two axes disagree.

## The four FALSE rows

**1. Scope declaration grants no longer need their own pull request.** This is
the one the phase section names, and it is the worked example for the whole
pass. `CLAUDE.md` said a declaration amendment needs its own pull request
because the scope gate reads the declaration from the merge base only.
src/gates/scope.ts:110 records that M3-P11 changed exactly that: the
declaration is read from BOTH the merge base and the head, an addition on the
head is allowed, and the protection is that the addition is printed by name.
Corrected in this phase at CLAUDE.md:794. Carried across uncritically, this
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

187 rows PORT, and the destinations concentrate rather than scatter:

| destination | rows |
|---|---|
| `AGENTS.md` (orchestrator brief) | 63 |
| `roles/implementer.md` | 55 |
| `checklists/clean-room.yaml` | 11 |
| `checklists/hazard-review.yaml` | 9 |
| `templates/warnings.md` | 7 |
| `roles/investigator.md` | 7 |
| `src/gates/scope.ts` | 6 |
| `assurance-modes.yaml` | 4 |
| everything else (14 artifacts) | 25 |

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

Twenty-five groups of rules have no kernel destination. The three the intake
predicted are confirmed by command, and the pass found more. (Twenty-six before
the fix round, which moved the C-3 group out of this list.)

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
scripts/check-retirement-inventory.mjs:559: every absence claim is re-run
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
7. a crash or an unreadable input exits 2 and is never rendered as a pass.

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

## Re-running it

```
node scripts/check-retirement-inventory.mjs            # check, commands executed
node scripts/check-retirement-inventory.mjs --extract  # the derivation
node --test test/retirement-inventory.test.ts          # the checker's own witnesses
```

The inventory is a description and changes nothing in the three roots except the
two corrections named above. M4-P25 performs the deletions, under the rollback
note in section 4.3 of the plan.
