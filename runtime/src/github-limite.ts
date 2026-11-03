// Quelle limite GitHub impose au compte, depuis quand, et jusqu'à quand : la
// limite primaire (le quota horaire épuisé), ou l'une des limites secondaires —
// trop d'écritures à la minute, trop de requêtes simultanées. `limite-github.ts`
// suspend les appels de la cuisine ; ce module nomme la limite, pour que le chef
// la lise (`status`, et l'entrée `github` de `faits`).
//
// L'état est celui du compte, pas du projet : il vit dans le répertoire de la
// station (`<BRIGADE_STATION_DIR>/appels-github/limites.db`), à côté du
// compteur, et tous les projets qu'elle sert le lisent. Une ligne par compte
// limité ; elle tombe d'elle-même quand la reprise est passée et qu'un appel de
// ce compte a abouti. Hors de toute station, le process le tient en mémoire.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";
import { ATTENTE_PAR_DEFAUT_MS, REPERTOIRE_COMPTEUR, type ReponseHttp } from "./limite-github.ts";

const FICHIER_LIMITES = "limites.db";

export const SORTES_DE_LIMITE = ["primary", "secondary-writes", "secondary-concurrency"] as const;
export type SorteDeLimite = (typeof SORTES_DE_LIMITE)[number];

// L'entrée `github` de `faits` : la limite, l'instant où GitHub l'a dite, et
// celui où il rend les appels (ISO).
export type LimiteDuCompte = { limit: SorteDeLimite; since: string; backAt: string };

// Ce qu'une réponse de refus dit de la limite, en millisecondes.
export type LimiteLue = { sorte: SorteDeLimite; depuis: number; reprise: number };

const messageDe = (corps: string): string => {
  try {
    const dit = (JSON.parse(corps) as { message?: unknown }).message;
    if (typeof dit === "string") return dit;
  } catch {}
  return corps;
};

// La sorte d'une limite que GitHub a dite (la réponse est un refus pour limite,
// `refusPourLimite`). Le message de GitHub d'abord : « secondary rate limit »,
// et parmi elles « concurrent » ou « content creation » ; à défaut, un quota à
// zéro ou « API rate limit exceeded » disent la primaire. Une limite secondaire
// que le message ne précise pas se lit sur la requête : une écriture a heurté la
// limite des écritures à la minute, une lecture celle des requêtes simultanées.
export function sorteDeLaLimite(reponse: ReponseHttp, ecriture = false): SorteDeLimite {
  const message = messageDe(reponse.corps);
  const secondaire = /secondary rate limit/i.test(message);
  if (/concurren/i.test(message)) return "secondary-concurrency";
  if (/content creation|writes?\b/i.test(message) && secondaire) return "secondary-writes";
  if (!secondaire && (reponse.entetes.get("x-ratelimit-remaining") === "0" || /API rate limit exceeded/i.test(message))) return "primary";
  return ecriture ? "secondary-writes" : "secondary-concurrency";
}

// La limite que dit une réponse de refus : sa sorte, son instant — l'en-tête
// `date` de la réponse, sinon `maintenant` —, et la reprise — `retry-after`
// (secondes ou date HTTP), sinon `x-ratelimit-reset`, sinon `repli` (la pause
// que la box a posée), sinon une minute.
export function lireLaLimite(reponse: ReponseHttp, options: { ecriture?: boolean; maintenant: number; repli?: number }): LimiteLue {
  const date = Date.parse(reponse.entetes.get("date") ?? "");
  const depuis = Number.isFinite(date) ? date : options.maintenant;
  const retry = reponse.entetes.get("retry-after");
  const reset = Number(reponse.entetes.get("x-ratelimit-reset"));
  let reprise: number | null = null;
  if (retry !== undefined) {
    const secondes = Number(retry);
    const quand = Date.parse(retry);
    if (retry.trim() !== "" && Number.isFinite(secondes) && secondes >= 0) reprise = depuis + secondes * 1000;
    else if (Number.isFinite(quand)) reprise = quand;
  }
  if (reprise === null && reponse.entetes.has("x-ratelimit-reset") && Number.isFinite(reset) && reset * 1000 > depuis) reprise = reset * 1000;
  reprise ??= options.repli ?? depuis + ATTENTE_PAR_DEFAUT_MS;
  return { sorte: sorteDeLaLimite(reponse, options.ecriture), depuis, reprise };
}

// Ni `constater` ni `aboutir` ne lèvent : ce qui se dit au chef n'arrête jamais un appel.
export type LimitesDuCompte = {
  // GitHub a refusé un appel de ce compte pour sa limite. Un compte déjà limité
  // garde son `since` ; la sorte est celle du dernier refus, la reprise la plus lointaine.
  constater(compte: string, limite: LimiteLue): void;
  // Un appel de ce compte a abouti : sa limite tombe, si sa reprise est passée.
  aboutir(compte: string): void;
  // La limite du compte qui reprend le plus tard, ou null.
  courante(): LimiteDuCompte | null;
  fermer(): void;
};

type LigneLue = { sorte: string; depuis: number; reprise: number };

const TABLE = "CREATE TABLE IF NOT EXISTS limites (compte TEXT PRIMARY KEY, sorte TEXT NOT NULL, depuis INTEGER NOT NULL, reprise INTEGER NOT NULL);";
const LA_PLUS_LONGUE = "SELECT sorte, depuis, reprise FROM limites ORDER BY reprise DESC, compte ASC LIMIT 1";

const enEntree = (ligne: LigneLue | undefined): LimiteDuCompte | null =>
  ligne === undefined || !(SORTES_DE_LIMITE as readonly string[]).includes(ligne.sorte)
    ? null
    : { limit: ligne.sorte as SorteDeLimite, since: new Date(ligne.depuis).toISOString(), backAt: new Date(ligne.reprise).toISOString() };

const sansLever = (faire: () => unknown): void => {
  try {
    faire();
  } catch {}
};

export function ouvrirLimitesDuCompte(options: { fichier?: string; maintenant?: () => number } = {}): LimitesDuCompte {
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: 10_000 });
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(TABLE);
  return {
    constater(compte, { sorte, depuis, reprise }) {
      sansLever(() => base.executer(
        `INSERT INTO limites (compte, sorte, depuis, reprise) VALUES (?, ?, ?, ?)
         ON CONFLICT (compte) DO UPDATE SET sorte = excluded.sorte, reprise = max(limites.reprise, excluded.reprise)`,
        compte,
        sorte,
        depuis,
        reprise,
      ));
    },
    aboutir(compte) {
      // Une lecture d'abord : presque toujours, rien n'est limité, et rien ne s'écrit.
      const instant = maintenant();
      sansLever(() => {
        if (base.lire("SELECT 1 FROM limites WHERE compte = ? AND reprise <= ?", compte, instant).length === 0) return;
        base.executer("DELETE FROM limites WHERE compte = ? AND reprise <= ?", compte, instant);
      });
    },
    courante: () => enEntree(base.lire<LigneLue>(LA_PLUS_LONGUE)[0]),
    fermer: () => base.fermer(),
  };
}

// L'état des limites de la station dont `racine` est le répertoire.
export function limitesDeLaStation(racine: string, options: { maintenant?: () => number } = {}): LimitesDuCompte {
  const repertoire = join(racine, REPERTOIRE_COMPTEUR);
  mkdirSync(repertoire, { recursive: true });
  return ouvrirLimitesDuCompte({ ...options, fichier: join(repertoire, FICHIER_LIMITES) });
}

let duProcess: LimitesDuCompte | null = null;

// Celui que prend `github.ts` quand on ne lui en donne pas : celui de la station
// dont ce process a l'environnement (`BRIGADE_STATION_DIR`), sinon un état en
// mémoire, propre au process.
export function limitesDuProcess(): LimitesDuCompte {
  if (duProcess === null) {
    const racine = process.env.BRIGADE_STATION_DIR;
    duProcess = racine ? limitesDeLaStation(racine) : ouvrirLimitesDuCompte();
  }
  return duProcess;
}

// La limite du compte que lit la station dont `racine` est le répertoire, sans
// rien écrire ni rien créer : null s'il n'y en a pas, ou si l'état ne se lit
// pas — ce que `status` et `faits` ne doivent jamais payer.
export function limiteDuCompteDeLaStation(racine: string | undefined): LimiteDuCompte | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_LIMITES);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    return enEntree(base.lire<LigneLue>(LA_PLUS_LONGUE)[0]);
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

const NOMS: Record<SorteDeLimite, string> = {
  primary: "primary limit (hourly quota)",
  "secondary-writes": "secondary limit (writes per minute)",
  "secondary-concurrency": "secondary limit (concurrent requests)",
};

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// La ligne `github` de `status`, l'heure étant celle de ce process.
export function direLaLimiteDuCompte(limite: LimiteDuCompte): string {
  return `GitHub is rate-limiting calls: ${NOMS[limite.limit]}, since ${hhmm(limite.since)}, back around ${hhmm(limite.backAt)}`;
}
