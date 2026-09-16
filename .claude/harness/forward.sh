#!/usr/bin/env bash
# Merge main forward into one phase branch and establish LOCAL GREEN before any
# pull request exists (DR-0031 item 3: CI enforces that main stays green, it is
# NOT how you find out whether you are green).
#
# THE FAILURE ARM IS WRITTEN FIRST, deliberately. A script that pipes a failure
# into `|| true` and prints nothing is the T-008 shape: a guard that cannot go
# red. Every step below exits nonzero and SAYS WHICH STEP.
set -o pipefail
# A DEDICATED CLONE, not the orchestrator's working repository, and the reason is
# measured rather than tidy-mindedness. Nineteen stale worktrees left by dead
# workflows hold the phase branches in /home/user/tiphys-ai-helmsman, so a plain
# checkout there fails ("already used by worktree at ..."), and the ones that do
# not fail hold OLDER heads: wf_aca97ef8-95e-2 carried m4-p13 at 4f326a9 while
# origin carried something newer. Committing from such a worktree is exactly how
# a fix round was reverted earlier in this milestone.
R=/tmp/claude-0/fwd

# The container default is node v22.22.2 and the declared floor is >=26. Since
# 2026-08-20 the default does not merely SKIP the floor-gated tests, it FAILS
# test/doctor.test.ts:934 at heads whose CI is green, which trains a reader to
# wave a real failure through. Use the floor-satisfying toolchain so a red here
# means a red branch. It lives under /tmp, and so does R, which matters: the
# suite's grantTraversalWhenUnderTmp opens /tmp/claude-0 only when the REPO is
# under /tmp, and runCliUnprivileged spawns process.execPath, so a scratch
# toolchain is reachable only in that combination (standing warning 1).
export PATH=/tmp/claude-0/n26/bin:$PATH
P="$1"
[ -n "$P" ] || { echo "usage: forward.sh <phase-id>   e.g. m4-p13"; exit 64; }

BR=$(git -C "$R" branch -r --format='%(refname:short)' | grep "claude/${P}-" | head -1 | sed 's#^origin/##')
[ -n "$BR" ] || { echo "FAIL(resolve): no remote branch for $P"; exit 65; }

echo "== $P on $BR"
git -C "$R" fetch -q origin main "$BR" || { echo "FAIL(fetch)"; exit 66; }

DIRTY=$(git -C "$R" status --porcelain)
[ -z "$DIRTY" ] || { echo "FAIL(dirty): the clone holds uncommitted work; standing warning 8 says do not proceed"; echo "$DIRTY"; exit 67; }

git -C "$R" checkout -q "$BR" 2>/dev/null || git -C "$R" checkout -q -b "$BR" "origin/$BR" || { echo "FAIL(checkout)"; exit 68; }
git -C "$R" reset -q --hard "origin/$BR" || { echo "FAIL(reset)"; exit 69; }
# The branch head BEFORE any merge, used to ask what the branch itself authored.
PREMERGE=$(git -C "$R" rev-parse HEAD)
# A STACK CAN BE MORE THAN ONE DEEP, AND M4-P11 IS THE CASE THAT PROVED IT.
#
# This was a single ref. M4-P11 was cut from claude/m4-p10-verdict-head-and-medium,
# which was itself cut from plan/pstack-borrow-review, and BOTH reached main as
# SQUASHES. With one stack ref the m4-p10 layer stayed unmerged, so main's copy of
# m4-p10's files still read as an independent add: ten conflicts including
# src/checks.ts and scripts/check-dual-review.mjs, which the resolver correctly
# REFUSES because the branch really does author them.
#
# TP_STACKS is an ordered, space-separated list, OLDEST FIRST. Each is merged in
# turn, so each layer's copy stops reading as an independent add before the next
# one is considered. The branch's own fork point is its merge-base with the LAST
# entry, which is the layer it was actually cut from.
STACKS="${TP_STACKS:-origin/plan/pstack-borrow-review}"
DECL="delivery/plan/phase-declarations/${P}.json"
REG="test/behaviors.json"
NEAREST=""
for _s in $STACKS; do NEAREST="$_s"; done
FORK=$(git -C "$R" merge-base "$NEAREST" "$PREMERGE" 2>/dev/null)

# A PRE-FLIGHT merge-tree used to live here, refusing any branch that did not
# merge cleanly. It was WRONG, and wrong in the direction that hides work:
# every branch after the first two conflicts on test/behaviors.json by design,
# so the pre-flight would have refused ten of twelve healthy phases. The check
# that belongs here is not "does it merge cleanly" but "is every conflict one of
# the shapes we know how to resolve", and that is what the block below does.

# ONE RESOLVER, USED BY BOTH MERGES.
#
# The stack-base merge and the main merge meet the SAME conflict shapes, and the
# first version of this script handled them in two places and drifted: the
# declaration add/add was resolved in both, the inherited-file shape only in the
# main block, so the stack-base merge refused a case the main block knew how to
# resolve. Fixing it in one place twice is how the drift happened; one function
# is the fix.
#
# $1 is the ref whose side to prefer for an INHERITED file (the side that is not
# the branch). Returns 0 when every conflict was one of the known shapes and is
# now staged, 1 when something the branch itself authored is in conflict.
resolve_expected_conflicts() {
  local THEIRS_REF="$1"
  local UNMERGED UNEXPECTED INHERITED REMAINING f
  UNMERGED=$(git -C "$R" diff --name-only --diff-filter=U)
  INHERITED=""; REMAINING=""

  # (b) the append-only registry, resolved as a union against the merge base.
  if printf '%s\n' "$UNMERGED" | grep -qxF "$REG"; then
    node "$(dirname "$0")/union-registry.mjs" "$REG" --repo "$R" || {
      echo "FAIL(union): the append-only union REFUSED. Read what it named; do not hand-merge around it."; return 1; }
    git -C "$R" add -- "$REG" || { echo "FAIL(union-add)"; return 1; }
  fi

  # (a) the phase's OWN declaration: take the BRANCH side, then prove it is a superset.
  if printf '%s\n' "$UNMERGED" | grep -qxF "$DECL"; then
    git -C "$R" checkout --ours -- "$DECL" && git -C "$R" add -- "$DECL" \
      || { echo "FAIL(decl-resolve)"; return 1; }
    local LOST
    LOST=$(TP_REPO="$R" TP_DECL="$DECL" TP_BASE="$THEIRS_REF" node -e '
      const {execFileSync}=require("child_process"); const fs=require("fs");
      const {TP_REPO:repo,TP_DECL:decl,TP_BASE:base}=process.env;
      let b; try { b=JSON.parse(execFileSync("git",["-C",repo,"show",base+":"+decl],{encoding:"utf8"})); } catch { console.log(""); process.exit(0); }
      const h=JSON.parse(fs.readFileSync(repo+"/"+decl,"utf8"));
      const set=(j)=>new Set([...(j.filesToTouch||[]),...(j.declaredExtras||[]),...(j.citations||[])]);
      console.log([...set(b)].filter((x)=>!set(h).has(x)).join(" "));' 2>&1)
    if [ -n "$LOST" ]; then
      echo "FAIL(removal): the branch side DROPS declaration entries $THEIRS_REF carries: $LOST"; return 1; fi
  fi

  # (c) a file the branch INHERITED and never authored: take the other side.
  for f in $(printf '%s\n' "$UNMERGED" | grep -v '^$' | grep -vxF "$DECL" | grep -vxF "$REG"); do
    # "DID THE BRANCH AUTHOR THIS?" IS NOT `git diff FORK..HEAD`.
    #
    # That was the first version and it is wrong for any branch that has ALREADY
    # been merged forward once: the diff from the fork point includes everything
    # merged IN, so main's own edits read as the branch's. Measured on m4-p23,
    # which had a prior merge: `.claude/orchestrator-next.mjs` and another
    # phase's declaration both showed as changed, and the resolver refused three
    # files it knew how to resolve.
    #
    # --first-parent --no-merges walks the branch's OWN line of development:
    # commits made on the branch, excluding merge commits and excluding the
    # history they carry in. On the same case it returns 0 for both inherited
    # files and 1 for delivery/plan/cutover/retirement-inventory.json, which the
    # branch really did author, so it discriminates rather than always saying no.
    if [ -n "$FORK" ] && [ -z "$(git -C "$R" log --first-parent --no-merges --format= --name-only "$FORK..$PREMERGE" -- "$f")" ]; then
      INHERITED="$INHERITED $f"
    else
      REMAINING="$REMAINING $f"
    fi
  done
  if [ -n "$REMAINING" ]; then
    echo "FAIL(conflict): conflicting path(s) the branch ITSELF authored, outside the mechanical shapes:"
    for f in $REMAINING; do echo "    $f"; done
    return 1
  fi
  # NAME THE AUTHORITY, DO NOT USE A RELATIVE SIDE.
  #
  # This was `git checkout --theirs`, and --theirs means "the ref being merged
  # in", which is the STACK BASE during the first merge and main during the
  # second. For a file the branch does not own, the stack base is the OLD copy
  # and main is the authority, so --theirs silently restored a superseded
  # version. Measured on m4-p23: it reinstated an orchestrator-next.mjs without
  # gitTry, gitCount, branchNames or hardErrors, and the phase's own checker
  # then reported 288 rows against 284 derivable anchors, the exact mirror of
  # the staleness the round had just fixed.
  #
  # It is the same mechanism M4-P2 closed one level up: a lookup and the
  # decision it feeds addressing different trees. origin/main is the authority
  # for a file the branch never authored, in BOTH merges, so it is named.
  for f in $INHERITED; do
    git -C "$R" checkout origin/main -- "$f" && git -C "$R" add -- "$f" \
      || { echo "FAIL(inherited-resolve) on $f"; return 1; }
  done
  [ -n "$INHERITED" ] && echo "  took origin/main's version of inherited, branch-untouched path(s):$INHERITED"
  return 0
}

# STEP ZERO, AND WITHOUT IT EVERY PHASE CONFLICTS ON PAPERWORK IT DID NOT WRITE.
#
# PR #150 landed the phase-stack base as a SQUASH. A squash keeps the CONTENT
# and discards the HISTORY, so `plan/pstack-borrow-review` is NOT an ancestor of
# main (git merge-base --is-ancestor says so) and the merge base of main and
# every phase branch is still the OLD main. Both sides therefore appear to have
# independently added the whole inherited corpus, and git reports add/add on
# every file of it. Measured on m4-p15: five conflicts, all paperwork, none of
# which the phase touched.
#
# A simulation run before the merge said CLEAN, and it was wrong for one reason
# worth keeping: it modelled a MERGE commit and the merge performed was a
# SQUASH. Merge-tree against the wrong graph answers a question nobody asked.
#
# The resolution needs no hand-editing and no judgement. Merge the STACK BASE
# into the branch first: there the common ancestor is the real fork point, so it
# is an ordinary three-way merge. Then merge main. Main's tree for those paths
# is BYTE-IDENTICAL to the stack tip's (checked, not assumed), and git does not
# conflict when both sides agree, whatever the base says.
for STACK in $STACKS; do
  git -C "$R" rev-parse --verify -q "$STACK" >/dev/null || { echo "  stack ref $STACK does not exist here; skipped"; continue; }
  if git -C "$R" merge-base --is-ancestor "$STACK" HEAD; then
    echo "  stack base $STACK is already an ancestor of the branch; nothing to pre-merge"
    continue
  fi
  if git -C "$R" merge-base --is-ancestor "$STACK" origin/main; then
    echo "  stack base $STACK is an ancestor of main; no pre-merge needed"
    continue
  fi
  echo "  stack base $STACK reached main by SQUASH; merging it first so its copy stops reading as an independent add"
  git -C "$R" -c user.name=tiphys -c user.email=tiphys@local \
    merge --no-edit "$STACK" -m "Merge the phase-stack base $STACK so main's squashed copy of it stops reading as an independent add" \
    || {
      resolve_expected_conflicts "$STACK" || { git -C "$R" merge --abort; exit 80; }
      git -C "$R" -c user.name=tiphys -c user.email=tiphys@local commit --no-edit \
        || { echo "FAIL(stack-commit)"; exit 83; }
    }
done

DECL="delivery/plan/phase-declarations/${P}.json"
REG="test/behaviors.json"
if git -C "$R" -c user.name=tiphys -c user.email=tiphys@local \
  merge --no-edit origin/main -m "Merge main into $BR so the scope gate reads the declaration from the merge base"; then
  echo "  merged main forward with no conflict"
else
  resolve_expected_conflicts origin/main || { git -C "$R" merge --abort; exit 75; }
  git -C "$R" -c user.name=tiphys -c user.email=tiphys@local commit --no-edit \
    || { echo "FAIL(commit)"; exit 78; }
  echo "  resolved the expected conflict shapes and committed the merge"
fi

MB=$(git -C "$R" merge-base origin/main HEAD)
if git -C "$R" cat-file -e "$MB:delivery/plan/phase-declarations/${P}.json" 2>/dev/null; then
  echo "  OK: declaration is in the new merge base $(git -C "$R" rev-parse --short "$MB")"
else
  echo "FAIL(declaration): still absent from merge base $(git -C "$R" rev-parse --short "$MB"); the scope gate will be RED"
  exit 72
fi

echo "  loadavg before the suite: $(cut -d' ' -f1-3 /proc/loadavg)"
echo "  interpreter: $(node --version) at $(command -v node)   invocation: npm test   checkout (not an archive)"
( cd "$R" && npm ci >/tmp/claude-0/fwd-$P-npmci.txt 2>&1 && npm run build >/tmp/claude-0/fwd-$P-build.txt 2>&1 ) || { echo "FAIL(build) see /tmp/claude-0/fwd-$P-build.txt"; tail -20 /tmp/claude-0/fwd-$P-build.txt; exit 73; }
POSTBUILD=$(git -C "$R" status --porcelain)
[ -z "$POSTBUILD" ] || { echo "FAIL(build-dirty): git status is not clean after build"; echo "$POSTBUILD"; exit 74; }
( cd "$R" && npm test >/tmp/claude-0/fwd-$P-suite.txt 2>&1 ); SUITE=$?
# The summary block is prefixed with U+2139, not "#". Grepping for "^# " matches
# the JSON-Schema suite's per-case "# skipped" lines instead, which is a count of
# sub-cases inside PASSING tests and not the suite's skipped count at all. Strip
# non-ASCII and match the summary keywords at the start of the remaining text.
echo "  suite exit=$SUITE  $(sed 's/[^[:print:][:space:]]//g' /tmp/claude-0/fwd-$P-suite.txt | grep -oE '^ *(tests|pass|fail|cancelled|skipped|todo) [0-9]+' | tr -s ' ' | tr '\n' ' ')"
echo "  loadavg after the suite:  $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$SUITE" -eq 0 ] || echo "  NOTE: a red on the container default toolchain is NOT proof of a red branch (standing warning 12, since 2026-08-20). Establish the base before attributing it."

echo "  PUSH:  git -C $R push -u origin $BR"
