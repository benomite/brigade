// Le même Rail sur un poste qui n'a ni `ssh` ni station pour `parade` (#1588) : lu de son tableau, sans lien direct à offrir.
import { espaceDuTableau, LU } from "./tableau-commun.ts";

export const ecran = espaceDuTableau("Le Rail de « parade » sur un poste sans ssh ni station (#1588) : lu de son tableau sur GitHub, sans lien direct", LU, { box: false });
