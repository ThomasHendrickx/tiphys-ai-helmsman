#!/bin/bash
S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
export PATH=$S/toolchain/node-v26.6.0-linux-x64/bin:$PATH
cd $S/cr8-lab || exit 9
P=$S/cr8-PRISTINE-assurance-modes.yaml
cp assurance-modes.yaml $P
PRE=$(md5sum assurance-modes.yaml | cut -d' ' -f1)
restore(){ cp $P assurance-modes.yaml; POST=$(md5sum assurance-modes.yaml | cut -d' ' -f1); echo "RESTORE pre=$PRE post=$POST match=$([ "$PRE" = "$POST" ] && echo YES || echo NO)"; }
trap restore EXIT
node --version
echo "GREEN CONTROL:"
node --test --test-name-pattern "full's escalation response is the fresh implementer" test/assurance-modes.test.ts > $S/cr8-oe-green.txt 2>&1; echo "GREEN_EXIT=$?"
grep -E '^# (tests|pass|fail)' $S/cr8-oe-green.txt
sed -i 's/on-exceeded: fresh-implementer-and-third-contract/on-exceeded: escalate-to-owner/' assurance-modes.yaml
echo "MUTATED md5=$(md5sum assurance-modes.yaml | cut -d' ' -f1)"; grep -n "on-exceeded" assurance-modes.yaml
echo "RED RUN:"
node --test --test-name-pattern "full's escalation response is the fresh implementer" test/assurance-modes.test.ts > $S/cr8-oe-red.txt 2>&1; echo "RED_EXIT=$?"
grep -E '^# (tests|pass|fail)' $S/cr8-oe-red.txt
