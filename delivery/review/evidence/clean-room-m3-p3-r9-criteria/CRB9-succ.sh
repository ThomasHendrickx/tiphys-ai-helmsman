S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
export PATH=$S/toolchain/node-v26.6.0-linux-x64/bin:$PATH
cd $S/CRB9-inst || exit 9
P=$S/CRB9-PRISTINE-4.yaml; cp assurance-modes.yaml $P; PRE=$(md5sum assurance-modes.yaml|cut -d' ' -f1)
restore(){ cp $P assurance-modes.yaml; POST=$(md5sum assurance-modes.yaml|cut -d' ' -f1); echo "RESTORE pre=$PRE post=$POST match=$([ "$PRE" = "$POST" ] && echo YES || echo NO)"; }
trap restore EXIT
node --version
# HONESTLY-DECLARED DOWNGRADE OF full: deploy-verify leaves the pipeline AND is declared in skips.
node -e 'const fs=require("fs");let t=fs.readFileSync("assurance-modes.yaml","utf8");
const a="      - deploy-verify\n      - migration-verify\n      - final-report\n    skips: []\n";
if(!t.includes(a)){console.error("ANCHOR");process.exit(9);}
fs.writeFileSync("assurance-modes.yaml", t.replace(a,"      - migration-verify\n      - final-report\n    skips:\n      - deploy-verify\n"));'
echo "MUTATE_EXIT=$?"
node dist/bin/tiphys.js validate --type assurance-modes --context . assurance-modes.yaml > $S/CRB9-succ-val.txt 2>&1; echo "VALIDATE_EXIT=$?"; cat $S/CRB9-succ-val.txt
node dist/bin/tiphys.js mode show --mode full > $S/CRB9-succ-show.txt 2>&1; echo "SHOW_EXIT=$?"; sed -n '1,2p' $S/CRB9-succ-show.txt
echo "--- skips section:"; sed -n '/^skips:/,/^gate-sets:/p' $S/CRB9-succ-show.txt
