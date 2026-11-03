// L'allure des appels de la box à GitHub, sous ses limites secondaires : pas
// plus de N écritures à la minute (et à l'heure), pas plus de M requêtes en vol
// à la fois, par compte. `limite-github.ts` règle la cuisine sur le quota
// horaire ; ce module règle la cadence, pour que GitHub n'ait jamais à dire sa
// limite secondaire (`github-limite.ts` la nomme quand il la dit quand même).
//
// Une seule allure pour tout le compte, pas une par projet : elle vit dans le
// répertoire de la station (`<BRIGADE_STATION_DIR>/appels-github/allure.db`),
// à côté du compteur, et tout process qui la tient — la station, ses projets,
// une commande lancée avec son environnement — attend dans la même file. Hors
// de toute station, le process la tient seul, en mémoire, sous les mêmes règles.
//
// - Les écritures partent espacées : les `RAFALE` premières d'une minute calme
//   partent d'un coup, les suivantes une par `60 s / N`, et jamais plus de N
//   sur une minute glissante, ni plus que le budget de l'heure glissante.
// - Toute requête, lecture ou écriture, prend une place en vol, rendue quand
//   elle a sa réponse ; au plafond, elle attend qu'une place se libère. Les
//   lectures ne sont réglées que par là.
// - La file est équitable entre projets : la place qui se libère va au projet
//   servi le moins récemment, et dans un projet, à sa plus ancienne requête.
//   Un projet qui en pousse deux cents n'affame pas les autres. Un geste du
//   chef passe devant la cuisine, mais garde l'allure.
// - Tant que la limite du compte dure (`github-limite.ts`), les écritures de la
//   cuisine sont retenues jusqu'à sa reprise, puis partent seules. Un geste du
//   chef n'est pas retenu : seul un refus de GitHub l'arrête.
//
// Les budgets sont des constantes nommées, sous ce que GitHub documente (80
// écritures à la minute, 500 à l'heure, 100 requêtes simultanées), et un
// réglage de la station les change (`VARIABLES_DE_L_ALLURE`), sans jamais les
// porter au-delà de ce que GitHub tolère.
//
// Tout appel `gh api` du runtime passe par ici : `github.ts`, le canal du gist
// (`appairage/canal.ts`), le client du tableau (`tableau/publication/client.ts`)
// et la protection de branche (`proteger-branche.ts`). Le test de ce module
// relit les sources, et rougit si un `gh api` part d'ailleurs.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Base } from "./base.ts";
import type { LimitesDuCompte } from "./github-limite.ts";
import { COMPTE_DE_LA_MACHINE, REPERTOIRE_COMPTEUR } from "./limite-github.ts";
import { lire } from "./plafonds.ts";

const FICHIER_ALLURE = "allure.db";

export const MINUTE_MS = 60_000;
export const HEURE_MS = 60 * MINUTE_MS;

// Ce que GitHub documente de ses limites secondaires : un budget au-delà ne se règle pas.
export const PLAFONDS_DE_GITHUB = { ecrituresParMinute: 80, ecrituresParHeure: 500, simultanees: 100 } as const;
export const ECRITURES_PAR_MINUTE = 60;
export const ECRITURES_PAR_HEURE = 400;
export const REQUETES_SIMULTANEES = 10;
// Les écritures d'une minute calme qui partent sans attendre leur tour.
export const RAFALE = 10;

export type Budgets = { ecrituresParMinute: number; ecrituresParHeure: number; simultanees: number };
export const BUDGETS_PAR_DEFAUT: Budgets = { ecrituresParMinute: ECRITURES_PAR_MINUTE, ecrituresParHeure: ECRITURES_PAR_HEURE, simultanees: REQUETES_SIMULTANEES };

export const VARIABLES_DE_L_ALLURE: Record<keyof Budgets, string> = {
  ecrituresParMinute: "BRIGADE_GITHUB_WRITES_PER_MINUTE",
  ecrituresParHeure: "BRIGADE_GITHUB_WRITES_PER_HOUR",
  simultanees: "BRIGADE_GITHUB_CONCURRENT_REQUESTS",
};

// Les budgets que dit l'environnement de la station, chacun à son défaut s'il
// ne le dit pas. Une valeur illisible, ou au-delà de ce que GitHub tolère, est
// un refus (`ConfigInvalide`), jamais un repli silencieux.
export function lireLesBudgets(env: NodeJS.ProcessEnv): Budgets {
  const budget = (cle: keyof Budgets) =>
    lire(env, VARIABLES_DE_L_ALLURE[cle], BUDGETS_PAR_DEFAUT[cle], `an integer from 1 to ${PLAFONDS_DE_GITHUB[cle]}`, (valeur) => Number.isSafeInteger(valeur) && valeur >= 1 && valeur <= PLAFONDS_DE_GITHUB[cle]);
  return { ecrituresParMinute: budget("ecrituresParMinute"), ecrituresParHeure: budget("ecrituresParHeure"), simultanees: budget("simultanees") };
}

// Vrai si `gh api` écrit : une méthode autre que GET, ou des champs sans
// méthode dite — `gh` envoie alors un POST —, sauf une requête GraphQL qui
// n'est pas une mutation.
export function estUneEcriture(args: readonly string[]): boolean {
  const methode = args.findIndex((arg) => arg === "-X" || arg === "--method");
  if (methode !== -1) return (args[methode + 1] ?? "GET").toUpperCase() !== "GET";
  if (args.includes("graphql")) {
    const requete = args.find((arg) => arg.startsWith("query="));
    return requete === undefined || /^query=\s*mutation\b/.test(requete);
  }
  return args.some((arg) => ["-f", "-F", "--field", "--raw-field", "--input"].includes(arg));
}

// Une requête qui demande à partir.
export type Passage = {
  // Le projet qui l'émet : la file est équitable entre projets.
  projet: string;
  ecriture: boolean;
  // Le compte dont elle dépense les limites ; par défaut, celui de la machine.
  compte?: string;
  // Un geste du chef : il passe devant la cuisine, et n'est pas retenu par la limite du compte.
  geste?: boolean;
  // Le temps, en millisecondes, avant que le compte rende ses écritures — la
  // limite qu'il subit —, relu à chaque tour : 0 quand rien ne les retient.
  retenue?: () => number;
  // Le plus longtemps qu'elle tiendra sa place en vol : un process mort ne la
  // garde pas au-delà.
  bailMs?: number;
  signal?: AbortSignal;
};

export type Allure = {
  // Attend que la requête puisse partir ; rend de quoi dire qu'elle a sa réponse.
  entrer(passage: Passage): Promise<() => void>;
  // Fait `faire` quand la requête peut partir, et rend sa place après.
  passer<T>(passage: Passage, faire: () => Promise<T>): Promise<T>;
  fermer(): void;
};

export type OptionsAllure = {
  // La base de l'allure ; absente, une allure en mémoire, propre au process.
  fichier?: string;
  budgets?: Partial<Budgets>;
  // En millisecondes. Par défaut, l'horloge du système et ses minuteries.
  maintenant?: () => number;
  programmer?: (ms: number, faire: () => void) => () => void;
};

// Le plus longtemps qu'une requête attend avant de relire la file : une place
// libérée par un autre process ne se voit qu'ainsi.
export const SONDER_MS = 250;
// Une requête qui n'a pas relu la file depuis si longtemps est celle d'un
// process mort : elle en sort.
const ABANDON_MS = 30_000;
const VIVANT_MS = 5_000;
const BAIL_MS = 2 * MINUTE_MS;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS attente (id INTEGER PRIMARY KEY AUTOINCREMENT, proprio TEXT NOT NULL, compte TEXT NOT NULL, projet TEXT NOT NULL, ecriture INTEGER NOT NULL, geste INTEGER NOT NULL, bail INTEGER NOT NULL, vu INTEGER NOT NULL, retenu INTEGER NOT NULL DEFAULT 0, accorde INTEGER);
CREATE TABLE IF NOT EXISTS en_vol (id INTEGER PRIMARY KEY, compte TEXT NOT NULL, bail INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS departs (instant INTEGER NOT NULL, compte TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS departs_par_compte ON departs (compte, instant);
CREATE TABLE IF NOT EXISTS tours (compte TEXT NOT NULL, projet TEXT NOT NULL, rang INTEGER NOT NULL, PRIMARY KEY (compte, projet));
`;

type Attendue = { passage: Passage; retenu: number; resoudre: (sortir: () => void) => void; rejeter: (erreur: unknown) => void; quitter: () => void };

let proprios = 0;

export function ouvrirAllure(options: OptionsAllure = {}): Allure {
  const maintenant = options.maintenant ?? (() => Date.now());
  const programmer =
    options.programmer ??
    ((ms, faire) => {
      const minuterie = setTimeout(faire, ms);
      return () => clearTimeout(minuterie);
    });
  const budgets = { ...BUDGETS_PAR_DEFAUT, ...options.budgets };
  const rafale = Math.min(RAFALE, budgets.ecrituresParMinute);
  const ecart = Math.ceil(MINUTE_MS / budgets.ecrituresParMinute);
  const base = new Base(options.fichier ?? ":memory:", { attenteMs: 10_000 });
  if (options.fichier !== undefined) base.script("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  base.script(SCHEMA);
  // Ce process, parmi tous ceux qui tiennent la file.
  const proprio = `${process.pid}:${++proprios}:${maintenant()}`;
  const locales = new Map<number, Attendue>();
  let fermee = false;
  let demandee = false;
  let annulerLeReveil: (() => void) | null = null;
  let vivantLe = Number.NEGATIVE_INFINITY;

  // Met la requête dans la file, sous `id` s'il est dit (une requête qui y reprend sa place) : rend son id.
  const inscrire = (id: number | null, passage: Passage, instant: number): number =>
    base.executer(
      "INSERT OR IGNORE INTO attente (id, proprio, compte, projet, ecriture, geste, bail, vu) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      proprio,
      passage.compte ?? COMPTE_DE_LA_MACHINE,
      passage.projet,
      passage.ecriture ? 1 : 0,
      passage.geste === true ? 1 : 0,
      passage.bailMs ?? BAIL_MS,
      instant,
    ).dernierId;

  // L'instant où la prochaine écriture du compte peut partir.
  const prochaineEcriture = (compte: string, instant: number): number => {
    const [minute] = base.lire<{ n: number; premier: number | null; dernier: number | null }>(
      "SELECT count(*) AS n, min(instant) AS premier, max(instant) AS dernier FROM departs WHERE compte = ? AND instant > ?",
      compte,
      instant - MINUTE_MS,
    );
    const [heure] = base.lire<{ n: number; premier: number | null }>("SELECT count(*) AS n, min(instant) AS premier FROM departs WHERE compte = ? AND instant > ?", compte, instant - HEURE_MS);
    let quand = instant;
    if (minute !== undefined && minute.n >= budgets.ecrituresParMinute && minute.premier !== null) quand = Math.max(quand, minute.premier + MINUTE_MS);
    if (heure !== undefined && heure.n >= budgets.ecrituresParHeure && heure.premier !== null) quand = Math.max(quand, heure.premier + HEURE_MS);
    if (minute !== undefined && minute.n >= rafale && minute.dernier !== null) quand = Math.max(quand, minute.dernier + ecart);
    return quand;
  };

  // Donne les places libres du compte à qui y a droit, de tout process. Rend
  // l'instant où une écriture qui attend pourra partir, si c'est l'allure qui la retient.
  const accorder = (compte: string, instant: number): number => {
    for (;;) {
      const [vol] = base.lire<{ n: number }>("SELECT count(*) AS n FROM en_vol WHERE compte = ?", compte);
      if ((vol?.n ?? 0) >= budgets.simultanees) return Number.POSITIVE_INFINITY;
      const libre = prochaineEcriture(compte, instant);
      const [elue] = base.lire<{ id: number; projet: string; ecriture: number; bail: number }>(
        `SELECT a.id, a.projet, a.ecriture, a.bail FROM attente a LEFT JOIN tours t ON t.compte = a.compte AND t.projet = a.projet
         WHERE a.compte = ? AND a.accorde IS NULL AND (a.ecriture = 0 OR (? AND a.retenu <= ?))
         ORDER BY a.geste DESC, COALESCE(t.rang, 0) ASC, a.id ASC LIMIT 1`,
        compte,
        libre <= instant ? 1 : 0,
        instant,
      );
      if (elue === undefined) {
        const [ecriture] = base.lire("SELECT 1 FROM attente WHERE compte = ? AND accorde IS NULL AND ecriture = 1 AND retenu <= ? LIMIT 1", compte, instant);
        return ecriture !== undefined && libre > instant ? libre : Number.POSITIVE_INFINITY;
      }
      base.executer("UPDATE attente SET accorde = ? WHERE id = ?", instant, elue.id);
      base.executer("INSERT OR REPLACE INTO en_vol (id, compte, bail) VALUES (?, ?, ?)", elue.id, compte, instant + elue.bail);
      if (elue.ecriture === 1) base.executer("INSERT INTO departs (instant, compte) VALUES (?, ?)", instant, compte);
      base.executer(
        "INSERT INTO tours (compte, projet, rang) SELECT ?, ?, COALESCE(max(rang), 0) + 1 FROM tours WHERE compte = ? ON CONFLICT (compte, projet) DO UPDATE SET rang = excluded.rang",
        compte,
        elue.projet,
        compte,
      );
    }
  };

  const retenueDe = (passage: Passage): number => {
    if (!passage.ecriture || passage.geste === true || passage.retenue === undefined) return 0;
    try {
      const ms = passage.retenue();
      return Number.isFinite(ms) && ms > 0 ? ms : 0;
    } catch {
      return 0;
    }
  };

  // Un tour de file : les places libres données, les requêtes de ce process
  // qui en ont reçu une partent, et les autres relisent la file au plus tard
  // dans `SONDER_MS`.
  const pomper = (): void => {
    demandee = false;
    if (fermee) return;
    annulerLeReveil?.();
    annulerLeReveil = null;
    const instant = maintenant();
    let prochain = instant + SONDER_MS;
    let parties: number[] = [];
    try {
      base.transaction(() => {
        // Ce process se dit vivant avant que les morts sortent ; si un autre l'a
        // cru mort (un tour retardé de plus d'`ABANDON_MS`), ses requêtes reprennent leur place.
        // Une fois toutes les `VIVANT_MS` : la file en attend des centaines.
        if (instant - vivantLe >= VIVANT_MS) {
          vivantLe = instant;
          const { changements } = base.executer("UPDATE attente SET vu = ? WHERE proprio = ?", instant, proprio);
          if (changements < locales.size) for (const [id, { passage }] of locales) inscrire(id, passage, instant);
        }
        base.executer("DELETE FROM en_vol WHERE bail <= ?", instant);
        base.executer("DELETE FROM attente WHERE vu <= ?", instant - ABANDON_MS);
        base.executer("DELETE FROM departs WHERE instant <= ?", instant - HEURE_MS);
        for (const [id, attendue] of locales) {
          const ms = retenueDe(attendue.passage);
          const retenu = ms > 0 ? instant + ms : 0;
          if (retenu !== attendue.retenu) base.executer("UPDATE attente SET retenu = ? WHERE id = ?", retenu, id);
          attendue.retenu = retenu;
          if (retenu > 0) prochain = Math.min(prochain, retenu);
        }
        for (const { compte } of base.lire<{ compte: string }>("SELECT DISTINCT compte FROM attente WHERE accorde IS NULL")) prochain = Math.min(prochain, accorder(compte, instant));
        parties = base.lire<{ id: number }>("SELECT id FROM attente WHERE proprio = ? AND accorde IS NOT NULL", proprio).map(({ id }) => id);
        base.executer("DELETE FROM attente WHERE proprio = ? AND accorde IS NOT NULL", proprio);
      });
    } catch {
      // La file ne se lit pas (un autre process la tient trop longtemps) : le prochain tour la relira.
      parties = [];
    }
    for (const id of parties) {
      const attendue = locales.get(id);
      locales.delete(id);
      if (attendue === undefined) {
        sansLever(() => base.executer("DELETE FROM en_vol WHERE id = ?", id));
        continue;
      }
      attendue.quitter();
      attendue.resoudre(sortie(id));
    }
    if (locales.size > 0) annulerLeReveil = programmer(Math.max(1, prochain - instant), pomper);
  };

  const demanderUnTour = (): void => {
    if (demandee || fermee) return;
    demandee = true;
    queueMicrotask(pomper);
  };

  const sortie = (id: number) => {
    let rendue = false;
    return () => {
      if (rendue || fermee) return;
      rendue = true;
      sansLever(() => base.executer("DELETE FROM en_vol WHERE id = ?", id));
      demanderUnTour();
    };
  };

  const allure: Allure = {
    entrer(passage) {
      return new Promise((resoudre, rejeter) => {
        if (fermee) return rejeter(new Error("l'allure GitHub est fermée"));
        if (passage.signal?.aborted) return rejeter(passage.signal.reason);
        const id = inscrire(null, passage, maintenant());
        const abandonner = () => {
          if (!locales.delete(id)) return;
          sansLever(() => base.transaction(() => {
            base.executer("DELETE FROM attente WHERE id = ?", id);
            base.executer("DELETE FROM en_vol WHERE id = ?", id);
          }));
          rejeter(passage.signal?.reason);
          demanderUnTour();
        };
        passage.signal?.addEventListener("abort", abandonner, { once: true });
        locales.set(id, { passage, retenu: 0, resoudre, rejeter, quitter: () => passage.signal?.removeEventListener("abort", abandonner) });
        demanderUnTour();
      });
    },
    async passer(passage, faire) {
      const sortir = await allure.entrer(passage);
      try {
        return await faire();
      } finally {
        sortir();
      }
    },
    fermer() {
      if (fermee) return;
      fermee = true;
      annulerLeReveil?.();
      for (const attendue of locales.values()) {
        attendue.quitter();
        attendue.rejeter(new Error("l'allure GitHub est fermée"));
      }
      locales.clear();
      sansLever(() => base.executer("DELETE FROM attente WHERE proprio = ?", proprio));
      base.fermer();
    },
  };
  return allure;
}

const sansLever = (faire: () => unknown): void => {
  try {
    faire();
  } catch {}
};

// Le temps avant que le compte rende ses écritures, d'après la limite que
// GitHub lui a dite (`github-limite.ts`), sur l'horloge de qui la lit. L'état
// ne nomme que la limite qui dure le plus : sous plusieurs comptes, elle retient
// les écritures de tous.
export const retenueDuCompte = (limites: LimitesDuCompte, maintenant: () => number = Date.now) => (): number => {
  const limite = limites.courante();
  return limite === null ? 0 : Math.max(0, Date.parse(limite.backAt) - maintenant());
};

// L'allure de la station dont `racine` est le répertoire.
export function allureDeLaStation(racine: string, options: Omit<OptionsAllure, "fichier"> = {}): Allure {
  const repertoire = join(racine, REPERTOIRE_COMPTEUR);
  mkdirSync(repertoire, { recursive: true });
  return ouvrirAllure({ ...options, fichier: join(repertoire, FICHIER_ALLURE) });
}

let duProcess: Allure | null = null;

// Celle que prennent `github.ts` et les autres appels de `gh api` quand on ne
// leur en donne pas : celle de la station dont ce process a l'environnement
// (`BRIGADE_STATION_DIR`), sinon une allure en mémoire, propre au process —
// sous les budgets que dit cet environnement.
export function allureDuProcess(): Allure {
  if (duProcess === null) {
    const budgets = lireLesBudgets(process.env);
    const racine = process.env.BRIGADE_STATION_DIR;
    duProcess = racine ? allureDeLaStation(racine, { budgets }) : ouvrirAllure({ budgets });
  }
  return duProcess;
}
