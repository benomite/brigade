// Le budget GitHub de l'app (app/src/budget-github.ts, #3007) : six projets lus toute la journée restent loin du budget
// horaire du jeton du chef. Les lectures passent par la composition même de main.ts (`lireLeTableau`) — la lecture du
// rail, ce qui attend le chef et les cartes assignées, sous condition, sous le budget, au plus une fois par minute et par
// projet —, contre un GitHub en mémoire qui donne ses ETag, répond 304 et dit son budget (`x-ratelimit-*`). L'heure est
// simulée : aucun test n'attend l'horloge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { INTERVALLE_PAR_PROJET_MS, lectureSousBudget, LecturesEnPause, PAUSE_SANS_HEURE_MS, refusPourDepassement, tenirLeBudgetGitHub, type BudgetGitHub } from "../src/budget-github.ts";
import { avecCeQuiAttendLeChef } from "../src/tableau/attente-du-chef.ts";
import { parFetch, type AppelGitHub, type LimiteGitHub, type ReponseGitHub } from "../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot } from "../src/tableau/lecture.ts";
import { lectureConditionnelle, type MemoireDesLectures } from "../src/tableau/rail-github.ts";
import { tenirLecturesDuTableau } from "../src/tableau/rail.ts";
import { partageDesCartesAssignees } from "../src/vue/cartes-assignees/cartes-assignees.ts";

const DEBUT = Date.parse("2026-11-09T08:00:00.000Z");
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const PROJETS = ["chef/un", "chef/deux", "chef/trois", "chef/quatre", "chef/cinq", "chef/six"].map((depot) => ({ nom: depot.split("/")[1]!, depot }));

const issue = (depot: string, number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${depot}/issues/${number}`,
  created_at: "2026-11-08T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});

type Demande = { chemin: string; entetes: Record<string, string>; a: number; status: number };

// Un GitHub en mémoire, à l'heure de `horloge`. Chaque réponse porte son ETag, et un `If-None-Match` qui le redonne
// reçoit un 304 sans corps. `changeToutesLes` : chaque projet change aussi souvent — un label, un commentaire —, ce qui
// change les listes d'issues et les commentaires du ticket pris. `limite` : le budget qu'il dit, à chaque réponse.
// `repondre` : une réponse imposée, avant tout le reste.
function fauxGitHub(horloge: { t: number }, options: { changeToutesLes?: number; limite?: () => LimiteGitHub; repondre?: (chemin: string) => ReponseGitHub | undefined } = {}) {
  const demandes: Demande[] = [];
  const limite = options.limite ?? (() => ({ restant: 4_500, total: 5_000, repriseLe: horloge.t + 30 * MINUTE }));
  const donnees = (chemin: string): { data: unknown; version: number } | { status: number } => {
    const depot = /^\/repos\/([^/]+\/[^/?]+)/.exec(chemin)?.[1] ?? "";
    const version = options.changeToutesLes === undefined ? 0 : Math.floor((horloge.t - DEBUT) / options.changeToutesLes);
    const auFeu = [issue(depot, 1, ["fire", "prio:2"]), issue(depot, 2, ["fire", "taken", "prio:1"]), issue(depot, 3, ["fire", "in-pass"]), issue(depot, 4, ["fire", version % 2 === 0 ? "prio:3" : "prio:4"])];
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { data: auFeu, version };
    if (chemin.includes("/issues?")) return { data: [...auFeu, issue(depot, 5, ["blocked-on-human"]), issue(depot, 6, ["model:opus", "effort:high"]), issue(depot, 7, [])], version };
    if (chemin.includes("/pulls?state=open")) return { data: [{ number: 40, html_url: `https://github.com/${depot}/pull/40`, created_at: "2026-11-09T07:00:00Z", head: { ref: "cook/3-x" }, body: "" }], version: 0 };
    if (chemin.includes("/pulls?")) return { data: [], version: 0 };
    if (chemin === `/repos/${depot}`) return { data: { default_branch: "main", owner: { login: "chef", type: "User" } }, version: 0 };
    if (chemin.includes("/contents/")) return { data: { content: btoa(JSON.stringify({ chef: "chef" })) }, version: 0 };
    if (chemin.includes("/check-runs")) return { data: { check_runs: [{ conclusion: "success" }] }, version: 0 };
    if (chemin.includes("/issues/2/comments")) return { data: [{ id: 9, body: "<!-- brigade:prise station=box/claude -->", author_association: "OWNER", created_at: "2026-11-09T07:30:00Z" }], version };
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return { data: [], version: 0 };
    return { status: 404 };
  };
  const appeler: AppelGitHub = async (chemin, entetes = {}) => {
    const imposee = options.repondre?.(chemin);
    const lue = donnees(chemin);
    const reponse: ReponseGitHub =
      imposee ??
      ("status" in lue
        ? { status: lue.status, data: { message: "Not Found" }, limite: limite() }
        : entetes["If-None-Match"] === `"${chemin}#${lue.version}"`
          ? { status: 304, data: "", etag: `"${chemin}#${lue.version}"`, limite: limite() }
          : { status: 200, data: lue.data, etag: `"${chemin}#${lue.version}"`, limite: limite() });
    demandes.push({ chemin, entetes, a: horloge.t, status: reponse.status });
    return reponse;
  };
  return { appeler, demandes };
}

// La lecture des projets telle que main.ts la compose (`lireLeTableau`, `tableaux`).
function lectureDeLApp(horloge: { t: number }, appelerGitHub: AppelGitHub, budget: BudgetGitHub = tenirLeBudgetGitHub({ maintenant: () => horloge.t })) {
  const appelerSousBudget = budget.appeler(appelerGitHub);
  const memoires = new Map<string, MemoireDesLectures>();
  const memoireDuRail = (depot: string): MemoireDesLectures => memoires.get(depot) ?? memoires.set(depot, new Map()).get(depot)!;
  const lireLeTableau = (projet: { nom: string; depot: string }): Promise<LectureDuTableauDuDepot> =>
    lectureSousBudget({
      budget,
      depot: projet.depot,
      dernier: () => tableaux.dernier(projet.nom),
      maintenant: () => horloge.t,
      lire: async () => {
        const { depot } = projet;
        const lu = await lireLeTableauDuDepot({ depot, appeler: appelerSousBudget, memoire: memoireDuRail(depot), maintenant: () => new Date(horloge.t) });
        const appeler = lectureConditionnelle(appelerSousBudget, memoireDuRail(depot));
        return avecCeQuiAttendLeChef(lu, appeler, partageDesCartesAssignees({ appeler, depot, login: async () => "chef" }));
      },
    });
  const tableaux = tenirLecturesDuTableau({ lire: lireLeTableau, fraicheurMs: INTERVALLE_PAR_PROJET_MS, maintenant: () => horloge.t });
  return { budget, tableaux };
}

// Les veilles de l'app relisent chaque projet toutes les trente secondes (main.ts) : un tour de lecture, à cette heure.
async function unTour(tableaux: { lire(projet: (typeof PROJETS)[number]): Promise<LectureDuTableauDuDepot> }): Promise<LectureDuTableauDuDepot[]> {
  return Promise.all(PROJETS.map((projet) => tableaux.lire(projet)));
}

// Six projets lus huit heures simulées, une heure par test pour que chacun reste court : les tests d'un fichier se jouent
// l'un après l'autre, dans l'ordre, et chaque heure reprend la cuisine où la précédente l'a laissée. Une cuisine
// affairée : chaque projet change toutes les trois minutes.
const journee = (() => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge, { changeToutesLes: 3 * MINUTE });
  return { horloge, github, ...lectureDeLApp(horloge, github.appeler) };
})();

for (let heure = 0; heure < 8; heure++) {
  test(`simulated hour ${heure + 1} of 8: six projects polled stay at most at 1,000 counted GitHub requests`, async () => {
    const { horloge, github, budget, tableaux } = journee;
    const fin = DEBUT + (heure + 1) * HEURE;
    let plusHaut = 0;
    // Les veilles relisent toutes les trente secondes, mais un projet relu depuis moins d'une minute reprend sa lecture
    // sans rien demander : un tour par minute fait les mêmes demandes, en deux fois moins de temps.
    for (; horloge.t < fin; horloge.t += INTERVALLE_PAR_PROJET_MS) {
      // Un geste du chef toutes les dix minutes : la lecture suivante va à GitHub, sans reprendre la dernière (main.ts).
      if ((horloge.t - DEBUT) % (10 * MINUTE) === 0) tableaux.oublier();
      const lues = await unTour(tableaux);
      assert.ok(lues.every((lue) => lue.lu), "every rail is read");
      plusHaut = Math.max(plusHaut, budget.demandesDeLaDerniereHeure().comptees);
    }
    // Ce que GitHub a reçu dans cette heure : ce qu'il compte (tout sauf un 304), et ce qui est parti.
    const recues = github.demandes.filter(({ a }) => a >= fin - HEURE && a < fin);
    const comptees = recues.filter(({ status }) => status !== 304).length;
    console.log(`simulated hour ${heure + 1}: ${comptees} counted requests, ${recues.length} sent (304 included), ${plusHaut} in the busiest sliding hour`);
    assert.ok(comptees > 0);
    assert.ok(comptees <= 1_000, `${comptees} counted requests in the simulated hour`);
    assert.ok(plusHaut <= 1_000, `${plusHaut} counted requests in the busiest sliding hour`);
    // Le compteur du module dit ce que GitHub a reçu dans la dernière heure.
    const derniere = github.demandes.filter(({ a }) => a > horloge.t - HEURE);
    assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: derniere.length, comptees: derniere.filter(({ status }) => status !== 304).length });
  });
}

test("a project is not read again within a minute, unless a gesture forgets the reading", async () => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge);
  const { tableaux } = lectureDeLApp(horloge, github.appeler);
  await unTour(tableaux);
  const premiere = github.demandes.length;
  assert.ok(premiere > 0);
  horloge.t += INTERVALLE_PAR_PROJET_MS - 1;
  await unTour(tableaux);
  assert.equal(github.demandes.length, premiere, "nothing is sent within the minute");
  horloge.t += 1;
  await unTour(tableaux);
  assert.ok(github.demandes.length > premiere, "the minute past, every project is read again");
});

test("a 304 is not downloaded again: the kept answer is reused, and the stored ETag goes with the next request", async () => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge);
  const budget = tenirLeBudgetGitHub({ maintenant: () => horloge.t });
  const memoire: MemoireDesLectures = new Map();
  const appeler = lectureConditionnelle(budget.appeler(github.appeler), memoire);
  const chemin = "/repos/chef/un/issues?state=open&labels=fire";
  const premiere = await appeler(chemin);
  assert.equal(premiere.status, 200);
  assert.equal(github.demandes[0]!.entetes["If-None-Match"], undefined);
  const seconde = await appeler(chemin);
  assert.equal(github.demandes[1]!.entetes["If-None-Match"], premiere.etag, "the stored ETag is sent");
  assert.equal(github.demandes[1]!.status, 304);
  assert.deepEqual(seconde, { status: 200, data: premiere.data, etag: premiere.etag }, "the kept body is reused");
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 2, comptees: 1 }, "the 304 is sent but not counted");
});

test("under 20% of the budget left, reads pause for every project until the reset time, then resume", async () => {
  const horloge = { t: DEBUT };
  const reprise = DEBUT + 25 * MINUTE;
  let restant = 1_000;
  const github = fauxGitHub(horloge, { limite: () => ({ restant, total: 5_000, repriseLe: reprise }) });
  const { budget, tableaux } = lectureDeLApp(horloge, github.appeler);
  // 1,000 of 5,000 is 20%: not under it.
  const lues = await unTour(tableaux);
  assert.ok(lues.every((lue) => lue.lu));
  assert.equal(budget.enPauseJusqua(), null);
  // Under it: the read in course stops at the next request, and every project keeps its last rail.
  restant = 999;
  horloge.t += INTERVALLE_PAR_PROJET_MS;
  const avant = github.demandes.length;
  const enPause = await unTour(tableaux);
  assert.equal(budget.enPauseJusqua(), reprise);
  // The six reads left together: each sent its first request before the first answer said the budget is low, then
  // nothing more left.
  assert.equal(github.demandes.length, avant + PROJETS.length, "one request per project, then nothing");
  assert.deepEqual(enPause, lues, "every project keeps its last rail");
  for (; horloge.t < reprise; horloge.t += 30_000) await unTour(tableaux);
  horloge.t = reprise - 1;
  tableaux.oublier();
  await unTour(tableaux);
  assert.equal(github.demandes.length, avant + PROJETS.length, "no project is read before the reset time");
  // The reset time: every project is read again.
  restant = 5_000;
  horloge.t = reprise;
  tableaux.oublier();
  const reprises = await unTour(tableaux);
  assert.equal(budget.enPauseJusqua(), null);
  assert.ok(reprises.every((lue) => lue.lu && lue.luLe === new Date(reprise).toISOString()), "every project is read at the reset time");
  for (const { depot } of PROJETS) assert.ok(github.demandes.some(({ chemin, a }) => a === reprise && chemin.startsWith(`/repos/${depot}/`)), `${depot} is read again`);
});

test("after a rate-limit refusal no request is sent before the reset time, and a project never read says the pause", async () => {
  const horloge = { t: DEBUT };
  const reprise = DEBUT + 40 * MINUTE;
  let refuser = true;
  const github = fauxGitHub(horloge, {
    repondre: () => (refuser ? { status: 403, data: { message: "API rate limit exceeded for user ID 1. If you reach out to GitHub Support…" }, limite: { restant: 0, total: 5_000, repriseLe: reprise } } : undefined),
  });
  const { budget, tableaux } = lectureDeLApp(horloge, github.appeler);
  const lues = await unTour(tableaux);
  // The six reads left together: each had sent its first request before the first refusal came back, none sent another.
  assert.equal(github.demandes.length, PROJETS.length, "the first refusal stops every read");
  assert.equal(new Set(github.demandes.map(({ chemin }) => chemin.split("/issues")[0])).size, PROJETS.length, "one request per project");
  assert.equal(budget.enPauseJusqua(), reprise);
  for (const lue of lues) {
    assert.equal(lue.lu, false);
    assert.match(lue.lu ? "" : lue.raison, /is not read until 2026-11-09 08:40 UTC: GitHub refused a read for going over the rate limit \(HTTP 403\), so the app paused its GitHub reads for every project \(\d+ counted requests in the last hour\)/);
  }
  refuser = false;
  for (; horloge.t < reprise; horloge.t += 30_000) {
    tableaux.oublier();
    await unTour(tableaux);
  }
  assert.equal(github.demandes.length, PROJETS.length, "no request before the reset time");
  horloge.t = reprise;
  tableaux.oublier();
  assert.ok((await unTour(tableaux)).every((lue) => lue.lu), "the reset time come, every rail is read");
});

test("a refusal with retry-after pauses that long; one that gives no time pauses a minute; a 429 is a refusal", async () => {
  const horloge = { t: DEBUT };
  const budget = tenirLeBudgetGitHub({ maintenant: () => horloge.t });
  let reponse: ReponseGitHub = { status: 403, data: { message: "You have exceeded a secondary rate limit" }, reessayerApresMs: 90_000 };
  const appeler = budget.appeler(async () => reponse);
  await appeler("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), DEBUT + 90_000);
  await assert.rejects(appeler("/repos/chef/un"), (erreur: unknown) => erreur instanceof LecturesEnPause && erreur.jusqua === DEBUT + 90_000);
  horloge.t = DEBUT + 90_000;
  reponse = { status: 429, data: "" };
  await appeler("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), DEBUT + 90_000 + PAUSE_SANS_HEURE_MS);
  // A 403 that is not about the rate limit, or a 404, pauses nothing.
  assert.equal(refusPourDepassement({ status: 403, data: { message: "Resource not accessible by integration" } }), false);
  assert.equal(refusPourDepassement({ status: 404, data: {}, limite: { restant: 0, total: 60, repriseLe: DEBUT } }), false);
});

test("a read that fails or carries no budget headers decides no pause; the failed one is sent but not counted", async () => {
  const horloge = { t: DEBUT };
  const budget = tenirLeBudgetGitHub({ maintenant: () => horloge.t });
  let echoue = true;
  const appeler = budget.appeler(async () => {
    if (echoue) throw new Error("getaddrinfo ENOTFOUND api.github.com");
    return { status: 200, data: [] };
  });
  await assert.rejects(appeler("/repos/chef/un"), /ENOTFOUND/);
  echoue = false;
  assert.equal((await appeler("/repos/chef/un")).status, 200);
  assert.equal(budget.enPauseJusqua(), null);
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 2, comptees: 1 });
  // An hour later, both have left the counter.
  horloge.t += HEURE;
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 0, comptees: 0 });
});

test("the desktop's fetch reads GitHub's budget headers, and leaves out those it cannot read", async () => {
  const faux = (entetes: Record<string, string>) => (async () => new Response("[]", { status: 200, headers: entetes })) as unknown as typeof fetch;
  const lue = await parFetch({ fetch: faux({ "x-ratelimit-remaining": "812", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793000000", "retry-after": "30", etag: '"e"' }) })("https://api.github.com/x", {});
  assert.deepEqual(lue, { status: 200, data: [], etag: '"e"', limite: { restant: 812, total: 5_000, repriseLe: 1_793_000_000_000 }, reessayerApresMs: 30_000 });
  const illisible = await parFetch({ fetch: faux({ "x-ratelimit-remaining": "beaucoup", "x-ratelimit-limit": "5000", "x-ratelimit-reset": "1793000000", "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }) })("https://api.github.com/x", {});
  assert.deepEqual(illisible, { status: 200, data: [] });
});
