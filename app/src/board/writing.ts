// Ce que le compte GitHub de l'app peut faire du dépôt d'un projet (#3163) : y écrire, ou seulement le lire. La vue ouvre
// un projet où il ne peut pas écrire en lecture seule (board/read.ts, `lectureSeule`), et le second le sait à son
// ouverture (second/file.ts). Une seule lecture, `GET /repos/<depot>`, la même que celle de la branche de la base
// (scripts/autonomy-page/served-github.ts) : par la mémoire des lectures, sa relecture est un 304, qui ne coûte rien.
import type { CallGitHub } from "./client.ts";

const object = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

// `permissions.push` du dépôt : vrai, le compte y écrit ; faux, il ne fait que le lire. Nul quand GitHub ne le dit pas —
// une réponse sans `permissions` (lue sans jeton), un refus, rien qui réponde : rien n'est alors décidé à sa place.
export async function writingOnTheRepository(repository: string, call: CallGitHub): Promise<boolean | null> {
  const answer = await call(`/repos/${repository}`).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const push = object(object(answer.data)?.permissions)?.push;
  return typeof push === "boolean" ? push : null;
}
