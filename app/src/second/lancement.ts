// Ce que `claude` reçoit quand l'onglet Second le lance (terminaux.ts) : le rôle du second, ajouté à son
// prompt système, et les réglages de ce lancement. Le rôle n'est donc pas un message de la conversation,
// comme l'était `/brigade:po` invoqué au démarrage : une compaction ne le résume pas, et `claude --continue`
// le reçoit comme une session neuve.
//
// Le rôle est un fichier livré avec l'app (`role.md`, à côté de ce module : le paquet porte `src/` entier,
// packaging/construire.ts et packaging/windows.ts), que `claude` lit lui-même (`--append-system-prompt-file`).
// Son texte ne passe pas par la ligne de commande : sous Windows, un `claude.cmd` ne reçoit aucun argument
// sur plusieurs lignes (runtime/src/sans-invite.ts, `ligneDeCmd`).
//
// Les réglages (`--settings`) sont un objet de ce lancement, donné sur la ligne de commande : rien n'est
// écrit dans le `.claude/` du projet, ni dans aucun fichier qu'une autre session lirait. Un `claude` lancé
// dans le même dossier hors de l'onglet Second n'a donc ni le rôle, ni ces crochets.
import { join } from "node:path";

// Le texte du rôle, tel que l'app le livre.
export const ROLE_DU_SECOND = join(import.meta.dirname, "role.md");

// Les crochets de `claude`, par événement (`UserPromptSubmit`, `PreToolUse`, `Stop`, `SessionStart`…).
export type Crochet = { matcher?: string; hooks: { type: "command"; command: string; timeout?: number }[] };
export type Crochets = Record<string, Crochet[]>;
export type ReglagesDuSecond = { hooks?: Crochets };

// Les réglages d'un lancement du second : les crochets de chaque part réunis, événement par événement, dans
// l'ordre donné — `claude` ne prend qu'un `--settings`.
export function reglagesDuSecond(...parts: readonly Crochets[]): ReglagesDuSecond {
  const hooks: Crochets = {};
  for (const part of parts) for (const [evenement, crochets] of Object.entries(part)) hooks[evenement] = [...(hooks[evenement] ?? []), ...crochets];
  return Object.keys(hooks).length === 0 ? {} : { hooks };
}

// Les arguments de `claude` pour le second : `--continue` quand il reprend le fil du dossier, puis le rôle et
// les réglages — les mêmes à la reprise et dans une session neuve.
export function argumentsDuSecond(options: { reprise: boolean; reglages: ReglagesDuSecond; role?: string }): string[] {
  return [...(options.reprise ? ["--continue"] : []), "--append-system-prompt-file", options.role ?? ROLE_DU_SECOND, "--settings", JSON.stringify(options.reglages)];
}
