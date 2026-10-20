// Point d'entrée de la station : un seul service brigade par machine, qui sert
// tous les projets de sa configuration (`<BRIGADE_STATION_DIR>/projets`, une
// ligne chacun). Ajouter ou retirer un projet n'écrit que cette ligne : la
// station la relit seule, sans redémarrer.
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { canalGitHub } from "../appairage/canal.ts";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { lireCaches, PLATEFORME_LOCALE, verifier } from "../bac-a-sable/local.ts";
import { etatsPublies } from "../appairage/etats.ts";
import { identiteDeLaStation, tenirPresence } from "../appairage/presence.ts";
import { configVeille, veillerConnexionMax, type VeilleConnexionMax } from "../connexion-max/veille.ts";
import { masquerLaConsole } from "../jeton-claude.ts";
import { installerLimite, journaliserLesAppels, limiteDeLaStation } from "../limite-github.ts";
import { annoncerEnService } from "../mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../mise-a-jour/etat.ts";
import { tenirProjetsDeLApp } from "../projets/tenir.ts";
import { configReseau, passerParLaPorte } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { CONFIGURATION, ETATS } from "./configuration.ts";
import { attendrePorteDeLaStation, configPortes, lirePortes, VARIABLE_PORTES } from "./portes.ts";
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

let fichiersDeLaConnexion: ReturnType<typeof configVeille>;
// Les portes que tient `brigade-station-porte` : celle de la station, et
// celle de chaque projet.
let portes: string | null;
try {
  fichiersDeLaConnexion = configVeille(process.env, racine);
  portes = configPortes(process.env);
  // Sans elles, la porte de la station, si son environnement en nomme une : ce
  // que son process joint lui-même — GitHub, Anthropic — passe par elle.
  // Chaque projet peut avoir la sienne pour ce qu'il lance
  // (`BRIGADE_PROXY_PORT` sur sa ligne).
  const porte = configReseau(process.env);
  if (porte !== null && portes !== null) refuser(`BRIGADE_PROXY_PORT et ${VARIABLE_PORTES} sont définis ensemble : sous les portes de la station, la sienne est celle qu'elles ouvrent`);
  if (porte !== null) passerParLaPorte(porte);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide) refuser(erreur.message);
  throw erreur;
}
mkdirSync(racine, { recursive: true });

const dire = (ligne: string) => console.log(ligne);
// Sous les portes de la station, son unité ne joint que la boucle locale :
// rien ne part avant que sa porte ne soit ouverte. Un port qui change — la
// porte relancée n'a pas retrouvé le sien — est repris.
if (portes !== null) {
  const fichierDesPortes = portes;
  let porteDeLaStation = await attendrePorteDeLaStation(fichierDesPortes, { dire });
  passerParLaPorte(porteDeLaStation);
  setInterval(() => {
    const { station } = lirePortes(fichierDesPortes);
    if (station === null || station === porteDeLaStation) return;
    dire(`brigade : la porte de la station a changé de port (${porteDeLaStation} → ${station}) : la station sort par la nouvelle`);
    porteDeLaStation = station;
    passerParLaPorte(station);
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
const connexion: VeilleConnexionMax = veillerConnexionMax({ ...fichiersDeLaConnexion, jeton: Boolean(process.env.BRIGADE_CLAUDE_TOKEN_FILE), dire });
const station = ouvrirStation({ racine, env: process.env, dire, connexion, portes });
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
  etats: () => etatsPublies(dossierMiseAJour === null ? null : lireEtatMiseAJour(dossierMiseAJour), connexion.connexion()),
  dire,
});
// Les projets que le chef lui ajoute depuis l'app, par le même gist : la
// station les prépare et leur écrit leur ligne (projets/tenir.ts) — et les
// déménage, d'elle vers une autre ou d'une autre vers elle. Sur l'ordinateur du
// chef, elle ne reprend aucun projet sans bac à sable : la vérification est
// celle de `bac-a-sable/verifier.ts`.
const locale = process.platform === PLATEFORME_LOCALE;
const projetsDeLApp = tenirProjetsDeLApp({
  racine,
  canal,
  station: identite.nom,
  env: process.env,
  locale,
  ...(locale ? { verifierBacASable: () => verifier(sondesDeLaMachine(process.env.BRIGADE_CLAUDE_BIN || "claude"), { home: process.env.HOME ?? homedir(), worktrees: join(racine, ETATS), caches: lireCaches(process.env) }) } : {}),
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
    connexion.arreter();
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
annoncerEnService(racine, () => ({ servis: station.projets(), refuses: station.refuses() }), { dire });

const servis = station.projets();
console.log(
  `brigade : station démarrée — pid ${process.pid}, configuration ${join(racine, CONFIGURATION)} ; ${servis.length === 0 ? "aucun projet servi" : `${servis.length} projet${servis.length > 1 ? "s" : ""} servi${servis.length > 1 ? "s" : ""} : ${servis.join(", ")}`}`,
);
