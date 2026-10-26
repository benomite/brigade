// Ce qui suit le chef d'un appareil à l'autre, et ce qui reste sur celui-ci. Le niveau « toi »
// (docs/reglages.md, §3) est le fichier de l'app, `~/.config/brigade/app.json` : il mêle les
// préférences du chef — les couleurs d'un projet, l'ordre des projets, celles de l'affichage — et
// ce qui ne vaut que pour cet ordinateur — le dossier d'un projet, l'hôte que son `ssh` connaît.
//
// La frontière tient en une liste, celle des clés de l'appareil : elles ne quittent jamais cet
// ordinateur. Tout le reste est personnel, et part dans le gist — une préférence ajoutée demain suit
// le chef sans qu'on ait à le dire ici. Les réglages partagés d'un projet, versionnés dans son dépôt, ne
// sont pas de ce niveau : rien ici ne les lit ni ne les écrit.

// Les clés d'un projet qui ne valent que pour cet ordinateur (config.ts) : son dossier, l'hôte par
// lequel son `ssh` joint sa box, les stations que ce poste joue pour lui, et ce que la station de
// cet ordinateur prend — les tickets ordinaires, sa limite de cooks.
export const CLES_DU_PROJET_SUR_L_APPAREIL: readonly string[] = ["dossier", "hote", "stations", "ordinaires", "limiteCooks"];
// Les clés du fichier qui ne valent que pour cet ordinateur : les box qu'il joint par son `ssh`.
export const CLES_DE_L_APPAREIL: readonly string[] = ["hotes"];

export type Preferences = { [cle: string]: unknown };

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

const sans = (lu: Record<string, unknown>, cles: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(lu).filter(([cle]) => !cles.includes(cle)));

// Les préférences personnelles d'un contenu de la forme du fichier de l'app : tout, sauf les clés de
// l'appareil. Les projets restent dans leur ordre — c'est celui de la barre —, chacun sans ses clés
// de l'appareil ; une ligne qui n'est pas un projet nommé ne part pas, faute de savoir ce qu'elle porte.
export function personnelles(contenu: unknown): Preferences {
  if (!objet(contenu)) return {};
  const preferences = sans(contenu, CLES_DE_L_APPAREIL);
  if ("projets" in preferences) {
    const projets = Array.isArray(preferences.projets) ? preferences.projets : [];
    preferences.projets = projets.flatMap((projet) => (objet(projet) && typeof projet.nom === "string" ? [sans(projet, CLES_DU_PROJET_SUR_L_APPAREIL)] : []));
  }
  return preferences;
}

// Vrai quand il n'y a rien de personnel à garder : ni clé, ni projet.
export function vides(preferences: Preferences): boolean {
  return Object.entries(preferences).every(([cle, valeur]) => cle === "projets" && Array.isArray(valeur) && valeur.length === 0);
}
