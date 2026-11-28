// Un projet dont le compte GitHub de cet ordinateur ne peut pas écrire le dépôt s'ouvre en lecture seule (ticket 3163) : le
// rail, les cartes, TODO, les stations et les cooks se voient ; aucun geste n'est offert — ni choix ni champ sur une carte
// de TODO, ni « Relaunch », ni « Add a station » —, absents, pas grisés ; une ligne en tête du projet le dit, avec ses deux
// liens. L'accès gagné, la lecture suivante rend la vue ordinaire, sans rouvrir le projet. La vue est jouée telle qu'elle
// est, devant un faux document et un faux pont ; les faits sont ceux que `facts` porte (board/read.ts, `lectureSeule`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { holdFacts, type Facts } from "../src/facts.ts";
import { actionsOfCard } from "../src/card-actions.ts";
import { ACCESS_IN_WRITING, pageOfTheReadOnly } from "../src/read-only.ts";
import { HEADINGS } from "../src/tabs.ts";
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
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
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
const facts = (readOnly: boolean) => ({
  etat: "ouverte",
  lu: "2026-11-11T10:04:11.000Z",
  compteurs: { rail: 3, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  
  
  
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
  vue.dire("surFaits", { ...holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(readOnly)) }] }), demande: vue.dernier("faits")[0] as number });
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
