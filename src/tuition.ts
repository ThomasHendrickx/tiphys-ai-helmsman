/**
 * THE TUITION FEED AND THE MECHANISM INDEX (kernel plan M3, M3-P8; R-091).
 *
 * A tuition entry records one failure mode a delivery paid for. The MECHANISM
 * INDEX is a PROJECTION of the `mechanisms[]` field of every entry in the
 * feed, keyed by mechanism, and it is generated rather than authored. T-005 is
 * why both halves exist and why they are one artifact rather than two: a rule
 * M1-P3 paid for did not reach M1-P5, which reimplemented the same claim-file
 * mechanism silently and produced the most severe defect found in M1, and a
 * second hand-maintained copy of a rule is the state that produced it.
 *
 * THE TWO LAYERS ARE STRUCTURALLY DISTINCT, which is the plan's compaction
 * model (step 2c). The index is the READ layer: dense, consulted at every
 * dispatch under the `mechanism-lookup` obligation. The entries are the
 * ARCHIVE layer: longer, read when a rule is disputed. `tuition index --check`
 * is what keeps the first honest about the second.
 *
 * PATHS THIS MODULE READS ARE NOT ITS OWN (D-M3-27, the mechanism index's own
 * row "Reading a path whose type is not established"). Every read goes through
 * `readOperatorPath`, so a named pipe at an entry path is refused with the
 * observed entry type instead of blocking the command forever.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  classifyContextDirectory,
  decodeDocument,
  formatDiagnostics,
  readOperatorPath,
  validateInstance,
} from "./validate.ts";
import { loadTypeSchema } from "./commands/validate.ts";

/** The generated index, relative to a tuition directory. */
export const MECHANISM_INDEX_FILE = "mechanism-index.yaml";

/** One mechanism as a tuition entry declares it. */
export interface MechanismDeclaration {
  mechanism: string;
  rule: string;
  siblings?: string[];
  "machine-readable-form"?: { path: string; key: string };
  evidence: string[];
}

/** One tuition entry, after schema validation. */
export interface TuitionEntry {
  kind: "tuition";
  version: number;
  id: string;
  project: string;
  date: string;
  stage: string;
  "kernel-relevant": boolean;
  "what-happened": string;
  lesson: string[];
  mechanisms?: MechanismDeclaration[];
  "structural-consequence"?: {
    target: string;
    status: "proposed" | "applied" | "ticketed";
    change: string;
    record?: string;
  }[];
  evidence: string[];
}

/** One row of the generated index, plus the entry it was projected from. */
export interface IndexRow {
  key: string;
  name: string;
  rule: string;
  siblings?: string[];
  "machine-readable-form"?: { path: string; key: string };
  evidence: string[];
  /** The tuition id this row came from. Not part of the rendered document. */
  source: string;
}

/**
 * THE KEY IS DERIVED FROM THE NAME, NEVER INVENTED: lowercase, every run of
 * characters outside [a-z0-9] collapsed to one hyphen, ends trimmed. The same
 * derivation `schemas/mechanism-index.schema.json` documents and M3-P6's
 * registered test applies, stated once in code so the generator and the check
 * cannot disagree about it.
 */
export function mechanismKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type EntryFileListing =
  | { ok: true; paths: string[] }
  | { ok: false; reason: string };

/**
 * Every tuition ENTRY file in a directory, sorted by name.
 *
 * The generated index lives in the same directory and is EXCLUDED BY NAME: it
 * is the projection's output, and a projection that reads its own output is a
 * loop rather than a check. Anything that is not a `.yaml` file is ignored, so
 * a README beside the feed is not an entry.
 */
export function listEntryFiles(directory: string): EntryFileListing {
  const problem = classifyContextDirectory(directory);
  if (problem !== undefined) {
    return { ok: false, reason: problem };
  }
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    return {
      ok: false,
      reason: `${directory} could not be listed: ${String(error)}`,
    };
  }
  const paths = names
    .filter((name) => name.endsWith(".yaml") && name !== MECHANISM_INDEX_FILE)
    .sort()
    .map((name) => join(directory, name));
  return { ok: true, paths };
}

export type EntryLoad =
  | { ok: true; entry: TuitionEntry; body: string }
  | { ok: false; reason: string; diagnostics: string[] };

/**
 * Read, decode and schema-validate one tuition entry.
 *
 * THE RAW BYTES COME BACK WITH THE ENTRY, and that is not a convenience. An
 * earlier version had `tuition add` call this and then read the same path a
 * second time for the bytes to write. Two reads meant two independent
 * refusals of a non-regular path, and a refusal that another refusal shadows
 * cannot be witnessed: mutating either left the other rejecting the same
 * input, which is exactly the shape T-018 records. One read, one
 * classification, one guard.
 */
export function loadEntry(path: string): EntryLoad {
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason, diagnostics: [] };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason, diagnostics: [] };
  }
  const diagnostics = formatDiagnostics(
    validateInstance(loadTypeSchema("tuition"), decoded.value),
  );
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `${path} is not a valid tuition entry`,
      diagnostics,
    };
  }
  return { ok: true, entry: decoded.value as TuitionEntry, body: read.body };
}

export type Projection =
  | { ok: true; rows: IndexRow[] }
  | { ok: false; reason: string };

/**
 * Project the mechanism index out of a set of entries, sorted by key.
 *
 * A KEY CLAIMED BY TWO ENTRIES IS AN ERROR NAMING BOTH, never a silent
 * first-wins. Two entries stating the same mechanism differently is exactly
 * the divergence this document exists to prevent, and the projection cannot
 * decide which of the two rules the project actually learned. The resolution
 * is an editorial one: merge the two entries' rules by hand into whichever one
 * owns the mechanism.
 */
export function projectIndex(
  entries: readonly TuitionEntry[],
): Projection {
  const byKey = new Map<string, IndexRow>();
  for (const entry of entries) {
    for (const declaration of entry.mechanisms ?? []) {
      const key = mechanismKey(declaration.mechanism);
      if (key === "") {
        return {
          ok: false,
          reason: `${entry.id} declares mechanism ${JSON.stringify(declaration.mechanism)}, whose derived key is empty`,
        };
      }
      const existing = byKey.get(key);
      if (existing !== undefined) {
        return {
          ok: false,
          reason: `mechanism ${key} is declared by both ${existing.source} and ${entry.id}; one entry owns a mechanism`,
        };
      }
      const row: IndexRow = {
        key,
        name: declaration.mechanism,
        rule: declaration.rule,
        evidence: [...declaration.evidence],
        source: entry.id,
      };
      if (declaration.siblings !== undefined) {
        row.siblings = [...declaration.siblings];
      }
      const machine = declaration["machine-readable-form"];
      if (machine !== undefined) {
        row["machine-readable-form"] = { path: machine.path, key: machine.key };
      }
      byKey.set(key, row);
    }
  }
  const rows = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  return { ok: true, rows };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                            */
/* ------------------------------------------------------------------ */

/**
 * Emit a YAML scalar, quoting only when a plain one would not round trip.
 *
 * THE CONDITION IS THE POINT: this generator's output is re-read by
 * `--check`, so a scalar that YAML would decode as something other than the
 * string handed in makes the projection disagree with itself. The reserved
 * leading indicators, an embedded `: ` or ` #`, and a trailing colon are the
 * cases; everything else is emitted plain, which is what keeps the document
 * readable.
 */
export function yamlScalar(value: string): string {
  const risky =
    value === "" ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    value.includes(": ") ||
    value.includes(" #") ||
    value.endsWith(":") ||
    value.includes("\n") ||
    value.trim() !== value;
  return risky ? JSON.stringify(value) : value;
}

/** Fold one paragraph to a width, at spaces, with a fixed indent. */
function foldedBlock(text: string, indent: string, width: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length + indent.length > width) {
      lines.push(`${indent}${current}`);
      current = word;
      continue;
    }
    current = `${current} ${word}`;
  }
  if (current !== "") {
    lines.push(`${indent}${current}`);
  }
  return lines;
}

const HEADER = `# THE MECHANISM INDEX (kernel plan M3; T-005, D-M3-23).
#
# GENERATED BY \`tiphys tuition index\`. DO NOT EDIT THIS FILE. It is a
# PROJECTION of the \`mechanisms[]\` field of every entry in the tuition feed
# beside it, so a rule is recorded once, in the entry that paid for it, and
# read from here. \`tiphys tuition index --check\` compares this file against a
# fresh projection and exits nonzero on any drift, which is what stops the two
# from becoming two sources.
#
# READ THE ROW BEFORE YOU USE THE MECHANISM. Every rule here was paid for with
# a defect, a fix round, or an investigation, which is why \`evidence\` is a
# required field with at least one entry: a rule with no citation is not a
# rule.
#
# WHY THIS FILE EXISTS AT ALL. T-005 records a rule M1-P3 paid for in a
# multi-hour investigation that did not reach M1-P5, which reimplemented the
# same claim-file mechanism silently and produced the most severe defect found
# in that milestone. The implementer there had read the plan, the agent-rules
# file, the constraint list, the accumulated environment warnings and three
# work histories. None of them carried the rule, because a rule about a
# MECHANISM has no home in a set of documents organised by phase. This is that
# home, and the obligation to consult it is the \`mechanism-lookup\` clause in
# roles/implementer.md.
#
# \`key\` IS DERIVED FROM \`name\`, NOT INVENTED: lowercase, every run of
# characters outside [a-z0-9] collapsed to one hyphen, ends trimmed.
`;

/** Render the index document. The bytes are what `--check` compares. */
export function renderIndex(rows: readonly IndexRow[]): string {
  const lines: string[] = [HEADER, "kind: mechanism-index", "version: 1", "", "mechanisms:"];
  for (const row of rows) {
    lines.push(`  - key: ${row.key}`);
    lines.push(`    name: ${yamlScalar(row.name)}`);
    lines.push("    rule: >-");
    lines.push(...foldedBlock(row.rule, "      ", 78));
    if (row.siblings !== undefined) {
      if (row.siblings.length === 0) {
        lines.push("    siblings: []");
      } else {
        lines.push("    siblings:");
        for (const sibling of row.siblings) {
          lines.push(`      - ${yamlScalar(sibling)}`);
        }
      }
    }
    const machine = row["machine-readable-form"];
    if (machine !== undefined) {
      lines.push("    machine-readable-form:");
      lines.push(`      path: ${yamlScalar(machine.path)}`);
      lines.push(`      key: ${yamlScalar(machine.key)}`);
    }
    lines.push("    evidence:");
    for (const item of row.evidence) {
      lines.push(`      - ${yamlScalar(item)}`);
    }
    lines.push("");
  }
  /* One trailing newline, never two: the last row already pushed a blank. */
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/* ------------------------------------------------------------------ */
/* Drift                                                                */
/* ------------------------------------------------------------------ */

interface CommittedRow {
  key?: unknown;
  name?: unknown;
  rule?: unknown;
  siblings?: unknown;
  "machine-readable-form"?: unknown;
  evidence?: unknown;
}

/**
 * Compare a committed index document against a fresh projection.
 *
 * NAMES THE MECHANISM AND THE ENTRY IT CAME FROM, which is the criterion's
 * letter (4): a reader of a red `--check` must be able to go straight to the
 * file that changed. Both directions are reported, because a row DELETED from
 * the feed and a row ADDED to it are different faults with the same symptom.
 *
 * The field comparison is over the DECODED values rather than the bytes, so a
 * rewrap of a folded scalar is not reported as a rule change; a byte
 * comparison is done by the caller afterwards and reported as formatting,
 * which keeps "the rule changed" and "the file was hand-edited" apart.
 */
export function driftLines(
  committed: unknown,
  rows: readonly IndexRow[],
): string[] {
  const problems: string[] = [];
  const document = committed as { mechanisms?: unknown } | null;
  const committedRows: CommittedRow[] = Array.isArray(document?.mechanisms)
    ? (document.mechanisms as CommittedRow[])
    : [];
  const committedByKey = new Map<string, CommittedRow>();
  for (const row of committedRows) {
    if (typeof row?.key === "string") {
      committedByKey.set(row.key, row);
    }
  }
  for (const row of rows) {
    const found = committedByKey.get(row.key);
    if (found === undefined) {
      problems.push(
        `mechanism ${row.key} is declared by tuition entry ${row.source} and is missing from the committed index`,
      );
      continue;
    }
    const expected = JSON.stringify({
      name: row.name,
      rule: row.rule,
      siblings: row.siblings ?? null,
      machine: row["machine-readable-form"] ?? null,
      evidence: row.evidence,
    });
    const actual = JSON.stringify({
      name: found.name,
      rule: typeof found.rule === "string" ? found.rule.trim() : found.rule,
      siblings: found.siblings ?? null,
      machine: found["machine-readable-form"] ?? null,
      evidence: found.evidence,
    });
    if (expected !== actual) {
      problems.push(
        `mechanism ${row.key} differs from the projection of tuition entry ${row.source}`,
      );
    }
  }
  const projected = new Set(rows.map((row) => row.key));
  for (const key of [...committedByKey.keys()].sort()) {
    if (!projected.has(key)) {
      problems.push(
        `mechanism ${key} is in the committed index and no tuition entry declares it`,
      );
    }
  }
  return problems;
}
