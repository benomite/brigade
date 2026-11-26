// #4421: what the trust check does beyond its criteria — a lookup that fails decides nothing and is
// asked again, logins compare without case, an empty author is never looked up.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerConfiance, peutEcrire } from "../../src/trust/trust.ts";

test("a failed permission lookup fails the question, is not cached, and is asked again next time", async () => {
  let appels = 0;
  const c = creerConfiance({
    chef: "benoit",
    permission: async () => {
      appels++;
      if (appels === 1) throw new Error("HTTP 502");
      return "write";
    },
  });
  await assert.rejects(c.isTrusted("alice"), /HTTP 502/);
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(appels, 2);
});

test("the chef and the cache compare logins without case, as GitHub does", async () => {
  const appels: string[] = [];
  const c = creerConfiance({ chef: "Benoit", permission: async (login) => (appels.push(login), "none") });
  assert.equal(await c.isTrusted("benoit"), true);
  assert.equal(await c.isTrusted("Stranger"), false);
  assert.equal(await c.isTrusted("stranger"), false);
  assert.deepEqual(appels, ["Stranger"]);
});

test("without a resolved chef, the permission alone decides", async () => {
  const c = creerConfiance({ chef: null, permission: async (login) => (login === "alice" ? "admin" : "read") });
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("benoit"), false);
});

test("an empty author is not trusted, and is never looked up", async () => {
  let appels = 0;
  const c = creerConfiance({ chef: "benoit", permission: async () => (appels++, "write") });
  assert.equal(await c.isTrusted(""), false);
  assert.equal(await c.isTrusted("  "), false);
  assert.equal(appels, 0);
});

test("only admin, maintain and write can write", () => {
  for (const droit of ["admin", "maintain", "write"]) assert.equal(peutEcrire(droit), true, droit);
  for (const droit of ["triage", "read", "none", "", undefined]) assert.equal(peutEcrire(droit), false, String(droit));
});
