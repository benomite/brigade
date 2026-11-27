// L'issue d'un ticket et sa discussion, sur la fiche de toute carte (#684) : le corps puis les
// commentaires dans l'ordre, chacun avec son auteur et sa date, le markdown rendu ; et le
// commentaire du chef, posté sur l'issue du ticket par l'accès GitHub de l'app, à son nom (#2061) — au
// clic, et seulement au clic. Le commentaire est joué contre un poste doublé, qui note ce qu'il reçoit ; la
// demande au second, `/brigade:ask <ticket> `, contre un second doublé ; la vue, telle qu'elle est, devant un
// faux document.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { comment, askAtSecond, noteOfTheQuestion, PRICE, type Post, type Commented, type Discussion } from "../src/discussion.ts";
import { putAPart } from "../src/awaiting.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Read } from "../src/question.ts";
import type { Terminal } from "../src/terminals.ts";
import { discussionOf } from "./helpers/cards-said.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const PARADE = "parade";
const PROJECT = { nom: PARADE, dossier: "/tmp/parade" };

// L'issue lue de GitHub : le corps, puis les commentaires du plus ancien au plus récent.
const ISSUE = {
  found: true,
  issue: {
    ticket: 21,
    title: "L'export du journal",
    url: "https://github.com/benomite/brigade/issues/21",
    state: "open",
    body: { author: "benomite", at: "2026-10-14T08:00:00Z", body: "## Contexte\n\nExporter le journal en **CSV**.\n\n- une ligne par événement\n- `at` en UTC\n\n<!-- brigade:decoupage #20.1 -->" },
    comments: [
      { author: "benomite", at: "2026-10-14T08:01:00Z", body: "<!-- brigade:fiche -->\n- attend : rien\n- zone : runtime/src" },
      { author: "brigade-pass[bot]", at: "2026-10-14T11:30:00Z", body: "**Pass — rouge.** Voir https://github.com/benomite/brigade/pull/31" },
      { author: "", at: "2026-10-14T12:00:00Z", body: "<!-- brigade:marqueur -->" },
    ],
  },
};
// Le poste de l'issue, doublé : ce qu'il reçoit est noté, et `rendre` dit ce que GitHub en a fait — l'adresse du
// commentaire, ou pourquoi il n'est pas parti.
function workstation(render: (ticket: number, text: string) => { url: string | null } | { raison: string } = (ticket) => ({ url: `https://github.com/chef/parade/issues/${ticket}#issuecomment-7001` })) {
  const workstations: [number, string][] = [];
  const post: Post = async (ticket, text) => (workstations.push([ticket, text]), render(ticket, text));
  return { postes: workstations, poster: post };
}

describe("le commentaire du chef part sur l'issue du ticket, à son nom (#2061)", () => {
  test("le texte part tel qu'il est écrit, ses bords retirés : guillemets, retours à la ligne et `$(…)` compris — et la fiche dit ce qu'il coûte", async () => {
    const { postes: workstations, poster: post } = workstation();
    const text = "  Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\r\nfin  ";
    assert.deepEqual(await comment(post, PROJECT, 21, text), { poste: true, prix: PRICE });
    assert.deepEqual(workstations, [[21, "Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\nfin"]]);
  });

  test("GitHub qui refuse : rien n'est posté, et sa raison est dite telle quelle, sans son point final", async () => {
    const { poster: post } = workstation(() => ({ raison: "The comment could not be posted on #21 of chef/parade: the comment: HTTP 403 — Resource not accessible." }));
    assert.deepEqual(await comment(post, PROJECT, 21, "du contexte"), { poste: false, refus: "nothing was posted: the comment could not be posted on #21 of chef/parade: the comment: HTTP 403 — Resource not accessible" });
  });

  test("posté sans adresse rendue : c'est posté quand même", async () => {
    const { poster: post } = workstation(() => ({ url: null }));
    assert.deepEqual(await comment(post, PROJECT, 21, "du contexte"), { poste: true, prix: PRICE });
  });

  test("rien ne part d'un texte vide, d'un projet qui ne s'ouvre pas, ni sans ticket : rien n'est posté", async () => {
    const { postes: workstations, poster: post } = workstation(() => assert.fail("rien ne devait partir"));
    for (const [project, ticket, text] of [
      [PROJECT, 21, ""],
      [PROJECT, 21, "  \n\t "],
      [PROJECT, 21, undefined],
      [PROJECT, 21, "a\0b"],
      [PROJECT, 21, "x".repeat(65_537)],
      [PROJECT, "21", "du contexte"],
      [PROJECT, 0, "du contexte"],
      [{ ...PROJECT, refus: "illisible" }, 21, "du contexte"],
    ] as const) {
      const rendered = await comment(post, project, ticket, text);
      assert.ok(!rendered.poste && rendered.refus.startsWith("nothing was posted: "), JSON.stringify([ticket, text?.slice(0, 20)]));
    }
    assert.deepEqual(workstations, []);
  });

  test("un projet sans rien d'autre que son dossier commente quand même : seule l'issue compte", async () => {
    const { postes: workstations, poster: post } = workstation();
    assert.deepEqual(await comment(post, { nom: PARADE, dossier: "/tmp/parade" }, 21, "du contexte"), { poste: true, prix: PRICE });
    assert.deepEqual(workstations, [[21, "du contexte"]]);
  });
});

// La vue, jouée telle qu'elle est.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
// Ce que `inscrire` rend d'une demande écrite : le second la porte, la note la dit.
const SECOND_WRITTEN: Terminal = { ...SECOND, note: "demande écrite dans le second — appuie sur Entrée pour l'envoyer", demandeEcrite: true };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PROJECT] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-14T12:00:00.000Z",
  dernierTick: "2026-10-14T12:00:00.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
    { ticket: 31, etat: "servi", titre: "Servi hier", url: "https://github.com/benomite/brigade/issues/31", activite: null },
  ],
  cooks: [],
  attend: [],
};

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], gestesDeFiche: (cardItem) => actionsOfCard(cardItem), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: FACTS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const card = (vue: Played) => vue.element("fiche");
const openCard = async (vue: Played, number: number) => {
  const slip = cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`);
  slip.click();
  await repos();
};
const discussion = (vue: Played): Fake => card(vue).dessous("section").find((pose) => pose.className === "discussion") ?? assert.fail("pas de discussion sur la fiche");
// Chaque message de la discussion : sa tête — qui, quoi, quand —, puis son texte rendu.
const messages = (vue: Played) => (discussion(vue).dessous("ol")[0]?.children ?? []).map((li) => [li.children[0]?.textContent, li.children[1]?.textContent]);
const field = (vue: Played) => discussion(vue).dessous("textarea")[0] ?? assert.fail("pas de champ de commentaire");
const post = (vue: Played) => discussion(vue).dessous("button").find((pose) => pose.dataset.geste === "commentaire") ?? assert.fail("pas de bouton d'envoi");
const write = (vue: Played, text: string) => {
  field(vue).value = text;
  field(vue).declencher("input");
};
const readEntry = (): Discussion => discussionOf(ISSUE);
const withComment = (text: string): Discussion => discussionOf({ ...ISSUE, issue: { ...ISSUE.issue, comments: [...ISSUE.issue.comments, { author: "benomite", at: "2026-10-14T13:00:00Z", body: text }] } });

describe("la fiche de toute carte montre l'issue et sa discussion (#684)", () => {
  test("le corps, puis les commentaires dans l'ordre, avec leur auteur et leur date — quelle que soit la colonne de la carte", async () => {
    const vue = await open({ lireDiscussion: () => readEntry() });
    for (const number of [14, 21, 31]) {
      await openCard(vue, number);
      assert.deepEqual(vue.dernier("lireDiscussion"), [PARADE, number]);
      assert.deepEqual(messages(vue), [
        ["benomite opened the issue2026-10-14 08:00 UTC", "ContexteExporter le journal en CSV.une ligne par événementat en UTC"],
        ["benomite commented2026-10-14 08:01 UTC", "attend : rienzone : runtime/src"],
        ["brigade-pass[bot] commented2026-10-14 11:30 UTC", "Pass — rouge. Voir https://github.com/benomite/brigade/pull/31"],
        ["a deleted GitHub account commented2026-10-14 12:00 UTC", "nothing visible — only markers GitHub does not show"],
      ], `#${number}`);
      card(vue).declencher("keydown", { key: "Escape" });
    }
  });

  test("le markdown est rendu en éléments — titre, gras, liste, code, lien —, pas en texte brut", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), ouvrirLien: () => true });
    await openCard(vue, 21);
    const [body, , pass] = discussion(vue).dessous("ol")[0]?.children ?? [];
    const rendered = body?.children[1] ?? assert.fail("pas de corps");
    assert.deepEqual(rendered.children.map(({ balise }) => balise), ["h2", "p", "ul"]);
    assert.equal(rendered.dessous("strong")[0]?.textContent, "CSV");
    assert.deepEqual(rendered.dessous("li").map((li) => li.textContent), ["une ligne par événement", "at en UTC"]);
    assert.equal(rendered.dessous("code")[0]?.textContent, "at");
    assert.ok(!rendered.textContent.includes("**") && !rendered.textContent.includes("##") && !rendered.textContent.includes("<!--"));
    // Un lien ne navigue pas dans l'app : un clic demande au process principal de l'ouvrir.
    const link = pass?.dessous("a")[0] ?? assert.fail("pas de lien");
    assert.equal(link.textContent, "https://github.com/benomite/brigade/pull/31");
    link.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLien"), [PARADE, 21, "https://github.com/benomite/brigade/pull/31"]);
  });

  test("tant que l'issue n'est pas lue, la fiche le dit ; une issue qui ne se lit pas le dit en une ligne, pourquoi au survol, et n'offre pas de champ", async () => {
    let render: (discussion: Discussion) => void = () => {};
    const vue = await open({ lireDiscussion: () => new Promise((settle) => (render = settle)) as never });
    await openCard(vue, 21);
    assert.equal(discussion(vue).dessous("p")[0]?.textContent, "Reading issue #21…");
    render({ sans: "no issue to read: #21 is a pull request, not an issue" });
    await repos();
    // Une ligne courte ; pourquoi, au survol de son aide (bricks.js).
    const line = discussion(vue).dessous("p")[0] ?? assert.fail("pas de ligne");
    assert.deepEqual([line.className, line.children[0]?.textContent], ["indisponible", "Discussion not reached."]);
    assert.equal((line.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, "no issue to read: #21 is a pull request, not an issue");
    assert.deepEqual(discussion(vue).dessous("textarea"), []);
  });

  test("le bouton est inactif tant que le champ est vide ; rien ne part sans son clic", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), commenter: () => ({ poste: true, prix: "" }) });
    await openCard(vue, 21);
    assert.equal(field(vue).value, "");
    assert.equal(post(vue).disabled, true);
    write(vue, "   \n ");
    assert.equal(post(vue).disabled, true);
    write(vue, "Le CSV doit aussi porter le run.");
    assert.equal(post(vue).disabled, false);
    // Écrire n'envoie rien ; une fiche reposée garde le texte.
    card(vue).declencher("keydown", { key: "Escape" });
    await openCard(vue, 21);
    assert.equal(field(vue).value, "Le CSV doit aussi porter le run.");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "commenter").length, 0);
  });

  test("posté : le champ se vide, la discussion est relue et le commentaire y apparaît", async () => {
    let postedOnGitHub: string | undefined;
    let render: (rendered: Commented) => void = () => {};
    const vue = await open({
      lireDiscussion: () => (postedOnGitHub === undefined ? readEntry() : withComment(postedOnGitHub)),
      commenter: (_, __, text) => new Promise((settle) => (render = (rendered) => ((postedOnGitHub = text), settle(rendered)))) as never,
    });
    await openCard(vue, 21);
    write(vue, "Le CSV doit aussi porter le **run**.");
    post(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("commenter"), [PARADE, 21, "Le CSV doit aussi porter le **run**."]);
    // En route : ni le champ ni le bouton ne servent, et la fiche le dit.
    assert.equal(field(vue).disabled, true);
    assert.equal(post(vue).disabled, true);
    assert.ok(discussion(vue).dessous("p").some((p) => p.textContent === "posting your comment on the issue…"));
    render({ poste: true, prix: "a comment is posted on issue #21, under the station's own gh account" });
    await repos();
    await repos();
    assert.equal(field(vue).value, "");
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "postee")?.textContent, "comment posted on #21 — a comment is posted on issue #21, under the station's own gh account");
    assert.deepEqual(messages(vue).at(-1), ["benomite commented2026-10-14 13:00 UTC", "Le CSV doit aussi porter le run."]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "lireDiscussion").length, 2);
  });

  test("un échec garde le texte dans le champ et le dit sous lui, en rouge", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), commenter: () => ({ poste: false, refus: "nothing was posted: #21 is a pull request, not an issue" }) });
    await openCard(vue, 21);
    write(vue, "du contexte");
    post(vue).click();
    await repos();
    assert.equal(field(vue).value, "du contexte");
    assert.equal(post(vue).disabled, false);
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was posted: #21 is a pull request, not an issue");
    // Rien n'est parti : la discussion n'est pas relue.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "lireDiscussion").length, 1);
  });

  test("un envoi qui lève — le process principal injoignable — garde aussi le texte, et le dit", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), commenter: () => Promise.reject(new Error("ipc fermé")) as never });
    await openCard(vue, 21);
    write(vue, "du contexte");
    post(vue).click();
    await repos();
    assert.equal(field(vue).value, "du contexte");
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was posted: ipc fermé");
  });
});

// « ask the second » (#686, #2167) : `/brigade:ask <ticket> ` — une espace au bout — écrit dans le second du projet,
// sans Entrée ; le chef tape sa question à la suite. Rien ne part sur GitHub ni sur la box.
describe("demander au second depuis la fiche : `/brigade:ask <ticket> ` écrit dans le second, sans Entrée (#2167)", () => {
  const registered = () => {
    const writtenEntries: string[] = [];
    return { ecrites: writtenEntries, inscrire: (command: string) => (writtenEntries.push(command), SECOND_WRITTEN) };
  };

  test("le ticket 2087 : exactement `/brigade:ask 2087 `, rien d'autre — ni Entrée, ni retour à la ligne — et le second écrit est rendu", () => {
    const { ecrites: writtenEntries, inscrire: register } = registered();
    assert.equal(askAtSecond(register, PROJECT, 2087), SECOND_WRITTEN);
    assert.deepEqual(writtenEntries, ["/brigade:ask 2087 "]);
    assert.doesNotMatch(writtenEntries[0] ?? "", /[\r\n]/);
  });

  test("le même geste pour toute carte qui a un numéro, quelle que soit la station du projet", () => {
    for (const project of [PROJECT, { ...PROJECT, depot: "chef/parade" }, { nom: "ailleurs", dossier: "/tmp/ailleurs", depot: "chef/ailleurs", base: "main" }]) {
      for (const ticket of [1, 21, 2087]) {
        const { ecrites: writtenEntries, inscrire: register } = registered();
        askAtSecond(register, project, ticket);
        assert.deepEqual(writtenEntries, [`/brigade:ask ${ticket} `]);
      }
    }
  });

  test("le clic ne poste rien sur GitHub : ni commentaire, ni label", () => {
    // Le geste ne reçoit pas de quoi joindre GitHub : seulement ce qui écrit dans le second, le projet et le ticket.
    assert.equal(askAtSecond.length, 3);
    // Le canal du process principal n'appelle que lui : ni l'accès GitHub de l'app, ni le rail lu.
    const channel = /ipcMain\.handle\("demanderAuSecond"[\s\S]*?\n\}\);/.exec(readFileSync(join(ROOT, "app/src/main.ts"), "utf8"))?.[0] ?? assert.fail("pas de canal « demanderAuSecond »");
    assert.match(channel, /demanderAuSecond\(\(commande\) => terminaux\.inscrire\(vise, commande, noteDeLaQuestion\), vise, ticket\)/);
    assert.doesNotMatch(channel, /commenterLIssue|clientDesLabels|tableaux|brigade ask/);
  });

  test("ni ticket, ni projet qui s'ouvre : rien n'est écrit, et pourquoi est dit", () => {
    const { ecrites: writtenEntries, inscrire: register } = registered();
    for (const [project, ticket] of [
      [PROJECT, "21"],
      [PROJECT, 0],
      [PROJECT, 1.5],
      [{ ...PROJECT, refus: "illisible" }, 21],
    ] as const) {
      const rendered = askAtSecond(register, project, ticket);
      assert.ok("refus" in rendered && rendered.refus.startsWith("nothing was written: "), JSON.stringify(rendered));
    }
    assert.deepEqual(writtenEntries, []);
  });

  test("la note du second dit d'écrire la question à la suite, et avertit devant un dialogue", () => {
    assert.match(noteOfTheQuestion(), /without Enter — type your question after it/);
    assert.match(noteOfTheQuestion(true), /keystrokes/);
  });
});

const requestAtSecond = (vue: Played) => discussion(vue).dessous("button").find((pose) => pose.dataset.geste === "demande-second") ?? assert.fail("pas de bouton « ask the second »");

describe("la fiche : le bouton « ask the second » et la question d'une carte Await (#686)", () => {
  test("rien ne part avant le clic ; le clic envoie l'issue et le texte du champ, sans rien recopier, et la fiche confirme", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), demanderAuSecond: () => SECOND_WRITTEN });
    await openCard(vue, 21);
    write(vue, "le CSV d'abord");
    assert.equal(requestAtSecond(vue).textContent, "ask the second");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "demanderAuSecond").length, 0);
    requestAtSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAuSecond"), [PARADE, 21, "le CSV d'abord"]);
    assert.ok(discussion(vue).dessous("p").some((p) => p.className === "postee" && p.textContent.startsWith("request about #21 written in the second")));
    // Le champ garde son texte : ce n'est pas un commentaire.
    assert.equal(field(vue).value, "le CSV d'abord");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "commenter").length, 0);
  });

  test("le champ vide : le bouton sert quand même, avec un contexte vide", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), demanderAuSecond: () => SECOND_WRITTEN });
    await openCard(vue, 14);
    assert.equal(requestAtSecond(vue).disabled, false);
    requestAtSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAuSecond"), [PARADE, 14, ""]);
  });

  test("le second injoignable : l'erreur s'affiche, le texte reste, rien n'est dit parti", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), demanderAuSecond: () => ({ refus: "nothing was written: the second's request was not composed — the board did not answer" }) });
    await openCard(vue, 21);
    write(vue, "du contexte");
    requestAtSecond(vue).click();
    await repos();
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was written: the second's request was not composed — the board did not answer");
    assert.ok(!discussion(vue).dessous("p").some((p) => p.className === "postee"));
    assert.equal(field(vue).value, "du contexte");
  });

  test("un second qui ne tourne pas : lancé, rien n'est écrit — la fiche ne dit pas la demande partie", async () => {
    const notWritten: Terminal = { ...SECOND, note: "the second was not running: launched (`claude --continue second`) — the command is not written into a second that is starting, click again when it is ready" };
    const vue = await open({ lireDiscussion: () => readEntry(), demanderAuSecond: () => notWritten });
    await openCard(vue, 21);
    requestAtSecond(vue).click();
    await repos();
    const ps = discussion(vue).dessous("p");
    assert.ok(!ps.some((p) => p.className === "postee"));
    assert.ok(ps.find((p) => p.className === "refus")?.textContent.includes("not written"));
  });

  test("un appel qui lève est dit aussi", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), demanderAuSecond: () => Promise.reject(new Error("ipc fermé")) as never });
    await openCard(vue, 21);
    requestAtSecond(vue).click();
    await repos();
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was written: ipc fermé");
  });

  const QUESTION: Read = {
    a: "2026-10-14T12:30:00.000Z",
    question: { url: "https://github.com/benomite/brigade/issues/50#issuecomment-1", auteur: "brigade-manager", a: "2026-10-14T12:00:00Z", texte: "Quel format garde-t-on ?\nA) CSV\nB) JSON", resume: "Quel format garde-t-on ?", choix: [{ lettre: "A", texte: "CSV" }, { lettre: "B", texte: "JSON" }], depuis: [] },
  };
  const openAwait = async (readQuestion: Read) => {
    const facts = { ...FACTS, attend: [{ ticket: 50, titre: "Le format de l'export", url: "https://github.com/benomite/brigade/issues/50" }] };
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], gestesDeFiche: (cardItem) => actionsOfCard(cardItem), lireDiscussion: () => readEntry(), lireQuestion: () => readQuestion });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const heldOnes = holdFacts();
    const receivedOne = heldOnes.recevoir({ projet: PARADE, demande: 0, a: facts.lu, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    // Le bloc `attend` de `status` : c'est lui qui dit qu'une carte t'attend.
    const status = ["projet     parade", "cuisine    ouverte", "", "attend     1 décision attend le chef", "  #50  depuis 1 h  une décision à prendre sur le format", "fin attend", "", "rail       0 en attente", "", ""].join("\n");
    const withIt = heldOnes.attendre(putAPart({ projet: PARADE, demande: 0, a: facts.lu, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
    vue.dire("surFaits", { ...withIt, demande: vue.dernier("faits")[0] as number });
    await repos();
    await openCard(vue, 50);
    return vue;
  };
  const blocks = (vue: Played) => card(vue).dessous("section").map((pose) => pose.className);

  test("sur une carte Await, la question et ses choix sont en tête, au-dessus du corps de l'issue", async () => {
    const vue = await openAwait(QUESTION);
    const order = blocks(vue);
    assert.ok(order.includes("question") && order.includes("discussion"));
    assert.ok(order.indexOf("question") < order.indexOf("discussion"));
    const question = card(vue).dessous("section").find((pose) => pose.className === "question") ?? assert.fail("pas de question");
    assert.ok(question.textContent.includes("Quel format garde-t-on ?"));
    assert.deepEqual(question.dessous("button").filter((pose) => pose.className === "choix").map((pose) => pose.textContent), ["A) CSV", "B) JSON"]);
  });

  test("sur une carte qui n'est pas Await, aucun bloc de question", async () => {
    const vue = await open({ lireDiscussion: () => readEntry(), lireQuestion: () => QUESTION });
    await openCard(vue, 21);
    assert.ok(!blocks(vue).includes("question"));
    assert.equal(vue.appels.filter(({ geste: action }) => action === "lireQuestion").length, 0);
  });
});
