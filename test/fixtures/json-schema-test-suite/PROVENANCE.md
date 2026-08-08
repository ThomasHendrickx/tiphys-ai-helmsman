# Provenance of these cases

Source: https://github.com/json-schema-org/JSON-Schema-Test-Suite
Suite revision: 15fe552d6cf76e29cc8165306fb6a72503fd360b
Branch: main, fetched 2026-08-08
Path in the suite: `tests/draft2020-12/`

Vendored rather than fetched at test time, because a test that reaches the
network is a test that fails for a reason unrelated to what it measures, and
because the suite revision must be RECORDED (validator criterion 11) rather
than be whatever `main` happened to be on the day CI ran.

## What was copied

One file per keyword in the declared authoring vocabulary
(`schemas/README.md`): type, required, properties, additionalProperties,
enum, const, items, minItems, minLength, pattern, ref, oneOf, if-then-else,
contains.

## What was NOT copied, and why

- Every keyword file outside the declared vocabulary (maxLength, uniqueItems,
  dependentRequired, format, content, unevaluated*, dynamicRef, and the rest).
  Criterion 11 is scoped to "every keyword in the declared vocabulary"; a
  keyword Tiphys schemas may not use has nothing to witness here.
- `tests/draft2020-12/optional/`. The suite marks those cases optional
  precisely because implementations legitimately differ on them.
- `refRemote.json`. Its cases require an HTTP server serving the suite's
  `remotes/` tree. DR-0013 clause 4 forbids automatic loading of remote
  schemas, so this engine is CONFIGURED to fail those closed; running the
  suite's remote cases would measure the opposite of the decided policy.
  Validator criterion 7's remote-reference arm is witnessed directly in
  `test/validate.test.ts` instead.

Individual cases that are skipped AT RUN TIME, each with its reason, are
printed by `test/schema-suite.test.ts` and counted, so a skip cannot grow
silently.
