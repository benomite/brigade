// Le rejeu de #3813 (#3823) : #14 pris 1 198 fois en 26 h, rien servi depuis. En tête du rail, une ligne : rien servi depuis
// 26 h, #14 relancé en boucle, et le geste qui l'arrête.
import { MAINTENANT } from "./commun.ts";
import { ticket } from "./github-seul-commun.ts";
import { ecranDuRail, IL_Y_A_26_H } from "./rail-alerte-commun.ts";

export const ecran = ecranDuRail("Le rail de « parade », #14 relancé 1 198 fois en 26 h (rejeu de #3813) : « Nothing served for 26 h », « #14 is relaunched in a loop » et son geste (#3823)", {
  lu: MAINTENANT,
  tickets: [
    ticket(14, "pris", { prise: { station: "box/claude", le: new Date(Date.parse(MAINTENANT) - 60_000).toISOString() } }),
    ticket(21, "en attente", { creeLe: IL_Y_A_26_H, entreLe: IL_Y_A_26_H }),
  ],
});
