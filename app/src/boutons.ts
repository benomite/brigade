// Les boutons d'action : chacun écrit une commande dans le second du projet, et
// n'envoie rien — le chef la complète, et fait Entrée. Ce sont les deux commandes
// qui attendent une suite que seul le chef peut taper : la durée d'un grant
// prolongé, le nombre de cooks d'une station. Un geste qui n'attend rien de plus
// est un geste du socle (gestes.ts), direct ou confirmé : il n'est pas ici.
// Ce qui s'écrit est la forme de docs/runtime/exploitation.md, « Piloter », depuis le poste
// (`ssh <box> brigade <projet> <commande>`), préfixée du `!` qui la lance sur le
// Mac depuis une session `claude`.
import { cite } from "./box.ts";
import type { Projet } from "./config.ts";
import { EFFORTS, MODELES } from "./projets/projets.ts";

// `ou` : là où le fait que la commande change se lit — l'onglet de contenu de ce
// nom. Une commande qui finit par un espace attend sa suite : le chef la tape avant Entrée.
// `libelle` : le geste en mots, ce que le bouton montre — la commande, elle, ne s'affiche pas.
export type Bouton = { id: string; ou: string; commande: string; libelle: string };

export const BOUTONS: readonly Bouton[] = [
  { id: "grant-prolonger", ou: "grants", commande: "grant extend merge ", libelle: "Extend a grant" },
  { id: "cooks", ou: "cooks", commande: "station cooks ", libelle: "Set the cooks of a station" },
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
  if (hote.startsWith("-")) return { refus: `nothing is written: “hote” starts with a dash (${hote}), and \`ssh\` would read it as an option in the command — fix it in the projects file` };
  return { commande: `!ssh ${mot(hote)} brigade ${mot(cite(projet.nom))} ${bouton.commande}` };
}

// Régler le closer (#990) : son modèle et son effort, choisis ensemble sur la partie closer de la page
// — l'un sans l'autre fait refuser le démarrage (docs/runtime/fermeture.md, « Le closer se règle, ou il
// n'y en a pas »). `station` ne prend qu'une décision par appel : les deux s'écrivent sur une ligne,
// l'une après l'autre, et rien ne part — le chef fait Entrée. Il n'est pas dans BOUTONS : il ne
// s'écrit qu'avec ses deux valeurs, que la vue donne, et que seules les listes de la station admettent.
export const REGLER_LE_CLOSER = "regler-closer";
export function ecritPourLeCloser(projet: Projet, modele: unknown, effort: unknown): { commande: string } | { refus: string } | undefined {
  if (projet.box === undefined) return undefined;
  if (!(MODELES as readonly unknown[]).includes(modele) || !(EFFORTS as readonly unknown[]).includes(effort)) {
    return { refus: `nothing is written: the closer takes a model (${MODELES.join(", ")}) and an effort (${EFFORTS.join(", ")}), both` };
  }
  const { hote } = projet.box;
  if (hote.startsWith("-")) return { refus: `nothing is written: “hote” starts with a dash (${hote}), and \`ssh\` would read it as an option in the command — fix it in the projects file` };
  const station = `ssh ${mot(hote)} brigade ${mot(cite(projet.nom))} station`;
  return { commande: `!${station} closer-modele ${modele} && ${station} closer-effort ${effort}` };
}
