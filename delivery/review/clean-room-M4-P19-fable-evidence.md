# Clean-room review: M4-P19 pool record reconstruction

Reviewer framing: EVIDENCE INTEGRITY. Every claim unproven until run.
Subject: branch claude/m4-p19-pool-record-reconstruction, head abde402, base de9b386.
Started: 2026-09-16. Incremental; sections appended as work proceeds.

## Status log
- started; reading CLAUDE.md, plan section, work history, probes, diff
- read: CLAUDE.md, plan section kernel-plan-m4.md:2826-2877, work history (702 lines), probes doc (447 lines), full diff (11 files, +1690/-38)
- lab: branch head extracted to scratchpad (git archive abde402), clone for gate runs, node v26.6.0 at /tmp/n26-m4p19/bin/node

## First check: derivation honesty (fix-round item 3)
Section 4.2 lists five exclusions: src/spawn.ts by scope, grep over src/ only, textual match on recordPath(, resume not existing, one cause for unreconstructable. Section 6 lists six more.
Re-ran derivation 1 widened to bin/ test/ scripts/: zero hits (exit 1). Re-ran derivation 2 alias search: no alias of pool's recordPath (the other recordPath hits are unrelated identifiers in spawn/gates). So the two admitted gaps are empty in fact.
Admissions worse than they sound:
  (a) section 6 bullet 1 asserts that with the whole worktrees/ tree gone, pool list and doctor "report the entry with headSha missing". MEASURED FALSE: with worktrees/ and projects/ gone, pool list exits 1 "not a fleet home", doctor CHECK layout FAIL and CHECK worktrees WARN "not a fleet home", teardown exits 1 "not a fleet home". The sentence is true only for the per-task shape (worktree dir and record gone, worktrees/ present), which is the shape I measured as A2.
  (b) the scout shape was declared untested; I tested it: closes cleanly with no commits, refuses naming tip and base with a commit. Holds.

## Claim grep
line-based: 9 lines; wrap-insensitive: 9 occurrences (2 anyway, 2 cannot be, 1 impossible, 4 never). Forms agree. Prose hits at 19/130/262/431 all settled (quotation, dispatch fact, printed grep, mutant stderr). The audit table in section 8.5 cites lines 14/125/257/426: stale by +5 (status bullet added in abde402 after the table was written).

## Citations
32 sampled, 32 resolve to the claimed content. Hit rate 32/32.
BUT the citations GATE result quoted in section 8.4 (507 resolved, 16 documents) never linted this phase's documents: delivery/work-history/ is not under the gate's documents globs (gate-registry.yaml:117-123), and with --base de9b386 the gate reports not-applicable for all 11 changed paths. The 16 documents are the pstack-borrow-review branch's own. Re-run at abde402 vs origin/main: same 507/16, none of them P19's.

## Scope
Changed: 11 files = 7 filesToTouch + 4 declaredExtras. src/commands/pool.ts and test/doctor.test.ts are NOT in the wave-1b pre-pass row (m4-conflict-pre-pass.md:63); no in-flight unit claims either (checked wave 1, 1b, 2 text). M4-P17 (owner of doctor.test.ts) is recorded as blocked in wave 2, not dispatched.
Scope GATE at HEAD vs origin/main: RED, "no phase declaration exists at delivery/plan/phase-declarations/m4-p19.json in the merge base 3b40118". With --base de9b386: error, merge base not an ancestor of trunk. Work history does not mention running scope.
Section 7 of the work history says test/doctor.test.ts "is deliberately NOT touched"; the diff and the declaration say it is. Stale from before b84d3e4.

## Lab measurements (branch head, node v26.6.0, bin/tiphys.ts from source)
A  whole worktrees/ and projects/ gone: pool list exit 1 "not a fleet home"; doctor CHECK layout FAIL, CHECK worktrees WARN "not a fleet home"; teardown --from-reconstructed exit 1 "not a fleet home". Contradicts work history section 6 bullet 1.
A2 task worktree and record gone, worktrees/ present: pool list "t-a2 missing reconstructed"; doctor WARN names it; teardown --from-reconstructed exit 1 "cannot verify worktree cleanliness ... No such file or directory" (teardown's own dirty probe, pre-existing).
B  scout, record gone, report present, no commits: --from-reconstructed exit 0, meta closed. B2 with a commit: exit 1 naming tip and base, branch intact, meta open. The section 6 open question is answered favourably.
C  origin/HEAD unset locally and the remote advertises no HEAD: pool list "unreconstructable (unresolved: branch)"; teardown exit 1 "unresolved field(s) branch". Criterion 3's single-field arm holds (untested by the phase, admitted).
D  doctor --for full: WARN stays WARN under full, no "(required for profile full)" suffix; exit code identical between healthy and reclaimed (1 in both because gh and remote FAIL in the lab, so this arm is only partly informative).
E  two remotes none origin: unresolved remote, branch; refuses.
F  pool destroy directly, no record: refuses at the base-sha gate with and without --discard (pre-existing gate intact).
Net: unreachable ssh remote with origin/HEAD unset: pool list returned in 1s "unresolved: branch" (ls-remote failed fast here); a hang was NOT demonstrated.

## Suite run (branch, clone under the scratchpad, node v26.6.0, dist built exit 0, npm test): in progress; 3 failures so far, all outside the phase's files: 2 in coverage-gate (the load family the work history names), 1 in gates.test.ts:3571 which is the standing-warning-1 traversal trap: same head, same test PASSES from /tmp/tiphys-review-copy (1 pass) and FAILS from the clone under /tmp/claude-0 (ERR_MODULE_NOT_FOUND as uid 65534).
authored bytes: exit 0. Binary-classified files in diff: 0.

## Verdict (written under a structured-output deadline before the base suite and my own mutant re-runs completed)
FIX-ROUND-NEEDED, paperwork only. No code defect found by static reading, by six lab scenarios, or by the implementer's four mutant diffs (verified byte-for-byte against the branch head). The findings are evidence-integrity: the work history makes four statements that are false at abde402 (section 6 whole-tree-gone behaviour, section 7 doctor.test.ts untouched, "two commits", claim-grep line numbers), and section 8.4 quotes a citations-gate green over 16 documents none of which this phase wrote. Scope gate is RED at HEAD vs origin/main because the declaration does not exist at the merge base (orchestrator action). Not completed: my own base-suite run, the coverage-gate isolation, and mutants M1-M5 in after-suite.sh.
