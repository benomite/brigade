// Point d'entrée de la station : un seul service brigade par machine, qui sert
// tous les projets de sa configuration (`<BRIGADE_STATION_DIR>/projets`, une
// ligne chacun). Ajouter ou retirer un projet n'écrit que cette ligne : la
// station la relit seule, sans redémarrer.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { canalGitHub } from "../appairage/canal.ts";
import { identiteDeLaStation, tenirPresence } from "../appairage/presence.ts";
import { configVeille, veillerConnexionMax, type VeilleConnexionMax } from "../connexion-max/veille.ts";
import { configReseau, passerParLaPorte } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { CONFIGURATION } from "./configuration.ts";
import { nommer, ouvrirStation, projetEnCours } from "./station.ts";

// Code de sortie d'un refus de démarrer : réessayer ne changerait rien.
const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade : refus de démarrer la station — ${motif}`);
  process.exit(REFUS);
}

const brut = process.env.BRIGADE_STATION_DIR || refuser("BRIGADE_STATION_DIR n'est pas défini");
const racine = resolve(brut);

let fichiersDeLaConnexion: ReturnType<typeof configVeille>;
try {
  fichiersDeLaConnexion = configVeille(process.env, racine);
  // La porte de la station : ce que son process joint lui-même — GitHub,
  // Anthropic — passe par elle. Chaque projet peut avoir la sienne pour ce
  // qu'il lance (`BRIGADE_PROXY_PORT` sur sa ligne).
  const porte = configReseau(process.env);
  if (porte !== null) passerParLaPorte(porte);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
mkdirSync(racine, { recursive: true });

// Un seul journal de service pour tous les projets : ce que le code d'un
// projet y écrit de lui-même porte son nom, comme ce que la station dit pour lui.
for (const sortie of ["log", "error"] as const) {
  const ecrire = console[sortie].bind(console);
  console[sortie] = (premier?: unknown, ...suite: unknown[]) => {
    const projet = projetEnCours();
    ecrire(projet !== null && typeof premier === "string" && !premier.startsWith("brigade [") ? nommer(projet, premier) : premier, ...suite);
  };
}
const dire = (ligne: string) => console.log(ligne);
// La connexion Max de la machine : une seule veille, pour tous les projets.
const connexion: VeilleConnexionMax = veillerConnexionMax({ ...fichiersDeLaConnexion, dire });
const station = ouvrirStation({ racine, env: process.env, dire, connexion });
// Sa présence sur GitHub, seul canal entre la station et l'app du chef : son
// état, chaque minute, et le code qui l'appaire (appairage/presence.ts).
const presence = tenirPresence({
  racine,
  canal: canalGitHub({ gh: process.env.BRIGADE_GH_BIN || "gh" }),
  identite: identiteDeLaStation(process.env),
  projets: () => station.projets(),
  dire,
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    station.arreter(signal);
    connexion.arreter();
    console.log(`brigade : station arrêtée (${signal})`);
    // L'heure de l'arrêt, écrite sur GitHub : l'app la dit hors ligne sans attendre.
    void presence.arreter();
  });
}
// Relire tout de suite, sans attendre la relecture suivante.
process.on("SIGHUP", () => station.relire());

const servis = station.projets();
console.log(
  `brigade : station démarrée — pid ${process.pid}, configuration ${join(racine, CONFIGURATION)} ; ${servis.length === 0 ? "aucun projet servi" : `${servis.length} projet${servis.length > 1 ? "s" : ""} servi${servis.length > 1 ? "s" : ""} : ${servis.join(", ")}`}`,
);
