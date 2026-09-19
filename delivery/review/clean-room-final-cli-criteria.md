# Clean-room final sweep, group `cli`, CRITERIA CONTRACT

- head: ad2428b76ef6f53f75b0d7f94c7db50463e077b7
- group: cli (src/cli.ts, src/commands/**, bin/**, src/status.ts, src/brief.ts)
- contract: criteria
- clone: /tmp/claude-0/-home-user/49c9c4fa-6f01-5020-aa81-c87700265964/scratchpad/sweep-cli-criteria/clone (read only, detached at the head)
- phases walked: M1-P1, M1-P2, M3-P5, M3-P6, M4-P16, M4-P18, M4-P24

## The suite, complete sentence

Interpreter node v26.6.0 (`/tmp/claude-0/n26/bin/node`), `dist/` BUILT
(`npm ci` exit 0, `npm run build` exit 0, `git status --porcelain` empty after
the build), invocation `npm test` from the clone root:

    tests 1341, pass 1340, fail 1, cancelled 0, SKIPPED 0, todo 0,
    duration_ms 320181, exit 1

The single failure is `test/gates.test.ts:3571`, and it is NOT a defect of this
head. It is CLAUDE.md standing warning 1's interpreter-path trap, diagnosed by
changing exactly one variable:

    namei -m /tmp/claude-0/n26/bin/node  ->  drwx------ claude-0

`runCliUnprivileged` drops to an unprivileged uid and spawns `node` from PATH;
that `node` is the scratch toolchain under a 0700 directory, so the spawn is
`EACCES`. Re-running that one test with the runner still n26 and PATH resolving
`node` to `/opt/node22/bin/node`:

    PATH=/opt/node22/bin:/usr/bin:/bin /tmp/claude-0/n26/bin/node --test \
      --test-name-pattern "a precondition command exiting nonzero is error, not a skip" \
      test/gates.test.ts
    -> tests 1, pass 1, fail 0, skipped 0

Same head, same working tree, one variable changed. Recorded rather than
waved through.

## What this review is, and the one declared deviation

This is the CRITERIA contract half of the DR-0012 pair for group `cli` at the
final state of M4. The JSON verdict carries `"phase": "M1-P1"` because the
schema takes one phase id and this group spans seven. The phases actually
walked are M1-P1, M1-P2, M3-P5, M3-P6, M4-P16, M4-P18 and M4-P24, and every
`criteria[].id` in the verdict is written `<phase>/<criterion id>` so a reader
can tell which plan section a walk belongs to. That deviation is declared here
rather than left to be discovered, and it means `verdict-criteria-complete`
cannot join this document to one plan phase.

## Dispatch-table integrity (DR-0046), RUN rather than read

DR-0046 serialised `src/cli.ts` through M4 because four phases edit one table.
Parsed from the source and then executed:

    rows: 20
    duplicate NAMES (shadowing): []
    duplicate HANDLERS (two names, one impl): []
    name/handler mismatches: []
    imported but NOT registered: []

And the agreement between the usage line and the dispatch was RUN: the usage
line printed by `node bin/tiphys.ts zzz` was split into its 20 names and each
was invoked; none of them re-printed the top-level usage line, so every
advertised name reaches its own handler rather than falling through. Each of
the 20 answers with one diagnostic line and a meaningful exit code, and none
produces a stack trace (bin/tiphys.ts:33 is the handler that guarantees this,
and it holds for all 20).

Exit codes across the surface are three-valued where they must be:
`tiphys next` returns 3 for "work remains", 0 for "every category empty" and 1
for "the command failed", measured in all three states below.

## Findings

### CR-F01 (HIGH) `tiphys spawn` and all four `tiphys lock` subcommands hang forever on a non-regular file, and strand a branch, a worktree, a pool record and a task id

REPRODUCED at this head, not reasoned about. `src/brief.ts` reads two paths
bare (src/brief.ts:43 and src/brief.ts:56) and `src/commands/lock.ts` reaches
the lease the same way. `git log --oneline -- src/brief.ts` returns ONE commit
(`6ec0482 M1-P4`), so nothing has touched it since M1.

Member A, the fleet warnings file (src/brief.ts:56):

    mkfifo warnings.md
    timeout 60 node bin/tiphys.ts spawn --task t-0101 --project .../projects/demo \
      --brief /tmp/brief.md --shape ship --exec /bin/true
    -> EXIT=124 elapsed_s=60, stdout EMPTY

Residue left behind by that killed run: `tasks/t-0101`, `worktrees/t-0101`,
`worktrees/t-0101.pool.json`, and `task/t-0101` in the project clone.

Member B, structurally different because the path is an ARGUMENT the caller
names rather than fleet state (src/brief.ts:43):

    mkfifo /tmp/brieffifo.md
    timeout 45 node bin/tiphys.ts spawn --task t-0102 ... --brief /tmp/brieffifo.md ...
    -> EXIT=124 elapsed_s=45

Member C, a different command and a different file
(`state/orchestrator.lock`, `mkfifo`d in a fresh `tiphys init` fleet):

    lock status              EXIT=124  elapsed=20s
    lock acquire             EXIT=124  elapsed=20s
    lock release --holder x  EXIT=124  elapsed=20s
    lock renew  --holder x   EXIT=124  elapsed=20s

THE ASYMMETRY IS THE PROOF THAT THIS IS A COMPOSITION DEFECT AND NOT A MISSING
FEATURE. In the SAME fleet home, against the SAME FIFO, in the same second:

    node bin/tiphys.ts doctor  -> CHECK lock FAIL ... is a named pipe, not a
                                  regular file, so it was not opened   (0s)
    node bin/tiphys.ts next    -> exit 0                                (0s)
    node bin/tiphys.ts lock status -> hangs, killed at 20s

M1-P5 hardened the GUARD's reader. M3-P5 bound only NEW code (D-M3-27) and
said so. M4 never opened the file. So the kernel now contains two readers of
one path, one of which establishes the entry type and one of which does not,
and the one that does not is the one a consumer types.

I did NOT overstate reachability, and I measured the case that would have:
`--brief <(echo "generated brief")` (bash process substitution, /dev/fd/63)
spawns normally, exit 0, elapsed 0s. The trigger is a genuine FIFO, a blocking
device node, or a stalled mount, not an ordinary shell idiom.

WHY HIGH. An unbounded hang with zero output is indistinguishable from work in
progress, which is the T-008 shape the whole repository is built against; it
ships in the published tarball; and it leaks four allocated resources per
occurrence with no diagnostic telling the operator what to clean up.

WHAT IS ALREADY KNOWN, stated so the orchestrator is not told something it
believes it fixed. delivery/STATE.md:1458 records this exact class, names
`src/brief.ts`, `teardown`, "four `lock` subcommands" and `spawn`, and predicts
the exact residue I measured. It is a DECLARED, TRACKED residue that no phase
took. This review's contribution is that it is still live at the FINAL state,
with a reproduction, in a milestone whose purpose is cutover. Resolving it may
be an owner decision to accept rather than an edit, and that is for the
orchestrator, not for me.

### CR-F02 (MEDIUM) `tiphys pool list` and doctor's `CHECK worktrees` report an empty pool as a POSITIVE fact when the task record they derive it from did not read

REPRODUCED, and it needs no permissions trick. src/pool.ts:769 drops a task
whose `meta.json` did not read, and src/pool.ts:759 swallows an unlistable
`tasks/` into an empty array. Neither drop has an `unknown` channel.

Fixture: a fresh `tiphys init` fleet, one open task `tasks/t-0001/meta.json`
truncated mid-write (the literal state an interrupted spawn or a reclaimed
session leaves, which is the state M4-P19 exists to report):

    node bin/tiphys.ts pool list
    -> exit 0, ZERO lines of output

    node bin/tiphys.ts doctor
    -> CHECK tasks     WARN 1 open of 1 (t-0001)
    -> CHECK worktrees PASS no pool worktrees
    -> exit 0

ONE doctor run contradicts itself: `CHECK tasks` says a task is there and
unreadable, `CHECK worktrees` asserts "no pool worktrees", a positive claim it
has not established. With an INTACT meta.json the same fixture gives
`pool list -> t-0001 missing unreconstructable (unresolved: remote, branch)`
and `CHECK worktrees WARN 1 of 1 pool entr(ies) have no pool record beside
them`, so the entry the feature exists to surface is exactly what the drop
hides.

I also settled the site M4-P24 left open by name. delivery/work-history/m4-p24.md:914
records that the implementer tried twice to reach src/pool.ts:759 and could
not, because this container is uid 0. I reached it by dropping privilege:

    chmod 000 tasks
    runuser -u nobody -- node dist/bin/tiphys.js pool list
    -> exit 0, ZERO lines of output          (root: one line naming t-0001)

    runuser -u nobody -- node dist/bin/tiphys.js doctor
    -> CHECK tasks     WARN tasks/ ... could not be listed (EACCES) ...
    -> CHECK worktrees PASS no pool worktrees
    -> exit 0

So src/pool.ts:759 IS reachable, and its answer is "empty" with no diagnostic.

THE ONE PIECE OF GOOD NEWS, measured rather than assumed: `tiphys next` is NOT
fooled. `openTasks` (src/commands/next.ts:294) has its own try/catch and
reports the same condition into `unknown`, so `next` prints `unknown: 1` and
exits 3 in both states above. The stop condition, which is the consumer where
a false green would be worst, is protected by a sibling reader rather than by
`poolList` being correct.

WHY MEDIUM AND NOT HIGH, stated so the ranking can be argued with. Nothing is
destroyed and the safety-critical consumer holds. What is lost is that two
shipped reporting commands answer a question they did not establish, which is
the exact "empty by construction reported as empty by observation" sentence
M4-P24's own header (src/commands/next.ts:40) sets as the standard, applied
inside `next.ts` and not inside the module `next.ts`, `doctor` and `pool list`
all call.

### CR-F03 (MEDIUM) `brief compose --role orchestrator` is offered by the command's own usage line and cannot work in the published package

The role vocabulary is six members (src/roles.ts:54, schemas/role-brief.schema.json:25)
and the composer resolves every one of them to `roles/<id>.md`
(src/commands/brief.ts:113). The orchestrator's brief is shipped as `AGENTS.md`
at the package root, with `role: orchestrator` frontmatter, which roles/README.md
states explicitly. `roles/` contains five briefs and no `orchestrator.md`.

Measured against the PUBLISHED TARBALL, not the dev tree
(`npm pack` then `npm install` into a temporary prefix):

    prefix/node_modules/@tiphys/kernel/AGENTS.md    present, 35591 bytes
    prefix/node_modules/@tiphys/kernel/roles/       5 briefs, no orchestrator.md

    tiphys brief compose --role orchestrator --phase .../plan.example.yaml --phase-id M9-P1
    -> tiphys brief compose: role brief .../roles/orchestrator.md: ... does not exist
    -> exit 1

    tiphys brief compose --role nonsense ...
    -> unknown role nonsense; the roles are orchestrator, investigator,
       plan-writer, adversarial-plan-reviewer, implementer, clean-room-reviewer
    -> exit 1

The diagnostic actively misleads: the brief DOES exist and ships in the same
tarball, at a path the resolver never looks in. A consumer reads "does not
exist" as a broken install.

This is a composition defect no per-phase review could have caught: M3-P5 built
the six-member resolver over `roles/<id>.md`, M3-P6 added two files to that
directory, and M3-P9 put the sixth brief somewhere else. Each is correct alone.

### CR-F04 (LOW) the CLI has no help affordance: `--help` and `help` both exit 64 with an empty stdout

    node bin/tiphys.ts --help   -> exit 64, stdout 0 bytes, usage on stderr
    node bin/tiphys.ts help     -> exit 64

This satisfies M1-P1 criterion 4 to the letter (an unknown subcommand prints
usage to stderr and exits 64) and it is still the first thing a consumer types.
`tiphys --help | less` shows nothing. It is filed LOW because the usage line IS
printed and no wrong answer is produced.

## The criterion walk

Every row below says what I RAN or READ and whether it holds NOW, at
`ad2428b`. A criterion I could not reach says so.

### M1-P1 (project ground)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES | `npm ci` exit 0, `npm run build` exit 0. `npm test` exit 1 with 1341/1340/1 fail/0 skipped; the one failure is the interpreter-path artifact diagnosed at the top of this document, so the criterion holds in substance and the deviation is recorded rather than waved |
| 2 | YES | `dist/bin/tiphys.js` present; `git status --porcelain` EMPTY after the build |
| 3 | YES | `node bin/tiphys.ts version` -> `0.1.0` exit 0; `node dist/bin/tiphys.js version` -> `0.1.0` exit 0; `cmp` of the two captures reports BYTE-IDENTICAL; `package.json` version is `0.1.0` |
| 4 | YES | `node bin/tiphys.ts no-such-command` -> exit 64, usage line on stderr |
| 5 | YES | engines.node `>=26`, license `Apache-2.0`, `files` contains `dist`, `prepack` = `npm run build`; `LICENSE` head is the Apache License |
| 6 | NOT REACHED | `.github/workflows/gates.yml` is outside this group's declared paths and outside the criteria contract's reach without a CI run; not walked and not asserted |
| 7 | NOT REACHED | the phase PR's gates check is a historical GitHub observation; no artifact in the tree settles it |
| 8 | YES | `git ls-files` counts: bin 1, schemas 21, roles 7, tuition 17 |
| 9 | YES | both tsconfigs set erasableSyntaxOnly, rewriteRelativeImportExtensions, verbatimModuleSyntax true; tsconfig.test.json sets noEmit true and references ./tsconfig.src.json |
| 10 | NOT REACHED | the deliberate-type-error demonstration was to be captured in the M1-P1 work history and reverted; it is not re-runnable against the final state without editing the tree, which this review does not do |
| 11 | YES | `npm pack` exit 0 -> `tiphys-kernel-0.1.0.tgz`; `npm install` of that tarball into a temporary prefix exit 0; `prefix/node_modules/.bin/tiphys version` -> `0.1.0` exit 0 |
| 12 | YES | `test/behaviors.json` parses; 1217 behavior keys; `version-output` and `unknown-subcommand-exit` both present |

### M1-P2 (init and doctor)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES | `tiphys init fleet1` exit 0; charter/ decisions/ state/ tasks/ worktrees/ projects/ backlog.md package.json .gitignore .git all created; `git rev-list --count HEAD` = 1. A `status/` directory is ALSO created now, which M4-P18 added; that is an addition, not a loss |
| 2 | YES | second `init` -> exit 1, "is already initialized" |
| 3 | YES | check-ignore exit 0 for state/, worktrees/, projects/; exit 1 for decisions/, charter/. `status/anything` exits 1, so M4-P18's relocated durable document is tracked, which is the intent |
| 4 | YES | `doctor` in the healthy fleet: exit 0, one CHECK line per step-3 check (node, git, gh, layout, remote, lock, beacon, identity) plus six later additions, none FAIL |
| 5 | YES | with `decisions/` deleted: `CHECK layout FAIL missing decisions/`, exit 1 |
| 6 | YES | `doctor` in a non-fleet directory: exit 1 |
| 7 | NOT REACHED | the HOME-and-GIT_CONFIG isolation arm was not re-run. What I DID measure: the bootstrap commit's author AND committer are `Tiphys Fleet <fleet@tiphys.invalid>`, so the deterministic identity half holds; the "no global config was created" half is unwalked |
| 8 | YES | both directions in one fleet: `gh` absent -> `CHECK gh WARN`, exit 0; `doctor --for full` -> `CHECK gh FAIL ... (required for profile full)` and `CHECK remote FAIL`, exit 1 |
| 9 | YES | behaviors registry parses and resolves by name; see the suite sentence for the run |

### M3-P5 (authoring-role briefs, the finding format, brief compose)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES | `validate --type role-brief` exit 0 for investigator, plan-writer, adversarial-plan-reviewer |
| 2 | YES, both directions | in a hardlink mirror of the kernel, moving `schemas/report.schema.json` away: `mandated-reading path schemas/report.schema.json does not exist (looked for ...)`, exit 1; restoring it returns exit 0 |
| 3 | YES, both directions | `brief compose --role plan-writer --phase templates/plan.example.yaml --phase-id M9-P1` exit 0, 255 lines, ordered `## Mandated reading, in order` (line 7), `# Brief body` (line 33), `# Phase M9-P1` (line 190). `--phase-id M1-P1`, absent from that plan, exits 1 naming the id |
| 3b | YES | I read `schemas/plan.schema.json`'s phase `required` array at run time (15 names: id, branch, intent, grounding, severity, verified-root-cause, steps, files-to-touch, extras, acceptance, hazard-classes, migrations, conflicts-with, parallelizable, citations) and found a rendered `### <name>` block for every one of the 15 in the composed output, plus `### fill-in`. Driven from the schema, not from a hand-written list. I did NOT run the drop-a-field red arm, because that means editing the renderer; the green half is measured and the red half is carried by the registered tests |
| 4 | NOT REACHED | the SC-001 process-doc/role-table agreement is a two-document prose comparison outside this group's paths; not walked |
| 5 | NOT REACHED | the three `finding.schema.json` dangerous-instance rejections are schema work, not CLI surface; not walked |
| 6 | NOT REACHED | the `--type report` repro-reference rule is schema work; not walked |
| 6b | PARTIAL | `_shared-dispatch-contract.md` exists as the single copy and the composed plan-writer brief carries `## clause incremental-output:` (line 118) and `## clause beacon-is-not-a-claim:` (line 169) with the artifact-in-the-first-minutes wording, so the include resolves. The delete-a-heading red arm was not run |
| 6c | YES, both directions, with a real mkfifo | `mkfifo schemas/report.schema.json` then compose: EXIT=1 in 226ms, stderr `... is a named pipe, not a regular file, so it was not opened`. Restoring a regular file returns exit 0. This is the criterion that makes CR-F01 so pointed: the composer establishes the entry type and `src/brief.ts`, which the same phase's grounding named, still does not |
| 7 | PARTIAL | the suite result is the sentence at the top of this document; the clause-map row count was not re-derived |

### M3-P6 (delivery-role briefs)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES | `validate --type role-brief` exit 0 for implementer and clean-room-reviewer |
| 2 | PARTIAL | run against the INSTALLED TARBALL: the composed implementer brief carries exactly six `## section ` headings, all non-empty: mandated-reading, phase-scope, push-protocol, gate-list, environment-warnings, reporting-contract. The delete-a-section red arm (one witness per section) was not run |
| 3 | NOT REACHED | the byte-identity of the composed gate-list block against `gate-registry.yaml`'s render, and the `check-brief-drift.mjs` red arm, are the `brief-drift` gate's territory and were not run here |
| 4 | YES | `grep -nEi "gh pr create\|pr merge\|open the PR"` over the composed implementer brief: ZERO hits |
| 5 | YES, both directions, through `spawn` rather than through prose | with no fleet `warnings.md`: `cmp tasks/t-0100/brief.md /tmp/brief.md` reports byte-identical. With `warnings.md` = "WARNING ONE\nWARNING TWO\n": `tasks/t-0110/brief.md` is the brief body then both warning lines verbatim |
| 6 | PARTIAL | suite sentence at the top; the thirteen clause-map rows were not re-derived |
| 7 | NOT REACHED | the clause-id/body-anchor round trip in both directions is a registered test, not re-run here |
| 8 | NOT REACHED | the mechanism-index seed superset assertion was not walked |
| 8b | NOT REACHED | the `destructive-authority` conjuncts and the `gates.manifest.json` path check were read as present (`## clause destructive-authority:` at line 197 of the composed brief) but not walked in both directions |
| 9 | PARTIAL | `## clause claim-grep:` (line 287) and `## clause fix-round-mechanism:` (line 312) are present in the composed implementer brief; the verbatim-command comparison and the weaken-it red arms were not run |
| 9d | NOT REACHED | the dispatch-clause text specificity in both briefs, both directions, was not walked |
| 10 | YES, both directions | `--review-contract criteria` and `--review-contract hazard` both exit 0 and differ: the hazard brief carries `## clause review-contract-hazard` with "DO NOT BEGIN FROM THE ACCEPTANCE CRITERIA", the criteria brief carries `## clause review-contract-criteria` with the "all acceptance criteria met" sentence. `--review-contract nonsense` -> `unknown review contract nonsense; the contracts are criteria, hazard`, exit 1 |
| 11 | NOT REACHED | the executable brief-drift wiring witness was not run |

### M4-P16 (fleet rehydration)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES | `git clone fleet1 fleetclone` carries backlog.md, package.json, .gitignore, charter/, decisions/, status/, tasks/ and none of state/, worktrees/, projects/. `resume` -> exactly three lines `REBUILT state/`, `REBUILT worktrees/`, `REBUILT projects/`, exit 0; then `doctor` -> `CHECK layout PASS` |
| 2 | YES | in a copy with `.git` removed: exit 1, one stderr line naming the absent `.git` and offering `tiphys init` as the remedy. `find . -mindepth 1 \| sort \| sha256sum` before and after: DIGESTS EQUAL |
| 3 | YES | on the complete fleet: exit 0, zero REBUILT lines, twice consecutively |
| 4 | YES, dangerous state | live fleet with `worktrees/t-001/scratch.txt` uncommitted and an unexpired `state/orchestrator.lock`: `resume` exit 0, both files BYTE-IDENTICAL by sha256 before and after |
| 5 | YES, structurally different from 4 | same live fleet with `state/` removed and `worktrees/` present: exactly one `REBUILT state/` line, exit 0, and `worktrees/t-001/scratch.txt` sha256 unchanged |
| 6 | YES | second `init` on the cloned fleet: exit 1 AND the message names the remedy token: "run tiphys resume to rebuild the ephemeral directories a clone does not carry" |
| 7 | YES | fifteen `resume`-named behaviors present in `test/behaviors.json` by name; no count asserted |

### M4-P18 (fleet-state sync)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES in substance, with the criterion's own wording noted | modified `backlog.md` (durable) and `state/scratch.txt` (ephemeral): `sync` -> `COMMITTED backlog.md`, `PUSHED origin`, exit 0, and `git show --name-only HEAD` names only durable paths. The criterion's "afterwards git status lists exactly the ephemeral path" cannot hold literally, because an ephemeral path under `state/` is gitignored and `git status --porcelain` never lists it; after `sync` the tree is clean. The property the criterion is FOR (exactly the durable file was committed) holds |
| 2 | YES | appended a fourth prefix `scratchpad/` to the fleet `.gitignore`, created `scratchpad/f.txt`, ran `sync` with NO source change: only `.gitignore` was committed and the new prefix was excluded by the same derivation |
| 3 | YES, dangerous state member A | unstaged `state/orchestrator.lock` present: `sync` exit 0 and `git show --stat HEAD \| grep -c "^state/"` = 0 |
| 4 | YES, structurally different, with a correction to the criterion's method | `git add -A` does NOT stage an ignored path, so that literal recipe reaches the green arm; forcing the dangerous state with `git add -f state/orchestrator.lock` gives exactly what the criterion asks for: `tiphys sync: state/orchestrator.lock is staged and is ephemeral by .gitignore:1 state/; unstage it with git restore --staged -- ... and re-run, nothing was committed`, exit 1, and `git log --oneline -1` is unchanged |
| 5 | YES | remote URL repointed at `/nonexistent/path/to/remote.git`: exit 1 and stderr carries git's OWN first stderr line, `fatal: '/nonexistent/path/to/remote.git' does not appear to be a git repository` |
| 6 | YES | commit subjects are `tiphys sync: N durable path(s)`; a case-insensitive grep of the last three commits for claude, anthropic, gpt, copilot, opus, sonnet, ai-generated returns nothing |
| 7 | YES | `status emit` twice, then truncated `state/status/stream.jsonl` 12 bytes short of a line end: `status show` still prints the whole current record from `status/current.json`, exit 0. The red half (pointing `readCurrent` at the stream) is a scratch mutant this review did not build; the C-1 property itself is readable at src/status.ts:15 |
| 8 | YES | AGENTS.md:248 now reads "HOW: `tiphys sync`, which is the mechanism this clause is discharged by. It is not a reminder to run git carefully." AGENTS.md:344 replaces the "a later milestone" sentence and names `tiphys resume` (M4-P16) and `tiphys sync` (M4-P18) |

### M4-P24 (the three loop gaps)

| id | holds now | what I ran |
|---|---|---|
| 1 | YES, all three exit states | empty fleet -> `in flight: 0`, one next-action line, exit 0. Fleet with an open task and an undelivered branch -> `in flight: 1`, one next-action line, exit 3. Not a fleet home -> exit 1 with one stderr line. 3 is distinct from 0 and from 1 |
| 2 | YES | `grep -cE '/home/\|/tmp/' src/commands/next.ts` = 0 |
| 3 | YES, both members, against a real fixture | built an upstream where `git branch --merged main` reports ONLY main, i.e. the naive implementation calls all three branches open. Member A, squash-merged `squashed`: reported DELIVERED. Member B, structurally different, `feature-b` whose one commit was cherry-picked into `carrier` and landed inside CARRIER's squash: also reported DELIVERED. Control `really-open`: reported OPEN, and it is the single item in flight |
| 4 | YES, red witness run for real | `unshare -n -- node bin/tiphys.ts next` versus the same command with a network: `diff` of the two captures reports IDENTICAL OUTPUT, both exit 3, and the five-item cannot-see block is present in both |
| 5 | PARTIAL, and the plugin half is outside this group's paths | `plugin/src/pr-main.ts open --repo o/n ...` and `... merge --repo o/n --number 1` with GH_TOKEN, GITHUB_TOKEN and TIPHYS_PR_TOKEN unset both exit 65 with ONE line: "no pull-request credential is present: none of GH_TOKEN, GITHUB_TOKEN, GH_ENTERPRISE_TOKEN, GITHUB_ENTERPRISE_TOKEN carries a value, so this command has no authority to act and refuses rather than proceeding". The second half, that the KERNEL process never receives the credential, was not re-run: it is the credential-scrub probe's job and sits outside src/cli.ts, src/commands, bin, src/status.ts, src/brief.ts. Note also that the plugin lives at `plugin/`, not at the `packages/claude-code-plugin/` path this phase's files-to-touch names |
| 6 | YES | `grep -rnE "pr-main\|runPr" src/ bin/` returns nothing. The broader grep for `"open"` and `"merge"` hits only task-status literals and prose comments, never a plugin invocation |

## What I tried to break, and what HELD

- **The dispatch table** (DR-0046's whole reason). Tried: duplicate keys, two
  names on one handler, a name/handler mismatch, an import registered nowhere,
  and a usage name that does not dispatch. All five HELD, and the last was RUN
  rather than read.
- **`tiphys next`'s exit contract.** Tried to collapse 3 into 1 by giving it a
  fleet it could not read, and by removing the network. It HELD: a fleet home
  it cannot load is 1, an unreadable category is 3, and the network-less run is
  byte-identical to the normal one.
- **The delivered-elsewhere predicate.** Built the two shapes that defeat
  `git branch --merged` and confirmed the naive tool calls all three branches
  open while `next` calls two delivered and one open. HELD.
- **`resume` against a LIVE fleet.** Tried the `rm -rf` plus `mkdir` failure
  mode with an unexpired lease and uncommitted worktree content, and the
  half-rebuilt state. Both HELD, by sha256 rather than by inspection.
- **`sync`'s ephemeral refusal.** `git add -A` does not reach the dangerous
  state; `git add -f` does, and the refusal HELD with nothing committed.
- **`brief compose` against a named pipe.** HELD in 226ms with the entry type
  named. This is what makes CR-F01 a composition finding rather than a
  feature request: the project knows how to do this and did it in the newer
  file.
- **The published tarball.** Packed and installed it, then ran the CLI from the
  install prefix. `version` HELD; `brief compose --role orchestrator` did not,
  which is CR-F03.
- **`spawn` and `lock` against a named pipe.** Did NOT hold; CR-F01.
- **`pool list` and `doctor` against an unestablished task record.** Did NOT
  hold; CR-F02.

## Tuition shapes found present again

- **T-008 / the guard that cannot go red, and silence that means nothing.**
  CR-F01: a hang with zero output is the purest form of "no notification is
  indistinguishable from work in progress", inside the package built to stop it.
- **T-036 / the stop condition that reported a finished milestone.** CR-F02:
  an unreadable source reported as zero, in `pool list` and `doctor`. The
  command M4-P24 hardened against exactly this is the one that resists it; the
  module it calls does not.
- **T-005 / lessons do not propagate between phases.** CR-F01 and CR-F03 are
  both one phase's correct decision and another phase's file.
- **T-007 / the criteria cannot contain the defect.** Every one of my four
  findings sits OUTSIDE the criteria I walked. CR-F01 is named in M3-P5's
  grounding and in no criterion; CR-F02 is named in M4-P24's work history and
  in no criterion; CR-F03 and CR-F04 are named nowhere. This is the criteria
  contract reporting its own limit, which is the honest thing for it to do.
- **T-018 / two checks catching the same input make each other unwitnessable.**
  CR-F02's mitigation is exactly this shape: `next` is safe only because
  `openTasks` catches what `poolList` drops, so a change to `openTasks` would
  silently remove the protection with no test naming the coupling.

## Not reached, and why

- M1-P1 criteria 6, 7 and 10; M1-P2 criterion 7's global-config half.
- M3-P5 criteria 4, 5, 6, and the red halves of 6b and 7.
- M3-P6 criteria 3, 7, 8, 8b, 11, and the red halves of 2, 9 and 9d.
- M4-P24 criterion 5's kernel-never-receives-the-credential half.
- In general: every criterion of the form "X makes it fail, restoring X returns
  green" was walked on its GREEN half only, because the red half requires
  editing the tree and this review is read-only on a clone. The green half is
  the half that is always present, which is the criteria brief's own warning,
  and it is stated here rather than counted as coverage.
- `plugin/**` is outside this group's declared paths and was touched only
  where M4-P24 criterion 5 pointed at it.

## Verdict

FIX-ROUND-NEEDED. Not because the criteria failed: of the 55 criteria in
scope, none that I could reach is broken, and the two that read oddly
(M4-P18 criterion 1's `git status` clause, criterion 4's `git add -A` recipe)
are wording artifacts whose underlying properties hold. The verdict is driven
by CR-F01 at high and CR-F02 and CR-F03 at medium, which
`schemas/verdict.schema.json`'s own root `if`/`then` refuses to let sit beside
an APPROVE, and which DR-0012 condition 2 bars from a merge.

## The JSON verdict, embedded rather than landed

This verdict reads FIX-ROUND-NEEDED, so nothing from this group is landed at the TOP
LEVEL of `delivery/review/`, where `check-dual-review` reads its corpus.

```json
{
  "kind": "verdict",
  "phase": "M1-P1",
  "head": "ad2428b76ef6f53f75b0d7f94c7db50463e077b7",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude Opus 5 (Anthropic)",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-F01",
      "severity": "high",
      "evidence": [
        "REPRODUCED at ad2428b. mkfifo warnings.md in a fleet home, then timeout 60 node bin/tiphys.ts spawn --task t-0101 --project <fleet>/projects/demo --brief /tmp/brief.md --shape ship --exec /bin/true -> EXIT=124 (timeout killed it), elapsed_s=60, stdout EMPTY",
        "Residue left by that killed run, measured with ls and git branch: tasks/t-0101, worktrees/t-0101, worktrees/t-0101.pool.json, and branch task/t-0101 in the project clone",
        "Member B, structurally different because the path is a caller ARGUMENT rather than fleet state (src/brief.ts:43): mkfifo /tmp/brieffifo.md then spawn --brief /tmp/brieffifo.md -> EXIT=124, elapsed_s=45",
        "Member C, a different command and a different file: mkfifo state/orchestrator.lock in a fresh tiphys init fleet, then lock status / lock acquire / lock release --holder x / lock renew --holder x -> all four EXIT=124 at the 20s timeout",
        "THE ASYMMETRY: in that SAME fleet home against that SAME FIFO, node bin/tiphys.ts doctor returns in 0s with CHECK lock FAIL ... is a named pipe, not a regular file, so it was not opened, and node bin/tiphys.ts next returns exit 0 in 0s, while lock status hangs",
        "git log --oneline -- src/brief.ts returns exactly one commit, 6ec0482 M1-P4, so nothing has touched the file since M1",
        "Reachability NOT overstated: --brief <(echo \"generated brief\") (bash process substitution, /dev/fd/63) spawns normally, exit 0, elapsed 0s. The trigger is a genuine FIFO, a blocking device node, or a stalled mount",
        "Already recorded as an open class at delivery/STATE.md:1458, which names src/brief.ts, teardown, four lock subcommands and spawn, and predicts the exact residue measured above; no phase took it, and it is live at the FINAL state"
      ],
      "concrete-fix": "Route both reads in src/brief.ts through the same path-type establishment the newer code already uses (src/commands/brief.ts refuses a named pipe in 226ms naming the observed type): classify the entry with lstat then stat BEFORE opening, and return the existing BriefResult { ok: false, reason } carrying the path and the observed type, so spawn's existing refusal path unwinds and creates nothing. Apply the identical change to the lease read reached by tiphys lock status, acquire, release and renew. Add one red witness per command with a real mkfifo and a bounded timeout, asserting a nonzero exit and a bounded elapsed time, because a test that only asserts the message would pass against a version that hangs and is then killed.",
      "analysis": "This is a composition defect rather than a missing feature: M1-P5 hardened the guard's reader, M3-P5 bound only new code under D-M3-27 and said so in its grounding, and no later phase opened the M1 files. The kernel therefore ships two readers of one path, one of which establishes the entry type and one of which does not, and the one that does not is the one a consumer types. An unbounded hang with zero output is indistinguishable from work in progress, which is the T-008 shape the package exists to prevent. Resolving it may be an owner decision to ACCEPT a declared residue rather than an edit; that judgement is the orchestrator's, and this finding establishes only that it is still live and reproducible."
    },
    {
      "id": "CR-F02",
      "severity": "medium",
      "evidence": [
        "REPRODUCED with no permissions trick, uid 0, at ad2428b. Fresh tiphys init fleet with one open task whose tasks/t-0001/meta.json is truncated mid-write (the state an interrupted spawn or a reclaimed session leaves, which is the state M4-P19 exists to report)",
        "node bin/tiphys.ts pool list -> exit 0 and ZERO lines of output",
        "node bin/tiphys.ts doctor -> CHECK tasks WARN 1 open of 1 (t-0001) AND CHECK worktrees PASS no pool worktrees, exit 0. One run contradicts itself: one check says a task is present and unreadable, the other asserts a positive fact it has not established",
        "Control with an INTACT meta.json, same fixture: pool list -> t-0001 missing unreconstructable (unresolved: remote, branch); doctor -> CHECK worktrees WARN 1 of 1 pool entr(ies) have no pool record beside them. So the drop hides exactly the entry the feature exists to surface",
        "src/pool.ts:759 SETTLED, the site delivery/work-history/m4-p24.md:914 recorded as NOT FIXED and NOT PROVEN UNREACHABLE. The implementer's two probes failed because this container runs as uid 0. Dropping privilege reaches it: chmod 000 tasks then runuser -u nobody -- node dist/bin/tiphys.js pool list -> exit 0, ZERO lines (as root, one line naming t-0001)",
        "Same privilege-dropped run, doctor -> CHECK tasks WARN tasks/ ... could not be listed (EACCES) ... AND CHECK worktrees PASS no pool worktrees, exit 0",
        "MEASURED MITIGATION, so the finding is not overstated: tiphys next is NOT fooled in either state. openTasks at src/commands/next.ts:294 has its own try/catch and reports the same condition into unknown, so next prints unknown: 1 and exits 3 both times"
      ],
      "concrete-fix": "Give poolList the same three-valued answer next.ts already uses. Change its return type to carry an unresolved channel (for example { entries, unknown: string[] }), push a line at src/pool.ts:759 when readdirSync on tasksDir throws and at src/pool.ts:769 when readTaskMeta returns undefined, and make the two reporting callers render it: doctor's CHECK worktrees becomes WARN naming the unestablished ids rather than PASS no pool worktrees, and tiphys pool list prints the unknown lines and exits nonzero rather than printing nothing and exiting 0. Two red witnesses, structurally different: a truncated meta.json (no privilege needed) and an unlistable tasks/ reached under a dropped uid.",
      "analysis": "M4-P19 made tasks/ a PRIMARY input to a check that reports PASS; the swallow at src/pool.ts:759 predates that and was harmless when tasks/ was secondary. M4-P24 then established the rule in its own header (src/commands/next.ts:40, a category empty by construction must not be reported as a category empty by observation) and applied it inside next.ts only. The protection next.ts enjoys is also fragile in the T-018 way: it comes from a SIBLING reader catching what poolList drops, so a future change to openTasks would remove it silently with no test naming the coupling."
    },
    {
      "id": "CR-F03",
      "severity": "medium",
      "evidence": [
        "The role vocabulary has six members (src/roles.ts:54, schemas/role-brief.schema.json:25) and the composer resolves every one of them to roles/<id>.md (src/commands/brief.ts:113)",
        "roles/ contains README.md, _shared-dispatch-contract.md and five briefs; there is no roles/orchestrator.md. roles/README.md:9 states that the orchestrator's brief is AGENTS.md at the repository root with role: orchestrator frontmatter, and head -12 AGENTS.md confirms that frontmatter",
        "MEASURED AGAINST THE PUBLISHED TARBALL, not the dev tree: npm pack then npm install into a temporary prefix. prefix/node_modules/@tiphys/kernel/AGENTS.md is present (35591 bytes) and prefix/node_modules/@tiphys/kernel/roles/ carries five briefs and no orchestrator.md",
        "prefix/node_modules/.bin/tiphys brief compose --role orchestrator --phase <pkg>/templates/plan.example.yaml --phase-id M9-P1 -> 'tiphys brief compose: role brief <pkg>/roles/orchestrator.md: <pkg>/roles/orchestrator.md does not exist', exit 1",
        "The same CLI advertises the role it cannot compose: --role nonsense answers 'unknown role nonsense; the roles are orchestrator, investigator, plan-writer, adversarial-plan-reviewer, implementer, clean-room-reviewer', and the usage line printed by tiphys brief carries the same six"
      ],
      "concrete-fix": "In src/commands/brief.ts, resolve the orchestrator role to the shipped AGENTS.md instead of roles/orchestrator.md: a one-entry override in the path resolver at src/commands/brief.ts:113 (roleId === 'orchestrator' ? join(options.root, 'AGENTS.md') : join(rolesDirectory, roleId + '.md')). If composing the orchestrator brief is deliberately unsupported, remove 'orchestrator' from ROLE_IDS at src/roles.ts:54 for the composer's vocabulary so the usage line stops offering it, and make the unknown-role message say where that brief lives. Either way add a registered test that composes EVERY member of the advertised vocabulary and requires exit 0, so the advertised set and the composable set cannot diverge again.",
      "analysis": "No per-phase review could have caught this. M3-P5 built the six-member resolver over roles/<id>.md, M3-P6 added two files to that directory, and M3-P9 shipped the sixth brief at the package root. Each decision is correct alone. The user-visible harm is that the diagnostic misdescribes reality: it says the brief does not exist when it ships in the same tarball, so a consumer reads it as a broken install."
    },
    {
      "id": "CR-F04",
      "severity": "low",
      "evidence": [
        "node bin/tiphys.ts --help -> exit 64, stdout 0 bytes, the usage line on stderr",
        "node bin/tiphys.ts help -> exit 64",
        "the project's own evidence uses tiphys --help as a probe (delivery/review/clean-room-m3-exit-subject-hazard.md:121), so the invocation is one people actually type here",
        "src/cli.ts has no help entry in the dispatch table and src/cli.ts:66 sends every unrecognised token, including a leading-dash one, down the usage-error path"
      ],
      "concrete-fix": "Add a help arm to src/cli.ts's run(): when the subcommand is undefined, --help, -h or help, write usageLine() to STDOUT and return 0; keep the stderr-plus-64 behaviour for a genuinely unknown subcommand so M1-P1 criterion 4 is unaffected. Register a behavior name for it and assert both arms (help on stdout at 0, unknown on stderr at 64) so the two cannot be collapsed.",
      "analysis": "This satisfies M1-P1 criterion 4 to the letter and is still the first thing a consumer of the published package types. It is filed low because the usage line IS printed and no wrong answer is produced; it is filed at all because tiphys --help | less shows nothing on the surface every user meets first."
    }
  ],
  "criteria": [
    {
      "id": "M1-P1/1",
      "quote": "npm ci then npm run build exits 0 (tsc -b builds both configs and emits dist/); npm test exits 0 without requiring a prior build ... with 0 failing and zero unaccounted tests",
      "evidence": [
        "npm ci exit 0; npm run build exit 0, both on node v26.6.0 in the clone at ad2428b",
        "npm test: tests 1341, pass 1340, fail 1, SKIPPED 0, todo 0, exit 1",
        "the single failure is test/gates.test.ts:3571 and it is the CLAUDE.md standing-warning-1 interpreter-path artifact: namei -m /tmp/claude-0/n26/bin/node shows drwx------ claude-0, so the unprivileged spawn of PATH's node is EACCES",
        "one variable changed: PATH=/opt/node22/bin:/usr/bin:/bin with the runner still n26 gives that test alone tests 1, pass 1, fail 0, skipped 0"
      ],
      "met": true
    },
    {
      "id": "M1-P1/2",
      "quote": "After npm run build, dist/bin/tiphys.js exists and git status --porcelain reports no changes",
      "evidence": [
        "dist/bin/tiphys.js present after npm run build",
        "git status --porcelain produced no output after the build"
      ],
      "met": true
    },
    {
      "id": "M1-P1/3",
      "quote": "node bin/tiphys.ts version exits 0 and prints exactly the version field of package.json; node dist/bin/tiphys.js version prints byte-identical output",
      "evidence": [
        "node bin/tiphys.ts version -> 0.1.0, exit 0",
        "node dist/bin/tiphys.js version -> 0.1.0, exit 0",
        "cmp of the two captured stdout files reports them byte-identical; package.json version is 0.1.0"
      ],
      "met": true
    },
    {
      "id": "M1-P1/4",
      "quote": "node bin/tiphys.ts no-such-command exits with code 64 and writes a usage line to stderr",
      "evidence": [
        "node bin/tiphys.ts no-such-command -> exit 64",
        "stderr: usage: tiphys <brief | checklist | cutover | doctor | gates | init | lock | mode | next | plan | pool | resume | spawn | status | sync | teardown | tuition | validate | version | watch>"
      ],
      "met": true
    },
    {
      "id": "M1-P1/5",
      "quote": "package.json contains engines.node \">=26\", license \"Apache-2.0\", a files entry including dist, and a prepack script running the build; the LICENSE file contains the Apache-2.0 license text",
      "evidence": [
        "engines.node = >=26; license = Apache-2.0; files includes dist (true); prepack = npm run build",
        "head -2 LICENSE shows the Apache License heading"
      ],
      "met": true
    },
    {
      "id": "M1-P1/6",
      "quote": ".github/workflows/gates.yml defines a matrix job named test whose matrix contains exactly one Node version, 26, and a non-matrixed job named exactly gates ...",
      "evidence": [
        "NOT REACHED: .github/workflows/gates.yml is outside this group's declared paths (src/cli.ts, src/commands/**, bin/**, src/status.ts, src/brief.ts) and was not inspected; reported as not reached rather than asserted"
      ],
      "met": false
    },
    {
      "id": "M1-P1/7",
      "quote": "The phase PR shows the gates check completed successfully (observable on the PR)",
      "evidence": [
        "NOT REACHED: a historical GitHub pull-request observation; no artifact in the tree at ad2428b settles it"
      ],
      "met": false
    },
    {
      "id": "M1-P1/8",
      "quote": "Directories bin/, schemas/, roles/, tuition/ exist and each contains at least one tracked file (git ls-files count > 0 per directory)",
      "evidence": [
        "git ls-files counts at ad2428b: bin 1, schemas 21, roles 7, tuition 17"
      ],
      "met": true
    },
    {
      "id": "M1-P1/9",
      "quote": "tsconfig.src.json and tsconfig.test.json both set erasableSyntaxOnly, rewriteRelativeImportExtensions, and verbatimModuleSyntax to true; tsconfig.test.json sets noEmit true and carries a project reference to the src config",
      "evidence": [
        "tsconfig.src.json: erasableSyntaxOnly=true rewriteRelativeImportExtensions=true verbatimModuleSyntax=true",
        "tsconfig.test.json: same three true, noEmit=true, references=[{\"path\":\"./tsconfig.src.json\"}]"
      ],
      "met": true
    },
    {
      "id": "M1-P1/10",
      "quote": "With a deliberate type error temporarily introduced in a test/ file, npm run build exits nonzero; likewise for a src/ file; both demonstrations are captured in the work history and reverted before the PR",
      "evidence": [
        "NOT REACHED: the demonstration requires editing the tree, and this review is read-only on a clone at a detached head"
      ],
      "met": false
    },
    {
      "id": "M1-P1/11",
      "quote": "npm pack produces a tarball; npm install of that tarball into a temporary prefix exits 0, and running the installed tiphys version through that prefix's bin directory prints exactly the package.json version",
      "evidence": [
        "npm pack exit 0 -> tiphys-kernel-0.1.0.tgz, 820421 bytes",
        "npm install of that tarball into a temporary prefix: exit 0; prefix/node_modules/.bin/ contains tiphys",
        "prefix/node_modules/.bin/tiphys version -> 0.1.0, exit 0"
      ],
      "met": true
    },
    {
      "id": "M1-P1/12",
      "quote": "test/behaviors.json exists, is valid JSON, and maps each behavior named in this phase's criteria to a test name present in the node --test run",
      "evidence": [
        "test/behaviors.json parsed as JSON: 1217 behavior keys",
        "version-output and unknown-subcommand-exit are both present as keys"
      ],
      "met": true
    },
    {
      "id": "M1-P2/1",
      "quote": "tiphys init <empty tmp dir> exits 0 and creates charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md, package.json, .gitignore, and a .git directory with at least one commit",
      "evidence": [
        "tiphys init fleet1 -> exit 0; ls -a shows .git .gitignore backlog.md charter decisions package.json projects state status tasks worktrees",
        "git rev-list --count HEAD = 1",
        "status/ is an addition made by M4-P18's durable-document split, not a loss of any listed entry"
      ],
      "met": true
    },
    {
      "id": "M1-P2/2",
      "quote": "A second tiphys init on the same directory exits nonzero and stderr contains \"already initialized\"",
      "evidence": [
        "second init -> exit 1, stderr: ... is already initialized; run tiphys resume to rebuild the ephemeral directories a clone does not carry"
      ],
      "met": true
    },
    {
      "id": "M1-P2/3",
      "quote": "git check-ignore state/anything, worktrees/anything, projects/anything all exit 0, while decisions/anything and charter/anything both exit 1",
      "evidence": [
        "state/anything exit 0; worktrees/anything exit 0; projects/anything exit 0",
        "decisions/anything exit 1; charter/anything exit 1",
        "status/anything exit 1, so M4-P18's relocated durable status document is tracked, which is the intent of M4-D-13"
      ],
      "met": true
    },
    {
      "id": "M1-P2/4",
      "quote": "tiphys doctor in a healthy fleet home exits 0 and stdout contains one \"CHECK <name>\" line per check listed in step 3, none of them FAIL",
      "evidence": [
        "doctor in fleet1: exit 0",
        "one CHECK line each for node, git, gh, layout, remote, lock, beacon, identity (the step-3 set) plus shared-lock, retention, tasks, branches, worktrees, kernel-artifacts added later; no FAIL"
      ],
      "met": true
    },
    {
      "id": "M1-P2/5",
      "quote": "After deleting decisions/, tiphys doctor exits nonzero and stdout contains \"CHECK layout FAIL\" naming decisions",
      "evidence": [
        "with decisions/ removed: CHECK layout FAIL missing decisions/; doctor exit 1"
      ],
      "met": true
    },
    {
      "id": "M1-P2/6",
      "quote": "tiphys doctor in a directory that is not a fleet home exits nonzero",
      "evidence": [
        "doctor in an empty non-fleet directory: exit 1, CHECK layout FAIL missing charter/, decisions/, state/, tasks/, worktrees/, projects/, backlog.md, package.json, .gitignore"
      ],
      "met": true
    },
    {
      "id": "M1-P2/7",
      "quote": "With HOME set to an empty temporary directory and global and system git config pointed at nonexistent paths, tiphys init exits 0, the bootstrap commit exists with the documented deterministic machine identity as both author and committer, and no global git config file was created or modified",
      "evidence": [
        "PARTIAL, reported as not met rather than claimed: git log -1 on the bootstrap commit shows A:Tiphys Fleet <fleet@tiphys.invalid> C:Tiphys Fleet <fleet@tiphys.invalid>, so the deterministic-identity half holds",
        "the HOME and GIT_CONFIG_GLOBAL/GIT_CONFIG_SYSTEM isolation arm, and the no-global-config-written half, were NOT run"
      ],
      "met": false
    },
    {
      "id": "M1-P2/8",
      "quote": "With gh absent from PATH, tiphys doctor exits 0 and stdout contains \"CHECK gh WARN\"; the same fleet under tiphys doctor --for full exits nonzero and stdout contains \"CHECK gh FAIL\"",
      "evidence": [
        "gh is absent from PATH in this container: doctor -> CHECK gh WARN gh not found on PATH, PR modes unavailable, exit 0",
        "doctor --for full on the same fleet -> CHECK gh FAIL ... (required for profile full) and CHECK remote FAIL ... (required for profile full), exit 1",
        "both directions witnessed in one fleet home"
      ],
      "met": true
    },
    {
      "id": "M1-P2/9",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; test/behaviors.json maps every behavior newly named by this phase's criteria to a test present in this run",
      "evidence": [
        "see the suite sentence on criterion M1-P1/1; behaviors.json parses and init/doctor behaviors resolve by name"
      ],
      "met": true
    },
    {
      "id": "M3-P5/1",
      "quote": "tiphys validate --type role-brief roles/<id>.md exits 0 for all three briefs",
      "evidence": [
        "validate --type role-brief roles/investigator.md exit 0",
        "roles/plan-writer.md exit 0; roles/adversarial-plan-reviewer.md exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P5/2",
      "quote": "A brief whose frontmatter names a mandated-reading path that does not exist causes tiphys brief compose to exit nonzero naming that path; with the path present the same command exits 0 (both directions)",
      "evidence": [
        "in a hardlink mirror of the kernel tree, with schemas/report.schema.json moved away: tiphys brief compose: mandated-reading path schemas/report.schema.json does not exist (looked for <mirror>/schemas/report.schema.json), exit 1",
        "restoring the file: same command exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P5/3",
      "quote": "tiphys brief compose --role plan-writer --phase templates/plan.example.yaml --phase-id <id> exits 0 and the output contains, in order: the resolved mandated-reading list, the brief body, and the named phase's rendered text; composing with a --phase-id absent from the plan exits nonzero naming the id",
      "evidence": [
        "compose --role plan-writer --phase templates/plan.example.yaml --phase-id M9-P1: exit 0, 255 lines",
        "order confirmed by line number: '## Mandated reading, in order' at line 7, '# Brief body' at line 33, '# Phase M9-P1' at line 190",
        "--phase-id M1-P1 (absent from that plan): tiphys brief compose: templates/plan.example.yaml declares no phase with id M1-P1, exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P5/3b",
      "quote": "Every required top-level field of schemas/plan.schema.json's phase definition appears in brief compose's output ... the assertion is driven FROM THE SCHEMA rather than from a hand-written field list",
      "evidence": [
        "read schemas/plan.schema.json's phase required array at run time: 15 names (id, branch, intent, grounding, severity, verified-root-cause, steps, files-to-touch, extras, acceptance, hazard-classes, migrations, conflicts-with, parallelizable, citations)",
        "all 15 appear as '### <name>' blocks in the composed output, plus '### fill-in'",
        "the drop-a-field red arm was NOT run, because it means editing the renderer; the green half only is claimed here"
      ],
      "met": true
    },
    {
      "id": "M3-P5/4",
      "quote": "roles/adversarial-plan-reviewer.md states the settled visibility (input report, plan, code) and the process doc's role table row now matches it, with the footnote citing SC-001",
      "evidence": [
        "NOT REACHED: a two-document prose comparison against delivery/intake/orchestrated-delivery-process.md, outside this group's declared paths"
      ],
      "met": false
    },
    {
      "id": "M3-P5/5",
      "quote": "Kind A DANGEROUS-instance rejections for schemas/finding.schema.json, each witnessed by removing and restoring the guarding keyword",
      "evidence": [
        "NOT REACHED: schema work rather than CLI surface; not walked"
      ],
      "met": false
    },
    {
      "id": "M3-P5/6",
      "quote": "tiphys validate --type report accepts an investigator report only when a repro reference is present for a root-cause verdict, and rejects the same report with the reference removed",
      "evidence": [
        "NOT REACHED: schema work rather than CLI surface; not walked"
      ],
      "met": false
    },
    {
      "id": "M3-P5/6b",
      "quote": "All three briefs carry incremental-output and beacon-is-not-a-claim as body headings resolving from frontmatter ... Deleting either heading makes tiphys validate --type role-brief exit nonzero",
      "evidence": [
        "PARTIAL, reported as not met rather than claimed: roles/_shared-dispatch-contract.md exists as the single copy, and the composed plan-writer brief carries '## clause incremental-output: create the artifact in the first minutes, append as you go' at line 118 and '## clause beacon-is-not-a-claim: the artifact is the report, and the guard tests freshness' at line 169",
        "the delete-a-heading red arm was NOT run"
      ],
      "met": false
    },
    {
      "id": "M3-P5/6c",
      "quote": "With a named pipe staged by a real mkfifo at a mandated-reading path, tiphys brief compose exits nonzero within a bounded time naming the path and the observed entry type and does NOT block; with a regular file at the same path it exits 0",
      "evidence": [
        "mkfifo <mirror>/schemas/report.schema.json (ls shows prw-r--r--), then compose: EXIT=1, elapsed_ms=226, stdout 0 bytes",
        "stderr: tiphys brief compose: mandated-reading path schemas/report.schema.json: <mirror>/schemas/report.schema.json is a named pipe, not a regular file, so it was not opened",
        "restoring a regular file at the same path: exit 0",
        "this is the criterion that makes finding CR-F01 a composition defect: the composer establishes the entry type and src/brief.ts, named in this phase's own grounding, still does not"
      ],
      "met": true
    },
    {
      "id": "M3-P5/7",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; clause map resolves this phase's seven rows; earlier mappings still resolve",
      "evidence": [
        "PARTIAL: the suite sentence is on criterion M1-P1/1; the seven clause-map rows were NOT re-derived, so this is reported as not reached rather than met"
      ],
      "met": false
    },
    {
      "id": "M3-P6/1",
      "quote": "tiphys validate --type role-brief exits 0 on both briefs",
      "evidence": [
        "validate --type role-brief roles/implementer.md exit 0; roles/clean-room-reviewer.md exit 0"
      ],
      "met": true
    },
    {
      "id": "M3-P6/2",
      "quote": "tiphys brief compose --role implementer output contains all six R-033a sections, each non-empty; deleting any one section from the brief file makes compose exit nonzero naming the missing section (both directions, one witness per section)",
      "evidence": [
        "GREEN HALF ONLY, so reported as not met: run against the INSTALLED TARBALL, the composed implementer brief carries exactly six '## section ' headings, all non-empty: mandated-reading (line 75), phase-scope (112), push-protocol (217), gate-list (355), environment-warnings (404), reporting-contract (434)",
        "the delete-a-section red arm, one witness per section, was NOT run"
      ],
      "met": false
    },
    {
      "id": "M3-P6/3",
      "quote": "The composed brief's gate-list block is byte-identical to the block gate-registry.yaml renders for the declared mode; adding a gate to the registry without re-rendering makes node scripts/check-brief-drift.mjs --check exit nonzero",
      "evidence": [
        "NOT REACHED: the brief-drift gate's territory; not run here"
      ],
      "met": false
    },
    {
      "id": "M3-P6/4",
      "quote": "The composed implementer brief contains no instruction to create or merge a pull request, asserted by a registered grep test over the composed output for gh pr create, pr merge, and \"open the PR\"",
      "evidence": [
        "grep -nEi 'gh pr create|pr merge|open the PR' over the composed implementer brief from the installed tarball: ZERO hits"
      ],
      "met": true
    },
    {
      "id": "M3-P6/5",
      "quote": "The composed brief contains the fleet warnings file's full text when one exists and exactly the brief text when none exists",
      "evidence": [
        "no fleet warnings.md: cmp tasks/t-0100/brief.md against the brief file reports them byte-identical",
        "with warnings.md carrying 'WARNING ONE\\nWARNING TWO\\n': tasks/t-0110/brief.md is the brief body followed by both warning lines verbatim, one separator newline and nothing else added",
        "both directions witnessed through tiphys spawn rather than through prose"
      ],
      "met": true
    },
    {
      "id": "M3-P6/6",
      "quote": "node --test exits 0 with 0 failing and zero unaccounted tests; clause map resolves this phase's thirteen rows",
      "evidence": [
        "PARTIAL: suite sentence on M1-P1/1; the thirteen clause-map rows were NOT re-derived"
      ],
      "met": false
    },
    {
      "id": "M3-P6/7",
      "quote": "Every clause id in both briefs' frontmatter occurs exactly once as a body heading anchor, and every body heading anchor occurs in the frontmatter (a registered test, both directions)",
      "evidence": [
        "NOT REACHED: the round trip in both directions is a registered test and was not re-run here"
      ],
      "met": false
    },
    {
      "id": "M3-P6/8",
      "quote": "the implementer brief's mandated-reading section names tuition/mechanism-index.yaml by path, and its mechanism-lookup and mechanism-sibling clauses are present as body headings resolving from frontmatter",
      "evidence": [
        "PARTIAL, reported as not met: '## clause mechanism-lookup' (line 164) and '## clause mechanism-sibling' (line 184) are present in the composed brief",
        "the mechanism-index superset assertion and the delete-the-seed red arm were NOT walked"
      ],
      "met": false
    },
    {
      "id": "M3-P6/8b",
      "quote": "The destructive-authority clause is present as a body heading resolving from frontmatter, names all three of its conjuncts, and names gates.manifest.json's destructiveCommands list by path",
      "evidence": [
        "PARTIAL, reported as not met: '## clause destructive-authority: state it, never inherit it, and register the command' is present at line 197 of the composed brief",
        "the three conjuncts and the path-resolution red arm were NOT walked"
      ],
      "met": false
    },
    {
      "id": "M3-P6/9",
      "quote": "Revision-2 clauses present and specific, both directions each: claim-grep verbatim, fix-round-mechanism naming all three items, incremental-output and beacon-is-not-a-claim as body headings in both briefs",
      "evidence": [
        "PARTIAL, reported as not met: '## clause claim-grep' (line 287) and '## clause fix-round-mechanism: name the mechanism, publish the derivation, state what it missed' (line 312) are present in the composed implementer brief",
        "the verbatim-command comparison against CLAUDE.md and the weaken-it red arms were NOT run"
      ],
      "met": false
    },
    {
      "id": "M3-P6/9d",
      "quote": "A registered grep test asserts that incremental-output's clause text in BOTH roles/implementer.md and roles/clean-room-reviewer.md names the artifact-within-the-first-minutes rule and the mtime-as-beacon consequence ... both directions",
      "evidence": [
        "NOT REACHED: the text-specificity assertion in both briefs, in both directions, was not walked"
      ],
      "met": false
    },
    {
      "id": "M3-P6/10",
      "quote": "tiphys brief compose --role clean-room-reviewer --review-contract criteria and --review-contract hazard both exit 0 and emit briefs whose first instruction differs; a --review-contract value outside the two exits nonzero naming it",
      "evidence": [
        "--review-contract criteria: exit 0; --review-contract hazard: exit 0",
        "the two outputs differ at the frontmatter review-contract field and at the clause block: the hazard brief carries '## clause review-contract-hazard: start from the hazard classes, and not from the criteria' with 'DO NOT BEGIN FROM THE ACCEPTANCE CRITERIA'; the criteria brief carries '## clause review-contract-criteria: walk every criterion, and do not call it completeness' with the 'all acceptance criteria met' sentence",
        "--review-contract nonsense: tiphys brief compose: unknown review contract nonsense; the contracts are criteria, hazard, exit 1"
      ],
      "met": true
    },
    {
      "id": "M3-P6/11",
      "quote": "The brief-drift check is wired as a BEHAVIOUR (D-M3-28). The workflow step added in step 3 is extracted and EXECUTED against stubs and its exit code observed, under two structurally different defangs",
      "evidence": [
        "NOT REACHED: the executable wiring witness was not run"
      ],
      "met": false
    },
    {
      "id": "M4-P16/1",
      "quote": "In a directory that is a git clone carrying backlog.md, package.json, .gitignore, charter/ and decisions/ and none of state/, worktrees/, projects/, node bin/tiphys.ts resume exits 0, creates exactly those three directories, and prints exactly three lines of the form REBUILT <name>/. Immediately afterwards node bin/tiphys.ts doctor prints CHECK layout PASS",
      "evidence": [
        "git clone of the fixture fleet: ls -a shows .git .gitignore backlog.md charter decisions package.json status tasks and NONE of state, worktrees, projects",
        "resume: exactly three lines, REBUILT state/, REBUILT worktrees/, REBUILT projects/, exit 0; ls -a afterwards shows all three present",
        "doctor immediately afterwards: CHECK layout PASS all layout entries present"
      ],
      "met": true
    },
    {
      "id": "M4-P16/2",
      "quote": "In a directory that is not a git repository, resume exits 1, writes one stderr line naming the absent .git, and creates nothing. Verified by comparing find . -mindepth 1 | sort | sha256sum before and after: the two digests are equal",
      "evidence": [
        "copy of the fleet with .git removed: resume exit 1, one stderr line: '... is not a git repository, .git is absent, so it is not a cloned fleet home; run tiphys init <dir> to create one'",
        "find . -mindepth 1 | sort | sha256sum before and after: DIGESTS EQUAL"
      ],
      "met": true
    },
    {
      "id": "M4-P16/3",
      "quote": "In a fleet home whose layout is already complete, resume exits 0 and prints zero REBUILT lines. A second consecutive invocation also prints zero",
      "evidence": [
        "first invocation after rehydration: exit 0, zero REBUILT lines; second consecutive invocation: exit 0, zero REBUILT lines"
      ],
      "met": true
    },
    {
      "id": "M4-P16/4",
      "quote": "RED WITNESS, dangerous state, member A: a fleet home that is LIVE, holding worktrees/<id>/scratch.txt with uncommitted content and state/orchestrator.lock with an unexpired lease. resume leaves both byte-identical (sha256 of each file equal before and after) and exits 0",
      "evidence": [
        "live fleet: worktrees/t-001/scratch.txt with uncommitted content, state/orchestrator.lock with expiresAt 2099-01-01",
        "resume exit 0; sha256 of BOTH files equal before and after",
        "an rm -rf plus mkdir implementation passes criteria 1 to 3 and fails this one; this one holds"
      ],
      "met": true
    },
    {
      "id": "M4-P16/5",
      "quote": "RED WITNESS, dangerous state, member B, structurally different from A: the same live fleet home where worktrees/ exists but state/ does not ... resume creates state/ only, prints one REBUILT line, and leaves worktrees/ untouched",
      "evidence": [
        "same live fleet with state/ removed and worktrees/ present: resume prints exactly one line, REBUILT state/, exit 0",
        "sha256 of worktrees/t-001/scratch.txt unchanged across the run"
      ],
      "met": true
    },
    {
      "id": "M4-P16/6",
      "quote": "tiphys init in a cloned fleet home still exits 1, and its message now names tiphys resume as the remedy. Asserted on the remedy token, not on the exit code alone",
      "evidence": [
        "init on the existing fleet: exit 1 and the message carries the remedy token: 'run tiphys resume to rebuild the ephemeral directories a clone does not carry'"
      ],
      "met": true
    },
    {
      "id": "M4-P16/7",
      "quote": "Every new behavior is registered by name in test/behaviors.json and resolves by name. No criterion asserts a test COUNT",
      "evidence": [
        "fifteen resume-named keys present in test/behaviors.json, including resume-rehydrates-a-clone, resume-leaves-a-live-fleet-untouched, resume-rebuilds-only-what-is-absent, init-remedy-names-resume",
        "no count asserted by this walk either"
      ],
      "met": true
    },
    {
      "id": "M4-P18/1",
      "quote": "tiphys sync in a fleet home with a modified durable file and a modified ephemeral file commits exactly the first. Afterwards git status --porcelain lists exactly the ephemeral path and nothing else",
      "evidence": [
        "modified backlog.md (durable) and state/scratch.txt (ephemeral): sync -> COMMITTED backlog.md, COMMITTED unexpected.txt, PUSHED origin, exit 0",
        "git show --name-only HEAD names only the durable paths; nothing under state/",
        "the criterion's second sentence cannot hold literally: an ephemeral path under state/ is gitignored, so git status --porcelain never lists it and the tree is clean after sync. The property the criterion exists for (exactly the durable file was committed) holds, and the wording artifact is recorded rather than counted as a failure"
      ],
      "met": true
    },
    {
      "id": "M4-P18/2",
      "quote": "The durable set is data, not a literal list inside the command: it is derived from the fleet .gitignore written at init ... Asserted by adding a fourth ignored prefix to a fixture fleet and observing sync exclude it with no source change",
      "evidence": [
        "appended a fourth prefix 'scratchpad/' to the fleet .gitignore and created scratchpad/f.txt",
        "sync with NO source change: only .gitignore was committed; scratchpad/f.txt was excluded by the same derivation"
      ],
      "met": true
    },
    {
      "id": "M4-P18/3",
      "quote": "RED WITNESS, dangerous state, member A: state/orchestrator.lock present and unstaged. sync does not commit it, and git show --stat HEAD names zero paths under state/ other than the relocated status document",
      "evidence": [
        "unstaged state/orchestrator.lock present, backlog.md modified: sync exit 0",
        "git show --stat --name-only HEAD | grep -c '^state/' = 0"
      ],
      "met": true
    },
    {
      "id": "M4-P18/4",
      "quote": "RED WITNESS, dangerous state, member B, structurally different: the operator ran git add -A first, so the lease is ALREADY STAGED when sync runs. sync exits nonzero with one line naming the staged ephemeral path and commits nothing",
      "evidence": [
        "measured correction to the criterion's method: git add -A does NOT stage an ignored path, so that literal recipe reaches the GREEN arm (sync committed the durable file and exited 0)",
        "forcing the dangerous state with git add -f state/orchestrator.lock gives exactly what the criterion asks for: 'tiphys sync: state/orchestrator.lock is staged and is ephemeral by .gitignore:1 state/; unstage it with git restore --staged -- state/orchestrator.lock and re-run, nothing was committed', exit 1",
        "git log --oneline -1 unchanged across the refusal, so nothing was committed"
      ],
      "met": true
    },
    {
      "id": "M4-P18/5",
      "quote": "The push failure arm is written first and is reachable. With the remote URL pointing at a path that does not exist, sync exits nonzero and its stderr carries the first line of git's own stderr",
      "evidence": [
        "git remote set-url origin /nonexistent/path/to/remote.git, then sync: exit 1",
        "stderr: 'tiphys sync: git push to origin exited 128, so the durable state is committed locally and NOT pushed: fatal: '/nonexistent/path/to/remote.git' does not appear to be a git repository' - git's own words, not a hand-written message"
      ],
      "met": true
    },
    {
      "id": "M4-P18/6",
      "quote": "The commit message carries no AI model or tool name (CLAUDE.md binding convention 7). Asserted against a deny list held in test/, with two members",
      "evidence": [
        "commit subjects are of the form 'tiphys sync: N durable path(s)'",
        "case-insensitive grep of the last three commit subjects and bodies for claude, anthropic, gpt, copilot, opus, sonnet, ai-generated: no hits"
      ],
      "met": true
    },
    {
      "id": "M4-P18/7",
      "quote": "tiphys status show output is unchanged when state/status/stream.jsonl is truncated mid-line",
      "evidence": [
        "status emit --run r1 --state blocked, then status emit --run r2 --state done; truncate state/status/stream.jsonl 12 bytes short of the line end (tail shows a broken JSON fragment)",
        "status show afterwards: '2026-09-18T14:01:25Z done run=r2 project=fsync finished', exit 0, unchanged",
        "the red half (a scratch mutant pointing readCurrent at the stream) was NOT built; the C-1 property is readable at src/status.ts:15 and the two documents live on opposite sides of the fleet .gitignore as M4-D-13 specifies"
      ],
      "met": true
    },
    {
      "id": "M4-P18/8",
      "quote": "AGENTS.md:230 is amended to name tiphys sync as the mechanism ... AGENTS.md:295's sentence deferring the machinery to \"a later milestone\" is amended to name the delivering phases",
      "evidence": [
        "AGENTS.md:248 'HOW: `tiphys sync`, which is the mechanism this clause is discharged by. It is not a reminder to run git carefully.'",
        "AGENTS.md:344 'WHICH PHASES DELIVERED IT, replacing the sentence that deferred the machinery to \"a later milestone\" ... `tiphys resume` (M4-P16) ... `tiphys sync` (M4-P18)'",
        "grep -n 'later milestone' AGENTS.md returns only that replacement sentence, never a live deferral"
      ],
      "met": true
    },
    {
      "id": "M4-P24/1",
      "quote": "tiphys next in a fleet home prints exactly one next action and exits 3 while any in-flight item exists. It exits 0 only when every in-flight category is empty. The exit code is distinct from 0 and from 1 so a caller can tell \"work remains\" from \"the command failed\"",
      "evidence": [
        "empty fleet home: 'in flight: 0', one next-action line ('NOTHING IS IN FLIGHT in this fleet home...'), EXIT=0",
        "fleet with a project clone carrying one undelivered branch: 'in flight: 1', one next-action line ('DELIVER OR RETIRE refs/remotes/origin/really-open in project demo...'), EXIT=3",
        "non-fleet directory: EXIT=1 with one stderr line; all three codes distinct and observed"
      ],
      "met": true
    },
    {
      "id": "M4-P24/2",
      "quote": "It derives its working directory from the fleet home (loadFleet(process.cwd())) and contains no absolute path literal. Asserted by a test that greps the new source for /home/ and /tmp/ and requires zero hits",
      "evidence": [
        "grep -cE '/home/|/tmp/' src/commands/next.ts = 0"
      ],
      "met": true
    },
    {
      "id": "M4-P24/3",
      "quote": "The delivered-elsewhere predicate. A branch whose commits have landed on main under different shas is reported DELIVERED, not OPEN. RED WITNESS member A: a squash-merged branch ... Member B, structurally different: a branch whose commits landed inside ANOTHER branch's pull request",
      "evidence": [
        "built an upstream where git branch --merged main lists ONLY main, so the naive implementation calls all three branches open",
        "member A, squashed (two commits squash-merged onto main): reported DELIVERED, absent from the in-flight list",
        "member B, structurally different, feature-b (its one commit cherry-picked into carrier, and CARRIER squash-merged): reported DELIVERED",
        "control really-open: reported OPEN and is the single in-flight item, exit 3"
      ],
      "met": true
    },
    {
      "id": "M4-P24/4",
      "quote": "It prints what it CANNOT see as a named list: open pull requests, CI conclusions, and post-merge push runs. RED WITNESS: with the network unreachable, the cannot-see block is still printed and the exit code is unchanged",
      "evidence": [
        "unshare -n -- node bin/tiphys.ts next versus the same command with a network, same fleet, same second",
        "diff of the two captured outputs: IDENTICAL; both EXIT=3; the five-item cannot-see block present in both, including the open-pull-requests, CI-conclusions and post-merge-push-run entries the criterion names"
      ],
      "met": true
    },
    {
      "id": "M4-P24/5",
      "quote": "The plugin's pr open and pr merge each exit nonzero with one line when the credential is absent, and the KERNEL process never receives that credential",
      "evidence": [
        "FIRST HALF MET: with GH_TOKEN, GITHUB_TOKEN and TIPHYS_PR_TOKEN unset, 'pr open --repo o/n --head h --base main --title t' and 'pr merge --repo o/n --number 1' each exit 65 with ONE line: 'no pull-request credential is present: none of GH_TOKEN, GITHUB_TOKEN, GH_ENTERPRISE_TOKEN, GITHUB_ENTERPRISE_TOKEN carries a value, so this command has no authority to act and refuses rather than proceeding'",
        "SECOND HALF NOT REACHED: the credential-scrub probe run from inside the adapter's child environment was not re-run; plugin/** is outside this group's declared paths. Reported as not met rather than claimed",
        "also observed: the plugin lives at plugin/, not at the packages/claude-code-plugin/ path this phase's files-to-touch names"
      ],
      "met": false
    },
    {
      "id": "M4-P24/6",
      "quote": "Neither pr open nor pr merge is invoked by any kernel code path in M4. Asserted by a test grepping src/ and bin/ for the plugin's command names and requiring zero hits",
      "evidence": [
        "grep -rnE 'pr-main|runPr' src/ bin/ returns nothing",
        "the broader grep for the literals \"open\" and \"merge\" across src/ and bin/ hits only task-status values (src/task.ts:204, src/pool.ts:769) and prose comments, never a plugin invocation"
      ],
      "met": true
    }
  ],
  "deviations-judged": [
    {
      "deviation": "the verdict names one phase (M1-P1) while the review covers seven",
      "serves-plan-intent": true,
      "reasoning": "schemas/verdict.schema.json takes a single phase string and the sweep's group spans M1-P1, M1-P2, M3-P5, M3-P6, M4-P16, M4-P18 and M4-P24. The phase and head values were ASSIGNED by the dispatch so check-dual-review can group this verdict with its pair. Every criteria[].id is written <phase>/<criterion id> so a reader can resolve which plan section each walk belongs to, and the markdown names all seven. The cost is that verdict-criteria-complete cannot join this document to one plan phase, which is declared here rather than left to be discovered."
    },
    {
      "deviation": "every both-directions criterion was walked on its GREEN half only",
      "serves-plan-intent": true,
      "reasoning": "The red half of a both-directions criterion requires editing the tree (deleting a section, dropping a schema field, defanging a check) and this review is read-only on a detached clone. Each such criterion is reported met: false with the green half stated and the missing red half named, rather than counted as coverage. The exceptions are the criteria whose dangerous state can be built OUTSIDE the tree (M3-P5 criterion 2 and 6c, M4-P16 criteria 4 and 5, M4-P18 criteria 3, 4 and 5, M4-P24 criteria 3 and 4), and those were walked in both directions with real fixtures."
    }
  ]
}

```
