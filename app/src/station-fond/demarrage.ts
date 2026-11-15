// Ce que joue la valeur `Run` de Windows à l'ouverture de session (inscription.ts) : le binaire de l'app avec
// `--station-fond` (tray-fond/entree.ts). Sans fenêtre, il lance l'hôte de la station de fond sans console — `node` en
// ouvrirait une s'il était inscrit lui-même —, s'il ne tourne pas déjà, puis s'en va.
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import { cheminConfiguration } from "../config.ts";
import { cheminDe, emplacementsDe, lireCheminDuShell } from "../emplacements.ts";
import { shellDuPoste } from "../plateforme.ts";
import { roleDe } from "../poste/role.ts";
import { tenantDeLaStation } from "../poste/station.ts";
import { lancerLeFond } from "./fond.ts";

// Ses propres données, à part de celles de l'app, qui peut être ouverte en même temps.
app.setPath("userData", join(app.getPath("userData"), "station-fond"));
const plateforme = process.platform;
const emplacements = emplacementsDe({ ressources: process.resourcesPath, src: join(import.meta.dirname, ".."), env: process.env });
const chemin = cheminDe({ emplacements, env: process.env, maison: homedir(), plateforme, duShell: () => (plateforme === "win32" ? undefined : lireCheminDuShell(shellDuPoste(plateforme, process.env).commande, 10_000)) });
if (chemin !== undefined) process.env.PATH = chemin;
const racine = process.env.BRIGADE_STATION_DIR || join(dirname(cheminConfiguration()), "station");
const role = roleDe({ plateforme, runtime: emplacements.runtime, env: process.env });

if (role.role !== "station") console.error(`brigade: no background station on this device — ${role.pourquoi}`);
else if (tenantDeLaStation(racine) !== undefined) console.error("brigade: this computer's station already runs in the background");
else {
  try {
    lancerLeFond({ node: emplacements.node, embarque: role.principal, racine, env: process.env });
  } catch (erreur) {
    console.error(`brigade: the background station could not be launched — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}
app.exit(0);
