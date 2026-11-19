// Le rejeu de #3812 (#3823) : main rouge depuis 26 h, sa réparation `repair-main` sur le rail, rien servi depuis. En tête du
// rail, une ligne : rien servi depuis 26 h, la cause — main rouge, le check en échec — et la réparation que la cuisine cuit.
import { MAINTENANT } from "./commun.ts";
import { ticket } from "./github-seul-commun.ts";
import { ecranDuRail, IL_Y_A_26_H } from "./rail-alerte-commun.ts";

export const ecran = ecranDuRail("Le rail de « parade », main rouge depuis 26 h (rejeu de #3812) : « Nothing served for 26 h », la cause — main rouge, runtime tests — et « The kitchen repairs it on #12 » (#3823)", {
  lu: MAINTENANT,
  tickets: [
    ticket(12, "en attente", { titre: "Repair main: runtime tests", priorite: 0, creeLe: IL_Y_A_26_H, entreLe: IL_Y_A_26_H, reparationDeMain: true }),
    ticket(21, "en attente", { creeLe: IL_Y_A_26_H, entreLe: IL_Y_A_26_H }),
    ticket(30, "base rouge", { pr: { numero: 41, url: "https://github.com/chef/parade/pull/41", le: IL_Y_A_26_H }, prise: { station: "box/claude", le: IL_Y_A_26_H } }),
  ],
});
