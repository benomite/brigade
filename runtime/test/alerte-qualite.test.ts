// La qualité avant le temps (#2680) : quand le premier coup tombe sous le seuil
// ou que la base casse trop souvent, les alertes de temps n'ouvrent rien et un
// seul ticket de qualité s'ouvre, qui nomme la cause et porte la règle des gardes.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_CORRECTION as MARQUE_CUISSON } from "../src/alerte-temps-cuisson/alerte.ts";
import { baseTropCassee, LABELS_QUALITE, MARQUE_QUALITE, porteDeQualite, ticketDeQualite } from "../src/alerte-qualite.ts";
import { stationGitHub, type GitHubDuTour } from "../src/brigade-github.ts";
import { REGLE_GARDE_CORRECTION } from "../src/garde-correction.ts";
import { mesurerQualite, type QualiteDuTicket } from "../src/mesure-qualite.ts";
import { correctionDuTemps, MARQUE_CORRECTION, type GitHubDeLaCorrection } from "../src/temps-max/correction.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";
import { repertoireTemporaire } from "./outils.ts";

type Issue = { number: number; titre: string; corps: string; labels: string[]; state: "open" | "closed"; association: string };

class FauxDepot {
  issues: Issue[] = [];
  github(): GitHubDeLaCorrection {
    return {
      issuesDepuis: async () => this.issues.map(({ number, corps, association, state }) => ({ number, body: corps, association, state })),
      creerIssue: async ({ titre, corps, labels }) => {
        const number = 2700 + this.issues.length;
        this.issues.push({ number, titre, corps, labels, state: "open", association: "OWNER" });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
    };
  }
}

const MAINTENANT = () => new Date("2026-11-07T12:00:00Z");
// `combien` tickets qui ont perdu 20 min à attendre leur prise — au-dessus du seuil de 10 —, mergés un toutes les dix minutes le 2026-11-07.
const lents = (combien: number): TempsTicket[] =>
  Array.from({ length: combien }, (_, rang) => ({ ticket: rang + 1, mergedAt: new Date(Date.UTC(2026, 10, 7) + rang * 10 * 60_000).toISOString(), cuisson: 5 * 60, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, perdu: { attente: 20 * 60, ratees: 0, renvois: 0 } }));
const bien: QualiteDuTicket = { renvois: [], cooksRates: 0 };

// 10 tickets, 6 du premier coup : 60 %.
const soixante = (): Map<number, QualiteDuTicket> =>
  new Map<number, QualiteDuTicket>([
    [1, { renvois: ["criteria not met", "tests missing"], cooksRates: 0 }],
    [2, { renvois: ["criteria not met"], cooksRates: 0 }],
    [3, { renvois: ["criteria not met", "out of zone"], cooksRates: 0 }],
    [4, { renvois: [], cooksRates: 1 }],
    ...[5, 6, 7, 8, 9, 10].map((t) => [t, bien] as [number, QualiteDuTicket]),
  ]);

test("first-try rate of 60% with the time over the max: no time ticket, one quality ticket listing the top send-back reasons with their counts", async () => {
  const depot = new FauxDepot();
  const enregistrements = lents(10);
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10, qualites: soixante() }), maintenant: MAINTENANT });
  assert.deepEqual(await corriger(), { issue: "qualite", qualite: { issue: "ouverte", numero: 2700, causes: ["premier-coup"] } });
  assert.equal(depot.issues.length, 1);
  const [ouverte] = depot.issues;
  assert.ok(ouverte);
  assert.ok(!ouverte.corps.includes(MARQUE_CORRECTION));
  assert.ok(ouverte.corps.startsWith(MARQUE_QUALITE));
  assert.deepEqual(ouverte.labels, LABELS_QUALITE);
  assert.equal(ouverte.titre, "Quality before time: first-try rate 60% under the 70% threshold — top send-back reason: criteria not met");
  const motifs = ouverte.corps.split("## Most frequent send-back reasons")[1]?.split("##")[0]?.trim().split("\n");
  assert.deepEqual(motifs, ["- criteria not met: 3 times", "- tests missing: 1 time", "- out of zone: 1 time"]);
  assert.ok(!ouverte.corps.includes("## Checks that broke main"));
});

test("7 repairs of main for 74 merged PRs: one quality ticket naming the checks that broke main", async () => {
  const depot = new FauxDepot();
  const enregistrements = lents(74);
  const checks = [["types (runtime)"], ["types (runtime)", "tests (app)"], ["types (runtime)"], ["tests (runtime)"], ["tests (app)"], ["types (runtime)"], ["tests (runtime)"]];
  const qualites = new Map<number, QualiteDuTicket>(enregistrements.map(({ ticket }) => [ticket, ticket <= 7 ? { ...bien, reparation: checks[ticket - 1] ?? [] } : bien]));
  assert.equal(mesurerQualite(enregistrements, qualites).mesures, 74);
  const decision = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10, qualites }), maintenant: MAINTENANT })();
  assert.deepEqual(decision, { issue: "qualite", qualite: { issue: "ouverte", numero: 2700, causes: ["base-cassee"] } });
  assert.equal(depot.issues.length, 1);
  const corps = depot.issues[0]?.corps ?? "";
  assert.match(depot.issues[0]?.titre ?? "", /main broke 7 times for 74 merged PRs — top broken check: types \(runtime\)/);
  const casses = corps.split("## Checks that broke main")[1]?.split("##")[0]?.trim().split("\n");
  assert.deepEqual(casses, ["- types (runtime): 4 times", "- tests (app): 2 times", "- tests (runtime): 2 times"]);
});

test("first-try rate of 80% and under one repair per ten merges: the time alert opens its ticket as before", async () => {
  const depot = new FauxDepot();
  const enregistrements = lents(10);
  const qualites = new Map<number, QualiteDuTicket>(enregistrements.map(({ ticket }) => [ticket, ticket <= 2 ? { renvois: ["criteria not met"], cooksRates: 0 } : bien]));
  const avec = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10, qualites }), maintenant: MAINTENANT })();
  const temoin = new FauxDepot();
  const sans = await correctionDuTemps({ github: temoin.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10 }), maintenant: MAINTENANT })();
  assert.deepEqual(avec, sans);
  assert.equal(avec.issue, "ouverte");
  assert.deepEqual(depot.issues, temoin.issues);
  assert.ok(depot.issues[0]?.corps.startsWith(MARQUE_CORRECTION));
});

test("a quality ticket already open: a new run, by this station or another, opens no other ticket", async () => {
  const depot = new FauxDepot();
  const lire = () => ({ enregistrements: lents(10), lostTimeMaxMin: 10, qualites: soixante() });
  const corriger = correctionDuTemps({ github: depot.github(), lire, maintenant: MAINTENANT });
  await corriger();
  assert.deepEqual(await corriger([2700]), { issue: "qualite", qualite: { issue: "deja-ouverte", numero: 2700, causes: ["premier-coup"] } });
  assert.deepEqual(await correctionDuTemps({ github: depot.github(), lire, maintenant: MAINTENANT })(), { issue: "qualite", qualite: { issue: "deja-ouverte", numero: 2700, causes: ["premier-coup"] } });
  assert.equal(depot.issues.length, 1);
  // Un marqueur posté par un inconnu ne fait taire rien.
  const autre = new FauxDepot();
  autre.issues.push({ number: 2699, titre: "spoof", corps: MARQUE_QUALITE, labels: [], state: "open", association: "NONE" });
  assert.equal((await porteDeQualite({ github: autre.github(), maintenant: MAINTENANT })(mesurerQualite(lents(10), soixante())))?.issue, "ouverte");
});

test("the quality ticket carries the rule that a correction never lowers a guard, and the 'Guards left untouched' requirement for its PR", () => {
  const ticket = ticketDeQualite(mesurerQualite(lents(10), soixante()));
  assert.ok(ticket);
  assert.ok(ticket.corps.includes(REGLE_GARDE_CORRECTION));
  assert.match(ticket.corps, /A correction ticket never lowers a guard/);
  assert.match(ticket.corps, /the PR body has a "Guards left untouched" section that names reviewer and second judge calibration, gates, tests, CI checks, acceptance criteria/);
});

test("quality unknown or within its limits: no quality ticket", () => {
  // 6 repairs for 74 merges: under one per ten.
  const enregistrements = lents(74);
  const six = new Map<number, QualiteDuTicket>(enregistrements.map(({ ticket }) => [ticket, ticket <= 6 ? { ...bien, reparation: ["tests (app)"] } : bien]));
  assert.equal(ticketDeQualite(mesurerQualite(enregistrements, six)), null);
  assert.equal(ticketDeQualite(mesurerQualite(lents(10), new Map())), null);
  assert.equal(ticketDeQualite(mesurerQualite(lents(10), new Map(lents(10).map(({ ticket }) => [ticket, bien])))), null);
});

test("main breaks too often over the ratio, or at one repair per full ten merges; under ten merges, the ratio alone decides", () => {
  assert.equal(baseTropCassee({ reparations: 1, mesures: 9, tropDeReparations: true }), true);
  assert.equal(baseTropCassee({ reparations: 0, mesures: 9, tropDeReparations: false }), false);
  assert.equal(baseTropCassee({ reparations: 7, mesures: 74, tropDeReparations: false }), true);
  assert.equal(baseTropCassee({ reparations: 6, mesures: 74, tropDeReparations: false }), false);
  assert.equal(baseTropCassee({ reparations: 0, mesures: 0, tropDeReparations: null }), false);
});

// Le câblage réel (#2680, #2707) : la station lit les temps, la qualité que
// chacun porte depuis son merge, et projet.json dans son clone.
function faux() {
  const issues: { number: number; title: string; body: string; labels: string[]; state: "open" | "closed" }[] = [];
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async () => [],
    issuesDepuis: async () => issues.map(({ number, body, state }) => ({ number, body, state, association: "OWNER" })),
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = 3000 + issues.length;
      issues.push({ number, title: titre, body: corps, labels, state: "open" });
      return number;
    },
    fermerIssue: async () => {},
    corpsDuTicket: async () => "",
    prDuTicket: async () => null,
    commentaires: async () => [],
    dependancesOuvertes: async () => [],
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
  };
  return { issues, github: github as unknown as GitHubDuTour };
}

// Les dix tickets lents, chacun avec la qualité que la station a lue sur GitHub à son merge :
// les 4 premiers après un cook sans livraison.
const lentsQualifies = () => lents(10).map((temps) => ({ ...temps, qualite: { renvois: [], cooksRates: temps.ticket <= 4 ? 1 : 0 } }));

function clone(t: TestContext, projet: object): string {
  const depot = repertoireTemporaire(t);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), JSON.stringify(projet));
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify(lentsQualifies()));
  // La cuisson aussi au-dessus de son estimation : ×2, sur le seuil de ×1,5 (#2676).
  writeFileSync(join(dossier, "ratios-cuisson.json"), JSON.stringify(lents(10).map(({ ticket, mergedAt }) => ({ ticket, servedAt: mergedAt, attendu: 10, reel: 20, ratio: 2 }))));
  return depot;
}

const station = (github: GitHubDuTour, depot: string, avertis: string[]) =>
  stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: depot,
    avertir: (texte) => avertis.push(texte),
    maintenant: MAINTENANT,
  });

test("the station's turn reads the quality from the ticket times of its clone and its threshold from projet.json: 60% first try opens the quality ticket, once, and neither time alert opens its own", async (t) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  const depot = clone(t, { lostTimeMaxMin: 10 });
  await station(github, depot, avertis).tour();
  await station(github, depot, avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.body.startsWith(MARQUE_QUALITE));
  assert.match(issues[0]?.title ?? "", /first-try rate 60% under the 70% threshold/);
});

test("the project's own first-try threshold, read from projet.json by the station: at 50%, 60% holds and both time alerts open their tickets as before", async (t) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  await station(github, clone(t, { lostTimeMaxMin: 10, premierCoupMinPourcent: 50 }), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 2);
  assert.ok(issues.some(({ body }) => body.startsWith(MARQUE_CORRECTION)));
  assert.ok(issues.some(({ body }) => body.startsWith(MARQUE_CUISSON)));
});
