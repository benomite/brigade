// Ce que la cuisine répare seule avant de déclarer un blocage (#1393) : un
// `.env` absent alors que son `.env.example` est là, un gestionnaire de
// paquets que le dépôt exige (il le dit par son fichier de verrou) et que la
// station n'a pas, les hôtes que le setup joint et que `.claude/brigade/reseau`
// ne déclare pas.
//
// Chaque réparation faite s'écrit au journal du projet (`repair.done`, une
// phrase) et lève le blocage qu'elle avait pu poser. Une réparation impossible
// pose un blocage (`installation/blocages`), en une phrase de cause. Rien ici
// ne demande de droits : tout se fait dans le worktree ou dans le dossier de
// l'utilisateur.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { SCRIPT_SETUP } from "../../gates.ts";
import type { Journal } from "../../journal.ts";
import { DECLARATION_RESEAU, lireDeclaration } from "../../reseau.ts";
import { deduireLesHotes } from "../../reseau-cli.ts";
import { execFile } from "../../sans-invite.ts";
import { leverBlocage, poserBlocage, type Auteur } from "../blocages/blocages.ts";

const execFileAsync = promisify(execFile);

// Les dossiers où l'on ne cherche pas de `.env.example`.
const IGNORES = new Set([".git", "node_modules", ".brigade-state", "dist", "build", ".next", "vendor"]);
const PROFONDEUR_MAX = 6;

// Le gestionnaire que réclame un fichier de verrou, et le paquet npm qui l'installe.
const VERROUS: { fichier: string; gestionnaire: string }[] = [
  { fichier: "pnpm-lock.yaml", gestionnaire: "pnpm" },
  { fichier: "yarn.lock", gestionnaire: "yarn" },
];

// Ce que les réparations demandent au système, remplaçable par un test.
export type Systeme = {
  // La commande est-elle sur le PATH ?
  disponible: (commande: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
  // Installe un gestionnaire dans le dossier `prefixe`, sans droits. Lève s'il échoue.
  installer: (gestionnaire: string, prefixe: string, env: NodeJS.ProcessEnv) => Promise<void>;
};

export const systemeReel: Systeme = {
  async disponible(commande, env) {
    try {
      await execFileAsync(commande, ["--version"], { env, timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  },
  async installer(gestionnaire, prefixe, env) {
    await execFileAsync("npm", ["install", "--global", "--prefix", prefixe, gestionnaire], { env, timeout: 300_000 });
  },
};

export type Demande = {
  // Le worktree (ou le clone) à réparer.
  dossier: string;
  journal: Journal;
  auteur: Auteur;
  env?: NodeJS.ProcessEnv;
  // Où va un gestionnaire installé : `<prefixe>/bin`. Par défaut `~/.local`.
  prefixe?: string;
  systeme?: Systeme;
};

export type Resultat = {
  // Une phrase par réparation faite.
  reparations: string[];
  // Les identifiants des blocages posés.
  blocages: string[];
  // Les dossiers `bin` où un gestionnaire vient d'être installé : à mettre en
  // tête du PATH de ce qui suit, le setup d'abord.
  bins: string[];
};

// Le PATH d'un environnement, avec ces dossiers en tête.
export function avecLesBins(env: NodeJS.ProcessEnv, bins: string[]): NodeJS.ProcessEnv {
  return bins.length === 0 ? env : { ...env, PATH: [...bins, env.PATH ?? ""].filter(Boolean).join(delimiter) };
}

const dit = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]!.slice(0, 200);

// Les `.env.example` du dépôt dont le `.env` voisin manque, en chemins relatifs.
export function envsAbsents(dossier: string): string[] {
  const trouves: string[] = [];
  const parcourir = (courant: string, profondeur: number) => {
    let entrees;
    try {
      entrees = readdirSync(courant, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entree of entrees) {
      if (entree.isDirectory()) {
        if (profondeur < PROFONDEUR_MAX && !IGNORES.has(entree.name)) parcourir(join(courant, entree.name), profondeur + 1);
      } else if (entree.name === ".env.example" && !existsSync(join(courant, ".env"))) {
        trouves.push(relative(dossier, join(courant, entree.name)));
      }
    }
  };
  parcourir(dossier, 0);
  return trouves.sort();
}

export type Etape = { reparation: string; phrase: string } | { blocage: { id: string; message: string; cause: string; detail?: string } } | null;

function reparerLesEnv(demande: Demande): Etape[] {
  return envsAbsents(demande.dossier).map((exemple): Etape => {
    const cible = join(dirname(join(demande.dossier, exemple)), ".env");
    const chemin = relative(demande.dossier, cible).replaceAll("\\", "/");
    try {
      copyFileSync(join(demande.dossier, exemple), cible);
      return { reparation: `env:${chemin}`, phrase: `Created \`${chemin}\` from \`${exemple.replaceAll("\\", "/")}\`, which the setup needs.` };
    } catch (erreur) {
      return {
        blocage: {
          id: `repair:env:${chemin}`,
          message: `\`${chemin}\` is missing and the station could not create it.`,
          cause: `Copying \`${exemple.replaceAll("\\", "/")}\` to \`${chemin}\` failed.`,
          detail: dit(erreur),
        },
      };
    }
  });
}

async function reparerLeGestionnaire(demande: Demande, bins: string[]): Promise<Etape[]> {
  const systeme = demande.systeme ?? systemeReel;
  const prefixe = demande.prefixe ?? join(homedir(), ".local");
  const requis = VERROUS.filter(({ fichier }) => existsSync(join(demande.dossier, fichier))).map(({ gestionnaire }) => gestionnaire);
  const etapes: Etape[] = [];
  for (const gestionnaire of requis) {
    const env = { ...(demande.env ?? process.env) };
    if (await systeme.disponible(gestionnaire, env)) continue;
    const bin = join(prefixe, "bin");
    env.PATH = [bin, env.PATH ?? ""].filter(Boolean).join(delimiter);
    let cause: string;
    try {
      mkdirSync(prefixe, { recursive: true });
      await systeme.installer(gestionnaire, prefixe, env);
      if (await systeme.disponible(gestionnaire, env)) {
        if (!bins.includes(bin)) bins.push(bin);
        etapes.push({ reparation: `package-manager:${gestionnaire}`, phrase: `Installed \`${gestionnaire}\` in \`${prefixe}\` without sudo, as the repository's lockfile requires it.` });
        continue;
      }
      cause = `Installed under \`${bin}\`, it still does not run.`;
    } catch (erreur) {
      etapes.push({
        blocage: {
          id: `need:${gestionnaire}`,
          message: `The repository needs \`${gestionnaire}\`, which this station does not have.`,
          cause: `Installing \`${gestionnaire}\` without sudo failed.`,
          detail: dit(erreur),
        },
      });
      continue;
    }
    etapes.push({ blocage: { id: `need:${gestionnaire}`, message: `The repository needs \`${gestionnaire}\`, which this station does not have.`, cause } });
  }
  return etapes;
}

// Les hôtes que le setup du dépôt joint et que sa déclaration ne nomme pas,
// ajoutés à `.claude/brigade/reseau`.
function reparerLeReseau(demande: Demande): Etape[] {
  const script = join(demande.dossier, SCRIPT_SETUP);
  if (!existsSync(script)) return [];
  const fichier = join(demande.dossier, DECLARATION_RESEAU);
  const impossible = (erreur: unknown): Etape[] => [{ blocage: { id: "repair:network", message: "The setup reaches hosts the network list does not name, and the station could not complete it.", cause: `Reading or writing \`${DECLARATION_RESEAU}\` failed.`, detail: dit(erreur) } }];
  let declare: string;
  let manquants;
  try {
    declare = existsSync(fichier) ? readFileSync(fichier, "utf8") : "";
    const deja = lireDeclaration(declare).hotes;
    manquants = deduireLesHotes(readFileSync(script, "utf8")).hotes.filter(({ hote }) => !deja.includes(hote));
  } catch (erreur) {
    return impossible(erreur);
  }
  if (manquants.length === 0) return [];
  const lignes = manquants.flatMap(({ hote, ligne }) => [`# ${hote} ← ${ligne.slice(0, 100)}`, hote]);
  try {
    mkdirSync(dirname(fichier), { recursive: true });
    const base = declare === "" || declare.endsWith("\n") ? declare : `${declare}\n`;
    writeFileSync(fichier, `${base}${lignes.join("\n")}\n`);
  } catch (erreur) {
    return impossible(erreur);
  }
  const noms = manquants.map(({ hote }) => hote).join(", ");
  return [{ reparation: "network", phrase: `Added ${noms} to \`${DECLARATION_RESEAU}\`, which the setup reaches.` }];
}


// Joue les trois réparations, avant que le setup ne soit joué. Consigne au
// journal chaque réparation faite, pose un blocage pour chaque impossible, et
// lève ceux d'une réparation qui désormais passe.
export async function reparer(demande: Demande): Promise<Resultat> {
  const { journal, auteur } = demande;
  const bins: string[] = [];
  const etapes = [...reparerLesEnv(demande), ...(await reparerLeGestionnaire(demande, bins)), ...reparerLeReseau(demande)];
  const resultat: Resultat = { reparations: [], blocages: [], bins };
  for (const etape of etapes) {
    if (etape === null) continue;
    if ("reparation" in etape) {
      journal.ajouter({ project: auteur.projet, ticket: null, author: auteur.auteur, type: "repair.done", payload: { repair: etape.reparation, sentence: etape.phrase } });
      resultat.reparations.push(etape.phrase);
      // Un blocage que cette réparation vient de rendre caduc.
      const id = etape.reparation.startsWith("package-manager:") ? `need:${etape.reparation.slice("package-manager:".length)}` : etape.reparation === "network" ? "repair:network" : `repair:${etape.reparation}`;
      leverBlocage(journal, auteur, id);
    } else {
      poserBlocage(journal, auteur, etape.blocage);
      resultat.blocages.push(etape.blocage.id);
    }
  }
  return resultat;
}
