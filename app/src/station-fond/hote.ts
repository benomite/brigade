// L'hôte de la station de fond (#3630) : le process qui tient la station de cet ordinateur sans l'app. Joué par `node`
// — lancé à l'ouverture de session (inscription.ts), ou par l'app qui n'en trouve aucun (fond.ts) — :
//
//   node hote.ts <répertoire de la station> <point d'entrée de la station livrée avec l'app>
//
// Il tient la station comme l'app la tenait (station-process/superviseur.ts, poste/station.ts) : relancée cinq secondes
// après sa mort, remplacée seule par une release que sa mise à jour a téléchargée, et une cuisine par projet
// (station-embarquee-cuisine-unique.ts). L'app qui quitte, redémarre ou se met à jour ne le touche pas : seul un arrêt
// demandé à lui (SIGTERM, SIGINT — « Quit the station » de l'icône de fond, tray-fond/systeme.ts) arrête la station.
//
// - **Un seul par ordinateur.** Il prend la marque `app.pid` de la station ; tenue par un autre process vivant, il le
//   dit et s'en va (code 0 : launchd ne le relance pas).
// - **Une station qui refuse de démarrer** (code 2) le fait partir aussi, après l'avoir écrit dans `fond.json` : l'app
//   rouverte, ou l'ouverture de session suivante, réessaie.
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gistLocal } from "../pannes/login.ts";
import { prendreLaStation } from "../poste/station.ts";
import { garderUneSeuleCuisine } from "../station-embarquee-cuisine-unique.ts";
import { environnementDeLaStation, tenirProcessDeStation, type ProcessDeStation } from "../station-process/superviseur.ts";
import { demanderAppairage, ecrireEtatDuFond, type EtatDuFond } from "./fond.ts";
import { ecrireLePidPourLIcone } from "./inscription.ts";

const [, , racine, embarque] = process.argv;
if (racine === undefined || racine === "" || embarque === undefined || embarque === "") {
  console.error("brigade: the background station is not started — it expects its directory and the station's entry point");
  process.exit(2);
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const dire = (ligne: string) => console.log(`${new Date().toISOString()} ${ligne}`);

let autre: number | undefined;
try {
  autre = prendreLaStation(racine, process.pid);
} catch (erreur) {
  dire(`brigade: the background station is not started — its directory ${racine} cannot be written: ${message(erreur)}`);
  process.exit(2);
}
if (autre !== undefined) {
  dire(`brigade: this computer's station already runs (pid ${autre}) — no second one is started`);
  process.exit(0);
}
ecrireLePidPourLIcone({ plateforme: process.platform, localAppData: process.env.LOCALAPPDATA, pid: process.pid, dire });

const runtime = dirname(dirname(dirname(embarque)));
const versions = join(racine, "station-update", "releases");
let derniere = "";
let ecrit = "";
let station: ProcessDeStation | undefined;
let fini = false;

const noter = () => {
  if (station === undefined) return;
  const etat: EtatDuFond = { pid: process.pid, etat: station.etat(), redemarrage: station.redemarrage(), motif: station.etat() === "refusee" ? derniere : null };
  const texte = JSON.stringify(etat);
  if (texte !== ecrit) {
    try {
      ecrireEtatDuFond(racine, etat);
      ecrit = texte;
    } catch (erreur) {
      dire(`brigade: the background station could not write its state (${racine}) — ${message(erreur)}`);
    }
  }
  if (etat.etat === "refusee" && !fini) {
    fini = true;
    dire("brigade: the background station stops: its station refused to start — the app, or the next login, tries again");
    process.exit(0);
  }
};

station = tenirProcessDeStation({
  node: process.execPath,
  embarque,
  versions,
  dossierDuRuntime: (version) => join(versions, version, "runtime"),
  racine,
  env: environnementDeLaStation(process.env),
  pid: process.pid,
  dire: (ligne) => {
    dire(ligne);
    if (ligne.trim() !== "") derniere = ligne.trim();
  },
  // L'app ouverte tape le code ; la station relit sa réponse à l'essai suivant.
  appairer: async (code) => demanderAppairage(racine, code),
  reessaiMs: 10_000,
  avantLancement: () =>
    garderUneSeuleCuisine({
      racine,
      lire: async () => {
        const { lireLesStationsDuChef } = (await import(pathToFileURL(join(runtime, "src", "appairage", "stations-du-chef.ts")).href)) as typeof import("../../../runtime/src/appairage/stations-du-chef.ts");
        return lireLesStationsDuChef({ gh: process.env.BRIGADE_GH_BIN || "gh", env: process.env });
      },
      soi: () => ({ gist: gistLocal(racine), nom: process.env.BRIGADE_STATION_NOM ?? "" }),
      dire,
    }),
  surChangement: noter,
  surIssue: noter,
});
noter();
// Ce que `fond.json` dit d'un redémarrage en cours change sans que la station s'arrête : relu chaque seconde.
setInterval(noter, 1_000);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    dire(`brigade: the background station stops (${signal}) — its station stops with it`);
    void station?.arreter().finally(() => {
      fini = true;
      try {
        ecrireEtatDuFond(racine, { pid: process.pid, etat: "arretee", redemarrage: null, motif: null });
      } catch {
        // L'état ne s'écrit plus : le pid mort le dit déjà.
      }
      process.exit(0);
    });
  });
}
