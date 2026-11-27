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
export type VersionsViews = { lire(): Record<string, VersionVue>; ecrire(views: Record<string, VersionVue>): void };

// Le tout dans un fichier. Absent ou illisible, il ne retient rien : au pire, un « depuis » n'est plus dit.
export function versionsInFile(path: string, tell: (line: string) => void = (line) => console.error(line)): VersionsViews {
  return {
    lire() {
      try {
        const readOne: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (typeof readOne !== "object" || readOne === null) return {};
        return Object.fromEntries(
          Object.entries(readOne).flatMap(([id, vue]) => {
            const { version, depuisLe: sinceThe } = (vue ?? {}) as Partial<Record<keyof VersionVue, unknown>>;
            return typeof version === "string" ? [[id, { version, depuisLe: typeof sinceThe === "string" && !Number.isNaN(Date.parse(sinceThe)) ? sinceThe : null }]] : [];
          }),
        );
      } catch {
        return {};
      }
    },
    ecrire(views) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(`${path}.neuf`, `${JSON.stringify(views, null, 2)}\n`);
        renameSync(`${path}.neuf`, path);
      } catch (error) {
        tell(`brigade: the versions seen on your stations could not be remembered — ${(error as Error).message}`);
      }
    },
  };
}

export function followTheVersions(memory: VersionsViews | undefined) {
  const views = memory?.lire() ?? {};
  return {
    // La date à laquelle l'app a vu cette station passer à `version`, ou nulle. Note la version vue.
    vue(id: string, version: string, instant: number): string | null {
      const before = views[id];
      if (before?.version === version) return before.depuisLe;
      views[id] = { version, depuisLe: before === undefined ? null : new Date(instant).toISOString() };
      memory?.ecrire(views);
      return views[id].depuisLe;
    },
  };
}
