// La carte de TODO, côté process principal (#1281, épique #1277) : ce que `facts` donne dans
// `attend[].carte` (runtime/src/etat.ts, `CarteVue`) est lu — ou laissé de côté s'il n'en a pas la
// forme —, rangé pour la carte du rail, et la réponse du chef part sur la box par une seule commande du
// runtime : `rail choose <ticket> <n>` ou `rail answer <ticket> <texte>`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CarteVue } from "../../runtime/src/etat.ts";
import { CHANGEE, carteDeTodo, carteLue, INCONNUE, PRIX_DU_TEXTE, reponseLue, VIDE } from "../src/carte-todo.ts";
import { comprendre, tenirFaits, type Faits } from "../src/faits.ts";

const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const CAPTURE = (moment: string) => `https://github.com/chef/parade/blob/5d41402abc4b2a76b9719d911017c592/docs/captures/12/formulaire-${moment}.png?raw=true`;

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

const FAITS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12) },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21) },
  ],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), decision: { quoi: "carte", motif: "design", cause: DESIGN.question, pr: null }, carte: DESIGN },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT },
  ],
};

describe("la carte de TODO, lue dans `facts`", () => {
  test("`attend[].carte` est lue telle que le runtime la donne : sa sorte, sa question, ses choix, ses captures", () => {
    const lus = comprendre(JSON.stringify(FAITS));
    assert.ok(!("informe" in lus));
    assert.deepEqual(lus.attend?.[0]?.carte, DESIGN);
    assert.deepEqual(lus.attend?.[1]?.carte, PRODUIT);
  });

  test("une carte qui n'en a pas la forme est laissée de côté — le reste de `facts` est lu", () => {
    for (const carte of [{}, { ...PRODUIT, question: "" }, { ...PRODUIT, choix: "1. One" }, { ...PRODUIT, choix: [{ texte: "One" }, PRODUIT.choix[1]] }, "product"]) {
      const lus = comprendre(JSON.stringify({ ...FAITS, attend: [{ ...FAITS.attend[1], carte }] }));
      assert.ok(!("informe" in lus));
      assert.equal(lus.attend?.[0]?.ticket, 21);
      assert.equal(lus.attend?.[0]?.carte, undefined);
    }
    assert.equal(carteLue({ ...DESIGN, captures: "two screens" })?.captures, null);
  });

  test("rangée pour la carte du rail : chaque choix porte son prix, celui d'un merge dit qu'il ne se défait pas ; sans écran, aucune capture", () => {
    const design = carteDeTodo(DESIGN);
    assert.equal(design.sorte, "design");
    assert.deepEqual(
      design.choix.map(({ texte }) => texte),
      DESIGN.choix.map(({ texte }) => texte),
    );
    assert.match(design.choix[0]?.prix ?? "", /merged .* not undone/);
    assert.equal(design.choix[1]?.prix, PRIX_DU_TEXTE);
    assert.deepEqual(design.captures?.ecrans.map(({ avant, apres }) => [avant.livree, apres.livree]), [[true, true]]);
    assert.equal(design.captures?.incomplete, undefined);
    assert.ok(!("captures" in carteDeTodo(PRODUIT)));
  });

  test("le rail porte la carte sur le bon de TODO, et le process principal en garde la carte et les captures", () => {
    const faits = tenirFaits();
    const recue = faits.recevoir({ projet: "parade", demande: 0, a: FAITS.lu, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    assert.ok("tableau" in recue);
    const todo = recue.tableau.rail.colonnes.find(({ nom }) => nom === "TODO");
    assert.deepEqual(
      todo?.cartes.map(({ ticket, todo: carte }) => [ticket, carte?.question]),
      [
        [12, DESIGN.question],
        [21, PRODUIT.question],
      ],
    );
    assert.deepEqual(faits.carte("parade", 21), PRODUIT);
    assert.equal(faits.carte("parade", 30), undefined);
    assert.equal(faits.capture("parade", 12, "formulaire", "apres"), CAPTURE("apres"));
  });
});

// --- La réponse lue ---------------------------------------------------------------------

describe("la réponse du chef, lue avant de partir", () => {
  test("un choix garde son rang ; le texte libre ses blancs autour retirés et ses retours à la ligne de GitHub", () => {
    assert.deepEqual(reponseLue(PRODUIT, 21, { question: PRODUIT.question, choix: 2 }), { ticket: 21, choix: 2 });
    assert.deepEqual(reponseLue(DESIGN, 12, { question: DESIGN.question, texte: "  Merge it; don't touch the label.\r\n" }), { ticket: 12, texte: "Merge it; don't touch the label." });
  });

  test("rien ne part pour une carte que les faits ne portent pas, une autre question, un choix hors de la carte, un texte vide", () => {
    assert.deepEqual(reponseLue(undefined, 21, { question: PRODUIT.question, choix: 1 }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(reponseLue(PRODUIT, "21", { question: PRODUIT.question, choix: 1 }), { refus: INCONNUE, detail: "" });
    assert.deepEqual(reponseLue(PRODUIT, 21, { question: "Another question?", choix: 1 }), { refus: CHANGEE, detail: "" });
    for (const choix of [0, 3, 1.5, "1"]) assert.match((reponseLue(PRODUIT, 21, { question: PRODUIT.question, choix }) as { refus: string }).refus, /choices 1 to 2/);
    for (const texte of ["", "   ", undefined]) assert.deepEqual(reponseLue(PRODUIT, 21, { question: PRODUIT.question, texte }), { refus: VIDE, detail: "" });
  });
});

// Les faits d'un runtime qui porte des cartes de TODO : le type de la forme les tient.
void (FAITS satisfies Faits);
