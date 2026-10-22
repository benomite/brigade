// La carte de TODO, sur le rail du projet (#1281, épique #1277) : la vue jouée telle qu'elle est, devant
// un faux document (aides/fausse-vue.ts), sur ce que le process principal range des faits de la box
// (faits.ts, carte-todo.ts). Une carte que le runtime a laissée entrer dans TODO montre sa question, un
// bouton par choix, un champ de texte libre et son bouton « send » ; une validation de design montre ses
// captures avant et après sur la carte même, un choix de produit sans écran n'a pas de zone de captures.
// Un clic sur un choix envoie la réponse, et la carte quitte TODO sans autre clic.
// Le module de la carte est aussi lu seul, sur un faux document (vue/carte-todo.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CarteVue } from "../../../runtime/src/etat.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { carteDeTodo, carteLue, type Rendu } from "../../src/carte-todo.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { apresRendu, CHAMP, ENVOYER, EN_ROUTE, poserCarteDeTodo, REPOS } from "../../src/vue/carte-todo.js";
import { Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const CAPTURE = (moment: string) => `https://github.com/chef/parade/blob/5d41402abc4b2a76b9719d911017c592/docs/captures/12/formulaire-${moment}.png?raw=true`;

// Les deux cartes telles que le runtime les donne dans `attend[].carte` : leur type est le sien.
const DESIGN = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field.", suite: "resume" },
  ],
  captures: { complet: true, ecrans: [{ ecran: "formulaire", avant: CAPTURE("avant"), apres: CAPTURE("apres") }] },
} satisfies CarteVue;
const PRODUIT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
  captures: null,
} satisfies CarteVue;

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
  ],
  cooks: [],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT },
  ],
};

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
// Les faits que la box rend, en JSON, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function recevoir(vue: Jouee, faits: unknown = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
// La colonne TODO, son compte et ses bons.
const todo = (vue: Jouee): Faux => vue.element("rail").dessous("section").find((colonne) => colonne.className === "colonne" && colonne.dessous("span")[0]?.textContent === "TODO") ?? assert.fail("pas de colonne TODO");
const compte = (vue: Jouee) => todo(vue).dessous("h4")[0]?.dessous("span")[1]?.textContent;
const bon = (vue: Jouee, ticket: number): Faux | undefined => todo(vue).dessous("li").find((pose) => pose.className === "bon" && pose.dessous("button")[0]?.textContent === `#${ticket}`);
const carte = (vue: Jouee, ticket: number): Faux => bon(vue, ticket)?.dessous("section").find((pose) => pose.className === "carte-todo") ?? assert.fail(`pas de carte de TODO sur #${ticket}`);
const bouton = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const choix = (ou: Faux) => ou.dessous("button").filter((pose) => pose.className === "choix");
const champ = (ou: Faux): Faux => ou.dessous("textarea")[0] ?? assert.fail("pas de champ de texte libre");

describe("la carte de TODO, sur le rail du projet", () => {
  test("une carte montre sa question, puis un bouton par choix, dans l'ordre du runtime", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    for (const [ticket, donnee] of [[12, DESIGN], [21, PRODUIT]] as const) {
      const posee = carte(vue, ticket);
      assert.equal(posee.dessous("p").find((pose) => pose.className === "question-carte")?.textContent, donnee.question);
      assert.deepEqual(
        choix(posee).map((pose) => pose.textContent),
        donnee.choix.map(({ texte }) => texte),
      );
    }
    // Ce qu'on attend du chef, en tête du bon, dans les mots de l'app.
    assert.ok(bon(vue, 12)?.dessous("p").some((pose) => pose.className === "ligne-carte" && pose.textContent === "Validate its screen: answer its question."));
    assert.ok(bon(vue, 21)?.dessous("p").some((pose) => pose.className === "ligne-carte" && pose.textContent === "A product choice is yours: answer its question."));
  });

  test("le prix d'un choix est au survol, jamais écrit sous le bouton : un merge le dit", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const [merge] = choix(carte(vue, 12));
    const aide = merge?.parentElement?.dessous("button").find((pose) => pose.className === "aide");
    assert.match(aide?.ariaLabel ?? "", /merged into the integration branch/);
    assert.doesNotMatch(carte(vue, 12).dessous("p").map((pose) => pose.textContent).join("\n"), /merged/);
  });

  test("une carte a un champ de texte libre et son bouton « send », inactif tant que le champ est vide", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const posee = carte(vue, 21);
    assert.equal(champ(posee).placeholder, CHAMP);
    assert.equal(bouton(posee, ENVOYER).disabled, true);
    champ(posee).value = "Both: one per project, plus a summary.";
    champ(posee).declencher("input");
    assert.equal(bouton(posee, ENVOYER).disabled, false);
  });

  test("une validation de design montre ses captures avant et après sur la carte ; une carte sans écran n'a pas de zone de captures", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    await repos();
    const design = carte(vue, 12);
    const paire = design.dessous("div").find((pose) => pose.className === "captures") ?? assert.fail("pas de captures sur la carte de design");
    assert.deepEqual(
      paire.dessous("figure").map((figure) => figure.dataset.moment),
      ["avant", "apres"],
    );
    assert.equal(paire.dessous("img").length, 2, "les deux images sont lues sans un clic");
    assert.deepEqual(vue.dernier("lireCapture").slice(0, 2), [PARADE, 12]);
    // Les captures du bon ne sont posées qu'une fois : sous la question.
    assert.equal(bon(vue, 12)?.dessous("figure").length, 2);

    const produit = bon(vue, 21) ?? assert.fail("pas de bon #21");
    assert.equal(produit.dessous("figure").length, 0);
    assert.ok(!produit.dessous("div").some((pose) => pose.className === "captures"));
    assert.ok(!produit.dessous("p").some((pose) => pose.className === "captures-manquantes"));
  });

  test("un clic sur un choix envoie la réponse, une fois, et la carte quitte TODO sans autre clic", async () => {
    const vue = await ouvrir({ repondreCarte: () => ({ repondue: true, dit: "#21: card answered, choice 2" }) });
    recevoir(vue);
    assert.equal(compte(vue), "2");
    const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    choix(carte(vue, 21))[1]?.click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: PRODUIT.question, choix: 2 }]);
    assert.equal(vue.appels.filter(({ geste }) => geste === "repondreCarte").length, 1);
    assert.equal(bon(vue, 21), undefined, "la carte répondue a quitté TODO");
    assert.equal(compte(vue), "1");
    assert.ok(bon(vue, 12) !== undefined, "l'autre carte reste");
    // `facts` est relu tout de suite : la lecture suivante range le ticket là où il en est.
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
    // Tant que les faits lus portent la même carte, elle reste hors de TODO ; la lecture qui ne la porte plus l'oublie.
    recevoir(vue);
    assert.equal(bon(vue, 21), undefined);
    recevoir(vue, { ...FAITS, attend: FAITS.attend?.filter(({ ticket }) => ticket !== 21) });
    recevoir(vue);
    assert.ok(bon(vue, 21) !== undefined, "revenue avec une lecture neuve, elle se pose de nouveau");
  });

  test("le texte libre part par « send », tel que le chef l'a tapé", async () => {
    const vue = await ouvrir({ repondreCarte: () => ({ repondue: true, dit: "#12: card answered" }) });
    recevoir(vue);
    const posee = carte(vue, 12);
    champ(posee).value = "Merge it, but the label must say “SIRET number”.";
    champ(posee).declencher("input");
    bouton(posee, ENVOYER).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 12, { question: DESIGN.question, texte: "Merge it, but the label must say “SIRET number”." }]);
    assert.equal(bon(vue, 12), undefined);
  });

  test("en route, les choix et le champ attendent : un second clic ne part pas", async () => {
    let repondre: (rendu: Rendu) => void = () => {};
    const vue = await ouvrir({ repondreCarte: () => new Promise<Rendu>((rendre) => (repondre = rendre)) as unknown as Rendu });
    recevoir(vue);
    choix(carte(vue, 21))[0]?.click();
    await repos();
    const posee = carte(vue, 21);
    assert.ok(choix(posee).every((pose) => pose.disabled));
    assert.equal(champ(posee).disabled, true);
    assert.ok(posee.dessous("span").some((pose) => pose.textContent === EN_ROUTE));
    choix(posee)[1]?.click();
    assert.equal(vue.appels.filter(({ geste }) => geste === "repondreCarte").length, 1);
    repondre({ repondue: true, dit: "" });
    await repos();
    assert.equal(bon(vue, 21), undefined);
  });

  test("refusée, la carte reste dans TODO avec ses gestes, et dit pourquoi en une ligne — le détail au survol", async () => {
    const detail = "$ ssh -o BatchMode=yes -- box brigade parade rail choose 21 1\n#21 is not touched: a cook is working on #21\n→ exit code 1";
    const vue = await ouvrir({ repondreCarte: () => ({ refus: "nothing was recorded — #21 is not touched: a cook is working on #21", detail }) });
    recevoir(vue);
    choix(carte(vue, 21))[0]?.click();
    await repos();
    const posee = carte(vue, 21);
    const refus = posee.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(refus.dessous("span")[0]?.textContent, "nothing was recorded — #21 is not touched: a cook is working on #21");
    assert.equal(refus.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, detail);
    assert.ok(choix(posee).every((pose) => !pose.disabled));
    assert.equal(compte(vue), "2");
  });

  test("une entrée de TODO sans carte du runtime n'a ni question, ni choix, ni champ", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...FAITS, attend: FAITS.attend?.map(({ carte: _, decision: __, ...reste }) => reste) });
    for (const ticket of [12, 21]) assert.ok(!(bon(vue, ticket)?.dessous("section") ?? []).some((pose) => pose.className === "carte-todo"));
  });
});

describe("le module de la carte, sur un faux document", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const rien = { repondre: () => {}, ecrire: () => {} };
  const todoDe = (brute: CarteVue) => carteDeTodo(carteLue(brute) ?? assert.fail("carte illisible"));

  test("répondue, elle n'est plus posée ; au repos, sa question, ses choix, son champ et ses captures données", () => {
    const capture = new Faux("div");
    assert.deepEqual(poserCarteDeTodo(doc, 12, todoDe(DESIGN), { etape: "repondue", reponse: { question: DESIGN.question, choix: 1 } }, { captures: [], brouillon: "", cle: "p#12" }, rien), []);
    const [posee] = poserCarteDeTodo(doc, 12, todoDe(DESIGN), REPOS, { captures: [capture], brouillon: "déjà tapé", cle: "p#12" }, rien) as Faux[];
    assert.equal(posee?.dataset.sorte, "design");
    assert.ok(posee?.children.includes(capture), "les captures sont posées sur la carte");
    assert.equal(posee?.dessous("textarea")[0]?.value, "déjà tapé");
    assert.equal(posee?.dessous("textarea")[0]?.dataset.cle, "p#12");
    assert.equal(bouton(posee as Faux, ENVOYER).disabled, false);
  });

  test("l'étape qui suit la réponse du process principal", () => {
    const reponse = { question: PRODUIT.question, choix: 1 };
    assert.deepEqual(apresRendu(reponse, { repondue: true, dit: "" }), { etape: "repondue", reponse });
    assert.deepEqual(apresRendu(reponse, { refus: "non", detail: "d" }), { etape: "refus", dit: "non", detail: "d" });
    assert.equal(apresRendu(reponse, undefined).etape, "refus");
  });
});
