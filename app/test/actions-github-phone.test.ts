// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502) : répondre à une carte de TODO, reprendre
// (« back to the kitchen », « it arrived »), mettre en suspens (« remove from the rail ») et les gestes de WAITING
// (« waiting for… », « resume », #3075) font sur GitHub ce que le même geste fait du desktop. Chaque geste est joué deux fois, sur deux copies du même faux GitHub : par la chaîne du desktop
// — les fonctions que main.ts appelle, avec le client qu'il compose (`clientDesLabels`, porté par `fetch`) —, puis par le
// téléphone, porté par un faux HTTP natif de Capacitor ; les demandes que chaque GitHub a reçues, et ce qu'il en garde,
// sont comparées. Puis les mêmes gestes passent par le pont de l'APK tel que la construction le pose (www/android/pont.js) :
// connecté à GitHub, il lit le rail et TODO de parade sur ce faux GitHub, puis y écrit chaque geste du chef. Aucune
// station n'existe ici : seul GitHub répond, et l'adresse d'une station appairée avant #2500 n'est jamais demandée.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { LABELS_D_AVANT_PARKED } from "../../runtime/src/github-etat/etats.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { demarrageDuPont, poserLaVue, poserLesModules } from "../packaging/android.ts";
import { APP } from "../packaging/construire.ts";
import type { Answer } from "../src/card-todo.ts";
import { writingByCapacitor, openTheActionsGitHub, type RequestNative, type AnswerNative } from "../src/actions-github-phone.ts";
import { removeTheLabel, WITHOUT_DONE } from "../src/actions-github.ts";
import { clientOfThePriority, sendByFetch } from "../src/priority.ts";
import { clientGitHub, bodyRead, byFetch, type Send } from "../src/board/client.ts";
import type { BoardRead } from "../src/board/read.ts";
import { cardOfComment, shapeOfChef, type CardOfChef } from "../src/board/todo-github.ts";
import { answerOnGithub } from "../src/board-actions/answer-github.ts";
import { waitOnGithub } from "../src/vue/wait/wait-github.ts";
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
// Déparquer : `parked` retiré, puis chaque label d'attente d'avant parked (runtime/src/github-etat/etats.ts) — un ticket que
// l'un d'eux parque reprend aussi.
// « back to the kitchen » : `parked`, puis les labels d'avant parked que la cuisine lit encore ; une réponse de carte
// (board-actions/answer-github.ts) retire encore ceux de l'ancien runtime.
const LABELS_BEFORE_PARKED = ["waiting", "blocked-on-human"];
const unparked = (labels: readonly string[]) => (ticket: number) => ["parked", ...labels].map((label) => `DELETE /repos/${REPOSITORY}/issues/${ticket}/labels/${encodeURIComponent(label)}`);
const UNPARKED = unparked(LABELS_BEFORE_PARKED);
const UNPARKED_BY_ANSWER = unparked(LABELS_D_AVANT_PARKED);
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
      // Une carte parque son ticket pour le chef (#4129) : répondue, `parked` part aussi, et tout label d'attente d'avant parked
      // — l'issue ne les porte pas, GitHub répond 404.
      ...UNPARKED_BY_ANSWER(40),
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
      // Mergée, la livraison n'attend plus personne : `parked` et les labels d'avant parked — l'issue ne les porte pas, 404.
      ...UNPARKED_BY_ANSWER(41),
    ]);
    assert.equal(state.pr.merged, true);
  });

  test("reprendre — « back to the kitchen » sur la fiche : `parked` retiré, et chaque label d'attente d'avant parked", async () => {
    const { recues: received, etat: state, dit: said, ecrits: writtenOnes } = await twoTimes(
      (client) => removeTheLabel(READ, "cuisine", 31, client),
      (actions) => actions.geste(PROJECT, "cuisine", 31),
    );
    assert.deepEqual(resume(received), UNPARKED(31));
    assert.deepEqual(state.issues[31]?.labels, ["fire"]);
    assert.deepEqual(said, { fait: "back to the kitchen on GitHub: #31 no longer carries `parked` — it resumes exactly where it was", detail: `https://github.com/${REPOSITORY}/issues/31` });
    assert.deepEqual(writtenOnes, [PROJECT]);
  });

  test("reprendre — « it arrived, back to the kitchen » sur une carte de WAITING : ce que le desktop en écrit", async () => {
    const { recues: received } = await twoTimes(
      (client) => removeTheLabel(READ, "cuisine", 31, client),
      (actions) => actions.attente(PROJECT, "attente-arrivee", 31),
    );
    assert.deepEqual(resume(received), UNPARKED(31));
  });

  // #3075 : le téléphone ne joint aucun runtime ; « waiting for… » et « resume » s'écrivent sur l'issue comme le desktop les
  // écrit, sur tout projet (vue/wait/wait-github.ts). Le commentaire de parking (#4129) ne dit plus l'instant de la
  // mise en attente : les deux GitHub reçoivent les mêmes demandes, au caractère près.
  test("« waiting for… » : le commentaire de parking posté, puis `parked` posé — ce que le desktop écrit", async () => {
    const input = { quoi: "the signed quote", qui: "the client", relance: "2099-01-02" };
    const atDesktop = github();
    const said = await waitOnGithub({ id: "attente-poser", ticket: 22, saisie: input, aujourdhui: new Date(), lu: READ, client: desktop(atDesktop) });
    const atPhone = github();
    const { gestes: actions, ecrits: writtenOnes } = phone(atPhone);
    const saysAtPhone = await actions.attente(PROJECT, "attente-poser", 22, input);
    assert.deepEqual(resume(atPhone.recues), resume(atDesktop.recues));
    assert.deepEqual(saysAtPhone, said);
    assert.deepEqual(
      atPhone.recues.map(({ methode: method, url }) => `${method} ${url.slice(API.length - 1)}`),
      [`POST /repos/${REPOSITORY}/issues/22/comments`, `POST /repos/${REPOSITORY}/issues/22/labels`],
    );
    const state = atPhone.etat().issues[22];
    assert.deepEqual(state?.labels, ["fire", "parked"]);
    assert.match(state?.commentaires[0] ?? "", /^<!-- brigade:parked \{"what":"the signed quote","who":"the client","followUp":"[^"]+"\} -->\n\*\*PARKED: waits for the client\.\*\* the signed quote\n/);
    assert.deepEqual(said, { fait: "in WAITING on GitHub: #22 awaits the client, follow-up on 2099-01-02", detail: `https://github.com/${REPOSITORY}/issues/22#issuecomment-901` });
    assert.deepEqual(writtenOnes, [PROJECT]);
  });

  test("« resume » sur une carte de WAITING : `parked` retiré, et la phrase dit qu'il revient où il était — plus rien d'une station", async () => {
    const { recues: received, etat: state, dit: said, ecrits: writtenOnes } = await twoTimes(
      async (client) => waitOnGithub({ id: "attente-reprendre", ticket: 31, saisie: undefined, aujourdhui: new Date(), lu: READ, client }),
      (actions) => actions.attente(PROJECT, "attente-reprendre", 31),
    );
    assert.deepEqual(resume(received), UNPARKED(31));
    assert.deepEqual(state.issues[31]?.labels, ["fire"]);
    assert.deepEqual(said, { fait: "resumed on GitHub: #31 no longer carries `parked` — it resumes exactly where it was", detail: `https://github.com/${REPOSITORY}/issues/31` });
    assert.deepEqual(writtenOnes, [PROJECT]);
    assert.ok(!JSON.stringify(said).includes("station"));
  });

  test("« waiting for… » sans ce qu'il attend : refusé avant GitHub, la phrase le dit, rien n'est écrit", async () => {
    const world = github();
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    assert.deepEqual(await actions.attente(PROJECT, "attente-poser", 22, { quoi: "  ", qui: "the client", relance: "2099-01-02" }), { refus: "nothing is written: say what it waits for, in your words", detail: "" });
    assert.deepEqual(world.recues, []);
    assert.deepEqual(writtenOnes, []);
  });

  test("mettre en suspens — « remove from the rail » : `fire` retiré, aucune station ne le prend plus", async () => {
    const { recues: received, etat: state, dit: said, ecrits: writtenOnes } = await twoTimes(
      (client) => removeTheLabel(READ, "retirer", 22, client),
      (actions) => actions.geste(PROJECT, "retirer", 22),
    );
    assert.deepEqual(resume(received), [`DELETE /repos/${REPOSITORY}/issues/22/labels/fire`]);
    assert.deepEqual(state.issues[22]?.labels, []);
    assert.deepEqual(said, { fait: "taken off the rail on GitHub: #22 no longer carries `fire` — no station takes it", detail: `https://github.com/${REPOSITORY}/issues/22` });
    assert.deepEqual(writtenOnes, [PROJECT]);
  });

  test("la fiche propose sur le téléphone les gestes qu'il écrit sur GitHub, avec le prix du desktop", () => {
    const { gestes: actions } = phone(github());
    assert.deepEqual(actions.gestesDeFiche({ ticket: 22, etat: "en attente", ouvrable: true, attendu: false }).map(({ id }) => id), ["retirer"]);
    // Revenu de WAITING, il attend le chef : le renvoyer en cuisine d'abord, ou le retirer du rail.
    const back = actions.gestesDeFiche({ ticket: 31, etat: "en attente", ouvrable: true, attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } });
    assert.deepEqual(back.map(({ id, recommande: recommended }) => (recommended ? `${id}*` : id)), ["cuisine*", "retirer"]);
  });
});

describe("sans station joignable, les trois gestes passent par GitHub seul", () => {
  test("chaque demande part à api.github.com, avec la session GitHub du chef — aucune autre adresse n'est demandée", async () => {
    const world = github();
    const { gestes: actions } = phone(world);
    assert.ok("repondue" in (await actions.repondreCarte(PROJECT, 40, click(40, 1))));
    assert.ok("fait" in (await actions.geste(PROJECT, "cuisine", 31)));
    assert.ok("fait" in (await actions.geste(PROJECT, "retirer", 22)));
    // La réponse : son commentaire, `served-elsewhere`, `chef-todo`, `parked` et les labels d'avant parked retirés (#4129) ; puis
    // `parked` et les labels d'avant parked, puis `fire`.
    assert.equal(world.recues.length, 1 + 2 + UNPARKED_BY_ANSWER(40).length + UNPARKED(31).length + 1);
    for (const { url, entetes: headers } of world.recues) {
      assert.ok(url.startsWith(API), `${url} is GitHub's API`);
      assert.deepEqual(headers, url.includes("/comments") ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS);
    }
  });

  test("merger n'est plus un geste de la fiche, comme du desktop : rien ne part", async () => {
    const world = github();
    assert.match((await phone(world).gestes.geste(PROJECT, "merger", 22) as { refus: string }).refus, /^nothing was sent: this phone does not play this action/);
    assert.deepEqual(world.recues, []);
  });

  test("ce que le téléphone ne lit pas ne part pas : un ticket hors du dernier rail, une carte sans carte du chef, un projet inconnu", async () => {
    const world = github();
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    assert.deepEqual(await actions.geste(PROJECT, "retirer", 99), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    assert.deepEqual(await actions.geste("ailleurs", "cuisine", 31), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(await actions.repondreCarte(PROJECT, 22, click(40, 1)), { refus: WITHOUT_DONE.carte, detail: "" });
    assert.ok("refus" in (await actions.attente(PROJECT, "attente-poser", 22)));
    assert.deepEqual(world.recues, []);
    assert.deepEqual(writtenOnes, []);
  });
});

describe("une écriture que GitHub ne prend pas se dit, et rien n'est montré fait", () => {
  const refuses = (when: (receivedOne: Received) => boolean): Outage => (receivedOne) => (when(receivedOne) ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined);

  test("reprendre ou mettre en suspens, refusé par GitHub : la ligne le dit, GitHub au survol, et le rail n'est pas relu", async () => {
    const { gestes: actions, ecrits: writtenOnes } = phone(github(refuses(() => true)));
    const said = await actions.geste(PROJECT, "retirer", 22);
    assert.ok("refus" in said);
    assert.equal(said.refus, "nothing was changed: GitHub did not remove `fire` from #22");
    assert.match(said.detail, /403.*Resource not accessible by integration/);
    assert.ok("refus" in (await actions.geste(PROJECT, "cuisine", 31)));
    assert.deepEqual(writtenOnes, []);
  });

  test("GitHub injoignable : rien n'est changé, et le téléphone dit ce que le réseau a dit", async () => {
    const world = github(() => "injoignable");
    const { gestes: actions, ecrits: writtenOnes } = phone(world);
    const said = await actions.geste(PROJECT, "cuisine", 31);
    assert.deepEqual(said, { refus: "nothing was changed: GitHub did not remove `parked` from #31", detail: 'Unable to resolve host "api.github.com": No address associated with hostname' });
    const answeredOne = await actions.repondreCarte(PROJECT, 40, click(40, 1));
    assert.ok("refus" in answeredOne);
    assert.equal(answeredOne.refus, "nothing was sent: your answer was not posted on #40");
    assert.deepEqual(world.etat().issues[31]?.labels, ["fire", "parked"]);
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
// Ce que le téléphone lit de GitHub — les gists, le rail, TODO et le chef du projet, à qui ses cartes sont partagées
// (#2985), lu de son fichier ou, sans lui, du propriétaire du dépôt (#3052), et le `CLAUDE.md` qui nomme la roadmap du
// Backlog (#3589) —, mis à part : il reste ce que le geste y a écrit, et ce qu'il a lu pour l'écrire.
const READING = /^https:\/\/api\.github\.com\/(gists[/?]|repos\/[^/]+\/[^/]+(\/(issues\?|pulls\?|issues\/\d+\/(comments|events)\?|contents\/(\.claude\/brigade\/projet\.json|CLAUDE\.md)$)|$))/;
// Le rail relu après le geste lit aussi chaque PR seule, pour sa taille (#4051) : ces lectures-là, venues après la dernière
// écriture, ne sont pas du geste — celles qui le précèdent (le merge lit sa PR) en sont.
const ofAction = (received: Received[]) => {
  const last = received.findLastIndex(({ methode: method }) => method !== "GET");
  return received.filter(({ methode: method, url }, rank) => !(method === "GET" && (READING.test(url) || (rank > last && /\/pulls\/\d+$/.test(url)))));
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

// Le geste du desktop, puis le même par le pont de l'APK, chacun sur son GitHub neuf : ce que le pont y écrit est ce que
// le desktop y écrit — méthode, adresse, en-têtes, corps —, GitHub en garde le même état, la vue reçoit la même phrase.
async function byTheBridge<R>(ofDesktop: (client: ReturnType<typeof desktop>) => Promise<R>, name: string, ...args: unknown[]) {
  const atDesktop = github();
  const said = await ofDesktop(desktop(atDesktop));
  const atPhone = github();
  const { pont: bridge, natifs: native } = await bridgeOfLAPK(atPhone);
  const before = atPhone.recues.length;
  const saysAtPhone = json(await bridge[name]!(...args));
  await atRest();
  const writtenEntries = ofAction(atPhone.recues.slice(before));
  assert.deepEqual(writtenEntries, atDesktop.recues, "the phone's bridge sends GitHub the desktop's requests");
  assert.deepEqual(atPhone.etat(), atDesktop.etat(), "GitHub ends up as the desktop's gesture leaves it");
  assert.deepEqual(saysAtPhone, json(said), "the phone says what the desktop says");
  // Aucune station : chaque appel du HTTP natif va à l'API de GitHub, avec le jeton du coffre.
  const http = native.filter(({ plugin }) => plugin === "CapacitorHttp");
  assert.deepEqual(http.filter(({ options }) => !String(options.url).startsWith(API)), []);
  assert.ok(http.every(({ options }) => (options.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`));
  // Une écriture que GitHub a prise relance la lecture : le rail relu la montre.
  const reread = atPhone.recues.slice(before).filter(({ methode: method, url }) => method === "GET" && READING.test(url));
  return { ecrites: writtenEntries, dit: saysAtPhone, relues: reread };
}

describe("par le pont de l'APK, sans station, les gestes du chef s'écrivent sur GitHub comme du desktop", () => {
  test("répondre à une carte de TODO : la réponse postée sur l'issue, `served-elsewhere` et `chef-todo` retirés — puis GitHub relu", async () => {
    const { ecrites: writtenEntries, dit: said, relues: reread } = await byTheBridge((client) => answerOnGithub({ depot: REPOSITORY, ticket: 40, chef: CHEFS.get(40), reponse: click(40, 1), client }), "repondreCarte", PROJECT, 40, click(40, 1));
    assert.deepEqual(resume(writtenEntries), [
      `POST /repos/${REPOSITORY}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`,
      `DELETE /repos/${REPOSITORY}/issues/40/labels/served-elsewhere`,
      `DELETE /repos/${REPOSITORY}/issues/40/labels/chef-todo`,
      // Une carte parque son ticket pour le chef (#4129) : répondue, `parked` part aussi, et tout label d'attente d'avant parked
      // — l'issue ne les porte pas, GitHub répond 404.
      ...UNPARKED_BY_ANSWER(40),
    ]);
    assert.ok("repondue" in said);
    assert.ok(reread.length > 0);
  });

  test("répondre à une carte de TODO par un merge : la PR lue, mergée, puis `chef-todo` retiré", async () => {
    const { ecrites: writtenEntries } = await byTheBridge((client) => answerOnGithub({ depot: REPOSITORY, ticket: 41, chef: CHEFS.get(41), reponse: click(41, 1), client }), "repondreCarte", PROJECT, 41, click(41, 1));
    assert.deepEqual(resume(writtenEntries).map((line) => line.split(" {")[0]), [`GET /repos/${REPOSITORY}/pulls/1560`, `POST /repos/${REPOSITORY}/issues/41/comments`, `PUT /repos/${REPOSITORY}/pulls/1560/merge`, `DELETE /repos/${REPOSITORY}/issues/41/labels/chef-todo`, ...UNPARKED_BY_ANSWER(41)]);
  });

  test("reprendre — « back to the kitchen » sur la fiche : `parked` retiré", async () => {
    const { ecrites: writtenEntries, dit: said } = await byTheBridge((client) => removeTheLabel(READ, "cuisine", 31, client), "gesteDeFiche", PROJECT, "cuisine", 31);
    assert.deepEqual(resume(writtenEntries), UNPARKED(31));
    assert.ok("fait" in said);
  });

  test("reprendre — « it arrived, back to the kitchen » sur une carte de WAITING : `parked` retiré", async () => {
    const { ecrites: writtenEntries } = await byTheBridge((client) => removeTheLabel(READ, "cuisine", 31, client), "attente", PROJECT, "attente-arrivee", 31);
    assert.deepEqual(resume(writtenEntries), UNPARKED(31));
  });

  test("« resume » sur une carte de WAITING : `parked` retiré", async () => {
    const { ecrites: writtenEntries, dit: said } = await byTheBridge((client) => waitOnGithub({ id: "attente-reprendre", ticket: 31, saisie: undefined, aujourdhui: new Date(), lu: READ, client }), "attente", PROJECT, "attente-reprendre", 31);
    assert.deepEqual(resume(writtenEntries), UNPARKED(31));
    assert.ok("fait" in said);
  });

  test("« waiting for… » : ce que le chef a rempli passe le pont, et part sur l'issue — le commentaire, puis `parked`", async () => {
    const world = github();
    const { pont: bridge } = await bridgeOfLAPK(world);
    const before = world.recues.length;
    const said = json(await bridge.attente!(PROJECT, "attente-poser", 22, { quoi: "the signed quote", qui: "the client", relance: "2099-01-02" }));
    await atRest();
    assert.deepEqual(said.fait, "in WAITING on GitHub: #22 awaits the client, follow-up on 2099-01-02");
    assert.deepEqual(ofAction(world.recues.slice(before)).map(({ methode: method, url }) => `${method} ${url.slice(API.length - 1)}`), [`POST /repos/${REPOSITORY}/issues/22/comments`, `POST /repos/${REPOSITORY}/issues/22/labels`]);
    assert.deepEqual(world.etat().issues[22]?.labels, ["fire", "parked"]);
  });

  test("mettre en suspens — « remove from the rail » : `fire` retiré", async () => {
    const { ecrites: writtenEntries, dit: said } = await byTheBridge((client) => removeTheLabel(READ, "retirer", 22, client), "gesteDeFiche", PROJECT, "retirer", 22);
    assert.deepEqual(resume(writtenEntries), [`DELETE /repos/${REPOSITORY}/issues/22/labels/fire`]);
    assert.ok("fait" in said);
  });

  test("la fiche, sur le téléphone, propose les gestes qu'il écrit sur GitHub — rien d'une station", async () => {
    const { pont: bridge } = await bridgeOfLAPK(github());
    assert.deepEqual(json(await bridge.gestesDeFiche!({ ticket: 22, etat: "en attente", ouvrable: true, attendu: false })).map(({ id }: { id: string }) => id), ["retirer"]);
    assert.match(json(await bridge.gesteDeFiche!(PROJECT, "merger", 22)).refus, /^nothing was sent: this phone does not play this action/);
  });

  test("une écriture que GitHub refuse : le pont rend la phrase, GitHub au survol ; rien n'est relu, rien n'est montré fait", async () => {
    const world = github((receivedOne) => (receivedOne.methode === "GET" ? undefined : { status: 403, data: { message: "Resource not accessible by integration" } }));
    const { pont: bridge } = await bridgeOfLAPK(world);
    const before = world.recues.length;
    const said = json(await bridge.gesteDeFiche!(PROJECT, "retirer", 22));
    assert.equal(said.refus, "nothing was changed: GitHub did not remove `fire` from #22");
    assert.match(said.detail, /403.*Resource not accessible by integration/);
    const answeredOne = json(await bridge.repondreCarte!(PROJECT, 40, click(40, 1)));
    assert.ok(!("repondue" in answeredOne));
    assert.equal(answeredOne.refus, "nothing was sent: your answer was not posted on #40");
    await atRest();
    assert.deepEqual(resume(world.recues.slice(before)).map((line) => line.split(" {")[0]), [`DELETE /repos/${REPOSITORY}/issues/22/labels/fire`, `POST /repos/${REPOSITORY}/issues/40/comments`]);
    assert.deepEqual(world.etat().issues[22]?.labels, ["fire"]);
  });
});
