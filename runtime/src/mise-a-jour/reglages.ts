// Les réglages de mise à jour de la station : un fichier sous son répertoire
// (`<BRIGADE_STATION_DIR>/reglages`), à côté de sa configuration, que la mise à
// jour relit à chaque passage. L'app l'écrira ; d'ici là, il s'écrit à la main.
//
//   # geler la station sur la version installée
//   gel=oui
//
// Une ligne `clé=valeur` par réglage, `#` pour un commentaire. Absent, rien
// n'est gelé : la station suit les versions publiées.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REGLAGES = "reglages";

export type Reglages = {
  // La version installée est gardée : aucune nouvelle n'est installée.
  gel: boolean;
  // Ce qui ne s'est pas lu, une ligne chacun.
  problemes: string[];
};

const OUI = ["oui", "yes", "true", "1"];
const NON = ["non", "no", "false", "0", ""];

export function lireReglages(racine: string): Reglages {
  const fichier = join(racine, REGLAGES);
  let texte: string;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { gel: false, problemes: [] };
    return { gel: true, problemes: [`réglages illisibles (${fichier}) : ${(erreur as Error).message} ; dans le doute, la version reste gelée`] };
  }
  const reglages: Reglages = { gel: false, problemes: [] };
  texte.split("\n").forEach((brute, rang) => {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) return;
    const egal = ligne.indexOf("=");
    const cle = (egal === -1 ? ligne : ligne.slice(0, egal)).trim();
    const valeur = egal === -1 ? "" : ligne.slice(egal + 1).trim().toLowerCase();
    if (cle !== "gel") return void reglages.problemes.push(`ligne ${rang + 1} des réglages : « ${cle.slice(0, 40)} » n'est pas un réglage connu (gel)`);
    if (OUI.includes(valeur)) reglages.gel = true;
    else if (NON.includes(valeur)) reglages.gel = false;
    else {
      // Un gel mal écrit était sans doute voulu : dans le doute, rien
      // n'est installé.
      reglages.gel = true;
      reglages.problemes.push(`ligne ${rang + 1} des réglages : gel=${valeur.slice(0, 40)} — attendu oui ou non ; dans le doute, la version reste gelée`);
    }
  });
  return reglages;
}
