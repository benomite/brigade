// La page du Mac sur l'accueil (#1790) : benomite/parade coché alors que la box le sert ; le Mac en a rejoint la cuisine,
// et sa case le dit. Avant #1790, rien ne disait ce que le Mac avait fait du dépôt.
import { ecranRejoindre, PAGE_DU_MAC } from "./rejoindre-commun.ts";

export const ecran = ecranRejoindre("La page du Mac : benomite/parade coché, servi par la box — le Mac cuit dans sa cuisine, et sa case le dit (#1790)", true, PAGE_DU_MAC);
