// Les contrôles que `.claude/brigade/gates.sh` joue avant les tests, et donc
// avant la relecture : un motif de renvoi que ce script voit sans elle. Lancé
// à la racine du dépôt, les fichiers que le changement touche sur son entrée
// standard, un par ligne. Sort en 2 quand il a trouvé, et dit, des échecs ; en
// 1 (la trace sur la sortie d'erreur) quand il n'a pu lire ce qu'il juge.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "../../sans-invite.ts";
import { exportsDe, exportsQueSesTestsAppellent } from "./export-que-ses-tests-appellent.ts";

const ZONES = ["runtime", "app"];
const DOSSIERS = ["src", "test", "test-hang-guard"];
const SOURCE = /\.[cm]?[jt]s$/;

// Le code et les tests d'une zone : chemin relatif à la racine → source.
function lireLesZones(racine: string): Map<string, string> {
  const fichiers = new Map<string, string>();
  for (const zone of ZONES) {
    for (const dossier of DOSSIERS) {
      let noms: string[];
      try {
        noms = readdirSync(join(racine, zone, dossier), { recursive: true, encoding: "utf8" });
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw erreur;
      }
      for (const nom of noms) {
        const chemin = [zone, dossier, ...nom.split(/[\\/]/)].join("/");
        if (SOURCE.test(chemin) && !chemin.includes("/node_modules/")) fichiers.set(chemin, readFileSync(join(racine, chemin), "utf8"));
      }
    }
  }
  return fichiers;
}

// Les exports qu'avait un fichier à la souche du changement. Absent de la
// souche (un fichier neuf), il n'en avait aucun : tout export y est neuf.
function exportsALaSouche(racine: string, souche: string, chemin: string): string[] {
  try {
    return exportsDe(execFileSync("git", ["show", `${souche}:${chemin}`], { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return [];
  }
}

// Les fichiers que le changement retire, ceux qu'il déplace compris : sans
// les renommages, `git diff` les nomme, quand la liste des fichiers touchés ne
// donne que leur nouveau chemin.
function retiresDepuis(racine: string, souche: string): string[] {
  return execFileSync("git", ["diff", "--name-only", "--no-renames", "--diff-filter=D", souche], { cwd: racine, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .filter(Boolean);
}

// Le nouveau nom d'un nom déclaré dans un fichier, tel que le renommage du code le donne (scripts/rename-code,
// `newNameOf`) : absent, aucun export n'est vu renommé.
export type NewName = (fichier: string, nom: string) => string;

// Le changement ne répond que de ce qu'il exporte de neuf : un export plus
// ancien dont seuls des tests se servent n'est pas le sien. Un export renommé
// non plus (#4413) : un fichier que le changement touche ou retire l'exportait
// à la souche sous le nom que le renommage traduit en celui-ci.
export function controler(racine: string, touches: readonly string[], souche: string, nouveauNom?: NewName): string[] {
  const fichiers = lireLesZones(racine);
  const anciens = new Map<string, string[]>();
  const ancien = (fichier: string) => anciens.get(fichier) ?? anciens.set(fichier, exportsALaSouche(racine, souche, fichier)).get(fichier) ?? [];
  const renommes = new Set(nouveauNom === undefined ? [] : [...touches, ...retiresDepuis(racine, souche)].flatMap((fichier) => ancien(fichier).map((nom) => nouveauNom(fichier, nom))));
  return exportsQueSesTestsAppellent(fichiers, touches.filter((chemin) => fichiers.has(chemin)))
    .filter(({ fichier, nom }) => !ancien(fichier).includes(nom) && !renommes.has(nom))
    .map(
    ({ fichier, nom, testeurs }) => `export « ${nom} » de ${fichier} : seuls des tests l'importent (${testeurs.join(", ")}) — branche-le à la production, ou retire l'export`,
  );
}

if (import.meta.main) {
  try {
    const touches = readFileSync(0, "utf8").split("\n").filter(Boolean);
    const souche = process.argv[2];
    if (souche === undefined) throw new Error("la souche du changement manque (argument 1)");
    // La table du renommage, là où le dépôt la porte (#4413).
    const table = join(process.cwd(), "scripts", "rename-code", "table.ts");
    const nouveauNom = existsSync(table) ? ((await import(pathToFileURL(table).href)) as { newNameOf: NewName }).newNameOf : undefined;
    const echecs = controler(process.cwd(), touches, souche, nouveauNom);
    for (const echec of echecs) console.error(`FAIL  ${echec}`);
    process.exit(echecs.length === 0 ? 0 : 2);
  } catch (erreur) {
    console.error(`contrôles des gates injouables : ${(erreur as Error).message}`);
    process.exit(1);
  }
}
