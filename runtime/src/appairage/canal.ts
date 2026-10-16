// Le seul canal de la station vers l'app : un gist secret du compte GitHub de
// la machine, lu et écrit par `gh api` — celui de la machine, qui
// s'authentifie seul. La station n'ouvre aucun port et ne joint aucune autre
// machine : ce qu'elle a à dire, elle l'écrit là.
import { execFile } from "node:child_process";
import { estLimite, type Limite, LimiteAtteinte, limiteDuCompte } from "../limite-github.ts";

export type Fichiers = Record<string, string>;

export type Canal = {
  // Un gist secret neuf : rend son identifiant.
  creer(description: string, fichiers: Fichiers): Promise<string>;
  // Réécrit ces fichiers du gist, sans toucher aux autres. `absent` : le gist
  // n'existe plus — le chef l'a supprimé.
  ecrire(id: string, fichiers: Fichiers): Promise<"ecrit" | "absent">;
  // Les fichiers du gist, ou null s'il n'existe plus.
  lire(id: string): Promise<Fichiers | null>;
};

export type OptionsCanal = { gh: string; delaiMs?: number; limite?: Limite };

// `gh` sort en erreur sur toute réponse qui n'est pas un succès, et le dit sur
// sa sortie d'erreur : « gh: Not Found (HTTP 404) ».
const ABSENT = /\(HTTP 404\)/;
const STATUT = /\(HTTP (\d{3})\)/;

class Absent extends Error {}

export function canalGitHub(options: OptionsCanal): Canal {
  const limite = options.limite ?? limiteDuCompte;
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  // La fin de la fenêtre, telle que GitHub la dit. Cet appel-là ne compte pas
  // dans la limite. Null si GitHub ne la dit pas.
  const finDeFenetre = (): Promise<number | null> =>
    new Promise((resoudre) => {
      execFile(options.gh, ["api", "rate_limit", "--jq", ".resources.core.reset"], { timeout: options.delaiMs ?? 30_000, env }, (erreur, sortie) => {
        const reset = Number(sortie.trim());
        resoudre(erreur === null && sortie.trim() !== "" && Number.isFinite(reset) ? reset : null);
      });
    });
  const appeler = (args: string[], entree?: unknown): Promise<string> => {
    // Limite atteinte : on attend la fin de la fenêtre, sans rien demander à GitHub.
    const attente = limite.dire();
    if (attente !== null) return Promise.reject(new LimiteAtteinte(attente));
    limite.compter();
    return new Promise((resoudre, rejeter) => {
      const enfant = execFile(
        options.gh,
        ["api", ...args],
        { timeout: options.delaiMs ?? 30_000, maxBuffer: 16 * 1024 * 1024, env },
        (erreur, sortie, erreurs) => {
          if (erreur === null) return resoudre(sortie);
          if (ABSENT.test(erreurs)) return rejeter(new Absent());
          if (estLimite(Number(STATUT.exec(erreurs)?.[1] ?? 0), erreurs)) {
            return void finDeFenetre().then((reset) => {
              limite.atteinte(reset);
              rejeter(new LimiteAtteinte(limite.dire() ?? "GitHub limite les appels"));
            });
          }
          const dit = erreurs.trim().split("\n").at(-1) ?? "";
          rejeter(new Error(`gh api ${args.filter((arg) => arg.startsWith("/")).join(" ")} : ${dit || erreur.message}`));
        },
      );
      // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
      enfant.stdin?.on("error", () => {});
      enfant.stdin?.end(entree === undefined ? "" : JSON.stringify(entree));
    });
  };
  const contenus = (fichiers: Fichiers) => Object.fromEntries(Object.entries(fichiers).map(([nom, content]) => [nom, { content }]));

  return {
    async creer(description, fichiers) {
      const rendu = JSON.parse(await appeler(["-X", "POST", "/gists", "--input", "-"], { description, public: false, files: contenus(fichiers) })) as { id?: unknown };
      if (typeof rendu.id !== "string" || rendu.id === "") throw new Error("gh api /gists : la création n'a pas rendu d'identifiant");
      return rendu.id;
    },
    async ecrire(id, fichiers) {
      try {
        await appeler(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files: contenus(fichiers) });
        return "ecrit";
      } catch (erreur) {
        if (erreur instanceof Absent) return "absent";
        throw erreur;
      }
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
  };
}
