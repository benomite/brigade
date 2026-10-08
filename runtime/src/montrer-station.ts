// La station vue et réglée par le chef, depuis son propre process :
//   npm --prefix runtime run station                 ce qu'elle fournit, ce qui l'empêche de servir, et ses cooks —
//                                                    chacun avec son calibrage et ce qu'il a consommé, puis ce que
//                                                    tous les lancements ont consommé ensemble : ce que le chef paie
//   npm --prefix runtime run station -- cooks <N>    règle le plafond de cooks simultanés ; 0 : pas de limite
// Le réglage s'écrit dans le journal ; le runtime qui tourne le lit à sa
// prochaine prise, dans la seconde. Baisser le plafond n'arrête aucun cook.
import { existsSync } from "node:fs";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { direConsommation } from "./etat.ts";
import { direSaturation } from "./machine.ts";
import { consommation } from "./projections/garde-fous.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import {
  cooksDeStation,
  cooksEnCoursDeStation,
  direRetenueDeStation,
  etatStation,
  plafondDeCooks,
  stationsAnnoncees,
  type CookDeStation,
  type EtatStation,
} from "./projections/stations.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run station -- [cooks <nombre, 0 pour aucune limite>]";
const AUTEUR = "chef";
const COOKS_MONTRES = 10;
const HEURE_MS = 3_600_000;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
const arrondi = (valeur: number) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const duree = (ms: number) => (ms >= 60_000 ? `${arrondi(ms / 60_000)} min` : `${arrondi(ms / 1000)} s`);
const pluriel = (combien: number, mot: string) => `${nombre(combien)} ${mot}${combien > 1 ? "s" : ""}`;
const ligne = (titre: string, valeur: string) => console.log(`${titre.padEnd(22)}${valeur}`);

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
    if (stations.length === 0) echouer(1, "aucune station ne s'est annoncée : le runtime n'a pas encore démarré avec la sienne");
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

function montrer(journal: Journal, station: string): void {
  const { base } = journal;
  const etat = etatStation(base, station);
  if (!etat) return;
  ligne("station", `${etat.station} — moteur ${etat.engine}, fournit : ${etat.provides.join(", ")}`);
  ligne("cooks simultanés", decrirePlafond(etat));
  const { saturatedAt, saturatedResource: resource, saturatedObserved: observed, saturatedLimit: limit } = etat;
  ligne(
    "machine",
    saturatedAt === null || resource === null || observed === null || limit === null
      ? "tient"
      : `SATURÉE depuis le ${saturatedAt} — ${direSaturation({ resource, observed, limit })} ; plus aucun ticket n'est pris tant que ça dure, les cooks en cours continuent`,
  );
  ligne(
    "connexion Max",
    etat.disconnectedAt === null
      ? "tenue pour bonne"
      : `EXPIRÉE depuis le ${etat.disconnectedAt} (${etat.disconnectedReason}) — plus aucun ticket n'est pris ; \`claude /login\` sous le compte du service, puis « reprendre »`,
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
  // Tous ceux qui tournent, quel que soit leur nombre : c'est ce que le plafond borne.
  const enCours = cooksEnCoursDeStation(base, station);
  ligne("cooks en cours", enCours.length === 0 ? "aucun" : String(enCours.length));
  for (const cook of enCours) console.log(`  #${cook.ticket}  ${cook.run}  ${calibrage(cook)}  lancé le ${cook.launchedAt}  ${cook.branch}`);
  const finis = cooksDeStation(base, station, COOKS_MONTRES + enCours.length)
    .filter((cook) => cook.endedAt !== null)
    .slice(0, COOKS_MONTRES);
  ligne("derniers cooks", finis.length === 0 ? "aucun" : "");
  for (const cook of finis) console.log(`  ${decrire(cook)}`);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [commande, valeur] = args;
const regler = commande === "cooks";
if (regler ? args.length !== 2 || !/^(0|[1-9][0-9]{0,5})$/.test(valeur ?? "") : args.length > 0) echouer(2, USAGE);
// Un réglage ouvre le journal en écriture : sans ce contrôle, il en créerait
// un là où il n'y en a pas.
if (!existsSync(cheminJournal(repertoireEtat))) echouer(1, `aucun journal dans ${repertoireEtat}`);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: !regler });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  if (regler) {
    console.log(`brigade : ${plafonner(journal, Number(valeur))}`);
  } else {
    const stations = stationsAnnoncees(journal.base);
    if (stations.length === 0) console.log("aucune station ne s'est annoncée : le runtime n'a pas encore démarré avec la sienne");
    for (const station of stations) montrer(journal, station);
    // Tous les lancements du projet, relectures et jugements compris : c'est
    // la fenêtre de 5 h que le chef compare à `/usage`.
    if (stations.length > 0) {
      const depuis = (heures: number) => new Date(Date.now() - heures * HEURE_MS).toISOString();
      ligne("consommé", `en cours : ${direConsommation(consommation(journal.base))}`);
      for (const heures of [5, 24]) ligne("", `${heures} h : ${direConsommation(consommation(journal.base, depuis(heures)))}`);
    }
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
