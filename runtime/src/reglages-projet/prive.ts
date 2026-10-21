// Ce qui ne s'écrit jamais dans le dépôt d'un projet : les réglages du projet y
// sont versionnés, lisibles par quiconque y a accès, et ce qui est à la
// machine ou au chef reste chez eux (épique 1301). Le runtime ne sait pas ce
// qu'une valeur ouvre : il refuse ce qui se reconnaît — un nom qui dit un
// secret ou une limite de la machine, une valeur qui a la forme d'une clé ou
// d'un chemin de la machine — et ne prétend rien de plus.
//
// Pur : une clé et une valeur entrent, un motif sort, ou rien.

export type Prive = "secret" | "chemin" | "limite-machine";

export type Constat = { motif: Prive; pourquoi: string };

// Les noms qui disent un secret ou un identifiant, en anglais comme en
// français, quelle que soit leur casse et leur séparateur.
const NOMS_DE_SECRET = /secret|token|jeton|passw|passwd|mot.?de.?passe|credential|identifiant|api.?key|private.?key|cle.?privee|auth|cookie|session|ssh.?key|bearer/i;

// Les noms qui disent ce que la machine choisit pour elle : combien de cooks
// elle lance, où elle pose leurs espaces de travail, ce qu'elle sait faire,
// sa cloison. Ils sont réglés station par station.
const NOMS_DE_LA_MACHINE = /cooks?|workspace|worktree|espace.?de.?travail|dossier|folder|directory|repertoire|cores?|cpus?|coeurs?|parallel|concurren|stations?|capabilit|capacit|fournit|provides|sandbox|cloison|hote|host|port|home|state.?dir|chemin|path/i;

// Les formes connues d'une clé ou d'un jeton.
const FORMES_DE_SECRET: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub token"],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/, "an Anthropic key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/, "an API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS key"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./, "a signed token (JWT)"],
  [/[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i, "an address carrying a password"],
];

// Une suite de 32 lettres et chiffres d'un seul tenant, qui mêle les deux :
// rien de ce que porte un réglage de projet (une branche, un modèle, un
// effort) ne ressemble à cela, une clé souvent. Une branche longue a ses
// séparateurs (`cook/1302-6e402176`) : ses morceaux restent courts.
const ressembleAUneCle = (valeur: string) => (valeur.match(/[A-Za-z0-9]{32,}/g) ?? []).some((bloc) => /[A-Za-z]/.test(bloc) && /\d/.test(bloc));

// Un chemin de la machine : absolu sous POSIX ou sous Windows, ou relatif au
// dossier personnel.
const CHEMIN_ABSOLU = /^(?:\/|~|\$HOME\b|\$\{HOME\}|%USERPROFILE%|[A-Za-z]:[\\/]|\\\\)/;
const DANS_UN_CHEMIN = /(?:^|[\s"'=])(?:\/(?:home|Users|root|var|etc|opt|tmp|srv|mnt|Volumes)\/|[A-Za-z]:\\)/;

// Le motif pour lequel ce nom ne s'écrit pas dans le dépôt, ou null.
export function nomPrive(nom: string): Constat | null {
  if (NOMS_DE_SECRET.test(nom)) return { motif: "secret", pourquoi: "its name says a secret or a credential" };
  if (NOMS_DE_LA_MACHINE.test(nom)) return { motif: "limite-machine", pourquoi: "its name says a machine-specific setting (cook count, workspace folder, capabilities, sandbox): each station sets it for itself" };
  return null;
}

// Le motif pour lequel cette valeur ne s'écrit pas dans le dépôt, ou null.
// Le constat ne cite jamais la valeur : elle est peut-être un secret.
export function valeurPrivee(valeur: string): Constat | null {
  const forme = FORMES_DE_SECRET.find(([motif]) => motif.test(valeur));
  if (forme !== undefined) return { motif: "secret", pourquoi: `its value looks like ${forme[1]}` };
  if (ressembleAUneCle(valeur)) return { motif: "secret", pourquoi: "its value looks like a key or a token" };
  if (CHEMIN_ABSOLU.test(valeur.trim()) || DANS_UN_CHEMIN.test(valeur)) return { motif: "chemin", pourquoi: "its value is a path on a machine" };
  return null;
}
