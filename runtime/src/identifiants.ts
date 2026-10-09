// Les identifiants de Claude dans ce qu'un cook livre et dans ce qu'il dit :
// la station les reconnaît à leur nom ou à leur forme avant de pousser, et
// leur forme est masquée dans tout texte que le runtime garde ou publie. Ce
// module ne lit rien — ni fichier, ni environnement : il ne compare à aucune
// valeur, et la règle de `claude.ts` (le runtime n'ouvre jamais les
// identifiants du compte) reste entière. Une copie transformée — encodée,
// chiffrée, découpée — passe.
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
export const DEBUT_DE_JETON = "sk-ant-";
const TYPE_MAX = 8;
const JETON = new RegExp(`${DEBUT_DE_JETON}[a-z]{2,${TYPE_MAX}}\\d{2}-[A-Za-z0-9_-]{${LONGUEUR_MIN_DU_JETON},}`);
// Ce qui précède le jeton lui-même, au plus long : le début, le type, deux
// chiffres et le tiret.
const LONGUEUR_MAX_DE_L_ENTETE = DEBUT_DE_JETON.length + TYPE_MAX + 3;
// Le plus long début de jeton qui n'en est pas encore un : l'en-tête la plus
// longue, et un caractère de moins que le jeton le plus court.
const DEBUT_MAX = LONGUEUR_MAX_DE_L_ENTETE + LONGUEUR_MIN_DU_JETON - 1;
// Ce qui suit `sk-ant-` dans un jeton qui n'est pas fini d'écrire.
const SUITE_DU_DEBUT = new RegExp(`^(?:[a-z]{0,${TYPE_MAX}}|[a-z]{2,${TYPE_MAX}}\\d(?:\\d(?:-.*)?)?)$`);
const debutPossible = (fin: string) =>
  fin.length <= DEBUT_DE_JETON.length ? DEBUT_DE_JETON.startsWith(fin) : fin.startsWith(DEBUT_DE_JETON) && SUITE_DU_DEBUT.test(fin.slice(DEBUT_DE_JETON.length));

// Dans une suite de caractères de jeton que rien ne termine encore, où
// commence ce qui peut devenir un jeton si la suite continue — `undefined`
// quand rien ne le peut : la suite porte déjà un jeton entier, qui la prendra
// jusqu'à son bout, ou aucune de ses fins n'en est le début.
export function jetonEnSuspens(suite: string): number | undefined {
  if (JETON.test(suite)) return undefined;
  for (let debut = Math.max(0, suite.length - DEBUT_MAX); debut < suite.length; debut++) {
    if (debutPossible(suite.slice(debut))) return debut;
  }
  return undefined;
}

// Un octet qu'un jeton peut porter, de son début à sa fin : `[A-Za-z0-9_-]`.
// Qui coupe un texte hors d'une suite de ces octets ne coupe aucun jeton.
export const octetDeJeton = (octet: number) =>
  (octet >= 0x30 && octet <= 0x39) || (octet >= 0x41 && octet <= 0x5a) || (octet >= 0x61 && octet <= 0x7a) || octet === 0x5f || octet === 0x2d;

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

// Ce qui tient la place d'un jeton dans un texte que le runtime garde ou
// publie : ni la valeur, ni rien d'elle — pas même sa longueur.
export const JETON_MASQUE = "[jeton Claude masqué]";

const JETONS = new RegExp(JETON.source, "g");
// L'objet que la clé du compte ouvre, puis chaque jeton qui y a une valeur.
const STRUCTURES = /claudeAiOauth\\*"?\s*:\s*\{[^{}]*/g;
const VALEURS = /((?:access|refresh)Token\\*"\s*:\s*\\*")[^"\\\s]{20,}/g;

// Le texte, où ce qui a la forme d'un jeton de Claude a laissé sa place à
// `JETON_MASQUE` — et combien de fois. Seul le jeton part : ce qui l'entoure
// se lit comme avant, et un faux positif ne coûte qu'un mot au compte-rendu.
// Le remplaçant ne porte ni guillemet ni antislash : une ligne de flux JSON
// reste une ligne de flux JSON. La structure se reconnaît sur une ligne
// quand le texte arrive ligne à ligne : étalée sur plusieurs, seuls ses
// jetons `sk-ant-…` sont masqués.
export function masquerIdentifiants(texte: string): { texte: string; masques: number } {
  let masques = 0;
  const masque = () => {
    masques += 1;
    return JETON_MASQUE;
  };
  // Les jetons d'abord : masqués, ils n'ont plus la forme d'une valeur de la
  // structure, et ne se comptent pas deux fois.
  const masquee = texte.replace(JETONS, masque).replace(STRUCTURES, (objet) => objet.replace(VALEURS, (_, cle: string) => `${cle}${masque()}`));
  return { texte: masquee, masques };
}

// Ce que l'issue dit d'un masquage : qu'il a eu lieu, où, combien de fois —
// jamais ce qui a été masqué.
export const direMasquage = (masques: number, ou: string) =>
  `**Masqué ${masques} fois : ce qui a la forme d'identifiants de Claude** dans ${ou} — \`${JETON_MASQUE}\` en tient la place, partout où le runtime garde ou publie ce texte. Le runtime reconnaît une forme, sans lire les identifiants du compte ni rien leur comparer : il ne dit pas que ce sont les vôtres. Si c'en sont, ils ont été lus et recopiés — voir « Révoquer la connexion Max » dans \`docs/runtime.md\`.`;
