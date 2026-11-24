// La file des mots au cook, dans le répertoire d'état du projet : la commande
// `send-word`, dans son propre process, y ajoute le mot ; le runtime qui fait
// tourner le cook l'y prend à la fin de son tour (`lanceur.ts`).
//
// Un fichier par ticket, une ligne JSON par mot : `mots-au-cook/<ticket>.jsonl`.
// Le runtime le prend en le renommant d'abord — un mot ajouté pendant qu'il le
// lit va dans un fichier neuf, pour le tour suivant. Une ligne illisible est
// écartée et dite : le mot reste lisible sur l'issue, où il a été posté.
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FileDesMots } from "./mot-au-cook.ts";

const DOSSIER_DES_MOTS = "mots-au-cook";

const absent = (erreur: unknown) => (erreur as NodeJS.ErrnoException | null)?.code === "ENOENT";

// Windows dit ENOENT là où Linux dit ENOTDIR : un fichier sur le chemin de la
// file la rend illisible, pas vide. Le premier chemin qui existe en remontant
// le dit — la racine existe toujours.
function cheminCoupe(chemin: string): boolean {
  for (let courant = chemin; ; courant = dirname(courant)) {
    const trouve = statSync(courant, { throwIfNoEntry: false });
    if (trouve) return !trouve.isDirectory();
  }
}

export function fileSurDisque(repertoireEtat: string, avertir: (texte: string) => void = (texte) => console.error(texte)): FileDesMots {
  const dossier = join(repertoireEtat, DOSSIER_DES_MOTS);
  const fichier = (ticket: number) => join(dossier, `${ticket}.jsonl`);
  return {
    ajouter(ticket, texte) {
      mkdirSync(dossier, { recursive: true });
      appendFileSync(fichier(ticket), `${JSON.stringify({ text: texte })}\n`);
    },
    prendre(ticket) {
      const pris = `${fichier(ticket)}.pris`;
      try {
        renameSync(fichier(ticket), pris);
      } catch (erreur) {
        if (!absent(erreur)) throw erreur;
        if (cheminCoupe(dossier)) throw erreur;
        return [];
      }
      const contenu = readFileSync(pris, "utf8");
      rmSync(pris);
      const mots: string[] = [];
      for (const ligne of contenu.split("\n")) {
        if (ligne.trim() === "") continue;
        let lu: unknown;
        try {
          lu = JSON.parse(ligne);
        } catch {
          lu = null;
        }
        const texte = (lu as { text?: unknown } | null)?.text;
        if (typeof texte === "string") mots.push(texte);
        else avertir(`brigade : #${ticket} — a queued word from the chef cannot be read, it is not delivered (it stays on the issue): ${ligne.slice(0, 120)}`);
      }
      return mots;
    },
  };
}
