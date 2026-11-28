// Les cartes ne disparaissent pas de la vue du rail tant que GitHub les tient (#2151) : la vue jouée telle qu'elle est,
// devant un faux document (helpers/false-vue.ts), sur ce que le process principal range des lectures du tableau de la
// cuisine (facts.ts).
//   - Une lecture ratée en ligne — GitHub qui limite les appels, refuse, ne répond pas à temps — ne vide aucune colonne :
//     le dernier rail lu reste, et une ligne dit qu'il est périmé, et depuis quand.
//   - Tant que le chef répond sur une carte de TODO, aucune lecture ne la retire, ne la redessine ni ne la déplace, et son
//     texte n'est jamais perdu ; résolue entre-temps, la carte le dit à côté de son texte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import type { Rendered } from "../src/card-todo.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const PARADE = "parade";
const a = (minute: number) => `2026-11-03T16:${String(minute).padStart(2, "0")}:00.000Z`;
const ISSUE = (ticket: number) => `https://github.com/chef/parade/issues/${ticket}`;
const PRODUCT = {
  type: "product",
  resume: "The journal export is ready to cook. It can write one file per project, or one for all.",
  question: "One journal export per project, or a single one?",
  choix: [
    { texte: "One per project.", suite: "resume" },
    { texte: "A single export.", suite: "resume" },
  ],
};
// Sa carte du chef, telle que son issue la pose sur GitHub (board/todo-github.ts).
const CHEF = { sorte: PRODUCT.type, texte: [PRODUCT.question, ...PRODUCT.choix.map(({ texte: text, suite }) => `- [${suite}] ${text}`)].join("\n") };
// Le rail lu : #14 en cuisine, #21 qui attend le chef sur sa carte.
const FACTS: Facts = {
  etat: "ouverte",
  lu: a(0),
  compteurs: { rail: 2, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: ISSUE(14), activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [{ ticket: 21, titre: "L'export du journal", url: ISSUE(21), chef: CHEF }],
};
// Le chef a tranché #21 ailleurs (sur GitHub, son téléphone) : la cuisine l'a pris.
const SLICE: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, auTravail: 2, attend: 0 }, rail: [FACTS.rail[0]!, { ...FACTS.rail[1]!, etat: "pris" }], attend: [] };
// Un autre ticket arrive sur le rail, #21 attend toujours.
const ARRIVES: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, rail: 3 }, rail: [...FACTS.rail, { ticket: 30, etat: "en attente", titre: "Un ticket neuf", url: ISSUE(30), activite: null }] };

const startup = (served: boolean) => () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => served),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });

async function open(answers: Answers = {}, served = true): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup(served), espace: () => [], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Une lecture du tableau, passée par le process principal tel qu'il est.
const readOne = (facts: Facts, minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
// Une lecture du tableau ratée en ligne : GitHub a répondu, mais n'a pas donné le tableau (board/read.ts).
const LIMIT = "GitHub refused to read the rail of chef/parade (HTTP 403): API rate limit exceeded for user ID 1.";
const missed = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: LIMIT, atteinte: true, cas: null, duTableau: true });
const receive = (vue: Played, receivedOne: Drawable) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });

const columns = (vue: Played) => vue.element("rail").dessous("section").filter(({ className }) => className === "colonne");
const content = (vue: Played) => columns(vue).map((column) => [column.children[0]?.children[0]?.textContent, column.dessous("li").filter(({ className }) => className === "bon").map((slip) => slip.children[0]?.children[0]?.textContent)]);
const stale = (vue: Played) => vue.element("rail").dessous("p").filter(({ className }) => className.split(" ").includes("perime"));
const hour = (minute: number) => new Date(a(minute)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const cardTodo = (slip: Fake) => slip.dessous("section").find(({ className }) => className === "carte-todo") ?? assert.fail("pas de carte de TODO");
const field = (slip: Fake) => slip.dessous("textarea")[0] ?? assert.fail("pas de champ");
const resolved = (slip: Fake) => slip.dessous("p").find(({ className }) => className === "resolue-entre-temps")?.textContent;
function type(slip: Fake, text: string): Fake {
  const input = field(slip);
  cardTodo(slip).declencher("focusin");
  input.value = text;
  input.declencher("input");
  return input;
}

describe("une lecture ratée ne vide aucune colonne (#2151)", () => {
  test("le dernier rail lu reste, entier, et une ligne dit qu'il est périmé depuis la première lecture ratée — la raison au survol ; la lecture revenue, la ligne part", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const readOnes = content(vue);
    assert.ok(readOnes.flatMap(([, tickets]) => tickets ?? []).length === 2, JSON.stringify(readOnes));

    receive(vue, missed(2));
    receive(vue, missed(3));
    assert.deepEqual(content(vue), readOnes);
    assert.doesNotMatch(vue.element("rail").textContent, /not drawn|NOT READ/);
    // L'âge se compte à l'horloge de l'app, que ce test ne tient pas : son texte est vérifié dans test/vue/rail-read-stale.test.ts.
    assert.deepEqual(stale(vue).map(({ textContent }) => textContent.replace(/ read .+ ago$/, " read N ago")), [`The last reading of GitHub failed — the rail shows the ${hour(0).replace(/\s[AP]M$/, "")} reading · read N ago`]);
    assert.match(stale(vue)[0]?.title ?? "", /API rate limit exceeded/);

    receive(vue, readOne(ARRIVES, 4));
    assert.deepEqual(stale(vue), []);
    assert.ok(cardOfTicket(vue, 30) !== undefined);
  });

  test("un projet qu'aucune station de cet ordinateur ne sert garde ses colonnes : la phrase du gist des stations ne prend pas leur place", async () => {
    const vue = await open({}, false);
    receive(vue, readOne(FACTS, 0));
    const readOnes = content(vue);
    assert.ok(readOnes.length > 0);

    receive(vue, missed(2));
    assert.deepEqual(content(vue), readOnes);
    assert.equal(stale(vue).length, 1);
  });

  test("sans rien de lu avant, la lecture ratée se dit comme avant : il n'y a pas de rail à garder", async () => {
    const vue = await open();
    receive(vue, missed(2));
    assert.deepEqual(columns(vue), []);
    assert.match(vue.element("rail").textContent, /the rail is not drawn: NOT READ FROM GITHUB — tried at /);
  });
});

describe("un rail lu ne se vide jamais pendant qu'une relecture se fait (#3337)", () => {
  test("le fichier des projets relu garde le rail à l'écran : jamais « first read in progress », et la lecture qui suit le remplace", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const readOnes = content(vue);
    assert.ok(readOnes.flatMap(([, tickets]) => tickets ?? []).length === 2, JSON.stringify(readOnes));

    vue.dire("surConfiguration", startup(true)().configuration, []);
    await repos();
    assert.deepEqual(content(vue), readOnes);
    assert.doesNotMatch(vue.element("rail").textContent, /first read/);

    receive(vue, readOne(ARRIVES, 4));
    assert.ok(cardOfTicket(vue, 30) !== undefined);
  });
});

describe("la carte où le chef répond ne bouge pas sous ses mains (#2151)", () => {
  test("une lecture qui arrive pendant qu'il tape ne retire, ne redessine ni ne déplace la carte : la même, son texte dedans ; le clavier parti, la lecture est posée", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const slip = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    const input = type(slip, "One per project, and say so in the README");
    const before = content(vue);

    receive(vue, readOne(ARRIVES, 1));
    assert.equal(cardOfTicket(vue, 21), slip);
    assert.equal(field(slip), input);
    assert.equal(input.value, "One per project, and say so in the README");
    assert.deepEqual(content(vue), before);
    assert.equal(resolved(slip), undefined);

    cardTodo(slip).declencher("focusout", { relatedTarget: null });
    assert.ok(cardOfTicket(vue, 30) !== undefined);
    const rested = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    assert.equal(field(rested).value, "One per project, and say so in the README");
  });

  test("passer du champ à un bouton de la même carte la garde tenue", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const slip = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    type(slip, "A single one");
    const send = slip.dessous("button").find(({ textContent }) => textContent === "send") ?? assert.fail("pas de « send »");
    cardTodo(slip).declencher("focusout", { relatedTarget: send });
    receive(vue, readOne(ARRIVES, 1));
    assert.equal(cardOfTicket(vue, 21), slip);
    assert.equal(cardOfTicket(vue, 30), undefined);
  });

  test("résolue entre-temps, la carte le dit à côté du texte du chef, sans l'effacer ; le clavier parti, elle reste à côté de l'entrée TODO, hors des colonnes, avec son texte, jusqu'à ce qu'il l'écarte (#3458)", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const slip = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    const input = type(slip, "One per project");

    receive(vue, readOne(SLICE, 1));
    assert.equal(cardOfTicket(vue, 21), slip);
    assert.equal(input.value, "One per project");
    assert.equal(resolved(slip), "resolved meanwhile: #21 is now in Cooks — your text is kept here, nothing was sent");

    cardTodo(slip).declencher("focusout", { relatedTarget: null });
    const taken = columns(vue).find((column) => column.children[0]?.children[0]?.textContent === "Cooks") ?? assert.fail("pas de colonne Cooks");
    // La réponse gardée n'attend pas le chef : elle est à côté de son TODO, pas dedans (#4238).
    const todo = vue.element("rail").dessous("div").find(({ className }) => className === "a-cote-du-todo") ?? assert.fail("pas de bloc à côté du TODO");
    assert.ok(taken?.dessous("li").some((li) => li.children[0]?.children[0]?.textContent === "#21"));
    const keptOne = todo?.dessous("li").find((li) => li.children[0]?.children[0]?.textContent === "#21") ?? assert.fail("la réponse du chef n'est plus dans TODO");
    assert.equal(field(keptOne).value, "One per project");
    assert.equal(resolved(keptOne), "resolved meanwhile: #21 is now in Cooks — your text is kept here, nothing was sent");
    assert.match(keptOne.textContent, /One journal export per project, or a single one\?/);

    // Une lecture de plus ne l'emporte pas.
    receive(vue, readOne(SLICE, 2));
    const reread = vue.element("rail").dessous("div").find(({ className }) => className === "a-cote-du-todo") ?? assert.fail("pas de bloc à côté du TODO");
    assert.ok(reread.dessous("textarea").some(({ value }) => value === "One per project"));

    (keptOne.dessous("button").find(({ textContent }) => textContent === "dismiss") ?? assert.fail("pas de « dismiss »")).click();
    assert.deepEqual(vue.element("rail").dessous("textarea").filter(({ value }) => value === "One per project"), []);
  });

  test("une lecture ratée pendant la saisie ne touche pas la carte", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS, 0));
    const slip = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    type(slip, "One per project");
    receive(vue, missed(1));
    assert.equal(cardOfTicket(vue, 21), slip);
    assert.equal(resolved(slip), undefined);
  });

  test("répondre finit la saisie : la carte n'est plus tenue, et dit que sa réponse part", async () => {
    let reply: (rendered: Rendered) => void = () => {};
    const vue = await open({ repondreCarte: () => new Promise<Rendered>((done) => (reply = done)) });
    receive(vue, readOne(FACTS, 0));
    const slip = cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21");
    type(slip, "One per project");
    (slip.dessous("button").find(({ textContent }) => textContent === "send") ?? assert.fail("pas de « send »")).click();
    await repos();
    assert.deepEqual(vue.dernier("repondreCarte").slice(1), [21, { question: PRODUCT.question, texte: "One per project" }]);
    assert.match((cardOfTicket(vue, 21) ?? assert.fail("pas de carte #21")).textContent, /sending your answer…/);
    reply({ repondue: true, dit: "posted on the issue", commentaire: 7 });
    await repos();
  });
});
