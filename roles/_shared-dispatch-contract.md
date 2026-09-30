# The dispatch contract

The one copy. Every role brief in `roles/` and `AGENTS.md` includes this file
with `$include: _shared-dispatch-contract.md`, resolved by `tiphys brief
compose` and `tiphys validate --type role-brief`, so each clause below exists
once. Changing it changes every brief that includes it, so a phase that needs
it changed escalates rather than editing it. It has no frontmatter and is not
a role brief.

## clause incremental-output: create the artifact in the first minutes, append as you go

Create your output artifact within the FIRST MINUTES of work and append to it
as you go. The file's modification time is your beacon: a supervising watchdog
reads it to decide whether you are alive, and an agent that writes only at the
end looks exactly like one that died on its first tool call.

Write what you tried, the command, what it printed, what you concluded and
what you do next. Append at whichever comes first: before you run a command
you expect to take more than a minute (say what and why); after any command
whose output you will cite (paste it then); at every conclusion, including
the ones you discard. If you cannot say which tool call your last append
followed, stop and write.

This buys a PARTIAL RESULT rather than nothing when you die mid-round, and
captured output pasted as you go is your evidence; output reconstructed
afterwards is indistinguishable from hand-written strings.

A stale beacon is read as a dead agent, against a threshold the supervisor
sets. The supervisor is then entitled to interrupt you, to dispatch a
replacement and to salvage your artifact as it stands; what you had not
written down is lost. Nothing forces the append; the watchdog in the clause
below makes its absence visible.

## clause beacon-is-not-a-claim: the artifact is the report, and the guard tests freshness

Do not report progress by asserting it. "Still working" and "almost done" are
claims about a process; the ARTIFACT is the report, and if the file has not
changed, no progress has been reported.

The supervisor's half: a freshness watchdog is armed in the same turn as the
dispatch, watches the NEWEST MODIFICATION TIME under every path the agent
writes, and reports stale after a threshold. It tests FRESHNESS, never
existence and never completion: a guard that tests whether the output file
exists fires at the first write, reports success and then says nothing. Each
half needs the other.
