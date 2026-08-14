# Clean-room review: M3-P10 (release and exit), ADVERSARIAL HAZARD lens

- Branch: claude/m3-p10-release-and-exit
- Head reviewed: 8d056f6
- Pull request: #140
- Reviewer lens: adversarial hazard. A second reviewer walks the acceptance
  criteria in parallel; this document does not re-walk them.
- Toolchain: node v26.6.0, npm 11.18.0, from the scratch prefix, confirmed in
  every shell that ran a command.
- Status: IN PROGRESS (this file is appended to as work proceeds; its mtime is
  the beacon required by CLAUDE.md:422).

## The claim under attack

The phase ships release machinery. The irreversible action in it is
`npm publish`. The design claim is that publishing is READY and CANNOT HAPPEN
by accident. Everything below attacks that claim and the guards around it.

## Attack list (declared before work, appended to as attacks are added)

1. Can anything publish without a deliberate owner dispatch? Evaluate what
   `if: ${{ inputs.dry-run == false }}` actually resolves to for a
   `workflow_dispatch` boolean input, for an omitted input, and for the string
   "false".
2. `prepublishOnly` and `prepack`: which npm commands fire each, and was the
   pack-listing evidence produced with scripts disabled?
3. Can the license gate pass vacuously, or green over a genuinely unlicensed
   package? Probe workspaces, optional deps, bundled deps, SPDX expressions,
   LICENSE-file-without-license-field, deduped transitives.
4. Can scripts/release-verify.sh pass against a contaminated resolution path?
   Probe NODE_PATH, parent node_modules, symlink, NPM_CONFIG_PREFIX, global
   install, parent .npmrc.
5. The three witness specs: red against the DANGEROUS state or merely against
   the absent feature? Two structurally different members per class?
6. Dependency-tree growth 6 -> 10: verify permissiveness independently, and
   ask whether the gate would have SEEN the growth or only sees it because the
   allowlist widened.
7. What does the `license` gate assert per gate rather than per bundle on a CI
   run (CLAUDE.md:577 four printed facts)?

Attacks added by this reviewer beyond the dispatched list are marked ADDED
where they appear.

## Findings

(Appended below as they are confirmed.)
