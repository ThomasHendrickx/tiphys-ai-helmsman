# Every agent brief this session told agents to clone a repository whose branch
# refs were stale

Found 2026-09-16 by the M4-P2 patch-refresh implementer, in its own not-covered
statement, about the instructions it had been given.

## What it found

Every dispatch brief carried this setup:

    git clone --no-local /home/user/tiphys-ai-helmsman <work>/clone
    cd <work>/clone && git checkout <branch>

`/home/user/tiphys-ai-helmsman` is the orchestrator's original clone. Its
LOCAL branch refs are stale, because the orchestrator stopped working in it: all
merge-forward work happens in a dedicated clone at `/tmp/claude-0/fwd` and pushes
straight to origin. Nothing updates the original clone's local refs.

Measured by the implementer: that clone had `claude/m4-p2-async-launch` at
`3b6739d`, which does not contain `witness/patches/m4-p2-*.patch` at all, while
the real tip on GitHub was `80c8e7c`. It noticed, repointed its origin at the
GitHub URL, and worked from the real tip.

**A follow-on agent that did not notice would have worked on the wrong tree,
silently.** The clone succeeds, the checkout succeeds, the tests run, and the
work is built on a head several rounds old.

## Why it did not bite earlier

Because until this afternoon the orchestrator's clone WAS where the work
happened. The dedicated clone was created to escape nineteen stale worktrees
holding phase branches, which was the right move and had this consequence.

That is the shape worth naming: a fix that moves where work happens leaves every
instruction that names the old place pointing somewhere that still exists, still
works, and is wrong. A path that no longer resolves fails loudly; a path that
resolves to stale content does not.

## The correction

A brief must either clone from the remote, or fetch before checking out:

    git clone --no-local /home/user/tiphys-ai-helmsman <work>/clone
    cd <work>/clone
    git remote set-url origin https://github.com/ThomasHendrickx/tiphys-ai-helmsman
    git fetch origin <branch> main
    git checkout -B <branch> origin/<branch>

`--no-local` plus a re-pointed origin keeps the object copy cheap and makes the
REFS authoritative. Checking out `origin/<branch>` rather than the local branch
name is the part that matters: it is the difference between "the branch as this
container last saw it" and "the branch".

## What this does NOT establish

Which, if any, of this session's agents worked from a stale head without
noticing. The patch-refresh implementer caught it and said so; the others did not
mention it, and silence is not evidence either way. Their work was verified
against pushed heads afterwards, which is the reason to think nothing was lost,
not a check that was run for this purpose.
