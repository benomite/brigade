// Les gestes du chef : ceux qu'il répète, écrits pour lui — jamais faits à sa
// place. Chacun est une commande de docs/runtime.md, « Piloter », reprise mot
// pour mot dans sa forme de poste (`ssh <hote> brigade <nom> <commande>`), et
// écrite dans un shell de l'espace par `ecrit` (terminaux.ts) : rien ne
// l'envoie, c'est le chef qui la lit et fait Entrée. Ce module ne lance rien —
// ni `ssh`, ni commande — et ne demande rien de plus à la box : il n'a que cet
// `ecrit` pour toucher au monde.
// Ce qui se joue sur la box à côté du runtime (`systemctl`, `brigade-bascule`,
// `claude /login`) n'est pas un geste de l'app : rien de tel n'est ici.
import { cite } from "./box.ts";
import type { Projet } from "./config.ts";
import { CONTROLE, SANS_ECRIRE, type Terminal } from "./terminaux.ts";

// `commande` : ce qui suit `brigade <projet>` sur sa ligne de « Piloter ».
// `parGrant` : le geste porte sur un grant, que la vue nomme — il s'écrit à la suite.
export type Geste = { id: string; commande: string; parGrant?: true };

// Un geste qu'un bouton écrit déjà dans le second (boutons.ts) porte ici le même nom.
export const GESTES: readonly Geste[] = [
  { id: "manager-allumer", commande: "manager allumer" },
  { id: "manager-eteindre", commande: "manager eteindre" },
  { id: "grant-activer", commande: "grant activer", parGrant: true },
  { id: "grant-revoquer", commande: "grant revoquer", parGrant: true },
  { id: "reprendre", commande: "garde-fous reprendre" },
  { id: "stop", commande: "garde-fous stop" },
  { id: "installation", commande: "installation" },
];

// Les grants que la doc nomme : aucune commande ne s'écrit pour un autre.
export const GRANTS: readonly string[] = ["merge"];

// Un mot tel que le shell du Mac le rendra à `ssh` : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

// Ce que le geste écrit pour ce projet — ou pourquoi il n'écrit rien. La vue
// nomme un geste, et son grant s'il en a un, jamais une commande ; un projet
// sans box n'a rien à écrire. Le nom passe deux shells — celui du Mac, puis
// celui de la box : un nom que le geste de box accepte part tel quel.
export function commandeDuGeste(id: unknown, projet: Projet, grant?: unknown): { commande: string } | { refus: string } | undefined {
  const geste = GESTES.find((candidat) => candidat.id === id);
  if (geste === undefined || projet.box === undefined) return undefined;
  const nomme = typeof grant === "string" && GRANTS.includes(grant) ? grant : undefined;
  if (geste.parGrant && nomme === undefined) return { refus: `rien n'est écrit : ce geste porte sur un grant, à nommer parmi ceux de la doc (${GRANTS.join(", ")})` };
  const { hote } = projet.box;
  // La forme de la doc ne met pas de `--` devant l'hôte : un tiret en tête y serait une option.
  if (hote.startsWith("-")) return { refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets` };
  const commande = `ssh ${mot(hote)} brigade ${mot(cite(projet.nom))} ${geste.commande}${geste.parGrant ? ` ${nomme}` : ""}`;
  // Le registre la refuserait aussi, mais dans un shell ouvert pour rien : le refus tombe avant.
  return CONTROLE.test(commande) ? { refus: SANS_ECRIRE } : { commande };
}

// Écrit le geste dans un shell de l'espace, sans l'envoyer — ou dit pourquoi
// rien n'est écrit. Un shell neuf, à son invite : la commande n'y est prise
// pour rien d'autre, et ce qu'elle demande — un mot de passe — s'y tape.
export function ecrireGeste(terminaux: { shell(projet: Projet, ecrit: string): Terminal }, id: unknown, projet: Projet, grant?: unknown): Terminal | { refus: string } | undefined {
  const ecrit = commandeDuGeste(id, projet, grant);
  if (ecrit === undefined || "refus" in ecrit) return ecrit;
  if (projet.refus !== undefined) return { refus: `rien n'est écrit : « ${projet.nom} » ne s'ouvre pas — ${projet.refus}` };
  return terminaux.shell(projet, ecrit.commande);
}
