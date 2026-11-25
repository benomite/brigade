// L'écran du rail, haut du backlog (#4223, épique #4131) : les issues que runtime/src/rail-backlog/rail-backlog.ts
// (`topDuBacklog`) range, dans cet ordre, une ligne chacune — son numéro, sa priorité, son titre ; ce qu'on lui donne d'autre,
// il ne le montre pas. Le rail se lit, il ne se remplit pas : une issue y vient d'être calibrée et prête, sans geste du chef,
// et l'écran n'en a donc aucun.
//
// La lecture du rail (github.ts, `avecLeRail`) le compose dans le process principal et le pose dans les faits.
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
