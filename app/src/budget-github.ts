// Le budget GitHub de l'app (#3007, épique #2994) : l'app lit GitHub avec le jeton du `gh` du chef — 5 000 demandes
// par heure, que le `gh` du chef dépense aussi. Six projets ouverts toute la journée, l'app seule doit rester loin
// dessous (au plus 1 000 demandes comptées par heure). Trois freins, posés sur la lecture du rail (main.ts) :
//   - les lectures conditionnelles : l'ETag gardé repart en `If-None-Match`, et un 304 ne coûte rien
//     (board/rail-github.ts, `lectureConditionnelle`) ;
//   - les veilles lancées ensemble ne font qu'une lecture par projet (board/rail.ts, `fraicheurMs`, plafonnée à 4 s : vue/served/freshness.ts) ;
//   - la pause, ici : quand ce que GitHub dit rester du budget (`x-ratelimit-remaining`) passe sous 20 % de son total,
//     ou qu'il refuse une demande pour dépassement, plus aucune lecture ne part, pour aucun projet, jusqu'à l'heure où
//     il dit que le budget se remplit (`x-ratelimit-reset`, ou `retry-after`). Chaque projet garde alors son dernier
//     rail lu.
// Le compteur dit ce que l'app a demandé dans la dernière heure : toutes les demandes parties, et celles que GitHub
// compte (tout sauf un 304).
import { spendersOfToken, type SpendersOfToken } from "./spenders-of-token.ts";
import type { CallGitHub, AnswerGitHub } from "./board/client.ts";
import type { ReadOfBoardOfRepository, BoardRead, BoardNotRead, PauseOfReads } from "./board/read.ts";

// Sous cette part du budget, les lectures s'arrêtent : le reste est au chef.
export const THRESHOLD_OF_BUDGET = 0.2;
// La pause quand GitHub ne dit pas quand reprendre — ni `retry-after`, ni `x-ratelimit-reset` à venir : une minute,
// ce que GitHub demande d'attendre au moins après un refus ; la réponse suivante redit où en est le budget.
export const PAUSE_WITHOUT_HOUR_MS = 60_000;
// Sous cette part de ce que GitHub dit dépensé, l'app n'est pas seule à dépenser : le message le dit.
export const PART_OF_THE_APP_MINIMAL = 0.25;
const HOUR_MS = 3_600_000;

// Une demande que la pause retient : elle ne part pas.
export class ReadsInPause extends Error {
  readonly jusqua: number;
  constructor(until: number) {
    super(`the app paused its GitHub reads until ${hourOf(until)} to spare the hourly GitHub budget`);
    this.jusqua = until;
  }
}

// L'heure s'écrit à la minute, arrondie vers le haut : une heure déjà passée à l'écran l'est vraiment, un clic dessus lit.
const hourOf = (instant: number) => `${new Date(Math.ceil(instant / 60_000) * 60_000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const messageOf = (data: unknown): string => (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string" ? data.message : typeof data === "string" ? data : "");

// Un refus pour dépassement : un 429, ou un 403 qui le dit — plus rien du budget, un `retry-after`, ou son message.
export function refusalForOverrun({ status, data, limite: limit, reessayerApresMs: retryAfterMs }: AnswerGitHub): boolean {
  if (status === 429) return true;
  return status === 403 && (limit?.restant === 0 || retryAfterMs !== undefined || /rate limit/i.test(messageOf(data)));
}

export type BudgetGitHub = ReturnType<typeof holdTheBudgetGitHub>;

export function holdTheBudgetGitHub(options: { maintenant?: () => number; seuil?: number } = {}) {
  const now = options.maintenant ?? Date.now;
  const threshold = options.seuil ?? THRESHOLD_OF_BUDGET;
  let resumption = 0;
  let why = "";
  // Ce que GitHub dit dépensé sur le budget quand la pause en cours a été posée ; absent s'il ne le dit pas.
  let spending: number | null = null;
  // Le reste et le total que GitHub disait quand la pause a été posée (#4620) ; absents s'il ne les dit pas.
  let remaining: { restant: number; total: number } | null = null;
  // L'instant de chaque demande partie dans la dernière heure, et de chacune que GitHub a comptée.
  const parties: number[] = [];
  const counted: number[] = [];
  const purge = (instants: number[], a: number) => {
    while (instants.length > 0 && instants[0]! <= a - HOUR_MS) instants.shift();
  };
  const pause = (until: number, reason: string, limit?: AnswerGitHub["limite"]) => {
    if (until <= resumption) return;
    resumption = until;
    why = reason;
    spending = limit === undefined ? null : limit.total - limit.restant;
    remaining = limit === undefined ? null : { restant: limit.restant, total: limit.total };
  };
  // Ce que la réponse dit du budget : un refus, ou un reste sous le seuil, met tout en pause.
  const observe = (answer: AnswerGitHub, a: number) => {
    const { limite: limit, reessayerApresMs: retryAfterMs } = answer;
    if (refusalForOverrun(answer)) {
      const until = retryAfterMs !== undefined ? a + retryAfterMs : limit !== undefined && limit.repriseLe > a ? limit.repriseLe : a + PAUSE_WITHOUT_HOUR_MS;
      pause(until, `GitHub refused a read for going over the rate limit (HTTP ${answer.status})`, limit);
      return;
    }
    if (limit !== undefined && limit.restant < threshold * limit.total) {
      pause(limit.repriseLe > a ? limit.repriseLe : a + PAUSE_WITHOUT_HOUR_MS, `only ${limit.restant} of the ${limit.total} hourly GitHub requests are left, under ${Math.round(threshold * 100)}%`, limit);
    }
  };
  return {
    // Le `GET` de l'app sous le budget : rien ne part pendant la pause (`LecturesEnPause`), et chaque réponse est lue.
    appeler(call: CallGitHub): CallGitHub {
      return async (path, headers) => {
        const before = now();
        if (before < resumption) throw new ReadsInPause(resumption);
        // Ce qui a plus d'une heure sort du compteur à chaque demande : il ne grossit pas sans fin.
        purge(parties, before);
        parties.push(before);
        const answer = await call(path, headers);
        const a = now();
        purge(counted, a);
        if (answer.status !== 304) counted.push(a);
        observe(answer, a);
        return answer;
      };
    },
    // L'heure où les lectures reprennent ; nulle quand elles ne sont pas en pause.
    enPauseJusqua(): number | null {
      return now() < resumption ? resumption : null;
    },
    // Les demandes de la dernière heure : parties, et comptées par GitHub (tout sauf un 304).
    demandesDeLaDerniereHeure(): { parties: number; comptees: number } {
      const a = now();
      purge(parties, a);
      purge(counted, a);
      return { parties: parties.length, comptees: counted.length };
    },
    // Ce que GitHub dit dépensé quand la pause a été posée ; nul hors pause, ou s'il ne le dit pas.
    depenseDuCompte(): number | null {
      return now() < resumption ? spending : null;
    },
    // Ce que GitHub dit rester du budget, et son total, quand la pause a été posée ; nul hors pause, ou s'il ne le dit pas.
    resteDuCompte(): { restant: number; total: number } | null {
      return now() < resumption ? remaining : null;
    },
    // La raison de la pause en cours, en une phrase ; vide hors pause.
    raison(): string {
      return now() < resumption ? why : "";
    },
  };
}

// La lecture d'un projet sous le budget : en pause, rien ne part — le projet garde son dernier rail lu (`dernier`),
// et faute d'en avoir un, la lecture dit la pause et jusqu'à quand. Une lecture que la pause a coupée en route
// (un refus, un seuil franchi, une demande retenue) est remplacée de même : la pause n'est pas une panne.
export async function readingUnderBudget(options: { signaler?: (report: SpendersOfToken, until: number) => void; budget: BudgetGitHub; depot: string; lire: () => Promise<ReadOfBoardOfRepository>; dernier: () => BoardRead | undefined; maintenant?: () => number }): Promise<ReadOfBoardOfRepository> {
  const { budget, depot: repository } = options;
  const inPause = (): ReadOfBoardOfRepository | null => {
    const until = budget.enPauseJusqua();
    if (until === null) return null;
    const spent = budget.depenseDuCompte();
    if (spent !== null && spent > 0) options.signaler?.(spendersOfToken({ spent, app: budget.demandesDeLaDerniereHeure().comptees }), until);
    const kept = options.dernier();
    if (kept === undefined) return readInPause(budget, repository, until, options.maintenant?.() ?? Date.now());
    return { ...kept, pause: pauseOf(budget, until) };
  };
  const before = inPause();
  if (before !== null) return before;
  const readEntry = await options.lire();
  return readEntry.lu ? readEntry : (inPause() ?? readEntry);
}

function pauseOf(budget: BudgetGitHub, until: number): PauseOfReads {
  const left = budget.resteDuCompte();
  return { jusqua: new Date(until).toISOString(), ...(left === null ? {} : left) };
}

function readInPause(budget: BudgetGitHub, repository: string, until: number, a: number): BoardNotRead {
  const { comptees: counted } = budget.demandesDeLaDerniereHeure();
  const spending = budget.depenseDuCompte();
  const report = spending === null || spending <= 0 ? null : spendersOfToken({ spent: spending, app: counted });
  const other = report === null ? "" : `${counted < PART_OF_THE_APP_MINIMAL * report.spent ? ` Something else uses the quota on this account: GitHub counts ${report.spent} requests spent, the app only ${counted}.` : ""} ${report.sentence}`;
  return { lu: false, depot: repository, luLe: new Date(a).toISOString(), pause: pauseOf(budget, until), raison: `The rail of ${repository} is not read until ${hourOf(until)}: ${budget.raison()}, so the app paused its GitHub reads for every project (${counted} counted requests in the last hour).${other}` };
}
