// Le sondage de GitHub : les issues du dépôt qui portent le label `fire`.
// Seul module qui lance `gh` — c'est lui qui porte l'authentification, le
// runtime ne lit aucun jeton.
import { execFile } from "node:child_process";

// Le label par lequel une issue entre sur le rail.
export const LABEL = "fire";

export type Issue = {
  number: number;
  title: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  // Change à chaque modification de l'issue : c'est lui qui distingue deux
  // faits successifs sur le même ticket.
  updatedAt: string;
  url: string;
};

export type Sondage =
  // GitHub répond que rien n'a changé depuis le dernier sondage confirmé.
  | { inchange: true }
  // `confirmer` : à appeler une fois la liste entièrement reportée sur le
  // rail. Sans cela, le sondage suivant la redemande en entier.
  | { inchange: false; issues: Issue[]; confirmer(): void };

export type GitHub = {
  // Les issues ouvertes qui portent le label, PR écartées.
  tickets(): Promise<Sondage>;
  // Une issue, ou null si elle n'existe plus.
  issue(numero: number): Promise<Issue | null>;
  // Poste un commentaire sur une issue.
  commenter(numero: number, corps: string): Promise<void>;
  // Ouvre une PR de `branche` vers `base` ; rend son adresse.
  ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }): Promise<string>;
  // Abandonne les requêtes en cours.
  fermer(): void;
};

export type OptionsGitHub = {
  // `<owner>/<repo>`
  depot: string;
  // Le binaire `gh`. Surchargé par les tests, jamais sur la box.
  bin?: string;
  delaiMs?: number;
};

type Reponse = { statut: number; entetes: Map<string, string>; corps: string };

type IssueBrute = {
  number: number;
  title: string;
  labels: Array<string | { name: string }>;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
};

function lire(brute: IssueBrute): Issue {
  return {
    number: brute.number,
    title: brute.title,
    labels: brute.labels.map((label) => (typeof label === "string" ? label : label.name)),
    state: brute.state,
    createdAt: brute.created_at,
    updatedAt: brute.updated_at,
    url: brute.html_url,
  };
}

// `gh api -i` imprime la ligne de statut, les en-têtes, une ligne vide, puis
// le corps. Rend null si la sortie ne commence pas par une réponse HTTP.
function decouper(sortie: string): Reponse | null {
  const [tete = "", ...reste] = sortie.split(/\r?\n\r?\n/);
  const [statut = "", ...lignes] = tete.split(/\r?\n/);
  const code = /^HTTP\/\S+ (\d{3})/.exec(statut)?.[1];
  if (!code) return null;
  const entetes = new Map<string, string>();
  for (const ligne of lignes) {
    const separateur = ligne.indexOf(":");
    if (separateur > 0) entetes.set(ligne.slice(0, separateur).toLowerCase(), ligne.slice(separateur + 1).trim());
  }
  return { statut: Number(code), entetes, corps: reste.join("\n\n") };
}

export function ouvrirGitHub(options: OptionsGitHub): GitHub {
  const { depot } = options;
  const bin = options.bin ?? "gh";
  const abandon = new AbortController();
  // Cache, pas état : le perdre coûte une requête pleine, rien de plus.
  let etag: string | null = null;

  // Une réponse HTTP, quel que soit son statut. `gh` sort en erreur sur un 304
  // ou un 404 : c'est la réponse qui fait foi, pas le code de sortie.
  const appeler = (args: string[]): Promise<Reponse> =>
    new Promise((resoudre, rejeter) => {
      execFile(
        bin,
        ["api", "-i", ...args],
        { maxBuffer: 64 * 1024 * 1024, timeout: options.delaiMs ?? 30_000, signal: abandon.signal },
        (erreur, stdout, stderr) => {
          const reponse = decouper(stdout);
          if (reponse) resoudre(reponse);
          else rejeter(new Error(`gh api ${args.at(-1)} : ${stderr.trim() || erreur?.message || "réponse illisible"}`));
        },
      );
    });

  const exiger = (reponse: Reponse, chemin: string, attendu = 200): Reponse => {
    if (reponse.statut !== attendu) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
    return reponse;
  };

  // Une création. `-f` passe chaque champ tel quel : rien n'y est interprété.
  const creer = async (chemin: string, champs: Record<string, string>): Promise<Reponse> => {
    const args = Object.entries(champs).flatMap(([nom, valeur]) => ["-f", `${nom}=${valeur}`]);
    return exiger(await appeler(["-X", "POST", ...args, chemin]), chemin, 201);
  };

  return {
    async tickets() {
      const chemin = `repos/${depot}/issues?labels=${LABEL}&state=open&per_page=100`;
      const premiere = await appeler([...(etag ? ["-H", `If-None-Match: ${etag}`] : []), chemin]);
      if (premiere.statut === 304) return { inchange: true };
      etag = null;
      const pages = [exiger(premiere, chemin)];
      for (let suivante = pageSuivante(premiere); suivante; suivante = pageSuivante(pages.at(-1))) {
        pages.push(exiger(await appeler([suivante]), suivante));
      }
      const issues = pages
        .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
        .filter((brute) => brute.pull_request === undefined)
        .map(lire);
      // Au-delà d'une page, un changement en page 2 ne se verrait pas dans
      // l'ETag de la première : le sondage reste alors inconditionnel.
      const empreinte = pages.length === 1 ? (premiere.entetes.get("etag") ?? null) : null;
      return { inchange: false, issues, confirmer: () => void (etag = empreinte) };
    },
    async issue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      const reponse = await appeler([chemin]);
      if (reponse.statut === 404 || reponse.statut === 410) return null;
      return lire(JSON.parse(exiger(reponse, chemin).corps) as IssueBrute);
    },
    async commenter(numero, corps) {
      await creer(`repos/${depot}/issues/${numero}/comments`, { body: corps });
    },
    async ouvrirPR({ branche, base, titre, corps }) {
      const reponse = await creer(`repos/${depot}/pulls`, { title: titre, head: branche, base, body: corps });
      const url = (JSON.parse(reponse.corps) as { html_url?: unknown }).html_url;
      if (typeof url !== "string" || url === "") throw new Error(`gh api repos/${depot}/pulls : PR créée sans adresse`);
      return url;
    },
    fermer: () => abandon.abort(),
  };
}

function pageSuivante(page: Reponse | undefined): string | null {
  return /<([^>]+)>;\s*rel="next"/.exec(page?.entetes.get("link") ?? "")?.[1] ?? null;
}
