// Où tourne la cuisine d'un projet : sur cet ordinateur, ou nulle part. Ce n'est pas `app.json`
// qui le dit, c'est la station de cet ordinateur : un projet qu'elle sert a sa ligne dans sa
// configuration (`<BRIGADE_STATION_DIR>/projets`, une ligne par projet), qu'il y ait été ajouté depuis
// l'app ou écrit à la main. Une station qui n'en
// est pas la principale ne lui écrit aucune ligne.
//
// - **Un projet que la station de cet ordinateur sert se lit ici**, par son geste. Les autres
//   se lisent du tableau de leur cuisine sur GitHub, et ne portent aucune cuisine ici.
// - **Relu à chaque lecture.** La configuration de la station se relit chaque fois qu'on demande
//   où est un projet : une cuisine qui arrive sur cet ordinateur, ou le quitte, est lue à
//   sa nouvelle place dès la lecture suivante, sans que rien ne change dans `app.json`.
// - **Une app qui n'est pas une station** (un téléphone, `BRIGADE_APP_STATION=0`, pas de runtime
//   à côté d'elle) ne lit rien ici : rien n'y cuit.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Kitchen, Locale } from "../box.ts";

// Le fichier des projets d'une station, sous son répertoire — celui que lit son geste.
export const CONFIGURATION = "projets";

// Les projets que la configuration d'une station sert, dans son ordre : le premier champ de
// chaque ligne qui en a au moins trois (nom, dépôt, branche). Les blancs et les commentaires ne
// servent rien. Un fichier absent ou illisible : aucun.
export function servedBy(root: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(root, CONFIGURATION), "utf8");
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const line of text.split("\n")) {
    const fields = line.trim().split(/\s+/).filter(Boolean);
    const [name] = fields;
    if (name === undefined || name.startsWith("#") || fields.length < 3 || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

export type KitchensHere = {
  // Là où se lit la cuisine de ce projet, à cet instant : cet ordinateur, ou nulle part.
  cuisineDe(project: { nom: string }): Kitchen | undefined;
  // Ce projet cuit-il sur cet ordinateur, à cet instant ?
  ici(name: string): boolean;
};

export function holdKitchensHere(options: {
  // La station de cet ordinateur, telle que son geste s'y lance — absente sur un poste.
  locale: Locale | undefined;
  // Les projets qu'elle sert passent d'une liste à une autre : la vue et les alertes suivent.
  surChangement?: (servedOnes: readonly string[]) => void;
}): KitchensHere {
  const { locale } = options;
  let knownOnes: readonly string[] = locale === undefined ? [] : servedBy(locale.racine);
  const reread = (): readonly string[] => {
    if (locale === undefined) return knownOnes;
    const readOnes = servedBy(locale.racine);
    if (readOnes.join("\n") !== knownOnes.join("\n")) {
      knownOnes = readOnes;
      // Après la lecture en cours : celui qui a demandé n'est pas interrompu par ce qui suit.
      if (options.surChangement !== undefined) queueMicrotask(() => options.surChangement?.(readOnes));
    }
    return knownOnes;
  };
  return {
    cuisineDe({ nom: name }) {
      return locale !== undefined && reread().includes(name) ? { locale } : undefined;
    },
    ici: (name) => locale !== undefined && reread().includes(name),
  };
}
