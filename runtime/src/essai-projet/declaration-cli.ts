// Écrit la déclaration d'essai d'un projet, `.brigade/try.json`, depuis ce que
// son dépôt montre (`declaration.ts`) :
//   node runtime/src/essai-projet/declaration-cli.ts <dossier du projet>
//
// `/brigade:init` la lance à côté de la déclaration du bac à sable. Un fichier
// déjà là n'est jamais réécrit ; un dépôt qui ne dit pas comment il s'essaie
// n'en reçoit aucun — la commande le dit, rien n'est deviné.
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { ecrireLaDeclaration, FICHIER_D_ESSAI, texteDeLaDeclaration } from "./declaration.ts";

const USAGE = "usage : node runtime/src/essai-projet/declaration-cli.ts <dossier du projet>";
const MAL_APPELEE = 64;

function principal({ args, dire, redire }: Appel): void {
  const [nommee, ...reste] = args;
  if (nommee === undefined || reste.length > 0 || nommee.startsWith("-")) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(MAL_APPELEE);
  }
  const nomme = resolve(nommee);
  if (!existsSync(nomme)) {
    redire(`brigade : ${nomme} n'existe pas`);
    throw new Sortie(MAL_APPELEE);
  }
  const fichier = join(realpathSync(nomme), FICHIER_D_ESSAI);
  const ecriture = ecrireLaDeclaration(realpathSync(nomme));
  if ("dejaLa" in ecriture) dire(`essai — ${fichier} : déjà là, laissé tel quel`);
  else if ("rien" in ecriture) dire(`essai — rien de reconnu : aucune déclaration écrite, le projet ne dit pas comment il s'essaie`);
  else {
    dire(`essai — ${fichier} : écrit`);
    dire(`  ${texteDeLaDeclaration(ecriture.ecrite.declaration).replace(/\s*\n\s*/g, " ").trim()} ← ${ecriture.ecrite.preuve}`);
  }
}

if (import.meta.main) await enProcess(principal);
