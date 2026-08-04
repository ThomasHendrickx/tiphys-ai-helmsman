#!/usr/bin/env bash
#
# seed-sandbox.sh: push the toy sandbox project content to the sandbox
# repository (kernel plan v1, M1-P6 step 1).
#
# Idempotent by construction: the seed content is copied over a fresh
# checkout of the target branch, and when the resulting tree is identical
# to what the branch already carries the script commits nothing, pushes
# nothing, and exits 0. Re-running it therefore restores the pristine seed
# content and is safe at any time. Note the consequence: exit-test log
# lines appended to sandbox/README.md by earlier runs are reset by a
# re-seed, because the seed content is the authority for the seeded files.
#
# Every commit uses command-scoped GIT_AUTHOR_* and GIT_COMMITTER_*
# variables carrying the documented harness identity, mirroring the
# mechanism tiphys init uses (EXT-F-02 option B, PR-211). No user or
# global git configuration is read or required, which is what makes this
# work on a clean CI runner that has no git identity at all.
#
# Usage:
#   scripts/seed-sandbox.sh --remote <url> [--branch <name>]
#
# <url> is any git URL: the file:// path of a scratch bare repository in
# local mode, or the sandbox repository created by owner action A-1 in
# full mode. When --branch is omitted the remote's advertised default
# branch is used, falling back to main for a remote with no HEAD yet.

set -euo pipefail

# The documented harness identity. scripts/stub-payload.sh and
# scripts/m1-exit-test.sh declare the same two constants; a drift between
# the three is caught by test/exit-test-local.test.ts.
HARNESS_NAME="Tiphys Exit Test"
HARNESS_EMAIL="exit-test@tiphys.invalid"

# A fixed authoring date keeps a re-seed of unchanged content byte-stable.
HARNESS_DATE="2026-01-01T00:00:00+00:00"

USAGE="usage: scripts/seed-sandbox.sh --remote <url> [--branch <name>]"
EX_USAGE=64

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "${script_dir}/.." && pwd)
sandbox_dir="${repo_root}/sandbox"

remote=""
branch=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --remote)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      remote="$2"
      shift 2
      ;;
    --branch)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      branch="$2"
      shift 2
      ;;
    *)
      echo "seed-sandbox: unexpected argument \"$1\"" >&2
      echo "${USAGE}" >&2
      exit "${EX_USAGE}"
      ;;
  esac
done

if [ -z "${remote}" ]; then
  echo "seed-sandbox: --remote is required" >&2
  echo "${USAGE}" >&2
  exit "${EX_USAGE}"
fi

if [ ! -d "${sandbox_dir}" ]; then
  echo "seed-sandbox: no sandbox content at ${sandbox_dir}" >&2
  exit 1
fi

# git with the documented harness identity supplied per command.
git_identified() {
  GIT_AUTHOR_NAME="${HARNESS_NAME}" \
  GIT_AUTHOR_EMAIL="${HARNESS_EMAIL}" \
  GIT_COMMITTER_NAME="${HARNESS_NAME}" \
  GIT_COMMITTER_EMAIL="${HARNESS_EMAIL}" \
  GIT_AUTHOR_DATE="${HARNESS_DATE}" \
  GIT_COMMITTER_DATE="${HARNESS_DATE}" \
  git "$@"
}

resolve_default_branch() {
  local symref
  symref=$(git ls-remote --symref "${remote}" HEAD 2>/dev/null | awk '$1 == "ref:" { print $2; exit }')
  if [ -n "${symref}" ]; then
    echo "${symref#refs/heads/}"
    return 0
  fi
  echo "main"
}

if [ -z "${branch}" ]; then
  branch=$(resolve_default_branch)
fi

work=$(mktemp -d)
cleanup() { rm -rf "${work}"; }
trap cleanup EXIT

git init --quiet "${work}"
git -C "${work}" remote add origin "${remote}"

# Fetch the branch when the remote already has it; an empty remote (the
# fresh scratch bare repo of local mode, or a just-created sandbox repo)
# leaves the branch unborn, which is the other supported starting state.
if git -C "${work}" fetch --quiet origin "${branch}" 2>/dev/null; then
  git -C "${work}" checkout --quiet -B "${branch}" FETCH_HEAD
else
  git -C "${work}" symbolic-ref HEAD "refs/heads/${branch}"
fi

# Copy the seed content in. Files the branch carries that the seed does
# not know about are left alone: the seed owns its own files, not the
# whole repository.
cp -R "${sandbox_dir}/." "${work}/"

git -C "${work}" add -A
if git -C "${work}" diff --cached --quiet; then
  echo "seed-sandbox: ${remote} branch ${branch} already carries the seed content, nothing to do"
  exit 0
fi

git_identified -C "${work}" commit --quiet -m "seed toy sandbox project content"
git -C "${work}" push --quiet origin "HEAD:refs/heads/${branch}"

seeded=$(git -C "${work}" rev-parse HEAD)
echo "seed-sandbox: pushed ${seeded} to ${remote} branch ${branch}"
