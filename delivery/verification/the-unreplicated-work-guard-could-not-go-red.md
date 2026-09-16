# The unreplicated-work guard could not go red, in three different ways

Found by the M4-P15 clean-room reviewer, 2026-09-16, in the orchestrator's own
harness rather than in the phase it was reviewing. Two findings, both MEDIUM,
both reproduced in a lab built from the script's own source rather than argued.
A third arm was found while fixing them.

## Why this one matters more than its severity says

`.claude/orchestrator-next.mjs` is the mechanism that answers "is there
unreplicated work in this container", and it exists because of T-027: four
hundred commits once lived only in a container and nothing noticed. It is the
guard against the single state no later session can recover from.

So a guard that reports "nothing unreplicated" when it could not look is worth
LESS than no guard, because it is trusted. That is this project's most-recorded
failure shape, and CLAUDE.md's fix-round contract already names one instance of
it in these words: "a usage error read as a clean result".

## The three members, and they are structurally different

Member 1, the truncation. Both the local and the remote read ended in
`.filter(Boolean)[0]`, so only the FIRST branch matching a phase prefix was ever
examined. The reviewer measured what that costs: one local branch carrying an
unreplicated commit gives exit 6 and the marker; a pushed branch SORTING FIRST
plus a second branch carrying the commit gives the ordinary "pushed, NOT merged"
line, no marker, exit 2.

It was live. The M4 plan declares M4-P15's branch as `claude/m4-p15-fleet-bringup`
while the delivered branch is `claude/m4-p15-kernel-charter`, and the first sorts
BEFORE the second, so creating the declared branch would have made the branch
under review the unwatched one. The worktree watch set carried the identical
truncation, and the script's own "WORKTREE WATCH SET IS EMPTY" warning fires only
at ZERO, so a PARTIAL watch set was silent. That is T-014's shape: a watchdog
pointed at one of several paths is not weak, it is false, because it reports
quiet at full speed.

Member 2, the swallowed failure. `git()` returns the empty string on ANY error
and `Number.parseInt("") || 0` is 0. The reviewer forced it with one config
change, `git config color.branch always`, which puts an escape sequence inside
the branch name so the following `rev-list` exits with a usage error. Stated
fairly, as the reviewer stated it: `color.branch` is unset globally and in this
repository, so that specific trigger is not live here, and the usage error does
reach stderr so it is not wholly silent to a human. The EXIT CODE, which is the
half this script exists to make un-report-around-able, is the part that lied.

Member 3, found while fixing the other two. Switching the listing to
`--format=%(refname:short)` removes the colour escape at its source, which fixes
member 2 and closes ONE DOOR rather than the mechanism. The mechanism is any
failure of the count. A shim that fails the exact `rev-list` was built to reach
it.

## Measured, against the old script and the new one

Lab: a scratch repository with a bare remote, a merged phase and an unmerged
one, node v26.6.0. Command-scoped git identity per standing warning 5.

| member | old | new |
|---|---|---|
| a second local branch carries the commit | exit 2, NO marker | exit 6, names the branch |
| a colour escape breaks the count | exit 2, NO marker | exit 6, names the branch |
| the count command fails outright | exit 2, silent zero | **exit 7**, "git count(s) FAILED" |
| control: nothing unreplicated | exit 2, no marker | exit 2, no marker |

Three members red against the dangerous state, which here is "unreplicated work
exists and the guard says nothing", not "the feature is absent". The control
exists because the obvious wrong fix is one that reports a marker always.

## What the fix does

Every matching branch is read, not the first; the count is named per branch
rather than totalled, because a bare total hides which branch carries it; the
worktree watch set is the UNION over every matching branch, freshest winning,
since any live worktree means the phase is being worked on; listings use
`--format` so no marker or colour reaches the parser; and a count that could not
be taken is a HARD ERROR that exits 7 and outranks every other answer, including
the unreplicated check itself, because it is the state in which the script does
not KNOW.

The full account of why `git` and `gitTry` both exist is in the source comment
at .claude/orchestrator-next.mjs:121.

## What this does NOT establish

The lab is a scratch repository, not this one, and the three members were
constructed rather than encountered. Nothing here says the guard is now correct
for every failure of every git call it makes: `git()` still swallows errors for
LISTINGS, deliberately, because for a listing an empty result and a failed
listing are both "nothing to report". If that turns out to be wrong too, it is a
fourth member and not a refutation of these three.
