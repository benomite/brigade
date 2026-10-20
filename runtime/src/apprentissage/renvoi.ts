// Un renvoi devenu leçon : la raison pour laquelle la pass renvoie un ticket,
// ou pour laquelle le chef le renvoie ou corrige sa livraison, est une preuve
// plus forte que ce qu'un cook dit de lui-même. Elle entre au projet comme une
// leçon candidate (`lesson.candidate`), provisoire, par le même chemin qu'une
// leçon de rétro (`provisoires.ts`), avec son origine — « pass-send-back #N »
// ou « chef-correction #N » — et suit les mêmes règles de promotion et de
// péremption (`peremption/peremption.ts`).
//
// Une leçon s'écrit sur une ligne, comme au carnet : la raison y est mise
// d'une ligne. Ce qui n'est pas une phrase — la fin de la sortie des gates,
// dans son bloc de code — n'en est pas. Une raison vide n'est la raison de rien :
// elle ne fait naître aucune leçon.
import type { Journal } from "../journal.ts";
import type { OrigineDuRenvoi } from "./evenements.ts";
import { LECON_MAX_CARACTERES, LECONS_MAX } from "./retro.ts";

const COUPE = "…";

// Une raison, mise en leçon : sans ses blocs de code — ni la ligne qui les
// annonce (« Fin de sortie : ») —, ses lignes jointes en une, ses blancs
// resserrés. Nulle si rien n'en reste. Au-delà de `LECON_MAX_CARACTERES`, elle
// est coupée au dernier mot qui tient, et le dit (« … ») : c'est la pass qui
// l'écrit, et sa raison ne se réécrit pas.
export function leconDeLaRaison(raison: string): string | null {
  const lignes: string[] = [];
  let dansLeBloc = false;
  for (const ligne of raison.split("\n")) {
    if (ligne.trim().startsWith("```")) {
      dansLeBloc = !dansLeBloc;
      continue;
    }
    if (!dansLeBloc) lignes.push(ligne);
  }
  const texte = lignes
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s*Fin de sortie :\s*$/, "")
    .trim();
  if (texte === "") return null;
  if (texte.length <= LECON_MAX_CARACTERES) return texte;
  const tient = texte.slice(0, LECON_MAX_CARACTERES - COUPE.length);
  const mot = tient.lastIndexOf(" ");
  return `${(mot > 0 ? tient.slice(0, mot) : tient).trimEnd()}${COUPE}`;
}

// Les leçons d'un renvoi : une par raison, dans l'ordre, sans doublon, au plus
// `LECONS_MAX` — ce qu'une rétro peut laisser.
export function leconsDuRenvoi(raisons: readonly string[]): string[] {
  const lecons: string[] = [];
  for (const raison of raisons) {
    const lecon = leconDeLaRaison(raison);
    if (lecon !== null && !lecons.includes(lecon)) lecons.push(lecon);
  }
  return lecons.slice(0, LECONS_MAX);
}

// Écrit au journal les leçons candidates d'un renvoi ou d'une correction du
// ticket : à appeler dans la transaction qui écrit le renvoi. Rend leur nombre
// — zéro pour un renvoi sans raison.
export function noterLeRenvoi(journal: Journal, renvoi: { projet: string; ticket: number; auteur: string; origine: OrigineDuRenvoi; raisons: readonly string[] }): number {
  const { projet, ticket, auteur, origine, raisons } = renvoi;
  const lecons = leconsDuRenvoi(raisons);
  for (const text of lecons) journal.ajouter({ project: projet, ticket, author: auteur, type: "lesson.candidate", payload: { origin: origine, text } });
  return lecons.length;
}
