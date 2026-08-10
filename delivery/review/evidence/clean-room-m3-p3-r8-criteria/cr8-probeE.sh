S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
export PATH=$S/toolchain/node-v26.6.0-linux-x64/bin:$PATH
cd $S/cr8-lab || exit 9
P=$S/cr8-PRISTINE-E.yaml; cp assurance-modes.yaml $P; PRE=$(md5sum assurance-modes.yaml|cut -d' ' -f1)
restore(){ cp $P assurance-modes.yaml; POST=$(md5sum assurance-modes.yaml|cut -d' ' -f1); echo "RESTORE pre=$PRE post=$POST match=$([ "$PRE" = "$POST" ] && echo YES || echo NO)"; }
trap restore EXIT
node --version
# full keeps its entire twelve-stage pipeline; only skips[] gains an entry it does not omit
node -e 'const fs=require("fs");let t=fs.readFileSync("assurance-modes.yaml","utf8");
const a="    skips: []\n";
if(!t.includes(a)){console.error("ANCHOR");process.exit(9);}
fs.writeFileSync("assurance-modes.yaml", t.replace(a,"    skips:\n      - deploy-verify\n"));'
echo "MUTATE_EXIT=$?"
grep -n -A2 "^    skips:" assurance-modes.yaml | head -6
node dist/bin/tiphys.js validate --type assurance-modes --context . assurance-modes.yaml > $S/pe.txt 2>&1; echo "VALIDATE_EXIT=$?"; cat $S/pe.txt
node dist/bin/tiphys.js mode show --mode full > $S/pe2.txt 2>&1; echo "SHOW_EXIT=$?"; sed -n '1,2p' $S/pe2.txt
