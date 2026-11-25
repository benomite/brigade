// #4243 acceptance — see zone-liberee-label.test.ts for the interface under test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLesZones, DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();

test("a stale brigade PR is released without any chef card", async () => {
  const labels: Array<[number, string[]]> = [];
  const creees: unknown[] = [];
  const github = {
    labelliser: async (n: number, l: string[]) => void labels.push([n, l]),
    fermerIssue: async () => undefined,
    commenter: async () => undefined,
    creerIssue: async (c: unknown) => (creees.push(c), 900),
    ouvertes: async () => [],
  } as never;
  await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: { number: 91, auteur: "brigade", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false } }]);
  assert.ok(labels.some(([n, l]) => n === 91 && l.includes("zone-released")), "released");
  assert.deepEqual(creees, []);
});
