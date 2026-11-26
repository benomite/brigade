// L'installation d'un clic dans la vue jouée (#4350) : au premier lancement sans gh, « install gh » l'installe, puis le
// compte revient ; au login Max sans Claude Code, « install claude » l'installe dans l'avis, qui finit sur « log in ».
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
import type { OutilManquant } from "../../src/outils-requis.ts";
import { echecDeGh } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { choisirInstallation, type OutilRequis } from "../../../runtime/src/outils-requis/outils-requis.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { SE_CONNECTER } from "../../src/vue/parcours-projet/compte.js";
import { CLAUDE_INSTALLE, DEJA_INSTALLE, INSTALLER, TOUJOURS_ABSENT } from "../../src/vue/outils-requis/outils-requis.js";
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
// `installable` : ce que le process principal ajoute (install-tools.ts, `pourLaVue`).
const manquant = (outil: OutilRequis): OutilManquant & { installable: boolean } => ({ outil, installation: choisirInstallation(outil, { plateforme: "darwin", presents: [] }), installable: true });

const CONNEXION: Panne = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "macOS 26", etat: "en-ligne", ligne: "online · no project", pannes: [CONNEXION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const ACCUEIL: Accueil = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost", phrase: "online · no cook running", survol: "macOS 26" }], sante: { ton: "rouge", dit: "Max: connection lost on box", survol: "" } };

const tous = (vue: Jouee) => vue.element("tous");
const boutons = (ou: Faux) => ou.dessous("button").map((b) => b.textContent);
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((b) => b.textContent === texte) ?? assert.fail(`no '${texte}' button: ${boutons(ou).join(", ")}`);
const outilManquant = (ou: Faux) => ou.dessous("section").find((s) => s.className === "ecran-outil-manquant");
const appels = (vue: Jouee, geste: string) => vue.appels.filter((appel) => appel.geste === geste);

test("first run without gh: 'install gh' installs it on the click only, then the account comes back", async () => {
  let manque = [manquant("gh")];
  const vue = await jouerLaVue({
    demarrage: neuf,
    stationsDuChef: () => SANS_COMPTE,
    compteGitHub: () => ({ nonConnecte: true }),
    outilsManquants: () => manque,
    installerOutil: () => ((manque = []), { phase: "done" }),
    espace: () => [],
  });
  await repos();
  assert.equal(outilManquant(tous(vue))?.dataset.outil, "gh");
  assert.equal(appels(vue, "installerOutil").length, 0, "nothing installs before the click");
  // « I installed it » relit, et dit l'outil toujours absent ; l'installation reste offerte.
  bouton(tous(vue), DEJA_INSTALLE).click();
  await repos();
  assert.match(tous(vue).textContent, new RegExp(TOUJOURS_ABSENT("gh").slice(0, 30)));
  assert.equal(appels(vue, "installerOutil").length, 0);
  bouton(tous(vue), INSTALLER("gh")).click();
  await repos();
  await repos();
  assert.deepEqual(appels(vue, "installerOutil").map(({ args }) => args), [["gh"]]);
  assert.equal(outilManquant(tous(vue)), undefined);
  assert.ok(boutons(tous(vue)).includes(SE_CONNECTER));
});

test("Max login without Claude Code: 'install claude' in the notice, then 'log in' runs this computer's login and the notice closes", async () => {
  let manque = [manquant("claude")];
  const vue = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: ACCUEIL }),
    panne: () => ({ outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" }),
    outilsManquants: () => manque,
    installerOutil: () => ((manque = []), { phase: "done" }),
    seConnecterAClaude: () => ({ fait: "the login page opens in your browser" }),
    espace: () => [],
  });
  await ouvrirToutesLesStations(vue);
  (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("no station line")).click();
  await repos();
  bouton(vue.element("station"), "log in").click();
  await repos();
  const avis = vue.element("avis");
  bouton(avis, INSTALLER("claude")).click();
  await repos();
  await repos();
  assert.deepEqual(appels(vue, "installerOutil").map(({ args }) => args), [["claude"]]);
  assert.equal(avis.hidden, false);
  assert.equal(outilManquant(avis), undefined);
  assert.match(avis.textContent, new RegExp(CLAUDE_INSTALLE.slice(0, 25)));
  bouton(avis, "log in").click();
  await repos();
  assert.equal(appels(vue, "seConnecterAClaude").length, 1);
  assert.equal(avis.hidden, true);
});

test("the notice closed after Claude Code is installed does not come back for it", async () => {
  let manque = [manquant("claude")];
  const vue = await jouerLaVue({
    demarrage: () => ({ ...base(), configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: ACCUEIL }),
    panne: () => ({ outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" }),
    outilsManquants: () => manque,
    installerOutil: () => ((manque = []), { phase: "done" }),
    espace: () => [],
  });
  await ouvrirToutesLesStations(vue);
  (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("no station line")).click();
  await repos();
  bouton(vue.element("station"), "log in").click();
  await repos();
  const avis = vue.element("avis");
  bouton(avis, INSTALLER("claude")).click();
  await repos();
  await repos();
  bouton(avis, "close").click();
  assert.equal(avis.hidden, true);
  // Une autre lecture des outils repose l'avis : rien ne manque, rien n'y revient.
  bouton(vue.element("station"), "log in").click();
  await repos();
  assert.equal(avis.hidden, true);
});
