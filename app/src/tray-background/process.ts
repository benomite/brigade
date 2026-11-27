// Le process de l'icône de fond (#3631), lancé par entry.ts quand le binaire de l'app reçoit `--tray-fond` — à
// l'ouverture de session par son agent launchd ou sa valeur `Run` (system.ts), et par l'app à chaque ouverture. Il n'a
// pas de fenêtre : une icône dans la barre des menus du Mac ou la zone de notification de Windows, qui reste là l'app
// fermée. Toutes les quinze secondes, il relit les projets que la station de cet ordinateur sert, et redit la ligne et le
// menu quand ils changent (tray-background.ts) : il ne lance aucune commande du runtime. Le chef la retire dans Settings, comme celle de l'app
// (`barreDeMenus`, config.ts).
import { spawn } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { app, dialog, nativeImage, type MenuItemConstructorOptions } from "electron";
import { pathConfiguration, readConfiguration } from "../config.ts";
import { RELEASES_URL } from "../update/android.ts";
import { pathOf, locationsOf, readPathOfShell } from "../locations.ts";
import { shellOfWorkstation } from "../platform.ts";
import { servedBy } from "../workstation/kitchen-here.ts";
import { takeThePlace } from "./instance.ts";
import { createIfFree, ICON_OF_THE_BAR, type IconUnique } from "../tray/icon.ts";
import { FOLDER_OF_BACKGROUND, writeTheVersionOfBackground, run, quitTheStation } from "./system.ts";
import { clickOnTheApp, confirmationOfQuit, lineOfTheStationHere, menuOfBackground, type EntryOfBackground, type Action } from "./tray-background.ts";

const INTERVAL_MS = 15_000;

// Ses propres données, à part de celles de l'app : les deux tournent en même temps. Un seul process d'icône par compte.
app.setPath("userData", join(app.getPath("userData"), FOLDER_OF_BACKGROUND));
// Pas le verrou d'Electron, réservé à l'app (entry.ts, #3864) : un fichier de pid dans ses données.
if (takeThePlace(join(app.getPath("userData"), "tray.pid")) !== undefined) app.exit(0);
else {
  // La version de l'icône qui tient la place, que l'app relit pour relancer une icône restée sur le code d'avant une mise à
  // jour (#4071). Non écrite, l'app la relance à chacune de ses ouvertures, sans plus.
  try {
    writeTheVersionOfBackground(app.getPath("userData"), app.getVersion());
  } catch (error) {
    console.error(`brigade: the icon could not write its version — ${error instanceof Error ? error.message : String(error)}`);
  }
}
// Ni fenêtre, ni icône dans le Dock.
app.on("window-all-closed", () => {});
// Sur un Mac, l'icône est un process du paquet de l'app : un clic sur l'app (Dock, Finder, Launchpad) pendant qu'elle tourne
// lui est adressé, et ne lançait rien — l'app quittée ne se rouvrait plus (#4071). Il ouvre l'app, sauf celui que le
// lancement de l'icône émet lui-même (`clicSurLApp`).
const startup = Date.now();
app.on("activate", () => {
  if (clickOnTheApp(startup, Date.now())) openTheApp();
});

const platform = process.platform;
const src = join(import.meta.dirname, "..");
const locations = locationsOf({ ressources: process.resourcesPath, src, env: process.env });
// Lancée par launchd, elle n'a que le PATH du système : celui du shell de connexion du chef, comme l'app (locations.ts).
const path = pathOf({ emplacements: locations, env: process.env, maison: homedir(), plateforme: platform, duShell: () => (platform === "win32" ? undefined : readPathOfShell(shellOfWorkstation(platform, process.env).commande, 10_000)) });
if (path !== undefined) process.env.PATH = path;
const root = process.env.BRIGADE_STATION_DIR || join(dirname(pathConfiguration()), "station");

let icon: IconUnique | undefined;
let projects: string[] = [];
let saidOne = "";
let inProgress = false;

// L'app : lancée, ou ramenée devant si elle tourne — elle ne garde qu'un process, et ramène sa fenêtre (entry.ts).
function openTheApp(): void {
  const args = locations.facon === "installee" ? [] : [app.getAppPath()];
  const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: false });
  // Une app qui ne s'ouvre pas est dite en une phrase, avec quoi faire (#4071) ; la raison du système va au journal.
  child.once("error", (error) => {
    console.error(`brigade: the app could not be opened — ${error.message}`);
    void dialog.showMessageBox({ type: "error", message: "brigade could not be opened", detail: `Brigade could not open its window, so try again from this icon, and if it still does not open, download it again from ${RELEASES_URL} and reinstall it.` });
  });
  child.unref();
}

async function tell(failures: readonly string[]): Promise<void> {
  if (failures.length > 0) await dialog.showMessageBox({ type: "warning", message: "The station did not take the whole action", detail: failures.join("\n\n") });
}

async function play(action: Action): Promise<void> {
  if (action === "ouvrir") return openTheApp();
  if (inProgress) return;
  inProgress = true;
  try {
    if (action === "quitter") {
      const text = confirmationOfQuit();
      const { response } = await dialog.showMessageBox({ type: "warning", message: text.message, detail: text.detail, buttons: [text.quitter, text.annuler], defaultId: 1, cancelId: 1 });
      if (response !== 0) return;
      await tell(await quitTheStation({ plateforme: platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, binaire: process.execPath, executer: run }));
      app.quit();
      return;
    }
  } finally {
    inProgress = false;
  }
}

function entryOfMenu(entry: EntryOfBackground): MenuItemConstructorOptions {
  if (entry.genre === "separateur") return { type: "separator" };
  if (entry.genre === "texte") return { label: entry.libelle, enabled: false };
  const { geste: action } = entry;
  return { label: entry.libelle, enabled: entry.actif, click: () => void play(action) };
}

function set(active: boolean): void {
  if (!active) {
    icon?.retirer();
    icon = undefined;
    saidOne = "";
    return;
  }
  const image = nativeImage.createFromPath(ICON_OF_THE_BAR);
  if (icon === undefined) {
    if (image.isEmpty()) {
      console.error(`brigade: the station's icon could not be read: ${ICON_OF_THE_BAR}`);
      return;
    }
    // Une seule icône dans la barre (#4079) : tenue par l'app, elle n'en pose pas — et la pose quand l'app part.
    try {
      icon = createIfFree(image, platform);
    } catch (error) {
      console.error(`brigade: the station's icon could not be posed — ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
  const entries = menuOfBackground(projects);
  const pose = JSON.stringify(entries);
  if (pose === saidOne) return;
  // Une place tenue par l'app : rien n'est dit, et la lecture suivante essaie encore.
  saidOne = icon ? pose : "";
  icon?.ligne(image, { infobulle: "brigade station", ligne: lineOfTheStationHere(projects), questions: 0 });
  icon?.menu(entries.map(entryOfMenu));
}

async function reread(): Promise<void> {
  projects = servedBy(root);
  set(readConfiguration(pathConfiguration()).barreDeMenus !== false);
}

void app.whenReady().then(async () => {
  app.dock?.hide();
  for (;;) {
    await reread().catch((error: unknown) => console.error(`brigade: the station's icon could not read the station — ${error instanceof Error ? error.message : String(error)}`));
    await wait(INTERVAL_MS);
  }
});
