// #4243 acceptance. The supervisor releases a zone held by a stale PR (`src/superviseur/zone-liberee.ts`):
// `ouvrirLesZones({ github, maintenant })` gives `cycle(bloques)`, run once per supervisor cycle.
// `bloques`: the skipped tickets blocked by a PR — `{ ticket, pr: { number, auteur, miseAJour, enCook, auPass, surLaBase } }`
// (`auteur`: "human" | "brigade"). `cycle` resolves to the lines of the report. The client is a fake that records its writes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLesZones, DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 60_000).toISOString();
const pr = (number: number, autres: Record<string, unknown> = {}) => ({ number, auteur: "brigade", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false, ...autres });

function fauxClient() {
  const f = { labels: [] as Array<[number, string[]]>, fermes: [] as number[], commentaires: [] as Array<[number, string]>, creees: [] as Array<{ title: string; body: string; labels: string[] }> };
  const github = {
    labelliser: async (n: number, labels: string[]) => void f.labels.push([n, labels]),
    fermerIssue: async (n: number) => void f.fermes.push(n),
    commenter: async (n: number, corps: string) => void f.commentaires.push([n, corps]),
    creerIssue: async (c: { title: string; body: string; labels: string[] }) => (f.creees.push(c), f.creees.length + 900),
    ouvertes: async () => f.creees.map((c, i) => ({ number: i + 901, title: c.title, body: c.body, labels: c.labels, state: "open" })),
  };
  return { f, github: github as never };
}

test("a stale PR that blocks a ticket gets the label zone-released, and is not closed", async () => {
  const { f, github } = fauxClient();
  await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: pr(77) }]);
  assert.ok(f.labels.some(([n, labels]) => n === 77 && labels.includes("zone-released")));
  assert.deepEqual(f.fermes, []);
  const autre = fauxClient();
  await ouvrirLesZones({ github: autre.github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: pr(78, { miseAJour: recent, surLaBase: true }) }]);
  assert.ok(autre.f.labels.some(([n, labels]) => n === 78 && labels.includes("zone-released")), "changes already on the base make it stale too");
  assert.deepEqual(autre.f.fermes, []);
});
