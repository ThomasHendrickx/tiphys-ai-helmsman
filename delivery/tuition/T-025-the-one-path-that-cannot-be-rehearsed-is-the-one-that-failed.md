# T-025: the one path that could not be rehearsed is the one that failed, and the dry run cannot reach it

- date: 2026-08-15
- author: orchestrator
- subject: the first real publish of `@tiphys/kernel@0.1.0`, refused by the
  registry at the publish step
- status: FIXED and PUBLISHED. The mechanism is closed for this instance and the
  general form is stated below rather than assumed closed.

## What happened

Run `31861403550`, the first dispatch of `release.yml` with `confirm` set,
failed at step 13:

```
npm error 422 Unprocessable Entity - PUT https://registry.npmjs.org/@tiphys%2fkernel
Error verifying sigstore provenance bundle: Failed to validate repository information:
package.json: "repository.url" is "", expected to match
"https://github.com/ThomasHendrickx/tiphys-ai-helmsman" from provenance
```

`package.json` declared no `repository`. `--provenance` mints an attestation
naming the repository, npm's registry compares it to the manifest, and refused.

Nothing was published. The tag job was SKIPPED, so no tag and no GitHub release
were created for a version that does not exist.

## The mechanism, which is NOT that a field was missing

**A property of the published artifact that only the REGISTRY checks is a
property nothing here can be red about.**

Measured on the failing manifest, at `5336859`:

| probe | result |
|---|---|
| the licence gate | exit 0 |
| `npm pack --dry-run` | exit 0 |
| `npm test` | exit 0, 822 pass, 0 skipped |
| **`npm publish --dry-run --provenance`** | **exit 0** |

The last row is the finding. **The dry run does not perform the registry-side
comparison**, so no rehearsal could have reached this, however many were run.

## What this cost, and what it did not

Two clean-room reviews, one delta verification and TWO green rehearsals passed
over it. That is not a failure of any of them. DR-0033 had recorded the reason
in advance, before the publish:

> the publish arm has no witness and cannot get one without publishing ... a
> failure in either is the first execution of an unwitnessed path and not a
> surprise.

**The prediction was correct and is now measured rather than asserted.** Writing
the asymmetry down before the action is what made this a known cost rather than
an accident, and it is the transferable practice.

## What went RIGHT, and it is the more important half

Two guards fired correctly, in the fail-closed direction, on their first ever
real exercise:

1. **The registry refused** rather than accepting an artifact whose manifest and
   attestation disagreed.
2. **The tag job skipped.** DR-0032's whole property is that a tag must never
   point at nothing, and the first thing that ever tested it was a real failure
   rather than a test. It held.

A design whose first real failure lands in the safe direction is the outcome the
work was for.

## The fix, and what makes it more than a field

The form was ESTABLISHED, not guessed. `libnpmpublish` builds the claim as
`${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`, and four candidate manifests were
run through the fixer `npm publish` uses, with the absent case reproducing the
registry's message exactly. The object form chosen is the unique fixed point of
that fixer, so the authored bytes, the tarball's bytes and the sent manifest are
the same bytes.

The part that closes the MECHANISM rather than the instance is the local
assertion: three witness members reddening at three different assertions, so
the registry's check is now reachable from `npm test`.

`homepage` and `bugs` were deliberately NOT added. Neither is read by the check
that failed, npm does not derive them, and adding unasserted fields is the
mechanism this fix closes.

## What this entry does NOT establish

- **The general form is open.** Five other top-level manifest keys still redden
  nothing when deleted, `license` among them, recorded in the register rather
  than fixed here.
- **No sweep has been run for other registry-only properties.** Deprecation
  state, dist-tags, access level and the packument's own fields are all checked
  by npm and by nothing here. Nobody has enumerated them.
- **It does not claim rehearsals are of limited value.** They caught nothing
  here because this defect is out of their reach BY CONSTRUCTION, and the same
  two rehearsals did witness the pre-publish execution step and the guard that
  skips the tag job. The lesson is to know which arm an instrument covers, not
  to distrust the instrument.
