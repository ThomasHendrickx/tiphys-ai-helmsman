# The M4 exit test on pulse

- date opened: 2026-09-23
- phase: M5-P1 (delivery/plan/value-delivery-plan.yaml:27)
- status: **NOT DISCHARGED.** Re-run 2026-09-24 against pulse M3-P5 (pulse
  PR #25, Part 3). Four of the five pre-written rules are now met, including
  the two PR #22 failed on the merged head and the push run. ONE row still
  fails: **deploy verification**. Pulse's charter still declares
  `release-verification: mode: reserved`, and no pushed pilot file records a
  deploy verification of the merged sha `35d2e55`. What would close it is in
  Part 3. The PR #22 record (Part 2) is kept as it was.
- earlier status (2026-09-24, PR #22): NOT DISCHARGED. A-14 is done: the
  pilot ran pulse M3-P4 on kernel 0.2.0 and merged it as pulse PR #22. Three
  rows of Part 2 failed the rules written for them in advance: the merged
  head was not the reviewed head, pulse had no post-merge push run, and pulse
  had no deploy verification.
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

This document has three parts. The first records what is known up to the
reboot, from commands run on 2026-09-23. The second was filled on
2026-09-24, after the reboot, and holds only what was observed of pulse
M3-P4 (PR #22). The third, added the evening of 2026-09-24, applies the same
pre-written rules to the next pulse phase, M3-P5 (PR #25).

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

## Part 3: the pulse M3-P5 run, observed 2026-09-24 (evening)

Added by M5-P1 on 2026-09-24 between 18:43Z and 18:46Z, read-only, after the
orchestrator reported that the owner had done A-17's steps in the pilot. The
report was the trigger; every row below is from a REST GET, each of which
answered HTTP 200. No clone was made this time; pilot files were read by
`GET /repos/ThomasHendrickx/<repo>/contents/<path>?ref=<sha>`. Nothing was
pushed to `pulse` or `pulse-fleet`, and no pilot ref, file, comment or pull
request was created (DR-0037). Paths in backticks are PILOT paths or
commands, quoted, and do not resolve here. Part 2 above is not changed; its
rules are applied again, unchanged, to the new phase.

### What the pilot did between Part 2 and Part 3

| pulse PR | what | merge | merged at (UTC) |
|---|---|---|---|
| #23 | kernel pin 0.2.0 to 0.2.1 | `987b6da` (per A-17's register entry on `main`) | 2026-09-24 |
| #24 | CI: `.github/workflows/ci.yml`, "fast gate" and "slow gate (Playwright)" on `pull_request` and on `push` to `main` | `dff0824` (its push run is below) | 2026-09-24, push run created 15:35:34Z |
| #25 | **pulse M3-P5**, "share a PDF from the phone straight into the import flow" | `35d2e55`, head `98fbadc` | 2026-09-24T17:12:07Z |
| #26 | records only: the round-two verdicts and the closing work-history entry | `1796ff8`, head `3055752` | 2026-09-24T17:39:41Z |

Pulse's CI runs the pilot's own gates, not the kernel's: the fast gate is
`npm ci`, `prisma generate`, typecheck, lint, `npm test`, `gate:privacy` and
`gate:decisions`, and the slow gate is `npm run test:e2e` against a local
Supabase stack. `ci.yml` at `1796ff8` names `@tiphys/kernel` only in a
comment (`grep -n tiphys`, one hit, line 10) and never runs `tiphys gates`.
The rules of this test ask for a post-merge push run, not for kernel gates
in it, so this does not change a verdict; it is recorded so a reader does not
assume the push run below ran kernel gates.

One correction to the relay this run was dispatched with: `3055752` is PR
#26's HEAD, not its merge. `GET /pulls/26` gives merge_commit_sha
`1796ff8d5750ca185190e699daa24214dcf21bdd`, and `1796ff8` is pulse `main`
now (`GET /branches/main`).

`pulse-fleet` moved too: `main` is `8fa9a82` (its PR #1, 2026-09-24T17:13:22Z),
and its `package.json` pins `"@tiphys/kernel": "0.2.1"` (it was `0.1.0` at
`7656f67`). Its lock resolves `kernel-0.2.1.tgz` with integrity
`sha512-ONgrxG3K...AQkqw==`, the same value that
`npm view @tiphys/kernel@0.2.1 dist.integrity` prints. The Part 2 residue
"pulse-fleet still pins 0.1.0" is closed.

### The review verdicts for pulse M3-P5, all four

Read at `1796ff8` from `delivery/review/m3-p5-*.json` with `jq` over `head`,
`verdict`, `produced-by`, `framing`, `review-contract`, `tiphys-version` and
the findings' severities:

| pulse file | head | produced-by | contract / framing | verdict | severities |
|---|---|---|---|---|---|
| `m3-p5-criteria.json` | `98b4f0e` | claude | criteria / criteria-contract | FIX-ROUND-NEEDED | medium, low, low |
| `m3-p5-hazard.json` | `98b4f0e` | claude | hazard / unauthenticated-write-and-cache-paths | FIX-ROUND-NEEDED | high, 4 low |
| `m3-p5-criteria-round2.json` | **`98fbadc`** | claude | criteria / criteria-contract | **APPROVE** | 3 low |
| `m3-p5-hazard-round2.json` | **`98fbadc`** | claude | hazard / unauthenticated-write-and-cache-paths | **APPROVE** | 3 low |

All four carry `tiphys-version` `0.2.1`. The round-one pair names `98b4f0e`
and asks for a fix round. A-17's 17:38 UTC progress note on `main` read only
that pair and called step 3 unmet. That reading was incomplete: the
round-two pair names `98fbadc` and approves, with no finding above low.

### The rules, applied to pulse M3-P5

The rules are the ones under "The rules, as written on 2026-09-23 before the
result" in Part 2, unchanged.

1. **Reboot happened: MET** (unchanged from Part 2). Pulse `main` has moved
   again since, to `1796ff8`.

2. **The phase ran on v1: MET, reading v1 as the first published release
   carrying M4, or a later one.** Pulse at `35d2e55` pins
   `"@tiphys/kernel": "0.2.1"` in `package.json` line 31, its lock integrity
   equals the registry's for 0.2.1, `charter.yaml` line 9 reads
   `kernel-version-pin: 0.2.1`, and every M3-P5 verdict says
   `tiphys-version: 0.2.1`. In this repository the M4 closure head is an
   ancestor of the 0.2.1 tag: `git rev-parse v0.2.1^{commit}` printed
   `2c49ab3...`, and `git merge-base --is-ancestor de1664d v0.2.1` exited 0.
   Open question 1 was answered with 0.2.0; 0.2.1 is its successor, and
   A-17 asked for 0.2.1.

3. **Reviewed head equals merged head: MET.**
   - `GET /pulls/25`: merged true, merged_at 2026-09-24T17:12:07Z, head sha
     `98fbadc46e7018abc6480a8914c4ef92aeeb24dc`, merge_commit_sha
     `35d2e55798139604549a0dde26ada2cce4781feb`, base `main`, merged_by
     `ThomasHendrickx`. `GET /pulls/25/commits` lists four commits ending at
     `98fbadc` (`fada6fb`, `98b4f0e`, `31fd73d`, `98fbadc`).
   - `GET /commits/35d2e55`: parents `dff0824` and `98fbadc`, tree
     `8edba11701ff0f6c2eb2574091395ae02dcccfe5`. `GET /commits/98fbadc`:
     tree `8edba11701ff0f6c2eb2574091395ae02dcccfe5`. The trees are equal,
     so the merge brought in exactly the reviewed head and nothing else.
   - Both round-two verdicts name `98fbadc` and read APPROVE, and no finding
     in either is above low. The Part 2 failure (unreviewed code commits
     after the reviewed head, and an open medium) does not recur.

   **Were the round-two reviews produced before the merge?** The rule does
   not ask this; it asks that the named reviewed head equal the merged head.
   The ordering is recorded because it was asked, and it is NOT observable
   from the pushed artifacts:
   - The verdict files carry no timestamp. Their keys are `criteria`,
     `deviations-judged`, `findings`, `framing`, `head`, `kind`, `phase`,
     `produced-by`, `review-contract`, `tiphys-version` and `verdict`, plus
     `hazard-classes-addressed` in the hazard pair.
   - They were COMMITTED after the merge, by design. `3055752` ("land the
     round two verdicts and the closing record") is dated
     2026-09-24T17:12:44Z, 37 seconds after the merge. The pilot's work
     history gives the reason in its first key decision: "committing the
     verdict onto the branch makes a new commit that no verdict names", so
     the verdicts land in a separate records change after the merge
     (`delivery/work-history/m3-p5.yaml` in pulse, with its "CORRECTIONS
     AFTER THE MERGE" entry, which says the round-one verdicts were
     committed on the branch in `98fbadc` before round two).
   - Its closing entry `C-5-merged-at-approved-head`, "written after the
     merge", says both round-two verdicts read APPROVE at `98fbadc` and that
     the PR "merged with its head pinned to 98fbadc". The `pulse-fleet`
     ledger (commit `ad4538f`, 17:13:10Z) says the same.
   - So that the reviews preceded the merge is the pilot's own recorded
     claim. A 37-second gap between the merge and the verdict commit is too
     short to have run two clean-room reviews after the merge, which makes
     the claim plausible. That is a deduction, not an observation.

   **Decorrelation.** Both round-two verdicts say `produced-by: claude`, one
   model family. The rules of this test say nothing about decorrelation,
   and neither do DR-0037, DR-0041 or DR-0042. This repository's DR-0012
   governs this repository's merges, not the pilot's. The pilot's own rule
   is its DR-0003 (`pulse-fleet` `decisions/DR-0003.yaml` at `8fa9a82`),
   decided by the owner on 2026-08-17 as "same family, varied lenses": both
   verdicts may be Claude-family provided review-contract and framing differ
   across the pair. They do: `criteria` / `criteria-contract` against
   `hazard` / `unauthenticated-write-and-cache-paths`. So the pair meets the
   pilot's declared rule, and this test adds no rule of its own.

4. **Post-merge push run observed to completion: MET, by T-009's
   cancelled-run discharge, with the weaker claim stated.**

   | pulse `main` head | run | event | status | conclusion | jobs |
   |---|---|---|---|---|---|
   | `35d2e55` (the M3-P5 merge) | 36032643312 | push | completed | **cancelled** | fast gate success, 17:12:13Z to 17:13:15Z; slow gate cancelled at 17:39:59Z, in step `npm run test:e2e` |
   | `1796ff8` (PR #26 merge, `main` now) | 36035853808 | push | completed | **success** | fast gate success; slow gate (Playwright) success, 17:40:02Z to 18:12:49Z |

   Read with `GET /actions/runs?head_sha=<sha>`, `GET /actions/runs/<id>/jobs`
   and `GET /commits/<sha>/check-runs`. `GET /actions/runs?branch=main&event=push`
   lists exactly three push runs: `dff0824` success, `35d2e55` cancelled,
   `1796ff8` success, each at attempt 1.

   Why `35d2e55`'s run was cancelled: pulse's `ci.yml` sets
   `concurrency: group: ci-${{ github.ref }}` with `cancel-in-progress: true`.
   The push of `1796ff8` created its run at 17:39:44Z, and the still-running
   `35d2e55` run ended at 17:40:00Z. This is exactly the shape recorded at
   CLAUDE.md:538.

   The rule said "per T-009" and "a cancelled run is neither green nor red".
   So `35d2e55`'s own run is NOT counted as green. What discharges the rule
   is T-009's stated procedure for this case (CLAUDE.md:548): verify the
   current `main` head's push run to completion, and say that head N's own
   run was cancelled by head N+1. That run is `1796ff8`'s, observed
   completed, conclusion success.

   What that is evidence for, stated rather than inflated. `GET
   /compare/35d2e55...1796ff8`: ahead 2, behind 0, three files, all records
   (`delivery/review/m3-p5-criteria-round2.json` and
   `m3-p5-hazard-round2.json` added, `delivery/work-history/m3-p5.yaml` +49
   -0). So the green push run at `1796ff8` ran both gates over the M3-P5
   code byte for byte. It is not a run whose head sha is `35d2e55`: there
   the fast gate completed green and the slow gate did not complete. The
   reviewed head `98fbadc` (same tree as `35d2e55`) also has a completed
   `pull_request` run, 36028645734, success on both gates. That is a
   different event and is not offered as the push run.

5. **Deploy verification from the pilot's own pushed evidence: NOT MET.**

   What exists:
   - Vercel production deployments of both merges, each with deployment
     status `success`, creator `vercel[bot]`: id 6643693281 for `35d2e55`
     (17:13:31Z) and id 6644236912 for `1796ff8` (17:40:59Z)
     (`GET /deployments?sha=<sha>`, `GET /deployments/<id>/statuses`). Each
     commit's combined status is one context, `Vercel`, "Deployment has
     completed".
   - The check runs on `35d2e55` are only the two CI jobs above. There is
     no deploy check run.
   - A deploy-verify wrapper, `playwright.deploy.config.ts`, which says it is
     "Used by the fleet's deploy-verify stage: PLAYWRIGHT_BASE_URL=<deployed
     url> npx playwright test --config=playwright.deploy.config.ts". No CI
     job runs it: `ci.yml` has only the fast and slow gates, both against a
     local stack.

   What is missing, which is what the rule asks for:
   - **A deploy verification in the charter's sense.** Pulse `charter.yaml`
     at `1796ff8`, and the fleet's copy `charter/pulse.yaml` at `8fa9a82`,
     still read `release-verification: mode: reserved`. The note says the
     owner has not decided its shape (pulse DR-0014), and that the working
     candidate is "the Playwright golden journey plus the fast gate, green
     on the release commit".
   - **Pushed evidence of one for the merged sha.** No pushed file records a
     verification of `35d2e55` or `1796ff8` against the deployed site.
     `delivery/evidence/` in pulse holds only `.gitkeep` (recursive tree at
     `1796ff8`, not truncated). The M3-P5 work history has no line matching
     `deploy`, `vercel`, `production` or `release` (`grep -n -i`, no
     output). `pulse-fleet` `notes/deployed-infrastructure.md` has
     deploy-verify records for M1-P1 to M3-P2 only; no line in it names
     `M3-P5`, `35d2e55` or `98fbadc`.

   The near miss, so a reader does not have to find it. If the owner decided
   the candidate as pulse's release verification, the completed green push
   run at `1796ff8` (fast gate plus the Playwright slow gate, over the M3-P5
   code) would come close to that check on a production-deployed release
   commit. It is not offered as this row's evidence, for three reasons: the
   candidate is not decided; the slow gate runs the e2e suite against a
   local stack, not a golden journey against the deployment; and a CI run
   is not the "pushed files" the rule names. Relabelling it would be the
   green-without-delivery hazard (delivery/plan/value-delivery-plan.yaml:89).

### What would close the last row

Both steps are in the pilot, for the pilot's owner and session. This phase
does not act there.

1. Decide pulse's `release-verification` shape (pulse DR-0014), so the
   charter's mode is no longer `reserved`.
2. Run that verification against the deployed merge of a phase, and push its
   record, naming the sha, into the pilot's files. `35d2e55` qualifies: its
   production deployment 6643693281 exists, and rules 1 to 4 are met for it.

A-17's register entry on `main` lists three steps and none of them is this.
Registering it is the orchestrator's call, since the register allocates.

### Part 3 verdict

| rule | M3-P4 (PR #22, Part 2) | M3-P5 (PR #25, Part 3) |
|---|---|---|
| 1 reboot happened | met | met |
| 2 ran on v1 | met (0.2.0) | met (0.2.1) |
| 3 reviewed head equals merged head | NOT MET | **met** (`98fbadc`, trees equal) |
| 4 post-merge push run | NOT MET (no CI) | **met** by T-009's cancelled-run discharge (`1796ff8` run 36035853808 success; the `35d2e55` run was cancelled by it) |
| 5 deploy verification | NOT MET | **NOT MET** (charter `reserved`, no pushed record) |

**M4 exit verdict: NOT DISCHARGED**, on row 5 alone. Criterion p1-value
(delivery/plan/value-delivery-plan.yaml:73) asks the document to name one
pulse phase, its reviewed head, merged pull request, post-merge push run and
deploy verification. For M3-P5 it now names the first four, each tied to an
API result. The fifth is named as an absence, which does not meet it.
