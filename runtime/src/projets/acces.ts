// Avant de servir un projet, la station vérifie qu'elle peut récupérer son
// dépôt et y pousser — par le git de la machine, sur le remote de son clone,
// celui que ses worktrees et ses cooks utiliseront. `gh repo clone` a pu
// réussir sans que git sache s'authentifier seul : gh prête ses identifiants
// au clone, pas aux fetch qui suivent. C'est ce qui est arrivé le 20 oct. 2026
// (#1115) : un clone en https, aucun credential helper, et un worktree qui ne
// se préparait jamais.
//
// Deux appels, sans invite (`sans-invite.ts`) : `git ls-remote` pour la
// récupération, `git push --dry-run` pour l'écriture — il s'authentifie auprès
// du dépôt comme un vrai push, sans rien lui envoyer. Un refus est dit en une
// phrase, avec le geste qui le lève ; un dépôt injoignable (réseau, délai)
// n'est pas un refus : la station réessaie.
import { execFile } from "../sans-invite.ts";

export type Operation = "fetch" | "push";

// Ce que la station publie d'un accès refusé (`demande.ts`, `acces`) : ce qui
// est refusé, pourquoi en une phrase, et le geste du chef. En anglais : c'est
// l'app qui les montre.
export type AccesBloque = { bloque: Operation; raison: string; geste: string };

export type Acces = { etat: "libre" } | ({ etat: "bloque" } & AccesBloque) | { etat: "injoignable"; dit: string };

// Le temps laissé à chaque appel : au-delà, le dépôt est injoignable.
export const DELAI_MS = 60_000;

// La branche que le push à blanc vise : il n'envoie rien, son nom n'existe pas.
const BRANCHE_A_BLANC = "refs/heads/brigade/verification-d-acces";

type Rendu = { ok: true; sortie: string } | { ok: false; erreurs: string; expire: boolean };

function git(clone: string, args: string[], env: NodeJS.ProcessEnv, delaiMs: number): Promise<Rendu> {
  return new Promise((resoudre) => {
    const enfant = execFile("git", ["-C", clone, ...args], { env, timeout: delaiMs, encoding: "utf8" }, (erreur, sortie, erreurs) => {
      if (erreur === null) return resoudre({ ok: true, sortie: String(sortie).trim() });
      resoudre({ ok: false, erreurs: String(erreurs).trim() || erreur.message, expire: erreur.killed === true });
    });
    // Rien ne lui sera répondu : git ne lit jamais une question sur son entrée.
    enfant.stdin?.end();
  });
}

// L'hôte d'un remote : `https://host/…`, `ssh://user@host/…` ou `user@host:…`.
export function hoteDe(url: string): string {
  try {
    const lu = new URL(url);
    if (lu.host !== "") return lu.protocol === "ssh:" ? `${lu.username === "" ? "" : `${lu.username}@`}${lu.hostname}` : `${lu.protocol}//${lu.host}`;
  } catch {}
  return /^([^@/:]+@)?([^:/]+):/.exec(url)?.[0].slice(0, -1) ?? url;
}

const enHttp = (url: string) => /^https?:\/\//i.test(url);

// La ligne où git dit pourquoi : la première `fatal:`, sinon la première
// `error:` (ou `ERROR:`), sinon la dernière.
export function ligneDeGit(erreurs: string): string {
  const lignes = erreurs
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");
  const dite = lignes.find((ligne) => /^fatal:/i.test(ligne)) ?? lignes.find((ligne) => /^error:/i.test(ligne)) ?? lignes.at(-1) ?? "no output";
  const nette = dite.replace(/^(fatal|error):\s*/i, "");
  return nette.length > 200 ? `${nette.slice(0, 199)}…` : nette;
}

export type Refus = {
  operation: Operation;
  station: string;
  depot: string;
  clone: string;
  // L'adresse que git a jointe pour cette opération.
  url: string;
  erreurs: string;
  // git a un credential helper pour cette adresse.
  helper: boolean;
};

// Ce qu'un échec de git veut dire, et le geste qui le lève — ou null : le
// dépôt n'a pas été joint, la station réessaie. Pur.
export function lireLeRefus({ operation, station, depot, clone, url, erreurs, helper }: Refus): AccesBloque | null {
  const hote = hoteDe(url);
  const git = ligneDeGit(erreurs);
  const sur = `on ${station}, under the account that runs it`;
  const refus = (pourquoi: string, geste: string): AccesBloque => ({
    bloque: operation,
    raison:
      operation === "fetch" ? `${station} cannot fetch from ${depot}: ${pourquoi} (git: ${git}).` : `${station} can fetch from ${depot} but cannot push to it: ${pourquoi} (git: ${git}).`,
    geste,
  });
  const lecture = operation === "fetch" ? "read" : "write";
  if (/could not read (username|password)|terminal prompts disabled|authentication failed|invalid username or password|returned error: 401/i.test(erreurs)) {
    if (enHttp(url) && !helper) return refus(`git has no credentials for ${hote} and no credential helper to ask for them`, `Run \`gh auth setup-git\` ${sur}: git then takes its credentials from gh.`);
    return refus(`git's credential helper gives no valid credentials for ${hote}`, `Run \`gh auth login\` ${sur}, then \`gh auth setup-git\`.`);
  }
  if (/host key verification failed/i.test(erreurs)) return refus(`ssh does not know the host key of ${hote} yet`, `Run \`ssh -T ${hote}\` once ${sur}, and accept the host key it shows.`);
  if (/permission denied \(publickey/i.test(erreurs)) return refus(`${hote} refuses the ssh key of the station`, `Add the public ssh key of the account that runs ${station} to its GitHub account (\`gh ssh-key add <key>.pub\`).`);
  if (/permission to .* denied|returned error: 403|write access to repository not granted|marked as read only|access denied/i.test(erreurs)) {
    return refus(`its GitHub account has no ${lecture} access to it`, `Give the GitHub account of ${station} ${lecture} access to ${depot}, in the repository's settings: https://github.com/${depot}/settings/access.`);
  }
  if (/repository not found|does not appear to be a git repository|returned error: 404|not found/i.test(erreurs)) {
    return refus(`${hote} answers that it does not exist, or that its account may not see it`, `Check that the account that runs ${station} sees ${depot} (\`gh repo view ${depot}\`), and give it ${lecture} access.`);
  }
  if (/could not resolve host|could not resolve hostname|failed to connect|couldn't connect|connection (timed out|refused|reset|closed)|operation timed out|network is unreachable|temporary failure in name resolution|early eof|returned error: 5\d\d/i.test(erreurs)) return null;
  const commande = operation === "fetch" ? "ls-remote origin" : "push --dry-run origin HEAD:refs/heads/check";
  return refus("git fails", `Run \`git -C ${clone} ${commande}\` ${sur}, to see what git says.`);
}

export type OptionsAcces = { station: string; depot: string; base: string; clone: string; env?: NodeJS.ProcessEnv; delaiMs?: number };

// Vérifie, sur le remote `origin` du clone, que la station peut en récupérer
// la branche d'intégration et y pousser.
export async function verifierAcces({ station, depot, base, clone, env = process.env, delaiMs = DELAI_MS }: OptionsAcces): Promise<Acces> {
  for (const operation of ["fetch", "push"] as const) {
    const adresse = await git(clone, operation === "fetch" ? ["remote", "get-url", "origin"] : ["remote", "get-url", "--push", "origin"], env, delaiMs);
    if (!adresse.ok) return { etat: "bloque", bloque: operation, raison: `${station} cannot ${operation === "fetch" ? "fetch from" : "push to"} ${depot}: its clone has no origin remote (git: ${ligneDeGit(adresse.erreurs)}).`, geste: `Remove ${clone} on ${station}: the station clones it again.` };
    const url = adresse.sortie;
    const essai = await git(clone, operation === "fetch" ? ["ls-remote", "--heads", "origin", `refs/heads/${base}`] : ["push", "--dry-run", "--quiet", "origin", `HEAD:${BRANCHE_A_BLANC}`], env, delaiMs);
    if (essai.ok) continue;
    if (essai.expire) return { etat: "injoignable", dit: `git did not reach ${hoteDe(url)} within ${Math.round(delaiMs / 1000)} s` };
    const helper = await git(clone, ["config", "--get-urlmatch", "credential.helper", url], env, delaiMs);
    const refus = lireLeRefus({ operation, station, depot, clone, url, erreurs: essai.erreurs, helper: helper.ok && helper.sortie !== "" });
    if (refus === null) return { etat: "injoignable", dit: `git did not reach ${hoteDe(url)} — ${ligneDeGit(essai.erreurs)}` };
    return { etat: "bloque", ...refus };
  }
  return { etat: "libre" };
}
