import { LABELS_OF_ACTIONS, type Written } from "../../actions-github.ts";
import type { ClientOfThePriority } from "../../priority.ts";
import { refusalOf } from "../../board/client.ts";
import type { Input } from "./input.ts";

// Le label d'un ticket parqué (`parked`).
export const LABEL_PARKED = LABELS_OF_ACTIONS.cuisine;
// Ce que son déparquage fait de lui.
export const AT_THE_ARRIVAL = "it resumes exactly where it was";


// La marque en tête du commentaire de parking ; celle d'avant le ticket 4129, `brigade:waiting`, se lit encore.
const BRAND = "<!-- brigade:parked";
// Une date dite avec son année : `2026-11-16 15:05 UTC`.
const dateSaid = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

// Le commentaire qui parque le ticket : la marque, que `thirdOfComments` relit — `>` y est échappé : un `-->` des mots du
// chef ne la fermerait pas —, puis qui, quoi, jusqu'à quand. `relance` : minuit, au jour du poste, du jour que le chef a choisi.
export function brandOfWait({ quoi: what, qui: who }: { quoi: string; qui: string }, relaunch: Date): string {
  const followUp = relaunch.toISOString();
  return [
    `${BRAND} ${JSON.stringify({ what, who, followUp }).replace(/>/g, "\\u003e")} -->`,
    `**PARKED: waits for ${who}.** ${what}`,
    "",
    `- **who**: ${who}`,
    `- **for what**: ${what}`,
    `- **until**: ${dateSaid(followUp)}`,
    "",
    `As long as it carries \`${LABEL_PARKED}\`, the kitchen does not take it. Once \`${LABEL_PARKED}\` is removed, ${AT_THE_ARRIVAL}.`,
  ].join("\n");
}







const number = (ticket: unknown): ticket is number => typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket >= 1;
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const object = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// Parquer un ticket (tickets 4262, 4129) : son commentaire de parking, puis le label `parked`, écrits sur l'issue de
// `ticket`, sur tout dépôt, sans box. C'est le seul chemin de l'app qui le parque : « waiting for… », « Wait for … » d'une
// carte du manager (board-actions/answer-github.ts, ticket 3434) et le second (second/parking.ts) le jouent. Un
// commentaire posté dont le label est refusé se dit tel : le ticket n'est pas parqué.
export async function park(repository: string, ticket: number, readEntry: Input, today: Date, client: ClientOfThePriority): Promise<Written> {
  const [an, month, day] = readEntry.relance.split("-").map(Number);
  const body = brandOfWait(readEntry, new Date(an ?? 0, (month ?? 1) - 1, day ?? 1));
  const issue = `/repos/${repository}/issues/${ticket}`;
  let address = `https://github.com/${repository}/issues/${ticket}`;
  try {
    const workstation = await client.ecrire("POST", `${issue}/comments`, { body: body });
    if (workstation.status !== 201) throw refusalOf("the comment", workstation);
    const url = object(workstation.data).html_url;
    if (typeof url === "string") address = url;
  } catch (error) {
    return { refus: `nothing was changed: GitHub did not take the WAITING comment on #${ticket}`, detail: reason(error) };
  }
  try {
    const pose = await client.ecrire("POST", `${issue}/labels`, { labels: [LABEL_PARKED] });
    if (pose.status !== 200) throw refusalOf(`\`${LABEL_PARKED}\``, pose);
  } catch (error) {
    return { refus: `#${ticket} is not parked: its comment is posted, but GitHub did not set \`${LABEL_PARKED}\` — try again`, detail: reason(error) };
  }
  return { fait: `in WAITING on GitHub: #${ticket} awaits ${readEntry.qui}, follow-up on ${readEntry.relance}`, detail: address };
}
