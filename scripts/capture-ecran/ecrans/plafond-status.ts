// Ce que le `status` d'une box dit du plafond de cooks de `box` et de ce qui la retient, lu par le code de l'app
// (plafond.ts) : l'écran de capture ne réécrit ni le texte ni son analyse.
import type { LigneDeStation } from "../../../app/src/accueil.ts";
import { plafondsDe, retenuesDe } from "../../../app/src/plafond.ts";

export const PAR_DEFAUT = "cooks      2 running — box: 3 at most — 8 cores";

export function detailDe(status: string): Partial<LigneDeStation> {
  const plafond = plafondsDe(status).get("box");
  const retenue = retenuesDe(status).get("box");
  return { ...(retenue === undefined ? {} : { phrase: "saturated", ton: "jaune" as const }), ...(plafond === undefined ? {} : { plafond, reglable: true as const }), ...(retenue === undefined ? {} : { retenue }) };
}
