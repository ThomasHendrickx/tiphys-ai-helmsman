# The cutover-entry trigger, as executable steps

- date: 2026-09-16
- phase: M4-P27 (delivery/plan/kernel-plan-m4.md:3538)
- status: the steps are executable. Step 3 is an owner action and is OPEN.
- binding source: DR-0042. This document RESTATES that decision as steps and
  does not re-decide any part of it.

## What this document is, and what it is not

DR-0041 refused a kernel-only exit test and deferred the subject question to
cutover entry, on a WRITTEN trigger rather than on anyone remembering
(delivery/decisions/DR-0041-the-exit-test-stays-bound-to-the-pilot-and-the-kernel-is-not-its-subject.md:132).
DR-0042 superseded that trigger in BOTH clauses and gave the sequence that this
document turns into commands
(delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:60).

This is the trigger's PROCEDURE. It is not a decision record, it does not
re-argue either decision, and where this document and those records differ the
records win.

**The trigger is a HALT, not a green light.** Nothing here authorises entering
cutover. Steps 1 and 2 are computed and read-only; step 3 is an owner action
that no agent can perform or observe; step 4 runs only after step 3 has
happened.

## The dangerous state this whole procedure is built against

A trigger that reports READY when it is not. Three concrete shapes, all of them
measured failure modes in this repository rather than hypotheses:

1. **A check that greens because it could not reach the thing it checks.** A
   nonzero exit does NOT mean the condition is false, because a transport
   failure exits nonzero too (delivery/verification/m4-prototype-probes.md:153).
   So every check below answers with one of FOUR words, never two.
2. **A check that greens on an empty result.** A retirement report naming zero
   rows is not a report naming zero bad rows. A freshness comparison with
   nothing to compare against is a guard that cannot go red. A test suite that
   runs zero tests exits 0.
3. **A check that treats an owner step as done.** Step 3 has no computable
   form, so `scripts/check-cutover-entry.mjs` prints it as a HALT on every run
   and its output vocabulary contains no word meaning "ready". How far that is
   ESTABLISHED, as opposed to intended, is written out under step 3 below.

The four words, used identically by both scripts:

| verdict | meaning | exit |
|---|---|---|
| `satisfied` | the condition was checked and holds | 0 |
| `not-yet` | the condition was checked and does not hold | 1 |
| `unreachable` | it could not be checked, or the answer establishes nothing | 3 |
| `refused` | the check was answered with an authorization refusal | 3 |

`unreachable` and `refused` DOMINATE `not-yet`. "I could not tell" is not "the
answer is no" any more than it is "yes".

## Step 1: compute the preconditions

```
node scripts/check-cutover-entry.mjs
```

Exit 0 only when all four arms are `satisfied`. Every arm is evaluated on every
run: a checker that returns on its first failure is silent about the other
three. The witness is a fixture with all four arms forced false at once, and it
was demonstrated red against a deliberately short-circuiting copy of the script
(delivery/work-history/m4-p27.md:1).

| arm | condition | what makes it NOT satisfied |
|---|---|---|
| a `drain` | `tiphys cutover status` reports `DRAIN clean` | any other drain state is `not-yet`; NO `DRAIN` line at all is `unreachable` |
| b `exclusion` | the cross-environment exclusion behaviors resolve by name in `test/behaviors.json` AND their test files pass with a pass count above zero | a missing name, a missing file, a failing test or a ZERO-test suite is `not-yet`; an unparseable registry or an unreadable run is `unreachable` |
| c `retirement` | `tiphys cutover status --retirement` reports zero `unported` rows | any `unported` row is `not-yet`; ZERO ROWS ALTOGETHER is `unreachable` |
| d `pre-freeze-ruleset` | `delivery/plan/cutover/pre-freeze-ruleset.json` is present and not older than the newest retirement inventory file | absent or stale is `not-yet`; NO INVENTORY to compare against is `unreachable` |

Arm b's required behavior names are a **contract this phase declares, not a
fact it observed.** M4-P21 and M4-P22 had not landed when this was written and
the plan does not name their behavior ids, so the list in
scripts/check-cutover-entry.mjs:98 is derived from their acceptance criteria.
It is a MINIMUM asserted BY NAME and never a count, so a phase appending more
rows does not redden it. If those phases land with different ids the arm reports
`not-yet`, which is the fail-closed direction, and the list is reconciled in one
edit. Stated here so it is found rather than discovered.

Arm a's and arm c's expected output shapes come from M4-P25 criteria 1 and 6
(delivery/plan/kernel-plan-m4.md:3289). If the delivered command prints a
different shape the arms report `unreachable`, never `satisfied`.

**Measured state of step 1 on 2026-09-16**, at the head this document lands on:
all four arms `not-yet`, exit 1. The cutover command is not delivered, the
exclusion behaviors are not registered, and the pre-freeze ruleset is absent.
That is the expected reading before M4-P21 to M4-P25 land, and it is recorded so
a later reader can tell a working checker from one that has never been run.

## Step 2: re-probe the pilot, read-only

```
node scripts/probe-pilot-readonly.mjs
```

Writes `delivery/verification/pulse-re-probe.md` and exits 0 only when every
target was read.

This is the first ACT after the preconditions because everything downstream
rests on facts the intake itself calls stale: the pilot's state is sourced from
delivery/verification/dr-0034-premise-check.md:25, whose clones were two days
old when written and are a month older now.

**Reading is permitted and writing is not, and the boundary is structural.**
DR-0042 settled that reading the public pilot is inside "stay away" only in the
direction that matters: reading is not writing. DR-0037 stands, so no ref
update, no branch, no pull request, no fleet state and no lease. The script
cannot perform any of those: every child process goes through one allowlist that
admits only `ls-remote` and a `clone` carrying `--depth 1`, and every request
goes through one function that hardcodes the GET method and refuses any
request-shaping option. Both refusals are witnessed against a real pending
commit and a request-counting server in test/cutover-entry.test.ts:1.

**The probe reads THREE sources per target and keeps all three verdicts**, and
that is not decoration. Measured against the real pilot on 2026-09-16: the REST
API answered HTTP 403 on twelve of twelve attempts while a control endpoint
answered 200 on six of six, and `git ls-remote` over the git protocol answered
the head sha with exit 0. A probe that returned on its first non-satisfied
source would report `refused` and discard the transport that worked.

**What that measurement establishes and what it does not.** The pilot's head has
MOVED since the month-old record: `d4e491b` over the git protocol, against the
`1204775` at delivery/verification/dr-0034-premise-check.md:25. Not established:
why one single probe run during the same session read the REST path successfully
when every attempt before and after it was refused. That run is recorded as
UNEXPLAINED rather than averaged away, and the consequence is the operational
one: **probe REST reachability at the start of any session that depends on it,
in both directions**, exactly as `CLAUDE.md` standing warning 6 already says for a
different pair of signals. That warning is QUOTED rather than cited by line,
deliberately: `CLAUDE.md` is edited most days in this repository and M4-P23
rewrites it, so a line citation into it would resolve silently against the
wrong text after the next merge.

## Step 3: ask the owner to reboot the pilot session

**STOP. This is an owner action and no part of it is simulated.**

`scripts/check-cutover-entry.mjs` prints this step as `HALT, OWNER ACTION` on
every run, including the run where all four computed arms are satisfied.

**How far that is established, stated precisely rather than as an absolute.**
The step-3 text is a CONSTANT, not a computed value: it lives in the
`STEP_LINES` array at scripts/check-cutover-entry.mjs:504, and the machine
output's owner-action status is the literal string `blocked` at
scripts/check-cutover-entry.mjs:590. Neither reads any argument the script
accepts. That is an INSPECTION of the source plus one witness on the maximal
input (the all-satisfied fixture), not an exhaustive search over inputs. A
reviewer who finds an input that changes either line has found a defect.

Before asking:

1. **Verify the reboot has not already happened.** Asking for work that already
   exists costs the owner the attention DR-0016 exists to protect. Step 2's
   evidence document is the check available: a pilot whose head has moved since
   the last re-probe is evidence that someone has been running it. It is NOT
   proof that the session step 3 asks about was rebooted, and this procedure
   offers no way to establish that from this side.
2. **Request an `A-n` id from delivery/STATE.md**, which is the sole allocator
   for owner actions (the `A-n` entry under `CLAUDE.md`'s identifier schemes).
   This document does not pick a number, and
   a retired id is never reused in any scheme.
3. **Surface it as an owner action and nothing else.** One line: what is
   blocked, and by what.

## Step 4: run the exit test as written, on the pilot

Run the exit test as it stands. Do not amend it. This orchestrator then VERIFIES
THE PUSHED EVIDENCE READ-ONLY from this side rather than accepting a report,
which is now possible because DR-0042 permits reading. A milestone exit test is
a hard gate, and a claim with no verifiable artifact behind it is treated as
unknown (`CLAUDE.md`, "Evidence beats assertion everywhere").

The second conjunct, "the old process is retired", is this repository's own and
is discharged by M4-P23 through M4-P26. **It is not blocked on step 3** and must
not be reported as blocked on it.

## The amendment option is in RESERVE and its bar is RAISED

DR-0041 kept an amendment to the exit test as an option. DR-0042 did not remove
it and did not soften it: it stays in reserve and its bar goes UP, because the
option existed only for the case where the exit test was undischargeable, and
it is dischargeable
(delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:69).

Amending it now would be trading assurance for convenience. That reasoning is
the decision's and is cited rather than restated, so a later reader acts on the
record and not on a paraphrase of it that has drifted.

**What would have to be true to reach for the reserve:** step 3 refused or
unanswerable, not step 3 merely slow, and the case made against the record's own
argument rather than around it.

## What this trigger does NOT settle

**Whether the pilot returns as a SUBJECT for the non-cutover workstreams, or
only for the exit test.** DR-0042 assumes the NARROWER reading, explicitly,
because the owner's words were "to do the checks"
(delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:93).
This procedure inherits that reading and does not widen it. If the wider reading
is ever taken, DR-0037's contention argument returns and cross-environment
exclusion becomes the pilot's precondition rather than one arm of a
precondition check.

Four more limits, stated so nothing here is reported as covered when it is not:

1. **Step 1's arms a and c have never been run against a real
   `tiphys cutover status`**, because the command does not exist yet. They have
   been run against stub CLIs that print the shapes M4-P25 specifies. If the
   delivered shapes differ, the arms fail closed to `unreachable`, which is the
   safe direction and is not the same as being verified.
2. **Step 2 has been run against the real pilot; step 4 has not been run at
   all.** Nothing in this document is evidence about the exit test's outcome.
3. **This procedure does not check branch cleanup, and that is deliberate.**
   M4-D-15 makes drain a predicate over in-flight work only, because remote ref
   deletion is refused in this container and a delete dry-run exits 0 either way
   (`CLAUDE.md` standing warning 14). Branch cleanup is a separate owner action
   that does not gate cutover.
4. **The entry check runs a nested `node --test` in arm b, and that arm has one
   environment dependency worth knowing about.** A child that inherits
   `NODE_TEST_CONTEXT` from an outer test runner does not run its files at all
   and exits 0 with no counts. The check drops that variable and pins the TAP
   reporter (scripts/check-cutover-entry.mjs:240), and it fail-closes to
   `unreachable` when counts are missing, so the failure is visible rather than
   silent. Both halves are needed: the fix makes the arm usable and the
   backstop makes a new variant of the same problem loud.
