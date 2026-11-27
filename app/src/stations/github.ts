// Les gists des stations, lus et écrits par le `gh` du poste — celui du chef :
// c'est le seul canal entre l'app et ses stations. L'app ne joint aucune
// station directement, par aucun chemin : elle lit sur GitHub ce que chacune y a
// écrit, et y écrit l'appairage.
import { execFile, type ExecFileException } from "node:child_process";
import { porteLaTrace } from "../telephone-connecte.ts";
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
  // Retire ce fichier du gist, sans toucher aux autres.
  supprimer(id: string, fichier: string): Promise<void>;
  // Vrai : un gist du compte porte la trace d'un téléphone connecté (#3303, telephone-connecte.ts). Lève quand la liste ne se lit pas.
  telephone?(): Promise<boolean>;
  // Quand GitHub rend les appels du compte, une fois sa limite atteinte — lu sans en dépenser un —, ou null s'il ne le dit pas.
  reprise?(): Promise<string | null>;
};

// Une page de la liste des gists, au plus : au-delà, GitHub coupe.
const PAR_PAGE = 100;
const PAGES_MAX = 30;
const ABSENT = /\(HTTP 404\)/;
// La ligne où `gh` nomme la permission qui manque au compte.
const PORTEE = /[^\n]*needs the "[\w:]+" scope[^\n]*/;

class Absent extends Error {}

// Ce qu'un `gh` en échec a dit, en une ligne.
function echec(reglages: Reglages, erreur: ExecFileException, erreurs: string): string {
  if (erreur.code === "ENOENT") return `\`${reglages.gh}\` is not on this computer: the app reads its stations on GitHub with your own \`gh\``;
  if (erreur.killed === true) return `GitHub gave no answer within ${Math.round(reglages.delaiMs / 1000)} s`;
  return erreurs.trim().split("\n").at(-1) || erreur.message;
}

export function githubDesStations(reglages: Reglages): GitHubDesStations {
  const appeler = (args: string[], entree?: unknown): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      const enfant = execFile(reglages.gh, ["api", ...args], { windowsHide: true, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre(sortie);
        // Un 404 qui dit la permission qui manque (« needs the "gist" scope ») n'est pas un gist disparu : sa phrase reste.
        const portee = erreurs.match(PORTEE)?.[0].trim();
        if (ABSENT.test(erreurs) && portee === undefined) return rejeter(new Absent());
        rejeter(new Error(portee ?? echec(reglages, erreur, erreurs)));
      });
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(entree === undefined ? "" : JSON.stringify(entree));
    });

  // Une lecture sous condition (#4408) : relue, elle part avec l'ETag de la dernière, et GitHub répond 304 — un appel
  // qu'il ne compte pas — tant que rien n'a changé. L'app relisait toutes les 30 s chaque gist de station, morte ou
  // vive, et leur liste : ~1 100 appels comptés par heure sur le quota du compte. `gh` sort en erreur sur un 304, mais
  // écrit la réponse : son statut se lit dans la sortie.
  const gardees = new Map<string, { etag: string; corps: string }>();
  const lire = (chemin: string): Promise<string> =>
    new Promise((resoudre, rejeter) => {
      const gardee = gardees.get(chemin);
      const condition = gardee === undefined ? [] : ["-H", `If-None-Match: ${gardee.etag}`];
      execFile(reglages.gh, ["api", "-i", ...condition, chemin], { windowsHide: true, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) => {
        const fin = sortie.search(/\r?\n\r?\n/);
        const tete = fin === -1 ? sortie : sortie.slice(0, fin);
        const statut = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(tete)?.[1]);
        if (statut === 304 && gardee !== undefined) return resoudre(gardee.corps);
        if (erreur === null) {
          const corps = fin === -1 ? "" : sortie.slice(fin).replace(/^\r?\n\r?\n/, "");
          const etag = /^etag:\s*(.+?)\s*$/im.exec(tete)?.[1];
          if (etag === undefined) gardees.delete(chemin);
          else gardees.set(chemin, { etag, corps });
          return resoudre(corps);
        }
        const portee = erreurs.match(PORTEE)?.[0].trim();
        if (ABSENT.test(erreurs) && portee === undefined) return rejeter(new Absent());
        rejeter(new Error(portee ?? echec(reglages, erreur, erreurs)));
      });
    });

  const patcher = async (id: string, files: Record<string, { content: string } | null>) => {
    try {
      await appeler(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files });
    } catch (erreur) {
      if (erreur instanceof Absent) throw new Error("this station's gist is no longer on GitHub");
      throw erreur;
    }
  };

  return {
    async lister() {
      const gists: GistDeStation[] = [];
      for (let page = 1; page <= PAGES_MAX; page++) {
        const lus = JSON.parse(await lire(`/gists?per_page=${PAR_PAGE}&page=${page}`)) as Array<{ id?: unknown; updated_at?: unknown; files?: Record<string, unknown> }>;
        if (!Array.isArray(lus)) throw new Error("the list of your gists is not what GitHub returns");
        for (const { id, updated_at, files } of lus) {
          if (typeof id !== "string" || files === undefined || !(FICHIER_STATION in files)) continue;
          gists.push({ id, misAJour: typeof updated_at === "string" ? updated_at : "", appairee: FICHIER_APPAIRAGE in files });
        }
        if (lus.length < PAR_PAGE) break;
      }
      return gists;
    },
    async telephone() {
      for (let page = 1; page <= PAGES_MAX; page++) {
        const lus = JSON.parse(await lire(`/gists?per_page=${PAR_PAGE}&page=${page}`)) as unknown[];
        if (!Array.isArray(lus)) throw new Error("the list of your gists is not what GitHub returns");
        if (lus.some(porteLaTrace)) return true;
        if (lus.length < PAR_PAGE) return false;
      }
      return false;
    },
    async lire(id) {
      let sortie: string;
      try {
        sortie = await lire(`/gists/${encodeURIComponent(id)}`);
      } catch (erreur) {
        if (erreur instanceof Absent) return null;
        throw erreur;
      }
      const files = (JSON.parse(sortie) as { files?: Record<string, { content?: unknown } | null> }).files ?? {};
      return Object.fromEntries(Object.entries(files).flatMap(([nom, fichier]) => (typeof fichier?.content === "string" ? [[nom, fichier.content]] : [])));
    },
    async reprise() {
      const lu = JSON.parse(await appeler(["/rate_limit"])) as { resources?: { core?: { reset?: unknown; remaining?: unknown } } };
      const reset = lu.resources?.core?.reset;
      return typeof reset === "number" && Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null;
    },
    async ecrire(id, fichiers) {
      await patcher(id, Object.fromEntries(Object.entries(fichiers).map(([nom, content]) => [nom, { content }])));
    },
    async supprimer(id, fichier) {
      await patcher(id, { [fichier]: null });
    },
  };
}
