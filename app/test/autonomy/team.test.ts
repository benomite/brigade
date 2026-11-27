// L'équipe d'un projet (ticket 4029) : un badge par agent en tête de la vue du projet, son fil au clic, son niveau
// d'autonomie et ses gestes en attente — jouée avec la fixture (team-fixture.ts) dans la vue entière, puis le bloc seul
// devant un faux document, pour ce qu'une lecture ou un geste qui échoue y laisse. Le module des données
// (autonomy/source.js) est remplacé par un faux, comme la vue l'appelle : par l'objet `source`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER, holdFacts } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { holdTheTeam } from "../../src/vue/autonomy/team.js";
import { source, type Agent } from "../../src/vue/autonomy/source.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";
import { TEAM } from "./team-fixture.ts";

const THE_REAL = { ...source };
// Les lignes que le chef lit, telles que le bloc les écrit.
const UNAVAILABLE = "The agents not reached.";
const UNREADABLE = "the agents' reading is not readable";
const NO_ACTION = "No gesture yet.";
const LEVEL_NOT_CHANGE = (agent: string) => `${agent}'s level was not changed`;
const NOT_APPROVED = (agent: string) => `${agent}'s gesture was not approved`;
const WITHOUT_THE_ACTION = "the app does not take this gesture yet";
const doc = { createElement: (balise: string) => new Fake(balise) };
const copy = (): Agent[] => structuredClone(TEAM);
const buttons = (root: Fake) => root.dessous("button");
const badgeOf = (root: Fake, name: string): Fake => buttons(root).find((pose) => pose.dataset.agent === name) ?? assert.fail(`pas de badge « ${name} »`);
const named = (root: Fake, text: string): Fake[] => buttons(root).filter((pose) => pose.textContent === text);

// La source remplacée : ce que `lire` rend (une fonction, pour un rejet), et chaque appel reçu.
function fake(read: () => Promise<unknown>, { regler: set = async () => {}, approuver: approve = async () => {} }: { regler?: () => Promise<void>; approuver?: () => Promise<void> } = {}) {
  const calls: unknown[][] = [];
  Object.assign(source, {
    lire: (...args: unknown[]) => (calls.push(["lire", ...args]), read()),
    regler: (...args: unknown[]) => (calls.push(["regler", ...args]), set()),
    approuver: (...args: unknown[]) => (calls.push(["approuver", ...args]), approve()),
  });
  return calls;
}

async function block(project = "parade") {
  const frame = new Fake("section");
  const team = holdTheTeam(doc, frame);
  team.lire(project);
  team.montrer(project);
  await repos();
  return { cadre: frame, equipe: team };
}

test("the project view shows the fixture's agents at its top: supervisor and closer first, then manager, pass and each cook", async () => {
  fake(async () => copy());
  const facts = { etat: "ouverte", lu: "2026-10-13T10:04:11.000Z", dernierTick: "2026-10-13T10:04:11.000Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
  const startup = () => ({
    configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    gestes: {},
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: undefined,
  });
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] } as never);
  assert.equal(vue.element("equipe-du-projet").hidden, true, "no project shown: no team");
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const requests = vue.appels.filter(({ geste: action }) => action === "faits" || action === "relireBox");
  vue.dire("surFaits", { ...holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: "2026-10-13T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] }), demande: requests.at(-1)?.args[0] as number });
  await repos();
  const team = vue.element("equipe-du-projet");
  assert.equal(team.hidden, false);
  assert.deepEqual(
    buttons(team).map((pose) => pose.dataset.agent),
    ["supervisor", "closer", "manager", "pass", "cook-4029", "cook-4032"],
  );
  const closer = badgeOf(team, "closer");
  // Une ligne (#4354) : son point, son nom, son état, ce qui attend l'OK du chef ; le reste est dans son fil.
  assert.equal(closer.textContent, "closeridle1 awaits your OK");
  assert.deepEqual(["supervisor", "manager", "cook-4032"].map((name) => badgeOf(team, name).dessous("span")[0]?.dataset.ton), ["gris", "bleu", "rouge"]);
  closer.click();
  const thread = team.dessous("section").find(({ className }) => className === "fil") ?? assert.fail("pas de fil");
  assert.ok(thread.textContent.includes("deleted 412 dead lines in runtime/src/retenue/ · 03:12 UTC"));
  assert.ok(thread.textContent.includes("closer: next pass in 3 h"));
  assert.ok(!badgeOf(team, "supervisor").textContent.includes("awaits your OK"), "nothing pending, nothing said");
  assert.equal(badgeOf(team, "cook-4032").dataset.etat, "casse", "a broken agent is marked");
  assert.equal(badgeOf(team, "cook-4029").dataset.etat, "");
});

test("a click opens the agent's thread under the badges, marks its badge, and a second click closes it", async () => {
  fake(async () => copy());
  const { cadre: frame } = await block();
  assert.equal(frame.hidden, false);
  badgeOf(frame, "supervisor").click();
  assert.deepEqual(
    buttons(frame).filter((pose) => pose.ariaExpanded === "true").map((pose) => pose.dataset.agent),
    ["supervisor"],
  );
  assert.deepEqual(
    buttons(frame).filter((pose) => pose.className.includes("ouvert")).map((pose) => pose.dataset.agent),
    ["supervisor"],
  );
  const thread = frame.dessous("section")[0] ?? assert.fail("pas de fil");
  assert.deepEqual(
    thread.dessous("li").map((line) => line.textContent),
    ["09:01 UTC · reran tests on 0de1ff5 (red for 10 min): green", "07:30 UTC · freed the zone of #4012 (no cook held it): #4013 taken"],
  );
  assert.ok(thread.textContent.includes("fixed by itself 12 · handed to the chef 1"));
  assert.equal(named(frame, "OK").length, 0, "nothing pending: no OK");
  badgeOf(frame, "supervisor").click();
  assert.equal(frame.dessous("section").length, 0, "closed again");
  badgeOf(frame, "cook-4029").click();
  assert.ok(frame.textContent.includes(NO_ACTION), "an agent with no gesture says so");
});

test("nothing published by the runtime: no team at the top; another project shown: hidden too", async () => {
  fake(async () => null);
  const frame = new Fake("section");
  frame.hidden = false;
  const team = holdTheTeam(doc, frame);
  assert.equal(frame.hidden, true, "hidden before any reading");
  team.lire("parade");
  team.montrer("parade");
  await repos();
  assert.equal(frame.hidden, true);
  fake(async () => copy());
  team.lire("parade");
  await repos();
  assert.equal(frame.hidden, false);
  team.montrer("carnet");
  assert.equal(frame.hidden, true, "the team of parade is not carnet's");
  team.montrer(undefined);
  assert.equal(frame.hidden, true);
});

test("a reading that fails says it in one line, its detail on hover", async () => {
  fake(async () => {
    throw new Error("ssh: box unreachable");
  });
  const { cadre: frame } = await block();
  assert.equal(frame.hidden, false);
  assert.equal(frame.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
  assert.ok(frame.textContent.startsWith(UNAVAILABLE));
  assert.ok(!frame.textContent.includes("ssh: box unreachable"), "no raw error on screen");
  assert.ok(frame.dessous("button").some((help) => help.ariaLabel === "ssh: box unreachable"), "its detail on hover");
});

test("a reading that is not an agents list, or an agent missing a field, is said not readable: nothing is invented", async () => {
  for (const readEntry of [{ agents: [] }, [{ ...copy()[0], state: undefined }], [{ ...copy()[0], counters: { fixedBySelf: 1 } }]]) {
    fake(async () => readEntry);
    const { cadre: frame } = await block();
    assert.equal(frame.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
    assert.ok(frame.textContent.startsWith(UNREADABLE), JSON.stringify(readEntry));
  }
});

test("a reading of the project left behind is not shown on the next one", async () => {
  let render: (readOnes: unknown) => void = () => {};
  fake(() => new Promise((end) => (render = end)));
  const frame = new Fake("section");
  const team = holdTheTeam(doc, frame);
  team.lire("parade");
  const first = render;
  await repos();
  fake(async () => null);
  team.lire("carnet");
  team.montrer("carnet");
  await repos();
  first(copy());
  await repos();
  assert.equal(frame.hidden, true);
  assert.equal(frame.dessous("button").filter((pose) => pose.dataset.agent !== undefined).length, 0);
});

test("a level is set once, even clicked twice while it goes; the current level is not set again", async () => {
  let finish: () => void = () => {};
  const calls = fake(async () => copy(), { regler: () => new Promise((end) => (finish = end)) });
  const { cadre: frame } = await block();
  badgeOf(frame, "closer").click();
  (named(frame, "propose")[0] ?? assert.fail()).click();
  const act = named(frame, "act")[0] ?? assert.fail();
  act.click();
  await repos();
  assert.equal(named(frame, "act")[0]?.disabled, true, "disabled while it goes");
  act.click();
  await repos();
  finish();
  await repos();
  assert.deepEqual(
    calls.filter(([action]) => action === "regler"),
    [["regler", "closer", "act", "parade"]],
  );
  assert.equal(named(frame, "act")[0]?.ariaPressed, "true");
  assert.equal(named(frame, "act")[0]?.disabled, false);
});

test("a level the runtime refuses leaves the level as it was and says it in one line", async () => {
  fake(async () => copy(), {
    regler: async () => {
      throw new Error("runtime: unknown agent");
    },
  });
  const { cadre: frame } = await block();
  badgeOf(frame, "closer").click();
  (named(frame, "act")[0] ?? assert.fail()).click();
  await repos();
  assert.equal(named(frame, "propose")[0]?.ariaPressed, "true");
  assert.equal(named(frame, "act")[0]?.ariaPressed, "false");
  assert.ok(frame.textContent.includes(LEVEL_NOT_CHANGE("closer")));
  assert.equal(frame.dessous("p").find((line) => line.textContent.startsWith(LEVEL_NOT_CHANGE("closer")))?.role, "alert", "a failed gesture is read out at once");
  assert.ok(frame.dessous("button").some((help) => help.ariaLabel === "runtime: unknown agent"), "its detail on hover");
  assert.equal(named(frame, "propose")[0]?.ariaPressed, "true", "the level kept, in its thread");
});

test("an approval that fails keeps the gesture pending, with its OK, and says it; one that goes removes it", async () => {
  let fails = true;
  const calls = fake(async () => copy(), {
    approuver: async () => {
      if (fails) throw new Error("runtime: gesture expired");
    },
  });
  const { cadre: frame } = await block();
  badgeOf(frame, "closer").click();
  (named(frame, "OK")[0] ?? assert.fail()).click();
  await repos();
  assert.equal(named(frame, "OK").length, 1);
  assert.ok(frame.textContent.includes("delete 180 dead lines in runtime/src/rail.ts"));
  assert.ok(frame.textContent.includes(NOT_APPROVED("closer")));
  fails = false;
  const ok = named(frame, "OK")[0] ?? assert.fail();
  ok.click();
  ok.click();
  await repos();
  assert.deepEqual(
    calls.filter(([action]) => action === "approuver"),
    [
      ["approuver", "closer", "p-1", "parade"],
      ["approuver", "closer", "p-1", "parade"],
    ],
    "one failed call, then one call for two clicks",
  );
  assert.equal(named(frame, "OK").length, 0);
  assert.ok(!frame.textContent.includes(NOT_APPROVED("closer")));
  assert.ok(!badgeOf(frame, "closer").textContent.includes("awaits your OK"));
});

test("the real source reads no team (the new kitchen publishes none), and a gesture it does not carry is refused", async () => {
  Object.assign(source, THE_REAL);
  const receivedOnes: unknown[][] = [];
  const bridge: Record<string, unknown> = {};
  Object.assign(globalThis, { window: { brigade: bridge } });
  assert.equal(await source.lire("parade"), null);
  await assert.rejects(source.regler("closer", "act", "parade"), { message: WITHOUT_THE_ACTION });
  await assert.rejects(source.approuver("closer", "p-1", "parade"), { message: WITHOUT_THE_ACTION });
  Object.assign(bridge, {
    reglerLAutonomie: async (...args: unknown[]) => void receivedOnes.push(["regler", ...args]),
    approuverLeGeste: async (...args: unknown[]) => void receivedOnes.push(["approuver", ...args]),
  });
  await source.regler("closer", "act", "parade");
  await source.approuver("closer", "p-1", "parade");
  assert.deepEqual(receivedOnes, [
    ["regler", "parade", "closer", "act"],
    ["approuver", "parade", "closer", "p-1"],
  ]);
});
