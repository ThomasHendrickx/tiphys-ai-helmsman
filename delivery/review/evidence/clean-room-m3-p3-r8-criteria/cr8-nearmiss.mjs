const repo = process.argv[2];
const checks = await import(new URL("src/checks.ts", "file://" + repo + "/").href);
const nearMiss = (marker, count) => {
  const wanted = count * marker.length + 2;
  const opening = "> ".repeat(wanted / 2);
  return `${opening}[r]: https://example.invalid/x\n\t${marker.repeat(count)}tail\n`;
};
checks.quotableUnits("warm up\n");
for (const [name, marker, count] of [["bullet", "* ", 28], ["ordered", "1. ", 28]]) {
  const doc = nearMiss(marker, count);
  const t0 = process.hrtime.bigint();
  const units = checks.quotableUnits(doc);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${name} bytes=${doc.length} ms=${ms.toFixed(1)} units=${JSON.stringify([...units])}`);
}
