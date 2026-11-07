// Le tour d'une station GitHub seul ouvre le ticket de correction du temps des
// tickets (#2515), lu dans le clone du projet, et un seul.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { stationGitHub, type GitHubDuTour, type TicketLu } from "../../src/brigade-github.ts";
import { MARQUE_CORRECTION } from "../../src/temps-max/correction.ts";
import { repertoireTemporaire } from "../outils.ts";

type Issue = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed" };

// Le GitHub d'un projet à la base verte, réduit à ce que le tour lit et écrit ;
// la station ne prend rien (`prise` refuse), elle ne fait que tourner.
function faux() {
  const issues: Issue[] = [];
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async (): Promise<TicketLu[]> => issues.filter((i) => i.state === "open" && i.labels.includes("fire")).map(({ number, title, labels, state }) => ({ number, title, labels, state })),
    issuesDepuis: async () => issues.map(({ number, body, state }) => ({ number, body, state, association: "OWNER" })),
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = 3000 + issues.length;
      issues.push({ number, title: titre, body: corps, labels, state: "open" });
      return number;
    },
    fermerIssue: async (numero: number) => {
      const issue = issues.find((i) => i.number === numero);
      if (issue) issue.state = "closed";
    },
    corpsDuTicket: async (numero: number) => issues.find((i) => i.number === numero)?.body ?? "",
    prDuTicket: async () => null,
    commentaires: async () => [],
    dependancesOuvertes: async () => [],
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
  };
  return { issues, github: github as unknown as GitHubDuTour };
}

function clone(tc: TestContext, minutes: number[], projet: object = {}): string {
  const depot = repertoireTemporaire(tc);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), JSON.stringify(projet));
  // Des tickets qui ont attendu leur prise `minutes`, puis cuit 10 min.
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify(minutes.map((m, rang) => ({ ticket: rang + 1, attentePrise: m * 60, cuisson: 600, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }))));
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
  });

test("over the lost-time threshold, the station's turn opens one prio:0 correction ticket, and no second one while it is open", async (tc) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  const s = station(github, clone(tc, [12, 18, 25]), avertis);
  await s.tour();
  await s.tour();
  await station(github, clone(tc, [12, 18, 25]), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.labels.includes("prio:0"));
  assert.ok(issues[0]?.body.startsWith(MARQUE_CORRECTION));
  assert.match(issues[0]?.body ?? "", /is \*\*18 min\*\*: over the project's threshold of 2 min/);
});

test("the project's own threshold holds: under it, the turn opens nothing", async (tc) => {
  const { issues, github } = faux();
  const avertis: string[] = [];
  await station(github, clone(tc, [12, 18, 25], { lostTimeMaxMin: 20 }), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(issues.length, 0);
});

// #2580 : rouverte deux minutes après le merge de #2577 (12 h 10 UTC), par une
// station qui tournait encore le code d'avant lui — sa mise à jour vient bien
// plus tard. Le même tour, au code d'aujourd'hui, n'ouvre rien : les 61
// tickets récents ont tous été pris avant ce merge.
test("#2580: the turn right after a correction is served opens nothing while the recent tickets were all claimed before its merge", async (tc) => {
  const { issues, github } = faux();
  issues.push({ number: 2577, title: "Tickets take too long", body: `${MARQUE_CORRECTION}\n`, labels: ["fire", "prio:0"], state: "closed" });
  const servie = Date.parse("2026-11-06T12:10:34Z");
  const ticket = (numero: number, prise: number, minutes: number) => ({ ticket: numero, claimedAt: new Date(prise).toISOString(), mergedAt: new Date(prise + minutes * 60_000).toISOString(), cuisson: minutes * 60, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });
  const avant = Array.from({ length: 60 }, (_, rang) => ticket(2500 + rang, servie - (24 - rang * 0.38) * 60 * 60_000, 11));
  const depot = clone(tc, []);
  writeFileSync(join(depot, ".claude", "brigade", "temps-tickets.json"), JSON.stringify([...avant, ticket(2577, servie - 50 * 60_000, 50)]));
  const avertis: string[] = [];
  await station(github, depot, avertis).tour();
  assert.deepEqual(avertis, []);
  assert.deepEqual(issues.map((i) => i.number), [2577]);
});
