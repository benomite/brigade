// La cuisine que la visite montre (#4087, épique #4086 ; vue/visit/) : celle de Brigade elle-même, benomite/brigade, lue
// sur GitHub par la lecture même du rail d'un projet (tableau/read.ts, puis ce qui attend un humain,
// tableau/wait-du-chef.ts) — des lectures seules. Rien n'est cloné, aucun projet n'entre dans le fichier des projets,
// rien n'est écrit dans ~/Brigade. Ce qui se lit est rangé comme le rail d'un projet (facts.ts) ; ce qui ne se lit pas
// rend sa raison, en une phrase, que la vue met au survol.
import { mettreAPart } from "./awaiting.ts";
import { COMMAND, holdFacts, type Tableau } from "./facts.ts";
import type { ReadDuTableauDuRepository } from "./tableau/read.ts";
import { readDuTableau } from "./tableau/rail.ts";

// La seule cuisine qui se visite, et le nom sous lequel ses faits se rangent.
export const REPOSITORY_DE_LA_VISIT = "benomite/brigade";
const PROJECT_DE_LA_VISIT = "brigade";

export type KitchenVisitee = { tableau: Tableau } | { sans: string };

// `lire` : la lecture du rail du dépôt sur GitHub (main.ts). Ne lève pas : un échec est une raison.
export async function lireLaKitchenVisitee(repository: unknown, lire: (repository: string) => Promise<ReadDuTableauDuRepository>): Promise<KitchenVisitee> {
  if (repository !== REPOSITORY_DE_LA_VISIT) return { sans: `Only ${REPOSITORY_DE_LA_VISIT} can be visited.` };
  let lu: ReadDuTableauDuRepository;
  try {
    lu = await lire(repository);
  } catch (error) {
    return { sans: `The rail of ${repository} was not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!lu.lu) return { sans: lu.raison };
  const montree = mettreAPart(readDuTableau(lu, PROJECT_DE_LA_VISIT, 0, [COMMAND, "status"]));
  const facts = holdFacts();
  const recue = facts.recevoir(montree);
  const dessinable = facts.attendre(montree) ?? recue;
  return "tableau" in dessinable ? { tableau: dessinable.tableau } : { sans: dessinable.titre };
}
