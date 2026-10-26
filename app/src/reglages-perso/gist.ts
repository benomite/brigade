// Le gist des préférences du chef : un gist secret de son propre compte, lu et écrit par le `gh` du
// poste — celui des gists des stations (../stations/github.ts), avec la même authentification et
// les mêmes appels. Il porte un seul fichier, `FICHIER_PREFERENCES`, à quoi on le reconnaît dans la
// liste des gists du compte : un autre appareil du chef le retrouve ainsi, sans rien en savoir d'avance.
import { execFile, type ExecFileException } from "node:child_process";

export const FICHIER_PREFERENCES = "brigade-preferences.json";
export const DESCRIPTION = "brigade — the chef's personal preferences";

export type Reglages = { gh: string; delaiMs: number };

export type GistDesPreferences = {
  // L'identifiant du gist qui porte le fichier des préférences, ou null si le compte n'en a aucun.
  trouver(): Promise<string | null>;
  // Le contenu du fichier des préférences de ce gist — null si le gist n'existe plus, "" s'il ne porte pas le fichier.
  lire(id: string): Promise<string | null>;
  // Crée le gist, secret, avec ce contenu : rend son identifiant.
  creer(contenu: string): Promise<string>;
  // Réécrit le fichier des préférences du gist — faux si le gist n'existe plus.
  ecrire(id: string, contenu: string): Promise<boolean>;
};

const PAR_PAGE = 100;
const PAGES_MAX = 30;
const ABSENT = /\(HTTP 404\)/;

class Absent extends Error {}

function echec(reglages: Reglages, erreur: ExecFileException, erreurs: string): string {
  if (erreur.code === "ENOENT") return `\`${reglages.gh}\` is not on this machine: the app keeps your preferences on GitHub with your own \`gh\``;
  if (erreur.killed === true) return `GitHub gave no answer within ${Math.round(reglages.delaiMs / 1000)} s`;
  return erreurs.trim().split("\n").at(-1) || erreur.message;
}

export function gistDesPreferences(reglages: Reglages): GistDesPreferences {
  const appeler = (args: string[], entree?: unknown): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      const enfant = execFile(reglages.gh, ["api", ...args], { windowsHide: true, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        if (ABSENT.test(erreurs)) return rejeter(new Absent());
        rejeter(new Error(echec(reglages, erreur, erreurs)));
      });
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(entree === undefined ? "" : JSON.stringify(entree));
    });
  const fichiers = (contenu: string) => ({ [FICHIER_PREFERENCES]: { content: contenu } });

  return {
    async trouver() {
      for (let page = 1; page <= PAGES_MAX; page++) {
        const lus = JSON.parse(await appeler([`/gists?per_page=${PAR_PAGE}&page=${page}`])) as Array<{ id?: unknown; files?: Record<string, unknown> }>;
        if (!Array.isArray(lus)) throw new Error("the list of your gists is not what GitHub returns");
        // Le premier que la liste montre : un seul appareil le crée, celui qui ne l'a pas trouvé.
        const trouve = lus.find(({ id, files }) => typeof id === "string" && files !== undefined && FICHIER_PREFERENCES in files);
        if (trouve !== undefined) return trouve.id as string;
        if (lus.length < PAR_PAGE) break;
      }
      return null;
    },
    async lire(id) {
      let sortie: string;
      try {
        sortie = await appeler([`/gists/${encodeURIComponent(id)}`]);
      } catch (erreur) {
        if (erreur instanceof Absent) return null;
        throw erreur;
      }
      const fichier = (JSON.parse(sortie) as { files?: Record<string, { content?: unknown } | null> }).files?.[FICHIER_PREFERENCES];
      return typeof fichier?.content === "string" ? fichier.content : "";
    },
    async creer(contenu) {
      const rendu = JSON.parse(await appeler(["-X", "POST", "/gists", "--input", "-"], { description: DESCRIPTION, public: false, files: fichiers(contenu) })) as { id?: unknown };
      if (typeof rendu.id !== "string" || rendu.id === "") throw new Error("GitHub created the gist of your preferences without giving its id");
      return rendu.id;
    },
    async ecrire(id, contenu) {
      try {
        await appeler(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files: fichiers(contenu) });
        return true;
      } catch (erreur) {
        if (erreur instanceof Absent) return false;
        throw erreur;
      }
    },
  };
}
