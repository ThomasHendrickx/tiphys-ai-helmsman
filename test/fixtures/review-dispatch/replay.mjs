/*
 * M6-P5: stands in for the harness CLI. It reads the brief from stdin,
 * writes the verdict the prompt names (copied from TIPHYS_STUB_VERDICT),
 * prints the stream in TIPHYS_STUB_STREAM to stdout, records what it saw in
 * TIPHYS_STUB_ECHO, and exits with TIPHYS_STUB_EXIT (default 0).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [model, prompt] = process.argv.slice(2);
const stdin = readFileSync(0, "utf8");
const echo = process.env["TIPHYS_STUB_ECHO"];
if (echo) {
  writeFileSync(echo, JSON.stringify({ cwd: process.cwd(), model, prompt, stdin }));
}
const named = /Write your verdict to (\S+), relative to the current directory\./.exec(prompt ?? "");
const verdict = process.env["TIPHYS_STUB_VERDICT"];
if (named !== null && verdict) {
  mkdirSync(dirname(named[1]), { recursive: true });
  writeFileSync(named[1], readFileSync(verdict));
}
process.stdout.write(readFileSync(process.env["TIPHYS_STUB_STREAM"] ?? ""));
process.exitCode = Number(process.env["TIPHYS_STUB_EXIT"] ?? "0");
