// L'état de la cuisine tel que le chef le lit : le runtime et son dernier tick,
// le rail, les cooks en cours et ce qu'ils ont consommé, les derniers
// événements. Tout vient du journal et de ses projections — rien n'est calculé
// ni gardé ailleurs, et rien n'est écrit.
import type { Evenement } from "./evenements.ts";
import { RELEVE } from "./evenements/garde-fous.ts";
import { BATTEMENT } from "./evenements/runtime.ts";
import type { Journal } from "./journal.ts";
import { formaterEvenement } from "./ligne-evenement.ts";
import {
  cooksEnCours,
  etatDesGardeFous,
  mesuresDesCooksEnCours,
  type CookEnCours,
  type EtatGardeFous,
  type Mesure,
} from "./projections/garde-fous.ts";
import { lireRail, type Etat as EtatTicket, type TicketRail } from "./projections/rail.ts";
import { dernierTick, derniereSession, type SessionPassee, type Tick } from "./projections/sessions.ts";
import { BLOQUE, direRetenue, etatLu, nomEtat } from "./rail.ts";

const EVENEMENTS_MONTRES = 15;
// La cadence à laquelle le suivi regarde si le journal a changé : une lecture
// de `PRAGMA data_version`, qui ne coûte rien à l'écrivain.
const VEILLE_MS = 250;
// Ce que l'en-tête et la ligne de chaque cook résument déjà : un par minute,
// ils noieraient les autres événements.
const RESUMES = [BATTEMENT, RELEVE];
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
  rail: TicketRail[];
  cooks: Array<CookEnCours & { mesure: Mesure | null }>;
  evenements: Evenement[];
};

export function lireEtat(journal: Journal): EtatCuisine {
  const { base } = journal;
  // Lu en premier : ce qui s'écrit pendant la lecture sera repris par le
  // suivi, au pire montré deux fois, jamais manqué.
  const dernierSeq = journal.dernierSeq();
  const session = derniereSession(base);
  const tick = dernierTick(base);
  const mesures = new Map(mesuresDesCooksEnCours(base).map((mesure) => [mesure.run, mesure]));
  return {
    dernierSeq,
    projet: base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null,
    session,
    tick: session && session.endedAt === null && tick && tick.seq > session.startedSeq ? tick : null,
    gardeFous: etatDesGardeFous(base),
    rail: lireRail(base),
    cooks: cooksEnCours(base).map((cook) => ({ ...cook, mesure: mesures.get(cook.run) ?? null })),
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

// Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à quand.
function detail(ticket: TicketRail, maintenant: Date, depuis: (instant: string) => string): string {
  const reste = (instant: string) => Date.parse(instant) - maintenant.getTime();
  switch (ticket.state) {
    case "waiting":
      return [...[direRetenue(ticket) ?? []].flat(), `depuis ${depuis(ticket.since)}`].join(" — ");
    case "taken": {
      const bail = ticket.leaseUntil === null ? 0 : reste(ticket.leaseUntil);
      // Des deux durées d'un ticket pris, seule la seconde révèle un blocage.
      // Elle se lit dans le rail : personne ne regarde un worktree pour l'avoir.
      const progres = ticket.progressedAt === null ? [] : [`sans progrès depuis ${depuis(ticket.progressedAt)}`];
      // Le bail est le plafond du temps sans progrès : échu et encore tenu, le
      // ticket coince.
      const coince = bail < 0 ? "COINCE : " : "";
      return `par ${ticket.station} depuis ${depuis(ticket.since)}, ${coince}${[...progres, bail >= 0 ? `bail encore ${duree(bail)}` : `bail échu depuis ${duree(-bail)}`].join(", ")}`;
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

function decrireCook(cook: EtatCuisine["cooks"][number], depuis: (instant: string) => string): string {
  const { limits, mesure } = cook;
  const consomme = mesure
    ? `${compte(mesure.turns, "tour")} sur ${nombre(limits.turns)} · ${compte(mesure.tokens, "token")} sur ${nombre(limits.tokens)} (relevé il y a ${depuis(mesure.at)})`
    : "tours et tokens : pas encore de relevé";
  // Sans ticket : un jugement du manager.
  return `  ${cook.ticket === null ? "manager" : `#${cook.ticket}`}  ${cook.run}  ${depuis(cook.launchedAt)} sur ${duree(limits.durationMs)} · ${consomme}`;
}

function decrireCooks({ cooks, session }: EtatCuisine): string {
  if (cooks.length === 0) return "aucun en cours";
  // Un cook meurt avec son runtime, mais le journal ne le note qu'au
  // démarrage suivant : d'ici là son lancement reste sans fin.
  if (session?.endedAt !== null) return `${cooks.length} sans fin au journal — morts avec le runtime, notés à son prochain démarrage`;
  return `${cooks.length} en cours`;
}

// L'état, ligne par ligne. Les durées sont comptées jusqu'à `maintenant`.
export function decrireEtat(etat: EtatCuisine, maintenant: Date): string[] {
  const depuis = (instant: string) => duree(maintenant.getTime() - Date.parse(instant));
  const decompte = ORDRE.map((nom) => [nom, etat.rail.filter((ticket) => etatLu(ticket) === nom).length] as const)
    .filter(([, combien]) => combien > 0)
    .map(([nom, combien]) => `${combien} ${nom}`);
  return [
    ligne("projet", etat.projet ?? "inconnu — journal vide"),
    ...decrireRuntime(etat, depuis),
    decrireCuisine(etat, depuis),
    "",
    ligne("rail", decompte.length === 0 ? "vide" : decompte.join(" · ")),
    ...etat.rail.map((ticket) =>
      [
        `  #${ticket.ticket}`,
        etatLu(ticket),
        ticket.priority === null ? "-" : `prio:${ticket.priority}`,
        detail(ticket, maintenant, depuis),
        ticket.title,
      ].join("  "),
    ),
    "",
    ligne("cooks", decrireCooks(etat)),
    ...etat.cooks.map((cook) => decrireCook(cook, depuis)),
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
