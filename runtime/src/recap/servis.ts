// Les tickets servis entre deux instants, pour le récapitulatif (#3581) : les
// faits que la colonne Served du rail lit (app/src/vue/rail/github.ts,
// `lireLesServis`) — une PR mergée sert le ticket que sa branche
// (`cook/<n>-…`) ou son corps (`Closes #<n>`) nomme ; une issue fermée sans PR
// mergée n'est jamais servie. Un seul service par ticket : son dernier merge.
import type { GitHub } from "../github.ts";

// Le ticket qu'une PR sert : celui de sa branche de cook, sinon celui que son
// corps ferme ; null si elle n'en nomme aucun. La règle du rail de l'app, qui
// la reprend d'ici (app/src/tableau/rail-github.ts).
export function ticketDeLaPR(tete: string, corps: string): number | null {
  const branche = /^cook\/(\d+)(?:-|$)/.exec(tete)?.[1];
  const ferme = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(corps)?.[1];
  const numero = Number(branche ?? ferme);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

// Un ticket servi : son issue, et la PR qui l'a servi, où se voient ses gates,
// sa CI et sa relecture.
export type Servi = { ticket: number; title: string; url: string; pr: number; prUrl: string; servedAt: string };

export type GitHubDesServis = Required<Pick<GitHub, "prsMergeesDepuis">>;

// Les tickets servis de `debut` (inclus) à `fin` (exclue), le plus récent d'abord.
export async function servisEntre(github: GitHubDesServis, depot: string, debut: string, fin: string): Promise<Servi[]> {
  const avant = Date.parse(fin);
  const servis = new Map<number, Servi>();
  for (const pr of await github.prsMergeesDepuis(debut)) {
    const le = Date.parse(pr.mergedAt);
    if (!(le < avant)) continue;
    const ticket = ticketDeLaPR(pr.branche, pr.body);
    if (ticket === null) continue;
    const connu = servis.get(ticket);
    if (connu !== undefined && Date.parse(connu.servedAt) >= le) continue;
    servis.set(ticket, { ticket, title: pr.title.replace(/^#\d+\s*[—-]\s*/, ""), url: `https://github.com/${depot}/issues/${ticket}`, pr: pr.number, prUrl: pr.url, servedAt: pr.mergedAt });
  }
  return [...servis.values()].sort((a, b) => Date.parse(b.servedAt) - Date.parse(a.servedAt));
}
