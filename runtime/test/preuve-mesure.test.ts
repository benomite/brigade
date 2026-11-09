// La preuve des tickets de mesure (#2839) : le ticket de qualité et celui du
// temps perdu portent, sous leur chiffre, ce qu'un cook sans autre accès lit
// pour le diagnostiquer — les tickets mesurés et leurs raisons, leurs instants,
// les événements du journal de la fenêtre.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ticketDeQualite } from "../src/alerte-qualite.ts";
import { stationGitHub, type GitHubDuTour } from "../src/brigade-github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { mesurerQualite, type QualiteDuTicket } from "../src/mesure-qualite.ts";
import { avecLaPreuve, preuveDeMesure, TITRE_PREUVE, type GitHubDeLaPreuve } from "../src/preuve-mesure.ts";
import type { GitHubDeLaBrigade } from "../src/routage-temps-perdu.ts";
import { corpsDeLAttente } from "../src/attente-ticket/attente-ticket.ts";
import { corpsDeLaReponseAuBlocage } from "../src/blocage-au-manager.ts";
import { MARQUE_D_ATTENTE, MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../src/qualite-github.ts";
import { MARQUE_CORRECTION, ticketDeCorrection } from "../src/temps-max/correction.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";
import type { DepotDuTicket } from "../src/temps-ticket/mesure.ts";
import { repertoireTemporaire } from "./outils.ts";

// Quatre tickets mergés le 2026-11-07, chacun déposé une heure avant son merge, qui a perdu 20 min à attendre sa prise.
const TICKETS = [101, 102, 103, 104];
const temps = (): TempsTicket[] =>
  TICKETS.map((ticket, rang) => ({
    ticket,
    depuis: new Date(Date.UTC(2026, 10, 7, 9 + rang)).toISOString(),
    mergedAt: new Date(Date.UTC(2026, 10, 7, 10 + rang)).toISOString(),
    attentePrise: 20 * 60,
    cuisson: 5 * 60,
    cuissonTests: 0,
    attentePasse: 0,
    revue: 0,
    ci: 0,
    merge: 0,
    perdu: { attente: 20 * 60, ratees: 0, renvois: 0 },
  }));

// 101 : deux renvois ; 102 : un cook sans livraison ; 103 et 104 : du premier coup.
const COMMENTAIRES: Record<number, { body: string; association: string }[]> = {
  101: [
    { body: `${MARQUE_DE_RENVOI} n=1 sha=abc -->\nStation \`box/a\`: sent back to a cook (1/3) — the review requested changes: the test asserts nothing`, association: "OWNER" },
    { body: `${MARQUE_DE_RENVOI} n=2 sha=def -->\nStation \`box/a\`: sent back to a cook (2/3) — the CI is red on: tests (runtime)`, association: "OWNER" },
    // Un commentaire d'un inconnu qui imite la marque ne compte pas.
    { body: `${MARQUE_DE_RENVOI} n=3 -->\nfake — not a station`, association: "NONE" },
  ],
  102: [{ body: `${MARQUE_D_ECHEC} n=1 -->\nStation \`box/a\`: the cook stopped without a delivery — the cook committed nothing`, association: "OWNER" }],
  103: [],
  104: [],
};
const QUALITES = new Map<number, QualiteDuTicket>([
  [101, { renvois: ["Review", "Gates (runtime)"], cooksRates: 0 }],
  [102, { renvois: [], cooksRates: 1 }],
  [103, { renvois: [], cooksRates: 0 }],
  [104, { renvois: [], cooksRates: 0 }],
]);
const DEPOTS: Record<number, DepotDuTicket> = Object.fromEntries(
  TICKETS.map((ticket, rang) => {
    const a = (heure: number, minute: number) => new Date(Date.UTC(2026, 10, 7, heure + rang, minute)).toISOString();
    // 104 n'a jamais reçu `fire` sur GitHub.
    return [ticket, { deposeAt: a(8, 58), fireAt: rang === 3 ? null : a(8, 59), priseAt: a(9, 20) }];
  }),
);

const githubDeLaPreuve = (): GitHubDeLaPreuve => ({
  commentaires: async (numero) => COMMENTAIRES[numero] ?? [],
  depotDuTicket: async (numero) => DEPOTS[numero] ?? null,
});

// Le journal de la station : retenue puis relâchée dans la fenêtre, un événement avant elle, et le battement du runtime.
function journalDeLaStation(t: TestContext): string {
  const repertoire = repertoireTemporaire(t);
  let maintenant = new Date("2026-11-07T08:00:00.000Z");
  const journal = ouvrirJournal(repertoire, { maintenant: () => maintenant });
  const noter = (at: string, fait: Parameters<typeof journal.ajouter>[0]) => {
    maintenant = new Date(at);
    journal.ajouter(fait);
  };
  noter("2026-11-07T07:00:00.000Z", { project: "p", ticket: null, author: "runtime", type: "station.held", payload: { station: "box/before", reason: "paused" } });
  noter("2026-11-07T09:30:00.000Z", { project: "p", ticket: null, author: "runtime", type: "station.held", payload: { station: "box/a", reason: "quota" } });
  noter("2026-11-07T09:31:00.000Z", { project: "p", ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 1000 } });
  noter("2026-11-07T10:10:00.000Z", { project: "p", ticket: null, author: "runtime", type: "station.released", payload: { station: "box/a" } });
  journal.fermer();
  return repertoire;
}

test("a quality ticket body built from a fixture names every measured ticket and the reason of each send-back and failed cook", async () => {
  const enregistrements = temps();
  const ticket = ticketDeQualite(mesurerQualite(enregistrements, QUALITES));
  assert.ok(ticket);
  const corps = await avecLaPreuve(ticket.corps, () => preuveDeMesure({ github: githubDeLaPreuve() })("qualite", enregistrements, QUALITES));
  assert.ok(corps.startsWith(ticket.corps));
  assert.ok(corps.includes(TITRE_PREUVE));
  for (const numero of TICKETS) assert.match(corps, new RegExp(`- #${numero}: `));
  assert.match(corps, /- #101: 2 send-backs\n {2}- send-back: the review requested changes: the test asserts nothing\n {2}- send-back: the CI is red on: tests \(runtime\)/);
  assert.match(corps, /- #102: 1 failed cook\n {2}- failed cook: the cook committed nothing/);
  assert.match(corps, /- #103: first try/);
  assert.doesNotMatch(corps, /not a station/);
  // La qualité ne lit ni les instants ni le journal.
  assert.doesNotMatch(corps, /Station journal|first claim/);
});

test("a lost-time ticket body built from a fixture gives, per measured ticket, its filed, fire and first-claim timestamps, and the journal events of the window", async (t) => {
  const enregistrements = temps();
  const ticket = ticketDeCorrection(enregistrements, 2);
  assert.ok(ticket);
  const corps = await avecLaPreuve(ticket.corps, () => preuveDeMesure({ github: githubDeLaPreuve(), repertoireEtat: journalDeLaStation(t) })("temps-perdu", enregistrements, QUALITES));
  for (const [numero, depot] of Object.entries(DEPOTS)) {
    assert.match(corps, new RegExp(`- #${numero}: `));
    assert.ok(corps.includes(`filed ${depot.deposeAt}, fire ${depot.fireAt ?? "none on GitHub"}, first claim ${depot.priseAt}`), `#${numero}`);
  }
  assert.match(corps, /- #101: 2 send-backs — lost 20 min of 60 min \(claim wait 20 min, failed cooks 0 min, send-backs 0 min\)/);
  assert.match(corps, /send-back: the review requested changes: the test asserts nothing/);
  assert.match(corps, /failed cook: the cook committed nothing/);
  assert.match(corps, /### Station journal, 2026-11-07T09:00:00.000Z to 2026-11-07T13:00:00.000Z/);
  assert.match(corps, /- 2026-11-07T09:30:00.000Z `station.held` station=box\/a reason=quota\n- 2026-11-07T10:10:00.000Z `station.released` station=box\/a/);
  // Ni l'événement d'avant la fenêtre, ni le battement du runtime.
  assert.doesNotMatch(corps, /box\/before|runtime\.ticked/);
});

// BOBL-tech/mirrorlab#670 (#3036) : son cook s'est arrêté bloqué, le manager a
// répondu, et un cook suivant a livré. La mesure comptait 5 min de cook raté ;
// la preuve disait « first try », sans la question du cook.
test("a lost-time ticket's evidence names every cook stopped without a delivery that is not counted as a try, with the cook's words, and the quality evidence still says first try", async (t) => {
  const enregistrements = temps().map((e) => (e.ticket === 103 ? { ...e, perdu: { attente: 20 * 60, ratees: 5 * 60, renvois: 0 } } : e));
  const reponse = corpsDeLaReponseAuBlocage({
    station: "box/a",
    n: 1,
    questionEn: "Which fixture should the new screen read?\nThe ticket names none.",
    avis: { issue: "technique", reponse: "The one under test/fixtures.", decision: "Read test/fixtures/ecran.json." },
    ecrite: false,
  });
  const attente = corpsDeLAttente({ station: "box/a", attendus: [101], question: "This builds on #101, not yet merged." });
  const subi = `${MARQUE_D_ATTENTE} until=0 -->\nStation \`box/a\`: the cook stopped without a delivery — the Max quota is spent`;
  const commentaires: Record<number, { body: string; association: string }[]> = {
    ...COMMENTAIRES,
    103: [
      { body: reponse, association: "OWNER" },
      { body: attente, association: "OWNER" },
      { body: subi, association: "OWNER" },
      // Un inconnu qui imite la marque ne compte pas.
      { body: reponse.replace("Which fixture", "Not a station"), association: "NONE" },
    ],
  };
  const github: GitHubDeLaPreuve = { commentaires: async (numero) => commentaires[numero] ?? [], depotDuTicket: async (numero) => DEPOTS[numero] ?? null };
  const corps = await preuveDeMesure({ github, repertoireEtat: journalDeLaStation(t), projetMesure: "BOBL-tech/mirrorlab" })("temps-perdu", enregistrements, QUALITES);
  assert.match(
    corps,
    /- BOBL-tech\/mirrorlab#103: 3 failed cooks — lost 25 min of 60 min \(claim wait 20 min, failed cooks 5 min, send-backs 0 min\)\n.*\n {2}- failed cook, not counted as a try: blocked, answered by the manager: Which fixture should the new screen read\? The ticket names none\.\n {2}- failed cook, not counted as a try: stopped on an open ticket: This builds on #101, not yet merged\.\n {2}- failed cook, not counted as a try: stopped, not the cook's doing: the Max quota is spent\n/,
  );
  assert.doesNotMatch(corps, /mirrorlab#103: first try|Not a station/);
  // 102 garde son cook raté compté pour un essai, sans arrêt de plus.
  assert.match(corps, /mirrorlab#102: 1 failed cook — /);
  // La qualité ne compte pas ces arrêts pour un essai : 103 y reste du premier coup.
  const qualite = await preuveDeMesure({ github })("qualite", enregistrements, QUALITES);
  assert.match(qualite, /- #103: first try\n/);
  assert.doesNotMatch(qualite, /not counted as a try/);
});

test("a read that fails names its error in the evidence and invents nothing: comments, filing, journal", async (t) => {
  const enregistrements = temps();
  const github: GitHubDeLaPreuve = {
    commentaires: async (numero) => {
      if (numero === 101) throw new Error("GitHub said 502");
      return COMMENTAIRES[numero] ?? [];
    },
    depotDuTicket: async (numero) => {
      if (numero === 102) throw new Error("rate limited");
      return numero === 103 ? null : (DEPOTS[numero] ?? null);
    },
  };
  const sansJournal = repertoireTemporaire(t);
  const corps = await preuveDeMesure({ github, repertoireEtat: sansJournal })("temps-perdu", enregistrements, QUALITES);
  // Les raisons de 101 viennent de ce que le fichier des temps a gardé, et le disent.
  assert.match(corps, /- #101: comments unreadable — .*\n.*\n {2}- its comments could not be read \(GitHub said 502\); recorded at its merge: 2 send-backs, 0 failed cooks\n {2}- send-back, recorded cause: Review/);
  assert.match(corps, /#102.*\n {2}- filed, fire and first claim not read on GitHub \(rate limited\); recorded start 2026-11-07T10:00:00.000Z, recorded first claim none/);
  assert.match(corps, /#103.*\n {2}- filed, fire and first claim not read on GitHub \(the issue was not found\)/);
  assert.match(corps, /- the station's journal could not be read: no log in /);
  // Sans répertoire d'état, la section le dit.
  assert.match(await preuveDeMesure({ github })("temps-perdu", enregistrements, QUALITES), /- the station's journal could not be read: this station was started without a state directory/);
  // Une preuve qui lève ne retient pas le corps.
  const tenu = await avecLaPreuve("body", async () => {
    throw new Error("boom");
  });
  assert.equal(tenu, `body\n\n${TITRE_PREUVE}\n\n- the station could not gather the evidence: boom`);
  assert.equal(await avecLaPreuve("body", undefined), "body");
});

// Le chemin du dépôt : le tour de la station lit les temps de son clone, et le
// ticket de mesure qu'elle ouvre porte la preuve, lue sur son GitHub et son journal.
function clone(t: TestContext, projet: object, qualite: (ticket: number) => QualiteDuTicket): string {
  const depot = repertoireTemporaire(t);
  const dossier = join(depot, ".claude", "brigade");
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "projet.json"), JSON.stringify(projet));
  writeFileSync(join(dossier, "temps-tickets.json"), JSON.stringify(temps().map((e) => ({ ...e, qualite: qualite(e.ticket) }))));
  return depot;
}

function faux() {
  const issues: { number: number; title: string; body: string }[] = [];
  const preuve = githubDeLaPreuve();
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async () => [],
    issuesDepuis: async () => issues.map(({ number, body }) => ({ number, body, state: "open", association: "OWNER" })),
    creerIssue: async ({ titre, corps }: { titre: string; corps: string }) => {
      const number = 3000 + issues.length;
      issues.push({ number, title: titre, body: corps });
      return number;
    },
    fermerIssue: async () => {},
    corpsDuTicket: async () => "",
    prDuTicket: async () => null,
    commentaires: preuve.commentaires,
    depotDuTicket: preuve.depotDuTicket,
    dependancesOuvertes: async () => [],
    prsOuvertes: async () => [],
    retraitsDeLabels: async () => [],
  };
  return { issues, github: github as unknown as GitHubDuTour };
}

const station = (github: GitHubDuTour, depot: string, repertoireEtat: string, avertis: string[]) =>
  stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: depot,
    repertoireEtat,
    avertir: (texte) => avertis.push(texte),
    maintenant: () => new Date("2026-11-07T14:00:00Z"),
    echantillonMin: 1,
  });

test("filing path: the station's turn files the lost-time ticket with its evidence, and the quality ticket with its own", async (t) => {
  const temps = faux();
  const avertis: string[] = [];
  await station(temps.github, clone(t, { lostTimeMaxMin: 2 }, () => ({ renvois: [], cooksRates: 0 })), journalDeLaStation(t), avertis).tour();
  assert.deepEqual(avertis, []);
  const perdu = temps.issues.find(({ body }) => body.startsWith(MARQUE_CORRECTION));
  assert.ok(perdu);
  assert.match(perdu.body, /## Evidence/);
  assert.ok(perdu.body.includes(`filed ${DEPOTS[101]?.deposeAt}, fire ${DEPOTS[101]?.fireAt}, first claim ${DEPOTS[101]?.priseAt}`));
  assert.match(perdu.body, /`station.held` station=box\/a reason=quota/);

  const qualite = faux();
  await station(qualite.github, clone(t, { lostTimeMaxMin: 2 }, (ticket) => QUALITES.get(ticket) ?? { renvois: [], cooksRates: 0 }), journalDeLaStation(t), avertis).tour();
  assert.deepEqual(avertis, []);
  assert.equal(qualite.issues.length, 1);
  const [ouverte] = qualite.issues;
  assert.match(ouverte?.title ?? "", /^Quality before time/);
  assert.match(ouverte?.body ?? "", /## Evidence/);
  assert.match(ouverte?.body ?? "", /- #101: 2 send-backs\n {2}- send-back: the review requested changes: the test asserts nothing/);
  assert.match(ouverte?.body ?? "", /- #102: 1 failed cook\n {2}- failed cook: the cook committed nothing/);
});

const MESURE = "BOBL-tech/mirrorscreen";

test("measured project other than the served one: the body copies the tickets, reasons, timestamps and journal events, and names no bare issue or state path", async (t) => {
  const enregistrements = temps();
  const github = githubDeLaPreuve();
  const repertoireEtat = journalDeLaStation(t);
  const perdu = ticketDeCorrection(enregistrements, 2);
  assert.ok(perdu);
  const corpsPerdu = await avecLaPreuve(perdu.corps, () => preuveDeMesure({ github, repertoireEtat, projetMesure: MESURE })("temps-perdu", enregistrements, QUALITES));
  const qualite = ticketDeQualite(mesurerQualite(enregistrements, QUALITES));
  assert.ok(qualite);
  const corpsQualite = await avecLaPreuve(qualite.corps, () => preuveDeMesure({ github, projetMesure: MESURE })("qualite", enregistrements, QUALITES));

  // Copié : numéros, raisons, horodatages, événements du journal, en toutes lettres.
  for (const numero of TICKETS) assert.ok(corpsPerdu.includes(`- ${MESURE}#${numero}: `) && corpsQualite.includes(`- ${MESURE}#${numero}: `), `#${numero}`);
  assert.match(corpsQualite, new RegExp(`- ${MESURE}#101: 2 send-backs\\n {2}- send-back: the review requested changes: the test asserts nothing\\n {2}- send-back: the CI is red on: tests`));
  assert.match(corpsQualite, /failed cook: the cook committed nothing/);
  for (const [numero, depot] of Object.entries(DEPOTS)) assert.ok(corpsPerdu.includes(`${MESURE}#${numero}: `) && corpsPerdu.includes(`filed ${depot.deposeAt}, fire ${depot.fireAt ?? "none on GitHub"}, first claim ${depot.priseAt}`), `#${numero}`);
  assert.ok(corpsPerdu.includes("merged 2026-11-07T10:00:00.000Z"));
  assert.match(corpsPerdu, /- 2026-11-07T09:30:00.000Z `station.held` station=box\/a reason=quota\n- 2026-11-07T10:10:00.000Z `station.released` station=box\/a/);
  assert.match(corpsPerdu, /lost 20 min of 60 min/);
  assert.match(corpsPerdu, new RegExp(`${MESURE} is not the repository this ticket is filed on`));

  // Pas de référence nue : ni `#101` seul, ni le chemin de l'état du projet mesuré.
  for (const corps of [corpsPerdu, corpsQualite]) {
    const section = corps.slice(corps.indexOf(TITRE_PREUVE));
    assert.doesNotMatch(section, /(?<![\w/])#\d+/);
    assert.doesNotMatch(section, /temps-tickets\.json|\.claude\/brigade/);
  }
});

test("filing path, measured project other than the served one: the ticket filed on the brigade carries the copied evidence", async (t) => {
  const brigade: { titre: string; corps: string }[] = [];
  const avertis: string[] = [];
  const temps = faux();
  const githubDeLaBrigade = {
    issuesDepuis: async () => [],
    creerIssue: async ({ titre, corps }: { titre: string; corps: string }) => {
      brigade.push({ titre, corps });
      return 4000;
    },
    fermerIssue: async () => {},
  } as unknown as GitHubDeLaBrigade;
  await stationGitHub({
    nom: "box/test",
    places: 1,
    base: "main",
    github: temps.github,
    prise: { prendre: async () => ({ prise: false }), lacher: async () => true },
    cuisiner: async () => ({ echec: "not here" }),
    juger: async () => ({ verdict: "approve", motif: "" }),
    clone: clone(t, { lostTimeMaxMin: 2 }, () => ({ renvois: [], cooksRates: 0 })),
    repertoireEtat: journalDeLaStation(t),
    depotServi: MESURE,
    githubDeLaBrigade,
    avertir: (texte) => avertis.push(texte),
    maintenant: () => new Date("2026-11-07T14:00:00Z"),
    echantillonMin: 1,
  }).tour();
  assert.deepEqual(avertis, []);
  assert.equal(temps.issues.length, 0);
  const [ouvert] = brigade;
  assert.match(ouvert?.titre ?? "", /\(measured on BOBL-tech\/mirrorscreen\)$/);
  assert.ok(ouvert?.corps.includes(`${MESURE}#101: `));
  assert.match(ouvert?.corps ?? "", /`station.held` station=box\/a reason=quota/);
  assert.doesNotMatch(ouvert?.corps ?? "", /temps-tickets\.json/);
});
