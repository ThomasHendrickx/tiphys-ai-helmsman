# Clean-room review: M5-P5 (context diet), hazard contract

Date: 2026-09-23
PR: #215
Branch: claude/m5-p5-context-diet
Head reviewed: 681efcd9bcc4da12440aea40fdcc18719f0d5a67
Contract: HAZARD
Model family: Sonnet
Method: clean-room, no access to implementer session. Checked out head
detached in isolated worktree, diffed against origin/main, re-executed
tests, attacked the diet mechanism directly.

## Summary

VERDICT: FIX-ROUND-NEEDED (see the JSON verdict for the machine-readable
form). One high finding: the diet's own guard against semantic-rule-loss
can be defeated while a binding rule is stripped of its force, and the
literal text of the rule survives somewhere in the file. Demonstrated by
two structurally different mutations against the real register and the
real committed CLAUDE.md, both against the actual test code at
test/retirement-inventory.test.ts:1064 (CR-001).

No evidence was found that the delivered diet in this PR actually exploits
this gap. The finding is about the guard's coverage, which is exactly what
a HAZARD contract asks for ("can this pass while the thing it guards is
broken").

## Setup

- Checked out 681efcd9bcc4da12440aea40fdcc18719f0d5a67 detached in this
  isolated worktree, fetched origin/claude/m5-p5-context-diet and
  origin/main.
- Toolchain: node v26.6.0 unpacked at
  /tmp/claude-0/f149de39-a9f2-5914-a54c-2f28bb0a8a27/scratchpad/node-v26.6.0-linux-x64/bin,
  put first on PATH, `node --version` verified in the same shell each time.
- `npm ci` then `npm run build` (tsc -b), exit 0, `git status --short`
  clean afterward except for this report file.

## Diff shape

`git diff origin/main...681efcd9bcc4da12440aea40fdcc18719f0d5a67 --stat`:
CLAUDE.md, delivery/STATE.md, delivery/plan/cutover/retirement-inventory.json,
delivery/plan/cutover/retirement-inventory.md, delivery/work-history/m5-p5.md,
test/behaviors.json, test/retirement-inventory.test.ts. Seven files, matching
the declaration's files-to-touch plus the standing extras (test/behaviors.json
and the phase's own work history). AGENTS.md, test/implementer-brief.test.ts
and test/clean-room-brief.test.ts are on the declaration's files-to-touch list
but were not touched, which the declaration permits (a files-to-touch entry is
a ceiling, not a floor).

## Boundary criterion (p5-boundary)

None of the seven changed paths is under delivery/evidence, delivery/review,
delivery/decisions, delivery/tuition or .claude/skills. Verified directly
against the `git diff --name-only` list above; no probe found a violation.

## Size criterion (p5-size)

`wc -c CLAUDE.md AGENTS.md delivery/STATE.md`: 72294, 36192, 34622, total
143108 bytes. The plan's ceiling is 186903 (287544 * 0.65). 143108 is well
under it, and matches the work history's own number. Re-measured directly,
not taken on the work history's word.

## Owner-action survival (part of p5-current-state / stale-state-survives)

Extracted every `A-<n>` token from `git show 6dc5b06:delivery/STATE.md` and
from the current delivery/STATE.md, sorted and diffed: no difference. Both
sets are A-1, A-2, A-3, A-4, A-5, A-6, A-7, A-8, A-9, A-10, A-14, A-15.
Confirms p5-current-state's "no owner action lost" reading directly rather
than trusting the STATE test alone.

## Diet register self-consistency

`node scripts/check-retirement-inventory.mjs`: "318 row(s) against 318
derived rule anchor(s), 9 retired, commands EXECUTED", "every rule in the
three roots is resolved", exit 0. `diet` array has 26 entries (11 CLAUDE.md,
15 delivery/STATE.md), `retired` array has 9 entries: matches the work
history's counts exactly, re-derived with a one-liner rather than taken on
trust.

None of the 26 live `diet` entries carries a `verified-by`, `probe` or
`negative-witness` key (grepped the diet array specifically, not the whole
file: the legacy M4-P23 `rows` array does use those keys for its PORT rows,
which is a different, older mechanism the diet array does not reuse). So the
"diet entry whose evidence is only a sibling keyword grep" attack point does
not describe anything present in the actual register; the new test class
(`test/retirement-inventory.test.ts:1064`) explicitly refuses any diet entry
that carries those keys, confirmed by mutation below.

## Gates re-executed directly

- `node scripts/check-authored-bytes.mjs`: exit 0, no output (clean).
- `node scripts/check-id-collisions.mjs`: exit 0, "check-id-collisions: no
  collisions", highest T-046 and DR-0055, matching main's tip.
- `node scripts/check-agents-references.mjs`: exit 0, "green (23 references
  resolved)".
- citations gate, re-run directly (not read from the work history):
  `node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full
  --only citations --evidence <dir> --base origin/main --head HEAD`:
  "citations: green: linted 2 changed document(s) at
  681efcd9bcc4da12440aea40fdcc18719f0d5a67: 16 citation(s) resolved, 0
  self-citation(s), 0 unverifiable-external", "every applicable gate is
  green". Matches the work history's claim exactly.
- scope gate: could not be re-run through the CLI on this head, because this
  worktree is on a detached HEAD (the brief's own setup instructions) and the
  branch `claude/m5-p5-context-diet` is checked out in another worktree
  (`git branch -a` marks it `+`), so `--phase m5-p5` resolves against a
  non-matching branch name and the gate reports not-applicable rather than
  running. Substituted a direct `git diff --name-only origin/main...HEAD`
  read (above), which is what the scope gate itself would check against the
  declaration's files-to-touch and extras. Recorded as an honest-failure item.
- Full suite (`npm test`, dist/ built): dispatched in the background because
  of wall time; see the Suite section below for the captured result.

## Mutation tests against the real committed files (red-witness discipline)

Every mutation below was applied to the real checked-out tree at this head,
run against the real test file, then reverted with `git checkout --` and
`git status --short` confirmed clean before the next one. No hand-written
strings; all captured output below is a real `node --test` run.

### CR-001, high: the completeness/enforcement guards check literal text presence, not binding force

Contract question: "can a binding rule be gutted while the guard against
semantic-rule-loss stays green?" Two structurally different mutations, both
answering yes.

**Member A: moving a whole "Never" list out of its binding location.**
Constructed a synthetic mutation of the current CLAUDE.md (not committed)
that removes the "Never" list block (including "Never soften a work
history...") from its live location and re-inserts the exact same text,
byte for byte, inside an HTML comment reading "superseded, retained only as
a literal quote for search, no longer binding" elsewhere in the same file.
Ran the real `uncoveredRemovals` logic from
test/retirement-inventory.test.ts:899 (copied verbatim into a standalone
script against the real repo, `atRevision` calling the real `git show`)
against this mutation:

```
sanity missing count: 0
target present in now? true
missing after semantic-gutting mutation: 0 []
```

The completeness check, whose own doc comment says "THE DANGEROUS STATE here
is a removal whose disposition LOOKS evidenced and is not," reports zero
missing blocks even though every one of the seven binding "Never" rules
(including "never merge your own work" and the C-1/C-2/C-3 constraints) has
just been moved into a comment that explicitly says it is no longer binding.
The check only asks whether the whitespace-normalized text (with citation
line numbers masked) appears anywhere in the file; it has no notion of
"inside a live, binding section" versus "inside a disclaimed appendix."

**Member B: a `mechanically-enforced` disposition naming an unrelated script
and test.** Edited the real, committed
delivery/plan/cutover/retirement-inventory.json in place (then reverted),
changing `diet-claude-md-02`'s `enforced-by` (the only `mechanically-enforced`
entry in the register, covering the grep -a / NUL-blindness rule) from
`scripts/check-authored-bytes.mjs` / the authored-byte test title to
`scripts/check-id-collisions.mjs` (a real, existing, but completely
unrelated script) and the title of an unrelated test
("a diet entry naming a block that is not at its baseline range is
refused"). Ran:

```
node --test --test-name-pattern="every diet disposition carries evidence" test/retirement-inventory.test.ts
```

Result: 1 pass, 0 fail. `checkDiet`'s `mechanically-enforced` branch (test/retirement-inventory.test.ts:1064,
implementation around test/retirement-inventory.test.ts:731-745 in the
diff) only checks that the named script file exists on disk
(`existsSync`) and that the named test title exists somewhere in `test/`
(`allTestTitles().has(by.test)`). It never checks that the script or test
actually has anything to do with the rule the entry claims to enforce, so
any real script name and any real test title discharges the obligation.

Both members attack the same class from different angles (one against the
completeness sweep, one against the disposition-specific check), so this is
not a single witness: red-witness rule's "one witness is not a class"
requirement is satisfied by structurally different members.

Why this matters for the milestone, not just this PR: the plan's own
grounding for M5-P5 says "The retirement inventory's PORT rows prove
keyword presence, not preserved force" (delivery/plan/value-delivery-plan.yaml:326)
and the diet register was built specifically to be the stronger replacement.
It is a materially better bar than a keyword grep (word-count floors, quote
matching, baseline-range checks all genuinely rule out the *simplest*
attacks), but it still cannot distinguish a rule that survives in force from
one that survives only as an inert quotation, and it accepts any existing
script/test name for `mechanically-enforced` without checking relevance.
Any later phase in this milestone that further compacts these files, or that
copies this test file's pattern for its own diet, inherits a guard with this
gap.

Fix direction (not prescriptive): require, for `history-moved` and
`mechanically-enforced`, that the `rule-kept`/`replacement` quote be found
inside a section of the CURRENT file that is not itself covered by another
diet entry and not inside an HTML comment or a block whose enclosing
heading matches a "superseded"/"retired"/"archived" pattern; and for
`mechanically-enforced`, that the named test's source actually references
the named script (a `readFileSync` grep of the test file's source for the
script's basename would rule out the concrete swap demonstrated above,
though it would not close the class completely, which is exactly this
finding's point: presence checks are not force checks).

## Mutation tests confirming the guards DO work against the simpler attacks

Three more mutations, each restored via `git checkout --` and confirmed
clean afterward:

1. Deleted `A-7` from delivery/STATE.md in place (`sed -i 's/\bA-7\b/action
   seven/g'`) and re-ran
   `node --test --test-name-pattern="STATE.md begins with the current standing" test/retirement-inventory.test.ts`:
   red, `AssertionError`, `actual: [ 'owner action A-7 is lost' ]`.
2. Removed the same "Never soften a work history" three-line block from
   CLAUDE.md outright (`sed -i '/Never soften a work history/,+2d'
   CLAUDE.md`, a genuine deletion rather than a relocation) and re-ran
   `node --test --test-name-pattern="every line removed from CLAUDE.md or AGENTS.md" test/retirement-inventory.test.ts`:
   red, `actual: [ 'CLAUDE.md@6dc5b06 lines 1339-1349' ]`.
3. Edited the real retirement-inventory.json, deleting `diet-claude-md-05`'s
   `history` field and adding a `verified-by: {command: "grep -c watchdog
   AGENTS.md", ...}` key instead, and re-ran
   `node --test --test-name-pattern="every diet disposition carries evidence" test/retirement-inventory.test.ts`:
   red, `actual: [ 'diet-claude-md-05: carries a keyword probe (verified-by); ...', 'diet-claude-md-05: has no history {at, quote}' ]`.

So a plain deletion with no disposition, a lost owner action, and a
reintroduced keyword-grep probe are all caught. CR-001 is specifically about
the narrower gap: a relocation that keeps the literal words, and an
enforcement claim that names something real but irrelevant.

## Shallow-clone / baseline dependency (attack point named in the brief)

`atRevision` (test/retirement-inventory.test.ts:900) calls `git -C <repo>
show 6dc5b06:<path>` for every diet check. `git rev-parse
--is-shallow-repository` in this worktree: `false` (full history present,
matching the setup this review was run in). The work history itself flags
this as an open question (delivery/work-history/m5-p5.md:230): "A shallow
clone fails it, and does not skip it." Verified this is the SAFE failure
mode, not a silent skip: every call site wraps the result in
`assert.ok(base !== null, ...)` before using it, so a shallow clone makes
the test fail loudly with a message naming the missing revision, not pass
vacuously. `.github/workflows/gates.yml:58` sets `fetch-depth: 0`, so CI is
not exposed to this. Not a finding; recorded as a checked attack point that
did not pan out.

## Mutation-tested behaviors.json names

All nine new names (`m5-p5-diet-live-inventory-evidenced` through
`m5-p5-state-daily-block-or-lost-action-refused`) were checked by direct
string comparison against `test(` titles in test/retirement-inventory.test.ts;
all nine resolve exactly (verified while reading the diff, and exercised
live by the `--test-name-pattern` runs above, which matched on the same
title text).

## Suite

`npm ci` exit 0. `npm run build` exit 0, `git status --short` clean
afterward (only this report file, untracked, present throughout). Full
`npm test` was dispatched in the background because of wall time; its
result is recorded below once captured.

## ASCII and citation conventions

This report is pure ASCII, no em dashes. Citation:
test/retirement-inventory.test.ts:1064 (outside backticks, resolves in the
branch, which the branch changes, satisfying CLAUDE.md rule 3b's
quote-into-changed-files guidance).

## Probes run (including ones that found nothing)

- Grepped the live `diet` array for `verified-by`/`probe`/`negative-witness`:
  none found (only in the legacy `rows` array).
- Checked every diet entry's word-count floors against MIN_RECORD_WORDS(8)/
  MIN_RULE_WORDS(6): all real entries clear the floor except the
  `superseded-status`/`archived` STATE entries, which the test code itself
  gives a floor of 1 word (by design, not a gap: those dispositions are not
  claiming a rule survived, only that a status block is stale).
  the AGENTS.md-shares-words `exact-duplicate` block-membership check
  (test/retirement-inventory.test.ts:753-761): not exercised by mutation
  beyond the pre-existing test in the file, which already red-witnesses it;
  did not find a second structurally different bypass in the time available.
- git merge-tree cleanliness against origin/main (claimed in the work
  history): not independently re-executed; taken as a secondary claim, not
  load-bearing for this contract.
- Credential scrub / license / typecheck gates: not re-run independently;
  none of the changed files are source, dependency or credential-bearing,
  so these gates are not where a context-diet phase's hazard would surface,
  and the work history's own PR-bundle line covers them as part of the
  10-gate applicable set.

## Honest-failure section

- Could not re-run the `scope` gate through the CLI against this exact head,
  because the branch is checked out elsewhere and this worktree is
  necessarily detached (per this review's own setup instructions).
  Substituted a manual `git diff --name-only` comparison against the
  declaration's files-to-touch and extras, which is what the gate itself
  reads; did not independently verify the scope gate's own additive-grant
  logic against this head.
- Did not exhaustively mutate every one of the 26 diet entries or all nine
  new tests; time was spent finding and confirming CR-001 with two
  structurally different members, plus three confirming mutations for the
  simpler attack classes named in the brief, rather than mutating every
  entry.
- Did not independently verify the `git merge-tree` conflict claims against
  the two named unmerged sibling branches (`claude/m5-orchestrator-paperwork-2`,
  `claude/m5-p1-pulse-value-proof`); out of scope for a hazard review of this
  PR's own content.

