// L'hôte de la station de fond (#3630) : le process qui tient la station de cet ordinateur sans l'app. Joué par `node`
// — lancé à l'ouverture de session (registration.ts), ou par l'app qui n'en trouve aucun (background.ts) — :
//
//   node host.ts <répertoire de la station> <point d'entrée de la station livrée avec l'app>
//
// Il tient la station comme l'app la tenait (station-process/supervisor.ts, workstation/station.ts) : relancée cinq secondes
// après sa mort, remplacée seule par une release que sa mise à jour a téléchargée, et les projets qu'une version d'avant avait
// mis de côté remis (station-projects-put-back.ts). L'app qui quitte, redémarre ou se met à jour ne le touche pas : seul un arrêt
// demandé à lui (SIGTERM, SIGINT — « Quit the station » de l'icône de fond, tray-background/system.ts) arrête la station.
//
// - **Un seul par ordinateur.** Il prend la marque `app.pid` de la station ; tenue par un autre process vivant, il le
//   dit et s'en va (code 0 : launchd ne le relance pas). Il la tient toute sa vie — réécrite si elle manque, sa date
//   rafraîchie deux fois par seconde (workstation/station.ts ne croit pas une marque d'avant le démarrage du système) — et la rend à
//   sa sortie, quelle qu'elle soit : un pid mort que le système redonnerait n'empêche pas la station suivante.
// - **Une station qui refuse de démarrer** (code 2) ne le fait pas partir (#3701) : l'hôte l'écrit dans `fond.json` et la
//   retente d'elle-même (workstation/station.ts), cinq secondes d'abord — une mise à jour à chaud qui trouve encore l'ancienne
//   station sur le répertoire démarre dès qu'elle est partie, sans geste du chef.
import { existsSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { takeTheStation, renderTheStation, HELD_PAR } from "../workstation/station.ts";
import { putBackTheProjects } from "../station-projects-put-back.ts";
import { environmentOfTheStation, holdProcessOfStation, type ProcessOfStation } from "../station-process/supervisor.ts";
import { askPairing, writeStateOfBackground, type StateOfBackground } from "./background.ts";
import { writeThePidForTheIcon } from "./registration.ts";

const [, , root, embedded] = process.argv;
if (root === undefined || root === "" || embedded === undefined || embedded === "") {
  console.error("brigade: the background station is not started — it expects its directory and the station's entry point");
  process.exit(2);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const tell = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

let other: number | undefined;
try {
  other = takeTheStation(root, process.pid);
} catch (error) {
  tell(`brigade: the background station is not started — its directory ${root} cannot be written: ${message(error)}`);
  process.exit(2);
}
if (other !== undefined) {
  tell(`brigade: this computer's station already runs (pid ${other}) — no second one is started`);
  process.exit(0);
}
// Toute sortie la rend : « Quit the station », l'arrêt de launchd ou de la session, une station refusée.
process.on("exit", () => renderTheStation(root, process.pid));
// La station relancée sur une autre version la rend en passant : l'hôte, qui vit, la reprend.
const keepTheBrand = () => {
  try {
    if (takeTheStation(root, process.pid) === undefined) {
      const now = new Date();
      utimesSync(join(root, HELD_PAR), now, now);
    }
  } catch {
    // Reprise à la seconde suivante.
  }
};
setInterval(keepTheBrand, 500);
writeThePidForTheIcon({ plateforme: process.platform, localAppData: process.env.LOCALAPPDATA, pid: process.pid, dire: tell });

const runtime = dirname(dirname(dirname(embedded)));
const versions = join(root, "station-update", "releases");
let last = "";
let written = "";
let station: ProcessOfStation | undefined;
let finished = false;

const note = () => {
  if (station === undefined) return;
  const state: StateOfBackground = { pid: process.pid, etat: station.etat(), redemarrage: station.redemarrage(), motif: station.etat() === "refusee" ? last : null };
  const text = JSON.stringify(state);
  if (text !== written) {
    try {
      writeStateOfBackground(root, state);
      written = text;
    } catch (error) {
      tell(`brigade: the background station could not write its state (${root}) — ${message(error)}`);
    }
  }
};

station = holdProcessOfStation({
  node: process.execPath,
  embarque: embedded,
  versions,
  dossierDuRuntime: (version) => join(versions, version, "runtime"),
  racine: root,
  env: environmentOfTheStation(process.env),
  pid: process.pid,
  dire: (line) => {
    tell(line);
    if (line.trim() !== "") last = line.trim();
  },
  // L'app ouverte tape le code ; la station relit sa réponse à l'essai suivant.
  appairer: async (code) => askPairing(root, code),
  reessaiMs: 10_000,
  // Le délai entre deux essais d'une station morte ou refusée : cinq secondes, sauf pour les tests qui ne l'attendent pas.
  ...(Number(process.env.BRIGADE_HOTE_RELANCE_MS) > 0 ? { relanceMs: Number(process.env.BRIGADE_HOTE_RELANCE_MS) } : {}),
  avantLancement: async () => {
    // Le `node` de l'app qu'une mise à jour a retiré ou renommé (#4400) : chaque lancement échouerait en ENOENT. L'hôte
    // s'en va avec un code d'échec, launchd le relance depuis le plist que l'app a réécrit.
    if (!existsSync(process.execPath)) {
      tell(`brigade: the background station stops — its node binary ${process.execPath} no longer exists (the app was updated); launchd restarts it from its current definition`);
      process.exit(1);
    }
    await putBackTheProjects({ racine: root, dire: tell });
  },
  surChangement: note,
  surIssue: note,
});
note();
// Ce que `fond.json` dit d'un redémarrage en cours change sans que la station s'arrête : relu chaque seconde.
setInterval(note, 1_000);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    tell(`brigade: the background station stops (${signal}) — its station stops with it`);
    void station?.arreter().finally(() => {
      finished = true;
      try {
        writeStateOfBackground(root, { pid: process.pid, etat: "arretee", redemarrage: null, motif: null });
      } catch {
        // L'état ne s'écrit plus : le pid mort le dit déjà.
      }
      process.exit(0);
    });
  });
}
