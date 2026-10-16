// Depuis quand une station tourne sur sa version : la station ne le publie pas, l'app le déduit de
// ce qu'elle voit. Chaque lecture compare la version publiée à la dernière vue ; quand elle change,
// l'instant est noté — c'est le « depuis » de la ligne de mise à jour. À la toute première lecture
// d'une station, l'app ne sait pas depuis quand elle est sur sa version : rien n'est dit, plutôt
// qu'une durée fausse. Le « depuis » compte donc de la lecture qui a vu le changement : une
// station mise à jour pendant que l'app était fermée est datée de sa première lecture après.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// `depuisLe` : nul tant que l'app n'a pas vu la version changer.
export type VersionVue = { version: string; depuisLe: string | null };
export type VersionsVues = { lire(): Record<string, VersionVue>; ecrire(vues: Record<string, VersionVue>): void };

// Le tout dans un fichier. Absent ou illisible, il ne retient rien : au pire, un « depuis » n'est plus dit.
export function versionsDansFichier(chemin: string, dire: (ligne: string) => void = (ligne) => console.error(ligne)): VersionsVues {
  return {
    lire() {
      try {
        const lu: unknown = JSON.parse(readFileSync(chemin, "utf8"));
        if (typeof lu !== "object" || lu === null) return {};
        return Object.fromEntries(
          Object.entries(lu).flatMap(([id, vue]) => {
            const { version, depuisLe } = (vue ?? {}) as Partial<Record<keyof VersionVue, unknown>>;
            return typeof version === "string" ? [[id, { version, depuisLe: typeof depuisLe === "string" && !Number.isNaN(Date.parse(depuisLe)) ? depuisLe : null }]] : [];
          }),
        );
      } catch {
        return {};
      }
    },
    ecrire(vues) {
      try {
        mkdirSync(dirname(chemin), { recursive: true });
        writeFileSync(`${chemin}.neuf`, `${JSON.stringify(vues, null, 2)}\n`);
        renameSync(`${chemin}.neuf`, chemin);
      } catch (erreur) {
        dire(`brigade: the versions seen on your stations could not be remembered — ${(erreur as Error).message}`);
      }
    },
  };
}

export function suivreLesVersions(memoire: VersionsVues | undefined) {
  const vues = memoire?.lire() ?? {};
  return {
    // La date à laquelle l'app a vu cette station passer à `version`, ou nulle. Note la version vue.
    vue(id: string, version: string, instant: number): string | null {
      const avant = vues[id];
      if (avant?.version === version) return avant.depuisLe;
      vues[id] = { version, depuisLe: avant === undefined ? null : new Date(instant).toISOString() };
      memoire?.ecrire(vues);
      return vues[id].depuisLe;
    },
  };
}
