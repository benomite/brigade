// Ce que pèse le corps du tableau, bloc par bloc : la ligne `board` de `status`
// (ticket 2157). Pur : le corps est lu, rien n'est publié ici.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireLeTableau } from "./bloc.ts";
import { LONGUEUR_MAX_DU_CORPS } from "./rendre.ts";

const entier = (n: number) => n.toLocaleString("en-US");

// La taille du corps, sa part de la limite de GitHub, puis la part de chaque
// bloc (les plus lourds d'abord) et ce que le corps a dû retirer. Null pour un
// corps dont le bloc ne se lit pas.
export function direLaTailleDuCorps(corps: string): string | null {
  const lu = lireLeTableau(corps);
  if (!lu.lu) return null;
  const total = corps.length;
  const part = (n: number) => `${Math.round((n / total) * 100)}%`;
  const blocs = Object.entries(lu.tableau)
    .map(([nom, valeur]) => [nom, JSON.stringify(valeur)?.length ?? 0] as const)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lisible = corps.indexOf("<!-- brigade:kitchen-board");
  const dits = [...(lisible > 0 ? [["readable", lisible] as const] : []), ...blocs].filter(([, n]) => n > 0);
  const retire = lu.tableau.resserre === undefined || lu.tableau.resserre.length === 0 ? "" : ` · left out: ${lu.tableau.resserre.join(", ")}`;
  return `${entier(total)} of ${entier(LONGUEUR_MAX_DU_CORPS)} chars (${Math.round((total / LONGUEUR_MAX_DU_CORPS) * 100)}%) · ${dits.map(([nom, n]) => `${nom} ${part(n)}`).join(" · ")}${retire}`;
}

// La taille du dernier corps rendu, gardée dans le répertoire de la station, un
// fichier par projet : `status` la lit sans rien publier. Un échec d'écriture
// ne gêne jamais la publication.
const fichierDeLaTaille = (station: string, projet: string) => join(station, "board-size", `${projet.replace(/[^\w.-]/g, "_")}.txt`);

export function noterLaTaille(station: string, projet: string, corps: string): void {
  const ligne = direLaTailleDuCorps(corps);
  if (ligne === null) return;
  try {
    mkdirSync(join(station, "board-size"), { recursive: true });
    writeFileSync(fichierDeLaTaille(station, projet), `${ligne}\n`);
  } catch {
    // La mesure manque à `status`, rien de plus.
  }
}

export function tailleNotee(station: string | undefined, projet: string | null): string | null {
  if (!station || projet === null) return null;
  try {
    return readFileSync(fichierDeLaTaille(station, projet), "utf8").trim() || null;
  } catch {
    return null;
  }
}
