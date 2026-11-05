// Les appels GitHub de la box, comptés par l'identité sous laquelle ils partent
// (#2316) : l'App du cook, de la pass, du manager, ou le compte du chef — le
// `gh` de la machine, qui s'authentifie seul. L'identité d'un appel est le
// compte dont son client porte le jeton (`compte` d'`appelerGitHub`, dans
// `limite-github.ts`) : un rôle, ou, sans jeton, celui de la machine.
//
// `status` les dit, avec le mode que la cuisine a annoncé en démarrant
// (`station/cuisine.ts`, `main.ts`) : une identité par rôle, ou l'identité
// unique. Le chef y lit que son compte n'est plus celui de la cuisine.
//
// Choix : un compte cumulé, jamais remis à zéro — ni par l'heure qui passe
// (le compteur de `limite-github.ts` fait la fenêtre), ni par une lecture.
// Il vit dans le répertoire de la station (`<BRIGADE_STATION_DIR>/appels-github/
// identites.db`), à côté du compteur ; hors station, dans celui du projet
// (`<BRIGADE_STATE_DIR>/appels-par-identite.db`) ; hors des deux, en mémoire.
// Rien n'y entre que des nombres et des noms de rôle : ni jeton, ni clé, ni
// login. `compter` ne lève jamais : ce qui se compte n'arrête aucun appel.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";
import type { Role } from "./identites.ts";
import { REPERTOIRE_COMPTEUR } from "./limite-github.ts";

// Les rôles qui ont leur App, ceux d'`identites.ts` (`ROLES`), tenus ici :
// `limite-github.ts` importe ce module, et `identites.ts` l'importe par
// `github.ts` — un import de `ROLES` se lirait avant d'être évalué. Un test
// les garde égaux.
export const ROLES_DES_APPS = ["cook", "pass", "manager"] as const satisfies readonly Role[];
// Le compte du chef : celui de la machine, sous lequel part tout appel sans jeton de rôle.
export const COMPTE_DU_CHEF = "chef";
export type Identite = Role | typeof COMPTE_DU_CHEF;
export const IDENTITES: readonly Identite[] = [...ROLES_DES_APPS, COMPTE_DU_CHEF];

const FICHIER_DE_LA_STATION = "identites.db";
const FICHIER_DU_PROJET = "appels-par-identite.db";

const TABLES =
  "CREATE TABLE IF NOT EXISTS appels (identite TEXT PRIMARY KEY, appels INTEGER NOT NULL DEFAULT 0);" +
  "CREATE TABLE IF NOT EXISTS mode (projet TEXT PRIMARY KEY, roles INTEGER NOT NULL);";

// L'identité d'un appel : le rôle dont son client porte le jeton ; tout autre
// compte — celui de la machine — est celui du chef.
export const identiteDuCompte = (compte: string | undefined): Identite => (ROLES_DES_APPS as readonly string[]).includes(compte ?? "") ? (compte as Role) : COMPTE_DU_CHEF;

export type AppelsParIdentite = Record<Identite, number>;
// `roles` : la cuisine du projet a annoncé une identité par rôle.
export type Lecture = { roles: boolean; appels: AppelsParIdentite };

export type Compteur = {
  // Un appel part sous le compte `compte`.
  compter(compte: string | undefined): void;
  // La cuisine de `projet` démarre, sous une identité par rôle ou non.
  noterLeMode(projet: string, roles: boolean): void;
  lire(projet: string): Lecture;
  fermer(): void;
};

const sansLever = (faire: () => unknown): void => {
  try {
    faire();
  } catch {}
};

const lectureDe = (base: Base, projet: string): Lecture => {
  const appels = Object.fromEntries(IDENTITES.map((identite) => [identite, 0])) as AppelsParIdentite;
  for (const { identite, n } of base.lire<{ identite: string; n: number }>("SELECT identite, appels AS n FROM appels")) {
    if ((IDENTITES as readonly string[]).includes(identite)) appels[identite as Identite] = Number(n);
  }
  const [mode] = base.lire<{ roles: number }>("SELECT roles FROM mode WHERE projet = ?", projet);
  return { roles: mode?.roles === 1, appels };
};

export function ouvrirCompteur(options: { fichier?: string } = {}): Compteur {
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: 10_000 });
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(TABLES);
  return {
    compter(compte) {
      sansLever(() =>
        base.executer("INSERT INTO appels (identite, appels) VALUES (?, 1) ON CONFLICT (identite) DO UPDATE SET appels = appels + 1", identiteDuCompte(compte)),
      );
    },
    noterLeMode(projet, roles) {
      sansLever(() => base.executer("INSERT INTO mode (projet, roles) VALUES (?, ?) ON CONFLICT (projet) DO UPDATE SET roles = excluded.roles", projet, roles ? 1 : 0));
    },
    lire: (projet) => lectureDe(base, projet),
    fermer: () => base.fermer(),
  };
}

// Où vit le compteur de cet environnement : la station, sinon le projet ; null hors des deux.
function fichierDe(env: Record<string, string | undefined>): { repertoire: string; fichier: string } | null {
  if (env.BRIGADE_STATION_DIR) {
    const repertoire = join(env.BRIGADE_STATION_DIR, REPERTOIRE_COMPTEUR);
    return { repertoire, fichier: join(repertoire, FICHIER_DE_LA_STATION) };
  }
  if (env.BRIGADE_STATE_DIR) return { repertoire: env.BRIGADE_STATE_DIR, fichier: join(env.BRIGADE_STATE_DIR, FICHIER_DU_PROJET) };
  return null;
}

export function compteurDe(env: Record<string, string | undefined>): Compteur {
  const lieu = fichierDe(env);
  if (lieu === null) return ouvrirCompteur();
  try {
    mkdirSync(lieu.repertoire, { recursive: true });
    return ouvrirCompteur({ fichier: lieu.fichier });
  } catch {
    return ouvrirCompteur();
  }
}

let duProcess: Compteur | null = null;

// Celui que prend `appelerGitHub` : celui de l'environnement de ce process.
export function compteurDuProcess(): Compteur {
  duProcess ??= compteurDe(process.env);
  return duProcess;
}

// Le ferme : le prochain appel en rouvre un. Pour un test qui efface ensuite la
// station : sous Windows, un répertoire qui garde une base ouverte ne s'efface pas.
export function fermerLeCompteurDuProcess(): void {
  duProcess?.fermer();
  duProcess = null;
}

// Ce que la cuisine de `projet` annonce en démarrant, retenu pour `status`.
export function noterLeModeDesIdentites(env: Record<string, string | undefined>, projet: string, roles: boolean): void {
  sansLever(() => {
    const compteur = compteurDe(env);
    try {
      compteur.noterLeMode(projet, roles);
    } finally {
      compteur.fermer();
    }
  });
}

// Ce que `status` lit, sans rien écrire ni rien créer : sans compteur, ou s'il
// ne se lit pas, l'identité unique et aucun appel.
export function lireAppelsParIdentite(env: Record<string, string | undefined>, projet: string): Lecture {
  const lieu = fichierDe(env);
  if (lieu !== null && existsSync(lieu.fichier)) {
    let base: Base | undefined;
    try {
      base = new Base(lieu.fichier, { lectureSeule: true, attenteMs: 2000 });
      return lectureDe(base, projet);
    } catch {
      // Un compteur qui ne se lit pas ne coûte rien à `status`.
    } finally {
      base?.fermer();
    }
  }
  return { roles: false, appels: Object.fromEntries(IDENTITES.map((identite) => [identite, 0])) as AppelsParIdentite };
}

const NOMS: Record<Identite, string> = { cook: "cook", pass: "pass", manager: "manager", chef: "chef's account" };

// Les lignes de `status` : le mode, puis le compte de chaque identité.
export function direLesAppelsParIdentite({ roles, appels }: Lecture): string[] {
  return [
    roles ? "GitHub — one identity per role" : "GitHub — single identity, the machine's `gh`: the chef's account is the kitchen's, nothing reserves the merge for the pass",
    `calls by identity: ${IDENTITES.map((identite) => `${NOMS[identite]} ${appels[identite]}`).join(", ")}`,
  ];
}
