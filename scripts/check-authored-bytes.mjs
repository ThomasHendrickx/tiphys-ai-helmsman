#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: root });
  if (listed.error !== undefined || listed.status !== 0) {
    throw new Error(`git ls-files failed with exit ${String(listed.status)}: ${String(listed.stderr)}`);
  }
  const paths = listed.stdout.toString("utf8").split("\0").filter(Boolean);
  const violations = [];
  for (const path of paths) {
    if (isExempt(path)) continue;
    for (const finding of forbiddenBytes(readFileSync(resolve(root, path)))) {
      violations.push({ path, ...finding });
    }
  }
  return violations;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
