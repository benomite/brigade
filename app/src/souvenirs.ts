// Ce que l'app se rappelle des shells persistants ouverts (persistance.ts), d'une ouverture à
// l'autre : pour chaque projet, chaque shell — son rang, sa session, sa machine — et le dernier
// rang donné. C'est ce qui les fait revenir, rattachés à leur session, quand l'app rouvre. Un
// shell fermé pour de bon en sort ; fermer l'app n'en retire rien.
//
// Un fichier à côté du fichier des projets, que l'app est seule à écrire. Ce qui ne s'y lit pas —
// un fichier abîmé, une entrée d'une autre forme — est oublié plutôt que de bloquer l'app : au pire,
// un shell ne revient pas, et sa session reste sur sa machine.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { NAME_DE_SESSION, type Cible } from "./persistance.ts";

export type Souvenir = { rang: number; session: string; cible: Cible };
// `dernier` : le dernier rang donné dans ce projet — un shell fermé ne rend pas le sien.
export type DuProject = { dernier: number; shells: Souvenir[] };
export type Rappel = Record<string, DuProject>;
export type Souvenirs = { lire(): Rappel; ecrire(rappel: Rappel): void };

const texte = (lu: unknown): lu is string => typeof lu === "string" && lu !== "";
const rang = (lu: unknown): lu is number => typeof lu === "number" && Number.isInteger(lu) && lu > 0;

function cibleLue(lu: unknown): Cible | undefined {
  // Un shell d'une machine distante, tel que l'app d'avant le retirait, ne se lit plus : il n'est pas rattaché.
  const { lieu } = (lu ?? {}) as { lieu?: unknown };
  return lieu === "poste" ? { lieu } : undefined;
}

// Le rappel tel qu'il est écrit, sans ce qui ne s'y lit pas.
export function rappelLu(lu: unknown): Rappel {
  const projects = (lu ?? {}) as { projets?: unknown };
  if (typeof projects.projets !== "object" || projects.projets === null) return {};
  const rappel: Rappel = {};
  for (const [name, brut] of Object.entries(projects.projets)) {
    const { dernier, shells } = (brut ?? {}) as { dernier?: unknown; shells?: unknown };
    const lus: Souvenir[] = [];
    for (const shell of Array.isArray(shells) ? shells : []) {
      const { rang: r, session, cible } = (shell ?? {}) as { rang?: unknown; session?: unknown; cible?: unknown };
      const lue = cibleLue(cible);
      if (rang(r) && texte(session) && NAME_DE_SESSION.test(session) && lue !== undefined && !lus.some((autre) => autre.rang === r)) lus.push({ rang: r, session, cible: lue });
    }
    const plusHaut = Math.max(0, ...lus.map(({ rang: r }) => r));
    rappel[name] = { dernier: rang(dernier) ? Math.max(dernier, plusHaut) : plusHaut, shells: lus };
  }
  return rappel;
}

export function souvenirsDansFichier(chemin: string, tell: (line: string) => void = (line) => console.error(line)): Souvenirs {
  return {
    lire() {
      try {
        return rappelLu(JSON.parse(readFileSync(chemin, "utf8")));
      } catch {
        return {};
      }
    },
    ecrire(rappel) {
      try {
        mkdirSync(dirname(chemin), { recursive: true });
        // Écrit à côté, puis mis à sa place : un fichier lu n'est jamais à moitié écrit.
        writeFileSync(`${chemin}.neuf`, `${JSON.stringify({ projets: rappel }, null, 2)}\n`);
        renameSync(`${chemin}.neuf`, chemin);
      } catch (error) {
        tell(`brigade: the open shells could not be remembered — they will not come back when the app reopens: ${(error as Error).message}`);
      }
    },
  };
}
