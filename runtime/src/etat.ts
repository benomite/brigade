// L'état de la cuisine tel que le chef le lit : le runtime et son dernier tick,
// la dernière sauvegarde, ce qui l'attend, le rail, les cooks en cours et ce
// qu'ils ont consommé, les serveurs allumés, les derniers événements. Tout vient du journal et de
// ses projections — rien n'est calculé ni gardé ailleurs, et rien n'est écrit.
import { direActivite, type Activite } from "./activite.ts";
import { activitesDuRail, type ActiviteDeTicket } from "./activites.ts";
import { DIRE_GATES_COUPEES } from "./evenements/pass.ts";
import { attentesDuChef, decrireAttentes, direAttente, nommerAttente, passageEnService, type Attente, type Passage } from "./attend.ts";
import { geste } from "./geste.ts";
import { fournitTout } from "./capacites.ts";
import type { Evenement } from "./evenements.ts";
import { RELEVE } from "./evenements/garde-fous.ts";
import { PART_SANS_PROGRES } from "./evenements/station.ts";
import { BATTEMENT } from "./evenements/runtime.ts";
import { direControleRetenu, suiteDeBaseRouge } from "./dire-base.ts";
import { requises } from "./fiche.ts";
import { ACTIONS, bientotEteint, direExtinction, direReste } from "./grant.ts";
import type { Journal } from "./journal.ts";
import { formaterEvenement } from "./ligne-evenement.ts";
import { direSaturation } from "./machine.ts";
import { direJauge, franchis, SANS_SEUIL, type Franchi } from "./mesures.ts";
import { tokensEnVol, VOIR } from "./dire-mise-en-service.ts";
import {
  activitesDesCooksEnCours,
  consommation,
  cooksEnCours,
  cooksEnVol,
  etatDesGardeFous,
  mesuresDesCooksEnCours,
  type Consommation,
  type CookEnCours,
  type CookEnVol,
  type EtatGardeFous,
  type Mesure,
} from "./projections/garde-fous.ts";
import { livraisonsMergees, seuilsEnVigueur } from "./projections/mesures.ts";
import { demandeDeMiseEnService, type Demande } from "./projections/mise-en-service.ts";
import { bilanSansGrant, controleRetenu, etatDeLaBase, etatDuGrant, reparationDeLaBase, type ControleRetenu, type EtatDeLaBase, type Grant, type ReparationDeLaBase, type SansGrant } from "./projections/pass.ts";
import { direMotifDeGarde, rangementDesTranscripts, worktreesGardes, type RangementDeTranscripts, type WorktreeGarde } from "./projections/nettoyage.ts";
import { lireRail, livresDepuis, type Etat as EtatTicket, type Livre, type TicketRail } from "./projections/rail.ts";
import { direEtatDeServeur, direPage, direServiceIndisponible, serveursEnCours, servicesIndisponibles, type Serveur, type ServiceIndisponible } from "./projections/service.ts";
import { derniereSauvegarde, type Sauvegarde } from "./projections/sauvegardes.ts";
import { dernierTick, derniereSession, type SessionPassee, type Tick } from "./projections/sessions.ts";
import { versionComparee, type VersionComparee } from "./projections/version.ts";
import { cookDeRun, cooksEnCoursDeStation, direDeconnexion, direRetenueDeStation, etatStation, GESTE_DE_CONNEXION, plafondDeCooks, sansStationDepuis, miseDeCoteBloquee, setupBloque, stationsAnnoncees, type CookDeStation, type EtatStation, type MiseDeCoteBloquee, type SetupBloque } from "./projections/stations.ts";
import { BLOQUE, direRetenue, EN_WAITING, etatLu, nomEtat } from "./rail.ts";
import { PAR_LE_CHEF } from "./evenements/rail.ts";
import { direAttenteDeTiers } from "./attente.ts";
import { direMiseDeCote } from "./mise-de-cote.ts";
import { GESTE_DE_STATION_A_CHAUD } from "./stations-declarees.ts";
import { alerteEnCours, type AlerteEnCours } from "./projections/urgence.ts";
import { cleDUrgence, urgenceDuChef, type Urgence } from "./urgence.ts";

const EVENEMENTS_MONTRES = 15;
// La cadence à laquelle le suivi regarde si le journal a changé : une lecture
// de `PRAGMA data_version`, qui ne coûte rien à l'écrivain.
const VEILLE_MS = 250;
// L'âge au-delà duquel la dernière sauvegarde est marquée, faute de réglage :
// deux cadences du timer livré. Une nuit manquée se rattrape au démarrage
// suivant ; deux, c'est une sauvegarde qui ne se fait plus.
export const AGE_MAX_SAUVEGARDE_MS = 48 * 3_600_000;
// Ce que l'en-tête et la ligne de chaque cook résument déjà : un par minute,
// ils noieraient les autres événements.
const RESUMES = [BATTEMENT, RELEVE];
const HEURE_MS = 3_600_000;
// Les fenêtres du relevé agrégé : celle du quota Max — que le chef compare à
// `/usage` —, et la journée.
const FENETRES_H = [5, 24];

// L'ordre dans lequel le chef compte son rail : ce qui bouge d'abord. Les
// tickets bloqués se comptent à part de ceux qui attendent : eux ne partiront
// pas seuls. Ceux qui attendent un tiers, à part des autres 86.
const ETATS: EtatTicket[] = ["taken", "pass", "waiting", "86", "served"];
const ORDRE = ETATS.flatMap((etat) => (etat === "waiting" ? [nomEtat(etat), BLOQUE] : etat === "86" ? [nomEtat(etat), EN_WAITING] : [nomEtat(etat)]));

export type EtatCuisine = {
  // Le numéro du dernier événement au moment de la lecture : le suivi en
  // direct repart de là.
  dernierSeq: number;
  projet: string | null;
  session: SessionPassee | null;
  // Le dernier tick de la session en cours, s'il y en a eu un.
  tick: Tick | null;
  gardeFous: EtatGardeFous;
  // La dernière sauvegarde réussie, si le projet en a une.
  sauvegarde: Sauvegarde | null;
  rail: TicketRail[];
  // Ce que la cuisine fait en ce moment de chaque ticket pris ou en pass — nul
  // quand le runtime ne le sait pas. Les autres tickets n'y sont pas.
  activites: Map<number, ActiviteDeTicket | null>;
  // Ce qui attend une décision du chef, le plus ancien d'abord.
  attend: Attente[];
  // Non nulle : plus rien ne cuit, et c'est le chef que toute la cuisine
  // attend (urgence.ts). Nulle aussi quand le chef a lui-même arrêté la
  // cuisine : c'est son « stop » qui la retient.
  urgence: Urgence | null;
  // L'alerte que le runtime a émise pour elle, lue du journal : app fermée
  // comme ouverte. Nulle tant que rien n'a été annoncé.
  alerteUrgence: AlerteEnCours | null;
  // Ce que sont devenues les livraisons arrêtées faute de grant.
  sansGrant: SansGrant;
  // La version que le dernier geste de box a mise en service, s'il date de
  // moins d'un jour à la lecture.
  passage: Passage | null;
  // Ce que le runtime en marche a constaté en comparant la version qu'il sert
  // à la branche de son origine ; nulle tant qu'il n'a rien comparé.
  version: VersionComparee | null;
  // La mise en service que le chef a demandée au runtime, si elle vit encore,
  // et les cooks en vol : ce qu'un redémarrage interromprait.
  miseEnService: { demande: Demande | null; enVol: CookEnVol[] };
  // Le dernier contrôle de la base d'intégration : rouge, elle retient la cuisine.
  base: EtatDeLaBase | null;
  // Le contrôle de la base que son rapatriement retient, rouge ou non.
  baseRetenue: ControleRetenu | null;
  // Le ticket de réparation de la base rouge, tel que la pass le suit : nul sans réparation.
  reparation: ReparationDeLaBase | null;
  // Les grants donnés, tels qu'ils valent à l'heure de la lecture.
  grants: Grant[];
  // Les stations annoncées : leur plafond de cooks, et la machine si elle sature.
  stations: EtatStation[];
  // Non nul : le projet ne déclare aucune station depuis cet instant, et aucun
  // cook ne part.
  sansStation: string | null;
  // Non nul : le setup du projet est bloqué sur un échec qui se répète, et
  // aucun setup n'est lancé d'ici tant que la branche d'intégration ne bouge pas.
  setup: SetupBloque | null;
  // Non nul : une autre cause de mise de côté s'est répétée à l'identique, et
  // aucun ticket n'est pris d'ici tant que la branche d'intégration ne bouge pas.
  miseDeCote: MiseDeCoteBloquee | null;
  // `station` : ce que sa station dit du cook — son calibrage, sa branche, son
  // worktree —, ou null pour un cook d'avant elle.
  // `activite` : ce qu'il fait en ce moment, d'après son dernier relevé qui le dit.
  cooks: Array<CookEnCours & { mesure: Mesure | null; station: CookDeStation | null; activite: Activite | null }>;
  // Les cooks en cours tels que `station` les montre : station par station, le
  // plus ancien d'abord.
  auxFourneaux: Array<{ station: string; ticket: number | null }>;
  // Les serveurs qui tournent : une livraison d'interface, servie depuis son
  // worktree sur le port de ce worktree.
  serveurs: Serveur[];
  // Ce qui empêche le projet d'être servi — rien, le plus souvent.
  sansService: ServiceIndisponible[];
  // Ce que l'ensemble des cooks a consommé : ceux qui tournent, puis, par
  // fenêtre glissante, ceux qui tournent et ceux qui ont fini dedans.
  // Les worktrees que le nettoyage a gardés après leur ticket.
  worktrees: WorktreeGarde[];
  // Le dernier rangement des transcripts du projet, s'il est cloisonné.
  transcripts: RangementDeTranscripts | null;
  consommation: { enCours: Consommation; fenetres: Array<{ heures: number } & Consommation> };
  // Les mesures du projet qui ont franchi un seuil déclaré.
  derive: Franchi[];
  // Les tickets servis dans les 24 h avant la lecture, le plus récent d'abord.
  livres: Livre[];
  evenements: Evenement[];
};

// `maintenant` : l'heure jusqu'à laquelle les fenêtres du relevé se comptent.
export function lireEtat(journal: Journal, maintenant = new Date()): EtatCuisine {
  const { base } = journal;
  // Lu en premier : ce qui s'écrit pendant la lecture sera repris par le
  // suivi, au pire montré deux fois, jamais manqué.
  const dernierSeq = journal.dernierSeq();
  const session = derniereSession(base);
  const tick = dernierTick(base);
  const mesures = new Map(mesuresDesCooksEnCours(base).map((mesure) => [mesure.run, mesure]));
  const activites = activitesDesCooksEnCours(base);
  const rail = lireRail(base);
  const annoncees = stationsAnnoncees(base);
  const stations = annoncees.flatMap((station) => etatStation(base, station) ?? []);
  const gardeFous = etatDesGardeFous(base);
  const attend = attentesDuChef(base, rail, maintenant);
  return {
    dernierSeq,
    projet: base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null,
    session,
    tick: session && session.endedAt === null && tick && tick.seq > session.startedSeq ? tick : null,
    gardeFous,
    sauvegarde: derniereSauvegarde(base),
    base: etatDeLaBase(base),
    baseRetenue: controleRetenu(base),
    reparation: reparationDeLaBase(base),
    grants: ACTIONS.flatMap((action) => etatDuGrant(base, action, maintenant) ?? []),
    rail,
    activites: activitesDuRail(base, rail),
    attend,
    urgence: gardeFous.stoppedAt === null ? urgenceDuChef(base, rail, attend, stations) : null,
    alerteUrgence: gardeFous.stoppedAt === null ? alerteEnCours(base) : null,
    sansGrant: bilanSansGrant(base),
    passage: passageEnService(base, maintenant),
    version: versionComparee(base),
    miseEnService: { demande: demandeDeMiseEnService(base), enVol: cooksEnVol(base) },
    stations,
    sansStation: sansStationDepuis(base),
    setup: setupBloque(base),
    miseDeCote: miseDeCoteBloquee(base),
    cooks: cooksEnCours(base).map((cook) => ({ ...cook, mesure: mesures.get(cook.run) ?? null, station: cookDeRun(base, cook.run), activite: activites.get(cook.run) ?? null })),
    auxFourneaux: annoncees.flatMap((station) => cooksEnCoursDeStation(base, station).map(({ ticket }) => ({ station, ticket }))),
    serveurs: serveursEnCours(base),
    sansService: servicesIndisponibles(base),
    worktrees: worktreesGardes(base),
    transcripts: rangementDesTranscripts(base),
    consommation: {
      enCours: consommation(base),
      fenetres: FENETRES_H.map((heures) => ({ heures, ...consommation(base, new Date(maintenant.getTime() - heures * HEURE_MS).toISOString()) })),
    },
    derive: franchis(livraisonsMergees(base), seuilsEnVigueur(base) ?? SANS_SEUIL),
    livres: livresDepuis(base, new Date(maintenant.getTime() - 24 * HEURE_MS).toISOString()),
    evenements: journal.derniers(EVENEMENTS_MONTRES, RESUMES),
  };
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const compte = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const ligne = (titre: string, valeur: string) => `${titre.padEnd(11)}${valeur}`;

// Une durée à la précision qui sert à piloter : « 12 s », « 4 min », « 2 h 10 ».
export function duree(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} j`;
}

function decrireRuntime(etat: EtatCuisine, depuis: (instant: string) => string): string[] {
  const { session, tick } = etat;
  if (!session) return [ligne("runtime", "jamais démarré")];
  if (session.endedAt !== null) return [ligne("runtime", `arrêté il y a ${depuis(session.endedAt)}`)];
  return [
    // Une session sans fin au journal est aussi celle d'un runtime mort sans
    // préavis : seul l'âge du tick les distingue, d'où sa ligne à lui.
    ligne("runtime", `en marche d'après le journal — pid ${session.pid} sur ${session.host}, démarré il y a ${depuis(session.startedAt)}`),
    ligne("", tick ? `dernier tick il y a ${depuis(tick.at)} (cadence : ${duree(tick.intervalMs)})` : "aucun tick depuis le démarrage"),
  ];
}

function decrireCuisine({ gardeFous }: EtatCuisine, depuis: (instant: string) => string): string {
  const cuisine = gardeFous.stoppedAt === null ? "ouverte" : `ARRÊTÉE par le chef il y a ${depuis(gardeFous.stoppedAt)}`;
  const echecs = `${compte(gardeFous.failures, "échec")} d'affilée`;
  const disjoncteur =
    gardeFous.breakerOpenedAt === null
      ? `disjoncteur fermé (${echecs}, ouverture à ${gardeFous.breakerThreshold ?? "?"})`
      : `disjoncteur OUVERT depuis ${depuis(gardeFous.breakerOpenedAt)} (${echecs})`;
  return ligne("cuisine", `${cuisine} · ${disjoncteur}`);
}

// Sans connexion Max, aucun cook ne part : c'est toute la cuisine qui attend
// le chef, et rien d'autre ne le dit dans l'en-tête. Rien à dire sinon.
function decrireConnexion({ stations }: EtatCuisine, depuis: (instant: string) => string): string[] {
  return stations.flatMap(({ station, disconnectedAt, disconnectedReason: raison }) =>
    disconnectedAt === null
      ? []
      : [
          ligne(
            "connexion",
            `Max ${direDeconnexion(raison).toUpperCase()} depuis ${depuis(disconnectedAt)} sur ${station}${raison === null ? "" : ` (${raison})`} — plus aucun ticket n'est pris : ${GESTE_DE_CONNEXION}`,
          ),
        ],
  );
}

// Sans station, aucun cook ne part non plus : le projet n'en déclare aucune,
// et c'est au chef d'en déclarer une. Rien à dire sinon.
function decrireSansStation({ sansStation }: EtatCuisine, depuis: (instant: string) => string): string[] {
  return sansStation === null ? [] : [ligne("stations", `AUCUNE DÉCLARÉE depuis ${depuis(sansStation)} — aucun cook ne part, les tickets restent en attente : ${GESTE_DE_STATION_A_CHAUD}`)];
}

// Un setup bloqué ne lance plus aucun worktree d'ici : la ligne le dit, et
// renvoie au bloc `attend`, qui porte la cause et le geste. Rien à dire sinon.
function decrireSetup({ setup }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (setup === null) return [];
  return [ligne("setup", `BLOQUÉ depuis ${depuis(setup.since)} sur ${setup.base.slice(0, 7)} — aucun setup n'est lancé d'ici, pour aucun ticket, tant que la branche d'intégration ne bouge pas : la cause et le geste sont dans le bloc \`attend\``)];
}

// Une cause de mise de côté répétée ralentit la prise d'ici : la ligne le dit, et
// renvoie au bloc `attend`. Rien à dire sinon.
function decrireMiseDeCote({ miseDeCote }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (miseDeCote === null) return [];
  return [ligne("mis de côté", `BLOQUÉ depuis ${depuis(miseDeCote.since)} (${miseDeCote.reason}) — un seul ticket est repris à la fois, pour voir si la cause a changé : la cause et le geste sont dans le bloc \`attend\``)];
}

// Une base rouge arrête la prise de tickets, les jugements et les merges : le pire
// n'est pas l'arrêt, c'est de ne pas en lire la cause. Et un contrôle qui ne
// part pas — la base ne se rapatrie pas — se lit même sur une base qui n'est
// pas rouge : des merges y attendent d'être vérifiés. Rien à dire sinon.
function decrireBase({ base, baseRetenue }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (base?.outcome !== "red") return baseRetenue === null ? [] : [ligne("base", direControleRetenu(baseRetenue, depuis))];
  return [
    ligne("base", `ROUGE depuis ${depuis(base.redSince ?? base.at)} sur ${base.sha.slice(0, 7)} — la station ne prend plus de ticket, la pass ne juge ni ne merge`),
    ...suiteDeBaseRouge(base, depuis, baseRetenue).map((suite) => ligne("", suite)),
  ];
}

// La première ligne de `status`, au-dessus de tout : plus rien ne cuit, et
// c'est le chef que toute la cuisine attend — depuis quand, combien de tickets
// sont à l'arrêt, la décision qui les retient et son geste, puis, s'il y en a,
// les autres décisions qui en retiennent aussi. Toutes sont dans le bloc
// `attend`, à leur rang. Rien à dire sinon.
export const URGENCE = "urgence    TOUTE LA CUISINE ATTEND LE CHEF";
function decrireUrgence({ urgence }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (urgence === null) return [];
  const [premiere, ...autres] = urgence.causes;
  const aussi = autres.length === 0 ? "" : ` — aussi : ${autres.map(({ attente }) => nommerAttente(attente)).join(", ")}`;
  return [`${URGENCE} depuis ${depuis(urgence.depuis)} — ${compte(urgence.retenus.length, "ticket")} à l'arrêt, retenus par ${nommerAttente(premiere.attente)} : ${direAttente(premiere.attente)}${aussi}`];
}

// La première ligne de `status` sans urgence : rien ne cuit, et pourquoi, tant que la base est
// rouge et que le ticket de ce rouge-là la répare. Hors du bloc `attend` : rien
// n'attend le chef. Une réparation échouée n'y est plus « en cours » — c'est la
// ligne `base` du bloc `attend` qui prend le relais. Rien à dire sinon.
export const RIEN_NE_CUIT = "rien ne cuit : ";
function decrireRienNeCuit({ base, reparation }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (base?.outcome !== "red" || reparation === null || reparation.etat === "echouee" || reparation.redSince !== base.redSince) return [];
  return [`${RIEN_NE_CUIT}base rouge depuis ${depuis(base.redSince ?? base.at)}, réparation #${reparation.ticket} en cours`];
}

// Une mise en service demandée retient toute la cuisine : plus aucun cook ne
// part avant le redémarrage, et rien d'autre ne le dit dans l'en-tête. Le
// détail — ce qui est en vol, comment ne plus attendre — est dans le bloc
// `attend`. Rien à dire sinon.
function decrireMiseEnService({ miseEnService: { demande } }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (demande === null) return [];
  return [
    ligne(
      "version",
      demande.etat === "launched"
        ? `MISE EN SERVICE LANCÉE depuis ${depuis(demande.lanceeLe ?? demande.depuis)} — le geste de box tourne, le runtime va être redémarré : plus aucun cook ne part`
        : `MISE EN SERVICE DEMANDÉE depuis ${depuis(demande.depuis)} — plus aucun cook ne part, la cuisine se vide avant le redémarrage : \`${VOIR}\``,
    ),
  ];
}

// Sous grant, du code est mergé sans le chef : il le lit sans le demander, avec
// ce qu'il en reste. Éteint seul, le grant se lit encore — c'est ce que le chef
// n'a pas fait lui-même. Absent ou révoqué par lui, il n'y a rien à dire.
function decrireGrants({ grants }: EtatCuisine, maintenant: Date, depuis: (instant: string) => string): string[] {
  return grants.flatMap((grant) => {
    if (grant.active) {
      const reste = direReste(grant, maintenant, duree);
      const dit = bientotEteint(grant, maintenant) ? `, BIENTÔT ÉTEINT : ${reste}` : grant.until === null && grant.usesLeft === null ? `, ${reste}, depuis ${depuis(grant.since)}` : ` ${reste}`;
      return [ligne("grant", `${grant.action} ACTIF${dit} — une pass verte est mergée sans toi`)];
    }
    if (grant.ended !== "expired") return [];
    return [ligne("grant", `${grant.action} ÉTEINT SEUL il y a ${depuis(grant.since)} — ${direExtinction(grant.cause)} : la pass s'arrête à la PR ouverte, plus rien n'est mergé sans toi`)];
  });
}

// Un échec de sauvegarde n'écrit rien au journal : c'est l'âge de la dernière
// réussie qui le trahit, comme l'âge du tick trahit un runtime figé.
function decrireSauvegarde({ projet, sauvegarde }: EtatCuisine, maintenant: Date, ageMaxMs: number): string {
  const unite = `brigade-sauvegarde@${projet ?? "<projet>"}`;
  if (!sauvegarde) return ligne("sauvegarde", `JAMAIS FAITE — le timer ${unite} tourne-t-il ?`);
  const age = maintenant.getTime() - Date.parse(sauvegarde.at);
  const derniere = `il y a ${duree(age)} (${sauvegarde.name}, jusqu'à l'événement ${sauvegarde.lastSeq})`;
  return ligne("sauvegarde", age > ageMaxMs ? `TROP VIEILLE : ${derniere} — plus de ${duree(ageMaxMs)} : systemctl status ${unite}` : derniere);
}

// Un ticket pris coince dès que la moitié de son bail est passée sans que son
// worktree bouge — là où sa station le signale au journal (`cook.stalled`). Le
// bail part du dernier progrès : son milieu se lit donc au rail. Bail échu et
// encore tenu, il coince à plus forte raison.
export function coince(ticket: TicketRail, maintenant: Date): boolean {
  if (ticket.state !== "taken" || ticket.leaseUntil === null) return false;
  const echeance = Date.parse(ticket.leaseUntil);
  const progres = ticket.progressedAt === null ? echeance : Date.parse(ticket.progressedAt);
  return maintenant.getTime() >= progres + (echeance - progres) * PART_SANS_PROGRES;
}

// Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à quand.
// `retenues` : ce qui retient chaque station de prendre un ticket qui pourrait partir.
function detail(ticket: TicketRail, maintenant: Date, depuis: (instant: string) => string, retenues: string[]): string {
  const reste = (instant: string) => Date.parse(instant) - maintenant.getTime();
  switch (ticket.state) {
    case "waiting":
      // Rien ne le retient sur le rail : s'il ne part pas, c'est sa station.
      return [...[direRetenue(ticket) ?? retenues].flat(), `depuis ${depuis(ticket.since)}`].join(" — ");
    case "taken": {
      const bail = ticket.leaseUntil === null ? 0 : reste(ticket.leaseUntil);
      // Des deux durées d'un ticket pris, seule la seconde révèle un blocage.
      // Elle se lit dans le rail : personne ne regarde un worktree pour l'avoir.
      const progres = ticket.progressedAt === null ? [] : [`sans progrès depuis ${depuis(ticket.progressedAt)}`];
      const marque = coince(ticket, maintenant) ? "COINCE : " : "";
      return `par ${ticket.station} depuis ${depuis(ticket.since)}, ${marque}${[...progres, bail >= 0 ? `bail encore ${duree(bail)}` : `bail échu depuis ${duree(-bail)}`].join(", ")}`;
    }
    case "pass":
    case "served":
      return `depuis ${depuis(ticket.since)}, cuisiné par ${ticket.station}`;
    case "86": {
      if (ticket.waitingFor !== null) return direAttenteDeTiers(ticket.waitingFor, depuis);
      const retour = ticket.until === null ? "sans heure de retour" : reste(ticket.until) >= 0 ? `retour dans ${duree(reste(ticket.until))}` : "retour au prochain tick";
      return `depuis ${depuis(ticket.since)} (${ticket.reason}), ${retour}`;
    }
  }
}

// Des gates coupées sur une machine saturée : la file le dit, à la suite du
// détail du ticket. Les autres activités de la pass ne s'y lisent pas.
const direAttenteDeCharge = (activite: ActiviteDeTicket | null | undefined) => (activite?.fait === DIRE_GATES_COUPEES ? ` — ${activite.fait}` : "");

// Un cook sur une ligne : son ticket, son calibrage, où il travaille, son
// budget consommé, s'il tient un ticket son temps sans progrès — celui du
// rail, que seul un worktree qui bouge remet à zéro —, et ce qu'il fait.
function decrireCook(cook: EtatCuisine["cooks"][number], ticket: TicketRail | undefined, maintenant: Date, depuis: (instant: string) => string): string {
  const { limits, mesure, station } = cook;
  const consomme = mesure
    ? `${compte(mesure.turns, "tour")} sur ${nombre(limits.turns)} · ${compte(mesure.tokens, "token")} sur ${nombre(limits.tokens)} (relevé il y a ${depuis(mesure.at)})`
    : "tours et tokens : pas encore de relevé";
  const budget = [
    `${depuis(cook.launchedAt)} sur ${duree(limits.durationMs)}`,
    consomme,
    ...(ticket?.progressedAt ? [`sans progrès depuis ${depuis(ticket.progressedAt)}`] : []),
    // Ce qu'il fait : là où il en est, et là où il s'est arrêté s'il ne progresse plus.
    ...(cook.activite ? [`en ce moment : ${direActivite(cook.activite)}, depuis ${depuis(cook.activite.since)}`] : []),
  ].join(" · ");
  return [
    // Sans ticket : un jugement du manager.
    `  ${cook.ticket === null ? "manager" : `#${cook.ticket}`}`,
    ...(ticket && coince(ticket, maintenant) ? ["COINCE"] : []),
    cook.run,
    ...(station?.model || station?.effort ? [`${station.model ?? "?"} / ${station.effort ?? "?"}`] : []),
    ...(station?.branch ? [`${station.branch}${station.worktree ? ` dans ${station.worktree}` : ""}`] : []),
    budget,
  ].join("  ");
}

function decrirePlafond(station: EtatStation): string {
  const plafond = plafondDeCooks(station);
  return `${station.station} : ${plafond === null ? "sans limite" : `${plafond} au plus`}`;
}

// Le ticket que tient chaque cook, et les cooks dans l'ordre où le chef doit
// les lire : celui qui coince d'abord, puis le plus long temps sans progrès ;
// les jugements et les relectures, qui ne tiennent aucun ticket, à la fin.
function trierCooks({ cooks, rail }: EtatCuisine, maintenant: Date) {
  const tenus = new Map(rail.filter((ticket) => ticket.state === "taken").map((ticket) => [ticket.ticket, ticket]));
  const rang = (ticket: TicketRail | undefined): [number, string] =>
    ticket === undefined ? [2, ""] : [coince(ticket, maintenant) ? 0 : 1, ticket.progressedAt ?? ticket.since];
  return cooks
    .map((cook) => ({ cook, ticket: cook.ticket === null ? undefined : tenus.get(cook.ticket) }))
    .map((ligne, ordre) => ({ ...ligne, ordre, rang: rang(ligne.ticket) }))
    .sort((a, b) => a.rang[0] - b.rang[0] || a.rang[1].localeCompare(b.rang[1]) || a.ordre - b.ordre);
}

function decrireCooks({ cooks, session, stations }: EtatCuisine, coinces: number[]): string {
  // Lequel coince se lit ici, sans parcourir les lignes.
  const alerte = coinces.length === 0 ? "" : ` — ${coinces.length} COINCE${coinces.length > 1 ? "NT" : ""} : ${coinces.map((ticket) => `#${ticket}`).join(", ")}`;
  const plafonds = `${stations.length === 0 ? "" : ` — ${stations.map(decrirePlafond).join(", ")}`}${alerte}`;
  if (cooks.length === 0) return `aucun en cours${plafonds}`;
  // Runtime arrêté, le journal ne dit rien de ses cooks avant le démarrage
  // suivant : celui d'une station lui survit, et sera repris ; les autres sont
  // morts avec lui, et seront notés interrompus.
  if (session?.endedAt !== null) return `${cooks.length} sans fin au journal — runtime arrêté : son prochain démarrage reprend ceux qui tournent encore, et note les autres interrompus`;
  return `${cooks.length} en cours${plafonds}`;
}

// La station qui se retient parce que la machine n'en peut plus : c'est le
// vrai plafond, et il ne se voit nulle part ailleurs.
function decrireSaturations({ stations }: EtatCuisine, depuis: (instant: string) => string): string[] {
  return stations.flatMap((station) => {
    const { saturatedAt, saturatedResource: resource, saturatedObserved: observed, saturatedLimit: limit } = station;
    if (saturatedAt === null || resource === null || observed === null || limit === null) return [];
    return [ligne("", `MACHINE SATURÉE depuis ${depuis(saturatedAt)} — ${direSaturation({ resource, observed, limit })} : ${station.station} ne prend plus de ticket tant que ça dure`)];
  });
}

// La station qui se retient alors qu'un ticket pourrait partir, et pourquoi.
function decrireRetenues({ stations }: EtatCuisine, depuis: (instant: string) => string): string[] {
  return stations.flatMap((station) =>
    station.heldAt === null || station.heldReason === null
      ? []
      : [ligne("", `${station.station} SE RETIENT depuis ${depuis(station.heldAt)} — ${direRetenueDeStation(station.heldReason)} : les tickets servables attendent`)],
  );
}

// La station dont l'arbitre entre projets ne répond plus : elle tourne en mode
// dégradé, et rien d'autre ne le montre tant qu'aucun ticket n'attend.
function decrireArbitrage({ stations }: EtatCuisine, depuis: (instant: string) => string): string[] {
  return stations.flatMap((station) =>
    station.unarbitratedAt === null
      ? []
      : [ligne("", `ARBITRE INJOIGNABLE depuis ${depuis(station.unarbitratedAt)} — ${station.unarbitratedReason ?? "sans réponse"} : ${station.station} ne lance plus qu'un cook à la fois, sans arbitrage, jusqu'à son retour`)],
  );
}

// Ce qui est allumé : chaque serveur avec son worktree, son port et son état.
// Un runtime qui s'arrête éteint ses serveurs et l'écrit ; mort sans préavis,
// il les laisse sans fin au journal jusqu'au démarrage suivant. Et le projet qui ne peut pas être servi le dit ici, sans
// qu'aucun serveur ne soit lancé. Rien à dire quand il n'y a ni l'un ni l'autre.
function decrireServeurs({ serveurs, sansService, session }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (serveurs.length === 0 && sansService.length === 0) return [];
  const mort = session?.endedAt !== null;
  const compte = `${serveurs.length} serveur${serveurs.length > 1 ? "s" : ""}`;
  return [
    ...(serveurs.length === 0
      ? []
      : [
          ligne("serveurs", mort ? `${compte} sans fin au journal — leur runtime s'est arrêté sans les éteindre` : `${compte} — une livraison d'interface, servie depuis son worktree sur le port de ce worktree`),
          ...serveurs.map((serveur) => `  #${serveur.ticket}  ${serveur.worktree}  port ${serveur.port}  ${direEtatDeServeur(serveur.state)} depuis ${depuis(serveur.since)}  ${serveur.branch}  ${direPage(serveur)}`),
        ]),
    ...sansService.map((indisponible) => ligne("service", `${direServiceIndisponible(indisponible)} — depuis ${depuis(indisponible.since)} sur ${indisponible.station}`)),
    "",
  ];
}

// Les worktrees que le runtime n'a pas pu ranger à la fin de leur cook, et
// pourquoi : c'est ici que ça se retrouve. Rien à dire quand il n'y en a pas.
function decrireWorktrees({ worktrees }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (worktrees.length === 0) return [];
  return [
    ligne("worktrees", `${worktrees.length} non rangé${worktrees.length > 1 ? "s" : ""} après leur cook — rien n'y est touché, le runtime y revient à chaque tick`),
    ...worktrees.map(({ ticket, worktree, branch, reason, detail, since }) => `  #${ticket}  ${worktree}  ${branch}  ${direMotifDeGarde(reason)} depuis ${depuis(since)} — ${detail}`),
    "",
  ];
}

// Le `~/.claude` d'un projet cloisonné : ce que le dernier rangement y a
// gardé de transcripts, ce qu'il en a retiré, et la règle. Rien à dire sans
// cloison : aucun rangement n'a lieu.
function decrireTranscripts({ transcripts }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (transcripts === null) return [];
  const mo = (octets: number) => `${(octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  const dire = (combien: number, octets: number, quoi: string) => (combien === 0 ? `aucun ${quoi}` : `${nombre(combien)} ${quoi}${combien > 1 ? "s" : ""} (${mo(octets)})`);
  const { kept, keptBytes, removed, freedBytes, keepMs, at } = transcripts;
  return [
    ligne(
      "claude",
      `transcripts du projet : ${dire(kept, keptBytes, "gardé")}, ${dire(removed, freedBytes, "retiré")} au rangement d'il y a ${depuis(at)} — un transcript part ${duree(keepMs)} après sa dernière écriture`,
    ),
  ];
}

// Ce que la consommation affichée n'est pas : celle du compte. Le runtime ne
// voit que ce que son projet a lancé, jamais les sessions du chef.
export const NOTE_CONSOMMATION = "ce que ce projet a lancé, pas la consommation du compte : /usage la donne";

// Ce qu'un ensemble de lancements a consommé, tel que le chef le lit.
export function direConsommation({ runs, reviews, judgments, turns, tokens }: Consommation): string {
  if (runs === 0) return "rien";
  const dont = [...(reviews === 0 ? [] : [compte(reviews, "relecture")]), ...(judgments === 0 ? [] : [compte(judgments, "jugement")])];
  return [`${compte(runs, "lancement")}${dont.length === 0 ? "" : `, dont ${dont.join(" et ")}`}`, compte(turns, "tour"), compte(tokens, "token")].join(" · ");
}

function decrireConsommation({ consommation }: EtatCuisine): string[] {
  return [
    ligne("consommé", `en cours : ${direConsommation(consommation.enCours)}`),
    ...consommation.fenetres.map((fenetre) => ligne("", `${fenetre.heures} h : ${direConsommation(fenetre)}`)),
    ligne("", NOTE_CONSOMMATION),
  ];
}

// Combien de tickets du rail se lisent dans cet état.
const lus = (rail: TicketRail[], nom: string) => rail.filter((ticket) => etatLu(ticket) === nom).length;

// L'état, ligne par ligne. Les durées sont comptées jusqu'à `maintenant`.
export function decrireEtat(etat: EtatCuisine, maintenant: Date, ageMaxSauvegardeMs = AGE_MAX_SAUVEGARDE_MS): string[] {
  const depuis = (instant: string) => duree(maintenant.getTime() - Date.parse(instant));
  const decompte = ORDRE.map((nom) => [nom, lus(etat.rail, nom)] as const)
    .filter(([, combien]) => combien > 0)
    .map(([nom, combien]) => `${combien} ${nom}`);
  const cooks = trierCooks(etat, maintenant);
  // Ce qui retient un ticket que rien ne retient sur le rail : les stations
  // qui pourraient le cuisiner — celles qui fournissent ce qu'il demande — et
  // qui se retiennent. Une station qui ne le prendrait de toute façon pas n'y
  // est pour rien.
  const retenuesDe = (ticket: TicketRail) => [
    ...(etat.sansStation === null ? [] : ["aucune station déclarée"]),
    ...etat.stations.flatMap((station) =>
      station.heldReason === null || !fournitTout(station.provides, requises(ticket.card)) ? [] : [`retenu par ${station.station} (${direRetenueDeStation(station.heldReason)})`],
    ),
  ];
  return [
    ...decrireUrgence(etat, depuis),
    ...decrireRienNeCuit(etat, depuis),
    ligne("projet", etat.projet ?? "inconnu — journal vide"),
    ...decrireRuntime(etat, depuis),
    decrireCuisine(etat, depuis),
    ...decrireConnexion(etat, depuis),
    ...decrireSansStation(etat, depuis),
    ...decrireBase(etat, depuis),
    ...decrireSetup(etat, depuis),
    ...decrireMiseDeCote(etat, depuis),
    ...decrireMiseEnService(etat, depuis),
    ...decrireGrants(etat, maintenant, depuis),
    decrireSauvegarde(etat, maintenant, ageMaxSauvegardeMs),
    "",
    // Avant le rail : « est-ce qu'on m'attend ? » se lit sans le parcourir.
    ...decrireAttentes(etat.attend, depuis, etat.sansGrant, etat.passage),
    ligne("rail", decompte.length === 0 ? "vide" : decompte.join(" · ")),
    ...etat.rail.map((ticket) =>
      [
        `  #${ticket.ticket}`,
        etatLu(ticket),
        ticket.priority === null ? "-" : `prio:${ticket.priority}`,
        detail(ticket, maintenant, depuis, retenuesDe(ticket)) + direAttenteDeCharge(etat.activites.get(ticket.ticket)),
        ticket.title,
      ].join("  "),
    ),
    "",
    ligne(
      "cooks",
      decrireCooks(
        etat,
        cooks.flatMap(({ ticket }) => (ticket && coince(ticket, maintenant) ? [ticket.ticket] : [])),
      ),
    ),
    ...decrireSaturations(etat, depuis),
    ...decrireRetenues(etat, depuis),
    ...decrireArbitrage(etat, depuis),
    ...cooks.map(({ cook, ticket }) => decrireCook(cook, ticket, maintenant, depuis)),
    "",
    ...decrireServeurs(etat, depuis),
    ...decrireWorktrees(etat, depuis),
    ...decrireConsommation(etat),
    // Absent quand rien n'est franchi : le bloc n'apparaît que pour être lu.
    ...(etat.derive.length === 0 ? [] : [ligne("dérive", `${etat.derive.map(direJauge).join(" · ")} — \`${geste(`measures`)}\``)]),
    ...decrireTranscripts(etat, depuis),
    "",
    "derniers événements",
    ...(etat.evenements.length === 0 ? ["  aucun"] : etat.evenements.map((evenement) => `  ${formaterEvenement(evenement)}`)),
  ];
}

// L'état du projet en un mot, pour qui pose une couleur dessus. La liste est
// fermée, et dans l'ordre où un mot l'emporte sur les suivants.
export const ETATS_DE_PROJET = ["éteinte", "arrêtée", "retenue", "ouverte"] as const;
export type EtatDeProjet = (typeof ETATS_DE_PROJET)[number];

// Chaque mot résume ce que l'en-tête de `decrireEtat` écrit en toutes lettres :
// le runtime, le « stop » du chef, puis ce qui empêche tout ticket de partir —
// disjoncteur, connexion Max, aucune station déclarée, base rouge, mise en service demandée. « Ouverte » vaut d'après le journal :
// un runtime mort sans préavis l'est encore.
function etatDuProjet({ session, gardeFous, stations, sansStation, base, miseEnService, setup }: EtatCuisine): EtatDeProjet {
  if (!session || session.endedAt !== null) return "éteinte";
  if (gardeFous.stoppedAt !== null) return "arrêtée";
  // Un setup bloqué retient les stations d'ici ; une distante prépare le sien
  // sur son poste, et cuisine encore.
  const sansSetup = setup !== null && !stations.some((station) => station.remote);
  const retenue = gardeFous.breakerOpenedAt !== null || stations.some((station) => station.disconnectedAt !== null) || sansStation !== null || base?.outcome === "red" || miseEnService.demande !== null || sansSetup;
  return retenue ? "retenue" : "ouverte";
}

// Les faits qu'un programme dessine. Cette forme est un contrat (docs/runtime.md,
// « Les faits, pour un programme ») : ses champs, leur ordre et ses mots ne
// changent pas sans que son lecteur change.
export type Faits = {
  etat: EtatDeProjet;
  // L'heure de la lecture, et celle du dernier tick du runtime en marche : de
  // quoi afficher son âge sans l'horloge de la box.
  lu: string;
  dernierTick: string | null;
  compteurs: { rail: number; auTravail: number; aLaPass: number; attend: number; livres24h: number };
  dernierEvenement: { seq: number; at: string; type: string; ticket: number | null } | null;
  // `activite` : ce que la cuisine fait du ticket en ce moment — son cook, s'il
  // est pris ; la pass, s'il y est. Nulle pour un ticket qui n'est ni l'un ni
  // l'autre, et pour celui dont le runtime ne sait pas ce qu'on en fait.
  // `attente` : pour un ticket mis de côté (86), ce qu'il attend — `raison` en
  // clair (« attend : setup du projet impossible »), `colonne` : celle du
  // rail où il est (`etat`), `retour` : l'heure de son retour, nulle sans.
  // `tiers` : pour un ticket en WAITING, ce qu'il attend d'un tiers — `quoi`
  // dans les mots du chef, `qui`, `depuis` (sa mise en attente), `relance` (quand
  // y revenir) et `aLArrivee` (ce que « c'est arrivé » fera de lui) ; nul pour
  // tout autre ticket ; `revenu` — pour un ticket revenu de WAITING dans TODO,
  // pourquoi, dans les mots du runtime (« relance du 21/10 : pas de réponse »,
  // « nouveau sur l'issue — de <qui> ») ; `null` pour tout autre, et pour celui que
  // le chef a repris lui-même.
  rail: Array<{
    ticket: number;
    etat: string;
    titre: string;
    url: string;
    activite: ActiviteDeTicket | null;
    attente: { raison: string; colonne: string; retour: string | null } | null;
    tiers: { quoi: string; qui: string; depuis: string; relance: string; aLArrivee: string } | null;
    revenu: string | null;
  }>;
  // Les cooks en cours, comme `station` les montre. Le titre est celui du rail :
  // vide si le ticket l'a quitté pendant la cuisson.
  cooks: Array<{ ticket: number; titre: string; station: string }>;
  // Les tickets que le bloc `attend` de `status` nomme, une entrée chacun, dans
  // son ordre — la connexion Max, qui n'est à aucun ticket, n'en donne aucune.
  // `url` : l'adresse de l'issue, celle du rail ou, hors rail, celle que le dépôt
  // de la box donne ; nulle quand la box ne connaît pas son dépôt. `titre` : celui
  // du rail, vide pour une issue qui n'y est pas — le journal ne le connaît pas.
  attend: Array<{ ticket: number; titre: string; url: string | null }>;
  // La version du runtime face à la branche que le clone de brigade suit, lue
  // sur son origine — ce que le bloc `attend` en dit, pour un programme.
  // `null` : le runtime en marche n'a rien comparé, et rien n'est dit « à jour ».
  // `etat` : un mot de `ETATS_DE_VERSION`. `depuis` : en attente, l'instant de
  // la plus ancienne livraison qui n'est pas en service ; sinon, depuis quand
  // la comparaison répond ainsi. `enService`, `enAttente` : des commits.
  // `enAttente` et `livraisons` ne valent que pour une version en attente,
  // `raison` que pour une version non comparée ; `branche` est nulle quand le
  // clone n'a pas dit laquelle il suit.
  version: { etat: EtatDeVersion; depuis: string; branche: string | null; enService: string; enAttente: string | null; livraisons: number | null; raison: string | null } | null;
  // La mise en service demandée au runtime (`run deploy`), et ce
  // qu'elle interromprait — de quoi le montrer avant de la demander. `etat` : un
  // mot de `ETATS_DE_MISE_EN_SERVICE`. `depuis` : l'instant de la demande, nul
  // sans demande. `coupe` : le chef a demandé de ne pas attendre le rail calme.
  // `enVol` : les cooks en vol à la lecture, le plus ancien d'abord — `ticket`
  // nul pour un jugement du manager, `tokens` nul tant qu'aucun relevé n'en dit
  // rien. `tokens` : ce qu'ils ont déjà dépensé en tout.
  miseEnService: { etat: EtatDeMiseEnService; depuis: string | null; coupe: boolean; enVol: Array<{ ticket: number | null; run: string; station: string | null; tokens: number | null }>; tokens: number };
  // Les tickets servis dans les 24 h avant `lu`, le plus récent d'abord — ceux
  // que `compteurs.livres24h` compte, un pour un, encore sur le rail ou non.
  // `livre` : l'heure de son service. `station` : celle qui l'a cuisiné, nulle
  // quand aucune ne l'a envoyé en pass. `pr` : la PR mergée, nulle pour un
  // ticket servi sans merge. `titre`, `url` : ceux de son issue — vide et nulle
  // pour une livraison que le rail n'a jamais portée, sauf à connaître le dépôt.
  // `relecture` : ce que le reviewer a dit de ce qui a été servi, mot pour mot —
  // son `resume`, ses `constats` dans son ordre ; nulle quand aucune relecture
  // lisible ne porte sur la livraison servie (mergée à la main, d'avant elle).
  livres: Array<{ ticket: number; titre: string; url: string | null; livre: string; station: string | null; pr: string | null; relecture: RelectureLivree | null }>;
  // L'urgence : plus rien ne cuit, et c'est le chef que toute la cuisine
  // attend — nulle sinon. `depuis` : le début de l'arrêt total, stable tant
  // que ses causes ne changent pas. `retenus` : les tickets à l'arrêt, dans
  // l'ordre du rail. La décision qui en retient le plus : `decision`, ce qui la
  // nomme en tête de sa ligne du bloc `attend` (`#535`, une station, `base`,
  // `setup`) ; `ticket`, nul hors ticket ; `cause`, un mot de `CAUSES_D_URGENCE` ;
  // `geste`, sa ligne du bloc `attend` — ce qui attend, puis le geste du chef ;
  // `url`, l'adresse de son issue, comme dans `attend`. `autres` : les autres
  // décisions qui retiennent aussi des tickets, sous la même forme.
  urgence: (DecisionUrgente & { depuis: string; retenus: number[]; autres: DecisionUrgente[]; alerte: AlerteExposee | null }) | null;
};

// L'alerte émise pour l'urgence : sa ligne, sa première émission, la dernière
// (rappel compris), et le nombre de rappels. Le début de l'arrêt est le `depuis`
// de l'urgence.
export type AlerteExposee = { libelle: string; emiseLe: string; derniereLe: string; rappels: number };

// Une décision du chef qui retient toute la cuisine, pour un programme.
export type DecisionUrgente = { decision: string; ticket: number | null; cause: CauseDUrgence; geste: string; url: string | null };

// Ce qui retient la cuisine, pour qui pose un mot dessus : la nature de
// l'entrée du bloc `attend` en cause. La liste est fermée, et peut gagner un
// mot. Une entrée qui n'est à aucun ticket du rail ni à une station — une issue
// écartée, une version, la passe de fermeture… — n'est jamais en cause : elle
// ne retient aucun ticket.
export const CAUSES_D_URGENCE = {
  merge: "merge",
  remontee: "remontée",
  fermee: "PR fermée",
  "86": "86",
  capacite: "capacité",
  absente: "station absente",
  bloque: "bloqué",
  ecartee: "écartée",
  illisible: "illisible",
  question: "question",
  repris: "repris",
  connexion: "connexion",
  session: "session",
  version: "version",
  "version-illisible": "version non comparée",
  fermeture: "fermeture",
  base: "base rouge",
  setup: "setup",
  aside: "mis de côté",
  disjoncteur: "disjoncteur",
} as const satisfies Record<Attente["quoi"], string>;
export type CauseDUrgence = (typeof CAUSES_D_URGENCE)[keyof typeof CAUSES_D_URGENCE];

// Une relecture, dans les mots que le reviewer lui-même emploie (reviewer.ts).
export type RelectureLivree = { resume: string; constats: Array<{ gravite: "bloquant" | "remarque"; fichier: string | null; constat: string }> };
const GRAVITES = { blocking: "bloquant", remark: "remarque" } as const;
const relectureLivree = (review: Livre["review"]): RelectureLivree | null =>
  review === null ? null : { resume: review.summary, constats: review.findings.map(({ severity, file, text }) => ({ gravite: GRAVITES[severity], fichier: file, constat: text })) };

// Où en est la demande, pour qui pose une couleur dessus. La liste est fermée.
// `demandée` : elle attend le rail calme, ou le prochain réveil du runtime ;
// `lancée` : le geste de box est parti, le runtime va être redémarré.
export const ETATS_DE_MISE_EN_SERVICE = ["aucune", "demandée", "lancée"] as const;
export type EtatDeMiseEnService = (typeof ETATS_DE_MISE_EN_SERVICE)[number];

function faitsDeMiseEnService({ demande, enVol }: EtatCuisine["miseEnService"]): Faits["miseEnService"] {
  return {
    etat: demande === null ? "aucune" : demande.etat === "launched" ? "lancée" : "demandée",
    depuis: demande?.depuis ?? null,
    coupe: demande?.coupe ?? false,
    enVol: enVol.map(({ ticket, run, station, tokens }) => ({ ticket, run, station, tokens })),
    tokens: tokensEnVol(enVol),
  };
}

// Ce que la comparaison répond, pour qui pose une couleur dessus. La liste est
// fermée.
export const ETATS_DE_VERSION = ["à jour", "en attente", "non comparée"] as const;
export type EtatDeVersion = (typeof ETATS_DE_VERSION)[number];

function faitsDeVersion(version: VersionComparee | null): Faits["version"] {
  if (version === null) return null;
  const { depuis, comparaison } = version;
  const commun = { depuis, branche: comparaison.branch, enService: comparaison.served };
  switch (comparaison.outcome) {
    case "current":
      return { etat: "à jour", ...commun, enAttente: null, livraisons: null, raison: null };
    case "waiting":
      return { etat: "en attente", ...commun, enAttente: comparaison.head, livraisons: comparaison.deliveries, raison: null };
    case "unreadable":
      return { etat: "non comparée", ...commun, enAttente: null, livraisons: null, raison: comparaison.reason };
  }
}

function faitsDUrgence(urgence: Urgence | null, alerte: AlerteEnCours | null, adresse: (ticket: number) => string | null): Faits["urgence"] {
  if (urgence === null) return null;
  const decision = ({ attente }: Urgence["causes"][number]): DecisionUrgente => ({
    decision: nommerAttente(attente),
    ticket: attente.ticket,
    cause: CAUSES_D_URGENCE[attente.quoi],
    geste: direAttente(attente),
    url: attente.ticket === null ? null : adresse(attente.ticket),
  });
  const [premiere, ...autres] = urgence.causes;
  // L'alerte d'une autre urgence (cause changée, pas encore réannoncée) n'est
  // pas la sienne.
  const exposee = alerte === null || alerte.key !== cleDUrgence(urgence) ? null : { libelle: alerte.label, emiseLe: alerte.emiseLe, derniereLe: alerte.derniereLe, rappels: alerte.rappels };
  return { ...decision(premiere), depuis: urgence.depuis, retenus: urgence.retenus, autres: autres.map(decision), alerte: exposee };
}

const DEPOT_GITHUB = /^[\w.-]+\/[\w.-]+$/;

// `maintenant` : l'heure à laquelle `etat` a été lu. `depot` : `<owner>/<repo>`,
// le dépôt GitHub que la box sert — de quoi donner l'adresse d'une issue qui
// n'est pas sur le rail.
export function faits(etat: EtatCuisine, maintenant: Date, depot?: string): Faits {
  const adresse = (ticket: number) =>
    etat.rail.find((surLeRail) => surLeRail.ticket === ticket)?.url ?? (depot !== undefined && DEPOT_GITHUB.test(depot) ? `https://github.com/${depot}/issues/${ticket}` : null);
  const attendus = new Set<number>();
  const dernier = etat.evenements.at(-1);
  return {
    etat: etatDuProjet(etat),
    lu: maintenant.toISOString(),
    dernierTick: etat.tick?.at ?? null,
    compteurs: {
      rail: lus(etat.rail, nomEtat("waiting")) + lus(etat.rail, BLOQUE),
      auTravail: lus(etat.rail, nomEtat("taken")),
      aLaPass: lus(etat.rail, nomEtat("pass")),
      attend: etat.attend.length,
      livres24h: etat.livres.length,
    },
    dernierEvenement: dernier ? { seq: dernier.seq, at: dernier.at, type: dernier.type, ticket: dernier.ticket } : null,
    rail: etat.rail.map((ticket) => ({
      ticket: ticket.ticket,
      etat: etatLu(ticket),
      titre: ticket.title,
      url: ticket.url,
      activite: etat.activites.get(ticket.ticket) ?? null,
      attente: ticket.state === "86" ? { raison: direMiseDeCote(ticket.reason), colonne: etatLu(ticket), retour: ticket.until } : null,
      tiers: ticket.waitingFor === null ? null : { quoi: ticket.waitingFor.what, qui: ticket.waitingFor.who, depuis: ticket.waitingFor.since, relance: ticket.waitingFor.followUp, aLArrivee: ticket.waitingFor.onArrival },
      revenu: ticket.resumedBecause === null || ticket.resumedBecause === PAR_LE_CHEF ? null : ticket.resumedBecause,
    })),
    // Une station ne lance un cook que pour un ticket.
    cooks: etat.auxFourneaux.flatMap(({ station, ticket }) =>
      ticket === null ? [] : [{ ticket, titre: etat.rail.find((surLeRail) => surLeRail.ticket === ticket)?.title ?? "", station }],
    ),
    attend: etat.attend.flatMap(({ ticket, title }) => {
      if (ticket === null || attendus.has(ticket)) return [];
      attendus.add(ticket);
      return [{ ticket, titre: title ?? "", url: adresse(ticket) }];
    }),
    version: faitsDeVersion(etat.version),
    miseEnService: faitsDeMiseEnService(etat.miseEnService),
    livres: etat.livres.map(({ ticket, title, url, servedAt, station, pr, review }) => ({ ticket, titre: title, url: url ?? adresse(ticket), livre: servedAt, station, pr, relecture: relectureLivree(review) })),
    urgence: faitsDUrgence(etat.urgence, etat.alerteUrgence, adresse),
  };
}

export type OptionsSuivi = {
  // Le numéro du dernier événement déjà montré.
  depuis: number;
  // Ne suivre que ce ticket.
  ticket?: number;
  intervalleMs?: number;
  ecrire: (ligne: string) => void;
};

// Suit le journal en direct : chaque événement écrit après `depuis` est rendu
// une fois, dans l'ordre. Les battements du runtime ne défilent pas. Rend de
// quoi arrêter le suivi.
export function suivre(journal: Journal, options: OptionsSuivi): () => void {
  let dernier = options.depuis;
  // La version est relevée avant la première lecture : ce qui s'écrit entre
  // les deux change la version, donc sera lu au tour suivant.
  let version = journal.base.versionDonnees();
  const relever = () => {
    for (const evenement of journal.depuis(dernier)) {
      dernier = evenement.seq;
      if (evenement.type === BATTEMENT) continue;
      if (options.ticket !== undefined && evenement.ticket !== options.ticket) continue;
      options.ecrire(formaterEvenement(evenement));
    }
  };
  relever();
  const veille = setInterval(() => {
    const courante = journal.base.versionDonnees();
    if (courante === version) return;
    version = courante;
    relever();
  }, options.intervalleMs ?? VEILLE_MS);
  return () => clearInterval(veille);
}
