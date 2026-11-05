// La fin du ticket de réparation d'une base rouge (#2340) : quand la station
// observe la base verte à son tour suivant, toute issue ouverte qui porte la
// marque `brigade:base-rouge` (`ouvre-reparation.ts`) n'est plus une réparation
// vivante. Elle est fermée, avec un commentaire qui le dit. Si la PR de
// réparation l'a déjà fermée, il n'y a rien à faire : ni commentaire, ni erreur.
//
// Rien n'est tenu hors de GitHub, rien n'est réglé par projet : la base et le
// client GitHub du projet suffisent.
import { DE_CONFIANCE } from "../alimenter.ts";
import { etatDeLaBase } from "../github-etat/etats.ts";
import type { IssueOuverte } from "../github.ts";
import type { CheckDeLaBase } from "./ouvre-reparation.ts";
import { shaDeBaseRouge } from "./ouvre-reparation.ts";

// Ce que la fermeture lit et écrit de GitHub.
export type GitHubDeLaFermeture = {
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
  issuesDepuis(instant: string): Promise<Pick<IssueOuverte, "number" | "body" | "association" | "state">[]>;
  commenter(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
};

// Jusqu'où on cherche une réparation encore ouverte.
const FENETRE_MS = 30 * 24 * 3600 * 1000;

export const commentaireDeLaFermeture = (base: string): string =>
  `The base \`${base}\` is green again, so this repair is no longer needed. Closing it.`;

export type OptionsDeLaFermeture = {
  github: GitHubDeLaFermeture;
  base: string;
  maintenant?: () => Date;
};

export function fermeReparation({ github, base, maintenant = () => new Date() }: OptionsDeLaFermeture) {
  // Les checks de la base, tels que le tour les rend. Verte, chaque réparation
  // ouverte est commentée puis fermée ; rendu : les numéros fermés. Rouge,
  // en cours ou inconnue, rien n'est lu ni touché.
  return async (checks: CheckDeLaBase[]): Promise<number[]> => {
    if (etatDeLaBase(checks) !== "green") return [];
    const depuis = new Date(maintenant().getTime() - FENETRE_MS).toISOString();
    const ouvertes = (await github.issuesDepuis(depuis)).filter((issue) => issue.state === "open" && DE_CONFIANCE.includes(issue.association) && shaDeBaseRouge(issue.body) !== null);
    const fermees: number[] = [];
    for (const { number } of ouvertes) {
      await github.commenter(number, commentaireDeLaFermeture(base));
      await github.fermerIssue(number);
      fermees.push(number);
    }
    return fermees;
  };
}
