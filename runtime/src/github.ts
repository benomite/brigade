// GitHub vu du runtime : le sondage des issues qui portent le label `fire`,
// celui des issues ouvertes que le manager qualifie, et ce que le manager, la
// station et la pass y lisent et y écrivent — labels, commentaires, PR, CI,
// merge. Seul module qui lance `gh` — c'est lui qui porte l'authentification, le
// runtime ne lit aucun jeton.
import { execFile } from "node:child_process";
import type { Check } from "./evenements/pass.ts";

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
  // Une PR, que l'API des issues rend comme une issue. Une PR n'est jamais un
  // ticket.
  pr?: true;
};

// Une issue telle que le manager la juge : avec son corps, et le lien de son
// auteur avec le dépôt, tel que GitHub le nomme (`OWNER`, `MEMBER`, `NONE`…).
export type IssueOuverte = Issue & { body: string; association: string };

export type Sondage<I extends Issue = Issue> =
  // GitHub répond que rien n'a changé depuis le dernier sondage confirmé.
  | { inchange: true }
  // `confirmer` : à appeler une fois la liste entièrement traitée. Sans cela,
  // le sondage suivant la redemande en entier.
  | { inchange: false; issues: I[]; confirmer(): void };

// Un commentaire d'issue. `association` : le lien de son auteur avec le dépôt,
// tel que GitHub le nomme (`OWNER`, `MEMBER`, `COLLABORATOR`, `NONE`…).
export type Commentaire = { body: string; author: string; association: string };

// Une PR telle que la pass la lit. `mergeable` : nul tant que GitHub ne l'a pas
// calculé.
export type PR = { number: number; url: string; base: string; sha: string; state: "open" | "closed"; merged: boolean; mergeable: boolean | null };

// `fait: false` : GitHub a refusé, et dit pourquoi. Une panne — rien ne dit
// alors si le merge a eu lieu — lève.
export type Merge = { fait: true } | { fait: false; motif: string };

export type GitHub = {
  // Les issues ouvertes qui portent le label, PR écartées.
  tickets(): Promise<Sondage>;
  // Toutes les issues ouvertes, quels que soient leurs labels, PR écartées.
  // Un sondage à part, avec sa propre confirmation.
  ouvertes(): Promise<Sondage<IssueOuverte>>;
  // Une issue, avec son corps, ou null si elle n'existe plus.
  issue(numero: number): Promise<(Issue & { body?: string }) | null>;
  // Les commentaires d'une issue, du plus ancien au plus récent.
  commentaires(numero: number): Promise<Commentaire[]>;
  // Poste un commentaire sur une issue.
  commenter(numero: number, corps: string): Promise<void>;
  // Ajoute des labels à une issue, sans toucher à ceux qu'elle porte.
  labelliser(numero: number, labels: string[]): Promise<void>;
  // Ouvre une PR de `branche` vers `base` ; rend son adresse.
  ouvrirPR(pr: { branche: string; base: string; titre: string; corps: string }): Promise<string>;
  // La PR la plus récente dont `branche` est la tête, ou null.
  prDeBranche(branche: string): Promise<PR | null>;
  // Les checks du commit : ses *check runs* et ses statuts.
  ci(sha: string): Promise<Check[]>;
  // Merge la PR, à condition que sa tête soit encore `sha`.
  merger(numero: number, sha: string): Promise<Merge>;
  fermerIssue(numero: number): Promise<void>;
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
  body?: string | null;
  author_association?: string;
};

type CommentaireBrut = { body?: string | null; author_association?: string; user?: { login?: string } | null };

type PRBrute = {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
  base: { ref: string };
  head: { sha: string };
};

type CheckRun = { name: string; status: string; conclusion: string | null; html_url: string | null };
type Statut = { context: string; state: string; target_url: string | null };

// Les conclusions d'un job qui ne sont pas un échec.
const CONCLUSIONS_VERTES = ["success", "neutral", "skipped"];

function lire(brute: IssueBrute): Issue {
  return {
    number: brute.number,
    title: brute.title,
    labels: brute.labels.map((label) => (typeof label === "string" ? label : label.name)),
    state: brute.state,
    createdAt: brute.created_at,
    updatedAt: brute.updated_at,
    url: brute.html_url,
    ...(brute.pull_request === undefined ? {} : { pr: true as const }),
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
  // Cache, pas état : le perdre coûte une requête pleine, rien de plus. Un
  // ETag par liste sondée.
  const etags = new Map<string, string>();

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

  // Une liste, page après page, à partir de sa première réponse.
  const feuilleter = async (premiere: Reponse, chemin: string): Promise<Reponse[]> => {
    const pages = [exiger(premiere, chemin)];
    for (let suivante = pageSuivante(premiere); suivante; suivante = pageSuivante(pages.at(-1))) {
      pages.push(exiger(await appeler([suivante]), suivante));
    }
    return pages;
  };

  // Une liste d'issues, sous l'ETag de sa dernière lecture confirmée.
  const sonder = async <I extends Issue>(chemin: string, lireIssue: (brute: IssueBrute) => I): Promise<Sondage<I>> => {
    const etag = etags.get(chemin);
    const premiere = await appeler([...(etag ? ["-H", `If-None-Match: ${etag}`] : []), chemin]);
    if (premiere.statut === 304) return { inchange: true };
    etags.delete(chemin);
    const pages = await feuilleter(premiere, chemin);
    const issues = pages
      .flatMap((page) => JSON.parse(page.corps) as IssueBrute[])
      .filter((brute) => brute.pull_request === undefined)
      .map(lireIssue);
    // Au-delà d'une page, un changement en page 2 ne se verrait pas dans
    // l'ETag de la première : le sondage reste alors inconditionnel.
    const empreinte = pages.length === 1 ? (premiere.entetes.get("etag") ?? null) : null;
    return { inchange: false, issues, confirmer: () => void (empreinte === null ? etags.delete(chemin) : etags.set(chemin, empreinte)) };
  };

  return {
    tickets: () => sonder(`repos/${depot}/issues?labels=${LABEL}&state=open&per_page=100`, lire),
    ouvertes: () =>
      sonder(`repos/${depot}/issues?state=open&per_page=100`, (brute) => ({
        ...lire(brute),
        body: brute.body ?? "",
        association: brute.author_association ?? "NONE",
      })),
    async issue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      const reponse = await appeler([chemin]);
      if (reponse.statut === 404 || reponse.statut === 410) return null;
      const brute = JSON.parse(exiger(reponse, chemin).corps) as IssueBrute;
      return { ...lire(brute), body: brute.body ?? "" };
    },
    async commentaires(numero) {
      const chemin = `repos/${depot}/issues/${numero}/comments?per_page=100`;
      const pages = await feuilleter(await appeler([chemin]), chemin);
      return pages
        .flatMap((page) => JSON.parse(page.corps) as CommentaireBrut[])
        .map((brut) => ({ body: brut.body ?? "", author: brut.user?.login ?? "", association: brut.author_association ?? "NONE" }));
    },
    async commenter(numero, corps) {
      await creer(`repos/${depot}/issues/${numero}/comments`, { body: corps });
    },
    async labelliser(numero, labels) {
      const chemin = `repos/${depot}/issues/${numero}/labels`;
      exiger(await appeler(["-X", "POST", ...labels.flatMap((label) => ["-f", `labels[]=${label}`]), chemin]), chemin);
    },
    async ouvrirPR({ branche, base, titre, corps }) {
      const reponse = await creer(`repos/${depot}/pulls`, { title: titre, head: branche, base, body: corps });
      const url = (JSON.parse(reponse.corps) as { html_url?: unknown }).html_url;
      if (typeof url !== "string" || url === "") throw new Error(`gh api repos/${depot}/pulls : PR créée sans adresse`);
      return url;
    },
    async prDeBranche(branche) {
      const liste = `repos/${depot}/pulls?head=${depot.split("/")[0]}:${branche}&state=all&per_page=1`;
      const [trouvee] = JSON.parse(exiger(await appeler([liste]), liste).corps) as PRBrute[];
      if (!trouvee) return null;
      // La liste ne dit pas si la PR est mergeable : sa fiche, si.
      const chemin = `repos/${depot}/pulls/${trouvee.number}`;
      const brute = JSON.parse(exiger(await appeler([chemin]), chemin).corps) as PRBrute;
      return {
        number: brute.number,
        url: brute.html_url,
        base: brute.base.ref,
        sha: brute.head.sha,
        state: brute.state,
        merged: brute.merged === true || (brute.merged_at ?? null) !== null,
        mergeable: brute.mergeable ?? null,
      };
    },
    async ci(sha) {
      const jobs = `repos/${depot}/commits/${sha}/check-runs?per_page=100`;
      const statuts = `repos/${depot}/commits/${sha}/status?per_page=100`;
      const [runs, combine] = await Promise.all([appeler([jobs]), appeler([statuts])]);
      const { check_runs = [] } = JSON.parse(exiger(runs, jobs).corps) as { check_runs?: CheckRun[] };
      const { statuses = [] } = JSON.parse(exiger(combine, statuts).corps) as { statuses?: Statut[] };
      return [
        ...check_runs.map((run): Check => {
          const conclusion = run.status === "completed" ? (run.conclusion ?? "inconnue") : run.status;
          const outcome = run.status !== "completed" ? "pending" : CONCLUSIONS_VERTES.includes(conclusion) ? "green" : "red";
          return { name: run.name, outcome, conclusion, url: run.html_url ?? null };
        }),
        ...statuses.map((statut): Check => {
          const outcome = statut.state === "success" ? "green" : statut.state === "pending" ? "pending" : "red";
          return { name: statut.context, outcome, conclusion: statut.state, url: statut.target_url ?? null };
        }),
      ];
    },
    async merger(numero, sha) {
      const chemin = `repos/${depot}/pulls/${numero}/merge`;
      const reponse = await appeler(["-X", "PUT", "-f", `sha=${sha}`, "-f", "merge_method=merge", chemin]);
      if (reponse.statut === 200) return { fait: true };
      // Un refus (4xx) est une réponse : rien n'a été mergé — 405, non mergeable
      // (conflit, protection) ; 409, la tête a bougé ; 403, pas le droit. Tout
      // autre statut ne dit rien du merge.
      if (reponse.statut < 400 || reponse.statut >= 500) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
      let motif: unknown;
      try {
        motif = (JSON.parse(reponse.corps) as { message?: unknown }).message;
      } catch {}
      return { fait: false, motif: `HTTP ${reponse.statut}${typeof motif === "string" && motif !== "" ? ` — ${motif}` : ""}` };
    },
    async fermerIssue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", "state=closed", "-f", "state_reason=completed", chemin]), chemin);
    },
    fermer: () => abandon.abort(),
  };
}

function pageSuivante(page: Reponse | undefined): string | null {
  return /<([^>]+)>;\s*rel="next"/.exec(page?.entetes.get("link") ?? "")?.[1] ?? null;
}
