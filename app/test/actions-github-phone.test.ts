// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502) : répondre à une carte de TODO (resume, merge,
// drop, close) fait sur GitHub ce que le même geste fait du desktop. Chaque geste est joué deux fois, sur deux copies du même faux GitHub : par la chaîne du desktop
// — les fonctions que main.ts appelle, avec le client qu'il compose, porté par `fetch` —, puis par le
// téléphone, porté par un faux HTTP natif de Capacitor ; les demandes que chaque GitHub a reçues, et ce qu'il en garde,
// sont comparées. Puis le pont de l'APK tel que la construction le pose (www/android/pont.js), connecté à GitHub, répond
// à une carte sur ce faux GitHub. Aucune station n'existe ici : seul GitHub répond.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { demarrageDuPont, poserLaVue, poserLesModules } from "../packaging/android.ts";
import { APP } from "../packaging/construire.ts";
import type { Answer } from "../src/card-todo.ts";
import { writingByCapacitor, openTheActionsGitHub, type RequestNative, type AnswerNative } from "../src/actions-github-phone.ts";
import { WITHOUT_DONE } from "../src/actions-github.ts";
import { clientOfThePriority, sendByFetch } from "../src/priority.ts";
import { clientGitHub, bodyRead, byFetch, type Send } from "../src/board/client.ts";
import type { BoardRead } from "../src/board/read.ts";
import { cardOfComment, shapeOfChef, type CardOfChef } from "../src/board/todo-github.ts";
import { answerOnGithub } from "../src/board-actions/answer-github.ts";
import { repos } from "./helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const PROJECT = "parade";
const TOKEN = "gho_du_chef";
const API = "https://api.github.com/";

// Deux questions du chef, chacune sous `served-elsewhere` et `chef-todo` : #40 se reprend ou se laisse, #41 a sa PR ouverte,
// #1560, à merger.
const QUESTION_40 = ["<!-- brigade:todo kind=product-question -->", "Keep the old export?", "- [resume] Yes, keep it", "- [drop] No, drop it"].join("\n");
const QUESTION_41 = ["<!-- brigade:todo kind=product-question -->", "Does the export keep the old column order?", "- [merge] Yes, merge PR #1560 as delivered", "- [close] No, we drop the export"].join("\n");
const CHEFS = new Map<number, CardOfChef>([
  [40, cardOfComment(QUESTION_40) ?? assert.fail("#40 carries a chef's card")],
  [41, cardOfComment(QUESTION_41) ?? assert.fail("#41 carries a chef's card")],
]);
// La réponse que la vue envoie d'un clic sur le choix `rang` de la carte de `ticket`.
const click = (ticket: number, rank: number): Answer => ({ question: shapeOfChef((CHEFS.get(ticket) as CardOfChef).texte).question, choix: rank });

// La dernière lecture du rail de parade : #22 sur son rail, #31 revenu de WAITING, #40 et #41 dans TODO.
const READ: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: "2026-11-06T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [{ ticket: 22, etat: "en attente" }, { ticket: 31, etat: "en attente" }], attend: [{ ticket: 40 }, { ticket: 41 }] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

type Issue = { labels: Set<string>; state: string; commentaires: string[] };
type Received = { methode: string; url: string; entetes: Record<string, string>; corps?: unknown };
type Outage = (receivedOne: Received) => { status: number; data: unknown } | "injoignable" | undefined;

// Un faux GitHub qui tient son monde — les issues de parade, leurs labels, leurs commentaires, la PR #1560 — et note
// chaque demande reçue, telle qu'elle est arrivée. `panne` : ce qu'il rend à la place de sa réponse, ou ne rien rendre.
function github(outage: Outage = () => undefined) {
  const issues = new Map<number, Issue>([
    [22, { labels: new Set(["fire"]), state: "open", commentaires: [] }],
    [31, { labels: new Set(["fire", "parked"]), state: "open", commentaires: [] }],
    [40, { labels: new Set(["fire", "served-elsewhere", "chef-todo"]), state: "open", commentaires: [QUESTION_40] }],
    [41, { labels: new Set(["fire", "served-elsewhere", "chef-todo"]), state: "open", commentaires: [QUESTION_41] }],
  ]);
  const pr = { numero: 1560, state: "open", merged: false, ref: "cook/41-export", body: "Closes #41" };
  const received: Received[] = [];
  const prJson = () => ({ number: pr.numero, state: pr.state, merged: pr.merged, head: { ref: pr.ref }, body: pr.body });
  function reply(receivedOne: Received): { status: number; data: unknown } {
    received.push(receivedOne);
    // Ce qui n'est pas l'API de GitHub ne répond pas, comme une station qui n'existe pas.
    if (!receivedOne.url.startsWith(API)) throw new Error(`failed to connect to ${receivedOne.url}`);
    const outageRead = outage(receivedOne);
    if (outageRead === "injoignable") throw new Error("Unable to resolve host \"api.github.com\": No address associated with hostname");
    if (outageRead !== undefined) return outageRead;
    // Ce que le téléphone lit : le gist où une station garde les projets du chef, puis le rail et TODO de parade.
    // La trace de ce téléphone, déjà posée (#3303, phone-connected.ts) : la lecture n'écrit rien d'autre que le geste.
    if (receivedOne.methode === "GET" && receivedOne.url.startsWith(`${API}gists?`)) return { status: 200, data: /[?&]page=1(&|$)/.test(receivedOne.url) ? [{ id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json" } } }, { id: "t1", files: { "brigade-telephone.json": { filename: "brigade-telephone.json" } } }] : [] };
    if (receivedOne.methode === "GET" && receivedOne.url === `${API}gists/g1`) return { status: 200, data: { id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json", content: PROJECTS_OF_GIST } } } };
    const path = receivedOne.url.slice(`${API}repos/${REPOSITORY}`.length);
    const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? "1");
    if (receivedOne.methode === "GET" && path.startsWith("/issues?")) {
      const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
      const openEntries = [...issues].filter(([, issue]) => issue.state === "open" && (label === undefined || issue.labels.has(decodeURIComponent(label))));
      return { status: 200, data: page > 1 ? [] : openEntries.map(([number, issue]) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-05T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })) })) };
    }
    const readOne = /^\/issues\/(\d+)\/(comments|events)\?/.exec(path);
    if (receivedOne.methode === "GET" && readOne !== null) {
      const comments = readOne[2] === "comments" && page === 1 ? (issues.get(Number(readOne[1]))?.commentaires ?? []) : [];
      return { status: 200, data: comments.map((body, rank) => ({ id: Number(readOne[1]) * 100 + rank, body, created_at: `2026-11-06T0${rank}:00:00Z`, author_association: "OWNER" })) };
    }
    if (receivedOne.methode === "GET" && path.startsWith("/pulls?")) return { status: 200, data: pr.state === "open" ? [prJson()] : [] };
    if (receivedOne.methode === "GET" && path === `/pulls/${pr.numero}`) return { status: 200, data: prJson() };
    if (receivedOne.methode === "PUT" && path === `/pulls/${pr.numero}/merge`) {
      Object.assign(pr, { state: "closed", merged: true });
      return { status: 200, data: { merged: true } };
    }
    const [, number, remains] = /^\/issues\/(\d+)(.*)$/.exec(path) ?? [];
    const issue = issues.get(Number(number));
    if (issue === undefined) return { status: 404, data: { message: "Not Found" } };
    if (receivedOne.methode === "POST" && remains === "/comments") {
      issue.commentaires.push((receivedOne.corps as { body: string }).body);
      const id = 900 + issue.commentaires.length;
      return { status: 201, data: { id, html_url: `https://github.com/${REPOSITORY}/issues/${number}#issuecomment-${id}` } };
    }
    if (receivedOne.methode === "POST" && remains === "/labels") {
      for (const pose of (receivedOne.corps as { labels: string[] }).labels) issue.labels.add(pose);
      return { status: 200, data: [...issue.labels].map((name) => ({ name })) };
    }
    const label = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
    if (receivedOne.methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? { status: 200, data: [...issue.labels].map((name) => ({ name })) } : { status: 404, data: { message: "Label does not exist" } };
    if (receivedOne.methode === "PATCH" && remains === "") {
      issue.state = (receivedOne.corps as { state: string }).state;
      return { status: 200, data: {} };
    }
    return { status: 404, data: { message: "Not Found" } };
  }

  // Le `fetch` du desktop : il reçoit l'adresse, la méthode, les en-têtes et le corps écrit en JSON.
  const fetch = (async (address: string | URL | Request, init?: RequestInit) => {
    const { status, data } = reply({ methode: init?.method ?? "GET", url: String(address), entetes: { ...(init?.headers as Record<string, string>) }, ...(typeof init?.body === "string" ? { corps: bodyRead(init.body) } : {}) });
    return new Response(JSON.stringify(data), { status });
  }) as typeof globalThis.fetch;
  // Le HTTP natif de Capacitor sur le téléphone : il reçoit le corps en objet, et rend la réponse lue en JSON.
  const capacitor = async (request: RequestNative | { url: string; method: "GET"; headers: Record<string, string> }): Promise<AnswerNative> => {
    const { status, data } = reply({ methode: request.method, url: request.url, entetes: { ...request.headers }, ...("data" in request && request.data !== undefined ? { corps: request.data } : {}) });
    return { status, data, headers: { "content-type": "application/json; charset=utf-8" } };
  };
  const state = () => ({ issues: Object.fromEntries([...issues].map(([number, issue]) => [number, { labels: [...issue.labels].sort(), state: issue.state, commentaires: issue.commentaires }])), pr: { ...pr } });
  return { recues: received, fetch, capacitor, etat: state };
}

const token = async () => TOKEN;
const PROJECTS_OF_GIST = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: PROJECT, depot: REPOSITORY, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null }] });

// La chaîne du desktop pour ce GitHub : le client que main.ts compose (`clientDesLabels`) — le `GET` des lectures et les
// écritures par `fetch`, avec le jeton du chef.
function desktop(world: ReturnType<typeof github>) {
  return clientOfThePriority({ jeton: token, appeler: clientGitHub({ jeton: token, envoyer: byFetch({ fetch: world.fetch }) }), envoyer: sendByFetch({ fetch: world.fetch }) });
}

// Les gestes du téléphone pour ce GitHub : le jeton du coffre, les lectures et les écritures par le HTTP natif, et ce que
// sa dernière lecture de GitHub dit de parade. `ecrits` : les projets que le téléphone relit après une écriture prise.
function phone(world: ReturnType<typeof github>) {
  const writtenOnes: string[] = [];
  const reading: Send = async (address, headers) => {
    const { status, data } = await world.capacitor({ url: address, method: "GET", headers: headers });
    return { status, data };
  };
  const actions = openTheActionsGitHub({
    jeton: token,
    appeler: clientGitHub({ jeton: token, envoyer: reading }),
    envoyer: writingByCapacitor(world.capacitor),
    depot: (project) => (project === PROJECT ? REPOSITORY : undefined),
    dernier: (project) => (project === PROJECT ? READ : undefined),
    chef: (project, ticket) => (project === PROJECT && typeof ticket === "number" ? CHEFS.get(ticket) : undefined),
    ecrit: (project) => void writtenOnes.push(project),
  });
  return { gestes: actions, ecrits: writtenOnes };
}

// Le même geste, du desktop puis du téléphone, chacun sur son GitHub neuf : les deux GitHub ont reçu les mêmes demandes
// — méthode, adresse, en-têtes, corps —, et en gardent le même état. Rend ce que chacun en a dit, et le GitHub du téléphone.
async function twoTimes<R>(ofDesktop: (client: ReturnType<typeof desktop>) => Promise<R>, ofPhone: (actions: ReturnType<typeof phone>["gestes"]) => Promise<R>) {
  const atDesktop = github();
  const said = await ofDesktop(desktop(atDesktop));
  const atPhone = github();
  const { gestes: actions, ecrits: writtenOnes } = phone(atPhone);
  const saysAtPhone = await ofPhone(actions);
  assert.deepEqual(atPhone.recues, atDesktop.recues, "the phone sends GitHub the desktop's requests");
  assert.deepEqual(atPhone.etat(), atDesktop.etat(), "GitHub ends up as the desktop's gesture leaves it");
  assert.deepEqual(saysAtPhone, said, "the phone says what the desktop says");
  return { recues: atPhone.recues, etat: atPhone.etat(), dit: saysAtPhone, ecrits: writtenOnes };
}
const resume = (received: Received[]) => received.map(({ methode: method, url, corps: body }) => `${method} ${url.slice(API.length - 1)}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`);
const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${TOKEN}` };

describe("le téléphone écrit sur GitHub ce que le desktop y écrit pour le même geste", () => {
  test("répondre à une carte de TODO (resume) : le commentaire marqué posté, `served-elsewhere` et `chef-todo` retirés", async () => {
    const { recues: received, etat: state, dit: said, ecrits: writtenOnes } = await twoTimes(
      (client) => answerOnGithub({ depot: REPOSITORY, ticket: 40, chef: CHEFS.get(40), reponse: click(40, 1), client }),
      (actions) => actions.repondreCarte(PROJECT, 40, click(40, 1)),
    );
    assert.deepEqual(resume(received), [
      `POST /repos/${REPOSITORY}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`,
      `DELETE /repos/${REPOSITORY}/issues/40/labels/served-elsewhere`,
      `DELETE /repos/${REPOSITORY}/issues/40/labels/chef-todo`,
      // Une carte parque son ticket pour le chef (#4129) : répondue, `parked` part aussi — l'issue ne le porte pas, GitHub
      // répond 404.
      `DELETE /repos/${REPOSITORY}/issues/40/labels/parked`,
    ]);
    assert.deepEqual(state.issues[40]?.labels, ["fire"]);
    assert.deepEqual(said, { repondue: true, dit: "answer posted on #40 (resume): `served-elsewhere` and `chef-todo` removed", commentaire: 902 });
    assert.deepEqual(writtenOnes, [PROJECT], "the phone reads GitHub again, and the card leaves TODO");
  });

  test("répondre à une carte de TODO (merge) : la PR lue sur GitHub, mergée, puis `chef-todo` retiré", async () => {
    const { recues: received, etat: state } = await twoTimes(
      (client) => answerOnGithub({ depot: REPOSITORY, ticket: 41, chef: CHEFS.get(41), reponse: click(41, 1), client }),
      (actions) => actions.repondreCarte(PROJECT, 41, click(41, 1)),
    );
    assert.deepEqual(resume(received), [
      `GET /repos/${REPOSITORY}/pulls/1560`,
      `POST /repos/${REPOSITORY}/issues/41/comments {"body":"<!-- brigade:reponse gesture=merge -->\\nYes, merge PR #1560 as delivered"}`,
      `PUT /repos/${REPOSITORY}/pulls/1560/merge {"merge_method":"merge"}`,
      `DELETE /repos/${REPOSITORY}/issues/41/labels/chef-todo`,
      // Mergée, la livraison n'attend plus personne : `parked` — l'issue ne le porte pas, 404.
      `DELETE /repos/${REPOSITORY}/issues/41/labels/parked`,
    ]);
    assert.equal(state.pr.merged, true);
  });

});

describe("sans station joignable, la réponse passe par GitHub seul", () => {
  test("chaque demande part à api.github.com, avec la session GitHub du chef — aucune autre adresse n'est demandée", async () => {
    const world = github();
    const { gestes: actions } = phone(world);
    assert.ok("repondue" in (await actions.repondreCarte(PROJECT, 40, click(40, 1))));
    // La réponse : son commentaire, `served-elsewhere`, `chef-todo` et `parked` retirés (#4129).
    assert.equal(world.recues.length, 1 + 3);
    for (const { url, entetes: headers } of world.recues) {
      assert.ok(url.startsWith(API), `${url} is GitHub's API`);
      assert.deepEqual(headers, url.includes("/comments") ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS);
    }
  });

  test("ce que le téléphone ne lit pas ne part pas : une carte sans carte du chef", async () => {
    const world = github();
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    assert.deepEqual(await actions.repondreCarte(PROJECT, 22, click(40, 1)), { refus: WITHOUT_DONE.carte, detail: "" });
    assert.deepEqual(world.recues, []);
    assert.deepEqual(writtenOnes, []);
  });
});

describe("une écriture que GitHub ne prend pas se dit, et rien n'est montré fait", () => {
  const refuses = (when: (receivedOne: Received) => boolean): Outage => (receivedOne) => (when(receivedOne) ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined);

  test("GitHub injoignable : rien n'est changé, et le téléphone dit ce que le réseau a dit", async () => {
    const world = github(() => "injoignable");
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    const answeredOne = await actions.repondreCarte(PROJECT, 40, click(40, 1));
    assert.ok("refus" in answeredOne);
    assert.equal(answeredOne.refus, "nothing was sent: your answer was not posted on #40");
    assert.deepEqual(world.etat().issues[40]?.labels, ["chef-todo", "fire", "served-elsewhere"]);
    assert.deepEqual(writtenOnes, []);
  });

  test("la réponse que GitHub ne prend pas : elle n'est pas dite répondue, et la carte reste dans TODO", async () => {
    const world = github(refuses(({ methode: method }) => method === "POST"));
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    const said = await actions.repondreCarte(PROJECT, 40, click(40, 1));
    assert.ok(!("repondue" in said));
    assert.equal(said.refus, "nothing was sent: your answer was not posted on #40");
    assert.match(said.detail, /Resource not accessible by integration/);
    assert.deepEqual(resume(world.recues), [`POST /repos/${REPOSITORY}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`]);
    assert.deepEqual(world.etat().issues[40]?.labels, ["chef-todo", "fire", "served-elsewhere"]);
    assert.deepEqual(writtenOnes, []);
  });

  test("la réponse postée dont GitHub refuse le geste : dite à jouer sur GitHub, pas répondue", async () => {
    const world = github(refuses(({ methode: method, url }) => method === "DELETE" && url.endsWith("/labels/chef-todo")));
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    const said = await actions.repondreCarte(PROJECT, 40, click(40, 1));
    assert.ok(!("repondue" in said));
    assert.equal(said.refus, "your answer is posted on #40, but its gesture (resume) was not played — play it on GitHub");
    assert.deepEqual(writtenOnes, []);
  });
});

describe("dans la WebView", () => {
  // La WebView n'a rien de Node : le module, et tout ce qu'il importe, posé comme la construction de l'APK pose la lecture
  // du téléphone (packaging/android.ts, `poserLesModules`), se charge dans un Node privé de `process`.
  test("le module posé se charge sans rien de Node", (t) => {
    const www = mkdtempSync(join(tmpdir(), "gestes-github-telephone-"));
    t.after(() => rmSync(www, { recursive: true, force: true }));
    poserLesModules(www, APP, join(APP, "src", "actions-github-phone.ts"));
    const load = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "actions-github-phone.js")).href], { encoding: "utf8" });
    assert.equal(load.stdout.trim(), "openTheActionsGitHub writingByCapacitor", load.stderr);
  });
});

// Le téléphone tel que l'APK le porte : la vue et le pont posés par la construction (packaging/android.ts, `poserLaVue`),
// le pont joué comme dans la WebView, et les modules qu'il charge à côté de la vue. Le coffre garde le jeton du chef
// (#2500) ; le HTTP natif de Capacitor est le faux GitHub de ce fichier. Le stockage garde aussi un appairage d'avant
// #2500, avec l'adresse de sa station : elle ne répond pas, et n'est jamais demandée.
const SET = mkdtempSync(join(tmpdir(), "gestes-github-telephone-apk-"));
after(() => rmSync(SET, { recursive: true, force: true }));
let setOne: Promise<string> | undefined;
const theVueSet = () =>
  (setOne ??= demarrageDuPont().then((startup) => {
    poserLaVue(startup, join(SET, "www"));
    return join(SET, "www");
  }));
type CallNative = { plugin: string; methode: string; options: Record<string, unknown> };

// Le pont sur ce GitHub, une fois le rail et TODO de parade lus : la barre posée et « All projects » affiché, comme la vue
// les demande à l'ouverture.
async function bridgeOfLAPK(world: ReturnType<typeof github>) {
  const native: CallNative[] = [];
  const storage = new Map([["brigade.github", "chef"]]);
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(await theVueSet(), "src", "vue", "index.html")).href },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
    // La lecture suivante, dans trente secondes : jamais courue.
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    Capacitor: {
      nativePromise: async (plugin: string, method: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : gardées en JSON, comme elles passent au natif.
        const past = JSON.parse(JSON.stringify(options)) as Record<string, unknown>;
        native.push({ plugin, methode: method, options: past });
        if (plugin === "Coffre" && method === "lire") return { valeur: TOKEN };
        if (plugin !== "CapacitorHttp" || method !== "request") return assert.fail(`unexpected call: ${plugin}.${method}`);
        return world.capacitor(past as RequestNative);
      },
    },
  };
  vm.runInNewContext(readFileSync(join(await theVueSet(), "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const bridge = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const drawings: { projet?: string; tableau?: { rail: { attendLu?: string } } }[] = [];
  bridge.surFaits!((receivedOne: unknown) => void drawings.push(JSON.parse(JSON.stringify(receivedOne))));
  let projects: unknown;
  bridge.surConfiguration!((configuration: unknown) => void (projects = configuration));
  await bridge.demarrage!();
  void bridge.faits!(1);
  void bridge.tous!(2);
  // La liste lue, la vue redemande la barre et l'écran : le rail et TODO de chacun se lisent.
  await until(() => projects !== undefined);
  void bridge.faits!(3);
  void bridge.tous!(4);
  await until(() => drawings.some(({ projet: project, tableau: board }) => project === PROJECT && board?.rail.attendLu !== undefined));
  await atRest();
  return { pont: bridge, natifs: native, dessins: drawings };
}
// Attend un fait : le pont et le faux GitHub répondent sans horloge — il est là quand la file des promesses est vide.
async function until(done: () => boolean): Promise<void> {
  for (let tour = 0; tour < 500 && !done(); tour++) await repos();
  assert.ok(done(), "the fact never came");
}
const atRest = async () => {
  for (let tour = 0; tour < 20; tour++) await repos();
};

describe("par le pont de l'APK, sans station, les gestes du chef s'écrivent sur GitHub comme du desktop", () => {
  test("le pont connecté à GitHub porte les gestes de TODO, et rien des gestes de la fiche retirés", async () => {
    const { pont: bridge } = await bridgeOfLAPK(github());
    assert.equal(typeof bridge.repondreCarte, "function");
    assert.equal(typeof bridge.gesteDeValidation, "function");
    assert.equal(await bridge.attente!(PROJECT, "attente-reprendre", 31), undefined);
  });
});
