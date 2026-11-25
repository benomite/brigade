// #4243 acceptance — see zone-liberee-label.test.ts for the interface under test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirLesZones, DELAI_PERIME_MS } from "../../src/superviseur/zone-liberee.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const ancien = new Date(MAINTENANT.getTime() - DELAI_PERIME_MS - 60_000).toISOString();
const recent = new Date(MAINTENANT.getTime() - 60_000).toISOString();
const pr = (number: number, autres: Record<string, unknown> = {}) => ({ number, auteur: "human", miseAJour: ancien, enCook: false, auPass: false, surLaBase: false, ...autres });

function fauxClient() {
  const f = { labels: [] as Array<[number, string[]]>, fermes: [] as number[], commentaires: [] as Array<[number, string]>, creees: [] as Array<{ title: string; body: string; labels: string[] }> };
  const github = {
    labelliser: async (n: number, labels: string[]) => void f.labels.push([n, labels]),
    fermerIssue: async (n: number) => void f.fermes.push(n),
    commenter: async (n: number, corps: string) => void f.commentaires.push([n, corps]),
    creerIssue: async (c: { title: string; body: string; labels: string[] }) => (f.creees.push(c), f.creees.length + 900),
    ouvertes: async () => [],
  };
  return { f, github: github as never };
}

test("a PR that is alive gets nothing: no label, no line, no card, no close", async () => {
  for (const vivante of [pr(80, { enCook: true }), pr(81, { auPass: true }), pr(82, { miseAJour: recent })]) {
    const { f, github } = fauxClient();
    const lignes = await ouvrirLesZones({ github, maintenant: () => MAINTENANT }).cycle([{ ticket: 10, pr: vivante }]);
    assert.deepEqual([f.labels, f.fermes, f.commentaires, f.creees, lignes], [[], [], [], [], []], `PR #${vivante.number}`);
  }
});
