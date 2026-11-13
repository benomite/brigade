// Les appels de la box à GitHub, réglés sur le quota réel du compte : ce que
// GitHub dit lui rester (`x-ratelimit-remaining`, `x-ratelimit-limit`,
// `x-ratelimit-reset`, à chaque réponse de `gh api -i`, et `gh api rate_limit`
// quand il faut le confirmer). C'est la seule référence : le compte est partagé
// avec le Mac du chef, et ce que la box a compté de son côté n'en dit qu'une
// part. Le sondage des issues (`github.ts`) et le canal du gist
// (`appairage/canal.ts`) prennent un appel ici avant de lancer `gh`.
//
// Deux sortes d'appels. Ceux de la cuisine — sondages, pass, manager, signe de
// vie — ne sont retenus qu'à la réserve des gestes (un dixième du quota) : au-dessus,
// rien ne les retient ; à la réserve, ils attendent la fin de la fenêtre, puis
// reprennent seuls. Ceux d'un geste du
// chef — retrait du rail, priorité, réponse à une carte, commentaire de
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
import { compteurDuProcess } from "./appels-par-identite.ts";
import { alerteAEmettre, categorieDe, categorieDeLaLecture, direLAlerte, instantaneDe, preparerLeRegistre, ticketDe, type AlerteDeBudget, type Categorie, type InstantaneDuBudget } from "./github/budget-appels.ts";

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
  // Ce que l'app lit du refus : sa nature et l'instant (ms, epoch) où GitHub rend les appels.
  readonly kind = "rate-limit" as const;
  get resetAt(): number {
    return this.jusqua;
  }
  constructor(jusqua: number, libreDansMs: number, message = "GitHub a atteint sa limite d'appels : plus aucun appel ne part avant la fin de la fenêtre, puis ils reprennent seuls") {
    super(message);
    this.name = "LimiteGitHubAtteinte";
    this.jusqua = jusqua;
    this.libreDansMs = libreDansMs;
  }
}

// Un appel de la cuisine retenu par la box : le quota réel de GitHub est à la
// réserve des gestes, et la cuisine attend la fin de la fenêtre. Il ne part pas,
// et n'est pas compté ; il est réglé comme la limite de GitHub : rien d'autre ne
// part avant `jusqua` pour qui l'attend. Mais GitHub n'a rien refusé.
export class CuisineRalentie extends LimiteGitHubAtteinte {
  readonly quota: Quota;
  constructor(quota: Quota, jusqua: number, libreDansMs: number) {
    super(
      jusqua,
      libreDansMs,
      `quota GitHub bas : ${quota.restant} appels restants sur ${quota.plafond}, gardés pour les gestes du chef — la cuisine attend la fin de la fenêtre, dans ${Math.ceil(libreDansMs / 1000)} s`,
    );
    this.name = "CuisineRalentie";
    this.quota = quota;
  }
}

// Ce qu'un appel dit de lui : le projet qui l'émet, et la sorte de lecture qu'il
// fait (`LECTURES`). Sans lui, l'appel est compté sous le projet « station ».
// `ecriture` : l'appel écrit sur GitHub (un commentaire, un label, une PR) —
// c'est ce que les limites secondaires de GitHub plafonnent (#2145).
// `categorie` et `ticket` : ce que le budget par projet en retient (#2196) ;
// sans elles, la catégorie se déduit de la lecture, et le ticket n'est pas su.
export type Etiquette = { projet: string; lecture: Lecture; ecriture?: boolean; categorie?: Categorie; ticket?: number | null };

// Le rythme des écritures de la cuisine, par compte et pour tous les projets de
// la station ensemble (#2145). GitHub dit, pour ses limites secondaires, au plus
// 80 écritures par minute et 500 par heure ; le compte de la machine est
// partagé avec le Mac du chef, d'où la marge. Un geste du chef n'est jamais espacé.
export const ECRITURES_PAR_MINUTE = 60;
export const ECRITURES_PAR_HEURE = 450;
const MINUTE_MS = 60_000;

// Une écriture de la cuisine que le rythme retient : elle ne part pas, n'est pas
// comptée, et peut repartir à `jusqua`. Ce n'est pas un refus de GitHub :
// elle attend son tour dans la file d'`appelerGitHub`, puis part.
export class EcritureEspacee extends Error {
  readonly jusqua: number;
  // Les écritures du compte comptées sur l'heure écoulée.
  readonly ecrites: number;
  constructor(jusqua: number, dansMs: number, ecrites = 0) {
    super(`écritures GitHub espacées : ${ECRITURES_PAR_MINUTE} par minute et ${ECRITURES_PAR_HEURE} par heure au plus — la suivante part dans ${Math.ceil(dansMs / 1000)} s`);
    this.name = "EcritureEspacee";
    this.jusqua = jusqua;
    this.ecrites = ecrites;
  }
}

// Le débit des requêtes de la cuisine, par compte et pour tous les projets de
// la station ensemble (#2443). GitHub plafonne, en limite secondaire, les
// points d'un compte par minute — 900 pour l'API REST, une lecture en coûtant
// 1 et une écriture 5 —, que la réponse soit un 304 ou non : un 304 ne coûte
// rien au quota horaire, pas à cette limite. La file ne tenait que quatre
// requêtes en vol : au rythme où `gh` répond, les tours des projets, la pass
// et la fermeture partis ensemble — après une pause surtout — passaient ces 900
// points en moins d'une minute, sans que le quota horaire (où les 304 ne
// comptent pas) n'en dise rien. La cuisine en prend la moitié ; l'autre reste
// au Mac du chef et à ses gestes, qui ne sont jamais espacés.
export const POINTS_PAR_MINUTE = 450;
export const POINTS_PAR_LECTURE = 1;
export const POINTS_PAR_ECRITURE = 5;

// Un appel de la cuisine que le débit retient : il ne part pas, et peut
// repartir à `jusqua`. Comme l'écriture espacée, il attend son tour dans la
// file ; mais il retient tous les appels de son compte arrivés après lui, les
// lectures aussi.
export class AppelEspace extends EcritureEspacee {
  // Les points du compte sur la minute écoulée.
  readonly points: number;
  constructor(jusqua: number, dansMs: number, points: number) {
    super(jusqua, dansMs);
    this.message = `appels GitHub espacés : ${POINTS_PAR_MINUTE} points par minute au plus (une lecture ${POINTS_PAR_LECTURE}, une écriture ${POINTS_PAR_ECRITURE}) — le suivant part dans ${Math.ceil(dansMs / 1000)} s`;
    this.name = "AppelEspace";
    this.points = points;
  }
}

type Lire = <T>(sql: string, ...params: Array<string | number>) => T[];

// Les points de la minute d'un compte, dans l'ordre où ils ont été pris. Choix :
// en mémoire, propres au process, comme la file et ses requêtes en vol — la
// station et tous ses projets en tiennent une ; une commande hors d'elle, la
// sienne. Un 304 n'en sort pas.
type PointsDuCompte = { pris: Array<{ instant: number; points: number }>; total: number };

// Ce qui est sorti de la minute ne compte plus.
function oublierLaMinute(tenus: PointsDuCompte, instant: number): void {
  while (tenus.pris.length > 0 && (tenus.pris[0] as { instant: number }).instant <= instant - MINUTE_MS) tenus.total -= (tenus.pris.shift() as { points: number }).points;
}

// L'instant où un appel de `cout` points du compte peut partir : quand assez
// de points de la minute en sont sortis — null s'il part tout de suite.
function prochainAppel(tenus: PointsDuCompte, instant: number, cout: number): { jusqua: number; points: number } | null {
  oublierLaMinute(tenus, instant);
  if (tenus.total + cout <= POINTS_PAR_MINUTE) return null;
  let restants = tenus.total;
  for (const pris of tenus.pris) {
    restants -= pris.points;
    if (restants + cout <= POINTS_PAR_MINUTE) return { jusqua: pris.instant + MINUTE_MS, points: tenus.total };
  }
  return { jusqua: instant + MINUTE_MS, points: tenus.total };
}

// L'instant où la prochaine écriture du compte peut partir : la sortie de la
// fenêtre de la plus ancienne des écritures, pour la fenêtre pleine — null si
// aucune ne l'est, la prochaine part tout de suite.
function prochaineEcriture(lire: Lire, compte: string, instant: number): number | null {
  for (const [fenetre, plafond] of [
    [MINUTE_MS, ECRITURES_PAR_MINUTE],
    [FENETRE_MS, ECRITURES_PAR_HEURE],
  ] as const) {
    const ecrites = lire<{ instant: number }>("SELECT instant FROM appels WHERE ecriture = 1 AND compte = ? AND instant > ? ORDER BY instant DESC LIMIT ?", compte, instant - fenetre, plafond);
    const plusAncienne = ecrites[plafond - 1];
    if (plusAncienne !== undefined) return plusAncienne.instant + fenetre;
  }
  return null;
}

// Vrai si l'appel `gh api` écrit : une méthode autre que GET, ou des champs sans
// méthode dite — `gh api` envoie alors un POST.
export function estUneEcriture(args: readonly string[]): boolean {
  // Une requête GraphQL part en POST, mais seule une mutation écrit (#2301).
  if (args.includes("graphql")) return args.some((arg) => /^query=\s*mutation\b/.test(arg));
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    const methode = arg === "-X" || arg === "--method" ? args[i + 1] : /^--method=(.+)$/.exec(arg)?.[1] ?? (/^-X(.+)$/.exec(arg)?.[1]);
    if (methode !== undefined) return methode.toUpperCase() !== "GET";
  }
  return args.some((arg) => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(arg));
}

// Les sortes de lecture, dans le nom stable que `status` et les faits donnent.
export const LECTURES = ["issue-comments", "pull-requests", "issues", "gist", "gesture", "other"] as const;
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

// L'étiquette entière d'un appel `gh api`, lue dans ses arguments.
export function etiquetteDe(args: readonly string[], options: { projet: string; usage?: Usage }): Etiquette {
  return { projet: options.projet, lecture: lectureDe(args, options.usage), ecriture: estUneEcriture(args), categorie: categorieDe(args), ticket: ticketDe(args) };
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
  // `refus` : ce que la réponse en disait, gardé avec la pause qui commence
  // (#3448) — pas pour un refus de plus pendant une pause qui tient.
  suspendre(jusqua: number, refus?: RefusDit): void;
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
  // Le budget de l'heure d'horloge en cours, par projet (#2196).
  budget(): InstantaneDuBudget;
  fermer(): void;
};

export type OptionsLimite = {
  // La base du compteur ; absente, un compteur en mémoire, propre au process.
  fichier?: string;
  // En millisecondes. Par défaut, l'horloge du système.
  maintenant?: () => number;
  // Un projet a passé son budget horaire : une fois par projet et par heure,
  // pour tous ceux qui tiennent ce compteur. Par défaut, une ligne au journal.
  alerter?: (alerte: AlerteDeBudget) => void;
};

// Le temps qu'un autre process tienne le compteur : une transaction y dure
// quelques millisecondes.
const ATTENTE_MS = 10_000;

type QuotaLu = { restant: number; plafond: number; reset: number; vu: number };

// Ce qu'une réponse de refus disait de la limite, gardé avec la pause qu'elle
// a posée (#3448) : son statut, la ressource que l'appel dépensait
// (`x-ratelimit-resource`), et son `retry-after` tel quel — nuls quand GitHub
// ne les a pas envoyés.
export type RefusDit = { statut: number; ressource: string | null; retryAfter: string | null };

// Ce que le refus en dit, lu de la réponse.
export const refusDitDe = (reponse: ReponseHttp): RefusDit => ({
  statut: reponse.statut,
  ressource: reponse.entetes.get("x-ratelimit-resource") ?? null,
  retryAfter: reponse.entetes.get("retry-after") ?? null,
});

export function ouvrirLimite(options: OptionsLimite = {}): Limite {
  const maintenant = options.maintenant ?? (() => Date.now());
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: ATTENTE_MS });
  // Un compte perdu dans une coupure de courant ne coûte qu'un peu de marge :
  // aucune écriture n'attend le disque.
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(
    "CREATE TABLE IF NOT EXISTS appels (instant INTEGER NOT NULL, projet TEXT, lecture TEXT, compte TEXT, ecriture INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS appels_par_instant ON appels (instant); CREATE TABLE IF NOT EXISTS pause (jusqua INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS refus (instant INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS pauses (depuis INTEGER NOT NULL, jusqua INTEGER NOT NULL, statut INTEGER, ressource TEXT, retry_after TEXT); CREATE TABLE IF NOT EXISTS quota (compte TEXT PRIMARY KEY, restant INTEGER NOT NULL, plafond INTEGER NOT NULL, reset INTEGER NOT NULL, vu INTEGER NOT NULL);",
  );
  // Les points de la cuisine sur la minute (#2443), par compte : à part des appels, qu'un 304 quitte.
  const points = new Map<string, PointsDuCompte>();
  const pointsDe = (compte: string): PointsDuCompte => points.get(compte) ?? points.set(compte, { pris: [], total: 0 }).get(compte)!;

  // Un refus par minute suffit : la retenue ne lit que le plus récent (#2429).
  const noterLeRefus = (instant: number) => base.executer("INSERT INTO refus (instant) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM refus WHERE instant > ?)", instant, instant - 60_000);

  // Un compteur écrit avant la répartition n'a pas ces deux colonnes.
  const colonnes = base.lire<{ name: string }>("PRAGMA table_info(appels)").map((c) => c.name);
  for (const colonne of ["projet", "lecture", "compte"]) if (!colonnes.includes(colonne)) base.script(`ALTER TABLE appels ADD COLUMN ${colonne} TEXT;`);
  if (!colonnes.includes("ecriture")) base.script("ALTER TABLE appels ADD COLUMN ecriture INTEGER NOT NULL DEFAULT 0;");
  preparerLeRegistre(base);
  const alerter = options.alerter ?? ((alerte: AlerteDeBudget) => console.error(direLAlerte(alerte)));

  const quotaDe = (compte: string, instant: number): Quota | null => {
    const [lu] = base.lire<QuotaLu>("SELECT restant, plafond, reset, vu FROM quota WHERE compte = ?", compte);
    return lu !== undefined && lu.reset > instant ? { restant: lu.restant, plafond: lu.plafond, reset: lu.reset, vu: lu.vu } : null;
  };

  // Ce qui retient un appel de la cuisine, d'après le quota réel : la fin de la
  // fenêtre s'il est à la réserve des gestes, sinon rien — il part.
  const retenue = (quota: Quota): number | null => (quota.restant <= reserveDes(quota.plafond) ? quota.reset : null);

  return {
    prendre(usage = "cuisine", compte = COMPTE_DE_LA_MACHINE, etiquette) {
      const refus = base.transaction((): { jusqua: number } | { quota: Quota; jusqua: number } | { espacer: number; ecrites: number } | { debit: number; points: number } | { appel: number; alerte: AlerteDeBudget | null } => {
        const instant = maintenant();
        // Ce qui est sorti de la fenêtre ne compte plus : rien ne le relira.
        base.executer("DELETE FROM appels WHERE instant <= ?", instant - FENETRE_MS);
        const cout = etiquette?.ecriture === true ? POINTS_PAR_ECRITURE : POINTS_PAR_LECTURE;
        base.executer("DELETE FROM refus WHERE instant <= ?", instant - FENETRE_MS);
        if (usage === "cuisine") {
          // La limite de GitHub atteinte : rien ne part, et rien n'est compté.
          const [pause] = base.lire<{ jusqua: number | null }>("SELECT max(jusqua) AS jusqua FROM pause");
          if (pause?.jusqua != null && pause.jusqua > instant) {
            // Le refus se garde : la retenue le lit quand la reprise dite est passée (#2429).
            noterLeRefus(instant);
            return { jusqua: pause.jusqua };
          }
          const quota = quotaDe(compte, instant);
          const jusqua = quota === null ? null : retenue(quota);
          if (quota !== null && jusqua !== null) return { quota, jusqua };
          // Le rythme des écritures du compte, tous projets ensemble : la
          // suivante part quand la plus ancienne de la fenêtre pleine en sort.
          if (etiquette?.ecriture === true) {
            const espacer = prochaineEcriture((sql, ...params) => base.lire(sql, ...params), compte, instant);
            if (espacer !== null) return { espacer, ecrites: base.lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE ecriture = 1 AND compte = ? AND instant > ?", compte, instant - FENETRE_MS)[0]?.n ?? 0 };
          }
          // Le débit du compte, lectures et écritures ensemble (#2443).
          const tenus = pointsDe(compte);
          const debit = prochainAppel(tenus, instant, cout);
          if (debit !== null) return { debit: debit.jusqua, points: debit.points };
          tenus.pris.push({ instant, points: cout });
          tenus.total += cout;
        }
        const projet = etiquette?.projet ?? PROJET_DE_LA_STATION;
        const lecture = etiquette?.lecture ?? (usage === "geste" ? "gesture" : "other");
        const appel = base.executer(
          "INSERT INTO appels (instant, projet, lecture, compte, ecriture, categorie, ticket) VALUES (?, ?, ?, ?, ?, ?, ?)",
          instant,
          projet,
          lecture,
          compte,
          etiquette?.ecriture === true ? 1 : 0,
          etiquette?.categorie ?? categorieDeLaLecture(lecture),
          etiquette?.ticket ?? null,
        ).dernierId;
        return { appel, alerte: alerteAEmettre(base, projet, etiquette?.ecriture === true, instant) };
      });
      if ("appel" in refus) {
        // Une alerte qui ne se dit pas ne retient jamais l'appel.
        if (refus.alerte !== null) {
          try {
            alerter(refus.alerte);
          } catch {}
        }
        return refus.appel;
      }
      if ("espacer" in refus) throw new EcritureEspacee(refus.espacer, Math.max(0, refus.espacer - maintenant()), refus.ecrites);
      if ("debit" in refus) throw new AppelEspace(refus.debit, Math.max(0, refus.debit - maintenant()), refus.points);
      const libre = Math.max(0, refus.jusqua - maintenant());
      if ("quota" in refus) throw new CuisineRalentie(refus.quota, refus.jusqua, libre);
      throw new LimiteGitHubAtteinte(refus.jusqua, libre);
    },
    rendre(appel) {
      base.executer("DELETE FROM appels WHERE rowid = ?", appel);
    },
    suspendre(jusqua, refus) {
      base.transaction(() => {
        const instant = maintenant();
        // Une pause qui commence se garde, avec le refus qui l'a dite : la
        // retenue de la cuisine en nomme la cause au journal (#3448).
        base.executer("DELETE FROM pauses WHERE jusqua <= ?", instant - FENETRE_MS);
        const [tenue] = base.lire<{ jusqua: number | null }>("SELECT max(jusqua) AS jusqua FROM pause");
        if (tenue?.jusqua == null || tenue.jusqua <= instant) {
          base.executer("INSERT INTO pauses (depuis, jusqua, statut, ressource, retry_after) VALUES (?, ?, ?, ?, ?)", instant, jusqua, refus?.statut ?? null, refus?.ressource ?? null, refus?.retryAfter ?? null);
        }
        // Une pause plus longue déjà posée par un autre process reste.
        noterLeRefus(instant);
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
      return quota !== null && quota.restant <= reserveDes(quota.plafond) && instant - quota.vu > RAFRAICHIR_MS;
    },
    appels() {
      const [compte] = base.lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE instant > ?", maintenant() - FENETRE_MS);
      return compte?.n ?? 0;
    },
    repartition: () => repartitionDe(base, maintenant()),
    budget: () => instantaneDe(base, maintenant()),
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

// Le budget de l'heure de la station dont `racine` est le répertoire, lu sans
// rien écrire ni rien créer : null si elle n'a pas de compteur, ou s'il ne se
// lit pas — un compteur d'avant le registre n'a pas ses colonnes.
export function budgetDeLaStation(racine: string | undefined, maintenant: number): InstantaneDuBudget | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    return instantaneDe(base, maintenant);
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

// Ce que le statut et les en-têtes d'un refus disent de lui : une limite d'appels
// (429 ; 403 au quota à zéro ou avec `retry-after`) et l'instant (ms, epoch) où
// elle prend fin — `retry-after` (secondes) ajouté à `maintenant`, sinon
// `x-ratelimit-reset` (epoch en secondes) quand le quota est à zéro —, ou `other`.
// `resetAt` est null quand les en-têtes ne le disent pas (le 429 nu).
export type ClasseDuRefus = { kind: "rate-limit"; resetAt: number | null } | { kind: "other" };

export function classerLeRefus(statut: number, entetes: Map<string, string>, maintenant: number): ClasseDuRefus {
  const vide = entetes.get("x-ratelimit-remaining") === "0";
  const attente = entetes.has("retry-after");
  if (statut !== 429 && !(statut === 403 && (vide || attente))) return { kind: "other" };
  const retry = Number(entetes.get("retry-after"));
  const reset = Number(entetes.get("x-ratelimit-reset"));
  // `x-ratelimit-reset` est sur toute réponse : le reset horaire du quota
  // primaire. Il ne dit la fin que si ce quota est épuisé (#2449).
  if (attente && Number.isFinite(retry) && retry >= 0) return { kind: "rate-limit", resetAt: maintenant + retry * 1000 };
  if (vide && Number.isFinite(reset) && reset * 1000 > maintenant) return { kind: "rate-limit", resetAt: reset * 1000 };
  return { kind: "rate-limit", resetAt: null };
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

// Ce que `gh api rate_limit` dit de la fin de fenêtre de `ressource`, celle que
// l'appel refusé dépense : son reset, si elle est épuisée. Null s'il ne répond
// pas, ne dit rien d'exploitable, ou qu'elle ne l'est pas — le refus est alors
// une limite secondaire, que `rate_limit` ne décrit pas. Une autre ressource
// épuisée — `graphql`, `search`, que dépensent le Mac du chef ou l'app sur le
// même compte — ne retient pas les appels REST de la cuisine : la pause allait
// jusqu'au plus lointain de leurs resets, une heure au plus (#3448).
async function finDeFenetreDite(options: { gh: string; env?: NodeJS.ProcessEnv; maintenant: number; ressource: string }): Promise<number | null> {
  const r = (await ressourcesDites(options))?.[options.ressource];
  return r !== undefined && r.remaining === 0 && typeof r.reset === "number" && r.reset * 1000 > options.maintenant ? r.reset * 1000 : null;
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

// Les requêtes de la box à GitHub en vol en même temps, au plus (#2195) : GitHub
// plafonne aussi les requêtes simultanées d'un compte (limite secondaire). Un
// geste du chef n'attend jamais de place, mais en occupe une tant qu'il est en vol.
export const REQUETES_EN_VOL = 4;

export type OptionsAppel = {
  usage?: Usage;
  compte?: string;
  etiquette?: Etiquette;
  gh: string;
  env?: () => Promise<NodeJS.ProcessEnv | undefined>;
  maintenant?: () => number;
  // Le réveil de la file, quand une écriture attend que le rythme libère une
  // place : par défaut, un `setTimeout`. Un test y met son horloge.
  attendre?: (ms: number) => Promise<void>;
};

// Un appel de la cuisine qui attend dans la file : une place en vol, et pour une
// écriture, une place au rythme de son compte.
type EnAttente = {
  usage: Usage;
  compte: string;
  etiquette: Etiquette | undefined;
  maintenant: () => number;
  attendre: (ms: number) => Promise<void>;
  partir: (appel: number) => void;
  echouer: (erreur: unknown) => void;
  // Vrai dès que le rythme la retient, elle ou une écriture du même compte arrivée avant elle : le journal le dit (#2226).
  retenue: boolean;
};

// La file des appels de la cuisine, une par compteur — donc une pour la station
// et tous les projets qu'elle sert dans son process (#2195). Choix : une seule
// file dans l'ordre d'arrivée, pas un minuteur par appel en attente. Une place
// en vol qui se libère, ou la place que le rythme rend, part au premier arrivé
// qui peut la prendre : une écriture ne double jamais une écriture plus ancienne
// du même compte, quel que soit son projet. Une lecture, que le rythme ne retient
// pas, passe devant une écriture qu'il retient — mais pas devant une lecture
// arrivée avant elle. La file n'a qu'un réveil : l'instant où le rythme rend sa
// prochaine place.
type File = {
  // Demande un appel : il part dès que la file le laisse partir.
  prendre(usage: Usage, compte: string, etiquette: Etiquette | undefined, maintenant: () => number, attendre: (ms: number) => Promise<void>): Promise<number>;
  // Une requête en vol s'achève : sa place passe au suivant.
  liberer(): void;
};

const files = new WeakMap<Limite, File>();

function fileDe(limite: Limite): File {
  const deja = files.get(limite);
  if (deja !== undefined) return deja;
  const attente: EnAttente[] = [];
  let enVol = 0;
  // L'instant du réveil armé le plus proche, Infinity s'il n'y en a pas.
  let reveil = Number.POSITIVE_INFINITY;

  const armer = (jusqua: number, par: EnAttente) => {
    reveil = jusqua;
    par
      .attendre(Math.max(50, jusqua - par.maintenant()))
      .catch(() => {})
      .then(() => {
        if (reveil === jusqua) reveil = Number.POSITIVE_INFINITY;
        pomper();
      });
  };

  const retenir = (entree: EnAttente, espacee: EcritureEspacee) => {
    if (entree.retenue) return;
    entree.retenue = true;
    commencerLaRetenue(espacee);
  };
  const sortir = (entree: EnAttente) => {
    attente.splice(attente.indexOf(entree), 1);
    if (entree.retenue) finirLaRetenue();
  };

  // Fait partir, dans l'ordre d'arrivée, tout ce qui peut partir.
  const pomper = () => {
    // Les comptes dont une écriture attend le rythme : les suivantes restent derrière elle.
    const retenus = new Map<string, EcritureEspacee>();
    // Les comptes dont un appel attend le débit : tous les suivants restent derrière lui (#2443).
    const tenus = new Map<string, AppelEspace>();
    let prochain: { jusqua: number; par: EnAttente } | null = null;
    for (const entree of [...attente]) {
      if (enVol >= REQUETES_EN_VOL) break;
      const devant = tenus.get(entree.compte) ?? (entree.etiquette?.ecriture === true ? retenus.get(entree.compte) : undefined);
      if (devant !== undefined) {
        retenir(entree, devant);
        continue;
      }
      let appel: number;
      try {
        appel = limite.prendre(entree.usage, entree.compte, entree.etiquette);
      } catch (erreur) {
        if (erreur instanceof EcritureEspacee) {
          if (erreur instanceof AppelEspace) tenus.set(entree.compte, erreur);
          retenus.set(entree.compte, erreur);
          retenir(entree, erreur);
          if (prochain === null || erreur.jusqua < prochain.jusqua) prochain = { jusqua: erreur.jusqua, par: entree };
          continue;
        }
        sortir(entree);
        entree.echouer(erreur);
        continue;
      }
      sortir(entree);
      enVol += 1;
      entree.partir(appel);
    }
    if (prochain !== null && prochain.jusqua < reveil) armer(prochain.jusqua, prochain.par);
  };

  const file: File = {
    prendre(usage, compte, etiquette, maintenant, attendre) {
      // Un geste du chef ne fait jamais la queue.
      if (usage === "geste") {
        const appel = limite.prendre(usage, compte, etiquette);
        enVol += 1;
        return Promise.resolve(appel);
      }
      return new Promise<number>((partir, echouer) => {
        attente.push({ usage, compte, etiquette, maintenant, attendre, partir, echouer, retenue: false });
        pomper();
      });
    },
    liberer() {
      enVol = Math.max(0, enVol - 1);
      pomper();
    },
  };
  files.set(limite, file);
  return file;
}

// Fait une requête à GitHub sous le compteur : prend son appel, comme
// `limite.prendre`, lance `requete` avec lui, et rend sa place en vol quand elle
// s'achève, qu'elle aboutisse ou non. Un appel de la cuisine attend dans la file
// (`fileDe`) : une écriture que le rythme retient ne rate pas, elle part plus
// tard (#2145), dans l'ordre d'arrivée (#2195). Une décision de la cuisine qui se
// prendrait sur un quota bas lu depuis trop longtemps se confirme d'abord auprès
// de `gh api rate_limit` : GitHub a pu voir passer depuis les appels du Mac, ou
// commencer une autre fenêtre. `env` : celui de l'appel, demandé seulement s'il
// faut le confirmer.
export async function appelerGitHub<T>(limite: Limite, options: OptionsAppel, requete: (appel: number) => Promise<T>): Promise<T> {
  const compte = options.compte ?? COMPTE_DE_LA_MACHINE;
  const usage = options.usage ?? "cuisine";
  const maintenant = options.maintenant ?? Date.now;
  if (usage === "cuisine" && limite.aConfirmer(compte)) {
    const instant = maintenant();
    const tentees = confirmations.get(limite) ?? new Map<string, number>();
    confirmations.set(limite, tentees);
    const derniere = tentees.get(compte);
    if (derniere === undefined || instant - derniere >= RAFRAICHIR_MS) {
      tentees.set(compte, instant);
      await rafraichirLeQuota(limite, { gh: options.gh, env: await options.env?.(), compte });
    }
  }
  const attendre = options.attendre ?? ((ms: number) => new Promise<void>((suite) => setTimeout(suite, ms)));
  const file = fileDe(limite);
  const appel = await file.prendre(usage, compte, options.etiquette, maintenant, attendre);
  if (pauseDite && usage === "cuisine") {
    pauseDite = false;
    direLaPauseDansLeJournal?.("brigade : GitHub calls resumed");
  }
  // L'appel part : il se compte à l'identité dont il porte le jeton (#2316).
  compteurDuProcess().compter(compte);
  try {
    return await requete(appel);
  } finally {
    file.liberer();
  }
}

// Prend un appel et le rend, sans requête à tenir en vol : sa place se libère aussitôt.
export function prendreUnAppel(limite: Limite, options: OptionsAppel): Promise<number> {
  return appelerGitHub(limite, options, async (appel) => appel);
}

// Le journal de la station dit la retenue des écritures une fois quand elle
// commence et une fois quand elle finit, quel que soit le nombre d'écritures qui
// attendent : la première qui attend ouvre, la dernière qui repart ferme (#2226).
let direLaRetenueDansLeJournal: ((ligne: string) => void) | null = null;
let enAttente = 0;

export function journaliserLaRetenue(dire: (ligne: string) => void): void {
  direLaRetenueDansLeJournal = dire;
}

function commencerLaRetenue(erreur: EcritureEspacee): void {
  enAttente += 1;
  if (enAttente !== 1) return;
  direLaRetenueDansLeJournal?.(
    erreur instanceof AppelEspace
      ? `brigade : appels GitHub espacés par le débit — ${erreur.points} points sur ${POINTS_PAR_MINUTE} sur la minute écoulée, le suivant à ${heure(erreur.jusqua)}`
      : `brigade : écritures GitHub retenues par le budget — ${erreur.ecrites} sur ${ECRITURES_PAR_HEURE} sur l'heure écoulée, la suivante à ${heure(erreur.jusqua)}`,
  );
}

function finirLaRetenue(): void {
  enAttente -= 1;
  if (enAttente === 0) direLaRetenueDansLeJournal?.("brigade : écritures GitHub reprises, le budget ne retient plus la cuisine");
}

// Ce que le budget des écritures retient sur le compteur de la station dont
// `racine` est le répertoire : les écritures de l'heure et l'instant de la
// prochaine, pour le compte dont la prochaine part le plus tôt. Lu sans rien
// écrire ni rien créer, comme `pauseDeLaStation`. Null si rien n'est retenu.
export function ecrituresRetenuesDeLaStation(racine: string | undefined, maintenant: number): { ecrites: number; reprise: number } | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    const lire: Lire = (sql, ...params) => base!.lire(sql, ...params);
    const comptes = lire<{ compte: string }>("SELECT DISTINCT compte FROM appels WHERE ecriture = 1 AND instant > ?", maintenant - FENETRE_MS);
    let plusTot: { ecrites: number; reprise: number } | null = null;
    for (const { compte } of comptes) {
      const reprise = prochaineEcriture(lire, compte, maintenant);
      if (reprise === null || (plusTot !== null && reprise >= plusTot.reprise)) continue;
      const ecrites = lire<{ n: number }>("SELECT count(*) AS n FROM appels WHERE ecriture = 1 AND compte = ? AND instant > ?", compte, maintenant - FENETRE_MS)[0]?.n ?? 0;
      plusTot = { ecrites, reprise };
    }
    return plusTot;
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// La ligne de `status` : ce qui retient les écritures, combien l'heure en compte, et quand la suivante part.
export function direLesEcrituresRetenues({ ecrites, reprise }: { ecrites: number; reprise: number }): string {
  return `held by the GitHub write budget — ${ecrites} of ${ECRITURES_PAR_HEURE} in the last hour, next write at ${heure(reprise)}`;
}

// Sans attente dite par GitHub, la pause double à chaque limite qui revient
// moins de `RECUL_OUBLIE_MS` après la fin de la précédente, jusqu'à
// `RECUL_MAX_MS` (#2436) : reprendre au bout d'une minute, tous projets
// ensemble, relance la limite secondaire, que chaque nouvel essai prolonge.
export const RECUL_MAX_MS = 15 * 60_000;
const RECUL_OUBLIE_MS = 15 * 60_000;
// La dernière pause posée par ce process, par compteur : sa fin et sa durée.
const reculs = new WeakMap<Limite, { fin: number; duree: number }>();

// Le journal de la station dit la pause une fois quand elle commence, et une
// fois quand un appel repart — pas une ligne par projet et par minute (#2436).
let direLaPauseDansLeJournal: ((ligne: string) => void) | null = null;
let pauseDite = false;

export function journaliserLaPause(dire: (ligne: string) => void): void {
  direLaPauseDansLeJournal = dire;
}

// Une pause de GitHub qui commence : jusqu'à quand, depuis quand (en
// millisecondes), et la réponse qui l'a dite.
export type PauseDeGitHub = { depuis: number; jusqua: number; reponse: ReponseHttp };
const ecouteursDeLaPause = new Set<(pause: PauseDeGitHub) => void>();

// Qui veut savoir qu'une pause commence — l'enregistrement de la station, qui le
// dit à l'app avant que ses appels ne s'arrêtent (#2443). Rend de quoi se retirer.
export function surLaPauseDeGitHub(ecouteur: (pause: PauseDeGitHub) => void): () => void {
  ecouteursDeLaPause.add(ecouteur);
  return () => void ecouteursDeLaPause.delete(ecouteur);
}

// Vrai pour le refus d'un appel que la pause de GitHub retient : la pause est
// déjà au journal, l'appelant n'a rien à en redire. La retenue de la box
// (`CuisineRalentie`) n'en est pas une.
export const estLaPauseDeGitHub = (erreur: unknown): boolean => erreur instanceof LimiteGitHubAtteinte && !(erreur instanceof CuisineRalentie);

// GitHub a refusé pour sa limite : pose la pause sur le compteur, jusqu'à la
// fin de la fenêtre — `retry-after`, sinon `x-ratelimit-reset` quand le quota
// est à zéro, sinon ce que `gh api rate_limit` dit de la ressource de l'appel
// refusé, sinon 60 s, doublées à chaque limite qui revient —
// et rend l'erreur à lever. Plusieurs refus d'une même rafale, arrivés pendant
// la pause qu'ils ont posée, ne la doublent pas.
export async function constaterLimite(limite: Limite, reponse: ReponseHttp, options: { gh: string; env?: NodeJS.ProcessEnv; maintenant?: () => number }): Promise<LimiteGitHubAtteinte> {
  const maintenant = options.maintenant ?? (() => Date.now());
  const instant = maintenant();
  const classe = classerLeRefus(reponse.statut, reponse.entetes, instant);
  let jusqua: number | null = classe.kind === "rate-limit" ? classe.resetAt : null;
  // La ressource que l'appel refusé dépense, que GitHub dit dans la réponse : `core` pour l'API REST, par défaut.
  jusqua ??= await finDeFenetreDite({ gh: options.gh, env: options.env, maintenant: instant, ressource: reponse.entetes.get("x-ratelimit-resource") ?? "core" });
  const precedente = reculs.get(limite) ?? { fin: Number.NEGATIVE_INFINITY, duree: 0 };
  const enCours = instant < precedente.fin;
  if (jusqua === null) {
    const recidive = instant - precedente.fin < RECUL_OUBLIE_MS;
    jusqua = enCours ? precedente.fin : instant + (recidive ? Math.min(precedente.duree * 2, RECUL_MAX_MS) : ATTENTE_PAR_DEFAUT_MS);
  }
  if (!enCours) reculs.set(limite, { fin: jusqua, duree: jusqua - instant });
  else if (jusqua > precedente.fin) reculs.set(limite, { fin: jusqua, duree: precedente.duree });
  limite.suspendre(jusqua, refusDitDe(reponse));
  if (!enCours) {
    pauseDite = true;
    direLaPauseDansLeJournal?.(`brigade : GitHub limit reached — no call leaves the station before ${heure(jusqua)}`);
    // Ce qui l'écoute ne retient jamais le refus.
    for (const ecouteur of ecouteursDeLaPause) {
      try {
        ecouteur({ depuis: instant, jusqua, reponse });
      } catch {}
    }
  }
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

// Les pauses de GitHub sur l'heure écoulée, telles que le compteur de la
// station dont `racine` est le répertoire les a gardées (#3448) : leur nombre,
// les minutes où GitHub a refusé un appel (une par minute au plus), la
// dernière pause et son refus, et les derniers appels comptés avant elle —
// leur projet, leur sorte, et s'ils écrivaient. C'est ce qu'il manquait au
// ticket #3448 pour nommer la cause d'une retenue `github-limit` sans lire la
// box. Lu sans rien écrire ni rien créer : null s'il n'y a pas de compteur,
// qu'il ne se lit pas, ou qu'aucune pause n'y est gardée sur l'heure.
export type PausesDites = {
  pauses: number;
  minutesRefusees: number;
  // `statut` nul : la pause a été posée sans réponse de refus.
  derniere: { depuis: number; jusqua: number; statut: number | null; ressource: string | null; retryAfter: string | null };
  appelsAvant: Array<{ projet: string; lecture: string; ecriture: boolean }>;
};
// Combien des derniers appels avant la pause se gardent.
export const APPELS_AVANT_LA_PAUSE = 5;

export function pausesDeLaStation(racine: string | undefined, maintenant: number): PausesDites | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    const depuis = maintenant - FENETRE_MS;
    // Un compteur d'avant #3448 n'a pas la table : la lecture lève, et rien n'est dit.
    const pauses = base.lire<{ depuis: number; jusqua: number; statut: number | null; ressource: string | null; retry_after: string | null }>(
      "SELECT depuis, jusqua, statut, ressource, retry_after FROM pauses WHERE jusqua > ? AND depuis <= ? ORDER BY depuis DESC",
      depuis,
      maintenant,
    );
    const [derniere] = pauses;
    if (derniere === undefined) return null;
    const [refus] = base.lire<{ n: number }>("SELECT count(*) AS n FROM refus WHERE instant > ? AND instant <= ?", depuis, maintenant);
    const appelsAvant = base
      .lire<{ projet: string | null; lecture: string | null; ecriture: number }>("SELECT projet, lecture, ecriture FROM appels WHERE instant <= ? ORDER BY instant DESC, rowid DESC LIMIT ?", derniere.depuis, APPELS_AVANT_LA_PAUSE)
      .map(({ projet, lecture, ecriture }) => ({ projet: projet ?? PROJET_DE_LA_STATION, lecture: lecture ?? "other", ecriture: ecriture === 1 }));
    return {
      pauses: pauses.length,
      minutesRefusees: refus?.n ?? 0,
      derniere: { depuis: derniere.depuis, jusqua: derniere.jusqua, statut: derniere.statut, ressource: derniere.ressource, retryAfter: derniere.retry_after },
      appelsAvant,
    };
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// Le dernier appel que GitHub a refusé pour sa limite, dans les `depuisMs`
// avant `maintenant` (en millisecondes), ou null : la reprise que GitHub a dite
// peut passer sans que les refus cessent, et la retenue de la cuisine ne doit
// pas alors perdre sa cause (#2429). Lu sans rien écrire ni rien créer.
export function dernierRefusDeLaStation(racine: string | undefined, maintenant: number, depuisMs: number): number | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    const [refus] = base.lire<{ instant: number | null }>("SELECT max(instant) AS instant FROM refus WHERE instant > ? AND instant <= ?", maintenant - depuisMs, maintenant);
    return refus?.instant ?? null;
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// Le quota que la box garde pour les gestes, tel que la station dont `racine` est
// le répertoire l'a retenu : l'instant où la fenêtre de GitHub s'achève et où la
// cuisine reprend (en millisecondes), ou null si aucun compte n'est à la réserve.
// Lu sans rien écrire ni rien créer, comme `pauseDeLaStation`.
export function retenueDeLaStation(racine: string | undefined, maintenant: number): number | null {
  if (!racine) return null;
  const fichier = join(racine, REPERTOIRE_COMPTEUR, FICHIER_COMPTEUR);
  if (!existsSync(fichier)) return null;
  let base: Base | undefined;
  try {
    base = new Base(fichier, { lectureSeule: true, attenteMs: 2000 });
    const [retenue] = base.lire<{ reset: number | null }>("SELECT max(reset) AS reset FROM quota WHERE reset > ? AND restant <= (plafond + 9) / 10", maintenant);
    return retenue?.reset ?? null;
  } catch {
    return null;
  } finally {
    base?.fermer();
  }
}

// L'heure de ce process, en HH:MM.
const heure = (instant: number): string => {
  const d = new Date(instant);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// La ligne qui le dit, en une phrase, l'heure étant celle de ce process.
export function direLaLimite(jusqua: number): string {
  const d = new Date(jusqua);
  return `GitHub is rate-limiting calls, back around ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// La ligne de la retenue de la box, qui n'est pas un refus de GitHub.
export function direLaRetenue(jusqua: number): string {
  const d = new Date(jusqua);
  return `the box holds its own calls to keep the reserve for your gestures, back around ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
