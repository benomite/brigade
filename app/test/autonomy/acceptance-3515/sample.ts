// L'échantillon commité de #3515 (../compute/sample-defects.json) : des tickets fermés de
// chef/parade, leurs issues `bug` et les commits qui revertent, tels que l'API REST de GitHub les rend. Aucun appel à gh.
import { readFileSync } from "node:fs";
import type { Defauts, DonneesDuDepot } from "../../../../runtime/src/autonomie/compute.ts";

export const ECHANTILLON = JSON.parse(readFileSync(new URL("../compute/sample-defects.json", import.meta.url), "utf8")) as DonneesDuDepot;
export const DEFAUTS = ECHANTILLON.defauts as Defauts;
export const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
export const sha = (signe: string) => signe.repeat(40);
// L'échantillon, avec d'autres défauts à la place des siens.
export const avec = (defauts: Partial<Defauts>): DonneesDuDepot => ({ ...ECHANTILLON, defauts: { ...DEFAUTS, ...defauts } });
