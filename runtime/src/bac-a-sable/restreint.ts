// Le mode restreint (#4349) : un cook que la cuisine lance sans bac à sable —
// Seatbelt manque ou ne tient pas, et le chef a décidé de cuire sans — ne part
// jamais en `bypassPermissions`. Il reçoit les réglages de `claude` qui ne
// dépendent pas du noyau (`--settings` : permissions, crochets), construits des
// mêmes sources que ceux du bac à sable (`configuration.ts`) : les lectures que
// `LECTURES_INTERDITES` nomme sont refusées à ses outils, WebFetch ne joint que
// la liste réseau du projet et WebSearch est refusé, Edit n'écrit que dans le
// worktree et les caches du projet.
//
// Ce que le mode ne tient pas : Bash. Un cook qui ne lance pas ses commandes ne
// construit rien, Bash reste donc ouvert, et seul le crochet de la garde
// (`garde-cook/`, posé sur tout lancement) le borne — au mieux : `sed -i`,
// `curl -o`, `perl -i`, `python -c`… passent sans contrôle sûr, et le réseau
// et les lectures d'une commande ne sont pas bornés comme le fait le noyau.
import type { Regle } from "../reseau.ts";
import { configurer, type Cook } from "./configuration.ts";

// Ce que la cuisine dit d'un cook sans bac à sable, à l'écran et sur sa ligne.
export const MODE_RESTREINT = "restricted mode: no sandbox";

// Ce que le mode couvre et ce qu'il ne couvre pas, en une phrase.
export const LIMITES_DU_MODE_RESTREINT = "credential reads and hosts outside the project's list are refused to Claude's own tools, writes stay in the worktree and the project's caches; shell commands are only checked by the cook's guard, best-effort (sed -i, curl -o, perl -i, python -c…)";

export type Restreint = { worktree: string; caches: string[]; hotes: Regle[]; home: string; lit?: string[]; brigade?: boolean };

// Les arguments d'un cook sans bac à sable : son `--permission-mode` remplacé
// par celui du mode restreint, et ses réglages posés à sa suite.
export function dansLeModeRestreint(args: string[], cook: Restreint): string[] {
  const config = configurer(cook);
  const { permissions, hooks, env } = config.reglages;
  const reglages = {
    env,
    hooks: hooks.PermissionRequest === undefined ? {} : { PermissionRequest: hooks.PermissionRequest },
    permissions: { allow: [...permissions.allow, "Bash"], deny: [...permissions.deny, "WebSearch"], disableBypassPermissionsMode: permissions.disableBypassPermissionsMode },
  };
  const mode = args.indexOf("--permission-mode");
  if (mode === -1 || mode + 1 >= args.length) throw new Error("arguments de `claude` sans `--permission-mode` : le mode restreint ne s'y pose pas");
  const poses = [...args.slice(0, mode), "--permission-mode", config.modeDePermission, "--settings", JSON.stringify(reglages), ...args.slice(mode + 2)];
  // Les outils interdits, dernier argument : `--disallowedTools` avale ce qui le suit, ils se donnent donc en une liste.
  const interdits = poses.indexOf("--disallowedTools");
  return interdits === -1 ? poses : [...poses.slice(0, interdits + 1), poses.slice(interdits + 1).join(",")];
}
