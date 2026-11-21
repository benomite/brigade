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
import type { AppelGitHub } from "../../tableau/client.ts";
import { ticketDeLaPR } from "../../tableau/rail-github.ts";
import { lireLesServisSurLaFenetre, toutesLesPages } from "../rail/github.ts";

const JOUR_MS = 24 * 3600 * 1000;
// Les lectures d'issues en vol à la fois, par dépôt.
const EN_PARALLELE = 6;
// Les pages de PR fermées lues au plus : 10 000 PR. Au-delà, la lecture s'arrête et le dit.
const PAGES_DE_PR_AU_PLUS = 100;

// Un ticket servi avec un humain, nommé avec son projet.
export type ServiAvecHumain = ChiffresDAutonomie["avecHumain"][number] & { projet: string };
// Un dépôt lu en partie : ses tickets ne sont lus que depuis cet instant, et pourquoi la lecture s'est arrêtée.
export type Partiel = { depuis: string; raison: string };
// Ce que GitHub tient d'un dépôt, et jusqu'où on l'a lu : `partiel` est null quand la plus longue période est entière.
export type DonneesLues = DonneesDuDepot & { partiel: Partiel | null };
// Un défaut échappé, nommé avec son projet.
export type BugEchappe = NonNullable<ChiffresDAutonomie["bugsEchappes"]>[number] & { projet: string };
export type Revert = NonNullable<ChiffresDAutonomie["reverts"]>[number] & { projet: string };
type ChiffresLus = Omit<ChiffresDAutonomie, "avecHumain" | "bugsEchappes" | "reverts" | "defautsNonLus"> & { avecHumain: ServiAvecHumain[]; bugsEchappes: BugEchappe[] | null; reverts: Revert[] | null; defautsNonLus: { projet: string; raison: string }[] };
// Les chiffres, chaque ticket et chaque défaut nommés avec le projet de son dépôt.
export function nommerLesProjets(chiffres: ChiffresDAutonomie, projet: (depot: string) => string): ChiffresLus {
  return {
    ...chiffres,
    avecHumain: chiffres.avecHumain.map((servi) => ({ ...servi, projet: projet(servi.depot) })),
    bugsEchappes: chiffres.bugsEchappes?.map((bug) => ({ ...bug, projet: projet(bug.depot) })) ?? null,
    reverts: chiffres.reverts?.map((revert) => ({ ...revert, projet: projet(revert.depot) })) ?? null,
    defautsNonLus: chiffres.defautsNonLus.map(({ depot, raison }) => ({ projet: projet(depot), raison })),
  };
}

// Ce que la vue reçoit : les chiffres, les projets qui n'ont pas pu se lire, et ceux dont la période n'est lue qu'en
// partie — ou, aucun lu, pourquoi.
export type LectureDAutonomie = { jours: number; chiffres: ChiffresLus; manquants: { projet: string; raison: string }[]; partiels: { projet: string; depuis: string; raison: string }[] } | { jours: number; sans: string; detail: string };
// Les mots de la vue (lexique.js, `NON_ATTEINT`).
export const SANS_LECTURE = "Autonomy figures not reached.";

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
async function lireLesDefauts(lire: (chemin: string) => Promise<unknown>, appeler: AppelGitHub, depot: string, depuis: number): Promise<Defauts | { illisible: string }> {
  try {
    const date = new Date(depuis).toISOString();
    const bugs = await toutesLesPages(lire, `/repos/${depot}/issues?state=all&labels=${LABEL_BUG}&since=${date}`);
    const reverts: unknown[] = [];
    const requete = encodeURIComponent(`repo:${depot} "This reverts commit" committer-date:>=${date.slice(0, 10)}`);
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
      const chemin = `/repos/${depot}/commits/${reverte}/pulls`;
      const reponse = await appeler(chemin);
      if (reponse.status === 404 || reponse.status === 422) {
        ticketsDesCommits[reverte] = [];
        continue;
      }
      if (reponse.status !== 200 || !Array.isArray(reponse.data)) throw new Error(`GitHub answered HTTP ${reponse.status} on ${chemin}`);
      ticketsDesCommits[reverte] = reponse.data.flatMap((brute: unknown) => {
        const pr = objet(brute);
        const ticket = pr === null || texte(pr.merged_at) === "" ? null : ticketDeLaPR(texte(objet(pr.head)?.ref), texte(pr.body));
        return ticket === null ? [] : [ticket];
      });
    }
    return { bugs, reverts, ticketsDesCommits };
  } catch (erreur) {
    return { illisible: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

// Ce que GitHub tient d'un dépôt pour ses chiffres, sur la plus longue période offerte. Une lecture que GitHub arrête (quota,
// erreur) rend ce qu'elle a lu, et `partiel` dit depuis quand : les tickets servis plus tôt que le premier non lu sont laissés
// de côté, jamais comptés sans leur issue. Rien de lu : la lecture lève.
export async function lireLAutonomieDuDepot(options: { depot: string; appeler: AppelGitHub; maintenant: Date; lues?: IssuesLues }): Promise<DonneesLues> {
  const { depot, appeler, maintenant, lues = new Map() } = options;
  const lire = async (chemin: string) => {
    const reponse = await appeler(chemin);
    if (reponse.status !== 200) throw new Error(`GitHub answered HTTP ${reponse.status} on ${chemin}`);
    return reponse.data;
  };
  const fin = maintenant.getTime();
  const lus = await lireLesServisSurLaFenetre(lire, depot, fin, Math.max(...PERIODES) * JOUR_MS, PAGES_DE_PR_AU_PLUS);
  const defauts = await lireLesDefauts(lire, appeler, depot, fin - Math.max(...PERIODES) * JOUR_MS);
  // Un ticket sorti de la période n'est plus à garder.
  const dansLaPeriode = new Set(lus.servis.map(({ ticket }) => ticket));
  for (const ticket of lues.keys()) if (!dansLaPeriode.has(ticket)) lues.delete(ticket);
  const aLire = lus.servis.filter(({ ticket, livre }) => lues.get(ticket)?.livre !== livre);
  let panne: Error | null = null;
  const lecteurs = Array.from({ length: Math.min(EN_PARALLELE, aLire.length) }, async () => {
    for (let servi = aLire.shift(); servi !== undefined && panne === null; servi = aLire.shift()) {
      try {
        const [evenements, commentaires] = await Promise.all([toutesLesPages(lire, `/repos/${depot}/issues/${servi.ticket}/events`), toutesLesPages(lire, `/repos/${depot}/issues/${servi.ticket}/comments`)]);
        lues.set(servi.ticket, { livre: servi.livre, evenements, commentaires });
      } catch (erreur) {
        panne ??= erreur instanceof Error ? erreur : new Error(String(erreur));
      }
    }
  });
  await Promise.all(lecteurs);
  const lisibles = lus.servis.filter(({ ticket, livre }) => lues.get(ticket)?.livre === livre);
  let couvertDepuis = lus.couvertDepuis;
  let raison = lus.raison;
  if (lisibles.length < lus.servis.length) {
    // Les servis sont du plus récent au plus ancien : le premier non lu borne ce qui l'est entièrement.
    const premierNonLu = lus.servis.find(({ ticket, livre }) => lues.get(ticket)?.livre !== livre)!;
    const borne = Date.parse(premierNonLu.livre);
    if (lisibles.every(({ livre }) => Date.parse(livre) <= borne)) throw panne ?? new Error("no ticket could be read");
    couvertDepuis = Math.max(couvertDepuis ?? borne, borne);
    raison = (panne as Error | null)?.message ?? raison ?? "a ticket could not be read";
  }
  const gardes = couvertDepuis === null ? lisibles : lisibles.filter(({ livre }) => Date.parse(livre) > couvertDepuis);
  const issues: Record<number, { evenements: unknown[]; commentaires: unknown[] }> = {};
  for (const { ticket } of gardes) issues[ticket] = lues.get(ticket)!;
  return {
    depot,
    servis: gardes.map(({ ticket, titre, url, livre }) => ({ ticket, titre, url, livre })),
    issues,
    defauts,
    partiel: couvertDepuis === null ? null : { depuis: new Date(couvertDepuis).toISOString(), raison: raison ?? "the period was not read whole" },
  };
}

// Les chiffres d'un ou de plusieurs projets, chaque dépôt lu au plus une fois par `fraicheurMs` ; deux demandes du même
// dépôt pendant sa lecture attendent la même. Les issues déjà lues d'un dépôt se gardent au-delà (`lues`) : une
// relecture ne dépense que les PR et les tickets servis depuis. Une lecture partielle ne se garde pas : la suivante la refait.
export function tenirLAutonomie(options: { lire: (depot: string, lues: IssuesLues) => Promise<DonneesLues>; fraicheurMs: number; maintenant?: () => Date }) {
  const { lire, fraicheurMs, maintenant = () => new Date() } = options;
  const lus = new Map<string, { le: number; donnees: Promise<DonneesLues> }>();
  const issuesLues = new Map<string, IssuesLues>();
  const duDepot = (depot: string) => {
    const garde = lus.get(depot);
    if (garde !== undefined && maintenant().getTime() - garde.le < fraicheurMs) return garde.donnees;
    if (!issuesLues.has(depot)) issuesLues.set(depot, new Map());
    const donnees = lire(depot, issuesLues.get(depot)!);
    lus.set(depot, { le: maintenant().getTime(), donnees });
    // Une lecture qui échoue, qui n'est que partielle, ou dont les défauts ne se lisent pas, ne se garde pas : la prochaine
    // demande la refait.
    donnees.then(({ partiel, defauts }) => (partiel !== null || (defauts !== undefined && "illisible" in defauts)) && lus.get(depot)?.donnees === donnees && lus.delete(depot), () => lus.get(depot)?.donnees === donnees && lus.delete(depot));
    return donnees;
  };
  return {
    async chiffres(projets: readonly { nom: string; depot: string }[], jours: number): Promise<LectureDAutonomie> {
      if (!PERIODES.includes(jours)) return { jours, sans: SANS_LECTURE, detail: `no such period: ${jours} days` };
      const lues = await Promise.all(projets.map(async ({ nom, depot }) => ({ nom, lu: await duDepot(depot).then((donnees) => ({ donnees }), (erreur: unknown) => ({ raison: erreur instanceof Error ? erreur.message : String(erreur) })) })));
      const manquants = lues.flatMap(({ nom, lu }) => ("raison" in lu ? [{ projet: nom, raison: lu.raison }] : []));
      const donnees = lues.flatMap(({ lu }) => ("donnees" in lu ? [lu.donnees] : []));
      if (donnees.length === 0) return { jours, sans: SANS_LECTURE, detail: manquants.length === 0 ? "no project to read" : manquants.map(({ projet, raison }) => `${projet}: ${raison}`).join("\n") };
      const nomDuDepot = new Map(projets.map(({ nom, depot }) => [depot, nom]));
      const maintenantLu = maintenant();
      const chiffres = chiffresDAutonomie(donnees, jours, maintenantLu);
      // Une période n'est « partielle » que si ce qui n'a pas été lu en fait partie.
      const debut = maintenantLu.getTime() - jours * JOUR_MS;
      const partiels = donnees.flatMap(({ depot, partiel }) => (partiel !== null && Date.parse(partiel.depuis) > debut ? [{ projet: nomDuDepot.get(depot) ?? depot, ...partiel }] : []));
      return { jours, chiffres: nommerLesProjets(chiffres, (depot) => nomDuDepot.get(depot) ?? depot), manquants, partiels };
    },
  };
}
