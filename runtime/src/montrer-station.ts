// Montre la station, en lecture seule : `npm --prefix runtime run station`.
// Ce qu'elle fournit, ce qui l'empêche de servir, et ses cooks — chacun avec
// son calibrage et ce qu'il a consommé : c'est ici que le chef lit ce qu'il paie.
import { ouvrirJournal, type Journal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { cooksDeStation, etatStation, stationsAnnoncees, type CookDeStation } from "./projections/stations.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run station";
const COOKS_MONTRES = 10;

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

function montrer(journal: Journal, station: string): void {
  const { base } = journal;
  const etat = etatStation(base, station);
  if (!etat) return;
  ligne("station", `${etat.station} — moteur ${etat.engine}, fournit : ${etat.provides.join(", ")}`);
  ligne("cooks simultanés", `${etat.maxCooks} au plus`);
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
  const cooks = cooksDeStation(base, station, COOKS_MONTRES + 1);
  const enCours = cooks.filter((cook) => cook.endedAt === null);
  ligne("cook en cours", enCours.length === 0 ? "aucun" : "");
  for (const cook of enCours) console.log(`  #${cook.ticket}  ${cook.run}  ${calibrage(cook)}  lancé le ${cook.launchedAt}  ${cook.branch}`);
  const finis = cooks.filter((cook) => cook.endedAt !== null).slice(0, COOKS_MONTRES);
  ligne("derniers cooks", finis.length === 0 ? "aucun" : "");
  for (const cook of finis) console.log(`  ${decrire(cook)}`);
}

const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
if (process.argv.length > 2) echouer(2, USAGE);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const stations = stationsAnnoncees(journal.base);
  if (stations.length === 0) console.log("aucune station ne s'est annoncée : le runtime n'a pas encore démarré avec la sienne");
  for (const station of stations) montrer(journal, station);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant la station.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore l'état des stations : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
} finally {
  journal.fermer();
}
