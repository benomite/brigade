// The brigade plugin published from main (#4525): `.claude-plugin/` of the repository, the one a user installs with
// `/plugin marketplace add benomite/brigade`. It carries `/brigade:start`, `/brigade:ask`, `/brigade:ticket` (#4526) and `/brigade:todo` (#4527), nothing of V1, no agent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const catalog = JSON.parse(read(".claude-plugin/marketplace.json"));
const FRENCH = /[éèêàùç]|\b(le|la|les|des|du|et|une?)\b/i;

test("the published plugin: English description, version past V1, /brigade:start, /brigade:ask, /brigade:ticket and /brigade:todo only, no agent", () => {
  assert.equal(plugin.name, "brigade");
  assert.match(plugin.description, /^You decide\. The kitchen ships\. \S/);
  assert.doesNotMatch(plugin.description, FRENCH);
  const [major = 0, minor = 0] = String(plugin.version).split(".").map(Number);
  assert.ok(major > 0 || minor > 17, `version ${plugin.version} is not past V1's 0.17.0`);
  assert.deepEqual(plugin.commands, ["./commands/start.md", "./commands/ask.md", "./commands/ticket.md", "./commands/todo.md"]);
  // An empty list, not an absent key: without it, Claude Code loads every agents/*.md of the plugin's folder.
  assert.deepEqual(plugin.agents, []);
});

test("the marketplace publishes this plugin from the repository's own branch, in English, and still points V1 to v1-final", () => {
  assert.equal(catalog.name, "brigade");
  assert.deepEqual(catalog.plugins.map(({ name, source }: { name: string; source: string }) => ({ name, source })), [{ name: "brigade", source: "./" }]);
  assert.match(catalog.description, /main/);
  assert.match(catalog.description, /\/plugin marketplace add benomite\/brigade@v1-final/);
  for (const text of [catalog.description, ...catalog.plugins.map(({ description }: { description: string }) => description)]) assert.doesNotMatch(text, FRENCH);
});

test("/brigade:start reads only, checks gh and the repository, and names the newest app-v* build for each system", () => {
  const start = read("commands/start.md");
  const tools = start.match(/^allowed-tools: (.*)$/m)?.[1] ?? "";
  for (const tool of tools.split(", ")) assert.match(tool, /^Bash\((gh --version|gh auth status:\*|gh repo view:\*|gh release (list|view):\*|git (rev-parse|remote):\*|uname:\*)\)$/, tool);
  for (const needed of ["gh auth status", "git rev-parse --show-toplevel", "gh repo view", "app-v", "mac-arm64.dmg", "linux-x64.AppImage", "windows-x64-setup.exe", "**rail**", "**cook**", "**pass**", "**second**", "user's language"]) assert.ok(start.includes(needed), needed);
});

test("/brigade:ask is in English, answers in the user's language, and still only reads", () => {
  const ask = read("commands/ask.md");
  assert.doesNotMatch(ask.replace(/`[^`]*`/g, ""), /[éèêàùç]/);
  assert.match(ask, /user's language/);
  assert.match(ask, /Change nothing: no comment, no label, no commit\./);
});

test("the README tells how to install it from Claude Code", () => {
  const readme = read("README.md");
  const paragraph = readme.slice(readme.indexOf("**From Claude Code**"));
  assert.ok(readme.includes("**From Claude Code**"));
  assert.match(paragraph.split("\n")[0] ?? "", /`\/plugin marketplace add benomite\/brigade`, then `\/plugin install brigade@brigade`/);
});
