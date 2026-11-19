// Le point d'entrée du binaire de l'app (`main` de app/package.json) : avec `--tray-fond`, il est l'icône de la station
// de fond (processus.ts, #3631) ; avec `--station-fond`, il lance la station de fond (station-fond/demarrage.ts, #3630) ;
// sans, il est l'app (main.ts).
//
// L'app installée ne garde qu'un process : relancée — depuis l'icône de fond, le Dock, le menu Démarrer —, elle ramène
// sa fenêtre au lieu d'en ouvrir une deuxième. Et quand la station de fond est installée sur cet ordinateur, elle
// inscrit l'icône de fond à l'ouverture de session et la lance (systeme.ts) : c'est elle qui montre l'état de la
// cuisine, l'app fermée comme ouverte — l'app ne pose plus la sienne (main.ts, `iconeAuFond`).
//
// Les `await` de ce module sont ceux des imports : Electron n'annonce « prêt » qu'une fois l'entrée chargée, comme avant.
import { spawn } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { estInstallee } from "../emplacements.ts";
import { ARGUMENT_FOND } from "../station-fond/inscription.ts";
import { prendreLaPlace } from "./instance.ts";
import { ARGUMENT, executer, inscrireLeFond, stationDeFondInstallee } from "./systeme.ts";

if (process.argv.includes(ARGUMENT_FOND)) {
  // La station de fond, lancée à l'ouverture de session de Windows (station-fond/inscription.ts).
  await import("../station-fond/demarrage.ts");
} else if (process.argv.includes(ARGUMENT)) {
  await import("./processus.ts");
} else {
  const installee = estInstallee({ ressources: process.resourcesPath, src: join(import.meta.dirname, "..") });
  // Une autre app tourne déjà : le verrou d'Electron lui passe la main, et elle ramène sa fenêtre. Sans autre app, celle-ci
  // montre la sienne, que le verrou d'Electron lui soit rendu ou non (#3864) — l'icône de fond ne le tient plus.
  // Dans l'app installée seulement : les essais depuis le dépôt ne gardent pas de place.
  let passeLaMain = false;
  if (installee) {
    const autreApp = prendreLaPlace(join(app.getPath("userData"), "app.pid"));
    passeLaMain = !app.requestSingleInstanceLock() && autreApp !== undefined;
  }
  if (passeLaMain) {
    app.exit(0);
  } else {
    app.on("second-instance", () => {
      const fenetre = BrowserWindow.getAllWindows()[0];
      if (fenetre === undefined) return;
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.show();
      fenetre.focus();
    });
    await import("../main.ts");
    const systeme = { plateforme: process.platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA };
    if (installee && stationDeFondInstallee(systeme)) {
      void app.whenReady().then(async () => {
        const refus = await inscrireLeFond({ ...systeme, uid: userInfo().uid, binaire: process.execPath, executer });
        if (refus !== undefined) console.error(`brigade: ${refus}`);
        // Sous Windows, la valeur `Run` ne joue qu'à l'ouverture de session : l'icône est lancée ici — une deuxième s'efface.
        if (refus !== undefined || process.platform !== "win32") return;
        const fond = spawn(process.execPath, [ARGUMENT], { detached: true, stdio: "ignore" });
        fond.once("error", (erreur) => console.error(`brigade: the notification area icon could not be started — ${erreur.message}`));
        fond.unref();
      });
    }
  }
}
