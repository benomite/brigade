// Les gists des stations, lus et écrits par le `gh` du poste — celui du chef :
// c'est le seul canal entre l'app et ses stations. L'app ne joint aucune
// station directement, par aucun chemin : elle lit sur GitHub ce que chacune y a
// écrit, et y écrit l'appairage.
import { execFile, type ExecFileException } from "node:child_process";
import { FILE_PAIRING, FILE_STATION } from "./document.ts";

export type Settings = { gh: string; delaiMs: number };

// Un gist de station, tel que la liste du compte le montre : sans son contenu.
export type GistOfStation = { id: string; misAJour: string; appairee: boolean };

export type Files = Record<string, string>;

export type GitHubOfStations = {
  // Les gists du compte qui portent l'état d'une station.
  lister(): Promise<GistOfStation[]>;
  // Les fichiers d'un gist, ou null s'il n'existe plus.
  lire(id: string): Promise<Files | null>;
  // Réécrit ces fichiers du gist, sans toucher aux autres.
  ecrire(id: string, files: Files): Promise<void>;
  // Retire ce fichier du gist, sans toucher aux autres.
  supprimer(id: string, file: string): Promise<void>;
  // Quand GitHub rend les appels du compte, une fois sa limite atteinte — lu sans en dépenser un —, ou null s'il ne le dit pas.
  reprise?(): Promise<string | null>;
};

// Une page de la liste des gists, au plus : au-delà, GitHub coupe.
const BY_PAGE = 100;
const PAGES_MAX = 30;
const ABSENT = /\(HTTP 404\)/;
// La ligne où `gh` nomme la permission qui manque au compte.
const SCOPE = /[^\n]*needs the "[\w:]+" scope[^\n]*/;

class Absent extends Error {}

// Ce qu'un `gh` en échec a dit, en une ligne.
function failure(settings: Settings, error: ExecFileException, errors: string): string {
  if (error.code === "ENOENT") return `\`${settings.gh}\` is not on this computer: the app reads its stations on GitHub with your own \`gh\``;
  if (error.killed === true) return `GitHub gave no answer within ${Math.round(settings.delaiMs / 1000)} s`;
  return errors.trim().split("\n").at(-1) || error.message;
}

export function githubOfStations(settings: Settings): GitHubOfStations {
  const call = (args: string[], entry?: unknown): Promise<string> =>
    new Promise((resolve, rejeter) => {
      const child = execFile(settings.gh, ["api", ...args], { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) => {
        if (error === null) return resolve(output);
        // Un 404 qui dit la permission qui manque (« needs the "gist" scope ») n'est pas un gist disparu : sa phrase reste.
        const scope = errors.match(SCOPE)?.[0].trim();
        if (ABSENT.test(errors) && scope === undefined) return rejeter(new Absent());
        rejeter(new Error(scope ?? failure(settings, error, errors)));
      });
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      child.stdin?.on("error", () => {});
      child.stdin?.end(entry === undefined ? "" : JSON.stringify(entry));
    });

  // Une lecture sous condition (#4408) : relue, elle part avec l'ETag de la dernière, et GitHub répond 304 — un appel
  // qu'il ne compte pas — tant que rien n'a changé. L'app relisait toutes les 30 s chaque gist de station, morte ou
  // vive, et leur liste : ~1 100 appels comptés par heure sur le quota du compte. `gh` sort en erreur sur un 304, mais
  // écrit la réponse : son statut se lit dans la sortie.
  const kept = new Map<string, { etag: string; corps: string }>();
  const read = (path: string): Promise<string> =>
    new Promise((resolve, rejeter) => {
      const keptOne = kept.get(path);
      const condition = keptOne === undefined ? [] : ["-H", `If-None-Match: ${keptOne.etag}`];
      execFile(settings.gh, ["api", "-i", ...condition, path], { windowsHide: true, timeout: settings.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (error, output, errors) => {
        const end = output.search(/\r?\n\r?\n/);
        const head = end === -1 ? output : output.slice(0, end);
        const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(head)?.[1]);
        if (status === 304 && keptOne !== undefined) return resolve(keptOne.corps);
        if (error === null) {
          const body = end === -1 ? "" : output.slice(end).replace(/^\r?\n\r?\n/, "");
          const etag = /^etag:\s*(.+?)\s*$/im.exec(head)?.[1];
          if (etag === undefined) kept.delete(path);
          else kept.set(path, { etag, corps: body });
          return resolve(body);
        }
        const scope = errors.match(SCOPE)?.[0].trim();
        if (ABSENT.test(errors) && scope === undefined) return rejeter(new Absent());
        rejeter(new Error(scope ?? failure(settings, error, errors)));
      });
    });

  const patcher = async (id: string, files: Record<string, { content: string } | null>) => {
    try {
      await call(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files });
    } catch (error) {
      if (error instanceof Absent) throw new Error("this station's gist is no longer on GitHub");
      throw error;
    }
  };

  return {
    async lister() {
      const gists: GistOfStation[] = [];
      for (let page = 1; page <= PAGES_MAX; page++) {
        const readOnes = JSON.parse(await read(`/gists?per_page=${BY_PAGE}&page=${page}`)) as Array<{ id?: unknown; updated_at?: unknown; files?: Record<string, unknown> }>;
        if (!Array.isArray(readOnes)) throw new Error("the list of your gists is not what GitHub returns");
        for (const { id, updated_at, files } of readOnes) {
          if (typeof id !== "string" || files === undefined || !(FILE_STATION in files)) continue;
          gists.push({ id, misAJour: typeof updated_at === "string" ? updated_at : "", appairee: FILE_PAIRING in files });
        }
        if (readOnes.length < BY_PAGE) break;
      }
      return gists;
    },
    async lire(id) {
      let output: string;
      try {
        output = await read(`/gists/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error instanceof Absent) return null;
        throw error;
      }
      const files = (JSON.parse(output) as { files?: Record<string, { content?: unknown } | null> }).files ?? {};
      return Object.fromEntries(Object.entries(files).flatMap(([name, file]) => (typeof file?.content === "string" ? [[name, file.content]] : [])));
    },
    async reprise() {
      const readOne = JSON.parse(await call(["/rate_limit"])) as { resources?: { core?: { reset?: unknown; remaining?: unknown } } };
      const reset = readOne.resources?.core?.reset;
      return typeof reset === "number" && Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null;
    },
    async ecrire(id, files) {
      await patcher(id, Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }])));
    },
    async supprimer(id, file) {
      await patcher(id, { [file]: null });
    },
  };
}
