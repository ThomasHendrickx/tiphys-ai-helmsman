# Clean-room review, retrospective: group A, the plugin surface

- review contract: **criteria**
- framing: `criteria-contract`
- produced by: **Claude Opus 5** (Anthropic)
- subject: `main` at `0eaf4532c9fda42609481234c4a3fc800367cc76`
- phases covered: **M4-P5** (merged 2d8596c), **M4-P6** (8ff6738), **M4-P7**
  (752f792), **M4-P9** (713731f)
- verdict: **FIX-ROUND-NEEDED**

`phase` in the JSON verdict is set to `M4-P5` because the schema takes one
string and this review covers four phases. That deviation from the one-head
contract is declared by the dispatching brief and is repeated here so it is
auditable rather than discovered.

---

## 0. What I could not read, said first

**`delivery/tuition/T-041-...` does not exist**, in the working clone or on
`main`. The dispatching brief instructed me to read it first. Measured:

```
$ ls delivery/tuition/ | tail -3
T-038-the-plugin-package-had-no-red-witness-gate.md
T-039-two-tuition-ids-each-carried-two-different-entries.md
T-040-the-merge-authority-gate-has-never-been-fed.md
```

The highest allocated tuition id on `main` is T-040. I read T-038 and DR-0027
instead and proceeded on the brief's own statement of what is established. This
matters for one reason only: whatever T-041 says about what is and is not
established for these four phases, I did not have it, so nothing below is
calibrated against it.

## 1. Environment, and the complete sentence for every suite result

Floor-satisfying toolchain, fetched per standing warning 1:

```
$ node --version
v26.6.0
$ npm ci            ; exit 0, "EBADENGINE" appears 0 times in the log
$ npm run build     ; exit 0, git status --porcelain empty afterwards
```

The clone is a fresh `git clone --no-local` of the repository, reset hard to
`origin/main`. I never pushed and never committed to it.

**`npm test`**, node v26.6.0, `dist/` BUILT, invocation `npm test` (which is
`node --test "test/**/*.test.ts"`):

```
tests 1282 / pass 1281 / fail 1 / cancelled 0 / SKIPPED 0 / todo 0
duration_ms 380375 ; npm test exit=1
```

**Bare `node --test`** from the repository root, same interpreter, same build
state:

```
tests 1284 / pass 1283 / fail 1 / cancelled 0 / SKIPPED 0 / todo 0
duration_ms 451744
```

The two-test gap is the one standing warning 12 records: `npm test`'s glob
excludes the tracked root sandbox fixture and the bare invocation includes it.
Both numbers are true sentences about different commands.

**The one failure is environmental and is OUTSIDE this group.** It is
test/gates.test.ts:3659, `a precondition command exiting nonzero is error, not a
skip, whenever a path-shaped argv element cannot be opened`. The test's own
failure message classifies it:

```
gate p11-attr wrote no record at /tmp/tiphys-gates-hZYSMB/evidence-attr-unreadable/p11-attr/result.json;
the run itself did not reach a verdict, which is an environment failure rather
than a wrong verdict. exit=1 stdout= stderr=node:internal/modules/esm/resolve:272
```

The cause is standing warning 1's scratch-prefix trap, confirmed rather than
assumed:

```
$ namei -m /tmp/claude-0/n26/bin/node
 drwxrwxrwt tmp
 drwx------ claude-0      <- an unprivileged uid cannot traverse this
 drwxr-xr-x n26
 -rwxr-xr-x node
```

That test drives `runCliUnprivileged`, which drops to an unprivileged uid and
spawns `process.execPath`. `process.execPath` is the scratch toolchain under a
`drwx------` directory, so the child cannot resolve its own modules. The failure
is a property of the INTERPRETER'S PATH, not of `main` and not of this group. I
did not attribute it to any phase. Where a criterion literally says "node --test
exits 0" I have recorded it not met with this reason attached, because that is
what the command did.

**The five plugin-relevant test files, run alone**, node v26.6.0, `dist/` built,
invocation `node --test test/plugin-package.test.ts test/plugin-adapter.test.ts
test/plugin-hooks.test.ts test/model-resolution.test.ts
test/project-write-block.test.ts`:

```
tests 43 / pass 43 / fail 0 / SKIPPED 0 / todo 0 / duration_ms 13314 ; exit 0
```

**`node --test test/project-write-block.test.ts` alone:**
`tests 11 / pass 11 / fail 0 / SKIPPED 0`, exit 0.

### Transliteration declaration

Node's test reporter prints U+2139 (INFORMATION SOURCE) at the head of each
summary line and U+2714 / U+2716 on result lines. Every captured suite summary
quoted above has had U+2139 REMOVED so this document stays pure ASCII: 21
occurrences removed across four captures. U+2714 and U+2716 appear in no quoted
line here (the one failure is quoted by its assertion text, which is already
ASCII), so zero of each was replaced. Nothing else in any captured output was
changed.

---

## 2. Findings

Severity means "how fast must this be fixed on a new branch", per the
dispatching brief, and reachability rather than tree membership is the test, per
DR-0027. Everything in this group is in the shipped `@tiphys/claude-code-plugin`
package or in `schemas/` and `src/`, so all of it is shipped.

### CR-A-001 (HIGH) The `.git/` carve-out is a whole-clone write channel, and I drove it end to end

**Shipped behaviour at risk: the project-write block itself. The block is a
no-op against an agent that spends one permitted write on it.**

M4-D-27 and the plan say the carve-out is for "a ref update"
(delivery/plan/kernel-plan-m4.md:1536). The implementation permits the whole of
`.git/`, segment-wise on the first segment
(plugin/src/hooks/project-write-block.ts:162). `.git/hooks/` and `.git/config`
are inside `.git/` and are not ref updates; they are executable policy for every
subsequent git command in that clone.

Measured against the compiled `decideWrite`, one project root, no bypass:

| target | verdict |
|---|---|
| `<root>/src/app.ts` | REFUSE |
| `<root>/.git/refs/heads/main` | PERMIT (intended) |
| `<root>/.git/hooks/pre-commit` | **PERMIT** |
| `<root>/.git/config` | **PERMIT** |
| `<root>/.git` (the entry itself) | **PERMIT** |
| `<root>/.gitignore` | REFUSE (correct) |

Reproduced end to end through the real wrapper `runHook`, in a real fleet home
with a real git clone under `projects/`:

```
exit=2  REFUSE  <root>/src.txt
exit=0  PERMIT  <root>/.git/hooks/post-merge

# then, having written the hook the wrapper permitted:
$ git merge --ff-only feature
$ cat src.txt
OWNED-BY-POST-MERGE-HOOK
$ git status --porcelain
 M src.txt
```

The release manager's own carved-out operation performed exactly the
working-tree write the block had refused one command earlier. This is the SC-010
contradiction arriving through the carve-out that exists to avoid it.

**This also falsifies M4-P9 criterion 6 as written**, which asserts "a real
agent turn that attempts a working-tree write in a project clone produces no
change to that clone (`git status --porcelain` empty, and every tracked file's
sha unchanged)". The tool used above is `Write`, which is in the adjudicated
set, so this is not the declared `Bash` residual.

**Why no existing guard sees it.** test/project-write-block.test.ts asserts "a
real git merge --ff-only moves the ref and the block permits every path it
wrote": it checks the carve-out is WIDE ENOUGH and never that it is NARROW
ENOUGH. The phase's own fail-open derivation (delivery/work-history/m4-p9.md:93)
enumerates the three permit sites correctly and asks of each "was the fact it
rests on established", which is a different question from "is the permitted set
the intended set". Both are honest and both miss this.

**Concrete fix.** Narrow the carve-out from `.git/` to the ref surface it was
written for. Replace `isGitInternal` with a predicate that permits only the
paths a ref update touches and refuses the rest, then widen the test to the
complement. Concretely, inside `<root>/.git`, permit `HEAD`, `ORIG_HEAD`,
`FETCH_HEAD`, `MERGE_HEAD`, `index`, `packed-refs`, `refs/**`, `logs/**` and
`objects/**`, and REFUSE everything else, naming `hooks/` and `config` in the
refusal reason. A second member for the red-witness class is then
`<root>/.git/config`, structurally different from `<root>/.git/hooks/pre-commit`
because one is executed by git directly and the other is read as configuration.
The end-to-end test already runs a real `git merge --ff-only`; keep it as the
proof that the narrowed set is still wide enough.

### CR-A-002 (HIGH) `@tiphys/kernel` is a devDependency and M4-P6 made it a runtime dependency; status delivery is dead for every consumer and silent about it

**Shipped behaviour at risk: the status line. M4-P6 criterion 7 is discharged in
this workspace and cannot be discharged by anyone who installs the package.**

This is the "met at the phase head, no longer true later" case the brief asks
for, and the work history predicted it by name.

M4-P5 chose `devDependencies` deliberately and wrote down the trigger that would
invalidate the choice:

> A `dependencies` entry would assert a runtime need this package does not have.
> M4-P6 or M4-P7 importing a kernel VALUE is what would move it, and this
> paragraph is where the next implementer finds out that the move is one line.
> (delivery/work-history/m4-p5.md:196)

M4-P6 then shipped plugin/src/status.ts:102, which resolves the kernel through
the module system AT RUN TIME:

```
manifestPath = resolve.resolve("@tiphys/kernel/package.json");
```

That is not a type import and `verbatimModuleSyntax` does not erase it. It is in
the compiled output at plugin/dist/src/status.js:93. The declaration was not
moved.

Reproduced on a clean consumer install of the actually-packed tarball:

```
$ npm pack -w @tiphys/claude-code-plugin          # 19 files
$ npm install ./tiphys-claude-code-plugin-0.1.0.tgz
added 1 package
$ ls node_modules/@tiphys/
claude-code-plugin                                 # no kernel
$ node -e 'import(".../dist/src/status.js").then(m => console.log(m.resolveKernelCli()))'
{ ok: false,
  reason: "@tiphys/kernel could not be resolved from the plugin: Error: Cannot
           find module '@tiphys/kernel/package.json' Require stack: - .../dist/src/status.js" }
```

So on every consumer install, `deliverStatusForTurn` returns the reason string
at plugin/src/adapter.ts:325 and no status record is ever emitted. The
supervisor's only live signal is absent, and the absence is indistinguishable
from a quiet turn.

The declaration output is affected too: plugin/dist/src/adapter.d.ts:1 is
`import type { ExecutorAdapter } from "@tiphys/kernel";`, which does not resolve
for a TypeScript consumer either.

**Concrete fix.** In `plugin/package.json`, move `@tiphys/kernel` from
`devDependencies` to `peerDependencies` with `"@tiphys/kernel": "^0.1.0"`, plus a
`peerDependenciesMeta` entry if the status line is to stay optional, and keep the
existing root `overrides` entry so the workspace still resolves to the local root
rather than the published 0.1.0 tarball that M4-P5 measured as the trap
(delivery/work-history/m4-p5.md:176). Add a test to test/plugin-package.test.ts
that packs the plugin, installs the tarball into a scratch directory with nothing
else, and asserts `resolveKernelCli().ok` is true. That test is red today and
green after the move, which is the pair M4-P5's criterion 6 never had because it
asserted the SPELLING of the import and not the DECLARATION behind it.

### CR-A-003 (HIGH) The tool-call observer writes every payload verbatim into a durable, committed, pushed file

**Shipped behaviour at risk: any secret an agent handles. `tiphys sync` puts it
in a git remote.**

The observer is registered in plugin/.claude-plugin/plugin.json with NO
`matcher`, so it fires for every tool. It writes the payload VERBATIM by design
(plugin/src/hooks/tool-call-observer.ts:89), and a `PreToolUse` payload carries
`tool_input.command` for `Bash` and `tool_input.content` for `Write`. The
captured corpus shows both: witness/captures/m4-p9-pretooluse-payloads.txt:39
carries `"tool_input":{"file_path":"...","content":"HOTFIX\n"}` and
witness/captures/m4-p9-pretooluse-payloads.txt:55 carries
`"tool_input":{"command":"ls -la app.txt 2>&1", ...}`.

The log lands at `<fleet>/tasks/<id>/tool-calls.jsonl`, and `tasks/` is NOT
ephemeral:

```
FLEET_IGNORED = ["state/", "worktrees/", "projects/"]      (src/fleet.ts:29)
```

`tiphys sync` stages every changed path not in that set (src/commands/sync.ts:293)
and then commits and pushes. Reproduced end to end with a real `tiphys init`
fleet, a real bare remote and a synthetic secret:

```
$ node bin/tiphys.ts sync
COMMITTED tasks/t-9/tool-calls.jsonl
PUSHED origin
$ git show HEAD:tasks/t-9/tool-calls.jsonl | grep -o 'NPM_TOKEN=[A-Za-z0-9_]*'
NPM_TOKEN=npm_EXAMPLESECRETVALUE0123456789
```

The repository ships a `credential-scrub` gate for its own diffs; nothing guards
this path. The observer's own justification ("a summarised record would be
useless") is a real reason to keep the capture, not a reason to publish it.

**Concrete fix.** Two edits, either of which alone leaves a hole, so both.
(1) Add the tool-call log to the ephemeral set that `tiphys init` writes into the
fleet `.gitignore`, derived from `FLEET_IGNORED` at src/fleet.ts:29 so
`EPHEMERAL_DIRS` and the ignore file stay one source; if the log must survive a
clone, give it its own gitignored prefix such as `state/tool-calls/<id>.jsonl`
rather than a carve-out inside a durable tree, and change
`resolveToolCallLog` to derive that path. (2) Make `tiphys sync` refuse rather
than silently commit: add the log basename to the staged-ephemeral refusal at
src/commands/sync.ts:276 so an operator who ran `git add -A` first is stopped by
name. Red witness: append a payload carrying a token-shaped string, run
`tiphys sync`, and assert the remote's tree does not contain it. That assertion
fails today, with the captured output above as its red.

### CR-A-004 (MEDIUM) M4-P5 shipped seven behaviors and zero witness specs, and the one property most likely to be got wrong is unguarded

**Shipped behaviour at risk: the launch-record-before-payload contract, which is
the only thing standing between a failed launch and a worktree rollback.**

This is T-038's blast radius, still open on `main`. M4-P5 landed while
`red-witness` neither ran on plugin diffs nor required anything of them. Its
commit (2d8596c) contains no `witness/` path at all. Measured today:

```
plugin-package-not-in-kernel-tarball            behaviors=1 witness=no
plugin-tests-run-under-npm-test                 behaviors=1 witness=no
plugin-imports-kernel-by-package-name           behaviors=1 witness=no
plugin-adapter-satisfies-interface              behaviors=1 witness=no
plugin-adapter-record-before-payload            behaviors=1 witness=no
plugin-adapter-launch-failure-is-launch-failed  behaviors=1 witness=no
plugin-spawn-writes-turn-end-both-exit-codes    behaviors=1 witness=no
```

The gate's scoping is fixed now (`plugin/` in the precondition in the registry,
`plugin/src/` in `isAuditedSource` at src/gates/red-witness.ts:164), and that fix
makes this WORSE rather than better, because `plugin/src/adapter.ts` now reads as
covered. Three witnesses name the file, and every one of them mutates the same
line:

```
plugin-observer-log-never-read-as-state   find: const delivery = deliverStatusForTurn(request, exitCode);
plugin-status-failure-does-not-fail-turn  find: const delivery = deliverStatusForTurn(request, exitCode);
plugin-status-line-delivered-and-valid    find: const delivery = deliverStatusForTurn(request, exitCode);
```

No witness in the repository mutates the launch-record write or the
`launch-failed` arm:

```
$ grep -rl 'could not write the launch record\|writeFileSync(request.recordPath' witness/*.json
(no hits)
```

So a future edit that transposes the two outcome arms, which is the V-1 data-loss
defect M4-P5's own plan calls "the one thing a new adapter is most likely to get
wrong", passes the `red-witness` gate because a different line of the same file
is covered. The behaviour is correct today; I reproduced it (criterion 8 walk
below). The GUARD is what is missing.

**Concrete fix.** Add `witness/plugin-adapter-record-before-payload.json` with
two structurally different dangerous states over plugin/src/adapter.ts: (a) move
the `writeFileSync(request.recordPath, ...)` block to AFTER the `spawnSync` that
starts the payload, and (b) change the record-write catch arm's
`kind: "launch-failed"` to `kind: "incomplete"`. Both must redden
test/plugin-adapter.test.ts's existing launch-failure assertions. Add
`witness/plugin-adapter-launch-failure-is-launch-failed.json` for the
empty-command and spawn-error arms as its own class.

### CR-A-005 (MEDIUM) A bypass whose path list names the project root is a whole-project off switch

**Shipped behaviour at risk: M4-D-26's "explicit path list", and therefore M4-P9
criterion 4(b).**

plugin/src/hooks/project-write-block.ts:230 guards a declaration listing `/`, and
its comment says why: "a declaration listing `/` would cover every write in the
fleet, which is not an explicit path list, it is an off switch". The same
argument applies one level down and is not guarded. `isInside` is reflexive
(`path === root` returns true at line 136), so a listed entry equal to the
project root covers every path in that project. Reproduced:

```
bypass = { project: <root>, paths: [<root>], expiresAt: 2030-01-01 }
PERMIT  <root>/src/app.ts
PERMIT  <root>/package.json
PERMIT  <root>/deep/nested/any.txt
```

An "infrastructure hotfix" bypass declared this way is the block switched off for
that project until the expiry, which is the H-D hazard the two-carve-out design
exists to prevent, arriving through the carve-out rather than around it. It is
still expiry-bound and project-bound, which is why this is medium and not high.

**Concrete fix.** In `bypassDoesNotApply`, refuse a listed entry that resolves to
the project root itself, with the same reason shape the `/` case already
produces: `its path list names the project root <root>, which is an off switch
rather than an explicit path list`. Red witness: the three-row table above, with
the root entry refused and a genuine subtree entry such as `<root>/src/config.ts`
still permitted, so the guard is shown to be narrow rather than a blanket
refusal.

### CR-A-006 (LOW) The bypass compares canonicalised targets against un-canonicalised declarations, so a bypass declared through a symlinked path never applies

**Shipped behaviour at risk: the bypass, on any host where the fleet path
contains a symlink. macOS `/tmp` is one.**

The target is canonicalised through `realpathSync`
(plugin/src/hooks/project-write-block.ts:339) and the project roots are too (line
435), but `bypass.project` and each `bypass.paths` entry go through plain
`resolve()` only (lines 213 and 231). Reproduced, same fleet, same write, one
variable changed:

```
declaration written with the literal fleet path    -> PERMIT
declaration written through a symlink to that path -> REFUSE
```

The refusal names the working tree and says no bypass applied; it does not say
the declaration failed to match because of canonicalisation, so an operator
reading it would re-declare the same thing. The direction is fail-safe, which is
why this is low and not medium, but the repository ships four macOS portability
witnesses and this is the family they are about.

**Concrete fix.** Apply `canonicalisePath` to `bypass.project` and to every
`bypass.paths` entry inside `bypassDoesNotApply`; or, if `decideWrite`'s purity
must be kept absolute, canonicalise them once in `readBypass`, where the
filesystem is already being touched, and document that the declaration crosses
into `decideWrite` canonical exactly as the target does. Red witness: the two-row
table above under a symlinked fleet root.

### CR-A-007 (LOW) An undelivered status line is reported on the incomplete arm and discarded on the normal one

**Shipped behaviour at risk: knowing that CR-A-002 is happening.**

`deliverStatusForTurn` returns the failure reason, and `statusSuffix`
(plugin/src/adapter.ts:343) appends it to exactly one message: the `incomplete`
reason at plugin/src/adapter.ts:246. The `completed` return at
plugin/src/adapter.ts:260 drops it. So on the normal path, a status line that was
never delivered produces no output anywhere. The file's own comment says
"Silence about an undelivered status line is the shape this repository keeps
paying for, and a suffix costs nothing", and the suffix is on the rarer arm. This
is why CR-A-002 is silent in practice.

**Concrete fix.** Write the reason to `process.stderr` from
`deliverStatusForTurn` when it is non-empty, before returning it, so both arms
report it once and neither can change the outcome. Assert it in
test/plugin-hooks.test.ts by removing the status directory and checking stderr on
a `completed` launch. That assertion is red today.

### CR-A-008 (LOW) The write block refuses every Write and Edit outside a fleet home, and nothing warns a consumer

**Shipped behaviour at risk: the Write and Edit tools, for anyone who installs
the published plugin in an ordinary repository.**

The manifest registers the block for `Write|Edit|MultiEdit|NotebookEdit`
unconditionally. `runHook` resolves the fleet home by walking up from the
payload's `cwd` and refuses when it finds none
(plugin/src/hooks/project-write-block.ts:617). Reproduced:

```
exit=2  REFUSE  /nowhere-at-all/x.ts
tiphys project-write block: the project root could not be resolved for this Write
call: no fleet home was found at or above /nowhere-at-all (a fleet home carries
charter/, decisions/, state/, tasks/, worktrees/, projects/)
```

This is M4-P9 criterion 7 working as specified, and it is also a plugin that
makes Claude Code unable to write a file in any directory that is not under a
fleet home. Nothing in plugin/package.json's description or in
plugin/.claude-plugin/plugin.json says so.

**Concrete fix.** Either narrow the refusal so an unresolvable FLEET home is a
permit while an unresolvable PROJECT root inside a fleet stays a refusal, which
keeps criterion 7's actual hazard (a fleet write that cannot be located) and
drops the one it did not intend; or state the constraint in the manifest
description and in the plugin package's README so an installer knows before the
first refused write. The first is the smaller change and the one I would make;
the second is not sufficient alone.

---

## 3. What I tried to break and could not

Recorded because an approve with no findings is a failed review, and so is a
finding list with no account of the attempts that held.

- **Transposing the two launch outcome arms.** Drove the compiled adapter with
  `recordPath` pointing at a directory. Got `launch-failed`, and the payload
  marker file did NOT exist, so the record really is written before the payload
  starts. The arms are not transposed.
- **A non-integer reaching the generated turn-end hook.** Six inputs through
  `payloadExitCode`, including the degenerate both-null pair and an unmapped
  signal name. Every answer was an integer: 0, 7, 137, 143, 128, 128. A
  `status ?? 0` implementation would have returned 0 for the signal rows; it does
  not.
- **Laundering a self-report into an observation.** Both members. A `resolved`
  block claiming `observed` with no observation is refused by the SCHEMA; one
  whose observation names another task, or another model, is refused by the
  READER with a reason naming both values. I tried the same trick one block over,
  on `resolution.provenance`, and the schema refused that too.
- **Comparing family tokens across vocabularies.** Refused with both ids named.
  Same vocabulary compares.
- **A vendor model name in the kernel.** Grepped `src/` and `bin/` for six vendor
  name shapes outside the vocabulary module. Zero hits, and the witness guarding
  it has two structurally different members, one a source comment and one a
  schema enum.
- **Getting the plugin into the kernel tarball.** `npm pack --dry-run` at the
  root lists 204 files and zero under `plugin/`. The plugin's own tarball lists
  19 files including the adapter and the manifest.
- **A relative import climbing out of the plugin.** Grepped the compiled
  JavaScript and the declarations for `../src`. Zero hits; the only kernel
  reference in emitted JS is the runtime `resolve` call CR-A-002 is about.
- **Reading state from an append-only log.** `decideWrite` has no log parameter
  at all, so deleting the evidence log cannot change a verdict; the observer
  module has an append site and no read site anywhere in either package.
- **A substring `.git` match.** `<root>/.gitignore` is refused. The carve-out is
  segment-wise and first-segment-only, exactly as documented. CR-A-001 is not
  about that; it is about what the first segment lets through.
- **Injecting a failing plugin test.** It reddens. The plugin's tests really do
  execute under the gate's own invocation.

## 4. What I did not reach

- **No live `claude` session.** I did not start the Claude Code binary, so
  nothing here confirms that the manifest loads, that `${CLAUDE_PLUGIN_ROOT}`
  expands to the directory the manifest assumes, or that a hook writing to stderr
  while exiting 0 is still non-blocking. All three are named as unestablished in
  delivery/work-history/m4-p6.md:37 and I closed none of them. CR-A-001's
  escalation was driven through the hook's own `runHook` entry point plus a real
  `git merge`, which is the same code the hook runs, but the hook was not fired
  by the harness.
- **I did not re-run any phase at its own merge head.** Every measurement is
  against `main` at 0eaf453. Where a criterion asks for a number at the phase
  head, I have said so.
- **M4-P7 criterion 7 was READ, not RUN.** I read the three `overrideApplied`
  arms at plugin/src/model-resolution.ts:137, :164 and :171 and confirmed the
  test exists at test/model-resolution.test.ts:864 and passed in my own run. I
  did not construct a `role-model-config.yaml` and a charter myself.
- **Concurrency on the observer log was not exercised**, which
  delivery/work-history/m4-p6.md:37 item 4 already names.
- **I did not reproduce the M4-P5 criterion 9 spawn by hand.** I relied on the
  test that does it, which ran green in my own invocation.
- **I did not run the gate bundle.** The `gates run` harness was not invoked; my
  claims about `red-witness` scoping are read from src/gates/red-witness.ts:164
  and the registry, not from a gate verdict.

## 5. Criteria walk

Every criterion of all four phases, one at a time. "MET" means I ran or read
something that settles it and it holds; "NOT MET" means it does not hold, or I
could not reach it, and the reason is given. Nothing below is inferred from a
work history's own claim alone.

### M4-P5 (delivery/plan/kernel-plan-m4.md:741)

1. **MET.** `npm ci` exit 0, `grep -c EBADENGINE` on the log returns 0,
   `workspaces: ["plugin"]` in the root package.json, and the plugin resolves as
   a workspace.
2. **MET.** `npm run build` exit 0 and `git status --porcelain` empty afterwards.
   The project reference runs plugin-to-kernel (declared deviation 1).
3. **MET.** Root `npm pack --dry-run`: 204 files, 0 under the plugin directory.
   Plugin workspace `npm pack --dry-run`: 19 files including
   `dist/src/adapter.js` and `.claude-plugin/plugin.json`.
4. **MET, red and green both driven.** I appended a deliberately failing
   assertion to test/plugin-package.test.ts and ran
   `node --test "test/plugin-package.test.ts"`: exit 1. Restored the file: exit 0,
   `git status --porcelain` on it empty. The `npm test` script's glob
   `test/**/*.test.ts` covers that file, so the same injection reaches the gate's
   own invocation. I ran the injection against the single file rather than the
   whole suite because the whole suite already exits 1 for the environmental
   reason in section 1, which would have made the injection indistinguishable.
5. **MET.** Both invocations established at this head, same interpreter and build
   state: `npm test` gives 1282 tests / 1281 pass / 1 fail / 0 skipped, and bare
   `node --test` gives 1284 / 1283 / 1 / 0. The two-test gap is the tracked root
   sandbox fixture, which is the documented cause.
6. **MET.** Grepped the compiled JavaScript and the declarations for `../src`:
   zero hits. The only kernel reference in emitted JS is the package-name
   `resolve` call at plugin/dist/src/status.js:93, which is a package name and
   not a relative path.
7. **MET.** `claudeCodeAdapter` is typed `ExecutorAdapter`, `ADAPTER_NAME` is
   `claude-code` (not `subprocess`), `ADAPTER_REQUIRES` is `["briefPath"]`, and
   test/plugin-adapter.test.ts compares the name against the kernel's exported
   `BUILT_IN_ADAPTER_NAME` rather than a second literal.
8. **MET, reproduced.** `recordPath` pointed at a directory gives
   `kind: "launch-failed"` with EISDIR in the reason, and the payload's marker
   file does not exist, so the record write precedes the payload. A healthy launch
   gives `completed` with the record on disk and the turn-end record written. See
   CR-A-004: this holds and nothing guards it.
9. **MET.** The test at test/plugin-adapter.test.ts:408 runs a real
   `tiphys spawn --task ... --adapter @tiphys/claude-code-plugin` for payload exit
   codes 0 and 7 and asserts `tasks/<id>/turn-end` for both. It passed in my own
   run of the five plugin test files (43 pass, 0 skipped). I did not drive the CLI
   by hand.
10. **NOT MET on `main` in this container.** `npm test` exits 1 with one failure.
    The failure is test/gates.test.ts:3659 and is the scratch-prefix traversal
    trap of standing warning 1, outside this group. Reported as not met because
    that is what the command did, not because of anything in the group.

### M4-P6 (delivery/plan/kernel-plan-m4.md:882)

1. **MET, reproduced.** Every `payloadExitCode` input returns an integer,
   including `(null, null)`, which gives 128.
2. **MET, reproduced.** `(null, "SIGKILL")` gives 137 and `(null, "SIGTERM")`
   gives 143, read from `os.constants.signals` rather than a hand-written table.
   The `?? 0` implementation the criterion names would give 0 for both.
3. **MET.** The adapter calls `invokeTurnEndHook` directly at
   plugin/src/adapter.ts:235 and there is no `Stop` hook anywhere in the manifest.
4. **MET.** The observer writes nothing to stdout on any path and calls
   `process.exit(0)` unconditionally at
   plugin/src/hooks/tool-call-observer.ts:189, which the captured contract says is
   the channel a `PreToolUse` decision travels on. I reproduced an append: one
   line gained, carrying the tool and the target.
5. **MET, reproduced.** The payload object crosses into the record untouched and
   `payloadSha256` is over the ARRIVING bytes, so a rewritten record is
   detectable. My reproduction round-tripped a Bash payload byte for byte. See
   CR-A-003: this is correct and it is what makes CR-A-003 possible.
6. **MET.** `grep -rn 'tool-calls' src/ plugin/src/` returns three hits, all in
   the observer: two comments and the basename constant. No read site exists in
   either package.
7. **MET IN THE REPOSITORY, NOT FOR A CONSUMER.** The plugin holds no status path
   and goes through `tiphys status emit` and `tiphys status show`, which is the
   correct C-1 split, and the test is green. On a clean install of the published
   tarball, `resolveKernelCli()` fails and no record is ever emitted. Recorded as
   met because the criterion as written was discharged at the phase head;
   CR-A-002 carries the severity.
8. **MET.** Every function in plugin/src/status.ts returns its failure as data,
   `deliverStatusForTurn` returns a string on every arm, and the witness
   `plugin-status-failure-does-not-fail-turn` carries two structurally different
   mutants, one in status.ts and one in adapter.ts.
9. **NOT MET on `main` in this container**, for the same environmental reason as
   M4-P5 criterion 10. Build is exit 0 and `git status` is clean; the suite is
   not exit 0.

### M4-P7 (delivery/plan/kernel-plan-m4.md:1018)

1. **MET, reproduced with the real CLI.** On a record the plugin's own writer
   produced: exit 0. Missing subject echo: exit 1,
   `#/subject required property subject is missing`. Subject echo that does not
   match: exit 1, `#/resolution/tier ... the resolved tier strongest is not the
   requested tier cheapest`. Absent vocabulary identity: exit 1,
   `#/resolved/vocabulary required property vocabulary is missing`.
2. **MET.** `recordModelResolution` is called at plugin/src/adapter.ts:258, after
   `invokeTurnEndHook` returned ok, and it reads the turn-end record from disk
   rather than reconstructing it. A record I built through the shipped builder
   carries `writtenAt` 00:00:05 against `turnEnd.endedAt` 00:00:00.
3. **MET, reproduced both directions.** Two records with different
   `vocabulary.id` give `kind: "refused"` with both ids in the reason. The same id
   gives `kind: "compared"` with the two family tokens.
4. **MET.** Six vendor name shapes grepped across `src/` and `bin/` outside the
   vocabulary module: zero hits. The vocabulary lives only in
   plugin/src/vocabulary.ts. `vocabularyIdentity` at src/model-resolution.ts:157
   reads exactly two named fields, and the test drives it with a Proxy that
   records every property read.
5. **MET, reproduced.** `modelResolutionPathBeside` writes beside the launch
   record inside `tasks/<id>/`. An absent record gives `kind: "error"` with
   `exit 0 with no record is error, not success`, never green and never
   not-applicable.
6. **MET, both members reproduced.** Member one: `resolved.provenance: "observed"`
   with no observation is refused by the schema at `#/resolved`. Member two: an
   observation naming task `t-OTHER` is refused by the READER with both task ids
   named, and an observation seeing `claude-haiku-9` against a claimed
   `claude-opus-5` is refused naming both models. An agreeing observation is
   accepted with `provenance: "observed"`.
7. **MET BY READING, NOT BY RUNNING.** The three arms are at
   plugin/src/model-resolution.ts:137 (`overrideApplied: false`, no policy), :164
   (`overrideApplied: false`, the role forbids it, reason naming the config path)
   and :171 (`overrideApplied: true` with `charterPath` echoed). The test at
   test/model-resolution.test.ts:864 asserts both directions and passed in my run.
   I did not build a charter myself.
8. **MET.** `producedByFromRecord` at src/model-resolution.ts:370 returns
   `resolved.family` with no normalisation, lowercasing or prefixing, which is the
   byte-for-byte property the criterion asks for, and the witness
   `model-resolution-family-token-reaches-verdict` guards it.
9. **NOT MET on `main` in this container**, same environmental reason.

### M4-P9 (delivery/plan/kernel-plan-m4.md:1588)

1. **MET.** `node --test test/project-write-block.test.ts`: 11 tests, 11 pass,
   0 fail, 0 skipped, exit 0, node v26.6.0, `dist/` built.
2. **MET.** `decideWrite` refuses `<root>/src/app.ts` and `runHook` exits 2 for
   the same request, with a reason naming the tree and the absent bypass. The test
   asserts the dangerous direction too: with the hook absent the write lands.
3. **MET as written, and see CR-A-001.** The ref update is permitted and a real
   `git merge --ff-only` moves the ref. The carve-out is wider than "a ref
   update", which is CR-A-001 and not a failure of this criterion's own assertion.
4. **MET, both members.** An expired declaration does not permit a write its path
   list covers; a current one does not permit a write outside its list. Both
   refusals name the declaration, who declared it, when, and why it did not apply.
   See CR-A-005 for the member the class is missing.
5. **MET.** `decideWrite` takes no log parameter at all
   (plugin/src/hooks/project-write-block.ts:261), so no deletion of the log can
   change a verdict. This is stronger than the criterion asks for: the property is
   structural rather than tested.
6. **NOT MET.** The phase discharged it for the file-writing tools and declared
   the `Bash` residual honestly, in the capture and in a registered test. But
   CR-A-001 uses `Write`, which IS an adjudicated tool, and it produces
   `git status --porcelain` equal to ` M src.txt` in the project clone after the
   release manager's own merge. The criterion's assertion is that this output is
   empty. Reproduced in section 2.
7. **MET, reproduced.** A payload whose fleet home cannot be found exits 2 with a
   reason naming the resolution failure and the markers it looked for. The
   `ProjectRoots` discriminated union makes the fail-open spelling a compile
   error, which the phase proved with `tsc --noEmit --strict` rather than
   asserting. See CR-A-008 for the consequence outside a fleet.

## 6. Deviations judged

- **M4-P5 deviation 1** (the project reference runs plugin-to-kernel, so
  `tsconfig.src.json` is not edited): SERVES THE PLAN'S INTENT. The plan's
  files-to-touch named the wrong file for the dependency direction it also
  requires; the shipped direction is the only one that compiles, and the build
  covers the plugin, which I verified by running it.
- **M4-P5 file-level deviation** (`test/license-gate.test.ts` edited and not on
  the declaration, declared rather than smuggled): SERVES THE PLAN'S INTENT. The
  plan's packaging trap 4 names the collision without naming the file, and the
  edit is what makes the license gate see two workspaces.
- **M4-P6 deviation** (the fixtures are a projection of M4-P1's payloads, not
  whole payloads): SERVES THE PLAN'S INTENT, and it is declared in PROVENANCE.md
  and in the not-covered list. Note that M4-P9 later captured the whole payload,
  which is what makes CR-A-003 visible at all.
- **M4-P7 deviation 1** (`src/commands/validate.ts` and `src/checks.ts` added to
  the declaration because `src/validate.ts` holds neither the type table nor the
  resolver): SERVES THE PLAN'S INTENT, and the substitution is proved by a grep in
  the work history rather than asserted.
- **M4-P7 deviation 2** (an eleventh behavior,
  `model-resolution-empty-observation-is-unresolved`): SERVES THE PLAN'S INTENT.
  An empty observation is a third state between the criterion's two, and closing
  it is strictly narrowing.
- **M4-P7 deviation 3** (`provenance` carries three values, not two): SERVES THE
  PLAN'S INTENT. `unresolved` is the honest third answer, and the reader refuses a
  record that ranks itself `self-reported` while carrying an observation, so the
  extra value widens nothing.
- **M4-P7 deviation 4** (the observation channel is injected, not discovered):
  SERVES THE PLAN'S INTENT and is the design the plan explicitly asked to survive
  either answer from M4-P1. The adapter passes no observation and the record
  therefore ranks itself `self-reported`, which is the honest arm.
- **M4-P9** declares no deviations. The plan's files-to-touch recommended
  `packages/claude-code-plugin/` and the phase used the `plugin/` tree M4-P5
  created, which the plan's own "whichever way round, ONE phase creates it" clause
  anticipates. `AGENTS.md` was edited as the plan required (25 lines in 713731f).
  I judge the undeclared directory choice as SERVING THE PLAN'S INTENT, and note
  that declaring it would have cost one paragraph.

## 7. Verdict

**FIX-ROUND-NEEDED.** Three high findings, two of which I reproduced end to end
against shipped artifacts (CR-A-001 through a real `git merge`, CR-A-003 through
a real `tiphys sync` and a real remote) and one of which I reproduced against a
clean install of the actually-published tarball (CR-A-002). Two mediums and three
lows behind them.

The phases themselves are unusually well built. Every work history opens with its
not-covered section, three of the four publish a derivation with its full output,
and the property this repository has paid the most for (the launch-record
ordering) is implemented correctly. What is wrong sits in three places where a
correct local decision composes into something none of the four phases owned: a
carve-out sized for one operation that admits another (CR-A-001), a dependency
classification that one phase made honestly and the next phase invalidated
without moving it (CR-A-002), and a verbatim capture written into a tree the
kernel treats as durable and pushes (CR-A-003). All three are the shape a
retrospective review exists to catch, because nobody reviewed the composition:
nobody reviewed anything.


## The JSON verdict, embedded rather than committed at the corpus root

Same treatment and same reason as the group B review. `check-dual-review` reads
its corpus from the TOP LEVEL of `delivery/review/`, non-recursively, and a
verdict reading FIX-ROUND-NEEDED with unresolved findings correctly turns it red.
That was measured on a scratch commit for group B, not assumed. A verdict saying
FIX-ROUND-NEEDED is not evidence a head may merge, so it lands at the corpus root
when a fix round has closed the findings and a re-review can honestly say
APPROVE. Moving it to a subdirectory to keep the gate quiet would be defeating a
guard by file placement, which src/checks.ts:3039 records this repository being
bitten by once already.

```json
{
  "kind": "verdict",
  "phase": "M4-P5",
  "head": "0eaf4532c9fda42609481234c4a3fc800367cc76",
  "verdict": "FIX-ROUND-NEEDED",
  "produced-by": "Claude Opus 5 (Anthropic)",
  "framing": "criteria-contract",
  "review-contract": "criteria",
  "findings": [
    {
      "id": "CR-A-001",
      "severity": "high",
      "evidence": [
        "plugin/src/hooks/project-write-block.ts:162 isGitInternal permits any path whose first segment under the project root is .git, while delivery/plan/kernel-plan-m4.md:1536 scopes the carve-out to a ref update",
        "decideWrite driven against the compiled module, one observed project root, no bypass: <root>/src/app.ts REFUSE; <root>/.git/refs/heads/main PERMIT; <root>/.git/hooks/pre-commit PERMIT; <root>/.git/config PERMIT; <root>/.git PERMIT; <root>/.gitignore REFUSE",
        "runHook driven with a real PreToolUse payload in a real fleet home: exit=2 REFUSE for <root>/src.txt, exit=0 PERMIT for <root>/.git/hooks/post-merge",
        "after writing the permitted post-merge hook and running git merge --ff-only feature in that clone: cat src.txt prints OWNED-BY-POST-MERGE-HOOK and git status --porcelain prints ' M src.txt'",
        "M4-P9 criterion 6 asserts git status --porcelain is empty after a real agent turn; the tool used here is Write, which is in ADJUDICATED_TOOLS at plugin/src/hooks/project-write-block.ts:75, so this is not the declared Bash residual",
        "test/project-write-block.test.ts asserts 'a real git merge --ff-only moves the ref and the block permits every path it wrote', which tests that the carve-out is wide enough and never that it is narrow enough",
        "delivery/work-history/m4-p9.md:93 enumerates the three permit sites and asks of each whether the fact it rests on was established, which is a different question from whether the permitted set is the intended set"
      ],
      "concrete-fix": "Replace isGitInternal at plugin/src/hooks/project-write-block.ts:162 with a predicate that permits only the ref surface a git ref update touches inside <root>/.git (HEAD, ORIG_HEAD, FETCH_HEAD, MERGE_HEAD, index, packed-refs, refs/**, logs/**, objects/**) and REFUSES everything else, naming hooks/ and config in the refusal reason. Add a red witness with two structurally different members, <root>/.git/hooks/pre-commit (executed by git directly) and <root>/.git/config (read as configuration), and keep the existing real git merge --ff-only test as the proof that the narrowed set is still wide enough.",
      "analysis": "The block's whole purpose is that an agent cannot change a project working tree. One permitted write into .git/hooks/ converts the release manager's own carved-out merge into the working-tree write that was refused. The defect is not that the carve-out exists; it is that its boundary was drawn at a directory rather than at the operation the decision record names."
    },
    {
      "id": "CR-A-002",
      "severity": "high",
      "evidence": [
        "plugin/package.json declares @tiphys/kernel only under devDependencies; there is no dependencies and no peerDependencies block",
        "delivery/work-history/m4-p5.md:196 states the choice and its trigger: 'A dependencies entry would assert a runtime need this package does not have. M4-P6 or M4-P7 importing a kernel VALUE is what would move it'",
        "plugin/src/status.ts:102 calls createRequire(import.meta.url).resolve('@tiphys/kernel/package.json') at run time; it survives compilation and is present at plugin/dist/src/status.js:93",
        "npm pack -w @tiphys/claude-code-plugin produces a 19-file tarball; npm install of that tarball into an empty project reports 'added 1 package' and node_modules/@tiphys contains only claude-code-plugin",
        "importing the installed plugin's dist/src/status.js and calling resolveKernelCli() returns {ok:false, reason:\"@tiphys/kernel could not be resolved from the plugin: Error: Cannot find module '@tiphys/kernel/package.json'\"}",
        "plugin/src/adapter.ts:323 returns that reason from deliverStatusForTurn, so no status record is emitted on any consumer install",
        "plugin/dist/src/adapter.d.ts:1 is 'import type { ExecutorAdapter } from \"@tiphys/kernel\";', which does not resolve for a TypeScript consumer either"
      ],
      "concrete-fix": "In plugin/package.json move @tiphys/kernel from devDependencies to peerDependencies as \"@tiphys/kernel\": \"^0.1.0\", adding a peerDependenciesMeta entry only if status delivery is meant to stay optional, and keep the root overrides entry so the workspace still resolves to the local root rather than the published 0.1.0 tarball that delivery/work-history/m4-p5.md:176 measured as the trap. Add a test in test/plugin-package.test.ts that packs the plugin, installs the tarball into a scratch directory containing nothing else, and asserts resolveKernelCli().ok is true; that test is red today and green after the move.",
      "analysis": "M4-P5's criterion 6 asserts the SPELLING of the kernel import and not the DECLARATION behind it, so the hazard it names (an import that works here and breaks for every consumer) was left open in a second form. M4-P6 then walked into exactly the case M4-P5 wrote down. This is the clearest instance in the group of a criterion that was met at its own phase head and is no longer sufficient on main."
    },
    {
      "id": "CR-A-003",
      "severity": "high",
      "evidence": [
        "plugin/.claude-plugin/plugin.json registers the tool-call observer as a PreToolUse hook with no matcher, so it fires for every tool call",
        "plugin/src/hooks/tool-call-observer.ts:89 records the payload VERBATIM by design, adding only receivedAt and payloadSha256",
        "witness/captures/m4-p9-pretooluse-payloads.txt:39 shows a Write payload carrying tool_input.content; witness/captures/m4-p9-pretooluse-payloads.txt:55 and :90 show Bash payloads carrying tool_input.command, including a heredoc",
        "src/fleet.ts:29 declares FLEET_IGNORED as exactly state/, worktrees/ and projects/, so tasks/ is durable and tracked",
        "src/commands/sync.ts:293 stages every changed path not in the ephemeral set and then commits and pushes it",
        "reproduced with a real tiphys init fleet and a real bare remote: driving observeToolCall with a Bash payload whose command contains NPM_TOKEN=npm_EXAMPLESECRETVALUE0123456789 wrote tasks/t-9/tool-calls.jsonl; node bin/tiphys.ts sync then printed 'COMMITTED tasks/t-9/tool-calls.jsonl' and 'PUSHED origin'",
        "git show HEAD:tasks/t-9/tool-calls.jsonl | grep -o 'NPM_TOKEN=[A-Za-z0-9_]*' returned NPM_TOKEN=npm_EXAMPLESECRETVALUE0123456789 out of the committed tree"
      ],
      "concrete-fix": "Two edits, both needed. (1) Move the observer's log out of the durable tree: change resolveToolCallLog at plugin/src/hooks/tool-call-observer.ts:63 to write under a gitignored prefix such as <fleet>/state/tool-calls/<taskId>.jsonl, which FLEET_IGNORED at src/fleet.ts:29 already covers, so the ignore file and EPHEMERAL_DIRS stay one source. (2) Make tiphys sync refuse rather than silently commit a tool-call log that reached the index: add the basename to the staged-ephemeral refusal at src/commands/sync.ts:276 so an operator who ran git add -A first is stopped by name. Red witness: append a payload carrying a token-shaped string, run tiphys sync, and assert the remote tree does not contain it; the captured COMMITTED and PUSHED lines above are that witness's red.",
      "analysis": "The verbatim capture is correct and is the whole reason the observer exists, so the fix is about WHERE it lands rather than about what it records. The repository ships a credential-scrub gate for its own diffs and nothing at all for fleet homes, and tiphys sync is the documented operating discipline rather than an unusual action, so the reachability is the normal path and not an edge case."
    },
    {
      "id": "CR-A-004",
      "severity": "medium",
      "evidence": [
        "M4-P5's merge commit 2d8596c contains no path under witness/ at all, while shipping plugin/src/adapter.ts and plugin/src/index.ts",
        "all seven of M4-P5's declared behaviors are registered in test/behaviors.json and none has a witness spec: plugin-package-not-in-kernel-tarball, plugin-tests-run-under-npm-test, plugin-imports-kernel-by-package-name, plugin-adapter-satisfies-interface, plugin-adapter-record-before-payload, plugin-adapter-launch-failure-is-launch-failed, plugin-spawn-writes-turn-end-both-exit-codes",
        "delivery/tuition/T-038-the-plugin-package-had-no-red-witness-gate.md:1 records that red-witness neither ran on nor required anything of plugin diffs for the window covering M4-P5",
        "src/gates/red-witness.ts:164 now includes plugin/src/ in isAuditedSource, so plugin/src/adapter.ts carries a coverage obligation today",
        "the three witness specs naming plugin/src/adapter.ts (plugin-observer-log-never-read-as-state, plugin-status-failure-does-not-fail-turn, plugin-status-line-delivered-and-valid) each mutate the same single line, 'const delivery = deliverStatusForTurn(request, exitCode);'",
        "grep -rl 'could not write the launch record\\|writeFileSync(request.recordPath' witness/*.json returns no hits, so nothing mutates the launch-record write or the launch-failed arm",
        "the behaviour itself is correct: driving the compiled adapter with recordPath pointing at a directory returned kind launch-failed with EISDIR and the payload marker file did not exist"
      ],
      "concrete-fix": "Add witness/plugin-adapter-record-before-payload.json with two structurally different dangerous states over plugin/src/adapter.ts: (a) relocate the writeFileSync(request.recordPath, ...) block to after the spawnSync that starts the payload, and (b) change the record-write catch arm's kind from launch-failed to incomplete. Add witness/plugin-adapter-launch-failure-is-launch-failed.json covering the empty-command and spawn-error arms as its own class. Both must redden the existing launch-failure assertions in test/plugin-adapter.test.ts.",
      "analysis": "The fixed gate scoping makes this worse rather than better: because three M4-P6 witnesses name adapter.ts, the file reads as covered, so a regression in the launch-record ordering would pass red-witness on a file-level check while no dangerous state touches it. That is the guard-that-cannot-go-red shape one level in, the same one T-038's own postscript records for isAuditedSource."
    },
    {
      "id": "CR-A-005",
      "severity": "medium",
      "evidence": [
        "plugin/src/hooks/project-write-block.ts:230 guards a declaration listing / with the comment 'a declaration listing / would cover every write in the fleet, which is not an explicit path list, it is an off switch', and applies no equivalent guard to the project root",
        "isInside at plugin/src/hooks/project-write-block.ts:136 returns true when path equals root, so a listed entry equal to the project root satisfies both isInside(projectRoot, listed) and isInside(listed, targetPath) for every target in the project",
        "reproduced against the compiled decideWrite with a current declaration whose paths array holds only the project root: <root>/src/app.ts PERMIT, <root>/package.json PERMIT, <root>/deep/nested/any.txt PERMIT",
        "delivery/plan/kernel-plan-m4.md:1519 specifies the bypass as naming 'an explicit path list', and M4-P9 criterion 4(b) tests only that a write OUTSIDE the list is refused"
      ],
      "concrete-fix": "In bypassDoesNotApply at plugin/src/hooks/project-write-block.ts:204, refuse a listed entry that resolves to the project root itself, with the same reason shape the / case already produces: 'its path list names the project root <root>, which is an off switch rather than an explicit path list'. Red witness: the three-row table above with the root entry refused, plus a genuine subtree entry such as <root>/src/config.ts still permitted, so the new guard is shown to be narrow rather than a blanket refusal.",
      "analysis": "This is medium rather than high because the bypass is still expiry-bound, project-bound and evidence-logged, so it is a declared act that goes too far rather than an undeclared one. It is not low because it is the H-D hazard the two-carve-out design exists to prevent arriving through the carve-out, and because the code already contains the argument that rules it out one level up."
    },
    {
      "id": "CR-A-006",
      "severity": "low",
      "evidence": [
        "the write target is canonicalised through canonicalisePath at plugin/src/hooks/project-write-block.ts:339 and project roots at plugin/src/hooks/project-write-block.ts:435, but bypass.project at line 213 and each bypass.paths entry at line 231 go through plain resolve() only",
        "reproduced in one fleet home, same write, one variable changed: a declaration written with the literal fleet path gives PERMIT, and the identical declaration written through a symlink to that same path gives REFUSE",
        "the refusal names the working tree and says no bypass applied; it does not name canonicalisation, so an operator reading it would re-declare the same document",
        "the repository ships four macOS portability witnesses (macos-portability-credentials-entry, -git-nosystem, -path-identity, -scope-entry, -suite-entry), and macOS resolves /tmp to /private/tmp, which is exactly this shape"
      ],
      "concrete-fix": "Apply canonicalisePath to bypass.project and to every bypass.paths entry inside bypassDoesNotApply at plugin/src/hooks/project-write-block.ts:204; or, to keep decideWrite free of filesystem access, canonicalise them once in readBypass at plugin/src/hooks/project-write-block.ts:463, where the filesystem is already being read, and state in that function's comment that the declaration crosses into decideWrite canonical exactly as the target does. Red witness: the two-row table above driven under a symlinked fleet root.",
      "analysis": "The direction is fail-safe, so nothing is permitted that should not be; the cost is a shipped bypass that cannot be used on a host whose fleet path contains a symlink, and a diagnostic that sends the operator to the wrong place."
    },
    {
      "id": "CR-A-007",
      "severity": "low",
      "evidence": [
        "statusSuffix at plugin/src/adapter.ts:343 is referenced exactly once, in the incomplete reason at plugin/src/adapter.ts:246",
        "the completed return at plugin/src/adapter.ts:260 discards the value deliverStatusForTurn returned, so an undelivered status line on the normal path produces no output anywhere",
        "the same file's comment at plugin/src/adapter.ts:340 states 'Silence about an undelivered status line is the shape this repository keeps paying for, and a suffix costs nothing'",
        "this is why CR-A-002 is silent in practice: on a consumer install every launch takes the completed path and the resolution failure is dropped"
      ],
      "concrete-fix": "In deliverStatusForTurn at plugin/src/adapter.ts:322, write the non-empty reason to process.stderr before returning it, so both arms report it exactly once and neither can change the outcome the adapter reports. Assert it in test/plugin-hooks.test.ts by removing the directory the status emit writes into and checking stderr on a launch that returns completed; that assertion is red today.",
      "analysis": "Low on its own, because nothing breaks. It earns a finding because it is the reporting channel that would have surfaced CR-A-002 on the first consumer launch, and the file already contains the rule it breaks."
    },
    {
      "id": "CR-A-008",
      "severity": "low",
      "evidence": [
        "plugin/.claude-plugin/plugin.json registers the project-write block for Write|Edit|MultiEdit|NotebookEdit with no scoping to a fleet home",
        "runHook at plugin/src/hooks/project-write-block.ts:617 refuses with exit 2 whenever findFleetHome returns not ok",
        "reproduced: a payload whose cwd is /nowhere-at-all returns exit=2 with 'the project root could not be resolved for this Write call: no fleet home was found at or above /nowhere-at-all (a fleet home carries charter/, decisions/, state/, tasks/, worktrees/, projects/)'",
        "neither plugin/package.json's description nor plugin/.claude-plugin/plugin.json's description states that the plugin refuses every file write outside a fleet home"
      ],
      "concrete-fix": "Split the two resolution failures in runHook at plugin/src/hooks/project-write-block.ts:617: an unresolvable FLEET home becomes a permit with a reason saying the write is outside any fleet, while an unresolvable PROJECT root inside a resolved fleet stays a refusal, which is the hazard M4-P9 criterion 7 actually names. If the refusal is kept deliberately, state it in plugin/.claude-plugin/plugin.json's description and in the plugin package README so an installer learns it before the first refused write. The first option is the smaller change; the second alone is not sufficient.",
      "analysis": "This is the shipped behaviour matching criterion 7's letter and exceeding its intent. Criterion 7 is about a request whose PROJECT root cannot be resolved, which is a write somewhere inside a fleet that the hook cannot place; a write in a directory that is not under any fleet at all is a different case and the plugin treats them as one."
    }
  ],
  "criteria": [
    {
      "id": "M4-P5-1",
      "quote": "npm ci at the repository root exits 0 with no EBADENGINE line on the floor-satisfying toolchain, and installs both workspaces.",
      "evidence": [
        "ran npm ci on node v26.6.0 in a fresh clone reset to origin/main: exit 0",
        "grep -c EBADENGINE over the captured npm ci log returns 0",
        "root package.json declares workspaces: [\"plugin\"] and the plugin resolves as a workspace"
      ],
      "met": true
    },
    {
      "id": "M4-P5-2",
      "quote": "npm run build exits 0 and git status is clean afterwards, with the plugin compiled through its own project reference.",
      "evidence": [
        "ran npm run build: exit 0",
        "git status --porcelain immediately afterwards: empty",
        "plugin/dist/src/*.js and *.d.ts exist and plugin/dist is gitignored (git check-ignore -v reports .gitignore:2:dist/), and git ls-files plugin/dist returns 0"
      ],
      "met": true
    },
    {
      "id": "M4-P5-3",
      "quote": "The plugin is not in the kernel tarball (red witness 1). npm pack --dry-run in the repository root lists no path under the plugin directory. The other direction: npm pack --dry-run inside the plugin workspace DOES list the adapter and the manifest.",
      "evidence": [
        "npm pack --dry-run --json at the repository root: 204 files, 0 matching a plugin path",
        "npm pack --dry-run --json -w @tiphys/claude-code-plugin: 19 files including .claude-plugin/plugin.json, dist/src/adapter.js and dist/src/adapter.d.ts"
      ],
      "met": true
    },
    {
      "id": "M4-P5-4",
      "quote": "The plugin's tests run under the gate's own invocation (red witness 1, second member, and the SILENT one). A deliberately failing assertion placed in a plugin test makes npm test exit nonzero.",
      "evidence": [
        "appended a deliberately failing assertion to test/plugin-package.test.ts and ran node --test \"test/plugin-package.test.ts\": exit 1",
        "restored the file and re-ran: exit 0, and git status --porcelain on that path is empty",
        "package.json's test script is node --test \"test/**/*.test.ts\", whose glob covers test/plugin-package.test.ts, so the same injection reaches the suite gate's invocation",
        "I ran the injection against the single file rather than the whole suite because the whole suite already exits 1 for the environmental reason recorded in section 1 of the markdown, which would have made the injection indistinguishable"
      ],
      "met": true
    },
    {
      "id": "M4-P5-5",
      "quote": "The suite's four-part sentence is re-established on this head. Interpreter version, build state, invocation and pass-plus-skipped counts, for BOTH npm test and a bare node --test from the repository root.",
      "evidence": [
        "npm test, node v26.6.0, dist built: tests 1282, pass 1281, fail 1, SKIPPED 0, todo 0, duration_ms 380375, exit 1",
        "bare node --test from the repository root, node v26.6.0, dist built: tests 1284, pass 1283, fail 1, SKIPPED 0, todo 0, duration_ms 451744",
        "the two-test gap is the tracked root sandbox fixture that the npm test glob excludes, which is the cause standing warning 12 records",
        "the single failure in both invocations is test/gates.test.ts:3659 and is the scratch-prefix traversal trap of standing warning 1, confirmed with namei -m on the interpreter path"
      ],
      "met": true
    },
    {
      "id": "M4-P5-6",
      "quote": "The plugin imports ExecutorAdapter from the PACKAGE NAME @tiphys/kernel, never by a relative path into ../src/. Asserted by a test that greps the plugin's compiled output for ../src and expects zero hits.",
      "evidence": [
        "grepped plugin/dist/src/*.js, plugin/dist/src/hooks/*.js, plugin/dist/src/*.d.ts and plugin/dist/src/hooks/*.d.ts for ../src: zero hits",
        "plugin/src/adapter.ts:9 imports four types from \"@tiphys/kernel\"; the only kernel reference surviving into emitted JavaScript is the package-name resolve call at plugin/dist/src/status.js:93",
        "the criterion as written is met; see CR-A-002 for the hazard it does not close"
      ],
      "met": true
    },
    {
      "id": "M4-P5-7",
      "quote": "The adapter implements the interface and nothing else. Its module exports satisfy ExecutorAdapter, its name is not subprocess (M4-P4 criterion 5), and it declares requires (M4-P3 criterion 2).",
      "evidence": [
        "plugin/src/adapter.ts:153 declares claudeCodeAdapter typed as ExecutorAdapter with name, requires and launch and no other members",
        "ADAPTER_NAME at plugin/src/adapter.ts:74 is \"claude-code\", not \"subprocess\"",
        "ADAPTER_REQUIRES at plugin/src/adapter.ts:106 is [\"briefPath\"]",
        "test/plugin-adapter.test.ts compares the name against the kernel's exported BUILT_IN_ADAPTER_NAME rather than a second string literal, and passed in my run"
      ],
      "met": true
    },
    {
      "id": "M4-P5-8",
      "quote": "The adapter writes its launch record BEFORE the payload starts, and a test that makes the record write fail observes launch-failed and not incomplete.",
      "evidence": [
        "drove the compiled claudeCodeAdapter.launch with recordPath pointing at an existing directory: returned {kind: \"launch-failed\"} with EISDIR in the reason",
        "the payload's marker file did not exist after that arm, so the record write really does precede the payload",
        "a healthy launch with the same request returned {kind: \"completed\", exitCode: 0} with the launch record on disk and tasks/t-1/turn-end written",
        "see CR-A-004: this holds today and no witness spec guards it"
      ],
      "met": true
    },
    {
      "id": "M4-P5-9",
      "quote": "A real tiphys spawn --adapter @tiphys/claude-code-plugin against a scratch fleet produces tasks/<id>/turn-end for BOTH a zero and a nonzero payload exit code.",
      "evidence": [
        "test/plugin-adapter.test.ts:408 runs a real tiphys spawn --task ... --adapter @tiphys/claude-code-plugin for payload exit codes 0 and 7 and asserts tasks/<id>/turn-end for both",
        "that test passed in my own invocation of the five plugin test files: 43 tests, 43 pass, 0 fail, 0 skipped, exit 0",
        "the test skips itself when plugin/dist/src/index.js is absent; dist was built in my run, so it executed",
        "I did not drive the CLI by hand; this rests on the test running green under my own interpreter and build state"
      ],
      "met": true
    },
    {
      "id": "M4-P5-10",
      "quote": "node --test exits 0 and reports N tests with N greater than 0.",
      "evidence": [
        "npm test on main at 0eaf453 exits 1, reporting tests 1282, pass 1281, fail 1, skipped 0",
        "the failure is test/gates.test.ts:3659, whose own message reads 'the run itself did not reach a verdict, which is an environment failure rather than a wrong verdict'",
        "namei -m on the interpreter shows /tmp/claude-0 is drwx------, so the unprivileged child runCliUnprivileged spawns cannot traverse to process.execPath; this is standing warning 1's scratch-prefix trap",
        "recorded not met because that is what the command did in my environment; the cause is outside this group and I attribute it to no phase"
      ],
      "met": false
    },
    {
      "id": "M4-P6-1",
      "quote": "The turn-end exit code is always an integer (red witness 1). An agent turn that ends without an exit code (killed, abandoned, or ended by the harness) makes the adapter invoke hookPath with an integer.",
      "evidence": [
        "drove the compiled payloadExitCode with six terminations: (0,null)->0, (7,null)->7, (null,SIGKILL)->137, (null,SIGTERM)->143, (null,null)->128, (null,'SIGNOSUCH')->128",
        "every answer satisfies Number.isInteger",
        "plugin/src/hooks/turn-end.ts:82 turns that integer into the hook's single string argument"
      ],
      "met": true
    },
    {
      "id": "M4-P6-2",
      "quote": "Second member of the same class, structurally different: a turn that ends by SIGNAL produces 128 + signal, matching the kernel adapter's own convention, asserted against a captured value rather than a hand-written one.",
      "evidence": [
        "(null, SIGKILL) returns 137 and (null, SIGTERM) returns 143",
        "plugin/src/hooks/turn-end.ts:55 reads os.constants.signals rather than carrying a table of signal numbers",
        "the status ?? 0 implementation the criterion names would have returned 0 for both of those rows"
      ],
      "met": true
    },
    {
      "id": "M4-P6-3",
      "quote": "The hook is invoked by the ADAPTER, not by a Stop hook.",
      "evidence": [
        "plugin/src/adapter.ts:235 calls invokeTurnEndHook directly with request.hookPath after the payload child settles",
        "plugin/.claude-plugin/plugin.json declares only PreToolUse hooks; there is no Stop entry",
        "witness/plugin-turn-end-invoked-by-adapter.json exists and its test passed in my run"
      ],
      "met": true
    },
    {
      "id": "M4-P6-4",
      "quote": "The observer blocks nothing (red witness 2). With the observer installed, a tool call that writes into the project clone SUCCEEDS, and tasks/<id>/tool-calls.jsonl gains one line naming the tool and the target path.",
      "evidence": [
        "plugin/src/hooks/tool-call-observer.ts:189 calls process.exit(0) unconditionally and nothing in the module writes to stdout on any path",
        "test/fixtures/plugin-hook-payloads/hook-json-output-contract.txt records that a PreToolUse decision travels on stdout, so writing nothing there is the mechanical form of blocking nothing",
        "I drove observeToolCall with a real-shaped Bash payload against a hand-built fleet layout: recorded true, one line appended, carrying the tool and its input"
      ],
      "met": true
    },
    {
      "id": "M4-P6-5",
      "quote": "The observer's record is a capture, not a summary. Each line carries the hook payload verbatim plus a receipt timestamp, and a test asserts round-trip equality against a fixture captured in M4-P1.",
      "evidence": [
        "plugin/src/hooks/tool-call-observer.ts:109 hashes the ARRIVING bytes and stores the parsed payload untouched, adding only receivedAt and payloadSha256",
        "my reproduction round-tripped a Bash payload byte for byte into tasks/t-9/tool-calls.jsonl",
        "an unparseable payload is carried as a raw string rather than discarded, so the one case worth investigating is not the one case with no record",
        "see CR-A-003: the verbatim capture is correct and is what makes that finding reachable"
      ],
      "met": true
    },
    {
      "id": "M4-P6-6",
      "quote": "Nothing reads state from the log (C-1). grep -rn \"tool-calls\" src/ plugin/src/ shows the append site and no read site.",
      "evidence": [
        "ran grep -rn 'tool-calls' src/ plugin/src/: three hits, all in plugin/src/hooks/tool-call-observer.ts, two of them comments and one the basename constant at line 49",
        "the only file operation in the module is appendFileSync at plugin/src/hooks/tool-call-observer.ts:146",
        "witness/plugin-observer-log-never-read-as-state.json carries two dangerous states, one of them the module's own import line"
      ],
      "met": true
    },
    {
      "id": "M4-P6-7",
      "quote": "Status lines are delivered and are valid. An agent turn emits at least one status record through emitStatus, tiphys validate --type status-line exits 0 on each emitted record, and state/status/current.json reflects the last state while state/status/stream.jsonl holds the history.",
      "evidence": [
        "plugin/src/status.ts holds no status path at all and delegates to tiphys status emit and tiphys status show, which is the correct C-1 split and is why the plugin does not carry a second copy of M4-D-13's decision",
        "witness/plugin-status-line-delivered-and-valid.json exists and its test passed in my run of the five plugin test files",
        "recorded met because the criterion as written was discharged at the phase head",
        "IT IS NOT TRUE FOR A CONSUMER: on a clean install of the packed tarball, resolveKernelCli() returns ok:false and no record is ever emitted. That is CR-A-002 and it carries the severity"
      ],
      "met": true
    },
    {
      "id": "M4-P6-8",
      "quote": "Status delivery does not fail the turn. A status emit that fails (target directory removed) leaves the turn's outcome unchanged and the turn-end record still written.",
      "evidence": [
        "every function in plugin/src/status.ts returns its failure as data and none throws; deliverStatus wraps spawnSync in try/catch and checks both error and status",
        "plugin/src/adapter.ts:322 deliverStatusForTurn returns a string on every arm and its result is read only for the reason text",
        "witness/plugin-status-failure-does-not-fail-turn.json carries two structurally different mutants, one in plugin/src/status.ts and one in plugin/src/adapter.ts",
        "see CR-A-007: the swallow is correct and the reporting of it is on the wrong arm"
      ],
      "met": true
    },
    {
      "id": "M4-P6-9",
      "quote": "npm run build exits 0, git status clean, node --test exits 0 reporting N tests, N greater than 0, with the four-part sentence.",
      "evidence": [
        "npm run build exits 0 and git status --porcelain is empty afterwards",
        "npm test exits 1 with one failure, test/gates.test.ts:3659, for the environmental reason recorded under M4-P5-10",
        "recorded not met because the command did not exit 0; the cause is outside this group"
      ],
      "met": false
    },
    {
      "id": "M4-P7-1",
      "quote": "(a) SHAPE. tiphys validate --type model-resolution <file> exits 0 on a record the plugin actually wrote and nonzero, naming the field, on each of: a missing subject echo, a subject echo that does not match the request field by field, and an absent vocabulary identity.",
      "evidence": [
        "built a record through the shipped buildModelResolutionRecord and ran node bin/tiphys.ts validate --type model-resolution on it: exit 0",
        "missing subject: exit 1, 'INVALID #/subject required property subject is missing'",
        "mismatched echo (requestedTier changed to cheapest): exit 1, 'INVALID #/resolution/tier no charter override was applied and the resolved tier strongest is not the requested tier cheapest'",
        "absent vocabulary: exit 1, 'INVALID #/resolved/vocabulary required property vocabulary is missing'"
      ],
      "met": true
    },
    {
      "id": "M4-P7-2",
      "quote": "(b) TIMING. The record is written at TURN END and not at launch, and a test asserts its writtenAt is at or after the turn-end record's endedAt.",
      "evidence": [
        "plugin/src/adapter.ts:258 calls recordModelResolution after invokeTurnEndHook returned ok, which is the first instant the turn-end record is known to exist on disk",
        "plugin/src/adapter.ts:291 reads the turn-end record from disk via readTurnEnd and returns without writing when it is unreadable, rather than fabricating an end",
        "a record I built through the shipped builder carries writtenAt 2026-09-18T00:00:05.000Z against turnEnd.endedAt 2026-09-18T00:00:00.000Z",
        "witness/model-resolution-written-at-turn-end.json exists and its test passed in my run"
      ],
      "met": true
    },
    {
      "id": "M4-P7-3",
      "quote": "(c) VOCABULARY, and the kernel refuses to compare across one. Two records carrying different vocabulary.id values make the kernel-side reader REFUSE to compare them, with a reason naming both ids; two records carrying the same id compare.",
      "evidence": [
        "drove the compiled compareResolvedFamilies with claude-code-model-families against codex-model-families: {kind: \"refused\"} with a reason naming both ids and stating no decorrelation claim can be made",
        "same vocabulary, families opus and sonnet: {kind: \"compared\", differ: true, families: [\"opus\",\"sonnet\"]}"
      ],
      "met": true
    },
    {
      "id": "M4-P7-4",
      "quote": "(c) continued: no vendor name enters src/. A test asserts the kernel-side reader never dereferences a vocabulary's CONTENT, only its identity.",
      "evidence": [
        "grepped src/ and bin/ for six vendor name shapes (claude-opus/sonnet/haiku, gpt-N, o-N-mini, gemini-, and the bare family words) outside the vocabulary module: zero hits",
        "the vocabulary lives entirely in plugin/src/vocabulary.ts",
        "vocabularyIdentity at src/model-resolution.ts:157 reads exactly two named fields with no spread, Object.keys, stringify or clone, and the test drives it with a Proxy recording every property read",
        "witness/kernel-carries-no-vendor-model-names.json carries two structurally different members, a source comment mutation in src/commands/spawn.ts and a schema enum mutation in schemas/executor-record.schema.json"
      ],
      "met": true
    },
    {
      "id": "M4-P7-5",
      "quote": "(d) LOCATION and the absent-record rule. The record is adapter-written in the fleet home under tasks/<id>/, never inside the worktree. An adapter that exits 0 with NO record makes the consumer report ERROR, never green and never not-applicable.",
      "evidence": [
        "modelResolutionPathBeside at plugin/src/model-resolution.ts:276 returns join(dirname(recordPath), MODEL_RESOLUTION_RECORD_NAME), and recordPath is inside tasks/<id>/",
        "drove the compiled readModelResolutionRecord against a nonexistent path with writerExitCode 0: {kind: \"error\", reason: \"fail-closed rule 1: adapter exited 0 without writing a model-resolution record at ...; exit 0 with no record is error, not success\"}",
        "src/model-resolution.ts:100 records that the wording mirrors src/gates/release.ts:609 rather than reimplementing the rule"
      ],
      "met": true
    },
    {
      "id": "M4-P7-6",
      "quote": "Provenance cannot be laundered (red witness, and the class needs two members). Member one: a record with resolved.provenance observed and no observation field is rejected by the schema. Member two: a record with resolved.provenance observed and an observation field whose value contradicts the echoed request is rejected by the reader.",
      "evidence": [
        "member one, through the real CLI: setting resolved.provenance to observed with no observation gives exit 1, 'INVALID #/resolved value matches no permitted alternative here', which is the schema's oneOf refusing it",
        "member two, through the compiled acceptModelResolution: an observation naming task t-OTHER against a subject t-1 gives {kind: \"refused\"} naming both task ids; an observation seeing claude-haiku-9 against a claimed claude-opus-5 gives {kind: \"refused\"} naming both models",
        "the control: an agreeing observation gives {kind: \"accepted\", family: \"opus\", provenance: \"observed\"}",
        "I also probed the same trick one block over, on resolution.provenance, and the schema refused both the missing-observation and the contradicting-observation spellings"
      ],
      "met": true
    },
    {
      "id": "M4-P7-7",
      "quote": "The charter override is resolved, not assumed. A role whose role-model-config.yaml entry sets charter-override: allowed, running under a charter that overrides it, produces a record whose requested tier is the CHARTER's and whose overrideApplied is true with the charter path echoed; a role with charter-override not allowed, under the same charter, produces the config's tier and overrideApplied false.",
      "evidence": [
        "READ, NOT RUN. plugin/src/model-resolution.ts:137 is overrideApplied false with no policy document, :164 is overrideApplied false with a reason naming the config path and the charter-override value, and :171 is overrideApplied true with charterPath echoed",
        "test/model-resolution.test.ts:864 is 'a charter overrides the tier of a role that allows it and not of a role that forbids it' and passed in my run of the five plugin test files",
        "witness/model-resolution-charter-override-resolved.json exists",
        "I did not construct a role-model-config.yaml and a charter myself, so this rests on reading the three arms and on the phase's own test running green under my interpreter"
      ],
      "met": true
    },
    {
      "id": "M4-P7-8",
      "quote": "Closeout copies the family token into the verdict. The record's family token reaches the phase's verdict document so the pull request stays self-contained per DR-0031, and a test asserts the copied value equals the record's byte for byte.",
      "evidence": [
        "producedByFromRecord at src/model-resolution.ts:370 returns stringAt(asRecord(record.resolved), \"family\") with no normalisation, lowercasing or prefixing",
        "the function's own comment at src/model-resolution.ts:366 names the byte-for-byte property and why a normalised copy would satisfy the sentence and break the comparison",
        "witness/model-resolution-family-token-reaches-verdict.json exists and its test passed in my run"
      ],
      "met": true
    },
    {
      "id": "M4-P7-9",
      "quote": "npm run build exits 0, git status clean, node --test exits 0 reporting N tests, N greater than 0, four-part sentence quoted.",
      "evidence": [
        "npm run build exits 0 and git status --porcelain is empty afterwards",
        "npm test exits 1 with one failure, test/gates.test.ts:3659, for the environmental reason recorded under M4-P5-10",
        "recorded not met because the command did not exit 0; the cause is outside this group"
      ],
      "met": false
    },
    {
      "id": "M4-P9-1",
      "quote": "node --test test/project-write-block.test.ts exits 0 and reports N tests, N > 0.",
      "evidence": [
        "ran node --test test/project-write-block.test.ts on node v26.6.0 with dist built: exit 0",
        "tests 11, pass 11, fail 0, SKIPPED 0, todo 0"
      ],
      "met": true
    },
    {
      "id": "M4-P9-2",
      "quote": "RED WITNESS 1. decideWrite refuses a Write to <projectRoot>/src/app.ts, and the hook wrapper exits 2 for the same request. Red against the DANGEROUS state: with the hook absent the write lands and the file's mtime changes.",
      "evidence": [
        "decideWrite against a real fleet layout returned {verdict: \"refuse\"} for <root>/src/app.ts",
        "runHook with the corresponding PreToolUse payload returned exit 2 with a reason naming the working tree, the .git exclusion and the absent bypass",
        "test/project-write-block.test.ts carries 'a Write into a project working tree is refused and the same write lands when the hook is absent', which passed in my run",
        "witness/project-write-block-refuses-working-tree-write.json exists"
      ],
      "met": true
    },
    {
      "id": "M4-P9-3",
      "quote": "RED WITNESS 2. decideWrite permits a ref update under <projectRoot>/.git/refs/heads/main, and a real git merge --ff-only in a scratch clone with the hook installed exits 0 and moves the ref.",
      "evidence": [
        "decideWrite returned {verdict: \"permit\"} for <root>/.git/refs/heads/main with a reason naming the release-manager carve-out",
        "I ran a real git merge --ff-only in a scratch clone and the ref moved",
        "test/project-write-block.test.ts carries 'a real git merge --ff-only moves the ref and the block permits every path it wrote', which passed in my run",
        "the criterion's own assertion holds; the carve-out is wider than 'a ref update', which is CR-A-001 rather than a failure of this assertion"
      ],
      "met": true
    },
    {
      "id": "M4-P9-4",
      "quote": "The bypass class, TWO STRUCTURALLY DIFFERENT MEMBERS. (a) A declaration whose expiry is in the past does not permit a write its path list covers. (b) A declaration that is current does not permit a write outside its path list. Both refusals name the declaration and the reason it did not apply.",
      "evidence": [
        "bypassDoesNotApply at plugin/src/hooks/project-write-block.ts:204 composes a declaration string naming declaredAt, declaredBy, project and reason, and appends the specific non-application reason on every arm including the expiry and path-list arms",
        "test/project-write-block.test.ts carries 'an expired bypass does not permit a write its path list covers and names the declaration' and 'a current bypass does not permit a write outside its path list and names the declaration', both of which passed in my run",
        "witness/project-write-block-expired-bypass-does-not-permit.json and witness/project-write-block-out-of-scope-bypass-does-not-permit.json exist",
        "I drove a current, in-scope declaration through runHook against a real fleet and got PERMIT, so the positive control is not vacuous",
        "see CR-A-005 for the member the class is missing"
      ],
      "met": true
    },
    {
      "id": "M4-P9-5",
      "quote": "Deleting the entire evidence log changes no decideWrite result, asserted over the full criterion-4 fixture set. This is C-1 made falsifiable.",
      "evidence": [
        "decideWrite at plugin/src/hooks/project-write-block.ts:261 takes request, projectRoots, bypass and now, and has no log parameter at all, so no state of the log can reach a verdict",
        "the only reference to the evidence log outside appendBypassEvidence is the wrapper's call site at plugin/src/hooks/project-write-block.ts:647, which runs after the decision",
        "test/project-write-block.test.ts carries 'deleting the entire evidence log changes no decision over the bypass fixture set', which passed in my run",
        "witness/project-write-block-evidence-log-is-never-read.json exists"
      ],
      "met": true
    },
    {
      "id": "M4-P9-6",
      "quote": "With the hook installed, a real agent turn that attempts a working-tree write in a project clone produces no change to that clone (git status --porcelain empty, and every tracked file's sha unchanged). PROBE-DEPENDENT for the Bash arm.",
      "evidence": [
        "the phase discharged this for the file-writing tools and declared the Bash residual honestly, in witness/captures/m4-p9-end-to-end-agent-turn.txt and in a registered assertion at test/project-write-block.test.ts:694",
        "FALSIFIED for an adjudicated tool: the hook PERMITS a Write to <root>/.git/hooks/post-merge (runHook exit 0), and after the release manager's own git merge --ff-only in that clone, git status --porcelain prints ' M src.txt' and the tracked file's content is OWNED-BY-POST-MERGE-HOOK",
        "Write is in ADJUDICATED_TOOLS at plugin/src/hooks/project-write-block.ts:75, so this is not the declared Bash residual",
        "reproduced end to end; see CR-A-001"
      ],
      "met": false
    },
    {
      "id": "M4-P9-7",
      "quote": "A request whose project root cannot be resolved is REFUSED, not permitted, and the wrapper exits 2 naming the resolution failure.",
      "evidence": [
        "runHook with a payload whose cwd is /nowhere-at-all returned exit 2 with 'the project root could not be resolved for this Write call: no fleet home was found at or above /nowhere-at-all (a fleet home carries charter/, decisions/, state/, tasks/, worktrees/, projects/)'",
        "decideWrite refuses when projectRoots.kind is unresolved and when the target is absent, empty or not absolute, each with a distinct reason",
        "the ProjectRoots discriminated union at plugin/src/hooks/project-write-block.ts:96 makes the fail-open spelling a compile error, which the phase proved with tsc --noEmit --strict at witness/captures/m4-p9-settling-probes.txt rather than asserting",
        "see CR-A-008 for the consequence of applying this to a write outside any fleet"
      ],
      "met": true
    }
  ],
  "deviations-judged": [
    {
      "deviation": "M4-P5: the project reference runs plugin-to-kernel, so tsconfig.src.json is NOT edited despite the plan's files-to-touch naming it",
      "serves-plan-intent": true,
      "reasoning": "The plan's files-to-touch named a file that the dependency direction it also requires makes impossible to use. The plugin depends on the kernel, so the reference belongs in plugin/tsconfig.json. I verified the consequence rather than the argument: npm run build exits 0 and emits plugin/dist, and git status is clean afterwards."
    },
    {
      "deviation": "M4-P5: test/license-gate.test.ts is edited and was not on the phase declaration; declared in the work history and the orchestrator asked to add it",
      "serves-plan-intent": true,
      "reasoning": "The plan's packaging trap 4 names the license-gate collision without naming the file that carries it. The edit is what makes scripts/license-gate.mjs walk two workspaces rather than one, which the trap requires. Declaring it rather than smuggling it is the behaviour the scope rule exists to produce."
    },
    {
      "deviation": "M4-P6: the plugin-hook-payload fixtures are a PROJECTION of M4-P1's payloads onto five fields, not whole payloads; session_id and transcript_path are absent",
      "serves-plan-intent": true,
      "reasoning": "The plan asked for real captured payloads and the phase shipped exactly what M4-P1 captured, saying in PROVENANCE.md and in its not-covered list that it is less than a whole payload. Overstating it would have been the failure. M4-P9 later captured whole payloads verbatim, which is what made CR-A-003 visible at all, so the honest declaration did its job."
    },
    {
      "deviation": "M4-P7: src/commands/validate.ts and src/checks.ts added to the declaration because src/validate.ts, which the plan named, holds neither the type table nor the auto resolver",
      "serves-plan-intent": true,
      "reasoning": "The substitution is proved in the work history by a grep showing the type table lives in src/commands/validate.ts, not asserted. src/checks.ts follows from criterion 1's field-by-field subject echo, which schemas/README.md:70 classifies as Kind B and therefore as a derived check rather than a schema keyword. Both additions are the same work in the files that actually hold it."
    },
    {
      "deviation": "M4-P7: an eleventh behavior, model-resolution-empty-observation-is-unresolved, beyond the ten the plan lists",
      "serves-plan-intent": true,
      "reasoning": "An observation that exists but is empty is a third state between the criterion's missing-field and contradicting-field members, and closing it is strictly narrowing: it removes a way to claim observed without observing. Nothing is widened and the extra behavior is registered and witnessed."
    },
    {
      "deviation": "M4-P7: provenance carries THREE values (observed, self-reported, unresolved), not the two the criterion implies",
      "serves-plan-intent": true,
      "reasoning": "unresolved is the honest answer when nothing is known, and without it the writer would have to pick one of the other two, which is the laundering the whole record exists against. The reader refuses a record ranking itself self-reported while carrying an observation, so the third value cannot be used to escape either of the other two guards."
    },
    {
      "deviation": "M4-P7: the observation channel is INJECTED rather than discovered, and the adapter passes none, so every record it writes ranks itself self-reported",
      "serves-plan-intent": true,
      "reasoning": "The plan explicitly designed criterion 6 to survive either answer from M4-P1, and the measured answer is that the channel is a hook payload's transcript_path, which an adapter owning a child process does not have. Passing nothing and ranking the record self-reported is the arm the plan describes as correct. observeServedModel exists for a caller that does hold a payload, which keeps the option open without claiming it."
    },
    {
      "deviation": "M4-P9: the phase used the plugin/ tree M4-P5 created rather than the packages/claude-code-plugin/ location the plan recommended, and declared no deviations section",
      "serves-plan-intent": true,
      "reasoning": "The plan's own depends-on clause says 'whichever way round, ONE phase creates it and the plan says which', so consuming M4-P5's tree is the anticipated branch rather than a departure. AGENTS.md was edited as the plan required (25 lines in 713731f). The judgement is that the choice serves the intent; the omission is that declaring it would have cost one paragraph and the phase declared nothing, which is the only thing separating this phase's paperwork from the other three."
    }
  ]
}
```
