// Les gestes de la cuisine et de l'installation, posés à côté de l'état que
// `status` relaie déjà (faits.ts : l'état du projet, le « stop » du chef, le
// disjoncteur) : reprendre la cuisine, l'arrêter, vérifier l'installation. Ce
// sont trois gestes du socle (gestes.ts) — la vue les nomme, ce qui s'écrit se
// décide là : la commande de docs/runtime.md, « Piloter », dans sa forme de
// poste, écrite dans un shell de l'espace sans être envoyée. Vérifier
// l'installation ne fait que lire : il est direct, sa commande part dans le second.
// **Arrêter la cuisine est un geste dangereux** : tous les cooks en cours sont
// arrêtés, et plus aucun n'est lancé jusqu'à « reprendre ». L'app n'y ajoute
// aucune confirmation — la commande se lit et se corrige dans le shell avant
// Entrée, et c'est ce temps-là qui est le garde-fou. Ce module ne lance rien.

// Les trois gestes, par leur nom dans le socle, dans l'ordre où ils se posent.
export const GESTES_DE_LA_CUISINE = [
  { id: "reprendre", libelle: "reprendre la cuisine" },
  { id: "stop", libelle: "arrêter la cuisine" },
  { id: "installation", libelle: "vérifier l'installation" },
] as const;
