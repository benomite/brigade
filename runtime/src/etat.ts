// L'état de la cuisine tel que le chef le lit : le runtime et son dernier tick,
// la dernière sauvegarde, ce qui l'attend, le rail, les cooks en cours et ce
// qu'ils ont consommé, les derniers événements. Tout vient du journal et de
// ses projections — rien n'est calculé ni gardé ailleurs, et rien n'est écrit.
import { attentesDuChef, decrireAttentes, type Attente } from "./attend.ts";
import type { Evenement } from "./evenements.ts";
import { RELEVE } from "./evenements/garde-fous.ts";
import { PART_SANS_PROGRES } from "./evenements/station.ts";
import { BATTEMENT } from "./evenements/runtime.ts";
import { direControleRetenu, suiteDeBaseRouge } from "./dire-base.ts";
import { ACTIONS, bientotEteint, direExtinction, direReste } from "./grant.ts";
import type { Journal } from "./journal.ts";
import { formaterEvenement } from "./ligne-evenement.ts";
import { direSaturation } from "./machine.ts";
import { direJauge, franchis, SANS_SEUIL, type Franchi } from "./mesures.ts";
import {
  consommation,
  cooksEnCours,
  etatDesGardeFous,
  mesuresDesCooksEnCours,
  type Consommation,
  type CookEnCours,
  type EtatGardeFous,
  type Mesure,
} from "./projections/garde-fous.ts";
import { livraisonsMergees, seuilsEnVigueur } from "./projections/mesures.ts";
import { controleRetenu, etatDeLaBase, etatDuGrant, type ControleRetenu, type EtatDeLaBase, type Grant } from "./projections/pass.ts";
import { direMotifDeGarde, rangementDesTranscripts, worktreesGardes, type RangementDeTranscripts, type WorktreeGarde } from "./projections/nettoyage.ts";
import { lireRail, type Etat as EtatTicket, type TicketRail } from "./projections/rail.ts";
import { derniereSauvegarde, type Sauvegarde } from "./projections/sauvegardes.ts";
import { dernierTick, derniereSession, type SessionPassee, type Tick } from "./projections/sessions.ts";
import { cookDeRun, direDeconnexion, direRetenueDeStation, etatStation, GESTE_DE_CONNEXION, plafondDeCooks, stationsAnnoncees, type CookDeStation, type EtatStation } from "./projections/stations.ts";
import { BLOQUE, direRetenue, etatLu, nomEtat } from "./rail.ts";

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
// pas seuls.
const ETATS: EtatTicket[] = ["taken", "pass", "waiting", "86", "served"];
const ORDRE = ETATS.flatMap((etat) => (etat === "waiting" ? [nomEtat(etat), BLOQUE] : [nomEtat(etat)]));

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
  // Ce qui attend une décision du chef, le plus ancien d'abord.
  attend: Attente[];
  // Le dernier contrôle de la base d'intégration : rouge, elle retient la cuisine.
  base: EtatDeLaBase | null;
  // Le contrôle de la base que son rapatriement retient, rouge ou non.
  baseRetenue: ControleRetenu | null;
  // Les grants donnés, tels qu'ils valent à l'heure de la lecture.
  grants: Grant[];
  // Les stations annoncées : leur plafond de cooks, et la machine si elle sature.
  stations: EtatStation[];
  // `station` : ce que sa station dit du cook — son calibrage, sa branche, son
  // worktree —, ou null pour un cook d'avant elle.
  cooks: Array<CookEnCours & { mesure: Mesure | null; station: CookDeStation | null }>;
  // Ce que l'ensemble des cooks a consommé : ceux qui tournent, puis, par
  // fenêtre glissante, ceux qui tournent et ceux qui ont fini dedans.
  // Les worktrees que le nettoyage a gardés après leur ticket.
  worktrees: WorktreeGarde[];
  // Le dernier rangement des transcripts du projet, s'il est cloisonné.
  transcripts: RangementDeTranscripts | null;
  consommation: { enCours: Consommation; fenetres: Array<{ heures: number } & Consommation> };
  // Les mesures du projet qui ont franchi un seuil déclaré.
  derive: Franchi[];
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
  const rail = lireRail(base);
  return {
    dernierSeq,
    projet: base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null,
    session,
    tick: session && session.endedAt === null && tick && tick.seq > session.startedSeq ? tick : null,
    gardeFous: etatDesGardeFous(base),
    sauvegarde: derniereSauvegarde(base),
    base: etatDeLaBase(base),
    baseRetenue: controleRetenu(base),
    grants: ACTIONS.flatMap((action) => etatDuGrant(base, action, maintenant) ?? []),
    rail,
    attend: attentesDuChef(base, rail),
    stations: stationsAnnoncees(base).flatMap((station) => etatStation(base, station) ?? []),
    cooks: cooksEnCours(base).map((cook) => ({ ...cook, mesure: mesures.get(cook.run) ?? null, station: cookDeRun(base, cook.run) })),
    worktrees: worktreesGardes(base),
    transcripts: rangementDesTranscripts(base),
    consommation: {
      enCours: consommation(base),
      fenetres: FENETRES_H.map((heures) => ({ heures, ...consommation(base, new Date(maintenant.getTime() - heures * HEURE_MS).toISOString()) })),
    },
    derive: franchis(livraisonsMergees(base), seuilsEnVigueur(base) ?? SANS_SEUIL),
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

// Une base rouge arrête la prise de tickets et les merges sous grant : le pire
// n'est pas l'arrêt, c'est de ne pas en lire la cause. Et un contrôle qui ne
// part pas — la base ne se rapatrie pas — se lit même sur une base qui n'est
// pas rouge : des merges y attendent d'être vérifiés. Rien à dire sinon.
function decrireBase({ base, baseRetenue }: EtatCuisine, depuis: (instant: string) => string): string[] {
  if (base?.outcome !== "red") return baseRetenue === null ? [] : [ligne("base", direControleRetenu(baseRetenue, depuis))];
  return [
    ligne("base", `ROUGE depuis ${depuis(base.redSince ?? base.at)} sur ${base.sha.slice(0, 7)} — la station ne prend plus de ticket, les merges sous grant sont suspendus`),
    ...suiteDeBaseRouge(base, depuis, baseRetenue).map((suite) => ligne("", suite)),
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
      const retour = ticket.until === null ? "sans heure de retour" : reste(ticket.until) >= 0 ? `retour dans ${duree(reste(ticket.until))}` : "retour au prochain tick";
      return `depuis ${depuis(ticket.since)} (${ticket.reason}), ${retour}`;
    }
  }
}

// Un cook sur une ligne : son ticket, son calibrage, où il travaille, son
// budget consommé et, s'il tient un ticket, son temps sans progrès — celui du
// rail, que seul un worktree qui bouge remet à zéro.
function decrireCook(cook: EtatCuisine["cooks"][number], ticket: TicketRail | undefined, maintenant: Date, depuis: (instant: string) => string): string {
  const { limits, mesure, station } = cook;
  const consomme = mesure
    ? `${compte(mesure.turns, "tour")} sur ${nombre(limits.turns)} · ${compte(mesure.tokens, "token")} sur ${nombre(limits.tokens)} (relevé il y a ${depuis(mesure.at)})`
    : "tours et tokens : pas encore de relevé";
  const budget = [
    `${depuis(cook.launchedAt)} sur ${duree(limits.durationMs)}`,
    consomme,
    ...(ticket?.progressedAt ? [`sans progrès depuis ${depuis(ticket.progressedAt)}`] : []),
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
  // Un cook meurt avec son runtime, mais le journal ne le note qu'au
  // démarrage suivant : d'ici là son lancement reste sans fin.
  if (session?.endedAt !== null) return `${cooks.length} sans fin au journal — morts avec le runtime, notés à son prochain démarrage`;
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
  ];
}

// L'état, ligne par ligne. Les durées sont comptées jusqu'à `maintenant`.
export function decrireEtat(etat: EtatCuisine, maintenant: Date, ageMaxSauvegardeMs = AGE_MAX_SAUVEGARDE_MS): string[] {
  const depuis = (instant: string) => duree(maintenant.getTime() - Date.parse(instant));
  const decompte = ORDRE.map((nom) => [nom, etat.rail.filter((ticket) => etatLu(ticket) === nom).length] as const)
    .filter(([, combien]) => combien > 0)
    .map(([nom, combien]) => `${combien} ${nom}`);
  const cooks = trierCooks(etat, maintenant);
  const retenues = etat.stations.flatMap((station) =>
    station.heldReason === null ? [] : [`retenu par ${station.station} (${direRetenueDeStation(station.heldReason)})`],
  );
  return [
    ligne("projet", etat.projet ?? "inconnu — journal vide"),
    ...decrireRuntime(etat, depuis),
    decrireCuisine(etat, depuis),
    ...decrireConnexion(etat, depuis),
    ...decrireBase(etat, depuis),
    ...decrireGrants(etat, maintenant, depuis),
    decrireSauvegarde(etat, maintenant, ageMaxSauvegardeMs),
    "",
    // Avant le rail : « est-ce qu'on m'attend ? » se lit sans le parcourir.
    ...decrireAttentes(etat.attend, depuis),
    ligne("rail", decompte.length === 0 ? "vide" : decompte.join(" · ")),
    ...etat.rail.map((ticket) =>
      [
        `  #${ticket.ticket}`,
        etatLu(ticket),
        ticket.priority === null ? "-" : `prio:${ticket.priority}`,
        detail(ticket, maintenant, depuis, retenues),
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
    ...decrireWorktrees(etat, depuis),
    ...decrireConsommation(etat),
    // Absent quand rien n'est franchi : le bloc n'apparaît que pour être lu.
    ...(etat.derive.length === 0 ? [] : [ligne("dérive", `${etat.derive.map(direJauge).join(" · ")} — \`run mesures\``)]),
    ...decrireTranscripts(etat, depuis),
    "",
    "derniers événements",
    ...(etat.evenements.length === 0 ? ["  aucun"] : etat.evenements.map((evenement) => `  ${formaterEvenement(evenement)}`)),
  ];
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
