// Les compagnons d'une zone : les fichiers hors d'elle que les livraisons qui
// la touchent écrivent presque toujours avec elle — le registre d'une vue, sa
// feuille de style, la doc de l'écran, l'index des captures. Aucune zone ne
// les nomme, et deux cooks partis ensemble sur deux zones disjointes y
// écrivaient tous deux : le second livré revenait en conflit avec la base
// (#2963 : les neuf renvois pour conflit de #2921, #2922 et #2930, tous sur
// `app/src/vue/vue.js`, `vue.css`, `index.html`, `docs/app.md` et
// `scripts/capture-ecran/README.md`). Lus de l'historique de la base, sans LLM.
import { possede, segments } from "./zones.ts";

// Les derniers commits qui touchent la zone, au plus : son habitude récente.
export const ECHANTILLON_MAX = 30;
// En deçà, la zone n'a pas d'habitude : on la lit au dossier qui la contient.
export const ECHANTILLON_MIN = 8;
// Un compagnon est écrit par au moins la moitié de ces commits.
export const PART_MIN = 0.5;

const parent = (chemin: string): string | null => {
  const morceaux = segments(chemin);
  // Jamais au-dessus d'un dossier de produit (`runtime/src`, `app/src`) : la
  // racine ou `app/` entiers n'ont pas d'habitude qui vaille pour un ticket.
  return morceaux.length > 2 ? morceaux.slice(0, -1).join("/") : null;
};

// `historique` : les fichiers de chaque commit de la base, du plus récent au
// plus ancien. Rend les compagnons de `zone`, triés, hors de ce qu'elle possède.
export function compagnons(zone: readonly string[], historique: readonly (readonly string[])[]): string[] {
  if (zone.length === 0) return [];
  let lue = [...zone];
  for (;;) {
    const echantillon = historique.filter((fichiers) => fichiers.some((fichier) => lue.some((chemin) => possede(chemin, fichier)))).slice(0, ECHANTILLON_MAX);
    if (echantillon.length >= ECHANTILLON_MIN) {
      const comptes = new Map<string, number>();
      for (const fichiers of echantillon) for (const fichier of new Set(fichiers)) comptes.set(fichier, (comptes.get(fichier) ?? 0) + 1);
      return [...comptes]
        .filter(([fichier, n]) => n >= echantillon.length * PART_MIN && !zone.some((chemin) => possede(chemin, fichier)))
        .map(([fichier]) => fichier)
        .sort();
    }
    const plusHaut = [...new Set(lue.map((chemin) => parent(chemin) ?? chemin))];
    if (plusHaut.join("\0") === lue.join("\0")) return [];
    lue = plusHaut;
  }
}
