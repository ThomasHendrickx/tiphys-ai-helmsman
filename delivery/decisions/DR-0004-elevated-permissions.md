# DR-0004: Elevated GitHub permissions (owner action items)

- id: DR-0004
- project: tiphys-kernel
- task: stage-1-intake
- question: Approve and execute the repository protections that require owner-level GitHub access. The orchestrator has no admin access and will never assume it; these are proposed as exact commands for the owner to run.
- reversibility: reversible (settings can be changed), but their absence during early merges is a process-integrity gap, so they are queued before the first merge to main
- status: open
- decided: (pending)
- date: 2026-08-04

## Plain-language context (added after owner review round 1)

Today nothing stops anyone (including any agent with push access) from pushing straight to main on this repository. The blueprint requires the opposite: changes reach main only through a pull request with green CI, enforced by GitHub settings rather than by instructions to agents. Changing repository settings requires admin rights, which the orchestrator does not have and will never assume. So this record asks you to approve three commands (listed below under proposed owner actions) that you run yourself once the first phase has delivered the CI workflow: confirm the default branch, switch on the protection rule requiring a pull request plus a passing check named "gates", and verify it took. The orchestrator will re-surface the exact commands at the moment they become runnable. The question in one line: do you approve turning on this branch protection, to be executed by you right after phase 1 merges?

## Proposed owner actions

Timing: run item 1 any time; run items 2 and 3 after the first CI workflow lands on main (the required check name must exist first). Item 4 is optional hardening for M2.

1. Confirm the default branch is main:

   gh api repos/ThomasHendrickx/tiphys-ai-helmsman --jq .default_branch

2. Protect main: require a pull request before merging and require the CI check to pass. Using a ruleset (current GitHub mechanism):

   gh api --method POST repos/ThomasHendrickx/tiphys-ai-helmsman/rulesets --input - <<'JSON'
   {
     "name": "main-protection",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       { "type": "pull_request", "parameters": {
           "required_approving_review_count": 0,
           "dismiss_stale_reviews_on_push": false,
           "require_code_owner_review": false,
           "require_last_push_approval": false,
           "required_review_thread_resolution": false } },
       { "type": "required_status_checks", "parameters": {
           "strict_required_status_checks_policy": true,
           "required_status_checks": [ { "context": "gates" } ] } }
     ]
   }
   JSON

   Note: the required check context "gates" must match the job name in the CI workflow delivered by M1 phase 1. If the delivered job name differs, substitute it.

3. Verify the ruleset took effect:

   gh api repos/ThomasHendrickx/tiphys-ai-helmsman/rulesets --jq '.[].name'

4. (M2, credential scoping) When implementer agents get their own token, scope it so it cannot create pull requests or merge: a fine-grained PAT with contents:write only, no pull_requests permission. Queued here so it is not forgotten; exact token setup will be proposed in the M2 plan.

## Recommendation

Approve items 1 to 3 now, execute 2 and 3 right after M1 phase 1 merges. The orchestrator will remind at that gate.

## Evidence

- Blueprint credential scoping row: delivery/intake/orchestrated-delivery-v1.md section 4 ("enforced by token scope or branch protection, not instruction").
- Process doc section 9 item 4: protections in place before the first merge.
