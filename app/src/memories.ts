// Ce que l'app se rappelle des shells persistants ouverts (persistence.ts), d'une ouverture à
// l'autre : pour chaque projet, chaque shell — son rang, sa session, sa machine — et le dernier
// rang donné. C'est ce qui les fait revenir, rattachés à leur session, quand l'app rouvre. Un
// shell fermé pour de bon en sort ; fermer l'app n'en retire rien.
//
// Un fichier à côté du fichier des projets, que l'app est seule à écrire. Ce qui ne s'y lit pas —
// un fichier abîmé, une entrée d'une autre forme — est oublié plutôt que de bloquer l'app : au pire,
// un shell ne revient pas, et sa session reste sur sa machine.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NAME_OF_SESSION, type Target } from "./persistence.ts";

export type Memory = { rang: number; session: string; cible: Target };
// `dernier` : le dernier rang donné dans ce projet — un shell fermé ne rend pas le sien.
export type OfProject = { dernier: number; shells: Memory[] };
export type Reminder = Record<string, OfProject>;
export type Memories = { lire(): Reminder; ecrire(reminder: Reminder): void };

const text = (readOne: unknown): readOne is string => typeof readOne === "string" && readOne !== "";
const rank = (readOne: unknown): readOne is number => typeof readOne === "number" && Number.isInteger(readOne) && readOne > 0;

function targetRead(readOne: unknown): Target | undefined {
  // Un shell d'une machine distante, tel que l'app d'avant le retirait, ne se lit plus : il n'est pas rattaché.
  const { lieu: place } = (readOne ?? {}) as { lieu?: unknown };
  return place === "poste" ? { lieu: place } : undefined;
}

// Le rappel tel qu'il est écrit, sans ce qui ne s'y lit pas.
export function reminderRead(readOne: unknown): Reminder {
  const projects = (readOne ?? {}) as { projets?: unknown };
  if (typeof projects.projets !== "object" || projects.projets === null) return {};
  const reminder: Reminder = {};
  for (const [name, raw] of Object.entries(projects.projets)) {
    const { dernier: last, shells } = (raw ?? {}) as { dernier?: unknown; shells?: unknown };
    const readOnes: Memory[] = [];
    for (const shell of Array.isArray(shells) ? shells : []) {
      const { rang: r, session, cible: target } = (shell ?? {}) as { rang?: unknown; session?: unknown; cible?: unknown };
      const readEntry = targetRead(target);
      if (rank(r) && text(session) && NAME_OF_SESSION.test(session) && readEntry !== undefined && !readOnes.some((other) => other.rang === r)) readOnes.push({ rang: r, session, cible: readEntry });
    }
    const moreTop = Math.max(0, ...readOnes.map(({ rang: r }) => r));
    reminder[name] = { dernier: rank(last) ? Math.max(last, moreTop) : moreTop, shells: readOnes };
  }
  return reminder;
}

export function memoriesInFile(path: string, tell: (line: string) => void = (line) => console.error(line)): Memories {
  return {
    lire() {
      try {
        return reminderRead(JSON.parse(readFileSync(path, "utf8")));
      } catch {
        return {};
      }
    },
    ecrire(reminder) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        // Écrit à côté, puis mis à sa place : un fichier lu n'est jamais à moitié écrit.
        writeFileSync(`${path}.neuf`, `${JSON.stringify({ projets: reminder }, null, 2)}\n`);
        renameSync(`${path}.neuf`, path);
      } catch (error) {
        tell(`brigade: the open shells could not be remembered — they will not come back when the app reopens: ${(error as Error).message}`);
      }
    },
  };
}
