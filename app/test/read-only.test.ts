// Un projet dont le compte GitHub de cet ordinateur ne peut pas écrire le dépôt s'ouvre en lecture seule (ticket 3163) : le
// rail, les cartes, TODO, les stations et les cooks se voient ; aucun geste n'est offert — ni choix ni champ sur une carte
// de TODO, ni « Relaunch », ni « Add a station » —, absents, pas grisés ; une ligne en tête du projet le dit, avec ses deux
// liens. L'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet. La vue est jouée telle qu'elle
// est, devant un faux document et un faux pont ; les faits sont ceux que `facts` porte (board/read.ts, `lectureSeule`).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { ACCESS_IN_WRITING, pageOfTheReadOnly } from "../src/read-only.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { FORKER, READ_ONLY, GET_THE_ACCESS } from "../src/vue/read-only/read-only.js";
import { CHOOSE } from "../src/vue/stations-tab/state.js";
import { DISPLACE } from "../src/vue/stations-tab/stations-tab.js";
import { cardOfTicket, type Fake, type Played, playTheVue, openTab, type Answers, repos } from "./helpers/false-vue.ts";

const PARADE = "parade";
const REPOSITORY = "chef/parade";
const A = "2026-11-11T10:04:12.000Z";
const ISSUE = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", depot: REPOSITORY }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Le rail : #21 attend le chef d'une question à deux choix ; #22 n'est plus pris par aucun cook (Relaunch) ; #23, pris par
// box/claude, son cook au travail.
const PRODUCT = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
};
// Sa carte du chef, telle que son issue la pose sur GitHub (board/todo-github.ts).
const CHEF = { sorte: PRODUCT.type, texte: [PRODUCT.question, ...PRODUCT.choix.map(({ texte: text, suite }) => `- [${suite}] ${text}`)].join("\n") };
type OfRuntime = NonNullable<FactsOfRuntime["stations"]>[number];
const BOX: OfRuntime = { station: "box/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [] };
const facts = (readOnly: boolean) => ({
  etat: "ouverte",
  lu: "2026-11-11T10:04:11.000Z",
  dernierTick: "2026-11-11T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
    { ticket: 22, etat: "86", titre: "Le ticket refusé", url: ISSUE(22), activite: null, attente: { raison: "off the kitchen after 3 cooks without a delivery", complete: "off the kitchen after 3 cooks without a delivery", label: "served-elsewhere", colonne: "en attente", retour: null } },
    { ticket: 23, etat: "pris", titre: "La recherche", url: ISSUE(23), station: "box/claude", activite: null },
  ],
  cooks: [{ ticket: 23, titre: "La recherche", station: "box/claude" }],
  stations: [BOX],
  attend: [{ ticket: 21, titre: "L'export du journal", url: ISSUE(21), chef: CHEF }],
  ...(readOnly ? { lectureSeule: { depot: REPOSITORY } } : {}),
}) satisfies Facts;

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], projetsServis: () => ({ depots: [] }), ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return vue;
}
async function read(vue: Played, readOnly: boolean): Promise<void> {
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(readOnly)) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
}
const slip = (vue: Played, ticket: number): Fake => cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`);
const texts = (or: Fake) => or.dessous("button").map(({ textContent }) => textContent);
const line = (vue: Played) => vue.element("alertes").children.find(({ className }) => className === "lecture-seule");

describe("un projet en lecture seule", () => {
  test("une ligne en tête du projet le dit en mots simples, avec ses deux liens : l'écriture à obtenir, ou le fork", async () => {
    const vue = await open({ ouvrirLectureSeule: () => true });
    await read(vue, true);
    const saidOne = line(vue) ?? assert.fail("pas de ligne de lecture seule");
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(vue.element("alertes").children[0], saidOne, "en tête de la bande");
    assert.equal(saidOne.dessous("p")[0]?.textContent, "Read-only: your GitHub account cannot write to chef/parade.");
    assert.equal(saidOne.dessous("p")[0]?.textContent, READ_ONLY(REPOSITORY));
    assert.deepEqual(texts(saidOne), [GET_THE_ACCESS, FORKER]);
    (saidOne.dessous("button").find(({ textContent }) => textContent === FORKER) ?? assert.fail("pas de lien fork")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLectureSeule"), [PARADE, "fork"]);
    (saidOne.dessous("button").find(({ textContent }) => textContent === GET_THE_ACCESS) ?? assert.fail("pas de lien accès")).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLectureSeule"), [PARADE, "acces"]);
  });

  test("le rail, ses cartes et TODO se voient ; aucun choix, aucun champ, aucun « Relaunch » : absents, pas grisés", async () => {
    const vue = await open();
    await read(vue, true);
    const cardItem = slip(vue, 21);
    assert.ok(cardItem.dessous("p").some(({ textContent }) => textContent === PRODUCT.question), "la question se lit");
    assert.deepEqual(cardItem.dessous("button").filter(({ className }) => className === "choix"), [], "aucun choix");
    assert.equal(cardItem.dessous("textarea").length, 0, "aucun champ");
    for (const absent of ["send", "answer in my own words", ...PRODUCT.choix.map(({ texte: text }) => text)]) assert.ok(!texts(cardItem).includes(absent), `${absent} : ${texts(cardItem).join(" | ")}`);
    const refused = slip(vue, 22);
    assert.ok(refused.dessous("p").some(({ textContent }) => textContent.startsWith("Will not start:")), "la carte refusée dit pourquoi");
    for (const absent of ["Relaunch", "Close as already done"]) assert.ok(!texts(refused).includes(absent), absent);
    assert.ok(cardOfTicket(vue, 23) !== undefined, "la carte prise se voit");
    assert.ok(!vue.element("rail").dessous("button").some(({ disabled, textContent }) => disabled === true && ["Relaunch", "send", ...PRODUCT.choix.map(({ texte: text }) => text)].includes(textContent)), "rien de grisé à la place");
  });

  test("Stations : ses stations se voient, et pas « Choose who cooks it »", async () => {
    const vue = await open();
    await read(vue, true);
    await openTab(vue, "Stations");
    assert.ok(vue.element("rail").dessous("section").some(({ dataset }) => dataset.station === "box/claude"), "la station se voit");
    assert.ok(!texts(vue.element("rail")).includes(CHOOSE), texts(vue.element("rail")).join(" | "));
  });

  test("Settings : ce qui se propose au dépôt par une pull request n'est pas posé", async () => {
    const vue = await open();
    await read(vue, true);
    assert.equal("lectureSeule" in vue.element("etat").dataset, true);
    const css = readFileSync(join(import.meta.dirname, "..", "src", "vue", "vue.css"), "utf8");
    const rule = /#etat\[data-lecture-seule\] :is\(([^)]*)\) \{\s*display: none !important;/.exec(css)?.[1] ?? assert.fail("pas de règle pour Settings en lecture seule");
    for (const block of ['[data-bloc="plafonds-duree"]', '[data-bloc="closer"]']) assert.ok(rule.includes(block), block);
  });

  test("l'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet ; perdu, elle redevient seule", async () => {
    const vue = await open();
    await read(vue, true);
    assert.ok(line(vue) !== undefined);
    await read(vue, false);
    assert.equal(line(vue), undefined, "plus de ligne de lecture seule");
    assert.equal("lectureSeule" in vue.element("etat").dataset, false);
    assert.equal(slip(vue, 21).dessous("button").filter(({ className }) => className === "choix").length, PRODUCT.choix.length, "les choix reviennent");
    assert.ok(texts(slip(vue, 22)).includes("Relaunch"));
    // Sur Stations, la station qui le cuit garde ses gestes (#3195) : l'ajout d'une station ne s'offre que quand personne ne le cuit.
    await openTab(vue, "Stations");
    assert.ok(texts(vue.element("rail")).includes(DISPLACE));
    await openTab(vue, "Rail");
    await read(vue, true);
    assert.ok(line(vue) !== undefined);
    assert.ok(!texts(slip(vue, 22)).includes("Relaunch"));
  });
});

describe("la fiche d'un ticket en lecture seule", () => {
  // Ce que le chef voit sur la fiche de #23, pris : les gestes de la fiche et le champ de la discussion.
  async function card(readOnly: boolean) {
    const vue = await open({
      gestesDeFiche: (cardItem) => actionsOfCard(cardItem),
    });
    await read(vue, readOnly);
    (cardOfTicket(vue, 23) ?? assert.fail("pas de carte #23")).click();
    await repos();
    await repos();
    const setOne = vue.element("fiche");
    return { gestes: setOne.dessous("section").find(({ className }) => className === "gestes-fiche")?.dessous("li").map(({ dataset }) => dataset.geste) ?? [], commentaire: setOne.dessous("button").some(({ dataset }) => dataset.geste === "commentaire"), champs: setOne.dessous("textarea").length };
  }

  test("elle ne garde que ce qui ouvre ou demande au second : ni commentaire à poster", async () => {
    const ordinary = await card(false);
    assert.ok(ordinary.gestes.includes("second"), ordinary.gestes.join(" | "));
    assert.equal(ordinary.commentaire, false);
    const only = await card(true);
    assert.deepEqual(only.gestes.filter((id) => !["issue", "pr", "second", "navigateur"].includes(id ?? "")), [], only.gestes.join(" | "));
    assert.ok(only.gestes.includes("second"), "le second se demande toujours");
    assert.equal(only.commentaire, false);
    assert.equal(only.champs, 0);
  });
});

describe("les pages que la ligne ouvre", () => {
  test("comment obtenir l'écriture, ou le fork du dépôt ; rien pour un dépôt ou une page qui ne se lit pas", () => {
    assert.equal(pageOfTheReadOnly(REPOSITORY, "acces"), ACCESS_IN_WRITING);
    assert.match(ACCESS_IN_WRITING, /^https:\/\/docs\.github\.com\/.*inviting-collaborators/);
    assert.equal(pageOfTheReadOnly(REPOSITORY, "fork"), "https://github.com/chef/parade/fork");
    assert.equal(pageOfTheReadOnly(undefined, "fork"), undefined);
    assert.equal(pageOfTheReadOnly("../evil", "fork"), undefined);
    assert.equal(pageOfTheReadOnly(REPOSITORY, "https://evil.example"), undefined);
  });
});
