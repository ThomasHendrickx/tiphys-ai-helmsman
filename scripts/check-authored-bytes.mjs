#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXEMPT_FILE = "delivery/intake/orchestrated-delivery-process.md";
const EXEMPT_TREE = "test/fixtures/json-schema-test-suite/";

export function isExempt(path) {
  return path === EXEMPT_FILE || path.startsWith(EXEMPT_TREE);
}

export function forbiddenBytes(bytes) {
  const findings = [];
  for (let offset = 0; offset < bytes.length; offset += 1) {
    const byte = bytes[offset];
    if (byte > 0x7f) findings.push({ offset, kind: "non-ASCII", byte });
    else if (byte <= 0x08 || byte === 0x0b || byte === 0x0c || (byte >= 0x0e && byte <= 0x1f)) {
      findings.push({ offset, kind: "control", byte });
    }
  }
  return findings;
}

export function checkAuthoredBytes(root = process.cwd()) {
  const listed = spawnSync("git", ["ls-files", "-s", "-z"], { cwd: root });
  if (listed.error !== undefined || listed.status !== 0) {
    throw new Error(`git ls-files failed with exit ${String(listed.status)}: ${String(listed.stderr)}`);
  }
  const entries = listed.stdout.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const separator = entry.indexOf("\t");
    const match = /^(\d+) ([0-9a-f]+) (\d+)$/.exec(entry.slice(0, separator));
    if (separator < 0 || match === null || match[3] !== "0") {
      throw new Error(`git ls-files returned an unsupported index entry: ${JSON.stringify(entry)}`);
    }
    return { path: entry.slice(separator + 1), oid: match[2] };
  });
  const worktree = spawnSync("git", ["diff", "--quiet", "--no-ext-diff", "--"], { cwd: root });
  if (worktree.error !== undefined || (worktree.status !== 0 && worktree.status !== 1)) {
    throw new Error(`git diff failed with exit ${String(worktree.status)}: ${String(worktree.stderr)}`);
  }
  if (worktree.status === 1) {
    throw new Error("tracked working tree differs from the index; stage or revert it before checking authored bytes");
  }
  if (entries.length === 0) return [];
  const blobs = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: entries.map((entry) => entry.oid).join("\n") + "\n",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (blobs.error !== undefined || blobs.status !== 0) {
    throw new Error(`git cat-file failed with exit ${String(blobs.status)}: ${String(blobs.stderr)}`);
  }
  const violations = [];
  let offset = 0;
  for (const { path, oid } of entries) {
    const headerEnd = blobs.stdout.indexOf(0x0a, offset);
    if (headerEnd < 0) {
      throw new Error(`git cat-file returned no header for ${path}`);
    }
    const header = blobs.stdout.subarray(offset, headerEnd).toString("ascii");
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (match === null || match[1] !== oid) {
      throw new Error(`git cat-file returned an invalid header for ${path}: ${header}`);
    }
    const size = Number(match[2]);
    const start = headerEnd + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || blobs.stdout[end] !== 0x0a) {
      throw new Error(`git cat-file returned an invalid blob for ${path}`);
    }
    const bytes = blobs.stdout.subarray(start, end);
    offset = end + 1;
    if (isExempt(path)) continue;
    for (const finding of forbiddenBytes(bytes)) {
      violations.push({ path, ...finding });
    }
  }
  return violations;
}

// IDENTITY, NOT STRING EQUALITY (M4-P2 fix round, 2026-09-16). Measured on
// node v26.6.0: invoked through a symlinked directory in the path, or
// through a symlink to this file, process.argv[1] carries the caller's
// spelling while import.meta.url carries the canonical one, so the bare
// comparison is false and this gate silently does nothing and exits 0. A
// guard that cannot go red is the T-008 shape. This is the same form
// src/gates/deploy.ts:27 already uses, not a second dialect.
function invokedDirectly() {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    const violations = checkAuthoredBytes();
    for (const item of violations) {
      process.stderr.write(`${item.path}:${String(item.offset)}: ${item.kind} byte 0x${item.byte.toString(16).padStart(2, "0")}\n`);
    }
    process.exitCode = violations.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`check-authored-bytes: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
