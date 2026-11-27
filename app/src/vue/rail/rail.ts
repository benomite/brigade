// Le rail, haut du backlog (ticket 4223, épique 4131) : les issues que runtime/src/rail-backlog/rail-backlog.ts
// (`topDuBacklog`) range, dans cet ordre. La lecture du rail (github.ts, `avecLeRail`) les pose dans les faits sous
// `hautDuBacklog` ; facts.ts les relit (`hautDuBacklogLu`), et la colonne Backlog de la vue les montre en tête, dans cet
// ordre (kitchen/kitchen.js, `planDeLaCuisine`). Aucun écran à part au-dessus des colonnes (ticket 4354).
import { topDuBacklog, type IssueDuBacklog } from "../../../../runtime/src/rail-backlog/rail-backlog.ts";

// Le haut du backlog tel que la lecture du rail le pose dans les faits : ses issues, dans l'ordre du rail, avec ce qui
// les range.
export type TopOfBacklogOfFacts = { issues: (IssueDuBacklog & { url: string })[] };
// Le haut du backlog tel que la vue le reçoit : ses issues, dans l'ordre du rail.
export type TopOfBacklog = { issues: { number: number; title: string; url: string }[] };

// `hautDuBacklog`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose — la colonne Backlog
// range alors ses tickets prêts sans lui, plutôt que sur un rail inventé.
export function topOfBacklogRead(value: unknown): { hautDuBacklog?: TopOfBacklog } {
  if (typeof value !== "object" || value === null) return {};
  const { issues } = value as { issues?: unknown };
  if (!Array.isArray(issues)) return {};
  const readEntries = issues.flatMap((issue: unknown) => {
    const { number, title, url, labels, createdAt } = (typeof issue === "object" && issue !== null ? issue : {}) as Record<string, unknown>;
    const ok = typeof number === "number" && typeof title === "string" && typeof url === "string" && typeof createdAt === "string" && Array.isArray(labels) && labels.every((label) => typeof label === "string");
    return ok ? [{ number, title, url, labels: labels as string[], createdAt }] : [];
  });
  if (readEntries.length !== issues.length) return {};
  return { hautDuBacklog: { issues: topDuBacklog(readEntries).map(({ number, title, url }) => ({ number, title, url })) } };
}
