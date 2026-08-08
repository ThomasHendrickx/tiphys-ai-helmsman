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
(`schemas/README.md`). All fifteen files, listed exactly:

```
additionalProperties.json  items.json      properties.json
const.json                 minItems.json   ref.json
contains.json              minLength.json  required.json
enum.json                  oneOf.json      type.json
if-then-else.json          pattern.json    uniqueItems.json
```

`ref.json` carries `$ref`; `if-then-else.json` carries both `if` and `then`.
Those are the only two filenames that do not equal their keyword, and
`test/schema-suite.test.ts` maps them explicitly rather than dropping them.

## What was NOT copied, and why

- Every keyword file outside the declared vocabulary (`maxLength`,
  `dependentRequired`, `format`, `content`, `unevaluated*`, `dynamicRef`,
  `prefixItems`, `propertyNames`, and the rest). Criterion 11 is scoped to
  "every keyword in the declared vocabulary"; a keyword Tiphys schemas may not
  use has nothing to witness here.
- `tests/draft2020-12/optional/`. The suite marks those cases optional
  precisely because implementations legitimately differ on them.
- `refRemote.json`. Its cases require an HTTP server serving the suite's
  `remotes/` tree. DR-0013 clause 4 forbids automatic loading of remote
  schemas, so this engine is CONFIGURED to fail those closed; running the
  suite's remote cases would measure the opposite of the decided policy.
  Validator criterion 7's remote-reference arm is witnessed directly in
  `test/validate.test.ts` instead.

## How these cases are RUN, stated because it is not the shipped configuration

`test/schema-suite.test.ts` compiles suite groups with every shipped DR-0013
clause 4 policy EXCEPT `strictTypes` and `strictRequired`. Those two are
AUTHORING policies: they constrain how a Tiphys schema may be written, not
what a keyword means, and the suite is a third party's corpus in a different
house style.

That relaxation is witnessed rather than trusted. The test
`the shipped policies refuse the suite's untyped style, so the relaxation is
visible` asserts that the SHIPPED configuration really does reject a
representative untyped group, so the two configurations are demonstrably
different and a change that quietly dropped `strictTypes` from the shipped
engine would redden it.

## Corrections made at fix round 1

This document previously said individual cases were "skipped AT RUN TIME, each
with its reason, printed and counted", and that the vendored set was fourteen
files chosen before `uniqueItems.json` was added. Both were stale. More
importantly, the run they described executed ZERO cases for seven of the
sixteen declared keywords (`additionalProperties`, `contains`, `minItems`,
`minLength`, `properties`, `required`, `uniqueItems`) because `strictTypes`
rejected the suite's untyped groups wholesale, and the guard that was supposed
to notice asserted only that a FILE EXISTED. That is finding A-001.

The run now executes 435 cases against 200 before, every one of the fifteen
files contributes a non-zero count, and the per-keyword counts are PINNED in
the test so a collapse cannot pass quietly.

## Five cases FAIL, and they are pinned rather than skipped

Ajv 8.20.0 treats a `required` name that resolves through `Object.prototype`
as PRESENT, so `{"required": ["toString"]}` accepts `{}`. It is the same
prototype-chain class M2's own validator was fixed for at CR-808, one keyword
along. The five affected cases are listed exactly in `KNOWN_FAILURES` in
`test/schema-suite.test.ts` and the assertion is a set equality, so a sixth
failure fails the test and a known one that starts passing fails it too.

The exposure is bounded by a test, not by a sentence: `no shipped schema
declares a prototype-chain property name` walks every document in `schemas/`
and asserts none uses such a name.
