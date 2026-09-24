# The M4 exit test on pulse

- date opened: 2026-09-23
- phase: M5-P1 (delivery/plan/value-delivery-plan.yaml:27)
- status: **NOT DISCHARGED.** A-14 is done (2026-09-24): the pilot ran pulse
  M3-P4 on kernel 0.2.0 and merged it as pulse PR #22. Three rows of Part 2
  fail the rules written for them in advance: the merged head was not the
  reviewed head, pulse has no post-merge push run, and pulse has no deploy
  verification. The next call is the orchestrator's.
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
reboot, from commands run on 2026-09-23. The second was filled on
2026-09-24, after the reboot, and holds only what was observed.

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
history, delivery/work-history/m5-p1.md:108.)

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

**Update 2026-09-24.** The owner has now performed the reboot. The evidence
is the first row of Part 2: pulse `main` moved to `b7036d7`. This phase still
did not start, message or write to the pilot.

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
   2026-08-15, and every M4 phase merged after it (M4 closed on 2026-09-19;
   delivery/STATE.md:550 records the closure at `main` `de1664d`). `pulse-fleet` pins exactly 0.1.0, and so
   does the kernel's own fleet home. So a pilot phase run on the published
   package would run none of the code M4 merged. Whether the published 0.1.0
   byte-matches tag `v0.1.0` was not checked here.
   Whether the exit test needs a new release first is a plan question, and it
   should be settled before A-14 is put to the owner, so the owner is asked
   once. **Update 2026-09-23:** the orchestrator reports that A-14 waits on
   kernel 0.2.0, which it is publishing. At 08:03:36Z,
   `npm view @tiphys/kernel versions --json` still returned
   `["0.0.0","0.1.0"]`, so 0.2.0 was not yet visible from here.
   **Update 2026-09-24:** 0.2.0 was published at 2026-09-23T09:01:47Z from
   `cb5de0d`, which contains the M4 closure head. The pilot ran on it. Rule 2
   in Part 2 records this.
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

## Part 2: the pulse phase, observed 2026-09-24

Filled by M5-P1 on 2026-09-24, read-only, after the orchestrator relayed the
owner's report that A-14 was done. The owner's word was the trigger; every row
below is from a command or an API call, named with it. Nothing was pushed to
`pulse` or `pulse-fleet`, and no pilot ref or file was changed (DR-0037).

Sources: full clones of both pilot repositories into the session scratchpad
(plain `git clone`, then reads), and REST GETs against
`https://api.github.com/repos/ThomasHendrickx/pulse` made from Node with
`NODE_USE_ENV_PROXY=1`. Every GET below answered HTTP 200. Paths in backticks
below are PULSE paths at pulse `main` `b7036d7`, not paths in this repository,
so they are quoted and do not resolve here.

| field | value | evidence |
|---|---|---|
| owner performed the reboot (A-14) | **yes, for `pulse`**; `pulse-fleet` shows no pushed change | pulse `main` is `b7036d7`, no longer `d4e491b` (`git ls-remote`, exit 0). `pulse-fleet` `main` is still `7656f67` |
| kernel the phase ran on | `@tiphys/kernel` **0.2.0** | pulse `package.json` line 31 at `b7036d7` pins `"0.2.0"` (it was `0.1.0` at `d4e491b`); `charter.yaml` line 9 reads `kernel-version-pin: 0.2.0`; the lock's integrity equals `npm view @tiphys/kernel@0.2.0 dist.integrity` |
| pulse phase id | **pulse M3-P4**, "the import flow is usable at phone width" | `delivery/work-history/m3-p4.yaml` at `b7036d7`, `phase: M3-P4` |
| reviewed head | **`dd6adff`**, round 2. Not the merged head | four verdicts under `delivery/review/m3-p4-*.yaml`, table below |
| merged pull request | **pulse #22**, head `ec51961`, merge `b7036d7` | `GET /pulls/22`: merged true, merged_at 2026-09-23T22:18:50Z, merge_commit_sha `b7036d7cdb482237643196d65bcd7f83f5344df1`, base `main`, merged_by `ThomasHendrickx` |
| post-merge `push` run on the new pulse `main` head | **none exists** | `GET /actions/workflows`: zero workflows; the clone has no `.github` directory; `GET /actions/runs?head_sha=b7036d7...`: total_count 0; `GET /commits/b7036d7.../check-runs`: total_count 0 |
| deploy verification | **not observed** in the charter's sense. Observed instead: a Vercel production deploy of `b7036d7`, status `success` | `charter.yaml` `release-verification: mode: reserved`; `GET /commits/b7036d7.../status`: combined `success`, one context `Vercel`, 2026-09-23T22:20:06Z; `GET /deployments`: id 6625673861, sha `b7036d7`, environment `Production`, creator `vercel[bot]` |
| M4 exit verdict | **NOT DISCHARGED** by the rules written below before the result was known. Three rows fail them | see "The rules, checked" |
| remaining residue | listed below | |

### The verdicts on pulse M3-P4

Read with `grep -H -E '^(head|produced-by|framing):' delivery/review/m3-p4-*.yaml`
in the pulse clone, and the verdict line of each file:

| pulse file | head | produced-by | framing | verdict |
|---|---|---|---|---|
| `m3-p4-criteria.yaml` | `be990d3` | claude | criteria-contract | FIX-ROUND-NEEDED |
| `m3-p4-hazard.yaml` | `be990d3` | claude | regression-and-leak-paths | FIX-ROUND-NEEDED |
| `m3-p4-criteria-round2.yaml` | `dd6adff` | claude | criteria-contract | APPROVE, two lows |
| `m3-p4-hazard-round2.yaml` | `dd6adff` | claude | regression-and-leak-paths | FIX-ROUND-NEEDED, one medium (HZ-M3P4-R2-01) and three lows |

After `dd6adff` the branch took two more commits, `5a48bc8` ("carry what the
second review round left open") and `ec51961` ("record the green gates"). Its
message says the pilot's two-round rule allows no third review, so the round-2
findings were "done here as work". `git diff --stat dd6adff ec51961`: 7 files,
944 insertions, 30 deletions. The code-bearing part is `src/app/globals.css`
(17 lines), `messages/fr.json` (4), `test/e2e/mobile-import.spec.ts` (7) and
`test/e2e/pressed-and-disabled.spec.ts` (5); the rest is the two round-2
verdict files and the work history. No verdict names `5a48bc8` or `ec51961`.

Both review contracts ran on one model family, `claude`. That is the pilot's
declared arrangement, not a defect found here: pulse DR-0032
(`delivery/decisions/DR-0032.yaml`) keeps DR-0003, the single-family
environment, discharged by the pilot's orchestrator by hand.

The last recorded gate runs in the pilot's work history are at `5a48bc8`:
fast suite 758 discovered, 758 passed; Playwright, all four projects, 129
discovered, 128 passed, 0 failed, 1 skipped. None names `ec51961` or
`b7036d7`. These are the pilot's own recorded results; they were not re-run
here.

### The rules, as written on 2026-09-23 before the result

Kept verbatim from the PENDING version of this part (commit `9c56cd3` and
earlier):

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

### The rules, checked

Each rule above, against what was observed:

1. **Reboot happened: MET for `pulse`.** The owner says so, and `pulse` `main`
   is `b7036d7`, not `d4e491b`. `pulse-fleet` has not moved; the rule asks
   for either, so it is met, and the fleet half is residue.
2. **The phase ran on v1: MET, if v1 is 0.2.0.** The pilot names 0.2.0 in
   its package pin, its lock and its charter. Open question 1 asked which
   kernel is v1. The orchestrator's answer was 0.2.0 (A-14 was held for it).
   It is the first published release that contains M4: the M4 closure head
   `de1664d` is an ancestor of 0.2.0's commit `cb5de0d`
   (`git merge-base --is-ancestor`, exit 0).
3. **Reviewed head equals merged head: NOT MET.** The last reviewed head is
   `dd6adff`; the head PR #22 brought in is `ec51961`, two commits later,
   carrying code. And the last hazard verdict on `dd6adff` is
   FIX-ROUND-NEEDED with an open medium.
4. **Post-merge push run observed to completion: NOT MET.** Pulse has no
   CI workflow (`GET /actions/workflows` lists zero), and no run exists for
   `b7036d7`, so there is nothing to observe until the pilot adds CI. The only post-merge signal on `b7036d7` is Vercel's
   deploy status.
5. **Deploy verification from the pilot's own pushed evidence: NOT MET.**
   The pilot's charter leaves release verification `reserved`, and no pushed
   evidence verifies the merged sha. Vercel's `success` shows the build
   deployed; it does not run the charter's candidate check (the Playwright
   golden journey plus the fast gate on the release commit).

So the pilot did run a real phase on the kernel release that carries M4, and
it merged and deployed. It did not do so in the form this test asked for.
Whether rows 3 to 5 are accepted as they stand, or the pilot runs another
phase that meets them, is not this phase's call. It goes to the orchestrator.

### Remaining residue

- `pulse-fleet` still pins `@tiphys/kernel` 0.1.0 at `7656f67`. No pushed
  bump was seen.
- The pilot has no CI, so T-009's post-merge rule has nothing to read there
  (delivery/tuition/T-009-green-on-the-wrong-event.md:1).
- The pilot's release verification is still `reserved`, awaiting its owner
  decision.
- HZ-M3P4-R2-01 (medium) was addressed after the last review, and no
  review has seen that work.
- The second conjunct, "the old process is retired", was not re-verified
  here beyond trigger arm c (Part 1).

A green kernel gate is not evidence for any row here. The hazard the plan
names for this is green-without-delivery
(delivery/plan/value-delivery-plan.yaml:89).
