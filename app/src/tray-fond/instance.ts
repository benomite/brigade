// Le verrou d'instance de l'icône de fond et de l'app (#3864) : un fichier qui porte le pid de celui qui tient la place, dans
// ses données à lui. Le verrou d'instance unique d'Electron ne sert plus qu'à l'app : tenu par l'icône, il passait la main
// de l'app à un process sans fenêtre, et l'app rouverte ne montrait rien.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function vivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (erreur) {
    return (erreur as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Le pid d'un autre process qui tient déjà la place ; `undefined` si elle est libre — fichier absent, illisible, ou d'un
// process mort. Un fichier qu'on ne lit pas est une place libre : il est réécrit avec le pid de ce process.
export function tenuePar(fichier: string, soi: number = process.pid): number | undefined {
  let pid = 0;
  try {
    pid = Number(readFileSync(fichier, "utf8").trim());
  } catch {
    pid = 0;
  }
  return Number.isInteger(pid) && pid > 0 && pid !== soi && vivant(pid) ? pid : undefined;
}

// Prend la place si elle est libre ; rend le pid de celui qui la tient sinon.
export function prendreLaPlace(fichier: string, soi: number = process.pid): number | undefined {
  const tenant = tenuePar(fichier, soi);
  if (tenant !== undefined) return tenant;
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, String(soi));
  return undefined;
}
