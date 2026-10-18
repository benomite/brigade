// Le budget d'appels à GitHub : au plus 2 500 par heure glissante, la moitié
// de la limite du compte (5 000/h), pour la station et tous ses projets
// ensemble. Le sondage des issues (`github.ts`) et le canal du gist
// (`appairage/canal.ts`) prennent un appel ici avant de lancer `gh` ; au-delà
// du budget, l'appel est refusé — il ne part pas, et l'appelant échoue comme
// sur une panne de GitHub, que son prochain tour rattrape.
//
// Choix : un compteur partagé, pas un budget par process. Il vit dans le
// répertoire de la station (`<BRIGADE_STATION_DIR>/appels-github/`), une
// base SQLite où chaque appel émis laisse son instant : tout process qui la
// tient — la station et les projets qu'elle sert, un runtime ou une commande
// lancés avec son environnement — compte dans le même budget, et une
// transaction (BEGIN IMMEDIATE) tranche entre deux process qui prennent le
// dernier appel au même instant. Un budget par process aurait demandé de
// découper 2 500 en parts fixes, perdues pour le projet qui sonde beaucoup
// quand un autre dort, et faussées dès que le nombre de projets change ; le
// compteur partagé tient le plafond quel que soit ce nombre.
//
// Hors de toute station (le poste de dev, un test), le process compte seul,
// en mémoire, sous le même budget.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";

// L'ensemble des appels de la station et de ses projets, sur une heure glissante.
export const BUDGET_PAR_HEURE = 2500;
export const FENETRE_MS = 60 * 60_000;
// Le compteur partagé, dans le répertoire de la station : une base et ses
// fichiers de journal, qui changent à chaque appel.
export const REPERTOIRE_COMPTEUR = "appels-github";
const FICHIER_COMPTEUR = "compteur.db";

// Un appel refusé : le budget de l'heure glissante est épuisé. `libreDansMs` :
// dans combien de temps le plus ancien appel compté sort de la fenêtre.
export class BudgetGitHubEpuise extends Error {
  readonly libreDansMs: number;
  constructor(budget: number, libreDansMs: number) {
    super(`budget GitHub épuisé : ${budget} appels sur l'heure glissante, appel refusé — le prochain se libère dans ${Math.ceil(libreDansMs / 1000)} s`);
    this.name = "BudgetGitHubEpuise";
    this.libreDansMs = libreDansMs;
  }
}

// GitHub a dit que sa limite est atteinte (429, ou 403 « rate limit », primaire
// ou secondaire) : plus aucun appel ne part avant `jusqua`, la fin de la
// fenêtre. Une erreur propre, jamais prise pour un autre refus (celui d'un merge).
export class LimiteGitHubAtteinte extends Error {
  readonly jusqua: number;
  readonly libreDansMs: number;
  constructor(jusqua: number, libreDansMs: number) {
    super("GitHub a atteint sa limite d'appels : plus aucun appel ne part avant la fin de la fenêtre, puis ils reprennent seuls");
    this.name = "LimiteGitHubAtteinte";
    this.jusqua = jusqua;
    this.libreDansMs = libreDansMs;
  }
}

export type Limite = {
  readonly budget: number;
  // Compte un appel, ou lève `BudgetGitHubEpuise` sans le compter — et
  // `LimiteGitHubAtteinte` tant que GitHub a dit sa limite atteinte.
  prendre(): void;
  // GitHub a dit sa limite atteinte : plus d'appel avant cet instant (en
  // millisecondes), pour tous ceux qui tiennent ce compteur.
  suspendre(jusqua: number): void;
  // Les appels comptés sur l'heure écoulée, par tous ceux qui tiennent ce compteur.
  appels(): number;
  fermer(): void;
};

export type OptionsLimite = {
  // La base du compteur ; absente, un compteur en mémoire, propre au process.
  fichier?: string;
  budget?: number;
  // En millisecondes. Par défaut, l'horloge du système.
  maintenant?: () => number;
};

// Le temps qu'un autre process tienne le compteur : une transaction y dure
// quelques millisecondes.
const ATTENTE_MS = 10_000;

export function ouvrirLimite(options: OptionsLimite = {}): Limite {
  const budget = options.budget ?? BUDGET_PAR_HEURE;
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: ATTENTE_MS });
  // Un compte perdu dans une coupure de courant ne coûte qu'un peu de marge :
  // aucune écriture n'attend le disque.
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script("CREATE TABLE IF NOT EXISTS appels (instant INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS appels_par_instant ON appels (instant); CREATE TABLE IF NOT EXISTS pause (jusqua INTEGER NOT NULL);");

  return {
    budget,
    prendre() {
      const refus = base.transaction((): { jusqua: number } | { budget: number } | null => {
        const instant = maintenant();
        // La limite de GitHub atteinte : rien ne part, et rien n'est compté.
        const [pause] = base.lire<{ jusqua: number | null }>("SELECT max(jusqua) AS jusqua FROM pause");
        if (pause?.jusqua != null && pause.jusqua > instant) return { jusqua: pause.jusqua };
        // Ce qui est sorti de la fenêtre ne compte plus : rien ne le relira.
        base.executer("DELETE FROM appels WHERE instant <= ?", instant - FENETRE_MS);
        const [compte] = base.lire<{ n: number; premier: number | null }>("SELECT count(*) AS n, min(instant) AS premier FROM appels");
        if ((compte?.n ?? 0) >= budget) return { budget: Math.max(0, (compte?.premier ?? instant) + FENETRE_MS - instant) };
        base.executer("INSERT INTO appels (instant) VALUES (?)", instant);
        return null;
      });
      if (refus === null) return;
      if ("jusqua" in refus) throw new LimiteGitHubAtteinte(refus.jusqua, Math.max(0, refus.jusqua - maintenant()));
      throw new BudgetGitHubEpuise(budget, refus.budget);
    },
    suspendre(jusqua) {
      base.transaction(() => {
        const instant = maintenant();
        // Une pause plus longue déjà posée par un autre process reste.
        base.executer("DELETE FROM pause WHERE jusqua <= ? OR jusqua <= ?", instant, jusqua);
        base.executer("INSERT INTO pause (jusqua) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM pause)", jusqua);
      });
    },
    appels() {
      const [compte] = base.lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE instant > ?", maintenant() - FENETRE_MS);
      return compte?.n ?? 0;
    },
    fermer: () => base.fermer(),
  };
}

// Le compteur partagé de la station dont `racine` est le répertoire.
export function limiteDeLaStation(racine: string, options: Omit<OptionsLimite, "fichier"> = {}): Limite {
  const repertoire = join(racine, REPERTOIRE_COMPTEUR);
  mkdirSync(repertoire, { recursive: true });
  return ouvrirLimite({ ...options, fichier: join(repertoire, FICHIER_COMPTEUR) });
}

let duProcess: Limite | null = null;

// Le compteur de ce process, que la station pose en démarrant.
export function installerLimite(limite: Limite): Limite {
  duProcess = limite;
  return limite;
}

// Le compteur que prennent `github.ts` et le canal quand on ne leur en donne
// pas : celui que la station a posé ; sinon celui de la station dont ce
// process a l'environnement (`BRIGADE_STATION_DIR`) ; sinon un compteur en
// mémoire, propre au process.
export function limiteDuProcess(): Limite {
  if (duProcess === null) {
    const racine = process.env.BRIGADE_STATION_DIR;
    duProcess = racine ? limiteDeLaStation(racine) : ouvrirLimite();
  }
  return duProcess;
}

// Une fois par heure, la ligne qui mesure en conditions réelles : les appels
// comptés sur l'heure écoulée. Rend de quoi l'arrêter.
export function journaliserLesAppels(limite: Limite, options: { dire: (ligne: string) => void; intervalleMs?: number }): () => void {
  const minuterie = setInterval(() => {
    try {
      options.dire(`brigade : ${limite.appels()} appels GitHub sur l'heure écoulée`);
    } catch (erreur) {
      options.dire(`brigade : appels GitHub de l'heure écoulée non comptés — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }, options.intervalleMs ?? FENETRE_MS);
  minuterie.unref();
  return () => clearInterval(minuterie);
}

// Une réponse de GitHub, telle que `gh api -i` la rend.
export type ReponseHttp = { statut: number; entetes: Map<string, string>; corps: string };

// Vrai si GitHub refuse pour sa limite d'appels : un 429, ou un 403 qui le dit
// (en-tête `retry-after`, quota à zéro, ou « rate limit » dans le message).
// Tout autre refus — le 403 d'un merge interdit, par exemple — n'en est pas un.
export function refusPourLimite(reponse: ReponseHttp): boolean {
  if (reponse.statut === 429) return true;
  if (reponse.statut !== 403) return false;
  if (reponse.entetes.has("retry-after") || reponse.entetes.get("x-ratelimit-remaining") === "0") return true;
  let message = reponse.corps;
  try {
    const dit = (JSON.parse(reponse.corps) as { message?: unknown }).message;
    if (typeof dit === "string") message = dit;
  } catch {}
  return /rate limit/i.test(message);
}

// À défaut d'attente donnée par GitHub.
export const ATTENTE_PAR_DEFAUT_MS = 60_000;
const DELAI_RATE_LIMIT_MS = 10_000;

// Ce que `gh api rate_limit` dit de la fin de fenêtre : cet appel ne compte pas
// dans la limite de GitHub. Null s'il ne répond pas, ou ne dit rien d'exploitable.
function finDeFenetreDite(options: { gh: string; env?: NodeJS.ProcessEnv; maintenant: number }): Promise<number | null> {
  return new Promise((resoudre) => {
    execFile(options.gh, ["api", "rate_limit"], { timeout: DELAI_RATE_LIMIT_MS, maxBuffer: 1024 * 1024, env: options.env }, (erreur, sortie) => {
      if (erreur) return resoudre(null);
      try {
        const ressources = Object.values((JSON.parse(sortie) as { resources?: Record<string, { remaining?: unknown; reset?: unknown }> }).resources ?? {});
        const fins = ressources.flatMap((r) => (r.remaining === 0 && typeof r.reset === "number" && r.reset * 1000 > options.maintenant ? [r.reset * 1000] : []));
        resoudre(fins.length > 0 ? Math.max(...fins) : null);
      } catch {
        resoudre(null);
      }
    });
  });
}

// GitHub a refusé pour sa limite : pose la pause sur le compteur, jusqu'à la
// fin de la fenêtre — `retry-after`, sinon `x-ratelimit-reset`, sinon ce que
// dit `gh api rate_limit`, sinon 60 s — et rend l'erreur à lever.
export async function constaterLimite(limite: Limite, reponse: ReponseHttp, options: { gh: string; env?: NodeJS.ProcessEnv; maintenant?: () => number }): Promise<LimiteGitHubAtteinte> {
  const maintenant = options.maintenant ?? (() => Date.now());
  const instant = maintenant();
  const retry = Number(reponse.entetes.get("retry-after"));
  const reset = Number(reponse.entetes.get("x-ratelimit-reset"));
  let jusqua: number | null = null;
  if (reponse.entetes.has("retry-after") && Number.isFinite(retry) && retry >= 0) jusqua = instant + retry * 1000;
  else if (reponse.entetes.has("x-ratelimit-reset") && Number.isFinite(reset) && reset * 1000 > instant) jusqua = reset * 1000;
  jusqua ??= await finDeFenetreDite({ gh: options.gh, env: options.env, maintenant: instant });
  jusqua ??= instant + ATTENTE_PAR_DEFAUT_MS;
  limite.suspendre(jusqua);
  return new LimiteGitHubAtteinte(jusqua, Math.max(0, jusqua - instant));
}

// La pause que GitHub a posée sur le compteur de la station dont `racine` est le
// répertoire, lue sans rien écrire ni rien créer : l'instant de reprise (en
// millisecondes), ou null s'il n'y en a pas — ou si le compteur ne se lit pas,
// ce que `status` ne doit jamais payer.
export function pauseDeLaStation(racine: string | undefined, maintenant: number): number | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    const [pause] = base.lire<{ jusqua: number | null }>("SELECT max(jusqua) AS jusqua FROM pause");
    return pause?.jusqua != null && pause.jusqua > maintenant ? pause.jusqua : null;
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// La ligne qui le dit, en une phrase, l'heure étant celle de ce process.
export function direLaLimite(jusqua: number): string {
  const d = new Date(jusqua);
  return `GitHub is rate-limiting calls, back around ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
