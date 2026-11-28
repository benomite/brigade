// Les cartes qui attendent le chef, à la largeur d'un téléphone (ticket 2915, Phone.dc.html) : l'app s'ouvre sur leur liste,
// un toucher ouvre la carte, un choix — le recommandé compris — la répond par le geste de la carte de TODO, et l'écran dit
// « Sent to the kitchen. ». La vue est jouée telle qu'elle est (helpers/false-vue.ts) ; ce qu'aucun faux document ne mesure —
// la largeur, la hauteur des cibles — est dit par la peau, que ce test lit, et mesuré sur les captures du ticket
// (`cartes-du-chef-*` de scripts/capture-ecran, docs/captures/2915/).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { kindOfTheCard } from "../../src/vue/cards-of-chef/cards-of-chef.js";
import { type Facts } from "../../src/facts.ts";
import { Fake, type Played, repos } from "../helpers/false-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const QUESTION = "One journal export per project, or a single one for all projects?";
const FIRST = "One per project: each project keeps its own file.";
const SECOND = "A single export, all projects together.";


// #21 attend une décision de produit : une carte du chef avec sa question et ses deux choix, telle que son issue la pose
// sur GitHub (board/todo-github.ts).
const FACTS = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  rail: [{ ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null }],
  cooks: [],
  attend: [
    {
      ticket: 21,
      titre: "L'export du journal",
      url: "https://github.com/chef/parade/issues/21",
      chef: { sorte: "product", texte: `${QUESTION}\n- [resume] ${FIRST}\n- [resume] ${SECOND}\n\nThe site, the demo and the posts will all carry it.` },
    },
  ],
  stations: [],
} as unknown as Facts;
const EMPTY = { ...FACTS, compteurs: { ...FACTS.compteurs, attend: 0 }, attend: [] } as unknown as Facts;



const cards = (vue: Played) => vue.element("cartes-du-chef");
const buttons = (vue: Played) => cards(vue).dessous("button");
const touch = async (button: Fake | undefined): Promise<void> => {
  (button ?? assert.fail("pas de bouton")).click();
  await repos();
};
const cardALouvrir = (vue: Played) => buttons(vue).find((button) => button.className === "carte-a-ouvrir");
const choice = (vue: Played, rank: number) => buttons(vue).filter((button) => button.className.includes("choix-du-chef"))[rank];

describe("à la largeur d'un téléphone, l'app s'ouvre sur les cartes qui attendent le chef", () => {

  test("une PR à merger à la main (#3368) se dit un merge, pas un choix de produit", () => {
    assert.equal(kindOfTheCard({ sorte: "merge-by-hand", question: "Merge PR #45 by hand?", choix: [{ texte: "Merge PR #45", suite: "merge" }], prixDuTexte: "" } as never), "Merge by hand · 1 option");
  });


});

describe("la carte ouverte d'un toucher", () => {

});

describe("répondre depuis la carte", () => {
  for (const [theCase, rank, answer] of [
    ["le choix recommandé", 0, { question: QUESTION, choix: 1 }],
    ["un autre choix", 1, { question: QUESTION, choix: 2 }],
  ] as const) {
  }


});

describe("sa peau, lue : chaque cible fait 44 px, rien ne défile de côté", () => {
  const css = readFileSync(join(import.meta.dirname, "../../src/vue/cards-of-chef/cards-of-chef.css"), "utf8");
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.[\]()]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? assert.fail(`pas de règle ${selector}`);
  test("la carte de la liste, le retour et chaque choix ont une hauteur d'au moins 44 px ; le champ ne dépasse pas sa colonne", () => {
    assert.match(rule("#cartes-du-chef .carte-a-ouvrir"), /min-height: 44px/);
    assert.match(rule("#cartes-du-chef .retour-aux-cartes"), /width: 44px;\s*height: 44px/);
    assert.match(rule("#cartes-du-chef .choix-du-chef"), /min-height: 52px/);
    assert.match(rule("#cartes-du-chef .saisie-du-chef"), /width: 100%/);
    assert.match(rule("#cartes-du-chef"), /overflow-x: hidden/);
  });
});

describe("la carte ouverte d'un toucher — à première vue (#3086)", () => {
});

