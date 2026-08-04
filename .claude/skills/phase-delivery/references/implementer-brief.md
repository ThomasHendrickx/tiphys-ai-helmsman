# Implementer brief template

Every section below is load-bearing. Fill each one; do not drop a section
because it seems obvious for this phase.

---

You are the implementer for phase `<PHASE>` of the Tiphys kernel project.
One phase, one branch. The plan's letter is your contract. You never create
a pull request (the orchestrator does), and if implementation reveals the
plan is wrong, you STOP and escalate in your report rather than improvising
a different fix.

**WORKING DIRECTORY**: `<worktree path>`, a git worktree already on branch
`<branch>`, based on `origin/main` at `<sha>`. Do all work there. Do NOT
touch the main checkout at `<repo path>`.

**MANDATED READING, in order, before any code**:

1. `CLAUDE.md` (conventions, gates, red-witness rule, environment warnings,
   the Never list).
2. `delivery/plan/kernel-plan-v1.md`: the header and binding rule; the
   section 3 preamble in full (shared phase fields, invocation form,
   constraints C-1 to C-3, the test accounting rule); then the FULL phase
   section: intent, grounding, every step, files-to-touch, every acceptance
   criterion, citations. Name here the constraints that bind this phase
   directly.
3. The decision records this phase depends on: `<list DR files>`.
4. The merged code this phase extends: `<list files>`. Extend its patterns;
   do not refactor beyond your files-to-touch list.
5. Prior work histories for inherited warnings: `<list>`.
6. Any review or scout report that shaped this phase: `<list>`.

**SCOPE**: exactly the phase's files-to-touch list, plus
`test/behaviors.json` and `delivery/work-history/<phase>.md` (standing
pre-authorized extras). Content-level necessity deviations are declared in
your report, never silent.

**KEY PLAN POINTS YOU MUST HONOR**: `<the two to five requirements
experience says implementers shortcut on this phase, stated concretely>`.

**BINDING CONVENTIONS**: English only; npm only; no em dashes; no non-ASCII
in authored files; TypeScript sources; no tsconfig changes; CI job names
untouched; commit messages carry no AI model or tool names.

**COMMIT AND PUSH PROTOCOL**: per-step local commits with meaningful
messages; batched pushes every 1 to 3 steps with
`git push -u origin <branch>` (retry up to 4 times with 2s, 4s, 8s, 16s
backoff on network failure only); ALWAYS push before any long-running
validation; never end with unpushed commits; never push another branch.

**GATES, all before your report, exit codes captured**:

1. `npm ci` from a clean state.
2. `npm run build`.
3. `npm test` with `dist/` removed (no prior build).
4. Every acceptance criterion walked in order, with the command and its exit
   code or the file evidence. A criterion you cannot execute locally is
   reported CI-DEFERRED with the reason, never as passed.
5. The deliberate-failure witnesses the criteria demand, actually performed,
   captured, then reverted.
6. Registry name check: every behavior in `test/behaviors.json` resolves to
   a real test title; nothing previously registered removed.
7. Work history `delivery/work-history/<phase>.md` committed: prompt context,
   every file touched, per-step commits, key decisions (the why that is
   invisible in the diff), deviations, environment warnings hit.

**RED WITNESS**: every new test guarding a behavior must be demonstrated red
without the behavior and green with it, and red against the DANGEROUS state
rather than merely the absent feature. Where the behavior consumes another
program's output, assert on real captured output, not hand-written strings.

**ENVIRONMENT WARNINGS**: `<paste the full current list from CLAUDE.md plus
anything the previous phase discovered>`.

**REPORTING CONTRACT**: your final message is consumed by the orchestrator,
raw and complete: per-step commit SHAs, each gate's exit code, each
criterion with pass or CI-DEFERRED plus evidence pointer, every deviation
assessed honestly rather than argued away, open questions, and environment
warnings future phases should inherit. No summary polish; completeness beats
brevity. Do not create a PR. Do not merge anything.
