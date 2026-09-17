import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * M4-P20 criterion 7: the guard over `scripts/probe-cas-ref.mjs`.
 *
 * WHY THIS FILE EXISTS. The probe is the evidence behind M4-D-11, and an
 * evidence producer that quietly becomes a no-op produces a document that
 * reads exactly the same as a real measurement. So the probe is run here
 * against a scratch bare repository and its printed verdicts are asserted.
 *
 * WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT. The refusal SIGNATURE
 * (`! [rejected] ... (stale info)`) is git's own text, captured from a real
 * forced contention, never hand-written (T-003, CLAUDE.md standing warning
 * 10). The object names inside that line change on every run, so the
 * assertions match the STRUCTURE of git's line and the ref it names, and
 * the verbatim capture with its git version lives in
 * delivery/verification/cross-environment-exclusion-probe.md:1.
 *
 * C-2: nothing here reads a pid, probes process liveness, sends a signal,
 * or reads /proc.
 */

const probeScript = fileURLToPath(
  new URL("../scripts/probe-cas-ref.mjs", import.meta.url),
);

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runProbe(args: string[]): RunResult {
  const result = spawnSync(process.execPath, [probeScript, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

interface Ctx {
  after(fn: () => void): void;
}

function scratch(t: Ctx, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tiphys-cas-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return join(dir, name);
}

/** The human lines a mode printed, before any --json payload. */
function humanLines(stdout: string, jsonRequested: boolean): string[] {
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  if (!jsonRequested) {
    return lines;
  }
  const start = lines.findIndex((line) => line === "{");
  return start === -1 ? lines : lines.slice(0, start);
}

test("the compare-and-swap probe accepts one environment and refuses the stale one", (t) => {
  const target = scratch(t, "remote-mode");
  const result = runProbe(["--remote", target]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const lines = humanLines(result.stdout, false);
  assert.equal(
    lines.length,
    2,
    `the remote mode prints exactly two lines, got ${String(lines.length)}: ${result.stdout}`,
  );
  assert.equal(lines[0], "A accept");
  assert.match(lines[1] ?? "", /^B refuse /);

  /* The refusal line is git's, not the probe's. Asserting the marker and
     the ref rather than the whole string is what keeps this green across
     runs whose object names differ, while still failing if the probe ever
     prints a line that is not a refusal. */
  assert.match(lines[1] ?? "", /! \[rejected\]/);
  assert.match(lines[1] ?? "", /refs\/tiphys\/lease/);
  assert.match(lines[1] ?? "", /\(stale info\)/);

  // The scratch fleet is built at the path it was given, absolutely.
  assert.equal(existsSync(join(target, "remote.git")), true);
  assert.equal(existsSync(join(target, "A")), true);
  assert.equal(existsSync(join(target, "B")), true);
});

test("the compare-and-swap probe reports a single winner and both clone paths in its json", (t) => {
  const target = scratch(t, "remote-json");
  const result = runProbe(["--remote", target, "--json"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const start = result.stdout.indexOf("{");
  assert.notEqual(start, -1, "the --json flag must print a json object");
  const payload = JSON.parse(result.stdout.slice(start)) as {
    mode: string;
    gitVersion: string;
    singleWinner: boolean;
    registerBefore: string;
    registerAfterA: string;
    registerAfterB: string;
    cloneA: string;
    cloneB: string;
    a: { accepted: boolean; exit: number };
    b: { accepted: boolean; exit: number; stderr: string };
  };

  assert.equal(payload.mode, "remote");
  assert.match(payload.gitVersion, /^git version /);
  assert.equal(payload.singleWinner, true);
  assert.equal(payload.registerBefore, "");
  assert.equal(
    payload.registerAfterB,
    payload.registerAfterA,
    "the loser must not have moved the register",
  );
  assert.equal(payload.a.accepted, true);
  assert.equal(payload.a.exit, 0);
  assert.equal(payload.b.accepted, false);
  assert.notEqual(
    payload.b.exit,
    0,
    "a refused compare-and-swap exits nonzero; note that a transport failure " +
      "does too, which is why the design needs three states and not two",
  );
  assert.match(payload.b.stderr, /\(stale info\)/);

  // Absolute paths, per CLAUDE.md standing warning 9.
  assert.equal(payload.cloneA.startsWith("/"), true, payload.cloneA);
  assert.equal(payload.cloneB.startsWith("/"), true, payload.cloneB);
});

test("the compare-and-swap probe reports the bare force-with-lease form as vacuous", (t) => {
  const target = scratch(t, "vacuity");
  const result = runProbe(["--vacuity", target, "--json"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const start = result.stdout.indexOf("{");
  assert.notEqual(start, -1);
  const payload = JSON.parse(result.stdout.slice(start)) as {
    bareIsVacuous: boolean;
    exactIsVacuous: boolean;
    findings: {
      id: string;
      accepted: boolean;
      verdict: string;
      clobberedLiveHolder?: boolean;
    }[];
  };

  /* Asserted BY NAME, never by count: this findings list is the sort of
     thing a later phase extends, and a pinned length would be a claim
     about every future round (CLAUDE.md binding convention 5). */
  const byId = new Map(payload.findings.map((finding) => [finding.id, finding]));

  const absent = byId.get("bare-lease-absent-register");
  assert.notEqual(absent, undefined, "the absent-register arm must be reported");
  assert.equal(absent?.verdict, "VACUOUS");

  const afterFetch = byId.get("bare-lease-after-routine-fetch");
  assert.notEqual(afterFetch, undefined, "the routine-fetch arm must be reported");
  assert.equal(afterFetch?.verdict, "VACUOUS");
  assert.equal(
    afterFetch?.clobberedLiveHolder,
    true,
    "the routine-fetch arm is only evidence if it actually overwrote the live holder",
  );

  /* THE DISCRIMINATOR. Same bare form, same live holder, into a namespace
     no fetch refspec covers. It is SAFE, which is what establishes that
     the vacuity above comes from the remote-tracking ref rather than from
     --force-with-lease as such. Without this row the probe's conclusion
     would be true for a reason nobody had checked. */
  const untracked = byId.get("bare-lease-untracked-namespace");
  assert.notEqual(untracked, undefined, "the untracked-namespace arm must be reported");
  assert.equal(untracked?.verdict, "SAFE");

  const control = byId.get("exact-sha-stale-expectation");
  assert.notEqual(control, undefined, "the exact-sha control must be reported");
  assert.equal(control?.verdict, "SAFE");

  assert.equal(payload.bareIsVacuous, true);
  assert.equal(payload.exactIsVacuous, false);

  const lines = humanLines(result.stdout, true);
  assert.equal(
    lines.includes(
      "verdict: the bare --force-with-lease form is REFUSED for the design",
    ),
    true,
    result.stdout,
  );
  assert.equal(
    lines.includes("verdict: the exact-sha form is MANDATED"),
    true,
    result.stdout,
  );
});

test("the compare-and-swap probe says a local bare repository cannot answer the namespace question", (t) => {
  const target = scratch(t, "namespaces");
  const result = runProbe(["--namespaces", target, "--json"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const start = result.stdout.indexOf("{");
  assert.notEqual(start, -1);
  const payload = JSON.parse(result.stdout.slice(start)) as {
    results: { ref: string; accepted: boolean }[];
  };

  const byRef = new Map(payload.results.map((row) => [row.ref, row]));
  /* A local bare repository accepts every namespace, including the three
     that the real fleet remote answers with HTTP 403 (CLAUDE.md standing
     warning 14 as generalised, and
     delivery/verification/m4-prototype-probes.md:147). That difference is
     the whole point of this arm: it is what stops a local green being read
     as a measurement of the remote. */
  assert.equal(byRef.get("refs/heads/tiphys-lease")?.accepted, true);
  assert.equal(byRef.get("refs/tiphys/lease")?.accepted, true);
  assert.equal(byRef.get("refs/tags/tiphys-lease")?.accepted, true);
  assert.equal(byRef.get("refs/notes/tiphys-lease")?.accepted, true);

  const lines = humanLines(result.stdout, true);
  const note = lines.find((line) => line.startsWith("note: "));
  assert.notEqual(
    note,
    undefined,
    "the namespace mode must state that a local accept is not evidence about the real remote",
  );
  assert.match(note ?? "", /NOT evidence/);
});

test("the compare-and-swap probe exits 64 on a usage error and names the mode it wanted", () => {
  const noMode = runProbe([]);
  assert.equal(noMode.status, 64, noMode.stderr);
  assert.match(noMode.stderr, /a mode is required/);
  assert.match(noMode.stderr, /usage: node scripts\/probe-cas-ref\.mjs/);

  const noPath = runProbe(["--remote"]);
  assert.equal(noPath.status, 64, noPath.stderr);
  assert.match(noPath.stderr, /--remote requires a path/);

  const twoModes = runProbe(["--remote", "/tmp/a", "--vacuity", "/tmp/b"]);
  assert.equal(twoModes.status, 64, twoModes.stderr);
  assert.match(twoModes.stderr, /exactly one mode may be given/);
});
