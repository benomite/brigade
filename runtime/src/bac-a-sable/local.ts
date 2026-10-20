// Le bac à sable d'une cuisine locale : celle d'un projet qui cuit sur le Mac
// du chef, dans la station que son app lance (`station/cuisine.ts`). Sur ce
// poste, aucune cloison (`cloison.ts`, `bwrap`) ne sépare un lancement du
// compte du chef : chaque `claude` que la cuisine lance — cook, closer,
// reviewer de la pass, jugement du manager — part donc dans le bac à sable de
// Claude Code, avec la configuration d'un cook prêté par la box
// (`configuration.ts`) : il n'écrit que dans le répertoire où il travaille et
// dans les caches du projet, ne lit ni `~/.ssh` ni les identifiants du chef,
// ne joint que les hôtes de la liste réseau du projet.
//
// Une cuisine locale est une cuisine sous macOS : c'est là que tourne l'app du
// chef, et la box n'en est jamais une. Sans bac à sable, elle ne s'ouvre pas —
// aucun cook n'y part à nu —, et la raison se dit en une phrase.
//
// Ce que le bac à sable ne garde pas : les commandes que le runtime lance
// lui-même pour le projet, hors de `claude` — setup du worktree, gates. Elles
// sont celles du dépôt, pas du modèle.
import { tmpdir } from "node:os";
import { isAbsolute } from "node:path";
import { REGLES_DE_BASE, type Regle } from "../reseau.ts";
import { ConfigInvalide } from "../runtime.ts";
import { argumentsDuBacASable, configurer, type ConfigDeBacASable } from "./configuration.ts";
import { detecter, type Sondes } from "./detection.ts";
import { constater, pourLaBox } from "./ordinaires.ts";

// Les caches du projet où un cook de la cuisine locale écrit aussi : des
// chemins absolus, séparés par `:`. Aucun, par défaut.
export const VARIABLE_DES_CACHES = "BRIGADE_SANDBOX_CACHES";

// La plateforme d'une cuisine locale.
export const PLATEFORME_LOCALE = "darwin";

export type Verification = { ok: true; version: string } | { ok: false; raison: string };

// Ce que la cuisine retient de son bac à sable : de quoi configurer celui de
// chaque lancement. `hotes` : la liste réseau du projet, relue à chaque
// lancement — celle que sa branche d'intégration déclare.
export type BacASableLocal = { version: string; home: string; caches: string[]; hotes: () => Regle[] };

// Les lieux d'une cuisine locale, tels que la vérification les éprouve.
// `worktrees` : où ses cooks travaillent ; `caches` : les caches du projet.
export type Lieux = { home: string | undefined; worktrees: string; caches: string[] };

export function lireCaches(env: Record<string, string | undefined>): string[] {
  return (env[VARIABLE_DES_CACHES] ?? "").split(":").filter(Boolean);
}

// Le bac à sable est-il utilisable sur cette machine pour une cuisine locale ?
// `ok`, avec la version de `claude` ; sinon, ce qui manque, en une phrase.
// Les lieux sont éprouvés comme un cook les recevrait : son worktree, et le
// répertoire temporaire où partent les jugements du manager.
export function verifier(sondes: Sondes, lieux: Lieux, hotes: Regle[] = REGLES_DE_BASE): Verification {
  const detection = detecter(sondes);
  if (!detection.disponible) return { ok: false, raison: detection.raison };
  const { home, worktrees, caches } = lieux;
  if (home === undefined || !isAbsolute(home)) return { ok: false, raison: "HOME n'est pas un chemin absolu : le bac à sable ne sait pas quel compte protéger" };
  const relatif = caches.find((cache) => !isAbsolute(cache));
  if (relatif !== undefined) return { ok: false, raison: `${VARIABLE_DES_CACHES} nomme « ${relatif} » : un cache du projet se donne en chemin absolu` };
  // Un cook d'essai sous `worktrees`, comme pour un poste qui tire : celui de
  // chaque cook tiendra, son nom n'étant qu'un nom sous ce répertoire.
  const constat = constater(pourLaBox(detection, { home, worktrees, caches }), hotes);
  if (!constat.disponible) return { ok: false, raison: constat.raison.replace(/^the sandbox configuration does not hold on this workstation — /, "la configuration du bac à sable ne tient pas sur ce Mac — ") };
  try {
    configurer({ worktree: tmpdir(), caches, hotes, home });
  } catch (erreur) {
    return { ok: false, raison: `la configuration du bac à sable ne tient pas sur ce Mac pour les jugements du manager — ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  return { ok: true, version: detection.version };
}

// Le bac à sable de la cuisine d'un projet. Nul hors de macOS : la cuisine
// n'est pas locale, et la cloison de sa machine la garde. Sous macOS, une
// vérification qui échoue est un refus : la cuisine ne s'ouvre pas.
export function configBacASableLocal(sondes: Sondes, lieux: Lieux, hotes: () => Regle[]): BacASableLocal | null {
  if (sondes.plateforme !== PLATEFORME_LOCALE) return null;
  const verification = verifier(sondes, lieux);
  if (!verification.ok) throw new ConfigInvalide(`sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — ${verification.raison}`, "sandbox-unusable");
  return { version: verification.version, home: lieux.home as string, caches: lieux.caches, hotes };
}

// Les arguments d'un `claude` lancé dans le bac à sable : ceux qu'il aurait
// reçus, son `--permission-mode` remplacé par celui de la configuration et ses
// réglages — ou, s'il n'en avait pas (reviewer, jugement), ceux-ci posés devant
// `--setting-sources`. Rien d'autre ne change.
export function poserLeBacASable(args: readonly string[], config: ConfigDeBacASable): string[] {
  const mode = args.indexOf("--permission-mode");
  if (mode !== -1 && mode + 1 < args.length) return [...args.slice(0, mode), ...argumentsDuBacASable(config), ...args.slice(mode + 2)];
  const sources = args.indexOf("--setting-sources");
  if (sources === -1) throw new Error("arguments de `claude` sans `--permission-mode` ni `--setting-sources` : le bac à sable ne s'y pose pas");
  return [...args.slice(0, sources), ...argumentsDuBacASable(config), ...args.slice(sources)];
}

// Le lancement d'un `claude` de la cuisine : dans le bac à sable si elle en a
// un, tel quel sinon. `ou` : le répertoire où il travaille — le seul, avec les
// caches du projet, où il écrit.
export function dansLeBacASableLocal(bac: BacASableLocal | null | undefined, args: string[], ou: string): string[] {
  if (!bac) return args;
  return poserLeBacASable(args, configurer({ worktree: ou, caches: bac.caches, hotes: bac.hotes(), home: bac.home }));
}

// Ce que la cuisine dit de son bac à sable au démarrage.
export function direBacASable(bac: BacASableLocal): string {
  return `bac à sable — chaque \`claude\` de la cuisine (cook, closer, reviewer, manager) part dans celui de Claude Code (claude ${bac.version}) : il n'écrit que là où il travaille${bac.caches.length === 0 ? "" : ` et dans ${bac.caches.join(", ")}`}, ne lit ni ~/.ssh ni les identifiants du chef, ne joint que les hôtes de la liste réseau du projet`;
}
