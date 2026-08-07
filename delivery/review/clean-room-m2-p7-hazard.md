# M2-P7 clean-room HAZARD review (second contract)

Subject: branch claude/m2-p7-deploy-and-migration-verifiers @ fc7914eadddd11791518c4b628d6c6550cc0156a
Reviewer role: CLEAN-ROOM HAZARD (T-007). Declared hazard: a verifier fooled (or hung) while reporting an observation, converting an unchecked assumption into a recorded, cited, evidenced one.
Merge-base with main: 4c9bfbc. Files changed: src/gates/{release,deploy,migrations}.ts, src/gates/adapters/{http-json,migrations-command}.ts, two schemas, three test files, fixtures, behaviors.json, gates.manifest.json, work-history/m2-p7.md.

## VERDICT: FIX-ROUND-NEEDED

One HIGH and two MEDIUM findings, each constructed and confirmed against the shipped code at fc7914e. Under DR-0012 any unresolved high or medium blocks merge; the HIGH is decisive on its own.

Mechanical gates on this head (floor toolchain not needed for the defect proofs; default node v22.22.2 used, floor node v26.6.0 available and used to confirm build):
- npm ci: exit 0 (expected EBADENGINE on default toolchain).
- npm run build: exit 0; git status --porcelain clean after build (tsbuildinfo/dist gitignored).
- node --test on the three phase files: 44/44 pass.
- Real runner (`tiphys gates run --manifest gates.manifest.json`): declared 3, applicable 1, not-applicable 2 (both release gates), 0 error, 0 vacuous.

The mechanical suite is green and the phase's own defang matrix is real. The findings below are what the acceptance criteria and the defang matrix do NOT describe.

---

## FINDINGS

### CR-P7H-1 (HIGH): the kernel's own per-attempt evidence writes are unguarded, so a FIFO planted at a predictable evidence path hangs the kernel forever, defeating "an adapter that hangs cannot hang the kernel"

Mechanism (not the instance): **any path in the evidence directory that the kernel opens for WRITE and that an untrusted adapter can pre-create is a block hazard.** `runVerification` guards ONE such path (the request file, `src/gates/release.ts:442` `refuseOpenForWrite(requestPath)`) and clears the response path (`:453` `rmSync force`), but writes THREE others in the same loop with a bare `writeFileSync` and no type probe:

- `src/gates/release.ts:489` stdout: `writeFileSync(join(options.evidenceDir, stdoutName), ...)`
- `src/gates/release.ts:493` stderr: `writeFileSync(join(options.evidenceDir, stderrName), ...)`
- `src/gates/release.ts:512` attempt record: `writeFileSync(join(options.evidenceDir, attemptName), ...)`

The per-attempt `spawnSync` timeout+killSignal (`:479-481`) bounds only the CHILD. These writes happen after the child returns and are bounded by nothing. The attempt-file names are fully deterministic (`${verification}-attempt-${N}-stdout.txt`), and the adapter is handed `recordPath` inside the evidence dir, so it can derive the dir and construct the next attempt's stdout path. This is exactly the threat the module's own comment declares in scope: `:439-441` "the stale-response clear removes whatever a previous attempt (or a hostile adapter) left at the response path, FIFO included." The guard against that threat is incomplete.

This is the fix-round-contract failure shape (CLAUDE.md): the reviewed guard fixed the instances that were named (request path, response read, migration files) and the C6-fifo-bare-read defang only mutates the response READ (work history line 311). The stdout/stderr/attempt-record WRITES were never enumerated, in code or in the defang matrix.

Captured evidence (attack C1). Hostile adapter returns a valid `pending` response on attempt 1 and plants a FIFO at attempt 2's stdout path:

```
evidenceDir: /tmp/c1-ev-pVfUjc
calling runVerification (interval 50ms, deadline 5000ms)...
PROBE_EXIT=124            <- external `timeout 20` killed it; deadline was 5000ms

$ ls -la /tmp/c1-ev-pVfUjc
prw-r--r-- deploy-attempt-2-stdout.txt   <- FIFO, never written
prw-r--r-- deploy-attempt-3-stdout.txt   <- FIFO
-rw-r--r-- deploy-attempt-1.json         <- attempt 1 recorded
                                          (no deploy-attempt-2.json: kernel blocked
                                           at :489 before recording attempt 2)
-rw-r--r-- deploy-response-2.json        <- adapter 2 wrote its response and returned
```

The kernel spawned attempt 2's adapter (which returned), then blocked in `writeFileSync(deploy-attempt-2-stdout.txt)` and never came back. runVerification never returns; the deploy/migrations gate never returns; the post-merge pipeline stalls. This is the mechanical form of the exact T-008 nine-hour-waste the phase's own dispatch contract is about, and it defeats the phase's stated central guarantee (`:42-44`, plan M2-P7 step 3).

Fix direction (mechanism, not instance): route EVERY write into the evidence directory through `refuseOpenForWrite` (or a single guarded writer), the same rule already applied to the request path, and add a defang that plants a FIFO at each of stdout/stderr/attempt-record and asserts the kernel returns error. The derivation the fix must publish is the full enumeration of `writeFileSync`/`writeFile` call sites in release.ts and both adapters whose path is in a directory an adapter can write to, with the guard status of each.

Note the adapters have the same class internally: `http-json.ts:159` and `migrations-command.ts:125` write the response through `refuseOpenForWrite` (`:141`/`:107`), so those are guarded; the exposure is the kernel-side stdout/stderr/attempt writes only. Enumerated, not asserted.

### CR-P7H-2 (MEDIUM): migrations-command silently skips content-drift for a matched row whose applied checksum is null/absent, reporting satisfied, and the record does not disclose which rows were content-verified

Mechanism: when `checksumPointer` is configured (the project is asking for content verification), a matched applied row whose checksum resolves to null (or is absent) is treated identically to "no checksum exposed": `migrations-command.ts:297-302` only records a checksum when `typeof checksum.value === "string"`, and the content-drift comparison `:326` is skipped when `appliedEntry?.checksum === undefined`. The row then falls through to `satisfied` on id-match alone (`:358`). The observation detail says "checksums compared where exposed" (`:365-367`) and `observation.raw` lists only ids, so a reader cannot tell that a given row's content was never verified. A green migrations verdict thus hides an unverified-content row: the M2-C-3 soft-state / M2-C-2 partial-green hazard, and the declared hazard exactly (a recorded, cited, evidenced "satisfied" over an assumption that was never checked).

Captured evidence (attack D). Repository migration 001 content = "TAMPERED CONTENT..."; applied inventory `{"migrations":[{"id":"001","checksum":null}]}`; `checksumPointer:"/checksum"` configured:

```
response outcome: satisfied
observation.detail: "1 migration(s) applied and matching (checksums compared where exposed)"
observation.raw: { repository: ["001"], applied: ["001"] }   <- no per-row checksum-compared status
units: 1
```

The content differs and cannot be right, yet the verdict is satisfied and the evidence does not flag the gap. Fix direction: when `checksumPointer` is configured but a matched row exposes no usable checksum, either report the row unverified (error/pending), or at minimum record in `observation.raw` which ids were checksum-compared vs id-only, so a green is auditable rather than silently partial. Two structurally different members for the class witness: checksum null, and checksum key absent (both reach the same silent skip).

### CR-P7H-3 (MEDIUM): redaction is verbatim-anywhere but a base64 (or otherwise encoded) credential survives into evidence; criterion 11 / the work history claim "no secret value appears anywhere" is not scoped to verbatim and the encoded vector is undisclosed

Mechanism: `redactSecrets` (`release.ts:368-380`) does `text.split(value).join(<redacted>)`, which correctly removes the credential VALUE from anywhere in the text (nested response field, URL query string, stdout, stderr) but only in its exact byte form. An adapter that emits the credential in a common encoding (base64, as in an HTTP Basic `Authorization` header) leaks a trivially reversible copy.

Captured evidence (attack C2). Secret injected as env value, adapter emits it raw + base64 + url-encoded + Basic-auth to stderr and nested in the response:

```
verdict: satisfied
LEAK in deploy-attempt-1-stderr.txt: raw=false base64=true urlencoded=false
raw secret = s3cr3t-TOKEN-value-ABC123
base64      = czNjcjN0LVRPS0VOLXZhbHVlLUFCQzEyMw==
```

The raw value was redacted in EVERY file including the nested response field and the URL query (value-anywhere works, and is stronger than field-name redaction). But `base64=true`: the base64 form of the secret sits in the stderr evidence file unredacted. The work history states "no secret value appears anywhere under the evidence directory" (lines 379, 511-520) and criterion 11 is "No secret value in any record"; a recoverable secret did appear. This is borderline HIGH/MEDIUM in substance (a real recoverable credential in an evidence file) but the reference adapters do not encode credentials, so the realistic vector is a third-party adapter using Basic auth. Fix direction: at minimum scope the claim to verbatim values and disclose the encoded-credential limitation (the phase's own "never soften a work history" rule); better, redact common encodings of each secret (base64, url-encoded) as well, which is a bounded, enumerable set.

---

## ATTACK TABLE (constructed; scripts in ./attacks/)

| # | Attack | Result | Disposition |
|---|---|---|---|
| C1 | Hostile adapter plants FIFO at next attempt's stdout path | Kernel HUNG (probe killed at 20s, deadline 5s); attempt-2 stdout FIFO never written, no attempt-2 record | CR-P7H-1 HIGH |
| B | Adapter traps SIGTERM and never exits | Terminated by numeric-9 SIGKILL at ~851ms (timeout 800ms); verdict error; transport signal SIGKILL, terminatedByTimeout true; kernel RETURNED | DEFENDED |
| C2 | Adapter leaks secret raw + base64 + url-enc + nested + URL query | raw redacted everywhere; base64 survives in stderr evidence | CR-P7H-3 MEDIUM |
| D | migrations checksumPointer set, applied checksum null, repo content differs | satisfied (content drift undetected, undisclosed) | CR-P7H-2 MEDIUM |
| E1 | Adapter reports satisfied for release object created 2020 (before merge) | attempt.releaseObjectOlderThanMerge=true recorded; verdict satisfied (per design, deferred guarantee 9); flag NOT surfaced in GateResult detail | DEFENDED (design); minor surfacing gap, LOW |
| E2 | Adapter proposes retryAfter (owns its own timeout) | rejected: rule 2 (additionalProperties:false); kernel never reads timing from response regardless | DEFENDED |
| F1 | Empty applied inventory, non-empty repo (incident two) | pending -> red at deadline naming 001,002; never not-applicable | DEFENDED |
| F2 | Applied disjoint from repo (003 not in repo) | failed/drift terminal, naming 003 | DEFENDED |
| G1 | contractVersion numeric 1 | rule 2 (schema type string), not coerced | DEFENDED |
| G2 | contractVersion "1.0" / " 1" (trailing/leading space) | rule 6, not trimmed or coerced | DEFENDED |
| G3 | outcome "Satisfied" (case) / "success" (out of enum) | rule 7, not coerced | DEFENDED |
| H | Subject echo differing in any field incl. mergedAt/phaseId | SUBJECT_FIELDS (release.ts:85-91) is all 5 fields; compared field-by-field before outcome read (:291-303) | DEFENDED (read + R3a/R3b defangs) |
| I | Expired credential -> permanent soft state | http-json non-2xx -> error terminal (:209-218); unresolvable name -> error before spawn (release.ts:986-994); error is terminal, no loop | DEFENDED |

## Attempted, NOT constructed live, with reason

- "commit sha matched without a target (preview answers for production)": the http-json `locate.match` supports `equals` rules (e.g. target=production), and the H-sha-only-match defang reddens the sha-only case. But the KERNEL cannot force a project to include a target rule; a project configuring match on sha alone reintroduces the hazard for itself. This is DISCLOSED residue in the work history (lines 399-404) and belongs to M4 pilot wiring / M3 charter coherence. Not a hidden defect; not separately constructed because it is a project-config property, not a kernel path.
- "adapter whose only observation is that the deploy command exited 0" (incident one): not mechanically preventable from the response alone; the reference adapters read an independent authority (HTTP endpoint / applied inventory), and the module doc carries the guarantee-4 obligation for third parties. DISCLOSED residue (work history member 7). Not constructible as a kernel defect.
- "verification switched to none inside the branch (anti-widening)": the mechanism is present (`loadDeclaration` reads from a committed ref via `git show refSha:path`, never the working tree; `--base` selects the governing ref, WIDEN-head-read defang reddens a HEAD read). In M2 the default is HEAD; reading from the merge base requires the caller to pass `--base=<mergebase>`, which is the M4 post-merge wiring (M2-D-11). So M2 defends against working-tree edits always, and against committed-in-branch edits only once M4 passes the merge base. Correct per plan; noted as an integration seam, not a defect.

---

## killSignal / C-2 arbitration

`release.ts:474-482` uses `spawnSync(..., { timeout, killSignal: 9 })` to bound each attempt. Question: is a numeric-9 timeout kill of a child the kernel itself spawned a C-2 violation?

Arbitration: **NO, it is not a C-2 violation, and the numeric form is a defensible interim.** C-2 forbids pid, process liveness, signals and /proc FOR IDENTITY OR EXCLUSION. This kill is neither:
- It is a resource bound on a child the kernel spawned and holds the handle to (via spawnSync's own option); no pid is read, recorded, or compared, and `process.kill` is never called.
- It identifies nothing (no probing of another process to decide who it is) and excludes nothing (no mutual-exclusion decision derived from a signal). It is the timeout half of a bounded observation, which the plan itself mandates ("the kernel kills an attempt that overruns", M2-P7 step 3).

The numeric `9` rather than `"SIGKILL"` is a workaround for the delivered M2-P1 structural witness (`test/gates.test.ts:1042`, forbids `/SIGTERM|SIGKILL|SIGINT/` in comment-stripped `src/gates/*.ts`), which was written before this phase's plan-mandated bound existed and is over-broad: it catches a legitimate timeout kill along with the identity/exclusion signals it was meant to forbid. Measured necessity of a hard kill is confirmed by attack B above (a SIGTERM-trapping child is only terminated by 9). The implementer escalated this as a seam (work history "The killSignal seam") rather than editing another phase's test, which is correct. Recommendation to the orchestrator: give M2-P1's witness an explicit carve-out for a `killSignal:` in a spawn options object so the readable name can return; until then the numeric form is acceptable and is NOT a finding.

---

## M2-P1 integration probes

- Well-formed GateResults via the delivered constructor: both entries go through `runReleaseGate` -> `emit` -> `makeGateResult`/`renderGateResult` (release.ts:874-941). Confirmed via the real runner: deploy/result.json and migrations/result.json are schema-shaped GateResults with status/units/unitLabel/precondition. PASS.
- Both conditional not-applicable on this repo under `tiphys gates run`: confirmed (declared 3, not-applicable 2). The record carries the STRUCTURAL reason in both `detail` and `precondition.id` (D-p7-4), verbatim captured. PASS.
- Misconfiguration is error, not not-applicable: absent declaration, absent verification field, none-without-reason, mode-adapter missing fields, and unresolvable credential all return `error` (release.ts:946-996), distinct from the declared-none / precondition-unmet not-applicable paths. Confirmed by code path + criterion-9 tests. PASS.
- A failed attempt leaves a coherent per-attempt record, not a partial green: each terminal/loop outcome writes an attempt file before returning; the ONLY partial-record state observed is CR-P7H-1's hang (kernel blocked before writing attempt-2.json), which is the finding, not a normal path. Normal failures (B, D, F, G) each produced a complete record. PASS with the CR-P7H-1 caveat.

## Notes on scope and what this review did NOT cover

- The defang matrix and criteria walk were read but re-derived only where a hazard was suspected; I did not re-run the full 23-defang harness (it is the implementer's evidence, and the C6 defang's scope gap is itself finding CR-P7H-1).
- I did not exercise the http-json adapter against a live loopback stub (the phase's own tests do; I read the fixtures and PROVENANCE). My http-json probing was via the release-contract kernel path and by reading resolvePointer/observeOnce.
- Known cross-phase items excluded per brief: schema-count seam (test/gates.test.ts manifest-self-check, fixed on main), and the liveness/watcher real-clock flakes (untouched files). Not counted as findings.
- The worktree is clean after all probing (git status --porcelain empty); no tracked file was modified.

## Progress log
- Created WORKDIR + REVIEW-OUT.md (incremental beacon).
- Checked out fc7914e (verified). Read all changed sources, both schemas, task.ts helpers, MECHANISMS.md, DR-0014/investigation, work history.
- Built (floor + default), ran 44 phase tests (pass), ran real runner (2 not-applicable).
- Constructed attacks C1 (HIGH hang), B, C2 (MEDIUM leak), D (MEDIUM checksum), E1/E2, F1/F2, G1-3.
- Wrote findings, attack table, killSignal arbitration, integration probes. DONE.
