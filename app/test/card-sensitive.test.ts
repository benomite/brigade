// Le ticket sensible dans l'app (ticket 3224, épique 3214). La carte « review before merge » est celle que le runtime pose
// (runtime/src/sensible/, ticket 3223) : son issue et son commentaire de carte sont écrits ici par le runtime même
// (`tenirPourLeChef`), puis lus par l'app comme elle lit GitHub. On vérifie :
//   - la marque « sensitive » sur la carte du rail d'un ticket au label `sensitive`, et sur elle seule, posée par la vue ;
//   - la carte « review before merge » : sa question, le lien de sa PR qui l'ouvre d'un clic, et exactement deux réponses,
//     « Merge » et « Send back » — éteint tant que la note est vide ; chaque réponse part par le pont, faite la carte quitte
//     TODO, refusée elle reste et dit pourquoi ;
//   - ce que le process principal en fait : la commande `sensitive` du runtime, ses arguments, et une note vide qui ne part pas.
// La vue est jouée telle qu'elle est, devant un faux document et un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SENSIBLE, LABEL_SENSITIVE, SORTE_DE_CARTE } from "../../runtime/src/sensible/sensible.ts";
import { tenirPourLeChef, type GitHubDeLaRetenue } from "../../runtime/src/validation-design/validation-design.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { cardOfChefOfTodo } from "../src/card-todo.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { cardOfComment, type CardOfChef } from "../src/board/todo-github.ts";
import type { Terminal } from "../src/terminals.ts";
import { UNKNOWN, playTheReview, reviewOfBody, WITHOUT_NOTE, KIND_SENSITIVE } from "../src/vue/card-sensitive/card-sensitive-github.ts";
import { isSensitive, SENSITIVE_LABEL } from "../src/vue/card-sensitive/label.ts";
import { FIELD, CONFIRMATION_MS, BRAND, MERGE, MERGER, SENT_BACK, SEND_BACK } from "../src/vue/card-sensitive/card-sensitive.js";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const A = "2026-11-11T12:04:12.000Z";
const REPOSITORY = "chef/parade";
const SHA = "5b1d0e7c9a2f4e6081a3b5c7d9e1f20314253647";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

// La carte que le runtime pose pour la livraison verte de #30 (PR #41) : sur le ticket même (ticket 3615), son commentaire de
// carte, dont le marqueur dit la PR — aucune issue à part.
async function setByTheRuntime(): Promise<{ commentaire: string; labels: string[] }> {
  const writtenOnes: { commentaires: string[]; labels: string[] } = { commentaires: [], labels: [] };
  const github: GitHubDeLaRetenue = {
    commenter: async (number, body) => void (number === 30 && writtenOnes.commentaires.push(body)),
    labelliser: async (number, labels) => void (number === 30 && writtenOnes.labels.push(...labels)),
    delabelliser: async () => {},
    fermerIssue: async () => {},
    commentaires: async () => [],
  };
  await tenirPourLeChef(SENSIBLE, github, { depot: REPOSITORY, station: "box", ticket: { number: 30, title: "Delete a user's data on request", labels: ["fire", "sensitive"] }, pr: { number: 41, sha: SHA } });
  return { labels: writtenOnes.labels, commentaire: writtenOnes.commentaires[0] ?? assert.fail("pas de commentaire de carte") };
}
// La carte du chef telle que l'app la lit de GitHub (board/wait-of-chef.ts).
async function cardRead(): Promise<CardOfChef> {
  const { commentaire: body, commentaire: comment } = await setByTheRuntime();
  const marked = cardOfComment(comment) ?? assert.fail("le commentaire de carte ne se lit pas");
  const sensitive = reviewOfBody(REPOSITORY, body) ?? assert.fail("le corps ne dit pas sa PR");
  return { ...marked, sensible: sensitive };
}

describe("ce que l'app lit de GitHub", () => {
  test("le label et la sorte de la carte sont ceux que le runtime écrit", () => {
    assert.equal(SENSITIVE_LABEL, LABEL_SENSITIVE);
    assert.equal(KIND_SENSITIVE, SORTE_DE_CARTE);
    assert.equal(isSensitive(["fire", "sensitive"]), true);
    assert.equal(isSensitive(["fire", "sensitive-data"]), false);
  });

  test("la carte posée par le runtime se lit : sa PR, son adresse, son ticket — et sa question garde « #30 »", async () => {
    const { labels, commentaire: body } = await setByTheRuntime();
    assert.deepEqual(labels, ["chef-todo"]);
    assert.deepEqual(reviewOfBody(REPOSITORY, body), { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${REPOSITORY}/pull/41` });
    const todo = cardOfChefOfTodo(await cardRead()) ?? assert.fail("pas de carte de TODO");
    assert.equal(todo.question, SENSIBLE.question(30, 41));
    assert.match(todo.question ?? "", /^#30 is sensitive/);
    assert.deepEqual(todo.revue, { pr: 41, ticket: 30 });
    assert.deepEqual(todo.choix, [], "ni choix ni réponse libre : ses deux réponses sont sur la carte");
  });

  test("un corps sans le marqueur ne dit aucune PR : la carte le dit, et ne se tranche pas d'ici", async () => {
    assert.equal(reviewOfBody(REPOSITORY, "**#30 is sensitive**\n\nPull request: https://github.com/chef/parade/pull/41"), null);
    assert.equal(reviewOfBody(REPOSITORY, "<!-- brigade:validation-design pr=41 ticket=30 sha=5b1d0e7 -->"), null);
    const { sensible: _, ...withoutPR } = await cardRead();
    assert.deepEqual(cardOfChefOfTodo(withoutPR)?.revue, { illisible: "its issue does not say which pull request it holds: review it on GitHub" });
    // Le marqueur d'une carte de TODO qui ne dit pas sa PR, ou celui d'une autre sorte, n'en dit aucune non plus.
    assert.equal(reviewOfBody(REPOSITORY, "<!-- brigade:todo kind=review-before-merge -->\n**#30 is sensitive**"), null);
    assert.equal(reviewOfBody(REPOSITORY, "<!-- brigade:todo kind=design-validation pr=41 ticket=30 sha=5b1d0e7 -->"), null);
  });

});

// ── La vue ──

const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// #30 au label `sensitive` et #31 sans, tous deux en pass ; la carte #62 « review before merge » de #30 dans TODO.
const facts = (chef: CardOfChef): Facts =>
  ({
    etat: "ouverte",
    lu: "2026-11-11T12:04:11.000Z",
    dernierTick: "2026-11-11T12:04:11.000Z",
    compteurs: { rail: 2, auTravail: 0, aLaPass: 2, attend: 1, livres24h: 0 },
    dernierEvenement: null,
    rail: [
      { ticket: 30, etat: "en pass", titre: "Delete a user's data on request", url: `https://github.com/${REPOSITORY}/issues/30`, sensible: true },
      { ticket: 31, etat: "en pass", titre: "Show the journal", url: `https://github.com/${REPOSITORY}/issues/31` },
    ],
    cooks: [],
    attend: [{ ticket: 62, titre: "review before merge", url: `https://github.com/${REPOSITORY}/issues/62`, chef }],
  }) as unknown as Facts;
const drawable = (chef: CardOfChef): Drawable => holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(chef)) }] });

async function open(answers: Answers = {}): Promise<Played> {
  const chef = await cardRead();
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }], ...answers } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const read = () => {
    const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
    vue.dire("surFaits", { ...drawable(chef), demande: requests.at(-1)?.args[0] as number });
  };
  read();
  await repos();
  return Object.assign(vue, { lire: read });
}

const theCard = (vue: Played) => (cardOfTicket(vue, 62) ?? assert.fail("pas de carte #62")).dessous("section").find(({ className }) => className.includes("carte-sensible"));
const button = (or: Fake, wording: string) => or.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`pas de bouton « ${wording} »`);
const type = (or: Fake, text: string) => {
  const field = or.dessous("textarea")[0] ?? assert.fail("pas de champ");
  field.value = text;
  field.declencher("input");
};
const marks = (card: Fake | undefined) => (card ?? assert.fail("pas de carte")).dessous("span").filter(({ className }) => className.includes("etiquette-sensible"));

describe("la marque « sensitive » sur la carte du ticket", () => {
  test("la carte d'un ticket au label `sensitive` la porte, en mots et au survol ; celle d'un ticket sans le label non", async () => {
    const vue = await open();
    // Le ticket livré et sa revue sont une seule carte, dans Pass (#3519) : elle porte la marque du ticket.
    assert.equal(cardOfTicket(vue, 30), undefined, "le ticket livré n'a pas de seconde carte à côté de sa revue");
    const [brand, ...others] = marks(cardOfTicket(vue, 62));
    assert.equal(others.length, 0);
    assert.equal(brand?.textContent, BRAND);
    assert.match(brand?.title ?? "", /labelled sensitive/);
    assert.deepEqual(marks(cardOfTicket(vue, 31)), []);
  });
});

describe("la carte « review before merge »", () => {
  test("la question, le lien de la PR qui l'ouvre d'un clic, et exactement deux réponses — « Merge » recommandé, « Send back » éteint sans note", async () => {
    const vue = await open();
    const card = theCard(vue) ?? assert.fail("pas de carte « review before merge »");
    assert.ok(card.dessous("p").some(({ textContent }) => textContent === SENSIBLE.question(30, 41)));
    button(card, "PR of #30").click();
    assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 62]);
    const wordings = card.dessous("button").map(({ textContent }) => textContent);
    // Hors le lien, « ask the second » de toute carte de TODO et le « ? » du prix de chaque réponse : deux réponses.
    assert.deepEqual(wordings.filter((wording) => !["PR of #30", "ask the second", "?"].includes(wording)), [MERGER, SEND_BACK], "deux réponses, pas une de plus");
    assert.equal(button(card, MERGER).className, "recommande");
    assert.equal(card.dessous("textarea")[0]?.placeholder, FIELD);
    assert.equal(button(card, SEND_BACK).disabled, true);
    type(card, "   \n ");
    assert.equal(button(card, SEND_BACK).disabled, true, "des blancs ne sont pas une note");
    type(card, "Keep the audit log.");
    assert.equal(button(card, SEND_BACK).disabled, false);
  });

  test("le lien ouvre l'adresse de la PR que la carte retient (facts.ts, `pr`)", async () => {
    const heldOnes = holdFacts(() => new Map());
    heldOnes.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts(await cardRead())) }] });
    assert.equal(heldOnes.pr("parade", 62), `https://github.com/${REPOSITORY}/pull/41`);
  });

  test("« Send back » sans note n'envoie rien", async () => {
    const vue = await open();
    button(theCard(vue) ?? assert.fail("pas de carte"), SEND_BACK).click();
    await repos();
    assert.ok(!vue.appels.some(({ geste: action }) => action === "gesteSensible"));
  });

  test("« Merge » part par le pont ; fait, la carte dit « merged ✓ » puis quitte TODO, et les faits sont relus", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await open({ gesteSensible: () => ({ fait: "chef/parade#41 merged, card #62 closed — ticket #30 is served" }) });
    const before = vue.appels.filter(({ geste: action }) => action === "relireBox").length;
    button(theCard(vue) ?? assert.fail("pas de carte"), MERGER).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "merger" }]);
    assert.equal(button(theCard(vue) ?? assert.fail("partie sans un mot"), MERGE).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(cardOfTicket(vue, 62), undefined, "plus dans TODO");
    assert.ok(vue.appels.filter(({ geste: action }) => action === "relireBox").length > before, "les faits sont relus");
    (vue as Played & { lire: () => void }).lire();
    await repos();
    assert.equal(cardOfTicket(vue, 62), undefined, "la lecture qui la porte encore ne la ramène pas");
  });

  test("« Send back » part avec la note ; fait, la carte dit « sent back ✓ » puis quitte TODO", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const vue = await open({ gesteSensible: () => ({ fait: "chef/parade#41 sent back" }) });
    const card = theCard(vue) ?? assert.fail("pas de carte");
    type(card, "Keep the audit log.");
    button(card, SEND_BACK).click();
    await repos();
    assert.deepEqual(vue.dernier("gesteSensible"), ["parade", 62, { geste: "renvoyer", note: "Keep the audit log." }]);
    assert.equal(button(theCard(vue) ?? assert.fail("partie sans un mot"), SENT_BACK).disabled, true);
    t.mock.timers.tick(CONFIRMATION_MS);
    await repos();
    assert.equal(cardOfTicket(vue, 62), undefined);
  });

  test("refusée, la carte reste, dit pourquoi en une ligne et garde la note et ses deux réponses", async () => {
    const vue = await open({ gesteSensible: () => ({ refus: "nothing was done: the head of PR #41 moved since card #62", detail: "brigade : the head of PR #41 moved" }) });
    type(theCard(vue) ?? assert.fail("pas de carte"), "Keep the audit log.");
    button(theCard(vue) ?? assert.fail("pas de carte"), SEND_BACK).click();
    await repos();
    const card = theCard(vue) ?? assert.fail("la carte est partie");
    assert.ok(card.dessous("p").some(({ textContent }) => textContent.includes("the head of PR #41 moved since card #62")));
    assert.equal(card.dessous("textarea")[0]?.value, "Keep the audit log.");
    assert.equal(button(card, MERGER).disabled, false);
    assert.equal(button(card, SEND_BACK).disabled, false);
  });
});

// ── Le process principal : la commande `sensitive` du runtime ──

describe("les deux réponses jouées par la commande du runtime", () => {
  class Output extends Error {
    code: number;
    constructor(code: number) {
      super(`exit ${code}`);
      this.code = code;
    }
  }
  const review = { pr: 41, ticket: 30, sha: SHA, url: `https://github.com/${REPOSITORY}/pull/41` };
  const commandWho = (doIt: (call: { args: string[]; dire: (l: string) => void; redire: (l: string) => void }) => Promise<void>, played: string[][] = []) => async () => ({
    principal: async (call: { args: string[]; env: Record<string, string | undefined>; dire: (l: string) => void; redire: (l: string) => void }) => (played.push(call.args), doIt(call)),
    estUneSortie: (error: unknown): error is { code: number } => error instanceof Output,
  });

  test("« Merge » joue `merge <owner>/<repo>#<PR>`, « Send back » `send-back … --note <note>` ; ce que la commande dit est rendu", async () => {
    const played: string[][] = [];
    const command = commandWho(async ({ args, dire: tell }) => tell(`${args[0]} done`), played);
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: review, geste: { geste: "merger" }, env: {}, commande: command }), { fait: "merge done" });
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: review, geste: { geste: "renvoyer", note: "  Keep the audit log.\r\nThanks.  " }, env: {}, commande: command }), { fait: "send-back done" });
    assert.deepEqual(played, [
      ["merge", "chef/parade#41"],
      ["send-back", "chef/parade#41", "--note", "Keep the audit log.\nThanks."],
    ]);
  });

  test("une note vide, ou une carte que la lecture ne porte plus, ne lancent pas la commande", async () => {
    const command = async () => assert.fail("la commande n'est pas lancée");
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: review, geste: { geste: "renvoyer", note: " \n " }, env: {}, commande: command }), { refus: WITHOUT_NOTE, detail: "" });
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: undefined, geste: { geste: "merger" }, env: {}, commande: command }), { refus: UNKNOWN, detail: "" });
  });

  test("la commande qui refuse dit pourquoi ; celle qui ne tourne pas le dit, son erreur au survol", async () => {
    const refuses = commandWho(async ({ redire }) => {
      redire("brigade : PR #41 is not held by a review before merge card");
      throw new Output(1);
    });
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: review, geste: { geste: "merger" }, env: {}, commande: refuses }), { refus: "nothing was done: the PR of #30 is not held by a review before merge card", detail: "brigade : PR #41 is not held by a review before merge card" });
    const absent = async () => {
      throw new Error("Cannot find module sensible/commande.ts");
    };
    assert.deepEqual(await playTheReview({ depot: REPOSITORY, revue: review, geste: { geste: "merger" }, env: {}, commande: absent }), { refus: "nothing was done: the kitchen's command could not run", detail: "Cannot find module sensible/commande.ts" });
  });
});

// Ticket 3716 : GitHub numérote issues et PR d'une seule suite — la PR #41 de #30 se lirait comme un ticket. La carte dit sa
// PR par son ticket, dans sa question, son lien et le prix de « Merge » ; le lien ouvre toujours la PR.
describe("la carte « review before merge » dit sa PR par son ticket (ticket 3716)", () => {
  test("dans TODO : « PR of #30 », jamais « #41 » — texte et survols ; son lien ouvre la PR de la carte", async () => {
    const vue = await open();
    const card = theCard(vue) ?? assert.fail("pas de carte « review before merge »");
    const hovers = [...card.descendants()].flatMap(({ title, ariaLabel }) => [title, ariaLabel ?? ""]);
    assert.doesNotMatch([card.textContent, ...hovers].join("\n"), /#41\b/);
    assert.match(card.textContent, /review the delivery of #30 \(PR 41\) before it is merged/);
    assert.ok(hovers.some((hover) => hover.startsWith("The PR of #30 is merged into the integration branch")), hovers.join(" | "));
    button(card, "PR of #30").click();
    assert.deepEqual(vue.dernier("ouvrirPr"), ["parade", 62]);
  });
});
