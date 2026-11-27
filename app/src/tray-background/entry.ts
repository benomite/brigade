// Le point d'entrée du binaire de l'app (`main` de app/package.json) : avec `--tray-fond`, il est l'icône de la station
// de fond (process.ts, #3631) ; avec `--station-fond`, il lance la station de fond (station-background/startup.ts, #3630) ;
// sans, il est l'app (main.ts).
//
// L'app installée ne garde qu'un process : relancée — depuis l'icône de fond, le Dock, le menu Démarrer —, elle ramène
// sa fenêtre au lieu d'en ouvrir une deuxième. Et quand la station de fond est installée sur cet ordinateur, elle
// inscrit l'icône de fond à l'ouverture de session et la lance (system.ts) : c'est elle qui montre l'état de la
// cuisine, l'app fermée comme ouverte — l'app ne pose plus la sienne (main.ts, `iconeAuFond`).
//
// Les `await` de ce module sont ceux des imports : Electron n'annonce « prêt » qu'une fois l'entrée chargée, comme avant.
import { spawn } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { isInstalled } from "../locations.ts";
import { ARGUMENT_BACKGROUND } from "../station-background/registration.ts";
import { readTheCommand, sameProcess, takeThePlace } from "./instance.ts";
import { ARGUMENT, run, backgroundStale, registerTheBackground, stationOfBackgroundInstalled } from "./system.ts";

if (process.argv.includes(ARGUMENT_BACKGROUND)) {
  // La station de fond, lancée à l'ouverture de session de Windows (station-background/registration.ts).
  await import("../station-background/startup.ts");
} else if (process.argv.includes(ARGUMENT)) {
  await import("./process.ts");
} else {
  const installedOne = isInstalled({ ressources: process.resourcesPath, src: join(import.meta.dirname, "..") });
  // Une autre app tourne déjà : le verrou d'Electron lui passe la main, et elle ramène sa fenêtre. Sans autre app, celle-ci
  // montre la sienne, que le verrou d'Electron lui soit rendu ou non (#3864) — l'icône de fond ne le tient plus. Le pid
  // laissé par l'app quittée, repris par un autre process — l'icône, l'hôte de la station —, n'est pas une app (#4071).
  // Quand `ps` ne lit pas la commande, `memeProcess` dit non et la place est prise : au pire deux fenêtres, jamais aucune.
  // Dans l'app installée seulement : les essais depuis le dépôt ne gardent pas de place.
  const oneOtherAppRuns = (): boolean => {
    const otherApp = takeThePlace(join(app.getPath("userData"), "app.pid"), process.pid, (pid) => sameProcess(pid, process.pid, readTheCommand));
    return !app.requestSingleInstanceLock() && otherApp !== undefined;
  };
  const passTheMain = installedOne && oneOtherAppRuns();
  // Ouverte d'un lieu en lecture seule (l'image disque, #4269) : une phrase, puis on quitte sans erreur.
  const readOnly = !passTheMain && (await import("../pty.ts")).aideInutilisable;
  if (readOnly) {
    dialog.showErrorBox("Brigade", "Drag Brigade into the Applications folder first, then open it from there.");
    app.exit(0);
  } else if (passTheMain) {
    app.exit(0);
  } else {
    app.on("second-instance", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });
    await import("../main.ts");
    const system = { plateforme: process.platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA };
    if (installedOne && stationOfBackgroundInstalled(system)) {
      void app.whenReady().then(async () => {
        const stale = backgroundStale(app.getPath("userData"), app.getVersion());
        const refusal = await registerTheBackground({ ...system, uid: userInfo().uid, binaire: process.execPath, executer: run, fondPerime: stale });
        if (refusal !== undefined) console.error(`brigade: ${refusal}`);
        // Sous Windows, la valeur `Run` ne joue qu'à l'ouverture de session : l'icône est lancée ici — une deuxième s'efface.
        if (refusal !== undefined || process.platform !== "win32") return;
        const background = spawn(process.execPath, [ARGUMENT], { detached: true, stdio: "ignore" });
        background.once("error", (error) => console.error(`brigade: the notification area icon could not be started — ${error.message}`));
        background.unref();
      });
    }
  }
}
