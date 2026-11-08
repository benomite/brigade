// La fourche d'une station contributrice (#2935) : sans l'écriture sur le
// dépôt du projet, la station ne pousse rien sur son origine. Elle crée sa
// fourche — ou retrouve celle qu'elle a déjà : GitHub rend la même —, y pousse
// la branche du cook, et ouvre la PR de la fourche vers le projet.
import { execFileSync } from "../sans-invite.ts";

// La fourche du compte de la station : son propriétaire (le `head` de la PR
// s'écrit `<propriétaire>:<branche>`) et l'adresse où pousser.
export type Fourche = { proprietaire: string; url: string };

// Pousse la branche du clone sur la fourche. Forcé : la branche n'y est écrite
// que par cette station, et un cook repris la récrit. Lève si `git` échoue.
export function pousserDansLaFourche({ clone, fourche, branche, env }: { clone: string; fourche: Fourche; branche: string; env: NodeJS.ProcessEnv }): void {
  execFileSync("git", ["push", "--quiet", "--force", fourche.url, `refs/heads/${branche}:refs/heads/${branche}`], {
    cwd: clone,
    env: { ...env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Oublie la branche locale d'un cook d'avant, pour qu'un nouveau cook reparte
// de la base : ce qu'elle portait est sur la fourche, ou n'a jamais été livré.
// Rien à faire si elle n'existe pas.
export function oublierLaBranche({ clone, branche, env }: { clone: string; branche: string; env: NodeJS.ProcessEnv }): void {
  const options = { cwd: clone, env: { ...env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"], encoding: "utf8" as const };
  if (execFileSync("git", ["branch", "--list", branche], options).trim() === "") return;
  execFileSync("git", ["branch", "--quiet", "-D", branche], options);
}
