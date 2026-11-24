// Le process de l'icône de fond (#3631), lancé par entree.ts quand le binaire de l'app reçoit `--tray-fond` — à
// l'ouverture de session par son agent launchd ou sa valeur `Run` (systeme.ts), et par l'app à chaque ouverture. Il n'a
// pas de fenêtre : une icône dans la barre des menus du Mac ou la zone de notification de Windows, qui reste là l'app
// fermée. Toutes les quinze secondes, il relit les `facts` de chaque projet que la station de cet ordinateur sert, et
// redit la ligne et le menu quand ils changent (tray-fond.ts). Le chef la retire dans Settings, comme celle de l'app
// (`barreDeMenus`, config.ts).
import { spawn } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as attendre } from "node:timers/promises";
import { app, dialog, nativeImage, type MenuItemConstructorOptions } from "electron";
import { lancerIci, type Locale } from "../box.ts";
import type { ProjetLu } from "../barre-de-menus.ts";
import { cheminConfiguration, lireConfiguration } from "../config.ts";
import { RELEASES_URL } from "../mise-a-jour/android.ts";
import { cheminDe, emplacementsDe, lireCheminDuShell } from "../emplacements.ts";
import { shellDuPoste } from "../plateforme.ts";
import { servisPar } from "../poste/cuisine-ici.ts";
import { prendreLaPlace } from "./instance.ts";
import { creerLIcone, ICONE_DE_LA_BARRE, PlaceTenue, type IconeUnique } from "../tray/icone.ts";
import { ligneDuFond } from "../tray/ligne.ts";
import { jouerLeGeste, lireLesProjets, type Lancer } from "./lecture.ts";
import { DOSSIER_DU_FOND, ecrireLaVersionDuFond, executer, quitterLaStation } from "./systeme.ts";
import { clicSurLApp, confirmationDeQuitter, etatDeLaStation, menuDuFond, questionsDuFond, type EntreeDuFond, type Geste } from "./tray-fond.ts";
import type { Veille } from "../vue/veille-machine/veille-machine.js";

const INTERVALLE_MS = 15_000;
const DELAI_MS = 30_000;

// Ses propres données, à part de celles de l'app : les deux tournent en même temps. Un seul process d'icône par compte.
app.setPath("userData", join(app.getPath("userData"), DOSSIER_DU_FOND));
// Pas le verrou d'Electron, réservé à l'app (entree.ts, #3864) : un fichier de pid dans ses données.
if (prendreLaPlace(join(app.getPath("userData"), "tray.pid")) !== undefined) app.exit(0);
else {
  // La version de l'icône qui tient la place, que l'app relit pour relancer une icône restée sur le code d'avant une mise à
  // jour (#4071). Non écrite, l'app la relance à chacune de ses ouvertures, sans plus.
  try {
    ecrireLaVersionDuFond(app.getPath("userData"), app.getVersion());
  } catch (erreur) {
    console.error(`brigade: the icon could not write its version — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}
// Ni fenêtre, ni icône dans le Dock.
app.on("window-all-closed", () => {});
// Sur un Mac, l'icône est un process du paquet de l'app : un clic sur l'app (Dock, Finder, Launchpad) pendant qu'elle tourne
// lui est adressé, et ne lançait rien — l'app quittée ne se rouvrait plus (#4071). Il ouvre l'app, sauf celui que le
// lancement de l'icône émet lui-même (`clicSurLApp`).
const demarrage = Date.now();
app.on("activate", () => {
  if (clicSurLApp(demarrage, Date.now())) ouvrirLApp();
});

const plateforme = process.platform;
const src = join(import.meta.dirname, "..");
const emplacements = emplacementsDe({ ressources: process.resourcesPath, src, env: process.env });
// Lancée par launchd, elle n'a que le PATH du système : celui du shell de connexion du chef, comme l'app (emplacements.ts).
const chemin = cheminDe({ emplacements, env: process.env, maison: homedir(), plateforme, duShell: () => (plateforme === "win32" ? undefined : lireCheminDuShell(shellDuPoste(plateforme, process.env).commande, 10_000)) });
if (chemin !== undefined) process.env.PATH = chemin;
const racine = process.env.BRIGADE_STATION_DIR || join(dirname(cheminConfiguration()), "station");
const locale: Locale = { node: emplacements.node, runtime: emplacements.runtime, racine, env: process.env };
const lancer: Lancer = (projet, commande) => lancerIci(locale, projet, commande, DELAI_MS);

let icone: IconeUnique | undefined;
let projets: ProjetLu[] = [];
// Garder ce Mac éveillé tant qu'un cook cuit (#3642) : le réglage et l'état que la station écrit sous son répertoire, lus
// et écrits par le module du runtime qui les tient.
const veilleDuRuntime = () => import(pathToFileURL(join(emplacements.runtime, "src", "veille-machine", "contrat.ts")).href) as Promise<typeof import("../../../runtime/src/veille-machine/contrat.ts")>;
let veille: Veille | undefined;
let veilleIllisible = "";
let dite = "";
let enCours = false;

// L'app : lancée, ou ramenée devant si elle tourne — elle ne garde qu'un process, et ramène sa fenêtre (entree.ts).
function ouvrirLApp(): void {
  const args = emplacements.facon === "installee" ? [] : [app.getAppPath()];
  const enfant = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: false });
  // Une app qui ne s'ouvre pas est dite en une phrase, avec quoi faire (#4071) ; la raison du système va au journal.
  enfant.once("error", (erreur) => {
    console.error(`brigade: the app could not be opened — ${erreur.message}`);
    void dialog.showMessageBox({ type: "error", message: "brigade could not be opened", detail: `Brigade could not open its window, so try again from this icon, and if it still does not open, download it again from ${RELEASES_URL} and reinstall it.` });
  });
  enfant.unref();
}

async function dire(echecs: readonly string[]): Promise<void> {
  if (echecs.length > 0) await dialog.showMessageBox({ type: "warning", message: "The station did not take the whole action", detail: echecs.join("\n\n") });
}

async function jouer(geste: Geste): Promise<void> {
  if (geste === "ouvrir") return ouvrirLApp();
  if (enCours) return;
  enCours = true;
  try {
    if (geste === "quitter") {
      const texte = confirmationDeQuitter(projets);
      const { response } = await dialog.showMessageBox({ type: "warning", message: texte.message, detail: texte.detail, buttons: [texte.quitter, texte.annuler], defaultId: 1, cancelId: 1 });
      if (response !== 0) return;
      await dire(await quitterLaStation({ plateforme, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, binaire: process.execPath, executer }));
      app.quit();
      return;
    }
    if (geste === "veille") {
      // Éteint, la station relâche l'assertion au regard suivant, dans la seconde ; rallumé, elle la reprend si un cook cuit.
      const ecrit = await veilleDuRuntime().then(
        ({ ecrireReglage, lireReglage }) => {
          const reglage = lireReglage(racine);
          return "garderEveille" in reglage ? ecrireReglage(racine, !reglage.garderEveille) : { refus: `nothing was changed: ${reglage.illisible}` };
        },
        (erreur: unknown) => ({ refus: `nothing was changed: the station's keep-awake setting cannot be reached — ${erreur instanceof Error ? erreur.message : String(erreur)}` }),
      );
      await dire("refus" in ecrit ? [ecrit.refus] : []);
      // La station relit le réglage chaque seconde : le menu se relit après elle, pour dire ce qu'elle tient alors.
      await attendre(1500);
      await relire();
      return;
    }
    await dire(await jouerLeGeste(geste, projets, lancer, DELAI_MS));
    await relire();
  } finally {
    enCours = false;
  }
}

function entreeDuMenu(entree: EntreeDuFond): MenuItemConstructorOptions {
  if (entree.genre === "separateur") return { type: "separator" };
  if (entree.genre === "texte") return { label: entree.libelle, enabled: false };
  if (entree.genre === "case") return { type: "checkbox", label: entree.libelle, checked: entree.coche, enabled: entree.actif, click: () => void jouer(entree.geste) };
  const { geste } = entree;
  return { label: entree.libelle, enabled: entree.actif, click: () => void jouer(geste) };
}

function poser(actif: boolean): void {
  if (!actif) {
    icone?.retirer();
    icone = undefined;
    dite = "";
    return;
  }
  const image = nativeImage.createFromPath(ICONE_DE_LA_BARRE);
  if (icone === undefined) {
    if (image.isEmpty()) {
      console.error(`brigade: the station's icon could not be read: ${ICONE_DE_LA_BARRE}`);
      return;
    }
    // Une seule icône dans la barre (#4079) : tenue par l'app, elle n'en pose pas — et la pose quand l'app part.
    try {
      icone = creerLIcone(image, plateforme);
    } catch (erreur) {
      if (!(erreur instanceof PlaceTenue)) console.error(`brigade: the station's icon could not be posed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      return;
    }
  }
  const station = etatDeLaStation(projets);
  const entrees = menuDuFond(projets, station, veille);
  const pose = JSON.stringify(entrees);
  if (pose === dite) return;
  dite = pose;
  const ligne = ligneDuFond(projets, station);
  icone.ligne(image, { infobulle: "brigade station", ligne, questions: questionsDuFond(projets) });
  icone.menu(entrees.map(entreeDuMenu));
}

async function relire(): Promise<void> {
  projets = await lireLesProjets(servisPar(racine), lancer);
  // Illisible, le menu n'en dit rien ; la raison se dit une fois.
  veille = await veilleDuRuntime().then(
    ({ lireVeille }) => {
      veilleIllisible = "";
      return lireVeille(racine, plateforme);
    },
    (erreur: unknown) => {
      const raison = erreur instanceof Error ? erreur.message : String(erreur);
      if (raison !== veilleIllisible) console.error(`brigade: the station's keep-awake state could not be read — ${raison}`);
      veilleIllisible = raison;
      return undefined;
    },
  );
  poser(lireConfiguration(cheminConfiguration()).barreDeMenus !== false);
}

void app.whenReady().then(async () => {
  app.dock?.hide();
  for (;;) {
    await relire().catch((erreur: unknown) => console.error(`brigade: the station's icon could not read the station — ${erreur instanceof Error ? erreur.message : String(erreur)}`));
    await attendre(INTERVALLE_MS);
  }
});
