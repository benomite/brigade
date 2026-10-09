// Les identifiants de Claude dans ce qu'un cook livre : la station les
// reconnaît à leur nom ou à leur forme, avant de pousser. Ce module ne lit
// rien — ni fichier, ni environnement : il ne compare à aucune valeur, et la
// règle de `claude.ts` (le runtime n'ouvre jamais les identifiants du compte)
// reste entière. Une copie transformée — encodée, chiffrée, découpée — passe.

// Le fichier où `claude` garde la connexion du compte, sous `~/.claude/`.
export const FICHIER_DES_IDENTIFIANTS = ".credentials.json";

// Ce que le patch d'un commit dit du fichier qu'il écrit — entre guillemets
// quand git cite un chemin non ASCII. Un fichier supprimé s'écrit `/dev/null`.
const NOMME = /^\+\+\+ "?b\/(?:[^\n]*\/)?\.credentials\.json"?$/m;

// Un jeton de Claude : `sk-ant-`, un type et deux chiffres (`oat01` l'accès du
// compte, `ort01` son renouvellement, `api03` une clé d'API), puis le jeton.
// En dessous de `LONGUEUR_MIN_DU_JETON` caractères, c'est un exemple tronqué.
export const LONGUEUR_MIN_DU_JETON = 40;
const JETON = new RegExp(`sk-ant-[a-z]{2,8}\\d{2}-[A-Za-z0-9_-]{${LONGUEUR_MIN_DU_JETON},}`);

// La structure du fichier, quelle que soit la forme du jeton qu'elle porte :
// la clé du compte, puis un jeton d'accès ou de renouvellement qui a une
// valeur. Les guillemets peuvent être échappés — un flux JSON qui la cite.
const STRUCTURE = /claudeAiOauth\\*"?\s*:\s*\{[^{}]*?(?:access|refresh)Token\\*"\s*:\s*\\*"[^"\\\s]{20,}/;

// `name` : un fichier nommé comme les identifiants ; `shape` : un contenu qui
// en a la forme. Jamais le chemin ni le contenu : c'est le cook qui les a
// écrits, et les citer publierait ce que le refus retient.
export type SigneDIdentifiants = "name" | "shape";

// Les signes d'identifiants de Claude dans ce qu'un push publierait
// (`depot.ajouts`) : patchs et messages de commit.
export function identifiantsLivres(ajouts: string): SigneDIdentifiants[] {
  return [...(NOMME.test(ajouts) ? (["name"] as const) : []), ...(JETON.test(ajouts) || STRUCTURE.test(ajouts) ? (["shape"] as const) : [])];
}
