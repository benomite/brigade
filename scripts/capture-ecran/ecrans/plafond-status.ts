// Ce que le `status` d'une box dit du plafond de cooks de `box` et de ce qui la retient, lu par le code de l'app
// (plafond.ts) : l'écran de capture ne réécrit ni le texte ni son analyse.
import type { LigneDeStation } from "../../../app/src/accueil.ts";
import { plafondsDe, retenuesDe } from "../../../app/src/plafond.ts";

const MACHINE = "MACHINE SATURATED for 3 min on memory and CPU — load of 18.4 for at most 12 · 812 MB of memory available for at least 3,205 MB (default: 10% of the machine's 32,050 MB): box takes no more tickets as long as it lasts";

export const PAR_DEFAUT = "cooks      2 running — box: 3 at most — 8 cores";
export const PAR_LE_CHEF = "cooks      2 running — box: 5 at most — set by you, replaces 3 (8 cores)";

export function detailDe(status: string): Partial<LigneDeStation> {
  const plafond = plafondsDe(status).get("box");
  const retenue = retenuesDe(status).get("box");
  return { ...(retenue === undefined ? {} : { phrase: "saturated", ton: "jaune" as const }), ...(plafond === undefined ? {} : { plafond, reglable: true as const }), ...(retenue === undefined ? {} : { retenue }) };
}

export const RETENUE = `${PAR_DEFAUT}\n${MACHINE}`;
