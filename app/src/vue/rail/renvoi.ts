// Le dernier renvoi d'un ticket à un cook, lu des commentaires de son issue (ticket 3302) : la station qui le renvoie y
// écrit `<!-- brigade:renvoi n=<n> sha=<sha> -->`, puis « Station `x`: sent back to a cook (n/2) — <raison> », la raison
// pouvant tenir plusieurs lignes, puis ce qui suit — un cook le reprend, ou il quitte la cuisine
// (runtime/src/github-seul/renvois/renvois.ts). Seul qui a la main sur le dépôt renvoie un ticket : un commentaire d'un
// autre ne compte pas, comme `renvoisLus` le veut.
//
// Ce module redit la marque du runtime sans l'importer : renvois.ts tire avec lui le rail et la calibration du runtime,
// que l'app ne charge pas. Un test les joue tous deux sur les mêmes commentaires (test/vue/rail/renvoi.test.ts).

type Brut = Record<string, unknown>;

const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];
const MARQUE_DE_RENVOI = /^<!-- brigade:renvoi n=(\d+)(?: sha=[0-9a-f]+)? -->\n?/;
// La ligne de la station, avant la raison : « Station `x`: sent back to a cook (1/2) — » ou « … still not mergeable after
// 1 sends back — ».
const TETE = /^Station `[^`]*`: [^\n]*? — /;
// Ce qui suit la raison, après une ligne vide : la reprise par un cook, ou la sortie de la cuisine.
const SUITE = /\n\n(?:The next cook takes up|Taken off the kitchen)[\s\S]*$/;

// Un renvoi : son rang, et pourquoi, dans les mots de la station.
export type Renvoi = { n: number; raison: string };

// Le renvoi au plus grand rang que portent ces commentaires, tels que l'API de GitHub les rend ; null sans aucun.
export function dernierRenvoi(commentaires: readonly Brut[]): Renvoi | null {
  let dernier: Renvoi | null = null;
  for (const { body, author_association: association } of commentaires) {
    if (typeof body !== "string" || typeof association !== "string" || !DE_CONFIANCE.includes(association)) continue;
    const marque = MARQUE_DE_RENVOI.exec(body);
    if (marque === null) continue;
    const n = Number(marque[1]);
    const raison = body.slice(marque[0].length).replace(TETE, "").replace(SUITE, "").trim();
    if (dernier === null || n > dernier.n) dernier = { n, raison };
  }
  return dernier;
}
