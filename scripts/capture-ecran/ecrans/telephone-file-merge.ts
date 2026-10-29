// La file de `parade` sur le téléphone appairé (#1163), l'interrupteur `merge` touché : sa confirmation s'ouvre sous la
// tête de l'espace, de toute la largeur du téléphone — à 440 px sous l'interrupteur, elle débordait de côté.
import { confirmationDe } from "../../../app/src/confirmation.ts";
import { CUISINE, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { donneesDeLaFile, FAITS, OUVRIR_PARADE } from "./telephone-file-commun.ts";

const PARADE = PROJETS[0];
if (PARADE === undefined) throw new Error("pas de parade dans la cuisine figée");

export const ecran: Ecran = {
  dit: "La file de « parade » sur le téléphone, l'interrupteur `merge` touché : sa confirmation, de toute la largeur, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE, { cliquer: "#interrupteur-merge .bascule" }],
  donnees: () => {
    const donnees = donneesDeLaFile();
    return { ...donnees, reponses: { ...donnees.reponses, confirmer: confirmationDe("grant-activer", PARADE, { faits: FAITS, a: MAINTENANT }, "merge", CUISINE) } };
  },
};
