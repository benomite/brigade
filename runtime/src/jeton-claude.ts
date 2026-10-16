// Le jeton longue durée de la connexion Max : celui que `claude setup-token`
// crée sous le compte du service, et que le binaire officiel lit dans
// `CLAUDE_CODE_OAUTH_TOKEN`. C'est ici, et nulle part ailleurs, que le runtime
// sait où il vit.
//
// Son emplacement : le fichier que nomme `BRIGADE_CLAUDE_TOKEN_FILE`, hors du
// dépôt et de l'état, lisible du seul compte du service (`chmod 600`), le
// jeton seul dedans. Le chemin se lit au démarrage ; le contenu se relit à
// chaque lancement de `claude` — un jeton remplacé sert au lancement suivant,
// sans rien redémarrer.
//
// Le jeton ne passe qu'aux `claude` que le runtime lance — cooks, reviewer,
// juges, closer, et `claude auth status` —, et à rien d'autre : ni au setup,
// ni aux gates, qui exécutent le code du projet. Sans la variable, ou sans
// jeton lisible au moment du lancement, rien ne change : `claude` porte la
// connexion Max du compte, comme avant.
//
// `CLAUDE_CODE_OAUTH_TOKEN` posé dans l'environnement du runtime n'est pas cet
// emplacement : il ne refuse pas le démarrage, mais n'est transmis à aucun
// `claude`.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { ConfigInvalide } from "./runtime.ts";

// La variable du service qui nomme le fichier.
export const FICHIER_DU_JETON = "BRIGADE_CLAUDE_TOKEN_FILE";
// Celle par laquelle `claude` reçoit le jeton.
export const VARIABLE_DU_JETON = "CLAUDE_CODE_OAUTH_TOKEN";

const reel = (chemin: string) => (existsSync(chemin) ? realpathSync(chemin) : resolve(chemin));
const dans = (repertoire: string, fichier: string) => {
  const chemin = relative(reel(repertoire), fichier);
  return chemin === "" || (!chemin.startsWith("..") && !isAbsolute(chemin));
};

// Le jeton du fichier, ou null s'il n'y en a pas de lisible.
function lire(fichier: string): string | null {
  try {
    return readFileSync(fichier, "utf8").trim() || null;
  } catch {
    return null;
  }
}

// Lit `BRIGADE_CLAUDE_TOKEN_FILE` au démarrage. Sans la variable, null : les
// `claude` lancés portent la connexion du compte. Un fichier qu'on ne pourrait
// pas lire, ou que d'autres que le compte du service liraient, est un refus de
// démarrer. Seul le chemin est retenu.
export function configJeton(env: Record<string, string | undefined>, lieux: { repertoireEtat: string; clone: string }): string | null {
  const fichier = env[FICHIER_DU_JETON];
  if (!fichier) return null;
  const refuser = (pourquoi: string): never => {
    throw new ConfigInvalide(`${FICHIER_DU_JETON} invalide : « ${fichier} » ${pourquoi}`);
  };
  if (!isAbsolute(fichier)) refuser("n'est pas un chemin absolu");
  let mode: number;
  try {
    mode = statSync(fichier).mode;
  } catch {
    return refuser("est illisible ou absent");
  }
  if ((mode & 0o077) !== 0) refuser("est lisible par d'autres que le compte du service — c'est le jeton de la connexion Max : chmod 600");
  // Ni dans ce que `sauvegarder` emporte, ni dans un worktree, ni dans ce qui
  // se commite.
  if (dans(lieux.repertoireEtat, reel(fichier)) || dans(lieux.clone, reel(fichier))) {
    refuser("doit être hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR — ni sauvegardé avec l'état, ni à portée d'un commit");
  }
  if (lire(fichier) === null) refuser("ne porte aucun jeton — y écrire celui que `claude setup-token` a donné");
  return fichier;
}

// L'environnement d'un `claude` que le runtime lance : `base`, avec le jeton
// lu à cet instant dans le fichier que nomme `env`. Sans jeton, `base` sans
// `CLAUDE_CODE_OAUTH_TOKEN` : rien d'autre que l'emplacement ne le fournit.
export function environnementClaude(base: NodeJS.ProcessEnv, env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const { [VARIABLE_DU_JETON]: _, ...sans } = base;
  const fichier = env[FICHIER_DU_JETON];
  const jeton = fichier ? lire(fichier) : null;
  return jeton === null ? sans : { ...sans, [VARIABLE_DU_JETON]: jeton };
}

// Ce que le démarrage dit de la connexion des `claude` lancés.
export function direJeton(fichier: string | null, env: Record<string, string | undefined>): string {
  const ignore = env[VARIABLE_DU_JETON] ? ` ; ${VARIABLE_DU_JETON} est dans l'environnement du runtime : il n'est transmis à aucun \`claude\`` : "";
  return fichier
    ? `connexion de \`claude\` — jeton longue durée lu dans ${fichier}, relu à chaque lancement ; ne parvient qu'aux \`claude\` lancés, ni au setup ni aux gates${ignore}`
    : `connexion de \`claude\` — celle du compte (${FICHIER_DU_JETON} n'est pas défini)${ignore}`;
}
