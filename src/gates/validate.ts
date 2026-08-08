/**
 * THE MINIMAL IN-REPO SCHEMA VALIDATOR (kernel plan M2, M2-P1 step 4;
 * M2-D-04; DR-0013 clause 6).
 *
 * M1 shipped zero runtime dependencies. DR-0013 decided the library
 * question for M3 (Ajv 8.20.0 exact, Draft 2020-12) and made THIS module the
 * seam: M3-P1 retires the engine below and keeps the boundary. That promise
 * is only keepable if two things are true here, and both are enforced by
 * this module's tests rather than asserted in prose:
 *
 *   1. THE DIAGNOSTIC CONTRACT IS `INVALID <json-pointer> <message>`, one
 *      line per failure, in a deterministic order. That string is this
 *      module's public output. Everything else about how a failure was
 *      found is an implementation detail and no test may assert on it.
 *   2. THE MESSAGE TEXTS BELOW ARE THE CONTRACT, not this engine's wording.
 *      They are listed in `DIAGNOSTIC_MESSAGES` so a future engine has one
 *      table to map onto instead of a search through call sites.
 *
 * Without those two, DR-0013's "all existing M2 validation tests are re-run
 * against it" would be a rewrite of the tests rather than an engine swap,
 * and "the module boundary is preserved" would be false at the moment it was
 * acted on.
 *
 * DETERMINISTIC ORDERING, stated so a replacement engine can reproduce it:
 * every diagnostic is collected during a traversal that visits object
 * properties in sorted key order and array items in index order, and the
 * collected list is then sorted by (pointer, message) with ASCII
 * lexicographic comparison. The final sort is what makes the order a
 * property of the CONTRACT rather than of the traversal, so an engine that
 * walks differently still emits the same lines in the same order.
 *
 * THE CLOSED KEYWORD SET, AND WHY IT IS LOUD (M2-D-04). Ten validation
 * keywords plus local `$ref`. A schema document containing any other
 * keyword is a LOAD ERROR naming the keyword and its location. It is never
 * ignored, because a validator that silently skips `oneOf` reports a
 * document valid while never having checked the constraint that mattered,
 * which is the same shape as "green by omission" one layer down. The set is
 * deliberately NOT grown to anticipate M3's five artifact schemas; DR-0013
 * decided that question against extension.
 */

import {
  sortDiagnostics,
  validateInstance,
} from "../validate.ts";

/** The ten validation keywords plus local `$ref`. Nothing else validates. */
export const VALIDATION_KEYWORDS: readonly string[] = [
  "type",
  "required",
  "properties",
  "additionalProperties",
  "enum",
  "items",
  "minimum",
  "minItems",
  "pattern",
  "const",
  "$ref",
];

/**
 * Keys that carry no constraint and are permitted for documentation and for
 * holding subschemas. They are listed separately from the validation
 * keywords on purpose: a reader must be able to see that permitting
 * `description` is a decision about annotations and not a hole in the closed
 * set.
 */
export const ANNOTATION_KEYS: readonly string[] = [
  "$schema",
  "$id",
  "title",
  "description",
  "$defs",
];

export interface Diagnostic {
  pointer: string;
  message: string;
}

/**
 * `INVALID <json-pointer> <message>`. The module's public contract.
 *
 * Pointers are JSON Pointers in RFC 6901 URI-fragment form, so the document
 * root is `#` and a nested location is `#/gates/0/id`. The fragment form is
 * chosen over the bare form for one mechanical reason: the bare pointer to
 * the root is the EMPTY STRING, which would render this line with two
 * consecutive spaces and make the three fields ambiguous to split. A
 * diagnostic is reported at the pointer of the OFFENDING LOCATION, not of
 * its parent, so a missing required property points at the property that
 * should have been there.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return `INVALID ${diagnostic.pointer} ${diagnostic.message}`;
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map(formatDiagnostic);
}

/**
 * THE MESSAGE CONTRACT. One entry per way a value can fail. A replacement
 * engine maps its own errors onto these; a test asserts on these and never
 * on anything else.
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
  /**
   * Authored by src/gates/manifest.ts, which cannot express "keyed by name"
   * in the closed keyword set. It lives in THIS table anyway (CR-811): the
   * table's stated purpose is to give a future engine one place to map onto
   * instead of a search through call sites, and a message that sits outside
   * it defeats that purpose whatever module emits it.
   */
  duplicateId: (id: string): string =>
    `gate id ${id} is declared more than once`,
  /** A $ref chain that returns to itself without consuming an instance. */
  cyclicRef: (reference: string): string =>
    `schema reference ${reference} is cyclic`,
  unresolvedRef: (reference: string): string =>
    `schema reference ${reference} does not resolve`,
};

/**
 * Own-property test. `properties["__proto__"]` resolves through the prototype
 * chain to `Object.prototype`, which is an object, so a naive lookup treats
 * `__proto__` as a DECLARED property and lets it through
 * `additionalProperties: false` (CR-808). Ajv rejects it, so this was also a
 * seam divergence.
 */
function ownProperty(container: Record<string, unknown>, name: string): unknown {
  return Object.prototype.hasOwnProperty.call(container, name)
    ? container[name]
    : undefined;
}

export type SchemaDocument = Record<string, unknown>;

export type SchemaLoad =
  | { ok: true; schema: SchemaDocument }
  | { ok: false; reason: string };

function pointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPointer(pointer: string, segment: string): string {
  return `${pointer}/${pointerSegment(segment)}`;
}

/** The document root, in URI-fragment form. */
export const ROOT_POINTER = "#";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

const PERMITTED_TYPES: readonly string[] = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
];

/**
 * Walk a schema document and refuse anything outside the closed set. The
 * walk knows WHERE subschemas live (`properties/*`, `items`, `$defs/*` and
 * the root), so a property literally named "oneOf" inside `properties` is a
 * property name and not a keyword, and is not confused for one.
 */
function checkSchemaNode(
  node: unknown,
  pointer: string,
  problems: string[],
): void {
  if (!isPlainObject(node)) {
    problems.push(`${pointer} is not a schema object`);
    return;
  }
  for (const key of Object.keys(node).sort()) {
    if (VALIDATION_KEYWORDS.includes(key) || ANNOTATION_KEYS.includes(key)) {
      continue;
    }
    problems.push(
      `unsupported schema keyword ${key} at ${pointer}`,
    );
  }
  const type = node["type"];
  if (type !== undefined) {
    if (typeof type !== "string" || !PERMITTED_TYPES.includes(type)) {
      problems.push(
        `unsupported type value at ${pointer}: this validator accepts a single type name from ${PERMITTED_TYPES.join(", ")}`,
      );
    }
  }
  const additional = node["additionalProperties"];
  if (additional !== undefined && typeof additional !== "boolean") {
    problems.push(
      `unsupported additionalProperties at ${pointer}: this validator accepts a boolean only`,
    );
  }
  const required = node["required"];
  if (required !== undefined && !Array.isArray(required)) {
    problems.push(`required at ${pointer} is not an array`);
  }
  const enumeration = node["enum"];
  if (enumeration !== undefined && !Array.isArray(enumeration)) {
    problems.push(`enum at ${pointer} is not an array`);
  }
  const reference = node["$ref"];
  if (reference !== undefined && typeof reference !== "string") {
    problems.push(`$ref at ${pointer} is not a string`);
  }
  if (reference !== undefined) {
    // CR-802. JSON Schema 2020-12 APPLIES keywords sitting beside `$ref`,
    // and Ajv does too. This engine followed the reference and returned,
    // dropping every sibling without a word: a KNOWN keyword in a position
    // the validator silently ignores, which is the harder half of the
    // attack the closed keyword set exists to stop, and a verdict change at
    // the exact seam DR-0013 clause 6 promises M3-P1 can swap across.
    //
    // Refusing at load rather than implementing sibling application is the
    // choice this module's philosophy already made everywhere else: a
    // schema this engine cannot evaluate the way the specification says is
    // rejected, never partially honoured. A schema that never uses the
    // construct behaves identically under both engines.
    const siblings = Object.keys(node)
      .filter(
        (key) => key !== "$ref" && VALIDATION_KEYWORDS.includes(key),
      )
      .sort();
    if (siblings.length > 0) {
      problems.push(
        `$ref at ${pointer} has sibling keyword(s) ${siblings.join(", ")}: ` +
          "this validator does not apply keywords beside a $ref, and " +
          "silently ignoring them would validate less than the schema says",
      );
    }
  }
  const properties = node["properties"];
  if (properties !== undefined) {
    if (!isPlainObject(properties)) {
      problems.push(
        `properties at ${pointer} is not an object`,
      );
    } else {
      for (const name of Object.keys(properties).sort()) {
        checkSchemaNode(
          ownProperty(properties as Record<string, unknown>, name),
          `${childPointer(pointer, "properties")}/${pointerSegment(name)}`,
          problems,
        );
      }
    }
  }
  const defs = node["$defs"];
  if (defs !== undefined) {
    if (!isPlainObject(defs)) {
      problems.push(`$defs at ${pointer} is not an object`);
    } else {
      for (const name of Object.keys(defs).sort()) {
        checkSchemaNode(
          ownProperty(defs as Record<string, unknown>, name),
          `${childPointer(pointer, "$defs")}/${pointerSegment(name)}`,
          problems,
        );
      }
    }
  }
  const patternSource = node["pattern"];
  if (patternSource !== undefined) {
    if (typeof patternSource !== "string") {
      problems.push(`pattern at ${pointer} is not a string`);
    } else {
      // Compiled HERE so an unusable pattern is a load failure with a
      // reason, not a throw escaping mid-validation. CR-801's derivation
      // named this exact asymmetry: `new RegExp` on a CALLER-supplied
      // pattern was guarded and `new RegExp` on a SCHEMA-supplied one was
      // not, same call, same failure, one guarded.
      try {
        new RegExp(patternSource);
      } catch (error) {
        problems.push(
          `pattern at ${pointer} is not a valid expression: ${(error as Error).message}`,
        );
      }
    }
  }

  const items = node["items"];
  if (items !== undefined) {
    checkSchemaNode(items, childPointer(pointer, "items"), problems);
  }
}

/**
 * Load a schema document, refusing loudly on any keyword outside the closed
 * set. `name` appears in the reason so a caller with several documents knows
 * which one failed.
 */
export function loadSchema(document: unknown, name: string): SchemaLoad {
  const problems: string[] = [];
  checkSchemaNode(document, ROOT_POINTER, problems);
  if (problems.length > 0) {
    return {
      ok: false,
      reason: `${name}: ${problems.sort().join("; ")}`,
    };
  }
  return { ok: true, schema: document as SchemaDocument };
}

function resolveRef(
  root: SchemaDocument,
  reference: string,
): SchemaDocument | undefined {
  // `#` is the whole document, which is how a recursive schema is normally
  // written. It was unhandled until a control in test/gates.test.ts exercised
  // a legitimate recursive schema and got "does not resolve"; the cycle fix
  // that motivated the control would otherwise have shipped beside a gap
  // that made every recursive schema unusable.
  if (reference === "#") {
    return root;
  }
  if (!reference.startsWith("#/")) {
    return undefined;
  }
  let node: unknown = root;
  for (const raw of reference.slice(2).split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isPlainObject(node)) {
      return undefined;
    }
    node = ownProperty(node, segment);
  }
  return isPlainObject(node) ? node : undefined;
}

/* ------------------------------------------------------------------ */
/* THE ENGINE, RETIRED (DR-0013 clause 6, M3-P1 step 8).                */
/* ------------------------------------------------------------------ */

/**
 * WHAT WAS RETIRED AND WHAT WAS KEPT, stated because the distinction is the
 * whole of DR-0013 clause 6.
 *
 * RETIRED: keyword SEMANTICS. `type`, `required`, `properties`,
 * `additionalProperties`, `enum`, `items`, `minimum`, `minItems`, `pattern`
 * and `const` are no longer evaluated here. `validate` hands the schema and
 * the instance to `src/validate.ts`, which is Ajv 8.20.0 under the policies
 * DR-0013 clause 4 fixed. Two engines with potentially different semantics
 * are not maintained.
 *
 * KEPT, and each for a reason DR-0013 names:
 *
 *   1. THE MODULE BOUNDARY. `loadSchema`, `validate`, `validateToLines`,
 *      `formatDiagnostic`, `formatDiagnostics` and `DIAGNOSTIC_MESSAGES` are
 *      unchanged in name, signature and meaning, so every M2 caller and every
 *      M2 test is untouched.
 *   2. THE CLOSED KEYWORD SET, as a POLICY LINTER. `loadSchema` still refuses
 *      a gate schema containing a keyword outside M2-D-04's set. DR-0013
 *      clause 7 says this explicitly: prohibiting otherwise-valid but
 *      unapproved keywords "is a small schema-aware POLICY LINTER, never a
 *      reimplementation of keyword semantics". Under Ajv `oneOf` compiles
 *      fine, so without this linter M2's gate schemas would silently acquire
 *      a vocabulary nobody approved.
 *   3. THE REFERENCE POLICY. Measured 2026-08-08 with the pinned Ajv:
 *      compiling `{type:"object",properties:{x:{$ref:"#/$defs/a"}},
 *      $defs:{a:{$ref:"#/$defs/a"}}}` raises
 *      `RangeError: Maximum call stack size exceeded`. That is CR-807's
 *      failure wearing a different engine's clothes, so the cycle and
 *      unresolved-reference analysis stays HERE, in front of the engine,
 *      where it produces a diagnostic instead of a stack overflow. It
 *      evaluates no other keyword.
 */

/**
 * Reference-only joint walk. Follows `$ref` and descends `properties` and
 * `items`, and does nothing else. `refChain` holds the references followed
 * since the last INSTANCE node was consumed, so a legitimate recursive schema
 * (which always consumes an instance node between two follows) is not
 * mistaken for a cycle. This is the same rule the retired engine used and the
 * same diagnostics, because both are contract.
 */
function collectReferenceDiagnostics(
  root: SchemaDocument,
  schema: SchemaDocument,
  instance: unknown,
  pointer: string,
  into: Diagnostic[],
  refChain: string[],
  seenNodes: Set<SchemaDocument>,
): void {
  const reference = schema["$ref"];
  if (typeof reference === "string") {
    if (refChain.includes(reference)) {
      into.push({ pointer, message: DIAGNOSTIC_MESSAGES.cyclicRef(reference) });
      return;
    }
    const target = resolveRef(root, reference);
    if (target === undefined) {
      into.push({
        pointer,
        message: DIAGNOSTIC_MESSAGES.unresolvedRef(reference),
      });
      return;
    }
    collectReferenceDiagnostics(
      root,
      target,
      instance,
      pointer,
      into,
      [...refChain, reference],
      seenNodes,
    );
    return;
  }

  if (Array.isArray(instance)) {
    const items = schema["items"];
    if (isPlainObject(items)) {
      for (let index = 0; index < instance.length; index += 1) {
        collectReferenceDiagnostics(
          root,
          items,
          instance[index],
          `${pointer}/${index}`,
          into,
          [],
          seenNodes,
        );
      }
    }
    return;
  }

  if (isPlainObject(instance)) {
    const properties = isPlainObject(schema["properties"])
      ? (schema["properties"] as Record<string, unknown>)
      : {};
    for (const name of Object.keys(instance).sort()) {
      const subschema = ownProperty(properties, name);
      if (isPlainObject(subschema)) {
        collectReferenceDiagnostics(
          root,
          subschema,
          ownProperty(instance, name),
          childPointer(pointer, name),
          into,
          [],
          seenNodes,
        );
      }
    }
  }
}

/**
 * Validate an instance against a loaded schema. The returned list is sorted
 * by (pointer, message), which is the deterministic order the contract
 * promises and which is now produced by `sortDiagnostics` in the shared
 * engine so the two modules cannot drift on it.
 */
export function validate(
  schema: SchemaDocument,
  instance: unknown,
): Diagnostic[] {
  const referenceProblems: Diagnostic[] = [];
  collectReferenceDiagnostics(
    schema,
    schema,
    instance,
    ROOT_POINTER,
    referenceProblems,
    [],
    new Set(),
  );
  if (referenceProblems.length > 0) {
    // A schema whose references do not resolve, or loop, cannot be compiled
    // at all: the engine would throw. Report and stop, exactly as the retired
    // engine returned at the offending reference node.
    return sortDiagnostics(referenceProblems);
  }
  return validateInstance(schema, instance) as Diagnostic[];
}

/** Validate and format in one step: the shape most callers want. */
export function validateToLines(
  schema: SchemaDocument,
  instance: unknown,
): string[] {
  return formatDiagnostics(validate(schema, instance));
}
