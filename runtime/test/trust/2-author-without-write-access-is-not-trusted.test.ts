// #4421, criterion 2: an author without write access is not trusted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerConfiance } from "../../src/trust/trust.ts";

for (const permission of ["read", "triage", "none"]) {
  test(`an author whose permission is "${permission}" is not trusted`, async () => {
    const c = creerConfiance({ chef: "benoit", permission: async () => permission });
    assert.equal(await c.isTrusted("stranger"), false);
  });
}

test("a trusted author does not make another one trusted", async () => {
  const c = creerConfiance({ chef: "benoit", permission: async (login: string) => (login === "alice" ? "write" : "none") });
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("stranger"), false);
});
