/**
 * WHERE A CHARTER IS, and the ONE rule for reading a fleet's `charter/`
 * directory (M5-P2 fix round 1, finding CR-001).
 *
 * THE MECHANISM THIS MODULE EXISTS TO CLOSE: two readers located "the charter"
 * by different rules. `tiphys doctor` read every YAML document in
 * `<fleet>/charter/` and kept those with `kind: charter`
 * (src/commands/doctor.ts, the retention check). `tiphys brief compose` looked
 * only at `<cwd>/charter.yaml`. In the layout `tiphys init` creates, the
 * charter lives in `charter/`, so doctor read it and the composer reported
 * "no charter declared" from the same directory, exit 0. Two probes of one
 * fact with two rules answer about different things and never disagree out
 * loud.
 *
 * So the directory walk and its classification live HERE, once, and both
 * callers consume the same ordered entry list. Each caller still decides what
 * an entry means for ITS verdict (doctor turns entries into retention lines,
 * the composer into one product intent or a refusal); what they can no longer
 * do is disagree about which documents are charters.
 *
 * THE ROOT FILE. A project repository keeps its charter at `<root>/charter.yaml`
 * (CHARTER_DOCUMENT in src/checks.ts, read by the dual-review gate from a
 * commit). `locateCharters` reports that file as a candidate beside the
 * directory's charters, so a composer run at a project root and one run at a
 * fleet root use the same function. Doctor runs at a fleet root and reads the
 * directory only, which is the half of this module it calls.
 *
 * D-M3-27: every path is typed before it is opened. `readRegularFileIfPresent`
 * refuses a named pipe, a directory or a device by name in bounded time.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyEntry, readRegularFileIfPresent } from "./task.ts";
import { decodeDocument } from "./validate.ts";

/** The fleet directory charters live in (FLEET_DIRS in src/fleet.ts). */
export const CHARTER_DIRECTORY = "charter";

/** The project-root charter file (the same name as CHARTER_DOCUMENT in src/checks.ts). */
export const ROOT_CHARTER_FILE = "charter.yaml";

/**
 * One YAML document in `charter/`, classified. The list is in sorted file-name
 * order, which is the order doctor has always walked.
 *
 * - `absent`: listed, then gone before the read. Still a YAML candidate.
 * - `refused`: present and not a regular file, or unreadable. Never opened.
 * - `undecodable`: read and did not decode.
 * - `not-charter`: decoded, and `kind` is not `charter`.
 * - `charter`: decoded with `kind: charter`.
 */
export type CharterDirectoryEntry =
  | { path: string; kind: "absent" }
  | { path: string; kind: "refused"; reason: string }
  | { path: string; kind: "undecodable"; reason: string }
  | { path: string; kind: "not-charter" }
  | { path: string; kind: "charter"; document: Record<string, unknown> };

export type CharterDirectoryReading =
  /** No listable `charter/` directory at all. */
  | { kind: "no-directory"; directory: string }
  | {
      kind: "listed";
      directory: string;
      /** How many `.yaml` or `.yml` names the directory holds. */
      candidates: number;
      entries: CharterDirectoryEntry[];
    };

/** Read and classify every YAML document in `directory`. */
export function readCharterDirectory(directory: string): CharterDirectoryReading {
  let names: string[];
  try {
    names = readdirSync(directory).sort();
  } catch {
    return { kind: "no-directory", directory };
  }
  const entries: CharterDirectoryEntry[] = [];
  let candidates = 0;
  for (const name of names) {
    if (!name.endsWith(".yaml") && !name.endsWith(".yml")) {
      continue;
    }
    candidates += 1;
    const path = join(directory, name);
    const read = readRegularFileIfPresent(path);
    if (read.kind === "refused") {
      entries.push({ path, kind: "refused", reason: read.reason });
      continue;
    }
    if (read.kind === "absent") {
      entries.push({ path, kind: "absent" });
      continue;
    }
    let value: unknown;
    try {
      const decoded = decodeDocument(read.body, path);
      if (!decoded.ok) {
        entries.push({ path, kind: "undecodable", reason: decoded.reason });
        continue;
      }
      value = decoded.value;
    } catch (error) {
      entries.push({
        path,
        kind: "undecodable",
        reason: `${path} could not be decoded: ${String(error)}`,
      });
      continue;
    }
    const document = (value ?? {}) as Record<string, unknown>;
    if (document["kind"] !== "charter") {
      entries.push({ path, kind: "not-charter" });
      continue;
    }
    entries.push({ path, kind: "charter", document });
  }
  return { kind: "listed", directory, candidates, entries };
}

/**
 * Where a charter is declared, seen from `root` (a fleet root or a project
 * root), without `--charter`.
 *
 * - `error`: something in `charter/` was refused or did not decode. A reader
 *   that cannot establish the directory's contents does not guess.
 * - `found`: the candidate paths, in order: the root file first when ANY entry
 *   exists at it (judged by lstat, so a dangling link or a named pipe counts
 *   and is then refused by the reader), then each `kind: charter` document in
 *   `charter/`. Zero, one or several.
 * - `nonCharterYaml`: how many YAML documents in `charter/` are not charters,
 *   so "nothing declared" and "YAML that is not a charter" stay different
 *   facts (doctor's retention-not-applicable versus retention-undeclared).
 */
export type CharterLocation =
  | { kind: "error"; reason: string }
  | {
      kind: "located";
      rootFile: string;
      directory: string;
      found: string[];
      nonCharterYaml: number;
    };

export function locateCharters(root: string): CharterLocation {
  const rootFile = join(root, ROOT_CHARTER_FILE);
  const directory = join(root, CHARTER_DIRECTORY);
  const found: string[] = [];
  if (classifyEntry(rootFile).kind !== "absent") {
    found.push(rootFile);
  }
  const reading = readCharterDirectory(directory);
  let nonCharterYaml = 0;
  if (reading.kind === "listed") {
    for (const entry of reading.entries) {
      if (entry.kind === "refused" || entry.kind === "undecodable") {
        return { kind: "error", reason: entry.reason };
      }
      if (entry.kind === "charter") {
        found.push(entry.path);
      } else {
        nonCharterYaml += 1;
      }
    }
  }
  return { kind: "located", rootFile, directory, found, nonCharterYaml };
}
