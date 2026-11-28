// A fresh profile (#4799): no tour, no welcome screen, no stations list to open a project from. The app opens on Home — its
// empty list of projects — which offers the GitHub connection ("connect to GitHub") and "Add a project", which still adds one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { ITSELF_CONNECT } from "../src/vue/addition-project/account.js";
import { playTheVue, repos, type Fake } from "./helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const startup = () => ({
  configuration: forTheBar({ chemin: PATH, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXAMPLE,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  });
const WITHOUT_ACCOUNT = {
  state: "sign-in-required" as const,
  reason: "This computer is not signed in to GitHub, so brigade cannot read the stations registered under your account.",
  action: { id: "github-sign-in" as const, label: "Sign in to GitHub", command: ["gh", "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"] },
};
const button = (root: Fake, text: string) => root.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`no button « ${text} »: ${root.dessous("button").map((b) => b.textContent)}`);

test("a fresh profile opens on Home, not on a tour: GitHub is connected from there", async () => {
  const vue = await playTheVue({
    demarrage: startup,
    compteGitHub: () => ({ nonConnecte: true }),
    stationsDuCompte: () => WITHOUT_ACCOUNT,
    seConnecterAGitHub: () => ({ connecte: true }),
    espace: () => [],
  });
  await repos();
  assert.equal(vue.element("tous").hidden, false, "Home is shown");
  assert.equal(vue.element("ajout").hidden, true, "and not the Add a project screen");
  assert.equal(vue.element("tous").dessous("section").some((pose) => pose.className.includes("premier-lancement")), false);
  assert.ok(vue.element("tous").dessous("div").every((pose) => !pose.className.includes("premier-lancement")));
  assert.equal(vue.appels.some(({ geste: action }) => ["stationsDuChef", "lireLaCuisineVisitee", "avisDeFond"].includes(action)), false, "no first-launch read");
  button(vue.element("tous"), WITHOUT_ACCOUNT.action.label).click();
  await repos();
  assert.equal(vue.appels.some(({ geste: action }) => action === "seConnecterAGitHub"), true, "the GitHub sign-in runs from Home");
});

test("from that Home, « + » opens Add a project, which connects GitHub too", async () => {
  const vue = await playTheVue({
    demarrage: startup,
    compteGitHub: () => ({ nonConnecte: true }),
    depotsDuChef: () => ({ depots: [] }),
    stationsDuCompte: () => WITHOUT_ACCOUNT,
    espace: () => [],
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("no « + »")).click();
  await repos();
  assert.equal(vue.element("ajout").hidden, false);
  assert.ok(button(vue.element("ajout"), ITSELF_CONNECT));
});
