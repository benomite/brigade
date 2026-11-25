// #4214, critère 3 : chaque famille de cause donne un état et une cause d'une phrase qui la nomme.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnostiquer } from "../../src/panne/index.ts";

const sain = { rail: { mainRouge: false, boucleDeRelance: false }, stations: [{ nom: "A", enMarche: true }], tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: false, enAttente: false }] };
const uneSeulePhrase = (s: string) => s.trim().length > 0 && !/[.!?]\s+\S/.test(s.trim()) && !s.includes("\n");

const cas: Array<[string, unknown, "fault" | "idle", RegExp]> = [
  ["red main branch", { ...sain, rail: { mainRouge: true, boucleDeRelance: false } }, "fault", /main/i],
  ["relaunch loop", { ...sain, rail: { mainRouge: false, boucleDeRelance: true } }, "fault", /relaunch|loop/i],
  ["station down", { ...sain, stations: [{ nom: "A", enMarche: false }] }, "fault", /station/i],
  ["open decision", { ...sain, tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: true, enAttente: false }] }, "idle", /decision/i],
  ["hold", { ...sain, tickets: [{ numero: 1, labels: ["fire"], decisionOuverte: false, enAttente: true }] }, "idle", /hold/i],
];

for (const [nom, entree, etat, motif] of cas) {
  test(`${nom}: ${etat}, one sentence naming the cause`, () => {
    const r = diagnostiquer(entree as never);
    assert.equal(r.state, etat);
    assert.ok(uneSeulePhrase(r.cause), `one sentence: ${r.cause}`);
    assert.match(r.cause, motif);
  });
}
