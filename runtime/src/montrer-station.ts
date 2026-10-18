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
import { direReglages } from "./fermeture/dire.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { direConsommation, NOTE_CONSOMMATION } from "./etat.ts";
import { direSaturation } from "./machine.ts";
import { consommation } from "./projections/garde-fous.ts";
import { direCommentLeVoir, direEtatDeServeur, direPage, direServiceIndisponible, serveursEnCours, servicesIndisponibles, worktreesTenus } from "./projections/service.ts";
import { ConfigInvalide } from "./runtime.ts";
import { FORME, GESTE_DE_STATION_A_CHAUD } from "./stations-declarees.ts";
import { direOrdinaires } from "./bac-a-sable/ordinaires.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import {
  cooksDeStation,
  cooksEnCoursDeStation,
  direConnexionTombee,
  direRetenueDeStation,
  etatStation,
  plafondDeCooks,
  sansStationDepuis,
  stationsAnnoncees,
  type CookDeStation,
  type EtatStation,
} from "./projections/stations.ts";

// Les décisions du chef, chacune par son geste : ce qu'elle décide, et ce
// qu'elle attend. L'ordre est celui de l'aide et de l'affichage.
const ou = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} ou ${valeurs.at(-1)}`;
export const GESTES: Record<string, { decision: Decision; quoi: string; valeur: string; attendu: string }> = {
  stations: { decision: "BRIGADE_STATIONS", quoi: "les stations du projet", valeur: "<déclaration>", attendu: `\`${FORME}\`, séparées par des virgules` },
  "seuil-ticket": { decision: "BRIGADE_DRIFT_TICKET_TOKENS", quoi: "seuil de coût de la dérive : tokens du ticket le plus cher", valeur: "<tokens>", attendu: "un entier supérieur à zéro" },
  "seuil-perdus": { decision: "BRIGADE_DRIFT_LOST_TOKENS", quoi: "seuil de coût de la dérive : tokens perdus, lancements qui n'ont rien livré", valeur: "<tokens>", attendu: "un entier supérieur à zéro" },
  "seuil-renvois": { decision: "BRIGADE_DRIFT_FIRST_TRY_PERCENT", quoi: "seuil de la dérive : part de tickets livrés du premier coup, en % (50 faute de réglage)", valeur: "<pourcentage>", attendu: "un nombre supérieur à zéro" },
  "fenetre-renvois": { decision: "BRIGADE_DRIFT_FIRST_TRY_WINDOW", quoi: "fenêtre de la dérive sur le premier coup : combien de tickets servis (10 faute de réglage)", valeur: "<tickets>", attendu: "un entier supérieur à zéro" },
  "manager-modele": { decision: "BRIGADE_MANAGER_MODEL", quoi: "le modèle des jugements du manager", valeur: "<modèle>", attendu: ou(MODELES) },
  "manager-effort": { decision: "BRIGADE_MANAGER_EFFORT", quoi: "l'effort des jugements du manager", valeur: "<effort>", attendu: ou(EFFORTS) },
  "reviewer-modele": { decision: "BRIGADE_REVIEWER_MODEL", quoi: "le modèle des relectures du reviewer", valeur: "<modèle>", attendu: ou(MODELES) },
  "reviewer-effort": { decision: "BRIGADE_REVIEWER_EFFORT", quoi: "l'effort des relectures du reviewer", valeur: "<effort>", attendu: ou(EFFORTS) },
  "closer-modele": { decision: "BRIGADE_CLOSING_MODEL", quoi: "le modèle de la passe de fermeture (avec closer-effort : sans eux, aucune passe n'écrit)", valeur: "<modèle>", attendu: ou(MODELES) },
  "closer-effort": { decision: "BRIGADE_CLOSING_EFFORT", quoi: "l'effort de la passe de fermeture", valeur: "<effort>", attendu: ou(EFFORTS) },
  "closer-cooks": { decision: "BRIGADE_CLOSING_COOKS", quoi: "la passe part quand moins de cooks que cela sont en vol", valeur: "<cooks>", attendu: "un entier supérieur à zéro" },
  "closer-tokens": { decision: "BRIGADE_CLOSING_MAX_TOKENS", quoi: "plafond de tokens d'une passe de fermeture", valeur: "<tokens>", attendu: "un entier supérieur à zéro" },
  "closer-retraits": { decision: "BRIGADE_CLOSING_MAX_REMOVED_LINES", quoi: "plafond de lignes qu'une passe de fermeture peut retirer", valeur: "<lignes>", attendu: "un entier supérieur à zéro" },
};
const AIDE = ["help", "--help"];
const LU = "lu par le runtime à sa lecture suivante, sans redémarrage ; aucun cook en cours n'est arrêté";

const geste = (nom: string) => `${nom} ${GESTES[nom]?.valeur ?? ""}`;
const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run station -- [cooks <N> | <geste> <valeur> | remove <geste> | help]",
  `  ${"cooks <N>".padEnd(26)}le plafond de cooks simultanés de toutes les stations — un nombre, 0 pour aucune limite`,
  ...Object.entries(GESTES).map(([nom, { quoi, attendu }]) => `  ${geste(nom).padEnd(26)}${quoi} — ${attendu}`),
  `  ${"remove <geste>".padEnd(26)}retire une décision posée : elle n'est plus décidée, et le runtime s'en tient à ce qu'il lisait`,
  "Une décision s'écrit au journal au nom du chef : le runtime la lit à sa lecture suivante, sans redémarrage, et aucun cook n'est arrêté.",
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

  const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
  const arrondi = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);
  const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
  const ligne = (titre: string, valeur: string) => dire(`${titre.padEnd(22)}${valeur}`);

  // La fin d'un cook telle que le chef la lit.
  const FINS: Record<string, string> = {
    done: "fini",
    ok: "fini",
    failed: "échoué",
    guard: "arrêté par un garde-fou",
    stop: "arrêté par « stop »",
    "86": "86 (quota épuisé)",
    neutral: "86 (quota épuisé)",
    disconnected: "connexion Max expirée",
    refused: "refusé par le modèle",
    interrupted: "interrompu (runtime arrêté)",
  };

  const calibrage = (cook: CookDeStation) => `${cook.model ?? "?"} / ${cook.effort ?? "?"}`;

  function decrire(cook: CookDeStation): string {
    const consomme =
      cook.turns === null ? null : [pluriel(cook.turns, "tour"), `${nombre(cook.tokens ?? 0)} tokens`, duree(cook.durationMs ?? 0)].join(" · ");
    return [cook.endedAt, `#${cook.ticket}`, cook.run, calibrage(cook), FINS[cook.ending ?? ""] ?? cook.ending, consomme, cook.pr]
      .filter((champ) => champ !== null)
      .join("  ");
  }

  const direPlafond = (plafond: number | null) => (plafond === null ? "sans limite" : `${plafond} au plus`);

  function decrirePlafond(etat: EtatStation): string {
    const regle = etat.cap === null ? "le défaut : le chef n'a rien réglé" : "réglé par le chef";
    return `${direPlafond(plafondDeCooks(etat))} (${regle}) — \`station -- cooks <N>\` pour le changer, 0 pour aucune limite`;
  }

  // Écrit le plafond du chef s'il change quelque chose, et dit ce qu'il en est.
  // Vérifier et écrire tiennent dans une seule transaction.
  function plafonner(journal: Journal, maxCooks: number): string {
    const { base } = journal;
    return base.transaction(() => {
      const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
      if (!projet) echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
      const stations = stationsAnnoncees(base);
      if (stations.length === 0) echouer(1, sansStationDepuis(base) === null ? "aucune station ne s'est annoncée : le runtime n'a pas encore démarré avec les siennes" : `le projet ne déclare aucune station : il n'y a aucun plafond à régler — ${GESTE_DE_STATION_A_CHAUD}`);
      const absent = sessionEnCours(base) ? "" : " (aucun runtime ne tourne : le réglage vaudra à son prochain démarrage)";
      return stations
        .map((station) => {
          const etat = etatStation(base, station);
          if (etat?.cap === maxCooks) return `${station} : plafond déjà réglé — ${direPlafond(plafondDeCooks(etat))}`;
          const avant = etat ? direPlafond(plafondDeCooks(etat)) : "inconnu";
          journal.ajouter({ project: projet, ticket: null, author: AUTEUR, type: "station.capped", payload: { station, maxCooks } });
          const apres = direPlafond(maxCooks === 0 ? null : maxCooks);
          return `${station} : cooks simultanés, ${apres} (c'était : ${avant}) — aucun cook en cours n'est arrêté, la station n'en lance plus tant qu'elle est au-dessus${absent}`;
        })
        .join("\n");
    });
  }

  const projetDuJournal = (journal: Journal): string =>
    journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ??
    (env.BRIGADE_PROJECT || undefined) ??
    echouer(1, "journal vide : le runtime n'a jamais démarré sur ce répertoire d'état");
  const sansRuntime = (journal: Journal) => (sessionEnCours(journal.base) ? "" : " (aucun runtime ne tourne : la décision vaudra à son prochain démarrage)");

  // Pose la décision du chef si elle change quelque chose, et dit ce qu'il en
  // est. Une valeur que le runtime ne lirait pas est refusée avec ce qui était
  // attendu, et rien n'est écrit. Ce qu'elle remplace se lit dans le fait
  // écrit, pris dans la même transaction que l'écriture.
  function decider(journal: Journal, nom: string, valeur: string): string {
    const { decision, attendu } = GESTES[nom] as (typeof GESTES)[string];
    const projet = projetDuJournal(journal);
    let fait;
    try {
      fait = poserDecision(journal, { projet, nom: decision, valeur, auteur: AUTEUR });
    } catch (erreur) {
      if (!(erreur instanceof ConfigInvalide)) throw erreur;
      echouer(2, `${nom} refusé, rien n'est écrit — ${erreur.message}\nusage : \`station -- ${geste(nom)}\` — ${attendu}`);
    }
    if (fait?.type !== "decision.set") return `${nom} : déjà posée — ${valeur.trim()} ; rien n'est écrit`;
    const { value, previous } = fait.payload;
    return `${nom} : ${value} (c'était : ${previous ?? "non posée"}) — ${LU}${sansRuntime(journal)}`;
  }

  // Retire la décision du chef : le journal n'en porte plus rien, et aucune
  // variable d'environnement n'y supplée.
  function retirer(journal: Journal, nom: string): string {
    const { decision } = GESTES[nom] as (typeof GESTES)[string];
    const fait = retirerDecision(journal, { projet: projetDuJournal(journal), nom: decision, auteur: AUTEUR });
    if (fait?.type !== "decision.withdrawn") return `${nom} : non posée, rien n'est écrit`;
    return `${nom} : retirée (c'était : ${fait.payload.previous}) — elle n'est plus décidée : le runtime s'en tient à ce qu'il lisait, aucun cook en cours n'est arrêté ; ${decision} ne se lit que du journal${sansRuntime(journal)}`;
  }

  // Les décisions du chef, posées ou non : le journal en est le seul support.
  function montrerDecisions(journal: Journal): void {
    const posees = decisionsPosees(journal.base);
    ligne("décisions du chef", "`station -- <geste> <valeur>` pour en poser une, `station -- help` pour les gestes");
    for (const [nom, { decision }] of Object.entries(GESTES)) {
      const posee = posees[decision];
      dire(`  ${nom.padEnd(20)}${posee ?? `non posée — ${decision} ne se lit que du journal`}`);
    }
    // Ce que la passe de fermeture vaut en ce moment, plafonds compris : tel
    // que le runtime les a notés, défauts et environnement compris.
    const closer = reglagesEnVigueur(journal);
    ligne("closer en vigueur", closer === null ? "aucun runtime ne l'a encore noté — non réglé, aucune passe n'écrit" : direReglages(closer));
  }

  function montrer(journal: Journal, station: string): void {
    const { base } = journal;
    const etat = etatStation(base, station);
    if (!etat) return;
    ligne("station", `${etat.station} — moteur ${etat.engine}, fournit : ${etat.provides.join(", ")}`);
    ligne("cooks simultanés", decrirePlafond(etat));
    const { saturatedAt, saturatedResource: resource, saturatedObserved: observed, saturatedLimit: limit } = etat;
    // Une station distante ne tourne pas sur cette machine : ce qui se lit
    // d'elle, c'est si elle s'est manifestée.
    if (etat.remote) {
      ligne(
        "présence",
        etat.presentSince === null
          ? `ABSENTE — distante, elle tire son travail, et ${etat.seenAt === null ? "ne s'est jamais manifestée" : `ne s'est plus manifestée depuis le ${etat.seenAt}`} ; ce n'est pas une panne : les tickets qu'elle seule peut cuisiner attendent son retour, les autres partent`
          : `présente depuis le ${etat.presentSince} — distante, elle tire son travail ; dernière demande le ${etat.seenAt ?? etat.presentSince}`,
      );
      ligne("tickets ordinaires", direOrdinaires(etat));
    } else {
      ligne(
        "machine",
        saturatedAt === null || resource === null || observed === null || limit === null
          ? "tient"
          : `SATURÉE depuis le ${saturatedAt} — ${direSaturation({ resource, observed, limit })} ; plus aucun ticket n'est pris tant que ça dure, les cooks en cours continuent`,
      );
    }
    ligne(
      "connexion Max",
      etat.disconnectedAt === null
        ? "tenue pour bonne"
        : direConnexionTombee(etat),
    );
    ligne(
      "quota",
      etat.quotaUntil !== null && etat.quotaUntil > new Date().toISOString()
        ? `86 — épuisé, retour à ${etat.quotaUntil} ; plus aucun ticket n'est pris d'ici là`
        : "disponible",
    );
    ligne(
      "retenue",
      etat.heldAt === null || etat.heldReason === null
        ? "aucune — tout ticket servable part"
        : `depuis le ${etat.heldAt} — ${direRetenueDeStation(etat.heldReason)} : les tickets servables attendent`,
    );
    // Rien à dire d'un arbitre qui répond, ou d'un projet qui n'en a pas.
    if (etat.unarbitratedAt !== null) {
      ligne("arbitre", `INJOIGNABLE depuis le ${etat.unarbitratedAt} (${etat.unarbitratedReason ?? "sans réponse"}) — mode dégradé : un seul cook à la fois, sans arbitrage, jusqu'à son retour`);
    }
    // Tous ceux qui tournent, quel que soit leur nombre : c'est ce que le plafond borne.
    const enCours = cooksEnCoursDeStation(base, station);
    ligne("cooks en cours", enCours.length === 0 ? "aucun" : String(enCours.length));
    for (const cook of enCours) dire(`  #${cook.ticket}  ${cook.run}  ${calibrage(cook)}  lancé le ${cook.launchedAt}  ${cook.branch}`);
    // Ce qui est allumé : une livraison d'interface servie depuis son worktree,
    // sur le port de ce worktree. Sans serveur, il n'y a rien à lister.
    const serveurs = serveursEnCours(base, station);
    ligne("serveurs", serveurs.length === 0 ? "aucun" : `${serveurs.length} — chacun sert une livraison d'interface depuis son worktree, sur le port de ce worktree`);
    for (const serveur of serveurs) {
      dire(`  #${serveur.ticket}  ${serveur.worktree}  port ${serveur.port}  ${direEtatDeServeur(serveur.state)} depuis le ${serveur.since}  ${serveur.branch}  ${direPage(serveur)}`);
    }
    // Une app qui ne s'ouvre pas dans un navigateur n'a pas de serveur : le
    // worktree de sa livraison est tenu, et la ligne dit comment la voir.
    // Rien à dire quand il n'y en a pas.
    const aLancer = worktreesTenus(base, station);
    if (aLancer.length > 0) ligne("à lancer", `${aLancer.length} — chacun tient le worktree d'une livraison d'une app qui ne s'ouvre pas dans un navigateur : aucune page, l'app se lance dessus`);
    for (const tenu of aLancer) dire(`  #${tenu.ticket}  ${tenu.worktree}  tenu depuis le ${tenu.since}  ${tenu.branch}  ${direCommentLeVoir(tenu)}`);
    // Rien à dire d'un projet qui se sert.
    for (const indisponible of servicesIndisponibles(base, station)) ligne("service", `${direServiceIndisponible(indisponible)} — since ${indisponible.since}`);
    const finis = cooksDeStation(base, station, COOKS_MONTRES + enCours.length)
      .filter((cook) => cook.endedAt !== null)
      .slice(0, COOKS_MONTRES);
    ligne("derniers cooks", finis.length === 0 ? "aucun" : "");
    for (const cook of finis) dire(`  ${decrire(cook)}`);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [commande, valeur] = args;
  if (args.length === 1 && AIDE.includes(commande ?? "")) {
    dire(USAGE);
    return;
  }
  const plafond = commande === "cooks";
  const decision = commande !== undefined && Object.hasOwn(GESTES, commande);
  const retrait = commande === "remove";
  if (decision && args.length !== 2) echouer(2, `${commande} attend une valeur, et une seule — \`station -- ${geste(commande)}\` : ${GESTES[commande]?.attendu}`);
  if (retrait && (args.length !== 2 || !Object.hasOwn(GESTES, valeur ?? ""))) echouer(2, `remove attend un geste de décision — ${Object.keys(GESTES).join(", ")}`);
  if (plafond ? args.length !== 2 || !/^(0|[1-9][0-9]{0,5})$/.test(valeur ?? "") : !decision && !retrait && args.length > 0) echouer(2, USAGE);
  const regler = plafond || decision || retrait;
  // Un réglage ouvre le journal en écriture : sans ce contrôle, il en créerait
  // un là où il n'y en a pas. Une décision est la seule à le faire : un projet
  // neuf n'a pas démarré, et son runtime ne démarre qu'avec elles — le journal
  // naît alors du geste, au nom du projet que l'unité lui donne.
  if (!existsSync(cheminJournal(repertoireEtat)) && !(decision && env.BRIGADE_PROJECT)) echouer(1, `aucun journal dans ${repertoireEtat}`);

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
        dire(sans === null ? "aucune station ne s'est annoncée : le runtime n'a pas encore démarré avec les siennes" : `aucune station déclarée depuis le ${sans} — aucun cook ne part, les tickets restent en attente : ${GESTE_DE_STATION_A_CHAUD}`);
      }
      for (const station of stations) montrer(journal, station);
      // Tous les lancements du projet, relectures et jugements compris : c'est
      // la fenêtre de 5 h que le chef compare à `/usage`.
      if (stations.length > 0) {
        const depuis = (heures: number) => new Date(Date.now() - heures * HEURE_MS).toISOString();
        ligne("consommé", `en cours : ${direConsommation(consommation(journal.base))}`);
        for (const heures of [5, 24]) ligne("", `${heures} h : ${direConsommation(consommation(journal.base, depuis(heures)))}`);
        ligne("", NOTE_CONSOMMATION);
      }
      montrerDecisions(journal);
    }
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant la station, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      echouer(1, "ce journal n'a pas encore l'état des stations : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  } finally {
    journal.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
