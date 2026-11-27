import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(
  new URL("../../docs/runtime/isolation-and-network-filter.md", import.meta.url),
  "utf8",
);

test("the page states the rule: isolation and the network filter on every station", () => {
  assert.match(page, /every agent runs isolated to its project and behind the network filter, on every station/);
});

test("the page states how the isolation holds on Linux and on macOS, and that Windows launches no agent", () => {
  assert.match(page, /`bwrap` on\s+Linux, Claude Code's sandbox on macOS/);
  assert.match(page, /cannot read another project's clone,\s+worktrees, state or secrets/);
  assert.match(page, /Windows,\s+a Linux desktop without `bwrap`, a Mac whose sandbox is not usable — launches no agent/);
});

test("the page states the allowed list and that a host off it is refused", () => {
  assert.match(page, /allowed list/);
  assert.match(page, /A host outside that list is refused/);
});

test("the page states that a station without isolation or filter launches no agent, and no setting changes it", () => {
  assert.match(page, /launches no agent for that project/);
  assert.match(page, /No setting/);
});

test("the page explains the lethal trifecta and links the Simon Willison article", () => {
  assert.match(page, /lethal trifecta/);
  assert.match(page, /\]\(https:\/\/simonwillison\.net\/2025\/Jun\/16\/the-lethal-trifecta\/\)/);
});

test("the page does not name the variables that run a cook without isolation", () => {
  assert.doesNotMatch(page, /BRIGADE_SANDBOX_BIN/);
  assert.doesNotMatch(page, /BRIGADE_PROXY_PORT/);
});
