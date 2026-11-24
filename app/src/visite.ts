// La cuisine que la visite montre (#4087, épique #4086 ; vue/visite/) : celle de Brigade elle-même, benomite/brigade, lue
// sur GitHub par la lecture même du rail d'un projet (tableau/lecture.ts, puis ce qui attend un humain,
// tableau/attente-du-chef.ts) — des lectures seules. Rien n'est cloné, aucun projet n'entre dans le fichier des projets,
// rien n'est écrit dans ~/Brigade. Ce qui se lit est rangé comme le rail d'un projet (faits.ts) ; ce qui ne se lit pas
// rend sa raison, en une phrase, que la vue met au survol.
import { mettreAPart } from "./attend.ts";
import { COMMANDE, tenirFaits, type Tableau } from "./faits.ts";
import type { LectureDuTableauDuDepot } from "./tableau/lecture.ts";
import { lectureDuTableau } from "./tableau/rail.ts";

// La seule cuisine qui se visite, et le nom sous lequel ses faits se rangent.
export const DEPOT_DE_LA_VISITE = "benomite/brigade";
const PROJET_DE_LA_VISITE = "brigade";

export type CuisineVisitee = { tableau: Tableau } | { sans: string };

// `lire` : la lecture du rail du dépôt sur GitHub (main.ts). Ne lève pas : un échec est une raison.
export async function lireLaCuisineVisitee(depot: unknown, lire: (depot: string) => Promise<LectureDuTableauDuDepot>): Promise<CuisineVisitee> {
  if (depot !== DEPOT_DE_LA_VISITE) return { sans: `Only ${DEPOT_DE_LA_VISITE} can be visited.` };
  let lu: LectureDuTableauDuDepot;
  try {
    lu = await lire(depot);
  } catch (erreur) {
    return { sans: `The rail of ${depot} was not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (!lu.lu) return { sans: lu.raison };
  const montree = mettreAPart(lectureDuTableau(lu, PROJET_DE_LA_VISITE, 0, [COMMANDE, "status"]));
  const faits = tenirFaits();
  const recue = faits.recevoir(montree);
  const dessinable = faits.attendre(montree) ?? recue;
  return "tableau" in dessinable ? { tableau: dessinable.tableau } : { sans: dessinable.titre };
}
