# Arbitration: kernel 0.2.1 release bump (PR #218), reviewed head

Orchestrator record under DR-0012
(delivery/decisions/DR-0012-delegated-merge-authority.md:22).

This record rules on the REVIEWED head, 95d1ede537d528243aad9e3a90d1366570301ef0.
The condition-6 document naming the verdict commit is written out of tree.

- reviews: kernel-0-2-1-release-bump-criteria.json, kernel-0-2-1-release-bump-hazard.json

| document | family | contract | head | verdict |
|---|---|---|---|---|
| `delivery/review/clean-room-kernel-0-2-1-release-bump-criteria.md` | Opus | criteria | 95d1ede | APPROVE, no finding |
| `delivery/review/clean-room-kernel-0-2-1-release-bump-hazard.md` | Sonnet | hazard | 0571bc6, then 95d1ede | APPROVE, no finding |

The bump moves package.json, the lockfile, the plugin's exact kernel dev pin
and the shipped final-report template's stamp to 0.2.1, and one stored
witness's mutation find text with the stamp (CI on 0571bc6 reported it as
error). The plugin's peer range stays ^0.2.0, which admits 0.2.1. RULES_SINCE
entries naming 0.2.0 are correct and unchanged: they name the version that
introduced a rule.

The verdict commit carrying this file touches only `delivery/review/`.
