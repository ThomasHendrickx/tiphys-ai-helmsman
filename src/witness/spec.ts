import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { classifyEntry, readRegularFileIfPresent } from "../task.ts";
import {
  DIAGNOSTIC_MESSAGES,
  formatDiagnostics,
  loadSchema,
  validate,
} from "../gates/validate.ts";
import type { Diagnostic, SchemaDocument } from "../gates/validate.ts";

/**
 * WITNESS SPECIFICATIONS (kernel plan M2, M2-P2 step 2).
 *
 * One JSON document per behavior at `witness/<behavior-id>.json`, durable
 * and repository-level rather than phase-scoped (M2R-002, M2-D-14). A spec
 * declares which named tests guard a behavior and against WHICH dangerous
 * states they have been demonstrated red. `dangerousStates` is an ARRAY of
 * one or more members by design: rule (g), "one witness is not a class",
 * needs something to require rather than something to bolt on.
 *
 * Kind-specific member fields cannot be expressed in the closed keyword set
 * (no `if`/`then`, no `oneOf`; M2-D-04, DR-0013), so they are enforced here
 * in code, emitting the SAME `INVALID <json-pointer> <message>` diagnostic
 * contract the schema validator emits. This is the pattern the delivered
 * `src/gates/manifest.ts` established; a second diagnostic dialect would be
 * a review finding.
 *
 * M2-C-6: every spec path comes from configuration or from a directory
 * walk, so every read goes through the DELIVERED `classifyEntry` and
 * `readRegularFileIfPresent` in src/task.ts. A named pipe at a spec path is
 * a reported refusal, never a blocked open.
 */

export type WitnessClass = "additive" | "destructive" | "classification";

export const WITNESS_CLASSES: readonly WitnessClass[] = [
  "additive",
  "destructive",
  "classification",
];

export type DangerousStateMember =
  | { kind: "baseline-ref"; ref: string }
  | { kind: "patch"; patch: string }
  | { kind: "mutation"; file: string; find: string; replace: string };

export interface ConsumesExternalOutput {
  program: string;
  captures: string[];
  provenance: string;
}

export interface WitnessSpec {
  id: string;
  behavior: string;
  tests: string[];
  class: WitnessClass;
  dangerousStates: DangerousStateMember[];
  deterministic: boolean;
  /** Red repetitions per member. The plan's default is 5. */
  repeats: number;
  consumesExternalOutput?: ConsumesExternalOutput;
}

export const DEFAULT_REPEATS = 5;

const schemaUrl = new URL("../gates/schemas/witness-spec.schema.json", import.meta.url);

let cachedSchema: SchemaDocument | undefined;

/** The witness-spec schema document, loaded once through the closed-set loader. */
export function witnessSpecSchema(): SchemaDocument {
  if (cachedSchema === undefined) {
    const path = fileURLToPath(schemaUrl);
    const read = readRegularFileIfPresent(path);
    if (read.kind !== "read") {
      throw new Error(
        read.kind === "absent"
          ? `schema document ${path} is missing from this installation`
          : read.reason,
      );
    }
    const parsed = JSON.parse(read.body) as unknown;
    const loaded = loadSchema(parsed, "witness-spec.schema.json");
    if (!loaded.ok) {
      throw new Error(loaded.reason);
    }
    cachedSchema = loaded.schema;
  }
  return cachedSchema;
}

/** Absolute path of the schema document, for self-check style consumers. */
export function witnessSpecSchemaPath(): string {
  return fileURLToPath(schemaUrl);
}

const MEMBER_FIELDS_FOR_KIND: Record<string, string[]> = {
  "baseline-ref": ["ref"],
  patch: ["patch"],
  mutation: ["file", "find", "replace"],
};

const MEMBER_ALL_FIELDS = ["ref", "patch", "file", "find", "replace"];

function memberKindDiagnostics(document: unknown): Diagnostic[] {
  const found: Diagnostic[] = [];
  const members = (document as { dangerousStates?: unknown }).dangerousStates;
  if (!Array.isArray(members)) {
    return found;
  }
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index] as Record<string, unknown> | null;
    if (member === null || typeof member !== "object") {
      continue;
    }
    const kind = member["kind"];
    if (typeof kind !== "string" || MEMBER_FIELDS_FOR_KIND[kind] === undefined) {
      continue;
    }
    const wanted = MEMBER_FIELDS_FOR_KIND[kind];
    for (const field of wanted) {
      if (member[field] === undefined) {
        found.push({
          pointer: `#/dangerousStates/${String(index)}/${field}`,
          message: DIAGNOSTIC_MESSAGES.required(field),
        });
      }
    }
    for (const field of MEMBER_ALL_FIELDS) {
      if (!wanted.includes(field) && member[field] !== undefined) {
        found.push({
          pointer: `#/dangerousStates/${String(index)}/${field}`,
          message: DIAGNOSTIC_MESSAGES.additionalProperties(field),
        });
      }
    }
  }
  return found;
}

/**
 * Validate an already-parsed witness spec. Returns `INVALID <pointer>
 * <message>` lines in the contract's deterministic order.
 */
export function validateWitnessSpecDocument(document: unknown): string[] {
  const diagnostics = [
    ...validate(witnessSpecSchema(), document),
    ...memberKindDiagnostics(document),
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

export type WitnessSpecLoad =
  | { ok: true; spec: WitnessSpec; sha256: string; body: string }
  | { ok: false; reason: string; diagnostics: string[] };

/**
 * Validate and materialise one spec from its BODY, with `label` naming the
 * source in any reason. Split out of `loadWitnessSpec` so a spec can also be
 * materialised from a git object (`git show <ref>:<path>`) rather than only
 * from a working-tree path: the per-member ownership derivation below needs
 * the merge-base version of a spec, which has no path.
 */
export function parseWitnessSpec(body: string, label: string): WitnessSpecLoad {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      reason: `witness spec ${label} does not parse as JSON: ${(error as Error).message}`,
      diagnostics: [],
    };
  }
  const diagnostics = validateWitnessSpecDocument(parsed);
  if (diagnostics.length > 0) {
    return {
      ok: false,
      reason: `witness spec ${label} is not a valid witness spec`,
      diagnostics,
    };
  }
  const raw = parsed as Record<string, unknown>;
  const spec: WitnessSpec = {
    id: raw["id"] as string,
    behavior: raw["behavior"] as string,
    tests: [...(raw["tests"] as string[])],
    class: raw["class"] as WitnessClass,
    dangerousStates: (raw["dangerousStates"] as DangerousStateMember[]).map(
      (member) => ({ ...member }),
    ),
    deterministic: raw["deterministic"] as boolean,
    repeats:
      raw["repeats"] === undefined ? DEFAULT_REPEATS : (raw["repeats"] as number),
  };
  if (raw["consumesExternalOutput"] !== undefined) {
    const consumes = raw["consumesExternalOutput"] as ConsumesExternalOutput;
    spec.consumesExternalOutput = {
      program: consumes.program,
      captures: [...consumes.captures],
      provenance: consumes.provenance,
    };
  }
  return {
    ok: true,
    spec,
    sha256: createHash("sha256").update(body).digest("hex"),
    body,
  };
}

/** Load and validate one spec from a path the caller supplied (M2-C-6). */
export function loadWitnessSpec(path: string): WitnessSpecLoad {
  const read = readRegularFileIfPresent(path);
  if (read.kind === "absent") {
    return {
      ok: false,
      reason: `witness spec ${path} does not exist`,
      diagnostics: [],
    };
  }
  if (read.kind === "refused") {
    return { ok: false, reason: read.reason, diagnostics: [] };
  }
  return parseWitnessSpec(read.body, path);
}

/**
 * Canonical form of one dangerous-state member: the fields its kind declares,
 * in a fixed order, JSON-encoded. Two members are the SAME member when their
 * canonical forms are equal. Field order in the source document is therefore
 * not significant, which matters because a reformatting of a spec file must
 * not be readable as authorship of its members.
 */
export function canonicalMember(member: DangerousStateMember): string {
  if (member.kind === "baseline-ref") {
    return JSON.stringify(["baseline-ref", member.ref]);
  }
  if (member.kind === "patch") {
    return JSON.stringify(["patch", member.patch]);
  }
  return JSON.stringify(["mutation", member.file, member.find, member.replace]);
}

/**
 * WHICH MEMBERS OF A SPEC THIS PHASE AUTHORED (the ownership scope of rule
 * (d)).
 *
 * Rule (d) requires a declared dangerous state to intersect the phase diff, so
 * that a phase cannot add a witness about unrelated code and claim coverage.
 * That obligation is a claim about AUTHORSHIP, and authorship is per MEMBER.
 * Deriving it from the spec FILE appearing in the diff is one granularity too
 * coarse: it makes every sibling member of an edited file acquire an
 * obligation its author never took on. Measured by the M3 exit test at stage
 * E1.6, where repairing one member's quoted source line reddened two untouched
 * members of the same file.
 *
 * A member is OWNED when no structurally identical member exists in the
 * spec as of the merge base. Matching is a MULTISET consume, not a set
 * membership test, so adding a second copy of an existing member is owned
 * (rule (g) is what refuses that copy, and it must still see it as new).
 *
 * `baselineMembers` is `undefined` when the spec did not exist at the merge
 * base, did not parse there, or could not be read there. All three mean the
 * phase is answerable for the whole file, so every member is owned. That is
 * the conservative direction: the failure mode of this derivation is a member
 * wrongly EXEMPTED, so an unreadable baseline keeps the obligation rather than
 * dropping it.
 */
export function phaseOwnedMemberIndices(
  headMembers: readonly DangerousStateMember[],
  baselineMembers: readonly DangerousStateMember[] | undefined,
): Set<number> {
  const owned = new Set<number>();
  if (baselineMembers === undefined) {
    for (let index = 0; index < headMembers.length; index += 1) {
      owned.add(index);
    }
    return owned;
  }
  const remaining = new Map<string, number>();
  for (const member of baselineMembers) {
    const key = canonicalMember(member);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (let index = 0; index < headMembers.length; index += 1) {
    const key = canonicalMember(headMembers[index] as DangerousStateMember);
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      continue;
    }
    owned.add(index);
  }
  return owned;
}

export type WitnessSpecListing =
  | { ok: true; paths: string[] }
  | { ok: false; reason: string };

/**
 * The spec files of a witness directory: the `.json` entries directly inside
 * it, sorted by name. Deliberately NOT recursive: the layout is one document
 * per behavior at `witness/<behavior-id>.json` (M2-D-14), and capture files
 * live in subdirectories that a recursive walk would misread as specs.
 *
 * An absent directory is an empty corpus, not an error: whether that is
 * acceptable is the GATE's coverage decision, not a listing failure.
 */
export function listWitnessSpecFiles(dir: string): WitnessSpecListing {
  const entry = classifyEntry(dir);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: true, paths: [] };
  }
  if (entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (entry.kind === "regular") {
      return {
        ok: false,
        reason: `${dir} is a regular file, not a witness directory`,
      };
    }
    return {
      ok: false,
      reason: `witness directory ${dir} could not be listed: ${String(error)}`,
    };
  }
  const paths: string[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const path = join(dir, name);
    const kind = classifyEntry(path);
    if (kind.kind === "regular") {
      paths.push(path);
      continue;
    }
    if (kind.kind === "irregular" || kind.kind === "unexaminable") {
      return { ok: false, reason: kind.reason };
    }
  }
  return { ok: true, paths };
}

/**
 * The repository-relative files a member's dangerous state touches.
 * mutation: the named file. patch: the paths in the patch's own headers,
 * parsed from `diff --git a/<x> b/<y>` lines with `+++`/`---` fallbacks.
 * baseline-ref: none; an absent-feature baseline is not a file-level
 * dangerous state (work-history decision D-P2-2).
 */
export function memberTouchedFiles(
  member: DangerousStateMember,
  readPatchBody: (patchPath: string) => string | undefined,
): string[] {
  if (member.kind === "mutation") {
    return [member.file];
  }
  if (member.kind === "baseline-ref") {
    return [];
  }
  const body = readPatchBody(member.patch);
  if (body === undefined) {
    return [];
  }
  const files = new Set<string>();
  for (const line of body.split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header !== null) {
      files.add(header[1] as string);
      files.add(header[2] as string);
      continue;
    }
    const plus = /^\+\+\+ b\/(.+)$/.exec(line);
    if (plus !== null) {
      files.add(plus[1] as string);
      continue;
    }
    const minus = /^--- a\/(.+)$/.exec(line);
    if (minus !== null) {
      files.add(minus[1] as string);
    }
  }
  return [...files].sort();
}

/** One-line description of a member, used in reasons and records. */
export function describeMember(member: DangerousStateMember): string {
  if (member.kind === "baseline-ref") {
    return `baseline-ref ${member.ref}`;
  }
  if (member.kind === "patch") {
    return `patch ${member.patch}`;
  }
  return `mutation of ${member.file}`;
}
