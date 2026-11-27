// La carte « Validate its screen » sur le téléphone (ticket 3185) : la WebView ne charge pas la commande du runtime, le
// téléphone écrit sur l'API de GitHub ce qu'elle écrit (`validerSurGithub`). Chaque geste est joué deux fois, sur deux
// copies du même faux GitHub, où le runtime a posé la carte comme la pass la pose (`retenirLeDesign`) : par la vraie
// commande du runtime (`principal`, comme le desktop la joue), puis par le téléphone, sur l'API ; ce que chaque GitHub en
// garde est comparé — la PR mergée ou non, les commentaires, les labels, la carte fermée ou non. Puis le pont de l'APK, tel
// que la construction le pose (www/android/pont.js), lit la carte sur ce faux GitHub, ses captures, et y joue les deux
// gestes. Aucun runtime ne tourne, aucun `gh` n'est lancé.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { DE_CONFIANCE as OF_TRUST_OF_RUNTIME } from "../../../runtime/src/alimenter.ts";
import { Sortie } from "../../../runtime/src/appel.ts";
import { brancheDuTicket as branchOfRuntime } from "../../../runtime/src/brigade-github.ts";
import { LABEL_IN_PASS as IN_PASS_OF_RUNTIME } from "../../../runtime/src/github-etat/etats.ts";
import { CHEF_TODO } from "../../../runtime/src/github-seul/carte-todo/carte-todo.ts";
import { MARQUE_DE_RENVOI as SEND_BACK_OF_RUNTIME } from "../../../runtime/src/qualite-github.ts";
import { principal } from "../../../runtime/src/validation-design/commande.ts";
import { retenirLeDesign } from "../../../runtime/src/validation-design/validation-design.ts";
import { demarrageDuPont, poserLaVue } from "../../packaging/android.ts";
import { readCaptureOnLAPI } from "../../src/captures.ts";
import { cardOfChefOfTodo } from "../../src/card-todo.ts";
import { writingParCapacitor, openTheActionsGitHub, type RequestNative, type AnswerNative } from "../../src/actions-github-phone.ts";
import { clientOfThePriority } from "../../src/priority.ts";
import { readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { LABEL_OF_CHEF } from "../../src/board/todo-github.ts";
import {
  branchOfTicket,
  OF_TRUST,
  UNKNOWN,
  playTheValidation,
  LABEL_IN_PASS,
  BRAND_OF_SEND_BACK,
  WITHOUT_CAPTURE,
  validateOnGithub,
  EMPTY,
  type ClientOfTheValidation,
  type RenderedOfValidation,
  type ValidationDesign,
} from "../../src/vue/validation-design/validation-design-github.ts";
import { repos } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/parade";
const PROJECT = "parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const TICKET = 58;
const PR = 60;
// La validation se demande sur le ticket même (ticket 3615) : la carte est le ticket.
const CARD = TICKET;
// La première issue neuve : un ticket de suite.
const TRACKING = 61;
const TOKEN = "gho_du_chef";
const API = "https://api.github.com";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type IssueFalse = { title: string; body: string; labels: Set<string>; state: "open" | "closed"; comments: Array<{ body: string; association: string }> };
type Written = { methode: string; chemin: string; corps?: unknown };
// Ce que GitHub rend à la place de sa réponse : une panne.
type Outage = (request: Written) => AnswerGitHub | undefined;

// Un faux GitHub qui tient le ticket #58, sa PR #60 verte sur la branche du ticket, et ce qu'on y écrit — par l'interface
// du runtime (`github`) comme par son API (`api`), sur le même état.
function fakeGitHub(outage: Outage = () => undefined) {
  const issues = new Map<number, IssueFalse>([[TICKET, { title: "Export the journal as CSV", body: "", labels: new Set(["fire", "in-pass"]), state: "open", comments: [] }]]);
  let nextOne = TRACKING;
  // Les commentaires de la PR : la copie de la validation demandée sur le ticket.
  const onThePR: IssueFalse["comments"] = [];
  const pr = { number: PR, url: `https://github.com/${REPOSITORY}/pull/${PR}`, base: "main", sha: SHA, state: "open" as "open" | "closed", merged: false, enRetard: false, mergeePar: null, ref: `cook/${TICKET}-github` };
  const merges: Array<[number, string]> = [];
  const refusal = { merge: null as null | { status: number; message: string } };
  const writtenEntries: Written[] = [];
  const itsOwnOne = (number: number) => issues.get(number) ?? assert.fail(`pas d'issue #${number}`);
  const merger = (number: number, sha: string): { fait: true } | { fait: false; motif: string; status: number } => {
    if (refusal.merge !== null) return { fait: false, motif: `HTTP ${refusal.merge.status} — ${refusal.merge.message}`, status: refusal.merge.status };
    if (sha !== pr.sha) return { fait: false, motif: "HTTP 409 — Head branch was modified", status: 409 };
    merges.push([number, sha]);
    pr.state = "closed";
    pr.merged = true;
    return { fait: true };
  };
  const github = {
    creerIssue: async ({ titre: title, corps: bodyText, labels }: { titre: string; corps: string; labels: string[] }) => {
      const number = nextOne++;
      issues.set(number, { title: title, body: bodyText, labels: new Set(labels), state: "open", comments: [] });
      return number;
    },
    commenter: async (number: number, bodyText: string) => void (number === PR ? onThePR : itsOwnOne(number).comments).push({ body: bodyText, association: "OWNER" }),
    labelliser: async (number: number, labels: string[]) => labels.forEach((label) => itsOwnOne(number).labels.add(label)),
    delabelliser: async (number: number, label: string) => void itsOwnOne(number).labels.delete(label),
    fermerIssue: async (number: number) => void (itsOwnOne(number).state = "closed"),
    // La PR n'a d'autre commentaire que la copie de la validation : son cook n'a rien dit de l'écran (ticket 3330).
    commentaires: async (number: number) => (number === PR ? onThePR : itsOwnOne(number).comments),
    issue: async (number: number) => {
      const readEntry = issues.get(number);
      return readEntry === undefined ? null : { number: number, title: readEntry.title, labels: [...readEntry.labels], state: readEntry.state, createdAt: "2026-11-11T12:00:00Z", updatedAt: "2026-11-11T12:00:00Z", url: `https://github.com/${REPOSITORY}/issues/${number}` };
    },
    ouvertes: async () => ({
      inchange: false as const,
      issues: [...issues].filter(([, { state }]) => state === "open").map(([number, { title, body, labels }]) => ({ number, title, labels: [...labels], body, association: "OWNER" })),
      confirmer: () => {},
    }),
    prDeBranche: async (branch: string) => (branch === pr.ref ? { number: pr.number, url: pr.url, base: pr.base, sha: pr.sha, state: pr.state, merged: pr.merged, enRetard: false, mergeePar: null } : null),
    merger: async (number: number, sha: string) => {
      const done = merger(number, sha);
      return done.fait ? done : { fait: false as const, motif: done.motif };
    },
    fermer: () => {},
  };
  // L'API de GitHub, comme le téléphone la demande : `chemin` sans l'hôte.
  function api(methode: string, path: string, bodyText?: unknown): AnswerGitHub {
    const [route = "", request = ""] = path.split("?");
    const parameters = new URLSearchParams(request);
    if (methode !== "GET") writtenEntries.push({ methode, chemin: path, ...(bodyText === undefined ? {} : { corps: bodyText }) });
    const enOutage = outage({ methode, chemin: path, ...(bodyText === undefined ? {} : { corps: bodyText }) });
    if (enOutage !== undefined) return enOutage;
    const page = Number(parameters.get("page") ?? "1");
    const here = route.startsWith(`/repos/${REPOSITORY}`) ? route.slice(`/repos/${REPOSITORY}`.length) : null;
    if (methode === "GET" && here === "/issues") {
      const label = parameters.get("labels");
      const data = page > 1 ? [] : [...issues].filter(([, { state, labels }]) => state === "open" && (label === null || labels.has(label))).map(([number, { title, body, labels }]) => ({ number, title, body, labels: [...labels].map((name) => ({ name })), html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-11T12:00:00Z", author_association: "OWNER" }));
      return { status: 200, data };
    }
    if (methode === "POST" && here === "/issues") {
      const { title, body } = bodyText as { title: string; body: string };
      const number = nextOne++;
      issues.set(number, { title, body, labels: new Set(), state: "open", comments: [] });
      return { status: 201, data: { number: number } };
    }
    const issue = /^\/issues\/(\d+)(.*)$/.exec(here ?? "");
    if (issue !== null) {
      const number = Number(issue[1]);
      const readEntry = issues.get(number);
      const remains = issue[2] ?? "";
      if (readEntry === undefined) return { status: 404, data: { message: "Not Found" } };
      if (methode === "GET" && remains === "") return { status: 200, data: { number: number, title: readEntry.title, body: readEntry.body, state: readEntry.state, author_association: "OWNER", labels: [...readEntry.labels].map((name) => ({ name })) } };
      if (methode === "GET" && remains === "/comments") return { status: 200, data: page > 1 ? [] : readEntry.comments.map(({ body, association }, rank) => ({ id: number * 100 + rank, body, author_association: association, created_at: "2026-11-11T12:00:00Z" })) };
      if (methode === "GET" && remains === "/events") return { status: 200, data: [] };
      if (methode === "POST" && remains === "/comments") {
        readEntry.comments.push({ body: (bodyText as { body: string }).body, association: "OWNER" });
        return { status: 201, data: { id: 900 + readEntry.comments.length } };
      }
      const label = /^\/labels\/(.+)$/.exec(remains)?.[1];
      if (methode === "DELETE" && label !== undefined) return readEntry.labels.delete(decodeURIComponent(label)) ? { status: 200, data: [] } : { status: 404, data: { message: "Label does not exist" } };
      if (methode === "PATCH" && remains === "") {
        readEntry.state = (bodyText as { state: "closed" }).state;
        return { status: 200, data: {} };
      }
    }
    if (methode === "GET" && here === `/pulls/${PR}`) return { status: 200, data: { number: PR, state: pr.state, merged: pr.merged, merged_at: pr.merged ? "2026-11-11T12:30:00Z" : null, head: { ref: pr.ref, sha: pr.sha } } };
    if (methode === "PUT" && here === `/pulls/${PR}/merge`) {
      const done = merger(PR, (bodyText as { sha: string }).sha);
      return done.fait ? { status: 200, data: { merged: true } } : { status: done.status, data: { message: done.motif.replace(/^HTTP \d+ — /, "") } };
    }
    const content = /^\/contents\/(.+)$/.exec(here ?? "")?.[1];
    if (methode === "GET" && content !== undefined) return parameters.get("ref") === SHA && content.startsWith(`docs/captures/${TICKET}/`) ? { status: 200, data: { content: `${PNG.slice(0, 40)}\n${PNG.slice(40)}`, encoding: "base64" } } : { status: 404, data: { message: "Not Found" } };
    // Toute autre liste est vide, tout autre objet absent : ce que le téléphone lit d'autre de parade n'a rien.
    return methode === "GET" && here !== null && !/\/\d+$/.test(here) && !here.startsWith("/contents/") ? { status: 200, data: [] } : { status: 404, data: { message: "Not Found" } };
  }
  const call: CallGitHub = async (path) => api("GET", path);
  const client: ClientOfTheValidation = { lire: call, ecrire: async (methode, path, bodyText) => api(methode, path, bodyText) };
  // Ce que GitHub garde de la carte et de son ticket.
  const state = () => ({ issues: Object.fromEntries([...issues].map(([number, { labels, state, comments }]) => [number, { labels: [...labels].sort(), state, comments: comments.map(({ body }) => body) }])), merges: [...merges], pr: { state: pr.state, merged: pr.merged } });
  return { github, api, appeler: call, client, issues, pr, merges, refus: refusal, ecrites: writtenEntries, etat: state };
}
type World = ReturnType<typeof fakeGitHub>;

// La carte posée par le runtime, comme la pass la pose sur une livraison design verte qui porte ses captures : sur le ticket.
async function cardOfTrial(outage?: Outage): Promise<World> {
  const world = fakeGitHub(outage);
  const motive = await retenirLeDesign(world.github, {
    depot: REPOSITORY,
    station: "box/claude",
    ticket: { number: TICKET, title: "Export the journal as CSV", labels: ["fire"] },
    pr: { number: PR, sha: SHA },
    fichiers: ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`],
    renvoyer: async () => assert.fail("une livraison qui porte ses captures n'est pas renvoyée"),
    jugerLeChoix: async () => ({ choix: "the layout of the rail" }),
  });
  assert.match(motive ?? "", /asked on #58/);
  assert.equal(world.issues.size, 1, "no issue apart");
  return world;
}

// Ce que la dernière lecture de l'app porte de la carte.
async function designRead(world: World): Promise<ValidationDesign> {
  const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: world.appeler });
  assert.equal(wait.lue, true);
  const [card] = wait.lue ? wait.attentes : [];
  return card?.chef?.design ?? assert.fail("la carte ne dit pas ce qu'elle valide");
}

const isOneOutput = (error: unknown): error is Sortie => error instanceof Sortie;
const parTheRuntime = async (world: World, design: ValidationDesign, action: unknown) => playTheValidation({ depot: REPOSITORY, design, geste: action, env: {}, commande: async () => ({ principal: (call) => principal(call, () => world.github as never), estUneSortie: isOneOutput }) });
const parThePhone = async (world: World, design: ValidationDesign, action: unknown) => validateOnGithub({ depot: REPOSITORY, carte: CARD, design, geste: action, client: world.client });

// Le même geste, par la commande du runtime puis par le téléphone, chacun sur son GitHub où la carte vient d'être posée —
// `avant` le prépare de la même façon sur les deux : GitHub en garde le même état.
async function twoTimes(action: unknown, before: (world: World) => void | Promise<void> = () => undefined): Promise<{ runtime: RenderedOfValidation; telephone: RenderedOfValidation; monde: World }> {
  const atRuntime = await cardOfTrial();
  const designOfRuntime = await designRead(atRuntime);
  await before(atRuntime);
  const runtime = await parTheRuntime(atRuntime, designOfRuntime, action);
  const world = await cardOfTrial();
  const design = await designRead(world);
  await before(world);
  const phone = await parThePhone(world, design, action);
  assert.deepEqual(world.etat(), atRuntime.etat(), "GitHub ends up as the runtime's command leaves it");
  return { runtime, telephone: phone, monde: world };
}
const SEND_BACK = { geste: "renvoyer", commentaire: "  The export button is cut off.\r\nKeep it on one line.  " };

describe("sur le téléphone, les deux gestes écrivent sur GitHub ce que la commande du runtime y écrit", () => {
  test("« Validate » : la PR mergée à la tête jugée verte, la carte fermée — elle quitte TODO", async () => {
    const { runtime, telephone: phone, monde: world } = await twoTimes({ geste: "valider" });
    assert.deepEqual(phone, runtime);
    assert.deepEqual(phone, { fait: `${REPOSITORY}: the delivery of #${TICKET} (PR ${PR}) validated: merged, card #${CARD} closed — ticket #${TICKET} is served` });
    assert.deepEqual(world.merges, [[PR, SHA]]);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
    const wait = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: world.appeler });
    assert.deepEqual(wait.lue ? wait.attentes : assert.fail("TODO illisible"), [], "la carte a quitté TODO");
  });

  test("« Send back to the kitchen » : le commentaire posté sur le ticket comme ce qu'il faut changer, `in-pass` retiré, rien de mergé, la carte fermée", async () => {
    const { runtime, telephone: phone, monde: world } = await twoTimes(SEND_BACK);
    assert.deepEqual(phone, runtime);
    assert.match("fait" in phone ? phone.fait : assert.fail(JSON.stringify(phone)), /sent back: #58 goes back to a cook with your comment, card #58 closed/);
    assert.deepEqual(world.merges, []);
    assert.ok(world.issues.get(TICKET)?.comments.some(({ body }) => body.startsWith(`${BRAND_OF_SEND_BACK} n=1 sha=${SHA} -->`) && body.includes("The export button is cut off.\nKeep it on one line.")));
    assert.equal(world.issues.get(TICKET)?.labels.has(LABEL_IN_PASS), false);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });

  test("la branche mise à jour depuis sa base depuis la carte (ticket 3332) : rien n'est mergé tout de suite, la validation est gardée sur le ticket, la carte se ferme et le dit", async () => {
    const { runtime, telephone: phone, monde: world } = await twoTimes({ geste: "valider" }, (world) => void (world.pr.sha = "b".repeat(40)));
    assert.deepEqual(phone, runtime);
    assert.deepEqual(phone, { fait: `${REPOSITORY}: the delivery of #${TICKET} (PR ${PR}) validated: your validation is kept, card #${CARD} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green` });
    assert.deepEqual(world.merges, []);
    assert.ok(world.issues.get(TICKET)?.comments.some(({ body }) => body.startsWith(`<!-- brigade:validation-design-validee carte=${CARD} pr=${PR} sha=${SHA} -->\nValidated by the chef on card #${CARD} — merge pending.`)));
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });

  test("la livraison est repartie en cuisine depuis la carte : rien n'est mergé, la carte se ferme", async () => {
    const sendBack = (world: World) => void world.issues.get(TICKET)?.comments.push({ body: `${BRAND_OF_SEND_BACK} n=1 sha=${SHA} -->\nThe CI went red.`, association: "OWNER" });
    const { telephone: phone, monde: world } = await twoTimes({ geste: "valider" }, sendBack);
    assert.match("refus" in phone ? phone.refus : assert.fail("validée"), /the delivery of #58 \(PR 60\) went back to a cook since card #58: nothing merged, card #58 closed/);
    assert.deepEqual(world.merges, []);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });

  test("la PR fermée sans merge : rien à valider ni à renvoyer", async () => {
    const closedOne = (world: World) => void (world.pr.state = "closed");
    const validate = await twoTimes({ geste: "valider" }, closedOne);
    assert.match("refus" in validate.telephone ? validate.telephone.refus : "", /^nothing was done: the delivery of #58 \(PR 60\) is closed without being merged/);
    const sendBack = await twoTimes(SEND_BACK, closedOne);
    assert.match("refus" in sendBack.telephone ? sendBack.telephone.refus : "", /^nothing was done: the delivery of #58 \(PR 60\) is no longer open: there is nothing to send back/);
  });

  test("la PR déjà mergée : « Validate » ferme la carte, sans merger une seconde fois", async () => {
    const { telephone: phone, monde: world } = await twoTimes({ geste: "valider" }, (world) => void Object.assign(world.pr, { state: "closed", merged: true }));
    assert.ok("fait" in phone);
    assert.deepEqual(world.merges, []);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });

  test("la PR déjà mergée : « Send back » ouvre un ticket de suite avec le commentaire du chef et ferme la carte, au lieu d'échouer", async () => {
    const { runtime, telephone: phone, monde: world } = await twoTimes(SEND_BACK, (world) => void Object.assign(world.pr, { state: "closed", merged: true }));
    assert.deepEqual(phone, runtime);
    assert.match("fait" in phone ? phone.fait : assert.fail("renvoyée"), /was already merged: your comment is the follow-up ticket #61, card #58 closed/);
    assert.match(world.issues.get(TRACKING)?.body ?? "", /The export button is cut off\./);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
    assert.equal(world.issues.get(TICKET)?.comments.length, 1, "le ticket ne reçoit aucun renvoi : sa livraison est mergée");
  });

  test("un merge que GitHub refuse : la carte reste ouverte, et dit ce que GitHub a répondu", async () => {
    const { telephone: phone, monde: world } = await twoTimes({ geste: "valider" }, (world) => void (world.refus.merge = { status: 405, message: "Required status check is expected" }));
    assert.equal("refus" in phone && phone.refus, "nothing was done: GitHub refused to merge the delivery of #58 (PR 60) — HTTP 405 — Required status check is expected; card #58 stays open");
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), true);
  });

  test("une carte fermée ailleurs depuis la lecture : rien ne part", async () => {
    const { runtime, telephone: phone, monde: world } = await twoTimes({ geste: "valider" }, (world) => void ((world.issues.get(CARD) ?? assert.fail("pas de carte")).state = "closed"));
    assert.deepEqual(phone, { refus: "refus" in runtime ? runtime.refus : assert.fail("le runtime a validé"), detail: "" });
    assert.equal("refus" in phone && phone.refus, "nothing was done: no open “Validate its screen” card answers to 60: it is neither an open ticket nor the pull request of a held delivery");
    assert.deepEqual(world.ecrites, []);
  });
});

describe("ce que le téléphone ne tient pas pour fait", () => {
  test("un renvoi sans commentaire, ou une carte que la lecture ne porte pas : rien ne part", async () => {
    const world = await cardOfTrial();
    const design = await designRead(world);
    assert.deepEqual(await parThePhone(world, design, { geste: "renvoyer", commentaire: " \n " }), { refus: EMPTY, detail: "" });
    assert.deepEqual(await validateOnGithub({ depot: REPOSITORY, carte: CARD, design: undefined, geste: { geste: "valider" }, client: world.client }), { refus: UNKNOWN, detail: "" });
    assert.deepEqual(await validateOnGithub({ depot: REPOSITORY, carte: "58", design, geste: { geste: "valider" }, client: world.client }), { refus: UNKNOWN, detail: "" });
    assert.deepEqual(world.ecrites, []);
  });

  test("GitHub refuse la session du téléphone dès la première lecture : rien n'est fait, et le survol dit de se reconnecter", async () => {
    const world = await cardOfTrial((request) => (request.chemin === `/repos/${REPOSITORY}/issues/${CARD}` ? { status: 401, data: { message: "Bad credentials" } } : undefined));
    const design = await designRead(world);
    const rendered = await parThePhone(world, design, { geste: "valider" });
    assert.equal("refus" in rendered && rendered.refus, "nothing was done: GitHub did not take the gesture");
    assert.match("refus" in rendered ? rendered.detail : "", /HTTP 401.*sign in to GitHub again/);
    assert.deepEqual(world.merges, []);
  });

  test("GitHub refuse une écriture après d'autres : le geste dit ce qui est déjà écrit, et se rejoue", async () => {
    let enOutage = true;
    const world = await cardOfTrial((request) => (enOutage && request.methode === "DELETE" && request.chemin.endsWith("/labels/in-pass") ? { status: 502, data: { message: "Server Error" } } : undefined));
    const design = await designRead(world);
    const rendered = await parThePhone(world, design, SEND_BACK);
    assert.equal("refus" in rendered && rendered.refus, "GitHub stopped the gesture midway — already written: a comment on #58; play it again");
    assert.match("refus" in rendered ? rendered.detail : "", /HTTP 502/);
    assert.equal(world.issues.get(CARD)?.state, "open", "la carte reste dans TODO");
    enOutage = false;
    assert.ok("fait" in (await parThePhone(world, design, SEND_BACK)));
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });

  test("ce que GitHub refuse sur la PR dit la livraison par son ticket, jamais « PR #<pr> » (ticket 3716)", async () => {
    const reading = await cardOfTrial((request) => (request.methode === "GET" && request.chemin === `/repos/${REPOSITORY}/pulls/${PR}` ? { status: 500, data: { message: "Server Error" } } : undefined));
    const readEntry = await parThePhone(reading, await designRead(reading), { geste: "valider" });
    assert.match("refus" in readEntry ? readEntry.detail : assert.fail("validée"), /^GitHub refused the reading of the delivery of #58 \(PR 60\) \(HTTP 500\)/);

    const merge = await cardOfTrial((request) => (request.methode === "PUT" ? { status: 502, data: { message: "Bad Gateway" } } : undefined));
    const mergee = await parThePhone(merge, await designRead(merge), { geste: "valider" });
    assert.match("refus" in mergee ? mergee.detail : assert.fail("validée"), /^GitHub refused the merge of the delivery of #58 \(PR 60\) \(HTTP 502\)/);

    const closing = await cardOfTrial((request) => (request.methode === "DELETE" ? { status: 502, data: { message: "Bad Gateway" } } : undefined));
    const closedOne = await parThePhone(closing, await designRead(closing), { geste: "valider" });
    assert.equal("refus" in closedOne && closedOne.refus, "GitHub stopped the gesture midway — already written: the delivery of #58 (PR 60) merged; play it again");
  });

  test("ce que le téléphone écrit et lit est ce que le runtime écrit et lit", () => {
    assert.deepEqual(OF_TRUST, OF_TRUST_OF_RUNTIME);
    assert.equal(BRAND_OF_SEND_BACK, SEND_BACK_OF_RUNTIME);
    assert.equal(LABEL_IN_PASS, IN_PASS_OF_RUNTIME);
    assert.equal(LABEL_OF_CHEF, CHEF_TODO);
    assert.equal(branchOfTicket(TICKET), branchOfRuntime(TICKET));
  });
});

describe("les gestes du téléphone et ses captures", () => {
  // Les gestes du téléphone (actions-github-phone.ts) sur ce GitHub, portés par un faux HTTP natif de Capacitor.
  const capacitor = (world: World) => async (request: RequestNative): Promise<AnswerNative> => {
    assert.equal(request.headers.Authorization, `Bearer ${TOKEN}`);
    return world.api(request.method, request.url.slice(API.length), request.data);
  };
  const actions = (world: World, design: ValidationDesign | undefined, writtenOnes: string[] = []) =>
    openTheActionsGitHub({
      jeton: async () => TOKEN,
      appeler: world.appeler,
      envoyer: writingParCapacitor(capacitor(world)),
      depot: (project) => (project === PROJECT ? REPOSITORY : undefined),
      dernier: () => undefined,
      chef: (project, ticket) => (project === PROJECT && ticket === CARD && design !== undefined ? { sorte: "design-validation", texte: "", design } : undefined),
      ecrit: (project) => void writtenOnes.push(project),
    });

  test("`gesteDeValidation` joue le geste sur la carte que la dernière lecture porte, et relance la lecture", async () => {
    const world = await cardOfTrial();
    const writtenOnes: string[] = [];
    const rendered = await actions(world, await designRead(world), writtenOnes).gesteDeValidation(PROJECT, CARD, { geste: "valider" });
    assert.ok("fait" in rendered);
    assert.deepEqual(world.merges, [[PR, SHA]]);
    assert.deepEqual(writtenOnes, [PROJECT]);
  });

  test("un projet dont le dépôt n'est pas lu, ou une carte inconnue : rien ne part, rien n'est relu", async () => {
    const world = await cardOfTrial();
    const writtenOnes: string[] = [];
    const readOnes = actions(world, await designRead(world), writtenOnes);
    const withoutRepository = await readOnes.gesteDeValidation("cantine", CARD, { geste: "valider" });
    assert.match("refus" in withoutRepository ? withoutRepository.refus : assert.fail("validée"), /^nothing was sent: this phone has not read which repository cantine is/);
    assert.deepEqual(await readOnes.gesteDeValidation(PROJECT, 40, { geste: "valider" }), { refus: UNKNOWN, detail: "" });
    assert.deepEqual(world.ecrites, []);
    assert.deepEqual(writtenOnes, []);
  });

  test("une capture se lit sur l'API de GitHub au commit de la carte ; une qui ne se lit pas le dit", async () => {
    const world = await cardOfTrial();
    const design = await designRead(world);
    const before = design.captures.ecrans[0]?.avant ?? assert.fail("pas de capture avant");
    assert.deepEqual(await readCaptureOnLAPI(world.appeler, before), { image: `data:image/png;base64,${PNG}` });
    const elsewhere = before.replace(SHA, "a".repeat(40));
    assert.match(JSON.stringify(await readCaptureOnLAPI(world.appeler, elsewhere)), /"sans":"GitHub refused the reading of this screenshot \(HTTP 404\)/);
    assert.deepEqual(await readCaptureOnLAPI(async () => ({ status: 200, data: { content: "", encoding: "none" } }), before), { sans: `GET /repos/${REPOSITORY}/contents/docs/captures/58/rail-avant.png?ref=${SHA} — its answer is not the file's content`, lien: `https://github.com/${REPOSITORY}/blob/${SHA}/docs/captures/58/rail-avant.png` });
    const BLOB = "c".repeat(40);
    const big = async (path: string) => (path.includes("/git/blobs/") ? { status: 200, data: { content: PNG } } : { status: 200, data: { content: "", sha: BLOB } });
    assert.deepEqual(await readCaptureOnLAPI(big, before), { image: `data:image/png;base64,${PNG}` });
    const limit = async (path: string) => (path.includes("/git/blobs/") ? { status: 403, data: { message: "API rate limit exceeded" } } : { status: 200, data: { content: "", sha: BLOB } });
    const refuses = await readCaptureOnLAPI(limit, before);
    assert.ok("sans" in refuses && /HTTP 403.*rate limit/.test(refuses.sans) && refuses.lien !== undefined);
    assert.match(JSON.stringify(await readCaptureOnLAPI(async () => Promise.reject(new Error("Unable to resolve host")), before)), /GitHub did not answer for this screenshot: Unable to resolve host/);
    assert.match(JSON.stringify(await readCaptureOnLAPI(world.appeler, "https://example.com/x.png")), /is not a file on GitHub/);
  });

  test("une carte dont le corps ne montre aucune capture le dit en une ligne, ce que l'app y cherche au survol", async () => {
    const world = await cardOfTrial();
    const card = world.issues.get(CARD) ?? assert.fail("pas de carte");
    for (const comment of card.comments) comment.body = comment.body.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    const design = await designRead(world);
    const todo = cardOfChefOfTodo({ sorte: "design-validation", texte: "Does the screen of #58 look right?", design }) ?? assert.fail("pas de carte de TODO");
    assert.deepEqual(todo.captures?.ecrans, []);
    assert.equal(todo.captures?.incomplete?.ligne, WITHOUT_CAPTURE);
    assert.match(todo.captures?.incomplete?.detail ?? "", /docs\/captures\/58\/ on the project's repository at `3f9c2a1`/);
  });
});

// Le téléphone tel que l'APK le porte : la vue et le pont posés par la construction (packaging/android.ts, `poserLaVue`),
// le pont joué comme dans la WebView, connecté à GitHub (le jeton du coffre) ; le HTTP natif de Capacitor est ce faux
// GitHub, où le gist d'une station dit les projets du chef.
const SET = mkdtempSync(join(tmpdir(), "validation-design-apk-"));
after(() => rmSync(SET, { recursive: true, force: true }));
let setOne: Promise<string> | undefined;
const theVueSet = () =>
  (setOne ??= demarrageDuPont().then((startup) => {
    poserLaVue(startup, join(SET, "www"));
    return join(SET, "www");
  }));
const PROJECTS_OF_GIST = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: PROJECT, depot: REPOSITORY, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null }] });
async function until(done: () => boolean): Promise<void> {
  for (let tour = 0; tour < 500 && !done(); tour++) await repos();
  assert.ok(done(), "the fact never came");
}

async function bridgeOfLAPK(world: World) {
  const native: string[] = [];
  const storage = new Map([["brigade.github", "chef"]]);
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(await theVueSet(), "src", "vue", "index.html")).href },
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value), removeItem: (key: string) => void storage.delete(key) },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        const past = JSON.parse(JSON.stringify(options)) as { url: string; method: string; headers: Record<string, string>; data?: unknown; id?: number };
        native.push(`${plugin}.${methode}${plugin === "Pont" && methode === "retirer" ? ` ${past.id}` : ""}`);
        if (plugin === "Coffre" && methode === "lire") return { valeur: TOKEN };
        // La notification de la carte, montrée par le sondage d'Android.
        if (plugin === "Pont") return methode === "gardees" ? { valeur: JSON.stringify({ [`${REPOSITORY}#${CARD}`]: { id: 7, projet: PROJECT, depot: REPOSITORY, ticket: CARD, question: "Does the screen of #58 look right?" } }) } : {};
        if (plugin !== "CapacitorHttp" || methode !== "request") return assert.fail(`unexpected call: ${plugin}.${methode}`);
        assert.equal(past.headers.Authorization, `Bearer ${TOKEN}`);
        // La trace de ce téléphone, déjà posée (#3303, phone-connected.ts) : la lecture n'écrit rien d'autre que le geste.
        if (past.url.startsWith(`${API}/gists?`)) return { status: 200, data: /[?&]page=1(&|$)/.test(past.url) ? [{ id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json" } } }, { id: "t1", files: { "brigade-telephone.json": { filename: "brigade-telephone.json" } } }] : [], headers: {} };
        if (past.url === `${API}/gists/g1`) return { status: 200, data: { id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json", content: PROJECTS_OF_GIST } } }, headers: {} };
        if (past.url === `${API}/repos/${REPOSITORY}`) return { status: 200, data: { full_name: REPOSITORY, owner: { login: "chef" }, permissions: { push: true } }, headers: {} };
        if (past.url === `${API}/user`) return { status: 200, data: { login: "chef" }, headers: {} };
        return { ...world.api(past.method, past.url.slice(API.length), past.data), headers: { "content-type": "application/json; charset=utf-8" } };
      },
    },
  };
  vm.runInNewContext(readFileSync(join(await theVueSet(), "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const bridge = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const drawings: Array<{ projet?: string; tableau?: { rail?: { attendLu?: string } } }> = [];
  bridge.surFaits!((receivedOne: unknown) => void drawings.push(JSON.parse(JSON.stringify(receivedOne))));
  let projects: unknown;
  bridge.surConfiguration!((configuration: unknown) => void (projects = configuration));
  await bridge.demarrage!();
  void bridge.faits!(1);
  void bridge.tous!(2);
  await until(() => projects !== undefined);
  void bridge.faits!(3);
  void bridge.tous!(4);
  await until(() => drawings.some(({ projet: project, tableau: board }) => project === PROJECT && board?.rail?.attendLu !== undefined));
  return { pont: bridge, natifs: native };
}

describe("par le pont de l'APK, sans station ni runtime", () => {
  test("la carte se lit, ses captures aussi ; « Validate » merge la PR, ferme la carte et retire sa notification", async () => {
    const world = await cardOfTrial();
    const { pont: bridge, natifs: native } = await bridgeOfLAPK(world);
    assert.deepEqual(await bridge.lireCapture!(PROJECT, CARD, "rail", "apres"), { image: `data:image/png;base64,${PNG}` });
    const rendered = JSON.parse(JSON.stringify(await bridge.gesteDeValidation!(PROJECT, CARD, { geste: "valider" })));
    assert.deepEqual(rendered, { fait: `${REPOSITORY}: the delivery of #${TICKET} (PR ${PR}) validated: merged, card #${CARD} closed — ticket #${TICKET} is served` });
    assert.deepEqual(world.merges, [[PR, SHA]]);
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
    await until(() => native.includes("Pont.retirer 7"));
  });

  test("« Send back to the kitchen » : le commentaire part sur le ticket, la carte se ferme", async () => {
    const world = await cardOfTrial();
    const { pont: bridge } = await bridgeOfLAPK(world);
    const rendered = JSON.parse(JSON.stringify(await bridge.gesteDeValidation!(PROJECT, CARD, { geste: "renvoyer", commentaire: "Keep the label on one line." })));
    assert.match(rendered.fait, /sent back: #58 goes back to a cook with your comment, card #58 closed/);
    assert.ok(world.issues.get(TICKET)?.comments.some(({ body }) => body.includes("Keep the label on one line.")));
    assert.equal(world.issues.get(CARD)?.labels.has(LABEL_OF_CHEF), false);
  });
});
