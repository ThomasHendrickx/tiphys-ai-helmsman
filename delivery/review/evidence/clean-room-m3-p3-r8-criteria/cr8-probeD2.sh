S=/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad
export PATH=$S/toolchain/node-v26.6.0-linux-x64/bin:$PATH
cd $S/cr8-lab || exit 9
P=$S/cr8-PRISTINE-D.yaml; cp assurance-modes.yaml $P; PRE=$(md5sum assurance-modes.yaml|cut -d' ' -f1)
restore(){ cp $P assurance-modes.yaml; POST=$(md5sum assurance-modes.yaml|cut -d' ' -f1); echo "RESTORE pre=$PRE post=$POST match=$([ "$PRE" = "$POST" ] && echo YES || echo NO)"; }
trap restore EXIT
node --version
node -e '
const fs=require("fs");
let t=fs.readFileSync("assurance-modes.yaml","utf8");
const full=["intake","verification-pass","plan","adversarial-plan-review","implement","clean-room-review","fix-round","fix-round-verification","merge-on-green","deploy-verify","migration-verify","final-report"];
const i=t.indexOf("  - id: direct-pr"); const j=t.indexOf("  - id: local-only");
let dp=t.slice(i,j);
dp=dp.replace(/    pipeline:\n(      - [a-z-]+\n)+/, "    pipeline:\n"+full.map(s=>"      - "+s+"\n").join(""));
dp=dp.replace(/    skips:\n(      # [^\n]*\n|      - [a-z-]+\n)+/, "    skips: []\n    review-contracts:\n      - criteria\n      - hazard\n");
fs.writeFileSync("assurance-modes.yaml", t.slice(0,i)+dp+t.slice(j));'
echo "MUTATE_EXIT=$?"
node dist/bin/tiphys.js validate --type assurance-modes --context . assurance-modes.yaml > $S/pd.txt 2>&1; echo "VALIDATE_EXIT=$?"; cat $S/pd.txt
node dist/bin/tiphys.js mode show --mode direct-pr > $S/pd2.txt 2>&1; echo "SHOW_EXIT=$?"; sed -n '1,3p' $S/pd2.txt
