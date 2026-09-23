# Pilot re-probe, read-only: cutover-entry trigger step 2

- started: 2026-09-23T06:57:59.933Z
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
| `ThomasHendrickx/pulse` | refused | head `unread` (git ref `d4e491b`), default branch `unread`, visibility `unread`, updated `unread`. sources: record=refused, commits=refused, gitRef=satisfied. record refused: https://api.github.com/repos/ThomasHendrickx/pulse answered HTTP 403; commits refused: https://api.github.com/repos/ThomasHendrickx/pulse/commits?per_page=1 answered HTTP 403 |
| `ThomasHendrickx/pulse-fleet` | refused | head `unread` (git ref `7656f67`), default branch `unread`, visibility `unread`, updated `unread`. sources: record=refused, commits=refused, gitRef=satisfied. record refused: https://api.github.com/repos/ThomasHendrickx/pulse-fleet answered HTTP 403; commits refused: https://api.github.com/repos/ThomasHendrickx/pulse-fleet/commits?per_page=1 answered HTTP 403 |

## Overall

OVERALL refused

- finished: 2026-09-23T06:58:01.288Z
- targets probed: 2

### What was NOT established

- `ThomasHendrickx/pulse`: refused. record refused: https://api.github.com/repos/ThomasHendrickx/pulse answered HTTP 403; commits refused: https://api.github.com/repos/ThomasHendrickx/pulse/commits?per_page=1 answered HTTP 403
- `ThomasHendrickx/pulse-fleet`: refused. record refused: https://api.github.com/repos/ThomasHendrickx/pulse-fleet answered HTTP 403; commits refused: https://api.github.com/repos/ThomasHendrickx/pulse-fleet/commits?per_page=1 answered HTTP 403

An unreachable or refused target is NOT a clean probe and is NOT an
absence of the thing looked for. The trigger does not advance on this run.

## Comparison with the last recorded reading (added by M5-P1, not by the script)

Everything above this heading was written by the script, byte for byte, in
the run of 2026-09-23 that exited 3. Everything below it was written by the
M5-P1 implementer from separate commands, each quoted with its exit code.

### What the script's run established, and what it did not

- Targets: `ThomasHendrickx/pulse` and `ThomasHendrickx/pulse-fleet`, the two
  defaults at scripts/probe-pilot-readonly.mjs:77.
- Transports: three sources per target. The REST repository record and the
  REST newest-commit listing were both `refused` (HTTP 403) for both targets.
  `git ls-remote HEAD` over the git protocol was `satisfied` for both.
- Observed heads, git protocol only: `pulse` `d4e491b`, `pulse-fleet`
  `7656f67`. Default branch, visibility and last update were NOT read, because
  only the refused REST record carries them.
- Excluded write operations: every git subcommand except `ls-remote` and a
  `clone` carrying `--depth 1` is refused before a child is spawned
  (scripts/probe-pilot-readonly.mjs:116), and every request uses the GET
  method with no body (scripts/probe-pilot-readonly.mjs:253). So no push, ref
  update, branch, pull request, fleet state or lease, which is DR-0037's list.
- Verdict: `OVERALL refused`, exit 3. By the four-word vocabulary this run is
  NOT satisfied, and acceptance criterion p1-probe, which asks for exit 0, is
  NOT met by it.
- The header above still reads "status: IN PROGRESS" although the run
  finished. The script writes that header before its first read and does not
  rewrite it; the "Overall" section is the completion marker. Recorded, not
  changed, because the script is outside this phase's files.

### Why REST is refused: the session's repository scope, measured

The 403 body, read with a plain GET on 2026-09-23:

```
GET /repos/ThomasHendrickx/pulse -> 403
{"message":"GitHub access to this repository is not enabled for this session.
Use add_repo to request access. If add_repo answers that read access is already
available and you need GitHub API or write access, call add_repo again with
access:\"push\" to attach the repository with credentials.", ...}
GET /repos/ThomasHendrickx/pulse-fleet -> 403, same body
GET /repos/ThomasHendrickx/tiphys-ai-helmsman -> 200
GET /repos/ThomasHendrickx/tiphys-ai-helmsman-fleet -> 200
GET /rate_limit -> 200, core.limit 15000
```

So the refusal is the agent session's repository allowlist, not GitHub and not
the proxy being down: two repositories attached to this session answer 200 in
the same shell. The body names the remedy, and the remedy is a PUSH-scoped
attach of the pilot repositories. That hands this session write credentials
for a repository DR-0037 says this orchestrator does not work on. The M5-P1
implementer did NOT do it. Whether to do it for read-only REST access is an
orchestrator call, and it is raised as an open question in
delivery/verification/m4-exit-test-pulse.md:1.

This also explains most of what the M4-P27 record called unexplained
(delivery/work-history/m4-p27.md:121): REST reachability depends on which
repositories the session has attached. The single successful run on
2026-09-16 is still not explained by this; it may have run in a session with
a different attachment, and nothing here shows that.

### Heads against the last committed readings

Independent read-only commands, 2026-09-23:

```
$ git ls-remote --symref https://github.com/ThomasHendrickx/pulse.git HEAD
ref: refs/heads/main	HEAD
d4e491b124666a77aa63024b3eedf606657e9e88	HEAD
exit 0
$ git ls-remote --symref https://github.com/ThomasHendrickx/pulse-fleet.git HEAD
ref: refs/heads/main	HEAD
7656f672210628b9a8bf14b15828d8f38e04d398	HEAD
exit 0
$ git clone --depth 1 https://github.com/ThomasHendrickx/pulse.git <scratch>/pulse-ro
$ git log -1 --format='%H %cI %s'
d4e491b124666a77aa63024b3eedf606657e9e88 2026-08-29T16:27:11+00:00 Merge remote-tracking branch 'origin/claude/import-format-duplicate-name' into merge-m3p12
$ git clone --depth 1 https://github.com/ThomasHendrickx/pulse-fleet.git <scratch>/pulse-fleet-ro
$ git log -1 --format='%H %cI %s'
7656f672210628b9a8bf14b15828d8f38e04d398 2026-08-29T17:04:36+00:00 notes: prepped for the owner's test session, and the false-witness rule the last fix earned
```

Both clones are `--depth 1`, the one clone form the probe itself admits, into
this session's scratchpad, and were read only.

| target | 2026-08-20 (DR-0034 premise check) | 2026-09-16 (M4-P27) | 2026-09-23 (this run) |
|---|---|---|---|
| `pulse` `main` | `1204775` | `d4e491b` | `d4e491b` |
| `pulse-fleet` `main` | `ebed33b` | `7656f67` | `7656f67` |

Sources: delivery/verification/dr-0034-premise-check.md:25 and
delivery/verification/dr-0034-premise-check.md:27 for the first column;
delivery/work-history/m4-p27.md:69 and delivery/work-history/m4-p27.md:121 for
the second (line 121 is the one REST run M4-P27 recorded as unexplained; its `d4e491b` is corroborated by the git read at line 69, and `7656f67` is the value it reported).

**Neither pilot head has moved since 2026-09-16, and both were last committed
on 2026-08-29.** So the pilot has had no pushed `main` activity for 25 days. A
reading of the pilot as it stood on 2026-09-16 is still current on `main`.

Other facts from the same reads:

- `pulse` carries 106 branches (`git ls-remote --heads`, exit 0). Branch
  creation dates are not readable without fetching them, so this record does
  not say whether any is newer than 2026-08-29.
- `pulse-fleet` at `7656f67` pins `"@tiphys/kernel": "0.1.0"` in its
  `package.json` and its `tasks/` directory is empty.
