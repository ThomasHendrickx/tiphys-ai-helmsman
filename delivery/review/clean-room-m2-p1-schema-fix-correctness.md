# CR review: m2-p1 fix round (schema-self-check-inventory)

Started: 2026-08-06
Reviewer session workdir: see WORKDIR file

## Status: IN PROGRESS

## Setup / checkout verification

- `git fetch origin claude/m2-p1-schema-self-check-inventory` -> FETCH_HEAD = 87ea9f8f537330ad0db69db4bf84591af3f5386b (matches required sha)
- `git checkout 87ea9f8f...` -> HEAD is 87ea9f8f537330ad0db69db4bf84591af3f5386b, commit subject
  "M2-P1 fix round: schema self-check inventory, CI bundle parameterized-gate wiring"
- `git rev-parse origin/main` = 4c9bfbcbd63a1668ab6697fba0460514edb52602 (matches stated base)
- `git merge-base <head> origin/main` = 4c9bfbcbd63a1668ab6697fba0460514edb52602 -> head is a clean
  fast-forward descendant of base (no merge-base surprise)

## Scope audit

`git diff --numstat origin/main 87ea9f8f...`:

```
42	8	.github/workflows/gates.yml
761	0	delivery/work-history/m2-p1.md
26	5	src/gates/manifest.ts
3	1	test/behaviors.json
354	0	test/gates.test.ts
```

Exactly the five files declared in scope (src/gates/manifest.ts, test/gates.test.ts,
.github/workflows/gates.yml, test/behaviors.json, delivery/work-history/m2-p1.md). No extras.
SCOPE AUDIT: PASS.

## Mechanism 1 (schemaDocumentPaths enumeration): code read

- `src/gates/manifest.ts` diff: `schemaDocumentPaths()` now does
  `readdirSync(directory).filter(name.endsWith(".schema.json")).sort().map(fileURLToPath(...))`.
  Sort is present (deterministic). Uses same `fileURLToPath(new URL(name, schemaDirectory))`
  resolution as before -> dist/ resolution unaffected.
- Sole in-repo consumer: `src/commands/gates.ts` `cmdSelfCheck` (lines 190, 255), confirmed by
  `grep -n "schemaDocumentPaths" src/commands/gates.ts src/gates/manifest.ts` -> only those two
  files, 4 hits total (1 def, 1 import, 2 uses). Consumer iterates the array generically
  (`for (const path of schemaDocumentPaths())`) and loads EACH through `loadSchema()` (the closed
  keyword validator) at manifest.ts / gates.ts lines 204-226 (in gates.ts): JSON.parse -> loadSchema
  -> on `!loaded.ok` returns `status: "red"` naming `loaded.reason`. This satisfies 1(c): every
  shipped schema is validated against the closed keyword set, not merely counted.
- CR-812 parity test (`test/gates.test.ts`, "manifest-self-check reports one unit per schema
  document"): confirmed BYTE-IDENTICAL between origin/main and this branch. Diffed
  `sed -n '2360,2389p' origin/main:test/gates.test.ts` against
  `sed -n '2596,2625p' head:test/gates.test.ts` -> `diff` exit 0. It independently readdirs
  `src/gates/schemas` and asserts `record.units === schemas.length`. NOT weakened to agree with
  the function by construction -> 1(b) confirmed.

## Mechanism 2 (CI --only pin + fetch-depth): code read

- `.github/workflows/gates.yml` diff: PR-bundle step retains
  `--base "${{ github.event.pull_request.base.sha }}"` and
  `--head "${{ github.event.pull_request.head.sha }}"` (CR-830-1 shape, NOT `github.sha`), and adds
  `--only manifest-self-check`. Push step adds `--only manifest-self-check` only (it never had
  --base/--head). `fetch-depth: 0` added to `actions/checkout@v4`. -> 2(a) confirmed by direct
  read of the diff.

## Work-history read (delivery/work-history/m2-p1.md, fix-round section, lines 2266-3025)

Both mechanisms document: mechanism named at the MECHANISM level (not "the push step fails" but
"a hardcoded enumeration of a growing collection" / "the interim wiring cannot absorb a
parameterized gate"), a published derivation with full captured command output (grep/git grep
across src/, test/, bin/, .github/, scripts/; a second full-tree git grep pass), an explicit
"what this did NOT cover" section (dist/ excluded with reason, untracked files, delivery/ prose,
other phases' branches, GitHub's own YAML resolution), captured red-witness runs with sha256
hashes proving revert/restore is byte-exact, and a claim grep re-run by the implementer with every
hit reconciled. I independently re-ran the claim grep across the whole fix-round section (lines
2266-3025): 44 raw hits, cross-checked against the two claim-grep subsections' enumerated lists
(9 items for mechanism 1, 7 for mechanism 2 plus the excluded quoted-command/quoted-code-comment
lines) -- every hit is accounted for. PASS on fix-round contract items 1-3 and the claim grep,
pending my own independent re-execution below.

Proceeding to: independent re-execution of both red witnesses, then full gates on both toolchains.

## RESUMED after session reset (coordinator message)

Picking up from full-suite run on default toolchain. Rebuilding briefly re-verified state below.

## Independent gate run: default toolchain (node v22.22.2)

    $ node --version -> v22.22.2
    $ npm ci -> exit 0, EBADENGINE warning present (expected, floor is >=26)
    $ npm run build -> exit 0
    $ git status --short (after build) -> clean, nothing untracked/modified

Full suite (`npm test`, i.e. `node --test "test/**/*.test.ts"`), run in background with output
captured to a log file (beacon: log grew from 311 -> 647 -> 1121 -> 1175 -> completion lines over
successive polls, confirming liveness rather than a stalled/dead process):

    # tests 203
    # pass 201
    # fail 0
    # cancelled 0
    # skipped 2
    # duration_ms 125702.021509

0 fail, 2 skipped (the node-floor-gated tests that skip on <26, consistent with CLAUDE.md's
documented behavior). No "npm error"/"npm ERR" banner in the log. This matches the work history's
own honesty section that liveness/watcher flakes are load-dependent and not deterministic: this
run of the SAME suite on the SAME toolchain came back 0 fail where the work history's own earlier
run under heavier concurrent load saw 2 fail, both in test/liveness.test.ts (untouched by this
diff), reproducing exactly the "different failing set each run" signature the work history claims.

Target tests, confirmed individually in the log:

    line 271: ok 45 - both bundle steps' --only shape survives a required gate that its own step cannot evaluate
    line 349: ok 58 - manifest-self-check reports one unit per schema document          (CR-812 parity)
    line 355: ok 59 - manifest-self-check picks up a schema document dropped into the directory after the fact

All three PASS. `ls src/gates/schemas/` -> exactly `gate-manifest.schema.json`,
`gate-result.schema.json` (2 files), so the pre-existing "npm pack output contains both schema
documents" test's wording is still accurate at this commit (not this round's concern, unchanged).

GATE NUMBERS, DEFAULT TOOLCHAIN: npm ci exit 0, npm run build exit 0 (clean git status),
npm test 203 tests / 201 pass / 0 fail / 2 skipped.

## Independent gate run: floor toolchain (node v26.6.0)

    $ export PATH="<toolchain>/node-v26.6.0-linux-x64/bin:$PATH"
    $ node --version -> v26.6.0
    $ npm --version -> 11.18.0
    $ npm ci -> exit 0, NO EBADENGINE line
    $ npm run build -> exit 0, git status --short clean after

First attempt to run the full suite used a manual `nohup npm test > log 2>&1 &`; that background
process died silently partway through test/lock.test.ts (log stalled at line 119, mtime 2+ minutes
stale, no matching process left in `ps aux`, no OOM in `dmesg`, `free -h` showed 13Gi free) --
this is exactly the T-008 dead-process-no-notification shape CLAUDE.md warns about, but it was MY
own review-harness process that died, not anything in the fix under review; I did not treat the
silence as a pass. Root-caused as an artifact of my own polling method (an ad hoc `nohup &`
process group apparently getting reaped between tool calls) rather than anything in the diff:
re-launched identically to the successful default-toolchain method (foreground `npm test`, letting
the harness auto-background it past its 120s timeout) and it ran to completion cleanly:

    $ npm test (foreground, auto-backgrounded by the harness at 120s, polled to completion)
    ...
        both bundle steps' --only shape survives a required gate that its own step cannot evaluate (1311.311651ms)
    ...
        manifest-self-check reports one unit per schema document (338.850127ms)
        manifest-self-check picks up a schema document dropped into the directory after the fact (807.121837ms)
    ...
        doctor and the guard return one verdict about one beacon (1133.043027ms)
    ...
    tests 203
    pass 203
    fail 0
    cancelled 0
    skipped 0
    todo 0
    duration_ms 144332.464451
    (harness notification: exit code 0)

203/203 pass, 0 fail, 0 skipped (0 skipped confirms genuine floor-toolchain execution: the same
node-floor-gated tests that skipped under node22 all ran here). No "not ok" or "   " anywhere in the
log; the only lines matching a "fail" grep are test TITLES containing the word "fail" as part of
what they test, not failures (confirmed by inspecting each one; `fail 0` in the summary is
authoritative). The doctor/guard test passed (a failure would have printed the captured `CHECK
node` line CLAUDE.md warns about; a pass under the spec reporter prints no subprocess detail,
which is expected node:test reporter behavior, not evidence of anything hidden).

This run is CLEANER than either full run reported in the work history (which saw liveness/watcher
flakes under heavier concurrent load from sibling worktree sessions sharing this container --
confirmed by `ps aux` during my own run showing multiple other sessions' independent `node --test`
and `tiphys` invocations against other worktrees). Consistent with the work history's own claim
that those flakes are load-dependent and not attributable to this diff.

GATE NUMBERS, FLOOR TOOLCHAIN: npm ci exit 0 (no EBADENGINE), npm run build exit 0 (clean git
status), npm test 203 tests / 203 pass / 0 fail / 0 skipped.

## Independent red-witness re-execution 1: schema enumeration (mechanism 1)

Performed directly against the CLI, not by trusting the work history's captured transcript.

Baseline (`node bin/tiphys.ts gates self-check --manifest gates.manifest.json --result <out>`):

    manifest-self-check: green (2 schema documents validated)
    units: 2

Added a VALID extra schema document (`src/gates/schemas/zz-review-extra.schema.json`, closed
keyword set only: type/additionalProperties/required/properties) and re-ran:

    manifest-self-check: green (3 schema documents validated)
    detail: "... gate-manifest.schema.json, gate-result.schema.json,
             .../zz-review-extra.schema.json), and gates.manifest.json against ..."

units grew 2 -> 3 and detail names the new file by path. CONFIRMS 1(d) first half.

Removed it, replaced with an INVALID document outside the closed set
(`{"type": "string", "maxLength": 5}`) as `zz-review-bad.schema.json`, re-ran:

    manifest-self-check: red (2 schema documents validated)
    exit code: 1
    detail: ".../zz-review-bad.schema.json: unsupported schema keyword maxLength at #"

Fails loudly, names both the offending keyword (`maxLength`) and the filename, exits 1
(EXIT_RED). CONFIRMS 1(d) second half.

Removed the bad file; `git status --short` in the worktree returned NOTHING (no output at all) --
byte-clean, confirming no residue. CONFIRMS 1(d) third half.

## Independent red-witness re-execution 2: CI bundle --only shape (mechanism 2)

Confirmed hashes independently BEFORE reverting anything (i.e. I did not just trust the work
history's quoted hashes):

    $ sha256sum .github/workflows/gates.yml (current, fixed)
    584c81c21d9be4966014112d525b9a9a8e6a7c28437b53a0db061839eed61813
    $ git show origin/main:.github/workflows/gates.yml | sha256sum
    90e4d6d82515684a53e03d744d59815450e02ee7cd413a3c083b551e2a20a0d9

Both match the work history's own quoted hashes exactly, independently reproduced.

    $ node --test --test-name-pattern "both bundle steps" test/gates.test.ts   (fixed file)
    -> ok 1, pass 1, fail 0

Reverted `.github/workflows/gates.yml` to the origin/main (pre-fix) content, re-ran the same test:

    $ node --test --test-name-pattern "both bundle steps" test/gates.test.ts   (reverted file)
    -> failureType: 'testCodeFailure'
       error: The input did not match the regular expression /--only manifest-self-check/. Input:
       'node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence "${{ runner.temp }}/gate-evidence"'
       fail 1

Confirmed RED against the dangerous pre-fix state, matching the work history's own captured
failure text verbatim.

Restored with `git checkout -- .github/workflows/gates.yml` (file had no legitimate uncommitted
edit of my own at that point -- it was my own temporary revert -- so this use is safe per
CLAUDE.md's own sharper warning about that command):

    $ sha256sum .github/workflows/gates.yml -> 584c81c2... (matches fixed hash, byte-identical)
    $ node --test --test-name-pattern "both bundle steps" test/gates.test.ts -> ok 1, pass 1, fail 0
    $ node --test --test-name-pattern "the workflow's gate bundle step runs the gate runner and is able to fail" test/gates.test.ts
      -> ok 1, pass 1, fail 0   (CR-830-1's pre-existing guard, confirmed still green)

Final `git status --short` in the worktree: clean, nothing untracked or modified.

## Registry and scope, final confirmation

- `test/behaviors.json`: pure append, 2 new keys, both resolve BY NAME to existing test titles
  (verified with exact `grep -n '^test("..."'` matches for both, see earlier in this file).
- Scope: exactly the 5 declared files touched (`src/gates/manifest.ts`, `test/gates.test.ts`,
  `.github/workflows/gates.yml`, `test/behaviors.json`, `delivery/work-history/m2-p1.md`). No
  extras, confirmed twice (once via `git diff --numstat` at setup, once via final `git status
  --short` showing the worktree clean after all my own experiments were reverted/removed).

## Findings

No findings at MEDIUM or above. Two LOW/informational notes, neither blocking:

- **CR-1150 (LOW, informational only).** My own first attempt at the floor-toolchain full-suite
  run died silently (a dead background process with no notification, T-008's exact shape) -- this
  was a defect in MY ad hoc `nohup &` polling method for this review, not anything in the PR under
  review. Traceable to the shared container reaping backgrounded child processes started via plain
  `nohup ... &` between tool calls; the harness's own `run_in_background`-equivalent (a foreground
  command that the tool itself auto-backgrounds past its 120s timeout) did not exhibit this and
  completed cleanly both times it was used (default toolchain and, on retry, floor toolchain). No
  action needed on the PR; noting it only because CLAUDE.md's own dispatch contract (T-008) makes
  a silent process death worth naming even when it is the reviewer's own tooling that died, not the
  subject.
- **Informational.** `ps aux` during floor-toolchain execution showed several other sessions
  (different worktrees, e.g. `agent-a3b30fde713c4ab67`) running their own concurrent `npm test` /
  `tiphys` invocations against this same container. This corroborates, independently, the work
  history's own explanation for the liveness/watcher-test flakes it saw (real-clock contention
  under concurrent load) -- my own floor-toolchain run happened to see 0 fail / 0 skipped, cleaner
  than either of the work history's own two runs, consistent with variable load rather than a
  regression.

## VERDICT: APPROVE

Both mechanisms verified independently, from a clean checkout of the exact head sha, against the
exact base sha:

1. `schemaDocumentPaths()` enumerates `src/gates/schemas/*.schema.json` sorted, deterministic and
   complete (readdir + filter + sort, unchanged `fileURLToPath` resolution). The CR-812 parity
   test is byte-identical to origin/main -- not weakened to agree by construction. Every shipped
   schema is loaded through the closed-keyword validator (`loadSchema`), not merely counted, which
   my own two-member red-witness reproduction confirmed directly against the CLI: a valid addition
   grows `units` and is named in `detail`; an addition outside the closed set fails red, exit 1,
   naming both the keyword and the file. Cleanup left `git status --short` silent.
2. Both `.github/workflows/gates.yml` bundle steps are pinned to `--only manifest-self-check`; the
   PR-bundle step retains its `--base`/`--head` and the CR-830-1 head-sha shape
   (`github.event.pull_request.head.sha`, never `github.sha`). `fetch-depth: 0` was added to the
   checkout. My own revert-and-rerun of the new guard test against the pre-fix workflow file
   reproduced the exact captured red (`--only manifest-self-check` absent, regex match failure);
   restoring reproduced the exact fixed sha256 and both the new test and the pre-existing CR-830-1
   wiring test passed green afterward.

Fix-round contract: both mechanisms name the MECHANISM (not the instance), publish a derivation
with full captured command output, state what the derivation did NOT cover (dist/, untracked
files, other phases' branches, GitHub's own YAML resolution) with reasons, and the claim grep was
run and every hit reconciled -- I independently re-ran the same claim grep across the full
fix-round section of the work history (lines 2266-3025, 44 raw hits) and every hit is accounted
for in the two published claim-grep subsections.

Gates: default toolchain (node v22.22.2) npm ci/build/test all exit 0, 203 tests / 201 pass / 0
fail / 2 skipped. Floor toolchain (node v26.6.0, no EBADENGINE) npm ci/build/test all exit 0, 203
tests / 203 pass / 0 fail / 0 skipped. Scope audit clean (exactly the 5 declared files).
`test/behaviors.json` is a pure append with both new keys resolving by name to real tests.

No FIX-ROUND-NEEDED items. Clear to proceed with the second (cross-model) clean-room review per
DR-0012's dual-review requirement; this review alone does not satisfy that requirement by itself.



