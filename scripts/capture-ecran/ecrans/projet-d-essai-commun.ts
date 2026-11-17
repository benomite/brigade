// Le projet de démo du premier lancement (#3734, né projet d'essai, #3227) : le premier écran d'un PC neuf, son encart
// par-dessus — le dépôt créé sur le compte du chef et ses trois tickets sur le rail, puis servi. Les écrans
// `projet-d-essai*` en sont tirés.
import { messageDuService, type ProjetDEssai, type VuDeLEssai } from "../../../runtime/src/demo/projet-de-demo.ts";
import type { Ecran, Etape } from "./commun.ts";
import { LISTEES, premierLancement } from "./premier-lancement-commun.ts";

const DEPOT = "benomite/brigade-demo";
export const CREE: ProjetDEssai = { repository: DEPOT, url: `https://github.com/${DEPOT}`, base: "main", createdAt: "2026-11-11T10:01:00.000Z", ticket: 1, ticketUrl: `https://github.com/${DEPOT}/issues/1`, tickets: [1, 2, 3] };
export const SERVI: VuDeLEssai = { sample: { ...CREE, servedAt: "2026-11-11T10:08:00Z", pullRequest: `https://github.com/${DEPOT}/pull/2` }, served: messageDuService(8) };

export const projetDEssai = (dit: string, vu: VuDeLEssai, etapes: Etape[] = []): Ecran => premierLancement(dit, LISTEES, etapes, { projetDEssai: vu });
