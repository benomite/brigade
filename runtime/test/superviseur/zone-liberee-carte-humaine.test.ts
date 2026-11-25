// #4243 acceptance — see zone-liberee-label.test.ts for the interface under test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLesZones, DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();

test("a stale human PR gets one chef card asking whether to close it, and a second cycle opens none", async () => {
  const creees: Array<{ title: string; body: string; labels: string[] }> = [];
  const fermes: number[] = [];
  const github = {
    labelliser: async () => undefined,
    fermerIssue: async (n: number) => void fermes.push(n),
    commenter: async () => undefined,
    creerIssue: async (c: { title: string; body: string; labels: string[] }) => (creees.push(c), creees.length + 900),
    ouvertes: async () => creees.map((c, i) => ({ number: i + 901, title: c.title, body: c.body, labels: c.labels, state: "open" })),
  } as never;
  const zones = ouvrirLesZones({ github, maintenant: () => MAINTENANT });
  const bloques = [{ ticket: 10, pr: { number: 90, auteur: "human", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false } }];
  await zones.cycle(bloques);
  assert.equal(creees.length, 1);
  assert.ok(creees[0]?.labels.includes("chef-todo"));
  const texte = `${creees[0]?.title} ${creees[0]?.body}`;
  assert.match(texte, /#90/);
  assert.match(texte, /close/i);
  assert.deepEqual(fermes, []);
  await zones.cycle(bloques);
  await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle(bloques);
  assert.equal(creees.length, 1, "once per PR, not at each cycle");
});
