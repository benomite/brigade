// #4421, criterion 1: the chef, a collaborator with write access and a kitchen agent are trusted.
// Contract: `creerConfiance({ chef, permission })` returns `{ isTrusted(author): Promise<boolean> }`;
// `permission(login)` is the GitHub collaborator-permission lookup ("admin" | "maintain" | "write" | "triage" | "read" | "none").
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerConfiance } from "../../src/trust/trust.ts";

const permissions: Record<string, string> = { alice: "write", maxime: "maintain", root: "admin" };
const confiance = () => creerConfiance({ chef: "benoit", permission: async (login: string) => permissions[login] ?? "none" });

test("the chef is trusted", async () => {
  assert.equal(await confiance().isTrusted("benoit"), true);
});

test("a collaborator with write access is trusted", async () => {
  const c = confiance();
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("maxime"), true);
  assert.equal(await c.isTrusted("root"), true);
});

test("a kitchen agent is trusted", async () => {
  const c = confiance();
  assert.equal(await c.isTrusted("github-actions[bot]"), true);
  assert.equal(await c.isTrusted("github-actions"), true);
});
