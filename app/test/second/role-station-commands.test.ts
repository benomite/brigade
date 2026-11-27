import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROLE_OF_SECOND } from "../../src/second/launch.ts";

test("the second's role gives the brigade commands for a station, and no ssh recipe", () => {
  const role = readFileSync(ROLE_OF_SECOND, "utf8");
  for (const command of ["brigade status", "brigade logs", "brigade restart", "brigade update --check"]) assert.ok(role.includes(`\`${command}`), command);
  assert.doesNotMatch(role, /journalctl|brigade-kitchen|\/tmp/);
});
