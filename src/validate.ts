/**
 * THE KERNEL'S SCHEMA VALIDATION ENGINE (kernel plan M3, M3-P1 step 8;
 * DR-0013).
 *
 * DR-0013 decided this module's substance and it is not a set of defaults to
 * be revisited casually. Ajv 8.20.0 exact, JSON Schema Draft 2020-12, strict
 * mode, all errors, schema and meta-schema validation, and NO coercion, NO
 * inserted defaults, NO removal of additional properties, NO mutation of the
 * validated input and NO automatic loading of remote schemas. Unknown or
 * invalidly combined keywords fail schema COMPILATION, before any instance is
 * examined.
 *
 * AJV IS AN INTERNAL IMPLEMENTATION DETAIL (DR-0013 clause 5). Its wording is
 * never a public contract. Every Ajv error is mapped, by keyword, into the
 * Tiphys diagnostic contract
 *
 *   INVALID <json-pointer> <message>
 *
 * with a deterministic order. The order is a FINAL SORT by (pointer, message)
 * applied to the collected list, not a property of the traversal, so a future
 * engine that walks differently still emits the same lines in the same order.
 * That is the same rule src/gates/validate.ts stated for M2 and it is
 * deliberately identical: the two modules now share this one engine.
 *
 * THE MESSAGE TABLE IS THE CONTRACT, not Ajv's `message` field. A keyword
 * whose Ajv error reaches `renderAjvError` without an entry in
 * `MESSAGE_BY_KEYWORD` is a Tiphys DEFECT and is reported as one, naming the
 * keyword, rather than being papered over with Ajv's own sentence. That
 * refusal is what stops Ajv wording leaking into a public contract by
 * omission (DR-0013 criterion 8).
 *
 * YAML IS INPUT DECODING AND IS A SEPARATE STAGE (DR-0013 YAML clause 3).
 * `decodeDocument` decodes; `validateInstance` validates an already-decoded
 * value. A decode failure and a validation failure are distinguishable in the
 * diagnostic and neither produces a stack trace on any stream.
 *
 * PATHS THIS MODULE READS ARE NOT ITS OWN (D-M3-27, MECHANISMS.md row
 * "reading a path whose type is not established"). Every read goes through
 * `classifyEntry`, so a named pipe handed to `tiphys validate` is refused
 * with the observed entry type instead of blocking the command forever.
 */

import { readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { createRequire } from "node:module";
import type { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import type { parse as parseYamlType, YAMLParseError as YAMLParseErrorType } from "yaml";
import { classifyEntry } from "./task.ts";

/**
 * THE TWO PRODUCTION DEPENDENCIES ARE LOADED LAZILY, AND THIS IS NOT A
 * MICRO-OPTIMISATION. Measured 2026-08-08 while retiring the M2 engine.
 *
 * Three delivered M2 tests COPY the kernel's own tree to a scratch location
 * OUTSIDE the repository and run it there: `stagedDist` in
 * `test/gates.test.ts` copies `dist/`, and `copyInstallation` in
 * `test/scope-gate.test.ts` copies `src/`. Node resolves a bare specifier by
 * walking `node_modules` UPWARD from the importing file, and a copy under
 * `/tmp` has no `node_modules` above it. A top-level `import ... from "ajv"`
 * in this module therefore made three previously-passing M2 tests fail with
 * `ERR_MODULE_NOT_FOUND` at module load, exit code 1, before any of the
 * conditions those tests exist to exercise could happen. Captured in the
 * work history.
 *
 * Those tests are re-run UNCHANGED under DR-0013 clause 6 and may not be
 * edited, so the module must not need `ajv` resolvable merely to be
 * IMPORTED. `createRequire` defers the resolution to the first schema
 * compilation, which a copied-out gate that fails earlier never reaches, and
 * an unresolvable dependency then becomes a compile diagnostic rather than an
 * uncaught crash read as a verdict (the CR-1047 property, one level up).
 */
const requireDependency = createRequire(import.meta.url);

interface AjvModule {
  Ajv2020: new (options: Record<string, unknown>) => Ajv2020;
}

interface YamlModule {
  parse: typeof parseYamlType;
  YAMLParseError: typeof YAMLParseErrorType;
}

function ajvModule(): AjvModule {
  return requireDependency("ajv/dist/2020.js") as AjvModule;
}

function yamlModule(): YamlModule {
  return requireDependency("yaml") as YamlModule;
}

/** The dialect every Tiphys schema declares (DR-0013 clause 3). */
export const TIPHYS_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/** The document root, in RFC 6901 URI-fragment form. */
export const ROOT_POINTER = "#";

export interface Diagnostic {
  pointer: string;
  message: string;
}

/**
 * THE DECLARED AUTHORING VOCABULARY (DR-0013 clause 7), documented in
 * `schemas/README.md` and asserted by `test/schemas.test.ts`. Ajv supplies
 * Draft 2020-12 entire; this list is what Tiphys schemas are ALLOWED to use,
 * so a keyword outside it is a deliberate expansion rather than an accident.
 * Every entry has both a positive and a negative test (validator criterion 2)
 * and therefore also has an entry in `MESSAGE_BY_KEYWORD`.
 */
export const AUTHORING_VOCABULARY: readonly string[] = [
  "$ref",
  "additionalProperties",
  "const",
  "contains",
  "enum",
  "if",
  "items",
  "minItems",
  "minLength",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "then",
  "type",
  "uniqueItems",
];

/** Annotations that carry no constraint and are permitted everywhere. */
export const ANNOTATION_KEYS: readonly string[] = [
  "$comment",
  "$defs",
  "$id",
  "$schema",
  "description",
  "title",
];

/** Render a value the way every diagnostic in this contract renders one. */
export function render(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** The JSON type name of a value, as the `type` keyword uses it. */
export function jsonTypeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const primitive = typeof value;
  if (primitive === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (primitive === "boolean") {
    return "boolean";
  }
  if (primitive === "string") {
    return "string";
  }
  return "object";
}

/**
 * THE MESSAGE CONTRACT. One entry per way a value can fail. The first eight
 * entries are M2's, copied verbatim from `src/gates/validate.ts`'s
 * `DIAGNOSTIC_MESSAGES` because DR-0013 clause 6 retires that ENGINE while
 * preserving its diagnostic contract: an M2 test asserting
 * `required property id is missing` must still read exactly that after the
 * swap, and that is checked by re-running M2's tests unchanged rather than by
 * this comment.
 */
export const DIAGNOSTIC_MESSAGES = {
  type: (expected: string, observed: string): string =>
    `expected type ${expected} but found ${observed}`,
  required: (name: string): string => `required property ${name} is missing`,
  additionalProperties: (name: string): string =>
    `property ${name} is not permitted here`,
  enum: (value: string, permitted: string): string =>
    `value ${value} is not one of the permitted values ${permitted}`,
  const: (value: string, required: string): string =>
    `value ${value} does not equal the required constant ${required}`,
  minimum: (value: string, minimum: string): string =>
    `value ${value} is below the minimum ${minimum}`,
  minItems: (count: string, minimum: string): string =>
    `array has ${count} items, fewer than the required minimum ${minimum}`,
  pattern: (value: string, pattern: string): string =>
    `value ${value} does not match the required pattern ${pattern}`,
  /* M3's additions to the vocabulary, Tiphys-owned wording throughout. */
  minLength: (value: string, minimum: string): string =>
    `value ${value} is shorter than the required minimum length ${minimum}`,
  uniqueItems: (first: string, second: string): string =>
    `array items ${first} and ${second} are duplicates and must be unique`,
  contains: (minimum: string): string =>
    `array contains no item matching the required shape, and ${minimum} is required`,
  /* CR-004 (M3-P3 fix round 1). The generic `contains` line above names the
     FIELD and not the required value, so an author reading it is told an array
     is missing something and not WHAT. When the `contains` subschema is a bare
     `const`, the value is knowable and is named. The generic form stays for
     every other shape, because a subschema with `properties` and `required`
     has no single value to quote and inventing a rendering of it would be
     worse than saying "the required shape". */
  containsValue: (value: string, minimum: string): string =>
    `array contains no item equal to ${value}, and ${minimum} is required`,
  oneOf: (): string => "value matches no permitted alternative here",
  ifThen: (): string =>
    "value does not satisfy the requirements its own shape triggers here",
  maximum: (value: string, maximum: string): string =>
    `value ${value} is above the maximum ${maximum}`,
  maxItems: (count: string, maximum: string): string =>
    `array has ${count} items, more than the permitted maximum ${maximum}`,
  cyclicRef: (reference: string): string =>
    `schema reference ${reference} is cyclic`,
  unresolvedRef: (reference: string): string =>
    `schema reference ${reference} does not resolve`,
  /* ------------------------------------------------------------------ */
  /* COMPILATION FAILURES ARE PART OF THE CONTRACT TOO (fix round 1,      */
  /* B-002). Criteria 4, 5 and 7 all fail at COMPILATION rather than at   */
  /* validation, and the first version of this module printed the raw     */
  /* exception text on that path, so Ajv's wording reached a public       */
  /* stream on the arm nobody had asserted about. That is T-009's shape   */
  /* one layer down: one witnessed arm, one unwitnessed arm, and the      */
  /* unwitnessed one is the one that broke. Every entry below carries     */
  /* only an IDENTIFIER lifted out of the Ajv error (a keyword name, a    */
  /* reference, a location), never an Ajv sentence.                      */
  /* ------------------------------------------------------------------ */
  unknownKeyword: (keyword: string): string =>
    `schema keyword ${keyword} is not in this validator's vocabulary`,
  strictPolicyUntyped: (keyword: string, expected: string): string =>
    `schema uses keyword ${keyword} without declaring type ${expected}, which this validator's strict policy requires`,
  strictPolicy: (): string =>
    "schema is refused by this validator's strict policy",
  remoteRef: (reference: string): string =>
    `schema reference ${reference} is remote, and this validator never loads remote schemas`,
  invalidSchemaDocument: (): string =>
    "schema is not a valid JSON Schema document",
  patternUncompilable: (): string =>
    "schema contains a pattern that is not a valid regular expression",
  cyclicCompilation: (): string =>
    "schema references form a cycle this validator cannot compile",
  /** Nothing above matched. Deliberately carries no Ajv text at all. */
  uncompilable: (): string => "schema could not be compiled",
  /** A keyword Ajv reported that this table does not translate. */
  untranslated: (keyword: string): string =>
    `internal defect: no Tiphys diagnostic is defined for schema keyword ${keyword}`,
};

/**
 * `INVALID <json-pointer> <message>`. The public contract, shared with
 * `src/gates/validate.ts`.
 *
 * Pointers are RFC 6901 JSON Pointers in URI-fragment form, so the document
 * root is `#` and a nested location is `#/gates/0/id`. The fragment form is
 * chosen because the bare pointer to the root is the EMPTY STRING, which
 * would render this line with two consecutive spaces.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return `INVALID ${diagnostic.pointer} ${diagnostic.message}`;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map(formatDiagnostic);
}

/** The contract's deterministic order: by pointer, then by message, ASCII. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const sorted = [...diagnostics];
  sorted.sort((a, b) => {
    if (a.pointer !== b.pointer) {
      return a.pointer < b.pointer ? -1 : 1;
    }
    if (a.message === b.message) {
      return 0;
    }
    return a.message < b.message ? -1 : 1;
  });
  return sorted;
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Ajv's `instancePath` is a bare pointer; the contract's is fragment form. */
function toFragmentPointer(instancePath: string, extra?: string): string {
  const base = instancePath === "" ? ROOT_POINTER : `${ROOT_POINTER}${instancePath}`;
  return extra === undefined ? base : `${base}/${escapeSegment(extra)}`;
}

/** Resolve an Ajv `instancePath` against the instance, for reporting values. */
function valueAt(instance: unknown, instancePath: string): unknown {
  if (instancePath === "") {
    return instance;
  }
  let node: unknown = instance;
  for (const raw of instancePath.slice(1).split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(node)) {
      node = node[Number(segment)];
      continue;
    }
    if (typeof node === "object" && node !== null) {
      node = Object.prototype.hasOwnProperty.call(node, segment)
        ? (node as Record<string, unknown>)[segment]
        : undefined;
      continue;
    }
    return undefined;
  }
  return node;
}

/**
 * Ajv keywords this engine translates. A keyword absent from this map is a
 * defect and says so: see the module header. The map's KEY SET is also the
 * mechanical half of "every keyword in the declared vocabulary has a
 * diagnostic", asserted in `test/schemas.test.ts`.
 */
const MESSAGE_BY_KEYWORD = new Set<string>([
  "type",
  "required",
  "additionalProperties",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "minLength",
  "pattern",
  "uniqueItems",
  "contains",
  "oneOf",
  "if",
]);

/**
 * Translate ONE Ajv error into the Tiphys contract. `undefined` means the
 * error carries no independent information for a reader (Ajv reports a
 * failing branch of `oneOf`/`if` as well as the composite), and the caller
 * drops it.
 */
function renderAjvError(
  error: ErrorObject,
  instance: unknown,
  /**
   * `contains` subschema path -> the `const` that subschema requires, for the
   * errors where it is a bare `const`. Built by the caller from the SUBSIDIARY
   * errors Ajv reports beside the composite, which `isSubsidiary` then drops:
   * the value is already in the error stream and was being thrown away.
   */
  containsConst: ReadonlyMap<string, unknown> = new Map(),
): Diagnostic | undefined {
  const params = error.params as Record<string, unknown>;
  const at = error.instancePath;
  switch (error.keyword) {
    case "type":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.type(
          String(params["type"]),
          jsonTypeOf(valueAt(instance, at)),
        ),
      };
    case "required":
      return {
        pointer: toFragmentPointer(at, String(params["missingProperty"])),
        message: DIAGNOSTIC_MESSAGES.required(String(params["missingProperty"])),
      };
    case "additionalProperties":
      return {
        pointer: toFragmentPointer(at, String(params["additionalProperty"])),
        message: DIAGNOSTIC_MESSAGES.additionalProperties(
          String(params["additionalProperty"]),
        ),
      };
    case "enum":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.enum(
          render(valueAt(instance, at)),
          (params["allowedValues"] as unknown[]).map((v) => render(v)).join(", "),
        ),
      };
    case "const":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.const(
          render(valueAt(instance, at)),
          render(params["allowedValue"]),
        ),
      };
    case "minimum":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.minimum(
          render(valueAt(instance, at)),
          render(params["limit"]),
        ),
      };
    case "maximum":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.maximum(
          render(valueAt(instance, at)),
          render(params["limit"]),
        ),
      };
    case "minItems": {
      const value = valueAt(instance, at);
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.minItems(
          String(Array.isArray(value) ? value.length : 0),
          String(params["limit"]),
        ),
      };
    }
    case "maxItems": {
      const value = valueAt(instance, at);
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.maxItems(
          String(Array.isArray(value) ? value.length : 0),
          String(params["limit"]),
        ),
      };
    }
    case "minLength":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.minLength(
          render(valueAt(instance, at)),
          String(params["limit"]),
        ),
      };
    case "pattern":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.pattern(
          render(valueAt(instance, at)),
          String(params["pattern"]),
        ),
      };
    case "uniqueItems":
      return {
        pointer: toFragmentPointer(at),
        /* Ajv reports the LATER index first. The contract sorts them, so
           the line reads in document order and does not depend on which
           direction the engine happened to compare in. */
        message: DIAGNOSTIC_MESSAGES.uniqueItems(
          String(Math.min(Number(params["i"]), Number(params["j"]))),
          String(Math.max(Number(params["i"]), Number(params["j"]))),
        ),
      };
    case "contains": {
      const minimum = String(params["minContains"] ?? 1);
      const required = containsConst.get(error.schemaPath);
      return {
        pointer: toFragmentPointer(at),
        message:
          required === undefined
            ? DIAGNOSTIC_MESSAGES.contains(minimum)
            : DIAGNOSTIC_MESSAGES.containsValue(render(required), minimum),
      };
    }
    case "oneOf":
    /* `anyOf`, `allOf` and `not` are not in the AUTHORING vocabulary, so no
       Tiphys schema uses them. They still reach this renderer, because
       META-SCHEMA validation runs the 2020-12 meta-schema (which uses all
       three) over a Tiphys schema document. Mapping them here is what stopped
       `internal defect: no Tiphys diagnostic is defined for schema keyword
       anyOf` from being the diagnostic a bad `type` produced, which is how
       the untranslated-keyword guard earned its keep. */
    case "anyOf":
    case "allOf":
    case "not":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.oneOf(),
      };
    case "if":
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.ifThen(),
      };
    default:
      return {
        pointer: toFragmentPointer(at),
        message: DIAGNOSTIC_MESSAGES.untranslated(error.keyword),
      };
  }
}

/**
 * Is this Ajv error a SUBSIDIARY of a composite the caller already reports?
 *
 * Ajv with allErrors reports the failing branches inside
 * `oneOf`/`anyOf`/`not`/`contains` as well as the composite keyword itself.
 * Which branch is reported, and how many, depends on Ajv's branch ordering and
 * on the instance's length, which is exactly the nondeterminism the contract
 * forbids, so only the COMPOSITE line survives: its pointer is the instance
 * location the author must look at. `contains` is in this list for the second
 * reason rather than the first: a ten-item array that contains nothing
 * matching would otherwise emit eleven lines for one fault.
 *
 * `if`/`then`/`else` is DELIBERATELY NOT in that list. Exactly one branch
 * applies and which one is decided by the instance, not by the engine, so the
 * branch's own diagnostics are deterministic AND are the informative ones: a
 * charter with `mode: none` and no `reason` must say `reason`, which only the
 * `then` branch's `required` error carries (criterion 5b).
 */
function isSubsidiary(error: ErrorObject): boolean {
  return /\/(oneOf|anyOf|not|contains)\//.test(error.schemaPath);
}

export type SchemaDocument = Record<string, unknown>;

/**
 * A fresh Ajv, configured EXACTLY as DR-0013 clause 4 lists. Each policy is
 * named so a diff that removes one is visible as the removal of a decided
 * policy rather than as a formatting change.
 */
export function makeAjv(): Ajv2020 {
  const { Ajv2020: Constructor } = ajvModule();
  return new Constructor({
    strict: true,
    allErrors: true,
    validateSchema: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    /* No `loadSchema`: an unresolved remote reference fails compilation
       rather than being fetched (DR-0013 clause 4, criterion 7). */
  });
}

/** A compiled validator, or the reason the schema could not be compiled. */
export type Compilation =
  | { ok: true; validator: ValidateFunction }
  /**
   * `diagnostics` is the contract; `reason` is the same thing rendered as one
   * line, kept because callers that only want to print something want a
   * string. Both are Tiphys-owned: no Ajv sentence reaches either.
   */
  | { ok: false; diagnostics: Diagnostic[]; reason: string };

/**
 * COMPANION SCHEMAS (M3-P4). A shipped schema may `$ref` a definition in a
 * SIBLING shipped schema, so that a contract shared by two artifact types has
 * ONE definition rather than two that can drift. `schemas/work-history.schema.json`
 * is the first instance: its `claims[]`, `fix-round[]` and `gate-evidence[]`
 * items resolve into `schemas/report.schema.json`.
 *
 * THIS IS NOT THE REMOTE LOADING DR-0013 CLAUSE 4 WITHHOLDS, and the
 * difference is the whole reason the parameter exists rather than a
 * `loadSchema` callback. A companion is supplied BY THE CALLER, from the
 * shipped `schemas/` directory, named in `src/commands/validate.ts`'s
 * companion table beside the type table. Nothing is fetched, nothing is
 * resolved from the reference itself, and a `$ref` naming a document the
 * caller did not supply still fails COMPILATION with the existing
 * `unresolvedRef` or `remoteRef` diagnostic. The set of documents a schema
 * may reach is therefore declared in one auditable place, which is the
 * property clause 4 is protecting.
 */
const compiled = new WeakMap<object, CompilationCacheEntry[]>();

interface CompilationCacheEntry {
  companions: readonly SchemaDocument[];
  result: Compilation;
}

function sameCompanions(
  left: readonly SchemaDocument[],
  right: readonly SchemaDocument[],
): boolean {
  return (
    left.length === right.length && left.every((one, index) => one === right[index])
  );
}

/**
 * Compile a schema. Cached by schema OBJECT IDENTITY, because a fresh Ajv per
 * call is both slow and wrong: two schemas carrying the same `$id` cannot
 * share one Ajv instance, so each schema gets its own.
 *
 * IDENTITY, NOT CONTENT, and it has one observable consequence worth stating
 * rather than discovering. A caller that MUTATES a schema object in place
 * after compiling it keeps the old validator, because the WeakMap key is
 * unchanged. That is correct for how schemas are used here (documents read
 * from disk and never edited), and it was measured: the first attempt at
 * criterion 4's red witness defanged a keyword in place and the diagnostics
 * did not move, which read exactly like a schema whose keyword was doing
 * nothing. The witness was redone with a schema re-read from disk per arm.
 * Any future caller that wants to compile a modified schema must hand over a
 * NEW object.
 *
 * The cache is keyed by the schema object AND by the COMPANION LIST, also by
 * identity: the same document compiled with and without a companion is two
 * different compilations, and returning the first for the second would be the
 * quiet wrong answer. Companion lists here are one or zero long, so the scan
 * is a scan of a one-element array.
 */
export function compileSchema(
  schema: SchemaDocument,
  companions: readonly SchemaDocument[] = [],
): Compilation {
  const entries = compiled.get(schema) ?? [];
  const cached = entries.find((entry) => sameCompanions(entry.companions, companions));
  if (cached !== undefined) {
    return cached.result;
  }
  let result: Compilation;
  const ajv = makeAjv();
  try {
    for (const companion of companions) {
      ajv.addSchema(companion);
    }
    result = { ok: true, validator: ajv.compile(schema) };
  } catch (error) {
    const diagnostics = compilationDiagnostics(error, ajv, schema);
    result = {
      ok: false,
      diagnostics,
      reason: formatDiagnostics(diagnostics).join("; "),
    };
  }
  entries.push({ companions: [...companions], result });
  compiled.set(schema, entries);
  return result;
}

function ajvText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Translate a COMPILATION failure into the Tiphys diagnostic contract.
 *
 * The classification reads Ajv's exception only to EXTRACT IDENTIFIERS from
 * it; nothing Ajv wrote is passed through. An unrecognised shape becomes the
 * bare `schema could not be compiled`, which loses detail deliberately:
 * losing detail is recoverable, and leaking a third party's wording into a
 * contract nine phases are written against is not.
 */
export function compilationDiagnostics(
  error: unknown,
  ajv: Ajv2020,
  schema: SchemaDocument,
): Diagnostic[] {
  const text = ajvText(error);

  const unknownKeyword = /unknown keyword: "([^"]+)"/.exec(text);
  if (unknownKeyword !== null) {
    return [
      {
        pointer: ROOT_POINTER,
        message: DIAGNOSTIC_MESSAGES.unknownKeyword(unknownKeyword[1] as string),
      },
    ];
  }

  const untyped = /missing type "([^"]+)" for keyword "([^"]+)" at "([^"]+)"/.exec(text);
  if (untyped !== null) {
    return [
      {
        pointer: (untyped[3] as string).startsWith("#")
          ? (untyped[3] as string)
          : ROOT_POINTER,
        message: DIAGNOSTIC_MESSAGES.strictPolicyUntyped(
          untyped[2] as string,
          untyped[1] as string,
        ),
      },
    ];
  }

  const missingRef = /can't resolve reference (\S+) from id/.exec(text);
  if (missingRef !== null) {
    const reference = missingRef[1] as string;
    /* A scheme-qualified reference is REMOTE, and DR-0013 clause 4 withholds
       the loader that would fetch it, so it fails closed rather than being
       skipped or retrieved. A bare `#/...` that does not resolve is the local
       case and gets the local message. */
    const remote = /^[a-z][a-z0-9+.-]*:/i.test(reference);
    return [
      {
        pointer: ROOT_POINTER,
        message: remote
          ? DIAGNOSTIC_MESSAGES.remoteRef(reference)
          : DIAGNOSTIC_MESSAGES.unresolvedRef(reference),
      },
    ];
  }

  if (text.startsWith("schema is invalid")) {
    /* META-SCHEMA VALIDATION. Ajv leaves the failures on the instance, and
       they are ordinary errors over the SCHEMA as the instance, so they route
       through the same renderer and come out with pointers INTO the schema.
       That is strictly more useful than Ajv's sentence and owes it nothing. */
    const metaErrors = ajv.errors ?? [];
    const mapped = metaErrors
      .filter((one) => !isSubsidiary(one))
      .map((one) => renderAjvError(one, schema))
      .filter((one): one is Diagnostic => one !== undefined);
    return sortDiagnostics([
      { pointer: ROOT_POINTER, message: DIAGNOSTIC_MESSAGES.invalidSchemaDocument() },
      ...mapped,
    ]);
  }

  if (error instanceof SyntaxError && /regular expression/i.test(text)) {
    return [
      { pointer: ROOT_POINTER, message: DIAGNOSTIC_MESSAGES.patternUncompilable() },
    ];
  }

  if (error instanceof RangeError) {
    return [
      { pointer: ROOT_POINTER, message: DIAGNOSTIC_MESSAGES.cyclicCompilation() },
    ];
  }

  if (text.startsWith("strict mode")) {
    return [{ pointer: ROOT_POINTER, message: DIAGNOSTIC_MESSAGES.strictPolicy() }];
  }

  return [{ pointer: ROOT_POINTER, message: DIAGNOSTIC_MESSAGES.uncompilable() }];
}

/**
 * Validate an already-decoded instance against a schema document.
 *
 * Returns diagnostics in the contract's deterministic order. A schema that
 * cannot be compiled yields ONE root diagnostic rather than a throw: this
 * function is called from a CLI whose ordinary input is hand-authored, and a
 * thrown compile error there is the stack trace step 8b exists to prevent.
 */
export function validateInstance(
  schema: SchemaDocument,
  instance: unknown,
  companions: readonly SchemaDocument[] = [],
): Diagnostic[] {
  const compilation = compileSchema(schema, companions);
  if (!compilation.ok) {
    return compilation.diagnostics;
  }
  const ok = compilation.validator(instance);
  if (ok) {
    return [];
  }
  const errors = compilation.validator.errors ?? [];
  /* CR-004. Ajv reports, beside every failing `contains`, one subsidiary
     `const` error per array item carrying the required value in
     `params.allowedValue`. `isSubsidiary` drops those (they are one fault
     reported N times), so the value was being discarded a few lines before the
     message that needed it. Harvest it first, keyed by the contains
     subschema's own schemaPath, which is the subsidiary's path minus the
     trailing `/const`. */
  const containsConst = new Map<string, unknown>();
  for (const error of errors) {
    if (error.keyword === "const" && error.schemaPath.endsWith("/contains/const")) {
      containsConst.set(
        error.schemaPath.slice(0, -"/const".length),
        (error.params as Record<string, unknown>)["allowedValue"],
      );
    }
  }
  const diagnostics: Diagnostic[] = [];
  for (const error of errors) {
    if (isSubsidiary(error)) {
      continue;
    }
    const diagnostic = renderAjvError(error, instance, containsConst);
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
    }
  }
  /* Ajv can report the same pointer and message twice through two branches;
     the contract emits one line per distinct fault. */
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    unique.set(formatDiagnostic(diagnostic), diagnostic);
  }
  return sortDiagnostics([...unique.values()]);
}

/** Validate and format in one step. */
export function validateToLines(
  schema: SchemaDocument,
  instance: unknown,
  companions: readonly SchemaDocument[] = [],
): string[] {
  return formatDiagnostics(validateInstance(schema, instance, companions));
}

/* ------------------------------------------------------------------ */
/* Stage one: input decoding (DR-0013 YAML clauses 1 to 4)             */
/* ------------------------------------------------------------------ */

/**
 * A decode outcome. A DECODE failure and a VALIDATION failure are different
 * things and the caller can tell which it has, which is the separation
 * DR-0013 YAML clause 3 requires.
 */
export type DecodeResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * Decode YAML (or JSON, which YAML 1.2 is a superset of) into a plain value.
 *
 * A parse failure returns a reason, never a throw and never a stack trace.
 * `yaml` reports position information; it is collapsed to one line because
 * the contract is one diagnostic line per failure.
 */
export function decodeDocument(text: string, label: string): DecodeResult {
  const { parse: parseYaml, YAMLParseError } = yamlModule();
  let value: unknown;
  try {
    value = parseYaml(text, { prettyErrors: false });
  } catch (error) {
    if (error instanceof YAMLParseError) {
      const where = error.linePos?.[0];
      const at = where === undefined ? "" : ` at line ${String(where.line)} column ${String(where.col)}`;
      return {
        ok: false,
        reason: `${label} is not valid YAML${at}: ${ajvText(error.message)}`,
      };
    }
    return { ok: false, reason: `${label} could not be decoded: ${ajvText(error)}` };
  }
  return { ok: true, value };
}

/** What a guarded read of an operator-supplied path produced. */
export type GuardedRead =
  | { ok: true; body: string }
  | { ok: false; reason: string };

/**
 * READ A PATH THIS PROGRAM DID NOT CREATE (D-M3-27).
 *
 * `tiphys validate <file>` takes an operator-supplied path, so the path may
 * be a FIFO, a directory, a socket or a dangling symlink. Opening a FIFO with
 * no writer blocks forever and the command never returns, which is the M1-P5
 * class (CR-520). The type is established with `classifyEntry` BEFORE the
 * open, and an irregular entry is refused naming the path and the observed
 * type.
 */
export function readOperatorPath(path: string): GuardedRead {
  const entry = classifyEntry(path);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return { ok: false, reason: `${path} does not exist` };
  }
  if (entry.kind === "irregular" || entry.kind === "unexaminable") {
    return { ok: false, reason: entry.reason };
  }
  try {
    return { ok: true, body: readFileSync(path, "utf8") };
  } catch (error) {
    return { ok: false, reason: `${path} could not be read: ${ajvText(error)}` };
  }
}

/**
 * Establish that a path is a DIRECTORY before walking it. Same hazard, same
 * rule: `--context` is operator-supplied and a FIFO there would block the
 * walk exactly as it blocks a read.
 */
export function classifyContextDirectory(path: string): string | undefined {
  const entry = classifyEntry(path);
  if (entry.kind === "absent" || entry.kind === "dangling") {
    return `${path} does not exist`;
  }
  if (entry.kind === "unexaminable") {
    return entry.reason;
  }
  if (entry.kind === "regular") {
    return `${path} is a regular file, not a directory, so it was not walked`;
  }
  /* `classifyEntry` calls everything that is not a regular file "irregular",
     including a directory, which is what a context path is SUPPOSED to be.
     Distinguish here rather than widening classifyEntry, whose callers all
     want a regular file (M2's fleet-state reads). */
  const stats = safeStat(path);
  if (stats === undefined) {
    return `${path} could not be examined`;
  }
  if (!stats.isDirectory()) {
    return entry.kind === "irregular"
      ? entry.reason.replace("not a regular file", "not a directory")
      : `${path} is not a directory`;
  }
  return undefined;
}

function safeStat(path: string): Stats | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}
