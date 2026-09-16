#!/usr/bin/env node
/**
 * The retirement inventory checker (M4-P23).
 *
 * WHY THIS EXISTS. The cutover retires three roots: `CLAUDE.md`, the
 * `.claude/skills` tree, and `.claude/orchestrator-next.mjs`. A checklist that
 * a human reads and declares met is a judgment dressed as a status, which is
 * the shape this repository has recorded three times. So the inventory is DATA
 * and this script is the guard: it exits NONZERO while any rule in those roots
 * is unresolved, and it does not ask anyone to agree that it is fine.
 *
 * THE ROW COUNT IS DERIVED, NEVER COUNTED BY HAND. `--extract` enumerates the
 * rules in the three roots by a declared, mechanical grammar (below). The
 * default run requires SET EQUALITY, by id and in both directions, between
 * that extraction and the rows of
 * `delivery/plan/cutover/retirement-inventory.json`. A rule added to a root
 * without a row is an orphan; a row whose rule has been reworded or removed is
 * a stale row. Both are red. Criterion 7 of the phase section (nothing is
 * deleted from the three roots in this phase) needs no separate check: a
 * deletion removes an anchor and the surviving row goes red as stale.
 *
 * THE ANTI-VACUITY HALF IS THE POINT. A field-presence check is a guard that
 * cannot go red, so this script EXECUTES what the rows claim:
 *
 *   - every row's `verified-by` command is re-run, and its exit code must
 *     equal the recorded one;
 *   - the command must name at least one existing path OUTSIDE the three
 *     retirement roots, so `verified-by: true` cannot pass;
 *   - every PORT row also carries a `negative-witness` running THE SAME PROBE
 *     against a subject that does not carry the rule. It must exit nonzero. A
 *     negative witness that exits 0 proves the probe discriminates nothing,
 *     and the pair (green here, red there) is what makes "verify not weaker"
 *     a command rather than a phrase.
 *
 * THE COMMANDS ARE DATA FROM A FILE AND ARE TREATED AS SUCH. They run through
 * `sh -c` with a timeout, in the repository root, with a first-token allowlist
 * and a refusal of redirection and command substitution. This is a checker for
 * a tracked, reviewed file, not a sandbox, and the restriction is here so a
 * careless row cannot write to the tree it is auditing.
 *
 * Usage:
 *   node scripts/check-retirement-inventory.mjs                 # check
 *   node scripts/check-retirement-inventory.mjs --extract       # the derivation
 *   node scripts/check-retirement-inventory.mjs --no-execute    # structure only
 *   node scripts/check-retirement-inventory.mjs --repo <dir> --json <file>
 *
 * Exit codes: 0 every row resolved; 1 at least one finding; 2 usage or an
 * unreadable input. A crash is never rendered as a pass.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* The three roots, and the grammar that turns each into rule anchors  */
/* ------------------------------------------------------------------ */

/**
 * The retirement roots, from delivery/plan/kernel-plan-m4.md section 4.6. They
 * are listed here as DATA rather than discovered, because "the three roots"
 * is a decided scope and a fourth appearing silently would change what this
 * inventory claims to cover.
 */
export const ROOTS = [
  { path: "CLAUDE.md", kind: "markdown" },
  { path: ".claude/skills", kind: "markdown-tree" },
  { path: ".claude/orchestrator-next.mjs", kind: "javascript" },
];

/**
 * THE GRAMMAR. A rule anchor is one of these lines, at column zero:
 *
 *   markdown  `# ` .. `###### `   a heading
 *   markdown  `1. ` / `3b. `      a top-level enumerated item
 *   markdown  `- `                a top-level bullet
 *   markdown  `**`                a bolded lead-in paragraph, which is this
 *                                 house style's way of naming a rule that is
 *                                 not a heading and not numbered
 *   javascript `function name(`   a top-level declaration
 *   javascript `const NAME =`     a top-level binding
 *
 * FOUR markdown kinds rather than one, and no exceptions, because a grammar
 * covering only headings drops 82 CLAUDE.md rules silently and one covering
 * only headings and numbers drops the seven `## Never` bullets, which are the
 * most binding lines in the file. The bolded-lead-in kind is not decoration
 * either: `CLAUDE.md` states the measured-false rule this phase corrects in
 * exactly that shape. Every line of every root falls inside exactly one
 * anchor's span, so a rule cannot hide between two anchors.
 *
 * Column zero is load-bearing. An indented `1.` inside a fenced block or a
 * nested bullet is CONTINUATION of its anchor, not a new rule, and treating it
 * as one would inflate the count with fragments of the rule above it.
 */
const MARKDOWN_ANCHORS = [
  { kind: "heading", re: /^(#{1,6})\s+(.+?)\s*$/ },
  { kind: "numbered", re: /^([0-9]+[a-z]?)\.\s+(.+?)\s*$/ },
  { kind: "bullet", re: /^-\s+(.+?)\s*$/ },
  { kind: "bold-lead", re: /^\*\*(.+?)\s*$/ },
];

const JS_ANCHORS = [
  { kind: "function", re: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
  { kind: "binding", re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/ },
];

function slugify(raw) {
  const stripped = raw
    .replace(/`/g, " ")
    .replace(/\*\*/g, " ")
    .replace(/[*_]/g, " ")
    .toLowerCase();
  const slug = stripped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug === "" ? "unnamed" : slug;
}

/** `CLAUDE.md` -> `claude-md`; a SKILL.md -> `skill-<dir>`; else `ref-<stem>`. */
function fileKey(relPath) {
  if (relPath === "CLAUDE.md") return "claude-md";
  if (relPath === ".claude/orchestrator-next.mjs") return "next-script";
  const parts = relPath.split("/");
  const base = parts[parts.length - 1];
  if (base === "SKILL.md") return `skill-${parts[parts.length - 2]}`;
  return `ref-${base.replace(/\.[^.]+$/, "")}`;
}

function markdownFilesUnder(repo, relDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(relative(repo, p));
    }
  };
  walk(join(repo, relDir));
  return out.sort();
}

/**
 * Enumerate every rule anchor in the three roots. Deterministic: the order is
 * root order, then path order, then line order, and duplicate slugs are
 * disambiguated by their occurrence index in exactly that order.
 */
export function extractAnchors(repo) {
  const files = [];
  for (const root of ROOTS) {
    if (root.kind === "markdown-tree") {
      for (const f of markdownFilesUnder(repo, root.path)) files.push({ rel: f, kind: "markdown", root: root.path });
    } else {
      files.push({ rel: root.path, kind: root.kind, root: root.path });
    }
  }

  const anchors = [];
  for (const f of files) {
    const abs = join(repo, f.rel);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n");
    const patterns = f.kind === "javascript" ? JS_ANCHORS : MARKDOWN_ANCHORS;
    const key = fileKey(f.rel);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const p of patterns) {
        const m = p.re.exec(line);
        if (m === null) continue;
        const label = p.kind === "heading" || p.kind === "numbered" ? m[2] : m[1];
        anchors.push({
          id: `${key}:${slugify(label)}`,
          root: f.root,
          file: f.rel,
          line: i + 1,
          kind: p.kind,
          text: line.trim(),
        });
        break;
      }
    }
  }

  const seen = new Map();
  for (const a of anchors) {
    const n = (seen.get(a.id) ?? 0) + 1;
    seen.set(a.id, n);
    if (n > 1) a.id = `${a.id}-${n}`;
  }
  return anchors;
}

/* ------------------------------------------------------------------ */
/* Command execution: constrained, timed, and never silently green     */
/* ------------------------------------------------------------------ */

const ALLOWED_FIRST_TOKENS = new Set([
  "grep",
  "git",
  "test",
  "node",
  "ls",
  "wc",
  "sed",
  "awk",
  "comm",
  "diff",
  "head",
  "tail",
  "sort",
  "cat",
]);

const FORBIDDEN = [
  { re: /[<>]/, why: "redirection" },
  { re: /\$\(/, why: "command substitution" },
  { re: /`/, why: "backtick substitution" },
];

/**
 * A row's command is data from a file. Refuse what a checker has no business
 * running.
 *
 * THE CHECK IS ON THE EXECUTABLE POSITION, NOT ON THE WHOLE STRING, and that is
 * a correction rather than a preference. A whole-string denylist for `npm` and
 * friends refused `grep -c 'npm ci' gate-registry.yaml`, which runs no npm at
 * all: it searches for the characters. Six legitimate rows were red for naming
 * a tool inside a quoted pattern. Splitting on every separator that can START a
 * command and requiring the first token of each segment to be on the allowlist
 * is both stricter (it catches a tool a denylist forgot) and correct about
 * quoted text.
 */
export function screenCommand(command) {
  const problems = [];
  if (typeof command !== "string" || command.trim() === "") {
    return ["command is missing or empty"];
  }
  for (const f of FORBIDDEN) {
    if (f.re.test(command)) problems.push(`command uses ${f.why}`);
  }
  for (const segment of command.split(/\|\||&&|[|;&\n]/)) {
    const first = segment.trim().split(/\s+/)[0];
    if (first === undefined || first === "") continue;
    if (!ALLOWED_FIRST_TOKENS.has(first)) {
      problems.push(`command segment starts with ${JSON.stringify(first)}, which is not on the allowlist`);
    }
  }
  return problems;
}

function runCommand(command, repo) {
  const r = spawnSync("sh", ["-c", command], {
    cwd: repo,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat", LC_ALL: "C" },
  });
  if (r.error !== undefined && r.error !== null) {
    return { exit: null, why: String(r.error.message ?? r.error) };
  }
  if (r.status === null) return { exit: null, why: `terminated by signal ${String(r.signal)}` };
  return { exit: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * A `verified-by` command must re-verify the rule AGAINST THE KERNEL, so it has
 * to name something outside the three roots that actually exists. This is what
 * refuses `verified-by: test -f CLAUDE.md`, which would be green and say
 * nothing about whether the kernel carries the rule.
 */
export function kernelPathsNamed(command, repo) {
  const found = [];
  const tokens = command.match(/[A-Za-z0-9_./-]+/g) ?? [];
  for (const t of tokens) {
    if (t.startsWith("-")) continue;
    if (!/[./]/.test(t)) continue;
    const rel = t.replace(/^\.\//, "").replace(/[:.,]+$/, "");
    if (rel === "" || rel.startsWith("..")) continue;
    if (rel === "CLAUDE.md" || rel.startsWith(".claude/")) continue;
    if (!existsSync(join(repo, rel))) continue;
    found.push(rel);
  }
  return [...new Set(found)];
}

/* ------------------------------------------------------------------ */
/* The row contract                                                    */
/* ------------------------------------------------------------------ */

const STATUSES = new Set(["PORTED", "GAP", "FALSE"]);
const DISPOSITIONS = new Set(["PORT", "DELETE", "KEEP"]);
const DR0029_SIDES = new Set(["process", "predicate"]);
const WITNESS_KINDS = new Set(["sibling", "history"]);

function nonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Check one row's structure. Execution is separate so `--no-execute` can give a
 * fast structural verdict without ever being mistaken for the real one: the
 * report says which pass ran.
 */
function checkRowStructure(row, anchorsById, repo, findings) {
  const id = nonEmptyString(row.id) ? row.id : "<row with no id>";
  const fail = (msg) => findings.push(`${id}: ${msg}`);

  if (!nonEmptyString(row.id)) {
    fail("row has no id");
    return;
  }
  const anchor = anchorsById.get(row.id);
  if (anchor === undefined) {
    fail("no rule with this id is extractable from the three roots (stale row, or a reworded rule)");
  }
  if (!STATUSES.has(row.status)) {
    fail(`status ${JSON.stringify(row.status ?? null)} is not one of PORTED, GAP, FALSE`);
  }
  if (!DISPOSITIONS.has(row.disposition)) {
    fail(`disposition ${JSON.stringify(row.disposition ?? null)} is not one of PORT, DELETE, KEEP`);
  }

  /* The two axes are not free of each other, and the cross-check is what stops
   * a row claiming a kernel destination for a rule it also calls a GAP. */
  if (row.status === "PORTED" && row.disposition !== "PORT") {
    fail("status PORTED requires disposition PORT (a kernel artifact carries it, so it moves)");
  }
  if (row.disposition === "PORT" && row.status !== "PORTED") {
    fail("disposition PORT requires status PORTED (there is nothing to port it to otherwise)");
  }
  if (row.status === "FALSE" && !nonEmptyString(row.correction)) {
    fail("status FALSE requires a correction field saying what this phase changed");
  }
  /* A GAP that does not say WHAT IS MISSING is an unresolved row wearing a
   * verdict. The whole value of the gap rows is the list they hand M4-P24 and
   * M4-P25, so the naming is required rather than encouraged. */
  if (row.status === "GAP" && !nonEmptyString(row.gap)) {
    fail("status GAP requires a gap field naming the kernel destination that does not exist");
  }

  if (row.disposition === "PORT") {
    if (!nonEmptyString(row.destination)) fail("PORT requires a destination");
    else {
      for (const d of row.destination.split(/\s*,\s*/)) {
        const bare = d.split("#")[0];
        if (!existsSync(join(repo, bare))) fail(`PORT destination ${d} does not exist in this checkout`);
      }
    }
    if (!nonEmptyString(row.probe)) fail("PORT requires a probe, the string both commands must share");
  }
  if (row.disposition === "DELETE" && !nonEmptyString(row.reason)) {
    fail("DELETE requires a reason");
  }
  if (row.disposition === "KEEP" && !DR0029_SIDES.has(row["dr0029-side"])) {
    fail("KEEP requires dr0029-side to be process or predicate");
  }

  const vb = row["verified-by"];
  if (vb === undefined || vb === null || typeof vb !== "object") {
    fail("no verified-by block");
  } else {
    for (const p of screenCommand(vb.command)) fail(`verified-by ${p}`);
    if (!Number.isInteger(vb.exit)) fail("verified-by has no integer exit");
    if (!nonEmptyString(vb.output)) fail("verified-by has no captured output");
  }

  if (row.disposition === "PORT") {
    const nw = row["negative-witness"];
    if (nw === undefined || nw === null || typeof nw !== "object") {
      fail("PORT row has no negative-witness block");
    } else {
      for (const p of screenCommand(nw.command)) fail(`negative-witness ${p}`);
      if (!WITNESS_KINDS.has(nw.kind)) fail("negative-witness kind must be sibling or history");
      if (!Number.isInteger(nw.exit)) fail("negative-witness has no integer exit");
      if (nw.exit === 0) fail("negative-witness records exit 0, so it never reddened and proves nothing");
      if (!nonEmptyString(nw.output)) fail("negative-witness has no captured output");
      if (nonEmptyString(row.probe) && nonEmptyString(nw.command) && !nw.command.includes(row.probe)) {
        fail("negative-witness does not carry the probe, so it is not the same probe run elsewhere");
      }
      if (nonEmptyString(row.probe) && vb !== undefined && vb !== null && nonEmptyString(vb.command) && !vb.command.includes(row.probe)) {
        fail("verified-by does not carry the probe");
      }
      if (nonEmptyString(nw.command) && vb !== undefined && vb !== null && nw.command.trim() === String(vb.command ?? "").trim()) {
        fail("negative-witness is byte-identical to verified-by, so it tests nothing new");
      }
    }
  }
}

function checkRowExecution(row, repo, findings) {
  const id = nonEmptyString(row.id) ? row.id : "<row with no id>";
  const fail = (msg) => findings.push(`${id}: ${msg}`);

  const vb = row["verified-by"];
  if (vb !== undefined && vb !== null && typeof vb === "object" && screenCommand(vb.command).length === 0) {
    const named = kernelPathsNamed(vb.command, repo);
    if (named.length === 0) {
      fail("verified-by names no existing path outside the three retirement roots, so it re-verifies nothing against the kernel");
    }
    const r = runCommand(vb.command, repo);
    if (r.exit === null) fail(`verified-by did not run: ${r.why}`);
    else if (r.exit !== vb.exit) fail(`verified-by recorded exit ${vb.exit} and now exits ${r.exit}`);
  }

  if (row.disposition === "PORT") {
    const nw = row["negative-witness"];
    if (nw !== undefined && nw !== null && typeof nw === "object" && screenCommand(nw.command).length === 0) {
      const r = runCommand(nw.command, repo);
      if (r.exit === null) fail(`negative-witness did not run: ${r.why}`);
      else if (r.exit === 0) fail("negative-witness exits 0: the probe does not discriminate, so the PORT is unwitnessed");
      else if (Number.isInteger(nw.exit) && r.exit !== nw.exit) fail(`negative-witness recorded exit ${nw.exit} and now exits ${r.exit}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function checkInventory({ repo, jsonPath, execute }) {
  const findings = [];
  let doc;
  try {
    doc = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (err) {
    return { ok: false, fatal: `cannot read ${jsonPath}: ${String(err.message ?? err)}`, findings };
  }
  const rows = Array.isArray(doc.rows) ? doc.rows : null;
  if (rows === null) {
    return { ok: false, fatal: `${jsonPath} has no rows array`, findings };
  }

  const anchors = extractAnchors(repo);
  if (anchors.length === 0) {
    return {
      ok: false,
      fatal:
        "the extraction found ZERO rules in the three roots. That is a broken derivation, " +
        "not an empty inventory, and this script will not report a clean sheet on it.",
      findings,
    };
  }

  const anchorsById = new Map(anchors.map((a) => [a.id, a]));

  const seen = new Set();
  for (const row of rows) {
    if (nonEmptyString(row.id)) {
      if (seen.has(row.id)) findings.push(`${row.id}: duplicate row id`);
      seen.add(row.id);
    }
    checkRowStructure(row, anchorsById, repo, findings);
  }

  for (const a of anchors) {
    if (!seen.has(a.id)) {
      findings.push(`${a.id}: rule at ${a.file}:${a.line} has NO row (${a.text.slice(0, 70)})`);
    }
  }

  if (!rows.some((r) => r.status === "FALSE")) {
    findings.push(
      "no row is marked FALSE. The phase section requires at least one, and one is measured: " +
        "the scope-declaration rule against src/gates/scope.ts.",
    );
  }

  if (execute) {
    for (const row of rows) checkRowExecution(row, repo, findings);
  }

  return {
    ok: findings.length === 0,
    findings,
    counts: { anchors: anchors.length, rows: rows.length, executed: execute },
  };
}

function repoRoot(explicit) {
  if (explicit !== undefined) return resolve(explicit);
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: HERE, encoding: "utf8" }).trim();
  } catch {
    return resolve(HERE, "..");
  }
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
  };
  const repo = repoRoot(arg("--repo"));
  const jsonPath = resolve(arg("--json") ?? join(repo, "delivery/plan/cutover/retirement-inventory.json"));

  if (argv.includes("--extract")) {
    const anchors = extractAnchors(repo);
    for (const a of anchors) {
      process.stdout.write(`${a.id}\t${a.file}:${a.line}\t${a.kind}\t${a.text}\n`);
    }
    process.stdout.write(`# ${anchors.length} rule anchor(s) across ${ROOTS.length} retirement root(s)\n`);
    return anchors.length === 0 ? 2 : 0;
  }

  const execute = !argv.includes("--no-execute");
  let result;
  try {
    result = checkInventory({ repo, jsonPath, execute });
  } catch (err) {
    process.stderr.write(`retirement-inventory: crashed rather than passing: ${String(err.stack ?? err)}\n`);
    return 2;
  }
  if (result.fatal !== undefined) {
    process.stderr.write(`retirement-inventory: ${result.fatal}\n`);
    return 2;
  }
  const { anchors, rows } = result.counts;
  process.stdout.write(
    `retirement-inventory: ${rows} row(s) against ${anchors} derived rule anchor(s), ` +
      `${result.counts.executed ? "commands EXECUTED" : "structure only, commands NOT executed"}\n`,
  );
  for (const f of result.findings) process.stdout.write(`  UNRESOLVED ${f}\n`);
  if (!result.ok) {
    process.stdout.write(`retirement-inventory: ${result.findings.length} unresolved item(s)\n`);
    return 1;
  }
  process.stdout.write("retirement-inventory: every rule in the three roots is resolved\n");
  return 0;
}

/**
 * `process.exitCode`, NEVER `process.exit()`, AND THIS IS A MEASURED BUG RATHER
 * THAN A STYLE NOTE. `process.exit()` tears the process down with writes still
 * queued, and when stdout is a PIPE (which it is under a test runner, and under
 * any `| head`) the write is asynchronous. This script prints one line per
 * unresolved row, so a full report is tens of kilobytes and the tail is exactly
 * what a caller greps for. With `process.exit()` three of fifteen tests failed
 * and a DIFFERENT three failed on the next run, because the truncation point
 * moved. The exit code was always right and the evidence for it was missing,
 * which is the shape this whole phase is about: a guard whose output cannot be
 * relied on is a guard nobody can act on.
 */
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
