// #4260 (règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) : un ticket se parque à chacune des trois
// étapes — au backlog, en cuisson (`taken`), à la pass (`in-pass`) — et reprend exactement où il était : à sa date
// (le tour de la station, `ramenerALaRelance`), quand son fait arrive (`parked arrived`), quand la personne répond
// (`parked resume`). Avant, rien ne l'en sort : ni une date qui n'est pas la sienne, ni une date pour un fait ou le chef.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cestArriveGitHub, mettreEnAttenteGitHub, reprendreGitHub } from "../../src/attente-github/attente-github.ts";
import { ramenerALaRelance } from "../../src/attente/attente-par-le-cook.ts";
import { estParque, etatDuTicket } from "../../src/github-etat/etats.ts";
import { fauxGitHub, issue } from "../aides/cuisine.ts";

const MAINTENANT = new Date("2026-11-25T10:00:00.000Z");
const JOUR = 24 * 3_600_000;
const DEPOT = "acme/shop";
const TICKET = 40;
const PR_OUVERTE = { state: "open" as const, merged: false };

// Les trois étapes, par leurs labels : au backlog, en cuisson, à la pass.
const ETAPES = [
  { etape: "backlog", labels: ["fire", "model:opus", "effort:medium"] },
  { etape: "being cooked", labels: ["fire", "model:opus", "effort:medium", "taken"] },
  { etape: "at the pass", labels: ["fire", "model:opus", "effort:medium", "in-pass"] },
];

function ticketA(labels: string[]) {
  const faux = fauxGitHub(issue(TICKET, [...labels]));
  const labelsDu = () => [...(faux.lire(TICKET)?.labels ?? [])];
  // Son étape, lue comme la station la lit, et s'il est parqué : rien ne le prend (`estParque`).
  const etat = () => etatDuTicket({ state: "open", labels: labelsDu(), pr: PR_OUVERTE });
  const parque = () => estParque(labelsDu());
  // Un tour de station à cet instant : ce que `ramenerALaRelance` fait reprendre.
  const tour = (instant: Date) => ramenerALaRelance(faux.github, [{ number: TICKET, labels: labelsDu() }], { station: "box/claude", maintenant: instant, avertir: () => {} });
  return { faux, labelsDu, etat, parque, tour };
}

for (const { etape, labels } of ETAPES) {
  describe(`a ticket parked ${etape}`, () => {
    test("parked until a date: it is parked, a turn before the date leaves it parked, and at its date it resumes at the same step", async () => {
      const t = ticketA(labels);
      const avant = t.etat();
      await mettreEnAttenteGitHub(t.faux.github, { depot: DEPOT, numero: TICKET }, { quoi: "the signed quote", qui: "the client", relance: "2d" }, MAINTENANT);
      assert.equal(t.parque(), true);
      assert.deepEqual(await t.tour(new Date(MAINTENANT.getTime() + JOUR)), []);
      assert.equal(t.parque(), true);
      assert.deepEqual(await t.tour(new Date(MAINTENANT.getTime() + 2 * JOUR)), [TICKET]);
      assert.deepEqual(t.labelsDu(), labels);
      assert.equal(t.parque(), false);
      assert.equal(t.etat(), avant);
    });

    test("parked until a fact: no date resumes it; when the fact is said to have happened, it resumes at the same step", async () => {
      const t = ticketA(labels);
      const avant = t.etat();
      await mettreEnAttenteGitHub(t.faux.github, { depot: DEPOT, numero: TICKET }, { quoi: "the API key", qui: "the client", fait: "the client sends the key" }, MAINTENANT);
      assert.deepEqual(await t.tour(new Date(MAINTENANT.getTime() + 30 * JOUR)), []);
      assert.equal(t.parque(), true);
      assert.deepEqual(await cestArriveGitHub(t.faux.github, { depot: DEPOT, numero: TICKET }), ["parked"]);
      assert.deepEqual(t.labelsDu(), labels);
      assert.equal(t.parque(), false);
      assert.equal(t.etat(), avant);
    });

    test("parked for the chef: no date resumes it; when the chef answers, it resumes at the same step", async () => {
      const t = ticketA(labels);
      const avant = t.etat();
      await mettreEnAttenteGitHub(t.faux.github, { depot: DEPOT, numero: TICKET }, { quoi: "which column order the export keeps", qui: "the chef" }, MAINTENANT);
      assert.equal(t.parque(), true);
      assert.deepEqual(await t.tour(new Date(MAINTENANT.getTime() + 30 * JOUR)), []);
      assert.equal(t.parque(), true);
      assert.deepEqual(await reprendreGitHub(t.faux.github, { depot: DEPOT, numero: TICKET }), ["chef-todo"]);
      assert.deepEqual(t.labelsDu(), labels);
      assert.equal(t.parque(), false);
      assert.equal(t.etat(), avant);
    });
  });
}
