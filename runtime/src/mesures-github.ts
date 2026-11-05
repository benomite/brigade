// Ce que `measures` dit de GitHub sur les sept derniers jours : les minutes où
// le compte était limité, et le pic d'écritures à la minute. L'épique veut zéro
// minute limitée, et le pic à côté pour savoir de combien on est loin du plafond.
//
// Le relevé est celui du compte, pas du projet : il vit dans le répertoire de la
// station (`<BRIGADE_STATION_DIR>/appels-github/minutes.db`), à côté du compteur
// et de l'état des limites. Une ligne par minute touchée : combien d'écritures
// ont quitté la couche d'appel (une fois la pause passée), et si le compte était
// limité. Ni `noterEcriture` ni `noterLimite` ne lèvent : ce qui se mesure
// n'arrête jamais un appel.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";
import { REPERTOIRE_COMPTEUR } from "./limite-github.ts";

const FICHIER_MINUTES = "minutes.db";
const MINUTE_MS = 60_000;
export const FENETRE_DU_RELEVE_MS = 7 * 24 * 60 * MINUTE_MS;

export type MesuresGitHub = {
  // Une écriture GitHub part, à l'instant `maintenant()`.
  noterEcriture(): void;
  // Le compte est limité de `depuis` à `reprise` (ms) : chaque minute de l'épisode compte.
  noterLimite(depuis: number, reprise: number): void;
  fermer(): void;
};

export type ReleveGitHub = { minutesLimitees: number; pointEcritures: number };

const TABLE = "CREATE TABLE IF NOT EXISTS minutes (minute INTEGER PRIMARY KEY, ecritures INTEGER NOT NULL DEFAULT 0, limitee INTEGER NOT NULL DEFAULT 0);";

const sansLever = (faire: () => unknown): void => {
  try {
    faire();
  } catch {}
};

const minuteDe = (instant: number): number => Math.floor(instant / MINUTE_MS);

export function ouvrirMesuresGitHub(options: { fichier?: string; maintenant?: () => number } = {}): MesuresGitHub {
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: 10_000 });
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(TABLE);
  // Ce qui sort de la fenêtre s'oublie, au plus une fois par minute.
  let elaguee = -1;
  const elaguer = () => {
    const minute = minuteDe(maintenant());
    if (minute === elaguee) return;
    elaguee = minute;
    base.executer("DELETE FROM minutes WHERE minute < ?", minute - FENETRE_DU_RELEVE_MS / MINUTE_MS);
  };
  return {
    noterEcriture() {
      sansLever(() => {
        elaguer();
        base.executer(
          "INSERT INTO minutes (minute, ecritures) VALUES (?, 1) ON CONFLICT (minute) DO UPDATE SET ecritures = ecritures + 1",
          minuteDe(maintenant()),
        );
      });
    },
    noterLimite(depuis, reprise) {
      sansLever(() => {
        elaguer();
        const premiere = minuteDe(depuis);
        const derniere = Math.max(premiere, minuteDe(reprise - 1));
        base.transaction(() => {
          for (let minute = premiere; minute <= derniere; minute++) {
            base.executer("INSERT INTO minutes (minute, limitee) VALUES (?, 1) ON CONFLICT (minute) DO UPDATE SET limitee = 1", minute);
          }
        });
      });
    },
    fermer: () => base.fermer(),
  };
}

// Les mesures de la station dont `racine` est le répertoire.
export function mesuresGitHubDeLaStation(racine: string, options: { maintenant?: () => number } = {}): MesuresGitHub {
  const repertoire = join(racine, REPERTOIRE_COMPTEUR);
  mkdirSync(repertoire, { recursive: true });
  return ouvrirMesuresGitHub({ ...options, fichier: join(repertoire, FICHIER_MINUTES) });
}

let duProcess: MesuresGitHub | null = null;

// Celles que prend `github.ts` : celles de la station dont ce process a
// l'environnement (`BRIGADE_STATION_DIR`), sinon un relevé en mémoire.
export function mesuresGitHubDuProcess(): MesuresGitHub {
  if (duProcess === null) {
    const racine = process.env.BRIGADE_STATION_DIR;
    duProcess = racine ? mesuresGitHubDeLaStation(racine) : ouvrirMesuresGitHub();
  }
  return duProcess;
}

// Les ferme : le prochain appel en rouvre. Pour un test qui efface ensuite la
// station : sous Windows, un répertoire qui garde une base ouverte ne s'efface pas.
export function fermerLesMesuresDuProcess(): void {
  duProcess?.fermer();
  duProcess = null;
}

// Le relevé des sept derniers jours, en lecture seule : rien n'est écrit ni créé.
// null si la station n'a rien relevé ou si le relevé ne se lit pas.
export function releveGitHubDeLaStation(racine: string | undefined, maintenant: number): ReleveGitHub | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_MINUTES);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    return releveDes(base, maintenant);
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

export function releveDes(base: Base, maintenant: number): ReleveGitHub {
  const depuis = minuteDe(maintenant - FENETRE_DU_RELEVE_MS);
  const [ligne] = base.lire<{ limitees: number | null; pic: number | null }>(
    "SELECT sum(limitee) AS limitees, max(ecritures) AS pic FROM minutes WHERE minute > ? AND minute <= ?",
    depuis,
    minuteDe(maintenant),
  );
  return { minutesLimitees: Number(ligne?.limitees ?? 0), pointEcritures: Number(ligne?.pic ?? 0) };
}

export function direLeReleveGitHub(releve: ReleveGitHub): string[] {
  return [
    `GitHub, last 7 days: ${releve.minutesLimitees} rate-limited minute${releve.minutesLimitees === 1 ? "" : "s"}`,
    `GitHub, last 7 days: peak of ${releve.pointEcritures} write${releve.pointEcritures === 1 ? "" : "s"} per minute`,
  ];
}
