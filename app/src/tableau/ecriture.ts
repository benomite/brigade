// Ce que le compte GitHub de l'app peut faire du dépôt d'un projet (#3163) : y écrire, ou seulement le lire. La vue ouvre
// un projet où il ne peut pas écrire en lecture seule (tableau/read.ts, `lectureSeule`), et le second le sait à son
// ouverture (second/file.ts). Une seule lecture, `GET /repos/<depot>`, la même que celle de la branche de la base
// (vue/rail/github.ts) : par la mémoire des lectures, sa relecture est un 304, qui ne coûte rien.
import type { CallGitHub } from "./client.ts";

const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);

// `permissions.push` du dépôt : vrai, le compte y écrit ; faux, il ne fait que le lire. Nul quand GitHub ne le dit pas —
// une réponse sans `permissions` (lue sans jeton), un refus, rien qui réponde : rien n'est alors décidé à sa place.
export async function ecritureSurLeRepository(repository: string, appeler: CallGitHub): Promise<boolean | null> {
  const answer = await appeler(`/repos/${repository}`).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const push = objet(objet(answer.data)?.permissions)?.push;
  return typeof push === "boolean" ? push : null;
}
