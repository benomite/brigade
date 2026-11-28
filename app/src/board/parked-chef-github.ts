// Un ticket que la nouvelle cuisine parque pour le chef (runtime/src/kitchen/, #4474) : le label `parked:chef`, et un
// commentaire de la cuisine qui commence par « Parked for the chef » et dit pourquoi — le cook qui a écrit `PARK:`, le
// manager, ou les renvois épuisés. Sa carte de TODO pose ce commentaire, le dernier, tel quel ; elle n'a qu'un geste,
// Answer : la réponse du chef est postée sur l'issue et `parked:chef` retiré — le ticket retourne sur le rail
// (board-actions/answer-github.ts). Rien n'est lu du runtime d'avant : l'issue et ses commentaires, sur GitHub.
import type { CardOfChef } from "./todo-github.ts";
import { LABELS } from "../../../runtime/src/kitchen/decide.ts";

export const LABEL_PARKED_CHEF = LABELS.parkedChef;
export const KIND_PARKED_CHEF = "parked-chef";
// Les auteurs dont un commentaire de la cuisine se croit : la cuisine écrit avec le `gh` de sa station.
const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];
const OF_THE_KITCHEN = /^\s*Parked for the chef\b/;
// Sans commentaire de la cuisine — le label posé à la main : la carte le dit, et demande quand même.
const WITHOUT_WHY = "Parked for the chef, with no kitchen comment that says why: read the issue, then answer.";

type Comment = { body?: unknown; created_at?: unknown; author_association?: unknown };

// Le dernier commentaire de la cuisine qui dit pourquoi le ticket est parqué, et quand ; nul s'il n'y en a aucun.
export function whyParked(comments: readonly Comment[]): { texte: string; le: string | null } | null {
  const said = [...comments].reverse().find(({ body, author_association }) => typeof body === "string" && OF_TRUST.includes(String(author_association)) && OF_THE_KITCHEN.test(body));
  if (said === undefined) return null;
  const the = typeof said.created_at === "string" && !Number.isNaN(Date.parse(said.created_at)) ? said.created_at : null;
  return { texte: (said.body as string).trim(), le: the };
}

// Le commentaire d'une PR que la passe approuve mais qui touche une zone à risque (`riskZoneComment`, runtime/src/epics.ts,
// #4489) : le chef la merge, par le geste `merge`. Il dit la PR et ses fichiers.
const OF_THE_RISK_ZONE = /^\s*The pass approves PR #(\d+), but /;
const isTrusted = ({ body, author_association }: Comment) => typeof body === "string" && OF_TRUST.includes(String(author_association));

// Le dernier commentaire de la cuisine qui attend le chef : la PR à merger et son texte ; nul si le dernier mot de la cuisine
// est un autre (« Parked for the chef », renvoi) ou s'il n'y en a pas.
export function riskZoneWaiting(comments: readonly Comment[]): { pr: number; texte: string } | null {
  const last = [...comments].reverse().find((one) => isTrusted(one) && (OF_THE_RISK_ZONE.test(one.body as string) || OF_THE_KITCHEN.test(one.body as string)));
  const found = last === undefined ? null : OF_THE_RISK_ZONE.exec(last.body as string);
  return found === null || last === undefined ? null : { pr: Number(found[1]), texte: (last.body as string).trim() };
}

// La carte d'une issue `parked:chef` : ce que la cuisine en dit, ou `SANS_POURQUOI`. Une PR qui attend le chef pour une zone
// à risque a son geste : Merge.
export function parkedChefCard(comments: readonly Comment[]): CardOfChef {
  const risk = riskZoneWaiting(comments);
  if (risk !== null) return { sorte: KIND_PARKED_CHEF, texte: `${risk.texte}\n- [merge] Merge PR #${risk.pr}` };
  return { sorte: KIND_PARKED_CHEF, texte: whyParked(comments)?.texte ?? WITHOUT_WHY };
}
