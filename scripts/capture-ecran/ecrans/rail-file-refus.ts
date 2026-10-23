// La même file, #22 lâché juste avant #23, qu'il attend (ticket 1347) : le runtime refuse, en une phrase qui nomme #23 ;
// la carte a repris sa place, et la phrase se lit sous la tête de la colonne — ce que la station a rendu, au survol.
import { raisonDuRefus } from "../../../app/src/deplacement.ts";
import type { Ecran } from "./commun.ts";
import { CARTE, FILE as file } from "./rail-file-commun.ts";

const DIT = "brigade : #22 is not touched: #22 awaits #23, so it cannot be placed before it — cost: none: only the order of service changes; no cook is launched, nothing is spent";

export const ecran: Ecran = {
  ...file,
  dit: "La même file, #22 lâché avant #23, qu'il attend : refusé, la carte a repris sa place, et la phrase du runtime le dit sous la tête de la colonne",
  etapes: [...file.etapes, { glisser: CARTE(3), sur: CARTE(2), lacher: true }],
  donnees: () => {
    const donnees = file.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, deplacer: { refus: raisonDuRefus(DIT), detail: `$ ssh -o BatchMode=yes -o ConnectTimeout=10 -- box brigade parade rail move 22 --before 23\n${DIT}\n→ exit code 1` } } };
  },
};
