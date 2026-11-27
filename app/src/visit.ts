// La cuisine que la visite montre (#4087, épique #4086 ; vue/visit/) : celle de Brigade elle-même, benomite/brigade, lue
// sur GitHub par la lecture même du rail d'un projet (board/read.ts, puis ce qui attend un humain,
// board/wait-of-chef.ts) — des lectures seules. Rien n'est cloné, aucun projet n'entre dans le fichier des projets,
// rien n'est écrit dans ~/Brigade. Ce qui se lit est rangé comme le rail d'un projet (facts.ts) ; ce qui ne se lit pas
// rend sa raison, en une phrase, que la vue met au survol.
import { putAPart } from "./awaiting.ts";
import { COMMAND, holdFacts, type Board } from "./facts.ts";
import type { ReadOfBoardOfRepository } from "./board/read.ts";
import { readOfBoard } from "./board/rail.ts";

// La seule cuisine qui se visite, et le nom sous lequel ses faits se rangent.
export const REPOSITORY_OF_THE_VISIT = "benomite/brigade";
const PROJECT_OF_THE_VISIT = "brigade";

export type KitchenVisited = { tableau: Board } | { sans: string };

// `lire` : la lecture du rail du dépôt sur GitHub (main.ts). Ne lève pas : un échec est une raison.
export async function readTheKitchenVisited(repository: unknown, read: (repository: string) => Promise<ReadOfBoardOfRepository>): Promise<KitchenVisited> {
  if (repository !== REPOSITORY_OF_THE_VISIT) return { sans: `Only ${REPOSITORY_OF_THE_VISIT} can be visited.` };
  let readOne: ReadOfBoardOfRepository;
  try {
    readOne = await read(repository);
  } catch (error) {
    return { sans: `The rail of ${repository} was not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!readOne.lu) return { sans: readOne.raison };
  const shownOne = putAPart(readOfBoard(readOne, PROJECT_OF_THE_VISIT, 0, [COMMAND, "status"]));
  const facts = holdFacts();
  const receivedOne = facts.recevoir(shownOne);
  const drawable = facts.attendre(shownOne) ?? receivedOne;
  return "tableau" in drawable ? { tableau: drawable.tableau } : { sans: drawable.titre };
}
