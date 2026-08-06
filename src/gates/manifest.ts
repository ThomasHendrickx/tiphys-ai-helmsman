import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readRegularFileIfPresent } from "../task.ts";
import {
  DIAGNOSTIC_MESSAGES,
  formatDiagnostics,
  loadSchema,
  validate,
} from "./validate.ts";
import type { Diagnostic, SchemaDocument } from "./validate.ts";

/**
 * THE GATE MANIFEST (kernel plan M2, M2-P1 step 6).
 *
 * One manifest per repository. It declares which gates exist, how each is
 * invoked, what one unit of its work is, whether an unmet precondition
 * fails the run, and which commands can destroy work.
 *
 * SCHEMA RESOLUTION FROM SOURCE AND FROM dist/ (step 5). The schema
 * documents sit beside this module at `./schemas/*.json` and are resolved
 * through `import.meta.url`, so the same code finds
 * `src/gates/schemas/...` when run from source and
 * `dist/src/gates/schemas/...` when run from the compiled entry. `tsc` does
 * not copy JSON, which was MEASURED rather than assumed (the measurement is
 * in the work history), so the build script copies the directory into
 * `dist/` and criterion 10 witnesses both documents in `npm pack` output.
 * They are deliberately NOT imported as modules: `resolveJsonModule` is off
 * in both tsconfigs, and turning it on would inline the schema into the
 * bundle and make the shipped document and the enforced document two
 * different things.
 *
 * M2-C-6: the manifest path comes from the caller, so it is read through the
 * DELIVERED `readRegularFileIfPresent`. A named pipe at the manifest path
 * reports `error` naming the path and the type, and never blocks.
 */

export type PreconditionKind =
  | "file-exists"
  | "file-absent"
  | "branch-matches"
  | "diff-touches"
  | "command-exit-zero";

export const PRECONDITION_KINDS: readonly PreconditionKind[] = [
  "file-exists",
  "file-absent",
  "branch-matches",
  "diff-touches",
  "command-exit-zero",
];

export type RunParameter = "base" | "head" | "phase";

export interface PreconditionSpec {
  id: string;
  kind: PreconditionKind;
  path?: string;
  pattern?: string;
  paths?: string[];
  command?: string[];
}

export interface GateEntry {
  id: string;
  command: string[];
  unitLabel: string;
  applicability: "required" | "conditional";
  parameters?: RunParameter[];
  precondition?: PreconditionSpec;
  modes?: string[];
}

export interface GateManifest {
  version: number;
  gates: GateEntry[];
  destructiveCommands: string[];
}

export type ManifestLoad =
  | { ok: true; manifest: GateManifest; sha256: string; body: string }
  | { ok: false; reason: string; diagnostics: string[] };

const schemaDirectory = new URL("./schemas/", import.meta.url);

function readSchemaDocument(name: string): SchemaDocument {
  const path = fileURLToPath(new URL(name, schemaDirectory));
  const read = readRegularFileIfPresent(path);
  if (read.kind !== "read") {
    throw new Error(
      read.kind === "absent"
        ? `schema document ${path} is missing from this installation`
        : read.reason,
    );
  }
  const parsed = JSON.parse(read.body) as unknown;
  const loaded = loadSchema(parsed, name);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  return loaded.schema;
}

/** The two schema documents this milestone ships, loaded once. */
let cachedManifestSchema: SchemaDocument | undefined;
let cachedResultSchema: SchemaDocument | undefined;

export function manifestSchema(): SchemaDocument {
  if (cachedManifestSchema === undefined) {
    cachedManifestSchema = readSchemaDocument("gate-manifest.schema.json");
  }
  return cachedManifestSchema;
}

export function resultSchema(): SchemaDocument {
  if (cachedResultSchema === undefined) {
    cachedResultSchema = readSchemaDocument("gate-result.schema.json");
  }
  return cachedResultSchema;
}

/**
 * Absolute paths of every schema document `manifest-self-check` validates.
 *
 * ENUMERATED, NOT ENUMERABLE-BY-HAND (fix round, M2-P1). This milestone's
 * plan (kernel-plan-v1.md) adds four more schema documents to this same
 * directory across M2-P2, M2-P4, M2-P5, M2-P6 and M2-P7. A fixed two-entry
 * list here was the mechanism, not a fluke: it named the two documents that
 * existed at the time this function was written and would keep returning
 * exactly those two forever, so manifest-self-check would silently stop
 * validating every document a later phase ships, while test/gates.test.ts's
 * independent readdir-based parity check reddens correctly the moment a
 * phase adds one (CR-812's test, `test/gates.test.ts` near line 2378). The
 * fix is to make the SAME enumeration the source of truth here: read the
 * directory beside this module, keep entries matching `*.schema.json`, and
 * sort them by filename so the order is deterministic across platforms and
 * across runs (readdir order is not guaranteed by POSIX). Every document a
 * phase drops into `src/gates/schemas/` is then validated automatically,
 * and the parity property the test checks becomes structural rather than
 * a thing two call sites have to be kept in sync by hand.
 */
export function schemaDocumentPaths(): string[] {
  const directory = fileURLToPath(schemaDirectory);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".schema.json"))
    .sort()
    .map((name) => fileURLToPath(new URL(name, schemaDirectory)));
}

/**
 * The kind-specific required fields, checked here rather than in the schema.
 *
 * WHY NOT IN THE SCHEMA. Expressing "kind file-exists requires path" needs
 * conditional composition (`if`/`then`, or `oneOf`), and both are outside
 * M2-D-04's closed keyword set, which DR-0013 decided against growing. So
 * the check lives in code and emits the SAME `INVALID <pointer> <message>`
 * diagnostics, which keeps one diagnostic contract rather than two. When
 * M3-P1 swaps in Ajv the constraint can move into the schema without any
 * consumer noticing, because the output line is unchanged.
 */
const REQUIRED_FIELD_FOR_KIND: Record<PreconditionKind, string> = {
  "file-exists": "path",
  "file-absent": "path",
  "branch-matches": "pattern",
  "diff-touches": "paths",
  "command-exit-zero": "command",
};

function preconditionFieldDiagnostics(manifest: unknown): Diagnostic[] {
  const found: Diagnostic[] = [];
  const gates = (manifest as { gates?: unknown }).gates;
  if (!Array.isArray(gates)) {
    return found;
  }
  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index] as { precondition?: Record<string, unknown> };
    const precondition = gate?.precondition;
    if (precondition === undefined || precondition === null) {
      continue;
    }
    const kind = precondition["kind"];
    if (typeof kind !== "string" || !PRECONDITION_KINDS.includes(kind as PreconditionKind)) {
      continue;
    }
    const field = REQUIRED_FIELD_FOR_KIND[kind as PreconditionKind];
    if (precondition[field] === undefined) {
      found.push({
        pointer: `#/gates/${index}/precondition/${field}`,
        message: DIAGNOSTIC_MESSAGES.required(field),
      });
    }
  }
  return found;
}

/** Every duplicate gate id, as diagnostics. A registry keyed by name cannot hold two. */
function duplicateIdDiagnostics(manifest: unknown): Diagnostic[] {
  const found: Diagnostic[] = [];
  const gates = (manifest as { gates?: unknown }).gates;
  if (!Array.isArray(gates)) {
    return found;
  }
  const seen = new Set<string>();
  for (let index = 0; index < gates.length; index += 1) {
    const id = (gates[index] as { id?: unknown })?.id;
    if (typeof id !== "string") {
      continue;
    }
    if (seen.has(id)) {
      found.push({
        pointer: `#/gates/${index}/id`,
        message: DIAGNOSTIC_MESSAGES.duplicateId(JSON.stringify(id)),
      });
    }
    seen.add(id);
  }
  return found;
}

/**
 * Validate an already-parsed manifest document. Returns the diagnostics in
 * the contract's deterministic order (by pointer, then message).
 */
export function validateManifestDocument(document: unknown): string[] {
  const diagnostics = [
    ...validate(manifestSchema(), document),
    ...preconditionFieldDiagnostics(document),
    ...duplicateIdDiagnostics(document),
  ];
  diagnostics.sort((a, b) => {
    if (a.pointer !== b.pointer) {
      return a.pointer < b.pointer ? -1 : 1;
    }
    if (a.message === b.message) {
      return 0;
    }
    return a.message < b.message ? -1 : 1;
  });
  return formatDiagnostics(diagnostics);
}

/** Validate an already-parsed gate result record. */
export function validateResultDocument(document: unknown): string[] {
  return formatDiagnostics(validate(resultSchema(), document));
}

/**
 * Load and validate a manifest from a path the caller supplied.
 *
 * Fail closed at every step: not a regular file, absent, unparseable, or
 * schema-invalid all produce `ok: false` with a reason. None of them
 * produces a manifest with fewer gates in it, which is the failure this
 * whole milestone exists to make impossible.
 */
export function loadManifest(path: string): ManifestLoad {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return {
      ok: false,
      reason: `manifest ${path} does not exist`,
      diagnostics: [],
    };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason, diagnostics: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.body);
  } catch (error) {
    return {
      ok: false,
      reason: `manifest ${path} does not parse as JSON: ${(error as Error).message}`,
      diagnostics: [],
    };
  }
  const diagnostics = validateManifestDocument(parsed);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `manifest ${path} is not a valid gate manifest`,
      diagnostics,
    };
  }
  return {
    ok: true,
    manifest: parsed as GateManifest,
    sha256: createHash("sha256").update(read.body).digest("hex"),
    body: read.body,
  };
}
