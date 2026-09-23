# Pilot re-probe, read-only: cutover-entry trigger step 2

- started: 2026-09-23T08:02:55.929Z
- produced by: `scripts/probe-pilot-readonly.mjs`
- api base: `https://api.github.com`
- git base: `https://github.com`
- targets: `ThomasHendrickx/pulse`, `ThomasHendrickx/pulse-fleet`
- permission: DR-0042 allows reading the pilot. DR-0037 stands and forbids
  every write, so this run performs none and could not perform one.
- status: IN PROGRESS. This header is written before the first read, so an
  interrupted run leaves a partial record rather than nothing.

## Targets

| target | verdict | detail |
|---|---|---|
| `ThomasHendrickx/pulse` | satisfied | head `d4e491b` (git ref `d4e491b`), default branch `main`, visibility `public`, updated `2026-08-29T16:29:21Z` |
| `ThomasHendrickx/pulse-fleet` | satisfied | head `7656f67` (git ref `7656f67`), default branch `main`, visibility `public`, updated `2026-08-29T17:04:48Z` |

## Overall

OVERALL satisfied

- finished: 2026-09-23T08:02:59.572Z
- targets probed: 2
- every target was read. This is a statement about the two repositories
  named above and about nothing else.

## Comparison and run history (added by M5-P1, not by the script)

Everything above this heading is the script's output from the run of
2026-09-23T08:02:55Z, unchanged. Everything below was written by the M5-P1
implementer.

### The three runs at this path, all on node v26.6.0

| run | command | exit | result |
|---|---|---|---|
| 1, 06:57Z | `node scripts/probe-pilot-readonly.mjs --out delivery/verification/pulse-re-probe-m5.md` | 3 | `OVERALL refused`: REST 403 on both targets, git read both heads |
| 2, 08:02:05Z | the same, plus `--force` because the file existed (without it: exit 64, nothing probed, nothing written) | 3 | `OVERALL refused`, same shape |
| 3, 08:02:55Z | the same as run 2, with `NODE_USE_ENV_PROXY=1` in the environment | **0** | `OVERALL satisfied`, the record above |

Run 1's full record is in git at commit 618544b, at this same path. `--force`
is the script's own documented way to overwrite on purpose
(delivery/plan/cutover/entry-trigger.md:130).

### Why runs 1 and 2 were refused: the probe bypassed the proxy

Run 1's record put the refusal down to this session not having the pilot
repositories attached. **That diagnosis was wrong for the probe's own
requests.** It was based on `curl`, which honours `HTTPS_PROXY`. Node's
built-in `fetch` does not, unless `NODE_USE_ENV_PROXY=1` is set, and the probe
uses it (scripts/probe-pilot-readonly.mjs:252). Measured at 08:02Z with a
scratch GET-only script, same headers as the probe:

```
without NODE_USE_ENV_PROXY:
  /repos/ThomasHendrickx/pulse               403 {"message":"API rate limit exceeded for 34.45.210.119. ...
  /repos/ThomasHendrickx/tiphys-ai-helmsman  403 {"message":"API rate limit exceeded for 34.45.210.119. ...
with NODE_USE_ENV_PROXY=1:
  /repos/ThomasHendrickx/pulse               200 {"id":1335801685,...,"full_name":"ThomasHendrickx/pulse",...
  /repos/ThomasHendrickx/tiphys-ai-helmsman  200
```

So without the variable, the probe went straight to GitHub without
credentials and hit this IP's anonymous rate limit. The kernel repository
answers 403 the same way, so pilot access has nothing to do with it. `curl`
went through the proxy and did show pilot access missing in run 1's session.
At 08:01Z, after the pilot repositories were attached, `curl` read `pulse`
and `pulse-fleet` with 200. Both causes were real, and run 3 needed both
fixed.

The script classifies every 403 as `refused` without reading the body
(scripts/probe-pilot-readonly.mjs:272), so a rate limit and an authorization
refusal are indistinguishable in its output. Recorded, not changed: the
script is outside this phase's files.

This probably also explains the "unexplained" single success on 2026-09-16
(delivery/work-history/m4-p27.md:121): an anonymous request that happened to
fall inside the rate limit. Nothing here proves that.

### Heads against the last readings

| target | 2026-08-20 | 2026-09-16 | 2026-09-23, run 3 |
|---|---|---|---|
| `pulse` `main` | `1204775` | `d4e491b` | `d4e491b`, updated 2026-08-29T16:29:21Z |
| `pulse-fleet` `main` | `ebed33b` | `7656f67` | `7656f67`, updated 2026-08-29T17:04:48Z |

Sources for the earlier columns: delivery/verification/dr-0034-premise-check.md:25,
delivery/verification/dr-0034-premise-check.md:27 and
delivery/work-history/m4-p27.md:69. The REST record and the git ref agree for
both targets. Neither pilot head has moved since 2026-09-16.

Transports: REST repository record, REST newest commit, and `git ls-remote
HEAD`. Excluded writes: only `ls-remote` and `clone --depth 1` are admitted
for git (scripts/probe-pilot-readonly.mjs:116), and every request is a GET
(scripts/probe-pilot-readonly.mjs:253). The header still reads "IN PROGRESS"
after a finished run; the "Overall" section is what marks completion.
