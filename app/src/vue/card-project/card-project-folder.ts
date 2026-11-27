// La fiche du projet, côté process principal (ticket 4240) : `.brigade/fiche-projet.json`, lu et écrit dans le dossier du
// projet sur ce poste — celui que le fichier des projets lui donne (config.ts). La vue (card-project.js) demande un
// chemin relatif au dossier ; seul celui de la fiche est lu ou écrit ici, rien d'autre du dossier.
//   - un fichier absent se lit `null` : la vue dit que le projet n'a pas encore de fiche ;
//   - une lecture qui échoue autrement rejette, avec sa raison : la vue le dit, et n'offre rien à écrire ;
//   - l'écriture passe par un fichier à côté, puis le remplace : une écriture coupée ne laisse pas une fiche à moitié.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CARD = ".brigade/fiche-projet.json";

function fileOf(project: { dossier: string } | undefined, path: unknown): string {
  if (project === undefined) throw new Error("this project is no longer in the projects file");
  if (path === CARD) return join(project.dossier, CARD);
  throw new Error(`only ${CARD} is read or written here, not ${String(path)}`);
}

export async function readInTheProject(project: { dossier: string } | undefined, path: unknown): Promise<string | null> {
  const file = fileOf(project, path);
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// Le texte écrit est celui d'un objet JSON : rien d'autre ne remplace une fiche.
export async function writeInTheProject(project: { dossier: string } | undefined, path: unknown, text: unknown): Promise<void> {
  const file = fileOf(project, path);
  let object: unknown;
  try {
    object = typeof text === "string" ? JSON.parse(text) : undefined;
  } catch {
    object = undefined;
  }
  if (typeof object !== "object" || object === null || Array.isArray(object)) throw new Error(`nothing was written: the project sheet is not a JSON object`);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text as string);
  await rename(temporary, file);
}
