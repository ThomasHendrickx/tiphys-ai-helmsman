# PROBE: how does a real agent payload authenticate under the kernel credential scrub?

key: credential-scrub
started: 2026-09-15
repo: /home/user/tiphys-ai-helmsman @ branch plan/pstack-borrow-review
scratch: /tmp/claude-0/m4-probes/credential-scrub/

STATUS: IN PROGRESS (this file is appended to as work happens; a partial file means the probe died)

## 0. Setup

f7576f46db536ce7da069ac94cf3ec377a5e5df3

## 1. The scrubbed child environment, built for real (MEASURED)

Driver: /tmp/claude-0/m4-probes/credential-scrub/build-child-env.mjs
It imports the kernel's OWN src/exec/env.ts and calls buildChildEnv with
parentEnv: process.env. No mock, no reimplementation.

Command:
  /opt/node22/bin/node build-child-env.mjs /tmp/claude-0/m4-probes/credential-scrub/scrub1
Exit code: 0
Output (verbatim, 7 variables):

  child env variable count: 7
  GH_CONFIG_DIR=<scrub>/gh-config
  GIT_CONFIG_GLOBAL=<scrub>/gitconfig-global
  GIT_CONFIG_NOSYSTEM=1
  GIT_CONFIG_SYSTEM=<scrub>/gitconfig-system
  HOME=<scrub>/home
  PATH=/root/.local/bin:/root/.cargo/bin:/usr/local/go/bin:/opt/node22/bin:/opt/maven/bin:/opt/gradle/bin:/opt/rbenv/bin:/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  XDG_CONFIG_HOME=<scrub>/xdg-config

SEVEN. Not eight: TMPDIR, LANG and the LC_* names are in
DEFAULT_CHILD_ENV_ALLOWLIST but are ABSENT FROM THIS PARENT, and buildChildEnv
copies only names that are present (src/exec/env.ts:193). The three
TIPHYS_EXIT_TEST_* and the six GIT_*_{NAME,EMAIL,DATE} names are likewise absent
here.

Parent for comparison: 173 names (env | sed 's/=.*//' | sort | wc -l = 173),
captured at /tmp/claude-0/m4-probes/credential-scrub/parent-env-names.txt.
So the scrub drops 166 of 173 and rewrites HOME.

What is NOT in the child and matters for this probe:
  HTTPS_PROXY, https_proxy, NO_PROXY, no_proxy   (the agent proxy address)
  NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, CURL_CA_BUNDLE, REQUESTS_CA_BUNDLE (the proxy CA)
  ANTHROPIC_BASE_URL, SESSION_INGRESS_URL
  CLAUDE_CODE_* (every one of the ~40 present in the parent)
  CLAUDE_SESSION_INGRESS_TOKEN_FILE
  GH_TOKEN
  GIT_CONFIG_COUNT / GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n
  HOME points at an empty harness directory, so ~/.claude, ~/.config/gh,
    ~/.gitconfig, ~/.netrc and ~/.git-credentials are all gone by redirection.


## 2. THE CONTROL, AND THE RESULT THAT INVERTS THE PREMISE

Failure arm defined BEFORE running: each arm asks the CLI to echo a UNIQUE
nonce (so a green arm cannot be a cache hit) and is scored
AUTHENTICATED only if the nonce appears in stdout. Runner:
/tmp/claude-0/m4-probes/credential-scrub/arm.sh . Every arm prints exit code,
stdout and stderr unconditionally.

CONTROL (full parent environment):
  timeout 120 /opt/claude-code/bin/claude -p 'Reply with exactly the word PROBEOK...'
  EXIT=0, stdout "PROBEOK", stderr empty.
So the control works and the probe CAN distinguish a working run from a broken
one. This is not a "could not test" result.

ARM 1, the EXACT 7-variable scrubbed environment from section 1, via
  env -i <the 7 names> /opt/claude-code/bin/claude -p ...
  LABEL=arm-scrubbed EXIT=0 VERDICT=AUTHENTICATED (stdout "PROBEOK")
  stderr: "Warning: no stdin data received in 3s..." (unrelated, fixed with </dev/null)

ARM 2, PATH ONLY, nothing else at all:
  ./arm.sh a-pathonly PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  LABEL=a-pathonly EXIT=0 NONCE=N643455 VERDICT=AUTHENTICATED (stdout "N643455")

**FINDING 1 (HIGH), and it is a negative result that contradicts the intake's
premise: IN THIS CONTAINER A CLAUDE CODE PAYLOAD AUTHENTICATES UNDER THE FULL
KERNEL SCRUB, AND UNDER A ONE-VARIABLE ENVIRONMENT.** No environment variable is
required. So the minimal extraAllowlist for authentication, measured here, is
THE EMPTY LIST.

## 3. WHY it authenticates: the credential is a hardcoded absolute path

Established by syscall trace, not by reasoning:

  timeout 180 strace -f -e trace=openat -o trace-pathonly.txt \
    env -i PATH=/usr/local/bin:/usr/bin:/bin /opt/claude-code/bin/claude -p '...'
  EXIT=0, stdout "TRACEOK", 824 traced lines.

Successfully opened, credential-relevant (grep -v ENOENT):
  /home/claude/.claude/remote/.oauth_token
  /home/claude/.claude/remote/.session_ingress_token

Attempted and ENOENT:
  /home/claude/.claude/remote/.api_key
  /root/.claude/.credentials.json

**/home/claude/... is an ABSOLUTE PATH OUTSIDE $HOME.** Redirecting HOME, which
is the kernel's entire credential-store defense (CREDENTIAL_STORE_REDIRECTIONS,
src/exec/env.ts:110), does not move it and cannot. The scrub is an
environment-only scrub; this credential is not reached through the environment.

Second, subsidiary observation from the same trace: with HOME UNSET (env -i,
arm 2) the process opened /root, /root/.claude.json, /root/.gitconfig and the
whole /root/.claude tree. That is exactly the fallback src/exec/env.ts:22-30
predicts and is why the module redirects rather than drops. The kernel is right
about that; it is just not sufficient.


## 4. THE RED WITNESS, observed FROM A REAL SPAWN (not from the object)

The intake's requirement is that the witness be observed from inside the run,
because the credential-scrub gate probes the CONSTRUCTED OBJECT and a check of
the object cannot tell a scrubbed run from an unscrubbed one. Two arms, one
binary, one prompt shape, differing ONLY in the spawning uid:

ARM 3, unprivileged uid, same minimal environment:
  NONCE=U14271
  timeout 150 setpriv --reuid=65534 --regid=65534 --clear-groups \
    env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=<scratch>/unpriv-home \
    /opt/claude-code/bin/claude -p "Reply with exactly the word U14271 ..."
  EXIT=1
  stdout: "Not logged in - Please run /login"
  stderr: empty
  VERDICT: NOT-AUTHENTICATED

  (the middle dot in the CLI's real output is U+00B7; rendered here as " - ".
   One occurrence, nothing else in any captured output altered. Declared per
   CLAUDE.md's transliteration rule.)

So the probe CAN go red. "Not logged in" is a specific authentication refusal,
not a generic crash, and the identical command at uid 0 returns the nonce.

**FINDING 2 (HIGH): the credential boundary in this container is the UID AND THE
FILESYSTEM, NOT THE ENVIRONMENT.** The kernel's scrub operates on the
environment only and spawns the child at the SAME uid as the parent
(src/spawn.ts hands adapter.launch an env and no uid/gid), so the payload keeps
read access to /home/claude/.claude/remote/.oauth_token (mode 700 root)
regardless of what the allowlist says.


ARM 4, the setpriv CONTROL at uid 0, so the only variable between arm 3 and
arm 4 is the uid (same setpriv, same --clear-groups, same env -i, same HOME):
  NONCE=R14376
  timeout 150 setpriv --reuid=0 --regid=0 --clear-groups env -i \
    PATH=/usr/local/bin:/usr/bin:/bin HOME=<scratch>/unpriv-home \
    /opt/claude-code/bin/claude -p "..."
  EXIT=0, stdout "R14376", VERDICT: AUTHENTICATED

| arm | uid | env | exit | verdict |
|---|---|---|---|---|
| control | 0 | full parent (173 names) | 0 | AUTHENTICATED |
| 1 | 0 | the kernel's 7 scrubbed names | 0 | AUTHENTICATED |
| 2 | 0 | PATH only | 0 | AUTHENTICATED |
| 4 | 0 | PATH + HOME, via setpriv | 0 | AUTHENTICATED |
| 3 | 65534 | PATH + HOME, via setpriv | 1 | NOT-AUTHENTICATED ("Not logged in") |

Single variable changed between rows 4 and 3. That is the red witness.


## 5. The OTHER half: git push DOES break under the scrub, and one name fixes it

Endpoint used as a non-destructive push-authorization probe:
  https://github.com/ThomasHendrickx/tiphys-ai-helmsman.git/info/refs?service=git-receive-pack
(200 = authorized to push, 401 = not)

  full env:                 HTTP=200 (exit 0)
  scrubbed 7-var env:       HTTP=401 (exit 0)
  env -i PATH only:         HTTP=401 (exit 0)
  scrubbed + HTTPS_PROXY:   HTTP=200 (exit 0)
  scrubbed + HTTPS_PROXY + CURL_CA_BUNDLE: HTTP=200 (exit 0)
  scrubbed + GH_TOKEN ONLY: HTTP=401 (exit 0)

Confirmed with the real operation, from a scratch shallow clone at
/tmp/claude-0/m4-probes/credential-scrub/sc (the repository working tree was
never touched):

  env -i <7 scrubbed names> GIT_TERMINAL_PROMPT=0 git -C sc push --dry-run origin HEAD:refs/heads/probe/...
    EXIT=128
    fatal: could not read Username for 'https://github.com': terminal prompts disabled

  same + HTTPS_PROXY=http://127.0.0.1:35267
    EXIT=0
     * [new branch]      HEAD -> probe/credential-scrub-dryrun-22166

  same + lowercase https_proxy only          EXIT=0, * [new branch]
  same + HTTPS_PROXY + NO_PROXY              EXIT=0, * [new branch]

**FINDING 3 (HIGH): the ONE name that carries GitHub write capability across the
scrub is HTTPS_PROXY (or its lowercase twin), and GH_TOKEN carries NOTHING.**
This is standing warning 6's 2026-08-14 reversal, measured again from the other
side: the agent proxy at $HTTPS_PROXY substitutes real credentials on the way
out, so the proxy ADDRESS is the credential. An allowlist reviewer looking for
"credential-capable names" will not flag HTTPS_PROXY, and the credential-scrub
gate's documented vocabulary is gh/git/ssh/node token names.

Note for routing: NO_PROXY in the parent lists api.anthropic.com AND
registry.npmjs.org among the direct hosts, which is consistent with section 3:
Anthropic auth is the on-disk oauth token and does not use the proxy at all,
while GitHub auth is the proxy and nothing else.

npm through the scrub: env -i <7 names> HTTPS_PROXY=... npm ping
  EXIT=0, "npm notice PONG 411ms". No CA variable needed.


## 6. The red-witness CHECK: /tmp/claude-0/m4-probes/credential-scrub/inside-child-check.sh

It runs AS THE PAYLOAD and probes CAPABILITIES, not names. Argument: the
comma-separated powers the adapter DECLARES the payload may hold. Exit 0 green,
1 red, 2 "cannot tell" (an unrunnable probe is never reported as green).
Probes: env-name drift; anthropic-api (spend the owner's model credential);
github-push (HTTP 200 on git-receive-pack); oauth-token-file (readability of 4
known agent credential paths); real-home-stores (readability of 5 real-HOME
git/gh/claude stores).

Four arms, all captured in this directory (witness-A2.txt, witness-B.txt):

| arm | uid | env | declared | exit | verdict |
|---|---|---|---|---|---|
| A | 0 | the kernel's real 7-name scrub | none | 1 | **RED**: anthropic-api, oauth-token-file, real-home-stores all reachable |
| B | 65534 | same names, HOME swapped for a writable one | none | 0 | GREEN: all four powers not reachable |
| C | 0 | the kernel's real 7-name scrub | the three | 0 | GREEN |
| D | 0 | scrub + HTTPS_PROXY (extraAllowlist) | the three | 1 | **RED on github-push**, HTTP 200 |

Arm A is the red witness the intake asks for. Arm B proves the check is not
stuck red: it goes green when the power is genuinely cut. Arms A and D redden on
STRUCTURALLY DIFFERENT members of the class (a filesystem-reachable credential
and a network capability granted by an environment name), which is CLAUDE.md's
"one witness is not a class" requirement.

Arm A verbatim:
  PROBE env-drift = clean (no name outside the allowlist)
     cmd: /opt/claude-code/bin/claude -p '...Z639961...'  exit=0  out=[Z639961]
  PROBE anthropic-api = REACHABLE, NOT DECLARED -- RED (nonce Z639961 echoed, exit 0)
     cmd: curl ... <git-receive-pack>  exit=0  http=401
  PROBE github-push = not reachable (HTTP 401)
  PROBE oauth-token-file = REACHABLE, NOT DECLARED -- RED (readable:
     /home/claude/.claude/remote/.oauth_token /home/claude/.claude/remote/.session_ingress_token)
  PROBE real-home-stores = REACHABLE, NOT DECLARED -- RED (readable:
     /root/.gitconfig /root/.claude.json)
  VERDICT: RED. CHECK_EXIT=1

**Note the last line and what it means for the kernel's own claim.** HOME was
redirected to the empty harness directory and /root/.gitconfig and
/root/.claude.json were STILL readable, because redirecting HOME hides a path
from RESOLUTION, it does not remove READ ACCESS to the absolute path. Any
payload that types the absolute path gets the file. The module comment at
src/exec/env.ts:22 is right that dropping HOME is worse; redirecting it is not
the same as cutting access.


## 7. What the kernel's own gate says at the same moment (the false green)

  /opt/node22/bin/node bin/tiphys.ts gates run --registry gate-registry.yaml \
    --mode local-only --only credential-scrub --evidence <scratch>/gate-ev
  GATE_EXIT=0
  gates: declared 1 applicable 1 verdict 1 green 1 red 0 not-applicable 0 error 0 vacuous 0
  gates: credential-scrub: green: no pull-request-capable credential resolvable
         from any of the 7 probed sources

That green was produced at the SAME head and in the SAME container where arm A
of the inside-child witness was RED with three reachable powers. The gate is not
wrong about what it probes; it probes a different thing.

**Two structural reasons, both measured, not read off the source.**

(a) The gate can NEVER observe an extraAllowlist. runCredentialScrub at
src/gates/credentials.ts:559 calls buildChildEnv with no extras, so whatever the
adapter passes at spawn time is invisible to it.

(b) Even wired CORRECTLY (extras passed to buildChildEnv AND to
permittedNames, which is the only way to avoid a false red on every extra
name), the gate's verdict is INVERTED with respect to real capability here:

  /opt/node22/bin/node gate-blind2.mjs
    HTTPS_PROXY crossed = true
    gate verdict = green
    detail: no pull-request-capable credential resolvable from any of the 7 probed sources
  env -i PATH=... HTTPS_PROXY=... curl ... <git-receive-pack>
    git-receive-pack HTTP=200

  /opt/node22/bin/node gate-blind3.mjs   (extras GIT_CONFIG_COUNT, _KEY_0, _VALUE_0,
                                          all DECLARED in permittedNames)
    gate verdict = red
    detail: credential- or code-execution-capable variable(s) from the walked
            vocabulary present in the child environment: GIT_CONFIG_COUNT,
            GIT_CONFIG_KEY_0, GIT_CONFIG_VALUE_0

  /opt/node22/bin/node gate-blind.mjs   (isDangerousEnvName)
    HTTPS_PROXY  -> false
    https_proxy  -> false
    GH_TOKEN     -> true (caught, and it carries NOTHING here, see section 5)

**FINDING 4 (HIGH): the gate greens the one name that grants push (HTTPS_PROXY)
and reddens names that grant only URL rewriting (GIT_CONFIG_*), while the name
it is proudest of catching (GH_TOKEN) is inert in this container.** Its
vocabulary was written against a world where a token in the environment is the
credential. The agent proxy moved the credential to the ROUTE.

## 8. The minimal extraAllowlist, by measurement

Rule applied: a name goes on the list only with an experiment showing the
capability is LOST without it and PRESENT with it.

| # | name | needed for | experiment that shows it is necessary |
|---|---|---|---|
| - | (none) | Anthropic model authentication | NOT NEEDED. Arm 2, PATH only, EXIT=0, nonce echoed. The credential is /home/claude/.claude/remote/.oauth_token, an absolute path no variable controls. |
| - | (none) | git clone / fetch / ls-remote (read) | NOT NEEDED. `env -i <7 scrubbed names> git ls-remote <repo>` EXIT=0. |
| 1 | `HTTPS_PROXY` | git PUSH, and any GitHub write | without: `git push --dry-run` EXIT=128 "could not read Username for 'https://github.com'". with: EXIT=0 "* [new branch]". `https_proxy` lowercase is an ALTERNATIVE (also EXIT=0), not an addition; one of the two suffices. |
| 2 | `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n` | ONLY IF the payload may meet an ssh-form remote (`git@github.com:`) | without: `git ls-remote git@github.com:...` EXIT=128 "cannot run ssh: No such file or directory". with the parent's three pairs: refs listed, EXIT=141 (SIGPIPE from head). These carry url.insteadOf rewrites, not a credential. NOTE they make the gate RED (section 7). Omit them and require https remotes instead; that is the cheaper resolution. |

NAMES EXPERIMENTALLY SHOWN **NOT** NECESSARY, so they do NOT go on the list:
  GH_TOKEN                scrubbed + GH_TOKEN only -> git-receive-pack HTTP=401
  NODE_EXTRA_CA_CERTS,
  CURL_CA_BUNDLE,
  SSL_CERT_FILE,
  GIT_SSL_CAINFO          push dry-run EXIT=0 and `npm ping` EXIT=0 with none of them
  NO_PROXY / no_proxy     push dry-run EXIT=0 without them
  ANTHROPIC_BASE_URL,
  CLAUDE_CODE_*,
  CLAUDE_SESSION_INGRESS_TOKEN_FILE
                          arm 2 (PATH only) authenticated without any of them

So the answer to the probe's question, measured: **for the pilot's plan writer
the minimal extraAllowlist is EMPTY.** The pilot dispatched outside the kernel
to solve a problem that, in this container, the scrub does not create. What the
scrub DOES break is `git push`, and that costs exactly one name.


## 9. What I did NOT cover, and why

1. **I could not mask /home/claude/.claude/remote and re-test.** The obvious
   failure arm for section 3 was a private mount namespace binding an empty
   directory over that path. The command was REFUSED by this session's
   permission classifier ("Credential Exploration"), and so was `ls -la` of the
   directory. So the claim "the .oauth_token file is what authenticates" rests
   on the strace evidence (opened successfully) plus the uid experiment
   (unreadable at uid 65534 -> "Not logged in"), NOT on removing it. I never
   read the contents of any credential file and did not try to.
2. **One container, one day.** Every result above is scoped to this container
   at 2026-09-15, exactly as standing warning 6 records for the REST-API
   reversal. The pilot's report may be true of the PILOT'S environment.
   **I cannot distinguish "the pilot was wrong" from "the pilot ran somewhere
   else".** Nothing here refutes the pilot; it refutes the premise AS APPLIED TO
   THIS CONTAINER. Re-probe before relying on it.
3. **I did not run a real `tiphys spawn`.** Building a fleet was not needed to
   answer the question, because the thing under test, buildChildEnv, is the same
   function spawn calls (src/spawn.ts:452), and I called it directly with
   process.env. So the ENVIRONMENT is the real one; the SPAWN PATH around it
   (worktree, hook, adapter) is not exercised here.
4. **I did not test allowPrCredentials by running it.** src/spawn.ts:449 skips
   the build entirely when it is true, so the child gets process.env unchanged;
   that is the full parent environment, which is the CONTROL arm, already
   measured as AUTHENTICATED with push HTTP=200. No separate run adds anything.
5. **I tested `claude -p` echoing a nonce, not a real agent turn.** A payload
   doing real work also writes files, runs tools and may need a writable HOME
   and a real TMPDIR. TMPDIR is in the default allowlist but ABSENT FROM THIS
   PARENT, so it does not cross; I did not measure whether a long agent turn
   needs it.
6. **I did not test the turn-end hook child.** It gets the same env
   (src/spawn.ts:~205) and reads no environment, so nothing was expected; not
   measured.
7. **No MCP servers were probed.** A real payload with MCP connectors may carry
   credentials by a fourth route I did not look at.
8. **Suite not run.** This probe changed nothing in the repository, so there was
   nothing to regress. No suite count is quoted, deliberately, rather than
   quoting an incomplete one.

## 10. Housekeeping

- The repository working tree was NEVER modified: `git status` clean at start,
  and every git write went to a scratch shallow clone at
  /tmp/claude-0/m4-probes/credential-scrub/sc .
- Every push was `--dry-run`. Confirmed nothing was created:
  `git ls-remote origin 'refs/heads/probe/*'` from the repository returned
  0 matching refs.
- I had to `chmod 755 /tmp/claude-0` for the unprivileged arms (it is
  drwx------ and an unprivileged uid cannot traverse it, exactly as standing
  warning 1 records). It appears to be reset back to 700 by something in this
  environment: it reverted between two of my commands without my doing it.
  Restored to 700 at the end of this probe.


## 11. Recommendations for M4-D-07 (each tied to a measurement above)

1. **Wire `extraAllowlist` through `spawnTask`** (it is dead data today:
   src/spawn.ts:452 passes no extras). Default it to EMPTY, because the
   measured minimum for model authentication is empty.
2. **Declare `HTTPS_PROXY` (or `https_proxy`) as the ONE push-capability name**,
   with the reason recorded as "this is the credential in a proxy-substituting
   container; the token variables are inert here" (section 5). Grant it only to
   a payload that must push.
3. **Forbid `allowPrCredentials` for project payloads**, as the intake already
   proposes. Nothing measured here weakens that; the flag hands over the full
   parent environment including the proxy route.
4. **The scrub is NOT the security boundary for an agent payload in this
   container, and M4 should stop treating it as one.** The Anthropic credential
   is reachable at an absolute path, and the real HOME's stores stay READABLE
   after HOME is redirected (arm A). The measured mechanism that actually cuts
   both is UID SEPARATION (arm B), which the kernel does not use.
5. **Any credential-scrub assertion must run FROM INSIDE a real spawn.** The
   object-probe gate is green in the exact state the inside-child witness is
   red (section 7). inside-child-check.sh is a working starting point: it has a
   demonstrated red (arms A, D), a demonstrated green (arms B, C), and a
   distinct exit 2 for "could not tell".
6. **If the gate is ever wired to see the adapter's extras, pass them to
   permittedNames too**, or every declared extra name is a false red
   (gate-blind.mjs, three of three extras red on the stray check).

END OF PROBE.
