// Le seul endroit où le runtime lance un process : git, gh, ssh et tout autre
// outil qu'une station démarre ne doivent jamais interroger le terminal qui a
// lancé l'app. Un accès refusé est un échec immédiat, avec la raison de l'outil
// sur sa sortie d'erreur — pas une invite « Username for … » qui bloque la
// station, et à laquelle taper un secret serait dangereux.
//
// Ces quatre fonctions ont la signature de celles de `node:child_process` et
// ajoutent l'environnement de `envSansInvite` à chaque lancement. Aucun autre
// module de `runtime/src` n'importe `node:child_process` (voir
// `test/sans-invite.test.ts`).
import { type ChildProcess, execFile as lancerEtAttendre, execFileSync as lancerEtAttendreSync, spawn as lancer, spawnSync as lancerSync } from "node:child_process";

// Ce que l'outil ne doit pas demander. Une valeur déjà posée par l'appelant
// (un askpass qui donne vraiment un jeton, un ssh réglé) reste la sienne : seul
// l'absence de réglage devient un refus.
export const envSansInvite = (base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => ({
  ...base,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: base.GIT_ASKPASS ?? "false",
  SSH_ASKPASS: base.SSH_ASKPASS ?? "false",
  SSH_ASKPASS_REQUIRE: base.SSH_ASKPASS_REQUIRE ?? "never",
  GIT_SSH_COMMAND: base.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
  GCM_INTERACTIVE: "never",
  GH_PROMPT_DISABLED: "1",
});

const estOptions = (valeur: unknown): valeur is { env?: NodeJS.ProcessEnv } => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Les arguments d'un lancement : (programme, [args], [options], [rappel]). On
// remplace l'environnement des options, ou on les ajoute là où elles vont.
const avecEnvSansInvite = (args: unknown[]): unknown[] => {
  const rang = args.findIndex((argument, i) => i > 0 && estOptions(argument));
  if (rang >= 0) return args.map((argument, i) => (i === rang ? { ...(argument as object), env: envSansInvite((argument as { env?: NodeJS.ProcessEnv }).env) } : argument));
  const options = { env: envSansInvite() };
  const rappel = args.findIndex((argument) => typeof argument === "function");
  if (rappel >= 0) return [...args.slice(0, rappel), options, ...args.slice(rappel)];
  return args.length === 1 ? [args[0], [], options] : [...args, options];
};

export const execFile = ((...args: unknown[]) => (lancerEtAttendre as (...a: unknown[]) => unknown)(...avecEnvSansInvite(args))) as typeof lancerEtAttendre;
export const execFileSync = ((...args: unknown[]) => (lancerEtAttendreSync as (...a: unknown[]) => unknown)(...avecEnvSansInvite(args))) as typeof lancerEtAttendreSync;
export const spawn = ((...args: unknown[]) => (lancer as (...a: unknown[]) => unknown)(...avecEnvSansInvite(args))) as typeof lancer;
export const spawnSync = ((...args: unknown[]) => (lancerSync as (...a: unknown[]) => unknown)(...avecEnvSansInvite(args))) as typeof lancerSync;
export type { ChildProcess };
