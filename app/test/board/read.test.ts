// La cuisine d'un projet, lue de GitHub seul par les apps (app/src/board/read.ts, #2061) : le rail — ses issues
// `fire`, leurs labels, leurs PR, la station qui tient chacune —, puis ce qui est avant le rail, rangé d'après les
// labels seuls ; et, quand rien ne se lit, un échec qui dit pourquoi en une phrase — jamais un rail vide. Rien ne passe
// par le réseau : l'appel à GitHub est une doublure, qui répond selon le chemin demandé.
import { LABELS_D_AVANT_PARKED } from "../../../runtime/src/github-etat/etats.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { beforeTheRailOf, readTheBoardOfRepository, type ReadOfBoardOfRepository, type BoardRead, type BoardNotRead } from "../../src/board/read.ts";

const REPOSITORY = "chef/parade";
const READ_THE = new Date("2026-11-04T03:00:00.000Z");

const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const taking = (id: number, station: string, the: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: the });

// Le rail : #1 en attente (prio:2), calibré par le manager — rien ne le bloque (le rail bloqué, #3358 :
// test/rail-blocked/) —, #2 pris par box/claude (prio:1), #3 en pass par la PR #40, cuisiné par mac/claude — et une PR que
// l'API des issues rend comme une issue.
const AT_FIRE = [issue(1, ["fire", "prio:2", "model:sonnet", "effort:medium"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })];
// Les issues ouvertes : le rail, et ce qui est avant lui — une de chaque état, une PR.
const OPEN = [
  ...AT_FIRE,
  issue(5, ["served-elsewhere"]),
  issue(6, ["blocked-on-human", "prio:1"]),
  issue(7, ["epic", "prio:3"]),
  issue(8, ["model:opus", "effort:high", "prio:1"]),
  issue(9, ["model:opus"]),
  issue(10, []),
  issue(11, [], { pull_request: {} }),
];

// Un GitHub qui répond selon le chemin, et retient les chemins demandés. `ouvertes` : sa réponse à la liste de toutes
// les issues ouvertes (ce qui est avant le rail).
function github(options: { ouvertes?: AnswerGitHub } = {}): { appeler: CallGitHub; chemins: string[] } {
  const paths: string[] = [];
  return {
    chemins: paths,
    appeler: async (path) => {
      paths.push(path);
      if (path.includes("/issues?") && path.includes("labels=fire")) return ok(AT_FIRE);
      if (path.includes("/issues?")) return options.ouvertes ?? ok(OPEN);
      if (path.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
      if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
      if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
      if (path.includes("/issues/2/comments")) return ok([taking(11, "box/claude", "2026-11-04T02:58:00Z")]);
      if (path.includes("/issues/3/comments")) return ok([taking(12, "mac/claude", "2026-11-04T01:00:00Z")]);
      if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
      return { status: 404, data: {} };
    },
  };
}
// Un GitHub qui rend cette réponse à tout chemin.
const everywhere = (answer: AnswerGitHub | (() => Promise<AnswerGitHub>)): CallGitHub => async () => (typeof answer === "function" ? answer() : answer);

const read = (call: CallGitHub, repository = REPOSITORY) => readTheBoardOfRepository({ depot: repository, appeler: call, maintenant: () => READ_THE });

function readOne(reading: ReadOfBoardOfRepository): BoardRead {
  assert.ok(reading.lu, reading.lu ? "" : reading.raison);
  return reading;
}

// Un échec, et sa raison : une seule phrase, qui commence par une majuscule et finit par son point.
function failure(reading: ReadOfBoardOfRepository): BoardNotRead {
  assert.equal(reading.lu, false, "la lecture échoue");
  if (reading.lu) throw new Error("lu");
  assert.match(reading.raison, /^[A-Z0-9`"].*\.$/s, `une phrase : ${reading.raison}`);
  assert.doesNotMatch(reading.raison.slice(0, -1), /[.!?]\s/, `une seule phrase : ${reading.raison}`);
  assert.doesNotMatch(reading.raison, /\n/);
  assert.equal(reading.depot, REPOSITORY);
  assert.equal(reading.luLe, READ_THE.toISOString());
  return reading;
}

test("le rail se lit sur GitHub : ses tickets dans l'ordre du service, leur état, leurs bons, ses compteurs et ses cooks", async () => {
  const { appeler: call, chemins: paths } = github();
  const reading = readOne(await read(call));
  assert.equal(reading.depot, REPOSITORY);
  assert.equal(reading.luLe, READ_THE.toISOString());
  assert.deepEqual(reading.cuisine.rubriques, [
    { titre: "rail", lignes: ["1 taken · 1 in pass · 1 queued"] },
    { titre: "cooks", lignes: ["2 running"] },
  ]);
  assert.equal(reading.faits.etat, "ouverte");
  assert.equal(reading.faits.lu, READ_THE.toISOString());
  assert.deepEqual(reading.faits.compteurs, { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 });
  // La priorité d'abord, puis le plus ancien ; la PR rendue comme une issue n'est pas un ticket.
  assert.deepEqual((reading.faits.rail as { ticket: number; etat: string; station?: string }[]).map(({ ticket, etat: state, station }) => [ticket, state, station ?? null]), [
    [2, "pris", "box/claude"],
    [1, "en attente", null],
    [3, "en pass", "mac/claude"],
  ]);
  assert.deepEqual(reading.lignesDuRail, [
    { ticket: 2, priorite: 1, ligne: "  #2  taken  prio:1  by box/claude since 2026-11-04 02:58 UTC  Ticket 2" },
    { ticket: 1, priorite: 2, ligne: "  #1  queued  prio:2  since 2026-11-03 21:00 UTC  Ticket 1" },
    { ticket: 3, priorite: null, ligne: "  #3  in pass  -  since 2026-11-04 02:30 UTC, cooked by mac/claude  Ticket 3" },
  ]);
  assert.deepEqual(reading.activites.map(({ ticket, station, lanceLe: launchesThe, pr }) => ({ ticket, station, lanceLe: launchesThe, pr })), [
    { ticket: 2, station: "box/claude", lanceLe: "2026-11-04T02:58:00Z", pr: null },
    { ticket: 3, station: "mac/claude", lanceLe: "2026-11-04T01:00:00Z", pr: { numero: 40, url: `https://github.com/${REPOSITORY}/pull/40` } },
  ]);
  // TODO n'est pas lu ici : l'appelant l'ajoute (todo-github.ts).
  assert.equal(reading.faits.attend, undefined);
  // La base se lit, un ticket étant en pass ; les prises, des seuls tickets tenus.
  assert.ok(paths.includes(`/repos/${REPOSITORY}`) && paths.some((path) => path.includes("/commits/main/check-runs")));
  assert.ok(paths.some((path) => path.startsWith(`/repos/${REPOSITORY}/issues/2/comments`)) && paths.some((path) => path.startsWith(`/repos/${REPOSITORY}/issues/3/events`)));
  // Un ticket en attente n'a personne qui le tienne : ses commentaires ne se lisent qu'une fois, pour sa fiche et les arrêts de
  // ses cooks (ticket 3763). Ses événements disent depuis quand `fire` lui a été posé (ticket 3433).
  assert.equal(paths.filter((path) => /\/issues\/1\/comments/.test(path)).length, 1, "les commentaires d'un ticket en attente se lisent une fois, pour ses attentes");
  assert.ok(paths.some((path) => path.startsWith(`/repos/${REPOSITORY}/issues/1/events`)), "l'entrée dans la file d'un ticket en attente se lit de ses événements");
});

test("ce qui est avant le rail : les issues ouvertes sans `fire`, chacune dans l'état que ses labels disent, `prio:` d'abord", async () => {
  const reading = readOne(await read(github().appeler));
  assert.equal(reading.avantLeRail?.lu, READ_THE.toISOString());
  assert.deepEqual(reading.avantLeRail?.issues.map(({ ticket, priorite: priority, etat: state }) => [ticket, priority, state]), [
    [6, 1, "mise-de-cote"],
    [8, 1, "prete"],
    [7, 3, "epique"],
    [5, null, "mise-de-cote"],
    [9, null, "non-lue"],
    [10, null, "non-lue"],
  ]);
  assert.equal(reading.avantLeRail?.issues.find(({ ticket }) => ticket === 8)?.titre, "Ticket 8");
});

test("l'état avant le rail se tire des labels seuls", () => {
  assert.deepEqual(beforeTheRailOf(["served-elsewhere", "epic"]), { etat: "mise-de-cote", dit: "it carries `served-elsewhere`: this kitchen does not serve it" });
  // Parquée — `parked`, sa carte du chef, ou un label d'attente d'avant parked (#4260) —, comme le runtime la lit (runtime/src/amont.ts).
  for (const labels of [["parked"], ["chef-todo"], [LABELS_D_AVANT_PARKED[0] as string]]) assert.deepEqual(beforeTheRailOf([...labels, "model:opus", "effort:high"]), { etat: "mise-de-cote", dit: "parked (`parked`): it waits for someone — who, for what and until when are on the issue; nothing takes it before" }, labels.join());
  assert.deepEqual(beforeTheRailOf(["epic", "model:opus", "effort:high"]), { etat: "epique", dit: "it carries `epic`: not split yet" });
  assert.deepEqual(beforeTheRailOf(["prio:2", "model:opus", "effort:high"]), { etat: "prete", dit: "calibrated (model:opus, effort:high), without `fire`: the rail takes it once `fire` is set" });
  // L'un sans l'autre n'est pas calibré.
  assert.equal(beforeTheRailOf(["model:opus"]).etat, "non-lue");
  assert.equal(beforeTheRailOf(["effort:low"]).etat, "non-lue");
  assert.deepEqual(beforeTheRailOf([]), { etat: "non-lue", dit: "not calibrated yet: no `model:` and `effort:` labels" });
});

test("ce qui est avant le rail ne se lit pas, le rail si : la lecture réussit, sans `avantLeRail`", async () => {
  const reading = readOne(await read(github({ ouvertes: { status: 403, data: { message: "API rate limit exceeded" } } }).appeler));
  assert.equal(reading.avantLeRail, undefined);
  assert.equal(reading.lignesDuRail.length, 3);
});

test("GitHub injoignable : un échec qui dit que GitHub n'a pas répondu, et ce que le réseau en a dit — hors ligne", async () => {
  const reading = failure(await read(everywhere(() => Promise.reject(new Error("getaddrinfo ENOTFOUND api.github.com\n    at stack")))));
  assert.equal(reading.raison, "GitHub could not be reached to read the rail of chef/parade: getaddrinfo ENOTFOUND api.github.com.");
  // GitHub pas joint du tout : l'app est hors ligne, ce n'est pas une panne (#1818).
  assert.equal(reading.horsLigne, true);
});

test("GitHub qui refuse : un échec par code, avec ce que GitHub en dit", async () => {
  const notConnected = failure(await read(everywhere({ status: 401, data: { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" } })));
  assert.equal(notConnected.raison, "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again.");
  const privateOne = failure(await read(everywhere({ status: 404, data: { message: "Not Found" } })));
  assert.equal(privateOne.raison, "GitHub does not show chef/parade (HTTP 404): the repository is private and this app is not signed in to an account that sees it, or it no longer exists.");
  const limit = failure(await read(everywhere({ status: 403, data: { message: "API rate limit exceeded for 1.2.3.4. (But here's the good news: authenticated requests get a higher rate limit.)" } })));
  assert.equal(limit.raison, "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded for 1.2.3.4.");
  const outage = failure(await read(everywhere({ status: 502, data: "<html><body>Bad gateway</body></html>" })));
  assert.equal(outage.raison, "GitHub refused to read the rail of chef/parade (HTTP 502).");
  // GitHub joint qui refuse : une vraie panne, jamais « hors ligne » (#1818).
  for (const refusal of [notConnected, privateOne, limit, outage]) assert.equal(refusal.horsLigne, undefined, refusal.raison);
});

test("un refus après la liste du rail — ses PR — fait aussi l'échec : jamais un rail à moitié lu", async () => {
  const { appeler: call } = github();
  const reading = failure(await read(async (path, headers) => (path.includes("/pulls?") ? { status: 404, data: { message: "Not Found" } } : call(path, headers))));
  assert.match(reading.raison, /^GitHub does not show chef\/parade \(HTTP 404\)/);
});

test("une réponse de GitHub qui n'est pas une liste : un échec, jamais un rail vide", async () => {
  const { appeler: call } = github();
  const reading = failure(await read(async (path, headers) => (path.includes("labels=fire") ? { status: 200, data: { message: "odd" } } : call(path, headers))));
  assert.equal(reading.raison, "The rail of chef/parade was not read from GitHub: GitHub's answer is not a list.");
  assert.equal(reading.horsLigne, undefined);
});

test("un dépôt qui n'est pas `<owner>/<repo>` : un échec, et rien ne part vers GitHub", async () => {
  const { appeler: call, chemins: paths } = github();
  const reading = await readTheBoardOfRepository({ depot: "../evil", appeler: call, maintenant: () => READ_THE });
  assert.equal(reading.lu, false);
  assert.match(reading.lu ? "" : reading.raison, /is not an owner\/name GitHub repository/);
  assert.match(reading.lu ? "" : reading.raison, /no GitHub `origin` remote.*field "depot".*"depot": "acme\/kitchen"/);
  assert.deepEqual(paths, []);
});

// #3163 : un dépôt où le compte de l'app ne peut pas écrire s'ouvre en lecture seule — `facts` le dit, et le rail reste lu.
const withTheRepository = (repository: AnswerGitHub | Error): CallGitHub => {
  const { appeler: call } = github();
  return async (path, headers) => {
    if (path !== `/repos/${REPOSITORY}`) return call(path, headers);
    if (repository instanceof Error) throw repository;
    return repository;
  };
};

test("un dépôt où le compte ne peut pas écrire (`permissions.push` faux) : `facts` porte `lectureSeule` avec le dépôt, et tout le reste se lit", async () => {
  const reading = readOne(await read(withTheRepository(ok({ default_branch: "main", permissions: { admin: false, push: false, pull: true } }))));
  assert.deepEqual(reading.faits.lectureSeule, { depot: REPOSITORY });
  assert.equal(reading.lignesDuRail.length, 3);
  assert.equal(reading.avantLeRail?.issues.length, 6);
});

test("un dépôt où le compte écrit : rien de `lectureSeule` — et l'accès gagné rend la vue ordinaire à la lecture suivante", async () => {
  assert.equal(readOne(await read(withTheRepository(ok({ default_branch: "main", permissions: { push: true } })))).faits.lectureSeule, undefined);
  // La même mémoire des lectures d'une lecture à l'autre, comme main.ts la tient : la permission est relue chaque fois.
  const memory = new Map();
  let push = false;
  const { appeler: call } = github();
  const next: CallGitHub = async (path, headers) => (path === `/repos/${REPOSITORY}` ? { status: 200, data: { default_branch: "main", permissions: { push } }, etag: `"${push}"` } : call(path, headers));
  assert.deepEqual(readOne(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: next, maintenant: () => READ_THE, memoire: memory })).faits.lectureSeule, { depot: REPOSITORY });
  push = true;
  assert.equal(readOne(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: next, maintenant: () => READ_THE, memoire: memory })).faits.lectureSeule, undefined);
});

test("ce que GitHub ne dit pas de l'écriture ne décide rien : sans `permissions`, refusé ou injoignable, pas de `lectureSeule`, et le rail se lit", async () => {
  for (const repository of [ok({ default_branch: "main" }), { status: 403, data: { message: "Forbidden" } }, new Error("socket hang up")]) {
    // La base du rail se lit d'abord sur ce même chemin (un ticket est en pass) : seule la lecture de l'écriture échoue.
    const { appeler: call } = github();
    const withTheBase = withTheRepository(repository);
    let readEntries = 0;
    const reading = readOne(await read(async (path, headers) => (path === `/repos/${REPOSITORY}` && ++readEntries === 1 ? call(path, headers) : withTheBase(path, headers))));
    assert.equal(readEntries, 2, "la permission est demandée");
    assert.equal(reading.faits.lectureSeule, undefined, String(repository));
    assert.equal(reading.lignesDuRail.length, 3);
  }
});

// Le graphe des imports d'un module qui restent à l'exécution — ceux de types seuls sont effacés —, de proche en
// proche, en chemins relatifs à la racine du dépôt.
const ROOT = resolve(import.meta.dirname, "..", "..", "..");
function graph(entry: string): string[] {
  const seenOnes = new Set<string>();
  const pile = [resolve(ROOT, entry)];
  while (pile.length > 0) {
    const file = pile.pop() as string;
    if (seenOnes.has(file)) continue;
    seenOnes.add(file);
    for (const [, specificateur = ""] of readFileSync(file, "utf8").matchAll(/^\s*(?:import|export)(?!\s+type\b)\b[^"'`;]*?\bfrom\s*"([^"]+)"/gm)) {
      if (specificateur.startsWith(".")) pile.push(resolve(dirname(file), specificateur));
      else seenOnes.add(specificateur);
    }
  }
  return [...seenOnes].map((path) => (path.startsWith(ROOT) ? relative(ROOT, path).split("\\").join("/") : path)).sort();
}

test("la lecture du rail ne joint ni box ni station : ses modules ne chargent que les états de GitHub du runtime, et la règle des stations vues de GitHub (#2358)", () => {
  assert.deepEqual(graph("app/src/board/read.ts"), [
    // Les alertes du haut du rail et le diagnostic du rail bloqué, sans E/S, que le runtime ne dit plus (ticket 3945).
    "app/src/wait-of-rail/alerts.ts",
    "app/src/rail-blocked/diagnostic.ts",
    "app/src/board/writing.ts",
    // Le kanban de la nouvelle cuisine, de ses labels seuls, sans E/S (ticket 4482).
    "app/src/board/kitchen-board.ts",
    "app/src/board/read.ts",
    "app/src/board/set-aside-github.ts",
    // Le label `parked:chef` de la nouvelle cuisine, sans E/S : TODO lit ses issues de la liste des issues ouvertes (ticket 4474).
    "app/src/board/parked-chef-github.ts",
    "app/src/board/rail-github.ts",
    "app/src/board/todo-github.ts",
    // Pourquoi la file ne part pas : la raison et ses phrases, sans E/S (ticket 3433).
    "app/src/vue/wait-of-rail/wait-of-rail.ts",
    // L'avancement d'un besoin, de la liste de cases à cocher de son corps, sans E/S (ticket 3480).
    "app/src/vue/backlog/progress-github.ts",
    "app/src/vue/banner-stop/stop-of-rail.ts",
    // Le label `sensitive`, sans import : la carte d'un ticket sensible le dit (ticket 3224).
    "app/src/vue/card-sensitive/label.ts",
    "app/src/vue/cooks/taken.ts",
    // La pause de quota GitHub du compte, sans E/S (ticket 3482).
    "app/src/vue/pause-quota/pause-quota.ts",
    // Une PR dite par son ticket, sans import (ticket 3716).
    "app/src/vue/pr-of-ticket.js",
    // Le rail bloqué : les tickets qu'aucun manager n'a pris, et le diagnostic, sans E/S (ticket 3358).
    "app/src/vue/rail-blocked/rail-blocked.ts",
    "app/src/vue/rail/github.ts",
    // Le dernier renvoi d'un ticket, des commentaires déjà lus, sans import : le récit du premier ticket le dit (ticket 3302).
    "app/src/vue/rail/send-back.ts",
    "runtime/src/arret-cuisine/arret-cuisine.ts",
    "runtime/src/attente-du-rail/lecture.ts",
    "runtime/src/attente-du-rail/raison.ts",
    "runtime/src/attente-du-rail/stations.ts",
    // Qui un ticket en WAITING attend, relu de sa marque, sans E/S : la carte qui l'attend le nomme (ticket 3761).
    "runtime/src/attente-github/marque.ts",
    // Les attentes d'un ticket en file et leur source — son corps, sa fiche, l'arrêt d'un cook —, sans E/S (ticket 3763).
    "runtime/src/boucle-attente/levee.ts",
    // La calibration d'un ticket, sans E/S : le haut du backlog ne montre qu'un ticket calibré (ticket 4223).
    "runtime/src/calibrage.ts",
    "runtime/src/capacites.ts",
    "runtime/src/carte-attente/carte-attente.ts",
    "runtime/src/enregistrement-station/contrat.ts",
    // La liste des tickets d'une épique, sans E/S : une épique n'est pas sur le rail (#2618).
    "runtime/src/epique.ts",
    "runtime/src/events/rail.ts",
    "runtime/src/fiche.ts",
    "runtime/src/github-etat/etats.ts",
    // L'ordre de merge des tickets qui touchent au même terrain, lu de GitHub sans station (ticket 4044).
    "runtime/src/ordre-de-merge/lecture.ts",
    "runtime/src/ordre-de-merge/ordre.ts",
    // Le rail, haut du backlog : les tickets calibrés et prêts, par priorité puis âge, sans E/S (ticket 4223).
    "runtime/src/rail-backlog/rail-backlog.ts",
    // Le ticket qu'une PR sert, sans E/S : la règle que le récapitulatif du runtime lit sur les mêmes PR (ticket 3581).
    "runtime/src/recap/servis.ts",
    // La ligne « Roadmap » du `CLAUDE.md`, sans E/S : la roadmap n'est pas une ligne du Backlog (ticket 3589).
    "runtime/src/reglages-projet/ligne-roadmap.ts",
    "runtime/src/stations-github/stations.ts",
    "runtime/src/zones.ts",
  ]);
  // Le jeton du desktop : `gh auth token`, et rien d'autre.
  assert.deepEqual(graph("app/src/board/token-gh.ts"), ["app/src/board/token-gh.ts", "node:child_process"]);
  for (const module of ["app/src/board/read.ts", "app/src/vue/rail/github.ts", "app/src/board/rail-github.ts", "app/src/board/client.ts", "app/src/board/token-gh.ts"]) {
    const code = readFileSync(join(ROOT, module), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /box\.ts|stations\//i, `${module} ne joint ni box ni station`);
  }
});
