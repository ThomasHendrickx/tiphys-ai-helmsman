const repo = process.argv[2];
const checks = await import(new URL("src/checks.ts", "file://" + repo + "/").href);
for (const n of [4, 8, 12, 16, 20, 24]) {
  // n nested quote+list markers followed by a line the prefix cannot cover
  const prefix = "> - ".repeat(n);
  const doc = prefix + "[a]: https://example.invalid/x\nreal text here\n";
  const t0 = process.hrtime.bigint();
  const units = checks.quotableUnits(doc);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`markers=${n} bytes=${doc.length} units=${units.size} ms=${ms.toFixed(1)}`);
  if (ms > 20000) { console.log("ABORT: superlinear"); break; }
}
