// Les secrets de dev d'un projet : son dépôt en déclare les noms, la machine en
// détient les valeurs, et un cook reçoit l'intersection. Ce chemin-là est
// séparé de l'environnement du runtime — qui ne passe au cook ni son état, ni
// de quoi parler au modèle ou à GitHub autrement que prévu. Seul module qui
// lit le fichier de valeurs ; une valeur n'en sort que dans l'environnement
// d'un process lancé, jamais dans un problème, un événement ou un message.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { SCRIPT_SETUP } from "./gates.ts";
import { ConfigInvalide } from "./runtime.ts";

// Ce que le dépôt du projet déclare : un nom de variable par ligne.
export const DECLARATION = ".claude/brigade/secrets";

// En dessous, une valeur n'est pas un secret : la masquer rongerait les
// comptes-rendus (`test`, `1234`), ne pas la masquer ferait deux sortes de
// secrets. Elle est refusée — c'est une configuration, que le setup exporte.
export const LONGUEUR_MIN = 8;

// Les noms par lesquels le runtime pilote ses cooks, ou qu'il leur retire : un
// projet ne peut pas, par ses secrets, donner une clé de modèle ou un jeton
// GitHub, ni déplacer ce que le cook exécute.
const PREFIXES_RESERVES = ["BRIGADE_", "ANTHROPIC_", "CLAUDE_", "GH_", "GITHUB_", "GIT_"];
const NOMS_RESERVES = ["PATH", "HOME"];

// « Jamais de prod » ne se vérifie pas : le runtime ne sait pas ce qu'une
// valeur ouvre. Il refuse ce qui se reconnaît — un nom qui dit la production,
// une marque connue de clé de production — et ne prétend rien de plus.
const MOTS_DE_PROD = ["PROD", "PRODUCTION", "LIVE"];
const MARQUES_DE_PROD = [/^[sr]k_live_/];

export type Secrets = {
  // Ce qui s'ajoute à l'environnement du setup, du cook et des gates.
  env: Record<string, string>;
  // Remplace chaque valeur par `[secret:NOM]` dans un texte gardé ou publié.
  masquer(texte: string): string;
  // Les variables dont le texte porte la valeur.
  fuites(texte: string): string[];
};

// `problemes` : pourquoi rien n'est lancé — des noms, jamais une valeur.
export type SecretsLus = ({ pret: true } & Secrets) | { pret: false; problemes: string[] };

const AUCUN: Secrets = { env: {}, masquer: (texte) => texte, fuites: () => [] };

const reel = (chemin: string) => (existsSync(chemin) ? realpathSync(chemin) : resolve(chemin));
const dans = (repertoire: string, fichier: string) => {
  const chemin = relative(reel(repertoire), fichier);
  return chemin === "" || (!chemin.startsWith("..") && !isAbsolute(chemin));
};

// Pourquoi le fichier de valeurs ne peut pas être lu, ou null.
function defautDuFichier(fichier: string): string | null {
  let mode: number;
  try {
    mode = statSync(fichier).mode;
  } catch {
    return "est illisible ou absent";
  }
  return (mode & 0o077) === 0 ? null : "est lisible par d'autres que le compte du service — ce sont les secrets du projet : chmod 600";
}

// Lit `BRIGADE_SECRETS_FILE` : le fichier de la machine qui porte les valeurs
// des secrets du projet. Sans la variable, null : le projet n'en a pas. Seul
// le chemin est retenu — le contenu se relit à chaque lancement.
export function configSecrets(env: Record<string, string | undefined>, lieux: { repertoireEtat: string; clone: string }): string | null {
  const fichier = env.BRIGADE_SECRETS_FILE;
  if (!fichier) return null;
  const refuser = (pourquoi: string): never => {
    throw new ConfigInvalide(`BRIGADE_SECRETS_FILE invalide : « ${fichier} » ${pourquoi}`);
  };
  if (!isAbsolute(fichier)) refuser("n'est pas un chemin absolu");
  const defaut = defautDuFichier(fichier);
  if (defaut !== null) refuser(defaut);
  // Ni dans ce que `sauvegarder` emporte, ni dans un worktree, ni dans ce qui
  // se commite.
  if (dans(lieux.repertoireEtat, reel(fichier)) || dans(lieux.clone, reel(fichier))) {
    refuser("doit être hors de BRIGADE_STATE_DIR et de BRIGADE_REPO_DIR — ni sauvegardé avec l'état, ni à portée d'un commit");
  }
  return fichier;
}

type Declaration = { noms: string[]; problemes: string[] };

function lireDeclaration(worktree: string): Declaration | null {
  let contenu: string;
  try {
    contenu = readFileSync(join(worktree, DECLARATION), "utf8");
  } catch {
    return null;
  }
  const declaration: Declaration = { noms: [], problemes: [] };
  contenu.split("\n").forEach((brute, rang) => {
    const nom = brute.trim();
    if (nom === "" || nom.startsWith("#") || declaration.noms.includes(nom)) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) {
      declaration.problemes.push(`ligne ${rang + 1} de \`${DECLARATION}\` : ce n'est pas un nom de variable — attendu un nom par ligne, sans valeur`);
    } else if (NOMS_RESERVES.includes(nom) || PREFIXES_RESERVES.some((prefixe) => nom.startsWith(prefixe))) {
      declaration.problemes.push(`\`${nom}\` : nom réservé au runtime (${PREFIXES_RESERVES.map((prefixe) => `${prefixe}*`).join(", ")}, ${NOMS_RESERVES.join(", ")}) — il ne se déclare pas dans \`${DECLARATION}\``);
    } else if (nom.toUpperCase().split("_").some((mot) => MOTS_DE_PROD.includes(mot))) {
      declaration.problemes.push(`\`${nom}\` : le nom dit la production — aucun secret de production n'entre sur la box, quel que soit le grant`);
    } else {
      declaration.noms.push(nom);
    }
  });
  return declaration;
}

// Les valeurs de la machine : `NOM=valeur`, une par ligne. Un `export ` devant
// et une paire de guillemets autour sont retirés ; rien n'est interpolé.
function lireValeurs(fichier: string): { valeurs: Map<string, string> } | { probleme: string } {
  const defaut = defautDuFichier(fichier);
  if (defaut !== null) return { probleme: `${fichier} ${defaut}` };
  let contenu: string;
  try {
    contenu = readFileSync(fichier, "utf8");
  } catch {
    return { probleme: `${fichier} est illisible ou absent` };
  }
  const valeurs = new Map<string, string>();
  const lignes = contenu.split("\n");
  for (const [rang, brute] of lignes.entries()) {
    const ligne = brute.replace(/\r$/, "").trim();
    if (ligne === "" || ligne.startsWith("#")) continue;
    const [, nom, valeur] = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(ligne) ?? [];
    // Sans citer la ligne : elle porte peut-être une valeur.
    if (nom === undefined || valeur === undefined) return { probleme: `${fichier}, ligne ${rang + 1} : illisible — attendu NOM=valeur` };
    const [, , entre] = /^(["'])(.*)\1$/.exec(valeur) ?? [];
    valeurs.set(nom, entre ?? valeur);
  }
  return { valeurs };
}

function masque(env: Record<string, string>): Pick<Secrets, "masquer" | "fuites"> {
  // Chaque valeur, et la forme qu'elle prend dans un flux JSON. La plus longue
  // d'abord : une valeur qui en contient une autre est masquée entière.
  const formes = Object.entries(env)
    .flatMap(([nom, valeur]) => [...new Set([valeur, JSON.stringify(valeur).slice(1, -1)])].map((forme) => ({ nom, forme })))
    .sort((a, b) => b.forme.length - a.forme.length);
  return {
    masquer: (texte) => formes.reduce((reste, { nom, forme }) => reste.replaceAll(forme, `[secret:${nom}]`), texte),
    fuites: (texte) => Object.keys(env).filter((nom) => formes.some((forme) => forme.nom === nom && texte.includes(forme.forme))),
  };
}

// Les secrets du worktree : ce que sa branche déclare, avec les valeurs que la
// machine détient à cet instant. `fichier` : celui de `BRIGADE_SECRETS_FILE`,
// ou null. Au moindre problème, rien n'est rendu : aucun process ne part avec
// la moitié de ses secrets.
export function lireSecrets(worktree: string, fichier: string | null): SecretsLus {
  const declaration = lireDeclaration(worktree);
  if (declaration === null || (declaration.noms.length === 0 && declaration.problemes.length === 0)) return { pret: true, ...AUCUN };
  const problemes = [...declaration.problemes];
  const citer = (noms: string[]) => noms.map((nom) => `\`${nom}\``).join(", ");
  if (declaration.noms.length === 0) return { pret: false, problemes };
  if (fichier === null) {
    return { pret: false, problemes: [...problemes, `BRIGADE_SECRETS_FILE n'est pas défini : la machine ne détient aucune valeur pour ${citer(declaration.noms)}`] };
  }
  const lues = lireValeurs(fichier);
  if ("probleme" in lues) return { pret: false, problemes: [...problemes, lues.probleme] };
  const env: Record<string, string> = {};
  for (const nom of declaration.noms) {
    const valeur = lues.valeurs.get(nom);
    if (valeur === undefined) problemes.push(`\`${nom}\` : aucune valeur dans ${fichier}`);
    else if (valeur.length < LONGUEUR_MIN) {
      problemes.push(`\`${nom}\` : valeur de moins de ${LONGUEUR_MIN} caractères — ce n'est pas un secret, et la masquer rongerait les comptes-rendus : une configuration s'exporte depuis \`${SCRIPT_SETUP}\``);
    } else if (MARQUES_DE_PROD.some((marque) => marque.test(valeur))) {
      problemes.push(`\`${nom}\` : la valeur porte la marque d'une clé de production — aucun secret de production n'entre sur la box, quel que soit le grant`);
    } else env[nom] = valeur;
  }
  return problemes.length > 0 ? { pret: false, problemes } : { pret: true, env, ...masque(env) };
}
