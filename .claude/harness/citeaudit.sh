#!/bin/bash
# Resolve EVERY citation token (path.ext:LINE outside backticks) in the given files.
# Prints the target line so a human can see whether it is the line under discussion.
cd /tmp/claude-0/paper || exit 1
for f in "$@"; do
  echo "########## $f"
  # strip inline code spans and fenced blocks, then extract tokens
  python3 - "$f" <<'PY'
import re, sys, io
p = sys.argv[1]
s = io.open(p, encoding="ascii").read()
out, fenced = [], False
for i, line in enumerate(s.split("\n"), 1):
    if line.strip().startswith("```"):
        fenced = not fenced; continue
    if fenced or line.startswith("    "):
        continue
    stripped = re.sub(r"`[^`]*`", "", line)
    for m in re.finditer(r"(?<![A-Za-z0-9_./-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:md|ts|mjs|js|json|yaml|yml|sh)):(\d+)", stripped):
        out.append((i, m.group(1), int(m.group(2))))
for (srcline, path, n) in out:
    print("%s\t%s\t%d" % (srcline, path, n))
PY
done
