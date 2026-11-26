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
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { commenter, demanderAuSecond, noteDeLaQuestion, PRIX, type Poster, type Commente, type Discussion } from "../src/discussion.ts";
import { mettreAPart } from "../src/attend.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Lue } from "../src/question.ts";
import type { Terminal } from "../src/terminaux.ts";
import { discussionDe } from "./aides/fiches-dites.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const RACINE = resolve(import.meta.dirname, "..", "..");
const PARADE = "parade";
const PROJET = { nom: PARADE, dossier: "/tmp/parade" };

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
function poste(rendre: (ticket: number, texte: string) => { url: string | null } | { raison: string } = (ticket) => ({ url: `https://github.com/chef/parade/issues/${ticket}#issuecomment-7001` })) {
  const postes: [number, string][] = [];
  const poster: Poster = async (ticket, texte) => (postes.push([ticket, texte]), rendre(ticket, texte));
  return { postes, poster };
}

describe("le commentaire du chef part sur l'issue du ticket, à son nom (#2061)", () => {
  test("le texte part tel qu'il est écrit, ses bords retirés : guillemets, retours à la ligne et `$(…)` compris — et la fiche dit ce qu'il coûte", async () => {
    const { postes, poster } = poste();
    const texte = "  Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\r\nfin  ";
    assert.deepEqual(await commenter(poster, PROJET, 21, texte), { poste: true, prix: PRIX });
    assert.deepEqual(postes, [[21, "Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\nfin"]]);
  });

  test("GitHub qui refuse : rien n'est posté, et sa raison est dite telle quelle, sans son point final", async () => {
    const { poster } = poste(() => ({ raison: "The comment could not be posted on #21 of chef/parade: the comment: HTTP 403 — Resource not accessible." }));
    assert.deepEqual(await commenter(poster, PROJET, 21, "du contexte"), { poste: false, refus: "nothing was posted: the comment could not be posted on #21 of chef/parade: the comment: HTTP 403 — Resource not accessible" });
  });

  test("posté sans adresse rendue : c'est posté quand même", async () => {
    const { poster } = poste(() => ({ url: null }));
    assert.deepEqual(await commenter(poster, PROJET, 21, "du contexte"), { poste: true, prix: PRIX });
  });

  test("rien ne part d'un texte vide, d'un projet qui ne s'ouvre pas, ni sans ticket : rien n'est posté", async () => {
    const { postes, poster } = poste(() => assert.fail("rien ne devait partir"));
    for (const [projet, ticket, texte] of [
      [PROJET, 21, ""],
      [PROJET, 21, "  \n\t "],
      [PROJET, 21, undefined],
      [PROJET, 21, "a\0b"],
      [PROJET, 21, "x".repeat(65_537)],
      [PROJET, "21", "du contexte"],
      [PROJET, 0, "du contexte"],
      [{ ...PROJET, refus: "illisible" }, 21, "du contexte"],
    ] as const) {
      const rendu = await commenter(poster, projet, ticket, texte);
      assert.ok(!rendu.poste && rendu.refus.startsWith("nothing was posted: "), JSON.stringify([ticket, texte?.slice(0, 20)]));
    }
    assert.deepEqual(postes, []);
  });

  test("un projet sans rien d'autre que son dossier commente quand même : seule l'issue compte", async () => {
    const { postes, poster } = poste();
    assert.deepEqual(await commenter(poster, { nom: PARADE, dossier: "/tmp/parade" }, 21, "du contexte"), { poste: true, prix: PRIX });
    assert.deepEqual(postes, [[21, "du contexte"]]);
  });
});

// La vue, jouée telle qu'elle est.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
// Ce que `inscrire` rend d'une demande écrite : le second la porte, la note la dit.
const SECOND_ECRIT: Terminal = { ...SECOND, note: "demande écrite dans le second — appuie sur Entrée pour l'envoyer", demandeEcrite: true };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const FAITS: Faits = {
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

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], gestesDeFiche: (carte) => gestesDeCarte(carte), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: FAITS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}
const fiche = (vue: Jouee) => vue.element("fiche");
const ouvrirFiche = async (vue: Jouee, numero: number) => {
  const bon = carteDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`);
  bon.click();
  await repos();
};
const discussion = (vue: Jouee): Faux => fiche(vue).dessous("section").find((pose) => pose.className === "discussion") ?? assert.fail("pas de discussion sur la fiche");
// Chaque message de la discussion : sa tête — qui, quoi, quand —, puis son texte rendu.
const messages = (vue: Jouee) => (discussion(vue).dessous("ol")[0]?.children ?? []).map((li) => [li.children[0]?.textContent, li.children[1]?.textContent]);
const champ = (vue: Jouee) => discussion(vue).dessous("textarea")[0] ?? assert.fail("pas de champ de commentaire");
const poster = (vue: Jouee) => discussion(vue).dessous("button").find((pose) => pose.dataset.geste === "commentaire") ?? assert.fail("pas de bouton d'envoi");
const ecrire = (vue: Jouee, texte: string) => {
  champ(vue).value = texte;
  champ(vue).declencher("input");
};
const lue = (): Discussion => discussionDe(ISSUE);
const avecCommentaire = (texte: string): Discussion => discussionDe({ ...ISSUE, issue: { ...ISSUE.issue, comments: [...ISSUE.issue.comments, { author: "benomite", at: "2026-10-14T13:00:00Z", body: texte }] } });

describe("la fiche de toute carte montre l'issue et sa discussion (#684)", () => {
  test("le corps, puis les commentaires dans l'ordre, avec leur auteur et leur date — quelle que soit la colonne de la carte", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue() });
    for (const numero of [14, 21, 31]) {
      await ouvrirFiche(vue, numero);
      assert.deepEqual(vue.dernier("lireDiscussion"), [PARADE, numero]);
      assert.deepEqual(messages(vue), [
        ["benomite opened the issue2026-10-14 08:00 UTC", "ContexteExporter le journal en CSV.une ligne par événementat en UTC"],
        ["benomite commented2026-10-14 08:01 UTC", "attend : rienzone : runtime/src"],
        ["brigade-pass[bot] commented2026-10-14 11:30 UTC", "Pass — rouge. Voir https://github.com/benomite/brigade/pull/31"],
        ["a deleted GitHub account commented2026-10-14 12:00 UTC", "nothing visible — only markers GitHub does not show"],
      ], `#${numero}`);
      fiche(vue).declencher("keydown", { key: "Escape" });
    }
  });

  test("le markdown est rendu en éléments — titre, gras, liste, code, lien —, pas en texte brut", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), ouvrirLien: () => true });
    await ouvrirFiche(vue, 21);
    const [corps, , pass] = discussion(vue).dessous("ol")[0]?.children ?? [];
    const rendu = corps?.children[1] ?? assert.fail("pas de corps");
    assert.deepEqual(rendu.children.map(({ balise }) => balise), ["h2", "p", "ul"]);
    assert.equal(rendu.dessous("strong")[0]?.textContent, "CSV");
    assert.deepEqual(rendu.dessous("li").map((li) => li.textContent), ["une ligne par événement", "at en UTC"]);
    assert.equal(rendu.dessous("code")[0]?.textContent, "at");
    assert.ok(!rendu.textContent.includes("**") && !rendu.textContent.includes("##") && !rendu.textContent.includes("<!--"));
    // Un lien ne navigue pas dans l'app : un clic demande au process principal de l'ouvrir.
    const lien = pass?.dessous("a")[0] ?? assert.fail("pas de lien");
    assert.equal(lien.textContent, "https://github.com/benomite/brigade/pull/31");
    lien.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLien"), [PARADE, 21, "https://github.com/benomite/brigade/pull/31"]);
  });

  test("tant que l'issue n'est pas lue, la fiche le dit ; une issue qui ne se lit pas le dit en une ligne, pourquoi au survol, et n'offre pas de champ", async () => {
    let rendre: (discussion: Discussion) => void = () => {};
    const vue = await ouvrir({ lireDiscussion: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    await ouvrirFiche(vue, 21);
    assert.equal(discussion(vue).dessous("p")[0]?.textContent, "Reading issue #21…");
    rendre({ sans: "no issue to read: #21 is a pull request, not an issue" });
    await repos();
    // Une ligne courte ; pourquoi, au survol de son aide (briques.js).
    const ligne = discussion(vue).dessous("p")[0] ?? assert.fail("pas de ligne");
    assert.deepEqual([ligne.className, ligne.children[0]?.textContent], ["indisponible", "Discussion not reached."]);
    assert.equal((ligne.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, "no issue to read: #21 is a pull request, not an issue");
    assert.deepEqual(discussion(vue).dessous("textarea"), []);
  });

  test("le bouton est inactif tant que le champ est vide ; rien ne part sans son clic", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), commenter: () => ({ poste: true, prix: "" }) });
    await ouvrirFiche(vue, 21);
    assert.equal(champ(vue).value, "");
    assert.equal(poster(vue).disabled, true);
    ecrire(vue, "   \n ");
    assert.equal(poster(vue).disabled, true);
    ecrire(vue, "Le CSV doit aussi porter le run.");
    assert.equal(poster(vue).disabled, false);
    // Écrire n'envoie rien ; une fiche reposée garde le texte.
    fiche(vue).declencher("keydown", { key: "Escape" });
    await ouvrirFiche(vue, 21);
    assert.equal(champ(vue).value, "Le CSV doit aussi porter le run.");
    assert.equal(vue.appels.filter(({ geste }) => geste === "commenter").length, 0);
  });

  test("posté : le champ se vide, la discussion est relue et le commentaire y apparaît", async () => {
    let posteSurGitHub: string | undefined;
    let rendre: (rendu: Commente) => void = () => {};
    const vue = await ouvrir({
      lireDiscussion: () => (posteSurGitHub === undefined ? lue() : avecCommentaire(posteSurGitHub)),
      commenter: (_, __, texte) => new Promise((resoudre) => (rendre = (rendu) => ((posteSurGitHub = texte), resoudre(rendu)))) as never,
    });
    await ouvrirFiche(vue, 21);
    ecrire(vue, "Le CSV doit aussi porter le **run**.");
    poster(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("commenter"), [PARADE, 21, "Le CSV doit aussi porter le **run**."]);
    // En route : ni le champ ni le bouton ne servent, et la fiche le dit.
    assert.equal(champ(vue).disabled, true);
    assert.equal(poster(vue).disabled, true);
    assert.ok(discussion(vue).dessous("p").some((p) => p.textContent === "posting your comment on the issue…"));
    rendre({ poste: true, prix: "a comment is posted on issue #21, under the station's own gh account" });
    await repos();
    await repos();
    assert.equal(champ(vue).value, "");
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "postee")?.textContent, "comment posted on #21 — a comment is posted on issue #21, under the station's own gh account");
    assert.deepEqual(messages(vue).at(-1), ["benomite commented2026-10-14 13:00 UTC", "Le CSV doit aussi porter le run."]);
    assert.equal(vue.appels.filter(({ geste }) => geste === "lireDiscussion").length, 2);
  });

  test("un échec garde le texte dans le champ et le dit sous lui, en rouge", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), commenter: () => ({ poste: false, refus: "nothing was posted: #21 is a pull request, not an issue" }) });
    await ouvrirFiche(vue, 21);
    ecrire(vue, "du contexte");
    poster(vue).click();
    await repos();
    assert.equal(champ(vue).value, "du contexte");
    assert.equal(poster(vue).disabled, false);
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was posted: #21 is a pull request, not an issue");
    // Rien n'est parti : la discussion n'est pas relue.
    assert.equal(vue.appels.filter(({ geste }) => geste === "lireDiscussion").length, 1);
  });

  test("un envoi qui lève — le process principal injoignable — garde aussi le texte, et le dit", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), commenter: () => Promise.reject(new Error("ipc fermé")) as never });
    await ouvrirFiche(vue, 21);
    ecrire(vue, "du contexte");
    poster(vue).click();
    await repos();
    assert.equal(champ(vue).value, "du contexte");
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was posted: ipc fermé");
  });
});

// « ask the second » (#686, #2167) : `/brigade:ask <ticket> ` — une espace au bout — écrit dans le second du projet,
// sans Entrée ; le chef tape sa question à la suite. Rien ne part sur GitHub ni sur la box.
describe("demander au second depuis la fiche : `/brigade:ask <ticket> ` écrit dans le second, sans Entrée (#2167)", () => {
  const inscrit = () => {
    const ecrites: string[] = [];
    return { ecrites, inscrire: (commande: string) => (ecrites.push(commande), SECOND_ECRIT) };
  };

  test("le ticket 2087 : exactement `/brigade:ask 2087 `, rien d'autre — ni Entrée, ni retour à la ligne — et le second écrit est rendu", () => {
    const { ecrites, inscrire } = inscrit();
    assert.equal(demanderAuSecond(inscrire, PROJET, 2087), SECOND_ECRIT);
    assert.deepEqual(ecrites, ["/brigade:ask 2087 "]);
    assert.doesNotMatch(ecrites[0] ?? "", /[\r\n]/);
  });

  test("le même geste pour toute carte qui a un numéro, quelle que soit la station du projet", () => {
    for (const projet of [PROJET, { ...PROJET, depot: "chef/parade" }, { nom: "ailleurs", dossier: "/tmp/ailleurs", depot: "chef/ailleurs", base: "main" }]) {
      for (const ticket of [1, 21, 2087]) {
        const { ecrites, inscrire } = inscrit();
        demanderAuSecond(inscrire, projet, ticket);
        assert.deepEqual(ecrites, [`/brigade:ask ${ticket} `]);
      }
    }
  });

  test("le clic ne poste rien sur GitHub : ni commentaire, ni label", () => {
    // Le geste ne reçoit pas de quoi joindre GitHub : seulement ce qui écrit dans le second, le projet et le ticket.
    assert.equal(demanderAuSecond.length, 3);
    // Le canal du process principal n'appelle que lui : ni l'accès GitHub de l'app, ni le rail lu.
    const canal = /ipcMain\.handle\("demanderAuSecond"[\s\S]*?\n\}\);/.exec(readFileSync(join(RACINE, "app/src/main.ts"), "utf8"))?.[0] ?? assert.fail("pas de canal « demanderAuSecond »");
    assert.match(canal, /demanderAuSecond\(\(commande\) => terminaux\.inscrire\(vise, commande, noteDeLaQuestion\), vise, ticket\)/);
    assert.doesNotMatch(canal, /commenterLIssue|clientDesLabels|tableaux|brigade ask/);
  });

  test("ni ticket, ni projet qui s'ouvre : rien n'est écrit, et pourquoi est dit", () => {
    const { ecrites, inscrire } = inscrit();
    for (const [projet, ticket] of [
      [PROJET, "21"],
      [PROJET, 0],
      [PROJET, 1.5],
      [{ ...PROJET, refus: "illisible" }, 21],
    ] as const) {
      const rendu = demanderAuSecond(inscrire, projet, ticket);
      assert.ok("refus" in rendu && rendu.refus.startsWith("nothing was written: "), JSON.stringify(rendu));
    }
    assert.deepEqual(ecrites, []);
  });

  test("la note du second dit d'écrire la question à la suite, et avertit devant un dialogue", () => {
    assert.match(noteDeLaQuestion(), /without Enter — type your question after it/);
    assert.match(noteDeLaQuestion(true), /keystrokes/);
  });
});

const demandeAuSecond = (vue: Jouee) => discussion(vue).dessous("button").find((pose) => pose.dataset.geste === "demande-second") ?? assert.fail("pas de bouton « ask the second »");

describe("la fiche : le bouton « ask the second » et la question d'une carte Await (#686)", () => {
  test("rien ne part avant le clic ; le clic envoie l'issue et le texte du champ, sans rien recopier, et la fiche confirme", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), demanderAuSecond: () => SECOND_ECRIT });
    await ouvrirFiche(vue, 21);
    ecrire(vue, "le CSV d'abord");
    assert.equal(demandeAuSecond(vue).textContent, "ask the second");
    assert.equal(vue.appels.filter(({ geste }) => geste === "demanderAuSecond").length, 0);
    demandeAuSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAuSecond"), [PARADE, 21, "le CSV d'abord"]);
    assert.ok(discussion(vue).dessous("p").some((p) => p.className === "postee" && p.textContent.startsWith("request about #21 written in the second")));
    // Le champ garde son texte : ce n'est pas un commentaire.
    assert.equal(champ(vue).value, "le CSV d'abord");
    assert.equal(vue.appels.filter(({ geste }) => geste === "commenter").length, 0);
  });

  test("le champ vide : le bouton sert quand même, avec un contexte vide", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), demanderAuSecond: () => SECOND_ECRIT });
    await ouvrirFiche(vue, 14);
    assert.equal(demandeAuSecond(vue).disabled, false);
    demandeAuSecond(vue).click();
    await repos();
    assert.deepEqual(vue.dernier("demanderAuSecond"), [PARADE, 14, ""]);
  });

  test("le second injoignable : l'erreur s'affiche, le texte reste, rien n'est dit parti", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), demanderAuSecond: () => ({ refus: "nothing was written: the second's request was not composed — the board did not answer" }) });
    await ouvrirFiche(vue, 21);
    ecrire(vue, "du contexte");
    demandeAuSecond(vue).click();
    await repos();
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was written: the second's request was not composed — the board did not answer");
    assert.ok(!discussion(vue).dessous("p").some((p) => p.className === "postee"));
    assert.equal(champ(vue).value, "du contexte");
  });

  test("un second qui ne tourne pas : lancé, rien n'est écrit — la fiche ne dit pas la demande partie", async () => {
    const pasEcrit: Terminal = { ...SECOND, note: "the second was not running: launched (`claude --continue second`) — the command is not written into a second that is starting, click again when it is ready" };
    const vue = await ouvrir({ lireDiscussion: () => lue(), demanderAuSecond: () => pasEcrit });
    await ouvrirFiche(vue, 21);
    demandeAuSecond(vue).click();
    await repos();
    const ps = discussion(vue).dessous("p");
    assert.ok(!ps.some((p) => p.className === "postee"));
    assert.ok(ps.find((p) => p.className === "refus")?.textContent.includes("not written"));
  });

  test("un appel qui lève est dit aussi", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), demanderAuSecond: () => Promise.reject(new Error("ipc fermé")) as never });
    await ouvrirFiche(vue, 21);
    demandeAuSecond(vue).click();
    await repos();
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "refus")?.textContent, "nothing was written: ipc fermé");
  });

  const QUESTION: Lue = {
    a: "2026-10-14T12:30:00.000Z",
    question: { url: "https://github.com/benomite/brigade/issues/50#issuecomment-1", auteur: "brigade-manager", a: "2026-10-14T12:00:00Z", texte: "Quel format garde-t-on ?\nA) CSV\nB) JSON", resume: "Quel format garde-t-on ?", choix: [{ lettre: "A", texte: "CSV" }, { lettre: "B", texte: "JSON" }], depuis: [] },
  };
  const ouvrirAwait = async (lueQuestion: Lue) => {
    const faits = { ...FAITS, attend: [{ ticket: 50, titre: "Le format de l'export", url: "https://github.com/benomite/brigade/issues/50" }] };
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], gestesDeFiche: (carte) => gestesDeCarte(carte), lireDiscussion: () => lue(), lireQuestion: () => lueQuestion });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const tenus = tenirFaits();
    const recue = tenus.recevoir({ projet: PARADE, demande: 0, a: faits.lu, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    // Le bloc `attend` de `status` : c'est lui qui dit qu'une carte t'attend.
    const status = ["projet     parade", "cuisine    ouverte", "", "attend     1 décision attend le chef", "  #50  depuis 1 h  une décision à prendre sur le format", "fin attend", "", "rail       0 en attente", "", ""].join("\n");
    const avec = tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: faits.lu, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
    vue.dire("surFaits", { ...avec, demande: vue.dernier("faits")[0] as number });
    await repos();
    await ouvrirFiche(vue, 50);
    return vue;
  };
  const blocs = (vue: Jouee) => fiche(vue).dessous("section").map((pose) => pose.className);

  test("sur une carte Await, la question et ses choix sont en tête, au-dessus du corps de l'issue", async () => {
    const vue = await ouvrirAwait(QUESTION);
    const ordre = blocs(vue);
    assert.ok(ordre.includes("question") && ordre.includes("discussion"));
    assert.ok(ordre.indexOf("question") < ordre.indexOf("discussion"));
    const question = fiche(vue).dessous("section").find((pose) => pose.className === "question") ?? assert.fail("pas de question");
    assert.ok(question.textContent.includes("Quel format garde-t-on ?"));
    assert.deepEqual(question.dessous("button").filter((pose) => pose.className === "choix").map((pose) => pose.textContent), ["A) CSV", "B) JSON"]);
  });

  test("sur une carte qui n'est pas Await, aucun bloc de question", async () => {
    const vue = await ouvrir({ lireDiscussion: () => lue(), lireQuestion: () => QUESTION });
    await ouvrirFiche(vue, 21);
    assert.ok(!blocs(vue).includes("question"));
    assert.equal(vue.appels.filter(({ geste }) => geste === "lireQuestion").length, 0);
  });
});
