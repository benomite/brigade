// Le déclenchement du superviseur (#3914, spec 2026-11-20-kitchen-spinning, B) :
// un seul déclencheur à la place des détecteurs qui se chevauchaient. Il
// part sur un projet quand l'un de ces trois faits tient :
//   - rien n'a été mergé depuis 30 min alors qu'un ticket est cuisinable ;
//   - un ticket a été pris 3 fois sans livrer ;
//   - `main` est rouge depuis 10 min.
// Ce module ne lit rien : il juge ce que l'observation du tour lui donne
// (`observation.ts`), et rend la cause, ou rien.

export const RIEN_LIVRE_MS = 30 * 60_000;
export const PRISES_MAX = 3;
export const BASE_ROUGE_MS = 10 * 60_000;

// Ce que le tour a vu de la cuisine. `dernierMerge` : le dernier merge vu,
// à défaut `ouverture`, quand la cuisine a commencé de regarder — nul des deux,
// rien ne se compte. `prises` : combien de fois chaque ticket ouvert a été pris
// sans être servi. `baseRougeDepuis` : depuis quand la base est rouge, nul si
// elle ne l'est pas ; `checksRouges`, ses checks rouges.
export type Observation = {
  dernierMerge: string | null;
  ouverture?: string | null;
  ticketCuisinable: boolean;
  prises: readonly { ticket: number; prises: number }[];
  baseRougeDepuis: string | null;
  checksRouges?: readonly string[];
};

export type Declenchement =
  | { cause: "base-rouge"; check?: string }
  | { cause: "prises-sans-livraison"; ticket: number }
  | { cause: "rien-livre" };

const depuis = (iso: string, maintenant: Date) => maintenant.getTime() - Date.parse(iso);

// La cause qui déclenche le superviseur, ou null. Une base rouge passe avant
// tout : elle retient chaque livraison ; puis le ticket qui boucle, puis le
// rail qui ne bouge pas.
export function declencher(observation: Observation, maintenant: Date): Declenchement | null {
  const { baseRougeDepuis } = observation;
  if (baseRougeDepuis !== null && depuis(baseRougeDepuis, maintenant) >= BASE_ROUGE_MS) {
    const check = observation.checksRouges?.[0];
    return check === undefined ? { cause: "base-rouge" } : { cause: "base-rouge", check };
  }
  const boucle = [...observation.prises].filter(({ prises }) => prises >= PRISES_MAX).sort((a, b) => b.prises - a.prises || a.ticket - b.ticket)[0];
  if (boucle !== undefined) return { cause: "prises-sans-livraison", ticket: boucle.ticket };
  const repere = observation.dernierMerge ?? observation.ouverture ?? null;
  if (observation.ticketCuisinable && repere !== null && depuis(repere, maintenant) >= RIEN_LIVRE_MS) return { cause: "rien-livre" };
  return null;
}

// Ce que le déclenchement dit, en une ligne anglaise.
export function direDeclenchement(declenchement: Declenchement): string {
  if (declenchement.cause === "base-rouge") return `main has been red for ${BASE_ROUGE_MS / 60_000} min${declenchement.check === undefined ? "" : ` (check \`${declenchement.check}\`)`}`;
  if (declenchement.cause === "prises-sans-livraison") return `#${declenchement.ticket} was taken ${PRISES_MAX} times without delivering`;
  return `nothing merged for ${RIEN_LIVRE_MS / 60_000} min while a ticket is cookable`;
}
