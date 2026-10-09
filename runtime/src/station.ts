// La station `box/claude` : elle vient prendre un ticket sur le rail, lui
// fabrique un worktree, y lance un cook sous garde-fous, lit comment il finit,
// rend au rail ce que cette fin veut dire, et range le worktree — ce qui y
// traîne commité sur sa branche. Le manager ne spawne rien — c'est elle qui se
// sert.
//
// Le worktree est rendu exécutable avant que le cook n'y entre : le setup du
// projet, s'il en a un, y passe d'abord — le même que celui que la pass joue
// avant les gates — et ce qu'il exporte fait partie de l'environnement du cook.
//
// Elle fait tourner plusieurs cooks à la fois, chacun sur son ticket, dans son
// worktree, sur sa branche. Trois bornes, lues à chaque prise : le plafond de
// cooks que le chef règle, le nombre de tickets en entrée — worktree et setup
// —, et la machine elle-même. Deux tickets dont les zones se recouvrent ne
// partent pas ensemble : c'est le rail qui retient le second.
//
// Elle ne garde en mémoire que les cooks qu'elle attend : pouvoir servir se
// lit dans le journal, donc tient après un redémarrage.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RuntimeAvecRail } from "./alimenter.ts";
import type { Mot } from "./arbitre.ts";
import { ArbitreInjoignable, type Arbitrage, type Reponse } from "./arbitrage.ts";
import { complet, manquant, type Calibrage } from "./calibrage.ts";
import { argumentsClaude, consigne, direRefus, environnementCook, lireFlux, REFUS_MAX, ticketRemis, verdict, VARIABLES_DE_JETON, type Lecture, type Session } from "./claude.ts";
import { ouvrirDepot, type Depot, type OptionsDepot } from "./depot.ts";
import { PART_SANS_PROGRES, type FaitStation, type FinDeCook, type Retenue } from "./evenements/station.ts";
import { illisible, MARQUEUR } from "./fiche.ts";
import { envelopper, type Cloison } from "./cloison.ts";
import { jouerSetup, SCRIPT_SETUP } from "./gates.ts";
import { direDefaut, lireLivrable, type Defaut } from "./livrable.ts";
import { LancementRefuse, nomDeRun, type CookLance, type FinDeCook as FinGardee, type GardeFous, type Verdict } from "./garde-fous.ts";
import type { GitHub } from "./github.ts";
import { VARIABLES_GITHUB } from "./identites.ts";
import { configTranscripts, ouvrirNettoyage } from "./nettoyage.ts";
import { configMachine, direSaturation, JEUNE_MS, lireMachine, reserver, saturation, type Machine, type Saturation, type Seuils } from "./machine.ts";
import { consigneDeRenvoi, RENVOIS_MAX } from "./pass.ts";
import { lire } from "./plafonds.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { etatDeLaBase, passDuTicket, renvoiEnAttente } from "./projections/pass.ts";
import { communsDuRail, lireRail, prisPar, ticketDuRail, type TicketRail } from "./projections/rail.ts";
import { consommationDesCooks, etatStation, plafondDeCooks, refusDAffilee } from "./projections/stations.ts";
import { GesteRefuse } from "./rail.ts";
import { ConfigInvalide } from "./runtime.ts";
import type { Fin } from "./superviseur.ts";
import { DECLARATION, lireSecrets } from "./secrets.ts";
import { horsZone, possede } from "./zones.ts";

export const STATION = "box/claude";
// Un cook = un ticket. Le plafond de cooks tant que le chef n'en a réglé
// aucun : haut, parce que c'est la machine qui borne — à régler par la mesure.
export const COOKS_PAR_DEFAUT = 30;
// Combien de tickets peuvent être en entrée à la fois : un `git worktree add`
// et le setup du projet (un `npm ci`, souvent) par ticket. C'est ce qui borne
// le coût d'entrée quand le rail se remplit d'un coup.
export const ENTREES_PAR_DEFAUT = 4;
const AUTEUR = `station:${STATION}`;

// Les motifs que la station écrit sur le rail.
export const SANS_CALIBRAGE = "no-calibration";
const CALIBRE = "calibrated";
export const FICHE_ILLISIBLE = "unreadable-card";
const FICHE_LISIBLE = "card-readable";
const QUOTA = "quota";
const DECONNEXION = "disconnected";
const REFUS = "refused";
const SETUP_EN_ECHEC = "setup-failed";
// Le ticket n'a pas pu être lu sur GitHub pour être remis au cook.
const TICKET_ILLISIBLE = "ticket-unreadable";
// Les secrets que le dépôt déclare ne peuvent pas être donnés au cook.
export const SECRETS_INDISPONIBLES = "secrets-unavailable";
// Ce que le cook a commité porte la valeur d'un secret : rien n'est poussé.
export const SECRET_LIVRE = "secret-committed";
class SecretLivre extends Error {}
// Un cook qui conclut sans rien commiter : ce qu'il a délimité dans son
// dernier message est son livrable.
export const SANS_DIFF = "no-diff";
// Un cook qui conclut sans rien commiter ni rien délimiter : son message n'est
// pas un livrable, il n'a rien livré.
export const SANS_LIVRABLE = "no-deliverable";
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
// Le setup du projet tient dans la moitié du bail du ticket : le cook part
// avant qu'il ne tombe.
const PART_DU_SETUP = 0.5;
// Ce que la station garde de la sortie d'un setup en échec, pour journald.
const FIN_DE_SETUP_MAX = 2000;
// Le worktree d'un cook est regardé au tick, au plus une fois par dixième de
// bail : un `git status` toutes les trois minutes pour un bail de trente.
const REGARDS_PAR_BAIL = 10;
// GitHub refuse un commentaire au-delà de 65 536 caractères.
const COMPTE_RENDU_MAX = 20_000;
// Ce que le commentaire nomme des fichiers écrits hors zone ; le journal les
// porte tous.
const HORS_ZONE_MAX = 20;

export type ConfigStation = {
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
};

// Lit la configuration de la station dans l'environnement. Ni le clone ni la
// branche n'ont de défaut ; et rien ne doit détourner `claude` de la connexion
// Max de la machine.
export function configStation(env: Record<string, string | undefined>): ConfigStation {
  for (const variable of VARIABLES_DE_JETON) {
    if (env[variable]) {
      throw new ConfigInvalide(
        `${variable} est défini : la station ne pilote \`claude\` que par la connexion Max de la machine, jamais par une clé ou un jeton — retirer la variable`,
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
    clone,
    base,
    bin: env.BRIGADE_CLAUDE_BIN || "claude",
    entreesMax: lire(env, "BRIGADE_MAX_SETUPS", ENTREES_PAR_DEFAUT, "un entier supérieur à zéro", (valeur) => Number.isSafeInteger(valeur) && valeur > 0),
    seuils: configMachine(env),
    gardeTranscriptsMs: configTranscripts(env).gardeMs,
  };
}

export type OptionsStation = {
  repertoireEtat: string;
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
  // Sous cloison, la durée de garde des transcripts du projet. Absente :
  // celle par défaut.
  gardeTranscriptsMs?: number;
  dureeBailMs: number;
  // Le plafond de cooks tant que le chef n'en a réglé aucun.
  cooksParDefaut?: number;
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
};

// Ouvre le dépôt de la station là où le runtime le range : les worktrees des
// cooks vivent dans le répertoire d'état, à côté de leurs flux bruts — le
// temps du cook : chacun part à la fin du sien.
// `jeton` : celui sous lequel elle rapatrie et pousse, quand elle a une
// identité GitHub pour cela.
export function depotDeStation(repertoireEtat: string, config: ConfigStation, jeton?: OptionsDepot["jeton"]): Depot {
  return ouvrirDepot({ clone: config.clone, base: config.base, worktrees: join(repertoireEtat, "worktrees"), jeton });
}

// Ce que la station retient d'un cook entre le moment où elle juge sa fin et
// celui où elle la raconte.
// `sansCommit` : sa branche ne porte aucun commit — il n'y a ni branche à
// pousser ni PR à ouvrir. `recolte` : le commit de ce qu'il avait laissé non
// commité, parti avec sa livraison.
type Conclusion = { fin: FinDeCook; raison: string | null; lecture: Lecture; sansCommit: boolean; recolte: string | null };

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

function entete(fin: string, calibrage: Calibrage, mesure: Fin): string {
  return [
    `**Cook \`${STATION}\` — ${fin}**`,
    `\`${calibrage.model}\` / \`${calibrage.effort}\``,
    pluriel(mesure.turns, "tour"),
    `${nombre(mesure.tokens)} tokens`,
    duree(mesure.durationMs),
  ].join(" · ");
}

const replier = (titre: string, texte: string) => ["<details>", `<summary>${titre}</summary>`, "", texte, "", "</details>"];

// Ce que la station garde et publie du dernier message d'un cook. `publie` :
// son livrable — ce qu'il a délimité — en clair, et ce qui l'entoure replié,
// là pour qui va le chercher. Un message sans délimitation est publié tel
// quel : c'est un compte-rendu, pas un livrable.
type Rendu = { summary: string | null; deliverable: string | null; defaut: Defaut | null; publie: string[] };
function rendre(message: string | null): Rendu {
  const couper = (texte: string | null) => texte?.slice(0, COMPTE_RENDU_MAX) ?? null;
  const livrable = lireLivrable(message);
  const deliverable = couper(livrable.texte);
  const autour = couper(livrable.autour);
  const reste = `Le reste du message du cook${livrable.delimitations > 1 ? ` — il a délimité ${livrable.delimitations} fois, la dernière délimitation est retenue` : ""}`;
  return {
    summary: couper(message),
    deliverable,
    defaut: livrable.defaut,
    publie: deliverable === null ? [autour ?? "_Le cook n'a laissé aucun compte-rendu._"] : [deliverable, ...(autour === null ? [] : ["", ...replier(reste, autour)])],
  };
}

// Le corps de la PR d'une livraison. Le calibrage manque si le ticket l'a
// perdu depuis son cook.
const corpsDePR = (numero: number, calibrage: Calibrage | null, compteRendu: string | null) =>
  [`Ticket #${numero}, cuisiné par \`${STATION}\`${calibrage ? ` (\`${calibrage.model}\` / \`${calibrage.effort}\`)` : ""}.`, "", compteRendu ?? ""].join("\n");

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

// Rend le runtime, augmenté de sa station. Son `arreter` l'emporte avec lui.
export function brancherStation<R extends RuntimeAvecRail & GardeFous>(runtime: R, options: OptionsStation): R {
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  const { depot, github } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const envCook = environnementCook(options.env ?? process.env);
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const pasDeRegard = options.dureeBailMs / REGARDS_PAR_BAIL;
  const annonce = { station: STATION, engine: "claude", provides: ["code"], maxCooks: options.cooksParDefaut ?? COOKS_PAR_DEFAUT };
  const entreesMax = options.entreesMax ?? ENTREES_PAR_DEFAUT;
  const seuils = options.seuils ?? configMachine({});
  const machine = options.machine ?? (() => lireMachine(options.repertoireEtat));
  const noter = (ticket: number | null, fait: FaitStation) => journal.ajouter({ project: projet, ticket, author: AUTEUR, ...fait });

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
  // Lus au démarrage, où aucun cook ne tourne : ce sont ceux qu'une vie
  // précédente a envoyés en pass avant de mourir. Plus tard, le même état est
  // celui d'un cook que la station est en train de raconter.
  const aReprendre: number[] = [];

  base.transaction(() => {
    const connue = etatStation(base, STATION);
    const annoncee = connue && { station: connue.station, engine: connue.engine, provides: connue.provides, maxCooks: connue.maxCooks };
    if (JSON.stringify(annoncee) !== JSON.stringify(annonce)) noter(null, { type: "station.announced", payload: annonce });
    // Aucun cook ne tourne au démarrage : un ticket encore tenu par la station
    // est celui d'une vie précédente, morte entre le prêt et le lancement.
    for (const ticket of rail.tickets()) {
      if (ticket.state === "taken" && ticket.station === STATION) geste(() => rail.rendre(ticket.ticket, "station-restarted", STATION));
      if (ticket.station === STATION && sansCompteRendu(ticket.ticket)) aReprendre.push(ticket.ticket);
    }
  });

  let arrete = false;
  // Le worktree d'un cook part à la fin de ce cook : la station le range, et
  // rattrape au tick ce qui lui a échappé.
  const nettoyage = ouvrirNettoyage({
    journal,
    projet,
    repertoireEtat: options.repertoireEtat,
    depot,
    avertir,
    arrete: () => arrete,
    transcripts: options.cloison ? { claude: options.cloison.claude, gardeMs: options.gardeTranscriptsMs ?? configTranscripts({}).gardeMs } : null,
    maintenant,
  });
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

  const deconnecter = (ticket: number | null, raison: string, run: string | null) => {
    noter(ticket, { type: "station.disconnected", payload: { station: STATION, reason: raison, run } });
    avertir(
      `brigade : connexion Max de la station ${STATION} absente ou expirée (${raison}) — \`claude /login\` sous le compte du service, puis « reprendre »`,
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
  let machineIllisible = false;
  const machineRetient = (tenue: Saturation["resource"] | null): Extract<Retenue, "machine" | "ramp"> | null => {
    let lue: Machine;
    try {
      lue = machine();
      machineIllisible = false;
    } catch (erreur) {
      if (!machineIllisible) avertir(`brigade : machine illisible, la station s'en tient à ce qu'elle savait — ${message(erreur)}`);
      machineIllisible = true;
      return tenue === null ? null : "machine";
    }
    const sature = saturation(lue, seuils, tenue);
    if (sature === null) {
      if (tenue !== null) noter(null, { type: "station.relieved", payload: { station: STATION } });
      const instant = maintenant().getTime();
      departs = departs.filter((depart) => instant - depart < JEUNE_MS);
      return saturation(reserver(lue, entrees + departs.length), seuils) === null ? null : "ramp";
    }
    if (sature.resource !== tenue) {
      noter(null, { type: "station.saturated", payload: { station: STATION, ...sature } });
      avertir(`brigade : la station ${STATION} ne prend plus de ticket, la machine n'en peut plus — ${direSaturation(sature)}`);
    }
    return "machine";
  };

  // Le plafond ne compte que les cooks de tickets : un jugement du manager ou
  // une relecture du reviewer ne retient rien. Il compte les tickets tenus et
  // les cuisines pas encore défaites — le plus grand des deux : un ticket rendu
  // pendant que son cook tourne ne fait pas une place. Tout se lit à chaque
  // prise : un plafond baissé n'arrête personne, il retient la suivante.
  // Rend ce qui retient la station, ou null si elle peut prendre un ticket.
  const ceQuiRetient = (): Retenue | null => {
    const etat = etatStation(base, STATION);
    // La machine se lit d'abord, quoi qu'il arrive ensuite : ce que `status`
    // en dit ne doit pas dépendre d'une autre borne.
    const machine = machineRetient(etat?.saturatedResource ?? null);
    const garde = etatDesGardeFous(base);
    if (garde.stoppedAt !== null) return "stopped";
    if (garde.breakerOpenedAt !== null) return "breaker";
    // Un cook parti d'une base rouge livrerait des gates rouges pour une raison
    // qui n'est pas la sienne : ses renvois se consommeraient pour rien. La
    // pass relit la base ; au vert, la prise reprend d'elle-même.
    if (etatDeLaBase(base)?.outcome === "red") return "base";
    if (etat?.disconnectedAt) return "disconnected";
    if (etat?.quotaUntil && etat.quotaUntil > maintenant().toISOString()) return "quota";
    const plafond = plafondDeCooks(etat ?? { maxCooks: annonce.maxCooks, cap: null });
    if (plafond !== null && Math.max(prisPar(base, STATION), enCuisine.size) >= plafond) return "cap";
    if (entrees >= entreesMax) return "setups";
    return machine;
  };

  // Un ticket qui ne part pas n'est jamais un mystère : quand la station se
  // retient alors qu'un ticket pourrait partir, elle écrit pourquoi — quand la
  // raison change, pas à chaque regard. Sans ticket derrière, il n'y a rien à
  // dire : une station au plafond devant un rail vide ne retient personne.
  const direCeQuiRetient = (retenue: Retenue | null) => {
    const raison = retenue !== null && rail.servables(enCuisine) > 0 ? retenue : null;
    if (raison === (etatStation(base, STATION)?.heldReason ?? null)) return;
    noter(null, raison === null ? { type: "station.released", payload: { station: STATION } } : { type: "station.held", payload: { station: STATION, reason: raison } });
  };

  // --- L'arbitre entre projets. La station le consulte en dernier, ses propres
  // bornes passées, pour chaque ticket qu'elle s'apprête à prendre ; et elle
  // lui redit son état chaque fois qu'il change, et à chaque tick — c'est ce
  // qui remplit un arbitre qui revient.
  const arbitre = options.arbitre ?? null;
  // La place en main : accordée par l'arbitre, ou prise sans lui parce qu'il
  // ne répond pas et qu'aucun cook ne tourne.
  let droit: "arbitre" | "seul" | null = null;
  // Une demande de place est partie, et sa réponse n'est pas revenue.
  let demandeEnVol = false;
  let degrade = etatStation(base, STATION)?.unarbitratedAt != null;
  // Les tickets en cuisine partis sans arbitre.
  const nonArbitres = new Set<number>();
  // Le dernier état dit à l'arbitre, et s'il faut le redire quand même.
  let dernierMot: string | null = null;
  let aRedire = false;
  // Les échanges partent un par un, dans l'ordre : l'arbitre ne garde que le
  // dernier mot.
  let echanges: Promise<void> = Promise.resolve();

  // Les cooks de tickets que la station fait tourner, comptés comme au plafond.
  const cooksTenus = () => Math.max(prisPar(base, STATION), enCuisine.size);
  // Le projet ne demande une place que s'il pourrait la prendre : retenu par
  // une borne que l'arbitre ne lève pas — le « stop », le disjoncteur, la base
  // rouge, la connexion, le quota, son propre plafond —, ses tickets qui
  // attendent ne réservent rien chez les autres. La machine a sa règle ; la
  // montée progressive et le plafond de setups ne sont qu'un pas d'allure, la
  // demande suit dans les secondes.
  const motPourLArbitre = (retenue: Retenue | null): Mot => {
    const demande = (retenue === null || retenue === "machine" || retenue === "ramp" || retenue === "setups") && rail.servables(enCuisine) > 0;
    return { cooks: cooksTenus(), demande, machine: demande && retenue === "machine", nonArbitres: nonArbitres.size, consommation: consommationDesCooks(base, STATION, maintenant()) };
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
            noter(null, { type: "station.unarbitrated", payload: { station: STATION, reason: panne instanceof ArbitreInjoignable ? panne.motif : message(panne) } });
            avertir(`brigade : ${message(panne)} — mode dégradé : la station ${STATION} ne lance plus qu'un cook à la fois, sans arbitrage, jusqu'à son retour`);
          } else if (reponse !== null && degrade) {
            degrade = false;
            noter(null, { type: "station.arbitrated", payload: { station: STATION } });
            avertir(`brigade : l'arbitre répond à nouveau — fin du mode dégradé de la station ${STATION}`);
          }
        } finally {
          suite(reponse);
        }
      })
      .catch((erreur) => {
        // Rien ne doit rompre la file : l'échange suivant en dépend.
        try {
          if (!arrete) avertir(`brigade : la station ${STATION} a buté en parlant à l'arbitre — ${message(erreur)}`);
        } catch {}
      });
  };
  // La station a-t-elle le droit de lancer un cook de plus ? Null : oui, la
  // place est en main. Sinon la demande part — une à la fois —, et sa réponse
  // relance le service ou dit ce qui retient.
  const placeEnMain = (joint: Arbitrage): "attente" | null => {
    if (droit === "arbitre" || (droit === "seul" && cooksTenus() === 0)) return null;
    droit = null;
    if (demandeEnVol) return "attente";
    demandeEnVol = true;
    const dit = motPourLArbitre(null);
    dernierMot = JSON.stringify(dit);
    echanger(joint, { ...dit, veut: true }, (reponse) => {
      demandeEnVol = false;
      if (reponse?.accorde) droit = "arbitre";
      // Sans arbitre, au plus un cook : celui-ci, si aucun ne tourne.
      else if (reponse === null && cooksTenus() === 0) droit = "seul";
      else return direCeQuiRetient(reponse === null ? "unarbitrated" : "arbiter");
      servir();
    });
    return "attente";
  };
  const redire = (joint: Arbitrage, retenue: Retenue | null) => {
    const dit = motPourLArbitre(retenue);
    const cle = JSON.stringify(dit);
    if (!aRedire && cle === dernierMot) return;
    aRedire = false;
    dernierMot = cle;
    echanger(joint, { ...dit, veut: false }, () => {});
  };
  // Un projet qui n'a plus d'arbitre n'est plus en mode dégradé.
  if (arbitre === null && degrade) {
    degrade = false;
    noter(null, { type: "station.arbitrated", payload: { station: STATION } });
  }

  // Un ticket refusé revient en attente dès que ce qui lui manquait est là :
  // son calibrage, une fiche lisible.
  const rendreLesCorriges = () => {
    for (const ticket of rail.tickets()) {
      if (ticket.state !== "86") continue;
      if (ticket.reason === SANS_CALIBRAGE && complet(ticket)) geste(() => rail.rendre(ticket.ticket, CALIBRE));
      if (ticket.reason === FICHE_ILLISIBLE && illisible(ticket.card) === null) geste(() => rail.rendre(ticket.ticket, FICHE_LISIBLE));
    }
  };

  const refuser = async (ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: SANS_CALIBRAGE, station: STATION }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${STATION}\` — ticket non calibré.** Aucun cook n'est lancé sans modèle ni effort explicites.`,
        "",
        `Il manque : \`${manquant(ticket)}\` — un seul label par dimension. Le ticket est 86 ; il reviendra en attente tout seul une fois posé.`,
      ].join("\n"),
    );
  };

  const refuserLaFiche = async (ticket: TicketRail) => {
    if (!geste(() => rail.quatreVingtSix(ticket.ticket, { motif: FICHE_ILLISIBLE, station: STATION }))) return;
    await commenter(
      ticket.ticket,
      [
        `**Station \`${STATION}\` — fiche du ticket illisible.** Aucun cook n'est lancé sur une fiche que le runtime ne comprend pas.`,
        "",
        ...(ticket.card?.problems ?? []).map((probleme) => `- ${probleme}`),
        "",
        `La fiche est le commentaire de cette issue marqué \`${MARQUEUR}\` — le marqueur se voit en l'éditant. Corrige-la sur place : le ticket est 86 ; il reviendra en attente tout seul une fois la fiche lisible.`,
      ].join("\n"),
    );
  };

  // Les secrets que le dépôt déclare ne peuvent pas être donnés : aucun cook
  // n'est lancé, et le ticket est reproposé dix minutes plus tard — une valeur
  // posée entre-temps suffit, sans rien redémarrer. Le chef l'apprend sur
  // l'issue, une fois : le commentaire n'est reposé que si les problèmes
  // changent, ou si un cook est parti depuis.
  const refuserSansSecrets = async (numero: number, problemes: string[]) => {
    const neuf = base.transaction(() => {
      const dernier = journal.duTicket(numero).findLast((evenement) => evenement.type === "secrets.unavailable" || evenement.type === "cook.launched");
      const dits = dernier?.type === "secrets.unavailable" ? dernier.payload.problems : null;
      if (!geste(() => rail.quatreVingtSix(numero, { motif: SECRETS_INDISPONIBLES, retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }))) return false;
      if (JSON.stringify(dits) === JSON.stringify(problemes)) return false;
      noter(numero, { type: "secrets.unavailable", payload: { station: STATION, problems: problemes } });
      return true;
    });
    if (!neuf) return;
    avertir(`brigade : secrets du projet indisponibles pour le ticket #${numero} — aucun cook n'est lancé\n${problemes.join("\n")}`);
    await commenter(
      numero,
      [
        `**Station \`${STATION}\` — secrets du projet indisponibles.** Aucun cook n'est lancé sans les secrets que le dépôt déclare (\`${DECLARATION}\`).`,
        "",
        ...problemes.map((probleme) => `- ${probleme}`),
        "",
        "Les valeurs vivent sur la machine, dans le fichier que nomme `BRIGADE_SECRETS_FILE` (`NOM=valeur`, une par ligne, `chmod 600`) ; il est relu à chaque essai, rien n'est à redémarrer. Le ticket est 86 ; il est reproposé toutes les dix minutes, et son cook partira dès que plus rien ne manque.",
      ].join("\n"),
    );
  };

  // La zone que le ticket portait la dernière fois qu'il a été pris. C'est
  // elle qui juge la livraison, pas celle du jour : le cook tourne sous le
  // compte du service, et peut éditer la fiche de son propre ticket.
  const zoneALaPrise = (numero: number): string[] => {
    let zone: string[] = [];
    let prise: string[] = [];
    for (const evenement of journal.duTicket(numero)) {
      if (evenement.type === "ticket.arrived" || evenement.type === "ticket.changed") zone = evenement.payload.card?.zone ?? [];
      else if (evenement.type === "ticket.taken") prise = zone;
    }
    return prise;
  };

  // Confronte une livraison à la zone de son ticket : ce qu'elle écrit
  // ailleurs, et une fiche qui a changé pendant la cuisson, vont au journal.
  // Rend ce qu'il y a à en dire sur le ticket — rien, le plus souvent. Un
  // signal, jamais un arrêt : un ticket pris sans zone ne possède rien, et
  // n'est pas signalé.
  const signalerHorsZone = (numero: number, run: string, branche: string): string[] => {
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
    noter(numero, { type: "cook.out-of-zone", payload: { run, zone, files, cardChanged } });
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

  // Raconte la fin d'un cook : au rail, au journal, puis sur le ticket.
  const conclure = async (
    ticket: TicketRail,
    calibrage: Calibrage,
    lance: CookLance,
    branche: string,
    fin: FinGardee,
    conclusion: Conclusion | null,
    reprise: Reprise | null,
  ) => {
    const numero = ticket.ticket;
    const { run } = lance;
    const rendu = rendre(conclusion?.lecture.message ?? null);
    const compteRendu = rendu.summary;
    const rapporter = (ending: FinDeCook, reason: string | null, pr: string | null) =>
      noter(numero, { type: "cook.reported", payload: { run, ending, reason, summary: compteRendu, deliverable: rendu.deliverable, branch: branche, pr } });
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
            entete("arrêté : le ticket a quitté le rail", calibrage, fin),
            `Rien n'est poussé, et aucun cook ne repartira : le ticket n'est plus sur le rail. Son worktree est retiré ; ce que ce cook avait écrit, commité ou non, est sur la branche \`${branche}\` du clone de la station.`,
          ].join("\n"),
        );
        return;
      case "interrupted":
        return;
      case "ok": {
        geste(() => rail.envoyerEnPass(numero, STATION));
        // Sans diff, il n'y a ni branche poussée ni PR : la pass fait relire
        // le compte-rendu.
        const sansDiff = conclusion?.raison === SANS_DIFF;
        const sansCommit = conclusion?.sansCommit === true;
        // Un renvoi livre sur la PR de la livraison qu'il corrige.
        let pr: string | null = reprise?.pr ?? null;
        let sansPR = "";
        try {
          if (!sansCommit && !parti()) {
            pr ??= await github.ouvrirPR({
              branche,
              base: options.base,
              titre: `#${numero} — ${ticket.title}`,
              corps: corpsDePR(numero, calibrage, rendu.deliverable ?? compteRendu),
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
          const lignes = sansCommit || sorti ? [] : signalerHorsZone(numero, run, branche);
          rapporter("done", conclusion?.raison ?? null, pr);
          return lignes;
        });
        if (sorti) {
          await commenter(
            numero,
            [
              entete("fini, ticket sorti du rail", calibrage, fin),
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
            entete(sansDiff ? "fini, sans diff" : recolte === null ? "fini" : `récolté (${recolte})`, calibrage, fin),
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
        rapporter("failed", raison, null);
        await commenter(
          numero,
          [
            entete(`échoué (${raison})`, calibrage, fin),
            ...(bailTombe === null ? [] : [bailTombe]),
            ...(sansLivrable
              ? [`Aucun commit, et ${direDefaut(rendu.defaut)} dans le dernier message du cook : il n'a pas de livrable. Un message n'en est pas un, quelle que soit sa longueur — seul ce qui est délimité est publié et relu.`]
              : []),
            ...(raison.startsWith(SECRET_LIVRE)
              ? [
                  `Ce que le cook a commité porte la valeur d'un secret du projet (${raison.slice(SECRET_LIVRE.length + 2)}) : la station ne pousse pas une branche qui en publierait un. ${
                    reprise === null
                      ? "Le cook suivant repart de la base."
                      : `C'était un renvoi : la branche \`${branche}\` est ramenée à la livraison que la pass avait refusée — ce que ce cook y avait ajouté est perdu —, et le cook suivant en repart.`
                  }`,
                ]
              : []),
            raison.startsWith(SECRET_LIVRE) && reprise !== null
              ? "Rien n'est poussé. Le ticket est revenu en attente."
              : `Rien n'est poussé. Le ticket est revenu en attente ; le travail du cook reste sur la station, branche \`${branche}\`.`,
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
          const fait = geste(() => (remonte ? rail.quatreVingtSix(numero, { motif: REFUS, station: STATION }) : rail.rendre(numero, REFUS, STATION)));
          rapporter("refused", conclusion?.raison ?? null, null);
          return fait;
        });
        if (tenu && remonte) avertir(`brigade : le modèle a refusé ${refus} fois d'affilée le ticket #${numero} — remonté au chef`);
        await commenter(
          numero,
          [
            entete(`refusé par le modèle, essai ${Math.min(refus, REFUS_MAX)}/${REFUS_MAX}`, calibrage, fin),
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
            geste(() => rail.quatreVingtSix(numero, { motif: QUOTA, retour, station: STATION }));
            noter(null, { type: "station.86", payload: { station: STATION, reason: QUOTA, until: retour.toISOString(), window: conclusion.lecture.quota?.fenetre ?? null } });
            rapporter("86", QUOTA, null);
          });
          return;
        }
        base.transaction(() => {
          geste(() => rail.rendre(numero, DECONNEXION, STATION));
          deconnecter(numero, "authentication_failed", run);
          rapporter("disconnected", "authentication_failed", null);
        });
        await commenter(
          numero,
          [
            `**Station \`${STATION}\` — connexion Max expirée.** Le cook de ce ticket n'a pas pu parler au modèle : le ticket est revenu en attente, et la station ne prend plus rien.`,
            "",
            "Sur la machine : `claude /login` sous le compte du service, puis `npm --prefix runtime run garde-fous -- reprendre`.",
          ].join("\n"),
        );
        return;
      }
    }
  };

  // Cuisine un ticket que la station vient de prendre. Résolue quand le cook
  // est fini et sa fin racontée. `parti` : appelé une fois le cook lancé —
  // l'entrée du ticket est finie.
  const cuisiner = async (ticket: TicketRail, parti: () => void, sansArbitre: boolean) => {
    const numero = ticket.ticket;
    if (!complet(ticket)) return refuser(ticket);
    if (illisible(ticket.card) !== null) return refuserLaFiche(ticket);
    const calibrage: Calibrage = { model: ticket.model, effort: ticket.effort };

    const run = nomDeRun(numero);
    // Un ticket renvoyé par la pass se reprend là où il a été livré : même
    // branche, même PR, dans un worktree neuf accroché à cette branche — celui
    // de la livraison est parti avec son cook. Si le clone ne connaît plus la
    // branche, le cook repart de la base comme un premier.
    const renvoi = renvoiEnAttente(base, numero);
    let worktree: string;
    let branche: string;
    let repris: typeof renvoi = null;
    // La tête de la branche avant que le cook n'y entre : ce qu'il y ajoute se
    // lit contre elle.
    let entree: string;
    try {
      repris = renvoi !== null && depot.connait(renvoi.branch) ? renvoi : null;
      ({ worktree, branche } = repris ? { worktree: await depot.reprendre(run, repris.branch), branche: repris.branch } : await depot.preparer(run));
      entree = depot.tete(branche);
    } catch (erreur) {
      if (arrete) return;
      avertir(`brigade : worktree impossible à préparer pour le ticket #${numero} — ${message(erreur)}`);
      geste(() =>
        rail.quatreVingtSix(numero, { motif: "worktree-failed", retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
      );
      return;
    }
    if (arrete) return;

    // Un worktree neuf n'est pas exécutable. Un setup en échec ne lance aucun
    // cook — donc ne consomme rien, et ne compte pas pour le disjoncteur : le
    // ticket est reproposé dix minutes plus tard, et le worktree, s'il était
    // neuf, ne reste pas.
    // Un worktree où aucun cook n'entrera ne reste pas. La branche d'un renvoi
    // porte une livraison : elle, si.
    const retirerLeNeuf = () => {
      try {
        depot.retirer(worktree, repris ? undefined : branche);
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
      return refuserSansSecrets(numero, secrets.problemes);
    }
    // Sans secret, rien n'est à masquer : le flux s'écrit tel qu'il arrive.
    const masquer = Object.keys(secrets.env).length === 0 ? undefined : secrets.masquer;
    const delaiSetupMs = options.dureeBailMs * PART_DU_SETUP;
    const interdites = options.sansIdentite ? [...VARIABLES_DE_JETON, ...VARIABLES_GITHUB] : VARIABLES_DE_JETON;
    const setup = await jouerSetup({ worktree, ticket: numero, env: { ...envCook, ...secrets.env }, interdites, masquer, cloison: options.cloison, delaiMs: delaiSetupMs, signal: abandon.signal });
    if (arrete) return;
    if (!setup.pret) {
      const pourquoi = setup.depasse ? `plafond de ${duree(delaiSetupMs)} dépassé` : setup.code === null ? "interrompu" : `code de sortie ${setup.code}`;
      avertir(
        [`brigade : setup du worktree en échec pour le ticket #${numero} (\`${SCRIPT_SETUP}\`, ${pourquoi}) — aucun cook n'est lancé`, setup.sortie.trim().slice(-FIN_DE_SETUP_MAX)]
          .filter(Boolean)
          .join("\n"),
      );
      geste(() =>
        rail.quatreVingtSix(numero, { motif: SETUP_EN_ECHEC, retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
      );
      retirerLeNeuf();
      return;
    }
    // Le setup a pris sur le bail : le cook part avec un bail entier. Refusé,
    // le ticket a quitté la station pendant le setup.
    if (setup.joue && !geste(() => rail.renouveler(numero, STATION))) return retirerLeNeuf();
    // Sans setup, rien n'a encore vérifié que la station tient toujours le
    // ticket : rendu pendant la préparation du worktree, il n'a pas de cook.
    const garde = ticketDuRail(base, numero);
    if (garde?.state !== "taken" || garde.station !== STATION) return retirerLeNeuf();
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
        geste(() =>
          rail.quatreVingtSix(numero, { motif: TICKET_ILLISIBLE, retour: new Date(maintenant().getTime() + REPLI_WORKTREE_MS), station: STATION }),
        );
        return retirerLeNeuf();
      }
      // Lire le ticket a pris du temps : rendu entre-temps, il n'a pas de cook.
      const tenu = ticketDuRail(base, numero);
      if (tenu?.state !== "taken" || tenu.station !== STATION) return retirerLeNeuf();
    }

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
            const livres = masquer === undefined ? [] : secrets.fuites(depot.ajouts(branche));
            if (livres.length > 0) {
              // Un renvoi se reprend sur la même branche : elle revient à la
              // livraison que la pass avait refusée, sans quoi le commit
              // fautif condamnerait chaque cook suivant du ticket.
              if (repris) depot.revenir(worktree, branche);
              throw new SecretLivre(livres.map((nom) => `\`${nom}\``).join(", "));
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
          [lu, raison] = ["failed", erreur instanceof HorsBranche ? HORS_BRANCHE : erreur instanceof SecretLivre ? `${SECRET_LIVRE}: ${erreur.message}` : `push-failed: ${message(erreur)}`];
        }
      }
      conclusion = { fin: lu, raison, lecture, sansCommit, recolte };
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

    const mission = { ticket: numero, titre: ticket.title, depot: options.depotGitHub, base: options.base, ...(remis === undefined ? {} : { remis }) };
    let lance: CookLance;
    try {
      lance = runtime.lancer({
        ticket: numero,
        run,
        contexte: {
          station: STATION,
          ...calibrage,
          branch: branche,
          worktree: join("worktrees", run),
          // Passé les renvois de la pass, c'est une relance du manager : sa
          // livraison ne vaudra réussite que jugée verte.
          ...(renvoi !== null && renvoi.returns > RENVOIS_MAX ? { relaunch: true } : {}),
          // L'arbitre entre projets ne répondait pas : ce lancement n'est pas arbitré.
          ...(sansArbitre ? { unarbitrated: true } : {}),
        },
        // Le ticket remis vit dans l'état, que la cloison masque : il est
        // rendu au cook, en lecture seule.
        ...envelopper(
          options.cloison,
          {
            commande: options.bin,
            args: argumentsClaude(
              repris
                ? consigneDeRenvoi({ ...mission, branche, n: repris.returns, findings: repris.findings })
                : consigne(mission),
              calibrage,
            ),
          },
          { cwd: worktree, depot: "ecriture", lit: remis === undefined ? [] : [remis] },
        ),
        cwd: worktree,
        env: envDuCook,
        masquer,
        juger,
      });
    } catch (erreur) {
      if (!(erreur instanceof LancementRefuse)) throw erreur;
      // « stop » ou disjoncteur, arrivés entre le prêt et le lancement.
      geste(() => rail.rendre(numero, `launch-refused:${erreur.motif}`, STATION));
      return retirerLeNeuf();
    }

    parti();

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
      if (tenu?.state !== "taken" || tenu.station !== STATION) return lance.arreter();
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
        if (!geste(() => rail.renouveler(numero, STATION))) lance.arreter();
      } else if (echu) {
        lance.arreter({ reason: "lease", limit: options.dureeBailMs, observed: instant - progres });
      } else if (!signale && instant - progres >= options.dureeBailMs * PART_SANS_PROGRES) {
        // Le chef le lit sans l'avoir demandé, avant que le bail ne tombe.
        signale = true;
        noter(numero, { type: "cook.stalled", payload: { run, station: STATION, idleMs: instant - progres, leaseMs: options.dureeBailMs } });
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
    // Arrêté, le runtime ne range rien : le rattrapage du démarrage suivant
    // s'en charge.
    if (arrete) return;
    try {
      await conclure(ticket, calibrage, lance, branche, fin, conclusion, repris && { n: repris.returns, pr: repris.pr });
      options.apresCook?.();
    } finally {
      // Réussi ou non, le cook est fini : son worktree part, ce qui y traîne
      // commité sur sa branche.
      if (!arrete) await nettoyage.ranger(numero, join("worktrees", run), branche);
    }
  };

  // Raconte une livraison que la vie précédente a envoyée en pass sans avoir
  // pu le faire. Sa branche est poussée — le push précède la fin du cook ; sa
  // PR, ouverte ou non : GitHub le dit, et elle n'est ouverte que s'il n'en
  // connaît aucune. Le compte-rendu se relit dans le flux brut du cook.
  const reprendre = async (numero: number) => {
    const livraison = passDuTicket(base, numero);
    const ticket = ticketDuRail(base, numero);
    if (!livraison || !ticket || livraison.branch === null) return;
    const { run, branch: branche } = livraison;
    let rendu = rendre(null);
    try {
      rendu = rendre(lireFlux(readFileSync(join(options.repertoireEtat, "runs", `${run}.jsonl`), "utf8")).message);
    } catch {
      // Sans flux, la livraison se raconte sans le dernier mot du cook.
    }
    const compteRendu = rendu.summary;
    let pr = livraison.pr;
    let sansPR = "";
    // Une livraison sans diff n'a jamais eu de PR à ouvrir.
    let sansDiff = false;
    try {
      sansDiff = depot.commits(branche) === 0;
    } catch {
      // Une branche illisible : la livraison se raconte comme un diff.
    }
    try {
      pr ??= (await github.prDeBranche(branche))?.url ?? null;
      if (!sansDiff) pr ??= await github.ouvrirPR({
        branche,
        base: options.base,
        titre: `#${numero} — ${ticket.title}`,
        corps: corpsDePR(numero, complet(ticket) ? ticket : null, rendu.deliverable ?? compteRendu),
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
      if (!sansDiff) horsDeSaZone = signalerHorsZone(numero, run, branche);
      noter(numero, { type: "cook.reported", payload: { run, ending: "done", reason: sansDiff ? SANS_DIFF : null, summary: compteRendu, deliverable: rendu.deliverable, branch: branche, pr, reconciled: true } });
      return true;
    });
    if (!raconte) return;
    avertir(`brigade : livraison du ticket #${numero} reprise après un redémarrage (branche ${branche}) — elle part en pass`);
    await commenter(
      numero,
      [
        `**Cook \`${STATION}\` — livraison reprise après un redémarrage du runtime.** Le cook avait fini et poussé son travail ; le runtime s'est arrêté avant d'en rendre compte.`,
        !sansDiff
          ? `Branche \`${branche}\` · ${pr ?? `PR non ouverte : ${sansPR}`}`
          : rendu.deliverable === null
            ? `Aucun commit, et ${direDefaut(rendu.defaut)} dans le dernier message du cook : il n'a pas de livrable, et la pass le lui renverra.`
            : "Aucun commit : le livrable de ce ticket est ce que le cook a délimité, ci-dessous, que le reviewer relit en pass.",
        ...horsDeSaZone,
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

  // Le ticket part en cuisine, et la prise n'attend pas sa fin. Ce qui bute sur
  // un ticket n'emporte ni le runtime ni les autres cooks : il revient par son
  // bail.
  const partir = async (ticket: TicketRail, sansArbitre: boolean) => {
    entrees++;
    enCuisine.set(ticket.ticket, illisible(ticket.card) === null ? (ticket.card?.zone ?? []) : []);
    if (sansArbitre) nonArbitres.add(ticket.ticket);
    let enEntree = true;
    const sortir = () => {
      if (!enEntree) return;
      enEntree = false;
      entrees--;
    };
    try {
      await cuisiner(
        ticket,
        () => {
          sortir();
          departs.push(maintenant().getTime());
          servir();
        },
        sansArbitre,
      );
    } catch (erreur) {
      if (!arrete) avertir(`brigade : la station ${STATION} a buté sur le ticket #${ticket.ticket} — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    } finally {
      sortir();
      enCuisine.delete(ticket.ticket);
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
        let retenue: Retenue | null = null;
        // La réponse de l'arbitre est attendue : rien n'est encore à dire.
        let enAttente = false;
        while (!arrete) {
          retenue = ceQuiRetient();
          if (retenue !== null) break;
          if (arbitre !== null) {
            // Sans ticket à prendre, il n'y a rien à lui demander.
            if (rail.servables(enCuisine) === 0) break;
            enAttente = placeEnMain(arbitre) !== null;
            if (enAttente) break;
          }
          const ticket = rail.prendre(STATION, enCuisine);
          if (!ticket) break;
          const sansArbitre = droit === "seul";
          droit = null;
          void partir(ticket, sansArbitre);
        }
        // Une place accordée et pas prise se rend : l'arbitre l'a déjà comptée.
        if (droit !== null) {
          droit = null;
          aRedire = true;
        }
        if (arrete) break;
        if (!enAttente) direCeQuiRetient(retenue);
        if (arbitre !== null && !demandeEnVol) redire(arbitre, retenue);
      } while (aRefaire && !arrete);
    } catch (erreur) {
      // Rien ne doit tuer le runtime depuis ici : le réveil suivant relance le
      // service.
      if (!arrete) avertir(`brigade : la station ${STATION} a buté — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
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
    if ((session === "absente" || session === "introuvable") && !etatStation(base, STATION)?.disconnectedAt) {
      deconnecter(null, session === "absente" ? "not-logged-in" : `binaire introuvable : ${options.bin}`, null);
    }
    pret = true;
    servir();
  });

  // Un regard qui bute n'empêche pas les autres : chaque cook a le sien.
  const porterLesRegards = () => {
    for (const observer of [...regards]) {
      try {
        observer();
      } catch (erreur) {
        if (!arrete) avertir(`brigade : la station ${STATION} a buté en regardant un worktree — ${message(erreur)}`);
      }
    }
  };

  const desabonner = [
    runtime.surReveil((cause) => {
      if (cause === "tick") {
        porterLesRegards();
        void rattraper();
        // À chaque tick, l'arbitre réentend le projet : revenu, il se remplit.
        aRedire = true;
      }
      servir();
    }),
    // Un ticket que le sondage vient de sortir du rail n'attend pas le tick
    // pour que son cook s'arrête.
    runtime.surSondage(() => {
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
          if (etatStation(base, STATION)?.heldReason) noter(null, { type: "station.released", payload: { station: STATION } });
        } catch (erreur) {
          avertir(`brigade : retenue de la station ${STATION} non levée à l'arrêt — ${message(erreur)}`);
        }
      }
      arrete = true;
      // Les cooks meurent avec le runtime, mais pas dans l'instant : leur bail
      // ne doit pas se renouveler sur un journal fermé.
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
