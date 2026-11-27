// Les commandes de la box, sous leur nom anglais (docs/glossary.md, « Box
// commands and their options ») : celui que `help` montre, et que le geste de box
// nomme quand il refuse une commande.
//
// L'app ne lance plus aucune commande par le geste de sa station (#4710) : les autres sont parties avec
// l'ancien runtime (#4499), `manager` la dernière. Les anciens mots — français — n'ont plus de commande à qui répondre.
export type DeLaBox = { nom: string; description: string };

export const COMMANDES: readonly DeLaBox[] = [{ nom: "help", description: "List these commands" }];
