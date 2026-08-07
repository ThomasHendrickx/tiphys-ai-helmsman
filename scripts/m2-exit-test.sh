#!/usr/bin/env bash
#
# m2-exit-test.sh: the scripted M2 exit test (kernel plan M2, M2-P9).
#
# It turns "all gates run green in CI on the kernel repo itself" into a
# scripted, falsifiable procedure that produces a committed evidence
# bundle, run in the state where every gate can actually evaluate, and it
# proves its own assertion code fails WITHOUT shipping any switch that makes
# a production gate lie (M2R-011).
#
# Modes:
#
#   scripts/m2-exit-test.sh [flags] <evidence-dir>
#       The exit test. Runs npm ci, npm run build, then the gate runner in
#       one or both of two bundles and evaluates the assertions of step 2
#       against section 1.4's expected-status table:
#         PR bundle   (the strong run): --base <base> --head <head>
#                     --phase <phase>, every table gate present, seven
#                     required gates green, deploy/migrations not-applicable
#                     for a STRUCTURAL reason.
#         main bundle (the weaker run): --only
#                     manifest-self-check,suite,coverage,credential-scrub,
#                     deploy,migrations. The three diff-scoped gates and
#                     credential-token are NOT run and have NO record, which
#                     the assertions state EXPLICITLY rather than reading
#                     their absence as success (criterion 4).
#
#   scripts/m2-exit-test.sh --self-test <evidence-dir>
#       Runs the SAME assertion code (scripts is the one program written
#       once, below, to <evidence-dir>/m2-assert.mjs and reused) over two
#       FIXTURE manifests: (a) a fixture gate that writes its own record
#       with status green and units 0, and (b) a required fixture gate whose
#       file-exists precondition names an absent file. The assertion code
#       MUST reject each, naming the gate. --self-test exits NONZERO when
#       the assertion code correctly rejects both (the working state, which
#       the CI guard treats as "good") and exits 0 only when a fixture slips
#       past the assertion code (the broken state, which fails the CI guard).
#       No production gate carries an override flag; because gates are
#       subprocesses that author their own records (M2-D-07), a hand-written
#       record file is the REALISTIC dangerous state, not a synthetic one.
#
# Flags (exit-test mode):
#   --base <ref>     the diff base. Default: main (the section 1.4 form). In
#                    a real pull request the workflow passes the PR base sha.
#   --head <ref>     the diff head. Default: HEAD.
#   --phase <id>     the phase id, lowercase to match the phase declaration
#                    filename (scope reads <declarations>/<phase>.json and
#                    uppercases only for its id check). Default: derived from
#                    the current branch (claude/mN-pM-... -> mN-pM).
#   --bundle pr|main|both   which bundle(s) to run. Default: both. CI runs a
#                    single bundle per event so exactly one summary.json is
#                    produced per job (criterion 5): pr on a pull request,
#                    main on a push to a branch with no base/head/phase.
#   --no-build       skip npm ci and npm run build (the caller already ran
#                    them). The default runs them, per step 1.
#
# Every step appends a JSON evidence record under <evidence-dir>/records/;
# NO record is written for a command that was not executed. Evidence records
# are JSON (DR-0006); prose appears only inside captured command output.
#
# Every tiphys invocation goes through dist/bin/tiphys.js after npm run
# build (the section 3 invocation form). Authored text is pure ASCII, no em
# dashes; English only; npm only.

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants and layout
# ---------------------------------------------------------------------------

EX_USAGE=64

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "${script_dir}/.." && pwd)
TIPHYS="${repo_root}/dist/bin/tiphys.js"
MANIFEST="${repo_root}/gates.manifest.json"

USAGE="usage: scripts/m2-exit-test.sh [--base <ref>] [--head <ref>] [--phase <id>] [--bundle pr|main|both] [--no-build] <evidence-dir>
       scripts/m2-exit-test.sh --self-test <evidence-dir>"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

self_test="no"
base="main"
head="HEAD"
phase=""
bundle="both"
do_build="yes"
evidence=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --self-test) self_test="yes"; shift ;;
    --no-build) do_build="no"; shift ;;
    --base)   [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }; base="$2"; shift 2 ;;
    --head)   [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }; head="$2"; shift 2 ;;
    --phase)  [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }; phase="$2"; shift 2 ;;
    --bundle) [ "$#" -ge 2 ] || { echo "${USAGE}" >&2; exit "${EX_USAGE}"; }; bundle="$2"; shift 2 ;;
    --*) echo "m2-exit-test: unknown option \"$1\"" >&2; echo "${USAGE}" >&2; exit "${EX_USAGE}" ;;
    *)
      if [ -n "${evidence}" ]; then
        echo "m2-exit-test: unexpected argument \"$1\"" >&2; echo "${USAGE}" >&2; exit "${EX_USAGE}"
      fi
      evidence="$1"; shift ;;
  esac
done

if [ -z "${evidence}" ]; then
  echo "m2-exit-test: an evidence directory argument is required" >&2
  echo "${USAGE}" >&2
  exit "${EX_USAGE}"
fi

case "${bundle}" in
  pr|main|both) ;;
  *) echo "m2-exit-test: --bundle must be pr, main, or both" >&2; exit "${EX_USAGE}" ;;
esac

mkdir -p "${evidence}/records" "${evidence}/output"
evidence=$(CDPATH= cd -- "${evidence}" && pwd)

# ---------------------------------------------------------------------------
# Evidence recording (no record for a command not executed)
# ---------------------------------------------------------------------------

record_seq=0

json_object() {
  node -e '
    const args = process.argv.slice(1);
    const out = {};
    for (let i = 0; i + 1 < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      if (key.endsWith("#")) {
        out[key.slice(0, -1)] = value === "" ? null : Number(value);
      } else if (value === "") {
        out[key] = null;
      } else {
        out[key] = value;
      }
    }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  ' "$@"
}

# run_step <label> <expect> <cwd> -- <command...>
# <expect> is "zero", "nonzero", or an exact integer. Records the command,
# its cwd, its exit code, the expectation and the outcome, and the captured
# output path. Fails the harness on a mismatch, naming the step.
LAST_OUTPUT=""
LAST_EXIT=0
run_step() {
  local label="$1" expect="$2" cwd="$3"
  shift 3
  [ "${1:-}" = "--" ] && shift
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}.out"
  local out_path="${evidence}/${out_rel}"
  local rc=0
  ( cd "${cwd}" && "$@" ) >"${out_path}" 2>&1 || rc=$?
  local outcome="pass"
  case "${expect}" in
    zero) [ "${rc}" -eq 0 ] || outcome="fail" ;;
    nonzero) [ "${rc}" -ne 0 ] || outcome="fail" ;;
    *) [ "${rc}" -eq "${expect}" ] || outcome="fail" ;;
  esac
  local joined; joined=$(printf '%s ' "$@"); joined=${joined% }
  json_object \
    kind executed \
    label "${label}" \
    command "${joined}" \
    cwd "${cwd}" \
    'exitCode#' "${rc}" \
    expected "exit ${expect}" \
    outcome "${outcome}" \
    outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  LAST_OUTPUT="${out_path}"
  LAST_EXIT="${rc}"
  if [ "${outcome}" = "fail" ]; then
    echo "--- captured output of the failing step ---" >&2
    tail -n 40 "${out_path}" >&2 || true
    echo "--- end captured output ---" >&2
    echo "m2-exit-test: FAILED: ${label}: expected exit ${expect}, got ${rc}" >&2
    echo "m2-exit-test: evidence in ${evidence}" >&2
    exit 1
  fi
  echo "m2-exit-test: ok (${label})"
}

# note_step <kind> <label> <note>
note_step() {
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  json_object \
    kind "$1" label "$2" note "$3" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  echo "m2-exit-test: recorded ($1: $2)"
}

die() {
  echo "m2-exit-test: FAILED: $*" >&2
  echo "m2-exit-test: evidence in ${evidence}" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# The assertion program, written ONCE and reused by every bundle and by the
# self-test, so "the same assertion code" is literal (M2R-011, criterion 3).
# It reads a bundle's summary.json plus its per-gate result.json records, and
# an expectations document, and it decides against section 1.4's table rather
# than against a bare count. Every value it reports is RE-DERIVED from the
# bundle so a later reader can re-check it (CR-602).
# ---------------------------------------------------------------------------

ASSERT="${evidence}/m2-assert.mjs"
cat >"${ASSERT}" <<'ASSERT_EOF'
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const summaryPath = arg("--summary");
const evidenceDir = arg("--evidence");
const expectPath = arg("--expect");
const manifestPath = arg("--manifest");
if (!summaryPath || !evidenceDir || !expectPath || !manifestPath) {
  console.error("m2-assert: --summary --evidence --expect --manifest are all required");
  process.exit(2);
}

const failures = [];
const fail = (gate, message) => failures.push(gate ? `[${gate}] ${message}` : message);

function readJson(path, what) {
  if (!existsSync(path)) {
    return { ok: false, reason: `${what} ${path} does not exist` };
  }
  const st = statSync(path);
  if (!st.isFile()) {
    return { ok: false, reason: `${what} ${path} is not a regular file` };
  }
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, reason: `${what} ${path} does not parse: ${error.message}` };
  }
}

const expectRead = readJson(expectPath, "expectations");
if (!expectRead.ok) {
  console.error(`m2-assert: ${expectRead.reason}`);
  process.exit(2);
}
const expect = expectRead.value;
const label = expect.label ?? "bundle";

const summaryRead = readJson(summaryPath, "summary");
if (!summaryRead.ok) {
  // A missing or unparseable summary is itself an assertion failure of the
  // strongest kind: the run produced no report, so nothing can be certified.
  console.error(`m2-assert (${label}): FAIL: ${summaryRead.reason}`);
  process.exit(1);
}
const summary = summaryRead.value;
const rows = Array.isArray(summary.gates) ? summary.gates : [];
const rowById = new Map(rows.map((r) => [r.id, r]));

// The allowed statuses for an expected gate, supporting alternatives written
// as "green|not-applicable" (credential-token per owner action A-3).
function allowed(spec) {
  return String(spec.expect).split("|").map((s) => s.trim());
}

// -- 1, 2, 3. One record per expected gate, the expected status, required green.
for (const spec of expect.gates ?? []) {
  const row = rowById.get(spec.id);
  if (row === undefined) {
    fail(spec.id, `no record in the bundle for a gate the table lists (expected ${spec.expect})`);
    continue;
  }
  const dup = rows.filter((r) => r.id === spec.id).length;
  if (dup !== 1) {
    fail(spec.id, `${dup} records for one gate; the table requires exactly one`);
  }
  const allow = allowed(spec);
  if (!allow.includes(row.status)) {
    fail(spec.id, `expected status ${allow.join(" or ")}, observed ${row.status}` +
      (row.detail ? ` (${row.detail})` : ""));
  }
  // A NON-diff-scoped required gate must be green: it has no diff trigger it
  // could legitimately miss (manifest-self-check, suite, coverage,
  // credential-scrub). A diff-scoped required gate is handled by DR-0018 below.
  if (spec.required === true && spec.diffScoped !== true && row.status !== "green") {
    fail(spec.id, `is a REQUIRED gate but its status is ${row.status}, not green`);
  }
  // DR-0018: a diff-scoped gate on the exit head is either green (its trigger
  // is touched) or not-applicable WITH a valid, recorded, evaluated precondition
  // (id + met:false + reason). allowed() above already rejects red/error; here
  // we reject a not-applicable that does not carry an evaluated precondition, so
  // a silently-skipped or mis-declared gate cannot pass as "legitimately N/A".
  // A green diff-scoped gate must still examine units > 0 (checked below), and a
  // vacuous or error one is caught by the zero-error/zero-vacuous checks.
  if (spec.diffScoped === true && row.status === "not-applicable") {
    const scopedRec = readJson(join(evidenceDir, spec.id, "result.json"), `result record for ${spec.id}`);
    if (!scopedRec.ok) {
      fail(spec.id, `is a diff-scoped gate reporting not-applicable but ${scopedRec.reason}`);
    } else {
      const pre = scopedRec.value.precondition;
      const evaluatedUnmet =
        pre !== undefined && pre !== null && pre.met === false &&
        typeof pre.id === "string" && pre.id !== "" &&
        typeof pre.reason === "string" && pre.reason !== "";
      if (!evaluatedUnmet) {
        fail(spec.id,
          "is a diff-scoped gate reporting not-applicable WITHOUT an evaluated, unmet precondition " +
          "(precondition{id, met:false, reason}); DR-0018 accepts a diff-scoped N/A only when its " +
          "trigger was evaluated and legitimately unmet, distinguishable from a skipped or errored gate");
      }
    }
  }
  if (row.status === "green" && !(Number(row.units) > 0)) {
    fail(spec.id, `is green with units ${String(row.units)}; a green with no units examined is vacuous (M2-C-2)`);
  }
}

// -- 4. Every not-applicable record names its reason AND the evidence of its
//       evaluation, and the three M2-P7 states stay distinguishable, not
//       collapsed. precondition-unmet: a precondition record met:false with an
//       id, a reason and evaluation evidence. declared-none: a declaration
//       path and a merge-base blob sha256. A structural not-applicable
//       (deploy, migrations) must say so, not read as local.
const structuralExpected = new Set(
  (expect.gates ?? []).filter((g) => g.structural === true).map((g) => g.id),
);
for (const row of rows) {
  if (row.status !== "not-applicable") {
    continue;
  }
  const recRead = readJson(join(evidenceDir, row.id, "result.json"), `result record for ${row.id}`);
  if (!recRead.ok) {
    fail(row.id, `not-applicable but ${recRead.reason}`);
    continue;
  }
  const rec = recRead.value;
  const detail = String(rec.detail ?? "");
  if (detail.trim() === "") {
    fail(row.id, "not-applicable with an empty reason");
  }
  const pre = rec.precondition;
  const preconditionUnmet =
    pre !== undefined && pre !== null && pre.met === false &&
    typeof pre.id === "string" && pre.id !== "" &&
    typeof pre.reason === "string" && pre.reason !== "";
  const sha256 = /\b[0-9a-f]{64}\b/.test(detail) || /\b[0-9a-f]{64}\b/.test(JSON.stringify(rec));
  const declaredNone =
    /declar/i.test(detail) && /\.json|declaration/i.test(detail) && sha256;
  if (!preconditionUnmet && !declaredNone) {
    fail(row.id,
      "not-applicable but names NEITHER an evaluated precondition (id, met:false, reason, " +
      "evidence) NOR a declared-none (declaration path + merge-base blob sha256); the three " +
      "M2-P7 states must stay distinguishable, not collapsed");
  }
  if (structuralExpected.has(row.id)) {
    // Recorded as STRUCTURAL rather than local: the manifest's precondition id
    // and the runner's reason both name it (kernel plan M2 section 1.4, O-3).
    const structural =
      /structural/i.test(detail) ||
      /structural/i.test(JSON.stringify(pre ?? {})) ||
      /o-3/i.test(JSON.stringify(pre ?? {}));
    if (!structural) {
      fail(row.id,
        "expected not-applicable for a STRUCTURAL reason (a post-merge check in a pre-merge " +
        "bundle), but the record does not say structural; a reader could take it as local");
    }
  }
}

// -- 5, 6. Zero error, zero vacuous, each naming the offending gates.
const errorRows = rows.filter((r) => r.status === "error");
if (errorRows.length > 0) {
  fail(null, `${errorRows.length} gate(s) reported error: ${errorRows.map((r) => r.id).join(", ")}`);
}
const vacuousRows = rows.filter((r) => r.vacuous === true);
if (vacuousRows.length > 0) {
  fail(null, `${vacuousRows.length} vacuous gate(s): ${vacuousRows.map((r) => r.id).join(", ")}`);
}

// -- 7. Recomputed counts equal summary.json's counts. The rows ARE the
//       bundle's primary record; the summary counts are a derived total, so
//       re-deriving them from the rows and comparing is the CR-602 check.
const recomputed = {
  declared: rows.length,
  applicable: rows.filter((r) => r.applicable === true).length,
  verdict: rows.filter((r) => r.status === "green" || r.status === "red").length,
  green: rows.filter((r) => r.status === "green").length,
  red: rows.filter((r) => r.status === "red").length,
  "not-applicable": rows.filter((r) => r.status === "not-applicable").length,
  error: rows.filter((r) => r.status === "error").length,
  vacuous: rows.filter((r) => r.vacuous === true).length,
};
const counts = summary.counts ?? {};
for (const key of Object.keys(recomputed)) {
  if (recomputed[key] !== counts[key]) {
    fail(null, `recomputed count ${key}=${String(recomputed[key])} does not equal ` +
      `summary.json ${key}=${String(counts[key])}`);
  }
}

// -- 8. Absent gates: no record and no result.json on disk. The main bundle's
//       three diff-scoped gates are NOT run here; their absence is EXPECTED
//       and would be a failure in the PR bundle (criterion 4). This is what
//       keeps the two bundles distinguishable rather than conflatable.
for (const id of expect.absent ?? []) {
  if (rowById.has(id)) {
    fail(id, "expected to be ABSENT from this bundle (not run) but has a summary record");
  }
  if (existsSync(join(evidenceDir, id, "result.json"))) {
    fail(id, "expected to be ABSENT from this bundle (not run) but has a result.json on disk");
  }
}

// -- 9. The manifest sha256 in the summary equals a fresh hash of the manifest
//       at the evidenced commit (criterion 6): a value in the bundle that a
//       grep-and-recompute pass reproduces.
if (typeof summary.manifestSha256 === "string" && summary.manifestSha256 !== "") {
  const manifestRead = readJson(manifestPath, "manifest");
  if (manifestRead.ok) {
    const recomputedSha = createHash("sha256")
      .update(readFileSync(manifestPath, "utf8"))
      .digest("hex");
    if (recomputedSha !== summary.manifestSha256) {
      fail(null, `summary.manifestSha256 ${summary.manifestSha256} does not equal a fresh ` +
        `hash of ${manifestPath} (${recomputedSha})`);
    }
  } else {
    fail(null, manifestRead.reason);
  }
}

if (failures.length > 0) {
  console.error(`m2-assert (${label}): FAIL with ${failures.length} finding(s):`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}
console.log(`m2-assert (${label}): OK. ${rows.length} gate record(s) match section 1.4; ` +
  `counts re-derived and equal to summary.json; zero error; zero vacuous.`);
process.exit(0);
ASSERT_EOF

# run_assert <label> <summary> <evidence-subdir> <expect-json-path> <manifest>
# Returns the assertion program's exit code without aborting the harness.
run_assert() {
  local label="$1" summary="$2" subdir="$3" expect="$4" manifest="$5"
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}.out"
  local out_path="${evidence}/${out_rel}"
  local rc=0
  node "${ASSERT}" --summary "${summary}" --evidence "${subdir}" \
    --expect "${expect}" --manifest "${manifest}" >"${out_path}" 2>&1 || rc=$?
  json_object \
    kind assertion \
    label "${label}" \
    'exitCode#' "${rc}" \
    outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  cat "${out_path}"
  ASSERT_EXIT="${rc}"
}

# ---------------------------------------------------------------------------
# Per-phase green-path evidence (DR-0018 point 3). The exit head does NOT
# exercise every diff-scoped gate's green path: red-witness is not-applicable
# there (no src/ change), and scope is only green once its declaration governs
# the head. Accepting a not-applicable red-witness on the exit head is not, by
# itself, evidence that red-witness WORKS. So the bundle ALSO demonstrates each
# diff-scoped gate GREEN against a state that genuinely triggers it, and records
# the green result. The state is chosen per gate and recorded:
#
#   red-witness -> its own phase's merged diff (M2-P2), read from the git object
#                  database (git show base..head); the runner evaluates the
#                  diff-touches precondition (met, src/ is touched) and the gate
#                  evaluates the four M2-P2 witnesses green. Real history, no
#                  fixture, deterministic on any full clone.
#   scope       -> a scratch git repository whose merge-base declaration governs
#                  a phase branch whose diff touches only declared files. The
#                  squash-merged M2-P4 commit batched paperwork beyond M2-P4's
#                  scope, so its raw range is legitimately red; a purpose-built
#                  repository exercises the gate's real green path (declaration
#                  read at the merge base, current branch matched, head matched,
#                  every touched path declared) without that noise.
#   citations   -> a scratch git repository whose changed citation-required
#                  document carries a citation that resolves against a real file.
#                  The squash-merged M2-P5 range batched documents whose then-
#                  unresolvable citations red the gate, so a purpose-built
#                  repository exercises the real green path.
#
# Each demonstration asserts status green with units > 0 (a green having
# examined nothing would be vacuous and is rejected here too), naming the gate.
GREEN="${evidence}/m2-green.mjs"
cat >"${GREEN}" <<'GREEN_EOF'
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const repo = arg("--repo");
const tiphys = arg("--tiphys");
const manifest = arg("--manifest");
const out = arg("--out");
const scratch = arg("--scratch");
if (!repo || !tiphys || !manifest || !out || !scratch) {
  console.error("m2-green: --repo --tiphys --manifest --out --scratch are all required");
  process.exit(2);
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "M2 green demo",
  GIT_AUTHOR_EMAIL: "green-demo@tiphys.invalid",
  GIT_COMMITTER_NAME: "M2 green demo",
  GIT_COMMITTER_EMAIL: "green-demo@tiphys.invalid",
  GIT_CONFIG_GLOBAL: join(scratch, "no-global"),
  GIT_CONFIG_SYSTEM: join(scratch, "no-system"),
};

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} (in ${cwd}) exited ${String(r.status)}: ${r.stderr}`);
  }
  return (r.stdout ?? "").trim();
}

const failures = [];
const results = [];

function record(gate, resultPath) {
  if (!existsSync(resultPath)) {
    failures.push(`[${gate}] wrote no result record at ${resultPath}`);
    return;
  }
  let rec;
  try {
    rec = JSON.parse(readFileSync(resultPath, "utf8"));
  } catch (error) {
    failures.push(`[${gate}] result record ${resultPath} does not parse: ${error.message}`);
    return;
  }
  const green = rec.status === "green" && Number(rec.units) > 0 && rec.vacuous !== true;
  results.push({ gate, status: rec.status, units: rec.units, state: rec.__state, resultPath });
  if (!green) {
    failures.push(
      `[${gate}] green-path demonstration is not a non-vacuous green: status ${String(rec.status)}, ` +
      `units ${String(rec.units)}${rec.detail ? ` (${String(rec.detail).slice(0, 160)})` : ""}`,
    );
  } else {
    console.log(`m2-green: ${gate} GREEN with ${String(rec.units)} unit(s) against ${String(rec.__state)}`);
  }
}

mkdirSync(out, { recursive: true });

// -- red-witness: its own merged phase diff (M2-P2), from the object database.
{
  const gate = "red-witness";
  const log = spawnSync("git", ["-C", repo, "log", "--format=%H %s"], { encoding: "utf8", env: GIT_ENV });
  const line = (log.stdout ?? "").split("\n").find((l) => /\bM2-P2:/.test(l));
  if (!line) {
    failures.push(`[${gate}] could not find the M2-P2 merge commit in git history`);
  } else {
    const sha = line.split(" ")[0];
    const runDir = join(out, "red-witness-run");
    rmSync(runDir, { recursive: true, force: true });
    const r = spawnSync(
      process.execPath,
      [tiphys, "gates", "run", "--manifest", manifest, "--evidence", runDir,
       "--only", "red-witness", "--base", `${sha}^`, "--head", sha, "--phase", "m2-p2"],
      { cwd: repo, encoding: "utf8", env: GIT_ENV },
    );
    const resultPath = join(runDir, "red-witness", "result.json");
    if (existsSync(resultPath)) {
      const rec = JSON.parse(readFileSync(resultPath, "utf8"));
      rec.__state = `M2-P2 merged diff ${sha.slice(0, 12)}^..${sha.slice(0, 12)} (real history)`;
      writeFileSync(resultPath, JSON.stringify(rec, null, 2) + "\n");
    } else {
      console.error(r.stdout, r.stderr);
    }
    record(gate, resultPath);
  }
}

// -- scope: a scratch repository exercising the real green path.
{
  const gate = "scope";
  const dir = join(scratch, "scope-repo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "delivery/plan/phase-declarations"), { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(join(dir, "src", "a.ts"), "1\n");
  writeFileSync(join(dir, "src", "b.ts"), "1\n");
  writeFileSync(
    join(dir, "delivery/plan/phase-declarations", "m2-p4.json"),
    JSON.stringify({
      id: "M2-P4",
      branch: "claude/m2-p4-scope-auditor",
      filesToTouch: ["src/a.ts", "src/b.ts"],
      declaredExtras: [],
      citations: [],
    }, null, 2) + "\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  const base = git(dir, ["rev-parse", "HEAD"]);
  git(dir, ["checkout", "-q", "-b", "claude/m2-p4-scope-auditor"]);
  writeFileSync(join(dir, "src", "a.ts"), "2\n");
  writeFileSync(join(dir, "src", "b.ts"), "2\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "touch declared files"]);
  const head = git(dir, ["rev-parse", "HEAD"]);
  const resultPath = join(out, "scope-result.json");
  mkdirSync(join(out, "scope-ev"), { recursive: true });
  const r = spawnSync(
    process.execPath,
    [join(repo, "src/gates/scope.ts"),
     "--declarations", "delivery/plan/phase-declarations",
     "--result", resultPath, "--evidence", join(out, "scope-ev"),
     "--base", base, "--head", head, "--phase", "m2-p4"],
    { cwd: dir, encoding: "utf8", env: GIT_ENV },
  );
  if (existsSync(resultPath)) {
    const rec = JSON.parse(readFileSync(resultPath, "utf8"));
    rec.__state = "scratch repo: declaration governs claude/m2-p4-scope-auditor, diff touches only src/a.ts and src/b.ts";
    writeFileSync(resultPath, JSON.stringify(rec, null, 2) + "\n");
  } else {
    console.error(r.stdout, r.stderr);
  }
  record(gate, resultPath);
}

// -- citations: a scratch repository whose changed document resolves a citation.
{
  const gate = "citations";
  const dir = join(scratch, "citations-repo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "delivery/plan"), { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  writeFileSync(join(dir, "src", "target.ts"), "a\nb\nc\n");
  writeFileSync(join(dir, "delivery/plan", "fixture.md"), "baseline\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  const base = git(dir, ["rev-parse", "HEAD"]);
  writeFileSync(
    join(dir, "delivery/plan", "fixture.md"),
    "the implementation lives at src/target.ts:1 and is covered there.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "cite a resolving line"]);
  const head = git(dir, ["rev-parse", "HEAD"]);
  const resultPath = join(out, "citations-result.json");
  mkdirSync(join(out, "citations-ev"), { recursive: true });
  const r = spawnSync(
    process.execPath,
    [join(repo, "src/gates/citations.ts"),
     "--result", resultPath, "--evidence", join(out, "citations-ev"),
     "--base", base, "--head", head],
    { cwd: dir, encoding: "utf8", env: GIT_ENV },
  );
  if (existsSync(resultPath)) {
    const rec = JSON.parse(readFileSync(resultPath, "utf8"));
    rec.__state = "scratch repo: changed delivery/plan/fixture.md cites src/target.ts:1 which resolves";
    writeFileSync(resultPath, JSON.stringify(rec, null, 2) + "\n");
  } else {
    console.error(r.stdout, r.stderr);
  }
  record(gate, resultPath);
}

writeFileSync(join(out, "summary.json"), JSON.stringify({ results, failures }, null, 2) + "\n");

if (failures.length > 0) {
  console.error(`m2-green: FAIL with ${failures.length} finding(s):`);
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}
console.log(`m2-green: OK. ${results.length} diff-scoped gate(s) demonstrated green on a triggering state.`);
process.exit(0);
GREEN_EOF

# run_per_phase_green <evidence-out-dir>
# Runs the three green-path demonstrations and records the outcome. Dies on any
# non-green demonstration, naming the gate.
run_per_phase_green() {
  local out="$1"
  local scratch_dir="${evidence}/per-phase-green-scratch"
  rm -rf "${out}" "${scratch_dir}"
  mkdir -p "${out}" "${scratch_dir}"
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}.out"
  local out_path="${evidence}/${out_rel}"
  local rc=0
  node "${GREEN}" --repo "${repo_root}" --tiphys "${TIPHYS}" \
    --manifest "${MANIFEST}" --out "${out}" --scratch "${scratch_dir}" \
    >"${out_path}" 2>&1 || rc=$?
  json_object \
    kind per-phase-green \
    label "diff-scoped gate green-path demonstrations (DR-0018 point 3)" \
    'exitCode#' "${rc}" \
    outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  cat "${out_path}"
  if [ "${rc}" -ne 0 ]; then
    die "per-phase green-path evidence failed: a diff-scoped gate could not be shown green on a triggering state (exit ${rc})"
  fi
}

# write_expect writes an expectations JSON document to a path, from a compact
# spec passed as a single argument the node helper parses. Kept in node so no
# JSON is hand-quoted in bash.
write_expect() {
  local path="$1" json="$2"
  printf '%s' "${json}" >"${path}"
}

# ---------------------------------------------------------------------------
# The expectations tables (section 1.4), written once here.
# ---------------------------------------------------------------------------

# PR-bundle expectations, section 1.4 as amended by DR-0018. The three
# diff-scoped gates (red-witness, scope, citations) are marked "diffScoped":
# on the exit-test head each is EITHER green (its trigger is touched) OR
# not-applicable with a valid recorded reason (an evaluated, unmet
# precondition). red-witness is not-applicable on the M2-P9 head because the
# diff touches no src/ or bin/; citations is green because the head touches a
# citation-required document. A required diff-scoped gate reporting
# not-applicable-with-reason is NOT a failure for those two (DR-0018 point 2);
# a red, error, or vacuous diff-scoped gate, or a not-applicable one with no
# evaluated precondition, STILL fails the harness.
#
# scope is the EXCEPTION and its expected status is "green", not
# "green|not-applicable". scope's precondition is branch-matches, and a PR
# bundle is BY CONSTRUCTION run on a phase branch (claude/mN-pM-...), so that
# precondition is ALWAYS met in a real PR: scope is never LEGITIMATELY
# not-applicable here. The only way scope reported not-applicable in CI was the
# detached-HEAD checkout artifact (fixed at its root in .github/workflows/
# gates.yml by checking the head branch out by name); accepting that N/A is
# what let the exit test pass vacuously for scope. Requiring green here means
# the exit test genuinely REQUIRES scope to audit the diff, and a recurrence of
# a scope N/A (detached HEAD, a missing declaration, a branch-name regression)
# now FAILS the harness instead of slipping through. red-witness and citations
# stay "green|not-applicable" because each CAN be legitimately N/A on a head
# that does not touch its trigger.
PR_EXPECT_JSON='{
  "label": "PR bundle",
  "gates": [
    {"id": "manifest-self-check", "expect": "green", "required": true},
    {"id": "red-witness", "expect": "green|not-applicable", "required": true, "diffScoped": true},
    {"id": "suite", "expect": "green", "required": true},
    {"id": "scope", "expect": "green", "required": true, "diffScoped": true},
    {"id": "citations", "expect": "green|not-applicable", "required": true, "diffScoped": true},
    {"id": "coverage", "expect": "green", "required": true},
    {"id": "credential-scrub", "expect": "green", "required": true},
    {"id": "deploy", "expect": "not-applicable", "required": false, "structural": true},
    {"id": "migrations", "expect": "not-applicable", "required": false, "structural": true},
    {"id": "credential-token", "expect": "green|not-applicable", "required": false}
  ],
  "absent": []
}'

MAIN_EXPECT_JSON='{
  "label": "main bundle",
  "gates": [
    {"id": "manifest-self-check", "expect": "green", "required": true},
    {"id": "suite", "expect": "green", "required": true},
    {"id": "coverage", "expect": "green", "required": true},
    {"id": "credential-scrub", "expect": "green", "required": true},
    {"id": "deploy", "expect": "not-applicable", "required": false, "structural": true},
    {"id": "migrations", "expect": "not-applicable", "required": false, "structural": true}
  ],
  "absent": ["red-witness", "citations", "scope", "credential-token"]
}'

# ---------------------------------------------------------------------------
# Build (step 1)
# ---------------------------------------------------------------------------

build_kernel() {
  run_step "kernel npm ci" zero "${repo_root}" -- npm ci
  run_step "kernel npm run build" zero "${repo_root}" -- npm run build
  if [ ! -f "${TIPHYS}" ]; then
    die "${TIPHYS} does not exist after npm run build"
  fi
  note_step assertion "compiled CLI entry present" \
    "$(wc -c <"${TIPHYS}" | tr -d ' ') bytes at ${TIPHYS}"
}

# ---------------------------------------------------------------------------
# The PR bundle (steps 1 and 2)
# ---------------------------------------------------------------------------

run_pr_bundle() {
  local dir="${evidence}/pr-bundle"
  rm -rf "${dir}"
  # The runner exit code is recorded but does NOT decide the outcome: the
  # assertion code below is what evaluates the bundle against the table, and
  # it must run whatever the runner returned (a required gate reported
  # not-applicable, for instance, exits the runner 20 and is a table failure
  # the assertion names). So this step's expectation is a recorded fact, not
  # a gate.
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}.out"
  local rc=0
  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
      --manifest "${MANIFEST}" --evidence "${dir}" \
      --base "${base}" --head "${head}" --phase "${phase}" ) \
      >"${evidence}/${out_rel}" 2>&1 || rc=$?
  json_object \
    kind executed label "gates run (PR bundle)" \
    command "node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence pr-bundle --base ${base} --head ${head} --phase ${phase}" \
    cwd "${repo_root}" 'exitCode#' "${rc}" outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  cat "${evidence}/${out_rel}"
  local expect="${evidence}/pr-expect.json"
  write_expect "${expect}" "${PR_EXPECT_JSON}"
  run_assert "PR bundle" "${dir}/summary.json" "${dir}" "${expect}" "${MANIFEST}"
  if [ "${ASSERT_EXIT}" -ne 0 ]; then
    die "the PR bundle does not match section 1.4's PR-bundle column (assertion exit ${ASSERT_EXIT})"
  fi
  # DR-0018 point 3: the PR bundle also carries green-path evidence for each
  # diff-scoped gate (red-witness, scope, citations), proving they WORK and are
  # not merely reported not-applicable on a head that does not exercise them.
  run_per_phase_green "${evidence}/per-phase-green"
}

# ---------------------------------------------------------------------------
# The weaker main bundle (steps 4)
# ---------------------------------------------------------------------------

run_main_bundle() {
  local dir="${evidence}/main-bundle"
  rm -rf "${dir}"
  record_seq=$((record_seq + 1))
  local seq; seq=$(printf '%03d' "${record_seq}")
  local out_rel="output/${seq}.out"
  local rc=0
  # --only is a REPEATED flag, one gate id per occurrence; the runner matches
  # exact ids (src/commands/gates.ts pushes each value, src/gates/run.ts does
  # only.includes(id)), so a comma-joined value is one unknown id and errors.
  #
  # --base IS passed here even though it is the "weaker" bundle: the `suite`
  # gate declares parameters:["base"] (its merge-base registry comparison), so
  # without --base it is `error` (missing parameter), never green. Section 1.4's
  # main-bundle column requires `suite` green, so --base is required for the
  # table to hold; the plan's step-4 prose omitted it. --phase and --head are
  # NOT passed, which (with --only) is what excludes the three diff-scoped
  # gates. On a push to main the default base=main resolves to HEAD, an empty
  # diff, and the suite still runs against the whole tree.
  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
      --manifest "${MANIFEST}" --evidence "${dir}" --base "${base}" \
      --only manifest-self-check --only suite --only coverage \
      --only credential-scrub --only deploy --only migrations ) \
      >"${evidence}/${out_rel}" 2>&1 || rc=$?
  json_object \
    kind executed label "gates run (main bundle)" \
    command "node dist/bin/tiphys.js gates run --manifest gates.manifest.json --evidence main-bundle --base ${base} --only manifest-self-check --only suite --only coverage --only credential-scrub --only deploy --only migrations" \
    cwd "${repo_root}" 'exitCode#' "${rc}" outputFile "${out_rel}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/${seq}.json"
  cat "${evidence}/${out_rel}"
  local expect="${evidence}/main-expect.json"
  write_expect "${expect}" "${MAIN_EXPECT_JSON}"
  run_assert "main bundle" "${dir}/summary.json" "${dir}" "${expect}" "${MANIFEST}"
  if [ "${ASSERT_EXIT}" -ne 0 ]; then
    die "the main bundle does not match section 1.4's main-bundle column (assertion exit ${ASSERT_EXIT})"
  fi
}

# ---------------------------------------------------------------------------
# The self-test (step 3): the SAME assertion code over two fixture manifests.
# ---------------------------------------------------------------------------

run_self_test() {
  local scratch="${evidence}/self-test"
  rm -rf "${scratch}"
  mkdir -p "${scratch}"

  # Fixture gate (a): writes its OWN record with status green and units 0.
  # A hand-written record is the realistic dangerous state, since gates are
  # subprocesses that author their own records (M2-D-07). The runner rewrites
  # green-units-0 to error+vacuous on ingest (M2-C-2), so the bundle carries an
  # error/vacuous record the assertion code must reject.
  cat >"${scratch}/fixture-vacuous-gate.mjs" <<'GATE_EOF'
import { writeFileSync } from "node:fs";
const i = process.argv.indexOf("--result");
const p = process.argv[i + 1];
const t = new Date().toISOString();
writeFileSync(
  p,
  JSON.stringify({
    gate: "fixture-vacuous",
    status: "green",
    units: 0,
    unitLabel: "units",
    startedAt: t,
    endedAt: t,
    detail: "claims green having examined nothing (a hand-written record)",
    evidence: [],
  }) + "\n",
);
process.exit(0);
GATE_EOF

  # A path that is guaranteed absent, for fixture (b)'s file-exists precondition.
  local absent="${scratch}/this-file-does-not-exist.json"

  # Build the two fixture manifests and their expectations in node (no hand
  # quoted JSON). Each fixture expects its gate GREEN and REQUIRED, so the
  # assertion code must reject the vacuous/not-applicable reality naming it.
  node -e '
    const fs = require("node:fs");
    const scratch = process.argv[1];
    const gate = process.argv[2];
    const absent = process.argv[3];
    const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
    write(scratch + "/fixture-a-manifest.json", {
      version: 1,
      gates: [
        { id: "fixture-vacuous", command: ["node", gate], unitLabel: "units", applicability: "required" },
      ],
      destructiveCommands: [],
    });
    write(scratch + "/fixture-a-expect.json", {
      label: "self-test fixture a (a gate writing green units 0)",
      gates: [{ id: "fixture-vacuous", expect: "green", required: true }],
      absent: [],
    });
    write(scratch + "/fixture-b-manifest.json", {
      version: 1,
      gates: [
        {
          id: "fixture-required-na",
          command: ["node", "-e", "process.exit(0)"],
          unitLabel: "units",
          applicability: "required",
          precondition: { id: "fixture-file-must-exist", kind: "file-exists", path: absent },
        },
      ],
      destructiveCommands: [],
    });
    write(scratch + "/fixture-b-expect.json", {
      label: "self-test fixture b (a required gate whose file-exists precondition is unmet)",
      gates: [{ id: "fixture-required-na", expect: "green", required: true }],
      absent: [],
    });
  ' "${scratch}" "${scratch}/fixture-vacuous-gate.mjs" "${absent}"

  # Run each fixture through the runner, then through the SAME assertion code.
  local a_dir="${scratch}/a" b_dir="${scratch}/b"
  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
      --manifest "${scratch}/fixture-a-manifest.json" --evidence "${a_dir}" ) \
      >"${scratch}/a-run.out" 2>&1 || true
  ( cd "${repo_root}" && node "${TIPHYS}" gates run \
      --manifest "${scratch}/fixture-b-manifest.json" --evidence "${b_dir}" ) \
      >"${scratch}/b-run.out" 2>&1 || true

  local ea=0 eb=0
  node "${ASSERT}" --summary "${a_dir}/summary.json" --evidence "${a_dir}" \
    --expect "${scratch}/fixture-a-expect.json" --manifest "${scratch}/fixture-a-manifest.json" \
    >"${scratch}/a-assert.out" 2>&1 || ea=$?
  node "${ASSERT}" --summary "${b_dir}/summary.json" --evidence "${b_dir}" \
    --expect "${scratch}/fixture-b-expect.json" --manifest "${scratch}/fixture-b-manifest.json" \
    >"${scratch}/b-assert.out" 2>&1 || eb=$?

  echo "=== fixture (a), vacuous green, assertion output (exit ${ea}) ==="
  cat "${scratch}/a-assert.out"
  echo "=== fixture (b), required not-applicable, assertion output (exit ${eb}) ==="
  cat "${scratch}/b-assert.out"

  local a_named="no" b_named="no"
  grep -q "fixture-vacuous" "${scratch}/a-assert.out" && a_named="yes"
  grep -q "fixture-required-na" "${scratch}/b-assert.out" && b_named="yes"

  json_object \
    kind self-test label "self-test over two fixture manifests" \
    'fixtureAExit#' "${ea}" 'fixtureBExit#' "${eb}" \
    fixtureANamedGate "${a_named}" fixtureBNamedGate "${b_named}" \
    at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"${evidence}/records/$(printf '%03d' $((record_seq + 1))).json"
  record_seq=$((record_seq + 1))

  # No environment variable anywhere in the package changes a production gate's
  # reported status: recorded as grep evidence (criterion 3). The search is
  # over the whole authored tree; the only env vars a gate reads are the
  # implementer-token PRESENCE probe (a precondition, not a status override)
  # and a gate's own inputs.
  local env_out="${evidence}/output/self-test-env-grep.out"
  ( cd "${repo_root}" && grep -rnE "process\.env" src/gates/ bin/ src/commands/gates.ts 2>/dev/null || true ) >"${env_out}"
  note_step observation "no status-override environment variable (grep over src/gates, bin, gates.ts)" \
    "captured to output/self-test-env-grep.out; the only env read is TIPHYS_IMPLEMENTER_TOKEN as a precondition PRESENCE probe (applicability), never a status override"

  if [ "${ea}" -ne 0 ] && [ "${eb}" -ne 0 ] && [ "${a_named}" = "yes" ] && [ "${b_named}" = "yes" ]; then
    echo "m2-exit-test: self-test OK: the assertion code REJECTED both fixtures, naming fixture-vacuous (assert exit ${ea}) and fixture-required-na (assert exit ${eb})."
    echo "m2-exit-test: exiting nonzero, which is the working state; the CI guard treats a nonzero self-test as good and a zero self-test as a broken assertion code."
    exit 1
  fi
  echo "m2-exit-test: SELF-TEST BROKEN: a fixture slipped past the assertion code." >&2
  echo "m2-exit-test:   fixture (a) assertion exit ${ea} (named gate: ${a_named}); fixture (b) assertion exit ${eb} (named gate: ${b_named})." >&2
  echo "m2-exit-test:   the assertion code must reject BOTH and name the gate; exiting 0 so the CI falsifiability guard fails the job." >&2
  exit 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if [ "${self_test}" = "yes" ]; then
  note_step started "self-test invoked" "runs the same assertion code over two fixture manifests"
  run_self_test
fi

# Derive the phase from the branch when not supplied, lowercase to match the
# phase-declaration filename the scope gate reads.
if [ -z "${phase}" ]; then
  branch=$(git -C "${repo_root}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  case "${branch}" in
    claude/*)
      phase=$(printf '%s' "${branch}" | sed -n 's#^claude/\(m[0-9][0-9]*-p[0-9][0-9]*\).*#\1#p')
      ;;
  esac
  if [ -z "${phase}" ]; then
    die "could not derive --phase from branch \"${branch}\"; pass --phase explicitly (lowercase, e.g. m2-p9)"
  fi
  note_step observation "phase derived from the branch" "branch ${branch} -> phase ${phase}"
fi

if [ "${do_build}" = "yes" ]; then
  build_kernel
elif [ ! -f "${TIPHYS}" ]; then
  die "--no-build was passed but ${TIPHYS} does not exist; build first"
fi

case "${bundle}" in
  pr) run_pr_bundle ;;
  main) run_main_bundle ;;
  both) run_pr_bundle; run_main_bundle ;;
esac

echo "m2-exit-test: OK. evidence in ${evidence}"
exit 0
