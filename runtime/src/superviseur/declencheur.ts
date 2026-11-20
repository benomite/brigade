// Le déclencheur du superviseur (spec 2026-11-20-kitchen-spinning, section B,
// ticket #3943) : il dit si le superviseur se réveille pour un projet, et
// pourquoi. Il se réveille dans l'un de trois cas :
// - rien n'a été mergé depuis 30 min alors qu'un ticket est cuisinable ;
// - un ticket a été pris 3 fois sans livrer ;
// - `main` est rouge depuis 10 min.
//
// Sans E/S : il reçoit ce qui a été observé du projet, et rend la cause du
// réveil — ou null.
//
// Le compte des 30 min part du plus récent de deux repères, comme celui de la
// cuisine retenue (`retenue/retenue.ts`) : le dernier merge, et le moment où le
// plus ancien des tickets cuisinables a commencé d'attendre — un ticket arrivé
// sur un rail vide n'a pas attendu les heures où rien n'était à cuisiner.
export const SANS_MERGE_MS = 30 * 60_000;
export const PRISES_SANS_LIVRER = 3;
export const MAIN_ROUGE_MS = 10 * 60_000;

// Ce qui a été observé du projet. Instants ISO, nuls quand ils ne se savent
// pas. `cuisinables` : les tickets qu'un cook peut prendre, et depuis quand ils
// le sont. `prises` : pour chaque ticket, combien de fois il a été pris sans
// livrer. `mainRougeDepuis` : depuis quand `main` est rouge, nul quand il est vert.
export type FaitsDuProjet = {
  dernierMerge: string | null;
  cuisinables: ReadonlyArray<{ ticket: number; depuis: string }>;
  prises: ReadonlyArray<{ ticket: number; prises: number }>;
  mainRougeDepuis: string | null;
};

// La cause du réveil, et le ticket en faute quand elle en nomme un : la tête
// des cuisinables, ou le ticket pris sans livrer. `main` rouge n'en nomme aucun.
export type Reveil =
  | { cause: "no-merge"; since: string; ticket: number }
  | { cause: "takes"; takes: number; ticket: number }
  | { cause: "main-red"; since: string; ticket: null };

const instant = (iso: string | null): number | null => {
  const ms = iso === null ? Number.NaN : Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

// Le réveil à `maintenant`, ou null. Quand plusieurs causes tiennent, la plus
// précise l'emporte : `main` rouge, puis le ticket pris sans livrer, puis le
// rail sans merge.
export function reveil(faits: FaitsDuProjet, maintenant: Date): Reveil | null {
  const rouge = instant(faits.mainRougeDepuis);
  if (rouge !== null && maintenant.getTime() - rouge >= MAIN_ROUGE_MS) return { cause: "main-red", since: faits.mainRougeDepuis as string, ticket: null };
  const [plusPris] = [...faits.prises].sort((a, b) => b.prises - a.prises);
  if (plusPris !== undefined && plusPris.prises >= PRISES_SANS_LIVRER) return { cause: "takes", takes: plusPris.prises, ticket: plusPris.ticket };
  const [tete] = faits.cuisinables;
  if (tete === undefined) return null;
  const attente = Math.min(...faits.cuisinables.map(({ depuis }) => instant(depuis) ?? Number.POSITIVE_INFINITY));
  const merge = instant(faits.dernierMerge) ?? Number.NEGATIVE_INFINITY;
  const depuis = Math.max(attente, merge);
  if (!Number.isFinite(depuis) || maintenant.getTime() - depuis < SANS_MERGE_MS) return null;
  return { cause: "no-merge", since: new Date(depuis).toISOString(), ticket: tete.ticket };
}
