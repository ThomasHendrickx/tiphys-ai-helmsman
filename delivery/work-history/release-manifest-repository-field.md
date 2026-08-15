# Work history: the release manifest's `repository` field

Branch: `claude/release-manifest-repository-field`, cut from `main` at 5336859.
Deliberately NOT matching `^claude/m[0-9]+-p[0-9]+-`: this is a defect fix on
the release path, not a plan phase, and that pattern makes the scope gate demand
a phase declaration (CLAUDE.md:601).

This file is the beacon (T-008 rule 1). It is created before the work and
appended as the work happens.

## Status

- [x] Worktree cut, toolchain confirmed v26.6.0
- [x] Defect reproduced from the run log and the mechanism established
- [x] Form of the `repository` field decided, with the measurement behind it
- [x] `package.json` edited
- [x] Test written and demonstrated red against two dangerous states
- [x] Witness spec written, harness run
- [x] Behaviour registered in `test/behaviors.json`
- [x] Build, suite, authored-bytes, local gate bundle

## The defect

The `0.1.0` publish dispatch, run 31861403550, reached `npm publish --access
public --provenance` and the registry refused it:

```
npm error code E422
npm error 422 Unprocessable Entity - PUT https://registry.npmjs.org/@tiphys%2fkernel
Error verifying sigstore provenance bundle: Failed to validate repository information:
package.json: "repository.url" is "", expected to match
"https://github.com/ThomasHendrickx/tiphys-ai-helmsman" from provenance
```

Nothing was published. `0.1.0` is still free. The tag job did not run, because
`needs: release` fails when the release job fails, which is the design working
(.github/workflows/release.yml:379).

`package.json` on `main` at 5336859 declares no `repository` at all.

## The mechanism, not the instance

The instance is "the field is missing". The mechanism is:

**A property of the published artifact that only the registry checks is a
property nothing in this repository can be red about.** Every other manifest
field the release path depends on has a local assertion behind it: the version
is compared against the dispatch input by the `decide` step, the `files` list is
compared against the built tree by the pack check, `bin` is exercised by
`scripts/release-verify.sh`. `repository` had none, so its absence was only
reachable at the one step with no clean undo.

The derivation of every other manifest key on that path, and what it is guarded
by, is in the section "Derivation: which manifest keys the release path reads"
below, with the command that produced it.

## Appended as the work happened

(sections below are appended in order)
