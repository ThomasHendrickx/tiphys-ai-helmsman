/**
 * READING THE SHIPPED ASSURANCE MODE DEFINITIONS (kernel plan M3, M3-P3
 * step 5).
 *
 * `assurance-modes.yaml` ships at the package root, beside `gate-registry.yaml`
 * and the `schemas/` directory. This module locates it, decodes it, and
 * answers one question: what does a declared mode require. Nothing here
 * RESOLVES a mode into behaviour and nothing here enforces one. M3 never
 * executes `direct-pr` or `local-only`, and building an enforcement engine for
 * a mode this milestone never enters is the M1-P3 failure the plan is trying
 * not to repeat.
 *
 * NO VALIDATION HAPPENS HERE, deliberately. `tiphys validate --type
 * assurance-modes` is the command that says whether the document is
 * well-formed, and duplicating its rules in a reader would produce a second
 * opinion to keep in sync. This module reads what is there and reports what it
 * cannot find.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodeDocument, readOperatorPath } from "./validate.ts";

/** The shipped document's basename, at the package root. */
export const MODES_FILENAME = "assurance-modes.yaml";

/**
 * Locate the package root by walking UP from this module and testing for the
 * shipped document.
 *
 * The depth differs between the two layouts this code runs in: from source it
 * is `src/` and the root is one level up, and from the built entry it is
 * `dist/src/` and the root is two levels up. Counting `..` would be right in
 * exactly one of them, which is the layout-dependent break
 * `schemasDirectory()` already documents. Walking up and TESTING is right in
 * both, and in a relocated copy as well.
 */
export function packageRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      if (readdirSync(directory).includes(MODES_FILENAME)) {
        return directory;
      }
    } catch {
      /* not readable here; keep walking */
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  throw new Error(
    `the shipped ${MODES_FILENAME} was not found above this module; the installation is incomplete`,
  );
}

/** One mode as the document declares it. Fields absent from the document stay absent. */
export interface Mode {
  id: string;
  declaredBy: string;
  pipeline: string[];
  skips: string[];
  gateSets: string[];
  mergeAuthority: string;
  grantedBy?: string;
  conditions?: string[];
  reviewContracts?: string[];
  escalationBounds?: Record<string, unknown>;
}

export type ModesRead =
  | { ok: true; path: string; modes: Mode[] }
  | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function optionalStrings(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  return record[key] === undefined ? undefined : strings(record, key);
}

/** Read and decode the shipped document, or say why it could not be read. */
export function readModes(path: string = join(packageRoot(), MODES_FILENAME)): ModesRead {
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  const document = asRecord(decoded.value);
  if (document === undefined) {
    return { ok: false, reason: `${path} does not decode to a mapping` };
  }
  const raw = document["modes"];
  if (!Array.isArray(raw)) {
    return { ok: false, reason: `${path} declares no modes list` };
  }
  const modes: Mode[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (record === undefined) {
      continue;
    }
    modes.push({
      id: String(record["id"] ?? ""),
      declaredBy: String(record["declared-by"] ?? ""),
      pipeline: strings(record, "pipeline"),
      skips: strings(record, "skips"),
      gateSets: strings(record, "gate-sets"),
      mergeAuthority: String(record["merge-authority"] ?? ""),
      grantedBy:
        typeof record["granted-by"] === "string" ? record["granted-by"] : undefined,
      conditions: optionalStrings(record, "conditions"),
      reviewContracts: optionalStrings(record, "review-contracts"),
      escalationBounds: asRecord(record["escalation-bounds"]),
    });
  }
  return { ok: true, path, modes };
}

/**
 * Render one mode for a human or for a brief.
 *
 * THE SHAPE IS PART OF THE CONTRACT, because criterion 2 asserts over it: a
 * section is a line ending in a colon at column zero, and its items are the
 * lines indented by exactly two spaces beneath it. That makes "prints exactly
 * the twelve stage ids in order" something a test can extract rather than
 * something a reader has to eyeball.
 */
export function renderMode(mode: Mode): string[] {
  const lines: string[] = [`mode: ${mode.id}`];
  lines.push(`merge-authority: ${mode.mergeAuthority}`);
  if (mode.grantedBy !== undefined) {
    lines.push(`granted-by: ${mode.grantedBy}`);
  }
  const section = (name: string, items: string[] | undefined): void => {
    if (items === undefined) {
      return;
    }
    lines.push(`${name}:`);
    if (items.length === 0) {
      lines.push("  (none)");
      return;
    }
    for (const item of items) {
      lines.push(`  ${item}`);
    }
  };
  section("pipeline", mode.pipeline);
  section("skips", mode.skips);
  section("gate-sets", mode.gateSets);
  section("review-contracts", mode.reviewContracts);
  if (mode.escalationBounds !== undefined) {
    lines.push("escalation-bounds:");
    for (const key of Object.keys(mode.escalationBounds).sort()) {
      lines.push(`  ${key}: ${String(mode.escalationBounds[key])}`);
    }
  }
  if (mode.conditions !== undefined) {
    lines.push("conditions:");
    for (const condition of mode.conditions) {
      lines.push(`  ${condition.replace(/\s+/g, " ").trim()}`);
    }
  }
  lines.push(`declared-by: ${mode.declaredBy.replace(/\s+/g, " ").trim()}`);
  return lines;
}
