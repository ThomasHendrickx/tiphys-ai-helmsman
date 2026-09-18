# Work history: the credential, adapter-loading and task-record slice of the
# DR-0047 final approval sweep fix round

- branch: `claude/sweep-fix-credential-adapters`
- files this agent was given: src/exec/env.ts, src/gates/credentials.ts,
  src/spawn.ts, src/task.ts, src/adapters/load.ts, src/hooks.ts, plus `test/**`
  and this document.
- findings assigned: CH-001 / CR-F-CRED-003 / CR-F-CRED-004 (one high and two
  lows, one mechanism), CR-F-CRED-002 / CH-002 (medium), CR-F-CRED-001
  (medium), CR-F02 (medium).
- decisions implemented, not re-litigated: DR-0048.
- no pull request was opened and nothing was merged.

## 0. Environment, stated before any number below is read

Clone of `/home/user/tiphys-ai-helmsman` at
`/tmp/claude-0/-home-user/.../scratchpad/fix-credential-adapters/clone`, branch
cut from `origin/main`. `/tmp/claude-0/n26/bin` first on PATH; `node --version`
was checked in the shell that ran each command and reported **v26.6.0** every
time.

The complete suite sentence, and the two suite runs it took, are in section 7.
Nothing below is quoted from memory: every number has the command that produced
it beside it.

## 1. The four mechanisms, one line each, before any instance

The fix-round contract binds and its first item is the one this round was most
at risk of failing, because three of the four findings arrived with a named
instance attached.

| finding | the INSTANCE reported | the MECHANISM fixed |
|---|---|---|
| CH-001, CR-F-CRED-003, CR-F-CRED-004 | `HTTPS_PROXY` (and `SSH_AUTH_SOCK`) crosses the audited route | a refusal predicate that names a HAND-PICKED SUBSET of the vocabularies that exist, so adding a vocabulary leaves every consumer's coverage unchanged and silent |
| CR-F-CRED-002, CH-002 | `./projects/demo/evil.mjs` evaluates project code in the orchestrator process | a constraint that holds for ONE INPUT SHAPE (a bare specifier), documented as holding for the module |
| CR-F-CRED-001 | `redirectionSource: "child"` on a record the adapter wrote | a record whose STATUS WORD is stronger than the check behind it |
| CR-F02 | a truncated `meta.json` counted as no task | a category that is empty BY CONSTRUCTION reported as a category that is empty BY OBSERVATION |

Section 2 takes each in turn: the mechanism, the derivation that enumerates
every site of it, what the derivation did NOT cover, and the repair.

## 2. Mechanism 1: a refusal that walks a hand-picked subset of the vocabularies

### 2.1 What was decided and what was not

DR-0048 is DECIDED and this round implements it rather than reasoning about it
again. Its operative sentence: the audited route refuses any allowlist
extension naming a member of the egress vocabulary, on the same footing as the
gh-token and dangerous vocabularies it already walked.

DR-0048 explicitly left `SSH_AUTH_SOCK` open for the round that can run the
ssh(1) walk. Section 2.5 decides it, says which way, and says plainly which
half of the basis is unverified.

### 2.2 The derivation

The mechanism is not "one name was forgotten". It is that the module owning the
vocabularies could gain a new one and no consumer's coverage would change. So
the derivation enumerates EVERY vocabulary constant, EVERY membership predicate
and EVERY reference to either, across `src/`, `bin/` and `plugin/src/`.

```
$ grep -rnE 'VOCABULARY|_VARIABLES|isDangerousEnvName|isEgressEnvName|refusedEnvVocabulary|GH_TOKEN_VARIABLES' src/ bin/ plugin/src/
```

Its FULL output, taken AFTER the repair so the wiring is visible, is in section
2.3. Read as a table of consumers, the pre-repair state was:

| consumer | vocabularies consulted | complete |
|---|---|---|
| `probeCredentialSources` (the gate's environment tripwire) | 3 of 3 | yes |
| `refuseExtraAllowlist` (the audited route) | 2 of 3 | NO |

Two consumers, and the one that REFUSES was the short one. That asymmetry is
the finding, and it is the reason the repair is a registry rather than a third
`if`: a third `if` restores the count today and restores nothing about the next
vocabulary.

Four constants matched `_VOCABULARY` or `_VARIABLES` outside this family and
were examined and EXCLUDED with a reason, because a derivation that silently
drops rows returns an empty result indistinguishable from an absence:

- `AUTHORING_VOCABULARY` (src/validate.ts:111) is the JSON Schema keyword set.
- `SEVERITY_VOCABULARY` and `VERDICT_VOCABULARY` (src/checks.ts:4878 and
  src/checks.ts:4898) are review-document word lists.
- `VOCABULARY_ID` / `VOCABULARY_VERSION` in `plugin/src/vocabulary.ts` are a
  model-family vocabulary identity, not environment names.

None of the four is a set of environment variable names, so none belongs in a
child-environment refusal. The repair's drift test is scoped to the exports of
`src/gates/credentials.ts` for exactly that reason, which is stated in the test
rather than left to be inferred.

### 2.3 The derivation output, in full

Re-run at the repaired head. Every line is reproduced; nothing is elided.

```
src/exec/env.ts:3:import { refusedEnvVocabulary } from "../gates/credentials.ts";
src/exec/env.ts:171: * ONE VOCABULARY, NOT TWO. `refusedEnvVocabulary`
src/exec/env.ts:193: * Until this round the guard read two literal arms, `GH_TOKEN_VARIABLES` and
src/exec/env.ts:194: * `isDangerousEnvName`. src/gates/credentials.ts held a THIRD vocabulary,
src/exec/env.ts:195: * `EGRESS_ENV_VOCABULARY`, added by M4-P29 after that container measured
src/exec/env.ts:206: * declared list of its own vocabularies, through `refusedEnvVocabulary`. A
src/exec/env.ts:208: * test/payload-credentials.test.ts reddens on a `*_VOCABULARY` or
src/exec/env.ts:209: * `*_VARIABLES` export with no row.
src/exec/env.ts:265:    const refusedBy = refusedEnvVocabulary(name);
src/validate.ts:104: * THE DECLARED AUTHORING VOCABULARY (DR-0013 clause 7), documented in
src/validate.ts:111:export const AUTHORING_VOCABULARY: readonly string[] = [
src/model-resolution.ts:182: * 3. THE VOCABULARY IDENTITY, because a family token with no vocabulary is a
src/gates/credentials.ts:53: *     (GH_TOKEN_VARIABLES).
src/gates/credentials.ts:56: *     ssh(1), node(1) and bash(1) document (DANGEROUS_ENV_VOCABULARY;
src/gates/credentials.ts:63: * scrubbed child. The walk is `EGRESS_ENV_VOCABULARY` below; read its
src/gates/credentials.ts:115: * THIS VOCABULARY IS NOW READ BY THE KERNEL AS WELL AS BY THIS GATE
src/gates/credentials.ts:118: * `src/exec/env.ts` imports `GH_TOKEN_VARIABLES` and `isDangerousEnvName`
src/gates/credentials.ts:129: * constants, the pattern and `isDangerousEnvName` are byte-identical to
src/gates/credentials.ts:138:export const GH_TOKEN_VARIABLES: readonly string[] = [
src/gates/credentials.ts:163: *                         are matched by isDangerousEnvName's pattern.
src/gates/credentials.ts:202:export const DANGEROUS_ENV_VOCABULARY: readonly string[] = [
src/gates/credentials.ts:217: * THE EGRESS VOCABULARY (M4-P29, and this comment is the record of why it
src/gates/credentials.ts:245: * M4-P29 kept these names out of `DANGEROUS_ENV_VOCABULARY` so that a data
src/gates/credentials.ts:255: * `isDangerousEnvName` is still byte-for-byte what it was. What changed is
src/gates/credentials.ts:278: * `DANGEROUS_ENV_VOCABULARY` above.
src/gates/credentials.ts:285:export const EGRESS_ENV_VOCABULARY: readonly string[] = [
src/gates/credentials.ts:297:export function isEgressEnvName(name: string): boolean {
src/gates/credentials.ts:298:  return EGRESS_ENV_VOCABULARY.includes(name);
src/gates/credentials.ts:310:export function isDangerousEnvName(name: string): boolean {
src/gates/credentials.ts:312:    DANGEROUS_ENV_VOCABULARY.includes(name) ||
src/gates/credentials.ts:333: * EVERY VOCABULARY A CHILD-ENVIRONMENT REFUSAL MUST WALK, IN ONE PLACE.
src/gates/credentials.ts:338: * `GH_TOKEN_VARIABLES` and `isDangerousEnvName` as two literal `if` arms and
src/gates/credentials.ts:339: * therefore could not see `EGRESS_ENV_VOCABULARY`, which this module had held
src/gates/credentials.ts:349: * if a `*_VOCABULARY` or `*_VARIABLES` export of this module has NO row,
src/gates/credentials.ts:360:    constantName: "GH_TOKEN_VARIABLES",
src/gates/credentials.ts:361:    includes: (name) => GH_TOKEN_VARIABLES.includes(name),
src/gates/credentials.ts:369:    constantName: "DANGEROUS_ENV_VOCABULARY",
src/gates/credentials.ts:370:    includes: isDangerousEnvName,
src/gates/credentials.ts:377:    constantName: "EGRESS_ENV_VOCABULARY",
src/gates/credentials.ts:378:    includes: isEgressEnvName,
src/gates/credentials.ts:393:export function refusedEnvVocabulary(name: string): RefusedEnvVocabulary | undefined {
src/gates/credentials.ts:488:  const tokens = names.filter((name) => GH_TOKEN_VARIABLES.includes(name));
src/gates/credentials.ts:489:  const dangerous = names.filter((name) => isDangerousEnvName(name));
src/gates/credentials.ts:490:  const egress = names.filter((name) => isEgressEnvName(name));
src/gates/merge-preconditions.ts:185: * ROW STATUS IS THE SAME FOUR-WORD VOCABULARY MINUS `not-applicable`.
src/gates/result.ts:11: * THE STATUS VOCABULARY IS FOUR WORDS AND THEY ARE NOT INTERCHANGEABLE.
src/gates/adapters/http-json.ts:19: * NO FAILURE VOCABULARY (plan step 2). The configuration names ONE
src/gates/gate-classes.ts:25: * THE GATE CLASS VOCABULARY (kernel plan M4, M4-P14; DR-0029 part 2a; R-041).
src/gates/release.ts:55: * NO FAILURE VOCABULARY SHIPS (plan step 2, T-003 lesson 4). No
src/checks.ts:1871: * of `AUTHORING_VOCABULARY` (src/validate.ts:111). No other permitted keyword
src/checks.ts:4878:const SEVERITY_VOCABULARY: readonly string[] = ["low", "medium", "high", "critical"];
src/checks.ts:4898:const VERDICT_VOCABULARY: readonly string[] = ["APPROVE", "FIX-ROUND-NEEDED"];
src/checks.ts:5026:        if (!VERDICT_VOCABULARY.includes(raw)) {
src/checks.ts:5029:            message: `${candidate.path} declares verdict ${raw}, which is not one of the two words the closed vocabulary admits (${VERDICT_VOCABULARY.join(", ")}), so it cannot be read as an authorisation however it is spelled`,
src/checks.ts:5105:    if (!SEVERITY_VOCABULARY.includes(severity.value)) {
src/checks.ts:5108:        message: `${candidate.path} ranks finding ${named} ${severity.value}, which is not one of the four severities the kernel's vocabulary admits (${SEVERITY_VOCABULARY.join(", ")}), so whether it blocks the merge could not be established`,
plugin/src/vocabulary.ts:2: * THE FAMILY VOCABULARY, AND THIS FILE IS WHERE A VENDOR NAME IS ALLOWED TO BE
plugin/src/vocabulary.ts:32:export const VOCABULARY_ID = "claude-code-model-families";
plugin/src/vocabulary.ts:35:export const VOCABULARY_VERSION = 1;
plugin/src/vocabulary.ts:44:  return { id: VOCABULARY_ID, version: VOCABULARY_VERSION };
```

### 2.4 What the derivation did NOT cover

The reviewer's first check is this item, so it is stated as a list of gaps
rather than as reassurance.

1. **It is a grep over identifiers, so a vocabulary spelled differently is
   invisible to it.** A future list named, say, `FORBIDDEN_CHILD_NAMES` matches
   no alternative in the pattern. The repair's drift test closes this at run
   time for `src/gates/credentials.ts` only: it reads the module's OWN exports
   and reddens on any array-of-strings export whose name ends `_VOCABULARY` or
   `_VARIABLES` that has no registry row. A vocabulary in a DIFFERENT module,
   or one named outside that suffix pair, is outside both the grep and the
   test. That residue is real and it is smaller than what was there before.
2. **It covers this repository only.** The kernel is a package other projects
   call, and a consumer's own vocabulary is outside every command here.
   DR-0048's own derivation recorded the same limit.
3. **It says nothing about the DEFAULT allowlist.** `refuseExtraAllowlist`
   governs EXTENSIONS. A dangerous name added to `DEFAULT_CHILD_ENV_ALLOWLIST`
   is a different path, guarded by the gate's allowlist-independent tripwires,
   and this round did not re-derive that half.
4. **It does not establish that the three vocabularies are COMPLETE.** Both
   list comments say so themselves: these are bounded denylists and the
   allowlist is the real defence. Nothing here widens that claim.
5. **`buildChildEnv`'s `reason-optional` seam.** DR-0048 scopes the decision to
   the audited route and leaves that seam's REASON requirement alone. The NAME
   refusal was already unconditional across both requirements before this round
   and stays unconditional, so an egress name is refused on both. That is a
   consequence of where the check sits, it is declared here rather than
   discovered, and the test asserts both requirements.

### 2.5 `SSH_AUTH_SOCK`, decided, with the unverified half named

**Decision: it goes into `DANGEROUS_ENV_VOCABULARY`, and the per-name comment
says the documentation half was not read.**

What was MEASURED here, in this container:

```
$ node -e 'import("./src/exec/env.ts").then((m)=>{ ... })'   # pre-repair head
SSH_AUTH_SOCK   ACCEPTED        (reported by both sweep reviewers)
```

and DR-0048 records that `buildChildEnv`'s default child carries seven names,
`SSH_AUTH_SOCK` not among them. So refusing an extension naming it withdraws
nothing the default grants, which is the same argument that made the egress
half incomparable rather than a trade.

What could NOT be verified, and it is half the basis:

```
$ command -v ssh; ssh -V; man 1 ssh | head -1
(no output from command -v; no ssh binary; no manual page)
```

The ssh(1) ENVIRONMENT section was NOT read, so the claim that the published
walk covers this name is not established by this round either. The row
therefore rests on capability reasoning, which is stated in the source comment
so a later reader can check it: the agent socket is a SIGNING channel, and the
vocabulary already refuses `SSH_ASKPASS`, which is a passphrase PROMPT and the
weaker of the two. A round on a machine with the manual page should confirm the
row from ssh(1) or move it and say why.

**One consequence worth naming rather than leaving to be found.** The constant
is also the `credential-scrub` gate's tripwire, so a child environment carrying
`SSH_AUTH_SOCK` now reddens that probe. The gate probes what `buildChildEnv`
returned, which does not carry the name, so this changes no green today. The
full suite in section 7 is the check on that.

### 2.6 The repair

- src/gates/credentials.ts gains `REFUSED_CHILD_ENV_VOCABULARIES`, a declared
  array of every vocabulary in the module with its membership predicate and its
  refusal clause, plus `refusedEnvVocabulary(name)`.
- src/exec/env.ts stops naming `GH_TOKEN_VARIABLES` and `isDangerousEnvName` as
  two literal arms and consults the array instead.
- `SSH_AUTH_SOCK` joins `DANGEROUS_ENV_VOCABULARY`.
- M4-P29's "WHY A SEPARATE LIST" paragraph is amended in place rather than
  deleted: its reasoning about a data edit having a side effect in another
  module was right for its phase, and what changed is the answer to the
  question it routed onward.

## 3. Mechanism 2: a constraint that holds for one input shape, documented as
holding for the module

### 3.1 The mechanism

`createRequire(<fleet home>/package.json)` roots the `node_modules` WALK at the
fleet home. The project clone sits BELOW the fleet home, so no such walk reaches
it, and M4-P4 criterion 2's witness exercises exactly that shape. A PATH-shaped
specifier does not use that walk at all: it walks the tree the rooting chose,
and `<fleet>/projects/` is a subdirectory of that tree. The module comment
generalised the bare-specifier property to the whole module, which is how the
next reader re-derives the defect.

### 3.2 The derivation

The question the mechanism asks is: where else does a caller-supplied specifier
reach module resolution or evaluation inside the kernel process?

```
$ grep -rnE 'createRequire|require\.resolve|await import\(|import\(pathToFileURL|new Function|eval\(' src/ bin/ plugin/src/
```

Its FULL output:

```
src/validate.ts:45:import { createRequire } from "node:module";
src/validate.ts:68: * IMPORTED. `createRequire` defers the resolution to the first schema
src/validate.ts:73:const requireDependency = createRequire(import.meta.url);
src/checks.ts:31:import { createRequire } from "node:module";
src/checks.ts:954: * before the condition it exists to exercise can happen. `createRequire` defers
src/checks.ts:957:const requireDependency = createRequire(import.meta.url);
src/adapters/load.ts:2:import { createRequire } from "node:module";
src/adapters/load.ts:14: * this module exists rather than a one-line `await import(specifier)` at the
src/adapters/load.ts:27: * module or at `process.cwd()`. A plain `await import(specifier)` resolves
src/adapters/load.ts:41: * `createRequire` walks the fleet home and its PARENTS looking for
src/adapters/load.ts:61: *     `createRequire`'s parent walk legitimately finds a hoisted
src/adapters/load.ts:203: * `createRequire(<fleet home>/package.json)` is the rooting. Every lookup it
src/adapters/load.ts:220: * AN OVERSIGHT. `require.resolve` applies an `exports` map under the
src/adapters/load.ts:319:  const requireFromFleet = createRequire(fleet.packageJsonPath);
src/adapters/load.ts:341:    module = await import(pathToFileURL(resolved).href);
plugin/src/status.ts:3:import { createRequire } from "node:module";
plugin/src/status.ts:99:  const resolve = createRequire(import.meta.url);
```

Four `createRequire` sites and one dynamic `import`. The second command settles
what each one resolves, because a `createRequire` whose argument is a literal is
not this mechanism:

```
$ grep -rn 'requireDependency(\|resolve(' src/validate.ts src/checks.ts plugin/src/status.ts
src/validate.ts:85:  return requireDependency("ajv/dist/2020.js") as AjvModule;
src/validate.ts:89:  return requireDependency("yaml") as YamlModule;
src/checks.ts:960:  return requireDependency("commonmark") as CommonMarkModule;
plugin/src/status.ts:102:    manifestPath = resolve.resolve("@tiphys/kernel/package.json");
plugin/src/status.ts:112:    declared = resolve(manifestPath) as unknown;
```

Every one of those five is a LITERAL specifier for a kernel dependency, rooted
at `import.meta.url`, with no caller input reaching it. `plugin/src/status.ts`
resolves a literal and then requires the path it resolved, so the input is still
the literal.

**So `src/adapters/load.ts` is the only site in `src/`, `bin/` or `plugin/src/`
where a caller-supplied specifier reaches module resolution, and it is the one
the finding names.** That is a result of the derivation rather than a premise of
it: the round looked for siblings and the enumeration above is the record that
none were found, which is a different sentence from not having looked.

### 3.3 What the derivation did NOT cover

1. **It is a grep over five spellings.** `module.createRequire(...)` accessed
   off a namespace import, a dynamic `import()` built from a template whose
   text does not contain `pathToFileURL`, or a spawned child process that
   imports something, are outside it. The third of those is real: the kernel
   spawns payloads constantly, and a payload importing project code is the
   DESIGN, not a defect, because it runs in a scrubbed child rather than in the
   orchestrator process. The mechanism here is specifically about the
   orchestrator's OWN process.
2. **It does not cover `scripts/`, `test/` or the workflows**, which are
   harness rather than shipped kernel, and which this file list does not own.
3. **It says nothing about what happens after a specifier resolves INSIDE the
   fleet home.** The module comment declared that residue before this round and
   still declares it: this moves the boundary to the fleet home for every
   specifier shape, it does not defend inside it.
4. **Symlinks were handled but not exhaustively probed.** The repair resolves
   both the candidate and the two roots with `realpathSync`, so a symlink
   planted in the fleet home pointing into `projects/` is judged by its real
   target. A path component that becomes a symlink between the check and the
   `import` is a time-of-check to time-of-use gap that this round did not close
   and did not measure.

### 3.4 The repair

`refuseResolvedAdapterPath` runs between `requireFromFleet.resolve` and the
`import`, so a refused module is not evaluated, and it judges the RESOLVED REAL
PATH rather than the specifier's spelling. Two rules, because the finding has
two halves:

- a resolved path inside `<fleet>/projects/` is refused whatever the specifier's
  shape;
- a PATH-shaped specifier resolving outside the fleet home is refused.

A BARE specifier is exempt from the second rule only, and the reason is in the
source: `createRequire`'s parent walk legitimately finds a hoisted
`node_modules` above the fleet home, and refusing that would break an ordinary
install rather than a hazard. The module comment is narrowed in the same commit,
which is the half of the finding that is about the comment.

## 4. Mechanism 3: a record whose status word is stronger than the check behind it

### 4.1 The cost sentence at src/hooks.ts, refuted rather than softened

The round was asked to refute or confirm the sentence that stood at
src/hooks.ts:46. It read: an adapter that quietly reverted `HOME` for the
payload "has to revert it for the payload and NOT for the hook, which means
launching two children with two different environments and is a substantially
different act from passing a mutated copy once".

**CONFIRMED REFUTED, and the witness is in the suite rather than in prose.**
test/payload-credentials.test.ts carries `record-writing-reverter`, an adapter
that spawns ONE child with the mutated environment and then does a single
`writeFileSync` of the turn-end path. Measured through a real `spawnTask`:

```
spawn ok: true
meta.credentials.handover.changedRedirections: []
CHILD-written witness report, env HOME: <the reverted real home>
```

Two children is one way to do it and it is the expensive way. One child plus one
`writeFileSync` is strictly LESS work than the honest path, because the honest
path also spawns the hook. The sentence is withdrawn from the source and
replaced by an account of what the hook does and does not establish.

### 4.2 The nonce was considered and REFUSED, with the premise measured

The reviewer offered two repairs: (a) a per-task nonce baked into the generated
hook and required in the record, or (b) withdrawing the provenance claim and
renaming the value. This round takes (b) and declines (a), and the reason is a
property of the trust model rather than a preference.

The adapter is HANDED `hookPath` (src/spawn.ts:1236 in the reviewed head). The
generated hook is a readable file in a directory the adapter must be able to
read in order to invoke the hook at all, at the same uid, on the same
filesystem. A secret baked into that file is readable by the party it is meant
to exclude, so a nonce moves the forgery from "know the path" to "read the
file" and no further. A guard whose condition the adversary satisfies by
reading one file is green and worthless, which is this repository's own
recorded shape. The test asserts the PREMISE, which is the readability of the
generated hook and the fact that it names its own output path as a literal, so
the refusal is checkable rather than argued.

**What (a) would buy, said plainly so the arbitration can disagree.** A nonce
would catch an adapter that forges the record WITHOUT reading the hook, which is
a real class of accident and a real class of lazy attacker. It would not catch
the measured adversary. Buying tamper-EVIDENCE while the record's word claims
tamper-RESISTANCE is the same substitution one layer along, so this round
changes the word first. A later round may add the nonce on top; it would not
then be standing in for a guarantee.

### 4.3 The derivation

The mechanism is a record field whose VALUE asserts more than the check that
produced it. So the derivation enumerates every field in shipped source whose
value names a source, an observer or a provenance.

```
$ grep -rnE '^[^*/]*\b(source|Source|provenance|observedBy|reportedBy|origin|witnessedBy)\??:' src/ bin/ plugin/src/
```

Its FULL output:

```
src/spawn.ts:353:  source: "turn-end-record" | "adapter";
src/spawn.ts:366:  source: CredentialHandoverRecord["redirectionSource"],
src/spawn.ts:1325:      return { source: "turn-end-record", values: evidence.observed };
src/spawn.ts:1328:      return { source: "adapter", values: outcome.launchedRedirections };
src/model-resolution.ts:75:  | { kind: "accepted"; family: string | undefined; provenance: string }
src/model-resolution.ts:300:  return { kind: "accepted", family, provenance: provenance };
src/gates/credentials.ts:109:  source: string;
src/gates/credentials.ts:408:function probe(source: string, outcome: SourceProbe["outcome"], detail: string): SourceProbe {
src/gates/credentials.ts:413:function fileProbe(source: string, paths: string[]): SourceProbe {
src/tuition.ts:77:  source: string;
src/tuition.ts:203:        source: entry.id,
src/pool.ts:708:  origin: PoolEntryOrigin;
src/pool.ts:753:    entries.push({ taskId, headSha: headShaOf(fleet, taskId), origin: "record" });
src/pool.ts:782:        ? { taskId, headSha: headShaOf(fleet, taskId), origin: "reconstructed" }
src/pool.ts:786:            origin: "unreconstructable",
src/checks.ts:3026:  source: VerdictCorpusSource;
src/checks.ts:3074:export function describeVerdictCorpusSource(source: VerdictCorpusSource): string {
src/checks.ts:3090:export function describeContextDocumentSource(source: VerdictCorpusSource): string {
src/checks.ts:3145:  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
src/checks.ts:3177:  const source: VerdictCorpusSource = {
src/checks.ts:3323:  source: VerdictCorpusSource,
src/checks.ts:3382:  source: VerdictCorpusSource,
src/checks.ts:3412:  source: VerdictCorpusSource,
src/checks.ts:3521:  const source: VerdictCorpusSource = {
src/checks.ts:3969:  source: VerdictCorpusSource,
src/checks.ts:4125:  source: VerdictCorpusSource = resolveCorpusSource(contextDirectory),
src/checks.ts:4126:): { document: string; source: VerdictCorpusSource; reason: string } | undefined {
src/checks.ts:4185:      provenance: ReviewFamiliesProvenance;
src/checks.ts:4279:  const provenance: ReviewFamiliesProvenance = {
src/checks.ts:4360:export function reviewFamiliesProvenanceLine(provenance: ReviewFamiliesProvenance): string {
src/checklists.ts:54:  source: string;
src/checklists.ts:109:  source: string,
src/checklists.ts:170:export function readChecklistFile(path: string, source: string): Read<Checklist> {
src/adapters/load.ts:115:  | { ok: true; adapter: ExecutorAdapter | undefined; origin: string }
src/adapters/load.ts:287:  origin: string,
src/adapters/load.ts:317:  origin: string,
src/adapters/load.ts:379:  origin: string,
src/adapters/load.ts:482:    return { ok: true, adapter: undefined, origin: "the built-in default" };
src/witness/spec.ts:53:  provenance: string;
src/witness/spec.ts:214:      provenance: consumes.provenance,
src/witness/run.ts:173:  captures?: Array<{ path: string; sha256: string; provenance: string }>;
src/witness/run.ts:518:  source: string,
src/witness/run.ts:567:  source: string,
src/witness/run.ts:1536:          provenance: spec.consumesExternalOutput.provenance,
src/commands/sync.ts:137:  source: string;
plugin/src/model-resolution.ts:84:  | { kind: "observed"; source: string; model: string; detail: string }
plugin/src/model-resolution.ts:130:    provenance: "observed",
plugin/src/model-resolution.ts:195:    return { vocabulary, provenance: "unresolved", reason: observation.reason };
plugin/src/model-resolution.ts:202:        provenance: "unresolved",
plugin/src/model-resolution.ts:213:      provenance: "observed",
plugin/src/model-resolution.ts:215:        source: observation.source,
plugin/src/model-resolution.ts:226:      provenance: "unresolved",
plugin/src/model-resolution.ts:236:      provenance: "unresolved",
plugin/src/model-resolution.ts:243:  return { vocabulary, family, model, provenance: "self-reported" };
plugin/src/model-resolution.ts:395:    source: `transcript:${transcriptPath}`,
```

Judged row by row, and the judgement is recorded because an enumeration with no
verdict is a list rather than a derivation:

- **src/spawn.ts:353, :1325, :1328** are the finding. `"child"` named a party;
  it is now `"turn-end-record"`, which names the artifact. `"adapter"` already
  named the artifact's author accurately and is unchanged.
- **src/pool.ts:708 and its three values** (`record`, `reconstructed`,
  `unreconstructable`) name how the entry was derived, not who observed it. No
  change owed, and that file belongs to another implementer this round.
- **src/gates/credentials.ts:109 / :408 / :413** is the probe's own name.
- **src/tuition.ts:203** is an entry id. **src/checklists.ts** and
  **src/commands/sync.ts** are file paths.
- **src/checks.ts** `VerdictCorpusSource` and `ReviewFamiliesProvenance`
  describe which documents a check read, and each carries the path.
- **plugin/src/model-resolution.ts:130, :213, :243** is the nearest structural
  neighbour and was examined rather than waved past. `provenance: "observed"`
  ships WITH an `observation.source` of the form `transcript:<path>`, so the
  record names the artifact it read alongside the word, and
  `provenance: "self-reported"` is the weaker value for the other arm. It does
  not repeat the shape. That module is outside this round's file list either
  way, and this paragraph is the record of the check rather than a change.

### 4.4 What the derivation did NOT cover

1. **It matches identifier NAMES, so a provenance-shaped claim carried in a
   free-text `detail` or `reason` string is invisible to it.** Those exist
   (`src/gates/credentials.ts`'s probe details are exactly that shape) and this
   round did not audit them.
2. **It does not reach the STATUS words**, only the source words. The handover
   record's `status` values (`compared`, `names-compared`, `pointers-compared`,
   `unreported`, `not-applicable`) were read and left alone: `compared` says a
   comparison happened, which it did, and the value that over-claimed was the
   source. A full audit of every status vocabulary against the check behind it
   is a larger job than this round, and it is the job the mechanism implies.
3. **It covers shipped source only**, not `schemas/`, `roles/` or the JSON
   documents the kernel writes. `meta.json` has no schema at this head, which
   the sweep's criteria reviewer recorded independently.
4. **Nothing here makes a dishonest adapter detectable.** That residue was
   declared before this round and is declared after it. What changed is that
   the record stops asserting the opposite.

### 4.5 The repair

`redirectionSource` becomes `"turn-end-record" | "adapter"`; the refusal
sentence renders the source through a phrase function instead of concatenating
`-side` onto a bare value; `CredentialHandoverRecord` in src/task.ts states that
the turn-end record is adapter-reachable; src/hooks.ts carries the withdrawal
and the nonce refusal. Four existing assertions in
test/payload-credentials.test.ts that pinned the string `"child"` were updated,
which is the test-edit a phase owes when it changes a record's vocabulary.

## 5. Mechanism 4: empty by construction reported as empty by observation

### 5.1 What M4-P24 did, and why this round is upstream of it

delivery/work-history/m4-p24.md records the same mechanism found inside the
command written to prevent T-036: `src/commands/next.ts`'s first walk recorded
an item only when the record read AND said `open`, with no else arm, so a task
directory whose `meta.json` did not read landed in neither `items` nor
`unknown`. That round fixed the walk and wrote the reason into the source,
naming all four causes that collapse into one value.

It did NOT fix the collapse. `readTaskMeta` still returned `undefined` for an
absent file, an unreadable one, an unparseable one and one that fails the field
check, so every other consumer inherited the same four-into-one narrowing and
had to decide for itself whether to treat it as an absence.

### 5.2 The derivation

Two commands. The first enumerates every consumer of the task record; the
second enumerates the wider family, which is every reader of a fleet-state file
that goes through the one delivered read.

```
$ grep -rn 'readTaskMeta\|classifyTaskMeta' src/ bin/ plugin/src/
```

```
src/task.ts:415: *   every spawn from M4-P8 on writes it, and `readTaskMeta` deliberately
src/task.ts:519: * WHY THIS IS A SEPARATE FUNCTION FROM `readTaskMeta` RATHER THAN ITS NEW
src/task.ts:521: * type of `readTaskMeta` is the shape this repair wants, and it is a
src/task.ts:525: * `readTaskMeta` is documented as the deliberate NARROWING of it, and the
src/task.ts:529:export function classifyTaskMeta(fleet: Fleet, taskId: string): TaskMetaRead {
src/task.ts:574: * THIS IS A DELIBERATE NARROWING OF `classifyTaskMeta` AND THE COLLAPSE IS THE
src/task.ts:579: * is in flight must call `classifyTaskMeta` instead; a caller that REFUSES on
src/task.ts:582:export function readTaskMeta(fleet: Fleet, taskId: string): TaskMeta | undefined {
src/task.ts:583:  const read = classifyTaskMeta(fleet, taskId);
src/liveness.ts:4:import { classifyEntry, readRegularFileIfPresent, readTaskMeta } from "./task.ts";
src/liveness.ts:329: *   The ordering is enforced INSIDE readTaskMeta (src/task.ts), not in
src/liveness.ts:332: *   readTaskMeta exposed; src/teardown.ts is one, and a named pipe at a
src/liveness.ts:336: *   beside readTaskMeta. That reason was wrong: moving the probe INTO
src/liveness.ts:337: *   readTaskMeta is still exactly one implementation of "read a task
src/liveness.ts:421:    const meta = readTaskMeta(fleet, id);
src/pool.ts:12:import { metaPath, readTaskMeta } from "./task.ts";
src/pool.ts:425:  const meta = readTaskMeta(fleet, taskId);
src/pool.ts:768:    const meta = readTaskMeta(fleet, taskId);
src/commands/next.ts:9:import { readTaskMeta, singleLine } from "../task.ts";
src/commands/next.ts:285: * FOUR CAUSES COLLAPSE INTO ONE VALUE AND THE MESSAGE SAYS SO. `readTaskMeta`
src/commands/next.ts:320:    const meta = readTaskMeta(fleet, id);
src/teardown.ts:16:  readTaskMeta,
src/teardown.ts:255:  const meta = readTaskMeta(fleet, taskId);
```

Five call sites, judged one by one:

| site | what it does with `undefined` | is that the mechanism |
|---|---|---|
| src/liveness.ts:421 | pushes the id onto `unreadable` | NO. It also pre-classifies with `classifyEntry` and continues on `absent` BEFORE the call, so the two are already apart at that site. |
| src/pool.ts:425 | returns `kind: "absent"` with the reason "no readable task meta" | YES. A truncated record is reported as an absence to every caller of `reconstructPoolRecord`. |
| src/pool.ts:768 | `continue`, so the task is omitted from the listing entirely | YES, and it is the louder of the two: the entry does not appear at all. |
| src/commands/next.ts:320 | pushes onto `unknown` with a message naming all four causes | NO. This is M4-P24's repair. |
| src/teardown.ts:255 | refuses the teardown with a reason | NO in effect. It fails closed on all four, so no caller acts on a false absence. Its reason sentence does conflate them, which is a wording gap and not a wrong action. |

**The two YES rows are in `src/pool.ts`, which this round's file list does not
own: another implementer holds that file in the same batched round.** So this
round fixes `readTaskMeta` itself, which is upstream of both, and says so here
as the dispatch asked. Section 8 escalates the two sites by name.

The second command is the wider family, because "a read that collapses absence
into failure" is not a property of the task record:

```
$ grep -rn 'readRegularFileIfPresent' src/ bin/ plugin/src/
```

Its FULL output:

```
src/spawn.ts:23:  readRegularFileIfPresent,
src/spawn.ts:775: * The read goes through `readRegularFileIfPresent` rather than
src/spawn.ts:792:  const read = readRegularFileIfPresent(path);
src/task.ts:179:export function readRegularFileIfPresent(path: string): RegularRead {
src/task.ts:531:  const read = readRegularFileIfPresent(path);
src/model-resolution.ts:3:import { readRegularFileIfPresent, taskDir } from "./task.ts";
src/model-resolution.ts:109: * THE READ GOES THROUGH `readRegularFileIfPresent`, which is M2-C-6 and the
src/model-resolution.ts:117:  const read = readRegularFileIfPresent(path);
src/roles.ts:45:import { classifyEntry, readRegularFileIfPresent } from "./task.ts";
src/roles.ts:141:    const read = readRegularFileIfPresent(path);
src/gates/citations.ts:9:  readRegularFileIfPresent,
src/gates/citations.ts:92: * through the delivered `classifyEntry`/`readRegularFileIfPresent` from
src/gates/citations.ts:257:    const read = readRegularFileIfPresent(path);
src/gates/citations.ts:797:    const read = readRegularFileIfPresent(join(repoRoot, path));
src/gates/citations.ts:1042:    const read = readRegularFileIfPresent(join(repoRoot, path));
src/gates/scope.ts:9:  readRegularFileIfPresent,
src/gates/scope.ts:99: * `readRegularFileIfPresent`, the same pattern src/gates/manifest.ts uses
src/gates/scope.ts:202:  const read = readRegularFileIfPresent(path);
src/gates/credentials.ts:11:  readRegularFileIfPresent,
src/gates/credentials.ts:419:    const read = readRegularFileIfPresent(path);
src/gates/run.ts:17:  readRegularFileIfPresent,
src/gates/run.ts:381: *      `readRegularFileIfPresent` (M2-C-6). A named pipe reports the observed
src/gates/run.ts:408:  const read = readRegularFileIfPresent(path);
src/gates/run.ts:1606:  const read = readRegularFileIfPresent(recordPath);
src/gates/run.ts:1925:    const held = readRegularFileIfPresent(claimPath);
src/gates/run.ts:1996:  const read = readRegularFileIfPresent(join(evidenceDir, RUN_CLAIM_FILE));
src/gates/coverage.ts:8:  readRegularFileIfPresent,
src/gates/coverage.ts:108: * `readRegularFileIfPresent` (which itself routes through `classifyEntry`),
src/gates/coverage.ts:832:  const read = readRegularFileIfPresent(path);
src/gates/coverage.ts:901:  const read = readRegularFileIfPresent(configPath);
src/gates/coverage.ts:940:  const read = readRegularFileIfPresent(path);
src/gates/merge-preconditions.ts:15:import { readRegularFileIfPresent, refuseOpenForWrite, runStep, singleLine } from "../task.ts";
src/gates/merge-preconditions.ts:798:  const result = readRegularFileIfPresent(path);
src/gates/manifest.ts:4:import { readRegularFileIfPresent } from "../task.ts";
src/gates/manifest.ts:34: * DELIVERED `readRegularFileIfPresent`. A named pipe at the manifest path
src/gates/manifest.ts:88:  const read = readRegularFileIfPresent(path);
src/gates/manifest.ts:256:  const read = readRegularFileIfPresent(path);
src/gates/suite.ts:8:  readRegularFileIfPresent,
src/gates/suite.ts:85: * the delivered classifyEntry / readRegularFileIfPresent /
src/gates/suite.ts:771:  const packageRead = readRegularFileIfPresent(packageJsonPath);
src/gates/suite.ts:801:  const headRegistryRead = readRegularFileIfPresent(join(cwd, flags.registry));
src/gates/suite.ts:936:  const streamRead = readRegularFileIfPresent(streamPath);
src/gates/pin.ts:55: * is not `readRegularFileIfPresent`, which returns UTF-8 text and therefore
src/gates/adapters/http-json.ts:3:import { readRegularFileIfPresent, refuseOpenForWrite } from "../../task.ts";
src/gates/adapters/http-json.ts:366:  const read = readRegularFileIfPresent(requestPath);
src/gates/adapters/migrations-command.ts:8:  readRegularFileIfPresent,
src/gates/adapters/migrations-command.ts:220:    const read = readRegularFileIfPresent(path);
src/gates/adapters/migrations-command.ts:429:  const read = readRegularFileIfPresent(requestPath);
src/gates/gate-classes.ts:8:  readRegularFileIfPresent,
src/gates/gate-classes.ts:232:  const read = readRegularFileIfPresent(path);
src/gates/gate-classes.ts:260:  const read = readRegularFileIfPresent(path);
src/gates/gate-classes.ts:437:  const read = readRegularFileIfPresent(absolute);
src/gates/release.ts:8:  readRegularFileIfPresent,
src/gates/release.ts:214:  const read = readRegularFileIfPresent(path);
src/gates/release.ts:606:    const read = readRegularFileIfPresent(responsePath);
src/liveness.ts:4:import { classifyEntry, readRegularFileIfPresent, readTaskMeta } from "./task.ts";
src/liveness.ts:80: * records and the beacon, and BOTH go through readRegularFileIfPresent in
src/liveness.ts:226:  const read = readRegularFileIfPresent(beaconPath);
src/cutover.ts:57:  readRegularFileIfPresent,
src/cutover.ts:196:  const read = readRegularFileIfPresent(path);
src/cutover.ts:560:    const metaRead = readRegularFileIfPresent(join(fleet.tasksDir, id, "meta.json"));
src/cutover.ts:1334:  const read = readRegularFileIfPresent(path);
src/cutover.ts:1391:    const read = readRegularFileIfPresent(path);
src/cutover.ts:1464:  const read = readRegularFileIfPresent(path);
src/status.ts:45:import { refuseOpenForWrite, readRegularFileIfPresent } from "./task.ts";
src/status.ts:162:  const read = readRegularFileIfPresent(path);
src/adapters/load.ts:5:import { readRegularFileIfPresent, singleLine } from "../task.ts";
src/adapters/load.ts:125: * READ THROUGH `readRegularFileIfPresent`, never `readFileSync`: the fleet
src/adapters/load.ts:138:  const read = readRegularFileIfPresent(fleet.packageJsonPath);
src/watcher.ts:27:  readRegularFileIfPresent,
src/watcher.ts:214: * The read goes through readRegularFileIfPresent (src/task.ts), so the
src/watcher.ts:224:  const read = readRegularFileIfPresent(path);
src/witness/spec.ts:5:import { classifyEntry, readRegularFileIfPresent } from "../task.ts";
src/witness/spec.ts:33: * `readRegularFileIfPresent` in src/task.ts. A named pipe at a spec path is
src/witness/spec.ts:78:    const read = readRegularFileIfPresent(path);
src/witness/spec.ts:227:  const read = readRegularFileIfPresent(path);
src/witness/run.ts:15:  readRegularFileIfPresent,
src/witness/run.ts:788:  const read = readRegularFileIfPresent(target);
src/witness/run.ts:1069:  const declared = readRegularFileIfPresent(join(dir, "package.json"));
src/witness/run.ts:1172:      const read = readRegularFileIfPresent(join(stage, document));
src/witness/run.ts:1252:      const read = readRegularFileIfPresent(path);
src/witness/run.ts:1531:      const read = readRegularFileIfPresent(join(inputs.repoRoot, capture));
src/commands/brief.ts:50:import { refuseOpenForWrite, readRegularFileIfPresent } from "../task.ts";
src/commands/brief.ts:252:  const warnings = readRegularFileIfPresent(
src/commands/doctor.ts:11:import { classifyEntry, readRegularFileIfPresent } from "../task.ts";
src/commands/doctor.ts:485:  const read = readRegularFileIfPresent(lockPath);
src/commands/doctor.ts:757:    const read = readRegularFileIfPresent(path);
src/commands/cutover.ts:56:import { readRegularFileIfPresent, refuseOpenForWrite } from "../task.ts";
src/commands/cutover.ts:470:  const read = readRegularFileIfPresent(resolve(rulesetPath));
src/commands/gates.ts:16:  readRegularFileIfPresent,
src/commands/gates.ts:318:    const read = readRegularFileIfPresent(path);
```

`readRegularFileIfPresent` itself already keeps `absent` and `refused` apart,
which is why the collapse happens in its CALLERS and not in it. Forty-odd
callers are listed above. This round did not audit them, and that is the
largest single gap in this document; section 5.3 item 1 says so.

### 5.3 What the derivation did NOT cover

1. **The forty-odd other callers of `readRegularFileIfPresent` were NOT
   audited.** The enumeration above is published so a later round has the list
   rather than the claim. The two commands here establish the task-record
   family and nothing wider; anyone reading this as an all-clear for gates,
   cutover, checks or the witness harness would be reading it wrong.
2. **`src/pool.ts` and `src/teardown.ts` were read and not edited**, because
   another implementer owns one and the file list does not include the other.
   The repair makes the distinction AVAILABLE upstream; it does not consume it
   at those sites, so CR-F02's reported instance in `src/pool.ts` is closed by
   the other implementer's change and not by this one.
3. **`readTaskMeta`'s signature was NOT widened**, which is the shape the repair
   wants. Widening it is a compile-time break in four modules outside this file
   list, so `classifyTaskMeta` is the new one implementation and `readTaskMeta`
   became a documented narrowing of it. The consequence is that a caller can
   still choose the collapse, and three callers still do.
4. **No pool, liveness, next or teardown behaviour changed**, so nothing here is
   evidence about those commands. The suite is the only check that they still
   behave as they did.

### 5.4 The repair

src/task.ts gains `classifyTaskMeta`, returning `read`, `absent`, `unreadable`,
`unparsable` or `malformed`, with the reason naming the path and, for the last,
the first field that failed. `readTaskMeta` becomes a two-line narrowing wrapper
whose doc comment says which callers may use it and which may not.

