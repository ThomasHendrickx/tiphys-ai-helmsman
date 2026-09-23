#!/usr/bin/env bash
#
# RELEASE VERIFICATION FOR THE KERNEL ITSELF (kernel plan M3, M3-P10 step 5 and
# criterion 5; SC-011's kernel analogue of deploy verification; section 4 stage
# E4.3).
#
# It answers one question: does the artifact a consumer would actually install
# work, from a tree that is not this repository. Install the package, import it,
# run its bin, and validate a template copied out of the install against a
# schema copied out of the same install. Every command is recorded as a JSON
# evidence record with its exit code.
#
# THE PART THAT IS NOT DECORATION: THE RESOLVED PATH.
#
# The plan's hazard table names "a release-verify script run from a directory
# that still has the SOURCE TREE on its resolution path, so it witnesses the
# repository rather than the install"
# (delivery/plan/kernel-plan-m3.md:4820), and it names the residue honestly:
# "clean" is a property of the environment the script is invoked in, not of the
# script, so a criterion cannot fully own it. Criterion 5's answer is that every
# record carries the RESOLVED PATH of the package under test, so the bundle
# shows which tree answered rather than asserting which one should have.
#
# This script makes that falsifiable rather than merely recorded. It probes for
# contamination TWO ways before it trusts a green:
#
#   1. Node resolution from the install prefix must land inside the install
#      prefix. A resolved path anywhere else fails.
#   2. A walk UP from the working directory looking for any package.json whose
#      `name` is the package under test. That is the source tree, and finding
#      one means this repository is on the resolution path even if (1) happened
#      to answer from the prefix. This is the direction that catches the hazard,
#      because the source tree does not have to WIN resolution to corrupt the
#      witness; it only has to be there.
#
# Run from the repository root, probe 2 finds this repository's own
# package.json and the script fails NAMING THAT PATH. Run from a clean
# directory, it finds nothing and the run can pass. That is criterion 5's
# both-directions requirement, and it is why the check is a walk rather than a
# string comparison against a path the script was told about.
#
# THE CACHE IS FRESH PER RUN, in the working directory, so "clean cache" is a
# thing the script does rather than a thing the operator is trusted to have
# done. The resolved cache path is recorded like everything else.
#
# --tarball EXISTS AND IS NOT A BACK DOOR. Until the owner's trusted-publisher
# configuration lands (owner action A-7 part 2, DR-0024:154) nothing is on the
# registry to install, so the registry arm cannot run. `--tarball` installs the
# locally packed artifact instead. Everything else about the run is identical:
# the same records, the same resolution probes, the same assertions. The ONE
# thing it does not witness is which artifact npm fetched, and the record says
# so in its own `artifact` field rather than leaving a reader to assume the
# registry answered.

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: scripts/release-verify.sh <name> <version> [--tarball <path>]
                                 [--records <file>] [--workdir <dir>]

  <name>       the published package name, for example @tiphys/kernel
  <version>    the exact version, for example 0.1.0
  --tarball    install this local artifact instead of fetching from the
               registry; the records mark the run `artifact: local-tarball`
  --records    where to write the JSON evidence records
               (default <workdir>/release-verify-records.json)
  --workdir    install here instead of the current directory
  --wait-seconds <n>
               registry mode only: how long to wait for the registry to
               SERVE <name>@<version> before running any step (default 900,
               or RELEASE_VERIFY_WAIT_SECONDS). 0 means poll exactly once.
               At most 86400. One poll that does not answer is killed at
               the deadline, or after 10s if less than that remains.
  --poll-seconds <n>
               registry mode only: the pause between polls (default 15, or
               RELEASE_VERIFY_POLL_SECONDS); at least 1, at most 86400

  exit 0 verified; 1 a step failed or the run was refused; 64 usage;
  75 the registry did not serve the version within the wait (no step ran)
USAGE
}

NAME=""
VERSION=""
TARBALL=""
RECORDS=""
WORKDIR=""
WAIT_SECONDS="${RELEASE_VERIFY_WAIT_SECONDS:-900}"
POLL_SECONDS="${RELEASE_VERIFY_POLL_SECONDS:-15}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a value}"; shift 2 ;;
    --records) RECORDS="${2:?--records needs a value}"; shift 2 ;;
    --workdir) WORKDIR="${2:?--workdir needs a value}"; shift 2 ;;
    --wait-seconds) WAIT_SECONDS="${2:?--wait-seconds needs a value}"; shift 2 ;;
    --poll-seconds) POLL_SECONDS="${2:?--poll-seconds needs a value}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "release-verify: unrecognised option $1" >&2; usage; exit 64 ;;
    *)
      if [ -z "$NAME" ]; then NAME="$1"
      elif [ -z "$VERSION" ]; then VERSION="$1"
      else echo "release-verify: unexpected operand $1" >&2; usage; exit 64
      fi
      shift ;;
  esac
done

if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  usage; exit 64
fi
# A BOUND IS A NUMBER BASH CAN ACTUALLY DO ARITHMETIC ON (fix round 1, Sonnet
# CR-002). Digits alone are not enough: nineteen of them wrap bash's signed
# 64-bit arithmetic (a 19-nine --wait-seconds was measured giving up after ONE
# poll), and a leading zero makes `08` an invalid octal literal. So the value is
# checked by LENGTH before it is ever compared, leading zeros are stripped, and
# anything above one day is a usage error. 86400 is a ceiling, not a target:
# the default is 900 and a publish has been measured taking about five minutes,
# so a day is ninety-six times the default and no plausible release wait.
MAX_SECONDS=86400
checked_seconds() {
  # $1 option name, $2 value, $3 minimum. Sets CHECKED to the normalised value.
  local option="$1" value="$2" minimum="$3" digits
  case "$value" in
    ''|*[!0-9]*) echo "release-verify: $option must be a whole number of seconds, from $minimum to at most $MAX_SECONDS, got '$value'" >&2; usage; exit 64 ;;
  esac
  digits="${value#"${value%%[!0]*}"}"
  digits="${digits:-0}"
  if [ "${#digits}" -gt "${#MAX_SECONDS}" ] || [ "$digits" -gt "$MAX_SECONDS" ] || [ "$digits" -lt "$minimum" ]; then
    echo "release-verify: $option must be a whole number of seconds, from $minimum to at most $MAX_SECONDS, got '$value'" >&2; usage; exit 64
  fi
  CHECKED="$digits"
}
CHECKED=""
checked_seconds --wait-seconds "$WAIT_SECONDS" 0
WAIT_SECONDS="$CHECKED"
checked_seconds --poll-seconds "$POLL_SECONDS" 1
POLL_SECONDS="$CHECKED"

# `pwd -P` AND NOT `pwd`. bash's default pwd is the LOGICAL path, so a workdir
# reached through a symlink into a checkout reports the symlink's own ancestry
# and the upward walk below never leaves the link's parent. Measured by the
# clean-room hazard review (HRB-6 member A): the script passed, recorded
# `sourceTreeOnResolutionPath: null`, and installed into the checkout it was
# supposed to refuse. Node resolves the REAL path, so the probe must use it too.
WORKDIR="$(cd "${WORKDIR:-$PWD}" && pwd -P)"
RECORDS="${RECORDS:-$WORKDIR/release-verify-records.json}"
CACHE="$WORKDIR/.release-verify-npm-cache"
PREFIX="$WORKDIR"
if [ -n "$TARBALL" ]; then
  TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
fi

: > "$RECORDS"
FAILURES=0

# THE RESOLUTION PROBES, REWRITTEN IN ROUND 1.
#
# The first version defined "the source tree is on the resolution path" as "some
# ancestor of the working directory holds a package.json whose `name` equals the
# package under test". That is a MODEL of Node's resolution and it is neither
# necessary nor sufficient for it, which the clean-room hazard review measured
# three ways (HRB-6): a symlinked workdir, `NODE_PATH`, and a `node_modules` in
# a parent directory all resolved the package while the probe reported clean.
#
# So the probe now ASKS NODE, and keeps the ancestor walk as a SECOND, weaker
# question rather than as the answer. Both are needed and neither subsumes the
# other:
#
#   - `createRequire().resolve` is what Node itself would do from this
#     directory. It consults `node_modules` at every ancestor and the global
#     paths, so it catches the parent-node_modules case and any fourth case
#     nobody has thought of. It is the authority.
#   - It does NOT catch the checkout case, because a package cannot resolve
#     itself by name without an `exports` field and this package has none. That
#     is the ORIGINAL case this guard exists for, so the ancestor walk stays.
#
# `NODE_PATH` is refused outright rather than probed. It changes resolution for
# every child process the script spawns, and a release verification whose
# resolution order depends on an inherited variable is not reproducible even
# when it happens to be correct.
probe_node_resolution() {
  node -e '
    const { createRequire } = require("node:module");
    const { join } = require("node:path");
    const from = createRequire(join(process.argv[1], "release-verify-probe.cjs"));
    for (const specifier of [process.argv[2] + "/package.json", process.argv[2]]) {
      try {
        process.stdout.write(from.resolve(specifier));
        process.exit(0);
      } catch {}
    }
    process.stdout.write("");
  ' "$WORKDIR" "$NAME"
}

probe_source_tree() {
  node -e '
    const { existsSync, readFileSync, realpathSync } = require("node:fs");
    const { dirname, join } = require("node:path");
    let dir = realpathSync(process.argv[1]);
    const name = process.argv[2];
    for (;;) {
      const candidate = join(dir, "package.json");
      if (existsSync(candidate)) {
        try {
          if (JSON.parse(readFileSync(candidate, "utf8")).name === name) {
            process.stdout.write(candidate);
            process.exit(0);
          }
        } catch {}
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    process.stdout.write("");
  ' "$WORKDIR" "$NAME"
}

# The union of the two, which is what "contaminated" means. Reported as the
# resolved path so the refusal names WHAT answered, not merely that something
# did.
# CONTAMINATION IS "SOMETHING OUTSIDE THE INSTALL PREFIX ANSWERS", not "something
# answers". Before the install nothing may answer at all; after it, the install
# prefix is the RIGHT answer and anything else is still wrong. Reporting the
# prefix as contamination would make every post-install record read as a
# failure, and dropping the probe after the install would stop watching exactly
# when a second tree could start answering. So the prefix is subtracted rather
# than the probe being switched off.
probe_contamination() {
  local found; found="$(probe_contamination_raw)"
  case "$found" in
    "$PREFIX"/node_modules/*) printf '' ;;
    *) printf '%s' "$found" ;;
  esac
}

probe_contamination_raw() {
  local viaNode; viaNode="$(probe_node_resolution)"
  if [ -n "$viaNode" ]; then
    printf '%s' "$viaNode"
    return 0
  fi
  probe_source_tree
}

# WHICH probe answered, because saying "it resolves" when the ancestor walk
# answered would be the same defect this round is fixing one size smaller: a
# package.json DECLARING the name is not a resolution, it is a checkout. The
# refusal names the question that was actually answered.
probe_contamination_kind() {
  if [ -n "$(probe_node_resolution)" ]; then
    printf 'node resolution from this directory'
  else
    printf 'an ancestor of the real path declaring that name'
  fi
}

probe_installed() {
  node -e '
    const { existsSync } = require("node:fs");
    const { join } = require("node:path");
    const p = join(process.argv[1], "node_modules", process.argv[2], "package.json");
    process.stdout.write(existsSync(p) ? p : "");
  ' "$PREFIX" "$NAME"
}

# One JSON record per command: the step id, the argv, the exit code, and the
# resolved path of the package under test AT THE MOMENT THAT COMMAND RAN.
# Recording the path per record rather than once per run is deliberate: an
# install that changes which tree answers is exactly the event worth seeing.
record() {
  local step="$1" exit_code="$2" detail="$3"
  local resolved; resolved="$(probe_installed)"
  local contaminated; contaminated="$(probe_contamination)"
  node -e '
    const [step, code, detail, resolved, contaminated, name, version, workdir, cache, artifact, records] =
      process.argv.slice(1);
    require("node:fs").appendFileSync(records, JSON.stringify({
      step,
      package: name,
      version,
      artifact,
      command: detail,
      exitCode: Number(code),
      resolvedPackagePath: resolved === "" ? null : resolved,
      sourceTreeOnResolutionPath: contaminated === "" ? null : contaminated,
      workdir,
      npmCache: cache,
      at: new Date().toISOString(),
    }) + "\n");
  ' "$step" "$exit_code" "$detail" "$resolved" "$contaminated" \
    "$NAME" "$VERSION" "$WORKDIR" "$CACHE" \
    "$([ -n "$TARBALL" ] && echo local-tarball || echo registry)" "$RECORDS"
  if [ "$exit_code" -ne 0 ]; then
    FAILURES=$((FAILURES + 1))
    echo "release-verify: step $step exited $exit_code" >&2
  fi
}

run_step() {
  local step="$1"; shift
  local code=0
  "$@" >/dev/null 2>&1 || code=$?
  record "$step" "$code" "$*"
  return 0
}

# ---------------------------------------------------------------------------
# Step 0, and it runs FIRST for a reason: a contaminated environment must be
# refused before anything is installed into it.
# ---------------------------------------------------------------------------
if [ -n "${NODE_PATH:-}" ]; then
  record clean-environment 1 "NODE_PATH probe for $NAME from $WORKDIR"
  echo "release-verify: REFUSED. NODE_PATH is set to '${NODE_PATH}', which changes module resolution for every process this script spawns." >&2
  echo "release-verify: unset it and re-run. A verification whose resolution order depends on an inherited variable is not reproducible even when it is correct." >&2
  echo "release-verify: $FAILURES failing step(s); records in $RECORDS" >&2
  exit 1
fi

CONTAMINATION="$(probe_contamination)"
if [ -n "$CONTAMINATION" ]; then
  record clean-environment 1 "resolution probe for $NAME from $WORKDIR"
  echo "release-verify: REFUSED. $NAME is reachable from $WORKDIR before anything has been installed." >&2
  echo "release-verify: found by $(probe_contamination_kind), at $CONTAMINATION." >&2
  echo "release-verify: this run would witness that tree and not the installed package. Run it from a directory outside any checkout of the package." >&2
  echo "release-verify: $FAILURES failing step(s); records in $RECORDS" >&2
  exit 1
fi
record clean-environment 0 "resolution probe for $NAME from $WORKDIR"

# ---------------------------------------------------------------------------
# REGISTRY MODE WAITS UNTIL THE REGISTRY SERVES THE VERSION, and only then runs
# the steps below, unchanged.
#
# THE MECHANISM THIS CLOSES: a post-publish verification that treats "not yet
# served" the same as "served and broken". Measured on release run
# 35839356656: `npm publish` printed "Your package is being processed and may
# take a few minutes to become available", this script ran one second later,
# `npm install` could not resolve the version, and all five steps failed. The
# registry's own publish time for that version was about five minutes after
# the publish step, and the same command run by hand at that point exited 0.
#
# WHAT "SERVED" MEANS HERE, and fix round 1 changed it (Opus CR-001, CR-002).
# Two conditions, asked in this order, each with a fresh cache:
#
#   1. `npm cache add <name>@<version>` exits 0. This is INSTALL'S OWN FETCH
#      PATH: the abbreviated packument and then the tarball. The first version
#      of this wait asked only `npm view`, which reads the FULL packument, a
#      different document that the registry can serve before the other two.
#      Polling a document install does not read made the wait's "served" a
#      claim about the wrong thing. The not-yet-served answer is ETARGET,
#      captured in witness/captures/release-verify-cache-add-not-served.txt.
#   2. `npm view <name>@<version> version` exits 0 AND prints exactly
#      <version>. Exit 0 alone is not "this version" (an older npm printed an
#      empty stdout for an unpublished version of an existing package), and
#      the real not-yet-served answer is an E404 with empty stdout
#      (witness/captures/release-verify-registry-not-served.txt).
#
# A nonzero exit from either, a network failure included, is "not served yet",
# and it is polled again until the deadline.
#
# BOUNDED, AND THE BOUND IS DISTINCT FROM A STEP FAILURE. Default 900s: npm
# says "a few minutes" and the one measurement is about five, so fifteen is
# three times what was observed and still far inside any job timeout. On
# expiry the script exits 75 with "NOT SERVED" and runs NO step, so a
# never-served version cannot be mistaken for a served and broken one. A
# served and broken version passes this wait on its first poll and fails at
# its step exactly as before.
#
# THE BOUND COVERS A POLL THAT NEVER RETURNS (fix round 1, Sonnet CR-001). The
# first version checked its deadline only BETWEEN polls, so one `npm view`
# that did not return outlived --wait-seconds without limit. The review
# measured 60s and more for one poll against a refused port; this round traced
# that to npm's own retry backoff (70s with npm's default retries, 1s with
# --fetch-retries=0, npm 11.18.0), and a connection that truly never answers
# is the same shape with no retry count to cap it. Each poll now runs under
# bounded_run with the time left on the deadline, floored at
# POLL_FLOOR_SECONDS so the last poll is not given a window too short to
# answer in. A whole run therefore ends by the deadline plus at most the
# floor. npm also gets --fetch-retries=0 and a matching --fetch-timeout, so
# that in the ordinary case npm gives up by itself with its own error, which
# the NOT SERVED line then quotes. Whether npm's own timeout alone bounds the
# WHOLE command is not established here, which is why bounded_run is kept as
# the backstop rather than trusted away.
#
# TARBALL MODE DOES NOT WAIT: it installs a local file and asks the registry
# nothing, so there is nothing to wait for.
# ---------------------------------------------------------------------------
POLL_FLOOR_SECONDS=10

# bounded_run <seconds> <stdout-file> <stderr-file> <command> [args...]
#
# Runs the command with a hard wall-clock bound and exits with its status, or
# 124 if the bound expired, in which case <stderr-file>.timed-out is created.
#
# WHY NODE AND NOT timeout(1): macOS ships no GNU `timeout`, and this
# repository treats macOS as a platform it supports (it has a macOS smoke
# workflow, though that workflow does not run this script), so a maintainer
# running this by hand on a Mac must get the same bound. A bash background job plus a watchdog `sleep`
# is portable but leaves the watchdog and any grandchild behind on the normal
# path. Node is already a hard dependency of this script (every record is
# written by it) and of the package under test, so it adds nothing. The
# command runs in its OWN PROCESS GROUP and the whole group is killed on
# expiry, because npm is a wrapper that spawns further processes and killing
# only the direct child would leave a grandchild holding the connection.
# Output goes to FILES, not pipes, so no leftover process can keep a pipe open
# and hold this script up after the kill.
#
# This is terminating a child this script started, on a timer this script set.
# It is not identity or exclusion, which constraint C-2 governs: no decision
# here is taken from whether some process is alive.
bounded_run() {
  local seconds="$1" out="$2" err="$3"
  shift 3
  rm -f "$err.timed-out"
  node -e '
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const [seconds, out, err, command, ...args] = process.argv.slice(1);
    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", fs.openSync(out, "w"), fs.openSync(err, "w")],
    });
    let expired = false;
    const killGroup = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const timer = setTimeout(() => {
      expired = true;
      fs.writeFileSync(err + ".timed-out", seconds + "\n");
      fs.appendFileSync(err, "release-verify: " + command + " " + args.slice(0, 2).join(" ") + " did not answer within " + seconds + "s and was killed\n");
      killGroup();
    }, Number(seconds) * 1000);
    child.on("error", (error) => {
      clearTimeout(timer);
      fs.appendFileSync(err, "release-verify: could not run " + command + ": " + error.message + "\n");
      process.exit(127);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      process.exit(expired ? 124 : (code ?? 1));
    });
  ' "$seconds" "$out" "$err" "$@"
}

wait_for_registry() {
  local wait_cache="$WORKDIR/.release-verify-wait-cache"
  local err_file; err_file="$(mktemp)"
  local out_file; out_file="$(mktemp)"
  local started; started="$(date +%s)"
  local deadline=$((started + WAIT_SECONDS))
  local first_at; first_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local attempts=0 code=0 observed="" last_at="" now=0 served=no
  local poll_deadline=0 limit=0 last_command="" timed_out=no
  while :; do
    attempts=$((attempts + 1))
    now="$(date +%s)"
    poll_deadline=$((now + POLL_FLOOR_SECONDS))
    [ "$deadline" -gt "$poll_deadline" ] && poll_deadline="$deadline"
    rm -rf "$wait_cache"
    observed=""
    timed_out=no
    last_command="npm cache add"
    limit=$((poll_deadline - now))
    code=0
    bounded_run "$limit" "$out_file" "$err_file" \
      npm cache add "$NAME@$VERSION" --cache "$wait_cache" --prefer-online \
      --fetch-retries=0 --fetch-timeout="$((limit * 1000))" || code=$?
    if [ "$code" -eq 0 ]; then
      last_command="npm view"
      now="$(date +%s)"
      limit=$((poll_deadline - now))
      [ "$limit" -ge 1 ] || limit=1
      bounded_run "$limit" "$out_file" "$err_file" \
        npm view "$NAME@$VERSION" version --cache "$wait_cache" --prefer-online \
        --fetch-retries=0 --fetch-timeout="$((limit * 1000))" || code=$?
      observed="$(cat "$out_file")"
    fi
    [ -e "$err_file.timed-out" ] && timed_out=yes
    last_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [ "$code" -eq 0 ] && [ "$observed" = "$VERSION" ]; then
      served=yes
      break
    fi
    now="$(date +%s)"
    if [ $((now + POLL_SECONDS)) -gt "$deadline" ]; then
      break
    fi
    echo "release-verify: $NAME@$VERSION not served yet (poll $attempts, $last_command exited $code); polling again in ${POLL_SECONDS}s" >&2
    sleep "$POLL_SECONDS"
  done
  rm -rf "$wait_cache"
  local elapsed=$(( $(date +%s) - started ))
  local exit_code=0
  [ "$served" = yes ] || exit_code=75
  local last_error
  last_error="$(grep '^npm error' "$err_file" | grep -v 'complete log' | head -n 1 || true)"
  node -e '
    const [records, name, version, workdir, exitCode, attempts, deadline, poll,
      firstAt, lastAt, elapsed, npmExit, observed, errFile, lastCommand, timedOut,
      floor] = process.argv.slice(1);
    const fs = require("node:fs");
    const stderr = fs.readFileSync(errFile, "utf8").split("\n")
      .filter((line) => line.startsWith("npm error") && !line.includes("complete log"))
      .slice(0, 3);
    fs.appendFileSync(records, JSON.stringify({
      step: "registry-served",
      package: name,
      version,
      artifact: "registry",
      command: "npm cache add " + name + "@" + version + ", then npm view " + name + "@" + version + " version; --prefer-online --fetch-retries=0, fresh cache per poll, each bounded by the time left on the deadline",
      exitCode: Number(exitCode),
      served: Number(exitCode) === 0,
      attempts: Number(attempts),
      deadlineSeconds: Number(deadline),
      pollSeconds: Number(poll),
      pollFloorSeconds: Number(floor),
      firstPollAt: firstAt,
      lastPollAt: lastAt,
      elapsedSeconds: Number(elapsed),
      lastCommand,
      lastNpmExitCode: Number(npmExit),
      lastPollTimedOut: timedOut === "yes",
      lastStdout: observed,
      lastStderr: stderr,
      workdir,
      at: new Date().toISOString(),
    }) + "\n");
  ' "$RECORDS" "$NAME" "$VERSION" "$WORKDIR" "$exit_code" "$attempts" \
    "$WAIT_SECONDS" "$POLL_SECONDS" "$first_at" "$last_at" "$elapsed" \
    "$code" "$observed" "$err_file" "$last_command" "$timed_out" \
    "$POLL_FLOOR_SECONDS"
  rm -f "$err_file" "$err_file.timed-out" "$out_file"
  if [ "$served" != yes ]; then
    local why="$last_command exited $code"
    [ "$timed_out" = yes ] && why="$last_command timed out and was killed"
    echo "release-verify: NOT SERVED. The registry did not serve $NAME@$VERSION within $WAIT_SECONDS seconds ($attempts poll(s); last poll: $why; last npm error: ${last_error:-none})." >&2
    echo "release-verify: no step was run, so this says nothing about whether the package works. Re-run once the registry serves the version." >&2
    echo "release-verify: records in $RECORDS" >&2
    exit 75
  fi
  echo "release-verify: the registry serves $NAME@$VERSION (poll $attempts, after ${elapsed}s)"
}

if [ -z "$TARBALL" ]; then
  wait_for_registry
fi

# ---------------------------------------------------------------------------
# E4.3's four witnesses.
# ---------------------------------------------------------------------------
rm -rf "$CACHE"
if [ -n "$TARBALL" ]; then
  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
    --no-audit --no-fund "$TARBALL"
else
  run_step install npm install --prefix "$PREFIX" --cache "$CACHE" \
    --no-audit --no-fund "$NAME@$VERSION"
fi

# The import resolves AND reports the released version. "It imported" and "it
# imported the version we released" are different claims and only the second is
# worth recording.
run_step import node -e '
  const { readFileSync } = require("node:fs");
  const [prefix, name, version] = process.argv.slice(1);
  const meta = JSON.parse(readFileSync(prefix + "/node_modules/" + name + "/package.json", "utf8"));
  if (meta.version !== version) {
    throw new Error("installed " + meta.version + ", expected " + version);
  }
' "$PREFIX" "$NAME" "$VERSION"

BIN="$PREFIX/node_modules/.bin/tiphys"
BIN_CODE=0
BIN_OUT="$("$BIN" version 2>/dev/null)" || BIN_CODE=$?
if [ "$BIN_CODE" -eq 0 ] && [ "$BIN_OUT" != "$VERSION" ]; then
  BIN_CODE=1
  echo "release-verify: the installed bin printed '$BIN_OUT', expected '$VERSION'" >&2
fi
record bin-version "$BIN_CODE" "$BIN version"

# The schema-resolves-from-an-install witness. Both inputs are copied OUT of the
# installed package, which is what makes this a statement about the install and
# not about the repository (criterion 3, and the "$ref fails to resolve from
# inside an installed tree" hazard).
COPIED="$WORKDIR/copied-out-of-install"
rm -rf "$COPIED"; mkdir -p "$COPIED"
COPY_CODE=0
cp "$PREFIX/node_modules/$NAME/templates/plan.example.yaml" "$COPIED/plan.example.yaml" 2>/dev/null || COPY_CODE=$?
record copy-template "$COPY_CODE" "cp <install>/templates/plan.example.yaml $COPIED/"
run_step validate-template "$BIN" validate --type plan "$COPIED/plan.example.yaml"

RESOLVED="$(probe_installed)"
if [ "$FAILURES" -ne 0 ]; then
  echo "release-verify: $FAILURES failing step(s); records in $RECORDS" >&2
  exit 1
fi
echo "release-verify: $NAME@$VERSION verified from $WORKDIR"
echo "release-verify: resolved package path $RESOLVED"
echo "release-verify: records in $RECORDS"
