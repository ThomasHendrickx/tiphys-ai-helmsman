# M4-P23 clean-room review (structured result, DR-0027 single round)

## phase

M4-P23 (branch claude/m4-p23-retirement-inventory, head 7b2b7f1, base 3b40118)

## verdict

FIX-ROUND-NEEDED

## produced_by

Claude Opus 5 (claude-opus-5)

## framing

Evidence integrity and data loss combined: I assumed every captured exit code was a lie until I re-ran it, and assumed the checker could destroy the tree it audits until I found why it could not (it can).

## derivation_honesty

HONEST, and the most complete not-covered statement I have read in this repository. It is stated in four places: (a) the process.exit derivation names that it searched only scripts/, bin/ and src/, names test/ and .claude/ as excluded and says why; (b) it says it matched the literal "process.exit(" and would miss an indirect call, and that it did not probe for one and does not know; (c) an eight-item "What this phase did NOT cover" section; (d) the C-1 self-correction, which names widening the SEARCH (not thinking harder) as what worked. ONE THING IT ADMITS IS WORSE THAN IT SOUNDS: item 8 says the checker was GREEN while sixteen rows were silently misassigned, and concludes "it enforces that every rule has a RESOLVED disposition, not that the disposition is the RIGHT one". That is the whole value proposition of the artifact, and my finding 1 is a LIVE instance of exactly that limit, not a theoretical one: a row whose disposition is wrong, whose verified-by reproduces forever, and which the guard reports as resolved. The self-correction for C-1 is written up one paragraph AFTER the identical uncorrected error for C-3.

## what_i_tried_to_break

SCOPE: the branch's diff against origin/main is 34 files, but it was cut from the unmerged plan/pstack-borrow-review at de9b386; `git diff --name-only origin/plan/pstack-borrow-review...branch` is exactly the 8 declared paths. CLAUDE.md is byte-identical at the cut point and at the plan-branch tip, so the pre-pass promise ("CLAUDE.md is M4-P23's for the duration") was kept, and no other M4 branch touches CLAUDE.md or .claude/skills relative to that cut point. `git merge-tree --write-tree` exit 0. HELD. RED WITNESSES: member A (absent verified-by, caught by the structural pass) and member B (a present, well-formed, probe-carrying negative witness that exits 0, caught only by execution) are genuinely structurally different, and member B ships its own control because the same fixture is GREEN under --no-execute, which IS the field-checking checker. Re-ran the file in a fresh clone: 16 tests, 16 pass, 0 skipped, exit 0. HELD, and it is the strongest witness pair I have seen here. PINNED COUNTS: none; the test asserts set equality by id in both directions and refuses a count in a comment; test/behaviors.json gains 16 names and loses none. HELD. DRIFT: I checked all 280 rows' `rule` and `text` fields against live anchors: zero drift. Per-root extraction counts (16/24/17/11/29/18/32/133 = 280) reproduce exactly. HELD. GRAMMAR FALSE NEGATIVES: no `*` or `+` bullets in the roots, no non-.md files under .claude/skills, six markdown roots as claimed. HELD. C-1/C-2/C-3: grep of both new files for detached|unref|process.kill|/proc|SIG*|pid|setsid|nohup returns zero hits; spawnSync only; no state read from a log tail. HELD. GUARDS: npm ci exit 0, npm run build exit 0, git status --short 0 lines, check-authored-bytes exit 0, render-agent-rules-gates --check green (21 rows), check-brief-drift exit 0. HELD. SUITE ATTRIBUTION: I reproduced the two-interpreter control myself, same clone, same head, same built dist/, one variable changed: node v22.22.2 fails test/doctor.test.ts:934 (exit 1), node v26.6.0 passes it (exit 0). The base was established before the failure was attributed. HELD. WHAT DID NOT HOLD: the CONTENT of two of the 280 rows, and the script header's claim about its own command screen.

## suite_reproduced

PARTIALLY, and I say which half. Reproduced by me in a fresh `git clone` (a real git checkout, not a `git archive` copy) of the branch at 7b2b7f1, interpreter node v22.22.2 at /opt/node22/bin/node, `npm ci` exit 0, `npm run build` exit 0, `git status --short` 0 lines: `node --test test/retirement-inventory.test.ts` gives 16 tests, 16 pass, 0 fail, 0 skipped, exit 0, 14681ms; `node scripts/check-retirement-inventory.mjs` gives 280 rows against 280 derived anchors, commands EXECUTED, exit 0, 5.5s. Also reproduced the failure-1 control on both interpreters (see above). NOT reproduced: the full `npm test` run. I started it in the same clone and it was still running at review close (226 subtests in, zero failures so far) under a load average of 60 on 4 CPUs. I report that rather than implying I saw it. The work history's suite sentence names interpreter, build state, invocation, head, pass count and SKIPPED count; it does not name the fourth qualifier in those words (git checkout vs git archive), but it names the worktree path, which implies a git worktree.

## citation_hit_rate

21 of 22 = 95.5%. I extracted every resolving-form citation (path.ext:LINE, outside backticks, fenced captured output excluded) from delivery/work-history/m4-p23.md and delivery/plan/cutover/retirement-inventory.md, 22 distinct, and opened each line. One miss: delivery/plan/m4-conflict-pre-pass.md:60 is a BLANK line; the wave-1b row that names M4-P23 is at :64. It is in range, so the citations gate stays green and the citation points at nothing. Separately I verified all 280 JSON `rule` fields against live anchors: zero drift.

## not_read

I did not read delivery/plan/kernel-plan-m4.md in full (3719 lines); I read the M4-P23 section at :3133-:3216 and the M4-P24/M4-P25 sections that consume this inventory. I did not read the nine new decision records (DR-0035..DR-0043), the ten delivery/evidence/m4-probes/ documents, delivery/plan/m4-intake.md, delivery/plan/pstack-borrow-review.md or the STATE.md and DR-0010 diffs: all of those arrive from the cut point plan/pstack-borrow-review and are not this phase's changes. I read delivery/verification/m4-prototype-probes.md only via the work history's statement about it plus its title line; I did not independently check its twelve items against the inventory. I did not read the 6138-line retirement-inventory.json row by row; I read it programmatically (all 280 rows for structure, status/disposition consistency, exit-code distribution, error-shaped outputs, quote parity, rule/text drift, and the target tree of every verified-by command) and read individual rows by hand only where a probe flagged them. I did not complete the full npm test run. I did not run the citations, scope, suite or red-witness gates through bin/tiphys.ts.

## findings

### 1. [HIGH] The C-3 GAP row is FALSE. The inventory's headline gap claim, repeated in three places, asserts that constraint C-3 is stated in no instruction channel. It is stated in AGENTS.md and in a shipped schema.

- **category**: false-evidence

- **citation**: delivery/plan/cutover/retirement-inventory.md:151, AGENTS.md:496, schemas/assurance-modes.schema.json:37

- **evidence**: Row claude-md:never-auto-background-a-long-running-process-c-3 has status GAP, disposition KEEP, and gap field: "C-3 is enforced in shipped code (src/spawn.ts, src/gates/run.ts) and stated in NO instruction channel: not in a brief, not in a checklist, and not in the mechanism index". The same claim is at delivery/work-history/m4-p23.md:404 ("the loudest of them") and delivery/plan/cutover/retirement-inventory.md:151. REFUTED: AGENTS.md:496-497 reads "AND THE C-3 DISTINCTION, so a reader does not have to resolve two rules that look opposed by guessing. C-3 forbids a kernel COMMAND from putting long-running work out of the operator's sight without being told to." Also schemas/assurance-modes.schema.json:37: "CONSTRAINTS C-2 AND C-3 BIND THIS LIST: no stage is completed, detected or excluded by process liveness, by a signal, or by a detached long-running process." MECHANISM: the row's verified-by is `grep -c 'auto-background' AGENTS.md roles/implementer.md checklists/hazard-review.yaml checklists/clean-room.yaml tuition/mechanism-index.yaml`, exit 1. AGENTS.md was searched; only the literal token `auto-background` was searched for, and AGENTS.md states the rule without that token. Exit 1 means the WORD is absent, not the RULE. Searching the token `C-3` finds it at once. This is the identical failure the same work history self-corrects for C-1 one paragraph later: it widened the TREES searched and not the SEARCH TERMS. The checker cannot catch it, because a grep for an absent token reproduces exit 1 forever.

- **reaches_shipped**: It does NOT make a shipped artifact wrong today: no file under src/, bin/, schemas/, roles/ or tuition/ is changed by this branch, and the row's disposition is KEEP so nothing is deleted. The reach is indirect: delivery/plan/kernel-plan-m4.md:3315 has M4-P25 consume PORT rows only, so cutover is not gated by it, but the gap list is the reasoning a later phase acts on, and the obvious action on a false gap is to add a duplicate C-3 clause to a shipped brief. Tracked reach, not a shipped-wrong defect.

- **recommendation**: Re-verify the row against the RULE rather than a token: `grep -c 'C-3' AGENTS.md` returns 2. Re-disposition it PORTED/PORT with destination AGENTS.md (probe "C-3", negative witness a sibling brief that does not carry it), or, if the author judges the AGENTS.md statement weaker than CLAUDE.md's, keep it a GAP but restate the gap field as what is actually missing (a mechanism-index entry) rather than "no instruction channel". Correct all three sites. Generalise the lesson already in the document: a verified-by that greps one literal token proves something about the token, not about the rule.


### 2. [MEDIUM] One verified-by command is a shell quoting error. It never searched anything, and its usage error is recorded as a re-verification.

- **category**: false-evidence

- **citation**: delivery/plan/cutover/retirement-inventory.json (row claude-md:r-094-is-partially-delivered-and-the-half-that-i)

- **evidence**: Row claude-md:r-094-is-partially-delivered-and-the-half-that-i carries verified-by command `grep -c '-- '--registry'' scripts/m2-exit-test.sh`, exit 2, output "grep: unrecognized option '-- --registry' / Usage: grep [OPTION]... PATTERNS [FILE]... / Try 'grep --help' for more information." The shell concatenation yields the argument `-- --registry`, which grep rejects as an option. The row's note asserts "Re-verified in this phase and still TRUE: --registry does not occur in scripts/m2-exit-test.sh". Nothing was verified. CLAUDE.md's fix-round contract names this exact bite verbatim: "a usage error read as a clean result". The checker passes it because exit 2 reproduces, and kernelPathsNamed is satisfied because scripts/m2-exit-test.sh exists. I scanned all 467 captured outputs for error-shaped text (unrecognized|Usage:|No such file|not found|fatal:|invalid option|command not found|error:): this is the ONLY one, so it is an instance and not a class.

- **reaches_shipped**: No. delivery/plan/cutover/retirement-inventory.json is not under src/, bin/, schemas/, roles/ or tuition/. Recorded, not blocking under DR-0027's reachability test.

- **recommendation**: Rewrite as `grep -c -- --registry scripts/m2-exit-test.sh` or `grep -c registry scripts/m2-exit-test.sh` and recapture. Then consider whether the checker should treat a recorded exit of 2 from grep, or 126/127 from anything, as a finding in its own right: a command that failed to RUN is not a command that answered, and the checker currently cannot tell those apart.


### 3. [MEDIUM] The command screen does not prevent writes to the tree it audits, and the script's own header states that it does. Measured, not read.

- **category**: data-loss

- **citation**: scripts/check-retirement-inventory.mjs:37 and scripts/check-retirement-inventory.mjs:208

- **evidence**: scripts/check-retirement-inventory.mjs:37 states "This is a checker for a tracked, reviewed file, not a sandbox, and the restriction is here so a careless row cannot write to the tree it is auditing." ALLOWED_FIRST_TOKENS includes git, sed, awk and node, all write-capable, and FORBIDDEN matches only [<>], $( and backticks. Probing the exported screenCommand at this head: ALLOWED "git checkout -- .", "git clean -fdx", "git reset --hard HEAD~5", "sed -i s/a/b/ src/gates/scope.ts", "node -e process.exit(0)" (plain parens are not $( ), "awk -i inplace ..."; refused only "rm", "curl", "tee". CLAUDE.md standing warning 8 names `git checkout --` as the destructive one, and the repository has already lost four rounds of uncommitted work to it. DEMONSTRATED end to end in a scratch root at /tmp/claude-0/screen-probe with a row whose verified-by was `sed -i s/ORIGINAL/DESTROYED/ src/victim.txt`: BEFORE "IMPORTANT ORIGINAL CONTENT", checker prints "5 row(s) against 5 derived rule anchor(s), commands EXECUTED", AFTER "IMPORTANT DESTROYED CONTENT". The checker runs with cwd = the repository root, and test/retirement-inventory.test.ts runs it against the REAL repository root, so this executes on every `npm test`.

- **reaches_shipped**: No. scripts/ is explicitly outside DR-0027's shipped surface (src/, bin/, schemas/, roles/, tuition/) and the checker is not wired into gate-registry.yaml or gates.manifest.json. Recorded, not blocking. What makes it worth raising anyway is that the defect is a FALSE CLAIM IN A HEADER about a guard, which is this repository's named dominant failure, in a phase whose subject is exactly that failure.

- **recommendation**: Either tighten the screen (deny -i/--in-place for sed and awk, deny the write-capable git subcommands by second token, deny node -e/--eval; the existing first-token split already gives the segment boundaries) or, better, delete the claim and replace it with what is true: the screen keeps a row from reaching for a tool nobody expected, and it does not make the checker safe to run on a tree with uncommitted work. A guard's comment is read as its contract.


### 4. [MEDIUM] The allowlist witness's RED arm is destructive to the real working tree. If the screen ever regresses, the test deletes a tracked directory before its assertion fires.

- **category**: data-loss

- **citation**: test/retirement-inventory.test.ts:177

- **evidence**: test/retirement-inventory.test.ts:177 sets a row's verified-by command to "rm -rf delivery/plan/cutover" and calls check(), which spawns the checker with --repo pointed at the real repository root (the `repo` constant is fileURLToPath(new URL("..", import.meta.url))). runCommand executes with cwd = that root. Today the screen refuses `rm`, so nothing runs, and the test even asserts the inventory file still exists afterwards, which is good practice. But the witness's red arm is "the screen failed", and in that state the command executes against the real tree. A witness should not be able to destroy its subject. Combined with finding 3, the write-capable allowed tools mean a mistyped row in a fix round can do the same thing without the screen regressing at all.

- **reaches_shipped**: No. test/ is outside DR-0027's shipped surface, and the trigger is a future edit to the screen, so this is reachable only by a future editor of the guard. TRACKED, not blocking. The loss would be recoverable from git for committed content, but not for uncommitted work in that directory.

- **recommendation**: Point --repo at a scratch copy for the destructive fixture (mkdtemp plus the three roots, which the other negative fixtures already effectively need), or use a refused-but-harmless first token such as `printf` so that a screen regression yields a no-op rather than a delete.


### 5. [LOW] The extraction grammar has no fenced-code-block tracking, so a column-zero bullet, heading or bolded line inside a code fence becomes a phantom rule anchor.

- **category**: guard-fragility

- **citation**: scripts/check-retirement-inventory.mjs:96

- **evidence**: extractAnchors applies MARKDOWN_ANCHORS to every line of every markdown root with no fence state. Measured on a scratch root whose CLAUDE.md holds a fence containing "- Never do the thing." and "# a shell comment": `--extract` emits claude-md:never-do-the-thing CLAUDE.md:6 bullet and claude-md:a-shell-comment CLAUDE.md:7 heading. Measured on the REAL roots at this head: ZERO anchors fall inside a fence, so the 280 is right today by content rather than by grammar. The script header discusses column zero and indented continuation at length and does not mention fences.

- **reaches_shipped**: No, and it fails CLOSED: a phantom anchor reddens as "rule at X:N has NO row", never as a silent pass. It is a false-red trip wire for the next editor of CLAUDE.md or the skills tree, both of which are dense with fenced shell blocks whose comments start with '#'.

- **recommendation**: Track ``` and ~~~ state in the line loop and skip fenced lines, or state in the header that fences are deliberately in scope and why. Either is fine; the current silence is what makes it a surprise.


### 6. [LOW] Two small numeric inaccuracies: the command count is 467 not 466, and one citation resolves to a blank line.

- **category**: count-accuracy

- **citation**: delivery/work-history/m4-p23.md:198

- **evidence**: delivery/work-history/m4-p23.md states "the checker re-runs all 466 commands on every invocation". Measured: 280 verified-by plus 187 negative-witness = 467. Separately, delivery/work-history/m4-p23.md:198 cites delivery/plan/m4-conflict-pre-pass.md:60 for "this phase was itself dispatched in a concurrent wave"; line 60 is blank and the wave-1b table row naming M4-P23 is at line 64. In range, so the citations gate stays green.

- **reaches_shipped**: No. Both are in delivery/ paperwork. Recorded only. Noted because this repository's own rule is that a quoted number starts an investigation, and I would rather the next reader not spend one.

- **recommendation**: 466 -> 467; :60 -> :64.


### 7. [MEDIUM] PRE-EXISTING, NOT THIS PHASE, BUT IT IS THE ONE THING HERE THAT REACHES SHIPPED CODE: the process.exit() truncation mechanism the phase measured on its own script also sits in three shipped gate modules. The implementer found it, correctly did not fix it, and routed it. I am re-raising it so it is not lost with this review.

- **category**: pre-existing-shipped

- **citation**: src/gates/suite.ts:1142, src/gates/credentials.ts:691, src/gates/red-witness.ts:574, src/gates/run.ts:1470

- **evidence**: The phase's published derivation (`grep -rn "process\.exit(" scripts/ bin/ src/`, full output in the work history) names src/gates/credentials.ts:691, src/gates/suite.ts:1142 and src/gates/red-witness.ts:574, each an exit-with-the-return-value tail on a program that writes a report to stdout. I verified all three lines exist at this head and have that shape. The gate runner invokes gates as child processes at src/gates/run.ts:1470 with spawnSync and encoding utf8, i.e. through a pipe, which is the condition under which the child's queued stdout writes are asynchronous and process.exit() discards them. The phase measured exactly this on its own checker: three of fifteen tests failed, a DIFFERENT three failed on the next run, and the fix was process.exitCode. The implementer states honestly that it has not bitten the two scripts it measured (2110 and 154 bytes of output) and that the trigger is output VOLUME, which is data-dependent.

- **reaches_shipped**: YES. src/gates/credentials.ts, src/gates/suite.ts and src/gates/red-witness.ts are shipped, and they are reached by the user-visible `tiphys gates run`. This is the answer to the question this dispatch asked me to prioritise. It is NOT caused by this branch and NOT in its declared files, so it does not block this merge; it needs an owner or orchestrator routing decision to a phase that owns src/gates/.

- **recommendation**: Route a separate change replacing `process.exit(main(...))` with `process.exitCode = main(...)` at those three sites, with a red witness that forces a large report through a pipe and shows the tail lost before and present after. I did NOT demonstrate truncation in any of the three; the mechanism is present and the trigger has not been forced, and I state that rather than implying otherwise.

