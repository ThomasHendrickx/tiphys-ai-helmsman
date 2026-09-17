#!/bin/bash
# RED WITNESS for the union script's three-way rule.
#
# THE FIRST VERSION OF THIS FIXTURE WAS WORTHLESS AND THE REASON IS THE POINT.
# It changed the registry on ONE side only, so git merged it cleanly, there were
# no index stages, and the script exited 65 "not in a three-way conflict" on BOTH
# members. A witness that never reaches the code under test is green-or-red for
# reasons unrelated to the property. The real case always has a conflict for some
# OTHER reason: both sides APPEND different new rows at the same place, which is
# a textual conflict and not a value collision, and the one-sided edit rides
# along inside it. That is what this builds.
set -u
export PATH=/tmp/claude-0/n26/bin:$PATH
SCRIPT="${1:?usage: union-witness.sh <path-to-union-registry.mjs>}"
G=(-c user.name=t -c user.email=t@l -c commit.gpgsign=false)
run_member() {  # $1 label  $2 ours-value-for-k  $3 theirs-value-for-k  $4 expectation
  local L="$1" OURS="$2" THEIRS="$3" EXP="$4" D OUT EX
  D=$(mktemp -d /tmp/claude-0/uw-XXXXXX)
  git init -q -b main "$D"; cd "$D" || return 1
  printf '{\n  "k": "BASE",\n  "z": "stable"\n}\n' > r.json
  git add r.json; git "${G[@]}" commit -qm base
  git branch -q side
  printf '{\n  "k": "%s",\n  "z": "stable",\n  "only-ours": "row"\n}\n' "$OURS" > r.json
  git add r.json; git "${G[@]}" commit -qm ours
  git checkout -q side
  printf '{\n  "k": "%s",\n  "z": "stable",\n  "only-theirs": "row"\n}\n' "$THEIRS" > r.json
  git add r.json; git "${G[@]}" commit -qm theirs
  git checkout -q main
  git "${G[@]}" merge --no-edit side >/dev/null 2>&1
  local STAGES; STAGES=$(git ls-files -u r.json | wc -l)
  OUT=$(node "$SCRIPT" r.json --repo "$D" 2>&1); EX=$?
  echo "--- $L  (index stages: $STAGES, so the script really ran)  exit=$EX   EXPECT $EXP"
  echo "$OUT" | sed 's/^/    /'
  echo "    k in result: $(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("r.json","utf8")).k)}catch(e){console.log("(unparseable: conflict markers left in place)")}')"
  cd /tmp/claude-0 || true
}
echo "=== MEMBER A: k is ours==base, theirs edited. EXPECT exit 0, k=THEIRS-NEW"
run_member A BASE THEIRS-NEW "exit 0, k=THEIRS-NEW"
echo
echo "=== MEMBER B: k is theirs==base, ours edited. EXPECT exit 0, k=OURS-NEW"
run_member B OURS-NEW BASE "exit 0, k=OURS-NEW"
echo
echo "=== CONTROL C: both edited k differently. EXPECT exit 69, refusal"
run_member C OURS-NEW THEIRS-NEW "exit 69, refusal"
