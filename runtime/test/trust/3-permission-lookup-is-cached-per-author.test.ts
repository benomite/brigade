// #4421, criterion 3: the permission lookup is cached per author.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerConfiance } from "../../src/trust/trust.ts";

test("asking twice about the same author looks the permission up once", async () => {
  const appels: string[] = [];
  const c = creerConfiance({
    chef: "benoit",
    permission: async (login: string) => {
      appels.push(login);
      return login === "alice" ? "write" : "none";
    },
  });
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("stranger"), false);
  assert.equal(await c.isTrusted("stranger"), false);
  assert.deepEqual(appels.toSorted(), ["alice", "stranger"]);
});

test("concurrent questions about the same author share one lookup", async () => {
  let appels = 0;
  const c = creerConfiance({ chef: "benoit", permission: async () => (appels++, "write") });
  const reponses = await Promise.all([c.isTrusted("alice"), c.isTrusted("alice"), c.isTrusted("alice")]);
  assert.deepEqual(reponses, [true, true, true]);
  assert.equal(appels, 1);
});
