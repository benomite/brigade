// Les checks de la branche d'intégration tels que le tour les lit, et ce qui
// s'en dit : lequel ne retient rien, et la fin utile de son journal de job.
import type { Check } from "./events/pass.ts";

export type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

// Les checks Windows (jobs de runtime-windows et app-windows : « windows tests
// (n/8) », « windows app tests ») sont informatifs (#2087) : rouges sur main, ils
// ne retiennent rien. Rien qu'eux : le job `windows` de publier-app, qui
// construit l'installeur de la release, n'en est pas un (#3796).
export const estInformatif = (check: CheckDeLaBase) => /^windows (app )?tests\b/i.test(check.name ?? "");

// Ce qu'on garde d'un journal de job : ses dernières lignes, jusqu'à la
// dernière erreur que GitHub Actions y annonce, `SORTIE_MAX` caractères au plus.
const LIGNES_MAX = 80;
const SORTIE_MAX = 6_000;

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/;

// La fin utile d'un journal de job : sans couleurs ni horodatage, coupée après
// sa dernière ligne `##[error]` (ce qui suit est le ménage du job), ses
// `LIGNES_MAX` dernières lignes, `plafond` caractères au plus — la fin gardée.
export function sortieDErreur(journal: string, plafond = SORTIE_MAX): string {
  const lignes = journal
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(ANSI, "").replace(HORODATAGE, "").trimEnd())
    .filter((ligne) => !/^##\[(?:group|endgroup)\]/.test(ligne));
  const derniere = lignes.findLastIndex((ligne) => ligne.startsWith("##[error]"));
  const utiles = (derniere === -1 ? lignes : lignes.slice(0, derniere + 1)).slice(-LIGNES_MAX);
  while (utiles.length > 0 && utiles[0]?.trim() === "") utiles.shift();
  while (utiles.length > 0 && utiles.at(-1)?.trim() === "") utiles.pop();
  const texte = utiles.join("\n");
  if (texte.length <= plafond) return texte;
  const fin = texte.slice(texte.length - plafond);
  // Coupée à une ligne entière quand il y en a une.
  const saut = fin.indexOf("\n");
  return `…\n${saut === -1 || saut === fin.length - 1 ? fin : fin.slice(saut + 1)}`;
}
