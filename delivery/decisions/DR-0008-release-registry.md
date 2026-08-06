# DR-0008: Release registry and package naming

- id: DR-0008
- project: tiphys-kernel
- task: stage-1-plan
- question: Which registry does M3's v0.1.0 release publish to, and under what package names? Raised by finding SC-012: the blueprint's M3 exit test names GitHub Packages, which requires a GitHub organization named tiphys to host the settled @tiphys scope and requires authenticated installs in every fleet home; this is in tension with the settled npm-distribution decision's "npm install is the upgrade" path. Folds in finding SC-006 (package names under the settled scope are undecided) as a vetoable recommendation.
- reversibility: costly (published npm names are effectively permanent once depended on; fleet homes and the plugin pin them from M4 on)
- status: decided
- decided: Option 1, public npmjs under @tiphys, package names as recommended (owner, 2026-08-05)
- date: 2026-08-04

## Decision

Owner agreed with the recommendation on 2026-08-05: publish to the public
npmjs registry under the settled @tiphys scope, with @tiphys/kernel for the
kernel and @tiphys/claude-code-plugin for the harness adapter at M4. The M3
exit test's "GitHub Packages" wording is treated as a registry placeholder
and is amended by this decision.

Consequence for the M3 plan: the split that kept the release phase from
blocking on this decision is no longer needed as a workaround, though the
split itself may stand on its own merits. The M3 planner should collapse or
keep it deliberately, and say which.

## Deferral note (superseded by the decision above)

Owner asked whether this must be decided now. It must not: nothing before M3 depends on it except the package.json name field, which is a one-line change at any time before first publish. The plan carries the recommendation as the working assumption; the decision falls due when the M3 plan is presented.

## Options

1. Public npmjs registry under the settled @tiphys scope. Simplest install path (no auth token in any fleet home), scope availability is already queued for the owner's conflict sweep, and it matches "npm install is the upgrade" with zero friction. Requires claiming the @tiphys scope on npmjs.
2. GitHub Packages. Requires creating a GitHub organization named tiphys, moving or mirroring the repo under it, and provisioning a read token in every fleet home forever (GitHub Packages requires authentication even for public package installs). Possible overlap with the elevated-permissions bundle in DR-0004 if the organization is created there.

## Recommendation

Option 1: publish to the public npmjs registry under @tiphys. The M3 exit test's "release v0.1.0 to GitHub Packages" wording is treated as a registry placeholder and is amended by this decision; the plan's M3 outline reads "release v0.1.0 to the registry decided in DR-0008".

Package naming (vetoable recommendation, from SC-006): two packages, @tiphys/kernel (the kernel itself, M3) and @tiphys/claude-code-plugin (the thin harness adapter, M4). The kernel repo's package.json carries the name @tiphys/kernel from M1-P1 onward; nothing depends on the name before first publish in M3, so a veto before M3 costs one line.

## Evidence

- SC-012 and SC-006 in delivery/verification/spec-coherence-report.md.
- Settled scope and M3 exit test: delivery/intake/orchestrated-delivery-v1.md sections 13 (exit test row M3, owner action 1).
- "npm install is the upgrade": delivery/intake/orchestrated-delivery-v1.md section 3.
- GitHub Packages npm registry scope-ownership and authenticated-install requirements (GitHub documentation, as summarized in SC-012).
