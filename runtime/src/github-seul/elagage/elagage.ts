// The stale `cook/<n>-github` branches, cleaned from what GitHub says: a
// branch whose issue is closed is deleted, locally and on the origin.
import { promisify } from "node:util";
import { execFile } from "../../sans-invite.ts";
import type { GitHub } from "../../github.ts";
import { estLaPauseDeGitHub } from "../../limite-github.ts";
import type { Runtime } from "../../runtime.ts";

const BRANCHE_COOK = /^cook\/(\d+)-github$/;

export type OptionsElagage = {
  // The `cook/<n>-github` branches that exist, local or on the origin.
  branches: () => Promise<string[]>;
  // Whether GitHub says this issue is closed; null when it cannot be told.
  issueFermee: (numero: number) => Promise<boolean | null>;
  supprimer: (branche: string) => Promise<void>;
  avertir?: (message: string) => void;
};

// The issues read for their branch in one pass, at most (#2436): each read is
// a GitHub call, and a pass over every branch at each tick, for every project,
// was a burst that set off GitHub's secondary limit. The next pass goes on
// from where this one stopped.
export const BRANCHES_PAR_TOUR = 3;

// Where the passes stand in the sorted branches: the last one examined.
export type Curseur = { derniere: string | null };

// Deletes the `cook/<n>-github` branches whose issue is closed, examining at
// most `BRANCHES_PAR_TOUR` of them, after `curseur`, then from the start. A live
// one (open issue, or an issue GitHub does not answer for) is kept, and so is
// any other branch. GitHub's pause ends the pass, without a word: the journal
// already says it. Returns the branches deleted.
export async function elaguerBranchesPerimees(options: OptionsElagage, curseur: Curseur = { derniere: null }): Promise<string[]> {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const cooks = (await options.branches()).filter((branche) => BRANCHE_COOK.test(branche)).sort();
  const apres = cooks.findIndex((branche) => curseur.derniere !== null && branche > curseur.derniere);
  const depart = apres === -1 ? 0 : apres;
  const examinees = [...cooks.slice(depart), ...cooks.slice(0, depart)].slice(0, BRANCHES_PAR_TOUR);
  const retirees: string[] = [];
  for (const branche of examinees) {
    try {
      if ((await options.issueFermee(Number(BRANCHE_COOK.exec(branche)?.[1]))) === true) {
        await options.supprimer(branche);
        retirees.push(branche);
      }
    } catch (erreur) {
      if (estLaPauseDeGitHub(erreur)) break;
      avertir(`brigade : stale branch ${branche} not removed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    curseur.derniere = branche;
  }
  return retirees;
}

// Cleans the stale branches at each tick, a few per pass (`BRANCHES_PAR_TOUR`).
// Its `arreter` takes it along.
export function brancherElagageGithub<R extends Runtime>(runtime: R, options: OptionsElagage): R {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  let arrete = false;
  let occupe = false;
  const curseur: Curseur = { derniere: null };
  const desabonner = runtime.surReveil((cause) => {
    if (cause !== "tick" || arrete || occupe) return;
    occupe = true;
    void elaguerBranchesPerimees(options, curseur)
      .then((retirees) => {
        if (retirees.length > 0 && !arrete) avertir(`brigade : stale branches removed — ${retirees.join(", ")}`);
      })
      .catch((erreur) => {
        if (!arrete && !estLaPauseDeGitHub(erreur)) avertir(`brigade : stale branches not listed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      })
      .finally(() => {
        occupe = false;
      });
  });
  return {
    ...runtime,
    arreter(signal: string) {
      arrete = true;
      desabonner();
      runtime.arreter(signal);
    },
  };
}

// The branches of the project's clone, read and deleted with `git`, and the
// issues' state read from GitHub.
export function elagageDuClone(options: { clone: string; github: Pick<GitHub, "issue">; env?: NodeJS.ProcessEnv; avertir?: (message: string) => void }): OptionsElagage {
  const git = async (...args: string[]) => {
    const { stdout } = await promisify(execFile)("git", args, { cwd: options.clone, env: options.env ?? process.env, encoding: "utf8", timeout: 60_000 });
    return String(stdout);
  };
  return {
    branches: async () => {
      const distantes = (await git("ls-remote", "--heads", "origin", "refs/heads/cook/*-github")).split("\n").map((ligne) => ligne.split("\t")[1]?.replace(/^refs\/heads\//, ""));
      const locales = (await git("branch", "--list", "cook/*-github", "--format=%(refname:short)")).split("\n");
      return [...new Set([...distantes, ...locales].filter((branche): branche is string => !!branche))];
    },
    issueFermee: async (numero) => {
      const issue = await options.github.issue(numero);
      return issue === null ? null : issue.state === "closed";
    },
    supprimer: async (branche) => {
      if ((await git("ls-remote", "--heads", "origin", `refs/heads/${branche}`)).trim() !== "") await git("push", "origin", "--delete", branche);
      if ((await git("branch", "--list", branche)).trim() !== "") await git("branch", "--quiet", "-D", branche);
    },
    ...(options.avertir ? { avertir: options.avertir } : {}),
  };
}
