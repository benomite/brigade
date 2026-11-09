// Les services locaux qu'un projet déclare : le bac à sable du cook ouvre
// exactement leur hôte et leur port, et rien d'autre.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configurer, type Cook } from "../../src/bac-a-sable/configuration.ts";
import { dansLeBacASableLocal } from "../../src/bac-a-sable/local.ts";
import { reglesDuProjet } from "../../src/reseau.ts";
import { lireServicesLocaux, servicesDuDepot } from "../../src/sandbox/services-locaux.ts";

const projet = (declaration?: string): Cook => ({
  worktree: "/Users/chef/brigade-wt/3055-x",
  caches: [],
  hotes: reglesDuProjet([]),
  home: "/Users/chef",
  ...(declaration === undefined ? {} : { services: servicesDuDepot(() => declaration) }),
});
const domaines = (cook: Cook) => configurer(cook).reglages.sandbox.network.allowedDomains;

test("un projet qui déclare Postgres sur localhost:5432 : le bac à sable le joint, et pas un autre port", () => {
  const ouverts = domaines(projet("localhost:5432\n"));
  assert.ok(ouverts.includes("localhost:5432"));
  assert.equal(ouverts.includes("localhost:5433"), false);
  assert.equal(ouverts.includes("localhost"), false);
  assert.equal(ouverts.includes("127.0.0.1:5432"), false);
});

test("un projet sans service local a les règles d'aujourd'hui, octet pour octet", () => {
  const aujourdhui = JSON.stringify(configurer(projet()).reglages);
  assert.equal(JSON.stringify(configurer(projet("")).reglages), aujourdhui);
  assert.equal(JSON.stringify(configurer(projet("# rien\n")).reglages), aujourdhui);
  assert.equal(JSON.stringify(configurer({ ...projet(), services: [] }).reglages), aujourdhui);
});

test("la déclaration : commentaires, doublons, lignes invalides écartées et dites", () => {
  const { services, problemes } = lireServicesLocaux("# pg\nLocalhost:5432\nlocalhost:5432\n127.0.0.1:6379\nexemple.com:5432\nlocalhost:0\nlocalhost:70000\nlocalhost\n");
  assert.deepEqual(services, [
    { hote: "localhost", port: 5432 },
    { hote: "127.0.0.1", port: 6379 },
  ]);
  assert.equal(problemes.length, 4);
  assert.match(problemes[0]!, /ligne 5/);
});

test("déclaration absente ou illisible : aucun service, rien ne s'ouvre", () => {
  assert.deepEqual(servicesDuDepot(() => null), []);
  assert.deepEqual(servicesDuDepot(() => undefined), []);
  assert.deepEqual(
    servicesDuDepot(() => {
      throw new Error("illisible");
    }),
    [],
  );
});

test("au lancement d'un cook, le bac à sable local relit les services du dépôt", () => {
  let declaration = "localhost:5432\n";
  const bac = { version: "x", home: "/Users/chef", caches: [], hotes: () => reglesDuProjet([]), services: () => servicesDuDepot(() => declaration) };
  const args = ["-p", "--permission-mode", "bypassPermissions", "--setting-sources", "project"];
  const reglages = (a: string[]) => a[a.indexOf("--settings") + 1]!;
  assert.match(reglages(dansLeBacASableLocal(bac, args, "/Users/chef/brigade-wt/1-x")), /"localhost:5432"/);
  declaration = "";
  assert.doesNotMatch(reglages(dansLeBacASableLocal(bac, args, "/Users/chef/brigade-wt/1-x")), /localhost/);
});
