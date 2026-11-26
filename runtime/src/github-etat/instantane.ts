// L'état d'un tour GitHub seul, lu en une seule requête GraphQL (#2301) : les
// issues ouvertes qui portent `fire`, avec leurs labels ; les PR ouvertes —
// celles des cooks, et les autres, dont les fichiers tiennent des zones —, avec
// leur tête, leur fusionnabilité, leur CI et les fichiers qu'elles changent ; et la
// CI du dernier commit de la base. Ce que la requête tronque (plus de 30 PR, 100
// fichiers, 60 contextes, un fichier renommé) est dit, et se relit en REST.
// Le corps d'une issue ne se lit que pour dire si elle est une épique — une
// épique ne se prend pas (#2618) —, et de quel besoin elle est née (#3479).
// Avant, un tour lisait tout cela en REST, ticket par ticket et PR par PR :
// des centaines d'appels par minute avec seize livraisons au pass, et GitHub
// coupait le compte.
//
// Une lecture, pas un état : rien n'est gardé d'un tour au suivant. Ce que
// l'instantané ne porte pas — une PR déjà mergée, plus de 100 tickets — se lit
// encore en REST, par le client du tour.
import type { Check } from "../events/pass.ts";
import { lienDuCorps } from "../besoin/besoin.ts";
import { porteListe } from "../epique.ts";
import { avecLAlerte, type AlerteDeLaCuisine } from "../issue-de-la-cuisine.ts";
import { CONCLUSIONS_VERTES } from "../github.ts";

export const REQUETE = `query($owner: String!, $repo: String!, $base: String!) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, states: OPEN, labels: ["fire"], orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage }
      nodes { number title body labels(first: 30) { nodes { name } } comments(last: 100) { totalCount nodes { body authorAssociation createdAt author { login } } } }
    }
    pullRequests(first: 30, states: OPEN) {
      pageInfo { hasNextPage }
      nodes {
        number headRefName headRefOid isCrossRepository mergeable mergeStateStatus updatedAt
        labels(first: 30) { nodes { name } }
        files(first: 100) { pageInfo { hasNextPage } nodes { path changeType } }
        commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 60) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state }
        } } } } } }
      }
    }
    ref(qualifiedName: $base) { target { ... on Commit { statusCheckRollup { contexts(first: 60) { pageInfo { hasNextPage } nodes {
      __typename
      ... on CheckRun { name status conclusion detailsUrl startedAt }
      ... on StatusContext { context state createdAt }
    } } } } } }
  }
}`;

// `epique` : son corps porte la liste des tickets d'une épique (`epique.ts`).
// `besoin` : le besoin dont il se dit né (`besoin/besoin.ts`). `alerte` : une
// issue que la station a ouverte sur la cuisine (`issue-de-la-cuisine.ts`, #3620).
export type TicketDeLInstantane = { number: number; title: string; labels: string[]; state: "open"; epique?: true; besoin?: number; alerte?: AlerteDeLaCuisine };
export type PRDeLInstantane = {
  number: number;
  branche: string;
  sha: string;
  // Une PR externe (#2933) : sa tête vient d'un autre dépôt que celui du
  // projet — un fork. Elle n'est la PR d'aucun ticket, quel que soit le nom de
  // sa branche, et se sert par `pr-externe/`.
  externe: boolean;
  enRetard: boolean;
  enConflit: boolean;
  // Ce qui change dès que GitHub change quoi que ce soit à sa fusion.
  version: string;
  fichiers: string[];
  // Les fichiers lus ne sont pas tous ceux de la PR (plus de 100, ou un fichier
  // renommé dont GraphQL ne dit pas l'ancien chemin) : ils se relisent en REST.
  fichiersIncomplets: boolean;
  // Sa dernière activité et ses labels : la porte de prise ne compte que les PR vivantes (#4242).
  misAJourLe?: string;
  labels: string[];
  ci: Array<Pick<Check, "name" | "outcome"> & Partial<Pick<Check, "url">>>;
  // Plus de contextes que la requête n'en lit : la CI se relit en REST.
  ciIncomplete: boolean;
};
export type CommentaireDeLInstantane = { body: string; author: string; association: string; createdAt: string };
export type Instantane = {
  tickets: TicketDeLInstantane[];
  // Les commentaires de chaque ticket, du plus ancien au plus récent (#3834) ;
  // un ticket dont la requête n'a pas lu tous les commentaires n'y est pas, et se lit en REST.
  commentaires: Map<number, CommentaireDeLInstantane[]>;
  // Le corps de chaque ticket lu, tel que la requête le rend.
  corps: Map<number, string>;
  // Plus de tickets que la requête n'en lit : la liste se relit en REST.
  incomplet: boolean;
  prs: PRDeLInstantane[];
  // Plus de PR ouvertes que la requête n'en lit : les PR se relisent en REST.
  prsTronquees: boolean;
  // Les checks de la base disent aussi quand ils ont commencé : le début d'une panne de `main` (#4382).
  base: Array<Pick<Check, "name" | "outcome"> & Partial<Pick<Check, "url" | "startedAt">>>;
  baseIncomplete: boolean;
};

type Contexte = { __typename?: string; name?: string; status?: string; conclusion?: string | null; detailsUrl?: string | null; context?: string; state?: string; startedAt?: string | null; createdAt?: string };

// Un check tel que le REST le dit (`github.ts`, `ci`) : vert, rouge ou en cours.
function check(contexte: Contexte): Pick<Check, "name" | "outcome"> & Partial<Pick<Check, "url">> | null {
  if (contexte.__typename === "CheckRun" && typeof contexte.name === "string") {
    if (contexte.status !== "COMPLETED") return { name: contexte.name, outcome: "pending" };
    const outcome = CONCLUSIONS_VERTES.includes((contexte.conclusion ?? "").toLowerCase()) ? "green" : "red";
    // Un job rouge garde son lien : la station relance son run (#2323).
    return outcome === "red" && typeof contexte.detailsUrl === "string" ? { name: contexte.name, outcome, url: contexte.detailsUrl } : { name: contexte.name, outcome };
  }
  if (contexte.__typename === "StatusContext" && typeof contexte.context === "string") {
    const etat = (contexte.state ?? "").toLowerCase();
    return { name: contexte.context, outcome: etat === "success" ? "green" : etat === "pending" || etat === "expected" ? "pending" : "red" };
  }
  return null;
}

type Rollup = { contexts?: { pageInfo?: { hasNextPage?: boolean }; nodes?: Contexte[] } } | null;

const checksDe = (rollup: unknown): Array<Pick<Check, "name" | "outcome"> & Partial<Pick<Check, "url">>> => {
  const noeuds = (rollup as Rollup)?.contexts?.nodes ?? [];
  return noeuds.map(check).filter((c): c is Pick<Check, "name" | "outcome"> & Partial<Pick<Check, "url">> => c !== null);
};
// Ceux de la base disent aussi quand chacun a commencé, quand GitHub le dit.
const checksDeLaBase = (rollup: unknown): Instantane["base"] =>
  ((rollup as Rollup)?.contexts?.nodes ?? []).flatMap((contexte) => {
    const lu = check(contexte);
    const debut = contexte.startedAt ?? contexte.createdAt;
    return lu === null ? [] : [typeof debut === "string" ? { ...lu, startedAt: debut } : lu];
  });
const tronque = (rollup: unknown): boolean => (rollup as Rollup)?.contexts?.pageInfo?.hasNextPage === true;

// L'instantané, lu dans ce que la requête rend. Lève si sa forme n'y est pas.
export function lireInstantane(data: unknown): Instantane {
  const depot = (data as { repository?: Record<string, unknown> } | null)?.repository;
  if (depot === undefined || depot === null) throw new Error("GraphQL : no repository in the answer");
  const issues = depot.issues as { pageInfo?: { hasNextPage?: boolean }; nodes?: Array<{ number: number; title: string; body?: string | null; labels?: { nodes?: Array<{ name: string }> }; comments?: { totalCount?: number; nodes?: Array<{ body?: string | null; authorAssociation?: string; createdAt?: string; author?: { login?: string } | null }> } }> };
  const prs = depot.pullRequests as { pageInfo?: { hasNextPage?: boolean }; nodes?: Array<Record<string, unknown>> };
  const tickets = (issues.nodes ?? []).map((n) => {
    const ticket = { number: n.number, title: n.title, labels: (n.labels?.nodes ?? []).map((l) => l.name), state: "open" as const };
    return { ...ticket, ...(porteListe(n.body ?? "") ? { epique: true as const } : {}), ...lienDuCorps(n.number, n.body ?? ""), ...avecLAlerte({ ...ticket, body: n.body }) };
  });
  // Un commentaire que la requête ne rend pas en entier, ou dont elle ne dit pas le compte, ne se devine pas.
  const commentaires = new Map<number, CommentaireDeLInstantane[]>();
  const corps = new Map<number, string>();
  for (const n of issues.nodes ?? []) {
    if (typeof n.body === "string") corps.set(n.number, n.body);
    const lus = n.comments?.nodes;
    if (lus === undefined || typeof n.comments?.totalCount !== "number" || lus.length < n.comments.totalCount) continue;
    commentaires.set(n.number, lus.map((c) => ({ body: c.body ?? "", author: c.author?.login ?? "", association: c.authorAssociation ?? "NONE", createdAt: c.createdAt ?? "" })));
  }
  const baseRollup = (depot.ref as { target?: { statusCheckRollup?: unknown } } | null)?.target?.statusCheckRollup ?? null;
  return {
    tickets,
    commentaires,
    corps,
    incomplet: issues.pageInfo?.hasNextPage === true,
    prs: (prs.nodes ?? [])
      .filter((p) => typeof p.headRefName === "string")
      .map((p) => {
        const fichiers = p.files as { pageInfo?: { hasNextPage?: boolean }; nodes?: Array<{ path: string; changeType?: string }> } | undefined;
        const commit = (p.commits as { nodes?: Array<{ commit?: { statusCheckRollup?: unknown } }> } | undefined)?.nodes?.[0]?.commit;
        return {
          number: p.number as number,
          branche: p.headRefName as string,
          sha: p.headRefOid as string,
          externe: p.isCrossRepository === true,
          enRetard: p.mergeStateStatus === "BEHIND",
          enConflit: p.mergeable === "CONFLICTING" || p.mergeStateStatus === "DIRTY",
          version: `${String(p.headRefOid)}/${String(p.mergeable)}/${String(p.mergeStateStatus)}`,
          fichiers: (fichiers?.nodes ?? []).map((f) => f.path),
          fichiersIncomplets: fichiers?.pageInfo?.hasNextPage === true || (fichiers?.nodes ?? []).some((f) => f.changeType === "RENAMED" || f.changeType === "COPIED"),
          ...(typeof p.updatedAt === "string" ? { misAJourLe: p.updatedAt } : {}),
          labels: ((p.labels as { nodes?: Array<{ name: string }> } | undefined)?.nodes ?? []).map((l) => l.name),
          ci: checksDe(commit?.statusCheckRollup ?? null),
          ciIncomplete: tronque(commit?.statusCheckRollup ?? null),
        };
      }),
    prsTronquees: prs.pageInfo?.hasNextPage === true,
    base: checksDeLaBase(baseRollup),
    baseIncomplete: tronque(baseRollup),
  };
}
