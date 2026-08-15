# M3 exit test E0.1: merged phases, their post-merge push runs, and the clause map

- date: 2026-08-15
- author: exit-test runner, dispatch A
- discharges: E0.1 of delivery/plan/kernel-plan-m3.md:5069.
- head under measurement: d5d87f7baf4ad31ab77ab074a5f0b588da189217, which is
  `origin/main` at the time of this record.

E0.1 has two halves and they are recorded separately because they have
different sources and different failure modes.

## 0. The REST reachability probe, recorded because it was not assumed

Standing warning 6 was reversed in part on 2026-08-14 and nobody has
established why the 2026-08-13 401 measurement does not reproduce, so
reachability is a thing to probe at the start of a session that depends on it.
This runner probed it before reading anything from the API, and wrote the
FAILURE arm of the probe helper before its success arm.

The helper captures the HTTP status into a variable, compares it against 200,
and returns nonzero on anything else or on a curl transport failure. It does
not pipe anything into `|| true`.

| probe | result |
|---|---|
| `GET /rate_limit` | HTTP 200, `core.limit` 15000, `core.remaining` 14953 |
| `GET /repos/ThomasHendrickx/tiphys-ai-helmsman` | HTTP 200 |
| `GET /user` | HTTP 200 |

The helper was then demonstrated RED against two structurally different
failures, because one witness is not a class:

| negative probe | helper result |
|---|---|
| `GET /repos/ThomasHendrickx/this-repo-does-not-exist-xyz` | HTTP 403, helper returned 1, body reported the repository is not enabled for this session |
| `GET https://api.github.invalid/rate_limit` | curl exit 56, helper returned 1 |

So a silent watcher is excluded for this run's API reads: an unreachable API
and an unauthorized repository both make the helper return nonzero rather than
print nothing.

## 1. Every merged M3 phase and its `push`-event `gates` run

The phase set is derived from the API rather than from anybody's memory or from
delivery/STATE.md prose: the closed pull requests were listed, filtered to those
whose head ref matches `^claude/m3-p[0-9]+-` AND that carry a `merged_at`, which
gives exactly TWELVE. The scope auditor's phase-branch pattern is the same
pattern, so the derivation and the repository's own definition of a phase branch
agree by construction.

For each, the resulting `main` tip is the pull request's `merge_commit_sha`, and
the run is the `gates` workflow run (workflow id 326892850) whose EVENT is
`push`, whose branch is `main`, and whose `head_sha` equals that sha. The two
shas are compared AS STRINGS in the table's own column rather than asserted to
be the same.

| phase | PR | main tip sha (merge_commit_sha) | run id | event | run head_sha | shas equal as strings | status | conclusion |
|---|---|---|---|---|---|---|---|---|
| M3-P1 | #39 | `1c8252163718662167e4ab711f442b43f4c69156` | 31249255656 | push | `1c8252163718662167e4ab711f442b43f4c69156` | true | completed | success |
| M3-P2 | #48 | `9e87c61bf98ba265c94381cca5bc9ceecd88c84e` | 31273613707 | push | `9e87c61bf98ba265c94381cca5bc9ceecd88c84e` | true | completed | success |
| M3-P3 | #54 | `c7a7ce97e03fc0788c92b401de92f0f4a7b8ee0d` | 31381226164 | push | `c7a7ce97e03fc0788c92b401de92f0f4a7b8ee0d` | true | completed | success |
| M3-P4 | #81 | `a7b7b0790a52aad075417642091b6aec5bb91599` | 31557075080 | push | `a7b7b0790a52aad075417642091b6aec5bb91599` | true | completed | success |
| M3-P5 | #96 | `086b8dfb15f6073827567a36a44a44d2c3a1d1dd` | 31573647802 | push | `086b8dfb15f6073827567a36a44a44d2c3a1d1dd` | true | completed | success |
| M3-P6 | #105 | `ec77c7d48698595f4f5dce45ef5132b1efe3d13b` | 31646802655 | push | `ec77c7d48698595f4f5dce45ef5132b1efe3d13b` | true | completed | success |
| M3-P7 | #124 | `2a3892b6614ca52b4adc1864ada5c8fdda282dec` | 31668688344 | push | `2a3892b6614ca52b4adc1864ada5c8fdda282dec` | true | completed | success |
| M3-P8 | #125 | `e0196880e6d49d7680e184f0974478d7caaa3c1b` | 31685847982 | push | `e0196880e6d49d7680e184f0974478d7caaa3c1b` | true | completed | success |
| M3-P9 | #131 | `7b544b97eadd15542043f2a6df77d36ef7e1f422` | 31731009912 | push | `7b544b97eadd15542043f2a6df77d36ef7e1f422` | true | completed | success |
| M3-P10 | #140 | `a676c80c9f431d6cd62759d9a62b393cbfda63c8` | 31797432716 | push | `a676c80c9f431d6cd62759d9a62b393cbfda63c8` | true | completed | success |
| M3-P11 | #137 | `39316be5055aeb7b3e9d23655b1e233d9b1e14f9` | 31769694210 | push | `39316be5055aeb7b3e9d23655b1e233d9b1e14f9` | true | completed | success |
| M3-P12 | #144 | `53368599ec2174ab55b9cab04dedaddd6a69477c` | 31858485267 | push | `53368599ec2174ab55b9cab04dedaddd6a69477c` | true | completed | success |

Every run above is `head_branch` main and `run_attempt` 1. Their created and
updated timestamps, which is the interval the run occupied:

| run id | created | updated |
|---|---|---|
| 31249255656 | 2026-08-08T08:50:11Z | 2026-08-08T09:00:36Z |
| 31273613707 | 2026-08-08T19:06:42Z | 2026-08-08T19:17:18Z |
| 31381226164 | 2026-08-10T10:55:09Z | 2026-08-10T11:06:53Z |
| 31557075080 | 2026-08-12T02:30:18Z | 2026-08-12T02:42:09Z |
| 31573647802 | 2026-08-12T07:21:44Z | 2026-08-12T07:32:42Z |
| 31646802655 | 2026-08-12T22:24:18Z | 2026-08-12T22:38:47Z |
| 31668688344 | 2026-08-13T04:57:56Z | 2026-08-13T05:13:12Z |
| 31685847982 | 2026-08-13T09:16:39Z | 2026-08-13T09:32:07Z |
| 31731009912 | 2026-08-13T18:29:43Z | 2026-08-13T18:47:03Z |
| 31769694210 | 2026-08-14T04:23:04Z | 2026-08-14T04:40:41Z |
| 31797432716 | 2026-08-14T11:44:27Z | 2026-08-14T12:03:18Z |
| 31858485267 | 2026-08-15T02:10:13Z | 2026-08-15T02:28:59Z |

### The jobs, not only the run conclusion

The dispatch read says to read JOB STEPS rather than check-runs, because
check-runs has served stale state in this repository
(delivery/plan/m3-exit-test-dispatch-read.md:63). The jobs endpoint was read for
all twelve runs. Each run has exactly ONE job, named `gates`, and every one
concluded `success`; the count of jobs whose conclusion was neither `success`
nor `skipped` was zero in all twelve.

### Two facts about the phases themselves, verified in git rather than assumed

- All twelve merge shas are ancestors of `origin/main`
  (`git merge-base --is-ancestor <sha> origin/main` exited 0 for each).
- Eleven of the twelve are single-parent commits, which is the squash merge this
  repository's protocol expects. **M3-P3's landing at `c7a7ce9` has TWO
  parents**: it is a real merge commit titled "Merge pull request #54",
  not a squash. That is a deviation from D-6's squash-merge protocol and it is
  recorded here rather than smoothed over. It does not change what E0.1 asserts,
  because the criterion is about the run whose head sha is the resulting tip and
  that run is present and green, but a later reader comparing merge shapes
  should not have to rediscover it.

### What this half does NOT establish

- **The observation is RETROSPECTIVE.** E0.1 says these runs "were observed to
  completion". This runner did not watch them live; it read completed runs from
  the API afterwards. That is weaker than watching, and the difference matters
  only in one direction: a run still in progress or carrying no conclusion would
  have failed the criterion, and none of the twelve is in either state. Every
  row reads `completed` and `success`.
- **It says nothing about any OTHER push run on `main`.** The criterion is
  per-merge, so a red push run on a `main` tip that was not a phase merge would
  not appear in this table. One hundred and forty-two `push`-event `gates` runs on `main`
  exist in total (`total_count` 142 from the API); this table names twelve of
  them and makes no claim about the rest.
- **It says nothing about the `pull_request` arm.** Deliberately: a
  `pull_request`-event check on the source branch does not discharge this and
  the plan states that as a prohibition
  (delivery/plan/kernel-plan-m3.md:5344). No row above came from a
  `pull_request` run; the query filtered `event=push` at the API.

## 2. The clause-map half

The criterion is that the check exits 0 over all 74 rows of Appendix A, with the
row INVENTORY taken from Appendix A and the COVERAGE table from
`delivery/requirements/clause-map.json` as two separate sources, so that "exits
0 over all 74 rows" is a statement about the inventory and not about whatever
the map happened to contain.

Command and full output, run in the exit-test worktree at d5d87f7 on node
v26.6.0:

```
$ node scripts/check-clause-map.mjs
clause-map: green (74 clause-map rows checked)
74 rows checked, 0 pending a phase not yet in force
$ echo $?
0
```

The two-sources property was verified rather than taken from the script's
header comment. The script's own `parseInventory` was imported and run against
`delivery/plan/kernel-plan-m3.md`, and the map was parsed separately:

| source | rows |
|---|---|
| Appendix A of the plan, parsed by `parseInventory` | 74 |
| `delivery/requirements/clause-map.json` | 74 |
| in the inventory and not in the map | 0 |
| in the map and not in the inventory | 0 |

Set equality holds in both directions, which is the property that makes the
number 74 a statement about the inventory. The reverse direction is the one that
catches an invented row, and it is checked here rather than inferred from the
forward one.

### What this half does NOT establish

The check asserts that every Appendix A row has a map entry and that no map
entry is invented. It does not assert that the artifact each row points at
actually implements the clause; the script's own IN FORCE reading is that a
row's artifact file exists in the working tree. Judgment quality is outside
every criterion in this exit test, which section 4.5 of the plan records as
limit 2.
