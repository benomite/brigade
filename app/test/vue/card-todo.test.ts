// La carte de TODO, sur le rail du projet (#1281, épique #1277) : la vue jouée telle qu'elle est, devant
// un faux document (helpers/false-vue.ts), sur ce que le process principal range des faits (facts.ts, card-todo.ts). Une
// carte du chef lue de GitHub montre sa question, un bouton par choix, un champ de texte libre et son bouton « send ».
// Un clic sur un choix envoie la réponse, et la carte la dit envoyée, en attente de la cuisine, sans autre clic. Ce que
// la vue sait montrer d'une réponse lue — jouée, ou pas jouée et pourquoi — se joue sur le module seul, une réponse
// écrite à la main.
// Le module de la carte est aussi lu seul, sur un faux document (vue/card-todo.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cardOfChefOfTodo, type CardRead, type SendSeen } from "../../src/card-todo.ts";
import type { CardOfChef } from "../../src/board/todo-github.ts";
import { afterRendered, REQUEST_IN_ROUTE, ASK, QUEUED, QUEUED_DETAIL, IN_MY_WORDS, SEND, PLAYED, NOT_PLAYED, setCardOfTodo, REPOS, seenOfTheCard } from "../../src/vue/card-todo.js";
import { Fake, type Played } from "../helpers/false-vue.ts";
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


// Les mêmes, avec ce qui se passe en une phrase, sous leurs choix.
const DESIGN_RESUME = "The SIRET form is redrawn and its delivery is green.";
const PRODUCT_RESUME = "The journal export is ready to cook.";



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









  test("une carte du chef à première vue : situation, question, recommandation, boutons — le reste derrière un seul « details », fermé (#3086)", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const nothing = { repondre: () => {}, ecrire: () => {}, demander: () => {} };
    const cardOfChef = cardOfChefOfTodo({
      sorte: "blocked",
      texte: "Should the release run of app 1.0.185 be retried?\n- [resume] Retry it: the failure looks transient\n- [close] Close it\n\nThe release run of app 1.0.185 failed. Opened by a stranger.\n\nManager triage: a long note that must not show at first sight.",
    }) ?? assert.fail("pas de carte");
    const setOne = (setCardOfTodo(doc, 3084, cardOfChef, REPOS, { brouillon: "", cle: "p#3084" }, nothing) as Fake[])[0] ?? assert.fail("rien de posé");
    assert.deepEqual(
      setOne.children.map((pose) => pose.className),
      ["resume-carte", "question-carte", "recommandation-carte", "choix-carte", "en-mes-mots", "phrase", "details-carte", "secondaire"],
    );
    assert.equal(setOne.children[0]?.textContent, "The release run of app 1.0.185 failed.");
    assert.equal(setOne.children[2]?.textContent, "Recommended: Retry it: the failure looks transient");
    const fold = setOne.children.find((pose) => pose.className === "details-carte") ?? assert.fail("pas de pli");
    assert.notEqual((fold as unknown as { open?: boolean }).open, true, "fermé par défaut");
    assert.equal(fold.children[0]?.textContent, "details");
    assert.match(fold.textContent, /Manager triage: a long note/);
    assert.equal(setOne.dessous("details").length, 1);
    assert.ok(!setOne.children.filter((pose) => pose !== fold).some((pose) => /Manager triage/.test(pose.textContent)));
  });

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
