// #4242 : une PR ouverte ne tient une zone de fichiers que tant qu'elle est
// vivante. Le 2026-11-24, une PR oubliée (second/readme-lien-releases, PR 4077)
// a tenu la zone du README une heure, et la porte de prise a sauté le seul
// ticket cuisinable (#4061).
//
// Vivante : son ticket est en cuisine ou au pass, ou elle a bougé (commit,
// commentaire, relecture, mise à jour) depuis moins que le délai de
// péremption. Ne tient rien : une PR que le superviseur marque `zone-released`,
// ni une PR dont les changements sont déjà sur la base. Une activité qui ne se
// lit pas, ou une base qui ne se compare pas : dans le doute, la zone reste tenue.

// Le délai sans activité au-delà duquel une PR ouverte ne tient plus sa zone.
const STALE_DELAY_MS = 12 * 60 * 60 * 1000;

// Le label que le superviseur pose sur une PR qui ne doit plus tenir sa zone.
const LABEL_ZONE_RELEASED = "zone-released";

// Le code d'un saut de la porte de prise sur une zone tenue par une PR : le statut le lit.
export const ZONE_HELD = "zone-held";
export type RaisonDuSaut = { code: typeof ZONE_HELD; pr: number | null };

// Une PR ouverte telle que la porte la lit. `surLaBase` : ses changements sont
// déjà sur la base — lu à la demande, la lecture coûtant un appel à GitHub.
export type PRDeLaPorte = {
  number?: number;
  branche: string;
  misAJourLe?: string;
  labels?: readonly string[];
  surLaBase?: boolean | (() => Promise<boolean>);
};

// Pourquoi la PR tient encore sa zone, ou null si elle ne la tient plus.
// `parSonTicket` : ce que son ticket en dit (« in cook », « at the pass »), null s'il ne la fait pas vivre.
export async function vivante(pr: PRDeLaPorte, options: { maintenant: number; parSonTicket: () => Promise<string | null> }): Promise<string | null> {
  if (pr.labels?.includes(LABEL_ZONE_RELEASED)) return null;
  let pourquoi = await options.parSonTicket();
  if (pourquoi === null) {
    const activite = Date.parse(pr.misAJourLe ?? "");
    if (Number.isNaN(activite)) pourquoi = "its last activity is not known";
    else if (options.maintenant - activite < STALE_DELAY_MS) pourquoi = `last activity ${new Date(activite).toISOString()}, within the ${STALE_DELAY_MS / 3_600_000} h stale delay`;
    else return null;
  }
  if (await dejaSurLaBase(pr)) return null;
  return pourquoi;
}

// Une base qui ne se compare pas ne libère rien.
async function dejaSurLaBase({ surLaBase }: PRDeLaPorte): Promise<boolean> {
  if (typeof surLaBase === "function") return surLaBase().catch(() => false);
  return surLaBase ?? false;
}

// La ligne du saut : le numéro de la PR, et pourquoi elle tient la zone.
export function direZoneTenue(pr: PRDeLaPorte, pourquoi: string): string {
  const ticket = /^cook\/(\d+)-/.exec(pr.branche)?.[1];
  const nommee = pr.number === undefined ? `the open PR on \`${pr.branche}\`` : `open PR #${pr.number}`;
  return ticket === undefined ? `zone held by ${nommee} (${pourquoi})` : `zone held by #${ticket} through its ${nommee} (${pourquoi})`;
}

// Les changements de la PR sont-ils déjà sur la base ? Oui quand chacun de ses
// fichiers a, sur la base, le contenu qu'il a sur sa tête — un squash ou un
// cherry-pick l'y a porté. Une lecture par PR, gardée : la porte la relit
// d'un ticket à l'autre au même tour. Une lecture qui échoue lève.
export function lecteurDeLaBase(lire: (requete: string, variables: Record<string, string>) => Promise<unknown>, depot: { owner: string; repo: string; base: string }) {
  return (sha: string, fichiers: readonly string[]): (() => Promise<boolean>) => {
    let lu: Promise<boolean> | undefined;
    return () => (lu ??= comparer(lire, depot, sha, fichiers));
  };
}

async function comparer(lire: (requete: string, variables: Record<string, string>) => Promise<unknown>, { owner, repo, base }: { owner: string; repo: string; base: string }, sha: string, fichiers: readonly string[]): Promise<boolean> {
  const variables: Record<string, string> = { owner, repo };
  const champs = fichiers.map((fichier, i) => {
    variables[`t${i}`] = `${sha}:${fichier}`;
    variables[`b${i}`] = `${base}:${fichier}`;
    return `t${i}: object(expression: $t${i}) { oid } b${i}: object(expression: $b${i}) { oid }`;
  });
  const declarees = fichiers.map((_, i) => `, $t${i}: String!, $b${i}: String!`).join("");
  const data = (await lire(`query($owner: String!, $repo: String!${declarees}) { repository(owner: $owner, name: $repo) { ${champs.join(" ")} } }`, variables)) as { repository?: Record<string, { oid?: string } | null> } | null;
  const depot = data?.repository;
  if (depot === undefined || depot === null) throw new Error("GraphQL : no repository in the answer");
  // Un fichier absent des deux côtés (supprimé, ou l'ancien nom d'un renommage) est le même.
  return fichiers.length > 0 && fichiers.every((_, i) => (depot[`t${i}`]?.oid ?? null) === (depot[`b${i}`]?.oid ?? null));
}
