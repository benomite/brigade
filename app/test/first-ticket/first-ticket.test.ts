// Le premier ticket d'un projet prêt, écrit dans l'app (#3306, épique #3301). D'abord ses morceaux, devant un faux document :
// la question du second et son champ, le brouillon montré avec « yes » et les changements, l'issue sur le rail, et l'état
// tenu — rien n'est créé avant le « oui ». Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : « Add a
// project », un dépôt prêt, la question au-dessus du rail, la réponse, le brouillon, une réécriture, puis le « oui ».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Terminal } from "../../src/terminals.ts";
import {
  CHANGE,
  CREATED,
  SEND,
  CLOSE,
  THE_SECOND,
  YES,
  LATER,
  setFirstTicket,
  PRICE_YES,
  QUESTION,
  REDACTION,
  REWRITE,
  REREAD,
  holdTheFirstTickets,
  type State,
} from "../../src/vue/first-ticket/first-ticket.js";
import type { Draft as Brouillon, Creation, Request as Demande, Redaction } from "../../src/first-ticket.ts";
import { Fake, playTheVue, type Played, type Answers, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const REPOSITORY = "chef/cantine";
const DRAFT: Brouillon = { title: "Show the lunch menu on the home page", body: "## Context\n\nGuests should see the menu first.\n\n## Acceptance criteria\n\n- When I open the home page, I see today's menu." };
const REVIEWED: Brouillon = { ...DRAFT, title: "Show the lunch menu and its prices on the home page" };

const actionsEmpty = () => {
  const facts: string[] = [];
  return {
    faits: facts,
    ecrire: (text: string) => void facts.push(`ecrire ${text}`),
    envoyer: () => void facts.push("envoyer"),
    oui: () => void facts.push("oui"),
    changer: () => void facts.push("changer"),
    fermer: () => void facts.push("fermer"),
  };
};
const set = (state: State, actions = actionsEmpty()) => setFirstTicket(doc, { depot: REPOSITORY, etat: state }, actions) as unknown as Fake;
const buttons = (or: Fake) => or.dessous("button").filter(({ className }) => className !== "aide");
const button = (or: Fake, text: string) => buttons(or).find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${buttons(or).map(({ textContent }) => textContent).join(", ")}`);
const field = (or: Fake) => or.dessous("textarea")[0] ?? assert.fail("pas de champ");
// Tout ce que l'écran montre, survols compris (leur texte est le nom accessible de leur « ? »).
const allTheText = (or: Fake) => [or.textContent, ...[...or.descendants()].map(({ ariaLabel, placeholder, title }) => `${ariaLabel} ${placeholder} ${title}`)].join(" ");

describe("le premier ticket, ses morceaux", () => {
  test("la question : le second demande ce qu'il faut changer d'abord, un champ pour la réponse, « send » éteint tant qu'il est vide", () => {
    const actions = actionsEmpty();
    const card = set({ etape: "question", reponse: "" }, actions);
    assert.equal(card.dataset.etape, "question");
    assert.equal(card.dessous("p")[0]?.textContent, THE_SECOND);
    assert.equal(card.dessous("h2")[0]?.textContent, QUESTION(REPOSITORY));
    assert.equal(QUESTION(REPOSITORY), "chef/cantine is ready. What do you want to change first?");
    assert.deepEqual(buttons(card).map(({ textContent }) => textContent), [SEND, LATER]);
    const send = button(card, SEND);
    assert.ok(send.className.includes("recommande"));
    assert.equal(send.disabled, true);
    const input = field(card);
    input.value = "Show the menu first";
    input.declencher("input");
    assert.equal(send.disabled, false);
    send.click();
    button(card, LATER).click();
    assert.deepEqual(actions.faits, ["ecrire Show the menu first", "envoyer", "fermer"]);
    // Une réponse déjà tapée revient dans le champ ; une rédaction ratée se dit en une ligne, sa cause au survol.
    const missed = set({ etape: "question", reponse: "Show the menu first", refus: { dit: "the second did not write the ticket", detail: "not logged in" } });
    assert.equal(field(missed).value, "Show the menu first");
    assert.equal(button(missed, SEND).disabled, false);
    assert.ok(missed.dessous("span").some(({ textContent }) => textContent === "the second did not write the ticket"));
    assert.ok(missed.dessous("button").some(({ ariaLabel }) => ariaLabel === "not logged in"));
  });

  test("le second écrit : ce que le chef a dit, et rien à faire — puis la même chose pour une réécriture", () => {
    const written = set({ etape: "redaction", reponse: "Show the menu first" });
    assert.equal(written.dessous("h2")[0]?.textContent, REDACTION);
    assert.ok(written.textContent.includes("“Show the menu first”"));
    assert.deepEqual(buttons(written), []);
    const rewrites = set({ etape: "redaction", reponse: "Show the menu first", brouillon: DRAFT, changements: "Add the prices" });
    assert.equal(rewrites.dessous("h2")[0]?.textContent, REWRITE);
    assert.ok(rewrites.textContent.includes("“Add the prices”"));
  });

  test("le brouillon : son titre, son corps, « yes » recommandé avec son prix au survol, et les changements avec « ask for changes »", () => {
    const actions = actionsEmpty();
    const card = set({ etape: "brouillon", reponse: "x", brouillon: DRAFT, changements: "" }, actions);
    assert.equal(card.dessous("h2")[0]?.textContent, REREAD);
    assert.equal(card.dessous("h3")[0]?.textContent, DRAFT.title);
    assert.ok(card.dessous("div").some(({ textContent }) => textContent === DRAFT.body));
    const yes = button(card, YES);
    assert.ok(yes.className.includes("recommande"));
    assert.ok(card.dessous("button").some(({ ariaLabel }) => ariaLabel === PRICE_YES));
    const change = button(card, CHANGE);
    assert.equal(change.className.includes("recommande"), false);
    assert.equal(change.disabled, true);
    field(card).value = "Add the prices";
    field(card).declencher("input");
    assert.equal(change.disabled, false);
    change.click();
    yes.click();
    assert.deepEqual(actions.faits, ["ecrire Add the prices", "changer", "oui"]);
  });

  test("le « oui » parti, tout attend ; refusé, le brouillon reste avec la raison ; créé, l'issue est sur le rail", () => {
    const inRoute = set({ etape: "creation", reponse: "x", brouillon: DRAFT });
    assert.equal(button(inRoute, YES).disabled, true);
    assert.equal(button(inRoute, CHANGE).disabled, true);
    assert.equal(field(inRoute).disabled, true);
    const refuses = set({ etape: "brouillon", reponse: "x", brouillon: DRAFT, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "gh missing" } });
    assert.equal(button(refuses, YES).disabled, false);
    assert.ok(refuses.dessous("span").some(({ textContent }) => textContent === "nothing was created: GitHub could not be reached"));
    const actions = actionsEmpty();
    const created = set({ etape: "cree", ticket: 7, url: `https://github.com/${REPOSITORY}/issues/7` }, actions);
    assert.equal(created.dessous("h2")[0]?.textContent, CREATED(7));
    assert.equal(CREATED(7), "#7 is on the rail: the kitchen serves it.");
    button(created, CLOSE).click();
    assert.deepEqual(actions.faits, ["fermer"]);
  });

  test("aucun écran ne demande d'ouvrir GitHub ni de taper un label : ni `fire`, ni label, ni GitHub à l'écran", () => {
    const states: State[] = [
      { etape: "question", reponse: "" },
      { etape: "redaction", reponse: "x" },
      { etape: "redaction", reponse: "x", brouillon: DRAFT, changements: "y" },
      { etape: "brouillon", reponse: "x", brouillon: DRAFT, changements: "" },
      { etape: "creation", reponse: "x", brouillon: DRAFT },
      { etape: "cree", ticket: 7, url: "https://github.com/chef/cantine/issues/7" },
    ];
    for (const state of states) assert.doesNotMatch(allTheText(set(state)), /github|label|\bfire\b/i, state.etape);
  });
});

// Un pont doublé : ce que le second rédige, dans l'ordre ; ce que la création rend. Chaque appel est noté.
function bridge(redactions: Redaction[], creation: Creation = { ticket: 7, url: `https://github.com/${REPOSITORY}/issues/7` }) {
  const written: Demande[] = [];
  const created: Brouillon[] = [];
  return {
    rediges: written,
    crees: created,
    rediger: async (_: string, request: Demande) => (written.push(request), redactions.shift() ?? { refus: "rien", detail: "" }),
    creer: async (_: string, draft: Brouillon) => (created.push(draft), creation),
  };
}

describe("le premier ticket tenu", () => {
  test("la réponse part au second ; son brouillon revient — et rien n'est créé avant le « oui »", async () => {
    const standIn = bridge([{ draft: DRAFT }]);
    const renderedOnes: string[] = [];
    const heldOnes = holdTheFirstTickets({ rendre: (project) => void renderedOnes.push(project), ...standIn });
    heldOnes.commencer("cantine");
    assert.deepEqual(heldOnes.de("cantine"), { etape: "question", reponse: "" });
    // Vide, rien ne part.
    await heldOnes.envoyer("cantine");
    assert.deepEqual(standIn.rediges, []);
    heldOnes.ecrire("cantine", "Show the menu first");
    const sending = heldOnes.envoyer("cantine");
    assert.equal(heldOnes.de("cantine")?.etape, "redaction");
    await sending;
    assert.deepEqual(standIn.rediges, [{ answer: "Show the menu first" }]);
    assert.deepEqual(heldOnes.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: DRAFT, changements: "" });
    assert.deepEqual(standIn.crees, []);
    // Une nouvelle question ne revient pas sur un brouillon tenu.
    heldOnes.commencer("cantine");
    assert.equal(heldOnes.de("cantine")?.etape, "brouillon");
    assert.ok(renderedOnes.length > 0 && renderedOnes.every((project) => project === "cantine"));
  });

  test("les changements font réécrire, avec le brouillon vu ; la boucle se répète, et toujours rien n'est créé", async () => {
    const standIn = bridge([{ draft: DRAFT }, { draft: REVIEWED }, { refus: "the second did not write the ticket", detail: "timeout" }]);
    const heldOnes = holdTheFirstTickets({ rendre: () => {}, ...standIn });
    heldOnes.commencer("cantine");
    heldOnes.ecrire("cantine", "Show the menu first");
    await heldOnes.envoyer("cantine");
    // Sans changements tapés, rien ne part.
    await heldOnes.changer("cantine");
    assert.equal(standIn.rediges.length, 1);
    heldOnes.ecrire("cantine", "Add the prices");
    await heldOnes.changer("cantine");
    assert.deepEqual(standIn.rediges[1], { answer: "Show the menu first", draft: DRAFT, changes: "Add the prices" });
    assert.deepEqual(heldOnes.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: REVIEWED, changements: "" });
    // Une réécriture ratée garde le brouillon vu et les changements tapés, et le dit.
    heldOnes.ecrire("cantine", "Shorter title");
    await heldOnes.changer("cantine");
    assert.deepEqual(standIn.rediges[2], { answer: "Show the menu first", draft: REVIEWED, changes: "Shorter title" });
    assert.deepEqual(heldOnes.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: REVIEWED, changements: "Shorter title", refus: { dit: "the second did not write the ticket", detail: "timeout" } });
    assert.deepEqual(standIn.crees, []);
  });

  test("le « oui » crée une fois le brouillon montré ; refusé, il reste, et un second « oui » le reprend", async () => {
    const standIn = bridge([{ draft: DRAFT }], { refus: "nothing was created: GitHub could not be reached", detail: "gh missing" });
    const heldOnes = holdTheFirstTickets({ rendre: () => {}, ...standIn });
    // Pas de brouillon : le « oui » ne crée rien.
    heldOnes.commencer("cantine");
    await heldOnes.oui("cantine");
    assert.deepEqual(standIn.crees, []);
    heldOnes.ecrire("cantine", "Show the menu first");
    await heldOnes.envoyer("cantine");
    const first = heldOnes.oui("cantine");
    // Parti : un second clic ne crée pas une seconde issue.
    await heldOnes.oui("cantine");
    await first;
    assert.deepEqual(standIn.crees, [DRAFT]);
    assert.deepEqual(heldOnes.de("cantine"), { etape: "brouillon", reponse: "Show the menu first", brouillon: DRAFT, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "gh missing" } });
    await heldOnes.oui("cantine");
    assert.deepEqual(standIn.crees, [DRAFT, DRAFT]);
    const ok = holdTheFirstTickets({ rendre: () => {}, ...bridge([{ draft: DRAFT }]) });
    ok.commencer("cantine");
    ok.ecrire("cantine", "Show the menu first");
    await ok.envoyer("cantine");
    await ok.oui("cantine");
    assert.deepEqual(ok.de("cantine"), { etape: "cree", ticket: 7, url: `https://github.com/${REPOSITORY}/issues/7` });
  });

  test("un pont qui lève : la rédaction et la création se disent ratées, rien n'est tenu pour fait", async () => {
    const heldOnes = holdTheFirstTickets({
      rendre: () => {},
      rediger: async () => Promise.reject(new Error("ipc closed")),
      creer: async () => Promise.reject(new Error("ipc closed")),
    });
    heldOnes.commencer("cantine");
    heldOnes.ecrire("cantine", "x");
    await heldOnes.envoyer("cantine");
    assert.deepEqual(heldOnes.de("cantine"), { etape: "question", reponse: "x", refus: { dit: "the app could not ask the second to write the ticket", detail: "ipc closed" } });
    const creation = holdTheFirstTickets({ rendre: () => {}, rediger: async () => ({ draft: DRAFT }), creer: async () => Promise.reject(new Error("ipc closed")) });
    creation.commencer("cantine");
    creation.ecrire("cantine", "x");
    await creation.envoyer("cantine");
    await creation.oui("cantine");
    assert.deepEqual(creation.de("cantine"), { etape: "brouillon", reponse: "x", brouillon: DRAFT, changements: "", refus: { dit: "nothing was created: GitHub could not be reached", detail: "ipc closed" } });
  });
});

// La vue jouée entière.
const PATH = "/home/chef/.config/brigade/app.json";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };
const startup = () => () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const facts = (): Facts => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
});
const page = (vue: Played) => vue.element("parcours-premier-projet");
const first = (vue: Played) => page(vue).dessous("section").find(({ className }) => className.split(" ").includes("premier-ticket")) ?? assert.fail("pas de premier ticket");

// Un ordinateur sans projet : « Add a project », chef/cantine choisi — prêt pour Brigade —, cet ordinateur le cuit.
async function cantineReady(answers: Answers) {
  let vue: Played | undefined;
  vue = await playTheVue({
    demarrage: startup(),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [], unreadable: [] }),
    depotsDuChef: () => ({ depots: [{ depot: REPOSITORY, base: "main" }] }),
    ouvrirDUneStation: (name, repository, base) => {
      vue?.dire("surConfiguration", forTheBar({ chemin: PATH, projets: [{ nom: name, dossier: `/home/chef/Brigade/${name}`, depot: repository, base: base ?? "main" } satisfies Project] }), []);
      return { state: "open", project: name, repository: repository, folder: `/home/chef/Brigade/${name}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    servirUnProjet: (repository) => ({ depots: [repository] }),
    checkRepoSetup: () => ({ ready: true, missingBindings: [], missingLabels: [] }),
    espace: () => [SECOND],
    departDuProjet: () => ({ aucune: true }),
    ...answers,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  button(vue.element("ajout"), REPOSITORY).click();
  await repos();
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "cantine", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts()) }] }), demande: vue.dernier("faits")[0] as number });
  await repos();
  button(page(vue), "this computer").click();
  await repos();
  return vue;
}
const type = async (vue: Played, text: string) => {
  const input = field(first(vue));
  input.value = text;
  input.declencher("input");
  await repos();
};
const actionsOfBridge = (vue: Played, action: string) => vue.appels.filter((call) => call.geste === action).map(({ args }) => args);

describe("la vue jouée : un projet prêt, son premier ticket écrit dans l'app", () => {
  test("la question sur le projet prêt, la réponse, le brouillon, une réécriture, puis le « oui » : une seule création, après le « oui »", async () => {
    const redactions: Redaction[] = [{ draft: DRAFT }, { draft: REVIEWED }];
    const vue = await cantineReady({
      redigerLePremierTicket: () => redactions.shift() ?? { refus: "rien", detail: "" },
      creerLePremierTicket: () => ({ ticket: 7, url: `https://github.com/${REPOSITORY}/issues/7` }),
    });
    // Prêt : le rail reprend la page, et au-dessus le second demande au chef ce qu'il veut changer d'abord.
    assert.equal(vue.element("main").dataset.parcours, undefined);
    assert.equal(first(vue).dataset.etape, "question");
    assert.equal(first(vue).dessous("h2")[0]?.textContent, QUESTION(REPOSITORY));
    await type(vue, "Show the menu first");
    button(first(vue), SEND).click();
    await repos();
    assert.deepEqual(actionsOfBridge(vue, "redigerLePremierTicket"), [["cantine", { answer: "Show the menu first" }]]);
    // Le brouillon montré : son titre et son corps ; rien n'est créé.
    assert.equal(first(vue).dataset.etape, "brouillon");
    assert.equal(first(vue).dessous("h3")[0]?.textContent, DRAFT.title);
    assert.deepEqual(actionsOfBridge(vue, "creerLePremierTicket"), []);
    // Des changements : le second réécrit, avec le brouillon vu ; toujours rien de créé.
    await type(vue, "Add the prices");
    button(first(vue), CHANGE).click();
    await repos();
    assert.deepEqual(actionsOfBridge(vue, "redigerLePremierTicket")[1], ["cantine", { answer: "Show the menu first", draft: DRAFT, changes: "Add the prices" }]);
    assert.equal(first(vue).dessous("h3")[0]?.textContent, REVIEWED.title);
    assert.deepEqual(actionsOfBridge(vue, "creerLePremierTicket"), []);
    // Le « oui » : une création, du brouillon montré ; l'issue est sur le rail.
    button(first(vue), YES).click();
    await repos();
    assert.deepEqual(actionsOfBridge(vue, "creerLePremierTicket"), [["cantine", REVIEWED]]);
    assert.equal(first(vue).dessous("h2")[0]?.textContent, CREATED(7));
    // Rien n'a été écrit dans le terminal du second : le chef n'a rien à y taper.
    assert.deepEqual(actionsOfBridge(vue, "ecrire"), []);
    button(first(vue), CLOSE).click();
    await repos();
    assert.equal(page(vue).hidden, true);
  });

  test("une rédaction qui échoue se dit sur la question, la réponse gardée ; « send » la reprend", async () => {
    const redactions: Redaction[] = [{ refus: "the second did not write the ticket", detail: "not logged in" }, { draft: DRAFT }];
    const vue = await cantineReady({ redigerLePremierTicket: () => redactions.shift() ?? { refus: "rien", detail: "" } });
    await type(vue, "Show the menu first");
    button(first(vue), SEND).click();
    await repos();
    assert.equal(first(vue).dataset.etape, "question");
    assert.equal(field(first(vue)).value, "Show the menu first");
    assert.ok(first(vue).dessous("span").some(({ textContent }) => textContent === "the second did not write the ticket"));
    button(first(vue), SEND).click();
    await repos();
    assert.equal(first(vue).dataset.etape, "brouillon");
    assert.deepEqual(actionsOfBridge(vue, "creerLePremierTicket"), []);
  });
});
