// Les chiffres d'autonomie d'un projet, ou de tous (ticket 3222, épique 3213) : servi sans humain, délai, taux de renvoi,
// sur les 7 ou les 30 derniers jours. Tout se lit de GitHub, rien de ce poste — un ordinateur neuf montre les mêmes :
//   - les PR fermées de son dépôt, page après page jusqu'à la plus longue période (vue/rail/github.ts, `lireLesServis`) ;
//   - pour chaque ticket servi, les événements et les commentaires de son issue, toutes pages.
// Le calcul est celui du runtime (runtime/src/autonomie/chiffres/chiffres.ts) : ce module lit, puis le lui remet.
//
// Une lecture coûte deux appels par ticket servi sur 30 jours : chaque dépôt lu se garde le temps de `fraicheurMs`, et
// sert aux deux périodes, au projet comme à tous les projets. Un dépôt qui ne se lit pas est nommé, avec sa raison ;
// aucun ne se lit : la lecture le dit, sans chiffre.
import { chiffresDAutonomie, PERIODES, type ChiffresDAutonomie, type DonneesDuDepot } from "../../../../runtime/src/autonomie/chiffres/chiffres.ts";
import type { AppelGitHub } from "../../tableau/client.ts";
import { lireLesServis, toutesLesPages } from "../rail/github.ts";

const JOUR_MS = 24 * 3600 * 1000;
// Les lectures d'issues en vol à la fois, par dépôt.
const EN_PARALLELE = 6;

// Un ticket servi avec un humain, nommé avec son projet.
export type ServiAvecHumain = ChiffresDAutonomie["avecHumain"][number] & { projet: string };
// Ce que la vue reçoit : les chiffres et les projets qui n'ont pas pu se lire — ou, aucun lu, pourquoi.
export type LectureDAutonomie = { jours: number; chiffres: Omit<ChiffresDAutonomie, "avecHumain"> & { avecHumain: ServiAvecHumain[] }; manquants: { projet: string; raison: string }[] } | { jours: number; sans: string; detail: string };
// Les mots de la vue (lexique.js, `NON_ATTEINT`).
export const SANS_LECTURE = "Autonomy figures not reached.";

// Ce que GitHub tient d'un dépôt pour ses chiffres, sur la plus longue période offerte.
export async function lireLAutonomieDuDepot(options: { depot: string; appeler: AppelGitHub; maintenant: Date }): Promise<DonneesDuDepot> {
  const { depot, appeler, maintenant } = options;
  const lire = async (chemin: string) => {
    const reponse = await appeler(chemin);
    if (reponse.status !== 200) throw new Error(`GitHub answered HTTP ${reponse.status} on ${chemin}`);
    return reponse.data;
  };
  const servis = await lireLesServis(lire, depot, maintenant.getTime(), Math.max(...PERIODES) * JOUR_MS);
  const issues: Record<number, { evenements: unknown[]; commentaires: unknown[] }> = {};
  const aLire = servis.map(({ ticket }) => ticket);
  const lecteurs = Array.from({ length: Math.min(EN_PARALLELE, aLire.length) }, async () => {
    for (let ticket = aLire.shift(); ticket !== undefined; ticket = aLire.shift()) {
      const [evenements, commentaires] = await Promise.all([toutesLesPages(lire, `/repos/${depot}/issues/${ticket}/events`), toutesLesPages(lire, `/repos/${depot}/issues/${ticket}/comments`)]);
      issues[ticket] = { evenements, commentaires };
    }
  });
  await Promise.all(lecteurs);
  return { depot, servis: servis.map(({ ticket, titre, url, livre }) => ({ ticket, titre, url, livre })), issues };
}

// Les chiffres d'un ou de plusieurs projets, chaque dépôt lu au plus une fois par `fraicheurMs` ; deux demandes du même
// dépôt pendant sa lecture attendent la même.
export function tenirLAutonomie(options: { lire: (depot: string) => Promise<DonneesDuDepot>; fraicheurMs: number; maintenant?: () => Date }) {
  const { lire, fraicheurMs, maintenant = () => new Date() } = options;
  const lus = new Map<string, { le: number; donnees: Promise<DonneesDuDepot> }>();
  const duDepot = (depot: string) => {
    const garde = lus.get(depot);
    if (garde !== undefined && maintenant().getTime() - garde.le < fraicheurMs) return garde.donnees;
    const donnees = lire(depot);
    lus.set(depot, { le: maintenant().getTime(), donnees });
    // Une lecture qui échoue ne se garde pas : la prochaine demande la refait.
    donnees.catch(() => lus.get(depot)?.donnees === donnees && lus.delete(depot));
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
      const chiffres = chiffresDAutonomie(donnees, jours, maintenant());
      return { jours, chiffres: { ...chiffres, avecHumain: chiffres.avecHumain.map((servi) => ({ ...servi, projet: nomDuDepot.get(servi.depot) ?? servi.depot })) }, manquants };
    },
  };
}
