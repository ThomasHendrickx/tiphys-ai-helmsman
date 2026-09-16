# T-009 rule 1: a merge is not complete until the post-merge `push` run on the
# NEW main head is observed to completion. Not the PR check on the branch: the
# run whose head sha is the new tip. main was red for four hours and twenty-one
# minutes once while every pull-request check was green.
#
# THE FAILURE ARM IS WRITTEN FIRST. A non-200, an unparseable body, and "no run
# exists yet for this sha" are three DIFFERENT states and each is printed as
# itself. A watcher that collapses them into silence is a guard that cannot go
# red, which is the shape this repository has recorded six times.
SHA="${1:?usage: pushwatch.sh <head-sha>}"
API="https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/actions/runs?event=push&branch=main&per_page=15"
echo "PUSHWATCH ARMED $(date -u +%H:%M:%S) for main head $SHA. Prints EVERY cycle."
echo "  A run that does not exist yet is reported as ABSENT, never as quiet."
N=0
RUNID=""
while true; do
  N=$((N+1))
  BODY=$(curl -sS -w '\n%{http_code}' -H "Accept: application/vnd.github+json" "$API" 2>&1)
  CODE=$(printf '%s' "$BODY" | tail -1); JSON=$(printf '%s' "$BODY" | sed '$d')
  if [ "$CODE" != "200" ]; then
    echo "!! $(date -u +%H:%M:%S) HTTP $CODE. NOT a result: $(printf '%s' "$JSON" | head -c 200)"; sleep 60; continue
  fi
  # LATCH THE RUN ID. The listing endpoint is eventually consistent and HAS
  # dropped a run it had already returned: measured 2026-09-16, this watcher
  # reported id=35101638428 twice and then ABSENT, while a direct read of that
  # same id said "completed success". A watcher that can lose its subject cannot
  # go red about it, which is the shape this file exists to avoid. So once the
  # id is known, poll the RUN, never the listing.
  if [ -n "$RUNID" ]; then
    RB=$(curl -sS -w '\n%{http_code}' -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman/actions/runs/$RUNID" 2>&1)
    RC=$(printf '%s' "$RB" | tail -1); RJ=$(printf '%s' "$RB" | sed '$d')
    if [ "$RC" != "200" ]; then
      echo "!! $(date -u +%H:%M:%S) HTTP $RC reading latched run $RUNID. NOT a result."; sleep 60; continue
    fi
    R=$(printf '%s' "$RJ" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const j=JSON.parse(s);console.log(j.status+" "+(j.conclusion===null?"pending":j.conclusion)+" id="+j.id)}
      catch(e){console.log("UNPARSEABLE "+e.message)}})' 2>&1)
    echo "   $(date -u +%H:%M:%S) $R (latched)"
    case "$R" in
      completed\ success*) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN GREEN on $SHA. The merge is complete under T-009."; exit 0;;
      completed\ *) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN NOT GREEN on $SHA: $R. main is RED. This is work now."; exit 1;;
    esac
    sleep 60; continue
  fi

  R=$(printf '%s' "$JSON" | SHA="$SHA" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);const r=(j.workflow_runs||[]).find(x=>x.head_sha===process.env.SHA);
    if(!r){console.log("ABSENT no push run listed for this sha yet (the runs endpoint has served stale state here before)");return;}
    console.log((r.status)+" "+(r.conclusion===null?"pending":r.conclusion)+" id="+r.id);}
    catch(e){console.log("UNPARSEABLE "+e.message)}})' 2>&1)
  echo "   $(date -u +%H:%M:%S) $R"
  case "$R" in
    *id=*) RUNID=$(printf '%s' "$R" | sed 's/.*id=//');;
  esac
  case "$R" in
    completed\ success*) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN GREEN on $SHA. The merge is complete under T-009."; exit 0;;
    completed\ *) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN NOT GREEN on $SHA: $R. main is RED. This is work now."; exit 1;;
  esac
  if [ "$N" -gt 40 ]; then echo "== $(date -u +%H:%M:%S) gave up after $N cycles without a terminal state. NOT a green."; exit 2; fi
  sleep 60
done
