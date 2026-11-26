import assert from "node:assert/strict";
import { test } from "node:test";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
import { dansLeModeRestreint } from "../../src/bac-a-sable/restreint.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { REGLES_DE_BASE } from "../../src/reseau.ts";

const cook = { worktree: "/Users/chef/wt/1", caches: ["/Users/chef/cache"], hotes: REGLES_DE_BASE, home: "/Users/chef" };
const calibre = { model: "sonnet", effort: "medium" } as never;

test("restricted mode: dontAsk, no bypass, no kernel sandbox, reads denied, network on the host list, Bash open", () => {
  const args = dansLeModeRestreint(argumentsClaude(calibre), cook);
  assert.ok(!args.includes("bypassPermissions"));
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  const reglages = JSON.parse(args[args.indexOf("--settings") + 1] as string);
  assert.equal(reglages.sandbox, undefined);
  for (const entree of LECTURES_INTERDITES) assert.ok(reglages.permissions.deny.includes(`Read(//Users/chef/${entree})`), entree);
  assert.ok(reglages.permissions.allow.includes("WebFetch(domain:github.com)"));
  assert.ok(!reglages.permissions.allow.some((regle: string) => regle.includes("evil.example")));
  assert.ok(reglages.permissions.allow.includes("Bash"));
  assert.ok(reglages.permissions.allow.includes("Edit(//Users/chef/cache/**)"));
  assert.ok(reglages.permissions.deny.includes("WebSearch"));
  assert.match(args[args.indexOf("--disallowedTools") + 1] ?? "", /git push.*|gh pr merge/);
});

test("restricted mode refuses a relative home rather than guessing", () => {
  assert.throws(() => dansLeModeRestreint(argumentsClaude(calibre), { ...cook, home: "" }));
});

test("restricted mode takes Windows paths: the rules name them the way claude reads them", () => {
  const args = dansLeModeRestreint(argumentsClaude(calibre), { ...cook, worktree: "C:\\Users\\chef\\wt\\1", caches: ["C:\\Users\\chef\\cache"], home: "C:\\Users\\chef" });
  const reglages = JSON.parse(args[args.indexOf("--settings") + 1] as string);
  assert.ok(reglages.permissions.deny.includes("Read(//c/Users/chef/.ssh)"));
  assert.ok(reglages.permissions.allow.includes("Edit(//c/Users/chef/cache/**)"));
});
