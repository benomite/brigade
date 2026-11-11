// Le projet d'essai du premier lancement (#3227) : le premier écran d'un PC neuf, son encart par-dessus — le dépôt créé
// sur le compte du chef et son ticket sur le rail, puis servi. Les écrans `projet-d-essai*` en sont tirés.
import { messageDuService, type ProjetDEssai, type VuDeLEssai } from "../../../runtime/src/essai-projet/projet-d-essai.ts";
import type { Ecran } from "./commun.ts";
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

const DEPOT = "benomite/brigade-sample";
export const CREE: ProjetDEssai = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: "2026-11-11T10:01:00.000Z", ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1` };
export const SERVI: VuDeLEssai = { sample: { ...CREE, servedAt: "2026-11-11T10:08:00Z", pullRequest: `https://github.com/${DEPOT}/pull/2` }, served: messageDuService(8) };

export const projetDEssai = (dit: string, vu: VuDeLEssai): Ecran => premierLancement(dit, LISTEES, [], { projetDEssai: vu });
