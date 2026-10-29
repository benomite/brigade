// Les réglages de « parade » : l'onglet Settings, avec le bloc « Ordinary tickets on this Mac », sans bac à sable.
import { blocDesOrdinaires } from "../../../app/src/ordinaires.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = { ...PROJETS[0]!, ordinaires: true, limiteCooks: 2 };
const STATIONS = [
  { station: "mac", distante: false, plafond: 2, ordinaires: true, bacASable: { disponible: false, raison: "Seatbelt refuses the profile (sandbox-exec: sandbox_apply: Operation not permitted)", version: "2.1.0", depuis: "2026-10-13T09:58:00.000Z" }, prendOrdinaires: false },
];

export const ecran: Ecran = {
  dit: "Les réglages de « parade » quand la station dit son bac à sable indisponible : le message et sa raison",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: '#onglets > button[role="tab"]:nth-child(2)' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      demarrage: demarrage(configuration([PARADE, ...PROJETS.slice(1)])),
      espace: [],
      ordinaires: blocDesOrdinaires(PARADE, "darwin", STATIONS, true),
    },
    envois: cuisine(RENDUS),
  }),
};
