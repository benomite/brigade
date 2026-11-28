// TODO n'est pas une colonne (#3458) : ce qui attend le chef est rangé, rouge et en tête, dans la colonne de son étape ;
// l'entrée « TODO (N) » les compte et les filtre. D'abord le rangement tel que todo/todo.js le fait, sur les colonnes que le
// process principal rend (facts.ts) ; puis la vue jouée telle qu'elle est (helpers/false-vue.ts) : l'entrée, son filtre, le
// téléphone, et l'accueil, qui dit le même compte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { rail, holdFacts, type Card, type Column, type Facts } from "../../../src/facts.ts";
import { HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { columnOf, isRed, LIST_OF_CHEF, tidyTheRail } from "../../../src/vue/todo/todo.js";
import { red } from "../../helpers/red.ts";
import { Fake, FakeScreen, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const PARADE = "parade";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const THIRD = { quoi: "the signed quote", qui: "the client", depuis: "2026-11-01T10:00:00.000Z", aLArrivee: "it goes back to the kitchen" };

// Un ticket qui attend le chef à chaque étape : #20 sur le rail, #14 pris, #30 en pass, #40 mis de côté là où le runtime dit
// qu'il attend (Pass), #60 pas encore sur le rail ; #8 en WAITING, sa relance passée ; #9 en WAITING, sa relance à venir.
// #8 et #9 sont parked pour le client : une relance passée ne les rend pas au chef (#4261).
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  compteurs: { rail: 2, auTravail: 2, aLaPass: 2, attend: 5, livres24h: 0 },
  
  attend: [20, 14, 30, 40, 60].map((number) => ({ ticket: number, titre: `Ticket ${number}`, url: issue(number) })),
  
};
const cards = (columns: readonly Column[]) => columns.map(({ nom: name, compte: account, cartes: itsOwn }) => [name, account, itsOwn.map(({ ticket: number }) => number)]);

describe("le rangement : chaque carte qui attend le chef dans la colonne de son étape, en tête", () => {


  test("rien n'attend le chef : N vaut 0, et rien n'est rouge", () => {
    const range = tidyTheRail(rail({ ...FACTS, attend: [] }).colonnes);
    assert.equal(range.compte, "0");
    assert.ok(range.colonnes.every(({ cartes: itsOwn }) => !itsOwn.some(isRed)));
  });


  test("une carte du chef n'est jamais perdue faute de colonne : une étape inconnue, ou un rail sans On the rail, la pose sur le rail", () => {
    const card = (number: number, step?: string): Card => ({ ticket: number, ouvrable: false, attendu: true, attend: [], dit: [], fiche: {}, ...(step === undefined ? {} : { etape: step }) }) as unknown as Card;
    assert.equal(columnOf(card(1, "Backlog"), ["On the rail", "Pass"]), "On the rail");
    assert.equal(columnOf(card(1, "Pass"), ["On the rail", "Pass"]), "Pass");
    const only = tidyTheRail([{ nom: LIST_OF_CHEF, ton: "rouge", compte: "1", cartes: [card(12)], vide: "" }]);
    assert.deepEqual(cards(only.colonnes), [["On the rail", "1", [12]]]);
    assert.equal(only.compte, "1");
  });

});

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
async function open(narrow: boolean, facts: Facts = FACTS): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [] }, { ecran: new FakeScreen(narrow) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  receive(vue, facts);
  return vue;
}
function receive(vue: Played, facts: Facts) {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}
// Plus d'entrée « TODO (N) » ni de filtre sur le rail (#3523) : le compte est celui des cartes rouges, que l'accueil dit aussi.
const entry = (vue: Played): Fake | undefined => vue.element("rail").dessous("button").find(({ className }) => className === "entree-todo");
const theColumns = (vue: Played) => vue.element("rail").dessous("section").filter(({ className }) => className === "colonne");
const slipsOf = (column: Fake) => column.dessous("li").filter(({ className }) => className.split(" ").includes("bon")).map(({ dataset }) => [Number(dataset.ticket), dataset.carte === "attente"]);

describe("la vue du projet, sur un écran large et sur un téléphone", () => {
  for (const narrow of [false, true]) {
  }


  test("rien n'attend le chef : aucune carte rouge nulle part", async () => {
    const vue = await open(false, { ...FACTS, attend: [] });
    assert.equal(vue.element("rail").dessous("li").filter(({ dataset }) => dataset.carte === "attente").length, 0);
    assert.equal(entry(vue), undefined);
  });
});

describe("l'accueil dit le compte des cartes rouges du rail", () => {
  test("le rail lu, la ligne du projet compte ses cartes rouges ; une lecture qui le change la repose", async () => {
    const vue = await open(false);
    (vue.element("projets").children.at(0) ?? assert.fail("pas de « Tous les projets »")).click();
    await repos();
    const account = () => vue.element("accueil-projets").dessous("span").find(({ className }) => className === "attend")?.textContent;
    assert.match(account() ?? "", /^5 /);
    // Une seule carte attend encore le chef : #8, parked pour le client, n'est pas comptée (#4261).
    receive(vue, { ...FACTS, attend: FACTS.attend?.slice(0, 1) });
    await repos();
    assert.match(account() ?? "", /^1 /);
  });
});
