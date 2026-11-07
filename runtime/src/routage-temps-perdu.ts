// Le ticket « Tickets lose too much time » va à la brigade, pas au projet servi
// (#2783, épique #2782). Sa cause est dans le code de la station (`runtime/src`),
// hors du dépôt du projet et du worktree de son cook : déposé sur le projet, le
// cook échoue trois fois et le ticket finit hors cuisine. Le ticket de qualité
// qui passe devant lui (#2680) suit la même route, par le même client.
//
// Ce module enveloppe le GitHub que la règle lit et écrit (`GitHubDeLaCorrection`) :
// sur un projet servi, tout passe par le dépôt de la brigade, et rien ne se crée
// sur le projet. Le corps du ticket nomme le projet et la perte mesurée ; la
// recherche du ticket déjà ouvert ne retient que ceux de ce projet, pour qu'un
// projet n'en masque pas un autre. Sur la brigade elle-même, rien ne change.
import type { GitHubDeLaCorrection } from "./temps-max/correction.ts";

export const DEPOT_BRIGADE = "benomite/brigade";

// La marque cachée qui nomme le projet servi dans le ticket déposé sur la brigade.
export const marqueDuProjet = (servi: string) => `<!-- brigade:projet=${servi} -->`;

export function routerLeTempsPerdu({ github, servi, brigade }: { github: GitHubDeLaCorrection; servi: string; brigade?: GitHubDeLaCorrection }): GitHubDeLaCorrection {
  if (brigade === undefined || servi.toLowerCase() === DEPOT_BRIGADE) return github;
  const marque = marqueDuProjet(servi);
  return {
    issuesDepuis: async (instant) => (await brigade.issuesDepuis(instant)).filter((issue) => issue.body.includes(marque)),
    creerIssue: ({ titre, corps, labels }) =>
      brigade.creerIssue({
        titre: `${titre} (measured on ${servi})`,
        corps: [
          marque,
          "",
          `> Measured on the served project **${servi}**: the loss below comes from its \`.claude/brigade/temps-tickets.json\`. The cause lives in the station code (\`runtime/src\`), which is why this ticket is filed here and not on ${servi}.`,
          "",
          corps,
        ].join("\n"),
        labels,
      }),
    fermerIssue: (numero) => brigade.fermerIssue(numero),
  };
}
