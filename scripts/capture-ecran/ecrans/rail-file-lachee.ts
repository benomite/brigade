// La même file, #24 lâché juste avant #23 (ticket 1347) : la carte a pris sa place et la priorité de ses voisines,
// `prio:1`, sans attendre la station — le runtime l'a placée (`rail move 24 --before 23`).
import type { Ecran } from "./commun.ts";
import { CARTE, ecran as file } from "./rail-file-commun.ts";

export const ecran: Ecran = {
  ...file,
  dit: "La même file, #24 lâché juste avant #23 : il y est, avec leur priorité, prio:1",
  etapes: [...file.etapes, { glisser: CARTE(4), sur: CARTE(2), lacher: true }],
  donnees: () => {
    const donnees = file.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, deplacer: { place: true, dit: "#24: placed before #23, prio:1 — cost: none: only the order of service changes; no cook is launched, nothing is spent" } } };
  },
};
