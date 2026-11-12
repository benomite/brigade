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
import { DE_CONFIANCE as DE_CONFIANCE_DU_RUNTIME } from "../../../runtime/src/alimenter.ts";
import { Sortie } from "../../../runtime/src/appel.ts";
import { brancheDuTicket as brancheDuRuntime } from "../../../runtime/src/brigade-github.ts";
import { LABEL_IN_PASS as IN_PASS_DU_RUNTIME } from "../../../runtime/src/github-etat/etats.ts";
import { CHEF_TODO } from "../../../runtime/src/github-seul/carte-todo/carte-todo.ts";
import { MARQUE_DE_RENVOI as RENVOI_DU_RUNTIME } from "../../../runtime/src/qualite-github.ts";
import { principal } from "../../../runtime/src/validation-design/commande.ts";
import { retenirLeDesign } from "../../../runtime/src/validation-design/validation-design.ts";
import { demarrageDuPont, poserLaVue } from "../../packaging/android.ts";
import { lireCaptureSurLAPI } from "../../src/captures.ts";
import { carteDuChefDeTodo } from "../../src/carte-todo.ts";
import { ecritureParCapacitor, ouvrirLesGestesGitHub, type DemandeNative, type ReponseNative } from "../../src/gestes-github-telephone.ts";
import { clientDeLaPriorite } from "../../src/priorite.ts";
import { lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { LABEL_DU_CHEF } from "../../src/tableau/todo-github.ts";
import {
  brancheDuTicket,
  DE_CONFIANCE,
  INCONNUE,
  jouerLaValidation,
  LABEL_IN_PASS,
  MARQUE_DE_RENVOI,
  SANS_CAPTURE,
  validerSurGithub,
  VIDE,
  type ClientDeLaValidation,
  type RenduDeValidation,
  type ValidationDesign,
} from "../../src/vue/validation-design/validation-design-github.ts";
import { repos } from "../aides/fausse-vue.ts";

const DEPOT = "chef/parade";
const PROJET = "parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const TICKET = 58;
const PR = 60;
const CARTE = 61;
const JETON = "gho_du_chef";
const API = "https://api.github.com";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type IssueFausse = { title: string; body: string; labels: Set<string>; state: "open" | "closed"; comments: Array<{ body: string; association: string }> };
type Ecrite = { methode: string; chemin: string; corps?: unknown };
// Ce que GitHub rend à la place de sa réponse : une panne.
type Panne = (demande: Ecrite) => ReponseGitHub | undefined;

// Un faux GitHub qui tient le ticket #58, sa PR #60 verte sur la branche du ticket, et ce qu'on y écrit — par l'interface
// du runtime (`github`) comme par son API (`api`), sur le même état.
function fauxGitHub(panne: Panne = () => undefined) {
  const issues = new Map<number, IssueFausse>([[TICKET, { title: "Export the journal as CSV", body: "", labels: new Set(["fire", "in-pass"]), state: "open", comments: [] }]]);
  let prochaine = CARTE;
  const pr = { number: PR, url: `https://github.com/${DEPOT}/pull/${PR}`, base: "main", sha: SHA, state: "open" as "open" | "closed", merged: false, enRetard: false, mergeePar: null, ref: `cook/${TICKET}-github` };
  const merges: Array<[number, string]> = [];
  const refus = { merge: null as null | { status: number; message: string } };
  const ecrites: Ecrite[] = [];
  const sienne = (numero: number) => issues.get(numero) ?? assert.fail(`pas d'issue #${numero}`);
  const merger = (numero: number, sha: string): { fait: true } | { fait: false; motif: string; status: number } => {
    if (refus.merge !== null) return { fait: false, motif: `HTTP ${refus.merge.status} — ${refus.merge.message}`, status: refus.merge.status };
    if (sha !== pr.sha) return { fait: false, motif: "HTTP 409 — Head branch was modified", status: 409 };
    merges.push([numero, sha]);
    pr.state = "closed";
    pr.merged = true;
    return { fait: true };
  };
  const github = {
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const numero = prochaine++;
      issues.set(numero, { title: titre, body: corps, labels: new Set(labels), state: "open", comments: [] });
      return numero;
    },
    commenter: async (numero: number, corps: string) => void sienne(numero).comments.push({ body: corps, association: "OWNER" }),
    delabelliser: async (numero: number, label: string) => void sienne(numero).labels.delete(label),
    fermerIssue: async (numero: number) => void (sienne(numero).state = "closed"),
    // La PR n'a aucun commentaire : son cook n'a rien dit de l'écran (ticket 3330).
    commentaires: async (numero: number) => (numero === PR ? [] : sienne(numero).comments),
    issue: async (numero: number) => {
      const lue = issues.get(numero);
      return lue === undefined ? null : { number: numero, title: lue.title, labels: [...lue.labels], state: lue.state, createdAt: "2026-11-11T12:00:00Z", updatedAt: "2026-11-11T12:00:00Z", url: `https://github.com/${DEPOT}/issues/${numero}` };
    },
    ouvertes: async () => ({
      inchange: false as const,
      issues: [...issues].filter(([, { state }]) => state === "open").map(([number, { title, body, labels }]) => ({ number, title, labels: [...labels], body, association: "OWNER" })),
      confirmer: () => {},
    }),
    prDeBranche: async (branche: string) => (branche === pr.ref ? { number: pr.number, url: pr.url, base: pr.base, sha: pr.sha, state: pr.state, merged: pr.merged, enRetard: false, mergeePar: null } : null),
    merger: async (numero: number, sha: string) => {
      const fait = merger(numero, sha);
      return fait.fait ? fait : { fait: false as const, motif: fait.motif };
    },
    fermer: () => {},
  };
  // L'API de GitHub, comme le téléphone la demande : `chemin` sans l'hôte.
  function api(methode: string, chemin: string, corps?: unknown): ReponseGitHub {
    const [route = "", requete = ""] = chemin.split("?");
    const parametres = new URLSearchParams(requete);
    if (methode !== "GET") ecrites.push({ methode, chemin, ...(corps === undefined ? {} : { corps }) });
    const enPanne = panne({ methode, chemin, ...(corps === undefined ? {} : { corps }) });
    if (enPanne !== undefined) return enPanne;
    const page = Number(parametres.get("page") ?? "1");
    const ici = route.startsWith(`/repos/${DEPOT}`) ? route.slice(`/repos/${DEPOT}`.length) : null;
    if (methode === "GET" && ici === "/issues") {
      const label = parametres.get("labels");
      const data = page > 1 ? [] : [...issues].filter(([, { state, labels }]) => state === "open" && (label === null || labels.has(label))).map(([number, { title, body, labels }]) => ({ number, title, body, labels: [...labels].map((name) => ({ name })), html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-11T12:00:00Z", author_association: "OWNER" }));
      return { status: 200, data };
    }
    if (methode === "POST" && ici === "/issues") {
      const { title, body } = corps as { title: string; body: string };
      const numero = prochaine++;
      issues.set(numero, { title, body, labels: new Set(), state: "open", comments: [] });
      return { status: 201, data: { number: numero } };
    }
    const issue = /^\/issues\/(\d+)(.*)$/.exec(ici ?? "");
    if (issue !== null) {
      const numero = Number(issue[1]);
      const lue = issues.get(numero);
      const reste = issue[2] ?? "";
      if (lue === undefined) return { status: 404, data: { message: "Not Found" } };
      if (methode === "GET" && reste === "") return { status: 200, data: { number: numero, title: lue.title, body: lue.body, state: lue.state, author_association: "OWNER", labels: [...lue.labels].map((name) => ({ name })) } };
      if (methode === "GET" && reste === "/comments") return { status: 200, data: page > 1 ? [] : lue.comments.map(({ body, association }, rang) => ({ id: numero * 100 + rang, body, author_association: association, created_at: "2026-11-11T12:00:00Z" })) };
      if (methode === "GET" && reste === "/events") return { status: 200, data: [] };
      if (methode === "POST" && reste === "/comments") {
        lue.comments.push({ body: (corps as { body: string }).body, association: "OWNER" });
        return { status: 201, data: { id: 900 + lue.comments.length } };
      }
      const label = /^\/labels\/(.+)$/.exec(reste)?.[1];
      if (methode === "DELETE" && label !== undefined) return lue.labels.delete(decodeURIComponent(label)) ? { status: 200, data: [] } : { status: 404, data: { message: "Label does not exist" } };
      if (methode === "PATCH" && reste === "") {
        lue.state = (corps as { state: "closed" }).state;
        return { status: 200, data: {} };
      }
    }
    if (methode === "GET" && ici === `/pulls/${PR}`) return { status: 200, data: { number: PR, state: pr.state, merged: pr.merged, merged_at: pr.merged ? "2026-11-11T12:30:00Z" : null, head: { ref: pr.ref, sha: pr.sha } } };
    if (methode === "PUT" && ici === `/pulls/${PR}/merge`) {
      const fait = merger(PR, (corps as { sha: string }).sha);
      return fait.fait ? { status: 200, data: { merged: true } } : { status: fait.status, data: { message: fait.motif.replace(/^HTTP \d+ — /, "") } };
    }
    const contenu = /^\/contents\/(.+)$/.exec(ici ?? "")?.[1];
    if (methode === "GET" && contenu !== undefined) return parametres.get("ref") === SHA && contenu.startsWith(`docs/captures/${TICKET}/`) ? { status: 200, data: { content: `${PNG.slice(0, 40)}\n${PNG.slice(40)}`, encoding: "base64" } } : { status: 404, data: { message: "Not Found" } };
    // Toute autre liste est vide, tout autre objet absent : ce que le téléphone lit d'autre de parade n'a rien.
    return methode === "GET" && ici !== null && !/\/\d+$/.test(ici) && !ici.startsWith("/contents/") ? { status: 200, data: [] } : { status: 404, data: { message: "Not Found" } };
  }
  const appeler: AppelGitHub = async (chemin) => api("GET", chemin);
  const client: ClientDeLaValidation = { lire: appeler, ecrire: async (methode, chemin, corps) => api(methode, chemin, corps) };
  // Ce que GitHub garde de la carte et de son ticket.
  const etat = () => ({ issues: Object.fromEntries([...issues].map(([numero, { labels, state, comments }]) => [numero, { labels: [...labels].sort(), state, comments: comments.map(({ body }) => body) }])), merges: [...merges], pr: { state: pr.state, merged: pr.merged } });
  return { github, api, appeler, client, issues, pr, merges, refus, ecrites, etat };
}
type Monde = ReturnType<typeof fauxGitHub>;

// La carte posée par le runtime, comme la pass la pose sur une livraison design verte qui porte ses captures.
async function carteDEssai(panne?: Panne): Promise<Monde> {
  const monde = fauxGitHub(panne);
  const motif = await retenirLeDesign(monde.github, {
    depot: DEPOT,
    station: "box/claude",
    ticket: { number: TICKET, title: "Export the journal as CSV", labels: ["cook:design"] },
    pr: { number: PR, sha: SHA },
    fichiers: ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`],
    renvoyer: async () => assert.fail("une livraison qui porte ses captures n'est pas renvoyée"),
  });
  assert.match(motif ?? "", /card #61/);
  return monde;
}

// Ce que la dernière lecture de l'app porte de la carte.
async function designLu(monde: Monde): Promise<ValidationDesign> {
  const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: monde.appeler });
  assert.equal(attente.lue, true);
  const [carte] = attente.lue ? attente.attentes : [];
  return carte?.chef?.design ?? assert.fail("la carte ne dit pas ce qu'elle valide");
}

const estUneSortie = (erreur: unknown): erreur is Sortie => erreur instanceof Sortie;
const parLeRuntime = async (monde: Monde, design: ValidationDesign, geste: unknown) => jouerLaValidation({ depot: DEPOT, design, geste, env: {}, commande: async () => ({ principal: (appel) => principal(appel, () => monde.github as never), estUneSortie }) });
const parLeTelephone = async (monde: Monde, design: ValidationDesign, geste: unknown) => validerSurGithub({ depot: DEPOT, carte: CARTE, design, geste, client: monde.client });

// Le même geste, par la commande du runtime puis par le téléphone, chacun sur son GitHub où la carte vient d'être posée —
// `avant` le prépare de la même façon sur les deux : GitHub en garde le même état.
async function deuxFois(geste: unknown, avant: (monde: Monde) => void | Promise<void> = () => undefined): Promise<{ runtime: RenduDeValidation; telephone: RenduDeValidation; monde: Monde }> {
  const auRuntime = await carteDEssai();
  const designDuRuntime = await designLu(auRuntime);
  await avant(auRuntime);
  const runtime = await parLeRuntime(auRuntime, designDuRuntime, geste);
  const monde = await carteDEssai();
  const design = await designLu(monde);
  await avant(monde);
  const telephone = await parLeTelephone(monde, design, geste);
  assert.deepEqual(monde.etat(), auRuntime.etat(), "GitHub ends up as the runtime's command leaves it");
  return { runtime, telephone, monde };
}
const RENVOI = { geste: "renvoyer", commentaire: "  The export button is cut off.\r\nKeep it on one line.  " };

describe("sur le téléphone, les deux gestes écrivent sur GitHub ce que la commande du runtime y écrit", () => {
  test("« Validate » : la PR mergée à la tête jugée verte, la carte fermée — elle quitte TODO", async () => {
    const { runtime, telephone, monde } = await deuxFois({ geste: "valider" });
    assert.deepEqual(telephone, runtime);
    assert.deepEqual(telephone, { fait: `${DEPOT}#${PR} validated: merged, card #${CARTE} closed — ticket #${TICKET} is served` });
    assert.deepEqual(monde.merges, [[PR, SHA]]);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
    assert.equal(monde.issues.get(CARTE)?.labels.has(LABEL_DU_CHEF), false);
    const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: monde.appeler });
    assert.deepEqual(attente.lue ? attente.attentes : assert.fail("TODO illisible"), [], "la carte a quitté TODO");
  });

  test("« Send back to the kitchen » : le commentaire posté sur le ticket comme ce qu'il faut changer, `in-pass` retiré, rien de mergé, la carte fermée", async () => {
    const { runtime, telephone, monde } = await deuxFois(RENVOI);
    assert.deepEqual(telephone, runtime);
    assert.match("fait" in telephone ? telephone.fait : assert.fail(JSON.stringify(telephone)), /sent back: #58 goes back to a cook with your comment, card #61 closed/);
    assert.deepEqual(monde.merges, []);
    assert.ok(monde.issues.get(TICKET)?.comments.some(({ body }) => body.startsWith(`${MARQUE_DE_RENVOI} n=1 sha=${SHA} -->`) && body.includes("The export button is cut off.\nKeep it on one line.")));
    assert.equal(monde.issues.get(TICKET)?.labels.has(LABEL_IN_PASS), false);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
  });

  test("la tête de la PR a bougé depuis la carte : rien n'est mergé, la carte reste, et le dit", async () => {
    const { runtime, telephone, monde } = await deuxFois({ geste: "valider" }, (monde) => void (monde.pr.sha = "b".repeat(40)));
    assert.deepEqual(telephone, { refus: "refus" in runtime ? runtime.refus : assert.fail("le runtime a validé"), detail: "" });
    assert.match("refus" in telephone ? telephone.refus : "", /^nothing was done: the head of PR #60 moved since card #61/);
    assert.deepEqual(monde.ecrites, []);
  });

  test("la livraison est repartie en cuisine depuis la carte : rien n'est mergé, la carte se ferme", async () => {
    const renvoi = (monde: Monde) => void monde.issues.get(TICKET)?.comments.push({ body: `${MARQUE_DE_RENVOI} n=1 sha=${SHA} -->\nThe CI went red.`, association: "OWNER" });
    const { telephone, monde } = await deuxFois({ geste: "valider" }, renvoi);
    assert.match("refus" in telephone ? telephone.refus : assert.fail("validée"), /the delivery of PR #60 went back to a cook since card #61: nothing merged, card #61 closed/);
    assert.deepEqual(monde.merges, []);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
  });

  test("la PR fermée sans merge : rien à valider ni à renvoyer", async () => {
    const fermee = (monde: Monde) => void (monde.pr.state = "closed");
    const valider = await deuxFois({ geste: "valider" }, fermee);
    assert.match("refus" in valider.telephone ? valider.telephone.refus : "", /^nothing was done: PR #60 is closed without being merged/);
    const renvoyer = await deuxFois(RENVOI, fermee);
    assert.match("refus" in renvoyer.telephone ? renvoyer.telephone.refus : "", /^nothing was done: PR #60 is no longer open: there is nothing to send back/);
  });

  test("la PR déjà mergée : « Validate » ferme la carte, sans merger une seconde fois", async () => {
    const { telephone, monde } = await deuxFois({ geste: "valider" }, (monde) => void Object.assign(monde.pr, { state: "closed", merged: true }));
    assert.ok("fait" in telephone);
    assert.deepEqual(monde.merges, []);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
  });

  test("la PR déjà mergée : « Send back » ouvre un ticket de suite avec le commentaire du chef et ferme la carte, au lieu d'échouer", async () => {
    const { runtime, telephone, monde } = await deuxFois(RENVOI, (monde) => void Object.assign(monde.pr, { state: "closed", merged: true }));
    assert.deepEqual(telephone, runtime);
    assert.match("fait" in telephone ? telephone.fait : assert.fail("renvoyée"), /was already merged: your comment is the follow-up ticket #62, card #61 closed/);
    assert.match(monde.issues.get(62)?.body ?? "", /The export button is cut off\./);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
    assert.equal(monde.issues.get(TICKET)?.comments.length, 1, "le ticket ne reçoit aucun renvoi : sa livraison est mergée");
  });

  test("un merge que GitHub refuse : la carte reste ouverte, et dit ce que GitHub a répondu", async () => {
    const { telephone, monde } = await deuxFois({ geste: "valider" }, (monde) => void (monde.refus.merge = { status: 405, message: "Required status check is expected" }));
    assert.equal("refus" in telephone && telephone.refus, "nothing was done: GitHub refused to merge PR #60 — HTTP 405 — Required status check is expected; card #61 stays open");
    assert.equal(monde.issues.get(CARTE)?.state, "open");
  });

  test("une carte fermée ailleurs depuis la lecture : rien ne part", async () => {
    const { runtime, telephone, monde } = await deuxFois({ geste: "valider" }, (monde) => void ((monde.issues.get(CARTE) ?? assert.fail("pas de carte")).state = "closed"));
    assert.deepEqual(telephone, { refus: "refus" in runtime ? runtime.refus : assert.fail("le runtime a validé"), detail: "" });
    assert.equal("refus" in telephone && telephone.refus, "nothing was done: no open “Validate its screen” card holds PR #60");
    assert.deepEqual(monde.ecrites, []);
  });
});

describe("ce que le téléphone ne tient pas pour fait", () => {
  test("un renvoi sans commentaire, ou une carte que la lecture ne porte pas : rien ne part", async () => {
    const monde = await carteDEssai();
    const design = await designLu(monde);
    assert.deepEqual(await parLeTelephone(monde, design, { geste: "renvoyer", commentaire: " \n " }), { refus: VIDE, detail: "" });
    assert.deepEqual(await validerSurGithub({ depot: DEPOT, carte: CARTE, design: undefined, geste: { geste: "valider" }, client: monde.client }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(await validerSurGithub({ depot: DEPOT, carte: "61", design, geste: { geste: "valider" }, client: monde.client }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(monde.ecrites, []);
  });

  test("GitHub refuse la session du téléphone dès la première lecture : rien n'est fait, et le survol dit de se reconnecter", async () => {
    const monde = await carteDEssai((demande) => (demande.chemin === `/repos/${DEPOT}/issues/${CARTE}` ? { status: 401, data: { message: "Bad credentials" } } : undefined));
    const design = await designLu(monde);
    const rendu = await parLeTelephone(monde, design, { geste: "valider" });
    assert.equal("refus" in rendu && rendu.refus, "nothing was done: GitHub did not take the gesture");
    assert.match("refus" in rendu ? rendu.detail : "", /HTTP 401.*sign in to GitHub again/);
    assert.deepEqual(monde.merges, []);
  });

  test("GitHub refuse une écriture après d'autres : le geste dit ce qui est déjà écrit, et se rejoue", async () => {
    let enPanne = true;
    const monde = await carteDEssai((demande) => (enPanne && demande.methode === "DELETE" && demande.chemin.endsWith("/labels/in-pass") ? { status: 502, data: { message: "Server Error" } } : undefined));
    const design = await designLu(monde);
    const rendu = await parLeTelephone(monde, design, RENVOI);
    assert.equal("refus" in rendu && rendu.refus, "GitHub stopped the gesture midway — already written: a comment on #58; play it again");
    assert.match("refus" in rendu ? rendu.detail : "", /HTTP 502/);
    assert.equal(monde.issues.get(CARTE)?.state, "open", "la carte reste dans TODO");
    enPanne = false;
    assert.ok("fait" in (await parLeTelephone(monde, design, RENVOI)));
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
  });

  test("ce que le téléphone écrit et lit est ce que le runtime écrit et lit", () => {
    assert.deepEqual(DE_CONFIANCE, DE_CONFIANCE_DU_RUNTIME);
    assert.equal(MARQUE_DE_RENVOI, RENVOI_DU_RUNTIME);
    assert.equal(LABEL_IN_PASS, IN_PASS_DU_RUNTIME);
    assert.equal(LABEL_DU_CHEF, CHEF_TODO);
    assert.equal(brancheDuTicket(TICKET), brancheDuRuntime(TICKET));
  });
});

describe("les gestes du téléphone et ses captures", () => {
  // Les gestes du téléphone (gestes-github-telephone.ts) sur ce GitHub, portés par un faux HTTP natif de Capacitor.
  const capacitor = (monde: Monde) => async (demande: DemandeNative): Promise<ReponseNative> => {
    assert.equal(demande.headers.Authorization, `Bearer ${JETON}`);
    return monde.api(demande.method, demande.url.slice(API.length), demande.data);
  };
  const gestes = (monde: Monde, design: ValidationDesign | undefined, ecrits: string[] = []) =>
    ouvrirLesGestesGitHub({
      jeton: async () => JETON,
      appeler: monde.appeler,
      envoyer: ecritureParCapacitor(capacitor(monde)),
      depot: (projet) => (projet === PROJET ? DEPOT : undefined),
      dernier: () => undefined,
      chef: (projet, ticket) => (projet === PROJET && ticket === CARTE && design !== undefined ? { sorte: "design-validation", texte: "", design } : undefined),
      ecrit: (projet) => void ecrits.push(projet),
    });

  test("`gesteDeValidation` joue le geste sur la carte que la dernière lecture porte, et relance la lecture", async () => {
    const monde = await carteDEssai();
    const ecrits: string[] = [];
    const rendu = await gestes(monde, await designLu(monde), ecrits).gesteDeValidation(PROJET, CARTE, { geste: "valider" });
    assert.ok("fait" in rendu);
    assert.deepEqual(monde.merges, [[PR, SHA]]);
    assert.deepEqual(ecrits, [PROJET]);
  });

  test("un projet dont le dépôt n'est pas lu, ou une carte inconnue : rien ne part, rien n'est relu", async () => {
    const monde = await carteDEssai();
    const ecrits: string[] = [];
    const lus = gestes(monde, await designLu(monde), ecrits);
    const sansDepot = await lus.gesteDeValidation("cantine", CARTE, { geste: "valider" });
    assert.match("refus" in sansDepot ? sansDepot.refus : assert.fail("validée"), /^nothing was sent: this phone has not read which repository cantine is/);
    assert.deepEqual(await lus.gesteDeValidation(PROJET, 40, { geste: "valider" }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(monde.ecrites, []);
    assert.deepEqual(ecrits, []);
  });

  test("une capture se lit sur l'API de GitHub au commit de la carte ; une qui ne se lit pas le dit", async () => {
    const monde = await carteDEssai();
    const design = await designLu(monde);
    const avant = design.captures.ecrans[0]?.avant ?? assert.fail("pas de capture avant");
    assert.deepEqual(await lireCaptureSurLAPI(monde.appeler, avant), { image: `data:image/png;base64,${PNG}` });
    const ailleurs = avant.replace(SHA, "a".repeat(40));
    assert.match(JSON.stringify(await lireCaptureSurLAPI(monde.appeler, ailleurs)), /"sans":"GitHub refused the reading of this screenshot \(HTTP 404\)/);
    assert.deepEqual(await lireCaptureSurLAPI(async () => ({ status: 200, data: { content: "", encoding: "none" } }), avant), { sans: `GET /repos/${DEPOT}/contents/docs/captures/58/rail-avant.png?ref=${SHA} — its answer is not the file's content` });
    assert.match(JSON.stringify(await lireCaptureSurLAPI(async () => Promise.reject(new Error("Unable to resolve host")), avant)), /GitHub did not answer for this screenshot: Unable to resolve host/);
    assert.match(JSON.stringify(await lireCaptureSurLAPI(monde.appeler, "https://example.com/x.png")), /is not a file on GitHub/);
  });

  test("une carte dont le corps ne montre aucune capture le dit en une ligne, ce que l'app y cherche au survol", async () => {
    const monde = await carteDEssai();
    const carte = monde.issues.get(CARTE) ?? assert.fail("pas de carte");
    carte.body = carte.body.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    const design = await designLu(monde);
    const todo = carteDuChefDeTodo({ sorte: "design-validation", texte: "Does the screen of #58 look right?", design }) ?? assert.fail("pas de carte de TODO");
    assert.deepEqual(todo.captures?.ecrans, []);
    assert.equal(todo.captures?.incomplete?.ligne, SANS_CAPTURE);
    assert.match(todo.captures?.incomplete?.detail ?? "", /docs\/captures\/58\/ on the project's repository at `3f9c2a1`/);
  });
});

// Le téléphone tel que l'APK le porte : la vue et le pont posés par la construction (packaging/android.ts, `poserLaVue`),
// le pont joué comme dans la WebView, connecté à GitHub (le jeton du coffre) ; le HTTP natif de Capacitor est ce faux
// GitHub, où le gist d'une station dit les projets du chef.
const POSEE = mkdtempSync(join(tmpdir(), "validation-design-apk-"));
after(() => rmSync(POSEE, { recursive: true, force: true }));
let posee: Promise<string> | undefined;
const laVuePosee = () =>
  (posee ??= demarrageDuPont().then((demarrage) => {
    poserLaVue(demarrage, join(POSEE, "www"));
    return join(POSEE, "www");
  }));
const PROJETS_DU_GIST = JSON.stringify({ brigade: "projets", format: 1, projets: [{ nom: PROJET, depot: DEPOT, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null }] });
async function jusqua(fait: () => boolean): Promise<void> {
  for (let tour = 0; tour < 500 && !fait(); tour++) await repos();
  assert.ok(fait(), "the fact never came");
}

async function pontDeLAPK(monde: Monde) {
  const natifs: string[] = [];
  const stockage = new Map([["brigade.github", "chef"]]);
  const window: Record<string, unknown> = {
    location: { href: pathToFileURL(join(await laVuePosee(), "src", "vue", "index.html")).href },
    localStorage: { getItem: (cle: string) => stockage.get(cle) ?? null, setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur), removeItem: (cle: string) => void stockage.delete(cle) },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    Capacitor: {
      nativePromise: async (plugin: string, methode: string, options: Record<string, unknown>) => {
        const passees = JSON.parse(JSON.stringify(options)) as { url: string; method: string; headers: Record<string, string>; data?: unknown; id?: number };
        natifs.push(`${plugin}.${methode}${plugin === "Pont" && methode === "retirer" ? ` ${passees.id}` : ""}`);
        if (plugin === "Coffre" && methode === "lire") return { valeur: JETON };
        // La notification de la carte, montrée par le sondage d'Android.
        if (plugin === "Pont") return methode === "gardees" ? { valeur: JSON.stringify({ [`${DEPOT}#${CARTE}`]: { id: 7, projet: PROJET, depot: DEPOT, ticket: CARTE, question: "Does the screen of #58 look right?" } }) } : {};
        if (plugin !== "CapacitorHttp" || methode !== "request") return assert.fail(`unexpected call: ${plugin}.${methode}`);
        assert.equal(passees.headers.Authorization, `Bearer ${JETON}`);
        // La trace de ce téléphone, déjà posée (#3303, telephone-connecte.ts) : la lecture n'écrit rien d'autre que le geste.
        if (passees.url.startsWith(`${API}/gists?`)) return { status: 200, data: /[?&]page=1(&|$)/.test(passees.url) ? [{ id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json" } } }, { id: "t1", files: { "brigade-telephone.json": { filename: "brigade-telephone.json" } } }] : [], headers: {} };
        if (passees.url === `${API}/gists/g1`) return { status: 200, data: { id: "g1", files: { "brigade-projets.json": { filename: "brigade-projets.json", content: PROJETS_DU_GIST } } }, headers: {} };
        if (passees.url === `${API}/repos/${DEPOT}`) return { status: 200, data: { full_name: DEPOT, owner: { login: "chef" }, permissions: { push: true } }, headers: {} };
        if (passees.url === `${API}/user`) return { status: 200, data: { login: "chef" }, headers: {} };
        return { ...monde.api(passees.method, passees.url.slice(API.length), passees.data), headers: { "content-type": "application/json; charset=utf-8" } };
      },
    },
  };
  vm.runInNewContext(readFileSync(join(await laVuePosee(), "android", "pont.js"), "utf8"), { window, URL }, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  const pont = window.brigade as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const dessins: Array<{ projet?: string; tableau?: { rail?: { attendLu?: string } } }> = [];
  pont.surFaits!((recue: unknown) => void dessins.push(JSON.parse(JSON.stringify(recue))));
  let projets: unknown;
  pont.surConfiguration!((configuration: unknown) => void (projets = configuration));
  await pont.demarrage!();
  void pont.faits!(1);
  void pont.tous!(2);
  await jusqua(() => projets !== undefined);
  void pont.faits!(3);
  void pont.tous!(4);
  await jusqua(() => dessins.some(({ projet, tableau }) => projet === PROJET && tableau?.rail?.attendLu !== undefined));
  return { pont, natifs };
}

describe("par le pont de l'APK, sans station ni runtime", () => {
  test("la carte se lit, ses captures aussi ; « Validate » merge la PR, ferme la carte et retire sa notification", async () => {
    const monde = await carteDEssai();
    const { pont, natifs } = await pontDeLAPK(monde);
    assert.deepEqual(await pont.lireCapture!(PROJET, CARTE, "rail", "apres"), { image: `data:image/png;base64,${PNG}` });
    const rendu = JSON.parse(JSON.stringify(await pont.gesteDeValidation!(PROJET, CARTE, { geste: "valider" })));
    assert.deepEqual(rendu, { fait: `${DEPOT}#${PR} validated: merged, card #${CARTE} closed — ticket #${TICKET} is served` });
    assert.deepEqual(monde.merges, [[PR, SHA]]);
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
    await jusqua(() => natifs.includes("Pont.retirer 7"));
  });

  test("« Send back to the kitchen » : le commentaire part sur le ticket, la carte se ferme", async () => {
    const monde = await carteDEssai();
    const { pont } = await pontDeLAPK(monde);
    const rendu = JSON.parse(JSON.stringify(await pont.gesteDeValidation!(PROJET, CARTE, { geste: "renvoyer", commentaire: "Keep the label on one line." })));
    assert.match(rendu.fait, /sent back: #58 goes back to a cook with your comment, card #61 closed/);
    assert.ok(monde.issues.get(TICKET)?.comments.some(({ body }) => body.includes("Keep the label on one line.")));
    assert.equal(monde.issues.get(CARTE)?.state, "closed");
  });
});
