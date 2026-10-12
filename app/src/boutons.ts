// Les boutons d'action : chacun écrit une commande dans le second du projet, et
// n'envoie rien — le chef la lit, la corrige s'il veut, et fait Entrée. Aucun
// n'agit par lui-même : un bouton est un raccourci de frappe vers le seul
// endroit où le geste se fait. Ce qui s'écrit est la forme de docs/runtime.md,
// « Piloter », depuis le poste (`ssh <box> brigade <projet> <commande>`),
// préfixée du `!` qui la lance sur le Mac depuis une session `claude`.
import { cite } from "./box.ts";
import type { Projet } from "./config.ts";

// `ou` : là où le fait que la commande change se lit — le panneau d'état
// (`etat`), ou l'onglet de contenu de ce nom. Une commande qui finit par un
// espace attend sa suite : le chef la tape avant Entrée.
export type Bouton = { id: string; ou: string; commande: string };

export const BOUTONS: readonly Bouton[] = [
  { id: "stop", ou: "etat", commande: "garde-fous stop" },
  { id: "reprendre", ou: "etat", commande: "garde-fous reprendre" },
  { id: "grant-activer", ou: "grants", commande: "grant activer merge" },
  { id: "grant-prolonger", ou: "grants", commande: "grant prolonger merge " },
  { id: "grant-revoquer", ou: "grants", commande: "grant revoquer merge" },
  { id: "cooks", ou: "cooks", commande: "station cooks " },
];

// Un mot tel que le shell du Mac le rendra à `ssh` : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

// Ce que le bouton écrit pour ce projet — ou pourquoi il n'écrit rien. La vue
// nomme un bouton, jamais une commande ; un projet sans box n'a rien à écrire.
// Le nom passe deux shells — celui du Mac, puis celui de la box : un nom que le
// geste accepte part tel quel.
export function ecritPar(id: unknown, projet: Projet): { commande: string } | { refus: string } | undefined {
  const bouton = BOUTONS.find((candidat) => candidat.id === id);
  if (bouton === undefined || projet.box === undefined) return undefined;
  const { hote } = projet.box;
  // La veille le donne à `ssh` après `--` ; la forme de la doc n'en a pas, et il y serait une option.
  if (hote.startsWith("-")) return { refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets` };
  return { commande: `!ssh ${mot(hote)} brigade ${mot(cite(projet.nom))} ${bouton.commande}` };
}
