// #4243 acceptance — see zone-liberee-label.test.ts for the interface under test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLesZones, DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();
const DIT = /zone.{0,20}released|released.{0,20}zone/i;

test("after a release, one line names the PR number and says the zone is released", async () => {
  const commentaires: Array<[number, string]> = [];
  const github = {
    labelliser: async () => undefined,
    fermerIssue: async () => undefined,
    commenter: async (n: number, corps: string) => void commentaires.push([n, corps]),
    creerIssue: async () => 900,
    ouvertes: async () => [],
  } as never;
  const lignes = await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: { number: 77, auteur: "brigade", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false } }]);
  const dites = commentaires.filter(([n]) => n === 10).map(([, corps]) => corps);
  assert.equal(dites.length, 1, "one line on the ticket");
  assert.match(dites[0] ?? "", /#77/);
  assert.match(dites[0] ?? "", DIT);
  assert.equal((dites[0] ?? "").trim().split("\n").length, 1);
  assert.equal(lignes.filter((ligne) => /#77/.test(ligne) && DIT.test(ligne)).length, 1, "and one in the report");
});
