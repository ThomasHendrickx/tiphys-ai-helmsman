/**
 * THE AGENTS.md REFERENCE AND ANTI-DUPLICATION CHECK (kernel plan M3, M3-P9
 * step 5, criteria 2, 2b and 3).
 *
 * `AGENTS.md` is the orchestrator's job description. Section 1.5 of the plan
 * grants it the markdown-with-frontmatter exception on the ground that its
 * effect comes from argument and emphasis, and pays for that grant with ONE
 * binding constraint: any policy expressible as DATA (a gate list, a mode
 * table, a model-tier table) is NOT written there. It is referenced by path
 * into the structured artifact that owns it. This script is what makes that
 * constraint a command with an exit code instead of a norm.
 *
 * TWO THINGS IT DECIDES, and they fail in different ways on purpose.
 *
 *   1. EVERY REFERENCE RESOLVES, to a path AND to an anchor inside it.
 *      Criterion 2 covers the deleted file, which is the LOUD failure: the
 *      path is gone and any check notices. Criterion 2b covers the file that
 *      is still there while the thing it was cited for MOVED, which is the
 *      SILENT one and is this phase's own declared hazard. A reference that
 *      resolves to a path and to nothing inside it is a reference that reads
 *      as checked and points at nothing.
 *   2. NO DUPLICATED POLICY DATA. Three detectors, one per artifact whose
 *      data this document is forbidden to restate, each reading the REAL
 *      vocabulary out of the REAL artifact under `--root` rather than
 *      carrying a copy of it here. A detector holding its own copy of the
 *      gate ids would be the very duplication it exists to refuse.
 *
 * WHY `--root` EXISTS AND IS NOT DECORATION (M3-P9 pre-dispatch read,
 * delivery/plan/m3-p9-dispatch-read.md:43). Criterion 2b asks for TWO
 * structurally different red witnesses: a heading anchor removed from
 * `roles/implementer.md`, and a field pointer whose key was renamed inside
 * `assurance-modes.yaml`. Neither file belongs to this phase. A checker that
 * hardcoded the repository root would force the witness to mutate two merged
 * artifacts and then restore them, and `git checkout --` in a tree holding
 * uncommitted work has cost this project real work twice with no safe narrow
 * form. Because every path here is resolved against `--root`, both witnesses
 * run against a STAGED COPY of the tree and no merged file is ever touched.
 * This is the same shape M3-P7's checks engine already uses for `--context`.
 *
 * IT IS A GATE SUBPROCESS UNDER M2-P1's CONTRACT (D-M3-34, section 2.2a). It
 * writes ONE `GateResult` through `makeGateResult`, so M2-C-2 applies for
 * free: a run that resolved ZERO references becomes an error with
 * `vacuous: true` rather than a green that examined nothing.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const resultModule = await import(
  pathToFileURL(join(repoRoot, "src", "gates", "result.ts")).href
);
const taskModule = await import(
  pathToFileURL(join(repoRoot, "src", "task.ts")).href
);
const validateModule = await import(
  pathToFileURL(join(repoRoot, "src", "validate.ts")).href
);
const rolesModule = await import(
  pathToFileURL(join(repoRoot, "src", "roles.ts")).href
);
const { makeGateResult, renderGateResult, exitCodeForStatus } = resultModule;
const { refuseOpenForWrite, readRegularFileIfPresent } = taskModule;
const { decodeDocument } = validateModule;
const { FRONTMATTER_FENCE } = rolesModule;

const GATE_ID = "check-agents-references";
const UNIT_LABEL = "references resolved";
const EXIT_GATE_ERROR = 21;

const DEFAULT_DOCUMENT = "AGENTS.md";

/**
 * The artifacts whose DATA this document may not restate, and the field each
 * detector reads its vocabulary out of. Declared as data here so that adding a
 * fourth is an edit to this table rather than to three copies of a loop.
 */
const DUPLICATION_SOURCES = {
  gates: { document: "gate-registry.yaml", collection: "gates", key: "id" },
  modes: { document: "assurance-modes.yaml", collection: "modes", key: "id" },
  roles: { document: "role-model-config.yaml", collection: "roles", key: "role" },
};

/**
 * How many DISTINCT ids on ENUMERATIVE LINES make a restatement rather than a
 * mention. Both halves of that sentence are load-bearing.
 *
 * THE PREDICATE IS THE LINE SHAPE, AND THE FIRST VERSION OF THIS DETECTOR GOT
 * IT WRONG, which is recorded here rather than quietly corrected. Counting ids
 * anywhere in the prose fired on the real document at once, naming `scope` and
 * `red-witness`: `scope` is a gate id AND an ordinary English word, and
 * "the red-witness rule" is a concept this brief must be able to refer to.
 * A detector that forbids a document from NAMING a thing is not enforcing
 * anti-duplication, it is enforcing silence, and it would have been satisfied
 * by rewording the prose while a pasted table went on being possible.
 *
 * What section 1.5 forbids is RESTATED DATA, and restated data is a LIST or a
 * TABLE: a run of ids on lines carrying a list marker or a table pipe. That is
 * what a paste looks like, whether it came from the YAML (`- id: suite`) or
 * from a rendered markdown table. So the count is taken over enumerative lines
 * only, and a document that mentions three gates in three paragraphs is
 * referring to them, which is allowed.
 *
 * GATES: three ids on enumerative lines. Two could be a pair of examples in a
 * bulleted explanation; three is a list.
 *
 * MODES: two. The vocabulary is closed at three ids, so two of them on
 * enumerative lines IS the table.
 *
 * ROLES: two, and the predicate is different in kind again. A role name is an
 * ordinary word here ("the implementer", "the reviewer"). What makes a
 * MODEL-TIER TABLE is a role standing next to a TIER VALUE on one row, so the
 * detector counts roles that share an enumerative line with a tier token.
 *
 * TWO RESIDUES, NAMED because criterion 3 reads at a glance as if it covered
 * the hazard and this phase's own hazard table says it does not. (1) The same
 * table REWORDED, with the ids replaced by descriptions, is a semantic relation
 * and no fixed-token detector decides it; the instrument is the hazard review
 * contract. (2) A restatement written as flowing PROSE rather than as a list
 * evades the line predicate. Both are section 2.6 reason 1, and neither is
 * traded for the false positives that catching them here would cost.
 */
const GATE_ID_THRESHOLD = 3;
const MODE_ID_THRESHOLD = 2;
const ROLE_TIER_PAIR_THRESHOLD = 2;

/** A list marker, an ordered-list marker, or a table pipe. */
const ENUMERATIVE_LINE = /^[ \t]*([-*+][ \t]|[0-9]+[.)][ \t]|\|)/;

/**
 * A reference token: a backticked `<path>#<anchor>`.
 *
 * BACKTICKED DELIBERATELY, and it buys two separate things. It is how a
 * markdown document names a path without claiming it is a citation, so the
 * repository's citation gate (which resolves `path.ext:LINE` OUTSIDE backticks)
 * does not try to read these as line citations. And it gives this scanner an
 * unambiguous delimiter, so a path at the end of a sentence does not acquire
 * the full stop.
 */
const REFERENCE_PATTERN =
  /`([A-Za-z0-9][A-Za-z0-9._/-]*\.(?:md|ya?ml|json|mjs|c?js|ts))(?:#([A-Za-z0-9][A-Za-z0-9._-]*))?`/g;

/**
 * THE ANCHOR IS OPTIONAL AND THE EXTENSION SET IS WIDER, and both halves of
 * that change are CR-002's repair rather than tidying.
 *
 * The first version required a `#anchor`, so a backticked path WITHOUT one
 * matched nothing: never resolved, never counted, never reported. The reviewer
 * who found CR-002 measured the consequence and it is the sharpest form this
 * failure takes: of the 14 paths `AGENTS.md` named, the 12 anchored ones all
 * existed and all shipped, and the 2 anchorless ones were exactly the 2 that did
 * neither. The blind spot and the defect were the same set. A guard whose
 * condition does not test the property that matters is green and worthless,
 * which is this repository's standing lesson one more time.
 *
 * The extension set gained `mjs`, `js`, `cjs` and `ts` for the same reason: the
 * two paths that got through were `.mjs`, so the old pattern could not have seen
 * them even with the anchor made optional.
 */

function usage() {
  return (
    "usage: node scripts/check-agents-references.mjs [--root <dir>] " +
    "[--document <path>] [--result <path>] [--evidence <dir>]"
  );
}

function parseArgs(argv) {
  const options = {
    root: repoRoot,
    document: undefined,
    result: undefined,
    evidence: undefined,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--document", "--result", "--evidence"].includes(flag)) {
      return { usageError: `unknown option ${String(flag)}` };
    }
    if (value === undefined || value.startsWith("--")) {
      return { usageError: `${flag} requires a value` };
    }
    options[flag.slice(2)] = value;
  }
  if (options.document === undefined) {
    options.document = join(options.root, DEFAULT_DOCUMENT);
  }
  return { options };
}

/** Read a file under the root, or undefined when it is not a regular file. */
function readUnderRoot(root, relativePath) {
  const read = readRegularFileIfPresent(join(root, relativePath));
  return read.kind === "read" ? read.body : undefined;
}

/**
 * The GitHub-style slug of a heading's text: lowercase, punctuation dropped,
 * runs of whitespace collapsed to single hyphens.
 */
export function headingSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Every ATX heading slug in a markdown body, in order. */
export function markdownAnchors(body) {
  const anchors = [];
  for (const line of body.split("\n")) {
    const match = /^#{1,6}[ \t]+(.+?)[ \t]*$/.exec(line);
    if (match !== null) {
      anchors.push(headingSlug(match[1]));
    }
  }
  return anchors;
}

/**
 * Does `anchor` name one of `slugs`?
 *
 * EQUAL, OR A HYPHEN-BOUNDED PREFIX, and the prefix half is the design
 * decision rather than a looseness. A brief's headings are written
 * `## clause <id>: <a sentence that explains it>`, so the full slug carries
 * the explanatory sentence and would break on any rewording. The STABLE part
 * is the leading `clause-<id>`, which is exactly what a reference wants to
 * name. Deleting the heading, or renaming the id, still fails; rewording the
 * title after the colon does not, and should not.
 */
export function anchorResolves(anchor, slugs) {
  const wanted = anchor.toLowerCase();
  return slugs.some((slug) => slug === wanted || slug.startsWith(`${wanted}-`));
}

/**
 * Walk a dotted key path through a decoded document.
 *
 * OBJECT SEGMENTS are ordinary property lookups. ARRAY SEGMENTS are resolved
 * by IDENTITY FIRST: an element whose `id`, `role` or `name` equals the
 * segment. That is what lets `modes.full.merge-authority` mean the mode whose
 * id is `full`, which is how a reader would write it and how the document is
 * actually organised. Failing that, an element carrying the segment as a KEY
 * is accepted, so a list of single-key mappings also resolves.
 *
 * Returns `{found: true}` or `{found: false, at: <segment that failed>}`, so
 * the diagnostic can name WHICH part of the pointer stopped resolving rather
 * than only that the whole thing did.
 */
export function resolveFieldPointer(document, pointer) {
  const segments = pointer.split(".").filter((segment) => segment !== "");
  let current = document;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const byIdentity = current.find(
        (element) =>
          element !== null &&
          typeof element === "object" &&
          !Array.isArray(element) &&
          ["id", "role", "name"].some((key) => element[key] === segment),
      );
      if (byIdentity !== undefined) {
        current = byIdentity;
        continue;
      }
      const byKey = current.find(
        (element) =>
          element !== null &&
          typeof element === "object" &&
          !Array.isArray(element) &&
          Object.prototype.hasOwnProperty.call(element, segment),
      );
      if (byKey !== undefined) {
        current = byKey[segment];
        continue;
      }
      return { found: false, at: segment };
    }
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false, at: segment };
    }
    current = current[segment];
  }
  return { found: true };
}

/**
 * Every `<path>` or `<path>#<anchor>` reference in the document, in order,
 * deduplicated. `anchor` is `undefined` for an anchorless reference, and every
 * consumer below branches on that rather than on the token's spelling.
 */
export function collectReferences(text) {
  const found = [];
  const seen = new Set();
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const anchor = match[2];
    const token = anchor === undefined ? match[1] : `${match[1]}#${anchor}`;
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    found.push({ path: match[1], anchor, token });
  }
  return found;
}

/**
 * The `files` entries of the package manifest under `root`, split into the
 * INCLUDED and the NEGATED, or `undefined` when the manifest cannot be read or
 * declares no `files`.
 */
function packagedFileRules(root) {
  const text = readUnderRoot(root, "package.json");
  if (text === undefined) {
    return undefined;
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return undefined;
  }
  const files = manifest?.files;
  if (!Array.isArray(files)) {
    return undefined;
  }
  const included = [];
  const negated = [];
  for (const entry of files) {
    if (typeof entry !== "string" || entry === "") {
      continue;
    }
    (entry.startsWith("!") ? negated : included).push(entry.replace(/^!/, "").replace(/\/$/, ""));
  }
  return { included, negated };
}

/** Whether one entry covers `path`, either exactly or as a containing directory. */
function entryCovers(entry, path) {
  return path === entry || path.startsWith(`${entry}/`);
}

/**
 * Whether `path` is inside the published package.
 *
 * THIS IS CR-002's MECHANISM, and it is a different question from "does the
 * file exist". `AGENTS.md` is itself SHIPPED, so every path it hands the reader
 * is an instruction a consumer will follow from inside `node_modules`. A path
 * that exists in the repository and not in the tarball reads as checked to every
 * guard here and is absent where it is actually used. Existence was checked and
 * shippability was not, which is why two dead references reached a shipped
 * document.
 *
 * WHAT THIS MODELS AND WHAT IT DOES NOT, stated rather than left to be found.
 * It applies npm's `files` semantics only in the plain form this package uses:
 * an entry is a literal path or a directory prefix, and a `!` entry excludes.
 * It does NOT implement glob patterns, npm's always-included list (`package.json`,
 * `README`, `LICENSE`, the `main`/`bin` targets) or its always-excluded list.
 * So it can call a path unshipped that npm would in fact include by one of those
 * rules. That direction is the safe one: it can demand a reference be rephrased,
 * never let an absent one through. Verify the assumption by reading the array,
 * which is short: `package.json#files`.
 */
function shippedPath(rules, path) {
  if (rules === undefined) {
    return undefined;
  }
  if (rules.negated.some((entry) => entryCovers(entry, path))) {
    return false;
  }
  return rules.included.some((entry) => entryCovers(entry, path));
}

/**
 * The body of a role-brief document: everything after the closing frontmatter
 * fence, or the whole text when there is no frontmatter.
 *
 * THE DUPLICATION DETECTORS RUN ON THE BODY ALONE, and that is a decision with
 * a reason rather than an oversight. The frontmatter is SCHEMA-GOVERNED and
 * closed (`additionalProperties: false`), so a gate table cannot be pasted into
 * it; what CAN legitimately appear there is this document's own `verifiers`
 * list, which names the two gate ids that verify this very file. Counting
 * those as duplicated policy data would make the document unable to declare
 * its own verifiers.
 */
export function documentBody(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_FENCE) {
    return text;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === FRONTMATTER_FENCE) {
      return lines.slice(index + 1).join("\n");
    }
  }
  return text;
}

/** Every string value at `collection[].key` of a decoded document. */
function vocabularyOf(document, collection, key) {
  const entries = document?.[collection];
  if (!Array.isArray(entries)) {
    return undefined;
  }
  const values = [];
  for (const entry of entries) {
    const value =
      entry !== null && typeof entry === "object" ? entry[key] : undefined;
    if (typeof value === "string" && value !== "") {
      values.push(value);
    }
  }
  return values;
}

/** Whole-token occurrences of `term` in `text`, ignoring case. */
function mentions(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`, "i").test(text);
}

/** The three anti-duplication detectors (criterion 3). See the thresholds. */
export function duplicationViolations(body, sources) {
  const violations = [];
  const enumerative = body
    .split("\n")
    .filter((line) => ENUMERATIVE_LINE.test(line));

  const onAnyEnumerativeLine = (term) =>
    enumerative.some((line) => mentions(line, term));

  const gateIds = (sources.gates ?? []).filter(onAnyEnumerativeLine);
  if (gateIds.length >= GATE_ID_THRESHOLD) {
    violations.push(
      `${String(gateIds.length)} distinct gate ids occur in list or table rows (${gateIds.sort().join(", ")}), ` +
        `which is a gate list; the gate list is data and lives in ${DUPLICATION_SOURCES.gates.document}`,
    );
  }

  const modeIds = (sources.modes ?? []).filter(onAnyEnumerativeLine);
  if (modeIds.length >= MODE_ID_THRESHOLD) {
    violations.push(
      `${String(modeIds.length)} distinct mode ids occur in list or table rows (${modeIds.sort().join(", ")}), ` +
        `which is a mode table; the mode definitions are data and live in ${DUPLICATION_SOURCES.modes.document}`,
    );
  }

  const paired = new Set();
  for (const line of enumerative) {
    if (!(sources.tiers ?? []).some((tier) => mentions(line, tier))) {
      continue;
    }
    for (const role of sources.roles ?? []) {
      if (mentions(line, role)) {
        paired.add(role);
      }
    }
  }
  if (paired.size >= ROLE_TIER_PAIR_THRESHOLD) {
    violations.push(
      `${String(paired.size)} roles occur in a list or table row carrying a model tier (${[...paired].sort().join(", ")}), ` +
        `which is a model-tier table; the tiers are data and live in ${DUPLICATION_SOURCES.roles.document}`,
    );
  }

  return violations;
}

/**
 * Evaluate one document against one root. Pure enough for
 * `test/agents-policy.test.ts` to drive over staged trees without a process.
 *
 * FAIL CLOSED ON A MISSING SOURCE. If `gate-registry.yaml` cannot be read, the
 * duplication detectors cannot run, and a check whose rule did not run must
 * never report the same thing as a check whose rule found nothing. That is
 * SC-011 one level down and it is why an unreadable source is a problem rather
 * than a quiet skip.
 */
export function evaluate(root, documentText) {
  const problems = [];
  const references = collectReferences(documentText);
  const packaged = packagedFileRules(root);
  if (packaged === undefined) {
    /* FAIL CLOSED, same rule as an unreadable duplication source below: a
       shippability rule that could not read the manifest has not been applied,
       and must not print as one that was applied and found nothing. */
    problems.push(
      `package.json under ${root} could not be read as a manifest declaring files[], ` +
        "so no reference could be checked for presence in the published package",
    );
  }

  for (const reference of references) {
    const target = readUnderRoot(root, reference.path);
    if (target === undefined) {
      /* CRITERION 2: the loud failure. */
      problems.push(
        `${reference.token} names ${reference.path}, which is not a readable file under ${root}`,
      );
      continue;
    }
    /* CR-002: EXISTS IS NOT THE SAME AS SHIPS. This document is in the tarball,
       so a path it names is an instruction a consumer follows from inside
       node_modules, and a path outside the tarball is dead there however well it
       resolves here. Checked for EVERY reference, anchored or not. */
    if (shippedPath(packaged, reference.path) === false) {
      problems.push(
        `${reference.token} names ${reference.path}, which exists here and is NOT in the ` +
          "published package (package.json files[]), so a consumer reading this shipped " +
          "document is being sent to a path their install does not contain",
      );
      continue;
    }
    if (reference.anchor === undefined) {
      /* An anchorless reference asserts the PATH only. It is resolved and
         ship-checked above, and there is nothing further to walk. */
      continue;
    }
    if (/\.md$/i.test(reference.path)) {
      /* CRITERION 2b, MEMBER A: a heading anchor in a markdown target. */
      if (!anchorResolves(reference.anchor, markdownAnchors(target))) {
        problems.push(
          `${reference.token} names heading anchor ${reference.anchor}, ` +
            `which no heading in ${reference.path} carries`,
        );
      }
      continue;
    }
    /* CRITERION 2b, MEMBER B: a field pointer in a structured target. Located
       by DECODING and walking, which is a different mechanism from scanning
       heading text, which is why the two are structurally different members of
       one class rather than two spellings of one. */
    const decoded = decodeDocument(target, join(root, reference.path));
    if (!decoded.ok) {
      problems.push(
        `${reference.token} names ${reference.path}, which does not decode: ${decoded.reason}`,
      );
      continue;
    }
    const resolution = resolveFieldPointer(decoded.value, reference.anchor);
    if (!resolution.found) {
      problems.push(
        `${reference.token} names field pointer ${reference.anchor}, ` +
          `which stops resolving at ${resolution.at} in ${reference.path}`,
      );
    }
  }

  if (references.length === 0) {
    problems.push(
      "the document carries no path references at all, so either its policy has " +
        "been restated inline or the reference form has changed and this check is blind",
    );
  }

  const sources = {};
  for (const [name, source] of Object.entries(DUPLICATION_SOURCES)) {
    const text = readUnderRoot(root, source.document);
    if (text === undefined) {
      problems.push(
        `the duplication detector for ${name} could not run: ${source.document} is not a readable file under ${root}`,
      );
      continue;
    }
    const decoded = decodeDocument(text, join(root, source.document));
    if (!decoded.ok) {
      problems.push(
        `the duplication detector for ${name} could not run: ${source.document} does not decode: ${decoded.reason}`,
      );
      continue;
    }
    const values = vocabularyOf(decoded.value, source.collection, source.key);
    if (values === undefined) {
      problems.push(
        `the duplication detector for ${name} could not run: ${source.document} has no ${source.collection}[] to read a vocabulary from`,
      );
      continue;
    }
    sources[name] = values;
    if (name === "roles") {
      sources.tiers = [
        ...new Set(vocabularyOf(decoded.value, source.collection, "tier") ?? []),
      ];
    }
  }

  problems.push(...duplicationViolations(documentBody(documentText), sources));

  return { problems, references };
}

function writeEvidence(options, lines) {
  if (options.evidence === undefined) {
    return [];
  }
  const path = join(options.evidence, "agents-references.txt");
  const refusal = refuseOpenForWrite(path);
  if (refusal !== undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
    return [];
  }
  try {
    mkdirSync(options.evidence, { recursive: true });
    writeFileSync(path, `${lines.join("\n")}\n`);
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: evidence could not be written: ${String(error)}\n`,
    );
    return [];
  }
  return [path];
}

function emit(options, fields) {
  const result = makeGateResult({
    gate: GATE_ID,
    status: fields.status,
    units: fields.units,
    unitLabel: UNIT_LABEL,
    startedAt: fields.startedAt,
    endedAt: new Date().toISOString(),
    detail: fields.detail,
    evidence: writeEvidence(options, fields.evidenceLines ?? [fields.detail]),
  });
  process.stdout.write(
    `${GATE_ID}: ${result.status} (${String(result.units)} ${result.unitLabel})\n`,
  );
  if (result.detail !== "") {
    process.stdout.write(`${result.detail}\n`);
  }
  if (options.result !== undefined) {
    const refusal = refuseOpenForWrite(options.result);
    if (refusal !== undefined) {
      process.stderr.write(`tiphys ${GATE_ID}: ${refusal}\n`);
      return EXIT_GATE_ERROR;
    }
    writeFileSync(options.result, renderGateResult(result));
  }
  return exitCodeForStatus(result.status);
}

function main(argv) {
  const startedAt = new Date().toISOString();
  const parsed = parseArgs(argv);
  if (parsed.options === undefined) {
    process.stderr.write(`tiphys ${GATE_ID}: ${parsed.usageError}\n${usage()}\n`);
    return EXIT_GATE_ERROR;
  }
  const options = parsed.options;

  const read = readRegularFileIfPresent(options.document);
  if (read.kind !== "read") {
    return emit(options, {
      status: "error",
      units: 0,
      startedAt,
      detail: `${options.document} is not a readable file`,
    });
  }

  const { problems, references } = evaluate(options.root, read.body);
  for (const line of problems) {
    process.stdout.write(`AGENTS-REFERENCES ${line}\n`);
  }

  return emit(options, {
    status: problems.length === 0 ? "green" : "red",
    units: references.length,
    startedAt,
    detail:
      problems.length === 0
        ? `${String(references.length)} references resolved to a path that the package publishes, ` +
          `${String(references.filter((reference) => reference.anchor !== undefined).length)} of them ` +
          `also to an anchor inside it, under root ${options.root}`
        : problems.join("; "),
    evidenceLines: [
      `root: ${options.root}`,
      `document: ${options.document}`,
      `references: ${String(references.length)}`,
      ...references.map((reference) => `  ${reference.token}`),
      ...problems.map((line) => `AGENTS-REFERENCES ${line}`),
    ],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `tiphys ${GATE_ID}: ${String(error?.message ?? error).replace(/\s+/g, " ")}\n`,
    );
    process.exitCode = EXIT_GATE_ERROR;
  }
}
