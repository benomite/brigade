// Outils communs aux tests. Aucun test ne lit BRIGADE_STATE_DIR : chacun crée
// son répertoire d'état temporaire, détruit à la fin du test.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { Journal } from "../src/journal.ts";
import type { Projection } from "../src/projection.ts";

export function repertoireTemporaire(t: TestContext): string {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-test-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  return repertoire;
}

// Un fait d'un domaine que le runtime ne connaît pas encore (rail, pass…) : le
// journal doit le porter sans le comprendre.
export function faitInconnu(type: string, payload: Record<string, unknown> = {}): Fait {
  return { type, payload } as unknown as Fait;
}

// Horloge qui avance d'une seconde à chaque lecture, pour des horodatages
// distincts et prévisibles.
export function horloge(depart = "2026-10-08T10:00:00.000Z"): () => Date {
  let instant = Date.parse(depart);
  return () => {
    const date = new Date(instant);
    instant += 1000;
    return date;
  };
}

// L'état complet des projections : le contenu de chacune de leurs tables.
export function photographier(journal: Journal, projections: Projection[]): Record<string, unknown[]> {
  const photo: Record<string, unknown[]> = {};
  for (const projection of projections) {
    for (const table of projection.tables) {
      photo[`${projection.nom}/${table}`] = journal.base.lire(`SELECT * FROM ${table} ORDER BY rowid`);
    }
  }
  return photo;
}

export type Enfant = {
  process: ChildProcess;
  sortie: () => string;
  // Résout dès que la sortie (stdout + stderr) contient `texte`.
  attendre: (texte: string) => Promise<void>;
  // Résout à la mort du process, avec son code de sortie (null s'il est mort d'un signal).
  fin: Promise<number | null>;
};

// Lance un fichier TypeScript dans un vrai process Node, tué à la fin du test
// s'il vit encore. L'environnement est celui qu'on lui donne, rien de plus :
// un BRIGADE_STATE_DIR posé dans le shell du dev ne lui parvient jamais.
export function lancer(t: TestContext, fichier: string, args: string[] = [], env: Record<string, string> = {}): Enfant {
  const enfant = spawn(process.execPath, [fichier, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let sortie = "";
  const attentes: Array<() => void> = [];
  const noter = (morceau: Buffer) => {
    sortie += morceau.toString();
    for (const verifier of attentes) verifier();
  };
  enfant.stdout.on("data", noter);
  enfant.stderr.on("data", noter);
  const fin = new Promise<number | null>((resoudre) => enfant.on("close", (code) => resoudre(code)));
  t.after(() => {
    enfant.kill("SIGKILL");
  });
  return {
    process: enfant,
    sortie: () => sortie,
    fin,
    attendre: (texte) =>
      new Promise<void>((resoudre, rejeter) => {
        const verifier = () => {
          if (sortie.includes(texte)) resoudre();
        };
        attentes.push(verifier);
        verifier();
        void fin.then(() => {
          if (!sortie.includes(texte)) rejeter(new Error(`process terminé sans « ${texte} » : ${sortie}`));
        });
      }),
  };
}
