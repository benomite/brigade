// Le projet « parade » éteint, ou allumé, par le chef à 09:25 (#3454) : ce que `manager` rend (runtime/src/manager-cli.ts),
// mot pour mot, posé sur le rendu de « parade » — la vue du projet et son onglet Stations le disent.
import { MANAGER_ALLUME, RENDUS } from "./cuisine-figee.ts";
import type { Rendu } from "./commun.ts";

const SECTIONS = ["latest decisions      none", "set aside             none", ""];
export const MANAGER_ETEINT = ["manager               OFF since 2026-10-13T09:25:21.838Z (by chef) — the project switch is off: `brigade <projet> switch on` turns it on — no issue is judged, what it set stays set", ...SECTIONS].join("\n");

// Les rendus de la cuisine figée, « parade » éteint ou allumé.
export const rendus = (allume: boolean): Record<string, Rendu> => ({ ...RENDUS, parade: { ...(RENDUS.parade as Rendu), manager: allume ? MANAGER_ALLUME : MANAGER_ETEINT } });
