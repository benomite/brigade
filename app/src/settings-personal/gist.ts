// Le gist des préférences du chef : un gist secret de son propre compte, lu et écrit par le `gh` du
// poste — celui des gists des stations (../stations/github.ts), avec la même authentification et
// les mêmes appels. Il porte un seul fichier, `FICHIER_PREFERENCES`, à quoi on le reconnaît dans la
// liste des gists du compte : un autre appareil du chef le retrouve ainsi, sans rien en savoir d'avance.
import { execFile, type ExecFileException } from "node:child_process";

export const FILE_PREFERENCES = "brigade-preferences.json";
export const DESCRIPTION = "brigade — the chef's personal preferences";

export type Settings = { gh: string; delaiMs: number };

export type GistOfPreferences = {
  // L'identifiant du gist qui porte le fichier des préférences, ou null si le compte n'en a aucun.
  trouver(): Promise<string | null>;
  // Le contenu du fichier des préférences de ce gist — null si le gist n'existe plus, "" s'il ne porte pas le fichier.
  lire(id: string): Promise<string | null>;
  // Crée le gist, secret, avec ce contenu : rend son identifiant.
  creer(content: string): Promise<string>;
  // Réécrit le fichier des préférences du gist — faux si le gist n'existe plus.
  ecrire(id: string, content: string): Promise<boolean>;
};

const BY_PAGE = 100;
const PAGES_MAX = 30;
const ABSENT = /\(HTTP 404\)/;

class Absent extends Error {}

function failure(settings: Settings, error: ExecFileException, errors: string): string {
  if (error.code === "ENOENT") return `\`${settings.gh}\` is not on this computer: the app keeps your preferences on GitHub with your own \`gh\``;
  if (error.killed === true) return `GitHub gave no answer within ${Math.round(settings.delaiMs / 1000)} s`;
  return errors.trim().split("\n").at(-1) || error.message;
}

export function gistOfPreferences(settings: Settings): GistOfPreferences {
  const call = (args: string[], entry?: unknown): Promise<string> =>
    new Promise((resolve, rejeter) => {
      const child = execFile(settings.gh, ["api", ...args], { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) => {
        if (error === null) return resolve(output);
        if (ABSENT.test(errors)) return rejeter(new Absent());
        rejeter(new Error(failure(settings, error, errors)));
      });
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      child.stdin?.on("error", () => {});
      child.stdin?.end(entry === undefined ? "" : JSON.stringify(entry));
    });
  const files = (content: string) => ({ [FILE_PREFERENCES]: { content: content } });

  return {
    async trouver() {
      for (let page = 1; page <= PAGES_MAX; page++) {
        const readOnes = JSON.parse(await call([`/gists?per_page=${BY_PAGE}&page=${page}`])) as Array<{ id?: unknown; files?: Record<string, unknown> }>;
        if (!Array.isArray(readOnes)) throw new Error("the list of your gists is not what GitHub returns");
        // Le premier que la liste montre : un seul appareil le crée, celui qui ne l'a pas trouvé.
        const finds = readOnes.find(({ id, files }) => typeof id === "string" && files !== undefined && FILE_PREFERENCES in files);
        if (finds !== undefined) return finds.id as string;
        if (readOnes.length < BY_PAGE) break;
      }
      return null;
    },
    async lire(id) {
      let output: string;
      try {
        output = await call([`/gists/${encodeURIComponent(id)}`]);
      } catch (error) {
        if (error instanceof Absent) return null;
        throw error;
      }
      const file = (JSON.parse(output) as { files?: Record<string, { content?: unknown } | null> }).files?.[FILE_PREFERENCES];
      return typeof file?.content === "string" ? file.content : "";
    },
    async creer(content) {
      const rendered = JSON.parse(await call(["-X", "POST", "/gists", "--input", "-"], { description: DESCRIPTION, public: false, files: files(content) })) as { id?: unknown };
      if (typeof rendered.id !== "string" || rendered.id === "") throw new Error("GitHub created the gist of your preferences without giving its id");
      return rendered.id;
    },
    async ecrire(id, content) {
      try {
        await call(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files: files(content) });
        return true;
      } catch (error) {
        if (error instanceof Absent) return false;
        throw error;
      }
    },
  };
}
