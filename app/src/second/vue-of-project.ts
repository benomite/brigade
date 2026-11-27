// La vue du projet que le second lit à « pourquoi on est bloqués ? » (#4121) : les cartes du rail que le chef voit, tirées
// du tableau que l'app dessine — rien n'y est recalculé : un état lu est dit tel quel — et déposées, un fichier par projet,
// là où le crochet du second (blockage-of-second.ts) les lit.
import { mkdirSync, writeFileSync } from "node:fs";
import type { Card, Board } from "../facts.ts";
import type { CardOfTheVue, VueOfProject } from "./context-of-blockage.ts";
import { VIEWS, vueOf } from "./blockage-of-second.ts";

const THE_CHEF = "the chef";

// Qui est vraiment attendu d'une carte : le chef seulement quand elle lui demande quelque chose.
function whoAwaiting(c: Card, state: string | undefined): string {
  if (c.attendu || c.question) return THE_CHEF;
  if (c.enWaiting || c.relancePassee) return c.relancePassee ? THE_CHEF : "the station, which set the card aside";
  const word = (state ?? "").toLowerCase();
  if (/^(cooking|pris|taken|tests written|tests écrits)$/.test(word)) return "a cook";
  if (word === "in pass" || word === "pass" || word === "base rouge") return word === "base rouge" ? "main to be green" : "the pass";
  if (word === "queued" || word === "en attente") return "the kitchen, which will take it";
  return "a third party";
}

// Aucun bandeau : le rail n'en pose plus. « base rouge » n'est jamais dit — le rail ne dit plus la base rouge — : la carte est
// ramenée à « in pass ».
function vueOfBoard(board: Board): VueOfProject {
  const rail: CardOfTheVue[] = board.rail.colonnes.flatMap((column) =>
    column.cartes.filter((c) => c.etat !== "served" && column.nom !== "SERVED").map((c) => {
      const staleOne = c.etat === "base rouge";
      const state = staleOne ? "in pass" : c.etat;
      const displayed = staleOne ? "in pass" : c.ligne === undefined ? (c.mot ?? c.etat ?? column.nom) : `${c.etat ?? column.nom} - ${c.ligne}`;
      return { number: c.ticket, title: c.titre ?? "", displayed, real: displayed, waitsOn: whoAwaiting(c, state) };
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
