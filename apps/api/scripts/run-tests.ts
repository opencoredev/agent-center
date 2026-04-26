import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

const testsDir = join(import.meta.dir, "..", "src", "__tests__");
const entries = await readdir(testsDir);
const testFiles = entries
  .filter((entry) => entry.endsWith(".test.ts"))
  .sort()
  .map((entry) => join(testsDir, entry));

for (const testFile of testFiles) {
  await $`bun test ${testFile}`;
}
