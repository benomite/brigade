// La cuisine d'un projet, lue de GitHub seul par les apps (app/src/tableau/lecture.ts, #2061) : le rail — ses issues
// `fire`, leurs labels, leurs PR, la station qui tient chacune —, puis ce qui est avant le rail, rangé d'après les
// labels seuls ; et, quand rien ne se lit, un échec qui dit pourquoi en une phrase — jamais un rail vide. Rien ne passe
// par le réseau : l'appel à GitHub est une doublure, qui répond selon le chemin demandé.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { avantLeRailDe, lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauLu, type TableauNonLu } from "../../src/tableau/lecture.ts";

const DEPOT = "chef/parade";
const LU_LE = new Date("2026-11-04T03:00:00.000Z");

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  created_at: "2026-11-03T21:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const prise = (id: number, station: string, le: string) => ({ id, body: `<!-- brigade:prise station=${station} -->\nTaken by station \`${station}\`.`, author_association: "OWNER", created_at: le });

// Le rail : #1 en attente (prio:2), #2 pris par box/claude (prio:1), #3 en pass par la PR #40, cuisiné par mac/claude —
// et une PR que l'API des issues rend comme une issue.
const AU_FEU = [issue(1, ["fire", "prio:2"]), issue(2, ["fire", "taken", "prio:1"]), issue(3, ["fire", "in-pass"]), issue(40, ["fire"], { pull_request: {} })];
// Les issues ouvertes : le rail, et ce qui est avant lui — une de chaque état, une PR.
const OUVERTES = [
  ...AU_FEU,
  issue(5, ["hors-cuisine"]),
  issue(6, ["blocked-on-human", "prio:1"]),
  issue(7, ["epic", "prio:3"]),
  issue(8, ["model:opus", "effort:high", "prio:1"]),
  issue(9, ["model:opus"]),
  issue(10, []),
  issue(11, [], { pull_request: {} }),
];

// Un GitHub qui répond selon le chemin, et retient les chemins demandés. `ouvertes` : sa réponse à la liste de toutes
// les issues ouvertes (ce qui est avant le rail).
function github(options: { ouvertes?: ReponseGitHub } = {}): { appeler: AppelGitHub; chemins: string[] } {
  const chemins: string[] = [];
  return {
    chemins,
    appeler: async (chemin) => {
      chemins.push(chemin);
      if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok(AU_FEU);
      if (chemin.includes("/issues?")) return options.ouvertes ?? ok(OUVERTES);
      if (chemin.includes("/pulls?")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${DEPOT}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
      if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
      if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
      if (chemin.includes("/issues/2/comments")) return ok([prise(11, "box/claude", "2026-11-04T02:58:00Z")]);
      if (chemin.includes("/issues/3/comments")) return ok([prise(12, "mac/claude", "2026-11-04T01:00:00Z")]);
      if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
      return { status: 404, data: {} };
    },
  };
}
// Un GitHub qui rend cette réponse à tout chemin.
const partout = (reponse: ReponseGitHub | (() => Promise<ReponseGitHub>)): AppelGitHub => async () => (typeof reponse === "function" ? reponse() : reponse);

const lire = (appeler: AppelGitHub, depot = DEPOT) => lireLeTableauDuDepot({ depot, appeler, maintenant: () => LU_LE });

function lu(lecture: LectureDuTableauDuDepot): TableauLu {
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  return lecture;
}

// Un échec, et sa raison : une seule phrase, qui commence par une majuscule et finit par son point.
function echec(lecture: LectureDuTableauDuDepot): TableauNonLu {
  assert.equal(lecture.lu, false, "la lecture échoue");
  if (lecture.lu) throw new Error("lu");
  assert.match(lecture.raison, /^[A-Z0-9`"].*\.$/s, `une phrase : ${lecture.raison}`);
  assert.doesNotMatch(lecture.raison.slice(0, -1), /[.!?]\s/, `une seule phrase : ${lecture.raison}`);
  assert.doesNotMatch(lecture.raison, /\n/);
  assert.equal(lecture.depot, DEPOT);
  assert.equal(lecture.luLe, LU_LE.toISOString());
  return lecture;
}

test("le rail se lit sur GitHub : ses tickets dans l'ordre du service, leur état, leurs bons, ses compteurs et ses cooks", async () => {
  const { appeler, chemins } = github();
  const lecture = lu(await lire(appeler));
  assert.equal(lecture.depot, DEPOT);
  assert.equal(lecture.luLe, LU_LE.toISOString());
  assert.deepEqual(lecture.cuisine.rubriques, [
    { titre: "rail", lignes: ["1 taken · 1 in pass · 1 queued"] },
    { titre: "cooks", lignes: ["2 running"] },
  ]);
  assert.equal(lecture.faits.etat, "ouverte");
  assert.equal(lecture.faits.lu, LU_LE.toISOString());
  assert.deepEqual(lecture.faits.compteurs, { rail: 3, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 });
  // La priorité d'abord, puis le plus ancien ; la PR rendue comme une issue n'est pas un ticket.
  assert.deepEqual((lecture.faits.rail as { ticket: number; etat: string; station?: string }[]).map(({ ticket, etat, station }) => [ticket, etat, station ?? null]), [
    [2, "pris", "box/claude"],
    [1, "en attente", null],
    [3, "en pass", "mac/claude"],
  ]);
  assert.deepEqual(lecture.lignesDuRail, [
    { ticket: 2, priorite: 1, ligne: "  #2  taken  prio:1  by box/claude since 2026-11-04 02:58 UTC  Ticket 2" },
    { ticket: 1, priorite: 2, ligne: "  #1  queued  prio:2  since 2026-11-03 21:00 UTC  Ticket 1" },
    { ticket: 3, priorite: null, ligne: "  #3  in pass  -  since 2026-11-04 02:30 UTC, cooked by mac/claude  Ticket 3" },
  ]);
  assert.deepEqual(lecture.activites.map(({ ticket, station, lanceLe, pr }) => ({ ticket, station, lanceLe, pr })), [
    { ticket: 2, station: "box/claude", lanceLe: "2026-11-04T02:58:00Z", pr: null },
    { ticket: 3, station: "mac/claude", lanceLe: "2026-11-04T01:00:00Z", pr: { numero: 40, url: `https://github.com/${DEPOT}/pull/40` } },
  ]);
  // TODO n'est pas lu ici : l'appelant l'ajoute (todo-github.ts).
  assert.equal(lecture.faits.attend, undefined);
  // La base se lit, un ticket étant en pass ; les prises, des seuls tickets tenus.
  assert.ok(chemins.includes(`/repos/${DEPOT}`) && chemins.some((chemin) => chemin.includes("/commits/main/check-runs")));
  assert.ok(chemins.some((chemin) => chemin.startsWith(`/repos/${DEPOT}/issues/2/comments`)) && chemins.some((chemin) => chemin.startsWith(`/repos/${DEPOT}/issues/3/events`)));
  assert.ok(!chemins.some((chemin) => /\/issues\/1\/(comments|events)/.test(chemin)), "un ticket en attente n'a personne qui le tienne");
});

test("ce qui est avant le rail : les issues ouvertes sans `fire`, chacune dans l'état que ses labels disent, `prio:` d'abord", async () => {
  const lecture = lu(await lire(github().appeler));
  assert.equal(lecture.avantLeRail?.lu, LU_LE.toISOString());
  assert.deepEqual(lecture.avantLeRail?.issues.map(({ ticket, priorite, etat }) => [ticket, priorite, etat]), [
    [6, 1, "mise-de-cote"],
    [8, 1, "prete"],
    [7, 3, "epique"],
    [5, null, "mise-de-cote"],
    [9, null, "non-lue"],
    [10, null, "non-lue"],
  ]);
  assert.equal(lecture.avantLeRail?.issues.find(({ ticket }) => ticket === 8)?.titre, "Ticket 8");
});

test("l'état avant le rail se tire des labels seuls", () => {
  assert.deepEqual(avantLeRailDe(["hors-cuisine", "epic"]), { etat: "mise-de-cote", dit: "it carries `hors-cuisine`: this kitchen does not serve it" });
  assert.deepEqual(avantLeRailDe(["blocked-on-human", "model:opus", "effort:high"]), { etat: "mise-de-cote", dit: "it carries `blocked-on-human`: a human decides" });
  assert.deepEqual(avantLeRailDe(["epic", "model:opus", "effort:high"]), { etat: "epique", dit: "it carries `epic`: not split yet" });
  assert.deepEqual(avantLeRailDe(["prio:2", "model:opus", "effort:high"]), { etat: "prete", dit: "calibrated (model:opus, effort:high), without `fire`: the rail takes it once `fire` is set" });
  // L'un sans l'autre n'est pas calibré.
  assert.equal(avantLeRailDe(["model:opus"]).etat, "non-lue");
  assert.equal(avantLeRailDe(["effort:low"]).etat, "non-lue");
  assert.deepEqual(avantLeRailDe([]), { etat: "non-lue", dit: "not calibrated yet: no `model:` and `effort:` labels" });
});

test("ce qui est avant le rail ne se lit pas, le rail si : la lecture réussit, sans `avantLeRail`", async () => {
  const lecture = lu(await lire(github({ ouvertes: { status: 403, data: { message: "API rate limit exceeded" } } }).appeler));
  assert.equal(lecture.avantLeRail, undefined);
  assert.equal(lecture.lignesDuRail.length, 3);
});

test("GitHub injoignable : un échec qui dit que GitHub n'a pas répondu, et ce que le réseau en a dit — hors ligne", async () => {
  const lecture = echec(await lire(partout(() => Promise.reject(new Error("getaddrinfo ENOTFOUND api.github.com\n    at stack")))));
  assert.equal(lecture.raison, "GitHub could not be reached to read the rail of chef/parade: getaddrinfo ENOTFOUND api.github.com.");
  // GitHub pas joint du tout : l'app est hors ligne, ce n'est pas une panne (#1818).
  assert.equal(lecture.horsLigne, true);
});

test("GitHub qui refuse : un échec par code, avec ce que GitHub en dit", async () => {
  const nonConnecte = echec(await lire(partout({ status: 401, data: { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" } })));
  assert.equal(nonConnecte.raison, "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again.");
  const prive = echec(await lire(partout({ status: 404, data: { message: "Not Found" } })));
  assert.equal(prive.raison, "GitHub does not show chef/parade (HTTP 404): the repository is private and this app is not signed in to an account that sees it, or it no longer exists.");
  const limite = echec(await lire(partout({ status: 403, data: { message: "API rate limit exceeded for 1.2.3.4. (But here's the good news: authenticated requests get a higher rate limit.)" } })));
  assert.equal(limite.raison, "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded for 1.2.3.4.");
  const panne = echec(await lire(partout({ status: 502, data: "<html><body>Bad gateway</body></html>" })));
  assert.equal(panne.raison, "GitHub refused to read the rail of chef/parade (HTTP 502).");
  // GitHub joint qui refuse : une vraie panne, jamais « hors ligne » (#1818).
  for (const refus of [nonConnecte, prive, limite, panne]) assert.equal(refus.horsLigne, undefined, refus.raison);
});

test("un refus après la liste du rail — ses PR — fait aussi l'échec : jamais un rail à moitié lu", async () => {
  const { appeler } = github();
  const lecture = echec(await lire(async (chemin, entetes) => (chemin.includes("/pulls?") ? { status: 404, data: { message: "Not Found" } } : appeler(chemin, entetes))));
  assert.match(lecture.raison, /^GitHub does not show chef\/parade \(HTTP 404\)/);
});

test("une réponse de GitHub qui n'est pas une liste : un échec, jamais un rail vide", async () => {
  const { appeler } = github();
  const lecture = echec(await lire(async (chemin, entetes) => (chemin.includes("labels=fire") ? { status: 200, data: { message: "odd" } } : appeler(chemin, entetes))));
  assert.equal(lecture.raison, "The rail of chef/parade was not read from GitHub: GitHub's answer is not a list.");
  assert.equal(lecture.horsLigne, undefined);
});

test("un dépôt qui n'est pas `<owner>/<repo>` : un échec, et rien ne part vers GitHub", async () => {
  const { appeler, chemins } = github();
  const lecture = await lireLeTableauDuDepot({ depot: "../evil", appeler, maintenant: () => LU_LE });
  assert.equal(lecture.lu, false);
  assert.match(lecture.lu ? "" : lecture.raison, /is not an owner\/name GitHub repository/);
  assert.match(lecture.lu ? "" : lecture.raison, /no GitHub `origin` remote.*field "depot".*"depot": "acme\/kitchen"/);
  assert.deepEqual(chemins, []);
});

// Le graphe des imports d'un module qui restent à l'exécution — ceux de types seuls sont effacés —, de proche en
// proche, en chemins relatifs à la racine du dépôt.
const RACINE = resolve(import.meta.dirname, "..", "..", "..");
function graphe(entree: string): string[] {
  const vus = new Set<string>();
  const pile = [resolve(RACINE, entree)];
  while (pile.length > 0) {
    const fichier = pile.pop() as string;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    for (const [, specificateur = ""] of readFileSync(fichier, "utf8").matchAll(/^\s*(?:import|export)(?!\s+type\b)\b[^"'`;]*?\bfrom\s*"([^"]+)"/gm)) {
      if (specificateur.startsWith(".")) pile.push(resolve(dirname(fichier), specificateur));
      else vus.add(specificateur);
    }
  }
  return [...vus].map((chemin) => (chemin.startsWith(RACINE) ? relative(RACINE, chemin).split("\\").join("/") : chemin)).sort();
}

test("la lecture du rail ne joint ni box ni station : ses modules ne chargent que les états de GitHub du runtime, et la règle des stations vues de GitHub (#2358)", () => {
  assert.deepEqual(graphe("app/src/tableau/lecture.ts"), [
    "app/src/tableau/lecture.ts",
    "app/src/tableau/mise-de-cote-github.ts",
    "app/src/tableau/rail-github.ts",
    "app/src/tableau/todo-github.ts",
    "app/src/vue/cooks/prises.ts",
    "app/src/vue/rail/github.ts",
    "runtime/src/enregistrement-station/contrat.ts",
    // La liste des tickets d'une épique, sans E/S : une épique n'est pas sur le rail (#2618).
    "runtime/src/epique.ts",
    "runtime/src/github-etat/etats.ts",
    "runtime/src/stations-github/stations.ts",
  ]);
  // Le jeton du desktop : `gh auth token`, et rien d'autre.
  assert.deepEqual(graphe("app/src/tableau/jeton-gh.ts"), ["app/src/tableau/jeton-gh.ts", "node:child_process"]);
  for (const module of ["app/src/tableau/lecture.ts", "app/src/vue/rail/github.ts", "app/src/tableau/rail-github.ts", "app/src/tableau/client.ts", "app/src/tableau/jeton-gh.ts"]) {
    const code = readFileSync(join(RACINE, module), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /box\.ts|stations\//i, `${module} ne joint ni box ni station`);
  }
});
