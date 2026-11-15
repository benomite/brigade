// Une alerte de mesure par cause (#3613) : tant que la dérive dure, l'issue ouverte
// se met à jour au lieu de s'ouvrir une seconde fois ; sous le seuil, elle le dit et
// se ferme ; la dérive qui revient en ouvre une qui nomme la précédente.
import assert from "node:assert/strict";
import { test } from "node:test";
import { porteDeQualite } from "../src/alerte-qualite.ts";
import { routerLeTempsPerdu } from "../src/routage-temps-perdu.ts";
import { mesurerQualite, type QualiteDuTicket } from "../src/mesure-qualite.ts";
import { correctionDuTemps, MARQUE_CORRECTION, type GitHubDeLaCorrection } from "../src/temps-max/correction.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

type Issue = { number: number; corps: string; state: "open" | "closed"; commentaires: string[] };

class FauxDepot {
  issues: Issue[] = [];
  ecritures = 0;
  echecEcriture = false;
  github(): GitHubDeLaCorrection {
    return {
      issuesDepuis: async () => this.issues.map(({ number, corps, state }) => ({ number, body: corps, association: "OWNER", state })),
      creerIssue: async ({ corps }) => {
        const number = 3000 + this.issues.length;
        this.issues.push({ number, corps, state: "open", commentaires: [] });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
      ecrireCorps: async (numero, corps) => {
        if (this.echecEcriture) throw new Error("GitHub said 502");
        this.ecritures += 1;
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.corps = corps;
      },
      commenter: async (numero, corps) => {
        this.issues.find((i) => i.number === numero)?.commentaires.push(corps);
      },
    };
  }
  ouvertes = () => this.issues.filter((i) => i.state === "open");
}

const lents = (...minutes: number[]): TempsTicket[] => minutes.map((attente, rang) => ({ ticket: rang + 1, attentePrise: attente * 60, cuisson: 5 * 60, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
const heure = (h: number) => () => new Date(Date.UTC(2026, 10, 15, h));

test("time lost: while the drift lasts the open alert is updated with the latest value, the previous ones and the trend, never a second issue", async () => {
  const depot = new FauxDepot();
  let enregistrements = lents(30, 30, 30);
  let h = 8;
  const corriger = correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: () => heure(h)() });
  assert.equal((await corriger()).issue, "ouverte");
  enregistrements = lents(45, 45, 45);
  h = 9;
  assert.equal((await corriger()).issue, "deja-ouverte");
  enregistrements = lents(60, 60, 60);
  h = 10;
  assert.equal((await corriger([3000])).issue, "deja-ouverte");
  assert.equal(depot.issues.length, 1);
  const [alerte] = depot.issues;
  assert.ok(alerte?.corps.includes("now: **60 min**"));
  assert.ok(alerte?.corps.includes("previous: 45 min (2026-11-15T09:00Z), 30 min (2026-11-15T08:00Z)"));
  assert.ok(alerte?.corps.includes("trend: getting worse"));
  assert.ok(alerte?.corps.includes("top reason now: "));
  assert.ok(alerte?.corps.includes(MARQUE_CORRECTION));
  // Même mesure : rien n'est relu ni réécrit.
  const avant = depot.ecritures;
  await corriger([3000]);
  assert.equal(depot.ecritures, avant);
});

test("time lost: back under the threshold, the alert says so and closes; the drift coming back opens a new one that links it", async () => {
  const depot = new FauxDepot();
  let enregistrements = lents(30, 30, 30);
  const corriger = correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: heure(8) });
  await corriger();
  enregistrements = lents(0, 0, 0);
  assert.equal((await corriger([3000])).issue, "sous-le-seuil");
  assert.equal(depot.issues[0]?.state, "closed");
  assert.match(depot.issues[0]?.commentaires[0] ?? "", /Back under the threshold: Median lost time per ticket is 0 min, against a threshold of 2 min/);
  enregistrements = lents(30, 30, 30);
  assert.equal((await corriger([])).issue, "ouverte");
  assert.equal(depot.ouvertes().length, 1);
  assert.match(depot.issues[1]?.corps ?? "", /Previous alert on this measure: #3000 \(closed\)/);
});

test("time lost: an update that fails is said, the decision still stands and the next turn retries", async () => {
  const depot = new FauxDepot();
  let enregistrements = lents(30, 30, 30);
  const dits: string[] = [];
  const corriger = correctionDuTemps({ echantillonMin: 1, github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: heure(8), avertir: (m) => dits.push(m) });
  await corriger();
  enregistrements = lents(45, 45, 45);
  depot.echecEcriture = true;
  assert.equal((await corriger([3000])).issue, "deja-ouverte");
  assert.match(dits[0] ?? "", /could not be updated with the latest measure — GitHub said 502/);
  depot.echecEcriture = false;
  await corriger([3000]);
  assert.ok(depot.issues[0]?.corps.includes("now: **45 min**"));
});

// 10 tickets, `bons` du premier coup.
const qualites = (bons: number): Map<number, QualiteDuTicket> => new Map(Array.from({ length: 10 }, (_, i) => [i + 1, i < bons ? { renvois: [], cooksRates: 0 } : { renvois: ["criteria not met"], cooksRates: 0 }]));
const mesure = (bons: number) => mesurerQualite(lents(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), qualites(bons), undefined);

test("quality: one open alert updated with the latest rate and its trend; back over the threshold it closes, and the next one links it", async () => {
  const depot = new FauxDepot();
  const porte = porteDeQualite({ github: depot.github(), echantillonMin: 1, maintenant: heure(8) });
  assert.equal((await porte(mesure(6)))?.issue, "ouverte");
  assert.equal((await porte(mesure(5)))?.issue, "deja-ouverte");
  assert.equal(depot.issues.length, 1);
  const corps = depot.issues[0]?.corps ?? "";
  assert.ok(corps.includes("now: **50%**, against a threshold of 70%"));
  assert.ok(corps.includes("previous: 60%"));
  assert.ok(corps.includes("trend: getting worse"));
  assert.ok(corps.includes("top reason now: criteria not met"));
  assert.equal(await porte(mesure(9), [3000]), null);
  assert.equal(depot.issues[0]?.state, "closed");
  assert.match(depot.issues[0]?.commentaires[0] ?? "", /First-try rate is 90%, against a threshold of 70%/);
  assert.equal((await porte(mesure(4), []))?.issue, "ouverte");
  assert.equal(depot.ouvertes().length, 1);
  assert.match(depot.issues[1]?.corps ?? "", /Previous alert on this measure: #3000 \(closed\)/);
});

test("on a served project the update and the closing go to the brigade's repo, where the alert lives", async () => {
  const brigade = new FauxDepot();
  const projet = new FauxDepot();
  const routee = routerLeTempsPerdu({ github: projet.github(), servi: "benomite/espace", brigade: brigade.github(), maintenant: heure(8) });
  let enregistrements = lents(30, 30, 30);
  const corriger = correctionDuTemps({ echantillonMin: 1, github: routee, lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: heure(8) });
  assert.equal((await corriger()).issue, "ouverte");
  enregistrements = lents(45, 45, 45);
  await corriger([3000]);
  assert.ok(brigade.issues[0]?.corps.includes("now: **45 min**"));
  enregistrements = lents(0, 0, 0);
  await corriger([3000]);
  assert.equal(brigade.issues[0]?.state, "closed");
  assert.equal(projet.issues.length, 0);
});
