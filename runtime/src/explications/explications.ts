// Les explications des mots de la cuisine (#3308, épique #3304) : la première
// fois que le chef rencontre l'un des six mots — rail, pass, cook, second, TODO,
// WAITING — dans l'app, une ligne l'explique à côté de lui. Ce registre retient,
// chef par chef, les mots dont il a vu ou écarté l'explication : il vit ici, côté
// runtime, pour valoir sur chacun de ses appareils — son Mac, son PC, son
// téléphone lisent le même —, et non dans le stockage d'un seul.
//
// Ce que l'app appelle, par la commande `explanations` (`commande.ts`) :
//   vues(chef)          les mots dont ce chef a vu ou écarté l'explication
//   marquer(chef, mot)  en ajoute un ; rend les mots vus
//   effacer(chef)       les oublie tous : chaque explication se montre de nouveau
//
// Le chef est nommé par son compte GitHub, sans tenir compte de la casse, comme
// GitHub. Le registre vit dans le répertoire d'état du projet
// (`explanations.json`). Chaque écriture relit le fichier et le réécrit d'un
// coup (`.tmp` puis renommage). Un fichier illisible lève
// `ExplicationsIllisibles` : rien ne le réécrit à sa place.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Les six mots, dans l'ordre où le registre les rend.
export const MOTS_EXPLIQUES = ["rail", "pass", "cook", "second", "TODO", "WAITING"] as const;
export type MotExplique = (typeof MOTS_EXPLIQUES)[number];

export const FICHIER_DES_EXPLICATIONS = "explanations.json";

// Un compte GitHub : lettres, chiffres et tirets, 39 au plus, sans tiret en tête.
const COMPTE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

export class ExplicationsIllisibles extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplicationsIllisibles";
  }
}

// Une demande que le registre refuse : un chef qui n'est pas un compte GitHub, un mot qui n'est pas l'un des six.
export class ExplicationRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExplicationRefusee";
  }
}

export type RegistreDesExplications = {
  vues(chef: string): MotExplique[];
  marquer(chef: string, mot: string): MotExplique[];
  effacer(chef: string): void;
};

type Fichier = { chefs: Record<string, MotExplique[]> };

export const cheminDesExplications = (repertoireEtat: string) => join(repertoireEtat, FICHIER_DES_EXPLICATIONS);

const estUnMot = (mot: unknown): mot is MotExplique => typeof mot === "string" && (MOTS_EXPLIQUES as readonly string[]).includes(mot);
const dansLOrdre = (mots: Iterable<MotExplique>) => {
  const vus = new Set(mots);
  return MOTS_EXPLIQUES.filter((mot) => vus.has(mot));
};

function cleDu(chef: string): string {
  if (!COMPTE.test(chef)) throw new ExplicationRefusee(`“${chef}” is not a GitHub account`);
  return chef.toLowerCase();
}

function lire(chemin: string): Fichier {
  let texte: string;
  try {
    texte = readFileSync(chemin, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { chefs: {} };
    throw new ExplicationsIllisibles(`${FICHIER_DES_EXPLICATIONS} cannot be read: ${(erreur as Error).message}`);
  }
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ExplicationsIllisibles(`${FICHIER_DES_EXPLICATIONS} is not JSON`);
  }
  const chefs = typeof brut === "object" && brut !== null ? (brut as { chefs?: unknown }).chefs : undefined;
  if (typeof chefs !== "object" || chefs === null || Array.isArray(chefs)) throw new ExplicationsIllisibles(`${FICHIER_DES_EXPLICATIONS} does not read as {chefs: {<login>: [<word>…]}}`);
  const lus: Record<string, MotExplique[]> = {};
  for (const [chef, mots] of Object.entries(chefs)) {
    if (!Array.isArray(mots) || !mots.every(estUnMot)) throw new ExplicationsIllisibles(`${FICHIER_DES_EXPLICATIONS}: the words of ${chef} are not among ${MOTS_EXPLIQUES.join(", ")}`);
    lus[chef] = dansLOrdre(mots);
  }
  return { chefs: lus };
}

function ecrire(repertoireEtat: string, fichier: Fichier): void {
  mkdirSync(repertoireEtat, { recursive: true });
  const chemin = cheminDesExplications(repertoireEtat);
  writeFileSync(`${chemin}.tmp`, `${JSON.stringify(fichier, null, 2)}\n`);
  renameSync(`${chemin}.tmp`, chemin);
}

export function ouvrirExplications(repertoireEtat: string): RegistreDesExplications {
  const chemin = cheminDesExplications(repertoireEtat);
  return {
    vues(chef) {
      return lire(chemin).chefs[cleDu(chef)] ?? [];
    },
    marquer(chef, mot) {
      const cle = cleDu(chef);
      if (!estUnMot(mot)) throw new ExplicationRefusee(`“${mot}” is not one of the explained words: ${MOTS_EXPLIQUES.join(", ")}`);
      const fichier = lire(chemin);
      const vus = dansLOrdre([...(fichier.chefs[cle] ?? []), mot]);
      ecrire(repertoireEtat, { chefs: { ...fichier.chefs, [cle]: vus } });
      return vus;
    },
    effacer(chef) {
      const cle = cleDu(chef);
      const fichier = lire(chemin);
      if (!(cle in fichier.chefs)) return;
      const { [cle]: _oublie, ...autres } = fichier.chefs;
      ecrire(repertoireEtat, { chefs: autres });
    },
  };
}
