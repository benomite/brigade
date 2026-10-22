// Le seul canal de la station vers l'app : un gist secret du compte GitHub de
// la machine, lu et écrit par `gh api` — celui de la machine, qui
// s'authentifie seul. La station n'ouvre aucun port et ne joint aucune autre
// machine : ce qu'elle a à dire, elle l'écrit là.
import { execFile } from "../sans-invite.ts";
import { decouper } from "../github.ts";
import { constaterLimite, COMPTE_DE_LA_MACHINE, limiteDuProcess, noterLesEntetes, PROJET_DE_LA_STATION, prendreUnAppel, refusPourLimite, type Limite, type ReponseHttp } from "../limite-github.ts";

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

// `limite` : le compteur que prend chaque `gh api`, réglé sur le quota réel du
// compte — par défaut, celui du process (`limite-github.ts`).
export type OptionsCanal = { gh: string; delaiMs?: number; limite?: Limite; maintenant?: () => number };

// `gh` sort en erreur sur toute réponse qui n'est pas un succès, et le dit sur
// sa sortie d'erreur : « gh: Not Found (HTTP 404) ».
const ABSENT = /\(HTTP 404\)/;

class Absent extends Error {}

export function canalGitHub(options: OptionsCanal): Canal {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  const appeler = async (args: string[], entree?: unknown): Promise<string> => {
    // Un appel que le quota réel retient ne part pas.
    const limite = options.limite ?? limiteDuProcess();
    await prendreUnAppel(limite, { etiquette: { projet: PROJET_DE_LA_STATION, lecture: "gist" }, gh: options.gh, env: async () => env, maintenant: options.maintenant });
    return new Promise((resoudre, rejeter) => {
      const enfant = execFile(
        options.gh,
        // `-i` : les en-têtes disent, à une limite atteinte, quand la fenêtre se ferme.
        ["api", "-i", ...args],
        { timeout: options.delaiMs ?? 30_000, maxBuffer: 16 * 1024 * 1024, env },
        (erreur, sortie, erreurs) => {
          const reponse = decouper(sortie);
          if (reponse) noterLesEntetes(limite, COMPTE_DE_LA_MACHINE, reponse.entetes);
          if (erreur === null) return resoudre(reponse?.corps ?? sortie);
          // Sans en-têtes lisibles, le statut de la sortie d'erreur de `gh` suffit à reconnaître la limite.
          const statut = reponse?.statut ?? Number(/\(HTTP (\d{3})\)/.exec(erreurs)?.[1] ?? 0);
          const refus: ReponseHttp = { statut, entetes: reponse?.entetes ?? new Map(), corps: reponse?.corps || erreurs };
          if (refusPourLimite(refus)) return void constaterLimite(limite, refus, { gh: options.gh, env, maintenant: options.maintenant }).then(rejeter, rejeter);
          if (ABSENT.test(erreurs)) return rejeter(new Absent());
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
