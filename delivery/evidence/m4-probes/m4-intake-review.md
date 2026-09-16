# m4-intake-review findings (incremental)
Tue Sep 15 23:10:08 UTC 2026

## Status
- Read delivery/plan/m4-intake.md lines 1-1010 in full (sed chunks). Head f7576f4 on plan/pstack-borrow-review (intake says baseline 542fde1; two DR commits since).
- Verification pass starting: plan lines, src citations, greps for MISSING claims, DR-0037..0042 seam.

## Candidate findings (unverified until marked V)

## Verified findings (all lines read at HEAD f7576f4)

H1. Section 7 (m4-intake.md:786-788) claims "the kernel's fleet-home entry condition (section 9.2 item 1) is DISCHARGED: the remote exists and is private", then says "The fleet home itself is deliberately NOT initialized". 9.2 item 1 (m4-intake.md:869-872) requires a fleet home to EXIST with the kernel clone realized under projects/. A remote is not a fleet home. Entry condition claimed met while unmet. Also 9.2 item 1 still says "private remote (the requested A-n)" though section 7 withdrew that A-n and DR-0037 part 2 amended A-2 to DURABLE.

H2. M4-D-08 (m4-intake.md:734) "migration cost is measurably ZERO: grep -rln '^kind: verdict' delivery/review/ exits 1, so no document validates under the narrower rule today" and H-C (m4-intake.md:810) "zero verdict documents exist". Ran grep -rlE '^kind: verdict' over the tree: 2 real verdicts at delivery/evidence/m3-exit-test/e1/e1-7/verdict-criteria.yaml and verdict-hazard.yaml (both FIX-ROUND-NEEDED, medium findings, no head field) plus 5 fixtures under witness/fixtures/dual-review/. Search scoped to one directory read as an absence: section 2's own stated failure shape. Adding a REQUIRED head breaks all seven.

M1. Section 1 decomposition (m4-intake.md:73-85) claims to cover kernel-plan-v1.md:368 (line 674 "covers the paragraph"). Read line 368 whole: the final sentence "From M4 exit onward the kernel is its own pilot-class project on v1 (SC-013)" has no clause. It is the sentence DR-0036/DR-0037 change the timing of (section 10 item 4 admits the plan "still reads the old way") and DR-0041:48-50 leans on it.

M2. M4-D-04 (m4-intake.md:730) and 4.1 item 2 (m4-intake.md:343-349): "Either the adapter blocks for the whole turn, or the signature becomes async". src/spawn.ts:184 subprocessAdapter uses spawnSync and blocks for the whole payload already; an agent CLI is a longer payload. Nothing measured requires async; the need depends on M4-D-01's PROTOTYPE-BLOCKED probes, yet M4-D-04 is unmarked and recommended as a kernel phase before any plugin phase. C-3 (kernel-plan-v1.md:94) is about the watcher only.

M3. 4.1 (m4-intake.md:360-364) "zero-vendor-names property is currently TRUE" from an unpublished eleven-token grep. src/gates/schemas/phase-declaration.schema.json:18 and schemas/plan.schema.json:153 hardcode ^claude/ in shipped schemas; the intake cites the first itself at M4-D-22. Token list not published, so the "four hits" is unreproducible (my eleven tokens give ~40).

M4. Revision-2 seam citations rotted in the same commit: DR-0041:142 cites m4-intake.md:753 (blank line in section 7 at HEAD and at 9f99d6c; H-A is at 808); DR-0042:92 cites m4-intake.md:117 (1.1 item 3 text; item 5 is 118-125). Both in range, both silent. The intake's own H-H mitigation (line 816) is "re-verify immediately before the commit", a remembering rule that failed in the commit that wrote it.

M5. Seam contradictions after the DR-0042 patch: section 10 item 7 (m4-intake.md:929) "now permanent" vs section 2 item 1 (m4-intake.md:148-152) "That was wrong within the hour"; 9.1 (m4-intake.md:836-838) says re-probe falls to "whoever delivers pulse, not to this orchestrator" vs 10 item 8 and DR-0042:56 (re-probe is this orchestrator's first act); 4.6 (m4-intake.md:669-671) "a session this orchestrator cannot observe"; section 7 (m4-intake.md:800-804) says the revision "is in flight and is listed in section 10" inside revision 2, and section 10 has no such item; status header (m4-intake.md:3-6) omits DR-0042 though the doc was edited for it; H-K (m4-intake.md:818) and 1.1 item 3 (m4-intake.md:116) still assume a pulse phase.

M6. Published probe commands that cannot go red: m4-intake.md:260 grep -rn 'project-write|projectWrite|PreToolUse' (BRE, literal pipe, matches nothing on any tree); m4-intake.md:237 grep -rn 'reclaim|resume|reconcil' src/ said to return "three comments" (as written: 0; with -E: 5); m4-intake.md:283 grep -rln 'cross-environment|two environments|shared remote' test/. Conclusions hold under -E; the printed commands are not the ones run (fix-round contract item 2).

M7. M4-D-17 note and 9.1 (m4-intake.md:743, 855): "the kernel has had more than one model name available" so the single-family arm "cannot [be] witness[ed]". Every produced-by in delivery/review and delivery/evidence is Anthropic (Opus 5 / Sonnet 5). DR-0012:22 requires different FAMILIES; src/checks.ts:2996 compares produced-by strings. Under DR-0012's meaning the kernel is a single-family subject, and the shipped check reading two same-family names as decorrelated is itself a cannot-go-red guard the intake does not list.

L1. Section 5 rows 4, 6, 7 cite bare delivery/plan/kernel-plan-m3.md (D-M3-14 is at :5564, D-M3-10 at :5547); rule 3b says a bare path is not a citation.
L2. Section 0 table's "resolves" example delivery/STATE.md:7 is an empty line.
L3. 4.2 (m4-intake.md:417-420): six DR-0012 conditions, condition 3 unaccounted for.
L4. Baseline rot at HEAD: git ls-files | grep -ci plugin is 1 (DR-0040 filename); remote heads 133 not 132.
L5. Appendix A (m4-intake.md:975-979) says every claim-grep hit carries a probe; 52 hits, and lines 478, 539, 556, 894 carry none.
L6. M4-D-03 not revisited after DR-0040: still recommends loading adapter code by module resolution from fleet-home package.json while 4.1 item 1 lists "loading third-party code into the kernel process" as undecided; with one in-repo adapter a built-in registry is the cheaper option and is not weighed.
L7. M4-D-22: demoted as "untested change" yet kept as kernel entry condition 9.2 item 4; the M1-P3 argument used at 1.1 item 5 and M4-D-23 is not applied.
L8. M4-D-09's post-cutover half assigns merge capability (plugin, orchestrator-invoked); DR-0012/DR-0015 make merge authority owner-reserved; marked ORCHESTRATOR.
L9. H-A axis 2 mitigation is "noticing" (m4-intake.md:808) where a mechanism exists: a check that every M4 phase declaration quotes the retained-authority condition (9.2 item 6) and the incremental four-column ledger (9.3) as a gated artifact.

## Citation audit
Source/config: 36 checked, 36 resolve to the claimed content (src/spawn.ts:267 is the doc comment above the field, acceptable).
Delivery docs: 27 checked; 23 exact; 4 loose (STATE.md:7 blank; premise-check.md:32 is a header; DR-0035:49 is a table header; macos...:136 is the read-boundary sentence, index lock is lines above). 0 out of range.
Gate: tiphys gates run --only citations at HEAD: green, 182 resolved, 0 red.
Section 0 extraction table reproduced via extractCitations: 5/5 rows match.

## What I did NOT read
- delivery/plan/kernel-plan-m2.md and -m3.md beyond cited lines; delivery/plan/pstack-borrow-review.md beyond 215-235.
- src/checks.ts dual-review logic beyond grep for family; scripts/check-dual-review.mjs body beyond grep.
- The raw discovery slice output (not committed). Claude Code plugin documentation (not probed). pulse (not probed).
- Hazard ids H1..H70 individually: only the twelve collapsed rows.
