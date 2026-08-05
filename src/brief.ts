import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import { briefPath } from "./task.ts";

/**
 * Brief assembly (kernel plan v1, M1-P4 step 2; R-033b, R-083b).
 *
 * The brief for a task is written once, at spawn, to tasks/<id>/brief.md:
 * the operator's brief file verbatim, followed by the fleet's
 * environment-warnings file verbatim when the fleet has one. The
 * warnings file is <fleet>/warnings.md (fleet root, tracked content, not
 * the ignored state/ area). When no warnings file exists, brief.md is
 * byte-identical to the brief file.
 *
 * Verbatim means verbatim: no heading, no banner, no rewriting. A brief
 * is the durable instruction an implementer is judged against, and a
 * kernel that edits it makes the audit trail lie. The only byte this
 * module may add is a single newline between the two documents when the
 * brief does not already end in one.
 */

/** The fleet's environment-warnings file, appended to every brief. */
export const WARNINGS_FILE = "warnings.md";

export function warningsPath(fleet: Fleet): string {
  return join(fleet.root, WARNINGS_FILE);
}

export type BriefResult = { ok: true; value: string } | { ok: false; reason: string };

/**
 * Assemble tasks/<id>/brief.md from briefFile. Returns the written path.
 * The task directory must already exist.
 */
export function assembleBrief(
  fleet: Fleet,
  taskId: string,
  briefFile: string,
): BriefResult {
  let brief: string;
  try {
    brief = readFileSync(briefFile, "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: `cannot read brief file ${briefFile}: ${(error as Error).message}`,
    };
  }

  let content = brief;
  const warnings = warningsPath(fleet);
  if (existsSync(warnings)) {
    let warningsText: string;
    try {
      warningsText = readFileSync(warnings, "utf8");
    } catch (error) {
      return {
        ok: false,
        reason: `cannot read fleet warnings file ${warnings}: ${(error as Error).message}`,
      };
    }
    const separator = content === "" || content.endsWith("\n") ? "" : "\n";
    content = `${content}${separator}${warningsText}`;
  }

  const target = briefPath(fleet, taskId);
  writeFileSync(target, content);
  return { ok: true, value: target };
}
