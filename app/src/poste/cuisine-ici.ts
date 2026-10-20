// Où tourne la cuisine d'un projet : sur sa box, ou sur cet ordinateur. Ce n'est pas `app.json`
// qui le dit, c'est la station de cet ordinateur : un projet qu'elle sert a sa ligne dans sa
// configuration (`<BRIGADE_STATION_DIR>/projets`, une ligne par projet — runtime/src/station/
// configuration.ts), qu'il y ait été ajouté depuis l'app ou écrit à la main. Une station qui n'en
// est pas la principale ne lui écrit aucune ligne.
//
// - **Le lieu vivant l'emporte.** Un projet que la station de cet ordinateur sert se lit ici, par
//   son geste, sans `ssh` — même s'il déclare un `hote`. Sinon, il se lit sur sa box, s'il en
//   déclare une ; sans `hote`, rien n'est lu de lui.
// - **Relu à chaque lecture.** La configuration de la station se relit chaque fois qu'on demande
//   où est un projet : une cuisine qui passe de la box à cet ordinateur, ou l'inverse, est lue à
//   sa nouvelle place dès la lecture suivante, sans que rien ne change dans `app.json`.
// - **Une app qui n'est pas une station** (un téléphone, `BRIGADE_APP_STATION=0`, pas de runtime
//   à côté d'elle) ne lit rien ici : rien n'y cuit.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Cuisine, Locale } from "../box.ts";
import type { Box } from "../config.ts";

// Le fichier des projets d'une station, sous son répertoire — celui que lit son geste.
export const CONFIGURATION = "projets";

// Les projets que la configuration d'une station sert, dans son ordre : le premier champ de
// chaque ligne qui en a au moins trois (nom, dépôt, branche). Les blancs et les commentaires ne
// servent rien. Un fichier absent ou illisible : aucun.
export function servisPar(racine: string): string[] {
  let texte: string;
  try {
    texte = readFileSync(join(racine, CONFIGURATION), "utf8");
  } catch {
    return [];
  }
  const noms: string[] = [];
  for (const ligne of texte.split("\n")) {
    const champs = ligne.trim().split(/\s+/).filter(Boolean);
    const [nom] = champs;
    if (nom === undefined || nom.startsWith("#") || champs.length < 3 || noms.includes(nom)) continue;
    noms.push(nom);
  }
  return noms;
}

export type CuisinesIci = {
  // Là où se lit la cuisine de ce projet, à cet instant : cet ordinateur, sa box, ou nulle part.
  cuisineDe(projet: { nom: string; box?: Box }): Cuisine | undefined;
  // Ce projet cuit-il sur cet ordinateur, à cet instant ?
  ici(nom: string): boolean;
};

export function tenirCuisinesIci(options: {
  // La station de cet ordinateur, telle que son geste s'y lance — absente sur un poste.
  locale: Locale | undefined;
  // Les projets qu'elle sert passent d'une liste à une autre : la vue et les alertes suivent.
  surChangement?: (servis: readonly string[]) => void;
}): CuisinesIci {
  const { locale } = options;
  let connus: readonly string[] = locale === undefined ? [] : servisPar(locale.racine);
  const relire = (): readonly string[] => {
    if (locale === undefined) return connus;
    const lus = servisPar(locale.racine);
    if (lus.join("\n") !== connus.join("\n")) {
      connus = lus;
      // Après la lecture en cours : celui qui a demandé n'est pas interrompu par ce qui suit.
      if (options.surChangement !== undefined) queueMicrotask(() => options.surChangement?.(lus));
    }
    return connus;
  };
  return {
    cuisineDe({ nom, box }) {
      return locale !== undefined && relire().includes(nom) ? { locale } : box;
    },
    ici: (nom) => locale !== undefined && relire().includes(nom),
  };
}
