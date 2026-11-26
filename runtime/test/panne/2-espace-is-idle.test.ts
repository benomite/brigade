// #4214, critère 2 : la situation d'espace (trois `fire`, aucun faisable) est `idle`, pas une panne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnostiquer } from "../../src/outage/index.ts";

test("three fire tickets, none workable (one decision waiting on the client, two on hold), is idle", () => {
  const r = diagnostiquer({
    rail: { mainRouge: false, boucleDeRelance: false },
    stations: [{ nom: "A", enMarche: true }],
    tickets: [
      { numero: 1, labels: ["fire"], decisionOuverte: true, enAttenteDe: "client", enAttente: false },
      { numero: 2, labels: ["fire"], decisionOuverte: false, enAttente: true },
      { numero: 3, labels: ["fire"], decisionOuverte: false, enAttente: true },
    ],
  });
  assert.equal(r.state, "idle");
  assert.match(r.cause, /nothing to cook: 3 tickets wait on you or on a third party/);
});
