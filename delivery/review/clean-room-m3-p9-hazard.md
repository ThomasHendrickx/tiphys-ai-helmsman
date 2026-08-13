# Clean-room review, M3-P9, hazard lens (reviewer B)

Branch under review: `claude/m3-p9-agents-policy`, head `d9d5a1d`, PR #131.
This review's own branch: `claude/review-m3-p9-b`, cut from `origin/main` at
`12f84f9`.

Lens: what does a CONSUMER of the published npm package get wrong because of
this. A second reviewer is walking the acceptance criteria as a contract
concurrently; this review does not duplicate that.

Status: COMPLETE.

## What this review does NOT cover (read this first)

- `scripts/`, `test/`, `.github/`, and anything under `delivery/` are out of
  scope per owner decision DR-0027 (shipped-value ruling), EXCEPT where the
  content of a shipped artifact (`AGENTS.md`, `roles/implementer.md`,
  `gate-registry.yaml`, `src/checks.ts`) makes claims about those trees that a
  consumer cannot verify, in which case the claim is examined because it
  reaches into the shipped artifact.
- CI status is not read. `GH_TOKEN` returns 401 against GitHub REST in this
  environment and would fail silently if polled, so it was never attempted.
- This review does not re-walk the phase's acceptance criteria as a
  contract; that is the concurrent reviewer's job, and this review does not
  duplicate it.
- Coverage of the shipped `dual-review-decorrelation` check is by direct
  construction of a handful of fixture shapes (one fully correlated pair, one
  fully decorrelated pair, seven malformed-instance shapes, a missing-context
  call, a no-charter context, and the two real gate invocations against an
  installed package). It is not exhaustive fuzzing and it does not attempt
  every combination of the three decorrelation dimensions, only the two
  extremes (all three shared, all three distinct).
- The anchor-resolution check on `roles/*.md` clause references was done by
  matching the "## clause \<id\>: ..." heading convention by eye and by grep,
  not by running the actual resolver, because the resolver
  (`scripts/check-agents-references.mjs`) is itself one of this review's
  findings: it does not ship, so it could not be run from an installed
  package to check its own claims. This is stated as a limitation of this
  review's method, not asserted as proof the anchors are correct by some
  other authority.
- I did not audit `checklists/`, `schemas/`, or `templates/` content for
  correctness beyond confirming the specific keys `AGENTS.md` cites
  (`#probes`, `#framings`, `#gates`, `#roles`, `#mechanisms`,
  `#properties.*`) are present in the shipped files. I did not read those
  trees end to end.
- I did not attempt every shape of malformed `contextDirectory` (e.g. a
  directory that exists but the process lacks permission to read, or a
  symlink cycle) against `dualReviewDecorrelation`; only "directory absent",
  "directory absent one level up (no charter.yaml)", and the two working
  paths were exercised.

## Environment measured

```
$ node --version
v26.6.0
$ npm --version
11.18.0
```

Build state: built from source (`npm ci` then `npm run build`, both exit 0,
`npm run build` produces `dist/` and leaves the source tree with no reported
diff from the build step itself). The suite was NOT re-run for this review
(out of scope per the hazard lens and per DR-0027); this review is entirely
about the PACKED ARTIFACT, not the test suite.

Toolchain note for anything below that shells out: all commands ran with
`/tmp/claude-0/.../scratchpad/toolchain/node-v26.6.0-linux-x64/bin` first on
PATH, confirmed once per shell before use.

## Method: build the real package, install it as a real consumer would, then look from outside

This is the same class of defect that broke the previous phase (a shipped
index whose paths did not resolve because a referenced tree was not
packaged), so it was reproduced first, before reading any source:

```
$ cd <worktree>/claude/m3-p9-agents-policy
$ npm ci                     # exit 0
$ npm run build               # exit 0
$ npm pack --pack-destination <scratch>
```

produced `tiphys-kernel-0.0.0.tgz`, 554.8 kB, 181 files. Extracting the
tarball alone and importing from it directly is NOT a faithful reproduction
of a consumer (dependencies are not installed that way; an early attempt at
this gave a false "Cannot find module 'yaml'" that had nothing to do with
the phase and everything to do with my own test setup). The faithful
reproduction is a separate throwaway project that depends on the tarball:

```
$ mkdir consumer-project && cd consumer-project
$ echo '{"name":"consumer-project","private":true}' > package.json
$ npm install <scratch>/tiphys-kernel-0.0.0.tgz
added 11 packages
```

All findings below are measured from inside
`consumer-project/node_modules/@tiphys/kernel`, i.e. exactly the tree a real
`npm install @tiphys/kernel` would produce.

## Finding H-1 (HIGH): the gate table that `AGENTS.md` and `roles/implementer.md` both hand a consumer as "everything your change must pass" errors or silently masks a crash as "not applicable", for every consumer, on the two gates this phase adds

**What breaks for a consumer.** `AGENTS.md` (newly added to the package
`files` list by this phase; it was not shipped before) narrates, in its own
body prose, that the orchestrator role runs
`scripts/check-agents-references.mjs` (referenced twice) and
`scripts/check-dual-review.mjs` (referenced by name and quoted verbatim
performing the decorrelation check). `roles/implementer.md` independently
ships a generated gate table, headed "Every change must pass these, in
order" and "Then the gates \`full\` mode selects, run by \`tiphys gates run
--registry gate-registry.yaml --mode full\`", listing `check-agents-
references` as `required` and `check-dual-review` as `conditional`. Both
documents are two of the three shipped artifacts this review is scoped to.

`scripts/` is not in `package.json`'s `files` array (confirmed: `AGENTS.md`
is the only line added to that array by this phase's diff against
`origin/main`). Neither script exists anywhere in an installed package:

```
$ cd consumer-project/node_modules/@tiphys/kernel
$ ls scripts
ls: cannot access 'scripts': No such file or directory
```

Running the exact commands the documents specify:

```
$ node scripts/check-agents-references.mjs
node:internal/modules/cjs/loader:1573
Error: Cannot find module '.../node_modules/@tiphys/kernel/scripts/check-agents-references.mjs'
    code: 'MODULE_NOT_FOUND'
Node.js v26.6.0
(exit 1)
```

Running the actual documented consumer command,
`tiphys gates run --registry gate-registry.yaml --mode full`, against just
these two gates:

```
$ node dist/bin/tiphys.js gates run --registry gate-registry.yaml --mode full \
    --only check-agents-references --evidence /tmp/ev3
gates: declared 1 applicable 1 verdict 0 green 0 red 0 not-applicable 0 error 1 vacuous 0
gates: 1 gate(s) reported error: check-agents-references
(exit 21)
```

`check-agents-references` is declared `applicability: required` in
`gate-registry.yaml`. It errors, not "not applicable", for every consumer,
unconditionally, on the very first attempt to run the documented command.
The evidence record (`/tmp/ev3/check-agents-references/result.json`) reads:
`"detail": "gate check-agents-references exited 1 without writing a result
record ..."`, with the `MODULE_NOT_FOUND` stack trace captured verbatim in
`stderr.txt`.

`check-dual-review` is declared `applicability: conditional` with a
precondition. Its failure mode is quieter and, I judge, worse:

```
$ node dist/bin/tiphys.js gates run --registry gate-registry.yaml --mode full \
    --only check-dual-review --evidence /tmp/ev2
gates: declared 1 applicable 0 verdict 0 green 0 red 0 not-applicable 1 error 0 vacuous 0
gates: no applicable gate
(exit 21)
```

The evidence record reads: `"detail": "precondition dual-review-verdicts-
present evaluated and unmet: node scripts/check-dual-review.mjs
--precondition . exited 1"`. This is indistinguishable, from the printed
line alone, from the LEGITIMATE case ("this project genuinely has no
committed verdict pairs yet"), which is exactly the case
`src/checks.ts` itself says must never be confused with a real check
("nothing to check here" and "everything checked and fine" must never print
the same line", quoted from the `dual-review-decorrelation` implementation's
own comment). Here the confused pair is different but the same shape: "no
verdicts exist" and "the verdict-checking script itself does not exist" both
print `... exited 1` and both resolve to the same `not-applicable` status.

**Root cause traced in the runner itself.** `dist/src/gates/run.js`
carries an explicit guard for exactly this class of problem, and it does not
catch this instance:

```
    if (result.error !== undefined) {
        // The command does not exist, or could not be executed. That is not
        // "the precondition is unmet": nothing was evaluated (M2-C-3).
        return { kind: "error", reason: ... };
    }
```

`result.error` is Node's `spawnSync` signalling that the COMMAND ITSELF
(`node`) could not be launched. Here `node` launches fine; it is the SCRIPT
ARGUMENT that does not exist, so `node` starts, throws `MODULE_NOT_FOUND`,
and exits 1 like any other legitimate nonzero exit. The safeguard the
runner's own author wrote for "the precondition mechanism could not run"
does not fire for "the precondition mechanism's target file does not exist",
and the two are conflated into one `not-applicable` line.

**Why this is not the previous reviewer's territory.** This is not a claim
about acceptance criteria (the concurrent reviewer's lens); it is a claim
about what happens when a consumer, having installed the package and
followed the exact instructions two of the three shipped artifacts give
them, runs the exact command those artifacts specify. I did not need to read
a single line of the plan to find it: I ran the command.

**Compounding context, NOT new to this phase, stated because it changes how
this finding should be read.** The same failure shape (`command: [node,
scripts/*.mjs]` or `command: [node, bin/tiphys.ts, ...]` or `command: [node,
src/gates/*.ts]`, none of which exist in an installed package because only
`dist/` ships) is present on EVERY OTHER script-verified gate in the same
`gate-registry.yaml`, not only the two this phase adds:

```
$ python3 -c "import yaml; [print(g['id'],'->',g.get('command'))
    for g in yaml.safe_load(open('gate-registry.yaml'))['gates']]"
manifest-self-check -> ['node', 'bin/tiphys.ts', 'gates', 'self-check', ...]
coverage            -> ['node', 'src/gates/coverage.ts']
credential-scrub    -> ['node', 'src/gates/credentials.ts', 'credential-scrub']
credential-token    -> ['node', 'src/gates/credentials.ts', 'credential-token']
suite                -> ['node', 'src/gates/suite.ts', ...]
citations            -> ['node', 'src/gates/citations.ts']
scope                -> ['node', 'src/gates/scope.ts', ...]
deploy                -> ['node', 'src/gates/deploy.ts']
migrations            -> ['node', 'src/gates/migrations.ts']
clause-map            -> ['node', 'scripts/check-clause-map.mjs']
red-witness            -> ['node', 'src/gates/red-witness.ts']
agent-rules-drift      -> ['node', 'scripts/render-agent-rules-gates.mjs', '--check']
brief-drift            -> ['node', 'scripts/check-brief-drift.mjs', '--check']
check-agents-references -> ['node', 'scripts/check-agents-references.mjs']
check-dual-review       -> ['node', 'scripts/check-dual-review.mjs', '.']
```

`gates.manifest.json` (also shipped, also cited by `AGENTS.md`'s mandated
reading and by `roles/implementer.md`'s mandated reading) carries the same
12 pre-existing entries with the same shape (verified directly, same
method). I confirmed `manifest-self-check` -- listed FIRST in both the
generated table and this repository's own `CLAUDE.md` gate list -- errors
the same way for a consumer:

```
$ node dist/bin/tiphys.js gates run --registry gate-registry.yaml --mode full \
    --only manifest-self-check --evidence /tmp/ev4
gates: 1 gate(s) reported error: manifest-self-check
(exit 21)
```

`src/`, `bin/`, and `scripts/` are absent in their entirety from the
installed package (confirmed: `ls src bin scripts` all report "No such file
or directory" from inside `node_modules/@tiphys/kernel`). This means 13 of
the 15 declared gates (all except the two `verified-by: clean-room-
checklist` entries, which are documented as never executed by the runner by
design) are non-functional for a consumer who runs the documented command.
This was true before this phase; `gate-registry.yaml`'s diff against
`origin/main` shows the two NEW rows this phase adds
(`check-agents-references`, `check-dual-review`) landing on top of an
already-broken mechanism, not introducing the breakage itself.

**Why it still belongs to this phase's review rather than being purely
tracked.** Before this phase, `gate-registry.yaml` was shipped but nothing
consumer-facing NARRATED it as something to execute; a consumer could
plausibly have read it as this project's own internal CI configuration,
shipped along for reference. This phase is what newly ships `AGENTS.md`,
whose entire premise (per the task brief for this review) is "a consumer
installs the package and reads this as their orchestrator brief", and
whose own text in the body (not a comment, the actual clause prose) says
`scripts/check-agents-references.mjs refuses it` and quotes
`scripts/check-dual-review.mjs` performing the check "with an exit code".
This phase is also what appends the two new rows to `roles/implementer.md`'s
already-shipped, already-broken gate table. So while the MECHANISM
(reference a script path that is never shipped) is pre-existing, THIS
PHASE is what turns it from a dogfood detail into an active instruction two
newly- or freshly-extended shipped artifacts hand every consumer, and it
adds two more entries (one of them `required`) to the pile.

A positive control, so the finding is not overstated: `tiphys gates self-
check` (a distinct subcommand, not `gates run`) DOES work end to end from
the installed package with no source tree present:

```
$ node dist/bin/tiphys.js gates self-check --manifest gates.manifest.json \
    --result /tmp/ev5/result.json --evidence /tmp/ev5
manifest-self-check: green (8 schema documents validated)
(exit 0)
```

So the CLI itself is not broken; specifically the DECLARED GATE COMMANDS in
the shipped registries are what point outside the shipped tree.

**Severity: HIGH.** Consumer-visible thing that breaks: a consumer who
installs `@tiphys/kernel` and follows `roles/implementer.md`'s own printed
instruction ("Every change must pass these... run by `tiphys gates run
--registry gate-registry.yaml --mode full`") gets one hard crash
(`check-agents-references`, a REQUIRED gate) and one silently-masked crash
reported as a normal, expected "not applicable" outcome
(`check-dual-review`), on the first run, using only the commands the shipped
documents themselves specify. No adaptation, no misunderstanding, and no
reading of `delivery/` or `scripts/` was needed to hit this: it is what the
shipped documents say to do.

## Finding H-2 (LOW, tracked): the `check-dual-review` precondition cannot distinguish "no verdicts yet" from "the checker is broken", by design

This is the mechanism behind half of H-1, stated separately because it is a
real defect in `dist/src/gates/run.js`'s precondition evaluator independent
of whether `scripts/check-dual-review.mjs` ever ships: `spawnSync`'s
`result.error` is only set when the COMMAND (`node`) cannot be launched, not
when the command launches and the target script it was told to run does not
exist. Any precondition script that can itself be missing or broken will
report `not-applicable` rather than `error` under this evaluator, for
reasons that have nothing to do with the precondition's actual truth value.
This is TRACKED rather than HIGH on its own because I cannot name a
consumer-visible harm independent of H-1: it only bites when the precondition
COMMAND is itself missing, which today only happens because of H-1's root
cause. If `scripts/check-dual-review.mjs` starts shipping, this sub-finding
stops mattering unless the script can independently fail to exist or launch.

## Finding L-1 (LOW): `dist/node_modules` is deliberately vendored at build time and then deliberately excluded from the package -- not a bug, recorded so nobody re-derives it as one

`npm run build` runs `build:runtime-deps`, which copies `ajv`, `commonmark`,
`yaml` and their transitive dependencies into `dist/node_modules` (confirmed:
`ls dist/node_modules` lists `ajv commonmark entities fast-deep-equal
fast-uri json-schema-traverse mdurl minimist require-from-string yaml`
after a real build). `package.json`'s `files` array then excludes it with
`"!dist/node_modules"`, and the packed tarball indeed contains zero
`node_modules` paths (`tar -tzf ... | grep node_modules` returns nothing). I
initially read this as a defect (import of `yaml` failed when I extracted
the raw tarball without installing dependencies) and it is NOT one: `ajv`,
`commonmark` and `yaml` are declared `dependencies` in `package.json`, so a
real `npm install` resolves them normally, and the consumer-project
reproduction above (Finding H-1's method) confirms this works. Recording
this as a non-finding explicitly because it was my own first false lead and
a future reviewer doing the same `npm pack && extract` shortcut without the
follow-on `npm install` step would hit the identical false alarm.

## Finding N-1 (informational, no severity): `AGENTS.md` itself passes the consumer-view test cleanly, and the counts are stated as numbers as requested

Every backtick-quoted `path#anchor`, `path`, or bare self-referencing clause
id in `AGENTS.md`'s body, plus its YAML front matter's `mandated-reading`
list and its one `$include:` line, were extracted and checked for
resolution from inside the installed package
(`consumer-project/node_modules/@tiphys/kernel`), not from the source
repository.

- 23 distinct backtick `path` or `path#anchor` references in the body.
  21 resolve (file exists, and where an anchor is named, the anchor's target
  -- a YAML top-level or dotted key, a JSON Schema `properties.*` key, or a
  markdown `## clause <id>:` heading -- is present). 2 do NOT resolve:
  `` `scripts/check-agents-references.mjs` `` and
  `` `scripts/check-dual-review.mjs` ``, both covered by Finding H-1.
- 10 `mandated-reading` paths in the front matter. 10 of 10 resolve.
- 1 `$include: roles/_shared-dispatch-contract.md` line. Resolves.
- 5 bare self-referencing clause ids used as backtick anchors within the
  document itself (`fleet-state-commit-discipline`,
  `notification-is-not-liveness`, `stalled-phase-response`,
  `tuition-promotion`, `dispatch-requires-a-guard`). 5 of 5 resolve to a
  `## clause <id>: ...` heading later or earlier in the same file.

Total: 39 distinct resolvable-shaped references, 37 resolve, 2 do not, and
both non-resolving ones are one already-counted defect (H-1), not two
independent ones.

**Zero references to `delivery/`, the exact class of defect that broke the
previous phase's shipped index.**

```
$ grep -n 'delivery/' AGENTS.md
(no output, exit 1)
$ grep -rn 'delivery/' roles/*.md
roles/README.md:0
roles/_shared-dispatch-contract.md:0
roles/adversarial-plan-reviewer.md:0
roles/clean-room-reviewer.md:0
roles/implementer.md:0
roles/investigator.md:0
roles/plan-writer.md:0
```

(counts, from `grep -c`, confirming zero occurrences in every shipped role
brief, not merely that the direct grep found nothing.) This is the one
respect in which this phase clearly learned the previous phase's lesson: the
document that names its own dependencies by path does not name anything
that got left behind.

`roles/implementer.md`'s own gate table (see Finding H-1) is generated FROM
`gate-registry.yaml` and does resolve as text (every gate id in the table is
a real key in the shipped `gate-registry.yaml`); the defect is not that the
table names something absent, it is that what it names, when executed,
fails.

## Finding N-2 (informational): the `dual-review-decorrelation` check itself is honest on every shape tried

Tested by importing `dualReviewDecorrelation` directly from
`dist/src/checks.js` inside the installed package (the only way to exercise
it at all, since the runner script that would normally drive it is Finding
H-1's missing file) and calling `.run(instance, contextDirectory)` by hand
against constructed fixtures. This bypasses the broken runner script
entirely and tests the shipped LOGIC in isolation, which is a fair test of
"is the check honest" independent of "can a consumer reach it" (H-1 already
answers the second question: no, not through the documented path).

**Obviously correlated pair -> correctly FAILS.** Two verdict documents
under a constructed `delivery/review/`, same `phase`, identical
`produced-by`, `framing`, and `review-contract`:

```
{
  "violations": [
    { "pointer": "#/produced-by", "message": "produced-by value model-family-x occurs in 2 of the 2 verdicts ... so the reviews are not decorrelated on produced-by" },
    { "pointer": "#/framing", "message": "framing value criteria occurs in 2 of the 2 verdicts ... not decorrelated on framing" },
    { "pointer": "#/review-contract", "message": "review-contract value criteria occurs in 2 of the 2 verdicts ... not decorrelated on review-contract" }
  ],
  "reports": []
}
```

Non-empty `violations` is the check's FAIL signal (a gate wrapper turns
this red). Correct.

**Genuinely decorrelated pair -> correctly PASSES.** Same two documents,
`produced-by`, `framing`, `review-contract` all changed to distinct values
on the second document:

```
{
  "violations": [],
  "reports": [ "REPORT dual-review-decorrelation 2 verdict(s) for phase p9 are distinct on produced-by, framing, review-contract" ]
}
```

Correct: empty `violations` with a `reports` line is the check's PASS
signal.

**Malformed / empty instance shapes -> none of them silently pass.** Tried
`{}`, `[]`, `""`, `null`, `123`, `true`, and `{phase: 123}` (a non-string
phase) as the `instance` argument, all against a valid context directory.
Every one of the seven produced the SAME violation, `"the verdict names no
phase, so the other reviews of the same work cannot be selected"`, i.e. a
non-empty `violations` array (FAIL), never a silent PASS. This is the exact
defect class the task description named from the previous phase (a check
that printed PASS on `{}`, `[]`, empty strings under both profiles); it does
not recur here. Calling `.run(instance, undefined)` (missing context) also
fails closed with `"no context directory was supplied"` rather than
throwing or defaulting to pass.

**"Never applicable on any head this repository has had" is true, and
verified independently of the implementer's own claim** rather than taken on
their word:

```
$ grep -rl '^kind: verdict' delivery/review/ | wc -l
0
```

(run against the repository under review, not the extracted package; this
is a fact about this repository's own history, not about the shipped
artifact.) Every file under `delivery/review/` in this repository is prose
markdown, never a `kind: verdict` YAML/JSON document, so the check has
genuinely never fired for real here. Combined with H-1 (the runner script
that would drive it against a real project is not shipped), the honest
statement is: this check's LOGIC is demonstrably correct on directly
constructed fixtures, both extremes tried, plus seven malformed shapes, but
it has zero record of firing against a real, organically-produced pair of
review verdicts anywhere, in this repository or (necessarily) anywhere
else, because no consumer can reach it through the documented path yet
either.

No-charter-directory behavior was also checked (a project not yet declaring
a delivery mode): reports `"... declares no delivery mode (no charter.yaml),
so the verdicts ... were NOT evaluated ..."` with EMPTY violations, i.e. a
REPORT not a FAIL, which is the correct "nothing to check here" outcome the
code's own comment says must be distinguishable from "everything checked and
fine" -- and it is, in this direct-call path. (It is NOT distinguishable
once routed through the missing `scripts/check-dual-review.mjs` and the
runner's precondition evaluator, which is H-1/H-2's point, not a
contradiction of this one: the LOGIC is honest, the WIRING to it for a real
consumer is not.)

## Verdict

**REQUEST CHANGES.**

Reasoning: Finding H-1 is a HIGH-severity, directly-demonstrated,
consumer-visible defect in two of the three artifacts this phase newly
ships or newly extends (`AGENTS.md`, `roles/implementer.md`). A consumer who
does exactly what those two documents themselves instruct -- install the
package, run `tiphys gates run --registry gate-registry.yaml --mode full`
-- gets a hard error on a `required` gate this phase adds
(`check-agents-references`) and a masked crash reported as a benign
`not-applicable` on a `conditional` gate this phase adds
(`check-dual-review`). This is not a matter of interpretation or of the
concurrent reviewer's acceptance-criteria lens; it is the literal, exact,
documented command, run against a real `npm install` of the real packed
tarball, twice, with captured evidence records both times.

The shipped CHECK LOGIC itself (`dualReviewDecorrelation`, Finding N-2) is
sound on every shape I tried: it fails closed on malformed and empty input,
correctly reddens an obviously correlated pair, correctly greens a
genuinely decorrelated pair, and correctly distinguishes "no delivery mode
declared" from a real failure. The defect is entirely in the WIRING a
consumer would need to reach that logic, which is Finding H-1, and which
predates this phase in its general shape (13 of 15 gates in the same
registry are equally unreachable, verified directly) but is what this
phase's two new, freshly-shipped-alongside artifacts actively instruct a
consumer to rely on.

What I did not reach: the acceptance-criteria walk (explicitly the
concurrent reviewer's job, not duplicated here), CI status on this head (
`gh`/`GH_TOKEN` unusable in this environment, not attempted), and exhaustive
fuzzing of `dualReviewDecorrelation` beyond the shapes listed in the "does
not cover" section at the top. Both stated as gaps, not silently assumed
covered.
