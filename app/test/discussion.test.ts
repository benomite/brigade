// L'issue d'un ticket et sa discussion, sur la fiche de toute carte (#684) : le corps puis les
// commentaires dans l'ordre, chacun avec son auteur et sa date, le markdown rendu ; et le
// commentaire du chef, posté sur l'issue par la box (`pass <ticket> comment <texte>`, #683) — au
// clic, et seulement au clic. Le process principal est joué contre un faux `ssh` qui lance la
// commande dans un vrai `sh`, comme la box ; la vue, telle qu'elle est, devant un faux document.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { lancerGeste, type Rendu } from "../src/box.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { commenter, commenteDe, discussionDe, lireDiscussion, type Commente, type Discussion, type Lancer } from "../src/discussion.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { gestesDeCarte } from "../src/gestes-fiche.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const PARADE = "parade";
const PROJET = { nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } };
const DELAI = 60_000;

// Ce que `pass 21 issue` rend (runtime/src/issue-ticket.ts) : le corps, puis les commentaires du plus ancien au plus récent.
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
const lu = (sortie: unknown, code = 0): Rendu => ({
  lance: "$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade pass 21 issue",
  erreur: code === 0 ? null : Object.assign(new Error("Command failed"), { code, killed: false, cmd: "ssh" }),
  sortie: typeof sortie === "string" ? sortie : `${JSON.stringify(sortie)}\n`,
  erreurs: "",
});

describe("la discussion de l'issue, telle que `pass <ticket> issue` la rend", () => {
  test("le corps, puis les commentaires dans l'ordre chronologique, chacun avec son auteur et sa date, le markdown rendu", () => {
    const discussion = discussionDe(lu(ISSUE), DELAI);
    assert.ok(!("sans" in discussion));
    assert.equal(discussion.titre, "L'export du journal");
    assert.equal(discussion.ouverte, true);
    assert.deepEqual(
      discussion.messages.map(({ auteur, at, corps }) => [auteur, at, corps === true]),
      [
        ["benomite", "2026-10-14 08:00 UTC", true],
        ["benomite", "2026-10-14 08:01 UTC", false],
        ["brigade-pass[bot]", "2026-10-14 11:30 UTC", false],
        ["a deleted GitHub account", "2026-10-14 12:00 UTC", false],
      ],
    );
    assert.deepEqual(discussion.messages[0]?.blocs, [
      { titre: 2, contenu: [{ texte: "Contexte" }] },
      { paragraphe: [{ texte: "Exporter le journal en " }, { gras: [{ texte: "CSV" }] }, { texte: "." }] },
      { liste: [{ blocs: [{ paragraphe: [{ texte: "une ligne par événement" }] }] }, { blocs: [{ paragraphe: [{ code: "at" }, { texte: " en UTC" }] }] }] },
    ]);
    // Un commentaire fait des seuls marqueurs du runtime n'a rien de visible.
    assert.deepEqual(discussion.messages[3]?.blocs, []);
    assert.deepEqual(discussion.liens, ["https://github.com/benomite/brigade/pull/31"]);
  });

  test("une carte sans issue sort en 1 avec sa raison : la fiche la dit — ce n'est pas une panne", () => {
    assert.deepEqual(discussionDe(lu({ found: false, reason: "#21 is a pull request, not an issue" }, 1), DELAI), { sans: "no issue to read: #21 is a pull request, not an issue" });
  });

  test("une panne, une box pas jointe ou un runtime qui ne connaît pas `issue` : la fiche dit ce qui a été lancé et rendu", () => {
    const panne = discussionDe({ ...lu("", 1), erreurs: "brigade : l'issue de #21 n'a pas été lue — gh: HTTP 502\n" }, DELAI);
    assert.ok("sans" in panne);
    assert.match(panne.sans, /^not read: \$ ssh .* pass 21 issue\nbrigade : l'issue de #21 n'a pas été lue — gh: HTTP 502\n\n→ exit code 1$/);
    assert.ok("sans" in discussionDe(lu("usage : …", 2), DELAI));
  });

  test("une sortie illisible n'est pas lue : la fiche dit pourquoi", () => {
    for (const sortie of ["", "pas du json", "{}", JSON.stringify({ found: true, issue: { title: "t", comments: "x" } }), JSON.stringify({ found: true, issue: { ...ISSUE.issue, comments: [{ author: 1 }] } })]) {
      assert.deepEqual(discussionDe(lu(sortie), DELAI), { sans: "not read: the box did not return the issue in the expected shape" }, sortie);
    }
  });
});

describe("ce que `pass <ticket> comment <texte>` a rendu", () => {
  test("posté : la box dit ce qu'il coûte", () => {
    assert.deepEqual(commenteDe(lu({ done: true, price: "a comment is posted on issue #21" }), DELAI), { poste: true, prix: "a comment is posted on issue #21" });
  });

  test("refusé par la box : rien n'est posté, et sa raison est dite", () => {
    assert.deepEqual(commenteDe(lu({ done: false, reason: "#21 has no GitHub issue: it does not exist, or is gone", price: "none: nothing was posted" }, 1), DELAI), { poste: false, refus: "nothing was posted: #21 has no GitHub issue: it does not exist, or is gone" });
  });

  test("une panne ou un `ssh` arrêté : rien ne dit qu'il n'est pas parti — la fiche relit la discussion avant qu'on réécrive", () => {
    const rendu = commenteDe({ ...lu("", 1), erreurs: "brigade : GitHub n'a pas confirmé le commentaire sur #21\n" }, DELAI);
    assert.equal(rendu.poste, false);
    assert.ok(!rendu.poste && rendu.peutEtre === true && rendu.refus.startsWith("not confirmed — it may have been posted"));
    assert.ok(!rendu.poste && rendu.refus.includes("GitHub n'a pas confirmé le commentaire sur #21"));
  });
});

// Un faux `ssh` qui lance la commande distante dans un vrai `sh`, avec un faux geste `brigade` qui
// écrit ses arguments, un par un, et rend ce que le test lui donne.
function box(t: TestContext, reponse: unknown, code = 0) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-discussion-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  mkdirSync(join(racine, "bin"));
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nwhile [ "$1" != "--" ]; do shift; done\nshift\nprintf '%s\\n' "$2" >> '${racine}/lancees'\nPATH='${racine}/bin':"$PATH" exec sh -c "$2"\n`);
  writeFileSync(join(racine, "bin/brigade"), `#!/bin/sh\nnode -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- "$@" >> '${racine}/recus'\ncat '${racine}/reponse'\nexit ${code}\n`);
  writeFileSync(join(racine, "reponse"), `${JSON.stringify(reponse)}\n`);
  chmodSync(ssh, 0o755);
  chmodSync(join(racine, "bin/brigade"), 0o755);
  const lancer: Lancer = (servi, commande) => lancerGeste({ ssh, delaiMs: DELAI, connexionS: 10 }, servi, commande);
  const lire = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  // Ce que le geste a reçu sur la box, chaque appel ses arguments.
  const recus = () => lire("recus").split("\n").filter(Boolean).map((ligne) => JSON.parse(ligne) as string[]);
  return { lancer, recus, lancees: () => lire("lancees") };
}

describe("lire l'issue et commenter, sur la box du projet", () => {
  test("la lecture lance `brigade <projet> pass <ticket> issue`, et rien d'autre : aucune écriture", async (t) => {
    const { lancer, recus } = box(t, ISSUE);
    const discussion = await lireDiscussion(lancer, PROJET, 21, DELAI);
    assert.ok(!("sans" in discussion) && discussion.messages.length === 4);
    assert.deepEqual(recus(), [[PARADE, "pass", "21", "issue"]]);
  });

  test("le commentaire arrive sur la box en un seul argument, tel qu'il est écrit : guillemets, retours à la ligne et `$(…)` compris, rien n'est exécuté", async (t) => {
    const { lancer, recus } = box(t, { done: true, price: "a comment is posted on issue #21" });
    const texte = "  Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\r\nfin  ";
    const rendu = await commenter(lancer, PROJET, 21, texte, DELAI);
    assert.deepEqual(rendu, { poste: true, prix: "a comment is posted on issue #21" });
    assert.deepEqual(recus(), [[PARADE, "pass", "21", "comment", "Contexte : l'export doit *aussi* sortir en JSON.\n\n- \"guillemets\" et 'apostrophes'\n- $(touch /tmp/pas-ca) `whoami` ; rm -rf ~\nfin"]]);
  });

  test("un refus de la box est rendu tel qu'elle le dit", async (t) => {
    const { lancer } = box(t, { done: false, reason: "#21 is a pull request, not an issue", price: "none: nothing was posted" }, 1);
    assert.deepEqual(await commenter(lancer, PROJET, 21, "du contexte", DELAI), { poste: false, refus: "nothing was posted: #21 is a pull request, not an issue" });
  });

  test("rien ne part d'un texte vide, d'un projet sans box ou qui ne s'ouvre pas, ni sans ticket : la box n'est pas jointe", async (t) => {
    const { lancer, lancees } = box(t, { done: true, price: "" });
    for (const [projet, ticket, texte] of [
      [PROJET, 21, ""],
      [PROJET, 21, "  \n\t "],
      [PROJET, 21, undefined],
      [PROJET, 21, "a\0b"],
      [PROJET, 21, "x".repeat(65_537)],
      [PROJET, "21", "du contexte"],
      [PROJET, 0, "du contexte"],
      [{ nom: PARADE, dossier: "/tmp/parade" }, 21, "du contexte"],
      [{ ...PROJET, refus: "illisible" }, 21, "du contexte"],
    ] as const) {
      const rendu = await commenter(lancer, projet, ticket, texte, DELAI);
      assert.ok(!rendu.poste && rendu.refus.startsWith("nothing was posted: "), JSON.stringify([ticket, texte?.slice(0, 20)]));
    }
    assert.equal(lancees(), "");
    assert.deepEqual(await lireDiscussion(lancer, { nom: PARADE, dossier: "/tmp/parade" }, 21, DELAI), { sans: "no box for this project: the app has nothing to read" });
    assert.equal(lancees(), "");
  });
});

// La vue, jouée telle qu'elle est.
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
  version: null,
  miseEnService: { etat: "aucune", depuis: null, coupe: false, enVol: [], tokens: 0 },
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
  const bon = vue.element("rail").dessous("li").find((li) => li.className === "bon" && li.children[0]?.children[0]?.textContent === `#${numero}`) ?? assert.fail(`pas de bon #${numero}`);
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
const lue = (): Discussion => discussionDe(lu(ISSUE), DELAI);
const avecCommentaire = (texte: string): Discussion => discussionDe(lu({ ...ISSUE, issue: { ...ISSUE.issue, comments: [...ISSUE.issue.comments, { author: "benomite", at: "2026-10-14T13:00:00Z", body: texte }] } }), DELAI);

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

  test("tant que l'issue n'est pas lue, la fiche le dit ; une issue qui ne se lit pas dit pourquoi, et n'offre pas de champ", async () => {
    let rendre: (discussion: Discussion) => void = () => {};
    const vue = await ouvrir({ lireDiscussion: () => new Promise((resoudre) => (rendre = resoudre)) as never });
    await ouvrirFiche(vue, 21);
    assert.equal(discussion(vue).dessous("p")[0]?.textContent, "reading issue #21…");
    rendre({ sans: "no issue to read: #21 is a pull request, not an issue" });
    await repos();
    assert.equal(discussion(vue).dessous("p")[0]?.textContent, "no issue to read: #21 is a pull request, not an issue");
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
    rendre({ poste: true, prix: "a comment is posted on issue #21, under the box's own gh account" });
    await repos();
    await repos();
    assert.equal(champ(vue).value, "");
    assert.equal(discussion(vue).dessous("p").find((p) => p.className === "postee")?.textContent, "comment posted on #21 — a comment is posted on issue #21, under the box's own gh account");
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
    // Rien ne dit qu'il n'est pas parti : la discussion n'est relue que si la box ne l'a pas dit.
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
