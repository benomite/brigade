// La lecture de l'ordre de merge sur GitHub (#4044), pour le rail : les PR ouvertes des tickets en pass, les fichiers que chacune
// change, et l'instant où chaque ticket est entré en pass (`in-pass` posé). La station lit les mêmes choses par son client.
// Une lecture qui échoue ne pose aucun lien par les fichiers sur ce ticket : la carte reste comme avant, jamais un ordre inventé.
import { labelPoseLe, type Lire } from "../attente-du-rail/lecture.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { ordreDeMerge, type Livraison } from "./ordre.ts";

const PAR_PAGE = 100;
const PAGES_AU_PLUS = 10;
type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null);
const liste = (valeur: unknown): Brut[] => (Array.isArray(valeur) ? valeur.flatMap((un: unknown) => { const o = objet(un); return o === null ? [] : [o]; }) : []);

async function toutesLesPages(lire: Lire, chemin: string): Promise<Brut[]> {
  const lues: Brut[] = [];
  for (let page = 1; page <= PAGES_AU_PLUS; page++) {
    const brute = await lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=${PAR_PAGE}&page=${page}`);
    lues.push(...liste(brute));
    if (!Array.isArray(brute) || brute.length < PAR_PAGE) break;
  }
  return lues;
}

// Les tickets en pass, chacun avec les fichiers de sa PR ouverte et son entrée en pass ; ceux dont la PR ne se lit pas n'y sont pas.
export async function livraisonsEnPass(options: { depot: string; lire: Lire; enPass: readonly number[] }): Promise<Livraison[]> {
  const { depot, lire } = options;
  if (options.enPass.length < 2) return [];
  const prs = await toutesLesPages(lire, `/repos/${depot}/pulls?state=open`).catch(() => []);
  const fichiersDe = new Map<number, string[]>();
  for (const pr of prs) {
    const ticket = Number(/^cook\/(\d+)-/.exec(typeof objet(pr.head)?.ref === "string" ? (objet(pr.head)?.ref as string) : "")?.[1]);
    if (!options.enPass.includes(ticket) || typeof pr.number !== "number") continue;
    const fichiers = await toutesLesPages(lire, `/repos/${depot}/pulls/${pr.number}/files`).then((lus) => lus.flatMap(({ filename }) => (typeof filename === "string" ? [filename] : [])), () => null);
    if (fichiers !== null) fichiersDe.set(ticket, fichiers);
  }
  // Les événements ne se lisent que pour les tickets qui ont un fichier en commun avec un autre.
  const recouverts = [...fichiersDe].filter(([ticket, fichiers]) => [...fichiersDe].some(([autre, siens]) => autre !== ticket && fichiers.some((fichier) => siens.includes(fichier))));
  return Promise.all(
    recouverts.map(async ([ticket, fichiers]) => {
      const evenements = await lire(`/repos/${depot}/issues/${ticket}/events?per_page=${PAR_PAGE}`).catch(() => null);
      return { ticket, fichiers, enPassLe: Array.isArray(evenements) ? labelPoseLe(liste(evenements), LABEL_IN_PASS) : null };
    }),
  );
}

// L'ordre de merge des cartes du rail : `declarees`, la dépendance de chaque ticket parmi ceux du rail ; `enPass`, ses tickets en pass.
export async function lireLOrdreDuRail(options: { depot: string; lire: Lire; declarees: ReadonlyMap<number, readonly number[]>; enPass: readonly number[] }): Promise<Map<number, number[]>> {
  return ordreDeMerge({ declarees: options.declarees, livraisons: await livraisonsEnPass(options) });
}
