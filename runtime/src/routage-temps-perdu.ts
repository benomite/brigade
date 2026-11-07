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
// projet n'en masque pas un autre. Le merge d'un ticket de la brigade n'est
// pas dans les temps du projet : chacun dit quand il a été fermé (`servieLe`),
// pour que la correction servie soit à l'essai sur le projet (#2809). Sur la
// brigade elle-même, rien ne change.
import { DE_CONFIANCE } from "./alimenter.ts";
import type { GitHubDeLaCorrection } from "./temps-max/correction.ts";

export const DEPOT_BRIGADE = "benomite/brigade";

// La marque cachée qui nomme le projet servi dans le ticket déposé sur la brigade.
export const marqueDuProjet = (servi: string) => `<!-- brigade:projet=${servi} -->`;

// Une famille (#2833) : une mesure (qualité, temps perdu) sur un projet mesuré.
// Sa clé ne porte ni le nombre du titre ni la parenthèse « (measured on …) » :
// deux tickets aux taux différents, ou aux sources différentes, sont une famille.
// Le corps du ticket déposé porte la marque de sa famille et la valeur qu'il a
// mesurée (le titre sans sa parenthèse), que le ticket suivant compare.
export const FAMILLES = [
  { metrique: "qualite", debut: "Quality before time" },
  { metrique: "temps-perdu", debut: "Tickets lose too much time" },
] as const;
// Après le merge d'un ticket d'une famille, aucun autre ne se dépose pendant ce délai.
export const DELAI_FAMILLE_MS = 6 * 60 * 60 * 1000;
// Jusqu'où, sur la brigade, on cherche les tickets d'une famille.
const FENETRE_FAMILLE_MS = 30 * 24 * 60 * 60 * 1000;
const MARQUE_FAMILLE = /<!-- brigade:famille (\S+) valeur=(.*?) -->/;
const sansParenthese = (titre: string) => titre.replace(/\s*\(measured on [^)]*\)\s*$/, "").trim();
const metriqueDuTitre = (titre: string) => FAMILLES.find((f) => titre.startsWith(f.debut))?.metrique ?? null;
export const marqueDeLaFamille = (metrique: string, titre: string) => `<!-- brigade:famille ${metrique} valeur=${sansParenthese(titre).replaceAll("-->", "")} -->`;

// Le ticket qui couvre déjà ce dépôt : un de la famille encore ouvert, mergé
// depuis moins de `DELAI_FAMILLE_MS`, ou mergé dont la mesure n'a pas changé
// depuis. Sinon null : la mesure a changé après le merge, ou il n'y en a pas.
export function familleCouverte(
  issues: readonly { number: number; body: string; association: string; state?: string; closedAt?: string }[],
  metrique: string,
  valeur: string,
  maintenant: Date,
): number | null {
  const famille = issues
    .filter((issue) => DE_CONFIANCE.includes(issue.association))
    .flatMap((issue) => {
      const marque = MARQUE_FAMILLE.exec(issue.body);
      return marque?.[1] === metrique ? [{ issue, valeur: marque[2] }] : [];
    })
    .sort((x, y) => x.issue.number - y.issue.number);
  const ouvert = famille.find(({ issue }) => issue.state !== "closed");
  if (ouvert !== undefined) return ouvert.issue.number;
  const dernier = famille.at(-1);
  if (dernier === undefined) return null;
  const fermeLe = Date.parse(dernier.issue.closedAt ?? "");
  const recent = !Number.isNaN(fermeLe) && maintenant.getTime() - fermeLe < DELAI_FAMILLE_MS;
  return recent || dernier.valeur === valeur ? dernier.issue.number : null;
}

// Le GitHub de la brigade tel que le routage le lit : ses issues fermées
// disent quand (`closedAt`), si GitHub le dit.
export type GitHubDeLaBrigade = Omit<GitHubDeLaCorrection, "issuesDepuis"> & {
  issuesDepuis(instant: string): Promise<(Awaited<ReturnType<GitHubDeLaCorrection["issuesDepuis"]>>[number] & { closedAt?: string })[]>;
};

export function routerLeTempsPerdu({ github, servi, brigade, maintenant = () => new Date() }: { github: GitHubDeLaCorrection; servi: string; brigade?: GitHubDeLaBrigade; maintenant?: () => Date }): GitHubDeLaCorrection {
  if (brigade === undefined || servi.toLowerCase() === DEPOT_BRIGADE) return github;
  const marque = marqueDuProjet(servi);
  return {
    issuesDepuis: async (instant) =>
      (await brigade.issuesDepuis(instant))
        .filter((issue) => issue.body.includes(marque))
        .map(({ closedAt, ...issue }) => ({ ...issue, servieLe: issue.state === "closed" ? (closedAt ?? null) : null })),
    // Un ticket de la même famille déjà ouvert, récemment mergé ou à la mesure inchangée :
    // « already covered », rien ne se dépose et son numéro est rendu (#2833).
    creerIssue: async ({ titre, corps, labels }) => {
      const metrique = metriqueDuTitre(titre);
      if (metrique !== null) {
        const debut = new Date(maintenant().getTime() - FENETRE_FAMILLE_MS);
        debut.setUTCHours(0, 0, 0, 0);
        const couvert = familleCouverte(
          (await brigade.issuesDepuis(debut.toISOString())).filter((issue) => issue.body.includes(marque)),
          metrique,
          sansParenthese(titre),
          maintenant(),
        );
        if (couvert !== null) return couvert;
      }
      return brigade.creerIssue({
        titre: `${titre} (measured on ${servi})`,
        corps: [
          marque,
          ...(metrique === null ? [] : [marqueDeLaFamille(metrique, titre)]),
          "",
          `> Measured on the served project **${servi}**: the loss below comes from its \`.claude/brigade/temps-tickets.json\`. The cause lives in the station code (\`runtime/src\`), which is why this ticket is filed here and not on ${servi}.`,
          "",
          corps,
        ].join("\n"),
        labels,
      });
    },
    fermerIssue: (numero) => brigade.fermerIssue(numero),
  };
}
