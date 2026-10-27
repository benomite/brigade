// La page du Mac sur l'accueil (#1790) : benomite/parade coché alors que la box le sert, mais la box est arrêtée ; le Mac
// ne peut pas rejoindre sa cuisine et n'en ouvre pas une seconde. Sa case dit « refused », et la phrase du runtime est
// dessous, en entier. Avant #1790, rien ne le disait.
import { ecranRejoindre, PAGE_DU_MAC } from "./rejoindre-commun.ts";

export const ecran = ecranRejoindre("La page du Mac : benomite/parade coché, la box arrêtée — le Mac refuse, et la phrase du runtime est sous la case (#1790)", false, PAGE_DU_MAC);
