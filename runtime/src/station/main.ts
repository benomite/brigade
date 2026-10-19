// Point d'entrée de la station : un seul service brigade par machine, qui sert
// tous les projets de sa configuration (`<BRIGADE_STATION_DIR>/projets`, une
// ligne chacun). Ajouter ou retirer un projet n'écrit que cette ligne : la
// station la relit seule, sans redémarrer.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { canalGitHub } from "../appairage/canal.ts";
import { etatsPublies } from "../appairage/etats.ts";
import { identiteDeLaStation, tenirPresence } from "../appairage/presence.ts";
import { configVeille, watchMaxConnection, type MaxConnectionWatch } from "../connection-max/veille.ts";
import { masquerLaConsole } from "../jeton-claude.ts";
import { installerLimite, journaliserLesAppels, limiteDeLaStation } from "../limite-github.ts";
import { announceInService } from "../mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../mise-a-jour/etat.ts";
import { tenirProjetsDeLApp } from "../projets/tenir.ts";
import { configReseau, goThroughTheDoor } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { CONFIGURATION } from "./configuration.ts";
import { waitForStationDoor, doorsConfig, readDoors, DOORS_VARIABLE } from "./doors.ts";
import { nommer, ouvrirStation, projetEnCours } from "./station.ts";

// Ce que la station dit à journald est masqué, avant même son premier mot.
masquerLaConsole();

// Code de sortie d'un refus de démarrer : réessayer ne changerait rien.
const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : refus de démarrer la station — ${motif}`);
  process.exit(REFUS);
}

const brut = process.env.BRIGADE_STATION_DIR || refuser("BRIGADE_STATION_DIR n'est pas défini");
const racine = resolve(brut);

let connectionFiles: ReturnType<typeof configVeille>;
// Les portes que tient `brigade-station-porte` : celle de la station, et
// celle de chaque projet.
let doors: string | null;
try {
  connectionFiles = configVeille(process.env, racine);
  doors = doorsConfig(process.env);
  // Sans elles, la porte de la station, si son environnement en nomme une : ce
  // que son process joint lui-même — GitHub, Anthropic — passe par elle.
  // Chaque projet peut avoir la sienne pour ce qu'il lance
  // (`BRIGADE_PROXY_PORT` sur sa ligne).
  const door = configReseau(process.env);
  if (door !== null && doors !== null) refuser(`BRIGADE_PROXY_PORT et ${DOORS_VARIABLE} sont définis ensemble : sous les portes de la station, la sienne est celle qu'elles ouvrent`);
  if (door !== null) goThroughTheDoor(door);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
mkdirSync(racine, { recursive: true });

const dire = (ligne: string) => console.log(ligne);
// Sous les portes de la station, son unité ne joint que la boucle locale :
// rien ne part avant que sa porte ne soit ouverte. Un port qui change — la
// porte relancée n'a pas retrouvé le sien — est repris.
if (doors !== null) {
  const doorsFile = doors;
  let stationDoor = await waitForStationDoor(doorsFile, { dire });
  goThroughTheDoor(stationDoor);
  setInterval(() => {
    const { station } = readDoors(doorsFile);
    if (station === null || station === stationDoor) return;
    dire(`brigade : la porte de la station a changé de port (${stationDoor} → ${station}) : la station sort par la nouvelle`);
    stationDoor = station;
    goThroughTheDoor(station);
  }, 2000).unref();
}

// Le budget d'appels à GitHub, partagé par la station et tous ses projets :
// un compteur dans son répertoire (limite-github.ts), posé avant qu'aucun
// projet ne s'ouvre. Une fois par heure, son compte va au journal de service.
const limite = installerLimite(limiteDeLaStation(racine));
journaliserLesAppels(limite, { dire });

// Un seul journal de service pour tous les projets : ce que le code d'un
// projet y écrit de lui-même porte son nom, comme ce que la station dit pour lui.
for (const sortie of ["log", "error"] as const) {
  const ecrire = console[sortie].bind(console);
  console[sortie] = (premier?: unknown, ...suite: unknown[]) => {
    const projet = projetEnCours();
    ecrire(projet !== null && typeof premier === "string" && !premier.startsWith("brigade [") ? nommer(projet, premier) : premier, ...suite);
  };
}
// La connexion Max de la machine : une seule veille, pour tous les projets.
const connection: MaxConnectionWatch = watchMaxConnection({ ...connectionFiles, jeton: Boolean(process.env.BRIGADE_CLAUDE_TOKEN_FILE), dire });
const station = ouvrirStation({ racine, env: process.env, dire, connexion: connection, doors });
// Sa présence sur GitHub, seul canal entre la station et l'app du chef : son
// état, chaque minute, et le code qui l'appaire (appairage/presence.ts). Ses
// pannes y vont aussi : sa mise à jour, que son unité lui fait lire
// (`BRIGADE_MISE_A_JOUR_DIR`), et sa connexion Max (appairage/etats.ts).
const canal = canalGitHub({ gh: process.env.BRIGADE_GH_BIN || "gh" });
const identite = identiteDeLaStation(process.env);
const dossierMiseAJour = process.env.BRIGADE_MISE_A_JOUR_DIR || null;
const presence = tenirPresence({
  racine,
  canal,
  identite,
  projets: () => station.projets(),
  etats: () => etatsPublies(dossierMiseAJour === null ? null : lireEtatMiseAJour(dossierMiseAJour), connection.connexion()),
  dire,
});
// Les projets que le chef lui ajoute depuis l'app, par le même gist : la
// station les prépare et leur écrit leur ligne (projets/tenir.ts).
const projetsDeLApp = tenirProjetsDeLApp({
  racine,
  canal,
  station: identite.nom,
  env: process.env,
  servis: station,
  apresEcriture: () => {
    station.relire();
    void presence.publier();
  },
  dire,
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    projetsDeLApp.arreter();
    station.arreter(signal);
    connection.arreter();
    console.log(`brigade : station arrêtée (${signal})`);
    // L'heure de l'arrêt, écrite sur GitHub : l'app la dit hors ligne sans attendre.
    void presence.arreter();
  });
}
// Relire tout de suite, sans attendre la relecture suivante — la configuration,
// et ce que l'app demande.
process.on("SIGHUP", () => {
  station.relire();
  void projetsDeLApp.relire();
});

// Ce que la station dit d'elle-même — sa version, son pid, ce qu'elle sert :
// c'est ce qu'une mise à jour attend pour garder sa version.
announceInService(racine, () => ({ servis: station.projets(), refuses: station.refuses() }), { dire });

const servedOnes = station.projets();
console.log(
  `brigade : station démarrée — pid ${process.pid}, configuration ${join(racine, CONFIGURATION)} ; ${servedOnes.length === 0 ? "aucun projet servi" : `${servedOnes.length} projet${servedOnes.length > 1 ? "s" : ""} servi${servedOnes.length > 1 ? "s" : ""} : ${servedOnes.join(", ")}`}`,
);
