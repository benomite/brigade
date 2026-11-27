// La visite d'une vraie cuisine (#4087, née visite guidée du premier lancement, #3165). D'abord ses morceaux, devant un
// faux document : les six étapes dans l'ordre, chacune ancrée sur un élément vivant et dite en une ou deux phrases qui
// nomment le mot de Brigade ; une étape sans rien de vivant qui le dit et montre le dernier exemple ; la bulle, son « next »
// et son seul appel à agir à la dernière ; l'écran de la cuisine visitée, en lecture seule — en lecture, lu, illisible ;
// la visite tenue. Puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : la visite choisie sur l'écran
// d'accueil, lue sur GitHub sans clone ni ajout, ses étapes sur la cuisine lue, quittée d'une étape avancée, rejouée depuis
// la barre, sa lecture qui échoue puis se relit, et son dernier geste qui mène à l'ajout d'un projet.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts, type Board } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening, StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { putAside } from "../../src/awaiting.ts";
import {
  ADD_THE_ITS_OWN,
  COOK_IN_PROGRESS,
  COOK_EXAMPLE,
  COOK_WITHOUT_EXAMPLE,
  REPOSITORY_OF_THE_VISIT,
  stepsOfTheVisit,
  READ_OF_RAIL,
  markerOfTarget,
  WORD_COOK,
  WORD_PASS,
  WORD_RAIL,
  WORD_SECOND,
  WORD_SERVED,
  WORD_TODO,
  PASS_IN_PROGRESS,
  PASS_EXAMPLE,
  PASS_WITHOUT_EXAMPLE,
  setTheKitchenVisited,
  setVisit,
  RANK,
  REPLAY,
  SERVED_STEP,
  SERVED_WITHOUT_EXAMPLE,
  NEXT,
  holdTheVisit,
  TEXT_SECOND,
  TODO_IN_PROGRESS,
  TODO_EMPTY,
  findTheTarget,
  type ColumnRead,
  type Step,
} from "../../src/vue/visit/visit.js";
import { Fake, FakeStorage, playTheVue, type Played, repos } from "../helpers/false-vue.ts";

// Les mots de l'écran de la visite et de l'écran d'accueil, tels que le nouveau venu les lit.
const VISIT = "visit a real kitchen";
const QUIT = "leave the visit";
const REREAD = "read again";
const READ_ONLY = "Read-only: you watch the kitchen cook, nothing here acts on its tickets.";
const SECOND_OF_THE_VISIT = "Your second opens with your own project.";
const KITCHEN_UNREADABLE = "Brigade's kitchen cannot be read right now.";
const doc = { createElement: (balise: string) => new Fake(balise) };

const card = (ticket: number) => ({ ticket, ouvrable: true, attendu: false, attend: [], fiche: {} }) as unknown as ColumnRead["cartes"][number];
const column = (name: string, ...tickets: number[]): ColumnRead => ({ nom: name, cartes: tickets.map(card) });
// Le rail d'un moment où tout bouge : #30 en cuisson, #31 en pass, #12 et #9 servis (le plus récent d'abord), #40 qui attend.
const ALIVE = [column("On the rail", 21), column("Taken", 30), column("Pass", 31), column("Awaiting you", 40), column("Waiting"), column("Served", 12, 9)];
// Le même moment, sans cook ni pass ni question : seul ce qui a été servi reste à montrer.
const CALM = [column("On the rail", 21), column("Taken"), column("Pass"), column("Awaiting you"), column("Waiting"), column("Served", 12, 9)];
// Rien du tout sur 24 h.
const EMPTY = [column("On the rail"), column("Taken"), column("Pass"), column("Awaiting you"), column("Waiting"), column("Served")];

// Une ou deux phrases : un point final, un point d'interrogation ou un deux-points suivi d'un espace et d'une majuscule.
const sentences = (text: string) => text.split(/(?<=[.?!])\s+(?=[A-Z#])/).length;
const WORDS: Record<string, RegExp> = { rail: /\brail\b/, cook: /\bcook\b/, pass: /\bpass\b/, served: /\bserved\b/i, todo: /red in the column of its step, counted by the TODO/, second: /\bthe second\b/ };

describe("les six étapes, dans l'ordre du ticket", () => {
  test("une étape par élément — le rail, un cook, la pass, un servi, TODO, le second —, chacune en une ou deux phrases qui nomment son mot", () => {
    const steps = stepsOfTheVisit(ALIVE);
    assert.deepEqual(
      steps.map(({ cle: key, mot: word }) => [key, word]),
      [
        ["rail", WORD_RAIL],
        ["cook", WORD_COOK],
        ["pass", WORD_PASS],
        ["served", WORD_SERVED],
        ["todo", WORD_TODO],
        ["second", WORD_SECOND],
      ],
    );
    for (const { cle: key, texte: text } of steps) {
      assert.ok(sentences(text) <= 2, `${key} : ${text}`);
      assert.match(text, WORDS[key] ?? assert.fail(key), key);
    }
  });

  test("le rail nomme ses colonnes telles que l'écran les montre ; chaque étape vivante désigne la carte du moment", () => {
    const steps = stepsOfTheVisit(ALIVE);
    // TODO n'est pas une colonne (#3458) : le rail nomme les colonnes des étapes, celles que l'écran montre.
    assert.match(steps[0]?.texte ?? "", /one column per step — On the rail, Taken, Pass, Waiting, Served\./);
    assert.deepEqual(
      steps.map(({ texte: text, cible: target, exemple: example }) => ({ texte: text, cible: target, exemple: example })),
      [
        { texte: steps[0]?.texte, cible: {}, exemple: undefined },
        { texte: COOK_IN_PROGRESS(30), cible: { colonne: "Taken", ticket: 30 }, exemple: undefined },
        { texte: PASS_IN_PROGRESS(31), cible: { colonne: "Pass", ticket: 31 }, exemple: undefined },
        { texte: SERVED_STEP(12), cible: { colonne: "Served", ticket: 12 }, exemple: undefined },
        { texte: TODO_IN_PROGRESS(40), cible: { colonne: "On the rail", ticket: 40 }, exemple: undefined },
        { texte: TEXT_SECOND, cible: { second: true }, exemple: undefined },
      ],
    );
  });

  test("aucun cook en cours, rien en pass : l'étape dit que rien ne se passe et montre le dernier ticket servi, la dernière livraison jugée", () => {
    const [, cook, pass, served, todo] = stepsOfTheVisit(CALM) as Step[];
    assert.equal(cook?.texte, COOK_EXAMPLE(12));
    assert.match(COOK_EXAMPLE(12), /^No cook is running right now\. Here is the last served ticket instead, #12/);
    assert.deepEqual(cook?.cible, { colonne: "Served", ticket: 12 });
    assert.equal(cook?.exemple, true);
    assert.equal(pass?.texte, PASS_EXAMPLE(12));
    assert.match(PASS_EXAMPLE(12), /^Nothing is in the pass right now\. Here is the last delivery it judged instead, #12/);
    assert.deepEqual(pass?.cible, { colonne: "Served", ticket: 12 });
    assert.equal(pass?.exemple, true);
    assert.equal(served?.texte, SERVED_STEP(12));
    assert.equal(todo?.texte, TODO_EMPTY);
    assert.deepEqual(todo?.cible, { todo: true });
  });

  test("rien servi non plus en 24 h : l'étape le dit, et désigne la colonne où cela se passerait — jamais vide ni cassée", () => {
    const [, cook, pass, served] = stepsOfTheVisit(EMPTY) as Step[];
    assert.deepEqual([cook?.texte, cook?.cible], [COOK_WITHOUT_EXAMPLE, { colonne: "Taken" }]);
    assert.deepEqual([pass?.texte, pass?.cible], [PASS_WITHOUT_EXAMPLE, { colonne: "Pass" }]);
    assert.deepEqual([served?.texte, served?.cible], [SERVED_WITHOUT_EXAMPLE, { colonne: "Served" }]);
    for (const step of stepsOfTheVisit(EMPTY)) assert.ok(step.texte !== "" && sentences(step.texte) <= 2, step.cle);
  });

  test("une question qui attend un autre humain du projet (Awaiting others) est encore ce qu'une carte demande", () => {
    const todo = stepsOfTheVisit([{ nom: "Awaiting you", cartes: [], autres: [card(47)] }])[4];
    assert.equal(todo?.texte, TODO_IN_PROGRESS(47));
    // Repliée à côté de l'entrée « TODO (N) », hors des colonnes (#3458).
    assert.deepEqual(todo?.cible, { todo: true, ticket: 47 });
  });

  test("une carte qui attend le chef est désignée dans la colonne de son étape, rouge (#3458)", () => {
    const inPass = { ...card(41), attendu: true, etape: "Pass" };
    const steps = stepsOfTheVisit([column("On the rail", 21), column("Taken"), column("Pass", 31), { nom: "Awaiting you", cartes: [inPass] }, column("Waiting"), column("Served")]);
    assert.deepEqual(steps[4]?.cible, { colonne: "Pass", ticket: 41 });
    assert.doesNotMatch(steps[0]?.texte ?? "", /Awaiting you/);
  });

  test("le rail pas encore lu : les étapes qui montrent un exemple le disent, au lieu d'un « rien ne se passe » qui serait faux", () => {
    const steps = stepsOfTheVisit(undefined);
    assert.equal(steps.length, 6);
    assert.deepEqual(steps.slice(0, 5).map(({ texte: text }) => text), Array(5).fill(READ_OF_RAIL));
    assert.equal(steps[5]?.texte, TEXT_SECOND);
  });
});

// Le rail tel que vue.js le pose : la rangée `.colonnes`, une `section.colonne` par colonne (`data-colonne`), une carte
// par ticket (`data-ticket`).
function oneRail() {
  const rail = new Fake("section");
  const row = new Fake("div");
  row.className = "colonnes";
  for (const { nom: name, cartes: cards } of ALIVE) {
    const section = new Fake("section");
    section.className = "colonne";
    section.dataset.colonne = name;
    const list = new Fake("ol");
    for (const { ticket } of cards) {
      const li = new Fake("li");
      li.className = "bon";
      li.dataset.ticket = String(ticket);
      list.append(li);
    }
    section.append(list);
    row.append(section);
  }
  rail.append(row);
  return { rail, rangee: row, second: new Fake("aside") };
}

describe("l'élément vivant que l'étape désigne", () => {
  test("la carte du ticket dans sa colonne ; la rangée pour le rail ; la colonne du second", () => {
    const screen = oneRail();
    const [rail, cook, , , , second] = stepsOfTheVisit(ALIVE) as Step[];
    assert.equal(findTheTarget(screen, rail?.cible ?? {}), screen.rangee);
    const found = findTheTarget(screen, cook?.cible ?? {});
    assert.equal(found.dataset.ticket, "30");
    assert.equal(found.parentElement?.parentElement?.dataset.colonne, "Taken");
    assert.equal(findTheTarget(screen, second?.cible ?? {}), screen.second);
  });

  test("l'entrée « TODO (N) », et la carte d'autrui repliée à côté d'elle ; sans entrée posée, la rangée", () => {
    const screen = oneRail();
    assert.equal(findTheTarget(screen, { todo: true }), screen.rangee);
    const todo = new Fake("div");
    todo.className = "todo-du-rail";
    const li = new Fake("li");
    li.className = "bon";
    li.dataset.ticket = "47";
    todo.append(li);
    screen.rail.append(todo);
    assert.equal(findTheTarget(screen, { todo: true }), todo);
    assert.equal(findTheTarget(screen, { todo: true, ticket: 47 }), li);
  });

  test("une carte partie entre deux lectures : sa colonne ; une colonne absente : la rangée", () => {
    const screen = oneRail();
    assert.equal(findTheTarget(screen, { colonne: "Pass", ticket: 99 }).dataset.colonne, "Pass");
    assert.equal(findTheTarget(screen, { colonne: "Backlog" }), screen.rangee);
  });

  test("marquée, elle porte `data-visite` ; la suivante la lui reprend", () => {
    const screen = oneRail();
    const mark = markerOfTarget();
    const first = findTheTarget(screen, { colonne: "Taken", ticket: 30 });
    const second = findTheTarget(screen, { colonne: "Served", ticket: 12 });
    mark(first);
    assert.equal(first.dataset.visite, "");
    mark(second);
    assert.equal(first.dataset.visite, undefined);
    assert.equal(second.dataset.visite, "");
    mark(undefined);
    assert.equal(second.dataset.visite, undefined);
  });
});

describe("la bulle de l'étape", () => {
  const facts: string[] = [];
  const actions = { suivante: () => void facts.push("suivante"), ajouter: () => void facts.push("ajouter") };
  const steps = stepsOfTheVisit(ALIVE);
  const buttons = (bubble: Fake) => bubble.dessous("button").map(({ textContent }) => textContent);

  test("à chaque étape : où on en est, le mot, la phrase, et « next »", () => {
    for (let rank = 0; rank < steps.length - 1; rank++) {
      const bubble = setVisit(doc, { etapes: steps, rang: rank }, actions) as Fake;
      assert.equal(bubble.dessous("p")[0]?.textContent, RANK(rank + 1, 6));
      assert.equal(bubble.dessous("h3")[0]?.textContent, steps[rank]?.mot);
      assert.equal(bubble.dessous("p").find(({ className }) => className === "dit")?.textContent, steps[rank]?.texte);
      assert.deepEqual(buttons(bubble), [NEXT]);
    }
    (setVisit(doc, { etapes: steps, rang: 0 }, actions) as Fake).dessous("button")[0]?.click();
    assert.deepEqual(facts.splice(0), ["suivante"]);
  });

  test("la dernière : un seul appel à agir, « add my project », le mot même de l'écran d'accueil", () => {
    const bubble = setVisit(doc, { etapes: steps, rang: 5 }, actions) as Fake;
    assert.equal(bubble.dessous("h3")[0]?.textContent, WORD_SECOND);
    assert.deepEqual(buttons(bubble), ["add my project"]);
    assert.equal(bubble.dessous("button").filter((button) => button.dataset.bouton === "recommande").length, 1);
    bubble.dessous("button")[0]?.click();
    assert.deepEqual(facts.splice(0), ["ajouter"]);
  });

  test("une étape qui montre le dernier exemple le marque", () => {
    const calm = stepsOfTheVisit(CALM);
    assert.equal((setVisit(doc, { etapes: calm, rang: 1 }, actions) as Fake).dataset.exemple, "");
    assert.equal((setVisit(doc, { etapes: steps, rang: 1 }, actions) as Fake).dataset.exemple, undefined);
  });
});

// Un tableau tel que le process principal le range de la cuisine lue (visit.ts) : ses colonnes, rien d'autre n'y est lu.
const boardOf = (columns: ColumnRead[]) => ({ rail: { colonnes: columns.map((column) => ({ ton: "", compte: "", vide: `nothing in ${column.nom}`, ...column })), hors: [] } }) as unknown as Board;

describe("l'écran de la cuisine visitée", () => {
  const facts: string[] = [];
  const actions = { quitter: () => void facts.push("quitter"), relire: () => void facts.push("relire") };
  const buttons = (root: Fake) => root.dessous("button").map(({ textContent }) => textContent);

  test("en tête : la cuisine de Brigade, en lecture seule, et « leave the visit », qui quitte", () => {
    const { racine: root } = setTheKitchenVisited(doc, undefined, actions) as { racine: Fake };
    assert.equal(root.dessous("h2")[0]?.textContent, "Brigade's own kitchen");
    assert.ok(root.dessous("span").some(({ textContent }) => textContent === "benomite/brigade"));
    assert.ok(root.dessous("p").some(({ textContent }) => textContent === READ_ONLY));
    const quit = root.dessous("button").find(({ textContent }) => textContent === QUIT) ?? assert.fail("pas de « leave the visit »");
    quit.click();
    assert.deepEqual(facts.splice(0), ["quitter"]);
  });

  test("en lecture : le rail le dit ; le second, que la visite n'ouvre pas, le dit aussi", () => {
    const { rail, second } = setTheKitchenVisited(doc, undefined, actions) as { rail: Fake; second: Fake };
    assert.equal(rail.textContent, READ_OF_RAIL);
    assert.equal(second.dessous("h4")[0]?.textContent, WORD_SECOND);
    assert.equal(second.dessous("p")[0]?.textContent, SECOND_OF_THE_VISIT);
  });

  test("lue : une colonne par étape, une carte par ticket, celles qui attendent un humain rouges en tête de leur étape — et aucun autre geste que de quitter", () => {
    const expected = { ...card(41), titre: "Une question", etape: "Pass", mot: "awaiting you", ton: "rouge" } as unknown as ColumnRead["cartes"][number];
    const columns = [...ALIVE.filter(({ nom: name }) => name !== "Awaiting you"), { nom: "Awaiting you", cartes: [expected] }];
    const { racine: root, rail } = setTheKitchenVisited(doc, { tableau: boardOf(columns) }, actions) as { racine: Fake; rail: Fake };
    const sections = rail.dessous("section");
    assert.deepEqual(sections.map(({ dataset }) => dataset.colonne), ["On the rail", "Taken", "Pass", "Waiting", "Served"]);
    const pass = sections.find(({ dataset }) => dataset.colonne === "Pass") ?? assert.fail("pas de Pass");
    assert.deepEqual(pass.dessous("li").map(({ dataset }) => [dataset.ticket, dataset.carte]), [["41", "attente"], ["31", undefined]]);
    assert.equal(pass.dessous("h4")[0]?.textContent, "Pass2");
    // Son numéro, le mot de son état — dans son ton — et son titre ; une carte sans mot n'en pose pas de vide.
    assert.equal(pass.dessous("li")[0]?.textContent, "#41awaiting youUne question");
    assert.deepEqual(pass.dessous("span").filter(({ className }) => className === "mot-visite").map(({ dataset }) => dataset.ton), ["rouge"]);
    assert.equal(pass.dessous("li")[1]?.textContent, "#31");
    assert.equal(sections.find(({ dataset }) => dataset.colonne === "Waiting")?.dessous("p")[0]?.textContent, "nothing in Waiting");
    assert.deepEqual(buttons(root), [QUIT]);
    // Les étapes désignent ce que cet écran montre.
    assert.equal(findTheTarget({ rail, second: new Fake("aside") }, { colonne: "Taken", ticket: 30 }).dataset.ticket, "30");
  });

  test("illisible : une ligne, la raison au survol, et « read again », qui relit", () => {
    const { racine: root, rail } = setTheKitchenVisited(doc, { sans: "GitHub could not be reached to read the rail of benomite/brigade." }, actions) as { racine: Fake; rail: Fake };
    const line = rail.children[0] ?? assert.fail("rien sur le rail");
    assert.equal(line.dataset.ligne, "erreur");
    assert.match(line.textContent, new RegExp(KITCHEN_UNREADABLE.replace(/[.']/g, "\\$&")));
    assert.ok([...line.descendants(), line].some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("GitHub could not be reached")), "la raison est au survol");
    // Le « ? » est le survol de la raison, pas un geste.
    assert.deepEqual(buttons(root), [QUIT, "?", REREAD]);
    assert.equal(root.dessous("button")[2]?.dataset.bouton, "recommande", "« read again » est le geste recommandé");
    root.dessous("button")[2]?.click();
    assert.deepEqual(facts.splice(0), ["relire"]);
  });
});

describe("la visite tenue", () => {
  test("commencée, elle part de la première étape ; « next » ne va pas au-delà de la dernière ; quittée, elle n'est plus", () => {
    let renderedOnes = 0;
    const visit = holdTheVisit({ rendre: () => void renderedOnes++ });
    // Relue à chaque fois : une assertion ne la fige pas pour la suite.
    const state = () => visit.etat;
    assert.deepEqual(state(), undefined);
    visit.suivante(6);
    assert.deepEqual(state(), undefined, "pas commencée, rien n'avance");
    visit.commencer();
    assert.deepEqual(state(), { rang: 0 });
    for (let times = 0; times < 9; times++) visit.suivante(6);
    assert.equal(state()?.rang, 5);
    visit.quitter();
    assert.deepEqual(state(), undefined);
    visit.commencer();
    assert.deepEqual(state(), { rang: 0 }, "rejouée, elle repart de la première étape");
    assert.equal(renderedOnes, 12);
  });
});

// La vue jouée entière.
const PATH = "/home/chef/.config/brigade/app.json";
const MINE: Project = { nom: "mine", dossier: "/home/chef/Brigade/mine", depot: "chef/mine", base: "main" };
const startup = (projects: Project[]) => ({
  configuration: forTheBar({ chemin: PATH, projets: projects }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
// Le chef n'a encore appairé aucune station : l'ordinateur est neuf.
const NO: StationsOfChef = { state: "listed", unreadable: [], stations: [] };
const OPEN: Opening = { state: "open", project: "brigade", repository: REPOSITORY_OF_THE_VISIT, folder: "/home/chef/Brigade/brigade", cloned: true };

// La cuisine de Brigade telle que le process principal la range (visit.ts) : #30 en cuisson, #31 en pass, #12 servi.
function kitchenRead(inCooking: boolean): { tableau: Board } {
  const A = "2026-11-11T10:04:12.000Z";
  const url = (ticket: number) => `https://github.com/benomite/brigade/issues/${ticket}`;
  const entry = (ticket: number, state: string) => ({ ticket, etat: state, titre: `Ticket ${ticket}`, url: url(ticket), activite: null, attente: null });
  const facts: Facts = {
    etat: "ouverte",
    lu: A,
    dernierTick: A,
    compteurs: { rail: 1, auTravail: inCooking ? 1 : 0, aLaPass: 1, attend: 0, livres24h: 1 },
    dernierEvenement: null,
    rail: [entry(21, "en attente"), ...(inCooking ? [entry(30, "pris")] : []), entry(31, "en pass"), entry(12, "servi")],
    cooks: [],
    attend: [],
  };
  const heldOnes = holdFacts();
  const receivedOne = heldOnes.recevoir(putAside({ projet: "brigade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] }));
  return "tableau" in receivedOne ? { tableau: receivedOne.tableau } : assert.fail("la cuisine figée ne se range pas");
}

const bubble = (vue: Played) => vue.element("visite").dessous("div").find(({ className }) => className === "visite") ?? assert.fail("pas de bulle");
const inHead = (vue: Played) => bubble(vue).dessous("h3")[0]?.textContent;
const said = (vue: Played) => bubble(vue).dessous("p").find(({ className }) => className === "dit")?.textContent;
const visible = (vue: Played, wording: string) => vue.poses().find((p) => p.balise === "button" && !p.hidden && p.textContent === wording);
const button = (vue: Played, wording: string) => vue.element("visite").dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`pas de bouton « ${wording} » : ${vue.element("visite").dessous("button").map(({ textContent }) => textContent).join(", ")}`);
const readings = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "lireLaCuisineVisitee");
const additions = (vue: Played) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const marked = (vue: Played) => vue.poses().filter(({ dataset }) => dataset.visite !== undefined);
const replay = (vue: Played) => vue.poses().find(({ id }) => id === "entree-visite") ?? assert.fail("pas d'entrée pour rejouer la visite");

// Un premier lancement, connecté à GitHub, la cuisine de Brigade lue comme le pont la rend.
async function firstLaunch(read: () => unknown = () => kitchenRead(true)) {
  const vue = await playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: () => ({ login: "newcomer" }), ouvrirDUneStation: () => OPEN, espace: () => [], lireLaCuisineVisitee: read as never }, { stockage: new FakeStorage() });
  await repos();
  return vue;
}
async function visit(vue: Played) {
  (visible(vue, VISIT) ?? assert.fail("pas de « visit a real kitchen »")).click();
  await repos();
}

describe("la vue jouée : la visite choisie sur l'écran d'accueil", () => {
  test("rien ne démarre seul ; choisie, la cuisine de benomite/brigade est lue — sans clone ni ajout — et la visite part de sa première étape", async () => {
    const vue = await firstLaunch();
    assert.deepEqual(readings(vue), [], "rien n'est lu avant le choix");
    assert.equal(vue.element("visite").hidden, true);
    await visit(vue);
    assert.deepEqual(readings(vue).map(({ args }) => args), [[REPOSITORY_OF_THE_VISIT]]);
    assert.deepEqual(additions(vue), []);
    assert.equal(vue.element("visite").hidden, false);
    assert.equal(inHead(vue), WORD_RAIL);
    // Le rail lu : sa rangée de colonnes, désignée.
    assert.deepEqual(marked(vue).map(({ className }) => className), ["colonnes"]);
    assert.ok(vue.element("visite").dessous("li").some(({ dataset }) => dataset.ticket === "30"));
  });

  test("chaque étape désigne ce que la cuisine lue montre ; la dernière, le second, puis « add my project » ouvre l'ajout et quitte la visite", async () => {
    const vue = await firstLaunch();
    await visit(vue);
    button(vue, NEXT).click();
    await repos();
    assert.equal(said(vue), COOK_IN_PROGRESS(30));
    assert.deepEqual(marked(vue).map(({ dataset }) => dataset.ticket), ["30"]);
    button(vue, NEXT).click();
    await repos();
    assert.equal(said(vue), PASS_IN_PROGRESS(31));
    const views = [inHead(vue)];
    for (let times = 0; times < 3; times++) {
      button(vue, NEXT).click();
      await repos();
      views.push(inHead(vue));
    }
    assert.deepEqual(views, [WORD_PASS, WORD_SERVED, WORD_TODO, WORD_SECOND]);
    assert.deepEqual(marked(vue).map(({ balise }) => balise), ["aside"]);
    button(vue, ADD_THE_ITS_OWN).click();
    await repos();
    assert.equal(vue.element("visite").hidden, true);
    assert.equal(vue.element("ajout").hidden, false);
    assert.deepEqual(marked(vue), []);
    assert.deepEqual(additions(vue), [], "l'écran d'ajout s'ouvre : rien n'est encore ajouté");
  });

  test("sans cook en cours, l'étape du cook montre le dernier ticket servi", async () => {
    const vue = await firstLaunch(() => kitchenRead(false));
    await visit(vue);
    button(vue, NEXT).click();
    await repos();
    assert.equal(said(vue), COOK_EXAMPLE(12));
    assert.deepEqual(marked(vue).map(({ dataset }) => dataset.ticket), ["12"]);
  });

  test("quittée d'une étape avancée : « leave the visit » ramène à l'écran d'accueil et ses deux choix", async () => {
    const vue = await firstLaunch();
    await visit(vue);
    for (let times = 0; times < 3; times++) {
      button(vue, NEXT).click();
      await repos();
    }
    assert.equal(bubble(vue).dessous("p")[0]?.textContent, RANK(4, 6));
    button(vue, QUIT).click();
    await repos();
    assert.equal(vue.element("visite").hidden, true);
    assert.deepEqual(vue.element("visite").children, []);
    assert.ok(visible(vue, VISIT) && visible(vue, "add my project"));
  });
});

describe("la vue jouée : la lecture de la cuisine", () => {
  test("une lecture qui lève : une ligne, la raison au survol ; « read again » relit, et la cuisine lue se pose", async () => {
    let times = 0;
    const vue = await firstLaunch(() => (++times === 1 ? Promise.reject(new Error("GitHub could not be reached")) : kitchenRead(true)));
    await visit(vue);
    const rail = () => vue.element("visite").dessous("section").find(({ className }) => className === "rail-de-la-visite") ?? assert.fail("pas de rail");
    assert.equal(rail().children[0]?.dataset.ligne, "erreur");
    assert.ok(rail().textContent.includes(KITCHEN_UNREADABLE));
    assert.ok([...rail().descendants()].some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("GitHub could not be reached")));
    assert.equal(inHead(vue), WORD_RAIL, "la visite reste là, à sa première étape");
    button(vue, REREAD).click();
    await repos();
    assert.equal(readings(vue).length, 2);
    assert.ok(rail().dessous("li").some(({ dataset }) => dataset.ticket === "30"));
  });

  test("un pont qui ne rend rien : la lecture le dit, jamais un écran vide", async () => {
    const vue = await firstLaunch(() => undefined);
    await visit(vue);
    const lines = [...vue.element("visite").descendants()];
    assert.ok(lines.some(({ title, ariaLabel }) => `${title} ${ariaLabel}`.includes("the app gave no answer")));
  });

  test("seule la dernière lecture demandée se pose : une réponse en retard n'écrase pas la suivante", async () => {
    const answers: ((readEntry: unknown) => void)[] = [];
    const vue = await firstLaunch(() => new Promise((resolve) => void answers.push(resolve)));
    await visit(vue);
    button(vue, QUIT).click();
    await repos();
    replay(vue).click();
    await repos();
    assert.equal(answers.length, 2);
    answers[1]?.(kitchenRead(true));
    await repos();
    answers[0]?.({ sans: "late and stale" });
    await repos();
    assert.ok(vue.element("visite").dessous("li").some(({ dataset }) => dataset.ticket === "30"), "la lecture en retard ne remplace pas la dernière");
  });
});

describe("la vue jouée : la visite, avec un compte qui peut écrire sur benomite/brigade", () => {
  test("à chaque étape, l'écran de la visite n'offre que de quitter, d'avancer et, à la fin, « add my project » ; l'app dessous est inerte, rendue quittée", async () => {
    const writer = { login: "maintainer", permission: "admin" } as unknown as { login: string };
    const vue = await playTheVue({ demarrage: () => startup([MINE]), compteGitHub: () => writer, espace: () => [], lireLaCuisineVisitee: (() => kitchenRead(true)) as never }, { stockage: new FakeStorage() });
    await repos();
    assert.equal(vue.element("cadre").inert, false, "hors visite, l'app se manie");
    replay(vue).click();
    await repos();
    const offered: string[][] = [];
    for (let not = 1; not <= 6; not++) {
      offered.push(vue.element("visite").dessous("button").map(({ textContent }) => textContent));
      assert.equal(vue.element("cadre").inert, true, `étape ${not} : aucun geste de l'app dessous ne se manie sous la visite`);
      if (not < 6) button(vue, NEXT).click();
      await repos();
    }
    assert.deepEqual(offered, [...Array(5).fill([QUIT, NEXT]), [QUIT, ADD_THE_ITS_OWN]]);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => /creer|deplacer|commenter|fermer|lancer|poster|approuver|ouvrirDUneStation|clone|ajouter/i.test(action)), []);
    button(vue, QUIT).click();
    await repos();
    assert.equal(vue.element("cadre").inert, false, "quittée, l'app se manie de nouveau");
  });
});

describe("la vue jouée : la visite rejouée depuis la barre", () => {
  test("avec un projet à soi : l'entrée « Replay the visit » la rejoue de sa première étape, sans ouvrir ni ajouter de projet", async () => {
    const vue = await playTheVue({ demarrage: () => startup([MINE]), espace: () => [], lireLaCuisineVisitee: (() => kitchenRead(true)) as never }, { stockage: new FakeStorage() });
    await repos();
    assert.equal(replay(vue).title, REPLAY);
    replay(vue).click();
    await repos();
    button(vue, NEXT).click();
    await repos();
    button(vue, QUIT).click();
    await repos();
    replay(vue).click();
    await repos();
    assert.equal(vue.element("visite").hidden, false);
    assert.equal(inHead(vue), WORD_RAIL);
    assert.equal(vue.element("espace").textContent, "", "aucun projet ne s'ouvre");
    assert.deepEqual(additions(vue), []);
  });
});
