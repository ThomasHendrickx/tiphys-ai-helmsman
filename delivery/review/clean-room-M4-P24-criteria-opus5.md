# Clean-room review: M4-P24 (criteria contract)

> NOTE ADDED WHEN THIS DOCUMENT WAS COMMITTED, and it changes nothing in the
> review's own text. Every `path:line` below was resolved by the reviewer
> against head 29868801eb464a15317b5b275188bd59a31bade8, the head under review.
> Round 1 changed `src/commands/next.ts`, `plugin/src/pr.ts`,
> `plugin/src/index.ts`, `test/next.test.ts` and several witness specs, so a
> line number into any of those points at the PRE-FIX file and the line that
> number resolves to in the current tree is no longer the line being discussed.
> That is CLAUDE.md rule 3b's silent case, stated here rather than repaired by
> editing a reviewer's evidence. Resolve those citations at the head named
> above. `check-dual-review` reads only `.yaml`, `.yml` and `.json` under
> `delivery/review/` (src/checks.ts:3030), which is why the machine-readable
> verdict is fenced in section 9 rather than committed as its own file.


- phase: M4-P24
- branch: claude/m4-p24-cutover-gaps
- head: 29868801eb464a15317b5b275188bd59a31bade8
- base: origin/main
- contract: criteria
- framing: correctness-and-data-loss
- reviewer model family: Claude Opus

Status: IN PROGRESS. Written incrementally from first minutes.

## 0. Diff inventory (verified)

git diff --stat origin/main...origin/claude/m4-p24-cutover-gaps
24 files, 2944 insertions, 40 deletions.
Shipped-surface files touched: src/cli.ts (+2), src/commands/next.ts (new, 436),
plugin/src/index.ts (+17), plugin/src/pr.ts (new, 244), plugin/src/pr-main.ts (new, 32).

## 1. First check: the not-covered statement (fix-round contract item 3)

Work history section "What this phase did NOT cover" carries NINE numbered
limits. Judgement: HONEST, and unusually so. Three of them are self-incriminating
in ways a reviewer would otherwise have had to find:

- item 1 admits `gh` is never invoked by any test, so the credential-PRESENT
  arm of `pr open` and `pr merge` is entirely unexercised.
- item 6 admits the patch-id arm can answer `delivered` for a branch whose
  content is no longer on a rebased base.
- item 9 admits the criterion-6 grep reads `src/` and `bin/` only.

WORSE THAN IT SOUNDS: item 1. It is stated as "whether gh ACCEPTS the argv is an
open question". The stronger true statement, which the phase does not make, is
that no test anywhere constrains WHAT the argv selects. See finding F-1: the
merge argv is built with an EMPTY PR selector when `--number` is omitted, and
`runPr` returns 0 having spawned the merge. Item 1's framing makes that read as
an acceptance question when it is an argument-validation defect.

Not worse than it sounds: items 3, 4, 8, 9. Item 7 is a fair statement that the
inventory reclassification is a judgement.


## 2. Suite sentence, reproduced

Work history claims: node v26.6.0, dist/ present, `npm test`, 1294 tests /
1294 pass / 0 fail / 0 skipped, clean `git status --short` after build.

I reproduced it in a GIT WORKTREE (not a `git archive` copy, which the brief's
measurement 9 says matters) at /tmp/claude-0/rev-m4p24, head 2986880:

- `npm ci` exit 0
- `npm run build` exit 0, `git status --short` EMPTY
- `npm test` exit 0, reporter summary: tests 1294, pass 1294, fail 0,
  cancelled 0, skipped 0, todo 0, duration_ms 300421

All four qualifiers match and the counts match exactly. The suite sentence is
complete and true. The fourth qualifier (checkout vs archive) is not named in
the work history; it is the only qualifier it omits, and it does not change the
number here.

## 3. Claim grep, both forms plus the seven passive forms

- line-based binding command: 34 lines, 54 occurrences
- wrap-insensitive form: 54 occurrences
- the two agree, so nothing straddles a wrap. This matches the work history's
  own fixed-point block exactly.
- the seven passive forms the brief adds (`is refused|is validated|is checked|
  is handled|is guarded|is rejected|is enforced|is prevented|is caught`):
  3 hits, ALL of them inside the quoted pattern list or the uniq -c table.
  No unsettled passive over-claim.

The five settled hits each carry an adjacent captured command. I re-ran the
`discharges: M4-D-07` one and it resolves. No over-claim found.

## 4. Counts pinned over an append-only registry

- `test/behaviors.json`: 12 rows APPENDED, no count asserted anywhere in
  test/next.test.ts. The registration test resolves BY NAME.
- `delivery/plan/cutover/retirement-inventory.json`: the PORTED rows record
  `verified-by.output` values ("4"). I checked the checker rather than assuming:
  scripts/check-retirement-inventory.mjs:826 compares the re-run EXIT CODE,
  not the output string. So "4" is a record, not a pin. No convention-5 defect.

## 5. C-1, C-2, C-3

- C-1 (no state from a log tail): `collectInFlight` reads `tasks/<id>/meta.json`,
  `worktrees/*.pool.json` and git refs. No append-only log is tailed.
- C-2 (no pid / process liveness): grep for `process.kill`, `/proc`, `pid` in
  src/commands/next.ts and plugin/src/pr.ts returns nothing that uses liveness
  for identity or exclusion. plugin/src/pr-main.ts spawns a child and reads its
  exit status, which is a result, not a liveness probe.
- C-3 (no auto-backgrounding): every spawn is `spawnSync`.

No violation found.

## 6. Verdict

FIX-ROUND-NEEDED. Two HIGH findings (CR-001, CR-002), both measured, both
reaching src/commands/next.ts and the `tiphys next` command; two MEDIUM
(CR-003 reaching the published plugin package, CR-004 reaching next.ts); three
LOW.

Machine-readable verdict: /tmp/claude-0/verdicts/M4-P24-criteria.json
(validates against schemas/verdict.schema.json; negative control with verdict
flipped to APPROVE is INVALID exit 1, so the instrument can go red).

## 7. Against delivery/verification/m4-prototype-probes.md

Checked for contradiction, since the brief says the measurement wins.

- Probe 1 (delivery/verification/m4-prototype-probes.md:17) refutes M4-D-07's
  premise and is the discharge this phase relies on to run despite the
  prototype-blocked marker. The work history cites the plan's discharge line
  (delivery/plan/kernel-plan-m4.md:1400) rather than the probe; both are true
  and consistent.
- Probe 3 (delivery/verification/m4-prototype-probes.md:55) measures that in
  this container the credential boundary is the UID AND THE FILESYSTEM, not
  the environment, and that the kernel's scrub spawns the child at the same
  uid. The work history does NOT contradict it: criterion 5's section is
  scoped throughout to the environment, and the test asserts environment
  names and a canary VALUE, never a filesystem property.
  OBSERVATION, not a finding: the section heading "the kernel process never
  gets one" reads wider than what was measured. A reader who takes it as a
  security property is reading past probe 3. Worth one qualifying clause in a
  later round; no shipped artifact is wrong.
- No other probe bears on this phase's surface.

## 8. What I attacked and how it held

Held: the delivered-elsewhere predicate's two arms (I built the fixtures and
re-ran the members), the credential refusal path (byte-for-byte against a
recorded run), the credential boundary test (the child-written probe is the
first assertion and the async helper fix is real), the exit-code three-valued
design, the absence of any absolute path literal, the claim grep in both forms
and in the seven passive forms, the behaviors registry (by name, no counts),
the retirement-inventory amendment (checker compares exit codes, not output),
and C-1/C-2/C-3.

Broke: the two silent-empty paths in the stop condition (CR-001 corrupt task
record, CR-002 remote-only branches), the unvalidated merge selector in the
shipped plugin (CR-003), and the blindly trusted origin/HEAD (CR-004).


## 9. The machine-readable verdict, EMBEDDED RATHER THAN COMMITTED AS ITS OWN FILE

The JSON verdict this review produced is fenced below instead of being written
to its own file at the top level of `delivery/review/`. The reason is
mechanical: `check-dual-review` reads that directory NON-RECURSIVELY as its
corpus, so a verdict document reading FIX-ROUND-NEEDED sitting there turns the
gate red, which is the gate working. The evidence still travels with the pull
request, which is what DR-0031 requires, and it stays readable.

```json
{
  "kind": "verdict",
  "phase": "m4-p24",
  "head": "29868801eb464a15317b5b275188bd59a31bade8",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "claude-opus",
  "framing": "correctness-and-data-loss",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-001",
      "severity": "high",
      "evidence": [
        "src/commands/next.ts:229 reads `const meta = readTaskMeta(fleet, id);` and src/commands/next.ts:230 records an item only when `meta !== undefined && meta.status === \"open\"`. There is no else arm, so a task directory whose meta.json could not be read contributes to NEITHER `report.items` NOR `report.unknown`.",
        "src/task.ts:381 returns `undefined` for an absent file, an unreadable file, a body that does not parse as JSON (src/task.ts:390) and a body that parses but fails the field check (src/task.ts:404). All four collapse to the same value the caller reads as 'not open'.",
        "MEASURED by me at this head. Fleet created with `node bin/tiphys.ts init`, then a single task directory `tasks/t-0001/meta.json` written as a TRUNCATED JSON object (the artifact a killed agent leaves). `tiphys next` printed: `in flight: 0`, `unknown: 0`, `next action: NOTHING IS IN FLIGHT in this fleet home`, `exit 0`. Captured run under /tmp/claude-0/probe3.",
        "src/commands/next.ts:29 to :34 is the module's own claim that this cannot happen: 'WHAT CANNOT BE ESTABLISHED IS COUNTED AS WORK, NEVER AS EMPTY. A category this command failed to read is reported in `unknown` and holds the exit code at `EXIT_WORK_REMAINS`. T-036 is the measured instance of the opposite choice'. The property holds at CATEGORY granularity (the readdirSync try/catch at src/commands/next.ts:222) and not at ROW granularity, which is where the T-036 artifact actually appears.",
        "The same mechanism has a second call site inside this command's read path: src/pool.ts:769 skips a task whose `readTaskMeta` returns undefined, so `poolEntries` inherits it too.",
        "The only test for this property, test/next.test.ts:565 'next counts a category it could not read as work remaining rather than as empty', exercises the PROJECT-DIRECTORY arm only (a projects/ entry that is not a git repository). No test exercises an unreadable row inside a category, so this is the 'one witness is not a class' shape as well."
      ],
      "concrete-fix": "In `openTasks` (src/commands/next.ts:217), when `id` matches TASK_ID_PATTERN and `readTaskMeta` returns `undefined`, push onto `report.unknown` a line naming the task id and `tasks/<id>/meta.json`, e.g. `report.unknown.push(\\`task ${id}: tasks/${id}/meta.json could not be read as a task record, so its status is not established\\`)` instead of falling through. Add a red witness whose dangerous state is the current skip, and a second structurally different member (a meta.json that parses but fails the field check) so the class has two members rather than one.",
      "analysis": "This is T-036's mechanism reproduced inside the command built to prevent T-036, and it is reachable by the ordinary failure this repository keeps meeting: a process killed mid-write. The stop condition then prints the one sentence the whole rule exists to make impossible."
    },
    {
      "id": "CR-002",
      "severity": "high",
      "evidence": [
        "src/commands/next.ts:323 lists branches with `git for-each-ref --format=%(refname) refs/heads/` only. `refs/remotes/**` is never walked, so a branch that exists only on a remote is in no in-flight category at all.",
        "MEASURED by me at this head. Upstream repository with `main` plus an undelivered branch `feat-open` carrying a commit that is on no other ref; `git clone` into `<fleet>/projects/demo`, which leaves `refs/heads/main` plus `refs/remotes/origin/{HEAD,main,feat-open}`. `tiphys next` printed `in flight: 0`, `unknown: 0`, `next action: NOTHING IS IN FLIGHT in this fleet home`, `exit 0`. Captured run under /tmp/claude-0/probe2.",
        "A cloned project is not an exotic state: `tiphys init` refuses a cloned fleet home and names `tiphys resume` as the remedy (test 'init in a cloned fleet home still exits 1 and names tiphys resume as the remedy', which passed in my run), and a resumed fleet home re-clones its projects, after which every branch in them is remote-only.",
        "The work history admits the gap and admits the disclosure gap with it: delivery/work-history/m4-p24.md:168 'The branch category reads LOCAL branches only. refs/remotes/* is not walked ... The cannot-see list does not name this, and naming it would be an improvement a later round could make.'",
        "src/commands/next.ts:74 is the CANNOT_SEE list and none of its four entries names remote-only branches, so the command presents a confident empty answer for the one category that outlives tasks and worktrees."
      ],
      "concrete-fix": "Either walk `refs/remotes/` as well in `undeliveredBranches` (src/commands/next.ts:323), excluding `origin/HEAD` and the resolved base ref and de-duplicating against the local refs already judged, or, as the minimum that removes the silent half, add a fifth entry to `CANNOT_SEE` at src/commands/next.ts:74 reading approximately 'branches that exist only on a remote: this command walks refs/heads/ only, so a freshly cloned project reports nothing in flight however much is open on its remote', and extend test/next.test.ts's cannot-see test to assert that entry.",
      "analysis": "This is the guard-that-cannot-go-red shape in the shipped stop condition: in the post-clone state the branch category is empty by construction, so `tiphys next` reads quiet at full speed. Criterion 1's literal words are satisfied because the CATEGORY is empty; the guarantee a reader takes from exit 0 is not."
    },
    {
      "id": "CR-003",
      "severity": "medium",
      "evidence": [
        "plugin/src/pr.ts:182 `mergeArgv` builds `[\"pr\", \"merge\", flags.number ?? \"\", \"--repo\", flags.repo ?? \"\", \"--squash\"]`. `--number` is never validated: plugin/src/pr.ts:215 refuses only when `flags === undefined || flags.repo === undefined`.",
        "MEASURED by me at this head, driving the shipped module with an injected executor: `runPr([\"merge\",\"--repo\",\"owner/name\"], {env:{GH_TOKEN:\"t\"}, ...})` built the child argv `[\"gh\",\"pr\",\"merge\",\"\",\"--repo\",\"owner/name\",\"--squash\"]`, wrote `pr merge: gh exited 0` to stdout and returned exit 0. No refusal was emitted at any point.",
        "plugin/src/pr.ts:221 states the module's own principle for exactly this situation: 'THE CREDENTIAL CHECK IS BEFORE ANY CHILD IS BUILT. A refusal that had already spawned something would have exercised the authority it is refusing to exercise.' The authority check is made; the TARGET check is not.",
        "No test constrains the merge argv. test/next.test.ts:659 runs both subcommands with `--number 1` always, and the only argv assertions are on the refusal path.",
        "The phase's own not-covered item 1 (delivery/work-history/m4-p24.md:151) says `gh` is never invoked by any test and 'Whether gh pr create and gh pr merge accept the argv this builds is an open question here'. So nothing in this repository establishes what an empty PR selector does to a squash merge, and I cannot establish it either: `command -v gh` exits 1 in this container (CLAUDE.md standing warning 6).",
        "plugin/src/index.ts:24 re-exports `mergeArgv` and `runPr`, and plugin/package.json ships `dist`, so this is public API of the published @tiphys/claude-code-plugin package, not an internal helper."
      ],
      "concrete-fix": "In `runPr` (plugin/src/pr.ts:214), refuse before resolving the credential when `subcommand === \"merge\" && flags.number === undefined`, with one line naming `--number` and the same nonzero discipline the credential refusal uses, e.g. a new `PR_EX_NO_TARGET` or a reuse of `PR_EX_USAGE`. Add a red witness whose dangerous state is the current `flags.number ?? \"\"` so the refusal is demonstrated red without it, and assert the built argv contains no empty-string element in `mergeArgv` and `openArgv` alike.",
      "analysis": "Reachability is a published npm package and its `pr merge` entry point, and the operation guarded is a squash merge, which is the least reversible thing this codebase can do. I grade it medium rather than high only because I could not measure gh's behaviour on an empty selector; the defect that IS measured is that a destructive command is spawned with an unvalidated required argument, and the fix does not depend on which way gh behaves."
    },
    {
      "id": "CR-004",
      "severity": "medium",
      "evidence": [
        "src/commands/next.ts:263 resolves the base ref from `git symbolic-ref --quiet refs/remotes/origin/HEAD` and returns it whenever the command exits 0 and prints anything, with no check that the ref names the project's default branch.",
        "MEASURED by me at this head. A clone whose upstream HEAD was a feature branch produced `baseRefOf(...)` -> `{\"ok\":true,\"ref\":\"refs/remotes/origin/feat-open\"}`, and `collectInFlight` then returned `{\"items\":[],\"unknown\":[]}` while the same repository's `git cherry refs/remotes/origin/master refs/heads/feat-open` printed `+ a9b7f94be3c78532bedce722b101ca0002829316`, i.e. a commit on no other ref. `tiphys next` exited 0. Captured run under /tmp/claude-0/probe-remote-only.",
        "`origin/HEAD` is written once at clone time and git never refreshes it, so a default-branch rename upstream leaves every existing clone pointing at a branch that is not the default until someone runs `git remote set-head`.",
        "src/pool.ts:366 to :372, which src/commands/next.ts:257 cites as the precedent for this resolution, argues the OPPOSITE conclusion for the same data: 'It is never filled with a plausible default. \"origin\" and \"main\" are right often enough to look harmless and wrong often enough to destroy work: a guessed default branch sends the landed-ness judgement at a ref that is not the project's default'. Here the guess is inherited rather than typed, and the outcome is the same wrong ref with no `unknown` recorded.",
        "No test covers a clone whose origin/HEAD is not the default branch; test/next.test.ts builds its repositories with `main` checked out."
      ],
      "concrete-fix": "In `baseRefOf` (src/commands/next.ts:260), accept `origin/HEAD` only when it resolves to a ref whose short name also appears as the repository's configured default (for example cross-check against `git config --get branch.<name>.remote`/`remote.origin.fetch`, or simply prefer `refs/remotes/origin/main` and fall back to origin/HEAD), and when the two disagree return `{ok:false, reason: ...}` so the project lands in `report.unknown` rather than being judged against a feature branch. At minimum, record the resolved base ref in the printed report so a reader can see which ref the delivery judgement used.",
      "analysis": "The failure is silent in the direction that ends work: everything is judged delivered, nothing is recorded as unknown, and the command exits 0."
    },
    {
      "id": "CR-005",
      "severity": "low",
      "evidence": [
        "test/next.test.ts:798 asserts only that no file under src/ or bin/ CONTAINS the strings `pr open`, `pr merge` or `plugin/src/pr`. A kernel module that did `import { runPr } from \"@tiphys/claude-code-plugin\"` and called `runPr([\"merge\", ...])` contains none of the three and passes.",
        "witness/pr-commands-uninvoked-by-the-kernel.json declares two dangerous states and both are the same defect: insert the literal token (`const INVOKED_BY_THE_KERNEL = \"pr open\"` into src/commands/next.ts, and `[\"pr merge\", cmdNext]` into src/cli.ts). Neither is an invocation, so the class 'a kernel code path invokes the plugin capability' has zero members among its witnesses.",
        "I ran the grep myself at this head: `grep -rn 'pr open\\|pr merge\\|plugin/src/pr' src/ bin/` returns zero hits, so the criterion is met as written.",
        "The work history's not-covered item 9 (delivery/work-history/m4-p24.md:194) names the tree scope but not this weakness."
      ],
      "concrete-fix": "Add `runPr` and `@tiphys/claude-code-plugin` to the token list at test/next.test.ts:799, and add a third dangerous state to witness/pr-commands-uninvoked-by-the-kernel.json that is a real call (an import of `runPr` plus an invocation) rather than a bare string, so the witness has a member that is the defect the criterion is about.",
      "analysis": "Tracked, not blocking under DR-0027: the defect lives in test/ and witness/ and makes no shipped artifact wrong. It matters because criterion 6 is DR-0036's retained merge authority expressed as a mechanism, and the mechanism cannot currently detect the violation."
    },
    {
      "id": "CR-006",
      "severity": "low",
      "evidence": [
        "src/commands/next.ts:118 asserts 'the stop condition can never go green: delivery/STATE.md:54 names exactly that state'. delivery/STATE.md:54 at this head reads '- **TWO MERGE BLOCKERS GATE EVERY M4 PHASE, AND BOTH ARE IN FLIGHT.**', which is about charter.yaml and check-dual-review.",
        "`grep -n 'branch --merged\\|cannot go green\\|can never go green' delivery/STATE.md` returns no hits at this head, and the same grep against the merge base 0eaf453's STATE.md also returns no hits, so the sentence is not merely at a different line, it is absent.",
        "The same citation appears in the work history at delivery/work-history/m4-p24.md:84, and it originates in the plan at delivery/plan/kernel-plan-m4.md:3245.",
        "This is the silent case CLAUDE.md:155 (rule 3b) names: the citation resolves, so no gate reddens, and it points at unrelated content."
      ],
      "concrete-fix": "In src/commands/next.ts:118 replace the `delivery/STATE.md:54` citation with one that resolves to the claim, for example the tuition entry or the plan's own criterion 3 text at delivery/plan/kernel-plan-m4.md:3238, or drop the citation and keep the sentence. Make the same correction at delivery/work-history/m4-p24.md:84, and raise the plan line as a separate correction rather than copying it forward again.",
      "analysis": "Low, and it does reach a shipped file: src/commands/next.ts is in the published kernel. A comment is not behaviour, which is why it is low, but this repository's recorded cost for carrying an unverified sentence into src/ is exactly why it is written down."
    },
    {
      "id": "CR-007",
      "severity": "low",
      "evidence": [
        "witness/pr-commands-uninvoked-by-the-kernel.json and witness/plugin-entry-point-exports-the-pull-request-capability.json each carry a `consumesExternalOutput` block whose `program` is 'git branch --merged, git merge-base --is-ancestor, git merge-tree --write-tree, git cherry' and whose `provenance` reads 'rule (f) binds these witnesses because src/commands/next.ts spawns git and parses its output'.",
        "Neither witness's test touches src/commands/next.ts's git path: test/next.test.ts:798 reads source files with readFileSync, and test/next.test.ts:821 compares exports. The declared justification is true of the delivered-elsewhere witnesses and false of these.",
        "The block is byte-identical across the witness files I read, which is what identifies it as boilerplate rather than a considered declaration."
      ],
      "concrete-fix": "Remove the `consumesExternalOutput` block from the witnesses whose tests consume no external program output (at minimum witness/pr-commands-uninvoked-by-the-kernel.json and witness/plugin-entry-point-exports-the-pull-request-capability.json), or replace its `provenance` with a sentence true of that witness, so the field records a decision rather than a paste.",
      "analysis": "Tracked, not blocking: witness metadata, no shipped artifact affected. Recorded because a justification field that is right by paste is indistinguishable from one that was never thought about, and the red-witness gate reads it."
    }
  ],
  "criteria": [
    {
      "id": "1",
      "quote": "`tiphys next` in a fleet home prints exactly one next action and exits 3 while any in-flight item exists. It exits 0 only when every in-flight category is empty. The exit code is distinct from 0 and from 1 so a caller can tell \"work remains\" from \"the command failed\".",
      "evidence": [
        "READ src/commands/next.ts:64 (`EXIT_WORK_REMAINS = 3`), :411 (`exitCodeFor` returns 3 when items + unknown > 0), :406 (exactly one `next action:` line is appended by renderReport).",
        "RAN the full suite at this head on node v26.6.0 with dist/ built via `npm test`: 1294 tests, 1294 pass, 0 fail, 0 skipped, exit 0. The three criterion-1 tests (test/next.test.ts:424, :454) are among them.",
        "RAN `tiphys next` myself in three freshly built fleet homes and read the exit codes directly.",
        "NOT MET because of CR-001, MEASURED: a fleet home holding a task directory whose meta.json is a truncated write printed `in flight: 0`, `unknown: 0` and exited 0. A task whose status could not be established is neither an in-flight item nor an unknown, so the command exited 0 while a category was not established to be empty. The module's own contract at src/commands/next.ts:29 says this case must hold the exit at 3."
      ],
      "met": false
    },
    {
      "id": "2",
      "quote": "It derives its working directory from the fleet home (`loadFleet(process.cwd())`, src/fleet.ts:82) and contains no absolute path literal. Asserted by a test that greps the new source for `/home/` and `/tmp/` and requires zero hits.",
      "evidence": [
        "RAN `grep -n '/home/\\|/tmp/' src/commands/next.ts | wc -l` at this head: 0.",
        "READ src/commands/next.ts:422, `fleet = loadFleet(process.cwd());`, and src/fleet.ts:83 where `loadFleet` is defined (the plan's :82 is the doc comment line immediately above it).",
        "READ the asserting test at test/next.test.ts:476, which greps the source for both prefixes and additionally requires the `loadFleet(process.cwd())` call to be present; it passed in my suite run.",
        "CONFIRMED the command relocates: the same binary reported on three different fleet homes under /tmp/claude-0/probe2, probe3 and probe-remote-only, each printing its own `fleet <root>` line."
      ],
      "met": true
    },
    {
      "id": "3",
      "quote": "The delivered-elsewhere predicate. A branch whose commits have landed on `main` under different shas is reported DELIVERED, not OPEN. RED WITNESS member A: a squash-merged branch ... Member B, structurally different: a branch whose commits landed inside ANOTHER branch's pull request ...",
      "evidence": [
        "READ src/commands/next.ts:151 `deliveredElsewhere` and its three arms, and src/teardown.ts:123 `landedness`, which supplies arms 1 and 2 rather than being re-implemented.",
        "READ the fixture builder at test/next.test.ts:180 to :202: member A is a real `git merge --squash` plus commit; member B is `git cherry-pick -x` into a third branch that is then merged `--no-ff`, followed by a further edit to the same file so that arm 2 conflicts and only the patch-id arm can answer. The two members exercise DIFFERENT arms of the predicate (arm 2 and arm 3), so they are structurally different rather than one defect twice.",
        "READ the premise check: the tests parse `git branch --merged main` out of witness/captures/next-delivered-elsewhere-git.txt and require the freshly built repository to reproduce it before asserting anything, so the 'the naive predicate says open' premise is measured rather than quoted.",
        "RAN the suite: both member tests (test/next.test.ts:322, :355) pass at this head among 1294/1294.",
        "READ the recorded reds at delivery/work-history/m4-p24.md:378 and :407, which show `kind: 'open'` against expected `how: 'squash'` and against expected `how: 'patch-equivalent'` respectively, i.e. each member reddens against a predicate missing a different arm.",
        "Caveat recorded as CR-004 rather than against this criterion: the predicate is correct, and the BASE it is pointed at is not always."
      ],
      "met": true
    },
    {
      "id": "4",
      "quote": "It prints what it CANNOT see as a named list: open pull requests, CI conclusions, and post-merge push runs. RED WITNESS: with the network unreachable, the cannot-see block is still printed and the exit code is unchanged.",
      "evidence": [
        "READ src/commands/next.ts:74, where CANNOT_SEE names all three items the criterion enumerates plus a fourth about work nobody has started, and :386 where the block is built from the constant with no probe of any kind.",
        "RAN `tiphys next` in three fleet homes and saw the four-entry block printed identically each time, including the probe2 and probe3 runs where the report was otherwise empty.",
        "READ test/next.test.ts:498: the reachable arm is a real bare clone on local disk and the test PROVES reachability with `git ls-remote` before comparing, then drives two structurally different unreachable states (a remote path that does not exist, and a TCP endpoint that refuses) and asserts both the block and the exit code are unchanged.",
        "READ witness/next-cannot-see-block-survives-unreachable-network.json: its two dangerous states are a block that returns early when `ls-remote` fails, and an exit code that becomes 1 when any project's `ls-remote` fails. Both are genuine degradation mutants rather than absent-feature mutants.",
        "MET as written. The list's incompleteness with respect to remote-only branches is CR-002, which is about a category the criterion does not enumerate."
      ],
      "met": true
    },
    {
      "id": "5",
      "quote": "The plugin's `pr open` and `pr merge` each exit nonzero with one line when the credential is absent, and the KERNEL process never receives that credential. Asserted by running the kernel's own credential-scrub probe from INSIDE the adapter's child environment rather than by building a second mechanism.",
      "evidence": [
        "READ plugin/src/pr.ts:224 to :228: the credential is resolved before any argv is built or any child spawned, and the refusal is one `singleLine` string with exit PR_EX_NO_CREDENTIAL (65).",
        "READ test/next.test.ts:651: the test spawns the real plugin/src/pr-main.ts for both subcommands with every credential name removed, asserts nonzero, asserts exactly one stderr line, asserts empty stdout, AND compares both streams and the exit code byte for byte against a recorded run in witness/captures/pr-refuses-without-credential.txt.",
        "READ test/next.test.ts:690: the boundary assertion is made from INSIDE a child launched by `claudeCodeAdapter.launch`, using scripts/credential-witness.mjs, across two arms (full inheritance and the kernel's own `buildChildEnv` output), and it checks both the names and the canary VALUE under any other name. The in-process read of process.env is explicitly the weaker second statement, which is the right ordering.",
        "READ the helper fix at test/next.test.ts:603: `withoutCredentials` was made async because the synchronous form restored the environment at the body's first suspension, so half the arms ran with the ambient credential back and passed anyway. The work history records that green as worthless, which is the correct reading.",
        "RAN the suite: both tests pass at this head.",
        "MET. CR-003 is a different defect on the same module (a missing target check, not a missing credential check) and does not bear on this criterion's words."
      ],
      "met": true
    },
    {
      "id": "6",
      "quote": "Neither `pr open` nor `pr merge` is invoked by any kernel code path in M4. Asserted by a test grepping `src/` and `bin/` for the plugin's command names and requiring zero hits.",
      "evidence": [
        "RAN the grep myself at this head: `grep -rn 'pr open\\|pr merge\\|plugin/src/pr' src/ bin/` returns zero hits.",
        "READ test/next.test.ts:798, which walks every .ts under src/ and bin/, asserts the walk found files (so an empty walk cannot pass silently), and requires zero token hits.",
        "READ src/cli.ts:35 to :40: the only addition to the dispatch table is `[\"next\", cmdNext]`; no pull-request command is registered.",
        "MET as written. CR-005 records that the chosen mechanism detects a literal string rather than an invocation, which is a weakness of the assertion the criterion prescribes, not a failure to perform it."
      ],
      "met": true
    }
  ],
  "deviations-judged": [
    {
      "deviation": "delivery/plan/cutover/retirement-inventory.json added to the phase declaration's filesToTouch at head, which the merge-base declaration and delivery/plan/m4-conflict-pre-pass.md wave 13 do not grant",
      "serves-plan-intent": true,
      "reasoning": "The scope gate printed the amendment by name at head 3e2312337cc2c6757ac97072b0aa0beb9d3132c0 for a reviewer to sign off, which is the procedure CLAUDE.md describes for an additive grant, and I am signing it off. The coupling is forced rather than chosen: adding src/commands/next.ts carrying the token 'stop condition' reddens M4-P23's retirement-inventory checker, which is T-033's predicted behaviour for anyone who next edits one of the three roots. I checked the collision risk: delivery/plan/m4-conflict-pre-pass.md:581 records wave 13 as M4-P24 ALONE, and delivery/plan/m4-conflict-pre-pass.md:64 assigns the file to M4-P23, which is already on main, so no concurrent phase holds it. I read the substance too: three rows move to PORTED with a destination, a probe, a verified-by that exits 0 and a sibling negative witness that exits 1, and six keep their absence claim with a widened block that argues each hit. I checked the checker's semantics at scripts/check-retirement-inventory.mjs:826, which compares the re-run EXIT CODE and not the recorded output string, so the `output: \"4\"` values are not a pinned count. Leaving the three stop-condition rows saying 'there is NO kernel stop condition' on main after shipping one would be the false-rule-carried-forward failure this repository re-verifies against."
    },
    {
      "deviation": "The plan's files-to-touch names packages/claude-code-plugin/ and the branch touches plugin/ instead",
      "serves-plan-intent": true,
      "reasoning": "The plan line itself says the exact paths are owned by workstream 1's declaration and cross-referenced rather than duplicated (delivery/plan/kernel-plan-m4.md:3203), and delivery/plan/m4-conflict-pre-pass.md:576 records the stale path in advance with the instruction to correct it once in this phase's declaration. The tree on main is plugin/, confirmed by plugin/package.json declaring `\"directory\": \"plugin\"`. Following the stale literal would have created a second package tree."
    },
    {
      "deviation": "The plan marks the phase prototype-blocked on M4-D-07 and the phase ran anyway",
      "serves-plan-intent": true,
      "reasoning": "I verified the discharge rather than taking the work history's word: `grep -n 'discharges: M4-D-07' delivery/plan/kernel-plan-m4.md` resolves to delivery/plan/kernel-plan-m4.md:1400, inside M4-P8's phase entry, and M4-P8's work history is on main. The block was on how a real agent payload authenticates under the credential scrub, which is the mechanism this phase's criterion-5 test reuses rather than re-invents."
    }
  ]
}
```
