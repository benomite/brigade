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
//
// Chaque valeur lue ici — dans le fichier, ou dans un `CLAUDE_CODE_OAUTH_TOKEN`
// d'où qu'il vienne — est retenue par `identifiants.ts` : elle est masquée,
// comme la forme des identifiants, dans tout ce que le runtime garde ou publie
// (journal, flux des cooks, comptes-rendus, sortie des gates, GitHub, sa
// propre sortie). Le fichier, lui, la cloison le cache aux lancements
// (`partition.ts`).
//
// Le jeton vit un an (`VIE_DU_JETON_JOURS`). L'étape de connexion Max range la
// date de sa création à côté de lui (`<fichier>.cree`, sans le jeton) : le
// runtime la relit au démarrage puis à chaque tick, écrit au journal ce qui
// change (`token.observed`), et la file du chef en tire l'annonce de
// l'échéance (`projections/token.ts`).
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { format } from "node:util";
import { PREAVIS_DU_JETON_JOURS, VIE_DU_JETON_JOURS, type ObservationDuJeton } from "./events/token.ts";
import { masquerIdentifiants, retenirJeton } from "./identifiants.ts";
import { jetonObserve } from "./projections/token.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";

// La variable du service qui nomme le fichier.
export const FICHIER_DU_JETON = "BRIGADE_CLAUDE_TOKEN_FILE";
// Celle par laquelle `claude` reçoit le jeton.
export const VARIABLE_DU_JETON = "CLAUDE_CODE_OAUTH_TOKEN";
// Le fichier de la date de création, à côté du jeton : une date ISO 8601, sur
// une ligne, et rien d'autre.
export const fichierDeCreation = (jeton: string) => `${jeton}.cree`;

const reel = (chemin: string) => (existsSync(chemin) ? realpathSync(chemin) : resolve(chemin));
const dans = (repertoire: string, fichier: string) => {
  const chemin = relative(reel(repertoire), fichier);
  return chemin === "" || (!chemin.startsWith("..") && !isAbsolute(chemin));
};

// Le jeton du fichier, ou null s'il n'y en a pas de lisible.
function lire(fichier: string): string | null {
  let jeton: string | null;
  try {
    jeton = readFileSync(fichier, "utf8").trim() || null;
  } catch {
    return null;
  }
  if (jeton !== null) retenirJeton(jeton);
  return jeton;
}

// Lit `BRIGADE_CLAUDE_TOKEN_FILE` au démarrage. Sans la variable, null : les
// `claude` lancés portent la connexion du compte. Un fichier qu'on ne pourrait
// pas lire, ou que d'autres que le compte du service liraient, est un refus de
// démarrer. Seul le chemin est retenu.
export function configJeton(env: Record<string, string | undefined>, lieux: { repertoireEtat: string; clone: string }): string | null {
  // Transmis à personne, mais masqué partout.
  retenirJeton(env[VARIABLE_DU_JETON]);
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
  const { [VARIABLE_DU_JETON]: ecarte, ...sans } = base;
  retenirJeton(ecarte);
  retenirJeton(env[VARIABLE_DU_JETON]);
  const fichier = env[FICHIER_DU_JETON];
  const jeton = fichier ? lire(fichier) : null;
  return jeton === null ? sans : { ...sans, [VARIABLE_DU_JETON]: jeton };
}

// Ce que le démarrage dit de la connexion des `claude` lancés.
export function direJeton(fichier: string | null, env: Record<string, string | undefined>): string {
  const ignore = env[VARIABLE_DU_JETON] ? `; ${VARIABLE_DU_JETON} is in the runtime's environment: it is passed to no \`claude\`` : "";
  return fichier
    ? `connection of \`claude\` — long-lived token read from ${fichier}, read again at each launch; reaches only the \`claude\` launched, neither the setup nor the gates${ignore}`
    : `connection of \`claude\` — the account's own (${FICHIER_DU_JETON} is not set)${ignore}`;
}

// La sortie du runtime — ce que journald garde — passe par le même masque :
// une erreur qui citerait le jeton ne l'y écrit pas. Le message est mis en
// forme comme `console` l'aurait fait, pile et propriétés d'une erreur
// comprises, puis masqué.
export function masquerLaConsole(sortie: Pick<Console, "log" | "info" | "warn" | "error"> = console): void {
  for (const methode of ["log", "info", "warn", "error"] as const) {
    const ecrire = sortie[methode].bind(sortie);
    sortie[methode] = (...valeurs: unknown[]) => ecrire("%s", masquerIdentifiants(format(...valeurs)).texte);
  }
}

// Ce que la date de création du jeton dit, lue à côté de `fichier` ; sans
// jeton configuré, rien. Rien de ce qui est lu n'est gardé que la date : un
// fichier qui porterait autre chose — le jeton, par erreur — n'en laisse rien.
export function lireCreation(fichier: string | null): ObservationDuJeton {
  const commun = { lifetimeDays: VIE_DU_JETON_JOURS, warningDays: PREAVIS_DU_JETON_JOURS };
  if (fichier === null) return { ...commun, token: null, file: null, state: "none", created: null };
  const file = fichierDeCreation(fichier);
  let texte: string;
  try {
    texte = readFileSync(file, "utf8").trim();
  } catch (erreur) {
    return { ...commun, token: fichier, file, state: (erreur as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unreadable", created: null };
  }
  // Une date, et pas n'importe quoi que `Date.parse` accepterait.
  const instant = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/.test(texte) ? Date.parse(texte) : Number.NaN;
  return Number.isFinite(instant) ? { ...commun, token: fichier, file, state: "read", created: new Date(instant).toISOString() } : { ...commun, token: fichier, file, state: "invalid", created: null };
}

// Lit la date du jeton d'emblée, puis à chaque tick, et écrit au journal ce
// qui change par rapport à ce que le journal en porte : un passage ou un
// redémarrage qui ne voit rien de neuf n'écrit rien, et l'annonce ne se répète
// pas. Sans jeton configuré, rien ne s'écrit — sauf pour effacer une
// observation d'avant, qui annoncerait un jeton qui n'est plus.
export function brancherJeton<R extends Runtime>(runtime: R, fichier: string | null): R {
  let ecrite = jetonObserve(runtime.journal.base);
  const lire = () => {
    try {
      const observation = lireCreation(fichier);
      if (JSON.stringify(observation) === JSON.stringify(ecrite) || (ecrite === null && observation.file === null)) return;
      runtime.journal.ajouter({ project: runtime.projet, ticket: null, author: "runtime", type: "token.observed", payload: observation });
      ecrite = observation;
    } catch (erreur) {
      // Une lecture qui ne s'écrit pas n'arrête pas la cuisine : la suivante la reprend.
      console.error(`brigade : date du jeton de la connexion Max non relue — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  };
  lire();
  runtime.surReveil((cause) => void (cause === "tick" && lire()));
  return runtime;
}
