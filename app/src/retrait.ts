// Retirer un projet de l'app : « Retirer de l'app » enlève sa ligne du fichier des projets — donc
// de la barre —, et rien d'autre : rien ne part vers sa station, où il reste installé, son
// journal intact. Désinstaller un projet d'une station se fait sur la station elle-même
// (docs/installer.md, « Désinstaller »).
import type { Projet } from "./config.ts";

// Le libellé du geste.
export const RETIRER = "Remove from the app";
const DOC = "docs/installer.md";

// Ce que le panneau montre pour retirer un projet : le geste, sous son libellé, avec ce qu'il fait
// et ce qu'il ne fait pas.
export type Retrait = {
  projet: string;
  titre: string;
  retirer: { libelle: string; lignes: string[] };
};

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste.
export type Avis = { titre: string; lignes: string[] };

export function tenirRetraits(options: {
  // Le fichier des projets : le geste n'écrit que là.
  chemin: string;
  // Retire le projet de ce fichier, et rien d'autre. Rend la raison, s'il ne l'a pas été.
  retirer(nom: string): string | undefined;
}) {
  const RESTE = "Its terminals open here are stopped; its folder on this workstation is left untouched.";

  return {
    // Le geste d'un projet, tel que le panneau le pose.
    etat({ nom }: Projet): Retrait {
      return {
        projet: nom,
        titre: "Remove this project from the app",
        retirer: { libelle: RETIRER, lignes: [`“${RETIRER}” takes “${nom}” off the bar and out of ${options.chemin} — nothing else.`, `Nothing is sent to its station: the project stays installed there, with its log intact. Uninstalling it is done on the station itself (${DOC}).`, RESTE] },
      };
    },

    // Le projet quitte le fichier des projets, et rien d'autre n'a lieu. Rend l'avis à montrer, ou
    // pourquoi il n'est pas retiré.
    retirerDeLApp({ nom }: Projet): { avis: Avis } | { refus: string } {
      const refus = options.retirer(nom);
      if (refus !== undefined) return { refus: `Not removed — ${refus}` };
      return { avis: { titre: `“${nom}” is removed from the app.`, lignes: ["Nothing was sent to its station: the project is still installed there, and its log was not touched."] } };
    },
  };
}

export type Retraits = ReturnType<typeof tenirRetraits>;
