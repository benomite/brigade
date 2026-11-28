// La vue du projet que le second lit à « pourquoi on est bloqués ? » (#4121) : les cartes du rail que le chef voit, tirées
// du tableau que l'app dessine — rien n'y est recalculé : un état lu est dit tel quel — et déposées, un fichier par projet,
// là où le crochet du second (blockage-of-second.ts) les lit.
import { mkdirSync, writeFileSync } from "node:fs";
import type { Card, Board } from "../facts.ts";
import type { CardOfTheVue, VueOfProject } from "./context-of-blockage.ts";
import { VIEWS, vueOf } from "./blockage-of-second.ts";

const THE_CHEF = "the chef";

// Qui est vraiment attendu d'une carte : le chef seulement quand elle lui demande quelque chose.
const whoAwaiting = (c: Card): string => (c.attendu ? THE_CHEF : "a third party");

// Aucun bandeau : le rail n'en pose plus. Seules les cartes qui attendent quelqu'un sont posées : ce que le chef voit de TODO.
function vueOfBoard(board: Board): VueOfProject {
  const rail: CardOfTheVue[] = board.rail.colonnes.flatMap((column) =>
    column.cartes.map((c) => {
      const displayed = c.ligne === undefined ? column.nom : `${column.nom} - ${c.ligne}`;
      return { number: c.ticket, title: c.titre ?? "", displayed, real: displayed, waitsOn: whoAwaiting(c) };
    }),
  );
  return { banners: [], rail };
}

// Dépose la vue du projet pour son second. Un dépôt qui échoue se dit, et le second n'a alors pas de vue : le crochet ne rend rien.
export function dropTheVue(project: string, board: Board, views: string = VIEWS()): void {
  try {
    mkdirSync(views, { recursive: true });
    writeFileSync(vueOf(views, project), JSON.stringify(vueOfBoard(board)));
  } catch (error) {
    console.error(`vue du projet ${project} non déposée pour le second : ${(error as Error).message}`);
  }
}
