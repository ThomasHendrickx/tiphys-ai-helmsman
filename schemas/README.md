# Tiphys artifact schemas

Every kernel artifact type that is validated has one JSON Schema document
here. `tiphys validate --type <t> <file>` resolves a type to a document in
this directory; `--type auto` resolves it from the instance's `kind` field.

## The dialect, and why it is declared in every file

Every document declares

```
"$schema": "https://json-schema.org/draft/2020-12/schema"
```

DR-0013 clause 3. It is asserted by a registered test over EVERY file in this
directory (`test/schemas.test.ts`, behavior `schemas-declare-2020-12-dialect`)
rather than by inspection, so a schema a later phase adds without the
declaration fails a gate rather than a reading.

## The engine

Ajv 8.20.0 exact, Draft 2020-12, instantiated in `src/validate.ts` with strict
mode, all errors, schema and meta-schema validation, and no coercion, no
inserted defaults, no removal of additional properties, no mutation of the
validated input and no automatic loading of remote schemas (DR-0013 clause 4).
Unknown or invalidly combined keywords fail schema COMPILATION.

Ajv is an INTERNAL IMPLEMENTATION DETAIL. Its wording is never a public
contract: every error is mapped, by keyword, into
`INVALID <json-pointer> <message>` with a deterministic order.

## The declared authoring vocabulary (DR-0013 clause 7)

Ajv supplies Draft 2020-12 entire. This list is what a Tiphys schema is
allowed to USE, so a keyword outside it is a deliberate, documented expansion
rather than an accident. Every keyword here has both a positive and a negative
test (`test/schemas.test.ts`).

| Keyword | Note |
|---|---|
| `type` | one type name per node |
| `required` | strict mode requires every named property to be declared in `properties` at the same level |
| `properties` | |
| `additionalProperties` | boolean only, and set to `false` at EVERY object level |
| `enum` | |
| `const` | |
| `items` | |
| `minItems` | |
| `minLength` | |
| `pattern` | |
| `$ref` | local references only; a remote reference fails compilation |
| `oneOf` | |
| `if` / `then` | |
| `contains` | in the vocabulary and used by no document shipped in M3-P1; its positive, negative and discriminating tests run against a fixture schema in `test/fixtures/` |

Annotations that carry no constraint and are permitted anywhere: `$schema`,
`$id`, `$comment`, `title`, `description`, `$defs`.

Expanding this list is a deliberate act and is recorded here, per DR-0013
clause 7. Prohibiting an otherwise-valid keyword is a POLICY LINTER, never a
reimplementation of keyword semantics; `src/gates/validate.ts`'s `loadSchema`
is the one that exists today, and it enforces M2's narrower closed set over
the M2 gate schemas only.

## Kind A and Kind B

A schema expresses properties of ONE document that a keyword reaches (Kind A).
Properties that compare array elements to each other, resolve a reference into
another document, compute arithmetic over sibling fields or touch the
filesystem are Kind B and live in `src/checks.ts` as named derived checks
(kernel plan M3 section 2.3, DR-0013 clause 8). They are never encoded as Ajv
extensions.

## `$comment` carries clause ids

Every requirement row an artifact discharges appears in that artifact as a
clause id, here as a `$comment` tag or a property name.
`scripts/check-clause-map.mjs` fails when a row owned by a phase that is in
force has no entry, when an entry names a row the plan's inventory does not
contain, when a named artifact does not exist, or when the clause id does not
occur inside it.
