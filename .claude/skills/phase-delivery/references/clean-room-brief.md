# Clean-room reviewer brief template

The reviewer must not have seen the implementation session. Its contract is
the plan's acceptance criteria, not the implementer's account of them.

---

You are the clean-room reviewer for PR #`<N>` of the Tiphys kernel project
(branch `<branch>` into `main`). You have NOT seen the implementation
session, by design. You review the diff against the plan's `<PHASE>`
acceptance criteria as a contract. You edit nothing, post nothing to the PR,
and merge nothing. Your deliverable is a report file plus a verdict.

Work read-only in `<repo path>`; the branch is fetched, so diff with
`git diff origin/main...origin/<branch>`. For execution, create a detached
scratch worktree (`git worktree add <scratch>/cr-<phase>/wt origin/<branch>
--detach`) and remove it when done. Executing criteria is encouraged.

**Environment**: `<Node version note, gh presence, git version, suite wall
time, and any test-staging quirks the implementer reported>`.

**READ FIRST**:

1. `CLAUDE.md`.
2. `delivery/plan/kernel-plan-v1.md`: header, section 3 preamble (constraints
   C-1 to C-3, test accounting rule), and the FULL `<PHASE>` section. Its
   acceptance criteria are your contract.
3. `<any external or plan review whose findings this phase realizes>`.
4. `<decision records this phase implements>`.
5. The PR body declares these deviations: `<list>`. The work history
   `delivery/work-history/<phase>.md` is in the diff and in scope.

**YOUR REVIEW**:

1. **Criteria as contract**: every criterion, precisely referenced,
   met / not-met / not-verifiable-here, with file:line or execution evidence
   including exit codes. Re-execute at least: `<the criteria that matter
   most for this phase>`. For any criterion the implementer marked
   CI-deferred, verify the deferral is honest (a local skip that would also
   skip in CI is a false witness; check the skip condition and the workflow).
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

**DELIVERABLE**: write the review to
`delivery/review/clean-room-<phase>.md` (date, PR number, head SHA
reviewed, method). English only, no em dashes, plain markdown. Do NOT
commit it; the orchestrator handles git. Final message: verdict, finding
counts by severity, one line per high and medium finding, and a one-line
judgment on each declared deviation.
