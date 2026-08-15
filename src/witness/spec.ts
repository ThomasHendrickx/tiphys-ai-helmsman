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
 * How a patch member's BODY is read, one reader per revision. A patch member's
 * `patch` field is a PATH; the dangerous state it declares lives in the file at
 * that path, so establishing whether the member changed needs the body on BOTH
 * sides, at the merge base and at the audited head.
 */
export interface PatchBodyReaders {
  head: (patchPath: string) => string | undefined;
  baseline: (patchPath: string) => string | undefined;
}

/**
 * CANONICAL FORM OF ONE DANGEROUS-STATE MEMBER: everything that determines the
 * dangerous state, in a fixed order, JSON-encoded. Two members are the SAME
 * member when their canonical forms are equal. Field order inside the source
 * document is not significant, so reformatting a spec is not authorship.
 *
 * PER KIND, and the three kinds are NOT alike, which is the correction fix
 * round 1 makes:
 *
 * - `mutation` declares `file`, `find` and `replace`, and all three are INLINE
 *   in the spec document. The canonical form carries all three, so it is
 *   complete: nothing outside the document can change what this member does.
 * - `patch` declares one field, `patch`, and it is a POINTER. The dangerous
 *   state is the patch FILE'S BODY, which lives outside the spec document
 *   entirely. Keying on the path alone made a member whose body was rewritten
 *   top to bottom compare EQUAL to its own previous version, so a phase could
 *   turn a dangerous state about file X into one about an unrelated file Y and
 *   be judged not to have authored it. The body's sha256 is therefore part of
 *   the canonical form. An unreadable body yields `undefined`, which the caller
 *   treats as "cannot be established", never as "unchanged".
 * - `baseline-ref` declares `ref`, which is ALSO a pointer: the dangerous state
 *   is the whole tree at that ref, and a ref moves. It is deliberately NOT
 *   resolved, for two reasons stated rather than assumed. First, rule (d)
 *   SKIPS `baseline-ref` members outright (src/witness/run.ts:1295), so a
 *   baseline-ref member's ownership has no consequence anywhere: ownership is
 *   read in exactly one place and that place skips this kind. Second, resolving
 *   the ref would attribute a ref moved by SOMEBODY ELSE to this phase, which
 *   is the opposite of what an authorship derivation should say. If rule (d)
 *   ever stops skipping this kind, this decision has to be revisited, and the
 *   fix would be the patch one: fold the resolved tree, not the ref name.
 */
export function canonicalMember(
  member: DangerousStateMember,
  readPatchBody: (patchPath: string) => string | undefined,
): string | undefined {
  if (member.kind === "baseline-ref") {
    return JSON.stringify(["baseline-ref", member.ref]);
  }
  if (member.kind === "mutation") {
    return JSON.stringify(["mutation", member.file, member.find, member.replace]);
  }
  const body = readPatchBody(member.patch);
  if (body === undefined) {
    return undefined;
  }
  return JSON.stringify([
    "patch",
    member.patch,
    createHash("sha256").update(body).digest("hex"),
  ]);
}

/**
 * HAS THE SPEC BEEN RE-POINTED, as opposed to strengthened?
 *
 * A witness spec says "these named TESTS guard this BEHAVIOR, and here are the
 * dangerous states they have been shown red against". Rule (d) is an obligation
 * on that sentence, not only on its members: it exists so a phase cannot claim
 * coverage using a dangerous state about code it did not touch. So a phase that
 * rewrites the sentence takes the obligation for every state offered under it.
 *
 * THE TEST IS DIRECTIONAL, NOT EQUALITY, AND THAT DISTINCTION IS THE WHOLE
 * FUNCTION. Fix round 1 compared `[behavior, sortedTests]` for equality, which
 * is wrong in the safe direction and was caught by delta verification: a phase
 * that ADDS one guarding test to an existing spec, changing no member and no
 * behavior, was told its untouched siblings had to intersect the diff. Adding a
 * test is not a re-point. It is strictly strengthening, and that is a MEASURED
 * property of the harness rather than a judgement:
 *
 *   - RED arm, src/witness/run.ts:918: `red: exitCode !== 0 && failed.length
 *     === tests.length`. A repetition counts as red only when EVERY named test
 *     failed, so an added test must ALSO redden against every declared
 *     dangerous state or the member stops being red and the spec goes red.
 *   - GREEN arm, src/witness/run.ts:1676: `headGreen = exitCode === 0 &&
 *     passedNamedTests.length === spec.tests.length`. An added test must ALSO
 *     pass at head.
 *
 * Both arms gain an obligation, neither loses one, and both are demonstrated by
 * EXECUTION rather than accepted on trust. So there is nothing for rule (d) to
 * police in an extension: no new dangerous state is declared, and the existing
 * states' burden only grows.
 *
 * WHAT STILL COUNTS AS RE-POINTING, and each is a real relaxation:
 *
 * - `behavior` changed. The sentence is now about something else, and an older
 *   phase's dangerous state becomes evidence for a behavior this phase
 *   introduced. Any change, in either direction.
 * - A baseline test name DROPPED. That relaxes both arms above: one fewer test
 *   must redden against every member and one fewer must pass at head. A phase
 *   can drop the test that was doing the work and keep the coverage claim.
 * - A test name SWAPPED, which is a drop plus an addition and is caught by the
 *   drop half.
 *
 * So the predicate is `behavior` equality AND `baselineTests` being a SUBSET of
 * `headTests`. Reordering is not a change: the comparison is over sets, which
 * is the same positional indifference the member matching gets from comparing
 * canonical forms rather than indices. Duplicates in `tests` collapse under set
 * semantics, and that is harmless because both arms above count `tests`
 * positionally on the same array, so a duplicate adds an obligation to each
 * side identically.
 *
 * WHY MEMBERS ARE NOT TREATED THE SAME WAY, since adding a member also only
 * ADDS an obligation (every member must independently redden). Because a member
 * IS the thing rule (d) is an obligation on, and a test is not. An added member
 * is a newly declared dangerous state, and checking that a declared dangerous
 * state relates to the phase's own diff is the entire purpose of the rule; make
 * added members exempt and rule (d) is empty. An added test declares no
 * dangerous state at all.
 *
 * WHICH FIELDS ARE CONSIDERED, AND WHY THE OTHERS ARE NOT. The test applied to
 * every field of the closed schema was: does changing THIS FIELD ALONE let a
 * phase assert something new about its own diff while reusing a dangerous state
 * somebody else authored?
 *
 * - `behavior`, `tests`: YES, in the directional sense above. IN.
 * - `class`: NO. It selects which refusal rules apply (rules (a), (e), (g)) and
 *   none of them is ownership-gated, so a class change is evaluated in full on
 *   every run whether the spec is owned or not. A weakened class is refused by
 *   rule (e), which DERIVES the class from the named tests' sources rather than
 *   trusting the declaration. OUT, and including it would buy false reds on
 *   class fix-ups while closing no attack.
 * - `id`: NO. It is the handle, checked for collisions at
 *   src/gates/red-witness.ts:263. Renaming a spec asserts nothing new. OUT.
 * - `deterministic`, `repeats`: NO. They set the red THRESHOLD in the member
 *   execution loop (src/witness/run.ts:1517 and src/witness/run.ts:1605), which
 *   runs for every member of every evaluated spec regardless of ownership. OUT.
 * - `consumesExternalOutput`: NO. Rules (c) and (f) read it and neither is
 *   ownership-gated. OUT.
 */
export function claimRePointed(
  headSpec: WitnessSpec,
  baselineSpec: WitnessSpec,
): boolean {
  if (headSpec.behavior !== baselineSpec.behavior) {
    return true;
  }
  const headTests = new Set(headSpec.tests);
  return baselineSpec.tests.some((name) => !headTests.has(name));
}

/**
 * WHICH MEMBERS OF A SPEC THIS PHASE AUTHORED (the ownership scope of rule
 * (d)).
 *
 * Rule (d) requires a declared dangerous state to intersect the phase diff, so
 * that a phase cannot add a witness about unrelated code and claim coverage.
 * That obligation is a claim about AUTHORSHIP, and authorship is per MEMBER.
 * Deriving it from the spec FILE appearing in the diff is one granularity too
 * coarse: it makes every sibling member of an edited file acquire an obligation
 * its author never took on. Measured by the M3 exit test at stage E1.6, where
 * repairing one member's quoted source line reddened two untouched members of
 * the same file.
 *
 * THREE WAYS A PHASE AUTHORS, and the round-1 reviews found that only the first
 * was implemented:
 *
 * 1. A member whose CANONICAL FORM changed, which now includes a patch body.
 * 2. A member with no counterpart at the merge base. Matching is a MULTISET
 *    consume rather than a set membership test, so a second copy of an existing
 *    member is authored (rule (g) is what refuses that copy, and it must still
 *    see it as new).
 * 3. THE CLAIM WAS RE-POINTED. Then every member is authored, because every
 *    declared dangerous state is now being offered as evidence for a sentence
 *    this phase wrote. There is no narrower attribution available: a claim
 *    change cannot be pinned on one member, since the claim is a property of
 *    the document. This is the ONLY whole-spec trigger, and keeping it that
 *    narrow is the point. An edit to a sibling member, a `repeats` bump, a
 *    reformat, a rename, and ADDING A GUARDING TEST all still author nothing,
 *    which is what the converse tests hold. `claimRePointed` carries the
 *    derivation of why extension is safe and dropping a test is not.
 *
 * `baselineSpec` is `undefined` when the spec did not exist at the merge base,
 * did not parse there, or could not be read there. All three mean the phase is
 * answerable for the whole file, so every member is owned. That is the
 * conservative direction, and it is applied identically to an unreadable patch
 * BODY on either side: the failure mode of this derivation is a member wrongly
 * EXEMPTED, so anything the derivation cannot establish keeps the obligation
 * rather than dropping it.
 */
export function phaseOwnedMemberIndices(
  headSpec: WitnessSpec,
  baselineSpec: WitnessSpec | undefined,
  readers: PatchBodyReaders,
): Set<number> {
  const owned = new Set<number>();
  const ownEveryMember = (): Set<number> => {
    for (let index = 0; index < headSpec.dangerousStates.length; index += 1) {
      owned.add(index);
    }
    return owned;
  };
  if (baselineSpec === undefined) {
    return ownEveryMember();
  }
  if (claimRePointed(headSpec, baselineSpec)) {
    return ownEveryMember();
  }
  const remaining = new Map<string, number>();
  for (const member of baselineSpec.dangerousStates) {
    const key = canonicalMember(member, readers.baseline);
    if (key === undefined) {
      // A baseline member whose patch body cannot be read is not established,
      // so it matches nothing and cannot exempt a head member.
      continue;
    }
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  for (let index = 0; index < headSpec.dangerousStates.length; index += 1) {
    const key = canonicalMember(
      headSpec.dangerousStates[index] as DangerousStateMember,
      readers.head,
    );
    if (key === undefined) {
      // Same rule on the head side: a member whose body cannot be read is
      // owned, never assumed unchanged.
      owned.add(index);
      continue;
    }
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
