/**
 * READING AND RESOLVING REVIEW CHECKLISTS (kernel plan M3, M3-P7 steps 2 to
 * 5; R-054, T-001).
 *
 * `checklists/` ships at the package root beside `gate-registry.yaml`,
 * `assurance-modes.yaml` and `schemas/`. This module locates it, decodes a
 * checklist, merges a per-phase extra probe file into it, and orders the
 * result under a declared framing. It answers one question: WHICH PROBES, IN
 * WHICH ORDER, does this reviewer answer.
 *
 * NO VALIDATION HAPPENS HERE, deliberately, and this is the same split
 * `src/modes.ts` documents: `tiphys validate --type checklist` decides whether
 * a document is well formed, and duplicating its rules in a reader would
 * produce a second opinion to keep in sync. The COMMAND validates before it
 * serves (`src/commands/checklist.ts`), which is where the M3-P3 fix round put
 * that duty after shipping a reader that printed without checking.
 *
 * THE TWO MERGE FAILURES R-054 NAMES ARE FAILURES HERE AND NOT WARNINGS.
 * An extra file reusing a canonical probe id is a COLLISION and names both
 * sources; an extra probe missing `evidence-required` is a refusal. Last-wins
 * would be the dangerous state: the phase's own hazard class names "an
 * extra-probe merge that silently overrides a canonical probe instead of
 * colliding", and a silent override is how a per-phase file quietly weakens
 * the standing checklist.
 *
 * ORDERING IS BY SCOPE AND FILE POSITION, NEVER BY PROBE ID. A framing names
 * `applies-to` scopes; probes in a named scope lead, scope by scope, and
 * inside one scope the FILE ORDER decides. That is what makes CLAUDE.md's
 * "the reviewer's FIRST check is item 3" falsifiable: move the probe later in
 * the file and the resolved head changes. A framing that named probe ids
 * would pin the head wherever the probe sat, which is the hazard class's
 * "ordering expressed as a comment rather than as position" one level up.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { decodeDocument, readOperatorPath } from "./validate.ts";
import { packageRoot } from "./modes.ts";

/** The shipped directory's basename, at the package root. */
export const CHECKLISTS_DIRNAME = "checklists";

/** One probe as the document declares it. */
export interface Probe {
  id: string;
  probe: string;
  appliesTo: string;
  evidenceRequired: boolean;
  verifiesGate?: string;
  /** Where this probe came from, for the collision message. */
  source: string;
}

/** One declared entry point into the same probe list. */
export interface Framing {
  id: string;
  entryPoint: string;
  ordersProbes: string[];
}

export interface Checklist {
  id: string;
  appliesTo: string;
  probes: Probe[];
  framings: Framing[];
  /** The decoded document, for the validator to see unaltered. */
  raw: unknown;
  /** The file this was read from. */
  path: string;
}

type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The shipped `checklists/` directory, found by walking up from this module. */
export function checklistsDirectory(): string {
  return join(packageRoot(), CHECKLISTS_DIRNAME);
}

/** Every checklist id the shipped directory declares, by filename, sorted. */
export function shippedChecklistIds(): string[] {
  return readdirSync(checklistsDirectory())
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => name.slice(0, -".yaml".length))
    .sort();
}

/**
 * Project a decoded checklist document into the shape the resolver uses.
 *
 * FIELDS ABSENT FROM THE DOCUMENT STAY ABSENT rather than becoming defaults,
 * with one exception stated here so it is not a surprise: `evidence-required`
 * is projected as `false` when it is absent, and the CALLER is what refuses
 * such a probe. Defaulting it to `true` would let a probe missing the field
 * merge in as though it carried the stronger obligation, which is R-054's
 * second named failure passing silently.
 */
export function projectChecklist(
  document: unknown,
  path: string,
  source: string,
): Read<Checklist> {
  const record = asRecord(document);
  if (record === undefined) {
    return { ok: false, reason: `${path} is not a mapping` };
  }
  const probes: Probe[] = [];
  const rawProbes = Array.isArray(record["probes"]) ? record["probes"] : [];
  for (const entry of rawProbes) {
    const probe = asRecord(entry);
    if (probe === undefined) {
      continue;
    }
    const projected: Probe = {
      id: String(probe["id"] ?? ""),
      probe: String(probe["probe"] ?? ""),
      appliesTo: String(probe["applies-to"] ?? ""),
      evidenceRequired: probe["evidence-required"] === true,
      source,
    };
    if (typeof probe["verifies-gate"] === "string") {
      projected.verifiesGate = probe["verifies-gate"];
    }
    probes.push(projected);
  }
  const framings: Framing[] = [];
  const rawFramings = Array.isArray(record["framings"]) ? record["framings"] : [];
  for (const entry of rawFramings) {
    const framing = asRecord(entry);
    if (framing === undefined) {
      continue;
    }
    framings.push({
      id: String(framing["id"] ?? ""),
      entryPoint: String(framing["entry-point"] ?? ""),
      ordersProbes: (Array.isArray(framing["orders-probes"])
        ? framing["orders-probes"]
        : []
      ).map((scope) => String(scope)),
    });
  }
  return {
    ok: true,
    value: {
      id: String(record["id"] ?? ""),
      appliesTo: String(record["applies-to"] ?? ""),
      probes,
      framings,
      raw: document,
      path,
    },
  };
}

/**
 * Read a checklist document from an explicit path.
 *
 * The path is OPERATOR-SUPPLIED (D-M3-27), so it is classified before it is
 * opened rather than opened and hoped about: a named pipe at `--extra` is a
 * reported refusal, never a command that blocks forever.
 */
export function readChecklistFile(path: string, source: string): Read<Checklist> {
  const read = readOperatorPath(path);
  if (!read.ok) {
    return { ok: false, reason: read.reason };
  }
  const decoded = decodeDocument(read.body, path);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason };
  }
  return projectChecklist(decoded.value, path, source);
}

/** Read a shipped checklist by id, or say which ids exist. */
export function readShippedChecklist(id: string): Read<Checklist> {
  let directory: string;
  try {
    directory = checklistsDirectory();
  } catch (error) {
    return { ok: false, reason: String(error instanceof Error ? error.message : error) };
  }
  let declared: string[];
  try {
    declared = shippedChecklistIds();
  } catch (error) {
    return { ok: false, reason: String(error instanceof Error ? error.message : error) };
  }
  if (!declared.includes(id)) {
    return {
      ok: false,
      reason: `no checklist ${id} is shipped; the shipped checklists are ${declared.join(", ")}`,
    };
  }
  return readChecklistFile(join(directory, `${id}.yaml`), `checklists/${id}.yaml`);
}

export interface MergeProblem {
  /** The probe id at fault. */
  probe: string;
  reason: string;
}

/**
 * Merge an extra probe file into a canonical checklist.
 *
 * BOTH FAILURES ARE COLLECTED RATHER THAN THROWN AT THE FIRST, so an author
 * fixing an extra file sees every problem in one run instead of one per
 * invocation.
 */
export function mergeExtraProbes(
  canonical: Checklist,
  extra: Checklist,
): { probes: Probe[]; problems: MergeProblem[] } {
  const problems: MergeProblem[] = [];
  const bySourceId = new Map<string, Probe>();
  for (const probe of canonical.probes) {
    bySourceId.set(probe.id, probe);
  }
  const merged = [...canonical.probes];
  for (const probe of extra.probes) {
    const clash = bySourceId.get(probe.id);
    if (clash !== undefined) {
      /* NAMES BOTH SOURCES. A collision message naming only the extra file
         tells an author a probe id is taken and not by what, which is the
         difference between a message and a diagnosis. */
      problems.push({
        probe: probe.id,
        reason: `probe id ${probe.id} is declared in ${clash.source} and again in ${probe.source}`,
      });
      continue;
    }
    if (!probe.evidenceRequired) {
      /* R-054's second failure. Projected as `false` when the field is
         absent, and the two cases are DIFFERENT documents with the same
         merge outcome: an extra probe that omits the field and one that sets
         it false are both refused, because a per-phase probe answerable
         without citing anything is the thing the extension mechanism must
         not be able to add. */
      problems.push({
        probe: probe.id,
        reason: `probe id ${probe.id} in ${probe.source} does not require evidence; every extra probe must set evidence-required: true`,
      });
      continue;
    }
    bySourceId.set(probe.id, probe);
    merged.push(probe);
  }
  return { probes: merged, problems };
}

/**
 * Order probes under a framing.
 *
 * Probes whose `applies-to` scope is named by the framing come first, scope
 * by scope in the framing's order, and inside a scope in FILE ORDER. Every
 * probe in no named scope follows, also in file order. NOTHING IS DROPPED: a
 * framing changes what a reviewer reads first and never what they read at
 * all, because a framing that filtered would let an entry point silently
 * retire a probe.
 */
export function orderUnderFraming(probes: readonly Probe[], framing: Framing): Probe[] {
  const ordered: Probe[] = [];
  const taken = new Set<Probe>();
  for (const scope of framing.ordersProbes) {
    for (const probe of probes) {
      if (probe.appliesTo === scope && !taken.has(probe)) {
        ordered.push(probe);
        taken.add(probe);
      }
    }
  }
  for (const probe of probes) {
    if (!taken.has(probe)) {
      ordered.push(probe);
    }
  }
  return ordered;
}

export interface ResolveRequest {
  checklist: Checklist;
  extra?: Checklist;
  framingId?: string;
}

export interface Resolution {
  probes: Probe[];
  framing?: Framing;
}

export type ResolveOutcome =
  | { ok: true; value: Resolution }
  | { ok: false; reasons: string[] };

/** Merge, then order. The two failures above and an unknown framing are refusals. */
export function resolveChecklist(request: ResolveRequest): ResolveOutcome {
  let probes = request.checklist.probes;
  if (request.extra !== undefined) {
    const merged = mergeExtraProbes(request.checklist, request.extra);
    if (merged.problems.length > 0) {
      return { ok: false, reasons: merged.problems.map((problem) => problem.reason) };
    }
    probes = merged.probes;
  }
  if (request.framingId === undefined) {
    return { ok: true, value: { probes: [...probes] } };
  }
  const framing = request.checklist.framings.find(
    (candidate) => candidate.id === request.framingId,
  );
  if (framing === undefined) {
    const declared = request.checklist.framings.map((candidate) => candidate.id);
    return {
      ok: false,
      reasons: [
        `${request.checklist.path} declares no framing ${request.framingId}; it declares ${declared.length === 0 ? "none" : declared.join(", ")}`,
      ],
    };
  }
  return { ok: true, value: { probes: orderUnderFraming(probes, framing), framing } };
}

/** The resolved list as lines, the framing's entry point at the head. */
export function renderResolution(checklist: Checklist, resolution: Resolution): string[] {
  const lines: string[] = [`checklist ${checklist.id}`];
  if (resolution.framing !== undefined) {
    lines.push(`framing ${resolution.framing.id}`);
    lines.push(`entry-point ${resolution.framing.entryPoint.trim().replace(/\s+/g, " ")}`);
  }
  lines.push(`probes ${String(resolution.probes.length)}`);
  for (let index = 0; index < resolution.probes.length; index += 1) {
    const probe = resolution.probes[index] as Probe;
    lines.push(
      `${String(index + 1)}. ${probe.id} [${probe.appliesTo}]${probe.evidenceRequired ? " evidence-required" : ""}${probe.verifiesGate === undefined ? "" : ` verifies-gate:${probe.verifiesGate}`}`,
    );
    lines.push(`   ${probe.probe.trim().replace(/\s+/g, " ")}`);
  }
  return lines;
}
