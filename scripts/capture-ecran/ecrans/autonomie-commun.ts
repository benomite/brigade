// Les chiffres d'autonomie (#3222), sur des données de GitHub figées : les PR mergées de « parade » et de « cantine » et,
// pour chaque ticket, les événements et les commentaires de son issue, comme l'API REST les rend. Les chiffres sont ceux
// du calcul du runtime (runtime/src/autonomie/chiffres/chiffres.ts) sur ces données, sur les 7 derniers jours.
import { chiffresDAutonomie, type Defauts, type DonneesDuDepot } from "../../../runtime/src/autonomie/chiffres/chiffres.ts";
import { nameTheProjects, type ReadOfAutonomy } from "../../../app/src/vue/autonomy/autonomy-github.ts";
import { MAINTENANT } from "./commun.ts";

const HEURE = 3600 * 1000;
const il = (heures: number) => new Date(Date.parse(MAINTENANT) - heures * HEURE).toISOString();
const pose = (label: string, heures: number) => ({ event: "labeled", label: { name: label }, created_at: il(heures) });
const dit = (body: string, heures: number) => ({ body, created_at: il(heures), author_association: "OWNER" });
const renvoi = (heures: number) => dit("<!-- brigade:renvoi n=1 sha=a1b2c3 -->\nStation `box`: sent back to a cook (1/2) — the CI is red on tests", heures);

// Les défauts échappés d'un dépôt (#3515), comme GitHub les rend : ses issues `bug`, ses commits qui revertent, et les
// tickets des commits revertés.
const SANS_DEFAUT: Defauts = { bugs: [], reverts: [], ticketsDesCommits: {} };

// Un ticket : servi `il` heures avant, après `duree` heures depuis `fire`, avec ce qui s'est passé entre.
type Ticket = { n: number; titre: string; servi: number; duree: number; evenements?: object[]; commentaires?: object[] };
const depot = (nom: string, tickets: Ticket[], defauts = SANS_DEFAUT): DonneesDuDepot => ({
  depot: nom,
  defauts,
  servis: tickets.map(({ n, titre, servi }) => ({ ticket: n, titre, url: `https://github.com/${nom}/issues/${n}`, livre: il(servi) })),
  issues: Object.fromEntries(tickets.map(({ n, servi, duree, evenements = [], commentaires = [] }) => [n, { evenements: [pose("fire", servi + duree), ...evenements], commentaires }])),
});

const PARADE = depot("chef/parade", [
  { n: 31, titre: "Badge colours on the tile", servi: 3, duree: 2.5 },
  { n: 30, titre: "Faster rail reading", servi: 20, duree: 4.2, commentaires: [renvoi(21)] },
  {
    n: 28,
    titre: "Keep or drop the old route",
    servi: 30,
    duree: 26,
    evenements: [pose("chef-todo", 50)],
    commentaires: [dit("<!-- brigade:todo kind=product-question -->\nKeep the old `/rail` route for bookmarks, or drop it?", 50)],
  },
  { n: 27, titre: "Empty state of the log", servi: 52, duree: 1.4 },
  { n: 26, titre: "Retry the GitHub read once", servi: 70, duree: 3.1, commentaires: [renvoi(71), renvoi(70.5)] },
  { n: 25, titre: "Settings section order", servi: 96, duree: 2.2 },
], {
  bugs: [{ number: 33, title: "Badge colours lost on reload", body: "Since #31 the tile badge is grey after a reload.", created_at: il(1), labels: [{ name: "bug" }], html_url: "https://github.com/chef/parade/issues/33" }],
  reverts: [{ sha: "4f2c9e1a7b3d5f60817293a4b5c6d7e8f9012345", commit: { message: 'Revert "feat(#30): faster rail reading"\n\nThis reverts commit 9a8b7c6d5e4f30211234567890abcdef12345678.', committer: { date: il(5) } } }],
  ticketsDesCommits: { "9a8b7c6d5e4f30211234567890abcdef12345678": [30] },
});
const CANTINE = depot("chef/cantine", [
  { n: 6, titre: "Menu of the week", servi: 10, duree: 5.5 },
  {
    n: 5,
    titre: "Delivery fee wording",
    servi: 40,
    duree: 30,
    evenements: [pose("chef-todo", 55)],
    commentaires: [dit("<!-- brigade:todo kind=product-question -->\nShould the delivery fee be shown before or after the basket total?", 55)],
  },
  { n: 4, titre: "Opening hours", servi: 120, duree: 2 },
]);

const lecture = (donnees: DonneesDuDepot[], projets: Record<string, string>, partiels: { projet: string; depuis: string; raison: string }[] = []): ReadOfAutonomy => {
  const chiffres = chiffresDAutonomie(donnees, 7, new Date(MAINTENANT));
  return { jours: 7, chiffres: nameTheProjects(chiffres, (depot) => projets[depot] ?? depot), manquants: [], partiels };
};
export const DE_TOUS = lecture([PARADE, CANTINE], { "chef/parade": "parade", "chef/cantine": "cantine" });
export const DE_PARADE = lecture([PARADE], { "chef/parade": "parade" });
// La même lecture, GitHub ayant refusé une page de PR (#3379) : « parade » n'est compté que depuis quatre jours.
export const DE_PARADE_PARTIEL = lecture([PARADE], { "chef/parade": "parade" }, [{ projet: "parade", depuis: il(96), raison: "GitHub answered HTTP 403 on /repos/chef/parade/pulls?state=closed&page=8" }]);
