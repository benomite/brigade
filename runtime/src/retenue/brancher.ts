// La retenue branchée sur la boucle du runtime : à chaque réveil — un fait
// écrit au journal, le tick —, ce que la cuisine observe passe au détecteur
// (retenue.ts), et ses transitions s'écrivent au journal (evenements.ts) :
// `kitchen.held` quand elle commence, ou que sa cause change ;
// `kitchen.hold-lifted` quand elle est levée. Jamais à chaque passe : une
// retenue qui dure ne s'écrit qu'une fois, et la file du chef n'en a qu'une
// ligne (lire.ts), qui tombe quand la cuisine sert de nouveau.
//
// Ce qui est observé dépend du chemin du projet :
// - l'ancien chemin lit son rail au journal : attendent les tickets en attente
//   que rien ne retient sur le rail, et ceux en pass — pas ceux dont une
//   entrée de la file du chef dit qu'ils attendent sa décision ;
// - sur l'état GitHub seul, le journal ne tient plus le rail : c'est le tour
//   qui lit les tickets, et la retenue lit ce qu'il a vu (tour.ts).
// Ce qui peut la retenir se lit au journal (le disjoncteur, la base rouge de
// l'ancien chemin), au tour (les checks rouges de la base) et au compteur des
// appels de la station (la limite de GitHub, le budget des écritures) — celui
// d'aucune station sur le poste de dev : ces deux-là n'y sont pas lus.
import { suivreLesChecksWindows } from "../carte-ci-windows.ts";
import { attentesDuChef } from "../attend.ts";
import type { Base } from "../base.ts";
import { limiteDuCompteDeLaStation } from "../github-limite.ts";
import type { Journal } from "../journal.ts";
import { ecrituresRetenuesDeLaStation, pauseDeLaStation, retenueDeLaStation } from "../limite-github.ts";
import { etatDesGardeFous } from "../projections/guardrails.ts";
import { etatDeLaBase, gatesDuRouge } from "../projections/pass.ts";
import { lireRail } from "../projections/rail.ts";
import { sessionEnCours } from "../projections/sessions.ts";
import { etatDeLInterrupteur } from "../projections/switch.ts";
import { echecsDesGates } from "../reparation.ts";
import type { Runtime } from "../runtime.ts";
import type { FaitRetenue } from "./evenements.ts";
import { retenueEnCours } from "./lire.ts";
import { relanceDeLaRetenue, type PorteDeLaRelance } from "./relance-base.ts";
import { cleDeCause, detecterRetenue, diagnostiquer, direCause, SANS_SIGNAL, type Observation, type Retenue, type Signaux } from "./retenue.ts";
import type { SuiviDuTour } from "./tour.ts";

// Une transition de la retenue, telle qu'elle vient de s'écrire.
export type Transition =
  | { type: "started" | "changed"; retenue: Retenue }
  | { type: "lifted"; since: string; reason: Extract<FaitRetenue, { type: "kitchen.hold-lifted" }>["payload"]["reason"] };

// Le chef a arrêté la cuisine, ou éteint le projet : elle n'a pas à servir.
export function eteinteAuJournal(base: Base): boolean {
  return etatDesGardeFous(base).stoppedAt !== null || etatDeLInterrupteur(base)?.on === false;
}

const plusAncien = (instants: string[]): string | null => [...instants].sort()[0] ?? null;
const plusRecent = (instants: Array<string | null | undefined>): string | null =>
  instants.filter((instant): instant is string => typeof instant === "string").sort().at(-1) ?? null;

// Ce que l'ancien chemin observe, à son journal.
export function observationDuJournal(base: Base, maintenant: Date): Observation {
  const rail = lireRail(base);
  const attendentLeChef = new Set(attentesDuChef(base, rail, maintenant).flatMap(({ ticket }) => (ticket === null ? [] : [ticket])));
  const enAttente = rail.filter(
    ({ ticket, state, awaits, waitingFor }) => !attendentLeChef.has(ticket) && (state === "pass" || (state === "waiting" && awaits.length === 0 && waitingFor === null)),
  );
  const [servi] = base.lire<{ at: string | null }>("SELECT max(at) AS at FROM events WHERE type = 'ticket.served'");
  const interrupteur = etatDeLInterrupteur(base);
  return {
    eteinte: eteinteAuJournal(base),
    enAttente: enAttente.map(({ ticket }) => ticket),
    attenteDepuis: plusAncien(enAttente.map(({ since }) => since)),
    dernierService: servi?.at ?? null,
    // L'ouverture : le démarrage du runtime, ou le projet rallumé depuis.
    ouverture: plusRecent([sessionEnCours(base)?.startedAt, interrupteur?.on === true ? interrupteur.since : null]),
  };
}

// Ce que le journal dit de ce qui peut retenir la cuisine : le disjoncteur, et
// la base rouge que la pass y a constatée, avec ce que ses gates nomment.
export function signauxDuJournal(base: Base): Pick<Signaux, "disjoncteur" | "baseRouge"> {
  const controle = etatDeLaBase(base);
  const gates = controle?.outcome === "red" ? gatesDuRouge(base) : null;
  return {
    disjoncteur: etatDesGardeFous(base).breakerOpenedAt,
    baseRouge: controle?.outcome === "red" ? { sha: controle.sha, checks: gates === null ? [] : echecsDesGates(gates) } : null,
  };
}

// Ce que le compteur des appels de la station dont `racine` est le répertoire
// dit de ce qui retient la cuisine : la limite que GitHub a posée — son refus
// constaté, ou sa pause —, à défaut la réserve des gestes que la box garde ; et
// le budget des écritures. Lu sans rien écrire ni rien créer.
export function signauxDeLaStation(racine: string | undefined, maintenant: Date): Pick<Signaux, "limiteGitHub" | "ecritures"> {
  const instant = maintenant.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const limite = limiteDuCompteDeLaStation(racine);
  const pause = pauseDeLaStation(racine, instant);
  const reserve = retenueDeLaStation(racine, instant);
  const ecritures = ecrituresRetenuesDeLaStation(racine, instant);
  return {
    limiteGitHub:
      limite !== null && Date.parse(limite.backAt) > instant
        ? { limit: limite.limit, backAt: limite.backAt }
        : pause !== null
          ? { limit: null, backAt: iso(pause) }
          : reserve !== null
            ? { limit: "reserve", backAt: iso(reserve) }
            : null,
    ecritures: ecritures === null ? null : { writes: ecritures.ecrites, nextAt: iso(ecritures.reprise) },
  };
}

// Une passe : écrit au journal la transition due, s'il y en a une, et la rend.
// `retenue` : ce que le détecteur voit à l'instant ; `observation` : ce qu'il
// a lu, qui dit pourquoi une retenue est levée.
export function annoncerRetenue(journal: Journal, projet: string, retenue: Retenue | null, observation: Observation): Transition | null {
  const courante = retenueEnCours(journal.base);
  const ecrire = (fait: FaitRetenue) => journal.ajouter({ project: projet, ticket: null, author: "runtime", ...fait });
  if (retenue === null) {
    if (courante === null) return null;
    const reason = observation.eteinte ? "stopped" : observation.enAttente.length === 0 ? "nothing-waits" : "served";
    ecrire({ type: "kitchen.hold-lifted", payload: { since: courante.since, reason } });
    return { type: "lifted", since: courante.since, reason };
  }
  if (courante !== null && cleDeCause(courante.cause) === cleDeCause(retenue.cause)) return null;
  // Une cause qui change garde le début de la retenue.
  const tenue = courante === null ? retenue : { ...retenue, since: courante.since };
  ecrire({ type: "kitchen.held", payload: { since: tenue.since, tickets: tenue.tickets, cause: tenue.cause, gesture: tenue.gesture, change: courante !== null } });
  return { type: courante === null ? "started" : "changed", retenue: tenue };
}

export type OptionsRetenue = {
  // Le répertoire de la station, où se lit son compteur des appels à GitHub.
  station?: string;
  // Le tour GitHub seul, quand le projet est servi ainsi : c'est lui qui est
  // observé, pas le rail du journal.
  tour?: SuiviDuTour | null;
  // La porte entre le diagnostic et l'annonce : une base rouge relance ses jobs
  // en échec avant d'alerter (relance-base.ts). Par défaut, celle du tour
  // GitHub seul, s'il y en a un ; sans tour, aucune relance.
  relance?: PorteDeLaRelance | null;
  // La branche d'intégration, que lisent les checks Windows de la base (#2413) ; `main` par défaut.
  branche?: string;
  maintenant?: () => Date;
  // Une ligne du journal de service.
  dire?: (ligne: string) => void;
  // Pour les autres modules : chaque transition, une fois écrite.
  surTransition?: (transition: Transition) => void;
};

// Ce qu'une passe observe et lit, à `maintenant`.
export function lireLaCuisine(base: Base, maintenant: Date, options: Pick<OptionsRetenue, "station" | "tour">): { observation: Observation; signaux: () => Signaux } {
  const vue = options.tour?.vue() ?? null;
  const observation: Observation =
    vue === null
      ? observationDuJournal(base, maintenant)
      : { eteinte: eteinteAuJournal(base), enAttente: vue.enAttente, attenteDepuis: vue.attenteDepuis, dernierService: vue.dernierService, ouverture: vue.ouverture };
  const signaux = (): Signaux => {
    const duJournal = signauxDuJournal(base);
    const baseRouge = vue === null ? duJournal.baseRouge : vue.checksRouges !== null && vue.checksRouges.length > 0 ? { sha: null, checks: vue.checksRouges } : null;
    return { ...duJournal, baseRouge, ...signauxDeLaStation(options.station, maintenant) };
  };
  return { observation, signaux };
}

// Branche la retenue au runtime : une passe d'emblée, puis à chaque réveil.
export function brancherRetenue<R extends Runtime>(runtime: R, options: OptionsRetenue = {}): R {
  const maintenant = options.maintenant ?? (() => new Date());
  const dire = options.dire ?? ((ligne: string) => console.error(`brigade : ${ligne}`));
  const lancer = (): PorteDeLaRelance | null => {
    const tour = options.tour;
    if (options.relance !== undefined) return options.relance;
    if (!tour) return null;
    const client = () => {
      const github = tour.client();
      if (github === null) throw new Error("the GitHub turn is not open yet");
      return github;
    };
    return relanceDeLaRetenue(
      { checksDeLaBase: () => client().checksDeLaBase(), etatDuRun: (run) => client().etatDuRun(run), relancerLesEchecs: (run) => client().relancerLesEchecs(run) },
      { avertir: dire, surFin: () => passer() },
    );
  };
  const porte = lancer();
  const passer = () => {
    try {
      const instant = maintenant();
      // Un check Windows rouge sur la base a sa carte dans TODO, une seule ; vert, elle en sort (#2413).
      const checks = options.tour?.vue().checks ?? null;
      if (checks !== null) suivreLesChecksWindows(runtime.journal, runtime.projet, options.branche ?? "main", checks);
      const { observation, signaux } = lireLaCuisine(runtime.journal.base, instant, options);
      // Les signaux ne se lisent que pour une retenue : le compteur de la
      // station n'est pas ouvert à chaque fait écrit au journal.
      const candidate = detecterRetenue(observation, SANS_SIGNAL, instant);
      const diagnostiquee = candidate === null ? null : { ...candidate, ...diagnostiquer(signaux()) };
      // Une base rouge se relance d'abord : rien ne s'annonce avant le verdict.
      const retenue = porte === null ? diagnostiquee : porte.filtrer(diagnostiquee);
      const transition = annoncerRetenue(runtime.journal, runtime.projet, retenue, observation);
      if (transition === null) return;
      dire(
        transition.type === "lifted"
          ? `kitchen no longer held (${transition.reason})`
          : `kitchen held — nothing served while ${transition.retenue.tickets.length} ticket(s) wait — ${direCause(transition.retenue.cause)}`,
      );
      options.surTransition?.(transition);
    } catch (erreur) {
      console.error(`brigade : retenue de la cuisine non évaluée — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  passer();
  runtime.surReveil(passer);
  return runtime;
}
