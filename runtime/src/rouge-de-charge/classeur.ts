// Des gates rouges sur une machine saturée ne disent rien du code (#4211) : le
// 2026-11-23, les tests et la garde d'horloge de 300 s étaient rouges sur
// chaque ticket, verts sur la CI de main. Avant de compter contre le ticket,
// leur rouge est classé : `load`, la charge de la machine à la fin du passage
// dépasse le seuil où la station cesse de prendre des tickets — une coupure de
// la garde d'horloge comprise ; `code` sinon. Un rouge `load` est rejoué une
// fois la machine calme (`crochet.ts`) : s'il s'y répète, il est `code`.
import { availableParallelism, loadavg } from "node:os";
import type { Gates } from "../events/pass.ts";
import { configMachine } from "../machine.ts";

export type ClasseDuRouge = "load" | "code";

// La charge moyenne sur une minute, comme la lit la station (`lireMachine`).
// Là où le système ne la donne pas (Windows), elle est nulle : tout rouge y est `code`, comme avant.
export const lireLaCharge = (): number => loadavg()[0] ?? 0;

// Le seuil de la station pour le processeur (`saturations`, `machine.ts`) : la
// charge tolérée par cœur (`BRIGADE_MAX_LOAD_PER_CORE`), fois ses cœurs.
export const seuilDeCharge = (env: NodeJS.ProcessEnv): number => configMachine(env).chargeParCoeur * availableParallelism();

// `gates` : un résultat rouge. Ses tests en échec comme une coupure de sa garde
// d'horloge sont ceux de la charge quand elle dépasse le seuil, et du code
// sinon : seule la charge les départage. `lireCharge` : la lecture, injectable.
export function classerLeRouge({ lireCharge, seuil = seuilDeCharge(process.env) }: { gates: Gates; lireCharge: () => number; seuil?: number }): ClasseDuRouge {
  return lireCharge() > seuil ? "load" : "code";
}
