#!/bin/bash
set -e
S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
I=$S/cr8-inst
rm -rf $I; mkdir -p $I/delivery
cp -r $S/cr8-lab/dist $I/
cp -r $S/cr8-lab/schemas $I/
cp -r $S/cr8-lab/delivery/decisions $I/delivery/
cp $S/cr8-lab/gate-registry.yaml $S/cr8-lab/assurance-modes.yaml $S/cr8-lab/role-model-config.yaml $S/cr8-lab/package.json $I/
cp -r $S/cr8-lab/templates $I/
