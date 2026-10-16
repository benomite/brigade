// Les stations distantes du projet, vues de la box : celles qui ne tournent
// pas sur la machine du runtime — le poste du chef. La box n'a aucun chemin
// vers elles, et n'en ouvre aucun : c'est la station qui vient, par le geste
// de la box (`run pull`, `tirer.ts`), écrire sa demande au journal ; ce module
// la lit au réveil du runtime et y répond de même. Rien ici ne lance un
// process, n'ouvre une connexion, ni ne connaît l'adresse de qui que ce soit.
//
// Quatre demandes : s'annoncer, réclamer un ticket, renouveler son bail, le
// rendre. Les règles sont celles d'un cook de la box, pas des règles à part :
//
// - le ticket qu'elle reçoit est le premier, dans l'ordre de service, dont
//   elle fournit tout ce que la fiche demande — jamais un autre ; et, sans
//   cloison sur son poste, un ticket qui demande une de ses capacités : un
//   ticket ordinaire ne lui revient que si le chef la déclare `ordinaires` et
//   que son poste a le bac à sable de Claude Code, où son cook est lancé
//   (`bac-a-sable/ordinaires.ts`) ;
// - les bornes d'une prise sont les mêmes : le « stop », le disjoncteur, la
//   base rouge, le quota, son plafond de cooks, les zones tenues ;
// - son cook se lance par les garde-fous (`lancerDistant`) : mêmes refus, mêmes
//   plafonds, même relevé au tick, même fin au journal ;
// - le bail ne se renouvelle que sur un progrès : l'empreinte de son worktree
//   a changé depuis la dernière. Sans cela il tombe, et le cook est arrêté ;
// - sa livraison est une branche sur l'origine, que le clone rapatrie de
//   là : elle part en pass comme une autre — mêmes gates, même reviewer.
//
// Elle ne reçoit rien de plus qu'un cook de la box : ni secret, ni jeton, ni
// grant. « Arrêter » son cook, ici, c'est ne plus rien accepter de lui : la
// station l'apprend à sa demande suivante.
//
// Une station distante qui ne s'est pas manifestée depuis le délai de présence
// est absente. Ce n'est pas une panne : les tickets qu'elle seule peut
// cuisiner sont 86 tant que ça dure (`station.ts`), les autres partent.
//
// Rien n'est gardé en mémoire que les cooks attendus, comme pour ceux de la
// box : un runtime qui redémarre les tient pour interrompus, et leur station
// l'apprend.
import type { RuntimeAvecRail } from "./alimenter.ts";
import { configurerLeCook, constater, dansLeBacASable, type Poste } from "./bac-a-sable/ordinaires.ts";
import type { ConfigDeBacASable } from "./bac-a-sable/configuration.ts";
import { complet, type Calibrage } from "./calibrage.ts";
import { argumentsClaude, consigne, type Lecture } from "./claude.ts";
import type { Depot } from "./depot.ts";
import type { Demande, Mission, Refus, Reponse } from "./evenements/distante.ts";
import type { Evenement } from "./evenements.ts";
import { IDENTIFIANTS_LIVRES, PART_SANS_PROGRES, SANS_DIFF, SANS_LIVRABLE, type FaitStation, type FinDeCook, type Retenue } from "./evenements/station.ts";
import { illisible, requises } from "./fiche.ts";
import { LancementRefuse, nomDeRun, type CookDistant, type FinDeCook as FinGardee, type GardeFous, type Verdict } from "./garde-fous.ts";
import { identifiantsLivres } from "./identifiants.ts";
import { lireLivrable } from "./livrable.ts";
import { consigneDeRenvoi, RENVOIS_MAX } from "./pass.ts";
import { lire } from "./plafonds.ts";
import { etatDesGardeFous } from "./projections/garde-fous.ts";
import { renvoiEnAttente } from "./projections/pass.ts";
import { ticketDuRail, type TicketRail } from "./projections/rail.ts";
import { etatStation } from "./projections/stations.ts";
import { GesteRefuse } from "./rail.ts";
import { DECLARATION_RESEAU, lireDeclaration, reglesDuProjet, type Regle } from "./reseau.ts";
import type { StationDeclaree } from "./stations-declarees.ts";

// Passé ce délai sans s'être manifestée, une station distante est absente.
export const PRESENCE_PAR_DEFAUT_MIN = 2;
const MINUTE = 60_000;
// Une demande à laquelle le runtime n'a pas répondu dans ce délai n'attend
// plus personne : y répondre prêterait un ticket à une station qui n'écoute
// plus. Le geste de la station attend un peu plus longtemps (`tirer.ts`).
export const DELAI_DE_REPONSE_MS = 20_000;
// Le curseur de celui qui lit les demandes dans le journal.
const CONSOMMATEUR = "distantes";
const AUTEUR = "runtime";
// Ce que la box garde du dernier message d'un cook distant.
const MESSAGE_MAX = 20_000;

// Lit le délai de présence dans l'environnement du runtime.
export function configPresence(env: Record<string, string | undefined>): number {
  return Math.round(lire(env, "BRIGADE_PRESENCE_MINUTES", PRESENCE_PAR_DEFAUT_MIN, "un nombre de minutes supérieur à zéro", (valeur) => valeur > 0 && valeur <= 24 * 60) * MINUTE);
}

// Ce que la station retient d'un cook entre le moment où elle juge sa fin et
// celui où elle la raconte (voir `station.ts`).
export type Conclusion = { fin: FinDeCook; raison: string | null; lecture: Lecture; sansCommit: boolean; recolte: string | null };

// Ce que les stations d'ici partagent avec celles qui tirent : les mêmes
// cuisines en cours, les mêmes bornes, les mêmes refus, la même fin racontée.
export type Cuisine = {
  runtime: RuntimeAvecRail & GardeFous;
  // Toutes les stations que le projet déclare : une demande faite au nom d'une
  // station d'ici est refusée en le disant.
  stations: StationDeclaree[];
  depot: Depot;
  // `<owner>/<repo>` et la branche d'intégration, pour la consigne du cook.
  depotGitHub: string;
  base: string;
  dureeBailMs: number;
  presenceMs: number;
  maintenant: () => Date;
  avertir: (message: string) => void;
  arrete: () => boolean;
  // Les tickets dont la cuisine n'est pas finie, avec leur zone, et la station
  // de chacun : celles d'ici et celles-ci s'y comptent ensemble.
  enCuisine: Map<number, string[]>;
  cuisinePar: Map<number, string>;
  // Ce qui retient cette station de prendre un ticket, lu à l'instant.
  retenue: (station: StationDeclaree) => Retenue | null;
  direCeQuiRetient: (station: string, retenue: Retenue | null) => void;
  // Un ticket non calibré, ou dont la fiche ne se lit pas, ne lance aucun cook.
  refuser: (station: string, ticket: TicketRail) => Promise<void>;
  refuserLaFiche: (station: string, ticket: TicketRail) => Promise<void>;
  // Le serveur d'une livraison précédente tient sa branche : il s'arrête.
  liberer: (ticket: number) => Promise<void>;
  // Raconte la fin d'un cook : au rail, au journal, puis sur le ticket.
  conclure: (station: string, ticket: TicketRail, calibrage: Calibrage, run: string, branche: string, fin: FinGardee, conclusion: Conclusion | null, reprise: { n: number; pr: string | null } | null) => Promise<void>;
  // Une cuisine est défaite, ou une station revient : le service repasse.
  servir: () => void;
  apresCook?: () => void;
};

export type Distantes = {
  // Lit les demandes arrivées au journal, et y répond.
  repondre(): void;
  // Regarde les baux des cooks en cours et la présence des stations.
  veiller(): void;
  // Les stations distantes absentes à cet instant.
  absentes(): string[];
  // Résolue quand plus aucune livraison n'est en cours de réception.
  repos(): Promise<void>;
};

type EnCours = {
  station: string;
  ticket: TicketRail;
  calibrage: Calibrage;
  lance: CookDistant;
  branche: string;
  reprise: { n: number; pr: string | null } | null;
  // La dernière empreinte que la station a montrée, et quand elle a changé.
  vue: string | null;
  progres: number;
  signale: boolean;
  // Sa livraison est en cours de réception : une seconde n'y entre pas.
  livre: boolean;
  // Ce que sa livraison en a fait, une fois reçue : c'est d'elle que sa fin se juge.
  rendu: { conclusion: Conclusion | null };
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const duree = (ms: number) =>
  ms >= MINUTE ? `${(ms / MINUTE).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} min` : `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
const compte = (valeur: unknown): valeur is number => Number.isSafeInteger(valeur) && (valeur as number) >= 0;
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const LECTURE_VIDE: Lecture = { resultat: null, message: null, quota: null, deconnecte: false, refus: null };

export function ouvrirDistantes(cuisine: Cuisine): Distantes {
  const { runtime, depot, maintenant, avertir, enCuisine, cuisinePar } = cuisine;
  const { journal, projet, rail } = runtime;
  const { base } = journal;
  // Relues à chaque usage : le chef peut changer les stations sans redémarrer.
  const distantes = () => cuisine.stations.filter((declaree) => declaree.distante);
  // Les cooks attendus, par run.
  const cooks = new Map<string, EnCours>();
  // Les livraisons en cours de réception.
  const receptions = new Set<Promise<void>>();
  // Le poste de chaque station dont le bac à sable est là, tel qu'elle l'a
  // dit à sa dernière demande : de quoi configurer celui de ses cooks.
  const postes = new Map<string, Poste>();

  const noter = (station: string, ticket: number | null, fait: FaitStation) => journal.ajouter({ project: projet, ticket, author: `station:${station}`, ...fait });

  const geste = (faire: () => void): boolean => {
    try {
      faire();
      return true;
    } catch (erreur) {
      if (erreur instanceof GesteRefuse) return false;
      throw erreur;
    }
  };

  // Une demande d'avant ce démarrage n'attend plus personne.
  journal.consommer(CONSOMMATEUR, () => {});

  // --- La présence. Elle se lit au journal : la dernière demande de la
  // station, et ce qui en a été dit.
  const presente = (station: string): boolean => etatStation(base, station)?.presentSince != null;
  // Rend vrai si la station vient de revenir.
  const manifester = (station: string): boolean => {
    if (presente(station)) return false;
    noter(station, null, { type: "station.present", payload: { station } });
    return true;
  };
  // Une station dite présente, et dont la dernière demande a plus que le délai
  // de présence, ne l'est plus : c'est écrit, une fois.
  const constaterLesAbsences = () => {
    const instant = maintenant().getTime();
    for (const { nom } of distantes()) {
      const etat = etatStation(base, nom);
      if (!etat?.presentSince) continue;
      const vue = etat.seenAt ?? etat.presentSince;
      if (instant - Date.parse(vue) < cuisine.presenceMs) continue;
      noter(nom, null, { type: "station.absent", payload: { station: nom, lastSeen: vue, presenceMs: cuisine.presenceMs } });
      // Absente, elle ne retient plus personne : ses tickets le disent eux-mêmes.
      cuisine.direCeQuiRetient(nom, null);
      avertir(`brigade : la station ${nom} ne s'est pas manifestée depuis ${duree(instant - Date.parse(vue))} — absente : les tickets qu'elle seule peut cuisiner attendent son retour, les autres partent`);
    }
  };
  // L'absence se constate en la lisant : le service n'attend pas le tick pour
  // écarter le ticket d'une station partie.
  const absentes = () => {
    constaterLesAbsences();
    return distantes().filter((declaree) => !presente(declaree.nom)).map((declaree) => declaree.nom);
  };

  // Ce qui a arrêté un cook, tel que le journal le garde : le garde-fou qui
  // l'a arrêté, sinon sa fin. Null : il tourne, ou n'a jamais existé.
  const arretDe = (run: string): string | null => {
    const connu = base.lire<{ reason: string | null; ending: string | null; trippedSeq: number | null; endedSeq: number | null }>(
      "SELECT reason, ending, tripped_seq AS trippedSeq, ended_seq AS endedSeq FROM cook_runs WHERE run = ?",
      run,
    )[0];
    if (!connu || (connu.trippedSeq === null && connu.endedSeq === null)) return null;
    return connu.reason ?? connu.ending ?? "stopped";
  };
  const ARRETS: Record<string, string> = {
    turns: "plafond de tours dépassé",
    tokens: "plafond de jetons dépassé",
    duration: "plafond de durée dépassé",
    idle: "plus rien de lui depuis le plafond d'inactivité",
    lease: "bail tombé, faute de progrès dans son worktree",
    stop: "arrêté — le « stop » du chef, ou son ticket a quitté ses mains",
    interrupted: "le runtime de la box a redémarré",
    ok: "il a déjà rendu sa livraison",
    failed: "il a déjà été rendu, sans livraison",
    guard: "arrêté par un garde-fou",
  };

  // La fin d'un cook distant, jugée pour les garde-fous : ce que sa livraison
  // en a fait, ou l'arrêt qui l'a précédée.
  const jugerPour = (rendu: EnCours["rendu"]) => (fin: { arret: { reason: string } | null }): Verdict => {
    rendu.conclusion ??= { fin: "failed", raison: fin.arret ? `guard:${fin.arret.reason}` : "échec", lecture: LECTURE_VIDE, sansCommit: true, recolte: null };
    const lu = rendu.conclusion.fin;
    return lu === "done" ? "ok" : lu === "failed" ? "failed" : "neutral";
  };

  // Raconte la fin d'un cook, puis défait sa cuisine.
  const finir = async (run: string, cook: EnCours) => {
    const numero = cook.ticket.ticket;
    let fin: FinGardee;
    try {
      fin = await cook.lance.fin;
    } finally {
      cooks.delete(run);
    }
    try {
      // Arrêté, le runtime ne raconte rien : le démarrage suivant s'en charge.
      if (cuisine.arrete()) return;
      await cuisine.conclure(cook.station, cook.ticket, cook.calibrage, run, cook.branche, fin, cook.rendu.conclusion, cook.reprise);
      cuisine.apresCook?.();
    } catch (erreur) {
      if (!cuisine.arrete()) avertir(`brigade : la station ${cook.station} a buté sur le ticket #${numero} — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
    } finally {
      enCuisine.delete(numero);
      cuisinePar.delete(numero);
      cuisine.servir();
    }
  };

  // --- Le bac à sable. La liste réseau du projet est celle que sa branche
  // d'intégration déclare, lue à chaque demande ; illisible, le socle seul.
  const hotesDuProjet = (): Regle[] => {
    let declaration: string | null = null;
    try {
      declaration = depot.lire(`origin/${cuisine.base}`, DECLARATION_RESEAU);
    } catch {
      declaration = null;
    }
    return reglesDuProjet(lireDeclaration(declaration ?? "").hotes);
  };
  // Ce que la station dit de son bac à sable, quand elle s'annonce ou réclame.
  // Une station qui ne prend pas les tickets ordinaires et n'en dit rien n'a
  // rien à en écrire ; celle qui les prend et n'en dit rien ne l'a pas. Écrit
  // au journal quand ça change, et dit au chef quand il devient indisponible.
  const entendreLeBacASable = (declaree: StationDeclaree, dit: unknown, hotes: Regle[]) => {
    const { nom } = declaree;
    if (dit === undefined && !declaree.ordinaires) {
      postes.delete(nom);
      return;
    }
    const constat = constater(dit, hotes);
    if (constat.disponible) postes.set(nom, constat.poste);
    else postes.delete(nom);
    const fait = { station: nom, available: constat.disponible, reason: constat.disponible ? null : constat.raison, version: constat.disponible ? constat.poste.version : null };
    const connu = etatStation(base, nom)?.sandbox ?? null;
    if (connu !== null && connu.available === fait.available && connu.reason === fait.reason && connu.version === fait.version) return;
    noter(nom, null, { type: "station.sandbox", payload: fait });
    if (!constat.disponible && declaree.ordinaires) avertir(`brigade : la station ${nom} ne prend aucun ticket ordinaire — bac à sable indisponible : ${constat.raison}`);
  };

  // --- Réclamer. Tout se lit à la demande : rien n'est réservé d'avance.

  const reclamer = (declaree: StationDeclaree, hotes: Regle[]): Extract<Reponse, { verb: "claim" }> => {
    const { nom } = declaree;
    // Un ticket ordinaire ne lui revient que si le chef le lui fait prendre et
    // que son poste a le bac à sable — ce qu'elle vient d'en dire.
    const poste = declaree.ordinaires ? (postes.get(nom) ?? null) : null;
    const rien = (retenue: Retenue | null): Extract<Reponse, { verb: "claim" }> => {
      cuisine.direCeQuiRetient(nom, retenue);
      return { ok: true, verb: "claim", mission: null, held: retenue };
    };
    // Borné : chaque tour écarte un ticket du rail, ou rend.
    for (let essais = 0; essais < 50; essais++) {
      const retenue = cuisine.retenue(declaree);
      if (retenue !== null) return rien(retenue);
      const ticket = rail.prendre([{ station: nom, fournit: declaree.fournit, ordinaires: poste !== null }], enCuisine);
      if (!ticket) return rien(null);
      const numero = ticket.ticket;
      // Les deux refus d'une station d'ici : le ticket est 86, son issue le dit.
      if (!complet(ticket)) {
        void cuisine.refuser(nom, ticket);
        continue;
      }
      if (illisible(ticket.card) !== null) {
        void cuisine.refuserLaFiche(nom, ticket);
        continue;
      }
      const calibrage: Calibrage = { model: ticket.model, effort: ticket.effort };
      const run = nomDeRun(numero);
      // Un ticket ordinaire cuit dans le bac à sable de son poste, jamais à nu.
      let bacASable: ConfigDeBacASable | null = null;
      if (requises(ticket.card).length === 0) {
        if (poste === null) throw new Error(`ticket ordinaire #${numero} prêté à ${nom} sans bac à sable : aucun cook n'est lancé`);
        bacASable = configurerLeCook(poste, run, hotes);
      }
      // Un ticket que la pass a renvoyé se reprend sur la branche de sa
      // livraison : elle est sur l'origine, c'est de là que la station la tire.
      const renvoi = renvoiEnAttente(base, numero);
      let repris: typeof renvoi = null;
      try {
        repris = renvoi !== null && depot.connait(renvoi.branch) ? renvoi : null;
      } catch (erreur) {
        avertir(`brigade : branche du renvoi du ticket #${numero} illisible, le cook de ${nom} repart de la base — ${message(erreur)}`);
      }
      const branche = repris ? repris.branch : `cook/${run}`;
      const rendu: EnCours["rendu"] = { conclusion: null };
      enCuisine.set(numero, ticket.card?.zone ?? []);
      cuisinePar.set(numero, nom);
      let lance: CookDistant;
      try {
        lance = runtime.lancerDistant({
          ticket: numero,
          run,
          contexte: {
            station: nom,
            ...calibrage,
            branch: branche,
            remote: true,
            ...(bacASable !== null ? { sandbox: true } : {}),
            // Passé les renvois de la pass, c'est une relance du manager : sa
            // livraison ne vaudra réussite que jugée verte.
            ...(renvoi !== null && renvoi.returns > RENVOIS_MAX ? { relaunch: true } : {}),
          },
          juger: jugerPour(rendu),
        });
      } catch (erreur) {
        enCuisine.delete(numero);
        cuisinePar.delete(numero);
        if (!(erreur instanceof LancementRefuse)) throw erreur;
        // « stop » ou disjoncteur, arrivés entre le prêt et le lancement.
        geste(() => rail.rendre(numero, `launch-refused:${erreur.motif}`, nom));
        return rien(erreur.motif);
      }
      const cook: EnCours = { station: nom, ticket, calibrage, lance, branche, reprise: repris && { n: repris.returns, pr: repris.pr }, vue: null, progres: maintenant().getTime(), signale: false, livre: false, rendu };
      cooks.set(run, cook);
      void cuisine.liberer(numero);
      void finir(run, cook);
      const mission = { ticket: numero, titre: ticket.title, depot: cuisine.depotGitHub, base: cuisine.base };
      const prompt = repris ? consigneDeRenvoi({ ...mission, branche, n: repris.returns, findings: repris.findings }) : consigne(mission);
      const limits = etatDesGardeFous(base).limits;
      if (limits === null) throw new Error("garde-fous sans plafonds au journal : aucun cook distant ne part sans eux");
      const remise: Mission = {
        ticket: numero,
        title: ticket.title,
        run,
        branch: branche,
        base: cuisine.base,
        repository: cuisine.depotGitHub,
        ...calibrage,
        prompt,
        args: bacASable === null ? argumentsClaude(prompt, calibrage) : dansLeBacASable(argumentsClaude(prompt, calibrage), bacASable),
        ...(bacASable !== null ? { sandbox: true as const } : {}),
        limits,
        leaseMs: cuisine.dureeBailMs,
        leaseUntil: ticket.leaseUntil ?? new Date(maintenant().getTime() + cuisine.dureeBailMs).toISOString(),
        resumes: repris && { returns: repris.returns, pr: repris.pr },
      };
      // Elle vient de prendre : plus rien ne la retenait.
      cuisine.direCeQuiRetient(nom, null);
      return { ok: true, verb: "claim", mission: remise, held: null };
    }
    return rien(null);
  };

  type Refuser = (refusal: Refus, said: string, plus?: { stop?: string | null; leaseUntil?: string | null }) => Reponse;

  // Le cook de ce run, s'il tourne encore pour cette station. Sinon, le refus
  // qui dit pourquoi — et à la station d'arrêter le sien.
  const cookDe = (station: string, run: string, refuser: Refuser): EnCours | Reponse => {
    const cook = cooks.get(run);
    const arret = arretDe(run);
    if (cook && cook.station === station && arret === null) {
      // Le ticket a échappé à la station (retiré du rail, rendu par le chef) :
      // son cook n'a plus de raison de tourner.
      const tenu = ticketDuRail(base, cook.ticket.ticket);
      if (tenu?.state === "taken" && tenu.station === station) return cook;
      cook.lance.arreter();
      return refuser("stopped", `le ticket #${cook.ticket.ticket} n'est plus tenu par ${station} : son cook est arrêté, arrête le tien`, { stop: "stop" });
    }
    if (arret !== null && (!cook || cook.station === station)) {
      return refuser("stopped", `le cook ${run} est arrêté côté box (${ARRETS[arret] ?? arret}) : arrête le tien — rien de ce qu'il livrerait n'est plus reçu`, { stop: arret });
    }
    return refuser("unknown-run", `la box ne connaît aucun cook ${run} de ${station}`);
  };

  // --- Renouveler. Le bail ne se renouvelle que sur un progrès observable :
  // l'empreinte du worktree a changé depuis la dernière. Ni la présence de la
  // station ni ce que son cook consomme ne comptent — c'est l'affaire des
  // plafonds, qui se lisent sur la mesure.
  const renouveler = (station: string, demande: Extract<Demande, { verb: "renew" }>, refuser: Refuser): Reponse => {
    const cook = cookDe(station, demande.run, refuser);
    if ("ok" in cook) return cook;
    const numero = cook.ticket.ticket;
    cook.lance.mesurer({ turns: demande.turns, tokens: demande.tokens });
    const depasse = arretDe(demande.run);
    if (depasse !== null) return refuser("stopped", `le cook ${demande.run} est arrêté côté box (${ARRETS[depasse] ?? depasse}) : arrête le tien`, { stop: depasse });
    const echeance = () => ticketDuRail(base, numero)?.leaseUntil ?? null;
    if (!texte(demande.proof)) {
      return refuser("no-progress", "renouvellement sans preuve : le bail ne se renouvelle que sur un progrès observable — l'empreinte du worktree du cook", { leaseUntil: echeance() });
    }
    if (demande.proof === cook.vue) {
      return refuser("no-progress", "l'empreinte du worktree n'a pas changé depuis le dernier renouvellement : le bail n'est pas renouvelé", { leaseUntil: echeance() });
    }
    if (!geste(() => rail.renouveler(numero, station))) {
      cook.lance.arreter();
      return refuser("stopped", `le ticket #${numero} n'est plus tenu par ${station} : son cook est arrêté, arrête le tien`, { stop: "stop" });
    }
    cook.vue = demande.proof;
    cook.progres = maintenant().getTime();
    cook.signale = false;
    return { ok: true, verb: "renew", leaseUntil: echeance() ?? "" };
  };

  // --- Rendre. La livraison d'un cook distant est la branche que sa station a
  // poussée sur l'origine : le clone la rapatrie de là, et elle part en pass
  // comme celle d'un cook de la box. Sans commit, ce qu'il a délimité dans son
  // dernier message est son livrable ; sans rien de délimité, il n'a rien livré.
  const recevoir = async (cook: EnCours, demande: Extract<Demande, { verb: "deliver" }>): Promise<Conclusion> => {
    const lecture: Lecture = { ...LECTURE_VIDE, message: demande.message?.slice(0, MESSAGE_MAX) ?? null };
    const echec = (raison: string): Conclusion => ({ fin: "failed", raison, lecture, sansCommit: true, recolte: null });
    if (demande.ending === "failed") return echec(demande.reason?.slice(0, 200) || "échec");
    try {
      await depot.recevoir(cook.branche);
      const commits = depot.commits(cook.branche);
      if (commits === 0) {
        if (lireLivrable(lecture.message).texte !== null) return { fin: "done", raison: SANS_DIFF, lecture, sansCommit: true, recolte: null };
        return echec(lecture.message?.trim() ? SANS_LIVRABLE : "no-commit");
      }
      // Les identifiants de Claude ne partent pas en pass, d'où qu'ils viennent.
      const signes = identifiantsLivres(depot.diff(cook.branche));
      if (signes.length > 0) return { ...echec(`${IDENTIFIANTS_LIVRES}: ${signes.join(", ")}`), sansCommit: false };
      return { fin: "done", raison: null, lecture, sansCommit: false, recolte: null };
    } catch (erreur) {
      return echec(`fetch-failed: ${message(erreur)}`);
    }
  };
  const rendre = async (station: string, demande: Extract<Demande, { verb: "deliver" }>, refuser: Refuser): Promise<Reponse> => {
    const cook = cookDe(station, demande.run, refuser);
    if ("ok" in cook) return cook;
    if (cook.livre) return refuser("invalid", `la livraison du cook ${demande.run} est déjà en cours de réception`);
    cook.lance.mesurer({ turns: demande.turns, tokens: demande.tokens });
    const depasse = arretDe(demande.run);
    if (depasse !== null) return refuser("stopped", `le cook ${demande.run} est arrêté côté box (${ARRETS[depasse] ?? depasse}) : sa livraison n'est pas reçue`, { stop: depasse });
    cook.livre = true;
    const conclusion = await recevoir(cook, demande);
    // Un garde-fou a pu l'arrêter pendant la réception : c'est lui qui prime.
    const arret = arretDe(demande.run);
    if (arret !== null) return refuser("stopped", `le cook ${demande.run} a été arrêté côté box pendant la réception de sa livraison (${ARRETS[arret] ?? arret})`, { stop: arret });
    cook.rendu.conclusion = conclusion;
    cook.lance.rendre(conclusion.fin === "done" ? 0 : 1);
    return { ok: true, verb: "deliver", ending: conclusion.fin, reason: conclusion.raison };
  };

  // --- Les demandes. Chacune reçoit sa réponse, écrite au journal : c'est là
  // que le geste de la station la lit.
  const traiter = (evenement: Extract<Evenement, { type: "remote.asked" }>) => {
    const { id, station } = evenement.payload;
    const demande = evenement.payload as { id: string; station: string } & Demande;
    if (!texte(id) || !texte(station)) return;
    const ticketDe = (run: unknown) => (texte(run) ? (cooks.get(run)?.ticket.ticket ?? null) : null);
    const ecrire = (reponse: Reponse, ticket: number | null = null) => {
      journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "remote.answered", payload: { id, station, ...reponse } });
    };
    const verb = demande.verb;
    const refuser: Refuser = (refusal, said, plus = {}) => ({ ok: false, verb, refusal, said, ...plus });
    const declaree = cuisine.stations.find((connue) => connue.nom === station);
    const inconnue = () => ecrire(refuser("unknown-station", `le projet ne déclare aucune station ${station} : seule une station déclarée \`distante\` dans BRIGADE_STATIONS tire son travail`));
    // Retirée par le chef pendant qu'un de ses cooks tourne, elle laisse ce
    // cook finir comme il aurait fini : il renouvelle et livre. Elle ne
    // s'annonce plus et ne prend plus rien.
    const enVol = (verb === "renew" || verb === "deliver") && [...cooks.values()].some((cook) => cook.station === station);
    if (!declaree && !enVol) return inconnue();
    if (declaree && !declaree.distante) return ecrire(refuser("not-remote", `${station} tourne sur la box : elle prend ses tickets elle-même, rien ne se tire en son nom`));
    if (maintenant().getTime() - Date.parse(evenement.at) > DELAI_DE_REPONSE_MS) return ecrire(refuser("late", "demande lue trop tard : plus personne ne l'attend, rien n'est fait — à refaire"));
    if (declaree && manifester(station)) cuisine.servir();
    switch (verb) {
      case "announce": {
        if (!declaree) return inconnue();
        entendreLeBacASable(declaree, demande.sandbox, hotesDuProjet());
        const limits = etatDesGardeFous(base).limits;
        if (limits === null) return ecrire(refuser("invalid", "garde-fous sans plafonds au journal"));
        return ecrire({ ok: true, verb, provides: declaree.fournit, maxCooks: declaree.cooks, presenceMs: cuisine.presenceMs, leaseMs: cuisine.dureeBailMs, limits });
      }
      case "claim": {
        if (!declaree) return inconnue();
        const hotes = hotesDuProjet();
        entendreLeBacASable(declaree, demande.sandbox, hotes);
        const reponse = reclamer(declaree, hotes);
        return ecrire(reponse, reponse.mission?.ticket ?? null);
      }
      case "renew": {
        if (!texte(demande.run) || !compte(demande.turns) || !compte(demande.tokens)) return ecrire(refuser("invalid", "renouvellement illisible : il faut le run, et ce que le cook a consommé (tours, jetons)"));
        const ticket = ticketDe(demande.run);
        return ecrire(renouveler(station, demande, refuser), ticket);
      }
      case "deliver": {
        if (!texte(demande.run) || !compte(demande.turns) || !compte(demande.tokens) || !["delivered", "failed"].includes(demande.ending)) {
          return ecrire(refuser("invalid", "livraison illisible : il faut le run, sa fin (`delivered` ou `failed`), et ce que le cook a consommé (tours, jetons)"));
        }
        const ticket = ticketDe(demande.run);
        const reception = rendre(station, demande, refuser)
          .then((reponse) => {
            if (!cuisine.arrete()) ecrire(reponse, ticket);
          })
          .catch((erreur) => {
            if (!cuisine.arrete()) avertir(`brigade : livraison du cook ${demande.run} de ${station} non reçue — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
          })
          .finally(() => receptions.delete(reception));
        receptions.add(reception);
        return;
      }
      default:
        return ecrire(refuser("invalid", `demande inconnue : « ${String(verb)} »`));
    }
  };

  return {
    absentes,
    repos: async () => void (await Promise.all([...receptions])),
    repondre() {
      if (cuisine.arrete()) return;
      const demandes: Array<Extract<Evenement, { type: "remote.asked" }>> = [];
      journal.consommer(CONSOMMATEUR, (evenement) => {
        if (evenement.type === "remote.asked") demandes.push(evenement);
      });
      for (const demande of demandes) {
        try {
          traiter(demande);
        } catch (erreur) {
          // Ce qui bute sur une demande n'emporte ni le runtime ni les autres.
          avertir(`brigade : demande d'une station distante non servie — ${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}`);
        }
      }
    },
    veiller() {
      if (cuisine.arrete()) return;
      const instant = maintenant().getTime();
      for (const [run, cook] of cooks) {
        const numero = cook.ticket.ticket;
        if (arretDe(run) !== null) continue;
        const tenu = ticketDuRail(base, numero);
        if (tenu?.state !== "taken" || tenu.station !== cook.station) {
          cook.lance.arreter();
          continue;
        }
        // Une livraison en cours de réception n'est pas un cook qui coince.
        if (cook.livre) continue;
        const echu = tenu.leaseUntil !== null && instant >= Date.parse(tenu.leaseUntil);
        if (echu) {
          cook.lance.arreter({ reason: "lease", limit: cuisine.dureeBailMs, observed: instant - cook.progres });
        } else if (!cook.signale && instant - cook.progres >= cuisine.dureeBailMs * PART_SANS_PROGRES) {
          cook.signale = true;
          noter(cook.station, numero, { type: "cook.stalled", payload: { run, station: cook.station, idleMs: instant - cook.progres, leaseMs: cuisine.dureeBailMs } });
          avertir(`brigade : le cook ${run} du ticket #${numero} coince chez ${cook.station} — aucun progrès montré depuis ${duree(instant - cook.progres)}, son bail tombe à ${duree(cuisine.dureeBailMs)}`);
        }
      }
      constaterLesAbsences();
    },
  };
}
