# Clean-room review, M3-P12, ADVERSARIAL HAZARD lens

Head reviewed: ca9ae71 on claude/m3-p12-tag-and-github-release (pull request #144).
Reviewer worktree cut from origin/claude/m3-p12-tag-and-github-release; branch
claude/reviews-m3-p12-hazard.

Property under attack (DR-0032): the owner uses the GitHub release as their
mental model of what exists, so a tag or a release that exists WITHOUT a
corresponding published version is worse than none.

Second reviewer walks the acceptance criteria; this document does not.

## Status: IN PROGRESS (beacon; appended as work proceeds)

## Attack list, declared before any result

1. Defeat `needs: release`. Defeat `if: needs.release.outputs.publish == 'yes'`.
   Defeat both. Empty / unset / literal-false output. Decide step skipped.
2. The third failure mode neither gate covers.
3. `contents: write`: exactly what the tag job can do, whether any of it is
   influenced by dispatch inputs, whether it can overlap the OIDC job.
4. The new assertions: add a job, a workflow, or a step they cannot see.
5. Witness quality: twelve members, look for an incidental redden and for a
   class whose two members are the same member twice.
6. The tag command: injection, valid-ref-but-not-valid-tag, lightweight vs
   annotated, remote-but-not-local, concurrent dispatch, TOCTOU.
7. Fail loudly / leave untagged / never force: find a forcing or silent path.
8. ADDED BY THIS REVIEWER: does anything decouple "the release job concluded
   success" from "npm publish actually succeeded"? (`continue-on-error`,
   `if: always()`, `|| true` inside the publish body.)
9. ADDED BY THIS REVIEWER: does the tag job ever OBSERVE the registry, or does
   it only observe intent plus job conclusion?
10. ADDED BY THIS REVIEWER: does the local `git rev-parse refs/tags/...` check
    have any force, given how actions/checkout fetches tags?
