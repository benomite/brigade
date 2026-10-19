// Les seuils des leçons d'un projet, lus par le chef depuis son propre process :
//   node runtime/src/seuils/seuils-cli.ts
// avec l'environnement de l'unité du projet (les variables de `seuils.ts`).
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { ConfigInvalide } from "../runtime.ts";
import { lireSeuils, VARIABLES } from "./seuils.ts";

export function principal({ env, dire, redire }: Appel): void {
  try {
    const seuils = lireSeuils(env);
    const ligne = (titre: string, valeur: number, variable: string) => dire(`${titre.padEnd(30)}${String(valeur).padEnd(4)}(${variable})`);
    ligne("promotion (retros)", seuils.promotion, VARIABLES.promotion);
    ligne("promoted expiry (tickets)", seuils.expirationPromue, VARIABLES.expirationPromue);
    ligne("provisional expiry (tickets)", seuils.expirationProvisoire, VARIABLES.expirationProvisoire);
  } catch (erreur) {
    if (!(erreur instanceof ConfigInvalide)) throw erreur;
    redire(`brigade : ${erreur.message}`);
    throw new Sortie(1);
  }
}

if (import.meta.main) await enProcess(principal);
