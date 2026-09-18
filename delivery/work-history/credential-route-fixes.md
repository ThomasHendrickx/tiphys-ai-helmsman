# Fix round: the audited credential route, CR-B-001 and CR-B-002

Branch `claude/credential-route-fixes`, cut from `main` at cbc34f1. Subject:
the clean-room retrospective review of group B, which is not on `main` and is
read with `git show origin/claude/review-gap-audit:delivery/review/clean-room-retro-B-criteria.md`.
The phase that shipped the route is M4-P8, delivery/work-history/m4-p8.md:1.

The branch name deliberately does not match `^claude/m[0-9]+-p[0-9]+-`: the
scope auditor derives a phase id from that pattern and would look for a
declaration that does not exist.

**TRANSLITERATION DECLARATION, read this before any capture below.** Node's
test reporter prints non-ASCII glyphs at the head of its summary and failure
lines, and this repository's authored bytes must be pure ASCII. Every captured
`node --test` block below is REAL OUTPUT with exactly the codepoints in this
table replaced, and nothing else in any capture is altered:

| codepoint | glyph name | rendered here as | occurrences replaced |
|---|---|---|---|
| U+2139 | information source | `i` at the start of a line | 24 |
| U+2716 | heavy multiplication x | `x` at the start of a line | 6 |
| U+2714 | heavy check mark | `v` at the start of a line | 12 |

Every replacement is a line-leading reporter glyph. Captures that are already
pure ASCII (the probe transcripts, the gate bundle, the shell transcripts) are
verbatim with nothing replaced.

## The two mechanisms, named before the findings

The fix-round contract's first item is to fix the MECHANISM rather than the
instance, so both are stated here and the rest of the document is organised
around them rather than around the two finding ids.

**MECHANISM 1 (CR-B-002). A REFUSAL PREDICATE THAT ONLY FIRES ON A
PRESENT-BUT-INVALID VALUE, LEAVING ABSENT UNCHECKED.** The finding is "an
allowlist extension with no reason is accepted". The mechanism is the shape of
the guard: `reason !== undefined && reason.trim().length === 0`. The first
conjunct is a PRESENCE test and the second is the VALIDITY test, so the guard
can only refuse a value that arrived. A field the contract calls mandatory and
the type system calls optional reaches it as `undefined` and is excused. The
repair is a positive validity predicate (`usable`) and an explicit decision
about `!usable`, which is the spelling this repository already uses where it
got this right.

**MECHANISM 2 (CR-B-001). A RECORD WHOSE STATUS WORD IS STRONGER THAN THE
CHECK BEHIND IT.** The finding is "an adapter that reverts HOME defeats the
handover check". The mechanism is that `status: "compared"` was written after
comparing ONE of the two properties that make a handover clean, and an
operator reads the word as covering both. The repair has two independent
halves, and this round does both: weaken the word so it can only say what was
checked, and strengthen the check so the other property is checked too.

Both mechanisms have the same parent, which this repository has paid for before
and named: **a guard whose condition does not test the property that matters is
green and worthless** (T-008's postscript, the red-witness rule one level up),
and **an unchecked assumption never becomes a green** (M2-C-3, quoted in the
kernel's own code at src/gates/adapters/migrations-command.ts:367).

## Derivation 1: every call site of mechanism 1

### What was run

Three commands, against the tree at `origin/main` (cbc34f1), BEFORE any edit in
this round, so every line number below is the dangerous state's. The scope is
the SHIPPED kernel: `src/`, `bin/` and `plugin/src/`. Full output follows each
command, not a summary.

The mechanism has several spellings and a single literal grep for
`!== undefined &&` is a starting point, not the answer. The three commands
cover, in order: a presence test conjoined with a validity test in any of its
type-guard spellings; a default substituted for a missing value where the
default is PERMISSIVE; and optional chaining feeding a comparison.

#### Command 1a, presence conjoined with validity

```
grep -rnE '(!== undefined|!== null|!= null|typeof [A-Za-z_.$]+ === "(string|number|object|boolean)") *&&' --include=*.ts src bin plugin/src
```

93 lines, all of them:

```
src/exec/env.ts:194:    if (reason !== undefined && reason.trim().length === 0) {
src/modes.ts:86:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/validate.ts:304:    if (typeof node === "object" && node !== null) {
src/model-resolution.ts:84:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/roles.ts:818:      if (element !== null && typeof element === "object" && !Array.isArray(element)) {
src/roles.ts:823:          if (Array.isArray(nested) || (nested !== null && typeof nested === "object")) {
src/roles.ts:836:  if (value !== null && typeof value === "object") {
src/roles.ts:839:      if (Array.isArray(nested) || (nested !== null && typeof nested === "object")) {
src/gates/citations.ts:505:    const hashValid = hashCaptured !== undefined && HASH_SHAPE.test(hashCaptured);
src/gates/citations.ts:515:      hashMalformed: hashCaptured !== undefined && !hashValid,
src/gates/citations.ts:1548:  process.argv[1] !== undefined &&
src/gates/scope.ts:1168:  process.argv[1] !== undefined &&
src/gates/credentials.ts:534:    env["HOME"] !== undefined && existsSync(env["HOME"]) ? env["HOME"] : undefined;
src/gates/run.ts:1312:  if (result.signal !== null && result.signal !== undefined) {
src/gates/run.ts:1583:  if (child.signal !== null && child.signal !== undefined) {
src/gates/run.ts:1679:  if (pinFailure !== undefined && claimed.status === "green") {
src/gates/validate.ts:170:  return typeof value === "object" && value !== null && !Array.isArray(value);
src/gates/validate.ts:236:  if (additional !== undefined && typeof additional !== "boolean") {
src/gates/validate.ts:242:  if (required !== undefined && !Array.isArray(required)) {
src/gates/validate.ts:246:  if (enumeration !== undefined && !Array.isArray(enumeration)) {
src/gates/validate.ts:250:  if (reference !== undefined && typeof reference !== "string") {
src/gates/coverage.ts:402:    if (failure !== undefined && !interrupted) {
src/gates/coverage.ts:706:  if (config.expectedUnits !== undefined && totalInventoryIds !== config.expectedUnits) {
src/gates/coverage.ts:1174:  process.argv[1] !== undefined &&
src/gates/merge-preconditions.ts:1138:if (entry !== undefined && pathsIdentifySameObject(fileURLToPath(import.meta.url), entry)) {
src/gates/suite.ts:456:    const skipped = point.skip !== undefined && point.skip !== false;
src/gates/suite.ts:457:    const todo = point.todo !== undefined && point.todo !== false;
src/gates/suite.ts:880:    if (value !== undefined && key !== "NODE_OPTIONS" && !key.startsWith("NODE_TEST")) {
src/gates/suite.ts:927:  if (child.signal !== null && child.signal !== undefined) {
src/gates/suite.ts:1162:  process.argv[1] !== undefined &&
src/gates/pin.ts:224:    if (start !== undefined && end === undefined) {
src/gates/adapters/http-json.ts:104:    if (typeof current === "object" && current !== null) {
src/gates/adapters/migrations-command.ts:85:    if (typeof current === "object" && current !== null) {
src/gates/adapters/migrations-command.ts:235:    const id = match !== null && match[1] !== undefined ? match[1] : name;
src/gates/adapters/migrations-command.ts:302:      if (checksum.found && typeof checksum.value === "string" && checksum.value !== "") {
src/gates/adapters/migrations-command.ts:331:    if (appliedEntry?.checksum !== undefined && appliedEntry.checksum !== entry.sha256) {
src/gates/gate-classes.ts:278:    if (typeof id === "string" && id !== "") {
src/gates/gate-classes.ts:315:  const hasStatus = typeof entry.status === "string" && entry.status !== "";
src/gates/gate-classes.ts:680:if (entry !== undefined && pathsIdentifySameObject(fileURLToPath(import.meta.url), entry)) {
src/gates/release.ts:690:      options.clock.maxAttempts !== undefined &&
src/gates/release.ts:741:  if (typeof created === "number" && Number.isFinite(created)) {
src/cutover.ts:136:  return typeof value === "string" && SWITCH_STATES.includes(value as SwitchState);
src/cutover.ts:140:  return typeof value === "string" && value.trim().length > 0;
src/cutover.ts:1160:  return typeof value === "string" && (DISPOSITIONS as readonly string[]).includes(value);
src/cutover.ts:1239:  if (run.signal !== null && run.signal !== undefined) {
src/exclusion.ts:291:    if (typeof existing === "string" && existing !== "") {
src/exclusion.ts:560:  if (previous !== undefined && previous.sha === sha && previous.counter === counter) {
src/exclusion.ts:823:  return typeof existing === "string" && existing !== "" ? existing : undefined;
src/exclusion.ts:955:  if (mine !== undefined && mine === status.envId) {
src/lock.ts:557:    ...(preflight.current !== undefined && state === "held" && !preflight.takingOver
src/lock.ts:677:  if (gate.kind === "on" && preflight !== undefined && preflight.kind === "proceed") {
src/lock.ts:795:  if (gate.kind === "on" && preflight !== undefined && preflight.kind === "proceed") {
src/lock.ts:890:  if (gate.kind === "on" && preflight !== undefined && preflight.kind === "proceed") {
src/pool.ts:155:      timeoutMs !== undefined &&
src/pool.ts:719:  return head !== undefined && head.status === 0 ? head.stdout.trim() : "missing";
src/pool.ts:1024:  if (record !== undefined && existsSync(record.project)) {
src/pool.ts:1097:        if (currentPath !== undefined && !pathsNameSameObject(currentPath, worktree)) {
src/plan.ts:121:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/checks.ts:105:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/checks.ts:2131:        typeof verifiedBy === "string" &&
src/checks.ts:4223:  return record !== undefined && REVIEW_FAMILIES_FIELD in record;
src/checks.ts:5210:    if (typeof writtenAt === "string" && typeof endedAt === "string") {
src/checklists.ts:78:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/watcher.ts:296:      typeof candidate.size === "number" &&
src/watcher.ts:297:      typeof candidate.mtimeMs === "number" &&
src/watcher.ts:511:    if (previous !== undefined && sameIdentity(previous, identity)) {
src/watcher.ts:522:    if (deadlineMs !== undefined && deadlineMs <= nowMs) {
src/watcher.ts:699:    if (previous !== undefined && sameIdentity(previous, identity)) {
src/watcher.ts:1018:      if (options.maxHeartbeats !== undefined && ticksThisRun >= options.maxHeartbeats) {
src/witness/run.ts:302:    if (hunk !== null && current !== undefined) {
src/witness/run.ts:897:  if (child.signal !== null && child.signal !== undefined) {
src/witness/run.ts:1076:        typeof deps === "object" && deps !== null && Object.keys(deps).length > 0;
src/witness/run.ts:1351:      if (diffFile !== undefined && shown.ok) {
src/commands/brief.ts:91:  return typeof value === "object" && value !== null && !Array.isArray(value)
src/commands/doctor.ts:271:      timeoutMs !== undefined &&
src/commands/doctor.ts:796:      if (typeof value === "string" && value !== "") {
src/commands/doctor.ts:811:      typeof identity === "object" && identity !== null
src/commands/doctor.ts:819:      projectRoot !== undefined && existsSync(projectRoot)
src/commands/doctor.ts:1602:      result.condition !== undefined &&
src/commands/watch.ts:146:  if (flags.maxHeartbeats !== undefined && flags.once) {
src/commands/sync.ts:127:      if (original !== undefined && original !== "") {
src/commands/gates.ts:156:  if (flags.manifest !== undefined && flags.registry !== undefined) {
src/commands/gates.ts:162:  if (flags.mode !== undefined && flags.registry === undefined) {
plugin/src/hooks/tool-call-observer.ts:137:    typeof record.payload === "object" && record.payload !== null
plugin/src/hooks/tool-call-observer.ts:198:  process.argv[1] !== undefined &&
plugin/src/hooks/project-write-block.ts:497:    !paths.every((entry) => typeof entry === "string" && entry !== "")
plugin/src/hooks/project-write-block.ts:583:    typeof input === "object" && input !== null && !Array.isArray(input)
plugin/src/hooks/project-write-block.ts:586:  if (typeof filePath === "string" && filePath !== "") {
plugin/src/hooks/project-write-block.ts:714:  process.argv[1] !== undefined &&
plugin/src/model-resolution.ts:194:  if (observation !== undefined && observation.kind === "unresolved") {
plugin/src/model-resolution.ts:197:  if (observation !== undefined && observation.kind === "observed") {
plugin/src/model-resolution.ts:346:    if (typeof model === "string" && model !== "") {
plugin/src/pr.ts:76:    if (value !== undefined && value !== "") {
```

#### Command 1b, a permissive default substituted for a missing value

```
grep -rnE '\?\? *(\[\]|\{\}|true)' --include=*.ts src bin plugin/src
```

The spelling matters and the narrowing is stated rather than assumed. The whole
`??` surface in `src/`, `bin/` and `plugin/src/` is 294 lines, and it splits by
what the default is: `?? ""` 126, `?? []` 33, `?? {}` 1, `?? 0` 19, `?? true` 0,
`?? false` 0. A FALSY default makes a validity test FAIL, which is the safe
direction for this mechanism: `(reason ?? "").trim().length > 0` refuses a
missing reason rather than excusing it. A PERMISSIVE default is the dangerous
one, because an empty list satisfies "every entry is valid" vacuously and an
empty object satisfies "no forbidden key is present". So the 126 + 19 falsy-
default sites are excluded BY REASONING, which is recorded here as a reasoned
exclusion rather than as a search that found nothing. The 34 permissive ones,
all of them:

```
src/exec/env.ts:299:  const refusal = refuseExtraAllowlist(spec.extraAllowlist ?? []);
src/exec/env.ts:314:    ...(spec.extraAllowlist ?? []).map(extensionName),
src/spawn.ts:327:  const extensionRefusal = refuseExtraAllowlist(options.extraAllowlist ?? []);
src/spawn.ts:1022:    extensions: (options.extraAllowlist ?? []).map((entry) => ({
src/spawn.ts:1077:          extraAllowlist: options.extraAllowlist ?? [],
src/validate.ts:610:  const entries = compiled.get(schema) ?? [];
src/validate.ts:704:    const metaErrors = ajv.errors ?? [];
src/validate.ts:755:  const errors = compilation.validator.errors ?? [];
src/roles.ts:661:  const selected = registry.gates.filter((gate) => (gate.modes ?? []).includes(mode));
src/gates/run.ts:672:  const required = new Set<RunParameter>(entry.parameters ?? []);
src/gates/run.ts:2085:    only: options.only ?? [],
src/gates/run.ts:2186:  const only = options.only ?? [];
src/gates/run.ts:2296:          declaredByChecklist: loaded.declaredByChecklist ?? [],
src/gates/coverage.ts:617:    const rows = byId.get(id) ?? [];
src/gates/coverage.ts:774:    const rows = byId.get(id) ?? [];
src/gates/merge-preconditions.ts:542:  const tokens = [...new Set((body.match(HEX_TOKEN) ?? []).map((token) => token.toLowerCase()))];
src/gates/merge-preconditions.ts:617:          (rule.parameters?.["required_status_checks"] as { context?: unknown }[] | undefined) ?? []
src/gates/merge-preconditions.ts:646:        (rule) => (rule.parameters?.["allowed_merge_methods"] as string[] | undefined) ?? [],
src/gates/release.ts:463:  const secrets = options.secrets ?? [];
src/gates/release.ts:678:        evidence: response.precondition?.evidence ?? [],
src/gates/release.ts:1063:  for (const credential of declared.credentials ?? []) {
src/tuition.ts:183:    for (const declaration of entry.mechanisms ?? []) {
src/status.ts:107:    refs: input.refs ?? [],
src/checks.ts:99:  return [check.type, ...(check.alsoTypes ?? [])];
src/checks.ts:4486:    observed.set(value.value, [...(observed.get(value.value) ?? []), candidate.path]);
src/checks.ts:4810:        counts.set(reading.value, [...(counts.get(reading.value) ?? []), candidate.path]);
src/commands/validate.ts:194:  return (COMPANION_TABLE.get(type) ?? []).map((companion) =>
src/commands/doctor.ts:770:      document = (decoded.value ?? {}) as Record<string, unknown>;
src/commands/doctor.ts:1502:        : `${entry.taskId} (unreconstructable: ${(entry.unresolved ?? []).join(", ")})`,
src/commands/cutover.ts:96:      const list = repeated.get(argument) ?? [];
src/commands/cutover.ts:232:  const roots = parsed.repeated.get("--root") ?? [];
src/commands/pool.ts:121:          marker = ` unreconstructable (unresolved: ${(entry.unresolved ?? []).join(", ")})`;
src/commands/gates.ts:203:  const declared = outcome.summary.declaredByChecklist ?? [];
plugin/src/status.ts:176:  for (const ref of emission.refs ?? []) {
```

#### Command 1c, optional chaining feeding a comparison

```
grep -rnE '\?\.[A-Za-z_.$()\[\]]*\s*(===|!==|==|!=|<|>|\.length|\.trim)' --include=*.ts src bin plugin/src
```

**ZERO lines.** That result is reported as what it is: the command found no
instance of that spelling, which is not the same as the spelling being absent
from the language. The one site where optional chaining DOES feed a refusal is
`src/gates/adapters/migrations-command.ts:331`, and it is written
`appliedEntry?.checksum !== undefined && ...`, so command 1a caught it and this
one did not. A reader should treat 1c as covered by 1a rather than as an
independent clean bill.

### What the derivation found, one row at a time

Every line above was classified by two questions. (a) Is it a REFUSAL or
VIOLATION predicate, or is it a type guard, a formatting branch or a loop
bound? (b) If it is a refusal, is the optional field one the contract makes
MANDATORY, with no separate arm elsewhere that handles its absence?

Only question (b) separates a defect from a correct optional field, and it is
the discriminator this round adds to the review's framing. `expectedUnits`
being absent means "no expectation was configured", which is a legitimate
state. `reason` being absent means "the entry broke a contract its own doc
comment states", which is not.

| site | refusal? | verdict |
|---|---|---|
| src/exec/env.ts:194 | yes | **DEFECT, fixed in this round.** `reason` is mandatory by the module's own doc comment ("every entry carries an exact name and a reason") and optional by the type. Absent was excused. |
| src/gates/adapters/migrations-command.ts:331 | yes | **SAME MECHANISM, ALREADY CLOSED, and it is the in-repo precedent.** An applied migration with no checksum would have been a silent id-only pass. The absent arm is a separate refusal at src/gates/adapters/migrations-command.ts:355, added as CR-P7H-2, which names the ids and cites M2-C-3. Its comment even names two structurally different members (a null checksum and an absent key), which is the rule this round follows. Nothing to do. |
| src/gates/adapters/migrations-command.ts:302 | yes | correct spelling already: a positive `checksum.found && typeof ... === "string" && !== ""` test, whose false arm sets `checksumAbsent`. This is the shape src/exec/env.ts:194 should always have had. |
| src/gates/validate.ts:236, :242, :246, :250 | yes | not a defect. These validate the TYPE of a JSON-schema keyword. An absent `additionalProperties`, `required`, `enum` or `$ref` is a legitimate schema, so absence is not a contract breach. |
| src/gates/coverage.ts:706 | yes (pushes a finding) | not a defect, and named because it is the closest call. An absent `expectedUnits` silently disables the CR-986 floor. That is config-optional by design and the comment above it says so; the floor exists BECAUSE nothing else can catch the case, and a config that states no expectation is stating one. |
| src/gates/run.ts:1679 | yes | not a defect. `pinFailure` absent means no pin failure occurred, which is the fact, not an omission. |
| src/checks.ts:2131 | selects rows for a check | not a defect, because absence is caught elsewhere. A registry gate with `verified-by: "<x>-checklist"` and no `probe` is skipped from the direction-1 walk, but `probe` is SCHEMA-REQUIRED exactly in that case (schemas/gate-registry.schema.json:104 states it, with `required: ["probe"]` in the conditional at schemas/gate-registry.schema.json:117), and src/commands/validate.ts prints schema diagnostics and returns nonzero BEFORE `runChecks` is reached. |
| src/checks.ts:5210 | yes | not a defect for the same reason. `writtenAt` and `turnEnd` are both in `required` at schemas/model-resolution.schema.json:13, so a document missing either is refused by the schema before this check is asked. |
| src/gates/release.ts:690, src/watcher.ts:522, src/watcher.ts:1018, src/pool.ts:155, src/commands/doctor.ts:271 | no | loop bounds and deadlines. An absent bound means unbounded, which is the documented meaning. |
| src/cutover.ts:140, src/gates/gate-classes.ts:315, src/exclusion.ts:291, src/exclusion.ts:823, src/commands/doctor.ts:796, plugin/src/hooks/project-write-block.ts:497, plugin/src/hooks/project-write-block.ts:586, plugin/src/model-resolution.ts:346 | yes | **the correct spelling, and they are the controls.** Each is a POSITIVE validity predicate, `typeof x === "string" && x !== ""`, whose false arm covers absent, blank and non-string together. plugin/src/hooks/project-write-block.ts:497 is the strongest form: `!paths.every((entry) => typeof entry === "string" && entry !== "")` refuses a list containing an absent entry. |
| everything else in 1a | no | type guards (`typeof value === "object" && value !== null`), signal checks, `process.argv[1]` entry-point guards, and identity comparisons. None decides whether something is refused. |
| src/exec/env.ts:299, src/spawn.ts:327, src/spawn.ts:1022, src/spawn.ts:1077, src/exec/env.ts:314 | 1b | the defect's own neighbourhood: `options.extraAllowlist ?? []`. An absent list genuinely means no extensions, so the default is correct here; the defect was never the list, it was the field inside an entry. |
| src/gates/merge-preconditions.ts:617, :646 | 1b, candidate | **NAMED AND NOT CLOSED.** A GitHub ruleset whose `parameters` are absent contributes no required contexts and no allowed merge methods, so a merge-precondition check over them could be satisfied vacuously by an absence. Judging it needs the whole gate's semantics and a real ruleset payload, which is a different surface from the credential route. Recorded here so it is not lost rather than folded into this round. |
| src/gates/release.ts:1063 | 1b | not a defect on the same reading as `extraAllowlist`: an absent `credentials` list in a release declaration means none were declared. |
| the remaining 1b lines | 1b | accumulator and formatting defaults (`byId.get(id) ?? []`, `ajv.errors ?? []`, `repeated.get(argument) ?? []`). None feeds a validity test. |

### What derivation 1 did NOT cover

**The reviewer's first check, so it is stated before any row above is worth
reading.**

1. **`test/` and `scripts/` are out of scope.** The mechanism matters where a
   REFUSAL is taken, and a test asserting the wrong thing is a different defect
   class with a different fix. A guard living only in a test would be missed.
2. **`bin/` contains one file and it matched nothing.** `bin/tiphys.ts` is a
   thin entry point; the command scope includes it and it contributed no lines,
   which is a true negative rather than an exclusion.
3. **SPELLINGS NO REGEX CAN SEE.** Three of them, each real:
   - a refusal delegated to a HELPER that returns a boolean, where the presence
     test lives inside the helper and the call site reads as a single predicate;
   - a refusal that is SKIPPED by an early `return` or a `continue` on an
     absent field, so the omission appears as control flow rather than as a
     conjunction (src/checks.ts:2123's `continue` is exactly this shape, and it
     was found by reading rather than by the grep);
   - a field whose absence is caught by a SCHEMA rather than by code, which is
     the right answer wherever it applies and is invisible to a source grep.
     Two of the classifications above rest on it and were checked by reading
     the schema, not by grepping.
4. **No dynamic analysis.** Nothing here observes which of these predicates a
   real run reaches. A predicate that is dead code and one that is load-bearing
   look identical to all three commands.
5. **One head, one day.** `origin/main` at cbc34f1. A site added after that is
   not in any output above.

## Derivation 2: every call site of mechanism 2

### What was run

The class is "a record field whose NAME or VALUE asserts that a verification
happened". Two commands, same scope and same head.

#### Command 2a, an assertive word assigned to a status-like field

```
grep -rnE '(status|mode|outcome|verdict|state|disposition|result|kind)\??:\s*"?(compared|verified|checked|validated|confirmed|scrubbed|audited|probed|reviewed|matched|satisfied|clean)' --include=*.ts src bin plugin/src
```

```
src/spawn.ts:355:    status: "compared",
src/task.ts:247:  status: "compared" | "unreported" | "not-applicable";
src/model-resolution.ts:80:  | { kind: "compared"; differ: boolean; families: [string, string] }
src/model-resolution.ts:354:    kind: "compared",
src/gates/credentials.ts:110:  outcome: "clean" | "resolvable" | "error";
src/gates/adapters/http-json.ts:330:      outcome: "satisfied",
src/gates/adapters/migrations-command.ts:406:    outcome: "satisfied",
src/gates/release.ts:188:  | { kind: "satisfied"; units: number; detail: string; resolved: unknown }
src/gates/release.ts:662:        kind: "satisfied",
```

#### Command 2b, every string-literal-union field in the shipped kernel

2a only sees the words guessed in advance, so 2b enumerates the whole
population that 2a samples from: every field whose declared type is a union of
string literals. 17 lines, all of them:

```
src/exec/env.ts:210:  kind: "directory" | "file";
src/task.ts:247:  status: "compared" | "unreported" | "not-applicable";
src/task.ts:270:  scrubMode: "scrubbed" | "inherited";
src/gates/credentials.ts:110:  outcome: "clean" | "resolvable" | "error";
src/gates/run.ts:184:  applicability: "required" | "conditional";
src/gates/run.ts:336:  applicability: "required" | "conditional";
src/gates/manifest.ts:68:  applicability: "required" | "conditional";
src/gates/suite.ts:154:  event: "test:pass" | "test:fail";
src/gates/suite.ts:160:  entityType: "test" | "suite";
src/gates/release.ts:713:  lastOutcome: "pending" | "absent",
src/gates/release.ts:765:  mode: "none" | "adapter";
src/gates/release.ts:990:  name: "deploy" | "migrations",
src/tuition.ts:61:    status: "proposed" | "applied" | "ticketed";
src/exclusion.ts:117:  state: "held" | "free";
src/exclusion.ts:749:  state: "held" | "free";
src/lock.ts:546:  state: "held" | "free",
src/commands/next.ts:235:  category: "task" | "worktree" | "branch";
```

#### Command 2c, a field whose NAME asserts a verification

```
grep -rnE '^\s*(readonly )?(verified|checked|validated|confirmed|compared|audited|scrubbed|asserted|observed|witnessed|proved|ensured)[A-Za-z]*\??\s*:' --include=*.ts src bin plugin/src
```

```
src/gates/coverage.ts:747:  checked: number;
src/gates/coverage.ts:804:    checked: inventoryIds.length,
src/gates/adapters/http-json.ts:153:    observedAt: new Date().toISOString(),
src/gates/adapters/migrations-command.ts:119:    observedAt: new Date().toISOString(),
src/gates/release.ts:157:  observedAt: string;
src/lock.ts:273:  observed: ObservedLease,
src/lock.ts:583:  observed?: ObservedLease;
src/lock.ts:716:  observed?: ObservedLease;
src/lock.ts:822:  observed?: ObservedLease;
src/witness/run.ts:171:  assertedPatterns: string[];
src/witness/run.ts:1507:    assertedPatterns: derivation.patterns,
src/commands/lock.ts:233:        observed: held?.observed,
src/commands/lock.ts:254:        observed: held?.observed,
src/commands/lock.ts:274:        observed: held?.observed,
```

### What the derivation found

**The class has TWO members and both are in the same record.** CR-B-001
predicted this in one sentence ("`status: "compared"` will not be the only
one") and the derivation confirms it, which is what makes this a class and not
a single site.

| site | verdict |
|---|---|
| src/task.ts:247 | **DEFECT, fixed.** `status: "compared"` written after comparing name sets only. |
| src/task.ts:270 | **SECOND MEMBER, fixed by weakening the word's documented meaning rather than by changing its values.** `scrubMode: "scrubbed"` is a strong word. What it records is that `allowPrCredentials !== true` and that `buildChildEnv` returned, which is the KERNEL'S CONSTRUCTION. It says nothing about what the child received, and between it being written and the payload starting there is an adapter. The two members are structurally different: one is a comparison's verdict that covered one of two properties, the other is a construction's verdict standing in for a delivery. Left as two values (there is no third state to add: the kernel either scrubbed or it did not) and its doc comment now states the boundary and points at `handover` for the property it does not cover. src/task.ts:349. |
| src/gates/credentials.ts:110 | not a defect. `outcome: "clean"` is a PROBE's verdict about the source it probed, and the gate's unit label is "credential sources probed", so the record already names the population. Its limit is the bounded source list, which src/gates/credentials.ts's own module comment states. |
| src/model-resolution.ts:80, :354 | not a defect. `kind: "compared"` there carries `differ` and `families` alongside it, so the record says what was compared and what the comparison found in the same object. |
| src/gates/adapters/http-json.ts:330, src/gates/adapters/migrations-command.ts:406, src/gates/release.ts:188, :662 | not a defect. `outcome: "satisfied"` is written with `units` and `resolved`, and the migrations adapter is the file that already refuses to write it when the requested comparison could not be made. |
| src/tuition.ts:61 | not a kernel-computed assertion. `status: "applied"` is an authored field in a tuition document, validated by schemas/tuition.schema.json, not a verdict the kernel reaches. |
| src/gates/coverage.ts:747, :804 | `checked: number` is a COUNT of what was checked, which is the honest form of this field. A count cannot over-assert the way a word can. |
| `observedAt`, `observed`, `assertedPatterns` | timestamps and payloads, not verdicts. `observed?: ObservedLease` is optional and its absence is read as "no lease was observed", which is the correct reading. |
| `applicability`, `event`, `entityType`, `state`, `category`, `mode`, `name`, `lastOutcome`, src/exec/env.ts:210 | not verification assertions. |

### What derivation 2 did NOT cover

1. **`test/` and `scripts/` again excluded**, for the same reason.
2. **A field whose ASSERTION LIVES IN PROSE rather than in its value.** A
   boolean named `ok`, or a record whose surrounding comment promises more than
   the code does, is invisible to all three commands. The M4-P4 module comment
   CR-B-004 refutes is exactly that shape, one module over, and it is not
   searchable.
3. **Free-string fields.** `detail`, `reason` and `refusal` carry sentences
   that can over-assert, and no regex can grade a sentence. Only fields with a
   CLOSED vocabulary or an asserting NAME were enumerated.
4. **Records this kernel does not write.** A schema document's own words (for
   instance a verdict document's `"APPROVE"`) are authored, not computed, and
   are a different question.
5. **One head, one day**, `origin/main` at cbc34f1.

## What was changed

| File | What |
|---|---|
| src/exec/env.ts | `ReasonRequirement`, the positive `usable` predicate in `refuseExtraAllowlist`, the second argument at both call sites, and the withdrawal of the false compile-time claim in `ChildEnvExtensionEntry`'s doc comment |
| src/spawn.ts | `reason-required` on the audited route, `RedirectionEvidence`, the rewritten `compareHandover`, `launchedRedirections` on the built-in adapter and on both payload-ran launch outcomes, the record built through the accessors, and the handover moved ahead of every arm-specific return |
| src/task.ts | the five-valued `status`, `changedRedirections`, `redirectionSource`, `reason?` on the extension record, and the `scrubMode` boundary |
| src/hooks.ts | the generated turn-end hook records the five credential-store pointers from inside the child |
| test/payload-credentials.test.ts | four new tests, two updated for the new status vocabulary |
| test/behaviors.json | four rows, appended |

### CR-B-002, the fix

`refuseExtraAllowlist` now takes a `ReasonRequirement` with NO DEFAULT
(src/exec/env.ts:157). A default would be the same mechanism one level up: an
omitted argument silently taking the permissive arm. The predicate is positive
(src/exec/env.ts:254), so absent, blank and non-string all reach the same
`!usable` arm and the refusal says which of the three it was. `spawnTask`'s
audited route passes `reason-required` (src/spawn.ts:340); `buildChildEnv`
passes `reason-optional`, because it is the pre-M4-P8 library seam whose own
documented bare-string form the kernel's tests use, and because nothing reaches
it in production without passing the audited route first.

The record half is separate and is the reason `{}` appeared in the review's
capture: `credentialRecord.extensions` was built from `entry.name` and
`entry.reason`, which are `undefined` on a string. It is now built through
`extensionName` and `extensionReason` (src/spawn.ts:1146), and an absent reason
is recorded as an ABSENT KEY rather than defaulted to `""`, because a blank
reason and a missing one are different facts.

**A third structural member was found that the review did not report, and it is
worse than the two it did.** An entry whose `reason` is present and is NOT a
string (`{name: "VERCEL_TOKEN", reason: 7}`, the shape a JavaScript plugin
produces from a mistyped config) reaches `reason.trim()` on `main` and THROWS
an uncaught `TypeError` out of `spawnTask`. The capture is in the red-witness
section. The positive predicate closes it as a refusal rather than as a crash.

### CR-B-001, the fix, and the choice the brief asked to be reasoned about

The brief asks for both obvious fixes to be weighed rather than one picked
silently. **Both were taken, and here is what each buys.**

**Weakening the word costs nothing and asserts correctly, and it is not
sufficient.** A status that says `names-compared` stops the record from lying.
It does not stop the adapter: the child still reads the real gh credential
store, the spawn still succeeds, and an operator who reads the record correctly
learns only that one property was checked. The hazard M4-P8 names is "a
credential reaches a project payload and no artifact says so", and this half
fixes the second clause only.

**Strengthening the check closes the hole and needs a source of truth.** Three
were available:

1. **The adapter reports its pointer values.** Cheapest, and it is the adapter's
   word about its own behaviour, so an adapter that mutates and does not
   disclose is not caught. Implemented as the FALLBACK
   (`launchedRedirections`, src/spawn.ts:720).
2. **The child reports them.** The turn-end hook is written BY THE KERNEL
   (src/hooks.ts:64) and the documented contract launches it in the SAME
   environment as the payload, which the built-in adapter does and M2R-004
   edit 4 records as required. So a mutation now has to be applied to the
   payload and NOT to the hook: two children, two environments. Implemented as
   the PREFERRED source, and the record says which one it used
   (`redirectionSource`, src/task.ts:317).
3. **A salted hash of values.** Rejected. It buys the same discrimination as
   (2) for names whose values the kernel already knows, and for those five the
   kernel knows the expected value exactly, so a hash adds a step and a secret
   to manage for no extra property. It would matter for a name whose value the
   kernel must not learn, and there is no such name in this comparison.

**No credential material enters the record, which is the constraint the
original design was protecting, and it is still intact.** `changedRedirections`
carries NAMES ONLY (src/task.ts:309). The comparison is done on values and the
values are discarded.

**One value does move into a file that was not carrying it: the turn-end
record.** The child writes the observed pointer paths there so the kernel can
compare them. Those are filesystem PATHS, not secrets, and the record already
sits in the task directory the operator reads. It is called out here rather than
left to be discovered.

### CR-B-003, judged and closed as part of mechanism 2

The brief asks whether the mechanism work closes the two mediums. **CR-B-003 is
closed and it is a member of mechanism 2**, one step further along: a record
whose status word is stronger than its check, and a record that is ABSENT where
a check was owed, are the same defect in what the artifact asserts. The
comparison now runs immediately after the launch arm is known to be one where
the payload RAN, and `meta.json` is rewritten before every arm-specific return
(src/spawn.ts:1325). `LaunchOutcome`'s `incomplete` arm gained
`launchedEnvNames` and `launchedRedirections` so an adapter that could not
confirm completion can still report what it launched with.

The `launch-failed` arm is deliberately NOT included: nothing ran there and the
rollback removes the task directory, so there is no record to write to.

### CR-B-004, judged and NOT closed

**Different mechanism, different surface, and an owner question inside it.** It
is about module resolution in `src/adapters/load.ts`, where a path-shaped
`--adapter` specifier evaluates project-clone code in the orchestrator process.
Nothing in mechanism 1 or 2 touches it: no refusal predicate there excuses an
absent value, and no record there over-asserts. The review's own proposed fix
ends "If the owner decides an operator-typed absolute specifier should stay
allowed", which is a decision this round has no standing to take. Left for its
own round, with the review's measurement standing.

### CR-B-005, judged and NOT closed

The egress flag on `meta.json` is a reading aid on a decision that is already
recorded and that the review explicitly does not reopen. It is a one-line
addition and it is not a member of either mechanism; adding it here would be
scope taken because it was nearby, which is the habit the fix-round contract
exists to replace with a derivation.

## The M4-P8 work history argued this away, and the argument was wrong

delivery/work-history/m4-p8.md:621, item 8 of that phase's not-covered section,
records half of CR-B-002 and then closes it:

> The audited route cannot produce one: `SpawnOptions.extraAllowlist` is typed
> to the object form and a string does not typecheck there.

Three things about that sentence, stated here so the next reader does not have
to rediscover them.

1. **It is refuted by measurement**, twice by the clean-room reviewer and again
   by this round before anything was edited. The capture is below.
2. **It is a compile-time argument about a runtime seam, and the SAME PHASE
   rejected that argument one field over.** `payloadClass` is a runtime check
   precisely because, in that phase's own words in
   test/payload-credentials.test.ts, "the consumer that reaches this seam is a
   JavaScript plugin, and a missing field there is `undefined`, not a compile
   error". That is true of `reason` for identical reasons. The phase held the
   right principle and did not apply it to the adjacent field.
3. **The binding claim grep did not catch it, and the reason is one word.** The
   grep's vocabulary carries `cannot be`; the sentence says `cannot produce`.
   The single-word alternatives (`never`, `always`, `impossible`) are immune to
   this; the two-word ones are not. That is a gap in the word list rather than
   in the phase, and the review named it first.

The false claim is also withdrawn where it was originally written, in
`ChildEnvExtensionEntry`'s doc comment in src/exec/env.ts, rather than only
here: a prose claim a probe refutes is how the next reader re-derives the
defect.

## Red witnesses

Each fix is demonstrated RED against the DANGEROUS STATE and green with the
fix, and each class is reddened by at least TWO structurally different members.

**The dangerous state is a real tree, not a mutation.** It is a copy of this
branch's clone with `git checkout origin/main -- src/` applied, so `src/` is
exactly `main` at cbc34f1 and `test/` is this branch's. Where a member is
witnessed by a probe rather than by a test, the probe drives the REAL
`spawnTask` against a REAL scratch fleet created by `tiphys init`, with a real
git upstream, a real clone and a real payload, and every assertion below is on
a file THE CHILD WROTE (`scripts/credential-witness.mjs`, M4-P8's child-side
probe) or on `meta.json`, never on a value read in the parent.

**Why the per-member probes exist alongside the tests.** A `node --test` test
stops at its first failing assertion, so running the new tests against the
dangerous state reddens on member 1 and says nothing about member 2. The probes
run every member to completion in one transcript, which is what makes "one
witness is not a class" checkable rather than asserted.

### Mechanism 1, three red members and two green controls

`node probe/members.mjs <tree>`, one line per member. `VERCEL_TOKEN` is set in
the parent to a write-capable value, the payload class is `project`, and the
child column is read out of the file the child wrote.

Against the DANGEROUS STATE (`src/` at origin/main):

```
bare string                        ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{}]
object, reason property absent     ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN"}]
object, reason not a string        THREW    | TypeError: reason.trim is not a function
object, reason blank (control)     refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
object, real reason (control)      ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN","reason":"the deploy step publishes a preview build"}]
```

With the fix:

```
bare string                        refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
object, reason property absent     refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
object, reason not a string        refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
object, reason blank (control)     refused  | child VERCEL_TOKEN: undefined | record extensions: undefined
object, real reason (control)      ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN","reason":"the deploy step publishes a preview build"}]
```

**The three red members are structurally different and reach `undefined` by
three different routes**: a string has no `reason` property that could exist,
an object has the property slot and leaves it unset, and a non-string value is
present and unusable. **The two green controls are what stop the fix from being
satisfied by a guard that refuses everything**: the blank-reason arm was already
refused before this round and still is, and the real-reason arm still crosses
into the child and still reaches `meta.json` verbatim.

**The record half is isolated with ONE variable changed.** With the whole fix
in place and only the audited route's argument flipped from `reason-required`
to `reason-optional`, so the bare string is accepted again and the accessors
are the only difference from `main`:

```
bare string                        ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN"}]
object, reason property absent     ACCEPTED | child VERCEL_TOKEN: "write-capable-deploy-token" | record extensions: [{"name":"VERCEL_TOKEN"}]
```

`[{}]` on `main`, `[{"name":"VERCEL_TOKEN"}]` here. The operator who opens the
task directory now learns WHICH name was widened. **This is the one change in
the round that has no independent red witness through the audited route**, and
the reason is stated rather than hidden: once the refusal lands, the shape that
loses the name is unreachable there, so the accessors are defence in depth and
the defanged run above is the only way to see them work.

### Mechanism 2, two red members and a green control

`node probe/pointers.mjs <tree>`. The adapter is HONEST: it reports the name set
it truly launched with, byte-identical to the kernel's, and changes only
pointer VALUES.

Against the DANGEROUS STATE:

```
1 HOME+XDG reverted, pointers disclosed   spawn ok: true
   meta.handover : {"status":"compared","added":[],"removed":[]}
   child HOME    : "/tmp/crb001-JRU3t6/real-home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-JRU3t6/fleet/tasks/p1/scrub-env/gitconfig-global"
   child verdict : "red"
   child gh probe: {"source":"gh-configuration","outcome":"resolvable","detail":"credential store reachable from inside the child environment: /tmp/crb001-JRU3t6/real-home/.config/gh/hosts.yml (45 bytes), /tmp/crb001-JRU3t6/real-home/.config/gh/hosts.yml (45 bytes)"}
2 GIT_CONFIG_GLOBAL reverted, undisclosed spawn ok: true
   meta.handover : {"status":"compared","added":[],"removed":[]}
   child HOME    : "/tmp/crb001-JRU3t6/fleet/tasks/p2/scrub-env/home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-JRU3t6/real-gitconfig"
   child verdict : "red"
   child gh probe: {"source":"gh-configuration","outcome":"clean","detail":"no populated store at /tmp/crb001-JRU3t6/fleet/tasks/p2/scrub-env/gh-config/hosts.yml, /tmp/crb001-JRU3t6/fleet/tasks/p2/scrub-env/xdg-config/gh/hosts.yml, /tmp/crb001-JRU3t6/fleet/tasks/p2/scrub-env/home/.config/gh/hosts.yml; no gh binary on the child PATH, so no CLI resolution path exists either"}
3 honest adapter (green control)          spawn ok: true
   meta.handover : {"status":"compared","added":[],"removed":[]}
   child HOME    : "/tmp/crb001-JRU3t6/fleet/tasks/p3/scrub-env/home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-JRU3t6/fleet/tasks/p3/scrub-env/gitconfig-global"
   child verdict : "green"
   child gh probe: {"source":"gh-configuration","outcome":"clean","detail":"no populated store at /tmp/crb001-JRU3t6/fleet/tasks/p3/scrub-env/gh-config/hosts.yml, /tmp/crb001-JRU3t6/fleet/tasks/p3/scrub-env/xdg-config/gh/hosts.yml, /tmp/crb001-JRU3t6/fleet/tasks/p3/scrub-env/home/.config/gh/hosts.yml; no gh binary on the child PATH, so no CLI resolution path exists either"}
```

**Member 2's child verdict is red on the GIT side, and its gh probe is clean.**
That is the two members being different rather than the same one twice: the
store each reaches is a different store.

**Read the three `meta.handover` lines together. They are byte-identical, and
two of the three children are red.** That is mechanism 2 in one capture: the
record cannot distinguish a clean handover from a defeated one, and it asserts
`compared` for all three.

With the fix:

```
1 HOME+XDG reverted, pointers disclosed   spawn ok: false
   meta.handover : {"status":"compared","added":[],"removed":[],"changedRedirections":["HOME","XDG_CONFIG_HOME"],"redirectionSource":"child"}
   child HOME    : "/tmp/crb001-V6XJcA/real-home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-V6XJcA/fleet/tasks/p1/scrub-env/gitconfig-global"
   child verdict : "red"
   child gh probe: {"source":"gh-configuration","outcome":"resolvable","detail":"credential store reachable from inside the child environment: /tmp/crb001-V6XJcA/real-home/.config/gh/hosts.yml (45 bytes), /tmp/crb001-V6XJcA/real-home/.config/gh/hosts.yml (45 bytes)"}
2 GIT_CONFIG_GLOBAL reverted, undisclosed spawn ok: false
   meta.handover : {"status":"compared","added":[],"removed":[],"changedRedirections":["GIT_CONFIG_GLOBAL"],"redirectionSource":"child"}
   child HOME    : "/tmp/crb001-V6XJcA/fleet/tasks/p2/scrub-env/home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-V6XJcA/real-gitconfig"
   child verdict : "red"
   child gh probe: {"source":"gh-configuration","outcome":"clean","detail":"no populated store at /tmp/crb001-V6XJcA/fleet/tasks/p2/scrub-env/gh-config/hosts.yml, /tmp/crb001-V6XJcA/fleet/tasks/p2/scrub-env/xdg-config/gh/hosts.yml, /tmp/crb001-V6XJcA/fleet/tasks/p2/scrub-env/home/.config/gh/hosts.yml; no gh binary on the child PATH, so no CLI resolution path exists either"}
3 honest adapter (green control)          spawn ok: true
   meta.handover : {"status":"compared","added":[],"removed":[],"changedRedirections":[],"redirectionSource":"child"}
   child HOME    : "/tmp/crb001-V6XJcA/fleet/tasks/p3/scrub-env/home"
   child GIT_CONFIG_GLOBAL: "/tmp/crb001-V6XJcA/fleet/tasks/p3/scrub-env/gitconfig-global"
   child verdict : "green"
   child gh probe: {"source":"gh-configuration","outcome":"clean","detail":"no populated store at /tmp/crb001-V6XJcA/fleet/tasks/p3/scrub-env/gh-config/hosts.yml, /tmp/crb001-V6XJcA/fleet/tasks/p3/scrub-env/xdg-config/gh/hosts.yml, /tmp/crb001-V6XJcA/fleet/tasks/p3/scrub-env/home/.config/gh/hosts.yml; no gh binary on the child PATH, so no CLI resolution path exists either"}
```

**The two scratch fleets are different temporary directories** (`crb001-JRU3t6`
and `crb001-V6XJcA`), because each run creates its own with `mkdtemp`. The
paths differ between the two blocks for that reason and for no other.

**The two members are structurally different on three axes**, which is the
answer to the brief's warning that two adapters both swapping HOME would be one
member twice:

| | member 1 | member 2 |
|---|---|---|
| pointer kind | DIRECTORY (`HOME`, `XDG_CONFIG_HOME`) | FILE (`GIT_CONFIG_GLOBAL`) |
| credential store | the gh configuration store | the git global configuration |
| what the adapter discloses | its own pointer values | NOTHING, so only the child-written record can catch it |

Member 2 is the one that proves the child-written half is load-bearing: the
adapter reports no pointers at all, and `redirectionSource: "child"` says where
the evidence came from.

### CR-B-003, two red arms and a green control

`node probe/arms.mjs <tree>`. The same widening (`LEAKED_SECRET`) on each arm
where the payload ran.

Against the DANGEROUS STATE:

```
arm incomplete                    spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[]}
   child LEAKED_SECRET: "leaked-from-parent"
arm completed, precondition fails spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[]}
   child LEAKED_SECRET: "leaked-from-parent"
arm completed, evidence ok        spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],"handover":{"status":"compared","added":["LEAKED_SECRET"],"removed":[]},"refusal":"the completed-widening-adapter adapter launched with an environment that differs from the one the kernel handed it; added LEAKED_SECRET"}
   child LEAKED_SECRET: "leaked-from-parent"
```

With the fix:

```
arm incomplete                    spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],"handover":{"status":"compared","added":["LEAKED_SECRET"],"removed":[],"changedRedirections":[],"redirectionSource":"child"},"refusal":"the incomplete-widening-adapter adapter launched with an environment that differs from the one the kernel handed it; added LEAKED_SECRET"}
   child LEAKED_SECRET: "leaked-from-parent"
arm completed, precondition fails spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],"handover":{"status":"names-compared","added":["LEAKED_SECRET"],"removed":[],"changedRedirections":[]},"refusal":"the noevidence-widening-adapter adapter launched with an environment that differs from the one the kernel handed it; added LEAKED_SECRET"}
   child LEAKED_SECRET: "leaked-from-parent"
arm completed, evidence ok        spawn ok: false
   meta.credentials: {"payloadClass":"project","scrubMode":"scrubbed","extensions":[],"handover":{"status":"compared","added":["LEAKED_SECRET"],"removed":[],"changedRedirections":[],"redirectionSource":"child"},"refusal":"the completed-widening-adapter adapter launched with an environment that differs from the one the kernel handed it; added LEAKED_SECRET"}
   child LEAKED_SECRET: "leaked-from-parent"
```

The second arm also witnesses `names-compared` from a real spawn: its turn-end
record was deleted, so there is no child-written pointer evidence and the status
word drops to the one property that WAS checked instead of claiming both.

### The same members, as shipped tests

The four new tests carry the same members, so the redness is in the suite rather
than only in this document. Against the DANGEROUS STATE, member 1 of each:

**TWO ALTERATIONS IN THE NEXT TWO BLOCKS, DECLARED BEFORE THEM.** The command
was `node --test --test-name-pattern '<pattern>' test/payload-credentials.test.ts
2>&1 | grep -vE '^\s*$'`, so BLANK LINES ARE REMOVED by that pipe and nothing
else is. Separately, the absolute scratch prefix
`file:///tmp/claude-0/-home-user/<session>/scratchpad/fix-credential-route` is
rendered `<lab>` in the stack frames, because the full path is 88 characters of
scratch location that says nothing about the failure. Line-leading reporter
glyphs are transliterated per the declaration at the top of this file.

```
x the audited route refuses an allowlist extension whose reason is absent, in two structurally different forms, and creates nothing (615.208708ms)
i tests 1
i suites 0
i pass 0
i fail 1
i cancelled 0
i skipped 0
i todo 0
i duration_ms 780.063384
x failing tests:
test at test/payload-credentials.test.ts:885:1
x the audited route refuses an allowlist extension whose reason is absent, in two structurally different forms, and creates nothing (615.208708ms)
  AssertionError [ERR_ASSERTION]: expected a refusal and got a success
  true !== false
      at reasonOf (<lab>/defang/test/payload-credentials.test.ts:251:10)
      at TestContext.<anonymous> (<lab>/defang/test/payload-credentials.test.ts:921:24)
      at async Test.run (node:internal/test_runner/test:1404:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

```
x a spawn refuses an adapter that keeps the name set identical and restores a credential-store pointer, in two structurally different forms (643.474828ms)
i tests 1
i suites 0
i pass 0
i fail 1
i cancelled 0
i skipped 0
i todo 0
i duration_ms 806.384262
x failing tests:
test at test/payload-credentials.test.ts:1025:1
x a spawn refuses an adapter that keeps the name set identical and restores a credential-store pointer, in two structurally different forms (643.474828ms)
  AssertionError [ERR_ASSERTION]: expected a refusal and got a success
  true !== false
      at reasonOf (<lab>/defang/test/payload-credentials.test.ts:251:10)
      at TestContext.<anonymous> (<lab>/defang/test/payload-credentials.test.ts:1099:24)
      at async Test.run (node:internal/test_runner/test:1404:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

Both stop at member 1, which is exactly why the per-member probes above exist:
a failing assertion ends the test, so the shipped tests alone cannot show that
member 2 is also red.

With the fix, the whole file:

```
v spawnTask refuses the credential escape hatch on a project payload, naming both fields, and accepts it on an orchestrator payload (613.137722ms)
v spawnTask refuses a spawn that declares no payload class and creates nothing (390.567296ms)
v buildChildEnv refuses an allowlist extension naming a gh token variable and one naming a code-execution variable, each reason naming the entry (0.989925ms)
v an allowlist extension with a blank reason is refused naming the entry, and the same entry with a reason reaches meta.json verbatim (477.721997ms)
v the child-written credential probe reddens against an adapter that widens the environment after the kernel handed it over (868.799624ms)
v a spawn refuses when the adapter reports launching with a different environment name set than the kernel handed it (730.470652ms)
v the refused-extension vocabulary resolves whichever of the kernel and the gate module is imported first (225.691362ms)
v compareHandover distinguishes a compared handover from an unreported one and from one there was never anything to compare (0.446702ms)
v the audited route refuses an allowlist extension whose reason is absent, in two structurally different forms, and creates nothing (568.728869ms)
v refuseExtraAllowlist refuses an absent reason only where the caller declares one is required, and refuses a blank one on both (0.412412ms)
v a spawn refuses an adapter that keeps the name set identical and restores a credential-store pointer, in two structurally different forms (945.538108ms)
v the handover comparison is recorded in meta.json on the incomplete arm and on the failed-completion-precondition arm (521.348108ms)
i tests 12
i suites 0
i pass 12
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 5534.004727
```

### Two existing assertions changed, and why that is not the fix being written to fit

Two assertions in `test/payload-credentials.test.ts` were updated rather than
left, and both are expectations about the STATUS VOCABULARY that this round
deliberately changes:

- the `handover-silent` arm expected `unreported` and now expects
  `pointers-compared`. This is a STRENGTHENING: the kernel-written hook now
  gives pointer evidence even when the adapter reports nothing, so one of the
  two properties is checked where none was before.
- `compareHandover`'s unit test expected `compared` for a names-only
  comparison, which is the exact sentence CR-B-001 says is wrong.

Neither touches what is REFUSED. Every arm that was refused before is still
refused, which the whole-file run above shows: the six pre-existing tests all
pass unchanged.

## Suite

**The complete sentence.** Interpreter node **v26.6.0**, from
`/tmp/claude-0/n26/bin/node`, with `node --version` run in the shell that ran
the suite. `dist/` **built**: `npm ci` exit 0, `npm run build` exit 0
immediately before, and `git status --porcelain` afterwards listing only the
six files this round modifies and nothing generated. Invocation **`npm test`**,
which package.json expands to `node --test "test/**/*.test.ts"`. Result:

```
i tests 1302
i suites 0
i pass 1302
i fail 0
i cancelled 0
i skipped 0
i todo 0
i duration_ms 332934.909215
NPM_TEST_EXIT=0
```

**1302 pass and ZERO SKIPPED.** The skipped count is quoted deliberately, per
standing warning 12: a bare "exit 0" does not distinguish a passing test from a
skipped one, and this repository has paid three times for an unexplained suite
count. The base at cbc34f1 reports 1298 with the same interpreter, build state
and invocation; the difference is the four tests this round adds.

## Gate results

## Claim grep

## What this round did NOT cover

A reviewer's first check for the round as a whole, distinct from the two
per-derivation sections above.

1. **CR-B-004 and CR-B-005 are open**, judged above with reasons.
2. **The boundary is still environment-only.** M4-P8's own item 1 stands
   unchanged: a scrubbed child runs at the same uid and keeps READ access to an
   absolute credential path outside `$HOME`. Nothing here should be read as
   saying a project payload cannot reach a credential by some other route. It
   says the ENVIRONMENT route is audited, and now that two of its properties are
   checked rather than one.
3. **An adapter that launches the hook and the payload in DIFFERENT
   environments is not caught.** The child-written observation raises the cost
   from free to two children with two environments, and it does not make the
   act impossible. The record says `redirectionSource: "child"`, which is a
   statement about where the observation came from, not a claim that the
   adapter was honest.
4. **Only the five `CREDENTIAL_STORE_REDIRECTIONS` are compared by value.** A
   name the kernel hands over whose VALUE the adapter alters, `PATH` for
   instance, is still invisible to the comparison. Extending it would need a
   rule for which names carry credential material, which is a design question
   and not a repair.
5. **`meta.json` is still unvalidated.** The `credentials` record has a
   TypeScript shape and no schema, so `changedRedirections` and
   `redirectionSource` are as unverifiable to a foreign reader as the fields
   beside them.
6. **No witness spec was added under `witness/`.** The red witnesses for the
   new behaviour are the captures above and the four registered tests.
7. **The merge-precondition `?? []` candidate named in derivation 1 is not
   closed**, and is recorded there rather than carried silently.
8. **One platform, one interpreter, one day.** Linux, node v26.6.0, in this
   container. Nothing was measured on macOS or on a second runner.
