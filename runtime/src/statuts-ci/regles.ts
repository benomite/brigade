// Deux règles sur les résultats de CI, tirées des statuts par check d'une
// branche ou de `main` (#3953, épique #3950).
//
// Règle A — un `main` rouge est d'abord l'affaire de la cuisine : la relance de
// ses jobs en échec, puis son ticket de réparation (base-rouge/). Il ne va au
// chef que quand la cuisine ne peut pas le rendre vert seule, et alors en une
// carte TODO — la carte du produit, jamais un mail —, une seule tant que le
// rouge dure. `main` revenu au vert, la carte sort de TODO, comme sortent les
// autres. La carte n'a pas de ticket : sa clé en tient lieu, comme celle d'un
// check Windows rouge (carte-ci-windows.ts), dont elle reprend la tenue.
//
// Règle B — quand la CI d'un ticket est rouge sur le même check trois runs de
// suite, le ticket ne pousse plus : le runtime ne lance pas un quatrième run de
// cet échec, et écrit un commentaire sur son issue, qui nomme le check et les
// trois runs. Un run rouge sur un autre check, ou un run vert entre deux, remet
// le compte à zéro.
//
// Les statuts se lisent par une petite interface (`StatutsCi`) : les résultats
// d'une cible, du plus récent au plus ancien. Les règles s'éprouvent sur des
// doublures ; la station les lit des checks de la base (le tour) et des runs de
// la branche du ticket (`ciDeLaBranche`).
import { accuseeTantQueRouge, ticketDuCheck, type CheckVu } from "../carte-ci-windows.ts";
import { cartesEnTodo, cartesRetenues, entrerDansTodo, sortirDeTodo } from "../carte-todo.ts";
import { CONCLUSIONS_VERTES, ECHECS_ATTEINTS } from "../github.ts";
import type { Journal } from "../journal.ts";
import type { RunDeCi } from "../temps-ticket/ci-github.ts";

// Un résultat d'un check : son nom, son issue, le run qui l'a rendu (nul s'il
// n'est pas connu) et la tête qu'il a jugée — les résultats d'une même tête,
// ou à défaut d'un même run, font un seul run de la règle B.
export type ResultatDeCheck = { check: string; outcome: "red" | "green"; run: number | null; tete?: string };

// Les résultats d'une cible — `main`, ou `ticket:<n>` —, du plus récent au plus
// ancien. Aucun : la cible n'a encore rien de conclu.
export type StatutsCi = { resultats(cible: string): Promise<ResultatDeCheck[]> };

export const CIBLE_MAIN = "main";
export const cibleDuTicket = (ticket: number): string => `ticket:${ticket}`;

// Combien de runs rouges de suite sur le même check arrêtent les pushs d'un ticket.
export const ROUGES_DE_SUITE = 3;

export const MARQUE_DES_ROUGES = "<!-- brigade:rouges-de-suite";

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les runs, du plus récent au plus ancien : chacun avec ses résultats.
function parRun(resultats: readonly ResultatDeCheck[]): ResultatDeCheck[][] {
  const runs = new Map<string, ResultatDeCheck[]>();
  for (const resultat of resultats) {
    const cle = resultat.tete ?? `run:${resultat.run}`;
    runs.set(cle, [...(runs.get(cle) ?? []), resultat]);
  }
  return [...runs.values()];
}

// Les trois derniers runs, rouges sur un même check : ce check et ces runs, du
// plus récent au plus ancien. Nul sinon — moins de trois runs, un vert parmi
// eux, ou aucun check rouge dans les trois.
export function rougesDeSuite(resultats: readonly ResultatDeCheck[]): { check: string; runs: (number | null)[] } | null {
  const derniers = parRun(resultats).slice(0, ROUGES_DE_SUITE);
  if (derniers.length < ROUGES_DE_SUITE) return null;
  const rouges = derniers.map((run) => run.filter(({ outcome }) => outcome === "red"));
  const check = rouges[0]?.find(({ check }) => rouges.every((run) => run.some((rouge) => rouge.check === check)))?.check;
  if (check === undefined) return null;
  return { check, runs: rouges.map((run) => run.find((rouge) => rouge.check === check)?.run ?? null) };
}

const direLesRuns = (runs: readonly (number | null)[]) => runs.map((run) => (run === null ? "an unnamed run" : `run ${run}`)).join(", ");

export const commentaireDesRouges = ({ check, runs }: { check: string; runs: readonly (number | null)[] }): string =>
  `${MARQUE_DES_ROUGES} check=${check} -->\nThe CI of this ticket is red on \`${check}\` for the third time in a row (${direLesRuns(runs)}). The runtime does not push it again, so no fourth run of this failure starts: the ticket is set aside (\`${ECHECS_ATTEINTS}\`). Remove the label to try again; the count restarts from there.`;

// Ce que la règle B décide avant un push. `pousser` faux : le check et les
// runs qui l'arrêtent, et `nonDit` si le commentaire n'a pas pu s'écrire.
// `illisible` : les statuts ne se lisaient pas — le push part, la règle ne
// décide rien sans eux.
export type DecisionDuPush = { pousser: true; illisible?: string } | { pousser: false; check: string; runs: (number | null)[]; nonDit?: string };

export async function deciderDuPush({ statuts, ticket, commenter }: { statuts: StatutsCi; ticket: number; commenter: (issue: number, corps: string) => Promise<void> }): Promise<DecisionDuPush> {
  let resultats: ResultatDeCheck[];
  try {
    resultats = await statuts.resultats(cibleDuTicket(ticket));
  } catch (erreur) {
    return { pousser: true, illisible: message(erreur) };
  }
  const serie = rougesDeSuite(resultats);
  if (serie === null) return { pousser: true };
  try {
    await commenter(ticket, commentaireDesRouges(serie));
  } catch (erreur) {
    return { pousser: false, ...serie, nonDit: message(erreur) };
  }
  return { pousser: false, ...serie };
}

// La clé de la carte d'un `main` rouge : une par branche d'intégration.
export const ticketDuRougeDe = (branche: string): number => ticketDuCheck("red main", branche);

const AUTEUR = "runtime";

// Ce que la règle A a fait d'une évaluation. `illisible` : les statuts, ou ce
// que la cuisine peut encore, ne se lisaient pas — rien n'a bougé.
export type EvaluationDeMain = { carte: "entree" | "sortie" | "aucune"; illisible?: string };

export type EntreeDeMain = {
  statuts: StatutsCi;
  journal: Journal;
  projet: string;
  // Vrai tant qu'une relance ou un ticket de réparation peut encore rendre `main` vert.
  cuisinePeutReparer: () => Promise<boolean>;
  // Le nom de la branche d'intégration, que la carte dit ; `main` par défaut.
  branche?: string;
};

export async function evaluerMain({ statuts, journal, projet, cuisinePeutReparer, branche = CIBLE_MAIN }: EntreeDeMain): Promise<EvaluationDeMain> {
  let derniers: ResultatDeCheck[];
  let reparable: boolean;
  try {
    // Le dernier résultat de chaque check.
    const vus = new Map<string, ResultatDeCheck>();
    for (const resultat of await statuts.resultats(CIBLE_MAIN)) if (!vus.has(resultat.check)) vus.set(resultat.check, resultat);
    derniers = [...vus.values()];
    // Lu avant la carte : rien n'attend entre ce que TODO porte et ce qui y entre.
    reparable = derniers.some(({ outcome }) => outcome === "red") ? await cuisinePeutReparer() : true;
  } catch (erreur) {
    return { carte: "aucune", illisible: message(erreur) };
  }
  if (derniers.length === 0) return { carte: "aucune" };
  const ticket = ticketDuRougeDe(branche);
  const enTodo = cartesEnTodo(journal.base).some((carte) => carte.ticket === ticket);
  const rouges = derniers.filter(({ outcome }) => outcome === "red").map(({ check }) => check);
  if (rouges.length !== 0) {
    const pourquoi = `${branche} is green again`;
    if (enTodo) return { carte: sortirDeTodo(journal, projet, ticket, pourquoi, AUTEUR) ? "sortie" : "aucune" };
    if (accuseeTantQueRouge(journal, ticket)) journal.ajouter({ project: projet, ticket, author: AUTEUR, type: "todo.left", payload: { why: pourquoi } });
    return { carte: "aucune" };
  }
  // La cuisine peut encore le rendre vert : il est à elle. Une carte déjà dans
  // TODO, retenue par le triage, ou à laquelle le chef a répondu tant que le
  // rouge dure : rien n'est reproposé.
  if (reparable || enTodo || accuseeTantQueRouge(journal, ticket) || cartesRetenues(journal.base).some((carte) => carte.ticket === ticket)) return { carte: "aucune" };
  const entree = entrerDansTodo(journal, projet, ticket, {
    type: "product",
    raison: "product-choice",
    resume: `${branche} is red on ${rouges.join(", ")}, and the kitchen cannot make it green by itself. Its retry and its repair ticket are spent.`,
    enonce: `Will you take the red ${rouges.join(", ")} on ${branche} in hand yourself?`,
    // La carte n'a pas d'issue : reponse-carte.ts n'enregistre que la réponse
    // (ticket négatif), et la carte ne revient pas avant le vert.
    choix: [
      { texte: `Yes, I take it in hand, the card clears when ${branche} turns green`, suite: "resume" },
      { texte: `Dismiss this card now, it comes back only if ${branche} turns red again`, suite: "drop" },
    ],
  }, AUTEUR);
  return { carte: entree.porte === "todo" ? "entree" : "aucune" };
}

// Les statuts de `main` tels que le tour les a lus : chaque check conclu de la
// base, son dernier résultat. Un check qui tourne n'en rend aucun.
export function statutsDesChecks(checks: readonly CheckVu[]): StatutsCi {
  return {
    resultats: async (cible) => (cible === CIBLE_MAIN ? checks.flatMap(({ name, outcome }) => (outcome === "pending" ? [] : [{ check: name ?? "unnamed check", outcome, run: null }])) : []),
  };
}

// Les conclusions d'un job qui sont un échec. Les autres non vertes — annulé,
// en attente d'une action — ne concluent rien.
const CONCLUSIONS_ROUGES = ["failure", "timed_out", "startup_failure"];

// Les statuts d'un ticket lus des runs de GitHub Actions de sa branche, créés
// après `depuis` (en ms, le dernier relancement du ticket) : chaque job
// conclu, du run le plus récent au plus ancien.
export function statutsDesRuns(lireLesRuns: (branche: string) => Promise<RunDeCi[]>, brancheDuTicket: (ticket: number) => string, depuis: number): StatutsCi {
  return {
    resultats: async (cible) => {
      const ticket = /^ticket:(\d+)$/.exec(cible)?.[1];
      if (ticket === undefined) return [];
      const runs = (await lireLesRuns(brancheDuTicket(Number(ticket)))).filter(({ creeLe }) => Date.parse(creeLe) > depuis);
      runs.sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe));
      return runs.flatMap(({ id, tete, jobs }) =>
        jobs.flatMap(({ nom, conclusion }): ResultatDeCheck[] => {
          const outcome = CONCLUSIONS_VERTES.includes(conclusion ?? "") ? "green" : CONCLUSIONS_ROUGES.includes(conclusion ?? "") ? "red" : null;
          return nom === undefined || outcome === null ? [] : [{ check: nom, outcome, run: id ?? null, tete }];
        }),
      );
    },
  };
}
