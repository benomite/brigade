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
import type { CallGitHub } from "../../tableau/client.ts";
import { ticketDeLaPR } from "../../tableau/rail-github.ts";
import { lireLesServedSurLaFenetre, toutesLesPages } from "../rail/github.ts";

const DAY_MS = 24 * 3600 * 1000;
// Les lectures d'issues en vol à la fois, par dépôt.
const EN_PARALLELE = 6;
// Les pages de PR fermées lues au plus : 10 000 PR. Au-delà, la lecture s'arrête et le dit.
const PAGES_DE_PR_AU_PLUS = 100;

// Un ticket servi avec un humain, nommé avec son projet.
export type ServedAvecHuman = ChiffresDAutonomie["avecHumain"][number] & { projet: string };
// Un dépôt lu en partie : ses tickets ne sont lus que depuis cet instant, et pourquoi la lecture s'est arrêtée.
export type Partiel = { depuis: string; raison: string };
// Ce que GitHub tient d'un dépôt, et jusqu'où on l'a lu : `partiel` est null quand la plus longue période est entière.
export type DonneesLues = DonneesDuDepot & { partiel: Partiel | null };
// Un défaut échappé, nommé avec son projet.
export type BugEchappe = NonNullable<ChiffresDAutonomie["bugsEchappes"]>[number] & { projet: string };
export type Revert = NonNullable<ChiffresDAutonomie["reverts"]>[number] & { projet: string };
type FiguresLus = Omit<ChiffresDAutonomie, "avecHumain" | "bugsEchappes" | "reverts" | "defautsNonLus"> & { avecHumain: ServedAvecHuman[]; bugsEchappes: BugEchappe[] | null; reverts: Revert[] | null; defautsNonLus: { projet: string; raison: string }[] };
// Les chiffres, chaque ticket et chaque défaut nommés avec le projet de son dépôt.
export function nommerLesProjects(figures: ChiffresDAutonomie, project: (repository: string) => string): FiguresLus {
  return {
    ...figures,
    avecHumain: figures.avecHumain.map((served) => ({ ...served, projet: project(served.depot) })),
    bugsEchappes: figures.bugsEchappes?.map((bug) => ({ ...bug, projet: project(bug.depot) })) ?? null,
    reverts: figures.reverts?.map((revert) => ({ ...revert, projet: project(revert.depot) })) ?? null,
    defautsNonLus: figures.defautsNonLus.map(({ depot: repository, raison }) => ({ projet: project(repository), raison })),
  };
}

// Ce que la vue reçoit : les chiffres, les projets qui n'ont pas pu se lire, et ceux dont la période n'est lue qu'en
// partie — ou, aucun lu, pourquoi.
export type ReadDAutonomy = { jours: number; chiffres: FiguresLus; manquants: { projet: string; raison: string }[]; partiels: { projet: string; depuis: string; raison: string }[] } | { jours: number; sans: string; detail: string };
// Les mots de la vue (lexique.js, `NON_ATTEINT`).
export const SANS_READ = "Autonomy figures not reached.";

// Les issues déjà lues d'un dépôt, par ticket, avec l'instant de merge pour lequel on les a lues : un ticket servi ne se
// relit pas.
export type IssuesLues = Map<number, { livre: string; evenements: unknown[]; commentaires: unknown[] }>;

// Les pages de la recherche de commits lues au plus : 1 000 commits qui revertent. Au-delà, la lecture le dit.
const PAGES_DE_REVERTS_AU_PLUS = 10;
const PAR_PAGE = 100;
const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// Ce que GitHub tient des défauts échappés d'un dépôt depuis `depuis` (ticket 3515). Une lecture qui échoue ne fait pas tomber
// les autres chiffres : elle rend pourquoi, et la vue n'affiche aucun des deux nombres à sa place. Un commit reverté que
// GitHub ne connaît pas (422 ou 404 sur ses PR) n'est tenu par aucune PR : il n'est d'aucun ticket.
async function lireLesDefauts(lire: (chemin: string) => Promise<unknown>, appeler: CallGitHub, repository: string, depuis: number): Promise<Defauts | { illisible: string }> {
  try {
    const date = new Date(depuis).toISOString();
    const bugs = await toutesLesPages(lire, `/repos/${repository}/issues?state=all&labels=${LABEL_BUG}&since=${date}`);
    const reverts: unknown[] = [];
    const requete = encodeURIComponent(`repo:${repository} "This reverts commit" committer-date:>=${date.slice(0, 10)}`);
    for (let page = 1; ; page++) {
      const lue = objet(await lire(`/search/commits?q=${requete}&per_page=${PAR_PAGE}&page=${page}`));
      if (lue?.incomplete_results === true) throw new Error("GitHub's commit search gave incomplete results");
      const items = lue?.items;
      if (!Array.isArray(items)) throw new Error("GitHub's commit search gave no list");
      reverts.push(...items);
      if (items.length < PAR_PAGE) break;
      if (page === PAGES_DE_REVERTS_AU_PLUS) throw new Error(`more than ${PAGES_DE_REVERTS_AU_PLUS * PAR_PAGE} reverting commits in the period`);
    }
    const ticketsDesCommits: Record<string, number[]> = {};
    for (const reverte of new Set(reverts.flatMap((commit) => commitsRevertes(texte(objet(objet(commit)?.commit)?.message))))) {
      const chemin = `/repos/${repository}/commits/${reverte}/pulls`;
      const answer = await appeler(chemin);
      if (answer.status === 404 || answer.status === 422) {
        ticketsDesCommits[reverte] = [];
        continue;
      }
      if (!(answer.status === 200 && Array.isArray(answer.data))) throw new Error(`GitHub answered HTTP ${answer.status} on ${chemin}`);
      ticketsDesCommits[reverte] = answer.data.flatMap((brute: unknown) => {
        const pr = objet(brute);
        const ticket = pr === null || texte(pr.merged_at) === "" ? null : ticketDeLaPR(texte(objet(pr.head)?.ref), texte(pr.body));
        return ticket === null ? [] : [ticket];
      });
    }
    return { bugs, reverts, ticketsDesCommits };
  } catch (error) {
    return { illisible: error instanceof Error ? error.message : String(error) };
  }
}

// Ce que GitHub tient d'un dépôt pour ses chiffres, sur la plus longue période offerte. Une lecture que GitHub arrête (quota,
// erreur) rend ce qu'elle a lu, et `partiel` dit depuis quand : les tickets servis plus tôt que le premier non lu sont laissés
// de côté, jamais comptés sans leur issue. Rien de lu : la lecture lève.
export async function lireLAutonomyDuRepository(options: { depot: string; appeler: CallGitHub; maintenant: Date; lues?: IssuesLues }): Promise<DonneesLues> {
  const { depot: repository, appeler, maintenant, lues = new Map() } = options;
  const lire = async (chemin: string) => {
    const answer = await appeler(chemin);
    if (answer.status !== 200) throw new Error(`GitHub answered HTTP ${answer.status} on ${chemin}`);
    return answer.data;
  };
  const fin = maintenant.getTime();
  const lus = await lireLesServedSurLaFenetre(lire, repository, fin, Math.max(...PERIODES) * DAY_MS, PAGES_DE_PR_AU_PLUS);
  const defauts = await lireLesDefauts(lire, appeler, repository, fin - Math.max(...PERIODES) * DAY_MS);
  // Un ticket sorti de la période n'est plus à garder.
  const dansLaPeriode = new Set(lus.servis.map(({ ticket }) => ticket));
  for (const ticket of lues.keys()) if (!dansLaPeriode.has(ticket)) lues.delete(ticket);
  const aLire = lus.servis.filter(({ ticket, livre }) => lues.get(ticket)?.livre !== livre);
  let outage: Error | null = null;
  const lecteurs = Array.from({ length: Math.min(EN_PARALLELE, aLire.length) }, async () => {
    for (let served = aLire.shift(); served !== undefined && outage === null; served = aLire.shift()) {
      try {
        const [events, commentaires] = await Promise.all([toutesLesPages(lire, `/repos/${repository}/issues/${served.ticket}/events`), toutesLesPages(lire, `/repos/${repository}/issues/${served.ticket}/comments`)]);
        lues.set(served.ticket, { livre: served.livre, evenements: events, commentaires });
      } catch (error) {
        outage ??= error instanceof Error ? error : new Error(String(error));
      }
    }
  });
  await Promise.all(lecteurs);
  const lisibles = lus.servis.filter(({ ticket, livre }) => lues.get(ticket)?.livre === livre);
  let couvertDepuis = lus.couvertDepuis;
  let raison = lus.raison;
  if (lisibles.length < lus.servis.length) {
    // Les servis sont du plus récent au plus ancien : le premier non lu borne ce qui l'est entièrement.
    const firstNonLu = lus.servis.find(({ ticket, livre }) => lues.get(ticket)?.livre !== livre)!;
    const borne = Date.parse(firstNonLu.livre);
    if (lisibles.every(({ livre }) => Date.parse(livre) <= borne)) throw outage ?? new Error("no ticket could be read");
    couvertDepuis = Math.max(couvertDepuis ?? borne, borne);
    raison = (outage as Error | null)?.message ?? raison ?? "a ticket could not be read";
  }
  const gardes = couvertDepuis === null ? lisibles : lisibles.filter(({ livre }) => Date.parse(livre) > couvertDepuis);
  const issues: Record<number, { evenements: unknown[]; commentaires: unknown[] }> = {};
  for (const { ticket } of gardes) issues[ticket] = lues.get(ticket)!;
  return {
    depot: repository,
    servis: gardes.map(({ ticket, titre, url, livre }) => ({ ticket, titre, url, livre })),
    issues,
    defauts,
    partiel: couvertDepuis === null ? null : { depuis: new Date(couvertDepuis).toISOString(), raison: raison ?? "the period was not read whole" },
  };
}

// Les chiffres d'un ou de plusieurs projets, chaque dépôt lu au plus une fois par `fraicheurMs` ; deux demandes du même
// dépôt pendant sa lecture attendent la même. Les issues déjà lues d'un dépôt se gardent au-delà (`lues`) : une
// relecture ne dépense que les PR et les tickets servis depuis. Une lecture partielle ne se garde pas : la suivante la refait.
export function holdLAutonomy(options: { lire: (repository: string, lues: IssuesLues) => Promise<DonneesLues>; fraicheurMs: number; maintenant?: () => Date }) {
  const { lire, fraicheurMs, maintenant = () => new Date() } = options;
  const lus = new Map<string, { le: number; donnees: Promise<DonneesLues> }>();
  const issuesLues = new Map<string, IssuesLues>();
  const duRepository = (repository: string) => {
    const guard = lus.get(repository);
    if (guard !== undefined && maintenant().getTime() - guard.le < fraicheurMs) return guard.donnees;
    if (!issuesLues.has(repository)) issuesLues.set(repository, new Map());
    const donnees = lire(repository, issuesLues.get(repository)!);
    lus.set(repository, { le: maintenant().getTime(), donnees });
    // Une lecture qui échoue, qui n'est que partielle, ou dont les défauts ne se lisent pas, ne se garde pas : la prochaine
    // demande la refait.
    donnees.then(({ partiel, defauts }) => (partiel !== null || (defauts !== undefined && "illisible" in defauts)) && lus.get(repository)?.donnees === donnees && lus.delete(repository), () => lus.get(repository)?.donnees === donnees && lus.delete(repository));
    return donnees;
  };
  return {
    async chiffres(projects: readonly { nom: string; depot: string }[], jours: number): Promise<ReadDAutonomy> {
      if (!PERIODES.includes(jours)) return { jours, sans: SANS_READ, detail: `no such period: ${jours} days` };
      const lues = await Promise.all(projects.map(async ({ nom: name, depot: repository }) => ({ nom: name, lu: await duRepository(repository).then((donnees) => ({ donnees }), (error: unknown) => ({ raison: error instanceof Error ? error.message : String(error) })) })));
      const manquants = lues.flatMap(({ nom: name, lu }) => ("raison" in lu ? [{ projet: name, raison: lu.raison }] : []));
      const donnees = lues.flatMap(({ lu }) => ("donnees" in lu ? [lu.donnees] : []));
      if (donnees.length === 0) return { jours, sans: SANS_READ, detail: manquants.length === 0 ? "no project to read" : manquants.map(({ projet: project, raison }) => `${project}: ${raison}`).join("\n") };
      const nameDuRepository = new Map(projects.map(({ nom: name, depot: repository }) => [repository, name]));
      const maintenantLu = maintenant();
      const figures = chiffresDAutonomie(donnees, jours, maintenantLu);
      // Une période n'est « partielle » que si ce qui n'a pas été lu en fait partie.
      const debut = maintenantLu.getTime() - jours * DAY_MS;
      const partiels = donnees.flatMap(({ depot: repository, partiel }) => (partiel !== null && Date.parse(partiel.depuis) > debut ? [{ projet: nameDuRepository.get(repository) ?? repository, ...partiel }] : []));
      return { jours, chiffres: nommerLesProjects(figures, (repository) => nameDuRepository.get(repository) ?? repository), manquants, partiels };
    },
  };
}
