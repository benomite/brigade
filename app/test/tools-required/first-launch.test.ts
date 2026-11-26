// Les outils requis dans la vue jouée (#4059) : le premier lancement les vérifie d'abord — un outil qui manque prend la
// place du compte, la connexion ne tourne pas, l'ouverture d'un projet attend et repart une fois l'outil installé —, et
// le login Max sans Claude Code montre son écran dans l'avis.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { ToolManquant } from "../../src/tools-required.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { choisirInstallation, type OutilRequis } from "../../../runtime/src/outils-requis/outils-requis.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { EFFORTS, MODELES } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { SE_CONNECTER } from "../../src/vue/journey-project/account.js";
import { OUVRIR_CE_PROJECT } from "../../src/vue/first-launch.js";
import { DEJA_INSTALLE } from "../../src/vue/tools-required/tools-required.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirToutesLesStations, repos } from "../aides/fausse-vue.ts";

const base = () => ({
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const neuf = () => ({ ...base(), configuration: pourLaBar({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }), poste: { nom: "this Mac", mac: true } });
// Le `gh` de ce Mac n'est connecté à aucun compte, tel que le runtime le lit.
const SANS_ACCOUNT = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Ce qui manque, tel que le runtime le rend pour un Mac nu.
const manquant = (tool: OutilRequis): ToolManquant => ({ outil: tool, installation: choisirInstallation(tool, { plateforme: "darwin", presents: [] }) });

const tous = (vue: Jouee) => vue.element("tous");
const boutons = (ou: Faux) => ou.dessous("button").map((b) => b.textContent);
const button = (ou: Faux, texte: string) => ou.dessous("button").find((b) => b.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).join(", ")}`);
const toolManquant = (ou: Faux) => ou.dessous("section").find((s) => s.className === "ecran-outil-manquant");
const calls = (vue: Jouee, action: string) => vue.appels.filter((call) => call.geste === action);

test("sans gh, le premier lancement montre son écran à la place du compte ; installé, le compte revient, sans connexion lancée", async () => {
  let manque: ToolManquant[] = [manquant("gh")];
  const vue = await jouerLaVue({ demarrage: neuf, stationsDuChef: () => SANS_ACCOUNT, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => manque, espace: () => [] });
  await repos();
  assert.deepEqual(calls(vue, "outilsManquants")[0]?.args, [["git", "gh"]]);
  const screen = toolManquant(tous(vue)) ?? assert.fail("pas d'écran de l'outil manquant");
  assert.equal(screen.dataset.outil, "gh");
  assert.ok(!boutons(tous(vue)).includes(SE_CONNECTER), "le bouton de connexion attend l'outil");
  // Le projet se tape toujours dessous.
  assert.ok(boutons(tous(vue)).includes(OUVRIR_CE_PROJECT));
  manque = [];
  button(tous(vue), DEJA_INSTALLE).click();
  await repos();
  assert.equal(toolManquant(tous(vue)), undefined);
  assert.ok(boutons(tous(vue)).includes(SE_CONNECTER));
  assert.equal(calls(vue, "seConnecterAGitHub").length, 0);
});

test("la connexion vérifie d'abord : gh parti entre-temps, elle ne tourne pas, et son écran le dit", async () => {
  let manque: ToolManquant[] = [];
  const vue = await jouerLaVue({ demarrage: neuf, stationsDuChef: () => SANS_ACCOUNT, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => manque, seConnecterAGitHub: () => ({ code: "ABCD-1234", page: "https://github.com/login/device" }), espace: () => [] });
  await repos();
  manque = [manquant("gh")];
  button(tous(vue), SE_CONNECTER).click();
  await repos();
  assert.equal(calls(vue, "seConnecterAGitHub").length, 0);
  assert.equal(toolManquant(tous(vue))?.dataset.outil, "gh");
  // Là, la connexion part.
  manque = [];
  button(tous(vue), DEJA_INSTALLE).click();
  await repos();
  button(tous(vue), SE_CONNECTER).click();
  await repos();
  assert.equal(calls(vue, "seConnecterAGitHub").length, 1);
});

test("sans git, l'ouverture d'un projet attend son écran, puis repart d'elle-même, le projet tapé gardé", async () => {
  let manque: ToolManquant[] = [];
  const vue = await jouerLaVue({
    demarrage: neuf,
    stationsDuChef: () => SANS_ACCOUNT,
    compteGitHub: () => ({ login: "chef" }),
    outilsManquants: () => manque,
    ouvrirDUneStation: (name: string, repository: string) => ({ state: "failed", project: name, repository: repository, cause: "unknown", reason: "stop here" }),
    espace: () => [],
  });
  await repos();
  manque = [manquant("git")];
  const champ = tous(vue).dessous("input").find((entree) => entree.id === "projet-du-premier") ?? assert.fail("pas de champ");
  champ.value = "chef/parade";
  champ.declencher("input");
  button(tous(vue), OUVRIR_CE_PROJECT).click();
  await repos();
  assert.equal(calls(vue, "ouvrirDUneStation").length, 0);
  assert.equal(toolManquant(tous(vue))?.dataset.outil, "git");
  manque = [];
  button(tous(vue), DEJA_INSTALLE).click();
  await repos();
  assert.deepEqual(calls(vue, "ouvrirDUneStation").map(({ args }) => args.slice(0, 2)), [["parade", "chef/parade"]]);
});

const CONNECTION: Outage = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "macOS 26", etat: "en-ligne", ligne: "online · no project", pannes: [CONNECTION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const HOME: Home = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost", phrase: "online · no cook running", survol: "macOS 26" }], sante: { ton: "rouge", dit: "Max: connection lost on box", survol: "" } };

test("le login Max sans Claude Code : l'écran de l'outil manquant s'ouvre dans l'avis, et se referme une fois installé", async () => {
  let manque: ToolManquant[] = [manquant("claude")];
  const vue = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: HOME }),
    panne: () => ({ outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" }),
    outilsManquants: () => manque,
    espace: () => [],
  });
  await ouvrirToutesLesStations(vue);
  (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  const opinion = vue.element("avis");
  assert.equal(opinion.hidden, true);
  button(vue.element("station"), "log in").click();
  await repos();
  assert.deepEqual(calls(vue, "outilsManquants").at(-1)?.args, [["claude"]]);
  assert.equal(opinion.hidden, false);
  assert.equal(toolManquant(opinion)?.dataset.outil, "claude");
  assert.match(opinion.textContent, /Claude Code is not installed on this computer/);
  manque = [];
  button(opinion, DEJA_INSTALLE).click();
  await repos();
  assert.equal(opinion.hidden, true);
  // Un login qui part ne l'ouvre pas.
  manque = [manquant("claude")];
  const autre = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: HOME }),
    panne: () => ({ fait: "the login page opens in your browser" }),
    outilsManquants: () => manque,
    espace: () => [],
  });
  await ouvrirToutesLesStations(autre);
  (autre.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  button(autre.element("station"), "log in").click();
  await repos();
  assert.equal(calls(autre, "outilsManquants").length, 0);
  assert.equal(autre.element("avis").hidden, true);
});
