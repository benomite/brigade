// « Tous les projets », l'app installée, dans chacun des états de sa mise à jour (#1156) — la même
// vue sur un Mac et sur un PC sous Windows : seul le nom du poste change, tel que main.ts le rend
// (`poste`). N'exporte pas `ecran` : ce n'est pas un écran, mais ce que chaque écran
// `mise-a-jour-<état>-<poste>` reprend.
import type { EtatDeMiseAJour } from "../../../app/src/mise-a-jour/etat.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { SANS_CLONE } from "./reglages-code-installee.ts";
import { ecran as installee } from "./tous-les-projets-installee.ts";

const VERSION = "1.4.0";
const NOUVELLE = "1.5.0";

// Les états que la vue distingue, dans l'ordre où une mise à jour les traverse.
export const ETATS = {
  verification: { etat: "verification", version: VERSION },
  disponible: { etat: "disponible", version: VERSION, nouvelle: NOUVELLE },
  telechargement: { etat: "telechargement", version: VERSION, nouvelle: NOUVELLE, recus: 62_914_560, taille: 157_286_400 },
  prete: { etat: "prete", version: VERSION, nouvelle: NOUVELLE },
  erreur: { etat: "erreur", version: VERSION, nouvelle: NOUVELLE, raison: `the update ${NOUVELLE} could not be downloaded: its sha512 is not the published one` },
} satisfies Record<string, EtatDeMiseAJour>;

const POSTES = { mac: { nom: "this Mac", mac: true }, pc: { nom: "this PC", mac: false } };

export function ecranDeMiseAJour(etat: keyof typeof ETATS, poste: keyof typeof POSTES): Ecran {
  return {
    ...installee,
    dit: `« Tous les projets », l'app installée sur ${poste === "mac" ? "un Mac" : "un PC sous Windows"}, sa mise à jour à l'état \`${etat}\` (#1156)`,
    donnees: () => ({
      maintenant: MAINTENANT,
      reponses: { demarrage: { ...demarrage(configuration(PROJETS)), code: SANS_CLONE, poste: POSTES[poste], miseAJour: ETATS[etat] } },
      envois: cuisine(RENDUS),
    }),
  };
}
