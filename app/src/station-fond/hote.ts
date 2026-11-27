// L'hôte de la station de fond (#3630) : le process qui tient la station de cet ordinateur sans l'app. Joué par `node`
// — lancé à l'ouverture de session (inscription.ts), ou par l'app qui n'en trouve aucun (fond.ts) — :
//
//   node hote.ts <répertoire de la station> <point d'entrée de la station livrée avec l'app>
//
// Il tient la station comme l'app la tenait (station-process/superviseur.ts, poste/station.ts) : relancée cinq secondes
// après sa mort, remplacée seule par une release que sa mise à jour a téléchargée, et les projets qu'une version d'avant avait
// mis de côté remis (station-projets-remis.ts). L'app qui quitte, redémarre ou se met à jour ne le touche pas : seul un arrêt
// demandé à lui (SIGTERM, SIGINT — « Quit the station » de l'icône de fond, tray-fond/systeme.ts) arrête la station.
//
// - **Un seul par ordinateur.** Il prend la marque `app.pid` de la station ; tenue par un autre process vivant, il le
//   dit et s'en va (code 0 : launchd ne le relance pas). Il la tient toute sa vie — réécrite si elle manque, sa date
//   rafraîchie deux fois par seconde (poste/station.ts ne croit pas une marque d'avant le démarrage du système) — et la rend à
//   sa sortie, quelle qu'elle soit : un pid mort que le système redonnerait n'empêche pas la station suivante.
// - **Une station qui refuse de démarrer** (code 2) ne le fait pas partir (#3701) : l'hôte l'écrit dans `fond.json` et la
//   retente d'elle-même (poste/station.ts), cinq secondes d'abord — une mise à jour à chaud qui trouve encore l'ancienne
//   station sur le répertoire démarre dès qu'elle est partie, sans geste du chef.
import { existsSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { prendreLaStation, rendreLaStation, TENUE_PAR } from "../poste/station.ts";
import { remettreLesProjets } from "../station-projets-remis.ts";
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
// Toute sortie la rend : « Quit the station », l'arrêt de launchd ou de la session, une station refusée.
process.on("exit", () => rendreLaStation(racine, process.pid));
// La station relancée sur une autre version la rend en passant : l'hôte, qui vit, la reprend.
const garderLaMarque = () => {
  try {
    if (prendreLaStation(racine, process.pid) === undefined) {
      const maintenant = new Date();
      utimesSync(join(racine, TENUE_PAR), maintenant, maintenant);
    }
  } catch {
    // Reprise à la seconde suivante.
  }
};
setInterval(garderLaMarque, 500);
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
  // Le délai entre deux essais d'une station morte ou refusée : cinq secondes, sauf pour les tests qui ne l'attendent pas.
  ...(Number(process.env.BRIGADE_HOTE_RELANCE_MS) > 0 ? { relanceMs: Number(process.env.BRIGADE_HOTE_RELANCE_MS) } : {}),
  avantLancement: async () => {
    // Le `node` de l'app qu'une mise à jour a retiré ou renommé (#4400) : chaque lancement échouerait en ENOENT. L'hôte
    // s'en va avec un code d'échec, launchd le relance depuis le plist que l'app a réécrit.
    if (!existsSync(process.execPath)) {
      dire(`brigade: the background station stops — its node binary ${process.execPath} no longer exists (the app was updated); launchd restarts it from its current definition`);
      process.exit(1);
    }
    await remettreLesProjets({ racine, dire });
  },
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
