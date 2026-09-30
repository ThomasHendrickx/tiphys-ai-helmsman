# DR-0066: pull-request CI runs each check once

- id: DR-0066
- status: DECIDED BY THE OWNER, 2026-09-30
- raised by: the orchestrator, after the owner asked whether CI can be made faster

## The measurement

The `pull_request` run of PR #229 at head 784651b (run 36749979516, job
110005808494) took about 41 minutes before its last step:

| step | time | note |
|---|---|---|
| `npm test` | 6.5 min | the full suite |
| gates step: `suite` gate | about 6.5 min | the same suite again |
| gates step: `red-witness` | about 24 min | `164 stored re-evaluated in 1427872ms`, on every pull request |
| M1 exit test (local mode) | about 8 min | its step A1 runs `npm ci` and `npm test` a third time |

## Options put to the owner

1. Remove the separate `npm test` step; the `suite` gate runs the same suite.
2. On a pull request, re-evaluate a stored witness only when the pull request
   changes a file it mutates or a test file it runs; the push run on `main`
   keeps the full sweep.
3. Run the M1 exit test on the push run only.

Recommended: all three, about 10 to 12 minutes per pull request. The cost:
steps 2 and 3 move checks from before a merge to the push run just after it.

## Decision

The owner, 2026-09-30, verbatim: "Do it now", answering "Shall I do all
three?". Realized by M6-P8, which lands before M6-P4.
