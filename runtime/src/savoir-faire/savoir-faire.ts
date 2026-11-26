// Le savoir-faire du projet (#4241) : les leçons provisoires que ses cooks reçoivent
// (`apprentissage/injection.ts`), chacune avec le ticket d'où elle est née. Le chef
// les lit depuis l'app, en réécrit une ou en retire une : chaque changement est un
// fait du journal (`evenements.ts`), appliqué partout où les leçons se lisent
// (`corrections.ts`).
import type { Journal } from "../journal.ts";
import { leconsProvisoires } from "../apprentissage/provisoires.ts";

// Une entrée, telle que l'app la montre : `ticket`, celui dont la rétro ou le renvoi l'a proposée.
export type Entree = { id: string; text: string; ticket: number };

// Ce qu'un changement refuse : une entrée que le projet n'a pas, un texte vide. Rien n'est alors écrit.
export class ChangementRefuse extends Error {}

export function lireLeSavoirFaire(journal: Journal, projet: string): Entree[] {
  return leconsProvisoires(journal.base, projet).map((lecon) => ({ id: lecon.id, text: lecon.texte, ticket: lecon.ticket }));
}

function entreeDuProjet(journal: Journal, projet: string, id: string): Entree {
  const entree = lireLeSavoirFaire(journal, projet).find((une) => une.id === id);
  if (entree === undefined) throw new ChangementRefuse(`“${id}” is not an entry of the project's know-how`);
  return entree;
}

// Réécrit le texte de l'entrée, sur une ligne : ce qu'elle devient.
export function modifierUneEntree(journal: Journal, projet: string, id: string, texte: string): Entree {
  const ligne = texte.replace(/\s+/g, " ").trim();
  if (ligne === "") throw new ChangementRefuse("an entry of the know-how cannot be empty");
  const entree = entreeDuProjet(journal, projet, id);
  journal.ajouter({ project: projet, ticket: null, author: "chef", type: "know-how.edited", payload: { id, text: ligne } });
  return { ...entree, text: ligne };
}

export function retirerUneEntree(journal: Journal, projet: string, id: string): void {
  entreeDuProjet(journal, projet, id);
  journal.ajouter({ project: projet, ticket: null, author: "chef", type: "know-how.removed", payload: { id } });
}
