// La carte d'un check Windows rouge sur la base (#2413, épique #2409) : un check
// informatif (`runtime-windows`, `app-windows`) rouge sur `main` met une seule
// carte dans TODO, tant qu'il reste rouge — pas une par commit. La carte a pour
// clé le nom du check et la branche, jamais le commit : un nouveau run rouge,
// sur un autre commit, la retrouve et n'en ouvre pas une seconde. Le check
// revenu vert, la carte sort de TODO, comme sortent les autres cartes.
//
// La carte n'a pas de ticket : sa clé en tient lieu, un numéro négatif dérivé
// du nom et de la branche, stable d'un tour à l'autre. La relance des runs
// rouges (relance-main-rouge.ts) n'est pas touchée.
import { cartesEnTodo, entrerDansTodo, sortirDeTodo } from "./carte-todo.ts";
import type { Journal } from "./journal.ts";

export const CHECKS_WINDOWS = ["runtime-windows", "app-windows"] as const;

const AUTEUR = "runtime";

// Le « ticket » de la carte d'un check sur une branche : un entier négatif,
// qu'aucun ticket de GitHub ne porte, le même pour le même couple.
export function ticketDuCheck(nom: string, branche: string): number {
  let hache = 2166136261;
  for (const c of `${nom}\n${branche}`) hache = Math.imul(hache ^ c.codePointAt(0)!, 16777619) >>> 0;
  return -1 - (hache % 0x3fffffff);
}

export type CheckVu = { name?: string; outcome: "green" | "red" | "pending" };

// Pose ou retire la carte de chaque check Windows lu sur la base. Rouge : la
// carte entre si elle n'est pas déjà dans TODO. Vert : elle en sort. En cours
// ou absent : rien ne bouge. Rend les noms dont la carte est entrée ou sortie.
export function suivreLesChecksWindows(journal: Journal, projet: string, branche: string, checks: readonly CheckVu[]): { entrees: string[]; sorties: string[] } {
  const entrees: string[] = [];
  const sorties: string[] = [];
  for (const nom of CHECKS_WINDOWS) {
    const lus = checks.filter((check) => check.name === nom);
    if (lus.length === 0) continue;
    const ticket = ticketDuCheck(nom, branche);
    const enTodo = cartesEnTodo(journal.base).some((carte) => carte.ticket === ticket);
    if (lus.some((check) => check.outcome === "red")) {
      if (enTodo) continue;
      const entree = entrerDansTodo(journal, projet, ticket, {
        type: "product",
        resume: `The Windows check ${nom} is red on ${branche}. It does not block merges.`,
        enonce: `Do you want a repair ticket for ${nom} on ${branche}?`,
        choix: [
          { texte: "Leave it, it will clear when the check turns green", suite: "drop" },
          { texte: "Close this card", suite: "close" },
        ],
      }, AUTEUR);
      if (entree.porte === "todo") entrees.push(nom);
    } else if (lus.every((check) => check.outcome === "green") && enTodo && sortirDeTodo(journal, projet, ticket, `${nom} is green on ${branche}`, AUTEUR)) {
      sorties.push(nom);
    }
  }
  return { entrees, sorties };
}
