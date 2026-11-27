// Ce que le `status` d'une box dit du plafond de cooks de `box`, lu par le code de l'app (cap.ts) : l'écran de
// capture ne réécrit ni le texte ni son analyse. L'app ne lit plus de retenue de saturation (#4285).
import type { LineOfStation } from "../../../app/src/home.ts";
import { capsOf } from "../../../app/src/cap.ts";

export const PAR_DEFAUT = "cooks      2 running — box: 3 at most — 8 cores";

export function detailDe(status: string): Partial<LineOfStation> {
  const plafond = capsOf(status).get("box");
  return plafond === undefined ? {} : { plafond, reglable: true as const };
}
