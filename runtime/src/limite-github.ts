// Les appels de la box à GitHub, réglés sur le quota réel du compte : ce que
// GitHub dit lui rester (`x-ratelimit-remaining`, `x-ratelimit-limit`,
// `x-ratelimit-reset`, à chaque réponse de `gh api -i`, et `gh api rate_limit`
// quand il faut le confirmer). C'est la seule référence : le compte est partagé
// avec le Mac du chef, et ce que la box a compté de son côté n'en dit qu'une
// part. Le sondage des issues (`github.ts`) et le canal du gist
// (`appairage/canal.ts`) prennent un appel ici avant de lancer `gh`.
//
// Deux sortes d'appels. Ceux de la cuisine — sondages, pass, manager, signe de
// vie — ralentissent à mesure que le quota réel baisse : au-dessus de la moitié,
// rien ne les retient ; en dessous, ils se répartissent sur ce qui reste de la
// fenêtre de GitHub ; à la réserve des gestes (un dixième du quota), ils
// attendent la fin de la fenêtre, puis reprennent seuls. Ceux d'un geste du
// chef — merge, retrait du rail, priorité, réponse à une carte, commentaire de
// la pass — ne sont jamais retenus par la box : ils partent, et n'échouent que
// si GitHub lui-même refuse.
//
// Choix : un compteur partagé, pas un état par process. Il vit dans le
// répertoire de la station (`<BRIGADE_STATION_DIR>/appels-github/`), une
// base SQLite où chaque appel émis laisse son instant et où chaque réponse
// laisse le quota que GitHub a dit : tout process qui la tient — la station
// et les projets qu'elle sert, un runtime ou une commande lancés avec son
// environnement — lit le même quota et se règle sur le même débit, et une
// transaction (BEGIN IMMEDIATE) tranche entre deux process qui prennent le
// dernier appel au même instant. Le quota se tient par compte : la machine
// (`gh`), et chaque identité de rôle, dont l'App a le sien.
//
// Un appel sous condition auquel GitHub répond 304 ne lui coûte rien : il sort
// du compte (`rendre`), et seules restent les lectures qui ont dépensé le quota.
//
// Hors de toute station (le poste de dev, un test), le process compte seul,
// en mémoire, sous les mêmes règles.
import { execFile } from "./sans-invite.ts";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";

export const FENETRE_MS = 60 * 60_000;
// Le compteur partagé, dans le répertoire de la station : une base et ses
// fichiers de journal, qui changent à chaque appel.
export const REPERTOIRE_COMPTEUR = "appels-github";
const FICHIER_COMPTEUR = "compteur.db";

// Le compte de la machine : celui du `gh` qui s'authentifie seul, partagé avec le Mac.
export const COMPTE_DE_LA_MACHINE = "gh";
// `cuisine` : un appel du runtime, que la box règle sur le quota réel.
// `geste` : un appel qu'un geste du chef émet, que la box ne retient jamais.
export type Usage = "cuisine" | "geste";

// La part du quota gardée pour les gestes du chef : la cuisine n'y touche pas.
export const RESERVE_DES_GESTES = 0.1;
// En dessous de cette part du quota, la cuisine ralentit.
export const SEUIL_DE_RALENTI = 0.5;
// Le pas sur lequel se mesure le débit de la cuisine, quand elle ralentit.
export const PAS_DU_DEBIT_MS = 60_000;
// Une décision prise sur un quota lu il y a plus longtemps se confirme d'abord
// auprès de `gh api rate_limit` — au plus une fois par pas, par compte.
export const RAFRAICHIR_MS = 60_000;

// Ce que GitHub a dit du quota d'un compte : `restant` appels sur `plafond`
// jusqu'à `reset`, lu à l'instant `vu` (en millisecondes).
export type Quota = { restant: number; plafond: number; reset: number; vu: number };

export const reserveDes = (plafond: number): number => Math.ceil(plafond * RESERVE_DES_GESTES);

// GitHub a dit que sa limite est atteinte (429, ou 403 « rate limit », primaire
// ou secondaire) : plus aucun appel de la cuisine ne part avant `jusqua`, la fin
// de la fenêtre. Une erreur propre, jamais prise pour un autre refus (celui d'un merge).
export class LimiteGitHubAtteinte extends Error {
  readonly jusqua: number;
  readonly libreDansMs: number;
  constructor(jusqua: number, libreDansMs: number, message = "GitHub a atteint sa limite d'appels : plus aucun appel ne part avant la fin de la fenêtre, puis ils reprennent seuls") {
    super(message);
    this.name = "LimiteGitHubAtteinte";
    this.jusqua = jusqua;
    this.libreDansMs = libreDansMs;
  }
}

// Un appel de la cuisine retenu par la box : le quota réel de GitHub baisse, et
// la cuisine ralentit — ou attend la fin de la fenêtre, la réserve des gestes
// atteinte. Il ne part pas, et n'est pas compté ; il est réglé comme la limite
// de GitHub : rien d'autre ne part avant `jusqua` pour qui l'attend.
export class CuisineRalentie extends LimiteGitHubAtteinte {
  readonly quota: Quota;
  constructor(quota: Quota, jusqua: number, libreDansMs: number) {
    const secondes = Math.ceil(libreDansMs / 1000);
    super(
      jusqua,
      libreDansMs,
      quota.restant <= reserveDes(quota.plafond)
        ? `quota GitHub bas : ${quota.restant} appels restants sur ${quota.plafond}, gardés pour les gestes du chef — la cuisine attend la fin de la fenêtre, dans ${secondes} s`
        : `quota GitHub entamé : ${quota.restant} appels restants sur ${quota.plafond} — la cuisine ralentit, son prochain appel part dans ${secondes} s`,
    );
    this.name = "CuisineRalentie";
    this.quota = quota;
  }
}

// Ce qu'un appel dit de lui : le projet qui l'émet, et la sorte de lecture qu'il
// fait (`LECTURES`). Sans lui, l'appel est compté sous le projet « station ».
export type Etiquette = { projet: string; lecture: Lecture };

// Les sortes de lecture, dans le nom stable que `status` et les faits donnent.
export const LECTURES = ["issue-comments", "pull-requests", "issues", "gist", "gesture", "board", "other"] as const;
export type Lecture = (typeof LECTURES)[number];
export const PROJET_DE_LA_STATION = "station";

// La sorte de lecture d'un appel `gh api` : un geste du chef est un geste, quel que
// soit son chemin ; sinon le chemin de l'API (le dernier argument qui en est un) la dit.
export function lectureDe(args: readonly string[], usage: Usage = "cuisine"): Lecture {
  if (usage === "geste") return "gesture";
  const chemin = [...args].reverse().find((arg) => /^\/?(repos|gists?)\b/.test(arg)) ?? "";
  const sansRequete = chemin.replace(/^\//, "").split("?")[0] ?? "";
  if (/^gists?(\/|$)/.test(sansRequete)) return "gist";
  if (/^repos\/[^/]+\/[^/]+\/(issues|pulls)\/[0-9]+\/comments$/.test(sansRequete)) return "issue-comments";
  if (/^repos\/[^/]+\/[^/]+\/(pulls|commits|check-runs)(\/|$)/.test(sansRequete) || /\/(pulls|check-runs|status)(\/|$)/.test(sansRequete)) return "pull-requests";
  if (/^repos\/[^/]+\/[^/]+\/issues(\/|$)/.test(sansRequete)) return "issues";
  return "other";
}

// Les appels comptés sur l'heure écoulée : leur total, et leur répartition par
// projet et par sorte de lecture, le plus gros d'abord (à égalité, par nom).
export type Repartition = {
  total: number;
  parProjet: Array<{ nom: string; appels: number }>;
  parLecture: Array<{ nom: string; appels: number }>;
};

export type Limite = {
  // Compte un appel. Un appel de la cuisine (par défaut) lève
  // `LimiteGitHubAtteinte` sans le compter tant que GitHub a dit sa limite
  // atteinte, et `CuisineRalentie` quand le quota réel du compte (par défaut,
  // celui de la machine) le retient. Un geste n'est jamais retenu. Rend
  // l'appel compté, à `rendre` si GitHub ne le compte pas.
  prendre(usage?: Usage, compte?: string, etiquette?: Etiquette): number;
  // GitHub a répondu 304 à une requête conditionnelle : il ne compte pas cet
  // appel dans son quota, et la box le sort du sien.
  rendre(appel: number): void;
  // GitHub a dit sa limite atteinte : plus d'appel de la cuisine avant cet
  // instant (en millisecondes), pour tous ceux qui tiennent ce compteur.
  suspendre(jusqua: number): void;
  // GitHub a dit le quota d'un compte : il est retenu, à l'instant où il est dit.
  noter(compte: string, quota: Omit<Quota, "vu">): void;
  // Le quota de la fenêtre en cours, ou null s'il n'a pas été dit — ou que sa
  // fenêtre est passée.
  quota(compte?: string): Quota | null;
  // Vrai si une décision sur ce compte se prendrait sur un quota bas lu il y a
  // plus de `RAFRAICHIR_MS` : à confirmer d'abord auprès de GitHub.
  aConfirmer(compte?: string): boolean;
  // Les appels comptés sur l'heure écoulée, par tous ceux qui tiennent ce compteur.
  appels(): number;
  // Les mêmes appels, répartis par projet et par sorte de lecture.
  repartition(): Repartition;
  fermer(): void;
};

export type OptionsLimite = {
  // La base du compteur ; absente, un compteur en mémoire, propre au process.
  fichier?: string;
  // En millisecondes. Par défaut, l'horloge du système.
  maintenant?: () => number;
};

// Le temps qu'un autre process tienne le compteur : une transaction y dure
// quelques millisecondes.
const ATTENTE_MS = 10_000;

type QuotaLu = { restant: number; plafond: number; reset: number; vu: number };

export function ouvrirLimite(options: OptionsLimite = {}): Limite {
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: ATTENTE_MS });
  // Un compte perdu dans une coupure de courant ne coûte qu'un peu de marge :
  // aucune écriture n'attend le disque.
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(
    "CREATE TABLE IF NOT EXISTS appels (instant INTEGER NOT NULL, projet TEXT, lecture TEXT); CREATE INDEX IF NOT EXISTS appels_par_instant ON appels (instant); CREATE TABLE IF NOT EXISTS pause (jusqua INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS quota (compte TEXT PRIMARY KEY, restant INTEGER NOT NULL, plafond INTEGER NOT NULL, reset INTEGER NOT NULL, vu INTEGER NOT NULL);",
  );

  // Un compteur écrit avant la répartition n'a pas ces deux colonnes.
  const colonnes = base.lire<{ name: string }>("PRAGMA table_info(appels)").map((c) => c.name);
  for (const colonne of ["projet", "lecture"]) if (!colonnes.includes(colonne)) base.script(`ALTER TABLE appels ADD COLUMN ${colonne} TEXT;`);

  const quotaDe = (compte: string, instant: number): Quota | null => {
    const [lu] = base.lire<QuotaLu>("SELECT restant, plafond, reset, vu FROM quota WHERE compte = ?", compte);
    return lu !== undefined && lu.reset > instant ? { restant: lu.restant, plafond: lu.plafond, reset: lu.reset, vu: lu.vu } : null;
  };

  // Ce qui retient un appel de la cuisine, d'après le quota réel : l'instant
  // où il pourra partir, ou null s'il part.
  const retenue = (quota: Quota, instant: number): number | null => {
    const reserve = reserveDes(quota.plafond);
    if (quota.restant <= reserve) return quota.reset;
    if (quota.restant > quota.plafond * SEUIL_DE_RALENTI) return null;
    // Ce qui reste au-dessus de la réserve, réparti jusqu'à la fin de la
    // fenêtre : tant d'appels par pas, ou un appel tous les tant de pas.
    const aDepenser = quota.restant - reserve;
    const duree = quota.reset - instant;
    const pas = Math.max(PAS_DU_DEBIT_MS, Math.ceil(duree / aDepenser));
    const permis = Math.max(1, Math.floor((aDepenser * pas) / duree));
    const [recents] = base.lire<{ n: number; premier: number | null }>("SELECT count(*) AS n, min(instant) AS premier FROM appels WHERE instant > ?", instant - pas);
    if ((recents?.n ?? 0) < permis) return null;
    return (recents?.premier ?? instant) + pas;
  };

  return {
    prendre(usage = "cuisine", compte = COMPTE_DE_LA_MACHINE, etiquette) {
      const refus = base.transaction((): { jusqua: number } | { quota: Quota; jusqua: number } | number => {
        const instant = maintenant();
        // Ce qui est sorti de la fenêtre ne compte plus : rien ne le relira.
        base.executer("DELETE FROM appels WHERE instant <= ?", instant - FENETRE_MS);
        if (usage === "cuisine") {
          // La limite de GitHub atteinte : rien ne part, et rien n'est compté.
          const [pause] = base.lire<{ jusqua: number | null }>("SELECT max(jusqua) AS jusqua FROM pause");
          if (pause?.jusqua != null && pause.jusqua > instant) return { jusqua: pause.jusqua };
          const quota = quotaDe(compte, instant);
          const jusqua = quota === null ? null : retenue(quota, instant);
          if (quota !== null && jusqua !== null) return { quota, jusqua };
        }
        return base.executer("INSERT INTO appels (instant, projet, lecture) VALUES (?, ?, ?)", instant, etiquette?.projet ?? PROJET_DE_LA_STATION, etiquette?.lecture ?? (usage === "geste" ? "gesture" : "other")).dernierId;
      });
      if (typeof refus === "number") return refus;
      const libre = Math.max(0, refus.jusqua - maintenant());
      if ("quota" in refus) throw new CuisineRalentie(refus.quota, refus.jusqua, libre);
      throw new LimiteGitHubAtteinte(refus.jusqua, libre);
    },
    rendre(appel) {
      base.executer("DELETE FROM appels WHERE rowid = ?", appel);
    },
    suspendre(jusqua) {
      base.transaction(() => {
        const instant = maintenant();
        // Une pause plus longue déjà posée par un autre process reste.
        base.executer("DELETE FROM pause WHERE jusqua <= ? OR jusqua <= ?", instant, jusqua);
        base.executer("INSERT INTO pause (jusqua) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM pause)", jusqua);
      });
    },
    noter(compte, { restant, plafond, reset }) {
      if (![restant, plafond, reset].every(Number.isFinite) || restant < 0 || plafond <= 0) return;
      const vu = maintenant();
      // Deux réponses de la même fenêtre arrivent dans le désordre : la plus
      // basse dit le vrai. Une fenêtre plus récente, ou la précédente passée,
      // remplace ce qui était retenu.
      base.executer(
        `INSERT INTO quota (compte, restant, plafond, reset, vu) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (compte) DO UPDATE SET restant = excluded.restant, plafond = excluded.plafond, reset = excluded.reset, vu = excluded.vu
         WHERE excluded.reset > quota.reset OR quota.reset <= excluded.vu OR (excluded.reset = quota.reset AND excluded.restant <= quota.restant)`,
        compte,
        restant,
        plafond,
        reset,
        vu,
      );
    },
    quota: (compte = COMPTE_DE_LA_MACHINE) => quotaDe(compte, maintenant()),
    aConfirmer(compte = COMPTE_DE_LA_MACHINE) {
      const instant = maintenant();
      const quota = quotaDe(compte, instant);
      return quota !== null && quota.restant <= quota.plafond * SEUIL_DE_RALENTI && instant - quota.vu > RAFRAICHIR_MS;
    },
    appels() {
      const [compte] = base.lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE instant > ?", maintenant() - FENETRE_MS);
      return compte?.n ?? 0;
    },
    repartition: () => repartitionDe(base, maintenant()),
    fermer: () => base.fermer(),
  };
}

function repartitionDe(base: Base, instant: number): Repartition {
  const depuis = instant - FENETRE_MS;
  const par = (colonne: "projet" | "lecture", defaut: string) =>
    base
      .lire<{ nom: string; appels: number }>(`SELECT COALESCE(${colonne}, ?) AS nom, count(*) AS appels FROM appels WHERE instant > ? GROUP BY nom ORDER BY appels DESC, nom ASC`, defaut, depuis)
      .map(({ nom, appels }) => ({ nom, appels }));
  const parProjet = par("projet", PROJET_DE_LA_STATION);
  return { total: parProjet.reduce((somme, { appels }) => somme + appels, 0), parProjet, parLecture: par("lecture", "other") };
}

// La répartition des appels de la station dont `racine` est le répertoire, lue
// sans rien écrire ni rien créer : null si elle n'a pas de compteur, ou s'il ne
// se lit pas — ce que `status` ne doit jamais payer.
export function appelsDeLaStation(racine: string | undefined, maintenant: number): Repartition | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    return repartitionDe(base, maintenant);
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// Les lignes de `status` : le total de l'heure, puis le projet et la lecture qui en ont fait le plus.
export function direLesAppels(r: Repartition): string[] {
  const [projet] = r.parProjet;
  const [lecture] = r.parLecture;
  return [
    `${r.total} calls in the last hour`,
    ...(projet === undefined || lecture === undefined ? [] : [`most calls: project ${projet.nom} (${projet.appels}), kind ${lecture.nom} (${lecture.appels})`]),
  ];
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
// comptés sur l'heure écoulée, et ce que GitHub dit rester au compte de la
// machine, s'il l'a dit. Rend de quoi l'arrêter.
export function journaliserLesAppels(limite: Limite, options: { dire: (ligne: string) => void; intervalleMs?: number }): () => void {
  const minuterie = setInterval(() => {
    try {
      const quota = limite.quota();
      options.dire(`brigade : ${limite.appels()} appels GitHub sur l'heure écoulée${quota === null ? "" : ` — GitHub en dit ${quota.restant} restants sur ${quota.plafond}`}`);
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

type Ressource = { limit?: unknown; remaining?: unknown; reset?: unknown };

// Les ressources que `gh api rate_limit` décrit : cet appel ne compte pas dans
// la limite de GitHub. Null s'il ne répond pas, ou ne se lit pas.
function ressourcesDites(options: { gh: string; env?: NodeJS.ProcessEnv }): Promise<Record<string, Ressource> | null> {
  return new Promise((resoudre) => {
    execFile(options.gh, ["api", "rate_limit"], { timeout: DELAI_RATE_LIMIT_MS, maxBuffer: 1024 * 1024, env: options.env }, (erreur, sortie) => {
      if (erreur) return resoudre(null);
      try {
        resoudre((JSON.parse(sortie) as { resources?: Record<string, Ressource> }).resources ?? {});
      } catch {
        resoudre(null);
      }
    });
  });
}

// Ce que `gh api rate_limit` dit de la fin de fenêtre. Null s'il ne répond pas,
// ou ne dit rien d'exploitable.
async function finDeFenetreDite(options: { gh: string; env?: NodeJS.ProcessEnv; maintenant: number }): Promise<number | null> {
  const ressources = Object.values((await ressourcesDites(options)) ?? {});
  const fins = ressources.flatMap((r) => (r.remaining === 0 && typeof r.reset === "number" && r.reset * 1000 > options.maintenant ? [r.reset * 1000] : []));
  return fins.length > 0 ? Math.max(...fins) : null;
}

// Le quota que disent les en-têtes d'une réponse, ou null s'ils ne le disent
// pas. Seul celui de l'API REST (`core`) règle les appels : c'est le seul que
// `gh api` dépense.
export function quotaDesEntetes(entetes: Map<string, string>): Omit<Quota, "vu"> | null {
  const ressource = entetes.get("x-ratelimit-resource");
  if (ressource !== undefined && ressource !== "core") return null;
  const [restant, plafond, reset] = ["x-ratelimit-remaining", "x-ratelimit-limit", "x-ratelimit-reset"].map((nom) => (entetes.has(nom) ? Number(entetes.get(nom)) : Number.NaN));
  if (![restant, plafond, reset].every((n) => Number.isSafeInteger(n))) return null;
  return { restant: restant as number, plafond: plafond as number, reset: (reset as number) * 1000 };
}

// Retient le quota que disent les en-têtes d'une réponse, s'ils le disent.
export function noterLesEntetes(limite: Limite, compte: string, entetes: Map<string, string>): void {
  const quota = quotaDesEntetes(entetes);
  if (quota !== null) limite.noter(compte, quota);
}

// Relit le quota du compte auprès de `gh api rate_limit` et le retient : vrai
// s'il l'a dit.
export async function rafraichirLeQuota(limite: Limite, options: { gh: string; env?: NodeJS.ProcessEnv; compte?: string }): Promise<boolean> {
  const core = (await ressourcesDites(options))?.core;
  const [restant, plafond, reset] = [core?.remaining, core?.limit, core?.reset];
  if (typeof restant !== "number" || typeof plafond !== "number" || typeof reset !== "number") return false;
  limite.noter(options.compte ?? COMPTE_DE_LA_MACHINE, { restant, plafond, reset: reset * 1000 });
  return true;
}

// Les confirmations tentées, par compteur et par compte : une relecture qui
// échoue ne se retente pas avant `RAFRAICHIR_MS`.
const confirmations = new WeakMap<Limite, Map<string, number>>();

// Prend un appel, comme `limite.prendre`, et le rend — mais une décision de la cuisine qui
// se prendrait sur un quota bas lu depuis trop longtemps se confirme d'abord
// auprès de `gh api rate_limit` : GitHub a pu voir passer depuis les appels du
// Mac, ou commencer une autre fenêtre. `env` : celui de l'appel, demandé
// seulement s'il faut le confirmer.
export async function prendreUnAppel(
  limite: Limite,
  options: { usage?: Usage; compte?: string; etiquette?: Etiquette; gh: string; env?: () => Promise<NodeJS.ProcessEnv | undefined>; maintenant?: () => number },
): Promise<number> {
  const compte = options.compte ?? COMPTE_DE_LA_MACHINE;
  const usage = options.usage ?? "cuisine";
  if (usage === "cuisine" && limite.aConfirmer(compte)) {
    const instant = (options.maintenant ?? Date.now)();
    const tentees = confirmations.get(limite) ?? new Map<string, number>();
    confirmations.set(limite, tentees);
    const derniere = tentees.get(compte);
    if (derniere === undefined || instant - derniere >= RAFRAICHIR_MS) {
      tentees.set(compte, instant);
      await rafraichirLeQuota(limite, { gh: options.gh, env: await options.env?.(), compte });
    }
  }
  return limite.prendre(usage, compte, options.etiquette);
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
