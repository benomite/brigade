// La carte de TODO, sur le rail du projet (#1281, épique #1277) : la vue jouée telle qu'elle est, devant
// un faux document (helpers/false-vue.ts), sur ce que le process principal range des faits (facts.ts, card-todo.ts). Une
// carte du chef lue de GitHub montre sa question, un bouton par choix, un champ de texte libre et son bouton « send ».
// Un clic sur un choix envoie la réponse, et la carte la dit envoyée, en attente de la cuisine, sans autre clic. Ce que
// la vue sait montrer d'une réponse lue — jouée, ou pas jouée et pourquoi — se joue sur le module seul, une réponse
// écrite à la main.
// Le module de la carte est aussi lu seul, sur un faux document (vue/card-todo.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { cardOfChefOfTodo, type CardRead, type SendSeen, type Rendered } from "../../src/card-todo.ts";
import type { CardOfChef } from "../../src/board/todo-github.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
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
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 2, auTravail: 0, aLaPass: 1, attend: 2, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 12, etat: "en pass", titre: "Validation SIRET", url: ISSUE(12), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
  ],
  cooks: [],
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
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }), ...answers });
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
  test("une carte montre sa question, puis un bouton par choix, dans l'ordre du runtime", async () => {
    const vue = await open();
    receive(vue);
    for (const [ticket, data] of [[12, DESIGN], [21, PRODUCT]] as const) {
      const setOne = card(vue, ticket);
      assert.equal(setOne.dessous("p").find((pose) => pose.className === "question-carte")?.textContent, data.question);
      assert.deepEqual(
        choice(setOne).map((pose) => pose.textContent),
        data.choix.map(({ texte: text }) => text),
      );
    }
  });

  test("chaque choix se lit entier, sans coupe ni « ? » à déchiffrer : son libellé est celui du bouton, son prix au survol du bouton (#3086)", async () => {
    const vue = await open();
    receive(vue);
    const poses = choice(card(vue, 21));
    assert.deepEqual(
      poses.map((pose) => pose.textContent),
      PRODUCT.choix.map(({ texte: text }) => text),
    );
    assert.ok(poses.every((pose) => pose.dessous("span").every((span) => span.className !== "coupe")), "aucun libellé coupé");
    assert.ok(poses.every((pose) => (pose.title ?? "") !== ""), "chaque bouton dit ce qu'il fait");
    assert.deepEqual(poses.flatMap((pose) => pose.parentElement?.dessous("button").filter((other) => other.className === "aide") ?? []), [], "aucun « ? » sur les choix");
    assert.equal(poses[0]?.dataset.bouton, "recommande");
  });

  test("le prix d'un choix est au survol de son bouton, jamais écrit sous lui : un merge le dit", async () => {
    const vue = await open();
    receive(vue);
    const [merge] = choice(card(vue, 12));
    assert.match(merge?.title ?? "", /merges the PR the card names/);
    assert.doesNotMatch(card(vue, 12).dessous("p").map((pose) => pose.textContent).join("\n"), /merges/);
  });

  test("une carte a un champ de texte libre et son bouton « send », inactif tant que le champ est vide", async () => {
    const vue = await open();
    receive(vue);
    const setOne = card(vue, 21);
    assert.equal(field(setOne).placeholder, FIELD);
    assert.equal(button(setOne, SEND).disabled, true);
    field(setOne).value = "Both: one per project, plus a summary.";
    field(setOne).declencher("input");
    assert.equal(button(setOne, SEND).disabled, false);
  });

  test("un clic sur un choix envoie la réponse, une fois, et la carte la dit envoyée, en attente de la cuisine, sans autre clic", async () => {
    const vue = await open({ repondreCarte: () => ({ repondue: true, dit: "#21: card answered, choice 2", commentaire: 500 }) });
    receive(vue);
    assert.equal(account(vue), "2");
    const reviews = vue.appels.filter(({ geste: action }) => action === "relireBox").length;
    choice(card(vue, 21))[1]?.click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: PRODUCT.question, choix: 2 }]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "repondreCarte").length, 1);
    queued(card(vue, 21), PRODUCT.choix[1]?.texte ?? "");
    assert.ok(slip(vue, 12) !== undefined, "l'autre carte reste, à trancher");
    assert.equal(choice(card(vue, 12)).length, 2);
    // `facts` est relu tout de suite : la lecture suivante dit ce qu'il en est.
    assert.equal(vue.appels.filter(({ geste: action }) => action === "relireBox").length, reviews + 1);
    // Tant qu'aucune lecture n'en dit rien, la carte l'attend ; la lecture qui ne la porte plus l'oublie.
    receive(vue);
    queued(card(vue, 21), PRODUCT.choix[1]?.texte ?? "");
    receive(vue, { ...FACTS, attend: FACTS.attend?.filter(({ ticket }) => ticket !== 21) });
    receive(vue);
    assert.equal(choice(card(vue, 21)).length, 2, "revenue avec une lecture neuve, elle se pose de nouveau, à trancher");
  });

  test("le texte libre part par « send », tel que le chef l'a tapé", async () => {
    const vue = await open({ repondreCarte: () => ({ repondue: true, dit: "#12: card answered" }) });
    receive(vue);
    const setOne = card(vue, 12);
    field(setOne).value = "Merge it, but the label must say “SIRET number”.";
    field(setOne).declencher("input");
    button(setOne, SEND).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 12, { question: DESIGN.question, texte: "Merge it, but the label must say “SIRET number”." }]);
    queued(card(vue, 12), "Merge it, but the label must say “SIRET number”.");
  });

  test("en route, les choix et le champ attendent : un second clic ne part pas", async () => {
    let reply: (rendered: Rendered) => void = () => {};
    const vue = await open({ repondreCarte: () => new Promise<Rendered>((render) => (reply = render)) as unknown as Rendered });
    receive(vue);
    choice(card(vue, 21))[0]?.click();
    await repos();
    const setOne = card(vue, 21);
    assert.ok(choice(setOne).every((pose) => pose.disabled));
    assert.equal(field(setOne).disabled, true);
    assert.ok(setOne.dessous("span").some((pose) => pose.textContent === IN_ROUTE));
    choice(setOne)[1]?.click();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "repondreCarte").length, 1);
    reply({ repondue: true, dit: "" });
    await repos();
    queued(card(vue, 21), PRODUCT.choix[0]?.texte ?? "");
  });

  test("refusée, la carte reste dans TODO avec ses gestes, et dit pourquoi en une ligne — le détail au survol", async () => {
    const detail = "$ node geste.ts parade rail choose 21 1\n#21 is not touched: a cook is working on #21\n→ exit code 1";
    const vue = await open({ repondreCarte: () => ({ refus: "nothing was recorded — #21 is not touched: a cook is working on #21", detail }) });
    receive(vue);
    choice(card(vue, 21))[0]?.click();
    await repos();
    const setOne = card(vue, 21);
    const refusal = setOne.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(refusal.dessous("span")[0]?.textContent, "nothing was recorded — #21 is not touched: a cook is working on #21");
    assert.equal(refusal.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, detail);
    assert.ok(choice(setOne).every((pose) => !pose.disabled));
    assert.equal(account(vue), "2");
  });

  test("ce que le process principal rend aujourd'hui (#2061) : rien n'est posté, la carte reste à trancher et dit où y répondre", async () => {
    const vue = await open({ repondreCarte: () => ({ refus: WITHOUT_DONE.carte, detail: "" }) });
    receive(vue);
    choice(card(vue, 21))[0]?.click();
    await repos();
    const setOne = card(vue, 21);
    const refusal = setOne.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de ligne de refus");
    assert.equal(refusal.dessous("span")[0]?.textContent, WITHOUT_DONE.carte);
    assert.ok(choice(setOne).length === 2 && choice(setOne).every((pose) => !pose.disabled));
    assert.equal(whereItStands(setOne), undefined);
  });

  test("une carte du chef à première vue : situation, question, recommandation, boutons — le reste derrière un seul « details », fermé (#3086)", () => {
    const doc = { createElement: (balise: string) => new Fake(balise) };
    const nothing = { repondre: () => {}, ecrire: () => {}, demander: () => {} };
    const cardOfChef = cardOfChefOfTodo({
      sorte: "blocked",
      texte: "Should the release run of app 1.0.185 be retried?\n- [resume] Retry it: the failure looks transient\n- [close] Close it\n\nThe release run of app 1.0.185 failed. Opened by a stranger.\n\nManager triage: a long note that must not show at first sight.",
    }) ?? assert.fail("pas de carte");
    const setOne = (setCardOfTodo(doc, 3084, cardOfChef, REPOS, { captures: [], brouillon: "", cle: "p#3084" }, nothing) as Fake[])[0] ?? assert.fail("rien de posé");
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
    const set = (sending: SendSeen) => (setCardOfTodo(doc, 21, readEntry(sending), REPOS, { captures: [], brouillon: "", cle: "p#21" }, nothing) as Fake[])[0] ?? assert.fail("rien de posé");
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

  test("une carte dans la forme unique montre, dans cet ordre : ce qui se passe, la question, un bouton par choix, le champ libre, puis « ask the second »", async () => {
    const vue = await open();
    receive(vue, SHAPE);
    const setOne = card(vue, 21);
    const order = setOne.children.map((pose) => pose.className);
    assert.deepEqual(order, ["resume-carte", "question-carte", "recommandation-carte", "choix-carte", "en-mes-mots", "phrase", "details-carte", "secondaire"]);
    assert.equal(setOne.children[0]?.textContent, PRODUCT_RESUME);
    assert.equal(setOne.children[1]?.textContent, PRODUCT.question);
    assert.deepEqual(
      choice(setOne).map((pose) => pose.textContent),
      PRODUCT.choix.map(({ texte: text }) => text),
    );
    assert.equal(field(setOne).placeholder, FIELD);
    // Le résumé dit ce qui se passe : la phrase du bon ne le redit pas.
    assert.ok(!(slip(vue, 21)?.dessous("p") ?? []).some((pose) => pose.className === "ligne-carte"));
  });

  test("dans Awaiting you, la réponse recommandée est le premier choix, et lui seul ; le champ attend derrière « answer in my own words » (#2922)", async () => {
    const vue = await open();
    receive(vue, SHAPE);
    const setOne = card(vue, 21);
    assert.deepEqual(
      choice(setOne).map((pose) => [pose.textContent, pose.dataset.bouton === "recommande"]),
      PRODUCT.choix.map(({ texte: text }, rank) => [text, rank === 0]),
    );
    const sentence = setOne.children.find((pose) => pose.className === "phrase") ?? assert.fail("pas de champ");
    const opens = button(setOne, IN_MY_WORDS);
    assert.equal(sentence.hidden, true, "replié tant que rien n'est tapé");
    assert.equal(opens.hidden, false);
    opens.click();
    assert.equal(sentence.hidden, false);
    assert.equal(opens.hidden, true);
    // Le champ ouvert se tape et part par « send », comme avant.
    field(setOne).value = "Both.";
    field(setOne).declencher("input");
    assert.equal(button(setOne, SEND).disabled, false);
  });

  test("un clic sur le bouton d'un choix joue son geste : la réponse part pour ce choix, sur la question montrée", async () => {
    const vue = await open({ repondreCarte: () => ({ repondue: true, dit: "#31: card answered, choice 1" }) });
    receive(vue, SHAPE);
    choice(card(vue, 21))[1]?.click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte"), [PARADE, 21, { question: PRODUCT.question, choix: 2 }]);
    queued(card(vue, 21), PRODUCT.choix[1]?.texte ?? "");
  });

  test("« ask the second » est sur chaque carte, en action secondaire, jamais un des choix — et la carte se tranche sans lui", async () => {
    const vue = await open({ repondreCarte: () => ({ repondue: true, dit: "#12: card answered, choice 1" }) });
    receive(vue, SHAPE);
    for (const ticket of [12, 21]) {
      const setOne = card(vue, ticket);
      const ask = button(setOne, ASK);
      assert.equal(ask.className, "demander", "un mot en retrait, pas un bouton de choix");
      assert.equal(ask.parentElement?.className, "secondaire");
      assert.ok(!choice(setOne).includes(ask));
      assert.ok(!choice(setOne).some((pose) => pose.textContent === ASK));
    }
    choice(card(vue, 12))[0]?.click();
    await repos();
    queued(card(vue, 12), DESIGN.choix[0]?.texte ?? "");
    assert.equal(vue.appels.filter(({ geste: action }) => action === "demanderAuSecond").length, 0, "sans passer par le second");
  });

  test("« ask the second » passe la carte au second — son numéro et sa question (#3133) ; la carte le dit, et garde ses choix", async () => {
    const vue = await open({ passerAuSecond: () => ({ refus: "nothing was written: the station is not reached" }) });
    receive(vue, SHAPE);
    field(card(vue, 21)).value = "what is a journal export?";
    field(card(vue, 21)).declencher("input");
    button(card(vue, 21), ASK).click();
    await repos();
    assert.deepEqual(vue.dernier("passerAuSecond"), [PARADE, 21, PRODUCT.question]);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "demanderAuSecond").length, 0, "la carte ne passe plus par la demande de la fiche");
    const setOne = card(vue, 21);
    assert.equal(setOne.dessous("span").find((pose) => pose.className === "refus")?.textContent, "nothing was written: the station is not reached");
    assert.ok(choice(setOne).every((pose) => !pose.disabled), "la carte se tranche toujours par ses choix");
    assert.equal(account(vue), "2");
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

  test("postée, elle attend la cuisine sans choix ni champ ; au repos, sa question, ses choix, son champ et ses captures données", () => {
    const capture = new Fake("div");
    const [posted] = setCardOfTodo(doc, 12, todoOf(DESIGN), { etape: "postee", reponse: { question: DESIGN.question, choix: 1 }, commentaire: 500 }, { captures: [], brouillon: "", cle: "p#12" }, nothing) as Fake[];
    queued(posted as Fake, DESIGN.choix[0]?.texte ?? "");
    const [setOne] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { captures: [capture], brouillon: "déjà tapé", cle: "p#12" }, nothing) as Fake[];
    assert.equal(setOne?.dataset.sorte, "design");
    assert.ok(setOne?.children.includes(capture), "les captures sont posées sur la carte");
    assert.equal(setOne?.dessous("textarea")[0]?.value, "déjà tapé");
    assert.equal(setOne?.dessous("textarea")[0]?.dataset.cle, "p#12");
    assert.equal(button(setOne as Fake, SEND).disabled, false);
  });

  test("le champ ne se replie que sur une carte qui a ses choix et rien de tapé : sans choix, il est sa seule réponse (#2922)", () => {
    const fieldOpen = (setOne: Fake) => [setOne.children.find((pose) => pose.className === "phrase")?.hidden, setOne.children.find((pose) => pose.className === "en-mes-mots")?.hidden];
    const [folded] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { captures: [], brouillon: "", cle: "p#12" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(folded as Fake), [true, false]);
    const [tape] = setCardOfTodo(doc, 12, todoOf(DESIGN), REPOS, { captures: [], brouillon: "déjà tapé", cle: "p#12" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(tape as Fake), [false, true]);
    const [withoutChoice] = setCardOfTodo(doc, 40, { ...todoOf(DESIGN), choix: [] }, REPOS, { captures: [], brouillon: "", cle: "p#40" }, nothing) as Fake[];
    assert.deepEqual(fieldOpen(withoutChoice as Fake), [false, true]);
    assert.equal(button(withoutChoice as Fake, IN_MY_WORDS).hidden, true);
  });

  test("« ask the second » appelle son geste ; en route, il attend et le dit, sans toucher aux choix", () => {
    let requests = 0;
    const actions = { ...nothing, demander: () => void requests++ };
    const [setOne] = setCardOfTodo(doc, 31, todoOf(PRODUCT), REPOS, { captures: [], brouillon: "", cle: "p#31" }, actions) as Fake[];
    button(setOne as Fake, ASK).click();
    assert.equal(requests, 1);
    assert.equal(setOne?.ariaLabel, "the question #31 asks you");
    const [inRoute] = setCardOfTodo(doc, 31, todoOf(PRODUCT), REPOS, { captures: [], brouillon: "", cle: "p#31", second: { envoi: true } }, actions) as Fake[];
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
