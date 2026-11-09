// Le tour d'une station GitHub seul ouvre le ticket de correction du temps des
// tickets (#2515), lu dans le clone du projet, et un seul.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationGitHub } from "../../src/brigade-github.ts";
import { MARQUE_CORRECTION } from "../../src/temps-max/correction.ts";
import { DEPOT_BRIGADE } from "../../src/routage-temps-perdu.ts";
import { fauxDuTour, stationQuiTourne } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

function clone(tc: TestContext, minutes: number[], projet: object = {}): string {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), JSON.stringify(projet));
  // Des tickets qui ont attendu leur prise `minutes`, puis cuit 10 min.
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify(minutes.map((m, rang) => ({ ticket: rang + 1, attentePrise: m * 60, cuisson: 600, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }))));
  return depot;
}

// Vingt et un tickets, 7 de chaque : le minimum d'une mesure est de 20 (#3012), la médiane reste 18.
const vingtEtUn = Array.from({ length: 21 }, (_, rang) => [12, 18, 25][rang % 3] ?? 0);

test("over the lost-time threshold, the station's turn opens one prio:0 correction ticket, and no second one while it is open", async (tc) => {
  const { issues, github } = fauxDuTour();
  const avertis: string[] = [];
  const s = stationQuiTourne(github, clone(tc, vingtEtUn), avertis);
  await s.tour();
  await s.tour();
  await stationQuiTourne(github, clone(tc, vingtEtUn), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.labels.includes("prio:0"));
  assert.ok(issues[0]?.body.startsWith(MARQUE_CORRECTION));
  assert.match(issues[0]?.body ?? "", /is \*\*18 min\*\*: over the project's threshold of 2 min/);
});

test("the project's own threshold holds: under it, the turn opens nothing", async (tc) => {
  const { issues, github } = fauxDuTour();
  const avertis: string[] = [];
  await stationQuiTourne(github, clone(tc, [12, 18, 25], { lostTimeMaxMin: 20 }), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 0);
});

// #2580 : rouverte deux minutes après le merge de #2577 (12 h 10 UTC), par une
// station qui tournait encore le code d'avant lui — sa mise à jour vient bien
// plus tard. Le même tour, au code d'aujourd'hui, n'ouvre rien : les 61
// tickets récents ont tous été pris avant ce merge.
test("#2580: the turn right after a correction is served opens nothing while the recent tickets were all claimed before its merge", async (tc) => {
  const { issues, github } = fauxDuTour();
  issues.push({ number: 2577, title: "Tickets take too long", body: `${MARQUE_CORRECTION}\n`, labels: ["fire", "prio:0"], state: "closed" });
  const servie = Date.parse("2026-11-06T12:10:34Z");
  const ticket = (numero: number, prise: number, minutes: number) => ({ ticket: numero, claimedAt: new Date(prise).toISOString(), mergedAt: new Date(prise + minutes * 60_000).toISOString(), cuisson: minutes * 60, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });
  const avant = Array.from({ length: 60 }, (_, rang) => ticket(2500 + rang, servie - (24 - rang * 0.38) * 60 * 60_000, 11));
  const depot = clone(tc, []);
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), JSON.stringify([...avant, ticket(2577, servie - 50 * 60_000, 50)]));
  const avertis: string[] = [];
  await stationQuiTourne(github, depot, avertis).tour();
  assert.deepEqual(avertis, []);
  assert.deepEqual(issues.map((i) => i.number), [2577]);
});

// #2979 : sur le dépôt de la brigade, #2963 (qualité) mergé par une autre station n'est pas dans
// les temps de celle-ci. Fermé par sa PR mergée, il est servi à sa fermeture : le tour attend
// 20 tickets pris après lui, et ne rouvre rien sur les renvois qu'il a comptés.
test("#2979: on benomite/brigade, the turn waits after a quality ticket another station merged, and opens nothing on the send-backs it counted", async (tc) => {
  const { issues, github } = fauxDuTour();
  issues.push({ number: 2963, title: "Quality before time", body: "<!-- brigade:qualite -->\n<!-- brigade:qualite-comptes 1,2,3,4,5,6,7,8,9 -->", labels: ["fire", "prio:0"], state: "closed" });
  const fermee = "2026-11-08T11:00:00Z";
  const lu = github as unknown as Record<string, unknown>;
  const issuesDepuis = lu.issuesDepuis as () => Promise<{ number: number; state: string }[]>;
  lu.issuesDepuis = async () => (await issuesDepuis()).map((issue) => (issue.number === 2963 ? { ...issue, closedAt: fermee } : issue));
  lu.prQuiFerme = async (numero: number) => (numero === 2963 ? { number: 2978, merged: true } : null);
  const depot = clone(tc, []);
  const ticket = (numero: number, prise: string) => ({ ticket: numero, claimedAt: prise, mergedAt: prise.replace(/:00Z$/, ":10Z"), attentePrise: 0, cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, qualite: { renvois: ["the PR conflicts with the base"], cooksRates: 0 } });
  const temps = [...Array.from({ length: 9 }, (_, rang) => ticket(rang + 1, `2026-11-08T0${rang}:00:00Z`)), ticket(2977, "2026-11-08T12:00:00Z")];
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), JSON.stringify(temps));
  const avertis: string[] = [];
  await stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: depot,
    depotServi: DEPOT_BRIGADE,
    avertir: (texte) => avertis.push(texte),
  }).tour();
  assert.deepEqual(avertis, []);
  assert.deepEqual(issues.map((i) => i.number), [2963]);
});
