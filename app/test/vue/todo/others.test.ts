// « Awaiting others » (#2985) : les cartes qui attendent un autre humain du projet, repliées sous leur nombre à côté de
// l'entrée « TODO (N) », hors des colonnes — TODO n'est pas une colonne (#3458) ; dépliées, chacune dit qui elle attend, et
// s'ouvre et se répond comme une carte de TODO (#3071 : l'assignation ne retient personne). Rien n'attend un autre humain :
// la section n'est pas là. Le même bloc est sur un écran étroit — le téléphone.
// La vue est jouée telle qu'elle est (helpers/false-vue.ts), sur les faits que le process principal range (facts.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { red } from "../../helpers/red.ts";
import { FakeScreen, type Fake, type Played, playTheVue, repos } from "../../helpers/false-vue.ts";

const A = "2026-11-09T10:04:12.000Z";
const PARADE = "parade";
const issue = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

const CARD = (question: string) => ({ type: "product", question, choix: [{ texte: "Yes.", suite: "resume" }, { texte: "No.", suite: "resume" }], captures: null });

// #12 attend le compte connecté ; #22, mis de côté sur le rail, attend bob ; #23 attend le chef et carol.
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-09T10:04:11.000Z",
  dernierTick: null,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: issue(21), activite: null },
    { ticket: 22, etat: "86", titre: "Drop the importer", url: issue(22), activite: null },
  ],
  attend: [{ ticket: 12, titre: "Validation SIRET", url: issue(12) }],
  attendAutres: [
    { ticket: 22, titre: "Drop the importer", url: issue(22), carte: CARD("Drop the legacy importer?"), qui: ["bob"] },
    { ticket: 23, titre: "Open the beta", url: issue(23), carte: CARD("Open the beta to everyone?"), qui: ["benomite", "carol"] },
  ],
};

async function open({ etroit: narrow, faits: facts = FACTS }: { etroit: boolean; faits?: Facts }): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [] }, { ecran: new FakeScreen(narrow) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  receive(vue, facts);
  return vue;
}
function receive(vue: Played, facts: Facts) {
  const receivedOne = holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}

// « Awaiting others » n'attend pas le chef : il est à côté de son TODO, sous les colonnes, pas dedans (#4238).
const todo = (vue: Played) => vue.element("rail").dessous("div").find(({ className }) => className === "a-cote-du-todo") ?? assert.fail("pas de bloc à côté du TODO");
const withoutTodo = (vue: Played) => vue.element("rail").dessous("div").find(({ className }) => className === "a-cote-du-todo");
const account = (vue: Played) => red(vue.element("rail")).length;
const foldOf = (column: Fake) => column.children.find((child) => child.balise === "details");
const opened = (fold: Fake) => (fold as unknown as { open?: boolean }).open === true;
function unfold(fold: Fake) {
  (fold as unknown as { open: boolean }).open = true;
  fold.declencher("toggle");
}

describe("« Awaiting others » sous les colonnes, hors d'elles (#2985, #3458)", () => {
  for (const narrow of [false, true]) {
    test(`${narrow ? "écran étroit" : "écran large"} : les siennes rouges dans leur colonne, puis « Awaiting others (2) », replié, en dernier`, async () => {
      const vue = await open({ etroit: narrow });
      const column = todo(vue);
      const fold = foldOf(column) ?? assert.fail("pas de « Awaiting others »");
      const red = vue.element("rail").dessous("li").filter((li) => li.dataset.carte === "attente" && !fold.dessous("li").includes(li));
      assert.deepEqual(red.map((li) => li.children[0]?.children[0]?.textContent), ["#12"]);
      assert.equal(account(vue), 1);
      assert.equal(column.children.at(-1), fold);
      assert.equal(fold.children[0]?.textContent, "Awaiting others (2)");
      assert.equal(opened(fold), false);
    });
  }

  test("déplié : chaque carte dit qui elle attend, et reste sous « Awaiting others », hors du compte de TODO", async () => {
    const vue = await open({ etroit: false });
    const column = todo(vue);
    const fold = foldOf(column) ?? assert.fail("pas de « Awaiting others »");
    unfold(fold);
    assert.deepEqual(
      fold.dessous("p").filter((p) => p.className === "qui").map((p) => p.textContent),
      ["awaits bob", "awaits benomite, carol"],
    );
    assert.deepEqual(
      fold.dessous("li").filter((li) => li.className.split(" ").includes("bon")).map((li) => li.children[0]?.children[0]?.textContent),
      ["#22", "#23"],
    );
    assert.equal(account(vue), 1);
    assert.equal(fold.dessous("*").some((e) => e.textContent === "awaiting you"), false, "elles n'attendent pas le compte connecté");
  });

  for (const narrow of [false, true]) {
    test(`${narrow ? "écran étroit" : "écran large"} : une carte d'autrui porte sa question, ses choix et le champ de réponse de TODO, et s'ouvre d'un clic (#3071)`, async () => {
      const vue = await open({ etroit: narrow });
      const fold = foldOf(todo(vue)) ?? assert.fail("pas de « Awaiting others »");
      unfold(fold);
      const slip = fold.dessous("li").find((li) => li.className.split(" ").includes("bon") && li.children[0]?.children[0]?.textContent === "#22") ?? assert.fail("pas de #22");
      const card = slip.dessous("section").find((c) => c.className === "carte-todo") ?? assert.fail("pas de carte de TODO sur #22");
      assert.deepEqual(card.dessous("button").filter((b) => b.className === "choix").map((b) => b.textContent), ["Yes.", "No."]);
      assert.equal(card.dessous("textarea").length, 1);
      assert.equal(vue.element("fiche").hidden, true);
      slip.click();
      assert.equal(vue.element("fiche").hidden, false);
    });
  }

  test("aucune carte sous le rail : #22, mise de côté, n'est que dans « Awaiting others »", async () => {
    const vue = await open({ etroit: false });
    assert.equal(vue.element("rail").textContent.includes("outside the columns"), false);
    const fold = foldOf(todo(vue)) ?? assert.fail("pas de « Awaiting others »");
    const slips = vue.element("rail").dessous("li").filter((li) => li.className.split(" ").includes("bon") && !fold.dessous("li").includes(li)).map((li) => li.children[0]?.children[0]?.textContent);
    assert.equal(slips.includes("#22"), false);
  });

  test("déplié, il le reste à la lecture suivante", async () => {
    const vue = await open({ etroit: false });
    unfold(foldOf(todo(vue)) ?? assert.fail("pas de « Awaiting others »"));
    receive(vue, FACTS);
    assert.equal(opened(foldOf(todo(vue)) ?? assert.fail("pas de « Awaiting others »")), true);
  });

  test("rien n'attend un autre humain : pas de « Awaiting others », le bloc absent quand il est vide", async () => {
    const { attendAutres: _, ...without } = FACTS;
    assert.equal(withoutTodo(await open({ etroit: false, faits: without })), undefined);
    const only = await open({ etroit: true, faits: { ...FACTS, attend: [], compteurs: { ...FACTS.compteurs, attend: 0 } } });
    assert.equal(foldOf(todo(only))?.children[0]?.textContent, "Awaiting others (2)");
    assert.equal(withoutTodo(await open({ etroit: true, faits: { ...without, attend: [] } })), undefined);
  });
});
