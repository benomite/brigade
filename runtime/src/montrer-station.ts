// La station vue et réglée par le chef, depuis son propre process :
//   npm --prefix runtime run station                 ce qu'elle fournit, ce qui l'empêche de servir, et ses cooks —
//                                                    chacun avec son calibrage et ce qu'il a consommé —, les serveurs
//                                                    qu'elle fait tourner pour qu'on regarde une livraison d'interface,
//                                                    puis ce que tous les lancements ont consommé ensemble : ce que le
//                                                    chef paie ; enfin les décisions du chef, posées ou non
//   npm --prefix runtime run station -- cooks <N>    règle le plafond de cooks simultanés ; 0 : pas de limite
//   npm --prefix runtime run station -- <geste> <valeur>
//                                                    pose une décision du chef (`decisions.ts`) — un geste par
//                                                    décision, listés par `station -- help` : les stations, les deux
//                                                    seuils de coût de la dérive, le calibrage du manager, du reviewer
//                                                    et du closer, avec ses trois plafonds
// Le réglage s'écrit dans le journal ; le runtime qui tourne le lit à sa
// prochaine prise, dans la seconde. Baisser le plafond n'arrête aucun cook.
// Une décision s'écrit au journal, au nom du chef, avec ce qu'elle remplace ;
// le runtime la lit à sa lecture suivante, sans redémarrage, et n'arrête rien
// de ce qui tourne. Une valeur qu'il ne lirait pas est refusée, et rien n'est
// écrit. Aucune n'a de défaut, ni ne s'en voit proposer un.
// Les anciens mots (`retirer`, `aide`) répondent encore, en disant le nouveau
// (`commandes.ts`).
import { existsSync } from "node:fs";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { EFFORTS, MODELES } from "./calibrage.ts";
import { decisionsPosees, poserDecision, retirerDecision, type Decision } from "./decisions.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { reglagesEnVigueur } from "./fermeture/condition.ts";
import { direReglagesEn } from "./fermeture/dire.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { direConsommationEn, NOTE_CONSOMMATION_EN } from "./etat.ts";
import { direSaturationEn } from "./machine.ts";
import { consommation } from "./projections/garde-fous.ts";
import { direCommentLeVoirEn, direEtatDeServeurEn, direPageEn, direServiceIndisponible, serveursEnCours, servicesIndisponibles, worktreesTenus } from "./projections/service.ts";
import { ConfigInvalide } from "./runtime.ts";
import { FORME, GESTE_DE_STATION_A_CHAUD_EN } from "./stations-declarees.ts";
import { direOrdinairesEn } from "./bac-a-sable/ordinaires.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import {
  cooksDeStation,
  cooksEnCoursDeStation,
  direConnexionTombeeEn,
  direRetenueDeStationEn,
  etatStation,
  plafondDeCooks,
  sansStationDepuis,
  stationsAnnoncees,
  type CookDeStation,
  type EtatStation,
} from "./projections/stations.ts";

// Les décisions du chef, chacune par son geste : ce qu'elle décide, et ce
// qu'elle attend. L'ordre est celui de l'aide et de l'affichage.
const ou = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} or ${valeurs.at(-1)}`;
export const GESTES: Record<string, { decision: Decision; quoi: string; valeur: string; attendu: string }> = {
  stations: { decision: "BRIGADE_STATIONS", quoi: "the project's stations", valeur: "<declaration>", attendu: `\`${FORME}\`, separated by commas` },
  "seuil-ticket": { decision: "BRIGADE_DRIFT_TICKET_TOKENS", quoi: "drift cost threshold: tokens of the dearest ticket", valeur: "<tokens>", attendu: "an integer greater than zero" },
  "seuil-perdus": { decision: "BRIGADE_DRIFT_LOST_TOKENS", quoi: "drift cost threshold: tokens lost, launches that delivered nothing", valeur: "<tokens>", attendu: "an integer greater than zero" },
  "manager-modele": { decision: "BRIGADE_MANAGER_MODEL", quoi: "the model of the manager's judgments", valeur: "<model>", attendu: ou(MODELES) },
  "manager-effort": { decision: "BRIGADE_MANAGER_EFFORT", quoi: "the effort of the manager's judgments", valeur: "<effort>", attendu: ou(EFFORTS) },
  "reviewer-modele": { decision: "BRIGADE_REVIEWER_MODEL", quoi: "the model of the reviewer's reviews", valeur: "<model>", attendu: ou(MODELES) },
  "reviewer-effort": { decision: "BRIGADE_REVIEWER_EFFORT", quoi: "the effort of the reviewer's reviews", valeur: "<effort>", attendu: ou(EFFORTS) },
  "closer-modele": { decision: "BRIGADE_CLOSING_MODEL", quoi: "the model of the closing pass (with closer-effort: without them, no pass writes)", valeur: "<model>", attendu: ou(MODELES) },
  "closer-effort": { decision: "BRIGADE_CLOSING_EFFORT", quoi: "the effort of the closing pass", valeur: "<effort>", attendu: ou(EFFORTS) },
  "closer-cooks": { decision: "BRIGADE_CLOSING_COOKS", quoi: "the pass leaves when fewer cooks than this are in flight", valeur: "<cooks>", attendu: "an integer greater than zero" },
  "closer-tokens": { decision: "BRIGADE_CLOSING_MAX_TOKENS", quoi: "cap on the tokens of a closing pass", valeur: "<tokens>", attendu: "an integer greater than zero" },
  "closer-retraits": { decision: "BRIGADE_CLOSING_MAX_REMOVED_LINES", quoi: "cap on the lines a closing pass may remove", valeur: "<lines>", attendu: "an integer greater than zero" },
};
const AIDE = ["help", "--help"];
const LU = "read by the runtime at its next read, without a restart; no running cook is stopped";

const geste = (nom: string) => `${nom} ${GESTES[nom]?.valeur ?? ""}`;
const USAGE = [
  "usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run station -- [cooks <N> | <gesture> <value> | remove <gesture> | help]",
  `  ${"cooks <N>".padEnd(26)}the cap on simultaneous cooks of all stations — a number, 0 for no limit`,
  ...Object.entries(GESTES).map(([nom, { quoi, attendu }]) => `  ${geste(nom).padEnd(26)}${quoi} — ${attendu}`),
  `  ${"remove <gesture>".padEnd(26)}removes a decision that was set: it is no longer decided, and the runtime keeps to what it read`,
  "A decision is written to the log in the chef's name: the runtime reads it at its next read, without a restart, and no cook is stopped.",
].join("\n");
const AUTEUR = "chef";
const COOKS_MONTRES = 10;
const HEURE_MS = 3_600_000;

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  const args = enAnglais("station", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const nombre = (valeur: number) => valeur.toLocaleString("en-US");
  const arrondi = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);
  const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  // La fin d'un cook telle que le chef la lit.
  const FINS: Record<string, string> = {
    done: "finished",
    ok: "finished",
    failed: "failed",
    guard: "stopped by a guardrail",
    stop: "stopped by “stop”",
    "86": "86 (quota exhausted)",
    neutral: "86 (quota exhausted)",
    disconnected: "Max connection expired",
    refused: "refused by the model",
    interrupted: "interrupted (runtime stopped)",
  };

  const calibrage = (cook: CookDeStation) => `${cook.model ?? "?"} / ${cook.effort ?? "?"}`;

  function decrire(cook: CookDeStation): string {
    const consomme =
      cook.turns === null ? null : [pluriel(cook.turns, "turn"), `${nombre(cook.tokens ?? 0)} tokens`, duree(cook.durationMs ?? 0)].join(" · ");
    return [cook.endedAt, `#${cook.ticket}`, cook.run, calibrage(cook), FINS[cook.ending ?? ""] ?? cook.ending, consomme, cook.pr]
      .filter((champ) => champ !== null)
      .join("  ");
  }

  const direPlafond = (plafond: number | null) => (plafond === null ? "no limit" : `${plafond} at most`);

  function decrirePlafond(etat: EtatStation): string {
    const regle = etat.cap === null ? "the default: the chef has set nothing" : "set by the chef";
    return `${direPlafond(plafondDeCooks(etat))} (${regle}) — \`station -- cooks <N>\` to change it, 0 for no limit`;
  }

  // Écrit le plafond du chef s'il change quelque chose, et dit ce qu'il en est.
  // Vérifier et écrire tiennent dans une seule transaction.
  function plafonner(journal: Journal, maxCooks: number): string {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "empty log: the runtime has never started on this state directory");
      const stations = stationsAnnoncees(base);
      if (stations.length === 0) echouer(1, sansStationDepuis(base) === null ? "no station has announced itself: the runtime has not started with its own yet" : `the project declares no station: there is no cap to set — ${GESTE_DE_STATION_A_CHAUD_EN}`);
      const absent = sessionEnCours(base) ? "" : " (no runtime is running: the setting will take effect at its next start)";
      return stations
        .map((station) => {
          const etat = etatStation(base, station);
          if (etat?.cap === maxCooks) return `${station}: cap already set — ${direPlafond(plafondDeCooks(etat))}`;
          const avant = etat ? direPlafond(plafondDeCooks(etat)) : "unknown";
          journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "station.capped", payload: { station, maxCooks } });
          const apres = direPlafond(maxCooks === 0 ? null : maxCooks);
          return `${station}: simultaneous cooks, ${apres} (was: ${avant}) — no running cook is stopped, the station launches no more while it is above${absent}`;
        })
        .join("\n");
    });
  }

  const projetDuJournal = (journal: Journal): string =>
    journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ??
    (env.BRIGADE_PROJECT || undefined) ??
    echouer(1, "empty log: the runtime has never started on this state directory");
  const sansRuntime = (journal: Journal) => (sessionEnCours(journal.base) ? "" : " (no runtime is running: the decision will take effect at its next start)");

  // Pose la décision du chef si elle change quelque chose, et dit ce qu'il en
  // est. Une valeur que le runtime ne lirait pas est refusée avec ce qui était
  // attendu, et rien n'est écrit. Ce qu'elle remplace se lit dans le fait
  // écrit, pris dans la même transaction que l'écriture.
  function decider(journal: Journal, nom: string, valeur: string): string {
    const { decision, attendu } = GESTES[nom] as (typeof GESTES)[string];
    const projet = projetDuJournal(journal);
    let fait;
    try {
      fait = poserDecision(journal, { projet, nom: decision, valeur, auteur: AUTEUR, anglais: true });
    } catch (erreur) {
      if (!(erreur instanceof ConfigInvalide)) throw erreur;
      echouer(2, `${nom} refused, nothing is written — ${erreur.message}\nusage: \`station -- ${geste(nom)}\` — ${attendu}`);
    }
    if (fait?.type !== "decision.set") return `${nom}: already set — ${valeur.trim()}; nothing is written`;
    const { value, previous } = fait.payload;
    return `${nom}: ${value} (was: ${previous ?? "not set"}) — ${LU}${sansRuntime(journal)}`;
  }

  // Retire la décision du chef : le journal n'en porte plus rien, et aucune
  // variable d'environnement n'y supplée.
  function retirer(journal: Journal, nom: string): string {
    const { decision } = GESTES[nom] as (typeof GESTES)[string];
    const fait = retirerDecision(journal, { projet: projetDuJournal(journal), nom: decision, auteur: AUTEUR });
    if (fait?.type !== "decision.withdrawn") return `${nom}: not set, nothing is written`;
    return `${nom}: removed (was: ${fait.payload.previous}) — it is no longer decided: the runtime keeps to what it read, no running cook is stopped; ${decision} is only read from the log${sansRuntime(journal)}`;
  }

  // Les décisions du chef, posées ou non : le journal en est le seul support.
  function montrerDecisions(journal: Journal): void {
    const posees = decisionsPosees(journal.base);
    ligne("chef's decisions", "`station -- <gesture> <value>` to set one, `station -- help` for the gestures");
    for (const [nom, { decision }] of Object.entries(GESTES)) {
      const posee = posees[decision];
      dire(`  ${nom.padEnd(20)}${posee ?? `not set — ${decision} is only read from the log`}`);
    }
    // Ce que la passe de fermeture vaut en ce moment, plafonds compris : tel
    // que le runtime les a notés, défauts et environnement compris.
    const closer = reglagesEnVigueur(journal);
    ligne("closer in force", closer === null ? "no runtime has noted it yet — not set, no pass writes" : direReglagesEn(closer));
  }

  function montrer(journal: Journal, station: string): void {
    const { base } = journal;
    const etat = etatStation(base, station);
    if (!etat) return;
    ligne("station", `${etat.station} — engine ${etat.engine}, provides: ${etat.provides.join(", ")}`);
    ligne("simultaneous cooks", decrirePlafond(etat));
    const { saturatedAt, saturatedResource: resource, saturatedObserved: observed, saturatedLimit: limit } = etat;
    // Une station distante ne tourne pas sur cette machine : ce qui se lit
    // d'elle, c'est si elle s'est manifestée.
    if (etat.remote) {
      ligne(
        "presence",
        etat.presentSince === null
          ? `MISSING — remote, it pulls its work, and ${etat.seenAt === null ? "has never shown itself" : `has not shown itself since ${etat.seenAt}`}; this is not a fault: the tickets only it can cook wait for its return, the others leave`
          : `present since ${etat.presentSince} — remote, it pulls its work; last request on ${etat.seenAt ?? etat.presentSince}`,
      );
      ligne("ordinary tickets", direOrdinairesEn(etat));
    } else {
      ligne(
        "machine",
        saturatedAt === null || resource === null || observed === null || limit === null
          ? "holds"
          : `SATURATED since ${saturatedAt} — ${direSaturationEn({ resource, observed, limit })}; no more tickets are taken while it lasts, the running cooks carry on`,
      );
    }
    ligne(
      "Max connection",
      etat.disconnectedAt === null
        ? "taken as good"
        : direConnexionTombeeEn(etat),
    );
    ligne(
      "quota",
      etat.quotaUntil !== null && etat.quotaUntil > new Date().toISOString()
        ? `86 — exhausted, back at ${etat.quotaUntil}; no more tickets are taken until then`
        : "available",
    );
    ligne(
      "withholding",
      etat.heldAt === null || etat.heldReason === null
        ? "none — every servable ticket leaves"
        : `since ${etat.heldAt} — ${direRetenueDeStationEn(etat.heldReason)}: the servable tickets wait`,
    );
    // Rien à dire d'un arbitre qui répond, ou d'un projet qui n'en a pas.
    if (etat.unarbitratedAt !== null) {
      ligne("arbiter", `UNREACHABLE since ${etat.unarbitratedAt} (${etat.unarbitratedReason ?? "no response"}) — degraded mode: one cook at a time, with no arbitration, until it is back`);
    }
    // Tous ceux qui tournent, quel que soit leur nombre : c'est ce que le plafond borne.
    const enCours = cooksEnCoursDeStation(base, station);
    ligne("cooks running", enCours.length === 0 ? "none" : String(enCours.length));
    for (const cook of enCours) dire(`  #${cook.ticket}  ${cook.run}  ${calibrage(cook)}  launched ${cook.launchedAt}  ${cook.branch}`);
    // Ce qui est allumé : une livraison d'interface servie depuis son worktree,
    // sur le port de ce worktree. Sans serveur, il n'y a rien à lister.
    const serveurs = serveursEnCours(base, station);
    ligne("servers", serveurs.length === 0 ? "none" : `${serveurs.length} — each serves an interface delivery from its worktree, on that worktree's port`);
    for (const serveur of serveurs) {
      dire(`  #${serveur.ticket}  ${serveur.worktree}  port ${serveur.port}  ${direEtatDeServeurEn(serveur.state)} since ${serveur.since}  ${serveur.branch}  ${direPageEn(serveur)}`);
    }
    // Une app qui ne s'ouvre pas dans un navigateur n'a pas de serveur : le
    // worktree de sa livraison est tenu, et la ligne dit comment la voir.
    // Rien à dire quand il n'y en a pas.
    const aLancer = worktreesTenus(base, station);
    if (aLancer.length > 0) ligne("to launch", `${aLancer.length} — each holds the worktree of a delivery of an app that does not open in a browser: no page, the app is launched on it`);
    for (const tenu of aLancer) dire(`  #${tenu.ticket}  ${tenu.worktree}  held since ${tenu.since}  ${tenu.branch}  ${direCommentLeVoirEn(tenu)}`);
    // Rien à dire d'un projet qui se sert.
    for (const indisponible of servicesIndisponibles(base, station)) ligne("service", `${direServiceIndisponible(indisponible)} — since ${indisponible.since}`);
    const finis = cooksDeStation(base, station, COOKS_MONTRES + enCours.length)
      .filter((cook) => cook.endedAt !== null)
      .slice(0, COOKS_MONTRES);
    ligne("latest cooks", finis.length === 0 ? "none" : "");
    for (const cook of finis) dire(`  ${decrire(cook)}`);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  const [commande, valeur] = args;
  if (args.length === 1 && AIDE.includes(commande ?? "")) {
    dire(USAGE);
    return;
  }
  const plafond = commande === "cooks";
  const decision = commande !== undefined && Object.hasOwn(GESTES, commande);
  const retrait = commande === "remove";
  if (decision && args.length !== 2) echouer(2, `${commande} needs a value, and only one — \`station -- ${geste(commande)}\`: ${GESTES[commande]?.attendu}`);
  if (retrait && (args.length !== 2 || !Object.hasOwn(GESTES, valeur ?? ""))) echouer(2, `remove needs a decision gesture — ${Object.keys(GESTES).join(", ")}`);
  if (plafond ? args.length !== 2 || !/^(0|[1-9][0-9]{0,5})$/.test(valeur ?? "") : !decision && !retrait && args.length > 0) echouer(2, USAGE);
  const regler = plafond || decision || retrait;
  // Un réglage ouvre le journal en écriture : sans ce contrôle, il en créerait
  // un là où il n'y en a pas. Une décision est la seule à le faire : un projet
  // neuf n'a pas démarré, et son runtime ne démarre qu'avec elles — le journal
  // naît alors du geste, au nom du projet que l'unité lui donne.
  if (!existsSync(cheminJournal(repertoireEtat)) && !(decision && env.BRIGADE_PROJECT)) echouer(1, `no log in ${repertoireEtat}`);

  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: !regler });
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  try {
    if (plafond) {
      dire(`brigade : ${plafonner(journal, Number(valeur))}`);
    } else if (decision) {
      dire(`brigade : ${decider(journal, commande, valeur ?? "")}`);
    } else if (retrait) {
      dire(`brigade : ${retirer(journal, valeur ?? "")}`);
    } else {
      const stations = stationsAnnoncees(journal.base);
      if (stations.length === 0) {
        const sans = sansStationDepuis(journal.base);
        dire(sans === null ? "no station has announced itself: the runtime has not started with its own yet" : `no station declared since ${sans} — no cook leaves, the tickets stay queued: ${GESTE_DE_STATION_A_CHAUD_EN}`);
      }
      for (const station of stations) montrer(journal, station);
      // Tous les lancements du projet, relectures et jugements compris : c'est
      // la fenêtre de 5 h que le chef compare à `/usage`.
      if (stations.length > 0) {
        const depuis = (heures: number) => new Date(Date.now() - heures * HEURE_MS).toISOString();
        ligne("consumed", `in flight: ${direConsommationEn(consommation(journal.base))}`);
        for (const heures of [5, 24]) ligne("", `${heures} h: ${direConsommationEn(consommation(journal.base, depuis(heures)))}`);
        ligne("", NOTE_CONSOMMATION_EN);
      }
      montrerDecisions(journal);
    }
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant la station, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      echouer(1, "this log does not hold the stations' state yet: restart the runtime, which recomputes it");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
