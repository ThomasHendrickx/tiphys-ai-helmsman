# Delta verification: PR #212 fix round against CR-001, CR-002, CR-003

Date: 2026-09-23
PR: #212, ThomasHendrickx/tiphys-ai-helmsman
New head reviewed: b181db5 on claude/m5-orchestrator-paperwork
Prior head (original clean-room review): 8d16042
Model family: Claude Sonnet 5
Method: delta verification in isolated worktree. Fetched origin, checked out
b181db5 detached. Identified the fix-round commit as 8c9d1be ("Paperwork
review fixes: T-046 citations, A-14 register location"), with b181db5 being
only the unchanged copy-in of the clean-room review on top of it, and
9be7f97 a merge of origin/main (bringing in #207 and #211) below it. So
`b181db5~3` is exactly 8d16042, the head my original review examined, making
`git diff b181db5~3..b181db5` the correct scope for "nothing else changed."

## Verdict: APPROVE

All three findings close. Nothing new is wrong. The diff is scoped to exactly
the fix and the review copy-in.

## CR-001 (T-046 cites CLAUDE.md:1 for C-2): CLOSED

delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md now
reads "Constraint C-2 is in the rules file's Never list, CLAUDE.md:1343."
Verified CLAUDE.md:1343 is unchanged from main
(`git diff origin/main -- CLAUDE.md` is empty) and is the C-2 bullet:

```
sed -n '1343p' CLAUDE.md
- Never use pid, process liveness, signals, or `/proc` for identity or
```

Matches exactly.

## CR-002 (T-046's "not on this branch" claim was false): CLOSED

T-046 now reads: "The implementer's own report is the evidence, at
delivery/work-history/release-verify-waits-for-registry.md:833, which landed
on `main` with PR #211." This drops the false claim and the backtick-quoting
entirely, replacing it with a real resolving citation. Verified:

- The file is unchanged from main (`git diff origin/main -- delivery/work-history/release-verify-waits-for-registry.md`
  is empty), so the citation resolves against a byte-identical file on both
  sides, satisfying CLAUDE.md rule 3b.
- Line 833 is exactly the sentence describing the `pkill -f` incident:
  `` `pkill -f` on the Node 26 scratch interpreter's PATH to clear its
  leftover children. `` (confirmed with `sed -n '833p'`), which is the claim
  T-046 is citing evidence for.

## CR-003 (A-14 referenced but never allocated in STATE.md's register): CLOSED

The fix does not move a full A-14 entry into this PR's copy of STATE.md.
Instead it adds one clarifying sentence to the existing bullet:

```
- A-14: restart pulse and bump pulse-fleet to kernel 0.2.0. Its register
  entry was allocated on the M5-P1 branch and reaches this register when that
  phase merges; it is not yet on `main`.
```

This directly answers the finding: the original problem was that A-14 was
referenced with no traceable allocation anywhere. Now the document names
exactly where the allocation lives and states plainly that it has not
reached `main` yet. Verified the named location is real and is a proper,
full register entry (matching the format of A-9, A-10, A-15):

```
git show origin/claude/m5-p1-pulse-value-proof:delivery/STATE.md > /tmp/state-m5p1.md
grep -n "A-14: REBOOT" /tmp/state-m5p1.md
1617:- **A-14: REBOOT THE PULSE PILOT SESSION, SO IT RUNS ITS NEXT PHASE ON THE
```

Matches the coordinator's cited delivery/STATE.md:1617 on
origin/claude/m5-p1-pulse-value-proof exactly, and the entry read in full is a
proper `**A-n: ...**` register bullet (opened 2026-09-23 by M5-P1, OPEN, with
what the owner does, why an agent cannot, and how the orchestrator checks it),
consistent with A-9/A-10/A-15's format.

This is a documentation fix rather than a structural one (main's own register
still lacks A-14 until M5-P1 merges), but it closes the finding as stated: the
finding was that the reference was untraceable and unverifiable, not that
every A-n must physically live on main before any branch can mention it. The
new sentence makes the claim checkable, and it checks out.

## Nothing new is wrong

- `git diff b181db5~3..b181db5 --name-only` is exactly:
  delivery/STATE.md, delivery/review/clean-room-m5-orchestrator-paperwork-sonnet.md,
  delivery/tuition/T-046-an-agent-killed-another-agents-tests-by-pattern.md.
  Nothing else touched.
- Claim grep (line-based) over the updated T-046 and the new STATE.md section
  (lines 2701-2736): same two benign hits as the original review ("Never
  list" proper-noun reference, and the prescriptive "never `pkill`"), no new
  over-claims introduced by the fix.
- `node scripts/check-authored-bytes.mjs` on node v26.6.0: exit 0.

## The review copy-in and its transliteration note

`delivery/review/clean-room-m5-orchestrator-paperwork-sonnet.md` as committed
matches my original report except for one substitution and one appended note.
Diffed directly against my own pre-copy draft (kept in this session's
scratchpad before checkout):

```
diff <my original draft> <the committed file>
209c209
<   not checked") -- correctly declared open by the note itself, nothing to add.
---
>   not checked"): correctly declared open by the note itself, nothing to add.
239a240,243
> ## Transliteration note (orchestrator)
> When this report was copied onto the branch, one U+2014 (em dash) in the
> reviewer's prose was replaced with a colon, to satisfy the ASCII rule.
> Nothing else in the report was changed.
```

Checked my original draft for em dashes independently
(`grep -c $'\u2014' <draft>`): exactly 1, at the same line the note names.
The declared count is correct and nothing else in the report differs.

## Probes run

1. `git fetch origin && git checkout --detach origin/claude/m5-orchestrator-paperwork`
   -> b181db5.
2. `git log --oneline b181db5~5..b181db5` to establish the fix-round commit
   boundary and confirm `b181db5~3` equals the previously-reviewed head
   8d16042.
3. `git diff b181db5~3..b181db5 -- delivery/STATE.md` and the same for T-046,
   read in full.
4. `git diff origin/main -- CLAUDE.md` and
   `git diff origin/main -- delivery/work-history/release-verify-waits-for-registry.md`,
   both empty, confirming the two new citation targets are byte-identical
   between main and this branch (CLAUDE.md rule 3b).
5. `sed -n '1343p' CLAUDE.md` and `sed -n '833p' delivery/work-history/release-verify-waits-for-registry.md`
   to confirm both new citations point at the content they claim.
6. `git show origin/claude/m5-p1-pulse-value-proof:delivery/STATE.md | grep -n "A-14: REBOOT"`
   to confirm the named cross-branch location for A-14's register entry is
   real, at the claimed line, and is a proper register entry.
7. Claim grep, line-based, over the two touched documents' new/changed text.
8. `node scripts/check-authored-bytes.mjs` on node v26.6.0 (PATH-prefixed
   per standing warning 1): exit 0.
9. Diffed the committed review file against my own pre-copy draft to verify
   the transliteration note's claim exactly.

## Honest-failure section

- Did not re-verify the substantive GitHub API facts from the original
  review (PR numbers, run ids, shas, test names) a second time, since none of
  them were touched by this fix round (confirmed by the scope check above);
  re-probing facts nothing changed would not add evidence.
- Did not re-run `node scripts/check-id-collisions.mjs` on this head; the fix
  round touches no new T-nnn or DR-nnnn file, so it is not expected to differ
  from the original review's exit-0 result, but this was not independently
  re-run this round.
