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
# `the failure` WAS IN THIS LIST AND IS REMOVED, measured 2026-09-17.
#
# It fired on the wave-12 dispatch brief, whose only match was the phrase
# "a reason naming the failure" -- a QUOTE OF THE PLAN'S OWN CRITERION about
# what a gate should print, not a diagnosis handed to an agent. That is a false
# refusal, and a check that refuses correct work trains its reader to skip it.
#
# The narrowing is measured rather than judged. Across every dispatch brief in
# this milestone, which phrase each one matched:
#
#   m4-p17-r1.js   AssertionError, red in CI   <- a real diagnosis, no marker: REFUSE
#   m4-p2-r4.js    AssertionError              <- a real diagnosis, no marker: REFUSE
#   m4-p29-r1.js   AssertionError              <- a real diagnosis WITH marker: PASS
#   m4-p1-r1.js    (none)
#   m4-wave8..11   (none)
#   m4-wave12.js   the failure                 <- the false positive
#
# Neither case this check exists to catch matches on `the failure`, so removing
# it costs nothing measured and removes the one false refusal. THAT IS A CLAIM
# ABOUT THE BRIEFS WRITTEN SO FAR, not a proof: if a future brief hands over a
# diagnosis phrased only as "the failure", this list is where it goes back.
DIAGNOSTIC='CI run [0-9]|AssertionError|failed in CI|passes locally|red in CI'
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
