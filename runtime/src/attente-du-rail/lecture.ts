// Les issues `fire` d'un dépôt, lues sur GitHub page par page, et l'instant où
// `fire` a été posé sur une issue : la file du rail que `brigade <project> status`
// (`status.ts`) et le rail de l'app (vue/rail/github.ts) lisent (#3433).
//
// `lire` rend la réponse de GitHub à un chemin, ou lève : une lecture qui
// échoue fait échouer le tout, jamais une file dite calme à sa place.
const LABEL_FIRE = "fire";
const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const listeDe = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);
const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

export type Lire = (chemin: string) => Promise<unknown>;

// Le chemin des issues `fire`, page par page — celui que l'app lit déjà (vue/rail/github.ts) : une relecture
// conditionnelle ne coûte rien.
const cheminDesFeux = (depot: string, page: number) => `/repos/${depot}/issues?state=open&labels=${LABEL_FIRE}&sort=created&direction=asc&per_page=${PAR_PAGE}&page=${page}`;

export async function lesFeux(depot: string, lire: Lire): Promise<Brut[]> {
  const issues: Brut[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const brute = await lire(cheminDesFeux(depot, page));
    if (!Array.isArray(brute)) throw new Error("GitHub did not answer the list of `fire` issues with a list");
    const lues = listeDe(brute);
    issues.push(...lues);
    if (brute.length < PAR_PAGE) break;
  }
  return issues;
}

// L'instant du dernier `fire` posé, d'après les événements de l'issue ; null s'ils ne le disent pas.
export function feuPoseLe(evenements: readonly Brut[]): string | null {
  const poses = evenements.filter((evenement) => evenement.event === "labeled" && objet(evenement.label)?.name === LABEL_FIRE).map((evenement) => texte(evenement.created_at));
  return poses.filter((instant) => !Number.isNaN(Date.parse(instant))).at(-1) ?? null;
}
