// Le rail de « parade » sur GitHub seul (#3761) : #21 attend #40, en WAITING sur un collaborateur, depuis 20 min ; #22 en file.
import { ticket } from "./github-seul-commun.ts";
import { railRetenuParWaiting } from "./rail-retenu-par-waiting-commun.ts";

// MAINTENANT (10:04:12) moins 20 min.
export const ecran = railRetenuParWaiting("Le rail de « parade » : #21 attend #40, en WAITING sur un collaborateur — sa carte dans WAITING, « waits for `#40`, WAITING on a collaborator » ; #22 en file (#3761)", "2026-10-13T09:44:12.000Z", [
  ticket(22, "en attente", { creeLe: "2026-10-13T09:01:00.000Z", entreLe: "2026-10-13T09:01:00.000Z" }),
]);
