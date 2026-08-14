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

### HRB-1 (HIGH): the license inventory is a MANIFEST WALK, not a reading of the installed tree, and it goes GREEN over a genuinely unlicensed shipped package

**Mechanism.** scripts/license-gate.mjs:154 builds the production set by
re-deriving it: it reads the root manifest's `dependencies`, then for each name
opens `<root>/node_modules/<name>/package.json` and recurses into THAT file's
`dependencies` (scripts/license-gate.mjs:162, scripts/license-gate.mjs:186).
Two properties follow and both are defects:

- only edges spelled `dependencies` are followed, and
- resolution is keyed on the BARE NAME at the ROOT `node_modules` only, with a
  visited-set keyed on name (scripts/license-gate.mjs:158).

The installer does not build the tree that way. Anything npm installs that the
manifest walk does not model is invisible to the gate: optional dependencies,
bundled dependencies, and any package NESTED because of a version conflict.

The mechanism is not "optional dependencies are skipped". It is **the gate
models the tree instead of reading it**, while `node_modules/.package-lock.json`
and `npm ls --omit=dev --all --json` both describe the tree npm actually built.

**Two structurally different members, both measured** (CLAUDE.md:415 requires a
class witness to redden under at least two). Node v26.6.0, npm 11.18.0, lab
outside the worktree, `--pack-listing` used so check 5 does not mask checks 1
to 4.

Member A, optional dependency. `good@1.0.0` (MIT) declares
`optionalDependencies: { evil: <tarball> }`; `evil@1.0.0` has NO `license`
field at all.

```
$ npm install --no-audit --no-fund   -> exit 0
$ ls node_modules                    -> evil  good
$ npm ls --omit=dev --all
root-optional2@1.0.0
`-- good@1.0.0
  `-- evil@1.0.0
$ node scripts/license-gate.mjs --root <root> --pack-listing <listing>
license: green (1 production packages licensed)
1 production package(s) inventoried, all with license metadata on the declared allowlist; LICENSE present in the pack listing
EXIT 0
```

`npm ci --omit=dev` was measured separately and installs `evil` as well
(exit 0, `ls node_modules` -> `evil  good`), and the gate is still green over
it. That matters because scripts/license-gate.mjs:141 states that neither
optional nor peer dependencies "is installed by `npm ci --omit=dev` in this
repository today". The measured behaviour of `npm ci --omit=dev` is that it
DOES install optional dependencies; the sentence is true only because no
present dependency declares any, and nothing in this phase detects the day one
does.

Member B, version-conflict nesting. `parenta` needs `nested@1.0.0` (MIT),
`parentb` needs `nested@2.0.0` (GPL-3.0-only). npm hoists one and nests the
other:

```
$ npm ls --omit=dev --all
root-nested@1.0.0
+-- parenta@1.0.0
| `-- nested@1.0.0
`-- parentb@1.0.0
  `-- nested@2.0.0
$ find node_modules -name package.json -path '*nested*'
  node_modules/nested/package.json                  nested@1.0.0 MIT
  node_modules/parentb/node_modules/nested/...      nested@2.0.0 GPL-3.0-only
$ node scripts/license-gate.mjs --root <root> --pack-listing <listing>
license: green (3 production packages licensed)
EXIT 0
```

A GPL-3.0-only package is physically installed, ships to every consumer of the
package, and the gate reports GREEN, because the name `nested` was already in
the visited set from the hoisted MIT copy.

**Reachability (DR-0027).** It reaches the shipped artifact and a real user
path. `package.json` does not vendor the production tree into the tarball
(`"!dist/node_modules"`, package.json:15), so a consumer's `npm install
@tiphys/kernel` resolves the FULL transitive production tree from the registry,
nested copies and optional dependencies included. The gate that is supposed to
say what licenses that consumer receives does not see them. Today's tree has
ten packages, all permissive, so this is a LATENT defect with no present
instance; it is HIGH because the gate's entire purpose is to be the thing that
notices the first instance, and it structurally cannot.

**Enumeration of the mechanism's sites, and what it did NOT cover.**

```
$ grep -n 'dependencies\|node_modules' scripts/license-gate.mjs
```
gives the single traversal at scripts/license-gate.mjs:154 to
scripts/license-gate.mjs:197 and no other. So there is exactly one site in this
script. The same shape exists a second time in the repository, in the
`build:runtime-deps` script at package.json:31, which walks `dependencies` from
`node_modules/<name>` in the same way; scripts/license-gate.mjs:15 says so
itself. That command is not a gate and its output is excluded from the pack, so
it is noted, not charged.

NOT covered by that command: I did not audit `src/` for a third copy of the
walk, and I did not test workspaces, `peerDependencies` with
`auto-install-peers`, or npm aliases (`"a": "npm:b@1"`). Aliases in particular
I reasoned about and did not measure.

**What would close it.** Read the tree instead of modelling it: parse
`node_modules/.package-lock.json` (which npm writes and which lists every
installed path with its resolved location) or `npm ls --omit=dev --all --json`,
and classify every entry it contains. The work history already runs `npm ls
--omit=dev --all` as a cross-check by hand; making the gate consume it is the
difference between a one-time human observation and a gate.

### HRB-2 (refuted, no finding): green over zero units

The implementer's claim that M2-C-2 rewrites green-with-zero-units to error
holds on the DIRECT invocation path, which is the one CI uses
(.github/workflows/gates.yml:222 runs `node scripts/license-gate.mjs`, not the
runner). Measured against a manifest with no `dependencies`:

```
license: error (0 production packages licensed)
M2-C-2 (never green by omission): a gate reporting green with units 0 examined
nothing, so this record is error; ...
EXIT 21
```

The rewrite is in `makeGateResult` at src/gates/result.ts:179 and the exit code
is taken from the REWRITTEN status at scripts/license-gate.mjs:284, so the
protection does not depend on the runner. Attack failed; recorded because a
failed attack is evidence too.
