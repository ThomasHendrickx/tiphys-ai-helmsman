# The M4 exit test on pulse

- date opened: 2026-09-23
- phase: M5-P1 (delivery/plan/value-delivery-plan.yaml:27)
- status: **NOT DISCHARGED. Waiting on owner action A-14, the pilot reboot.**
- procedure followed: delivery/plan/cutover/entry-trigger.md:1, which restates
  DR-0042 as steps. Where this document and the decision records differ, the
  records win.

## The test being run

The exit test at delivery/plan/kernel-plan-v1.md:368 reads: "the pilot
project's next phase runs through v1, merged and deploy-verified entirely on
v1; the old process is retired". DR-0041 keeps it bound to the pilot and
refuses a kernel-only subject
(delivery/decisions/DR-0041-the-exit-test-stays-bound-to-the-pilot-and-the-kernel-is-not-its-subject.md:1).
DR-0042 permits reading the pilot and makes its reachability an owner reboot
(delivery/decisions/DR-0042-reading-the-pilot-is-allowed-and-the-pilot-can-be-rebooted.md:60).
DR-0037 stands: this orchestrator reads the pilot and never writes to it.

This document has two parts. The first records what is known up to the
reboot, from commands run on 2026-09-23. The second is PENDING and holds
nothing that was not observed.

## Part 1: known up to the reboot

### Step 1, the trigger: all four arms satisfied, exit 0

Run on node v26.6.0, from the M5-P1 worktree at a full-history clone
(`git rev-parse --is-shallow-repository` printed `false`), against a local
copy of the kernel's fleet home:

```
$ node scripts/check-cutover-entry.mjs --fleet <copy of the kernel fleet home>
ARM a drain satisfied -- cutover status reports DRAIN clean
ARM b exclusion satisfied -- all 6 required behavior name(s) resolve and 2 exclusion test file(s) pass with a nonzero pass count
ARM c retirement satisfied -- all 199 retirement row(s) are ported
ARM d pre-freeze-ruleset satisfied -- delivery/plan/cutover/pre-freeze-ruleset.json is present and is newer than delivery/plan/cutover/retirement-inventory.json by commit order (1789726959 against 1789717584)
STEP 1 preconditions: preconditions-satisfied-owner-action-pending
STEP 3 owner reboot of the pilot session: HALT, OWNER ACTION.
exit 0
```

(STEP 2 and STEP 4 lines omitted here; the full capture is in the work
history, delivery/work-history/m5-p1.md:107.)

**Which fleet this is, exactly.** The kernel's fleet home is the remote
`ThomasHendrickx/tiphys-ai-helmsman-fleet`. The copy was made from the
orchestrator's clone without network, and its `main` is `2058490`, which is
also the remote's `main` by `git ls-remote` on the same day. A clone lacks the
three gitignored directories, so the kernel's own command rebuilt them:
`tiphys init` refused the clone and named `tiphys resume` as the remedy, and
`tiphys resume` printed `REBUILT state/`, `REBUILT worktrees/`,
`REBUILT projects/`, exit 0. Nothing was created by hand. The full commands
are in the work history.

**What that makes arm a worth.** Drain counts live worktrees and open tasks
(src/cutover.ts:518). `worktrees/` is ephemeral, so on a rehydrated clone its
half of drain is empty by construction; only the `tasks/` half reads
committed state, and it holds no task. A live worktree on another machine
running this fleet would not be visible here. This is the kernel's own resume
model ("rebuilt, not restored"), and it is still weaker than reading a live
fleet home. No clone checked in this container holds `state/` or
`worktrees/`, so no live fleet home was found to read instead.

**Criterion p1-trigger is met** as worded: the checker exited 0 with all four
arms `satisfied`, against the kernel fleet home and not a scratch
`tiphys init` fleet.

### Step 2, the pilot re-probe: satisfied, exit 0 (third run)

The first two runs, at 06:57Z and 08:02:05Z, exited 3 with `OVERALL refused`.
The third run, at 08:02:55Z, exited 0:

```
$ NODE_USE_ENV_PROXY=1 node scripts/probe-pilot-readonly.mjs --out delivery/verification/pulse-re-probe-m5.md --force
TARGET ThomasHendrickx/pulse satisfied -- record, newest commit and HEAD ref all read, and the two heads agree
TARGET ThomasHendrickx/pulse-fleet satisfied -- record, newest commit and HEAD ref all read, and the two heads agree
OVERALL satisfied
exit 0
```

Two things changed between the refused runs and the satisfied one.

1. The orchestrator attached `pulse` and `pulse-fleet` to the session.
2. `NODE_USE_ENV_PROXY=1` made Node's `fetch` go through the container's
   proxy. Without it, the probe went straight to GitHub with no credentials
   and got `403 API rate limit exceeded`, for the kernel repository too.

`--force` was needed because the output path already held run 1's record.
That record is in git at 618544b. The first version of this document said
the refusal was the missing attach. That was based on `curl`, which takes the
proxy path, and it was not shown for the probe's own requests. The
correction, with the measurement, is at
delivery/verification/pulse-re-probe-m5.md:47.

**Criterion p1-probe is met by run 3.** The command is the criterion's, with
`--force` and one environment variable, both stated above. The record names
both targets, their heads, the three transports and the excluded writes.

| target | head, 2026-09-16 | head, 2026-09-23 | last commit date |
|---|---|---|---|
| `pulse` `main` | `d4e491b` | `d4e491b` | 2026-08-29 |
| `pulse-fleet` `main` | `7656f67` | `7656f67` | 2026-08-29 |

### Step 3, the owner reboot: not observed, and opened as A-14

**Has the reboot already happened?** Checked before asking, as the procedure
requires (delivery/plan/cutover/entry-trigger.md:186):

- DR-0042 records that the owner CAN reboot the pilot. It does not record a
  reboot.
- delivery/STATE.md records no reboot; its only mention is DR-0042's summary
  row.
- Neither pilot head has moved since 2026-09-16, and both last commits are
  dated 2026-08-29.

So no reboot has produced pushed work. That does not prove no reboot
happened: a session restarted without pushing anything leaves no trace this
side can read, which the procedure itself says. The owner action is opened
as **A-14** in the owner-action register of delivery/STATE.md. Ids A-11 to
A-13 are skipped: they appear in the repository's history as row labels in a
fixture table (delivery/work-history/m3-p4.md:3599), not as owner actions,
and skipping them keeps `git log -S` for the new id free of false hits.

**What this phase did not do, stated for criterion p1-boundary.** It did not
reboot, start, message or write to the pilot. Every pilot read was
`git ls-remote`, a `clone --depth 1` into the session scratchpad, or a GET.
The owner has NOT yet performed the reboot, so p1-boundary's second half
("the report states that the owner performed the reboot action") cannot be
stated truthfully yet and is PENDING.

### The second conjunct, "the old process is retired"

The procedure assigns it to M4-P23 through M4-P26 and says it is not blocked
on the reboot (delivery/plan/cutover/entry-trigger.md:207). Arm c above reads
199 retirement rows, all `ported`. This phase did not re-verify the
retirement beyond that arm.

### Open questions for the orchestrator

1. **Which kernel is "v1" for the pilot's next phase?** The only published
   kernel is `@tiphys/kernel` 0.1.0, published 2026-08-15
   (`npm view @tiphys/kernel versions time`, exit 0, versions `0.0.0` and
   `0.1.0`). The repository's tag `v0.1.0` is commit `7c0b1e7`, dated
   2026-08-15, and every M4 phase merged after it (delivery/STATE.md:2640
   records M4 closing on 2026-09-19). `pulse-fleet` pins exactly 0.1.0, and so
   does the kernel's own fleet home. So a pilot phase run on the published
   package would run none of the code M4 merged. Whether the published 0.1.0
   byte-matches tag `v0.1.0` was not checked here.
   Whether the exit test needs a new release first is a plan question, and it
   should be settled before A-14 is put to the owner, so the owner is asked
   once. **Update 2026-09-23:** the orchestrator reports that A-14 waits on
   kernel 0.2.0, which it is publishing. At 08:03:36Z,
   `npm view @tiphys/kernel versions --json` still returned
   `["0.0.0","0.1.0"]`, so 0.2.0 was not yet visible from here.
2. **Read-only REST access to the pilot: ANSWERED 2026-09-23.** The
   orchestrator attached `pulse` and `pulse-fleet` with push access, and REST
   reads of both now answer 200. So step 4 can read check runs and
   deployments. Those push credentials are held, but DR-0037 still forbids
   any write to the pilot, and nothing in this phase uses them to write. Any
   Node caller must set `NODE_USE_ENV_PROXY=1`, or it bypasses the proxy and
   gets a rate-limit 403.
3. **The fleet remote's default branch is `probe-lease-a`, not `main`**
   (`git ls-remote --symref`, exit 0). This is the known A-10 residue and
   needs nothing new; it is noted because a fresh clone of the fleet home
   lands on a probe commit unless `main` is checked out.

## Part 2: PENDING, the pulse phase

**Nothing in this part has been observed. Every field reads PENDING until
the orchestrator fills it from a read-only observation, with the command and
its exit code or API result.**

| field | value | evidence |
|---|---|---|
| owner performed the reboot (A-14) | PENDING | |
| pulse phase id | PENDING | |
| reviewed head | PENDING | |
| merged pull request | PENDING | |
| post-merge `push` run on the new pulse `main` head | PENDING | |
| deploy verification | PENDING | |
| M4 exit verdict | PENDING | |
| remaining residue | PENDING | |

How each field will be verified, read-only, so the rule is written before the
result is known:

- **Reboot happened:** the owner says so, and the pilot shows new pushed work
  after 2026-09-23: `git ls-remote` on `pulse` or `pulse-fleet` returns a
  `main` other than `d4e491b` or `7656f67`.
- **The phase ran on v1:** the pilot's own pushed evidence names the kernel
  version it ran, which must match the answer to open question 1.
- **Reviewed head and merge:** the reviewed head named in the pilot's review
  evidence equals the head the merge commit brought in.
- **Post-merge push run:** the run on the new pilot `main` head, observed to
  completion, per T-009 (delivery/tuition/T-009-green-on-the-wrong-event.md:1).
  A cancelled run is neither green nor red.
- **Deploy verification:** the pilot's own deploy-verification evidence for
  the merged sha, read from its pushed files.

A green kernel gate is not evidence for any row here. The hazard the plan
names for this is green-without-delivery
(delivery/plan/value-delivery-plan.yaml:89).
