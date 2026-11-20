// Le client de `nomme-livraison.ts` sur le client GitHub du runtime
// (`github.ts`) : la tête de la base et ses parents en REST, la PR d'un commit
// de merge et les tickets qu'elle livre en GraphQL.
import { DE_CONFIANCE } from "../alimenter.ts";
import type { CheckDeLaBase } from "../checks-de-la-base.ts";
import type { GitHub } from "../github.ts";
import { ticketDeLaPR } from "../recap/servis.ts";
import type { GitHubDeLaLivraison } from "./nomme-livraison.ts";

// Jusqu'où on remonte la base pour trouver le premier commit rouge : la
// cuisine ne merge plus rien sur une base rouge, il est presque toujours la tête.
export const REMONTEE_MAX = 20;

const REQUETE_PR = `query($owner: String!, $repo: String!, $sha: GitObjectID!) {
  repository(owner: $owner, name: $repo) { object(oid: $sha) { ... on Commit { associatedPullRequests(first: 20) { nodes { number merged mergeCommit { oid } } } } } }
}`;

const REQUETE_TICKETS = `query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $pr) { headRefName body closingIssuesReferences(first: 20) { nodes { number } } } }
}`;

type PRAssociee = { number?: unknown; merged?: unknown; mergeCommit?: { oid?: unknown } | null };
type PRLue = { headRefName?: unknown; body?: unknown; closingIssuesReferences?: { nodes?: Array<{ number?: unknown } | null> } | null };

// Null quand le client ne sait pas tout lire (ni GraphQL, ni la tête de la
// base, ni un commit) ou que le dépôt n'est pas nommé : rien n'est alors nommé.
export function githubDeLaLivraison(github: GitHub, base: string, depotGitHub: string | undefined): GitHubDeLaLivraison | null {
  const { lireGraphql, teteDeLaBase, commitGit } = github;
  const [owner, repo] = (depotGitHub ?? "").split("/");
  if (lireGraphql === undefined || teteDeLaBase === undefined || commitGit === undefined || !owner || !repo) return null;
  const graphql = (requete: string, variables: Record<string, string | number>) => lireGraphql.call(github, requete, { owner, repo, ...variables });
  return {
    // Depuis la tête, tant que le premier parent porte l'un de ces checks rouge.
    commitDuPremierRouge: async (rouges: CheckDeLaBase[]) => {
      const noms = new Set(rouges.map((check) => check.name));
      let premier = { sha: await teteDeLaBase.call(github, base), rouges };
      for (let i = 0; i < REMONTEE_MAX; i++) {
        const parent = (await commitGit.call(github, premier.sha))?.parents[0];
        if (parent === undefined) break;
        const siens = (await github.ci(parent)).filter((check) => check.outcome === "red" && noms.has(check.name));
        if (siens.length === 0) break;
        premier = { sha: parent, rouges: siens };
      }
      return premier;
    },
    // La PR dont ce commit est le merge : une PR qui le contient seulement (une
    // branche qui a fusionné la base) n'en est pas une.
    prDuCommit: async (sha) => {
      const lu = (await graphql(REQUETE_PR, { sha })) as { repository?: { object?: { associatedPullRequests?: { nodes?: Array<PRAssociee | null> } } | null } | null } | null;
      const nodes = lu?.repository?.object?.associatedPullRequests?.nodes;
      if (!Array.isArray(nodes)) throw new Error(`the PRs of commit ${sha.slice(0, 7)} are unreadable`);
      const pr = nodes.find((node) => node?.merged === true && node.mergeCommit?.oid === sha)?.number;
      return typeof pr === "number" ? pr : null;
    },
    ticketsLiesALaPR: async (pr) => {
      const lue = ((await graphql(REQUETE_TICKETS, { pr })) as { repository?: { pullRequest?: PRLue | null } | null } | null)?.repository?.pullRequest;
      if (lue === null || lue === undefined || typeof lue.headRefName !== "string") throw new Error(`PR #${pr} is unreadable`);
      const tickets = [ticketDeLaPR(lue.headRefName, typeof lue.body === "string" ? lue.body : ""), ...(lue.closingIssuesReferences?.nodes ?? []).map((node) => node?.number)];
      return [...new Set(tickets.filter((ticket): ticket is number => typeof ticket === "number" && ticket !== pr))];
    },
    commentairesDe: async (numero) => (await github.commentaires(numero)).filter(({ association }) => DE_CONFIANCE.includes(association)).map(({ body }) => body),
    commenter: (numero, corps) => github.commenter(numero, corps),
  };
}
