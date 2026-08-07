# Arbitration: M2-P5 citation linter, round one

- date: 2026-08-06
- head: `30d295c024166b75ace9421a77591664e62d220a` (branch claude/m2-p5-citation-linter)
- arbitrated by: the orchestrator, under DR-0012 clause 6
- outcome: **FIX-ROUND-NEEDED.** Three highs from the hazard contract, the
  decisive one witnessed: the gate exits red on the head that delivers it.
  First fix round, same implementer (DR-0016).

## The verdicts

| | criteria (Sonnet, CR-1000..) | hazard (Opus, CR-1015..) |
|---|---|---|
| verdict | APPROVE | FIX-ROUND-NEEDED |
| high / medium / low | 0 / 1 / 0 | 3 / 5 / 5 |
| method | all 9 criteria re-executed independently; two-guard mutation, sha256 restore | attack table; the gate run against its own base; the CR-520 class confirmed genuinely closed (six members) |

The criteria contract confirms the phase meets every acceptance criterion
and that its M2-C-6 defence is real and complete. The hazard contract found
that meeting the criteria is not the same as the gate being correct, which is
the T-007 split exactly. Both are right; the phase does not merge.

## The three highs, at the mechanism

**One mechanism produces CR-1015 and CR-1016**: the gate lints the whole
body of every file the diff names, and cannot tell a citation a document
MAKES from one it QUOTES or REPORTS.

- **CR-1015 (high, witnessed):** `node src/gates/citations.ts --base
  origin/main` exits 1 on this very branch, because the phase's own work
  history (which plan step 5 ORDERS it to fill with reported stale
  citations) contains citation-shaped strings the linter then tries to
  resolve. The gate reds on doing what the plan told it to do. Plan 1.4
  requires `citations` green on the PR bundle and M2-P9 asserts seven
  required gates green; neither can hold as built.
- **CR-1016 (high):** because the diff selects whole FILES and the linter
  reads whole BODIES, editing one line of `delivery/STATE.md` reds on
  pre-existing bad citations elsewhere in STATE.md, and 54 of 92 corpus
  documents self-declare not-applicable (zero citations) which, being
  `required`, fail the aggregate. M2-D-10 narrowed the SCOPE to the diff but
  the narrowing did not reach the READ.

**CR-1017 (high):** `--head` selects the file list (`git diff base...head`)
but the lint loop reads the working tree, so a gate told to judge revision X
judges whatever is checked out. Straight defect: read content at the `--head`
ref, not from `cwd`.

## The decisions this round rests on (DR-0016: decided, not asked)

Two design questions sit under the highs. Both have a defensible answer, so
the orchestrator decides them here and amends the plan, rather than sending
the implementer to invent or the owner to adjudicate.

**Decision M2-D-21: diff scope means introduced or changed citations, not
whole bodies of changed files.** The linter resolves a citation only when it
was ADDED or MODIFIED in the diff `base...head` (computed per changed hunk),
plus, for a `citationRequired` document, the vacuous guard still asks whether
the document as a whole makes at least one citation. A pre-existing citation
the PR did not touch is never the PR's failure. This is the same anti-drift
principle M2-P4's scope auditor already applies (audit what changed, not what
was there), and it is what M2-D-10 meant by "diff scope" made precise. It
dissolves CR-1016's row 1 and bounds the corpus problem to what a PR
actually writes.

**Decision M2-D-22: a citation inside a code span or fence, or under a
document's explicit reported-citations marker, is QUOTED, not made, and is
not resolved.** The reporting the plan orders (step 5, and every review and
verification document that discusses a bad citation, including the two
clean-room reviews of THIS phase) wraps the citation as inline code or in a
fenced block. The linter skips citation tokens inside backtick spans and
fenced code blocks. This is derivable from the source text, needs no
declaration, and is the convention this very repository already follows when
it writes `src/nope.ts:1` to mean "this does not resolve". Combined with
M2-D-21 it dissolves CR-1015: the work history's reported citations are
quoted and pre-existing, so neither arm fires.

Both decisions will be written into `delivery/plan/kernel-plan-m2.md`
M2-P5 section by the orchestrator once this round lands, matched to the
delivered behaviour, exactly as M2-P1's amendments were.

## The mediums, dispositions

CR-1018 (path traversal escaping the checkout resolves green against a file
outside the repo, and inflates units) and CR-1022 (concrete-path ambiguity
across two roots is decidable but the code answers glob-intersection and
returns on first match) are real and in scope for this round: both let a
verdict rest on something outside the audited tree, which is the gate's whole
purpose to prevent. CR-1019 (a malformed hash suffix is dropped and the
citation resolves unverified, defeating criterion 3 silently) is in scope: a
suffix that looks like a pin but is malformed is `red`, never a silent
resolve. CR-1020 (vacuous guard counts tokens extracted, not units resolved)
and CR-1021 (the vanish race: a zero-citation required doc removed after the
diff goes green while evidence still names it) fold into M2-D-21's rework,
because both are consequences of counting the diff's named set rather than
what was read; the fix round confirms they are closed by the rework or fixes
them explicitly. The five lows (CR-1023 fabricated tokens from the lookbehind,
CR-1024 truncation, CR-1025 leading zeros, CR-1026 CRLF/hash, CR-1027 the
stale inventory row) ride as tracked items unless the rework closes them,
each with a reason.

**CR-1001 (criteria, medium):** the work history's per-document inventory
table has four rows with wrong resolved/unresolved splits (totals correct),
contradicting its own correct prose aggregate. Evidence-integrity, not code.
The fix round corrects the table (or annotates the discrepancy); it is the
kind of unexecuted-count slip T-006 is about, and it is exactly what hid
CR-1015 from the implementer.

## Fix-round contract, binding

Name each mechanism (the made-vs-quoted distinction; the diff-read scope; the
outside-tree resolution), not the five instances. Publish the derivation:
run the gate against its own `--base origin/main` and show it green after the
fix (the single check the implementer skipped and that would have caught
CR-1015 before submission), and enumerate every path the linter reads and
whether it reads at the `--head` ref or the working tree. State what the
derivation did not cover. Red witnesses stage the dangerous state: a document
that both makes and quotes a bad citation (only the made one reds); a PR
touching one line of a file with a pre-existing bad citation elsewhere
(green); `--head` at a broken rev with a fixed working tree (red, judging the
rev). Run the claim grep last, paste it, name the commit.

## Escalated to its own item, not this phase's to solve

Three reviewers (M2-P5 criteria, M2-P5 hazard, M2-P4 criteria) independently
raised the same policy question: a `required` gate that reaches
not-applicable, whether by an unmet precondition or a self-declared
not-applicable on a PR outside its domain, currently fails the aggregate
through the merged `decideAggregate` (M2-P1, CR-800). With seven diff-scoped
required gates, an ordinary PR that touches none of their domains would be
unmergeable. This is real, it is M2-wide, it touches the merged runner and
the M2-P9 exit test, and it is NOT M2-P5's to fix. Recorded as a standing
policy item to settle before M2-P9 (see STATE.md), with a recommendation to
be written there.
