// La même file de « parade », « yes, create the profile » cliqué sur le profil proposé (#1053) : la
// réponse est postée sur le tableau de la cuisine du projet, sans la box (#1741) — la carte reste, ses
// deux réponses inactives, et une ligne le dit dessous, le commentaire posté au survol, comme pour une
// correction (`correction-oui`).
import { OUI } from "../../../app/src/correction.ts";
import { POSTE } from "../../../app/src/tableau-gestes/rail.ts";
import { ecran as profil } from "./profil.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...profil,
  dit: "La même file, « yes » cliqué sur le profil proposé : la réponse est postée sur le tableau de la cuisine, la carte le dit sous ses réponses, le commentaire au survol",
  etapes: [...profil.etapes, { cliquer: "#rail .profil button.recommande" }],
  donnees: () => {
    const donnees = profil.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, trancherLeProfil: { postee: OUI, dit: POSTE, detail: "https://github.com/acme/parade/issues/1#issuecomment-5013" } } };
  },
};
