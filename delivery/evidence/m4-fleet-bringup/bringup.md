# M4-P30: the kernel's fleet-home bring-up, measured

- date: 2026-09-17
- phase: M4-P30, branch `claude/m4-p30-fleet-bringup`
- specification: kernel plan M4 section 3.4, which is still titled M4-P15
  because only the id moved (delivery/plan/kernel-plan-m4.md:3871)
- fleet home: `ThomasHendrickx/tiphys-ai-helmsman-fleet`, the real remote
- machine-readable records: `records/*.json`, one per command, each carrying
  the command line, the working directory, the interpreter version AND its
  absolute path, the exit code, and the captured stdout and stderr. Every exit
  code quoted below is the `exitCode` field of a named record.

## The four axes of every measurement here (criterion 9)

Quoted once and true of every command in this document unless a row says
otherwise.

| axis | value |
|---|---|
| interpreter | node v26.6.0, absolute path `/tmp/claude-0/n26/bin/node` |
| npm | 11.18.0 |
| build state | `dist/` present, `npm run build` exit 0, `git status --short` empty after it |
| other tools | git 2.43.0; gh 2.63.2 (2024-12-05), installed from the upstream release tarball into the scratchpad per CLAUDE.md standing warning 6 |
| working directory | named per record in its `cwd` field; the fleet home for every doctor and lock run |

**The scratch-toolchain trap is live here and was diagnosed rather than
assumed.** The clone and the interpreter are both under `/tmp/claude-0`, which
is `drwx------`, so an unprivileged uid cannot traverse into it:

```
namei -m "$(command -v node)"
f: /tmp/claude-0/n26/bin/node
 drwxr-xr-x /
 drwxrwxrwt tmp
 drwx------ claude-0
 drwxr-xr-x n26
 drwxr-xr-x bin
 -rwxr-xr-x node
```

The repository is under `/tmp` as well, so `grantTraversalWhenUnderTmp` opens
the chain incidentally and the unprivileged-uid test in `test/gates.test.ts`
passes. A clone outside `/tmp` with this interpreter would hit the EACCES that
CLAUDE.md records; that is a property of the interpreter's path, not of this
branch.

**Two shas, and both arms of every witness name theirs.** The base is
`origin/main` at `84f1765`, run from a detached worktree at that commit whose
`node_modules` is a symlink to the branch clone's (no dependency manifest
differs between the two: `git diff --name-only origin/main...HEAD` names
neither `package.json` nor `package-lock.json`). The branch head at the time
of these captures is `a47b6fd`.

## Criterion 1: the charter validates, and the negative copy does not

| command | expectation | exit | record |
|---|---|---|---|
| `tiphys validate --type charter <fleet>/charter/kernel-charter.yaml` | 0 | **0**, no output | `records/C1.1-charter-valid.json` |
| `tiphys validate --type charter delivery/evidence/m4-fleet-bringup/charter-negative-no-escalation-contract.yaml` | nonzero | **1** | `records/C1.2-charter-negative.json` |

The charter placed in the fleet is the repository's own `charter.yaml`, byte
for byte:

```
sha256sum clone/charter.yaml fleet/charter/kernel-charter.yaml
bbb5a2f9fcb2e5a3ce0769f2f44a49e0b73283926e1fbf95f6cd280012cc32b5  .../clone/charter.yaml
bbb5a2f9fcb2e5a3ce0769f2f44a49e0b73283926e1fbf95f6cd280012cc32b5  .../fleet/charter/kernel-charter.yaml
```

The negative copy was produced MECHANICALLY, by a script that deletes one
top-level key's block and copies every other byte through
(`records/C1.2-charter-negative.json` names the file it validated). It deleted
lines 106 to 137, thirty-two lines, the whole of `escalation-contract`, and
changed nothing else. Its captured stderr is one line:

```
INVALID #/escalation-contract required property escalation-contract is missing
```

The rejection names the deleted property rather than failing for an unrelated
reason, which is what makes the pair a witness that validation is live rather
than ceremonial.

## Criterion 2: a real off-container fleet home, not a local bare stand-in

The M3 exit test's E1.2 used a LOCAL BARE repository as origin and said in
terms that nothing there witnessed a real off-container fleet home
(delivery/evidence/m3-exit-test/e1-1-to-e1-5.md:72). This is the half that
could not be rehearsed, done once against the real remote.

| step | command | exit | record |
|---|---|---|---|
| init a fresh empty directory | `tiphys init <fleet>` | **0** | `records/C2.1-init.json` |
| configure the remote | `git remote add origin https://github.com/ThomasHendrickx/tiphys-ai-helmsman-fleet` | **0** | `records/C2.2-remote-add.json` |
| push the initial commit | `git push -u origin main` | **0** | `records/C2.3-push-initial-commit.json` |
| read the remote back | `git ls-remote origin` | **0** | `records/C2.4-ls-remote.json` |

`git ls-remote origin` reports `20584905c5c3ad9d0c707aa3df8f2eb549a0e275
refs/heads/main`, which is the fleet's local HEAD, so the ref that landed is
the commit `tiphys init` made. No dry run is quoted anywhere in this document:
CLAUDE.md standing warning 14 records that `git push --dry-run` does not probe
push authorization at all, in either direction.

**The bring-up order matters and was followed.** `tiphys init` refuses any
non-empty directory and its marker set includes `.git`
(src/commands/init.ts:84), so cloning the empty remote first would have left a
directory containing only `.git` and made `init` exit 1. The order is init into
a fresh empty directory, THEN add the remote, THEN push.

**WHAT DIFFERED FROM THE REHEARSAL, written down rather than closed.** The push
printed two lines a local `file://` remote never produces:

```
fatal: expected 'acknowledgments', received 'packfile'
warning: push negotiation failed; proceeding anyway with push
```

It exited 0 and the ref landed. This is push negotiation (`push.negotiate`)
failing against this remote and git falling back, and it is reported on stderr
while the operation succeeds. It is recorded because a reader watching stderr
for trouble will see the word `fatal` on a successful push, and because nobody
here has established WHY negotiation fails against this remote: the proxy, the
server and the git version are all candidates and no control arm was run.

**The remote already carried six refs from earlier phases' probes** and still
does: `probe-fleet-home`, `probe-lease-a`, `tiphys/lease`, `tiphys/lease-r1`,
`tiphys/lease-r2`, `tiphys/lease-r3`. Nothing here deleted any of them, and
ref deletion is refused in this container (owner action, delivery/STATE.md:1587).
They are why the `branches` check WARNs on the configured fleet, which is the
next section.

## Criterion 3: doctor as init leaves it, recorded with its exit code

A run that reports only the final green has destroyed the evidence that setup
was needed, so this is recorded first and whatever it says.

| record | PATH | exit | the FAIL lines |
|---|---|---|---|
| `records/C3.1-doctor-full-as-init-leaves-it.json` | gh present | **1** | `CHECK remote FAIL no remote configured, fleet state has no push target (SC-002) (required for profile full)` |
| `records/C3.2-doctor-full-as-init-leaves-it-no-gh.json` | gh absent | **1** | the same remote line, plus `CHECK gh FAIL gh not found on PATH, PR modes unavailable (required for profile full)` |

Both ran against the kernel at `84f1765`, before any source edit on this
branch. Both printed `CHECK retention WARN ... retention is not applicable`,
which is the state this phase changes and the reason the next two sections
exist.

The two rows differ in one variable, the PATH, so the gh line is attributable
to the environment rather than to the fleet. Neither FAIL is a defect in the
kernel: a freshly initialized fleet has no remote yet, and `gh` is an
environment fact.

## Criterion 4: doctor on the configured fleet

Setup between criterion 3 and this one, so a reader can tell setup from a
kernel change: the remote was configured and pushed (criterion 2), the charter
was placed at `charter/kernel-charter.yaml`, and the kernel repository was
cloned into `projects/tiphys-kernel`, which realizes the project the charter
names.

| record | kernel | exit | FAIL lines |
|---|---|---|---|
| `records/C4.1-doctor-full-configured-at-base.json` | `84f1765` | **0** | **0** of 13 CHECK lines |
| `records/C4.3-doctor-full-configured-after-change.json` | this branch | **0** | **0** of 13 CHECK lines |

The full output of the second, verbatim from the record:

```
CHECK node PASS v26.6.0 satisfies kernel engines ">=26"
CHECK git PASS git version 2.43.0
CHECK gh PASS gh version 2.63.2 (2024-12-05)
CHECK layout PASS all layout entries present
CHECK remote PASS in sync with origin/main (0 ahead, 0 behind) after fetching origin
CHECK lock PASS lease held by dc64baa0-78eb-42e5-beeb-a1c5397e91c7, expires 2026-09-17T17:47:32.401Z
CHECK beacon WARN watcher not running or not scheduled
CHECK identity PASS git commit identity configured (Claude <noreply@anthropic.com>)
CHECK retention PASS 3 declared retention path(s) present and tracked
CHECK tasks PASS 0 open of 0
CHECK branches WARN 6 of 7 pushed branch(es) unmerged into origin/main: origin/probe-fleet-home, origin/probe-lease-a, origin/tiphys/lease, origin/tiphys/lease-r1, origin/tiphys/lease-r2, origin/tiphys/lease-r3
CHECK worktrees PASS no pool worktrees
CHECK kernel-artifacts PASS the kernel install at .../clone carries roles/, schemas/, checklists/ and AGENTS.md
```

Two WARN lines, zero FAIL lines, exit 0. The `branches` WARN is M4-P17's check
meeting a real remote for the first time and naming the six probe refs above;
no profile promotes it, for the reason src/commands/doctor.ts:86 gives.

**CRITERION 4 ALONE IS THE GUARD THAT CANNOT GO RED, and saying so is the
point.** Exit 0 here is compatible with a fleet that has no charter at all,
which is exactly what the next section measures.

**The intermediate state that looks like a defect and is not.** With the
charter placed and the project clone absent, `retention` goes FAIL rather than
WARN and doctor exits 1, because the check resolves each declared path against
the fleet root AND against `projects/<identity name>`
(`records/C4.2-charter-present-project-absent.json`, exit **1**):

```
CHECK retention FAIL .../fleet/charter/kernel-charter.yaml declares retention path delivery/work-history/, which does not exist
```

That is a state a real operator reaches between two correct steps.

## Criteria 5 and 6: the blindness, and the class it belongs to

Same fleet, one variable changed, both arms, both shas.

### Arm 5: `charter/` emptied

`charter/` holds only `.gitkeep`, which is what `tiphys init` leaves. Everything
else about the fleet is the configured state of criterion 4.

| record | kernel | profile | exit | the retention line |
|---|---|---|---|---|
| `records/C5.1-arm5-before-charter-emptied.json` | `84f1765` | full | **0** | `CHECK retention WARN no charter document in .../charter, so no project is realized here yet and retention is not applicable` |
| `records/C5.2-arm5-after-charter-emptied.json` | this branch | full | **1** | `CHECK retention FAIL no charter document in .../charter, so no project is realized here yet and retention is not applicable (required for profile full)` |
| `records/C5.3-arm5-after-generic.json` | this branch | generic | **0** | the WARN line again, with no promoted suffix |

The first row is the dangerous state stated as a measurement: a fully
configured fleet home with NO charter, and `tiphys doctor --for full` exits 0
with zero FAIL lines. Anyone quoting that exit code as evidence that the fleet
had a charter would have been wrong, and nothing in the output would have said
so.

The third row is the half the fix must not break. Nothing below `full` resolves
roles, checklists or retention duties out of a charter, and `tiphys init`
writes no charter because authorship is an owner duty, so a fresh fleet must
keep exiting 0 there. That is also the failure M3-P8 fix round 1 caused and fix
round 2 repaired, and it stays repaired.

### Arm 6: `charter/` holds YAML that is not a charter

`charter/notes.yaml` carries `kind: decision-record` and nothing else. This is
structurally different from arm 5: a document IS present, so the fleet is
misconfigured rather than unrealized, and it already FAILed before this phase.

| record | kernel | exit | the retention line |
|---|---|---|---|
| `records/C6.1-arm6-before-no-kind-charter.json` | `84f1765` | **1** | `CHECK retention FAIL 1 YAML document(s) in .../charter, none with kind: charter, so no retention paths are declared (required for profile full)` |
| `records/C6.2-arm6-after-no-kind-charter.json` | this branch | **1** | byte-identical line |

**The two detail strings stay different sentences.** Arm 5's names a missing
charter; arm 6's names a count of YAML documents and the missing `kind`. After
the change both exit 1 under `full`, which is the moment when folding them into
one condition with one message becomes the cheapest edit; the remedies differ
(write the charter, or fix what is in `charter/`), so a FAIL line that cannot
tell a reader which to do has lost what it was for. A test asserts the
non-collapse on one fleet with one variable changed, and a witness spec reddens
it under three structurally different collapses.

## Criterion 7: the lease

| command | expectation | exit | record |
|---|---|---|---|
| `tiphys lock acquire --duration 21600` | 0 | **0** | `records/C7.1-lock-acquire.json` |
| `tiphys lock status` | 0, held | **0** | `records/C7.2-lock-status.json` |

```
acquired dc64baa0-78eb-42e5-beeb-a1c5397e91c7 expires 2026-09-17T17:47:32.401Z
held holder dc64baa0-78eb-42e5-beeb-a1c5397e91c7 acquired 2026-09-17T11:47:32.401Z expires 2026-09-17T17:47:32.401Z
```

The duration is EXPLICIT rather than the 900 second default, so a later
dispatch that finds the lease expired can record the lapse against a stated
expiry rather than guess at one. The lease file also carries a `token` field,
which is deliberately not reproduced here or in any record: the records capture
what the commands printed, and the commands print the holder id and the expiry
without it.

## What this evidence does NOT cover

- **The fleet is not torn down and the pushed `main` is permanent.** Ref
  deletion is refused in this container, so removing `refs/heads/main` from the
  fleet remote, or any of the six probe refs, is an owner action.
- **No second operator, no second machine.** Every command ran in one
  container, as one uid, against one clone. Nothing here says anything about
  two clones contending for the fleet lease; that is M4-P20 and M4-P21.
- **`gh` is installed but nothing exercised it.** The `gh` check reads
  `gh --version`. No PR was created, viewed or merged through it, and CLAUDE.md
  standing warning 6 still records that `gh pr` operations are not usable here.
- **The push-negotiation stderr is unexplained.** It is reported above and not
  diagnosed. The candidates are named; none was tested.
- **Nothing measured `tiphys doctor --for full` on a fleet whose charter is
  present but invalid against the schema.** The retention check does not
  validate the charter against `schemas/charter.schema.json`, which
  src/commands/doctor.ts:679 states in its own header; this phase did not change
  that and did not measure it.
- **The `watch` profile was not walked.** The beacon line is a WARN in every
  capture here and `--for watch` promotes it; no run in this document used that
  profile.
