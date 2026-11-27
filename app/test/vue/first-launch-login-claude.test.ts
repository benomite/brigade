// Le premier lancement, Claude Code pas connecté sur cet ordinateur (#4057) : l'ouverture d'un projet ne démarre rien, sa
// phrase le dit sous la station avec « log in » — le login de la panne « Max connection lost » —, et la fin du login
// relance l'ouverture : connecté, la copie part et la cuisine démarre. Le login rendu se dit sous la phrase.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { NOT_CONNECTED, type Opening, type StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { openingOf, openingSaid, RETRY, ITSELF_CONNECT_A_CLAUDE } from "../../src/vue/first-launch.js";
import { Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const SEEN = "2026-11-24T09:00:00.000Z";
const LISTED: StationsOfChef = {
  state: "listed",
  unreadable: [],
  stations: [{ id: "gbox", name: "parade-box", machine: "Debian 12", kind: "ordinateur", cooks: true, version: "2.4.0", online: true, lastSeen: SEEN, stoppedAt: null, projects: [{ name: "parade", repository: "benomite/parade" }] }],
};
const startup = () => ({
  configuration: forTheBar({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }),
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
const HELD: Opening = { state: "login", project: "parade", repository: "benomite/parade", cause: "login" as const, reason: NOT_CONNECTED("parade") };
const QUEUED = new Promise<Opening>(() => {}) as unknown as Opening;

test("not logged in: the step says so under its station and offers log in; the login's end opens the project again", async () => {
  let trials = 0;
  const vue = await playTheVue({
    demarrage: startup,
    stationsDuChef: () => LISTED,
    compteGitHub: () => ({ login: "chef" }),
    ouvrirDUneStation: () => (++trials === 1 ? HELD : QUEUED),
    seConnecterAClaude: () => ({ fait: "the login page opens in your browser" }),
    espace: () => [],
  });
  (vue.element("tous").dessous("button").find((button) => button.textContent === "parade") ?? assert.fail()).click();
  await repos();
  const all = vue.element("tous");
  assert.equal((all.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("no sentence")).dessous("span")[0]?.textContent, NOT_CONNECTED("parade"));
  (all.dessous("button").find((button) => button.textContent === ITSELF_CONNECT_A_CLAUDE) ?? assert.fail("no log in")).click();
  await repos();
  assert.equal(vue.appels.filter(({ geste: action }) => action === "seConnecterAClaude").length, 1);
  assert.ok(vue.element("tous").dessous("p").some((pose) => pose.textContent === "the login page opens in your browser"), "the login's answer is said");
  assert.equal(trials, 1, "nothing opens before the login ends");
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(trials, 2);
  assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, openingOf("parade"));
});

test("a login's end with no opening held back opens nothing", async () => {
  let trials = 0;
  const vue = await playTheVue({ demarrage: startup, stationsDuChef: () => LISTED, ouvrirDUneStation: () => (++trials, QUEUED), espace: () => [] });
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(trials, 0);
});

test("a login that could not start says why, under the sentence, and log in stays", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  const opening = { station: "gbox", projet: "parade", depot: "benomite/parade", echec: HELD as Extract<Opening, { state: "login" }>, login: { refus: "the login was not launched" } };
  const action = { ouvrir: () => {}, seConnecter: () => {}, seConnecterAClaude: () => {}, ouvrirLaPage: () => {} };
  const poses = openingSaid(doc, opening, {}, action) as unknown as Fake[];
  const texts = poses.flatMap((pose) => [pose, ...pose.descendants()]).map((pose) => pose.textContent);
  assert.ok(texts.includes("the login was not launched"));
  assert.deepEqual(
    poses.flatMap((pose) => pose.dessous("button")).map((button) => button.textContent),
    [ITSELF_CONNECT_A_CLAUDE, RETRY],
  );
});
