// Ce que la cuisine répare seule avant de déclarer un blocage (#1393) : un
// `.env` absent alors que son `.env.example` est là, un gestionnaire de
// paquets que le dépôt exige (il le dit par son fichier de verrou) et que la
// station n'a pas, les hôtes que le setup joint et que la liste réseau ne nomme
// pas. Ce dernier, le chef l'a voulu fait seule : la cuisine ouvre l'hôte à la
// porte, par le journal (`repair.network`), sans toucher `.claude/brigade/reseau`
// — fichier que la pass tient pour sensible, et que la porte lit à la base. Un
// hôte ouvert ainsi vaut pour les cooks suivants, secrets de dev compris : la
// phrase du journal le dit, pour que le chef le déclare sur la base ou le
// retire.
//
// Chaque réparation faite s'écrit au journal du projet (`repair.done`, une
// phrase) et lève le blocage qu'elle avait pu poser. Une réparation impossible
// pose un blocage (`installation/blocages`), en une phrase de cause. Rien ici
// ne demande de droits : tout se fait dans le worktree ou dans le dossier de
// l'utilisateur.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { SCRIPT_SETUP } from "../../gates.ts";
import type { Journal } from "../../journal.ts";
import { autorise, DECLARATION_RESEAU, lireDeclaration, reglesDuProjet } from "../../reseau.ts";
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

// Une réparation faite (`leve` : le blocage qu'elle rend caduc ; `hotes` : ceux
// qu'elle ouvre à la porte) ou un blocage à poser.
type Etape = { reparation: string; phrase: string; leve: string; hotes?: string[] } | { blocage: { id: string; message: string; cause: string; detail?: string } };

function reparerLesEnv(demande: Demande): Etape[] {
  return envsAbsents(demande.dossier).map((exemple): Etape => {
    const cible = join(dirname(join(demande.dossier, exemple)), ".env");
    const chemin = relative(demande.dossier, cible).replaceAll("\\", "/");
    try {
      copyFileSync(join(demande.dossier, exemple), cible);
      return { reparation: `env:${chemin}`, phrase: `Created \`${chemin}\` from \`${exemple.replaceAll("\\", "/")}\`, which the setup needs.`, leve: `repair:env:${chemin}` };
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
        etapes.push({ reparation: `package-manager:${gestionnaire}`, phrase: `Installed \`${gestionnaire}\` in \`${prefixe}\` without sudo, as the repository's lockfile requires it.`, leve: `need:${gestionnaire}` });
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

// Les hôtes que le setup du dépôt joint et que la liste du projet ne nomme pas :
// ce que la porte connaît (sa dernière déclaration au journal, hôtes déjà
// ouverts compris) ou, sans porte, le fichier du worktree. Ils s'ouvrent seuls.
function reparerLeReseau(demande: Demande): Etape[] {
  const script = join(demande.dossier, SCRIPT_SETUP);
  if (!existsSync(script)) return [];
  const fichier = join(demande.dossier, DECLARATION_RESEAU);
  try {
    const declares = demande.journal.duType("network.declared", 1)[0]?.payload.hosts ?? lireDeclaration(existsSync(fichier) ? readFileSync(fichier, "utf8") : "").hotes;
    const regles = reglesDuProjet(declares);
    const joints = deduireLesHotes(readFileSync(script, "utf8")).hotes.map(({ hote }) => hote);
    const manquants = lireDeclaration(joints.filter((hote) => !autorise(regles, hote.split(":")[0]!, Number(hote.split(":")[1] ?? 443))).join("\n")).hotes;
    if (manquants.length === 0) return [];
    const noms = manquants.map((hote) => `\`${hote}\``).join(", ");
    return [
      {
        reparation: "network",
        phrase: `Opened ${noms} to the project's cooks, which the setup reaches and the network list did not name. Nothing is written in \`${DECLARATION_RESEAU}\`: declare ${manquants.length > 1 ? "them" : "it"} there, on the integration base, to keep ${manquants.length > 1 ? "them" : "it"} open.`,
        leve: "repair:network",
        hotes: manquants,
      },
    ];
  } catch (erreur) {
    return [{ blocage: { id: "repair:network", message: "The setup reaches hosts the station could not compare with the network list.", cause: `Reading \`${DECLARATION_RESEAU}\` or the setup failed.`, detail: dit(erreur) } }];
  }
}

// Ouvre ces hôtes à la porte : un fait `repair.network`, que `brancherReseau`
// joint à chaque déclaration de la base, et — s'il y en a une — la déclaration
// que la porte lit, republiée aussitôt, avant que le setup ne parte.
function ouvrirLesHotes(journal: Journal, auteur: Auteur, hotes: string[]): void {
  journal.base.transaction(() => {
    journal.ajouter({ project: auteur.projet, ticket: null, author: auteur.auteur, type: "repair.network", payload: { hosts: hotes } });
    const declaree = journal.duType("network.declared", 1)[0]?.payload;
    if (declaree === undefined) return;
    const hosts = [...declaree.hosts, ...hotes.filter((hote) => !declaree.hosts.includes(hote))];
    journal.ajouter({ project: auteur.projet, ticket: null, author: auteur.auteur, type: "network.declared", payload: { ...declaree, hosts } });
  });
}

// Joue les trois réparations, avant que le setup ne soit joué. Consigne au
// journal chaque réparation faite, pose un blocage pour chaque impossible, et
// lève ceux d'une réparation qui désormais passe.
export async function reparer(demande: Demande): Promise<Resultat> {
  const { journal, auteur } = demande;
  const bins: string[] = [];
  const etapes = [...reparerLesEnv(demande), ...(await reparerLeGestionnaire(demande, bins)), ...reparerLeReseau(demande)];
  const resultat: Resultat = { reparations: [], blocages: [], bins };
  // Une liste réseau de nouveau lisible : le blocage qu'elle avait posé est levé.
  if (!etapes.some((etape) => "blocage" in etape && etape.blocage.id === "repair:network")) leverBlocage(journal, auteur, "repair:network");
  for (const etape of etapes) {
    if ("reparation" in etape) {
      if (etape.hotes !== undefined) ouvrirLesHotes(journal, auteur, etape.hotes);
      journal.ajouter({ project: auteur.projet, ticket: null, author: auteur.auteur, type: "repair.done", payload: { repair: etape.reparation, sentence: etape.phrase } });
      resultat.reparations.push(etape.phrase);
      leverBlocage(journal, auteur, etape.leve);
    } else {
      poserBlocage(journal, auteur, etape.blocage);
      resultat.blocages.push(etape.blocage.id);
    }
  }
  return resultat;
}
