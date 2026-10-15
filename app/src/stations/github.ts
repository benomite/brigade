// Les gists des stations, lus et écrits par le `gh` du poste — celui du chef :
// c'est le seul canal entre l'app et ses stations. L'app ne joint aucune
// station directement, par aucun chemin : elle lit sur GitHub ce que chacune y a
// écrit, et y écrit l'appairage.
import { execFile, type ExecFileException } from "node:child_process";
import { FICHIER_APPAIRAGE, FICHIER_STATION } from "./document.ts";

export type Reglages = { gh: string; delaiMs: number };

// Un gist de station, tel que la liste du compte le montre : sans son contenu.
export type GistDeStation = { id: string; misAJour: string; appairee: boolean };

export type Fichiers = Record<string, string>;

export type GitHubDesStations = {
  // Les gists du compte qui portent l'état d'une station.
  lister(): Promise<GistDeStation[]>;
  // Les fichiers d'un gist, ou null s'il n'existe plus.
  lire(id: string): Promise<Fichiers | null>;
  // Réécrit ces fichiers du gist, sans toucher aux autres.
  ecrire(id: string, fichiers: Fichiers): Promise<void>;
};

// Une page de la liste des gists, au plus : au-delà, GitHub coupe.
const PAR_PAGE = 100;
const PAGES_MAX = 30;
const ABSENT = /\(HTTP 404\)/;

class Absent extends Error {}

// Ce qu'un `gh` en échec a dit, en une ligne.
function echec(reglages: Reglages, erreur: ExecFileException, erreurs: string): string {
  if (erreur.code === "ENOENT") return `\`${reglages.gh}\` is not on this machine: the app reads its stations on GitHub with your own \`gh\``;
  if (erreur.killed === true) return `GitHub gave no answer within ${Math.round(reglages.delaiMs / 1000)} s`;
  return erreurs.trim().split("\n").at(-1) || erreur.message;
}

export function githubDesStations(reglages: Reglages): GitHubDesStations {
  const appeler = (args: string[], entree?: unknown): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      const enfant = execFile(reglages.gh, ["api", ...args], { timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        if (ABSENT.test(erreurs)) return rejeter(new Absent());
        rejeter(new Error(echec(reglages, erreur, erreurs)));
      });
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(entree === undefined ? "" : JSON.stringify(entree));
    });

  return {
    async lister() {
      const gists: GistDeStation[] = [];
      for (let page = 1; page <= PAGES_MAX; page++) {
        const lus = JSON.parse(await appeler([`/gists?per_page=${PAR_PAGE}&page=${page}`])) as Array<{ id?: unknown; updated_at?: unknown; files?: Record<string, unknown> }>;
        if (!Array.isArray(lus)) throw new Error("the list of your gists is not what GitHub returns");
        for (const { id, updated_at, files } of lus) {
          if (typeof id !== "string" || files === undefined || !(FICHIER_STATION in files)) continue;
          gists.push({ id, misAJour: typeof updated_at === "string" ? updated_at : "", appairee: FICHIER_APPAIRAGE in files });
        }
        if (lus.length < PAR_PAGE) break;
      }
      return gists;
    },
    async lire(id) {
      let sortie: string;
      try {
        sortie = await appeler([`/gists/${encodeURIComponent(id)}`]);
      } catch (erreur) {
        if (erreur instanceof Absent) return null;
        throw erreur;
      }
      const files = (JSON.parse(sortie) as { files?: Record<string, { content?: unknown } | null> }).files ?? {};
      return Object.fromEntries(Object.entries(files).flatMap(([nom, fichier]) => (typeof fichier?.content === "string" ? [[nom, fichier.content]] : [])));
    },
    async ecrire(id, fichiers) {
      try {
        await appeler(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files: Object.fromEntries(Object.entries(fichiers).map(([nom, content]) => [nom, { content }])) });
      } catch (erreur) {
        if (erreur instanceof Absent) throw new Error("this station's gist is no longer on GitHub");
        throw erreur;
      }
    },
  };
}
