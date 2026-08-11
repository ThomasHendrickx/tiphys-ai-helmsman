# Delivery plan: controlled macOS portability pilot

- status: owner-authorized controlled pilot
- decision: DR-0025
- base: current merged `main`
- task id: `macos-portability-pilot`
- Tiphys task branch: `task/macos-portability-pilot`
- delivery branch after external audit: `codex/macos-portability-pilot`
- assurance: current-process implementation audit plus two independent
  clean-room reviews of the current committed head under distinct briefs; no
  automatic merge

## Intent

Make the merged kernel's existing local lifecycle and gate entry points work
reliably on macOS, while using those same lifecycle components to deliver the
change once under DR-0025. The pilot must produce evidence about Tiphys as well
as code. It must not claim M4 cutover.

## Grounding established before dispatch

1. Node 26.6.0, npm 11.18.0, Apple Git 2.50.1, `gh`, Codex, and Claude are
   present on the host.
2. `npm ci`, `npm run build`, and `npm pack --dry-run` pass on merged `main`.
3. `npm test` executes 507 tests: 503 pass and four fail on macOS.
4. Two failures compare the logical `/var/folders/...` spelling with the
   physical `/private/var/folders/...` spelling of the same object.
5. `src/gates/scope.ts:821`, `src/gates/credentials.ts:684`, and
   `src/gates/suite.ts:1136` implement three inconsistent direct-entry checks.
   Under an aliased temporary path, at least the scope copy exits zero without
   running its gate.
6. The credential gate is independently reproduced red because Apple Git
   reads `/Library/Developer/CommandLineTools/usr/share/git-core/gitconfig`,
   which declares `credential.helper=osxkeychain`. Redirecting
   `GIT_CONFIG_SYSTEM` does not suppress that prefix configuration;
   `GIT_CONFIG_NOSYSTEM=1` does.
7. CI runs only Ubuntu at `.github/workflows/gates.yml:29`, so the current
   required check cannot observe either macOS mechanism.
8. The manual authored-byte commands use GNU grep's `-P` at CLAUDE.md:80,
   which default macOS grep does not provide.

## Scope

Files the implementer may touch:

- `src/path-identity.ts` (create, or an equivalently narrow shared module);
- `src/gates/scope.ts`;
- `src/gates/credentials.ts`;
- `src/gates/suite.ts`;
- `src/exec/env.ts`;
- `test/scope-gate.test.ts`;
- `test/credentials-gate.test.ts`;
- `test/suite-gate.test.ts`;
- `test/spawn.test.ts`;
- `scripts/check-authored-bytes.mjs` (create);
- `test/authored-bytes.test.ts` (create);
- `.github/workflows/macos-smoke.yml` (create);
- `package.json` and `package-lock.json` only if a script entry changes; no new
  dependency is authorized;
- `CLAUDE.md`, only to replace the non-portable manual byte-check command with
  the delivered script and preserve the existing exemptions;
- `test/behaviors.json`;
- `witness/macos-portability-identity-and-scrub.json` (create, standing
  red-witness coverage for the five changed source files only);
- `delivery/work-history/macos-portability-pilot.md`.

Anything else is an escalation. The implementer does not change the M3-P4
branch or its open pull request.

## Required implementation behavior

1. One shared path-identity mechanism canonicalizes both existing paths before
   deciding whether they identify the same object. Do not fix this by replacing
   `/private/var` text or by weakening assertions.
2. Scope, credential, and suite direct-entry checks use that one mechanism.
   There is no fourth private implementation.
3. Stored paths remain useful diagnostics. Canonicalization for identity must
   not silently rewrite every user-supplied path or erase which spelling was
   supplied.
4. The child environment sets `GIT_CONFIG_NOSYSTEM=1` as a fixed
   kernel-controlled value after allowlist copying. It is never inherited from
   the parent. All five existing credential-store redirections remain.
5. The credential probe demonstrates that an Apple prefix-system
   `osxkeychain` helper is not resolvable in the child. A fake global helper and
   token remain staged so the dangerous state is real.
6. The authored-byte checker reads tracked bytes, catches non-ASCII and the
   forbidden control-byte ranges including NUL, and applies only the two
   existing path-scoped exemptions recorded at CLAUDE.md:124. It does not parse
   terminal output or silently transliterate anything.
7. The macOS workflow is a compact smoke check, not a replacement required
   context. It runs the build, the portability-focused tests, and the byte
   checker on a supported macOS runner. The existing job named `gates` and its
   branch-protection context do not change.

## Acceptance criteria

1. From the clean Tiphys task worktree, `npm ci` and `npm run build` exit 0 and
   leave no tracked diff beyond the declared implementation.
2. `npm test` exits 0 on this macOS host with all tests passing, no skipped test
   introduced to hide a platform difference, and the final count recorded.
3. A copied scope entry invoked through the logical `/var/...` spelling writes
   an error result for a missing schema and exits 21; it never exits zero by
   mistaking direct execution for import.
4. The suite and credential direct entries have equivalent alias-path
   witnesses: each writes its expected result artifact when invoked through an
   aliased path.
5. Spawn's payload physical cwd and the intended task worktree compare equal by
   filesystem identity, while the task metadata continues to carry an absolute
   usable path.
6. With Apple Git's prefix configuration declaring `osxkeychain`, the scrubbed
   child resolves no credential helper and `credential-scrub` is green with the
   same seven sources probed. Removing the fixed `GIT_CONFIG_NOSYSTEM=1`
   behavior makes this witness red, and restoring it returns green.
7. A parent-supplied conflicting `GIT_CONFIG_NOSYSTEM` value cannot override the
   fixed child value. No GitHub token, gh store, global helper, netrc, or
   git-credentials file becomes resolvable.
8. The authored-byte checker is red on one NUL fixture, one SOH fixture, and one
   non-ASCII fixture, green on ordinary ASCII, and demonstrates both path
   exemptions without broadening either.
9. `node scripts/check-authored-bytes.mjs` exits 0 on the repository as shipped.
10. The macOS workflow is syntax-valid, names no secret, leaves the existing
    `gates` job untouched, and runs only the declared focused commands.
11. Linux behavior is protected by the existing full GitHub `gates` run on the
    delivery PR. Any Linux-only red is a real finding, not waived as a platform
    difference.
12. `npm pack --dry-run --json` exits 0 and the working tree is clean after the
    build artifacts are removed or ignored as designed.
13. Every new behavior is registered by exact test title and the existing 513
    entries still resolve.
14. Before the implementation PR is merged, the work history records,
    separately, every lifecycle action performed so far by Tiphys, the
    temporary adapter, and the current process. It includes the fleet path,
    task id, task branch, base SHA, executor exit, turn-end record, watcher
    observation, commit SHA, every gate exit code available at that point, and
    every deviation.
15. After merge and teardown, the current process writes
    `delivery/verification/macos-portability-pilot-lifecycle.md` as a separate
    pilot-closeout record. It captures the merged commit and PR, final CI and
    review outcomes, teardown command and exit, surviving fleet records, every
    authority crossing, and the overall successful, partial, or failed pilot
    verdict. This closeout record lands through the current delivery process;
    it is not authored by the implementer or Tiphys.

## Pilot execution and authority sequence

1. Land DR-0025 and this plan through the current process before dispatch.
2. Initialize a separate persistent fleet home outside the project checkout.
3. Acquire the Tiphys lease and keep its holder id outside the implementer
   brief.
4. Create a temporary wrapper outside both the project and task worktree. Its
   source and sha256 are captured in pilot evidence. It may expose only Codex
   client authentication, read the Tiphys-generated brief, run one local Codex
   process in the task worktree, capture the last message, and return the
   process exit code.
5. `tiphys spawn` creates and runs the task. The implementation agent commits
   locally but does not push, open a PR, merge, or use GitHub credentials.
6. The current process audits scope and the report before making any work
   recoverable outside the task branch.
7. The current process creates the delivery branch at the audited commit,
   pushes it, opens the PR, and runs two independent reviews of the current
   committed head under distinct briefs. Their outcomes are written under
   `delivery/review/` and committed before merge. Findings return through
   another explicitly recorded controlled invocation or are resolved by the
   current process only if they concern pilot scaffolding rather than feature
   code. DR-0026 is the owner-authorized exception for PR 89's first three
   feature-code review findings: the current process resolves them without a
   second Tiphys subprocess, then uses two independent Codex clean-room reviews
   if the Claude-family reviewer remains unavailable.
8. Merge authority remains outside Tiphys. Teardown runs only after the commit
   is safely reachable and the task branch satisfies the kernel's own teardown
   rules, or salvage is explicitly chosen.
9. After teardown, the current process authors and lands the separate closeout
   record required by criterion 15. It states whether the pilot succeeded,
   partially succeeded, or failed. A successful code PR with a failed lifecycle
   step is a partial pilot, not a success. The pilot is not complete until this
   post-teardown record is durable on `main`.

## Stop conditions

Stop and report instead of improvising if:

- the Tiphys fleet, lock, pool, spawn, watcher, or teardown command would need a
  source edit before it can perform its authorized role;
- model authentication cannot be isolated from GitHub authentication;
- the agent cannot receive the exact persisted brief;
- the task worktree or local commit cannot be recovered safely;
- scope expands beyond the declared files;
- the current M3-P4 work or PR #81 would be modified;
- any step would require claiming M4 cutover or deciding DR-0010.
