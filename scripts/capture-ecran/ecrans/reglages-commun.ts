// Les réglages de « parade » (Settings), tels qu'un Mac, un PC et un téléphone les montrent (#1700) : ses réglages de
// projet lus dans son dépôt, ses tickets
// ordinaires sur ce poste, et ses couleurs. Un Mac sert la station de parade ; un PC sous Windows aussi, sans tickets
// ordinaires ; le téléphone a la largeur d'un téléphone.
import { blocDesOrdinaires } from "../../../app/src/ordinaires.ts";
import { RETIRER } from "../../../app/src/retrait.ts";
import { configuration, cuisine, demarrage, type Donnees, type Etape, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { LUS } from "./reglages-du-projet.ts";

export type Poste = "mac" | "pc" | "telephone";
export const LARGEURS: Record<Poste, { largeur: number; hauteur: number }> = { mac: { largeur: 1440, hauteur: 1100 }, pc: { largeur: 1920, hauteur: 1080 }, telephone: { largeur: 412, hauteur: 1700 } };

// Un clic sur l'entrée de parade, puis sur Settings.
export const OUVRIR: Etape[] = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(3)" }];

export function donnees(poste: Poste): Donnees {
  const machine = poste === "pc" ? "pc" : "mac";
  const parade = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
  const stations = [{ station: machine, distante: false, plafond: 2, ordinaires: true, bacASable: null, prendOrdinaires: false }];
  const pose = demarrage(configuration([parade, ...PROJETS.slice(1)]));
  return {
    maintenant: MAINTENANT,
    reponses: {
      demarrage: poste === "pc" ? { ...pose, poste: { nom: "this PC", mac: false } } : pose,
      espace: [],
      reglagesDuProjet: LUS,
      ordinaires: blocDesOrdinaires(parade, poste === "pc" ? "win32" : "darwin", stations, true),
      // Ses gestes de retrait, tels que retrait.ts les rend : Settings n'en garde que le premier, une ligne de toi.
      retrait: { projet: "parade", titre: "Remove “parade”", retirer: { libelle: RETIRER, lignes: ["“parade” leaves the app: its tab, its colors.", "Nothing is sent to its station."] } },
    },
    envois: {
      ...cuisine(RENDUS),
    },
  };
}
