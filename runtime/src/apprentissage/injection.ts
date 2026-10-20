// Les leçons qu'un cook reçoit à son lancement : les provisoires de son projet,
// et de lui seul, les plus récentes d'abord, au plus `plafond` — un réglage du
// projet, pour que le contexte d'un cook ne grossisse pas sans fin. Une leçon
// est récente par la rétro qui l'a proposée. Celle que le carnet du dépôt
// tient — promue, ou sortie — n'est plus provisoire : elle n'est pas reçue.
//
// Ce qu'il a reçu est au journal, à son lancement (`lessons` de
// `cook.launched`, leurs ids) : une liste vide dit qu'il n'en a reçu aucune.
import type { Base } from "../base.ts";
import { parseCarnet } from "../carnet/carnet.ts";
import { lire } from "../plafonds.ts";
import { leconsProvisoires } from "./provisoires.ts";

export const LECONS_INJECTEES_PAR_DEFAUT = 20;
export const VARIABLE_LECONS_INJECTEES = "BRIGADE_INJECTED_LESSONS";

// Le plafond du projet, lu de l'environnement de son unité comme les seuils
// des leçons (`seuils/seuils.ts`). Zéro : ses cooks n'en reçoivent aucune. Une
// valeur illisible refuse le démarrage en nommant la variable.
export function lirePlafondDesLecons(env: NodeJS.ProcessEnv): number {
  return lire(env, VARIABLE_LECONS_INJECTEES, LECONS_INJECTEES_PAR_DEFAUT, "an integer, zero or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);
}

export type LeconRecue = { id: string; texte: string };

// Les ids que le carnet du dépôt tient. Un carnet illisible n'en retire
// aucune : le cook part tout de même, avec les leçons du journal.
function idsDuCarnet(carnet: string | null): Set<string> {
  if (carnet === null) return new Set();
  try {
    return new Set(parseCarnet(carnet).lessons.map((lecon) => lecon.id));
  } catch {
    return new Set();
  }
}

// Les leçons que reçoit un cook du projet : les `plafond` plus récentes, la
// plus récente d'abord. `carnet` : le texte du carnet à la base, null s'il n'y
// en a pas.
export function leconsAInjecter(base: Base, projet: string, reglage: { plafond: number; carnet: string | null }): LeconRecue[] {
  if (reglage.plafond <= 0) return [];
  const tenues = idsDuCarnet(reglage.carnet);
  return leconsProvisoires(base, projet)
    .filter((lecon) => !tenues.has(lecon.id))
    .slice(-reglage.plafond)
    .reverse()
    .map((lecon) => ({ id: lecon.id, texte: lecon.texte }));
}

// Ce que la consigne d'un cook en dit : rien sans leçon, sinon chacune avec
// son id — celui qu'une rétro reconfirme.
export function blocDesLecons(lecons: LeconRecue[] | undefined): string[] {
  if (!lecons?.length) return [];
  return [
    "Ce que les cooks précédents de ce projet ont appris — leçons provisoires, la plus récente d'abord, chacune avec son id. Elles viennent de cooks comme toi, sans relecture : le ticket et le `CLAUDE.md` du dépôt priment sur elles.",
    "",
    ...lecons.map((lecon) => `- ${lecon.id} : ${lecon.texte}`),
    "",
  ];
}
