// L'ordre de prise et le bail des prises, quand GitHub est le seul état de la
// cuisine (épique #2209, ticket #2215).
//
// - Les tickets ouverts se lisent page après page, jusqu'à la page qui n'est
//   pas pleine : un `prio:0` en page 2 n'est pas perdu.
// - Ils se servent par `prio:` croissant (`prio:0` d'abord, sans `prio:` en
//   dernier), puis par numéro : le plus ancien d'abord.
// - Une prise dont la station n'a donné aucun signe de vie depuis plus que le
//   bail est lâchée : le ticket redevient prenable par une autre station.
import { PRIS, corpsDeLacher, lireTenant, type GitHubDeLaPrise } from "../../github-etat/prise.ts";
import type { Issue } from "../../github.ts";

// Combien de temps une station peut se taire avant que sa prise soit lâchée.
export const BAIL_MS = 30 * 60 * 1000;

// La taille d'une page d'issues chez GitHub.
export const PAR_PAGE = 100;

export type Ticket = Pick<Issue, "number" | "labels">;

// Lit toutes les pages : `page(n)` rend la page `n` (à partir de 1) ; une page
// qui n'est pas pleine est la dernière.
export async function lireToutesLesPages<T>(page: (numero: number) => Promise<T[]>, parPage = PAR_PAGE): Promise<T[]> {
  const tout: T[] = [];
  for (let numero = 1; ; numero++) {
    const lue = await page(numero);
    tout.push(...lue);
    if (lue.length < parPage) return tout;
  }
}

// Le rang d'un ticket : le plus petit `prio:N` qu'il porte, l'infini sans.
export const rangDePriorite = (ticket: Pick<Ticket, "labels">): number => {
  const rangs = ticket.labels.flatMap((label) => {
    const n = /^prio:(\d+)$/.exec(label)?.[1];
    return n === undefined ? [] : [Number(n)];
  });
  return rangs.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...rangs);
};

// Les tickets dans l'ordre où on les prend, sans toucher à la liste reçue.
export const dansLOrdreDePrise = <T extends Ticket>(tickets: T[]): T[] => [...tickets].sort((x, y) => (rangDePriorite(x) === rangDePriorite(y) ? x.number - y.number : rangDePriorite(x) < rangDePriorite(y) ? -1 : 1));

export type ContexteDuBail = {
  github: GitHubDeLaPrise;
  // L'instant présent, en ms.
  maintenant: number;
  // Le dernier signe de vie d'une station, en ms ; nul si on n'en connaît pas.
  signeDeVie(station: string): Promise<number | null>;
  bailMs?: number;
};

// Lâche les prises des stations silencieuses parmi les tickets `taken` : un
// commentaire de lâcher au nom de la station, puis le retrait de `taken`. Le
// silence se compte depuis le plus récent de sa prise et de son dernier signe
// de vie. Rend les numéros des tickets relâchés.
export async function relacherLesPrisesSilencieuses(tickets: Ticket[], { github, maintenant, signeDeVie, bailMs = BAIL_MS }: ContexteDuBail): Promise<number[]> {
  const relaches: number[] = [];
  for (const ticket of tickets) {
    if (!ticket.labels.includes(PRIS)) continue;
    const tient = await lireTenant(ticket.number, github);
    if (tient === null) continue;
    const vie = (await signeDeVie(tient.station)) ?? Number.NEGATIVE_INFINITY;
    const depuis = Math.max(Date.parse(tient.createdAt), vie);
    if (maintenant - depuis <= bailMs) continue;
    await github.commenter(ticket.number, corpsDeLacher(tient.station));
    await github.delabelliser(ticket.number, PRIS);
    relaches.push(ticket.number);
  }
  return relaches;
}
