// Les chiffres d'autonomie d'un projet, ou de tous (ticket 3222, épique 3213) : servi sans humain, délai, taux de renvoi,
// sur les 7 ou les 30 derniers jours. Tout se lit de GitHub, rien de ce poste — un ordinateur neuf montre les mêmes :
//   - les PR fermées de son dépôt, page après page jusqu'à la plus longue période (vue/rail/github.ts, `lireLesServis`) ;
//   - pour chaque ticket servi, les événements et les commentaires de son issue, toutes pages.
//   - pour les défauts échappés à la pass (ticket 3515), les issues `bug` mises à jour sur la période, les commits de la
//     branche par défaut qui portent le trailer de git `This reverts commit <sha>` — la recherche de commits de GitHub
//     ne cherche que la branche par défaut —, et pour chaque commit reverté, les PR mergées qui le tiennent.
// Le calcul est celui du runtime (runtime/src/autonomie/chiffres/chiffres.ts) : ce module lit, puis le lui remet.
//
// Une lecture coûte deux appels par ticket servi sur 30 jours : chaque dépôt lu se garde le temps de `fraicheurMs`, et
// sert aux deux périodes, au projet comme à tous les projets. Un dépôt qui ne se lit pas est nommé, avec sa raison ;
// aucun ne se lit : la lecture le dit, sans chiffre.
import { chiffresDAutonomie, commitsRevertes, LABEL_BUG, PERIODES, type ChiffresDAutonomie, type Defauts, type DonneesDuDepot } from "../../../../runtime/src/autonomie/chiffres/chiffres.ts";
import type { CallGitHub } from "../../board/client.ts";
import { ticketDeLaPR } from "../../board/rail-github.ts";
import { readTheServedOnTheWindow, allThePages } from "../rail/github.ts";

const DAY_MS = 24 * 3600 * 1000;
// Les lectures d'issues en vol à la fois, par dépôt.
const EN_PARALLEL = 6;
// Les pages de PR fermées lues au plus : 10 000 PR. Au-delà, la lecture s'arrête et le dit.
const PAGES_OF_PR_AT_MOST = 100;

// Un ticket servi avec un humain, nommé avec son projet.
export type ServedWithHuman = ChiffresDAutonomie["avecHumain"][number] & { projet: string };
// Un dépôt lu en partie : ses tickets ne sont lus que depuis cet instant, et pourquoi la lecture s'est arrêtée.
export type Partial = { depuis: string; raison: string };
// Ce que GitHub tient d'un dépôt, et jusqu'où on l'a lu : `partiel` est null quand la plus longue période est entière.
export type DataRead = DonneesDuDepot & { partiel: Partial | null };
// Un défaut échappé, nommé avec son projet.
export type BugEscapes = NonNullable<ChiffresDAutonomie["bugsEchappes"]>[number] & { projet: string };
export type Revert = NonNullable<ChiffresDAutonomie["reverts"]>[number] & { projet: string };
type FiguresRead = Omit<ChiffresDAutonomie, "avecHumain" | "bugsEchappes" | "reverts" | "defautsNonLus"> & { avecHumain: ServedWithHuman[]; bugsEchappes: BugEscapes[] | null; reverts: Revert[] | null; defautsNonLus: { projet: string; raison: string }[] };
// Les chiffres, chaque ticket et chaque défaut nommés avec le projet de son dépôt.
export function nameTheProjects(figures: ChiffresDAutonomie, project: (repository: string) => string): FiguresRead {
  return {
    ...figures,
    avecHumain: figures.avecHumain.map((served) => ({ ...served, projet: project(served.depot) })),
    bugsEchappes: figures.bugsEchappes?.map((bug) => ({ ...bug, projet: project(bug.depot) })) ?? null,
    reverts: figures.reverts?.map((revert) => ({ ...revert, projet: project(revert.depot) })) ?? null,
    defautsNonLus: figures.defautsNonLus.map(({ depot: repository, raison: reason }) => ({ projet: project(repository), raison: reason })),
  };
}

// Ce que la vue reçoit : les chiffres, les projets qui n'ont pas pu se lire, et ceux dont la période n'est lue qu'en
// partie — ou, aucun lu, pourquoi.
export type ReadOfAutonomy = { jours: number; chiffres: FiguresRead; manquants: { projet: string; raison: string }[]; partiels: { projet: string; depuis: string; raison: string }[] } | { jours: number; sans: string; detail: string };
// Les mots de la vue (lexicon.js, `NON_ATTEINT`).
export const WITHOUT_READ = "Autonomy figures not reached.";

// Les issues déjà lues d'un dépôt, par ticket, avec l'instant de merge pour lequel on les a lues : un ticket servi ne se
// relit pas.
export type IssuesRead = Map<number, { livre: string; evenements: unknown[]; commentaires: unknown[] }>;

// Les pages de la recherche de commits lues au plus : 1 000 commits qui revertent. Au-delà, la lecture le dit.
const PAGES_OF_REVERTS_AT_MOST = 10;
const PAR_PAGE = 100;
const object = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// Ce que GitHub tient des défauts échappés d'un dépôt depuis `depuis` (ticket 3515). Une lecture qui échoue ne fait pas tomber
// les autres chiffres : elle rend pourquoi, et la vue n'affiche aucun des deux nombres à sa place. Un commit reverté que
// GitHub ne connaît pas (422 ou 404 sur ses PR) n'est tenu par aucune PR : il n'est d'aucun ticket.
async function readTheDefaults(read: (path: string) => Promise<unknown>, call: CallGitHub, repository: string, since: number): Promise<Defauts | { illisible: string }> {
  try {
    const date = new Date(since).toISOString();
    const bugs = await allThePages(read, `/repos/${repository}/issues?state=all&labels=${LABEL_BUG}&since=${date}`);
    const reverts: unknown[] = [];
    const request = encodeURIComponent(`repo:${repository} "This reverts commit" committer-date:>=${date.slice(0, 10)}`);
    for (let page = 1; ; page++) {
      const readEntry = object(await read(`/search/commits?q=${request}&per_page=${PAR_PAGE}&page=${page}`));
      if (readEntry?.incomplete_results === true) throw new Error("GitHub's commit search gave incomplete results");
      const items = readEntry?.items;
      if (!Array.isArray(items)) throw new Error("GitHub's commit search gave no list");
      reverts.push(...items);
      if (items.length < PAR_PAGE) break;
      if (page === PAGES_OF_REVERTS_AT_MOST) throw new Error(`more than ${PAGES_OF_REVERTS_AT_MOST * PAR_PAGE} reverting commits in the period`);
    }
    const ticketsOfCommits: Record<string, number[]> = {};
    for (const reverted of new Set(reverts.flatMap((commit) => commitsRevertes(text(object(object(commit)?.commit)?.message))))) {
      const path = `/repos/${repository}/commits/${reverted}/pulls`;
      const answer = await call(path);
      if (answer.status === 404 || answer.status === 422) {
        ticketsOfCommits[reverted] = [];
        continue;
      }
      if (!(answer.status === 200 && Array.isArray(answer.data))) throw new Error(`GitHub answered HTTP ${answer.status} on ${path}`);
      ticketsOfCommits[reverted] = answer.data.flatMap((raw: unknown) => {
        const pr = object(raw);
        const ticket = pr === null || text(pr.merged_at) === "" ? null : ticketDeLaPR(text(object(pr.head)?.ref), text(pr.body));
        return ticket === null ? [] : [ticket];
      });
    }
    return { bugs, reverts, ticketsDesCommits: ticketsOfCommits };
  } catch (error) {
    return { illisible: error instanceof Error ? error.message : String(error) };
  }
}

// Ce que GitHub tient d'un dépôt pour ses chiffres, sur la plus longue période offerte. Une lecture que GitHub arrête (quota,
// erreur) rend ce qu'elle a lu, et `partiel` dit depuis quand : les tickets servis plus tôt que le premier non lu sont laissés
// de côté, jamais comptés sans leur issue. Rien de lu : la lecture lève.
export async function readTheAutonomyOfRepository(options: { depot: string; appeler: CallGitHub; maintenant: Date; lues?: IssuesRead }): Promise<DataRead> {
  const { depot: repository, appeler: call, maintenant: now, lues: readEntries = new Map() } = options;
  const read = async (path: string) => {
    const answer = await call(path);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status} on ${path}`);
    return answer.data;
  };
  const end = now.getTime();
  const readOnes = await readTheServedOnTheWindow(read, repository, end, Math.max(...PERIODES) * DAY_MS, PAGES_OF_PR_AT_MOST);
  const defaults = await readTheDefaults(read, call, repository, end - Math.max(...PERIODES) * DAY_MS);
  // Un ticket sorti de la période n'est plus à garder.
  const inThePeriod = new Set(readOnes.servis.map(({ ticket }) => ticket));
  for (const ticket of readEntries.keys()) if (!inThePeriod.has(ticket)) readEntries.delete(ticket);
  const aRead = readOnes.servis.filter(({ ticket, livre: delivers }) => readEntries.get(ticket)?.livre !== delivers);
  let outage: Error | null = null;
  const readers = Array.from({ length: Math.min(EN_PARALLEL, aRead.length) }, async () => {
    for (let served = aRead.shift(); served !== undefined && outage === null; served = aRead.shift()) {
      try {
        const [events, comments] = await Promise.all([allThePages(read, `/repos/${repository}/issues/${served.ticket}/events`), allThePages(read, `/repos/${repository}/issues/${served.ticket}/comments`)]);
        readEntries.set(served.ticket, { livre: served.livre, evenements: events, commentaires: comments });
      } catch (error) {
        outage ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  });
  await Promise.all(readers);
  const readable = readOnes.servis.filter(({ ticket, livre: delivers }) => readEntries.get(ticket)?.livre === delivers);
  let coveredSince = readOnes.couvertDepuis;
  let reason = readOnes.raison;
  if (readable.length < readOnes.servis.length) {
    // Les servis sont du plus récent au plus ancien : le premier non lu borne ce qui l'est entièrement.
    const firstNotRead = readOnes.servis.find(({ ticket, livre: delivers }) => readEntries.get(ticket)?.livre !== delivers)!;
    const bound = Date.parse(firstNotRead.livre);
    if (readable.every(({ livre: delivers }) => Date.parse(delivers) <= bound)) throw outage ?? new Error("no ticket could be read");
    coveredSince = Math.max(coveredSince ?? bound, bound);
    reason = (outage as Error | null)?.message ?? reason ?? "a ticket could not be read";
  }
  const guards = coveredSince === null ? readable : readable.filter(({ livre: delivers }) => Date.parse(delivers) > coveredSince);
  const issues: Record<number, { evenements: unknown[]; commentaires: unknown[] }> = {};
  for (const { ticket } of guards) issues[ticket] = readEntries.get(ticket)!;
  return {
    depot: repository,
    servis: guards.map(({ ticket, titre: title, url, livre: delivers }) => ({ ticket, titre: title, url, livre: delivers })),
    issues,
    defauts: defaults,
    partiel: coveredSince === null ? null : { depuis: new Date(coveredSince).toISOString(), raison: reason ?? "the period was not read whole" },
  };
}

// Les chiffres d'un ou de plusieurs projets, chaque dépôt lu au plus une fois par `fraicheurMs` ; deux demandes du même
// dépôt pendant sa lecture attendent la même. Les issues déjà lues d'un dépôt se gardent au-delà (`lues`) : une
// relecture ne dépense que les PR et les tickets servis depuis. Une lecture partielle ne se garde pas : la suivante la refait.
export function holdTheAutonomy(options: { lire: (repository: string, readEntries: IssuesRead) => Promise<DataRead>; fraicheurMs: number; maintenant?: () => Date }) {
  const { lire: read, fraicheurMs: freshnessMs, maintenant: now = () => new Date() } = options;
  const readOnes = new Map<string, { le: number; donnees: Promise<DataRead> }>();
  const issuesRead = new Map<string, IssuesRead>();
  const ofRepository = (repository: string) => {
    const guard = readOnes.get(repository);
    if (guard !== undefined && now().getTime() - guard.le < freshnessMs) return guard.donnees;
    if (!issuesRead.has(repository)) issuesRead.set(repository, new Map());
    const data = read(repository, issuesRead.get(repository)!);
    readOnes.set(repository, { le: now().getTime(), donnees: data });
    // Une lecture qui échoue, qui n'est que partielle, ou dont les défauts ne se lisent pas, ne se garde pas : la prochaine
    // demande la refait.
    data.then(({ partiel: partialOne, defauts: defaults }) => (partialOne !== null || (defaults !== undefined && "illisible" in defaults)) && readOnes.get(repository)?.donnees === data && readOnes.delete(repository), () => readOnes.get(repository)?.donnees === data && readOnes.delete(repository));
    return data;
  };
  return {
    async chiffres(projects: readonly { nom: string; depot: string }[], days: number): Promise<ReadOfAutonomy> {
      if (!PERIODES.includes(days)) return { jours: days, sans: WITHOUT_READ, detail: `no such period: ${days} days` };
      const readEntries = await Promise.all(projects.map(async ({ nom: name, depot: repository }) => ({ nom: name, lu: await ofRepository(repository).then((data) => ({ donnees: data }), (error: unknown) => ({ raison: error instanceof Error ? error.message : String(error) })) })));
      const missing = readEntries.flatMap(({ nom: name, lu: readOne }) => ("raison" in readOne ? [{ projet: name, raison: readOne.raison }] : []));
      const data = readEntries.flatMap(({ lu: readOne }) => ("donnees" in readOne ? [readOne.donnees] : []));
      if (data.length === 0) return { jours: days, sans: WITHOUT_READ, detail: missing.length === 0 ? "no project to read" : missing.map(({ projet: project, raison: reason }) => `${project}: ${reason}`).join("\n") };
      const nameOfRepository = new Map(projects.map(({ nom: name, depot: repository }) => [repository, name]));
      const nowRead = now();
      const figures = chiffresDAutonomie(data, days, nowRead);
      // Une période n'est « partielle » que si ce qui n'a pas été lu en fait partie.
      const start = nowRead.getTime() - days * DAY_MS;
      const partial = data.flatMap(({ depot: repository, partiel: partialOne }) => (partialOne !== null && Date.parse(partialOne.depuis) > start ? [{ projet: nameOfRepository.get(repository) ?? repository, ...partialOne }] : []));
      return { jours: days, chiffres: nameTheProjects(figures, (repository) => nameOfRepository.get(repository) ?? repository), manquants: missing, partiels: partial };
    },
  };
}
