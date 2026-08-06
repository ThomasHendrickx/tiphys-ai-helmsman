#!/usr/bin/env bash
#
# stub-payload.sh: the deterministic stub payload the M1 exit test spawns
# (kernel plan v1, M1-P6 step 3; plan decision D-2: the payload is a
# deterministic stub, never an LLM).
#
# It runs with the spawned task worktree as its working directory, which
# is what tiphys spawn's executor adapter guarantees, and it does exactly
# what the milestone exit condition needs a task to do: land one trivial
# change. It appends one line to the toy project's README, commits it, and
# pushes the task branch.
#
# THE PAYLOAD NEVER OPENS A PULL REQUEST (M2-P8 step 5, R-008). An earlier
# revision ran `gh pr create` here in full mode, which had the exercised
# shape contradict the discipline the exit test certifies: implementers
# push branches and never create PRs. Pull-request creation is the
# HARNESS'S act (scripts/m1-exit-test.sh, step A6, full mode), performed
# outside the payload's scrubbed child environment. Do not move it back.
#
# Every commit uses command-scoped GIT_AUTHOR_* and GIT_COMMITTER_*
# variables carrying the documented harness identity, mirroring the
# mechanism tiphys init uses (EXT-F-02 option B, PR-211), so the payload
# succeeds on a clean runner with no configured git identity.
#
# Environment contract (set by scripts/m1-exit-test.sh):
#   TIPHYS_EXIT_TEST_MODE     local (default) or full
#   TIPHYS_EXIT_TEST_TASK     task id recorded in the appended line and
#                             the commit message (default m1-exit)
#   TIPHYS_EXIT_TEST_REPORT   optional path; when set, every reported
#                             line is written there as well as to stdout
#
# stdout, one line per fact, so the harness can capture it as evidence:
#   payload branch <branch>
#   payload commit <sha>
#   payload pushed <remote-url> <branch>
#
# The report file exists because whether tiphys spawn forwards the
# payload's stdout to its own is not a contract the plan states. The
# payload writes its own facts to a path the harness chose, so the
# harness never has to assume an unstated M1-P4 behavior; spawn's
# captured output is still recorded as evidence either way.

set -euo pipefail

# The documented harness identity. scripts/seed-sandbox.sh and
# scripts/m1-exit-test.sh declare the same two constants; a drift between
# the three is caught by test/exit-test-local.test.ts.
HARNESS_NAME="Tiphys Exit Test"
HARNESS_EMAIL="exit-test@tiphys.invalid"

mode="${TIPHYS_EXIT_TEST_MODE:-local}"
task="${TIPHYS_EXIT_TEST_TASK:-m1-exit}"
report="${TIPHYS_EXIT_TEST_REPORT:-}"

# Report one fact, to stdout and (when the harness asked for one) to the
# report file. The file is truncated by the first line of a run, so a
# re-run never appends to a previous run's facts.
report_line() {
  echo "$1"
  if [ -n "${report}" ]; then
    if [ "${report_started:-}" = "yes" ]; then
      echo "$1" >>"${report}"
    else
      echo "$1" >"${report}"
      report_started=yes
    fi
  fi
}

case "${mode}" in
  local|full) ;;
  *)
    echo "stub-payload: unknown mode \"${mode}\" (expected local or full)" >&2
    exit 64
    ;;
esac

git_identified() {
  GIT_AUTHOR_NAME="${HARNESS_NAME}" \
  GIT_AUTHOR_EMAIL="${HARNESS_EMAIL}" \
  GIT_COMMITTER_NAME="${HARNESS_NAME}" \
  GIT_COMMITTER_EMAIL="${HARNESS_EMAIL}" \
  git "$@"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "stub-payload: working directory $(pwd) is not a git worktree" >&2
  exit 1
fi

if [ ! -f README.md ]; then
  echo "stub-payload: no README.md in $(pwd); the toy sandbox seed is missing" >&2
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "${branch}" = "HEAD" ]; then
  echo "stub-payload: worktree is at a detached HEAD, expected the task branch" >&2
  exit 1
fi
report_line "payload branch ${branch}"

printf 'exit-test %s landed a trivial change on branch %s\n' "${task}" "${branch}" >>README.md

git add README.md
if git diff --cached --quiet; then
  echo "stub-payload: appending the exit-test line produced no change, refusing to make an empty commit" >&2
  exit 1
fi
git_identified commit --quiet -m "exit-test ${task}: trivial change"

commit=$(git rev-parse HEAD)
report_line "payload commit ${commit}"

remote_url=$(git remote get-url origin)
git push --quiet origin "HEAD:refs/heads/${branch}"
report_line "payload pushed ${remote_url} ${branch}"
