// La cuisine d'un projet dont la station a ouvert le ticket de préparation du
// dépôt : tant qu'il n'est pas servi, il est le seul à pouvoir partir — aucun
// autre ticket ne se cuirait sans gates qui le jugent, ni setup qui prépare
// son worktree. Servi, le rail est rendu entier, sans geste du chef.
//
// C'est le rail que lisent les stations, d'ici comme distantes, qui est
// retenu : la même restriction que celle d'une base rouge, qui ne laisse
// partir que sa réparation (`seul`). Une réparation en cours passe devant.
import type { RuntimeAvecRail } from "../alimenter.ts";
import type { Base } from "../base.ts";
import { sortDuTicket } from "../projections/rail.ts";
import type { Rail } from "../rail.ts";
import { lirePreparation } from "./ouvrir.ts";

// Les départs du rail qui libèrent la cuisine sans service : l'issue fermée par
// le chef — il renonce à la préparation, ou l'a mergée à la main —, ou
// disparue. Un label `fire` retiré, lui, ne fait que la suspendre : le rail
// reste retenu.
const LIBERENT = ["closed", "gone"];

// Le ticket de préparation que la station a ouvert pour ce projet, tant qu'il
// retient le rail — ni servi, ni fermé, ni disparu —, ou null.
export function preparationEnAttente(repertoireEtat: string, base: Base): number | null {
  const preparation = lirePreparation(repertoireEtat);
  return preparation === null || libere(base, preparation.ticket) ? null : preparation.ticket;
}

const libere = (base: Base, ticket: number) => {
  const sort = sortDuTicket(base, ticket);
  return sort !== null && (sort.outcome === "served" || LIBERENT.includes(sort.reason ?? ""));
};

export type OptionsAttente = {
  repertoireEtat: string;
  // Une ligne du journal de service de la station.
  dire: (ligne: string) => void;
};

export function attendreLaPreparation<R extends RuntimeAvecRail>(runtime: R, options: OptionsAttente): R {
  const preparation = lirePreparation(options.repertoireEtat);
  if (preparation === null) return runtime;
  const { ticket } = preparation;
  const { base } = runtime.journal;
  // Ce qui a été dit en dernier : un changement se dit une fois, pas à chaque prise.
  let dit: "retenu" | "libre" | null = null;
  // Le ticket qui seul peut partir, ou undefined : le rail est entier.
  const seulAPartir = (): number | undefined => {
    const sort = sortDuTicket(base, ticket);
    const libre = sort !== null && (sort.outcome === "served" || LIBERENT.includes(sort.reason ?? ""));
    if (libre && dit === "retenu") {
      options.dire(
        sort.outcome === "served"
          ? `brigade : #${ticket} (préparer le dépôt) est servi — le rail démarre`
          : `brigade : #${ticket} (préparer le dépôt) a quitté le rail sans être servi (${sort.reason}) — le rail n'attend plus`,
      );
    }
    if (!libre && dit !== "retenu") options.dire(`brigade : le rail attend #${ticket} (préparer le dépôt) — aucun autre ticket ne part avant son merge`);
    dit = libre ? "libre" : "retenu";
    return libre ? undefined : ticket;
  };
  const rail: Rail = {
    ...runtime.rail,
    prendre: (qui, enCuisine, seul) => runtime.rail.prendre(qui, enCuisine, seul ?? seulAPartir()),
    servables: (enCuisine, preneuses, seul) => runtime.rail.servables(enCuisine, preneuses, seul ?? seulAPartir()),
  };
  return { ...runtime, rail };
}
