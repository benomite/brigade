// La même file sur un téléphone, #24 levé juste avant #23 (ticket 1348) : la carte a pris sa place et la priorité de ses
// voisines, `prio:1`, sans attendre la station — le runtime l'a placée (`rail move 24 --before 23`).
import type { Ecran } from "./commun.ts";
import { ecran as doigt } from "./rail-file-doigt.ts";
import { CARTE, FILE as file } from "./rail-file-commun.ts";

export const ecran: Ecran = {
  ...doigt,
  dit: "La même file sur un téléphone, #24 levé juste avant #23 : il y est, avec leur priorité, prio:1",
  etapes: [...file.etapes, { soulever: CARTE(4), vers: CARTE(2), lacher: true }],
  donnees: () => {
    const donnees = file.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, deplacer: { place: true, dit: "#24: placed before #23, prio:1 — cost: none: only the order of service changes; no cook is launched, nothing is spent" } } };
  },
};
