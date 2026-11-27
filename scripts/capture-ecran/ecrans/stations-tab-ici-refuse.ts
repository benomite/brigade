// « Which station also cooks parade? » → « this computer » (#4568), the way it answered since #4511: the gesture refused
// and told the chef to edit a file by hand, the prefix said twice. Kept as the "before" of stations-tab-ici-ajoute.
import { BOX, CONFIE, MAC, ongletDesStations } from "./stations-tab-commun.ts";
import type { Ecran } from "./commun.ts";

export const AJOUTER = { cliquer: ".haut-des-stations .gestes .action:last-child button" };
export const CE_MAC = { cliquer: ".choix-des-stations button.recommande" };

export const depart = (dit: string, reponse: unknown, servisIci: string[]): Ecran => {
  const base = ongletDesStations(dit, { stations: [BOX, MAC], projet: CONFIE, cuit: true, servisIci });
  return { ...base, etapes: [...(base.etapes ?? []), AJOUTER, CE_MAC], donnees: () => { const d = base.donnees(); return { ...d, reponses: { ...d.reponses, servirUnProjet: reponse } }; } };
};

export const ecran = depart(
  "« Which station also cooks parade? » → this computer, as it answered before #4568: nothing written, a file to edit by hand",
  { refus: "nothing was written: a project is served by its line in the kitchen/projects file of this computer's station, with its clone" },
  ["chef/cantine"],
);
