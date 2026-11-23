// Les outils requis dans la vue jouée (#4059) : le premier lancement les vérifie d'abord — un outil qui manque prend la
// place du compte, la connexion ne tourne pas, l'ouverture d'un projet attend et repart une fois l'outil installé —, et
// le login Max sans Claude Code montre son écran dans l'avis.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { ABSENT } from "../../src/pannes/login.ts";
import type { OutilManquant } from "../../src/outils-requis.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { choisirInstallation, type OutilRequis } from "../../../runtime/src/outils-requis/outils-requis.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { SE_CONNECTER } from "../../src/vue/parcours-projet/compte.js";
import { OUVRIR_CE_PROJET } from "../../src/vue/premier-lancement.js";
import { DEJA_INSTALLE } from "../../src/vue/outils-requis/outils-requis.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirToutesLesStations, repos } from "../aides/fausse-vue.ts";

const base = () => ({
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const neuf = () => ({ ...base(), configuration: pourLaBarre({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }), poste: { nom: "this Mac", mac: true } });
// Le `gh` de ce Mac n'est connecté à aucun compte, tel que le runtime le lit.
const SANS_COMPTE = echecDeGh("gh", 30_000, { code: 4, message: "Command failed: gh api /gists" }, "To get started with GitHub CLI, please run:  gh auth login\n");
// Ce qui manque, tel que le runtime le rend pour un Mac nu.
const manquant = (outil: OutilRequis): OutilManquant => ({ outil, installation: choisirInstallation(outil, { plateforme: "darwin", presents: [] }) });

const tous = (vue: Jouee) => vue.element("tous");
const boutons = (ou: Faux) => ou.dessous("button").map((b) => b.textContent);
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((b) => b.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).join(", ")}`);
const outilManquant = (ou: Faux) => ou.dessous("section").find((s) => s.className === "ecran-outil-manquant");
const appels = (vue: Jouee, geste: string) => vue.appels.filter((appel) => appel.geste === geste);

test("sans gh, le premier lancement montre son écran à la place du compte ; installé, le compte revient, sans connexion lancée", async () => {
  let manque: OutilManquant[] = [manquant("gh")];
  const vue = await jouerLaVue({ demarrage: neuf, stationsDuChef: () => SANS_COMPTE, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => manque, espace: () => [] });
  await repos();
  assert.deepEqual(appels(vue, "outilsManquants")[0]?.args, [["git", "gh"]]);
  const ecran = outilManquant(tous(vue)) ?? assert.fail("pas d'écran de l'outil manquant");
  assert.equal(ecran.dataset.outil, "gh");
  assert.ok(!boutons(tous(vue)).includes(SE_CONNECTER), "le bouton de connexion attend l'outil");
  // Le projet se tape toujours dessous.
  assert.ok(boutons(tous(vue)).includes(OUVRIR_CE_PROJET));
  manque = [];
  bouton(tous(vue), DEJA_INSTALLE).click();
  await repos();
  assert.equal(outilManquant(tous(vue)), undefined);
  assert.ok(boutons(tous(vue)).includes(SE_CONNECTER));
  assert.equal(appels(vue, "seConnecterAGitHub").length, 0);
});

test("la connexion vérifie d'abord : gh parti entre-temps, elle ne tourne pas, et son écran le dit", async () => {
  let manque: OutilManquant[] = [];
  const vue = await jouerLaVue({ demarrage: neuf, stationsDuChef: () => SANS_COMPTE, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => manque, seConnecterAGitHub: () => ({ code: "ABCD-1234", page: "https://github.com/login/device" }), espace: () => [] });
  await repos();
  manque = [manquant("gh")];
  bouton(tous(vue), SE_CONNECTER).click();
  await repos();
  assert.equal(appels(vue, "seConnecterAGitHub").length, 0);
  assert.equal(outilManquant(tous(vue))?.dataset.outil, "gh");
  // Là, la connexion part.
  manque = [];
  bouton(tous(vue), DEJA_INSTALLE).click();
  await repos();
  bouton(tous(vue), SE_CONNECTER).click();
  await repos();
  assert.equal(appels(vue, "seConnecterAGitHub").length, 1);
});

test("sans git, l'ouverture d'un projet attend son écran, puis repart d'elle-même, le projet tapé gardé", async () => {
  let manque: OutilManquant[] = [];
  const vue = await jouerLaVue({
    demarrage: neuf,
    stationsDuChef: () => SANS_COMPTE,
    compteGitHub: () => ({ login: "chef" }),
    outilsManquants: () => manque,
    ouvrirDUneStation: (nom: string, depot: string) => ({ state: "failed", project: nom, repository: depot, cause: "unknown", reason: "stop here" }),
    espace: () => [],
  });
  await repos();
  manque = [manquant("git")];
  const champ = tous(vue).dessous("input").find((entree) => entree.id === "projet-du-premier") ?? assert.fail("pas de champ");
  champ.value = "chef/parade";
  champ.declencher("input");
  bouton(tous(vue), OUVRIR_CE_PROJET).click();
  await repos();
  assert.equal(appels(vue, "ouvrirDUneStation").length, 0);
  assert.equal(outilManquant(tous(vue))?.dataset.outil, "git");
  manque = [];
  bouton(tous(vue), DEJA_INSTALLE).click();
  await repos();
  assert.deepEqual(appels(vue, "ouvrirDUneStation").map(({ args }) => args.slice(0, 2)), [["parade", "chef/parade"]]);
});

const CONNEXION: Panne = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "macOS 26", etat: "en-ligne", ligne: "online · no project", pannes: [CONNEXION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const ACCUEIL: Accueil = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost", phrase: "online · no cook running", survol: "macOS 26" }], sante: { ton: "rouge", dit: "Max: connection lost on box", survol: "" } };

test("le login Max sans Claude Code : l'écran de l'outil manquant s'ouvre dans l'avis, et se referme une fois installé", async () => {
  let manque: OutilManquant[] = [manquant("claude")];
  const vue = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: ACCUEIL }),
    panne: () => ({ outilManquant: "claude", refus: ABSENT }),
    outilsManquants: () => manque,
    espace: () => [],
  });
  await ouvrirToutesLesStations(vue);
  (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  const avis = vue.element("avis");
  assert.equal(avis.hidden, true);
  bouton(vue.element("station"), "log in").click();
  await repos();
  assert.deepEqual(appels(vue, "outilsManquants").at(-1)?.args, [["claude"]]);
  assert.equal(avis.hidden, false);
  assert.equal(outilManquant(avis)?.dataset.outil, "claude");
  assert.match(avis.textContent, /Claude Code is not installed on this computer/);
  manque = [];
  bouton(avis, DEJA_INSTALLE).click();
  await repos();
  assert.equal(avis.hidden, true);
  // Un login qui part ne l'ouvre pas.
  manque = [manquant("claude")];
  const autre = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: ACCUEIL }),
    panne: () => ({ fait: "the login page opens in your browser" }),
    outilsManquants: () => manque,
    espace: () => [],
  });
  await ouvrirToutesLesStations(autre);
  (autre.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  bouton(autre.element("station"), "log in").click();
  await repos();
  assert.equal(appels(autre, "outilsManquants").length, 0);
  assert.equal(autre.element("avis").hidden, true);
});
