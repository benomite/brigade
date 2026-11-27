// Les onglets Rail et Second d'un projet ouvert sur un ordinateur neuf ne restent jamais vides (#1435, épique 1427) :
// Rail montre le rail du projet — celui que ses issues, labels et PR disent sur GitHub, le même que pour un projet servi ici, TODO en tête
// avec ses cartes et leurs gestes (#2076) —, ou, tant qu'il ne se lit pas, la phrase qui dit pourquoi, d'après le rail
// que sa station publie (#1432) ; Second montre le second qui part, ou, s'il ne part pas, pourquoi et
// chaque outil qui manque, et le bouton de la page qui dit comment l'obtenir (#1433). Les modules sont joués devant un faux document, puis la vue
// entière devant un faux pont (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { connexionGitHub } from "../../../runtime/src/appairage/stations-du-chef.ts";
import type { RailDuProjet } from "../../../runtime/src/appairage/rail-du-projet.ts";
import { POWER_UP } from "../../src/power-up.ts";
import { ACTIONS_OF_WAIT } from "../../src/wait.ts";
import { putAside } from "../../src/awaiting.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER, holdFacts, type Drawable, type Facts, type RailOfProjectRead } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { actionsOfCard } from "../../src/card-actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { SaysOfSecond, Terminal } from "../../src/terminals.ts";
import { setToolsOfSecond, PAGE_OF, RETRY_THE_SECOND } from "../../src/vue/tools-of-second.js";
import { REREAD } from "../../src/vue/first-launch.js";
import { READ_PUBLISHED, setRailPublished, BOARD_IN_READ, BOARD_NOT_READ, type ActionsOfRailPublished } from "../../src/vue/rail-published.js";
import { red } from "../helpers/red.ts";
import { cardOfTicket, Fake, playTheVue, repos, type Played, type Answers } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const PARADE = "parade";
const PUBLISHED = "2026-10-22T09:12:00.000Z";

// Le rail que parade-box publie pour parade, tel que le runtime le rend.
const TICKETS = [
  { ticket: 14, state: "en attente", title: "Login page", url: "https://github.com/benomite/parade/issues/14" },
  { ticket: 15, state: "pris", title: "Search the menu", url: "https://github.com/benomite/parade/issues/15" },
];
const list = (tickets = TICKETS, online = true): RailOfProjectRead => ({
  state: "listed",
  project: PARADE,
  repository: "benomite/parade",
  station: { id: "gbox", name: "parade-box", online },
  publishedAt: PUBLISHED,
  tickets,
  ...(tickets.length === 0 ? { reason: "The rail of parade holds no ticket." } : {}),
});
const CONNECTION_REQUIRED: RailOfProjectRead = { state: "sign-in-required", project: PARADE, reason: "This computer is not signed in to GitHub, so brigade cannot read the rail of parade.", action: connexionGitHub("gh") };
const WITHOUT_GH: RailOfProjectRead = {
  state: "unavailable",
  project: PARADE,
  cause: "gh-missing",
  reason: "The GitHub CLI `gh` is not installed on this computer, so brigade cannot read the rail of parade.",
  link: "https://cli.github.com",
  detail: "spawn gh ENOENT",
};
const NOT_PUBLISHED: RailOfProjectRead = { state: "unavailable", project: PARADE, cause: "not-published", reason: "The rail of parade is not published yet: update brigade on the stations that serve it." };
const WITHOUT_BOARD = "There is no open Kitchen board in benomite/parade: the box serving it has not published one yet, or it was closed.";

function actionsNotes() {
  const facts: string[] = [];
  const action: ActionsOfRailPublished = {
    relire: () => void facts.push("relire"),
    seConnecter: () => void facts.push("seConnecter"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
  };
  return { faits: facts, geste: action };
}
const textOf = (poses: Fake[]) => poses.map((pose) => pose.textContent).join(" | ");
// Ce qui est posé sous un élément, en tableau : `descendants()` le rend un à un.
const under = (pose: Fake | undefined): Fake[] => (pose === undefined ? [] : [...pose.descendants()]);
const buttons = (poses: Fake[]) => poses.flatMap((pose) => [pose, ...under(pose)]).filter((pose) => pose.balise === "button" && pose.className !== "aide");
const button = (poses: Fake[], text: string) => buttons(poses).find((pose) => pose.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);

describe("le rail que sa station publie dit pourquoi le tableau ne se dessine pas encore — sans colonnes à lui (#2076)", () => {
  test("publié, son tableau en lecture : une phrase le dit, la publication au survol, sans station ; aucune colonne", () => {
    const poses = setRailPublished(doc, { lu: list() }, actionsNotes().geste) as Fake[];
    // Une seule ligne, et son survol (« ? »).
    assert.deepEqual(poses.map((pose) => pose.textContent), [`${BOARD_IN_READ(PARADE)}?`]);
    const hover = under(poses[0]).find((pose) => pose.className === "aide")?.ariaLabel ?? "";
    assert.match(hover, /^last published at 2026-10-22 09:12 UTC, for benomite\/parade/);
    assert.doesNotMatch(textOf(poses) + hover, /parade-box/);
    assert.equal(poses.flatMap((pose) => [pose, ...under(pose)]).some((pose) => pose.className === "colonne"), false);
  });

  test("publié, son tableau illisible : la raison du tableau en une ligne, et « read again »", () => {
    const { faits: facts, geste: action } = actionsNotes();
    const poses = setRailPublished(doc, { lu: list([]), nonLu: WITHOUT_BOARD }, action) as Fake[];
    assert.match(textOf(poses), new RegExp(`^${BOARD_NOT_READ("There is no open Kitchen board")}`));
    button(poses, REREAD).click();
    assert.deepEqual(facts, ["relire"]);
  });

  test("connexion requise : la phrase du runtime, et le bouton qui lance son geste, recommandé", () => {
    const { faits: facts, geste: action } = actionsNotes();
    const poses = setRailPublished(doc, { lu: CONNECTION_REQUIRED }, action) as Fake[];
    assert.match(poses[0]?.textContent ?? "", /^This computer is not signed in to GitHub/);
    const connection = button(poses, connexionGitHub("gh").label);
    assert.equal(connection.className, "recommande");
    connection.click();
    assert.deepEqual(facts, ["seConnecter"]);
  });

  test("indisponible : la phrase en une ligne — `gh` en code, son détail au survol —, la page qui la lève, et « read again »", () => {
    const { faits: facts, geste: action } = actionsNotes();
    const poses = setRailPublished(doc, { lu: WITHOUT_GH }, action) as Fake[];
    const head = poses[0] ?? assert.fail("pas de tête");
    assert.equal(under(head).find((pose) => pose.balise === "code")?.textContent, "gh");
    assert.equal(under(head).find((pose) => pose.className === "aide")?.ariaLabel, "spawn gh ENOENT");
    assert.deepEqual(buttons(poses).map((pose) => [pose.textContent, pose.className]), [["get the GitHub CLI", "recommande"], [REREAD, ""]]);
    button(poses, "get the GitHub CLI").click();
    button(poses, REREAD).click();
    assert.deepEqual(facts, ["page https://cli.github.com", "relire"]);

    // Sans page qui la lève : « read again » est le geste recommandé.
    const notPublished = setRailPublished(doc, { lu: NOT_PUBLISHED }, action) as Fake[];
    assert.match(notPublished[0]?.textContent ?? "", /^The rail of parade is not published yet/);
    assert.deepEqual(buttons(notPublished).map((pose) => [pose.textContent, pose.className]), [[REREAD, "recommande"]]);
  });

  test("la lecture en route le dit : l'onglet n'est jamais vide", () => {
    const poses = setRailPublished(doc, {}, actionsNotes().geste) as Fake[];
    assert.deepEqual(poses.map((pose) => pose.textContent), [READ_PUBLISHED]);
  });
});

// Ce que le runtime dit d'un second sans `claude` ni `gh`, sur ce poste (runtime/src/second/lancement.ts).
const PREVENTS: SaysOfSecond = {
  reason: "The second cannot start: `claude` is missing on this computer.",
  tools: [
    { tool: "claude", reason: "`claude` is not on the PATH, and the second is a Claude Code session.", install: "Install Claude Code by running `curl -fsSL https://claude.ai/install.sh | bash` in a terminal, then restart brigade.", link: "https://code.claude.com/docs/en/setup" },
    { tool: "gh", reason: "`gh` is not on the PATH, and the second reads the tickets with it.", install: "Install the GitHub CLI by running `brew install gh` in a terminal, then restart brigade.", link: "https://cli.github.com" },
  ],
};
const MISSING: SaysOfSecond = { reason: "The second starts, but `gh` is missing on this computer, and what needs it will fail until it is installed.", tools: PREVENTS.tools.slice(1) };

describe("le second qui ne part pas, ou part sans tous ses outils", () => {
  test("empêché : chaque outil qui manque, nommé, et le bouton de sa page ; comment l'obtenir au survol, jamais à plat ; « try again », recommandé", () => {
    const facts: string[] = [];
    const pose = setToolsOfSecond(doc, PREVENTS, { bloque: true, reessayer: () => void facts.push("reessayer"), ouvrirLaPage: (url) => void facts.push(url) }) as unknown as Fake;
    const tools = under(pose).filter((child) => child.className === "outil-manquant");
    assert.deepEqual(
      tools.map((tool) => under(tool).find((child) => child.balise === "strong")?.textContent),
      ["Claude Code", "The GitHub CLI"],
    );
    // Le produit est nommé (#4059) : le binaire, et pourquoi le runtime le dit absent, sont au survol — sans accents graves.
    assert.equal(under(tools[0]).find((child) => child.className === "aide")?.ariaLabel, "claude is not on the PATH, and the second is a Claude Code session.");
    // La raison est dans la note du second : elle ne se redit pas ici.
    assert.equal(pose.textContent.includes("The second cannot start"), false);
    assert.deepEqual(buttons([pose]).map((child) => [child.textContent, child.className]), [[PAGE_OF("claude"), ""], [PAGE_OF("gh"), ""], [RETRY_THE_SECOND, "recommande"]]);
    button([pose], PAGE_OF("gh")).click();
    button([pose], RETRY_THE_SECOND).click();
    assert.deepEqual(facts, ["https://cli.github.com", "reessayer"]);
  });

  test("parti sans `gh` : la raison en tête, `gh` et ce qui l'obtient — pas de « try again », il tourne", () => {
    const pose = setToolsOfSecond(doc, MISSING, { bloque: false, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Fake;
    assert.match(pose.textContent, /^The second starts, but gh is missing on this computer/);
    assert.deepEqual(buttons([pose]).map((child) => child.textContent), [PAGE_OF("gh")]);
  });

  test("empêché sans outil nommé — un dossier absent, un lancement refusé : la note suffit, et « try again » reste", () => {
    const pose = setToolsOfSecond(doc, { reason: "The second cannot start: the project's folder /tmp/parade does not exist on this computer.", tools: [] }, { bloque: true, reessayer: () => {}, ouvrirLaPage: () => {} }) as unknown as Fake;
    assert.deepEqual(buttons([pose]).map((child) => child.textContent), [RETRY_THE_SECOND]);
  });
});

// La vue entière, pour un projet ouvert depuis le premier lancement : ni box, ni station sur cet ordinateur.
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED, attente: ACTIONS_OF_WAIT },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "new session", arrete: false };

async function open(answers: Answers) {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ...answers });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Le tableau de la cuisine de parade, tel que le process principal le passe à la vue (facts.ts) : #14 attend le chef, #15
// cuit. `rien` : rien n'attend le chef, et le bloc le dit.
const A = "2026-11-02T09:00:00.000Z";
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-02T08:59:00.000Z",
  dernierTick: "2026-11-02T08:58:00.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "en attente", titre: "Login page", url: "https://github.com/benomite/parade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: "Search the menu", url: "https://github.com/benomite/parade/issues/15", activite: null },
  ],
  cooks: [{ ticket: 15, titre: "Search the menu", station: "parade-box/claude" }],
  attend: [{ ticket: 14, titre: "Login page", url: "https://github.com/benomite/parade/issues/14" }],
};
const STATUS = ["awaiting   1 decision awaits the chef — for 2 h", "  #14  for 2 h  question — answer it on the issue  Login page", "end awaiting", ""].join("\n");
const NOTHING = ["awaiting   nothing awaits the chef", "end awaiting", ""].join("\n");
function ofBoard(facts: Facts, status: string): Drawable {
  const heldOnes = holdFacts(() => new Map());
  heldOnes.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  return heldOnes.attendre(putAside({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: status }] })) ?? assert.fail("rien à redessiner");
}
const receive = (vue: Played, receivedOne: Drawable) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
const NOT_READ: Drawable = { projet: PARADE, demande: 0, a: A, titre: "NOT READ FROM GITHUB", erreur: WITHOUT_BOARD, atteinte: true, cas: null, duTableau: true };
const columnsOf = (vue: Played) => vue.element("rail").dessous("section").filter((section) => section.className === "colonne");
const namesAndAccounts = (vue: Played) => columnsOf(vue).map((column) => column.children[0]?.children.map((pose) => pose.textContent));

describe("dans la vue : un projet servi par une autre station a le même rail, TODO en tête (#2076)", () => {
  test("le tableau lu : les colonnes du rail, « TODO (1) » en tête, la carte qui attend le chef rouge dans son étape avec son geste ; aucun rail publié", async () => {
    const vue = await open({ railDuProjet: () => list(), gestesDeFiche: (card) => actionsOfCard(card) });
    assert.deepEqual(vue.dernier("railDuProjet"), [PARADE]);
    // Tant que le tableau n'est pas lu, la page le dit — sans les colonnes du rail publié.
    assert.equal(vue.element("rail").textContent.startsWith(BOARD_IN_READ(PARADE)), true);
    assert.deepEqual(columnsOf(vue), []);

    receive(vue, ofBoard(FACTS, STATUS));
    // TODO n'est pas une colonne (#3458) : #14, en attente, est rouge dans le backlog (#4238), et l'entrée le compte.
    assert.deepEqual(namesAndAccounts(vue), [["Backlog", "1"], ["Manager", "0"], ["Cooks", "1"], ["Pass", "0"], ["Served", "0"]]);
    const onTheRail = columnsOf(vue)[0] ?? assert.fail("pas de Backlog");
    const card = cardOfTicket(vue, 14) ?? assert.fail("pas de carte #14");
    assert.equal(onTheRail.contains(card), true);
    assert.equal(card.dataset.carte, "attente");
    assert.deepEqual(red(vue.element("rail")), ["#14"]);
    // Son geste, comme sur un projet servi ici : le chef dit ce qu'elle attend d'un tiers.
    assert.ok(card.dessous("button").some(({ textContent }) => textContent === "waiting for…"));
    assert.doesNotMatch(vue.element("rail").textContent, /last published|Reading the/);
  });

  test("rien n'attend le chef : aucune carte rouge, et rien de plus sur le rail", async () => {
    const vue = await open({ railDuProjet: () => list() });
    receive(vue, ofBoard({ ...FACTS, attend: [] }, NOTHING));
    // Plus d'entrée « TODO (0) » ni de ligne « nothing awaits you » sur le rail (#3523) : aucune carte rouge, aucun bloc.
    assert.deepEqual(red(vue.element("rail")), []);
    assert.equal(vue.element("rail").dessous("div").some(({ className }) => className === "todo-du-rail"), false);
  });

  test("le tableau ne se lit pas : sa raison en une ligne ; « read again » relit le tableau et le rail publié", async () => {
    let readings = 0;
    const vue = await open({ railDuProjet: () => (++readings, list()) });
    receive(vue, NOT_READ);
    const rail = vue.element("rail");
    assert.equal(rail.textContent.startsWith(BOARD_NOT_READ(WITHOUT_BOARD)), true);
    assert.deepEqual(columnsOf(vue), []);
    button([rail], REREAD).click();
    await repos();
    assert.equal(readings, 2);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "relireBox").length, 1);
    // Relu, le tableau pose le rail.
    receive(vue, ofBoard(FACTS, STATUS));
    assert.deepEqual(namesAndAccounts(vue).map((nameAndAccount) => nameAndAccount?.[0]), ["Backlog", "Manager", "Cooks", "Pass", "Served"]);
  });

  test("indisponible, la phrase du runtime ; « read again » relit", async () => {
    let readings = 0;
    const vue = await open({ railDuProjet: () => (++readings === 1 ? WITHOUT_GH : list()) });
    const rail = vue.element("rail");
    assert.match(rail.textContent, /^The GitHub CLI gh is not installed on this computer/);
    button([rail], REREAD).click();
    await repos();
    assert.equal(readings, 2);
    assert.equal(rail.textContent.startsWith(BOARD_IN_READ(PARADE)), true);
  });

  test("connexion requise, son bouton lance la connexion du runtime ; connecté, le rail et le tableau sont relus", async () => {
    let readings = 0;
    const vue = await open({ railDuProjet: () => (++readings === 1 ? CONNECTION_REQUIRED : list()), seConnecterAGitHub: () => ({ connecte: true }) as never });
    button([vue.element("rail")], connexionGitHub("gh").label).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste: action }) => action === "seConnecterAGitHub").length, 1);
    assert.equal(readings, 2);
    assert.equal(vue.appels.filter(({ geste: action }) => action === "relireBox").length, 1);
    assert.equal(vue.element("rail").textContent.startsWith(BOARD_IN_READ(PARADE)), true);
  });
});

describe("dans la vue : l'onglet Second dit ce qui manque", () => {
  test("Second empêché : sa note dit pourquoi, chaque outil qui manque est sous elle, le terminal n'est pas montré ; « try again » le relance", async () => {
    const prevents: Terminal = { ...SECOND, arrete: true, note: PREVENTS.reason, empeche: PREVENTS };
    const vue = await open({ railDuProjet: () => list(), espace: () => [prevents], ouvrirLaPage: () => true });
    // Sa phrase pose ses outils en code, sans accents graves.
    const note = vue.element("note-second");
    assert.equal(note.textContent, PREVENTS.reason.replaceAll("`", ""));
    assert.equal(under(note).find((pose) => pose.balise === "code")?.textContent, "claude");
    const tools = vue.element("outils-du-second");
    assert.equal(tools.hidden, false);
    assert.equal(vue.element("fil").hidden, true);
    assert.match(tools.textContent, /^Claude Code.*how to get Claude Code/);
    button([tools], PAGE_OF("claude")).click();
    button([tools], RETRY_THE_SECOND).click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaPage"), ["https://code.claude.com/docs/en/setup"]);
    assert.deepEqual(vue.dernier("ecrire"), [1, ""]);
    // Reparti : le terminal revient, la colonne des outils s'en va.
    vue.dire("surEtat", { ...SECOND });
    assert.equal(tools.hidden, true);
    assert.equal(vue.element("fil").hidden, false);
  });

  test("Second parti sans `gh` : le terminal est montré, et ce qui manque se dit au-dessus", async () => {
    const vue = await open({ railDuProjet: () => list(), espace: () => [{ ...SECOND, manque: MISSING }] });
    assert.equal(vue.element("fil").hidden, false);
    assert.equal(vue.element("outils-du-second").hidden, false);
    assert.match(vue.element("outils-du-second").textContent, /^The second starts, but gh is missing/);
  });
});
