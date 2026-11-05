// The stale `cook/<n>-github` branches, cleaned from what GitHub says: a
// branch whose issue is closed is deleted, locally and on the origin.
import { promisify } from "node:util";
import { execFile } from "../../sans-invite.ts";
import type { GitHub } from "../../github.ts";
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

// Deletes the `cook/<n>-github` branches whose issue is closed. A live one (open
// issue, or an issue GitHub does not answer for) is kept, and so is any other
// branch. Returns the branches deleted.
export async function elaguerBranchesPerimees(options: OptionsElagage): Promise<string[]> {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const retirees: string[] = [];
  for (const branche of await options.branches()) {
    const numero = BRANCHE_COOK.exec(branche)?.[1];
    if (numero === undefined) continue;
    try {
      if ((await options.issueFermee(Number(numero))) !== true) continue;
      await options.supprimer(branche);
      retirees.push(branche);
    } catch (erreur) {
      avertir(`brigade : stale branch ${branche} not removed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }
  return retirees;
}

// Cleans the stale branches at each tick, one pass at a time. Its `arreter`
// takes it along.
export function brancherElagageGithub<R extends Runtime>(runtime: R, options: OptionsElagage): R {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  let arrete = false;
  let occupe = false;
  const desabonner = runtime.surReveil((cause) => {
    if (cause !== "tick" || arrete || occupe) return;
    occupe = true;
    void elaguerBranchesPerimees(options)
      .then((retirees) => {
        if (retirees.length > 0 && !arrete) avertir(`brigade : stale branches removed — ${retirees.join(", ")}`);
      })
      .catch((erreur) => {
        if (!arrete) avertir(`brigade : stale branches not listed — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
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
