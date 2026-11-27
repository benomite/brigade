// Ce que joue la valeur `Run` de Windows à l'ouverture de session (registration.ts) : le binaire de l'app avec
// `--station-fond` (tray-background/entry.ts). Sans fenêtre, il lance l'hôte de la station de fond sans console — `node` en
// ouvrirait une s'il était inscrit lui-même —, s'il ne tourne pas déjà, puis s'en va.
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import { pathConfiguration } from "../config.ts";
import { pathOf, locationsOf, readPathOfShell } from "../locations.ts";
import { shellOfWorkstation } from "../platform.ts";
import { roleOf } from "../workstation/role.ts";
import { holdingOfTheStation } from "../workstation/station.ts";
import { launchTheBackground } from "./background.ts";

// Ses propres données, à part de celles de l'app, qui peut être ouverte en même temps.
app.setPath("userData", join(app.getPath("userData"), "station-fond"));
const platform = process.platform;
const locations = locationsOf({ ressources: process.resourcesPath, src: join(import.meta.dirname, ".."), env: process.env });
const path = pathOf({ emplacements: locations, env: process.env, maison: homedir(), plateforme: platform, duShell: () => (platform === "win32" ? undefined : readPathOfShell(shellOfWorkstation(platform, process.env).commande, 10_000)) });
if (path !== undefined) process.env.PATH = path;
const root = process.env.BRIGADE_STATION_DIR || join(dirname(pathConfiguration()), "station");
const role = roleOf({ plateforme: platform, runtime: locations.runtime, env: process.env });

if (role.role !== "station") console.error(`brigade: no background station on this device — ${role.pourquoi}`);
else if (holdingOfTheStation(root) !== undefined) console.error("brigade: this computer's station already runs in the background");
else {
  try {
    launchTheBackground({ node: locations.node, embarque: role.principal, racine: root, env: process.env });
  } catch (error) {
    console.error(`brigade: the background station could not be launched — ${error instanceof Error ? error.message : String(error)}`);
  }
}
app.exit(0);
