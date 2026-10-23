// Les commandes Bash qu'un cook du bac à sable peut lancer pour vérifier son
// travail : les tests et les linters de son projet. Pur : juge un texte.
//
// Une règle `Bash(motif)` ne convient pas ici. Établi en lançant `claude` en
// `dontAsk` : le `*` d'un motif couvre n'importe quoi, espaces comprises, donc
// `Bash(VAR=* ./node_modules/.bin/*)` autorise `VAR=a curl x ./node_modules/.bin/y`,
// et `./node_modules/.bin/*` autorise `./node_modules/.bin/../../usr/bin/curl`.
// La commande se juge donc ici, mot à mot, par un crochet PreToolUse
// (`crochet-bash.ts`) : il autorise ce que cette fonction accepte, et ne dit
// rien du reste, que `dontAsk` traite comme avant.
//
// Accepté : une suite de commandes séparées par `;`, dont chacune est
//   - une lecture simple (`ls`, `pwd`, `cat`, `head`, `tail`, `wc`), ou
//   - une vérification, précédée ou non d'affectations `NOM=valeur` :
//     `./node_modules/.bin/<outil> …`, ou `pnpm|npm|yarn [run] <script> …`
//     pour un script usuel de test ou de lint.
// Refusé : tout ce qui compose autrement (`&`, `|`, `$`, `` ` ``, redirections,
// guillemets, sous-shell), un chemin qui sort du worktree (un `..` dans un mot,
// un mot ou une valeur `=…` absolu ou en `~` : sans quoi `cat /etc/passwd`
// passerait outre le périmètre que `dontAsk` donne à ses lectures), une variable qui change ce que
// le shell ou Node charge (`PATH`, `LD_PRELOAD`, `NODE_OPTIONS`…).

const GESTIONNAIRES = ["pnpm", "npm", "yarn"];
const SCRIPTS = ["test", "lint", "format", "typecheck"];
const LECTURES = ["ls", "pwd", "cat", "head", "tail", "wc"];
const INTERDIT = /[&|$`()<>{}\\"'\n\r\t]/;
const AFFECTATION = /^([A-Za-z_][A-Za-z0-9_]*)=(\S*)$/;
const VARIABLE_DANGEREUSE = /^(PATH|HOME|SHELL|IFS|ENV|BASH_ENV|NODE_.*|LD_.*|DYLD_.*|PYTHON.*|npm_config_.*|NPM_CONFIG_.*)$/i;
const HORS_DU_WORKTREE = /(^|=)[\/~]/;
const BINAIRE = /^\.\/node_modules\/\.bin\/[A-Za-z0-9_@][A-Za-z0-9_@.-]*$/;

function unMaillon(maillon: string): boolean {
  const mots = maillon.split(/\s+/).filter((mot) => mot !== "");
  if (mots.length === 0) return true;
  if (mots.some((mot) => mot.split("/").includes("..") || HORS_DU_WORKTREE.test(mot))) return false;
  if (LECTURES.includes(mots[0] ?? "")) return true;
  let debut = 0;
  for (; debut < mots.length; debut++) {
    const affectation = AFFECTATION.exec(mots[debut] ?? "");
    if (affectation === null) break;
    if (VARIABLE_DANGEREUSE.test(affectation[1] ?? "")) return false;
  }
  const commande = mots[debut];
  if (commande === undefined) return false;
  if (BINAIRE.test(commande)) return true;
  if (!GESTIONNAIRES.includes(commande)) return false;
  const script = mots[debut + 1] === "run" ? mots[debut + 2] : mots[debut + 1];
  return script !== undefined && SCRIPTS.includes(script);
}

export function estUneVerification(commande: string): boolean {
  if (INTERDIT.test(commande)) return false;
  const maillons = commande.split(";");
  return maillons.some((maillon) => maillon.trim() !== "") && maillons.every(unMaillon);
}

// Une commande qui vise visiblement les tests ou les linters du projet (un
// binaire de `node_modules/.bin`, un gestionnaire de paquets, une affectation
// de variable en tête) sans que `estUneVerification` l'accepte : `dontAsk` va la
// refuser, et le crochet y joint ce que le cook doit lancer à la place.
export function viseUneVerification(commande: string): boolean {
  return /node_modules\/\.bin|(^|[;\s])(pnpm|npm|yarn|npx)(\s|$)|(^|;)\s*[A-Za-z_][A-Za-z0-9_]*=/.test(commande);
}
