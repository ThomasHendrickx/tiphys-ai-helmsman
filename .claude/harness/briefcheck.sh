# DISPATCH PRECONDITION: a brief that diagnoses must quarantine the diagnosis.
#
# WHY A GREP WAS TRIED AND ABANDONED. The first version flagged every causal
# word. It could not tell "the cause of THIS failure is X" (a guess about the
# world) from "assert by name because a count is a claim about every future
# addition" (a rule being explained). It fired on all five briefs, including the
# three that were correct. A check that cannot go green is as useless as one
# that cannot go red, and worse here because it trains the reader to skip it.
#
# WHAT IT REPLACES IT WITH. Diagnosis is quarantined by STRUCTURE. A brief that
# hands an agent a cause must carry the heading below, verbatim, and put every
# unverified cause under it. Then the agent cannot mistake a guess for a finding,
# because the heading says which it is.
#
# Measured 2026-09-17, the incident this exists for: the M4-P17 fix-round brief
# said "the orchestrator pushed several branches this session, so the number
# moved from 1 to 2", in the same register as the measured lines beside it. The
# fixture had no network remote, so it was impossible. The real cause was git
# 2.55's fetch.followRemoteHEAD creating an origin/HEAD symref that CHECK
# branches counted. The agent measured before accepting it; that is the only
# reason it cost nothing.
REQUIRED='MY HYPOTHESIS, UNVERIFIED'
DIAGNOSTIC='CI run [0-9]|AssertionError|failed in CI|passes locally|the failure|red in CI'
status=0
for f in "$@"; do
  b=$(basename "$f")
  if grep -qEi "$DIAGNOSTIC" "$f"; then
    if grep -qF "$REQUIRED" "$f"; then
      echo "OK        $b (diagnostic brief, hypothesis section present)"
    else
      echo "REFUSED   $b: hands the agent a failure to explain and carries no"
      echo "          '$REQUIRED' section. Every unverified cause goes under it,"
      echo "          with the instruction to test it first and report if it is wrong."
      status=1
    fi
  else
    echo "n/a       $b (no diagnosis handed over)"
  fi
done
exit $status
