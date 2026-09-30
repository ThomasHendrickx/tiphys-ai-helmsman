#!/usr/bin/env bash
#
# Make the checkout holding this script ready to build and test: a full clone,
# a Node at or above package.json's engines.node floor, installed dependencies
# and a freshly built dist/. Idempotent: on a ready tree it makes no network
# call. Every failing step prints one line naming the step and exits nonzero.
#
# Status lines go to stdout and the last one is the summary; the output of git,
# curl and npm goes to stderr, because a SessionStart hook's stdout becomes
# session context.

set -euo pipefail

NODE_PINNED=26.6.0
# A directory URL holding node-v<pinned>-linux-x64.tar.xz and SHASUMS256.txt.
NODE_DIST_URL="${TIPHYS_NODE_DIST_URL:-https://nodejs.org/dist/v${NODE_PINNED}}"
# Never /tmp: a test that drops to an unprivileged uid must be able to reach
# the interpreter (see the traversal warning below).
TOOLCHAINS_DIR="${TIPHYS_TOOLCHAINS_DIR:-$HOME/.toolchains}"

export npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false

fail() {
  echo "setup-env: $1: $2" >&2
  exit 1
}

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || fail "locate" "cannot resolve the repository root"
cd "$root"

# 1. Full clone.
shallow="$(git rev-parse --is-shallow-repository)" || fail "full clone" "git rev-parse failed in $root"
if [ "$shallow" = "true" ]; then
  git fetch --quiet --unshallow origin >&2 || fail "full clone" "git fetch --unshallow origin failed"
  shallow="$(git rev-parse --is-shallow-repository)" || fail "full clone" "git rev-parse failed after fetch"
fi
[ "$shallow" = "false" ] || fail "full clone" "the repository is still shallow"

# 2. Node floor.
version_ge() { # version_ge A B: A >= B, both X.Y.Z
  local IFS=.
  local -a a=($1) b=($2)
  local i
  for i in 0 1 2; do
    if ((10#${a[i]:-0} > 10#${b[i]:-0})); then return 0; fi
    if ((10#${a[i]:-0} < 10#${b[i]:-0})); then return 1; fi
  done
  return 0
}

node_version() { # prints X.Y.Z of the node on PATH, or nothing
  local v
  v="$(node --version 2>/dev/null)" || return 0
  [[ "$v" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]] && echo "${BASH_REMATCH[1]}"
  return 0
}

declared="$(tr -d '\n' < package.json \
  | grep -o '"engines"[[:space:]]*:[[:space:]]*{[^}]*}' \
  | grep -o '"node"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | sed -E 's/.*"([^"]*)"$/\1/')" || declared=""
[ -n "$declared" ] || fail "node floor" "package.json declares no engines.node"
[[ "$declared" =~ ^\>=[[:space:]]*v?([0-9]+)(\.([0-9]+))?(\.([0-9]+))?$ ]] \
  || fail "node floor" "engines.node '$declared' is not of the form >=X[.Y[.Z]]"
floor="${BASH_REMATCH[1]}.${BASH_REMATCH[3]:-0}.${BASH_REMATCH[5]:-0}"

toolchain=""
current="$(node_version)"
if [ -z "$current" ] || ! version_ge "$current" "$floor"; then
  version_ge "$NODE_PINNED" "$floor" || fail "node floor" "pinned Node $NODE_PINNED is below the floor $floor"
  name="node-v${NODE_PINNED}-linux-x64"
  toolchain="$TOOLCHAINS_DIR/$name"
  if [ ! -x "$toolchain/bin/node" ]; then
    [ ! -e "$toolchain" ] || fail "node install" "$toolchain exists and has no bin/node"
    mkdir -p "$TOOLCHAINS_DIR" || fail "node install" "cannot create $TOOLCHAINS_DIR"
    stage="$(mktemp -d "$TOOLCHAINS_DIR/.stage-$name.XXXXXX")" || fail "node install" "cannot create a staging directory in $TOOLCHAINS_DIR"
    trap 'rm -rf "$stage"' EXIT
    curl -fsSL -o "$stage/$name.tar.xz" "$NODE_DIST_URL/$name.tar.xz" >&2 \
      || fail "node download" "cannot fetch $NODE_DIST_URL/$name.tar.xz"
    curl -fsSL -o "$stage/SHASUMS256.txt" "$NODE_DIST_URL/SHASUMS256.txt" >&2 \
      || fail "node download" "cannot fetch $NODE_DIST_URL/SHASUMS256.txt"
    expected="$(awk -v f="$name.tar.xz" '$2 == f { print $1 }' "$stage/SHASUMS256.txt")"
    [ -n "$expected" ] || fail "node checksum" "SHASUMS256.txt has no line for $name.tar.xz"
    if command -v sha256sum > /dev/null; then
      actual="$(sha256sum "$stage/$name.tar.xz" | awk '{ print $1 }')"
    else
      actual="$(shasum -a 256 "$stage/$name.tar.xz" | awk '{ print $1 }')"
    fi
    [ "$actual" = "$expected" ] || fail "node checksum" "sha256 of $name.tar.xz is $actual, SHASUMS256.txt says $expected"
    tar -xJf "$stage/$name.tar.xz" -C "$stage" >&2 || fail "node install" "cannot extract $name.tar.xz"
    [ -x "$stage/$name/bin/node" ] || fail "node install" "$name.tar.xz holds no $name/bin/node"
    mv "$stage/$name" "$toolchain" || fail "node install" "cannot move the toolchain to $toolchain"
    rm -rf "$stage"
    trap - EXIT
  fi
  PATH="$toolchain/bin:$PATH"
  export PATH
  hash -r
  current="$(node_version)"
  [ -n "$current" ] && version_ge "$current" "$floor" \
    || fail "node floor" "$toolchain/bin/node reports '${current:-nothing}', below the floor $floor"
  dir="$toolchain"
  while [ "$dir" != "/" ]; do
    mode="$(stat -c %A "$dir" 2> /dev/null)" || break
    if [ "${mode:9:1}" != "x" ] && [ "${mode:9:1}" != "t" ]; then
      echo "setup-env: warning: $dir is not traversable by other users, so a test that drops to an unprivileged uid cannot run this node; set TIPHYS_TOOLCHAINS_DIR to a traversable directory"
      break
    fi
    dir="$(dirname "$dir")"
  done
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    line="export PATH=\"$toolchain/bin:\$PATH\""
    grep -qxF "$line" "$CLAUDE_ENV_FILE" 2> /dev/null \
      || printf '%s\n' "$line" >> "$CLAUDE_ENV_FILE" \
      || fail "env file" "cannot append to $CLAUDE_ENV_FILE"
  fi
fi

# 3. Dependencies: npm ci unless node_modules/.package-lock.json records exactly
# what package-lock.json asks for (optional packages for other platforms are
# absent from it by design).
if node -e '
  const fs = require("fs");
  const want = JSON.parse(fs.readFileSync("package-lock.json", "utf8")).packages ?? {};
  const have = JSON.parse(fs.readFileSync("node_modules/.package-lock.json", "utf8")).packages ?? {};
  for (const [k, v] of Object.entries(have)) if (JSON.stringify(want[k]) !== JSON.stringify(v)) process.exit(1);
  for (const [k, v] of Object.entries(want)) if (k.startsWith("node_modules/") && !(k in have) && v.optional !== true) process.exit(1);
' 2> /dev/null; then
  echo "setup-env: npm ci skipped, node_modules matches package-lock.json"
else
  npm ci >&2 || fail "npm ci" "npm ci failed"
fi

# 4. Build, from clean. tsc -b decides what to emit from its .tsbuildinfo, not
# from the outputs, so an output deleted or edited since the last build
# survives an incremental build that exits 0. Remove dist/ and every ignored,
# untracked .tsbuildinfo (plugin/dist carries one) first.
rm -rf dist || fail "build" "cannot remove dist/"
git ls-files -z --others --ignored --exclude-standard -- '*.tsbuildinfo' | xargs -0 rm -f \
  || fail "build" "cannot remove the ignored .tsbuildinfo files"
npm run build >&2 || fail "build" "npm run build failed"
[ -d dist ] || fail "build" "npm run build exited 0 and left no dist/"

echo "setup-env: full clone, node v$current, dist built"
