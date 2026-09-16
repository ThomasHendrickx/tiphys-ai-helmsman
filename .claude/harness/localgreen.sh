#!/bin/bash
# Local green under DR-0031. Args: <worktree-dir> <label>
W="$1"; L="$2"
export PATH=/tmp/claude-0/n26/bin:$PATH

# GRANT TRAVERSAL EXPLICITLY, AND RESTORE IT EVEN ON FAILURE.
#
# test/gates.test.ts's runCliUnprivileged drops to an unprivileged uid and spawns
# process.execPath. Here BOTH the checkout and the fetched Node 26 interpreter
# live under /tmp/claude-0, which the container creates 0700, so that uid cannot
# traverse to either and the spawn fails with ERR_MODULE_NOT_FOUND on the
# repository's own source.
#
# The suite has a helper that grants exactly these bits, but only for the path it
# is handed, and it only ever ADDS bits. A test handed a mkdtemp fixture grants
# for that fixture and not for /tmp/claude-0, so whether it succeeds depends on
# whether some OTHER test rooted under /tmp/claude-0 has already run. That is an
# ordering dependency, and it is why the failure looks like a flake and why
# re-running "fixes" it: the first run that reaches the grant leaves the
# directory open for every run after it.
#
# Measured 2026-09-16, one variable: mode 700 gives exit 1, mode 705 gives exit 0.
# Granting here makes the run deterministic; the trap restores the container
# default whether the suite passes, fails, or the script is interrupted.
SCRATCH_ROOT=/tmp/claude-0
if [ -d "$SCRATCH_ROOT" ]; then
  SCRATCH_MODE_BEFORE=$(stat -c '%a' "$SCRATCH_ROOT")
  trap 'chmod "$SCRATCH_MODE_BEFORE" "$SCRATCH_ROOT" 2>/dev/null' EXIT INT TERM
  chmod o+rx "$SCRATCH_ROOT"
  echo "granted traversal on $SCRATCH_ROOT (was $SCRATCH_MODE_BEFORE); it is restored on exit"
fi
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
