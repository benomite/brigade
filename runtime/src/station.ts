// Les stations du projet : chacune vient prendre un ticket sur le rail, lui
// fabrique un worktree, y lance un cook sous garde-fous, lit comment il finit,
// rend au rail ce que cette fin veut dire, et range le worktree — ce qui y
// traîne commité sur sa branche. Le manager ne spawne rien — ce sont elles qui
// se servent.
//
// Le projet les déclare (`stations-declarees.ts`) : aucune n'est tenue pour
// acquise, et sans station aucun cook ne part. Celles qu'il déclare tournent
// ici, sur cette machine, par le même `claude` et la même connexion Max :
// chacune a son nom, son plafond de cooks et ses cooks ; l'entrée, la machine,
// le quota, la connexion et l'arbitre leur sont communs.
//
// Sauf celles qu'il dit distantes : celles-là vivent ailleurs — le poste du
// chef —, et rien d'ici ne les joint. Ce sont elles qui viennent tirer leur
// travail (`distantes.ts`), sous les mêmes bornes, les mêmes garde-fous et la
// même pass ; ce module ne leur lance rien, et raconte la fin de leurs cooks
// comme celle des siens. Absente, une station distante ne retient que les
// tickets qu'elle seule peut cuisiner : ils sont 86, et les autres partent.
//
// Une livraison qui touche l'interface est servie avant d'être rangée : la
// commande que le projet déclare part depuis le worktree du cook, sur le port
// que son setup lui a attribué, et le worktree reste tant que ce serveur
// tourne — jusqu'à ce que le ticket soit servi, quitte le rail, ou soit repris
// par un cook.
//
// Le worktree est rendu exécutable avant que le cook n'y entre : le setup du
// projet, s'il en a un, y passe d'abord — le même que celui que la pass joue
// avant les gates — et ce qu'il exporte fait partie de l'environnement du cook.
//
// Un ticket ne part que dans une station qui fournit ce que sa fiche demande
// (`capacites.ts`) : la capacité choisit la station, jamais une préférence. Ce
// qu'aucune station déclarée ne fournit ne part pas : le ticket est 86, sans
// cook, et dit ce qui manque.
//
// Une station fait tourner plusieurs cooks à la fois, chacun sur son ticket,
// dans son worktree, sur sa branche. Trois bornes, lues à chaque prise : son
// plafond de cooks — celui qu'elle déclare, ou celui que le chef règle —, le
// nombre de tickets en entrée — worktree et setup —, et la machine elle-même.
// Deux tickets dont les zones se recouvrent ne partent pas ensemble : c'est le
// rail qui retient le second.
//
// Rien n'est gardé en mémoire que les cooks attendus : pouvoir servir se
// lit dans le journal, donc tient après un redémarrage.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { geste as commandeDeBox } from "./geste.ts";
import { dirname, join, resolve } from "node:path";
import type { RuntimeAvecRail } from "./alimenter.ts";
import type { Mot } from "./arbitre.ts";
import { ArbitreInjoignable, type Arbitrage, type Reponse } from "./arbitrage.ts";
import { complet, manquant, type Calibrage } from "./calibrage.ts";
import { LECONS_INJECTEES_PAR_DEFAUT, leconsAInjecter, type LeconRecue } from "./apprentissage/injection.ts";
import type { DefinitionDeProfil } from "./profils/definition.ts";
import { carnetDonne, carnetDuProfil, profilPrefere, profilsOccupes, type CarnetRecu } from "./profils/preference.ts";
import { extraireRetro } from "./apprentissage/retro.ts";
import { CARNET_PATH } from "./carnet/carnet.ts";
import { capturesLivrees, direCaptures, estDInterface, zoneALaPrise as zonePrise, type Captures } from "./captures.ts";
import { absentesDuMotif, CLE_DES_CAPACITES, direManque, direStationAbsente, fournitTout, gesteDeCapacite, manque, manqueDuMotif, motifSansStation, motifStationAbsente } from "./capacites.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { argumentsClaude, consigne, consigneDeSuite, direRefus, environnementCook, lireFlux, REFUS_MAX, ticketRemis, verdict, VARIABLES_DE_CLE, VARIABLES_DE_JETON, type Lecture, type Session } from "./claude.ts";
import type { Decisions } from "./decisions.ts";
import { ouvrirDepot, worktreeAuJournal, worktreeDuJournal, type Depot, type OptionsDepot } from "./depot.ts";
import { configPresence, ouvrirDistantes, PRESENCE_PAR_DEFAUT_MIN, type Conclusion } from "./distantes.ts";
import { ecrireSecret } from "./droits.ts";
import { prendLesOrdinaires } from "./bac-a-sable/ordinaires.ts";
import { STATION_ABSENTE, type AccesRefuse } from "./events/rail.ts";
import { echecDuWorktree, WORKTREE_IMPOSSIBLE } from "./echec-du-worktree.ts";
import type { AccesBloque } from "./projets/acces.ts";
import type { ContexteCook } from "./events/guardrails.ts";
import { IDENTIFIANTS_LIVRES, PART_SANS_PROGRES, SANS_DIFF, SANS_LIVRABLE, type FaitStation, type FinDeCook, type Ressource, type Retenue } from "./events/station.ts";
import { illisible, MARQUEUR, requises } from "./fiche.ts";
import { direMasquage, FICHIER_DES_IDENTIFIANTS, identifiantsLivres, LONGUEUR_MIN_DU_JETON, type SigneDIdentifiants } from "./identifiants.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { envelopper, type Cloison } from "./cloison.ts";
import { jouerSetup, SCRIPT_SETUP } from "./gates.ts";
import { CAUSES_DU_PROJET } from "./mise-de-cote.ts";
import { direDefaut, lireLivrable, type Defaut } from "./livrable.ts";
import { LancementRefuse, nomDeRun, type CookLance, type FinDeCook as FinGardee, type GardeFous, type Verdict } from "./garde-fous.ts";
import type { GitHub } from "./github.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import { configTranscripts, ouvrirNettoyage } from "./nettoyage.ts";
import { configMachine, direSaturations, JEUNE_MS, lireMachine, reserver, saturation, saturations, type Machine, type Saturation, type Seuils } from "./machine.ts";
import { consigneDeRenvoi, consigneDeReprise, RENVOIS_MAX } from "./pass.ts";
import { commitsConserves, travailLaisse, type TravailLaisse } from "./travail-conserve.ts";
import { lire } from "./plafonds.ts";
import { etatDesGardeFous, fluxDuCook } from "./projections/guardrails.ts";
import { etatDeLaBase, passDuTicket, renvoiEnAttente, reparationEnCours } from "./projections/pass.ts";
import { pauseAccordee } from "./pause/pause.ts";
import { communsDuRail, lireRail, prisPar, ticketDuRail, type TicketRail } from "./projections/rail.ts";
import { arreteeDepuis, consommationDesCooks, derniereMiseDeCote, dernierEchecDeSetup, etatStation, miseDeCoteBloquee, memeCause, plafondDeCooks, refusDAffilee, SANS_CONNEXION, sansStationDepuis, setupBloque, stationsAnnoncees } from "./projections/stations.ts";
import { GesteRefuse, type Preneuse } from "./rail.ts";
import { AUTRES_HOTES } from "./porte.ts";
import { DECLARATION_RESEAU } from "./reseau.ts";
import { preparerReprise, type Reprise as SessionReprise } from "./reprise-de-session.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";
import { DECLARATION, lireSecrets } from "./secrets.ts";
import { ouvrirServeurs, type Livraison, type Serveurs } from "./servir.ts";
import { direStations, lireStations, type StationDeclaree } from "./stations-declarees.ts";
import { horsZone, possede } from "./zones.ts";

// Combien de tickets peuvent être en entrée à la fois : un `git worktree add`
// et le setup du projet (un `npm ci`, souvent) par ticket. C'est ce qui borne
// le coût d'entrée quand le rail se remplit d'un coup.
export const ENTREES_PAR_DEFAUT = 4;
// Qui écrit au journal ce qu'une station fait.
const auteurDe = (station: string) => `station:${station}`;

// Les motifs que la station écrit sur le rail.
export const SANS_CALIBRAGE = "no-calibration";
const CALIBRE = "calibrated";
export const FICHE_ILLISIBLE = "unreadable-card";
const FICHE_LISIBLE = "card-readable";
// Ce qu'un ticket 86 faute de station demande n'est plus ce qui manquait : une
// station le fournit désormais, ou sa fiche a changé.
const CAPACITES_RELUES = "capabilities-reread";
// Une station distante s'est manifestée, ou celles qui peuvent cuisiner le
// ticket ne sont plus les mêmes.
const STATION_REVENUE = "station-present";
const QUOTA = "quota";
const DECONNEXION = "disconnected";
const REFUS = "refused";
const SETUP_EN_ECHEC = "setup-failed";
// Un setup en cours quand le projet a été bloqué échoue comme celui qui l'a
// bloqué : son ticket est rendu au rail, sans rien de plus au journal.
const SETUP_BLOQUE = "setup-blocked";
// La branche d'intégration a bougé : les tickets 86 sur un setup en échec
// n'attendent pas leur heure de retour.
const SETUP_DEBLOQUE = "setup-unblocked";
// Une cause de mise de côté qui se répète sur le projet l'a bloqué, puis a
// été levée : les tickets 86 pour elle n'attendent pas leur heure de retour.
const MISE_DE_COTE_LEVEE = "aside-unblocked";
// Le ticket n'a pas pu être lu sur GitHub pour être remis au cook.
const TICKET_ILLISIBLE = "ticket-unreadable";
// Le worktree du ticket n'a pas pu être préparé : `WORKTREE_IMPOSSIBLE`
// (`echec-du-worktree.ts`).
// Les secrets que le dépôt déclare ne peuvent pas être donnés au cook.
export const SECRETS_INDISPONIBLES = "secrets-unavailable";
// Ce que le cook a commité porte la valeur d'un secret : rien n'est poussé.
export const SECRET_LIVRE = "secret-committed";
class SecretLivre extends Error {}
// Ce que le cook a commité porte le nom ou la forme des identifiants de
// Claude : rien n'est poussé.
export { IDENTIFIANTS_LIVRES, SANS_DIFF, SANS_LIVRABLE };
class IdentifiantsLivres extends Error {}
const SIGNES_D_IDENTIFIANTS: Record<SigneDIdentifiants, string> = {
  name: `un fichier nommé \`${FICHIER_DES_IDENTIFIANTS}\`, comme celui où Claude garde la connexion du compte`,
  shape: "un contenu qui a la forme d'identifiants de Claude (un jeton `sk-ant-…`, ou la structure du fichier où Claude garde la connexion du compte)",
};
// Les signes d'un motif, en clair.
const direSignes = (signes: string): string =>
  signes
    .split(", ")
    .map((signe) => SIGNES_D_IDENTIFIANTS[signe as SigneDIdentifiants] ?? signe)
    .join(", et ");
// Un cook dont le worktree n'est plus sur sa branche : ce qu'il a commité
// ailleurs n'est pas livré.
export const HORS_BRANCHE = "off-branch";
class HorsBranche extends Error {}

const HEURE = 3_600_000;
// Un quota épuisé qui ne dit pas quand il revient est retenté une heure après.
const REPLI_QUOTA_MS = HEURE;
// Un worktree impossible à préparer (origine injoignable) : le ticket est
// reproposé dix minutes plus tard, sans cook perdu.
const REPLI_WORKTREE_MS = 600_000;
// Ce que le journal garde de l'erreur d'un worktree impossible à préparer.
const RAISON_DU_WORKTREE_MAX = 2000;
// L'accès au dépôt, revérifié avant de préparer un worktree, est refusé.
class AccesDuDepotRefuse extends Error {
  readonly acces: AccesBloque;
  constructor(acces: AccesBloque) {
    super(acces.raison);
    this.acces = acces;
  }
}
// La machine d'une station déclarée (`box/claude`) : c'est elle que la raison
// et le geste d'un accès refusé nomment.
const machineDe = (station: string) => station.split("/")[0] ?? station;
// Le setup du projet tient dans la moitié du bail du ticket : le cook part
// avant qu'il ne tombe.
const PART_DU_SETUP = 0.5;
// Ce que la station garde de la sortie d'un setup en échec, pour journald et pour l'issue.
const FIN_DE_SETUP_MAX = 2000;
// Ce qui encadre une sortie citée sur une issue.
const CLOTURE_DE_SORTIE = "```";
// Le worktree d'un cook est regardé au tick, au plus une fois par dixième de
// bail : un `git status` toutes les trois minutes pour un bail de trente.
const REGARDS_PAR_BAIL = 10;
// GitHub refuse un commentaire au-delà de 65 536 caractères.
const COMPTE_RENDU_MAX = 20_000;
// Ce que le journal garde de la rétro d'un cook : trois leçons courtes tiennent
// bien en deçà ; ce qui dépasse n'en est plus une.
const RETRO_MAX = 4_000;
// Ce que le commentaire nomme des fichiers écrits hors zone ; le journal les
// porte tous.
const HORS_ZONE_MAX = 20;

export type ConfigStation = {
  // Les stations que le projet déclare. Aucune : aucun cook ne part.
  stations: StationDeclaree[];
  // Le clone du dépôt du projet, réservé à la station.
  clone: string;
  // La branche d'intégration : d'où part le worktree, où vise la PR.
  base: string;
  // Le binaire `claude`. Surchargé par les tests, jamais sur la box.
  bin: string;
  // Les tickets en entrée à la fois, et ce que la machine doit garder.
  entreesMax: number;
  seuils: Seuils;
  // Combien de temps un transcript reste dans le `~/.claude` du projet, sous cloison.
  gardeTranscriptsMs: number;
  // Passé ce délai sans s'être manifestée, une station distante est absente.
  presenceMs: number;
};

// Lit la configuration des stations dans l'environnement. Ni le clone ni la
// branche n'ont de défaut, et aucune station n'est supposée ; et rien ne doit
// faire payer `claude` hors de la connexion Max de la machine.
export function configStation(env: Record<string, string | undefined>): ConfigStation {
  for (const variable of VARIABLES_DE_CLE) {
    if (env[variable]) {
      throw new ConfigInvalide(
        `${variable} est défini : la station ne pilote \`claude\` que par la connexion Max de la machine, jamais par une clé ou un jeton d'API — retirer la variable`,
      );
    }
  }
  const clone = env.BRIGADE_REPO_DIR;
  if (!clone) throw new ConfigInvalide("BRIGADE_REPO_DIR n'est pas défini");
  const base = env.BRIGADE_BASE_BRANCH;
  if (!base) throw new ConfigInvalide("BRIGADE_BASE_BRANCH n'est pas défini");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base)) {
    throw new ConfigInvalide(`BRIGADE_BASE_BRANCH invalide : « ${base} » — attendu un nom de branche (v2, main)`);
  }
  return {
    stations: lireStations(env),
    clone,
    base,
    bin: env.BRIGADE_CLAUDE_BIN || "claude",
    entreesMax: lire(env, "BRIGADE_MAX_SETUPS", ENTREES_PAR_DEFAUT, "un entier supérieur à zéro", (valeur) => Number.isSafeInteger(valeur) && valeur > 0),
    seuils: configMachine(env),
    gardeTranscriptsMs: configTranscripts(env).gardeMs,
    presenceMs: configPresence(env),
  };
}

export type OptionsStation = {
  // Les stations que le projet déclare, dans l'ordre où il les écrit.
  stations: StationDeclaree[];
  // Les décisions du chef : présentes, les stations y sont relues à chaque
  // réveil — le chef a pu les changer sans redémarrer.
  decisions?: Pick<Decisions, "stations">;
  repertoireEtat: string;
  // Le répertoire où le dépôt pose les worktrees des cooks : celui où le
  // journal les nomme `worktrees/<run>`. Par défaut, sous l'état.
  worktrees?: string;
  depot: Depot;
  github: GitHub;
  // `<owner>/<repo>`, pour la consigne du cook.
  depotGitHub: string;
  base: string;
  bin: string;
  // La session Max de la machine, demandée une fois au démarrage.
  session: () => Promise<Session>;
  // L'environnement dont part celui des cooks. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  // Le fichier de la machine qui porte les valeurs des secrets du projet
  // (`BRIGADE_SECRETS_FILE`), relu à chaque ticket. Absent : le projet n'en a
  // pas.
  secrets?: string | null;
  // Chaque rôle a son identité GitHub, et le cook n'en a aucune : son ticket
  // lui est remis en fichier, et aucun jeton GitHub ne passe du setup à lui.
  sansIdentite?: boolean;
  // La cloison dans laquelle partent le setup et le cook. Absente : ils
  // tournent sous le compte du runtime, sans rien autour.
  cloison?: Cloison | null;
  // Le bac à sable d'une cuisine locale, sur le Mac du chef : le cook y part.
  // Absent : il part sans.
  bacASable?: BacASableLocal | null;
  // Sous cloison, la durée de garde des transcripts du projet. Absente :
  // celle par défaut.
  gardeTranscriptsMs?: number;
  dureeBailMs: number;
  // Le délai de présence d'une station distante. Par défaut, deux minutes.
  presenceMs?: number;
  entreesMax?: number;
  // Ce que la machine doit garder pour que la station prenne un ticket, et de
  // quoi la lire. Par défaut : les seuils par défaut, et la vraie machine.
  seuils?: Seuils;
  machine?: () => Machine;
  maintenant?: () => Date;
  // Où va ce que la station a à dire hors du journal (journald). Par défaut,
  // la sortie d'erreur du process.
  avertir?: (message: string) => void;
  // Appelé une fois la fin d'un cook racontée : la pass n'attend pas le tick.
  apresCook?: () => void;
  // L'arbitre entre projets, consulté avant chaque lancement. Absent : le
  // projet se tient pour seul sur la machine.
  arbitre?: Arbitrage | null;
  // Combien de leçons provisoires du projet reçoit, au plus, le cook d'un
  // ticket (`BRIGADE_INJECTED_LESSONS`). Par défaut, vingt.
  leconsInjectees?: number;
  // Les profils de cook que le projet définit, relus à chaque lancement
  // (`profils/preference.ts`). Absent : le projet n'en a aucun, et chaque
  // ticket part avec un généraliste.
  profils?: () => DefinitionDeProfil[];
  // Les leçons de l'étage commun de l'installation, relues à chaque lancement
  // (`commun/installation.ts`). Absent : le projet est seul, sans étage commun.
  commun?: () => LeconRecue[];
};

// Ouvre le dépôt de la station là où le runtime le range : les worktrees des
// cooks vivent dans le répertoire d'état, à côté de leurs flux bruts — le
// temps du cook : chacun part à la fin du sien.
// `jeton` : celui sous lequel elle rapatrie et pousse, quand elle a une
// identité GitHub pour cela.
export function depotDeStation(repertoireEtat: string, config: ConfigStation, jeton?: OptionsDepot["jeton"], apresRapatriement?: OptionsDepot["apresRapatriement"]): Depot {
  return ouvrirDepot({ clone: config.clone, base: config.base, worktrees: join(repertoireEtat, "worktrees"), jeton, apresRapatriement });
}

// Ce que la station retient d'un cook entre le moment où elle juge sa fin et
// celui où elle la raconte : `Conclusion`.
// `sansCommit` : sa branche ne porte aucun commit — il n'y a ni branche à
// pousser ni PR à ouvrir. `recolte` : le commit de ce qu'il avait laissé non
// commité, parti avec sa livraison.

// Un ticket que la pass a renvoyé : son cook repart de la livraison refusée.
type Reprise = { n: number; pr: string | null };

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const duree = (ms: number) =>
  ms >= 60_000 ? `${(ms / 60_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const chemins = (zone: string[]) => zone.map((chemin) => `\`${chemin}\``).join(", ") || "aucune";
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la station dit d'un cook que le bail de son ticket a arrêté.
const sansProgres = (fin: FinGardee): string | null =>
  fin.arret?.reason === "lease" ? `Aucun progrès dans son worktree depuis ${duree(fin.arret.observed ?? 0)} : le bail du ticket est tombé.` : null;

// Ce que l'issue dit d'un cook dont le flux portait la forme d'identifiants
// de Claude : son compte-rendu, comme le reste, n'en montre plus rien.
const masquageDuCook = (masques: number | undefined): string[] =>
  masques ? [direMasquage(masques, "ce que ce cook a dit — son flux brut, d'où viennent ce compte-rendu et celui du journal")] : [];

function entete(station: string, fin: string, calibrage: Calibrage, mesure: Fin): string {
  return [
    [
      `**Cook \`${station}\` — ${fin}**`,
      `\`${calibrage.model}\` / \`${calibrage.effort}\``,
      pluriel(mesure.turns, "tour"),
      `${nombre(mesure.tokens)} tokens`,
      duree(mesure.durationMs),
    ].join(" · "),
    ...masquageDuCook(mesure.masques),
  ].join("\n");
}

const replier = (titre: string, texte: string) => ["<details>", `<summary>${titre}</summary>`, "", texte, "", "</details>"];

// Ce que la station garde et publie du dernier message d'un cook. `publie` :
// son livrable — ce qu'il a délimité — en clair, et ce qui l'entoure replié,
// là pour qui va le chercher. Un message sans délimitation est publié tel
// quel : c'est un compte-rendu, pas un livrable.
// `retro` : sa rétro, à part du compte-rendu, pour qu'un message long ne la
// coupe pas.
// `retroTokens` : ce que la rétro a coûté, comprise dans les tokens du cook et
// qu'aucun lancement à part ne sépare — estimée à sa part de caractères dans le
// message, sur les `jetons` que ce message a produits. Nul sans rétro ou sans
// jetons connus.
type Rendu = { summary: string | null; deliverable: string | null; defaut: Defaut | null; retro: string | null; retroTokens: number | null; publie: string[] };
function rendre(message: string | null, jetons: number | null = null): Rendu {
  const couper = (texte: string | null) => texte?.slice(0, COMPTE_RENDU_MAX) ?? null;
  const livrable = lireLivrable(message);
  const retro = extraireRetro(message);
  const deliverable = couper(livrable.texte);
  const autour = couper(livrable.autour);
  const reste = `Le reste du message du cook${livrable.delimitations > 1 ? ` — il a délimité ${livrable.delimitations} fois, la dernière délimitation est retenue` : ""}`;
  return {
    summary: couper(message),
    deliverable,
    defaut: livrable.defaut,
    retro: retro?.slice(0, RETRO_MAX) ?? null,
    retroTokens: retro === null || jetons === null || !message ? null : Math.round((jetons * retro.length) / message.length),
    publie: deliverable === null ? [autour ?? "_Le cook n'a laissé aucun compte-rendu._"] : [deliverable, ...(autour === null ? [] : ["", ...replier(reste, autour)])],
  };
}

// Le corps de la PR d'une livraison. Le calibrage manque si le ticket l'a
// perdu depuis son cook. `captures` : ce qu'en dit une livraison d'interface,
// sous la première ligne — rien pour un autre ticket.
const corpsDePR = (station: string, numero: number, calibrage: Calibrage | null, compteRendu: string | null, captures: string[] = []) =>
  [`Ticket #${numero}, cuisiné par \`${station}\`${calibrage ? ` (\`${calibrage.model}\` / \`${calibrage.effort}\`)` : ""}.`, ...captures, "", compteRendu ?? ""].join("\n");

// Ce que la station dit d'un cook qui finit alors que son ticket a quitté le
// rail : sa livraison ne part pas en pass, et aucune PR n'est ouverte pour lui.
// `pr` : celle de la livraison qu'un renvoi reprenait, ou qu'elle venait
// d'ouvrir quand le ticket est parti.
function direLivraisonSansTicket(branche: string, base: string, pr: string | null, sansCommit: boolean): string[] {
  const reste = sansCommit
    ? "Aucun commit, et rien n'est poussé : ce compte-rendu est tout ce que ce cook laisse."
    : pr
      ? `Branche \`${branche}\` poussée · ${pr} — la PR reste ouverte, et plus personne ne la suit : à toi de la merger ou de la fermer.`
      : `Branche \`${branche}\` poussée, sans PR : la station n'en ouvre pas pour un ticket sorti du rail. Si tu veux ce travail : \`gh pr create --head ${branche} --base ${base}\` ; sinon, supprime la branche.`;
  return ["Le ticket a quitté le rail pendant la cuisson : cette livraison ne part pas en pass — ni relecture, ni renvoi, ni merge.", reste];
}

// Rend le runtime, augmenté de ses stations. Son `arreter` les emporte avec lui.
export function brancherStation<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsStation): R {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  // Toutes les stations que le projet déclare, puis celles d'ici : les seules
  // où ce module lance un cook. Une station distante tire son travail. Le chef
  // peut les changer sans redémarrer : elles sont relues à chaque réveil
  // (`adopter`), et ce qui en dérive avec elles.
  let toutes = options.stations;
  let declarees = toutes.filter((declaree) => !declaree.distante);
  let noms = declarees.map((declaree) => declaree.nom);
  const estDistante = (station: string) => toutes.some((declaree) => declaree.nom === station && declaree.distante);
  // Les stations telles que le rail les lit pour leur prêter un ticket : dans
  // l'ordre de la déclaration, chacune avec ce qu'elle fournit.
  // Une distante ne prend les tickets ordinaires que si le chef le lui fait
  // faire, que son poste a le bac à sable (`bac-a-sable/ordinaires.ts`), et
  // que la box sature (`boxSaturee`).
  const preneuses = (celles: readonly string[]): Preneuse[] =>
    toutes
      .filter((declaree) => celles.includes(declaree.nom))
      .map((declaree) => ({
        station: declaree.nom,
        fournit: declaree.fournit,
        ordinaires: prendLesOrdinaires(declaree, etatStation(base, declaree.nom)?.sandbox ?? null) && (declaree.distante !== true || boxSaturee()),
      }));
  // Ce qu'un ticket peut demander : ce que fournit une station déclarée,
  // qu'elle tourne ici ou ailleurs.
  let offres = toutes.map((declaree) => declaree.fournit);
  // Les stations d'ici, telles qu'un avertissement les nomme : ce qui leur
  // est commun — la machine, la connexion, l'arbitre — se dit de toutes.
  const lesStations = (une: string, plusieurs: string) =>
    noms.length === 1 ? `la station ${noms[0]} ${une}` : noms.length === 0 ? `la cuisine, sans station, ${une}` : `les stations ${noms.join(", ")} ${plusieurs}`;
  const desStations = () => (noms.length > 1 ? `des stations ${noms.join(", ")}` : `de la station ${noms[0]}`);
  const maintenant = options.maintenant ?? (() => new Date());
  const envCook = environnementCook(options.env ?? process.env);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const pasDeRegard = options.dureeBailMs / REGARDS_PAR_BAIL;
  const entreesMax = options.entreesMax ?? ENTREES_PAR_DEFAUT;
  const seuils = options.seuils ?? configMachine({});
  const machine = options.machine ?? (() => lireMachine(options.repertoireEtat));
  const noter = (station: string, ticket: number | null, fait: FaitStation) => journal.ajouter({ project: projet, ticket, author: auteurDe(station), ...fait });
  // Les leçons provisoires du projet que reçoit le cook d'un ticket, d'ici ou
  // d'une station distante : lues à son lancement, contre le carnet de la base
  // tel que le clone le porte. Illisible, il n'en retire aucune.
  const plafondDesLecons = options.leconsInjectees ?? LECONS_INJECTEES_PAR_DEFAUT;
  const carnetALaBase = () => {
    try {
      return depot.lire(`origin/${options.base}`, CARNET_PATH);
    } catch {
      return null;
    }
  };
  // Puis celles de l'étage commun de l'installation, que le chef a acceptées :
  // hors du plafond, qui compte les provisoires. Illisible, aucune.
  const leconsCommunes = (): LeconRecue[] => {
    if (options.commun === undefined) return [];
    try {
      return options.commun();
    } catch (erreur) {
      avertir(`brigade : étage commun illisible, le cook part sans ses leçons — ${message(erreur)}`);
      return [];
    }
  };
  const leconsDuCook = () => [...leconsAInjecter(base, projet, { plafond: plafondDesLecons, carnet: plafondDesLecons > 0 ? carnetALaBase() : null }), ...leconsCommunes()];
  // Le profil sous lequel part le cook d'un ticket de zone `zone`, d'ici ou
  // d'une station distante, et le carnet qu'il en reçoit : le plus précis des
  // profils dont le domaine touche la zone et dont le cook est libre. Null :
  // aucun, ou tous occupés — un généraliste le cuisine, sans carnet, et sans
  // attendre. Choisi juste avant le lancement, et dit au journal juste après
  // (`direLeCarnet`), dans le même tour : deux tickets du domaine ne prennent
  // pas le même cook de profil. Des profils illisibles n'arrêtent aucun cook.
  const carnetDuCook = (zone: string[]): CarnetRecu | null => {
    if (options.profils === undefined) return null;
    try {
      const profil = profilPrefere(options.profils(), zone, profilsOccupes(base, projet));
      return profil === null ? null : carnetDuProfil(profil);
    } catch (erreur) {
      avertir(`brigade : profils de cook illisibles, le cook part en généraliste — ${message(erreur)}`);
      return null;
    }
  };
  // Le carnet donné au cook `run`, au journal : c'est aussi ce qui dit, tant
  // qu'il tourne, que le cook du profil est occupé.
  const direLeCarnet = (station: string, numero: number, run: string, carnet: CarnetRecu | null) => {
    if (carnet !== null) journal.ajouter({ project: projet, ticket: numero, author: auteurDe(station), type: "profile.notebook-given", payload: carnetDonne(run, carnet) });
  };
  // Ce qui vaut pour toutes les stations d'ici s'écrit pour chacune : chacune
  // se lit seule, dans `status` comme dans `station`.
  const noterPourChacune = (fait: (station: string) => FaitStation, celles: string[] = noms) => {
    for (const station of celles) noter(station, null, fait(station));
  };

  // Un geste du rail refusé : le ticket a quitté le rail ou changé de mains
  // pendant que le cook tournait. Il n'y a plus rien à en dire.
  const geste = (faire: () => void): boolean => {
    try {
      faire();
      return true;
    } catch (erreur) {
      if (erreur instanceof GesteRefuse) return false;
      throw erreur;
    }
  };

  // Un ticket en pass dont le cook n'a pas de compte-rendu : la pass part de
  // `cook.reported`, elle ne verra jamais cette livraison.
  const sansCompteRendu = (numero: number): boolean => {
    const phase = passDuTicket(base, numero)?.phase;
    return ticketDuRail(base, numero)?.state === "pass" && (phase === "cooking" || phase === "returned");
  };
  // Lus au démarrage, où aucun cook de cette vie ne tourne : ce sont ceux
  // qu'une vie précédente a envoyés en pass avant de mourir. Plus tard, le même
  // état est celui d'un cook que la station est en train de raconter.
  const aReprendre: number[] = [];
  // Les cooks qu'une vie précédente a laissés en vol, chacun sur un ticket
  // qu'une station d'ici tient encore : ils sont repris, pas relancés.
  const aSuivre: Array<{ station: string; ticket: TicketRail; run: string }> = [];
  // Ce que le lancement d'un cook a dit de lui.
  const lancementDe = (numero: number, run: string) =>
    journal.duTicket(numero).findLast((evenement) => evenement.type === "cook.launched" && evenement.payload.run === run)?.payload as Partial<ContexteCook> | undefined;

  // Ce que le journal montre des stations devient ce que le projet déclare :
  // au démarrage, et à chaque fois que le chef les change.
  const annoncer = () => {
    const nomsDeToutes = toutes.map((declaree) => declaree.nom);
    // Une station que le projet ne déclare plus ne reste pas montrée comme si
    // elle servait.
    for (const station of stationsAnnoncees(base)) {
      if (!nomsDeToutes.includes(station)) noter(station, null, { type: "station.withdrawn", payload: { station } });
    }
    // Les cœurs de cette machine, d'où dérive le plafond par défaut des
    // stations d'ici. Illisibles, elles s'en tiennent à leur déclaration.
    let coeurs: number | null;
    try {
      coeurs = machine().coeurs;
    } catch {
      coeurs = null;
    }
    for (const declaree of toutes) {
      const desCoeurs = !declaree.distante && coeurs !== null && Number.isSafeInteger(coeurs) && coeurs > 0 ? { cores: coeurs } : {};
      const annonce = {
        station: declaree.nom,
        engine: declaree.moteur,
        provides: declaree.fournit,
        maxCooks: declaree.cooks,
        ...desCoeurs,
        ...(declaree.distante ? { remote: true as const } : {}),
        ...(declaree.ordinaires ? { ordinary: true as const } : {}),
      };
      const connue = etatStation(base, declaree.nom);
      const annoncee = connue && {
        station: connue.station,
        engine: connue.engine,
        provides: connue.provides,
        maxCooks: connue.maxCooks,
        ...(connue.cores === null ? {} : { cores: connue.cores }),
        ...(connue.remote ? { remote: true as const } : {}),
        ...(connue.ordinary ? { ordinary: true as const } : {}),
      };
      if (JSON.stringify(annoncee) !== JSON.stringify(annonce)) noter(declaree.nom, null, { type: "station.announced", payload: annonce });
    }
    // Sans station, aucun cook ne part : c'est écrit, une fois, et `status`
    // le dit tant que ça dure.
    if (toutes.length === 0 && sansStationDepuis(base) === null) {
      journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "stations.undeclared", payload: {} });
    }
  };

  base.transaction(() => {
    // Les stations d'une vie précédente : celles que le projet déclare
    // encore, et celles qu'il ne déclare plus.
    const nomsDeToutes = toutes.map((declaree) => declaree.nom);
    const connues = new Set([...nomsDeToutes, ...stationsAnnoncees(base)]);
    // Un ticket encore tenu par une station est celui d'une vie précédente :
    // son cook vit encore — un relais le porte —, et il est repris ; ou elle
    // est morte entre le prêt et le lancement, et il revient au rail.
    const survivants = runtime.survivants();
    for (const ticket of rail.tickets()) {
      const { station } = ticket;
      if (station === null || !connues.has(station)) continue;
      const survivant = ticket.state === "taken" ? survivants.find((cook) => cook.ticket === ticket.ticket && lancementDe(ticket.ticket, cook.run)?.station === station) : undefined;
      if (survivant) aSuivre.push({ station, ticket, run: survivant.run });
      else if (ticket.state === "taken") geste(() => rail.rendre(ticket.ticket, "station-restarted", station));
      if (sansCompteRendu(ticket.ticket)) aReprendre.push(ticket.ticket);
    }
    annoncer();
  });

  let arrete = false;
  // Le worktree d'un cook part à la fin de ce cook : la station le range, et
  // rattrape au tick ce qui lui a échappé.
  const nettoyage = ouvrirNettoyage({
    journal,
    projet,
    repertoireEtat: options.repertoireEtat,
    worktrees: options.worktrees,
    depot,
    avertir,
    arrete: () => arrete,
    // Rangé par la station, par le rattrapage ou sur un chemin d'erreur, un
    // worktree ne part pas sous un serveur qui tourne.
    avant: (relatif) => serveurs.liberer(relatif),
    transcripts: options.cloison ? { claude: options.cloison.claude, gardeMs: options.gardeTranscriptsMs ?? configTranscripts({}).gardeMs } : null,
    maintenant,
  });
  // Le serveur d'une livraison d'interface tient le worktree de son cook :
  // il ne part qu'une fois ce serveur arrêté. Chaque station lance les siens ;
  // ce qui arrête, libère ou éteint un serveur ne demande pas laquelle.
  // Une station retirée par le chef garde les siens : ils tiennent le
  // worktree d'un cook qui a déjà livré.
  const serveursDe = new Map<string, Serveurs>();
  const ouvrirServeursDe = (station: string) => {
    if (serveursDe.has(station)) return;
    serveursDe.set(
      station,
      ouvrirServeurs({
        journal,
        projet,
        station,
        auteur: auteurDe(station),
        cloison: options.cloison,
        avertir,
        ranger: async ({ ticket, relatif, branche }) => {
          if (!arrete) await nettoyage.ranger(ticket, relatif, branche);
        },
      }),
    );
  };
  for (const station of noms) ouvrirServeursDe(station);
  const serveurs = {
    servir: (station: string, livraison: Livraison) => serveursDe.get(station)?.servir(livraison) ?? false,
    arreter: async (ticket: number, motif: Parameters<Serveurs["arreter"]>[1]) => void (await Promise.all([...serveursDe.values()].map((tenus) => tenus.arreter(ticket, motif)))),
    liberer: async (relatif: string) => void (await Promise.all([...serveursDe.values()].map((tenus) => tenus.liberer(relatif)))),
    tenus: () => [...serveursDe.values()].flatMap((tenus) => tenus.tenus()),
    orphelins: () => [...serveursDe.values()].flatMap((tenus) => tenus.orphelins()),
    fermer: () => {
      for (const tenus of serveursDe.values()) tenus.fermer();
    },
  };
  // Arrête le setup en cours quand le runtime s'en va.
  const abandon = new AbortController();
  // Le regard de la station sur le worktree de chaque cook en cours, porté au
  // tick.
  const regards = new Set<() => void>();
  // Les tickets en entrée : pris, et dont le cook n'est pas encore lancé.
  let entrees = 0;
  // Les tickets dont la cuisine n'est pas finie — jusqu'à la fin racontée —,
  // chacun avec la zone qu'il portait à sa prise. Un ticket rendu au rail ou
  // retiré pendant que son cook tourne, ou que son setup se joue, compte encore
  // au plafond, tient encore sa zone, et n'est pas repris tant que cette
  // cuisine-là n'est pas défaite : ni deux cooks sur un ticket, ni un cook de
  // plus que le plafond, ni deux cooks dans les mêmes fichiers.
  const enCuisine = new Map<number, string[]>();
  // La station de chacun d'eux : son plafond les compte.
  const cuisinePar = new Map<number, string>();
  const enCuisineDe = (station: string) => [...cuisinePar.values()].filter((celle) => celle === station).length;
  // L'instant où chaque cook encore jeune est parti (voir `machineRetient`).
  let departs: number[] = [];

  // Les deux seules choses que la station écrit sur GitHub en dehors de la PR.
  // Un commentaire qui ne part pas ne retient rien : le journal a déjà tout.
  const commenter = async (ticket: number, corps: string) => {
    try {
      await github.commenter(ticket, corps);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : commentaire non posté sur le ticket #${ticket} — ${message(erreur)}`);
    }
  };

  // La connexion Max est celle de la machine : tombée pour une station, elle
  // l'est pour toutes. `par` : la station du cook qui l'a révélé, s'il y en a
  // un — c'est sur son ticket que le fait s'écrit.
  const deconnecter = (raison: string, celles: string[] = noms, par: { station: string; ticket: number; run: string } | null = null) => {
    for (const station of celles) {
      noter(station, par?.station === station ? par.ticket : null, { type: "station.disconnected", payload: { station, reason: raison, run: par?.run ?? null } });
    }
    avertir(
      `brigade : connexion Max ${desStations()} absente ou expirée (${raison}) — \`claude /login\` sous le compte du service — la cuisine reprend seule dans la minute`,
    );
  };

  // La machine tient-elle un cook de plus ? Ce qui change — elle sature, d'une
  // autre ressource, ou respire — s'écrit au journal ; le reste du temps, la
  // station se tait. Une machine illisible ne dit rien : la station s'en tient
  // à ce qu'elle savait.
  //
  // Elle tient un cook de plus si elle le tient encore une fois comptés ceux
  // qui viennent de partir : la charge est une moyenne sur une minute, et un
  // rail plein partirait d'un bloc avant qu'elle n'en reflète un seul. Cette
  // retenue-là ne s'écrit pas — la machine ne sature pas, la station monte par
  // paliers.
  //
  // La machine est celle de toutes les stations d'ici : `tenues`, ce que
  // chacune sait déjà d'une saturation — les ressources en cause —, et chacune
  // apprend ce qui change : une ressource de plus ou de moins se redit, une
  // valeur qui bouge non.
  let machineIllisible = false;
  const machineRetient = (tenues: Map<string, Ressource[]>): Extract<Retenue, "machine" | "ramp"> | null => {
    const tenue = [...new Set([...tenues.values()].flat())];
    let lue: Machine;
    try {
      lue = machine();
      machineIllisible = false;
    } catch (erreur) {
      if (!machineIllisible) avertir(`brigade : machine illisible, ${noms.length > 1 ? "les stations s'en tiennent à ce qu'elles savaient" : "la station s'en tient à ce qu'elle savait"} — ${message(erreur)}`);
      machineIllisible = true;
      return tenue.length === 0 ? null : "machine";
    }
    const manques = saturations(lue, seuils, tenue);
    if (manques.length === 0) {
      noterPourChacune(
        (station) => ({ type: "station.relieved", payload: { station } }),
        noms.filter((station) => (tenues.get(station) ?? []).length > 0),
      );
      const instant = maintenant().getTime();
      departs = departs.filter((depart) => instant - depart < JEUNE_MS);
      return saturation(reserver(lue, entrees + departs.length), seuils) === null ? null : "ramp";
    }
    const memes = (ressources: readonly Ressource[]) => [...ressources].sort().join() === manques.map(({ resource }) => resource).sort().join();
    const [premier, ...autres] = manques as [Saturation, ...Saturation[]];
    noterPourChacune(
      (station) => ({ type: "station.saturated", payload: { station, ...premier, ...(autres.length > 0 ? { also: autres } : {}) } }),
      noms.filter((station) => !memes(tenues.get(station) ?? [])),
    );
    if (!memes(tenue)) avertir(`brigade : ${lesStations("ne prend plus de ticket", "ne prennent plus de ticket")}, la machine n'en peut plus — ${direSaturations(manques)}`);
    return "machine";
  };

  // Les cooks de tickets qu'une station fait tourner : les tickets qu'elle
  // tient et ses cuisines pas encore défaites — le plus grand des deux : un
  // ticket rendu pendant que son cook tourne ne fait pas une place.
  const cooksDe = (station: string) => Math.max(prisPar(base, station), enCuisineDe(station));

  // Les bornes qu'une station lit avant de prendre un ticket, qu'elle tourne
  // ici ou qu'elle tire son travail : le « stop » du chef, son arrêt de cette
  // station, le disjoncteur, la pause du renommage, la base rouge, sa
  // connexion, son quota, son plafond de cooks. L'arrêt d'une station ne
  // retient que ses prises : ses cooks en cours finissent.
  const borneDe = ({ nom, cooks }: StationDeclaree, etat: ReturnType<typeof etatStation>, garde: ReturnType<typeof etatDesGardeFous>, rouge: boolean, instant: string, enPause: boolean): Retenue | null => {
    if (garde.stoppedAt !== null) return "stopped";
    if (arreteeDepuis(base, nom) !== null) return "station-stopped";
    if (garde.breakerOpenedAt !== null) return "breaker";
    if (enPause) return "paused";
    if (rouge) return "base";
    if (etat?.disconnectedAt) return "disconnected";
    if (etat?.quotaUntil && etat.quotaUntil > instant) return "quota";
    const plafond = plafondDeCooks(etat ?? { maxCooks: cooks, cores: null, cap: null });
    if (plafond !== null && cooksDe(nom) >= plafond) return "cap";
    return null;
  };

  // Ce que la prise peut donner : sur une base rouge, son ticket de réparation
  // en cours, et lui seul — null s'il n'y en a pas ; la cuisine en pause pour
  // le renommage du code, le ticket du renommage, et lui seul — null s'il n'en
  // est pas un. `undefined` : rien ne restreint la prise.
  const seuleAPartir = (): number | null | undefined => {
    if (etatDeLaBase(base)?.outcome === "red") return reparationEnCours(base);
    const pause = pauseAccordee(base);
    return pause === null ? undefined : pause.ticket;
  };

  // Le plafond d'une station ne compte que ses cooks de tickets : un jugement
  // du manager ou une relecture du reviewer ne retient rien. Tout se lit à
  // chaque prise : un plafond baissé n'arrête personne, il retient la suivante.
  // Rend ce qui retient chaque station, ou null si elle peut prendre un
  // ticket. Seuls la connexion, le quota et le plafond se lisent station par
  // station ; le reste les retient toutes ensemble.
  const ceQuiRetient = (): Map<string, Retenue | null> => {
    // Sans station, il n'y a personne à retenir : la machine n'est pas lue.
    if (declarees.length === 0) return new Map();
    const etats = new Map(declarees.map((declaree) => [declaree.nom, etatStation(base, declaree.nom)]));
    // La machine se lit d'abord, quoi qu'il arrive ensuite : ce que `status`
    // en dit ne doit pas dépendre d'une autre borne.
    const machine = machineRetient(new Map([...etats].map(([station, etat]) => [station, etat?.saturatedCauses.map(({ resource }) => resource) ?? []])));
    const garde = etatDesGardeFous(base);
    // Un cook parti d'une base rouge livrerait des gates rouges pour une raison
    // qui n'est pas la sienne : ses renvois se consommeraient pour rien. La
    // pass relit la base ; au vert, la prise reprend d'elle-même. Seule sa
    // réparation en part : la station qui peut la prendre n'est pas retenue
    // par la base — et ne prend qu'elle.
    const rouge = etatDeLaBase(base)?.outcome === "red";
    const seule = seuleAPartir();
    const instant = maintenant().toISOString();
    // Un setup bloqué retient les stations d'ici, celles qui le jouent sur
    // cette machine ; une distante joue le sien sur son poste.
    const sansSetup = setupBloque(base) !== null;
    // Une cause de mise de côté répétée n'arrête pas la cuisine, elle l'amène
    // à un ticket à la fois : celui qui sonde si la cause a changé — la valeur
    // d'un secret posée, GitHub revenu n'ont aucun commit à attendre.
    const sansCause = miseDeCoteBloquee(base) !== null && rail.tickets().some((ticket) => ticket.state === "taken");
    // En pause pour le renommage du code, seul le ticket du renommage part —
    // la station qui peut le prendre n'est pas retenue par la pause.
    const enPause = pauseAccordee(base) !== null;
    const retient = (declaree: StationDeclaree): Retenue | null => {
      const reparable = typeof seule === "number" && rail.servables(enCuisine, preneuses([declaree.nom]), seule) > 0;
      const borne = borneDe(declaree, etats.get(declaree.nom) ?? null, garde, rouge && !reparable, instant, enPause && !rouge && !reparable);
      if (borne !== null) return borne;
      if (sansSetup) return "setup";
      if (sansCause) return "aside";
      if (entrees >= entreesMax) return "setups";
      return machine;
    };
    return new Map(declarees.map((declaree) => [declaree.nom, retient(declaree)]));
  };
  // Ce qui retient une station distante de prendre le ticket qu'elle réclame :
  // les bornes de toute station. L'entrée et la machine sont celles d'ici —
  // son worktree et son cook pèsent sur son poste, pas sur la box.
  const ceQuiRetientLaDistante = (declaree: StationDeclaree): Retenue | null =>
    borneDe(declaree, etatStation(base, declaree.nom), etatDesGardeFous(base), etatDeLaBase(base)?.outcome === "red", maintenant().toISOString(), pauseAccordee(base) !== null);

  // La box sature : aucune de ses stations n'a de place pour un cook de plus —
  // chacune est à son plafond, ou la machine n'en peut plus, lue à l'instant.
  // C'est alors, et alors seulement, qu'un ticket ordinaire part sur une
  // distante qui les prend (le Mac du chef) : tant qu'elle a de la place, la
  // box garde les siens. Retenue pour une autre raison — le « stop », le
  // quota, sa connexion, un setup —, elle ne sature pas : ce qui la retient
  // retient aussi la distante, ou se lève sans qu'un ticket change de
  // machine. Sans station d'ici, personne d'autre ne cuirait un ticket
  // ordinaire. Une station d'ici que le chef a arrêtée n'a pas de place : la
  // cuisine du projet n'y prend plus rien, elle va où il la laisse.
  const boxSaturee = (): boolean => {
    const retenues = ceQuiRetient();
    return declarees.every((declaree) => {
      const retenue = retenues.get(declaree.nom);
      return retenue === "cap" || retenue === "machine" || retenue === "station-stopped" || (etatStation(base, declaree.nom)?.saturatedCauses.length ?? 0) > 0;
    });
  };

  // Un ticket qui ne part pas n'est jamais un mystère : quand la station se
  // retient alors qu'un ticket pourrait partir, elle écrit pourquoi — quand la
  // raison change, pas à chaque regard. Sans ticket derrière, il n'y a rien à
  // dire : une station au plafond devant un rail vide ne retient personne — ni
  // devant des tickets qu'elle ne peut pas cuisiner, faute de fournir ce qu'ils
  // demandent.
  const direCeQuiRetient = (station: string, retenue: Retenue | null) => {
    const raison = retenue !== null && rail.servables(enCuisine, preneuses([station])) > 0 ? retenue : null;
    if (raison === (etatStation(base, station)?.heldReason ?? null)) return;
    noter(station, null, raison === null ? { type: "station.released", payload: { station } } : { type: "station.held", payload: { station, reason: raison } });
  };

  // --- L'arbitre entre projets. Il arbitre le projet, pas ses stations : il
  // est consulté en dernier, les bornes de la station passées, pour chaque
  // ticket qu'elle s'apprête à prendre ; et le projet lui redit son état chaque
  // fois qu'il change, et à chaque tick — c'est ce qui remplit un arbitre qui
  // revient.
  const arbitre = options.arbitre ?? null;
  // La place en main : accordée par l'arbitre, ou prise sans lui parce qu'il
  // ne répond pas et qu'aucun cook ne tourne.
  let droit: "arbitre" | "seul" | null = null;
  // Une demande de place est partie, et sa réponse n'est pas revenue.
  let demandeEnVol = false;
  let degrade = noms.some((station) => etatStation(base, station)?.unarbitratedAt != null);
  // Les tickets en cuisine partis sans arbitre.
  const nonArbitres = new Set<number>();
  // Le dernier état dit à l'arbitre, et s'il faut le redire quand même.
  let dernierMot: string | null = null;
  let aRedire = false;
  // Les échanges partent un par un, dans l'ordre : l'arbitre ne garde que le
  // dernier mot.
  let echanges: Promise<void> = Promise.resolve();

  // Les cooks de tickets que le projet fait tourner, comptés comme au plafond.
  // Ceux d'une station distante n'en sont pas : l'arbitre partage cette
  // machine, et ils tournent sur une autre.
  const cooksTenus = () => Math.max(noms.reduce((somme, station) => somme + prisPar(base, station), 0), [...cuisinePar.values()].filter((station) => noms.includes(station)).length);
  // Ce qui laisse une station demander une place : rien ne la retient, ou
  // seulement un pas d'allure.
  const dAllure = (retenue: Retenue | null) => retenue === null || retenue === "machine" || retenue === "ramp" || retenue === "setups";
  // Le projet ne demande une place que s'il pourrait la prendre : retenu par
  // une borne que l'arbitre ne lève pas — le « stop », le disjoncteur, la base
  // rouge, la connexion, le quota, son propre plafond, un setup bloqué —, ses tickets qui
  // attendent ne réservent rien chez les autres. La machine a sa règle ; la
  // montée progressive et le plafond de setups ne sont qu'un pas d'allure, la
  // demande suit dans les secondes. `retenues` : ce qui retient chacune de ses
  // stations — il suffit qu'une seule puisse prendre un ticket qu'elle peut
  // cuisiner : celui que seule une station retenue fournirait ne demande rien.
  const motPourLArbitre = (retenues: ReadonlyMap<string, Retenue | null>): Mot => {
    const allantes = [...retenues].filter(([, retenue]) => dAllure(retenue));
    const pas = allantes[0]?.[1];
    const demande = allantes.length > 0 && rail.servables(enCuisine, preneuses(allantes.map(([station]) => station))) > 0;
    const consommation = noms
      .map((station) => consommationDesCooks(base, station, maintenant()))
      .reduce((somme, { jour, semaine }) => ({ jour: somme.jour + jour, semaine: somme.semaine + semaine }), { jour: 0, semaine: 0 });
    return { cooks: cooksTenus(), demande, machine: demande && pas === "machine", nonArbitres: nonArbitres.size, consommation };
  };
  // `suite` reçoit la réponse, ou null si l'arbitre n'a pas répondu. L'entrée
  // en mode dégradé et le retour s'écrivent une fois chacun.
  const echanger = (joint: Arbitrage, dit: Mot & { veut: boolean }, suite: (reponse: Reponse | null) => void) => {
    echanges = echanges
      .then(async () => {
        if (arrete) return;
        let reponse: Reponse | null = null;
        let panne: unknown;
        try {
          reponse = await joint.echanger(projet, dit);
        } catch (erreur) {
          panne = erreur;
        }
        if (arrete) return;
        // La suite se joue quoi qu'il arrive à ce qui s'écrit ici : une demande
        // dont la réponse se perdrait retiendrait la station jusqu'au redémarrage.
        try {
          if (reponse === null && !degrade) {
            degrade = true;
            const reason = panne instanceof ArbitreInjoignable ? panne.motif : message(panne);
            noterPourChacune((station) => ({ type: "station.unarbitrated", payload: { station, reason } }));
            avertir(`brigade : ${message(panne)} — mode dégradé : ${lesStations("ne lance plus", "ne lancent plus")} qu'un cook à la fois, sans arbitrage, jusqu'à son retour`);
          } else if (reponse !== null && degrade) {
            degrade = false;
            noterPourChacune((station) => ({ type: "station.arbitrated", payload: { station } }));
            avertir(`brigade : l'arbitre répond à nouveau — fin du mode dégradé ${desStations()}`);
          }
        } finally {
          suite(reponse);
        }
      })
      .catch((erreur) => {
        // Rien ne doit rompre la file : l'échange suivant en dépend.
        try {
          if (!arrete) avertir(`brigade : ${lesStations("a buté", "ont buté")} en parlant à l'arbitre — ${message(erreur)}`);
        } catch {}
      });
  };
  // Le projet a-t-il le droit de lancer un cook de plus ? Null : oui, la
  // place est en main. Sinon la demande part — une à la fois —, et sa réponse
  // relance le service ou dit ce qui retient. `libres` : les stations qui
  // prendraient un ticket si la place était là — ce sont elles qu'un refus
  // retient.
  const placeEnMain = (joint: Arbitrage, libres: string[]): "attente" | null => {
    if (droit === "arbitre" || (droit === "seul" && cooksTenus() === 0)) return null;
    droit = null;
    if (demandeEnVol) return "attente";
    demandeEnVol = true;
    const dit = motPourLArbitre(new Map(libres.map((station) => [station, null])));
    dernierMot = JSON.stringify(dit);
    echanger(joint, { ...dit, veut: true }, (reponse) => {
      demandeEnVol = false;
      if (reponse?.accorde) droit = "arbitre";
      // Sans arbitre, au plus un cook : celui-ci, si aucun ne tourne.
      else if (reponse === null && cooksTenus() === 0) droit = "seul";
      else {
        for (const station of libres) direCeQuiRetient(station, reponse === null ? "unarbitrated" : "arbiter");
        return;
      }
      servir();
    });
    return "attente";
  };
  const redire = (joint: Arbitrage, retenues: ReadonlyMap<string, Retenue | null>) => {
    const dit = motPourLArbitre(retenues);
    const cle = JSON.stringify(dit);
    if (!aRedire && cle === dernierMot) return;
    aRedire = false;
    dernierMot = cle;
    echanger(joint, { ...dit, veut: false }, () => {});
  };
  // Un projet qui n'a plus d'arbitre n'est plus en mode dégradé.
  if (arbitre === null && degrade) {
    degrade = false;
    noterPourChacune(
      (station) => ({ type: "station.arbitrated", payload: { station } }),
      noms.filter((station) => etatStation(base, station)?.unarbitratedAt != null),
    );
  }

  // Ce qui manque à un ticket pour partir, tel que son 86 le porterait : une
  // capacité que sa fiche demande et qu'aucune station déclarée ne fournit.
  const sansStation = (ticket: TicketRail) => manque(requises(ticket.card), offres);

  // Un ticket refusé revient en attente dès que ce qui lui manquait est là :
  // son calibrage, une fiche lisible, une station qui fournit ce qu'il demande.
  // Celui dont le manque a seulement changé revient aussi : il est écarté de
  // nouveau juste après, et dit ce qui manque maintenant.
  const rendreLesCorriges = () => {
    for (const ticket of rail.tickets()) {
      if (ticket.state !== "86") continue;
      if (ticket.reason === SANS_CALIBRAGE && complet(ticket)) geste(() => rail.rendre(ticket.ticket, CALIBRE));
      if (ticket.reason === FICHE_ILLISIBLE && illisible(ticket.card) === null) geste(() => rail.rendre(ticket.ticket, FICHE_LISIBLE));
      if (manqueDuMotif(ticket.reason) !== null) {
        const absent = sansStation(ticket);
        if (absent === null || motifSansStation(absent) !== ticket.reason) geste(() => rail.rendre(ticket.ticket, CAPACITES_RELUES));
      }
      if (absentesDuMotif(ticket.reason) !== null) {
        const absentes = sansStationPresente(ticket);
        if (absentes === null || motifStationAbsente(absentes) !== ticket.reason) geste(() => rail.rendre(ticket.ticket, STATION_REVENUE));
      }
    }
  };

  // Les stations absentes qu'un ticket attend, ou null s'il n'en attend pas :
  // toutes celles qui fournissent ce qu'il demande sont distantes, et aucune ne
  // s'est manifestée récemment. Une seule station d'ici qui peut le cuisiner,
  // ou une distante présente, et il n'attend personne.
  // Un ticket ordinaire n'attend pas une distante qui ne prend pas les tickets
  // ordinaires.
  const sansStationPresente = (ticket: TicketRail): string[] | null => {
    const demande = requises(ticket.card);
    const capables = toutes.filter((declaree) => fournitTout(declaree.fournit, demande) && (demande.length > 0 || !declaree.distante || declaree.ordinaires === true));
    if (capables.length === 0) return null;
    const absentes = distantes.absentes();
    return capables.every((declaree) => absentes.includes(declaree.nom)) ? capables.map((declaree) => declaree.nom) : null;
  };

  // Un ticket que seule une station distante absente peut cuisiner ne part
  // pas : il est 86, sans cook, et dit laquelle il attend. Ce n'est pas une
  // panne — son poste est éteint, ou ailleurs — et les autres partent : lui ne
  // tient ni place ni zone. Sans heure de retour : `rendreLesCorriges` le rend
  // dès qu'elle se manifeste. Son issue ne l'apprend qu'une fois : une station
  // qui va et vient n'y écrit pas à chaque fois.
  const ecarterSansPresence = () => {
    if (distantes.absentes().length === 0) return;
    for (const ticket of rail.tickets()) {
      if (ticket.state !== "waiting" || enCuisine.has(ticket.ticket)) continue;
      const absentes = sansStationPresente(ticket);
      if (absentes === null) continue;
      const deja = journal.duTicket(ticket.ticket).some((evenement) => evenement.type === "ticket.86" && evenement.payload.reason.startsWith(STATION_ABSENTE));
      if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: motifStationAbsente(absentes) })) || deja) continue;
      const dit = direStationAbsente(absentes);
      void commenter(
        ticket.ticket,
        [
          `**${dit[0]?.toUpperCase()}${dit.slice(1)}.** Aucun cook n'est lancé : ${absentes.length > 1 ? "seules ces stations fournissent" : "seule cette station fournit"} ce que ce ticket demande, et ${absentes.length > 1 ? "elles tournent" : "elle tourne"} ailleurs que sur la box — la box ne joint jamais une station distante, c'est la station qui vient tirer son travail.`,
          "",
          "Ce n'est pas une panne : le ticket est 86, et les autres partent sans lui. Il repart seul dès que la station se manifeste — ce commentaire n'est pas reposé à chacune de ses absences.",
        ].join("\n"),
      );
    }
  };

  // Un ticket qui demande ce qu'aucune station déclarée ne fournit ne part
  // pas : il est 86 sur le rail, sans qu'aucune station ne le prenne ni
  // qu'aucun cook ne soit lancé, et son issue dit ce qui manque et le geste qui
  // le fournirait. Les autres partent : lui ne tient ni place ni zone. Sans
  // heure de retour — les stations ne changent qu'au redémarrage, la fiche
  // qu'au sondage, et `rendreLesCorriges` le rend dès que l'un des deux suffit.
  // Un ticket dont la cuisine n'est pas défaite attend qu'elle le soit.
  const ecarterSansStation = () => {
    for (const ticket of rail.tickets()) {
      if (ticket.state !== "waiting" || enCuisine.has(ticket.ticket)) continue;
      const absent = sansStation(ticket);
      if (absent === null) continue;
      if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: motifSansStation(absent) }))) continue;
      const dit = direManque(absent);
      void commenter(
        ticket.ticket,
        [
          `**${dit[0]?.toUpperCase()}${dit.slice(1)}.** Aucun cook n'est lancé : la fiche de ce ticket le demande (ligne \`${CLE_DES_CAPACITES}\`), et un ticket ne part que dans une station qui fournit ce qu'il demande.`,
          "",
          toutes.length === 0
            ? "Ce projet ne déclare aucune station."
            : `Stations déclarées : ${toutes.map((declaree) => `\`${declaree.nom}\` (${declaree.fournit.join(", ")})`).join(" ; ")}.`,
          "",
          `Pour qu'il parte : ${gesteDeCapacite(absent)}. Le ticket est 86, et les autres partent sans lui. Une capacité dit ce que la machine sait faire : en demander une, ou la déclarer, n'autorise rien.`,
        ].join("\n"),
      );
    }
  };

  const refuser = async (station: string, ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: SANS_CALIBRAGE, station }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${station}\` — ticket non calibré.** Aucun cook n'est lancé sans modèle ni effort explicites.`,
        "",
        `Il manque : \`${manquant(ticket)}\` — un seul label par dimension. Le ticket est 86 ; il reviendra en attente tout seul une fois posé.`,
      ].join("\n"),
    );
  };

  const refuserLaFiche = async (station: string, ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: FICHE_ILLISIBLE, station }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${station}\` — fiche du ticket illisible.** Aucun cook n'est lancé sur une fiche que le runtime ne comprend pas.`,
        "",
        ...(ticket.card?.problems ?? []).map((probleme) => `- ${probleme}`),
        "",
        `La fiche est le commentaire de cette issue marqué \`${MARQUEUR}\` — le marqueur se voit en l'éditant. Corrige-la sur place : le ticket est 86 ; il reviendra en attente tout seul une fois la fiche lisible.`,
      ].join("\n"),
    );
  };

  // Met le ticket de côté (86) pour une cause qui ne tient pas à lui — le
  // worktree, GitHub, les secrets —, et la compte au projet : la même cause
  // deux fois de suite, sans cook parti entre les deux, bloque le projet : le
  // chef est alerté, une fois, avec la cause et le geste, et la station ne
  // reprend plus qu'un ticket à la fois, à son heure de retour, pour sonder.
  // Le blocage tombe seul : un cook part (la cause est levée), une autre
  // cause se présente (c'est elle qui compte), ou la branche d'intégration
  // bouge. Rend faux si le ticket n'est plus à la station.
  // `echec` : ce qui l'a fait échouer, dans les mots de l'outil, et l'accès au
  // dépôt refusé, s'il l'est — le journal les porte avec le 86.
  const ecarter = (station: string, numero: number, motif: string, retour?: Date, echec: { pourquoi?: string; acces?: AccesRefuse } = {}): boolean =>
    base.transaction(() => {
      if (!geste(() => rail.quatreVingtSix(numero, { motif, retour, station, ...echec }))) return false;
      const cause = CAUSES_DU_PROJET[motif];
      if (cause === undefined) return true;
      const precedente = derniereMiseDeCote(base);
      const bloquee = miseDeCoteBloquee(base);
      const vue = depot.vue();
      noter(station, numero, { type: "aside.failed", payload: { station, reason: motif } });
      if (bloquee !== null && bloquee.reason !== motif) {
        noter(station, null, { type: "aside.unblocked", payload: { station, base: vue, why: "cause" } });
        for (const ticket of rail.tickets()) {
          if (ticket.ticket !== numero && ticket.state === "86" && ticket.reason === bloquee.reason) geste(() => rail.rendre(ticket.ticket, MISE_DE_COTE_LEVEE));
        }
      } else if (bloquee === null && precedente === motif) {
        noter(station, numero, { type: "aside.blocked", payload: { station, reason: motif, base: vue } });
        avertir(`brigade : ${cause.texte}, deux fois de suite — un seul ticket est repris à la fois pour voir si elle a changé : ${cause.geste}`);
      }
      return true;
    });

  // Les secrets que le dépôt déclare ne peuvent pas être donnés : aucun cook
  // n'est lancé, et le ticket est reproposé dix minutes plus tard — une valeur
  // posée entre-temps suffit, sans rien redémarrer. Le chef l'apprend sur
  // l'issue, une fois : le commentaire n'est reposé que si les problèmes
  // changent, ou si un cook est parti depuis.
  const refuserSansSecrets = async (station: string, numero: number, problemes: string[]) => {
    const neuf = base.transaction(() => {
      const dernier = journal.duTicket(numero).findLast((evenement) => evenement.type === "secrets.unavailable" || evenement.type === "cook.launched");
      const dits = dernier?.type === "secrets.unavailable" ? dernier.payload.problems : null;
      if (!ecarter(station, numero, SECRETS_INDISPONIBLES, new Date(maintenant().getTime() + REPLI_WORKTREE_MS))) return false;
      if (JSON.stringify(dits) === JSON.stringify(problemes)) return false;
      noter(station, numero, { type: "secrets.unavailable", payload: { station, problems: problemes } });
      return true;
    });
    if (!neuf) return;
    avertir(`brigade : secrets du projet indisponibles pour le ticket #${numero} — aucun cook n'est lancé\n${problemes.join("\n")}`);
    await commenter(
      numero,
      [
        `**Station \`${station}\` — secrets du projet indisponibles.** Aucun cook n'est lancé sans les secrets que le dépôt déclare (\`${DECLARATION}\`).`,
        "",
        ...problemes.map((probleme) => `- ${probleme}`),
        "",
        "Les valeurs vivent sur la machine, dans le fichier que nomme `BRIGADE_SECRETS_FILE` (`NOM=valeur`, une par ligne, `chmod 600`) ; il est relu à chaque essai, rien n'est à redémarrer. Le ticket est 86 ; il est reproposé toutes les dix minutes, et son cook partira dès que plus rien ne manque.",
      ].join("\n"),
    );
  };

  // Le setup du worktree a échoué : aucun cook n'est lancé, et le ticket est
  // reproposé dix minutes plus tard. Le chef l'apprend sur l'issue comme pour
  // des secrets qui manquent : une fois, et de nouveau si le motif change, si
  // un hôte encore jamais nommé est refusé, ou si un cook est parti depuis. `hotes` : ce que la porte a refusé pendant
  // que le setup tournait — à lui ou à un voisin, la porte ne sait pas à qui.
  //
  // Un échec qui répète le précédent du projet — même motif, aucun hôte
  // refusé de plus — bloque le setup du projet : plus aucun n'est lancé, pour
  // aucun ticket, tant que la branche d'intégration reste sur `vue`, d'où ce
  // worktree est parti. Réessayer ne ferait que redire la même chose toutes
  // les dix minutes, ticket par ticket ; ce qui lève la cause — un hôte
  // déclaré, un setup corrigé — arrive par la base.
  const refuserSansSetup = async (station: string, numero: number, echec: { pourquoi: string; sortie: string; masques: number; hotes: string[]; vue: string }) => {
    const retour = new Date(maintenant().getTime() + REPLI_WORKTREE_MS);
    const cause = { why: echec.pourquoi, hosts: echec.hotes };
    const issue = base.transaction((): { neuf: boolean; bloque: boolean } => {
      const bloque = setupBloque(base);
      // Un setup parti avant le blocage, qui échoue comme celui qui l'a
      // bloqué : rien de neuf à en dire, et son ticket attend la base.
      if (bloque !== null && memeCause(bloque, cause)) {
        geste(() => rail.rendre(numero, SETUP_BLOQUE, station));
        return { neuf: false, bloque: false };
      }
      // Ce que l'issue sait déjà : le dernier motif dit, et tous les hôtes
      // nommés depuis le dernier cook. Les hôtes ne se comparent pas d'un
      // essai à l'autre — la porte ne redit pas un hôte avant dix minutes, à
      // qui que ce soit : seul un hôte jamais nommé ici est une nouvelle.
      const essais = journal.duTicket(numero);
      const dits = essais.slice(essais.findLastIndex((evenement) => evenement.type === "cook.launched") + 1).flatMap((evenement) => (evenement.type === "setup.failed" ? [evenement.payload] : []));
      const nommes = new Set(dits.flatMap((dit) => dit.hosts));
      const precedent = dernierEchecDeSetup(base);
      if (!geste(() => rail.quatreVingtSix(numero, { motif: SETUP_EN_ECHEC, retour, station }))) return { neuf: false, bloque: false };
      noter(station, numero, { type: "setup.failed", payload: { station, why: echec.pourquoi, hosts: echec.hotes } });
      const bloquer = bloque === null && precedent !== null && memeCause(precedent, cause);
      if (bloquer) {
        const hosts = [...new Set([...precedent.hosts, ...echec.hotes])].sort();
        noter(station, numero, { type: "setup.blocked", payload: { station, why: echec.pourquoi, hosts, base: echec.vue } });
      }
      return { neuf: dits.at(-1)?.why !== echec.pourquoi || !echec.hotes.every((hote) => nommes.has(hote)), bloque: bloquer };
    });
    if (issue.bloque) {
      avertir(
        `brigade : le setup du projet échoue deux fois de suite à l'identique (\`${SCRIPT_SETUP}\`, ${echec.pourquoi}) — plus aucun setup n'est lancé, pour aucun ticket, tant que ${options.base} ne bouge pas`,
      );
    }
    if (!issue.neuf && !issue.bloque) return;
    const refus = echec.hotes.map((hote) => `\`${hote}\``).join(", ");
    await commenter(
      numero,
      [
        ...(issue.neuf
          ? [
              `**Station \`${station}\` — setup du worktree en échec.** Aucun cook n'est lancé dans un worktree qui n'est pas prêt : \`${SCRIPT_SETUP}\`, ${echec.pourquoi}.`,
              ...(echec.hotes.length === 0
                ? []
                : ["", `Pendant ce setup, la porte du projet a refusé ${refus}. S'il en a besoin : une ligne par hôte dans \`${DECLARATION_RESEAU}\`, mergée sur la branche d'intégration — la porte l'ouvre sans rien redémarrer.`]),
              ...(echec.sortie === "" ? [] : ["", "La fin de ce qu'il a dit :", "", CLOTURE_DE_SORTIE, echec.sortie.replaceAll(CLOTURE_DE_SORTIE, "'''"), CLOTURE_DE_SORTIE]),
              ...(echec.masques ? ["", direMasquage(echec.masques, "ce que ce setup a dit")] : []),
              "",
            ]
          : []),
        issue.bloque
          ? `**Setup du projet bloqué.** Ce setup vient d'échouer comme le précédent du projet (${echec.pourquoi}) : le réessayer, ticket par ticket, redirait la même chose. Plus aucun setup n'est lancé pour ce projet tant que \`${options.base}\` ne bouge pas — un hôte déclaré dans \`${DECLARATION_RESEAU}\`, un setup corrigé, mergés : les setups reprennent d'eux-mêmes, et ce ticket avec.`
          : `Le ticket est 86 ; il revient en attente à ${retour.toISOString()}, puis toutes les dix minutes tant que son setup échoue — son cook partira dès qu'il passe. Ce commentaire n'est reposé que si la cause change ; et si le même échec se répète, plus aucun setup n'est lancé pour le projet tant que la branche d'intégration ne bouge pas.`,
      ].join("\n"),
    );
  };

  // Sous un setup bloqué, rien ne rapatrie plus la base : aucun worktree n'est
  // préparé. Au tick, la station va la voir — c'est aussi ce qui fait relire à
  // la porte les hôtes que le projet déclare — et, partie d'où le blocage
  // l'avait laissée, les setups reprennent : les tickets 86 sur un setup en
  // échec reviennent en attente sans attendre leur heure. Une base qui ne se
  // rapatrie pas est retentée au tick suivant.
  let relue = false;
  const relireLaBase = async () => {
    const bloque = setupBloque(base);
    const ecartee = miseDeCoteBloquee(base);
    if ((bloque === null && ecartee === null) || relue || arrete) return;
    relue = true;
    try {
      const vue = await depot.rapatrier();
      if (arrete) return;
      let leve = false;
      if (bloque !== null && vue !== bloque.base) {
        leve = base.transaction(() => {
          if (setupBloque(base)?.base !== bloque.base) return false;
          const station = bloque.station ?? noms[0] ?? "";
          noter(station, null, { type: "setup.unblocked", payload: { station, base: vue } });
          for (const ticket of rail.tickets()) {
            if (ticket.state === "86" && ticket.reason === SETUP_EN_ECHEC) geste(() => rail.rendre(ticket.ticket, SETUP_DEBLOQUE));
          }
          return true;
        });
        if (leve) avertir(`brigade : ${options.base} a bougé depuis le blocage du setup du projet — les setups reprennent`);
      }
      if (ecartee !== null && vue !== ecartee.base) {
        const leveeCote = base.transaction(() => {
          if (miseDeCoteBloquee(base)?.base !== ecartee.base) return false;
          const station = ecartee.station ?? noms[0] ?? "";
          noter(station, null, { type: "aside.unblocked", payload: { station, base: vue, why: "base" } });
          for (const ticket of rail.tickets()) {
            if (ticket.state === "86" && ticket.reason === ecartee.reason) geste(() => rail.rendre(ticket.ticket, MISE_DE_COTE_LEVEE));
          }
          return true;
        });
        if (leveeCote) avertir(`brigade : ${options.base} a bougé depuis le blocage du projet (${CAUSES_DU_PROJET[ecartee.reason]?.texte ?? ecartee.reason}) — les prises reprennent`);
        leve ||= leveeCote;
      }
      if (leve) servir();
    } catch {
      // Rapatrier a buté : c'est la pass qui dit une base qui ne vient pas.
    } finally {
      relue = false;
    }
  };

  const zoneALaPrise = (numero: number): string[] => zonePrise(journal.duTicket(numero));

  // Confronte une livraison à la zone de son ticket : ce qu'elle écrit
  // ailleurs, et une fiche qui a changé pendant la cuisson, vont au journal.
  // Rend ce qu'il y a à en dire sur le ticket — rien, le plus souvent. Un
  // signal, jamais un arrêt : un ticket pris sans zone ne possède rien, et
  // n'est pas signalé.
  const signalerHorsZone = (station: string, numero: number, run: string, branche: string): string[] => {
    const zone = zoneALaPrise(numero);
    if (zone.length === 0) return [];
    let livres: string[];
    try {
      livres = depot.changes(branche);
    } catch (erreur) {
      avertir(`brigade : livraison du ticket #${numero} illisible, sa zone n'est pas vérifiée — ${message(erreur)}`);
      return [];
    }
    const autres = lireRail(base).filter((autre) => autre.ticket !== numero && autre.card !== null && illisible(autre.card) === null);
    const files = horsZone(zone, livres, communsDuRail(base)).map((path) => ({
      path,
      owners: autres.filter((autre) => autre.card?.zone.some((chemin) => possede(chemin, path))).map((autre) => autre.ticket),
    }));
    const aujourdhui = ticketDuRail(base, numero)?.card?.zone ?? [];
    const cardChanged = JSON.stringify(aujourdhui) !== JSON.stringify(zone);
    if (files.length === 0 && !cardChanged) return [];
    noter(station, numero, { type: "cook.out-of-zone", payload: { run, zone, files, cardChanged } });
    return [
      ...(files.length === 0
        ? []
        : [
            "",
            `**Hors zone — ${pluriel(files.length, "fichier")} écrit${files.length > 1 ? "s" : ""} hors de la zone du ticket** (zone du ticket : ${chemins(zone)}) :`,
            ...files.slice(0, HORS_ZONE_MAX).map(({ path, owners }) => `- \`${path}\`${owners.length === 0 ? "" : ` — dans la zone de ${owners.map((owner) => `#${owner}`).join(", ")}`}`),
            ...(files.length > HORS_ZONE_MAX ? [`- … et ${files.length - HORS_ZONE_MAX} de plus, tous au journal`] : []),
            "",
            "Rien n'est arrêté : la pass juge cette livraison comme une autre. C'est le signe d'un découpage à revoir — si l'écart est légitime, élargis la zone dans la fiche du ticket.",
          ]),
      ...(cardChanged
        ? [
            "",
            `**La fiche a changé pendant la cuisson** — zone du ticket à la prise : ${chemins(zone)} ; aujourd'hui : ${chemins(aujourdhui)}. La livraison est confrontée à celle de la prise : un cook peut éditer la fiche de son propre ticket.`,
          ]
        : []),
    ];
  };

  // Les captures d'une livraison poussée, si son ticket est d'interface
  // (captures.ts) : sa zone à la prise touche la vue de l'app, ou son issue
  // porte `cook:design` — relue ici, le rail ne garde pas les labels. Nulles
  // pour un autre ticket, et pour une livraison qu'on ne sait pas lire : rien
  // n'en est dit plutôt qu'un manque inventé. Ne lève pas.
  const capturesDe = async (numero: number, branche: string): Promise<Captures | null> => {
    const zone = zoneALaPrise(numero);
    let labels: string[] | null = null;
    if (!estDInterface({ zone, labels })) {
      try {
        labels = (await github.issue(numero))?.labels ?? null;
      } catch (erreur) {
        avertir(`brigade : labels du ticket #${numero} illisibles, ses captures ne sont pas cherchées — ${message(erreur)}`);
      }
    }
    if (!estDInterface({ zone, labels })) return null;
    try {
      return { sha: depot.tete(branche), screens: capturesLivrees(numero, depot.changes(branche)) };
    } catch (erreur) {
      avertir(`brigade : livraison du ticket #${numero} illisible, ses captures ne sont pas cherchées — ${message(erreur)}`);
      return null;
    }
  };
  const montrerCaptures = (numero: number, captures: Captures | null): string[] => (captures === null ? [] : ["", ...direCaptures(options.depotGitHub, numero, captures)]);

  // Une livraison n'est regardée que tant que son ticket l'attend : servi, ou
  // sorti du rail, plus personne ne l'ouvrira.
  const attendue = (numero: number): boolean => {
    const ticket = ticketDuRail(base, numero);
    return ticket !== null && ticket.state !== "served";
  };

  // Sert ce qu'un cook vient de livrer, si c'est une livraison poussée et
  // qu'elle touche l'interface du projet. Rend vrai si un serveur tient
  // maintenant son worktree — ou, pour une app qui ne s'ouvre pas dans un
  // navigateur, si son worktree est tenu pour qu'on l'y lance. Ne lève pas : une livraison qu'on ne sait pas
  // servir reste une livraison. L'écran à regarder se lit dans ce que le cook
  // a livré, tel que le corps de sa PR le porte.
  const servirLaLivraison = (station: string, livraison: Omit<Livraison, "changes" | "corps">, fin: FinGardee, conclusion: Conclusion | null): boolean => {
    if (fin.outcome !== "ok" || conclusion === null || conclusion.sansCommit) return false;
    try {
      if (!attendue(livraison.ticket)) return false;
      const { deliverable, summary } = rendre(conclusion.lecture.message);
      return serveurs.servir(station, { ...livraison, changes: depot.changes(livraison.branche), corps: deliverable ?? summary });
    } catch (erreur) {
      avertir(`brigade : livraison du ticket #${livraison.ticket} non servie — ${message(erreur)}`);
      return false;
    }
  };

  // Le serveur d'un ticket servi, ou sorti du rail, n'a plus rien à montrer :
  // il s'arrête, et son worktree part. Un serveur dont le worktree a disparu
  // sans lui s'arrête aussi : rien n'y est plus servi, et il ne reste pas
  // listé comme vivant.
  const eteindreLesServeurs = () => {
    for (const numero of serveurs.orphelins()) void serveurs.arreter(numero, "orphaned");
    for (const numero of serveurs.tenus()) {
      if (!attendue(numero)) void serveurs.arreter(numero, ticketDuRail(base, numero) === null ? "left" : "served");
    }
  };

  // Raconte la fin d'un cook : au rail, au journal, puis sur le ticket.
  const conclure = async (
    station: string,
    ticket: TicketRail,
    calibrage: Calibrage,
    run: string,
    branche: string,
    fin: FinGardee,
    conclusion: Conclusion | null,
    reprise: Reprise | null,
  ) => {
    const numero = ticket.ticket;
    // Le cook d'une station distante n'a rien laissé ici : ni worktree, ni
    // branche que la station d'ici aurait poussée ou retenue.
    const distante = estDistante(station);
    const rendu = rendre(conclusion?.lecture.message ?? null, conclusion?.lecture.jetonsDuMessage ?? null);
    const compteRendu = rendu.summary;
    // Ce que sa branche porte sur l'origine, s'il n'a rien livré : le cook
    // suivant en repart (`travail-conserve.ts`).
    const conserve = conclusion?.conserve;
    const rapporter = (ending: FinDeCook, reason: string | null, pr: string | null, captures: Captures | null = null) =>
      noter(station, numero, {
        type: "cook.reported",
        payload: { run, ending, reason, summary: compteRendu, deliverable: rendu.deliverable, ...(rendu.retro === null ? {} : { retro: rendu.retro }), ...(rendu.retroTokens === null ? {} : { retroTokens: rendu.retroTokens }), branch: branche, pr, ...(captures === null ? {} : { captures }), ...(ending === "done" || conserve === undefined ? {} : { kept: conserve }) },
      });
    const direConserve = (n: number) =>
      `Ce que la branche \`${branche}\` porte sur l'origine — ${pluriel(n, "commit")} en plus de \`${options.base}\` — est conservé : le cook suivant en repart, sur la box ou sur une station distante, au lieu de recommencer de zéro.`;
    // Le ticket a quitté le rail pendant la cuisson : plus rien ne suivra ce
    // que ce cook laisse, et c'est ici que le chef l'apprend.
    const parti = () => ticketDuRail(base, numero) === null;

    switch (fin.outcome) {
      // Le chef a dit « stop », ou le runtime s'en va : rien à ajouter. Un cook
      // arrêté parce que son ticket a quitté le rail, si.
      case "stop":
        if (!parti()) return;
        await commenter(
          numero,
          [
            entete(station, "arrêté : le ticket a quitté le rail", calibrage, fin),
            distante
              ? `La box ne reçoit plus rien de ce cook, et aucun ne repartira : le ticket n'est plus sur le rail. \`${station}\` l'apprend à sa demande suivante, et arrête le sien ; ce qu'il avait écrit reste chez elle, branche \`${branche}\`.`
              : `Rien n'est poussé, et aucun cook ne repartira : le ticket n'est plus sur le rail. Son worktree est retiré ; ce que ce cook avait écrit, commité ou non, est sur la branche \`${branche}\` du clone de la station.`,
          ].join("\n"),
        );
        return;
      case "interrupted":
        return;
      case "ok": {
        geste(() => rail.envoyerEnPass(numero, station));
        // Sans diff, il n'y a ni branche poussée ni PR : la pass fait relire
        // le compte-rendu.
        const sansDiff = conclusion?.raison === SANS_DIFF;
        const sansCommit = conclusion?.sansCommit === true;
        // Un renvoi livre sur la PR de la livraison qu'il corrige.
        let pr: string | null = reprise?.pr ?? null;
        let sansPR = "";
        // Une livraison d'interface montre ses captures, sur la PR et sur le ticket.
        const captures = sansCommit || sansDiff || parti() ? null : await capturesDe(numero, branche);
        const montrees = montrerCaptures(numero, captures);
        try {
          if (!sansCommit && !parti()) {
            pr ??= await github.ouvrirPR({
              branche,
              base: options.base,
              titre: `#${numero} — ${ticket.title}`,
              corps: corpsDePR(station, numero, calibrage, rendu.deliverable ?? compteRendu, montrees),
            });
          }
        } catch (erreur) {
          sansPR = message(erreur);
          if (!arrete) avertir(`brigade : PR non ouverte pour le ticket #${numero} (branche ${branche}) — ${sansPR}`);
        }
        if (arrete) return;
        // Récolté : le cook s'est arrêté sans conclure, son travail est parti quand même.
        const recolte = conclusion?.raison?.startsWith("harvested:") ? conclusion.raison.replace(/^harvested:/, "") : null;
        const bailTombe = sansProgres(fin);
        // Relu après l'ouverture de la PR : le ticket a pu partir pendant l'appel.
        const sorti = parti();
        // Le signal et le compte-rendu s'écrivent ensemble : une livraison
        // reprise après un redémarrage ne la signale pas deux fois.
        const horsDeSaZone = base.transaction(() => {
          const lignes = sansCommit || sorti ? [] : signalerHorsZone(station, numero, run, branche);
          rapporter("done", conclusion?.raison ?? null, pr, captures);
          return lignes;
        });
        if (sorti) {
          await commenter(
            numero,
            [
              entete(station, "fini, ticket sorti du rail", calibrage, fin),
              ...direLivraisonSansTicket(branche, options.base, pr, sansCommit),
              "",
              ...rendu.publie,
            ].join("\n"),
          );
          return;
        }
        await commenter(
          numero,
          [
            entete(station, sansDiff ? "fini, sans diff" : recolte === null ? "fini" : `récolté (${recolte})`, calibrage, fin),
            sansDiff
              ? "Aucun commit : le livrable de ce ticket est ce que le cook a délimité, ci-dessous. Il part en pass, où le reviewer le relit — rien n'est servi sans cette relecture."
              : sansCommit
                ? "Aucun commit, et rien n'est poussé : c'est la pass qui dira ce que vaut cette livraison."
                : `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`,
            ...(reprise === null ? [] : [`${reprise.n <= RENVOIS_MAX ? `Renvoi ${reprise.n}/${RENVOIS_MAX} de la pass` : "Relance décidée par le manager"} : le cook a repris la livraison que la pass avait refusée.`]),
            ...(bailTombe === null ? [] : [bailTombe]),
            ...(recolte === null ? [] : ["Le cook s'est arrêté sans conclure : ce qu'il avait commité est poussé et part en pass."]),
            ...(conclusion?.recolte
              ? [`Le cook avait laissé du travail non commité dans son worktree : la station l'a commité à sa place (\`${conclusion.recolte.slice(0, 7)}\`), et il fait partie de la livraison — la pass le juge avec le reste.`]
              : []),
            ...horsDeSaZone,
            ...montrees,
            "",
            ...rendu.publie,
          ].join("\n"),
        );
        return;
      }
      case "guard":
      case "failed": {
        const raison = conclusion?.raison ?? fin.erreur ?? "échec";
        const bailTombe = sansProgres(fin);
        const sansLivrable = raison === SANS_LIVRABLE;
        // Rien de ce que le cook a commité ne part : un secret du projet, ou
        // les identifiants de Claude.
        const retenue = raison.startsWith(SECRET_LIVRE) || raison.startsWith(IDENTIFIANTS_LIVRES);
        const suiteDeLaRetenue =
          reprise === null
            ? "Le cook suivant repart de la base."
            : `C'était un renvoi : la branche \`${branche}\` est ramenée à la livraison que la pass avait refusée — ce que ce cook y avait ajouté est perdu —, et le cook suivant en repart.`;
        rapporter("failed", raison, null);
        await commenter(
          numero,
          [
            entete(station, `échoué (${raison})`, calibrage, fin),
            ...(bailTombe === null ? [] : [bailTombe]),
            ...(sansLivrable
              ? [`Aucun commit, et ${direDefaut(rendu.defaut)} dans le dernier message du cook : il n'a pas de livrable. Un message n'en est pas un, quelle que soit sa longueur — seul ce qui est délimité est publié et relu.`]
              : []),
            ...(raison.startsWith(SECRET_LIVRE)
              ? [
                  `Ce que le cook a commité porte la valeur d'un secret du projet (${raison.slice(SECRET_LIVRE.length + 2)}) : la station ne pousse pas une branche qui en publierait un. ${suiteDeLaRetenue}`,
                ]
              : []),
            ...(raison.startsWith(IDENTIFIANTS_LIVRES) && distante
              ? [
                  `Ce que le cook a livré porte ${direSignes(raison.slice(IDENTIFIANTS_LIVRES.length + 2))} : la box n'envoie pas en pass une branche qui porterait la connexion d'un compte Max. Elle reconnaît un nom et une forme, sans rien lire ni comparer — elle ne dit donc pas que ce sont de vrais identifiants.`,
                  `**La branche \`${branche}\` est déjà sur l'origine** : c'est \`${station}\` qui l'y a poussée, la box n'y peut rien. Si ce sont de vrais identifiants : supprime-la (\`git push origin --delete ${branche}\`) et révoque la connexion — voir « Révoquer la connexion Max » dans \`docs/runtime/station-cook.md\`.`,
                ]
              : []),
            ...(raison.startsWith(IDENTIFIANTS_LIVRES) && !distante
              ? [
                  `Ce que le cook a commité porte ${direSignes(raison.slice(IDENTIFIANTS_LIVRES.length + 2))} : la station ne pousse pas une branche qui publierait la connexion du compte Max. Elle reconnaît un nom et une forme, sans lire les identifiants du compte ni rien leur comparer — elle ne dit donc pas que ce sont les vôtres. ${suiteDeLaRetenue}`,
                  `Refusé à tort ? Un fichier du projet ne peut pas s'appeler \`${FICHIER_DES_IDENTIFIANTS}\` ; un exemple de jeton s'écrit tronqué (moins de ${LONGUEUR_MIN_DU_JETON} caractères après \`sk-ant-<type>-\`), un jeu d'essai s'assemble à l'exécution au lieu de s'écrire en clair. Si ce sont de vrais identifiants : rien n'est sorti de la machine, mais un cook les a copiés — voir « Révoquer la connexion Max » dans \`docs/runtime/station-cook.md\`.`,
                ]
              : []),
            distante && conserve !== undefined
              ? `La box n'a reçu aucune livraison de ce cook. Le ticket est revenu en attente. ${direConserve(conserve)}`
              : distante
                ? `La box n'a reçu aucune livraison de ce cook. Le ticket est revenu en attente ; son travail reste chez \`${station}\`, branche \`${branche}\` — rien n'en était poussé sur l'origine.`
                : retenue && reprise !== null
                  ? "Rien n'est poussé. Le ticket est revenu en attente."
                  : `Rien n'est poussé. Le ticket est revenu en attente ; le travail du cook reste sur la station, branche \`${branche}\`.`,
            ...(!distante && conserve !== undefined ? [direConserve(conserve)] : []),
            ...(!compteRendu ? [] : ["", ...(sansLivrable ? replier("Le message du cook, sans livrable", compteRendu) : rendu.publie)]),
          ].join("\n"),
        );
        return;
      }
      // Le modèle a refusé de répondre : ni une panne ni un échec du cook. Le
      // ticket repart, puis remonte au chef si le refus se répète — le
      // relancer sans fin à l'identique n'y changerait rien.
      case "refused": {
        const refus = refusDAffilee(base, `${numero}-`);
        const remonte = refus >= REFUS_MAX;
        // Faux : le ticket a quitté la station pendant la cuisson, le rail n'a
        // pas bougé — le commentaire ne dit que ce qui a été fait.
        const tenu = base.transaction(() => {
          const fait = geste(() => (remonte ? rail.quatreVingtSix(numero, { motif: REFUS, station }) : rail.rendre(numero, REFUS, station)));
          rapporter("refused", conclusion?.raison ?? null, null);
          return fait;
        });
        if (tenu && remonte) avertir(`brigade : le modèle a refusé ${refus} fois d'affilée le ticket #${numero} — remonté au chef`);
        await commenter(
          numero,
          [
            entete(station, `refusé par le modèle, essai ${Math.min(refus, REFUS_MAX)}/${REFUS_MAX}`, calibrage, fin),
            `Le cook s'est arrêté sur un ${conclusion?.raison ?? "refus du modèle"} — \`stop_reason: refusal\` : ce n'est ni une panne ni un échec du cook, et le disjoncteur ne le compte pas. Rien n'est poussé ; le travail du cook reste sur la station, branche \`${branche}\`.`,
            "",
            !tenu
              ? "La station ne tenait plus ce ticket quand son cook a fini : elle ne l'a ni rendu ni remonté, le rail le montre tel qu'il est."
              : remonte
              ? `**Remonté au chef.** ${REFUS_MAX} refus d'affilée : le ticket est 86, aucun cook n'est relancé — le même ticket, relancé à l'identique, serait sans doute refusé encore. Reformule-le, ou change son calibrage ; retirer puis reposer \`fire\` le remet sur le rail.`
              : "Le ticket est revenu en attente : un cook neuf le reprendra.",
            ...(compteRendu ? ["", ...rendu.publie] : []),
          ].join("\n"),
        );
        return;
      }
      case "neutral": {
        if (conclusion?.fin === "86") {
          const instant = maintenant();
          const annonce = conclusion.lecture.quota?.retour ?? null;
          // Une heure de retour déjà passée ne retiendrait rien : le cook
          // suivant buterait aussitôt sur le même quota.
          const retour = annonce !== null && annonce > instant ? annonce : new Date(instant.getTime() + REPLI_QUOTA_MS);
          base.transaction(() => {
            geste(() => rail.quatreVingtSix(numero, { motif: QUOTA, retour, station }));
            // Le quota est celui du compte : épuisé pour une station, il l'est pour toutes.
            noterPourChacune((celle) => ({ type: "station.86", payload: { station: celle, reason: QUOTA, until: retour.toISOString(), window: conclusion.lecture.quota?.fenetre ?? null } }));
            rapporter("86", QUOTA, null);
          });
          return;
        }
        base.transaction(() => {
          geste(() => rail.rendre(numero, DECONNEXION, station));
          deconnecter("authentication_failed", noms, { station, ticket: numero, run });
          rapporter("disconnected", "authentication_failed", null);
        });
        await commenter(
          numero,
          [
            `**Station \`${station}\` — connexion Max expirée.** Le cook de ce ticket n'a pas pu parler au modèle : le ticket est revenu en attente, et la station ne prend plus rien.`,
            "",
            "Sur la machine : `claude /login` sous le compte du service, puis `" + commandeDeBox("garde-fous reprendre") + "`.",
          ].join("\n"),
        );
        return;
      }
    }
  };

  // Les stations distantes : elles tirent leur travail, et partagent avec
  // celles d'ici les cuisines en cours, les bornes, les refus et la fin
  // racontée. Rien ne part d'ici vers elles.
  const distantes = ouvrirDistantes({
    runtime,
    // Relues à chaque demande : le chef a pu les changer.
    get stations() {
      return toutes;
    },
    depot,
    depotGitHub: options.depotGitHub,
    base: options.base,
    dureeBailMs: options.dureeBailMs,
    presenceMs: options.presenceMs ?? PRESENCE_PAR_DEFAUT_MIN * 60_000,
    maintenant,
    avertir,
    arrete: () => arrete,
    enCuisine,
    cuisinePar,
    retenue: ceQuiRetientLaDistante,
    boxSaturee,
    direCeQuiRetient: (station, retenue) => direCeQuiRetient(station, retenue),
    refuser,
    refuserLaFiche,
    liberer: (ticket) => serveurs.arreter(ticket, "retaken"),
    conclure,
    servir: () => servir(),
    apresCook: options.apresCook,
    leconsDuCook,
    carnetDuCook,
    direLeCarnet,
  });

  // Ce que le setup d'un worktree a exporté au cook, au-delà de ce que le
  // runtime et les secrets du projet lui donnent : un runtime qui reprend ce
  // cook en a besoin pour servir sa livraison — son port, souvent. Gardé à
  // côté de son flux brut, lisible du seul compte du service, le temps du cook.
  const fichierDuSetup = (run: string) => join(options.repertoireEtat, "runs", `${run}.setup.json`);
  const retenirLeSetup = (run: string, env: NodeJS.ProcessEnv, sansLui: NodeJS.ProcessEnv) => {
    const exporte = Object.fromEntries(Object.entries(env).filter(([nom, valeur]) => valeur !== undefined && sansLui[nom] !== valeur));
    if (Object.keys(exporte).length === 0) return;
    try {
      mkdirSync(dirname(fichierDuSetup(run)), { recursive: true });
      ecrireSecret(fichierDuSetup(run), JSON.stringify(exporte));
    } catch (erreur) {
      avertir(`brigade : ce que le setup du run ${run} exporte n'est pas retenu — repris par un autre runtime, sa livraison ne serait pas servie — ${message(erreur)}`);
    }
  };
  const lireLeSetup = (run: string): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(fichierDuSetup(run), "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  };
  const oublierLeSetup = (run: string) => rmSync(fichierDuSetup(run), { force: true });

  // La session que le cook d'un renvoi reprend : celle du dernier cook lancé
  // sur le ticket, s'il a livré — c'est sa livraison que la pass a refusée.
  // Pas de reprise s'il n'a rien livré : un cook de renvoi qui a échoué peut
  // avoir buté sur la reprise elle-même, le suivant part d'un cook neuf. Ni
  // pour une relance du manager, décidée quand les renvois sont épuisés : elle
  // repart d'un regard neuf. La session introuvable — flux parti, transcript
  // rangé —, le renvoi part d'un cook neuf, comme avant la reprise.
  const reprendreLaSession = (renvoi: { run: string; returns: number }, worktree: string, env: NodeJS.ProcessEnv): SessionReprise | null => {
    if (renvoi.returns > RENVOIS_MAX) return null;
    const flux = fluxDuCook(base, renvoi.run);
    if (flux === null || !flux.livre) return null;
    // Le répertoire de configuration de `claude`, tel que le runtime le voit :
    // celui du projet sous cloison, monté à la place de celui du compte.
    const claude = options.cloison?.claude ?? (env.CLAUDE_CONFIG_DIR || (env.HOME ? join(env.HOME, ".claude") : null));
    const prete = preparerReprise({ claude, run: renvoi.run, flux: resolve(options.repertoireEtat, flux.stream), worktree });
    return "reprise" in prete ? prete.reprise : null;
  };

  // Ce que laisse un cook qui reprenait un travail conservé, s'il n'a rien
  // livré : sa branche en garde les commits sur l'origine — le cook suivant en
  // repart à son tour.
  const conserveSurLOrigine = (branche: string): { conserve?: number } => {
    try {
      const commits = depot.commits(depot.livree(branche));
      return commits > 0 ? { conserve: commits } : {};
    } catch (erreur) {
      avertir(`brigade : la branche \`${branche}\` n'a pas pu être relue — le travail conservé qu'elle porte n'est pas noté, le cook suivant repartira de la base : ${message(erreur)}`);
      return {};
    }
  };

  // Cuisine un ticket que la station vient de prendre. Résolue quand le cook
  // est fini et sa fin racontée. `parti` : appelé une fois le cook lancé —
  // l'entrée du ticket est finie.
  const cuisiner = async (station: string, ticket: TicketRail, parti: () => void, sansArbitre: boolean) => {
    const numero = ticket.ticket;
    if (!complet(ticket)) return refuser(station, ticket);
    if (illisible(ticket.card) !== null) return refuserLaFiche(station, ticket);
    const calibrage: Calibrage = { model: ticket.model, effort: ticket.effort };

    // Le serveur de sa livraison précédente tient encore son worktree, et sa
    // branche avec : un cook qui reprend le ticket prend sa place.
    await serveurs.arreter(numero, "retaken");
    if (arrete) return;

    const run = nomDeRun(numero);
    // Un ticket renvoyé par la pass se reprend là où il a été livré : même
    // branche, même PR, dans un worktree neuf accroché à cette branche — celui
    // de la livraison est parti avec son cook. Si le clone ne connaît plus la
    // branche, le cook repart de la base comme un premier.
    const renvoi = renvoiEnAttente(base, numero);
    // Sinon, un cook perdu en route — sa station distante a disparu — a pu
    // laisser son travail sur l'origine : relu de là, le cook en repart, dans
    // un worktree neuf accroché à sa branche. L'origine ne porte rien de plus
    // que la base : le cook repart de la base, comme un premier.
    const laisse = renvoi === null ? travailLaisse(base, numero) : null;
    let suite: TravailLaisse | null = null;
    let worktree: string;
    let branche: string;
    let repris: typeof renvoi = null;
    // La tête de la branche avant que le cook n'y entre : ce qu'il y ajoute se
    // lit contre elle.
    let entree: string;
    // La base d'où le worktree vient d'être préparé : c'est contre elle qu'un
    // setup bloqué attend qu'elle bouge.
    let vue: string;
    // Le dernier worktree n'a pas pu être préparé : avant de rien rapatrier, la
    // station revérifie qu'elle peut récupérer le dépôt et y pousser — refusé,
    // l'essai échoue aussitôt, avec le geste qui lève le refus ; le geste fait,
    // l'essai suivant passe, sans rien redémarrer. Un essai qui échoue sans
    // vérification préalable la fait après coup : son échec porte le geste.
    const enEchec = echecDuWorktree(base) !== null;
    let verifie = false;
    const accesRefuse = async (): Promise<AccesBloque | null> => {
      verifie = true;
      try {
        const acces = await depot.acces({ station: machineDe(station), depot: options.depotGitHub });
        return acces.etat === "bloque" ? { bloque: acces.bloque, raison: acces.raison, geste: acces.geste } : null;
      } catch {
        return null;
      }
    };
    try {
      if (enEchec) {
        const refuse = await accesRefuse();
        if (refuse !== null) throw new AccesDuDepotRefuse(refuse);
      }
      repris = renvoi !== null && depot.connait(renvoi.branch) ? renvoi : null;
      if (laisse !== null) {
        await depot.recevoir(laisse.branch);
        suite = commitsConserves(depot, laisse.branch) > 0 ? laisse : null;
        if (suite === null) await depot.elaguer(laisse.branch);
      }
      ({ worktree, branche } = repris
        ? { worktree: await depot.reprendre(run, repris.branch), branche: repris.branch }
        : suite
          ? { worktree: await depot.reprendre(run, suite.branch), branche: suite.branch }
          : await depot.preparer(run));
      vue = depot.vue();
      entree = depot.tete(branche);
    } catch (erreur) {
      if (arrete) return;
      const refuse = erreur instanceof AccesDuDepotRefuse ? erreur.acces : verifie ? null : await accesRefuse();
      if (arrete) return;
      const pourquoi = (erreur instanceof AccesDuDepotRefuse ? erreur.acces.raison : message(erreur)).slice(0, RAISON_DU_WORKTREE_MAX);
      avertir(`brigade : worktree impossible à préparer pour le ticket #${numero} — ${pourquoi}${refuse === null ? "" : ` Geste : ${refuse.geste}`}`);
      const acces = refuse === null ? undefined : { blocked: refuse.bloque, reason: refuse.raison, gesture: refuse.geste };
      ecarter(station, numero, WORKTREE_IMPOSSIBLE, new Date(maintenant().getTime() + REPLI_WORKTREE_MS), { pourquoi, acces });
      return;
    }
    if (arrete) return;
    // Le worktree se prépare de nouveau : l'échec n'est plus à dire.
    if (enEchec && echecDuWorktree(base) !== null) noter(station, numero, { type: "worktree.prepared", payload: { station } });

    // Un worktree neuf n'est pas exécutable. Un setup en échec ne lance aucun
    // cook — donc ne consomme rien, et ne compte pas pour le disjoncteur : le
    // ticket est reproposé dix minutes plus tard, et le worktree, s'il était
    // neuf, ne reste pas.
    // Un worktree où aucun cook n'entrera ne reste pas. La branche d'un renvoi
    // porte une livraison, celle d'un travail conservé ce qu'un cook a poussé :
    // elles, si.
    const retirerLeNeuf = () => {
      try {
        depot.retirer(worktree, repris || suite ? undefined : branche);
      } catch (erreur) {
        avertir(`brigade : worktree du ticket #${numero} non retiré, aucun cook n'y est entré — ${message(erreur)}`);
      }
    };
    // Les secrets du projet : ce que la branche déclare, avec les valeurs que
    // la machine détient à cet instant. Lus avant le setup — c'est lui qui
    // prépare la base de test —, et s'il en manque un, rien ne part.
    const secrets = lireSecrets(worktree, options.secrets ?? null);
    if (!secrets.pret) {
      retirerLeNeuf();
      return refuserSansSecrets(station, numero, secrets.problemes);
    }
    // Sans secret, aucune valeur n'est à masquer : seule la forme des
    // identifiants de Claude l'est, par le superviseur et les scripts.
    const masquer = Object.keys(secrets.env).length === 0 ? undefined : secrets.masquer;
    const delaiSetupMs = options.dureeBailMs * PART_DU_SETUP;
    const interdites = options.sansIdentite ? [...VARIABLES_DE_JETON, ...VARIABLES_GITHUB] : VARIABLES_DE_JETON;
    const avantLeSetup = journal.dernierSeq();
    const setup = await jouerSetup({ worktree, ticket: numero, env: { ...envCook, ...secrets.env }, interdites, masquer, cloison: options.cloison, delaiMs: delaiSetupMs, signal: abandon.signal });
    if (arrete) return;
    if (!setup.pret) {
      const pourquoi = setup.depasse ? `plafond de ${duree(delaiSetupMs)} dépassé` : setup.code === null ? "interrompu" : `code de sortie ${setup.code}`;
      avertir(
        [`brigade : setup du worktree en échec pour le ticket #${numero} (\`${SCRIPT_SETUP}\`, ${pourquoi}) — aucun cook n'est lancé`, setup.sortie.trim().slice(-FIN_DE_SETUP_MAX)]
          .filter(Boolean)
          .join("\n"),
      );
      retirerLeNeuf();
      const hotes = journal
        .depuis(avantLeSetup)
        .flatMap((evenement) => (evenement.type === "network.refused" && evenement.payload.host !== AUTRES_HOTES ? [`${evenement.payload.host}:${evenement.payload.port}`] : []));
      return refuserSansSetup(station, numero, { pourquoi, sortie: setup.sortie.trim().slice(-FIN_DE_SETUP_MAX), masques: setup.masques, hotes: [...new Set(hotes)].sort(), vue });
    }
    // Le setup a pris sur le bail : le cook part avec un bail entier. Refusé,
    // le ticket a quitté la station pendant le setup.
    if (setup.joue && !geste(() => rail.renouveler(numero, station))) return retirerLeNeuf();
    // Sans setup, rien n'a encore vérifié que la station tient toujours le
    // ticket : rendu pendant la préparation du worktree, il n'a pas de cook.
    const garde = ticketDuRail(base, numero);
    if (garde?.state !== "taken" || garde.station !== station) return retirerLeNeuf();
    // Ce que le setup exporte passe au cook, sauf ce qui le détournerait de la
    // connexion Max : un setup qui charge un `.env` entier peut porter une clé.
    // Les secrets du projet y sont déjà : le setup les a reçus.
    const envDuCook = setup.env;

    // Sans identité, le cook ne peut pas lire son ticket sur GitHub : la
    // station le lui remet, hors de son worktree — rien n'en est récolté. Un
    // ticket illisible ne lance aucun cook : il est reproposé plus tard.
    let remis: string | undefined;
    if (options.sansIdentite) {
      try {
        const [lue, commentaires] = await Promise.all([github.issue(numero), github.commentaires(numero)]);
        if (arrete) return;
        if (lue === null) throw new Error("l'issue n'existe plus");
        const fichier = resolve(options.repertoireEtat, "runs", `${run}.ticket.md`);
        mkdirSync(dirname(fichier), { recursive: true });
        writeFileSync(fichier, ticketRemis({ number: numero, title: lue.title, body: lue.body ?? "", commentaires }));
        remis = fichier;
      } catch (erreur) {
        if (arrete) return;
        avertir(`brigade : ticket #${numero} illisible sur GitHub, aucun cook n'est lancé — ${message(erreur)}`);
        ecarter(station, numero, TICKET_ILLISIBLE, new Date(maintenant().getTime() + REPLI_WORKTREE_MS));
        return retirerLeNeuf();
      }
      // Lire le ticket a pris du temps : rendu entre-temps, il n'a pas de cook.
      const tenu = ticketDuRail(base, numero);
      if (tenu?.state !== "taken" || tenu.station !== station) return retirerLeNeuf();
    }

    // Les leçons provisoires du projet qu'il reçoit, et que son lancement dit.
    const lecons = leconsDuCook();
    const mission = { ticket: numero, titre: ticket.title, depot: options.depotGitHub, base: options.base, lecons, ...(remis === undefined ? {} : { remis }) };
    // Un renvoi de la pass reprend la session du cook dont elle a refusé la
    // livraison : il a déjà lu le ticket, le `CLAUDE.md` et le code, et ne
    // reçoit que ce qu'elle a trouvé. Les gates et la relecture qui jugeront
    // sa livraison sont celles de toutes les autres.
    const reprise = repris === null ? null : reprendreLaSession(repris, worktree, envDuCook);
    // Le lancement. Refusé — « stop » ou disjoncteur arrivés entre le prêt et
    // le lancement —, le ticket est rendu et le worktree neuf retiré.
    const lancer = (juger: (fin: Fin) => Verdict): CookLance | null => {
      // Le profil sous lequel il part, s'il en a un : son carnet s'ajoute aux
      // leçons du projet.
      const carnet = carnetDuCook(ticket.card?.zone ?? []);
      let lance: CookLance;
      try {
        lance = runtime.lancer({
          ticket: numero,
          run,
          contexte: {
            station,
            ...calibrage,
            branch: branche,
            worktree: worktreeAuJournal(run),
            // Passé les renvois de la pass, c'est une relance du manager : sa
            // livraison ne vaudra réussite que jugée verte.
            ...(renvoi !== null && renvoi.returns > RENVOIS_MAX ? { relaunch: true } : {}),
            // Un renvoi qui reprend la session du cook précédent : le relevé
            // des mesures le distingue d'un renvoi reparti de zéro.
            ...(reprise === null ? {} : { resumes: reprise }),
            // Le cook dont il reprend le travail conservé.
            ...(suite === null ? {} : { continues: suite.run }),
            // L'arbitre entre projets ne répondait pas : ce lancement n'est pas arbitré.
            ...(sansArbitre ? { unarbitrated: true } : {}),
            // La tête de la branche à l'entrée : un runtime qui reprend ce cook
            // lit contre elle ce qu'il a livré.
            head: entree,
            lessons: lecons.map((lecon) => lecon.id),
          },
          // Le ticket remis vit dans l'état, que la cloison masque : il est
          // rendu au cook, en lecture seule.
          ...envelopper(
            options.cloison,
            {
              commande: options.bin,
              args: dansLeBacASableLocal(
                options.bacASable,
                argumentsClaude(
                  reprise !== null && repris !== null
                    ? consigneDeReprise({ base: options.base, branche, worktree, n: repris.returns, findings: repris.findings, lecons, carnet })
                    : repris
                      ? consigneDeRenvoi({ ...mission, branche, n: repris.returns, findings: repris.findings, carnet })
                      : suite
                        ? consigneDeSuite({ ...mission, branche, carnet })
                        : consigne({ ...mission, carnet }),
                  calibrage,
                  reprise?.session,
                ),
                worktree,
              ),
            },
            { cwd: worktree, depot: "ecriture", lit: remis === undefined ? [] : [remis] },
          ),
          cwd: worktree,
          // Le jeton de la connexion Max, relu à ce lancement : au cook, pas
          // à ce que la station garde de son setup.
          env: environnementClaude(envDuCook, options.env ?? process.env),
          masquer,
          juger,
          // Le cook survit au runtime : un relais le porte, et le runtime qui
          // démarre après celui-ci le reprend.
          survivant: { secrets: secrets.env },
        });
      } catch (erreur) {
        if (!(erreur instanceof LancementRefuse)) throw erreur;
        // « stop » ou disjoncteur, arrivés entre le prêt et le lancement.
        geste(() => rail.rendre(numero, `launch-refused:${erreur.motif}`, station));
        oublierLeSetup(run);
        retirerLeNeuf();
        return null;
      }
      direLeCarnet(station, numero, run, carnet);
      parti();
      return lance;
    };
    // Ce que le setup a exporté, retenu pour un runtime qui reprendrait ce
    // cook : sans lui, il ne saurait pas servir sa livraison.
    retenirLeSetup(run, envDuCook, { ...envCook, ...secrets.env });
    await mener({ station, ticket, calibrage, run, worktree, branche, entree, repris, suite: suite !== null, secrets: { env: secrets.env, fuites: secrets.fuites }, masquer, envDuCook }, lancer);
  };

  // Ce qu'une cuisine en cours doit savoir pour être menée à sa fin — que son
  // cook vienne d'être lancé, ou qu'une vie précédente l'ait lancé.
  // `secrets.fuites` nul : les secrets du projet ne se relisent plus, et rien
  // n'est poussé — on ne saurait pas dire si la branche en publie un.
  type Cuisson = {
    station: string;
    ticket: TicketRail;
    calibrage: Calibrage;
    run: string;
    worktree: string;
    branche: string;
    entree: string;
    repris: ReturnType<typeof renvoiEnAttente>;
    // Il reprend le travail conservé d'un cook perdu en route : sa branche en
    // porte les commits, poussés.
    suite: boolean;
    secrets: { env: Record<string, string>; fuites: ((texte: string) => string[]) | null };
    masquer: ((texte: string) => string) | undefined;
    envDuCook: NodeJS.ProcessEnv;
  };

  // Mène une cuisine de son cook à sa fin racontée : juge ce qu'il laisse,
  // regarde son worktree pour son bail, raconte, sert ou range. `demarrer`
  // lance le cook — ou le reprend — et rend de quoi le suivre, ou null s'il ne
  // part pas ; il est appelé avant la première attente.
  const mener = async (cuisson: Cuisson, demarrer: (juger: (fin: Fin) => Verdict) => CookLance | null) => {
    const { station, ticket, calibrage, run, worktree, branche, entree, repris, suite, secrets, masquer, envDuCook } = cuisson;
    const numero = ticket.ticket;
    // La fin d'un cook, lue dans son flux brut — puis dans son worktree, qui
    // fait foi : le runtime récolte. Un cook qui a commité puis s'est arrêté,
    // en erreur ou sous un garde-fou, a fini. Un cook qui conclut sans rien
    // commiter, dans un worktree qu'il a laissé intact, a livré ce qu'il a
    // délimité dans son dernier message — un ticket sans diff, que le reviewer
    // jugera seul. Sans rien de délimité, ou avec des fichiers écrits et jamais
    // commités, il n'a rien livré : un message n'est pas un livrable, et ce
    // travail-là ne partirait nulle part. Seul le quota épuisé ne se récolte
    // pas : le ticket attend son retour.
    //
    // Sur un renvoi, les commits de la livraison refusée sont déjà là : seul un
    // commit de plus se récolte. Un cook de renvoi qui conclut sans en ajouter
    // repart quand même en pass — il tient le finding pour faux, et elle rejuge.
    //
    // Ce qui traîne dans le worktree d'une livraison — des fichiers écrits et
    // jamais commités — est commité à la place du cook avant le push : le
    // worktree part à la fin du cook, et la pass juge la branche. Ce commit-là
    // ne fait jamais une livraison à lui seul : après un échec, c'est le
    // rangement du worktree qui le pose, sur la branche locale, sans la pousser.
    //
    // Une livraison n'en est une que poussée : le push se joue donc ici, avant
    // que la fin ne s'écrive, et il bloque le runtime le temps de se faire —
    // sans quoi une origine en panne ferait reprendre le même ticket sans fin,
    // hors de la vue du disjoncteur.
    let conclusion: Conclusion | null = null;
    const juger = (fin: Fin): Verdict => {
      let sansCommit = false;
      let recolte: string | null = null;
      let flux = "";
      try {
        flux = readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8");
      } catch {
        // Sans flux, rien ne prouve que le cook a fini.
      }
      const lecture = lireFlux(flux);
      let lu: FinDeCook = fin.arret ? "failed" : verdict(lecture, fin.code);
      let raison: string | null = null;
      if (fin.arret) raison = `guard:${fin.arret.reason}`;
      else if (lu === "refused") raison = direRefus(lecture);
      else if (lu === "failed") raison = fin.code === 0 ? "flux sans résultat" : fin.code === null ? `signal ${fin.signal}` : `code de sortie ${fin.code}`;
      if (lu === "done" || lu === "failed" || lu === "refused") {
        try {
          const commits = depot.commits(branche);
          sansCommit = commits === 0;
          // Tout se lit sur la branche : un cook qui l'a quittée — une autre
          // branche, une tête détachée — a peut-être commité ailleurs, et son
          // worktree intact passerait pour un ticket sans diff.
          if (!depot.surSaBranche(worktree, branche)) throw new HorsBranche();
          // Contre la tête à l'entrée, pas contre le commit jugé : un cook
          // raté entre deux renvois a pu laisser sa récolte sur la branche.
          const aLivre = commits > 0 && depot.tete(branche) !== entree;
          if (aLivre || (lu === "done" && commits > 0)) {
            // Poussée même sans commit neuf : la pass juge la branche, et elle
            // peut porter cette récolte-là.
            recolte = depot.recolter(worktree, branche);
            // Une branche qui porte la valeur d'un secret n'est pas poussée :
            // un `.env` écrit par le cook, récolté, partirait sinon en PR.
            const ajouts = depot.ajouts(branche);
            if (secrets.fuites === null) throw new Error("secrets du projet illisibles à la reprise du cook : rien n'est poussé sans savoir si la branche en publie un");
            const livres = masquer === undefined ? [] : secrets.fuites(ajouts);
            // Ni celle qui porte les identifiants de Claude — reconnus à leur
            // nom ou à leur forme, que le projet ait des secrets ou non : le
            // runtime ne les lit pas, il ne peut pas en chercher la valeur.
            const signes = identifiantsLivres(ajouts);
            if (livres.length > 0 || signes.length > 0) {
              // Un renvoi se reprend sur la même branche : elle revient à la
              // livraison que la pass avait refusée, sans quoi le commit
              // fautif condamnerait chaque cook suivant du ticket. Un travail
              // conservé, de même : à ce que l'origine en porte.
              if (repris || suite) depot.revenir(worktree, branche);
              throw livres.length > 0 ? new SecretLivre(livres.map((nom) => `\`${nom}\``).join(", ")) : new IdentifiantsLivres(signes.join(", "));
            }
            depot.pousser(branche);
            if (lu !== "done") [lu, raison] = ["done", `harvested:${raison}`];
          } else if (lu === "done") {
            const intact = depot.intact(worktree);
            if (intact && lireLivrable(lecture.message).texte !== null) raison = SANS_DIFF;
            // Un message où rien n'est délimité n'est pas un livrable : rien
            // n'est livré, renvoi ou non.
            else if (intact && lecture.message?.trim()) [lu, raison] = ["failed", SANS_LIVRABLE];
            // Des fichiers écrits, aucun commit : rien n'est livré, renvoi ou non.
            else if (!repris || !intact) [lu, raison] = ["failed", "no-commit"];
          }
        } catch (erreur) {
          [lu, raison] = ["failed", erreur instanceof HorsBranche ? HORS_BRANCHE : erreur instanceof SecretLivre ? `${SECRET_LIVRE}: ${erreur.message}` : erreur instanceof IdentifiantsLivres ? `${IDENTIFIANTS_LIVRES}: ${erreur.message}` : `push-failed: ${message(erreur)}`];
        }
      }
      conclusion = { fin: lu, raison, lecture, sansCommit, recolte, ...(suite && lu !== "done" ? conserveSurLOrigine(branche) : {}) };
      return lu === "done" ? "ok" : lu === "failed" || lu === "refused" ? lu : "neutral";
    };

    // Un worktree qu'on ne sait pas lire ne prouve aucun travail — ni son
    // absence.
    const regarder = (): string | null => {
      try {
        return depot.empreinte(worktree);
      } catch (erreur) {
        avertir(`brigade : worktree du ticket #${numero} illisible — ${message(erreur)}`);
        return null;
      }
    };
    // L'état du worktree avant que le cook n'y entre : son premier geste est
    // déjà un progrès.
    let vue = regarder();
    const depart = maintenant().getTime();

    const lance = demarrer(juger);
    if (lance === null) return;

    // Le bail ne se renouvelle que sur un progrès observable : le worktree a
    // bougé depuis le dernier regard. Ni la présence du cook ni ce qu'il dit
    // ne comptent — c'est l'affaire de l'inactivité, sur son flux. Un bail qui
    // tombe arrête le cook par un arrêt jugé : ce qu'il a commité est récolté
    // avant que le ticket ne soit rendu.
    let progres = depart;
    let regard = depart;
    let signale = false;
    const observer = () => {
      const tenu = ticketDuRail(base, numero);
      // Le ticket a échappé à la station (retiré du rail) : son cook n'a plus
      // de raison de tourner.
      if (tenu?.state !== "taken" || tenu.station !== station) return lance.arreter();
      const instant = maintenant().getTime();
      const retard = tenu.leaseUntil === null ? -1 : instant - Date.parse(tenu.leaseUntil);
      const echu = retard >= 0;
      if (!echu && instant - regard < pasDeRegard) return;
      regard = instant;
      const courante = regarder();
      // Une lecture ratée à l'échéance n'arrête pas un cook qui a peut-être
      // progressé : la station relit au tick suivant. Le sursis est borné —
      // un worktree durablement illisible finit par faire tomber le bail.
      if (courante === null && retard < pasDeRegard) return;
      if (courante !== null && courante !== vue) {
        vue = courante;
        progres = instant;
        signale = false;
        if (!geste(() => rail.renouveler(numero, station))) lance.arreter();
      } else if (echu) {
        lance.arreter({ reason: "lease", limit: options.dureeBailMs, observed: instant - progres });
      } else if (!signale && instant - progres >= options.dureeBailMs * PART_SANS_PROGRES) {
        // Le chef le lit sans l'avoir demandé, avant que le bail ne tombe.
        signale = true;
        noter(station, numero, { type: "cook.stalled", payload: { run, station, idleMs: instant - progres, leaseMs: options.dureeBailMs } });
        avertir(`brigade : le cook ${run} du ticket #${numero} coince — aucun progrès dans son worktree depuis ${duree(instant - progres)}, son bail tombe à ${duree(options.dureeBailMs)}`);
      }
    };
    regards.add(observer);
    let fin: FinGardee;
    try {
      fin = await lance.fin;
    } finally {
      regards.delete(observer);
    }
    // Arrêté, le runtime ne range rien, et ne raconte rien : le cook vit
    // encore, et le runtime suivant le reprend.
    if (arrete) return;
    // Vrai : un serveur tient le worktree, ou il est tenu pour qu'on y lance
    // l'app — pour qu'on y regarde la livraison.
    let servi = false;
    try {
      await conclure(station, ticket, calibrage, lance.run, branche, fin, conclusion, repris && { n: repris.returns, pr: repris.pr });
      if (!arrete) servi = servirLaLivraison(station, { ticket: numero, run, worktree, relatif: worktreeAuJournal(run), branche, env: envDuCook, masquer }, fin, conclusion);
      options.apresCook?.();
    } finally {
      // Réussi ou non, le cook est fini : son worktree part, ce qui y traîne
      // commité sur sa branche — sauf celui d'une livraison servie, qui part
      // avec son serveur.
      if (!arrete && !servi) await nettoyage.ranger(numero, worktreeAuJournal(run), branche);
      if (!arrete) oublierLeSetup(run);
    }
  };

  // Raconte une livraison que la vie précédente a envoyée en pass sans avoir
  // pu le faire. Sa branche est poussée — le push précède la fin du cook ; sa
  // PR, ouverte ou non : GitHub le dit, et elle n'est ouverte que s'il n'en
  // connaît aucune. Le compte-rendu se relit dans le flux brut du cook.
  const reprendre = async (numero: number) => {
    const livraison = passDuTicket(base, numero);
    const ticket = ticketDuRail(base, numero);
    const station = ticket?.station;
    if (!livraison || !ticket || !station || livraison.branch === null) return;
    const { run, branch: branche } = livraison;
    let rendu = rendre(null);
    try {
      rendu = rendre(lireFlux(readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8")).message);
    } catch {
      // Sans flux, la livraison se raconte sans le dernier mot du cook.
    }
    const compteRendu = rendu.summary;
    // La fin du cook est au journal : elle dit ce qui a été masqué dans son flux.
    const masques = journal
      .duTicket(numero)
      .flatMap((evenement) => (evenement.type === "cook.exited" && evenement.payload.run === run ? [evenement.payload.credentialsMasked] : []))
      .at(-1);
    let pr = livraison.pr;
    let sansPR = "";
    // Une livraison sans diff n'a jamais eu de PR à ouvrir.
    let sansDiff = false;
    try {
      sansDiff = depot.commits(branche) === 0;
    } catch {
      // Une branche illisible : la livraison se raconte comme un diff.
    }
    const captures = sansDiff ? null : await capturesDe(numero, branche);
    const montrees = montrerCaptures(numero, captures);
    try {
      pr ??= (await github.prDeBranche(branche))?.url ?? null;
      if (!sansDiff) pr ??= await github.ouvrirPR({
        branche,
        base: options.base,
        titre: `#${numero} — ${ticket.title}`,
        corps: corpsDePR(station, numero, complet(ticket) ? ticket : null, rendu.deliverable ?? compteRendu, montrees),
      });
    } catch (erreur) {
      sansPR = message(erreur);
      if (!arrete) avertir(`brigade : PR non ouverte pour le ticket #${numero} (branche ${branche}) — ${sansPR}`);
    }
    if (arrete) return;
    let horsDeSaZone: string[] = [];
    const raconte = base.transaction(() => {
      // Le ticket a pu quitter le rail, ou le chef le rendre, pendant l'appel.
      if (!sansCompteRendu(numero) || passDuTicket(base, numero)?.run !== run) return false;
      if (!sansDiff) horsDeSaZone = signalerHorsZone(station, numero, run, branche);
      noter(station, numero, { type: "cook.reported", payload: { run, ending: "done", reason: sansDiff ? SANS_DIFF : null, summary: compteRendu, deliverable: rendu.deliverable, ...(rendu.retro === null ? {} : { retro: rendu.retro }), ...(rendu.retroTokens === null ? {} : { retroTokens: rendu.retroTokens }), branch: branche, pr, reconciled: true, ...(captures === null ? {} : { captures }) } });
      return true;
    });
    if (!raconte) return;
    avertir(`brigade : livraison du ticket #${numero} reprise après un redémarrage (branche ${branche}) — elle part en pass`);
    await commenter(
      numero,
      [
        `**Cook \`${station}\` — livraison reprise après un redémarrage du runtime.** Le cook avait fini et poussé son travail ; le runtime s'est arrêté avant d'en rendre compte.`,
        !sansDiff
          ? `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`
          : rendu.deliverable === null
            ? `Aucun commit, et ${direDefaut(rendu.defaut)} dans le dernier message du cook : il n'a pas de livrable, et la pass le lui renverra.`
            : "Aucun commit : le livrable de ce ticket est ce que le cook a délimité, ci-dessous, que le reviewer relit en pass.",
        ...masquageDuCook(masques),
        ...horsDeSaZone,
        ...montrees,
        "",
        ...rendu.publie,
      ].join("\n"),
    );
    options.apresCook?.();
  };
  void (async () => {
    for (const numero of aReprendre) {
      if (arrete) return;
      try {
        await reprendre(numero);
      } catch (erreur) {
        // Tant que le compte-rendu n'est pas écrit, le démarrage suivant y revient.
        if (!arrete) avertir(`brigade : reprise de la livraison du ticket #${numero} impossible — ${message(erreur)}`);
      }
    }
  })();

  // Reprend le cook qu'une vie précédente a laissé en vol sur un ticket que la
  // station tient encore : il n'est ni relancé ni tué, il est suivi — son
  // bail, sa fin jugée et racontée, sa livraison en pass — comme s'il était
  // parti d'ici. Ce que son lancement n'a pas écrit au journal se relit : les
  // secrets du projet sur la machine, le renvoi qu'il reprenait dans la pass,
  // ce que son setup exportait à côté de son flux. Rend faux s'il n'a pas pu
  // être repris : le ticket revient alors au rail.
  const suivreLeSurvivant = (station: string, ticket: TicketRail, run: string): boolean => {
    const numero = ticket.ticket;
    const lancement = lancementDe(numero, run);
    const { branch: branche, worktree: relatif, head: entree, model, effort } = lancement ?? {};
    if (typeof branche !== "string" || typeof relatif !== "string" || typeof entree !== "string" || typeof model !== "string" || typeof effort !== "string") return false;
    const worktree = worktreeDuJournal({ repertoireEtat: options.repertoireEtat, worktrees: options.worktrees ?? join(options.repertoireEtat, "worktrees") }, relatif);
    const lus = lireSecrets(worktree, options.secrets ?? null);
    if (!lus.pret) avertir(`brigade : secrets du projet illisibles à la reprise du cook ${run} (ticket #${numero}) — rien ne sera poussé de sa livraison : ${lus.problemes.join(" ; ")}`);
    const secrets = lus.pret ? { env: lus.env, fuites: lus.fuites } : { env: {}, fuites: null };
    const masquer = lus.pret && Object.keys(lus.env).length > 0 ? lus.masquer : undefined;
    const renvoi = renvoiEnAttente(base, numero);
    const cuisson: Cuisson = {
      station,
      ticket,
      calibrage: { model, effort },
      run,
      worktree,
      branche,
      entree,
      repris: renvoi?.branch === branche ? renvoi : null,
      suite: typeof lancement?.continues === "string",
      secrets,
      masquer,
      envDuCook: { ...envCook, ...secrets.env, ...lireLeSetup(run) },
    };
    enCuisine.set(numero, illisible(ticket.card) === null ? (ticket.card?.zone ?? []) : []);
    cuisinePar.set(numero, station);
    let repris = false;
    const menee = mener(cuisson, (juger) => {
      const lance = runtime.reprendre(run, juger);
      if (lance === null) return null;
      repris = true;
      // Le temps du remplacement ne compte pas contre lui : son bail repart.
      geste(() => rail.renouveler(numero, station));
      avertir(`brigade : cook ${run} du ticket #${numero} repris en vol (station ${station}, branche ${branche})`);
      return lance;
    });
    void menee
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : la station ${station} a buté sur le cook repris du ticket #${numero} — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
      })
      .finally(() => {
        enCuisine.delete(numero);
        cuisinePar.delete(numero);
        servir();
      });
    return repris;
  };
  for (const { station, ticket, run } of aSuivre) {
    if (!suivreLeSurvivant(station, ticket, run)) geste(() => rail.rendre(ticket.ticket, "station-restarted", station));
  }

  // Le ticket part en cuisine, et la prise n'attend pas sa fin. Ce qui bute sur
  // un ticket n'emporte ni le runtime ni les autres cooks : il revient par son
  // bail.
  const partir = async (station: string, ticket: TicketRail, sansArbitre: boolean) => {
    entrees++;
    enCuisine.set(ticket.ticket, illisible(ticket.card) === null ? (ticket.card?.zone ?? []) : []);
    cuisinePar.set(ticket.ticket, station);
    if (sansArbitre) nonArbitres.add(ticket.ticket);
    let enEntree = true;
    const sortir = () => {
      if (!enEntree) return;
      enEntree = false;
      entrees--;
    };
    try {
      await cuisiner(
        station,
        ticket,
        () => {
          sortir();
          departs.push(maintenant().getTime());
          servir();
        },
        sansArbitre,
      );
    } catch (erreur) {
      if (!arrete) avertir(`brigade : la station ${station} a buté sur le ticket #${ticket.ticket} — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    } finally {
      sortir();
      enCuisine.delete(ticket.ticket);
      cuisinePar.delete(ticket.ticket);
      nonArbitres.delete(ticket.ticket);
      servir();
    }
  };

  // Prend tout ce que les bornes laissent prendre. Chaque prise est une
  // transaction : la zone du ticket pris est tenue avant que le suivant soit
  // choisi. Un réveil qui arrive pendant le service le fait repasser.
  let pret = false;
  let enCours = false;
  let aRefaire = false;
  const servir = () => {
    if (arrete || !pret) return;
    if (enCours) {
      aRefaire = true;
      return;
    }
    enCours = true;
    try {
      do {
        aRefaire = false;
        rendreLesCorriges();
        ecarterSansStation();
        ecarterSansPresence();
        // Ce qui retient chaque station, à la dernière lecture.
        let retenues = new Map<string, Retenue | null>();
        // La réponse de l'arbitre est attendue : rien n'est encore à dire des
        // stations qui prendraient.
        let enAttente = false;
        while (!arrete) {
          retenues = ceQuiRetient();
          // Celles que rien ne retient, dans l'ordre où le projet les déclare.
          // Sans station, personne ne prend.
          const libres = preneuses(noms.filter((station) => retenues.get(station) === null));
          if (libres.length === 0) break;
          // Une base rouge ne laisse partir que sa réparation ; la pause du
          // renommage, que le ticket du renommage.
          const seule = seuleAPartir();
          if (seule === null) break;
          if (arbitre !== null) {
            // Sans ticket à prendre, il n'y a rien à lui demander.
            if (rail.servables(enCuisine, libres, seule) === 0) break;
            enAttente = placeEnMain(arbitre, libres.map(({ station }) => station)) !== null;
            if (enAttente) break;
          }
          // Le premier ticket, dans l'ordre de service, que l'une d'elles peut
          // cuisiner : il va à la première qui fournit ce qu'il demande.
          const ticket = rail.prendre(libres, enCuisine, seule);
          const station = ticket?.station;
          if (!ticket || !station) break;
          const sansArbitre = droit === "seul";
          droit = null;
          void partir(station, ticket, sansArbitre);
        }
        // Une place accordée et pas prise se rend : l'arbitre l'a déjà comptée.
        if (droit !== null) {
          droit = null;
          aRedire = true;
        }
        if (arrete) break;
        for (const [station, retenue] of retenues) {
          if (!(enAttente && retenue === null)) direCeQuiRetient(station, retenue);
        }
        if (arbitre !== null && !demandeEnVol) redire(arbitre, retenues);
      } while (aRefaire && !arrete);
    } catch (erreur) {
      // Rien ne doit tuer le runtime depuis ici : le réveil suivant relance le
      // service.
      if (!arrete) avertir(`brigade : ${lesStations("a buté", "ont buté")} — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    } finally {
      enCours = false;
    }
  };

  // Le rattrapage : un passage à la fois.
  let rattrape = false;
  const rattraper = async () => {
    if (arrete || rattrape) return;
    rattrape = true;
    try {
      await nettoyage.rattraper();
    } catch (erreur) {
      if (!arrete) avertir(`brigade : le rangement des worktrees a buté — ${message(erreur)}`);
    } finally {
      rattrape = false;
    }
  };

  // Seul un « non connecté » franc retient la station : une réponse illisible
  // laisse le premier cook trancher. Le stock des vies précédentes est rangé
  // avant la première prise : un renvoi doit trouver sa branche libre.
  void Promise.all([options.session(), rattraper()]).then(([session]) => {
    if (arrete) return;
    // Une station déjà dite déconnectée ne l'est pas deux fois.
    const tenues = noms.filter((station) => !etatStation(base, station)?.disconnectedAt);
    if ((session === "absente" || session === "introuvable") && tenues.length > 0) {
      deconnecter(session === "absente" ? SANS_CONNEXION : `binaire introuvable : ${options.bin}`, tenues);
    }
    pret = true;
    servir();
  });

  // Un regard qui bute n'empêche pas les autres : chaque cook a le sien, et
  // les serveurs le leur.
  const porterLesRegards = () => {
    for (const observer of [...regards, eteindreLesServeurs]) {
      try {
        observer();
      } catch (erreur) {
        if (!arrete) avertir(`brigade : ${lesStations("a buté", "ont buté")} en regardant un worktree — ${message(erreur)}`);
      }
    }
  };

  // Ce qu'une station distante a demandé depuis le dernier réveil, et ce que
  // l'horloge dit de ses cooks et de sa présence.
  const servirLesDistantes = (regarder: boolean) => {
    if (arrete || !pret) return;
    try {
      distantes.repondre();
      if (regarder) distantes.veiller();
    } catch (erreur) {
      if (!arrete) avertir(`brigade : le service des stations distantes a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    }
  };

  // Les stations que le chef a posées depuis la dernière lecture deviennent
  // celles du projet : annoncées, retirées, servies. Rien de ce qui tourne
  // n'est touché — un cook parti dans une station retirée finit comme il
  // aurait fini, et sa fin se raconte ; seule la prise suivante change.
  // Celles dont l'annonce est au journal : une annonce qui bute est reprise au
  // réveil suivant.
  let adoptees = JSON.stringify(toutes);
  const adopter = () => {
    if (!options.decisions || arrete) return;
    try {
      const lues = options.decisions.stations();
      const empreinte = JSON.stringify(lues);
      if (empreinte === adoptees) return;
      toutes = lues;
      declarees = toutes.filter((declaree) => !declaree.distante);
      noms = declarees.map((declaree) => declaree.nom);
      offres = toutes.map((declaree) => declaree.fournit);
      for (const station of noms) ouvrirServeursDe(station);
      base.transaction(annoncer);
      adoptees = empreinte;
      avertir(`brigade : stations relues — ${direStations(toutes)}`);
    } catch (erreur) {
      if (!arrete) avertir(`brigade : stations non relues — ${message(erreur)}`);
    }
  };

  const desabonner = [
    runtime.surReveil((cause) => {
      adopter();
      servirLesDistantes(cause === "tick");
      if (cause === "tick") {
        porterLesRegards();
        void rattraper();
        void relireLaBase();
        // À chaque tick, l'arbitre réentend le projet : revenu, il se remplit.
        aRedire = true;
      }
      servir();
    }),
    // Un ticket que le sondage vient de sortir du rail n'attend pas le tick
    // pour que son cook s'arrête.
    runtime.surSondage(() => {
      adopter();
      servirLesDistantes(true);
      porterLesRegards();
      servir();
    }),
  ];

  return {
    ...runtime,
    arreter(signal) {
      // Une station qui s'en va ne retient plus personne : sans cela `status`
      // montrerait la retenue d'une station qui n'est plus là.
      if (!arrete) {
        try {
          noterPourChacune(
            (station) => ({ type: "station.released", payload: { station } }),
            toutes.map((declaree) => declaree.nom).filter((station) => etatStation(base, station)?.heldReason),
          );
        } catch (erreur) {
          avertir(`brigade : retenue ${desStations()} non levée à l'arrêt — ${message(erreur)}`);
        }
      }
      // Aucun serveur ne survit au runtime : ils meurent ici, et le journal,
      // encore ouvert, le dit.
      serveurs.fermer();
      arrete = true;
      // Les cooks survivent au runtime, ou meurent avec lui mais pas dans
      // l'instant : leur bail ne doit pas se renouveler sur un journal fermé.
      regards.clear();
      abandon.abort();
      // Le projet rend sa part ; un arbitre qui n'entend pas ce départ la
      // garde réservée, et le chef le lit.
      if (arbitre !== null) echanges = echanges.then(() => arbitre.quitter(projet)).catch(() => {});
      for (const quitter of desabonner) quitter();
      runtime.arreter(signal);
    },
  };
}
