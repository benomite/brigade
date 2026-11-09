// #2868 : après un ticket de qualité ou de temps perdu servi, rien ne s'ouvre avant 20 tickets
// pris et mergés après son merge, et la mesure ne compte qu'eux.
import assert from "node:assert/strict";
import { test } from "node:test";
import { attentesDeLaDecision, direLesAttentes, lireLesAttentes, noterLesAttentes } from "../src/attente-des-tickets.ts";
import { MARQUE_QUALITE, TICKETS_A_ATTENDRE } from "../src/alerte-qualite.ts";
import type { QualiteDuTicket } from "../src/mesure-qualite.ts";
import { correctionDuTemps, MARQUE_CORRECTION, type GitHubDeLaCorrection } from "../src/temps-max/correction.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "./outils.ts";

type Issue = { number: number; corps: string; state: "open" | "closed" };

class FauxDepot {
  issues: Issue[] = [];
  github(): GitHubDeLaCorrection {
    return {
      issuesDepuis: async () => this.issues.map(({ number, corps, state }) => ({ number, body: corps, association: "OWNER", state })),
      creerIssue: async ({ corps }) => {
        const number = 3000 + this.issues.length;
        this.issues.push({ number, corps, state: "open" });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
    };
  }
}

const MAINTENANT = () => new Date("2026-11-08T12:00:00Z");
const DEBUT = Date.UTC(2026, 10, 8, 0);
const MIN = 60_000;
// Un ticket pris à `prise` ms, mergé 10 min après, qui a perdu `perdu` min à attendre sa prise.
const ticket = (numero: number, prise: number, perdu = 0): TempsTicket => ({
  ticket: numero,
  claimedAt: new Date(prise).toISOString(),
  mergedAt: new Date(prise + 10 * MIN).toISOString(),
  cuisson: 300,
  cuissonTests: 0,
  attentePasse: 0,
  revue: 0,
  ci: 0,
  merge: 0,
  perdu: { attente: perdu * 60, ratees: 0, renvois: 0 },
});
// `combien` tickets numérotés depuis `premier`, pris toutes les 15 min à partir de `debut`.
const serie = (premier: number, combien: number, debut: number, perdu = 0) => Array.from({ length: combien }, (_, rang) => ticket(premier + rang, debut + rang * 15 * MIN, perdu));
const renvoye: QualiteDuTicket = { renvois: ["criteria not met"], cooksRates: 0 };
const bien: QualiteDuTicket = { renvois: [], cooksRates: 0 };
const qualitesDe = (tickets: readonly TempsTicket[], q: (t: TempsTicket) => QualiteDuTicket) => new Map(tickets.map((t) => [t.ticket, q(t)] as const));

// 10 tickets renvoyés, avant le ticket de qualité 3000, servi (mergé) à `servie`.
const servieLe = DEBUT + 5 * 60 * MIN;
const avant = serie(1, 10, DEBUT);
const enregistrementsServis = [...avant, ticket(3000, servieLe - 10 * MIN)];

async function qualiteServie() {
  const depot = new FauxDepot();
  const lire = (enregistrements: TempsTicket[], q: (t: TempsTicket) => QualiteDuTicket) => () => ({ enregistrements, lostTimeMaxMin: 60, qualites: qualitesDe(enregistrements, q) });
  const premiere = await correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: lire(avant, () => renvoye), maintenant: MAINTENANT })();
  assert.deepEqual(premiere, { issue: "qualite", qualite: { issue: "ouverte", numero: 3000, causes: ["premier-coup"] } });
  await depot.github().fermerIssue(3000);
  return { depot, lire };
}

test("quality: fewer than 20 tickets taken after the served ticket's merge — nothing opens, and it says how many are missing", async () => {
  const { depot, lire } = await qualiteServie();
  const nouveaux = serie(100, TICKETS_A_ATTENDRE - 1, servieLe + MIN);
  const tous = [...enregistrementsServis, ...nouveaux];
  const decision = await correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: lire(tous, () => renvoye), maintenant: MAINTENANT })();
  assert.deepEqual(decision, { issue: "qualite", qualite: { issue: "en-attente", numero: 3000, manque: 1, causes: ["premier-coup"] } });
  assert.equal(depot.issues.length, 1);
  assert.deepEqual(direLesAttentes(attentesDeLaDecision(decision)), ["quality: waiting for 1 more merged tickets since #3000"]);
});

test("quality: 20 new tickets, all sent back — the next ticket opens and counts only them, never those the served one counted", async () => {
  const { depot, lire } = await qualiteServie();
  const nouveaux = serie(100, TICKETS_A_ATTENDRE, servieLe + MIN);
  const decision = await correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: lire([...enregistrementsServis, ...nouveaux], () => renvoye), maintenant: MAINTENANT })();
  assert.deepEqual(decision, { issue: "qualite", qualite: { issue: "ouverte", numero: 3001, causes: ["premier-coup"] } });
  const corps = depot.issues[1]?.corps ?? "";
  assert.ok(corps.includes(MARQUE_QUALITE));
  assert.match(corps, new RegExp(`<!-- brigade:qualite-comptes ${nouveaux.map((t) => t.ticket).join(",")} -->`));
  assert.match(corps, /Over the project's 20 recent merged tickets/);
});

test("quality: 20 new tickets that are fine — the old send-backs still in the window do not open anything", async () => {
  const { depot, lire } = await qualiteServie();
  const nouveaux = serie(100, TICKETS_A_ATTENDRE, servieLe + MIN);
  const decision = await correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: lire([...enregistrementsServis, ...nouveaux], (t) => (t.ticket >= 100 ? bien : renvoye)), maintenant: MAINTENANT })();
  assert.equal(decision.issue, "sous-le-seuil");
  assert.equal(depot.issues.length, 1);
});

test("lost time: fewer than 20 tickets after the served correction — it waits; with 20, it measures only them", async () => {
  const depot = new FauxDepot();
  const lents = serie(1, 10, DEBUT, 20);
  let enregistrements = lents;
  const corriger = correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10 }), maintenant: MAINTENANT });
  assert.equal((await corriger()).issue, "ouverte");
  await depot.github().fermerIssue(3000);
  const servie = new Date(servieLe).toISOString();
  enregistrements = [...lents, ticket(3000, servieLe - 10 * MIN)];
  // 19 tickets pris après son merge, tous lents : il en manque 1.
  enregistrements = [...enregistrements, ...serie(100, 19, servieLe + MIN, 20)];
  assert.deepEqual(await corriger([]), { issue: "a-l-essai", numero: 3000, servie, manque: 1, mediane: 20 * 60, seuilMin: 10 });
  assert.deepEqual(direLesAttentes(attentesDeLaDecision(await corriger([]))), ["lost time: waiting for 1 more merged tickets since #3000"]);
  assert.equal(depot.issues.length, 1);

  // 20 nouveaux tickets qui ne perdent rien, parmi les lents d'avant dans la fenêtre : la mesure ne compte qu'eux.
  enregistrements = [...lents, ticket(3000, servieLe - 10 * MIN), ...serie(100, 20, servieLe + MIN, 0)];
  assert.equal((await corriger([])).issue, "sous-le-seuil");
  assert.equal(depot.issues.length, 1);
  // 20 nouveaux tickets lents : la correction suivante s'ouvre.
  enregistrements = [...lents, ticket(3000, servieLe - 10 * MIN), ...serie(100, 20, servieLe + MIN, 20)];
  assert.deepEqual(await corriger([]), { issue: "ouverte", numero: 3001, mediane: 20 * 60, seuilMin: 10 });
  assert.ok(depot.issues[1]?.corps.includes(MARQUE_CORRECTION));
});

test("the waits are written for status, and a turn without wait clears them", (t) => {
  const dossier = repertoireTemporaire(t);
  assert.deepEqual(lireLesAttentes(dossier), { qualite: null, tempsPerdu: null });
  noterLesAttentes(dossier, { qualite: { manque: 7, dernier: 2866 }, tempsPerdu: null });
  assert.deepEqual(direLesAttentes(lireLesAttentes(dossier)), ["quality: waiting for 7 more merged tickets since #2866"]);
  noterLesAttentes(dossier, attentesDeLaDecision({ issue: "sous-le-seuil", mediane: null, seuilMin: 2 }));
  assert.deepEqual(direLesAttentes(lireLesAttentes(dossier)), []);
  assert.deepEqual(direLesAttentes(lireLesAttentes(undefined)), []);
});
