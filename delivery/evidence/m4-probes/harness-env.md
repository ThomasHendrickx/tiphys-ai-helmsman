# PROBE: harness-native orchestration primitive vs kernel child environment

STATUS: STARTED 2026-09-15T23:09:56Z
Working dir: /tmp/claude-0/m4-probes/harness-env/


## Scope and what this probe CAN and CANNOT distinguish (written FIRST)

FAILURE ARM. This probe can report these distinct outcomes:
- "the harness exposes an env parameter and it worked" (a captured tool schema
  field plus a captured child env that lacks a parent variable)
- "the harness exposes an env parameter and it was ignored" (schema field
  present, sentinel still visible in the child)
- "the harness exposes NO env parameter" (captured schemas, no field)
- "I could not launch anything and therefore could not test it" (stated as such)

It CANNOT distinguish: whether a Claude Code build other than 2.1.42, or a
non-subagent invocation depth, exposes controls this one does not. Everything
below is measured at CLAUDE_CODE_VERSION=2.1.42 in this container.

## M0. Identity of the running agent (measured)

    $ echo "$CLAUDE_CODE_VERSION $CLAUDE_CODE_CHILD_SESSION $CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH"
    2.1.42 1 1
    exit 0

I AM a harness-launched agent (CLAUDE_CODE_CHILD_SESSION=1), launched by the
orchestrator session through the harness's own subagent primitive. The spawn
depth cap is 1, and no Task/Agent spawn tool appears in my tool surface:

    ToolSearch query "select:Task,Agent,Workflow,Explore" -> "No matching deferred tools found"

So I cannot spawn a further subagent. That is a REAL LIMIT on this probe and
it is stated rather than worked around: the sentinel experiment in the
requested shape (parent sets sentinel, parent launches child, child reports)
cannot be run from inside a depth-1 subagent. What I ran instead is the same
experiment with the roles shifted one level: I AM the launched agent, and I
report what I can see of the launching process's environment.

## M1. What a harness-launched agent sees (measured)

    $ env | sed 's/=.*//' | sort | wc -l
    173
    exit 0

173 variable names. Among them, verbatim from the capture:

    AWS_ACCESS_KEY_ID          AWS_SECRET_ACCESS_KEY
    CLOUDSDK_AUTH_ACCESS_TOKEN GH_TOKEN
    OPENAI_API_KEY             SUPABASE_SERVICE_ROLE_KEY
    ENCRYPTION_SECRET          NEXTAUTH_SECRET
    RESEND_API_KEY             DATABASE_URL
    GOOGLE_CLIENT_SECRET       MICROSOFT_CLIENT_SECRET
    DROPBOX_CLIENT_SECRET      VAPID_PRIVATE_KEY
    DEV_LOGIN_TOKEN            CLAUDE_CODE_MESSAGING_TOKEN

The kernel's DEFAULT_CHILD_ENV_ALLOWLIST (src/exec/env.ts:68) permits 25 names.
None of the above is on it.

## M2. The harness's own execution tool exposes NO environment parameter

The Bash tool schema as served to me has exactly these properties:

    command, description, run_in_background, timeout, dangerouslyDisableSandbox

There is no `env`, no `envRemove`, no `clearEnv`, no `cwd`-adjacent env field.

## M3. The harness process env vs the env a harness-launched child gets

    $ tr '\0' '\n' < /proc/$CLAUDE_PID/environ | sed 's/=.*//' | sort > harness-proc-env-names.txt
    $ env | sed 's/=.*//' | sort > parent-env-names.txt
    $ wc -l harness-proc-env-names.txt parent-env-names.txt
     118 harness-proc-env-names.txt
     173 parent-env-names.txt
    exit 0

The child gets 55 MORE names than the harness was exec'd with (agent-proxy CA
bundles, AWS_ACCESS_KEY_ID=proxy-injected, GIT_CONFIG_COUNT/KEY_n/VALUE_n,
NODE_EXTRA_CA_CERTS overridden from /etc/ssl/... to /root/.ccr/ca-bundle.crt,
CLAUDE_CODE_MESSAGING_SOCKET, CLAUDE_CODE_MESSAGING_TOKEN, ...), and four
fewer of the harness's own: CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR,
CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR, CLAUDE_CODE_RESUME_INTERRUPTED_TURN,
CLAUDE_CODE_SUBSCRIPTION_TYPE.

NOT ESTABLISHED, labelled as such: whether those four are STRIPPED on the way
out or were simply never in the runtime process.env. /proc/PID/environ is the
exec-time image and does not show later process.env mutation, so this diff
proves the child env is CONSTRUCTED rather than inherited verbatim; it does not
by itself prove a strip list.

## M4. The construction is in the shipped binary, and I read it

/opt/claude-code/bin/claude is an ELF (228663608 bytes, CLAUDE_CODE_VERSION
2.1.42) with the minified JS embedded, and grep pulls it out:

    $ grep -a -o -E '.{80}envOverrides.{200}' /opt/claude-code/bin/claude | head -3

    function XLn({shellType:e,binShell:n,envOverrides:r,sandboxEnv:s,
      sandboxUnsetEnv:d,effortLevel:h}){
      return{...ei(),SHELL:e==="bash"?n:void 0,GIT_EDITOR:"true",
        ...r,...s,...Pze({sessionId:J(),effortLevel:h,source:"agent"}),
        ...d&&Object.fromEntries(d.map((y)=>[y,void 0]))}}

and the call site:

    env:XLn({shellType:r,binShell:gn,envOverrides:{...Go,...es,...Qo?.env,
      ...Ue&&r==="bash"?RUr({...ei(),...Go,...es},D?V3n():{}):{},...{}},
      sandboxEnv:wr,sandboxUnsetEnv:As,effortLevel:xe})

READ IT AS A SPREAD. The base is `ei()` (the host env). Everything after it is
an OVERRIDE LAYER. There is no term in this expression that starts from empty.
**The harness child env is default-allow by construction: every parent name is
present unless a later layer overwrites or deletes it.** The kernel's
buildChildEnv (src/exec/env.ts:180) starts from `{}` and copies IN. Those are
opposite shapes.

The one removal term is `sandboxUnsetEnv` -> `{name: undefined}`.

## M5. THE DECISIVE EXPERIMENT, RUN THREE WAYS

A nested `claude` CLI IS the harness's own agent-launch path and it runs here:

    $ /opt/claude-code/bin/claude -p 'Reply with exactly the five characters PONG1 and nothing else.' --output-format text
    PONG1
    EXIT=0

So the experiment the probe asks for is runnable in its requested shape: the
PARENT exports a unique sentinel, the PARENT launches a harness agent, and the
agent reports whether it can see the sentinel.

Sentinel: TIPHYS_PROBE_SENTINEL_7F3A=parent-set-value-7f3a
Reporter, run by the launched agent through ITS OWN Bash tool
(/tmp/claude-0/m4-probes/harness-env/report-env.sh):

    if [ -z "${TIPHYS_PROBE_SENTINEL_7F3A+x}" ]; then
      echo "SENTINEL_SET=NO VALUE=<none>"
    else
      echo "SENTINEL_SET=YES VALUE=[${TIPHYS_PROBE_SENTINEL_7F3A}]"
    fi
    if [ -z "${GH_TOKEN+x}" ]; then echo "GH_TOKEN_SET=NO"; else echo "GH_TOKEN_SET=YES LEN=${#GH_TOKEN}"; fi
    echo "TOTAL_VARS=$(env | wc -l)"

`+x` distinguishes UNSET from EMPTY, which is the whole question here.

Control, same script in the launching shell:

    SENTINEL_SET=YES VALUE=[parent-set-value-7f3a]
    GH_TOKEN_SET=YES LEN=93
    TOTAL_VARS=174
    exit 0

### Arm A: no settings (baseline)

    settings: {}
    SENTINEL_SET=YES VALUE=[parent-set-value-7f3a]
    GH_TOKEN_SET=YES LEN=93
    TOTAL_VARS=174
    ARM_EXIT=0

A harness-launched agent sees the launching process's environment in full.

### Arm B: settings `env` key, the only documented env control

    settings: {"env":{"TIPHYS_PROBE_SENTINEL_7F3A":""}}
    SENTINEL_SET=YES VALUE=[]
    GH_TOKEN_SET=YES LEN=93
    TOTAL_VARS=174
    ARM_EXIT=0

The override APPLIED (the value changed) and the variable is STILL SET. TOTAL
went 174 -> 174. `env` is an override map spread over the parent env; JSON
cannot express `undefined`, so it can blank a value but never remove a name,
and it removes nothing else. It is also session-wide, not per-launch.

### Arm C: sandbox credential scrubbing, the only REMOVAL mechanism in the binary

    settings: {"sandbox":{"enabled":true,"credentials":{"envVars":[
      {"name":"TIPHYS_PROBE_SENTINEL_7F3A","mode":"deny"},
      {"name":"GH_TOKEN","mode":"deny"}]}}}

    Sandbox disabled: sandbox is enabled but dependencies are missing:
    bubblewrap (bwrap) not installed, socat not installed - install missing
    tools (e.g. apt install bubblewrap socat) or see
    https://code.claude.com/docs/en/sandboxing
      Commands will run WITHOUT sandboxing. Network and filesystem
      restrictions will NOT be enforced.

    SENTINEL_SET=YES VALUE=[parent-set-value-7f3a]
    GH_TOKEN_SET=YES LEN=93
    TOTAL_VARS=174
    ARM_EXIT=0

TWO findings in one arm. The scrub needs OS sandbox dependencies that are not
installed here, AND when it cannot run **the harness FAILS OPEN**: it warned,
ran the command unscrubbed, and exited 0. src/exec/env.ts:180 is the opposite
contract: "A failure to stage any redirect target fails the whole
construction ... there is no partial success here (fail closed)."

## M6. Sandbox dependencies installed, and the deny THEN WORKS

    $ apt-get install -y -q bubblewrap socat     # APT_EXIT=0
    $ command -v bwrap; command -v socat
    /usr/bin/bwrap
    /usr/bin/socat

First retry still failed: `apply-seccomp: write /proc/self/uid_map: Operation
not permitted` (nested container, no userns for the default profile). With
`enableWeakerNestedSandbox: true` it starts.

### Arm D: {"sandbox":{"enabled":true,"enableWeakerNestedSandbox":true,
###         "failIfUnavailable":true,"credentials":{"envVars":[
###         {"name":"TIPHYS_PROBE_SENTINEL_7F3A","mode":"deny"},
###         {"name":"GH_TOKEN","mode":"deny"}]}}}

    SENTINEL_SET=NO VALUE=<none>
    GH_TOKEN_SET=NO
    TOTAL_VARS=193
    ARM_EXIT=0

**ANSWER TO QUESTION 3: YES.** A harness-launched agent CAN be made not to see
a variable its launcher has. Two names named, two names gone.

And the shape of the yes is the whole finding: 174 in, 193 out. Exact diff,
`comm` against the launching shell's name list:

    removed (2):  GH_TOKEN  TIPHYS_PROBE_SENTINEL_7F3A
    added  (21):  ALL_PROXY CLAUDE_CODE_HOST_HTTP_PROXY_PORT
                  CLAUDE_CODE_HOST_SOCKS_PROXY_PORT CLAUDE_CODE_TMPDIR
                  CLAUDE_TMPDIR CLOUDSDK_PROXY_PASSWORD CLOUDSDK_PROXY_USERNAME
                  DOCKER_HTTP_PROXY FTP_PROXY GIT_CONFIG_PARAMETERS
                  GIT_SSH_COMMAND GRPC_PROXY HTTP_PROXY RSYNC_PROXY
                  SANDBOX_RUNTIME TMPDIR TMPPREFIX all_proxy ftp_proxy
                  grpc_proxy http_proxy

It is a DENYLIST. You remove what you name; everything else crosses, plus 21
names you did not ask for.

## M7. CONTROL: the kernel's own path, same sentinel, same reporter

`buildChildEnv` + `subprocessAdapter.launch` from the scratch clone at
fc697d6 (/tmp/claude-0/m4-probes/harness-env/clone), node v22.22.2:

    KERNEL_CHILD_ENV_COUNT=7
    KERNEL_CHILD_ENV_NAMES=GH_CONFIG_DIR,GIT_CONFIG_GLOBAL,GIT_CONFIG_NOSYSTEM,
                           GIT_CONFIG_SYSTEM,HOME,PATH,XDG_CONFIG_HOME
    SENTINEL_IN_KERNEL_ENV=NO
    GH_TOKEN_IN_KERNEL_ENV=NO
    HOME_REDIRECTED_TO=.../ctrl/task/scrub-env/home
    SENTINEL_SET=NO VALUE=<none>
    GH_TOKEN_SET=NO
    TOTAL_VARS=10
    ADAPTER_OUTCOME={"kind":"completed","exitCode":0}
    exit 0

7 names constructed, 10 seen by bash (bash adds _, PWD, SHLVL). Against the
harness's best arm: 193.

## M8. HOW CLOSE CAN THE DENYLIST GET? Measured twice.

### Emulation 1: deny every name in the launching env that is not on the
### kernel allowlist (172 denies), plus settings env HOME -> the scrub root

    DENY_COUNT=172
    child names: 35

HOME WAS redirected, verbatim from the child:

    HOME=/tmp/claude-0/m4-probes/harness-env/ctrl/task/scrub-env/home

The 35: ALL_PROXY BUN_OPTIONS CLAUDE_CODE_HOST_HTTP_PROXY_PORT
CLAUDE_CODE_HOST_SOCKS_PROXY_PORT CLAUDE_CODE_TMPDIR CLAUDE_TMPDIR
CLOUDSDK_PROXY_ADDRESS CLOUDSDK_PROXY_PASSWORD CLOUDSDK_PROXY_PORT
CLOUDSDK_PROXY_TYPE CLOUDSDK_PROXY_USERNAME DOCKER_HTTPS_PROXY DOCKER_HTTP_PROXY
FTP_PROXY GIT_CONFIG_PARAMETERS GIT_SSH_COMMAND GRPC_PROXY HOME HTTPS_PROXY
HTTP_PROXY NO_PROXY PATH PWD RSYNC_PROXY SANDBOX_RUNTIME SHLVL TMPDIR TMPPREFIX
_ all_proxy ftp_proxy grpc_proxy http_proxy https_proxy no_proxy

**GIT_SSH_COMMAND IS ON THE KERNEL'S OWN DANGEROUS LIST.**
src/gates/credentials.ts:155 lists it in DANGEROUS_ENV_VOCABULARY, described at
src/gates/credentials.ts:128 as "shell command git uses for its ssh transport".
The `credential-scrub` gate reddens when it is present in the constructed child.

And it is not merely present, it CARRIES A LIVE CREDENTIAL. The launched agent
refused to relay its own output and said why, which is how this was found:

    "The output includes a GIT_SSH_COMMAND value containing a proxy auth
     token (proxyauth=srt.<REDACTED>) - that's credential material for a
     proxy, not a 'non-secret' variable as the task description claimed."

Read from the file it wrote, redacted here:

    GIT_SSH_COMMAND=ssh -o ControlMaster=no -o ControlPath=none
      -o ProxyCommand='socat - PROXY:localhost:%h:%p,proxyport=3128,
      proxyauth=<REDACTED>

### Emulation 2: ALSO deny all 21 sandbox-injected names (192 denies)

    DENY_COUNT=192
    child names: 32

Only CLAUDE_CODE_TMPDIR, CLAUDE_TMPDIR and TMPPREFIX dropped. **GIT_SSH_COMMAND
SURVIVES AN EXPLICIT DENY**, with its credential, and so do all 20 proxy
variables. Naming them does not remove them.

MECHANISM, and this is a READING of the bundle rather than a measured fact: the
deny becomes `{name: undefined}` at the Node spawn layer (XLn, M4 above), while
the proxy variables are pushed INSIDE the jail by the sandbox runtime as
`--setenv` arguments to bwrap, after and independent of that layer. The
MEASUREMENT is the 32-name residue; the explanation is a reading.

## M9. Where the control lives, and why that decides the question

Every knob above came from a SETTINGS FILE (`--settings`, or user/managed
settings). The binary is explicit that this is the only accepted source:

    "Only honored from user, managed/policy, or CLI (`--settings`)"

There is NO per-launch environment control anywhere in the agent-launch path:

- The Bash tool schema as served to me has `command, description,
  run_in_background, timeout, dangerouslyDisableSandbox`. No env field.
- The agent-definition frontmatter fields found in the binary are
  `allowed-tools`, `argument-hint`, `disable-model-invocation`,
  `user-invocable`, `shell`, `mcpServers`. No env field.
- `mcp__Claude_Code_Remote__create_session`, the other harness-native
  orchestration primitive available here, has no env property in its schema
  at all; its own description names `environment_variables` only as a field
  that is IGNORED.

So the only way to vary the environment PER TASK is to vary `--settings` per
task, which means launching a fresh `claude` PROCESS per task. That is
subprocess execution. It is option 2's mechanism wearing option 1's clothes.

NOT COVERED: I could not read the in-session Task/Agent tool's input schema
directly. CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1 and I am already a subagent,
so no Task tool is served to me and ToolSearch returns nothing for it. The
statement "the Task tool has no env parameter" is therefore an inference from
the agent-definition schema and from the absence of any per-call env plumbing
in XLn, NOT a captured schema. A reader who can run at depth 0 should confirm it
in one call.

## Verdict

**Option 1 is REFUTED for ship phases**, on measurement rather than on
DR-0010's list:

1. Wrong polarity. Kernel: 7 names built from `{}` (M7). Harness: `{...ei(),
   ...}`, 193 names, minus what you name (M4, M6).
2. Wrong scope. Per-session settings file, not per-launch (M9). The kernel's
   five pointers are PER-TASK paths (scrubRoot(taskDir), src/exec/env.ts:110);
   one settings file cannot carry two tasks' HOMEs.
3. Fails open. Sandbox unavailable -> warn and run unscrubbed, exit 0 (M5 arm
   C). src/exec/env.ts:180 fails closed.
4. Leaks a credential that cannot be denied. GIT_SSH_COMMAND, on the kernel's
   own DANGEROUS_ENV_VOCABULARY (src/gates/credentials.ts:155), carrying a live
   proxy auth token, survives an explicit deny (M8). A primitive-backed ship
   adapter would redden the kernel's own `credential-scrub` gate on every run.

Finding 4 alone is sufficient and it is the one to quote.

**Option 3 (hybrid) survives unharmed.** Nothing measured here weakens
primitive-backed fan-out for read-only judgment work, where no credential
scrub is claimed.

STATUS: COMPLETE.
