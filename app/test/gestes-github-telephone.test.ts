// Les gestes du chef depuis le téléphone, écrits sur GitHub même (#2502) : répondre à une carte de TODO, reprendre
// (« back to the kitchen », « it arrived ») et mettre en suspens (« remove from the rail ») font sur GitHub ce que le même
// geste fait du desktop. Chaque geste est joué deux fois, sur deux copies du même faux GitHub : par la chaîne du desktop
// — les fonctions que main.ts appelle, avec le client qu'il compose (`clientDesLabels`, porté par `fetch`) —, puis par le
// téléphone, porté par un faux HTTP natif de Capacitor ; les demandes que chaque GitHub a reçues, et ce qu'il en garde,
// sont comparées. Puis les mêmes gestes passent par le pont de l'APK tel que la construction le pose (www/android/pont.js) :
// connecté à GitHub, il lit le rail et TODO de parade sur ce faux GitHub, puis y écrit chaque geste du chef. Aucune
// station n'existe ici : seul GitHub répond, et l'adresse d'une station appairée avant #2500 n'est jamais demandée.
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
import type { Reponse } from "../src/carte-todo.ts";
import { ecritureParCapacitor, ouvrirLesGestesGitHub, type DemandeNative, type ReponseNative } from "../src/gestes-github-telephone.ts";
import { retirerLeLabel, SANS_FAIT } from "../src/gestes-github.ts";
import { clientDeLaPriorite, envoyerParFetch } from "../src/priorite.ts";
import { clientGitHub, corpsLu, parFetch, type Envoi } from "../src/tableau/client.ts";
import type { TableauLu } from "../src/tableau/lecture.ts";
import { carteDuCommentaire, formeDuChef, type CarteDuChef } from "../src/tableau/todo-github.ts";
import { repondreSurGithub } from "../src/tableau-gestes/reponse-github.ts";
import { repos } from "./aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const PROJET = "parade";
const JETON = "gho_du_chef";
const API = "https://api.github.com/";

// Deux questions du chef, chacune sous `hors-cuisine` et `chef-todo` : #40 se reprend ou se laisse, #41 a sa PR ouverte,
// #1560, à merger.
const QUESTION_40 = ["<!-- brigade:todo kind=product-question -->", "Keep the old export?", "- [resume] Yes, keep it", "- [drop] No, drop it"].join("\n");
const QUESTION_41 = ["<!-- brigade:todo kind=product-question -->", "Does the export keep the old column order?", "- [merge] Yes, merge PR #1560 as delivered", "- [close] No, we drop the export"].join("\n");
const CHEFS = new Map<number, CarteDuChef>([
  [40, carteDuCommentaire(QUESTION_40) ?? assert.fail("#40 carries a chef's card")],
  [41, carteDuCommentaire(QUESTION_41) ?? assert.fail("#41 carries a chef's card")],
]);
// La réponse que la vue envoie d'un clic sur le choix `rang` de la carte de `ticket`.
const clic = (ticket: number, rang: number): Reponse => ({ question: formeDuChef((CHEFS.get(ticket) as CarteDuChef).texte).question, choix: rang });

// La dernière lecture du rail de parade : #22 sur son rail, #31 revenu de WAITING, #40 et #41 dans TODO.
const LU: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: "2026-11-06T10:00:00.000Z",
  cuisine: { rubriques: [] },
  faits: { rail: [{ ticket: 22, etat: "en attente" }, { ticket: 31, etat: "en attente" }], attend: [{ ticket: 40 }, { ticket: 41 }] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

type Issue = { labels: Set<string>; state: string; commentaires: string[] };
type Recue = { methode: string; url: string; entetes: Record<string, string>; corps?: unknown };
type Panne = (recue: Recue) => { status: number; data: unknown } | "injoignable" | undefined;

// Un faux GitHub qui tient son monde — les issues de parade, leurs labels, leurs commentaires, la PR #1560 — et note
// chaque demande reçue, telle qu'elle est arrivée. `panne` : ce qu'il rend à la place de sa réponse, ou ne rien rendre.
function github(panne: Panne = () => undefined) {
  const issues = new Map<number, Issue>([
    [22, { labels: new Set(["fire"]), state: "open", commentaires: [] }],
    [31, { labels: new Set(["fire", "waiting"]), state: "open", commentaires: [] }],
    [40, { labels: new Set(["fire", "hors-cuisine", "chef-todo"]), state: "open", commentaires: [QUESTION_40] }],
    [41, { labels: new Set(["fire", "hors-cuisine", "chef-todo"]), state: "open", commentaires: [QUESTION_41] }],
  ]);
  const pr = { numero: 1560, state: "open", merged: false, ref: "cook/41-export", body: "Closes #41" };
  const recues: Recue[] = [];
  const prJson = () => ({ number: pr.numero, state: pr.state, merged: pr.merged, head: { ref: pr.ref }, body: pr.body });
  function repondre(recue: Recue): { status: number; data: unknown } {
    recues.push(recue);
    // Ce qui n'est pas l'API de GitHub ne répond pas, comme une station qui n'existe pas.
    if (!recue.url.startsWith(API)) throw new Error(`failed to connect to ${recue.url}`);
    const panneLue = panne(recue);
    if (panneLue === "injoignable") throw new Error("Unable to resolve host \"api.github.com\": No address associated with hostname");
    if (panneLue !== undefined) return panneLue;
    // Ce que le téléphone lit : le gist où une station garde les projets du chef, puis le rail et TODO de parade.
    if (recue.methode === "GET" && recue.url.startsWith(`${API}gists?`)) return { status: 200, data: /[?&]page=1(&|$)/.test(recue.url) ? [{ id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json" } } }] : [] };
    if (recue.methode === "GET" && recue.url === `${API}gists/g1`) return { status: 200, data: { id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json", content: PROJETS_DU_GIST } } } };
    const chemin = recue.url.slice(`${API}repos/${DEPOT}`.length);
    const page = Number(/[?&]page=(\d+)/.exec(chemin)?.[1] ?? "1");
    if (recue.methode === "GET" && chemin.startsWith("/issues?")) {
      const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
      const ouvertes = [...issues].filter(([, issue]) => issue.state === "open" && (label === undefined || issue.labels.has(decodeURIComponent(label))));
      return { status: 200, data: page > 1 ? [] : ouvertes.map(([numero, issue]) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${DEPOT}/issues/${numero}`, created_at: "2026-11-05T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })) })) };
    }
    const lu = /^\/issues\/(\d+)\/(comments|events)\?/.exec(chemin);
    if (recue.methode === "GET" && lu !== null) {
      const commentaires = lu[2] === "comments" && page === 1 ? (issues.get(Number(lu[1]))?.commentaires ?? []) : [];
      return { status: 200, data: commentaires.map((body, rang) => ({ id: Number(lu[1]) * 100 + rang, body, created_at: `2026-11-06T0${rang}:00:00Z`, author_association: "OWNER" })) };
    }
    if (recue.methode === "GET" && chemin.startsWith("/pulls?")) return { status: 200, data: pr.state === "open" ? [prJson()] : [] };
    if (recue.methode === "GET" && chemin === `/pulls/${pr.numero}`) return { status: 200, data: prJson() };
    if (recue.methode === "PUT" && chemin === `/pulls/${pr.numero}/merge`) {
      Object.assign(pr, { state: "closed", merged: true });
      return { status: 200, data: { merged: true } };
    }
    const [, numero, reste] = /^\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
    const issue = issues.get(Number(numero));
    if (issue === undefined) return { status: 404, data: { message: "Not Found" } };
    if (recue.methode === "POST" && reste === "/comments") {
      issue.commentaires.push((recue.corps as { body: string }).body);
      const id = 900 + issue.commentaires.length;
      return { status: 201, data: { id, html_url: `https://github.com/${DEPOT}/issues/${numero}#issuecomment-${id}` } };
    }
    const label = /^\/labels\/(.+)$/.exec(reste ?? "")?.[1];
    if (recue.methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? { status: 200, data: [...issue.labels].map((name) => ({ name })) } : { status: 404, data: { message: "Label does not exist" } };
    if (recue.methode === "PATCH" && reste === "") {
      issue.state = (recue.corps as { state: string }).state;
      return { status: 200, data: {} };
    }
    return { status: 404, data: { message: "Not Found" } };
  }

  // Le `fetch` du desktop : il reçoit l'adresse, la méthode, les en-têtes et le corps écrit en JSON.
  const fetch = (async (adresse: string | URL | Request, init?: RequestInit) => {
    const { status, data } = repondre({ methode: init?.method ?? "GET", url: String(adresse), entetes: { ...(init?.headers as Record<string, string>) }, ...(typeof init?.body === "string" ? { corps: corpsLu(init.body) } : {}) });
    return new Response(JSON.stringify(data), { status });
  }) as typeof globalThis.fetch;
  // Le HTTP natif de Capacitor sur le téléphone : il reçoit le corps en objet, et rend la réponse lue en JSON.
  const capacitor = async (demande: DemandeNative | { url: string; method: "GET"; headers: Record<string, string> }): Promise<ReponseNative> => {
    const { status, data } = repondre({ methode: demande.method, url: demande.url, entetes: { ...demande.headers }, ...("data" in demande && demande.data !== undefined ? { corps: demande.data } : {}) });
    return { status, data, headers: { "content-type": "application/json; charset=utf-8" } };
  };
  const etat = () => ({ issues: Object.fromEntries([...issues].map(([numero, issue]) => [numero, { labels: [...issue.labels].sort(), state: issue.state, commentaires: issue.commentaires }])), pr: { ...pr } });
  return { recues, fetch, capacitor, etat };
}

const jeton = async () => JETON;
const PROJETS_DU_GIST = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: PROJET, depot: DEPOT, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null }] });

// La chaîne du desktop pour ce GitHub : le client que main.ts compose (`clientDesLabels`) — le `GET` des lectures et les
// écritures par `fetch`, avec le jeton du chef.
function desktop(monde: ReturnType<typeof github>) {
  return clientDeLaPriorite({ jeton, appeler: clientGitHub({ jeton, envoyer: parFetch({ fetch: monde.fetch }) }), envoyer: envoyerParFetch({ fetch: monde.fetch }) });
}

// Les gestes du téléphone pour ce GitHub : le jeton du coffre, les lectures et les écritures par le HTTP natif, et ce que
// sa dernière lecture de GitHub dit de parade. `ecrits` : les projets que le téléphone relit après une écriture prise.
function telephone(monde: ReturnType<typeof github>) {
  const ecrits: string[] = [];
  const lecture: Envoi = async (adresse, entetes) => {
    const { status, data } = await monde.capacitor({ url: adresse, method: "GET", headers: entetes });
    return { status, data };
  };
  const gestes = ouvrirLesGestesGitHub({
    jeton,
    appeler: clientGitHub({ jeton, envoyer: lecture }),
    envoyer: ecritureParCapacitor(monde.capacitor),
    depot: (projet) => (projet === PROJET ? DEPOT : undefined),
    dernier: (projet) => (projet === PROJET ? LU : undefined),
    chef: (projet, ticket) => (projet === PROJET && typeof ticket === "number" ? CHEFS.get(ticket) : undefined),
    ecrit: (projet) => void ecrits.push(projet),
  });
  return { gestes, ecrits };
}

// Le même geste, du desktop puis du téléphone, chacun sur son GitHub neuf : les deux GitHub ont reçu les mêmes demandes
// — méthode, adresse, en-têtes, corps —, et en gardent le même état. Rend ce que chacun en a dit, et le GitHub du téléphone.
async function deuxFois<R>(duDesktop: (client: ReturnType<typeof desktop>) => Promise<R>, duTelephone: (gestes: ReturnType<typeof telephone>["gestes"]) => Promise<R>) {
  const auDesktop = github();
  const dit = await duDesktop(desktop(auDesktop));
  const auTelephone = github();
  const { gestes, ecrits } = telephone(auTelephone);
  const ditAuTelephone = await duTelephone(gestes);
  assert.deepEqual(auTelephone.recues, auDesktop.recues, "the phone sends GitHub the desktop's requests");
  assert.deepEqual(auTelephone.etat(), auDesktop.etat(), "GitHub ends up as the desktop's gesture leaves it");
  assert.deepEqual(ditAuTelephone, dit, "the phone says what the desktop says");
  return { recues: auTelephone.recues, etat: auTelephone.etat(), dit: ditAuTelephone, ecrits };
}
const resume = (recues: Recue[]) => recues.map(({ methode, url, corps }) => `${methode} ${url.slice(API.length - 1)}${corps === undefined ? "" : ` ${JSON.stringify(corps)}`}`);
const ENTETES = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${JETON}` };

describe("le téléphone écrit sur GitHub ce que le desktop y écrit pour le même geste", () => {
  test("répondre à une carte de TODO (resume) : le commentaire marqué posté, `hors-cuisine` et `chef-todo` retirés", async () => {
    const { recues, etat, dit, ecrits } = await deuxFois(
      (client) => repondreSurGithub({ depot: DEPOT, ticket: 40, chef: CHEFS.get(40), reponse: clic(40, 1), client }),
      (gestes) => gestes.repondreCarte(PROJET, 40, clic(40, 1)),
    );
    assert.deepEqual(resume(recues), [
      `POST /repos/${DEPOT}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`,
      `DELETE /repos/${DEPOT}/issues/40/labels/hors-cuisine`,
      `DELETE /repos/${DEPOT}/issues/40/labels/chef-todo`,
    ]);
    assert.deepEqual(etat.issues[40]?.labels, ["fire"]);
    assert.deepEqual(dit, { repondue: true, dit: "answer posted on #40 (resume): `hors-cuisine` and `chef-todo` removed", commentaire: 902 });
    assert.deepEqual(ecrits, [PROJET], "the phone reads GitHub again, and the card leaves TODO");
  });

  test("répondre à une carte de TODO (merge) : la PR lue sur GitHub, mergée, puis `chef-todo` retiré", async () => {
    const { recues, etat } = await deuxFois(
      (client) => repondreSurGithub({ depot: DEPOT, ticket: 41, chef: CHEFS.get(41), reponse: clic(41, 1), client }),
      (gestes) => gestes.repondreCarte(PROJET, 41, clic(41, 1)),
    );
    assert.deepEqual(resume(recues), [
      `GET /repos/${DEPOT}/pulls/1560`,
      `POST /repos/${DEPOT}/issues/41/comments {"body":"<!-- brigade:reponse gesture=merge -->\\nYes, merge PR #1560 as delivered"}`,
      `PUT /repos/${DEPOT}/pulls/1560/merge {"merge_method":"merge"}`,
      `DELETE /repos/${DEPOT}/issues/41/labels/chef-todo`,
    ]);
    assert.equal(etat.pr.merged, true);
  });

  test("reprendre — « back to the kitchen » sur la fiche : `waiting` retiré, une seule demande", async () => {
    const { recues, etat, dit, ecrits } = await deuxFois(
      (client) => retirerLeLabel(LU, "cuisine", 31, client),
      (gestes) => gestes.geste(PROJET, "cuisine", 31),
    );
    assert.deepEqual(resume(recues), [`DELETE /repos/${DEPOT}/issues/31/labels/waiting`]);
    assert.deepEqual(etat.issues[31]?.labels, ["fire"]);
    assert.deepEqual(dit, { fait: "back to the kitchen on GitHub: #31 no longer carries `waiting` — it is queued on the rail again", detail: `https://github.com/${DEPOT}/issues/31` });
    assert.deepEqual(ecrits, [PROJET]);
  });

  test("reprendre — « it arrived, back to the kitchen » sur une carte de WAITING : ce que le desktop en écrit", async () => {
    const { recues } = await deuxFois(
      (client) => retirerLeLabel(LU, "cuisine", 31, client),
      (gestes) => gestes.attente(PROJET, "attente-arrivee", 31),
    );
    assert.deepEqual(resume(recues), [`DELETE /repos/${DEPOT}/issues/31/labels/waiting`]);
  });

  test("mettre en suspens — « remove from the rail » : `fire` retiré, aucune station ne le prend plus", async () => {
    const { recues, etat, dit, ecrits } = await deuxFois(
      (client) => retirerLeLabel(LU, "retirer", 22, client),
      (gestes) => gestes.geste(PROJET, "retirer", 22),
    );
    assert.deepEqual(resume(recues), [`DELETE /repos/${DEPOT}/issues/22/labels/fire`]);
    assert.deepEqual(etat.issues[22]?.labels, []);
    assert.deepEqual(dit, { fait: "taken off the rail on GitHub: #22 no longer carries `fire` — no station takes it", detail: `https://github.com/${DEPOT}/issues/22` });
    assert.deepEqual(ecrits, [PROJET]);
  });

  test("la fiche propose sur le téléphone les gestes qu'il écrit sur GitHub, avec le prix du desktop", () => {
    const { gestes } = telephone(github());
    assert.deepEqual(gestes.gestesDeFiche({ ticket: 22, etat: "en attente", ouvrable: true, attendu: false }).map(({ id }) => id), ["retirer"]);
    // Revenu de WAITING, il attend le chef : le renvoyer en cuisine d'abord, ou le retirer du rail.
    const revenu = gestes.gestesDeFiche({ ticket: 31, etat: "en attente", ouvrable: true, attendu: true, decision: { quoi: "repris", motif: null, cause: null, pr: null } });
    assert.deepEqual(revenu.map(({ id, recommande }) => (recommande ? `${id}*` : id)), ["cuisine*", "retirer"]);
  });
});

describe("sans station joignable, les trois gestes passent par GitHub seul", () => {
  test("chaque demande part à api.github.com, avec la session GitHub du chef — aucune autre adresse n'est demandée", async () => {
    const monde = github();
    const { gestes } = telephone(monde);
    assert.ok("repondue" in (await gestes.repondreCarte(PROJET, 40, clic(40, 1))));
    assert.ok("fait" in (await gestes.geste(PROJET, "cuisine", 31)));
    assert.ok("fait" in (await gestes.geste(PROJET, "retirer", 22)));
    assert.equal(monde.recues.length, 5);
    for (const { url, entetes } of monde.recues) {
      assert.ok(url.startsWith(API), `${url} is GitHub's API`);
      assert.deepEqual(entetes, url.includes("/comments") ? { ...ENTETES, "Content-Type": "application/json" } : ENTETES);
    }
  });

  test("merger la livraison se fait sur sa PR, comme du desktop : rien ne part", async () => {
    const monde = github();
    assert.deepEqual(await telephone(monde).gestes.geste(PROJET, "merger", 22), { refus: SANS_FAIT.merger, detail: "" });
    assert.deepEqual(monde.recues, []);
  });

  test("ce que le téléphone ne lit pas ne part pas : un ticket hors du dernier rail, une carte sans carte du chef, un projet inconnu", async () => {
    const monde = github();
    const { gestes, ecrits } = telephone(monde);
    assert.deepEqual(await gestes.geste(PROJET, "retirer", 99), { refus: "nothing was written: #99 is not on the latest rail read — read it again", detail: "" });
    assert.deepEqual(await gestes.geste("ailleurs", "cuisine", 31), { refus: "nothing was written: the rail of this project has not been read yet — read it again", detail: "" });
    assert.deepEqual(await gestes.repondreCarte(PROJET, 22, clic(40, 1)), { refus: SANS_FAIT.carte, detail: "" });
    assert.ok("refus" in (await gestes.attente(PROJET, "attente-poser", 22)));
    assert.deepEqual(monde.recues, []);
    assert.deepEqual(ecrits, []);
  });
});

describe("une écriture que GitHub ne prend pas se dit, et rien n'est montré fait", () => {
  const refuse = (quand: (recue: Recue) => boolean): Panne => (recue) => (quand(recue) ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined);

  test("reprendre ou mettre en suspens, refusé par GitHub : la ligne le dit, GitHub au survol, et le rail n'est pas relu", async () => {
    const { gestes, ecrits } = telephone(github(refuse(() => true)));
    const dit = await gestes.geste(PROJET, "retirer", 22);
    assert.ok("refus" in dit);
    assert.equal(dit.refus, "nothing was changed: GitHub did not remove `fire` from #22");
    assert.match(dit.detail, /403.*Resource not accessible by integration/);
    assert.ok("refus" in (await gestes.geste(PROJET, "cuisine", 31)));
    assert.deepEqual(ecrits, []);
  });

  test("GitHub injoignable : rien n'est changé, et le téléphone dit ce que le réseau a dit", async () => {
    const monde = github(() => "injoignable");
    const { gestes, ecrits } = telephone(monde);
    const dit = await gestes.geste(PROJET, "cuisine", 31);
    assert.deepEqual(dit, { refus: "nothing was changed: GitHub did not remove `waiting` from #31", detail: 'Unable to resolve host "api.github.com": No address associated with hostname' });
    const repondue = await gestes.repondreCarte(PROJET, 40, clic(40, 1));
    assert.ok("refus" in repondue);
    assert.equal(repondue.refus, "nothing was sent: your answer was not posted on #40");
    assert.deepEqual(monde.etat().issues[31]?.labels, ["fire", "waiting"]);
    assert.deepEqual(ecrits, []);
  });

  test("la réponse que GitHub ne prend pas : elle n'est pas dite répondue, et la carte reste dans TODO", async () => {
    const monde = github(refuse(({ methode }) => methode === "POST"));
    const { gestes, ecrits } = telephone(monde);
    const dit = await gestes.repondreCarte(PROJET, 40, clic(40, 1));
    assert.ok(!("repondue" in dit));
    assert.equal(dit.refus, "nothing was sent: your answer was not posted on #40");
    assert.match(dit.detail, /Resource not accessible by integration/);
    assert.deepEqual(resume(monde.recues), [`POST /repos/${DEPOT}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`]);
    assert.deepEqual(monde.etat().issues[40]?.labels, ["chef-todo", "fire", "hors-cuisine"]);
    assert.deepEqual(ecrits, []);
  });

  test("la réponse postée dont GitHub refuse le geste : dite à jouer sur GitHub, pas répondue", async () => {
    const monde = github(refuse(({ methode, url }) => methode === "DELETE" && url.endsWith("/labels/chef-todo")));
    const { gestes, ecrits } = telephone(monde);
    const dit = await gestes.repondreCarte(PROJET, 40, clic(40, 1));
    assert.ok(!("repondue" in dit));
    assert.equal(dit.refus, "your answer is posted on #40, but its gesture (resume) was not played — play it on GitHub");
    assert.deepEqual(ecrits, []);
  });
});

describe("dans la WebView", () => {
  // La WebView n'a rien de Node : le module, et tout ce qu'il importe, posé comme la construction de l'APK pose la lecture
  // du téléphone (packaging/android.ts, `poserLesModules`), se charge dans un Node privé de `process`.
  test("le module posé se charge sans rien de Node", (t) => {
    const www = mkdtempSync(join(tmpdir(), "gestes-github-telephone-"));
    t.after(() => rmSync(www, { recursive: true, force: true }));
    poserLesModules(www, APP, join(APP, "src", "gestes-github-telephone.ts"));
    const charge = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "gestes-github-telephone.js")).href], { encoding: "utf8" });
    assert.equal(charge.stdout.trim(), "ecritureParCapacitor ouvrirLesGestesGitHub", charge.stderr);
  });
});

// Le téléphone tel que l'APK le porte : la vue et le pont posés par la construction (packaging/android.ts, `poserLaVue`),
// le pont joué comme dans la WebView, et les modules qu'il charge à côté de la vue. Le coffre garde le jeton du chef
// (#2500) ; le HTTP natif de Capacitor est le faux GitHub de ce fichier. Le stockage garde aussi un appairage d'avant
// #2500, avec l'adresse de sa station : elle ne répond pas, et n'est jamais demandée.
const POSEE = mkdtempSync(join(tmpdir(), "gestes-github-telephone-apk-"));
after(() => rmSync(POSEE, { recursive: true, force: true }));
let posee: Promise<string> | undefined;
const laVuePosee = () =>
  (posee ??= demarrageDuPont().then((demarrage) => {
    poserLaVue(demarrage, join(POSEE, "www"));
    return join(POSEE, "www");
  }));
const STATION = "http://192.168.1.20:7010";
type AppelNatif = { plugin: string; methode: string; options: Record<string, unknown> };

// Le pont sur ce GitHub, une fois le rail et TODO de parade lus : la barre posée et « All projects » affiché, comme la vue
// les demande à l'ouverture.
async function pontDeLAPK(monde: ReturnType<typeof github>) {
  const natifs: AppelNatif[] = [];
  const stockage = new Map([["brigade.github", "chef"], ["brigade.telephone", JSON.stringify({ station: "atelier", adresse: STATION, jeton: "brgt_secret" })]]);
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(await laVuePosee(), "src", "vue", "index.html")).href },
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur), removeItem: (cle: string) => void stockage.delete(cle) },
    // La lecture suivante, dans trente secondes : jamais courue.
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        // Les options viennent du contexte du pont : gardées en JSON, comme elles passent au natif.
        const passees = JSON.parse(JSON.stringify(options)) as Record<string, unknown>;
        natifs.push({ plugin, methode, options: passees });
        if (plugin === "Coffre" && methode === "lire") return { valeur: JETON };
        if (plugin !== "CapacitorHttp" || methode !== "request") return assert.fail(`unexpected call: ${plugin}.${methode}`);
        return monde.capacitor(passees as DemandeNative);
      },
    },
  };
  vm.runInNewContext(readFileSync(join(await laVuePosee(), "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const pont = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const dessins: { projet?: string; tableau?: { rail: { attendLu?: string } } }[] = [];
  pont.surFaits!((recue: unknown) => void dessins.push(JSON.parse(JSON.stringify(recue))));
  let projets: unknown;
  pont.surConfiguration!((configuration: unknown) => void (projets = configuration));
  await pont.demarrage!();
  void pont.faits!(1);
  void pont.tous!(2);
  // La liste lue, la vue redemande la barre et l'écran : le rail et TODO de chacun se lisent.
  await jusqua(() => projets !== undefined);
  void pont.faits!(3);
  void pont.tous!(4);
  await jusqua(() => dessins.some(({ projet, tableau }) => projet === PROJET && tableau?.rail.attendLu !== undefined));
  await auRepos();
  return { pont, natifs, dessins };
}
// Attend un fait : le pont et le faux GitHub répondent sans horloge — il est là quand la file des promesses est vide.
async function jusqua(fait: () => boolean): Promise<void> {
  for (let tour = 0; tour < 500 && !fait(); tour++) await repos();
  assert.ok(fait(), "the fact never came");
}
const auRepos = async () => {
  for (let tour = 0; tour < 20; tour++) await repos();
};
// Ce que le téléphone lit de GitHub — les gists, le rail, TODO —, mis à part : il reste ce que le geste y a écrit, et ce
// qu'il a lu pour l'écrire.
const LECTURE = /^https:\/\/api\.github\.com\/(gists[/?]|repos\/[^/]+\/[^/]+\/(issues\?|pulls\?|issues\/\d+\/(comments|events)\?))/;
const duGeste = (recues: Recue[]) => recues.filter(({ methode, url }) => !(methode === "GET" && LECTURE.test(url)));
const json = (valeur: unknown) => JSON.parse(JSON.stringify(valeur));

// Le geste du desktop, puis le même par le pont de l'APK, chacun sur son GitHub neuf : ce que le pont y écrit est ce que
// le desktop y écrit — méthode, adresse, en-têtes, corps —, GitHub en garde le même état, la vue reçoit la même phrase.
async function parLePont<R>(duDesktop: (client: ReturnType<typeof desktop>) => Promise<R>, nom: string, ...args: unknown[]) {
  const auDesktop = github();
  const dit = await duDesktop(desktop(auDesktop));
  const auTelephone = github();
  const { pont, natifs } = await pontDeLAPK(auTelephone);
  const avant = auTelephone.recues.length;
  const ditAuTelephone = json(await pont[nom]!(...args));
  await auRepos();
  const ecrites = duGeste(auTelephone.recues.slice(avant));
  assert.deepEqual(ecrites, auDesktop.recues, "the phone's bridge sends GitHub the desktop's requests");
  assert.deepEqual(auTelephone.etat(), auDesktop.etat(), "GitHub ends up as the desktop's gesture leaves it");
  assert.deepEqual(ditAuTelephone, json(dit), "the phone says what the desktop says");
  // Aucune station : chaque appel du HTTP natif va à l'API de GitHub, avec le jeton du coffre.
  const http = natifs.filter(({ plugin }) => plugin === "CapacitorHttp");
  assert.deepEqual(http.filter(({ options }) => !String(options.url).startsWith(API)), []);
  assert.ok(http.every(({ options }) => (options.headers as Record<string, string>).Authorization === `Bearer ${JETON}`));
  assert.ok(!JSON.stringify(natifs).includes(STATION));
  // Une écriture que GitHub a prise relance la lecture : le rail relu la montre.
  const relues = auTelephone.recues.slice(avant).filter(({ methode, url }) => methode === "GET" && LECTURE.test(url));
  return { ecrites, dit: ditAuTelephone, relues };
}

describe("par le pont de l'APK, sans station, les gestes du chef s'écrivent sur GitHub comme du desktop", () => {
  test("répondre à une carte de TODO : la réponse postée sur l'issue, `hors-cuisine` et `chef-todo` retirés — puis GitHub relu", async () => {
    const { ecrites, dit, relues } = await parLePont((client) => repondreSurGithub({ depot: DEPOT, ticket: 40, chef: CHEFS.get(40), reponse: clic(40, 1), client }), "repondreCarte", PROJET, 40, clic(40, 1));
    assert.deepEqual(resume(ecrites), [
      `POST /repos/${DEPOT}/issues/40/comments {"body":"<!-- brigade:reponse gesture=resume -->\\nYes, keep it"}`,
      `DELETE /repos/${DEPOT}/issues/40/labels/hors-cuisine`,
      `DELETE /repos/${DEPOT}/issues/40/labels/chef-todo`,
    ]);
    assert.ok("repondue" in dit);
    assert.ok(relues.length > 0);
  });

  test("répondre à une carte de TODO par un merge : la PR lue, mergée, puis `chef-todo` retiré", async () => {
    const { ecrites } = await parLePont((client) => repondreSurGithub({ depot: DEPOT, ticket: 41, chef: CHEFS.get(41), reponse: clic(41, 1), client }), "repondreCarte", PROJET, 41, clic(41, 1));
    assert.deepEqual(resume(ecrites).map((ligne) => ligne.split(" {")[0]), [`GET /repos/${DEPOT}/pulls/1560`, `POST /repos/${DEPOT}/issues/41/comments`, `PUT /repos/${DEPOT}/pulls/1560/merge`, `DELETE /repos/${DEPOT}/issues/41/labels/chef-todo`]);
  });

  test("reprendre — « back to the kitchen » sur la fiche : `waiting` retiré", async () => {
    const { ecrites, dit } = await parLePont((client) => retirerLeLabel(LU, "cuisine", 31, client), "gesteDeFiche", PROJET, "cuisine", 31);
    assert.deepEqual(resume(ecrites), [`DELETE /repos/${DEPOT}/issues/31/labels/waiting`]);
    assert.ok("fait" in dit);
  });

  test("reprendre — « it arrived, back to the kitchen » sur une carte de WAITING : `waiting` retiré", async () => {
    const { ecrites } = await parLePont((client) => retirerLeLabel(LU, "cuisine", 31, client), "attente", PROJET, "attente-arrivee", 31);
    assert.deepEqual(resume(ecrites), [`DELETE /repos/${DEPOT}/issues/31/labels/waiting`]);
  });

  test("mettre en suspens — « remove from the rail » : `fire` retiré", async () => {
    const { ecrites, dit } = await parLePont((client) => retirerLeLabel(LU, "retirer", 22, client), "gesteDeFiche", PROJET, "retirer", 22);
    assert.deepEqual(resume(ecrites), [`DELETE /repos/${DEPOT}/issues/22/labels/fire`]);
    assert.ok("fait" in dit);
  });

  test("la fiche, sur le téléphone, propose les gestes qu'il écrit sur GitHub — plus ceux du guichet d'une station", async () => {
    const { pont } = await pontDeLAPK(github());
    assert.deepEqual(json(await pont.gestesDeFiche!({ ticket: 22, etat: "en attente", ouvrable: true, attendu: false })).map(({ id }: { id: string }) => id), ["retirer"]);
    assert.deepEqual(json(await pont.gesteDeFiche!(PROJET, "merger", 22)), { refus: SANS_FAIT.merger, detail: "" });
  });

  test("une écriture que GitHub refuse : le pont rend la phrase, GitHub au survol ; rien n'est relu, rien n'est montré fait", async () => {
    const monde = github((recue) => (recue.methode === "GET" ? undefined : { status: 403, data: { message: "Resource not accessible by integration" } }));
    const { pont } = await pontDeLAPK(monde);
    const avant = monde.recues.length;
    const dit = json(await pont.gesteDeFiche!(PROJET, "retirer", 22));
    assert.equal(dit.refus, "nothing was changed: GitHub did not remove `fire` from #22");
    assert.match(dit.detail, /403.*Resource not accessible by integration/);
    const repondue = json(await pont.repondreCarte!(PROJET, 40, clic(40, 1)));
    assert.ok(!("repondue" in repondue));
    assert.equal(repondue.refus, "nothing was sent: your answer was not posted on #40");
    await auRepos();
    assert.deepEqual(resume(monde.recues.slice(avant)).map((ligne) => ligne.split(" {")[0]), [`DELETE /repos/${DEPOT}/issues/22/labels/fire`, `POST /repos/${DEPOT}/issues/40/comments`]);
    assert.deepEqual(monde.etat().issues[22]?.labels, ["fire"]);
  });
});
