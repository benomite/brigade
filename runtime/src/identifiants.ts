// Les identifiants de Claude dans ce qu'un cook livre : la station les
// reconnaît à leur nom ou à leur forme, avant de pousser. Ce module ne lit
// rien — ni fichier, ni environnement : il ne compare à aucune valeur, et la
// règle de `claude.ts` (le runtime n'ouvre jamais les identifiants du compte)
// reste entière. Une copie transformée — encodée, chiffrée, découpée — passe.
//
// Seul compte ce que la branche ajoute : ce qu'elle retire ou laisse en place
// était déjà sur la base, ou a été ajouté par un commit de la branche — où il
// se lit comme un ajout.

// Le fichier où `claude` garde la connexion du compte, sous `~/.claude/`.
export const FICHIER_DES_IDENTIFIANTS = ".credentials.json";

// Ce que le patch d'un commit dit du fichier qu'il crée — entre guillemets
// quand git cite un chemin non ASCII, suivi d'une tabulation quand le chemin
// porte un blanc. Un fichier modifié ou supprimé existait déjà : il n'est pas
// reconnu à son nom.
const NOMME = /^--- \/dev\/null\n\+\+\+ "?b\/(?:[^\n]*\/)?\.credentials\.json"?\t?$/m;

// L'en-tête d'un bloc de patch, et le nombre de lignes qu'il annonce de
// chaque côté — une seule quand il ne le dit pas.
const BLOC = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// Ce que `depot.ajouts` rend, moins ce que la branche n'ajoute pas : dans un
// bloc de patch, les lignes de contexte et les lignes retirées. Les blocs se
// comptent d'après leur en-tête, et un message de commit ne peut pas en
// ouvrir un : ses lignes sont en retrait.
function ajoute(ajouts: string): string {
  const gardees: string[] = [];
  let [anciennes, nouvelles] = [0, 0];
  for (const ligne of ajouts.split("\n")) {
    if (anciennes > 0 || nouvelles > 0) {
      if (ligne.startsWith("+")) {
        nouvelles--;
        gardees.push(ligne);
      } else if (ligne.startsWith("-")) anciennes--;
      // « \ No newline at end of file » ne compte d'aucun côté.
      else if (!ligne.startsWith("\\")) [anciennes, nouvelles] = [anciennes - 1, nouvelles - 1];
      continue;
    }
    const bloc = BLOC.exec(ligne);
    // La fin de l'en-tête cite une ligne du fichier, qui n'est pas ajoutée.
    if (bloc) [anciennes, nouvelles] = [Number(bloc[1] ?? 1), Number(bloc[2] ?? 1)];
    else gardees.push(ligne);
  }
  return gardees.join("\n");
}

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
  const texte = ajoute(ajouts);
  return [...(NOMME.test(texte) ? (["name"] as const) : []), ...(JETON.test(texte) || STRUCTURE.test(texte) ? (["shape"] as const) : [])];
}
