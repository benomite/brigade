// Acceptance test (#4087). Criterion 2: after sign-in nothing is cloned and no project is added, whether the account was
// already read at launch or the sign-in comes later.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE, type Project } from "../../src/config.ts";
import type { AccountGitHub } from "../../src/connection-github.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Ouverture, StationsDuChef } from "../../src/first-launch.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import { Faux, FauxStockage, jouerLaVue, type Jouee, repos } from "../aides/fausse-vue.ts";

const CHEMIN = "/home/chef/.config/brigade/app.json";
const demarrage = (projects: Project[]) => ({
  configuration: pourLaBar({ chemin: CHEMIN, projets: projects }, () => false),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const AUCUNE: StationsDuChef = { state: "listed", unreadable: [], stations: [] };
const OUVERT: Ouverture = { state: "open", project: "brigade", repository: "benomite/brigade", folder: "/home/chef/Brigade/brigade", cloned: true };
const ajouts = (vue: Jouee) => vue.appels.filter(({ geste: action }) => /ouvrirDUneStation|clone|ajouter/i.test(action));
const trouve = (vue: Jouee, motif: RegExp): Faux | undefined => vue.poses().find((p) => (p.balise === "button" || p.role === "button") && !p.hidden && motif.test(`${p.textContent} ${p.title} ${p.ariaLabel}`));

const lancer = (account: () => AccountGitHub) => jouerLaVue({ demarrage: () => demarrage([]), stationsDuChef: () => AUCUNE, compteGitHub: account, ouvrirDUneStation: () => OUVERT, espace: () => [] }, { stockage: new FauxStockage() });

test("sign-in alone triggers no add and no clone", async () => {
  const vue = await lancer(() => ({ login: "newcomer" }));
  await repos();
  assert.deepEqual(ajouts(vue), []);
  // The sign-in finishing later, as the event the app sends, changes nothing either.
  vue.dire("surConnexionGitHub", { connecte: true });
  await repos();
  assert.deepEqual(ajouts(vue), [], "the sign-in event adds nothing");
  assert.ok(trouve(vue, /visit a real kitchen/i), "the welcome screen waits for the newcomer's choice");
});

test("a signed-out computer adds nothing either, before and after it signs in", async () => {
  let lectures = 0;
  const vue = await lancer(() => (++lectures === 1 ? { nonConnecte: true } : { login: "newcomer" }));
  await repos();
  assert.deepEqual(ajouts(vue), []);
  vue.dire("surConnexionGitHub", { connecte: true });
  await repos();
  assert.deepEqual(ajouts(vue), []);
  assert.ok(trouve(vue, /visit a real kitchen/i), "the choice is offered once signed in");
});
