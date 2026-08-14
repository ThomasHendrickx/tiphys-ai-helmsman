# Clean-room review, M3-P10, CRITERIA lens

- reviewer: independent clean-room agent, CRITERIA lens (a second agent runs
  an adversarial hazard lens in parallel; this review does not try to cover
  that ground)
- branch under review: `claude/m3-p10-release-and-exit`
- sha under review: 8d056f6
- pull request: #140
- started: 2026-08-14

## Plan for this review

Walk every acceptance criterion in the plan's M3-P10 section
(delivery/plan/kernel-plan-m3.md:4921) against the branch with my own
commands, independent of the work history's account
(delivery/work-history/m3-p10.md:1). Specific things flagged for extra
scrutiny by the dispatch:

1. Criterion 1b's claim that the criterion's own predicted witness is wrong
   (whole-walk removal exits 21, not the predicted vacuous 0), and that the
   real vacuous pass was witnessed a different way.
2. Criterion 2's claimed numbers: 181 pack entries, zero forbidden, five
   shipped directories identical between `git ls-files` and the pack.
3. Criterion 4: which half is genuinely blocked by the absent publish and
   which was merely not attempted.
4. Criterion 5's claimed residue: `--tarball` means the registry FETCH path
   is unwitnessed, records carry `"artifact":"local-tarball"`.
5. Criterion 6: are the three named blockers real, and could anything in it
   have been done here.

Then run the suite myself and report it as a complete sentence per standing
warning 12. Then the claim greps against this document. Then findings
CR-nnn with severity and DR-0027 reachability, then a verdict.

## Log

(appended as work proceeds)

---
