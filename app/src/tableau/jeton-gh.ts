// Le jeton GitHub du desktop : celui du `gh` de l'ordinateur, l'accès à GitHub que l'app a déjà — c'est lui qui lit
// les dépôts du chef (projets/github.ts) et les stations (stations/github.ts), et que le bouton « Connect to GitHub »
// connecte (connexion-github.ts). `gh auth token` le dit, qu'il vienne de son login ou de `GH_TOKEN` : rien n'est gardé
// par l'app. Sans `gh`, ou `gh` sans compte, il n'y a pas de jeton — la lecture part sans (client.ts).
import { execFile } from "node:child_process";

export type ReglagesDuJeton = { gh: string; delaiMs: number; env?: NodeJS.ProcessEnv };

export function jetonDeGh(reglages: ReglagesDuJeton): () => Promise<string | null> {
  return () =>
    new Promise((resoudre) => {
      execFile(
        reglages.gh,
        ["auth", "token"],
        { windowsHide: true, timeout: reglages.delaiMs, env: { ...(reglages.env ?? process.env), GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } },
        (erreur, sortie) => {
          const jeton = sortie.trim();
          resoudre(erreur === null && jeton !== "" && !/\s/.test(jeton) ? jeton : null);
        },
      );
    });
}
