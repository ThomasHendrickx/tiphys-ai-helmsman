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
while true; do
  N=$((N+1))
  BODY=$(curl -sS -w '\n%{http_code}' -H "Accept: application/vnd.github+json" "$API" 2>&1)
  CODE=$(printf '%s' "$BODY" | tail -1); JSON=$(printf '%s' "$BODY" | sed '$d')
  if [ "$CODE" != "200" ]; then
    echo "!! $(date -u +%H:%M:%S) HTTP $CODE. NOT a result: $(printf '%s' "$JSON" | head -c 200)"; sleep 60; continue
  fi
  # The run-id latch that used to live here followed ONE run and was therefore
  # the same defect in another form. The all-runs check below is evaluated fresh
  # each cycle; a listing that transiently drops the sha now reports ABSENT,
  # which is honest, rather than a green about one workflow.
  R=$(printf '%s' "$JSON" | SHA="$SHA" node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const j=JSON.parse(s);const rs=(j.workflow_runs||[]).filter(x=>x.head_sha===process.env.SHA);
    if(rs.length===0){console.log("ABSENT no push run listed for this sha yet (the runs endpoint has served stale state here before)");return;}
    const label=rs.map(r=>r.name+"="+(r.conclusion||r.status)).join(" ");
    const bad=rs.filter(r=>r.status==="completed"&&r.conclusion!=="success"&&r.conclusion!=="skipped"&&r.conclusion!=="neutral");
    const pend=rs.filter(r=>r.status!=="completed");
    if(bad.length){console.log("completed FAILED ["+label+"]");return}
    if(pend.length){console.log("in_progress pending ["+label+"]");return}
    console.log("completed success ["+label+"]");}
    catch(e){console.log("UNPARSEABLE "+e.message)}})' 2>&1)
  echo "   $(date -u +%H:%M:%S) $R"
  case "$R" in
    completed\ success*) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN GREEN on $SHA. The merge is complete under T-009."; exit 0;;
    completed\ *) echo "== $(date -u +%H:%M:%S) POST-MERGE PUSH RUN NOT GREEN on $SHA: $R. main is RED. This is work now."; exit 1;;
  esac
  if [ "$N" -gt 40 ]; then echo "== $(date -u +%H:%M:%S) gave up after $N cycles without a terminal state. NOT a green."; exit 2; fi
  sleep 60
done
