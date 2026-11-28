// La cuisine d'un projet, lue de GitHub seul par les apps (app/src/board/read.ts, #2061) : le kanban de ses labels
// (#4482, #4507) ; et, quand rien ne se lit, un échec qui dit pourquoi en une phrase — jamais un rail vide. Rien ne passe
// par le réseau : l'appel à GitHub est une doublure, qui répond selon le chemin demandé. Le kanban colonne par colonne est
// dans test/board/kitchen-board.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository, type ReadOfBoardOfRepository, type BoardRead, type BoardNotRead } from "../../src/board/read.ts";

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
// Les issues ouvertes : #1 prête (prio:2), #2 prise par un cook (prio:1), #3 en pass par la PR #40, #5 parquée pour le
// chef, #6 sans `fire` — et une PR que l'API des issues rend comme une issue.
const OPEN = [
  issue(1, ["fire", "prio:2", "model:sonnet", "effort:medium"]),
  issue(2, ["fire", "taken", "prio:1"]),
  issue(3, ["fire", "in-pass"]),
  issue(5, ["fire", "parked:chef"]),
  issue(6, ["epic", "prio:3"]),
  issue(40, ["fire"], { pull_request: {} }),
];

// Un GitHub qui répond selon le chemin, et retient les chemins demandés.
function github(): { appeler: CallGitHub; chemins: string[] } {
  const paths: string[] = [];
  return {
    chemins: paths,
    appeler: async (path) => {
      paths.push(path);
      if (path.includes("/issues?")) return ok(OPEN);
      if (path.includes("/pulls?state=open")) return ok([{ number: 40, state: "open", html_url: `https://github.com/${REPOSITORY}/pull/40`, created_at: "2026-11-04T02:30:00Z", head: { ref: "cook/3-github" }, body: "" }]);
      if (path.includes("/pulls?state=closed")) return ok([]);
      if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
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

test("le rail se lit sur GitHub : le kanban de ses labels, ses compteurs, ses issues parquées pour le chef — rien du rail d'avant", async () => {
  const { appeler: call, chemins: paths } = github();
  const reading = readOne(await read(call));
  assert.equal(reading.depot, REPOSITORY);
  assert.equal(reading.luLe, READ_THE.toISOString());
  assert.deepEqual(reading.cuisine.rubriques, [
    { titre: "rail", lignes: ["1 ready · 1 cooking · 1 in pass · 1 parked"] },
    { titre: "cooks", lignes: ["1 running"] },
  ]);
  assert.equal(reading.faits.etat, "ouverte");
  assert.equal(reading.faits.lu, READ_THE.toISOString());
  assert.deepEqual(reading.faits.compteurs, { rail: 1, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 });
  assert.ok(reading.faits.kitchenBoard !== undefined);
  // Ni carte du rail d'avant, ni ligne de `status` par ticket, ni activité de cook : la cuisine ne les écrit pas.
  assert.deepEqual(reading.faits.rail, []);
  assert.deepEqual(reading.lignesDuRail, []);
  assert.deepEqual(reading.activites, []);
  assert.deepEqual(reading.parqueesPourLeChef?.map(({ ticket }) => ticket), [5]);
  // TODO n'est pas lu ici : l'appelant l'ajoute (wait-of-chef.ts).
  assert.equal(reading.faits.attend, undefined);
  // Ni prise, ni événement, ni check de la base, ni liste `fire` à part, ni `.brigade/kitchen.json`.
  assert.deepEqual(paths.filter((path) => /\/(comments|events|check-runs|contents)\b|labels=/.test(path)), []);
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
  const reading = failure(await read(async (path, headers) => (path.includes("/issues?") ? { status: 200, data: { message: "odd" } } : call(path, headers))));
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
  assert.equal((reading.faits.compteurs as { auTravail: number }).auTravail, 1);
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
    const withIt = withTheRepository(repository);
    let readEntries = 0;
    const reading = readOne(await read(async (path, headers) => (path === `/repos/${REPOSITORY}` && readEntries++, withIt(path, headers))));
    assert.equal(readEntries, 1, "la permission est demandée");
    assert.equal(reading.faits.lectureSeule, undefined, String(repository));
    assert.equal((reading.faits.compteurs as { auTravail: number }).auTravail, 1);
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

// #4507 : la lecture du rail ne charge rien du runtime d'avant — de `runtime/src`, seuls les labels de la cuisine.
test("la lecture du rail ne joint ni box ni station : du runtime, elle ne charge que les labels de la cuisine (runtime/src/kitchen/)", () => {
  assert.deepEqual(graph("app/src/board/read.ts"), [
    // Le kanban, de ses labels seuls, sans E/S (tickets 4482, 4507).
    "app/src/board/kitchen-board.ts",
    // Le label `parked:chef`, sans E/S : TODO lit ses issues de la liste des issues ouvertes (ticket 4474).
    "app/src/board/parked-chef-github.ts",
    "app/src/board/rail-github.ts",
    "app/src/board/read.ts",
    "app/src/board/writing.ts",
    // Les labels de la cuisine, sans import.
    "runtime/src/kitchen/decide.ts",
  ]);
  // Le jeton du desktop : `gh auth token`, et rien d'autre.
  assert.deepEqual(graph("app/src/board/token-gh.ts"), ["app/src/board/token-gh.ts", "node:child_process"]);
  for (const module of ["app/src/board/read.ts", "app/src/board/rail-github.ts", "app/src/board/client.ts", "app/src/board/token-gh.ts"]) {
    const code = readFileSync(join(ROOT, module), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /box\.ts|stations\//i, `${module} ne joint ni box ni station`);
  }
});
