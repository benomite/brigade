// Le cook design comme un profil de cook : son domaine est la vue de l'app, son
// fichier (`PROFIL_COOK_DESIGN`) est son skill, son périmètre est son domaine.
// Il passe par la même machinerie que les autres profils — préférence au
// dispatch, carnet, journal (`preference.ts`), liste des profils
// (`apprentissage/projet.ts`) — sans cas à part : il n'est qu'un profil que le
// dépôt n'a pas écrit sous `.claude/brigade/profils/`, mais bâti de son fichier.
// Son carnet part vide ; une définition `design.md` écrite à la main dans ce
// dossier l'emporte et porte le carnet (`lireLesProfils`).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROFIL_COOK_DESIGN, VUE_DE_L_APP } from "../calibrage.ts";
import type { DefinitionDeProfil } from "./definition.ts";

export const NOM_DU_PROFIL_DESIGN = "design";

// Le profil du cook design du dépôt `repoDir`, ou null s'il ne le définit pas.
// Sans date d'acceptation ni tickets : aucun « oui » ne l'a écrit.
export function profilDuCookDesign(repoDir: string): DefinitionDeProfil | null {
  if (!existsSync(join(repoDir, PROFIL_COOK_DESIGN))) return null;
  return {
    name: NOM_DU_PROFIL_DESIGN,
    zone: VUE_DE_L_APP,
    perimeter: [VUE_DE_L_APP],
    skills: [PROFIL_COOK_DESIGN],
    accepted: "",
    tickets: [],
    notebook: { lessons: [] },
    fichier: PROFIL_COOK_DESIGN,
  };
}
