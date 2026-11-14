// Les tickets que la pass a renvoyés ou refusés entre deux instants, pour le
// récapitulatif (#3581) : les commentaires `brigade:renvoi` que la station
// écrit sur l'issue (github-seul/renvois/renvois.ts), lus par `renvoisLus` —
// la même marque, et seulement d'un auteur de confiance. Un renvoi au-delà de
// `RENVOIS_MAX` est un refus : la livraison n'est plus rendue à un cook, le
// ticket est mis de côté. Un ticket renvoyé plusieurs fois dit son dernier.
import type { GitHub } from "../github.ts";
import { RENVOIS_MAX, renvoisLus } from "../github-seul/renvois/renvois.ts";

// Un ticket renvoyé (`sent-back`) ou refusé (`refused`), et pourquoi, en une ligne.
export type Renvoye = { ticket: number; url: string; kind: "sent-back" | "refused"; reason: string; at: string };

export type GitHubDesRenvois = Required<Pick<GitHub, "commentairesDepuis">>;

// La raison d'un renvoi : ce que sa ligne dit après le premier « — » (« Station
// `x`: sent back to a cook (1/2) — the CI is red… »), sur cette seule ligne.
function raisonDe(corps: string): string {
  const ligne = (corps.split("\n")[1] ?? "").trim();
  const apres = ligne.indexOf(" — ");
  return (apres === -1 ? ligne : ligne.slice(apres + 3)).replace(/:$/, "").trim();
}

// Les tickets renvoyés ou refusés de `debut` (inclus) à `fin` (exclue), le plus récent d'abord.
export async function renvoisEntre(github: GitHubDesRenvois, depot: string, debut: string, fin: string): Promise<Renvoye[]> {
  const [depuis, avant] = [Date.parse(debut), Date.parse(fin)];
  const commentaires = (await github.commentairesDepuis(debut)).filter(({ issue, createdAt }) => {
    const le = Date.parse(createdAt);
    return issue !== undefined && le >= depuis && le < avant;
  });
  const derniers = new Map<number, Renvoye>();
  for (const { n, id } of renvoisLus(commentaires.map(({ body, association, createdAt }, id) => ({ id, body, association, createdAt })))) {
    const { issue, body, createdAt } = commentaires[id] as (typeof commentaires)[number] & { issue: number };
    const connu = derniers.get(issue);
    if (connu !== undefined && Date.parse(connu.at) > Date.parse(createdAt)) continue;
    derniers.set(issue, { ticket: issue, url: `https://github.com/${depot}/issues/${issue}`, kind: n > RENVOIS_MAX ? "refused" : "sent-back", reason: raisonDe(body), at: createdAt });
  }
  return [...derniers.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
