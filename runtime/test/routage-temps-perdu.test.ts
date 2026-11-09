// Le ticket « Tickets lose too much time » d'un projet servi se dépose sur la
// brigade (#2783), jamais sur le projet ; sur la brigade elle-même, rien ne change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionDuTemps, MARQUE_CORRECTION, type GitHubDeLaCorrection } from "../src/temps-max/correction.ts";
import { DEPOT_BRIGADE, marqueDuProjet, routerLeTempsPerdu, type GitHubDeLaBrigade } from "../src/routage-temps-perdu.ts";
import type { TempsTicket } from "../src/temps-ticket/ligne-status.ts";

type Issue = { number: number; titre: string; corps: string; state: "open" | "closed" };
const fauxDepot = () => {
  const issues: Issue[] = [];
  const github: GitHubDeLaCorrection = {
    issuesDepuis: async () => issues.map(({ number, corps, state }) => ({ number, body: corps, association: "OWNER", state })),
    creerIssue: async ({ titre, corps }) => {
      issues.push({ number: 100 + issues.length, titre, corps, state: "open" });
      return 99 + issues.length;
    },
    fermerIssue: async (numero) => {
      const issue = issues.find((i) => i.number === numero);
      if (issue) issue.state = "closed";
    },
  };
  return { issues, github };
};
// Des tickets qui n'ont perdu que l'attente d'une prise : 5 min chacun.
const temps = (): TempsTicket[] => [1, 2, 3].map((ticket) => ({ ticket, attentePrise: 300, cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
const ouvrir = (servi: string, projet: ReturnType<typeof fauxDepot>, brigade: ReturnType<typeof fauxDepot>) =>
  correctionDuTemps({ echantillonMin: 1, github: routerLeTempsPerdu({ github: projet.github, servi, brigade: brigade.github }), lire: () => ({ enregistrements: temps(), lostTimeMaxMin: 2 }) })();

test("a loss measured on a served project is filed on benomite/brigade, naming the project and the loss", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const decision = await ouvrir("BOBL-tech/espace", projet, brigade);
  assert.equal(decision.issue, "ouverte");
  assert.equal(projet.issues.length, 0);
  assert.equal(brigade.issues.length, 1);
  const [ticket] = brigade.issues;
  assert.ok(ticket?.titre.startsWith("Tickets lose too much time"));
  assert.ok(ticket?.titre.includes("BOBL-tech/espace"));
  assert.ok(ticket?.corps.includes(marqueDuProjet("BOBL-tech/espace")));
  assert.ok(ticket?.corps.includes("waiting for a claim"));
  assert.match(ticket?.corps ?? "", /median 5 min/);
  // Un second tour ne rouvre rien pour ce projet, mais un autre projet a son ticket.
  assert.equal((await ouvrir("BOBL-tech/espace", projet, brigade)).issue, "deja-ouverte");
  assert.equal((await ouvrir("BOBL-tech/mirrorscreen", projet, brigade)).issue, "ouverte");
  assert.equal(brigade.issues.length, 2);
  assert.equal(projet.issues.length, 0);
});

test("a loss measured on benomite/brigade itself is still filed there, as before", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const decision = await ouvrir(DEPOT_BRIGADE, projet, brigade);
  assert.equal(decision.issue, "ouverte");
  assert.equal(projet.issues.length, 1);
  assert.equal(brigade.issues.length, 0);
  assert.ok(!projet.issues[0]?.corps.includes("brigade:projet="));
});

// Des tickets du projet servi qui n'ont perdu que l'attente d'une prise, 5 min chacun, pris à `debut` puis d'heure en heure.
const pris = (premier: number, combien: number, debut: number): TempsTicket[] =>
  Array.from({ length: combien }, (_, rang) => {
    const prise = debut + rang * 60 * 60_000;
    return { ticket: premier + rang, claimedAt: new Date(prise).toISOString(), mergedAt: new Date(prise + 10 * 60_000).toISOString(), attentePrise: 300, cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
  });

test("#2809: a correction served on benomite/brigade is tried on the served project's tickets claimed after its closing — none reopens on the tickets claimed before it", async () => {
  const projet = fauxDepot();
  // La brigade dit quand chacune de ses issues a été fermée, comme `issuesDepuis` de `github.ts`.
  const fermetures = new Map<number, string>();
  const brigade = fauxDepot();
  const lue: GitHubDeLaBrigade = { ...brigade.github, issuesDepuis: async (instant) => (await brigade.github.issuesDepuis(instant)).map((issue) => ({ ...issue, ...(fermetures.has(issue.number) ? { closedAt: fermetures.get(issue.number) } : {}) })) };
  const debut = Date.UTC(2026, 10, 7, 0);
  // Un ticket du projet porte le numéro de la correction de la brigade, mergé avant tous les autres : ce n'est pas elle.
  let enregistrements: TempsTicket[] = [{ ...pris(100, 1, debut - 2 * 60 * 60_000)[0] as TempsTicket, attentePrise: 0 }, ...pris(1, 6, debut)];
  const corriger = correctionDuTemps({ echantillonMin: 1, github: routerLeTempsPerdu({ github: projet.github, servi: "BOBL-tech/mirrorscreen", brigade: lue }), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }) });
  assert.deepEqual(await corriger(), { issue: "ouverte", numero: 100, mediane: 300, seuilMin: 2 });

  // Servie sur la brigade : sa PR mergée la ferme, après la prise de tous les tickets récents du projet.
  const servie = new Date(debut + 6 * 60 * 60_000).toISOString();
  await brigade.github.fermerIssue(100);
  fermetures.set(100, servie);
  assert.deepEqual(await corriger([]), { issue: "a-l-essai", numero: 100, servie, manque: 20, mediane: 300, seuilMin: 2 });
  assert.equal(brigade.issues.length, 1);

  // 20 tickets du projet sont pris après elle, et toujours au-dessus du seuil : la suivante s'ouvre.
  // La mesure a changé depuis le merge (#2833) : 8 min perdues au lieu de 5.
  enregistrements = [...enregistrements, ...pris(20, 20, debut + 30 * 60 * 60_000).map((t) => ({ ...t, attentePrise: 480 }))];
  assert.equal((await corriger([])).issue, "ouverte");
  assert.equal(brigade.issues.length, 2);
  assert.equal(projet.issues.length, 0);
});

// #2833 : la boucle des tickets « Quality before time » / « Tickets lose too much time » redéposés après chaque merge.
const deposer = (brigade: ReturnType<typeof fauxDepot>, servi: string, titre: string, maintenant = () => new Date()) =>
  routerLeTempsPerdu({ github: fauxDepot().github, servi, brigade: brigade.github, maintenant }).creerIssue({ titre, corps: "body", labels: [] });

test("#2833: a second filing for the same metric and repository returns the ticket already covering it, whatever the number or the parenthesis", async () => {
  const brigade = fauxDepot();
  const premier = await deposer(brigade, "BOBL-tech/espace", "Quality before time: first-try rate 40% under the 70% threshold");
  assert.equal(brigade.issues.length, 1);
  assert.equal(await deposer(brigade, "BOBL-tech/espace", "Quality before time: first-try rate 53% under the 70% threshold (measured on BOBL-tech/espace)"), premier);
  assert.equal(await deposer(brigade, "BOBL-tech/espace", "Quality before time: first-try rate 48% under the 70% threshold (measured on BOBL-tech/mirrorscreen)"), premier);
  assert.equal(brigade.issues.length, 1);
  // Une autre mesure, ou un autre dépôt mesuré, est une autre famille.
  assert.notEqual(await deposer(brigade, "BOBL-tech/espace", "Tickets lose too much time: median 6.3 min lost"), premier);
  assert.notEqual(await deposer(brigade, "BOBL-tech/mirrorscreen", "Quality before time: first-try rate 40% under the 70% threshold"), premier);
  assert.equal(brigade.issues.length, 3);
});

test("#2833: after a merge, an unchanged metric files nothing; a changed one files once the delay has passed", async () => {
  const brigade = fauxDepot();
  const fermee = new Date(Date.UTC(2026, 10, 7, 20, 0)).toISOString();
  const lue: typeof brigade.github = { ...brigade.github, issuesDepuis: async (i) => (await brigade.github.issuesDepuis(i)).map((issue) => (issue.state === "closed" ? { ...issue, closedAt: fermee } as typeof issue : issue)) };
  const apres = (heures: number) => () => new Date(Date.parse(fermee) + heures * 3600_000);
  const titre = "Tickets lose too much time: median 3.8 min lost over the threshold of 2 min — attente weighs most";
  const depose = (servi: string, t: string, h: number) => routerLeTempsPerdu({ github: fauxDepot().github, servi, brigade: lue, maintenant: apres(h) }).creerIssue({ titre: t, corps: "b", labels: [] });
  const premier = await depose("BOBL-tech/espace", titre, 0);
  await brigade.github.fermerIssue(premier);
  // Mergé depuis moins de 6 h : rien, même si la mesure a changé.
  assert.equal(await depose("BOBL-tech/espace", titre.replace("3.8", "9"), 1), premier);
  // Plus tard, la mesure inchangée ne dépose rien.
  assert.equal(await depose("BOBL-tech/espace", `${titre} (measured on BOBL-tech/espace)`, 48), premier);
  assert.equal(brigade.issues.length, 1);
  // La mesure a changé après le merge : un nouveau ticket.
  assert.notEqual(await depose("BOBL-tech/espace", titre.replace("3.8", "9"), 48), premier);
  assert.equal(brigade.issues.length, 2);
});

// #2979 : sur son propre dépôt, la station ne voit dans ses temps que les tickets qu'elle a
// mergés. #2963, ticket de qualité mergé par une autre station, n'y était pas : il n'attendait
// aucun ticket, et #2979 se rouvrait sur les neuf conflits qu'il avait comptés et corrigés.
const QUALITE = "<!-- brigade:qualite -->\n<!-- brigade:qualite-comptes 1,2,3,4,5,6,7,8,9,10 -->";
const DEBUT_2979 = Date.UTC(2026, 10, 8, 0);
// Dix tickets renvoyés pour conflit, pris avant le service de #2963, puis `apres` tickets pris après lui, renvoyés aussi.
const conflits = (apres: number): TempsTicket[] =>
  [...pris(1, 10, DEBUT_2979), ...pris(2970, apres, DEBUT_2979 + 12 * 60 * 60_000)].map((t) => ({ ...t, attentePrise: 0 }));
const renvoyes = (tickets: readonly TempsTicket[]) => new Map(tickets.map((t) => [t.ticket, { renvois: ["the PR conflicts with the base"], cooksRates: 0 }] as const));
const fermee2963 = new Date(DEBUT_2979 + 11 * 60 * 60_000).toISOString();
// Le dépôt de la brigade tel que la station le lit : ses issues fermées disent quand, et la PR mergée qui les a fermées.
function brigadeLue(issues: { number: number; body: string; closedAt?: string }[], fermeesParUnMerge: number[], echec = false) {
  const lectures: number[] = [];
  const creees: number[] = [];
  const github = {
    issuesDepuis: async () => issues.map(({ number, body, closedAt }) => ({ number, body, association: "OWNER", state: closedAt === undefined ? ("open" as const) : ("closed" as const), ...(closedAt === undefined ? {} : { closedAt }) })),
    creerIssue: async () => {
      creees.push(3000 + creees.length);
      return 2999 + creees.length;
    },
    fermerIssue: async () => {},
    prQuiFerme: async (numero: number) => {
      lectures.push(numero);
      if (echec) throw new Error("gh api : HTTP 502");
      return fermeesParUnMerge.includes(numero) ? ({ number: 5000 + numero } as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof routerLeTempsPerdu>[0]["github"]["prQuiFerme"]>>>) : null;
    },
  };
  return { github, lectures, creees };
}
const mesurerSurLaBrigade = (brigade: ReturnType<typeof brigadeLue>, enregistrements: TempsTicket[]) =>
  correctionDuTemps({
    echantillonMin: 1,
    github: routerLeTempsPerdu({ github: brigade.github, servi: DEPOT_BRIGADE, dansLesTemps: (numero) => enregistrements.some((t) => t.ticket === numero) }),
    lire: () => ({ enregistrements, lostTimeMaxMin: 60, qualites: renvoyes(enregistrements) }),
    maintenant: () => new Date(DEBUT_2979 + 24 * 60 * 60_000),
  });

test("#2979: on benomite/brigade, a quality ticket another station merged waits for 20 tickets claimed after its closing — it does not reopen on the send-backs it counted", async () => {
  const brigade = brigadeLue([{ number: 2963, body: QUALITE, closedAt: fermee2963 }], [2963]);
  const enregistrements = conflits(3);
  assert.deepEqual(await mesurerSurLaBrigade(brigade, enregistrements)([]), { issue: "qualite", qualite: { issue: "en-attente", numero: 2963, manque: 17, causes: ["premier-coup"] } });
  assert.deepEqual(brigade.creees, []);
  // Sans la PR mergée qui l'a fermé, rien ne le date : la mesure se rouvre, comme avant le correctif.
  const sansMerge = brigadeLue([{ number: 2963, body: QUALITE, closedAt: fermee2963 }], []);
  assert.equal((await mesurerSurLaBrigade(sansMerge, enregistrements)([])).issue, "qualite");
  assert.deepEqual(sansMerge.creees, [3000]);
});

test("#2979: on benomite/brigade, a measure ticket closed without a merge — a duplicate the station closed, an issue closed as not planned — waits for nothing", async () => {
  // Le doublon : deux stations l'ont ouvert ensemble, la seconde l'a fermé (`fermerIssue`, sans PR).
  // L'issue « not planned » : aucune PR ne la ferme non plus. Ni l'une ni l'autre n'a de PR mergée.
  const brigade = brigadeLue([
    { number: 2963, body: QUALITE, closedAt: fermee2963 },
    { number: 2964, body: `${MARQUE_CORRECTION}\n`, closedAt: fermee2963 },
  ], []);
  const decision = await mesurerSurLaBrigade(brigade, conflits(3))([]);
  assert.deepEqual(decision, { issue: "qualite", qualite: { issue: "ouverte", numero: 3000, causes: ["premier-coup"] } });
  assert.deepEqual(brigade.lectures.sort(), [2963, 2964]);
});

test("#2979: on benomite/brigade, a measure ticket this station merged is dated by its merge in the times, and GitHub is not asked who closed it", async () => {
  // #2963 est dans les temps de la station, mergé avant les dix renvois : il ne les a pas attendus,
  // même si sa fermeture lue sur GitHub vient après eux.
  const enregistrements = [...pris(2963, 1, DEBUT_2979 - 2 * 60 * 60_000).map((t) => ({ ...t, attentePrise: 0 })), ...conflits(0)];
  const brigade = brigadeLue([{ number: 2963, body: QUALITE, closedAt: fermee2963 }], [2963]);
  const decision = await mesurerSurLaBrigade(brigade, enregistrements)([]);
  assert.deepEqual(decision, { issue: "qualite", qualite: { issue: "en-attente", numero: 2963, manque: 10, causes: ["premier-coup"] } });
  assert.deepEqual(brigade.lectures, []);
});

test("#2979: GitHub is asked once who closed a measure ticket; when it does not answer, the turn fails and opens nothing", async () => {
  const brigade = brigadeLue([{ number: 2963, body: QUALITE, closedAt: fermee2963 }, { number: 2950, body: "not a measure", closedAt: fermee2963 }], [2963]);
  const mesurer = mesurerSurLaBrigade(brigade, conflits(3));
  await mesurer([]);
  await mesurer([]);
  assert.deepEqual(brigade.lectures, [2963]);
  const enPanne = brigadeLue([{ number: 2963, body: QUALITE, closedAt: fermee2963 }], [2963], true);
  await assert.rejects(mesurerSurLaBrigade(enPanne, conflits(3))([]), /HTTP 502/);
  assert.deepEqual(enPanne.creees, []);
});

// #3012 : le compte de la station n'a pas l'écriture sur la brigade (`NONE`) ; son ticket ne se voyait pas, et se redéposait à chaque tour.
test("#3012: a station whose GitHub author has no write access files its measure once while it is open", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const lue: GitHubDeLaBrigade = { ...brigade.github, droits: async () => ({ login: "pierreyvesbobl", ecriture: false }), issuesDepuis: async () => brigade.issues.map(({ number, corps, state }) => ({ number, body: corps, association: "NONE", author: "pierreyvesbobl", state })) };
  const ouvrirEtranger = () => correctionDuTemps({ echantillonMin: 1, github: routerLeTempsPerdu({ github: projet.github, servi: "pierreyvesbobl/os-perso", brigade: lue }), lire: () => ({ enregistrements: temps(), lostTimeMaxMin: 2 }) })();
  const premiere = await ouvrirEtranger();
  assert.equal(premiere.issue, "ouverte");
  // Les tours suivants rendent le numéro du ticket déjà déposé, et ne déposent rien.
  assert.deepEqual(await ouvrirEtranger(), premiere);
  assert.deepEqual(await ouvrirEtranger(), premiere);
  assert.equal(brigade.issues.length, 1);
});

test("#3012: no lost-time ticket is filed from fewer than 20 merged tickets; with 20, one is", async () => {
  const lent = (combien: number): TempsTicket[] => Array.from({ length: combien }, (_, rang) => ({ ticket: rang + 1, attentePrise: 300, cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
  const depot = fauxDepot();
  const corriger = (combien: number) => correctionDuTemps({ github: depot.github, lire: () => ({ enregistrements: lent(combien), lostTimeMaxMin: 2 }) })();
  assert.equal((await corriger(1)).issue, "sous-le-seuil");
  assert.equal((await corriger(19)).issue, "sous-le-seuil");
  assert.equal(depot.issues.length, 0);
  assert.equal((await corriger(20)).issue, "ouverte");
});

test("#3012: a stranger's issue carrying a family mark silences no station", async () => {
  const projet = fauxDepot();
  const brigade = fauxDepot();
  const lue: GitHubDeLaBrigade = { ...brigade.github, droits: async () => ({ login: "pierreyvesbobl", ecriture: false }), issuesDepuis: async () => brigade.issues.map(({ number, corps, state }) => ({ number, body: corps, association: "NONE", author: "intrus", state })) };
  const ouvrirEtranger = () => correctionDuTemps({ echantillonMin: 1, github: routerLeTempsPerdu({ github: projet.github, servi: "pierreyvesbobl/os-perso", brigade: lue }), lire: () => ({ enregistrements: temps(), lostTimeMaxMin: 2 }) })();
  assert.equal((await ouvrirEtranger()).issue, "ouverte");
  // Le ticket déposé est celui d'un autre compte que la station : il ne couvre rien, le suivant se dépose.
  assert.equal((await ouvrirEtranger()).issue, "ouverte");
  assert.equal(brigade.issues.length, 2);
});
