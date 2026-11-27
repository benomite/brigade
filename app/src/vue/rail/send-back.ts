// Le dernier renvoi d'un ticket à un cook, lu des commentaires de son issue (ticket 3302) : la station qui le renvoie y
// écrit `<!-- brigade:renvoi n=<n> sha=<sha> -->`, puis « Station `x`: sent back to a cook (n/2) — <raison> », la raison
// pouvant tenir plusieurs lignes, puis ce qui suit — un cook le reprend, ou il quitte la cuisine
// (runtime/src/github-seul/renvois/renvois.ts). Seul qui a la main sur le dépôt renvoie un ticket : un commentaire d'un
// autre ne compte pas, comme `renvoisLus` le veut.
//
// Ce module redit la marque du runtime sans l'importer : renvois.ts tire avec lui le rail et la calibration du runtime,
// que l'app ne charge pas. Un test les joue tous deux sur les mêmes commentaires (test/vue/rail/send-back.test.ts).

type Raw = Record<string, unknown>;

const OF_TRUST = ["OWNER", "MEMBER", "COLLABORATOR"];
const BRAND_OF_SEND_BACK = /^<!-- brigade:renvoi n=(\d+)(?: sha=[0-9a-f]+)? -->\n?/;
// La ligne de la station, avant la raison : « Station `x`: sent back to a cook (1/2) — » ou « … still not mergeable after
// 1 sends back — ».
const HEAD = /^Station `[^`]*`: [^\n]*? — /;
// Ce qui suit la raison, après une ligne vide : la reprise par un cook, ou la sortie de la cuisine.
const SUITE = /\n\n(?:The next cook takes up|Taken off the kitchen)[\s\S]*$/;

// Un renvoi : son rang, et pourquoi, dans les mots de la station.
export type SendBack = { n: number; raison: string };

// Le renvoi au plus grand rang que portent ces commentaires, tels que l'API de GitHub les rend ; null sans aucun.
export function lastSendBack(comments: readonly Raw[]): SendBack | null {
  let last: SendBack | null = null;
  for (const { body, author_association: association } of comments) {
    if (typeof body !== "string" || typeof association !== "string" || !OF_TRUST.includes(association)) continue;
    const brand = BRAND_OF_SEND_BACK.exec(body);
    if (brand === null) continue;
    const n = Number(brand[1]);
    const reason = body.slice(brand[0].length).replace(HEAD, "").replace(SUITE, "").trim();
    if (last === null || n > last.n) last = { n, raison: reason };
  }
  return last;
}
