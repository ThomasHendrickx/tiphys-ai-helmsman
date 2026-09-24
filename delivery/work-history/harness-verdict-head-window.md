# Work history: harness fix, verdict-head pre-change lookup window

Branch `claude/harness-verdict-head-window`, cut from `origin/main` at
`5394a15`. This is a harness fix, not a phase: the branch name deliberately
does not match the phase pattern. One file of code changes,
`test/verdict-head.test.ts`, plus this work history.

## The defect, as measured

`preHeadCommit()` in `test/verdict-head.test.ts` located the newest ancestor
whose `schemas/verdict.schema.json` does not declare `properties.head` by
walking `git rev-list --max-count=200 HEAD`. That commit is `b4dd6ff`. Its
position in `git rev-list HEAD` order, measured with the script
`position.sh` in this round's scratch directory (it walks `git rev-list HEAD`,
reads the schema at each commit, and prints the first whose `properties` lacks
`head`):

```
repo: .../agent-ad42da7412aead3f4 head: 5394a15 total ancestors: 495
position 194 sha b4dd6ff has-check-dual-review: yes
repo: .../vh-window/m5p1 head: 02cb01e total ancestors: 511
position 210 sha b4dd6ff has-check-dual-review: yes
repo: .../vh-window/merge head: 81416a8 total ancestors: 506
position 205 sha b4dd6ff has-check-dual-review: yes
```

(The repository paths are shortened by hand here; nothing else is altered.)
At 194 the window of 200 still reaches it, so `main` is green with six
positions of margin. At 210, on the M5-P1 branch, the window ends ten commits
short, `preHeadCommit()` returns `undefined`, and the three tests that assert
`!gitAvailable` in that case redden.

## Mechanism

**A test locating a historical commit through a FIXED-SIZE window over a
history that only grows.** The distance from HEAD to a fixed historical commit
increases by at least one with every commit and merge that lands after it, so
any constant bound is a countdown. The M5-P1 red is one instance; `main` itself
would have followed within about six more ancestors.

## Fix

The cap is removed: the walk is now `git rev-list HEAD` with no
`--max-count`, at test/verdict-head.test.ts:260. The loop body is unchanged and
still returns at the first ancestor whose tree lacks the field, so the
semantics documented in the comments are kept exactly: newest ancestor whose
TREE lacks `properties.head`, and it must carry `scripts/check-dual-review.mjs`
or the lookup returns `undefined`. The number of `git show` spawns is the
distance to the target, as before; only the listing, which is one process, now
covers the whole history. A comment records why the cap was removed, in the
file's existing capitalised-lead style.

The alternative the dispatch suggested (find the commit that introduced `head`
via `git log` over the schema path and take its parent) was not taken, because
the file's own comment explains that path-filtered search returned an M3
commit without `scripts/check-dual-review.mjs`, and "parent of the introducing
commit" is only equal to "newest ancestor whose tree lacks the field" on a
linear history. Removing the cap changes the one property that was wrong and
nothing else.

## Derivation (fix-round contract item 2)

Pre-fix, the site itself, on `origin/main`:

```
$ git grep -nE -e '--max-count|-n [0-9]+|max-count=|--depth|HEAD~[0-9]{2,}' origin/main -- test/verdict-head.test.ts
origin/main:test/verdict-head.test.ts:252:  const listed = git(["rev-list", "--max-count=200", "HEAD"]);
exit 0
```

Post-fix, the dispatch's command plus a wider history-query sweep and the CI
checkout depth, run by `deriv.sh` in the scratch directory at the fixed head
(so the verdict-head hit is now the explanatory comment at line 254, not code).
Full output, unedited:

```
$ grep -rnE -- '--max-count|-n [0-9]+|max-count=|--depth|HEAD~[0-9]{2,}' test src scripts bin .github
test/fixtures/plugin-hook-payloads/PROVENANCE.md:40:line ranges of `strings -n 8` over the shipped Claude Code binary, which is the
test/fixtures/plugin-hook-payloads/PROVENANCE.md:45:strings -n 8 /opt/claude-code/bin/claude > claude-strings.txt
test/verdict-head.test.ts:254:     read `--max-count=200`, a fixed window over a history that every merge
test/cutover-entry.test.ts:615:    (error: Error) => /--depth 1/.test(error.message),
test/cutover-entry.test.ts:618:    probe.assertReadOnlyGit(["clone", "--depth", "1", "https://example.invalid/x.git", "/tmp/ok"]),
test/cutover-entry.test.ts:1826:    "--depth",
test/witness.test.ts:2592:    "--depth",
scripts/release-verify.sh:501:  last_error="$(grep '^npm error' "$err_file" | grep -v 'complete log' | head -n 1 || true)"
scripts/m1-exit-test.sh:373:    tail -n 40 "${out_path}" >&2 || true
scripts/m1-exit-test.sh:516:  seeded_pass=$(sed -n 's/^# pass \([0-9][0-9]*\)$/\1/p' "${LAST_OUTPUT}" | head -n 1)
scripts/m1-exit-test.sh:517:  seeded_fail=$(sed -n 's/^# fail \([0-9][0-9]*\)$/\1/p' "${LAST_OUTPUT}" | head -n 1)
scripts/m1-exit-test.sh:929:      "still held by this run: $(head -n 1 "${LAST_OUTPUT}")"
scripts/m1-exit-test.sh:956:    status_line=$(head -n 1 "${LAST_OUTPUT}")
scripts/m1-exit-test.sh:1006:      "$(cd "${fleet}" && node "${TIPHYS}" lock status | head -n 1)" \
scripts/m1-exit-test.sh:1281:    | sed -n 's/^\([0-9][0-9]*\)-.*\.json$/\1/p' | sort -n | tail -n 1)
scripts/probe-pilot-readonly.mjs:19: *     carries `--depth 1`. A caller that hands it a mutating verb gets a
scripts/probe-pilot-readonly.mjs:104: * `--depth 1`, which is the form the plan names.
scripts/probe-pilot-readonly.mjs:118:    const depthAt = args.indexOf("--depth");
scripts/probe-pilot-readonly.mjs:120:    if (args.includes("--depth=1")) return;
scripts/probe-pilot-readonly.mjs:122:      "read-only git refused a clone that does not carry --depth 1",
scripts/probe-pilot-readonly.mjs:374: *      probe invokes are `ls-remote` and `clone --depth 1`. If the probe
scripts/m2-exit-test.sh:430:    tail -n 40 "${out_path}" >&2 || true
exit 0

$ grep -rnE -- 'rev-list|git log|"log"|HEAD~|HEAD\^|merge-base|--first-parent|"-n"|--since|--until|--skip' test src scripts bin .github | grep -v fixtures/json-schema
test/git-ceiling.test.ts:227:      const head = git(join(ancestor.root, "tmp"), ["rev-parse", "HEAD^{commit}"], ancestor.inherited);
test/payload-credentials.test.ts:283:      // Against HEAD~1 this call SUCCEEDS and the child-written probe file
test/payload-credentials.test.ts:362:  // Against HEAD~1 the omission is simply not a concept, the escape hatch is
test/payload-credentials.test.ts:445:      // HEAD~1 red witness above uses: against HEAD~1 this shape is refused
test/payload-credentials.test.ts:898:    // THE DANGEROUS STATE IS AN ABSENT FIELD, not a blank one. Against HEAD~1
test/payload-credentials.test.ts:1042:    // Against HEAD~1 both members below SUCCEED and meta.json records
test/payload-credentials.test.ts:1233:    // meta.json carries no `handover` key at all. Against HEAD~1 the
test/doctor.test.ts:1274: * `CHECK remote` parses `git rev-list --left-right --count` and reads `git
test/doctor.test.ts:1275: * fetch`'s exit code, `CHECK branches` reads `git merge-base --is-ancestor`'s
test/doctor.test.ts:1281: * The rev-list counts are TAB separated, which is the kind of byte a
test/doctor.test.ts:1539:    { heading: "git merge-base --is-ancestor origin/task/t-unmerged origin/main", args: ["origin/task/t-unmerged", "origin/main"] },
test/doctor.test.ts:1540:    { heading: "git merge-base --is-ancestor origin/main origin/main", args: ["origin/main", "origin/main"] },
test/doctor.test.ts:1547:    const live = spawnSync("git", ["-C", fleet, "merge-base", "--is-ancestor", ...arm.args], {
test/doctor.test.ts:1586: * total one too high per remote, and doctor ran `merge-base --is-ancestor` over
test/doctor.test.ts:1757:    ["-C", fleet, "rev-list", "--left-right", "--count", "origin/main...HEAD"],
test/doctor.test.ts:1769:      "git rev-list --left-right --count origin/main...HEAD, two commits ahead",
test/doctor.test.ts:1772:    "the live rev-list output is not the one the capture recorded",
test/single-family-exception.test.ts:110: * `git log --all --name-only -- 'delivery/review/*.yaml'` shows the only
test/sync.test.ts:458:  const message = gitIn(root, ["log", "-1", "--format=%B"]).stdout;
test/sync.test.ts:479:    gitIn(root, ["log", "-1", "--format=%an|%ae"]).stdout.trim(),
test/exit-test-local.test.ts:983:    const identity = git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], {
test/exit-test-local.test.ts:1103:    const identity = git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], {
test/remove-git-directory.test.ts:95:    if (git(dir, ["rev-parse", "HEAD^{commit}"]).status === 0) {
test/retirement-inventory.test.ts:1571:    "git log -p",
test/scope-gate.test.ts:432:test("a declaration widened on the head branch is NAMED rather than silently accepted, the declaration file's own change still needs authorizing, and the record's declaration sha256 remains the merge-base blob", () => {
test/scope-gate.test.ts:479:    // The merge-base blob is still what the record pins. Change B reads the
test/scope-gate.test.ts:561:test("a branch matching the phase pattern with no merge-base declaration is red naming the branch, a non-matching branch is not-applicable, and a matching branch without --phase is error", () => {
test/scope-gate.test.ts:994:test("a merge base forked onto the branch under audit, not the true fork point with main, is error (merge-base fork, W2)", () => {
test/scope-gate.test.ts:1024:    // BRANCH ITSELF (the widening commit), so `merge-base(forgedBase, head)`
test/scope-gate.test.ts:1352:    // THE merge-base declaration. Both arms below start from this one file.
test/scope-gate.test.ts:1576:      git(dir, ["commit", "-q", "-m", "narrow another phase under a merge-base grant"]);
test/init.test.ts:60:  const revList = gitIn(fleet, ["rev-list", "--count", "HEAD"]);
test/init.test.ts:170:  const log = gitIn(fleet, ["log", "--format=%an|%ae|%cn|%ce", "-1"], env);
test/verdict-head.test.ts:232: * DERIVED RATHER THAN PINNED, and the reason is that a pinned `HEAD~1` is
test/verdict-head.test.ts:260:  const listed = git(["rev-list", "HEAD"]);
test/behaviors.json:305:  "scope-anti-widening-merge-base-pinned": "a declaration widened on the head branch is NAMED rather than silently accepted, the declaration file's own change still needs authorizing, and the record's declaration sha256 remains the merge-base blob",
test/behaviors.json:306:  "scope-branch-pattern-three-directions": "a branch matching the phase pattern with no merge-base declaration is red naming the branch, a non-matching branch is not-applicable, and a matching branch without --phase is error",
test/behaviors.json:309:  "scope-diff-against-merge-base-not-supplied-base": "diffs are computed against the merge base of base and head, so a base that has advanced past the fork point does not misattribute another phase's changes",
test/behaviors.json:314:  "scope-merge-base-fork-is-error": "a merge base forked onto the branch under audit, not the true fork point with main, is error (merge-base fork, W2)",
test/behaviors.json:352:  "release-declared-none-record": "deploy gate reports not-applicable with declared true reason and merge-base blob sha for a declaration of none",
test/behaviors.json:355:  "release-anti-widening-merge-base": "deploy gate ignores a head declaration flipped to none and records the merge-base blob",
test/behaviors.json:759:  "witness-ownership-baseline-is-the-merge-base": "the ownership baseline is read at the merge base, so a spec another phase changed on the base branch is not authored here",
test/plan-projection.test.ts:12: * nothing about the property that matters, because the merge-base read is the
test/suite-gate.test.ts:355:  // AND its registry row leaves the bare runner green; the merge-base copy
test/suite-gate.test.ts:585:  // Criterion 9, M2-C-3: the merge-base registry comparison cannot be
test/suite-gate.test.ts:592:  assert.match(run.record.detail, /merge-base registry comparison/);
test/dual-review-head-anchor.test.ts:69: * ever stopped producing the history it means to. `merge-base --is-ancestor`
test/dual-review-head-anchor.test.ts:75:  const run = spawnSync("git", ["merge-base", "--is-ancestor", candidate, descendant], {
test/dual-review-head-anchor.test.ts:82:    `git merge-base --is-ancestor exited ${String(run.status)}: ${run.stderr}`,
test/next.test.ts:27: * `git branch --merged`, `git merge-base --is-ancestor`, `git merge-tree` and
test/next.test.ts:369:      ["-C", repo, "merge-base", "--is-ancestor", "refs/heads/feat-a", "refs/heads/main"],
test/next.test.ts:396:      ["-C", repo, "merge-base", "--is-ancestor", "refs/heads/feat-b", "refs/heads/main"],
test/next.test.ts:869:        "merge-base",
test/cutover-entry.test.ts:1807: * The claim was that `git log` returns nothing in a truncated history and the
test/cutover-entry.test.ts:1833:  const depth = spawnSync("git", ["-C", shallow, "rev-list", "--count", "HEAD"], {
test/witness.test.ts:2229:  assert.equal(git(dir, "merge-base", baseTip, head), mergeBase);
test/teardown.test.ts:268:    gitOk(worktreeOf(scratch, "t-squash"), ["rev-list", "--count", "HEAD", "^refs/remotes/origin/main"]),
test/teardown.test.ts:320:    "log",
test/teardown.test.ts:672:    gitOk(worktree, ["log", "-1", "--format=%s"]).startsWith(SALVAGE_PREFIX),
test/deploy-gate.test.ts:350: * anti-widening merge-base read, credentials, and the runner integration *
test/deploy-gate.test.ts:435:test("deploy gate reports not-applicable with declared true reason and merge-base blob sha for a declaration of none", () => {
test/deploy-gate.test.ts:514:test("deploy gate ignores a head declaration flipped to none and records the merge-base blob", { timeout: 20000 }, () => {
test/deploy-gate.test.ts:551:  assert.ok(detail.includes(base.sha), "the subject is the merge-base commit sha");
src/gates/scope.ts:47: * computed explicitly with `git merge-base`, and diffs are computed against
src/gates/scope.ts:59: * (for example `HEAD~1` after committing a widened declaration), which
src/gates/scope.ts:60: * makes `git merge-base(--base, --head)` resolve to a commit that is only
src/gates/scope.ts:65: * merge-base-vs-trunk validation immediately below, which this round added.
src/gates/scope.ts:245:  const result = runGit(cwd, ["merge-base", base, head]);
src/gates/scope.ts:249:      reason: `git merge-base ${base} ${head} could not be run: ${singleLine(String(result.error))}`,
src/gates/scope.ts:255:      reason: `git merge-base ${base} ${head} exited ${String(result.status)}: ${singleLine(bufferToUtf8(result.stderr))}`,
src/gates/scope.ts:262:      reason: `git merge-base ${base} ${head} produced no output`,
src/gates/scope.ts:271: * Resolve any ref-ish string (a sha, a branch, `HEAD`, `HEAD~1`, ...) to the
src/gates/scope.ts:332:/** `git merge-base --is-ancestor`: exit 0 is yes, exit 1 is no, anything else is error. */
src/gates/scope.ts:334:  const result = runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
src/gates/scope.ts:339:        `git merge-base --is-ancestor ${ancestor} ${descendant} could not be run: ` +
src/gates/scope.ts:352:      `git merge-base --is-ancestor ${ancestor} ${descendant} exited ${String(result.status)}: ` +
src/gates/scope.ts:461: * merge-base wrapper above keeps its name and its exported identity because
src/gates/scope.ts:607: * Compare the merge-base declaration with the head's, field by field.
src/gates/scope.ts:816:    // (for example `--base HEAD~1` after committing a widened declaration)
src/gates/scope.ts:1095:          `head ${actualHeadResult.sha} that are absent from the merge-base declaration, allowed ` +
src/gates/suite.ts:731:  // --base is a REQUIRED run parameter: without it the merge-base registry
src/gates/suite.ts:736:      "--base was not supplied; the merge-base registry comparison cannot be performed (M2-C-3)",
src/gates/suite.ts:741:      `registry path ${flags.registry} must be repository-relative so the merge-base copy can be resolved`,
src/gates/suite.ts:794:  const mergeBase = git(cwd, ["merge-base", flags.base, "HEAD"]);
src/gates/suite.ts:828:      `merge-base behavior registry ${mergeBaseSha}:${flags.registry}`,
src/gates/suite.ts:1057:  // Registry resolution and merge-base preservation (step 4).
src/gates/red-witness.ts:61: * history (the diff is base...head, a merge-base diff) and an UNSHALLOW
src/gates/red-witness.ts:194:        "merge-base diff and the harness scratch-clones the repository, " +
src/cutover.ts:116: * flip with `git log` over this exact path. A switch history that is not
src/checks.ts:4004:  const merged = gitIn(["merge-base", base, source.refSha], contextDirectory);
src/checks.ts:4389: * `merge-base --is-ancestor` ANSWERS WITH AN EXIT CODE, and 1 is an ANSWER
src/checks.ts:4403:    ["merge-base", "--is-ancestor", "--end-of-options", candidate, descendant],
src/checks.ts:4409:      reason: `git merge-base --is-ancestor ${candidate} ${descendant} could not be run: ${String(run.error)}`,
src/checks.ts:4421:      `git merge-base --is-ancestor ${candidate} ${descendant} exited ${String(run.status)}: ` +
src/checks.ts:5171:      "log",
src/witness/spec.ts:175: * the merge-base version of a spec, which has no path.
src/witness/run.ts:87:   * on two orphan roots in one repository: `git merge-base A B` exits 1 with no
src/witness/run.ts:263:  const mergeBase = gitIn(repoRoot, ["merge-base", baseSha, headSha]);
src/commands/next.ts:225:        `merge-base --is-ancestor reports ${branchRef} is not an ancestor of it`,
src/commands/doctor.ts:439:  const counted = runGitHere(root, ["rev-list", "--left-right", "--count", `${tracked}...HEAD`]);
src/commands/doctor.ts:445:        `git rev-list could not count HEAD against ${tracked}, so the ahead and behind ` +
src/commands/doctor.ts:457:        `git rev-list answered ${JSON.stringify(counted.stdout.trim())} for ` +
src/commands/doctor.ts:1401:    const ancestor = runGitHere(root, ["merge-base", "--is-ancestor", ref, trunk]);
src/commands/doctor.ts:1410:          `git merge-base --is-ancestor ${ref} ${trunk} exited ` +
src/teardown.ts:129:    "merge-base",
src/teardown.ts:140:      detail: `git merge-base --is-ancestor exited ${String(ancestor.status)}: ${singleLine(ancestor.stderr)}`,
scripts/check-clause-map.mjs:49: * `git merge-base` is deliberately not used: the check must give the same
scripts/check-id-collisions.mjs:93:  for (const path of paths(git(["log", "--all", "--pretty=format:", "--name-only", "--", ...dirs]))) {
scripts/check-cutover-entry.mjs:968: * `git log -1 --format=%ct -- <path>` "returns nothing when the path's last
scripts/check-cutover-entry.mjs:1036:  const dated = readOnlyGitRead(root, ["log", "-1", "--format=%ct", "--", relativePath]);
scripts/m2-exit-test.sh:813://       path and a merge-base blob sha256. A structural not-applicable
scripts/m2-exit-test.sh:843:      "evidence) NOR a declared-none (declaration path + merge-base blob sha256); the three " +
scripts/m2-exit-test.sh:1017:#   scope       -> a scratch git repository whose merge-base declaration governs
scripts/m2-exit-test.sh:1131:  const log = spawnSync("git", ["-C", repo, "log", "--format=%H %s"], { encoding: "utf8", env: GIT_ENV });
scripts/m2-exit-test.sh:1393:  # gate declares parameters:["base"] (its merge-base registry comparison), so
.github/workflows/gates.yml:32:      # commit, so `git diff base...head` and `git merge-base` exit nonzero
exit 0

$ grep -rn "fetch-depth\|checkout@" .github/workflows
.github/workflows/gates.yml:31:      # fetch-depth: 0 is load-bearing. A shallow checkout has only the tip
.github/workflows/gates.yml:56:      - uses: actions/checkout@v4
.github/workflows/gates.yml:58:          fetch-depth: 0
.github/workflows/macos-smoke.yml:15:      - uses: actions/checkout@v4
.github/workflows/release.yml:136:      # fetch-depth: 0 for the same reason .github/workflows/gates.yml gives:
.github/workflows/release.yml:138:      - uses: actions/checkout@v4
.github/workflows/release.yml:140:          fetch-depth: 0
.github/workflows/release.yml:385:      # fetch-depth: 0 IS LOAD-BEARING FOR THE PRE-EXISTING-TAG GUARD, and the
.github/workflows/release.yml:387:      # 1 by the clean-room hazard reviewer, reading `actions/checkout@v4`'s own
.github/workflows/release.yml:395:      - uses: actions/checkout@v4
.github/workflows/release.yml:397:          fetch-depth: 0
exit 0
```

### Classification of every hit

First command (bounded-window forms):

- `test/verdict-head.test.ts:252` on `origin/main`: **same flaw, fixed.** The
  only bounded history window any sweep in this round found.
- `test/verdict-head.test.ts:254` post-fix: the explanatory comment.
- `-n N` in `scripts/m1-exit-test.sh`, `scripts/m2-exit-test.sh`,
  `scripts/release-verify.sh`, and `strings -n 8` in the plugin-hook
  PROVENANCE: `head -n`/`tail -n`/`sed -n` over captured output files, or
  `strings`' minimum length. None walks git history. Safe.
- `--depth` in `scripts/probe-pilot-readonly.mjs`, `test/cutover-entry.test.ts`
  and `test/witness.test.ts`: a read-only probe that REQUIRES `clone --depth 1`
  of an external repository, and two tests that build a shallow clone of a
  scratch fixture ON PURPOSE to witness shallow-history behaviour (the
  cutover-entry one asserts `rev-list --count` is 1). The window is the thing
  under test, its size is fixed by the test, and the fixture history does not
  grow. Safe.

Second command (every other history query):

- `git log -1 ...` (sync, init, exit-test-local, teardown, check-cutover-entry
  line 1036): reads the NEWEST commit only, whose distance from HEAD is zero by
  construction. Safe.
- `rev-list --count` / `--left-right --count` (init, teardown, doctor source and
  test): counts over scratch fixtures or counts ahead/behind, no target to
  reach. Safe.
- `merge-base` and `merge-base --is-ancestor` (scope, suite, teardown, next,
  doctor, checks, witness, dual-review-head-anchor and many tests): unbounded
  by git's definition. Safe.
- `src/checks.ts:5171` `log --reverse --topo-order --full-history`: unbounded;
  its own comment already records that a shallow clone can only make it
  stricter. Safe.
- `scripts/check-id-collisions.mjs:93` `log --all`: unbounded. Safe.
- `scripts/m2-exit-test.sh:1131` `log --format=%H %s` over a scratch repo,
  searched for the M2-P2 commit: unbounded. Safe.
- `HEAD~1` / `HEAD^` hits (payload-credentials, scope.ts, git-ceiling,
  remove-git-directory, verdict-head:232): comments, or `HEAD^{commit}` peel
  syntax. No fixed-offset reach into real history. Safe.

Harness scripts under `.claude/`, swept with the tool-side equivalent of
`grep -rnE 'max-count|--depth|rev-list|"log"|HEAD~' .claude` (seven hits,
listed here in full):

```
.claude/merge-ready.mjs:73:  const n = Number.parseInt(git(["rev-list", "--count", localBranch, "--not", "--remotes"]), 10) || 0;
.claude/merge-ready.mjs:167:      after = git(["log", "--format=%h", `${reviewedHead}..${ref}`, "--", ".", ":(exclude)delivery/review"])
.claude/orchestrator-next.mjs:99:  const r = gitTry(["log", "origin/main", "--merges", "--format=%s"]);
.claude/orchestrator-next.mjs:202: * branch name; the following `rev-list` then exits with a usage error, `git`
.claude/orchestrator-next.mjs:452:    const counts = gitTry(["rev-list", "--left-right", "--count", `origin/main...${rb}`]);
.claude/orchestrator-next.mjs:485:    const c = gitCount(["rev-list", "--count", lb, "--not", "--remotes"]);
.claude/orchestrator-next.mjs:560:      const c = gitCount(["rev-list", "--count", `origin/main..${remote}`]);
```

All are counts, a range bounded by two named refs, or an unbounded merge log.
None is a fixed window. Safe.

CI checkout depth (the same mechanism one level up, since a shallow clone is a
fixed window of depth 1):

- The `gates` workflow checks out with `fetch-depth: 0` and
  `ref: ${{ github.head_ref }}`, and it is the job that runs `npm test`. So the
  PR run sees the branch head with full history, which is also why the old
  code would have reddened the M5-P1 pull request itself. Safe.
- `release.yml` checks out with `fetch-depth: 0` in both jobs. Safe.
- `macos-smoke.yml` uses `actions/checkout@v4` with its DEFAULT depth of 1,
  which is a shallow clone. It is safe today only because its `node --test`
  line names five files (`scope-gate`, `credentials-gate`, `suite-gate`,
  `spawn`, `authored-bytes`) and `verdict-head` is not one of them. In a depth-1
  clone `preHeadCommit()` returns `undefined` and the three tests assert
  `!gitAvailable`, so they would redden loudly rather than pass vacuously; that
  is the right failure direction, but adding this file (or any other test that
  reads real history) to the macOS job would need `fetch-depth: 0` there too.
  Not changed, since it is not broken and the workflow is not in this fix's
  scope. Flagged for the orchestrator.

## What the derivation did not cover (fix-round contract item 3)

- **Windows expressed as data rather than flags.** Both greps find git
  invocations that name a bound. A lookup that lists all of history and then
  truncates in code (for example `.slice(0, 200)` on the split output) would
  not be matched. I did not sweep `slice(` / `split("\n")` sites
  exhaustively; the second grep lists every `rev-list` and `log` call in the
  searched trees and I read the call site of each one that walks real
  repository history (verdict-head, checks.ts:5171, check-id-collisions,
  m2-exit-test.sh:1131, check-cutover-entry), and none truncates.
- **Git invocations built without the literal words.** A call assembled from
  variables (a subcommand held in a constant) would evade both greps. Not
  swept.
- **Trees outside `test src scripts bin .github .claude`.** `delivery/`,
  `roles/`, `schemas/`, `tuition/` and root files were not searched. They hold
  documents, schemas and role briefs, not executed history lookups. `.claude/`
  was swept separately (below) because it holds executed harness scripts.
- **Other growing quantities.** The mechanism generalises to any fixed bound
  over an append-only thing (the registries named in CLAUDE.md rule 5, log
  files, run lists). This derivation covered git history only.
- **Pinned shas.** Tests that reference a fixed historical sha are not a
  window and work under `fetch-depth: 0`; they were not enumerated.

## Red witness

Two structurally different members of the class, each red with the old code
and green with the fix, plus the control on `main`. All runs: node v26.6.0
(the scratch toolchain first on PATH), `node --test test/verdict-head.test.ts`,
`node_modules` symlinked from this worktree (identical `package.json` and
`package-lock.json`: `git diff --stat HEAD 02cb01e -- package-lock.json
package.json` printed nothing).

**Member one: linear commits on the tip.** The real M5-P1 branch
`origin/claude/m5-p1-pulse-value-proof` at `02cb01e`, detached in a scratch
worktree, target at position 210.

Old code, exit 1:

```
i tests 41
i suites 0
i pass 38
i fail 3
i cancelled 0
i skipped 0
x failing tests:
x the reconstructed pre-change schema agrees with the one in git, so the reconstruction is not a convenience (1115.733957ms)
  AssertionError [ERR_ASSERTION]: git is available but no pre-head commit was found
x RED WITNESS, criterion 3, member one: the PRE-CHANGE gate compares that same pair and reports green (1155.314064ms)
  AssertionError [ERR_ASSERTION]: git is available but the pre-change tree could not be staged
x RED WITNESS, criterion 5: the PRE-CHANGE gate greens a pair in which BOTH verdicts refuse the merge (0.487833ms)
  AssertionError [ERR_ASSERTION]: git is available but the pre-change tree could not be staged
```

Same tree with only this fix applied (`git apply` of this branch's diff), exit
0:

```
i tests 41
i suites 0
i pass 41
i fail 0
i cancelled 0
i skipped 0
```

**Member two: commits reached through a MERGE's second parent.** A scratch
worktree at `origin/main` (`5394a15`), ten empty commits on a side line, then
`git merge --no-ff` of that line into `5394a15`, giving head `81416a8` with
parents `5394a15 5f6d3a4` and the target at position 205. Nothing on the first
parent chain moved; the window was exhausted by the second parent's commits.

Old code, exit 1:

```
i tests 41
i suites 0
i pass 38
i fail 3
i cancelled 0
i skipped 0
x failing tests:
x the reconstructed pre-change schema agrees with the one in git, so the reconstruction is not a convenience (1080.219759ms)
  AssertionError [ERR_ASSERTION]: git is available but no pre-head commit was found
x RED WITNESS, criterion 3, member one: the PRE-CHANGE gate compares that same pair and reports green (1100.919239ms)
  AssertionError [ERR_ASSERTION]: git is available but the pre-change tree could not be staged
x RED WITNESS, criterion 5: the PRE-CHANGE gate greens a pair in which BOTH verdicts refuse the merge (0.509785ms)
  AssertionError [ERR_ASSERTION]: git is available but the pre-change tree could not be staged
```

With the fix, exit 0:

```
i tests 41
i suites 0
i pass 41
i fail 0
i cancelled 0
i skipped 0
```

**Control: this branch, target at 194.** Exit 0:

```
i tests 41
i suites 0
i pass 41
i fail 0
i cancelled 0
i skipped 0
```

The control is green with the old code as well (194 is inside 200), which is
exactly why the defect was invisible on `main`: it is not a witness for the
fix, it shows the fix does not break the in-window case.

## Suite

Toolchain node v26.6.0 (npm 11.18.0 from the same scratch prefix), `npm ci` exit 0,
`npm run build` exit 0 so `dist/` is BUILT, invocation `npm test` (which runs
`node --test "test/**/*.test.ts"`), at this branch's fixed working tree. Exit 0:

```
i tests 1512
i suites 0
i pass 1512
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 461068.527046
```

So: 1512 tests, 1512 pass, 0 fail, 0 SKIPPED. The same file alone on the
unfixed M5-P1 branch was 41 tests, 38 pass, 3 fail (member one above), which
is the orchestrator's measured 1509 pass and 3 fail seen from one file.

## Transliteration note (CLAUDE.md rule 3)

Every reporter capture above was transliterated mechanically: the witness
blocks with `sed` substitutions of the two glyphs (`captures.sh` in the scratch
directory, which writes them literally), the suite block with the equivalent
JavaScript `replace` in `assemble.mjs`, which also counted the glyphs from the
raw text before replacing them. Replaced: U+2139 (INFORMATION SOURCE) rendered as
`i`, 38 occurrences; U+2716 (HEAVY MULTIPLICATION X) rendered as `x`,
8 occurrences. Nothing else in any captured output was changed,
except that the witness blocks show the summary block and the failing-test
header and assertion lines selected from each run's output rather than the
whole output, and the position listing's repository paths are shortened as
stated there.

## Claim grep (both forms)

Line-based form, `grep -nEi '<the binding alternation>'` over this file, exit 0,
four hits, at lines 127, 138, 147 and 184, all inside the fenced derivation
output: repository source text quoted verbatim (two in the scope-gate test
name and its behaviors.json row, two in `test/suite-gate.test.ts` and
`src/gates/suite.ts`). None is a claim made by this document. The
wrap-insensitive form (`tr '\n' ' ' | grep -oEi`) printed four occurrences, the
same four, so no phrase in this document's own prose straddles a wrap. Both
runs were made before this section was written, and this section was worded to
add no hit. Re-run after writing it: the same four lines, and four
occurrences from the wrap-insensitive form.
