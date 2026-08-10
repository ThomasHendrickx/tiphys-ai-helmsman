S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
export PATH=$S/toolchain/node-v26.6.0-linux-x64/bin:$PATH
cd $S/CRB9-head || exit 9
P=$S/CRB9-PRISTINE-WT.yaml; cp assurance-modes.yaml $P; PRE=$(md5sum assurance-modes.yaml|cut -d' ' -f1)
restore(){ cp $P assurance-modes.yaml; POST=$(md5sum assurance-modes.yaml|cut -d' ' -f1); echo "RESTORE pre=$PRE post=$POST match=$([ "$PRE" = "$POST" ] && echo YES || echo NO)"; echo "DIRTY=$(git status --porcelain | wc -l)"; }
trap restore EXIT
node --version
echo "=== GREEN ARM (shipped data untouched)"
node --test --test-name-pattern "un-downgraded process" test/assurance-modes.test.ts > $S/CRB9-succwit-green.tap 2>&1; echo "GREEN_EXIT=$?"; grep -E '^# (tests|pass|fail|skipped)' $S/CRB9-succwit-green.tap
echo "=== RED ARM (full honestly downgraded: deploy-verify moved to skips)"
node -e 'const fs=require("fs");let t=fs.readFileSync("assurance-modes.yaml","utf8");
const a="      - deploy-verify\n      - migration-verify\n      - final-report\n    skips: []\n";
if(!t.includes(a)){console.error("ANCHOR");process.exit(9);}
fs.writeFileSync("assurance-modes.yaml", t.replace(a,"      - migration-verify\n      - final-report\n    skips:\n      - deploy-verify\n"));'
echo "MUTATE_EXIT=$?"
node --test --test-name-pattern "un-downgraded process" test/assurance-modes.test.ts > $S/CRB9-succwit-red.tap 2>&1; echo "RED_EXIT=$?"; grep -E '^# (tests|pass|fail|skipped)' $S/CRB9-succwit-red.tap
grep -n "annotated as the un-downgraded process while declaring skips" $S/CRB9-succwit-red.tap | head -3
