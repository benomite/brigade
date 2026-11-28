// Cloner le dépôt d'un projet à la place que la station lui donne, par le `gh`
// de la machine.
import { execFile } from "../sans-invite.ts";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { ligneDeGit } from "./acces.ts";

// L'adresse HTTPS du dépôt. Nommé par elle, `gh repo clone` clone en HTTPS
// avec le jeton de la station, quel que soit le protocole git réglé pour son
// compte : le 22 oct. 2026 (#1390), le `git_protocol ssh` du `gh` de la box
// envoyait le clone de widgets sur ssh, qui ne connaissait pas GitHub.
export const adresseHttps = (depot: string) => `https://github.com/${depot}.git`;

// Un clone en échec : `erreurs`, tout ce que gh et git ont écrit — la ligne
// `fatal:` de git, qui dit pourquoi, vient avant la dernière de gh (`failed
// to run git: exit status 128`), qui ne dit rien (`echec-du-clone.ts`).
export class CloneEnEchec extends Error {
  readonly erreurs: string;
  constructor(depot: string, erreurs: string) {
    super(`clone de ${depot} en échec — ${ligneDeGit(erreurs)}`);
    this.name = "CloneEnEchec";
    this.erreurs = erreurs;
  }
}

type Rendu = { code: number; sortie: string; erreurs: string };

function git(clone: string, args: string[], env: NodeJS.ProcessEnv, delaiMs: number): Promise<Rendu> {
  return new Promise((resoudre) => {
    const enfant = execFile("git", ["-C", clone, ...args], { env, timeout: delaiMs, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre({ code: 0, sortie: String(sortie), erreurs: "" });
      resoudre({ code: typeof erreur.code === "number" ? erreur.code : -1, sortie: String(sortie), erreurs: String(erreurs).trim() || erreur.message });
    });
    enfant.stdin?.end();
  });
}

// Un clone fait quand le dépôt était vide n'a aucun commit, et n'en reçoit
// jamais seul : ses commits arrivés depuis sur GitHub, il ne les voit pas, et
// la vérification d'accès, qui pousse à blanc `HEAD`, échoue sur « src refspec
// HEAD does not match any » (#3197). Sans commit, la station le rapatrie et
// pose dessus la branche par défaut de l'origine, s'il y en a une. Un clone
// qui a des commits n'est pas touché. Un échec de git lève, comme un clone.
async function rattraperUnCloneVide(depot: string, clone: string, env: NodeJS.ProcessEnv, delaiMs: number): Promise<void> {
  const tete = await git(clone, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], env, delaiMs);
  if (tete.code === 0) return;
  // `--quiet` : une tête sans commit sort en 1, sans rien dire ; tout autre échec est une panne.
  if (tete.code !== 1) throw new CloneEnEchec(depot, tete.erreurs);
  const rapatrie = await git(clone, ["fetch", "--quiet", "origin"], env, delaiMs);
  if (rapatrie.code !== 0) throw new CloneEnEchec(depot, rapatrie.erreurs);
  const parDefaut = await git(clone, ["ls-remote", "--symref", "origin", "HEAD"], env, delaiMs);
  if (parDefaut.code !== 0) throw new CloneEnEchec(depot, parDefaut.erreurs);
  // Un dépôt encore vide n'a pas de branche par défaut : rien à poser, la vérification d'accès le dira.
  const branche = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(parDefaut.sortie)?.[1];
  if (branche === undefined) return;
  if ((await git(clone, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branche}`], env, delaiMs)).code !== 0) return;
  const pose = await git(clone, ["checkout", "--quiet", "-B", branche, `origin/${branche}`], env, delaiMs);
  if (pose.code !== 0) throw new CloneEnEchec(depot, pose.erreurs);
}

// Clone le dépôt à sa place, par le `gh` de la machine — qui s'authentifie
// seul —, toujours en HTTPS. Un clone interrompu ne laisse rien à sa place :
// il se fait à côté. Déjà là mais sans commit, il est rattrapé.
export function cloner(options: { gh: string; depot: string; clone: string; delaiMs?: number; env?: NodeJS.ProcessEnv }): Promise<void> {
  const { gh, depot, clone } = options;
  if (existsSync(join(clone, ".git"))) return rattraperUnCloneVide(depot, clone, { ...(options.env ?? process.env), GIT_TERMINAL_PROMPT: "0" }, options.delaiMs ?? 15 * 60_000);
  const aCote = `${clone}.clonage`;
  rmSync(aCote, { recursive: true, force: true });
  mkdirSync(dirname(clone), { recursive: true });
  return new Promise((resoudre, rejeter) => {
    execFile(gh, ["repo", "clone", adresseHttps(depot), aCote, "--", "--quiet"], { timeout: options.delaiMs ?? 15 * 60_000, env: { ...(options.env ?? process.env), GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0", NO_COLOR: "1" } }, (erreur, _, erreurs) => {
      if (erreur !== null) {
        rmSync(aCote, { recursive: true, force: true });
        return rejeter(new CloneEnEchec(depot, String(erreurs).trim() || erreur.message));
      }
      try {
        renameSync(aCote, clone);
        resoudre();
      } catch (erreur) {
        rejeter(erreur instanceof Error ? erreur : new Error(String(erreur)));
      }
    });
  });
}
