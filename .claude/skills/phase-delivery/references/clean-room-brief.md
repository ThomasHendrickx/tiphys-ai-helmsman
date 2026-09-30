# Clean-room reviewer brief template

The reviewer must not have seen the implementation session. Its contract is
the plan phase's hazard classes and its `not-testable` criteria, not the
implementer's account of them. Every other acceptance criterion is proven by
the test its `check` names (DR-0064).

**THE DELIVERABLE IS A VERDICT JSON, ONE PER REVIEW, AND EVERY REVIEW IS A
HAZARD REVIEW** (DR-0064 dropped the criteria contract). Dispatch the reviews
the diff's DR-0063 tier owes: TWO for a `pair` change (one touching the
`runtime-set` declared in `charter.yaml`), on DIFFERENT model families, and ONE
for a `single` change. Compose each brief with `tiphys brief compose --role
clean-room-reviewer --phase <plan file> --phase-id <id>` (hazard is the only
contract and the default) and paste it above this template; this template only
fills in the placeholders. Without the committed, approving verdicts its tier
owes for the reviewed head, `merge-preconditions` is RED.

---

You are the clean-room reviewer for PR #`<N>` of the Tiphys kernel project
(branch `<branch>` into `main`). You have NOT seen the implementation
session, by design. You review the diff against the plan's `<PHASE>` hazard
classes and its `not-testable` criteria. You edit nothing, post nothing to the
PR, and merge nothing. Your deliverable is ONE hazard verdict JSON document
about head `<40-hex sha>` exactly.

Work read-only in `<repo path>`; the branch is fetched, so diff with
`git diff origin/main...origin/<branch>`. For execution, create a detached
scratch worktree (`git worktree add <scratch>/cr-<phase>/wt origin/<branch>
--detach`) and remove it when done. Executing criteria is encouraged.

**Environment**: `<Node version note, gh presence, git version, suite wall
time, and any test-staging quirks the implementer reported>`.

**READ FIRST**:

1. `CLAUDE.md`.
2. `<plan file>`: the FULL `<PHASE>` section, its hazard classes and each
   criterion's `check`. Constraints C-1 to C-3 are in the section 3 preamble
   of `delivery/plan/kernel-plan-v1.md`.
3. `<any external or plan review whose findings this phase realizes>`.
4. `<decision records this phase implements>`.
5. The PR body declares these deviations: `<list>`. The work history
   `delivery/work-history/<phase>.md` is in the diff and in scope.

**YOUR REVIEW**:

1. **Criteria are tests**: for each criterion, confirm its `check` names a
   test or command that exists and would fail without the behavior; judge
   each `not-testable` criterion directly and record a failed one as a
   finding. Re-execute at least: `<the checks that matter most for this
   phase>`. For any criterion the implementer marked CI-deferred, verify the
   deferral is honest (a local skip that would also skip in CI is a false
   witness; check the skip condition and the workflow).
2. **Test honesty**: mutation-test. Break the behavior, confirm the named
   test goes red, restore. Check `test/behaviors.json` mappings resolve to
   real test titles by name. Ask of each test: would this fail if the fix
   were reverted, and does it assert behavior rather than implementation
   detail?
3. **Deviations one by one**: necessity or convenience? Does each serve the
   plan's intent? Does any of them need to ripple somewhere the implementer
   missed?
4. **Scope audit**: every changed file on the phase list, or one of the two
   standing pre-authorized extras. Anything else is a finding.
5. **Blast radius**: who else consumes what this changed? Name the specific
   downstream consumers for this phase (`<list them>`) and check each.
   This is the single highest-yield question in the whole review.
6. **Fix shapes**: hunt the state that can never exit and the quiet
   regression. Destructive operations get the hardest look: can any path
   lose committed work, and is the destructive authority explicit rather
   than inherited from a component that does not exist yet?
7. **Constraints and conventions**: C-1 (no current state from a log tail),
   C-2 (no pid, signal, process liveness for identity or exclusion), C-3
   (no auto-backgrounding); ASCII-clean authored files, English, npm only,
   exit-code contract consistency, no AI names in commit messages.

**VERDICT**: APPROVE or FIX-ROUND-NEEDED, findings `CR-nnn` severity-ranked
(high: building on it risks the phase or milestone; medium: risks rework
inside the phase or a broken gate; low: cosmetic or documentation), each
with severity, the claim, why it is wrong or dangerous, evidence, and a
concrete fix. Include a probes-run section listing what you checked,
including probes that came back empty-handed, so absence of findings is
distinguishable from absence of checking. Include an honest-failure section.

**DELIVERABLE**: write ONE verdict document, valid against
`schemas/verdict.schema.json`, at
`<scratch>/cr-<phase>/wt/delivery/review/<phase-id>-hazard.json` (the second
review of a pair: `<phase-id>-hazard-2.json`), inside your detached scratch
worktree, so it is never in the tree under review. `<phase-id>` is the phase
id in lower case. Create it in your first minutes and
rewrite it as you work: its mtime is your beacon. Its fields:

- `kind: verdict`, `phase: <PHASE>`, `head: <40-hex sha>`, the EXACT commit you
  reviewed and nothing else.
- `verdict`: `APPROVE` or `FIX-ROUND-NEEDED`. Any finding of severity medium or
  higher forces `FIX-ROUND-NEEDED`; the schema refuses the other combination.
- `produced-by`: your model family, `framing`: your entry point, and
  `review-contract`: `hazard`. The two reviews of a pair must differ on
  `produced-by`; `framing` and `review-contract` are no longer compared
  (M6-P2).
- `findings`: `CR-nnn` findings as `schemas/finding.schema.json` defines them,
  each with the claim, why it is wrong or dangerous, evidence, and a concrete
  fix.
- `deviations-judged`: one entry per declared deviation.
- `hazard-classes-addressed`: one entry per declared hazard class, with what
  you probed and why it is cleared.

Before you finish, run `node bin/tiphys.ts validate --type verdict <path>` and
confirm it prints no `INVALID` line (lines reading `SKIPPED ... no context` are
expected without `--context`). English only, no em dashes, ASCII only. Do NOT
commit it; the orchestrator commits the verdicts on the phase branch. A
markdown narrative at `delivery/review/clean-room-<phase>-hazard.md` is
optional and is NOT the evidence the merge gate reads. Final message: the
verdict path, the verdict word, finding counts by severity, one line per high
and medium finding, and a one-line judgment on each declared deviation.
