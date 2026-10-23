// La même file sur un téléphone, #22 levé juste avant #23, qu'il attend (ticket 1348) : le runtime refuse, en une phrase qui
// nomme #23 ; la carte a repris sa place, et la phrase se lit sous la tête de la colonne.
import { raisonDuRefus } from "../../../app/src/deplacement.ts";
import type { Ecran } from "./commun.ts";
import { ecran as doigt } from "./rail-file-doigt.ts";
import { CARTE, FILE as file } from "./rail-file-commun.ts";

const DIT = "brigade : #22 is not touched: #22 awaits #23, so it cannot be placed before it — cost: none: only the order of service changes; no cook is launched, nothing is spent";

export const ecran: Ecran = {
  ...doigt,
  dit: "La même file sur un téléphone, #22 levé avant #23, qu'il attend : refusé, la carte a repris sa place, et la phrase du runtime le dit",
  etapes: [...file.etapes, { soulever: CARTE(3), vers: CARTE(2), lacher: true }],
  donnees: () => {
    const donnees = file.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, deplacer: { refus: raisonDuRefus(DIT), detail: `$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade rail move 22 --before 23\n${DIT}\n→ exit code 1` } } };
  },
};
