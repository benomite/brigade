// Ce qui suit le chef d'un appareil à l'autre, et ce qui reste sur celui-ci. Le niveau « toi »
// (docs/reglages.md, §3) est le fichier de l'app, `~/.config/brigade/app.json` : il mêle les
// préférences du chef — les couleurs d'un projet, l'ordre des projets, celles de l'affichage — et
// ce qui ne vaut que pour cet ordinateur — le dossier d'un projet.
//
// La frontière tient en une liste, celle des clés de l'appareil : elles ne quittent jamais cet
// ordinateur. Tout le reste est personnel, et part dans le gist — une préférence ajoutée demain suit
// le chef sans qu'on ait à le dire ici. Les réglages partagés d'un projet, versionnés dans son dépôt, ne
// sont pas de ce niveau : rien ici ne les lit ni ne les écrit.

// Les clés d'un projet qui ne valent que pour cet ordinateur (config.ts) : son dossier, et ce que la
// station de cet ordinateur prend — les tickets ordinaires, sa limite de cooks. Les clés des versions d'avant
// (`hote`, `stations`), que l'app ne lit plus, n'en partent pas non plus.
export const KEYS_OF_PROJECT_ON_THE_DEVICE: readonly string[] = ["dossier", "hote", "stations", "ordinaires", "limiteCooks"];
// Les clés du fichier qui ne valent que pour cet ordinateur : celle d'une version d'avant (`hotes`), que l'app ne lit plus.
export const KEYS_OF_THE_DEVICE: readonly string[] = ["hotes"];

export type Preferences = { [key: string]: unknown };

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const without = (readOne: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(readOne).filter(([key]) => !keys.includes(key)));

// Les préférences personnelles d'un contenu de la forme du fichier de l'app : tout, sauf les clés de
// l'appareil. Les projets restent dans leur ordre — c'est celui de la barre —, chacun sans ses clés
// de l'appareil ; une ligne qui n'est pas un projet nommé ne part pas, faute de savoir ce qu'elle porte.
export function personal(content: unknown): Preferences {
  if (!object(content)) return {};
  const preferences = without(content, KEYS_OF_THE_DEVICE);
  if ("projets" in preferences) {
    const projects = Array.isArray(preferences.projets) ? preferences.projets : [];
    preferences.projets = projects.flatMap((project) => (object(project) && typeof project.nom === "string" ? [without(project, KEYS_OF_PROJECT_ON_THE_DEVICE)] : []));
  }
  return preferences;
}

// Vrai quand il n'y a rien de personnel à garder : ni clé, ni projet.
export function empty(preferences: Preferences): boolean {
  return Object.entries(preferences).every(([key, value]) => key === "projets" && Array.isArray(value) && value.length === 0);
}
