// La fin du ticket de réparation d'une base rouge (#2340) : quand la station
// observe la base verte à son tour suivant, toute issue ouverte qui porte la
// marque `brigade:base-rouge` (`ouvre-reparation.ts`) n'est plus une réparation
// vivante. Elle est fermée, avec un commentaire qui le dit. Si la PR de
// réparation l'a déjà fermée, il n'y a rien à faire : ni commentaire, ni erreur.
//
// Rien n'est tenu hors de GitHub, rien n'est réglé par projet : la base et le
// client GitHub du projet suffisent.
import { etatDeLaBase } from "../github-etat/etats.ts";
import type { Issue } from "../github.ts";
import { PRIO_REPARATION } from "../reparation.ts";
import type { CheckDeLaBase } from "./ouvre-reparation.ts";
import { shaDeBaseRouge } from "./ouvre-reparation.ts";

// Les tickets que le tour lit déjà : une base verte sans réparation ouverte ne
// coûte aucun appel de plus à GitHub.
export type TicketDeLaFermeture = Pick<Issue, "number" | "labels" | "state">;

// Ce que la fermeture lit et écrit de GitHub.
export type GitHubDeLaFermeture = {
  corpsDuTicket(numero: number): Promise<string>;
  commenter(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
};

export const commentaireDeLaFermeture = (base: string): string =>
  `The base \`${base}\` is green again, so this repair is no longer needed. Closing it.`;

export type OptionsDeLaFermeture = {
  github: GitHubDeLaFermeture;
  base: string;
};

export function fermeReparation({ github, base }: OptionsDeLaFermeture) {
  // Les checks de la base et les tickets ouverts du tour. Verte, chaque
  // réparation ouverte (`prio:0` et marque dans le corps) est commentée puis
  // fermée ; rendu : les numéros fermés. Rouge, en cours ou inconnue, rien n'est
  // lu ni touché.
  return async (checks: CheckDeLaBase[], tickets: TicketDeLaFermeture[]): Promise<number[]> => {
    if (etatDeLaBase(checks) !== "green") return [];
    const fermees: number[] = [];
    for (const { number, labels, state } of tickets) {
      if (state !== "open" || !labels.includes(PRIO_REPARATION)) continue;
      if (shaDeBaseRouge(await github.corpsDuTicket(number)) === null) continue;
      await github.commenter(number, commentaireDeLaFermeture(base));
      await github.fermerIssue(number);
      fermees.push(number);
    }
    return fermees;
  };
}
