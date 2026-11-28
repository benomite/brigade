// La carte de TODO, sur le rail du projet (#1281, épique #1277) : la vue jouée telle qu'elle est, devant
// un faux document (helpers/false-vue.ts), sur ce que le process principal range des faits (facts.ts, card-todo.ts). Une
// carte du chef lue de GitHub montre sa question, un bouton par choix, un champ de texte libre et son bouton « send ».
// Un clic sur un choix envoie la réponse, et la carte la dit envoyée, en attente de la cuisine, sans autre clic. Ce que
// la vue sait montrer d'une réponse lue — jouée, ou pas jouée et pourquoi — se joue sur le module seul, une réponse
// écrite à la main.
// Le module de la carte est aussi lu seul, sur un faux document (vue/card-todo.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { cardOfChefOfTodo, type CardRead, type SendSeen, type Rendered } from "../../src/card-todo.ts";
import type { CardOfChef } from "../../src/board/todo-github.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { holdFacts, type Facts } from "../../src/facts.ts";
import { HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Reading } from "../../src/box.ts";
import { WITHOUT_DONE } from "../../src/actions-github.ts";
import { afterRendered, FIELD, REQUEST_IN_ROUTE, ASK, QUEUED, QUEUED_DETAIL, IN_MY_WORDS, SEND, IN_ROUTE, PLAYED, NOT_PLAYED, setCardOfTodo, REPOS, seenOfTheCard } from "../../src/vue/card-todo.js";
import { Fake, type Played, playTheVue, type Answers, repos } from "../helpers/false-vue.ts";
import { red } from "../helpers/red.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;

// Les deux cartes, telles que leur issue les pose sur GitHub (board/todo-github.ts) : la question, puis un choix par ligne
// — `- [suite] texte` —, puis ce qui se passe.
const DESIGN: CardRead = {
  type: "design",
  question: "Does the SIRET field read as the mockup draws it?",
  choix: [
    { texte: "Yes, merge it as delivered.", suite: "merge" },
    { texte: "No: the error line goes under the field.", suite: "resume" },
  ],
};
const PRODUCT: CardRead = {
  type: "product",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
};
const chefOf = ({ type, question, choix: choice }: CardRead, context = ""): CardOfChef => ({ sorte: type, texte: [question, ...choice.map(({ texte: text, suite }) => `- [${suite}] ${text}`), "", context].join("\n") });

const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), chef: chefOf(DESIGN) },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), chef: chefOf(PRODUCT) },
  ],
};

// Les mêmes, avec ce qui se passe en une phrase, sous leurs choix.
const DESIGN_RESUME = "The SIRET form is redrawn and its delivery is green.";
const PRODUCT_RESUME = "The journal export is ready to cook.";

const SHAPE = {
  ...FACTS,
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: ISSUE(12), chef: chefOf(DESIGN, DESIGN_RESUME) },
    { ticket: 21, titre: "L'export du journal", url: ISSUE(21), chef: chefOf(PRODUCT, PRODUCT_RESUME) },
  ],
};

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
// Les faits que la box rend, en JSON, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function receive(vue: Played, facts: unknown = FACTS) {
  const reading: Reading = { projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] };
  const receivedOne = holdFacts().recevoir(reading);
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}
// Une réponse lue, pour la carte de #21 : le second choix, posté à ce commentaire. Aucune lecture n'en porte plus
// (#2061) ; la vue sait encore la montrer, et c'est ce qui est joué ici.
const SENDING = { commentaire: 500, reponse: PRODUCT.choix[1]?.texte ?? "", le: A } as const;
const wait = (comment = 500): SendSeen => ({ ...SENDING, commentaire: comment, etat: "attente" });
const plays = (comment = 500): SendSeen => ({ ...SENDING, commentaire: comment, etat: "joue", dit: "Done — choose #21 2 — cost: the kitchen takes #21 up again" });
const refuses = (comment = 500): SendSeen => ({ ...SENDING, commentaire: comment, etat: "refuse", dit: "Not done — choose #21 2: a cook is working on #21", raison: "a cook is working on #21" });
// TODO n'est pas une colonne (#3458) : ses cartes sont dans le rail, rouges dans la colonne de leur étape, et l'entrée
// le compte de l'accueil les compte (plus d'entrée « TODO (N) » sur le rail, #3523).
const todo = (vue: Played): Fake => vue.element("rail");
const account = (vue: Played) => String(red(todo(vue)).length);
const slip = (vue: Played, ticket: number): Fake | undefined => todo(vue).dessous("li").find((pose) => pose.className === "bon" && pose.dessous("button")[0]?.textContent === `#${ticket}`);
const card = (vue: Played, ticket: number): Fake => slip(vue, ticket)?.dessous("section").find((pose) => pose.className === "carte-todo") ?? assert.fail(`pas de carte de TODO sur #${ticket}`);
const button = (or: Fake, text: string): Fake => or.dessous("button").find((pose) => pose.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
const choice = (or: Fake) => or.dessous("button").filter((pose) => pose.className === "choix");
const field = (or: Fake): Fake => or.dessous("textarea")[0] ?? assert.fail("pas de champ de texte libre");
// Où en est la réponse, sur la carte : sa ligne, et ce qui en est au survol.
const whereItStands = (or: Fake): Fake | undefined => or.dessous("p").find((pose) => pose.className === "ou-en-est");
// Une carte répondue : la réponse rappelée, ni choix ni champ — rien n'y est à trancher —, et où elle en est.
function answeredOne(setOne: Fake, answer: string, line: string) {
  assert.equal(setOne.dessous("p").find((pose) => pose.className === "reponse-envoyee")?.textContent, `your answer: “${answer}”`);
  assert.equal(choice(setOne).length, 0, "aucun choix offert : la question n'est plus sans réponse");
  assert.equal(setOne.dessous("textarea").length, 0);
  assert.equal(whereItStands(setOne)?.dessous("span")[0]?.textContent, line);
}
// Envoyée, en attente de la cuisine : la ligne, son détail au survol, et le bord de la carte qui bat.
function queued(setOne: Fake, answer: string) {
  answeredOne(setOne, answer, QUEUED);
  assert.equal(setOne.dataset.envoi, "attente");
  assert.equal(whereItStands(setOne)?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, QUEUED_DETAIL);
}

describe("la carte de TODO, sur le rail du projet", () => {










  test("les états d'une réponse lue, sur la carte : envoyée et en attente de la cuisine, puis jouée — ou pas jouée et pourquoi", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const nothing = { repondre: () => {}, ecrire: () => {}, demander: () => {} };
    const readEntry = (sending: SendSeen) => ({ ...(cardOfChefOfTodo(chefOf(PRODUCT)) ?? assert.fail("carte illisible")), envoi: sending });
    const set = (sending: SendSeen) => (setCardOfTodo(doc, 21, readEntry(sending), REPOS, { brouillon: "", cle: "p#21" }, nothing) as Fake[])[0] ?? assert.fail("rien de posé");
    queued(set(wait()), PRODUCT.choix[1]?.texte ?? "");
    // Jouée : la carte le dit, sa ligne au survol, et son bord ne bat plus.
    const played = set(plays());
    answeredOne(played, PRODUCT.choix[1]?.texte ?? "", PLAYED);
    assert.equal(played.dataset.envoi, "jouee");
    assert.equal(whereItStands(played)?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "Done — choose #21 2 — cost: the kitchen takes #21 up again");
    // Pas jouée : la raison en une ligne, sa réponse au survol, et la carte rend ses choix.
    const refused = set(refuses());
    assert.equal(refused.dataset.envoi, undefined);
    const line = refused.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(line.dessous("span")[0]?.textContent, `${NOT_PLAYED}: a cook is working on #21`);
    assert.equal(line.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "Not done — choose #21 2: a cook is working on #21");
    assert.ok(choice(refused).length === 2 && choice(refused).every((pose) => !pose.disabled));
  });






  test("une entrée de TODO sans carte du chef n'a ni question, ni choix, ni champ", async () => {
    const vue = await open();
    receive(vue, { ...FACTS, attend: FACTS.attend?.map(({ chef: _, ...remains }) => remains) });
    for (const ticket of [12, 21]) assert.ok(!(slip(vue, ticket)?.dessous("section") ?? []).some((pose) => pose.className === "carte-todo"));
  });
});

describe("le module de la carte, sur un faux document", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  const nothing = { repondre: () => {}, ecrire: () => {}, demander: () => {} };
  const todoOf = (raw: CardRead) => cardOfChefOfTodo(chefOf(raw)) ?? assert.fail("carte illisible");

  test("postée, elle attend la cuisine sans choix ni champ ; au repos, sa question, ses choix, et son champ", () => {
    const [posted] = setCardOfTodo(doc, 12, todoOf(DESIGN), { etape: "postee", reponse: { question: DESIGN.question, choix: 1 }, commentaire: 500 }, { brouillon: "", cle: "p#12" }, nothing) as Fake[];
    queued(posted as Fake, DESIGN.choix[0]?.texte ?? "");
    const [setOne] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { brouillon: "déjà tapé", cle: "p#12" }, nothing) as Fake[];
    assert.equal(setOne?.dataset.sorte, "design");
    assert.equal(setOne?.dessous("textarea")[0]?.value, "déjà tapé");
    assert.equal(setOne?.dessous("textarea")[0]?.dataset.cle, "p#12");
    assert.equal(button(setOne as Fake, SEND).disabled, false);
  });

  test("le champ ne se replie que sur une carte qui a ses choix et rien de tapé : sans choix, il est sa seule réponse (#2922)", () => {
    const fieldOpen = (setOne: Fake) => [setOne.children.find((pose) => pose.className === "phrase")?.hidden, setOne.children.find((pose) => pose.className === "en-mes-mots")?.hidden];
    const [folded] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { brouillon: "", cle: "p#12" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(folded as Fake), [true, false]);
    const [tape] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { brouillon: "déjà tapé", cle: "p#12" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(tape as Fake), [false, true]);
    const [withoutChoice] = setCardOfTodo(doc, 40, { ...todoOf(DESIGN), choix: [] }, REPOS, { brouillon: "", cle: "p#40" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(withoutChoice as Fake), [false, true]);
    assert.equal(button(withoutChoice as Fake, IN_MY_WORDS).hidden, true);
  });

  test("« ask the second » appelle son geste ; en route, il attend et le dit, sans toucher aux choix", () => {
    let requests = 0;
    const actions = { ...nothing, demander: () => void requests++ };
    const [setOne] = setCardOfTodo(doc, 31, todoOf(PRODUCT), REPOS, { brouillon: "", cle: "p#31" }, actions) as Fake[];
    button(setOne as Fake, ASK).click();
    assert.equal(requests, 1);
    assert.equal(setOne?.ariaLabel, "the question #31 asks you");
    const [inRoute] = setCardOfTodo(doc, 31, todoOf(PRODUCT), REPOS, { brouillon: "", cle: "p#31", second: { envoi: true } }, actions) as Fake[];
    assert.equal(button(inRoute as Fake, ASK).disabled, true);
    assert.ok(inRoute?.dessous("span").some((pose) => pose.textContent === REQUEST_IN_ROUTE));
    assert.ok(choice(inRoute as Fake).every((pose) => !pose.disabled));
  });

  test("l'étape qui suit la réponse du process principal", () => {
    const answer = { question: PRODUCT.question, choix: 1 };
    assert.deepEqual(afterRendered(answer, { repondue: true, dit: "", commentaire: 500 }), { etape: "postee", reponse: answer, commentaire: 500 });
    assert.deepEqual(afterRendered(answer, { refus: "non", detail: "d" }), { etape: "refus", dit: "non", detail: "d" });
    assert.equal(afterRendered(answer, undefined).etape, "refus");
  });

  test("ce que la carte montre : le geste en route d'ici d'abord, puis la réponse lue — d'une réponse au moins aussi récente", () => {
    const card = todoOf(PRODUCT);
    const readEntry = (sending: SendSeen) => ({ ...card, envoi: sending });
    const posted = { etape: "postee" as const, reponse: { question: PRODUCT.question, choix: 1 }, commentaire: 500 };
    assert.deepEqual(seenOfTheCard(card, REPOS), { vu: "repos" });
    assert.deepEqual(seenOfTheCard(card, posted), { vu: "attente", reponse: PRODUCT.choix[0]?.texte });
    assert.deepEqual(seenOfTheCard(readEntry(refuses(400)), posted), { vu: "attente", reponse: PRODUCT.choix[0]?.texte });
    assert.equal(seenOfTheCard(readEntry(plays(500)), posted).vu, "jouee");
    assert.deepEqual(seenOfTheCard(readEntry(wait()), REPOS), { vu: "attente", reponse: PRODUCT.choix[1]?.texte });
    assert.equal(seenOfTheCard(readEntry(wait()), { etape: "envoi", reponse: { question: PRODUCT.question, texte: "x" } }).vu, "envoi");
  });
});
