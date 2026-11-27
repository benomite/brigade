// Le dernier rail lu de chaque projet, gardé dans un fichier de l'app (#4620) : un redémarrage ne laisse pas le rail vide
// quand GitHub est en pause. Un fichier illisible ou absent ne garde rien ; une écriture qui échoue ne casse aucune lecture.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BoardRead } from "./read.ts";
import type { KeptReads } from "./rail.ts";

export function keptReadsInFile(path: string): KeptReads {
  let all: Record<string, BoardRead> | undefined;
  const load = (): Record<string, BoardRead> => {
    if (all !== undefined) return all;
    try {
      const readOne: unknown = JSON.parse(readFileSync(path, "utf8"));
      all = typeof readOne === "object" && readOne !== null ? (readOne as Record<string, BoardRead>) : {};
    } catch {
      all = {};
    }
    return all;
  };
  return {
    lire: (name) => {
      const readOne = load()[name];
      return readOne !== undefined && readOne.lu === true && typeof readOne.luLe === "string" ? readOne : undefined;
    },
    ecrire: (name, readOne) => {
      load()[name] = readOne;
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(`${path}.tmp`, JSON.stringify(all));
        renameSync(`${path}.tmp`, path);
      } catch {
        // Rien de gardé : le rail se relira.
      }
    },
  };
}
