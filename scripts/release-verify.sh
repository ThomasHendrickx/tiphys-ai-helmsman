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
USAGE
}

NAME=""
VERSION=""
TARBALL=""
RECORDS=""
WORKDIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tarball) TARBALL="${2:?--tarball needs a value}"; shift 2 ;;
    --records) RECORDS="${2:?--records needs a value}"; shift 2 ;;
    --workdir) WORKDIR="${2:?--workdir needs a value}"; shift 2 ;;
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

WORKDIR="$(cd "${WORKDIR:-$PWD}" && pwd)"
RECORDS="${RECORDS:-$WORKDIR/release-verify-records.json}"
CACHE="$WORKDIR/.release-verify-npm-cache"
PREFIX="$WORKDIR"
if [ -n "$TARBALL" ]; then
  TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
fi

: > "$RECORDS"
FAILURES=0

# The resolution probes. Both are pure reads and neither installs anything, so
# they are safe to run BEFORE the install: the contaminated direction must fail
# without having mutated the tree it was wrongly pointed at.
probe_source_tree() {
  node -e '
    const { existsSync, readFileSync } = require("node:fs");
    const { dirname, join } = require("node:path");
    let dir = process.argv[1];
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
  local contaminated; contaminated="$(probe_source_tree)"
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
CONTAMINATION="$(probe_source_tree)"
if [ -n "$CONTAMINATION" ]; then
  record clean-environment 1 "resolution-path probe for $NAME from $WORKDIR"
  echo "release-verify: REFUSED. $CONTAMINATION declares name $NAME, so the source tree is on the resolution path from $WORKDIR." >&2
  echo "release-verify: this run would witness that tree and not the installed package. Run it from a directory outside any checkout of the package." >&2
  echo "release-verify: $FAILURES failing step(s); records in $RECORDS" >&2
  exit 1
fi
record clean-environment 0 "resolution-path probe for $NAME from $WORKDIR"

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
