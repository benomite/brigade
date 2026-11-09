// Une carte de TODO porte sa question et de quoi y répondre (#2875, #2894) : la
// porte (carte-todo.ts, `jugerCarte`) appelle ces deux gardes, une carte sans
// l'une ou sans l'autre n'est pas créée et n'arrive jamais dans la file du chef.
// Elles ne regardent que la présence des parties requises, jamais leur forme.
import type { Proposition } from "../carte-todo.ts";

// Pourquoi la carte est refusée faute de question, ou null.
export function refuserSansQuestion({ enonce }: Pick<Proposition, "enonce">): string | null {
  return (enonce?.trim() ?? "") === "" ? "no question: a TODO card asks the chef exactly one question" : null;
}

// Pourquoi la carte est refusée faute de chemin de réponse (un choix que le
// chef clique), ou null.
export function refuserSansReponse({ choix }: Pick<Proposition, "choix">): string | null {
  return !choix || choix.length === 0 ? "no choice: a TODO card offers at least one choice to click" : null;
}
