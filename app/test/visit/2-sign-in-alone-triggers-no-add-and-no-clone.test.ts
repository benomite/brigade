// Acceptance test (#4087). Criterion 2: after sign-in nothing is cloned and no project is added, whether the account was
// already read at launch or the sign-in comes later.
import assert from "node:assert/strict";
import { test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import type { AccountGitHub } from "../../src/connection-github.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { Opening, StationsOfChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { Fake, FakeStorage, playTheVue, type Played, repos } from "../helpers/false-vue.ts";

const PATH = "/home/chef/.config/brigade/app.json";
const startup = (projects: Project[]) => ({
  configuration: forTheBar({ chemin: PATH, projets: projects }, () => false),
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
const NO: StationsOfChef = { state: "listed", unreadable: [], stations: [] };
const OPEN: Opening = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const additions = (vue: Played) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const finds = (vue: Played, motive: RegExp): Fake | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motive.test(`${p.textContent} ${p.title} ${p.ariaLabel}`));

const launch = (account: () => AccountGitHub) => playTheVue({ demarrage: () => startup([]), stationsDuChef: () => NO, compteGitHub: account, ouvrirDUneStation: () => OPEN, espace: () => [] }, { stockage: new FakeStorage() });

test("sign-in alone triggers no add and no clone", async () => {
  const vue = await launch(() => ({ login: "newcomer" }));
  await repos();
  assert.deepEqual(additions(vue), []);
  // The sign-in finishing later, as the event the app sends, changes nothing either.
  vue.dire("surConnexionGitHub", { connecte: true });
  await repos();
  assert.deepEqual(additions(vue), [], "the sign-in event adds nothing");
  assert.ok(finds(vue, /visit a real kitchen/i), "the welcome screen waits for the newcomer's choice");
});

test("a signed-out computer adds nothing either, before and after it signs in", async () => {
  let readings = 0;
  const vue = await launch(() => (++readings === 1 ? { nonConnecte: true } : { login: "newcomer" }));
  await repos();
  assert.deepEqual(additions(vue), []);
  vue.dire("surConnexionGitHub", { connecte: true });
  await repos();
  assert.deepEqual(additions(vue), []);
  assert.ok(finds(vue, /visit a real kitchen/i), "the choice is offered once signed in");
});
