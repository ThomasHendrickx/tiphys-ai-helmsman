# Watch every check on a PR's CURRENT head to completion.
# THE FAILURE ARM IS WRITTEN FIRST. A non-200, an unparseable body and "no checks
# yet" are three DIFFERENT states and each prints as itself; a watcher that
# collapses them into silence is a guard that cannot go red.
PR="${1:?usage: prwatch.sh <pr-number>}"
API=https://api.github.com/repos/ThomasHendrickx/tiphys-ai-helmsman
echo "PRWATCH ARMED $(date -u +%H:%M:%S) on PR #$PR. Prints EVERY cycle, so its own silence means IT is dead."
N=0
while true; do
  N=$((N+1))
  P=$(curl -sS -w '\n%{http_code}' -H "Accept: application/vnd.github+json" "$API/pulls/$PR" 2>&1)
  C=$(printf '%s' "$P" | tail -1); J=$(printf '%s' "$P" | sed '$d')
  if [ "$C" != "200" ]; then echo "!! $(date -u +%H:%M:%S) HTTP $C on the pull endpoint. NOT a result."; sleep 60; continue; fi
  SHA=$(printf '%s' "$J" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).head.sha)}catch(e){console.log("")}})')
  # MERGEABILITY, because "no checks yet" and "no checks EVER" look identical.
  # Measured 2026-09-16 on #155: this watcher reported ABSENT for forty-five
  # minutes while a control pull request fired within seconds. The cause was
  # mergeable_state=dirty: GitHub does not run pull_request workflows when it
  # cannot compute the merge commit, so the run was never going to arrive.
  # A watcher that cannot distinguish "waiting" from "waiting forever" is the
  # T-008 shape again, so it reports the reason rather than only the absence.
  MS=$(printf '%s' "$J" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(String(j.mergeable_state))}catch(e){console.log("unknown")}})')
  if [ -z "$SHA" ]; then echo "!! $(date -u +%H:%M:%S) could not read head sha. NOT a result."; sleep 60; continue; fi
  R=$(curl -sS -H "Accept: application/vnd.github+json" "$API/commits/$SHA/check-runs" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const cs=(JSON.parse(s).check_runs)||[];
    if(cs.length===0){console.log("ABSENT no check runs for this sha yet");return}
    const pend=cs.filter(c=>c.status!=="completed");
    const bad=cs.filter(c=>c.status==="completed"&&c.conclusion!=="success"&&c.conclusion!=="neutral"&&c.conclusion!=="skipped");
    const line=cs.map(c=>c.name+"="+(c.conclusion||c.status)).join(" ");
    if(bad.length){console.log("FAILED "+line);return}
    if(pend.length){console.log("PENDING "+line);return}
    console.log("ALLGREEN "+line);}catch(e){console.log("UNPARSEABLE "+e.message)}})')
    case "$R" in
    ABSENT*)
      if [ "$MS" = "dirty" ]; then
        echo "!! $(date -u +%H:%M:%S) ${SHA:0:7} $R -- and mergeable_state=dirty, so NO RUN WILL EVER FIRE."
        echo "== $(date -u +%H:%M:%S) PR #$PR has a MERGE CONFLICT with its base. Resolve it; that is work now, ahead of CI."
        exit 3
      fi
      R="$R (mergeable_state=$MS)";;
  esac
  echo "   $(date -u +%H:%M:%S) ${SHA:0:7} $R"
  case "$R" in
    ALLGREEN*) echo "== $(date -u +%H:%M:%S) PR #$PR ALL CHECKS GREEN on ${SHA:0:7}."; exit 0;;
    FAILED*)   echo "== $(date -u +%H:%M:%S) PR #$PR has a FAILED check on ${SHA:0:7}. This is work now."; exit 1;;
  esac
  if [ "$N" -gt 45 ]; then echo "== $(date -u +%H:%M:%S) gave up after $N cycles with no terminal state. NOT a green."; exit 2; fi
  sleep 60
done
