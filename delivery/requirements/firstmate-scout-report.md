# Firstmate scout report: the six BORROW components

- Date: 2026-08-04
- Task: scout firstmate BORROW components (blueprint section 4 rows: watcher, liveness guard, session lock, worktree pool, spawn, teardown)
- Clone inspected: read-only clone at the session scratchpad, path `scratchpad/firstmate` below; full path `/tmp/claude-0/-home-user-tiphys-ai-helmsman/183bdee0-14ec-5b04-b0a8-ad41df70db46/scratchpad/firstmate`
- Clone HEAD commit: `e5e8a671712bb8fbc3930ca0fcd182131c2a5637` (2026-08-03, "feat: gate remote second mates on Herdr readiness (#1639)")
- Origin remote: `kunchenguid/firstmate` (via local git proxy)
- All file citations below are paths relative to the clone root, with line numbers at this HEAD commit.

## Method

1. Read the four required Tiphys context documents (blueprint sections 4 and 10, DR-0005, DR-0007, kernel plan phases M1-P2 through M1-P6).
2. Enumerated the clone: 119 scripts in `bin/`, 5 backend adapters in `bin/backends/`, 125 test files in `tests/`, docs in `docs/`.
3. Read in full: `bin/fm-watch.sh` (1126 lines), `bin/fm-guard.sh` (232), `bin/fm-supervision-lib.sh` (89), `bin/fm-lock.sh` (87), `bin/fm-lock-lib.sh` (104), `bin/fm-session-lock-lib.sh` (162), `bin/fm-wake-lib.sh` (691), `bin/fm-brief.sh` (461), `LICENSE`, `docs/architecture.md` (supervision, busy state, and backend sections).
4. Read in targeted depth: `bin/fm-spawn.sh` (2172 lines: header contract, backend window creation, worktree acquisition, turn-end hooks, meta write, launch delivery) and `bin/fm-teardown.sh` (1908 lines: header contract, landedness procedure, dirty check, scout carve-out, stale git lock recovery).
5. Grepped the full tree for worktree management; confirmed the worktree pool lives outside this repository (see FM-016).
6. Nothing was executed; every behavioral claim is from source reading. Nothing in the clone was modified.

Language and form, summarized once: firstmate is entirely Bash (plus two small Node `.mjs` policy checkers and two Python helpers for the herdr backend). There is no package.json, no compiled component. Every component below therefore needs at minimum a language translation to meet DR-0005 (TypeScript compiled to JS, Node 26).

---

## Component 1: watcher

### Where it lives

- FM-001. Core: `bin/fm-watch.sh` (1126 lines, bash, run as a foreground blocking process). Support: `bin/fm-wake-lib.sh` (durable wake queue and lock primitives), `bin/fm-classify-lib.sh` (wake triage vocabulary, shared with the away-mode daemon), `bin/fm-busy-lib.sh` (semantic busy-state contract), `bin/fm-watch-arm.sh` (549 lines, the verified arm/verify wrapper), `bin/fm-watch-checkpoint.sh`, `docs/watcher-continuity.md`, `docs/architecture.md` ("Event-driven supervision").

### Actual contract and behavior

- FM-002. Wake protocol matches the blueprint's one-liner in shape: the watcher blocks, classifies wakes in bash, and on an actionable wake writes it to a durable queue and exits 0 after printing exactly one reason line. The reason-line grammar is documented at `bin/fm-watch.sh:13-55`: `signal: <file>...`, `stale: <window>`, `check: <script>: <out>`, `heartbeat`, plus check-rejection variants. This is precisely the blueprint's "exit with one reason line (signal, stale, check, heartbeat)".
- FM-003. Heartbeat backoff is exponential exactly as the blueprint asks: base `FM_HEARTBEAT` 600s, doubling per consecutive no-change heartbeat (`hb = HEARTBEAT * (1 << streak)`, streak capped at 12), capped at `FM_HEARTBEAT_MAX` 7200s, reset on any surfaced non-heartbeat wake (`bin/fm-watch.sh:112-113,1094-1097,1117-1119`).
- FM-004. Liveness beacon: every poll cycle touches `state/.last-watcher-beat` (`bin/fm-watch.sh:776-778`); the guard keys on its mtime.
- FM-005. Signal detection is not fs-watch based: it is a 15s poll loop (`FM_POLL`, `bin/fm-watch.sh:111`) scanning `state/*.status` and `state/*.turn-ended` against persisted `size:mtime` signatures in `.seen-*` files, updated only after a wake is surfaced or deliberately absorbed, so a watcher killed mid-cycle never swallows a signal (`bin/fm-watch.sh:441-460`). A push fast-path exists only for the herdr backend (`event_wait_or_sleep`, `bin/fm-watch.sh:624-699`) and degrades to the poll sleep.
- FM-006. Restart-proof cadence: check and heartbeat schedules are persisted as file mtimes (`.last-check`, `.last-heartbeat`), not in-memory counters, "so the cadence survives watcher restarts" (`bin/fm-watch.sh:432-439,795-804`). This design is what makes an externally triggered single-pass mode (DR-0007) conceptually cheap: the loop body is already restartable state-on-disk.
- FM-007. Where the implementation goes far beyond the blueprint: an absorb-versus-surface triage layer. Benign wakes (a `working:` note or turn-end while the crew is provably working) are absorbed without exiting; staleness is detected by hashing the last 40 lines of the task's terminal pane and comparing across polls (`bin/fm-watch.sh:926-1088`); "provably working" consults `fm-crew-state.sh` and a per-harness semantic busy-state record; wedge timers, escalation counters, `demand-deep-inspection` markers, and declared-pause cadences layer on top. All of this exists because firstmate's workers are interactive TUI agents in terminal panes whose completion is not otherwise observable. Zero tokens idle holds: the watcher path invokes no LLM and imports no network client; its costliest read is a bounded local pipeline-state read.
- FM-008. Singleton discipline: a `state/.watch.lock` directory lock with holder pid, pid identity (proc starttime plus cmdline hex, `bin/fm-wake-lib.sh:30-65`), self-eviction when the lock stops naming this process (`bin/fm-watch.sh:765-774`), and stale-beacon eviction rules (`bin/fm-watch.sh:716-734`).
- FM-009. Documented versus implemented differences: none material found; the 55-line header comment matches the code closely. The header itself is unusually honest about past failure modes (see traps).

### Substrate assumptions

- FM-010. Resident foreground process on a persistent machine; pid-identity singleton lock; terminal pane capture through tmux/herdr/zellij/cmux/orca adapters for staleness and busy detection; `/proc` reads; GNU/BSD stat detection. The wake-source layer (status files, turn-end files, check scripts, beacon, queue) is pure filesystem and substrate-neutral; the stale/busy layer is not.

### Fit against blueprint contract

- FM-011. Partial fit. The reason-line protocol, the zero-token idle property, the beacon, and the exponential heartbeat backoff are exact matches (FM-002 to FM-004). The blueprint contract says nothing about the pane-hash staleness and busy-triage machinery, which is the majority of the file and is bound to interactive terminal workers; Tiphys M1-P5's stale source is instead "an open task whose worktree or meta is in a contradictory state" plus turn-end files with recorded exit codes, which removes the need for most of it.

### Port assessment

- FM-012. HARVEST. The protocol is excellent and substrate-neutral: reason-line grammar, durable queue with enqueue-before-suppress ordering, `.seen-*` size:mtime signatures, mtime-persisted cadence, beacon, exponential backoff. The code is 1100 lines of bash entangled with five terminal backends and a busy-state contract Tiphys does not need; translate the protocol, not the code. The mtime-persisted-cadence trick (FM-006) is the key enabler for DR-0007's "externally triggered single pass" mode and should be cited in the M1-P5 spec.

---

## Component 2: liveness guard

### Where it lives

- FM-013. `bin/fm-guard.sh` (232 lines), predicate library `bin/fm-supervision-lib.sh` (89 lines), health check `fm_watcher_healthy` in `bin/fm-wake-lib.sh:97-116`. Called by spawn (`bin/fm-spawn.sh:219`), by the wake drain, and by session start in read-only advisory mode (`bin/fm-guard.sh:2-4`).

### Actual contract and behavior

- FM-014. Core predicate: supervision is needed when any `state/<id>.meta` exists (in-flight task), a process-event source is registered, or X-mode polling is active; the watcher is fresh when `state/.last-watcher-beat` mtime is within `FM_GUARD_GRACE` (default 300s) (`bin/fm-supervision-lib.sh:35-89`). When needed and not fresh, the guard prints a loud bordered "WATCHER DOWN - SUPERVISION IS OFF" banner to stderr, once per staleness episode (episode keyed to beacon mtime or absence, deduped through a small lock-protected marker file, `bin/fm-guard.sh:49-116,170-215`); later calls in the same episode print a one-line reminder. It always exits 0: "the guard warns, it never blocks" (`bin/fm-guard.sh:20`).
- FM-015. Beyond the blueprint one-liner it also: warns first and independently if the primary checkout is stranded on a feature branch (worktree tangle banner, `bin/fm-guard.sh:118-143`), and warns when queued wakes are pending (`bin/fm-guard.sh:223-231`). `fm_watcher_healthy` is stricter than beacon age alone: it also requires the lock pid to be alive and its recorded pid identity to match (`bin/fm-wake-lib.sh:99-116`), so a leftover fresh beacon from a dead watcher never counts.

### Substrate assumptions

- Pid liveness and pid identity for the healthy check (local machine); everything else is file mtimes and file counts, substrate-neutral.

### Fit against blueprint contract

- Exact fit on the contract ("every supervision script warns if tasks in flight and watcher beacon stale"), with useful extras (episode dedup, warn-never-block, identity-matched health) the blueprint does not mention but M1-P5's acceptance criteria 4 and 5 essentially replicate.

### Port assessment

- FM-016 (assessment). HARVEST. The predicate and the warn-never-block posture translate to perhaps 100 lines of TypeScript. Take the episode-dedup idea (banner once per staleness episode, reminder after) as an optional refinement; drop pid identity in favor of DR-0007 lease semantics; keep the plan's PR-009 invariant (threshold strictly greater than backoff cap plus poll interval), which firstmate does NOT enforce: its guard grace (300s) is far below its heartbeat cap (7200s), which is safe only because the beacon is touched every 15s poll rather than every heartbeat. Note that distinction in M1-P5: firstmate's beacon cadence is the poll interval, not the heartbeat interval.

---

## Component 3: session lock

### Where it lives

- FM-017. CLI: `bin/fm-lock.sh` (87 lines: acquire and status). Identity library: `bin/fm-session-lock-lib.sh` (162 lines). Generic mutex primitives: `bin/fm-wake-lib.sh:118-403` (`fm_lock_try_acquire`, `fm_lock_acquire_wait`, `fm_lock_release`). Consumed at session start: `bin/fm-session-start.sh:254-306` and the read-only fallback text at `bin/fm-session-start.sh:428`.

### Actual contract and behavior

- FM-018. The lock is `state/.lock` containing one pid. The pid written is not the calling shell's: `fm_harness_ancestry_pid` walks the process ancestry up to 16 hops to find the harness process (claude, codex, opencode, grok, kimi, pi) that lives as long as the session, using a name regex, path-component matching (because Claude Code's installer names binaries by version), and interpreter-plus-script-path matching (`bin/fm-session-lock-lib.sh:12-130`). Acquire refuses when another live harness pid holds the lock (`bin/fm-lock.sh:60-73`); acquisition itself is serialized through a separate claim mutex (`bin/fm-lock.sh:47-57`), and ownership is verified by reading the file back (`bin/fm-lock.sh:74-85`).
- FM-019. Second-session behavior matches the blueprint exactly: on refused acquire, `fm-session-start.sh` prints an "operate read-only" banner and the session continues in read-only mode, skipping queue drain and all mutations (`bin/fm-session-start.sh:63-73,254-306,428`). The guard and other scripts honor a read-only flag (`FM_GUARD_READ_ONLY`, `bin/fm-guard.sh:31-32`).
- FM-020. The generic mutex (`fm_lock_try_acquire`) used for the watcher singleton, wake queue, and spawn task locks is a symlink-to-owner-directory scheme with pid liveness, a mid-acquire freshness window, and a two-level steal protocol for stale locks (`bin/fm-wake-lib.sh:200-377`). It is roughly 260 lines of very careful bash re-check dancing.

### Substrate assumptions

- FM-021. Maximal local-machine binding of any component: pid liveness (`kill -0`), `ps` ancestry walking, `/proc/<pid>/stat` starttime identity with a locale-pinned `ps lstart` fallback (`bin/fm-wake-lib.sh:30-65`), harness executable-name heuristics. None of this survives a reclaimable cloud session or a second host; DR-0007 explicitly requires lease locks with expiry instead of pid-only liveness.

### Fit against blueprint contract

- Exact fit at contract level ("one orchestrator per fleet; second session goes read-only", both implemented); divergent at mechanism level from what DR-0007 now requires (pid versus lease).

### Port assessment

- FM-022. HARVEST the protocol, BUILD the mechanism. Keep: acquire-refuse-go-read-only flow, the serialize-acquisition-through-a-claim-mutex pattern, write-then-read-back verification, the status subcommand that always exits 0 and names the holder, and the insight that the lock must name an identity that outlives one tool call. Replace pid ancestry entirely with DR-0007 lease semantics (holder id, acquiredAt, expiry, renewal); the M1-P3 plan spec (O_EXCL create, atomic rename takeover, explicit --take-over) is already closer to what Tiphys needs than firstmate's code is.

---

## Component 4: worktree pool

### Where it lives

- FM-023. Not in firstmate. The pool is `treehouse`, an external prebuilt binary from a separate repository `kunchenguid/treehouse`, installed by pin-and-checksum in CI (`bin/fm-install-treehouse.sh:19,71`, archive layout verified for v2.0.1). Its source is not in this clone and could not be inspected.
- FM-024. What the clone shows is only the consumption contract: spawn types the literal command `treehouse get` into the freshly created terminal window (`bin/fm-spawn.sh:1687-1688`) and then polls the pane's current working directory for up to 60 seconds, requiring two consecutive identical non-project reads, to learn which worktree the pool granted (`bin/fm-spawn.sh:1690-1732`). The result must be a real linked git worktree root distinct from the primary checkout (`validate_spawn_worktree`, refusal text at `bin/fm-spawn.sh:1279-1283`). Workers land at a detached HEAD on a clean default branch (`bin/fm-brief.sh:310,419`) and create their own `fm/<id>` branch as their first action (`bin/fm-brief.sh:425`). Teardown returns the worktree with `treehouse return --force <dir>` (`bin/fm-teardown.sh:878-953`), with retry plus a provably-stale git `index.lock` recovery. Durable holds exist via `treehouse get --lease --lease-holder <id>` for secondmate homes (`bin/fm-home-seed.sh:374-378`); removing a leased home must release the lease (`bin/fm-teardown.sh:50-54`).

### Substrate assumptions

- The binary runs locally; the invocation channel is keystroke injection into an interactive shell with cwd-change detection, which is the strongest terminal-substrate coupling in the whole system. The pool concept itself (pooled linked worktrees, get/return, leases) is substrate-neutral.

### Fit against blueprint contract

- FM-025. Divergent. The blueprint row says "clean disposable worktree per task; parallel-safe", which treehouse presumably provides, but the blueprint marks this BORROW from firstmate and firstmate does not contain it. Contract differences from the Tiphys plan: treehouse hands out a detached HEAD and the worker branches itself, while M1-P3's pool creates the task branch at create time; treehouse pools and reuses worktrees under `get`/`return`, while M1-P3 creates and destroys per task with `git worktree add`/`remove`.

### Port assessment

- FM-026. BUILD, confirming plan decision D-1 for this component. There is no source to port or harvest here; the M1-P3 spec (create/list/destroy, dirty-refusal, --discard, atomicity via git's own worktree locking) is self-sufficient. Two treehouse contract points are worth carrying as requirements anyway: the return path must tolerate a transient `index.lock` with a fail-safe staleness proof before ever deleting one (see FM-035), and if Tiphys ever adds long-lived holds, model them as explicit named leases, not as conventions.

---

## Component 5: spawn

### Where it lives

- FM-027. `bin/fm-spawn.sh` (2172 lines, the largest script in the repository). Support: `bin/fm-backend.sh` plus `bin/backends/{tmux,herdr,zellij,orca,cmux}.sh` (window creation and keystroke IO), `bin/fm-brief.sh` (brief scaffolding, a separate earlier step), `bin/fm-busy-event.sh` (busy-state arming), `bin/fm-harness.sh` (harness resolution).

### Actual contract and behavior

- FM-028. Composition matches the blueprint one-liner: one command produces window plus worktree plus brief delivery plus turn-end hook plus task meta. Sequence: guard check (`bin/fm-spawn.sh:219`), per-task-id spawn lock (`bin/fm-spawn.sh:77-79,344-347`), backend window creation (tmux reference path `bin/fm-spawn.sh:1361-1374`, with a stable window id captured and auto-rename disabled), worktree acquisition via treehouse (FM-024), per-harness turn-end hook installation, task meta write as a flat key=value file `state/<id>.meta` with fields window, endpoint_task_id, worktree, project, harness, kind, mode, yolo, tasktmp, model, effort, backend and backend-specific ids (`bin/fm-spawn.sh:2024-2067`), then launch: the harness CLI command is typed into the pane, Enter is sent, and the brief is delivered as a "Read the brief at <path>" prompt (`bin/fm-spawn.sh:2070-2159`).
- FM-029. Turn-end hooks are per-harness and are the concrete ancestor of Tiphys's turn-end contract: for Claude, spawn writes `<worktree>/.claude/settings.local.json` with Stop hooks that `touch state/<id>.turn-ended` (`bin/fm-spawn.sh:1794-1816`); codex passes the marker on the launch command (`__TURNEND__`, `bin/fm-spawn.sh:124-126,1903-1912`); pi loads an extension from state/ (outside the worktree, to dodge pi's trust gate, `bin/fm-spawn.sh:1870-1901`); grok and kimi use firstmate-owned global hooks in `$HOME` gated by per-task token pointer files (`bin/fm-spawn.sh:1913-1976`). Worktree-resident hook files are added to `.git/info/exclude` so they never dirty the teardown check (`bin/fm-spawn.sh:1746-1758`).
- FM-030. Real contract enforcement beyond the blueprint: ship spawns require an explicit `--mode` and `--yolo` and refuse a brief whose recorded `Delivery contract: mode=` line disagrees (`bin/fm-spawn.sh:7-16,301-334`); a spawn refuses to launch unless the resolved path is a real isolated worktree (FM-024); batch dispatch re-execs the single-task path per pair (`bin/fm-spawn.sh:112-121`).
- FM-031. Failure handling is not transactional: there is no general rollback of partial spawns (the herdr projection path has a scoped abort-cleanup, `bin/fm-spawn.sh:1476-1493`; the tmux path can leave a created window behind on later failure). Coordination is sleep-based at several points (`sleep 0.3` before and after sending the launch command, `bin/fm-spawn.sh:2128-2130`; readiness detection for kimi scrapes rendered box-drawing characters, `bin/fm-spawn.sh:1640-1680`).

### Substrate assumptions

- FM-032. The heaviest of all six: terminal multiplexer windows, keystroke injection, pane text capture, `$HOME`-global hook installs, `/tmp/fm-<id>` task temp roots (`bin/fm-spawn.sh:1737-1743`), interactive TUI agents as workers. The executor concept (how the worker actually runs) has no seam at all; it is inseparable from "type a CLI command into a pane".

### Fit against blueprint contract

- Partial. The five-way composition and the one-command discipline are exactly the blueprint row. The execution mechanism diverges from what DR-0007 and M1-P4 require (subprocess executor behind an adapter seam, payload runs to completion, exit code recorded in the turn-end file, clean rollback of exactly what the failed invocation created). Firstmate cannot record a payload exit code because its payload is an interactive agent that never "exits" per turn.

### Port assessment

- FM-033. HARVEST, thinly. Take: the meta-file field set as a starting point for `src/task.ts`; the delivery-contract cross-check idea (brief and spawn flags must agree, structurally); the per-task spawn lock; the hooks-outside-git's-view discipline (Tiphys does better by putting the hook in the task directory, M1-P4 step 3); and the Claude settings.local.json Stop-hook shape, which is directly relevant to the M4-era Claude Code plugin, not to M1. The window/keystroke machinery (roughly 1500 of the 2172 lines) is useless to a subprocess executor and should not be ported. M1-P4's spec is already the better design for the kernel; firstmate's value here is as a field catalog and a cautionary tale.

---

## Component 6: teardown guard

### Where it lives

- FM-034. `bin/fm-teardown.sh` (1908 lines). Support: `bin/fm-lock-lib.sh` (provably-stale git lock proof), `bin/fm-pr-lib.sh`, backend adapters for endpoint kill.

### Actual contract and behavior

- FM-035. Refusal core, all under `validate_worktree_teardown_safety` (`bin/fm-teardown.sh:956-1020`) and the landedness helpers (`bin/fm-teardown.sh:580-712`):
  1. Dirty check: `git status --porcelain`, with a hardcoded exemption for firstmate's own injected files (`grep -vE '^\?\? (\.claude/|\.fm-(grok|kimi)-turnend$)'`, line 972). Uncommitted changes are never landed (header line 24).
  2. Landed check, in order: commits reachable from any remote-tracking branch (`git log HEAD --not --remotes`, line 974) count as landed; otherwise `pr_is_merged` asks GitHub for PR state and head and accepts when the local HEAD is an ancestor of the merged PR head or when every unpushed commit's patch-id is contained in the PR head's patch-id set (`bin/fm-teardown.sh:618-676`); otherwise `content_in_default` fetches the default branch and accepts when `git merge-tree --write-tree <default> HEAD` produces a tree equal to the default branch's tree, which recognizes squash merges while isolating branch-only changes (`bin/fm-teardown.sh:678-701`). Any inconclusive step refuses rather than guesses (header lines 22-23).
  3. local-only mode accepts work merged into the local default branch instead (lines 984-1001).
  4. Scout carve-out: `kind=scout` skips dirty and landed checks entirely but refuses unless `data/<id>/report.md` exists, plus a completion-gate check (`bin/fm-teardown.sh:28-31,1702-1712`). Matches the blueprint row verbatim.
  5. `--force` is the explicit captain-approved discard path (lines 55-58); secondmate homes refuse while child tasks are in flight (lines 1682-1699).
- FM-036. Stale git `index.lock` recovery: retries the treehouse return on the lock-failure signature, then removes the lock only under a fail-safe proof: lock exists, lsof shows provably no holder of the lock or the worktree, and mtime age exceeds a threshold; any uncertainty (lsof missing or erroring) means not stale, leave it (`bin/fm-teardown.sh:60-88`, proof in `bin/fm-lock-lib.sh:91-104`).
- FM-037. Divergence between doc and code found: none material; the 88-line header is an accurate specification of the code. The bulk of the remaining 1900 lines is secondmate/remote/herdr retirement machinery irrelevant to Tiphys.

### Substrate assumptions

- Backend endpoint kill and treehouse return are terminal-substrate bound; `gh` CLI and network for the PR path. The landedness decision procedure itself is pure git and fully substrate-neutral.

### Fit against blueprint contract

- Exact fit on the blueprint row ("refuses when unlanded work present; scout carve-out requires report"). Notably, Tiphys plan M1-P4's landed definition (ancestor-of-fetched-default OR merge-tree no-op equal to default's tree, PR-001) is independently the same algorithm as firstmate's `content_in_default`; firstmate additionally has the merged-PR-head patch-id path that Tiphys's plan deliberately excludes (the plan's criterion 7 even requires that a per-commit patch-id implementation cannot pass).

### Port assessment

- FM-038. HARVEST. The refusal ordering, the fail-closed inconclusive rule, the `content_in_default` merge-tree tree-equality procedure, the never-landed status of uncommitted changes, and the lsof-based provably-stale lock proof are all directly reusable protocol; cite `bin/fm-teardown.sh:678-712` in the M1-P4 dispatch brief as prior art validating PR-001's approach. The bash implementation itself, entangled with treehouse, five backends, and secondmate retirement, is not worth translating line by line.

---

## License

- FM-039. `LICENSE` is the MIT License, verbatim standard text, "Copyright (c) 2026 Kun Chen" (`LICENSE:1-21`; `README.md:226` confirms "MIT - see LICENSE"). No other license files exist in the tree.
- FM-040. Compatibility verdict: MIT-licensed code MAY be incorporated into an Apache-2.0 project (DR-0001). MIT is a permissive license compatible one-way into Apache-2.0. Condition: if Tiphys copies code or substantial portions (as opposed to reimplementing ideas), the MIT copyright and permission notice must be preserved for those portions, typically via a THIRD-PARTY-NOTICES or NOTICE entry naming firstmate, Kun Chen, and the MIT text. Algorithms, protocols, and file-format ideas harvested and rewritten from scratch carry no notice obligation (copyright covers expression, not ideas), though a courtesy attribution in the tuition log costs nothing. Since every component above is assessed HARVEST or BUILD rather than PORT, the expected obligation is zero to one NOTICE entry.
- FM-041. Loud caveat: the copyright holder is Kun Chen, a third party. The MIT grant makes owner permission unnecessary for use within its terms, but the `treehouse` binary (worktree pool, FM-023) comes from a different repository whose license is NOT in this clone and was NOT verified. Tiphys does not plan to use treehouse, so this is moot unless that changes; if it ever does, verify that repository's license first. Similarly `gh-axi`, `no-mistakes`, `herdr`, and `orca` are external tools referenced by firstmate whose licenses were not inspected and whose code Tiphys must not assume anything about.

---

## Conceptual borrows worth citing during M1

- FM-042. Status-line protocol (blueprint section 5 "status line contract"): append-only `state/<id>.status`, one line per event, verb vocabulary `working, needs-decision, blocked, paused, done, failed`, sparse-reporting rule ("each append wakes firstmate, so report sparingly"), `paused:` distinct from `blocked:` for declared external waits, keyed phases `[key=<slug>]` with `resolved` closure. Templates: `bin/fm-brief.sh:319-332` (scout), `bin/fm-brief.sh:431-447` (ship); classifier vocabulary and captain-relevant verb set: `bin/fm-classify-lib.sh:35-61`.
- FM-043. Beacon file convention: `state/.last-watcher-beat`, touched every poll cycle, mtime is the liveness truth (`bin/fm-watch.sh:776-778`, `bin/fm-supervision-lib.sh:56-69`). Direct input to M1-P2 doctor and M1-P5.
- FM-044. Heartbeat backoff constants and reset rule (FM-003) as a calibrated starting point: base 600s, doubling, cap 7200s, reset on surfaced wake.
- FM-045. Cadence persisted as file mtimes so a restarted watcher resumes schedules (FM-006, `bin/fm-watch.sh:432-439`): the enabling pattern for DR-0007's single-pass watcher mode.
- FM-046. Durable wake queue with enqueue-before-suppress ordering: the wake record is appended to `state/.wake-queue` under a lock BEFORE the `.seen-*` suppression marker advances, so a crash between the two duplicates rather than drops (`bin/fm-watch.sh:441-448,895-919`; append: `bin/fm-wake-lib.sh:446-471`). Worth adopting if the M1 watcher ever absorbs anything.
- FM-047. Brief templates: the worktree-isolation verification preamble ("run pwd -P and git rev-parse --show-toplevel; both must resolve to the disposable task worktree... if not, STOP, append blocked: and stop", `bin/fm-brief.sh:421-423`), the scout framing ("the report is the only thing that survives", `bin/fm-brief.sh:310-314`), and mode-shaped definition-of-done blocks (`bin/fm-brief.sh:352-403`). Direct inputs to M3 role briefs and to M1-P4's brief assembly expectations.
- FM-048. Structural anti-drift: the brief records a machine-readable `Delivery contract: mode=<mode>` line and spawn refuses a mismatch with its own flags (`bin/fm-brief.sh:39-42`, `bin/fm-spawn.sh:12-16`). A clean instance of blueprint principle 6 (rules structural, not behavioral).
- FM-049. Turn-end marker semantics: `state/<id>.turn-ended` is a wake NOTIFICATION, never current-state truth (`docs/architecture.md`, "Busy state is semantic" section). Tiphys's turn-end file with a recorded exit code (M1-P4) is strictly stronger; keep the notification-versus-state distinction in the module docs.
- FM-050. The Claude Stop-hook JSON shape in `.claude/settings.local.json` (`bin/fm-spawn.sh:1805-1816`): the working reference for the M4 thin Claude Code plugin's turn-end signal hook.
- FM-051. The fail-safe provably-stale git lock proof (FM-036, `bin/fm-lock-lib.sh:91-104`): worth carrying into pool destroy or teardown when a worktree operation hits `index.lock`.

---

## Traps: failure modes Tiphys must not inherit

- FM-052. Append-only status logs as implied current state. Firstmate's 2026-07 herdr false-surface incidents, documented in the code itself (`bin/fm-watch.sh:973-999`): a leftover captain-relevant line ("done:") kept re-surfacing a crew as stale for many minutes while it was actually mid-validation, because the status log gets no new entry once the worker hands off to a pipeline. Firstmate patched around it with a provably-working override. Tuition for Tiphys: keep exactly one current-state authority per task (meta status plus turn-end exit code), never derive currency from the last line of an event log.
- FM-053. Pid-based identity is a bug generator. The clone contains at least four documented workarounds for pid fragility: pid reuse after reboot, WSL2 btime drift breaking `ps lstart` identity (`bin/fm-wake-lib.sh:36-42`), locale-dependent `lstart` formatting rejecting a live watcher (`bin/fm-wake-lib.sh:59-62`), and Claude Code's version-named binaries defeating name matching so a path-component heuristic was needed (`bin/fm-session-lock-lib.sh:23-38`). The ancestry walk itself (16-hop heuristic over `ps`) is inherently approximate. DR-0007's lease locks eliminate this entire class; M1-P3 already documents the pid-reuse limitation, and the lease design should not regress toward pid cleverness.
- FM-054. Backgrounding via shell `&` silently killed supervision for about 30 minutes: the backgrounded watcher child was reaped when the launching call returned, leaving no watcher and a false "already running" (`bin/fm-watch-arm.sh:14-18`). Firstmate's fix is a 549-line arm-and-verify wrapper plus per-harness hook protocols. Tiphys's structural answer (watcher as a plain foreground process, liveness guard on every supervision command, PR-009 invariant) is right; do not add convenience auto-backgrounding later.
- FM-055. Inferring state from a terminal emulator is a race farm. Documented incidents: tmux `pane_current_path` transiently reporting an unrelated real checkout on WSL, requiring two consecutive identical reads before trust (`bin/fm-spawn.sh:1699-1709`); tmux auto-rename hijacking window addressing, requiring stable window ids and rename pinning (`bin/fm-spawn.sh:1366-1371,1690-1694`); readiness detection by grepping rendered box-drawing characters (`bin/fm-spawn.sh:1640-1680`); `sleep 0.3` settle points before keystrokes (`bin/fm-spawn.sh:2128-2130`). M1-P4's subprocess executor with exit codes avoids all of it; when the M4-era window adapter arrives, it must carry state through files and exit codes, never through pane scraping.
- FM-056. Portability landmine, small but instructive: `stat -f` on Linux is filesystem stat and its garbage output under `set -u` arithmetic silently killed the watcher mid-cycle; the fix detects the platform once (`bin/fm-watch.sh:96-109`). In TypeScript this class disappears (use fs.stat), but the general lesson stands: a supervision process must not be killable by an unexpected tool-output shape.
- FM-057. Absorb-triage scope creep. Because turn-end alone could not distinguish done, waiting, and wedged for interactive workers, the watcher grew wedge timers, escalation counters, pause cadences, busy contracts per harness, and a `demand-deep-inspection` marker: the majority of its 1126 lines. Tiphys's deterministic turn-end (payload exit code recorded) removes the root cause; treat any future proposal to make the Tiphys watcher "classify" wakes as a red flag to re-examine the signal design instead.
- FM-058. Hand-rolled mutexes accrete steal protocols. `fm_lock_try_acquire` needed a `.steal` sub-lock, mid-acquire freshness windows, and repeated re-checks (`bin/fm-wake-lib.sh:306-377`) to be safe on top of symlink primitives. M1-P3's O_EXCL create plus atomic rename takeover, with the five-concurrent-acquires acceptance test, is the simpler correct shape; resist adding recovery cleverness to it.
- FM-059. Tool droppings entangled with the dirty check. Firstmate must exempt its own injected files from teardown's dirty scan by hardcoded pattern (`bin/fm-teardown.sh:972`) and remember `info/exclude` at spawn (`bin/fm-spawn.sh:1752-1758`). Tiphys puts hooks and meta in the task directory, outside the worktree; keep that invariant absolute so the pool's dirty-refusal never needs an exemption list.
- FM-060. An external binary invoked by typing into a shell has no exit-code contract: treehouse failures are detected by a 60-second cwd-polling timeout (`bin/fm-spawn.sh:1729-1732`), not by an exit status. Every Tiphys toolbelt boundary must be a subprocess with an exit code (blueprint principle 1); no component should ever detect another's success by observing side effects with a timeout.

---

## Honest failures: what this scout could not determine

- FM-061. The worktree pool's internals (allocation strategy, pool sizing, reuse and cleaning between tasks, lease persistence format) live in the `kunchenguid/treehouse` repository, which is not in the clone; only the consumption contract was recovered (FM-024). If the owner wants those internals assessed, that repository must be supplied; the BUILD verdict for the pool does not depend on it.
- FM-062. No code was executed. All behavior claims are from source reading; concurrency claims in particular (lock steal safety, queue ordering) reflect what the code and its comments say, not observed behavior. The clone's 125 test files were not read except by name.
- FM-063. Large subsystems were only skimmed for relevance and excluded as out of scope: secondmate homes and remote (SSH) placement, the away-mode daemon (`bin/fm-supervise-daemon.sh`), X-mode relay, PR polling and retirement receipts, herdr presentation projection, and the config-inheritance layer. If a later phase wants to borrow from any of these, a fresh targeted scout is needed.
- FM-064. Licenses of external tools firstmate depends on (treehouse, gh-axi, no-mistakes, herdr, orca, cmux) were not verified (FM-041); none are proposed for use by Tiphys.
- FM-065. The blueprint marks all six rows BORROW "(firstmate pattern)". This scout confirms the patterns exist and are recoverable, but for the worktree pool the pattern's implementation is not firstmate's to give (FM-023); the blueprint's provenance note is inaccurate for that one row and DR-0009 / plan decision D-1 (BUILD from contracts) already covers the consequence.
