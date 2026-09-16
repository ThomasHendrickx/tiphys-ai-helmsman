#!/bin/bash
# Local green under DR-0031. Args: <worktree-dir> <label>
W="$1"; L="$2"
export PATH=/tmp/claude-0/n26/bin:$PATH
cd "$W" || { echo "FAIL(cd)"; exit 1; }
echo "== $L =="
echo "node $(node --version)  npm $(npm --version)"
echo "head $(git log --oneline -1)"
echo "-- npm ci --"
npm ci >/tmp/claude-0/$L.ci.log 2>&1; echo "npm ci exit=$?"
echo "-- npm run build --"
npm run build >/tmp/claude-0/$L.build.log 2>&1; echo "build exit=$?"
echo "-- git status after build --"
git status --short | tee /tmp/claude-0/$L.status.log | wc -l | sed 's/^/dirty lines: /'
echo "-- node --test (npm test invocation) --"
npm test >/tmp/claude-0/$L.test.log 2>&1; echo "npm test exit=$?"
grep -E '^# (tests|pass|fail|skipped|cancelled)' /tmp/claude-0/$L.test.log
echo "-- authored bytes --"
node scripts/check-authored-bytes.mjs >/tmp/claude-0/$L.bytes.log 2>&1; echo "authored-bytes exit=$?"
echo "== $L DONE =="
