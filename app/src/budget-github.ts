// Le budget GitHub de l'app (#3007, épique #2994) : l'app lit GitHub avec le jeton du `gh` du chef — 5 000 demandes
// par heure, que le `gh` du chef dépense aussi. Six projets ouverts toute la journée, l'app seule doit rester loin
// dessous (au plus 1 000 demandes comptées par heure). Trois freins, posés sur la lecture du rail (main.ts) :
//   - les lectures conditionnelles : l'ETag gardé repart en `If-None-Match`, et un 304 ne coûte rien
//     (tableau/rail-github.ts, `lectureConditionnelle`) ;
//   - les veilles lancées ensemble ne font qu'une lecture par projet (tableau/rail.ts, `fraicheurMs`, plafonnée à 4 s : vue/served/fraicheur.ts) ;
//   - la pause, ici : quand ce que GitHub dit rester du budget (`x-ratelimit-remaining`) passe sous 20 % de son total,
//     ou qu'il refuse une demande pour dépassement, plus aucune lecture ne part, pour aucun projet, jusqu'à l'heure où
//     il dit que le budget se remplit (`x-ratelimit-reset`, ou `retry-after`). Chaque projet garde alors son dernier
//     rail lu.
// Le compteur dit ce que l'app a demandé dans la dernière heure : toutes les demandes parties, et celles que GitHub
// compte (tout sauf un 304).
import type { CallGitHub, AnswerGitHub } from "./tableau/client.ts";
import type { ReadDuTableauDuRepository, TableauLu, TableauNonLu } from "./tableau/read.ts";

// Sous cette part du budget, les lectures s'arrêtent : le reste est au chef.
export const THRESHOLD_DU_BUDGET = 0.2;
// La pause quand GitHub ne dit pas quand reprendre — ni `retry-after`, ni `x-ratelimit-reset` à venir : une minute,
// ce que GitHub demande d'attendre au moins après un refus ; la réponse suivante redit où en est le budget.
export const PAUSE_SANS_HEURE_MS = 60_000;
// Sous cette part de ce que GitHub dit dépensé, l'app n'est pas seule à dépenser : le message le dit.
export const PART_DE_L_APP_MINIMALE = 0.25;
const HEURE_MS = 3_600_000;

// Une demande que la pause retient : elle ne part pas.
export class LecturesEnPause extends Error {
  readonly jusqua: number;
  constructor(jusqua: number) {
    super(`the app paused its GitHub reads until ${heureDe(jusqua)} to spare the hourly GitHub budget`);
    this.jusqua = jusqua;
  }
}

// L'heure s'écrit à la minute, arrondie vers le haut : une heure déjà passée à l'écran l'est vraiment, un clic dessus lit.
const heureDe = (instant: number) => `${new Date(Math.ceil(instant / 60_000) * 60_000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const messageDe = (data: unknown): string => (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string" ? data.message : typeof data === "string" ? data : "");

// Un refus pour dépassement : un 429, ou un 403 qui le dit — plus rien du budget, un `retry-after`, ou son message.
export function refusalPourDepassement({ status, data, limite: limit, reessayerApresMs }: AnswerGitHub): boolean {
  if (status === 429) return true;
  return status === 403 && (limit?.restant === 0 || reessayerApresMs !== undefined || /rate limit/i.test(messageDe(data)));
}

export type BudgetGitHub = ReturnType<typeof holdLeBudgetGitHub>;

export function holdLeBudgetGitHub(options: { maintenant?: () => number; seuil?: number } = {}) {
  const maintenant = options.maintenant ?? Date.now;
  const threshold = options.seuil ?? THRESHOLD_DU_BUDGET;
  let resumption = 0;
  let pourquoi = "";
  // Ce que GitHub dit dépensé sur le budget quand la pause en cours a été posée ; absent s'il ne le dit pas.
  let depense: number | null = null;
  // L'instant de chaque demande partie dans la dernière heure, et de chacune que GitHub a comptée.
  const parties: number[] = [];
  const comptees: number[] = [];
  const purger = (instants: number[], a: number) => {
    while (instants.length > 0 && instants[0]! <= a - HEURE_MS) instants.shift();
  };
  const pauser = (jusqua: number, raison: string, limit?: AnswerGitHub["limite"]) => {
    if (jusqua <= resumption) return;
    resumption = jusqua;
    pourquoi = raison;
    depense = limit === undefined ? null : limit.total - limit.restant;
  };
  // Ce que la réponse dit du budget : un refus, ou un reste sous le seuil, met tout en pause.
  const observer = (answer: AnswerGitHub, a: number) => {
    const { limite: limit, reessayerApresMs } = answer;
    if (refusalPourDepassement(answer)) {
      const jusqua = reessayerApresMs !== undefined ? a + reessayerApresMs : limit !== undefined && limit.repriseLe > a ? limit.repriseLe : a + PAUSE_SANS_HEURE_MS;
      pauser(jusqua, `GitHub refused a read for going over the rate limit (HTTP ${answer.status})`, limit);
      return;
    }
    if (limit !== undefined && limit.restant < threshold * limit.total) {
      pauser(limit.repriseLe > a ? limit.repriseLe : a + PAUSE_SANS_HEURE_MS, `only ${limit.restant} of the ${limit.total} hourly GitHub requests are left, under ${Math.round(threshold * 100)}%`, limit);
    }
  };
  return {
    // Le `GET` de l'app sous le budget : rien ne part pendant la pause (`LecturesEnPause`), et chaque réponse est lue.
    appeler(call: CallGitHub): CallGitHub {
      return async (chemin, entetes) => {
        const avant = maintenant();
        if (avant < resumption) throw new LecturesEnPause(resumption);
        // Ce qui a plus d'une heure sort du compteur à chaque demande : il ne grossit pas sans fin.
        purger(parties, avant);
        parties.push(avant);
        const answer = await call(chemin, entetes);
        const a = maintenant();
        purger(comptees, a);
        if (answer.status !== 304) comptees.push(a);
        observer(answer, a);
        return answer;
      };
    },
    // L'heure où les lectures reprennent ; nulle quand elles ne sont pas en pause.
    enPauseJusqua(): number | null {
      return maintenant() < resumption ? resumption : null;
    },
    // Les demandes de la dernière heure : parties, et comptées par GitHub (tout sauf un 304).
    demandesDeLaDerniereHeure(): { parties: number; comptees: number } {
      const a = maintenant();
      purger(parties, a);
      purger(comptees, a);
      return { parties: parties.length, comptees: comptees.length };
    },
    // Ce que GitHub dit dépensé quand la pause a été posée ; nul hors pause, ou s'il ne le dit pas.
    depenseDuCompte(): number | null {
      return maintenant() < resumption ? depense : null;
    },
    // La raison de la pause en cours, en une phrase ; vide hors pause.
    raison(): string {
      return maintenant() < resumption ? pourquoi : "";
    },
  };
}

// La lecture d'un projet sous le budget : en pause, rien ne part — le projet garde son dernier rail lu (`dernier`),
// et faute d'en avoir un, la lecture dit la pause et jusqu'à quand. Une lecture que la pause a coupée en route
// (un refus, un seuil franchi, une demande retenue) est remplacée de même : la pause n'est pas une panne.
export async function readSousBudget(options: { budget: BudgetGitHub; depot: string; lire: () => Promise<ReadDuTableauDuRepository>; dernier: () => TableauLu | undefined; maintenant?: () => number }): Promise<ReadDuTableauDuRepository> {
  const { budget, depot: repository } = options;
  const enPause = (): ReadDuTableauDuRepository | null => {
    const jusqua = budget.enPauseJusqua();
    if (jusqua === null) return null;
    return options.dernier() ?? readEnPause(budget, repository, jusqua, options.maintenant?.() ?? Date.now());
  };
  const avant = enPause();
  if (avant !== null) return avant;
  const lue = await options.lire();
  return lue.lu ? lue : (enPause() ?? lue);
}

function readEnPause(budget: BudgetGitHub, repository: string, jusqua: number, a: number): TableauNonLu {
  const { comptees } = budget.demandesDeLaDerniereHeure();
  const depense = budget.depenseDuCompte();
  const autre = depense !== null && depense > 0 && comptees < PART_DE_L_APP_MINIMALE * depense ? ` Something else uses the quota on this account: GitHub counts ${depense} requests spent, the app only ${comptees}.` : "";
  return { lu: false, depot: repository, luLe: new Date(a).toISOString(), raison: `The rail of ${repository} is not read until ${heureDe(jusqua)}: ${budget.raison()}, so the app paused its GitHub reads for every project (${comptees} counted requests in the last hour).${autre}` };
}
