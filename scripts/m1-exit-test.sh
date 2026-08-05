#!/usr/bin/env bash
#
# m1-exit-test.sh: the scripted M1 exit test (kernel plan v1, M1-P6 step 2,
# implementing section 4's procedure).
#
# Section 4 is staged and this script keeps the staging honest:
#
#   stage A  automated pre-merge witness   (steps A1 to A8, scripted here)
#   stage B  owner-authorized transition   (recorded, NOT scripted)
#   stage C  automated post-merge witness  (steps C1 to C3, scripted here)
#
# In full mode stage B is a human authorization plus a gh pr merge --squash
# performed by the orchestrator. This script therefore stops at the end of
# stage A, records what the owner must do, and is re-run with --stage c
# --approval <file> once that has happened. It never pretends a human
# approval is a script step.
#
# In local mode there is no PR and no owner: the harness performs a stub
# squash merge into the scratch remote's default branch in place of stage
# B, so the squash path is witnessed in both modes (PR-001, EXT-F-04), and
# stages A, B-substitute and C run in one invocation.
#
# Local-mode step mapping (PR-008) is recorded per step in the evidence as
# step-map.json and repeated in every affected record; the gh-only
# observations (pr view OPEN and MERGED) are recorded as
# "mode: full-only, skipped in local". The harness never writes an
# evidence file for a command it did not execute: a record's kind says
# exactly what happened.
#
# Every commit the harness creates uses command-scoped GIT_AUTHOR_* and
# GIT_COMMITTER_* variables carrying the documented harness identity,
# mirroring tiphys init's mechanism (EXT-F-02 option B, PR-211), so the
# harness runs on a clean CI runner with no git identity. In both modes
# the harness provisions a throwaway file:// remote for the test fleet
# before A2 (PR-210) so the full doctor profile passes honestly instead of
# being weakened.
#
# Every tiphys invocation goes through dist/bin/tiphys.js after npm run
# build (PR-102, the section 3 invocation form for this phase), which is
# where the compiled form of every M1 subcommand is witnessed.
#
# Evidence records are JSON (DR-0006); prose appears only inside captured
# command output.
#
# Usage:
#   scripts/m1-exit-test.sh --mode local [--stage all] <evidence-dir>
#   scripts/m1-exit-test.sh --mode full --sandbox-remote <url> [--stage a] <evidence-dir>
#   scripts/m1-exit-test.sh --mode full --stage c --approval <file> <evidence-dir>
#   scripts/m1-exit-test.sh --list-steps
#
# Falsifiability guard (M1-P6 criterion 5): running local mode with
# TIPHYS_EXIT_TEST_SKIP_STAGE_B=1 skips the stub squash merge, which must
# make the harness exit nonzero at C2, where teardown correctly refuses a
# task whose branch never landed. That guard is itself guarded: the gates
# workflow runs this path and fails the job if the harness exits 0, and
# test/exit-test-local.test.ts asserts both that the workflow still wires
# it and that a failing step is fatal to a run. If you change the failure
# machinery, expect those to go red; that is their entire purpose.
#
# Two couplings that are easy to "optimise away" and must not be:
#
#   1. A1 runs the kernel's own npm ci, build and test. That is not
#      duplication of the CI job's steps: several properties of this
#      harness's end-to-end witnesses are actually guarded by the unit
#      suite A1 runs, not by the end-to-end assertions themselves.
#   2. A1 parses the seeded project's test COUNT with a pinned reporter.
#      An exit-code-only check passes on a sandbox with zero tests,
#      because node --test over a glob matching nothing exits 0.
#
# Lease timing (PR-203, CR-608): A3 renews once at the end of stage A,
# which buys the default 900 second lease. Section 4 says stage B has no
# timing requirement, so an owner approval slower than that leaves the
# lease expired during stage C. That does not fail the run (expiry does
# not block a release, src/lock.ts), but the fleet is takeover-able in
# the middle of a certification run. If the approval will be slow, renew
# manually: node dist/bin/tiphys.js lock renew --holder <holderId from
# session.json>.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# The documented harness identity. scripts/seed-sandbox.sh and
# scripts/stub-payload.sh declare the same two constants; a drift between
# the three is caught by test/exit-test-local.test.ts.
HARNESS_NAME="Tiphys Exit Test"
HARNESS_EMAIL="exit-test@tiphys.invalid"

TASK_ID="m1-exit"
EX_USAGE=64

# The watcher's base interval is configurable in M1-P5 but the plan does
# not name a flag for it, so the harness waits on generous bounds rather
# than configuring the cadence. These are upper bounds on how long a
# healthy run may take, not expected durations.
BEACON_TIMEOUT_SECONDS=120
WATCHER_WAKE_TIMEOUT_SECONDS=180

USAGE="usage: scripts/m1-exit-test.sh --mode local|full [--stage a|c|all] [--sandbox-remote <url>] [--approval <file>] <evidence-dir>
       scripts/m1-exit-test.sh --list-steps"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "${script_dir}/.." && pwd)
TIPHYS="${repo_root}/dist/bin/tiphys.js"

# ---------------------------------------------------------------------------
# The step registry: section 4's steps and their local-mode disposition.
# Fields are tab separated: step, stage, disposition, description.
# disposition is one of
#   both              executed identically in both modes
#   local-substitute  executed in local mode through the documented substitution
#   full-only         a gh-only observation, recorded as skipped in local mode
# ---------------------------------------------------------------------------

step_registry() {
  cat <<'STEPS'
A1	A	local-substitute	preconditions: kernel npm ci, npm run build, npm test; sandbox repo seeded (local mode seeds a scratch bare repo the harness creates)
A2	A	both	tiphys init a fresh fleet, provision the fleet's throwaway file:// remote, tiphys doctor and tiphys doctor --for full
A3	A	both	tiphys lock acquire, record the lease duration, export TIPHYS_HOLDER_ID, renew before stage B
A4	A	both	clone the sandbox repository into the fleet's projects/ area
A5	A	both	tiphys watch --once reports the no-wake exit code 3, then a harness-owned resident tiphys watch writes the beacon
A6	A	local-substitute	tiphys spawn runs the stub payload; the pushed branch is evidence in both modes, the open PR is the full-mode form
A7	A	both	tiphys teardown refuses while the change has not landed, naming the branch, and the worktree survives
A8	A	both	the harness-owned watcher exits 0 with the single line "signal <task-id> turn-end"
B1	B	local-substitute	owner authorization and gh pr merge --squash (full); a harness stub squash merge into the scratch remote (local)
C1	C	local-substitute	the squash commit is on the sandbox default branch; gh pr view MERGED is the full-mode form
C2	C	both	tiphys teardown exits 0, the worktree is removed, and meta status is closed
C3	C	both	tiphys lock release exits 0 and the evidence bundle validates
STEPS
}

if [ "${1:-}" = "--list-steps" ]; then
  step_registry
  exit 0
fi

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

mode=""
stage=""
sandbox_remote=""
approval=""
evidence=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      mode="$2"; shift 2 ;;
    --stage)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      stage="$2"; shift 2 ;;
    --sandbox-remote)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      sandbox_remote="$2"; shift 2 ;;
    --approval)
      [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }
      approval="$2"; shift 2 ;;
    --*)
      echo "m1-exit-test: unknown option \"$1\"" >&2
      echo "${USAGE}" >&2
      exit "${EX_USAGE}" ;;
    *)
      if [ -n "${evidence}" ]; then
        echo "m1-exit-test: unexpected argument \"$1\"" >&2
        echo "${USAGE}" >&2
        exit "${EX_USAGE}"
      fi
      evidence="$1"; shift ;;
  esac
done

case "${mode}" in
  local|full) ;;
  *)
    echo "m1-exit-test: --mode local|full is required" >&2
    echo "${USAGE}" >&2
    exit "${EX_USAGE}" ;;
esac

if [ -z "${stage}" ]; then
  # Local mode has no human in it, so one invocation runs everything.
  # Full mode stops after stage A: stage B is a human authorization.
  if [ "${mode}" = "local" ]; then stage="all"; else stage="a"; fi
fi

case "${stage}" in
  a|c|all) ;;
  *)
    echo "m1-exit-test: --stage must be a, c, or all" >&2
    echo "${USAGE}" >&2
    exit "${EX_USAGE}" ;;
esac

if [ "${mode}" = "local" ] && [ "${stage}" != "all" ]; then
  echo "m1-exit-test: local mode runs all stages in one invocation (--stage all)" >&2
  exit "${EX_USAGE}"
fi

if [ "${mode}" = "full" ] && [ "${stage}" = "all" ]; then
  echo "m1-exit-test: full mode cannot run stage B, which is an owner authorization; run --stage a, then --stage c --approval <file>" >&2
  exit "${EX_USAGE}"
fi

if [ -z "${evidence}" ]; then
  echo "m1-exit-test: an evidence directory argument is required" >&2
  echo "${USAGE}" >&2
  exit "${EX_USAGE}"
fi

if [ "${mode}" = "full" ] && [ "${stage}" = "a" ] && [ -z "${sandbox_remote}" ]; then
  echo "m1-exit-test: full mode needs --sandbox-remote <url>, the repository owner action A-1 creates" >&2
  exit "${EX_USAGE}"
fi

if [ "${stage}" = "c" ] && [ -z "${approval}" ]; then
  echo "m1-exit-test: stage C needs --approval <file>, the recorded owner authorization from stage B" >&2
  exit "${EX_USAGE}"
fi

mkdir -p "${evidence}/records" "${evidence}/output"
evidence=$(CDPATH= cd -- "${evidence}" && pwd)

# ---------------------------------------------------------------------------
# Evidence recording
# ---------------------------------------------------------------------------

record_seq=0

# json_object key value [key value ...]
# A key ending in # is emitted as a number (empty value becomes null); a
# key ending in [ is emitted as an array split on the unit separator.
json_object() {
  node -e '
    const args = process.argv.slice(1);
    const out = {};
    for (let i = 0; i + 1 < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      if (key.endsWith("#")) {
        out[key.slice(0, -1)] = value === "" ? null : Number(value);
      } else if (key.endsWith("[")) {
        out[key.slice(0, -1)] = value === "" ? [] : value.split(String.fromCharCode(31));
      } else if (value === "") {
        out[key] = null;
      } else {
        out[key] = value;
      }
    }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  ' "$@"
}

step_field() {
  step_registry | awk -F'\t' -v s="$1" -v f="$2" '$1 == s { print $f }'
}

# write_record <step> <kind> <fields...>
write_record() {
  local step="$1"; shift
  local kind="$1"; shift
  record_seq=$((record_seq + 1))
  local seq
  seq=$(printf '%03d' "${record_seq}")
  local path="${evidence}/records/${seq}-${step}.json"
  json_object \
    step "${step}" \
    stage "$(step_field "${step}" 2)" \
    mode "${mode}" \
    kind "${kind}" \
    localDisposition "$(step_field "${step}" 3)" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$@" >"${path}"
  echo "${path}"
}

die() {
  echo "m1-exit-test: FAILED: $*" >&2
  echo "m1-exit-test: evidence in ${evidence}" >&2
  exit 1
}

# run_step <step> <expect> <cwd> <label> -- <command...>
# <expect> is "zero", "nonzero", or an exact integer exit code.
run_step() {
  local step="$1" expect="$2" cwd="$3" label="$4"
  shift 4
  # Written as an if, not as a && list: under set -e a trailing false
  # test would abort the harness with no diagnostic at all.
  if [ "${1:-}" = "--" ]; then
    shift
  fi
  record_seq=$((record_seq + 1))
  local seq
  seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}-${step}.out"
  local out_path="${evidence}/${out_rel}"
  local rc=0
  ( cd "${cwd}" && "$@" ) >"${out_path}" 2>&1 || rc=$?
  local outcome="pass"
  case "${expect}" in
    zero) [ "${rc}" -eq 0 ] || outcome="fail" ;;
    nonzero) [ "${rc}" -ne 0 ] || outcome="fail" ;;
    *) [ "${rc}" -eq "${expect}" ] || outcome="fail" ;;
  esac
  local joined
  joined=$(printf '%s\x1f' "$@")
  joined=${joined%$'\x1f'}
  json_object \
    step "${step}" \
    stage "$(step_field "${step}" 2)" \
    mode "${mode}" \
    kind executed \
    localDisposition "$(step_field "${step}" 3)" \
    label "${label}" \
    'command[' "${joined}" \
    cwd "${cwd}" \
    'exitCode#' "${rc}" \
    expected "exit ${expect}" \
    outcome "${outcome}" \
    outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}-${step}.json"
  LAST_OUTPUT="${out_path}"
  LAST_EXIT="${rc}"
  if [ "${outcome}" = "fail" ]; then
    echo "--- captured output of the failing step ---" >&2
    tail -n 40 "${out_path}" >&2 || true
    echo "--- end captured output ---" >&2
    die "step ${step} (${label}): expected exit ${expect}, got ${rc}"
  fi
  echo "m1-exit-test: ${step} ok (${label})"
}

# assert_step <step> <label> <expected> <observed> <pass|fail>
assert_step() {
  local step="$1" label="$2" expected="$3" observed="$4" outcome="$5"
  write_record "${step}" assertion \
    label "${label}" \
    expected "${expected}" \
    observed "${observed}" \
    outcome "${outcome}" >/dev/null
  if [ "${outcome}" != "pass" ]; then
    die "step ${step} (${label}): expected ${expected}, observed ${observed}"
  fi
  echo "m1-exit-test: ${step} ok (${label})"
}

note_step() {
  local step="$1" kind="$2" label="$3" note="$4"
  write_record "${step}" "${kind}" label "${label}" note "${note}" >/dev/null
  echo "m1-exit-test: ${step} recorded (${kind}: ${label})"
}

# ---------------------------------------------------------------------------
# git helpers
# ---------------------------------------------------------------------------

git_identified() {
  GIT_AUTHOR_NAME="${HARNESS_NAME}" \
  GIT_AUTHOR_EMAIL="${HARNESS_EMAIL}" \
  GIT_COMMITTER_NAME="${HARNESS_NAME}" \
  GIT_COMMITTER_EMAIL="${HARNESS_EMAIL}" \
  git "$@"
}

# assert_commit_identity <step> <repo> <rev> <label>
assert_commit_identity() {
  local step="$1" repo="$2" rev="$3" label="$4"
  local observed
  observed=$(git -C "${repo}" log -1 --format='%an <%ae> / %cn <%ce>' "${rev}")
  local expected="${HARNESS_NAME} <${HARNESS_EMAIL}> / ${HARNESS_NAME} <${HARNESS_EMAIL}>"
  local outcome="fail"
  if [ "${observed}" = "${expected}" ]; then outcome="pass"; fi
  assert_step "${step}" "${label}" "${expected}" "${observed}" "${outcome}"
}

json_field() {
  node -e '
    const args = process.argv.slice(1);
    const data = JSON.parse(require("node:fs").readFileSync(args[0], "utf8"));
    const value = args[1].split(".").reduce((acc, k) => (acc === undefined || acc === null ? acc : acc[k]), data);
    process.stdout.write(value === undefined || value === null ? "" : String(value));
  ' "$1" "$2"
}

session_file="${evidence}/session.json"

# ---------------------------------------------------------------------------
# Stage A
# ---------------------------------------------------------------------------

stage_a() {
  work=$(mktemp -d -t tiphys-m1-exit-XXXXXX)
  echo "m1-exit-test: work directory ${work}"

  # --- A1 preconditions -----------------------------------------------------
  run_step A1 zero "${repo_root}" "kernel npm ci" -- npm ci
  run_step A1 zero "${repo_root}" "kernel npm run build" -- npm run build
  run_step A1 zero "${repo_root}" "kernel npm test" -- npm test
  if [ ! -f "${TIPHYS}" ]; then
    die "step A1: ${TIPHYS} does not exist after npm run build"
  fi
  # observed carries a MEASURED fact (the built file's size), not a
  # restatement of expected: a record whose observed is a literal copy of
  # its expected asserts its own conclusion and cannot be checked by a
  # later reader of the bundle (CR-602).
  assert_step A1 "compiled CLI entry present" \
    "${TIPHYS} exists and is a non-empty regular file" \
    "$(wc -c <"${TIPHYS}" | tr -d ' ') bytes at ${TIPHYS}" pass

  if [ "${mode}" = "local" ]; then
    toy_remote_path="${work}/toy-sandbox.git"
    git init --bare --quiet --initial-branch=main "${toy_remote_path}"
    sandbox_remote="file://${toy_remote_path}"
    note_step A1 substituted "scratch bare repository stands in for owner action A-1" \
      "created ${sandbox_remote} as the sandbox remote; the full-mode form is the GitHub repository owner action A-1 creates"
  fi
  run_step A1 zero "${repo_root}" "seed the sandbox repository" -- \
    "${script_dir}/seed-sandbox.sh" --remote "${sandbox_remote}"

  # The seeded content must actually be a working project (criterion 1).
  seed_clone="${work}/seed-check"
  run_step A1 zero "${work}" "clone the seeded sandbox repository" -- \
    git clone --quiet "${sandbox_remote}" "${seed_clone}"
  run_step A1 zero "${seed_clone}" "seeded project npm ci" -- npm ci
  # The reporter is PINNED so the count can be parsed on any toolchain,
  # and the count is then asserted, because node --test over a glob that
  # matches nothing EXITS 0: an exit-code-only check passes on a sandbox
  # with no tests at all, and criterion 1 says "with at least 1 test"
  # (CR-604). Do not reduce this back to an exit-code check.
  run_step A1 zero "${seed_clone}" "seeded project npm test" -- \
    env NODE_OPTIONS=--test-reporter=tap npm test
  seeded_pass=$(sed -n 's/^# pass \([0-9][0-9]*\)$/\1/p' "${LAST_OUTPUT}" | head -n 1)
  seeded_fail=$(sed -n 's/^# fail \([0-9][0-9]*\)$/\1/p' "${LAST_OUTPUT}" | head -n 1)
  outcome="fail"
  if [ -n "${seeded_pass}" ] && [ "${seeded_pass}" -ge 1 ] && [ "${seeded_fail}" = "0" ]; then
    outcome="pass"
  fi
  assert_step A1 "the seeded project ran at least one passing test and none failing" \
    "at least 1 passing, 0 failing" \
    "${seeded_pass:-no} passing, ${seeded_fail:-no} failing (pinned tap reporter)" \
    "${outcome}"
  assert_commit_identity A1 "${seed_clone}" HEAD "seed commit carries the harness identity"

  sandbox_default=$(git -C "${seed_clone}" rev-parse --abbrev-ref HEAD)

  # --- A2 fleet, fleet remote, doctor ---------------------------------------
  fleet="${work}/fleet"
  run_step A2 zero "${work}" "tiphys init a fresh fleet home" -- \
    node "${TIPHYS}" init "${fleet}"

  fleet_remote_path="${work}/fleet-remote.git"
  git init --bare --quiet --initial-branch=main "${fleet_remote_path}"
  run_step A2 zero "${fleet}" "provision the fleet's throwaway file:// remote (PR-210)" -- \
    git remote add origin "file://${fleet_remote_path}"
  run_step A2 zero "${fleet}" "push the fleet's tracked state to its remote" -- \
    git push --quiet -u origin HEAD

  run_step A2 zero "${fleet}" "tiphys doctor" -- node "${TIPHYS}" doctor
  if grep -q " FAIL " "${LAST_OUTPUT}"; then
    die "step A2: tiphys doctor exited 0 but printed a FAIL line"
  fi
  # Measured counts, not a restatement of the expectation (CR-602). The
  # CHECK-line total is recorded alongside the FAIL total so a bundle
  # reader can tell "no FAIL lines" from "no output at all".
  assert_step A2 "doctor printed no FAIL line" "0 FAIL lines" \
    "$(grep -c " FAIL " "${LAST_OUTPUT}" || true) FAIL lines out of $(grep -c "^CHECK " "${LAST_OUTPUT}" || true) CHECK lines" pass

  # doctor --for full promotes gh-missing and remote-missing to FAIL. The
  # fleet remote provisioned above is what makes remote-missing pass
  # honestly (PR-210). gh is a full-mode tool: on a machine that has it,
  # the profile must exit 0; on a machine without it the profile must fail
  # for exactly that one reason, which is a stronger local witness than
  # skipping the step, because it proves the remote check did not fail.
  if command -v gh >/dev/null 2>&1; then
    run_step A2 zero "${fleet}" "tiphys doctor --for full (gh present)" -- \
      node "${TIPHYS}" doctor --for full
  elif [ "${mode}" = "full" ]; then
    die "step A2: full mode requires gh on PATH and it is absent"
  else
    run_step A2 nonzero "${fleet}" "tiphys doctor --for full (gh absent, local substitution)" -- \
      node "${TIPHYS}" doctor --for full
    fails=$(grep -c " FAIL " "${LAST_OUTPUT}" || true)
    gh_fails=$(grep -c "^CHECK gh FAIL" "${LAST_OUTPUT}" || true)
    outcome="fail"
    if [ "${fails}" = "1" ] && [ "${gh_fails}" = "1" ]; then outcome="pass"; fi
    assert_step A2 "the only full-profile FAIL is the absent gh tool, so the provisioned fleet remote passed honestly" \
      "exactly 1 FAIL line, and it is CHECK gh FAIL" \
      "${fails} FAIL lines, ${gh_fails} of them CHECK gh FAIL" "${outcome}"
  fi

  # --- A3 lock --------------------------------------------------------------
  run_step A3 zero "${fleet}" "tiphys lock acquire" -- node "${TIPHYS}" lock acquire
  holder=$(awk '/^acquired /{ print $2; exit }' "${LAST_OUTPUT}")
  if [ -z "${holder}" ]; then
    die "step A3: could not read a holder id from the acquire output"
  fi
  export TIPHYS_HOLDER_ID="${holder}"
  lease_expiry=$(awk '/^acquired /{ print $4; exit }' "${LAST_OUTPUT}")
  note_step A3 assertion "lease recorded" \
    "holderId ${holder}, expiresAt ${lease_expiry}, configured lease duration 900 seconds (the M1-P3 default; the harness passes no --duration)"

  run_step A3 zero "${fleet}" "tiphys lock status" -- node "${TIPHYS}" lock status

  # --- A4 clone the sandbox project into projects/ ---------------------------
  toy_clone="${fleet}/projects/toy-sandbox"
  run_step A4 zero "${work}" "clone the sandbox repository into the fleet projects area" -- \
    git clone --quiet "${sandbox_remote}" "${toy_clone}"

  # --- A5 watcher -----------------------------------------------------------
  run_step A5 3 "${fleet}" "tiphys watch --once reports the no-wake exit code" -- \
    node "${TIPHYS}" watch --once

  watch_out="${work}/watch.out"
  ( cd "${fleet}" && exec node "${TIPHYS}" watch ) >"${watch_out}" 2>&1 &
  watch_pid=$!
  # Owning the process means owning its TERMINATION, on every exit path
  # and not only the two timeout paths below (CR-601). die() and every
  # set -e abort between here and the wait at A8 leave this child running
  # otherwise, and a resident watcher polling an abandoned /tmp fleet has
  # no termination condition of its own: one leaked probe was still
  # running two and a half minutes after its harness exited. The trap is
  # cleared once the wait has reaped the child.
  trap 'kill "${watch_pid:-}" 2>/dev/null || true' EXIT
  note_step A5 started "harness-owned resident watcher started" \
    "the harness owns this process, the kernel never backgrounds it (C-3); stdout captured to watch.out; an EXIT trap kills it on every harness exit path"

  beacon="${fleet}/state/watcher.beacon"
  waited=0
  while [ ! -f "${beacon}" ]; do
    if [ "${waited}" -ge "${BEACON_TIMEOUT_SECONDS}" ]; then
      kill "${watch_pid}" 2>/dev/null || true
      assert_step A5 "the resident watcher wrote state/watcher.beacon" \
        "beacon within ${BEACON_TIMEOUT_SECONDS}s" "no beacon after ${waited}s" fail
    fi
    sleep 1
    waited=$((waited + 1))
  done
  assert_step A5 "the resident watcher wrote state/watcher.beacon" \
    "beacon within ${BEACON_TIMEOUT_SECONDS}s" "beacon after ${waited}s" pass

  # A8 asserts that watch.out eventually holds exactly one wake line. On
  # its own that witnesses a LINE, not a WAKE: a watcher that printed the
  # line at startup, before any task existed, would satisfy it (CR-603).
  # Pinning watch.out empty here, after the beacon and before the spawn,
  # is what makes A8's later content mean "this appeared because the task
  # ran". A reviewer constructed the unconditional-emit mutation and it
  # passed A5 to C3; this closes the end-to-end half of that hole.
  assert_step A5 "the watcher has printed nothing before the task exists" \
    "watch.out empty at the end of A5" \
    "$(wc -c <"${watch_out}" | tr -d ' ') bytes in watch.out" \
    "$([ ! -s "${watch_out}" ] && echo pass || echo fail)"

  # --- A6 spawn -------------------------------------------------------------
  brief="${work}/brief.md"
  cat >"${brief}" <<'BRIEF'
# M1 exit test brief

Append one line to the toy sandbox README, commit it, push the task
branch, and (in full mode) open a pull request. The payload is the
deterministic stub scripts/stub-payload.sh, never an LLM (plan decision
D-2).
BRIEF

  export TIPHYS_EXIT_TEST_MODE="${mode}"
  export TIPHYS_EXIT_TEST_TASK="${TASK_ID}"
  # Whether spawn forwards the payload's stdout to its own is not a
  # contract the plan states, so the payload writes its facts to a path
  # the harness chose rather than the harness assuming an unstated
  # M1-P4 behavior. spawn's own captured output is still evidence.
  payload_report="${work}/payload-report.txt"
  export TIPHYS_EXIT_TEST_REPORT="${payload_report}"
  run_step A6 zero "${fleet}" "tiphys spawn runs the stub payload to completion" -- \
    node "${TIPHYS}" spawn --task "${TASK_ID}" --project "${toy_clone}" \
      --brief "${brief}" --shape ship --exec "${script_dir}/stub-payload.sh"

  if [ ! -f "${payload_report}" ]; then
    die "step A6: the stub payload wrote no report at ${payload_report}; it did not run in the spawned worktree"
  fi
  cp "${payload_report}" "${evidence}/output/payload-report.txt"
  task_branch=$(awk '/^payload branch /{ print $3; exit }' "${payload_report}")
  payload_commit=$(awk '/^payload commit /{ print $3; exit }' "${payload_report}")
  if [ -z "${task_branch}" ] || [ -z "${payload_commit}" ]; then
    die "step A6: the stub payload reported no branch and commit"
  fi
  note_step A6 assertion "stub payload facts captured" \
    "payload report copied to output/payload-report.txt: branch ${task_branch}, commit ${payload_commit}"

  remote_sha=$(git ls-remote "${sandbox_remote}" "refs/heads/${task_branch}" | awk '{ print $1; exit }')
  outcome="fail"
  if [ "${remote_sha}" = "${payload_commit}" ]; then outcome="pass"; fi
  assert_step A6 "the task branch is pushed to the sandbox remote" \
    "refs/heads/${task_branch} at ${payload_commit}" \
    "refs/heads/${task_branch} at ${remote_sha:-absent}" "${outcome}"

  assert_commit_identity A6 "${toy_clone}" "${payload_commit}" \
    "stub payload commit carries the harness identity"

  if [ "${mode}" = "full" ]; then
    pr_url=$(awk '/^payload pr /{ print $3; exit }' "${payload_report}")
    if [ -z "${pr_url}" ]; then
      die "step A6: the stub payload did not print a PR URL in full mode"
    fi
    run_step A6 zero "${work}" "gh pr view reports OPEN" -- \
      gh pr view "${pr_url}" --json state
    if ! grep -q "OPEN" "${LAST_OUTPUT}"; then
      die "step A6: gh pr view did not report OPEN"
    fi
  else
    pr_url=""
    note_step A6 skipped-full-only "gh pr view <url> --json state reports OPEN" \
      "mode: full-only, skipped in local; the local substitution is the pushed branch ref observed in git ls-remote, recorded above (PR-008)"
  fi

  # --- A7 teardown refusal --------------------------------------------------
  run_step A7 nonzero "${fleet}" "tiphys teardown refuses while the change has not landed" -- \
    node "${TIPHYS}" teardown --task "${TASK_ID}"
  outcome="fail"
  if grep -q "${task_branch}" "${LAST_OUTPUT}"; then outcome="pass"; fi
  assert_step A7 "the refusal names the task branch" \
    "a reason line containing ${task_branch}" \
    "$(head -c 300 "${LAST_OUTPUT}" | tr '\n' ' ')" "${outcome}"

  worktree="${fleet}/worktrees/${TASK_ID}"
  outcome="fail"
  if [ -d "${worktree}" ]; then outcome="pass"; fi
  assert_step A7 "the worktree survives the refusal" \
    "${worktree} exists" "$([ -d "${worktree}" ] && echo exists || echo absent)" "${outcome}"

  # --- A8 watcher wake ------------------------------------------------------
  # The wait is file-based: the harness watches for the watcher's own
  # stdout to appear, exactly as every other liveness question in this
  # project is answered from files rather than from process probing
  # (C-2). A watchdog bounds the subsequent wait so a watcher that
  # printed but never exited fails the run instead of hanging CI; the
  # watchdog is the only place the harness signals anything, and it is
  # signalling its own child, not inferring anyone's identity.
  waited=0
  while [ ! -s "${watch_out}" ]; do
    if [ "${waited}" -ge "${WATCHER_WAKE_TIMEOUT_SECONDS}" ]; then
      kill "${watch_pid}" 2>/dev/null || true
      assert_step A8 "the resident watcher woke on the turn-end signal" \
        "a wake line within ${WATCHER_WAKE_TIMEOUT_SECONDS}s" \
        "no output after ${waited}s" fail
    fi
    sleep 1
    waited=$((waited + 1))
  done
  ( sleep 30; kill "${watch_pid}" 2>/dev/null || true ) &
  watchdog_pid=$!
  rc=0
  wait "${watch_pid}" || rc=$?
  kill "${watchdog_pid}" 2>/dev/null || true
  # The child is reaped; the CR-601 safety net has nothing left to guard.
  trap - EXIT

  cp "${watch_out}" "${evidence}/output/watch.out"
  record_seq=$((record_seq + 1))
  json_object \
    step A8 stage A mode "${mode}" kind executed \
    localDisposition "$(step_field A8 3)" \
    label "the harness-owned resident watcher exited" \
    'command[' "$(printf 'node\x1f%s\x1fwatch' "${TIPHYS}")" \
    cwd "${fleet}" \
    'exitCode#' "${rc}" \
    expected "exit zero" \
    outcome "$([ "${rc}" -eq 0 ] && echo pass || echo fail)" \
    outputFile "output/watch.out" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/$(printf '%03d' "${record_seq}")-A8.json"
  [ "${rc}" -eq 0 ] || die "step A8: the watcher exited ${rc}, expected 0"

  observed_line=$(tr -d '\r' <"${watch_out}" | sed '/^$/d')
  expected_line="signal ${TASK_ID} turn-end"
  outcome="fail"
  if [ "${observed_line}" = "${expected_line}" ]; then outcome="pass"; fi
  assert_step A8 "the watcher printed exactly one wake line" \
    "${expected_line}" "${observed_line}" "${outcome}"

  # --- A3 lease renewal before stage B --------------------------------------
  run_step A3 zero "${fleet}" "tiphys lock renew before the stage B wait (PR-203)" -- \
    node "${TIPHYS}" lock renew --holder "${TIPHYS_HOLDER_ID}"

  write_session
}

# The stage A to stage C handoff. recordSeq is what --stage c resumes the
# record numbering from, so this MUST be written after the last record of
# the invocation, not merely at the end of stage_a: stage_b_full_pending
# writes one more record after stage_a returns, and a session file
# captured before it made --stage c restart at that record's number and
# overwrite it, destroying the only evidence that stage B was handed to
# the owner rather than scripted (CR-600).
write_session() {
  json_object \
    mode "${mode}" \
    work "${work}" \
    fleet "${fleet}" \
    tiphys "${TIPHYS}" \
    sandboxRemote "${sandbox_remote}" \
    sandboxDefaultBranch "${sandbox_default}" \
    toyClone "${toy_clone}" \
    taskId "${TASK_ID}" \
    taskBranch "${task_branch}" \
    payloadCommit "${payload_commit}" \
    prUrl "${pr_url}" \
    holderId "${TIPHYS_HOLDER_ID}" \
    recordSeq "${record_seq}" \
    >"${session_file}"
}

# ---------------------------------------------------------------------------
# Stage B: local substitution only. In full mode this is the owner's.
# ---------------------------------------------------------------------------

stage_b_local() {
  if [ "${TIPHYS_EXIT_TEST_SKIP_STAGE_B:-}" = "1" ]; then
    note_step B1 skipped-override "stage B stub squash merge skipped by TIPHYS_EXIT_TEST_SKIP_STAGE_B" \
      "the falsifiability guard of M1-P6 criterion 5: with nothing landed, C2's teardown must refuse and this harness must exit nonzero"
    merged_sha=""
    return 0
  fi

  local stage_b="${work}/stage-b"
  run_step B1 zero "${work}" "clone the sandbox remote for the stub squash merge" -- \
    git clone --quiet "${sandbox_remote}" "${stage_b}"
  run_step B1 zero "${stage_b}" "fetch the task branch" -- \
    git fetch --quiet origin "${task_branch}"
  run_step B1 zero "${stage_b}" "squash merge the task branch" -- \
    git merge --squash FETCH_HEAD
  run_step B1 zero "${stage_b}" "commit the squash merge with the harness identity" -- \
    env GIT_AUTHOR_NAME="${HARNESS_NAME}" GIT_AUTHOR_EMAIL="${HARNESS_EMAIL}" \
        GIT_COMMITTER_NAME="${HARNESS_NAME}" GIT_COMMITTER_EMAIL="${HARNESS_EMAIL}" \
        git commit --quiet -m "squash merge ${task_branch}"
  run_step B1 zero "${stage_b}" "push the squash merge to the sandbox default branch" -- \
    git push --quiet origin "HEAD:refs/heads/${sandbox_default}"
  merged_sha=$(git -C "${stage_b}" rev-parse HEAD)
  assert_commit_identity B1 "${stage_b}" HEAD "stage B squash commit carries the harness identity"
  note_step B1 substituted "the owner-authorized gh pr merge --squash is substituted by the harness stub squash merge" \
    "merged ${task_branch} into ${sandbox_default} as ${merged_sha}; the full-mode form is a recorded owner approval followed by gh pr merge --squash (PR-008, EXT-F-04)"
}

stage_b_full_pending() {
  note_step B1 pending-owner-action "stage B is an owner authorization and is not scripted" \
    "record the owner's approval (the approving review on ${pr_url} or an approval note), merge with: gh pr merge ${pr_url} --squash, then re-run: scripts/m1-exit-test.sh --mode full --stage c --approval <approval-file> ${evidence}"
}

# ---------------------------------------------------------------------------
# Stage C
# ---------------------------------------------------------------------------

stage_c() {
  # --- C1 the squash commit is on the sandbox default branch ----------------
  if [ "${mode}" = "full" ]; then
    run_step C1 zero "${work}" "gh pr view reports MERGED" -- gh pr view "${pr_url}" --json state,mergeCommit
    if ! grep -q "MERGED" "${LAST_OUTPUT}"; then
      die "step C1: gh pr view did not report MERGED"
    fi
  else
    note_step C1 skipped-full-only "gh pr view <url> --json state reports MERGED" \
      "mode: full-only, skipped in local; the local substitution is the squash commit observed on the sandbox remote's default branch, recorded below (PR-008)"
  fi

  head_sha=$(git ls-remote "${sandbox_remote}" "refs/heads/${sandbox_default}" | awk '{ print $1; exit }')
  local check="${work}/merged-check"
  rm -rf "${check}"
  run_step C1 zero "${work}" "clone the sandbox default branch to inspect the merge" -- \
    git clone --quiet --branch "${sandbox_default}" "${sandbox_remote}" "${check}"
  # The README this step greps is copied INTO the bundle, and observed
  # carries the real matched line rather than a copy of expected, so a
  # later reader can re-derive the verdict from the evidence instead of
  # taking the record's word for it (CR-602). Without the copy the
  # captured output for this step is empty, because git clone --quiet is
  # silent, and the record was unfalsifiable from the bundle alone.
  cp "${check}/README.md" "${evidence}/output/c1-sandbox-default-README.md"
  if grep -q "exit-test ${TASK_ID} landed a trivial change" "${check}/README.md"; then
    assert_step C1 "the payload's change is on the sandbox default branch" \
      "a line matching \"exit-test ${TASK_ID} landed a trivial change\" in README.md at ${sandbox_default} head ${head_sha}" \
      "$(grep -m1 "exit-test ${TASK_ID} landed a trivial change" "${check}/README.md") (copied to output/c1-sandbox-default-README.md)" pass
  elif [ "${TIPHYS_EXIT_TEST_SKIP_STAGE_B:-}" = "1" ]; then
    # Under the falsifiability guard nothing was merged. That is recorded
    # here rather than failing here, so the failure lands on C2, where
    # teardown's refusal of unlanded work is the behavior under test.
    note_step C1 skipped-override "the payload's change is not on the sandbox default branch" \
      "expected under TIPHYS_EXIT_TEST_SKIP_STAGE_B=1; the run must now fail at C2"
  else
    assert_step C1 "the payload's change is on the sandbox default branch" \
      "a line matching \"exit-test ${TASK_ID} landed a trivial change\" in README.md at ${sandbox_default} head ${head_sha}" \
      "no such line in the $(wc -l <"${check}/README.md" | tr -d ' ')-line README.md at ${sandbox_default} head ${head_sha} (copied to output/c1-sandbox-default-README.md)" fail
  fi
  note_step C1 assertion "merged sha recorded" "${sandbox_default} head is ${head_sha}"

  # --- C2 teardown succeeds --------------------------------------------------
  run_step C2 zero "${fleet}" "tiphys teardown after the squash merge" -- \
    node "${TIPHYS}" teardown --task "${TASK_ID}"

  local worktree="${fleet}/worktrees/${TASK_ID}"
  outcome="fail"
  if [ ! -d "${worktree}" ]; then outcome="pass"; fi
  assert_step C2 "the worktree is removed" "${worktree} absent" \
    "$([ -d "${worktree}" ] && echo present || echo absent)" "${outcome}"

  local meta="${fleet}/tasks/${TASK_ID}/meta.json"
  local status
  status=$(json_field "${meta}" status)
  outcome="fail"
  if [ "${status}" = "closed" ]; then outcome="pass"; fi
  assert_step C2 "task meta status is closed" "closed" "${status:-unreadable}" "${outcome}"

  # --- C3 release and validate the bundle ------------------------------------
  run_step C3 zero "${fleet}" "tiphys lock release" -- \
    node "${TIPHYS}" lock release --holder "${TIPHYS_HOLDER_ID}"

  if [ "${mode}" = "full" ]; then
    cp "${approval}" "${evidence}/approval-artifact"
    note_step C3 assertion "stage B approval artifact captured" \
      "copied ${approval} into the evidence bundle as approval-artifact"
  fi

  validate_bundle
}

# ---------------------------------------------------------------------------
# Evidence bundle validation (C3)
# ---------------------------------------------------------------------------

validate_bundle() {
  local steps_expected
  steps_expected=$(step_registry | awk -F'\t' '{ printf "%s ", $1 }')
  local out="${evidence}/output/bundle-validation.out"
  local rc=0
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const args = process.argv.slice(1);
    const [evidence, mode, expectedSteps, tiphysEntry] = args;
    const dir = path.join(evidence, "records");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    const records = files.map((f) => ({
      file: f,
      data: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
    }));
    const problems = [];
    const seen = new Set(records.map((r) => r.data.step));
    // A step is not covered merely by HAVING a record: a note that
    // asserts nothing satisfies presence while witnessing nothing, and
    // CR-600 showed that a step can lose its executing record and keep a
    // note. So every step must also carry at least one record with an
    // outcome. B1 is the one deliberate exception: stage B is an owner
    // authorization that the harness must not pretend to have executed,
    // so in full mode its only records are the pending-owner-action note
    // and the approval note, neither of which carries an outcome.
    const withOutcome = new Set(
      records.filter((r) => r.data.outcome !== undefined && r.data.outcome !== null)
        .map((r) => r.data.step),
    );
    for (const step of expectedSteps.trim().split(/\s+/)) {
      if (!seen.has(step)) {
        problems.push(`no evidence record for step ${step}`);
      } else if (step !== "B1" && !withOutcome.has(step)) {
        problems.push(`step ${step} has records but none carrying an outcome`);
      }
    }
    // Full mode must be able to PROVE it stopped and handed stage B to
    // the owner. That record is the only thing distinguishing a staged
    // run from one that scripted the authorization, and a sequence bug
    // silently deleted it while this validator reported success (CR-600).
    if (mode === "full") {
      const pending = records.filter(
        (r) => r.data.step === "B1" && r.data.kind === "pending-owner-action",
      );
      if (pending.length === 0) {
        problems.push(
          "full mode bundle has no B1 pending-owner-action record: the stage A owner handoff evidence is missing",
        );
      }
    }
    let tiphysInvocations = 0;
    for (const { file, data } of records) {
      if (data.kind === "executed" && Array.isArray(data.command)) {
        for (const part of data.command) {
          if (/tiphys\.js$|(^|\/)tiphys$/.test(part)) {
            tiphysInvocations += 1;
            if (part !== tiphysEntry) {
              problems.push(`${file}: tiphys invoked as ${part}, not ${tiphysEntry}`);
            }
          }
        }
      }
      if (data.outcome !== undefined && data.outcome !== null && data.outcome !== "pass") {
        problems.push(`${file}: step ${data.step} outcome ${data.outcome}`);
      }
      if (data.kind === "executed" && data.outputFile) {
        if (!fs.existsSync(path.join(evidence, data.outputFile))) {
          problems.push(`${file}: captured output ${data.outputFile} is missing`);
        }
      }
    }
    if (tiphysInvocations === 0) {
      problems.push("no recorded tiphys invocation at all");
    }
    if (mode === "full" && !fs.existsSync(path.join(evidence, "approval-artifact"))) {
      problems.push("full mode bundle has no stage B approval artifact");
    }
    const identityAssertions = records.filter(
      (r) => r.data.kind === "assertion" && /harness identity/.test(String(r.data.label)),
    );
    if (identityAssertions.length < 2) {
      problems.push(`only ${identityAssertions.length} commit-identity assertions recorded`);
    }
    // records.length counts what exists at validation time; the C3
    // record for this very validation is written immediately afterwards,
    // so the bundle ends up with one more file than this loop saw. Both
    // numbers are reported, because the single number disagreed with the
    // file count of the records directory and cost a reader an hour
    // (CR-606).
    process.stdout.write(
      JSON.stringify(
        {
          recordsValidated: records.length,
          recordsInBundle: records.length + 1,
          tiphysInvocations,
          problems,
        },
        null,
        2,
      ) + "\n",
    );
    if (problems.length > 0) {
      process.exit(1);
    }
  ' "${evidence}" "${mode}" "${steps_expected}" "${TIPHYS}" >"${out}" 2>&1 || rc=$?
  record_seq=$((record_seq + 1))
  json_object \
    step C3 stage C mode "${mode}" kind executed \
    localDisposition "$(step_field C3 3)" \
    label "evidence bundle validation" \
    'command[' "bundle-validation" \
    cwd "${evidence}" \
    'exitCode#' "${rc}" \
    expected "exit zero" \
    outcome "$([ "${rc}" -eq 0 ] && echo pass || echo fail)" \
    outputFile "output/bundle-validation.out" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/$(printf '%03d' "${record_seq}")-C3.json"
  if [ "${rc}" -ne 0 ]; then
    cat "${out}" >&2
    die "step C3: the evidence bundle did not validate"
  fi
  echo "m1-exit-test: C3 ok (evidence bundle validated)"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# The step map is written through JSON.stringify rather than assembled by
# hand: a description containing a quote character produced an invalid
# evidence file the first time this was done with awk.
step_registry | node -e '
  const text = require("node:fs").readFileSync(0, "utf8");
  const rows = text.split("\n").filter((line) => line !== "").map((line) => {
    const [step, stage, localDisposition, description] = line.split("\t");
    return { step, stage, localDisposition, description };
  });
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
' >"${evidence}/step-map.json"

if [ "${stage}" = "a" ] || [ "${stage}" = "all" ]; then
  stage_a
fi

if [ "${stage}" = "c" ]; then
  if [ ! -f "${session_file}" ]; then
    die "stage C needs the stage A session record at ${session_file}"
  fi
  if [ ! -f "${approval}" ]; then
    die "stage C approval artifact ${approval} does not exist"
  fi
  work=$(json_field "${session_file}" work)
  fleet=$(json_field "${session_file}" fleet)
  sandbox_remote=$(json_field "${session_file}" sandboxRemote)
  sandbox_default=$(json_field "${session_file}" sandboxDefaultBranch)
  toy_clone=$(json_field "${session_file}" toyClone)
  task_branch=$(json_field "${session_file}" taskBranch)
  payload_commit=$(json_field "${session_file}" payloadCommit)
  pr_url=$(json_field "${session_file}" prUrl)
  TIPHYS_HOLDER_ID=$(json_field "${session_file}" holderId)
  export TIPHYS_HOLDER_ID
  record_seq=$(json_field "${session_file}" recordSeq)
  note_step B1 assertion "stage B owner authorization artifact supplied" \
    "approval artifact: ${approval}"
fi

if [ "${mode}" = "local" ]; then
  stage_b_local
  stage_c
  echo "m1-exit-test: local mode complete, evidence in ${evidence}"
elif [ "${stage}" = "a" ]; then
  stage_b_full_pending
  # Re-write the session AFTER the pending-owner-action record, so
  # --stage c resumes past it instead of overwriting it (CR-600).
  write_session
  echo "m1-exit-test: stage A complete. Stage B is the owner's: record the approval, run gh pr merge ${pr_url} --squash, then re-run with --stage c --approval <file>."
else
  stage_c
  echo "m1-exit-test: full mode stages A and C complete, evidence in ${evidence}"
fi
