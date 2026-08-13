/*
 * M3-P9 fix round 2, THE DERIVATION.
 *
 * MECHANISM UNDER SEARCH: two strings are compared for EQUALITY or DISTINCTNESS
 * without a declared CANONICAL FORM, so two representations of one value read
 * as two different values (or two different values read as one).
 *
 * This is NOT round 1's derivation. Round 1 searched for "a defaulted read
 * (`?? ""`) that flows into a comparison". That is a search for a MISSING
 * VALUE. This searches for a PRESENT value whose REPRESENTATION was never
 * canonicalised, which is why round 1's script cannot find these sites: none
 * of them involves `??` at all.
 *
 * Usage: node derive-canonical.mjs <repo-root> [1|2|3|all]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repo = process.argv[2];
const arg = process.argv[3] ?? "all";

/* The SHIPPED SURFACE in source terms. `dist/` is what package.json ships and
   it is BUILT FROM `src/`, so `src/` and `bin/` are the shipped surface's
   sources. `scripts/` is included because gate-registry.yaml names those
   commands and AGENTS.md instructs a consumer to run them, even though the
   arbitration records that `scripts/` is not in package.json `files`. */
const ROOTS = ["src", "bin", "scripts"];
const EXT = /\.(ts|mjs|js)$/;

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (EXT.test(name)) out.push(path);
  }
  return out;
}

const files = [];
for (const root of ROOTS) {
  try { walk(join(repo, root), files); } catch { /* absent root */ }
}

/* ---------------- STAGE 1: every string-comparison site ---------------- */
/* A comparison is an equality/inequality operator, a string-keyed container
   lookup, or a string predicate whose answer is "are these the same text". */
const COMPARISON =
  /(!==|===|!=[^=]|[^=!<>]=[^=]|\.includes\(|\.has\(|\.indexOf\(|\.lastIndexOf\(|\.startsWith\(|\.endsWith\(|\.localeCompare\(|\.get\(|\.set\(|\bnew Set\(|\bnew Map\()/;
/* `=` alone is assignment; the character-class above already excludes `==`,
   `<=`, `>=` and `!=`, but a bare assignment still matches, so equality is
   required to be one of the real operators. */
const REAL_COMPARISON =
  /(!==|===|!=[^=]|\.includes\(|\.has\(|\.indexOf\(|\.lastIndexOf\(|\.startsWith\(|\.endsWith\(|\.localeCompare\(|\.get\(|\.set\(|\bnew Set\(|\bnew Map\()/;

/* ---------------- STAGE 2: at least one operand is EXTERNAL ------------ */
/* EXTERNAL means the value entered the program from outside it: a decoded
   document, a file, a directory listing, argv, env, or a child process. A
   value the program itself built from its own literals is not external. */
const EXTERNAL_SEED =
  /(decodeDocument|readOperatorPath|readFileSync|readdirSync|readContextDocument|JSON\.parse|parseDocument|\bparse\(|process\.argv|process\.env|spawnSync|execFileSync|asRecord|frontmatter|loadRegistry|loadManifest|readVerdict|\.stdout\b|\.stderr\b)/;
/* A record subscript is the shape every one of CR-001's four sites had: a key
   read out of a decoded document by name. */
const RECORD_SUBSCRIPT = /\w(\?)?\[\s*["'`]/;

/* ---------------- STAGE 3: no declared canonical form ------------------ */
/* A canonical form is any declared transformation applied to the operand
   before it is compared. If one of these appears on the line, or on the line
   that BOUND the operand, the site has a canonical form (which may still be
   the wrong one, but it is DECLARED, so it is not this mechanism). */
const CANONICALISER =
  /(\.normalize\(|\.toLowerCase\(|\.toUpperCase\(|\.toLocaleLowerCase\(|\.trim\(|canonical|Canonical|establishField|normalizeProse|\.replace\()/;

/* The mechanism is about TWO STRINGS. A comparison against `undefined`, `null`,
   a boolean, a number, or the result of `typeof` is a PRESENCE or TYPE test,
   not a text comparison, and no canonical form applies to it. Excluding these
   is what separates this derivation from round 1's, which was searching for
   presence tests and therefore wanted exactly the sites this drops. */
const NOT_TEXT =
  /(===|!==|==|!=)\s*(undefined|null|true|false|-?\d+(\.\d+)?|NaN)\b|(undefined|null|true|false|-?\d+(\.\d+)?)\s*(===|!==|==|!=)|\btypeof\b|\.length\s*(===|!==|<|>|<=|>=)|\bArray\.isArray\b|instanceof/;

function comparesText(line) {
  if (NOT_TEXT.test(line)) return false;
  /* At least one operand must be textual: a string literal, a template
     literal, or a call/identifier known to yield text. A comparison with no
     textual operand anywhere on the line is comparing objects or numbers. */
  return /["'`]/.test(line) || /\b(id|path|name|value|text|key|kind|status|dimension|authority|mode|phase|slug|label|title|ref|branch|sha|line)\b/i.test(line);
}

const stage1 = [];
for (const file of files) {
  const rel = relative(repo, file);
  const lines = readFileSync(file, "utf8").split("\n");
  /* Taint set: bindings in this file whose value came from outside. Seeded
     from EXTERNAL_SEED, then propagated to fixpoint so a value read from a
     document and passed through two locals is still recognised as external. */
  const tainted = new Set();
  for (let pass = 0; pass < 6; pass += 1) {
    for (const line of lines) {
      const bind = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=(.*)$/.exec(line);
      if (bind === null) continue;
      const [, name, rhs] = bind;
      if (EXTERNAL_SEED.test(rhs) || RECORD_SUBSCRIPT.test(rhs) ||
          [...tainted].some((t) => new RegExp(`\\b${t}\\b`).test(rhs))) {
        tainted.add(name);
      }
    }
  }
  lines.forEach((text, index) => {
    const stripped = text.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
    if (stripped.trim() === "") return;
    if (!REAL_COMPARISON.test(stripped)) return;
    if (!COMPARISON.test(stripped)) return;
    if (!comparesText(stripped)) return;
    stage1.push({ file: rel, line: index + 1, text: text.trim(), tainted, lines, index });
  });
}

const stage2 = stage1.filter((s) => {
  if (EXTERNAL_SEED.test(s.text) || RECORD_SUBSCRIPT.test(s.text)) return true;
  return [...s.tainted].some((t) => new RegExp(`\\b${t}\\b`).test(s.text));
});

const stage3 = [];
for (const s of stage2) {
  /* The operand's binding line counts as part of the site: canonicalising at
     the bind and comparing at the use is a DECLARED canonical form. Look back
     a 12-line window, the same window shape round 1's derivation used. */
  const window = s.lines.slice(Math.max(0, s.index - 12), s.index + 1).join("\n");
  if (CANONICALISER.test(window)) continue;
  stage3.push(s);
}

function dump(title, rows) {
  console.log(`\n=== ${title}: ${rows.length} site(s) ===`);
  for (const r of rows) console.log(`${r.file}:${r.line}: ${r.text}`);
}
if (arg === "1" || arg === "all") dump("STAGE 1, every string-comparison site in the shipped surface", stage1);
if (arg === "2" || arg === "all") dump("STAGE 2, stage 1 where an operand is EXTERNALLY SOURCED", stage2);
if (arg === "3" || arg === "all") dump("STAGE 3, stage 2 with NO declared canonical form", stage3);
console.log(`\ncounts: stage1=${stage1.length} stage2=${stage2.length} stage3=${stage3.length}`);
