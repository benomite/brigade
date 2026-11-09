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
// brigade elle-même, les tickets restent sur son dépôt ; un ticket de mesure
// qu'une autre station a mergé y est servi à sa fermeture (#2979, la règle dans
// `docs/runtime/etat-et-mesures.md`).
import { DE_CONFIANCE } from "./alimenter.ts";
import { MARQUE_QUALITE } from "./alerte-qualite.ts";
import type { GitHub } from "./github.ts";
import { MARQUE_CORRECTION, type GitHubDeLaCorrection } from "./temps-max/correction.ts";

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
// Les issues de confiance, et celles du compte `moi` sous lequel cette station dépose (#3012) : une
// station sans l'écriture sur la brigade voit ainsi son propre ticket, et ne le redépose pas à chaque
// tour ; l'issue d'un inconnu ne fait toujours taire personne.
export function familleCouverte(
  issues: readonly { number: number; body: string; association: string; author?: string; state?: string; closedAt?: string }[],
  metrique: string,
  valeur: string,
  maintenant: Date,
  moi: string | null = null,
): number | null {
  const famille = issues
    .filter((issue) => DE_CONFIANCE.includes(issue.association) || (moi !== null && issue.author !== undefined && issue.author.toLowerCase() === moi.toLowerCase()))
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
export type GitHubDeLaBrigade = Omit<GitHubDeLaCorrection, "issuesDepuis"> & Partial<Pick<GitHub, "droits">> & {
  issuesDepuis(instant: string): Promise<(Awaited<ReturnType<GitHubDeLaCorrection["issuesDepuis"]>>[number] & { closedAt?: string })[]>;
};

// Sur son propre dépôt, la station ne date un ticket de mesure que par son merge
// dans ses temps. Un ticket fermé qu'aucune ligne des temps ne porte (`dansLesTemps`)
// est servi à sa fermeture si une PR mergée l'a fermé (`prQuiFerme`) : mergé par
// une autre station. Fermé sans merge — un doublon que la station ferme, une issue
// écartée —, il n'a rien changé et n'attend rien, comme avant (#2577). La réponse
// de `prQuiFerme` est gardée par numéro et fermeture ; une lecture qui échoue
// fait échouer le tour, qui n'ouvre rien.
export function dateeParSaFermeture({ github, dansLesTemps }: { github: GitHubDeLaBrigade & Pick<GitHub, "prQuiFerme">; dansLesTemps: (numero: number) => boolean }): GitHubDeLaCorrection {
  const parUnMerge = new Map<string, boolean>();
  const fermeeParUnMerge = async (numero: number, closedAt: string) => {
    const cle = `${numero} ${closedAt}`;
    const connu = parUnMerge.get(cle);
    if (connu !== undefined) return connu;
    const merge = (await github.prQuiFerme(numero)) !== null;
    parUnMerge.set(cle, merge);
    return merge;
  };
  return {
    creerIssue: (issue) => github.creerIssue(issue),
    fermerIssue: (numero) => github.fermerIssue(numero),
    issuesDepuis: async (instant) => {
      const issues = await github.issuesDepuis(instant);
      const mesure = (body: string) => body.includes(MARQUE_QUALITE) || body.includes(MARQUE_CORRECTION);
      const ailleurs = issues.filter(({ number, state, closedAt, body }) => state === "closed" && closedAt !== undefined && mesure(body) && !dansLesTemps(number));
      const servies = new Set<number>();
      for (const { number, closedAt } of ailleurs) if (await fermeeParUnMerge(number, closedAt as string)) servies.add(number);
      return issues.map(({ closedAt, ...issue }) => (servies.has(issue.number) ? { ...issue, servieLe: closedAt as string } : issue));
    },
  };
}

// `dansLesTemps` : les tickets que cette station a mergés, lus dans ses temps ; sans lui, sur
// son propre dépôt, un ticket n'est daté que par ces temps, comme avant #2979.
export function routerLeTempsPerdu({ github, servi, brigade, dansLesTemps, maintenant = () => new Date() }: { github: GitHubDeLaBrigade & Partial<Pick<GitHub, "prQuiFerme">>; servi: string; brigade?: GitHubDeLaBrigade; dansLesTemps?: (numero: number) => boolean; maintenant?: () => Date }): GitHubDeLaCorrection {
  if (servi.toLowerCase() === DEPOT_BRIGADE) {
    const { prQuiFerme } = github;
    return prQuiFerme === undefined || dansLesTemps === undefined ? github : dateeParSaFermeture({ github: { ...github, prQuiFerme }, dansLesTemps });
  }
  if (brigade === undefined) return github;
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
        // Le compte de cette station ; une lecture qui échoue fait échouer le tour, qui ne dépose rien.
        const moi = (await brigade.droits?.())?.login ?? null;
        const couvert = familleCouverte(
          (await brigade.issuesDepuis(debut.toISOString())).filter((issue) => issue.body.includes(marque)),
          metrique,
          sansParenthese(titre),
          maintenant(),
          moi,
        );
        if (couvert !== null) return couvert;
      }
      return brigade.creerIssue({
        titre: `${titre} (measured on ${servi})`,
        corps: [
          marque,
          ...(metrique === null ? [] : [marqueDeLaFamille(metrique, titre)]),
          "",
          `> Measured on the served project **${servi}**: the loss below comes from its recorded ticket times, copied in the Evidence section. The cause lives in the station code (\`runtime/src\`), which is why this ticket is filed here and not on ${servi}.`,
          "",
          corps,
        ].join("\n"),
        labels,
      });
    },
    fermerIssue: (numero) => brigade.fermerIssue(numero),
  };
}
