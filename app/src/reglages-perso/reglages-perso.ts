// Les préférences personnelles du chef, gardées dans un gist secret de son compte (gist.ts) plutôt
// que sur un seul ordinateur : elles le suivent d'un appareil à l'autre. Seules les préférences
// personnelles y vont ; les clés de l'appareil restent dans le fichier de l'app (partage.ts).
//
// La lecture relit le gist à chaque fois : ce qu'un autre appareil y a écrit se lit au tour suivant.
// Quand le gist ne porte encore aucune préférence, la première lecture l'amorce avec les préférences
// personnelles du fichier de l'app, qu'elle laisse tel qu'il est. Quand GitHub ne répond pas, ou que
// le gist ne se comprend pas, elle rend les valeurs du fichier de l'app et dit pourquoi — sans lever,
// et sans rien écrire par-dessus un gist qu'elle n'a pas compris.
//
// L'écriture remplace les préférences du gist par celles qu'on lui donne, sans leurs clés de
// l'appareil : qui veut garder ce qu'un autre appareil y a mis lit avant d'écrire. La première crée
// le gist, secret ; les suivantes réécrivent le même.
import { readFileSync } from "node:fs";
import type { GistDesPreferences } from "./gist.ts";
import { personnelles, vides, type Preferences } from "./partage.ts";

// La forme du fichier du gist : un brigade plus récent qui la changerait n'est pas lu à moitié.
const VERSION = 1;

// `gist` : lues dans le gist. `app.json` : le gist n'en portait aucune, elles viennent du fichier de
// l'app, et l'amorcent. `locales` : le gist n'a pas pu être lu — `panne` dit pourquoi.
export type Lues = { preferences: Preferences; source: "gist" | "app.json" | "locales"; panne?: string };

export type ReglagesPerso = {
  lire(): Promise<Lues>;
  // Rend la raison, si elles n'ont pas été écrites.
  ecrire(preferences: Preferences): Promise<string | undefined>;
};

// `appJson` : le chemin du fichier de l'app (config.ts, `cheminConfiguration`).
export function reglagesPerso(options: { gist: GistDesPreferences; appJson: string }): ReglagesPerso {
  const { gist } = options;
  // L'identifiant du gist, une fois trouvé ou créé : la liste des gists du compte n'est relue que s'il disparaît.
  let id: string | undefined;
  // Une opération à la fois : deux lectures qui amorcent ensemble ne créent pas deux gists.
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(operation: () => Promise<T>): Promise<T> => {
    const suite = file.then(operation, operation);
    file = suite.catch(() => {});
    return suite;
  };

  const locales = (): Preferences => {
    try {
      return personnelles(JSON.parse(readFileSync(options.appJson, "utf8")));
    } catch {
      return {};
    }
  };

  // Le contenu du fichier des préférences, "" si le compte n'en porte aucun.
  const contenuDuGist = async (): Promise<string> => {
    if (id !== undefined) {
      const lu = await gist.lire(id);
      if (lu !== null) return lu;
      id = undefined;
    }
    const trouve = await gist.trouver();
    if (trouve === null) return "";
    const lu = await gist.lire(trouve);
    if (lu === null) return "";
    id = trouve;
    return lu;
  };

  const ecrireDansLeGist = async (preferences: Preferences): Promise<void> => {
    const contenu = `${JSON.stringify({ version: VERSION, preferences: personnelles(preferences) }, null, 2)}\n`;
    id ??= (await gist.trouver()) ?? undefined;
    if (id !== undefined && (await gist.ecrire(id, contenu))) return;
    id = await gist.creer(contenu);
  };

  return {
    lire: () =>
      enFile(async () => {
        let tenues: Preferences;
        try {
          tenues = comprendre(await contenuDuGist());
        } catch (erreur) {
          return { preferences: locales(), source: "locales", panne: (erreur as Error).message };
        }
        if (!vides(tenues)) return { preferences: tenues, source: "gist" };
        const semees = locales();
        if (vides(semees)) return { preferences: semees, source: "app.json" };
        try {
          await ecrireDansLeGist(semees);
        } catch (erreur) {
          return { preferences: semees, source: "locales", panne: (erreur as Error).message };
        }
        return { preferences: semees, source: "app.json" };
      }),
    ecrire: (preferences) =>
      enFile(async () => {
        try {
          await ecrireDansLeGist(preferences);
          return undefined;
        } catch (erreur) {
          return `your preferences were not written to GitHub: ${(erreur as Error).message}`;
        }
      }),
  };
}

// Les préférences d'un fichier du gist — aucune s'il est vide —, sans clé de l'appareil, même écrite
// là à la main. Lève s'il ne se comprend pas.
function comprendre(contenu: string): Preferences {
  if (contenu.trim() === "") return {};
  let lu: unknown;
  try {
    lu = JSON.parse(contenu);
  } catch (erreur) {
    throw new Error(`the gist of your preferences is not readable JSON: ${(erreur as Error).message}`);
  }
  const { version, preferences } = (lu ?? {}) as { version?: unknown; preferences?: unknown };
  if (typeof version === "number" && version > VERSION) throw new Error(`the gist of your preferences was written by a newer brigade (version ${version})`);
  if (version !== VERSION) throw new Error("the gist of your preferences has no version this app reads");
  if (typeof preferences !== "object" || preferences === null || Array.isArray(preferences)) throw new Error("the gist of your preferences holds no preferences object");
  return personnelles(preferences);
}
