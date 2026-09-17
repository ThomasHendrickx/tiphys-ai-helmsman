# Where every file in this directory came from

M4-P6 ships an observer that records `PreToolUse` hook payloads. The
red-witness rule requires assertions about another program's output to use
REAL CAPTURED OUTPUT from that program rather than strings chosen to match
the parser (CLAUDE.md:398). Nothing here was typed by hand.

## The two payload fixtures

`pretooluse-write-bypasspermissions.json` and
`pretooluse-write-acceptedits.json` are PROJECTIONS of two real `PreToolUse`
payloads that Claude Code 2.1.273 delivered to M4-P1's marker hook, taken from
the arms that phase committed:

| fixture | M4-P1 arm |
|---|---|
| `pretooluse-write-bypasspermissions.json` | test/fixtures/harness-probe/q1-bypass-permission-mode/bypass-exit0.summary.txt:14 |
| `pretooluse-write-acceptedits.json` | test/fixtures/harness-probe/q1-bypass-permission-mode/control-acceptEdits-exit2.summary.txt:14 |

**PROJECTION, and the word is exact.** M4-P1's marker
(test/fixtures/harness-probe/q1-bypass-permission-mode/plugin-hook-marker.mjs.txt:13)
wrote a JSON line carrying five fields it read off the payload
(`hook_event_name`, `permission_mode`, `tool_name`, `cwd`, `tool_input`) plus
three of its own (`fired_at`, `arm`, `exiting_with`). So the five payload
fields are verbatim and the payload's OTHER fields, `session_id` and
`transcript_path` among them, were never captured and are therefore ABSENT
here. These fixtures are what M4-P1 measured, not a reconstruction of a whole
payload.

**The projection is re-derived on every test run, so it cannot drift.** The
derivation is: find the `--- marker.jsonl ---` section of the summary, take its
first non-empty line, parse it, and keep the five keys above in that order.
`test/plugin-hooks.test.ts` performs exactly that derivation against the M4-P1
capture and compares the result to the committed fixture, so hand-editing
either one reddens.

## The two captured contract documents

`hook-json-output-contract.txt` and `manifest-hooks-field.txt` are verbatim
line ranges of `strings -n 8` over the shipped Claude Code binary, which is the
program whose behaviour they describe:

```
/opt/claude-code/bin/claude --version   # 2.1.273 (Claude Code)
strings -n 8 /opt/claude-code/bin/claude > claude-strings.txt
sed -n '232606,232633p' claude-strings.txt > hook-json-output-contract.txt
for n in 279673 293535 304118 304127 331748 331753 331754; do
  sed -n "${n}p" claude-strings.txt
done > manifest-hooks-field.txt
```

They are the evidence behind two decisions M4-P6 would otherwise have had to
guess at:

- **A hook's block decision travels on STDOUT**, as `decision`, `continue` or
  `hookSpecificOutput.permissionDecision`. An observer that writes nothing to
  stdout and exits 0 therefore expresses no decision at all, which is what
  "blocks nothing" means mechanically rather than by assertion. M4-P1's matrix
  measured the exit-code half of the same contract from the outside: hook exit
  0 left `app.txt` CHANGED and hook exit 2 left it unchanged
  (delivery/work-history/m4-p1.md:236).
- **`plugin.json` accepts hooks INLINE**, "in the same format as the one used
  for settings", as well as by path. M4-P1's probe used the path form and this
  phase uses the inline form, so this capture is the reason that is a choice
  rather than a departure.

**Line numbers into a `strings` dump are not stable across builds**, so the
commands above reproduce the FILES only against binary 2.1.273. Re-derive by
searching for the text, not by replaying the line numbers, on any other build.
