// Point d'entrée des portes de la station : `brigade-station-porte.service`.
// Un process, hors du filtre réseau de l'unité de la station — c'est lui, la
// sortie —, qui tient la porte de la station et celle de chaque projet de sa
// configuration (`doors.ts`). Il ne lance rien : ni `claude`, ni `git`, ni le
// code d'un projet.
import { resolve } from "node:path";
import { ConfigInvalide } from "../runtime.ts";
import { doorsConfig, holdDoors, DOORS_VARIABLE } from "./doors.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : les portes de la station refusent de démarrer — ${motif}`);
  process.exit(REFUS);
}

const racine = resolve(process.env.BRIGADE_STATION_DIR || refuser("BRIGADE_STATION_DIR n'est pas défini"));
let fichier: string | null;
try {
  fichier = doorsConfig(process.env);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
if (fichier === null) refuser(`${DOORS_VARIABLE} n'est pas défini`);

const tenues = await holdDoors({ racine, fichier, dire: (ligne) => console.log(ligne) });
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void tenues.arreter().then(() => {
      console.log(`brigade : portes de la station fermées (${signal})`);
      process.exit(0);
    });
  });
}
// Relire la configuration tout de suite, sans attendre la relecture suivante.
process.on("SIGHUP", () => void tenues.relire());

// Les signaux sont tenus avant de se dire ouvertes : qui lit cette ligne peut
// en envoyer un.
const { projets } = tenues.ports();
const ouvertes = Object.keys(projets).length;
console.log(`brigade : portes de la station ouvertes — pid ${process.pid}, ports écrits dans ${fichier} ; ${ouvertes === 0 ? "aucun projet" : `${ouvertes} projet${ouvertes > 1 ? "s" : ""} : ${Object.keys(projets).join(", ")}`}`);
