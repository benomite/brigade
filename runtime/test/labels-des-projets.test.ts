import assert from "node:assert/strict";
import { test } from "node:test";
import { garantirLabelsDesProjets } from "../src/labels-des-projets.ts";
import type { ClientGitHub } from "../src/proteger-branche.ts";

test("an unreadable label list creates nothing and is reported, the other projects still get the label (#4173)", async () => {
  const crees: string[] = [];
  const client = (depot: string): ClientGitHub => async (requete) => {
    if (depot === "o/ko") return { statut: 500, corps: null, scopes: null };
    if (requete.methode === "GET") return { statut: 200, corps: [], scopes: null };
    crees.push(depot);
    return { statut: 201, corps: {}, scopes: null };
  };
  await assert.rejects(garantirLabelsDesProjets({ projets: [{ github: "o/ko" }, { github: "o/ok" }], client }), /o\/ko/);
  assert.deepEqual(crees, ["o/ok"]);
});

test("a creation GitHub refuses is reported (#4173)", async () => {
  const client = (): ClientGitHub => async (requete) => (requete.methode === "GET" ? { statut: 200, corps: [], scopes: null } : { statut: 403, corps: null, scopes: null });
  await assert.rejects(garantirLabelsDesProjets({ projets: [{ github: "o/a" }], client }), /not created/);
});
