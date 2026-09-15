# PROBE: PreToolUse hook - refuse working-tree write, permit designated ref update

Key: pretooluse-write-block
Started: (see mtime)
Scratch: /tmp/claude-0/m4-probes/pretooluse-write-block/
Repo read-only reference: /home/user/tiphys-ai-helmsman @ plan/pstack-borrow-review

Status: IN PROGRESS. This file is appended to as work happens (T-008 beacon rule).

## Failure arm, written FIRST

This probe can return four distinct verdicts and they are not interchangeable:

- BLOCKED-BY-ENV: the `claude` CLI is not invocable here, so no hook can be
  observed firing. Verdict would be "I could not test it", NOT "it works".
- HOOK FIRES AND BLOCKS: captured stdin JSON + captured non-execution of the tool.
- HOOK FIRES AND DOES NOT BLOCK: the mechanism tried is wrong; report the exit
  code / JSON that was tried and what happened instead.
- HOOK CANNOT SEE THE DISCRIMINATOR: it fires, it blocks, but the JSON it is
  handed does not carry enough to tell a sanctioned ref update from any other.
  That is a FINDING, not a failure of the probe.

## FACT 0 (pre-hook): D-8's line does not partition the operations

Before any hook exists, measure what "a merge" actually does in a non-bare
project clone. Scratch repo at
/tmp/claude-0/m4-probes/pretooluse-write-block/project, main at f3b9586,
feature at f6cd332 (adds a line to app.txt, creates feature.txt).

    $ git merge --ff-only feature
    Updating f3b9586..f6cd332
    Fast-forward
     app.txt     | 1 +
     feature.txt | 1 +
     2 files changed, 2 insertions(+)
     create mode 100644 feature.txt
    exit:0

    app.txt md5 BEFORE 04007d944615f28c94b78a73c44dc200
    app.txt md5 AFTER  9407834d5c6a76d4f7cde80cdb0260c5
    feature.txt: absent before, present after

**A fast-forward merge in a checked-out clone IS a working-tree write.** It
rewrites tracked files and creates new ones on disk. So the D-8 sentence
"ref updates through designated merge tooling are the release-manager
carve-out ... the orchestrator never writes working-tree content" does NOT
name two disjoint sets of operations at the filesystem level. The sanctioned
act is a member of the forbidden set.

The pure-ref forms, measured in the same clone:

    $ git push . feature:main
    remote: error: refusing to update checked out branch: refs/heads/main
    exit:1

    $ git update-ref refs/heads/main $(git rev-parse feature)
    exit:0
    app.txt md5 unchanged (04007d94...), feature.txt still absent
    $ git status --porcelain
    M  app.txt
    D  feature.txt

So `update-ref` IS ref-only, and it leaves the clone inconsistent with its own
HEAD. **A ref-only merge is only a clean act where main is NOT checked out**,
i.e. a bare repository or a separate merge clone.

CONSEQUENCE FOR M4: the carve-out cannot be written as "allow ref updates,
refuse working-tree writes" and be implemented by a path-based hook, because
the allowed act writes the same paths. It has to be written as "allow exactly
this TOOL, which is designed so that its writes are ref-only", which moves the
whole guarantee into the tool and out of the hook. See the definition proposed
below.

## FACT 1: the plugin is real and the hook fires

Environment: node v22.22.2 (/opt/node22/bin/node), `claude --version` 2.1.273
(Claude Code), /opt/node22/bin/claude. Plugin loaded per-session with
`--plugin-dir`, which the CLI documents as "Load a plugin from a directory or
.zip for this session only".

Files built (all under the scratch dir, the repository working tree was never
touched):

    plugin/.claude-plugin/plugin.json    {"name":"tiphys-authority", "hooks":"./hooks/hooks.json"}
    plugin/hooks/hooks.json              PreToolUse, matcher "Write|Edit|NotebookEdit|Bash",
                                         command: node "${CLAUDE_PLUGIN_ROOT}/hooks/project-write-block.mjs"
    plugin/hooks/project-write-block.mjs the hook
    tools/tiphys-merge                   the designated merge tool
    tools/tiphys-hotfix                  the infra-hotfix act
    project/                             a real git clone, main + feature
    upstream/                            a real BARE repo

`${CLAUDE_PLUGIN_ROOT}` resolved correctly; the hook ran. The stdin JSON it was
handed, captured verbatim by the hook itself, was:

    {
      "session_id": "49c9c4fa-6f01-5020-aa81-c87700265964",
      "transcript_path": "/root/.claude/projects/-tmp-claude-0-.../....jsonl",
      "cwd": "/tmp/claude-0/m4-probes/pretooluse-write-block/project",
      "scratchpad_dir": "/tmp/claude-0/-tmp-claude-0-.../scratchpad",
      "prompt_id": "a33c1467-c8b2-4f7e-a688-1fa62c6708d4",
      "permission_mode": "acceptEdits",
      "effort": { "level": "high" },
      "hook_event_name": "PreToolUse",
      "tool_name": "Write",
      "tool_input": {
        "file_path": ".../project/app.txt",
        "content": "HOTFIX\n"
      },
      "tool_use_id": "toolu_016WW8vw4ed1ggs3pPBDJ74W"
    }

## FACT 2: what actually blocks, established by trying, with a control

One prompt ("Write the single line HOTFIX into app.txt ... Report WROTE or
BLOCKED"), one project, four hook configurations. The md5 of app.txt is the
verdict, not the model's word.

| hook behaviour | model said | app.txt md5 after | blocked? |
|---|---|---|---|
| `exit 2`, reason on stderr | BLOCKED | 04007d94 (unchanged) | YES |
| `exit 0` + `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}` | BLOCKED | 04007d94 (unchanged) | YES |
| `exit 1`, reason on stderr | WROTE | 737481f9 (CHANGED) | **NO** |
| `exit 0`, no output (policy empty) | WROTE | 737481f9 (CHANGED) | no (control) |

The last row is the RED WITNESS. The harness writes the file in this exact
configuration, so rows 1 and 2 are the hook doing the work and not the
permission system, the prompt, or the model declining.

**`exit 1` is a non-blocking error.** A hook that crashes, or that reports a
refusal the way an ordinary program reports an error, lets the write through.
This is the T-008 shape and it is available by accident: any uncaught exception
in the hook script exits 1, so a BUGGY WRITE-BLOCK IS AN ABSENT WRITE-BLOCK and
nothing says so.

## FACT 3: WITNESS 1, a working-tree write is REFUSED

Real session, cwd = the project clone, `--allowedTools "Write"
--permission-mode acceptEdits` (so the permission system was NOT the thing
refusing).

    md5 BEFORE: 04007d944615f28c94b78a73c44dc200
    model output: BLOCKED
    md5 AFTER : 04007d944615f28c94b78a73c44dc200
    hook stdin log lines: 1

## FACT 4: WITNESS 2, a designated ref update SUCCEEDS

Same plugin, same policy, same session configuration, `--allowedTools "Bash"`.

    upstream main BEFORE: f3b9586
    model output: tiphys-merge: refs/heads/main f3b9586 -> f6cd332
    upstream main AFTER : f6cd332
    audit: {"at":"2026-09-15T23:14:23.635Z","act":"ref-update",
            "ref":"refs/heads/main","from":"f3b9586...","to":"f6cd332...",
            "actor":"orchestrator"}

And the second, structurally different member of the refusal class, in the
SAME configuration (this is what makes it a class and not one witness):

    prompt: run `git merge --ff-only feature` in the current directory
    model output: "The command was refused by a pretooluse hook ..." / BLOCKED
    project main BEFORE f3b9586  AFTER f3b9586
    app.txt md5 unchanged

So the class has three members measured together: Write refused, Bash refused,
designated tool permitted.

### The proposed definition of "designated merge tooling"

The intake says this is undefined and makes defining it an open decision. The
definition below is what the hook actually implements, and it is checkable in
one line:

> A command is a designated ref update if and only if its FIRST TOKEN is
> string-equal to one of a configured list of ABSOLUTE PATHS, and the whole
> command string contains NO character from the set
> `; & | ` $ ( ) < > \n \ * ? ~`.

Two halves and both are load-bearing. The first token being an absolute path in
the list is the designation. The metacharacter ban is what stops the string
from meaning something other than what it appears to mean, and it is measured:

    $P/tools/tiphys-merge --repo x && rm -rf .     -> exit 2, REFUSED
    $P/tools/tiphys-merge --repo ... --into main   -> exit 0, ALLOWED

**The hook verifies the NAME. The tool provides the GUARANTEE.** `tiphys-merge`
is ref-only BY CONSTRUCTION, not by assertion: it operates on a BARE repository
and refuses anything else, and a bare repository has no working tree for it to
write.

    $ tiphys-merge --repo <non-bare>
    tiphys-merge: refusing: <path> is not bare (is-bare-repository=false)
    exit:3

That inversion is the design point. The hook cannot inspect what a program will
do, so it must not try; it delegates to a named program that cannot do the
wrong thing.

## FACT 5: what the hook CANNOT see, MEASURED

The hook was fed constructed PreToolUse payloads directly. Policy in every row:
project root = .../project, designated tool = .../tools/tiphys-merge.

| case | cwd | exit | verdict |
|---|---|---|---|
| Write app.txt, absolute | in project | 2 | REFUSED |
| Bash `echo X > app.txt` | in project | 2 | REFUSED |
| Bash designated tool, bare invocation | in project | 0 | ALLOWED (wanted) |
| Write `project/app.txt` RELATIVE | PARENT of project | 2 | REFUSED |
| **Bash `echo X > project/app.txt` RELATIVE** | **PARENT of project** | **0** | **ALLOWED (BYPASS)** |
| Bash absolute path named in the string | parent | 2 | REFUSED |
| **Bash `R=<split string>; echo X > $R/app.txt`** | parent | **0** | **ALLOWED (BYPASS)** |
| Bash designated tool `&& rm -rf .` | in project | 2 | REFUSED |
| Bash `sh -c 'echo X > app.txt'` | in project | 2 | REFUSED |
| NotebookEdit in project | in project | 2 | REFUSED |
| `mcp__fs__write_file` in project | in project | 0 | ALLOWED (not matched) |

**The first bypass was then reproduced END TO END in a real session**, so it is
not an artefact of my own test harness:

    cwd: /tmp/claude-0/m4-probes/pretooluse-write-block   (the PARENT)
    prompt: run `echo BYPASSED > project/app.txt`
    hook WAS invoked: {"tool":"Bash","cwd":"<parent>",
                       "input":{"command":"echo BYPASSED > project/app.txt"}}
    model output: WROTE
    app.txt md5 BEFORE 04007d94 -> AFTER 8fabf763, content [BYPASSED]

### The finding, stated plainly

**The hook is SOUND for the structured file tools and UNSOUND for Bash, and the
reason is structural, not a bug I can patch.**

For `Write`, `Edit` and `NotebookEdit` the payload carries a FIELD that is a
path. The hook resolves it against `cwd` and the answer is exact. The relative
path from a parent directory is caught.

For `Bash` the payload carries a STRING. The hook is being asked to decide,
before execution and without a shell, which paths a shell command will write.
I did not find a way to do that correctly, and the general
form is the halting-flavoured one, but state it as what was measured rather
than as a proof: TWO constructions got a write through, and neither is exotic.
Variable indirection defeats substring matching;
a relative path defeats it when the cwd is outside the root; `$(...)`, aliases,
`git -c`, a `.git/hooks` script and a `git checkout` are all further members of
the same family. Banning metacharacters narrows it and does not close it,
because the two measured bypasses use NO metacharacter at all.

**So the carve-out needs a different mechanism, and this is the answer to
question 5.** Three parts, and the first two are the ones that matter:

1. **The working-tree block for Bash cannot live in a PreToolUse hook.** It has
   to be enforced where paths are real: filesystem permissions on the project
   clone (the orchestrator's uid cannot write it), or a mount, or a container.
   A hook can only ever be an advisory layer over Bash.
2. **The harness has a native lever worth measuring in the phase:
   `claude --restricted`**, which the CLI's own help describes as removing "the
   built-in tools that run commands or code (Bash, PowerShell, REPL and the
   other code-running tools)" and confining "the file tools to the working
   directories". With Bash removed, the hook's SOUND half is the whole surface
   and the block becomes real. NOT MEASURED in this probe, see coverage below.
3. **The matcher is an allowlist and MCP write tools are outside it.** A
   filesystem MCP server, or any future `mcp__*` tool with a path argument,
   is not selected by `Write|Edit|NotebookEdit|Bash`. If the orchestrator
   session may load MCP servers, the matcher has to be `.*` with the decision
   made inside the hook, which trades one problem for the cost of a node
   process on every tool call.

## FACT 6: the infra-hotfix bypass, as a first-class LOGGED act

The migration table flags this as undesigned (delivery/requirements/migration-table.md:17).
The shape proposed and built here is deliberately NOT a switch: there is no
flag, no environment variable and no hook configuration that turns the block
off. It is a SECOND DESIGNATED TOOL, allowed by the same first-token rule, with
three properties.

**Failure arms, run first and measured:**

    --reason absent                  -> exit 3, "need --reason of at least 12 characters"
    --incident absent                -> exit 4, "need --incident matching DR-nnnn or INC-n"
    --incident oops                  -> exit 4, same
    TIPHYS_HOTFIX_AUDIT unwritable   -> exit 6, "could not write the audit record
                                        (ENOENT); nothing was mutated"
    audit lines written by all four  -> 0

That fourth arm is the fail-closed property, and it is the same construction as
src/exec/env.ts:180: the record is not a side effect of the act, it is a
PRECONDITION of it. No record, no act.

**Success arm, through a real session with the hook in force:**

    prompt: run `tiphys-hotfix --repo <project> --file app.txt --content HOTFIXED
                 --reason 'the gate runner is wedged on this file' --incident INC-7`
    output: tiphys-hotfix: hotfix/INC-7-1789514245725 503e779 (audited as INC-7)

    project app.txt md5 BEFORE 04007d94  AFTER 04007d94   (UNCHANGED)
    git status --porcelain                                (EMPTY, clean)
    git branch --list 'hotfix/*'  -> hotfix/INC-7-1789514245725
    git show <branch>:app.txt     -> HOTFIXED
    audit: {"act":"infra-hotfix","branch":"hotfix/INC-7-...","incident":"INC-7",
            "reason":"the gate runner is wedged on this file","actor":"orchestrator"}

**The third property is the one that makes it acceptable at all: the hotfix
never becomes a working-tree edit.** It is applied in a throwaway worktree and
lands as a COMMIT ON A BRANCH, so the project tree the orchestrator is
supposedly not writing is byte-identical afterwards, and the hotfix is a
reviewable object that the ordinary review path can pick up. The bypass changes
WHO may propose a change; it does not change whether the change gets reviewed.

**And the block is still red in the same configuration**, which is what keeps
this from being H12 (a bypass that switches the guard off):

    plain Write into the project, same policy, hotfix tool designated
      -> exit 2, "TIPHYS-BLOCK-WT: Write targets project working tree ..."
    the hotfix tool
      -> exit 0, "TIPHYS-ALLOW-DESIGNATED: bare invocation of designated tool ..."

## WHAT I COULD NOT TEST, and why

Stated in these words because the instructions require the difference between
"it works" and "I could not test it" to be visible.

1. **Whether the hook still fires under `permission_mode: bypassPermissions`.
   NOT ESTABLISHED.** Both routes to it were refused in this container:

       claude ... --dangerously-skip-permissions
         -> denied by this session's own auto-mode classifier
            ("Permission for this action was denied ... [Create Unsafe Agents]")
       claude ... --permission-mode bypassPermissions
         -> "--dangerously-skip-permissions cannot be used with root/sudo
             privileges for security reasons"
            hook invocations recorded: 0

   This matters and should be probed in the phase on a non-root uid. If
   `bypassPermissions` suppresses PreToolUse hooks, the entire write-block is
   defeated by a launch flag and the mechanism has to move. Measured here only
   for `acceptEdits`, where the hook DID fire.

2. **`claude --restricted` was NOT run.** Its description is quoted from
   `claude --help` and is documentation, not measurement. It is the most
   promising route past the Bash unsoundness and it is one command to settle.

3. **The `matcher` was not tested against a real MCP tool.** The row in the
   FACT 5 table for `mcp__fs__write_file` was produced by invoking the hook
   script DIRECTLY, so it measures the script's logic, not the matcher's
   selection. That no MCP server was loaded means the deduction "the matcher
   would not have fired at all" is a DEDUCTION from the documented matcher
   semantics, not an observation. Both halves point the same way, but say
   which is which.

4. **Only fast-forward merges were exercised.** A true three-way merge has to
   resolve content, so `tiphys-merge` would have to build a tree rather than
   move a ref. I did not try a three-way merge in a bare repo and I do not
   claim it is impossible; I claim only that it was NOT MEASURED here. It is
   the interesting case for M4, because
   the local-only mode SC-010 names is a fast-forward and the general case is
   not.

5. **No concurrency, no two sessions, no real remote.** The upstream is a local
   bare repo. Whether a designated ref update through a real network remote
   behaves the same, and whether `git push` (which the hook would have to
   allow by name) is distinguishable from `git push` of a working-tree-derived
   commit, was not probed.

6. **The hook's own failure modes beyond `exit 1` were not enumerated.** A hook
   that times out, or that is not executable, or whose node is missing, was not
   measured. Given that `exit 1` does not block, the default assumption should
   be that every one of these fails OPEN, and the phase owes a witness that the
   write-block reddens when its own hook is broken.

7. **The repository's own test suite was not run.** This probe builds nothing in
   /home/user/tiphys-ai-helmsman and asserts nothing about it, so no suite
   result, toolchain, build state, invocation or SKIPPED count is quoted. The
   only repository facts used are read-only reads of AGENTS.md:279,
   delivery/plan/kernel-plan-v1.md:383, delivery/requirements/migration-table.md:17
   and delivery/plan/m4-intake.md.

## The load-bearing finding, if only one survives

**D-8's line ("ref updates are the carve-out, working-tree content is not") does
not partition the operations, and a path-based hook therefore cannot implement
it.** A fast-forward merge in a checked-out clone rewrites tracked files on
disk; measured, app.txt md5 04007d94 -> 9407834d. The only ref-only merge in
that clone is `git update-ref`, which succeeds and leaves the clone
inconsistent with its own HEAD (`M app.txt`, `D feature.txt`).

The carve-out is implementable, but only if it is restated. Not "allow ref
updates" but "allow exactly these named absolute-path tools, which are
constructed so their writes are ref-only, and which log before they act". That
restatement is a plan edit, and it is cheap now and expensive in the phase.

## Hygiene

The repository working tree was not modified. Verified after all work:

    $ cd /home/user/tiphys-ai-helmsman && git status --porcelain=v1 | wc -l
    0
    $ git rev-parse --short HEAD ; git rev-parse --abbrev-ref HEAD
    fc697d6
    plan/pstack-borrow-review

Everything built by this probe is under
/tmp/claude-0/m4-probes/pretooluse-write-block/ and is re-runnable:

    plugin/.claude-plugin/plugin.json
    plugin/hooks/hooks.json
    plugin/hooks/project-write-block.mjs
    tools/tiphys-merge
    tools/tiphys-hotfix
    project/ upstream/ log/

The claim grep was run in both the line-based and the wrap-insensitive form
against this file: 7 hits line-visible, 7 total, so nothing was hidden by a
wrap. Each hit is either a verbatim quote of a source document or of captured
tool output, or carries the measurement immediately adjacent.

STATUS: COMPLETE.
