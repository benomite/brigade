// #4682 — the app launches none of the old runtime's `manager` commands (manager, manager backlog, manager upstream).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const APP = join(import.meta.dirname, "..", "..", "src");
const RUNTIME = join(import.meta.dirname, "..", "..", "..", "runtime");

const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));

describe("#4682 — the app launches no `manager` command", () => {
  test("no file of app/src names the command `manager`, `manager backlog` or `manager upstream` as a launch", () => {
    const found = files(APP)
      .filter((file) => /\.(ts|js|cjs)$/.test(file))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, rank) => (/(?:["'`]manager(?: backlog| upstream)?["'`])/.test(line) && /COMMAND|commande|command|launch/i.test(line) ? [`${file}:${rank + 1}: ${line.trim()}`] : [])),
      );
    assert.deepEqual(found, []);
  });

  test("the app's manager reader is gone, and the runtime serves no `manager` command", () => {
    assert.equal(existsSync(join(APP, "manager.ts")), false);
    assert.equal(existsSync(join(RUNTIME, "src", "manager-cli.ts")), false);
    assert.doesNotMatch(readFileSync(join(RUNTIME, "package.json"), "utf8"), /"manager"/);
    assert.equal(existsSync(join(RUNTIME, "src", "commandes.ts")), false);
  });
});
