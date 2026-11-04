// Une archive de la station, posée en release prête à relancer : extraite par
// `tar` — celui de macOS, et celui de Windows, qui lit aussi un zip —, puis
// vérifiée. Une release est prête quand son runtime dit la version attendue
// (son `package.json`, que la construction du paquet écrit) et porte le point
// d'entrée de la station. C'est le seul module de la mise à jour de la
// station qui lance un programme.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { comparerVersions } from "../mise-a-jour/versions.ts";
import { execFile } from "../sans-invite.ts";

// Ce qu'une archive porte, à sa racine : le runtime.
export const RUNTIME = "runtime";
// Le point d'entrée de la station, dans le runtime : celui que l'app lance.
export const POINT_D_ENTREE = join("src", "station", "main.ts");

const DELAI_MS = 10 * 60_000;

export type Extraire = (archive: string, dossier: string) => Promise<void>;

export const extraireParTar: Extraire = (archive, dossier) =>
  new Promise((resoudre, rejeter) => {
    mkdirSync(dossier, { recursive: true });
    execFile("tar", ["-xf", archive, "-C", dossier], { encoding: "utf8", timeout: DELAI_MS }, (erreur, _sortie, erreurs) => {
      if (erreur === null) return resoudre();
      const ligne = String(erreurs).trim().split("\n").at(-1)?.slice(0, 200);
      rejeter(new Error(`the archive does not extract: ${ligne || erreur.message}`));
    });
  });

// La version que dit le runtime extrait dans `dossier`, ou pourquoi il n'est
// pas celui de `version`.
export function verifierRelease(dossier: string, version: string): string | null {
  const runtime = join(dossier, RUNTIME);
  let lue: unknown;
  try {
    lue = (JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")) as { version?: unknown }).version;
  } catch {
    return `it carries no readable ${RUNTIME}/package.json`;
  }
  if (typeof lue !== "string" || comparerVersions(lue, version) !== 0) return `its runtime says version ${typeof lue === "string" ? lue.slice(0, 80) : "none"}, not ${version}`;
  if (!existsSync(join(runtime, POINT_D_ENTREE))) return `its runtime carries no ${POINT_D_ENTREE.replaceAll("\\", "/")}`;
  return null;
}
