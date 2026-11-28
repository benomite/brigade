// L'onglet Stations couvre chaque station qui sert le projet (#1185, #3195) : chaque cook avec sa station, une carte par
// station — son état, ses cooks en cours, pour la box comme pour le Mac ou un autre ordinateur —, et la carte mise à jour
// par la lecture qui suit, sans recharger la page. Ses cooks en cours y sont une ligne chacun, et seulement les siens
// (#1270) ; une station qui refuse le projet n'en a pas : la ligne d'alerte de Rail dit pourquoi. Sur l'onglet Rail,
// une seule ligne dit ce qui, du côté des cooks, demande un geste — un projet refusé, l'accès
// au dépôt bloqué —, avec de quoi ouvrir Stations ; aucune quand rien ne le demande.
// La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { calibrationRecommended, EFFORTS, MODELS, type SeenOfProjects } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { OPEN_COOKS, CAP } from "../src/vue/stations-of-cooking.js";
import { AT_REST } from "../src/vue/stations-tab/stations-tab.js";
import { type Fake, type Played, playTheVue, openTab, repos } from "./helpers/false-vue.ts";

const A = "2026-10-20T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJECTS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: PROJECTS }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

type OfRuntime = NonNullable<FactsOfRuntime["stations"]>[number];
// Une station telle que le runtime la rend dans `facts` (runtime/src/etat.ts, #1183), mot pour mot.
const station = (name: string, more: Partial<OfRuntime> = {}): OfRuntime => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: false,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...more,
});
const COOK_14 = { ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" };
const COOK_15 = { ticket: 15, titre: "La carte des desserts", station: "mac/claude" };
const STOPPED = "2026-10-20T10:01:11.000Z";

// #14 cuit sur la box, #15 sur le Mac — une station distante — que le chef a arrêté : #15 y finit. L'atelier, une autre
// station de la box, n'a pas de place.
const STATIONS: OfRuntime[] = [
  station("box/claude", { cooks: [COOK_14] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: STOPPED, cooks: [COOK_15] }),
  station("atelier/claude"),
];
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-10-20T10:04:11.000Z",
  dernierTick: "2026-10-20T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 2, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: COOK_14.titre, url: "https://github.com/benomite/brigade/issues/14", activite: null },
    { ticket: 15, etat: "pris", titre: COOK_15.titre, url: "https://github.com/benomite/brigade/issues/15", activite: null },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/benomite/brigade/issues/21", activite: null },
  ],
  cooks: [COOK_14, COOK_15],
  attend: [],
};

function drawable(facts: Facts, stations: OfRuntime[]): Drawable {
  return holdFacts(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...facts, stations }) }] });
}

async function open(stations: OfRuntime[] = STATIONS, facts: Facts = FACTS) {
  const vue = await playTheVue({
    demarrage: startup,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  receive(vue, facts, stations);
  return { vue };
}
function receive(vue: Played, facts: Facts, stations: OfRuntime[]): void {
  vue.dire("surFaits", { ...drawable(facts, stations), demande: vue.dernier("faits")[0] as number });
}

// Les cartes des stations (#3195) : son état — au mot de sa pilule —, ses cooks.
const lines = (vue: Played) => vue.element("rail").dessous("section").filter((card) => card.className === "carte-de-station");
const line = (vue: Played, name: string) => lines(vue).find((card) => card.dataset.station === name) ?? assert.fail(`pas de carte pour ${name}`);
const stateOf = (pose: Fake) => pose.dessous("span").find((span) => span.className === "pilule etat")?.dessous("strong")[0]?.textContent;
const noteOf = (pose: Fake) => pose.dessous("small").find((small) => small.className === "note")?.textContent;
const top = (vue: Played) => vue.element("rail").dessous("div").find(({ className }) => className === "haut-des-stations") ?? assert.fail("pas de ligne du haut");
const buttonOf = (pose: Fake) => pose.dessous("button").find((button) => button.ariaLabel?.includes(" on ") === true);
// Les lignes de cooks d'une carte : le numéro et le titre de chacune — ou, sans cook, ce qui le dit.
const cooksOf = (pose: Fake) => {
  const atRest = pose.dessous("p").find((p) => p.className === "au-repos");
  if (atRest !== undefined) return [atRest.textContent];
  const list = pose.dessous("ul").find((ul) => ul.className.startsWith("cooks")) ?? assert.fail("pas de liste de cooks");
  const linesOfCooks = list.children.filter((li) => li.className !== "agent");
  if (list.className === "cooks vide") return linesOfCooks.map((li) => li.textContent);
  return linesOfCooks.map((li) => `${li.children[0]?.textContent}${li.children[1]?.textContent}`);
};
const alerts = (vue: Played) => vue.element("rail").dessous("p").filter((p) => p.className === "alerte-de-cuisine");

describe("la station du projet, à côté de l'onglet Stations (#3523)", () => {
  test("une étiquette dit la station et son état ; plus de ligne « Cooks on » ni de « + station » sur Rail", async () => {
    const { vue } = await open();
    const label = vue.element("etiquette-de-station");
    assert.equal(label.hidden, false);
    assert.match(label.textContent, /^box\/claude, atelier\/claude · cooking$/);
    assert.equal(vue.element("stations-du-projet").hidden, true, "aucune ligne de stations au-dessus du rail");
    assert.doesNotMatch(vue.element("stations-du-projet").textContent, /Cooks on|Cooked by/);
    assert.equal(vue.element("stations-du-projet").dessous("button").some(({ textContent, hidden }) => textContent === "+ station" && !hidden), false);
  });

  test("la seule station arrêtée par le chef : l'étiquette dit « stopped » ; personne ne cuit : pas d'étiquette", async () => {
    const { vue } = await open([station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: STOPPED, cooks: [] })]);
    assert.equal(vue.element("etiquette-de-station").textContent, "mac/claude · stopped");
    const { vue: nobody } = await open([]);
    assert.equal(nobody.element("etiquette-de-station").hidden, true);
  });
});

describe("l'onglet Stations : une carte par station qui sert le projet", () => {
  test("chaque cook est nommé avec sa station, et chaque station a sa carte : son état, ses cooks", async () => {
    const { vue } = await open();
    await openTab(vue, "Stations");
    // La carte du projet est fondue dans le bloc des stations (#1456) : sa ligne, en tête, dit l'état de la cuisine ; ses
    // cooks sont ceux des stations, et la carte n'est plus posée.
    assert.throws(() => vue.element("carte"), /aucun élément « carte »/);
    assert.match(top(vue).textContent, /^Cooked by box\/claude, atelier\/claude · online · 1 cook at work/);
    assert.equal(vue.element("rail").textContent.includes("latest event"), false);
    // Les stations, dans l'ordre de `facts`, sans rôle dit (#1786).
    assert.deepEqual(lines(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude"]);
    assert.deepEqual(lines(vue).map(stateOf), ["online", "stopped by you, for 3 min · 1 cook finishing", "online"]);
    assert.deepEqual(cooksOf(line(vue, "box/claude")), ["#14Le journal en ajout seul"]);
    assert.deepEqual(cooksOf(line(vue, "mac/claude")), ["#15La carte des desserts"]);
    assert.deepEqual(cooksOf(line(vue, "atelier/claude")), [AT_REST]);
    // Arrêtée, la station dit par qui, depuis quand, et ce qui y finit ; elle se dit sur un autre ordinateur.
    assert.match(line(vue, "mac/claude").textContent, /another computer/);
    // Aucune n'a de bouton : une station cuit tant qu'elle déclare des places, et s'arrête sur sa machine.
    assert.deepEqual(lines(vue).map((li) => buttonOf(li)), [undefined, undefined, undefined]);
  });

  test("sur Rail, les stations ne se montrent pas", async () => {
    const { vue } = await open();
    await openTab(vue, "Rail");
    assert.deepEqual(lines(vue), []);
  });

  test("une station qui refuse le projet : aucune n'a de bouton, la seconde dit pourquoi", async () => {
    const refusal = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox on this computer, then wait: the station tries again by itself.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
    const { vue } = await open([station("box/claude", { cooks: [COOK_14] }), station("atelier/claude", { cuisson: "refused", refus: refusal })]);
    await openTab(vue, "Stations");
    // Refusant le projet, l'atelier le dit, et pourquoi (#3195).
    assert.deepEqual([stateOf(line(vue, "box/claude")), noteOf(line(vue, "box/claude"))], ["online", undefined]);
    assert.deepEqual([stateOf(line(vue, "atelier/claude")), noteOf(line(vue, "atelier/claude"))], ["refusing it", "This computer cannot run the project's cooks in Claude Code's sandbox."]);
    assert.deepEqual(lines(vue).map((li) => buttonOf(li)), [undefined, undefined]);
  });
});

describe("l'onglet Stations : un bloc par station, et ses tickets en cours (#1270)", () => {
  const COOK_16 = { ticket: 16, titre: "Le menu du soir", station: "atelier/claude" };
  const REFUSAL = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
  // Une station dans chacun des quatre états : la box cuit #14, le Mac arrêté par le chef y finit #15, l'atelier
  // cuit encore #16 — que le rail lu ne porte pas —, le PC refuse le projet. #21 attend sur le rail, aucune station ne l'a.
  const FOUR: OfRuntime[] = [
    station("box/claude", { cooks: [COOK_14] }),
    station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: STOPPED, cooks: [COOK_15] }),
    station("atelier/claude", { cooks: [COOK_16] }),
    station("pc/claude", { distante: true, cuisson: "refused", refus: REFUSAL }),
  ];
  const FACTS_FOUR: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, auTravail: 3 }, cooks: [COOK_14, COOK_15, COOK_16] };

  test("les quatre états, une carte chacun : son mot, sans bouton de cuisine, et ses tickets en cours, rien d'autre", async () => {
    const { vue } = await open(FOUR, FACTS_FOUR);
    await openTab(vue, "Stations");
    // Exactement une carte par station du projet, dans l'ordre de `facts`, sans rôle dit (#1786).
    assert.deepEqual(lines(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude", "atelier/claude", "pc/claude"]);
    assert.deepEqual(lines(vue).map(stateOf), ["online", "stopped by you, for 3 min · 1 cook finishing", "online", "refusing it"]);
    assert.deepEqual(lines(vue).map((li) => buttonOf(li)), [undefined, undefined, undefined, undefined]);
    // Chacune porte les tickets en cours sur sa station, et seulement celles-là : #21, sur le rail, n'est nulle part.
    assert.deepEqual(lines(vue).map(cooksOf), [["#14Le journal en ajout seul"], ["#15La carte des desserts"], ["#16Le menu du soir"], [AT_REST]]);
    assert.doesNotMatch(vue.element("rail").textContent, /#21/);
    // Aucune sortie brute de commande dans un bloc : ni `pre`, ni ligne lancée, ni code de sortie.
    for (const block of lines(vue)) {
      assert.deepEqual(block.dessous("pre"), []);
      assert.doesNotMatch(block.textContent, /\$ |stderr|stdout|exit code|brigade :/);
    }
  });

  test("la lecture suivante redessine les blocs : un ticket qui quitte sa station quitte son bloc", async () => {
    const { vue } = await open(FOUR, FACTS_FOUR);
    await openTab(vue, "Stations");
    receive(vue, { ...FACTS_FOUR, cooks: [COOK_15, COOK_16] }, [station("box/claude"), ...FOUR.slice(1)]);
    await repos();
    assert.deepEqual(cooksOf(line(vue, "box/claude")), [AT_REST]);
    assert.deepEqual(cooksOf(line(vue, "mac/claude")), ["#15La carte des desserts"]);
  });
});

describe("deux stations du projet : chacune a sa carte (#1289)", () => {
  const TWO = (box: Partial<OfRuntime>, mac: Partial<OfRuntime>): OfRuntime[] => [station("box/claude", { cooks: [COOK_14], ...box }), station("mac/claude", { distante: true, cooks: [COOK_15], ...mac })];

  test("deux stations, deux cartes, chacune à son nom, son état et ses cooks ; la lecture d'une station arrêtée ne touche pas l'autre", async () => {
    const { vue } = await open(TWO({}, {}));
    await openTab(vue, "Stations");
    assert.deepEqual(lines(vue).map((li) => li.dataset.station), ["box/claude", "mac/claude"]);
    assert.match(line(vue, "box/claude").dessous("strong")[0]?.textContent ?? "", /^box\/claude$/);
    assert.match(line(vue, "mac/claude").dessous("strong")[0]?.textContent ?? "", /^mac\/claude$/);
    const textBefore = line(vue, "mac/claude").textContent;
    receive(vue, FACTS, TWO({ cuisson: "stopped", arreteeDepuis: "2026-10-20T10:04:05.000Z" }, {}));
    await repos();
    assert.deepEqual(lines(vue).map((li) => li.dataset.etat), ["hors-ligne", "en-ligne"]);
    assert.match(stateOf(line(vue, "box/claude")) ?? "", /^stopped by you/);
    assert.equal(line(vue, "mac/claude").textContent, textBefore);
  });
});

describe("aucun vert dans l'onglet quand aucune station ne cuit le projet (#3189, #3195)", () => {
  test("sa seule station arrêtée : elle le cuit, mais rien ne cuit — et nulle part de vert dans le rail", async () => {
    const { vue } = await open([station("box/claude", { cuisson: "stopped", arreteeDepuis: STOPPED })]);
    await openTab(vue, "Stations");
    assert.match(top(vue).textContent, /^box\/claude cooks this project, but it is stopped by you, for 3 min: nothing cooks/);
    assert.deepEqual(lines(vue).map(stateOf), ["stopped by you, for 3 min"]);
    const green = [...vue.element("rail").descendants()].filter((e) => e.dataset.ton === "vert");
    assert.deepEqual(green.map((e) => e.className), []);
  });
});

describe("l'onglet Rail : une ligne quand les cooks demandent un geste", () => {
  // Ce que le process principal rend des projets que les stations publient, l'accès au dépôt de parade bloqué.
  const ACCESS = { bloque: "fetch" as const, raison: "parade-box cannot fetch from benomite/parade: github.com asks for a username (git: fatal: could not read Username).", geste: "Run `gh auth setup-git` on parade-box." };
  const seenOnes = (access: typeof ACCESS | null): SeenOfProjects => ({
    a: A,
    projets: [{ nom: PARADE, depot: "benomite/parade", base: "main", suiviPar: { id: "g1", nom: "parade-box" }, stations: [{ id: "g1", nom: "parade-box", etat: "servi", dit: "", autoriser: [] }], servi: null, acces: access, refus: null, worktree: null }],
    recommandee: "g1",
    avertissements: {},
    machines: {},
    calibrage: calibrationRecommended([]),
  });

  test("rien ne demande de geste : aucune ligne", async () => {
    const { vue } = await open();
    await openTab(vue, "Rail");
    assert.deepEqual(alerts(vue), []);
  });

  test("l'accès au dépôt bloqué : une seule ligne la dit, et « open Cooks » ouvre l'onglet Stations", async () => {
    const { vue } = await open([station("box/claude"), station("mac/claude", { distante: true })]);
    await openTab(vue, "Rail");
    vue.dire("surProjetsDesStations", seenOnes(ACCESS));
    await repos();
    const [alert, ...others] = alerts(vue);
    assert.deepEqual(others, []);
    assert.equal(alert?.children[0]?.textContent, "parade-box cannot fetch from benomite/parade: github.com asks for a username.");
    // Elle est en tête de l'onglet.
    assert.equal(vue.element("rail").children[0]?.children[0], alert);
    const link = alert?.dessous("button").find((button) => button.textContent === OPEN_COOKS) ?? assert.fail("pas de lien vers les stations");
    link.click();
    await repos();
    assert.deepEqual(vue.element("onglets-du-projet").children.filter((tab) => tab.ariaSelected === "true").map((tab) => tab.textContent), ["Stations"]);
    assert.deepEqual(alerts(vue), []);
  });

  test("une station qui refuse le projet : aucune ligne d'alerte, son refus a la sienne (vue/project/refusal-of-station.test.ts)", async () => {
    const refusal = { status: "refused" as const, code: "sandbox-unusable" as const, message: "This computer cannot run the project's cooks in Claude Code's sandbox.", action: "Install or repair the sandbox.", noRemedy: "Repairing the sandbox means installing software on this computer, which the app does not do for you." };
    const { vue } = await open([station("box/claude", { cuisson: "refused", refus: refusal })]);
    await openTab(vue, "Rail");
    assert.deepEqual(alerts(vue), []);
  });

  test("l'accès au dépôt bloqué : une seule ligne, le détail de git en moins ; avec une station arrêtée, toujours une seule — et la ligne part quand c'est levé", async () => {
    const { vue } = await open([station("box/claude")]);
    await openTab(vue, "Rail");
    vue.dire("surProjetsDesStations", seenOnes(ACCESS));
    await repos();
    assert.deepEqual(alerts(vue).map((p) => p.children[0]?.textContent), ["parade-box cannot fetch from benomite/parade: github.com asks for a username."]);
    // Le bloc des stations, qui détaille l'accès et son geste, reste sur Stations : sur Rail, la ligne seule le dit.
    assert.equal(vue.element("stations-du-projet").hidden, true);
    receive(vue, FACTS, [station("box/claude", { cuisson: "stopped", arreteeDepuis: STOPPED })]);
    await repos();
    const [only, ...others] = alerts(vue);
    assert.deepEqual(others, []);
    assert.equal(only?.children[0]?.textContent, "parade-box cannot fetch from benomite/parade: github.com asks for a username.");
    // Levé : plus de ligne.
    vue.dire("surProjetsDesStations", seenOnes(null));
    receive(vue, FACTS, [station("box/claude")]);
    await repos();
    assert.deepEqual(alerts(vue), []);
  });
});

// Sa rangée est la rangée de réglage de l'app (#2920) ; sans déclaration lue de la station, rien ne la règle.
describe("« Details » de la carte d'une station dit le plafond du projet, sans le régler (ticket 1292)", () => {
  const home = (cap: { dit: string; nombre: number | null; parLeChef: boolean }) => ({
    projets: [],
    sante: { ton: "vert" as const, dit: "", survol: "" },
    plafonds: { [PARADE]: { "box/claude": { plafond: cap } } },
  });

  test("le plafond, puis le plafond neuf à la lecture suivante ; ni champ ni bouton pour le régler", async () => {
    const vue = await playTheVue({
      demarrage: startup,
      espace: () => [SECOND],
      machines: () => [{ id: "poste", titre: "this computer" }],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
    await repos();
    receive(vue, FACTS, [station("box/claude", { cooks: [COOK_14] })]);
    vue.dire("surAccueil", home({ dit: "3 at most — 8 cores", nombre: 3, parLeChef: false }));
    await repos();
    await openTab(vue, "Stations");
    const pose = line(vue, "box/claude");
    const row = () => line(vue, "box/claude").dessous("div").find(({ className, dataset }) => className === "reglage" && dataset.cle === "cooks") ?? assert.fail("pas de rangée du plafond");
    assert.equal(row().children[0]?.children.at(-1)?.className.includes("niveau"), true);
    assert.deepEqual([row().children[0]?.textContent.startsWith(CAP), row().children[1]?.textContent], [true, "3 at most — 8 cores"]);
    assert.equal(pose.dessous("input").length, 0);
    assert.deepEqual(row().children[2]?.children, []);
    vue.dire("surAccueil", home({ dit: "1 at most — set by you, replaces 3 (8 cores)", nombre: 1, parLeChef: true }));
    await repos();
    assert.match(row().textContent, /1 at most — set by you, replaces 3/);
  });
});

describe("le bloc de chaque station montre ce qu'elle fait tourner hors de ses cooks : la pass, le manager, le closer (#1971)", () => {
  const PASS = { role: "pass", station: "box/claude", ticket: 21, fait: "review in progress", depuis: "2026-10-20T10:01:11.000Z" };
  const JUDGE = { role: "manager", station: "box/claude", ticket: 30, fait: "qualifying the issue", depuis: "2026-10-20T10:04:01.000Z" };
  const CLEANS = { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: "2026-10-20T09:04:11.000Z" };
  const agentsOf = (pose: Fake) => pose.dessous("li").filter((li) => li.className === "agent");

  test("une ligne par agent, avant celles des cooks : son rôle, son ticket, ce qu'il fait et depuis quand — distincte d'une ligne de cook", async () => {
    const { vue } = await open(STATIONS, { ...FACTS, agents: [PASS, JUDGE, CLEANS] });
    await openTab(vue, "Stations");
    const box = line(vue, "box/claude");
    const agents = agentsOf(box);
    assert.deepEqual(agents.map((agent) => agent.dataset.role), ["pass", "manager", "closer"]);
    assert.deepEqual(agents.map((agent) => agent.textContent), [
      "pass#21review in progress · for 3 min",
      "manager#30qualifying the issue · for 10 s",
      "closerclosing: cleaning up the project · for 1 h 00",
    ]);
    // L'heure au survol de ce qu'il fait, ce qu'est son rôle au survol de son mot.
    const [pass] = agents;
    assert.equal(pass?.dessous("span").find((span) => span.className === "agent-fait")?.title, "since 2026-10-20T10:01:11.000Z");
    assert.match(pass?.dessous("strong").find((fort) => fort.className === "agent-role")?.title ?? "", /judges a delivery/);
    // Les agents viennent d'abord, puis la ligne du cook ; une autre station n'en a aucun.
    const setEntries = box.dessous("ul").find((ul) => ul.className === "cooks")?.children ?? assert.fail("pas de lignes");
    assert.deepEqual(setEntries.map((li) => li.className), ["agent", "agent", "agent", ""]);
    assert.deepEqual(cooksOf(line(vue, "atelier/claude")), [AT_REST]);
    assert.deepEqual(agentsOf(line(vue, "mac/claude")), []);
  });

  test("une station qui ne fait tourner qu'une pass ne se dit pas sans rien : la ligne de la pass, et pas celle qui dit que rien ne tourne ; la pass finie, à la lecture suivante, elle quitte le bloc", async () => {
    const only = [station("box/claude"), station("mac/claude", { distante: true })];
    const { vue } = await open(only, { ...FACTS, cooks: [], agents: [PASS] });
    await openTab(vue, "Stations");
    assert.deepEqual(agentsOf(line(vue, "box/claude")).map((agent) => agent.dataset.role), ["pass"]);
    assert.deepEqual(line(vue, "box/claude").dessous("ul").filter((ul) => ul.className === "cooks vide"), []);
    assert.equal(line(vue, "box/claude").dessous("p").some((p) => p.className === "au-repos"), false);

    receive(vue, { ...FACTS, cooks: [], agents: [] }, only);
    await repos();
    assert.deepEqual(agentsOf(line(vue, "box/claude")), []);
    assert.deepEqual(cooksOf(line(vue, "box/claude")), [AT_REST]);
  });
});
