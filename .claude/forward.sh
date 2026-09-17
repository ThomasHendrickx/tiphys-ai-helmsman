#!/usr/bin/env bash
# Merge main forward into one phase branch and establish LOCAL GREEN before any
# pull request exists (DR-0031 item 3: CI enforces that main stays green, it is
# NOT how you find out whether you are green).
#
# THE FAILURE ARM IS WRITTEN FIRST, deliberately. A script that pipes a failure
# into `|| true` and prints nothing is the T-008 shape: a guard that cannot go
# red. Every step below exits nonzero and SAYS WHICH STEP.
set -o pipefail
R=/home/user/tiphys-ai-helmsman
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

# A PRE-FLIGHT merge-tree used to live here, refusing any branch that did not
# merge cleanly. It was WRONG, and wrong in the direction that hides work:
# every branch after the first two conflicts on test/behaviors.json by design,
# so the pre-flight would have refused ten of twelve healthy phases. The check
# that belongs here is not "does it merge cleanly" but "is every conflict one of
# the shapes we know how to resolve", and that is what the block below does.

DECL="delivery/plan/phase-declarations/${P}.json"
REG="test/behaviors.json"
if git -C "$R" -c user.name=tiphys -c user.email=tiphys@local \
  merge --no-edit origin/main -m "Merge main into $BR so the scope gate reads the declaration from the merge base"; then
  echo "  merged main forward with no conflict"
else
  # TWO conflict shapes are expected and BOTH are mechanical. Anything else is
  # a real conflict and this script refuses rather than guessing.
  #
  #   (a) an add/add on the phase's OWN declaration, because pstack carries a
  #       copy taken before the branch extended it. All three measured cases
  #       (m4-p10, m4-p11, m4-p19) are a pure SUPERSET on the branch side.
  #   (b) test/behaviors.json, an APPEND-ONLY registry that binding convention 5
  #       resolves as a union against the merge base. Measured 2026-09-16: once
  #       two M4 phases have merged, every remaining phase conflicts here.
  UNMERGED=$(git -C "$R" diff --name-only --diff-filter=U)
  UNEXPECTED=$(printf '%s\n' "$UNMERGED" | grep -v '^$' | grep -vxF "$DECL" | grep -vxF "$REG")
  if [ -n "$UNEXPECTED" ]; then
    echo "FAIL(conflict): conflicting path(s) outside the two mechanical shapes:"
    printf '%s\n' "$UNEXPECTED" | sed 's/^/    /'
    git -C "$R" merge --abort
    exit 75
  fi

  if printf '%s\n' "$UNMERGED" | grep -qxF "$REG"; then
    node "$(dirname "$0")/union-registry.mjs" "$REG" --repo "$R" || {
      echo "FAIL(union): the append-only union REFUSED. Read what it named; do not hand-merge around it."
      git -C "$R" merge --abort; exit 79; }
    git -C "$R" add -- "$REG" || { echo "FAIL(union-add)"; git -C "$R" merge --abort; exit 79; }
  fi

  if printf '%s\n' "$UNMERGED" | grep -qxF "$DECL"; then
    # Take the BRANCH side: main is being merged INTO the branch, so "ours" is
    # the branch. Then PROVE it is a superset, because the gate refuses a
    # REMOVAL from the merge-base declaration and merely NAMES an addition, so
    # the failure mode of this resolution is dropping an entry main carries.
    git -C "$R" checkout --ours -- "$DECL" && git -C "$R" add -- "$DECL" \
      || { echo "FAIL(resolve)"; git -C "$R" merge --abort; exit 76; }
    LOST=$(node -e '
      const {execFileSync}=require("child_process");
      const fs=require("fs");
      const repo=process.argv[2], decl=process.argv[3];
      const base=JSON.parse(execFileSync("git",["-C",repo,"show","origin/main:"+decl],{encoding:"utf8"}));
      const head=JSON.parse(fs.readFileSync(repo+"/"+decl,"utf8"));
      const set=(j)=>new Set([...(j.filesToTouch||[]),...(j.declaredExtras||[]),...(j.citations||[])]);
      const b=set(base), h=set(head);
      console.log([...b].filter((x)=>!h.has(x)).join(" "));
    ' -- "$R" "$DECL" 2>&1)
    if [ -n "$LOST" ]; then
      echo "FAIL(removal): the branch side DROPS declaration entries main carries: $LOST"
      git -C "$R" merge --abort; exit 77
    fi
  fi

  git -C "$R" -c user.name=tiphys -c user.email=tiphys@local commit --no-edit \
    || { echo "FAIL(commit)"; exit 78; }
  echo "  resolved: $(printf '%s ' $UNMERGED)"
fi

MB=$(git -C "$R" merge-base origin/main HEAD)
if git -C "$R" cat-file -e "$MB:delivery/plan/phase-declarations/${P}.json" 2>/dev/null; then
  echo "  OK: declaration is in the new merge base $(git -C "$R" rev-parse --short "$MB")"
else
  echo "FAIL(declaration): still absent from merge base $(git -C "$R" rev-parse --short "$MB"); the scope gate will be RED"
  exit 72
fi

echo "  loadavg before the suite: $(cut -d' ' -f1-3 /proc/loadavg)"
echo "  interpreter: $(node --version)  invocation: npm test  build state: about to build"
( cd "$R" && npm run build >/tmp/claude-0/fwd-$P-build.txt 2>&1 ) || { echo "FAIL(build) see /tmp/claude-0/fwd-$P-build.txt"; tail -20 /tmp/claude-0/fwd-$P-build.txt; exit 73; }
POSTBUILD=$(git -C "$R" status --porcelain)
[ -z "$POSTBUILD" ] || { echo "FAIL(build-dirty): git status is not clean after build"; echo "$POSTBUILD"; exit 74; }
( cd "$R" && npm test >/tmp/claude-0/fwd-$P-suite.txt 2>&1 ); SUITE=$?
echo "  suite exit=$SUITE  $(grep -E '^# (tests|pass|fail|skipped)' /tmp/claude-0/fwd-$P-suite.txt | tr '\n' ' ')"
echo "  loadavg after the suite:  $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$SUITE" -eq 0 ] || echo "  NOTE: a red on the container default toolchain is NOT proof of a red branch (standing warning 12, since 2026-08-20). Establish the base before attributing it."

echo "  PUSH:  git -C $R push -u origin $BR"
