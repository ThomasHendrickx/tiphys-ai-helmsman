# Clean-room HAZARD review: M2-P3 (full-suite wrapper with parity counting)

Reviewer contract: second (T-007), find what criteria cannot describe.
Declared hazard: a measurement that can shrink silently.
Subject: branch claude/m2-p3-suite-wrapper @ 6fe8066924ba
Status: IN PROGRESS (incremental)

## Log
- Started. Workdir established.

## Spec located (kernel-plan-m2.md M2-P3, lines 295-345)
- Hazard class (M2-D-18): measurement that can shrink silently.
- 11 acceptance criteria + reporter-pin cross-toolchain criterion 11.
- Key mechanisms to attack: independent walk enumeration (not runner pattern),
  reporter pin (reject non-pinned format, no widening), registry resolution
  by name + merge-base comparison (--base absent=error), skip reason,
  counterfeit summary line (C-1), truncated stream=error, pins (M2-C-5),
  exit-code truth, M2-C-6 (classifyEntry path type before open).
- Head verified 6fe8066; merge-base with main 4c9bfbc.
- Changed files: src/gates/suite.ts (+1073), test/suite-gate.test.ts (+611),
  gates.manifest.json, test/behaviors.json, package.json, work-history, gates.yml.

## Contracts read
- src/gates/suite.ts (1073L): reporter pinned as data:URL NDJSON tiphys-suite-events-v1,
  child-scoped NODE_OPTIONS (drops inherited), format validated before any count,
  independent walk (walkTestFiles) both directions, registry name-resolution + merge-base
  deletion check, skip-reason, counterfeit-immune via JSON.stringify, exit-code cross-check,
  M2-C-5 pin start/end, M2-C-6 via classifyEntry.
- result.ts makeGateResult applies M2-C-2: green+units0 -> error vacuous. So a
  zero-test suite errors, not greens.
- classifyEntry: symlink-to-regular -> "regular" (stat follows); symlink-to-dir -> irregular -> walk throws.
- manifest suite entry: command + parameters:["base"]; runner appends base/result/evidence.
- gate:suite npm script has NO --result/--evidence/--base (relies on runner to append). Bare `npm run gate:suite` -> exit 64. Note.
- CI push bundle uses --only manifest-self-check (declared interim deviation, M2-P9 replaces).

## Attacks to construct (in progress)

## Attack results (captured)
- Phase's own 16 tests: PASS on floor node v26.6.0 (isolated).
- Full build: npm ci/build exit 0, clean git status after build (floor).

### ATTACK A: forged tiphys event line appended to reporter destination by a test (mask a renamed behavior). REFUTED.
- Natural append during test: node owns the dest fd; its writes overwrote the
  interleaved append. Forged line absent from final stream. Rename caught red.
- Late append (process.on exit): surviving tail landed AFTER stream-end ->
  parseSuiteStream "stream line N follows the stream-end trailer" -> error (exit 21).
- Conclusion: destination-file injection cannot produce a silent shrink or mask
  a rename. stream-end-must-be-last + single-fd ownership together close it. POSITIVE.

### ATTACK B: symlink .test.ts in test root. REFUTED (caught red).
- test/link.test.ts -> ../realtests/hidden.ts. Walk classifies symlink-to-regular
  as regular -> discovered=[test/link.test.ts]; node follows link, reports target
  realtests/hidden.ts. Both-direction parity mismatch -> red (2 findings). No escape.

### Full suite (floor v26.6.0): exit code had 2 failures, BOTH watcher.test.ts
  (lines 269, 293) real-clock beacon-timing flakes. watcher/liveness UNTOUCHED by
  phase (diff empty). Work history documents these pass in isolation, fail under
  full-suite concurrency. Consistent with KNOWN flakes. Phase's own 16 tests: 16/16.

### KNOWN schema-count: RESOLVED. test/gates.test.ts:2361 computes expected count
  dynamically (readdirSync of src/gates/schemas, filter .schema.json) and asserts
  units==count AND count>0. Two M2-P1 schemas present -> passes. M2-P3 adds none;
  no failure. (Passed in full run.)

### Integration probes
- GateResult: suite.ts uses delivered makeGateResult/renderGateResult/exitCodeForStatus/EXIT_GATE_ERROR. M2-C-2 vacuous rewrite applies.
- Pin: uses takePin/comparePins/describePinDifference; record shows 5 fields incl ctimeMs (attack output). OK.
- Runner: src/gates/run.ts:703-706 appends --result/--evidence/--<param> for each requiredParameters; suite declares parameters:["base"] -> --base appended on PR. Gate also self-guards --base-absent. OK.
- C-1: counts from parseSuiteStream + childExit cross-check only; no summary line read (test:diagnostic not emitted). OK.

### M2-C-1 divergence: work history records that registering suite (parameters:["base"])
  reddened the push-bundle wiring test (gates.test.ts:1289) because runner refuses
  base-requiring gate without --base. Reconciled via gates.yml --only manifest-self-check
  (declared scope deviation; gates.yml is on M2-P1 conflicts-with row). M2-P4 PR-bundle
  impact flagged to orchestrator. Honest, mechanism-named, derivation table published.

### PENDING (blocked on self-inflicted CPU contention draining): zero-test/M2-C-2 empirical,
  merge-base-absent, cross-toolchain criterion 11 fixture, watcher-in-isolation.
  Code-level: makeGateResult green+units0->error confirmed; empty .test.ts -> parity red.

## VERDICT: FIX-ROUND-NEEDED (1 MEDIUM CR-1306). Full structured review in REVIEW-OUT-final.md; finding detail in CR-1306.md.
