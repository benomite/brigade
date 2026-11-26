// La fiche du projet, côté process principal (ticket 4240) : `.brigade/fiche-projet.json`, lu et écrit dans le dossier du
// projet sur ce poste — celui que le fichier des projets lui donne (config.ts). La vue (card-project.js) demande un
// chemin relatif au dossier ; seul celui de la fiche est lu ou écrit ici, rien d'autre du dossier.
//   - un fichier absent se lit `null` : la vue dit que le projet n'a pas encore de fiche ;
//   - une lecture qui échoue autrement rejette, avec sa raison : la vue le dit, et n'offre rien à écrire ;
//   - l'écriture passe par un fichier à côté, puis le remplace : une écriture coupée ne laisse pas une fiche à moitié.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CARD = ".brigade/fiche-projet.json";

function fichierDe(project: { dossier: string } | undefined, chemin: unknown): string {
  if (project === undefined) throw new Error("this project is no longer in the projects file");
  if (chemin === CARD) return join(project.dossier, CARD);
  throw new Error(`only ${CARD} is read or written here, not ${String(chemin)}`);
}

export async function lireDansLeProject(project: { dossier: string } | undefined, chemin: unknown): Promise<string | null> {
  const fichier = fichierDe(project, chemin);
  try {
    return await readFile(fichier, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Le texte écrit est celui d'un objet JSON : rien d'autre ne remplace une fiche.
export async function ecrireDansLeProject(project: { dossier: string } | undefined, chemin: unknown, texte: unknown): Promise<void> {
  const fichier = fichierDe(project, chemin);
  let objet: unknown;
  try {
    objet = typeof texte === "string" ? JSON.parse(texte) : undefined;
  } catch {
    objet = undefined;
  }
  if (typeof objet !== "object" || objet === null || Array.isArray(objet)) throw new Error(`nothing was written: the project sheet is not a JSON object`);
  await mkdir(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  await writeFile(provisoire, texte as string);
  await rename(provisoire, fichier);
}
