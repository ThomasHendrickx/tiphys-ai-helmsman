import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const sourceEntry = fileURLToPath(new URL("../bin/tiphys.ts", import.meta.url));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

function runCli(args: string[]) {
  return spawnSync(process.execPath, [sourceEntry, ...args], {
    encoding: "utf8",
  });
}

test("version prints the package.json version and exits 0", () => {
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version: string;
  };
  const result = runCli(["version"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, `${parsed.version}\n`);
});

test("unknown subcommand exits 64 and prints usage to stderr", () => {
  const result = runCli(["no-such-command"]);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^usage: tiphys /);
});
