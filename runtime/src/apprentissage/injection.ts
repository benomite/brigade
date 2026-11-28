// Les leçons qu'un cook reçoit à son lancement : au plus `plafond` — un réglage
// du projet, pour que le contexte d'un cook ne grossisse pas sans fin —, et le
// bloc que sa consigne en porte.
import { lire } from "../config-invalide.ts";

export const LECONS_INJECTEES_PAR_DEFAUT = 20;
export const VARIABLE_LECONS_INJECTEES = "BRIGADE_INJECTED_LESSONS";

// Le plafond du projet, lu de l'environnement de son unité comme les seuils
// des leçons (`seuils/seuils.ts`). Zéro : ses cooks n'en reçoivent aucune. Une
// valeur illisible refuse le démarrage en nommant la variable.
export function lirePlafondDesLecons(env: NodeJS.ProcessEnv): number {
  return lire(env, VARIABLE_LECONS_INJECTEES, LECONS_INJECTEES_PAR_DEFAUT, "an integer, zero or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);
}

// `etage` : une leçon de l'étage commun de l'installation, acceptée par le
// chef (`commun/etage.ts`) — absente, une leçon provisoire du projet.
export type LeconRecue = { id: string; texte: string; etage?: "commun" };

// Ce que la consigne d'un cook en dit : rien sans leçon, sinon chacune avec
// son id — celui qu'une rétro reconfirme. Les leçons de l'étage commun ont
// leur bloc, après celles du projet.
export function blocDesLecons(lecons: LeconRecue[] | undefined): string[] {
  const duProjet = (lecons ?? []).filter((lecon) => lecon.etage === undefined);
  const communes = (lecons ?? []).filter((lecon) => lecon.etage === "commun");
  const liste = (de: LeconRecue[]) => de.map((lecon) => `- ${lecon.id} : ${lecon.texte}`);
  return [
    ...(duProjet.length === 0
      ? []
      : [
          "Ce que les cooks précédents de ce projet ont appris — leçons provisoires, la plus récente d'abord, chacune avec son id. Elles viennent de cooks comme toi, sans relecture : le ticket et le `CLAUDE.md` du dépôt priment sur elles.",
          "",
          ...liste(duProjet),
          "",
        ]),
    ...(communes.length === 0
      ? []
      : [
          "Ce que les cooks de tous les projets de cette installation ont appris — leçons de l'étage commun, promues dans plusieurs projets et acceptées par le chef, chacune avec son id. Le ticket et le `CLAUDE.md` du dépôt priment sur elles.",
          "",
          ...liste(communes),
          "",
        ]),
  ];
}
