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
  /**
   * `raw` is the DECODED DOCUMENT before this module projects it into `Mode`
   * records. It is returned because a caller must be able to validate what it
   * is about to serve, and the projection is lossy by design (it drops
   * anything the projection does not name). Handing a caller only the
   * projection would force it to validate a shape no schema describes.
   */
  | { ok: true; path: string; raw: unknown; modes: Mode[] }
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
  return { ok: true, path, raw: decoded.value, modes };
}

/**
 * Where the rendered document came from. `shippedDocument` is true only when
 * the reader was given no `--file` and therefore read the kernel's OWN
 * `assurance-modes.yaml` from the package root.
 *
 * It is a REQUIRED parameter rather than an option with a default, because the
 * execution-status line below is a claim about a specific document and a
 * default would let a caller make that claim by omission.
 */
export interface RenderContext {
  shippedDocument: boolean;
}

/**
 * The execution status of one mode, DERIVED rather than looked up in a list of
 * ids (CR-004 item 2, DR-0019).
 *
 * Two facts are available and both are checkable by the reader: whether this is
 * the kernel's own document, and whether the mode declares any skipped stage.
 * Blueprint section 8's sentence is what makes the second one mean something,
 * "The current proven process is the definition of `full`. Downgrades are
 * declared, never improvised", so a mode with a non-empty `skips` list is BY
 * ITS OWN DECLARATION a downgrade of the un-downgraded process.
 *
 * WHAT THIS DELIBERATELY DOES NOT SAY. It does not say that tiphys runs
 * anything: nothing runs on tiphys before M4. The un-downgraded mode of the
 * kernel's own document is the process the tiphys PROJECT follows for its own
 * delivery; the downgraded ones have never been entered at all. And for a
 * document that is not the kernel's own, the answer is that tiphys does not
 * know, because it does not.
 */
export function executionStatus(mode: Mode, context: RenderContext): string {
  if (!context.shippedDocument) {
    return (
      "not determinable here. This is not the kernel's own assurance-modes.yaml, " +
      "so nothing tiphys ships records whether any phase has been delivered under " +
      "this mode (DR-0019)."
    );
  }
  if (mode.skips.length === 0) {
    return (
      "this mode declares no skipped stage, so it is the un-downgraded process, " +
      "and it is the one the tiphys project follows for its own delivery."
    );
  }
  return (
    `DECLARED AND VALIDATED, NEVER EXERCISED. This mode declares ${String(mode.skips.length)} ` +
    "skipped stage(s), so it is a declared downgrade of the un-downgraded process, and no " +
    "phase of the tiphys project has ever been delivered under it. Its pipeline and its gate " +
    "selection are checked by validation only (DR-0019)."
  );
}

/**
 * The standing limits of this release, printed on every invocation.
 *
 * IT SAYS ONLY WHAT THE SHIPPED SCHEMAS DO. The vocabularies really are closed
 * enums, so "a document naming any other id is rejected" is the enum's own
 * behaviour and not a claim about intent. The M4 sentence is attributed to
 * DR-0019 rather than stated as a property of the code.
 */
export const RELEASE_LIMITS =
  "limits: the mode, stage and role vocabularies in the shipped schemas are this " +
  "repository's own closed enums, so a document naming any other id is rejected and a " +
  "consuming project cannot extend them at v0.1.0; whether to open them is an M4 question " +
  "(DR-0019). This command SHOWS a declared mode: nothing in this release resolves a " +
  "project into a mode, enforces one, or runs one.";

/**
 * Render one mode for a human or for a brief.
 *
 * THE SHAPE IS PART OF THE CONTRACT, because criterion 2 asserts over it: a
 * section is a line ending in a colon at column zero, and its items are the
 * lines indented by exactly two spaces beneath it. That makes "prints exactly
 * the twelve stage ids in order" something a test can extract rather than
 * something a reader has to eyeball.
 */
export function renderMode(mode: Mode, context: RenderContext): string[] {
  const lines: string[] = [`mode: ${mode.id}`];
  /* SECOND LINE, not a footnote. CR-004 measured that `mode show` printed a
     never-exercised mode with exactly the confidence of the exercised one, and
     that the only disclosure lived in `delivery/`, which the package excludes. */
  lines.push(`execution-status: ${executionStatus(mode, context)}`);
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
    /* CR-004 item 3. The bounds are DATA an orchestrator brief cites. Nothing
       in this release counts a fix round or detects a recurrence, so a bare
       `escalation-bounds:` header invites the reader to assume an enforcement
       engine that does not exist. */
    lines.push(
      "escalation-bounds (data an orchestrator brief cites; nothing in this release counts fix rounds, detects recurrence, or enforces these):",
    );
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
  lines.push(RELEASE_LIMITS);
  return lines;
}
