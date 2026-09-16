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
 *     a command rather than a phrase;
 *   - every row whose `verified-by` records a NONZERO exit is making an
 *     ABSENCE claim, and the absence is re-established on a WIDER surface than
 *     the row itself named. See the widened-absence section below.
 *
 * THE COMMANDS ARE DATA FROM A FILE AND ARE TREATED AS SUCH. They run through
 * `sh -c` with a timeout, in the repository root, with a per-segment first-token
 * allowlist and a refusal of redirection and command substitution.
 *
 * WHAT THAT SCREEN DOES AND DOES NOT GUARANTEE, stated exactly, because the
 * first version of this header claimed more than the screen delivered and a
 * clean-room reviewer measured the difference. It is a TOOL allowlist, not a
 * sandbox. What it guarantees: every segment that can start a command begins
 * with a tool from `ALLOWED_FIRST_TOKENS`, and every tool on that list is one
 * that has no option for writing a file, so a row cannot modify the tree this
 * checker is auditing. That is why `git`, `sed`, `awk`, `node` and `sort` are
 * NOT on the list: each of them was, and each of them writes
 * (`git checkout -- .`, `sed -i`, `awk -i inplace`, `node -e`, `sort -o`).
 * Measured at 7b2b7f1, before the list was narrowed: a row whose `verified-by`
 * was `sed -i s/ORIGINAL/DESTROYED/ src/victim.txt` ran, and the file changed.
 * What it does NOT guarantee: the child process still runs with this checker's
 * own privileges and can READ anything the checker can read, it can be slow,
 * and a tool added to the list later carries whatever write paths it has. The
 * list is the contract; adding to it is a change to the contract.
 *
 * THE WIDENED-ABSENCE RULE, added in the fix round and the reason it exists.
 * A row whose `verified-by` exits nonzero has proved that A TOKEN is absent
 * from the FILES THAT COMMAND NAMED. The row's prose then says something much
 * larger: that the RULE is absent from the kernel. Those are different claims
 * and nothing compared them, so three rows shipped a false one. The checker now
 * re-runs the row's own search pattern, case-insensitively and as a fixed
 * string, over `WIDENED_SURFACE`. If that finds nothing, the absence holds and
 * the row is silent. If it finds something, the row must carry a `widened`
 * block naming the files that carry the token and saying, in one sentence, why
 * they do not refute the claim. The declared file list is checked BY NAME and
 * as a SUPERSET: a file gaining the token later reddens, a reviewed file losing
 * it does not, and no count is pinned.
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
 * FOUR markdown kinds rather than one, and no exceptions. Measured over the six
 * markdown roots: headings alone find 59 rules where these four find 264, and
 * in `CLAUDE.md` alone headings find 24 of 133. Headings and numbers together
 * still drop every bolded lead-in and the seven `## Never` bullets, which are
 * the most binding lines in that file. The bolded-lead-in kind is not decoration
 * either: `CLAUDE.md` states the measured-false rule this phase corrects in
 * exactly that shape. Every line of every root falls inside exactly one
 * anchor's span, so a rule cannot hide between two anchors.
 *
 * Column zero is load-bearing. An indented `1.` inside a fenced block or a
 * nested bullet is CONTINUATION of its anchor, not a new rule, and treating it
 * as one would inflate the count with fragments of the rule above it.
 *
 * AND FENCED BLOCKS ARE SKIPPED, which this header did not say until the fix
 * round and which the code did not do. A column-zero `- ` or `# ` INSIDE a
 * ``` fence is a shell comment or a sample bullet, not a rule, and both roots
 * are dense with fenced shell. Measured at 7b2b7f1 on the real roots: ZERO
 * anchors fell inside a fence, so the 280 was right by CONTENT and not by
 * GRAMMAR, and the next person to paste a fenced bullet into `CLAUDE.md` would
 * have got a phantom rule. It fails closed (a phantom anchor reddens as a rule
 * with no row, never as a silent pass), which is why this was a trip wire
 * rather than a hole, and it is fixed rather than documented as a surprise.
 * A fence opens on a column-zero run of three or more backticks or tildes and
 * closes on a run of the same character at least as long.
 */
const MARKDOWN_ANCHORS = [
  { kind: "heading", re: /^(#{1,6})\s+(.+?)\s*$/ },
  { kind: "numbered", re: /^([0-9]+[a-z]?)\.\s+(.+?)\s*$/ },
  { kind: "bullet", re: /^-\s+(.+?)\s*$/ },
  { kind: "bold-lead", re: /^\*\*(.+?)\s*$/ },
];

/** A column-zero run of three or more backticks or tildes opens or closes a fence. */
const FENCE_RE = /^(`{3,}|~{3,})/;

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
    const isMarkdown = f.kind !== "javascript";
    const patterns = isMarkdown ? MARKDOWN_ANCHORS : JS_ANCHORS;
    const key = fileKey(f.rel);
    let fence = null;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isMarkdown) {
        const m = FENCE_RE.exec(line);
        if (m !== null) {
          if (fence === null) fence = m[1];
          else if (line.startsWith(fence[0].repeat(fence.length))) fence = null;
          continue;
        }
        if (fence !== null) continue;
      }
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

/**
 * THE ALLOWLIST IS THE WHOLE MECHANISM, so every entry has to be a tool with NO
 * option that writes a file. That is the property the header promises and it is
 * the property this list is chosen for, rather than "tools that seem harmless".
 *
 * Removed in the fix round, with the write each one offers:
 *   git   `git checkout -- .`, `git clean -fdx`, `git reset --hard`
 *   sed   `sed -i`, `sed --in-place`
 *   awk   `awk -i inplace`
 *   node  `node -e`, `node --eval`, and any script it is pointed at
 *   sort  `sort -o FILE`, `sort --output=FILE`
 * Measured at 7b2b7f1: all five were allowed, and `sed -i` was demonstrated
 * end to end rewriting a file in the tree the checker was auditing.
 *
 * Nothing was lost by removing them: all 467 commands in the inventory at that
 * head are `grep -c`, measured, so the narrowed list refuses none of them. A
 * later row that genuinely needs one of these tools is a change to the screen's
 * contract and belongs in this list with the reason written next to it.
 *
 * IT IS EXPORTED AND PINNED BY A TEST, which is the difference between a
 * contract and a description. Nothing here can check that a named tool has no
 * write option, because that is a fact about the tool and not about this file.
 * What the test does check is that the list is exactly these nine names, so
 * widening it fails the suite and has to be argued for in a diff. That is a
 * weaker guarantee than the paragraph above and it is the strongest one
 * available, so it is stated as what it is.
 */
export const ALLOWED_FIRST_TOKENS = new Set([
  "grep",
  "test",
  "ls",
  "wc",
  "comm",
  "diff",
  "head",
  "tail",
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
 *
 * THE LIST IT CHECKS AGAINST IS WHERE THE SAFETY LIVES, not this function. See
 * `ALLOWED_FIRST_TOKENS`: the screen is only as true as the claim that every
 * tool on it cannot write.
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

/** A single-quoted or double-quoted span. */
const QUOTED_SPAN = /'[^']*'|"[^"]*"/g;

/**
 * The files a command names AS ARGUMENTS, with every quoted span removed first.
 *
 * `kernelPathsNamed` does not strip the quotes, so a path-shaped token INSIDE
 * the search pattern counts as a file the command named. That was invisible
 * until the fix round widened the absence check over exactly this list and a row
 * searching for the literal text `delivery/ is the build` was re-searched over
 * the whole `delivery/` tree, where the inventory quotes the rule back at
 * itself. Measured at the fix-round head: `grep -c 'delivery/ is the build'
 * AGENTS.md roles/implementer.md templates/charter.example.yaml` yields
 * `delivery` from inside its own pattern.
 *
 * This helper is used for the WIDENING only, and `kernelPathsNamed` is left as
 * it is on purpose: their questions differ. One asks "did this command reach
 * outside the roots at all", which a pattern-internal path answers loosely but
 * not dangerously; the other asks "which files did this command actually
 * search", where a pattern-internal path is simply wrong. Measured at the
 * fix-round head, SEVEN of the 468 commands name a different path set under the
 * two helpers and NONE of the seven loses its last kernel path, so no row's
 * kernel-path check depends on the difference today.
 */
export function argumentPathsNamed(command, repo) {
  return kernelPathsNamed(String(command ?? "").replace(QUOTED_SPAN, " "), repo);
}

/* ------------------------------------------------------------------ */
/* A command that failed to RUN is not a command that answered         */
/* ------------------------------------------------------------------ */

/**
 * Exit codes that mean THE COMMAND DID NOT RUN, keyed by the tool that produced
 * them, plus the two the shell itself produces for any tool.
 *
 * This exists because a row shipped with `verified-by` `grep -c '-- '--registry''
 * scripts/m2-exit-test.sh`, exit 2, output "grep: unrecognized option". The
 * shell concatenated the quotes into the argument `-- --registry`, grep refused
 * it as an option, and nothing was searched. The row's note beside it read
 * "Re-verified in this phase and still TRUE". The checker was green, because
 * exit 2 reproduces forever: a command that cannot run cannot stop reproducing.
 * CLAUDE.md's fix-round contract names this exact bite, "a usage error read as a
 * clean result", as one of three the project has already paid for.
 *
 * The instance is fixed in the row. This is the MECHANISM: every recorded exit,
 * on `verified-by` and on `negative-witness` alike, is classified as an ANSWER
 * or a NON-ANSWER, and a non-answer is a finding whatever else is true of it.
 * A negative witness is the sharper case, because there the rule is only "exit
 * nonzero" and a usage error satisfies it perfectly while discriminating
 * nothing.
 *
 * Listed as DATA, per tool, rather than as a blanket "exit > 1 is bad", because
 * a tool's exit codes are its own. grep: 0 found, 1 not found, 2 error. diff: 0
 * same, 1 differ, 2 error. cmp the same. test and the rest have no error code
 * distinct from their answer, so they carry only the universal pair and this
 * check says nothing about them, which it states rather than implying coverage.
 *
 * Measured at the fix-round head: 468 recorded exits, 198 zero, 270 one, and
 * ZERO non-answers, so this guard reddens nothing today. It is a trip wire for
 * the next row, and its red witness is a fixture rather than a live row.
 */
const NON_ANSWER_EXITS = {
  "*": new Map([
    [126, "the shell found the command and could not execute it"],
    [127, "the shell could not find the command at all"],
  ]),
  grep: new Map([[2, "grep exits 2 only on an error, so it searched nothing"]]),
  diff: new Map([[2, "diff exits 2 only on an error, so it compared nothing"]]),
  cmp: new Map([[2, "cmp exits 2 only on an error, so it compared nothing"]]),
};

/**
 * Why a recorded exit is not an answer, or null if it is one.
 *
 * The tool is taken from the LAST segment of the command, because that is the
 * one whose exit the shell reports. Every command in the inventory is a single
 * segment, measured, so today the last segment is the only segment.
 */
export function nonAnswerExit(command, exit) {
  if (!Number.isInteger(exit)) return null;
  const segments = String(command ?? "").split(/[;&|]+/).filter((x) => x.trim() !== "");
  const last = segments.length === 0 ? "" : segments[segments.length - 1].trim().split(/\s+/)[0];
  const universal = NON_ANSWER_EXITS["*"].get(exit);
  if (universal !== undefined) return universal;
  const perTool = NON_ANSWER_EXITS[last];
  if (perTool !== undefined) {
    const why = perTool.get(exit);
    if (why !== undefined) return why;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Widened absence: the word is absent is not the rule is absent       */
/* ------------------------------------------------------------------ */

/**
 * The surface an ABSENCE claim is re-tested against. Listed as DATA for the
 * same reason `ROOTS` is: which places were searched is the whole content of an
 * absence claim, so it is declared and reviewed rather than discovered.
 *
 * It is everything a rule could have been carried INTO: the kernel's briefs,
 * its checklists, its templates, its tuition feed, its schemas, its shipped
 * source, its entry points, and this project's own gate registry. It
 * deliberately includes `src/` and `bin/`, which the phase's own searches
 * excluded on the ground that a code comment is not an instruction channel.
 * That ground is sound and it is not this check's business: the check forces
 * the hits to be READ and the reason to be WRITTEN DOWN, and "these are code
 * comments, not an instruction channel" is a perfectly good `read` field. What
 * is refused is a hit nobody looked at.
 */
export const WIDENED_SURFACE = [
  "AGENTS.md",
  "roles",
  "checklists",
  "templates",
  "tuition",
  "schemas",
  "src",
  "bin",
  "gate-registry.yaml",
];

/** BRE and ERE metacharacters. A pattern carrying one cannot be widened as a fixed string. */
const REGEX_METACHAR = /[\\[\]().*+?{}|^$]/;

/**
 * Lift the search pattern out of a row's command. Measured at the fix-round
 * head: all 82 absence rows carry exactly one single-quoted pattern and NONE of
 * the 24 distinct patterns contains a regex metacharacter, so the fixed-string
 * widening below is exactly equivalent to what the row itself ran. Both of
 * those facts are CHECKED rather than assumed, because a row that breaks either
 * would be widened by something that is not its own search, and a row that
 * breaks either FAILS CLOSED rather than being skipped.
 */
export function liftPattern(command) {
  const m = /'([^']*)'/.exec(String(command ?? ""));
  if (m === null) return { pattern: null, why: "no single-quoted search pattern could be lifted from the command" };
  if (m[1] === "") return { pattern: null, why: "the lifted search pattern is empty" };
  if (REGEX_METACHAR.test(m[1])) {
    return { pattern: null, why: `the search pattern ${JSON.stringify(m[1])} carries a regex metacharacter, so a fixed-string widening would not be the same search` };
  }
  return { pattern: m[1], why: null };
}

/**
 * Files carrying `pattern`, case-insensitively, as a fixed string, across
 * `WIDENED_SURFACE` plus `extra`.
 *
 * `extra` is THE FILES THE ROW'S OWN COMMAND NAMED, and it is here because
 * widening only the surface leaves one whole family uncovered. A row that ran
 * `grep -c 'DELEGATED' <file>` and recorded exit 1 has proved that the token is
 * absent IN THAT SPELLING from a file that carries `delegated` twice. The
 * search surface was right and the search was wrong, so no amount of widening
 * the TREES catches it. Re-running the row's own pattern case-insensitively
 * over the row's own files does, and it costs nothing.
 *
 * The cache is keyed on the pattern AND the extra paths, because the same
 * pattern searched over different files is a different question.
 */
function widenedHitPaths(pattern, repo, cache, extra = []) {
  const key = `${pattern}\u0000${[...extra].sort().join("\u0000")}`;
  if (cache.has(key)) return cache.get(key);
  const present = [...new Set([...WIDENED_SURFACE, ...extra])].filter((p) => existsSync(join(repo, p)));
  let result = { paths: [], error: null };
  if (present.length > 0) {
    const r = spawnSync("grep", ["-rlniF", "--", pattern, ...present], {
      cwd: repo,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    });
    const bad = unexpectedGrepStatus(r.status, r.error, r.signal);
    if (bad !== null) result = { paths: [], error: bad };
    else if (r.status === 0) {
      result = {
        paths: [...new Set((r.stdout ?? "").split("\n").filter((l) => l !== ""))].sort(),
        error: null,
      };
    }
  }
  cache.set(key, result);
  return result;
}

/**
 * Why the widening grep's outcome is NOT an answer, or null if it is one.
 *
 * THIS EXISTS BECAUSE THE FIRST VERSION OF THE WIDENING HAD THE DEFECT IT WAS
 * WRITTEN TO CATCH. It read `if (r.status === 0)` and otherwise left the hit
 * list empty, so a grep that ERRORED was indistinguishable from a grep that
 * found nothing, and "found nothing" is exactly the verdict that lets an
 * absence claim stand. A guard that fails open when its own tool fails is the
 * shape this whole round is about, and it was in the round's own new code.
 *
 * Only 0 (found) and 1 (not found) are answers. Anything else, plus a spawn
 * error and a signal death, makes the row's absence UNVERIFIED rather than
 * confirmed.
 */
export function unexpectedGrepStatus(status, error, signal) {
  if (error !== undefined && error !== null) return `the widening grep did not run: ${String(error.message ?? error)}`;
  if (status === null) return `the widening grep was terminated by signal ${String(signal)}`;
  if (status === 0 || status === 1) return null;
  return `the widening grep exited ${status}, which is an error and not a search result`;
}

/**
 * A row whose `verified-by` exits nonzero asserts an absence. Re-establish it on
 * WIDENED_SURFACE, and require every file that carries the token to have been
 * declared and read.
 */
function checkRowWidenedAbsence(row, repo, cache, findings) {
  const id = nonEmptyString(row.id) ? row.id : "<row with no id>";
  const fail = (msg) => findings.push(`${id}: ${msg}`);
  const vb = row["verified-by"];
  if (vb === undefined || vb === null || typeof vb !== "object") return;
  if (!Number.isInteger(vb.exit) || vb.exit === 0) return;

  const { pattern, why } = liftPattern(vb.command);
  const declared = row.widened;
  if (pattern === null) {
    /* FAIL CLOSED. The widening could not be derived, so the absence claim
     * cannot be re-established and the row has to say so itself. */
    if (declared === undefined || declared === null || typeof declared !== "object" || !nonEmptyString(declared.read)) {
      fail(`verified-by exits ${vb.exit} (an absence claim) and ${why}, so it needs a widened block with a read field`);
    }
    return;
  }

  const widenedResult = widenedHitPaths(pattern, repo, cache, argumentPathsNamed(vb.command, repo));
  if (widenedResult.error !== null) {
    /* FAIL CLOSED. The absence could not be re-established, which is not the
     * same as it holding. */
    fail(`verified-by exits ${vb.exit} (an absence claim) and ${widenedResult.error}, so the absence is UNVERIFIED`);
    return;
  }
  const hits = widenedResult.paths;
  if (hits.length === 0) return;

  if (declared === undefined || declared === null || typeof declared !== "object") {
    fail(
      `verified-by exits ${vb.exit}, so the row claims an absence, but the same pattern ${JSON.stringify(pattern)} ` +
        `is carried by ${hits.join(", ")}. A widened block naming those files and reading them is required: ` +
        "the word being absent from the files the command named is not the rule being absent.",
    );
    return;
  }
  if (!nonEmptyString(declared.read)) {
    fail("widened block has no read field saying why the files that carry the token do not refute the claim");
  }
  const named = Array.isArray(declared["hit-paths"]) ? declared["hit-paths"] : null;
  if (named === null) {
    fail("widened block has no hit-paths array");
    return;
  }
  for (const p of named) {
    if (!nonEmptyString(p)) fail("widened hit-paths carries an entry that is not a path");
    else if (!existsSync(join(repo, p))) fail(`widened hit-path ${p} does not exist in this checkout`);
  }
  /* BY NAME and as a SUPERSET, never by count. A file that GAINS the token is
   * new evidence and reddens; a reviewed file that loses it only strengthens the
   * absence, so it does not. */
  const undeclared = hits.filter((h) => !named.includes(h));
  if (undeclared.length > 0) {
    fail(`widened absence: ${undeclared.join(", ")} carries ${JSON.stringify(pattern)} and is not in the row's reviewed hit-paths`);
  }
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
  if (!anchorsById.has(row.id)) {
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
    const why = nonAnswerExit(vb.command, vb.exit);
    if (why !== null) {
      fail(
        `verified-by records exit ${vb.exit}, which is not an answer: ${why}. ` +
          "A command that failed to run reproduces forever and verifies nothing.",
      );
    }
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
      const whyNw = nonAnswerExit(nw.command, nw.exit);
      if (whyNw !== null) {
        fail(
          `negative-witness records exit ${nw.exit}, which is not an answer: ${whyNw}. ` +
            "A usage error is nonzero and discriminates nothing, so it satisfies the witness rule while proving nothing.",
        );
      }
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
    else {
      const why = nonAnswerExit(vb.command, r.exit);
      if (why !== null) fail(`verified-by now exits ${r.exit}, which is not an answer: ${why}`);
    }
  }

  if (row.disposition === "PORT") {
    const nw = row["negative-witness"];
    if (nw !== undefined && nw !== null && typeof nw === "object" && screenCommand(nw.command).length === 0) {
      const r = runCommand(nw.command, repo);
      if (r.exit === null) fail(`negative-witness did not run: ${r.why}`);
      else if (r.exit === 0) fail("negative-witness exits 0: the probe does not discriminate, so the PORT is unwitnessed");
      else if (Number.isInteger(nw.exit) && r.exit !== nw.exit) fail(`negative-witness recorded exit ${nw.exit} and now exits ${r.exit}`);
      else {
        const why = nonAnswerExit(nw.command, r.exit);
        if (why !== null) fail(`negative-witness now exits ${r.exit}, which is not an answer: ${why}`);
      }
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
    const widenCache = new Map();
    for (const row of rows) {
      checkRowExecution(row, repo, findings);
      checkRowWidenedAbsence(row, repo, widenCache, findings);
    }
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
