// L'état de la cuisine, en lecture seule :
//   npm --prefix runtime run status                          la photo : runtime, ce qui attend le chef, rail, cooks, serveurs, derniers événements
//   npm --prefix runtime run status -- --follow [<ticket>]   la photo, puis le journal en direct, jusqu'à Ctrl-C
// `--days <N>` : la période des cartes entrées dans TODO, par type — product,
// design, gesture —, comptée en jours jusqu'à maintenant (7 par défaut).
// L'ancien mot `--suivre` répond encore, en disant le nouveau (`commandes.ts`).
// BRIGADE_BACKUP_MAX_AGE_HOURS règle l'âge au-delà duquel la dernière sauvegarde
// est marquée (48 par défaut).
// La commande n'écrit jamais, et répond pendant que le runtime et ses cooks
// tournent. La photo se lit aussi sans process (`photoDuProjet`) : le guichet
// des téléphones la rend au téléphone telle quelle (`telephone/projets.ts`).
import { direEntreesEn, entreesParType } from "./carte-todo.ts";
import { enProcess, LectureImpossible, Sortie, type Appel } from "./appel.ts";
import { enAnglais } from "./commandes.ts";
import { AGE_MAX_SAUVEGARDE_MS, decrireEtat, lireEtat, suivre } from "./etat.ts";
import { ouvrirJournal, type Journal } from "./journal.ts";
import { appelsDeLaStation, pauseDeLaStation, retenueDeLaStation } from "./limite-github.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run status -- [--days <N>] [--follow [<numéro de ticket>]]";

const JOURS_DE_TODO = 7;

export function principal({ args: tapes, env, dire, redire }: Appel): void {
  const brut = enAnglais("status", tapes, redire);
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  // `--days <N>` se retire des arguments avant le reste.
  let jours = JOURS_DE_TODO;
  const args = [...brut];
  const rangDays = args.indexOf("--days");
  if (rangDays !== -1) {
    const dit = args[rangDays + 1];
    if (dit === undefined || !/^[1-9][0-9]{0,3}$/.test(dit)) echouer(2, `--days attend un nombre de jours, 1 au moins\n${USAGE}`);
    jours = Number(dit);
    args.splice(rangDays, 2);
  }

  if (!env.BRIGADE_STATE_DIR) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const [option, ticket] = args;
  if (args.length > 2 || (option !== undefined && option !== "--follow") || (ticket !== undefined && !/^[0-9]+$/.test(ticket))) {
    echouer(2, USAGE);
  }

  let journal;
  let photo;
  try {
    const ageMaxSauvegardeMs = ageMaxDeLaSauvegarde(env);
    journal = ouvrirEnLecture(env.BRIGADE_STATE_DIR);
    photo = photographier(journal, env, jours, ageMaxSauvegardeMs, new Date());
  } catch (erreur) {
    journal?.fermer();
    if (erreur instanceof LectureImpossible) echouer(erreur.code, erreur.message);
    throw erreur;
  }
  for (const ligne of photo.lignes) dire(ligne);

  if (option === undefined) {
    journal.fermer();
  } else {
    // Les gestionnaires précèdent l'annonce : qui la lit peut signaler sans courir.
    // Un second signal, ou l'autre des deux, ne doit pas refermer le journal.
    let arreter = () => {};
    let arrete = false;
    const arretPropre = () => {
      if (arrete) return;
      arrete = true;
      arreter();
      journal.fermer();
    };
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, arretPropre);
    dire(`\nsuivi en direct${ticket === undefined ? "" : ` du ticket #${ticket}`} — Ctrl-C pour arrêter`);
    arreter = suivre(journal, {
      depuis: photo.dernierSeq,
      ticket: ticket === undefined ? undefined : Number(ticket),
      ecrire: (ligne) => dire(ligne),
    });
  }
}

// La photo du projet de cet environnement, à cet instant : les lignes que
// `status` écrit, sans suivi. Lève `LectureImpossible` quand elle ne se lit pas.
export function photoDuProjet(env: Record<string, string | undefined>, { jours = JOURS_DE_TODO, maintenant = new Date() }: { jours?: number; maintenant?: Date } = {}): string[] {
  if (!env.BRIGADE_STATE_DIR) throw new LectureImpossible(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const ageMaxSauvegardeMs = ageMaxDeLaSauvegarde(env);
  const journal = ouvrirEnLecture(env.BRIGADE_STATE_DIR);
  try {
    return photographier(journal, env, jours, ageMaxSauvegardeMs, maintenant).lignes;
  } finally {
    journal.fermer();
  }
}

function ageMaxDeLaSauvegarde(env: Record<string, string | undefined>): number {
  const reglage = env.BRIGADE_BACKUP_MAX_AGE_HOURS;
  if (reglage !== undefined && !/^[1-9][0-9]*$/.test(reglage)) {
    throw new LectureImpossible(2, `BRIGADE_BACKUP_MAX_AGE_HOURS invalide : « ${reglage} » — attendu un nombre d'heures, 1 au moins`);
  }
  return reglage === undefined ? AGE_MAX_SAUVEGARDE_MS : Number(reglage) * 3_600_000;
}

function ouvrirEnLecture(repertoireEtat: string): Journal {
  try {
    return ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch (erreur) {
    throw new LectureImpossible(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

function photographier(journal: Journal, env: Record<string, string | undefined>, jours: number, ageMaxSauvegardeMs: number, maintenant: Date): { lignes: string[]; dernierSeq: number } {
  let etat;
  try {
    etat = lireEtat(journal, maintenant);
  } catch (erreur) {
    // En lecture seule, rien ne crée les tables d'un journal écrit par un
    // runtime d'avant ces projections, ni ne leur donne leur forme du jour.
    if (journalPasRejoue(erreur)) {
      throw new LectureImpossible(1, "ce journal n'a pas encore tout l'état que `status` lit : redémarrer le runtime, qui le recalcule");
    }
    throw erreur;
  }
  const lignes = decrireEtat(etat, maintenant, ageMaxSauvegardeMs, pauseDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), appelsDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()), retenueDeLaStation(env.BRIGADE_STATION_DIR, maintenant.getTime()));
  lignes.push("", direEntreesEn(entreesParType(journal.base, new Date(maintenant.getTime() - jours * 86_400_000), maintenant), jours));
  return { lignes, dernierSeq: etat.dernierSeq };
}

if (import.meta.main) await enProcess(principal);
