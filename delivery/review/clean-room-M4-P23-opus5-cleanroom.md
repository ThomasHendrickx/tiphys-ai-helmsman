# Clean-room review: M4-P23 retirement inventory

Reviewer: Opus 5 (clean-room, sole reviewer)
Branch: claude/m4-p23-retirement-inventory
Head: 7b2b7f1  Base/merge-base: 3b40118 (== origin/main tip, confirmed)
Framing: evidence integrity and data loss.

## Status log
- [t0] Confirmed merge-base == origin/main == 3b40118.
- [t0] Diff touches 34 files, 19104 insertions.
- [t0] Phase declaration filesToTouch has 8 entries; diff shows 34 paths. SCOPE is the first thing to settle.

## [t1] Scope: settled, and it is CLEAN relative to the cut point
- Branch was cut from `plan/pstack-borrow-review` at de9b386 (an unmerged branch).
- `git diff --name-only origin/plan/pstack-borrow-review...branch` = exactly 8 paths,
  all 8 on the declaration's filesToTouch. No undeclared edit.
- `git diff --name-only origin/main...branch` = 34 paths; the extra 26 are the cut
  point's, not this phase's. The work history states this explicitly.
- CLAUDE.md at de9b386 is byte-identical to CLAUDE.md at the plan branch tip
  (`git diff de9b386 origin/plan/pstack-borrow-review -- CLAUDE.md` empty), so the
  pre-pass promise ("CLAUDE.md is M4-P23's for the duration") was kept.
- `git merge-tree --write-tree origin/plan/pstack-borrow-review branch` exit 0: clean.
- NOTE for the orchestrator: merging this PR to main lands a STALE SNAPSHOT of the
  plan branch (17 commits behind its tip). Sequencing is the orchestrator's call.

## [t2] Checker runs green here
$ node scripts/check-retirement-inventory.mjs   (node v22.22.2, fresh clone at 7b2b7f1)
retirement-inventory: 280 row(s) against 280 derived rule anchor(s), commands EXECUTED
retirement-inventory: every rule in the three roots is resolved
exit=0, 5.5s wall.
Row shape: 280 rows = PORTED 187 / GAP 89 / FALSE 4; PORT 187 / KEEP 76 / DELETE 17.
verified-by exits: 190 zero, 89 one, 1 two. negative-witness exits: 187 all one.

## [t3] FINDING 1 (HIGH, evidence integrity): the C-3 GAP row is FALSE
Row id `claude-md:never-auto-background-a-long-running-process-c-3`, status GAP.
Its gap field: "C-3 ... stated in NO instruction channel: not in a brief, not in a
checklist, and not in the mechanism index".
Work history line 404 calls this "the loudest" gap in the inventory.

REFUTED by one grep:
$ sed -n '496,501p' AGENTS.md
AND THE C-3 DISTINCTION ... C-3 forbids a kernel COMMAND from putting long-running
work out of the operator's sight without being told to.
Also schemas/assurance-modes.schema.json:37 states "CONSTRAINTS C-2 AND C-3 BIND
THIS LIST: no stage is completed, detected or excluded by process liveness, by a
signal, or by a detached long-running process."

Mechanism: the verified-by command greps for the literal token `auto-background`
only. AGENTS.md states the rule without that token. Exit 1 means "the word is
absent", not "the rule is absent". The row reads the first as the second.
This is the exact failure the same work history self-corrected for C-1 one
paragraph earlier: it widened the TREES searched and not the SEARCH TERMS.

## [t4] FINDING 2 (MEDIUM): one verified-by command is a shell-quoting error
Row `claude-md:r-094-is-partially-delivered-and-the-half-that-i`:
  command: grep -c '-- '--registry'' scripts/m2-exit-test.sh
  exit: 2
  output: grep: unrecognized option '-- --registry' / Usage: ...
The command never searched anything. The row's note asserts "Re-verified in this
phase and still TRUE". A usage error read as a clean result is named verbatim in
CLAUDE.md's fix-round contract as one of three recorded bites. The checker passes
it because exit 2 reproduces.
Scan of all 467 captured outputs: this is the ONLY error-shaped one.

## [t5] FINDING 3 (MEDIUM): the command screen does not prevent writes, and says it does
scripts/check-retirement-inventory.mjs header: "the restriction is here so a
careless row cannot write to the tree it is auditing."
Measured against the exported screenCommand at this head:
  ALLOWED  "git checkout -- ."
  ALLOWED  "git clean -fdx"
  ALLOWED  "git reset --hard HEAD~5"
  ALLOWED  "sed -i s/a/b/ src/gates/scope.ts"
  ALLOWED  "node -e process.exit(0)"      (FORBIDDEN matches $( only, not plain parens)
  ALLOWED  "awk -i inplace BEGIN{} src/x.ts"
  refused  "rm -rf src" / "curl ..." / "tee out.txt"
The checker runs these with cwd = repository root, and the suite runs the checker.
CLAUDE.md standing warning 8 names `git checkout --` as the destructive one.

## [t6] Finding 3 MEASURED, not read
Scratch repo /tmp/claude-0/screen-probe, five synthetic rows, one verified-by
`sed -i s/ORIGINAL/DESTROYED/ src/victim.txt`:
  BEFORE: IMPORTANT ORIGINAL CONTENT
  retirement-inventory: 5 row(s) against 5 derived rule anchor(s), commands EXECUTED
  AFTER : IMPORTANT DESTROYED CONTENT
The checker wrote to the tree it was auditing. exit=1, and the only finding it
reported was the SIDE EFFECT (a sibling row's exit changed because sed edited
the file it greps).

## [t7] FINDING 4 (MEDIUM, tracked): the allowlist witness's red arm is destructive
test/retirement-inventory.test.ts:177 sets verified-by to
`rm -rf delivery/plan/cutover` and runs the checker with `--repo <the real
repository root>`. The screen refuses it today. If the screen ever regresses,
the red arm of this witness DELETES a tracked directory of the working tree
before the assertion fires. A witness should not be able to destroy its subject.

## [t8] Re-run of the phase's own suite file (independent)
Tree: a fresh `git clone` of the repository (a real git checkout, not a
`git archive` copy), branch at 7b2b7f1. Interpreter node v22.22.2
(/opt/node22/bin/node). `npm ci` exit 0, `npm run build` exit 0,
`git status --short` 0 lines. Invocation `node --test test/retirement-inventory.test.ts`:
  # tests 16 / # pass 16 / # fail 0 / # skipped 0  exit 0  (14681ms)
Checker against the real roots: 280 rows / 280 anchors, exit 0.

## [t9] Cheap guards re-run at 7b2b7f1
  node scripts/check-authored-bytes.mjs            exit 0
  node scripts/render-agent-rules-gates.mjs --check  green, 21 rendered gate rows, exit 0
  node scripts/check-brief-drift.mjs               exit 0

## [t10] C-1 / C-2 / C-3
grep over both new files for detached|unref|process.kill|/proc|SIG*|pid|setsid|nohup
returns NO hits. `spawnSync` only. No state read from a log tail. Clean.

## [t11] Append-only registries
test/behaviors.json: 16 names appended, none removed, no count pinned anywhere.
test/retirement-inventory.test.ts asserts BY NAME (set equality of ids in both
directions) and explicitly refuses to pin a count. Correct under convention 5.

## [t12] Citations
22 distinct resolving-form citations in prose (fenced captured output excluded).
21 resolve to a non-blank line that says what is claimed. Hit rate 21/22 = 95.5%.
One miss: delivery/plan/m4-conflict-pre-pass.md:60 is a BLANK line; the wave-1b
row naming M4-P23 is at :64. In-range, so the gate stays green; the citation
points at nothing. LOW.
Also checked: all 280 rows' `rule` and `text` fields against live anchors.
ZERO drift in either field.

## [t13] FINDING 5 (LOW, tracked): the grammar has no fence tracking
The extractor applies MARKDOWN_ANCHORS to every column-zero line, including
lines inside fenced code blocks. Measured on a scratch root:
  CLAUDE.md contains a fence holding "- Never do the thing." and "# a shell comment"
  $ node scripts/check-retirement-inventory.mjs --repo <scratch> --extract
  claude-md:never-do-the-thing  CLAUDE.md:6  bullet   - Never do the thing.
  claude-md:a-shell-comment     CLAUDE.md:7  heading  # a shell comment
Both are phantom rules. Measured on the REAL roots at this head: ZERO anchors
fall inside a fence, so nothing is wrong today. It fails CLOSED (a phantom
anchor reddens as "rule with NO row"), so it is a false-red trip wire for the
next editor of CLAUDE.md, not a false green. The script's own header claims
"Column zero is load-bearing" and explains indented continuation; it does not
mention fences, and the reason the count is right today is content, not grammar.

## [t14] Grammar false-negative probe (held)
`^\*` and `^\+` bullets: zero in the three roots. Non-.md files under
.claude/skills: zero. Six markdown files, matching the work history's "six
markdown roots". No rule shape I could find escapes the four anchors.

## [t15] Does anything reach the SHIPPED surface?
git diff --name-only origin/main...branch: nothing under src/, bin/, schemas/,
roles/ or tuition/. Confirmed.
The ONE thing that reaches shipped is something the phase FOUND and correctly
did not fix: its own `process.exit()` truncation mechanism also sits at
src/gates/credentials.ts:691, src/gates/suite.ts:1142 and
src/gates/red-witness.ts:574, all invoked as child processes by the gate runner
(src/gates/run.ts:1470 spawnSync with encoding utf8, i.e. a pipe), which is the
user-visible `tiphys gates run`. Pre-existing, out of this phase's declared
files, reported by the implementer for routing. I have NOT demonstrated actual
truncation in any of the three; the mechanism is present and the trigger is
output volume.

## [t16] FINDING 6 (LOW): "466 commands" is 467
Work history: "the checker re-runs all 466 commands on every invocation."
Measured: verified-by 280 + negative-witness 187 = 467.
Per-root extraction counts (16/24/17/11/29/18/32/133 = 280) reproduce EXACTLY.

## [t17] Fix-round contract item 3 (my FIRST check): the not-covered statement
The work history states what its derivations did NOT cover in four places:
(a) the process.exit derivation searched scripts/, bin/, src/ only, naming test/
    and .claude/ as excluded and saying why;
(b) it matched the literal `process.exit(` and would miss an indirect call, and
    says so and says it did not probe for one;
(c) an eight-item "What this phase did NOT cover" section, including the honest
    admission that sixteen rows were once silently misassigned while the checker
    was GREEN, with the capture of that green run;
(d) the C-1 self-correction, where it names widening the SEARCH as what worked.
This is the most honest not-covered statement I have read in this repository.
JUDGEMENT: honest, and one thing it admits IS worse than it sounds, item 8.
"The checker enforces that every rule has a RESOLVED disposition, not that the
disposition is the RIGHT one" is the whole value proposition of the artifact,
and finding 1 is a live instance of exactly that limit rather than a theoretical
one: a row whose disposition is wrong and whose guard is green.

## [t18] Claim greps
Line-based: 51 occurrences. Wrap-insensitive: 51. No wrap misses.
Nearly all hits are inside the fenced appendix (extraction output, i.e. data).
Prose hits are hedged correctly: "I did not find a way to force truncation at
those two sizes, and I am not claiming they are safe"; "I did not find a check
that would separate it from a correct row, and I am not claiming none exists."
Passive grep (measurement 10): 5 lines, 6 occurrences (line 272 straddles a wrap
and the wrap-insensitive form is what found the sixth).
  272 "is caught" x2  - backed by the two captures immediately above.  OK
  279 "is caught"     - narrative, no capture.  minor
  404 "is enforced"   - "C-3 is enforced in shipped code and stated in no
                        instruction channel at all".  THIS IS FINDING 1. FALSE.
  490 "is enforced"   - backed by the script source.  OK
  757 "is enforced"   - "the checker is enforced by the SUITE": verified, the
                        test file runs the checker against the real roots.  OK

## [t19] The suite sentence: I reproduced the CONTROL, not just the claim
Work history failure 1 attribution independently reproduced by me, same clone,
same head 7b2b7f1, same built dist/, one variable changed:
  /opt/node22/bin/node   --test --test-name-pattern "a staged install of the built
    package reproduces the captured contract live" test/doctor.test.ts
    -> # pass 0 # fail 1, exit 1   (fails at test/doctor.test.ts:970)
  /home/user/.toolchains/node-v26.6.0-linux-x64/bin/node  (same command)
    -> # pass 1 # fail 0, exit 0
The base WAS established before the failure was attributed to the change, and
the control is the right one (interpreter isolated, not branch).
Suite sentence completeness: interpreter YES, build state YES, invocation YES,
head YES, pass YES, SKIPPED YES. The fourth qualifier from the 2026-09-16
measurement (git checkout vs git archive) is NOT stated in those words; the
worktree path is named, which implies a git worktree. LOW.
Full-suite re-run: started in this clone (npm ci exit 0, npm run build exit 0,
git status 0 lines) and still running at review close under load average 60 on
4 CPUs. NOT COMPLETED BY ME. I report that rather than implying I saw it.

## VERDICT: FIX-ROUND-NEEDED (narrow)

What I tried to break and how it held:
- Scope. Cut point de9b386 vs main; branch's own diff is exactly its 8 declared
  paths. CLAUDE.md identical at cut point and plan tip. merge-tree clean. HELD.
- The red-witness class. Member A (absent field) and member B (present-but-
  vacuous) are genuinely structurally different, and member B ships its own
  control (--no-execute is the field-checking checker and calls the fixture
  clean). Re-ran the file: 16/16 pass, 0 skipped. HELD, and it is strong.
- Pinned counts over an append-only registry. None. The test refuses a count in
  a comment and asserts set equality by id in both directions. HELD.
- Row/text drift across 280 rows against live anchors: ZERO. HELD.
- Grammar false negatives: no `*`/`+` bullets, no non-md skill files, six
  markdown roots as claimed, per-root counts reproduce exactly. HELD.
- C-1/C-2/C-3 in the new code: spawnSync only, no detached/unref/pid/signals.
  HELD.
- Citations 21/22. authored-bytes, agent-rules-drift, brief-drift all green.
  npm ci / npm run build exit 0, git status clean after build. HELD.
- The suite attribution: I reproduced the two-interpreter control myself. HELD.

What did NOT hold: the CONTENT of two rows, and the script header's claim about
its own screen.

Blocking (narrow, all inside files already on the declaration):
  F1 HIGH   the C-3 GAP row is false (AGENTS.md:496 and
            schemas/assurance-modes.schema.json:37 state C-3). Three sites.
  F2 MEDIUM the R-094 row's verified-by is a shell quoting error; exit 2 usage
            error recorded as a re-verification.
  F3 MEDIUM the screen does not prevent writes and the header says it does.
            Measured: sed -i executed against the audited tree.

Recorded, not blocking:
  F4 MEDIUM the allowlist witness's red arm would delete a tracked directory of
            the real tree if the screen regressed (test/, tracked).
  F5 LOW    no fence tracking in the grammar (fails closed; zero hits today).
  F6 LOW    "466 commands" is 467; m4-conflict-pre-pass.md:60 is a blank line.
  Pre-existing, reaches shipped, NOT this phase's: process.exit() truncation at
  src/gates/credentials.ts:691, src/gates/suite.ts:1142,
  src/gates/red-witness.ts:574. The implementer found and routed it correctly.

If the orchestrator applies DR-0027's reachability test literally, NONE of these
reaches src/, bin/, schemas/, roles/ or tuition/, and none blocks. I still
return FIX-ROUND-NEEDED, because F1 is not a guard gap: it is a false fact in the
delivered artifact whose stated purpose is to stop false facts being carried
forward, and correcting it before it lands is cheaper than correcting `main`.
