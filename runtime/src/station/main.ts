// Point d'entrée de la station : un seul service brigade par machine, qui sert
// tous les projets de sa configuration (`<BRIGADE_STATION_DIR>/projets`, une
// ligne chacun). Ajouter ou retirer un projet n'écrit que cette ligne : la
// station la relit seule, sans redémarrer.
import { ouvrirCacheEtag } from "../cache-etag/cache-etag.ts";
import { ouvrirLaMiseAJour } from "../station-update/mettre-a-jour.ts";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fenetreDe } from "../lecture-initiale/etalement.ts";
import { canalGitHub } from "../appairage/canal.ts";
import { lireSeuilCommun } from "../commun/etage.ts";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { lireCaches, PLATEFORME_LOCALE, verifier } from "../bac-a-sable/local.ts";
import { etatsPublies } from "../appairage/etats.ts";
import { identiteDeLaStation, tenirPresence } from "../appairage/presence.ts";
import { configVeille, veillerConnexionMax, type VeilleConnexionMax } from "../connexion-max/veille.ts";
import { masquerLaConsole } from "../jeton-claude.ts";
import { installerLimite, journaliserLaPause, journaliserLaRetenue, journaliserLesAppels, limiteDeLaStation } from "../limite-github.ts";
import { noterUnDemarrage } from "../redemarrages/journal.ts";
import { annoncerEnService, versionDuRuntime } from "../mise-a-jour/en-service.ts";
import { lireEtatMiseAJour } from "../mise-a-jour/etat.ts";
import { tenirLaVidange } from "../mise-a-jour/vidange.ts";
import { tenirProjetsDeLApp } from "../projets/tenir.ts";
import { sourceDesProjets } from "../projets-station/source.ts";
import { servirLesProjetsChoisis, type ServiceDeLOrdinateur } from "../station-ordinateur/servir.ts";
import { machineDe } from "../projets/preparer.ts";
import { configReseau, passerParLaPorte } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { DemandeInvalide } from "../enrolement/enrolement.ts";
import { tenirEnregistrement } from "../enregistrement-station/enregistrer.ts";
import { CONFIGURATION, lieuxDuProjet, worktreesDeLaStation } from "./configuration.ts";
import { nomDeLaStation } from "./nom.ts";
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
  // Le seuil de l'étage commun, lu ici pour qu'une valeur mal écrite refuse
  // le démarrage ; la commande du chef le relit (`commun/commun-cli.ts`).
  lireSeuilCommun(process.env);
  portes = configPortes(process.env);
  // Sans elles, la porte de la station, si son environnement en nomme une : ce
  // que son process joint lui-même — GitHub, Anthropic — passe par elle.
  // Chaque projet peut avoir la sienne pour ce qu'il lance
  // (`BRIGADE_PROXY_PORT` sur sa ligne).
  const porte = configReseau(process.env);
  if (porte !== null && portes !== null) refuser(`BRIGADE_PROXY_PORT et ${VARIABLE_PORTES} sont définis ensemble : sous les portes de la station, la sienne est celle qu'elles ouvrent`);
  if (porte !== null) passerParLaPorte(porte);
} catch (erreur) {
  if (erreur instanceof ConfigInvalide || erreur instanceof DemandeInvalide) refuser(erreur.message);
  throw erreur;
}
// L'écart minimal entre deux écritures de son gist, et l'intervalle entre deux
// ticks du runtime de ses projets, en secondes entières : une minute chacun, à
// défaut. Une station de test les règle plus courts (recette.test.ts) — l'écart
// jusqu'à zéro : chaque écriture part dès qu'elle est due, et le test n'attend
// aucune seconde réelle entre deux (#2464).
const ecartS = process.env.BRIGADE_STATION_ECART_S;
if (ecartS !== undefined && !/^\d+$/.test(ecartS)) refuser(`BRIGADE_STATION_ECART_S=${ecartS} — attendu un nombre entier de secondes`);
const tickS = process.env.BRIGADE_STATION_TICK_S;
if (tickS !== undefined && !/^[1-9]\d*$/.test(tickS)) refuser(`BRIGADE_STATION_TICK_S=${tickS} — attendu un nombre entier de secondes`);
const fenetreS = process.env.BRIGADE_STATION_FENETRE_S;
const fenetreDeDepartMs = fenetreDe(fenetreS);
if (fenetreDeDepartMs === null) refuser(`BRIGADE_STATION_FENETRE_S=${fenetreS} — attendu un nombre entier de secondes (0 : tous les projets lisent GitHub à la fois)`);
// Entre deux regards sur ce que la mise à jour de la station a donné, en millisecondes : deux secondes, à
// défaut. Une station de test le règle plus court (mise-a-jour/machine.test.ts) : l'issue d'un passage est au
// journal du projet sans que le test attende deux secondes réelles (#2464).
const relaisMs = process.env.BRIGADE_STATION_RELAIS_MS;
if (relaisMs !== undefined && !/^[1-9]\d*$/.test(relaisMs)) refuser(`BRIGADE_STATION_RELAIS_MS=${relaisMs} — attendu un nombre entier de millisecondes`);
mkdirSync(racine, { recursive: true });
// Son nom, retenu à son premier démarrage — avant qu'aucun projet ne s'ouvre,
// qui le relit (`cuisine.ts`) : la machine renommée par macOS reste la même
// station (nom.ts).
noterUnDemarrage(racine, versionDuRuntime());
const nomRetenu = nomDeLaStation(racine, process.env);

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
// Les ETags des lectures, gardés d'un démarrage à l'autre (cache-etag/).
const cacheEtag = ouvrirCacheEtag({ fichier: join(racine, "cache-etag.json"), dire });
cacheEtag.charger();
cacheEtag.demarrer();
const limite = installerLimite(limiteDeLaStation(racine));
journaliserLesAppels(limite, { dire });
journaliserLaRetenue(dire);
journaliserLaPause(dire);

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
// Sa mise à jour, sur un ordinateur (#2189) : elle regarde les releases de la
// station, télécharge la nouvelle, se vide — ses cuisines ne prennent plus de
// ticket — et demande sa relance une fois ses cooks finis. Sur une box, ou sans
// source de versions, elle n'a pas lieu (`configDeLaMiseAJour`) : sur la box,
// c'est son unité root qui installe, et la station se vide à sa demande, lue
// dans le répertoire de la mise à jour (`mise-a-jour/vidange.ts`, #2547) — sans
// cesser de prendre ses tickets : elle se relance au premier moment sans cook
// en vol, ou à l'échéance, leur travail sauvé sur leur branche (#2586).
let seVide = (): boolean => false;
// Les projets de sa liste qu'elle sert elle-même sur GitHub seul (plus bas) : leurs cooks en vol aussi retiennent sa relance.
let choisis: ServiceDeLOrdinateur | null = null;
const station = ouvrirStation({ racine, env: process.env, dire, connexion, portes, retenue: () => seVide(), ...(fenetreDeDepartMs === null ? {} : { fenetreDeDepartMs }), ...(tickS === undefined ? {} : { intervalleTickMs: Number(tickS) * 1000 }), ...(relaisMs === undefined ? {} : { intervalleRelaisMs: Number(relaisMs) }) });
const miseAJour = ouvrirLaMiseAJour({ racine, env: process.env, enVol: () => [...station.enCuisine(), ...(choisis?.enCuisine() ?? [])], sauver: async () => [...(await station.sauver()), ...((await choisis?.sauver?.()) ?? [])], dire });
if (miseAJour !== null) seVide = () => miseAJour.miseAJour.retenue();
const dossierMiseAJour = process.env.BRIGADE_MISE_A_JOUR_DIR || null;
const vidange = miseAJour !== null || dossierMiseAJour === null ? null : tenirLaVidange({ racine, dossier: dossierMiseAJour, enVol: () => [...station.enCuisine(), ...(choisis?.enCuisine() ?? [])], sauver: async () => [...(await station.sauver()), ...((await choisis?.sauver?.()) ?? [])], dire });
if (vidange !== null) seVide = () => vidange.retenue();
// Sa présence sur GitHub, seul canal entre la station et l'app du chef : son
// état, chaque minute, et le code qui l'appaire (appairage/presence.ts). Ses
// pannes y vont aussi : sa mise à jour, que son unité lui fait lire
// (`BRIGADE_MISE_A_JOUR_DIR`), et sa connexion Max (appairage/etats.ts).
const canal = canalGitHub({ gh: process.env.BRIGADE_GH_BIN || "gh" });
const identite = identiteDeLaStation({ ...process.env, BRIGADE_STATION_NOM: nomRetenu });
const presence = tenirPresence({
  racine,
  canal,
  identite,
  projets: () => station.projets(),
  depots: () => station.depots(),
  rails: () => station.rails(),
  etats: () => etatsPublies(dossierMiseAJour === null ? null : lireEtatMiseAJour(dossierMiseAJour), connexion.connexion()),
  ...(ecartS === undefined ? {} : { ecartMinimalMs: Number(ecartS) * 1000 }),
  dire,
});
// Son enregistrement sous le compte GitHub de la machine, sans code : l'app
// connectée au même compte la trouve (enregistrement-station/).
const enregistrement = tenirEnregistrement({ racine, canal, identite, dire });
// Les projets que le chef lui ajoute depuis l'app, par le même gist : la
// station les prépare et leur écrit leur ligne (projets/tenir.ts) — et les
// déménage, d'elle vers une autre ou d'une autre vers elle. Sur l'ordinateur du
// chef, elle ne reprend aucun projet sans bac à sable : la vérification est
// celle de `bac-a-sable/verifier.ts`.
const locale = process.platform === PLATEFORME_LOCALE;
const gh = process.env.BRIGADE_GH_BIN || "gh";
const claude = process.env.BRIGADE_CLAUDE_BIN || "claude";
const maison = process.env.HOME ?? homedir();
// Les projets de sa liste (`station-ordinateur/`) : elle les clone dans ses
// lieux et les sert elle-même sur GitHub seul, sous son nom, comme la box — sans
// relais par une autre station. Liste vide, à l'installation : elle n'en sert aucun.
choisis = servirLesProjetsChoisis({
  racine,
  station: `${machineDe(identite.nom)}/claude`,
  env: process.env,
  maison,
  gh,
  claude,
  dire,
  retenue: () => seVide(),
  dejaServis: () => Object.values(station.depots()),
});
const projetsChoisis = choisis;
const projetsDeLApp = tenirProjetsDeLApp({
  racine,
  canal,
  station: identite.nom,
  env: process.env,
  locale,
  ...(locale ? { verifierBacASable: () => verifier(sondesDeLaMachine(process.env.BRIGADE_CLAUDE_BIN || "claude"), { home: process.env.HOME ?? homedir(), worktrees: worktreesDeLaStation(racine, process.env.HOME ?? homedir()), caches: lireCaches(process.env) }) } : {}),
  servis: station,
  // Les projets choisis pour elle dans l'app, lus dans le gist de son
  // enregistrement — à défaut, ce que l'app demande par l'appairage (projets-station/).
  source: sourceDesProjets({ racine, canal, gist: () => enregistrement.gist(), env: process.env, dire }),
  apresEcriture: () => {
    station.relire();
    void presence.publier();
  },
  dire,
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    cacheEtag.arreter();
    projetsDeLApp.arreter();
    void projetsChoisis.arreter();
    miseAJour?.arreter();
    vidange?.arreter();
    station.arreter(signal);
    connexion.arreter();
    console.log(`brigade : station arrêtée (${signal})`);
    // L'heure de l'arrêt, écrite sur GitHub : l'app la dit hors ligne sans attendre.
    void presence.arreter();
    // Et sur son enregistrement : l'app la dit indisponible à sa lecture suivante.
    void enregistrement.arreter();
  });
}
// Relire tout de suite, sans attendre la relecture suivante — la configuration,
// et ce que l'app demande.
process.on("SIGHUP", () => {
  station.relire();
  void projetsDeLApp.relire();
  void projetsChoisis.tourner();
});

// Ce que la station dit d'elle-même — sa version, son pid, ce qu'elle sert :
// c'est ce qu'une mise à jour attend pour garder sa version. La cause de chaque
// refus y est aussi : `facts` d'un projet refusé la lit (`refusDuProjet`).
annoncerEnService(
  racine,
  () => {
    const refuses = station.refuses();
    return { servis: station.projets(), refuses, causes: Object.fromEntries(Object.keys(refuses).map((nom) => [nom, station.cause(nom) ?? "unexpected"])) };
  },
  { dire },
);

const servis = station.projets();
console.log(
  `brigade : station démarrée — pid ${process.pid}, configuration ${join(racine, CONFIGURATION)} ; ${servis.length === 0 ? "aucun projet servi" : `${servis.length} projet${servis.length > 1 ? "s" : ""} servi${servis.length > 1 ? "s" : ""} : ${servis.join(", ")}`}`,
);
