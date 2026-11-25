// L'écran du rail, haut du backlog (ticket 4223, épique 4131) : les issues que runtime/src/rail-backlog/rail-backlog.ts
// (`topDuBacklog`) range, dans cet ordre, une ligne chacune — son numéro, sa priorité, son titre ; ce qu'on lui donne d'autre,
// il ne le montre pas. Le rail se lit, il ne se remplit pas : une issue y vient d'être calibrée et prête, sans geste du chef,
// et l'écran n'en a donc aucun.
//
// La lecture du rail (github.ts, `avecLeRail`) pose ses issues dans les faits sous `hautDuBacklog` ; faits.ts les relit
// (`hautDuBacklogLu`), en compose l'écran, et la vue le pose au-dessus des colonnes (haut-du-backlog.js).
import { prioriteDe, topDuBacklog, type IssueDuBacklog } from "../../../../runtime/src/rail-backlog/rail-backlog.ts";

const RIEN = "Nothing calibrated and ready in the backlog.";

const echappe = (texte: string): string => texte.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function ligne(issue: IssueDuBacklog): string {
  const niveau = prioriteDe(issue.labels);
  const prio = niveau === null ? "" : `<span class="rail-backlog-prio">prio ${niveau}</span> `;
  return `<li class="rail-backlog-issue"><span class="rail-backlog-numero">#${issue.number}</span> ${prio}<span class="rail-backlog-titre">${echappe(issue.title)}</span></li>`;
}

// Le rail : le haut du backlog de ces issues — le même, dans le même ordre, quand elles le sont déjà.
export function htmlDuRail(issues: readonly IssueDuBacklog[]): string {
  const haut = topDuBacklog(issues);
  if (haut.length === 0) return `<p class="rail-backlog-vide">${RIEN}</p>`;
  return `<ol class="rail-backlog">${haut.map(ligne).join("")}</ol>`;
}

// Le haut du backlog tel que la lecture du rail le pose dans les faits : ses issues, dans l'ordre du rail, avec ce qui
// les range — pas d'écran : la lecture des faits le compose elle-même (`hautDuBacklogLu`), et n'affiche rien qu'elle n'ait échappé.
export type HautDuBacklogDesFaits = { issues: (IssueDuBacklog & { url: string })[] };
// Le haut du backlog tel que la vue le reçoit : ses issues, dans l'ordre du rail, et leur écran (`htmlDuRail`).
export type HautDuBacklog = { issues: { number: number; title: string; url: string }[]; html: string };

// `hautDuBacklog`, de la racine de `facts` (faits.ts, `comprendre`) : rien de mal formé ne le pose — la vue ne montre
// alors pas le rail du backlog, plutôt qu'un rail inventé. L'écran se compose ici, des issues lues : un `html` que les
// faits porteraient n'est jamais lu, et un titre n'y entre qu'échappé.
export function hautDuBacklogLu(valeur: unknown): { hautDuBacklog?: HautDuBacklog } {
  if (typeof valeur !== "object" || valeur === null) return {};
  const { issues } = valeur as { issues?: unknown };
  if (!Array.isArray(issues)) return {};
  const lues = issues.flatMap((issue: unknown) => {
    const { number, title, url, labels, createdAt } = (typeof issue === "object" && issue !== null ? issue : {}) as Record<string, unknown>;
    const ok = typeof number === "number" && typeof title === "string" && typeof url === "string" && typeof createdAt === "string" && Array.isArray(labels) && labels.every((label) => typeof label === "string");
    return ok ? [{ number, title, url, labels: labels as string[], createdAt }] : [];
  });
  if (lues.length !== issues.length) return {};
  return { hautDuBacklog: { issues: topDuBacklog(lues).map(({ number, title, url }) => ({ number, title, url })), html: htmlDuRail(lues) } };
}
