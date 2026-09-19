import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Fleet } from "./fleet.ts";
import {
  readRegularPathIfPresent,
  refuseOpenPathForWrite,
} from "./fleet.ts";
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
  /* THREE PATHS, NONE OF THEM THIS MODULE'S OWN, AND THE TYPE OF EACH IS
     ESTABLISHED BEFORE IT IS OPENED (T-008's shape in shipped code). Until
     this round all three were bare: `--brief` is named by the CALLER,
     `warnings.md` is fleet content the kernel did not create, and the target
     is a path this module CREATES, which is the write direction and blocks
     on a FIFO exactly as a read does. A named pipe at any of them took
     `tiphys spawn` down forever with zero output; `existsSync` did not help,
     because a FIFO exists. */
  const briefRead = readRegularPathIfPresent(briefFile);
  if (briefRead.kind === "absent") {
    return { ok: false, reason: `cannot read brief file ${briefFile}: it is absent` };
  }
  if (briefRead.kind === "refused") {
    return { ok: false, reason: `cannot read brief file ${briefFile}: ${briefRead.reason}` };
  }

  let content = briefRead.body;
  const warnings = warningsPath(fleet);
  const warningsRead = readRegularPathIfPresent(warnings);
  if (warningsRead.kind === "refused") {
    return {
      ok: false,
      reason: `cannot read fleet warnings file ${warnings}: ${warningsRead.reason}`,
    };
  }
  if (warningsRead.kind === "read") {
    const separator = content === "" || content.endsWith("\n") ? "" : "\n";
    content = `${content}${separator}${warningsRead.body}`;
  }

  const target = briefPath(fleet, taskId);
  const refusal = refuseOpenPathForWrite(target);
  if (refusal !== undefined) {
    return { ok: false, reason: `cannot write brief ${target}: ${refusal}` };
  }
  writeFileSync(target, content);
  return { ok: true, value: target };
}
