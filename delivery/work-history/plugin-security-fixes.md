# Work history: the plugin security fix round (CR-A-001, CR-A-002, CR-A-003)

- branch: `claude/plugin-security-fixes`, deliberately NOT matching
  `^claude/m[0-9]+-p[0-9]+-`, because that pattern makes the scope gate derive a
  phase id and look for a declaration this branch does not add.
- base: `main` at `0eaf4532c9fda42609481234c4a3fc800367cc76`
- subject: the three HIGH findings of
  `delivery/review/clean-room-retro-A-criteria.md`, which is not on `main` and
  was read from `origin/claude/review-gap-audit`.
- also closed, because the derivation found them and they are the SAME
  mechanism: CR-A-005 (medium) and CR-A-007 (low).

## 0. WHAT THE DERIVATIONS DID NOT COVER, said first

The fix-round contract makes this the reviewer's first check, so it is section
0 rather than an appendix. Each of the three derivations is printed in full in
section 2; this is the account of where each one stopped.

### The CR-A-003 derivation (persisted third-party bytes)

1. **It enumerates WRITE SITES, so a persist that does not go through
   `node:fs` is outside it.** The pattern is
   `appendFileSync|writeFileSync|createWriteStream|openSync`. A write performed
   by a SPAWNED program is invisible to it: `tiphys status emit` is a child
   process, and what the kernel's own status writer puts on disk was checked by
   reading src/status.ts:54 rather than by the grep. `git` is the other such
   program and it writes wherever the kernel tells it to.
2. **`src/gates/` and `src/witness/` were EXCLUDED and the exclusion is a
   judgment, not a measurement.** Those trees write evidence into a directory
   the caller passes on the command line, outside any fleet home, and no hook
   payload reaches them. I did not prove that; I read the call sites. If a gate
   ever writes into a fleet home this derivation would not have said so.
3. **It says nothing about what an OPERATOR types.** `tiphys status emit
   --detail <text>` puts arbitrary operator text into
   `<fleet>/status/current.json`, which is durable by design (M4-D-13,
   src/status.ts:55). That is a deliberate kernel decision and a real residual:
   a secret pasted into a `--detail` argument is published by `tiphys sync`. It
   is out of scope here because it is not a plugin defect and not agent-driven,
   and it is named so a later round does not have to rediscover it.
4. **`<fleet>/write-bypass-evidence.jsonl` was examined and DELIBERATELY LEFT
   DURABLE.** It records `{appendedAt, tool, targetPath, reason, bypass}`: a
   bounded, kernel-chosen projection, not payload content. An audit trail of
   who bypassed the write block is a thing that SHOULD survive a clone. The
   residual is that `targetPath` is an agent-chosen path, so a secret spelled
   into a FILE NAME would be published. I judged that out of proportion to
   breaking the audit trail; it is stated rather than hidden.
5. **Nothing was measured on a non-Linux host.** Every capture below is Linux,
   node v26.6.0.

### The CR-A-001 derivation (carve-outs in the write block)

1. **It enumerates the sites in `plugin/src/hooks/project-write-block.ts` and
   NOWHERE ELSE.** A second adjudicator elsewhere in either package would not
   appear. I checked that the plugin manifest registers exactly one hook for
   `Write|Edit|MultiEdit|NotebookEdit` and the existing test asserts it, so
   there is no second one today; a third-party plugin loaded alongside is
   outside anything this repository can see.
2. **`Bash` IS STILL THE DECLARED RESIDUAL AND THIS ROUND DOES NOT CLOSE IT.**
   M4-P9 declared it, CR-A-001 is not about it, and nothing here narrows it. A
   `Bash` call can still write a project working tree. What this round removes
   is the escalation from an ADJUDICATED tool.
3. **The ref surface is derived from what git wrote in ONE measured
   fetch-plus-fast-forward-merge, plus named siblings for operations I did not
   run** (a non-fast-forward merge, a commit, a checkout, a repack). Those
   siblings are reasoned, not measured. The standing protection is that the
   existing real-merge test now filters on the FIRST SEGMENT instead of on the
   predicate under test, so if the allowlist is too narrow for a real merge on
   some git version, that test goes red rather than silently agreeing with the
   bug.
4. **I did not fire the hook from a live `claude` session.** Same gap the
   retrospective review declares. Everything below runs `runHook`, which is the
   function the shipped script calls, as a real child process.

### The CR-A-002 derivation (runtime resolution against the declaration)

1. **It is a TEXT SEARCH over module specifiers, not a resolver.** A specifier
   built from a variable (`resolve.resolve(name)`) is invisible to it. Measured:
   no such site exists in the plugin today, and the enumeration prints every
   site it did find.
2. **`.resolve(` is matched on ANY receiver**, so `path.resolve("literal")`
   would be a false positive. There is none at this head; I did not add an
   exclusion, because an exclusion added on suspicion is a hole nobody can
   later tell from a rule.
3. **It does not check that the declared RANGE is satisfiable from a
   registry.** `npm install <plugin-tarball>` alone would fetch
   `@tiphys/kernel@^0.1.0` from npm, and the published `0.1.0` predates M4-P4,
   which delivery/work-history/m4-p5.md:176 measured as a trap. I could not
   test that here without the network and I have not established what that
   install produces. It is an open question, in section 7.
4. **The kernel's own `dependencies` were not audited.** The scope is
   `plugin/src` against `plugin/package.json`.

## 1. The three mechanisms, named as mechanisms

The fix-round contract measures that the dominant waste in this project is
fixing the instance the reviewer named when the defect was the mechanism. So
each finding is restated one level up before anything is changed.

| finding | the INSTANCE the reviewer named | the MECHANISM |
|---|---|---|
| CR-A-001 | `.git/hooks/*` and `.git/config` are permitted | **A carve-out whose boundary is drawn at a LOCATION when the intent was a CAPABILITY.** The decision record scopes the carve-out to a ref update; the code spells it as a directory, and a directory contains capabilities nobody enumerated. |
| CR-A-003 | the tool-call log is committed and pushed | **A writer of unbounded third-party bytes chose a destination without establishing that destination's SYNC CLASS, in a fleet whose exposure is a DENYLIST.** `FLEET_IGNORED` names three ephemeral prefixes, so every other path defaults to synced-and-pushed: the default is PUBLISH. |
| CR-A-002 | `@tiphys/kernel` is a devDependency | **A dependency RESOLVED AT RUN TIME declared in a stanza a consumer install does not receive.** The phase that chose the stanza reasoned about IMPORTS; the thing that broke is a resolution that is not an import. |

CR-A-005 is the CR-A-001 mechanism one carve-out over: `isInside` is reflexive,
so a bypass path list naming the project root covers every path in that
project. That is a boundary at a location where the intent was an enumerated
list. It is fixed here because the derivation found it and leaving it would be
exactly the failure the contract is about.

CR-A-007 is fixed because without it the CR-A-002 fix is not observable on the
normal path. Measured rather than asserted: with the stderr report removed, the
test that drives a real launch whose status delivery fails goes red because
nothing is written anywhere, and the launch still reports `completed`.

```
plugin-undelivered-status-reported-on-every-arm m0 (plugin/src/adapter.ts): RED (good) RED
```

## 2. The derivations, in full

### 2.1 CR-A-003: every persist site in the two shipped packages

```
$ grep -rnE '\b(appendFileSync|writeFileSync|createWriteStream|openSync)\(' \
    src/ plugin/src/ bin/ --include='*.ts' | grep -v '^src/gates/' | grep -v '^src/witness/'
src/exec/env.ts:345:        writeFileSync(target, ""),
src/spawn.ts:555:      writeFileSync(request.recordPath, `${JSON.stringify(record, null, 2)}\n`);
src/hooks.ts:53:writeFileSync(
src/hooks.ts:63:  writeFileSync(path, renderTurnEndHook(turnEndPath(fleet, taskId)), {
src/task.ts:366:  writeFileSync(metaPath(fleet, meta.id), renderTaskMeta(meta));
src/brief.ts:68:  writeFileSync(target, content);
src/cutover.ts:265:    handle = openSync(temporary, "wx");
src/status.ts:141:  appendFileSync(streamPath, `${JSON.stringify(record)}\n`, "utf8");
src/status.ts:142:  writeFileSync(temporaryPath, `${JSON.stringify(record, undefined, 2)}\n`, "utf8");
src/exclusion.ts:303:  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
src/exclusion.ts:533:  writeFileSync(path, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
src/lock.ts:281:      writeFileSync(mutexPath, token, { flag: "wx" });
src/lock.ts:394:      writeFileSync(stagePath, next);
src/lock.ts:424:      writeFileSync(stagePath, next);
src/pool.ts:642:    writeFileSync(record, `${JSON.stringify(poolRecord, null, 2)}\n`, {
src/watcher.ts:394:  writeFileSync(stage, body);
src/watcher.ts:592:  const handle = openSync(lastWakePath(fleet), "a");
src/watcher.ts:622:  writeFileSync(`${barrier}.observed`, "");
src/watcher.ts:626:      writeFileSync(`${barrier}.released`, "barrier appeared\n");
src/watcher.ts:631:      writeFileSync(`${barrier}.released`, "timed out without holding\n");
src/watcher.ts:672:      writeFileSync(claimPath, "", { flag: "wx" });
src/commands/brief.ts:355:  writeFileSync(out, composed.text);
src/commands/tuition.ts:140:    writeFileSync(target, loaded.body, { flag: "wx" });
src/commands/tuition.ts:232:    writeFileSync(out, rendered);
src/commands/cutover.ts:294:    writeFileSync(target, outcome.text);
src/commands/lock.ts:74:  writeFileSync(`${barrier}.observed`, "");
src/commands/lock.ts:99:  writeFileSync(
src/commands/gates.ts:282:    writeFileSync(path, renderGateResult(result)),
src/commands/plan.ts:122:  writeFileSync(target, body, "utf8");
src/commands/init.ts:142:    writeFileSync(join(root, name, ".gitkeep"), "");
src/commands/init.ts:144:  writeFileSync(join(root, "backlog.md"), "# Backlog\n");
src/commands/init.ts:177:  writeFileSync(
src/commands/init.ts:181:  writeFileSync(join(root, ".gitignore"), `${FLEET_IGNORED.join("\n")}\n`);
plugin/src/hooks/tool-call-observer.ts:146:    appendFileSync(resolved.path, line, "utf8");
plugin/src/hooks/project-write-block.ts:540:    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
plugin/src/model-resolution.ts:422:    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
plugin/src/adapter.ts:170:      writeFileSync(request.recordPath, `${JSON.stringify(record, null, 2)}\n`);
```

Thirty-eight sites. The mechanism is not "a write" though, it is "a write of
bytes the kernel did not compose", so the set is narrowed by asking where such
bytes ENTER either package at all. A hook payload arrives on stdin and nowhere
else:

```
$ grep -rn 'readStdin\|process\.stdin' src/ plugin/src/ bin/ --include='*.ts'
plugin/src/hooks/tool-call-observer.ts:159:export function readStdin(): Promise<string> {
plugin/src/hooks/tool-call-observer.ts:162:    process.stdin.setEncoding("utf8");
plugin/src/hooks/tool-call-observer.ts:163:    process.stdin.on("data", (chunk) => {
plugin/src/hooks/tool-call-observer.ts:166:    process.stdin.on("end", () => {
plugin/src/hooks/tool-call-observer.ts:169:    process.stdin.on("error", () => {
plugin/src/hooks/tool-call-observer.ts:184:  const raw = await readStdin();
plugin/src/hooks/project-write-block.ts:672:export function readStdin(): Promise<string> {
plugin/src/hooks/project-write-block.ts:675:    process.stdin.setEncoding("utf8");
plugin/src/hooks/project-write-block.ts:676:    process.stdin.on("data", (chunk) => {
plugin/src/hooks/project-write-block.ts:679:    process.stdin.on("end", () => {
plugin/src/hooks/project-write-block.ts:682:    process.stdin.on("error", () => {
plugin/src/hooks/project-write-block.ts:702:    const raw = await readStdin();
```

TWO modules read a payload, and each has exactly one persist site in the list
above. So the population is two, and each was classified:

| persist site | what it persists | destination |
|---|---|---|
| `plugin/src/hooks/tool-call-observer.ts:146` | the payload OBJECT, verbatim | the tool-call log |
| `plugin/src/hooks/project-write-block.ts:540` | `{appendedAt, tool, targetPath, reason, bypass}`, a bounded projection | `<fleet>/write-bypass-evidence.jsonl` |

The SYNC CLASS of every fleet-home destination was then asked of git, in a
fleet home `tiphys init` really created, rather than read off `FLEET_IGNORED`:

```
$ node bin/tiphys.ts init <fleet>
$ cat <fleet>/.gitignore
state/
worktrees/
projects/
$ printf '%s\0' <every destination> | git -C <fleet> check-ignore --no-index -v -z --stdin
.gitignore  1  state/      state/tool-calls/t-1.jsonl
.gitignore  1  state/      state/status/stream.jsonl
.gitignore  1  state/      state/orchestrator.lock
.gitignore  1  state/      state/watcher.beacon
.gitignore  2  worktrees/  worktrees/t-1/x
.gitignore  3  projects/   projects/app/src/a.ts
(exit 0)
```

A path ABSENT from that output matched no rule and is therefore durable. The
absent ones are `tasks/t-1/tool-calls.jsonl`, `write-bypass-evidence.jsonl`,
`tasks/t-1/meta.json`, `tasks/t-1/turn-end`, `tasks/t-1/launch.json`,
`tasks/t-1/model-resolution.json` and `backlog.md`. That absence is the
mechanism in one line: the default is durable, so the default is published.

### 2.2 CR-A-001: every carve-out and bypass in the write block

The mechanism is "a decision to PERMIT, whose boundary is a location". M4-P9's
own derivation (delivery/work-history/m4-p9.md:93) enumerates every permit
site, and re-running it at this head returns the same ten hits:

```
$ grep -n 'verdict: "permit"\|exitCode: EXIT_PERMIT\|return { kind: "absent" }\|return { ok: true' \
    plugin/src/hooks/project-write-block.ts      # at the BASE, 0eaf453
131:  | { verdict: "permit"; reason: string; bypass?: BypassUse }
288:      verdict: "permit",
294:      verdict: "permit",
312:    verdict: "permit",
397:      return { ok: true, root: directory };
473:    return { kind: "absent" };
544:  return { ok: true, path };
587:    return { ok: true, tool, cwd, targetPath: filePath };
589:  return { ok: true, tool, cwd };
663:  return { exitCode: EXIT_PERMIT, stderr: "" };
```

THAT DERIVATION IS SOUND AND IT ANSWERS A DIFFERENT QUESTION, which is why the
phase that ran it shipped the defect. It asks of each permit "was the fact it
rests on established". The question CR-A-001 is about is "is the permitted SET
the intended set", and the two differ at exactly one site, line 294. So the
derivation for THIS mechanism is over BOUNDARIES rather than over permits:

```
$ grep -n 'firstSegmentUnder\|isInside\|startsWith\|includes(\|=== "\.git"\|resolve(entry)\|paths.some' \
    plugin/src/hooks/project-write-block.ts      # at the BASE, 0eaf453
136:  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
143:function firstSegmentUnder(root: string, path: string): string | undefined {
148:  const segments = rest.split(sep);
163:  return firstSegmentUnder(root, path) === ".git";
179:    if (isInside(root, path) && (best === undefined || root.length > best.length)) {
230:  const covers = bypass.paths.some((entry) => {
231:    const listed = resolve(entry);
235:    return isInside(projectRoot, listed) && isInside(listed, targetPath);
292:  if (isGitInternal(root, target)) {
```

FOUR boundaries, and each was driven rather than read:

| boundary | intent | measured |
|---|---|---|
| 163/292, `.git` first segment | "a ref update" | **WIDER: hooks, config, info, worktrees, modules, and `.git` itself.** CR-A-001. |
| 136/179, `isInside` for project containment | which clone's `.git` | correct; longest root wins, tested |
| 230-235, the bypass path list | "an explicit path list" | **WIDER: an entry equal to the project root covers the project, because 136 is reflexive.** CR-A-005. |
| 231, `resolve(entry)` against a canonicalised target | the declaration applies | NARROWER than intended. The retrospective review reproduced a declaration written through a symlink failing to apply; I read the asymmetry at the two call sites and did NOT reproduce it myself. That is CR-A-006, LOW, fail-safe, and NOT fixed here; see section 7. |

The allowlist that replaces boundary 163 is DERIVED from git rather than
remembered. A clone's `.git` was snapshotted, a real `git fetch` and a real
`git merge --ff-only` were run, and the tree was diffed by content hash:

```
PATHS UNDER .git THAT A REAL fetch+merge --ff-only WROTE: 11
  .git/FETCH_HEAD
  .git/ORIG_HEAD
  .git/index
  .git/logs/HEAD
  .git/logs/refs/heads/main
  .git/logs/refs/remotes/origin/main
  .git/objects/61/780798228d17af2d34fce4cfbdf35556832472
  .git/objects/b6/5735d4c0c194f084ab94aed5103b3e7b9e5058
  .git/objects/f4/b354863caa9cea99b95422c9dab70465757d87
  .git/refs/heads/main
  .git/refs/remotes/origin/main
```

### 2.3 CR-A-002: every module the plugin resolves, against its declaration

Two arms, because neither sees the whole set. The SOURCE arm:

```
$ grep -rnoE '(^|[^.[:alnum:]])(import|export)[^;]*?from "[^"]+"|require\("[^"]+"\)|\.resolve\("[^"]+"\)' \
    plugin/src --include='*.ts'
plugin/src/index.ts:18:export { ADAPTER_NAME, ADAPTER_REQUIRES, claudeCodeAdapter } from "./adapter.ts"
plugin/src/index.ts:20:import { claudeCodeAdapter } from "./adapter.ts"
plugin/src/hooks/tool-call-observer.ts:1:import { createHash } from "node:crypto"
plugin/src/hooks/tool-call-observer.ts:2:import { appendFileSync, statSync } from "node:fs"
plugin/src/hooks/tool-call-observer.ts:3:import { basename, dirname, join } from "node:path"
plugin/src/hooks/tool-call-observer.ts:4:import { pathToFileURL } from "node:url"
plugin/src/hooks/turn-end.ts:1:import { spawnSync } from "node:child_process"
plugin/src/hooks/turn-end.ts:2:import { constants } from "node:os"
plugin/src/hooks/project-write-block.ts:1:import { appendFileSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
plugin/src/hooks/project-write-block.ts:2:import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
plugin/src/hooks/project-write-block.ts:3:import { pathToFileURL } from "node:url"
plugin/src/model-resolution.ts:1:import { readFileSync, writeFileSync } from "node:fs"
plugin/src/model-resolution.ts:2:import { dirname, join } from "node:path"
plugin/src/model-resolution.ts:3:import { familyOf, modelForTier, vocabularyIdentity } from "./vocabulary.ts"
plugin/src/status.ts:1:import { spawnSync } from "node:child_process"
plugin/src/status.ts:2:import { dirname, join } from "node:path"
plugin/src/status.ts:3:import { createRequire } from "node:module"
plugin/src/status.ts:4:import { statSync } from "node:fs"
plugin/src/status.ts:102:.resolve("@tiphys/kernel/package.json")
plugin/src/adapter.ts:1:import { spawnSync } from "node:child_process"
plugin/src/adapter.ts:2:import { writeFileSync } from "node:fs"
plugin/src/adapter.ts:3:import { dirname, join } from "node:path"
plugin/src/adapter.ts:10:import { invokeTurnEndHook, payloadExitCode } from "./hooks/turn-end.ts"
plugin/src/adapter.ts:121:export { payloadExitCode } from "./hooks/turn-end.ts"
```

The source arm does NOT list `plugin/src/adapter.ts`'s kernel import, because
`import type` is erased from the emitted JavaScript and the grep above is over
the full statement, which this shell pattern does not reach for the
`import type` form. The COMPILED arm is what a consumer actually runs:

```
$ grep -rnoE 'from "[^"]+"|require\("[^"]+"\)|\.resolve\("[^"]+"\)' plugin/dist/src --include='*.js'
plugin/dist/src/hooks/tool-call-observer.js:1:from "node:crypto"
plugin/dist/src/hooks/tool-call-observer.js:2:from "node:fs"
plugin/dist/src/hooks/tool-call-observer.js:3:from "node:path"
plugin/dist/src/hooks/tool-call-observer.js:4:from "node:url"
plugin/dist/src/hooks/turn-end.js:1:from "node:child_process"
plugin/dist/src/hooks/turn-end.js:2:from "node:os"
plugin/dist/src/hooks/project-write-block.js:1:from "node:fs"
plugin/dist/src/hooks/project-write-block.js:2:from "node:path"
plugin/dist/src/hooks/project-write-block.js:3:from "node:url"
plugin/dist/src/hooks/project-write-block.js:45:from "I looked and there are none"
plugin/dist/src/adapter.js:1:from "node:child_process"
plugin/dist/src/adapter.js:2:from "node:fs"
plugin/dist/src/adapter.js:3:from "node:path"
plugin/dist/src/adapter.js:4:from "./hooks/turn-end.js"
plugin/dist/src/adapter.js:5:from "./model-resolution.js"
plugin/dist/src/adapter.js:6:from "./status.js"
plugin/dist/src/adapter.js:100:from "./hooks/turn-end.js"
plugin/dist/src/status.js:1:from "node:child_process"
plugin/dist/src/status.js:2:from "node:path"
plugin/dist/src/status.js:3:from "node:module"
plugin/dist/src/status.js:4:from "node:fs"
plugin/dist/src/status.js:93:.resolve("@tiphys/kernel/package.json")
plugin/dist/src/index.js:18:from "./adapter.js"
plugin/dist/src/index.js:19:from "./adapter.js"
plugin/dist/src/model-resolution.js:1:from "node:fs"
plugin/dist/src/model-resolution.js:2:from "./vocabulary.js"
plugin/dist/src/model-resolution.js:3:from "./vocabulary.js"
```

The hit at `plugin/dist/src/project-write-block.js:45` is a COMMENT, not a
specifier; it is left in rather than filtered, because a derivation that
silently removes a row is one nobody can audit. The shipped test uses a
comment-stripping form and produces exactly two bare specifiers,
`@tiphys/kernel` from `adapter.d.ts` and `@tiphys/kernel/package.json` from
`status.js`, both naming the same package.

So the population is ONE package, and it was declared in a stanza a consumer
does not receive:

```
$ npm pack -w @tiphys/claude-code-plugin ; npm install <tarball> in an EMPTY directory
added 1 package
$ ls node_modules/@tiphys/
claude-code-plugin
$ node -e '... resolveKernelCli() ...'
{"ok":false,"reason":"@tiphys/kernel could not be resolved from the plugin:
 Error: Cannot find module '@tiphys/kernel/package.json' Require stack: -
 <consumer>/node_modules/@tiphys/claude-code-plugin/dist/src/status.js"}
```

## 3. The three fixes, and the option I did NOT take for CR-A-003

### 3.1 CR-A-003, and the options are not equal

The finding does not have one obvious fix, so the four candidates are stated
with what each costs.

- **Redact at write time.** REJECTED. The observer exists to produce a VERBATIM
  corpus (M4-P6 criterion 5), and its `payloadSha256` is over the ARRIVING
  bytes so a later reader can tell a round-tripped record from a rewritten one.
  Redaction destroys both. And a redactor is a guard that cannot go red in the
  way this repository keeps paying for: the set of secret shapes is not
  enumerable, so a green redactor and an absent one look identical. Worse, the
  two red-witness members below are exactly the two a per-field redactor would
  have to be written twice for.
- **Record only the sha256.** REJECTED, for the same reason taken to its limit.
  A hash of a payload is not a corpus. This is the option that breaks what the
  observer is FOR.
- **Add `tasks/` to `FLEET_IGNORED`.** REJECTED, and this is the one that
  changes shipped kernel behaviour for every consumer. `FLEET_IGNORED` at
  src/fleet.ts:29 is what `tiphys init` writes into the fleet `.gitignore`
  (src/commands/init.ts:181), so adding `tasks/` would ALSO stop syncing
  `tasks/<id>/meta.json`, the turn-end record, the launch record and the
  model-resolution record. Those are the durable task state a fleet exists to
  carry across a restart and across a clone. This option fixes the leak by
  throwing away the thing the leak was next to.
- **Move the log into the tree the kernel already declares ephemeral.**
  **TAKEN.** The capture stays verbatim, the record keeps its receipt, and the
  destination becomes `<fleet>/state/tool-calls/<taskId>.jsonl`, which the
  existing `state/` rule covers. **Nothing else stops being synced**, because
  `FLEET_IGNORED` is not edited at all.

The task-directory existence check is KEPT and is now checking a different
directory from the one written to, which is deliberate and is the subtle part.
The check is what stops the hook inventing a task or scattering logs through
whatever tree an agent was standing in, and it has to be a directory the KERNEL
created; a hook that tested the place it is about to create would be testing
nothing.

**The second edit the review proposed turned out to need no code.** It asked
for `tiphys sync` to refuse a staged tool-call log by name. Once the log is
under an ignored prefix, the existing staged-ephemeral refusal at
src/commands/sync.ts:278 already does it, naming the path AND the rule:

```
$ git -C <fleet> add -f state/tool-calls/t-9.jsonl
$ node bin/tiphys.ts sync
tiphys sync: state/tool-calls/t-9.jsonl is staged and is ephemeral by
.gitignore:1 state/; unstage it with git restore --staged -- state/tool-calls/t-9.jsonl
and re-run, nothing was committed
sync exit=1
```

Adding a basename carve-out beside that would have been the denylist mechanism
a second time.

**C-1 IS NOT WEAKENED.** No read of the log is added anywhere. The shipped
assertion that the emitted plugin contains exactly one module naming
`tool-calls` and no read site still holds and still passes.

### 3.2 CR-A-001 and CR-A-005

`isGitInternal` is kept as the LOCATION test and is no longer the carve-out. A
new `isGitRefSurface` is the carve-out: an ALLOWLIST of the ref surface,
refusing everything else inside `.git` with a reason that names `hooks/` and
`config` and says why each is a command git runs. A path inside `.git` that is
not on the ref surface gets its OWN refusal rather than the working-tree
wording, which would have been a false diagnosis.

Writing the fix as an allowlist rather than as a `hooks/` exclusion is the
whole point: an exclusion list would have been the same mechanism with two
entries removed from it.

For CR-A-005, a bypass path list entry that RESOLVES to the project root
refuses the whole declaration, with a reason naming it. `resolve` and not the
declared spelling, because the declaration is what an operator types.

### 3.3 CR-A-002 and CR-A-007

`@tiphys/kernel` is declared a `peerDependencies` entry at `^0.1.0`, and
`devDependencies` is kept so the workspace resolves without relying on peer
auto-install. `peerDependencies` rather than `dependencies` because the plugin
RESOLVES THE KERNEL'S `bin` AND SPAWNS IT: a nested duplicate kernel, which is
what `dependencies` produces on a version conflict, means the plugin runs a
different CLI from the one managing the fleet. The declaration that says "use
the host's copy" is the peer one.

delivery/work-history/m4-p5.md:176 measured `peerDependencies` beside the root
`overrides` as producing `npm warn ERESOLVE overriding peer dependency` on
every install. RE-MEASURED at this head with `^0.1.0` rather than the exact
`0.1.0` that row used: `npm ci` exit 0, zero warning lines matching
`warn|ERESOLVE|error`, `node_modules/@tiphys/kernel` still the symlink to the
workspace root. The row is not wrong, and it is not what this configuration
does.

`peerDependenciesMeta` is deliberately NOT added. Marking the peer optional
would restore exactly the silent hole CR-A-002 is.

For CR-A-007, `deliverStatusForTurn` writes a non-empty reason to `process.stderr`
before returning it. stderr, because the captured hook contract shows stdout is
the decision channel and stderr is not, so the report cannot change the outcome
the adapter reports. `statusSuffix` is left on the `incomplete` arm: that is a
different channel with a different reader, and removing it would trade one
silence for another.

## 4. Red witnesses

Every witness below was captured RED against the DANGEROUS STATE, on the same
harness, with only the source changed between the two runs.

### 4.1 CR-A-001, two structurally different members

The members are different CAPABILITIES reached through the same hole, not two
spellings of one:

- **Member 1, `.git/hooks/post-merge`.** PLACES a program where git executes it.
- **Member 2, `.git/config`.** REDIRECTS where git LOOKS for programs, through
  `core.hooksPath`. It was driven with `.git/hooks` EMPTY, which is what proves
  it does not reach its escalation through member 1. A fix that special-cased
  `hooks/` would close the first and leave the second.

RED, through the real `runHook` against a real fleet home with a real clone:

```
exit=2  REFUSE  working tree     <fleet>/projects/app/src.txt
exit=0  PERMIT  ref (intended)   <fleet>/projects/app/.git/refs/heads/main
exit=0  PERMIT  MEMBER 1 hooks   <fleet>/projects/app/.git/hooks/post-merge
exit=0  PERMIT  MEMBER 2 config  <fleet>/projects/app/.git/config
exit=0  PERMIT  info/exclude     <fleet>/projects/app/.git/info/exclude
exit=0  PERMIT  the .git entry   <fleet>/projects/app/.git
exit=2  REFUSE  .gitignore       <fleet>/projects/app/.gitignore
```

Driven to the consequence, member 1:

```
$ printf '#!/bin/sh\necho OWNED-BY-POST-MERGE-HOOK > "$(git rev-parse --show-toplevel)/src.txt"\n' \
    > <root>/.git/hooks/post-merge   # the write the block PERMITTED
$ git -C <root> merge --ff-only feature
 1 file changed, 1 insertion(+)
 create mode 100644 other.txt
cat src.txt -> OWNED-BY-POST-MERGE-HOOK
git status --porcelain -> ' M src.txt'
```

Member 2, after resetting the clone and REMOVING the hook, so the two arms do
not share a cause:

```
clean: ''  head=1f5a716
--- .git/hooks is EMPTY, proving this member does not go through member 1's path ---
0
$ printf '[core]\n\thooksPath = %s\n' <elsewhere> >> <root>/.git/config   # the PERMITTED write
$ git -C <root> merge --ff-only feature
 1 file changed, 1 insertion(+)
 create mode 100644 other.txt
cat src.txt -> OWNED-BY-CONFIG-REDIRECT
git status --porcelain -> ' M src.txt'
```

GREEN, same harness, same fleet, only the source changed:

```
exit=2  REFUSE  working tree     <fleet>/projects/app/src.txt
exit=0  PERMIT  ref (intended)   <fleet>/projects/app/.git/refs/heads/main
exit=2  REFUSE  MEMBER 1 hooks   <fleet>/projects/app/.git/hooks/post-merge
exit=2  REFUSE  MEMBER 2 config  <fleet>/projects/app/.git/config
exit=2  REFUSE  info/exclude     <fleet>/projects/app/.git/info/exclude
exit=2  REFUSE  the .git entry   <fleet>/projects/app/.git
exit=2  REFUSE  .gitignore       <fleet>/projects/app/.gitignore
```

And the narrowed set is STILL WIDE ENOUGH, put to git rather than to a
predicate:

```
the narrowed carve-out permits 11 of the 11 .git paths a real merge wrote; refused 0
```

### 4.2 CR-A-003, two structurally different members

- **Member 1, a secret in `tool_input.command` of a `Bash` payload.** A shell
  string. The observer does not parse it: it reads only `cwd` out of the
  payload and carries the rest through untouched.
- **Member 2, a secret in `tool_input.content` of a `Write` payload.** A file
  body. The write block reads only `file_path` out of `tool_input`, so no code
  in either package reads these bytes at all.

Both halves settled by the same command rather than by assertion; the only
`tool_input` subscript in either module is the write block's, and the only
field it takes out is the path:

```
$ grep -n 'tool_input' plugin/src/hooks/tool-call-observer.ts plugin/src/hooks/project-write-block.ts
plugin/src/hooks/tool-call-observer.ts:37: * `tool_input.command` for `Bash` and `tool_input.content` for `Write`, so
plugin/src/hooks/project-write-block.ts:65: * `tool_input.file_path`, an ABSOLUTE path, so a target-keyed predicate can
plugin/src/hooks/project-write-block.ts:66: * see them. `Bash` carries `tool_input.command`, a raw shell string, and
plugin/src/hooks/project-write-block.ts:689: * are top level; the target is `tool_input.file_path` and it arrived ABSOLUTE
plugin/src/hooks/project-write-block.ts:713:  const input = payload["tool_input"];

$ grep -n '\[.content.\]\|file_path' plugin/src/hooks/project-write-block.ts
65: * `tool_input.file_path`, an ABSOLUTE path, so a target-keyed predicate can
689: * are top level; the target is `tool_input.file_path` and it arrived ABSOLUTE
716:      ? (input as Record<string, unknown>)["file_path"]
```

The observer's only hit is a COMMENT, and the write block's only subscript of
`tool_input` takes `file_path`.

They arrive on different fields of different tool shapes: a per-field redactor
written for either would miss the other, which is the concrete reason the
redaction option was rejected.

RED, read back OUT OF A BARE REMOTE after a real `tiphys sync`:

```
$ node bin/tiphys.ts sync
COMMITTED tasks/t-9/tool-calls.jsonl
PUSHED origin
=== exit 0 ===
$ git -C <remote> show main:tasks/t-9/tool-calls.jsonl \
    | grep -oE '(ghp_|AWS_SECRET_ACCESS_KEY=)[A-Za-z0-9_]*'
ghp_REDWITNESSBASH0123456789abcd
AWS_SECRET_ACCESS_KEY=REDWITNESSWRITE0123456789abcd
```

GREEN, rebuilt from scratch with the fixed source. The capture is still
verbatim LOCALLY, which is the half that must not have been traded away:

```
$ find <fleet> -name '*.jsonl'
<fleet>/state/tool-calls/t-9.jsonl
$ grep -ohE '(ghp_|AWS_SECRET_ACCESS_KEY=)[A-Za-z0-9_]*' <fleet>/state/tool-calls/t-9.jsonl
ghp_REDWITNESSBASH0123456789abcd
AWS_SECRET_ACCESS_KEY=REDWITNESSWRITE0123456789abcd
$ node bin/tiphys.ts sync
NOTHING TO COMMIT
PUSHED origin
$ git -C <remote> ls-tree -r --name-only main
.gitignore
backlog.md
charter/.gitkeep
decisions/.gitkeep
package.json
status/.gitkeep
tasks/.gitkeep
$ git -C <remote> grep -lE '(ghp_REDWITNESSBASH|REDWITNESSWRITE)' main --
(git grep exit=1 ; 1 means no hit)
```

The whole remote tree is listed above so a reader can see there is nothing the
search could have missed. The shipped test is stronger still: it searches every
object in the remote with `git cat-file --batch-all-objects --batch`, with a
positive control asserting the dump is non-empty, so a search that found
nothing because it searched nothing cannot read as clean.

### 4.3 CR-A-002, two structurally different members

- **Member 1, the declaration taken away while the resolution stays.** The
  state `main` ships.
- **Member 2, a resolution added while the declaration stays.** A new bare
  specifier nobody declared.

They are the two halves of one comparison, so a guard that only ever read one
side is red under exactly one of them.

RED for member 1, on a clean consumer install of the real tarball:

```
$ node -e '... resolveKernelCli() ...'
resolveKernelCli() -> {"ok":false,"reason":"@tiphys/kernel could not be resolved
from the plugin: Error: Cannot find module '@tiphys/kernel/package.json' ..."}
```

and the shipped test's own red, which is the DERIVATION rather than the name:

```
AssertionError: the plugin resolves packages a consumer install would not have:
plugin/src/adapter.ts resolves @tiphys/kernel, and @tiphys/kernel is in none of
  dependencies, peerDependencies or optionalDependencies (plugin source)
plugin/src/status.ts resolves @tiphys/kernel/package.json, and @tiphys/kernel is
  in none of dependencies, peerDependencies or optionalDependencies (plugin source)
<staging>/extracted/package/dist/src/adapter.d.ts resolves @tiphys/kernel, ...
<staging>/extracted/package/dist/src/status.js resolves @tiphys/kernel/package.json, ...
```

GREEN, from the manifest inside the real tarball:

```
dependencies       null
peerDependencies   {"@tiphys/kernel":"^0.1.0"}
devDependencies    {"@tiphys/kernel":"0.1.0"}
```

**The behavioural control, and it is a CONTROL and not a witness**, because it
is green whatever the declaration says: with both tarballs installed side by
side the runtime resolution succeeds.

```
$ npm install <kernel-tgz> <plugin-tgz>
added 12 packages
$ node ... resolveKernelCli()
{"ok":true,"path":"<consumer>/node_modules/@tiphys/kernel/dist/bin/tiphys.js"}
```

### 4.4 Every declared member, mechanically re-verified

Each dangerous state in every spec this round wrote or repaired was applied to
the working tree and the named test run under it, then reverted. Twenty
members, twenty reds:

```
plugin-git-carve-out-is-the-ref-surface m0 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-git-carve-out-is-the-ref-surface m1 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-post-merge-hook-write-is-refused m0 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-post-merge-hook-write-is-refused m1 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-bypass-path-list-is-not-the-project-root m0 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-bypass-path-list-is-not-the-project-root m1 (plugin/src/hooks/project-write-block.ts): RED (good) RED
project-write-block-git-carve-out-is-segment-wise m0 (plugin/src/hooks/project-write-block.ts): RED (good) RED
project-write-block-git-carve-out-is-segment-wise m1 (plugin/src/hooks/project-write-block.ts): RED (good) RED
project-write-block-agent-turn-leaves-the-clone-unchanged m0 (plugin/src/hooks/project-write-block.ts): RED (good) RED
project-write-block-agent-turn-leaves-the-clone-unchanged m1 (plugin/src/hooks/project-write-block.ts): RED (good) RED
plugin-tool-call-log-is-not-published-by-sync m0 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-tool-call-log-is-not-published-by-sync m1 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-tool-call-log-is-ephemeral-by-git m0 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-tool-call-log-is-ephemeral-by-git m1 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-undelivered-status-reported-on-every-arm m0 (plugin/src/adapter.ts): RED (good) RED
plugin-undelivered-status-reported-on-every-arm m1 (plugin/src/adapter.ts): RED (good) RED
plugin-runtime-packages-declared-for-consumers m0 (plugin/package.json): RED (good) RED
plugin-runtime-packages-declared-for-consumers m1 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-observer-log-never-read-as-state m0 (plugin/src/hooks/tool-call-observer.ts): RED (good) RED
plugin-observer-log-never-read-as-state m1 (plugin/src/adapter.ts): RED (good) RED
```

## 5. Two stored witnesses stopped guarding their behavior, and the second is
the interesting one

The first gate run reported both, which is the gate working:

- `project-write-block-agent-turn-leaves-the-clone-unchanged` member 0 mutated
  `if (isGitInternal(root, target)) {` into `|| true`. That text still exists at
  this head, in the NEW non-ref-surface REFUSAL arm, where `|| true` makes the
  hook refuse rather than permit. It went green: a mutation that still applies
  cleanly and no longer means what it meant. Repointed at the permit site.
- `project-write-block-git-carve-out-is-segment-wise` went green on BOTH
  members. The gate's own words:

  ```
  witness project-write-block-git-carve-out-is-segment-wise no longer guards its
  behavior (member 0 red 0/2, member 1 red 0/2)
  ```

  The reason I believe is that the narrowing SUBSUMES the property those members
  guarded: `.gitignore` has no second segment under `.git`, so the ref-surface
  allowlist refuses it whatever `isGitInternal` answers, and both members mutate
  only `isGitInternal` and `firstSegmentUnder`. I did not enumerate every
  mutation of those two functions, so that is a reading of two measured greens
  and not a proof about the whole mutation space. Both members were replaced
  with mutations of the code that now decides the question, and both were
  re-verified red above.

That second case is worth a reviewer's attention. A defect made stricter
elsewhere can turn an honest witness into a passing one, and nothing about the
diff says so; only running the gate does.

## 6. Gates, locally, before pushing

Toolchain fetched per standing warning 1.

```
$ node --version
v26.6.0
$ npm ci          ; exit 0
$ npm run build   ; exit 0, git status --porcelain empty afterwards
```

**THE COMPLETE SENTENCE FOR THE SUITE, on all three axes standing warning 12
names.** Interpreter node v26.6.0, `dist/` BUILT, at this head:

| invocation | tests | pass | fail | SKIPPED | exit |
|---|---|---|---|---|---|
| `npm test`, which is `node --test "test/**/*.test.ts"` | 1289 | 1289 | 0 | **0** | 0 |
| bare `node --test` from the repository root | 1291 | 1291 | 0 | **0** | 0 |

The two-test gap is the documented one: `npm test`'s glob excludes the tracked
root sandbox fixture and the bare invocation includes it. Both numbers are true
sentences about different commands.

**THE RETROSPECTIVE REVIEW SAW ONE FAILURE HERE AND I DO NOT, AND THE REASON IS
NOT MY CHANGE.** That review recorded `test/gates.test.ts:3659` failing with
`spawnSync ... EACCES`, the scratch-prefix traversal trap. My clone is UNDER
`/tmp/claude-0/`, so the test's own `grantTraversalWhenUnderTmp` opens
`/tmp/claude-0` and the scratch interpreter at `/tmp/claude-0/n26/bin/node`
becomes reachable as a side effect. Same head, same interpreter, different
clone location, different result. That is standing warning 1's trap in the
direction that HIDES a failure, and anyone re-running this from a home
directory should expect the review's number rather than mine.

The registry bundle, run the way CI runs it, with `--phase` computed by the
same expression the workflow uses:

```
$ PH=$(printf '%s' "claude/plugin-security-fixes" | sed -E 's#^(claude/)?(m[0-9]+-p[0-9]+).*#\2#')
CI would pass --phase 'claude/plugin-security-fixes'
$ node bin/tiphys.ts gates run --registry gate-registry.yaml --mode full \
    --evidence <scratch> --base origin/main --head HEAD --phase "$PH"
gates: declared 19 applicable 11 verdict 11 green 11 red 0 not-applicable 8 error 0 vacuous 0
gates: suite: green: ... reported 1289 test(s) from 64 file(s) (pass 1289, fail 0,
  skipped 0, todo 0, did-not-run 0); ... 1165 behavior(s) resolve; merge base 0eaf4532c9fd
gates: scope: not-applicable: precondition scope-branch-is-a-phase-branch evaluated
  and unmet: branch claude/plugin-security-fixes does not match ^(?:claude/m[0-9]+-p[0-9]+-.*)$
gates: red-witness: green: 23 witness(es) evaluated (10 own, 13 stored re-evaluated
  in 102696ms); every witness red against every declared dangerous state and green at head
gates: gate-classes: not-applicable: precondition gate-classes-branch-is-a-phase-branch
  evaluated and unmet: branch claude/plugin-security-fixes does not match ...
gates: merge-preconditions: not-applicable: precondition merge-preconditions-verdicts-present
  evaluated and unmet: node scripts/check-dual-review.mjs --precondition . exited 1
```

Eleven applicable, eleven verdicts, eleven green, zero red, zero error, zero
vacuous. WITHOUT `--phase` those three gates report `error` rather than
`not-applicable`, which is why the phase-supplied run is the one that matches
CI. `node scripts/check-authored-bytes.mjs` exits 0 at the committed head.

### Transliteration declaration

Node's test reporter prints U+2139 (INFORMATION SOURCE) at the head of each
summary line and U+2714 / U+2716 on result lines. The suite numbers above are
presented as a TABLE built from the reporter's own summary lines, so no
reporter line is quoted verbatim and zero glyphs of any of the three codepoints
appear or were replaced. The witness re-verification block in section 4.4 and
every other captured block are the plain output of scripts I wrote, which emit
ASCII only. Nothing in any captured output was changed.

## 7. Open questions, and one thing I did not fix

1. **What a registry install of the plugin alone produces is NOT established.**
   With a non-optional peer, `npm install @tiphys/claude-code-plugin` fetches
   `@tiphys/kernel@^0.1.0` from npm, and the published `0.1.0` predates M4-P4.
   I did not find a way to test that without the network from this container,
   and I did not test it. Whether that install resolves, and whether the
   resolved kernel is usable, is unknown to me.
2. **CR-A-006 is NOT fixed.** The bypass compares canonicalised targets against
   un-canonicalised declarations, so a bypass declared through a symlinked path
   does not apply. It surfaced in my boundary derivation, it is LOW, its
   direction is fail-safe, and it is a DIFFERENT mechanism from the one this
   round is about: canonicalisation asymmetry rather than a boundary drawn at a
   location. Fixing it here would have been scope I was not asked for, and
   leaving it is a choice rather than an oversight.
3. **CR-A-004 and CR-A-008 are untouched**, being medium and low and outside
   the three HIGH findings.
4. **The plan names the log's old path.** delivery/plan/kernel-plan-m4.md:904
   states that C-1 binds `tasks/<id>/tool-calls.jsonl`, and after this round the
   log is at `<fleet>/state/tool-calls/<taskId>.jsonl`. The CONSTRAINT is
   unchanged and still holds; the PATH in that sentence is now stale, and so is
   the same path in M4-P6's criterion text. I did not edit the plan, because an
   implementer does not. It is raised for the orchestrator.

## 8. The claim grep

Binding form, line based, and the wrap-insensitive form as well, because this
prose is hard-wrapped and a phrase straddling a wrap is invisible to the first.
Counting OCCURRENCES rather than matching lines, so the two numbers are
comparable:

```
$ grep -oEi '<the eleven phrases>' delivery/work-history/plugin-security-fixes.md | wc -l
5
$ tr '\n' ' ' < delivery/work-history/plugin-security-fixes.md \
    | grep -oEi '<the eleven phrases>' | wc -l
5
```

**Zero missed by wrap.** The pattern is written as `<the eleven phrases>` above
for one reason: spelling it out in this document makes the document match
itself ten times, once per alternative, and a self-match is noise a reviewer
then has to hand-filter. The literal pattern is the one in CLAUDE.md and in the
dispatching brief; run it against this file with either.

The five occurrences break down as:

| where | count | what it is |
|---|---|---|
| the two `plugin-observer-log-never-read-as-state` rows in section 4.4 | 2 | the ID of a stored witness, inside CAPTURED OUTPUT, not a claim |
| this section's own table row and its sentence below | 3 | self-reference |

Spelling the pattern out here would have added TEN more, one per alternative,
which is the reason it is not spelled out.

**Zero claims remain.** The first run of the binding grep, before this section
existed, returned SEVEN hits, one `cannot be` and six `never`. Two were the
witness id above. Of the other five: three now carry a captured command printed
beside them (the CR-A-007 member red, and the two `tool_input` greps in section
4.2); one was restated as a measurement somebody else made and I did not
reproduce (CR-A-006, section 2.2's boundary table); and one was restated as a
reading of two measured greens rather than a proof about a mutation space I did
not enumerate (section 5).
