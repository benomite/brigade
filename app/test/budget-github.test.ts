// Le budget GitHub de l'app (app/src/budget-github.ts, #3007) : six projets lus toute la journée restent loin du budget
// horaire du jeton du chef. Les lectures passent par la composition même de main.ts (`lireLeTableau`) — la lecture du
// rail, ce qui attend le chef et les cartes assignées, sous condition, sous le budget, au plus une fois par minute et par
// projet —, contre un GitHub en mémoire qui donne ses ETag, répond 304 et dit son budget (`x-ratelimit-*`). L'heure est
// simulée : aucun test n'attend l'horloge.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSousBudget, LecturesEnPause, PAUSE_SANS_HEURE_MS, refusalPourDepassement, holdLeBudgetGitHub, type BudgetGitHub } from "../src/budget-github.ts";
import { avecCeQuiAwaitingLeChef } from "../src/tableau/wait-du-chef.ts";
import { parFetch, type CallGitHub, type LimitGitHub, type AnswerGitHub } from "../src/tableau/client.ts";
import { lireLeTableauDuRepository, type ReadDuTableauDuRepository } from "../src/tableau/read.ts";
import { readConditionnelle, type MemoireDesLectures } from "../src/tableau/rail-github.ts";
import { FRAICHEUR_MAX_D_UNE_READ_MS } from "../src/vue/served/fraicheur.ts";
import { holdLecturesDuTableau } from "../src/tableau/rail.ts";
import { partageDesCardsAssignees } from "../src/vue/cards-assignees/cards-assignees.ts";

const DEBUT = Date.parse("2026-11-09T08:00:00.000Z");
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const PROJECTS = ["chef/un", "chef/deux", "chef/trois", "chef/quatre", "chef/cinq", "chef/six"].map((repository) => ({ nom: repository.split("/")[1]!, depot: repository }));

const issue = (repository: string, number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${repository}/issues/${number}`,
  created_at: "2026-11-08T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});

type Request = { chemin: string; entetes: Record<string, string>; a: number; status: number };

// Un GitHub en mémoire, à l'heure de `horloge`. Chaque réponse porte son ETag, et un `If-None-Match` qui le redonne
// reçoit un 304 sans corps. `changeToutesLes` : chaque projet change aussi souvent — un label, un commentaire —, ce qui
// change les listes d'issues et les commentaires du ticket pris. `limite` : le budget qu'il dit, à chaque réponse.
// `repondre` : une réponse imposée, avant tout le reste.
function fauxGitHub(horloge: { t: number }, options: { changeToutesLes?: number; limite?: () => LimitGitHub; repondre?: (chemin: string) => AnswerGitHub | undefined } = {}) {
  const demandes: Request[] = [];
  const limit = options.limite ?? (() => ({ restant: 4_500, total: 5_000, repriseLe: horloge.t + 30 * MINUTE }));
  const donnees = (chemin: string): { data: unknown; version: number } | { status: number } => {
    const repository = /^\/repos\/([^/]+\/[^/?]+)/.exec(chemin)?.[1] ?? "";
    const version = options.changeToutesLes === undefined ? 0 : Math.floor((horloge.t - DEBUT) / options.changeToutesLes);
    const auFeu = [issue(repository, 1, ["fire", "prio:2"]), issue(repository, 2, ["fire", "taken", "prio:1"]), issue(repository, 3, ["fire", "in-pass"]), issue(repository, 4, ["fire", version % 2 === 0 ? "prio:3" : "prio:4"])];
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return { data: auFeu, version };
    if (chemin.includes("/issues?")) return { data: [...auFeu, issue(repository, 5, ["blocked-on-human"]), issue(repository, 6, ["model:opus", "effort:high"]), issue(repository, 7, [])], version };
    if (chemin.includes("/pulls?state=open")) return { data: [{ number: 40, html_url: `https://github.com/${repository}/pull/40`, created_at: "2026-11-09T07:00:00Z", head: { ref: "cook/3-x" }, body: "" }], version: 0 };
    if (chemin.includes("/pulls?")) return { data: [], version: 0 };
    if (/\/pulls\/\d+$/.test(chemin)) return { data: { additions: 135, deletions: 21, created_at: "2026-11-09T07:00:00Z" }, version: 0 };
    if (chemin === `/repos/${repository}`) return { data: { default_branch: "main", owner: { login: "chef", type: "User" } }, version: 0 };
    if (chemin.includes("/contents/")) return { data: { content: btoa(JSON.stringify({ chef: "chef" })) }, version: 0 };
    if (chemin.includes("/check-runs")) return { data: { check_runs: [{ conclusion: "success" }] }, version: 0 };
    if (chemin.includes("/issues/2/comments")) return { data: [{ id: 9, body: "<!-- brigade:prise station=box/claude -->", author_association: "OWNER", created_at: "2026-11-09T07:30:00Z" }], version };
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return { data: [], version: 0 };
    return { status: 404 };
  };
  const appeler: CallGitHub = async (chemin, entetes = {}) => {
    const imposee = options.repondre?.(chemin);
    const lue = donnees(chemin);
    const answer: AnswerGitHub =
      imposee ??
      ("status" in lue
        ? { status: lue.status, data: { message: "Not Found" }, limite: limit() }
        : entetes["If-None-Match"] === `"${chemin}#${lue.version}"`
          ? { status: 304, data: "", etag: `"${chemin}#${lue.version}"`, limite: limit() }
          : { status: 200, data: lue.data, etag: `"${chemin}#${lue.version}"`, limite: limit() });
    demandes.push({ chemin, entetes, a: horloge.t, status: answer.status });
    return answer;
  };
  return { appeler, demandes };
}

// La lecture des projets telle que main.ts la compose (`lireLeTableau`, `tableaux`).
function readDeLApp(horloge: { t: number }, appelerGitHub: CallGitHub, budget: BudgetGitHub = holdLeBudgetGitHub({ maintenant: () => horloge.t })) {
  const appelerSousBudget = budget.appeler(appelerGitHub);
  const memoires = new Map<string, MemoireDesLectures>();
  const memoireDuRail = (repository: string): MemoireDesLectures => memoires.get(repository) ?? memoires.set(repository, new Map()).get(repository)!;
  const lireLeTableau = (project: { nom: string; depot: string }): Promise<ReadDuTableauDuRepository> =>
    readSousBudget({
      budget,
      depot: project.depot,
      dernier: () => tableaux.dernier(project.nom),
      maintenant: () => horloge.t,
      lire: async () => {
        const { depot: repository } = project;
        const lu = await lireLeTableauDuRepository({ depot: repository, appeler: appelerSousBudget, memoire: memoireDuRail(repository), maintenant: () => new Date(horloge.t) });
        const appeler = readConditionnelle(appelerSousBudget, memoireDuRail(repository));
        return avecCeQuiAwaitingLeChef(lu, appeler, partageDesCardsAssignees({ appeler, depot: repository, login: async () => "chef" }));
      },
    });
  const tableaux = holdLecturesDuTableau({ lire: lireLeTableau, fraicheurMs: INTERVALLE_PAR_PROJECT_MS, maintenant: () => horloge.t });
  return { budget, tableaux };
}

// Les veilles de l'app relisent chaque projet toutes les cinq secondes (main.ts) : un tour de lecture, à cette heure.
// La simulation avance d'une minute par tour : une lecture fait une quinzaine de demandes, mais GitHub ne compte que ce qui a changé.
const INTERVALLE_PAR_PROJECT_MS = 60_000;
async function unTour(tableaux: { lire(project: (typeof PROJECTS)[number]): Promise<ReadDuTableauDuRepository> }): Promise<ReadDuTableauDuRepository[]> {
  return Promise.all(PROJECTS.map((project) => tableaux.lire(project)));
}

// Six projets lus huit heures simulées, une heure par test pour que chacun reste court : les tests d'un fichier se jouent
// l'un après l'autre, dans l'ordre, et chaque heure reprend la cuisine où la précédente l'a laissée. Une cuisine
// affairée : chaque projet change toutes les trois minutes.
const journee = (() => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge, { changeToutesLes: 3 * MINUTE });
  return { horloge, github, ...readDeLApp(horloge, github.appeler) };
})();

for (let heure = 0; heure < 8; heure++) {
  test(`simulated hour ${heure + 1} of 8: six projects polled stay at most at 1,000 counted GitHub requests`, async () => {
    const { horloge, github, budget, tableaux } = journee;
    const fin = DEBUT + (heure + 1) * HEURE;
    let plusHaut = 0;
    // Les veilles relisent toutes les cinq secondes ; un tour par minute simule ce qu'elles demandent, en moins de temps ; les relectures d'un rail inchangé sont des 304, que GitHub ne compte pas.
    for (; horloge.t < fin; horloge.t += INTERVALLE_PAR_PROJECT_MS) {
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

test("a project is not read again within a reading's freshness (4 s), unless a gesture forgets the reading", async () => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge);
  const { tableaux } = readDeLApp(horloge, github.appeler);
  await unTour(tableaux);
  const first = github.demandes.length;
  assert.ok(first > 0);
  horloge.t += FRAICHEUR_MAX_D_UNE_READ_MS - 1;
  await unTour(tableaux);
  assert.equal(github.demandes.length, first, "nothing is sent within the freshness");
  horloge.t += 1;
  await unTour(tableaux);
  assert.ok(github.demandes.length > first, "the freshness past, every project is read again");
});

test("a 304 is not downloaded again: the kept answer is reused, and the stored ETag goes with the next request", async () => {
  const horloge = { t: DEBUT };
  const github = fauxGitHub(horloge);
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  const memoire: MemoireDesLectures = new Map();
  const appeler = readConditionnelle(budget.appeler(github.appeler), memoire);
  const chemin = "/repos/chef/un/issues?state=open&labels=fire";
  const first = await appeler(chemin);
  assert.equal(first.status, 200);
  assert.equal(github.demandes[0]!.entetes["If-None-Match"], undefined);
  const seconde = await appeler(chemin);
  assert.equal(github.demandes[1]!.entetes["If-None-Match"], first.etag, "the stored ETag is sent");
  assert.equal(github.demandes[1]!.status, 304);
  assert.deepEqual(seconde, { status: 200, data: first.data, etag: first.etag }, "the kept body is reused");
  assert.deepEqual(budget.demandesDeLaDerniereHeure(), { parties: 2, comptees: 1 }, "the 304 is sent but not counted");
});

test("under 20% of the budget left, reads pause for every project until the reset time, then resume", async () => {
  const horloge = { t: DEBUT };
  const resumption = DEBUT + 25 * MINUTE;
  let restant = 1_000;
  const github = fauxGitHub(horloge, { limite: () => ({ restant, total: 5_000, repriseLe: resumption }) });
  const { budget, tableaux } = readDeLApp(horloge, github.appeler);
  // 1,000 of 5,000 is 20%: not under it.
  const lues = await unTour(tableaux);
  assert.ok(lues.every((lue) => lue.lu));
  assert.equal(budget.enPauseJusqua(), null);
  // Under it: the read in course stops at the next request, and every project keeps its last rail.
  restant = 999;
  horloge.t += INTERVALLE_PAR_PROJECT_MS;
  const avant = github.demandes.length;
  const enPause = await unTour(tableaux);
  assert.equal(budget.enPauseJusqua(), resumption);
  // The six reads left together: each sent its first request before the first answer said the budget is low, then
  // nothing more left.
  assert.equal(github.demandes.length, avant + PROJECTS.length, "one request per project, then nothing");
  assert.deepEqual(enPause, lues, "every project keeps its last rail");
  for (; horloge.t < resumption; horloge.t += 30_000) await unTour(tableaux);
  horloge.t = resumption - 1;
  tableaux.oublier();
  await unTour(tableaux);
  assert.equal(github.demandes.length, avant + PROJECTS.length, "no project is read before the reset time");
  // The reset time: every project is read again.
  restant = 5_000;
  horloge.t = resumption;
  tableaux.oublier();
  const reprises = await unTour(tableaux);
  assert.equal(budget.enPauseJusqua(), null);
  assert.ok(reprises.every((lue) => lue.lu && lue.luLe === new Date(resumption).toISOString()), "every project is read at the reset time");
  for (const { depot: repository } of PROJECTS) assert.ok(github.demandes.some(({ chemin, a }) => a === resumption && chemin.startsWith(`/repos/${repository}/`)), `${repository} is read again`);
});

test("after a rate-limit refusal no request is sent before the reset time, and a project never read says the pause", async () => {
  const horloge = { t: DEBUT };
  const resumption = DEBUT + 40 * MINUTE;
  let refuser = true;
  const github = fauxGitHub(horloge, {
    repondre: () => (refuser ? { status: 403, data: { message: "API rate limit exceeded for user ID 1. If you reach out to GitHub Support…" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } } : undefined),
  });
  const { budget, tableaux } = readDeLApp(horloge, github.appeler);
  const lues = await unTour(tableaux);
  // The six reads left together: each had sent its first request before the first refusal came back, none sent another.
  assert.equal(github.demandes.length, PROJECTS.length, "the first refusal stops every read");
  assert.equal(new Set(github.demandes.map(({ chemin }) => chemin.split("/issues")[0])).size, PROJECTS.length, "one request per project");
  assert.equal(budget.enPauseJusqua(), resumption);
  for (const lue of lues) {
    assert.equal(lue.lu, false);
    assert.match(lue.lu ? "" : lue.raison, /is not read until 2026-11-09 08:40 UTC: GitHub refused a read for going over the rate limit \(HTTP 403\), so the app paused its GitHub reads for every project \(\d+ counted requests in the last hour\)/);
  }
  refuser = false;
  for (; horloge.t < resumption; horloge.t += 30_000) {
    tableaux.oublier();
    await unTour(tableaux);
  }
  assert.equal(github.demandes.length, PROJECTS.length, "no request before the reset time");
  horloge.t = resumption;
  tableaux.oublier();
  assert.ok((await unTour(tableaux)).every((lue) => lue.lu), "the reset time come, every rail is read");
});

test("a refusal with retry-after pauses that long; one that gives no time pauses a minute; a 429 is a refusal", async () => {
  const horloge = { t: DEBUT };
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  let answer: AnswerGitHub = { status: 403, data: { message: "You have exceeded a secondary rate limit" }, reessayerApresMs: 90_000 };
  const appeler = budget.appeler(async () => answer);
  await appeler("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), DEBUT + 90_000);
  await assert.rejects(appeler("/repos/chef/un"), (error: unknown) => error instanceof LecturesEnPause && error.jusqua === DEBUT + 90_000);
  horloge.t = DEBUT + 90_000;
  answer = { status: 429, data: "" };
  await appeler("/repos/chef/un");
  assert.equal(budget.enPauseJusqua(), DEBUT + 90_000 + PAUSE_SANS_HEURE_MS);
  // A 403 that is not about the rate limit, or a 404, pauses nothing.
  assert.equal(refusalPourDepassement({ status: 403, data: { message: "Resource not accessible by integration" } }), false);
  assert.equal(refusalPourDepassement({ status: 404, data: {}, limite: { restant: 0, total: 60, repriseLe: DEBUT } }), false);
});

test("a read that fails or carries no budget headers decides no pause; the failed one is sent but not counted", async () => {
  const horloge = { t: DEBUT };
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
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

// #3414 : « read again » after the reset time, and a pause that says who spends the quota.
const lireSousBudget = (budget: BudgetGitHub, appeler: CallGitHub, horloge: { t: number }) =>
  readSousBudget({ budget, depot: "chef/un", maintenant: () => horloge.t, dernier: () => undefined, lire: async () => {
    const answer = await budget.appeler(appeler)("/repos/chef/un");
    return answer.status === 200 ? { lu: true } as unknown as ReadDuTableauDuRepository : { lu: false, depot: "chef/un", luLe: new Date(horloge.t).toISOString(), raison: "refused" };
  } });

test("the pause time on screen is never earlier than the real one; once it has passed, one read draws the rail", async () => {
  const horloge = { t: DEBUT };
  const resumption = DEBUT + 54 * MINUTE + 20_000;
  let limit: LimitGitHub = { restant: 542, total: 5_000, repriseLe: resumption };
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  const appeler: CallGitHub = async () => ({ status: 200, data: [], limite: limit });
  await budget.appeler(appeler)("/repos/chef/un");
  const pause = await lireSousBudget(budget, appeler, horloge);
  assert.match(pause.lu ? "" : pause.raison, /is not read until 2026-11-09 08:55 UTC/, "08:54:20 is shown as 08:55, not 08:54");
  horloge.t = resumption;
  limit = { restant: 4_994, total: 5_000, repriseLe: resumption + HEURE };
  assert.equal((await lireSousBudget(budget, appeler, horloge)).lu, true, "one read at the reset time draws the rail");
});

test("if GitHub still refuses after the reset time, the message names the new wait, not the passed time", async () => {
  const horloge = { t: DEBUT };
  const resumption = DEBUT + 10 * MINUTE;
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  let answer: AnswerGitHub = { status: 403, data: { message: "API rate limit exceeded" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } };
  const appeler: CallGitHub = async () => answer;
  await lireSousBudget(budget, appeler, horloge);
  horloge.t = resumption + 5 * MINUTE;
  answer = { status: 403, data: { message: "API rate limit exceeded" }, limite: { restant: 0, total: 5_000, repriseLe: resumption } };
  const lue = await lireSousBudget(budget, appeler, horloge);
  assert.match(lue.lu ? "" : lue.raison, /is not read until 2026-11-09 08:16 UTC/, "the wait is counted from now, not the passed 08:10");
});

test("the pause says something else uses the quota when the app counted only a small part of what was spent", async () => {
  const horloge = { t: DEBUT };
  const budget = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  let restant = 4_000;
  const appeler: CallGitHub = async () => ({ status: 200, data: [], limite: { restant, total: 5_000, repriseLe: DEBUT + 50 * MINUTE } });
  for (let i = 0; i < 5; i++) await budget.appeler(appeler)("/repos/chef/un");
  restant = 542;
  await budget.appeler(appeler)("/repos/chef/un");
  const lue = await lireSousBudget(budget, appeler, horloge);
  assert.match(lue.lu ? "" : lue.raison, /Something else uses the quota on this account: GitHub counts 4458 requests spent, the app only 6\./);
  // When the app spent most of what was spent, the message does not blame anything else.
  const only = holdLeBudgetGitHub({ maintenant: () => horloge.t });
  let reste = 10;
  const presque: CallGitHub = async () => ({ status: 200, data: [], limite: { restant: reste, total: 10, repriseLe: DEBUT + HEURE } });
  for (let i = 0; i < 5; i++) await only.appeler(presque)("/repos/chef/un");
  reste = 1;
  await only.appeler(presque)("/repos/chef/un");
  const sans = await lireSousBudget(only, presque, horloge);
  assert.match(sans.lu ? "" : sans.raison, /is not read until/);
  assert.doesNotMatch(sans.lu ? "" : sans.raison, /Something else/);
});
