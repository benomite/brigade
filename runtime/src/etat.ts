// L'état de la cuisine tel que le chef le lit : le runtime et son dernier tick,
// la dernière sauvegarde, ce qui l'attend, le rail, les cooks en cours et ce
// qu'ils ont consommé, les derniers événements. Tout vient du journal et de
// ses projections — rien n'est calculé ni gardé ailleurs, et rien n'est écrit.
import { direActiviteEn, type Activite } from "./activite.ts";
import { activitesDuRail, type ActiviteDeTicket } from "./activites.ts";
import { sejoursEnColonne, type Essai, type Sejour } from "./sejour-en-colonne.ts";
import { DIRE_GATES_COUPEES, DIRE_GATES_COUPEES_EN } from "./events/pass.ts";
import { attenteDeLaCarte, carteDeLAttente, type CarteDuTicket } from "./carte-todo/cartes.ts";
import { attentesDuChef, decisionDe, type Livraison, decrireAttentes, direAttente, direAttenteEn, nommerAttente, nommerEn, passageEnService, pauseDeLaCuisine, type Attente, type Decision, type Passage, type PauseEnVigueur } from "./attend.ts";
import { geste } from "./geste.ts";
import { fournitTout, manqueDuTicket } from "./capacites.ts";
import { capturesManquantes, capturesVues, lireCaptures, type Captures, type CapturesVues } from "./captures.ts";
import type { Evenement } from "./evenements.ts";
import { RELEVE } from "./events/guardrails.ts";
import { PART_SANS_PROGRES } from "./events/station.ts";
import { BATTEMENT } from "./events/runtime.ts";
import { direBaseRevenueVerteEn, direControleRetenuEn, suiteDeBaseRougeEn } from "./dire-base.ts";
import { blocagesDuJournal } from "./installation/blocages/blocages.ts";
import { PREFIXE_DE_LA_REJOINTE } from "./projets/secondaires.ts";
import { cuisineOisive, racinesDesAttentes, type CuisineOisive, type RacineDAttente } from "./cuisine-oisive.ts";
import { requises } from "./fiche.ts";
import { ACTIONS, bientotEteint, direExtinctionEn, direResteEn } from "./grant.ts";
import type { Journal } from "./journal.ts";
import { livraisonsCoincees } from "./file-de-la-pass.ts";
import { formaterEvenement } from "./ligne-evenement.ts";
import { direSaturationsEn } from "./machine.ts";
import { direLeCoutDuTableau } from "./tableau/budget/cout.ts";
import { direLaLimite, direLaRetenue, direLesAppels, type Repartition } from "./limite-github.ts";
import { direJaugeEn, franchis, SANS_SEUIL, type Franchi } from "./mesures.ts";
import {
  activitesDesCooksEnCours,
  consommation,
  cooksEnCours,
  etatDesGardeFous,
  finDuDernierCook,
  mesuresDesCooksEnCours,
  type Consommation,
  type CookEnCours,
  type EtatGardeFous,
  type Mesure,
} from "./projections/guardrails.ts";
import { parcoursDesTickets } from "./parcours-des-tickets.ts";
import { derivePremierCoup, direDerivePremierCoupEn, type DerivePremierCoup } from "./renvois.ts";
import { mergedDeliveries, seuilsEnVigueur } from "./projections/measures.ts";
import { direInterrupteur } from "./interrupteur.ts";
import { etatDeLInterrupteur, type EtatInterrupteur } from "./projections/switch.ts";
import { bilanSansGrant, controleRetenu, etatDeLaBase, etatDuGrant, reparationDeLaBase, type ControleRetenu, type EtatDeLaBase, type Grant, type ReparationDeLaBase, type SansGrant } from "./projections/pass.ts";
import { direMotifDeGardeEn, rangementDesTranscripts, worktreesGardes, type RangementDeTranscripts, type WorktreeGarde } from "./projections/cleanup.ts";
import { lireRail, livresDepuis, type Etat as EtatTicket, type Livre, type TicketRail } from "./projections/rail.ts";
import { lastBackup, type Backup } from "./projections/backups.ts";
import { dernierTick, derniereSession, type SessionPassee, type Tick } from "./projections/sessions.ts";
import { arreteeDepuis, cookDeRun, cooksEnCoursDeStation, direDeconnexionEn, direPlafondEn, direRetenueDeStationEn, etatStation, GESTE_DE_CONNEXION_TOMBEE_EN, plafondDeCooks, sansStationDepuis, miseDeCoteBloquee, setupBloque, stationsAnnoncees, type CookDeStation, type EtatStation, type MiseDeCoteBloquee, type SetupBloque } from "./projections/stations.ts";
import { avecHorsZoneEn, BLOQUE, BLOQUE_EN, direAttenteDUnWaiting, direAttentesLeveesEn, direRetenueEn, EN_WAITING, etatLu, etatLuEn, nomAbandonEn, nomEtat, nomEtatEn, RETOUR_DERRIERE_UN_WAITING_EN } from "./rail.ts";
import { direAttenteDeTiersEn } from "./attente.ts";
import { attenteDUneStation, direAttenteDUneStationEn, direMiseDeCote, miseDeCoteDu } from "./mise-de-cote.ts";
import { direReprise, direRepriseEn, reprisesDuRail, type RepriseDuTicket } from "./remontee-a-la-cuisine.ts";
import { aSortirAvec, direSortieAvecEn, type AbandonEnChaine } from "./abandon-en-chaine.ts";
import { GESTE_DE_STATION_A_CHAUD_EN } from "./stations-declarees.ts";
import { prendLesOrdinaires } from "./bac-a-sable/ordinaires.ts";
import type { Refus } from "./projets/refus.ts";
import { alerteEnCours, type AlerteEnCours } from "./projections/emergency.ts";
import { cleDUrgence, retenuesDuChef, urgenceDuChef, type CauseDUrgence as RetenueDuChef, type Urgence } from "./urgence.ts";

// La raison d'un ticket 86 sous sa carte : ce que la cuisine fait d'une
// remontée technique, sinon la raison de sa mise de côté.
const direRaisonDuRail = (motif: string | null, reprise: RepriseDuTicket | undefined) => (reprise === undefined ? direMiseDeCote(motif) : direReprise(reprise));

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
const ORDRE = ETATS.flatMap((etat) => (etat === "waiting" ? [nomEtatEn(etat), BLOQUE_EN] : etat === "86" ? [nomEtatEn(etat), EN_WAITING] : [nomEtatEn(etat)]));

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
  sauvegarde: Backup | null;
  rail: TicketRail[];
  // Ce que la cuisine fait en ce moment de chaque ticket pris ou en pass — nul
  // quand le runtime ne le sait pas. Les autres tickets n'y sont pas.
  activites: Map<number, ActiviteDeTicket | null>;
  // Ce que la cuisine fait de chaque ticket 86 sur une remontée technique
  // (remontee-a-la-cuisine.ts) : sa carte le dit. Absente d'un état construit
  // sans elle.
  reprises?: Map<number, RepriseDuTicket>;
  // Les tickets qui sortent du rail avec un ticket que la cuisine abandonne,
  // et qu'ils attendent (abandon-en-chaine.ts) : leur carte dit lequel, et la
  // même cause. Absente d'un état construit sans elle.
  sortiesAvec?: Map<number, AbandonEnChaine>;
  // Le séjour de chaque ticket pris dans sa colonne, depuis sa première prise à travers les relances (#1893).
  // Absent d'un état construit sans lui : la carte garde alors `since`.
  sejours?: Map<number, Sejour>;
  // Les captures de la dernière livraison de chaque ticket d'interface en
  // pass ou servi dans les 24 h (captures.ts). Un ticket qui n'y est pas n'en
  // a pas : il n'est pas d'interface, ou il n'a rien livré.
  captures?: Map<number, Captures>;
  // Ce qui attend une décision du chef, le plus ancien d'abord.
  attend: Attente[];
  // Non nulle : plus rien ne cuit, et c'est le chef que toute la cuisine
  // attend (urgence.ts). Nulle aussi quand le chef a lui-même arrêté la
  // cuisine : c'est son « stop » qui la retient.
  urgence: Urgence | null;
  // Les décisions du chef sur un ticket qui en retiennent d'autres sans
  // arrêter la cuisine : un ticket au moins peut cuire (urgence.ts). Vide
  // quand rien n'est retenu, ou quand tout l'est — c'est alors `urgence`.
  retenues: RetenueDuChef[];
  // L'alerte que le runtime a émise pour elle, lue du journal : app fermée
  // comme ouverte. Nulle tant que rien n'a été annoncé.
  alerteUrgence: AlerteEnCours | null;
  // Ce que sont devenues les livraisons arrêtées faute de grant.
  sansGrant: SansGrant;
  // La version où la station est passée par sa mise à jour, si elle date de
  // moins d'un jour à la lecture.
  passage: Passage | null;
  // La pause du renommage du code, acceptée par le chef, tant qu'elle tient.
  pause: PauseEnVigueur | null;
  // L'interrupteur du projet (interrupteur.ts) : nul ou absent tant qu'aucun
  // runtime ne l'a posé — la ligne `switch` ne s'écrit alors pas.
  interrupteur?: EtatInterrupteur | null;
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
  // Les stations où le chef a arrêté la cuisine du projet, et depuis quand.
  arretees: Map<string, string>;
  // Ce que l'ensemble des cooks a consommé : ceux qui tournent, puis, par
  // fenêtre glissante, ceux qui tournent et ceux qui ont fini dedans.
  // Les worktrees que le nettoyage a gardés après leur ticket.
  worktrees: WorktreeGarde[];
  // Le dernier rangement des transcripts du projet, s'il est cloisonné.
  transcripts: RangementDeTranscripts | null;
  consommation: { enCours: Consommation; fenetres: Array<{ heures: number } & Consommation> };
  // Les mesures du projet qui ont franchi un seuil déclaré.
  derive: Franchi[];
  // La part de tickets livrés du premier coup, quand elle est sous son seuil.
  derivePremierCoup: DerivePremierCoup | null;
  // Les tickets servis dans les 24 h avant la lecture, le plus récent d'abord.
  livres: Livre[];
  // Les livraisons en pass, à juger, sans pass depuis plus de 15 min
  // (`file-de-la-pass.ts`) : le chef relance leur jugement.
  coincees: Array<{ ticket: number; since: string }>;
  // Non nulle : des cartes sont sur le rail et la cuisine n'a rien cuit depuis
  // 30 min, sans que le projet soit éteint ni que toutes attendent une capacité
  // ou un tiers — une panne (cuisine-oisive.ts). Absente d'un état construit sans elle.
  oisive?: CuisineOisive | null;
  // Les stations qui ont rejoint la cuisine sans que le projet puisse les déclarer : pourquoi, en une phrase chacune.
  rejointesRefusees?: string[];
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
  const livres = livresDepuis(base, new Date(maintenant.getTime() - 24 * HEURE_MS).toISOString());
  const interrupteur = etatDeLInterrupteur(base);
  const arretees = new Map(annoncees.flatMap((station) => {
    const depuis = arreteeDepuis(base, station);
    return depuis === null ? [] : [[station, depuis] as const];
  }));
  const cooks = cooksEnCours(base).map((cook) => ({ ...cook, mesure: mesures.get(cook.run) ?? null, station: cookDeRun(base, cook.run), activite: activites.get(cook.run) ?? null }));
  return {
    dernierSeq,
    projet: base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null,
    session,
    tick: session && session.endedAt === null && tick && tick.seq > session.startedSeq ? tick : null,
    gardeFous,
    sauvegarde: lastBackup(base),
    base: etatDeLaBase(base),
    baseRetenue: controleRetenu(base),
    reparation: reparationDeLaBase(base),
    grants: ACTIONS.flatMap((action) => etatDuGrant(base, action, maintenant) ?? []),
    rail,
    activites: activitesDuRail(base, rail),
    reprises: reprisesDuRail(base, rail),
    sortiesAvec: aSortirAvec(base, rail),
    sejours: sejoursEnColonne(base, rail.filter(({ state }) => state === "taken").map(({ ticket }) => ticket)),
    captures: capturesDesLivraisons(journal, [...rail.filter(({ state }) => state === "pass" || state === "served").map(({ ticket }) => ticket), ...livres.map(({ ticket }) => ticket)]),
    attend,
    urgence: gardeFous.stoppedAt === null ? urgenceDuChef(base, rail, attend, stations) : null,
    retenues: gardeFous.stoppedAt === null ? retenuesDuChef(rail, attend, stations) : [],
    alerteUrgence: gardeFous.stoppedAt === null ? alerteEnCours(base) : null,
    sansGrant: bilanSansGrant(base),
    passage: passageEnService(base, maintenant),
    pause: pauseDeLaCuisine(base, rail),
    interrupteur,
    stations,
    sansStation: sansStationDepuis(base),
    setup: setupBloque(base),
    miseDeCote: miseDeCoteBloquee(base),
    cooks,
    auxFourneaux: annoncees.flatMap((station) => cooksEnCoursDeStation(base, station).map(({ ticket }) => ({ station, ticket }))),
    arretees,
    worktrees: worktreesGardes(base),
    transcripts: rangementDesTranscripts(base),
    consommation: {
      enCours: consommation(base),
      fenetres: FENETRES_H.map((heures) => ({ heures, ...consommation(base, new Date(maintenant.getTime() - heures * HEURE_MS).toISOString()) })),
    },
    derive: franchis(mergedDeliveries(base), seuilsEnVigueur(base) ?? SANS_SEUIL),
    derivePremierCoup: derivePremierCoup(parcoursDesTickets(base), seuilsEnVigueur(base) ?? SANS_SEUIL),
    livres,
    coincees: livraisonsCoincees(base, maintenant),
    oisive: cuisineOisive({ session, gardeFous, interrupteur, stations, arretees, rail, cooks, livres, finDuDernierCook: finDuDernierCook(base) }, maintenant),
    rejointesRefusees: blocagesDuJournal(base).flatMap(({ id, message }) => (id.startsWith(PREFIXE_DE_LA_REJOINTE) ? [message] : [])),
    evenements: journal.derniers(EVENEMENTS_MONTRES, RESUMES),
  };
}

// Les captures de la dernière livraison de chacun de ces tickets, s'il est
// d'interface : ce que son dernier `cook.reported` livré en porte.
function capturesDesLivraisons({ base }: Journal, tickets: number[]): Map<number, Captures> {
  const lues = new Map<number, Captures>();
  for (const ticket of new Set(tickets)) {
    const [derniere] = base.lire<{ captures: string | null }>(
      "SELECT json_extract(payload, '$.captures') AS captures FROM events WHERE ticket = ? AND type = 'cook.reported' AND json_extract(payload, '$.ending') = 'done' ORDER BY seq DESC LIMIT 1",
      ticket,
    );
    const captures = derniere?.captures == null ? null : lireCaptures(JSON.parse(derniere.captures));
    if (captures !== null) lues.set(ticket, captures);
  }
  return lues;
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

// La même, en anglais, pour le bloc `awaiting` : « 3 d » pour les jours.
export const dureeEn = (ms: number): string => duree(ms).replace(/ j$/, " d");

// Toute la sortie de `status` est en anglais : les lignes qui disent si la box peut
// tourner (#928), puis le bas, de `project` à `latest events` (#940) — leurs libellés
// (docs/glossary.md, §4), leurs états, leurs phrases. `facts` garde ses mots. `depuisEn` :
// la durée écoulée depuis un instant, en anglais (`3 d`, `2 h 04`).
type Depuis = (instant: string) => string;
const nombreEn = (valeur: number) => valeur.toLocaleString("en-US");
const compteEn = (combien: number, mot: string) => `${combien.toLocaleString("en-US")} ${mot}${combien === 1 ? "" : "s"}`;

function decrireRuntime(etat: EtatCuisine, depuis: Depuis): string[] {
  const { session, tick } = etat;
  if (!session) return [ligne("runtime", "never started")];
  if (session.endedAt !== null) return [ligne("runtime", `stopped ${depuis(session.endedAt)} ago`)];
  return [
    // Une session sans fin au journal est aussi celle d'un runtime mort sans
    // préavis : seul l'âge du tick les distingue, d'où sa ligne à lui.
    ligne("runtime", `running according to the log — pid ${session.pid} on ${session.host}, started ${depuis(session.startedAt)} ago`),
    ligne("", tick ? `last tick ${depuis(tick.at)} ago (cadence: ${dureeEn(tick.intervalMs)})` : "no tick since startup"),
  ];
}

function decrireCuisine({ gardeFous, pause, interrupteur }: EtatCuisine, depuis: Depuis): string {
  const cuisine =
    gardeFous.stoppedAt !== null
      ? `STOPPED by the chef ${depuis(gardeFous.stoppedAt)} ago`
      : interrupteur?.on === false
        ? `SWITCHED OFF ${depuis(interrupteur.since)} ago`
        : pause !== null
          ? `PAUSED for the code rename ${depuis(pause.since)} ago`
          : "open";
  const echecs = `${compteEn(gardeFous.failures, "failure")} in a row`;
  const disjoncteur =
    gardeFous.breakerOpenedAt === null
      ? `breaker closed (${echecs}, opens at ${gardeFous.breakerThreshold ?? "?"})`
      : `breaker OPEN for ${depuis(gardeFous.breakerOpenedAt)} (${echecs})`;
  return ligne("kitchen", `${cuisine} · ${disjoncteur}`);
}

// Sans connexion Max, aucun cook ne part : c'est toute la cuisine qui attend
// le chef, et rien d'autre ne le dit dans l'en-tête. Rien à dire sinon.
function decrireConnexion({ stations }: EtatCuisine, depuis: Depuis): string[] {
  return stations.flatMap(({ station, disconnectedAt, disconnectedReason: raison }) =>
    disconnectedAt === null
      ? []
      : [
          ligne(
            "connection",
            `Max ${direDeconnexionEn(raison).toUpperCase()} for ${depuis(disconnectedAt)} on ${station}${raison === null ? "" : ` (${raison})`} — no ticket is taken any more: ${GESTE_DE_CONNEXION_TOMBEE_EN}`,
          ),
        ],
  );
}

// Sans station, aucun cook ne part non plus : le projet n'en déclare aucune,
// et c'est au chef d'en déclarer une. Rien à dire sinon.
function decrireSansStation({ sansStation }: EtatCuisine, depuis: Depuis): string[] {
  return sansStation === null ? [] : [ligne("stations", `NONE DECLARED for ${depuis(sansStation)} — no cook leaves, the tickets stay waiting: ${GESTE_DE_STATION_A_CHAUD_EN}`)];
}

// Un setup bloqué ne lance plus aucun worktree d'ici : la ligne le dit, et
// renvoie au bloc `awaiting`, qui porte la cause et le geste. Rien à dire sinon.
function decrireSetup({ setup }: EtatCuisine, depuis: Depuis): string[] {
  if (setup === null) return [];
  return [ligne("setup", `BLOCKED for ${depuis(setup.since)} on ${setup.base.slice(0, 7)} — no setup is launched from here, for any ticket, as long as the integration branch does not move: the cause and the action are in the \`awaiting\` block`)];
}

// Une cause de mise de côté répétée ralentit la prise d'ici : la ligne le dit, et
// renvoie au bloc `awaiting`. Rien à dire sinon.
function decrireMiseDeCote({ miseDeCote }: EtatCuisine, depuis: Depuis): string[] {
  if (miseDeCote === null) return [];
  return [ligne("aside", `BLOCKED for ${depuis(miseDeCote.since)} (${miseDeCote.reason}) — only one ticket is taken again at a time, to see whether the cause has changed: the cause and the action are in the \`awaiting\` block`)];
}

// Une base rouge arrête la prise de tickets, les jugements et les merges : le pire
// n'est pas l'arrêt, c'est de ne pas en lire la cause. Et un contrôle qui ne
// part pas — la base ne se rapatrie pas — se lit même sur une base qui n'est
// pas rouge : des merges y attendent d'être vérifiés. Rien à dire sinon.
function decrireBase({ base, baseRetenue }: EtatCuisine, depuis: Depuis): string[] {
  if (base?.outcome !== "red") {
    const levee = base === null ? null : direBaseRevenueVerteEn(base, depuis);
    return [...(levee === null ? [] : [ligne("base", levee)]), ...(baseRetenue === null ? [] : [ligne("base", direControleRetenuEn(baseRetenue, depuis))])];
  }
  return [
    ligne("base", `RED since ${depuis(base.redSince ?? base.at)} ago on ${base.sha.slice(0, 7)} — the station takes no more tickets, the pass neither judges nor merges`),
    ...suiteDeBaseRougeEn(base, depuis, baseRetenue).map((suite) => ligne("", suite)),
  ];
}

// La première ligne de `status`, au-dessus de tout : plus rien ne cuit, et
// c'est le chef que toute la cuisine attend — depuis quand, combien de tickets
// sont à l'arrêt, la décision qui les retient et son geste, puis, s'il y en a,
// les autres décisions qui en retiennent aussi. Toutes sont dans le bloc
// `awaiting`, à leur rang. Rien à dire sinon.
export const URGENCE = "emergency  THE WHOLE KITCHEN AWAITS THE CHEF";
function decrireUrgence({ urgence }: EtatCuisine, depuis: Depuis): string[] {
  if (urgence === null) return [];
  const [premiere, ...autres] = urgence.causes;
  const aussi = autres.length === 0 ? "" : ` — also: ${autres.map(({ attente }) => nommerEn(attente)).join(", ")}`;
  return [`${URGENCE} for ${depuis(urgence.depuis)} — ${compteEn(urgence.retenus.length, "ticket")} stopped, held by ${nommerEn(premiere.attente)}: ${direAttenteEn(premiere.attente)}${aussi}`];
}

// La première ligne de `status` sans urgence : rien ne cuit, et pourquoi, tant que la base est
// rouge et que le ticket de ce rouge-là la répare. Hors du bloc `awaiting` : rien
// n'attend le chef. Une réparation échouée n'y est plus « en cours » — c'est la
// ligne `base` du bloc `awaiting` qui prend le relais. Rien à dire sinon.
export const RIEN_NE_CUIT = "nothing cooks: ";
function decrireRienNeCuit({ base, reparation }: EtatCuisine, depuis: Depuis): string[] {
  if (base?.outcome !== "red" || reparation === null || reparation.etat === "echouee" || reparation.redSince !== base.redSince) return [];
  return [`${RIEN_NE_CUIT}base red since ${depuis(base.redSince ?? base.at)} ago, repair #${reparation.ticket} in progress`];
}

// La panne d'une cuisine oisive, des cartes sur le rail (cuisine-oisive.ts) : sous
// l'urgence et `nothing cooks`, au-dessus de tout le reste — ce n'est pas normal, et
// aucune autre ligne ne le dit. Sa cause, s'il y en a une, est dans l'en-tête ou
// dans le bloc `awaiting`. Chaque chaîne d'attente y nomme sa racine (#1902) :
// les cartes qui l'attendent, puis elle, et où elle en est. Rien à dire sinon.
export const PANNE = "fault";
function decrirePanne({ oisive, rail }: EtatCuisine, depuis: Depuis): string[] {
  if (oisive == null) return [];
  const ouEnEst = ({ ticket, left }: RacineDAttente) => {
    if (left !== null) return `off the rail, issue still open: ${nomAbandonEn(left)}`;
    const sur = rail.find((carte) => carte.ticket === ticket);
    return sur === undefined ? "not on the rail" : etatLuEn(sur);
  };
  const racines = racinesDesAttentes(rail, oisive.cartes);
  const dire = (racine: RacineDAttente) => `${racine.awaitedBy.map((carte) => `#${carte}`).join(", ")} → #${racine.ticket} (${ouEnEst(racine)})`;
  const chaines = racines.length === 0 ? "" : ` — wait chain${racines.length === 1 ? "" : "s"}: ${racines.map(dire).join(" · ")}`;
  return [ligne(PANNE, `IDLE KITCHEN for ${depuis(oisive.depuis)} — no cook has run, with ${compteEn(oisive.cartes.length, "card")} on the rail: ${oisive.cartes.map((ticket) => `#${ticket}`).join(", ")}${chaines}`)];
}

// Sous grant, du code est mergé sans le chef : il le lit sans le demander, avec
// ce qu'il en reste. Éteint seul, le grant se lit encore — c'est ce que le chef
// n'a pas fait lui-même. Absent ou révoqué par lui, il n'y a rien à dire.
function decrireGrants({ grants }: EtatCuisine, maintenant: Date, depuis: Depuis): string[] {
  return grants.flatMap((grant) => {
    if (grant.active) {
      const reste = direResteEn(grant, maintenant, dureeEn);
      const dit = bientotEteint(grant, maintenant) ? `, EXPIRING SOON: ${reste}` : grant.until === null && grant.usesLeft === null ? `, ${reste}, since ${depuis(grant.since)} ago` : ` ${reste}`;
      return [ligne("grant", `${grant.action} ACTIVE${dit} — a green pass is merged without you`)];
    }
    if (grant.ended !== "expired") return [];
    return [ligne("grant", `${grant.action} LAPSED ${depuis(grant.since)} ago — ${direExtinctionEn(grant.cause)}: the pass stops at the open PR, nothing is merged without you any more`)];
  });
}

// Un échec de sauvegarde n'écrit rien au journal : c'est l'âge de la dernière
// réussie qui le trahit, comme l'âge du tick trahit un runtime figé.
function decrireSauvegarde({ projet, sauvegarde }: EtatCuisine, maintenant: Date, ageMaxMs: number): string {
  const unite = `brigade-sauvegarde@${projet ?? "<projet>"}`;
  if (!sauvegarde) return ligne("backup", `NEVER DONE — is the timer \`${unite}\` running?`);
  const age = maintenant.getTime() - Date.parse(sauvegarde.at);
  const derniere = `${dureeEn(age)} ago (${sauvegarde.name}, up to event ${sauvegarde.lastSeq})`;
  return ligne("backup", age > ageMaxMs ? `TOO OLD: ${derniere} — more than ${dureeEn(ageMaxMs)}: \`systemctl status ${unite}\`` : derniere);
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

// Le ticket en tête de la file : le premier en attente dans l'ordre de service
// du rail — celui que `prendre` donnerait en premier. Un ticket en WAITING
// derrière un autre n'est plus du rail (#1926) : il n'en est pas la tête.
function enTete(rail: TicketRail[]): TicketRail | undefined {
  return rail.find((ticket) => ticket.state === "waiting" && ticket.waitingOn.length === 0);
}

// Pourquoi le ticket en tête de la file ne part pas : ce qui le retient sur le
// rail (une zone tenue par tel ticket, un ticket attendu), ou la machine
// saturée quand toutes les stations le sont. Nul pour tout autre ticket, et
// pour celui qui part.
export function raisonDeTete(etat: EtatCuisine, ticket: TicketRail): string | null {
  if (enTete(etat.rail) !== ticket) return null;
  const retenue = direRetenueEn(ticket);
  if (retenue !== null) return retenue;
  const saturees = etat.stations.length > 0 && etat.stations.every((station) => !station.remote && station.saturatedAt !== null && station.saturatedCauses.length > 0);
  return saturees ? "machine saturated" : null;
}

// Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à quand.
// `retenues` : ce qui retient chaque station de prendre un ticket qui pourrait partir.
function detail(ticket: TicketRail, maintenant: Date, depuis: Depuis, retenues: string[], reprise?: RepriseDuTicket, sortie?: AbandonEnChaine): string {
  const reste = (instant: string) => Date.parse(instant) - maintenant.getTime();
  // Il sort du rail avec le ticket abandonné qu'il attend : la carte dit lequel (#1902).
  if (sortie !== undefined && (ticket.state === "waiting" || ticket.state === "86")) return `since ${depuis(ticket.since)} — ${direSortieAvecEn(sortie)}`;
  switch (ticket.state) {
    case "waiting":
      // Rien ne le retient sur le rail : s'il ne part pas, c'est sa station.
      // Une attente que la cuisine a levée d'elle-même se dit aussi (#1834).
      // En WAITING derrière un ticket qui y est, ce qui l'en sort seul (#1926).
      return [
        ...[direRetenueEn(ticket) ?? retenues].flat(),
        ...(ticket.waitingOn.length === 0 ? [] : [RETOUR_DERRIERE_UN_WAITING_EN]),
        ...[direAttentesLeveesEn(ticket) ?? []].flat(),
        `since ${depuis(ticket.since)}`,
      ].join(" — ");
    case "taken": {
      const bail = ticket.leaseUntil === null ? 0 : reste(ticket.leaseUntil);
      // Des deux durées d'un ticket pris, seule la seconde révèle un blocage.
      // Elle se lit dans le rail : personne ne regarde un worktree pour l'avoir.
      const progres = ticket.progressedAt === null ? [] : [`no progress since ${depuis(ticket.progressedAt)}`];
      const marque = coince(ticket, maintenant) ? "STUCK: " : "";
      return `by ${ticket.station} since ${depuis(ticket.since)}, ${marque}${[...progres, bail >= 0 ? `lease ${dureeEn(bail)} left` : `lease expired since ${dureeEn(-bail)}`].join(", ")}`;
    }
    case "pass":
    case "served":
      return `since ${depuis(ticket.since)}, cooked by ${ticket.station}`;
    case "86": {
      if (ticket.waitingFor !== null) return direAttenteDeTiersEn(ticket.waitingFor, depuis);
      const retour = ticket.until === null ? "" : `, ${reste(ticket.until) >= 0 ? `back in ${dureeEn(reste(ticket.until))}` : "back at the next tick"}`;
      // Une remontée technique : la carte dit ce que la cuisine en fait.
      if (reprise !== undefined) return `since ${depuis(ticket.since)} (${ticket.reason}) — ${direRepriseEn(reprise)}`;
      // Faute de station, il est en WAITING : ce qu'il attend, et ce qui l'en
      // sort seul (#1925).
      const manque = manqueDuTicket(ticket);
      if (manque !== null) return direAttenteDUneStationEn(manque, depuis(ticket.since));
      // Sans heure de retour, ce qui le remet seul sur le rail (#1834).
      const seul = ticket.until === null ? miseDeCoteDu(ticket.reason) : null;
      return `since ${depuis(ticket.since)} (${ticket.reason})${retour}${seul === null ? "" : seul.retour.startsWith("never") ? ` — ${seul.retour}` : ` — back on its own ${seul.retour}`}`;
    }
  }
}

// Une ligne par livraison coincée en pass : depuis quand, et le geste qui la relance.
function decrireCoincees({ coincees }: EtatCuisine, depuis: Depuis): string[] {
  return coincees.map(({ ticket, since }, rang) =>
    ligne(rang === 0 ? "stuck" : "", `#${ticket} in pass for ${depuis(since)} with no active pass — delivered, never judged: \`${geste(`pass ${ticket} --relaunch`)}\``),
  );
}

// Des gates coupées sur une machine saturée : la file le dit, à la suite du
// détail du ticket. Les autres activités de la pass ne s'y lisent pas. L'activité
// garde sa phrase française (`facts`) : c'est elle qu'on reconnaît.
const direAttenteDeCharge = (activite: ActiviteDeTicket | null | undefined) =>
  activite?.fait === DIRE_GATES_COUPEES ? ` — ${DIRE_GATES_COUPEES_EN}` : activite?.fait === "jugement en cours" && activite.cible !== null ? ` — waiting for the CI of ${activite.cible}` : "";

// Un cook sur une ligne : son ticket, son calibrage, où il travaille, son
// budget consommé, s'il tient un ticket son temps sans progrès — celui du
// rail, que seul un worktree qui bouge remet à zéro —, et ce qu'il fait.
function decrireCook(cook: EtatCuisine["cooks"][number], ticket: TicketRail | undefined, maintenant: Date, depuis: Depuis): string {
  const { limits, mesure, station } = cook;
  const consomme = mesure
    ? `${compteEn(mesure.turns, "turn")} · ${compteEn(mesure.tokens, "token")} of ${nombreEn(limits.tokens)} (reading ${depuis(mesure.at)} ago)`
    : "turns and tokens: no reading yet";
  const budget = [
    `${depuis(cook.launchedAt)} of ${dureeEn(limits.durationMs)}`,
    consomme,
    ...(ticket?.progressedAt ? [`no progress since ${depuis(ticket.progressedAt)}`] : []),
    // Ce qu'il fait : là où il en est, et là où il s'est arrêté s'il ne progresse plus.
    ...(cook.activite ? [`right now: ${direActiviteEn(cook.activite)}, since ${depuis(cook.activite.since)}`] : []),
  ].join(" · ");
  return [
    // Sans ticket : un jugement du manager.
    `  ${cook.ticket === null ? "manager" : `#${cook.ticket}`}`,
    ...(ticket && coince(ticket, maintenant) ? ["STUCK"] : []),
    cook.run,
    ...(station?.model || station?.effort ? [`${station.model ?? "?"} / ${station.effort ?? "?"}`] : []),
    ...(station?.branch ? [`${station.branch}${station.worktree ? ` in ${station.worktree}` : ""}`] : []),
    budget,
  ].join("  ");
}

// Le plafond de chaque station, et d'où il vient : ses cœurs, sa déclaration,
// ou le chef — et alors ce qu'il remplace.
function decrirePlafond(station: EtatStation): string {
  return `${station.station}: ${direPlafondEn(station)}`;
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
  const alerte = coinces.length === 0 ? "" : ` — ${coinces.length} STUCK: ${coinces.map((ticket) => `#${ticket}`).join(", ")}`;
  const plafonds = `${stations.length === 0 ? "" : ` — ${stations.map(decrirePlafond).join(", ")}`}${alerte}`;
  if (cooks.length === 0) return `none running${plafonds}`;
  // Runtime arrêté, le journal ne dit rien de ses cooks avant le démarrage
  // suivant : celui d'une station lui survit, et sera repris ; les autres sont
  // morts avec lui, et seront notés interrompus.
  if (session?.endedAt !== null) return `${cooks.length} with no end in the log — runtime stopped: its next start picks up those still running, and notes the others interrupted`;
  return `${cooks.length} running${plafonds}`;
}

// La station qui se retient parce que la machine n'en peut plus : c'est le
// vrai plafond, et il ne se voit nulle part ailleurs. Chaque ressource en
// cause est nommée — la mémoire, le processeur, les deux —, avec ce qu'elle a
// et ce qu'elle doit avoir, et d'où vient le minimum de mémoire.
function decrireSaturations({ stations }: EtatCuisine, depuis: Depuis): string[] {
  return stations.flatMap((station) => {
    if (station.saturatedAt === null || station.saturatedCauses.length === 0) return [];
    const { ressources, detail } = direSaturationsEn(station.saturatedCauses);
    return [ligne("", `MACHINE SATURATED for ${depuis(station.saturatedAt)} on ${ressources} — ${detail}: ${station.station} takes no more tickets as long as it lasts`)];
  });
}

// La station qui se retient alors qu'un ticket pourrait partir, et pourquoi.
function decrireRetenues({ stations }: EtatCuisine, depuis: Depuis): string[] {
  return stations.flatMap((station) =>
    station.heldAt === null || station.heldReason === null
      ? []
      : [ligne("", `${station.station} WITHHOLDING for ${depuis(station.heldAt)} — ${direRetenueDeStationEn(station.heldReason)}: the servable tickets wait`)],
  );
}

// La station dont l'arbitre entre projets ne répond plus : elle tourne en mode
// dégradé, et rien d'autre ne le montre tant qu'aucun ticket n'attend.
function decrireArbitrage({ stations }: EtatCuisine, depuis: Depuis): string[] {
  return stations.flatMap((station) =>
    station.unarbitratedAt === null
      ? []
      : [ligne("", `ARBITER UNREACHABLE for ${depuis(station.unarbitratedAt)} — ${station.unarbitratedReason ?? "no answer"}: ${station.station} launches only one cook at a time, with no arbitration, until it is back`)],
  );
}

// Les worktrees que le runtime n'a pas pu ranger à la fin de leur cook, et
// pourquoi : c'est ici que ça se retrouve. Rien à dire quand il n'y en a pas.
function decrireWorktrees({ worktrees }: EtatCuisine, depuis: Depuis): string[] {
  if (worktrees.length === 0) return [];
  return [
    ligne("worktrees", `${worktrees.length} not cleaned up after their cook — nothing in them is touched, the runtime comes back to them at every tick`),
    ...worktrees.map(({ ticket, worktree, branch, reason, detail, since }) => `  #${ticket}  ${worktree}  ${branch}  ${direMotifDeGardeEn(reason)} since ${depuis(since)} — ${detail}`),
    "",
  ];
}

// Le `~/.claude` d'un projet cloisonné : ce que le dernier rangement y a
// gardé de transcripts, ce qu'il en a retiré, et la règle. Rien à dire sans
// cloison : aucun rangement n'a lieu.
function decrireTranscripts({ transcripts }: EtatCuisine, depuis: Depuis): string[] {
  if (transcripts === null) return [];
  const mo = (octets: number) => `${(octets / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
  const dire = (combien: number, octets: number, quoi: string) => (combien === 0 ? `no ${quoi}` : `${nombreEn(combien)} ${quoi} (${mo(octets)})`);
  const { kept, keptBytes, removed, freedBytes, keepMs, at } = transcripts;
  return [
    ligne(
      "claude",
      `project transcripts: ${dire(kept, keptBytes, "kept")}, ${dire(removed, freedBytes, "removed")} at the cleanup ${depuis(at)} ago — a transcript goes ${dureeEn(keepMs)} after its last write`,
    ),
  ];
}

// Ce que la consommation affichée n'est pas : celle du compte. Le runtime ne
// voit que ce que son projet a lancé, jamais les sessions du chef.
export const NOTE_CONSOMMATION = "ce que ce projet a lancé, pas la consommation du compte : /usage la donne";
export const NOTE_CONSOMMATION_EN = "what this project has launched, not the account's consumption: /usage gives it";

// Ce qu'un ensemble de lancements a consommé, tel que le chef le lit.
export function direConsommation({ runs, reviews, judgments, turns, tokens }: Consommation): string {
  if (runs === 0) return "rien";
  const dont = [...(reviews === 0 ? [] : [compte(reviews, "relecture")]), ...(judgments === 0 ? [] : [compte(judgments, "jugement")])];
  return [`${compte(runs, "lancement")}${dont.length === 0 ? "" : `, dont ${dont.join(" et ")}`}`, compte(turns, "tour"), compte(tokens, "token")].join(" · ");
}

// La même, en anglais : ce que dit `status`.
export function direConsommationEn({ runs, reviews, judgments, turns, tokens }: Consommation): string {
  if (runs === 0) return "nothing";
  const dont = [...(reviews === 0 ? [] : [compteEn(reviews, "review")]), ...(judgments === 0 ? [] : [compteEn(judgments, "judgment")])];
  return [`${nombreEn(runs)} ${runs === 1 ? "launch" : "launches"}${dont.length === 0 ? "" : `, of which ${dont.join(" and ")}`}`, compteEn(turns, "turn"), compteEn(tokens, "token")].join(" · ");
}

function decrireConsommation({ consommation }: EtatCuisine): string[] {
  return [
    ligne("consumed", `in flight: ${direConsommationEn(consommation.enCours)}`),
    ...consommation.fenetres.map((fenetre) => ligne("", `${fenetre.heures} h: ${direConsommationEn(fenetre)}`)),
    ligne("", NOTE_CONSOMMATION_EN),
  ];
}

// Les appels de la box à GitHub sur l'heure glissante, tels que l'app les lit :
// `total`, le projet (`topProject`) et la sorte de lecture (`topKind`) qui en ont fait le plus
// — nuls sans appel — et la répartition entière (`byProject`, `byKind`, le plus gros d'abord).
export type AppelsGithub = {
  total: number;
  topProject: { name: string; calls: number } | null;
  topKind: { name: string; calls: number } | null;
  byProject: Array<{ name: string; calls: number }>;
  byKind: Array<{ name: string; calls: number }>;
};

const nommes = (l: Array<{ nom: string; appels: number }>) => l.map(({ nom, appels }) => ({ name: nom, calls: appels }));

export function faitsDesAppels(r: Repartition): AppelsGithub {
  const byProject = nommes(r.parProjet);
  const byKind = nommes(r.parLecture);
  return { total: r.total, topProject: byProject[0] ?? null, topKind: byKind[0] ?? null, byProject, byKind };
}

// Combien de tickets du rail se lisent dans cet état.
const lus = (rail: TicketRail[], nom: string) => rail.filter((ticket) => etatLu(ticket) === nom).length;
const lusEn = (rail: TicketRail[], nom: string) => rail.filter((ticket) => etatLuEn(ticket) === nom).length;

// L'état, ligne par ligne. Les durées sont comptées jusqu'à `maintenant`.
export function decrireEtat(etat: EtatCuisine, maintenant: Date, ageMaxSauvegardeMs = AGE_MAX_SAUVEGARDE_MS, limiteGithub: number | null = null, appels: Repartition | null = null, retenue: number | null = null): string[] {
  const depuisEn = (instant: string) => dureeEn(maintenant.getTime() - Date.parse(instant));
  const decompte = ORDRE.map((nom) => [nom, lusEn(etat.rail, nom)] as const)
    .filter(([, combien]) => combien > 0)
    .map(([nom, combien]) => `${combien} ${nom}`);
  // Un rail qui ne porte que des cartes en WAITING est vide pour la cuisine :
  // elles attendent un tiers ou une station, ce n'est pas une panne (#1927).
  const toutEnWaiting = etat.rail.length > 0 && etat.rail.every((ticket) => etatLuEn(ticket) === EN_WAITING);
  const cooks = trierCooks(etat, maintenant);
  // Ce qui retient un ticket que rien ne retient sur le rail : les stations
  // qui pourraient le cuisiner — celles qui fournissent ce qu'il demande — et
  // qui se retiennent. Une station qui ne le prendrait de toute façon pas n'y
  // est pour rien.
  const retenuesDe = (ticket: TicketRail) => [
    ...(raisonDeTete(etat, ticket) === null ? [] : ["machine saturated"]),
    ...(etat.sansStation === null ? [] : ["no station declared"]),
    ...etat.stations.flatMap((station) =>
      station.heldReason === null || !fournitTout(station.provides, requises(ticket.card)) ? [] : [`withheld by ${station.station} (${direRetenueDeStationEn(station.heldReason)})`],
    ),
  ];
  return [
    ...decrireUrgence(etat, depuisEn),
    ...decrireRienNeCuit(etat, depuisEn),
    ...decrirePanne(etat, depuisEn),
    ligne("project", etat.projet ?? "unknown — empty log"),
    // Quand GitHub limite les appels du compte : une ligne, et l'heure de reprise.
    ...(limiteGithub === null ? [] : [ligne("github", direLaLimite(limiteGithub))]),
    // Quand la box retient ses propres appels à la réserve des gestes : GitHub n'a rien refusé.
    ...(retenue === null || limiteGithub !== null ? [] : [ligne("github", direLaRetenue(retenue))]),
    // Les appels de la box à GitHub sur l'heure écoulée, quand son compteur existe.
    ...(appels === null ? [] : direLesAppels(appels).map((texte, i) => ligne(i === 0 ? "gh calls" : "", texte))),
    // Le coût du tableau de la cuisine dans ce budget : à zéro sans activité, tant que le compteur existe.
    ...(appels === null ? [] : [ligne("board cost", direLeCoutDuTableau(appels))]),
    ...decrireRuntime(etat, depuisEn),
    ...(etat.interrupteur == null ? [] : [ligne("switch", direInterrupteur(etat.interrupteur))]),
    decrireCuisine(etat, depuisEn),
    ...decrireConnexion(etat, depuisEn),
    ...decrireSansStation(etat, depuisEn),
    ...decrireBase(etat, depuisEn),
    ...decrireSetup(etat, depuisEn),
    ...decrireMiseDeCote(etat, depuisEn),
    ...decrireGrants(etat, maintenant, depuisEn),
    decrireSauvegarde(etat, maintenant, ageMaxSauvegardeMs),
    "",
    // Avant le rail : « est-ce qu'on m'attend ? » se lit sans le parcourir.
    ...decrireAttentes(etat.attend, depuisEn, etat.sansGrant, etat.passage, etat.pause),
    ...decrireCoincees(etat, depuisEn),
    ligne("rail", decompte.length === 0 ? "empty" : toutEnWaiting ? `empty — ${decompte.join(" · ")}, normal: nothing on it for a cook` : decompte.join(" · ")),
    ...etat.rail.map((ticket) =>
      [
        `  #${ticket.ticket}`,
        etatLuEn(ticket),
        ticket.priority === null ? "-" : `prio:${ticket.priority}`,
        avecHorsZoneEn(detail(ticket, maintenant, depuisEn, retenuesDe(ticket), etat.reprises?.get(ticket.ticket), etat.sortiesAvec?.get(ticket.ticket)) + direAttenteDeCharge(etat.activites.get(ticket.ticket)), ticket),
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
    ...decrireSaturations(etat, depuisEn),
    ...decrireRetenues(etat, depuisEn),
    ...decrireArbitrage(etat, depuisEn),
    ...cooks.map(({ cook, ticket }) => decrireCook(cook, ticket, maintenant, depuisEn)),
    "",
    ...decrireWorktrees(etat, depuisEn),
    ...decrireConsommation(etat),
    // Absent quand rien n'est franchi : le bloc n'apparaît que pour être lu.
    ...(etat.derive.length === 0 ? [] : [ligne("drift", `${etat.derive.map(direJaugeEn).join(" · ")} — \`${geste(`measures`)}\``)]),
    ...(etat.derivePremierCoup === null ? [] : [ligne("drift", `${direDerivePremierCoupEn(etat.derivePremierCoup)} — \`${geste(`measures`)}\``)]),
    ...decrireTranscripts(etat, depuisEn),
    "",
    "latest events",
    ...(etat.evenements.length === 0 ? ["  none"] : etat.evenements.map((evenement) => `  ${formaterEvenement(evenement)}`)),
  ];
}

// L'état du projet en un mot, pour qui pose une couleur dessus. La liste est
// fermée, et dans l'ordre où un mot l'emporte sur les suivants.
export const ETATS_DE_PROJET = ["éteinte", "arrêtée", "retenue", "ouverte"] as const;
export type EtatDeProjet = (typeof ETATS_DE_PROJET)[number];

// Chaque mot résume ce que l'en-tête de `decrireEtat` écrit en toutes lettres :
// le runtime, le « stop » du chef, puis ce qui empêche tout ticket de partir —
// disjoncteur, pause du renommage, connexion Max, aucune station déclarée, base rouge. « Ouverte » vaut d'après le journal :
// un runtime mort sans préavis l'est encore.
function etatDuProjet({ session, gardeFous, stations, sansStation, base, setup, pause, interrupteur }: EtatCuisine): EtatDeProjet {
  if (!session || session.endedAt !== null) return "éteinte";
  if (gardeFous.stoppedAt !== null) return "arrêtée";
  // Un setup bloqué retient les stations d'ici ; une distante prépare le sien
  // sur son poste, et cuisine encore.
  const sansSetup = setup !== null && !stations.some((station) => station.remote);
  const retenue = gardeFous.breakerOpenedAt !== null || interrupteur?.on === false || pause !== null || stations.some((station) => station.disconnectedAt !== null) || sansStation !== null || base?.outcome === "red" || sansSetup;
  return retenue ? "retenue" : "ouverte";
}

// Les faits qu'un programme dessine. Cette forme est un contrat (docs/runtime/etat-et-mesures.md,
// « Les faits, pour un programme ») : ses champs, leur ordre et ses mots ne
// changent pas sans que son lecteur change.
export type Faits = {
  etat: EtatDeProjet;
  // L'heure de la lecture, et celle du dernier tick du runtime en marche : de
  // quoi afficher son âge sans l'horloge de la box.
  lu: string;
  dernierTick: string | null;
  // Quand GitHub limite les appels du compte : l'instant où il les rend. Absent
  // sinon, et d'un runtime d'avant ce champ.
  limiteGithub?: string;
  // Les appels de la box à GitHub sur l'heure glissante, quand son compteur existe.
  appelsGithub?: AppelsGithub;
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
  // tout autre ticket. Un ticket mis de côté faute de station y est aussi (1752) :
  // son attente est une action que le chef ne fait pas par un bouton, brancher une
  // station ; `relance` est nulle — personne ne l'a posé, rien à reprendre ni à
  // renvoyer —, et `aLArrivee` dit qu'il repart seul. Aucun ticket ne revient de WAITING dans TODO
  // (#1834) : `revenu`, qui en disait le motif, n'est plus donné. `captures` : pour un ticket d'interface en pass
  // ou servi, l'écran avant et après de sa dernière livraison, et si elle les
  // porte tous (captures.ts, `CapturesVues`) — absent pour tout autre ticket.
  rail: Array<{
    ticket: number;
    etat: string;
    titre: string;
    url: string;
    // Depuis quand il est dans cet état : sa prise, son entrée en pass… (#1811). Pour un ticket pris, le début
    // de son séjour : sa première prise, à travers les relances qui suivent la fin d'un cook (#1893).
    depuis: string;
    // Pour un ticket pris seulement : ses essais, du plus ancien au courant (sejour-en-colonne.ts).
    essais?: Essai[];
    activite: ActiviteDeTicket | null;
    attente: { raison: string; colonne: string; retour: string | null } | null;
    tiers: { quoi: string; qui: string; depuis: string; relance: string | null; aLArrivee: string } | null;
    // Pour le ticket en tête de la file seulement, s'il ne part pas : pourquoi
    // (`zone held by #12 (src)`, `machine saturated`). Nul pour tout autre, et
    // pour celui qui part. Le rail est dans l'ordre où il se sert.
    raison: string | null;
    captures?: CapturesVues;
  }>;
  // Les cooks en cours, comme `station` les montre. Le titre est celui du rail :
  // vide si le ticket l'a quitté pendant la cuisson.
  cooks: Array<{ ticket: number; titre: string; station: string }>;
  // Les tickets que le bloc `attend` de `status` nomme, une entrée chacun, dans
  // son ordre — la connexion Max, qui n'est à aucun ticket, n'en donne aucune.
  // `url` : l'adresse de l'issue, celle du rail ou, hors rail, celle que le dépôt
  // de la box donne ; nulle quand la box ne connaît pas son dépôt. `titre` : celui
  // du rail, vide pour une issue qui n'y est pas — le journal ne le connaît pas.
  // `decision` : ce que la ligne du bloc attend du chef, en champs (attend.ts,
  // `Decision`) — celle de la première ligne du ticket, s'il en a plusieurs.
  // `livraison` : pour une livraison qui attend, ce que la pass en a consigné — le
  // résumé de sa relecture, son premier constat bloquant, les fichiers de ses juges
  // qu'elle change ; absente quand la pass n'a rien consigné. `carte` : la carte
  // de TODO du ticket, dans la forme unique (carte-todo/cartes.ts) : sa sorte
  // (`type` : `product` ou `design` pour une carte entrée par la porte de TODO,
  // sinon celle de l'attente — `merge`, `remontee`…), son `resume` — ce qui se
  // passe, en deux phrases simples au plus —, sa `question` — nulle sur une
  // carte à un seul geste —, ses `choix` — chacun son `texte` et sa `suite`
  // (`resume`, `merge`, `drop`), dans l'ordre que `rail choose` numérote à
  // partir de 1 —, `reponseLibre`, `secondaire` (« ask the second »), et ses
  // `captures`, chaque écran avant et après, par leur adresse — par leur chemin
  // dans le dépôt quand la box ne le connaît pas —, nulles sans écran.
  attend: Array<{ ticket: number; titre: string; url: string | null; decision: Decision; livraison?: Livraison; carte: CarteVue }>;
  // Les tickets servis dans les 24 h avant `lu`, le plus récent d'abord — ceux
  // que `compteurs.livres24h` compte, un pour un, encore sur le rail ou non.
  // `livre` : l'heure de son service. `station` : celle qui l'a cuisiné, nulle
  // quand aucune ne l'a envoyé en pass. `pr` : la PR mergée, nulle pour un
  // ticket servi sans merge. `titre`, `url` : ceux de son issue — vide et nulle
  // pour une livraison que le rail n'a jamais portée, sauf à connaître le dépôt.
  // `relecture` : ce que le reviewer a dit de ce qui a été servi, mot pour mot —
  // son `resume`, ses `constats` dans son ordre ; nulle quand aucune relecture
  // lisible ne porte sur la livraison servie (mergée à la main, d'avant elle).
  // `captures` : comme sur le rail, pour un ticket d'interface.
  livres: Array<{ ticket: number; titre: string; url: string | null; livre: string; station: string | null; pr: string | null; relecture: RelectureLivree | null; captures?: CapturesVues }>;
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
  // Les décisions du chef qui retiennent des tickets sans arrêter la cuisine :
  // `retenus`, ceux qui les attendent, directement ou de proche en proche. Les
  // autres tickets sont servis. Vide sinon, et vide aussi à l'arrêt total
  // (c'est `urgence`).
  retenues: Array<DecisionUrgente & { retenus: number[] }>;
  // La panne d'une cuisine oisive, des cartes sur le rail (cuisine-oisive.ts) : la
  // ligne `fault` de `status`. `depuis` : le dernier repère d'où l'oisiveté se compte
  // — la fin du dernier cook, le démarrage du runtime, le dernier service,
  // l'interrupteur rallumé ; sa durée est l'écart à `lu`. `cartes` : les tickets qui
  // devraient cuire, dans l'ordre du rail. Nulle sinon.
  cuisineOisive: CuisineOisive | null;
  // Les stations que le projet déclare, dans l'ordre de leur nom, et ce
  // qu'elles font des tickets ordinaires — ceux qui ne demandent rien.
  // `distante` : elle tire son travail depuis le poste du chef. `plafond` : ses
  // cooks à la fois, au plus — nul, sans limite. `ordinaires` : le réglage du
  // chef, qui ne se dit que d'une distante. `ensemble` : distante, c'est une
  // station de plus du projet — elle prend les tickets ordinaires à côté de la
  // box, sans attendre qu'elle sature. `bacASable` : ce que la station a
  // dit du bac à sable de son poste — `disponible`, `raison` (nulle s'il l'est),
  // `version` de son `claude` (nulle s'il ne l'est pas), `depuis` ; nul tant
  // qu'elle n'en a rien dit. `prendOrdinaires` : elle en prend, à cet instant —
  // toujours vrai d'une station d'ici ; d'une distante, réglage et bac à sable,
  // et elle n'en reçoit que quand la box sature, sauf `ensemble`.
  // `cuisson` : ce que la station fait du projet, un mot de `CUISSONS` —
  // `refused` (la station de la machine refuse le projet : `refus` dit
  // pourquoi), `stopped` (le chef l'a arrêtée — `arreteeDepuis` —, ou il a
  // arrêté toute la cuisine), `saturated` (sa machine n'en peut plus), sinon
  // `cooking`. `cooks` : ses cooks en cours, le plus ancien d'abord — arrêtée,
  // ce sont ceux qui finissent. Et ce que la principale sait d'elle (#1830) :
  // `fournit`, ce qu'elle déclare fournir ; `presente`, si elle la voit — toujours
  // vrai d'une station d'ici ; d'une distante, si elle s'est manifestée et ne
  // s'est pas tue depuis (`presentSince`) — une distante absente ne prend aucun
  // ticket, quel que soit son mot ; `vueLe`, sa dernière demande, nulle d'une
  // station d'ici ou d'une distante qui ne s'est jamais manifestée.
  stations: Array<{
    station: string;
    distante: boolean;
    plafond: number | null;
    ordinaires: boolean;
    // Toujours posé par `faits` ; facultatif pour qui lit un runtime d'avant ce champ.
    ensemble?: boolean;
    bacASable: { disponible: boolean; raison: string | null; version: string | null; depuis: string } | null;
    prendOrdinaires: boolean;
    cuisson: Cuisson;
    arreteeDepuis: string | null;
    refus: Refus | null;
    cooks: Array<{ ticket: number; titre: string; station: string }>;
    // Toujours posés par `faits` ; facultatifs pour qui lit un runtime d'avant ces champs.
    fournit?: string[];
    presente?: boolean;
    vueLe?: string | null;
  }>;
};

// Ce qu'une station fait du projet, pour qui pose un mot dessus. La liste est
// fermée, et peut gagner un mot.
export const CUISSONS = ["cooking", "stopped", "saturated", "refused"] as const;
export type Cuisson = (typeof CUISSONS)[number];

// L'alerte émise pour l'urgence : sa ligne, sa première émission, la dernière
// (rappel compris), et le nombre de rappels. Le début de l'arrêt est le `depuis`
// de l'urgence.
export type AlerteExposee = { libelle: string; emiseLe: string; derniereLe: string; rappels: number };

// Une décision du chef qui retient toute la cuisine, pour un programme.
export type DecisionUrgente = { decision: string; ticket: number | null; cause: CauseDUrgence; geste: string; url: string | null };

// Ce qui retient la cuisine, pour qui pose un mot dessus : la nature de
// l'entrée du bloc `attend` en cause. La liste est fermée, et peut gagner un
// mot. Une entrée qui n'est à aucun ticket du rail ni à une station — une issue
// écartée, la passe de fermeture… — n'est jamais en cause : elle
// ne retient aucun ticket.
export const CAUSES_D_URGENCE = {
  merge: "merge",
  remontee: "remontée",
  fermee: "PR fermée",
  ecartee: "écartée",
  illisible: "illisible",
  question: "question",
  connexion: "connexion",
  session: "session",
  jeton: "jeton",
  fermeture: "fermeture",
  base: "base rouge",
  setup: "setup",
  aside: "mis de côté",
  disjoncteur: "disjoncteur",
  carte: "carte",
  pause: "pause du renommage",
  renommage: "renommage échoué",
} as const satisfies Record<Attente["quoi"], string>;
export type CauseDUrgence = (typeof CAUSES_D_URGENCE)[keyof typeof CAUSES_D_URGENCE];

// Une relecture, dans les mots que le reviewer lui-même emploie (reviewer.ts).
export type RelectureLivree = { resume: string; constats: Array<{ gravite: "bloquant" | "remarque"; fichier: string | null; constat: string }> };
const GRAVITES = { blocking: "bloquant", remark: "remarque" } as const;
const relectureLivree = (review: Livre["review"]): RelectureLivree | null =>
  review === null ? null : { resume: review.summary, constats: review.findings.map(({ severity, file, text }) => ({ gravite: GRAVITES[severity], fichier: file, constat: text })) };

const decisionUrgente = (attente: Attente, adresse: (ticket: number) => string | null): DecisionUrgente => ({
  decision: nommerAttente(attente),
  ticket: attente.ticket,
  cause: CAUSES_D_URGENCE[attente.quoi],
  geste: direAttente(attente),
  url: attente.ticket === null ? null : adresse(attente.ticket),
});

function faitsDUrgence(urgence: Urgence | null, alerte: AlerteEnCours | null, adresse: (ticket: number) => string | null): Faits["urgence"] {
  if (urgence === null) return null;
  const decision = ({ attente }: Urgence["causes"][number]): DecisionUrgente => decisionUrgente(attente, adresse);
  const [premiere, ...autres] = urgence.causes;
  // L'alerte d'une autre urgence (cause changée, pas encore réannoncée) n'est
  // pas la sienne.
  const exposee = alerte === null || alerte.key !== cleDUrgence(urgence) ? null : { libelle: alerte.label, emiseLe: alerte.emiseLe, derniereLe: alerte.derniereLe, rappels: alerte.rappels };
  return { ...decision(premiere), depuis: urgence.depuis, retenus: urgence.retenus, autres: autres.map(decision), alerte: exposee };
}

export const DEPOT_GITHUB = /^[\w.-]+\/[\w.-]+$/;

// Une carte de TODO, pour un programme : ses captures par leur adresse.
export type CarteVue = Omit<CarteDuTicket, "captures"> & { captures: CapturesVues | null };

// `maintenant` : l'heure à laquelle `etat` a été lu. `depot` : `<owner>/<repo>`,
// le dépôt GitHub que la box sert — de quoi donner l'adresse d'une issue qui
// n'est pas sur le rail. `refusDeLaMachine` : pourquoi la station de cette
// machine refuse le projet — ses stations d'ici sont alors `refused` —, ou null.
export function faits(etat: EtatCuisine, maintenant: Date, depot?: string, limiteGithub: number | null = null, refusDeLaMachine: Refus | null = null, appels: Repartition | null = null): Faits {
  const adresse = (ticket: number) =>
    etat.rail.find((surLeRail) => surLeRail.ticket === ticket)?.url ?? (depot !== undefined && DEPOT_GITHUB.test(depot) ? `https://github.com/${depot}/issues/${ticket}` : null);
  const attendus = new Set<number>();
  const dernier = etat.evenements.at(-1);
  // Les captures d'un ticket d'interface, par leur adresse : sans dépôt connu,
  // aucune ne se montre.
  const captures = (ticket: number) => {
    const siennes = depot !== undefined && DEPOT_GITHUB.test(depot) ? etat.captures?.get(ticket) : undefined;
    return siennes === undefined ? {} : { captures: capturesVues(depot as string, siennes) };
  };
  const carteVue = ({ captures: siennes, ...carte }: CarteDuTicket): CarteVue => {
    if (siennes === null) return { ...carte, captures: null };
    if (depot !== undefined && DEPOT_GITHUB.test(depot)) return { ...carte, captures: capturesVues(depot, siennes) };
    return { ...carte, captures: { complet: capturesManquantes(siennes.screens) === null, ecrans: siennes.screens.map(({ screen, before, after }) => ({ ecran: screen, avant: before, apres: after })) } };
  };
  const titreDe = (ticket: number) => etat.rail.find((surLeRail) => surLeRail.ticket === ticket)?.title ?? "";
  const cuisson = (station: EtatStation): Cuisson => {
    if (!station.remote && refusDeLaMachine !== null) return "refused";
    if (etat.arretees.has(station.station) || etat.gardeFous.stoppedAt !== null) return "stopped";
    if (!station.remote && station.saturatedCauses.length > 0) return "saturated";
    return "cooking";
  };
  return {
    etat: etatDuProjet(etat),
    lu: maintenant.toISOString(),
    dernierTick: etat.tick?.at ?? null,
    ...(limiteGithub === null ? {} : { limiteGithub: new Date(limiteGithub).toISOString() }),
    ...(appels === null ? {} : { appelsGithub: faitsDesAppels(appels) }),
    compteurs: {
      rail: lus(etat.rail, nomEtat("waiting")) + lus(etat.rail, BLOQUE),
      auTravail: lus(etat.rail, nomEtat("taken")),
      aLaPass: lus(etat.rail, nomEtat("pass")),
      attend: etat.attend.length,
      livres24h: etat.livres.length,
    },
    dernierEvenement: dernier ? { seq: dernier.seq, at: dernier.at, type: dernier.type, ticket: dernier.ticket } : null,
    rail: etat.rail.map((ticket) => {
      // Sans station, le ticket se lit en WAITING (etatLu) : ce qu'il attend est une action que le chef ne fait pas par un bouton.
      const faute = ticket.state === "86" && ticket.waitingFor === null ? attenteDUneStation(ticket.reason) : null;
      // En WAITING derrière un ticket qui y est, sa carte dit lequel (#1926).
      const derriere = direAttenteDUnWaiting(ticket);
      return {
        ticket: ticket.ticket,
        etat: etatLu(ticket),
        titre: ticket.title,
        url: ticket.url,
        depuis: etat.sejours?.get(ticket.ticket)?.depuis ?? ticket.since,
        ...(etat.sejours?.has(ticket.ticket) ? { essais: etat.sejours.get(ticket.ticket)?.essais } : {}),
        activite: etat.activites.get(ticket.ticket) ?? null,
        attente:
          ticket.state === "86"
            ? { raison: direRaisonDuRail(ticket.reason, etat.reprises?.get(ticket.ticket)), colonne: etatLu(ticket), retour: ticket.until }
            : derriere === null
              ? null
              : { raison: derriere, colonne: EN_WAITING, retour: null },
        tiers:
          faute !== null
            ? { ...faute, depuis: ticket.since, relance: null }
            : ticket.waitingFor === null
              ? null
              : { quoi: ticket.waitingFor.what, qui: ticket.waitingFor.who, depuis: ticket.waitingFor.since, relance: ticket.waitingFor.followUp, aLArrivee: ticket.waitingFor.onArrival },
        raison: raisonDeTete(etat, ticket),
        ...(ticket.state === "pass" || ticket.state === "served" ? captures(ticket.ticket) : {}),
      };
    }),
    // Une station ne lance un cook que pour un ticket.
    cooks: etat.auxFourneaux.flatMap(({ station, ticket }) =>
      ticket === null ? [] : [{ ticket, titre: titreDe(ticket), station }],
    ),
    attend: etat.attend.flatMap((attente) => {
      if (attente.ticket === null || attendus.has(attente.ticket)) return [];
      const { ticket, title } = attente;
      attendus.add(ticket);
      return [{ ticket, titre: title ?? "", url: adresse(ticket), decision: decisionDe(attente), ...("livraison" in attente && attente.livraison !== undefined ? { livraison: attente.livraison } : {}), carte: carteVue(carteDeLAttente(attenteDeLaCarte(etat.attend, ticket) ?? attente)) }];
    }),
    livres: etat.livres.map(({ ticket, title, url, servedAt, station, pr, review }) => ({ ticket, titre: title, url: url ?? adresse(ticket), livre: servedAt, station, pr, relecture: relectureLivree(review), ...captures(ticket) })),
    urgence: faitsDUrgence(etat.urgence, etat.alerteUrgence, adresse),
    retenues: etat.retenues.map(({ attente, retenus }) => ({ ...decisionUrgente(attente, adresse), retenus })),
    cuisineOisive: etat.oisive ?? null,
    stations: etat.stations.map((station) => ({
      station: station.station,
      distante: station.remote,
      plafond: plafondDeCooks(station),
      ordinaires: station.remote && station.ordinary,
      ensemble: station.remote && station.alongside === true,
      bacASable: station.sandbox && { disponible: station.sandbox.available, raison: station.sandbox.reason, version: station.sandbox.version, depuis: station.sandbox.at },
      prendOrdinaires: prendLesOrdinaires({ distante: station.remote, ordinaires: station.ordinary }, station.sandbox),
      cuisson: cuisson(station),
      arreteeDepuis: etat.arretees.get(station.station) ?? null,
      refus: station.remote ? null : refusDeLaMachine,
      cooks: etat.auxFourneaux.flatMap(({ station: sienne, ticket }) =>
        sienne !== station.station || ticket === null ? [] : [{ ticket, titre: titreDe(ticket), station: sienne }],
      ),
      fournit: [...station.provides],
      presente: !station.remote || station.presentSince !== null,
      vueLe: station.remote ? station.seenAt : null,
    })),
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
